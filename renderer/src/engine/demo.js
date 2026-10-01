// A scripted tour of every state, with three sproutlings. Reachable from
// Settings and the tray menu; also the quickest way to eyeball a change.
//
// It runs at half speed on purpose: this is something you watch, and the states
// it is showing off take a moment each to read. It can be stopped at any point,
// and stopping clears up after itself rather than leaving a ghost session
// sitting in the notch.

import { wall } from "./util.js";

const PACE = 2.2;          // everything takes this much longer than it reads
const SETTLE_MS = 2500;    // after the last event, before we call it finished

let timers = [];
let sid = "";
let onState = () => {};
let running = false;

export const isRunning = () => running;

/** Tell the app when a demo starts or stops, so buttons can say the right thing. */
export function watch(fn) { onState = fn || onState; }

function setRunning(on) {
  if (running === on) return;
  running = on;
  try { onState(on); } catch {}
}

export function stop(ingest) {
  for (const id of timers) clearTimeout(id);
  timers = [];
  // Tidy up: end the session so its sproutlings poof instead of lingering.
  if (sid && ingest) ingest({ events: [{ t: wall(), sid, ev: "SessionEnd" }], replay: false });
  sid = "";
  setRunning(false);
}

export function play(ingest) {
  stop(ingest);
  sid = "demo-" + Date.now();
  const cwd = "C:\\code\\demo-project";
  setRunning(true);

  let at = 0;
  const ev = (delay, e) => {
    at += delay * PACE;
    timers.push(setTimeout(() => {
      ingest({ events: [{ t: wall(), sid, cwd, ...e }], replay: false });
    }, at));
  };

  ev(0, { ev: "SessionStart" });
  ev(700, { ev: "UserPromptSubmit", msg: "add a dark mode" });
  ev(2200, { ev: "PreToolUse", tool: "Read", tuid: "r1", detail: "App.tsx" });
  ev(1400, { ev: "PostToolUse", tool: "Read", tuid: "r1", res: "240 lines" });
  ev(300, { ev: "PreToolUse", tool: "Agent", tuid: "d1", atype: "Explore", detail: "Find theme files" });
  ev(150, { ev: "SubagentStart", aid: "a1", atype: "Explore" });
  ev(600, { ev: "PreToolUse", tool: "Agent", tuid: "d2", atype: "Plan", detail: "Plan the dark mode" });
  ev(150, { ev: "SubagentStart", aid: "a2", atype: "Plan" });
  ev(600, { ev: "PreToolUse", tool: "Agent", tuid: "d3", atype: "general-purpose", detail: "Audit the colors", run_in_background: true });
  ev(150, { ev: "SubagentStart", aid: "a3", atype: "general-purpose" });
  ev(500, { ev: "PreToolUse", aid: "a1", tuid: "g1", tool: "Grep", detail: "theme" });
  ev(700, { ev: "PreToolUse", aid: "a3", tuid: "g2", tool: "Read", detail: "colors.css" });
  ev(900, { ev: "PostToolUse", aid: "a1", tuid: "g1", tool: "Grep", res: "18 matches in 6 files" });
  ev(600, { ev: "PreToolUse", aid: "a1", tuid: "g3", tool: "Read", detail: "tokens.css" });
  ev(900, { ev: "PostToolUseFailure", aid: "a1", tuid: "g3", tool: "Read", res: "error: no such file" });
  ev(1200, { ev: "SubagentStop", aid: "a1", atype: "Explore" });
  ev(100, { ev: "PostToolUse", tool: "Agent", tuid: "d1" });
  ev(1600, { ev: "SubagentStop", aid: "a2", atype: "Plan" });
  ev(100, { ev: "PostToolUse", tool: "Agent", tuid: "d2" });
  ev(900, { ev: "PermissionRequest", tool: "Bash", detail: "npm install" });
  ev(3500, { ev: "PreToolUse", tool: "Bash", tuid: "b1", detail: "npm install" });
  ev(1400, { ev: "SubagentStop", aid: "a3", atype: "general-purpose" });
  ev(100, { ev: "PostToolUse", tool: "Agent", tuid: "d3" });
  ev(1200, { ev: "PostToolUse", tool: "Bash", tuid: "b1", res: "added 42 packages" });
  ev(600, { ev: "Stop" });
  ev(5000, { ev: "StopFailure", msg: "demo: rate limited" });
  ev(4500, { ev: "SessionEnd" });

  // Let the last state be seen before the button goes back to saying "Demo".
  timers.push(setTimeout(() => { sid = ""; setRunning(false); }, at + SETTLE_MS));
}
