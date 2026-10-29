/**
 * Detección de voz por energía (VAD), sin Web Audio ni temporizadores.
 *
 * Es la pieza que decide cuándo termina una frase. No es un adorno: el
 * `globalShortcut` de Electron no emite el evento de tecla soltada, así que no
 * existe push-to-talk (decisión 5 de `docs/ARQUITECTURA.md`). Se pulsa una vez y
 * el VAD es el botón de parar.
 *
 * Entra el nivel de un frame y sale una señal; quién mide ese nivel y con qué
 * reloj vive fuera, en `capture.ts`. Así esta clase se prueba con números: en CI
 * no hay micrófono.
 */

export interface VadConfig {
  /** Nivel RMS (0..1) por debajo del cual un frame cuenta como silencio. */
  threshold: number;
  /** ms de voz seguidos para dar la frase por empezada. */
  onsetMs: number;
  /** ms de silencio seguidos para darla por terminada. */
  hangoverMs: number;
  /** Tope de una frase ya empezada: más allá, algo se quedó abierto. */
  maxSpeechMs: number;
  /** Tope sin oír nada: pulsaste el atajo y no hablaste. */
  maxWaitMs: number;
  /** Duración de cada frame. El VAD cuenta con ella, no con el reloj real. */
  frameMs: number;
}

/**
 * Lo que el VAD le cuenta a quien lo alimenta.
 *
 * `open` y `close` son aristas, no estados: se emiten una sola vez.
 */
export type VadSignal = 'none' | 'open' | 'close';

export class Vad {
  private phase: 'waiting' | 'speaking' | 'closed' = 'waiting';
  /** Tiempo total desde el primer frame, para el tope de espera. */
  private waitedMs = 0;
  /** Voz seguida mientras espera; se reinicia con cualquier silencio. */
  private onsetRunMs = 0;
  /** Silencio seguido mientras habla; se reinicia con cualquier voz. */
  private silenceRunMs = 0;
  /** Tiempo desde que la frase empezó, para el tope de duración. */
  private spokenMs = 0;
  /** Se enciende al abrir la frase: es lo que distingue "nada" de "ya hablaste". */
  private voiced = false;

  constructor(private readonly config: VadConfig) {}

  /**
   * ¿Se llegó a oír algo? Es la pregunta que importa al cerrar: distinguir "no
   * dijiste nada" de "dijiste algo y ya terminaste". No se puede deducir del
   * estado, porque cerrar por espera y cerrar por silencio acaban en el mismo.
   */
  get heardSpeech(): boolean {
    return this.voiced;
  }

  /** Alimenta un frame. Devuelve la arista si este frame la cruzó. */
  push(level: number): VadSignal {
    if (this.phase === 'closed') return 'none';

    const { threshold, onsetMs, hangoverMs, maxSpeechMs, maxWaitMs, frameMs } = this.config;
    const voiced = level >= threshold;
    this.waitedMs += frameMs;

    if (this.phase === 'waiting') {
      this.onsetRunMs = voiced ? this.onsetRunMs + frameMs : 0;

      // La voz tiene que aguantar varios frames: un clic o un golpe de teclado
      // dura uno y no debe abrir una frase.
      if (this.onsetRunMs >= onsetMs) {
        this.phase = 'speaking';
        this.voiced = true;
        this.silenceRunMs = 0;
        return 'open';
      }

      if (this.waitedMs >= maxWaitMs) {
        this.phase = 'closed';
        return 'close';
      }

      return 'none';
    }

    this.spokenMs += frameMs;
    this.silenceRunMs = voiced ? 0 : this.silenceRunMs + frameMs;

    // Dos finales distintos: el silencio natural o el tope de seguridad.
    if (this.silenceRunMs >= hangoverMs || this.spokenMs >= maxSpeechMs) {
      this.phase = 'closed';
      return 'close';
    }

    return 'none';
  }
}

/**
 * Cuánto tiene que destacar la voz sobre el ruido de fondo.
 *
 * Tres veces es el punto de partida, no una ley: con un ventilador o un teclado
 * mecánico el suelo sube y el umbral sube con él. Los topes evitan los dos
 * extremos: un micro muy limpio que dispara con la respiración (suelo) y una
 * sala ruidosa donde nadie hablaría lo bastante fuerte (techo).
 */
const FLOOR_MULTIPLIER = 3;
const MIN_THRESHOLD = 0.012;
const MAX_THRESHOLD = 0.12;

/**
 * Mediana de los frames de calibración.
 *
 * Mediana y no media: un golpe de teclado durante los primeros 300 ms sube la
 * media y dejaría el umbral alto para toda la frase. Es también robusta a un
 * frame perdido.
 */
export function medianLevel(levels: readonly number[]): number {
  if (levels.length === 0) return 0;

  const sorted = [...levels].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Umbral de voz a partir del ruido de fondo medido, acotado por los dos lados. */
export function thresholdForFloor(floor: number): number {
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, floor * FLOOR_MULTIPLIER));
}
