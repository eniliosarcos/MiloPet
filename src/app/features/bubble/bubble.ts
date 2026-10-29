import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Los tonos que entiende la burbuja. Se modelan como unión de literales, no como
 * un string libre, para que `tone="errr"` sea un error de compilación.
 */
export type BubbleTone = 'neutral' | 'error';

/** La única salida de Milo: una burbuja de texto. Sin voz, por decisión. */
@Component({
  selector: 'app-bubble',
  templateUrl: './bubble.html',
  styleUrl: './bubble.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bubble {
  /** `required`: no existe una burbuja vacía. Quien la usa debe pasar texto. */
  readonly text = input.required<string>();
  readonly tone = input<BubbleTone>('neutral');
}
