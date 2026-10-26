import { useEffect, useRef, useState } from "react";
import * as engine from "../engine/index.js";
import { ACCESSORIES, BODIES, KINDS, THEMES, clean as cleanLook, offered } from "../engine/look.js";

const pip = window.pip;
const clean = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

function Toggle({ label, hint, on, onChange }) {
  return (
    <div className="s-row" onClick={() => onChange(!on)}>
      <div className="s-text">
        <div>{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <button className={`toggle ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label}><i /></button>
    </div>
  );
}

/** A labelled card: related settings live together, with air between groups. */
function Section({ title, aside, children }) {
  return (
    <section className="s-sec">
      <div className="s-sec-h"><span>{title}</span>{aside && <span className="s-aside">{aside}</span>}</div>
      <div className="s-card">{children}</div>
    </section>
  );
}

/** One short line about updates, for the footer. */
function updateHint(u) {
  switch (u.status) {
    case "dev": return "updates off from source";
    case "checking": return "checking…";
    case "downloading": return `downloading ${u.version}…`;
    case "ready": return `${u.version} is ready`;
    case "error": return u.error || "couldn't check";
    default: return "up to date";
  }
}

/** Follow the work, or stay on one screen. Only worth showing with more than one. */
function ScreenPicker({ displays, value, onChange }) {
  if (displays.length < 2) return null;
  const pinned = displays.find((d) => d.id === value);
  const hint = value === "follow"
    ? "Moves to the screen you are working on"
    : pinned ? "Stays on this screen" : "That screen is unplugged, so Pip follows you until it's back";
  return (
    <div className="s-row static">
      <div className="s-text">
        <div>Screen</div>
        <div className="hint">{hint}</div>
      </div>
      <select
        className="select"
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "follow" ? "follow" : Number(e.target.value))}
      >
        <option value="follow">Follow my work</option>
        {displays.map((d, i) => (
          <option key={d.id} value={d.id}>{`${i + 1}. ${d.name}${d.primary ? " (main)" : ""}`}</option>
        ))}
        {value !== "follow" && !pinned && <option value={String(value)}>Unplugged screen</option>}
      </select>
    </div>
  );
}

/** A still of Pip in some look, drawn by the engine itself. */
function Preview({ look, size = 32 }) {
  const ref = useRef(null);
  const key = `${look.kind}/${look.body}/${look.accessory}/${look.cheeks}`;
  useEffect(() => { if (ref.current) engine.drawPreview(ref.current, look, size); }, [key, size]);
  return <canvas ref={ref} className="preview" style={{ width: size, height: size }} />;
}

/** A picture with a name under it: how Pip would look with this choice. */
function Tile({ on, name, look, onClick }) {
  return (
    <button className={`tile ${on ? "on" : ""}`} title={name} onClick={onClick}>
      <Preview look={look} />
      <span>{name}</span>
    </button>
  );
}

/** What Pip is, its colour, accessory, cheeks and the notch theme. Pip above is the live preview. */
function Appearance({ look, onChange }) {
  const l = cleanLook(look);
  return (
    <>
      <Section title="Creature">
        <div className="s-pad tiles">
          {Object.entries(KINDS).map(([id, k]) => (
            // Each comes in its usual coat; the swatches below can change it after.
            <Tile key={id} on={l.kind === id} name={k.name} look={{ ...l, kind: id, body: k.body }} onClick={() => onChange({ kind: id, body: k.body })} />
          ))}
        </div>
      </Section>
      <Section
        title={`Colour · ${BODIES[l.body]?.name}`}
        aside={(
          <label className="mini-toggle">
            Rosy cheeks
            <button className={`toggle sm ${l.cheeks ? "on" : ""}`} role="switch" aria-checked={l.cheeks} onClick={() => onChange({ cheeks: !l.cheeks })}><i /></button>
          </label>
        )}
      >
        <div className="s-pad s-choices">
          {offered(BODIES, l.kind).map(([id, b]) => (
            <button
              key={id} title={b.name} aria-label={b.name}
              className={`swatch ${l.body === id ? "on" : ""}`}
              style={{ background: `radial-gradient(circle at 35% 30%, ${b.light}, ${b.mid} 55%, ${b.edge})` }}
              onClick={() => onChange({ body: id })}
            />
          ))}
        </div>
      </Section>
      <Section title="Wearing">
        <div className="s-pad tiles">
          {Object.entries(ACCESSORIES).map(([id, name]) => (
            <Tile key={id} on={l.accessory === id} name={name} look={{ ...l, accessory: id }} onClick={() => onChange({ accessory: id })} />
          ))}
        </div>
      </Section>
      <Section title="Notch" aside={THEMES[l.theme]?.name}>
        <div className="s-pad themes">
          {offered(THEMES, l.kind).map(([id, th]) => (
            <button
              key={id} title={th.name}
              className={`theme ${l.theme === id ? "on" : ""}`}
              style={{ background: th.bg, borderColor: th.hover, color: th.sub }}
              onClick={() => onChange({ theme: id })}
            >
              {th.name}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

export default function Settings({ state, demoOn, onDemo, onStopDemo }) {
  const s = state.settings;
  const u = state.update || { status: "idle", current: state.version };
  const [games, setGames] = useState(s.gameMode.extraExes.join(", "));
  const [msg, setMsg] = useState(null);
  const [checking, setChecking] = useState(false);
  // Everyday settings first; how Pip looks and the Claude Code plumbing are a
  // tab away each, so no tab has to scroll.
  const [tab, setTab] = useState("general");
  const tabs = [["general", "General"], ["appearance", "Appearance"], ["claude", "Claude Code", !state.hooks.installed]];
  useEffect(() => setGames(s.gameMode.extraExes.join(", ")), [s.gameMode.extraExes]);

  const set = (patch) => pip.setSettings(patch);
  const saveGames = () => {
    const extraExes = games.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (extraExes.join(",") !== s.gameMode.extraExes.join(",")) set({ gameMode: { extraExes } });
  };
  const hooks = async (install) => {
    setMsg(null);
    try {
      await pip.writeHooks(install);
      setMsg({ ok: true, text: install ? "Hooks installed. New Claude Code sessions will show up." : "Hooks removed." });
    } catch (err) {
      setMsg({ ok: false, text: clean(err) });
    }
  };
  const checkUpdate = async () => {
    setChecking(true);
    try { await pip.checkUpdate(); } finally { setChecking(false); }
  };

  return (
    <div className="settings">
      <div className="s-tabs" role="tablist">
        {tabs.map(([id, name, warn]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {name}{warn && <i className="tab-dot" title="Needs attention" />}
          </button>
        ))}
      </div>
      {tab === "appearance" && <Appearance look={s.look} onChange={(patch) => set({ look: patch })} />}
      {tab === "general" && (
        <>
          <Section title="Pip">
            <Toggle label="Start with Windows" on={state.startup} onChange={(on) => pip.setStartup(on)} />
            <Toggle label="Sounds" on={!s.muted} onChange={(on) => set({ muted: !on })} />
            {/* Roaming is Capri's: the switch is only there while she is picked. */}
            {cleanLook(s.look).kind === "capri" && (
              <Toggle label="Roam the desktop when idle" on={!!s.roam} onChange={(on) => set({ roam: on })} />
            )}
            <ScreenPicker displays={state.displays || []} value={s.screen} onChange={(screen) => set({ screen })} />
          </Section>
          <Section title="Game mode" aside={state.gaming ? "asleep: a game is running" : null}>
            <Toggle
              label="Sleep while a game is running"
              hint="Hides and uses no CPU"
              on={s.gameMode.enabled}
              onChange={(on) => set({ gameMode: { enabled: on } })}
            />
            {/* The details only matter once it is on. */}
            {s.gameMode.enabled && (
              <>
                <Toggle
                  label="Any fullscreen app too"
                  on={s.gameMode.fullscreen}
                  onChange={(on) => set({ gameMode: { fullscreen: on } })}
                />
                <div className="s-row static">
                  <div className="s-text">More games</div>
                  <input
                    className="input"
                    value={games}
                    placeholder="Riot Client.exe, javaw.exe"
                    onChange={(e) => setGames(e.target.value)}
                    onBlur={saveGames}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </div>
              </>
            )}
          </Section>
        </>
      )}
      {tab === "claude" && (
        <>
          <Section title="Connection">
            <div className="s-row static">
              <div className="s-text">
                <div>Hooks</div>
                <div className={`hint ${state.hooks.installed ? "ok" : "bad"}`}>
                  {state.hooks.installed ? "Installed" : state.hooks.error || "Not installed: Pip can't see your sessions"}
                </div>
                {msg && <div className={`hint ${msg.ok ? "" : "bad"}`}>{msg.text}</div>}
              </div>
              <div className="s-actions">
                <button className="btn" onClick={() => hooks(true)}>{state.hooks.installed ? "Reinstall" : "Install"}</button>
                {state.hooks.installed && <button className="btn" onClick={() => hooks(false)}>Remove</button>}
              </div>
            </div>
          </Section>
          <Section title="Activity panel">
            <Toggle
              label="Record tool results"
              hint="A line per tool call for the activity panel, kept on this PC"
              on={s.recordResults}
              onChange={(on) => set({ recordResults: on })}
            />
          </Section>
        </>
      )}
      <div className="s-footer">
        <span className={`hint ${u.status === "ready" ? "ok" : u.status === "error" ? "bad" : ""}`}>
          Pip v{state.version} · {updateHint(u)}
          {u.status === "ready"
            ? <button className="link" onClick={() => pip.installUpdate()}>Restart</button>
            : u.status !== "dev" && (
              <button className="link" disabled={checking || u.status === "checking"} onClick={checkUpdate}>Check</button>
            )}
        </span>
        <div className="s-actions">
          {demoOn
            ? <button className="btn" onClick={onStopDemo}>Stop demo</button>
            : <button className="btn" onClick={onDemo}>Demo</button>}
          <button className="btn" onClick={() => pip.quit()}>Quit</button>
        </div>
      </div>
    </div>
  );
}
