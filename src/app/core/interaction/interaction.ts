import { DestroyRef, Injectable, inject, signal } from '@angular/core';

import type { HotkeyRegistration, MascotState } from '../../../shared/ipc';
import { VOICE, type CaptureResult } from '../audio/capture';

/**
 * El bucle de interacción: qué hace Milo desde que pulsas el atajo hasta que se
 * calla.
 *
 * Vive en un servicio y no en `App` porque ahora depende de algo que no es un
 * `setTimeout`: la captura de voz. Un componente que además de dibujar y
 * arrastrar tuviera que esperar al micrófono sería tres cosas a la vez y ninguna
 * se podría probar sola.
 */

/**
 * El tono del mensaje. Es semántico, no estético: la burbuja decide cómo se
 * pinta, el bucle solo dice si lo que pasó fue normal o un error.
 */
export type MessageTone = 'neutral' | 'error';

/** Cuánto tiempo de lectura tiene el mensaje después de volver a `idle`. */
const BUBBLE_VISIBLE_MS = 4000;

/**
 * Duración del desvanecido. Debe coincidir con la animación `bubble-out` de
 * `features/bubble/bubble.scss`: si cambias una, cambia la otra.
 */
const BUBBLE_FADE_MS = 420;

/** Cuánto se queda un error en pantalla antes de apartarse. */
const ERROR_MS = 4200;

/**
 * SIMULADO: la fase 3 sustituye este tiempo por el cerebro real. Sigue siendo un
 * temporizador a propósito, para que el bucle se sienta completo antes de meter
 * latencia de verdad.
 */
const THINKING_MS = 900;

/**
 * SIMULADO: la fase 3 sustituye este tiempo por la duración de la respuesta.
 * La animación de `acting` se rehace entonces (decisión 8).
 */
const ACTING_MS = 3200;

@Injectable({ providedIn: 'root' })
export class Interaction {
  private readonly voice = inject(VOICE);
  private readonly destroyRef = inject(DestroyRef);

  /** Timers pendientes, para poder cancelarlos si el servicio se destruye. */
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  /** Timer del desvanecido en curso, para poder cancelarlo si el usuario cierra antes. */
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Evita que una segunda pulsación del atajo pise una interacción en curso. */
  private busy = false;
  /** Una escucha en vuelo no debe seguir escribiendo estados después de morir. */
  private alive = true;

  readonly state = signal<MascotState>('idle');
  readonly message = signal('');
  readonly tone = signal<MessageTone>('neutral');
  readonly leaving = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => this.dispose());
  }

  /**
   * Una interacción completa: escuchar de verdad, pensar (simulado) y responder
   * (simulado). La duración de `listening` ya no es una constante: la decide el
   * VAD, que cierra la frase cuando dejas de hablar.
   */
  async start(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    // Una interacción nueva manda: se lleva por delante el mensaje anterior
    // aunque estuviera a medio desvanecer.
    this.cancelFade();
    this.message.set('');
    this.leaving.set(false);
    this.tone.set('neutral');
    this.state.set('listening');

    let capture: CaptureResult;
    try {
      capture = await this.voice.listen();
    } catch (error) {
      this.busy = false;
      this.fail(error instanceof Error ? error.message : 'No pude escucharte.');
      return;
    }

    // El servicio murió mientras el micro estaba abierto: no hay a quién contar
    // el resultado y `dispose()` ya soltó el dispositivo.
    if (!this.alive) return;

    if (!capture.heardSpeech) {
      // Pulsaste y no dijiste nada. No es un error: no hay nada que pensar ni
      // que responder, así que se vuelve a `idle` sin mensaje.
      this.state.set('idle');
      this.busy = false;
      return;
    }

    this.state.set('thinking');
    this.after(THINKING_MS, () => {
      this.state.set('acting');
      this.message.set('Ya te oigo, pero todavía no entiendo palabras. Eso es lo siguiente.');
      this.after(ACTING_MS, () => {
        this.state.set('idle');
        this.busy = false;
        this.scheduleDismiss();
      });
    });
  }

  /** Un fallo del atajo global, contado con el nombre de la combinación. */
  failHotkey(failure: HotkeyRegistration): void {
    this.fail(
      `No puedo registrar ${failure.accelerator}. Otra aplicación ya lo está usando; elige otra combinación.`,
    );
  }

  /**
   * El usuario pulsó la (x): no esperamos los cuatro segundos de cortesía.
   *
   * Vale igual para un mensaje normal y para uno de error: el error también se
   * puede apartar a mano.
   */
  closeBubble(): void {
    // Si ya se está desvaneciendo, dejamos que termine: reiniciar el timer
    // dejaría el mensaje huérfano en pantalla.
    if (this.leaving()) return;
    this.cancelFade();
    this.startFade();
  }

  /** Muestra un error y vuelve a `idle` solo. */
  private fail(message: string): void {
    this.tone.set('error');
    this.message.set(message);
    this.state.set('error');
    this.after(ERROR_MS, () => {
      this.state.set('idle');
      // Sin esto la burbuja se queda en pantalla para siempre. Los mensajes
      // normales se apartan al volver a `idle`; los de error, también.
      this.scheduleDismiss();
    });
  }

  /**
   * Da unos segundos de lectura y luego desvanece la burbuja.
   *
   * El reloj arranca al volver a `idle`, no al aparecer el texto: así el usuario
   * siempre tiene el mismo tiempo de lectura, sin importar cuánto dure la
   * animación de `acting`. Cuando la fase 3 devuelva respuestas largas, este es
   * el sitio para calcular el tiempo según la longitud del texto.
   */
  private scheduleDismiss(): void {
    this.fadeTimer = this.after(BUBBLE_VISIBLE_MS, () => this.startFade());
  }

  private startFade(): void {
    if (!this.message() || this.leaving()) return;

    this.leaving.set(true);
    this.fadeTimer = this.after(BUBBLE_FADE_MS, () => {
      this.message.set('');
      this.leaving.set(false);
      this.fadeTimer = undefined;
    });
  }

  private cancelFade(): void {
    if (this.fadeTimer === undefined) return;
    clearTimeout(this.fadeTimer);
    this.timers.delete(this.fadeTimer);
    this.fadeTimer = undefined;
  }

  /**
   * `setTimeout` con registro: guarda el id para poder cancelarlo al destruir el
   * servicio y se olvida de él cuando ya se ejecutó, para que el Set no crezca.
   */
  private after(delay: number, action: () => void): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, delay);

    this.timers.add(timer);
    return timer;
  }

  private dispose(): void {
    this.alive = false;
    // Si el micro estaba abierto, se suelta aquí: nadie más lo va a cerrar.
    this.voice.dispose();
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.fadeTimer = undefined;
  }
}
