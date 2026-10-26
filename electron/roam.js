// Capri out on the desktop. Hers alone: with Capri picked in Appearance, "Roam
// the desktop when idle" on, and nothing going on in Claude Code, she leaves the
// notch and peeks in from the left or right edge of the screen, half hidden, out
// of the way of whatever you are doing. She glitches in, lingers, says something
// now and then, glitches away when your pointer comes near, and turns up
// somewhere else along an edge after a while. She comes home the moment Claude
// gets busy, when you click her, when Pip is paused, or when another creature is
// picked. With any other creature none of this exists.
//
// This module owns her small window and moves it; the page (renderer/src/roam)
// only draws. Timers run while she is out and stop when she is home. The window
// only takes clicks over her figure (the page reports the hover), so she never
// swallows a click meant for whatever is behind her.

const { BrowserWindow, screen } = require("electron");
const path = require("path");

const PEEK_W = 230;            // the window while she peeks, px: her, small, and room
const PEEK_H = 200;            // beside her head for what she says
const PEEK_FIG = 70;           // the strip along the edge her figure actually covers
const PEEK_STAY = [18000, 40000]; // before she moves on by herself
const GLITCH_MS = 380;         // glitching in or away
const SHY_PX = 130;            // the pointer this close...
const SHY_MS = 600;            // ...for this long, and she's gone
const LEAVE_AFTER = 8000;      // quiet this long before heading out
const HOLD_AFTER_CLICK = 120e3; // clicked home: stays there this long
const QUIET = new Set(["idle", "sleeping"]);
const between = ([a, b]) => a + Math.random() * (b - a);
// PIP_DEBUG=1: say what the roamer decides, on the console.
const log = process.env.PIP_DEBUG === "1" ? (...a) => console.log("[roam]", ...a) : () => {};

/**
 * ctx: {
 *   load(win, hash)  load the renderer page at #hash
 *   area()           the work area of the screen Pip lives on
 *   look()           the look from settings.json
 *   onOut(on)        she left the notch (true) or is back in it (false)
 * }
 * setEnabled(true) only while Capri is picked and roaming is on.
 */
function createRoamer(ctx) {
  let win = null;
  let enabled = false;
  let paused = false;
  let mood = "sleeping";
  let quietSince = Date.now();
  let holdUntil = 0;
  let state = "home"; // home | out | moving
  let peek = null;    // { side, x, y, until } while she peeks from an edge
  let hovered = false;
  let nearSince = 0;
  const timers = {};

  // ── the window ──────────────────────────────────────────────────────────────

  function ensureWin() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      width: PEEK_W, height: PEEK_H, transparent: true, frame: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
      hasShadow: false, focusable: false, alwaysOnTop: true, show: false, backgroundColor: "#00000000",
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false, backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    if (process.env.PIP_DEBUG === "1") win.webContents.on("console-message", (e) => log("page:", e.message));
    ctx.load(win, "roam");
    return win;
  }

  const alive = () => win && !win.isDestroyed();

  let shown = {}; // everything the page has been told, merged
  function pose(p) {
    shown = { ...shown, ...p };
    if (alive()) win.webContents.send("roam-pose", p);
  }

  // ── peeking in from an edge ─────────────────────────────────────────────────

  const wantsOut = () => enabled && !paused && QUIET.has(mood)
    && Date.now() - quietSince >= LEAVE_AFTER && Date.now() >= holdUntil;

  /** A spot along the left or right edge, clear of the notch and the taskbar. */
  function peekSpot(notSide) {
    const a = ctx.area();
    const side = notSide ? (notSide === "left" ? "right" : "left") : Math.random() < 0.5 ? "left" : "right";
    const top = a.y + 110, bottom = a.y + a.height - PEEK_H - 30;
    const y = Math.round(top + Math.random() * Math.max(0, bottom - top));
    return { side, x: side === "left" ? a.x : a.x + a.width - PEEK_W, y };
  }

  function peekAt(spot) {
    log("peek at", spot);
    peek = { ...spot, until: Date.now() + between(PEEK_STAY) };
    nearSince = 0;
    win.setBounds({ x: spot.x, y: spot.y, width: PEEK_W, height: PEEK_H });
    pose({ side: spot.side, enter: Date.now(), leave: 0, look: ctx.look() });
  }

  /** Once she has glitched in: lingering, watching the pointer. */
  function settle() {
    clearTimeout(timers.anim);
    timers.anim = setTimeout(() => { timers.anim = null; state = "out"; watch(); }, GLITCH_MS);
  }

  function goOut() {
    log("out");
    ensureWin();
    state = "moving";
    ctx.onOut(true);
    peekAt(peekSpot());
    win.showInactive();
    settle();
  }

  /** She glitches out of sight, then `next`. */
  function glitchAway(next) {
    pose({ leave: Date.now() });
    clearTimeout(timers.anim);
    timers.anim = setTimeout(() => { timers.anim = null; next(); }, GLITCH_MS);
  }

  /** Peeking: shy of the pointer, restless after a while. */
  function watch() {
    clearTimeout(timers.watch);
    timers.watch = setTimeout(() => {
      if (state !== "out" || !peek) return;
      if (!wantsOut()) { goHome(); return; }
      const c = screen.getCursorScreenPoint();
      // Shy of the pointer near her, not near the room left for her speech bubble.
      const b = win.getBounds();
      const fx = peek.side === "left" ? b.x : b.x + b.width - PEEK_FIG;
      const near = c.x > fx - SHY_PX && c.x < fx + PEEK_FIG + SHY_PX && c.y > b.y - SHY_PX / 2 && c.y < b.y + b.height + SHY_PX / 2;
      nearSince = near && !hovered ? nearSince || Date.now() : 0;
      const shy = nearSince && Date.now() - nearSince > SHY_MS;
      if (shy || Date.now() > peek.until) {
        state = "moving";
        const from = peek.side;
        glitchAway(() => {
          if (!wantsOut()) { land(); return; }
          peekAt(peekSpot(shy ? from : null));
          settle();
        });
        return;
      }
      watch();
    }, 250);
  }

  function goHome() {
    clearTimeout(timers.watch);
    if (state === "home") return;
    if (peek && alive()) { state = "moving"; glitchAway(land); return; }
    land();
  }

  function land() {
    log("land", state);
    clearTimeout(timers.anim);
    timers.anim = null;
    state = "home";
    peek = null;
    hovered = false;
    if (alive()) {
      win.setIgnoreMouseEvents(true, { forward: true });
      win.hide();
    }
    ctx.onOut(false);
  }

  function evaluate() {
    log("evaluate", { state, mood, enabled, paused, wantsOut: wantsOut() });
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
    /** True only while Capri is picked and roaming is on; false sends her home at once. */
    setEnabled(on) {
      enabled = !!on;
      if (!enabled && state !== "home") land();
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
    /**
     * The page loads its code a moment after the window says it has loaded, so
     * anything sent before then is lost; once it listens it asks, and gets it all.
     */
    ready() {
      if (alive()) win.webContents.send("roam-pose", { ...shown, look: ctx.look() });
    },
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
    /** The page says whether the cursor is over her: only then does the window take clicks. */
    hover(on) {
      hovered = !!on;
      if (alive()) win.setIgnoreMouseEvents(!on, { forward: true });
    },
    /** Clicked: home, and she stays a while. */
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

module.exports = { createRoamer, PEEK_W, PEEK_H };
