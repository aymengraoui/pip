// The sproutlings: one per subagent.
//
// model.js owns what an agent *is*; this owns how it looks and moves. Each
// agent gets a `view` the first time we see it: three springs (x, y, scale)
// that start inside Pip, so the sproutling pops out of it and, when the agent
// finishes, puffs away.

import { clamp, now, rand, Spring } from "./util.js";
import { ctx, ellipse, FONT } from "./gfx.js";
import * as creature from "./creature.js";
import * as particles from "./particles.js";
import * as sound from "./sound.js";
import { agents, retire } from "./model.js";
import { pip, cheerSpawn } from "./pip.js";
import { focusedKey } from "./inspector.js";

const POOF_AFTER = 1.4; // seconds a finished sproutling sticks around
const HIT_R = 12;

// Springs are snappy when a sproutling has a place to be (a row, a panel edge)
// and loose when it is just ambling around the playground.
const SETTLED = { k: 110, d: 14 };
const ROAMING = { k: 52, d: 12 };
const HOP = 90;

/** The sproutling's springs and wobble, created on demand. */
export function viewOf(m) {
  if (!m.view) {
    m.view = {
      x: new Spring(pip.x, 110, 14),
      y: new Spring(pip.y, 110, 14),
      sc: new Spring(0, 220, 13),
      phase: rand(0, 6.28),
      blinkAt: now() + rand(1, 4),
      blinkUntil: 0,
      gone: false,
      removeAt: 0,
      roaming: false,   // ambling in the playground, on looser springs
      nextSpot: 0, nextHop: 0,
    };
  }
  return m.view;
}

// -- the playground -----------------------------------------------------------
// When more than one helper is working, they get a patch of screen under the
// notch to mill about in instead of being lined up inside it. layout.js decides
// where that patch is; this decides what they do with it.

/** Pick a spot, preferring one that isn't on top of somebody else. */
function spot(area, self) {
  let best = null, bestGap = -1;
  for (let i = 0; i < 4; i++) {
    const p = { x: rand(area.x0, area.x1), y: rand(area.y0, area.y1) };
    let gap = Infinity;
    for (const m of agents.values()) {
      if (m === self || !m.view) continue;
      gap = Math.min(gap, Math.hypot(p.x - m.view.x.t, p.y - m.view.y.t));
    }
    if (gap > bestGap) { bestGap = gap; best = p; }
  }
  return best;
}

/** Amble around `area`: a new spot every few seconds, and the odd little hop. */
export function roam(m, area) {
  const v = viewOf(m);
  const t = now();
  if (!v.roaming) {
    v.roaming = true;
    v.x.k = v.y.k = ROAMING.k;
    v.x.d = v.y.d = ROAMING.d;
    v.nextSpot = 0;
    v.nextHop = t + rand(0.8, 4);
  }
  if (t > v.nextSpot) {
    const p = spot(area, m);
    v.x.t = p.x;
    v.y.t = p.y;
    v.nextSpot = t + rand(1.4, 3.8);
  }
  if (t > v.nextHop) { v.y.vel -= HOP; v.nextHop = t + rand(2.5, 7); }
}

/** Back to a place it has to be: stiffen the springs again. */
export function settle(m) {
  const v = viewOf(m);
  if (!v.roaming) return;
  v.roaming = false;
  v.x.k = v.y.k = SETTLED.k;
  v.y.d = v.x.d = SETTLED.d;
}

/** How far down the window the sproutlings reach, so it can be sized to them. */
export function lowest(from = 0) {
  let bottom = from;
  for (const m of agents.values()) {
    const v = viewOf(m);
    if (v.sc.v > 0.05) bottom = Math.max(bottom, v.y.v + 13 * v.sc.v + 12);
  }
  return bottom;
}

// -- reactions from the model -------------------------------------------------

export function onSpawn(m) {
  const v = viewOf(m);
  v.y.vel = -160;                 // pops up out of Pip
  v.x.vel = rand(40, 120);        // and drifts to its place in the row
  if (!m.quiet) cheerSpawn();
}

