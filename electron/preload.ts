/**
 * Preload script: the ONLY surface the renderer can reach.
 *
 * The renderer never sees Node, `ipcRenderer`, or any API key. It sees exactly
 * the `MiloBridge` object below, which is a whitelist of named operations.
 *
 * Note: this file runs in a sandboxed preload, which can only `require('electron')`
 * and a couple of built-ins. That's why the channel names are duplicated as
 * literals — the `satisfies` clause makes a mismatch with the shared contract a
 * compile error instead of a silent runtime bug.
 */
import { contextBridge, ipcRenderer } from 'electron';

import type { CHANNELS, HotkeyRegistration, MascotState, MiloBridge, MiloConfig } from '../src/shared/ipc';

const CH = {
  hotkey: 'milo:hotkey',
  hotkeyFailed: 'milo:hotkey-failed',
  setInteractive: 'milo:set-interactive',
  getConfig: 'milo:get-config',
  setHotkey: 'milo:set-hotkey',
  state: 'milo:state',
  quit: 'milo:quit',
} as const satisfies { [K in keyof typeof CHANNELS]: (typeof CHANNELS)[K] };

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

  setHotkey: (accelerator) => ipcRenderer.invoke(CH.setHotkey, accelerator) as Promise<HotkeyRegistration>,

  setState: (state: MascotState) => ipcRenderer.send(CH.state, state),

  quit: () => ipcRenderer.send(CH.quit),
};

contextBridge.exposeInMainWorld('milo', bridge);
