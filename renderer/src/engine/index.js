// Pip: a little mint sprout that lives in a notch at the top of your screen and
// keeps you company while Claude Code works. Everything is drawn in code.
//
// This file is the engine's front door: it wires the parts together, owns the
// frame loop, and is the only thing App.jsx talks to.
//
//   hook events -> model.js ------> mood, sessions, agents
//                     |                |
//                     v                v
//              inspector.js        layout.js -> pip.js / minis.js / render.js
//                (the panel)        (shape)      (what you see on the canvas)
//
// CPU: the loop runs at 60 fps only for physics and the user's hand (springs,
// jumps, hover, confetti); 30 for ambient motion (notes, speech, emotes); 24
// while Claude works, 12 when idle, 6 while napping, and not at all while
// paused (game mode). The window itself is resized to what is drawn, because a
// transparent window costs CPU in proportion to its area on every frame.

import * as bridge from "./bridge.js";
import * as clock from "./clock.js";
import * as creature from "./creature.js";
import * as gfx from "./gfx.js";
import * as input from "./input.js";
import * as inspector from "./inspector.js";
import * as layout from "./layout.js";
import * as minis from "./minis.js";
import * as model from "./model.js";
import * as particles from "./particles.js";
import * as pipMod from "./pip.js";
import * as render from "./render.js";
import * as sound from "./sound.js";
import * as speech from "./speech.js";
import * as watchdog from "./watchdog.js";
import { playDemo } from "./demo.js";
import { fresh } from "./pointer.js";
import { now } from "./util.js";

export const W = gfx.W, H = gfx.H;

const { pip } = pipMod;
const { L } = layout;

// -- public API ---------------------------------------------------------------

/** Start Pip on a canvas. `host` talks to the main process, `ui` to React. */
export function init(el, host, ui) {
  gfx.attach(el);
  bridge.configure(host, ui);
  model.setReactions({ onSpawn: minis.onSpawn, onFinish: minis.onFinish, onMood: pipMod.onMood });
  clock.configure({ frame, fps: desiredFps });
  input.attach(el);
  pip.intro.t = 1; // grow in
  setTimeout(() => { pipMod.greet(); clock.wake(); }, 500);
  clock.wake();
}

/** New hook events. `replay` means catching up quietly, with no fanfare. */
export function ingest({ events, replay }) {
  for (const e of events) model.apply(e, replay);
  if (replay) model.settleMood();
  else clock.wake();
  inspectChanged();
}

export function setMuted(on) { sound.setMuted(on); }
export function sfx(name) { sound.play(name); }
export function speak(text, dur = 2.2) { speech.say(text, dur); clock.wake(); }
export function wake() { clock.wake(); }

/** Cursor position from the main process (works during drag-and-drop too). */
export function setCursor({ x, y }) { input.moveTo(x, y); }

/** React opened (or closed, with null) a panel inside the notch. */
export function setPanel(name, size) {
  layout.setPanel(name, size);
  if (!name) inspector.close();
  clock.wake();
}

// Nobody has touched the keyboard for a few minutes. Remember where the
// counters were, so there is something to compare against on the way back.
let leftAt = null;

/**
 * The user went away, or came back. Coming back to something worth mentioning
 * gets one line and nothing else: no badge, no popup, no list to dismiss.
 */
