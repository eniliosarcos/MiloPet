import { app, ipcMain, Menu } from 'electron';

import { CHANNELS, type MascotState } from '../src/shared/ipc';
import { readConfig, writeConfig } from './config';
import { disposeHotkeys, registerHotkey } from './hotkey';
import { createMascotWindow, getMascotWindow, sendToRenderer } from './window';

/** Last state reported by the renderer. Placeholder for the tray/logging layer. */
let lastState: MascotState = 'idle';

// A desktop companion must be a single instance: two Milos fighting over the
// same global hotkey is a guaranteed "it only works sometimes" bug.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  const win = getMascotWindow();
  if (win) {
    win.show();
    win.focus();
  }
});

function registerIpc(): void {
  ipcMain.handle(CHANNELS.getConfig, () => readConfig());

  ipcMain.handle(CHANNELS.setHotkey, (_event, accelerator: string) => {
    const registration = registerHotkey(accelerator, notifyHotkeyPress);

    if (registration.ok) {
      writeConfig({ hotkey: accelerator });
    }

    return registration;
  });

  ipcMain.on(CHANNELS.setInteractive, (_event, interactive: boolean) => {
    const win = getMascotWindow();
    // `forward: true` keeps sending mousemove to the renderer while it is
    // click-through, which is what lets the mascot "notice" the cursor.
    win?.setIgnoreMouseEvents(!interactive, { forward: true });
  });

  ipcMain.on(CHANNELS.state, (_event, state: MascotState) => {
    lastState = state;
  });

  ipcMain.on(CHANNELS.quit, () => app.quit());
}

function notifyHotkeyPress(): void {
  sendToRenderer(CHANNELS.hotkey);
}

function startHotkey(): void {
  const { hotkey } = readConfig();
  const registration = registerHotkey(hotkey, notifyHotkeyPress);

  if (!registration.ok) {
    // The window may still be loading; the renderer also asks for the config on
    // boot and re-checks the registration result there.
    sendToRenderer(CHANNELS.hotkeyFailed, registration);
  }
}

void app.whenReady().then(() => {
  // Required for Windows toast notifications later on.
  app.setAppUserModelId('com.milopet.app');
  Menu.setApplicationMenu(null);

  registerIpc();
  createMascotWindow();
  startHotkey();

  app.on('activate', () => {
    if (!getMascotWindow()) createMascotWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  disposeHotkeys();
});
