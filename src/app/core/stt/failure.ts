import type { SttFailure } from '../../../shared/ipc';

/**
 * Los fallos de transcripción, contados dos veces.
 *
 * El mismo fallo no se explica igual en la burbuja (donde no hay nada que
 * tocar) que en la pantalla de ajustes (donde el campo de la clave está
 * delante). Duplicar el mensaje sería peor: se acabarían separando.
 */

/** Lo que Milo dice por la burbuja cuando no puede transcribir. */
export function bubbleMessage(failure: SttFailure): string {
  switch (failure) {
    case 'no-key':
      return 'Me falta la clave de Groq: clic derecho sobre mí y Ajustes.';
    case 'auth':
      return 'La clave de Groq no es válida. Revísala en Ajustes.';
    case 'quota':
      return 'Groq me frena: límite gratuito alcanzado. Espera un minuto.';
    case 'network':
      return 'No pude conectar con Groq. ¿Tienes internet?';
    case 'audio':
      return 'No pude entender el audio. Prueba a hablar más cerca.';
    default:
      return 'No pude transcribir lo que dijiste.';
  }
}

/** Lo mismo, pero para la pantalla de ajustes. */
export function settingsMessage(failure: SttFailure): string {
  switch (failure) {
    case 'auth':
      return 'Esa clave no es válida. Cópiala otra vez desde la consola de Groq.';
    case 'quota':
      return 'Groq está limitando las peticiones. Prueba en un minuto.';
    case 'network':
      return 'No pude comprobar la clave: no hay conexión con Groq.';
    default:
      return 'No pude guardar la clave. Inténtalo otra vez.';
  }
}