export function setAway(on) {
  if (on) {
    leftAt = { ...model.totals };
    return;
  }
  if (!leftAt) return;
  const before = leftAt;
  leftAt = null;
  const d = {
    turns: model.totals.turns - before.turns,
    failures: model.totals.failures - before.failures,
    helpers: model.totals.helpers - before.helpers,
    asked: model.totals.asked - before.asked,
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const parts = [];
  if (d.turns) parts.push(plural(d.turns, "turn finished", "turns finished"));
  if (d.failures) parts.push(plural(d.failures, "failure", "failures"));
  if (d.helpers) parts.push(plural(d.helpers, "helper done", "helpers done"));
  if (d.asked) parts.push(d.asked === 1 ? "1 ask for you" : `${d.asked} asks for you`);
  if (!parts.length) return;

  pipMod.welcomeBack();
  speech.say(`while you were away: ${parts.join(", ")}`, 6);
  clock.wake();
}

/** Game mode: stop everything. Resuming picks up where it left off. */
export function setPaused(on) {
  clock.setPaused(on);
  if (on) { particles.clear(); speech.clear(); }
}

// The inspector panel used to poll a snapshot four times a second, purely so a
// "12s ago" could tick. Nothing ticks now, so it is told when something actually
// happened instead: a hook event, a change of status, or a new focus.
const watchers = new Set();

/** Subscribe to "the inspector's data changed". Returns an unsubscribe. */
export function subscribeInspect(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

function inspectChanged() {
  if (!inspector.isOpen()) return;
  for (const fn of watchers) {
    try { fn(); } catch {}
  }
}

/** A panel grew or shrank with its content: resize the notch to match. */
export function resizePanel(h) { layout.resizePanel(h); clock.wake(); }

/** What the inspector panel shows; polled by React while it is open. */
export function inspectSnapshot() { return inspector.snapshot(); }
export function closeInspector() { inspector.close(); }
/** The panel asked to follow something else (a chip click). */
export function focusInspect(target) { inspector.open(target); inspectChanged(); clock.wake(); }
/** Open the inspector on the busiest session (the tray/menu path). */
export function inspectLead() {
  const target = inspector.leadTarget();
  if (target) {
    bridge.ui.onInspect(inspector.open(target));
    inspectChanged();
  }
  return !!target;
}

export function demo() { playDemo(ingest); }

/** Draws a big, happy Pip for the app icon (build step only). */
export function drawIcon(el, size = 256) {
  gfx.attachSquare(el, size);
  creature.draw(size / 2, size * 0.61, size / 42, {
    pal: creature.PIP_PAL, t: 0, sx: 1, sy: 1, rot: 0, look: { x: 0.15, y: 0.1 }, open: 1,
    eyes: "normal", mouth: "grin", blush: 0.8, prop: false, leafSpin: 0, leafAngle: 0.1, walk: false,
  });
}

// -- frame rate ---------------------------------------------------------------
// As slow as still looks right, never faster.

const why = {};

/** Fast motion (physics, springs, the user's hand) wants 60 fps. */
function fastReason(t) {
  if (clock.active(t)) return "wake";
  if (pipMod.busy()) return "jump";
  if (layout.settling()) return "layout";
  if (pipMod.settling()) return "leap";
  if (fresh(t, 2)) return "mouse";
  if (particles.any((p) => p.kind === "confetti")) return "burst";
  return "";
}

/** Ambient motion (drifting notes, speech, emotes) looks fine at 30. */
function ambientReason(t) {
  if (particles.any((p) => p.kind !== "z")) return "particles"; // sleepy z's don't count
  if (speech.current(t)) return "bubble";
  if (pip.current()) return "emote";
  if (t < pip.whistleUntil) return "whistle";
  return "";
}

function desiredFps(t) {
  const fast = fastReason(t);
  if (fast) { why[fast] = (why[fast] || 0) + 1; return 60; }
  const ambient = ambientReason(t);
  if (ambient) { why[ambient] = (why[ambient] || 0) + 1; return 30; }
  if (minis.busy()) return 60;
  if (model.mood === "approval" || model.mood === "working" || model.mood === "thinking" || model.agents.size) return 24;
  if (model.mood === "sleeping") return 6;
  return 12;
}

/** Debug: frames drawn per second since the last call, and why. */
export function frameStats() {
  const { frames, seconds } = clock.takeCount();
  const out = {
    fps: +(frames / seconds).toFixed(1),
    want: desiredFps(now()),
    mood: model.mood,
    sessions: model.sessions.size,
    agents: model.agents.size,
    why: { ...why },
  };
  for (const k of Object.keys(why)) delete why[k];
  return out;
}

// -- the window ---------------------------------------------------------------

// The window grows at once when something needs room and shrinks back a moment
// later, in 32 px steps, so it isn't resized on every frame.
let winH = 128, shrinkSince = 0;

function fitWindow(t) {
  const base = Math.max(L.h.v, L.h.t);
  let need = base + 16;
  if (speech.current(t) || layout.hoveredMini) need = Math.max(need, base + 52);
  if (layout.panelName() && model.agents.size) need = Math.max(need, base + 28);
  need = Math.max(need, pip.y + pip.radius() * 1.6);
  need = minis.lowest(need);          // the playground under the notch
  need = particles.lowest(need, 18);
  need = Math.min(H, Math.ceil(need / 32) * 32);

  if (need > winH) {
    winH = need;
    shrinkSince = 0;
    bridge.host.setWinHeight(winH);
  } else if (need < winH) {
    if (!shrinkSince) shrinkSince = t;
    if (t - shrinkSince > 0.8) { winH = need; shrinkSince = 0; bridge.host.setWinHeight(winH); }
  } else {
    shrinkSince = 0;
  }
}

// -- the frame ----------------------------------------------------------------

let drawnHeight = H;

let worried = "";

function frame(dt, t) {
  const was = model.mood;
  model.refreshMood();
  if (model.mood !== was) inspectChanged();

  // The watchdog caches its own scan; this only notices when the answer changes.
  const worry = watchdog.current();
  const now = worry ? worry.key + worry.kind : "";
  if (now !== worried) {
    worried = now;
    if (worry) { pipMod.fret(worry); clock.wake(); }
    inspectChanged();
  }

  // Low frame rates take several small physics steps, so springs stay stable.
  let rem = dt;
  let first = true;
  do {
    const step = Math.min(rem, 1 / 40);
    rem -= step;
    layout.step(step);
    pipMod.step(step, t);
    particles.step(step);
    minis.step(step);
    if (first) { layout.updateHover(t); first = false; }
  } while (rem > 1e-4);

  fitWindow(t);

  // Only clear what was drawn last frame plus what may be drawn now.
  const top = Math.max(L.h.v, L.h.t) + 90;
  const reach = Math.max(particles.lowest(top), minis.lowest(), pip.y + 60);
  const height = Math.min(H, Math.ceil(reach));
  gfx.beginFrame(Math.max(drawnHeight, height));
  drawnHeight = height;

  render.drawPill(t);
  render.drawHeader(t);
  render.drawRows();
  minis.draw(t);
  pipMod.draw(t);
  particles.draw(t);
  render.drawBubble(t);
}
