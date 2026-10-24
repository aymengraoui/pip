// The creatures Pip can be besides a sprout: a kitty, a bunny, a puppy and a
// robot, each its own whole animal. creature.js draws the face on top, at the
// same spot for all of them, so every expression works on every creature.
//
// Each one is drawn in two passes around that face:
//   back(kind, o, R, s)   everything behind and including the body
//   snout(kind, o, R, s)  nose, muzzle, whiskers: between the eyes and the mouth
//
// The sprout's leaf animation drives them too, so a mood reads the same on any
// of them: `leafAngle` sways (and droops while napping), `prop` means working,
// `leafSpin` is its clock. Ears flick, tails swish or wag, antennas blink.
//
// Units are R, the body radius. Everything fits between -1.6R and +1.1R: Pip
// sits 23 px below the top of the screen, and anything taller is cut off.

import { ctx, ellipse } from "./gfx.js";

const INK = "#1E2230";
const PINK = "#FFB3C7";
const NOSE = "#FF8FAE";

/** How a creature's face is drawn: robots get a dark visor and glowing marks. */
export function faceStyle(kind) {
  return kind === "robot" ? { ink: "#7FF5E6", led: true } : { ink: INK, led: false };
}

/** The default "smile" each animal makes; other mouths are shared. */
export function smileFor(kind) {
  return kind === "kitty" ? "cat" : kind === "bunny" ? "bunny" : kind === "puppy" ? "pup" : "smile";
}

export function back(kind, o, R, s) {
  switch (kind) {
    case "kitty": return kitty(o, R, s);
    case "bunny": return bunny(o, R, s);
    case "puppy": return puppy(o, R, s);
    case "robot": return robot(o, R, s);
  }
}

export function snout(kind, o, R, s) {
  switch (kind) {
    case "kitty": return kittySnout(R, s);
    case "bunny": return bunnySnout(R, s);
    case "puppy": return puppySnout(R);
  }
}

// -- shared bits --------------------------------------------------------------

function fur(o, R) {
  const g = ctx.createRadialGradient(-R * 0.38, -R * 0.48, R * 0.1, 0, 0, R * 1.4);
  g.addColorStop(0, o.pal.light);
  g.addColorStop(0.55, o.pal.mid);
  g.addColorStop(1, o.pal.edge);
  return g;
}

function sheen(R, s) {
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = Math.max(0.8, 1.2 * s);
  ctx.beginPath();
  ctx.ellipse(-R * 0.36, -R * 0.5, R * 0.34, R * 0.17, -0.5, Math.PI * 1.05, Math.PI * 1.7);
  ctx.stroke();
}

