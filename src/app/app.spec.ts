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
  /** Pasos del arrastre en orden: `start`, `move`, `end`. */
  const drag: string[] = [];

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
    startDrag() {
      drag.push('start');
    },
    moveDrag() {
      drag.push('move');
    },
    endDrag() {
      drag.push('end');
    },
    setState() {
      /* sin efecto */
    },
    quit() {
      /* sin efecto */
    },
  };

  return { bridge, drag, pressHotkey: () => press?.() };
}

/**
 * jsdom no implementa la captura de puntero. El componente la usa para no
 * perder el gesto cuando el cursor sale de la ventana, así que aquí se simula:
 * lo que se prueba es la máquina de estados, no la implementación del navegador.
 */
function stubPointerCapture(): void {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    value: () => undefined,
    writable: true,
    configurable: true,
  });
}

/**
 * jsdom tampoco tiene `PointerEvent`. Un `MouseEvent` con `pointerId` añadido
 * basta: Angular solo escucha el nombre del evento y el código lee `button`,
 * `buttons` y `currentTarget`.
 */
function pointer(type: string, init: MouseEventInit = {}, pointerId = 1): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

/** Tiempos del bucle, repetidos aquí a propósito: si cambian en `app.ts`, el test falla. */
const LISTENING_MS = 1500;
const THINKING_MS = 900;
const ACTING_MS = 3200;
const BUBBLE_VISIBLE_MS = 4000;
const BUBBLE_FADE_MS = 420;
const DRAG_MAX_MS = 30_000;

const findBubble = (fixture: ComponentFixture<App>) =>
  fixture.nativeElement.querySelector('.bubble') as HTMLElement | null;

describe('App', () => {
  let fake: ReturnType<typeof createFakeBridge>;

  beforeEach(async () => {
    fake = createFakeBridge();
    stubPointerCapture();

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

  it('arrastra la ventana por IPC: pointerdown, pasos y pointerup', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const hotspot = fixture.nativeElement.querySelector('.hotspot') as HTMLElement;
    // El hotspot es la única superficie de arrastre. Si alguien quita
    // `data-interactive`, la ventana nunca se vuelve interactiva y el
    // `pointerdown` se va al escritorio: el gesto deja de arrancar sin error.
    expect(hotspot.hasAttribute('data-interactive')).toBe(true);

    hotspot.dispatchEvent(pointer('pointerdown', { button: 0, buttons: 1 }));
    expect(fake.drag).toEqual(['start']);

    hotspot.dispatchEvent(pointer('pointermove', { buttons: 1 }));
    hotspot.dispatchEvent(pointer('pointermove', { buttons: 1 }));
    expect(fake.drag).toEqual(['start', 'move', 'move']);

    hotspot.dispatchEvent(pointer('pointerup', { buttons: 0 }));
    expect(fake.drag).toEqual(['start', 'move', 'move', 'end']);
  });

  it('ignora los pasos de arrastre si no hay gesto en curso', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const hotspot = fixture.nativeElement.querySelector('.hotspot') as HTMLElement;
    hotspot.dispatchEvent(pointer('pointermove', { buttons: 1 }));
    hotspot.dispatchEvent(pointer('pointerup', { buttons: 0 }));

    // Sin `pointerdown` previo, el main no tiene origen de arrastre: mover sería
    // un salto de la ventana a un punto arbitrario.
    expect(fake.drag).toEqual([]);
  });

  it('un pointermove sin botón pulsado cierra el arrastre perdido', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const hotspot = fixture.nativeElement.querySelector('.hotspot') as HTMLElement;
    hotspot.dispatchEvent(pointer('pointerdown', { button: 0, buttons: 1 }));
    expect(fake.drag).toEqual(['start']);

    // El `pointerup` ocurrió fuera de la ventana y no llegó: el siguiente
    // movimiento lo delata porque `buttons` ya vale 0.
    hotspot.dispatchEvent(pointer('pointermove', { buttons: 0 }));
    expect(fake.drag).toEqual(['start', 'end']);

    // Y no sigue mandando pasos.
    hotspot.dispatchEvent(pointer('pointermove', { buttons: 1 }));
    expect(fake.drag).toEqual(['start', 'end']);
  });

  it('perder el foco cierra el arrastre aunque no llegue el pointerup', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const hotspot = fixture.nativeElement.querySelector('.hotspot') as HTMLElement;
    hotspot.dispatchEvent(pointer('pointerdown', { button: 0, buttons: 1 }));

    window.dispatchEvent(new Event('blur'));
    expect(fake.drag).toEqual(['start', 'end']);
  });

  it('el tope de tiempo cierra un arrastre que se quedó pegado', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const hotspot = fixture.nativeElement.querySelector('.hotspot') as HTMLElement;
    hotspot.dispatchEvent(pointer('pointerdown', { button: 0, buttons: 1 }));
    expect(fake.drag).toEqual(['start']);

    vi.advanceTimersByTime(DRAG_MAX_MS - 1);
    expect(fake.drag).toEqual(['start']);

    vi.advanceTimersByTime(1);
    expect(fake.drag).toEqual(['start', 'end']);
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
