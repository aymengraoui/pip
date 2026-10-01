# Pip 1.1.0

Pip can now tell you what it is watching, not just that it is watching.

## New

- **Click a helper to see what it is doing.** Click any sproutling, or any row in
  the open notch, and a panel opens inside the notch: the tool that subagent is
  running right now and for how long, its recent activity with durations, results
  and failures, and chips for everything else running so you can follow that
  instead. It is sized to its contents, so nothing scrolls, and it never takes
  focus, so the terminal you are working in stays active. Also on the tray menu
  as **Activity**.
- **A playground.** With two or more helpers working, they leave the notch and
  amble around the strip of screen underneath it, looking where they are going
  and hopping now and then. They file back into the notch the moment you open it.
  Only the helpers take clicks down there: the rest of that strip stays
  click-through, like the rest of Pip.
- **Failures are visible.** The hook relay now records a short line about how each
  tool call went, so a command that failed shows up in Pip without you switching
  to the terminal to find out.

## Fixed

- Activity is stamped with the time the event happened, not the time Pip read it,
  so catching up on the log after a restart no longer reads as "just now".
- Tool calls running in parallel no longer close each other's timers.

## Install

1. Download `Pip-Setup-1.1.0.exe` below and run it. It installs for your user only.
2. The installer isn't code-signed yet, so Windows SmartScreen may warn you: choose **More info → Run anyway**.
3. Open the gear in the notch and click **Install** next to Claude Code hooks (needs Node.js on PATH). New Claude Code sessions will show up in Pip.

Upgrading from 1.0.0: just run the installer. Your hooks keep working, and Pip
refreshes its own hook file every time it starts.

Requires Windows 10 or 11 (x64).
