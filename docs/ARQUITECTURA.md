# Arquitectura de MiloPet

Documento de referencia corto. Si vuelves al proyecto en dos semanas, esto es lo
que necesitas leer antes de tocar código.

> 🚶 Si lo que quieres es **entender el código paso a paso**, empieza por
> [`RECORRIDO-DEL-CODIGO.md`](RECORRIDO-DEL-CODIGO.md). Este documento asume que
> ya lo leíste.

## Idea en una frase

Angular dibuja al personaje; Electron es dueño de la ventana, del atajo global y
de todo lo que requiere permisos. **El renderer nunca toca Node.**

## Estado actual: fase 2 de 5

| Fase | Qué añade                                               | Estado    |
| ---- | ------------------------------------------------------- | --------- |
| 1    | Ventana + atajo global + máquina de estados + personaje | ✅ hecho  |
| 2    | Micrófono, VAD, transcripción (STT)                     | ✅ hecho  |
| 3    | Cerebro (LLM) + router de intención                     | pendiente |
| 4    | Acciones reales con lista blanca                        | pendiente |
| 5    | Contexto (ventana activa, resumen de pantalla)          | pendiente |

## El flujo completo hoy

```
[Ctrl+Shift+Space]
        │  (globalShortcut, nivel sistema operativo)
        ▼
electron/hotkey.ts  ──►  electron/main.ts
                              │  sendToRenderer('milo:hotkey')
                              ▼
                    electron/preload.ts  (contextBridge)
                              │
                              ▼
        src/app/core/interaction/interaction.ts  (máquina de estados)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      app-mascot (SVG)  app-bubble (texto)  core/audio → main → Deepgram
      estado: listening   mensaje: ...      texto transcrito
```

Nada de eso cruza por `nodeIntegration`. El renderer solo puede llamar a los
métodos que `preload.ts` decidió publicar.

## Mapa de archivos

### Proceso main (privilegiado)

| Archivo                | Responsabilidad                                                                  |
| ---------------------- | -------------------------------------------------------------------------------- |
| `electron/main.ts`     | Ciclo de vida, instancia única, registro de handlers IPC.                        |
| `electron/window.ts`   | Crea la ventana; posición guardada, transparencia, always-on-top, click-through. |
| `electron/settings.ts` | La ventana de ajustes: misma build, query distinta.                              |
| `electron/hotkey.ts`   | Registra el atajo global; informa si otro programa ya lo tiene.                  |
| `electron/config.ts`   | Lee/escribe `config.json` en `app.getPath('userData')`.                          |
| `electron/secrets.ts`  | Claves cifradas con `safeStorage`. Nunca en `config.json`.                       |
| `electron/stt/`        | Voz a texto: interfaz `Transcriber` + implementación de Deepgram.                |
| `electron/preload.ts`  | Puente. Traduce métodos del `MiloBridge` a mensajes IPC concretos.               |

### Contrato compartido

| Archivo               | Responsabilidad                                             |
| --------------------- | ----------------------------------------------------------- |
| `src/shared/ipc.ts`   | Nombres de canales y tipos. **Fuente única de verdad.**     |
| `src/shared/audio.ts` | WAV y remuestreo: puro, sin Electron, probado con el resto. |

### Renderer (Angular)

| Archivo                                   | Responsabilidad                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `src/app/app.ts`                          | La ventana: arrastre por IPC, click-through y modo dev de zonas.                 |
| `src/app/core/interaction/interaction.ts` | El bucle: atajo → escuchar → pensar → responder, y el ciclo de vida del mensaje. |
| `src/app/core/audio/vad.ts`               | Máquina de tiempos del VAD, sin Web Audio ni timers: se prueba con números.      |
| `src/app/core/audio/capture.ts`           | Micrófono real: `getUserMedia` + `AnalyserNode` + calibración + PCM.             |
| `src/app/core/stt/failure.ts`             | Los fallos de transcripción dichos en la burbuja y en los ajustes.               |
| `src/app/features/settings/`              | La pantalla donde cada usuario pone su clave.                                    |
| `src/app/core/milo/milo-bridge.ts`        | Token `MILO`; si no hay Electron, devuelve un sustituto que funciona en Chrome.  |
| `src/app/features/mascot/`                | El cuerpo: SVG + estados + animaciones + mirada que sigue al cursor.             |
| `src/app/features/bubble/`                | La burbuja de texto.                                                             |

## Las diez decisiones que no son obvias

Cada una existe por un bug concreto que ya nos costó tiempo.

