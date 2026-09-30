// Pip: a little mint sprout that lives in a notch at the top of your screen
// and keeps you company while Claude Code works. Everything is drawn in code.
//
// Moods follow your sessions (thinking, working, needs you, done, oops, nap).
// Every subagent Claude Code spawns pops out of Pip as a tiny sproutling,
// works next to it, and poofs away when it finishes.
//
// Play with it: hover to open the notch, click Pip to tickle, wiggle the
// mouse over Pip to pet, poke it too much and it gets dizzy. Right-click: menu.

// CPU: the loop runs at 60 fps only for physics and the user's hand (springs,
// jumps, hover, drag, confetti); 30 for ambient motion (notes, speech, emotes);
// 24 while Claude works, 12 when idle, 6 while napping, and not at all while
// paused (game mode). The window itself is resized to what is drawn, because a
// transparent window costs CPU in proportion to its area on every frame.

export const W = 640, H = 600; // keep in sync with electron/main.js
let canvas, ctx, DPR = 1;

const FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
const noop = () => {};
let api = { setHitRects: noop, setWinHeight: noop, menu: noop };
let hooks = { onLayout: noop, onPillClick: noop };

// ── helpers ──────────────────────────────────────────────────────────────────

const now = () => performance.now() / 1000;
const wall = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const easeOutBack = (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

class Spring {
  constructor(v, k = 170, d = 18) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.d = d; }
  step(dt) {
    const f = -this.k * (this.v - this.t) - this.d * this.vel;
    this.vel += f * dt;
    this.v += this.vel * dt;
    return this.v;
  }
}

