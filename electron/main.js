// Pip's main process.
//
// One window: the notch (transparent, always on top, click-through except
// where Pip and the pill are). Settings live in a panel inside the notch.
//
// CPU budget: while a game or any fullscreen app is in front, Pip hides and
// stops everything (animation, cursor tracking, event tailing). The only thing
// left is a ~0.5 ms Win32 check every 3 seconds.

const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const store = require("./store");
const hooks = require("./hooks");
const gamemode = require("./gamemode");
const updater = require("./updater");
const windows = require("./windows");
const { createRoamer } = require("./roam");

app.setName("Pip");
app.setAppUserModelId("dev.local.pip");
if (!app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const W = 640;
const H = 600;       // tallest the notch window ever gets (settings panel + bubbles)
// The window is only as tall as what Pip is drawing: a transparent window costs
// CPU in proportion to its area on every frame, so small most of the time.
let winH = 128;
const DEV = !app.isPackaged && process.env.PIP_DEV === "1";
const ICON = path.join(__dirname, "..", "build", "icon.png");
const STARTUP_LNK = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Pip.lnk");

let notch = null;
let tray = null;
let hitRects = [];
let solid = false;
let focusable = false;
let gaming = false;
let userPaused = false;
let away = false;
// The process of a session waiting on you, so the tray can offer the jump too.
let waitingPid = 0;
let demoRunning = false;
const timers = {};

const tail = hooks.createTail();
const context = require("./context");

/** Each event that names a transcript carries how full that context is (`ctx`), for the RAM gauge. */
function withContext(events) {
  for (const e of events) {
    if (!e || !e.tp) continue;
    const c = context.of(e.tp);
    if (c) e.ctx = c;
  }
  return events;
}

/**
 * Is the terminal a session runs in behind something else right now? For the
 * holocall: Claude finished while you were looking elsewhere. Anything unknown
 * (no pid, no window, Pip itself in front) counts as no, so it never rings for nothing.
 */
function sessionAway(pid) {
  if (!pid) return false;
  const fg = windows.activeWindow(app.getAppMetrics().map((m) => m.pid));
  const term = windows.windowFor(pid);
  return !!(fg && term && fg.pid !== term.pid);
}
const send = (channel, payload) => { if (notch && !notch.isDestroyed()) notch.webContents.send(channel, payload); };

// Pip out on the desktop (electron/roam.js), and where it sits in the notch, as
// the renderer last said: the spot it hops out of and back into.
let roamer = null;
let roamHome = { x: W / 2, y: 26, r: 13 };

function load(win) {
  if (DEV) return win.loadURL("http://localhost:5173/index.html");
  // PIP_DEBUG=1 exposes the engine to DevTools for manual testing.
  return win.loadFile(path.join(__dirname, "..", "dist", "index.html"), process.env.PIP_DEBUG === "1" ? { query: { debug: "1" } } : undefined);
}

// The display Pip lives on, by id rather than by object: a display's workArea
// changes under it (a taskbar moving, a resolution change) and an unplugged
// screen simply stops being in the list, which falls back to primary on its own.
let homeId = null;

/**
 * The screen you are actually working on, which is the one holding the window
 * in the foreground. Windows' "primary" display is a setting somebody picked
 * once, not a fact about where you are looking, so Pip follows the work.
 *
 * Pip's own pids are excluded or the notch would anchor itself wherever it
 * already was, every time you opened Settings.
 */
function activeDisplay() {
  const fg = windows.activeWindow(app.getAppMetrics().map((m) => m.pid));
  return fg ? screen.getDisplayNearestPoint({ x: fg.cx, y: fg.cy }) : screen.getPrimaryDisplay();
}

/** The screen you pinned Pip to in Settings, if it is still plugged in. */
function pinnedDisplay() {
  const pin = store.settings.get().screen;
  if (pin === "follow") return null;
  return screen.getAllDisplays().find((d) => d.id === pin) || null;
}

/** Where the notch should be: the pinned screen, else wherever you are working. */
function targetDisplay() { return pinnedDisplay() || activeDisplay(); }

/** The screens Pip can see, for the picker in Settings. */
function displayList() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    name: d.label || `Screen ${i + 1}`,
    size: `${d.size.width}×${d.size.height}`,
    primary: d.id === primary,
  }));
}

