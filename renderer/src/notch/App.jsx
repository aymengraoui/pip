// The notch window: Pip's canvas underneath, one panel on top.
//
// The engine owns the notch's shape and tells us where it will settle; the panel
// is positioned inside that shape. Everything outside it is click-through.
//
// Two panels, both drawn inside the notch:
//   settings  the gear, the tray, or right-clicking Pip
//   inspect   clicking a sproutling or a row: what it is doing, live

import { useCallback, useEffect, useRef, useState } from "react";
import * as engine from "../engine/index.js";
import Settings from "./Settings.jsx";
import Inspector from "./Inspector.jsx";
import { CloseIcon, GearIcon } from "../shared/icons.jsx";

const pip = window.pip;
const PANELS = {
  settings: { w: 460, h: 440 },
  inspect: { w: 520, h: 420 },
};

export default function App() {
  const canvasRef = useRef(null);
  const [layout, setLayout] = useState({ x: 200, w: 240, h: 48, expanded: false, panel: null });
  const [panel, setPanel] = useState(null);
  const [state, setState] = useState(null);
  const announced = useRef(false);
  const panelRef = useRef(null);
  panelRef.current = panel;

  const openPanel = useCallback((name) => {
    if (panelRef.current === name) return;
    const switching = !!panelRef.current;
    setPanel(name);
    engine.setPanel(name, PANELS[name]);
    engine.sfx(switching ? "boop" : "open");
    // Only Settings has a text field. The inspector must never take focus: the
    // whole point is to read it without leaving your terminal.
    pip.setFocus(name === "settings");
  }, []);

  const closePanel = useCallback(() => {
    if (!panelRef.current) return;
    setPanel(null);
    engine.setPanel(null);
    engine.sfx("close");
    pip.setFocus(false);
  }, []);

  useEffect(() => {
    engine.init(
      canvasRef.current,
      { setHitRects: pip.setHitRects, setWinHeight: pip.setWinHeight, menu: pip.menu, focusSession: pip.focusSession, setWaiting: pip.setWaiting },
      { onLayout: setLayout, onInspect: (target) => (target ? openPanel("inspect") : closePanel()) },
    );
    const offs = [
      pip.onEvents((p) => engine.ingest(p)),
      pip.onState((s) => {
        setState(s);
        engine.setMuted(s.settings.muted);
        // An update finished downloading: Pip mentions it once, and waits.
        if (s.update && s.update.status === "ready" && !announced.current) {
          announced.current = true;
          engine.sfx("done");
          engine.speak(`I grew! restart me for ${s.update.version}`, 4);
        }
      }),
      pip.onPause((on) => { engine.setPaused(on); if (on) closePanel(); }),
      pip.onCursor((c) => engine.setCursor(c)),
      pip.onPanel((name) => {
        if (name === "inspect") { if (!engine.inspectLead()) engine.speak("nothing running yet", 2); }
        else openPanel("settings");
      }),
      pip.onDemo(() => engine.demo()),
      pip.onAway((on) => engine.setAway(on)),
    ];
    pip.state().then((s) => { setState(s); engine.setMuted(s.settings.muted); });
    if (new URLSearchParams(location.search).has("debug")) window.__pip = { engine, openPanel, closePanel };
    const onKey = (e) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKey);
    return () => { offs.forEach((off) => off()); window.removeEventListener("keydown", onKey); };
  }, [openPanel, closePanel]);

  return (
    <>
      <canvas ref={canvasRef} />
      <div className="overlay" style={{ left: layout.x, width: layout.w, height: layout.h }}>
        <div className={`hdr-btns ${layout.expanded || panel ? "on" : ""}`}>
          {panel
            ? <button title="Close (Esc)" onClick={closePanel}><CloseIcon /></button>
            : <button title="Settings" onClick={() => openPanel("settings")}><GearIcon /></button>}
        </div>
        {panel === "settings" && state && (
          <div className="panel-body">
            <Settings state={state} onDemo={() => { closePanel(); engine.demo(); }} />
          </div>
        )}
        {panel === "inspect" && (
          <div className="panel-body fit">
            <Inspector />
          </div>
        )}
      </div>
    </>
  );
}
