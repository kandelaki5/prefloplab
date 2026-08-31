import type {
  AssignmentMap,
  DisplayInfo,
  Layout,
  Rect,
  SiteProfile,
  WindowInfo,
  WindowKind,
} from '../core/types';
import type { FillStrategy } from '../core/assignment';

export type HotkeyAction =
  | 'arrange'
  | 'cycleLayout'
  | 'nextTable'
  | 'prevTable'
  | 'rotate'
  | 'toggleAuto'
  | 'showManager';

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  arrange: 'Arrange tables now',
  cycleLayout: 'Next layout',
  nextTable: 'Focus next table',
  prevTable: 'Focus previous table',
  rotate: 'Rotate tables through slots',
  toggleAuto: 'Toggle auto-arrange',
  showManager: 'Show TableLab',
};

export interface AppConfig {
  version: number;
  activeLayoutId: string | null;
  layouts: Layout[];
  profiles: SiteProfile[];
  hotkeys: Partial<Record<HotkeyAction, string>>;
  /** Place a table as soon as it appears. */
  autoArrange: boolean;
  /**
   * Keep re-applying the layout on every scan. Off by default: a table that
   * you deliberately dragged aside should stay where you put it.
   */
  enforceLayout: boolean;
  /** How often we scan for new/closed tables, ms. */
  pollIntervalMs: number;
  strategy: FillStrategy;
  /** Focus a table as soon as it is placed. */
  focusOnPlace: boolean;
  /** Minimize lobby windows while tables are open, to get them out of the way. */
  tuckLobby: boolean;
  backend: 'auto' | 'win32' | 'mock';
  startMinimized: boolean;
}

/** How the last attempt to place a window went. */
export type PlacementStatus = 'moving' | 'placed' | 'size-locked' | 'stuck';

/** Every window on the desktop, with the verdict and the reasoning. */
export interface InspectedWindow extends WindowInfo {
  kind: WindowKind;
  siteId: string | null;
  /** Why it is not being managed, when it is not. */
  reason: string | null;
  status: PlacementStatus | null;
}

export interface TableView {
  id: string;
  title: string;
  siteId: string | null;
  siteName: string;
  tableKey: string;
  slotId: string | null;
  slotIndex: number | null;
  bounds: Rect;
  minimized: boolean;
  placed: boolean;
  firstSeen: number;
  status: PlacementStatus | null;
  /** Plain-language note when a table would not go where it was asked. */
  statusDetail: string | null;
}

export interface ManagerState {
  backendId: string;
  backendAvailable: boolean;
  backendReason?: string;
  running: boolean;
  autoArrange: boolean;
  enforceLayout: boolean;
  activeLayoutId: string | null;
  displays: DisplayInfo[];
  tables: TableView[];
  lobbies: { id: string; title: string; siteId: string | null }[];
  /** Every top-level window, managed or not, for the Windows tab. */
  windows: InspectedWindow[];
  assignments: AssignmentMap;
  lastScanAt: number;
  lastError: string | null;
  /** Problems worth putting in front of the user right now. */
  issues: string[];
  environment: { elevated: boolean; note?: string };
}

export interface HotkeyStatus {
  action: HotkeyAction;
  accelerator: string;
  registered: boolean;
  error?: string;
}

/** Everything the renderer can ask the main process to do. */
export interface Api {
  getConfig(): Promise<AppConfig>;
  saveConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  getState(): Promise<ManagerState>;
  getHotkeyStatus(): Promise<HotkeyStatus[]>;

  saveLayout(layout: Layout): Promise<AppConfig>;
  deleteLayout(layoutId: string): Promise<AppConfig>;
  setActiveLayout(layoutId: string): Promise<AppConfig>;
  buildLayout(request: BuildLayoutRequest): Promise<Layout>;

  arrangeNow(force?: boolean): Promise<void>;
  focusTable(windowId: string): Promise<void>;
  cycleTable(direction: 1 | -1): Promise<void>;
  assignTableToSlot(windowId: string, slotId: string): Promise<void>;
  releaseTable(windowId: string): Promise<void>;
  rotateTables(direction: 1 | -1): Promise<void>;

  /** Turn a window the user pointed at into a site profile. */
  learnWindow(windowId: string): Promise<AppConfig>;
  /** Write a full window dump to disk; returns the file path. */
  saveDiagnostics(): Promise<string>;

  /** Simulator (mock backend only). */
  mock(action: 'spawnTable' | 'closeAll' | 'churn' | 'spawnLobby' | 'spawnFixedTable', siteId?: string): Promise<void>;

  onState(listener: (state: ManagerState) => void): () => void;
}

export interface BuildLayoutRequest {
  name: string;
  kind: 'grid' | 'stack' | 'cascade';
  displayId: string;
  /** For "grid": leave rows/cols null to have them chosen for you. */
  rows?: number | null;
  cols?: number | null;
  count?: number;
  gap?: number;
  padding?: number;
  order?: 'row' | 'column';
  aspectRatio?: number | null;
  useWorkArea?: boolean;
  size?: { width: number; height: number };
}

export const IPC = {
  getConfig: 'config:get',
  saveConfig: 'config:save',
  getState: 'state:get',
  getHotkeyStatus: 'hotkeys:status',
  saveLayout: 'layout:save',
  deleteLayout: 'layout:delete',
  setActiveLayout: 'layout:setActive',
  buildLayout: 'layout:build',
  arrangeNow: 'manager:arrange',
  focusTable: 'manager:focus',
  cycleTable: 'manager:cycle',
  assignTableToSlot: 'manager:assign',
  releaseTable: 'manager:release',
  rotateTables: 'manager:rotate',
  learnWindow: 'window:learn',
  saveDiagnostics: 'diagnostics:save',
  mock: 'mock:action',
  stateEvent: 'state:changed',
} as const;
