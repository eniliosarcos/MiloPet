import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BubbleTone = 'neutral' | 'error';

/** Milo's only output channel: a plain text bubble. No voice, by design. */
@Component({
  selector: 'app-bubble',
  templateUrl: './bubble.html',
  styleUrl: './bubble.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bubble {
  readonly text = input.required<string>();
  readonly tone = input<BubbleTone>('neutral');
}
