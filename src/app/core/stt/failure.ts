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
      return 'Me falta la clave de Deepgram: clic derecho sobre mí y Ajustes.';
    case 'auth':
      return 'La clave de Deepgram no es válida. Revísala en Ajustes.';
    case 'quota':
      return 'Deepgram me frena: cuota agotada o límite alcanzado.';
    case 'blocked':
      return 'Deepgram no me deja entrar desde esta red. Eso no se arregla con la clave.';
    case 'network':
      return 'No pude conectar con Deepgram. ¿Tienes internet?';
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
      return 'Esa clave no es válida. Cópiala otra vez desde la consola de Deepgram.';
    case 'quota':
      return 'Tu cuenta de Deepgram no tiene cuota disponible ahora mismo.';
    case 'blocked':
      return 'Deepgram está bloqueando esta red (403). Prueba con otra conexión o una VPN.';
    case 'network':
      return 'No pude comprobar la clave: no hay conexión con Deepgram.';
    default:
      return 'No pude guardar la clave. Inténtalo otra vez.';
  }
}
