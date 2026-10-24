import { useEffect, useState } from "react";
import { ACCESSORIES, BODIES, DEFAULT_LOOK, THEMES } from "../engine/look.js";

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

/** One line about where the next version is. */
function updateHint(u) {
  switch (u.status) {
    case "dev": return "Running from source, so updates are off";
    case "checking": return "Checking…";
    case "downloading": return `Downloading Pip ${u.version}…`;
    case "ready": return `Pip ${u.version} is ready — restart to finish`;
    case "error": return u.error || "Couldn't check just now";
    default: return `Pip ${u.current} is the latest`;
  }
}

/** Follow the work, or stay on one screen. Only worth showing with more than one. */
function ScreenPicker({ displays, value, onChange }) {
  if (displays.length < 2) return null;
  const pinned = displays.find((d) => d.id === value);
  const hint = value === "follow"
    ? "Pip moves to the screen you are working on"
    : pinned ? `Pip stays on ${pinned.name}` : "That screen is unplugged, so Pip follows you until it's back";
  return (
    <div className="s-field">
      <div>Screen</div>
      <div className="hint">{hint}</div>
      <div className="s-choices">
        <button className={`btn ${value === "follow" ? "on" : ""}`} onClick={() => onChange("follow")}>Follow my work</button>
        {displays.map((d) => (
          <button key={d.id} className={`btn ${value === d.id ? "on" : ""}`} title={d.size} onClick={() => onChange(d.id)}>
            {d.name}{d.primary ? " (main)" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Pip's colour, accessory, cheeks and the notch theme. Pip above is the preview. */
function Appearance({ look, onChange }) {
  const l = { ...DEFAULT_LOOK, ...look };
  return (
    <>
      <div className="s-field">
        <div>Pip's colour <span className="hint">· {BODIES[l.body]?.name}</span></div>
        <div className="s-choices">
          {Object.entries(BODIES).map(([id, b]) => (
            <button
              key={id} title={b.name} aria-label={b.name}
              className={`swatch ${l.body === id ? "on" : ""}`}
              style={{ background: `radial-gradient(circle at 35% 30%, ${b.light}, ${b.mid} 55%, ${b.edge})` }}
              onClick={() => onChange({ body: id })}
            />
          ))}
        </div>
      </div>
      <div className="s-field">
        <div>Wearing</div>
        <div className="s-choices">
          {Object.entries(ACCESSORIES).map(([id, name]) => (
            <button key={id} className={`btn ${l.accessory === id ? "on" : ""}`} onClick={() => onChange({ accessory: id })}>{name}</button>
          ))}
        </div>
      </div>
      <Toggle label="Rosy cheeks" hint="Always a little blush" on={l.cheeks} onChange={(on) => onChange({ cheeks: on })} />
      <div className="s-field">
        <div>Notch theme <span className="hint">· {THEMES[l.theme]?.name}</span></div>
        <div className="s-choices">
          {Object.entries(THEMES).map(([id, th]) => (
            <button
              key={id} title={th.name} aria-label={th.name}
              className={`swatch ${l.theme === id ? "on" : ""}`}
              style={{ background: `linear-gradient(135deg, ${th.bg} 50%, ${th.hover} 50%)` }}
              onClick={() => onChange({ theme: id })}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export default function Settings({ state, demoOn, onDemo, onStopDemo }) {
  const s = state.settings;
  const u = state.update || { status: "idle", current: state.version };
  const [games, setGames] = useState(s.gameMode.extraExes.join(", "));
  const [msg, setMsg] = useState(null);
  const [checking, setChecking] = useState(false);
  // Everyday settings first; how Pip looks is one tab away so it doesn't crowd them.
  const [tab, setTab] = useState("general");
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

  return (
    <div className="settings">
      <div className="s-tabs" role="tablist">
        {[["general", "General"], ["appearance", "Appearance"]].map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{name}</button>
        ))}
      </div>
      {tab === "appearance" ? <Appearance look={s.look} onChange={(patch) => set({ look: patch })} /> : (
        <>
          <Toggle label="Start with Windows" on={state.startup} onChange={(on) => pip.setStartup(on)} />
          <Toggle label="Sounds" on={!s.muted} onChange={(on) => set({ muted: !on })} />
          <Toggle
            label="Record tool results"
            hint="A short result or error line per tool call, so the activity panel can show what happened. Kept in events.jsonl on this machine."
            on={s.recordResults}
            onChange={(on) => set({ recordResults: on })}
          />
          <ScreenPicker displays={state.displays || []} value={s.screen} onChange={(screen) => set({ screen })} />
          <Toggle
            label="Game mode"
            hint={state.gaming ? "A game is running: Pip is asleep" : "Hide and use no CPU while a game is running"}
            on={s.gameMode.enabled}
            onChange={(on) => set({ gameMode: { enabled: on } })}
          />
          <Toggle
            label="Also for any fullscreen app"
            hint="Borderless games, videos, presentations"
            on={s.gameMode.fullscreen}
            onChange={(on) => set({ gameMode: { fullscreen: on } })}
          />
          <div className="s-field">
            <div>More games</div>
            <input
              value={games}
              placeholder="e.g. Riot Client.exe, javaw.exe"
              onChange={(e) => setGames(e.target.value)}
              onBlur={saveGames}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </div>
          <div className="s-row static">
            <div className="s-text">
              <div>Claude Code hooks</div>
              <div className={`hint ${state.hooks.installed ? "ok" : "bad"}`}>
                {state.hooks.installed ? "Installed" : state.hooks.error || "Not installed: Pip can't see your sessions"}
              </div>
            </div>
            <div className="s-actions">
              <button className="btn" onClick={() => hooks(true)}>{state.hooks.installed ? "Reinstall" : "Install"}</button>
              {state.hooks.installed && <button className="btn" onClick={() => hooks(false)}>Remove</button>}
            </div>
          </div>
          {msg && <div className={`hint ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}
          <div className="s-row static">
            <div className="s-text">
              <div>Updates</div>
              <div className={`hint ${u.status === "ready" ? "ok" : u.status === "error" ? "bad" : ""}`}>{updateHint(u)}</div>
            </div>
            <div className="s-actions">
              {u.status === "ready"
                ? <button className="btn" onClick={() => pip.installUpdate()}>Restart now</button>
                : <button className="btn" disabled={checking || u.status === "dev"} onClick={async () => {
                    setChecking(true);
                    try { await pip.checkUpdate(); } finally { setChecking(false); }
                  }}>{checking || u.status === "checking" ? "Checking…" : "Check now"}</button>}
            </div>
          </div>
        </>
      )}
      <div className="s-footer">
        <span className="hint">Pip v{state.version}</span>
        <div className="s-actions">
          {demoOn
            ? <button className="btn" onClick={onStopDemo}>Stop demo</button>
            : <button className="btn" onClick={onDemo}>Demo</button>}
          <button className="btn" onClick={() => pip.quit()}>Quit Pip</button>
        </div>
      </div>
    </div>
  );
}
