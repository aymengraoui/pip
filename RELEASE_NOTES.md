# Pip 1.4.0

Pip starts noticing things.

## New

- **Review.** When Claude is waiting on you, the notch says what for and shows a
  **Review →** button. One click and the terminal that is asking comes to the
  front, where the whole command is on screen. It is on the tray menu too, for
  when the notch is behind something.

  Pip will not answer a permission prompt for you, and that is on purpose. The
  one irreversible step in the loop stays where you can read what you are
  agreeing to.

- **Pip says when something looks stuck.** It watches every session at once, so
  it notices what you would not while reading one terminal: the same command
  three times in a few minutes, a tool that has been running for over ten, a
  session gone quiet with nothing in flight, or a helper taking far longer than
  that kind of helper usually does. The notch says so, the panel says which, and
  nothing pops up. The thresholds are shy on purpose — a companion that cries
  wolf gets muted.

- **While you were away.** Pip knows when nobody has touched the keyboard for a
  few minutes. Come back and it tells you what you missed in one line — *"2 turns
  finished, 1 failure"* — and then shuts up about it.

## Changed

- **The playground means something now.** Where the sproutlings wander comes from
  the work rather than a dice roll: two helpers running the same tool drift
  together, a busy one moves more, one that just failed slumps and stays low for
  a few seconds, and background work keeps to the edges. Same CPU, and after a
  day of it you start reading the shape of a session at a glance.

## Install

On 1.2.0 or 1.3.0, Pip will find this one itself and offer **Restart now**.

Otherwise download `Pip-Setup-1.4.0.exe` below and run it once; it installs for
your user only. The installer isn't code-signed yet, so Windows SmartScreen may
warn you: choose **More info → Run anyway**.

Requires Windows 10 or 11 (x64).