**1. `baseHref: "./"` en `angular.json`.**
Angular genera `<base href="/">`. Bajo `file://` eso resuelve a la raíz del
disco, el `main.js` no carga y la ventana queda **en blanco sin ningún error**.
Es el bug más silencioso de Electron + Angular.

**2. `inlineCritical: false`.**
La optimización de CSS crítico inyecta un `<script>` inline en el HTML. Eso
obliga a `script-src 'unsafe-inline'` en el CSP, que es justo lo que queremos
evitar. Apagándola, el CSP puede ser estricto de verdad.

**3. Los nombres de canal se duplican en `preload.ts`, pero con verificación.**
Un preload en modo `sandbox` solo puede hacer `require('electron')`; no puede
importar `src/shared/ipc.ts`. Por eso los literales están repetidos, y una
cláusula `satisfies` los compara con el contrato: si cambias un canal en un solo
lado, **el build falla** en vez de romperse en silencio.

**4. Click-through con punto caliente, no con la ventana entera.**
`setIgnoreMouseEvents(true, { forward: true })` en `window.ts` deja pasar los
clics a lo que haya detrás — Milo nunca bloquea tu trabajo. Pero necesitamos que
reaccione al ratón, así que `app.ts` escucha `mousemove`, pregunta con
`elementFromPoint` si el cursor está sobre `[data-interactive]`, y solo entonces
reactiva los clics. Hoy hay dos puntos calientes: `.hotspot` en `app.scss` para el
personaje y `.bubble-wrap` en la burbuja, que existe solo para que la (x) reciba
clics. Olvidar el segundo produce el fallo más confuso del proyecto: un botón que
funciona en `npm run dev:web` y está muerto en la ventana real.

**5. El atajo no soporta "mantener apretado".**
`globalShortcut` de Electron no emite eventos de tecla liberada. Por eso el
diseño es **pulsar una vez para empezar** y que pare solo, mediante detección de
silencio (VAD) en la fase 2. Si intentas implementar push-to-talk clásico,
terminarás metiendo un hook de teclado nativo y builds frágiles.

**6. Arrastrar por IPC y guardar solo al soltar.**
`app-region: drag` ya no existe en el proyecto. El renderer avisa de que el gesto
empieza, avanza y termina (`dragStart`, `dragMove`, `dragEnd`) y **no manda
coordenadas**: el proceso main lee `screen.getCursorScreenPoint()` y coloca la
ventana con el delta del cursor desde el origen del arrastre. Así el desfase
entre donde pulsaste y la esquina de la ventana se conserva solo, sin restarlo a
mano ni acumular redondeos.

El motivo del cambio fue la contrapartida de la región nativa: **ignora todos los
eventos de puntero**, así que obligaba a dejar un anillo muerto de 14 px alrededor
del agarre. Ese anillo era el que mantenía vivo el `mousemove` que desbloquea los
clics, y por eso pulsar justo en él no movía nada: el cursor prometía `grab` y el
gesto no respondía. Con el arrastre por IPC todo `.hotspot` arrastra y la franja
desaparece. El precio es real y hay que pagarlo: ahora el movimiento es código
nuestro y hay que reimplementar lo que el sistema operativo daba gratis.

Las tres trampas, y cómo quedan resueltas:

- **Coordenadas.** `clientX` es relativo a una ventana que se está moviendo, así
  que usarlo realimenta el movimiento y tiembla. El renderer no manda posición:
  el main lee el cursor de pantalla.
- **Escalado.** La nota anterior decía que había que aplicar el `scaleFactor` del
  monitor porque `setPosition` trabajaba en píxeles físicos. Al leer el cursor en
  el main, la conversión sobra: `getCursorScreenPoint()` devuelve DIP por
  contrato y `getBounds()`/`setPosition()` hablan la misma unidad. La trampa
  vuelve el día que alguien mande coordenadas desde el renderer.
- **`pointerup` perdido.** Cursor fuera de la ventana, `Alt+Tab` a media
  pulsación o un diálogo que roba el foco dejan el gesto sin final. Se cierra por
  cuatro caminos: captura de puntero, un `pointermove` con `buttons === 0`,
  `window:blur` y un tope de 30 s. Todos pasan por `stopDrag()`, que es
  idempotente.

La posición se guarda en `config.json` al terminar el arrastre, no desde `moved`:
como el movimiento ahora lo provoca `setPosition` en cada paso, `moved` puede
dispararse decenas de veces por segundo y escribir el disco a ese ritmo es
justo lo que se quería evitar. `endWindowDrag()` sabe exactamente cuándo se
suelta, así que guarda una sola vez.

