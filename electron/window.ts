import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';

import { readConfig, writeConfig } from './config';

const WINDOW_SIZE = { width: 340, height: 340 };
const MARGIN = 24;

/**
 * Franja mínima de la ventana que debe caer dentro de un monitor para
 * considerarla alcanzable. Menos que esto y no hay dónde agarrarla.
 */
const MIN_VISIBLE = 80;

/** En desarrollo se carga el dev server de Angular para conservar el hot reload. */
const DEV_SERVER_URL = 'http://localhost:4200';

let mascotWindow: BrowserWindow | null = null;

interface Point {
  x: number;
  y: number;
}

/** Esquina inferior derecha del monitor principal, con un margen. */
function defaultPosition(): Point {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - WINDOW_SIZE.width - MARGIN,
    y: workArea.y + workArea.height - WINDOW_SIZE.height - MARGIN,
  };
}

/**
 * Posición de arranque: la última guardada, si sigue siendo alcanzable.
 *
 * La validación no es paranoia. Milo se oculta de la barra de tareas
 * (`skipTaskbar`) y todavía no tiene icono de bandeja, así que una ventana
 * restaurada fuera de pantalla no se puede recuperar: no hay dónde hacer clic.
 * Basta con desconectar el monitor donde estaba, o cambiar la resolución, para
 * provocarlo.
 */
function initialPosition(): Point {
  const saved = readConfig().position;

  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) {
    return defaultPosition();
  }

  const reachable = screen.getAllDisplays().some(({ workArea }) => {
    const overlapX =
      Math.min(saved.x + WINDOW_SIZE.width, workArea.x + workArea.width) -
      Math.max(saved.x, workArea.x);
    const overlapY =
      Math.min(saved.y + WINDOW_SIZE.height, workArea.y + workArea.height) -
      Math.max(saved.y, workArea.y);

    return overlapX >= MIN_VISIBLE && overlapY >= MIN_VISIBLE;
  });

  return reachable ? saved : defaultPosition();
}

export function createMascotWindow(): BrowserWindow {
  const position = initialPosition();

  const win = new BrowserWindow({
    ...WINDOW_SIZE,
    // `initialPosition()` usa `workArea`, que excluye la barra de tareas: la
    // ventana queda pegada a la esquina real de la pantalla y no debajo de ella.
    x: position.x,
    y: position.y,
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

  // `moved` se emite una sola vez, al soltar el arrastre (Windows y macOS; en
  // Linux hay que escuchar `move`). Guardar aquí evita tener que añadir un canal
  // IPC solo para "avisa de que me moví".
  win.on('moved', () => {
    const { x, y } = win.getBounds();
    writeConfig({ position: { x, y } });
  });

  if (process.env['MILOPET_DEV'] === '1') {
    // `?zones=1` enciende el overlay de depuración de zonas (ver `app.ts`).
    // Solo tiene sentido en dev: es el servidor de Angular el que sirve la URL.
    const url = process.env['MILOPET_ZONES'] === '1' ? `${DEV_SERVER_URL}?zones=1` : DEV_SERVER_URL;
    void win.loadURL(url);
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
