// Pip out on the desktop. With "Roam the desktop" on and nothing going on in
// Claude Code, Pip hops out of the notch into a small window of its own and
// perches on the top edge of the window you are working in, following it when
// you move it and strolling along it now and then; with nothing suitable in
// front it walks along the bottom of the screen. It comes home the moment Claude
// gets busy, when you click it, or when Pip is paused.
//
// The window is the size of the creature and this module moves it. Timers run
// fast only while it is travelling; perched, it costs one poll a second. The
// window only takes clicks over Pip itself (the page reports the hover), so it
// never swallows a click meant for the title bar it sits on.

const { BrowserWindow } = require("electron");
const path = require("path");

const SIZE = 96;               // the roaming window, px
const FEET = 88;               // where Pip's feet are inside it, from its top
const LEAVE_AFTER = 8000;      // quiet this long before heading out
const STROLL = [7000, 16000];  // between strolls along an edge
const WALK_SPEED = 80;         // px per second
const HOLD_AFTER_CLICK = 120e3; // clicked home: stays there this long
const QUIET = new Set(["idle", "sleeping"]);

/**
 * ctx: {
 *   load(win, hash)  load the renderer page at #hash
 *   windows          electron/windows.js
 *   ownPids()        Pip's own processes, kept out of "the window in front"
 *   home()           where Pip's feet are in the notch, in screen px
 *   area()           the work area of the screen Pip lives on
 *   look()           the look from settings.json
 *   onOut(on)        Pip left the notch (true) or is back in it (false)
 * }
 */
