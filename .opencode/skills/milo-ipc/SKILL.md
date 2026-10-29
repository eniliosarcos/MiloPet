---
name: milo-ipc
description: 'Trigger: nueva acción, nuevo canal, IPC, preload, conectar main y renderer. Conecta una capacidad de Milo de punta a punta.'
license: Apache-2.0
metadata:
  author: 'eniliosarcos'
  version: '1.0'
---

# Milo IPC

## Activation Contract

Carga esta skill cuando la tarea añada o cambie algo que cruza procesos:

- una acción nueva del asistente;
- un canal IPC nuevo;
- exponer una operación privilegiada al renderer;
- tocar `MiloBridge`, `CHANNELS` o `preload.ts`.

## Hard Rules

- El contrato empieza en `src/shared/ipc.ts`. Nunca escribas un nombre de canal como string suelto en otro archivo.
- El renderer no importa `electron` ni `node:*`.
- Los payloads deben ser serializables por structured clone: nada de funciones, clases ni streams.
- Las API keys no cruzan IPC. El main las usa y devuelve solo el resultado.
- La acción la elige el modelo de un catálogo cerrado; nunca ejecuta shell.

## Decision Gates

| Necesito                            | Mecanismo                               |
| ----------------------------------- | --------------------------------------- |
| El renderer pide y espera respuesta | `ipcRenderer.invoke` / `ipcMain.handle` |
| El main avisa al renderer           | `sendToRenderer` / `ipcRenderer.on`     |
| Guardar un ajuste                   | `MiloConfig` + `config.ts`              |
| Solo cambia la vista                | No es IPC: hazlo en Angular             |

## Execution Steps

1. `src/shared/ipc.ts`: añade el canal a `CHANNELS`, los tipos y el método en `MiloBridge`.
2. `electron/preload.ts`: añade el literal a `CH` e implementa el método. El `satisfies` falla hasta que coincida.
3. `electron/main.ts`: registra el handler dentro de `registerIpc()`.
4. `src/app/core/milo/milo-bridge.ts`: implementa el método en `createBrowserBridge()`. No compila hasta que lo hagas; es intencional.
5. `src/app/app.spec.ts`: añade el método a `createFakeBridge()`.
6. Consume desde el componente con `inject(MILO)`.
7. Verifica con `npm run verify` y después con la skill `milo-verify`.

## Output Contract

Devuelve: canal añadido, archivos tocados, si el renderer puede dispararlo sin
acción del usuario, y los comandos de verificación ejecutados.

## References

- `src/shared/ipc.ts` — contrato, fuente de verdad.
- `docs/ARQUITECTURA.md` — por qué existe la frontera y qué se puede romper.
