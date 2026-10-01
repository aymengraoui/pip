// Pip itself: one little mint sprout with springs for a skeleton.
//
// Its mood comes from model.js, its position from layout.js, and everything
// else - where it looks, when it blinks, hops, naps, whistles or giggles - is
// decided here.

import { clamp, lerp, now, pick, rand, Spring } from "./util.js";
import { ctx, ellipse, FONT, W } from "./gfx.js";
import * as creature from "./creature.js";
import * as particles from "./particles.js";
import * as sound from "./sound.js";
import { say } from "./speech.js";
import { mouse, fresh } from "./pointer.js";
import { agents, mood, MOODS, notePoke } from "./model.js";

/** Radius of the body at scale 1, in notch pixels. */
const BASE_R = 13;

export const pip = {
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
  /** Jump right out of the notch and climb back in. */
  leap(depth = 34, dur = 0.8) { this.drop.t = depth; this.dropUntil = now() + dur; },
  twirl() { this.spinV = 14; },
  radius() { return BASE_R * this.s; },
};

/** Is the cursor on Pip (with a little slack, since it is small)? */
export const isOver = (x, y, slack = 4) => Math.hypot(x - pip.x, y - pip.y) < 18 * pip.s + slack;

// -- reactions ----------------------------------------------------------------

/** The mood changed: Pip has something to say about it. */
export function onMood(prev, next) {
  const t = now();
  if (prev === "sleeping" && next !== "sleeping") { pip.emote("surprised", 0.7); sound.sfx.boop(); }
  switch (next) {
    case "approval":
      sound.sfx.alert();
      pip.emote("surprised", 0.6);
      pip.hop(160);
      say(pick(["psst! you're needed", "need your OK!", "can I? can I?", "permission, please!"]), 2.6);
      break;
    case "finished":
      sound.sfx.done();
      pip.leap(36, 0.85);
      pip.twirl();
      pip.emote("giggle", 1.6);
      particles.emit("confetti", pip.x, pip.y + 10, 46);
      say(pick(["done!", "ta-da!", "all done ✨", "nailed it!", "woohoo!"]), 2.2);
      break;
    case "error":
      sound.sfx.error();
      pip.shake = 1;
      pip.errorAt = t;
      particles.emit("smoke", pip.x, pip.y - 6, 6);
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

/** A sproutling just popped out of Pip. */
export function cheerSpawn() {
  sound.sfx.pop();
  particles.emit("puff", pip.x + 10, pip.y, 5);
  particles.emit("spark", pip.x + 10, pip.y, 4);
  pip.emote("proud", 0.8);
  if (Math.random() < 0.45) say(pick(["go little buddy!", "helpers, assemble!", "you got this!", "off you go!", "sprout squad!"]), 1.8);
}

/** Say hello on startup. */
export function greet() {
  sound.sfx.hi();
  say("hi! I'm Pip", 2.4);
  pip.hop(120);
}

// -- interaction --------------------------------------------------------------

/** A click on Pip: tickle, or wake it, or make it dizzy if you keep going. */
export function poke() {
  const t = now();
  notePoke();
  pip.pokes = pip.pokes.filter((p) => t - p < 2.5);
  pip.pokes.push(t);
  if (mood === "sleeping") {
    pip.emote("surprised", 0.8);
    sound.sfx.boop();
    say(pick(["huh? oh, hi!", "i was NOT sleeping", "five more minutes…"]), 1.8);
    pip.hop(120);
    return;
  }
  if (pip.pokes.length >= 5) {
    pip.pokes = [];
    pip.emote("dizzy", 2.6);
    sound.sfx.dizzy();
    pip.shake = 0.7;
    say(pick(["hey!!", "too much!", "the room is spinning…"]), 2);
    return;
  }
  pip.emote("giggle", 0.8);
  sound.sfx.giggle();
  pip.sx.vel += 5;
  pip.sy.vel -= 5;
  pip.hop(110);
  particles.emit("heart", pip.x, pip.y + 4, 2);
}

/** Wiggling the cursor over Pip pets it; enough petting earns a purr. */
export function pet(x, y, dx, dy) {
  const travel = Math.abs(dx) + Math.abs(dy);
  if (Math.hypot(x - pip.x, y - pip.y) < 20 * pip.s && travel < 80) pip.petAcc += travel;
}

// -- per-frame ----------------------------------------------------------------

export function step(dt, t) {
  const em = pip.current();
  const R = pip.radius();
  const mouseFresh = fresh(t);
  const dx = mouse.x - pip.x, dy = mouse.y - pip.y;
  const near = mouseFresh && Math.hypot(dx, dy) < 280;

  stepGaze(dt, t, { em, near, dx, dy });
  stepBlink(dt, t, near);
  stepBounce(dt, t, em);
  stepBody(dt, t, em, near);
  stepAntics(dt, t, em, R);
  stepPetting(dt, t);
}

function stepGaze(dt, t, { em, near, dx, dy }) {
  let lx = 0, ly = 0;
  if (em === "dizzy") { lx = Math.cos(t * 9); ly = Math.sin(t * 9); }
  else if (near && mood !== "sleeping") { lx = clamp(dx / 90, -1, 1); ly = clamp(dy / 60, -1, 1); }
  else if (mood === "thinking") { lx = 0.75 + 0.2 * Math.sin(t * 1.3); ly = -0.85; }
  else if (mood === "working") { lx = Math.sin(t * 2.3) * 0.85; ly = 0.55; }
  else if (mood === "approval") { lx = Math.sin(t * 6) * 0.3; ly = 1; }
  else {
    // Idle: glance around, and now and then at a sproutling.
    if (t > pip.nextGlance) {
      const first = agents.values().next().value;
      const sprite = first && first.view;
      pip.glance = sprite && Math.random() < 0.5
        ? { x: clamp((sprite.x.v - pip.x) / 60, -1, 1), y: 0.1 }
        : { x: rand(-1, 1), y: rand(-0.6, 0.8) };
      pip.nextGlance = t + rand(1.2, 3.5);
    }
    lx = pip.glance.x;
    ly = pip.glance.y;
  }
  pip.lookX.t = lx;
  pip.lookY.t = ly;
  pip.lookX.step(dt);
  pip.lookY.step(dt);
}

function stepBlink(dt, t, near) {
  if (t > pip.blinkAt) {
    pip.blinkUntil = t + 0.11;
    pip.blinkAt = t + (Math.random() < 0.2 ? 0.22 : rand(2, 5.5)); // sometimes a double blink
  }
  let open = t < pip.blinkUntil ? 0.05 : 1;
  if (mood === "sleeping" && !near) open = 0;
  if (mood === "thinking") open = Math.min(open, 0.75);
  pip.open.t = open;
  pip.open.step(dt);
}

function stepBounce(dt, t, em) {
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

  if (pip.spinV > 0 || pip.spin > 0) {
    pip.spin += pip.spinV * dt;
    if (pip.spin >= Math.PI * 2) { pip.spin = 0; pip.spinV = 0; }
  }
}

function stepBody(dt, t, em, near) {
  // Breathing squash.
  const breath = mood === "sleeping" ? Math.sin(t * 1.6) * 0.05 : Math.sin(t * 2.4) * 0.025;
  pip.sx.t = 1 - breath * 0.7;
  pip.sy.t = 1 + breath;
  pip.sx.step(dt);
  pip.sy.step(dt);

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
}

function stepAntics(dt, t, em, R) {
  if (mood === "idle" && !em && t > pip.nextIdle) {
    const act = pick(["whistle", "whistle", "hop", "yawn", "twirl", "wave"]);
    if (act === "whistle") pip.whistleUntil = t + 2.2;
    if (act === "hop") { pip.hop(110); setTimeout(() => pip.hop(90), 380); }
    if (act === "yawn") { pip.emote("yawn", 1.5); sound.sfx.yawn(); }
    if (act === "twirl") { pip.twirl(); pip.hop(100); }
    if (act === "wave") pip.emote("proud", 1.2);
    pip.nextIdle = t + rand(18, 40);
  }
  if (t < pip.whistleUntil && t > pip.nextNote) {
    particles.emit("note", pip.x + R * 0.6, pip.y + R * 0.2, 1);
    sound.sfx.note();
    pip.nextNote = t + 0.45;
  }
  if (mood === "sleeping" && t > pip.nextZ) {
    particles.emit("z", pip.x + R * 0.7, pip.y - R * 0.2, 1);
    pip.nextZ = t + 1.1;
  }
}

function stepPetting(dt, t) {
  pip.petAcc *= Math.pow(0.35, dt); // fades fast, so only real wiggling counts
  if (pip.petAcc > 650 && t > pip.petCooldown) {
    pip.petAcc = 0;
    pip.petCooldown = t + 3;
    pip.emote("love", 2.2);
    sound.sfx.purr();
    particles.emit("heart", pip.x, pip.y + 6, 7);
    say(pick(["hehe ♥", "purrr…", "more pets!", "♥ ♥ ♥"]), 1.8);
  }
}

// -- drawing ------------------------------------------------------------------

/** Which eyes and mouth to wear right now. */
export function face(t) {
  const em = pip.current();
  const hovered = fresh(t) && Math.hypot(mouse.x - pip.x, mouse.y - pip.y) < 60;
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

export function draw(t) {
  const look = face(t);
  const shake = pip.shake > 0 ? Math.sin(t * 45) * 0.18 * pip.shake : 0;
  const tilt = mood === "thinking" ? Math.sin(t * 1.4) * 0.08 : mood === "working" ? Math.sin(t * 5) * 0.05 : 0;
  creature.draw(pip.x, pip.y, pip.s * pip.intro.v, {
    pal: creature.PIP_PAL, t,
    sx: pip.sx.v * Math.cos(pip.spin), sy: pip.sy.v,
    rot: shake + tilt,
    look: { x: pip.lookX.v, y: pip.lookY.v }, open: pip.open.v,
    eyes: look.eyes, mouth: look.mouth, blush: pip.blush.v,
    prop: mood === "working" || pip.current() === "proud",
    leafSpin: pip.leafSpin, leafAngle: pip.leafAngle,
    walk: mood === "working",
  });
  drawBadge(t);
}

/** "…" while thinking, "!" when Claude needs you. */
function drawBadge(t) {
  if (mood !== "thinking" && mood !== "approval") return;
  const R = pip.radius();
  const bx = pip.x + R * 1.05, by = pip.y - R * 0.75;
  const pulse = mood === "approval" ? 1 + 0.15 * Math.sin(t * 8) : 1;
  ctx.fillStyle = MOODS[mood].accent;
  ellipse(bx, by, 6.5 * pulse, 6.5 * pulse);
  ctx.fillStyle = "#FFFFFF";
  if (mood === "approval") {
    ctx.font = `800 10px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("!", bx, by + 3.5);
    ctx.textAlign = "left";
  } else {
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 5 - i * 0.8));
      ellipse(bx - 3 + i * 3, by, 1.1, 1.1);
    }
    ctx.globalAlpha = 1;
  }
}

/** Still moving in a way that wants 60 fps? */
export function busy() {
  return pip.jump < 0 || pip.spinV > 0 || pip.shake > 0.01;
}

export function settling() {
  return pip.drop.settling() || Math.abs(pip.intro.v - 1) > 0.01;
}
