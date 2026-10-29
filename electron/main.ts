import { app, ipcMain, Menu } from 'electron';

import {
  CHANNELS,
  type MascotState,
  type SetKeyResult,
  type SpeechClip,
  type SttStatus,
  type TranscribeResult,
} from '../src/shared/ipc';
import { readConfig, writeConfig } from './config';
import { disposeHotkeys, registerHotkey } from './hotkey';
import { canStoreSecrets, clearSecret, readSecret, writeSecret } from './secrets';
import { openSettingsWindow } from './settings';
import { DeepgramTranscriber, TranscriberError } from './stt/transcriber';
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

/**
 * Nombre con el que se guarda la clave del proveedor de voz.
 *
 * Un nombre por proveedor y no uno genérico: el día que haya dos, cada clave
 * vive en su archivo y cambiar de proveedor no pisa la anterior.
 */
const STT_SECRET = 'deepgram';

/** Una instancia basta: no guarda estado entre peticiones. */
const transcriber = new DeepgramTranscriber();

/** Estado de la clave, sin revelarla nunca. */
async function sttStatus(): Promise<SttStatus> {
  const configured = (await readSecret(STT_SECRET)) !== null;
  return { configured, provider: configured ? transcriber.provider : null };
}

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

  ipcMain.handle(CHANNELS.getSttStatus, () => sttStatus());

  ipcMain.handle(CHANNELS.setSttKey, async (_event, key: unknown): Promise<SetKeyResult> => {
    const clean = typeof key === 'string' ? key.trim() : '';
    if (!clean) return { ok: false, failure: 'auth' };

    // Sin cifrado disponible no se guarda nada: un archivo en claro es peor que
    // pedir la clave otra vez.
    if (!(await canStoreSecrets())) return { ok: false, failure: 'unknown' };

    // Se valida antes de guardar: si no, el usuario descubre que la clave está
    // mal a la tercera frase, cuando ya no se acuerda de lo que escribió.
    try {
      await transcriber.verifyKey(clean);
    } catch (error) {
      return {
        ok: false,
        failure: error instanceof TranscriberError ? error.failure : 'unknown',
      };
    }

    try {
      await writeSecret(STT_SECRET, clean);
    } catch {
      return { ok: false, failure: 'unknown' };
    }

    return { ok: true, status: await sttStatus() };
  });

  ipcMain.handle(CHANNELS.clearSttKey, async () => {
    clearSecret(STT_SECRET);
    return sttStatus();
  });

  ipcMain.handle(
    CHANNELS.transcribe,
    async (_event, clip: SpeechClip): Promise<TranscribeResult> => {
      const apiKey = await readSecret(STT_SECRET);
      if (!apiKey) return { ok: false, failure: 'no-key' };

      // El payload viene del renderer: se comprueba que sea lo que dice ser
      // antes de empaquetarlo. Un `Float32Array` vacío produce un WAV inválido.
      if (!(clip?.pcm instanceof Float32Array) || clip.pcm.length === 0) {
        return { ok: false, failure: 'audio' };
      }

      try {
        return { ok: true, text: await transcriber.transcribe(clip, apiKey) };
      } catch (error) {
        return {
          ok: false,
          failure: error instanceof TranscriberError ? error.failure : 'unknown',
        };
      }
    },
  );

  ipcMain.on(CHANNELS.openSettings, () => openSettingsWindow());

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
