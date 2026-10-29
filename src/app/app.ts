import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  effect,
  inject,
  signal,
} from '@angular/core';

import type { HotkeyRegistration, MascotState } from '../shared/ipc';
import { MILO } from './core/milo/milo-bridge';
import { Bubble, type BubbleTone } from './features/bubble/bubble';
import { Mascot } from './features/mascot/mascot';

/** Cuánto tiempo de lectura tiene el mensaje después de volver a `idle`. */
const BUBBLE_VISIBLE_MS = 4000;

/**
 * Duración del desvanecido. Debe coincidir con la animación `bubble-out` de
 * `features/bubble/bubble.scss`: si cambias una, cambia la otra.
 */
const BUBBLE_FADE_MS = 420;

/**
 * Orquesta todo el bucle de interacción.
 *
 * La fase 1 solo demuestra la columna vertebral: atajo -> máquina de estados ->
 * burbuja. La fase 2 sustituye la cadena de `setTimeout` por el pipeline de voz,
 * y la fase 3 sustituye el mensaje fijo por el cerebro.
 */
@Component({
  selector: 'app-root',
  imports: [Mascot, Bubble],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly milo = inject(MILO);
  private readonly destroyRef = inject(DestroyRef);
  /** Timers pendientes, para poder cancelarlos si el componente se destruye. */
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  /** Timer del desvanecido en curso, para poder cancelarlo si el usuario cierra antes. */
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private interactive = false;
  /** Evita que una segunda pulsación del atajo pise una interacción en curso. */
  private busy = false;

  protected readonly state = signal<MascotState>('idle');
  protected readonly message = signal('');
  protected readonly tone = signal<BubbleTone>('neutral');
  protected readonly leaving = signal(false);

  constructor() {
    const stopHotkey = this.milo.onHotkey(() => this.runInteractionLoop());
    const stopFailure = this.milo.onHotkeyFailed((failure) => this.reportHotkeyFailure(failure));

    // Mantiene al proceso main al día del estado. Allí vivirá la bandeja y el
    // registro de actividad más adelante. `effect` se vuelve a ejecutar cada vez
    // que cambia `state()`, sin necesidad de suscripciones manuales.
    effect(() => this.milo.setState(this.state()));

    // Las tres bajas son obligatorias: si no, al destruir el componente quedan
    // listeners y timers vivos apuntando a una instancia que ya no existe.
    this.destroyRef.onDestroy(() => {
      stopHotkey();
      stopFailure();
      this.timers.forEach((timer) => clearTimeout(timer));
      this.timers.clear();
    });
  }

  /**
   * La ventana arranca en click-through para no robar clics. Solo la volvemos
   * interactiva mientras el cursor está encima del hotspot `[data-interactive]`.
   */
  @HostListener('window:mousemove', ['$event'])
  protected onPointerMove(event: MouseEvent): void {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const interactive = target?.closest('[data-interactive]') !== null;

    // Solo hablamos con el proceso main cuando el valor cambia: un mousemove
    // dispara decenas de eventos por segundo y no queremos cruzar IPC en todos.
    if (interactive !== this.interactive) {
      this.interactive = interactive;
      this.milo.setInteractive(interactive);
    }
  }

  private runInteractionLoop(): void {
    if (this.busy) return;
    this.busy = true;
    // Una interacción nueva manda: se lleva por delante el mensaje anterior
    // aunque estuviera a medio desvanecer.
    this.cancelFade();
    this.message.set('');
    this.leaving.set(false);
    this.tone.set('neutral');
    this.state.set('listening');

    // SIMULADO: la fase 2 reemplaza esto por captura + VAD + Whisper, y la fase
    // 3 por el router de intención. Los tiempos son visibles a propósito, para
    // sentir el bucle antes de añadir latencia real.
    this.after(1500, () => {
      this.state.set('thinking');
      this.after(900, () => {
        this.state.set('acting');
        this.message.set(
          'Esa es la columna vertebral funcionando. Todavía no tengo oídos: eso llega en la fase 2.',
        );
        this.after(3200, () => {
          this.state.set('idle');
          this.busy = false;
          this.scheduleDismiss();
        });
      });
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

  /** El usuario pulsó la (x): no esperamos los cuatro segundos de cortesía. */
  protected closeBubble(): void {
    // Si ya se está desvaneciendo, dejamos que termine: reiniciar el timer
    // dejaría el mensaje huérfano en pantalla.
    if (this.leaving()) return;
    this.cancelFade();
    this.startFade();
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

  private reportHotkeyFailure(failure: HotkeyRegistration): void {
    this.state.set('error');
    this.tone.set('error');
    this.message.set(
      `No puedo registrar ${failure.accelerator}. Otra aplicación ya lo está usando; elige otra combinación.`,
    );
    this.after(4200, () => {
      this.state.set('idle');
    });
  }

  /**
   * `setTimeout` con registro: guarda el id para poder cancelarlo al destruir el
   * componente y se olvida de él cuando ya se ejecutó, para que el Set no crezca.
   *
   * Devuelve el id para que quien lo pidió pueda cancelarlo antes de tiempo.
   */
  private after(delay: number, action: () => void): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, delay);
    this.timers.add(timer);
    return timer;
  }
}
