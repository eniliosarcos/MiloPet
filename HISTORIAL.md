# Historial de cambios — MiloPet

Registro de todo lo que se construyó, en orden inverso (lo más nuevo arriba).
Cada entrada responde: qué se hizo, por qué, y en qué archivos.

---

## Historial

### 2026-10-28 — Publicación en GitHub

**Tipo:** config

**Descripción:**
El repositorio se subió a <https://github.com/eniliosarcos/MiloPet> en la rama
`main`, con 7 commits.

Trabajo previo necesario: los commits originales estaban firmados con
`esarcos@chattigo.com` (el correo laboral configurado globalmente). Se configuró
la identidad **solo para este repositorio** — `eniliosarcosdev@gmail.com` — y se
reescribieron los 7 commits (autor y committer) para que GitHub los atribuya a la
cuenta correcta y para no publicar el correo de trabajo en un repo público.

La configuración global de git no se tocó: sigue siendo el correo laboral para
los demás proyectos.

**Archivos:**

| Archivo        | Qué hace                                           |
| -------------- | -------------------------------------------------- |
| `.git/config`  | Identidad local y remoto `origin`. No se versiona. |
| `HISTORIAL.md` | Esta entrada.                                      |

**Decisión clave:**
Identidad local (`git config user.email` sin `--global`) en vez de global. Si se
cambia el global, todos los repos de la máquina heredan un correo que quizá no
corresponde a ese proyecto; y en sentido inverso, un repo público nunca debe
arrastrar el correo de la empresa.

### 2026-10-28 — Calidad, convenciones y CI

**Tipo:** chore (tooling) + docs

**Descripción:**
Se añadieron las prácticas que hacen que el proyecto sea mantenible y apto para
GitHub:

- **ESLint 22** (angular-eslint) con dos bloques separados: uno para el renderer
  con reglas de Angular y plantillas, y otro para `electron/` con globals de Node
  y sin reglas de Angular. `no-console` avisa en ambos.
- **Prettier** como único formateador, con `format` y `format:check`, e
  `.prettierignore` para no tocar build ni lockfile.
- **Conventional Commits** validados con commitlint, más `lint-staged` en el
  pre-commit (arregla y formatea solo lo que se está commiteando).
- **`.gitattributes`** con `eol=lf`. Sin esto, en Windows todo el repo aparece
  modificado cada vez que git toca los archivos.
- **VS Code** con formato al guardar, ESLint al guardar y extensiones
  recomendadas, para que el editor no sea una decisión personal.
- **CI en GitHub Actions**: `npm ci`, lint, formato, tests y build en cada push
  y pull request. Se salta la descarga del binario de Electron porque no hace
  falta para verificar.

Verificado antes de commitear: `lint` limpio, `format:check` limpio, `build`
correcto, 2 tests en verde, y commitlint **rechaza** un mensaje mal formado
(probado a propósito).

**Archivos:**

| Archivo                                             | Qué hace                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `eslint.config.js`                                  | Reglas separadas para renderer y proceso main.                                                       |
| `.prettierrc`, `.prettierignore`                    | Formato único del proyecto.                                                                          |
| `.gitattributes`                                    | LF en todo el repo, binarios marcados.                                                               |
| `.vscode/settings.json`, `.vscode/extensions.json`  | Editor compartido.                                                                                   |
| `commitlint.config.mjs`                             | Reglas de los mensajes de commit.                                                                    |
| `.husky/pre-commit`, `.husky/commit-msg`            | Hooks de git.                                                                                        |
| `.github/workflows/ci.yml`                          | Verificación automática.                                                                             |
| `package.json`                                      | Scripts `lint`, `lint:fix`, `format`, `format:check`, `test:ci`; `engines`; config de `lint-staged`. |
| `README.md`, `docs/ARQUITECTURA.md`, `HISTORIAL.md` | Documentación en español.                                                                            |

**Decisión clave:**
Los hooks cubren solo los archivos que se están commiteando (`lint-staged`), no
todo el proyecto. Un pre-commit que tarda 40 segundos termina desactivado por el
propio desarrollador, y entonces no protege nada.

**Pendiente:** crear el repositorio remoto en GitHub y subir. Requiere la URL o
el cliente `gh` autenticado.

### 2026-10-28 — Fase 1: columna vertebral (ventana, hotkey, personaje)

**Tipo:** feature (scaffold)

**Descripción:**
Se creó el proyecto desde cero y quedó funcionando de punta a punta la
"columna vertebral": una ventana transparente de Electron que muestra a Milo
dibujado en SVG, reacciona a un atajo global de teclado y refleja su estado en
una burbuja de texto.

Lo verificado en ejecución real (no asumido):

- La ventana renderiza con fondo transparente (`rgba(0, 0, 0, 0)`).
- `Ctrl+Shift+Space` dispara el atajo global y el estado pasa de `idle` a `listening`.
- `npm run dev` levanta Angular + Electron juntos sin errores.
- El puente `window.milo` existe en el renderer y `node_modules/electron` está
  fuera de su alcance.

Lo que **todavía no** existe (es simulado, no real):

- El micrófono: `listening` es un `setTimeout`, no captura audio.
- El cerebro: la burbuja muestra un texto fijo, no hay IA.
- Ninguna acción de sistema (`abrir app`, `buscar`, `timer`).

**Archivos:**

| Archivo                             | Qué hace                                                            |
| ----------------------------------- | ------------------------------------------------------------------- |
| `angular.json`                      | Build de producción con `baseHref: "./"` y `inlineCritical: false`. |
| `tsconfig.electron.json`            | Compila `electron/` y `src/shared/` a CommonJS en `dist-electron/`. |
| `electron/main.ts`                  | Ciclo de vida, instancia única, registro de IPC.                    |
| `electron/window.ts`                | La ventana: transparente, frameless, always-on-top, click-through.  |
| `electron/hotkey.ts`                | Registro del atajo global y detección de colisión.                  |
| `electron/config.ts`                | Ajustes en `userData/config.json`.                                  |
| `electron/preload.ts`               | Única superficie expuesta al renderer.                              |
| `src/shared/ipc.ts`                 | Contrato main ↔ renderer (canales + tipos).                         |
| `src/app/core/milo/milo-bridge.ts`  | Token de inyección `MILO` y sustituto para navegador.               |
| `src/app/features/mascot/`          | SVG procedural + 5 estados animados.                                |
| `src/app/features/bubble/`          | Burbuja de texto (única salida de Milo).                            |
| `src/app/app.ts`                    | Máquina de estados y bucle de interacción.                          |
| `src/app/app.spec.ts`               | Tests del estado con un puente falso.                               |
| `electron-builder.yml`              | Empaquetado a instalador NSIS de Windows.                           |
| `README.md`, `docs/ARQUITECTURA.md` | Documentación.                                                      |

**Decisión clave:**
El renderer nunca ve Node ni las API keys. Todo lo privilegiado vive en el
proceso main y se expone con una lista blanca de operaciones nombradas
(`MiloBridge`). Es más trabajo inicial, pero elimina la clase de error más cara
de un asistente de escritorio: un renderer comprometido con acceso al sistema.
