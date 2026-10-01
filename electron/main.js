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
const timers = {};

const tail = hooks.createTail();
const send = (channel, payload) => { if (notch && !notch.isDestroyed()) notch.webContents.send(channel, payload); };

function load(win) {
  if (DEV) return win.loadURL("http://localhost:5173/index.html");
  // PIP_DEBUG=1 exposes the engine to DevTools for manual testing.
  return win.loadFile(path.join(__dirname, "..", "dist", "index.html"), process.env.PIP_DEBUG === "1" ? { query: { debug: "1" } } : undefined);
}

function placeNotch() {
  const { workArea } = screen.getPrimaryDisplay();
  notch.setBounds({ x: Math.round(workArea.x + (workArea.width - W) / 2), y: workArea.y, width: W, height: winH });
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
    send("events", { events: tail.pump(), replay: true });
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
  const want = over || focusable;
  if (want !== solid) {
    solid = want;
    notch.setIgnoreMouseEvents(!solid, { forward: true });
  }
  if (near) send("cursor", { x, y, over });
  timers.cursor = setTimeout(cursorTick, near ? 40 : 200);
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
    clearInterval(timers.tail);
    if (focusable) setFocusable(false);
    send("pause", true);
    if (notch && !notch.isDestroyed()) notch.hide();
  } else {
    if (notch && !notch.isDestroyed()) notch.showInactive();
    send("pause", false);
    // Catch up quietly on whatever happened while hidden.
    send("events", { events: tail.pump(), replay: true });
    clearInterval(timers.tail);
    timers.tail = setInterval(() => { const ev = tail.pump(); if (ev.length) send("events", { events: ev, replay: false }); }, 200);
    clearTimeout(timers.cursor);
    cursorTick();
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
    { label: "Activity", click: () => openPanel("inspect") },
    { label: "Settings", click: () => openPanel("settings") },
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
ipcMain.on("menu", () => {
  Menu.buildFromTemplate([
    { label: "Activity", click: () => send("panel", "inspect") },
    { label: "Settings", click: () => send("panel", "settings") },
    { label: "Demo (play every state)", click: () => send("demo") },
    { label: "Pause Pip", click: () => { userPaused = true; applyRunState(); } },
    { type: "separator" },
    { label: "Quit Pip", click: () => app.quit() },
  ]).popup({ window: notch });
});
ipcMain.on("quit", () => app.quit());

ipcMain.handle("state", () => publicState());
ipcMain.handle("settings:set", (_e, patch) => {
  store.settings.set(patch);
  const s = publicState();
  send("state", s);
  return s;
});
ipcMain.handle("hooks:write", (_e, install) => {
  const r = hooks.write(install);
  send("state", publicState());
  return r;
});
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
  createTray();
  screen.on("display-metrics-changed", placeNotch);
  // Nothing is checked while a game is running or Pip is paused.
  updater.init({
    canCheck: () => !suspended(),
    onChange: () => { send("state", publicState()); updateTray(); },
  });
  applyRunState();
  gameTick();
});

app.on("window-all-closed", (e) => e.preventDefault());
