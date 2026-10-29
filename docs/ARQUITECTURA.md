# Arquitectura de MiloPet

Documento de referencia corto. Si vuelves al proyecto en dos semanas, esto es lo
que necesitas leer antes de tocar código.

> 🚶 Si lo que quieres es **entender el código paso a paso**, empieza por
> [`RECORRIDO-DEL-CODIGO.md`](RECORRIDO-DEL-CODIGO.md). Este documento asume que
> ya lo leíste.

## Idea en una frase

Angular dibuja al personaje; Electron es dueño de la ventana, del atajo global y
de todo lo que requiere permisos. **El renderer nunca toca Node.**

## Estado actual: fase 1 de 5

| Fase | Qué añade                                               | Estado    |
| ---- | ------------------------------------------------------- | --------- |
| 1    | Ventana + atajo global + máquina de estados + personaje | ✅ hecho  |
| 2    | Micrófono, VAD, transcripción (STT)                     | pendiente |
| 3    | Cerebro (LLM) + router de intención                     | pendiente |
| 4    | Acciones reales con lista blanca                        | pendiente |
| 5    | Contexto (ventana activa, resumen de pantalla)          | pendiente |

## El flujo completo hoy

```
[Ctrl+Shift+Space]
        │  (globalShortcut, nivel sistema operativo)
        ▼
electron/hotkey.ts  ──►  electron/main.ts
                              │  ipcRenderer.send('milo:hotkey')
                              ▼
                    electron/preload.ts  (contextBridge)
                              │
                              ▼
                    src/app/app.ts  (máquina de estados)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      app-mascot (SVG)                app-bubble (texto)
      estado: listening                mensaje: ...
```

Nada de eso cruza por `nodeIntegration`. El renderer solo puede llamar a los
métodos que `preload.ts` decidió publicar.

## Mapa de archivos

### Proceso main (privilegiado)

| Archivo               | Responsabilidad                                                                  |
| --------------------- | -------------------------------------------------------------------------------- |
| `electron/main.ts`    | Ciclo de vida, instancia única, registro de handlers IPC.                        |
| `electron/window.ts`  | Crea la ventana; posición guardada, transparencia, always-on-top, click-through. |
| `electron/hotkey.ts`  | Registra el atajo global; informa si otro programa ya lo tiene.                  |
| `electron/config.ts`  | Lee/escribe `config.json` en `app.getPath('userData')`.                          |
| `electron/preload.ts` | Puente. Traduce métodos del `MiloBridge` a mensajes IPC concretos.               |

### Contrato compartido

| Archivo             | Responsabilidad                                         |
| ------------------- | ------------------------------------------------------- |
| `src/shared/ipc.ts` | Nombres de canales y tipos. **Fuente única de verdad.** |

### Renderer (Angular)

| Archivo                            | Responsabilidad                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `src/app/app.ts`                   | Máquina de estados, suscripción al atajo, paso del ratón.                       |
| `src/app/core/milo/milo-bridge.ts` | Token `MILO`; si no hay Electron, devuelve un sustituto que funciona en Chrome. |
| `src/app/features/mascot/`         | El cuerpo: SVG + estados + animaciones + mirada que sigue al cursor.            |
| `src/app/features/bubble/`         | La burbuja de texto.                                                            |

## Las siete decisiones que no son obvias

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

**6. Arrastrar con la región nativa y guardar solo al soltar.**
`.hotspot__grip` usa `app-region: drag`, que resuelve el sistema operativo: no hay
handler de `mousedown` ni canal IPC nuevo. La contrapartida es que una región de
arrastre **ignora todos los eventos de puntero**, y de ahí el anillo exterior de
12 px que mantiene vivo el `mousemove` que desbloquea los clics.

La posición se guarda en `config.json` desde `moved`, que se emite una vez al
soltar (guardar en cada `move` escribiría el disco decenas de veces por segundo).
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

## Qué está simulado (no confundir con real)

| Parece               | Realidad                                                       |
| -------------------- | -------------------------------------------------------------- |
| Milo "escucha"       | `setTimeout(1500)` en `app.ts`. No hay `getUserMedia`.         |
| Milo "piensa"        | Otro `setTimeout(900)`. No hay LLM.                            |
| Milo "responde"      | Texto fijo en el código.                                       |
| Ajustes persistentes | Sí es real: `config.json` en `userData`.                       |
| Milo se arrastra     | Sí es real: lo mueve el sistema operativo, no JS.              |
| Milo recuerda dónde  | Sí es real: `position` en `config.json`, validada al arrancar. |

## Cómo verificar que sigue vivo

```bash
npm run build        # tsc de Electron + build de Angular
npm run lint         # ESLint (Angular + Electron)
npm run test         # Vitest
npm run dev          # ventana real con HMR
npm run dev:web      # solo Chrome, para pulir el personaje
```

## Si quieres cambiar algo, toca aquí

| Quiero…                                   | Archivo                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| Cambiar el color o la forma del personaje | `features/mascot/mascot.html`                             |
| Que reaccione distinto en un estado       | `features/mascot/mascot.scss`                             |
| Añadir un estado nuevo                    | `src/shared/ipc.ts` (`MascotState`) + `mascot.scss`       |
| Cambiar el atajo por defecto              | `src/shared/ipc.ts` (`DEFAULT_HOTKEY`)                    |
| Añadir una operación privilegiada         | `src/shared/ipc.ts` → `preload.ts` → handler en `main.ts` |
| Mover o redimensionar la ventana          | `electron/window.ts`                                      |
| Cambiar el tamaño del área cliqueable     | `.hotspot` en `src/app/app.scss`                          |
| Cambiar el agarre para arrastrar          | `.hotspot__grip` en `src/app/app.scss`                    |
| Cuándo se descarta una posición guardada  | `MIN_VISIBLE` en `electron/window.ts`                     |
| Cambiar el estilo de la burbuja           | `features/bubble/bubble.scss`                             |
| Cuánto dura el mensaje en pantalla        | `BUBBLE_VISIBLE_MS` en `src/app/app.ts`                   |
| Cuánto y hasta dónde sigue al cursor      | `features/mascot/gaze.ts`                                 |

## Reglas que no se negocian

1. **Las API keys viven solo en el proceso main**, cifradas con `safeStorage`
   (DPAPI en Windows). Nunca en el renderer, nunca en `config.json` en claro.
2. **El modelo nunca genera comandos de shell.** Elige de un catálogo cerrado de
   acciones. Un LLM gratis alucinando `rm -rf` no es un riesgo teórico.
3. **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.**
