import { assignTables, assignToSlot, releaseWindow, rotate } from '../core/assignment';
import type { AssignmentMap, Layout, Rect, TrackedTable, WindowInfo } from '../core/types';
import { classifyWindow, profileById } from '../core/matching';
import { centerIn, equals } from '../core/geometry';
import type { InspectedWindow, ManagerState, PlacementStatus, TableView } from '../shared/ipc';
import type { ConfigStore } from './config';
import type { DesktopBackend } from './platform/types';

function rankKind(kind: InspectedWindow['kind']): number {
  return kind === 'table' ? 0 : kind === 'lobby' ? 1 : 2;
}

/** How long a closed table keeps its seat, in case it is just reconnecting. */
const SLOT_MEMORY_MS = 120_000;

/** Windows rounds sizes; don't fight it over a pixel. */
const PLACEMENT_TOLERANCE = 2;

/**
 * How many scans to keep re-asking a window to move before calling it stuck.
 * SetWindowPos is asynchronous and a busy client can miss the first one, so a
 * couple of retries is normal; more than that means something is refusing.
 */
const MAX_PLACEMENT_ATTEMPTS = 3;

/** Shown against any table whose client will not be resized. */
const SIZE_LOCKED_NOTE = 'this client keeps its own table size, so TableLab positions it without resizing';

