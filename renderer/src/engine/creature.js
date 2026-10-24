// One creature, drawn from a plain description. Pip and every sproutling go
// through here; only the palette, the face and the wobble differ.
//
// draw(x, y, scale, {
//   pal, t, sx, sy, rot, look:{x,y}, open, eyes, mouth, blush,
//   prop, leafSpin, leafAngle, walk, accessory, kind,
// })
//
// `kind` picks the creature (look.js KINDS). The sprout is drawn here; the
// kitty, bunny, puppy and robot are their own whole bodies in critters.js. All
// of them wear the same face, drawn here, so every expression works on each.

import { clamp } from "./util.js";
import { ctx, ellipse, heartPath } from "./gfx.js";
import * as critters from "./critters.js";

export const PIP_PAL = { light: "#EFFFF7", mid: "#9DEBCB", edge: "#58C79C", feet: "#44A984", leaf: "#3DBB74", leafDark: "#2A8A56" };

/** A sproutling's palette, from its hue. */
export function palette(h) {
  return {
    light: `hsl(${h},90%,93%)`, mid: `hsl(${h},70%,76%)`, edge: `hsl(${h},52%,60%)`,
    feet: `hsl(${h},42%,48%)`, leaf: `hsl(${(h + 120) % 360},55%,52%)`, leafDark: `hsl(${(h + 120) % 360},55%,36%)`,
  };
}

const INK = "#1E2230";

function bodyPath(rx, ry) {
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.bezierCurveTo(rx * 0.92, -ry, rx, -ry * 0.35, rx, ry * 0.15);
  ctx.bezierCurveTo(rx, ry * 0.78, rx * 0.62, ry, 0, ry);
  ctx.bezierCurveTo(-rx * 0.62, ry, -rx, ry * 0.78, -rx, ry * 0.15);
  ctx.bezierCurveTo(-rx, -ry * 0.35, -rx * 0.92, -ry, 0, -ry);
  ctx.closePath();
}

function leafShape(len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.5, wid, 0, 0);
  ctx.fill();
}

function drawSprout(o, R, ry, s) {
  ctx.save();
  ctx.translate(0, -ry * 0.9);
  ctx.rotate(o.leafAngle);
  ctx.strokeStyle = o.pal.leafDark;
  ctx.lineWidth = Math.max(1, 1.7 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(R * 0.12, -R * 0.25, R * 0.04, -R * 0.5);
  ctx.stroke();
  ctx.translate(R * 0.04, -R * 0.5);
  ctx.fillStyle = o.pal.leaf;
  if (o.prop) {
    // Working: the two leaves spin like a propeller.
    const c = Math.cos(o.leafSpin);
    ctx.save(); ctx.scale(c, 1); leafShape(R * 0.62, R * 0.2); ctx.restore();
    ctx.save(); ctx.scale(-c, 1); leafShape(R * 0.62, R * 0.2); ctx.restore();
  } else {
    ctx.save(); ctx.rotate(-0.55); leafShape(R * 0.66, R * 0.26); ctx.restore();
    ctx.save(); ctx.rotate(-2.4); ctx.scale(0.8, 0.8); leafShape(R * 0.5, R * 0.22); ctx.restore();
  }
  ctx.restore();
}

export function draw(x, y, s, o) {
  const R = 13 * s, rx = R * 1.1, ry = R * 0.96;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.rot || 0);
  ctx.scale(o.sx, o.sy);

  const kind = o.kind || "sprout";
  if (kind === "sprout") drawSproutBody(o, R, rx, ry, s);
  else critters.back(kind, o, R, s);

  if (o.blush > 0.01) {
    ctx.fillStyle = `rgba(255,120,160,${0.55 * o.blush})`;
    ellipse(-rx * 0.62, ry * 0.2, R * 0.19, R * 0.11);
    ellipse(rx * 0.62, ry * 0.2, R * 0.19, R * 0.11);
  }

  if (o.accessory && o.accessory !== "glasses") drawAccessory(o.accessory, R, rx, ry, s, kind);
  const face = critters.faceStyle(kind);
  const mouth = (o.mouth || "smile") === "smile" ? critters.smileFor(kind) : o.mouth;
  ctx.save();
  // A robot's face is light on a dark visor, so it glows a little.
  if (face.led) { ctx.shadowColor = face.ink; ctx.shadowBlur = 5 * s; }
  drawEyes(o, R, rx, ry, s, face);
  critters.snout(kind, o, R, s);
  drawMouth(o, R, ry, s, face, mouth);
  ctx.restore();
  if (o.accessory === "glasses") drawGlasses(R, rx, ry, s, face);
  ctx.restore();
}

