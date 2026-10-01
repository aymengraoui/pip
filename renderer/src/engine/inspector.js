// The inspector: what one session or subagent is doing, right now, as plain
// data for the React panel to render.
//
// Click a sproutling (or a row in the open notch) and this becomes its focus;
// the panel then polls snapshot() a few times a second. Nothing here draws, and
// nothing here keeps its own copy of the truth: it reads model.js every call, so
// the panel is never stale.

import { MOODS, agents, history, lead, running, sessions } from "./model.js";
import { project } from "./util.js";
import { check as checkStuck } from "./watchdog.js";

const AGENT_STATES = {
  working: { label: "Working", accent: "#3D9BFF" },
  done: { label: "Finished", accent: "#34D17A" },
};

let focus = null; // { kind: "agent" | "session", key }

export const isOpen = () => !!focus;
export const focusedKey = () => (focus ? focus.key : "");

export function open(target) {
  focus = target && target.key ? { kind: target.kind, key: target.key } : null;
  return focus;
}

export function close() { focus = null; }

/** Clicking the thing already shown closes the panel again. */
export function toggle(target) {
  if (focus && target && focus.key === target.key) { focus = null; return null; }
  return open(target);
}

/** The target that a click on Pip or the pill should show: the loudest session. */
export function leadTarget() {
  const s = lead || [...sessions.values()].sort((a, b) => b.t - a.t)[0];
  return s ? { kind: "session", key: s.key } : null;
}

function find(key) {
  for (const s of sessions.values()) if (s.key === key) return { it: s, live: true };
  const a = agents.get(key);
  if (a) return { it: a, live: true };
  const old = history.find((x) => x.key === key);
  return old ? { it: old, live: false } : null;
}

function peers() {
  const out = [];
  for (const s of [...sessions.values()].sort((a, b) => b.t - a.t)) {
    out.push({ key: s.key, kind: "session", name: project(s.cwd) || "session", hue: -1, state: s.state, label: MOODS[s.state].label });
  }
  for (const m of [...agents.values()].sort((a, b) => a.born - b.born)) {
    out.push({ key: m.key, kind: "agent", name: m.type, hue: m.hue, state: m.state, label: AGENT_STATES[m.state] ? AGENT_STATES[m.state].label : m.state });
  }
  return out;
}

/**
 * One log entry. A finished tool call carries how long it took, which is a fact
 * about the task and never changes. A running one carries no number at all: a
 * clock that ticks in the panel means re-rendering it forever for no new
 * information.
 */
function entry(e) {
  const running = e.kind === "tool" && !e.end;
  return {
    t: e.t,
    kind: e.kind,
    tool: e.tool || "",
    text: e.text || "",
    result: e.result || "",
    failed: !!e.failed,
    running,
    ms: e.kind === "tool" && !running ? e.end - e.t : 0,
  };
}

/**
 * Everything the panel shows, or null when nothing is focused (or the focused
 * thing has aged out of history entirely).
 */
export function snapshot() {
  if (!focus) return null;
  const found = find(focus.key);
  if (!found) return { key: focus.key, missing: true, peers: peers() };
  const { it, live } = found;
  const agent = it.kind === "agent";
  const state = agent ? (AGENT_STATES[it.state] || { label: it.state, accent: "#8E8E98" }) : MOODS[it.state];
  const inFlight = running(it);

  return {
    key: it.key,
    kind: it.kind,
    live,
    name: agent ? it.type : project(it.cwd) || "session",
    project: project(it.cwd),
    hue: agent ? it.hue : -1,
    state: it.state,
    stateLabel: state.label,
    accent: state.accent,
    background: agent ? !!it.bg : false,
    pid: it.pid || 0,
    stuck: live ? checkStuck(it) : null,
    desc: agent ? it.desc : it.prompt || "",
    tools: it.tools,
    spawned: agent ? 0 : it.spawned,
    // Several tool calls can be in flight at once; the newest is the headline.
    doing: inFlight[0] ? { tool: inFlight[0].tool, text: inFlight[0].text } : null,
    alsoRunning: Math.max(0, inFlight.length - 1),
    log: it.log.slice().reverse().map(entry),
    peers: peers(),
  };
}
