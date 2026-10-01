// Tiny synthesized bleeps, no audio files. One AudioContext, parked when quiet.

import { pick, rand } from "./util.js";

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

export const sfx = {
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

export function play(name) { sfx[name] && sfx[name](); }
export function setMuted(on) { muted = !!on; }
export const isMuted = () => muted;
