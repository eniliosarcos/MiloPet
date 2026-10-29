import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

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

/** Tiempos del bucle, repetidos aquí a propósito: si cambian en `app.ts`, el test falla. */
const LISTENING_MS = 1500;
const THINKING_MS = 900;
const ACTING_MS = 3200;
const BUBBLE_VISIBLE_MS = 4000;
const BUBBLE_FADE_MS = 420;

const findBubble = (fixture: ComponentFixture<App>) =>
  fixture.nativeElement.querySelector('.bubble') as HTMLElement | null;

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

  afterEach(() => {
    vi.useRealTimers();
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

  it('muestra el mensaje al actuar y lo desvanece solo', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    vi.advanceTimersByTime(LISTENING_MS + THINKING_MS);
    fixture.detectChanges();

    expect(findBubble(fixture)?.textContent?.trim()).toContain('columna vertebral');

    // Vuelve a idle y arranca la cuenta de lectura.
    vi.advanceTimersByTime(ACTING_MS);
    fixture.detectChanges();
    expect(findBubble(fixture)).not.toBeNull();

    // Un segundo antes del límite el mensaje sigue entero.
    vi.advanceTimersByTime(BUBBLE_VISIBLE_MS - 1000);
    fixture.detectChanges();
    expect(findBubble(fixture)?.classList.contains('bubble-wrap--leaving')).toBe(false);

    // Al cumplirse el tiempo entra en desvanecido, pero aún se lee.
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(findBubble(fixture)?.closest('.bubble-wrap--leaving')).not.toBeNull();

    // Terminado el desvanecido, desaparece del DOM.
    vi.advanceTimersByTime(BUBBLE_FADE_MS);
    fixture.detectChanges();
    expect(findBubble(fixture)).toBeNull();
  });

  it('deja que la (x) cierre el mensaje antes de tiempo', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    vi.advanceTimersByTime(LISTENING_MS + THINKING_MS);
    fixture.detectChanges();

    const close = fixture.nativeElement.querySelector('.bubble__close') as HTMLButtonElement;
    expect(close).toBeTruthy();

    close.click();
    // La (x) no borra el texto de golpe: dispara el mismo desvanecido.
    fixture.detectChanges();
    expect(findBubble(fixture)?.closest('.bubble-wrap--leaving')).not.toBeNull();

    vi.advanceTimersByTime(BUBBLE_FADE_MS);
    fixture.detectChanges();
    expect(findBubble(fixture)).toBeNull();
  });

  it('la (x) vive dentro de una zona interactiva o sería un botón muerto en Electron', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    vi.advanceTimersByTime(LISTENING_MS + THINKING_MS);
    fixture.detectChanges();

    // `app.ts` desbloquea los clics de la ventana solo donde `elementFromPoint`
    // encuentra `[data-interactive]`. El hotspot del personaje está abajo, así
    // que la burbuja debe traer el suyo o la (x) no recibe ni un clic.
    const wrapper = fixture.nativeElement.querySelector('.bubble-wrap') as HTMLElement;
    expect(wrapper.hasAttribute('data-interactive')).toBe(true);
    expect(wrapper.contains(fixture.nativeElement.querySelector('.bubble__close'))).toBe(true);
  });

  it('una pulsación nueva descarta el mensaje que estaba desvaneciéndose', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    vi.advanceTimersByTime(LISTENING_MS + THINKING_MS + ACTING_MS);
    fixture.detectChanges();

    const close = fixture.nativeElement.querySelector('.bubble__close') as HTMLButtonElement;
    close.click();
    fixture.detectChanges();
    expect(findBubble(fixture)?.closest('.bubble-wrap--leaving')).not.toBeNull();

    // Llega otra interacción en mitad del desvanecido: debe ganar la nueva y no
    // quedar un timer viejo que borre el mensaje recién creado.
    fake.pressHotkey();
    fixture.detectChanges();
    expect(findBubble(fixture)).toBeNull();

    vi.advanceTimersByTime(LISTENING_MS + THINKING_MS);
    fixture.detectChanges();
    expect(findBubble(fixture)?.textContent?.trim()).toContain('columna vertebral');
  });

  it('el agarre para arrastrar vive dentro de la zona interactiva', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    // `app-region: drag` solo arrastra si el sistema operativo puede hacer
    // hit-test sobre la ventana, y eso depende de que el hotspot siga llevando
    // `data-interactive`. Si alguien mueve el agarre fuera, el arrastre deja de
    // arrancar sin lanzar ningún error: solo "no responde".
    const grip = fixture.nativeElement.querySelector('.hotspot__grip') as HTMLElement | null;
    expect(grip).not.toBeNull();
    expect(grip?.closest('[data-interactive]')).not.toBeNull();
  });

  it('el modo dev de zonas se enciende solo con ?zones=1', () => {
    // El overlay no puede aparecer por accidente en la ventana real: se pinta
    // encima del personaje y confundiría cualquier captura.
    const plain = TestBed.createComponent(App);
    plain.detectChanges();
    expect(plain.nativeElement.querySelector('.mascot__zones')).toBeNull();
    expect(plain.nativeElement.querySelector('.stage__frame')).toBeNull();

    history.replaceState({}, '', '/?zones=1');
    try {
      const debug = TestBed.createComponent(App);
      debug.detectChanges();

      const stage = debug.nativeElement.querySelector('.stage') as HTMLElement;
      expect(stage.classList.contains('stage--zones')).toBe(true);
      expect(debug.nativeElement.querySelector('.mascot__zones')).not.toBeNull();

      // El marco dice el tamaño del mundo en la misma unidad que el CSS: sin
      // eso, el borde violeta es un adorno que no se puede convertir a medidas.
      const frame = debug.nativeElement.querySelector('.stage__frame');
      expect(frame).not.toBeNull();
      expect(frame.querySelector('.stage__frame-size').textContent).toContain(`${innerWidth}`);
    } finally {
      history.replaceState({}, '', '/');
    }
  });
});