La regla para decidir no es "IPC sí o no", sino dónde está la frontera: el
renderer dibuja y el main toca el sistema. Se cruza para lo que el renderer no
puede hacer —mover la ventana, atajos globales, posición del cursor en pantalla—,
no para centralizar lógica que ya vive bien en el renderer. Por eso el canal
lleva intención y no geometría.

La caja interactiva (`.hotspot`) mide 115×71 px y es también la superficie de
arrastre, así que lo que pinta `cursor: grab` es exactamente lo que responde. No
puede llegar hasta la frente: ahí están los ojos, y si el hotspot los cubriera la
ventana dejaría de ser click-through sobre la cara y un clic en ella dejaría de
llegar a la aplicación de detrás. Se arrastra desde la barriga y la cara queda
viva. Para verificarlo sin adivinar, `npm run dev:zones` colorea el hotspot real,
dibuja los radios de la mirada y marca el borde de la ventana con su tamaño; el
overlay no copia geometría, así que no puede mentir.

Se descartó `windowStatePersistence` de Electron 45: está marcada como
experimental y no cubre el caso que duele, que es desconectar el monitor donde
estaba Milo. Con `skipTaskbar: true`, una ventana fuera de pantalla no se puede
recuperar, así que `initialPosition()` exige que al menos `MIN_VISIBLE` (80 px)
caigan dentro de algún monitor y, si no, vuelve a la esquina inferior derecha.

**7. La mirada sigue al cursor solo dentro de la ventana.**
El renderer no recibe eventos de ratón fuera de su ventana, así que no hay forma
gratis de saber dónde está el cursor en el resto de la pantalla. `forward: true`
en `setIgnoreMouseEvents` sí reenvía cada `mousemove` que cae dentro de la
ventana de 340×340, y como la ventana está ajustada al personaje, "cerca" es
exactamente eso: mientras el cursor está encima de Milo, los ojos lo siguen.
Hacerlo en toda la pantalla exigiría que el proceso main consultara
`screen.getCursorScreenPoint()` en un temporizador y abriera un canal IPC solo
para eso: un sondeo permanente por un detalle cosmético. Descartado.

La perspectiva de la pareja (el ojo hacia el cursor se encoge y el otro crece)
va en un grupo interno, `.mascot__eye-scaler`, con un `transform` normal. No es
estética de código: la propiedad individual `scale` sobre un `<g>` de SVG **sí
cambia el layout y no llega a pintarse** en cuanto el mismo elemento anima
`transform`, como hace el parpadeo. Medido con capturas de pantalla: el
`getBoundingClientRect()` del ojo daba 30 px y en pantalla se veían 43. Un
envoltorio sin animaciones se pinta siempre.

Ese grupo escala desde el **borde interno** de cada ojo (`transform-origin: 100%`
el izquierdo, `0%` el derecho), no desde su centro. Escalando desde el centro, el
ojo que se aleja se encoge hacia dentro y el hueco entre los dos se abre un 30 %:
el ojo lejano se lee más lejos de lo que está. Con el borde interno anclado la
separación es constante y todo el cambio cae en el contorno exterior, que es lo
que hace un ojo real cuando la cara gira. La contrapartida es que la pareja ya no
respira hacia el centro: el tamaño se nota en el borde de fuera y no en el hueco.

El 6 % de `listening` viaja por el mismo camino y en un tercer envoltorio,
`.mascot__eye-state`: escalar la pareja entera desde su centro hacía lo mismo a
menor escala, y el `scaler` ya está ocupado por el `transform` inline de la
mirada. Son tres grupos por ojo y cada uno tiene un dueño distinto —el estado, la
mirada y el parpadeo—, que es lo que evita que se pisen.

El desplazamiento es **proporcional** a la distancia al cursor hasta `GAZE_REACH`
(0,25 del lado) y se satura después. La alternativa era un vector unitario, que
mantiene la mirada siempre al máximo y solo cambia de dirección: medido a 60 fps,
el ojo se quedaba 517 ms quieto en un extremo y cruzaba 30 px en 166 ms al pasar
el ratón por el centro, así que se leía como un interruptor. La contrapartida es
que el ojo deja de ir al tope en cuanto el cursor entra en la ventana; por eso
`GAZE_REACH` es la perilla: bajarla devuelve el interruptor, subirla hace que el
ojo persiga al ratón casi píxel a píxel.

