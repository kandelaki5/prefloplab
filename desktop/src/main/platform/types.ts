import type { DisplayInfo, Rect, WindowInfo } from '../../core/types';

export interface SetBoundsOptions {
  /** Bring the window to the front as part of the move. */
  activate?: boolean;
  /** Restore a minimized window first — you cannot position an icon. */
  restore?: boolean;
  /** Move without resizing, for clients that insist on their own size. */
  moveOnly?: boolean;
}

export interface MoveResult {
  ok: boolean;
  /** Raw Win32 error, when there was one. */
  errorCode?: number;
  /** The same thing in words, ready to show in the UI. */
  message?: string;
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
  /**
   * The current bounds of one window.
   *
   * Read straight after a move: it is how we find out whether the client
   * actually accepted it, rather than trusting an API that reports success for
   * a request it merely queued.
   */
  getWindowBounds(id: string): Rect | null;
  setWindowBounds(id: string, rect: Rect, options?: SetBoundsOptions): MoveResult;
  focusWindow(id: string): boolean;
  restoreWindow(id: string): boolean;
  minimizeWindow(id: string): boolean;
  getForegroundWindow(): string | null;
  /** Facts worth putting in a bug report. */
  environment?(): { elevated: boolean; note?: string };
  dispose?(): void;
}
