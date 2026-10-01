// The notch's shape, and where everything in it sits.
//
// Three springs (width, height, how open it is) drive one layout pass per frame.
// From them we also work out:
//   - where Pip stands and how big it is
//   - where each sproutling wants to be (a row next to the text when compact,
//     its own line when the notch is open, the panel's bottom edge otherwise)
//   - which parts of the window take clicks (everything else is click-through)
//   - the shape React needs so a panel can sit inside the notch

import { clamp, lerp, project, Spring } from "./util.js";
import { textWidth, FONT, W } from "./gfx.js";
import { host, ui } from "./bridge.js";
import { AGENT_TOOLS, agents, lead, mood, MOODS, sessions } from "./model.js";
import { pip, isOver as isOverPip } from "./pip.js";
import { current as currentWorry } from "./watchdog.js";
import * as minis from "./minis.js";
import { mouse } from "./pointer.js";

export const ROW_TOP = 66;    // first row's top edge, below the header
export const ROW_H = 22;
const MAX_ROWS = 8;
const COMPACT_MINIS = 7;      // sproutlings that fit beside the text
// The playground: a strip under the notch that the helpers get to themselves as
// soon as there is more than one of them.
const PLAY_FROM = 2;          // live helpers before they go out to play
const PLAY_TOP = 14, PLAY_DEPTH = 34, PLAY_SIDE = 30;
const HOVER_IN = 0.45, HOVER_OUT = 0.4;

export const L = {
  w: new Spring(240, 170, 22),
  h: new Spring(48, 170, 22),
  ex: new Spring(0, 170, 22),   // 0 compact, 1 open
  x: 0,
};

let playing = false;           // the helpers are out in the playground
let pinned = false;            // clicked open, stays open
let hoverOpen = false, hoverSince = 0, leaveSince = 0;
let panel = null;              // { name, w, h } while React shows a panel inside
export let rows = [];
export let texts = { title: "", sub: "", textW: 0 };
export let hoveredMini = null;
export let hoveredRow = -1;
// Where "Review" sits while Claude is waiting on you, or null.
export let review = null;

let lastLayoutKey = "", lastHitKey = "";

export const panelName = () => (panel ? panel.name : null);
export const isPlaying = () => playing;
export const isExpanded = () => !!panel || pinned || hoverOpen;

/** React opened (or closed, with null) a panel inside the notch. */
export function setPanel(name, size) {
  panel = name ? { name, w: size.w, h: size.h } : null;
  if (!name) { pinned = false; hoverOpen = false; }
}

/**
 * A panel measured its content and wants to be that tall. Clamped to what the
 * window can show, and ignored for small wobbles so the notch isn't restless.
 */
export function resizePanel(h) {
  if (!panel) return;
  const next = clamp(Math.round(h), 180, 540);
  if (Math.abs(next - panel.h) < 6) return;
  panel.h = next;
}

export function togglePinned() {
  pinned = !pinned;
  if (!pinned) hoverOpen = false;
  return pinned;
}

// -- what the notch says ------------------------------------------------------

function buildTexts() {
  const n = sessions.size;
  let title = MOODS[mood].label;
  const busy = [...agents.values()].filter((m) => m.state !== "done").length;
  if (mood === "working") {
    if (lead && AGENT_TOOLS.has(lead.tool)) title = "Sending helpers";
    else if (lead && lead.tool && lead.state === "working") title = `Running ${lead.tool}`;
    else if (busy) title = "Helpers at work";
  }
  // Something looks stuck: that outranks whatever it was nominally doing.
  const worry = currentWorry();
  if (worry && (mood === "working" || mood === "thinking")) title = "This looks stuck";
  if (n > 1) title += `  ·  ${n} sessions`;

  let sub;
  if (mood === "sleeping") sub = n ? "Waiting for you" : "No Claude Code session yet";
  else if (worry && (mood === "working" || mood === "thinking")) sub = worry.text;
  else sub = [project(lead && lead.cwd), lead && lead.detail].filter(Boolean).join("  —  ") || "Claude Code";
  return { title, sub };
}

