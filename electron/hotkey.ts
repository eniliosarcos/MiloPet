import { globalShortcut } from 'electron';

import type { HotkeyRegistration } from '../src/shared/ipc';

type HotkeyHandler = () => void;

/** Atajo registrado actualmente, para poder darlo de baja antes de registrar otro. */
let current: string | null = null;

/**
 * Registra el atajo de push-to-talk.
 *
 * Electron solo devuelve un booleano: `register()` da false tanto si la
 * combinación está mal escrita como si otro proceso ya la tiene. No podemos
 * distinguirlas, así que mostramos el mensaje accionable en ambos casos:
 * "esa combinación no está disponible, elige otra".
 */
export function registerHotkey(accelerator: string, onPress: HotkeyHandler): HotkeyRegistration {
  // Primero liberamos el anterior: si no, registrar el nuevo lo dejaría vivo y
  // dos atajos dispararían la misma interacción.
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
