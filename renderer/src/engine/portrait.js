// Capri's faces from the show, for her skin: in the notch she is a portrait in a
// cut-corner frame rather than a drawn creature, and her face changes with the
// mood. The images are loaded lazily; until one has arrived (or with no Image at
// all, as in the smoke test) the caller draws the drawn Capri instead.
//
// Layer 1: reads gfx.js and skin.js only.

import { ctx } from "./gfx.js";
import { plate, VIOLET, RED, GREEN } from "./skin.js";

// new URL(…, import.meta.url): vite copies these into the build; anything else
// (the smoke test's bundle) leaves them as plain file URLs it never loads.
const FILES = {
  calm: new URL("../assets/capri/face-calm.png", import.meta.url).href,
  aside: new URL("../assets/capri/face-aside.png", import.meta.url).href,
  smug: new URL("../assets/capri/face-smug.png", import.meta.url).href,
  wide: new URL("../assets/capri/face-wide.png", import.meta.url).href,
  look: new URL("../assets/capri/face-look.png", import.meta.url).href,
  laugh: new URL("../assets/capri/face-laugh.png", import.meta.url).href,
  many: new URL("../assets/capri/face-many.png", import.meta.url).href,
  grin: new URL("../assets/capri/capri-face.png", import.meta.url).href,
};
export const FACES = Object.keys(FILES);

const images = {};

function image(name) {
  if (typeof Image === "undefined") return null;
  let img = images[name];
  if (!img) {
    img = new Image();
    img.src = FILES[name] || FILES.calm;
    images[name] = img;
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Start loading every face, so the first change of mood doesn't flash. */
export function preload() {
  for (const name of FACES) image(name);
}

/**
 * Draw her face centred on x, y, `size` px across. False if the image isn't
 * there yet, so the caller can draw something else.
 *   o: { face, sx, sy, rot, glitch (0..1), dim (0..1), t }
 */
export function draw(x, y, size, o) {
  const img = image(o.face);
  if (!img) return false;
  const half = size / 2, cut = size * 0.18;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.rot || 0);
  ctx.scale(o.sx || 1, o.sy || 1);

  // Her violet copy, a step down and to the right, like all her panels.
  ctx.fillStyle = VIOLET;
  plate(ctx, -half + 3, -half + 3, size, size, cut);
  ctx.fill();

  // The face, clipped to the plate.
  ctx.save();
  plate(ctx, -half, -half, size, size, cut);
  ctx.clip();
  ctx.fillStyle = "#170F1F";
  ctx.fillRect(-half, -half, size, size);
  const g = o.glitch || 0;
  if (g > 0) {
    // A glitch: the face in horizontal slices, knocked sideways, red and green apart.
    const slices = 6;
    for (let i = 0; i < slices; i++) {
      const sy = (img.naturalHeight / slices) * i, sh = img.naturalHeight / slices;
      const dy = -half + (size / slices) * i, dh = size / slices;
      const dx = Math.sin(o.t * 70 + i * 2.7) * size * 0.12 * g;
      ctx.drawImage(img, 0, sy, img.naturalWidth, sh, -half + dx, dy, size, dh);
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.35 * g;
    ctx.fillStyle = RED;
    ctx.fillRect(-half - size * 0.06, -half, size, size);
    ctx.fillStyle = GREEN;
    ctx.fillRect(-half + size * 0.06, -half, size, size);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(img, -half, -half, size, size);
  }
  if (o.dim > 0) {
    ctx.fillStyle = `rgba(8,4,14,${0.6 * o.dim})`;
    ctx.fillRect(-half, -half, size, size);
  }
  ctx.restore();

  // A thin bright edge on the top and left, where her frames catch the light.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-half, half * 0.4);
  ctx.lineTo(-half, -half + cut);
  ctx.lineTo(-half + cut, -half);
  ctx.lineTo(half * 0.4, -half);
  ctx.stroke();
  ctx.restore();
  return true;
}
