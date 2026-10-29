# Historial de cambios — MiloPet

Registro de lo que se construyó, en orden inverso (lo más nuevo arriba).
Una entrada por tarea, máximo 18 líneas: el detalle vive en el commit.
Al pasar de 350 líneas, las entradas antiguas se archivan en `docs/historial/`.

---

## Historial

### 2026-10-29 — El proveedor de voz pasa a Deepgram por bloqueo regional · fix

**Qué:** Groq respondía 403 en la consola y en la API desde esta red, así que la transcripción se movió a Deepgram: `POST /v1/listen` con el WAV en el cuerpo (no multipart), `model=nova-2`, `language=es`, `smart_format`. La clave se guarda como `deepgram`.
**Por qué:** el 403 no era de la clave —OpenAI contesta lo mismo desde aquí con `unsupported_country_region_territory`— y el mapeo lo confundía con "clave no válida", mandando a revisar algo que estaba bien.
**Tocó:** `electron/stt/transcriber.ts`, `electron/main.ts`, `src/shared/ipc.ts`, `core/stt/failure.ts`, `features/settings/`, tests y `docs/`.
**Aprendido:** `/v1/models` de Deepgram es público y responde 200 sin token: la primera validación guardaba claves inventadas. La buena es `/v1/auth/token`. Un 403 merece un fallo propio (`blocked`) y no `auth`.
**Commits:** `9dd8e6b`

### 2026-10-29 — Voz a texto con Groq y ajustes para la clave · feat

**Qué:** `thinking` deja de ser un temporizador: el PCM de la frase viaja por IPC, el main lo convierte en WAV y lo manda a Groq (`whisper-large-v3-turbo`, `es`), y la burbuja enseña lo transcrito. Estrena la ventana de ajustes (`?settings=1`, otro componente raíz) para que cada usuario ponga su clave, cifrada con `safeStorage`.
**Por qué:** una clave dentro del instalador la paga y la extrae cualquiera; BYOK es lo único que permite distribuir Milo sin backend propio.
**Tocó:** `src/shared/ipc.ts`, `src/shared/audio.ts` y su spec, `electron/stt/transcriber.ts`, `electron/secrets.ts`, `electron/settings.ts`, `electron/main.ts`, `preload.ts`, `window.ts`, `src/app/core/{interaction,stt}`, `features/settings/`, `app.ts`, `app.html`, `main.ts`, `tsconfig.electron.json`, `docs/`.
**Aprendido:** `bootstrapApplication` engancha al elemento que coincide con el selector: sin `<app-settings>` en el DOM la ventana arranca vacía y sin un solo error. `safeStorage.isEncryptionAvailable` está obsoleto en Electron 45; la API buena es `isAsyncEncryptionAvailable` + `encryptStringAsync`.
**Commits:** `9deb1d3`

### 2026-10-29 — Oídos reales: micrófono y VAD · feat

**Qué:** El bucle de interacción sale de `app.ts` a `core/interaction/`, y `listening` deja de ser un `setTimeout(1500)`: abre el micrófono con `getUserMedia`, calibra el ruido de fondo 300 ms y cierra la frase por energía. Sin voz vuelve a `idle` sin mensaje.
**Por qué:** `globalShortcut` no emite la tecla soltada, así que el silencio es el único botón de parar que existe; sin VAD, Milo se queda escuchando para siempre.
**Tocó:** `src/app/core/audio/vad.ts` y su spec, `core/audio/capture.ts`, `core/interaction/interaction.ts`, `app.ts`, `app.spec.ts`, `features/bubble/bubble.ts`, `electron/window.ts`, `docs/ARQUITECTURA.md`, `docs/RECORRIDO-DEL-CODIGO.md`.
**Aprendido:** Medido en la ventana empaquetada: `file://` es contexto seguro, el permiso sale `granted`, `getUserMedia` devuelve pista y `AudioContext` corre a 48 kHz con ruido de fondo ≈0,0055 RMS. `setInterval` y no rAF: con la ventana tapada el rAF se detiene y el VAD no cortaría.
**Commits:** `e6493d1..b4bf50a`

### 2026-10-29 — Ojos más chicos y separación constante al mirar · fix

