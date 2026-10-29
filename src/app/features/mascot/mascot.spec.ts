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

  it('acompaña al cursor: más cerca, menos desplazamiento', () => {
    movePointer(EYE_X + 150, EYE_Y);
    const far = offset()[0];

    movePointer(EYE_X + 30, EYE_Y);
    const near = offset()[0];

    // Lejos del alcance (`GAZE_REACH`) el ojo está en el borde de su recorrido;
    // cerca, el desplazamiento es proporcional. Es lo que hace que siga al ratón.
    expect(far).toBeCloseTo(15, 2);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(far);
  });

  it('en el centro de los ojos la mirada se centra', () => {
    movePointer(EYE_X + 80, EYE_Y);
    expect(offset()[0]).toBeGreaterThan(0);

    movePointer(EYE_X, EYE_Y);

    expect(offset()).toEqual([0, 0]);
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

  it('da volumen a la pareja: el ojo hacia el cursor encoge y el otro crece', () => {
    movePointer(EYE_X + 80, EYE_Y);

    // La escala vive en el envoltorio, no en el ojo: el ojo anima `transform` y
    // el navegador deja de pintar la escala si va en el mismo elemento.
    const left = fixture.nativeElement.querySelector(
      '.mascot__eye--left .mascot__eye-scaler',
    ) as SVGGElement;
    const right = fixture.nativeElement.querySelector(
      '.mascot__eye--right .mascot__eye-scaler',
    ) as SVGGElement;

    const readScale = (el: SVGGElement): [number, number] => {
      const match = /scale\(([\d.]+), ([\d.]+)\)/.exec(el.style.transform);
      if (match === null) throw new Error(`Sin escala en "${el.style.transform}".`);

      return [Number.parseFloat(match[1]), Number.parseFloat(match[2])];
    };

    const [rightX, rightY] = readScale(right);
    const [leftX, leftY] = readScale(left);

    // Mirando a la derecha, el derecho es el que se aleja hacia el cursor: es el
    // que se ve más pequeño en los dos ejes.
    expect(rightX).toBeLessThan(1);
    expect(rightY).toBeLessThan(1);
    expect(leftX).toBeGreaterThan(1);
    expect(leftY).toBeGreaterThan(1);
  });

  it('no sigue un cursor lejano: vuelve al barrido automático', () => {
    movePointer(EYE_X + RECT.width, EYE_Y);

    expect(svg().getAttribute('data-gaze')).toBeNull();
    expect(offset()).toEqual([0, 0]);
  });
});
