# Pip

A tiny companion that lives in a notch at the top of your screen and follows your Claude Code sessions and subagents.

![Pip in its notch, with three subagents out in the playground below it](docs/notch-playground.png)

When more than one helper is working they come out to play under the notch;
hovering opens the notch into a list, and clicking any of them says exactly what
it is doing.

| | |
| --- | --- |
| ![The notch, open, listing the session and its subagents](docs/notch-open.png) | ![The inspector panel on one subagent](docs/inspector.png) |

## Build & run

```
npm install
npm start          # build the UI and run from source
npm run smoke      # headless test of the engine (~30 checks, no window)
npm run dist       # installer → release/Pip-Setup-<version>.exe (electron-builder, NSIS, per-user)
```

If `node_modules/electron/dist` is missing after install, run `node node_modules/electron/install.js`.

Installed to `%LOCALAPPDATA%\Programs\pip\Pip.exe`. Data lives in `%APPDATA%\Pip` (`settings.json`, `hook.js`, `events.jsonl`).

## Using it

- **Hover** the notch for sessions and agents; click it to keep it open.
- **Click a sproutling** (or a row in the open notch) to see exactly what that
  subagent is doing: the tool it is running right now and for how long, its
  recent activity with durations, results and failures, and chips for everything
  else running so you can follow it instead. The panel is sized to its contents,
  so nothing scrolls, and it never takes focus, so your terminal stays active.
  Click the same sproutling again, or the ×, to close it. Also on the tray menu
  as **Activity**.
- **The playground**: with two or more helpers working, they leave the notch and
  amble around the strip of screen underneath it, looking where they are going
  and hopping now and then. Only they take clicks down there — the rest of that
  strip stays click-through — and they file back into the notch the moment you
  open it, or when the last one finishes.
- **Settings** live in the notch: the gear button (or the tray icon, or right-click Pip). Start with Windows, sounds, game mode, extra games, Claude Code hooks, demo, quit.
- **Subagents**: every agent Claude Code spawns pops out of Pip as a colored sproutling and poofs away when it finishes.
- Click Pip to tickle, wiggle the mouse over it to pet, poke it five times for dizzy.

## CPU

- **Game mode**: when a game (exclusive fullscreen, a Steam/Epic/Riot/Xbox/GOG/EA/Ubisoft/Battle.net install, or one of your extra games) or any fullscreen app is in front, Pip hides and stops animation, sound, cursor tracking and event tailing. Only a ~0.5 ms Win32 check runs every 3 s: Task Manager shows 0 %.
- **Otherwise**: adaptive frame rate (60 fps only for physics and interaction, 30 ambient, 24 while Claude works, 12 idle, 6 asleep) and a window resized to what's drawn, since a transparent window costs CPU per pixel per frame.

## Layout

- `electron/`: `main.js` (window, tray, cursor hit-testing, game mode loop), `gamemode.js` (Win32 via koffi), `hooks.js` (Claude Code hooks + event tail), `store.js` (settings).
- `renderer/src/engine/`: the canvas engine, in layers that only import downwards.
  `model.js` is what Claude Code is doing (sessions, agents, activity logs, mood);
  `pip.js`, `minis.js`, `creature.js`, `render.js` and `particles.js` draw it;
  `layout.js` decides the notch's shape and what takes clicks; `inspector.js`
  turns the model into the panel's live snapshot; `index.js` is the frame loop and
  the only thing React talks to.
- `renderer/src/notch/`: the window. `App.jsx` plus two panels, `Settings.jsx` and
  `Inspector.jsx`.
- `resources/hook.js`: the relay Claude Code runs on each hook event. It only appends to `events.jsonl` and never prints, so it can never answer a permission prompt.
- `CLAUDE.md`: the architecture graph, the event pipeline, the state machines and
  the rules worth not breaking.

Debug: `PIP_DEBUG=1` exposes `window.__pip` (engine, panels, `engine.frameStats()`) to DevTools.

## License

MIT, see [LICENSE](LICENSE).
