// What Claude Code is doing, as data. Fed only by hook events; no drawing here.
//
// Two live maps and one short history:
//   sessions  sid -> session   one per Claude Code session (one terminal)
//   agents    key -> agent     one per subagent, drawn as a sproutling
//   history   the last few finished agents and sessions, for the inspector
//
// Every session and agent also keeps a small activity log (which tool ran, when,
// for how long, whether it failed): that log is what the inspector panel reads.
//
// The view reacts through setReactions(); the model never plays a sound or
// spawns a particle itself.

import { now, wall } from "./util.js";

export const MOODS = {
  approval: { accent: "#FF9F0A", label: "Needs you", p: 6 },
  error:    { accent: "#FF5A4E", label: "Oops, something failed", p: 5 },
  working:  { accent: "#3D9BFF", label: "Working", p: 4 },
  thinking: { accent: "#C07BFF", label: "Thinking…", p: 3 },
  finished: { accent: "#34D17A", label: "Done!", p: 2 },
  idle:     { accent: "#8E8E98", label: "Ready", p: 1 },
  sleeping: { accent: "#55555F", label: "Napping", p: 0 },
};

/** Tools that spawn a subagent. */
export const AGENT_TOOLS = new Set(["Agent", "Task"]);
const AGENT_HUES = { Explore: 205, Plan: 275, "general-purpose": 28, claude: 330 };

const LOG_MAX = 40;      // activity entries kept per session/agent
const HISTORY_MAX = 24;  // finished agents/sessions kept for the inspector
const STALE_MS = 30 * 60e3;

export const sessions = new Map();
export const agents = new Map();
export const history = [];

export let mood = "sleeping";
export let lead = null;

/** Running totals, so Pip can say what happened while you were away. */
export const totals = { turns: 0, failures: 0, helpers: 0, asked: 0 };

const reactions = { onSpawn() {}, onFinish() {}, onMood() {} };
export function setReactions(r) { Object.assign(reactions, r); }

const bootWall = wall();
let lastPoke = wall();
/** The user touched Pip: that counts as activity, so it does not nap. */
export function notePoke() { lastPoke = wall(); }

