// Click a sproutling (or a row in the open notch) and this panel says exactly
// what that subagent or session is doing, without switching windows.
//
// It owns no state: the engine keeps the activity log and tells us when it
// changed. Nothing in here counts seconds. A panel full of "14s ago" has to be
// re-rendered forever to stay true, and it never says anything the task and the
// status don't already say; a finished call's duration is a fact and sits still.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as engine from "../engine/index.js";
import { duration } from "../engine/util.js";

const pip = window.pip;

const SHOWN = 8;        // entries on screen; the rest are counted, not scrolled
const PANEL_CHROME = 74; // the notch header above the panel, plus its bottom padding

const KINDS = {
  tool: { label: "", tone: "" },
  prompt: { label: "You asked", tone: "accent" },
  permission: { label: "Waiting for you", tone: "warn" },
  start: { label: "Started", tone: "" },
  done: { label: "Finished", tone: "ok" },
  turn: { label: "Turn finished", tone: "ok" },
  error: { label: "Failed", tone: "bad" },
  end: { label: "Session ended", tone: "" },
};

const hueColor = (hue) => (hue < 0 ? "var(--mint)" : `hsl(${hue},75%,76%)`);

export default function Inspector() {
  const [snap, setSnap] = useState(() => engine.inspectSnapshot());
  const body = useRef(null);

  // Redraw when the engine says something happened, and not otherwise.
  useEffect(() => engine.subscribeInspect(() => setSnap(engine.inspectSnapshot())), []);

  // Nothing here scrolls: the notch is told how tall this content is and grows
  // to fit it. Measured after every paint, since the log grows as work happens.
  useLayoutEffect(() => {
    if (body.current) engine.resizePanel(body.current.getBoundingClientRect().height + PANEL_CHROME);
  });

  if (!snap) return <div className="insp" ref={body}><div className="hint">Nothing selected.</div></div>;
  if (snap.missing) {
    return (
      <div className="insp" ref={body}>
        <div className="hint">That one is gone already.</div>
        <Peers snap={snap} />
      </div>
    );
  }

  const agent = snap.kind === "agent";
  const shown = snap.log.slice(0, SHOWN);
  const earlier = snap.log.length - shown.length;
  return (
    <div className="insp" ref={body}>
      <div className="insp-head">
        <span className="insp-dot" style={{ background: agent ? hueColor(snap.hue) : snap.accent }} />
        <span className="insp-name" style={{ color: agent ? hueColor(snap.hue) : "var(--text)" }}>{snap.name}</span>
        <span className="insp-tag" style={{ color: snap.accent }}>{snap.stateLabel}</span>
        {snap.background && <span className="insp-tag">background</span>}
        {!snap.live && <span className="insp-tag">history</span>}
        {snap.state !== "approval" && <Terminal snap={snap} />}
      </div>

      {(snap.desc || snap.project) && (
        <div className="insp-sub">{snap.desc || snap.project}</div>
      )}

      {snap.stuck && (
        <div className="insp-worry">
          <b>{{ loop: "Going in circles", stall: "Nothing is happening", long: "Still running", overrun: "Taking much longer than usual" }[snap.stuck.kind] || "Something looks off"}</b>
          <span className="insp-detail">{snap.stuck.text}</span>
        </div>
      )}
      <Doing snap={snap} />

      <div className="insp-stats">
        <span>{snap.tools} tool{snap.tools === 1 ? "" : "s"}</span>
        {snap.spawned > 0 && <span>{snap.spawned} helper{snap.spawned === 1 ? "" : "s"}</span>}
        {snap.background && <span>runs in the background</span>}
      </div>

      <div className="insp-label">Activity</div>
      <div className="insp-log">
        {snap.log.length === 0 && <div className="hint">Nothing yet.</div>}
        {shown.map((e, i) => <Entry key={`${e.t}-${i}`} e={e} />)}
        {earlier > 0 && <div className="insp-earlier">+{earlier} earlier</div>}
      </div>

      <Peers snap={snap} />
    </div>
  );
}

/**
 * Jump to the terminal this session is running in. Pip knows which process
 * Claude Code is, and the main process walks up to whatever window is hosting
 * it. Windows does not always allow a background app to steal focus, so the
 * fallback is making its taskbar button blink.
 */
function Terminal({ snap }) {
  const [said, setSaid] = useState("");
  if (!snap.pid) return null;
  return (
    <button
      className="chip go"
      title="Bring that terminal to the front"
      onClick={async () => {
        const r = await pip.focusSession(snap.pid);
        setSaid(r && r.ok ? (r.how === "flashed" ? "blinking in the taskbar" : "") : (r && r.reason) || "couldn't find it");
        setTimeout(() => setSaid(""), 3000);
      }}
    >
      {said || "Go to terminal"}
    </button>
  );
}

/** The one line that answers "what is it doing right now?". */
function Doing({ snap }) {
  if (snap.doing) {
    return (
      <div className="insp-now live">
        <span className="pulse" />
        <b>{snap.doing.tool || "working"}</b>
        {snap.doing.text && <span className="insp-detail">{snap.doing.text}</span>}
        {snap.alsoRunning > 0 && <span className="insp-more">+{snap.alsoRunning} more running</span>}
      </div>
    );
  }
  if (snap.state === "approval") {
    // The one case where the answer is "go and look": make that the button.
    return (
      <div className="insp-now waiting">
        <span className="insp-detail">Waiting for your approval.</span>
        <Terminal snap={snap} />
      </div>
    );
  }
  const idle = snap.state === "done" || snap.state === "finished"
    ? "Finished — nothing running."
    : snap.state === "thinking" ? "Thinking (no tool running)."
    : snap.state === "error" ? "Stopped after a failure."
    : "Idle — no tool running.";
  return <div className="insp-now"><span className="insp-detail">{idle}</span></div>;
}

function Entry({ e }) {
  const kind = KINDS[e.kind] || { label: e.kind, tone: "" };
  return (
    <div className={`insp-row ${e.failed ? "failed" : ""} ${e.running ? "live" : ""}`}>
      <div className="insp-what">
        {e.kind === "tool"
          ? <><b>{e.tool || "tool"}</b>{e.text && <span className="insp-detail">{e.text}</span>}</>
          : <><span className={`insp-kind ${kind.tone}`}>{kind.label}</span>{e.text && <span className="insp-detail">{e.text}</span>}</>}
        {e.result && <div className="insp-result">{e.result}</div>}
      </div>
      <div className="insp-ms">
        {e.running ? <span className="pulse" /> : e.ms ? duration(e.ms) : ""}
        {e.failed && <span className="bad">failed</span>}
      </div>
    </div>
  );
}

/** Everything else running right now: click to follow it instead. */
function Peers({ snap }) {
  const others = (snap.peers || []).filter((p) => p.key !== snap.key);
  if (!others.length) return null;
  return (
    <div className="insp-peers">
      {others.map((p) => (
        <button
          key={p.key}
          className="chip"
          title={p.label}
          onClick={() => engine.focusInspect({ kind: p.kind, key: p.key })}
        >
          <span className="chip-dot" style={{ background: hueColor(p.hue) }} />
          {p.name}
        </button>
      ))}
    </div>
  );
}
