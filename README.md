# MiloPet

Un compañero de escritorio que te escucha cuando presionas un atajo, entiende lo
que dices y hace pequeñas cosas por ti. Un Clippy, pero sin interrumpir.

Angular dibuja al personaje. Electron es dueño de la ventana, del atajo global y
de toda acción privilegiada. **El renderer nunca toca Node.**

> 📐 Antes de tocar código, lee [`docs/RECORRIDO-DEL-CODIGO.md`](docs/RECORRIDO-DEL-CODIGO.md):
> explica el código en orden, archivo por archivo, y el viaje completo de una
> pulsación. Para el mapa técnico está
> [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md). El registro de cambios está en
> [`HISTORIAL.md`](HISTORIAL.md).

## Estado: fase 2 de 5

Lo que ya funciona:

- Ventana transparente, sin marco, always-on-top, anclada abajo a la derecha.
- Click-through en todo el área excepto sobre el personaje (no bloquea tu trabajo).
- Atajo global `Ctrl+Shift+Space` con detección de conflicto (el aviso al
  arrancar todavía se pierde; está en el backlog previo a la fase 2).
- Máquina de estados `idle → listening → thinking → acting → idle`, que mueve
  tanto al personaje como a la burbuja de texto.
- **Micrófono real.** `listening` dura lo que dura tu frase: el VAD la cierra al
  dejar de hablar, sin botón de parar.
- **Transcripción.** El audio de la frase va a Deepgram y la burbuja enseña lo
  que dijo. La clave la pone cada usuario y se guarda cifrada.
- **Ajustes.** Clic derecho sobre Milo para pegar la clave o borrarla.

Lo que **todavía es simulado**:

- No hay cerebro. La burbuja repite lo transcrito; la fase 3 la sustituye por
  una respuesta.

## Configurar la voz

Milo no lleva ninguna clave dentro: una clave dentro del instalador la puede
sacar cualquiera. La pone cada usuario, gratis:

1. Crea una cuenta en <https://console.deepgram.com/signup> (incluye 200 $ de
   crédito) y genera una API key.
2. Clic derecho sobre Milo → **Ajustes** → pega la clave → Guardar.

Se valida contra la API antes de aceptarla y se guarda cifrada con `safeStorage`
(DPAPI en Windows) en `%APPDATA%\milo-pet\secrets\deepgram.bin` en desarrollo, y
en `%APPDATA%\MiloPet` en el build empaquetado. **Nunca** en `config.json`.

Esa clave es portable entre equipos, pero el archivo cifrado no: en otra máquina
hay que volver a pegarla. Para borrarla, el mismo botón de Ajustes.

## Requisitos

- Node **22.22.3+** (`nvm use` lee el `.nvmrc`). Angular 22 no corre en Node 20.
- Windows 10/11 para el empaquetado.

## Ejecutar

```bash
npm install
npm run dev
```

`npm run dev` levanta el servidor de desarrollo de Angular y Electron juntos.
Todo lo que edites en `src/` se recarga en caliente dentro de la ventana.

> Si `npm install` termina sospechosamente rápido y no existe
> `node_modules/electron/dist/`, se saltó la descarga del binario de Electron.
> Resuélvelo con: `node node_modules/electron/install.js`

Si solo quieres pulir al personaje, sin Electron:

```bash
npm run dev:web
```

Abre <http://localhost:4200> en Chrome. El puente cae a un sustituto de
navegador, así que `Ctrl+Shift+Space` sigue moviendo la máquina de estados. El
micrófono funciona ahí, pero la transcripción no: no hay proceso main que
guarde la clave.

> Los cambios en `electron/` requieren reiniciar `npm run dev`: el proceso main
> se compila una vez, no está en watch. Para breakpoints usa la configuración de
> VS Code incluida.

Para ver la ventana de producción de verdad (build + `file://`), que es donde se
comprueban `baseHref`, el CSP y el micrófono:

```bash
npm run preview
```

## Scripts

| Comando                 | Qué hace                                                         |
| ----------------------- | ---------------------------------------------------------------- |
| `npm run dev`           | Angular + Electron con recarga en caliente.                      |
| `npm run dev:web`       | Solo Angular en Chrome.                                          |
| `npm run dev:debug`     | Electron con el puerto de depuración 9222 abierto.               |
| `npm run dev:zones`     | Dev con el overlay que pinta las zonas interactivas y la mirada. |
| `npm run build`         | Compila Electron a `dist-electron/` y Angular a `dist/`.         |
| `npm run preview`       | Compila y abre la ventana de producción real.                    |
| `npm run package`       | Genera el instalador NSIS en `release/`.                         |
| `npm run lint`          | ESLint sobre renderer y proceso main.                            |
| `npm run test`          | Tests unitarios (Vitest).                                        |
| `npm run test:ci`       | Los mismos tests, una vez y sin watch (lo que corre la CI).      |
| `npm run typecheck`     | Type-check de Electron + build del renderer.                     |
| `npm run format`        | Prettier sobre todo el proyecto.                                 |
| `npm run verify`        | Lint + formato + tests + build. Lo mismo que corre la CI.        |
| `npm run history:check` | Verifica que `HISTORIAL.md` no crezca más de la cuenta.          |

## Estructura

```
electron/          proceso main: ventana, atajo global, IPC, clave cifrada, STT
src/shared/        contrato main ↔ renderer (tipos + canales) y utilidades de audio
src/app/core/      bucle de interacción, audio (VAD + captura), token MILO
src/app/features/  mascota (SVG), burbuja de texto y pantalla de ajustes
.opencode/skills/  skills del repo: milo-ipc y milo-verify
scripts/           comprobaciones de CI (historial)
docs/              arquitectura y recorrido del código
```

## Convenciones

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`…). Hay un hook que los valida.
- **Formato:** Prettier al guardar (config incluida en `.vscode/settings.json`).
- **Líneas:** LF en todo el repo (`.gitattributes`), aunque estés en Windows.
- **Agentes:** las reglas están en [`AGENTS.md`](AGENTS.md). Se abren desde la
  raíz del repositorio para que OpenCode cargue las skills.

## Reglas que no se negocian

- Las API keys viven **solo en el proceso main**, cifradas con `safeStorage`.
  Nunca en `config.json`, nunca en el renderer, nunca en un payload IPC.
- El modelo nunca genera comandos de shell: elige de un catálogo cerrado.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
