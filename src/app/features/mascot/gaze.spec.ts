import { describe, expect, it } from 'vitest';

import { GAZE_DEADZONE, GAZE_RANGE, gazeToward } from './gaze';

/** Lado del personaje ya renderizado, en píxeles. */
const SIZE = 240;

const magnitude = (gaze: { x: number; y: number } | null): number =>
  Math.hypot(gaze?.x ?? 0, gaze?.y ?? 0);

describe('gazeToward', () => {
  it('no devuelve mirada sin una referencia de tamaño', () => {
    // En jsdom el SVG mide 0 px. Sin esta guarda, la división daría NaN.
    expect(gazeToward(10, 10, 0, null)).toBeNull();
  });

  it('mira hacia el cursor: signo positivo a la derecha y negativo arriba', () => {
    const gaze = gazeToward(60, -60, SIZE, null);

    expect(gaze?.x).toBeGreaterThan(0);
    expect(gaze?.y).toBeLessThan(0);
    // Es un vector: no puede salirse del rango -1..1.
    expect(magnitude(gaze)).toBeLessThanOrEqual(1);
  });

  it('acercar el cursor aumenta la mirada, no la encoge', () => {
    // Este es el bug que se vio en la ventana real: con una curva proporcional a
    // la distancia, el ojo volvía al centro justo cuando el cursor se acercaba.
    const far = gazeToward(SIZE * 0.7, 0, SIZE, null);
    const near = gazeToward(SIZE * 0.2, 0, SIZE, null);

    expect(magnitude(far)).toBeGreaterThan(0);
    expect(magnitude(near)).toBeGreaterThan(magnitude(far));
  });

  it('entre los ojos conserva la última dirección en vez de volver al centro', () => {
    const previous = { x: 0.6, y: 0 };

    expect(gazeToward(SIZE * GAZE_DEADZONE * 0.5, 0, SIZE, previous)).toEqual(previous);
  });

  it('sin mirada anterior, entre los ojos la deja centrada', () => {
    expect(gazeToward(0, 0, SIZE, null)).toBeNull();
  });

  it('suelta la mirada cuando el cursor sale del alcance', () => {
    expect(gazeToward(SIZE * GAZE_RANGE + 1, 0, SIZE, null)).toBeNull();
  });
});
