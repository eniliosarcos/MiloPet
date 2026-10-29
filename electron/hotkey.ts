import { globalShortcut } from 'electron';

import type { HotkeyRegistration } from '../src/shared/ipc';

type HotkeyHandler = () => void;

let current: string | null = null;

/**
 * Registers the push-to-talk accelerator.
 *
 * Electron gives us a single boolean: `register()` returns false both when the
 * combination is malformed and when another process already owns it. We can't
 * tell those apart, so we surface the actionable message either way: "that
 * combination is unavailable, pick another one".
 */
export function registerHotkey(accelerator: string, onPress: HotkeyHandler): HotkeyRegistration {
  unregisterHotkey();

  if (!accelerator || !accelerator.includes('+')) {
    return { ok: false, accelerator, reason: 'invalid' };
  }

  const registered = globalShortcut.register(accelerator, onPress);

  if (!registered) {
    return { ok: false, accelerator, reason: 'already-taken' };
  }

  current = accelerator;
  return { ok: true, accelerator };
}

export function unregisterHotkey(): void {
  if (current) {
    globalShortcut.unregister(current);
    current = null;
  }
}

export function disposeHotkeys(): void {
  globalShortcut.unregisterAll();
  current = null;
}
