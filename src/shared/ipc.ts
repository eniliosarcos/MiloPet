/**
 * El contrato entre el proceso main de Electron y el renderer de Angular.
 *
 * Este archivo se compila dos veces: una dentro de la app de Angular y otra
 * dentro del build de Electron (ver tsconfig.electron.json). Por eso debe
 * quedarse sin dependencias y contener solo tipos y constantes simples.
 */

/** Nombres de los canales IPC. Fuente única de verdad: un error de tipeo no compila. */
export const CHANNELS = {
  /** main -> renderer: se pulsó el atajo global de push-to-talk. */
  hotkey: 'milo:hotkey',
  /** main -> renderer: no se pudo registrar el atajo pedido. */
  hotkeyFailed: 'milo:hotkey-failed',
  /** renderer -> main: permite o bloquea los eventos de ratón en la ventana. */
  setInteractive: 'milo:set-interactive',
  /** renderer -> main: pide la configuración guardada. */
  getConfig: 'milo:get-config',
  /** renderer -> main: guarda un atajo nuevo y lo vuelve a registrar. */
  setHotkey: 'milo:set-hotkey',
  /** renderer -> main: informa el estado actual (se usa para trazas y logs). */
  state: 'milo:state',
  /** renderer -> main: cierra la aplicación. */
  quit: 'milo:quit',
} as const;

/** Qué está haciendo Milo en este momento. Mueve la animación y la burbuja. */
export type MascotState = 'idle' | 'listening' | 'thinking' | 'acting' | 'error';

/** Ajustes que se guardan en `app.getPath('userData')/config.json`. */
export interface MiloConfig {
  hotkey: string;
}

/**
 * Resultado de registrar un atajo global. `register()` devuelve false cuando
 * otro proceso ya tiene esa combinación, que es la causa más común del reporte
 * "el asistente no hace nada".
 */
export interface HotkeyRegistration {
  ok: boolean;
  accelerator: string;
  reason?: 'already-taken' | 'invalid';
}

/** La superficie que el preload expone al renderer. */
export interface MiloBridge {
  /** Se suscribe a las pulsaciones del atajo. Devuelve la función para desuscribirse. */
  onHotkey(handler: () => void): () => void;

  /** Se suscribe a los fallos de registro del atajo. */
  onHotkeyFailed(handler: (failure: HotkeyRegistration) => void): () => void;

  /**
   * Con false, los eventos de ratón atraviesan la ventana hacia lo que hay
   * detrás. Evita que el personaje se robe los clics del trabajo real.
   */
  setInteractive(interactive: boolean): void;

  getConfig(): Promise<MiloConfig>;
  setHotkey(accelerator: string): Promise<HotkeyRegistration>;

  setState(state: MascotState): void;

  quit(): void;
}

/** Atajo por defecto. Elegido para no chocar con apps comunes de Windows. */
export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';
