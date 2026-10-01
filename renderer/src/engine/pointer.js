// Where the cursor is, in notch coordinates.
//
// Two sources feed this: DOM mousemove while the window is solid, and the main
// process (which polls the cursor, so Pip keeps looking at you even when the
// window is click-through or a drag is in progress). input.js owns both.

import { now } from "./util.js";

export const mouse = { x: -999, y: -999, in: false, lastMove: 0 };

/** Returns how far it moved, or null if it did not. */
export function move(x, y) {
  const dx = x - mouse.x, dy = y - mouse.y;
  if (!dx && !dy) return null;
  mouse.x = x;
  mouse.y = y;
  mouse.in = true;
  mouse.lastMove = now();
  return { dx, dy };
}

/** Has the cursor moved recently enough that Pip should still react to it? */
export const fresh = (t, within = 5) => mouse.in && t - mouse.lastMove < within;

export const distanceTo = (x, y) => Math.hypot(mouse.x - x, mouse.y - y);
