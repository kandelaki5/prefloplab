import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { autoGridSlots, cascadeSlots, gridSlots, reindex, stackSlots } from '../core/layout';
import { fitAspect } from '../core/geometry';
import type { DisplayInfo, Layout } from '../core/types';
import type { AppConfig, BuildLayoutRequest, ManagerState } from '../shared/ipc';
import { IPC } from '../shared/ipc';
import { ConfigStore, configPath } from './config';
import { HotkeyManager } from './hotkeys';
import { TableManager } from './manager';
import { createBackend, MockBackend } from './platform';


let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: ConfigStore;
let manager: TableManager;
let hotkeys: HotkeyManager;
let quitting = false;

/** Electron reports DIP; the rest of the app works in physical pixels. */
function electronDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, index) => ({
    id: String(d.id),
    label: d.label || (d.id === primaryId ? 'Primary display' : `Display ${index + 1}`),
    bounds: scaleRect(d.bounds, d.scaleFactor),
    workArea: scaleRect(d.workArea, d.scaleFactor),
    scaleFactor: d.scaleFactor,
    primary: d.id === primaryId,
  }));
}

function scaleRect(r: { x: number; y: number; width: number; height: number }, scale: number) {
  return {
    x: Math.round(r.x * scale),
    y: Math.round(r.y * scale),
    width: Math.round(r.width * scale),
    height: Math.round(r.height * scale),
  };
}

function pushState(state: ManagerState): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.stateEvent, state);
  }
}

/** Turn a "give me a 6-table grid" request into concrete slots. */
function buildLayout(request: BuildLayoutRequest, displays: DisplayInfo[]): Layout {
  const display =
    displays.find((d) => d.id === request.displayId) ?? displays.find((d) => d.primary) ?? displays[0];
  if (!display) throw new Error('No display available to build a layout on.');

  const area = request.useWorkArea === false ? display.bounds : display.workArea;
  const gap = request.gap ?? 0;
  const padding = request.padding ?? 0;
  const aspect = request.aspectRatio ?? null;
  const count = Math.max(1, request.count ?? 4);

  let slots;
  if (request.kind === 'stack') {
    const size = request.size ?? sizeFor(area, aspect, 0.6);
    slots = stackSlots(area, size);
  } else if (request.kind === 'cascade') {
    const size = request.size ?? sizeFor(area, aspect, 0.45);
    slots = cascadeSlots(area, { count, size, padding });
  } else if (request.rows && request.cols) {
    slots = gridSlots(area, {
      rows: request.rows,
      cols: request.cols,
      gap,
      padding,
      order: request.order ?? 'row',
    });
  } else {
    slots = autoGridSlots({ area, count, aspect, gap, padding, order: request.order ?? 'row' });
  }

  return {
    id: `layout-${Date.now().toString(36)}`,
    name: request.name || 'Untitled layout',
    kind: request.kind,
    displayId: display.id,
    slots: reindex(slots),
    overflow: 'cascade',
    aspectRatio: aspect,
    createdAt: Date.now(),
  };
}

