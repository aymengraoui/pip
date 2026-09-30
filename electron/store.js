// Pip's settings, as plain JSON in %APPDATA%\Pip\settings.json.

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const FILE = () => path.join(app.getPath("userData"), "settings.json");

const DEFAULTS = {
  muted: false,
  gameMode: { enabled: true, fullscreen: true, extraExes: [] },
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