function drawSproutBody(o, R, rx, ry, s) {
  const pal = o.pal;
  // feet
  ctx.fillStyle = pal.feet;
  const step = o.walk ? Math.sin(o.t * 16) * R * 0.08 : 0;
  ellipse(-rx * 0.42, ry * 0.9 + step, rx * 0.27, ry * 0.17);
  ellipse(rx * 0.42, ry * 0.9 - step, rx * 0.27, ry * 0.17);

  drawSprout(o, R, ry, s); // behind the body

  // body
  bodyPath(rx, ry);
  const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.5, R * 0.1, 0, 0, R * 1.35);
  g.addColorStop(0, pal.light);
  g.addColorStop(0.55, pal.mid);
  g.addColorStop(1, pal.edge);
  ctx.fillStyle = g;
  ctx.fill();
  // sheen
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(0.8, 1.2 * s);
  ctx.beginPath();
  ctx.ellipse(-rx * 0.3, -ry * 0.55, rx * 0.32, ry * 0.18, -0.5, Math.PI * 1.05, Math.PI * 1.7);
  ctx.stroke();
}

/**
 * Something worn on the head. Hats sit beside a sprout or an antenna so the two
 * never collide; between a pet's ears there is room in the middle.
 */
function drawAccessory(kind, R, rx, ry, s, creature) {
  const middle = creature === "kitty" || creature === "bunny" || creature === "puppy";
  ctx.save();
  ctx.lineJoin = "round";
  switch (kind) {
    case "bow": {
      ctx.translate(-rx * 0.58, -ry * 0.7);
      ctx.rotate(-0.35);
      const w = R * 0.34, h = R * 0.24;
      ctx.fillStyle = "#FF6FA3";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * w * 0.6, -h * 1.1, side * w, -h * 0.4);
        ctx.quadraticCurveTo(side * w * 1.1, h * 0.4, side * w, h * 0.5);
        ctx.quadraticCurveTo(side * w * 0.6, h * 1.1, 0, 0);
        ctx.fill();
      }
      ctx.fillStyle = "#E04F86";
      ellipse(0, 0, R * 0.09, R * 0.1);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ellipse(-w * 0.55, -h * 0.35, R * 0.06, R * 0.035);
      break;
    }
    case "flower": {
      ctx.translate(rx * 0.6, -ry * 0.66);
      ctx.rotate(0.3);
      ctx.fillStyle = "#FFFFFF";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ellipse(Math.cos(a) * R * 0.14, Math.sin(a) * R * 0.14, R * 0.11, R * 0.11);
      }
      ctx.fillStyle = "#FFC94D";
      ellipse(0, 0, R * 0.1, R * 0.1);
      break;
    }
    case "crown": {
      ctx.translate(middle ? 0 : -rx * 0.45, middle ? -ry * 0.88 : -ry * 0.9);
      ctx.rotate(middle ? 0 : -0.38);
      const w = R * 0.56, h = R * 0.34;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(-w / 2, -h * 0.75);
      ctx.lineTo(-w / 4, -h * 0.3);
      ctx.lineTo(0, -h);
      ctx.lineTo(w / 4, -h * 0.3);
      ctx.lineTo(w / 2, -h * 0.75);
      ctx.lineTo(w / 2, 0);
      ctx.closePath();
      ctx.fillStyle = "#FFD54A";
      ctx.fill();
      ctx.strokeStyle = "#E0A82E";
      ctx.lineWidth = Math.max(0.8, 1 * s);
      ctx.stroke();
      ctx.fillStyle = "#FF5C8A";
      ellipse(0, -h * 0.3, R * 0.065, R * 0.065);
      break;
    }
    case "party": {
      ctx.translate(middle ? 0 : -rx * 0.45, -ry * 0.82);
      ctx.rotate(middle ? 0 : -0.45);
      const w = R * 0.46, h = R * 0.66;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(0, -h);
      ctx.lineTo(w / 2, 0);
      ctx.quadraticCurveTo(0, h * 0.12, -w / 2, 0);
      ctx.fillStyle = "#6BB8FF";
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#FF6B8B";
      ctx.fillRect(-w, -h * 0.62, w * 2, h * 0.16);
      ctx.fillRect(-w, -h * 0.26, w * 2, h * 0.16);
      ctx.restore();
      ctx.fillStyle = "#FFD54A";
      ellipse(0, -h, R * 0.09, R * 0.09);
      break;
    }
  }
  ctx.restore();
}

