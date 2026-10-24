// Pip's settings, as plain JSON in %APPDATA%\Pip\settings.json.

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const FILE = () => path.join(app.getPath("userData"), "settings.json");

const DEFAULTS = {
  muted: false,
  // Whether the hook relay records a short line about how each tool call went.
  // Read by resources/hook.js, which sits next to this file.
  recordResults: true,
  gameMode: { enabled: true, fullscreen: true, extraExes: [] },
  // "follow" puts the notch on the screen you are working on; a display id pins
  // it to that screen for as long as it is plugged in.
  screen: "follow",
  // Where along the top of the screen the notch sits, as a fraction of the work
  // area's width: 0.5 is the middle. A fraction, so it survives a resolution
  // change or a move to another screen.
  notchX: 0.5,
  // What Pip is, its colour, what it wears, rosy cheeks, the notch's theme. Names are
  // the keys in renderer/src/engine/look.js; unknown ones fall back to defaults.
  // Keep in step with DEFAULT_LOOK there.
  look: { kind: "sprout", body: "mint", accessory: "none", cheeks: false, theme: "midnight" },
};

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (!(k in base)) continue; // drop settings from older versions
    out[k] = v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object"
      ? merge(base[k], v) : v;
  }
  return out;
}

let cache = null;
const settings = {
  get() {
    if (!cache) {
      let saved = {};
      try { saved = JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch {}
      cache = merge(DEFAULTS, saved);
    }
    return cache;
  },
  set(patch) {
    cache = merge(settings.get(), patch);
    fs.mkdirSync(path.dirname(FILE()), { recursive: true });
    const tmp = FILE() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, FILE());
    return cache;
  },
};

module.exports = { settings };
