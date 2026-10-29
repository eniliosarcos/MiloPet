import { describe, expect, it } from 'vitest';

import {
  GAZE_AWAY_GROW,
  GAZE_AWAY_WIDEN,
  GAZE_RANGE,
  GAZE_REACH,
  GAZE_TOWARD_NARROW,
  GAZE_TOWARD_SHRINK,
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
    expect(gazeToward(10, 10, 0)).toBeNull();
  });

  it('mira hacia el cursor: signo positivo a la derecha y negativo arriba', () => {
    const gaze = gazeToward(60, -60, SIZE);

    expect(gaze?.x).toBeGreaterThan(0);
    expect(gaze?.y).toBeLessThan(0);
    // Es un vector: no puede salirse del rango -1..1.
    expect(magnitude(gaze)).toBeLessThanOrEqual(1);
  });

  it('acompaña al cursor: cuanto más lejos, más se desplaza la mirada', () => {
    // La mitad del recorrido tiene que dar la mitad de la mirada. Es lo que
    // hace que el ojo siga al ratón en vez de conmutar entre dos extremos.
    const half = gazeToward(SIZE * GAZE_REACH * 0.5, 0, SIZE);
    const full = gazeToward(SIZE * GAZE_REACH, 0, SIZE);

    expect(magnitude(half)).toBeCloseTo(0.5, 5);
    expect(magnitude(full)).toBeCloseTo(1, 5);
  });

  it('se satura al llegar al alcance: más lejos no mueve más el ojo', () => {
    const atReach = gazeToward(SIZE * GAZE_REACH, 0, SIZE);
    // A mitad de camino entre los dos radios: ya satura y sigue dentro.
    const far = gazeToward(SIZE * ((GAZE_REACH + GAZE_RANGE) / 2), 0, SIZE);

    expect(magnitude(far)).toBeCloseTo(1, 5);
    expect(far).toEqual(atReach);
  });

  it('en el centro de los ojos la mirada queda centrada y sin NaN', () => {
    expect(gazeToward(0, 0, SIZE)).toEqual({ x: 0, y: 0 });
  });

  it('suelta la mirada cuando el cursor sale del alcance', () => {
    expect(gazeToward(SIZE * GAZE_RANGE + 1, 0, SIZE)).toBeNull();
  });
});

describe('eyeScales', () => {
  const REST = { x: 1, y: 1 };

  it('sin mirada, los dos ojos quedan en su tamaño de reposo', () => {
    expect(eyeScales(null)).toEqual({ left: REST, right: REST });
    expect(eyeScales({ x: 0, y: 0 })).toEqual({ left: REST, right: REST });
  });

  it('encoge y angosta el ojo hacia el que mira, y crece el del lado contrario', () => {
    // Mirando a la derecha, el derecho es el que se aleja hacia el cursor.
    const lookRight = eyeScales({ x: 1, y: 0 });

    expect(lookRight.right.x).toBeCloseTo(1 - GAZE_TOWARD_NARROW, 10);
    expect(lookRight.right.y).toBeCloseTo(1 - GAZE_TOWARD_SHRINK, 10);
    expect(lookRight.left.x).toBeCloseTo(1 + GAZE_AWAY_WIDEN, 10);
    expect(lookRight.left.y).toBeCloseTo(1 + GAZE_AWAY_GROW, 10);
  });

  it('es simétrico: izquierda y derecha dan el espejo exacto', () => {
    const lookLeft = eyeScales({ x: -1, y: 0 });
    const lookRight = eyeScales({ x: 1, y: 0 });

    expect(lookLeft.left).toEqual(lookRight.right);
    expect(lookLeft.right).toEqual(lookRight.left);
  });

  it('cambia de forma proporcional: media mirada, medio efecto', () => {
    const half = eyeScales({ x: 0.5, y: 0 });

    expect(half.right.x).toBeCloseTo(1 - GAZE_TOWARD_NARROW / 2, 10);
    expect(half.right.y).toBeCloseTo(1 - GAZE_TOWARD_SHRINK / 2, 10);
    expect(half.left.x).toBeCloseTo(1 + GAZE_AWAY_WIDEN / 2, 10);
  });

  it('no se dispara: los factores se quedan en un rango razonable', () => {
    const extreme = eyeScales({ x: 1, y: 1 });

    // Límites amplios a propósito: vigilan que nadie ponga un 1.5 por error, no
    // que la constante valga un número concreto.
    expect(extreme.right.x).toBeGreaterThan(0.5);
    expect(extreme.right.y).toBeGreaterThan(0.5);
    expect(extreme.left.x).toBeLessThan(1.5);
    expect(extreme.left.y).toBeLessThan(1.5);
  });
});
