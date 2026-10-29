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
 *
 * 0,42 × 265 px ≈ 111 px. La cifra no es estética: los ojos están a 122 px del
 * borde inferior de la ventana de 340 y el punto más ancho de la silueta —el
 * torso en `error`, que escala 1,25— queda a 107 px del centro de los ojos. Con
 * este radio el cuerpo entero sigue dentro del alcance y el círculo cabe
 * completo en la ventana. Con 0,8 (212 px) el límite caía fuera de la ventana:
 * los ojos solo se soltaban al salir de ella, así que la perilla no cambiaba
 * nada visible y el overlay de zonas dibujaba un arco cortado.
 *
 * La contrapartida, que es la decisión: Milo deja de seguir al cursor cuando
 * este abandona el cuerpo más un halo de ~20 px, no cuando abandona la ventana.
 */
export const GAZE_RANGE = 0.42;

/**
 * Distancia a la que el ojo llega a su desplazamiento máximo, como fracción del
 * lado del personaje.
 *
 * Es la perilla de la fluidez. Por debajo de esta distancia el ojo acompaña al
 * cursor de forma proporcional; a partir de aquí se queda en el borde de su
 * recorrido y solo cambia de dirección. Bajarla convierte la mirada en un
 * interruptor que salta de un extremo al otro; subirla hace que el ojo siga al
 * ratón píxel a píxel.
 */
export const GAZE_REACH = 0.25;

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
 * Cuánto se angosta en horizontal el ojo que queda más lejos, en la dirección
 * de la mirada.
 *
 * Es la pista de profundidad: el ojo que se aleja se va de perfil. Por sí sola
 * no basta, porque la altura no cambia y el ojo se lee igual de grande; por eso
 * va acompañada de `GAZE_TOWARD_SHRINK`.
 */
export const GAZE_TOWARD_NARROW = 0.3;

/** Cuánto encoge en vertical ese mismo ojo, como fracción. */
export const GAZE_TOWARD_SHRINK = 0.18;

/** Cuánto se ensancha el ojo del lado contrario, como fracción. */
export const GAZE_AWAY_WIDEN = 0.08;

/** Cuánto crece en vertical ese mismo ojo, como fracción. */
export const GAZE_AWAY_GROW = 0.05;

/** Escala de cada ojo por eje; 1 es su tamaño de reposo. */
export interface EyeScale {
  readonly x: number;
  readonly y: number;
}

export interface EyeScales {
  readonly left: EyeScale;
  readonly right: EyeScale;
}

/**
 * Da volumen a la pareja: el ojo hacia el que se mira encoge y se angosta, y el
 * otro crece un poco.
 *
 * Mirando a la derecha, el derecho es el que se aleja hacia el cursor. Mirando
 * al centro los dos valen 1: sin giro no hay perspectiva que fingir.
 */
export function eyeScales(gaze: Gaze | null): EyeScales {
  const x = gaze?.x ?? 0;
  const toTheRight = Math.max(0, x);
  const toTheLeft = Math.max(0, -x);

  const toward = (amount: number): EyeScale => ({
    x: 1 - amount * GAZE_TOWARD_NARROW,
    y: 1 - amount * GAZE_TOWARD_SHRINK,
  });

  const away = (amount: number): EyeScale => ({
    x: 1 + amount * GAZE_AWAY_WIDEN,
    y: 1 + amount * GAZE_AWAY_GROW,
  });

  return {
    left: toTheRight > 0 ? away(toTheRight) : toward(toTheLeft),
    right: toTheLeft > 0 ? away(toTheLeft) : toward(toTheRight),
  };
}

/**
 * @param dx            Cursor menos el centro de los ojos, en píxeles.
 * @param dy            Cursor menos el centro de los ojos, en píxeles.
 * @param referenceSize Lado del personaje ya renderizado, en píxeles.
 */
export function gazeToward(dx: number, dy: number, referenceSize: number): Gaze | null {
  // En los tests el SVG mide 0 px: sin referencia no hay mirada que calcular.
  if (!(referenceSize > 0)) return null;

  const distance = Math.hypot(dx, dy);
  if (distance > referenceSize * GAZE_RANGE) return null;

  // Hasta `GAZE_REACH` el desplazamiento es proporcional a la distancia; a
  // partir de ahí el ojo queda en el borde de su recorrido y solo gira. Es lo
  // que separa "acompañar al cursor" de "conmutar entre dos extremos".
  //
  // En el centro exacto no hay división por cero: `factor` vale `1 / reach`, así
  // que el resultado es (0, 0). Por eso ya no hace falta un radio muerto que
  // congelara la última mirada.
  const factor = 1 / Math.max(distance, referenceSize * GAZE_REACH);

  return { x: dx * factor, y: dy * factor };
}
