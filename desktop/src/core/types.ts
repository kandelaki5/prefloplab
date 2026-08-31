/**
 * Shared, platform-independent types.
 *
 * Everything in `core/` is pure: no Electron, no OS calls, no I/O. That is what
 * makes the interesting parts (layout maths, window matching, slot assignment)
 * testable on any machine, including the CI box that has never seen a poker
 * client.
 *
 * Coordinate convention: every Rect in core is in *physical* pixels of the
 * virtual desktop, with the primary monitor's top-left at (0, 0). Monitors to
 * the left of or above the primary one therefore have negative coordinates.
 * Conversion from Electron's DIP coordinates happens once, at the platform
 * boundary (see `main/platform`).
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A monitor as reported by the OS. */
export interface DisplayInfo {
  id: string;
  label: string;
  /** Full monitor rect. */
  bounds: Rect;
  /** Monitor rect minus taskbar / docks. */
  workArea: Rect;
  scaleFactor: number;
  primary: boolean;
}

/** A top-level OS window. */
export interface WindowInfo {
  /** Opaque, stable for the lifetime of the window (HWND on Windows). */
  id: string;
  title: string;
  /** Executable name, lower-cased, without path. e.g. "pokerstars.exe" */
  processName: string;
  /** Win32 window class, e.g. "PokerStarsTableFrameClass". */
  className: string;
  bounds: Rect;
  minimized: boolean;
  visible: boolean;
  pid: number;
  /**
   * Owned by another window of the same process (an "owner", not a parent).
   *
   * Do not use this to rule a window out. Plenty of clients — anything built
   * on Electron or Qt, which is most of the modern ones — create their table
   * windows owned by the main window, and dropping owned windows makes those
   * tables invisible to the manager with nothing to show for it.
   */
  owned: boolean;
  ownerId: string | null;
  /** WS_EX_TOOLWINDOW: palettes and overlays, never a table. */
  toolWindow: boolean;
  /** Alive but not composited — UWP ghosts, minimized-to-tray windows. */
  cloaked: boolean;
  /** WS_THICKFRAME. A window without it will refuse to change size. */
  resizable: boolean;
}

export type WindowKind = 'table' | 'lobby' | 'other';

/** Result of running a WindowInfo past the site profiles. */
export interface Classification {
  kind: WindowKind;
  /** Id of the site profile that matched, if any. */
  siteId: string | null;
  /**
   * Why this window is not being managed, in words, for the Windows tab.
   * Silent non-matching is the single hardest thing to debug in a tool like
   * this, so every rejection carries its reason.
   */
  reason?: string;
  /**
   * Stable identity of the *game* behind the window. Poker clients rename
   * their table windows constantly (stack sizes, blind levels, "action on
   * you" suffixes), so we key on the part that does not move — usually the
   * table name — to keep a table glued to its slot across renames.
   */
  tableKey: string | null;
}

/** One parking space for a table window. */
export interface Slot {
  id: string;
  /** Position in the layout's own ordering; drives fill order. */
  index: number;
  rect: Rect;
  /** Slots can be pinned to a site, so e.g. Zoom tables always land top-left. */
  siteId?: string | null;
  label?: string;
}

export type LayoutKind = 'grid' | 'stack' | 'cascade' | 'custom';

export interface Layout {
  id: string;
  name: string;
  kind: LayoutKind;
  /** Display this layout was authored against. */
  displayId: string;
  slots: Slot[];
  /**
   * Tables that do not fit in any slot.
   * - "cascade": pile them up with a fixed offset from the last slot
   * - "stack": drop them all onto the last slot
   * - "leave": don't touch them
   */
  overflow: 'cascade' | 'stack' | 'leave';
  /**
   * Width / height a table is forced to. When set, a table is scaled to fit
   * its slot at this aspect ratio and centred — poker clients that refuse
   * non-proportional resizes then still end up neatly aligned.
   */
  aspectRatio?: number | null;
  createdAt?: number;
}

/** windowId -> slotId */
export type AssignmentMap = Record<string, string>;

/** A table we are currently tracking. */
export interface TrackedTable {
  window: WindowInfo;
  siteId: string | null;
  tableKey: string;
  /** First time we saw this table, ms epoch. Drives fill order. */
  firstSeen: number;
}

export interface SiteProfile {
  id: string;
  name: string;
  enabled: boolean;
  /** Lower-cased executable names. Empty = match any process. */
  processNames: string[];
  /** Regex sources (case-insensitive) matched against the window class. */
  classPatterns: string[];
  /** Regex sources matched against the window title to call it a table. */
  tablePatterns: string[];
  /** Regex sources that mark a window as the lobby / cashier / anything else. */
  lobbyPatterns: string[];
  /** Regex sources that veto a match outright. */
  excludePatterns: string[];
  /**
   * Regex with one capture group pulling the stable table name out of the
   * title. When it does not match, the whole title is used.
   */
  tableKeyPattern?: string | null;
  /** Native table aspect ratio, used by the layout's aspect lock. */
  aspectRatio?: number | null;
  /**
   * Client refuses to be resized (fixed-size tables), so TableLab only moves
   * its windows and centres them in the slot. Detected automatically when a
   * resize does not take, and remembered here.
   */
  positionOnly?: boolean;
  /** Set when the profile was generated from a window by "Mark as table". */
  learned?: boolean;
}
