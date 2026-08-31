/**
 * Simulated desktop.
 *
 * Lets the manager, the layout editor and the hotkeys be exercised anywhere —
 * a Mac, a Linux CI box, a laptop with no poker client installed. Tables can be
 * opened and closed from the UI's Simulator panel, and they behave like real
 * windows: they move when told to, they keep the bounds they were given, and
 * they rename themselves the way a real client does between hands.
 */
import type { DisplayInfo, Rect, WindowInfo } from '../../core/types';
import type { DesktopBackend, MoveResult, SetBoundsOptions } from './types';

interface MockWindow extends WindowInfo {
  /** Renamed on a timer to mimic a client rewriting stack sizes into the title. */
  baseTitle: string;
}

const SITES = [
  { site: 'pokerstars', process: 'pokerstars.exe', className: 'PokerStarsTableFrameClass', name: () => `${pick(STARS_NAMES)} - $0.25/$0.50 USD - No Limit Hold'em` },
  { site: 'ggpoker', process: 'ggpoker.exe', className: 'Qt5152QWindowIcon', name: () => `NLH ${100 + Math.floor(Math.random() * 900)} - Blinds: $0.50/$1` },
  { site: 'partypoker', process: 'partypoker.exe', className: 'PartyWindowClass', name: () => `Fastforward Table ${1 + Math.floor(Math.random() * 40)} - No Limit Hold'em` },
];

const STARS_NAMES = ['Achilles', 'Bellatrix', 'Cepheus', 'Draco', 'Elara', 'Fornax', 'Ganymede', 'Hyperion'];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

export class MockBackend implements DesktopBackend {
  readonly id = 'mock';
  readonly available = true;
  readonly reason = 'Simulated desktop — no real windows are touched.';

  private windows = new Map<string, MockWindow>();
  private displays: DisplayInfo[];
  private foreground: string | null = null;
  private nextId = 1000;

  constructor(displays?: DisplayInfo[]) {
    this.displays = displays?.length
      ? displays
      : [
          {
            id: 'mock-1',
            label: 'Simulated 2560x1440',
            bounds: { x: 0, y: 0, width: 2560, height: 1440 },
            workArea: { x: 0, y: 0, width: 2560, height: 1400 },
            scaleFactor: 1,
            primary: true,
          },
        ];
    // A lobby plus a couple of tables, so the app has something to show on
    // first run instead of an empty list.
    this.spawnLobby('pokerstars');
    this.spawnTable('pokerstars');
    this.spawnTable('pokerstars');
    this.spawnTable('ggpoker');
  }

  setDisplays(displays: DisplayInfo[]): void {
    if (displays.length > 0) this.displays = displays;
  }

  listDisplays(): DisplayInfo[] {
    return this.displays.map((d) => ({ ...d }));
  }

  listWindows(): WindowInfo[] {
    return [...this.windows.values()].map((win) => this.snapshot(win));
  }

  /** Callers get a copy: a simulated window is no more mutable than a real one. */
  private snapshot(win: MockWindow): WindowInfo {
    const { baseTitle: _baseTitle, ...rest } = win;
    return { ...rest, bounds: { ...win.bounds } };
  }

  getWindowBounds(id: string): Rect | null {
    const win = this.windows.get(id);
    return win ? { ...win.bounds } : null;
  }

  setWindowBounds(id: string, rect: Rect, options: SetBoundsOptions = {}): MoveResult {
    const win = this.windows.get(id);
    if (!win) return { ok: false, message: 'the window no longer exists' };
    if (win.minimized && options.restore !== false) win.minimized = false;
    // A simulated fixed-size client keeps its own size, exactly like the real
    // ones that ignore a resize — that path needs to be exercisable off Windows.
    const keepSize = options.moveOnly || !win.resizable;
    win.bounds = keepSize
      ? { x: rect.x, y: rect.y, width: win.bounds.width, height: win.bounds.height }
      : { ...rect };
    if (options.activate) this.foreground = id;
    return { ok: true };
  }

  focusWindow(id: string): boolean {
    if (!this.windows.has(id)) return false;
    this.foreground = id;
    const win = this.windows.get(id);
    if (win) win.minimized = false;
    return true;
  }

  restoreWindow(id: string): boolean {
    const win = this.windows.get(id);
    if (!win) return false;
    win.minimized = false;
    return true;
  }

  minimizeWindow(id: string): boolean {
    const win = this.windows.get(id);
    if (!win) return false;
    win.minimized = true;
    return true;
  }

  getForegroundWindow(): string | null {
    return this.foreground;
  }

  environment(): { elevated: boolean; note?: string } {
    return { elevated: false, note: 'simulated desktop' };
  }

  // --- simulator controls, exposed to the renderer in mock mode -------------

  spawnTable(siteId?: string, fixedSize = false): WindowInfo {
    const spec = siteId ? SITES.find((s) => s.site === siteId) ?? SITES[0]! : pick(SITES);
    const display = this.displays[0]!;
    const title = spec.name();
    const id = String(this.nextId++);
    const win: MockWindow = {
      id,
      baseTitle: title,
      title,
      processName: spec.process,
      className: spec.className,
      // Clients open tables wherever they feel like it; that is the mess the
      // manager is supposed to clean up.
      bounds: {
        x: display.bounds.x + Math.floor(Math.random() * Math.max(1, display.bounds.width - 800)),
        y: display.bounds.y + Math.floor(Math.random() * Math.max(1, display.bounds.height - 600)),
        width: 792,
        height: 546,
      },
      minimized: false,
      visible: true,
      pid: 4000 + (Number(id) % 900),
      // Owned by the lobby, the way Electron and Qt clients really do it.
      owned: true,
      ownerId: null,
      toolWindow: false,
      cloaked: false,
      resizable: !fixedSize,
    };
    this.windows.set(id, win);
    return this.snapshot(win);
  }

  spawnLobby(siteId: string): WindowInfo {
    const spec = SITES.find((s) => s.site === siteId) ?? SITES[0]!;
    const id = String(this.nextId++);
    const win: MockWindow = {
      id,
      baseTitle: 'Lobby',
      title: `${spec.site === 'pokerstars' ? 'PokerStars Lobby' : 'Lobby'}`,
      processName: spec.process,
      className: 'LobbyClass',
      bounds: { x: 40, y: 40, width: 1100, height: 760 },
      minimized: false,
      visible: true,
      pid: 4000 + (Number(id) % 900),
      owned: false,
      ownerId: null,
      toolWindow: false,
      cloaked: false,
      resizable: true,
    };
    this.windows.set(id, win);
    return this.snapshot(win);
  }

  closeWindow(id: string): boolean {
    if (this.foreground === id) this.foreground = null;
    return this.windows.delete(id);
  }

  /** Wipe the simulated desktop, lobbies included. */
  closeAll(): void {
    this.windows.clear();
    this.foreground = null;
  }

  closeAllTables(): void {
    for (const [id, win] of this.windows) {
      if (!/lobby/i.test(win.title)) this.windows.delete(id);
    }
  }

  /** Mimic a client rewriting titles mid-session; the tracker must not care. */
  churnTitles(): void {
    for (const win of this.windows.values()) {
      if (/lobby/i.test(win.baseTitle)) continue;
      const stack = (20 + Math.random() * 180).toFixed(2);
      win.title = `${win.baseTitle} - $${stack}`;
    }
  }
}
