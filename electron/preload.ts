/**
 * Script de preload: la ÚNICA superficie a la que puede llegar el renderer.
 *
 * El renderer nunca ve Node, ni `ipcRenderer`, ni ninguna API key. Ve
 * exactamente el objeto `MiloBridge` de abajo, que es una lista blanca de
 * operaciones con nombre.
 *
 * Ojo: este archivo corre en un preload con sandbox, así que solo puede hacer
 * `require('electron')` y un par de módulos internos. Por eso los nombres de
 * canal están duplicados como literales: la cláusula `satisfies` convierte
 * cualquier desajuste con el contrato compartido en un error de compilación en
 * vez de un bug silencioso en ejecución.
 */
import { contextBridge, ipcRenderer } from 'electron';

import type {
  CHANNELS,
  HotkeyRegistration,
  MascotState,
  MiloBridge,
  MiloConfig,
} from '../src/shared/ipc';

const CH = {
  hotkey: 'milo:hotkey',
  hotkeyFailed: 'milo:hotkey-failed',
  setInteractive: 'milo:set-interactive',
  getConfig: 'milo:get-config',
  setHotkey: 'milo:set-hotkey',
  state: 'milo:state',
  quit: 'milo:quit',
} as const satisfies { [K in keyof typeof CHANNELS]: (typeof CHANNELS)[K] };

/**
 * Envuelve `ipcRenderer.on` para que el renderer reciba solo el payload, sin el
 * `IpcRendererEvent` (que arrastra referencias internas de Electron), y para
 * devolver una función de baja. Sin esa baja, cada componente que se destruye
 * deja un listener vivo y el proceso main acumula envíos a la nada.
 */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: MiloBridge = {
  onHotkey: (handler) => subscribe<void>(CH.hotkey, () => handler()),

  onHotkeyFailed: (handler) => subscribe<HotkeyRegistration>(CH.hotkeyFailed, handler),

  setInteractive: (interactive) => ipcRenderer.send(CH.setInteractive, interactive),

  getConfig: () => ipcRenderer.invoke(CH.getConfig) as Promise<MiloConfig>,

  setHotkey: (accelerator) =>
    ipcRenderer.invoke(CH.setHotkey, accelerator) as Promise<HotkeyRegistration>,

  setState: (state: MascotState) => ipcRenderer.send(CH.state, state),

  quit: () => ipcRenderer.send(CH.quit),
};

// `exposeInMainWorld` publica el objeto como `window.milo` dentro del renderer.
// Nada más cruza la frontera: ni `ipcRenderer`, ni `require`, ni `process`.
contextBridge.exposeInMainWorld('milo', bridge);
