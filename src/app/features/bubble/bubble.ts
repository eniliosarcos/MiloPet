import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { MessageTone } from '../../core/interaction/interaction';

/**
 * La única salida de Milo: una burbuja de texto. Sin voz, por decisión.
 */
@Component({
  selector: 'app-bubble',
  templateUrl: './bubble.html',
  styleUrl: './bubble.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bubble {
  /** `required`: no existe una burbuja vacía. Quien la usa debe pasar texto. */
  readonly text = input.required<string>();
  /** El tono es semántico: lo decide el bucle, la burbuja solo lo pinta. */
  readonly tone = input<MessageTone>('neutral');
  /** Mientras es true, la burbuja se está desvaneciendo. El padre la retira al acabar. */
  readonly leaving = input(false);
  /** El usuario pidió cerrarla antes de que se desvanezca sola. */
  readonly dismiss = output<void>();
}