/** Round glasses, over the eyes so they still blink and look around behind them. */
function drawGlasses(R, rx, ry, s, face) {
  const ex = rx * 0.38, ey = -ry * 0.08, r = R * 0.34;
  ctx.save();
  ctx.strokeStyle = face.ink;
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * ex, ey, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-ex + r, ey);
  ctx.quadraticCurveTo(0, ey - R * 0.08, ex - r, ey);
  ctx.stroke();
  ctx.restore();
}

function drawEyes(o, R, rx, ry, s, face) {
  const ex = rx * 0.38, ey = -ry * 0.08;
  const ew = R * 0.25, eh = R * 0.3;
  ctx.lineCap = "round";
  ctx.strokeStyle = face.ink;
  ctx.lineWidth = Math.max(1, 1.8 * s);
  for (const side of [-1, 1]) {
    const cx = side * ex;
    switch (o.eyes) {
      case "happy":
        ctx.beginPath();
        ctx.arc(cx, ey + eh * 0.35, ew * 0.85, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        break;
      case "closed":
        ctx.beginPath();
        ctx.arc(cx, ey - eh * 0.25, ew * 0.85, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        break;
      case "x":
        ctx.beginPath();
        ctx.moveTo(cx - ew * 0.6, ey - ew * 0.6); ctx.lineTo(cx + ew * 0.6, ey + ew * 0.6);
        ctx.moveTo(cx + ew * 0.6, ey - ew * 0.6); ctx.lineTo(cx - ew * 0.6, ey + ew * 0.6);
        ctx.stroke();
        break;
      case "dizzy":
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.3) {
          const r = (a / (Math.PI * 4)) * ew * 1.05;
          const ang = a + o.t * 9 * side;
          ctx.lineTo(cx + Math.cos(ang) * r, ey + Math.sin(ang) * r);
        }
        ctx.lineWidth = Math.max(0.8, 1.3 * s);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, 1.8 * s);
        break;
      case "heart":
        ctx.fillStyle = "#FF4F86";
        heartPath(cx, ey - ew * 0.75, ew * 1.6 * (1 + Math.sin(o.t * 10) * 0.08));
        ctx.fill();
        break;
      default: {
        const wide = o.eyes === "wide" ? 1.18 : 1;
        const open = clamp(o.open, 0, 1);
        if (open < 0.25) {
          ctx.beginPath();
          ctx.moveTo(cx - ew * 0.75, ey); ctx.lineTo(cx + ew * 0.75, ey);
          ctx.stroke();
          break;
        }
        if (face.led) {
          // No pupils on a screen: the whole light looks where Pip looks.
          ctx.fillStyle = face.ink;
          ellipse(cx + o.look.x * ew * 0.3, ey + o.look.y * eh * 0.25, ew * 0.62 * wide, eh * 0.74 * wide * open);
          break;
        }
        ctx.fillStyle = "#FFFFFF";
        ellipse(cx, ey, ew * wide, eh * wide * open);
        const pr = R * (o.eyes === "wide" ? 0.1 : 0.15);
        const px = cx + o.look.x * ew * 0.42, py = ey + o.look.y * eh * 0.38 * open;
        ctx.fillStyle = INK;
        ellipse(px, py, pr, pr * Math.min(1, open * 1.3));
        ctx.fillStyle = "#FFFFFF";
        ellipse(px - pr * 0.35, py - pr * 0.4, pr * 0.34, pr * 0.34);
      }
    }
  }
}

