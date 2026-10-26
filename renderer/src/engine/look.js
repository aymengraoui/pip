// How Pip looks: what it is, its colour, what it wears, and the notch it lives in. Picked in
// Settings, saved as `look` in settings.json, read here on every frame.
//
// Plain data and two getters, no engine imports, so the creature, the notch and
// the Settings panel can all read the same lists.

/** Pip's body colours. The sprout stays a sprout: leaves are green unless noted. */
export const BODIES = {
  mint:     { name: "Mint",     light: "#EFFFF7", mid: "#9DEBCB", edge: "#58C79C", feet: "#44A984", leaf: "#3DBB74", leafDark: "#2A8A56" },
  peach:    { name: "Peach",    light: "#FFF4EC", mid: "#FFC9A8", edge: "#F29C70", feet: "#D9805A", leaf: "#3DBB74", leafDark: "#2A8A56" },
  bubblegum:{ name: "Bubblegum",light: "#FFF0F6", mid: "#FFB8D4", edge: "#F27FAD", feet: "#D9628F", leaf: "#3DBB74", leafDark: "#2A8A56" },
  lavender: { name: "Lavender", light: "#F6F0FF", mid: "#CDB8FF", edge: "#9F84EB", feet: "#8569D1", leaf: "#3DBB74", leafDark: "#2A8A56" },
  sky:      { name: "Sky",      light: "#EEF8FF", mid: "#A8DBFF", edge: "#6AB3EE", feet: "#4F97D4", leaf: "#3DBB74", leafDark: "#2A8A56" },
  lemon:    { name: "Lemon",    light: "#FFFDEB", mid: "#FFE98F", edge: "#EFC94F", feet: "#D4AC33", leaf: "#3DBB74", leafDark: "#2A8A56" },
  ginger:   { name: "Ginger",   light: "#FFF3E2", mid: "#FFC27A", edge: "#EE9440", feet: "#D27A2C", leaf: "#3DBB74", leafDark: "#2A8A56" },
  snow:     { name: "Snow",     light: "#FFFFFF", mid: "#F2F2F7", edge: "#CBCCD8", feet: "#B0B2C4", leaf: "#3DBB74", leafDark: "#2A8A56" },
  caramel:  { name: "Caramel",  light: "#FFF3E4", mid: "#E9C190", edge: "#C99358", feet: "#A57340", leaf: "#3DBB74", leafDark: "#2A8A56" },
  steel:    { name: "Steel",    light: "#F3F7FB", mid: "#C8D5E2", edge: "#91A3B7", feet: "#71849A", leaf: "#3DBB74", leafDark: "#2A8A56" },
  sakura:   { name: "Sakura",   light: "#FFF6F8", mid: "#FFD6E0", edge: "#F0A6BA", feet: "#D9889E", leaf: "#FF8FB1", leafDark: "#D9628F" },
  // Capri's coat: only offered, and only kept, while she is picked (`capri`).
  crimson:  { name: "Crimson",  light: "#FFE1E8", mid: "#FF4D79", edge: "#C81E4E", feet: "#6E1438", leaf: "#3BE38A", leafDark: "#1FA85E", capri: true },
};

/**
 * Who Pip is, and the coat it comes in. Helpers are the same kind, in their own
 * colours. The sprout is drawn in creature.js, the rest in critters.js.
 */
export const KINDS = {
  sprout: { name: "Sprout", body: "mint" },
  kitty: { name: "Kitty", body: "ginger" },
  bunny: { name: "Bunny", body: "snow" },
  puppy: { name: "Puppy", body: "caramel" },
  robot: { name: "Robot", body: "steel" },
  // Capri, the Project Capricorn construct: spiky mane, green mask, glowing eyes.
  // Picking her also gives the notch her skin (skin() below).
  capri: { name: "Capri", body: "crimson" },
};

/** Something to wear. Drawn by creature.js, on Pip only. */
export const ACCESSORIES = {
  none: "Nothing",
  bow: "Bow",
  flower: "Flower",
  crown: "Crown",
  party: "Party hat",
  glasses: "Glasses",
};

/**
 * The notch and the panels inside it. All dark: the notch grows out of the
 * screen's black bezel, and a light one would look like a hole in the wall.
 * `bg` is the pill; the rest become CSS variables for the panels.
 */
export const THEMES = {
  midnight: { name: "Midnight", bg: "#0B0B0F", surface: "#15151B", raise: "#1A1A21", hover: "#22222B", line: "#25252E", sub: "#9C9CA8" },
  berry:    { name: "Berry",    bg: "#170D18", surface: "#221425", raise: "#2A192D", hover: "#352038", line: "#3D2741", sub: "#BFA0BE" },
  forest:   { name: "Forest",   bg: "#0A140F", surface: "#122019", raise: "#17271F", hover: "#1F3229", line: "#253A2F", sub: "#97B3A5" },
  ocean:    { name: "Ocean",    bg: "#0A111E", surface: "#111B2C", raise: "#162235", hover: "#1E2C44", line: "#26344D", sub: "#97A7C3" },
  cocoa:    { name: "Cocoa",    bg: "#170F0B", surface: "#231914", raise: "#2B1F19", hover: "#372820", line: "#3E2E25", sub: "#BCA595" },
  // Capri's theme: only offered, and only kept, while she is picked (`capri`).
  nightcity:{ name: "Night City", bg: "#0D0913", surface: "#181120", raise: "#1E1528", hover: "#281C35", line: "#342542", sub: "#B9A0CC", capri: true },
};

// Keep in step with DEFAULTS.look in electron/store.js: the main process can't
// import this module, so the defaults are written down in both places.
export const DEFAULT_LOOK = { kind: "sprout", body: "mint", accessory: "none", cheeks: false, theme: "midnight" };

let current = DEFAULT_LOOK;

// Kinds that were renamed: a look saved under the old name keeps its creature.
const RENAMED = { construct: "capri" };

// Own keys only: `in` would let "constructor" or "toString" through.
const known = (list, name, fallback) => (typeof name === "string" && Object.hasOwn(list, name) ? name : fallback);

/**
 * Whatever settings.json says, with names this version doesn't know swapped for
 * the defaults. Settings reads this too, so it shows what is actually drawn.
 */
export function clean(look) {
  const l = { ...DEFAULT_LOOK, ...(look || {}) };
  const kind = known(KINDS, RENAMED[l.kind] || l.kind, DEFAULT_LOOK.kind);
  let body = known(BODIES, l.body, DEFAULT_LOOK.body);
  let theme = known(THEMES, l.theme, DEFAULT_LOOK.theme);
  // Capri's coat and theme go with her: picking anyone else puts that creature's
  // own coat and the default notch back, as if she had never been here.
  if (kind !== "capri") {
    if (BODIES[body].capri) body = KINDS[kind].body;
    if (THEMES[theme].capri) theme = DEFAULT_LOOK.theme;
  }
  return { kind, body, accessory: known(ACCESSORIES, l.accessory, DEFAULT_LOOK.accessory), cheeks: !!l.cheeks, theme };
}

/** What Settings offers for this look: Capri's own coat and theme only while she is picked. */
export const offered = (list, kind) => Object.entries(list).filter(([, v]) => !v.capri || kind === "capri");

export function set(look) { current = clean(look); }

export const get = () => current;
export const body = () => BODIES[current.body];
export const theme = () => THEMES[current.theme];
