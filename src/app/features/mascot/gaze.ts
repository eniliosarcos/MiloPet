/**
 * La matemática de la mirada, fuera del componente para poder probarla sin DOM.
 *
 * Recibe el cursor en píxeles de ventana y devuelve un vector unitario (-1 a 1)
 * hacia donde deben mirar los ojos. `null` significa "fuera de alcance": el
 * personaje deja de seguir al ratón y vuelve a su barrido automático.
 */

/** Vector hacia donde miran los ojos; cada eje va de -1 a 1. */
export interface Gaze {
  readonly x: number;
  readonly y: number;
}

/**
 * Alcance de la mirada, como fracción del lado del personaje.
 *
 * Existe un límite a propósito: unos ojos que te siguen por toda la pantalla no
 * se leen como atención, se leen como vigilancia.
 */
export const GAZE_RANGE = 0.8;

/**
 * Distancia a la que la mirada llega a su tope, también en fracción del lado.
 *
 * El ojo casi no gira: pasada esta distancia el desplazamiento ya no crece, solo
 * cambia de dirección. Sin la saturación, el cursor lejos del personaje movería
 * los ojos fuera de la cara.
 */
export const GAZE_SATURATION = 0.35;

/**
 * Desplazamiento máximo, en unidades del `viewBox` (200x200).
 *
 * Con 6 unidades el ojo blanco se corre un tercio de su ancho: se entiende la
 * dirección sin que la forma se salga del cuerpo.
 */
export const GAZE_MAX = 6;

/** El ojo es más ancho que alto, así que en vertical el desplazamiento se recorta. */
export const GAZE_VERTICAL = 0.5;

/**
 * @param dx            Cursor menos el centro de los ojos, en píxeles.
 * @param dy            Cursor menos el centro de los ojos, en píxeles.
 * @param referenceSize Lado del personaje ya renderizado, en píxeles.
 */
export function gazeToward(dx: number, dy: number, referenceSize: number): Gaze | null {
  // En los tests el SVG mide 0 px: sin referencia no hay mirada que calcular.
  if (!(referenceSize > 0)) return null;

  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  if (distance > referenceSize * GAZE_RANGE) return null;

  const strength = Math.min(1, distance / (referenceSize * GAZE_SATURATION));
  return { x: (dx / distance) * strength, y: (dy / distance) * strength };
}
