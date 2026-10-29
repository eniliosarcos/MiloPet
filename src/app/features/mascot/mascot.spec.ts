import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Mascot } from './mascot';

/**
 * jsdom no mide nada: devuelve un rectángulo de ceros. Le damos al personaje un
 * cuadrado conocido para poder comprobar hacia dónde se mueven los ojos.
 */
const RECT = {
  x: 100,
  y: 100,
  left: 100,
  top: 100,
  width: 240,
  height: 240,
  right: 340,
  bottom: 340,
  toJSON: () => RECT,
} as DOMRect;

/** Centro de los ojos dentro de ese cuadrado: x al medio, y al 54 % del alto. */
const EYE_X = RECT.left + RECT.width / 2;
const EYE_Y = RECT.top + RECT.height * 0.54;

describe('Mascot', () => {
  let fixture: ComponentFixture<Mascot>;

  const svg = () => fixture.nativeElement.querySelector('.mascot') as SVGSVGElement;
  const eyes = () => fixture.nativeElement.querySelector('.mascot__eyes') as SVGGElement;

  /** Desplazamiento aplicado a los ojos, en unidades del viewBox. */
  const offset = (): [number, number] => {
    const [x, y] = eyes().style.translate.split(' ').map(Number.parseFloat);
    return [x, y];
  };

  const movePointer = (clientX: number, clientY: number): void => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Mascot] }).compileComponents();

    fixture = TestBed.createComponent(Mascot);
    vi.spyOn(fixture.nativeElement, 'getBoundingClientRect').mockReturnValue(RECT);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('arranca sin seguir a nadie y con los ojos centrados', () => {
    expect(svg().getAttribute('data-gaze')).toBeNull();
    expect(offset()).toEqual([0, 0]);
  });

  it('inclina los ojos hacia el cursor y apaga el barrido automático', () => {
    movePointer(EYE_X + 80, EYE_Y);

    expect(svg().getAttribute('data-gaze')).toBe('true');
    const [x, y] = offset();
    expect(x).toBeGreaterThan(0);
    expect(y).toBe(0);
  });

  it('mira hacia arriba cuando el cursor está por encima de los ojos', () => {
    movePointer(EYE_X, EYE_Y - 80);

    const [x, y] = offset();
    expect(x).toBe(0);
    expect(y).toBeLessThan(0);
  });

  it('suelta la mirada cuando el cursor abandona la ventana', () => {
    movePointer(EYE_X + 80, EYE_Y);
    expect(svg().getAttribute('data-gaze')).toBe('true');

    // `mouseout` sin destino es la única señal de "el ratón salió de la ventana":
    // fuera de ella no llega ningún `mousemove`.
    window.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null }));
    fixture.detectChanges();

    expect(svg().getAttribute('data-gaze')).toBeNull();
    expect(offset()).toEqual([0, 0]);
  });

  it('no sigue un cursor lejano: vuelve al barrido automático', () => {
    movePointer(EYE_X + RECT.width, EYE_Y);

    expect(svg().getAttribute('data-gaze')).toBeNull();
    expect(offset()).toEqual([0, 0]);
  });
});
