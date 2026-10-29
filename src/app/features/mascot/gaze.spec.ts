import { describe, expect, it } from 'vitest';

import { GAZE_RANGE, GAZE_SATURATION, gazeToward } from './gaze';

/** Lado del personaje ya renderizado, en píxeles. */
const SIZE = 240;

describe('gazeToward', () => {
  it('no devuelve mirada sin una referencia de tamaño', () => {
    // En jsdom el SVG mide 0 px. Sin esta guarda, la división daría NaN.
    expect(gazeToward(10, 10, 0)).toBeNull();
  });

  it('deja los ojos centrados cuando el cursor está justo encima de ellos', () => {
    expect(gazeToward(0, 0, SIZE)).toEqual({ x: 0, y: 0 });
  });

  it('mira hacia el cursor: signo positivo a la derecha y negativo arriba', () => {
    const gaze = gazeToward(60, -60, SIZE);

    expect(gaze?.x).toBeGreaterThan(0);
    expect(gaze?.y).toBeLessThan(0);
    // Es un vector unitario: no puede salirse del rango -1..1.
    expect(Math.hypot(gaze?.x ?? 0, gaze?.y ?? 0)).toBeLessThanOrEqual(1);
  });

  it('satura el desplazamiento: más lejos solo cambia la dirección', () => {
    // A partir de `GAZE_SATURATION` el ojo ya está al tope y no se sale de la cara.
    expect(gazeToward(SIZE * GAZE_SATURATION, 0, SIZE)).toEqual({ x: 1, y: 0 });
    expect(gazeToward(SIZE * GAZE_RANGE, 0, SIZE)).toEqual({ x: 1, y: 0 });
  });

  it('suelta la mirada cuando el cursor sale del alcance', () => {
    expect(gazeToward(SIZE * GAZE_RANGE + 1, 0, SIZE)).toBeNull();
  });
});