**Qué:** Los ojos bajan al 90 % del dibujo original, y las dos escalas que los mueven —la perspectiva de la mirada y el 6 % de `listening`— anclan el borde interno de cada ojo en vez de su centro.
**Por qué:** se veían grandes, y al seguir el cursor el ojo lejano se separaba un 31 % (10,3 → 13,5 unidades del viewBox): se leía más lejos de lo que estaba.
**Tocó:** `src/app/features/mascot/mascot.html`, `mascot.scss`, `docs/ARQUITECTURA.md`.
**Aprendido:** escalar desde el centro corre los dos bordes internos hacia fuera; anclarlos deja la separación en 10,0 unidades y manda todo el cambio al contorno exterior. Son tres grupos por ojo (`eye-state`, `eye-scaler` y el propio `eye`) porque cada `transform` tiene un solo dueño: estado, mirada y parpadeo.
**Commits:** `c8e1899`, `c64892f`, `84702b8`

### 2026-10-29 — El arrastre pasa por IPC y desaparece la franja muerta · feat

**Qué:** Todo el hotspot arrastra la ventana por tres canales (`dragStart`, `dragMove`, `dragEnd`); el main relee `screen.getCursorScreenPoint()` y mueve con el delta desde el origen, y la posición se guarda una sola vez al soltar.
**Por qué:** `app-region: drag` ignoraba los eventos de puntero, así que el anillo de 14 px que desbloqueaba los clics no arrastraba: el cursor prometía `grab` y el gesto no respondía.
**Tocó:** `src/shared/ipc.ts`, `electron/preload.ts`, `electron/window.ts`, `electron/main.ts`, `src/app/app.ts`, `app.html`, `app.scss`, `app.spec.ts`, `core/milo/milo-bridge.ts`, `docs/ARQUITECTURA.md`, `docs/RECORRIDO-DEL-CODIGO.md`.
**Aprendido:** `getCursorScreenPoint()` y los bounds de la ventana son DIP, así que el `scaleFactor` que la nota anterior daba por obligatorio sobra mientras las coordenadas no crucen IPC; y `moved` deja de servir para guardar porque `setPosition` puede dispararlo en cada paso.
**Commits:** `0fadf92`

### 2026-10-29 - Zonas: anillo de 14 px, alcance dentro de la ventana y marco del mundo · fix

**Qué:** El anillo del arrastre pasa a 14 px y el hotspot a 115×71 px, `GAZE_RANGE` baja a 0,42 para que el círculo de la mirada quepa entero, y el modo dev pinta el borde de la ventana en violeta con su tamaño en píxeles.
**Por qué:** con 8 px el arrastre no arrancaba al entrar rápido, y con 0,8 el alcance caía fuera de la ventana: la perilla no cambiaba nada visible y el overlay dibujaba un arco cortado que parecía un fallo.
**Tocó:** `src/app/app.scss`, `app.html`, `app.ts`, `app.spec.ts`, `features/mascot/gaze.ts` y sus dos tests, `docs/ARQUITECTURA.md`, `docs/RECORRIDO-DEL-CODIGO.md`.
**Aprendido:** la franja que desbloquea la ventana no arrastra: es el techo de `app-region: drag`; y dos tests fijaban el alcance con números propios (0,7 del lado, +150 px), ahora lo derivan de las constantes.
**Commits:** `a227349`, `0f54c88`, `e001f89`

### 2026-10-29 - La mirada sigue al cursor de forma proporcional y continua · feat

**Qué:** Los ojos se desplazan en proporción a la distancia al cursor hasta `GAZE_REACH` (0,25 del lado) y se saturan después; la pareja gana perspectiva (30 % de estrechamiento en el ojo que apunta, 8 % de ensanche en el otro) y seguir usa 100 ms `linear`.
**Por qué:** el vector unitario saturaba la mirada en cuanto el cursor entraba en la ventana, y la transición reiniciada en cada `mousemove` congelaba los ojos y los hacía saltar al detenerse el ratón.
**Tocó:** `src/app/features/mascot/gaze.ts`, `mascot.ts`, `mascot.html`, `mascot.scss`, tests de la mirada, `docs/ARQUITECTURA.md`.
**Aprendido:** un `mousemove` reinicia la transición desde el valor actual, así que con una curva de arranque plano el valor apenas avanza entre eventos; `linear` la convierte en un filtro exponencial. Medido: 200 ms en -15 px, 4 px de avance y 25 px en 100 ms al parar el cursor. Los 18 %/6 % y 420 ms de la entrada anterior quedan sustituidos.
**Commits:** `f86ce85`

### 2026-10-29 - El agarre del arrastre cabe dentro del torso · fix

