/**
 * Windows backend: real window management through user32/kernel32/dwmapi.
 *
 * We reach the Win32 API with koffi (prebuilt FFI, so no node-gyp toolchain on
 * the user's machine). Nothing here is Electron-specific — monitor geometry
 * comes from EnumDisplayMonitors rather than Electron's `screen`, so we work in
 * true physical pixels and never have to guess at DPI scaling on mixed-DPI
 * setups.
 */
import type { DisplayInfo, Rect, WindowInfo } from '../../core/types';
import type { DesktopBackend, SetBoundsOptions } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Koffi = any;

// SetWindowPos flags
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_ASYNCWINDOWPOS = 0x4000;

// ShowWindow commands
const SW_RESTORE = 9;
const SW_MINIMIZE = 6;

// GetWindowLongPtr indices
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;

const WS_VISIBLE = 0x10000000;
const WS_CHILD = 0x40000000;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;

const GW_OWNER = 4;

const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

const MONITORINFOF_PRIMARY = 1;

interface Win32Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function toRect(r: Win32Rect): Rect {
  return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
}

function decodeWide(buffer: Uint16Array, length?: number): string {
  const end = length ?? buffer.indexOf(0);
  const stop = end < 0 ? buffer.length : end;
  let out = '';
  for (let i = 0; i < stop; i += 1) {
    const code = buffer[i];
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

export class Win32Backend implements DesktopBackend {
  readonly id = 'win32';
  available = false;
  reason?: string;

  private koffi!: Koffi;
  private fn: Record<string, any> = {};
  private processNameCache = new Map<number, string>();

  constructor() {
    if (process.platform !== 'win32') {
      this.reason = `Windows-only backend; this machine reports "${process.platform}".`;
      return;
    }
    try {
      this.load();
      this.available = true;
    } catch (error) {
      this.reason = `Could not load the Win32 bindings: ${(error as Error).message}`;
    }
  }

  private load(): void {
    // Required lazily so a non-Windows dev machine never touches the module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi: Koffi = require('koffi');
    this.koffi = koffi;

    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const dwmapi = koffi.load('dwmapi.dll');

    koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    koffi.struct('MONITORINFOEXW', {
      cbSize: 'uint32',
      rcMonitor: 'RECT',
      rcWork: 'RECT',
      dwFlags: 'uint32',
      szDevice: koffi.array('uint16_t', 32),
    });

    koffi.proto('bool __stdcall EnumWindowsProc(intptr_t hwnd, intptr_t lparam)');
    koffi.proto('bool __stdcall MonitorEnumProc(intptr_t hmon, intptr_t hdc, RECT *rect, intptr_t lparam)');

    this.fn = {
      EnumWindows: user32.func('bool __stdcall EnumWindows(EnumWindowsProc *proc, intptr_t lparam)'),
      EnumDisplayMonitors: user32.func(
        'bool __stdcall EnumDisplayMonitors(intptr_t hdc, intptr_t clip, MonitorEnumProc *proc, intptr_t lparam)',
      ),
      GetMonitorInfoW: user32.func('bool __stdcall GetMonitorInfoW(intptr_t hmon, _Inout_ MONITORINFOEXW *info)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(intptr_t hwnd)'),
      IsIconic: user32.func('bool __stdcall IsIconic(intptr_t hwnd)'),
      IsWindow: user32.func('bool __stdcall IsWindow(intptr_t hwnd)'),
      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr_t hwnd, _Out_ uint16_t *buf, int max)'),
      GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint16_t *buf, int max)'),
      GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ RECT *rect)'),
      GetWindowThreadProcessId: user32.func(
        'uint32 __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32 *pid)',
      ),
      GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
      GetWindow: user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32 cmd)'),
      SetWindowPos: user32.func(
        'bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32 flags)',
      ),
      ShowWindow: user32.func('bool __stdcall ShowWindow(intptr_t hwnd, int cmd)'),
      SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(intptr_t hwnd)'),
      GetForegroundWindow: user32.func('intptr_t __stdcall GetForegroundWindow()'),
      BringWindowToTop: user32.func('bool __stdcall BringWindowToTop(intptr_t hwnd)'),
      AttachThreadInput: user32.func('bool __stdcall AttachThreadInput(uint32 attach, uint32 to, bool flag)'),
      GetCurrentThreadId: kernel32.func('uint32 __stdcall GetCurrentThreadId()'),
      OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t handle)'),
      QueryFullProcessImageNameW: kernel32.func(
        'bool __stdcall QueryFullProcessImageNameW(intptr_t proc, uint32 flags, _Out_ uint16_t *buf, _Inout_ uint32 *size)',
      ),
      DwmGetWindowAttribute: dwmapi.func(
        'long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32 attr, _Out_ void *value, uint32 size)',
      ),
    };
  }

  private hwnd(id: string): number {
    return Number(id);
  }

  /**
   * The rect the user actually sees.
   *
   * Since Windows 10, GetWindowRect includes an invisible resize border of
   * roughly 7px on the sides and bottom. Tiling with those numbers leaves
   * visible gaps between tables, so we ask DWM for the real frame instead.
   */
  private visibleRect(hwnd: number, fallback: Rect): Rect {
    try {
      const out = Buffer.alloc(16);
      const hr = this.fn.DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out, 16);
      if (hr !== 0) return fallback;
      const left = out.readInt32LE(0);
      const top = out.readInt32LE(4);
      const right = out.readInt32LE(8);
      const bottom = out.readInt32LE(12);
      if (right <= left || bottom <= top) return fallback;
      return { x: left, y: top, width: right - left, height: bottom - top };
    } catch {
      return fallback;
    }
  }

  /** Difference between the window rect and what you can see of it. */
  private frameInset(hwnd: number): { left: number; top: number; right: number; bottom: number } {
    const raw: Win32Rect = {} as Win32Rect;
    if (!this.fn.GetWindowRect(hwnd, raw)) return { left: 0, top: 0, right: 0, bottom: 0 };
    const outer = toRect(raw);
    const visible = this.visibleRect(hwnd, outer);
    return {
      left: visible.x - outer.x,
      top: visible.y - outer.y,
      right: outer.x + outer.width - (visible.x + visible.width),
      bottom: outer.y + outer.height - (visible.y + visible.height),
    };
  }

  /** True for windows that are technically alive but hidden (UWP ghosts, etc.). */
  private isCloaked(hwnd: number): boolean {
    try {
      const out = Buffer.alloc(4);
      const hr = this.fn.DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, out, 4);
      return hr === 0 && out.readUInt32LE(0) !== 0;
    } catch {
      return false;
    }
  }

  private processName(hwnd: number): string {
    const pidOut = [0];
    this.fn.GetWindowThreadProcessId(hwnd, pidOut);
    const pid = pidOut[0] ?? 0;
    if (!pid) return '';
    const cached = this.processNameCache.get(pid);
    if (cached !== undefined) return cached;

    let name = '';
    const handle = this.fn.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (handle) {
      try {
        const buf = new Uint16Array(512);
        const size = [buf.length];
        if (this.fn.QueryFullProcessImageNameW(handle, 0, buf, size)) {
          const full = decodeWide(buf, size[0]);
          name = (full.split(/[\\/]/).pop() ?? '').toLowerCase();
        }
      } finally {
        this.fn.CloseHandle(handle);
      }
    }
    this.processNameCache.set(pid, name);
    return name;
  }

  listDisplays(): DisplayInfo[] {
    if (!this.available) return [];
    const displays: DisplayInfo[] = [];
    const proc = this.koffi.register((hmon: number) => {
      const info: any = { cbSize: 104, szDevice: new Array(32).fill(0) };
      if (this.fn.GetMonitorInfoW(hmon, info)) {
        const device = decodeWide(Uint16Array.from(info.szDevice as number[]));
        displays.push({
          id: String(hmon),
          label: device || `Display ${displays.length + 1}`,
          bounds: toRect(info.rcMonitor),
          workArea: toRect(info.rcWork),
          // Everything on this backend is already physical pixels.
          scaleFactor: 1,
          primary: (info.dwFlags & MONITORINFOF_PRIMARY) !== 0,
        });
      }
      return true;
    }, this.koffi.pointer('MonitorEnumProc'));

    try {
      this.fn.EnumDisplayMonitors(0, 0, proc, 0);
    } finally {
      this.koffi.unregister(proc);
    }
    // Primary first, then left-to-right: matches how people describe their rig.
    return displays.sort((a, b) => Number(b.primary) - Number(a.primary) || a.bounds.x - b.bounds.x);
  }

  listWindows(): WindowInfo[] {
    if (!this.available) return [];
    const windows: WindowInfo[] = [];
    const titleBuf = new Uint16Array(512);
    const classBuf = new Uint16Array(256);

    const proc = this.koffi.register((hwnd: number) => {
      try {
        if (!this.fn.IsWindowVisible(hwnd)) return true;
        const style = Number(this.fn.GetWindowLongPtrW(hwnd, GWL_STYLE));
        if ((style & WS_CHILD) !== 0 || (style & WS_VISIBLE) === 0) return true;

        const exStyle = Number(this.fn.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
        if ((exStyle & WS_EX_TOOLWINDOW) !== 0 || (exStyle & WS_EX_NOACTIVATE) !== 0) return true;
        if (this.isCloaked(hwnd)) return true;

        const titleLen = this.fn.GetWindowTextW(hwnd, titleBuf, titleBuf.length);
        if (titleLen <= 0) return true;
        const title = decodeWide(titleBuf, titleLen);

        this.fn.GetClassNameW(hwnd, classBuf, classBuf.length);
        const className = decodeWide(classBuf);

        const raw: Win32Rect = {} as Win32Rect;
        if (!this.fn.GetWindowRect(hwnd, raw)) return true;
        const outer = toRect(raw);
        const minimized = Boolean(this.fn.IsIconic(hwnd));

        windows.push({
          id: String(hwnd),
          title,
          processName: this.processName(hwnd),
          className,
          // A minimized window's rect is nonsense (-32000); report it as-is but
          // flagged, and let the manager skip placing it until it is restored.
          bounds: minimized ? outer : this.visibleRect(hwnd, outer),
          minimized,
          visible: true,
        });
      } catch {
        // One bad window must not abort the whole enumeration.
      }
      return true;
    }, this.koffi.pointer('EnumWindowsProc'));

    try {
      this.fn.EnumWindows(proc, 0);
    } finally {
      this.koffi.unregister(proc);
    }

    // Owned windows (dialogs, chat popups) are dropped: they follow their owner.
    return windows.filter((w) => this.fn.GetWindow(this.hwnd(w.id), GW_OWNER) === 0);
  }

  setWindowBounds(id: string, target: Rect, options: SetBoundsOptions = {}): boolean {
    if (!this.available) return false;
    const hwnd = this.hwnd(id);
    if (!this.fn.IsWindow(hwnd)) return false;
    if (options.restore !== false && this.fn.IsIconic(hwnd)) {
      this.fn.ShowWindow(hwnd, SW_RESTORE);
    }

    // Compensate for the invisible border so the *visible* edges land on target.
    const pad = this.frameInset(hwnd);
    const x = Math.round(target.x - pad.left);
    const y = Math.round(target.y - pad.top);
    const cx = Math.round(target.width + pad.left + pad.right);
    const cy = Math.round(target.height + pad.top + pad.bottom);

    let flags = SWP_NOZORDER | SWP_ASYNCWINDOWPOS;
    if (!options.activate) flags |= SWP_NOACTIVATE;
    return Boolean(this.fn.SetWindowPos(hwnd, 0, x, y, cx, cy, flags));
  }

  /**
   * Bring a window to the front.
   *
   * Windows refuses SetForegroundWindow from a process that does not own the
   * current foreground window. Attaching our input queue to the foreground
   * thread for the duration of the call is the long-standing way around it, and
   * is exactly what table managers do to make hotkey table-switching work.
   */
  focusWindow(id: string): boolean {
    if (!this.available) return false;
    const hwnd = this.hwnd(id);
    if (!this.fn.IsWindow(hwnd)) return false;
    if (this.fn.IsIconic(hwnd)) this.fn.ShowWindow(hwnd, SW_RESTORE);

    const foreground = this.fn.GetForegroundWindow();
    if (foreground === hwnd) return true;

    const targetThread = this.fn.GetWindowThreadProcessId(hwnd, [0]);
    const foregroundThread = foreground ? this.fn.GetWindowThreadProcessId(foreground, [0]) : 0;
    const selfThread = this.fn.GetCurrentThreadId();

    const attached: number[] = [];
    if (foregroundThread && foregroundThread !== selfThread) {
      if (this.fn.AttachThreadInput(selfThread, foregroundThread, true)) attached.push(foregroundThread);
    }
    if (targetThread && targetThread !== selfThread && targetThread !== foregroundThread) {
      if (this.fn.AttachThreadInput(selfThread, targetThread, true)) attached.push(targetThread);
    }
    try {
      this.fn.BringWindowToTop(hwnd);
      return Boolean(this.fn.SetForegroundWindow(hwnd));
    } finally {
      for (const thread of attached) this.fn.AttachThreadInput(selfThread, thread, false);
    }
  }

  restoreWindow(id: string): boolean {
    if (!this.available) return false;
    return Boolean(this.fn.ShowWindow(this.hwnd(id), SW_RESTORE));
  }

  minimizeWindow(id: string): boolean {
    if (!this.available) return false;
    return Boolean(this.fn.ShowWindow(this.hwnd(id), SW_MINIMIZE));
  }

  getForegroundWindow(): string | null {
    if (!this.available) return null;
    const hwnd = this.fn.GetForegroundWindow();
    return hwnd ? String(hwnd) : null;
  }

  dispose(): void {
    this.processNameCache.clear();
  }
}
