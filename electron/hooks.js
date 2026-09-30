// Claude Code hooks: install/uninstall them in ~/.claude/settings.json (dated
// backup first, only our own entries touched), keep hook.js next to the event
// log in Pip's data folder, and tail that log.

const { app } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLAUDE_SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
// Marks the entries Pip wrote.
const MARKERS = ["Pip/hook.js"];
const EVENTS = [
  "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PostToolUseFailure", "PermissionRequest", "Notification", "Stop", "StopFailure",
  "SubagentStart", "SubagentStop",
];

const dataDir = () => app.getPath("userData");
const hookPath = () => path.join(dataDir(), "hook.js");
const logPath = () => path.join(dataDir(), "events.jsonl");

function bundledHook() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "hook.js")
    : path.join(__dirname, "..", "resources", "hook.js");
}

/** Keeps %APPDATA%\Pip\hook.js identical to the bundled copy. */
function ensureHookFile() {
  const src = fs.readFileSync(bundledHook());
  let current = null;
  try { current = fs.readFileSync(hookPath()); } catch {}
  if (!current || !current.equals(src)) {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(hookPath(), src);
  }
}

function readClaudeSettings() {
  if (!fs.existsSync(CLAUDE_SETTINGS)) return {};
  const text = fs.readFileSync(CLAUDE_SETTINGS, "utf8").replace(/^﻿/, "");
  if (!text.trim()) return {};
  const parsed = JSON.parse(text); // throws on bad JSON: never overwrite what we can't read
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("settings.json is not an object");
  return parsed;
}

const isOurs = (entry) =>
  (entry.hooks || []).some((h) => MARKERS.some((m) => (h.command || "").replace(/\\/g, "/").includes(m)));

function status() {
  try {
    const s = readClaudeSettings();
    const cmds = Object.values(s.hooks || {}).flat().flatMap((e) => (e.hooks || []).map((h) => h.command || ""));
    const current = cmds.some((c) => c.replace(/\\/g, "/").includes(hookPath().replace(/\\/g, "/")));
    return { installed: current, settingsPath: CLAUDE_SETTINGS, hookPath: hookPath() };
  } catch (err) {
    return { installed: false, error: err.message, settingsPath: CLAUDE_SETTINGS, hookPath: hookPath() };
  }
}

function write(install) {
  const settings = readClaudeSettings();
  let backup = null;
  if (fs.existsSync(CLAUDE_SETTINGS)) {
    backup = `${CLAUDE_SETTINGS}.bak-pip-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(CLAUDE_SETTINGS, backup);
  }
  const hooks = settings.hooks || {};
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue;
    hooks[ev] = hooks[ev].filter((e) => !isOurs(e));
    if (!hooks[ev].length) delete hooks[ev];
  }
  if (install) {
    const cmdPath = hookPath().replace(/\\/g, "/");
    for (const ev of EVENTS) {
      (hooks[ev] ||= []).push({ hooks: [{ type: "command", command: `node "${cmdPath}" ${ev}`, timeout: 5 }] });
    }
  }
  if (Object.keys(hooks).length) settings.hooks = hooks;
  else delete settings.hooks;
  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true });
  const tmp = CLAUDE_SETTINGS + ".pip-tmp";
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n");
  fs.renameSync(tmp, CLAUDE_SETTINGS);
  return { backup, ...status() };
}

/** Tails events.jsonl. `pump()` returns new events since the last call. */
function createTail() {
  let offset = 0;
  return {
    /** Start near the end so a fresh start only replays recent history. */
    seekTail(bytes = 64 * 1024) {
      try { offset = Math.max(0, fs.statSync(logPath()).size - bytes); } catch { offset = 0; }
    },
    pump() {
      let size;
      try { size = fs.statSync(logPath()).size; } catch { return []; }
      if (size < offset) offset = 0; // the hook trimmed the file
      if (size === offset) return [];
      const fd = fs.openSync(logPath(), "r");
      try {
        const buf = Buffer.alloc(size - offset);
        fs.readSync(fd, buf, 0, buf.length, offset);
        const last = buf.lastIndexOf(10);
        if (last < 0) return [];
        offset += last + 1;
        const out = [];
        for (const line of buf.subarray(0, last).toString("utf8").split("\n")) {
          try { out.push(JSON.parse(line)); } catch {}
        }
        return out;
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}

module.exports = { ensureHookFile, status, write, createTail, logPath };
