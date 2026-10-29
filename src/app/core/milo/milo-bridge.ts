import { InjectionToken } from '@angular/core';

import {
  DEFAULT_HOTKEY,
  type HotkeyRegistration,
  type MiloBridge,
  type MiloConfig,
} from '../../../shared/ipc';

/**
 * Fallback used when the app runs in a plain browser (`ng serve` in Chrome).
 *
 * This is not a luxury: it lets you iterate on the mascot design and the state
 * machine with full HMR, without booting Electron on every tweak.
 */
function createBrowserBridge(): MiloBridge {
  const hotkeyHandlers = new Set<() => void>();
  const failureHandlers = new Set<(failure: HotkeyRegistration) => void>();
  let config: MiloConfig = { hotkey: DEFAULT_HOTKEY };

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === 'Space') {
      event.preventDefault();
      hotkeyHandlers.forEach((handler) => handler());
    }
  });

  return {
    onHotkey(handler) {
      hotkeyHandlers.add(handler);
      return () => {
        hotkeyHandlers.delete(handler);
      };
    },
    onHotkeyFailed(handler) {
      failureHandlers.add(handler);
      return () => {
        failureHandlers.delete(handler);
      };
    },
    setInteractive() {
      // No window to make click-through in a browser.
    },
    async getConfig() {
      return config;
    },
    async setHotkey(accelerator) {
      config = { ...config, hotkey: accelerator };
      return { ok: true, accelerator };
    },
    setState() {
      // Nothing to report to in a browser.
    },
    quit() {
      // No app to quit in a browser.
    },
  };
}

/** The bridge exposed by the Electron preload, or a browser stand-in. */
export const MILO = new InjectionToken<MiloBridge>('MILO', {
  providedIn: 'root',
  factory: () => (window as Window & { milo?: MiloBridge }).milo ?? createBrowserBridge(),
});
