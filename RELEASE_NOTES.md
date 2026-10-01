# Pip 1.3.0

Pip could already tell you Claude was waiting on you. Now it can take you there.

## New

- **Go to terminal.** When a session is waiting for your approval, the activity
  panel says what for and puts the button right next to the reason: click it and
  the terminal that session is running in comes to the front. No more working out
  which of six terminals is the one asking.

  Pip knows which process Claude Code is because its hook relay runs as a child
  of it, and it walks up from there to whatever window is hosting it — Windows
  Terminal, a VS Code shell, plain conhost. Windows doesn't always let a
  background app take focus; when it refuses, Pip blinks the terminal's taskbar
  button instead. The button is on every session and helper in the panel, not
  only the ones waiting.

## Note

If you are on 1.2.0, this is the first release that installs itself: Pip will
find it, download it in the background and offer **Restart now** in Settings and
in the tray. Nothing restarts without you asking.

On 1.1.0 or older, grab the installer below once and you are on the automatic
path from then on.

## Install

1. Download `Pip-Setup-1.3.0.exe` below and run it. It installs for your user only.
2. The installer isn't code-signed yet, so Windows SmartScreen may warn you: choose **More info → Run anyway**.
3. Open the gear in the notch and click **Install** next to Claude Code hooks (needs Node.js on PATH). New Claude Code sessions will show up in Pip.

Requires Windows 10 or 11 (x64).
