/**
 * The contract between the Electron main process and the Angular renderer.
 *
 * This file is compiled twice: once inside the Angular app, and once inside the
 * Electron build (see tsconfig.electron.json). It must stay dependency-free and
 * contain nothing but types and plain constants.
 */

/** IPC channel names. Single source of truth, so typos are compile errors. */
export const CHANNELS = {
  /** main -> renderer: the global push-to-talk hotkey was pressed. */
  hotkey: 'milo:hotkey',
  /** main -> renderer: the requested accelerator could not be registered. */
  hotkeyFailed: 'milo:hotkey-failed',
  /** renderer -> main: allow or block mouse events on the mascot window. */
  setInteractive: 'milo:set-interactive',
  /** renderer -> main: reply to the getConfig call. */
  getConfig: 'milo:get-config',
  /** renderer -> main: persist a new hotkey and re-register it. */
  setHotkey: 'milo:set-hotkey',
  /** renderer -> main: report the current mascot state (used for logging). */
  state: 'milo:state',
  /** renderer -> main: quit the app. */
  quit: 'milo:quit',
} as const;

/** What Milo is doing right now. Drives both the animation and the bubble. */
export type MascotState = 'idle' | 'listening' | 'thinking' | 'acting' | 'error';

/** Persisted settings. Lives in `app.getPath('userData')/config.json`. */
export interface MiloConfig {
  hotkey: string;
}

/**
 * Result of registering a global shortcut. `register()` returns false when the
 * accelerator is already owned by another process, which is the single most
 * common cause of "the assistant does nothing" bug reports.
 */
export interface HotkeyRegistration {
  ok: boolean;
  accelerator: string;
  reason?: 'already-taken' | 'invalid';
}

/** The API surface exposed to the renderer through the preload script. */
export interface MiloBridge {
  /** Subscribe to hotkey presses. Returns an unsubscribe function. */
  onHotkey(handler: () => void): () => void;

  /** Subscribe to hotkey registration failures. */
  onHotkeyFailed(handler: (failure: HotkeyRegistration) => void): () => void;

  /**
   * When false, mouse events pass through the window to whatever is behind it.
   * Keeps the mascot from stealing clicks from the user's real work.
   */
  setInteractive(interactive: boolean): void;

  getConfig(): Promise<MiloConfig>;
  setHotkey(accelerator: string): Promise<HotkeyRegistration>;

  setState(state: MascotState): void;

  quit(): void;
}

/** Default accelerator. Chosen to avoid collisions with common Windows apps. */
export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';
