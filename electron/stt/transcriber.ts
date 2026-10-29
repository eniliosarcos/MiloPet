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
  /** Comprueba una clave sin gastar transcripciones. */
  verifyKey(apiKey: string): Promise<void>;
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
 * Deepgram: transcripción pre-grabada con Nova.
 *
 * Se llegó aquí después de que Groq respondiera 403 desde esta red (y OpenAI
 * `unsupported_country_region_territory`): el proveedor no era el problema, la
 * región. Deepgram sí es alcanzable desde aquí.
 *
 * Diferencias con la API compatible de OpenAI: el audio va en el cuerpo de la
 * petición (no en multipart), las opciones van en la query, y la credencial se
 * manda como `Token`, no como `Bearer`.
 */
const ENDPOINT = 'https://api.deepgram.com/v1/listen';

/**
 * Endpoint para validar la clave. `/v1/auth/token` responde 401 sin credencial
 * válida y devuelve la identidad de la clave con una buena.
 *
 * NO se usa `/v1/models` para esto, aunque parezca el sitio natural: es público
 * y responde 200 sin token. Una clave inventada se guardaba como buena y el
 * fallo aparecía en la primera frase.
 */
const AUTH_ENDPOINT = 'https://api.deepgram.com/v1/auth/token';

/**
 * Nova-2 y no Nova-3 a propósito: Nova-2 es el que la documentación da como
 * compatible con español. Nova-3 empezó siendo solo inglés y su multilingüe hay
 * que confirmarlo contra la cuenta antes de cambiarlo aquí.
 */
const MODEL = 'nova-2';

/**
 * Idioma fijo por ahora. Dárselo al modelo baja la latencia y los errores: sin
 * él tiene que adivinar entre decenas de idiomas en cada frase corta.
 */
const LANGUAGE = 'es';

/** Una frase de 15 s no tarda esto ni de lejos; si tarda, algo se rompió. */
const TIMEOUT_MS = 20_000;

interface DeepgramResponse {
  results?: {
    channels?: { alternatives?: { transcript?: string }[] }[];
  };
}

export class DeepgramTranscriber implements Transcriber {
  readonly provider = 'deepgram' as const;

  async transcribe(clip: SpeechClip, apiKey: string): Promise<string> {
    // 16 kHz es lo que esperan los modelos de Whisper y de sobra para voz:
    // mandar 48 kHz solo engorda el archivo. El WAV se arma aquí, en el main.
    const samples = downsample(clip.pcm, clip.sampleRate, STT_SAMPLE_RATE);
    const wav = pcmToWav(samples, STT_SAMPLE_RATE);

    const query = new URLSearchParams({
      model: MODEL,
      language: LANGUAGE,
      // Puntuación y formato: sin esto la burbuja enseña "hola que tal" y
      // "veintitres" en vez de "Hola, ¿qué tal?" y "23".
      smart_format: 'true',
      punctuate: 'true',
    });

    const response = await request(`${ENDPOINT}?${query.toString()}`, apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: wav,
    });

    const body = (await response.json()) as DeepgramResponse;

    return (body.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim();
  }

  /**
   * Comprueba la clave sin gastar transcripciones: `/v1/auth/token` responde
   * 200 con una clave válida y 401 con una que no lo es.
   */
  async verifyKey(apiKey: string): Promise<void> {
    await request(AUTH_ENDPOINT, apiKey, { method: 'GET' });
  }
}

interface RequestOptions {
  method: string;
  headers?: Record<string, string>;
  body?: ArrayBuffer;
}

async function request(url: string, apiKey: string, init: RequestOptions): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Token ${apiKey}`, ...init.headers },
      // `AbortSignal.timeout` no deja la petición colgada si el proveedor se
      // queda mudo: sin esto, Milo se quedaría en `thinking` para siempre.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new TranscriberError('network', 'No se pudo contactar con Deepgram.');
  }

  if (response.ok) return response;

  if (response.status === 401) {
    throw new TranscriberError('auth', 'La clave de Deepgram no es válida.');
  }
  if (response.status === 403) {
    // Es el fallo que nos trajo hasta aquí con otro proveedor: el 403 no dice
    // "clave mal", dice "tu red no entra". Confundirlos manda al usuario a
    // revisar una clave que está bien.
    throw new TranscriberError('blocked', 'Deepgram bloquea esta red.');
  }
  if (response.status === 402 || response.status === 429) {
    throw new TranscriberError('quota', 'Deepgram ha limitado o agotado la cuota.');
  }
  if (response.status === 400 || response.status === 413 || response.status === 415) {
    throw new TranscriberError('audio', 'El audio no se pudo procesar.');
  }

  throw new TranscriberError('unknown', `Deepgram respondió ${response.status}.`);
}
