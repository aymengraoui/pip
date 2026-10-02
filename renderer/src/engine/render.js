// The notch itself: the black pill, the two lines of header, the rows that
// appear when it opens, and the speech bubble under it.
//
// Pip and the sproutlings draw themselves (pip.js, minis.js); this is the
// furniture around them.

import { clamp, easeOutBack, lerp, project } from "./util.js";
import { ctx, ellipse, fit, FONT, W } from "./gfx.js";
import { agents, mood, MOODS } from "./model.js";
import { L, ROW_H, ROW_TOP, hoveredMini, hoveredRow, isPlaying, panelName, review, rows, texts } from "./layout.js";
import { pip } from "./pip.js";
import { current as currentBubble } from "./speech.js";

const SUB = "#9C9CA8";

export function drawPill(t) {
  const x = L.x, w = L.w.v, h = L.h.v, r = Math.min(20, h / 2), e = 10;
  const accent = MOODS[mood].accent;
  ctx.save();
  if (mood === "approval") {
    // The one state worth glowing for.
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12 + 10 * Math.sin(t * 5);
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
  }
  // A notch: square at the top where it meets the screen edge, round below,
  // with a small outward curve on each side so it grows out of the bezel.
  ctx.beginPath();
  ctx.moveTo(x - e, 0);
  ctx.quadraticCurveTo(x, 0, x, e);
  ctx.lineTo(x, h - r);
  ctx.arcTo(x, h, x + r, h, r);
  ctx.lineTo(x + w - r, h);
  ctx.arcTo(x + w, h, x + w, h - r, r);
  ctx.lineTo(x + w, e);
  ctx.quadraticCurveTo(x + w, 0, x + w + e, 0);
  ctx.closePath();
  ctx.fillStyle = "#0B0B0F";
  ctx.fill();
  ctx.restore();

  // A soft accent line along the bottom edge: the mood, at a glance.
  const lw = Math.max(0, w - r * 2 - 10);
  const grad = ctx.createLinearGradient(x + r, 0, x + r + lw, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, accent);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = mood === "sleeping" ? 0.25 : 0.7;
  ctx.fillStyle = grad;
  ctx.fillRect(x + r + 5, h - 1.5, lw, 1.5);
  ctx.globalAlpha = 1;
}

export function drawHeader(t) {
  const ex = clamp(L.ex.v, 0, 1);
  const tx = L.x + lerp(58, 72, ex);
  // When open, the right side of the header holds React's buttons.
  const maxW = lerp(texts.textW, L.w.v - 72 - 132, ex);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${lerp(13, 14, ex)}px ${FONT}`;
  ctx.fillText(fit(texts.title, maxW), tx, lerp(22, 28, ex));
  ctx.fillStyle = SUB;
  ctx.font = `11px ${FONT}`;
  ctx.fillText(fit(texts.sub, maxW), tx, lerp(38, 45, ex));

  // "Review" while Claude is waiting: one click to the terminal that is asking.
  if (review) {
    const r = review;
    const accent = MOODS.approval.accent;
    ctx.save();
    ctx.globalAlpha = 1 - ex * 2;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 11);
    ctx.fillStyle = "rgba(255,159,10,0.14)";
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("Review →", r.x + r.w / 2, r.y + 15);
    ctx.textAlign = "left";
    ctx.restore();
    return; // the dot would only crowd it
  }

  // Status dot, compact only: when open, buttons live there instead.
  if (ex < 0.6) {
    const pulse = mood === "approval" || mood === "working" ? 1 + 0.25 * Math.sin(t * 6) : 1;
    ctx.globalAlpha = 1 - ex / 0.6;
    ctx.fillStyle = MOODS[mood].accent;
    ellipse(L.x + L.w.v - 16, 24, 4 * pulse, 4 * pulse);
    ctx.globalAlpha = 1;
  }

  // "+n" when there are more sproutlings than fit beside the text. Out in the
  // playground they are all on screen, so there is nothing to count.
  const live = agents.size;
  if (live > 7 && ex < 0.5 && !isPlaying()) {
    ctx.globalAlpha = 1 - ex * 2;
    ctx.fillStyle = "#C9C9D2";
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(`+${live - 7}`, L.x + 58 + texts.textW + 16 + 7 * 22 + 4, 27);
    ctx.globalAlpha = 1;
  }
}

export function drawRows() {
  const ex = clamp(L.ex.v, 0, 1);
  if (ex < 0.35 || panelName()) return;
  ctx.save();
  ctx.globalAlpha = (ex - 0.35) / 0.65;
  ctx.beginPath();
  ctx.rect(L.x, 58, L.w.v, L.h.v - 58);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(L.x + 16, 58, L.w.v - 32, 1);

  if (!rows.length) {
    ctx.fillStyle = "#8C8C98";
    ctx.font = `11.5px ${FONT}`;
    ctx.fillText("Start Claude Code in any terminal — I'll keep you posted.", L.x + 22, ROW_TOP + 15);
  }

  const right = L.x + L.w.v - 18;
  rows.forEach((r, i) => {
    const y = ROW_TOP + i * ROW_H + 15;
    if (i === hoveredRow) {
      // Rows are clickable: this one would open the inspector.
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(L.x + 18, ROW_TOP + i * ROW_H + 1, L.w.v - 36, ROW_H - 2, 7);
      ctx.fill();
    }
    ctx.textAlign = "left";
    if (r.kind === "session") drawSessionRow(r.it, y, right);
    else drawAgentRow(r.it, y, right);
  });
  ctx.textAlign = "left";
  ctx.restore();
}

function drawSessionRow(s, y, right) {
  ctx.fillStyle = MOODS[s.state].accent;
  ellipse(L.x + 32, y - 4, 4, 4);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 12px ${FONT}`;
  const name = fit(project(s.cwd) || "session", 140);
  ctx.fillText(name, L.x + 48, y);
  const nw = ctx.measureText(name).width;

  ctx.fillStyle = SUB;
  ctx.font = `11.5px ${FONT}`;
  let what = MOODS[s.state].label;
  if (s.state === "working" && s.tool) what = s.tool;
  const extra = s.detail && s.state !== "finished" ? ` · ${s.detail}` : "";
  ctx.fillText(fit(what + extra, right - (L.x + 56 + nw)), L.x + 56 + nw, y);
}

