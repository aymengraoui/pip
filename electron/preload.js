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
  setHitRects: (rects) => ipcRenderer.send("hit-rects", rects),
  setWinHeight: (h) => ipcRenderer.send("win-height", h),
  setFocus: (on) => ipcRenderer.send("focus", on),
  menu: () => ipcRenderer.send("menu"),
  quit: () => ipcRenderer.send("quit"),

  state: () => ipcRenderer.invoke("state"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  writeHooks: (install) => ipcRenderer.invoke("hooks:write", install),
  setStartup: (on) => ipcRenderer.invoke("startup:set", on),
});
