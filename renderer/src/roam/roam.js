// Pip out on the desktop: the page inside the small window electron/roam.js
// moves around. Two ways of being out there:
//
//   creature  the same creature as the notch, in the same look, animating what
//             the main process tells it (walking, in the air, just landed); the
//             rest (blinking, breathing) it does on its own.
//   peek      Capri: her full figure leaning in from a screen edge, half hidden,
//             glitching in and away, and glitching a little while she lingers.
//
// It runs as slowly as still looks right: every frame while something moves,
// a handful a second otherwise.

import * as gfx from "../engine/gfx.js";
import * as creature from "../engine/creature.js";
import { BODIES, clean } from "../engine/look.js";

const SIZE = 96;  // keep in step with electron/roam.js
const FEET = 88;
const SCALE = 1.7;
const R = 13 * SCALE;
const GLITCH_MS = 380;
const SHOWN = 0.55; // how much of her is on screen while she peeks

const el = document.createElement("canvas");
el.style.cssText = `width:${SIZE}px;height:${SIZE}px;display:block`;
document.body.style.cssText = "margin:0;background:transparent;overflow:hidden";
document.body.appendChild(el);

let pose = { mode: "creature", walk: false, air: false, facing: 1, land: 0, side: "right", enter: 0, leave: 0, look: clean(null) };
let blinkAt = performance.now() + 2500;
let hovering = false;

window.pip.onRoamPose((p) => {
  pose = { ...pose, ...p, look: p.look ? clean(p.look) : pose.look };
  kick();
});
// Listening now: anything said before this was lost, so ask for all of it.
window.pip.roamReady();

// -- creature -------------------------------------------------------------------

function face(now) {
  if (pose.air) return { eyes: "wide", mouth: "o", open: 1 };
  if (now > blinkAt) {
    if (now > blinkAt + 130) blinkAt = now + 2600 + Math.random() * 2600;
    return { eyes: "normal", mouth: "smile", open: 0.1 };
  }
  return { eyes: "normal", mouth: "smile", open: 1 };
}

function drawCreature(now) {
  const t = now / 1000;
  const f = face(now);
  // Landing squashes, then springs back.
  const since = (Date.now() - (pose.land || 0)) / 1000;
  const squash = since < 0.35 ? Math.sin((since / 0.35) * Math.PI) * 0.18 : 0;
  const breathe = pose.walk || pose.air ? 0 : Math.sin(t * 2.2) * 0.025;
  const hop = pose.walk ? Math.abs(Math.sin(t * 9)) * 3 : 0;
  const l = pose.look;
  el.style.width = el.style.height = SIZE + "px";
  gfx.drawOn(el, SIZE, () => creature.draw(SIZE / 2, FEET - R - hop, SCALE, {
    pal: BODIES[l.body], t, kind: l.kind, accessory: l.accessory,
    sx: pose.facing * (1 + squash), sy: 1 - squash + breathe,
    rot: pose.walk ? Math.sin(t * 9) * 0.06 : 0,
    look: { x: pose.facing * 0.5, y: pose.air ? -0.3 : 0.15 }, open: f.open,
    eyes: f.eyes, mouth: f.mouth, blush: l.cheeks ? 0.6 : 0,
    prop: pose.walk, leafSpin: t * 8, leafAngle: Math.sin(t * 1.3) * 0.12, walk: pose.walk,
  }));
}

// -- Capri, peeking -----------------------------------------------------------------
// Her cut-out from capri-desktop, brightened the way that app's shader does, and
// tinted copies of it for the glitch's red, green and violet ghosts.

const figure = new Image();
figure.src = new URL("../assets/capri/capri-full.png", import.meta.url).href;
const tints = {};
let glitchUntil = 0, nextGlitch = performance.now() + 2500;

