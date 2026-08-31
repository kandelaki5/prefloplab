import { contextBridge, ipcRenderer } from 'electron';
import type { Api, AppConfig, BuildLayoutRequest, ManagerState } from '../shared/ipc';
import { IPC } from '../shared/ipc';
import type { Layout } from '../core/types';

/**
 * The renderer gets this object and nothing else: no Node, no ipcRenderer, no
 * remote module. Context isolation stays on.
 */
const api: Api = {
  getConfig: () => ipcRenderer.invoke(IPC.getConfig),
  saveConfig: (patch: Partial<AppConfig>) => ipcRenderer.invoke(IPC.saveConfig, patch),
  getState: () => ipcRenderer.invoke(IPC.getState),
  getHotkeyStatus: () => ipcRenderer.invoke(IPC.getHotkeyStatus),

  saveLayout: (layout: Layout) => ipcRenderer.invoke(IPC.saveLayout, layout),
  deleteLayout: (layoutId: string) => ipcRenderer.invoke(IPC.deleteLayout, layoutId),
  setActiveLayout: (layoutId: string) => ipcRenderer.invoke(IPC.setActiveLayout, layoutId),
  buildLayout: (request: BuildLayoutRequest) => ipcRenderer.invoke(IPC.buildLayout, request),

  arrangeNow: (force?: boolean) => ipcRenderer.invoke(IPC.arrangeNow, force),
  focusTable: (windowId: string) => ipcRenderer.invoke(IPC.focusTable, windowId),
  cycleTable: (direction: 1 | -1) => ipcRenderer.invoke(IPC.cycleTable, direction),
  assignTableToSlot: (windowId: string, slotId: string) => ipcRenderer.invoke(IPC.assignTableToSlot, windowId, slotId),
  releaseTable: (windowId: string) => ipcRenderer.invoke(IPC.releaseTable, windowId),
  rotateTables: (direction: 1 | -1) => ipcRenderer.invoke(IPC.rotateTables, direction),

  mock: (action, siteId?: string) => ipcRenderer.invoke(IPC.mock, action, siteId),

  onState: (listener: (state: ManagerState) => void) => {
    const wrapped = (_event: unknown, state: ManagerState) => listener(state);
    ipcRenderer.on(IPC.stateEvent, wrapped);
    return () => ipcRenderer.removeListener(IPC.stateEvent, wrapped);
  },
};

contextBridge.exposeInMainWorld('tablelab', api);