export function onFinish(m) {
  const v = viewOf(m);
  v.y.vel = -140;                 // a little hop of pride
  particles.emit("spark", v.x.v, v.y.v, 5);
}

// -- per-frame ----------------------------------------------------------------

export function step(dt) {
  for (const m of agents.values()) {
    const v = viewOf(m);
    v.x.step(dt);
    v.y.step(dt);
    v.sc.step(dt);
  }
}

export function draw(t) {
  const focus = focusedKey();
  for (const m of agents.values()) {
    const v = viewOf(m);

    // Finished a moment ago: puff away, then let the model retire it.
    if (m.state === "done" && !v.gone && t - m.doneAt > POOF_AFTER) {
      v.gone = true;
      v.sc.t = 0;
      v.removeAt = t + 0.3;
      particles.emit("puff", v.x.v, v.y.v, 7);
      if (!m.quiet) sound.sfx.poof();
    }
    if (v.removeAt && t > v.removeAt) { retire(m); continue; }

    if (t > v.blinkAt) { v.blinkUntil = t + 0.12; v.blinkAt = t + rand(2, 5); }
    const sc = v.sc.v;
    if (sc < 0.02) continue;

    const working = m.state === "working";
    const doneK = m.state === "done" ? t - m.doneAt : -1;
    const strolling = v.roaming && Math.abs(v.x.vel) > 5;
    const bob = working
      ? -Math.abs(Math.sin(t * 7 + v.phase)) * 2.2
      : doneK >= 0 && doneK < 0.5 ? -Math.sin(doneK * Math.PI * 2) * 5 : 0;
    const y = v.y.v + bob;

    if (m.key === focus) drawFocusRing(v.x.v, y, sc, m.hue, t);

    creature.draw(v.x.v, y, sc, {
      pal: creature.palette(m.hue), t,
      sx: 1 + (working ? Math.sin(t * 7 + v.phase) * 0.04 : 0), sy: 1,
      rot: working ? Math.sin(t * 3 + v.phase) * 0.08 : 0,
      // Roaming, it looks where it is going; otherwise it glances about.
      look: v.roaming
        ? { x: clamp(v.x.vel / 45, -1, 1), y: 0.15 }
        : { x: working ? Math.sin(t * 1.7 + v.phase) : 0, y: working ? 0.4 : 0 },
      open: t < v.blinkUntil ? 0.05 : 1,
      eyes: m.state === "done" ? "happy" : "normal",
      mouth: m.state === "done" ? "grin" : Math.sin(t * 1.1 + v.phase) > 0.4 ? "tongue" : "flat",
      blush: 0.5,
      prop: working,
      leafSpin: t * 26 + v.phase,
      leafAngle: Math.sin(t * 2 + v.phase) * 0.2,
      walk: working || strolling,
    });

    if (m.state === "done" && doneK < 1.3) {
      ctx.fillStyle = "#34D17A";
      ctx.font = `700 ${10 * Math.min(1, doneK * 4)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("✓", v.x.v + 8, y - 6);
      ctx.textAlign = "left";
    }
  }
}

/** The one the inspector is showing wears a soft ring. */
function drawFocusRing(x, y, sc, hue, t) {
  const r = 13 * sc + 5 + Math.sin(t * 4) * 0.8;
  ctx.save();
  ctx.strokeStyle = `hsl(${hue},80%,72%)`;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = `hsl(${hue},80%,72%)`;
  ellipse(x, y, r, r);
  ctx.restore();
}

// -- queries ------------------------------------------------------------------

/** The sproutling under a point, if any. */
export function at(x, y, r = HIT_R) {
  let hit = null;
  for (const m of agents.values()) {
    const v = viewOf(m);
    if (v.sc.v > 0.1 && Math.hypot(x - v.x.v, y - v.y.v) < r) hit = m;
  }
  return hit;
}

/** Any sproutling still sliding into place, growing, or finishing? */
export function busy() {
  for (const m of agents.values()) {
    const v = viewOf(m);
    if (m.state === "done" || v.x.settling() || Math.abs(v.sc.v - v.sc.t) > 0.01) return true;
  }
  return false;
}
