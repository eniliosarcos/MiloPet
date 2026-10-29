import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { MascotState } from '../../../shared/ipc';

/**
 * El cuerpo de Milo, dibujado entero en código.
 *
 * Cada parte del dibujo es una forma que reacciona al input `state`, así que la
 * personalidad vive en parámetros y no en assets de arte. Por ahora las
 * transiciones son keyframes de CSS; más adelante se cambian por muelles
 * (springs) para que el cuerpo responda a impulsos del cursor en vez de solo
 * repetir un bucle.
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
}
