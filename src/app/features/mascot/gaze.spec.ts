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

  it('acercar el cursor cambia la dirección, no el tamaño de la mirada', () => {
    // Con `GAZE_EDGE = 1` no hay rampa: dentro del alcance la mirada sale ya al
    // máximo, en el borde de la ventana igual que sobre la cara. Si alguien baja
    // ese valor, esta prueba deja de valer y hay que devolverle la curva.
    const far = gazeToward(SIZE * 0.7, 0, SIZE, null);
    const near = gazeToward(SIZE * 0.2, 0, SIZE, null);

    expect(magnitude(far)).toBeCloseTo(1, 5);
    expect(magnitude(near)).toBeCloseTo(1, 5);
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