function ellipse(x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

function heartPath(x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
}

function fit(text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function project(cwd) {
  if (!cwd) return "";
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || cwd;
}

function ago(ms) {
  const s = Math.max(0, Math.round((wall() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

// ── sound: tiny synthesized bleeps, no audio files ───────────────────────────

const Sound = (() => {
  let ac = null;
  let muted = false;
  let idleTimer = null;
  function tone(f0, f1, dur, { type = "sine", vol = 0.05, delay = 0 } = {}) {
    if (muted) return;
    try {
      ac = ac || new AudioContext();
      if (ac.state === "suspended") ac.resume();
      // A running AudioContext keeps an audio thread busy; park it when quiet.
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => ac && ac.suspend(), (delay + dur) * 1000 + 1500);
      const t = ac.currentTime + delay;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + dur + 0.03);
    } catch {}
  }
  const fx = {
    hi() { tone(520, 780, 0.12); tone(780, 1040, 0.1, { delay: 0.14 }); },
    pop() { tone(380, 950, 0.09, { vol: 0.04 }); },
    poof() { tone(800, 260, 0.14, { type: "triangle", vol: 0.03 }); },
    alert() { tone(880, 880, 0.09, { type: "triangle", vol: 0.06 }); tone(1175, 1175, 0.13, { type: "triangle", vol: 0.06, delay: 0.13 }); },
    done() { [660, 830, 990, 1320].forEach((f, i) => tone(f, f * 1.01, 0.13, { vol: 0.045, delay: i * 0.075 })); },
    error() { tone(240, 120, 0.3, { type: "sawtooth", vol: 0.02 }); },
    giggle() { for (let i = 0; i < 4; i++) tone(rand(900, 1250), rand(1150, 1500), 0.05, { vol: 0.03, delay: i * 0.065 }); },
    dizzy() { tone(700, 240, 0.5, { vol: 0.04 }); tone(520, 200, 0.5, { vol: 0.03, delay: 0.12 }); },
    purr() { for (let i = 0; i < 6; i++) tone(96, 88, 0.09, { type: "triangle", vol: 0.06, delay: i * 0.1 }); },
    boop() { tone(300, 540, 0.08, { vol: 0.04 }); },
    yawn() { tone(430, 170, 0.7, { vol: 0.03 }); },
    note() { const f = pick([784, 880, 988, 1047, 1175]); tone(f, f, 0.16, { vol: 0.025 }); },
    open() { tone(300, 620, 0.1, { vol: 0.03 }); },
    close() { tone(620, 300, 0.1, { vol: 0.03 }); },
  };
  return {
    fx,
    get muted() { return muted; },
    set muted(v) { muted = !!v; },
  };
})();

// ── model: sessions and agents, fed by hook events ───────────────────────────

const MOODS = {
  approval: { accent: "#FF9F0A", label: "Needs you", p: 6 },
  error:    { accent: "#FF5A4E", label: "Oops, something failed", p: 5 },
  working:  { accent: "#3D9BFF", label: "Working", p: 4 },
  thinking: { accent: "#C07BFF", label: "Thinking…", p: 3 },
  finished: { accent: "#34D17A", label: "Done!", p: 2 },
  idle:     { accent: "#8E8E98", label: "Ready", p: 1 },
  sleeping: { accent: "#55555F", label: "Napping", p: 0 },
};
const AGENT_TOOLS = new Set(["Agent", "Task"]);
const AGENT_HUES = { Explore: 205, Plan: 275, "general-purpose": 28, claude: 330 };

const sessions = new Map(); // sid -> { sid, state, tool, detail, cwd, t }
const agents = new Map();   // key -> mini
const bootWall = wall();

function hueFor(type) {
  if (type in AGENT_HUES) return AGENT_HUES[type];
  let h = 7;
  for (const c of type) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function sessionOf(e) {
  const sid = e.sid || "default";
  let s = sessions.get(sid);
  if (!s) { s = { sid, state: "idle", tool: "", detail: "", cwd: "", t: e.t }; sessions.set(sid, s); }
  if (e.cwd) s.cwd = e.cwd;
  s.t = e.t;
  return s;
}

function findMini(pred) {
  for (const m of agents.values()) if (pred(m)) return m;
  return null;
}

function spawnMini(key, sid, type, desc, bg, t, quiet) {
  type = type || "agent";
  const m = {
    key, sid, aid: "", type, desc: desc || "", tool: "", toolDetail: "",
    state: "working", bg: !!bg, t, quiet,
    born: now(), doneAt: 0, removeAt: 0, gone: false,
    x: new Spring(pip.x, 110, 14), y: new Spring(pip.y, 110, 14), sc: new Spring(0, 220, 13),
    phase: rand(0, 6.28), blinkAt: now() + rand(1, 4), blinkUntil: 0, hue: hueFor(type),
  };
  m.y.vel = -160;
  m.x.vel = rand(40, 120);
  agents.set(key, m);
  if (!quiet) {
    Sound.fx.pop();
    emit("puff", pip.x + 10, pip.y, 5);
    emit("spark", pip.x + 10, pip.y, 4);
    pip.emote("proud", 0.8);
    if (Math.random() < 0.45) say(pick(["go little buddy!", "helpers, assemble!", "you got this!", "off you go!", "sprout squad!"]), 1.8);
  }
  return m;
}

function finish(m, quiet) {
  if (m.state === "done") return;
  m.state = "done";
  m.doneAt = now();
  m.quiet = quiet;
  if (quiet) { agents.delete(m.key); return; }
  m.y.vel = -140;
  emit("spark", m.x.v, m.y.v, 5);
}

function apply(e, quiet) {
  if (!e || !e.ev) return;
  if (quiet && wall() - e.t > 30 * 60e3) return;
  const sid = e.sid || "default";

  if (e.ev === "SessionEnd") {
    sessions.delete(sid);
    for (const m of agents.values()) if (m.sid === sid) finish(m, quiet);
    return;
  }

  // Events fired inside a subagent drive that agent's sproutling, not Pip.
  if (e.aid && e.ev !== "SubagentStart" && e.ev !== "SubagentStop") {
    const m = findMini((x) => x.aid === e.aid);
    if (m) {
      m.t = e.t;
      if (e.ev === "PreToolUse") { m.tool = e.tool; m.toolDetail = e.detail; }
      if (e.ev === "PostToolUse" || e.ev === "PostToolUseFailure") m.tool = "";
    }
    if (e.ev === "PermissionRequest" || (e.ev === "Notification" && e.ntype === "permission_prompt")) {
      const s = sessionOf(e);
      s.state = "approval"; s.tool = e.tool; s.detail = e.detail || e.msg;
    }
    return;
  }

  const s = sessionOf(e);
  switch (e.ev) {
    case "SessionStart":
      s.state = "idle";
      break;
    case "UserPromptSubmit":
      s.state = "thinking"; s.tool = ""; s.detail = e.msg;
      break;
    case "PreToolUse":
      s.state = "working"; s.tool = e.tool; s.detail = e.detail;
      if (AGENT_TOOLS.has(e.tool) && e.tuid && !agents.has("tu:" + e.tuid)) {
        spawnMini("tu:" + e.tuid, sid, e.atype, e.detail, e.bg, e.t, quiet);
      }
      break;
    case "PostToolUse":
    case "PostToolUseFailure":
      s.state = "thinking"; s.tool = "";
      if (AGENT_TOOLS.has(e.tool)) {
        const m = agents.get("tu:" + e.tuid);
        if (m && !m.bg) finish(m, quiet);
      }
      break;
    case "PermissionRequest":
      s.state = "approval"; s.tool = e.tool; s.detail = e.detail;
      break;
    case "Notification":
      if (e.ntype === "permission_prompt" || /permission/i.test(e.msg || "")) { s.state = "approval"; s.detail = e.msg; }
      break;
    case "Stop":
      s.state = "finished"; s.tool = ""; s.detail = "";
      for (const m of agents.values()) if (m.sid === sid && !m.bg) finish(m, quiet);
      break;
    case "StopFailure":
      s.state = "error"; s.detail = e.msg;
      break;
    case "SubagentStart": {
      let m = findMini((x) => x.sid === sid && !x.aid && x.state !== "done" && (!e.atype || x.type === e.atype))
           || findMini((x) => x.sid === sid && !x.aid && x.state !== "done");
      if (!m) m = spawnMini("ag:" + e.aid, sid, e.atype, "", false, e.t, quiet);
      m.aid = e.aid;
      if (e.atype) { m.type = e.atype; m.hue = hueFor(e.atype); }
      m.t = e.t;
      break;
    }
    case "SubagentStop": {
      const m = (e.aid && findMini((x) => x.aid === e.aid))
             || findMini((x) => x.sid === sid && !x.aid && x.state !== "done");
      if (m) finish(m, quiet);
      break;
    }
  }
}

let mood = "sleeping";
let lead = null;

function computeMood() {
  const w = wall();
  lead = null;
  for (const s of sessions.values()) {
    const age = w - s.t;
    if (age > 30 * 60e3) { sessions.delete(s.sid); continue; }
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
  let m = lead ? lead.state : "idle";
  if (m === "idle" && busyAgents) m = "working";
  if (m === "idle" && w - Math.max(lead ? lead.t : bootWall, lastPoke) > 3 * 60e3) m = "sleeping";
  return m;
}

let lastPoke = wall();

// ── particles & speech ───────────────────────────────────────────────────────

const particles = [];
const CONFETTI = ["#FF6B8B", "#FFC94D", "#5BE0A6", "#6BB8FF", "#C98BFF", "#FF9F5A"];

function emit(kind, x, y, n = 1) {
  for (let i = 0; i < n; i++) {
    const p = { kind, x, y, vx: 0, vy: 0, g: 0, life: 0, max: 1, rot: rand(0, 6.28), vr: 0, size: 1, color: "#fff" };
    switch (kind) {
      case "confetti":
        Object.assign(p, { vx: rand(-170, 170), vy: rand(-120, 40), g: 420, max: rand(1.2, 1.9), vr: rand(-12, 12), color: pick(CONFETTI), size: rand(3, 5) });
        break;
      case "heart":
        Object.assign(p, { vx: rand(-55, 55), vy: rand(15, 60), g: -20, max: rand(0.9, 1.4), size: rand(7, 11), color: pick(["#FF5C8A", "#FF7AA2", "#FF9EBB"]) });
        break;
      case "z":
        Object.assign(p, { vx: rand(14, 24), vy: rand(4, 10), max: 2.4, size: rand(9, 12), color: "#B9C2FF" });
        break;
      case "note":
        Object.assign(p, { vx: rand(26, 40), vy: rand(8, 18), max: 1.6, size: rand(11, 14), color: pick(["#9BEACB", "#FFD37A", "#C9A6FF"]) });
        break;
      case "puff":
        Object.assign(p, { vx: rand(-40, 40), vy: rand(-20, 30), max: rand(0.35, 0.6), size: rand(3, 6), color: "rgba(255,255,255,0.9)" });
        break;
      case "spark":
        Object.assign(p, { vx: rand(-90, 90), vy: rand(-40, 70), max: rand(0.4, 0.7), size: rand(3, 5), color: pick(["#FFF3B0", "#FFFFFF", "#A6FFE0"]) });
        break;
      case "smoke":
        Object.assign(p, { vx: rand(-15, 15), vy: rand(10, 25), max: rand(0.8, 1.2), size: rand(4, 7), color: "rgba(150,150,160,0.8)" });
        break;
    }
    particles.push(p);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life > p.max || p.y > H + 20) { particles.splice(i, 1); continue; }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.kind === "confetti") p.vx *= 0.985;
  }
}

function drawParticles(t) {
  for (const p of particles) {
    const k = p.life / p.max;
    const a = k > 0.7 ? (1 - k) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    switch (p.kind) {
      case "confetti":
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        break;
      case "heart":
        heartPath(0, -p.size / 2, p.size * (0.6 + 0.4 * Math.min(1, k * 4)));
        ctx.fill();
        break;
      case "z":
        ctx.font = `700 ${p.size * (0.7 + k * 0.6)}px ${FONT}`;
        ctx.fillText("z", Math.sin(t * 3 + p.rot) * 3, 0);
        break;
      case "note":
        ctx.font = `700 ${p.size}px "Segoe UI Symbol", ${FONT}`;
        ctx.fillText(p.rot > 3 ? "♪" : "♫", 0, Math.sin(t * 8 + p.rot) * 3);
        break;
      case "puff":
      case "smoke":
        ellipse(0, 0, p.size * (1 + k * 1.8), p.size * (1 + k * 1.8));
        break;
      case "spark": {
        const s = p.size * (1 - k * 0.5);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? s * 0.35 : s;
          const ang = (i * Math.PI) / 4 + p.rot;
          ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
}

let bubble = null;
function say(text, dur = 2) { bubble = { text, t0: now(), until: now() + dur }; }

// ── Pip ──────────────────────────────────────────────────────────────────────

const PIP_PAL = { light: "#EFFFF7", mid: "#9DEBCB", edge: "#58C79C", feet: "#44A984", leaf: "#3DBB74", leafDark: "#2A8A56" };
function miniPal(h) {
  return {
    light: `hsl(${h},90%,93%)`, mid: `hsl(${h},70%,76%)`, edge: `hsl(${h},52%,60%)`,
    feet: `hsl(${h},42%,48%)`, leaf: `hsl(${(h + 120) % 360},55%,52%)`, leafDark: `hsl(${(h + 120) % 360},55%,36%)`,
  };
}

const pip = {
  x: W / 2, y: 23, s: 1,
  intro: new Spring(0, 160, 11),
  sx: new Spring(1, 260, 12), sy: new Spring(1, 260, 12),
  lookX: new Spring(0, 90, 14), lookY: new Spring(0, 90, 14),
  open: new Spring(1, 500, 30), blush: new Spring(0.35, 60, 12),
  drop: new Spring(0, 90, 9),
  jump: 0, jumpV: 0,
  leafAngle: 0, leafSpin: 0, droop: new Spring(0, 40, 10),
  shake: 0, spin: 0, spinV: 0,
  blinkAt: now() + 2, blinkUntil: 0,
  glance: { x: 0, y: 0 }, nextGlance: 0, nextHop: 0, nextIdle: now() + rand(15, 25),
  emoteName: null, emoteUntil: 0,
  petAcc: 0, petCooldown: 0, pokes: [], errorAt: 0, dropUntil: 0,
  whistleUntil: 0, nextNote: 0, nextZ: 0,
  emote(name, dur) { this.emoteName = name; this.emoteUntil = now() + dur; },
  current() { return now() < this.emoteUntil ? this.emoteName : null; },
  hop(v) { if (this.jump === 0 && this.jumpV === 0) { this.jumpV = -v; this.sy.vel += 4; this.sx.vel -= 3; } },
  leap(depth = 34, dur = 0.8) { this.drop.t = depth; this.dropUntil = now() + dur; },
  twirl() { this.spinV = 14; },
};

function onMood(prev, next) {
  const t = now();
  if (prev === "sleeping" && next !== "sleeping") { pip.emote("surprised", 0.7); Sound.fx.boop(); }
  switch (next) {
    case "approval":
      Sound.fx.alert();
      pip.emote("surprised", 0.6);
      pip.hop(160);
      say(pick(["psst! you're needed", "need your OK!", "can I? can I?", "permission, please!"]), 2.6);
      break;
    case "finished":
      Sound.fx.done();
      pip.leap(36, 0.85);
      pip.twirl();
      pip.emote("giggle", 1.6);
      emit("confetti", pip.x, pip.y + 10, 46);
      say(pick(["done!", "ta-da!", "all done ✨", "nailed it!", "woohoo!"]), 2.2);
      break;
    case "error":
      Sound.fx.error();
      pip.shake = 1;
      pip.errorAt = t;
      emit("smoke", pip.x, pip.y - 6, 6);
      say(pick(["uh oh…", "oops!", "that didn't work…"]), 2.4);
      break;
    case "thinking":
      if (prev === "idle" || prev === "sleeping" || prev === "finished") pip.hop(90);
      break;
    case "sleeping":
      say("zzz…", 1.6);
      break;
  }
}

// ── small public API ─────────────────────────────────────────────────────────

export function speak(text, dur = 2.2) { say(text, dur); wake(); }
export function setMuted(on) { Sound.muted = on; }
export function sfx(name) { Sound.fx[name] && Sound.fx[name](); }

function updatePip(dt, t) {
  const em = pip.current();
  const R = 13 * pip.s;
  const mouseFresh = mouse.in && t - mouse.lastMove < 5;
  const dx = mouse.x - pip.x, dy = mouse.y - pip.y;
  const near = mouseFresh && Math.hypot(dx, dy) < 280;

  // Where to look.
  let lx = 0, ly = 0;
  if (em === "dizzy") { lx = Math.cos(t * 9); ly = Math.sin(t * 9); }
  else if (near && mood !== "sleeping") { lx = clamp(dx / 90, -1, 1); ly = clamp(dy / 60, -1, 1); }
  else if (mood === "thinking") { lx = 0.75 + 0.2 * Math.sin(t * 1.3); ly = -0.85; }
  else if (mood === "working") { lx = Math.sin(t * 2.3) * 0.85; ly = 0.55; }
  else if (mood === "approval") { lx = Math.sin(t * 6) * 0.3; ly = 1; }
  else {
    if (t > pip.nextGlance) {
      const live = [...agents.values()];
      pip.glance = live.length && Math.random() < 0.5
        ? { x: clamp((live[0].x.v - pip.x) / 60, -1, 1), y: 0.1 }
        : { x: rand(-1, 1), y: rand(-0.6, 0.8) };
      pip.nextGlance = t + rand(1.2, 3.5);
    }
    lx = pip.glance.x; ly = pip.glance.y;
  }
  pip.lookX.t = lx; pip.lookY.t = ly;
  pip.lookX.step(dt); pip.lookY.step(dt);

  // Blinking (sometimes a double blink).
  if (t > pip.blinkAt) {
    pip.blinkUntil = t + 0.11;
    pip.blinkAt = t + (Math.random() < 0.2 ? 0.22 : rand(2, 5.5));
  }
  let open = t < pip.blinkUntil ? 0.05 : 1;
  if (mood === "sleeping" && !near) open = 0;
  if (mood === "thinking") open = Math.min(open, 0.75);
  pip.open.t = open;
  pip.open.step(dt);

  // Hops and bounces.
  if (pip.jump === 0 && pip.jumpV === 0 && !em) {
    if (mood === "working" && t > pip.nextHop) { pip.hop(95); pip.nextHop = t + rand(0.32, 0.6); }
    if (mood === "approval" && t > pip.nextHop) { pip.hop(135); pip.nextHop = t + 0.5; }
  }
  if (pip.jumpV !== 0 || pip.jump < 0) {
    pip.jumpV += 900 * dt;
    pip.jump += pip.jumpV * dt;
    if (pip.jump >= 0) { pip.jump = 0; pip.jumpV = 0; pip.sx.vel += 3.2; pip.sy.vel -= 3.2; }
  }

  // Leap out of the notch and back.
  if (pip.dropUntil && t > pip.dropUntil) { pip.drop.t = 0; pip.dropUntil = 0; }
  pip.drop.step(dt);

  // Twirl.
  if (pip.spinV > 0 || pip.spin > 0) {
    pip.spin += pip.spinV * dt;
    if (pip.spin >= Math.PI * 2) { pip.spin = 0; pip.spinV = 0; }
  }

  // Breathing squash.
  const breath = mood === "sleeping" ? Math.sin(t * 1.6) * 0.05 : Math.sin(t * 2.4) * 0.025;
  pip.sx.t = 1 - breath * 0.7;
  pip.sy.t = 1 + breath;
  pip.sx.step(dt); pip.sy.step(dt);

  // Leaf: sways, spins like a propeller when working, droops when napping.
  if (mood === "working" || em === "proud") pip.leafSpin += dt * 22;
  pip.droop.t = mood === "sleeping" ? 1 : 0;
  pip.droop.step(dt);
  const sway = mood === "approval" ? Math.sin(t * 30) * 0.08 : Math.sin(t * 1.6) * 0.18;
  pip.leafAngle = lerp(sway, 1.15, pip.droop.v);

  pip.shake = Math.max(0, pip.shake - dt * 0.9);
  pip.blush.t = em === "love" || em === "giggle" || (near && mood !== "sleeping") ? 0.9 : 0.35;
  pip.blush.step(dt);
  pip.intro.step(dt);

  // Idle antics.
  if (mood === "idle" && !em && t > pip.nextIdle) {
    const act = pick(["whistle", "whistle", "hop", "yawn", "twirl", "wave"]);
    if (act === "whistle") { pip.whistleUntil = t + 2.2; }
    if (act === "hop") { pip.hop(110); setTimeout(() => pip.hop(90), 380); }
    if (act === "yawn") { pip.emote("yawn", 1.5); Sound.fx.yawn(); }
    if (act === "twirl") { pip.twirl(); pip.hop(100); }
    if (act === "wave") { pip.emote("proud", 1.2); }
    pip.nextIdle = t + rand(18, 40);
  }
  if (t < pip.whistleUntil && t > pip.nextNote) {
    emit("note", pip.x + R * 0.6, pip.y + R * 0.2, 1);
    Sound.fx.note();
    pip.nextNote = t + 0.45;
  }
  if (mood === "sleeping" && t > pip.nextZ) {
    emit("z", pip.x + R * 0.7, pip.y - R * 0.2, 1);
    pip.nextZ = t + 1.1;
  }

  // Petting: wiggle the mouse over Pip.
  pip.petAcc *= Math.pow(0.35, dt);
  if (pip.petAcc > 650 && t > pip.petCooldown) {
    pip.petAcc = 0;
    pip.petCooldown = t + 3;
    pip.emote("love", 2.2);
    Sound.fx.purr();
    emit("heart", pip.x, pip.y + 6, 7);
    say(pick(["hehe ♥", "purrr…", "more pets!", "♥ ♥ ♥"]), 1.8);
  }
}

function poke() {
  const t = now();
  lastPoke = wall();
  pip.pokes = pip.pokes.filter((p) => t - p < 2.5);
  pip.pokes.push(t);
  if (mood === "sleeping") {
    pip.emote("surprised", 0.8);
    Sound.fx.boop();
    say(pick(["huh? oh, hi!", "i was NOT sleeping", "five more minutes…"]), 1.8);
    pip.hop(120);
    return;
  }
  if (pip.pokes.length >= 5) {
    pip.pokes = [];
    pip.emote("dizzy", 2.6);
    Sound.fx.dizzy();
    pip.shake = 0.7;
    say(pick(["hey!!", "too much!", "the room is spinning…"]), 2);
    return;
  }
  pip.emote("giggle", 0.8);
  Sound.fx.giggle();
  pip.sx.vel += 5; pip.sy.vel -= 5;
  pip.hop(110);
  emit("heart", pip.x, pip.y + 4, 2);
}

// ── drawing a creature (Pip or a sproutling) ─────────────────────────────────

function bodyPath(rx, ry) {
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.bezierCurveTo(rx * 0.92, -ry, rx, -ry * 0.35, rx, ry * 0.15);
  ctx.bezierCurveTo(rx, ry * 0.78, rx * 0.62, ry, 0, ry);
  ctx.bezierCurveTo(-rx * 0.62, ry, -rx, ry * 0.78, -rx, ry * 0.15);
  ctx.bezierCurveTo(-rx, -ry * 0.35, -rx * 0.92, -ry, 0, -ry);
  ctx.closePath();
}

function leafShape(len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.5, wid, 0, 0);
  ctx.fill();
}

function drawCreature(x, y, s, o) {
  const R = 13 * s, rx = R * 1.1, ry = R * 0.96;
  const pal = o.pal;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.rot || 0);
  ctx.scale(o.sx, o.sy);

  // feet
  ctx.fillStyle = pal.feet;
  const step = o.walk ? Math.sin(o.t * 16) * R * 0.08 : 0;
  ellipse(-rx * 0.42, ry * 0.9 + step, rx * 0.27, ry * 0.17);
  ellipse(rx * 0.42, ry * 0.9 - step, rx * 0.27, ry * 0.17);

  // sprout (behind the body)
  ctx.save();
  ctx.translate(0, -ry * 0.9);
  ctx.rotate(o.leafAngle);
  ctx.strokeStyle = pal.leafDark;
  ctx.lineWidth = Math.max(1, 1.7 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(R * 0.12, -R * 0.25, R * 0.04, -R * 0.5);
  ctx.stroke();
  ctx.translate(R * 0.04, -R * 0.5);
  ctx.fillStyle = pal.leaf;
  if (o.prop) {
    const c = Math.cos(o.leafSpin);
    ctx.save(); ctx.scale(c, 1); leafShape(R * 0.62, R * 0.2); ctx.restore();
    ctx.save(); ctx.scale(-c, 1); leafShape(R * 0.62, R * 0.2); ctx.restore();
  } else {
    ctx.save(); ctx.rotate(-0.55); leafShape(R * 0.66, R * 0.26); ctx.restore();
    ctx.save(); ctx.rotate(-2.4); ctx.scale(0.8, 0.8); leafShape(R * 0.5, R * 0.22); ctx.restore();
  }
  ctx.restore();

  // body
  bodyPath(rx, ry);
  const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.5, R * 0.1, 0, 0, R * 1.35);
  g.addColorStop(0, pal.light);
  g.addColorStop(0.55, pal.mid);
  g.addColorStop(1, pal.edge);
  ctx.fillStyle = g;
  ctx.fill();
  // sheen
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(0.8, 1.2 * s);
  ctx.beginPath();
  ctx.ellipse(-rx * 0.3, -ry * 0.55, rx * 0.32, ry * 0.18, -0.5, Math.PI * 1.05, Math.PI * 1.7);
  ctx.stroke();

  // blush
  if (o.blush > 0.01) {
    ctx.fillStyle = `rgba(255,120,160,${0.55 * o.blush})`;
    ellipse(-rx * 0.62, ry * 0.2, R * 0.19, R * 0.11);
    ellipse(rx * 0.62, ry * 0.2, R * 0.19, R * 0.11);
  }

  drawEyes(o, R, rx, ry, s);
  drawMouth(o, R, ry, s);
  ctx.restore();
}

function drawEyes(o, R, rx, ry, s) {
  const ex = rx * 0.38, ey = -ry * 0.08;
  const ew = R * 0.25, eh = R * 0.3;
  const ink = "#1E2230";
  ctx.lineCap = "round";
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, 1.8 * s);
  for (const side of [-1, 1]) {
    const cx = side * ex;
    switch (o.eyes) {
      case "happy":
        ctx.beginPath();
        ctx.arc(cx, ey + eh * 0.35, ew * 0.85, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        break;
      case "closed":
        ctx.beginPath();
        ctx.arc(cx, ey - eh * 0.25, ew * 0.85, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        break;
      case "x":
        ctx.beginPath();
        ctx.moveTo(cx - ew * 0.6, ey - ew * 0.6); ctx.lineTo(cx + ew * 0.6, ey + ew * 0.6);
        ctx.moveTo(cx + ew * 0.6, ey - ew * 0.6); ctx.lineTo(cx - ew * 0.6, ey + ew * 0.6);
        ctx.stroke();
        break;
      case "dizzy":
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.3) {
          const r = (a / (Math.PI * 4)) * ew * 1.05;
          const ang = a + o.t * 9 * side;
          ctx.lineTo(cx + Math.cos(ang) * r, ey + Math.sin(ang) * r);
        }
        ctx.lineWidth = Math.max(0.8, 1.3 * s);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, 1.8 * s);
        break;
      case "heart":
        ctx.fillStyle = "#FF4F86";
        heartPath(cx, ey - ew * 0.75, ew * 1.6 * (1 + Math.sin(o.t * 10) * 0.08));
        ctx.fill();
        break;
      default: {
        const wide = o.eyes === "wide" ? 1.18 : 1;
        const open = clamp(o.open, 0, 1);
        if (open < 0.25) {
          ctx.beginPath();
          ctx.moveTo(cx - ew * 0.75, ey); ctx.lineTo(cx + ew * 0.75, ey);
          ctx.stroke();
          break;
        }
        ctx.fillStyle = "#FFFFFF";
        ellipse(cx, ey, ew * wide, eh * wide * open);
        const pr = R * (o.eyes === "wide" ? 0.1 : 0.15);
        const px = cx + o.look.x * ew * 0.42, py = ey + o.look.y * eh * 0.38 * open;
        ctx.fillStyle = ink;
        ellipse(px, py, pr, pr * Math.min(1, open * 1.3));
        ctx.fillStyle = "#FFFFFF";
        ellipse(px - pr * 0.35, py - pr * 0.4, pr * 0.34, pr * 0.34);
      }
    }
  }
}

function drawMouth(o, R, ry, s) {
  const my = ry * 0.4;
  ctx.strokeStyle = "#1E2230";
  ctx.fillStyle = "#3A2130";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.lineCap = "round";
  switch (o.mouth) {
    case "grin":
      ctx.beginPath();
      ctx.moveTo(-R * 0.2, my - R * 0.04);
      ctx.quadraticCurveTo(0, my + R * 0.34, R * 0.2, my - R * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#FF7C9C";
      ellipse(0, my + R * 0.1, R * 0.08, R * 0.05);
      break;
    case "o":
      ellipse(0, my + R * 0.04, R * 0.08, R * 0.1);
      break;
    case "yawn":
      ellipse(0, my + R * 0.06, R * 0.12, R * (0.12 + 0.08 * Math.abs(Math.sin(o.t * 2))));
      break;
    case "flat":
      ctx.beginPath(); ctx.moveTo(-R * 0.1, my); ctx.lineTo(R * 0.1, my); ctx.stroke();
      break;
    case "tongue":
      ctx.beginPath(); ctx.moveTo(-R * 0.12, my); ctx.lineTo(R * 0.12, my); ctx.stroke();
      ctx.fillStyle = "#FF7C9C";
      ellipse(R * 0.07, my + R * 0.06, R * 0.06, R * 0.07);
      break;
    case "hmm":
      ctx.beginPath(); ctx.moveTo(-R * 0.02, my + R * 0.02); ctx.lineTo(R * 0.14, my - R * 0.03); ctx.stroke();
      break;
    case "wavy":
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) ctx.lineTo(-R * 0.18 + (i * R * 0.36) / 6, my + (i % 2 ? R * 0.05 : -R * 0.03));
      ctx.stroke();
      break;
    case "whistle":
      ellipse(R * 0.05, my + R * 0.02, R * 0.05, R * 0.055);
      break;
    default: // smile
      ctx.beginPath();
      ctx.arc(0, my - R * 0.1, R * 0.15, Math.PI * 0.18, Math.PI * 0.82);
      ctx.stroke();
  }
}

function pipFace(t) {
  const em = pip.current();
  const hovered = mouse.in && t - mouse.lastMove < 5 && Math.hypot(mouse.x - pip.x, mouse.y - pip.y) < 60;
  let eyes = "normal", mouth = "smile";
  switch (mood) {
    case "sleeping": eyes = "closed"; mouth = "o"; break;
    case "thinking": mouth = "hmm"; break;
    case "working": mouth = Math.sin(t * 0.9) > 0.3 ? "tongue" : "flat"; break;
    case "approval": eyes = "wide"; mouth = "o"; break;
    case "finished": eyes = "happy"; mouth = "grin"; break;
    case "error": eyes = t - pip.errorAt < 1.6 ? "x" : "dizzy"; mouth = "wavy"; break;
  }
  if (hovered && (mood === "idle" || mood === "finished")) { eyes = "normal"; mouth = "grin"; }
  if (hovered && mood === "sleeping") { eyes = "normal"; mouth = "o"; }
  if (t < pip.whistleUntil) mouth = "whistle";
  switch (em) {
    case "giggle": eyes = "happy"; mouth = "grin"; break;
    case "love": eyes = "heart"; mouth = "grin"; break;
    case "dizzy": eyes = "dizzy"; mouth = "wavy"; break;
    case "surprised": eyes = "wide"; mouth = "o"; break;
    case "yawn": eyes = "closed"; mouth = "yawn"; break;
    case "proud": eyes = "happy"; mouth = "smile"; break;
  }
  return { eyes, mouth };
}

// ── layout, input, hit testing ───────────────────────────────────────────────

const L = { w: new Spring(240, 170, 22), h: new Spring(48, 170, 22), ex: new Spring(0, 170, 22), x: 0 };
let pinned = false, hoverOpen = false, hoverSince = 0, leaveSince = 0;
let panel = null; // { name, w, h } while React shows a panel inside the notch
let rows = [];
let texts = { title: "", sub: "", textW: 0 };
let hoveredMini = null;
const mouse = { x: -999, y: -999, in: false, lastMove: 0 };
let lastLayoutKey = "", lastHitKey = "";

function buildTexts() {
  const n = sessions.size;
  let title = MOODS[mood].label;
  const busy = [...agents.values()].filter((m) => m.state !== "done").length;
  if (mood === "working") {
    if (lead && AGENT_TOOLS.has(lead.tool)) title = "Sending helpers";
    else if (lead && lead.tool && lead.state === "working") title = `Running ${lead.tool}`;
    else if (busy) title = "Helpers at work";
  }
  if (n > 1) title += `  ·  ${n} sessions`;
  let sub;
  if (mood === "sleeping") sub = n ? "Waiting for you" : "No Claude Code session yet";
  else sub = [project(lead && lead.cwd), lead && lead.detail].filter(Boolean).join("  —  ") || "Claude Code";
  return { title, sub };
}

function buildRows() {
  const out = [];
  for (const s of [...sessions.values()].sort((a, b) => b.t - a.t)) out.push({ kind: "session", s });
  for (const m of [...agents.values()].sort((a, b) => a.born - b.born)) out.push({ kind: "agent", m });
  return out.slice(0, 8);
}

function layout(dt) {
  const tx = buildTexts();
  ctx.font = `600 13px ${FONT}`;
  const tw = Math.min(220, ctx.measureText(tx.title).width);
  ctx.font = `11px ${FONT}`;
  const sw = Math.min(220, ctx.measureText(tx.sub).width);
  texts = { ...tx, textW: Math.max(tw, sw, 60) };

  const live = [...agents.values()];
  const shown = Math.min(live.length, 7);
  const minisW = shown ? shown * 22 + (live.length > 7 ? 24 : 0) + 4 : 0;
  const compactW = clamp(58 + texts.textW + 16 + minisW + 22, 230, 580);
  rows = buildRows();
  const expanded = !!panel || pinned || hoverOpen;
  L.ex.t = expanded ? 1 : 0;
  if (panel) {
    L.w.t = panel.w;
    L.h.t = panel.h;
  } else {
    L.w.t = expanded ? Math.max(470, compactW) : compactW;
    L.h.t = expanded ? 66 + Math.max(1, rows.length) * 22 + 12 : 48;
  }
  L.ex.step(dt); L.w.step(dt); L.h.step(dt);
  L.x = (W - L.w.v) / 2;

  // Tell React where the notch will settle, so its panels can sit inside it.
  const key = `${Math.round(L.w.t)},${Math.round(L.h.t)},${expanded},${panel ? panel.name : ""}`;
  if (key !== lastLayoutKey) {
    lastLayoutKey = key;
    hooks.onLayout({ x: (W - L.w.t) / 2, w: L.w.t, h: L.h.t, expanded, panel: panel ? panel.name : null });
  }
  // Tell the main process which part of the window is solid (clicks and
  // drops land there; everywhere else clicks go through to the desktop).
  const hw = Math.ceil(Math.max(L.w.v, L.w.t) / 8) * 8, hh = Math.ceil(Math.max(L.h.v, L.h.t) / 8) * 8;
  const rects = [{ x: Math.round((W - hw) / 2) - 6, y: 0, w: hw + 12, h: hh + 6 }];
  if (pip.drop.v > 8) rects.push({ x: Math.round(pip.x) - 24, y: Math.round(pip.y) - 24, w: 48, h: 48 });
  const hk = JSON.stringify(rects);
  if (hk !== lastHitKey) { lastHitKey = hk; api.setHitRects(rects); }

  const ex = clamp(L.ex.v, 0, 1.2);
  pip.x = L.x + lerp(30, 40, ex);
  pip.y = lerp(26, 34, ex) + pip.jump + pip.drop.v;
  pip.s = lerp(1, 1.3, ex);

  // Sproutling targets: a row next to the text, or their own line when open.
  const start = L.x + 58 + texts.textW + 16;
  live.forEach((m, i) => {
    const rowIdx = rows.findIndex((r) => r.kind === "agent" && r.m === m);
    if (panel) {
      // A panel fills the notch: the sproutlings sit on its bottom edge.
      m.x.t = L.x + L.w.v - 34 - Math.min(i, 9) * 20;
      m.y.t = L.h.v + 9;
      m.sc.t = m.gone || i > 9 ? 0 : 0.55;
      return;
    }
    const cx = start + 11 + Math.min(i, 6) * 22;
    const rx = L.x + 32, ry = 66 + rowIdx * 22 + 11;
    const useRow = expanded && rowIdx >= 0;
    m.x.t = useRow ? rx : cx;
    m.y.t = useRow ? ry : 26;
    const hidden = (!useRow && i > 6) || m.gone;
    m.sc.t = hidden ? 0 : useRow ? 0.66 : 0.62;
  });
}

function updateHover(t) {
  const overPill = mouse.in && mouse.x >= L.x - 2 && mouse.x <= L.x + L.w.v + 2 && mouse.y >= 0 && mouse.y <= L.h.v + 4;
  const overPip = mouse.in && Math.hypot(mouse.x - pip.x, mouse.y - pip.y) < 18 * pip.s + 4;
  hoveredMini = null;
  if (mouse.in && (panel || !(pinned || hoverOpen))) {
    for (const m of agents.values()) {
      if (Math.hypot(mouse.x - m.x.v, mouse.y - m.y.v) < 11) hoveredMini = m;
    }
  }
  if (panel) { hoverOpen = false; hoverSince = 0; return; }

  if (overPill && !overPip) {
    leaveSince = 0;
    if (!hoverSince) hoverSince = t;
    if (t - hoverSince > 0.45) hoverOpen = true;
  } else if (!overPill) {
    hoverSince = 0;
    if (!leaveSince) leaveSince = t;
    if (t - leaveSince > 0.4) hoverOpen = false;
  }
}

function moveMouse(x, y) {
  const dx = x - mouse.x, dy = y - mouse.y;
  if (!dx && !dy) return;
  mouse.x = x; mouse.y = y;
  mouse.in = true;
  mouse.lastMove = now();
  if (Math.hypot(x - pip.x, y - pip.y) < 20 * pip.s && Math.abs(dx) + Math.abs(dy) < 80) {
    pip.petAcc += Math.abs(dx) + Math.abs(dy);
  }
  if (Math.hypot(x - pip.x, y - pip.y) < 320) wake();
}

/** Cursor position from the main process (works during drag-and-drop too). */
export function setCursor({ x, y }) { moveMouse(x, y); }

function attachInput() {
  window.addEventListener("mousemove", (e) => moveMouse(e.clientX, e.clientY));
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (Math.hypot(e.clientX - pip.x, e.clientY - pip.y) < 18 * pip.s + 4) poke();
    else if (!panel) { pinned = !pinned; if (!pinned) hoverOpen = false; wake(); }
    hooks.onPillClick();
  });
  canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); api.menu(Sound.muted); });
}