/** The work area Pip is placed in, resolved fresh every time. */
function homeArea() {
  const found = screen.getAllDisplays().find((d) => d.id === homeId);
  return (found || screen.getPrimaryDisplay()).workArea;
}

// ── where along the top: the notch can be dragged left and right ─────────────

const DRAG_FROM = 4;  // px of travel before a press counts as a drag
const SNAP = 24;      // px from the middle that snaps back to it
let drag = null;      // while the button is held: see the "drag-start" handler

/** The notch's spot along the top, as a fraction of the width (0.5 = middle). */
function notchAt() {
  if (drag && drag.moved) return drag.at;
  const at = Number(store.settings.get().notchX);
  return Number.isFinite(at) ? Math.min(1, Math.max(0, at)) : 0.5;
}

/** The window's left edge for a spot, kept wholly inside the work area. */
function notchLeft(workArea, at = notchAt()) {
  const x = workArea.x + at * workArea.width - W / 2;
  return Math.round(Math.min(workArea.x + workArea.width - W, Math.max(workArea.x, x)));
}

function setNotchBounds(workArea, left) {
  notch.setBounds({ x: left, y: workArea.y, width: W, height: winH });
}

function placeNotch() {
  const workArea = homeArea();
  setNotchBounds(workArea, notchLeft(workArea));
}

/**
 * Follow the cursor while the button is held, then tell the renderer whether
 * that press was a drag or just a click. Polled, not evented: the button can
 * come up anywhere on screen, and the window may not hear it.
 */
function dragTick() {
  if (!drag || !notch || notch.isDestroyed()) { drag = null; return; }
  const dx = screen.getCursorScreenPoint().x - drag.x0;
  if (!drag.moved && Math.abs(dx) >= DRAG_FROM) drag.moved = true;
  if (drag.moved) {
    // Measured on the screen the drag started on, even if Pip's home changes.
    const area = drag.area;
    const centre = drag.left0 + dx + W / 2 - area.x;
    const at = Math.abs(centre - area.width / 2) < SNAP ? 0.5 : centre / area.width;
    drag.at = Math.min(1, Math.max(0, at));
    const left = notchLeft(area);
    // Held still, or pinned against an edge: nothing to move.
    if (left !== drag.left) { drag.left = left; setNotchBounds(area, left); }
  }
  const held = !drag.released && (drag.polled ? windows.buttonDown() : Date.now() - drag.t0 < 15000);
  if (held) { timers.drag = setTimeout(dragTick, 16); return; }
  endDrag();
}

/**
 * Settle the press: save where a drag left the notch and tell the renderer.
 * Every "drag-start" gets exactly one "drag-end", in order. `cancel` (Pip is
 * going to sleep) puts the notch back and counts as a drag, so nothing fires.
 */
function endDrag(cancel = false) {
  clearTimeout(timers.drag);
  const { moved, at } = drag;
  drag = null;
  if (cancel) { if (notch && !notch.isDestroyed()) placeNotch(); }
  else if (moved) store.settings.set({ notchX: at });
  send("drag-end", { moved: moved || cancel });
  if (moved && !cancel) send("state", publicState());
}

/**
 * Follow the work between screens. Two cheap Win32 calls, and it only touches
 * the window when the display actually changes, so alt-tabbing around one
 * screen costs nothing. Off entirely while suspended, like every other timer.
 */
function screenTick() {
  // Not mid-drag: the notch would jump screens under your hand.
  if (notch && !notch.isDestroyed() && !drag) {
    const d = targetDisplay();
    if (d && d.id !== homeId) { homeId = d.id; placeNotch(); }
  }
  timers.screen = setTimeout(screenTick, 1200);
}