**Qué:** El hotspot mide lo mismo que el agarre más un anillo de 8 px, y las dos cajas caen dentro de la silueta del torso; la cara vuelve a ser click-through.
**Por qué:** el hotspot medía 58 % y llegaba a la frente, así que el cursor prometía `grab` sobre la cara y el pecho, donde no hay región de arrastre, y el gesto "no respondía" sin lanzar ningún error.
**Tocó:** `src/app/app.scss`, `docs/ARQUITECTURA.md`, `docs/RECORRIDO-DEL-CODIGO.md`.
**Aprendido:** la región `app-region: drag` se traga también el `mousemove` reenviado por `setIgnoreMouseEvents`, así que el anillo exterior es lo que desbloquea la ventana; y `app-region: drag` ignora `border-radius`, comprobado arrastrando desde una esquina fuera de la elipse pintada.
**Commits:** `00827c1`

### 2026-10-29 - Modo dev que colorea las zonas reales · feat

**Qué:** `npm run dev:zones` (o `?zones=1`) pinta el hotspot en azul, el agarre en rojo y, en el SVG, los radios de `GAZE_REACH` y `GAZE_RANGE`.
**Por qué:** dos fallos seguidos vinieron de adivinar rectángulos invisibles: primero el agarre sobre los ojos, después el agarre que no coincidía con el hotspot.
**Tocó:** `src/app/app.ts`, `app.html`, `app.scss`, `app.spec.ts`, `src/app/features/mascot/`, `electron/window.ts`, `package.json`, `docs/RECORRIDO-DEL-CODIGO.md`.
**Aprendido:** el overlay colorea los elementos reales en vez de recalcular la geometría, así que no puede desviarse; y no lleva atajo de teclado porque la ventana es click-through y casi nunca tiene el foco.
**Commits:** `4365c9d`

### 2026-10-29 — La mirada da volumen a la pareja de ojos · feat

**Qué:** Al seguir al cursor, el ojo hacia el que mira se estrecha un 18 % en horizontal y el otro se ensancha un 6 %, con la altura intacta y transición de 420 ms.
**Por qué:** los dos ojos se desplazaban igual y el gesto se leía como un desplazamiento plano, no como una cara que se vuelve.
**Tocó:** `src/app/features/mascot/gaze.ts`, `mascot.ts`, `mascot.html`, `mascot.scss`, tests.
**Aprendido:** `scale` es propiedad individual y se multiplica con el `transform` del parpadeo y el `translate` del barrido sin pisarlos. Medido en Chromium 156: `scale` en un `<g>` de SVG es uniforme y respeta `transform-box: fill-box`. Un escalado uniforme no cambia la forma, así que encoger un ojo solo da dos círculos de distinto tamaño; el giro se lee estrechando en horizontal y dejando la altura quieta.
**Commits:** `e7131be..d9c0656`

### 2026-10-29 — La mirada vuelve al centro despacio · fix

### 2026-10-29 — La mirada vuelve al centro despacio · fix

**Qué:** Al perder el cursor, los ojos regresan al centro en 700 ms con una curva suave; mientras lo siguen responden en 160 ms.
**Por qué:** la vuelta duraba lo mismo que el seguimiento (180 ms) y se sentía mecánica al alejar el ratón.
**Tocó:** `src/app/features/mascot/mascot.scss`, `gaze.ts` y sus dos tests.
**Aprendido:** la región `app-region: drag` deja sin `mousemove` la cara de Milo, así que los ojos se congelan al entrar en el hotspot: es el precio de arrastrarlo por la cara. CSS aplica la duración del estado de destino, así que `[data-gaze='true']` basta para tener dos velocidades sin tocar TypeScript.
**Commits:** `0579f69`

### 2026-10-29 — La mirada crece al acercar el cursor · fix

**Qué:** La deflexión de los ojos ahora crece con la cercanía del cursor (8,3 px en el borde, 10,6 px encima) y se queda al tope dentro del radio muerto entre los dos ojos.
**Por qué:** en la ventana real, acercar el cursor al centro de la cara encogía la mirada hasta cero: la curva escalaba con la distancia.
**Tocó:** `src/app/features/mascot/gaze.ts`, `src/app/features/mascot/mascot.ts`, tests de la mirada.
**Aprendido:** normalizar la dirección sin una magnitud de cercanía apaga la mirada justo cuando el cursor está encima; y entre los ojos la dirección es inestable, así que ahí se conserva la última en vez de recalcular.
**Commits:** `a1305d1`

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
