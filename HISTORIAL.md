# Historial de cambios — MiloPet

Registro de lo que se construyó, en orden inverso (lo más nuevo arriba).
Una entrada por tarea, máximo 18 líneas: el detalle vive en el commit.
Al pasar de 350 líneas, las entradas antiguas se archivan en `docs/historial/`.

---

## Historial

### 2026-10-29 — La mirada sigue al cursor · feat

**Qué:** Mientras el cursor está dentro de la ventana, los ojos se inclinan hacia él y el barrido automático se apaga; al salir vuelven a barrer solos.
**Por qué:** el usuario quería que Milo mirara al ratón cuando pasa cerca.
**Tocó:** `src/app/features/mascot/`, `docs/`.
**Aprendido:** el renderer solo ve el cursor dentro de su ventana, así que "cerca" es la ventana de 340×340; seguirlo en toda la pantalla pediría sondear `screen.getCursorScreenPoint()` desde main y un canal IPC nuevo. La mirada usa `translate` para sumarse al `transform` de los estados.
**Commits:** `d17a58c`

### 2026-10-29 — Cara de Milo: ojos sin pupila y boca oculta · feat

**Qué:** El personaje pierde orejas, cachetes y pupilas; cada ojo es una forma blanca con óvalo en reposo y párpado de enojo solo al fallar, la mirada barre y la boca apenas aparece.
**Por qué:** el usuario quería un gesto anime sentido, con los ojos como única animación.
**Tocó:** `src/app/features/mascot/mascot.html`, `src/app/features/mascot/mascot.scss`, `docs/RECORRIDO-DEL-CODIGO.md`.
**Aprendido:** una animación gana a cualquier `transform` declarado por el estado, así que el cambio de forma se hace cruzando dos siluetas por `opacity`; el barrido usa la propiedad individual `translate` para no pisar el parpadeo.
**Commits:** `a3db3fe`

### 2026-10-29 — Arrastrar a Milo y recordar dónde quedó · feat

**Qué:** El personaje se arrastra a cualquier punto de la pantalla y la posición se guarda al soltar.
**Por qué:** Milo estaba clavado en la esquina inferior derecha.
**Tocó:** `electron/window.ts`, `src/shared/ipc.ts`, `src/app/app.scss`, `src/app/app.html`, `src/app/app.spec.ts`, `docs/`.
**Aprendido:** `app-region: drag` ignora los eventos de puntero; el anillo exterior del hotspot es lo que mantiene vivo el desbloqueo de clics. `SetCursorPos` no pasa por el hook de Electron: para probar el arrastre hay que usar `SendInput`.
**Commits:** `217abb9..87b69c0`

### 2026-10-29 — La burbuja se cierra sola y con una (x) · feat

**Qué:** El mensaje vive 4 s tras volver a `idle`, se desvanece en 420 ms y sale del DOM; una (x) lo cierra antes.
**Por qué:** antes se quedaba en pantalla para siempre, hasta la siguiente pulsación del atajo.
**Tocó:** `src/app/app.ts`, `src/app/app.html`, `src/app/app.scss`, `src/app/app.spec.ts`, `features/bubble/`, `docs/`.
**Aprendido:** la (x) exige `data-interactive` en el envoltorio o funciona en web y está muerta en Electron; hay un test que lo vigila. El CLI de Angular inyectó un UUID de telemetría en `angular.json` al arrancar: revertido y desactivado.
**Commits:** `0952250..2061e93`

### 2026-10-29 — Reglas de agentes, skills y presupuesto del historial · chore

**Qué:** `AGENTS.md` con las reglas del repo, las skills `milo-ipc` y `milo-verify`, y un check que limita el tamaño del historial.
**Por qué:** las reglas vivían en la conversación y cada entrada duplicaba lo que ya dice el commit.
**Tocó:** `AGENTS.md`, `.opencode/skills/`, `scripts/check-history.mjs`, `package.json`, `README.md`, `.github/workflows/ci.yml`.
**Aprendido:** las skills de proyecto solo se descubren en `.opencode/skills/<nombre>/SKILL.md`; el check mide solo la entrada nueva para no obligar a reescribir historia.
**Commits:** `15d5240..4dee3a2`

### 2026-10-28 — Traducción del código y recorrido guiado

**Tipo:** docs

**Descripción:**
Se tradujeron al español todos los comentarios del código que quedaban en inglés
(contrato IPC, proceso main, renderer y estilos) y se añadió
`docs/RECORRIDO-DEL-CODIGO.md`, una guía que explica el proyecto en el orden en
que se ejecuta: desde `index.html` hasta la ventana de Electron, pasando por la
máquina de estados y la frontera del preload.

Los comentarios explican el **por qué** de cada decisión, no lo que el código ya
dice. Los identificadores (`MascotState`, `createMascotWindow`, etc.) siguen en
inglés: son la API del código y mezclar idiomas ahí sí vuelve ilegible el
proyecto.

**Bug encontrado y corregido:**
`ng lint` solo revisaba `src/**`, así que **el proceso main nunca pasaba por
ESLint**. Al incluirlo apareció un error real (`lastState` declarado y nunca
leído). Se añadió `electron/**/*.ts` a `lintFilePatterns` en `angular.json` y se
corrigió la variable usando el valor en una traza de desarrollo.

También se normalizó el árbol de trabajo a LF: los archivos estaban en CRLF
localmente y `format:check` fallaba aunque el repositorio (y CI) estaban en LF.

**Archivos:**

| Archivo                                                                     | Qué cambió                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/shared/ipc.ts`                                                         | Contrato y canales comentados en español.              |
| `electron/preload.ts`                                                       | Explicación de la lista blanca y del `satisfies`.      |
| `electron/main.ts`                                                          | Ciclo de vida, IPC y traza de estado en desarrollo.    |
| `electron/window.ts`                                                        | Cada opción de la ventana y por qué existe.            |
| `electron/hotkey.ts`, `electron/config.ts`                                  | Registro del atajo y persistencia.                     |
| `src/app/app.ts`                                                            | Máquina de estados, signals, `effect` y click-through. |
| `src/app/core/milo/milo-bridge.ts`                                          | Token `MILO` y sustituto de navegador.                 |
| `src/app/features/**`                                                       | Personaje, burbuja y sus plantillas.                   |
| `src/index.html`, `src/styles.scss`, `src/app/app.html`, `src/app/app.scss` | Comentarios y `lang="es"`.                             |
| `src/app/app.spec.ts`                                                       | Nombres de tests en español.                           |
| `docs/RECORRIDO-DEL-CODIGO.md`                                              | Guía nueva, lectura en orden.                          |
| `docs/ARQUITECTURA.md`, `README.md`                                         | Enlace a la guía nueva.                                |
| `angular.json`                                                              | `electron/**/*.ts` dentro de `lintFilePatterns`.       |
| `package.json`                                                              | Descripción en español.                                |

**Decisión clave:**
Se traducen comentarios y documentación, nunca identificadores. Un proyecto
público con `const crearVentanaDelPersonaje` pierde a cualquier colaborador
externo y rompe la convención de TypeScript; el mismo proyecto con comentarios en
español sigue siendo perfectamente navegable.

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