function createNotch() {
  notch = new BrowserWindow({
    width: W, height: winH, transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
    hasShadow: false, focusable: false, alwaysOnTop: true, show: false, backgroundColor: "#00000000",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, backgroundThrottling: false },
  });
  placeNotch();
  notch.setAlwaysOnTop(true, "screen-saver");
  notch.setIgnoreMouseEvents(true, { forward: true });
  load(notch);
  notch.once("ready-to-show", () => notch.showInactive());
  notch.webContents.on("did-finish-load", () => {
    tail.seekTail();
    send("events", { events: withContext(tail.pump()), replay: true });
    send("state", publicState());
  });
  notch.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  notch.webContents.on("will-navigate", (e) => e.preventDefault());
}

// ── click-through & hover: the main process tracks the cursor ────────────────
// Fast when the cursor is near the notch, slow otherwise, off while hidden.

function cursorTick() {
  if (!notch || notch.isDestroyed() || !notch.isVisible()) return;
  const b = notch.getBounds();
  const p = screen.getCursorScreenPoint();
  const x = p.x - b.x, y = p.y - b.y;
  const near = x > -60 && y > -60 && x < b.width + 60 && y < b.height + 60;
  const over = hitRects.some((r) => x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h);
  // Stay solid for the whole drag, even where the cursor has slipped off Pip.
  const want = over || focusable || !!drag;
  if (want !== solid) {
    solid = want;
    notch.setIgnoreMouseEvents(!solid, { forward: true });
  }
  if (near) send("cursor", { x, y, over });
  timers.cursor = setTimeout(cursorTick, near ? 40 : 200);
}

// ── are you even there? ──────────────────────────────────────────────────────
// Two Win32 calls every 15 s. When you come back, the renderer tells you what
// you missed.

const AWAY_AFTER = 180; // seconds without a key or a mouse move

function idleTick() {
  const now = windows.idleSeconds() >= AWAY_AFTER;
  if (now !== away) {
    away = now;
    send("away", away);
  }
  timers.idle = setTimeout(idleTick, 15000);
}

// ── game mode ────────────────────────────────────────────────────────────────

function gameTick() {
  const gm = store.settings.get().gameMode;
  const ownPids = app.getAppMetrics().map((m) => m.pid);
  const r = gm.enabled ? gamemode.check({ ownPids, fullscreen: gm.fullscreen, extraExes: gm.extraExes }) : { active: false };
  if (r.active !== gaming) {
    gaming = r.active;
    applyRunState(r);
  }
  timers.game = setTimeout(gameTick, 3000);
}

function suspended() { return gaming || userPaused; }

function applyRunState(info = {}) {
  if (suspended()) {
    clearTimeout(timers.cursor);
    clearTimeout(timers.idle);
    clearTimeout(timers.screen);
    clearInterval(timers.tail);
    if (drag) endDrag(true);
    if (focusable) setFocusable(false);
    send("pause", true);
    if (notch && !notch.isDestroyed()) notch.hide();
    roamer?.suspend();
  } else {
    roamer?.resume();
    if (notch && !notch.isDestroyed()) notch.showInactive();
    send("pause", false);
    // Catch up quietly on whatever happened while hidden.
    send("events", { events: withContext(tail.pump()), replay: true });
    clearInterval(timers.tail);
    timers.tail = setInterval(() => { const ev = withContext(tail.pump()); if (ev.length) send("events", { events: ev, replay: false }); }, 200);
    clearTimeout(timers.cursor);
    cursorTick();
    clearTimeout(timers.idle);
    idleTick();
    clearTimeout(timers.screen);
    screenTick();
  }
  updateTray(info);
  send("state", publicState());
}

// ── startup shortcut ─────────────────────────────────────────────────────────

function startupEnabled() { return fs.existsSync(STARTUP_LNK); }
function setStartup(on) {
  if (on) {
    shell.writeShortcutLink(STARTUP_LNK, "create", {
      target: process.execPath,
      args: app.isPackaged ? "" : `"${path.join(__dirname, "..")}"`,
      cwd: path.dirname(process.execPath),
      description: "Pip, your Claude Code companion",
      icon: app.isPackaged ? process.execPath : ICON,
      iconIndex: 0,
    });
  } else if (fs.existsSync(STARTUP_LNK)) {
    fs.unlinkSync(STARTUP_LNK);
  }
}

