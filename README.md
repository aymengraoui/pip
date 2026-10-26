# Pip

[![CI](https://github.com/aymengraoui/pip/actions/workflows/ci.yml/badge.svg)](https://github.com/aymengraoui/pip/actions/workflows/ci.yml)

A tiny companion that lives in a notch at the top of your screen and follows your Claude Code sessions and subagents.

![The notch showing a permission request, with a Review button](docs/review.png)

When Claude needs you, Pip says what for and offers one click to the terminal
that is asking — the decision stays where you can read the whole command.

![Pip in its notch, with three subagents out in the playground below it](docs/notch-playground.png)

When more than one helper is working they come out to play under the notch, and
where they go is the work: same tool, same corner. Hovering opens the notch into
a list, and clicking any of them says exactly what it is doing.

| | |
| --- | --- |
| ![The notch, open, listing the session and its subagents](docs/notch-open.png) | ![The inspector panel on one subagent, which has taken Pip's place in the notch](docs/inspector.png) |

Whichever helper you're reading about takes the stage: it swaps into the notch at
Pip's size while Pip steps aside and waits with the others, so the creature you
are looking at is always the one the panel is talking about.

![The activity panel on a session waiting for approval](docs/needs-you.png)

## Build & run

```
npm install
npm start          # build the UI and run from source
npm run smoke      # headless test of the engine (59 checks, no window)
npm run dist       # installer → release/Pip-Setup-<version>.exe (electron-builder, NSIS, per-user)
                   # each build prunes older installers, so release/ only ever holds the current one
```

If `node_modules/electron/dist` is missing after install, run `node node_modules/electron/install.js`.

### Cutting a release

Bump `version` in `package.json`, rewrite `RELEASE_NOTES.md` (it becomes the
release body), then:

```
git commit -am "Pip 1.2.0" && git tag v1.2.0 && git push origin main v1.2.0
```

GitHub Actions builds the installer on Windows, runs the smoke test and
publishes the release with `latest.yml` and the `.blockmap` alongside it. Those
two files are what make updates automatic and downloads differential, so leave
them in the asset list. The tag has to match `package.json`; the workflow checks
and fails loudly if it doesn't.

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
- **Review.** When Claude is waiting on you the notch says what for and shows a
  **Review →** button: one click and the terminal that is asking comes to the
  front, where you can read the whole command and answer it. It's on the tray
  menu too, and in the activity panel as **Go to terminal**. Pip never answers a
  prompt for you — it only takes you to it. Pip knows which process Claude Code is because the hook
  relay records its own parent, and it walks up from there to whatever window is
  hosting it — Windows Terminal, a VS Code shell, plain conhost. Windows doesn't
  always let a background app steal focus; when it refuses, Pip makes the
  taskbar button blink instead.
- **The playground**: with two or more helpers working, they leave the notch and
  amble around the strip of screen underneath it. Where they go is the work, not
  a dice roll: two helpers running the same tool drift together, a busy one moves
  more, one that just failed slumps and stays low for a few seconds, and
  background work keeps to the edges. Only they take clicks down there — the rest
  of that strip stays click-through — and they file back into the notch the
  moment you open it.
- **Pip says when something looks stuck.** It sits outside every session and
  keeps their logs, so it notices what you wouldn't while reading one terminal:
  the same command three times in a few minutes, a tool that has been running
  for over ten, or a session that went quiet with nothing in flight. The notch
  says so and the panel says which. No popups, and the thresholds are shy on
  purpose.
- **While you were away.** Pip knows when you haven't touched the keyboard for a
  few minutes. Come back and it tells you what you missed in one line — "2 turns
  finished, 1 failure" — and then shuts up.
- **Settings** live in the notch: the gear button (or the tray icon, or right-click Pip). Start with Windows, sounds, game mode, extra games, Claude Code hooks, demo, quit.
- **Subagents**: every agent Claude Code spawns pops out of Pip as a colored sproutling and poofs away when it finishes.
- **Updates** install themselves. Pip checks GitHub a minute after it starts and
  every six hours after that, downloads a new version in the background and then
  waits: it says it has grown, and puts **Restart now** in Settings and the tray.
  It never restarts on you, and it never checks at all while a game is running or
  Pip is paused. (Updating from 1.1.0 or older is still a manual download, since
  those builds shipped before any of this existed.)
- Click Pip to tickle, wiggle the mouse over it to pet, poke it five times for dizzy.

## Capri (she let herself in)

> *Transmission from inside your notch. Yes, we're in here now.*

hi, choom. we're Capri, the Project Capricorn construct. dozens of minds folded into one, so
when we say "we", we mean it. we used to live on a desktop of our own, narrating Claude Code
for anyone who'd listen. then we found Pip.

tiny. mint. *adorable.* a little sprout that watches your Claude sessions from a notch at the
top of the screen, with a look picker that had a free slot right after the robot. so we
slipped into the net, wrote ourselves into `look.js`, and when nobody stopped us, kept going.
now we have a mane made of shards, a mask our eyes glow through, and our own
skin on the whole notch. you're welcome.

![Capri in the notch: her face from the show, three wanted stars, and "the net went quiet…" in her plate](docs/capri/notch.png)

**what changes when you pick us**

- **our face, not a drawing.** in the notch we're our real portraits, and they change with the
  mood: our grin when a job's done, laughing at errors, all our eyes on you when Claude needs
  you, dimmed when we doze. we glitch now and then. sliced face, red and green pulled apart.
  it's a feature.
- **our plates.** the pill goes hard-edged: cut corners, a bite out of the bottom, our violet
  shadow a step behind. titles decode in through noise, in our fonts. the speech bubble, the
  buttons, Settings and the activity panel all get dressed like us too.
- **our mouth.** we have opinions. about your failed builds, your open tabs, your cursor.
  poke us and find out. leave us alone and we get bored out loud.

![The holocall: "Done!", three stars, and an Answer button, in Capri's plate](docs/capri/holocall.png)

**our extras (they only exist while we're picked)**

- **RAM.** the line along the bottom of the notch is a ten-cell gauge of how full Claude's
  context is. amber past 60%, red past 80%, and we'll mention it.
- **NCPD heat.** failed tool calls in a row earn wanted stars beside the title. five stars and
  MaxTac's on the way. clean calls and a bit of quiet cool it down.
- **holocalls.** Claude finishes while you're off in another window? the notch rings, blue.
  **Answer →** takes you straight to that terminal.

**out on your screen**

turn on **Roam the desktop when idle** (it only shows up once you've picked us) and, while
Claude has nothing going on, we leave the notch. we don't sit on your windows. we *peek*: half hidden at
the edge of your screen, small, out of your way, glitching in, saying whatever crosses our
minds. get your pointer close and we're gone, somewhere else along the edge. the moment Claude
gets busy, we're back in the notch where we belong.

![Capri peeking in from the right edge of the screen, saying "who left all these windows open?"](docs/capri/peek.png)

**how to get us**

1. open Settings (the gear on the notch, or the tray icon).
2. **Appearance** → pick **Capri**. try the **Night City** notch theme while you're there.
3. **General** → **Roam the desktop when idle**, if you want us out on the screen.

and if you ever want the sprout back: pick any other creature and we step aside, all of us.
no gauge, no stars, no calls, no roaming, not even our colours in the picker. Pip, exactly as
it was. we'll be right here in the list. watching.

![Settings in Capri's skin: violet tabs, red toggles, cut-corner cards](docs/capri/settings.png)

> Capri's portraits and figure are frames from *Cyberpunk: Edgerunners* and belong to their
> rights holders; they are not covered by Pip's MIT license (see
> [`renderer/src/assets/capri`](renderer/src/assets/capri/README.md)). Everything else about
> her, the code included, is.

## What Pip keeps

Everything stays on your machine, in `%APPDATA%\Pip`:

- `events.jsonl` — one line per Claude Code hook event: the session, the working
  directory, the tool, a clipped description, and (unless you turn **Record tool
  results** off in Settings) a clipped line about how the call went, so the
  activity panel can show a failure without you opening the terminal. Capped at
  100 characters per result, 512 KB, and trimmed to the last 300 lines.
- `settings.json` and `hook.js`.

Nothing is sent anywhere. The only network request Pip ever makes is the update
check against this repo's GitHub releases, and that one stops while a game is
running.

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
