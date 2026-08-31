import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { autoGridSlots } from '../core/layout';
import { BUILTIN_PROFILES } from '../core/matching';
import type { DisplayInfo, Layout, SiteProfile } from '../core/types';
import type { AppConfig, HotkeyAction } from '../shared/ipc';

export const CONFIG_VERSION = 1;

export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
  arrange: 'Alt+A',
  cycleLayout: 'Alt+L',
  nextTable: 'Alt+Right',
  prevTable: 'Alt+Left',
  rotate: 'Alt+R',
  toggleAuto: 'Alt+S',
  showManager: 'Alt+T',
};

export function defaultLayouts(displays: DisplayInfo[]): Layout[] {
  const primary = displays.find((d) => d.primary) ?? displays[0];
  if (!primary) return [];
  const area = primary.workArea;
  const now = Date.now();
  return [
    {
      id: 'layout-4-grid',
      name: '4 tables',
      kind: 'grid',
      displayId: primary.id,
      slots: autoGridSlots({ area, count: 4, aspect: 4 / 3, gap: 0, padding: 0 }),
      overflow: 'cascade',
      aspectRatio: null,
      createdAt: now,
    },
    {
      id: 'layout-6-grid',
      name: '6 tables',
      kind: 'grid',
      displayId: primary.id,
      slots: autoGridSlots({ area, count: 6, aspect: 4 / 3, gap: 0, padding: 0 }),
      overflow: 'cascade',
      aspectRatio: null,
      createdAt: now,
    },
    {
      id: 'layout-9-grid',
      name: '9 tables',
      kind: 'grid',
      displayId: primary.id,
      slots: autoGridSlots({ area, count: 9, aspect: 4 / 3, gap: 0, padding: 0 }),
      overflow: 'cascade',
      aspectRatio: null,
      createdAt: now,
    },
  ];
}

export function defaultConfig(displays: DisplayInfo[]): AppConfig {
  const layouts = defaultLayouts(displays);
  return {
    version: CONFIG_VERSION,
    activeLayoutId: layouts[0]?.id ?? null,
    layouts,
    profiles: BUILTIN_PROFILES.map((p) => ({ ...p })),
    hotkeys: { ...DEFAULT_HOTKEYS },
    autoArrange: true,
    enforceLayout: false,
    pollIntervalMs: 750,
    strategy: 'fill',
    focusOnPlace: false,
    tuckLobby: false,
    backend: 'auto',
    startMinimized: false,
  };
}

/**
 * Merge a config read from disk onto the defaults.
 *
 * Written defensively on purpose: this file is hand-editable, and a user who
 * breaks a regex or deletes a key should get a working app back, not a crash
 * loop on startup.
 */
export function normalizeConfig(raw: unknown, displays: DisplayInfo[]): AppConfig {
  const base = defaultConfig(displays);
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<AppConfig>;

  const layouts = Array.isArray(input.layouts) ? input.layouts.filter(isLayout) : base.layouts;
  const profiles = mergeProfiles(Array.isArray(input.profiles) ? input.profiles : []);

  const activeLayoutId =
    typeof input.activeLayoutId === 'string' && layouts.some((l) => l.id === input.activeLayoutId)
      ? input.activeLayoutId
      : layouts[0]?.id ?? null;

  return {
    version: CONFIG_VERSION,
    activeLayoutId,
    layouts: layouts.length > 0 ? layouts : base.layouts,
    profiles,
    hotkeys: { ...DEFAULT_HOTKEYS, ...(input.hotkeys ?? {}) },
    autoArrange: input.autoArrange ?? base.autoArrange,
    enforceLayout: input.enforceLayout ?? base.enforceLayout,
    // Anything under ~200ms burns CPU for no benefit; anything over 5s feels broken.
    pollIntervalMs: clamp(input.pollIntervalMs ?? base.pollIntervalMs, 200, 5000),
    strategy: input.strategy === 'nearest' ? 'nearest' : 'fill',
    focusOnPlace: input.focusOnPlace ?? base.focusOnPlace,
    tuckLobby: input.tuckLobby ?? base.tuckLobby,
    backend: input.backend === 'mock' || input.backend === 'win32' ? input.backend : 'auto',
    startMinimized: input.startMinimized ?? base.startMinimized,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isLayout(value: unknown): value is Layout {
  if (!value || typeof value !== 'object') return false;
  const l = value as Layout;
  return typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.slots);
}

/** Keep user edits to built-in profiles, and keep any profile they invented. */
function mergeProfiles(saved: SiteProfile[]): SiteProfile[] {
  const byId = new Map(saved.filter((p) => p && typeof p.id === 'string').map((p) => [p.id, p]));
  const merged: SiteProfile[] = BUILTIN_PROFILES.map((builtin) => {
    const user = byId.get(builtin.id);
    byId.delete(builtin.id);
    return user ? { ...builtin, ...user, id: builtin.id } : { ...builtin };
  });
  for (const custom of byId.values()) merged.push(custom);
  return merged;
}

export class ConfigStore {
  private config: AppConfig;

  constructor(private readonly file: string, displays: DisplayInfo[]) {
    this.config = this.read(displays);
  }

  private read(displays: DisplayInfo[]): AppConfig {
    try {
      if (existsSync(this.file)) {
        return normalizeConfig(JSON.parse(readFileSync(this.file, 'utf8')), displays);
      }
    } catch (error) {
      console.error('[tablelab] config unreadable, falling back to defaults:', error);
    }
    return defaultConfig(displays);
  }

  get(): AppConfig {
    return this.config;
  }

  update(patch: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...patch, version: CONFIG_VERSION };
    this.persist();
    return this.config;
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      // Write-then-rename: a crash mid-write must not leave a truncated config.
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.config, null, 2), 'utf8');
      renameSync(tmp, this.file);
    } catch (error) {
      console.error('[tablelab] could not save config:', error);
    }
  }
}

export function configPath(userDataDir: string): string {
  return join(userDataDir, 'config.json');
}