function tinted(color) {
  if (tints[color] || !figure.naturalWidth) return tints[color];
  const c = document.createElement("canvas");
  c.width = figure.naturalWidth;
  c.height = figure.naturalHeight;
  const x = c.getContext("2d");
  x.drawImage(figure, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return (tints[color] = c);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function drawPeek(now) {
  const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
  if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) {
    el.width = Math.round(W * dpr);
    el.height = Math.round(H * dpr);
  }
  el.style.width = W + "px";
  el.style.height = H + "px";
  const c = el.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  if (!figure.complete || !figure.naturalWidth) return;

  // Glitching in, glitching away, and the odd flicker while she lingers.
  const enter = clamp01((Date.now() - (pose.enter || 0)) / GLITCH_MS);
  const leave = pose.leave ? clamp01((Date.now() - pose.leave) / GLITCH_MS) : 0;
  if (now > nextGlitch) {
    glitchUntil = now + 120 + Math.random() * 160;
    nextGlitch = now + 2500 + Math.random() * 4500;
  }
  const transit = enter < 1 || leave > 0;
  const glitch = transit ? 1 : now < glitchUntil ? 0.55 : 0;
  const shown = SHOWN * (1 - Math.pow(1 - enter, 3)) * (1 - leave);
  if (shown <= 0.01) return;

  // A little under the window's height, so her mane clears the top while she leans.
  const scale = (H * 0.86) / figure.naturalHeight;
  const sw = figure.naturalWidth * scale, sh = figure.naturalHeight * scale;
  const t = now / 1000;
  const x = W - sw * shown;
  const y = (H - sh) / 2 + Math.sin(t * 1.7) * 4;

  c.save();
  // She faces left in the image: on the left edge she is mirrored to reach in.
  if (pose.side === "left") { c.translate(W, 0); c.scale(-1, 1); }
  // Leaning in from the edge, with a slow sway.
  c.translate(x + sw * 0.6, y + sh * 0.5);
  c.rotate(-0.14 + Math.sin(t * 0.9) * 0.03);
  c.translate(-(x + sw * 0.6), -(y + sh * 0.5));
  c.globalAlpha = transit ? 0.55 + 0.45 * Math.random() : 1;
  c.filter = "saturate(1.7) brightness(1.3)";

  if (glitch) {
    // Ghosts in red, green and violet, pulled apart...
    c.globalCompositeOperation = "lighter";
    const spread = 9 * glitch;
    for (const [color, dx] of [["#FF3B5C", -spread], ["#36FF7A", spread], ["#7A3CFF", spread * 0.4]]) {
      const ghost = tinted(color);
      if (ghost) { c.globalAlpha = 0.45 * glitch; c.drawImage(ghost, x + dx, y, sw, sh); }
    }
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = transit ? 0.6 + 0.4 * Math.random() : 1;
    // ...and her, in slices knocked sideways.
    const slices = 9;
    for (let i = 0; i < slices; i++) {
      const sy = (figure.naturalHeight / slices) * i, shh = figure.naturalHeight / slices;
      const dx = (Math.random() - 0.5) * 22 * glitch;
      c.drawImage(figure, 0, sy, figure.naturalWidth, shh, x + dx, y + (sh / slices) * i, sw, sh / slices);
    }
  } else {
    c.drawImage(figure, x, y, sw, sh);
  }
  c.restore();
}

// -- the loop -------------------------------------------------------------------------

let timer = 0;
function loop() {
  const now = performance.now();
  let fast;
  if (pose.mode === "peek") {
    drawPeek(now);
    const transit = Date.now() - (pose.enter || 0) < GLITCH_MS || (pose.leave && Date.now() - pose.leave < GLITCH_MS + 100);
    fast = transit || now < glitchUntil;
    timer = fast ? requestAnimationFrame(loop) : setTimeout(loop, 66);
  } else {
    drawCreature(now);
    fast = pose.walk || pose.air || Date.now() - (pose.land || 0) < 400;
    timer = fast ? requestAnimationFrame(loop) : setTimeout(loop, 100);
  }
}
function kick() {
  cancelAnimationFrame(timer);
  clearTimeout(timer);
  loop();
}
figure.onload = kick;
loop();

// -- clicks -------------------------------------------------------------------------
// Only Pip itself takes clicks: tell the main process when the cursor is on it.
// Peeking, that is wherever her figure has been drawn (its alpha, read back).

function over(e) {
  if (pose.mode !== "peek") return Math.hypot(e.clientX - SIZE / 2, e.clientY - (FEET - R)) < R * 1.25;
  const dpr = devicePixelRatio || 1;
  try {
    return el.getContext("2d").getImageData(Math.round(e.clientX * dpr), Math.round(e.clientY * dpr), 1, 1).data[3] > 40;
  } catch {
    return false;
  }
}

window.addEventListener("mousemove", (e) => {
  const on = over(e);
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