function drawAgentRow(m, y, right) {
  // The sproutling itself stands at L.x + 32 on this line (see layout.js).
  ctx.fillStyle = `hsl(${m.hue},75%,76%)`;
  ctx.font = `600 12px ${FONT}`;
  const name = fit(m.type, 130);
  ctx.fillText(name, L.x + 48, y);
  const nw = ctx.measureText(name).width;

  ctx.fillStyle = SUB;
  ctx.font = `11.5px ${FONT}`;
  const doing = m.state === "done" ? "done ✓"
    : m.tool ? `${m.tool}${m.toolDetail ? " " + m.toolDetail : ""}`
    : m.desc || "working";
  // No " · background" tag: every agent is a background agent now, so it
  // would be on every row and tell you nothing.
  ctx.fillText(fit(doing, right - (L.x + 56 + nw)), L.x + 56 + nw, y);
}

/**
 * Pip's speech, or a label for the sproutling under the cursor.
 *
 * It hangs off whoever is speaking rather than off the notch, which matters now
 * that Pip moves: it steps aside when a helper is on stage, and it leaps out of
 * the notch when something finishes. The one exception is a panel being open —
 * the panel is DOM, drawn over this canvas, so a bubble up there would simply be
 * invisible. In that case it drops below the notch where it can be seen.
 */
export function drawBubble(t) {
  let text = null, t0 = 0, until = 0;
  let speaker = { x: pip.x, y: pip.y, r: pip.radius() };
  const bubble = currentBubble(t);
  if (bubble) ({ text, t0, until } = bubble);
  if (hoveredMini) {
    const m = hoveredMini;
    text = `${m.type}: ${m.state === "done" ? "done!" : m.tool || m.desc || "working"} · click for details`;
    speaker = { x: m.view.x.v, y: m.view.y.v, r: 13 * m.view.sc.v };
    t0 = t - 1;
    until = t + 1;
  }
  if (!text) return;
  const x = speaker.x;

  const k = clamp((t - t0) / 0.18, 0, 1);
  const fade = clamp((until - t) / 0.25, 0, 1);
  const sc = easeOutBack(k);
  ctx.font = `600 12px ${FONT}`;
  const label = fit(text, 300);
  const bw = ctx.measureText(label).width + 18, bh = 24;
  // Close enough that the tail can bridge the gap and touch whoever is talking:
  // a bubble floating under the notch reads as the notch talking, not Pip.
  // Pip lives inside the notch, so 9px under its chin is exactly the frame's
  // bottom edge and the bubble never looks attached to it. 1px tucks it up
  // under the chin instead, overlapping the frame: the bubble draws last, so
  // it sits over the notch. A hovered sproutling is out in the open and keeps
  // the original gap.
  const under = speaker.y + speaker.r + (hoveredMini ? 9 : 1);
  const by = panelName() ? Math.max(under, L.h.v + 10) : under;
  // The tail stretches up to the speaker, within reason. Too far (a panel has
  // pushed the bubble down the screen) and it is better to have no tail at all.
  const reach = by - (speaker.y + speaker.r * 0.8);
  const tail = reach <= 26 ? clamp(reach, 5, 26) : 0;
  const bx = clamp(x - bw / 2, 6, W - bw - 6);

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, by);
  ctx.scale(sc, sc);
  ctx.translate(-x, -by);
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 11);
  if (tail) {
    ctx.moveTo(x - 6, by + 1);
    ctx.lineTo(x, by - tail);
    ctx.lineTo(x + 6, by + 1);
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1B1B22";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + 9, by + bh / 2 + 0.5);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}
