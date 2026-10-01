// What clicks and cursor moves mean.
//
// Moves come from two places (the DOM while the window is solid, the main
// process otherwise) and both land in pointer.js. Clicks are routed here:
//   Pip            tickle it
//   a sproutling   open the inspector on that subagent (click again to close)
//   a row          open the inspector on that session or subagent
//   the pill       keep the notch open

import { move } from "./pointer.js";
import { wake } from "./clock.js";
import { host, ui } from "./bridge.js";
import { isMuted } from "./sound.js";
import * as layout from "./layout.js";
import * as minis from "./minis.js";
import * as inspector from "./inspector.js";
import { pip, isOver as isOverPip, poke, pet } from "./pip.js";

/** Cursor moved: pet Pip if it is being wiggled over, and wake up if it is near. */
export function moveTo(x, y) {
  const d = move(x, y);
  if (!d) return;
  pet(x, y, d.dx, d.dy);
  if (Math.hypot(x - pip.x, y - pip.y) < 320) wake();
}

/** Ask React to show (or close) the inspector. */
function show(target) {
  ui.onInspect(inspector.toggle(target));
  wake();
}

function onDown(e) {
  if (e.button !== 0) return;
  const x = e.clientX, y = e.clientY;

  if (isOverPip(x, y)) { poke(); wake(); return; }

  const mini = minis.at(x, y);
  if (mini) { show({ kind: "agent", key: mini.key }); return; }

  const row = layout.rowAt(x, y);
  if (row >= 0) { show(layout.rowTarget(row)); return; }

  if (!layout.panelName()) { layout.togglePinned(); wake(); }
}

export function attach(canvas) {
  window.addEventListener("mousemove", (e) => moveTo(e.clientX, e.clientY));
  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); host.menu(isMuted()); });
}
