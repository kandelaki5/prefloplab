import type { AssignmentMap, DisplayInfo, Layout, Rect, SiteProfile, WindowInfo } from '../core/types';
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
  otherWindows: WindowInfo[];
  assignments: AssignmentMap;
  lastScanAt: number;
  lastError: string | null;
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

  /** Simulator (mock backend only). */
  mock(action: 'spawnTable' | 'closeAll' | 'churn' | 'spawnLobby', siteId?: string): Promise<void>;

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
  mock: 'mock:action',
  stateEvent: 'state:changed',
} as const;
