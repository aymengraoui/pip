// Pip's speech bubble: one line at a time, drawn by render.js.

import { now } from "./util.js";

let bubble = null;

export function say(text, dur = 2) {
  bubble = { text, t0: now(), until: now() + dur };
}

/** The bubble if it is still on screen, else null. */
export function current(t) {
  return bubble && t < bubble.until ? bubble : null;
}

export function clear() { bubble = null; }
