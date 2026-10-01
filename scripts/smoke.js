// Headless smoke test for the renderer engine: feeds it hook events, clicks on
// it, and runs thousands of frames against a stub canvas and a virtual clock.
//
// It draws nothing and asserts nothing about pixels: it is here to prove every
// code path still runs, which is what a refactor can quietly break.
//
//   npm run smoke
//
// Bundled first (the engine is ESM that Node would otherwise read as CommonJS),
// see the "smoke" script in package.json.

import * as engine from "../renderer/src/engine/index.js";
import { agents, sessions, history } from "../renderer/src/engine/model.js";
import { viewOf } from "../renderer/src/engine/minis.js";
import { L } from "../renderer/src/engine/layout.js";
import * as watchdog from "../renderer/src/engine/watchdog.js";
import { review } from "../renderer/src/engine/layout.js";

// -- virtual clock, so 10 minutes of Pip take 20 ms ---------------------------

let vt = 0; // ms
let nextId = 1;
const timers = [];
const frames = [];
let framesRun = 0;

const stubTimers = () => {
  globalThis.setTimeout = (fn, ms = 0) => { const t = { id: nextId++, due: vt + ms, fn }; timers.push(t); return t.id; };
  globalThis.clearTimeout = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  globalThis.setInterval = globalThis.setTimeout;
  globalThis.clearInterval = globalThis.clearTimeout;
  globalThis.requestAnimationFrame = (fn) => { const f = { id: nextId++, fn }; frames.push(f); return f.id; };
  globalThis.cancelAnimationFrame = (id) => { const i = frames.findIndex((f) => f.id === id); if (i >= 0) frames.splice(i, 1); };
  Object.defineProperty(globalThis, "performance", { value: { now: () => vt }, writable: true, configurable: true });
  // Wall time moves with the virtual clock too: the model ages sessions, lets
  // Pip nap and drops stale state by Date.now().
  const base = Date.now();
  Date.now = () => base + vt;
};

/** Advance `ms` of wall time in 16 ms slices, running timers and frames. */
function advance(ms) {
  for (let left = ms; left > 0; left -= 16) {
    vt += Math.min(16, left);
    for (const t of timers.filter((t) => t.due <= vt)) {
      globalThis.clearTimeout(t.id);
      t.fn();
    }
    for (const f of frames.splice(0, frames.length)) { framesRun++; f.fn(); }
  }
}

// -- stub DOM ----------------------------------------------------------------

