// What Pip says, by creature. Every kind speaks Pip's own lines (written next to
// each moment in pip.js) unless it has its own voice here. The construct is a
// personality construct from Night City: dozens of minds in one, so she sometimes
// says "we", and the slang is choom, preem, nova, flatline.
//
// Plain data, no engine imports (layer 0).

const VOICES = {
  construct: {
    hello: ["construct online. hi, choom", "all of us are awake", "biochip warm. we're here"],
    approval: ["choom! you're needed", "your green light, choom", "we wait for you…", "permission, choom"],
    finished: ["preem!", "gig done, choom", "nova, right?", "flatlined that task", "delivered ✦"],
    error: ["it flatlined…", "glitch in the net", "heh. chaos", "we saw that crash"],
    sleeping: ["dozing in the net…"],
    spawn: ["more minds, deployed", "go, little me!", "split and hunt", "another of us"],
    stuck: ["the net went quiet…", "is it stuck, choom?", "nothing moves…"],
    woken: ["we were NOT asleep", "eyes open. online", "huh? hi, choom"],
    dizzy: ["glitching!!", "too many inputs!", "the net is spinning…"],
    petted: ["hehe ✦", "purr.exe", "more, choom", "✦ ✦ ✦"],
    heat3: ["NCPD's onto us…", "getting hot, choom"],
    heat5: ["FIVE STARS! MaxTac inbound!", "max heat, choom!"],
    ram: ["our memory's crowded, choom", "RAM's nearly full…"],
    call: ["incoming holocall…", "it's Claude, choom. pick up", "holocall for you"],
  },
};

/** The lines a kind says at a moment: its own voice, else `own` (Pip's). */
export function lines(kind, moment, own) {
  return VOICES[kind]?.[moment] || own;
}