// ── tray ─────────────────────────────────────────────────────────────────────

function updateTray(info = {}) {
  if (!tray) return;
  const status = gaming ? `Sleeping: ${info.reason || "game running"}` : userPaused ? "Paused" : "Awake";
  const update = updater.status();
  tray.setToolTip(`Pip · ${status}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Pip · ${status}`, enabled: false },
    { type: "separator" },
    ...(update.status === "ready"
      ? [{ label: `Restart to update to ${update.version}`, click: () => updater.install() }, { type: "separator" }]
      : []),
    ...(waitingPid ? [{ label: "Review what Claude is asking", click: () => windows.focusProcess(waitingPid, homeArea()) }, { type: "separator" }] : []),
    { label: "Activity", click: () => openPanel("inspect") },
    { label: "Settings", click: () => openPanel("settings") },
    { label: demoRunning ? "Stop the demo" : "Demo (play every state)", click: () => send("demo") },
    { label: "Pause Pip", type: "checkbox", checked: userPaused, click: (i) => { userPaused = i.checked; applyRunState(); } },
    { label: "Quit Pip", click: () => app.quit() },
  ]));
}

function createTray() {
  const img = nativeImage.createFromPath(ICON);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
  tray.on("click", () => openPanel("settings"));
  updateTray();
}

// ── panels & focus ───────────────────────────────────────────────────────────

function openPanel(name) {
  if (userPaused) { userPaused = false; applyRunState(); }
  if (!gaming) send("panel", name);
}

/** The settings panel has a text field, so the notch takes focus while it's open. */
function setFocusable(on) {
  focusable = on;
  notch.setFocusable(on);
  if (on) {
    solid = true;
    notch.setIgnoreMouseEvents(false);
    notch.focus();
  } else {
    notch.blur();
  }
}

function publicState() {
  return {
    settings: store.settings.get(),
    hooks: hooks.status(),
    startup: startupEnabled(),
    gaming,
    update: updater.status(),
    version: app.getVersion(),
    displays: displayList(),
  };
}

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.on("hit-rects", (_e, rects) => { hitRects = Array.isArray(rects) ? rects : []; });
ipcMain.on("win-height", (_e, h) => {
  const next = Math.max(64, Math.min(H, Math.round(Number(h) || 0)));
  if (next === winH || !notch || notch.isDestroyed()) return;
  winH = next;
  placeNotch();
});
ipcMain.on("focus", (_e, on) => setFocusable(!!on));
ipcMain.on("drag-start", () => {
  if (!notch || notch.isDestroyed()) { send("drag-end", { moved: false }); return; }
  // A second press before the first was seen to end (a fast double click):
  // settle the first as what it was, so each press still gets its answer.
  if (drag) endDrag();
  drag = {
    x0: screen.getCursorScreenPoint().x,
    left0: notch.getBounds().x,
    area: homeArea(),
    moved: false,
    at: notchAt(),
    left: null,
    // The button is down right now. If Windows won't say so (another desktop,
    // or an elevated window in front), polling can't see the release either:
    // rely on the window hearing it ("drag-stop"), with a 15 s backstop.
    polled: windows.buttonDown(),
    released: false,
    t0: Date.now(),
  };
  dragTick();
});
ipcMain.on("drag-stop", () => { if (drag) drag.released = true; });
ipcMain.on("demo-state", (_e, on) => {
  const next = !!on;
  if (next === demoRunning) return;
  demoRunning = next;
  updateTray();
});
ipcMain.on("waiting", (_e, pid) => {
  const next = Number(pid) || 0;
  if (next === waitingPid) return;
  waitingPid = next;
  updateTray();
});
ipcMain.on("menu", () => {
  Menu.buildFromTemplate([
    { label: "Activity", click: () => send("panel", "inspect") },
    { label: "Settings", click: () => send("panel", "settings") },
    { label: demoRunning ? "Stop the demo" : "Demo (play every state)", click: () => send("demo") },
    { label: "Pause Pip", click: () => { userPaused = true; applyRunState(); } },
    { type: "separator" },
    { label: "Quit Pip", click: () => app.quit() },
  ]).popup({ window: notch });
});
ipcMain.on("quit", () => app.quit());
ipcMain.on("roam-mood", (_e, m) => {
  if (!m || typeof m !== "object") return;
  roamHome = { x: Number(m.x) || roamHome.x, y: Number(m.y) || roamHome.y, r: Number(m.r) || roamHome.r };
  roamer?.setMood(String(m.mood || ""));
});
ipcMain.on("roam-hover", (_e, on) => roamer?.hover(!!on));
ipcMain.on("roam-click", () => roamer?.click());

