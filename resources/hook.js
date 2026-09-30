// Pip hook: Claude Code runs this on every hook event.
// It appends one compact JSON line to events.jsonl and exits.
// Rules: never print to stdout (so it can never answer a permission prompt),
// never fail, never take long.

const fs = require("fs");
const path = require("path");

const LOG = path.join(__dirname, "events.jsonl");
const MAX_BYTES = 512 * 1024;
const KEEP_LINES = 300;
const AGENT_TOOLS = new Set(["Agent", "Task"]);

function clip(s, n = 160) {
  if (typeof s !== "string") return "";
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function summarize(input) {
  if (!input || typeof input !== "object") return "";
  const p = input.file_path || input.path || input.notebook_path;
  return clip(
    input.description || input.command || (p && path.basename(p)) ||
    input.pattern || input.url || input.query || input.prompt || ""
  , 80);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const e = JSON.parse(raw.replace(/^﻿/, ""));
    const input = e.tool_input || {};
    const spawnsAgent = AGENT_TOOLS.has(e.tool_name);
    const line = JSON.stringify({
      t: Date.now(),
      ev: e.hook_event_name || process.argv[2] || "",
      sid: e.session_id || "",
      cwd: e.cwd || "",
      tool: e.tool_name || "",
      tuid: e.tool_use_id || "",
      detail: summarize(input),
      msg: clip(e.message || e.prompt || ""),
      ntype: e.notification_type || "",
      // Set when the event fires inside a subagent, and on SubagentStart/Stop.
      aid: e.agent_id || "",
      atype: e.agent_type || (spawnsAgent ? input.subagent_type || "general-purpose" : ""),
      bg: spawnsAgent && input.run_in_background === true,
    }) + "\n";

    fs.appendFileSync(LOG, line);

    const size = fs.statSync(LOG).size;
    if (size > MAX_BYTES) {
      const lines = fs.readFileSync(LOG, "utf8").trimEnd().split("\n");
      fs.writeFileSync(LOG, lines.slice(-KEEP_LINES).join("\n") + "\n");
    }
  } catch {
    // Swallow everything: a broken companion must never break Claude Code.
  }
  process.exit(0);
});
setTimeout(() => process.exit(0), 3000).unref();
