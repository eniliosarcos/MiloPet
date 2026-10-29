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

/**
 * Orchestrates the whole interaction loop.
 *
 * Phase 1 only proves the spine: hotkey -> state machine -> bubble. The voice
 * pipeline replaces the stubbed `setTimeout` chain in phase 2, and the brain
 * replaces the canned message in phase 3.
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
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private interactive = false;
  private busy = false;

  protected readonly state = signal<MascotState>('idle');
  protected readonly message = signal('');
  protected readonly tone = signal<BubbleTone>('neutral');

  constructor() {
    const stopHotkey = this.milo.onHotkey(() => this.runInteractionLoop());
    const stopFailure = this.milo.onHotkeyFailed((failure) => this.reportHotkeyFailure(failure));

    // Keep the main process in sync. It owns the tray/logging layer later on.
    effect(() => this.milo.setState(this.state()));

    this.destroyRef.onDestroy(() => {
      stopHotkey();
      stopFailure();
      this.timers.forEach((timer) => clearTimeout(timer));
      this.timers.clear();
    });
  }

  /**
   * The mascot window starts click-through so it never steals a click. We flip
   * it back on only while the cursor is over the `[data-interactive]` hotspot.
   */
  @HostListener('window:mousemove', ['$event'])
  protected onPointerMove(event: MouseEvent): void {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const interactive = target?.closest('[data-interactive]') !== null;

    if (interactive !== this.interactive) {
      this.interactive = interactive;
      this.milo.setInteractive(interactive);
    }
  }

  private runInteractionLoop(): void {
    if (this.busy) return;
    this.busy = true;
    this.message.set('');
    this.tone.set('neutral');
    this.state.set('listening');

    // STUB: replaces with capture + VAD + Whisper in phase 2, then with the
    // intent router in phase 3. The timing is intentionally visible so we can
    // feel the loop before adding real latency.
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
        });
      });
    });
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

  private after(delay: number, action: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, delay);
    this.timers.add(timer);
  }
}
