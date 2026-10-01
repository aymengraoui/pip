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
import { say } from "./speech.js";
import * as minis from "./minis.js";
import * as inspector from "./inspector.js";
import { pip, isAside, isOver as isOverPip, poke, pet } from "./pip.js";

/** Cursor moved: pet Pip if it is being wiggled over, and wake up if it is near. */
export function moveTo(x, y) {
  const d = move(x, y);
  if (!d) return;
  pet(x, y, d.dx, d.dy);
  if (Math.hypot(x - pip.x, y - pip.y) < 320) wake();
}

/** Ask React to show (or close) the inspector. */
function show(target) {
  if (!target) { ui.onInspect(null); wake(); return; }
  ui.onInspect(inspector.toggle(target));
  wake();
}

/** Take me to the terminal that is asking. */
function review(pid) {
  wake();
  Promise.resolve(host.focusSession(pid))
    .then((r) => {
      if (!r) return;
      if (r.how === "flashed") say("it's blinking in your taskbar", 3);
      else if (!r.ok) say(r.reason || "couldn't find that terminal", 3);
    })
    .catch(() => {});
}

function onDown(e) {
  if (e.button !== 0) return;
  const x = e.clientX, y = e.clientY;

  // Claude is waiting and the notch is offering the way there.
  const r = layout.review;
  if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { review(r.pid); return; }

  if (isOverPip(x, y)) {
    // Stepped aside while a helper is on stage: clicking Pip means "back to
    // you", not "tickle me". It gets the stage back and the panel shows its
    // session.
    if (isAside()) { show(inspector.ownerTarget()); return; }
    poke();
    wake();
    return;
  }

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
