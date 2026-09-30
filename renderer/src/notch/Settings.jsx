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

export default function Settings({ state, onDemo }) {
  const s = state.settings;
  const [games, setGames] = useState(s.gameMode.extraExes.join(", "));
  const [msg, setMsg] = useState(null);
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
      <div className="s-footer">
        <span className="hint">Pip v{state.version}</span>
        <div className="s-actions">
          <button className="btn" onClick={onDemo}>Demo</button>
          <button className="btn" onClick={() => pip.quit()}>Quit Pip</button>
        </div>
      </div>
    </div>
  );
}
