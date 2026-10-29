import { app, ipcMain, Menu } from 'electron';

import { CHANNELS, type MascotState } from '../src/shared/ipc';
import { readConfig, writeConfig } from './config';
import { disposeHotkeys, registerHotkey } from './hotkey';
import {
  createMascotWindow,
  endWindowDrag,
  getMascotWindow,
  moveWindowDrag,
  sendToRenderer,
  startWindowDrag,
} from './window';

/** Último estado informado por el renderer. Lo usará la capa de bandeja y logs. */
let lastState: MascotState = 'idle';

// Un compañero de escritorio debe ser una sola instancia: dos Milos peleando
// por el mismo atajo global garantizan el bug "a veces funciona".
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

    // Solo persistimos si el registro funcionó. Guardar un atajo que el sistema
    // rechazó deja la app arrancando sin atajo en el siguiente inicio.
    if (registration.ok) {
      writeConfig({ hotkey: accelerator });
    }

    return registration;
  });

  ipcMain.on(CHANNELS.setInteractive, (_event, interactive: boolean) => {
    const win = getMascotWindow();
    // `forward: true` sigue enviando mousemove al renderer mientras la ventana
    // es click-through; eso es lo que permite que el personaje "note" el cursor.
    win?.setIgnoreMouseEvents(!interactive, { forward: true });
  });

  // El renderer no manda coordenadas: solo dice cuándo empieza, avanza y
  // termina el gesto. La geometría y el cursor de pantalla viven aquí.
  ipcMain.on(CHANNELS.dragStart, () => startWindowDrag());
  ipcMain.on(CHANNELS.dragMove, () => moveWindowDrag());
  ipcMain.on(CHANNELS.dragEnd, () => endWindowDrag());

  ipcMain.on(CHANNELS.state, (_event, state: MascotState) => {
    lastState = state;
    // Traza solo en desarrollo: en producción no queremos ruido en la consola.
    if (process.env['MILOPET_DEV'] === '1') {
      console.debug('[milo] estado:', lastState);
    }
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
    // La ventana puede estar cargando todavía; el renderer también pide la
    // configuración al arrancar y vuelve a comprobar el registro allí.
    sendToRenderer(CHANNELS.hotkeyFailed, registration);
  }
}

void app.whenReady().then(() => {
  // Necesario para las notificaciones toast de Windows más adelante.
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
  // Sin esto, el atajo global sigue secuestrado después de cerrar la app.
  disposeHotkeys();
});
