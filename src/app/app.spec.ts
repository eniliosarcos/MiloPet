import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import type { MiloBridge, SttFailure, TranscribeResult } from '../shared/ipc';
import { App } from './app';
import { VOICE, type CaptureResult, type VoiceCapture } from './core/audio/capture';
import { MILO } from './core/milo/milo-bridge';

/**
 * Sustituto mínimo del puente de Electron, para poder probar la máquina de
 * estados sin abrir una ventana real.
 *
 * La transcripción es una promesa que el test resuelve a mano: así se puede
 * comprobar que `thinking` dura lo que dura el proveedor y no un temporizador.
 */
function createFakeBridge() {
  let press: (() => void) | null = null;
  /** Pasos del arrastre en orden: `start`, `move`, `end`. */
  const drag: string[] = [];
  let settingsOpened = 0;
  /** Transcripción pendiente: la resuelve el test con `respond` o `reject`. */
  let answer: ((result: TranscribeResult) => void) | null = null;

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
    transcribe() {
      return new Promise<TranscribeResult>((resolve) => {
        answer = resolve;
      });
    },
    async getSttStatus() {
      return { configured: true, provider: 'groq' };
    },
    async setSttKey() {
      return { ok: true, status: { configured: true, provider: 'groq' } };
    },
    async clearSttKey() {
      return { configured: false, provider: null };
    },
    openSettings() {
      settingsOpened += 1;
    },
    quit() {
      /* sin efecto */
    },
  };

  return {
    bridge,
    drag,
    pressHotkey: () => press?.(),
    get settingsOpened() {
      return settingsOpened;
    },
    get transcribing() {
      return answer !== null;
    },
    respond(text: string) {
      const resolve = answer;
      answer = null;
      resolve?.({ ok: true, text });
    },
    reject(failure: SttFailure) {
      const resolve = answer;
      answer = null;
      resolve?.({ ok: false, failure });
    },
  };
}

/**
 * Micrófono de mentira.
 *
 * jsdom no tiene `getUserMedia`, y aunque lo tuviera no queremos un dispositivo
 * real en CI. El test decide cuándo termina la frase (`heard`), cuándo no se dijo
 * nada (`silent`) y cuándo el permiso falla (`broken`).
 */
function createFakeVoice() {
  let settle: ((result: CaptureResult) => void) | null = null;
  let reject: ((error: Error) => void) | null = null;
  let listening = false;

  /** Muestras de relleno: el VAD no se prueba aquí, solo el cableado. */
  const clip = (heardSpeech: boolean, durationMs: number): CaptureResult => ({
    heardSpeech,
    durationMs,
    pcm: new Float32Array(16),
    sampleRate: 48_000,
  });

  const capture: VoiceCapture = {
    listen() {
      listening = true;
      return new Promise<CaptureResult>((resolve, fail) => {
        settle = (result) => {
          listening = false;
          settle = null;
          reject = null;
          resolve(result);
        };
        reject = (error) => {
          listening = false;
          settle = null;
          reject = null;
          fail(error);
        };
      });
    },
    dispose() {
      listening = false;
      settle = null;
      reject = null;
    },
  };

  return {
    capture,
    get listening() {
      return listening;
    },
    heard(durationMs = 1200) {
      settle?.(clip(true, durationMs));
    },
    silent() {
      settle?.(clip(false, 6000));
    },
    broken(message = 'No tengo permiso para usar el micrófono.') {
      reject?.(new Error(message));
    },
  };
}

/**
 * Deja correr las microtareas.
 *
 * Cada `await` del bucle (captura, transcripción) necesita su vuelta. Dos
 * bastan para el camino más largo: la captura resuelve y, con ella, la
 * transcripción arranca.
 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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

/**
 * Tiempos del bucle, repetidos aquí a propósito: si cambian en
 * `core/interaction/interaction.ts`, el test falla.
 *
 * `thinking` ya no está: su duración la decide el proveedor de voz.
 */
const ACTING_MS = 3200;
const BUBBLE_VISIBLE_MS = 4000;
const BUBBLE_FADE_MS = 420;
const ERROR_MS = 4200;
const DRAG_MAX_MS = 30_000;

const findBubble = (fixture: ComponentFixture<App>) =>
  fixture.nativeElement.querySelector('.bubble') as HTMLElement | null;

const stateOf = (fixture: ComponentFixture<App>) =>
  (fixture.nativeElement.querySelector('.stage') as HTMLElement).getAttribute('data-state');

