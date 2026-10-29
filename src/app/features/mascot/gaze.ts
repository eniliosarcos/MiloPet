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
 * A 1 no hay rampa: dentro del alcance la mirada sale ya completa, en el borde
 * de la ventana igual que encima de la cara. Bajarlo hace que el ojo empiece
 * corto en el borde y gane recorrido al acercarse, pero entonces el gesto casi
 * no se nota cuando el cursor está lejos.
 */
export const GAZE_EDGE = 1;

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
 * Con 15 unidades el ojo blanco se corre media anchura: es lo que se nota al
 * tener el cursor encima, sin que la forma se salga del cuerpo.
 */
export const GAZE_MAX = 15;

/** El ojo es más ancho que alto, así que en vertical el desplazamiento se recorta. */
export const GAZE_VERTICAL = 0.5;

/**
 * Cuánto encoge el ojo que queda más lejos, en la dirección de la mirada.
 *
 * Los dos ojos se desplazan lo mismo, pero el que apunta al objetivo lo hace en
 * una cara que gira: se ve más estrecho. Es lo que convierte un desplazamiento
 * plano en la sensación de que Milo vuelve la cara.
 */
export const GAZE_TOWARD_SHRINK = 0.12;

/**
 * Cuánto crece el ojo del lado contrario, como fracción.
 *
 * Encoger solo uno descuadra la pareja: se lee como un ojo mal dibujado, no como
 * profundidad. Con el otro creciendo un poco, los dos cambios se interpretan
 * juntos como un solo giro.
 */
export const GAZE_AWAY_GROW = 0.05;

/** Escala de cada ojo; 1 es su tamaño de reposo. */
export interface EyeScales {
  readonly left: number;
  readonly right: number;
}

/**
 * Da volumen a la pareja: el ojo hacia el que se mira encoge y el otro crece.
 *
 * Mirando a la derecha, el derecho es el que se aleja hacia el cursor y el que
 * se reduce. Mirando al centro los dos valen 1: sin giro no hay perspectiva que
 * fingir.
 */
export function eyeScales(gaze: Gaze | null): EyeScales {
  const x = gaze?.x ?? 0;
  const toTheRight = Math.max(0, x);
  const toTheLeft = Math.max(0, -x);

  return {
    left: 1 + toTheRight * GAZE_AWAY_GROW - toTheLeft * GAZE_TOWARD_SHRINK,
    right: 1 + toTheLeft * GAZE_AWAY_GROW - toTheRight * GAZE_TOWARD_SHRINK,
  };
}

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