function buildRows() {
  const out = [];
  for (const s of [...sessions.values()].sort((a, b) => b.t - a.t)) out.push({ kind: "session", it: s });
  for (const m of [...agents.values()].sort((a, b) => a.born - b.born)) out.push({ kind: "agent", it: m });
  return out.slice(0, MAX_ROWS);
}

// -- the layout pass ----------------------------------------------------------

export function step(dt) {
  const tx = buildTexts();
  const tw = Math.min(220, textWidth(tx.title, `600 13px ${FONT}`));
  const sw = Math.min(220, textWidth(tx.sub, `11px ${FONT}`));
  texts = { ...tx, textW: Math.max(tw, sw, 60) };

  const live = [...agents.values()];
  // Out to play at two, back in the notch only once the last one has gone, so a
  // helper finishing doesn't yank the others back inside.
  if (live.length >= PLAY_FROM) playing = true;
  else if (!live.length) playing = false;

  const shown = Math.min(live.length, COMPACT_MINIS);
  // Playing helpers are under the notch, so the pill doesn't reserve room.
  const minisW = playing || !shown ? 0 : shown * 22 + (live.length > COMPACT_MINIS ? 24 : 0) + 4;
  // Claude is waiting: the notch carries a way straight to the terminal, and
  // has to be wide enough to hold it.
  const asking = mood === "approval" && lead && lead.pid;
  const compactW = clamp(58 + texts.textW + 16 + minisW + (asking ? 86 : 22), 230, 580);
  rows = buildRows();

  const expanded = isExpanded();
  L.ex.t = expanded ? 1 : 0;
  if (panel) {
    L.w.t = panel.w;
    L.h.t = panel.h;
  } else {
    L.w.t = expanded ? Math.max(470, compactW) : compactW;
    L.h.t = expanded ? ROW_TOP + Math.max(1, rows.length) * ROW_H + 12 : 48;
  }
  L.ex.step(dt); L.w.step(dt); L.h.step(dt);
  L.x = (W - L.w.v) / 2;

  // Compact only: once the notch is open, the rows and the panel say it better.
  review = asking && !panel && L.ex.v < 0.5
    ? { x: L.x + L.w.v - 80, y: 13, w: 68, h: 22, pid: lead.pid }
    : null;

  publishShape(expanded);
  publishHitRects();
  placePip();
  placeMinis(live, expanded);
}

/** Tell React where the notch will settle, so its panels can sit inside it. */
function publishShape(expanded) {
  const key = `${Math.round(L.w.t)},${Math.round(L.h.t)},${expanded},${panel ? panel.name : ""}`;
  if (key === lastLayoutKey) return;
  lastLayoutKey = key;
  ui.onLayout({ x: (W - L.w.t) / 2, w: L.w.t, h: L.h.t, expanded, panel: panel ? panel.name : null });
}

/**
 * Tell the main process which part of the window is solid: clicks and drops land
 * there, and everywhere else they go through to whatever is behind Pip.
 */
function publishHitRects() {
  const hw = Math.ceil(Math.max(L.w.v, L.w.t) / 8) * 8;
  const hh = Math.ceil(Math.max(L.h.v, L.h.t) / 8) * 8;
  const rects = [{ x: Math.round((W - hw) / 2) - 6, y: 0, w: hw + 12, h: hh + 6 }];
  // Pip leaves the notch when it leaps: it needs its own patch of window.
  if (pip.drop.v > 8) rects.push({ x: Math.round(pip.x) - 24, y: Math.round(pip.y) - 24, w: 48, h: 48 });
  // A sproutling outside the notch (playing, or parked on a panel's edge) gets
  // its own small patch, so it stays clickable without the whole strip of screen
  // under the notch swallowing clicks. Snapped to 16 px: they are always moving,
  // and this would otherwise be sent on every frame.
  for (const m of agents.values()) {
    const v = minis.viewOf(m);
    if (v.sc.v < 0.1) continue;
    const r = 13 * v.sc.v + 7;
    if (v.y.v + r <= hh + 6) continue; // already inside the notch's own rect
    rects.push({ x: Math.round((v.x.v - r) / 16) * 16, y: Math.round((v.y.v - r) / 16) * 16, w: 48, h: 48 });
  }
  const key = JSON.stringify(rects);
  if (key === lastHitKey) return;
  lastHitKey = key;
  host.setHitRects(rects);
}

