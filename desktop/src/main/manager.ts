import { assignTables, assignToSlot, releaseWindow, rotate } from '../core/assignment';
import type { AssignmentMap, Layout, TrackedTable, WindowInfo } from '../core/types';
import { classifyWindow, profileById } from '../core/matching';
import { equals } from '../core/geometry';
import type { ManagerState, TableView } from '../shared/ipc';
import type { ConfigStore } from './config';
import type { DesktopBackend } from './platform/types';

/** How long a closed table keeps its seat, in case it is just reconnecting. */
const SLOT_MEMORY_MS = 120_000;

/** Windows rounds sizes; don't fight it over a pixel. */
const PLACEMENT_TOLERANCE = 2;

export interface ManagerEvents {
  onState(state: ManagerState): void;
}

/**
 * The scan → classify → assign → place loop.
 *
 * Deliberately conservative about moving windows: a table is placed when it
 * first appears, when you ask for an arrange, or when "enforce layout" is on.
 * Anything more aggressive fights the user every time they nudge a table.
 */
export class TableManager {
  private timer: NodeJS.Timeout | null = null;
  private tracked = new Map<string, TrackedTable>();
  private assignments: AssignmentMap = {};
  private placed = new Set<string>();
  /** tableKey -> slot it last occupied, so a reopened table returns to its seat. */
  private slotMemory = new Map<string, { slotId: string; at: number }>();
  private lastState: ManagerState | null = null;
  private lastError: string | null = null;

  constructor(
    private backend: DesktopBackend,
    private readonly store: ConfigStore,
    private readonly events: ManagerEvents,
  ) {}

  start(): void {
    this.stop();
    const interval = this.store.get().pollIntervalMs;
    this.timer = setInterval(() => this.scan(), interval);
    this.scan();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  setBackend(backend: DesktopBackend): void {
    this.backend.dispose?.();
    this.backend = backend;
    this.reset();
    this.start();
  }

  getBackend(): DesktopBackend {
    return this.backend;
  }

  /** Forget every assignment; the next scan starts from a clean layout. */
  reset(): void {
    this.tracked.clear();
    this.assignments = {};
    this.placed.clear();
    this.slotMemory.clear();
  }

  getState(): ManagerState {
    return this.lastState ?? this.buildState([], [], []);
  }

  activeLayout(): Layout | null {
    const config = this.store.get();
    return config.layouts.find((l) => l.id === config.activeLayoutId) ?? config.layouts[0] ?? null;
  }

  /** Re-place everything, whether or not it has been placed before. */
  arrangeNow(force = true): void {
    this.scan({ force });
  }

  /** Layout changed under us: every table needs re-placing. */
  onLayoutChanged(): void {
    this.placed.clear();
    this.assignments = {};
    this.scan({ force: true });
  }

  scan(options: { force?: boolean } = {}): void {
    const config = this.store.get();
    let windows: WindowInfo[] = [];
    try {
      windows = this.backend.available ? this.backend.listWindows() : [];
      this.lastError = null;
    } catch (error) {
      this.lastError = (error as Error).message;
    }

    const tables: TrackedTable[] = [];
    const lobbies: { id: string; title: string; siteId: string | null }[] = [];
    const others: WindowInfo[] = [];
    const now = Date.now();

    for (const win of windows) {
      const result = classifyWindow(win, config.profiles);
      if (result.kind === 'table') {
        const existing = this.tracked.get(win.id);
        tables.push({
          window: win,
          siteId: result.siteId,
          tableKey: result.tableKey ?? win.title,
          firstSeen: existing?.firstSeen ?? now,
        });
      } else if (result.kind === 'lobby') {
        lobbies.push({ id: win.id, title: win.title, siteId: result.siteId });
      } else {
        others.push(win);
      }
    }

    // Remember the seats of tables that just disappeared.
    const liveIds = new Set(tables.map((t) => t.window.id));
    for (const [id, table] of this.tracked) {
      if (liveIds.has(id)) continue;
      const slotId = this.assignments[id];
      if (slotId) this.slotMemory.set(table.tableKey, { slotId, at: now });
      this.placed.delete(id);
      delete this.assignments[id];
    }
    for (const [key, entry] of this.slotMemory) {
      if (now - entry.at > SLOT_MEMORY_MS) this.slotMemory.delete(key);
    }

    this.tracked = new Map(tables.map((t) => [t.window.id, t]));

    const layout = this.activeLayout();
    if (layout) {
      // Give returning tables their old seat back before the general assignment
      // runs, so a reconnect does not reshuffle the felt.
      const seeded: AssignmentMap = { ...this.assignments };
      const taken = new Set(Object.values(seeded));
      for (const table of tables) {
        if (seeded[table.window.id]) continue;
        const remembered = this.slotMemory.get(table.tableKey);
        if (!remembered || taken.has(remembered.slotId)) continue;
        if (!layout.slots.some((s) => s.id === remembered.slotId)) continue;
        seeded[table.window.id] = remembered.slotId;
        taken.add(remembered.slotId);
      }

      const display = this.displayFor(layout);
      const result = assignTables(tables, layout, seeded, {
        strategy: config.strategy,
        bounds: display?.workArea,
        siteAspect: Object.fromEntries(config.profiles.map((p) => [p.id, p.aspectRatio ?? null])),
      });
      this.assignments = result.assignments;

      if (config.autoArrange || options.force) {
        for (const placement of result.placements) {
          if (!placement.rect) continue;
          const table = this.tracked.get(placement.windowId);
          if (!table) continue;
          const alreadyPlaced = this.placed.has(placement.windowId);
          if (alreadyPlaced && !options.force && !config.enforceLayout) continue;
          if (table.window.minimized && !options.force) continue;
          if (equals(table.window.bounds, placement.rect, PLACEMENT_TOLERANCE)) {
            this.placed.add(placement.windowId);
            continue;
          }
          try {
            const moved = this.backend.setWindowBounds(placement.windowId, placement.rect, {
              activate: config.focusOnPlace && !alreadyPlaced,
            });
            if (moved) this.placed.add(placement.windowId);
          } catch (error) {
            this.lastError = (error as Error).message;
          }
        }
      }

      if (config.tuckLobby && tables.length > 0) {
        for (const lobby of lobbies) {
          try {
            this.backend.minimizeWindow(lobby.id);
          } catch {
            // A lobby that refuses to minimize is not worth failing a scan over.
          }
        }
      }
    }

    const state = this.buildState(tables, lobbies, others);
    this.lastState = state;
    this.events.onState(state);
  }

  private displayFor(layout: Layout) {
    try {
      const displays = this.backend.listDisplays();
      return displays.find((d) => d.id === layout.displayId) ?? displays.find((d) => d.primary) ?? displays[0] ?? null;
    } catch {
      return null;
    }
  }

  private buildState(
    tables: TrackedTable[],
    lobbies: { id: string; title: string; siteId: string | null }[],
    others: WindowInfo[],
  ): ManagerState {
    const config = this.store.get();
    const layout = this.activeLayout();
    const slotIndex = new Map((layout?.slots ?? []).map((s) => [s.id, s.index]));

    const tableViews: TableView[] = tables.map((table) => {
      const slotId = this.assignments[table.window.id] ?? null;
      const profile = profileById(config.profiles, table.siteId);
      return {
        id: table.window.id,
        title: table.window.title,
        siteId: table.siteId,
        siteName: profile?.name ?? 'Unknown',
        tableKey: table.tableKey,
        slotId,
        slotIndex: slotId ? slotIndex.get(slotId) ?? null : null,
        bounds: table.window.bounds,
        minimized: table.window.minimized,
        placed: this.placed.has(table.window.id),
        firstSeen: table.firstSeen,
      };
    });
    tableViews.sort((a, b) => {
      if (a.slotIndex === null && b.slotIndex === null) return a.firstSeen - b.firstSeen;
      if (a.slotIndex === null) return 1;
      if (b.slotIndex === null) return -1;
      return a.slotIndex - b.slotIndex;
    });

    let displays: ManagerState['displays'] = [];
    try {
      displays = this.backend.listDisplays();
    } catch (error) {
      this.lastError = (error as Error).message;
    }

    return {
      backendId: this.backend.id,
      backendAvailable: this.backend.available,
      backendReason: this.backend.reason,
      running: this.running,
      autoArrange: config.autoArrange,
      enforceLayout: config.enforceLayout,
      activeLayoutId: layout?.id ?? null,
      displays,
      tables: tableViews,
      lobbies,
      // Unmatched windows are shown in the Sites tab so you can build a profile
      // from what is actually on screen instead of guessing at title formats.
      otherWindows: others
        .filter((w) => w.title.trim().length > 0)
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 80),
      assignments: { ...this.assignments },
      lastScanAt: Date.now(),
      lastError: this.lastError,
    };
  }

