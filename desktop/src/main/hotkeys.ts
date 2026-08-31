import { globalShortcut } from 'electron';
import type { HotkeyAction, HotkeyStatus } from '../shared/ipc';

export type HotkeyHandlers = Partial<Record<HotkeyAction, () => void>>;

/**
 * Global hotkeys.
 *
 * Registration is per-accelerator and can fail — another app may already own
 * the combination — so we keep the outcome of every attempt and surface it in
 * the UI. A silently dead hotkey is worse than no hotkey.
 */
export class HotkeyManager {
  private status: HotkeyStatus[] = [];

  constructor(private readonly handlers: HotkeyHandlers) {}

  apply(bindings: Partial<Record<HotkeyAction, string>>): HotkeyStatus[] {
    globalShortcut.unregisterAll();
    this.status = [];

    for (const [action, accelerator] of Object.entries(bindings) as [HotkeyAction, string][]) {
      const handler = this.handlers[action];
      if (!accelerator || !handler) continue;
      try {
        const ok = globalShortcut.register(accelerator, handler);
        this.status.push({
          action,
          accelerator,
          registered: ok,
          error: ok ? undefined : 'Already taken by another application.',
        });
      } catch (error) {
        this.status.push({ action, accelerator, registered: false, error: (error as Error).message });
      }
    }
    return this.status;
  }

  getStatus(): HotkeyStatus[] {
    return this.status;
  }

  dispose(): void {
    globalShortcut.unregisterAll();
  }
}
