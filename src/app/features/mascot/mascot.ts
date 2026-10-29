import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

import type { MascotState } from '../../../shared/ipc';
import { GAZE_MAX, GAZE_VERTICAL, eyeScales, gazeToward, type EyeScale, type Gaze } from './gaze';

/** Lado del `viewBox` del SVG. Todas las coordenadas del dibujo viven aquí. */
const VIEWBOX = 200;

/** Centro de los ojos en el viewBox. El overlay de zonas lo comparte. */
const EYE_Y = 108;

/**
 * El cuerpo de Milo, dibujado entero en código.
 *
 * Cada parte del dibujo es una forma que reacciona al input `state`, así que la
 * personalidad vive en parámetros y no en assets de arte. Además del estado, el
 * componente mide dónde está el cursor y mueve los ojos hacia él: es la única
 * animación que no viene de CSS puro, porque depende del ratón.
 *
 * Al ser un `input` normal (no `input.required`), si nadie le pasa el estado se
 * queda en `idle`: el componente nunca rompe la vista por falta de datos.
 */
@Component({
  selector: 'app-mascot',
  templateUrl: './mascot.html',
  styleUrl: './mascot.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mascot {
  readonly state = input<MascotState>('idle');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly gaze = signal<Gaze | null>(null);

  /** Con el cursor cerca, el barrido automático de CSS se apaga. */
  protected readonly tracking = computed(() => this.gaze() !== null);

  /**
   * El desplazamiento viaja como propiedad individual `translate`, no como
   * `transform`: los estados ya usan `transform` en este mismo grupo y así las
   * dos cosas se componen en vez de pisarse.
   */
  protected readonly gazeOffset = computed(() => {
    const gaze = this.gaze();
    if (gaze === null) return '0px 0px';

    const x = (gaze.x * GAZE_MAX).toFixed(2);
    const y = (gaze.y * GAZE_MAX * GAZE_VERTICAL).toFixed(2);
    return `${x}px ${y}px`;
  });

  /**
   * La pareja gana profundidad: el ojo hacia el que mira encoge y se angosta, y
   * el otro crece un poco. `toFixed` como en `gazeOffset`: el navegador no
   * necesita más precisión y el atributo queda legible.
   *
   * Va como `transform` de un grupo interno, no como la propiedad individual
   * `scale` sobre el ojo: el ojo ya anima `transform` con el parpadeo y, en
   * cuanto hay una animación de `transform` en el mismo elemento, Chromium deja
   * de pintar la `scale` individual sobre SVG. El layout sí la aplica —las
   * medidas cambian—, así que el efecto parecía funcionar en las pruebas y no se
   * veía en pantalla. Un grupo propio no compite con nadie.
   */
  protected readonly eyeScale = computed(() => {
    const { left, right } = eyeScales(this.gaze());
    const css = (scale: EyeScale): string => `scale(${scale.x.toFixed(2)}, ${scale.y.toFixed(2)})`;

    return { left: css(left), right: css(right) };
  });

  /**
   * La ventana es click-through, pero `setIgnoreMouseEvents(true, { forward:
   * true })` reenvía cada `mousemove` que cae dentro de ella. Ese es el único
   * sensor disponible: fuera de la ventana el renderer no ve el cursor. Como la
   * ventana está ajustada al personaje, "cerca" es, en la práctica, encima de él.
   */
  @HostListener('window:mousemove', ['$event'])
  protected onPointerMove(event: MouseEvent): void {
    const rect = this.host.nativeElement.getBoundingClientRect();

    // El SVG es cuadrado (200x200) y `xMidYMid` lo encaja en la caja del
    // componente: hay que reproducir ese encaje para saber dónde caen los ojos.
    const size = Math.min(rect.width, rect.height);
    const eyeX = rect.left + rect.width / 2;
    const eyeY = rect.top + (rect.height - size) / 2 + (size * EYE_Y) / VIEWBOX;

    this.gaze.set(gazeToward(event.clientX - eyeX, event.clientY - eyeY, size));
  }

  /**
   * Al salir de la ventana no llega ningún `mousemove` más: sin este reset la
   * mirada se quedaría clavada en el borde por donde se fue el ratón.
   */
  @HostListener('window:mouseout', ['$event'])
  protected onPointerOut(event: MouseEvent): void {
    if (event.relatedTarget === null) this.gaze.set(null);
  }
}
