# Pip — map for future sessions

A Windows Electron app: a notch at the top of the screen with a little mint sprout
(Pip) in it that follows your Claude Code sessions. Every subagent pops out as a
coloured sproutling. Click a sproutling (or a row) to see what it is doing, live.
Everything visual is drawn on one canvas, in code: no images, no UI framework for
the creature. React only draws the two panels.

```
npm start      # vite build + electron .   (run it from source)
npm run smoke  # headless engine test, ~30 checks, no window   <- run this after engine changes
npm run icon   # re-render build/icon.png from the engine
npm run dist   # installer -> release/Pip-Setup-<version>.exe (then prunes older ones)
npm run prune  # keep only the current version's installer in release/
PIP_DEV=1      # load the renderer from the vite dev server (npm run dev first)
PIP_DEBUG=1    # expose window.__pip = { engine, openPanel, closePanel } to DevTools
```

## The graph

Two processes. The main process owns the window and the outside world; the
renderer owns everything you see. Arrows are "depends on / sends to"; nothing
points back up.

```mermaid
flowchart TD
  subgraph CC[Claude Code]
    hooks[["~/.claude/settings.json<br/>12 hook entries"]]
  end
  hooks -->|spawns node, stdin JSON| relay["resources/hook.js<br/>(the relay: appends, never prints)"]
  relay -->|one JSON line| log[("%APPDATA%/Pip/events.jsonl")]

  subgraph MAIN["main process (electron/)"]
    main["main.js<br/>window, tray, cursor polling, run state"]
    hooksjs["hooks.js<br/>install/remove + tail(events.jsonl)"]
    store["store.js<br/>settings.json"]
    game["gamemode.js<br/>Win32 via koffi, every 3s"]
  end
  log --> hooksjs --> main
  store --> main
  game --> main

  subgraph REND["renderer (renderer/src/)"]
    app["notch/App.jsx<br/>panel state machine"]
    idx["engine/index.js<br/>facade + frame loop + fps policy"]
    model["engine/model.js<br/>sessions, agents, history, mood"]
    insp["engine/inspector.js<br/>snapshot for the panel"]
    layout["engine/layout.js<br/>notch shape, hit rects, placement"]
    pip["engine/pip.js"]
    minis["engine/minis.js<br/>sproutlings"]
    render["engine/render.js<br/>pill, header, rows, bubble"]
    creature["engine/creature.js<br/>one creature, any face"]
    leaves["engine/{gfx,clock,util,sound,speech,particles,pointer,bridge}.js"]
    panels["notch/Settings.jsx · notch/Inspector.jsx"]
  end
  main -->|IPC: events, state, pause, cursor, panel, demo| app
  app -->|init / ingest / setPanel / inspectSnapshot| idx
  app --> panels
  panels -->|polls 4x/s| insp
  idx --> model & layout & render & minis & pip & insp
  layout --> pip & minis
  minis --> pip --> creature
  render --> layout
  insp --> model
  layout & pip & minis & render --> leaves
  idx -->|bridge: hit rects, window height, menu| main
```

Import layers inside `renderer/src/engine/` — **imports only ever point down**,
which is what keeps this graph a DAG and the modules testable:

```
 0  util  gfx  clock  bridge  sound  speech  pointer      (no engine imports)
 1  particles  creature  model                            (-> layer 0)
 2  pip                                                   (-> model, creature, …)
 3  minis  inspector                                      (-> pip, model)
 4  layout                                                (-> minis, pip, model, bridge)
 5  render  input                                         (-> layout, …)
 6  index  demo                                           (-> everything)
```

The two deliberate inversions, both so lower layers never reach upwards:

- **`model.setReactions({ onSpawn, onFinish, onMood })`** — the model is data only.
  The fanfare (sound, particles, "go little buddy!") lives in `pip.js`/`minis.js`
  and is wired in `index.js:init`.
- **`bridge.js`** — the engine never imports Electron or React. `host.*` goes to
  the main process, `ui.*` to React.

`gfx.js` exports `ctx` as a **live binding**: modules `import { ctx }` once and
see whatever canvas is attached (`attach` for the notch, `attachSquare` for the
build-time icon). Do not pass `ctx` around, and do not cache it in a local.

## The event pipeline

