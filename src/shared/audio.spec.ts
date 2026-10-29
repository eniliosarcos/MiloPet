import { downsample, pcmToWav, STT_SAMPLE_RATE } from './audio';

/**
 * El WAV y el remuestreo son la única parte del envío al proveedor que se puede
 * probar sin red y sin micrófono. Se prueban aquí, en el mismo runner que el
 * resto del renderer.
 */

const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_unused, index) => view.getUint8(offset + index)));

describe('pcmToWav', () => {
  it('escribe una cabecera PCM mono de 16 bits coherente', () => {
    const pcm = new Float32Array(4);
    const buffer = pcmToWav(pcm, 16_000);
    const view = new DataView(buffer);

    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(ascii(view, 36, 4)).toBe('data');

    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16); // bits por muestra

    // Los dos tamaños que un reproductor usa para saber dónde acaba el audio.
    expect(view.getUint32(40, true)).toBe(pcm.length * 2);
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect(buffer.byteLength).toBe(44 + pcm.length * 2);
  });

  it('convierte las muestras y recorta lo que se sale de rango', () => {
    const pcm = new Float32Array([0, 1, -1, 2, -2]);
    const view = new DataView(pcmToWav(pcm, 16_000));

    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32_767);
    expect(view.getInt16(48, true)).toBe(-32_767);
    // Sin recorte, 2 desborda el entero de 16 bits y suena como un chasquido.
    expect(view.getInt16(50, true)).toBe(32_767);
    expect(view.getInt16(52, true)).toBe(-32_767);
  });
});

describe('downsample', () => {
  it('deja el audio intacto si ya está por debajo de la frecuencia pedida', () => {
    const pcm = new Float32Array([0.1, 0.2, 0.3]);
    expect(downsample(pcm, 16_000, STT_SAMPLE_RATE)).toBe(pcm);
  });

  it('reduce 48 kHz a 16 kHz promediando grupos de tres', () => {
    // Una rampa de 48 muestras a 48 kHz son 16 muestras a 16 kHz.
    const pcm = new Float32Array(48).map((_value, index) => index / 48);
    const result = downsample(pcm, 48_000, 16_000);

    expect(result.length).toBe(16);
    // La primera muestra es la media de 0, 1 y 2 (sobre 48).
    expect(result[0]).toBeCloseTo(1 / 48, 6);
  });

  it('no pierde muestras por redondeo al final', () => {
    const pcm = new Float32Array(50).fill(0.5);
    const result = downsample(pcm, 48_000, 16_000);

    // 50 / 3 = 16,66: se queda con 16 y no inventa una muestra incompleta.
    expect(result.length).toBe(16);
    expect(result.every((sample) => Math.abs(sample - 0.5) < 1e-6)).toBe(true);
  });
});