function stubCtx() {
  const self = {
    measureText: (s) => ({ width: String(s).length * 6 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(self, {
    get: (o, k) => (k in o ? o[k] : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
}

function stubCanvas() {
  const on = {};
  return {
    style: {}, width: 0, height: 0,
    getContext: () => stubCtx(),
    addEventListener: (k, fn) => ((on[k] ||= []).push(fn)),
    fire: (k, ev) => (on[k] || []).forEach((fn) => fn(ev)),
    toDataURL: () => "data:,",
  };
}

function stubWindow() {
  const on = {};
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener: (k, fn) => ((on[k] ||= []).push(fn)),
    removeEventListener: () => {},
  };
  globalThis.AudioContext = class {
    constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
    resume() {} suspend() {}
    createOscillator() { return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; }
  };
}

// -- assertions ---------------------------------------------------------------

let failures = 0;
function check(name, ok, extra = "") {
  if (ok) { console.log(`  ok   ${name}`); return; }
  failures++;
  console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`);
}

// -- the run ------------------------------------------------------------------

stubTimers();
stubWindow();

const seen = { hitRects: 0, winHeight: 0, layout: 0, inspect: [], menu: 0, focused: [], waiting: [] };
const canvas = stubCanvas();

engine.init(canvas, {
  setHitRects: () => seen.hitRects++,
  setWinHeight: () => seen.winHeight++,
  menu: () => seen.menu++,
  focusSession: (pid) => { seen.focused.push(pid); return { ok: true, how: "focused" }; },
  setWaiting: (pid) => seen.waiting.push(pid),
}, {
  onLayout: () => seen.layout++,
  onInspect: (target) => seen.inspect.push(target),
});

// Long enough for the hello bubble to come and go, so the window has both grown
// and shrunk back.
advance(6000);
check("frames run after init", framesRun > 10, `${framesRun} frames`);
check("told the host its shape", seen.hitRects > 0 && seen.layout > 0 && seen.winHeight > 0, JSON.stringify(seen));

// A full session, the way the hook relays it.
const sid = "smoke-1";
const cwd = "C:\\code\\smoke";
const feed = (events, replay = false) => engine.ingest({ events: events.map((e) => ({ t: Date.now(), sid, cwd, ...e })), replay });

feed([{ ev: "SessionStart", pid: 4242 }, { ev: "UserPromptSubmit", msg: "ship the thing" }]);
advance(400);
check("a session appeared", sessions.size === 1);
check("mood follows the session", engine.frameStats().mood === "thinking");

feed([{ ev: "PreToolUse", tool: "Read", detail: "App.tsx" }]);
advance(200);
feed([{ ev: "PostToolUse", tool: "Read", res: "120 lines" }]);
feed([
  { ev: "PreToolUse", tool: "Agent", tuid: "t1", atype: "Explore", detail: "find the theme" },
  { ev: "SubagentStart", aid: "a1", atype: "Explore" },
  { ev: "PreToolUse", tool: "Agent", tuid: "t2", atype: "Plan", detail: "plan it", run_in_background: true },
  { ev: "SubagentStart", aid: "a2", atype: "Plan" },
]);
advance(600);
check("two sproutlings sprouted", agents.size === 2, `${agents.size}`);

feed([{ ev: "PreToolUse", aid: "a1", tool: "Grep", detail: "theme" }]);
advance(800);

// -- the playground -----------------------------------------------------------

const crew = [...agents.values()];
advance(3000);
const depths = crew.map((m) => viewOf(m).y.v);
check("two helpers go out to play below the notch", depths.every((y) => y > L.h.v + 6), JSON.stringify(depths.map(Math.round)));
check("they spread out instead of stacking", Math.abs(viewOf(crew[0]).x.v - viewOf(crew[1]).x.v) > 20);

const spots = crew.map((m) => viewOf(m).x.t);
advance(6000);
check("and keep moving around", crew.some((m, i) => Math.abs(viewOf(m).x.t - spots[i]) > 1));

// Where they go comes from what they are doing, not from a dice roll.
feed([{ ev: "PreToolUse", aid: "a1", tool: "Grep", detail: "same" }]);
feed([{ ev: "PreToolUse", aid: "a2", tool: "Grep", detail: "same" }]);
// Where they wander is chance; that they keep ending up together is not. Sample
// the gap over a while and take the closest they got, or this test flaps.
let closest = Infinity;
for (let i = 0; i < 12; i++) {
  advance(1000);
  const a = viewOf(crew[0]), b = viewOf(crew[1]);
  closest = Math.min(closest, Math.hypot(a.x.t - b.x.t, a.y.t - b.y.t));
}
check("two helpers on the same tool keep ending up together", closest < 60, `closest was ${Math.round(closest)} px`);

// A failure keeps one of them low and still.
feed([{ ev: "PostToolUseFailure", aid: "a1", tool: "Grep", res: "error: no matches" }]);
feed([{ ev: "PreToolUse", aid: "a1", tool: "Read", detail: "notes.md" }]);
advance(9000);
const sulker = [...agents.values()].find((m) => m.aid === "a1");
check("a helper that just failed keeps to the lower half", viewOf(sulker).y.t > L.h.v + 28, String(Math.round(viewOf(sulker).y.t - L.h.v)));

// Put a1 back where the inspector checks below expect to find it.
feed([{ ev: "PostToolUse", aid: "a1", tool: "Read" }, { ev: "PreToolUse", aid: "a1", tool: "Grep", detail: "theme" }]);
advance(300);

// -- the inspector ------------------------------------------------------------

const explore = [...agents.values()].find((m) => m.type === "Explore");
check("the agent is holding a tool", explore && explore.tool === "Grep");

const v = viewOf(explore);
canvas.fire("mousedown", { button: 0, clientX: v.x.v, clientY: v.y.v });
advance(100);
check("clicking a sproutling asks for the inspector", seen.inspect.length === 1 && seen.inspect[0] && seen.inspect[0].kind === "agent");

engine.setPanel("inspect", { w: 520, h: 420 });
advance(600);

let snap = engine.inspectSnapshot();
check("the snapshot is the agent we clicked", snap && snap.key === explore.key);
check("a helper inherits its session's terminal", snap && snap.pid === 4242, snap && String(snap.pid));
check("it says what is running now", snap && snap.doing && snap.doing.tool === "Grep", snap && JSON.stringify(snap.doing));
check("the headline carries the detail, not a clock", snap && snap.doing.text === "theme" && snap.doing.ms === undefined);
check("the activity log has entries", snap && snap.log.length >= 2, snap && String(snap.log.length));
check("the log is newest first", snap && snap.log[0].t >= snap.log[snap.log.length - 1].t);
check("peers are offered", snap && snap.peers.length >= 2);

// Following a peer, then the session itself.
const peer = snap.peers.find((p) => p.key !== snap.key);
engine.focusInspect({ kind: peer.kind, key: peer.key });
advance(100);
check("following a peer switches the panel", engine.inspectSnapshot().key === peer.key);

const session = [...sessions.values()][0];
engine.focusInspect({ kind: "session", key: session.key });
snap = engine.inspectSnapshot();
check("a session snapshot counts its helpers", snap.spawned === 2, String(snap.spawned));
check("a session snapshot keeps the prompt", snap.desc === "ship the thing");
check("it remembers which process to jump to", snap.pid === 4242, String(snap.pid));

// Clicking the same sproutling again closes it.
engine.focusInspect({ kind: "agent", key: explore.key });
canvas.fire("mousedown", { button: 0, clientX: v.x.v, clientY: v.y.v });
check("clicking it again closes the inspector", seen.inspect[seen.inspect.length - 1] === null);
engine.setPanel(null);
advance(400);

// -- parallel tool calls, and timestamps that survive a replay ----------------

const sid2 = "smoke-2";
const back = Date.now() - 20000;
const feed2 = (events) => engine.ingest({ events: events.map((e) => ({ t: Date.now(), sid: sid2, cwd, ...e })), replay: false });

feed2([
  { ev: "SessionStart", t: back },
  { ev: "PreToolUse", tool: "Bash", tuid: "p1", detail: "npm test", t: back + 1000 },
  { ev: "PreToolUse", tool: "Read", tuid: "p2", detail: "a.js", t: back + 2000 },
]);
engine.focusInspect({ kind: "session", key: "s:" + sid2 });
let two = engine.inspectSnapshot();
check("two tool calls can be in flight", two.alsoRunning === 1, JSON.stringify(two.doing));
check("the newest one is the headline", two.doing.tool === "Read");

feed2([{ ev: "PostToolUse", tool: "Read", tuid: "p2", res: "40 lines", t: back + 3000 }]);
two = engine.inspectSnapshot();
check("closing one leaves its sibling running", two.doing.tool === "Bash" && two.alsoRunning === 0, JSON.stringify(two.doing));
const read = two.log.find((e) => e.tool === "Read");
check("a closed call is timed by the events, not by us", read && read.ms === 1000, read && String(read.ms));
check("entries keep the event's own time", read && read.t === back + 2000, read && String(read.t - back));
const stillGoing = two.log.find((e) => e.running);
check("a running call carries no ticking number", two.doing && two.doing.ms === undefined && stillGoing && stillGoing.ms === 0, JSON.stringify(stillGoing));
feed2([{ ev: "SessionEnd" }]);
engine.closeInspector();
advance(200);

// -- the inspector is pushed to, not polled -----------------------------------

let pokes = 0;
const unsubscribe = engine.subscribeInspect(() => pokes++);
engine.focusInspect({ kind: "session", key: session.key });
const atFocus = pokes;
check("focusing something notifies the panel", atFocus > 0);
advance(2000);
check("idle frames notify nobody", pokes === atFocus, `${pokes - atFocus} spurious updates`);
feed([{ ev: "PreToolUse", tool: "Read", detail: "quiet.js" }]);
check("a hook event notifies the panel", pokes > atFocus);
unsubscribe();
const afterOff = pokes;
feed([{ ev: "PostToolUse", tool: "Read" }]);
check("unsubscribing stops it", pokes === afterOff);
engine.closeInspector();

// -- the watchdog -------------------------------------------------------------

const sid3 = "smoke-stuck";
const feed3 = (events) => engine.ingest({ events: events.map((e) => ({ t: Date.now(), sid: sid3, cwd, ...e })), replay: false });
const loopSession = () => [...sessions.values()].find((x) => x.sid === sid3);

feed3([{ ev: "SessionStart" }, { ev: "UserPromptSubmit", msg: "fix the test" }]);
check("a fresh session is not stuck", !watchdog.check(loopSession()));

// The same command, over and over.
for (let i = 0; i < 3; i++) {
  feed3([{ ev: "PreToolUse", tool: "Bash", tuid: "loop" + i, detail: "npm test" }]);
  feed3([{ ev: "PostToolUseFailure", tool: "Bash", tuid: "loop" + i, res: "1 failing" }]);
  advance(4000);
}
const loop = watchdog.check(loopSession());
check("three identical calls look like a loop", loop && loop.kind === "loop", JSON.stringify(loop));
check("and it says which call", loop && loop.text.includes("npm test"));

// A tool call that never comes back is a long job, not a stall: different words.
feed3([{ ev: "PreToolUse", tool: "Bash", tuid: "hang", detail: "sleep forever" }]);
advance(11 * 60 * 1000);
const long = watchdog.check(loopSession());
check("an endless call reads as still running", long && long.kind === "long", JSON.stringify(long));
check("and it names the tool", long && long.text.includes("Bash"));
feed3([{ ev: "PostToolUse", tool: "Bash", tuid: "hang" }]);

// Nothing running, nothing happening, and the turn never ended.
feed3([{ ev: "UserPromptSubmit", msg: "now do the other thing" }]);
advance(7 * 60 * 1000);
const stall = watchdog.check(loopSession());
check("silence with nothing running is a stall", stall && stall.kind === "stall", JSON.stringify(stall));
check("the stall text carries no ticking number", stall && /over \d+ minutes/.test(stall.text));

engine.focusInspect({ kind: "session", key: "s:" + sid3 });
check("the panel is told what is wrong", (engine.inspectSnapshot().stuck || {}).kind === "stall", JSON.stringify(engine.inspectSnapshot().stuck));
engine.closeInspector();
feed3([{ ev: "SessionEnd" }]);
advance(200);

// -- the rest of the lifecycle ------------------------------------------------

const lastInspect = seen.inspect.length;
feed([{ ev: "PermissionRequest", tool: "Bash", detail: "npm install" }]);
advance(600);
check("a permission prompt reaches Pip", engine.frameStats().mood === "approval");

// Waiting on you: the notch offers the way to the terminal, and the tray hears.
const chip = review;
check("the notch offers Review while Claude waits", !!chip, JSON.stringify(chip));
check("the tray is told who is waiting", seen.waiting.includes(4242), JSON.stringify(seen.waiting));
if (chip) {
  canvas.fire("mousedown", { button: 0, clientX: chip.x + chip.w / 2, clientY: chip.y + chip.h / 2 });
  check("clicking Review raises that terminal", seen.focused.includes(4242), JSON.stringify(seen.focused));
  check("and it does not tickle Pip instead", seen.inspect.length === lastInspect);
}

feed([{ ev: "PreToolUse", tool: "Bash", detail: "npm install" }, { ev: "PostToolUseFailure", tool: "Bash", res: "error: exit 1" }]);
advance(300);
feed([{ ev: "SubagentStop", aid: "a1" }, { ev: "Stop" }]);
advance(1200);
check("Stop makes Pip celebrate", engine.frameStats().mood === "finished");

// The finished helper puffs away and is remembered for the inspector.
advance(4000);
check("the finished helper was retired", !agents.has(explore.key));
check("and kept in history", history.some((x) => x.key === explore.key));
engine.focusInspect({ kind: "agent", key: explore.key });
snap = engine.inspectSnapshot();
check("history is still inspectable", snap && snap.live === false && snap.log.length > 0);
engine.closeInspector();

feed([{ ev: "StopFailure", msg: "rate limited" }]);
advance(1500);
check("a failure shows", engine.frameStats().mood === "error");

// Clicking Pip, petting it, right-clicking, pinning the notch open.
for (let i = 0; i < 7; i++) { canvas.fire("mousedown", { button: 0, clientX: 0, clientY: 0 }); advance(120); }
engine.setCursor({ x: 40, y: 24 });
advance(100);
for (let i = 0; i < 24; i++) { engine.setCursor({ x: 40 + (i % 2) * 9, y: 24 }); advance(20); }
canvas.fire("contextmenu", { preventDefault() {} });
check("right click opened the native menu", seen.menu === 1);

// Open the notch and click a row.
engine.setCursor({ x: 240, y: 20 });
advance(1200);
canvas.fire("mousedown", { button: 0, clientX: 240, clientY: 72 });
advance(200);

// Game mode, then the demo, then the icon.
engine.setPaused(true);
const stopped = framesRun;
advance(3000);
check("paused means no frames at all", framesRun === stopped, `${framesRun - stopped} frames ran`);
engine.setPaused(false);
advance(500);
check("resuming draws again", framesRun > stopped);

feed([{ ev: "SessionEnd" }]);
engine.demo();
advance(40000);
check("the demo ran clean", true);

engine.speak("hello", 1);
engine.setMuted(true);
engine.sfx("pop");
engine.drawIcon(stubCanvas(), 256);

// Long quiet stretch: Pip should nap, and still be drawing something.
advance(300000);
const stats = engine.frameStats();
check("Pip naps when nothing happens", stats.mood === "sleeping", stats.mood);
check("napping asks for the slowest frame rate", stats.want <= 12, String(stats.want));

// A replay of old events must land quietly and not resurrect stale sessions.
feed([{ ev: "SessionStart" }, { ev: "UserPromptSubmit", msg: "old news" }], true);
advance(200);
check("a replay still updates the model", sessions.size === 1);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
