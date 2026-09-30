// Renders Pip to build/icon.png (256×256) for the installer, exe and tray.
// Run with Electron after `vite build`: electron scripts/make-icon.js

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 256, height: 256, show: false, transparent: true, frame: false,
    useContentSize: true, webPreferences: { offscreen: true },
  });
  win.webContents.setZoomFactor(1);
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "icon" });
  for (let i = 0; i < 50 && win.getTitle() !== "icon-ready"; i++) await new Promise((r) => setTimeout(r, 50));
  const dataUrl = await win.webContents.executeJavaScript("document.querySelector('canvas').toDataURL('image/png')");
  const out = path.join(__dirname, "..", "build", "icon.png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("wrote", out);
  app.quit();
});
