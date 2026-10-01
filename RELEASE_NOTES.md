# Pip 1.2.0

Pip updates itself now, and the activity panel stopped watching the clock.

## New

- **Updates install themselves.** Pip checks this repo's releases a minute after
  it starts and every six hours after that, downloads a new version in the
  background, and then waits: it says it has grown and offers **Restart now** in
  Settings and in the tray. It never restarts on you, and it never checks at all
  while a game is running or Pip is paused — game mode means no network either.
- **Record tool results**, a new switch in Settings. Pip's hook relay writes a
  clipped line about how each tool call went, which is what lets the activity
  panel show you a failure without you opening the terminal. It lives in
  `events.jsonl` on your machine and goes nowhere else, and now you can turn it
  off. The README says exactly what is kept.

## Changed

- **The activity panel no longer counts seconds.** "14s ago" on every row meant
  re-rendering the whole panel four times a second to tell you something the task
  and its status already said. Now a finished tool call shows how long it took —
  a fact that never changes — a running one shows a pulsing dot, and the panel
  only redraws when something actually happens. The session list in the notch
  lost its ticking column too, and gave the space to what the tool is doing.

## Under the hood

Releases are built by GitHub Actions on a tag now, rather than on a laptop, and
every push runs the engine's 43 smoke checks.

## Install

1. Download `Pip-Setup-1.2.0.exe` below and run it. It installs for your user only.
2. The installer isn't code-signed yet, so Windows SmartScreen may warn you: choose **More info → Run anyway**.
3. Open the gear in the notch and click **Install** next to Claude Code hooks (needs Node.js on PATH). New Claude Code sessions will show up in Pip.

Coming from 1.1.0 or earlier? This one is a manual download — those builds shipped
before the updater existed. It is the last time you'll have to do that.

Requires Windows 10 or 11 (x64).