La animación tampoco puede ser una transición con una curva que empieza plana.
Cada `mousemove` **reinicia** la transición desde su valor actual, así que con
`cubic-bezier(0.4, 0, 0.2, 1)` cada reinicio avanza una fracción ínfima del
recorrido. El salto que ya aparecía al medir el vector unitario tenía, además del
mapeo, esta segunda causa: con el cursor cruzando la ventana, los ojos se
quedaron 200 ms en -15 px, avanzaron 4 px y luego cruzaron 25 px en 100 ms en
cuanto el cursor se detuvo. Con `linear` cada reinicio avanza `Δt / duración` de
lo que falta, que es un filtro exponencial: continuo y con el mismo retardo a
cualquier frecuencia de ratón. La contrapartida es el retardo (≈100 ms), del
orden de la latencia de la persecución visual humana; subir la duración lo hace
más lento y bajarla lo acerca a un tic.

**8. La animación de `acting` se rehace en la fase 3, no antes.**
Hoy `acting` dura 3,2 s fijos porque el texto es de mentira, y lo que se mueve es
un `bounce` `infinite` de 620 ms más la boca abierta. Ese `infinite` es lo que
permite aparcarla: la animación no depende de la duración, así que no se rompe
cuando el estado pase a durar lo que dure la respuesta. Rehacerla ahora sería
afinarla contra una ventana de tiempo que todavía no existe, y la fase 3 la
redefine: texto de longitud variable y, si hay voz, una boca movida por amplitud
de audio en vez de por `transform` en CSS. Queda como deuda consciente, no como
olvido, y no bloquea el resto de fases.

Disparador para retomarla: que exista una duración real de `acting` y se sepa si
habrá TTS.

**9. La captura de audio vive en el renderer y el VAD corta la frase.**
`getUserMedia` corre en el renderer. Capturar en el proceso main era la otra
opción y se descartó por precio: Chromium ya trae cancelación de eco, supresión de
ruido y ganancia automática, y reimplementarlas con dependencias nativas no
compraría nada. El coste real está en otro sitio: el permiso hay que concederlo a
mano (`setPermissionRequestHandler` y `setPermissionCheckHandler` en
`window.ts`, solo `media` y solo para nuestra ventana) y el micrófono bajo
`file://` no se prueba en el dev server, se prueba en la ventana empaquetada.

Medido en la ventana real (build, `file://`, sandbox, CSP estricto):
`isSecureContext` es `true`, el permiso sale `granted`, `getUserMedia` devuelve
una pista y `AudioContext` corre a 48 kHz. El ruido de fondo de una habitación en
silencio mide ≈0,0055 RMS, así que el umbral por defecto (0,0165) queda por
encima del ruido y por debajo de la voz.

El VAD son dos piezas y no una. `core/audio/vad.ts` es una máquina de tiempos
pura: entra un nivel, sale `open` o `close`. `core/audio/capture.ts` es lo único
que toca Web Audio. Se separan porque en CI no hay micrófono y una función que
solo suma frames se prueba con números. Los tiempos: 150 ms de voz para abrir (un
clic dura un frame), 800 ms de silencio para cerrar, 15 s de tope por frase y 6 s
de espera sin oír nada.

Dos trampas de esta ronda:

- **`setInterval`, no `requestAnimationFrame`.** El VAD tiene que latir cuando la
  ventana está tapada por otra aplicación, y ahí el rAF se detiene: Milo se
  quedaría con el micrófono abierto. La ventana lleva `backgroundThrottling:
false` por el mismo motivo.
- **Nada de `AudioWorklet` por ahora.** `index.html` no declara `worker-src`, así
  que un worklet creado desde `blob:` choca con `default-src 'self' file:`. Con
  `AnalyserNode` cada 50 ms sobra para decidir cuándo hablas. El audio se recoge
  con un `ScriptProcessorNode` conectado a una ganancia a cero: está marcado como
  obsoleto, pero sigue vivo, no añade archivos y entrega bloques medidos (9
  bloques de 4096 muestras en 800 ms en la ventana empaquetada).

**10. La clave de voz la pone cada usuario, no la app.**
Una clave metida en el instalador la puede sacar cualquiera que descomprima el
binario, y entonces una persona paga las frases de todo el mundo. Milo es BYOK:
cada usuario crea su clave en la consola de su proveedor y la pega en la primera
pantalla de ajustes del proyecto. Se cifra con `safeStorage` en
`userData/secrets/` y el renderer nunca la recibe de vuelta: solo sabe si está
puesta.

El precio es una configuración obligatoria antes de la primera frase y el aviso
correspondiente en la burbuja. La alternativa era un backend propio que pagase
las llamadas: factura, cuotas y abuso incluidos. Queda descartado mientras Milo
sea un proyecto personal.

`setSttKey` valida contra la API antes de guardar (`GET /v1/auth/token`): una
clave mal pegada se descubre en ese momento y no a la tercera frase. Y si el
sistema no puede cifrar, no se guarda nada: un archivo en claro es peor que
volver a pedirla.

