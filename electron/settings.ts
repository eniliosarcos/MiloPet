import { BrowserWindow, shell } from 'electron';
import * as path from 'node:path';

import { DEV_SERVER_URL, RENDERER_INDEX } from './window';

/**
 * La ventana de ajustes.
 *
 * Es la primera superficie de configuración del proyecto, y existe porque la
 * clave del proveedor de voz la tiene que poner cada usuario: no se puede
 * enviar dentro de la app sin regalársela a quien abra el binario.
 *
 * Se abre desde dos sitios: el clic derecho sobre Milo y el aviso de "me falta
 * la clave". Es una ventana normal (con marco y en la barra de tareas) porque
 * se va a escribir en ella, al contrario que la mascota.
 */

const SETTINGS_SIZE = { width: 480, height: 580 };

let settingsWindow: BrowserWindow | null = null;

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const win = new BrowserWindow({
    ...SETTINGS_SIZE,
    title: 'Milo · Ajustes',
    // Fondo opaco: aquí no hay personaje ni transparencia, hay texto.
    backgroundColor: '#0b0f14',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: process.env['MILOPET_DEV'] === '1',
    },
  });

  // Los enlaces de la pantalla de ajustes (dónde sacar la clave) se abren en el
  // navegador del sistema. Dentro de esta ventana no se navega a ningún sitio:
  // `deny` corta el intento y solo se permite `https`.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Misma build, otra query: `main.ts` arranca otro componente raíz cuando ve
  // `?settings=1`. Sin router y sin segunda entrada de Angular.
  if (process.env['MILOPET_DEV'] === '1') {
    void win.loadURL(`${DEV_SERVER_URL}?settings=1`);
  } else {
    void win.loadFile(RENDERER_INDEX, { query: { settings: '1' } });
  }

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow = win;
}
