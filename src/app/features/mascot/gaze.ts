/**
 * La matemática de la mirada, fuera del componente para poder probarla sin DOM.
 *
 * Recibe el cursor en píxeles de ventana y devuelve un vector (-1 a 1) hacia
 * donde deben mirar los ojos. `null` significa "fuera de alcance": el personaje
 * deja de seguir al ratón y vuelve a su barrido automático.
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
 * Desplazamiento en el borde del alcance, como fracción del máximo.
 *
 * La mirada crece a medida que el cursor se acerca: no es lo mismo tenerlo en el
 * borde de la ventana que encima de la cara. El borde se queda cerca del tope
 * para no perder reacción, y el resto del recorrido lo gana al acercarse.
 */
export const GAZE_EDGE = 0.7;

/**
 * Radio muerto alrededor del centro de los ojos, en fracción del lado.
 *
 * Ahí el cursor está entre los dos ojos y la dirección es inestable: un píxel de
 * más a la izquierda o a la derecha cambiaría la mirada de lado a lado. Dentro
 * del radio se conserva la última dirección, ya en su desplazamiento máximo.
 */
export const GAZE_DEADZONE = 0.08;

/**
 * Desplazamiento máximo, en unidades del `viewBox` (200x200).
 *
 * Con 8 unidades el ojo blanco se corre media anchura: es lo que se nota al
 * tener el cursor encima, sin que la forma se salga del cuerpo.
 */
export const GAZE_MAX = 8;

/** El ojo es más ancho que alto, así que en vertical el desplazamiento se recorta. */
export const GAZE_VERTICAL = 0.5;

/**
 * @param dx            Cursor menos el centro de los ojos, en píxeles.
 * @param dy            Cursor menos el centro de los ojos, en píxeles.
 * @param referenceSize Lado del personaje ya renderizado, en píxeles.
 * @param previous      Mirada anterior, para no vibrar entre los dos ojos.
 */
export function gazeToward(
  dx: number,
  dy: number,
  referenceSize: number,
  previous: Gaze | null,
): Gaze | null {
  // En los tests el SVG mide 0 px: sin referencia no hay mirada que calcular.
  if (!(referenceSize > 0)) return null;

  const distance = Math.hypot(dx, dy);
  if (distance > referenceSize * GAZE_RANGE) return null;

  // Entre los ojos no hay dirección estable: se mantiene la última.
  if (distance < referenceSize * GAZE_DEADZONE) return previous;

  // De 0 en el borde del alcance a 1 encima de los ojos.
  const proximity = 1 - distance / (referenceSize * GAZE_RANGE);
  const strength = GAZE_EDGE + (1 - GAZE_EDGE) * proximity;

  return { x: (dx / distance) * strength, y: (dy / distance) * strength };
}
