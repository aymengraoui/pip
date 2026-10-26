import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { drawIcon } from "../engine/index.js";
import "./notch.css";
// Capri's fonts, for her skin (Latin only: it is all she needs).
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/chakra-petch/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-600.css";

if (location.hash === "#icon") {
  // Build step: scripts/make-icon.js captures this canvas as the app icon.
  const c = document.createElement("canvas");
  document.body.appendChild(c);
  drawIcon(c, 256);
  document.title = "icon-ready";
} else if (location.hash === "#roam") {
  // Pip out on the desktop: the small window electron/roam.js moves around.
  import("../roam/roam.js");
} else {
  createRoot(document.getElementById("root")).render(<App />);
}