/** React opened (or closed, with null) a panel inside the notch. */
export function setPanel(name, size) {
  panel = name ? { name, w: size.w, h: size.h } : null;
  if (!name) { pinned = false; hoverOpen = false; }
  wake();
}

// ── rendering ────────────────────────────────────────────────────────────────

function drawPill(t) {
  const x = L.x, w = L.w.v, h = L.h.v, r = Math.min(20, h / 2), e = 10;
  const accent = MOODS[mood].accent;
  ctx.save();
  if (mood === "approval") {
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12 + 10 * Math.sin(t * 5);
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
  }
  ctx.beginPath();
  ctx.moveTo(x - e, 0);
  ctx.quadraticCurveTo(x, 0, x, e);
  ctx.lineTo(x, h - r);
  ctx.arcTo(x, h, x + r, h, r);
  ctx.lineTo(x + w - r, h);
  ctx.arcTo(x + w, h, x + w, h - r, r);
  ctx.lineTo(x + w, e);
  ctx.quadraticCurveTo(x + w, 0, x + w + e, 0);
  ctx.closePath();
  ctx.fillStyle = "#0B0B0F";
  ctx.fill();
  ctx.restore();

  // A soft accent line along the bottom edge that tells the mood at a glance.
  const lw = Math.max(0, w - r * 2 - 10);
  const grad = ctx.createLinearGradient(x + r, 0, x + r + lw, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, accent);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = mood === "sleeping" ? 0.25 : 0.7;
  ctx.fillStyle = grad;
  ctx.fillRect(x + r + 5, h - 1.5, lw, 1.5);
  ctx.globalAlpha = 1;
}