ipcMain.handle("state", () => publicState());
ipcMain.handle("settings:set", (_e, patch) => {
  store.settings.set(patch);
  // Pinning (or unpinning) moves the notch now, not on the next tick.
  if (patch && "screen" in patch && notch && !notch.isDestroyed()) { homeId = targetDisplay().id; placeNotch(); }
  if (patch && "roam" in patch) roamer?.setEnabled(!!patch.roam);
  if (patch && "look" in patch) roamer?.setLook(store.settings.get().look);
  const s = publicState();
  send("state", s);
  return s;
});
ipcMain.handle("hooks:write", (_e, install) => {
  const r = hooks.write(install);
  send("state", publicState());
  return r;
});
/** Bring the terminal running a session to the front. */
// Carry the terminal onto Pip's screen: raising it on a monitor you are not
// looking at is indistinguishable from not raising it.
ipcMain.handle("session:focus", (_e, pid) => windows.focusProcess(Number(pid) || 0, homeArea()));
ipcMain.handle("session:away", (_e, pid) => { try { return sessionAway(Number(pid) || 0); } catch { return false; } });
ipcMain.handle("update:check", async () => {
  await updater.check(true);
  const s = publicState();
  send("state", s);
  return s;
});
ipcMain.handle("update:install", () => updater.install());
ipcMain.handle("startup:set", (_e, on) => {
  setStartup(on);
  const s = publicState();
  send("state", s);
  return s;
});

// ── lifecycle ────────────────────────────────────────────────────────────────

app.on("second-instance", () => openPanel("settings"));

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  hooks.ensureHookFile();
  createNotch();
  roamer = createRoamer({
    load: (win, hash) => (DEV
      ? win.loadURL(`http://localhost:5173/index.html#${hash}`)
      : win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash })),
    windows,
    ownPids: () => app.getAppMetrics().map((m) => m.pid),
    home: () => {
      const b = notch && !notch.isDestroyed() ? notch.getBounds() : homeArea();
      return { x: b.x + roamHome.x, y: b.y + roamHome.y + roamHome.r };
    },
    area: homeArea,
    look: () => store.settings.get().look,
    onOut: (on) => send("roam", on),
  });
  roamer.setEnabled(store.settings.get().roam);
  if (suspended()) roamer.suspend();
  createTray();
  // A layout change can move the work area out from under us, or take the
  // screen away entirely: re-resolve rather than trusting the old id. A pinned
  // screen that is unplugged falls back to following you, and comes back when
  // it is plugged in again. Settings hears about it so the picker stays true.
  const relayout = () => { homeId = targetDisplay().id; placeNotch(); send("state", publicState()); };
  screen.on("display-metrics-changed", relayout);
  screen.on("display-removed", relayout);
  screen.on("display-added", relayout);
  // Nothing is checked while a game is running or Pip is paused.
  updater.init({
    canCheck: () => !suspended(),
    onChange: () => { send("state", publicState()); updateTray(); },
  });
  applyRunState();
  gameTick();
});

app.on("window-all-closed", (e) => e.preventDefault());
app.on("before-quit", () => roamer?.destroy());
