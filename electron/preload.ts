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
  SetKeyResult,
  SpeechClip,
  SttStatus,
  TranscribeResult,
} from '../src/shared/ipc';

const CH = {
  hotkey: 'milo:hotkey',
  hotkeyFailed: 'milo:hotkey-failed',
  setInteractive: 'milo:set-interactive',
  getConfig: 'milo:get-config',
  setHotkey: 'milo:set-hotkey',
  dragStart: 'milo:drag-start',
  dragMove: 'milo:drag-move',
  dragEnd: 'milo:drag-end',
  state: 'milo:state',
  transcribe: 'milo:transcribe',
  getSttStatus: 'milo:stt-status',
  setSttKey: 'milo:set-stt-key',
  clearSttKey: 'milo:clear-stt-key',
  openSettings: 'milo:open-settings',
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

  startDrag: () => ipcRenderer.send(CH.dragStart),
  moveDrag: () => ipcRenderer.send(CH.dragMove),
  endDrag: () => ipcRenderer.send(CH.dragEnd),

  setState: (state: MascotState) => ipcRenderer.send(CH.state, state),

  transcribe: (clip: SpeechClip) =>
    ipcRenderer.invoke(CH.transcribe, clip) as Promise<TranscribeResult>,

  getSttStatus: () => ipcRenderer.invoke(CH.getSttStatus) as Promise<SttStatus>,

  setSttKey: (key: string) => ipcRenderer.invoke(CH.setSttKey, key) as Promise<SetKeyResult>,

  clearSttKey: () => ipcRenderer.invoke(CH.clearSttKey) as Promise<SttStatus>,

  openSettings: () => ipcRenderer.send(CH.openSettings),

  quit: () => ipcRenderer.send(CH.quit),
};

// `exposeInMainWorld` publica el objeto como `window.milo` dentro del renderer.
// Nada más cruza la frontera: ni `ipcRenderer`, ni `require`, ni `process`.
contextBridge.exposeInMainWorld('milo', bridge);
