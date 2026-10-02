// Finding, and raising, the terminal a Claude Code session is running in.
//
// The hook relay records its own parent's pid, which is the Claude Code process.
// That process has no window of its own: the window belongs to whatever is
// hosting it (Windows Terminal, the VS Code shell, conhost). So we walk up the
// process tree from that pid and look for an ancestor that owns a visible
// top-level window.
//
// Win32 through koffi, like gamemode.js, so there is still no native build step.
//
// Self-test:  node electron/windows.js [pid]

const TH32CS_SNAPPROCESS = 0x2;
const SW_RESTORE = 9;
const SW_MAXIMIZE = 3;
const SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
const MAX_HOPS = 12;              // a process tree deeper than this is not ours
const FLASHW_ALL = 3, FLASHW_TIMERNOFG = 12;

let api = null;

function load() {
  if (api) return api;
  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");

  const PROCESSENTRY32W = koffi.struct("PIP_PE32", {
    dwSize: "uint32",
    cntUsage: "uint32",
    th32ProcessID: "uint32",
    th32DefaultHeapID: "uintptr",
    th32ModuleID: "uint32",
    cntThreads: "uint32",
    th32ParentProcessID: "uint32",
    pcPriClassBase: "long",
    dwFlags: "uint32",
    szExeFile: koffi.array("uint16", 260),
  });

  koffi.struct("PIP_LASTINPUT", {
    cbSize: "uint32",
    dwTime: "uint32",
  });

  koffi.struct("PIP_FLASHWINFO", {
    cbSize: "uint32",
    hwnd: "void *",
    dwFlags: "uint32",
    uCount: "uint32",
    dwTimeout: "uint32",
  });

  koffi.struct("PIP_RECT", {
    left: "int32",
    top: "int32",
    right: "int32",
    bottom: "int32",
  });

  const EnumWindowsProc = koffi.proto("bool __stdcall PipEnumProc(void *hwnd, intptr_t lparam)");

  api = {
    koffi,
    EnumWindowsProc,
    CreateToolhelp32Snapshot: kernel32.func("void * __stdcall CreateToolhelp32Snapshot(uint32 flags, uint32 pid)"),
    Process32FirstW: kernel32.func("bool __stdcall Process32FirstW(void *snap, _Inout_ PIP_PE32 *entry)"),
    Process32NextW: kernel32.func("bool __stdcall Process32NextW(void *snap, _Inout_ PIP_PE32 *entry)"),
    CloseHandle: kernel32.func("bool __stdcall CloseHandle(void *h)"),
    GetCurrentThreadId: kernel32.func("uint32 __stdcall GetCurrentThreadId()"),

    EnumWindows: user32.func("bool __stdcall EnumWindows(void *proc, intptr_t lparam)"),
    IsWindowVisible: user32.func("bool __stdcall IsWindowVisible(void *hwnd)"),
    IsIconic: user32.func("bool __stdcall IsIconic(void *hwnd)"),
    GetWindowTextW: user32.func("int __stdcall GetWindowTextW(void *hwnd, _Out_ uint8_t *buf, int max)"),
    GetWindowTextLengthW: user32.func("int __stdcall GetWindowTextLengthW(void *hwnd)"),
    GetWindowThreadProcessId: user32.func("uint32 __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)"),
    GetForegroundWindow: user32.func("void * __stdcall GetForegroundWindow()"),
    SetForegroundWindow: user32.func("bool __stdcall SetForegroundWindow(void *hwnd)"),
    ShowWindow: user32.func("bool __stdcall ShowWindow(void *hwnd, int cmd)"),
    BringWindowToTop: user32.func("bool __stdcall BringWindowToTop(void *hwnd)"),
    AttachThreadInput: user32.func("bool __stdcall AttachThreadInput(uint32 from, uint32 to, bool attach)"),
    FlashWindowEx: user32.func("bool __stdcall FlashWindowEx(PIP_FLASHWINFO *info)"),
    GetAncestor: user32.func("void * __stdcall GetAncestor(void *hwnd, uint32 flags)"),
    GetWindowRect: user32.func("bool __stdcall GetWindowRect(void *hwnd, _Inout_ PIP_RECT *rect)"),
    SetWindowPos: user32.func("bool __stdcall SetWindowPos(void *hwnd, void *after, int x, int y, int cx, int cy, uint32 flags)"),
    IsZoomed: user32.func("bool __stdcall IsZoomed(void *hwnd)"),
    GetLastInputInfo: user32.func("bool __stdcall GetLastInputInfo(_Inout_ PIP_LASTINPUT *info)"),
    GetTickCount: kernel32.func("uint32 __stdcall GetTickCount()"),
  };
  return api;
}