function createRoamer(ctx) {
  let win = null;
  let enabled = false;
  let paused = false;
  let mood = "sleeping";
  let quietSince = Date.now();
  let holdUntil = 0;
  let state = "home"; // home | out | moving
  let pos = null;     // Pip's feet, screen px
  let perch = null;   // { kind: "win", pid, x, y, w, dx } or { kind: "floor", y, x0, x1 }
  const timers = {};

  // ── the window ──────────────────────────────────────────────────────────────

  function ensureWin() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      width: SIZE, height: SIZE, transparent: true, frame: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
      hasShadow: false, focusable: false, alwaysOnTop: true, show: false, backgroundColor: "#00000000",
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.on("did-finish-load", () => pose({ look: ctx.look() }));
    ctx.load(win, "roam");
    return win;
  }

  const alive = () => win && !win.isDestroyed();

  function place(p) {
    pos = p;
    if (alive()) win.setBounds({ x: Math.round(p.x - SIZE / 2), y: Math.round(p.y - FEET), width: SIZE, height: SIZE });
  }

  function pose(p) {
    if (alive()) win.webContents.send("roam-pose", p);
  }

  // ── where to stand ──────────────────────────────────────────────────────────

  /** The top edge of the window in front if Pip fits there, else the bottom of the screen. */
  function surface() {
    const a = ctx.area();
    const fg = ctx.windows.activeWindow(ctx.ownPids());
    const onScreen = fg && fg.cx >= a.x && fg.cx < a.x + a.width && fg.cy >= a.y && fg.cy < a.y + a.height;
    // A maximized window's top is under the notch: nowhere to sit.
    if (onScreen && fg.y > a.y + 70 && fg.w >= 180) {
      return { kind: "win", pid: fg.pid, x: fg.x, y: fg.y, w: fg.w };
    }
    return { kind: "floor", y: a.y + a.height, x0: a.x + 50, x1: a.x + a.width - 50 };
  }

  function spotOn(s, near) {
    const lo = s.kind === "win" ? s.x + 40 : s.x0;
    const hi = s.kind === "win" ? s.x + s.w - 40 : s.x1;
    const x = near == null ? lo + Math.random() * (hi - lo) : Math.min(hi, Math.max(lo, near));
    return { x, y: s.y };
  }

  // ── moving ──────────────────────────────────────────────────────────────────

  function stop() {
    clearTimeout(timers.anim);
    timers.anim = null;
  }

  /** A hop along an arc, then `done`. */
  function hopTo(to, done) {
    stop();
    const from = { ...pos };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const ms = Math.min(1100, 420 + dist * 0.5);
    const lift = Math.max(50, Math.min(160, dist * 0.3));
    const t0 = Date.now();
    pose({ air: true, walk: false, facing: Math.sign(to.x - from.x) || 1, look: ctx.look() });
    const frame = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      place({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * k) * lift });
      if (k < 1) { timers.anim = setTimeout(frame, 16); return; }
      timers.anim = null;
      pose({ air: false, land: Date.now() });
      done && done();
    };
    frame();
  }

  /** A stroll along the edge it stands on. */
  function walkTo(x, done) {
    stop();
    const from = pos.x;
    const ms = Math.max(300, (Math.abs(x - from) / WALK_SPEED) * 1000);
    const t0 = Date.now();
    pose({ walk: true, air: false, facing: Math.sign(x - from) || 1 });
    const frame = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      place({ x: from + (x - from) * k, y: pos.y });
      if (k < 1) { timers.anim = setTimeout(frame, 33); return; }
      timers.anim = null;
      pose({ walk: false });
      done && done();
    };
    frame();
  }

  // ── going out and coming back ───────────────────────────────────────────────

  const wantsOut = () => enabled && !paused && QUIET.has(mood)
    && Date.now() - quietSince >= LEAVE_AFTER && Date.now() >= holdUntil;

  function goOut() {
    ensureWin();
    state = "moving";
    place(ctx.home());
    win.showInactive();
    ctx.onOut(true);
    perch = surface();
    const spot = spotOn(perch);
    hopTo(spot, () => {
      state = "out";
      if (perch.kind === "win") perch.dx = spot.x - perch.x;
      watch();
      restless();
    });
  }

  function goHome() {
    clearTimeout(timers.watch);
    clearTimeout(timers.stroll);
    if (state === "home") return;
    if (!alive() || !pos) { land(); return; }
    state = "moving";
    hopTo(ctx.home(), land);
  }

  function land() {
    stop();
    state = "home";
    perch = null;
    if (alive()) {
      win.setIgnoreMouseEvents(true, { forward: true });
      win.hide();
    }
    ctx.onOut(false);
  }

  /** Perched: keep up with the window it sits on, or find a new spot. */
  function watch() {
    clearTimeout(timers.watch);
    timers.watch = setTimeout(() => {
      if (state !== "out") return;
      if (!wantsOut()) { goHome(); return; }
      const s = surface();
      if (perch.kind === "win" && s.kind === "win" && s.pid === perch.pid) {
        // Same window: follow it if it moved (or was resized narrower).
        if (s.x !== perch.x || s.y !== perch.y || s.w !== perch.w) {
          const dx = Math.min(s.w - 40, Math.max(40, perch.dx));
          perch = { ...s, dx };
          stop();
          place({ x: s.x + dx, y: s.y });
        }
      } else if (perch.kind !== s.kind || s.kind === "win" || s.y !== perch.y) {
        // A different window in front, or none: hop over.
        perch = s;
        const spot = spotOn(s, pos.x);
        state = "moving";
        hopTo(spot, () => {
          state = "out";
          if (perch.kind === "win") perch.dx = spot.x - perch.x;
        });
      }
      watch();
    }, 1000);
  }

  /** Now and then, a stroll to somewhere else along the same edge. */
  function restless() {
    clearTimeout(timers.stroll);
    timers.stroll = setTimeout(() => {
      if (state === "out" && perch && !timers.anim) {
        const spot = spotOn(perch);
        walkTo(spot.x, () => { if (perch && perch.kind === "win") perch.dx = pos.x - perch.x; });
      }
      if (state !== "home") restless();
    }, STROLL[0] + Math.random() * (STROLL[1] - STROLL[0]));
  }

  function evaluate() {
    clearTimeout(timers.leave);
    if (state === "home" && wantsOut()) goOut();
    else if (state !== "home" && !wantsOut()) goHome();
    else if (state === "home" && enabled && !paused && QUIET.has(mood)) {
      // Not quiet for long enough yet: look again when it will have been.
      const wait = Math.max(holdUntil, quietSince + LEAVE_AFTER) - Date.now();
      timers.leave = setTimeout(evaluate, Math.max(200, wait));
    }
  }

  // ── API ─────────────────────────────────────────────────────────────────────

  return {
    setEnabled(on) {
      enabled = !!on;
      evaluate();
    },
    /** The notch's mood; quiet ones start the countdown to heading out. */
    setMood(next) {
      if (next === mood) return;
      const wasQuiet = QUIET.has(mood);
      mood = next;
      if (!QUIET.has(mood) || !wasQuiet) quietSince = Date.now();
      evaluate();
    },
    setLook(look) { pose({ look }); },
    suspend() {
      paused = true;
      for (const t of Object.values(timers)) clearTimeout(t);
      if (state !== "home") land();
    },
    resume() {
      paused = false;
      quietSince = Date.now();
      evaluate();
    },
    /** The page says whether the cursor is over Pip: only then does the window take clicks. */
    hover(on) {
      if (alive()) win.setIgnoreMouseEvents(!on, { forward: true });
    },
    /** Clicked: come home, and stay a while. */
    click() {
      holdUntil = Date.now() + HOLD_AFTER_CLICK;
      goHome();
      evaluate();
    },
    destroy() {
      for (const t of Object.values(timers)) clearTimeout(t);
      if (alive()) win.destroy();
    },
  };
}

module.exports = { createRoamer, SIZE, FEET };