interface PendingPlacement {
  target: Rect;
  attempts: number;
  /** The client ignored a resize, so we only move it from here on. */
  moveOnly: boolean;
  status: PlacementStatus;
  detail?: string;
}

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
  /** windowId -> what we asked for and how that went. */
  private pending = new Map<string, PendingPlacement>();
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
    this.pending.clear();
    this.slotMemory.clear();
  }

  getState(): ManagerState {
    return this.lastState ?? this.buildState([], [], []);
  }

  /** Everything a bug report needs, in one object. */
  snapshotForDiagnostics(): Record<string, unknown> {
    const config = this.store.get();
    const state = this.getState();
    return {
      generatedAt: new Date().toISOString(),
      platform: `${process.platform} ${process.arch}`,
      backend: { id: state.backendId, available: state.backendAvailable, reason: state.backendReason },
      environment: state.environment,
      displays: state.displays,
      activeLayout: config.layouts.find((l) => l.id === config.activeLayoutId) ?? null,
      settings: {
        autoArrange: config.autoArrange,
        enforceLayout: config.enforceLayout,
        strategy: config.strategy,
        pollIntervalMs: config.pollIntervalMs,
      },
      profiles: config.profiles,
      tables: state.tables,
      issues: state.issues,
      windows: state.windows,
    };
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
    this.pending.clear();
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
    const inspected: InspectedWindow[] = [];
    const now = Date.now();

    for (const win of windows) {
      const result = classifyWindow(win, config.profiles);
      inspected.push({
        ...win,
        kind: result.kind,
        siteId: result.siteId,
        reason: result.reason ?? null,
        status: null,
      });
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
          this.applyPlacement(table, placement.rect, {
            force: options.force === true,
            enforce: config.enforceLayout,
            focus: config.focusOnPlace,
          });
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

    // Fold placement outcomes back into the window list so the Windows tab can
    // show, per window, both what it is and how the last move went.
    for (const win of inspected) {
      win.status = this.pending.get(win.id)?.status ?? null;
    }

    const state = this.buildState(tables, lobbies, inspected);
    this.lastState = state;
    this.events.onState(state);
  }

  /**
   * Ask a window to go somewhere, then check on the next scan that it went.
   *
   * SetWindowPos reports success as soon as the request is queued, and plenty
   * of clients only partly obey: fixed-size tables keep their own dimensions,
   * and a client running elevated rejects the move outright while TableLab is
   * not. Verifying the result and saying what happened is the difference
   * between "nothing happens and I have no idea why" and one line telling you
   * to run TableLab as administrator.
   */
  private applyPlacement(
    table: TrackedTable,
    slotRect: Rect,
    opts: { force: boolean; enforce: boolean; focus: boolean },
  ): void {
    const id = table.window.id;
    const actual = table.window.bounds;
    if (table.window.minimized && !opts.force) return;

    let state = this.pending.get(id);
    // An explicit arrange is also a fresh start for a window we gave up on.
    if (state?.status === 'stuck' && opts.force) {
      this.pending.delete(id);
      state = undefined;
    }

    const settled = this.placed.has(id) && state?.status !== 'moving';
    if (settled && !opts.force && !opts.enforce) return;
    if (state?.status === 'stuck') return;

    const moveOnly = state?.moveOnly ?? !table.window.resizable;
    const target = moveOnly ? centerIn(slotRect, actual) : slotRect;
    if (equals(actual, target, PLACEMENT_TOLERANCE)) {
      this.placed.add(id);
      this.pending.set(id, {
        target,
        attempts: 0,
        moveOnly,
        status: moveOnly ? 'size-locked' : 'placed',
        detail: moveOnly ? SIZE_LOCKED_NOTE : undefined,
      });
      return;
    }

    try {
      const result = this.backend.setWindowBounds(id, target, {
        activate: opts.focus && !this.placed.has(id),
        moveOnly,
      });
      if (!result.ok) {
        this.lastError = result.message ?? 'a table refused to move';
        this.pending.set(id, {
          target,
          attempts: MAX_PLACEMENT_ATTEMPTS + 1,
          moveOnly,
          status: 'stuck',
          detail: result.message,
        });
        return;
      }

      const after = this.backend.getWindowBounds(id) ?? actual;
      const positionOk =
        Math.abs(after.x - target.x) <= PLACEMENT_TOLERANCE && Math.abs(after.y - target.y) <= PLACEMENT_TOLERANCE;
      const sizeOk =
        Math.abs(after.width - target.width) <= PLACEMENT_TOLERANCE &&
        Math.abs(after.height - target.height) <= PLACEMENT_TOLERANCE;

      if (positionOk && sizeOk) {
        this.placed.add(id);
        this.pending.set(id, {
          target,
          attempts: 0,
          moveOnly,
          status: moveOnly ? 'size-locked' : 'placed',
          detail: moveOnly ? SIZE_LOCKED_NOTE : undefined,
        });
        return;
      }

      if (positionOk && !moveOnly) {
        // The window went where it was told but kept its own size: a
        // fixed-size client. Stop asking for a resize it will never perform,
        // and centre the size it insists on inside the slot instead.
        const centred = centerIn(slotRect, after);
        this.backend.setWindowBounds(id, centred, { moveOnly: true });
        const settledRect = this.backend.getWindowBounds(id) ?? after;
        this.placed.add(id);
        this.pending.set(id, {
          target: settledRect,
          attempts: 0,
          moveOnly: true,
          status: 'size-locked',
          detail: SIZE_LOCKED_NOTE,
        });
        return;
      }

      // It reported success and did not move. Give it a couple of scans — a
      // busy client can miss one — then say so rather than retrying forever.
      const attempts = (state?.attempts ?? 0) + 1;
      this.pending.set(id, {
        target,
        attempts,
        moveOnly,
        status: attempts > MAX_PLACEMENT_ATTEMPTS ? 'stuck' : 'moving',
        detail:
          attempts > MAX_PLACEMENT_ATTEMPTS
            ? 'the client accepted the move and then ignored it — if it runs as administrator, run TableLab as administrator too'
            : state?.detail,
      });
    } catch (error) {
      this.lastError = (error as Error).message;
      this.pending.set(id, {
        target,
        attempts: MAX_PLACEMENT_ATTEMPTS + 1,
        moveOnly,
        status: 'stuck',
        detail: this.lastError,
      });
    }
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
    windows: InspectedWindow[],
  ): ManagerState {
    const config = this.store.get();
    const layout = this.activeLayout();
    const slotIndex = new Map((layout?.slots ?? []).map((s) => [s.id, s.index]));

    const tableViews: TableView[] = tables.map((table) => {
      const slotId = this.assignments[table.window.id] ?? null;
      const profile = profileById(config.profiles, table.siteId);
      const pending = this.pending.get(table.window.id);
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
        status: pending?.status ?? null,
        statusDetail: pending?.detail ?? null,
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
      // Every window is reported, not just the unmatched ones: when a client is
      // not recognised, seeing the real titles and classes is the whole fix.
      windows: [...windows].sort(
        (a, b) => rankKind(a.kind) - rankKind(b.kind) || a.processName.localeCompare(b.processName) || a.title.localeCompare(b.title),
      ),
      assignments: { ...this.assignments },
      lastScanAt: Date.now(),
      lastError: this.lastError,
      issues: this.collectIssues(tableViews, windows),
      environment: this.backend.environment?.() ?? { elevated: false },
    };
  }

  /** The one or two things actually worth interrupting the user about. */
  private collectIssues(tables: TableView[], windows: InspectedWindow[]): string[] {
    const issues: string[] = [];
    if (!this.backend.available) {
      issues.push(this.backend.reason ?? 'Window management is unavailable on this machine.');
    }

    const stuck = tables.filter((t) => t.status === 'stuck');
    if (stuck.length > 0) {
      const detail = stuck.find((t) => t.statusDetail)?.statusDetail;
      issues.push(
        `${stuck.length} table${stuck.length === 1 ? '' : 's'} would not move${detail ? ` — ${detail}` : ''}.`,
      );
    }

    if (tables.length === 0) {
      // The single most useful hint when nothing is detected: name the windows
      // that look like a poker client but matched no profile.
      const candidates = windows.filter(
        (w) =>
          w.kind === 'other' &&
          !w.toolWindow &&
          !w.cloaked &&
          w.bounds.width >= 400 &&
          w.bounds.height >= 300 &&
          /poker|casino|holdem|coin/i.test(`${w.processName} ${w.title}`),
      );
      if (candidates.length > 0) {
        const names = [...new Set(candidates.map((w) => w.processName || w.className))].slice(0, 3);
        issues.push(
          `No tables recognised, but ${names.join(', ')} looks like a poker client — open the Windows tab and mark one of its tables.`,
        );
      }
    }
    return issues;
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
