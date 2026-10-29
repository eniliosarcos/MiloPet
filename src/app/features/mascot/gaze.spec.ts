import { describe, expect, it } from 'vitest';

import {
  GAZE_AWAY_WIDEN,
  GAZE_DEADZONE,
  GAZE_RANGE,
  GAZE_TOWARD_NARROW,
  eyeScales,
  gazeToward,
} from './gaze';

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

describe('eyeScales', () => {
  it('sin mirada, los dos ojos quedan en su anchura de reposo', () => {
    expect(eyeScales(null)).toEqual({ left: 1, right: 1 });
    expect(eyeScales({ x: 0, y: 0 })).toEqual({ left: 1, right: 1 });
  });

  it('estrecha el ojo hacia el que mira y ensancha el del lado contrario', () => {
    // Mirando a la derecha, el derecho es el que se aleja hacia el cursor.
    const lookRight = eyeScales({ x: 1, y: 0 });

    expect(lookRight.right).toBeCloseTo(1 - GAZE_TOWARD_NARROW, 10);
    expect(lookRight.left).toBeCloseTo(1 + GAZE_AWAY_WIDEN, 10);
  });

  it('es simétrico: izquierda y derecha dan el espejo exacto', () => {
    const lookLeft = eyeScales({ x: -1, y: 0 });
    const lookRight = eyeScales({ x: 1, y: 0 });

    expect(lookLeft.left).toBeCloseTo(lookRight.right, 10);
    expect(lookLeft.right).toBeCloseTo(lookRight.left, 10);
  });

  it('cambia de forma proporcional: media mirada, medio efecto', () => {
    const half = eyeScales({ x: 0.5, y: 0 });

    expect(half.right).toBeCloseTo(1 - GAZE_TOWARD_NARROW / 2, 10);
    expect(half.left).toBeCloseTo(1 + GAZE_AWAY_WIDEN / 2, 10);
  });

  it('no se dispara: el estrechamiento está acotado por la constante', () => {
    const extreme = eyeScales({ x: 1, y: 1 });

    expect(extreme.right).toBeGreaterThan(0.8);
    expect(extreme.left).toBeLessThan(1.1);
  });
});
