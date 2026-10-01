// Updates, from the GitHub releases this repo already publishes.
//
// electron-updater reads latest.yml off the newest release, downloads the
// installer in the background (differentially, via the .blockmap next to it) and
// stages it. We never restart on our own: Pip says it has grown, puts a button
// in Settings and the tray, and otherwise waits until you quit anyway.
//
// Two house rules:
//   - nothing happens while a game is running or Pip is paused; the whole point
//     of game mode is that Pip costs nothing, network included
//   - nothing here may throw or block startup: no update is always an option

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const FIRST_CHECK = 60e3;        // let the machine settle after login first
const EVERY = 6 * 3600e3;
const RETRY = 15 * 60e3;         // asleep, offline, or the check failed

let updater = null;
let notify = () => {};
let allowed = () => true;
let timer = null;
let state = { status: "idle", version: "", error: "" };

function set(status, patch = {}) {
  state = { status, version: "", error: "", ...patch };
  try { notify(state); } catch {}
}

function load() {
  if (updater) return updater;
  updater = require("electron-updater").autoUpdater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;   // the quiet path: it lands on next quit
  updater.logger = null;

  updater.on("checking-for-update", () => set("checking"));
  updater.on("update-available", (info) => set("downloading", { version: info && info.version }));
  updater.on("update-not-available", () => set("idle"));
  updater.on("update-downloaded", (info) => set("ready", { version: info && info.version }));
  updater.on("error", (err) => set("error", { error: (err && err.message) || String(err) }));
  return updater;
}

/**
 * electron-updater keeps the installer it applied: 107 MB sitting in its cache
 * for nothing, after every update. If the staged file is the version we are
 * already running, it has been consumed and can go. Anything still pending is
 * left alone.
 *
 * Called at startup and again on every check, because the startup attempt
 * usually fails: we were just launched *by* that installer, which is still
 * running and still holding the file open. A minute later it is gone.
 */
function tidyCache() {
  try {
    if (!process.env.LOCALAPPDATA) return 0;
    const dir = path.join(process.env.LOCALAPPDATA, `${app.getName().toLowerCase()}-updater`, "pending");
    const info = JSON.parse(fs.readFileSync(path.join(dir, "update-info.json"), "utf8"));
    const staged = (String(info.fileName).match(/(\d+\.\d+\.\d+)/) || [])[1];
    if (!staged || staged !== app.getVersion()) return 0;
    let freed = 0;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      try {
        freed += fs.statSync(file).size;
        fs.rmSync(file, { force: true, recursive: true });
      } catch {}
    }
    return freed;
  } catch {
    return 0; // no cache, nothing staged, or it is not ours to touch
  }
}

/** Check now, unless Pip is meant to be costing nothing. */
async function check(manual = false) {
  if (!app.isPackaged) return state;
  if (state.status === "ready" || state.status === "downloading") return state;
  if (!manual && !allowed()) return state;
  try {
    await load().checkForUpdates();
  } catch (err) {
    // Offline, rate limited, no release yet: all fine, we try again later.
    set("error", { error: (err && err.message) || String(err) });
  }
  return state;
}

function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    tidyCache(); // the startup attempt was probably too early; try again
    await check();
    // Asleep or failed: come back sooner than the usual six hours.
    schedule(state.status === "idle" ? EVERY : state.status === "ready" ? EVERY : RETRY);
  }, delay);
  if (timer.unref) timer.unref();
}

/**
 * @param {object} opts
 * @param {() => boolean} opts.canCheck  false while gaming or paused
 * @param {(state: object) => void} opts.onChange
 */
function init({ canCheck, onChange } = {}) {
  allowed = canCheck || allowed;
  notify = onChange || notify;
  if (!app.isPackaged) { set("dev"); return; }
  tidyCache(); // we may have just restarted into the update it left behind
  schedule(FIRST_CHECK);
}

/** Quit and install what we already downloaded. Only ever called by the user. */
function install() {
  if (state.status !== "ready") return false;
  try {
    load().quitAndInstall();
    return true;
  } catch (err) {
    set("error", { error: (err && err.message) || String(err) });
    return false;
  }
}

const status = () => ({ ...state, current: app.getVersion() });

module.exports = { init, check, install, status };
