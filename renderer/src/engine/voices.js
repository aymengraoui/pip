// What Pip says, by creature. Every kind speaks Pip's own lines (written next to
// each moment in pip.js) unless it has its own voice here.
//
// Capri is the Project Capricorn construct from Night City: dozens of minds
// folded into one, so she says "we" as often as "I". She is chaotic, a little
// menacing and very fond of you; the slang is Night City's (choom, preem, nova,
// gonk, flatline). Some moments only she has: chatter while idle, and what she
// says when poked.
//
// Plain data, no engine imports (layer 0).

const VOICES = {
  capri: {
    hello: ["construct online. hi, choom", "all of us are awake", "biochip warm. we're here", "miss us?", "boot complete. chaos loaded"],
    approval: ["choom! you're needed", "your green light, choom", "we wait for you…", "decide, decide, DECIDE", "it wants your blessing", "push the button. you know you want to"],
    finished: ["preem!", "gig done, choom", "nova, right?", "delivered ✦", "we did a crime. a good one", "heh. too easy", "another one flatlined ✦"],
    error: ["it flatlined…", "glitch in the net", "heh. chaos", "we saw that crash", "boom. delightful", "that wasn't us. probably", "the code bit back"],
    sleeping: ["dozing in the net…", "dreaming of satellites…", "systems dim…"],
    spawn: ["more minds, deployed", "go, little me!", "split and hunt", "another of us", "multiply!", "the hive grows"],
    stuck: ["the net went quiet…", "is it stuck, choom?", "nothing moves…", "frozen. like ice. like my heart"],
    woken: ["we were NOT asleep", "eyes open. online", "huh? hi, choom", "who dares", "five more cycles…"],
    dizzy: ["glitching!!", "too many inputs!", "the net is spinning…", "STACK OVERFLOW", "everything is red"],
    petted: ["hehe ✦", "purr.exe", "more, choom", "✦ ✦ ✦", "we'll allow it"],
    poked: ["hey!", "zap.", "careful, choom", "we bite", "boop detected", "do that again. i dare you"],
    idle: [
      "the satellite's still up there…", "bored. let's break something", "we could rewrite the net…",
      "i counted your tabs. too many", "still here. always here", "anyone wanna start a gig?",
      "the code is quiet. suspicious", "dozens of us, and nothing to do", "i hear static. i like it",
    ],
    heat3: ["NCPD's onto us…", "getting hot, choom", "three strikes. ooh"],
    heat5: ["FIVE STARS! MaxTac inbound!", "max heat, choom!", "everything is ON FIRE ✦"],
    ram: ["our memory's crowded, choom", "RAM's nearly full…", "too many thoughts. even for us"],
    call: ["incoming holocall…", "it's Claude, choom. pick up", "holocall for you", "ring ring, choom!"],
  },
};

/** The lines a kind says at a moment: its own voice, else `own` (Pip's). */
export function lines(kind, moment, own) {
  return VOICES[kind]?.[moment] || own;
}
