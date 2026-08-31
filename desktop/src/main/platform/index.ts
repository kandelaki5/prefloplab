import type { DisplayInfo } from '../../core/types';
import { MockBackend } from './mock';
import type { DesktopBackend } from './types';
import { Win32Backend } from './win32';

export type BackendId = 'auto' | 'win32' | 'mock';

export interface CreateBackendOptions {
  /** Displays to seed the mock backend with, normally Electron's screen list. */
  displays?: DisplayInfo[];
}

/**
 * Pick a backend.
 *
 * `auto` (the default) uses the real Windows backend when it loads and falls
 * back to the simulator otherwise, so the app always starts and always tells
 * you which mode it is in rather than silently doing nothing.
 */
export function createBackend(preferred: BackendId = 'auto', options: CreateBackendOptions = {}): DesktopBackend {
  const requested = (process.env.TABLELAB_BACKEND as BackendId | undefined) ?? preferred;

  if (requested === 'mock') return new MockBackend(options.displays);

  const win32 = new Win32Backend();
  if (win32.available) return win32;
  if (requested === 'win32') return win32; // unavailable, but the UI will say why

  const mock = new MockBackend(options.displays);
  return mock;
}

export { MockBackend, Win32Backend };
export type { DesktopBackend } from './types';
