// Capri out on the desktop: the page inside the small window electron/roam.js
// moves around (hers alone; no other creature roams). Her full figure, small,
// leaning in from a screen edge, half hidden, glitching in and away, flickering
// while she lingers, and saying something now and then (voices.js, "peek").
//
// It runs as slowly as still looks right: every frame while something moves,
// a handful a second otherwise.

import { clean } from "../engine/look.js";
import { lines } from "../engine/voices.js";

const GLITCH_MS = 380;
const SHOWN = 0.55; // how much of her is on screen while she peeks

const el = document.createElement("canvas");
el.style.cssText = "display:block";
document.body.style.cssText = "margin:0;background:transparent;overflow:hidden";
document.body.appendChild(el);

let pose = { side: "right", enter: 0, leave: 0, look: clean(null) };
let hovering = false;

window.pip.onRoamPose((p) => {
  pose = { ...pose, ...p, look: p.look ? clean(p.look) : pose.look };
  kick();
});
// Listening now: anything said before this was lost, so ask for all of it.
window.pip.roamReady();

// -- Capri, peeking -----------------------------------------------------------------
// Her cut-out from capri-desktop, brightened the way that app's shader does, and
// tinted copies of it for the glitch's red, green and violet ghosts. She is small,
// low in the window, and the space beside her head is for what she says.

const FIG_H = 150; // her height on screen while she peeks, px
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

/** Where she is and how glitchy, this frame. Null while she is out of sight. */
function geometry(now) {
  const W = innerWidth, H = innerHeight;
  const enter = clamp01((Date.now() - (pose.enter || 0)) / GLITCH_MS);
  const leave = pose.leave ? clamp01((Date.now() - pose.leave) / GLITCH_MS) : 0;
  const transit = enter < 1 || leave > 0;
  const shown = SHOWN * (1 - Math.pow(1 - enter, 3)) * (1 - leave);
  if (shown <= 0.01) return null;
  const scale = FIG_H / figure.naturalHeight;
  const sw = figure.naturalWidth * scale, sh = figure.naturalHeight * scale;
  const t = now / 1000;
  return {
    W, H, sw, sh, t, transit,
    glitch: transit ? 1 : now < glitchUntil ? 0.55 : 0,
    x: W - sw * shown,
    y: H - sh - 6 + Math.sin(t * 1.7) * 3,
  };
}

/** Her figure, onto any canvas: the window's, or the hit test's (no glitch there). */
function paintFigure(c, g, plain = false) {
  const { W, x, y, sw, sh, t } = g;
  const glitch = plain ? 0 : g.glitch;
  c.save();
  // She faces left in the image: on the left edge she is mirrored to reach in.
  if (pose.side === "left") { c.translate(W, 0); c.scale(-1, 1); }
  // Leaning in from the edge, with a slow sway.
  c.translate(x + sw * 0.6, y + sh * 0.5);
  c.rotate(-0.14 + Math.sin(t * 0.9) * 0.03);
  c.translate(-(x + sw * 0.6), -(y + sh * 0.5));
  if (!plain) {
    c.globalAlpha = g.transit ? 0.55 + 0.45 * Math.random() : 1;
    c.filter = "saturate(1.7) brightness(1.3)";
  }
  if (glitch) {
    // Ghosts in red, green and violet, pulled apart...
    c.globalCompositeOperation = "lighter";
    const spread = 6 * glitch;
    for (const [color, dx] of [["#FF3B5C", -spread], ["#36FF7A", spread], ["#7A3CFF", spread * 0.4]]) {
      const ghost = tinted(color);
      if (ghost) { c.globalAlpha = 0.45 * glitch; c.drawImage(ghost, x + dx, y, sw, sh); }
    }
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = g.transit ? 0.6 + 0.4 * Math.random() : 1;
    // ...and her, in slices knocked sideways.
    const slices = 8;
    for (let i = 0; i < slices; i++) {
      const sy = (figure.naturalHeight / slices) * i, shh = figure.naturalHeight / slices;
      const dx = (Math.random() - 0.5) * 16 * glitch;
      c.drawImage(figure, 0, sy, figure.naturalWidth, shh, x + dx, y + (sh / slices) * i, sw, sh / slices);
    }
  } else {
    c.drawImage(figure, x, y, sw, sh);
  }
  c.restore();
}

/** Where her head is on screen (for the speech bubble's tail). */
function headOf(g) {
  const hx = g.x + g.sw * 0.55, hy = g.y + g.sh * 0.3;
  return { x: pose.side === "left" ? g.W - hx : hx, y: hy };
}

// -- what she says while she peeks -------------------------------------------------
// A line now and then, in her transmission plate: a moment after she glitches
// in (most of the time), then every 9-18 s while she lingers.

const LINE_S = 3.4;
const DECODE_S = 0.35;
const NOISE = "▚▞▙▟░▒#%&/<>01XZ";
let bubble = null;      // { text, t0 } in seconds
let nextLine = 0;       // performance.now() ms
let lastEnter = 0;