El proveedor no es una decisión para siempre, y esta ronda lo demostró: el
primero era Groq, y desde esta red responde **403** en la consola y en la API
(OpenAI contesta lo mismo con más palabras: `unsupported_country_region_territory`).
Ese 403 no dice "clave mal", dice "tu red no entra". Por eso hay un fallo
`blocked` separado de `auth`: confundirlos manda al usuario a revisar una clave
que está bien. Se cambió a Deepgram, que sí es alcanzable desde aquí y da 200 $
de crédito al registrarse.

Cuidado con el endpoint de validación: `/v1/models` de Deepgram es **público** y
responde 200 sin token. Se usó primero y una clave inventada se guardaba como
buena; el fallo aparecía en la primera frase. `/v1/auth/token` sí es autenticado.

## Qué está simulado (no confundir con real)

| Parece               | Realidad                                                                        |
| -------------------- | ------------------------------------------------------------------------------- |
| Milo "escucha"       | Real: `getUserMedia` + VAD + Deepgram. El audio de la frase sale a Deepgram.    |
| Milo "piensa"        | No hay LLM. `thinking` es la latencia real de la transcripción.                 |
| Milo "responde"      | Repite lo transcrito. La respuesta del cerebro llega en la fase 3.              |
| La clave de voz      | Real: cifrada con `safeStorage` en `userData/secrets/`, nunca en `config.json`. |
| Ajustes persistentes | Sí es real: `config.json` en `userData`.                                        |
| Milo se arrastra     | Sí es real: el renderer avisa y el main mueve la ventana.                       |
| Milo recuerda dónde  | Sí es real: `position` en `config.json`, validada al arrancar.                  |

## Cómo verificar que sigue vivo

```bash
npm run build        # tsc de Electron + build de Angular
npm run lint         # ESLint (Angular + Electron)
npm run test         # Vitest
npm run dev          # ventana real con HMR
npm run dev:web      # solo Chrome, para pulir el personaje
```

## Si quieres cambiar algo, toca aquí

| Quiero…                                   | Archivo                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| Cambiar el color o la forma del personaje | `features/mascot/mascot.html`                                    |
| Que reaccione distinto en un estado       | `features/mascot/mascot.scss`                                    |
| Añadir un estado nuevo                    | `src/shared/ipc.ts` (`MascotState`) + `mascot.scss`              |
| Cambiar el atajo por defecto              | `src/shared/ipc.ts` (`DEFAULT_HOTKEY`)                           |
| Añadir una operación privilegiada         | `src/shared/ipc.ts` → `preload.ts` → handler en `main.ts`        |
| Mover o redimensionar la ventana          | `electron/window.ts`                                             |
| Cambiar el área cliqueable y de arrastre  | `.hotspot` en `src/app/app.scss`                                 |
| Cuándo se descarta una posición guardada  | `MIN_VISIBLE` en `electron/window.ts`                            |
| Cambiar el estilo de la burbuja           | `features/bubble/bubble.scss`                                    |
| Cuánto dura el mensaje en pantalla        | `BUBBLE_VISIBLE_MS` en `src/app/core/interaction/interaction.ts` |
| Cuánto silencio corta la frase            | `HANGOVER_MS` en `src/app/core/audio/capture.ts`                 |
| Cuánto hay que hablar para abrirla        | `ONSET_MS` en `capture.ts`; umbral en `vad.ts`                   |
| Cambiar el permiso que se concede         | `ALLOWED_PERMISSIONS` en `electron/window.ts`                    |
| Cuánto tarda en "pensar" (simulado)       | Ya no: dura lo que tarde el proveedor de voz                     |
| Cambiar de proveedor de voz               | `electron/stt/transcriber.ts` (interfaz `Transcriber`)           |
| Cambiar modelo o idioma de transcripción  | `MODEL` y `LANGUAGE` en `electron/stt/transcriber.ts`            |
| Dónde se guarda la clave                  | `electron/secrets.ts`; nunca en `config.json`                    |
| Cuánto y hasta dónde sigue al cursor      | `features/mascot/gaze.ts`                                        |

## Reglas que no se negocian

1. **Las API keys viven solo en el proceso main**, cifradas con `safeStorage`
   (DPAPI en Windows). Nunca en el renderer, nunca en `config.json` en claro.
2. **El modelo nunca genera comandos de shell.** Elige de un catálogo cerrado de
   acciones. Un LLM gratis alucinando `rm -rf` no es un riesgo teórico.
3. **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.**
