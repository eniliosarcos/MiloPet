import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';

const WINDOW_SIZE = { width: 340, height: 340 };
const MARGIN = 24;

/** En desarrollo se carga el dev server de Angular para conservar el hot reload. */
const DEV_SERVER_URL = 'http://localhost:4200';

let mascotWindow: BrowserWindow | null = null;

export function createMascotWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();

  const win = new BrowserWindow({
    ...WINDOW_SIZE,
    // `workArea` excluye la barra de tareas, así que la ventana queda pegada a
    // la esquina real de la pantalla y no debajo de ella.
    x: workArea.x + workArea.width - WINDOW_SIZE.width - MARGIN,
    y: workArea.y + workArea.height - WINDOW_SIZE.height - MARGIN,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Las tres líneas que importan: el renderer queda aislado, sin Node y en
      // sandbox. Cambiar cualquiera de las tres abre un agujero real.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: process.env['MILOPET_DEV'] === '1',
    },
  });

  // 'screen-saver' es el único nivel que gana de forma fiable contra apps en
  // pantalla completa (juegos, presentaciones).
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenu(null);

  // Arranca en click-through: el personaje nunca debe robar un clic del trabajo
  // real. El renderer lo desactiva solo cuando el cursor entra al hotspot.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.once('ready-to-show', () => win.show());

  if (process.env['MILOPET_DEV'] === '1') {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/MiloPet/browser/index.html'));
  }

  mascotWindow = win;
  win.on('closed', () => {
    mascotWindow = null;
  });

  return win;
}

export function getMascotWindow(): BrowserWindow | null {
  return mascotWindow;
}

/** Envía un evento al renderer, tolerando una ventana que todavía no está lista. */
export function sendToRenderer(channel: string, payload?: unknown): void {
  if (mascotWindow && !mascotWindow.isDestroyed()) {
    mascotWindow.webContents.send(channel, payload);
  }
}
