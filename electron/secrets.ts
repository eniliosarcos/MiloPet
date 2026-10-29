import { app, safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Secretos de la app: hoy, la clave del proveedor de voz.
 *
 * Dos reglas que no se negocian:
 *
 * 1. La clave **nunca** va a `config.json` ni cruza al renderer. Se cifra con
 *    `safeStorage` (DPAPI en Windows) y solo la lee el proceso main.
 * 2. Si el sistema no puede cifrar, no se guarda. Un archivo en claro es peor
 *    que pedir la clave otra vez.
 *
 * El blob cifrado está atado a la sesión de Windows de cada usuario, así que
 * copiarlo a otra máquina no sirve. Para un modelo "cada usuario pone su clave"
 * eso es exactamente lo que se quiere.
 *
 * La API asíncrona no es capricho: en Electron 45 la síncrona
 * (`isEncryptionAvailable`, `encryptString`, `decryptString`) está marcada como
 * obsoleta, y la asíncrona además avisa cuando la clave del sistema rotó.
 */

function secretsDir(): string {
  return path.join(app.getPath('userData'), 'secrets');
}

function secretPath(name: string): string {
  return path.join(secretsDir(), `${name}.bin`);
}

/** ¿Se puede cifrar en este equipo? En Windows, sí salvo que DPAPI falle. */
export async function canStoreSecrets(): Promise<boolean> {
  return safeStorage.isAsyncEncryptionAvailable();
}

export async function readSecret(name: string): Promise<string | null> {
  let encrypted: Buffer;

  try {
    encrypted = fs.readFileSync(secretPath(name));
  } catch {
    // Archivo ausente: el caso normal antes de configurar nada.
    return null;
  }

  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(encrypted);

    // DPAPI puede rotar la clave del perfil. Si el sistema lo pide, se vuelve a
    // cifrar ya: si no, el archivo deja de abrirse en la siguiente sesión.
    if (shouldReEncrypt) await writeSecret(name, result);

    return result;
  } catch {
    // Cifrado con otro perfil de usuario o archivo corrupto: para la app el
    // resultado útil es el mismo, "no hay clave".
    return null;
  }
}

export async function writeSecret(name: string, value: string): Promise<void> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('Este equipo no puede cifrar secretos con safeStorage.');
  }

  const encrypted = await safeStorage.encryptStringAsync(value);
  fs.mkdirSync(secretsDir(), { recursive: true });
  fs.writeFileSync(secretPath(name), encrypted, { mode: 0o600 });
}

export function clearSecret(name: string): void {
  try {
    fs.rmSync(secretPath(name));
  } catch {
    // Ya no estaba: borrar dos veces no es un error.
  }
}
