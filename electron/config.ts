import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DEFAULT_HOTKEY, type MiloConfig } from '../src/shared/ipc';

/**
 * Settings persistence.
 *
 * Deliberately dumb: a JSON file in the userData folder. The moment we start
 * storing API keys, they must NOT land here in plain text — use
 * `safeStorage.encryptString()` (DPAPI on Windows) or the OS credential store.
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
    cached = { ...DEFAULTS, ...parsed };
  } catch {
    // Missing or corrupt file: fall back to defaults instead of crashing on boot.
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
