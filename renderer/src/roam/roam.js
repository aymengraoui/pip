// Pip out on the desktop: the page inside the small window electron/roam.js
// moves around. It draws the same creature as the notch, in the same look, and
// animates what the main process tells it (walking, in the air, just landed);
// the rest (blinking, breathing, napping) it does on its own.
//
// It runs as slowly as still looks right: every frame while moving, ten a
// second while perched.

import * as gfx from "../engine/gfx.js";
import * as creature from "../engine/creature.js";
import { BODIES, clean } from "../engine/look.js";

const SIZE = 96;  // keep in step with electron/roam.js
const FEET = 88;
const SCALE = 1.7;
const R = 13 * SCALE;

const el = document.createElement("canvas");
el.style.cssText = `width:${SIZE}px;height:${SIZE}px;display:block`;
document.body.style.cssText = "margin:0;background:transparent;overflow:hidden";
document.body.appendChild(el);

let pose = { walk: false, air: false, facing: 1, land: 0, look: clean(null) };
let blinkAt = performance.now() + 2500;
let hovering = false;

window.pip.onRoamPose((p) => {
  pose = { ...pose, ...p, look: p.look ? clean(p.look) : pose.look };
  kick();
});
window.pip.onRoamMood?.(() => kick());

function face(now) {
  if (pose.air) return { eyes: "wide", mouth: "o", open: 1 };
  if (now > blinkAt) {
    if (now > blinkAt + 130) blinkAt = now + 2600 + Math.random() * 2600;
    return { eyes: "normal", mouth: "smile", open: 0.1 };
  }
  return { eyes: "normal", mouth: "smile", open: 1 };
}

function draw(now) {
  const t = now / 1000;
  const f = face(now);
  // Landing squashes, then springs back.
  const since = (Date.now() - (pose.land || 0)) / 1000;
  const squash = since < 0.35 ? Math.sin((since / 0.35) * Math.PI) * 0.18 : 0;
  const breathe = pose.walk || pose.air ? 0 : Math.sin(t * 2.2) * 0.025;
  const hop = pose.walk ? Math.abs(Math.sin(t * 9)) * 3 : 0;
  const l = pose.look;
  gfx.drawOn(el, SIZE, () => creature.draw(SIZE / 2, FEET - R - hop, SCALE, {
    pal: BODIES[l.body], t, kind: l.kind, accessory: l.accessory,
    sx: pose.facing * (1 + squash), sy: 1 - squash + breathe,
    rot: pose.walk ? Math.sin(t * 9) * 0.06 : 0,
    look: { x: pose.facing * 0.5, y: pose.air ? -0.3 : 0.15 }, open: f.open,
    eyes: f.eyes, mouth: f.mouth, blush: l.cheeks ? 0.6 : 0,
    prop: pose.walk, leafSpin: t * 8, leafAngle: Math.sin(t * 1.3) * 0.12, walk: pose.walk,
  }));
}

let timer = 0;
function loop() {
  const now = performance.now();
  draw(now);
  const moving = pose.walk || pose.air || Date.now() - (pose.land || 0) < 400;
  timer = moving ? requestAnimationFrame(loop) : setTimeout(loop, 100);
}
function kick() {
  cancelAnimationFrame(timer);
  clearTimeout(timer);
  loop();
}
loop();

// Only Pip itself takes clicks: tell the main process when the cursor is on it.
window.addEventListener("mousemove", (e) => {
  const on = Math.hypot(e.clientX - SIZE / 2, e.clientY - (FEET - R)) < R * 1.25;
  if (on !== hovering) {
    hovering = on;
    el.style.cursor = on ? "pointer" : "";
    window.pip.roamHover(on);
  }
});
window.addEventListener("mouseleave", () => {
  if (hovering) { hovering = false; window.pip.roamHover(false); }
});
window.addEventListener("click", () => { if (hovering) window.pip.roamClick(); });
