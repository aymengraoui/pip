// What clicks and cursor moves mean.
//
// Moves come from two places (the DOM while the window is solid, the main
// process otherwise) and both land in pointer.js. Clicks are routed here:
//   Pip            tickle it
//   a sproutling   open the inspector on that subagent (click again to close)
//   a row          open the inspector on that session or subagent
//   the pill       keep the notch open
//
// Pip and the pill can also be dragged left and right along the top of the
// screen. A press on either is handed to the main process, which follows the
// cursor while the button is held and then says whether it moved
// (`dragEnded`): only a press that didn't move counts as a click.

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

/**
 * Presses waiting on the host's answer, oldest first: what each will do if it
 * turns out to be a click. The host answers every press once, in order, so a
 * fast double click is still two clicks.
 */
const pending = [];

function press(what) {
  pending.push(what);
  // A host that can't follow drags (tests, older builds) gets plain clicks.
  if (!host.startDrag()) dragEnded({ moved: false });
}

/** The main process has let go of a press: a click, or the end of a drag. */
export function dragEnded({ moved } = {}) {
  const what = pending.shift();
  wake();
  if (moved || !what) return;
  if (what === "pip") poke();
  else layout.togglePinned();
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
    // With a panel open the notch stays put: a plain tickle, as before.
    if (layout.panelName()) { poke(); wake(); return; }
    press("pip");
    return;
  }

  const mini = minis.at(x, y);
  if (mini) { show({ kind: "agent", key: mini.key }); return; }

  const row = layout.rowAt(x, y);
  if (row >= 0) { show(layout.rowTarget(row)); return; }

  // And a press on the pill does nothing while a panel is open.
  if (!layout.panelName()) press("pill");
}

export function attach(canvas) {
  window.addEventListener("mousemove", (e) => moveTo(e.clientX, e.clientY));
  canvas.addEventListener("mousedown", onDown);
  // The other way the host learns a press is over, for when Windows won't
  // report the button. Only while one is pending, so it costs nothing else.
  window.addEventListener("mouseup", (e) => { if (e.button === 0 && pending.length) host.stopDrag(); });
  canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); host.menu(isMuted()); });
}
