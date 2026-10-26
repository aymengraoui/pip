// Capri's skin for the notch. Picking Capri in Settings swaps Pip's soft, round
// notch for hers: hard-edged plates with a violet misregistered copy behind them,
// her fonts, text that decodes in, glitches, and her faces from the show instead
// of a drawn creature (portrait.js). Any other creature is Pip's notch again;
// there is no separate switch, so changing back is just picking another one.
//
// Layer 1: reads look.js and gfx.js only.

import { FONT } from "./gfx.js";
import { get } from "./look.js";

/** Is Capri's skin on? */
export const isCapri = () => get().kind === "capri";

export const DISPLAY = '"Chakra Petch", "Segoe UI", sans-serif';
export const MONO = '"JetBrains Mono", Consolas, monospace';
export const VIOLET = "#7A3CFF";
export const RED = "#FF3B5C";
export const GREEN = "#36FF7A";
export const PAPER = "#F7EEF3";

/** The notch's title font: hers, or Pip's. */
export const titleFont = (px) => (isCapri() ? `600 ${px + 1}px ${DISPLAY}` : `600 ${px}px ${FONT}`);
/** The line under it: hers is mono, a size down. */
export const subFont = (px) => (isCapri() ? `${px - 1}px ${MONO}` : `${px}px ${FONT}`);
/** Body text in rows and the bubble. */
export const bodyFont = (px, weight = 600) => (isCapri() ? `${weight} ${px}px ${DISPLAY}` : `${weight} ${px}px ${FONT}`);

/** A plate with its corners cut off, the shape of all her panels. */
export function plate(ctx, x, y, w, h, cut = 8) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

// -- text that decodes in -------------------------------------------------------
// When the title changes, its letters come in two at a time behind a tail of
// noise, the way her transmissions do. One title at a time: the notch has one.

const NOISE = "▚▞▙▟░▒#%&/<>01XZ";
const DECODE_S = 0.32;
let dec = { text: "", t0: -1 };

export function decoded(text, t) {
  if (text !== dec.text) dec = { text, t0: t };
  const k = (t - dec.t0) / DECODE_S;
  if (k >= 1 || !isCapri()) return text;
  const chars = [...text];
  const shown = Math.floor(k * chars.length);
  let out = chars.slice(0, shown).join("");
  for (let i = shown; i < Math.min(chars.length, shown + 5); i++) {
    out += chars[i] === " " ? " " : NOISE[(i * 7 + Math.floor(t * 40)) % NOISE.length];
  }
  return out;
}

/** Still decoding? The frame-rate policy asks, so the noise moves. */
export const decoding = (t) => isCapri() && t - dec.t0 < DECODE_S;

/** Load her fonts before the canvas needs them (the panels load theirs from CSS). */
export function loadFonts() {
  try {
    document.fonts.load(`600 14px ${DISPLAY}`);
    document.fonts.load(`10px ${MONO}`);
  } catch {
    // no document (the smoke test): the canvas falls back to Pip's font
  }
}
