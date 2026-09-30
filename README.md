# Pip

A tiny companion that lives in a notch at the top of your screen and follows your Claude Code sessions and subagents.

## Build & run

```
npm install
npm start          # build the UI and run from source
npm run dist       # installer → release/Pip-Setup-<version>.exe (electron-builder, NSIS, per-user)
```

If `node_modules/electron/dist` is missing after install, run `node node_modules/electron/install.js`.

Installed to `%LOCALAPPDATA%\Programs\pip\Pip.exe`. Data lives in `%APPDATA%\Pip` (`settings.json`, `hook.js`, `events.jsonl`).

## Using it

- **Hover** the notch for sessions and agents; click it to keep it open.
- **Settings** live in the notch: the gear button (or the tray icon, or right-click Pip). Start with Windows, sounds, game mode, extra games, Claude Code hooks, demo, quit.
- **Subagents**: every agent Claude Code spawns pops out of Pip as a colored sproutling and poofs away when it finishes.
- Click Pip to tickle, wiggle the mouse over it to pet, poke it five times for dizzy.

## CPU

- **Game mode**: when a game (exclusive fullscreen, a Steam/Epic/Riot/Xbox/GOG/EA/Ubisoft/Battle.net install, or one of your extra games) or any fullscreen app is in front, Pip hides and stops animation, sound, cursor tracking and event tailing. Only a ~0.5 ms Win32 check runs every 3 s: Task Manager shows 0 %.
- **Otherwise**: adaptive frame rate (60 fps only for physics and interaction, 30 ambient, 24 while Claude works, 12 idle, 6 asleep) and a window resized to what's drawn, since a transparent window costs CPU per pixel per frame.

## Layout

- `electron/`: `main.js` (window, tray, cursor hit-testing, game mode loop), `gamemode.js` (Win32 via koffi), `hooks.js` (Claude Code hooks + event tail), `store.js` (settings).
- `renderer/`: React + Vite. `src/notch/engine.js` draws Pip on a canvas; `Settings.jsx` is the settings panel.
- `resources/hook.js`: the relay Claude Code runs on each hook event. It only appends to `events.jsonl` and never prints, so it can never answer a permission prompt.

Debug: `PIP_DEBUG=1` exposes `window.__pip` (engine, settings panel, `engine.frameStats()`) to DevTools.

## License

MIT, see [LICENSE](LICENSE).