function drawMouth(o, R, ry, s, face, mouth) {
  const my = ry * 0.4;
  ctx.strokeStyle = face.ink;
  ctx.fillStyle = face.led ? face.ink : "#3A2130";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.lineCap = "round";
  switch (mouth) {
    case "cat": // ω, hanging from the nose
      ctx.beginPath();
      ctx.moveTo(0, R * 0.25); ctx.lineTo(0, my - R * 0.04);
      ctx.moveTo(0, my - R * 0.04);
      ctx.arc(-R * 0.08, my - R * 0.04, R * 0.08, 0, Math.PI);
      ctx.moveTo(R * 0.16, my - R * 0.04);
      ctx.arc(R * 0.08, my - R * 0.04, R * 0.08, 0, Math.PI);
      ctx.stroke();
      break;
    case "bunny": // a little y, and two front teeth
      ctx.beginPath();
      ctx.moveTo(0, R * 0.24); ctx.lineTo(0, my - R * 0.06);
      ctx.moveTo(-R * 0.1, my - R * 0.02); ctx.lineTo(0, my - R * 0.06); ctx.lineTo(R * 0.1, my - R * 0.02);
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      ctx.lineWidth = Math.max(0.6, 0.9 * s);
      ctx.beginPath();
      ctx.roundRect(-R * 0.075, my - R * 0.03, R * 0.07, R * 0.11, R * 0.02);
      ctx.roundRect(R * 0.005, my - R * 0.03, R * 0.07, R * 0.11, R * 0.02);
      ctx.fill();
      ctx.stroke();
      break;
    case "pup": // a happy w with the tongue out
      ctx.fillStyle = "#FF7C9C";
      ellipse(0, my + R * 0.07, R * 0.07, R * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, R * 0.28); ctx.lineTo(0, my - R * 0.02);
      ctx.moveTo(0, my - R * 0.02);
      ctx.arc(-R * 0.1, my - R * 0.02, R * 0.1, 0, Math.PI * 0.85);
      ctx.moveTo(0, my - R * 0.02);
      ctx.arc(R * 0.1, my - R * 0.02, R * 0.1, Math.PI, Math.PI * 0.15, true);
      ctx.stroke();
      break;
    case "grin":
      ctx.beginPath();
      ctx.moveTo(-R * 0.2, my - R * 0.04);
      ctx.quadraticCurveTo(0, my + R * 0.34, R * 0.2, my - R * 0.04);
      ctx.closePath();
      ctx.fill();
      if (face.led) break;
      ctx.fillStyle = "#FF7C9C";
      ellipse(0, my + R * 0.1, R * 0.08, R * 0.05);
      break;
    case "o":
      ellipse(0, my + R * 0.04, R * 0.08, R * 0.1);
      break;
    case "yawn":
      ellipse(0, my + R * 0.06, R * 0.12, R * (0.12 + 0.08 * Math.abs(Math.sin(o.t * 2))));
      break;
    case "flat":
      ctx.beginPath(); ctx.moveTo(-R * 0.1, my); ctx.lineTo(R * 0.1, my); ctx.stroke();
      break;
    case "tongue":
      ctx.beginPath(); ctx.moveTo(-R * 0.12, my); ctx.lineTo(R * 0.12, my); ctx.stroke();
      ctx.fillStyle = "#FF7C9C";
      ellipse(R * 0.07, my + R * 0.06, R * 0.06, R * 0.07);
      break;
    case "hmm":
      ctx.beginPath(); ctx.moveTo(-R * 0.02, my + R * 0.02); ctx.lineTo(R * 0.14, my - R * 0.03); ctx.stroke();
      break;
    case "wavy":
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx.lineTo(-R * 0.18 + (i * R * 0.36) / 6, my + (i % 2 ? R * 0.05 : -R * 0.03));
      ctx.stroke();
      break;
    case "whistle":
      ellipse(R * 0.05, my + R * 0.02, R * 0.05, R * 0.055);
      break;
    default: // smile
      ctx.beginPath();
      ctx.arc(0, my - R * 0.1, R * 0.15, Math.PI * 0.18, Math.PI * 0.82);
      ctx.stroke();
  }
}
