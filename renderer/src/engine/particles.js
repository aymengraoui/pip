// Confetti, hearts, sleepy z's, musical notes, puffs, sparks and smoke.
// One flat array; each kind differs only in how it is spawned and drawn.

import { clamp, pick, rand } from "./util.js";
import { ctx, ellipse, heartPath, FONT, H } from "./gfx.js";

const CONFETTI = ["#FF6B8B", "#FFC94D", "#5BE0A6", "#6BB8FF", "#C98BFF", "#FF9F5A"];

const SPAWN = {
  confetti: () => ({ vx: rand(-170, 170), vy: rand(-120, 40), g: 420, max: rand(1.2, 1.9), vr: rand(-12, 12), color: pick(CONFETTI), size: rand(3, 5) }),
  heart: () => ({ vx: rand(-55, 55), vy: rand(15, 60), g: -20, max: rand(0.9, 1.4), size: rand(7, 11), color: pick(["#FF5C8A", "#FF7AA2", "#FF9EBB"]) }),
  z: () => ({ vx: rand(14, 24), vy: rand(4, 10), max: 2.4, size: rand(9, 12), color: "#B9C2FF" }),
  note: () => ({ vx: rand(26, 40), vy: rand(8, 18), max: 1.6, size: rand(11, 14), color: pick(["#9BEACB", "#FFD37A", "#C9A6FF"]) }),
  puff: () => ({ vx: rand(-40, 40), vy: rand(-20, 30), max: rand(0.35, 0.6), size: rand(3, 6), color: "rgba(255,255,255,0.9)" }),
  spark: () => ({ vx: rand(-90, 90), vy: rand(-40, 70), max: rand(0.4, 0.7), size: rand(3, 5), color: pick(["#FFF3B0", "#FFFFFF", "#A6FFE0"]) }),
  smoke: () => ({ vx: rand(-15, 15), vy: rand(10, 25), max: rand(0.8, 1.2), size: rand(4, 7), color: "rgba(150,150,160,0.8)" }),
};

const particles = [];

export function emit(kind, x, y, n = 1) {
  const spawn = SPAWN[kind];
  if (!spawn) return;
  for (let i = 0; i < n; i++) {
    particles.push({ kind, x, y, vx: 0, vy: 0, g: 0, life: 0, max: 1, rot: rand(0, 6.28), vr: 0, size: 1, color: "#fff", ...spawn() });
  }
}

export function step(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life > p.max || p.y > H + 20) { particles.splice(i, 1); continue; }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.kind === "confetti") p.vx *= 0.985;
  }
}

export function draw(t) {
  for (const p of particles) {
    const k = p.life / p.max;
    const a = k > 0.7 ? (1 - k) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    switch (p.kind) {
      case "confetti":
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        break;
      case "heart":
        heartPath(0, -p.size / 2, p.size * (0.6 + 0.4 * Math.min(1, k * 4)));
        ctx.fill();
        break;
      case "z":
        ctx.font = `700 ${p.size * (0.7 + k * 0.6)}px ${FONT}`;
        ctx.fillText("z", Math.sin(t * 3 + p.rot) * 3, 0);
        break;
      case "note":
        ctx.font = `700 ${p.size}px "Segoe UI Symbol", ${FONT}`;
        ctx.fillText(p.rot > 3 ? "♪" : "♫", 0, Math.sin(t * 8 + p.rot) * 3);
        break;
      case "puff":
      case "smoke":
        ellipse(0, 0, p.size * (1 + k * 1.8), p.size * (1 + k * 1.8));
        break;
      case "spark": {
        const s = p.size * (1 - k * 0.5);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? s * 0.35 : s;
          const ang = (i * Math.PI) / 4 + p.rot;
          ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
}

export function clear() { particles.length = 0; }

export const any = (pred) => particles.some(pred);
export const count = () => particles.length;

/** How far down the window the particles reach, so the window can fit them. */
export function lowest(from = 0, pad = 20) {
  return particles.reduce((mx, p) => Math.max(mx, p.y + pad), from);
}