  // --- actions -------------------------------------------------------------

  focusTable(windowId: string): void {
    try {
      this.backend.focusWindow(windowId);
    } catch (error) {
      this.lastError = (error as Error).message;
    }
  }

  /** Walk through the tables in slot order — the classic table-switching hotkey. */
  cycleTable(direction: 1 | -1): void {
    const state = this.getState();
    const order = state.tables.filter((t) => !t.minimized);
    if (order.length === 0) return;
    const foreground = this.backend.getForegroundWindow();
    const current = order.findIndex((t) => t.id === foreground);
    const next = current < 0 ? 0 : (current + direction + order.length) % order.length;
    const target = order[next];
    if (target) this.focusTable(target.id);
  }

  assignTableToSlot(windowId: string, slotId: string): void {
    this.assignments = assignToSlot(this.assignments, windowId, slotId);
    // Both tables involved in the swap must move again.
    this.placed.clear();
    this.scan({ force: true });
  }

  releaseTable(windowId: string): void {
    this.assignments = releaseWindow(this.assignments, windowId);
    this.placed.delete(windowId);
    this.scan();
  }

  rotateTables(direction: 1 | -1): void {
    const layout = this.activeLayout();
    if (!layout) return;
    this.assignments = rotate(this.assignments, layout.slots, direction);
    this.placed.clear();
    this.scan({ force: true });
  }

  /** Switch to the next layout in the list. */
  cycleLayout(): string | null {
    const config = this.store.get();
    if (config.layouts.length === 0) return null;
    const index = config.layouts.findIndex((l) => l.id === config.activeLayoutId);
    const next = config.layouts[(index + 1) % config.layouts.length];
    if (!next) return null;
    this.store.update({ activeLayoutId: next.id });
    this.onLayoutChanged();
    return next.id;
  }

  toggleAutoArrange(): boolean {
    const next = !this.store.get().autoArrange;
    this.store.update({ autoArrange: next });
    if (next) this.arrangeNow(true);
    else this.scan();
    return next;
  }
}
