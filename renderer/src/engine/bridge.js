// The seam between the engine and everything outside it: the main process
// (hit rects, window height, native menu) and React (notch shape, inspector).
//
// The engine never imports React or Electron; it calls these.

const noop = () => {};

export const host = {
  setHitRects: noop,  // which parts of the window take clicks
  setWinHeight: noop, // how tall the window needs to be right now
  menu: noop,         // right click: native context menu
  focusSession: noop, // raise the terminal a session is running in
  setWaiting: noop,   // which process is waiting on the user, or 0
};

export const ui = {
  onLayout: noop,     // the notch's shape, so React can sit panels inside it
  onInspect: noop,    // the user clicked a creature or a row: show it, or null to close
};

export function configure(hostApi, uiApi) {
  Object.assign(host, hostApi);
  Object.assign(ui, uiApi);
}