/** A stable colour per agent type, so the same kind of helper always matches. */
export function hueFor(type) {
  if (type in AGENT_HUES) return AGENT_HUES[type];
  let h = 7;
  for (const c of type) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// -- activity log -------------------------------------------------------------

// Entries are stamped with the event's own time, not the time we read it: the
// log is replayed from disk at startup, and "4 minutes ago" has to stay true.
function note(x, entry, t) {
  const e = { t: t || wall(), ...entry };
  x.log.push(e);
  if (x.log.length > LOG_MAX) x.log.shift();
  return e;
}

/**
 * A tool started. Claude Code runs several at once, so open calls are tracked by
 * tool_use_id; closing one must not close its siblings.
 */
function toolStart(x, e) {
  const entry = note(x, { kind: "tool", tool: e.tool || "", text: e.detail || "", id: e.tuid || "" }, e.t);
  x.tools++;
  x.open.set(entry.id, entry);
}

function closeTool(x, e, failed = false) {
  if (!x.open.size) return;
  // No id (or one we never saw start): close the most recent open call.
  let entry = x.open.get((e && e.tuid) || "");
  if (!entry) for (const open of x.open.values()) entry = open;
  if (!entry) return;
  entry.end = (e && e.t) || wall();
  if (failed) entry.failed = true;
  if (e && e.res) entry.result = e.res;
  x.open.delete(entry.id);
}

function closeAll(x, t) {
  for (const entry of x.open.values()) entry.end = t || wall();
  x.open.clear();
}

/** Every tool call still running, newest first. */
export const running = (x) => [...x.open.values()].sort((a, b) => b.t - a.t);

function remember(x) {
  history.unshift(x);
  if (history.length > HISTORY_MAX) history.pop();
}

// -- sessions & agents --------------------------------------------------------

function sessionOf(e) {
  const sid = e.sid || "default";
  let s = sessions.get(sid);
  if (!s) {
    s = {
      kind: "session", key: "s:" + sid, sid, state: "idle", tool: "", detail: "", cwd: "", pid: 0,
      t: e.t, startedWall: e.t || wall(), endedWall: 0, prompt: "",
      log: [], tools: 0, spawned: 0, open: new Map(),
    };
    sessions.set(sid, s);
  }
  if (e.cwd) s.cwd = e.cwd;
  if (e.pid) s.pid = e.pid;
  s.t = e.t;
  return s;
}

export function findAgent(pred) {
  for (const m of agents.values()) if (pred(m)) return m;
  return null;
}

function spawn(key, sid, type, desc, bg, t, quiet) {
  type = type || "agent";
  const m = {
    kind: "agent", key, sid, aid: "", type, desc: desc || "", tool: "", toolDetail: "",
    pid: (sessions.get(sid) || {}).pid || 0,   // the terminal it belongs to
    state: "working", bg: !!bg, t, quiet, hue: hueFor(type),
    born: now(), startedWall: t || wall(), doneAt: 0, endedWall: 0,
    log: [], tools: 0, open: new Map(),
    view: null, // the sproutling's springs, attached lazily by minis.js
  };
  note(m, { kind: "start", text: m.desc }, t);
  agents.set(key, m);
  reactions.onSpawn(m);
  return m;
}

/** Mark an agent finished. `quiet` means we are replaying: no fanfare. */
export function finish(m, quiet, t) {
  if (m.state === "done") return;
  m.state = "done";
  m.doneAt = now();
  m.endedWall = t || wall();
  m.quiet = quiet;
  m.tool = "";
  closeAll(m, t);
  note(m, { kind: "done" }, t);
  totals.helpers++;
  if (quiet) { agents.delete(m.key); return; }
  reactions.onFinish(m);
}

/** The view finished animating this agent away: drop it, but keep its story. */
export function retire(m) {
  agents.delete(m.key);
  if (!m.quiet) remember(m);
}

export const liveAgents = () => [...agents.values()].filter((m) => m.state !== "done");

// -- events -------------------------------------------------------------------

/**
 * Apply one hook event. `quiet` is set while replaying the log at startup or
 * after game mode, so nothing pops, sounds or throws confetti.
 */
export function apply(e, quiet) {
  if (!e || !e.ev) return;
  if (quiet && wall() - e.t > STALE_MS) return;
  const sid = e.sid || "default";

  if (e.ev === "SessionEnd") {
    const s = sessions.get(sid);
    if (s) {
      closeAll(s, e.t);
      note(s, { kind: "end" }, e.t);
      s.endedWall = e.t || wall();
      sessions.delete(sid);
      if (!quiet) remember(s);
    }
    for (const m of agents.values()) if (m.sid === sid) finish(m, quiet, e.t);
    return;
  }

  // Events fired inside a subagent drive that agent's sproutling, not Pip.
  if (e.aid && e.ev !== "SubagentStart" && e.ev !== "SubagentStop") {
    const m = findAgent((x) => x.aid === e.aid);
    if (m) {
      m.t = e.t;
      if (e.ev === "PreToolUse") {
        m.tool = e.tool;
        m.toolDetail = e.detail;
        toolStart(m, e);
      }
      if (e.ev === "PostToolUse" || e.ev === "PostToolUseFailure") {
        m.tool = "";
        closeTool(m, e, e.ev === "PostToolUseFailure");
      }
    }
    if (e.ev === "PermissionRequest" || (e.ev === "Notification" && e.ntype === "permission_prompt")) {
      const s = sessionOf(e);
      s.state = "approval";
      s.tool = e.tool;
      s.detail = e.detail || e.msg;
      note(s, { kind: "permission", tool: e.tool, text: e.detail || e.msg }, e.t);
      totals.asked++;
    }
    return;
  }

  const s = sessionOf(e);
  switch (e.ev) {
    case "SessionStart":
      s.state = "idle";
      note(s, { kind: "start" }, e.t);
      break;
    case "UserPromptSubmit":
      s.state = "thinking";
      s.tool = "";
      s.detail = e.msg;
      s.prompt = e.msg || s.prompt;
      closeAll(s, e.t);
      note(s, { kind: "prompt", text: e.msg }, e.t);
      break;
    case "PreToolUse":
      s.state = "working";
      s.tool = e.tool;
      s.detail = e.detail;
      toolStart(s, e);
      if (AGENT_TOOLS.has(e.tool) && e.tuid && !agents.has("tu:" + e.tuid)) {
        s.spawned++;
        spawn("tu:" + e.tuid, sid, e.atype, e.detail, e.bg, e.t, quiet);
      }
      break;
    case "PostToolUse":
    case "PostToolUseFailure":
      s.state = "thinking";
      s.tool = "";
      closeTool(s, e, e.ev === "PostToolUseFailure");
      if (e.ev === "PostToolUseFailure") totals.failures++;
      if (AGENT_TOOLS.has(e.tool)) {
        const m = agents.get("tu:" + e.tuid);
        // A background agent keeps working after its tool call returns.
        if (m && !m.bg) finish(m, quiet, e.t);
      }
      break;
    case "PermissionRequest":
      s.state = "approval";
      s.tool = e.tool;
      s.detail = e.detail;
      note(s, { kind: "permission", tool: e.tool, text: e.detail }, e.t);
      totals.asked++;
      break;
    case "Notification":
      if (e.ntype === "permission_prompt" || /permission/i.test(e.msg || "")) {
        s.state = "approval";
        s.detail = e.msg;
        note(s, { kind: "permission", text: e.msg }, e.t);
      }
      break;
    case "Stop":
      s.state = "finished";
      s.tool = "";
      s.detail = "";
      closeAll(s, e.t);
      note(s, { kind: "turn" }, e.t);
      totals.turns++;
      for (const m of agents.values()) if (m.sid === sid && !m.bg) finish(m, quiet, e.t);
      break;
    case "StopFailure":
      s.state = "error";
      s.detail = e.msg;
      closeAll(s, e.t);
      note(s, { kind: "error", text: e.msg }, e.t);
      totals.failures++;
      break;
    case "SubagentStart": {
      // The Agent tool call already made a sproutling; adopt it, so later events
      // from inside the agent (which carry only aid) find the same one.
      let m = findAgent((x) => x.sid === sid && !x.aid && x.state !== "done" && (!e.atype || x.type === e.atype))
           || findAgent((x) => x.sid === sid && !x.aid && x.state !== "done");
      if (!m) m = spawn("ag:" + e.aid, sid, e.atype, "", false, e.t, quiet);
      m.aid = e.aid;
      if (e.atype) { m.type = e.atype; m.hue = hueFor(e.atype); }
      m.t = e.t;
      break;
    }
    case "SubagentStop": {
      const m = (e.aid && findAgent((x) => x.aid === e.aid))
             || findAgent((x) => x.sid === sid && !x.aid && x.state !== "done");
      if (m) finish(m, quiet, e.t);
      break;
    }
  }
}

// -- mood ---------------------------------------------------------------------

/** Age out stale state, pick the session that speaks for Pip, return its mood. */
function computeMood() {
  const w = wall();
  lead = null;
  for (const s of sessions.values()) {
    const age = w - s.t;
    if (age > STALE_MS) { sessions.delete(s.sid); continue; }
    if (s.state === "finished" && age > 45e3) s.state = "idle";
    if (s.state === "error" && age > 180e3) s.state = "idle";
    if ((s.state === "thinking" || s.state === "working") && age > 10 * 60e3) s.state = "idle";
    const p = MOODS[s.state].p, tp = lead ? MOODS[lead.state].p : -1;
    if (p > tp || (p === tp && s.t > lead.t)) lead = s;
  }
  for (const m of agents.values()) {
    if (m.state !== "done" && w - m.t > (m.bg ? 60 : 30) * 60e3) finish(m, false);
  }
  const busyAgents = [...agents.values()].some((m) => m.state !== "done");
  let next = lead ? lead.state : "idle";
  if (next === "idle" && busyAgents) next = "working";
  if (next === "idle" && w - Math.max(lead ? lead.t : bootWall, lastPoke) > 3 * 60e3) next = "sleeping";
  return next;
}

/** Once per frame: update `mood`/`lead`, and announce a change to the view. */
export function refreshMood() {
  const next = computeMood();
  if (next !== mood) {
    const prev = mood;
    mood = next;
    reactions.onMood(prev, next);
  }
  return mood;
}

/** Replay path: land in the right mood without any fanfare. */
export function settleMood() {
  mood = computeMood();
  return mood;
}
