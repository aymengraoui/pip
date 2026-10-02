# Pip 1.7.0

Pip has never had to draw a world where subagents live for minutes, because
until now they didn't. Every assumption built around "agents vanish instantly"
is fixed in this one.

## Fixed

- **Subagents are visible while they work.** Every `Agent`/`Task` launch is
  async: the tool call returns in under a second while the subagent works on for
  minutes. Pip read the launch returning as the agent finishing, so a sproutling
  appeared and puffed away almost at once and the inspector never had anything
  live to show. On the same job, measured before and after: a sproutling that
  lasted 0.4 seconds now lasts 38.6, with its tool line changing as it goes.

- **A stop meant for somebody else no longer retires your agent.** Claude Code
  emits a `SubagentStop` for each background turn, naming an agent this session
  never saw start. Pip's fallback finished whichever sproutling happened to be
  alive, so even a long-lived one could be reaped by a stranger.

- **Go to terminal works again.** The relay recorded its own parent's pid and
  called it Claude Code. It isn't: each hook runs through a shim that exits
  immediately, so the recorded pid was already dead by the time you clicked, the
  walk up the process tree found nothing, and Pip told you the terminal was gone.
  It records Claude Code's real pid now.

- **The speech bubble belongs to Pip again.** Pip sits inside the notch, so nine
  pixels under its chin landed exactly on the frame's bottom edge and the bubble
  always read as the notch talking. It now tucks up under the chin and overlaps
  the frame. A label for a sproutling you are hovering keeps its old spacing,
  because that one is out in the open where the gap was right.

- **Rows no longer tag every agent "· background"**, and the inspector no longer
  calls every agent a background job. Both were keyed on a flag that was
  previously never set and is now always set: once every agent is a background
  agent, saying so distinguishes nothing.

## New

- **The notch lives on the screen you are working on.** It follows the
  foreground window instead of whichever display Windows calls primary — that is
  a setting somebody picked once, not a fact about where you are looking. It only
  moves when the display actually changes, it ignores Pip's own windows so
  opening Settings doesn't pin it, and it stops entirely in game mode.

- **Go to terminal brings the terminal to that screen.** Being raised on a
  monitor you aren't looking at is the same as not being raised. A terminal
  already on that display is left exactly where you put it.

## Under the hood

The smoke suite now covers the agent lifecycle: a background agent outliving its
own tool call, a stop for an unknown agent leaving it alone, the parent turn
ending without ending it, and its own stop doing so.

## Install

Pip finds this one itself and offers **Restart now**.

Otherwise download `Pip-Setup-1.7.0.exe` below and run it once; it installs for
your user only. The installer isn't code-signed yet, so Windows SmartScreen may
warn you: choose **More info → Run anyway**.

Requires Windows 10 or 11 (x64).
