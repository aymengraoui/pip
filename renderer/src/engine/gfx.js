// The canvas: who owns it, how big it is, and the few path helpers everything
// draws with.
//
// `ctx` is exported as a live binding: modules `import { ctx }` once and see
// whatever canvas is attached. Nothing else reaches for the canvas directly.

export const W = 640, H = 600; // keep in sync with electron/main.js
export const FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';

export let ctx = null;
export let dpr = 1;

/** The notch canvas: W×H logical pixels, scaled for the display. */
export function attach(el) {
  ctx = el.getContext("2d");
  dpr = window.devicePixelRatio || 1;
  el.width = W * dpr;
  el.height = H * dpr;
  el.style.width = W + "px";
  el.style.height = H + "px";
  return ctx;
}

/** A square, unscaled canvas for the build-time app icon. */
export function attachSquare(el, size) {
  ctx = el.getContext("2d");
  dpr = 1;
  el.width = size;
  el.height = size;
  ctx.clearRect(0, 0, size, size);
  return ctx;
}

/** Start a frame: reset the transform and clear the rows we may draw into. */
export function beginFrame(height) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, height);
}

export function ellipse(x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

export function heartPath(x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
}

/** Truncate to fit `maxW` in the current font, with an ellipsis. */
export function fit(text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

export function textWidth(text, font) {
  ctx.font = font;
  return ctx.measureText(text).width;
}
