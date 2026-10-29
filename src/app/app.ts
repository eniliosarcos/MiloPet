import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  effect,
  inject,
  signal,
} from '@angular/core';

import { Interaction } from './core/interaction/interaction';
import { MILO } from './core/milo/milo-bridge';
import { Bubble } from './features/bubble/bubble';
import { Mascot } from './features/mascot/mascot';

/**
 * Tope de seguridad del arrastre.
 *
 * Si el sistema pierde el `pointerup` (Alt+Tab a media pulsación, un diálogo
 * que roba el foco, el cursor fuera de la ventana), el arrastre no puede
 * quedarse pegado al ratón indefinidamente. Treinta segundos cubren de sobra un
 * gesto real; más allá, algo se rompió.
 */
const DRAG_MAX_MS = 30_000;

/**
 * La ventana de Milo: dibuja, arrastra y traduce el ratón.
 *
 * El bucle de interacción (atajo → escuchar → pensar → responder) vive en
 * `core/interaction/interaction.ts`: depende del micrófono, así que no puede
 * quedar dentro de un componente que además dibuja y arrastra. Aquí queda lo que
 * es de la ventana.
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
  private readonly interaction = inject(Interaction);
  private readonly destroyRef = inject(DestroyRef);
  /** Timers pendientes, para poder cancelarlos si el componente se destruye. */
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  /**
   * Elemento que capturó el puntero durante un arrastre. `null` significa que
   * no hay gesto en curso, y es la única fuente de verdad: todos los caminos de
   * fin pasan por `stopDrag()`, que es idempotente.
   */
  private dragTarget: HTMLElement | null = null;
  private dragTimer: ReturnType<typeof setTimeout> | undefined;
  private interactive = false;

  // El estado de la interacción se publica tal cual: la plantilla no cambia y
  // el componente no necesita envolver señales que ya son suyas.
  protected readonly state = this.interaction.state;
  protected readonly message = this.interaction.message;
  protected readonly tone = this.interaction.tone;
  protected readonly leaving = this.interaction.leaving;

  /**
   * Modo dev de zonas: pinta los límites que no se ven (caja interactiva,
   * región de arrastre y alcance de la mirada). Se enciende con `?zones=1` en
   * la URL; en la ventana real lo añade `MILOPET_ZONES=1` (`npm run dev:zones`).
   *
   * No hay atajo de teclado a propósito: la ventana es click-through y casi
   * nunca tiene el foco, así que un `keydown` sería un botón muerto.
   */
  protected readonly zones = signal(new URLSearchParams(location.search).has('zones'));

  /**
   * El tamaño del mundo, para leerlo junto al borde que pinta el overlay.
   *
   * Se mide una vez porque la ventana no se puede redimensionar. `innerWidth` y
   * `innerHeight` son el viewport en píxeles CSS, que es la misma unidad en la
   * que están escritas `.hotspot` y `.hotspot__grip`: así los números del marco
   * se pueden comparar con los porcentajes del CSS sin convertir nada.
   */
  protected readonly frameSize = `${innerWidth} × ${innerHeight} px`;

  constructor() {
    // `void`: el bucle no devuelve nada que la vista necesite, y sin este
    // marcador el linter avisa de una promesa flotante.
    const stopHotkey = this.milo.onHotkey(() => void this.interaction.start());
    const stopFailure = this.milo.onHotkeyFailed((failure) => this.interaction.failHotkey(failure));

    // Mantiene al proceso main al día del estado. Allí vivirá la bandeja y el
    // registro de actividad más adelante. `effect` se vuelve a ejecutar cada vez
    // que cambia `state()`, sin necesidad de suscripciones manuales.
    effect(() => this.milo.setState(this.state()));

    // Las tres bajas son obligatorias: si no, al destruir el componente quedan
    // listeners y timers vivos apuntando a una instancia que ya no existe.
    this.destroyRef.onDestroy(() => {
      stopHotkey();
      stopFailure();
      // Un arrastre abierto al destruir el componente dejaría el estado del
      // proceso main a medias y la posición sin guardar.
      this.stopDrag();
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

  /**
   * Empieza a arrastrar la ventana por IPC.
   *
   * `setPointerCapture` es la pieza que hace robusto el gesto: sin captura, el
   * primer `pointermove` que cae fuera de la ventana (arrastrando rápido) se
   * pierde y la ventana se queda atrás. Con captura, el elemento sigue
   * recibiendo eventos aunque el cursor salga de sus límites.
   */
  protected startDrag(event: PointerEvent): void {
    if (event.button !== 0 || this.dragTarget) return;

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    this.dragTarget = target;
    this.milo.startDrag();
    this.dragTimer = this.after(DRAG_MAX_MS, () => this.stopDrag());
  }

  /**
   * Un paso del arrastre. No manda coordenadas a propósito: el proceso main
   * relee el cursor de pantalla, porque `clientX` es relativo a la ventana que
   * se está moviendo y se realimenta.
   */
  protected dragStep(event: PointerEvent): void {
    if (!this.dragTarget) return;

    // Sin botón pulsado, el `pointerup` se perdió. Es la red más barata: el
    // siguiente movimiento ya lo delata, sin esperar al tope de tiempo.
    if (event.buttons === 0) {
      this.stopDrag();
      return;
    }

    this.milo.moveDrag();
  }

  /**
   * Fin del arrastre. Es idempotente porque lo llaman cinco caminos:
   * `pointerup`, `pointercancel`, `lostpointercapture`, `blur` y el tope de
   * tiempo.
   */
  protected stopDrag(): void {
    if (!this.dragTarget) return;

    this.dragTarget = null;
    this.cancelDragTimer();
    this.milo.endDrag();
  }

  /**
   * Alt+Tab, un diálogo del sistema o el foco que se va a otra ventana: el
   * `pointerup` no siempre llega, así que perder el foco también cierra el
   * arrastre.
   */
  @HostListener('window:blur')
  protected onWindowBlur(): void {
    this.stopDrag();
  }

  /** La (x) de la burbuja: el bucle decide si se puede cerrar y cómo. */
  protected closeBubble(): void {
    this.interaction.closeBubble();
  }

  private cancelDragTimer(): void {
    if (this.dragTimer === undefined) return;

    clearTimeout(this.dragTimer);
    this.timers.delete(this.dragTimer);
    this.dragTimer = undefined;
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
