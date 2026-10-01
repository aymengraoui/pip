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

  koffi.struct("PIP_FLASHWINFO", {
    cbSize: "uint32",
    hwnd: "void *",
    dwFlags: "uint32",
    uCount: "uint32",
    dwTimeout: "uint32",
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
 * Bring the terminal running `pid` to the front.
 * @returns {{ok: boolean, how?: string, title?: string, exe?: string, reason?: string}}
 */
function focusProcess(pid) {
  if (!pid) return { ok: false, reason: "no process recorded for that session" };
  try {
    const target = windowFor(pid);
    if (!target) return { ok: false, reason: "that session's terminal is gone" };
    const how = raise(target.hwnd);
    return { ok: how !== "refused", how, title: target.title, exe: target.exe };
  } catch (err) {
    return { ok: false, reason: err.message };
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

module.exports = { focusProcess, windowFor, alive };

if (require.main === module) {
  const pid = Number(process.argv[2] || process.ppid);
  const t = process.hrtime.bigint();
  const target = windowFor(pid);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`pid ${pid} -> chain ${ancestors(pid).join(" -> ")}`);
  console.log("window:", target, `(${ms.toFixed(1)} ms)`);
  if (process.argv[3] === "--focus" && target) console.log("raise:", raise(target.hwnd));
}
