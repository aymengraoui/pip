# Pip 1.6.0

Fixes for the things 1.5.0's stage swap left behind, and a demo you can actually
watch.

## Fixed

- **Clicking Pip while it has stepped aside brings it back.** It used to tickle,
  which is charming and useless: Pip had just moved over for a helper you are
  reading about, so clicking it obviously means "back to you". It now shows that
  session and retakes the stage.
- **The speech bubble follows whoever is speaking.** It was pinned to the bottom
  edge of the notch, which was fine when Pip never moved. Pip moves now — aside
  for a helper, out of the notch when something finishes — so the bubble hangs
  under the one doing the talking, with its tail pointing at them.

## Changed

- **The demo runs at a pace you can watch**, roughly twice as slow as before, and
  it shows a failure and parallel tool calls on its way through.
- **The demo can be stopped** — from Settings, the tray, or by right-clicking Pip.
  Stopping ends its session properly rather than leaving a ghost one in the notch
  with helpers that never finish.

## Install

Pip finds this one itself and offers **Restart now**.

Otherwise download `Pip-Setup-1.6.0.exe` below and run it once; it installs for
your user only. The installer isn't code-signed yet, so Windows SmartScreen may
warn you: choose **More info → Run anyway**.

Requires Windows 10 or 11 (x64).