describe('App', () => {
  let fake: ReturnType<typeof createFakeBridge>;
  let voice: ReturnType<typeof createFakeVoice>;

  beforeEach(async () => {
    fake = createFakeBridge();
    voice = createFakeVoice();
    stubPointerCapture();

    await TestBed.configureTestingModule({
      imports: [App],
      // El token MILO se reemplaza por el falso: la app no sabe que no hay
      // Electron detrás. Lo mismo con el micrófono, que en jsdom no existe.
      providers: [
        { provide: MILO, useValue: fake.bridge },
        { provide: VOICE, useValue: voice.capture },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dibuja al personaje en estado idle', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(stateOf(fixture)).toBe('idle');
    expect(fixture.nativeElement.querySelector('app-mascot')).toBeTruthy();
  });

  it('empieza a escuchar cuando se dispara el atajo', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();

    // `listening` significa "micrófono abierto", no "esperando 1,5 s".
    expect(stateOf(fixture)).toBe('listening');
    expect(voice.listening).toBe(true);
  });

  it('sigue escuchando hasta que el VAD cierra la frase', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();

    // El reloj avanza y el estado no cambia: no hay constante que lo apague.
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();
    expect(stateOf(fixture)).toBe('listening');

    voice.heard();
    await flush();
    fixture.detectChanges();
    expect(stateOf(fixture)).toBe('thinking');
  });

  it('piensa mientras el proveedor transcribe, no un tiempo fijo', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    voice.heard();
    await flush();
    fixture.detectChanges();

    // La transcripción está en vuelo: nadie la ha resuelto todavía.
    expect(stateOf(fixture)).toBe('thinking');
    expect(fake.transcribing).toBe(true);

    fake.respond('Hola Milo');
    await flush();
    fixture.detectChanges();

    expect(stateOf(fixture)).toBe('acting');
    expect(findBubble(fixture)?.textContent?.trim()).toBe('Hola Milo');
  });

  it('muestra lo transcrito y lo desvanece solo', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    voice.heard();
    await flush();
    fixture.detectChanges();
    fake.respond('Ponme música');
    await flush();
    fixture.detectChanges();

    expect(stateOf(fixture)).toBe('acting');
    expect(findBubble(fixture)?.textContent?.trim()).toBe('Ponme música');

    // Vuelve a idle y arranca la cuenta de lectura.
    vi.advanceTimersByTime(ACTING_MS);
    fixture.detectChanges();
    expect(stateOf(fixture)).toBe('idle');
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

  it('no responde si no se oyó nada', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    voice.silent();
    await flush();
    fixture.detectChanges();

    // Pulsar y callarse no es un error: se vuelve a idle sin mensaje.
    expect(stateOf(fixture)).toBe('idle');
    expect(findBubble(fixture)).toBeNull();

    // Y el bucle queda libre para la siguiente pulsación.
    fake.pressHotkey();
    fixture.detectChanges();
    expect(stateOf(fixture)).toBe('listening');
  });

  it('no responde si el proveedor devuelve texto vacío', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    voice.heard();
    await flush();
    fixture.detectChanges();
    fake.respond('   ');
    await flush();
    fixture.detectChanges();

    // Ruido que pasó el VAD pero no es una frase: no hay nada que decir.
    expect(stateOf(fixture)).toBe('idle');
    expect(findBubble(fixture)).toBeNull();
  });

  it('cuenta el fallo del micrófono y aparta el mensaje solo', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    voice.broken();
    await flush();
    fixture.detectChanges();

    expect(stateOf(fixture)).toBe('error');
    expect(findBubble(fixture)?.getAttribute('data-tone')).toBe('error');
    expect(findBubble(fixture)?.textContent?.trim()).toContain('permiso');

    // Un mensaje de error no puede quedarse en pantalla para siempre: ese era
    // el defecto de la primera versión.
    vi.advanceTimersByTime(ERROR_MS);
    fixture.detectChanges();
    expect(stateOf(fixture)).toBe('idle');
    expect(findBubble(fixture)).not.toBeNull();

    vi.advanceTimersByTime(BUBBLE_VISIBLE_MS + BUBBLE_FADE_MS);
    fixture.detectChanges();
    expect(findBubble(fixture)).toBeNull();
  });

  it('explica que falta la clave en vez de quedarse callado', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    voice.heard();
    await flush();
    fixture.detectChanges();
    fake.reject('no-key');
    await flush();
    fixture.detectChanges();

    expect(stateOf(fixture)).toBe('error');
    expect(findBubble(fixture)?.textContent?.trim()).toContain('clave');
  });

  it('el clic derecho sobre Milo abre los ajustes', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const hotspot = fixture.nativeElement.querySelector('.hotspot') as HTMLElement;
    hotspot.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(fake.settingsOpened).toBe(1);
  });

  it('una segunda pulsación mientras escucha no abre otra captura', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    expect(stateOf(fixture)).toBe('listening');

    fake.pressHotkey();
    fixture.detectChanges();

    // Dos capturas simultáneas se pelearían por el micrófono y una de las dos
    // se quedaría esperando para siempre.
    voice.heard();
    await flush();
    fixture.detectChanges();
    expect(stateOf(fixture)).toBe('thinking');
  });

  it('deja que la (x) cierre el mensaje antes de tiempo', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    voice.heard();
    await flush();
    fixture.detectChanges();
    fake.respond('Ponme música');
    await flush();
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

  it('la (x) vive dentro de una zona interactiva o sería un botón muerto en Electron', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    voice.heard();
    await flush();
    fixture.detectChanges();
    fake.respond('Ponme música');
    await flush();
    fixture.detectChanges();

    // `app.ts` desbloquea los clics de la ventana solo donde `elementFromPoint`
    // encuentra `[data-interactive]`. El hotspot del personaje está abajo, así
    // que la burbuja debe traer el suyo o la (x) no recibe ni un clic.
    const wrapper = fixture.nativeElement.querySelector('.bubble-wrap') as HTMLElement;
    expect(wrapper.hasAttribute('data-interactive')).toBe(true);
    expect(wrapper.contains(fixture.nativeElement.querySelector('.bubble__close'))).toBe(true);
  });

  it('una pulsación nueva descarta el mensaje que estaba desvaneciéndose', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    fake.pressHotkey();
    fixture.detectChanges();
    voice.heard();
    await flush();
    fixture.detectChanges();
    fake.respond('Primera respuesta');
    await flush();
    fixture.detectChanges();

    vi.advanceTimersByTime(ACTING_MS);
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

    voice.heard();
    await flush();
    fixture.detectChanges();
    fake.respond('Segunda respuesta');
    await flush();
    fixture.detectChanges();

    expect(findBubble(fixture)?.textContent?.trim()).toBe('Segunda respuesta');
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
