import { TestBed } from '@angular/core/testing';

import type { MiloBridge } from '../shared/ipc';
import { App } from './app';
import { MILO } from './core/milo/milo-bridge';

/**
 * Sustituto mínimo del puente de Electron, para poder probar la máquina de
 * estados sin abrir una ventana real.
 *
 * `onHotkey` guarda el handler y lo expone como `pressHotkey`, así el test puede
 * simular la pulsación del atajo global desde dentro.
 */
function createFakeBridge() {
  let press: (() => void) | null = null;

  const bridge: MiloBridge = {
    onHotkey(handler) {
      press = handler;
      return () => {
        press = null;
      };
    },
    onHotkeyFailed() {
      return () => undefined;
    },
    setInteractive() {
      /* sin efecto */
    },
    async getConfig() {
      return { hotkey: 'CommandOrControl+Shift+Space' };
    },
    async setHotkey(accelerator) {
      return { ok: true, accelerator };
    },
    setState() {
      /* sin efecto */
    },
    quit() {
      /* sin efecto */
    },
  };

  return { bridge, pressHotkey: () => press?.() };
}

describe('App', () => {
  let fake: ReturnType<typeof createFakeBridge>;

  beforeEach(async () => {
    fake = createFakeBridge();

    await TestBed.configureTestingModule({
      imports: [App],
      // El token MILO se reemplaza por el falso: la app no sabe que no hay
      // Electron detrás.
      providers: [{ provide: MILO, useValue: fake.bridge }],
    }).compileComponents();
  });

  it('dibuja al personaje en estado idle', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const stage = fixture.nativeElement.querySelector('.stage') as HTMLElement;
    expect(stage.getAttribute('data-state')).toBe('idle');
    expect(fixture.nativeElement.querySelector('app-mascot')).toBeTruthy();
  });

  it('empieza a escuchar cuando se dispara el atajo', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();

    const stage = fixture.nativeElement.querySelector('.stage') as HTMLElement;
    expect(stage.getAttribute('data-state')).toBe('listening');
  });
});
