# Reglas del repositorio — MiloPet

Compañero de escritorio: Angular 22 (signals, sin zone.js) en el renderer y
Electron 45 en el proceso main. El renderer dibuja; el main tiene los permisos.
**El renderer nunca toca Node.**

Antes de tocar código, lee `docs/RECORRIDO-DEL-CODIGO.md`. El mapa técnico y las
decisiones están en `docs/ARQUITECTURA.md`.

## No asumas el estado

- La fase actual está en la última entrada de `HISTORIAL.md`. Compruébala; no la recuerdes.
- No afirmes que algo funciona porque lo dice un documento: abre el archivo o ejecuta la comprobación.
- Lo simulado se marca `SIMULADO` en el código y se dice en la respuesta. Hoy no existe el cerebro: la transcripción y el micrófono sí son reales.

## Límites de seguridad (no negociables)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Nunca cambiarlos.
- Las API keys viven solo en el proceso main, cifradas con `safeStorage`. Nunca en `config.json`, nunca en el renderer, nunca en un payload IPC.
- El modelo elige de un catálogo cerrado de acciones. Nunca genera shell, rutas ni código evaluado.
- Toda operación nueva cruza por `src/shared/ipc.ts` → `electron/preload.ts`. El renderer no importa `electron` ni `node:*`.

## Convenciones

- Comentarios y documentación en **español**; identificadores en **inglés**.
- Conventional Commits. La identidad del repo es `eniliosarcosdev@gmail.com`.
- Node 22.22.3 (`.nvmrc`).
- Una decisión con contrapartida se explica en `docs/ARQUITECTURA.md`, no en un comentario suelto.

## Historial: presupuesto, no diario

Una entrada por **tarea**, no por commit. Máximo 18 líneas. Sin tablas de
archivos. Las entradas anteriores a 2026-10-29 se conservan como están.

```md
### AAAA-MM-DD — Título corto · tipo

**Qué:** una frase.
**Por qué:** una frase.
**Tocó:** `archivo1`, `archivo2`.
**Aprendido:** opcional, una frase.
**Commits:** `abc1234` o `abc1234..def5678`
```

El detalle va en el commit. Si no cabe en 18 líneas, no es historial: es
documentación, y va a `docs/`.

Al pasar 350 líneas, mueve las entradas más antiguas a `docs/historial/<año>.md`
y deja el enlace en la cabecera. `npm run history:check` lo verifica en CI.

## Antes de decir "listo"

```bash
npm run verify        # lint + formato + tests + build
npm run history:check
```

Para la ventana real, usa la skill `milo-verify`. Un build verde no prueba que la
ventana se vea: `baseHref` y CSP solo fallan bajo `file://`.

## Skills del repositorio

| Skill         | Cuándo se carga                                 |
| ------------- | ----------------------------------------------- |
| `milo-ipc`    | Añadir una capacidad que cruza main y renderer. |
| `milo-verify` | Comprobar el resultado en la ventana real.      |

## Dónde va cada cosa

| Necesito                      | Documento                      |
| ----------------------------- | ------------------------------ |
| Entender el código en orden   | `docs/RECORRIDO-DEL-CODIGO.md` |
| Mapa de archivos y decisiones | `docs/ARQUITECTURA.md`         |
| Qué cambió y por qué          | `HISTORIAL.md`                 |
| Cómo se trabaja en este repo  | este archivo                   |
