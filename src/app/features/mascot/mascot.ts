import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { MascotState } from '../../../shared/ipc';

/**
 * Milo's body, drawn entirely in code.
 *
 * Every visual is a shape driven by the `state` input, so personality lives in
 * parameters instead of art assets. For now the transitions are CSS keyframes;
 * phase 1 replaces them with springs so the body reacts to cursor impulses
 * instead of just looping.
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