function sizeFor(area: { width: number; height: number }, aspect: number | null, fraction: number) {
  const box = { x: 0, y: 0, width: area.width * fraction, height: area.height * fraction };
  const fitted = aspect ? fitAspect(box, aspect) : box;
  return { width: Math.round(fitted.width), height: Math.round(fitted.height) };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: '#0d1311',
    title: 'TableLab',
    icon: iconPath() ?? undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!store.get().startMinimized) mainWindow?.show();
    // Opt-in rather than automatic: devtools stealing focus on every launch is
    // the last thing you want while testing window placement.
    if (process.env.TABLELAB_DEVTOOLS === '1') mainWindow?.webContents.openDevTools({ mode: 'detach' });
  });

  // Closing the window parks the app in the tray: a table manager you have to
  // keep on screen is a table manager in the way.
  mainWindow.on('close', (event) => {
    if (quitting || !tray) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function iconPath(): string | null {
  const candidate = join(__dirname, '../../assets/icon.png');
  return existsSync(candidate) ? candidate : null;
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  const file = iconPath();
  if (!file) return;
  try {
    const image = nativeImage.createFromPath(file).resize({ width: 16, height: 16 });
    tray = new Tray(image);
    tray.setToolTip('TableLab — poker table manager');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show TableLab', click: showWindow },
        { label: 'Arrange tables now', click: () => manager.arrangeNow(true) },
        { label: 'Next layout', click: () => manager.cycleLayout() },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on('double-click', showWindow);
  } catch (error) {
    console.error('[tablelab] tray unavailable:', error);
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getConfig, () => store.get());

  ipcMain.handle(IPC.saveConfig, (_event, patch: Partial<AppConfig>) => {
    const before = store.get();
    const config = store.update(patch);
    if (patch.hotkeys) hotkeys.apply(config.hotkeys);
    if (patch.pollIntervalMs && patch.pollIntervalMs !== before.pollIntervalMs) manager.start();
    if (patch.backend && patch.backend !== before.backend) {
      manager.setBackend(createBackend(config.backend, { displays: electronDisplays() }));
    }
    if (patch.profiles || patch.strategy) manager.scan();
    if (patch.autoArrange && !before.autoArrange) manager.arrangeNow(true);
    return config;
  });

  ipcMain.handle(IPC.getState, () => manager.getState());
  ipcMain.handle(IPC.getHotkeyStatus, () => hotkeys.getStatus());

  ipcMain.handle(IPC.saveLayout, (_event, layout: Layout) => {
    const config = store.get();
    const layouts = config.layouts.some((l) => l.id === layout.id)
      ? config.layouts.map((l) => (l.id === layout.id ? layout : l))
      : [...config.layouts, layout];
    const next = store.update({ layouts, activeLayoutId: layout.id });
    manager.onLayoutChanged();
    return next;
  });

  ipcMain.handle(IPC.deleteLayout, (_event, layoutId: string) => {
    const config = store.get();
    const layouts = config.layouts.filter((l) => l.id !== layoutId);
    const activeLayoutId = config.activeLayoutId === layoutId ? layouts[0]?.id ?? null : config.activeLayoutId;
    const next = store.update({ layouts, activeLayoutId });
    manager.onLayoutChanged();
    return next;
  });

  ipcMain.handle(IPC.setActiveLayout, (_event, layoutId: string) => {
    const next = store.update({ activeLayoutId: layoutId });
    manager.onLayoutChanged();
    return next;
  });

  ipcMain.handle(IPC.buildLayout, (_event, request: BuildLayoutRequest) =>
    buildLayout(request, manager.getBackend().listDisplays()),
  );

  ipcMain.handle(IPC.arrangeNow, (_event, force?: boolean) => manager.arrangeNow(force ?? true));
  ipcMain.handle(IPC.focusTable, (_event, windowId: string) => manager.focusTable(windowId));
  ipcMain.handle(IPC.cycleTable, (_event, direction: 1 | -1) => manager.cycleTable(direction));
  ipcMain.handle(IPC.assignTableToSlot, (_event, windowId: string, slotId: string) =>
    manager.assignTableToSlot(windowId, slotId),
  );
  ipcMain.handle(IPC.releaseTable, (_event, windowId: string) => manager.releaseTable(windowId));
  ipcMain.handle(IPC.rotateTables, (_event, direction: 1 | -1) => manager.rotateTables(direction));

  ipcMain.handle(IPC.mock, (_event, action: string, siteId?: string) => {
    const backend = manager.getBackend();
    if (!(backend instanceof MockBackend)) return;
    if (action === 'spawnTable') backend.spawnTable(siteId);
    else if (action === 'spawnLobby') backend.spawnLobby(siteId ?? 'pokerstars');
    else if (action === 'closeAll') backend.closeAllTables();
    else if (action === 'churn') backend.churnTitles();
    manager.scan();
  });
}

function bootstrap(): void {
  const displays = electronDisplays();
  store = new ConfigStore(configPath(app.getPath('userData')), displays);
  const backend = createBackend(store.get().backend, { displays });
  manager = new TableManager(backend, store, { onState: pushState });

  hotkeys = new HotkeyManager({
    arrange: () => manager.arrangeNow(true),
    cycleLayout: () => manager.cycleLayout(),
    nextTable: () => manager.cycleTable(1),
    prevTable: () => manager.cycleTable(-1),
    rotate: () => manager.rotateTables(1),
    toggleAuto: () => manager.toggleAutoArrange(),
    showManager: showWindow,
  });

  registerIpc();
  createWindow();
  createTray();
  hotkeys.apply(store.get().hotkeys);
  manager.start();

  // Monitors get plugged in mid-session; layouts authored on a display that
  // came back should start working again without a restart.
  screen.on('display-added', () => manager.scan());
  screen.on('display-removed', () => manager.scan());
  screen.on('display-metrics-changed', () => manager.scan());
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(bootstrap);

  app.on('window-all-closed', () => {
    // Keep running in the tray on Windows; on macOS/Linux without a tray, quit.
    if (!tray) app.quit();
  });

  app.on('activate', showWindow);

  app.on('before-quit', () => {
    quitting = true;
    manager?.stop();
    hotkeys?.dispose();
  });
}