/** Two front paws with toe lines, stepping while it works. */
function paws(o, R, s, w = 0.25, h = 0.16) {
  const step = o.walk ? Math.sin(o.t * 16) * R * 0.08 : 0;
  for (const side of [-1, 1]) {
    const x = side * R * 0.42, y = R * 0.9 + side * step;
    ctx.fillStyle = o.pal.light;
    ellipse(x, y, R * w, R * h);
    ctx.strokeStyle = o.pal.edge;
    ctx.lineWidth = Math.max(0.6, 0.9 * s);
    ctx.beginPath();
    ctx.ellipse(x, y, R * w, R * h, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (const dx of [-0.08, 0.08]) {
      ctx.moveTo(x + R * dx, y + R * h * 0.1);
      ctx.lineTo(x + R * dx, y + R * h * 0.75);
    }
    ctx.stroke();
  }
}

/** Ears swing with the leaf's sway, flop when napping, flick while working. */
function earSwing(o, side, droop = 1) {
  const flick = o.prop ? Math.sin(o.leafSpin * 0.5 + (side > 0 ? 1.6 : 0)) * 0.16 : 0;
  return side * (o.leafAngle * 0.4 * droop + flick);
}

/** A round head-body: the shape every animal is built on, cheeks optional. */
function blob(R, top = 0.86, side = 1.1, bottom = 0.98, tufts = false) {
  ctx.beginPath();
  ctx.moveTo(0, -R * top);
  for (const sx of [1, -1]) {
    if (sx < 0) ctx.moveTo(0, -R * top);
    ctx.bezierCurveTo(sx * R * side * 0.6, -R * top, sx * R * side, -R * top * 0.62, sx * R * side, R * 0.02);
    if (tufts) {
      // Fluffy cheeks: the thing that makes a round shape read as a cat.
      ctx.lineTo(sx * R * (side + 0.12), R * 0.2);
      ctx.lineTo(sx * R * (side - 0.06), R * 0.3);
      ctx.lineTo(sx * R * (side + 0.04), R * 0.46);
    }
    ctx.bezierCurveTo(sx * R * side * 0.86, R * bottom * 0.9, sx * R * 0.5, R * bottom, 0, R * bottom);
  }
}

// -- kitty --------------------------------------------------------------------

function kitty(o, R, s) {
  // Tail first, curling up behind: a slow swish, a fast one while working,
  // lying flat while napping.
  const swish = o.prop ? Math.sin(o.t * 9) * 0.45 : Math.sin(o.t * 2.1) * 0.3;
  ctx.save();
  ctx.translate(R * 0.72, R * 0.62);
  ctx.rotate(swish + o.leafAngle * 0.7);
  ctx.strokeStyle = o.pal.edge;
  ctx.lineWidth = R * 0.24;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(R * 0.7, R * 0.05, R * 0.72, -R * 0.45);
  ctx.quadraticCurveTo(R * 0.74, -R * 0.82, R * 0.46, -R * 0.84);
  ctx.stroke();
  ctx.strokeStyle = o.pal.light;
  ctx.lineWidth = R * 0.14;
  ctx.beginPath();
  ctx.moveTo(R * 0.62, -R * 0.82);
  ctx.quadraticCurveTo(R * 0.52, -R * 0.86, R * 0.46, -R * 0.84);
  ctx.stroke();
  ctx.restore();

  // Pointy ears with pink insides, just behind the head.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * R * 0.58, -R * 0.6);
    ctx.rotate(earSwing(o, side) + side * 0.3);
    ctx.fillStyle = o.pal.mid;
    ctx.beginPath();
    ctx.moveTo(-R * 0.36, R * 0.18);
    ctx.lineTo(-R * 0.06, -R * 0.6);
    ctx.quadraticCurveTo(0, -R * 0.7, R * 0.06, -R * 0.6);
    ctx.lineTo(R * 0.36, R * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PINK;
    ctx.beginPath();
    ctx.moveTo(-R * 0.2, R * 0.04);
    ctx.lineTo(0, -R * 0.44);
    ctx.lineTo(R * 0.2, R * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  paws(o, R, s, 0.24, 0.15);

  blob(R, 0.84, 1.08, 0.98, true);
  ctx.fillStyle = fur(o, R);
  ctx.fill();
  sheen(R, s);

  // A pale bib, and tabby stripes on the forehead.
  ctx.fillStyle = o.pal.light;
  ctx.globalAlpha = 0.9;
  ellipse(0, R * 0.66, R * 0.4, R * 0.26);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = o.pal.edge;
  ctx.lineWidth = R * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-R * 0.2, -R * 0.8); ctx.lineTo(-R * 0.15, -R * 0.58);
  ctx.moveTo(0, -R * 0.84); ctx.lineTo(0, -R * 0.56);
  ctx.moveTo(R * 0.2, -R * 0.8); ctx.lineTo(R * 0.15, -R * 0.58);
  ctx.stroke();
}

function kittySnout(R, s) {
  ctx.fillStyle = NOSE;
  ctx.beginPath();
  ctx.moveTo(-R * 0.08, R * 0.16);
  ctx.lineTo(R * 0.08, R * 0.16);
  ctx.lineTo(0, R * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(30,34,48,0.32)";
  ctx.lineWidth = Math.max(0.5, 0.6 * s);
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    for (const [y0, y1] of [[0.24, 0.17], [0.3, 0.31], [0.36, 0.45]]) {
      ctx.beginPath();
      ctx.moveTo(side * R * 0.66, R * y0);
      ctx.lineTo(side * R * 1.2, R * y1);
      ctx.stroke();
    }
  }
}

// -- bunny --------------------------------------------------------------------

function bunny(o, R, s) {
  // A cotton tail peeking out behind.
  ctx.fillStyle = "#FFFFFF";
  ellipse(R * 0.9, R * 0.6, R * 0.22, R * 0.22);
  ellipse(R * 1.02, R * 0.48, R * 0.12, R * 0.12);
  ellipse(R * 1.04, R * 0.7, R * 0.12, R * 0.12);

  // Long ears, splayed a little. Napping, they flop right over.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * R * 0.32, -R * 0.66);
    ctx.rotate(earSwing(o, side, 1.8) + side * 0.3);
    ctx.fillStyle = o.pal.mid;
    ellipse(0, -R * 0.46, R * 0.21, R * 0.52);
    ctx.fillStyle = PINK;
    ellipse(0, -R * 0.42, R * 0.1, R * 0.38);
    ctx.restore();
  }

  // Big flat feet.
  paws(o, R, s, 0.32, 0.15);

  // A pear: narrow at the top, round at the bottom.
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.8);
  for (const sx of [1, -1]) {
    if (sx < 0) ctx.moveTo(0, -R * 0.8);
    ctx.bezierCurveTo(sx * R * 0.62, -R * 0.8, sx * R * 0.95, -R * 0.45, sx * R * 1.0, R * 0.08);
    ctx.bezierCurveTo(sx * R * 1.08, R * 0.72, sx * R * 0.64, R * 1.0, 0, R * 1.0);
  }
  ctx.fillStyle = fur(o, R);
  ctx.fill();
  sheen(R, s);

  ctx.fillStyle = o.pal.light;
  ctx.globalAlpha = 0.9;
  ellipse(0, R * 0.64, R * 0.46, R * 0.3);
  ctx.globalAlpha = 1;
}

