import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';

const WINDOW_SIZE = { width: 340, height: 340 };
const MARGIN = 24;

/** Dev loads the Angular dev server so we keep hot reload. Prod loads the build. */
const DEV_SERVER_URL = 'http://localhost:4200';

let mascotWindow: BrowserWindow | null = null;

export function createMascotWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();

  const win = new BrowserWindow({
    ...WINDOW_SIZE,
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: process.env['MILOPET_DEV'] === '1',
    },
  });

  // 'screen-saver' is the only level that reliably wins against fullscreen apps.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenu(null);

  // Start click-through: the mascot must never steal a click from real work.
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

/** Pushes an event to the renderer, tolerating a window that isn't ready yet. */
export function sendToRenderer(channel: string, payload?: unknown): void {
  if (mascotWindow && !mascotWindow.isDestroyed()) {
    mascotWindow.webContents.send(channel, payload);
  }
}
