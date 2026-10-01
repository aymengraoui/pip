# Pip 1.6.1

A follow-up to 1.6.0, which fixed the speech bubble's position but not the thing
you actually notice.

## Fixed

- **The bubble now visibly belongs to whoever is talking.** 1.6.0 moved it to
  hang under the speaker, which changed nothing in the ordinary case: Pip sits at
  the bottom of a compact notch, so "under Pip" and "under the notch" are the same
  place. The tail was the problem — a fixed stub that never reached anything. It
  now stretches to meet the speaker, so a tickle reads as Pip talking rather than
  the notch talking.

Everything from [1.6.0](https://github.com/aymengraoui/pip/releases/tag/v1.6.0)
is included: clicking a stepped-aside Pip brings it back, and the demo is slower
and can be stopped.

## Install

Pip finds this one itself and offers **Restart now**.

Otherwise download `Pip-Setup-1.6.1.exe` below and run it once; it installs for
your user only. The installer isn't code-signed yet, so Windows SmartScreen may
warn you: choose **More info → Run anyway**.

Requires Windows 10 or 11 (x64).