```
Claude Code event
  -> resources/hook.js            summarises to one compact line: {t,ev,sid,cwd,tool,tuid,detail,msg,ntype,res,aid,atype,bg}
  -> events.jsonl                 appended; trimmed to 300 lines past 512 KB
  -> electron/hooks.js createTail  pump() returns whole lines since the last offset
  -> main.js, every 200 ms        send("events", { events, replay })
  -> engine index.ingest          model.apply(e, replay) per event
  -> model                        sessions / agents / per-item activity log
  -> refreshMood() each frame     mood + lead session  -> everything visual
```

`replay: true` means *catching up quietly* (startup, or coming back from game
mode): same state changes, no sounds, no confetti, events older than 30 min
dropped. Every new code path must honour it.

`res` (the clipped outcome of a tool call) is the one field that can carry a
fragment of your terminal output, so it is the one the user can switch off:
`recordResults` in `settings.json`, which `hook.js` reads from its own directory
on each run. Default on; absent or unreadable settings mean on.

`hook.js` rules, in order of importance: **never print to stdout** (a hook that
prints can answer a permission prompt), never fail, never take long. It is copied
to `%APPDATA%\Pip\hook.js` on every start (`hooks.ensureHookFile`), so changing it
needs no reinstall — but adding a field means old lines lack it: treat every
field as optional when reading.

## State machines

**Session state** (`model.js`), highest priority wins and becomes Pip's mood:

```
approval 6 > error 5 > working 4 > thinking 3 > finished 2 > idle 1 > sleeping 0
```

```
SessionStart        -> idle
UserPromptSubmit    -> thinking
PreToolUse          -> working   (+ spawn a sproutling for Agent/Task)
PostToolUse(Failure)-> thinking
PermissionRequest   -> approval  (also Notification with ntype=permission_prompt)
Stop                -> finished  (-> idle after 45 s)
StopFailure         -> error     (-> idle after 3 min)
SessionEnd          -> dropped   (kept in history for the inspector)
no session + 3 min quiet        -> sleeping
thinking/working stuck 10 min   -> idle
anything untouched for 30 min   -> dropped
```

**Agent lifecycle.** A sproutling is created by the `Agent`/`Task` PreToolUse
(key `tu:<tool_use_id>`), then *adopted* by the following `SubagentStart` so that
later events, which carry only `aid`, find it. Background agents (`bg`) outlive
their tool call; everything else finishes on `PostToolUse`, `SubagentStop` or
`Stop`. `finish()` → 1.4 s of "done ✓" → puff → `retire()` → moved to
`model.history` (last 24), which is why the inspector can still show an agent
that has just vanished from the notch.

## The frame loop

`clock.js` owns scheduling; `index.js` owns the policy. As slow as still looks
right, never faster:

| fps | when |
| --- | --- |
| 60 | a recent `wake()`, jumps/spins/shake, the notch resizing, Pip leaping, the cursor moving, confetti, sproutlings settling |
| 30 | ambient only: particles (sleepy z's excluded), speech bubble, an emote, whistling |
| 24 | Claude is thinking/working/needs you, or any agent exists |
| 12 | idle |
| 6 | napping |
| 0 | paused (game mode): no timers, no rAF, particles and bubble cleared |

Two more CPU rules, both easy to break by accident:

- **The window is resized to what is drawn** (`fitWindow`, 32 px steps, grows at
  once and shrinks after 0.8 s): a transparent window costs CPU per pixel per
  frame. Anything new that draws below the notch must be in that calculation
  (`minis.lowest`, `particles.lowest`).
- **Only the solid parts take clicks** (`layout.publishHitRects` → `setHitRects`).
  Everything else is click-through, so Pip never swallows a click meant for the
  app behind it. The notch is one rect; anything outside it that must stay
  clickable (a leaping Pip, a sproutling in the playground) gets its own small
  rect, snapped to 16 px so a moving target doesn't send IPC every frame. The
  cursor is polled by the *main* process (`cursorTick`), which is why Pip keeps
  looking at you even when the window ignores the mouse.

## Where the sproutlings go

`layout.placeMinis` picks one of four arrangements each frame, and `minis.js`
animates towards it:

| when | where |
| --- | --- |
| it is the one being inspected | **on stage**: Pip's slot, at Pip's size, while Pip steps aside into the parked line (`pip.aside`, a spring from 0 to 1) |
| a panel is open | parked in a line on the panel's bottom edge |
| the notch is open | one per row, standing by its own line |
| 2+ helpers, notch closed | **the playground**: `minis.roam` picks a spot under the notch every 1.4–3.8 s, on looser springs (k 52 vs 110), with the odd hop; they look where they are walking |
| otherwise | in a row inside the pill, beside the text |

`stageSlot()` and `parkSlot(i)` in `layout.js` are the two positions involved,
and both Pip and the featured helper interpolate between them, so the swap is one
idea rather than two. `minis.at()` scales its hit radius with the creature, or the
one on stage would be unclickable at the edges.

The playground latches on at two helpers and only lets go when the last one
finishes (`PLAY_FROM`, and the `playing` flag in `layout.js`), so one of them
ending doesn't yank the rest back inside. While it is on, the pill stops
reserving width for them and the "+n" badge is hidden — they are all on screen.

## Pip never answers a prompt

The relay can, technically: a `PermissionRequest` hook decides by printing JSON,
and `docs/ROADMAP.md` has a worked design for doing it from the notch. It is
deliberately not built. Pip takes you to the decision instead of making it, so
the one irreversible action in the loop stays where the full command is on
screen. If that ever changes it should be a decision somebody makes on purpose,
not a convenience that creeps in — the relay's "never print to stdout" rule is
load-bearing.

## Noticing things

`engine/watchdog.js` reads the activity logs the model already keeps and applies
three shy rules: the same tool and argument three times in four minutes (`loop`),
one call still running past ten minutes (`long`), and silence past six minutes
with nothing in flight and the turn never ended (`stall`), plus `overrun` for an
agent past 3× the median for its type, taken from `model.history`.

Two things that are easy to get wrong here, both learned the hard way:

- **The stall rule cannot read the session state.** `computeMood` ages a quiet
  session to `idle` at ten minutes, which would hide exactly the case worth
  reporting. It reads the log instead.
- **Silence is not the signal; silence with nothing open is.** A tool that is
  genuinely running is a long job, not a stall, and the two need different words
  or the thing cries wolf on every slow build.

`current()` caches the scan for five seconds, so layout can call it per frame.
`index.js` only reacts when the answer changes, which is when Pip frets.

## Away and back

`windows.idleSeconds()` is `GetLastInputInfo` plus `GetTickCount`: two calls,
polled every 15 s from the main process and off entirely in game mode. Past three
minutes you are away, and `model.totals` is snapshotted; on return the difference
becomes one spoken line. One line, once — no badge, no list to dismiss.

## Jumping to the terminal

`resources/hook.js` records `process.ppid`, which is the Claude Code process
itself. `electron/windows.js` turns that into a window: walk the process tree up
from that pid (Toolhelp32, up to 12 hops) and take the closest ancestor that
owns a visible titled top-level window — Claude Code has no window of its own,
the terminal hosting it does.

Raising it is the part Windows is allowed to refuse. Pip's notch is deliberately
not focusable, so it is usually not the foreground app, and `SetForegroundWindow`
from a background process is blocked. `raise()` borrows the foreground thread's
input queue with `AttachThreadInput` for the moment it takes to ask, which works;
if it still fails, it falls back to `FlashWindowEx` so the taskbar button blinks.
Verified from a non-focusable always-on-top window: `how: "focused"`.

The chain breaks if an intermediate process has exited — a pid that is gone is
not in the snapshot, so the walk stops and the user is told the terminal is gone.
That is correct for a closed terminal, and it is also why this looks broken when
you test it from a process launched through a shim that exits (electron.cmd, for
one). Test it from a real session.

`node electron/windows.js [pid]` prints the chain and the window it resolves to;
add `--focus` to actually raise it.

## Clicks

| target | what happens | where |
| --- | --- | --- |
| Pip | tickle; 5 pokes → dizzy; wakes it from a nap | `pip.poke` |
| a sproutling | open the inspector on that subagent, click again to close | `input.js` → `inspector.toggle` → `ui.onInspect` → `App.openPanel("inspect")` |
| a row (notch open) | same, for that session or agent | `layout.rowAt` / `rowTarget` |
| the pill | pin the notch open | `layout.togglePinned` |
| right click | native menu from the main process | `bridge.host.menu` |
| Go to terminal (in the panel) | raise the terminal that session runs in | `windows.focusProcess` |
| Review → (on the notch, while waiting) | the same, one click from anywhere | `layout.review` + `input.js` |
| gear, tray, 2nd instance | Settings | `send("panel", …)` |
| tray → Activity | inspector on the busiest session | `engine.inspectLead` |

The inspector panel **must not take focus** (`pip.setFocus(name === "settings")`):
the whole point is reading it while your terminal stays active. Settings takes
focus only because it has a text field.

## Panels

A panel is React DOM inside the notch, not a second window. `App.jsx` holds
`panel: null | "settings" | "inspect"`, tells the engine its size
(`engine.setPanel`), and the engine grows the notch to match and parks the
sproutlings on the panel's bottom edge. `Inspector.jsx` keeps no state of its
own: it polls `engine.inspectSnapshot()` every 250 ms, so the panel can never go
stale and the engine stays the single source of truth.

**Nothing in the inspector ticks.** There is no poll and no "12s ago": the panel
subscribes with `engine.subscribeInspect()` and re-renders only when a hook
event arrives, the status changes, or the focus moves. A finished call shows how
long it took, because that is a fact that never changes again; a running one
shows a pulsing dot and no number. Adding any elapsed-time text here brings the
render loop back, so don't.

**Nothing in the inspector scrolls.** It measures itself after every paint and
calls `engine.resizePanel(height)`, so the notch grows to the content instead
(clamped to 180–540 px); the log shows the last 8 entries and counts the rest as
"+n earlier". If you add anything to that panel, keep it inside that budget
rather than reaching for `overflow: auto`.

## What is planned next

`docs/ROADMAP.md` holds the plan for 1.4.0: answering permission prompts from
the notch, stuck detection, a data-driven playground, and a "while you were
away" digest. Read it before starting any of them — the first one inverts the
relay's never-print-to-stdout rule on purpose, and the conditions under which
that is safe are written down there, not inferable from the code.

## Releasing, and how updates reach people

A release is a tag. `.github/workflows/release.yml` does the rest on
`windows-latest`: `npm ci`, `npm run smoke`, `npm run release` (which is `dist`
without the icon step, since `build/icon.png` is committed), then `gh release
create` with `RELEASE_NOTES.md` as the body.

Three things that must stay true, or updates silently stop working:

1. **The tag matches `package.json`.** `latest.yml` carries the version out of
   the build, so `v1.2.0` and `"version": "1.2.0"` have to agree. The workflow
   checks this before it builds.
2. **`latest.yml` and the `.blockmap` go up with the installer.** The first is
   the feed electron-updater polls; the second is what makes the download
   differential instead of another 110 MB. `build.publish` in `package.json`
   points at this repo and is what makes electron-builder emit them at all.
3. **Local builds never publish.** Both `dist` and `release` pass
   `--publish never`; only CI, holding `GITHUB_TOKEN`, puts anything on GitHub.

`electron/updater.js` holds the client side. It is inert unless `app.isPackaged`,
checks a minute after start and every six hours, and **skips entirely while
`suspended()`** (a game is running, or Pip is paused) — game mode promises no
network, not just no frames. It downloads in the background, then stops: the
user restarts from Settings or the tray, or it lands on the next quit via
`autoInstallOnAppQuit`. Nothing in that file may throw; no update is always an
acceptable outcome.

`tidyCache()` runs at startup and deletes the staged installer once the version
in `update-info.json` matches the version now running: electron-updater keeps it
otherwise, and that is 107 MB per update for nothing. Anything still pending is
left alone.

Anyone on 1.1.0 or older has no updater in their build at all, so their first
hop to a newer version is a manual download. That is unavoidable and only
happens once.

## When you change something

- **Any push or PR** → CI runs `npm run build:ui` and `npm run smoke` on Linux
  (Electron's binary is skipped: the engine tests need no browser).
- **Engine change** → `npm run smoke`. It stubs the canvas, the clock
  (`performance.now` *and* `Date.now`, so aging and napping are testable) and the
  audio context, then feeds a whole session, clicks a sproutling, opens the
  inspector, pauses, replays, and runs the demo — ~30 checks, no window.
- **Anything visual** → `npm start`, then Settings → **Demo**: a scripted tour of
  every state with three sproutlings (`engine/demo.js`).
- **New hook field** → add it in `resources/hook.js` *and* read it defensively.
- **New mood** → `MOODS` in `model.js` (accent + label + priority), a face in
  `pip.face`, and a reaction in `pip.onMood`.
- `W`/`H` in `engine/gfx.js` must stay in sync with `electron/main.js`.
- Keep `koffi` under `asarUnpack` in `package.json`, or game mode dies in the
  installed build.
