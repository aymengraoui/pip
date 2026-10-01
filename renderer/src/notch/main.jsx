import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { drawIcon } from "../engine/index.js";
import "./notch.css";

if (location.hash === "#icon") {
  // Build step: scripts/make-icon.js captures this canvas as the app icon.
  const c = document.createElement("canvas");
  document.body.appendChild(c);
  drawIcon(c, 256);
  document.title = "icon-ready";
} else {
  createRoot(document.getElementById("root")).render(<App />);
}
