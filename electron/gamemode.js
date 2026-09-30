// Game mode: decides whether a game (or any fullscreen app) owns the screen, so
// Pip can hide and stop every timer, animation and network poll it has.
//
// One cheap check every few seconds, straight to Win32 via koffi (no native
// build step): the shell's own "fullscreen D3D app" flag, the foreground
// window's executable, and whether that window covers its whole monitor.

const path = require("path");

let api = null;
function load() {
  if (api) return api;
  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");
  const shell32 = koffi.load("shell32.dll");
  const kernel32 = koffi.load("kernel32.dll");

  const RECT = koffi.struct("PIP_RECT", { left: "long", top: "long", right: "long", bottom: "long" });
  const MONITORINFO = koffi.struct("PIP_MONITORINFO", {
    cbSize: "uint32", rcMonitor: RECT, rcWork: RECT, dwFlags: "uint32",
  });

  api = {
    GetForegroundWindow: user32.func("void* __stdcall GetForegroundWindow()"),
    GetWindowRect: user32.func("bool __stdcall GetWindowRect(void* hWnd, _Out_ PIP_RECT* rect)"),
    MonitorFromWindow: user32.func("void* __stdcall MonitorFromWindow(void* hWnd, uint32 flags)"),
    GetMonitorInfoW: user32.func("bool __stdcall GetMonitorInfoW(void* hMon, _Inout_ PIP_MONITORINFO* info)"),
    GetClassNameW: user32.func("int __stdcall GetClassNameW(void* hWnd, _Out_ uint8_t* buf, int max)"),
    GetWindowThreadProcessId: user32.func("uint32 __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32* pid)"),
    SHQueryUserNotificationState: shell32.func("long __stdcall SHQueryUserNotificationState(_Out_ int* state)"),
    OpenProcess: kernel32.func("void* __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)"),
    QueryFullProcessImageNameW: kernel32.func("bool __stdcall QueryFullProcessImageNameW(void* h, uint32 flags, _Out_ uint8_t* buf, _Inout_ uint32* size)"),
    CloseHandle: kernel32.func("bool __stdcall CloseHandle(void* h)"),
    koffi,
  };
  return api;
}

// QUERY_USER_NOTIFICATION_STATE
const QUNS_BUSY = 2;                 // a fullscreen app is running
const QUNS_RUNNING_D3D_FULL_SCREEN = 3;
const QUNS_PRESENTATION_MODE = 4;

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const MONITOR_DEFAULTTONEAREST = 2;
const SHELL_CLASSES = new Set(["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"]);

// Folders games install into. Matching here counts even for windowed games.
const GAME_DIRS = [
  "\\steamapps\\common\\", "\\epic games\\", "\\riot games\\", "\\xboxgames\\",
  "\\gog galaxy\\games\\", "\\ea games\\", "\\ubisoft game launcher\\games\\",
  "\\battle.net\\games\\", "\\blizzard\\", "\\rockstar games\\", "\\games\\",
];
// Launchers and stores live in those folders too but are not games.
const NOT_GAMES = new Set([
  "steam.exe", "steamwebhelper.exe", "epicgameslauncher.exe", "riotclientservices.exe",
  "riotclientux.exe", "battle.net.exe", "galaxyclient.exe", "eadesktop.exe", "upc.exe",
  "rockstarlauncher.exe", "explorer.exe",
]);

function className(hwnd) {
  const { GetClassNameW } = load();
  const buf = Buffer.alloc(512);
  const n = GetClassNameW(hwnd, buf, 256);
  return n > 0 ? buf.toString("utf16le", 0, n * 2) : "";
}

function processPath(hwnd) {
  const a = load();
  const pid = [0];
  a.GetWindowThreadProcessId(hwnd, pid);
  if (!pid[0]) return { pid: 0, exe: "" };
  const h = a.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
  if (!h) return { pid: pid[0], exe: "" };
  try {
    const buf = Buffer.alloc(2048);
    const size = [1024];
    if (!a.QueryFullProcessImageNameW(h, 0, buf, size)) return { pid: pid[0], exe: "" };
    return { pid: pid[0], exe: buf.toString("utf16le", 0, size[0] * 2) };
  } finally {
    a.CloseHandle(h);
  }
}

function coversMonitor(hwnd) {
  const a = load();
  const rect = {};
  if (!a.GetWindowRect(hwnd, rect)) return false;
  const mon = a.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
  if (!mon) return false;
  const info = { cbSize: a.koffi.sizeof("PIP_MONITORINFO") };
  if (!a.GetMonitorInfoW(mon, info)) return false;
  const m = info.rcMonitor;
  return rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom;
}

/**
 * @param {object} opts
 * @param {number[]} opts.ownPids   Pip's own processes (never a game)
 * @param {boolean} opts.fullscreen treat any fullscreen app as a game
 * @param {string[]} opts.extraExes extra executable names the user marked as games
 * @returns {{active: boolean, reason: string, exe: string}}
 */
function check({ ownPids = [], fullscreen = true, extraExes = [] } = {}) {
  try {
    const a = load();
    const state = [0];
    a.SHQueryUserNotificationState(state);
    if (state[0] === QUNS_RUNNING_D3D_FULL_SCREEN) return { active: true, reason: "exclusive fullscreen", exe: "" };

    const hwnd = a.GetForegroundWindow();
    if (!hwnd) return { active: false, reason: "", exe: "" };
    if (SHELL_CLASSES.has(className(hwnd))) return { active: false, reason: "", exe: "" };

    const { pid, exe } = processPath(hwnd);
    if (ownPids.includes(pid)) return { active: false, reason: "", exe };
    const low = exe.toLowerCase();
    const base = path.win32.basename(low);

    if (extraExes.some((x) => x && x.toLowerCase().replace(/^.*[\\/]/, "") === base)) {
      return { active: true, reason: "listed game", exe };
    }
    if (!NOT_GAMES.has(base) && GAME_DIRS.some((d) => low.includes(d))) {
      return { active: true, reason: "game folder", exe };
    }
    if (fullscreen && (state[0] === QUNS_BUSY || state[0] === QUNS_PRESENTATION_MODE || coversMonitor(hwnd))) {
      return { active: true, reason: "fullscreen app", exe };
    }
    return { active: false, reason: "", exe };
  } catch (err) {
    return { active: false, reason: "error: " + err.message, exe: "" };
  }
}

module.exports = { check };

if (require.main === module) {
  const t = process.hrtime.bigint();
  const r = check();
  console.log(r, `${Number(process.hrtime.bigint() - t) / 1e6} ms`);
  const t2 = process.hrtime.bigint();
  check();
  console.log(`second check ${Number(process.hrtime.bigint() - t2) / 1e6} ms`);
}