/** pid -> parent pid, for every process we are allowed to see. */
function parentMap() {
  const a = load();
  const snap = a.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (!snap || a.koffi.address(snap) === -1n) return new Map();
  const parents = new Map();
  const names = new Map();
  try {
    const entry = { dwSize: a.koffi.sizeof("PIP_PE32") };
    let more = a.Process32FirstW(snap, entry);
    while (more) {
      parents.set(entry.th32ProcessID, entry.th32ParentProcessID);
      names.set(entry.th32ProcessID, exeName(entry.szExeFile));
      more = a.Process32NextW(snap, entry);
    }
  } finally {
    a.CloseHandle(snap);
  }
  parentMap.names = names;
  return parents;
}

function exeName(chars) {
  let out = "";
  for (const c of chars) {
    if (!c) break;
    out += String.fromCharCode(c);
  }
  return out;
}

/** The pid itself, then its parent, grandparent and so on. */
function ancestors(pid) {
  const parents = parentMap();
  const chain = [];
  let current = Number(pid);
  for (let i = 0; i < MAX_HOPS && current > 0; i++) {
    chain.push(current);
    const next = parents.get(current);
    if (!next || next === current || chain.includes(next)) break;
    current = next;
  }
  return chain;
}

/** Every visible top-level window with a title, as { hwnd, pid, title }. */
function windows() {
  const a = load();
  const found = [];
  const cb = a.koffi.register((hwnd) => {
    try {
      if (!a.IsWindowVisible(hwnd)) return true;
      const len = a.GetWindowTextLengthW(hwnd);
      if (len <= 0) return true;
      const buf = Buffer.alloc((len + 1) * 2);
      const n = a.GetWindowTextW(hwnd, buf, len + 1);
      const pid = [0];
      a.GetWindowThreadProcessId(hwnd, pid);
      if (pid[0]) found.push({ hwnd, pid: pid[0], title: buf.toString("utf16le", 0, n * 2) });
    } catch {}
    return true; // keep enumerating whatever happens
  }, a.koffi.pointer(a.EnumWindowsProc));
  try {
    a.EnumWindows(cb, 0);
  } finally {
    a.koffi.unregister(cb);
  }
  return found;
}

/**
 * The window hosting `pid`: the closest ancestor that owns one. Returns
 * { hwnd, pid, title, exe, hops } or null.
 */
function windowFor(pid) {
  const chain = ancestors(pid);
  if (!chain.length) return null;
  const byPid = new Map();
  for (const w of windows()) if (!byPid.has(w.pid)) byPid.set(w.pid, w);
  for (let i = 0; i < chain.length; i++) {
    const hit = byPid.get(chain[i]);
    if (hit) {
      const names = parentMap.names || new Map();
      return { ...hit, exe: names.get(chain[i]) || "", hops: i };
    }
  }
  return null;
}

/** Raise a window, with the usual Windows foreground-lock dance. */
function raise(hwnd) {
  const a = load();
  if (a.IsIconic(hwnd)) a.ShowWindow(hwnd, SW_RESTORE);

  // Windows only lets the foreground process hand focus away. Pip's notch is
  // deliberately not focusable, so borrow the current foreground thread's input
  // queue for the moment it takes to ask.
  const fg = a.GetForegroundWindow();
  const fgThread = fg ? a.GetWindowThreadProcessId(fg, [0]) : 0;
  const ours = a.GetCurrentThreadId();
  let attached = false;
  if (fgThread && fgThread !== ours) attached = a.AttachThreadInput(ours, fgThread, true);
  try {
    a.BringWindowToTop(hwnd);
    if (a.SetForegroundWindow(hwnd)) return "focused";
  } finally {
    if (attached) a.AttachThreadInput(ours, fgThread, false);
  }

  // Refused: blink in the taskbar instead, which is at least a signpost.
  try {
    a.FlashWindowEx({ cbSize: 20, hwnd, dwFlags: FLASHW_ALL | FLASHW_TIMERNOFG, uCount: 3, dwTimeout: 0 });
    return "flashed";
  } catch {
    return "refused";
  }
}

/**
 * Whoever is in the foreground right now, as { hwnd, pid, x, y, w, h, cx, cy }.
 * This is how Pip knows which screen you are actually working on: Windows'
 * "primary" display is a setting, not a fact about where you are looking.
 *
 * `skipPids` keeps Pip's own windows out of the answer — the notch is not
 * focusable, but the Settings panel is, and Pip following itself would pin the
 * notch wherever it already was. Returns null when there is nothing to point at
 * (nothing focused, minimised, or an empty rect), and the caller falls back.
 */
