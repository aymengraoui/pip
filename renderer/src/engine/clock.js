// The animation clock: when the next frame runs, and how often.
//
// Nothing here knows what a frame draws. The engine hands it a frame function
// and a frame-rate policy; everyone else just calls wake() when something
// happened that deserves full speed for a moment.

import { now } from "./util.js";

let onFrame = null;
let fpsFor = () => 12;

let paused = false;
let rafId = 0, timer = 0;
let last = 0, activeUntil = 0;
let frames = 0, countSince = 0;

export function configure({ frame, fps }) {
  onFrame = frame;
  fpsFor = fps;
  last = now();
  countSince = last;
}

/** Something happened: run at full speed for a moment. */
export function wake(hold = 1.2) {
  activeUntil = Math.max(activeUntil, now() + hold);
  if (paused || !onFrame) return;
  if (timer) { clearTimeout(timer); timer = 0; }
  if (!rafId) rafId = requestAnimationFrame(tick);
}

/** True while a recent wake() still asks for full speed. */
export const active = (t) => t < activeUntil;

/** Game mode: stop everything. Resuming picks up where it left off. */
export function setPaused(on) {
  paused = !!on;
  if (paused) {
    cancelAnimationFrame(rafId); rafId = 0;
    clearTimeout(timer); timer = 0;
  } else {
    last = now();
    wake();
  }
}

export const isPaused = () => paused;

/** Frames drawn since the last call, for the debug readout. */
export function takeCount() {
  const t = now(), out = { frames, seconds: Math.max(1e-6, t - countSince) };
  frames = 0; countSince = t;
  return out;
}

function tick() {
  rafId = 0;
  if (paused) return;
  frames++;
  const t = now();
  const dt = Math.min(0.25, t - last);
  last = t;
  onFrame(dt, t);
  schedule();
}

function schedule() {
  if (paused || rafId || timer) return;
  const fps = fpsFor(now());
  if (fps >= 60) rafId = requestAnimationFrame(tick);
  // Wake a little early: setTimeout is coarse, and rAF aligns us to the display.
  else timer = setTimeout(() => { timer = 0; rafId = requestAnimationFrame(tick); }, Math.max(0, 1000 / fps - 6));
}
