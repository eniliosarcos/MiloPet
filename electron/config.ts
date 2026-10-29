import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DEFAULT_HOTKEY, type MiloConfig } from '../src/shared/ipc';

/**
 * Persistencia de ajustes.
 *
 * A propósito es simple: un JSON en la carpeta de datos de usuario. En el
 * momento en que empecemos a guardar API keys, NO pueden terminar aquí en
 * texto plano: hay que usar `safeStorage.encryptString()` (DPAPI en Windows) o
 * el almacén de credenciales del sistema operativo.
 */
const DEFAULTS: MiloConfig = {
  hotkey: DEFAULT_HOTKEY,
};

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

let cached: MiloConfig | null = null;

export function readConfig(): MiloConfig {
  if (cached) return cached;

  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<MiloConfig>;
    // Se mezcla con los valores por defecto para que un config.json viejo, al
    // que le falta una clave nueva, siga funcionando tras una actualización.
    cached = { ...DEFAULTS, ...parsed };
  } catch {
    // Archivo inexistente o corrupto: se usan los valores por defecto en vez de
    // romper el arranque.
    cached = { ...DEFAULTS };
  }

  return cached;
}

export function writeConfig(patch: Partial<MiloConfig>): MiloConfig {
  cached = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cached, null, 2), 'utf-8');
  return cached;
}
