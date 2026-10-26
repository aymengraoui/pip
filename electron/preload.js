const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("pip", {
  onEvents: on("events"),
  onState: on("state"),
  onPause: on("pause"),
  onCursor: on("cursor"),
  onPanel: on("panel"),
  onDemo: on("demo"),
  onAway: on("away"),
  onDragEnd: on("drag-end"),
  onRoam: on("roam"),
  onRoamPose: on("roam-pose"),
  setHitRects: (rects) => ipcRenderer.send("hit-rects", rects),
  setWinHeight: (h) => ipcRenderer.send("win-height", h),
  setFocus: (on) => ipcRenderer.send("focus", on),
  setWaiting: (pid) => ipcRenderer.send("waiting", pid),
  setDemo: (on) => ipcRenderer.send("demo-state", on),
  // True: the main process will follow the drag and answer with "drag-end".
  startDrag: () => { ipcRenderer.send("drag-start"); return true; },
  stopDrag: () => ipcRenderer.send("drag-stop"),
  menu: () => ipcRenderer.send("menu"),
  quit: () => ipcRenderer.send("quit"),

  state: () => ipcRenderer.invoke("state"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  writeHooks: (install) => ipcRenderer.invoke("hooks:write", install),
  setStartup: (on) => ipcRenderer.invoke("startup:set", on),
  focusSession: (pid) => ipcRenderer.invoke("session:focus", pid),
  isAway: (pid) => ipcRenderer.invoke("session:away", pid),
  // Pip out on the desktop (electron/roam.js): the notch reports its mood and
  // where Pip sits; the roaming window reports hover and clicks.
  roamMood: (m) => ipcRenderer.send("roam-mood", m),
  roamHover: (on) => ipcRenderer.send("roam-hover", !!on),
  roamClick: () => ipcRenderer.send("roam-click"),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
});
