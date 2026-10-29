import { InjectionToken } from '@angular/core';

import {
  DEFAULT_HOTKEY,
  type HotkeyRegistration,
  type MiloBridge,
  type MiloConfig,
} from '../../../shared/ipc';

/**
 * Sustituto que se usa cuando la app corre en un navegador normal
 * (`ng serve` en Chrome).
 *
 * No es un lujo: permite iterar el diseño del personaje y la máquina de estados
 * con hot reload completo, sin arrancar Electron en cada ajuste.
 *
 * Aquí no hay ventana que hacer click-through, ni proceso main al que reportar,
 * ni app que cerrar: esos métodos quedan vacíos a propósito.
 */
function createBrowserBridge(): MiloBridge {
  const hotkeyHandlers = new Set<() => void>();
  const failureHandlers = new Set<(failure: HotkeyRegistration) => void>();
  let config: MiloConfig = { hotkey: DEFAULT_HOTKEY };

  // Equivalente en navegador del atajo global: aquí sí se puede escuchar el
  // teclado directamente sobre la página.
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === 'Space') {
      event.preventDefault();
      hotkeyHandlers.forEach((handler) => handler());
    }
  });

  return {
    onHotkey(handler) {
      hotkeyHandlers.add(handler);
      return () => {
        hotkeyHandlers.delete(handler);
      };
    },
    onHotkeyFailed(handler) {
      failureHandlers.add(handler);
      return () => {
        failureHandlers.delete(handler);
      };
    },
    setInteractive() {
      // En un navegador no hay ventana que hacer click-through.
    },
    async getConfig() {
      return config;
    },
    async setHotkey(accelerator) {
      config = { ...config, hotkey: accelerator };
      return { ok: true, accelerator };
    },
    startDrag() {
      // En un navegador no hay ventana de Electron que mover. El gesto sigue
      // funcionando en la página (captura de puntero incluida), solo que sin
      // efecto visible.
    },
    moveDrag() {
      // Ver `startDrag`: no hay proceso main al que pedir el movimiento.
    },
    endDrag() {
      // Ver `startDrag`: no hay posición que guardar.
    },
    setState() {
      // No hay proceso main al que informar.
    },
    async transcribe() {
      // Sin proceso main no hay proveedor ni clave: el navegador sirve para
      // pulir el personaje, no para hablarle.
      return { ok: false, failure: 'no-key' };
    },
    async getSttStatus() {
      return { configured: false, provider: null };
    },
    async setSttKey() {
      // La clave viaja cifrada por el proceso main; aquí no hay dónde guardarla.
      return { ok: false, failure: 'unknown' };
    },
    async clearSttKey() {
      return { configured: false, provider: null };
    },
    openSettings() {
      // En el navegador la pantalla de ajustes es la misma página con otra
      // query, así que basta con recargar: útil para maquetarla.
      window.location.assign('?settings=1');
    },
    quit() {
      // No hay app que cerrar.
    },
  };
}

/**
 * El puente que expone el preload de Electron, o su sustituto de navegador.
 *
 * `inject(MILO)` en cualquier componente o servicio devuelve `window.milo` si
 * existe. Así el mismo código de la app funciona en los dos entornos sin un
 * solo `if (window.milo)` repartido por el código.
 */
export const MILO = new InjectionToken<MiloBridge>('MILO', {
  providedIn: 'root',
  factory: () => (window as Window & { milo?: MiloBridge }).milo ?? createBrowserBridge(),
});
