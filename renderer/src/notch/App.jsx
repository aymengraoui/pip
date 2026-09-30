// The notch window: Pip's canvas underneath, the settings panel on top.
//
// The engine owns the notch's shape and tells us where it will settle; the
// panel is positioned inside that shape. Everything outside it is
// click-through.

import { useCallback, useEffect, useRef, useState } from "react";
import * as engine from "./engine.js";
import Settings from "./Settings.jsx";
import { CloseIcon, GearIcon } from "../shared/icons.jsx";

const pip = window.pip;
const SETTINGS_SIZE = { w: 460, h: 440 };

export default function App() {
  const canvasRef = useRef(null);
  const [layout, setLayout] = useState({ x: 200, w: 240, h: 48, expanded: false, panel: null });
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const openRef = useRef(false);
  openRef.current = open;

  const openSettings = useCallback(() => {
    if (openRef.current) return;
    setOpen(true);
    engine.setPanel("settings", SETTINGS_SIZE);
    engine.sfx("open");
    pip.setFocus(true);
  }, []);

  const closeSettings = useCallback(() => {
    if (!openRef.current) return;
    setOpen(false);
    engine.setPanel(null);
    engine.sfx("close");
    pip.setFocus(false);
  }, []);

  useEffect(() => {
    engine.init(canvasRef.current, { setHitRects: pip.setHitRects, setWinHeight: pip.setWinHeight, menu: pip.menu }, { onLayout: setLayout });
    const offs = [
      pip.onEvents((p) => engine.ingest(p)),
      pip.onState((s) => { setState(s); engine.setMuted(s.settings.muted); }),
      pip.onPause((on) => { engine.setPaused(on); if (on) closeSettings(); }),
      pip.onCursor((c) => engine.setCursor(c)),
      pip.onPanel(() => openSettings()),
      pip.onDemo(() => engine.demo()),
    ];
    pip.state().then((s) => { setState(s); engine.setMuted(s.settings.muted); });
    if (new URLSearchParams(location.search).has("debug")) window.__pip = { engine, openSettings, closeSettings };
    const onKey = (e) => { if (e.key === "Escape") closeSettings(); };
    window.addEventListener("keydown", onKey);
    return () => { offs.forEach((off) => off()); window.removeEventListener("keydown", onKey); };
  }, [openSettings, closeSettings]);

  return (
    <>
      <canvas ref={canvasRef} />
      <div className="overlay" style={{ left: layout.x, width: layout.w, height: layout.h }}>
        <div className={`hdr-btns ${layout.expanded || open ? "on" : ""}`}>
          {open
            ? <button title="Close (Esc)" onClick={closeSettings}><CloseIcon /></button>
            : <button title="Settings" onClick={openSettings}><GearIcon /></button>}
        </div>
        {open && state && (
          <div className="panel-body">
            <Settings state={state} onDemo={() => { closeSettings(); engine.demo(); }} />
          </div>
        )}
      </div>
    </>
  );
}
