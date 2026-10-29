import type { SpeechClip, SttFailure, SttProvider } from '../../src/shared/ipc';
import { downsample, pcmToWav, STT_SAMPLE_RATE } from '../../src/shared/audio';

/**
 * Voz a texto, detrás de una interfaz.
 *
 * La interfaz existe para que cambiar de proveedor sea un archivo y no una
 * reescritura: el resto de la app solo conoce `Transcriber` y los fallos
 * clasificados de `SttFailure`.
 */
export interface Transcriber {
  readonly provider: SttProvider;
  /** Devuelve el texto ya recortado. Lanza `TranscriberError` si falla. */
  transcribe(clip: SpeechClip, apiKey: string): Promise<string>;
}

/** Fallo con la clasificación que el renderer sabe convertir en mensaje. */
export class TranscriberError extends Error {
  constructor(
    readonly failure: SttFailure,
    message: string,
  ) {
    super(message);
    this.name = 'TranscriberError';
  }
}

/**
 * Groq: Whisper large v3 turbo por su endpoint compatible con OpenAI.
 *
 * Se eligió por precio ($0,04/hora), por velocidad (216× tiempo real) y porque
 * el formato de la petición es el mismo que el de OpenAI: cambiar de proveedor
 * es cambiar `endpoint` y `model`.
 */
const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';
const MODEL = 'whisper-large-v3-turbo';

/**
 * Idioma fijo por ahora. Dárselo a Whisper baja la latencia y los errores:
 * sin él, el modelo adivina entre 99 idiomas en cada frase corta.
 */
const LANGUAGE = 'es';

/** Una frase de 15 s no tarda esto ni de lejos; si tarda, algo se rompió. */
const TIMEOUT_MS = 20_000;

export class GroqTranscriber implements Transcriber {
  readonly provider = 'groq' as const;

  async transcribe(clip: SpeechClip, apiKey: string): Promise<string> {
    // 16 kHz es lo que usan los modelos de Whisper; mandar 48 kHz solo engorda
    // el archivo. El WAV se construye aquí, en el main, no en el renderer.
    const samples = downsample(clip.pcm, clip.sampleRate, STT_SAMPLE_RATE);
    const wav = pcmToWav(samples, STT_SAMPLE_RATE);

    const form = new FormData();
    form.set('model', MODEL);
    form.set('language', LANGUAGE);
    form.set('response_format', 'json');
    form.set('file', new Blob([wav], { type: 'audio/wav' }), 'frase.wav');

    const response = await request(ENDPOINT, apiKey, { method: 'POST', body: form });
    const body = (await response.json()) as { text?: string };

    return (body.text ?? '').trim();
  }

  /**
   * Comprueba la clave sin gastar transcripciones: `GET /models` responde 200
   * con una clave válida y 401 con una que no lo es.
   */
  async verifyKey(apiKey: string): Promise<void> {
    await request(MODELS_ENDPOINT, apiKey, { method: 'GET' });
  }
}

async function request(
  url: string,
  apiKey: string,
  init: { method: string; body?: FormData },
): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}` },
      // `AbortSignal.timeout` no deja la petición colgada si el proveedor se
      // queda mudo: sin esto, Milo se quedaría en `thinking` para siempre.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new TranscriberError('network', 'No se pudo contactar con Groq.');
  }

  if (response.ok) return response;

  if (response.status === 401 || response.status === 403) {
    throw new TranscriberError('auth', 'La clave de Groq no es válida.');
  }
  if (response.status === 429) {
    throw new TranscriberError('quota', 'Groq ha limitado las peticiones.');
  }
  if (response.status === 400 || response.status === 413 || response.status === 415) {
    throw new TranscriberError('audio', 'El audio no se pudo procesar.');
  }

  throw new TranscriberError('unknown', `Groq respondió ${response.status}.`);
}