function sayNow(now) {
  const pool = lines(pose.look.kind, "peek", null);
  if (!pool) return;
  let text;
  do text = pool[Math.floor(Math.random() * pool.length)]; while (bubble && text === bubble.text && pool.length > 1);
  bubble = { text, t0: now / 1000 };
}

function scheduleLines(now, g) {
  if (pose.enter !== lastEnter) {
    // Just glitched in: usually something to say, a beat later.
    lastEnter = pose.enter;
    bubble = null;
    nextLine = Math.random() < 0.7 ? now + 700 : now + 4000 + Math.random() * 6000;
  }
  if (!g || g.transit || pose.leave) return;
  if (now > nextLine) {
    sayNow(now);
    nextLine = now + 9000 + Math.random() * 9000;
  }
}

function wrap(c, text, maxW) {
  const out = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? line + " " + word : word;
    if (c.measureText(next).width > maxW && line) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out.slice(0, 3);
}

function decoded(text, k) {
  if (k >= 1) return text;
  const chars = [...text];
  const shown = Math.floor(k * chars.length);
  let out = chars.slice(0, shown).join("");
  for (let i = shown; i < Math.min(chars.length, shown + 4); i++) out += chars[i] === " " ? " " : NOISE[(i * 5 + shown) % NOISE.length];
  return out;
}

function paintBubble(c, g, now) {
  if (!bubble) return;
  const t = now / 1000, age = t - bubble.t0;
  if (age > LINE_S || pose.leave) { bubble = null; return; }
  const head = headOf(g);
  c.save();
  c.globalAlpha = clamp01((LINE_S - age) / 0.3);
  c.font = '600 11px "Chakra Petch", "Segoe UI", sans-serif';
  const rows = wrap(c, bubble.text, 132).map((r, i, all) => decoded(r, clamp01((age / DECODE_S) * all.length - i)));
  const w = Math.max(...rows.map((r) => c.measureText(r).width)) + 18;
  const h = rows.length * 14 + 10;
  const right = pose.side !== "left";
  // Clear of her mane, which reaches well past her face.
  const bx = right ? Math.max(4, head.x - 38 - w) : Math.min(g.W - w - 4, head.x + 38);
  const by = Math.max(4, Math.min(g.H - h - 4, head.y - h - 14));
  const plate = (dx) => {
    c.beginPath();
    c.moveTo(bx + 6 + dx, by + dx);
    c.lineTo(bx + w + dx, by + dx);
    c.lineTo(bx + w + dx, by + h - 6 + dx);
    c.lineTo(bx + w - 6 + dx, by + h + dx);
    c.lineTo(bx + dx, by + h + dx);
    c.lineTo(bx + dx, by + 6 + dx);
    c.closePath();
    // a jagged tail toward her head
    const ex = right ? bx + w + dx : bx + dx, ey = by + h * 0.6 + dx;
    const tip = right ? head.x - 8 : head.x + 8;
    c.moveTo(ex, ey - 4);
    c.lineTo(tip + dx, head.y + dx);
    c.lineTo(ex + (right ? -3 : 3), ey + 1);
    c.lineTo(ex, ey + 4);
  };
  plate(3);
  c.fillStyle = "#7A3CFF";
  c.fill();
  plate(0);
  c.fillStyle = "#130D1A";
  c.fill();
  c.fillStyle = "#FF3B5C";
  c.fillRect(bx + 3, by + 4, 2, h - 8);
  c.fillStyle = "#F7EEF3";
  c.textBaseline = "top";
  rows.forEach((r, i) => c.fillText(r, bx + 10, by + 6 + i * 14));
  c.restore();
}

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
  if (now > nextGlitch) {
    glitchUntil = now + 120 + Math.random() * 160;
    nextGlitch = now + 2500 + Math.random() * 4500;
  }
  const g = geometry(now);
  scheduleLines(now, g);
  if (!g) return;
  paintFigure(c, g);
  paintBubble(c, g, now);
}

// -- the loop -------------------------------------------------------------------------

let timer = 0;
function loop() {
  const now = performance.now();
  drawPeek(now);
  const transit = Date.now() - (pose.enter || 0) < GLITCH_MS || (pose.leave && Date.now() - pose.leave < GLITCH_MS + 100);
  const decoding = bubble && now / 1000 - bubble.t0 < DECODE_S + 0.2;
  const fast = transit || now < glitchUntil || decoding;
  timer = fast ? requestAnimationFrame(loop) : setTimeout(loop, 66);
}
function kick() {
  cancelAnimationFrame(timer);
  clearTimeout(timer);
  loop();
}
figure.onload = kick;
loop();

// -- clicks -------------------------------------------------------------------------
// Only she takes clicks: tell the main process when the cursor is on her figure
// (drawn again, plain, onto a hidden canvas and read back), never on her bubble.

const hit = document.createElement("canvas");

function over(e) {
  const g = figure.naturalWidth && geometry(performance.now());
  if (!g) return false;
  hit.width = g.W;
  hit.height = g.H;
  const c = hit.getContext("2d", { willReadFrequently: true });
  paintFigure(c, g, true);
  try {
    return c.getImageData(Math.round(e.clientX), Math.round(e.clientY), 1, 1).data[3] > 40;
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