function drawHeader(t) {
  const ex = clamp(L.ex.v, 0, 1);
  const tx = L.x + lerp(58, 72, ex);
  // When open, the right side of the header holds React's buttons.
  const maxW = lerp(texts.textW, L.w.v - 72 - 132, ex);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 ${lerp(13, 14, ex)}px ${FONT}`;
  ctx.fillText(fit(texts.title, maxW), tx, lerp(22, 28, ex));
  ctx.fillStyle = "#9C9CA8";
  ctx.font = `11px ${FONT}`;
  ctx.fillText(fit(texts.sub, maxW), tx, lerp(38, 45, ex));

  // status dot (compact only; the open notch shows buttons there)
  if (ex < 0.6) {
    const accent = MOODS[mood].accent;
    const dx = L.x + L.w.v - 16, dy = 24;
    const pulse = mood === "approval" || mood === "working" ? 1 + 0.25 * Math.sin(t * 6) : 1;
    ctx.globalAlpha = 1 - ex / 0.6;
    ctx.fillStyle = accent;
    ellipse(dx, dy, 4 * pulse, 4 * pulse);
    ctx.globalAlpha = 1;
  }

  // "+n" when too many sproutlings for the compact row
  const live = agents.size;
  if (live > 7 && ex < 0.5) {
    ctx.globalAlpha = 1 - ex * 2;
    ctx.fillStyle = "#C9C9D2";
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(`+${live - 7}`, L.x + 58 + texts.textW + 16 + 7 * 22 + 4, 27);
    ctx.globalAlpha = 1;
  }
}

function drawRows() {
  const ex = clamp(L.ex.v, 0, 1);
  if (ex < 0.35 || panel) return;
  ctx.save();
  ctx.globalAlpha = (ex - 0.35) / 0.65;
  ctx.beginPath();
  ctx.rect(L.x, 58, L.w.v, L.h.v - 58);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(L.x + 16, 58, L.w.v - 32, 1);
  const right = L.x + L.w.v - 18;
  if (!rows.length) {
    ctx.fillStyle = "#8C8C98";
    ctx.font = `11.5px ${FONT}`;
    ctx.fillText("Start Claude Code in any terminal — I'll keep you posted.", L.x + 22, 66 + 15);
  }
  rows.forEach((r, i) => {
    const y = 66 + i * 22 + 15;
    ctx.textAlign = "left";
    if (r.kind === "session") {
      const s = r.s;
      ctx.fillStyle = MOODS[s.state].accent;
      ellipse(L.x + 32, y - 4, 4, 4);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `600 12px ${FONT}`;
      const name = fit(project(s.cwd) || "session", 140);
      ctx.fillText(name, L.x + 48, y);
      const nw = ctx.measureText(name).width;
      ctx.fillStyle = "#9C9CA8";
      ctx.font = `11.5px ${FONT}`;
      let what = MOODS[s.state].label;
      if (s.state === "working" && s.tool) what = s.tool;
      const extra = s.detail && s.state !== "finished" ? ` · ${s.detail}` : "";
      ctx.fillText(fit(what + extra, right - (L.x + 56 + nw) - 36), L.x + 56 + nw, y);
      ctx.textAlign = "right";
      ctx.fillStyle = "#6E6E7A";
      ctx.fillText(ago(s.t), right, y);
    } else {
      const m = r.m;
      ctx.fillStyle = `hsl(${m.hue},75%,76%)`;
      ctx.font = `600 12px ${FONT}`;
      const name = fit(m.type, 130);
      ctx.fillText(name, L.x + 48, y);
      const nw = ctx.measureText(name).width;
      ctx.fillStyle = "#9C9CA8";
      ctx.font = `11.5px ${FONT}`;
      const doing = m.state === "done" ? "done ✓" : m.tool ? `${m.tool}${m.toolDetail ? " " + m.toolDetail : ""}` : m.desc || "working";
      const tag = m.bg ? " · background" : "";
      ctx.fillText(fit(doing + tag, right - (L.x + 56 + nw) - 36), L.x + 56 + nw, y);
      ctx.textAlign = "right";
      ctx.fillStyle = "#6E6E7A";
      ctx.fillText(ago(m.t), right, y);
    }
  });
  ctx.textAlign = "left";
  ctx.restore();
}

function stepMinis(dt) {
  for (const m of agents.values()) { m.x.step(dt); m.y.step(dt); m.sc.step(dt); }
}

function drawMinis(t) {
  for (const m of agents.values()) {
    if (m.state === "done" && !m.gone && t - m.doneAt > 1.4) {
      m.gone = true;
      m.sc.t = 0;
      m.removeAt = t + 0.3;
      emit("puff", m.x.v, m.y.v, 7);
      if (!m.quiet) Sound.fx.poof();
    }
    if (m.removeAt && t > m.removeAt) { agents.delete(m.key); continue; }
    if (t > m.blinkAt) { m.blinkUntil = t + 0.12; m.blinkAt = t + rand(2, 5); }
    const sc = m.sc.v;
    if (sc < 0.02) continue;
    const working = m.state === "working";
    const doneK = m.state === "done" ? t - m.doneAt : -1;
    const bob = working ? -Math.abs(Math.sin(t * 7 + m.phase)) * 2.2 : doneK >= 0 && doneK < 0.5 ? -Math.sin(doneK * Math.PI * 2) * 5 : 0;
    const look = { x: working ? Math.sin(t * 1.7 + m.phase) : 0, y: working ? 0.4 : 0 };
    drawCreature(m.x.v, m.y.v + bob, sc, {
      pal: miniPal(m.hue), t, sx: 1 + (working ? Math.sin(t * 7 + m.phase) * 0.04 : 0), sy: 1,
      rot: working ? Math.sin(t * 3 + m.phase) * 0.08 : 0,
      look, open: t < m.blinkUntil ? 0.05 : 1,
      eyes: m.state === "done" ? "happy" : "normal",
      mouth: m.state === "done" ? "grin" : Math.sin(t * 1.1 + m.phase) > 0.4 ? "tongue" : "flat",
      blush: 0.5, prop: working, leafSpin: t * 26 + m.phase, leafAngle: Math.sin(t * 2 + m.phase) * 0.2, walk: working,
    });
    if (m.state === "done" && doneK < 1.3) {
      ctx.fillStyle = "#34D17A";
      ctx.font = `700 ${10 * Math.min(1, doneK * 4)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("✓", m.x.v + 8, m.y.v - 6);
      ctx.textAlign = "left";
    }
  }
}

