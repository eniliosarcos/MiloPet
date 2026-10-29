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
  /** renderer -> main: empieza un arrastre; el main fija el punto de origen. */
  dragStart: 'milo:drag-start',
  /** renderer -> main: ha habido movimiento; el main relee el cursor y mueve. */
  dragMove: 'milo:drag-move',
  /** renderer -> main: fin del arrastre; el main guarda la posición. */
  dragEnd: 'milo:drag-end',
  /** renderer -> main: informa el estado actual (se usa para trazas y logs). */
  state: 'milo:state',
  /** renderer -> main: transcribe el audio de una frase (respuesta asíncrona). */
  transcribe: 'milo:transcribe',
  /** renderer -> main: ¿hay clave de voz guardada? */
  getSttStatus: 'milo:stt-status',
  /** renderer -> main: valida y guarda la clave del proveedor de voz. */
  setSttKey: 'milo:set-stt-key',
  /** renderer -> main: borra la clave guardada. */
  clearSttKey: 'milo:clear-stt-key',
  /** renderer -> main: abre la ventana de ajustes. */
  openSettings: 'milo:open-settings',
  /** renderer -> main: cierra la aplicación. */
  quit: 'milo:quit',
} as const;

/** Qué está haciendo Milo en este momento. Mueve la animación y la burbuja. */
export type MascotState = 'idle' | 'listening' | 'thinking' | 'acting' | 'error';

/** Ajustes que se guardan en `app.getPath('userData')/config.json`. */
export interface MiloConfig {
  hotkey: string;
  /**
   * Última posición de la ventana, en coordenadas de pantalla. La escribe el
   * proceso main al soltar el arrastre; el renderer solo la recibe de vuelta.
   */
  position?: { x: number; y: number };
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

/**
 * Proveedores de voz a texto.
 *
 * Hoy hay uno. La unión existe para que añadir otro no obligue a adivinar de
 * dónde salió la clave guardada.
 */
export type SttProvider = 'groq';

/**
 * Estado de la clave del proveedor de voz.
 *
 * El renderer nunca recibe la clave, solo si está puesta: para la ventana de
 * ajustes basta con saber si hay que pedirla.
 */
export interface SttStatus {
  configured: boolean;
  provider: SttProvider | null;
}

/** Los motivos por los que una transcripción puede fallar, ya clasificados. */
export type SttFailure = 'no-key' | 'auth' | 'quota' | 'network' | 'audio' | 'unknown';

/**
 * Audio de una frase listo para transcribir.
 *
 * Se manda como muestras y no como archivo a propósito: el contenedor (WAV) lo
 * decide el proceso main, que es quien habla con el proveedor.
 */
export interface SpeechClip {
  /** Muestras mono normalizadas a -1..1. */
  pcm: Float32Array;
  /** Frecuencia real de captura; no se remuestrea. */
  sampleRate: number;
}

/** Resultado de una transcripción. El fallo viaja, no se lanza. */
export type TranscribeResult = { ok: true; text: string } | { ok: false; failure: SttFailure };

/** Resultado de guardar una clave: valida antes de aceptarla. */
export type SetKeyResult = { ok: true; status: SttStatus } | { ok: false; failure: SttFailure };

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

  /**
   * Arrastre de la ventana. El renderer solo avisa de que el gesto empieza,
   * avanza y termina: no manda coordenadas.
   *
   * La geometría vive en el proceso main a propósito. `clientX` es relativo a
   * una ventana que se está moviendo (se realimenta y tiembla), así que el main
   * lee `screen.getCursorScreenPoint()` y mueve con un delta desde el origen.
   * Ambos extremos hablan en DIP, la unidad de las ventanas de Electron, y por
   * eso no hay `scaleFactor` que aplicar.
   */
  startDrag(): void;
  moveDrag(): void;
  endDrag(): void;

  setState(state: MascotState): void;

  /**
   * Transcribe el audio de una frase.
   *
   * El renderer manda muestras, no un archivo, y el proceso main decide el
   * contenedor y el proveedor. Un fallo llega como `{ ok: false }` en vez de
   * como excepción: el bucle necesita distinguir "sin clave" de "sin red" para
   * poder decírselo al usuario.
   */
  transcribe(clip: SpeechClip): Promise<TranscribeResult>;

  /** ¿Hay una clave de voz guardada? Nunca devuelve la clave. */
  getSttStatus(): Promise<SttStatus>;

  /** Valida la clave contra el proveedor y solo la guarda si responde. */
  setSttKey(key: string): Promise<SetKeyResult>;

  /** Borra la clave guardada. No toca nada más. */
  clearSttKey(): Promise<SttStatus>;

  /** Abre (o enfoca) la ventana de ajustes. */
  openSettings(): void;

  quit(): void;
}

/** Atajo por defecto. Elegido para no chocar con apps comunes de Windows. */
export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space';
