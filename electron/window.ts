import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';

import { readConfig, writeConfig } from './config';

const WINDOW_SIZE = { width: 340, height: 340 };
const MARGIN = 24;

/**
 * Permisos que Milo concede.
 *
 * La lista es corta a propósito: el micrófono (`media`) es lo único que
 * necesita. Todo lo demás —notificaciones, geolocalización, portapapeles— se
 * deniega sin preguntar, porque un compañero de escritorio no tiene por qué
 * pedirlo.
 */
const ALLOWED_PERMISSIONS = new Set<string>(['media']);

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

/**
 * Punto de partida de un arrastre.
 *
 * Se guarda el cursor y la ventana en el mismo instante, y cada paso mueve la
 * ventana el delta del cursor desde ese origen. Así el desfase entre donde
 * pulsaste y la esquina de la ventana se conserva solo, sin restarlo a mano ni
 * acumular redondeos.
 */
interface DragOrigin {
  cursor: Point;
  window: Point;
}

let dragOrigin: DragOrigin | null = null;

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

/**
 * Candado de permisos de la sesión.
 *
 * Sin handler, Electron no distingue entre Milo y cualquier otra página: deja
 * pasar lo que pida el renderer. Aquí se cierra a `media` y solo para la ventana
 * de Milo, que además es la única de esta sesión.
 *
 * Los dos handlers hacen falta. `setPermissionCheckHandler` no sobra: Chromium
 * consulta el estado del permiso antes de pedirlo, y si esa consulta dice que no,
 * `getUserMedia` falla sin llegar nunca al handler de petición.
 */
function lockPermissions(win: BrowserWindow): void {
  const contents = win.webContents;
  const { session } = contents;

  session.setPermissionRequestHandler((requester, permission, callback) => {
    callback(requester === contents && ALLOWED_PERMISSIONS.has(permission));
  });

  session.setPermissionCheckHandler(
    (requester, permission) =>
      (requester === null || requester === contents) && ALLOWED_PERMISSIONS.has(permission),
  );
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
      // El VAD late con un `setInterval` de 50 ms. Si el navegador lo frena
      // porque la ventana quedó tapada por otra aplicación, el VAD no corta
      // nunca y Milo se queda con el micrófono abierto.
      backgroundThrottling: false,
    },
  });

  // Antes de cargar la página: el renderer pide el micrófono en cuanto pulsas el
  // atajo, y el permiso tiene que estar decidido para entonces.
  lockPermissions(win);

  // 'screen-saver' es el único nivel que gana de forma fiable contra apps en
  // pantalla completa (juegos, presentaciones).
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenu(null);

  // Arranca en click-through: el personaje nunca debe robar un clic del trabajo
  // real. El renderer lo desactiva solo cuando el cursor entra al hotspot.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.once('ready-to-show', () => win.show());

  // La posición ya no se guarda desde `moved`: ahora el movimiento lo provoca
  // `setPosition` en cada paso del arrastre, y `moved` puede dispararse en cada
  // uno de esos pasos (decenas de escrituras de disco por segundo). Se guarda una
  // sola vez en `endWindowDrag()`, que es el momento exacto en que se suelta.

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

/** Fija el origen del arrastre: cursor y ventana leídos en el mismo instante. */
export function startWindowDrag(): void {
  const win = mascotWindow;
  if (!win || win.isDestroyed()) return;

  const { x, y } = win.getBounds();
  dragOrigin = { cursor: screen.getCursorScreenPoint(), window: { x, y } };
}

/**
 * Mueve la ventana el delta del cursor desde el origen del arrastre.
 *
 * La posición se lee del sistema y no del evento del renderer: `clientX` es
 * relativo a la ventana que se está moviendo, así que usarlo realimenta el
 * movimiento y tiembla. `getCursorScreenPoint()` y los bounds de Electron hablan
 * los dos en DIP, la misma unidad que espera `setPosition`, así que el
 * `scaleFactor` del monitor no entra en la cuenta.
 */
export function moveWindowDrag(): void {
  const win = mascotWindow;
  if (!win || win.isDestroyed() || !dragOrigin) return;

  const cursor = screen.getCursorScreenPoint();
  win.setPosition(
    dragOrigin.window.x + (cursor.x - dragOrigin.cursor.x),
    dragOrigin.window.y + (cursor.y - dragOrigin.cursor.y),
  );
}

/** Cierra el arrastre y persiste la posición, una sola vez. */
export function endWindowDrag(): void {
  if (!dragOrigin) return;
  dragOrigin = null;

  const win = mascotWindow;
  if (!win || win.isDestroyed()) return;

  const { x, y } = win.getBounds();
  writeConfig({ position: { x, y } });
}

/** Envía un evento al renderer, tolerando una ventana que todavía no está lista. */
export function sendToRenderer(channel: string, payload?: unknown): void {
  if (mascotWindow && !mascotWindow.isDestroyed()) {
    mascotWindow.webContents.send(channel, payload);
  }
}