function bunnySnout(R, s) {
  ctx.fillStyle = NOSE;
  ellipse(0, R * 0.19, R * 0.07, R * 0.05);
  // Whisker dots.
  ctx.fillStyle = "rgba(30,34,48,0.45)";
  for (const side of [-1, 1]) {
    for (const [x, y] of [[0.26, 0.24], [0.33, 0.3], [0.26, 0.34]]) ellipse(side * R * x, R * y, R * 0.025 + s * 0.2, R * 0.025 + s * 0.2);
  }
}

// -- puppy --------------------------------------------------------------------

function puppy(o, R, s) {
  // A happy little tail: wags slowly, wags hard while working, rests napping.
  const wag = o.prop ? Math.sin(o.t * 22) * 0.5 : Math.sin(o.t * 6) * 0.35;
  ctx.save();
  ctx.translate(R * 0.82, R * 0.5);
  ctx.rotate(-0.7 + wag * (1 - o.leafAngle * 0.6) + o.leafAngle * 1.2);
  ctx.fillStyle = o.pal.edge;
  ellipse(R * 0.28, 0, R * 0.32, R * 0.12);
  ctx.restore();

  paws(o, R, s, 0.25, 0.16);

  blob(R, 0.88, 1.06, 0.98);
  ctx.fillStyle = fur(o, R);
  ctx.fill();
  sheen(R, s);

  // A patch over one eye: that's the puppy.
  ctx.fillStyle = o.pal.edge;
  ctx.globalAlpha = 0.6;
  ellipse(-R * 0.44, -R * 0.12, R * 0.3, R * 0.28);
  ctx.globalAlpha = 1;

  // Muzzle.
  ctx.fillStyle = o.pal.light;
  ellipse(0, R * 0.34, R * 0.36, R * 0.25);

  // Floppy ears, over the sides of the head.
  ctx.fillStyle = o.pal.feet;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * R * 0.86, -R * 0.62);
    ctx.rotate(side * (0.2 + o.leafAngle * 0.3) + (o.prop ? Math.sin(o.leafSpin * 0.5 + side) * 0.22 : 0));
    ellipse(0, R * 0.36, R * 0.23, R * 0.44);
    ctx.restore();
  }
}

