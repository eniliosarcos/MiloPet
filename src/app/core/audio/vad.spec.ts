import { Vad, medianLevel, thresholdForFloor, type VadConfig } from './vad';

/**
 * VAD con números, sin micrófono.
 *
 * Estos tests no comprueban que el umbral sea "el correcto" para tu habitación
 * —eso se mide con `npm run dev` y el micro real—, sino que la máquina de
 * tiempos corta donde dice cortar.
 */
const BASE: VadConfig = {
  threshold: 0.05,
  onsetMs: 150,
  hangoverMs: 800,
  maxSpeechMs: 15_000,
  maxWaitMs: 6000,
  frameMs: 50,
};

/** Alimenta `count` frames con el mismo nivel y devuelve las señales que salieron. */
function push(vad: Vad, level: number, count: number): string[] {
  const signals: string[] = [];
  for (let frame = 0; frame < count; frame += 1) signals.push(vad.push(level));
  return signals;
}

const VOICE = BASE.threshold;
const SILENCE = 0;

describe('Vad', () => {
  it('abre la frase cuando la voz aguanta el tiempo de inicio', () => {
    const vad = new Vad(BASE);

    // 100 ms (dos frames) todavía no son una frase: puede ser un golpe de teclado.
    expect(push(vad, VOICE, 2)).toEqual(['none', 'none']);
    expect(vad.heardSpeech).toBe(false);

    expect(push(vad, VOICE, 1)).toEqual(['open']);
    expect(vad.heardSpeech).toBe(true);
  });

  it('un solo frame de ruido no abre nada', () => {
    const vad = new Vad(BASE);

    expect(push(vad, VOICE, 1)).toEqual(['none']);
    // El silencio reinicia la racha: dos golpes separados tampoco son una frase.
    expect(push(vad, VOICE, 1)).toEqual(['none']);
    expect(vad.heardSpeech).toBe(false);
  });

  it('cierra la frase tras el silencio de cortesía', () => {
    const vad = new Vad(BASE);
    push(vad, VOICE, 3);

    // 750 ms de silencio: aún puede ser una pausa para respirar.
    expect(push(vad, SILENCE, 15)).not.toContain('close');

    // El frame 16 llega a los 800 ms y cierra.
    expect(push(vad, SILENCE, 1)).toEqual(['close']);
    expect(vad.heardSpeech).toBe(true);
  });

  it('una voz intermitente no cierra la frase', () => {
    const vad = new Vad(BASE);
    push(vad, VOICE, 3);

    // Hablar, callar 200 ms y volver a hablar: el silencio se reinicia.
    expect(push(vad, SILENCE, 4)).toEqual(['none', 'none', 'none', 'none']);
    expect(push(vad, VOICE, 1)).toEqual(['none']);
    expect(push(vad, SILENCE, 10)).not.toContain('close');
  });

  it('corta sin voz al agotarse la espera y lo dice', () => {
    const vad = new Vad(BASE);

    // 6 s escuchando el silencio: pulsaste el atajo y no hablaste.
    const signals = push(vad, SILENCE, BASE.maxWaitMs / BASE.frameMs - 1);
    expect(signals).not.toContain('close');

    expect(push(vad, SILENCE, 1)).toEqual(['close']);
    expect(vad.heardSpeech).toBe(false);
  });

  it('corta una frase que no termina nunca', () => {
    const vad = new Vad(BASE);
    push(vad, VOICE, 3);

    // El frame de apertura no cuenta como habla: se empieza a contar después.
    const signals = push(vad, VOICE, BASE.maxSpeechMs / BASE.frameMs - 1);
    expect(signals).not.toContain('close');

    expect(push(vad, VOICE, 1)).toEqual(['close']);
    // El tope no borra que hubo voz: hay algo que transcribir.
    expect(vad.heardSpeech).toBe(true);
  });

  it('después de cerrar no emite nada más', () => {
    const vad = new Vad(BASE);
    push(vad, VOICE, 3);
    expect(push(vad, SILENCE, 16)).toContain('close');

    // El micrófono ya se soltó: un frame tardío no puede reabrir la frase.
    expect(push(vad, VOICE, 10)).not.toContain('open');
    expect(push(vad, SILENCE, 30)).toEqual(Array<string>(30).fill('none'));
  });
});

describe('medianLevel', () => {
  it('devuelve 0 sin muestras', () => {
    expect(medianLevel([])).toBe(0);
  });

  it('con un número impar de muestras devuelve la del centro', () => {
    expect(medianLevel([0.3, 0.1, 0.2])).toBe(0.2);
  });

  it('con un número par promedia las dos del centro', () => {
    expect(medianLevel([0.4, 0.2, 0.1, 0.3])).toBeCloseTo(0.25);
  });

  it('aguanta un golpe de teclado en la calibración', () => {
    // Un frame a 0.9 (un golpe en el teclado) no debe arrastrar el umbral: la
    // mediana lo deja fuera, la media lo habría subido a 0.25.
    expect(medianLevel([0.002, 0.002, 0.9, 0.002, 0.002])).toBeCloseTo(0.002);
  });
});

describe('thresholdForFloor', () => {
  it('exige que la voz destaque sobre el ruido medido', () => {
    expect(thresholdForFloor(0.02)).toBeCloseTo(0.06);
  });

  it('no baja del suelo: un micro silencioso no dispara con la respiración', () => {
    // 0.001 x 3 = 0.003, por debajo del mínimo audible y del ruido propio.
    expect(thresholdForFloor(0.001)).toBeCloseTo(0.012);
  });

  it('no sube del techo: en una sala ruidosa todavía se puede hablar', () => {
    expect(thresholdForFloor(0.5)).toBeCloseTo(0.12);
  });
});
