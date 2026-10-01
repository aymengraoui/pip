import { useEffect, useState } from "react";

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

export default function Settings({ state, demoOn, onDemo, onStopDemo }) {
  const s = state.settings;
  const u = state.update || { status: "idle", current: state.version };
  const [games, setGames] = useState(s.gameMode.extraExes.join(", "));
  const [msg, setMsg] = useState(null);
  const [checking, setChecking] = useState(false);
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
      <Toggle label="Start with Windows" on={state.startup} onChange={(on) => pip.setStartup(on)} />
      <Toggle label="Sounds" on={!s.muted} onChange={(on) => set({ muted: !on })} />
      <Toggle
        label="Record tool results"
        hint="A short result or error line per tool call, so the activity panel can show what happened. Kept in events.jsonl on this machine."
        on={s.recordResults}
        onChange={(on) => set({ recordResults: on })}
      />
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
