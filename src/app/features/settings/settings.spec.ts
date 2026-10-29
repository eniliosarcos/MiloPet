import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import type { MiloBridge, SttStatus } from '../../../shared/ipc';
import { MILO } from '../../core/milo/milo-bridge';
import { Settings } from './settings';

/**
 * Puente mínimo para la pantalla de ajustes.
 *
 * `getSttStatus` y `clearSttKey` devuelven el estado que diga el test; `setSttKey`
 * se puede hacer fallar sin tocar la red.
 */
function createBridge(initial: SttStatus) {
  let status = initial;

  const bridge = {
    getSttStatus: vi.fn(async () => status),
    setSttKey: vi.fn(async (key: string) => {
      if (key === 'mala') return { ok: false as const, failure: 'auth' as const };
      status = { configured: true, provider: 'deepgram' as const };
      return { ok: true as const, status };
    }),
    clearSttKey: vi.fn(async () => {
      status = { configured: false, provider: null };
      return status;
    }),
  } as unknown as MiloBridge;

  return {
    bridge,
    get status() {
      return status;
    },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Settings', () => {
  it('avisa de que no hay clave y no ofrece borrar', async () => {
    const fake = createBridge({ configured: false, provider: null });
    TestBed.configureTestingModule({
      imports: [Settings],
      providers: [{ provide: MILO, useValue: fake.bridge }],
    });

    const fixture = TestBed.createComponent(Settings);
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.settings__quiet')).toBeNull();
    expect(
      (fixture.nativeElement.querySelector('.settings__input') as HTMLInputElement).placeholder,
    ).toContain('API key');
  });

  it('guarda una clave válida y vacía el campo', async () => {
    const fake = createBridge({ configured: false, provider: null });
    TestBed.configureTestingModule({
      imports: [Settings],
      providers: [{ provide: MILO, useValue: fake.bridge }],
    });

    const fixture = TestBed.createComponent(Settings);
    await flush();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.settings__input') as HTMLInputElement;
    input.value = 'gsk_buena';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.settings__button') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();

    expect(fake.bridge.setSttKey).toHaveBeenCalledWith('gsk_buena');
    // La clave no se queda escrita en la ventana después de guardarla.
    expect(input.value).toBe('');
    expect(fixture.nativeElement.querySelector('.settings__note')?.textContent).toContain(
      'guardada',
    );
  });

  it('no acepta una clave que el proveedor rechaza', async () => {
    const fake = createBridge({ configured: false, provider: null });
    TestBed.configureTestingModule({
      imports: [Settings],
      providers: [{ provide: MILO, useValue: fake.bridge }],
    });

    const fixture = TestBed.createComponent(Settings);
    await flush();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.settings__input') as HTMLInputElement;
    input.value = 'mala';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.settings__button') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();

    const note = fixture.nativeElement.querySelector('.settings__note') as HTMLElement;
    expect(note.getAttribute('data-tone')).toBe('error');
    expect(note.textContent).toContain('no es válida');
    expect(fake.status.configured).toBe(false);
  });

  it('borra la clave guardada', async () => {
    const fake = createBridge({ configured: true, provider: 'deepgram' });
    TestBed.configureTestingModule({
      imports: [Settings],
      providers: [{ provide: MILO, useValue: fake.bridge }],
    });

    const fixture = TestBed.createComponent(Settings);
    await flush();
    fixture.detectChanges();

    const clear = fixture.nativeElement.querySelector('.settings__quiet') as HTMLButtonElement;
    expect(clear).not.toBeNull();

    clear.click();
    await flush();
    fixture.detectChanges();

    expect(fake.bridge.clearSttKey).toHaveBeenCalled();
    expect(fake.status.configured).toBe(false);
    expect(fixture.nativeElement.querySelector('.settings__quiet')).toBeNull();
  });
});
