// Pure helpers: time, math, easing, springs, and formatting. No canvas, no state.

export const now = () => performance.now() / 1000;
export const wall = () => Date.now();

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const easeOutBack = (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

/** A critically-ish damped spring: set `.t` (target), call `.step(dt)`, read `.v`. */
export class Spring {
  constructor(v, k = 170, d = 18) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.d = d; }
  step(dt) {
    const f = -this.k * (this.v - this.t) - this.d * this.vel;
    this.vel += f * dt;
    this.v += this.vel * dt;
    return this.v;
  }
  /** Still visibly moving? The frame-rate policy asks this. */
  settling(eps = 0.5) { return Math.abs(this.v - this.t) > eps; }
}

/** Last path segment of a working directory: the project name. */
export function project(cwd) {
  if (!cwd) return "";
  const parts = cwd.split(/[\/]/).filter(Boolean);
  return parts[parts.length - 1] || cwd;
}

/** "12s" / "4m" / "2h" since a wall-clock timestamp. */
export function ago(ms) {
  const s = Math.max(0, Math.round((wall() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

/** A duration, for the inspector: "0.4s" / "12s" / "3m 20s". */
export function duration(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 1) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${Math.round(s % 60)}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
