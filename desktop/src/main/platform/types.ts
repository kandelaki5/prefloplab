import type { DisplayInfo, Rect, WindowInfo } from '../../core/types';

export interface SetBoundsOptions {
  /** Bring the window to the front as part of the move. */
  activate?: boolean;
  /** Restore a minimized window first — you cannot position an icon. */
  restore?: boolean;
}

/**
 * Everything the manager needs from the operating system.
 *
 * Two implementations ship: `win32` (real HWNDs via user32.dll) and `mock`
 * (a simulated desktop). The mock exists so the whole app — UI, layout engine,
 * assignment, hotkeys — can be developed and tested on a machine that is not
 * Windows and has no poker client installed.
 */
export interface DesktopBackend {
  readonly id: string;
  /** False when the backend loaded but cannot work here (wrong OS, missing dll). */
  readonly available: boolean;
  /** Why it is unavailable, for the UI to show. */
  readonly reason?: string;

  listDisplays(): DisplayInfo[];
  listWindows(): WindowInfo[];
  setWindowBounds(id: string, rect: Rect, options?: SetBoundsOptions): boolean;
  focusWindow(id: string): boolean;
  restoreWindow(id: string): boolean;
  minimizeWindow(id: string): boolean;
  getForegroundWindow(): string | null;
  dispose?(): void;
}
