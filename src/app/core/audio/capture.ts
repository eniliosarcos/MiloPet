import { InjectionToken } from '@angular/core';

import { Vad, medianLevel, thresholdForFloor } from './vad';

/**
 * Captura de micrófono con detección de voz.
 *
 * Vive en el renderer a propósito: Chromium ya trae cancelación de eco,
 * supresión de ruido y ganancia automática, y el grafo de audio está aquí. En el
 * proceso main habría que meter dependencias nativas para lo mismo.
 *
 * La captura no guarda audio todavía: solo mide energía para saber cuándo
 * empieza y cuándo acaba la frase. El PCM viajará al main el día que exista el
 * STT, y ese día se añade un `MediaStreamAudioSourceNode` más, no otra captura.
 */

/** Duración de cada frame de análisis. 50 ms son 20 medidas por segundo. */
const FRAME_MS = 50;

/**
 * Frames de calibración antes de decidir el umbral: 300 ms.
 *
 * Se miden al abrir el micro, no al arrancar la app: el ruido de fondo cambia
 * con la habitación y con el ventilador del portátil.
 */
const CALIBRATION_FRAMES = 6;

/** Voz seguida para abrir la frase. Tres frames: un clic dura uno. */
const ONSET_MS = 150;

/** Silencio seguido para cerrarla. Es la pausa que se toma al terminar de hablar. */
const HANGOVER_MS = 800;

/** Tope de una frase: 15 s cubren de sobra una orden dictada. */
const MAX_SPEECH_MS = 15_000;

/** Tope sin hablar: pulsaste el atajo y te fuiste. */
const MAX_WAIT_MS = 6_000;

export interface CaptureResult {
  /** Si llegó a haber voz. Sin voz no hay nada que transcribir ni que responder. */
  readonly heardSpeech: boolean;
  /** Cuánto duró la captura completa, para trazas y para medir el VAD real. */
  readonly durationMs: number;
}

/** Lo que el bucle de interacción necesita del micrófono. */
export interface VoiceCapture {
  /**
   * Abre el micro y resuelve cuando el VAD cierra la frase (o cuando se agota
   * el tope). Rechaza si no hay permiso o no hay dispositivo.
   */
  listen(): Promise<CaptureResult>;
  /** Suelta el micrófono. Idempotente: se llama al terminar y al destruir. */
  dispose(): void;
}

/**
 * Fallo de micrófono con un mensaje ya escrito para la burbuja.
 *
 * El mensaje se escribe aquí y no en el bucle porque depende del error real:
 * "no hay permiso" y "no hay micrófono" se arreglan de forma distinta.
 */
export class MicrophoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MicrophoneError';
  }
}

export class MicrophoneCapture implements VoiceCapture {
  /** Cancelación de la escucha en curso, para poder soltar el micro desde fuera. */
  private cancel: (() => void) | null = null;

  async listen(): Promise<CaptureResult> {
    // Una escucha nueva manda: si la anterior seguía abierta, se cierra antes de
    // pedir el micro. Dos peticiones simultáneas dejan el dispositivo bloqueado.
    this.dispose();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicrophoneError('Este entorno no me da acceso al micrófono.');
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      throw describeFailure(error);
    }

    const context = new AudioContext();
    // Por política de autoplay el contexto puede nacer suspendido. En Electron
    // no suele pasar, pero un `resume()` fallido dejaría el VAD leyendo ceros.
    await context.resume();

    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    const calibration: number[] = [];
    const startedAt = performance.now();
    let vad: Vad | null = null;
    let done = false;

    return new Promise<CaptureResult>((resolve) => {
      /** Nulo mientras no hay latido: `dispose()` antes del primer frame no rompe. */
      let timer: ReturnType<typeof setInterval> | null = null;

      const release = (): void => {
        if (timer !== null) clearInterval(timer);
        timer = null;
        // Sin `stop()` la pista sigue viva y Windows mantiene el icono de micro
        // encendido: parece que Milo escucha para siempre.
        for (const track of stream.getTracks()) track.stop();
        void context.close();
        if (this.cancel === cancel) this.cancel = null;
      };

      const finish = (heardSpeech: boolean): void => {
        if (done) return;
        done = true;
        release();
        resolve({ heardSpeech, durationMs: Math.round(performance.now() - startedAt) });
      };

      const cancel = (): void => finish(false);
      this.cancel = cancel;

      timer = setInterval(() => {
        const level = rms(analyser, samples);

        if (!vad) {
          calibration.push(level);
          // Mientras calibra no se juzga: el umbral todavía no existe.
          if (calibration.length < CALIBRATION_FRAMES) return;

          vad = new Vad({
            threshold: thresholdForFloor(medianLevel(calibration)),
            onsetMs: ONSET_MS,
            hangoverMs: HANGOVER_MS,
            maxSpeechMs: MAX_SPEECH_MS,
            maxWaitMs: MAX_WAIT_MS,
            frameMs: FRAME_MS,
          });
        }

        const signal = vad.push(level);
        if (signal === 'close') finish(vad.heardSpeech);
      }, FRAME_MS);
    });
  }

  dispose(): void {
    this.cancel?.();
  }
}

/**
 * `setInterval` y no `requestAnimationFrame`: el VAD tiene que seguir latiendo
 * cuando la ventana está tapada por otra aplicación, y ahí el rAF se detiene.
 * La ventana lleva `backgroundThrottling: false` por el mismo motivo.
 */
function rms(analyser: AnalyserNode, samples: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(samples);

  let sum = 0;
  for (const sample of samples) {
    // Los bytes vienen centrados en 128; se normalizan a -1..1 antes de elevar.
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }

  return Math.sqrt(sum / samples.length);
}

/** Traduce el error del navegador a algo que el usuario pueda accionar. */
function describeFailure(error: unknown): MicrophoneError {
  const name = error instanceof DOMException ? error.name : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new MicrophoneError('No tengo permiso para usar el micrófono.');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new MicrophoneError('No encuentro ningún micrófono conectado.');
  }
  if (name === 'NotReadableError') {
    return new MicrophoneError('Otro programa está usando el micrófono.');
  }

  return new MicrophoneError('No pude abrir el micrófono.');
}

/**
 * Punto de inyección de la captura.
 *
 * Es un token y no la clase directamente para que los tests puedan sustituir el
 * micrófono por uno de mentira: en CI no hay dispositivo y `getUserMedia` no
 * existe en jsdom.
 */
export const VOICE = new InjectionToken<VoiceCapture>('VOICE', {
  providedIn: 'root',
  factory: () => new MicrophoneCapture(),
});