function puppySnout(R) {
  ctx.fillStyle = INK;
  ellipse(0, R * 0.2, R * 0.12, R * 0.085);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ellipse(-R * 0.04, R * 0.17, R * 0.035, R * 0.025);
}

// -- robot --------------------------------------------------------------------

function robot(o, R, s) {
  const step = o.walk ? Math.sin(o.t * 16) * R * 0.08 : 0;

  // Antenna: wobbles with the sway, the bulb blinks while it works.
  ctx.save();
  ctx.translate(0, -R * 0.9);
  ctx.rotate(o.leafAngle * 0.45);
  ctx.strokeStyle = o.pal.feet;
  ctx.lineWidth = Math.max(1, 1.8 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -R * 0.42);
  ctx.stroke();
  const lit = !o.prop || Math.sin(o.leafSpin * 0.35) > 0;
  ctx.fillStyle = lit ? "#FF6B8B" : "#8E4256";
  if (lit) { ctx.shadowColor = "#FF6B8B"; ctx.shadowBlur = 6 * s; }
  ellipse(0, -R * 0.52, R * 0.13, R * 0.13);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ellipse(-R * 0.04, -R * 0.56, R * 0.04, R * 0.04);
  ctx.restore();

  // Little legs and boots.
  for (const side of [-1, 1]) {
    const x = side * R * 0.42, y = side * step;
    ctx.fillStyle = o.pal.feet;
    ctx.fillRect(x - R * 0.08, R * 0.7 + y, R * 0.16, R * 0.2);
    ctx.fillStyle = o.pal.edge;
    ctx.beginPath();
    ctx.roundRect(x - R * 0.2, R * 0.86 + y, R * 0.4, R * 0.16, R * 0.07);
    ctx.fill();
  }

  // Ear discs.
  for (const side of [-1, 1]) {
    ctx.fillStyle = o.pal.edge;
    ellipse(side * R * 1.08, -R * 0.05, R * 0.15, R * 0.26);
    ctx.fillStyle = o.pal.light;
    ellipse(side * R * 1.1, -R * 0.05, R * 0.06, R * 0.1);
  }

  // The head, which is the whole robot: brushed metal in Pip's colour.
  ctx.beginPath();
  ctx.roundRect(-R * 1.02, -R * 0.92, R * 2.04, R * 1.7, R * 0.4);
  const g = ctx.createLinearGradient(0, -R * 0.92, 0, R * 0.78);
  g.addColorStop(0, o.pal.light);
  g.addColorStop(0.5, o.pal.mid);
  g.addColorStop(1, o.pal.edge);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = o.pal.feet;
  ellipse(-R * 0.82, -R * 0.72, R * 0.05, R * 0.05);
  ellipse(R * 0.82, -R * 0.72, R * 0.05, R * 0.05);

  // The visor its face glows on.
  ctx.beginPath();
  ctx.roundRect(-R * 0.8, -R * 0.52, R * 1.6, R * 1.06, R * 0.32);
  ctx.fillStyle = "#1A2030";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = Math.max(0.8, 1.1 * s);
  ctx.beginPath();
  ctx.moveTo(-R * 0.55, -R * 0.42);
  ctx.lineTo(-R * 0.2, -R * 0.42);
  ctx.stroke();
}