function activeWindow(skipPids = []) {
  try {
    const a = load();
    const hwnd = a.GetForegroundWindow();
    if (!hwnd || !a.IsWindowVisible(hwnd) || a.IsIconic(hwnd)) return null;
    const out = [0];
    a.GetWindowThreadProcessId(hwnd, out);
    const pid = Number(out[0]) || 0;
    if (!pid || skipPids.includes(pid)) return null;
    const r = { left: 0, top: 0, right: 0, bottom: 0 };
    if (!a.GetWindowRect(hwnd, r)) return null;
    const w = r.right - r.left, h = r.bottom - r.top;
    if (w <= 0 || h <= 0) return null;
    return { hwnd, pid, x: r.left, y: r.top, w, h,
      cx: r.left + Math.round(w / 2), cy: r.top + Math.round(h / 2) };
  } catch {
    return null;
  }
}

/**
 * Move a window onto `area` (a display's work area), keeping its size where it
 * fits and centring it there. A window already on that screen is left exactly
 * where the user put it.
 *
 * A maximized window is restored first and maximized again afterwards:
 * SetWindowPos on a maximized window moves its *restored* bounds and leaves it
 * filling the old screen.
 */
function moveToArea(hwnd, area) {
  const a = load();
  const r = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!a.GetWindowRect(hwnd, r)) return false;
  const cx = r.left + (r.right - r.left) / 2, cy = r.top + (r.bottom - r.top) / 2;
  const inside = cx >= area.x && cx < area.x + area.width &&
                 cy >= area.y && cy < area.y + area.height;
  if (inside) return false;

  const w = Math.min(r.right - r.left, area.width);
  const h = Math.min(r.bottom - r.top, area.height);
  if (w <= 0 || h <= 0) return false;
  const zoomed = a.IsZoomed(hwnd);
  if (zoomed) a.ShowWindow(hwnd, SW_RESTORE);
  a.SetWindowPos(hwnd, null,
    Math.round(area.x + (area.width - w) / 2),
    Math.round(area.y + (area.height - h) / 2),
    w, h, SWP_NOZORDER | SWP_NOACTIVATE);
  if (zoomed) a.ShowWindow(hwnd, SW_MAXIMIZE);
  return true;
}

/**
 * Bring the terminal running `pid` to the front. Given `area`, the display
 * Pip is living on, the terminal is carried over to that screen first — being
 * raised on a monitor you are not looking at is the same as not being raised.
 * @returns {{ok: boolean, how?: string, title?: string, exe?: string, moved?: boolean, reason?: string}}
 */
function focusProcess(pid, area = null) {
  if (!pid) return { ok: false, reason: "no process recorded for that session" };
  try {
    const target = windowFor(pid);
    if (!target) return { ok: false, reason: "that session's terminal is gone" };
    let moved = false;
    if (area) { try { moved = moveToArea(target.hwnd, area); } catch { moved = false; } }
    const how = raise(target.hwnd);
    return { ok: how !== "refused", how, moved, title: target.title, exe: target.exe };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Seconds since the last keypress or mouse move, anywhere on the machine.
 * Two cheap calls; this is how Pip knows you aren't there. Returns 0 if the
 * lookup fails, which reads as "present" and keeps Pip quiet.
 */
function idleSeconds() {
  try {
    const a = load();
    const info = { cbSize: 8, dwTime: 0 };
    if (!a.GetLastInputInfo(info)) return 0;
    // GetTickCount wraps every 49 days; a negative difference means it just has.
    const ms = a.GetTickCount() - info.dwTime;
    return ms > 0 ? Math.floor(ms / 1000) : 0;
  } catch {
    return 0;
  }
}

/** Is that process still around? Used to grey out the button. */
function alive(pid) {
  if (!pid) return false;
  try {
    return ancestors(pid).length > 0 && parentMap().has(Number(pid));
  } catch {
    return false;
  }
}

module.exports = { focusProcess, windowFor, activeWindow, alive, idleSeconds };

if (require.main === module) {
  const pid = Number(process.argv[2] || process.ppid);
  const t = process.hrtime.bigint();
  const target = windowFor(pid);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`pid ${pid} -> chain ${ancestors(pid).join(" -> ")}`);
  console.log("window:", target, `(${ms.toFixed(1)} ms)`);
  console.log("idle:", idleSeconds(), "s");
  console.log("foreground:", activeWindow());
  if (process.argv[3] === "--focus" && target) console.log("raise:", raise(target.hwnd));
}
