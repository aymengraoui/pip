// A scripted tour of every state, with three sproutlings. Reachable from
// Settings and the tray menu; also the quickest way to eyeball a change.

import { wall } from "./util.js";

export function playDemo(ingest) {
  const sid = "demo-" + Date.now(), cwd = "C:\code\demo-project";
  let at = 0;
  const ev = (delay, e) => {
    at += delay;
    setTimeout(() => ingest({ events: [{ t: wall(), sid, cwd, ...e }], replay: false }), at);
  };

  ev(0, { ev: "SessionStart" });
  ev(700, { ev: "UserPromptSubmit", msg: "add a dark mode" });
  ev(2200, { ev: "PreToolUse", tool: "Read", detail: "App.tsx" });
  ev(1400, { ev: "PostToolUse", tool: "Read" });
  ev(300, { ev: "PreToolUse", tool: "Agent", tuid: "d1", atype: "Explore", detail: "Find theme files" });
  ev(150, { ev: "SubagentStart", aid: "a1", atype: "Explore" });
  ev(600, { ev: "PreToolUse", tool: "Agent", tuid: "d2", atype: "Plan", detail: "Plan the dark mode" });
  ev(150, { ev: "SubagentStart", aid: "a2", atype: "Plan" });
  ev(600, { ev: "PreToolUse", tool: "Agent", tuid: "d3", atype: "general-purpose", detail: "Audit the colors" });
  ev(150, { ev: "SubagentStart", aid: "a3", atype: "general-purpose" });
  ev(500, { ev: "PreToolUse", aid: "a1", tool: "Grep", detail: "theme" });
  ev(700, { ev: "PreToolUse", aid: "a3", tool: "Read", detail: "colors.css" });
  ev(1200, { ev: "SubagentStop", aid: "a1", atype: "Explore" });
  ev(100, { ev: "PostToolUse", tool: "Agent", tuid: "d1" });
  ev(1600, { ev: "SubagentStop", aid: "a2", atype: "Plan" });
  ev(100, { ev: "PostToolUse", tool: "Agent", tuid: "d2" });
  ev(900, { ev: "PermissionRequest", tool: "Bash", detail: "npm install" });
  ev(3500, { ev: "PreToolUse", tool: "Bash", detail: "npm install" });
  ev(1400, { ev: "SubagentStop", aid: "a3", atype: "general-purpose" });
  ev(100, { ev: "PostToolUse", tool: "Agent", tuid: "d3" });
  ev(1200, { ev: "PostToolUse", tool: "Bash", res: "added 42 packages" });
  ev(600, { ev: "Stop" });
  ev(5000, { ev: "StopFailure", msg: "demo: rate limited" });
  ev(4500, { ev: "SessionEnd" });
}