function placePip() {
  const ex = clamp(L.ex.v, 0, 1.2);
  pip.x = L.x + lerp(30, 40, ex);
  pip.y = lerp(26, 34, ex) + pip.jump + pip.drop.v;
  pip.s = lerp(1, 1.3, ex);
}

function placeMinis(live, expanded) {
  const start = L.x + 58 + texts.textW + 16;
  const area = {
    x0: L.x + PLAY_SIDE, x1: L.x + L.w.v - PLAY_SIDE,
    y0: L.h.v + PLAY_TOP, y1: L.h.v + PLAY_TOP + PLAY_DEPTH,
  };
  live.forEach((m, i) => {
    const v = minis.viewOf(m);
    if (panel) {
      // A panel fills the notch: the sproutlings line up on its bottom edge,
      // still visible and still clickable.
      minis.settle(m);
      v.x.t = L.x + L.w.v - 34 - Math.min(i, 9) * 20;
      v.y.t = L.h.v + 9;
      v.sc.t = v.gone || i > 9 ? 0 : 0.55;
      return;
    }
    const rowIdx = rows.findIndex((r) => r.kind === "agent" && r.it === m);
    if (expanded && rowIdx >= 0) {
      // The notch is open and listing them: each one stands by its own line.
      minis.settle(m);
      v.x.t = L.x + 32;
      v.y.t = ROW_TOP + rowIdx * ROW_H + 11;
      v.sc.t = v.gone ? 0 : 0.66;
      return;
    }
    if (playing) {
      minis.roam(m, area);
      v.sc.t = v.gone ? 0 : 0.7;
      return;
    }
    minis.settle(m);
    v.x.t = start + 11 + Math.min(i, COMPACT_MINIS - 1) * 22;
    v.y.t = 26;
    v.sc.t = i > COMPACT_MINIS - 1 || v.gone ? 0 : 0.62;
  });
}

// -- hover --------------------------------------------------------------------

export function updateHover(t) {
  const overPill = mouse.in && mouse.x >= L.x - 2 && mouse.x <= L.x + L.w.v + 2 && mouse.y >= 0 && mouse.y <= L.h.v + 4;
  const overPip = mouse.in && isOverPip(mouse.x, mouse.y);

  // The hover bubble only helps when the rows aren't already spelling it out.
  hoveredMini = mouse.in && (panel || !isExpanded()) ? minis.at(mouse.x, mouse.y, 11) : null;
  hoveredRow = !panel && L.ex.v > 0.8 && overPill ? rowAt(mouse.x, mouse.y) : -1;

  if (panel) { hoverOpen = false; hoverSince = 0; return; }

  if (overPill && !overPip) {
    leaveSince = 0;
    if (!hoverSince) hoverSince = t;
    if (t - hoverSince > HOVER_IN) hoverOpen = true;
  } else if (!overPill) {
    hoverSince = 0;
    if (!leaveSince) leaveSince = t;
    if (t - leaveSince > HOVER_OUT) hoverOpen = false;
  }
}

/** Which row is at this point while the notch is open, or -1. */
export function rowAt(x, y) {
  if (panel || !rows.length) return -1;
  if (x < L.x || x > L.x + L.w.v || y < ROW_TOP || y > ROW_TOP + rows.length * ROW_H) return -1;
  const i = Math.floor((y - ROW_TOP) / ROW_H);
  return i >= 0 && i < rows.length ? i : -1;
}

/** The target a row points at, for the inspector. */
export function rowTarget(i) {
  const r = rows[i];
  return r ? { kind: r.kind, key: r.it.key } : null;
}

export const isOverPill = (x, y) => x >= L.x - 2 && x <= L.x + L.w.v + 2 && y >= 0 && y <= L.h.v + 4;

/** Still growing or shrinking? The frame-rate policy asks. */
export const settling = () => L.w.settling() || L.h.settling() || Math.abs(L.ex.v - L.ex.t) > 0.01;
