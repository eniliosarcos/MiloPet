/**
 * Conversión de muestras a WAV PCM 16 bits.
 *
 * Vive en `shared/` y no en `electron/` por una razón práctica: se compila en
 * los dos mundos y el test de Angular lo puede probar sin arrancar Electron.
 * Es la única parte del envío al proveedor que se puede verificar sin red.
 */

/** Cabecera canónica de 44 bytes para PCM 16 bits mono. */
const HEADER_BYTES = 44;

export function pcmToWav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataBytes = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  // RIFF / WAVE / fmt  (los nombres son los del estándar, no traducciones).
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // tamaño del bloque fmt
  view.setUint16(20, 1, true); // PCM sin comprimir
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // bytes por segundo
  view.setUint16(32, bytesPerSample, true); // alineación de bloque
  view.setUint16(34, 16, true); // bits por muestra
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < pcm.length; index += 1) {
    // Se recorta antes de escalar: una muestra fuera de rango desborda el
    // entero de 16 bits y suena como un chasquido.
    const sample = Math.max(-1, Math.min(1, pcm[index]));
    view.setInt16(HEADER_BYTES + index * bytesPerSample, Math.round(sample * 32767), true);
  }

  return buffer;
}

/** Frecuencia de muestreo que espera el proveedor si hay que remuestrear. */
export const STT_SAMPLE_RATE = 16_000;

/**
 * Reduce las muestras a `targetRate` promediando grupos.
 *
 * Promediar y no tomar una de cada N es lo que evita el aliasing: quedarse con
 * una muestra de cada tres convierte el ruido agudo en un tono. Para voz no
 * hace falta un filtro serio; para música sí.
 */
export function downsample(pcm: Float32Array, fromRate: number, targetRate: number): Float32Array {
  if (targetRate >= fromRate) return pcm;

  const ratio = fromRate / targetRate;
  const length = Math.floor(pcm.length / ratio);
  const out = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(pcm.length, Math.floor((index + 1) * ratio));
    let sum = 0;

    for (let cursor = start; cursor < end; cursor += 1) sum += pcm[cursor];
    out[index] = sum / (end - start);
  }

  return out;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