function drawPip(t) {
  const face = pipFace(t);
  const intro = pip.intro.v;
  const shake = pip.shake > 0 ? Math.sin(t * 45) * 0.18 * pip.shake : 0;
  const tilt = mood === "thinking" ? Math.sin(t * 1.4) * 0.08 : mood === "working" ? Math.sin(t * 5) * 0.05 : 0;
  drawCreature(pip.x, pip.y, pip.s * intro, {
    pal: PIP_PAL, t,
    sx: pip.sx.v * Math.cos(pip.spin), sy: pip.sy.v,
    rot: shake + tilt,
    look: { x: pip.lookX.v, y: pip.lookY.v }, open: pip.open.v,
    eyes: face.eyes, mouth: face.mouth, blush: pip.blush.v,
    prop: mood === "working" || pip.current() === "proud", leafSpin: pip.leafSpin, leafAngle: pip.leafAngle,
    walk: mood === "working",
  });

  // Badge: "…" while thinking, "!" when it needs you.
  const R = 13 * pip.s;
  const bx = pip.x + R * 1.05, by = pip.y - R * 0.75;
  if (mood === "thinking" || mood === "approval") {
    const accent = MOODS[mood].accent;
    const pulse = mood === "approval" ? 1 + 0.15 * Math.sin(t * 8) : 1;
    ctx.fillStyle = accent;
    ellipse(bx, by, 6.5 * pulse, 6.5 * pulse);
    ctx.fillStyle = "#FFFFFF";
    if (mood === "approval") {
      ctx.font = `800 10px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("!", bx, by + 3.5);
      ctx.textAlign = "left";
    } else {
      for (let i = 0; i < 3; i++) {
        const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 5 - i * 0.8));
        ctx.globalAlpha = a;
        ellipse(bx - 3 + i * 3, by, 1.1, 1.1);
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawBubble(t) {
  let text = null, x = pip.x, t0 = 0, until = 0;
  if (bubble && t < bubble.until) ({ text, t0, until } = bubble);
  if (hoveredMini) {
    const m = hoveredMini;
    text = `${m.type}: ${m.state === "done" ? "done!" : m.tool || m.desc || "working"}`;
    x = m.x.v; t0 = t - 1; until = t + 1;
  }
  if (!text) return;
  const k = clamp((t - t0) / 0.18, 0, 1);
  const fade = clamp((until - t) / 0.25, 0, 1);
  const sc = easeOutBack(k);
  ctx.font = `600 12px ${FONT}`;
  const label = fit(text, 260);
  const tw = ctx.measureText(label).width;
  const bw = tw + 18, bh = 24;
  const by = L.h.v + 10;
  const bx = clamp(x - bw / 2, 6, W - bw - 6);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, by);
  ctx.scale(sc, sc);
  ctx.translate(-x, -by);
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 11);
  ctx.moveTo(x - 6, by + 1);
  ctx.lineTo(x, by - 6);
  ctx.lineTo(x + 6, by + 1);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1B1B22";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + 9, by + bh / 2 + 0.5);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ── main loop ────────────────────────────────────────────────────────────────

let last = now();
let paused = false;
let rafId = 0, timer = 0, activeUntil = 0;
let dirty = { x: 0, y: 0, w: W, h: H };

/** How fast to animate right now: as slow as looks right, never faster. */
/** Fast motion (physics, springs, the user's hand) wants 60 fps. */
function fastReason(t) {
  if (t < activeUntil) return "wake";
  if (pip.jump < 0 || pip.spinV > 0 || pip.shake > 0.01) return "jump";
  if (Math.abs(L.w.v - L.w.t) > 0.5 || Math.abs(L.h.v - L.h.t) > 0.5 || Math.abs(L.ex.v - L.ex.t) > 0.01) return "layout";
  if (Math.abs(pip.drop.v - pip.drop.t) > 0.5 || Math.abs(pip.intro.v - 1) > 0.01) return "leap";
  if (mouse.in && t - mouse.lastMove < 2) return "mouse";
  if (particles.some((p) => p.kind === "confetti")) return "burst";
  return "";
}

/** Ambient motion (drifting notes, speech, emotes) looks fine at 30. Sleepy z's don't count. */
function ambientReason(t) {
  if (particles.some((p) => p.kind !== "z")) return "particles";
  if (bubble && t < bubble.until) return "bubble";
  if (pip.current()) return "emote";
  if (t < pip.whistleUntil) return "whistle";
  return "";
}

function desiredFps(t) {
  const fast = fastReason(t);
  if (fast) { stats.why[fast] = (stats.why[fast] || 0) + 1; return 60; }
  const amb = ambientReason(t);
  if (amb) { stats.why[amb] = (stats.why[amb] || 0) + 1; return 30; }
  for (const m of agents.values()) {
    if (m.state === "done" || Math.abs(m.x.v - m.x.t) > 0.5 || Math.abs(m.sc.v - m.sc.t) > 0.01) return 60;
  }
  if (mood === "approval" || mood === "working" || mood === "thinking" || agents.size) return 24;
  if (mood === "sleeping") return 6;
  return 12;
}

// The window grows at once when something needs room and shrinks back a
// moment after, in 32 px steps so it isn't resized on every frame.
let winH = 128, shrinkSince = 0;
function fitWindow(t) {
  const base = Math.max(L.h.v, L.h.t);
  let need = base + 16;
  if ((bubble && t < bubble.until) || hoveredMini) need = Math.max(need, base + 52);
  if (panel && agents.size) need = Math.max(need, base + 28);
  need = Math.max(need, pip.y + 13 * pip.s * 1.6);
  for (const p of particles) need = Math.max(need, p.y + 18);
  need = Math.min(H, Math.ceil(need / 32) * 32);
  if (need > winH) {
    winH = need; shrinkSince = 0;
    api.setWinHeight(winH);
  } else if (need < winH) {
    if (!shrinkSince) shrinkSince = t;
    if (t - shrinkSince > 0.8) { winH = need; shrinkSince = 0; api.setWinHeight(winH); }
  } else {
    shrinkSince = 0;
  }
}

function schedule() {
  if (paused || rafId || timer) return;
  const fps = desiredFps(now());
  if (fps >= 60) rafId = requestAnimationFrame(frame);
  else timer = setTimeout(() => { timer = 0; rafId = requestAnimationFrame(frame); }, Math.max(0, 1000 / fps - 6));
}

/** Something happened: animate at full speed for a moment. */
export function wake() {
  activeUntil = Math.max(activeUntil, now() + 1.2);
  if (paused || !ctx) return;
  if (timer) { clearTimeout(timer); timer = 0; }
  if (!rafId) rafId = requestAnimationFrame(frame);
}

/** Game mode: stop everything. Resuming picks up where it left off. */
export function setPaused(on) {
  paused = !!on;
  if (paused) {
    cancelAnimationFrame(rafId); rafId = 0;
    clearTimeout(timer); timer = 0;
    particles.length = 0;
    bubble = null;
  } else {
    last = now();
    wake();
  }
}

const stats = { frames: 0, since: now(), why: {} };
/** Debug: frames drawn per second since the last call, and why. */
export function frameStats() {
  const t = now(), out = { fps: +(stats.frames / (t - stats.since)).toFixed(1), want: desiredFps(t), mood, sessions: sessions.size, agents: agents.size };
  out.why = stats.why;
  stats.frames = 0; stats.since = t; stats.why = {};
  return out;
}

function frame() {
  rafId = 0;
  if (paused) return;
  stats.frames++;
  const t = now();
  // Low frame rates take several small physics steps so springs stay stable.
  let rem = Math.min(0.25, t - last);
  last = t;

  const m = computeMood();
  if (m !== mood) { const prev = mood; mood = m; onMood(prev, m); }

  let first = true;
  do {
    const step = Math.min(rem, 1 / 40);
    rem -= step;
    layout(step);
    updatePip(step, t);
    updateParticles(step);
    stepMinis(step);
    if (first) { updateHover(t); first = false; }
  } while (rem > 1e-4);

  fitWindow(t);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // Only clear what was drawn last frame plus what may be drawn now.
  const top = Math.max(L.h.v, L.h.t) + 90;
  const bottom = particles.reduce((mx, p) => Math.max(mx, p.y + 20), top);
  const area = { x: 0, y: 0, w: W, h: Math.min(H, Math.ceil(Math.max(bottom, pip.y + 60))) };
  ctx.clearRect(0, 0, W, Math.max(dirty.h, area.h));
  dirty = area;

  drawPill(t);
  drawHeader(t);
  drawRows();
  drawMinis(t);
  drawPip(t);
  drawParticles(t);
  drawBubble(t);

  schedule();
}

export function ingest({ events, replay }) {
  for (const e of events) apply(e, replay);
  if (replay) mood = computeMood(); // wake up in the right mood, without fanfare
  else wake();
}

/** Draws a big, happy Pip for the app icon (build step only). */
export function drawIcon(el, size = 256) {
  canvas = el;
  ctx = canvas.getContext("2d");
  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);
  const s = size / 42;
  drawCreature(size / 2, size * 0.61, s, {
    pal: PIP_PAL, t: 0, sx: 1, sy: 1, rot: 0, look: { x: 0.15, y: 0.1 }, open: 1,
    eyes: "normal", mouth: "grin", blush: 0.8, prop: false, leafSpin: 0, leafAngle: 0.1, walk: false,
  });
}

/** Starts Pip on a canvas. */
export function init(el, apiObj, hookObj) {
  canvas = el;
  ctx = canvas.getContext("2d");
  DPR = window.devicePixelRatio || 1;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  api = { ...api, ...apiObj };
  hooks = { ...hooks, ...hookObj };
  attachInput();
  // Hello!
  pip.intro.t = 1;
  setTimeout(() => { Sound.fx.hi(); say("hi! I'm Pip", 2.4); pip.hop(120); wake(); }, 500);
  wake();
}

// A scripted tour of every state, with three sproutlings.
export function demo() {
  const sid = "demo-" + Date.now(), cwd = "C:\\code\\demo-project";
  let at = 0;
  const ev = (delay, e) => { at += delay; setTimeout(() => ingest({ events: [{ t: wall(), sid, cwd, ...e }], replay: false }), at); };
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
  ev(1200, { ev: "PostToolUse", tool: "Bash" });
  ev(600, { ev: "Stop" });
  ev(5000, { ev: "StopFailure", msg: "demo: rate limited" });
  ev(4500, { ev: "SessionEnd" });
}

