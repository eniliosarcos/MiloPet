import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import type { SttStatus } from '../../../shared/ipc';
import { MILO } from '../../core/milo/milo-bridge';
import { settingsMessage } from '../../core/stt/failure';

/**
 * La pantalla de ajustes.
 *
 * Es la primera superficie de configuración del proyecto y existe por una razón
 * concreta: la clave de Groq la pone cada usuario, porque una clave dentro del
 * instalador es una clave regalada a quien sepa descomprimir el binario.
 *
 * Aquí se escribe, se valida y se borra la clave. Nunca se lee: el proceso main
 * no la devuelve, solo dice si está puesta.
 */
@Component({
  selector: 'app-settings',
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  private readonly milo = inject(MILO);

  protected readonly status = signal<SttStatus | null>(null);
  protected readonly draft = signal('');
  protected readonly saving = signal(false);
  protected readonly feedback = signal<{ tone: 'ok' | 'error'; text: string } | null>(null);

  constructor() {
    void this.milo.getSttStatus().then((status) => this.status.set(status));
  }

  protected get configured(): boolean {
    return this.status()?.configured === true;
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected async save(): Promise<void> {
    const key = this.draft().trim();
    if (!key || this.saving()) return;

    this.saving.set(true);
    this.feedback.set(null);

    const result = await this.milo.setSttKey(key);

    this.saving.set(false);

    if (!result.ok) {
      this.feedback.set({ tone: 'error', text: settingsMessage(result.failure) });
      return;
    }

    // La clave se vacía del campo al guardarla: no hay motivo para dejarla a la
    // vista en una ventana que puede quedar abierta.
    this.draft.set('');
    this.status.set(result.status);
    this.feedback.set({ tone: 'ok', text: 'Clave guardada y verificada. Milo ya puede oírte.' });
  }

  protected async clear(): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.feedback.set(null);

    const status = await this.milo.clearSttKey();

    this.saving.set(false);
    this.status.set(status);
    this.feedback.set({
      tone: 'ok',
      text: 'Clave borrada. Milo pedirá una nueva para transcribir.',
    });
  }
}
