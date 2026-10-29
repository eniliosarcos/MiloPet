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

## Estado: fase 1 de 5

Lo que ya funciona:

- Ventana transparente, sin marco, always-on-top, anclada abajo a la derecha.
- Click-through en todo el área excepto sobre el personaje (no bloquea tu trabajo).
- Atajo global `Ctrl+Shift+Space` con detección de conflicto.
- Máquina de estados `idle → listening → thinking → acting → idle`, que mueve
  tanto al personaje como a la burbuja de texto.

Lo que **todavía es simulado**:

- No hay micrófono. El estado `listening` es un `setTimeout`.
- No hay cerebro. La burbuja muestra un mensaje fijo.

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
navegador, así que `Ctrl+Shift+Space` sigue moviendo la máquina de estados.

> Los cambios en `electron/` requieren reiniciar `npm run dev`: el proceso main
> se compila una vez, no está en watch. Para breakpoints usa la configuración de
> VS Code incluida.

## Scripts

| Comando                 | Qué hace                                                  |
| ----------------------- | --------------------------------------------------------- |
| `npm run dev`           | Angular + Electron con recarga en caliente.               |
| `npm run dev:web`       | Solo Angular en Chrome.                                   |
| `npm run dev:debug`     | Electron con el puerto de depuración 9222 abierto.        |
| `npm run build`         | Compila Electron a `dist-electron/` y Angular a `dist/`.  |
| `npm run preview`       | Compila y abre la ventana de producción real.             |
| `npm run package`       | Genera el instalador NSIS en `release/`.                  |
| `npm run lint`          | ESLint sobre renderer y proceso main.                     |
| `npm run test`          | Tests unitarios (Vitest).                                 |
| `npm run typecheck`     | Type-check de Electron + build del renderer.              |
| `npm run format`        | Prettier sobre todo el proyecto.                          |
| `npm run verify`        | Lint + formato + tests + build. Lo mismo que corre la CI. |
| `npm run history:check` | Verifica que `HISTORIAL.md` no crezca más de la cuenta.   |

## Estructura

```
electron/          proceso main: ventana, atajo global, IPC, ajustes
src/shared/        contrato main ↔ renderer (tipos + canales)
src/app/core/      token MILO + sustituto para navegador
src/app/features/  mascota (SVG) y burbuja de texto
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
- El modelo nunca genera comandos de shell: elige de un catálogo cerrado.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
