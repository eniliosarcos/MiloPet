# Recorrido del código — MiloPet

Este documento se lee **en orden**, como se lee una novela corta. No es una
referencia para consultar: es el recorrido de lo que pasa desde que abres la app
hasta que presionas el atajo y Milo reacciona.

Si solo tienes 10 minutos, lee la sección 0 y la 9. Con eso entiendes el 80 %.

---

## 0. La idea que resuelve todo lo demás

MiloPet son **dos mundos** separados por una **frontera**:

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  RENDERER (Angular, Chrome) │        │  MAIN (Electron, Node)       │
│                             │        │                              │
│  Dibuja. Decide qué se ve.   │        │  Atajo global. Ventana.      │
│  NO puede tocar el sistema. │        │  Archivos. API keys.         │
└──────────────┬──────────────┘        └──────────────┬───────────────┘
               │                                      │
               └──────────► preload.ts ◄──────────────┘
                        (la frontera: lista blanca)
```

- **Renderer** = la app de Angular. Corre dentro de una ventana de Chromium. Es
  el mundo "web": HTML, CSS, TypeScript. No tiene permisos.
- **Main** = el proceso de Electron. Es Node con superpoderes: registrar atajos
  del sistema, crear ventanas, leer archivos, llamar APIs con claves.
- **Preload** = el único puente entre los dos. No es un adorno: es la aduana.

¿Por qué separar? Porque un asistente que escucha el micrófono y ejecuta
acciones es un objetivo interesante para cualquiera que logre inyectar código en
su interfaz. Si el renderer tuviera Node, un solo `innerHTML` mal puesto
significaría ejecutar comandos en tu máquina. Con la separación, lo máximo que
puede hacer un atacante es llamar a los métodos de la lista blanca.

Esa es la decisión que explica casi todo el código que viene después.

---

## 1. El lienzo: `src/index.html` y `src/styles.scss`

`index.html` es el archivo que Electron carga. Tiene tres cosas que importan:

1. `<app-root></app-root>` — el hueco vacío donde Angular monta la app.
2. La etiqueta **CSP** (`Content-Security-Policy`) — la lista de qué puede
   cargar la página. Todo es local (`'self' file:`). No hay CDNs, no hay
   scripts remotos, no hay `eval`.
3. El comentario sobre `baseHref`. El `<base href="/">` de aquí funciona en
   desarrollo, pero en producción `angular.json` lo reescribe a `"./"`.

`styles.scss` es el estilo global. Lo único no obvio: `background: transparent`.
La ventana de Electron es transparente, así que si aquí pusiéramos un color, se
vería un rectángulo sólido alrededor del personaje.

---

## 2. Arranque de Angular: `src/main.ts` y `src/app/app.config.ts`

```ts
bootstrapApplication(App, appConfig);
```

Una línea: "monta el componente `App` usando esta configuración". No hay
`AppModule` porque Angular moderno trabaja con componentes independientes
(_standalone_). Cada componente declara sus propias importaciones.

`app.config.ts` solo registra `provideBrowserGlobalErrorListeners()`: los errores
no capturados se reportan en vez de desaparecer en silencio. Cuando añadamos
router o HTTP, se registran aquí.

---

## 3. El director de orquesta: `src/app/app.ts`

Este es el archivo más importante del renderer. Hace cuatro cosas:

1. Escucha el atajo.
2. Mueve la máquina de estados.
3. Alimenta al personaje y a la burbuja.
4. Le dice al proceso main si la ventana debe aceptar clics.

### Los cinco conceptos de Angular que usa

| Concepto                         | Qué hace aquí                                             | Por qué                                                                                 |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `signal()`                       | Guarda `state`, `message` y `tone`.                       | Cambiar un signal avisa a la vista automáticamente. No hay `subscribe` ni `async pipe`. |
| `effect()`                       | Cada vez que cambia `state()`, llama a `milo.setState()`. | Sincroniza el renderer con el proceso main sin código repetido.                         |
| `inject(MILO)`                   | Obtiene el puente a Electron.                             | Inyección de dependencias: en tests se reemplaza por un falso.                          |
| `DestroyRef`                     | Cancela listeners y timers al destruir el componente.     | Sin esto quedan timers vivos apuntando a una instancia muerta.                          |
| `ChangeDetectionStrategy.OnPush` | La vista solo se revisa cuando cambian sus signals.       | Rendimiento: no recorremos el árbol en cada evento.                                     |

### La máquina de estados

```
idle ──(atajo)──► listening ──► thinking ──► acting ──► idle
                                                   └──► error (si el atajo falla)
```

`runInteractionLoop()` es el único lugar que la mueve. El flag `busy` evita que
una segunda pulsación interrumpa una interacción en curso.

**Importante:** hoy `listening` no escucha nada. Es un `setTimeout(1500)`. El
comentario `SIMULADO` en el código lo dice explícitamente para que nadie confunda
la demo con la funcionalidad.

### El truco del click-through

La ventana no debe robar clics. Pero el personaje sí debe reaccionar al ratón.

```ts
document.elementFromPoint(x, y)?.closest('[data-interactive]');
```

En cada `mousemove`, Angular pregunta: "¿qué elemento hay debajo del cursor?".
Si es el hotspot, avisa al proceso main para que acepte clics. Si no, los deja
pasar. Y solo cruza IPC cuando el valor **cambia**, porque `mousemove` dispara
decenas de eventos por segundo.

---

## 4. El escenario: `src/app/app.html` y `src/app/app.scss`

Tres capas, en orden:

1. `.stage__bubble` — arriba, la burbuja. Solo existe si `message()` tiene texto.
2. `.hotspot` — un círculo invisible sobre el personaje. Es la **única** zona
   cliqueable de toda la ventana.
3. `app-mascot` — el personaje, abajo.

El detalle que confunde al principio: `pointer-events: none` está en el
componente del personaje y `.hotspot` lo reactiva con `pointer-events: auto`. Si
alguna vez "Milo no responde al ratón", revisa esos dos valores antes que
cualquier otra cosa.

`data-state` en el `<main>` es solo informativo (los tests lo usan para
comprobar la máquina de estados). La animación real la dispara el `data-state`
del `<svg>`.

---

## 5. El personaje: `src/app/features/mascot/`

Tres archivos, una idea: **Milo es geometría, no imágenes**.

- `mascot.html` — el dibujo. Un `<svg viewBox="0 0 200 200">` con elipses y
  curvas. Todo vive en un sistema de coordenadas de 200x200, así que escalar es
  gratis y no hay píxeles borrosos.
- `mascot.ts` — recibe `state` como `input`. Nada más.
- `mascot.scss` — el comportamiento. Aquí está la personalidad.

La técnica central es CSS puro:

```scss
.mascot[data-state='thinking'] {
  .mascot__pupil {
    transform: translate(-5px, -5px);
  } // mira en diagonal
  .mascot__mouth {
    transform: scale(0.45);
  } // boca apretada
}
```

Cambiar `data-state` cambia el dibujo, sin JavaScript por medio. Cada estado
tiene su propia animación (`breathe`, `listening`, `bounce`, `blink`, `pulse`).

Dos detalles que cuestan:

- `transform-box: fill-box` + `transform-origin` son obligatorios para que un
  `scale` en una forma SVG se comporte como esperas. Sin eso, la elipse se
  escala desde el origen del SVG y "salta" a otra parte.
- La sombra en el suelo (`mascot__shadow`) no es decorativa: sin ella, el
  personaje parece flotar.

---

## 6. La boca de Milo: `src/app/features/bubble/`

El componente más pequeño del proyecto y el más fácil de entender.

- `text = input.required<string>()` — no se puede crear una burbuja vacía.
- `tone = input<BubbleTone>('neutral')` — `'neutral'` o `'error'`.
- `role="status"` + `aria-live="polite"` — un lector de pantalla anuncia el
  mensaje sin interrumpir lo que la persona esté leyendo.

Sin voz, sin TTS, sin audio. Es una decisión de producto: Milo aparece, dice algo
breve y se va. Un asistente que habla cada dos minutos termina silenciado.

---

## 7. La frontera: `src/shared/ipc.ts` y `electron/preload.ts`

### `ipc.ts` es el contrato

Define tres cosas:

1. `CHANNELS` — los nombres de los canales IPC, como constantes.
2. Los tipos (`MascotState`, `MiloConfig`, `HotkeyRegistration`).
3. `MiloBridge` — la interfaz de lo que el renderer puede hacer.

Este archivo se compila **dos veces**: dentro de Angular y dentro de Electron
(ver `tsconfig.electron.json`). Por eso no puede importar nada: sería una
dependencia compartida entre dos builds distintos.

### `preload.ts` es la aduana

Aquí está el detalle más fino del proyecto. Un preload en modo `sandbox` **no
puede importar** `src/shared/ipc.ts`; solo puede hacer `require('electron')`. Por
eso los nombres de canal están repetidos como literales:

```ts
const CH = { hotkey: 'milo:hotkey', /* ... */ } as const
  satisfies { [K in keyof typeof CHANNELS]: (typeof CHANNELS)[K] };
```

`satisfies` no cambia el tipo: **obliga a que coincida**. Si renombras un canal
en `ipc.ts` y olvidas el preload, el build falla. Sin esa cláusula, el error
aparecería en ejecución como "el atajo no hace nada", que es el peor tipo de bug.

Después, `contextBridge.exposeInMainWorld('milo', bridge)` publica el objeto como
`window.milo`. Nada más cruza: ni `require`, ni `process`, ni `ipcRenderer`.

---

## 8. El otro mundo: `electron/`

### `main.ts` — el arranque

En orden:

1. `requestSingleInstanceLock()` — si ya hay un Milo abierto, este se cierra.
   Dos instancias pelearían por el mismo atajo global.
2. `registerIpc()` — conecta cada canal con su handler.
3. `createMascotWindow()` — crea la ventana.
4. `startHotkey()` — registra el atajo guardado.

Al cerrar, `will-quit` llama a `disposeHotkeys()`. Sin eso, el atajo sigue
secuestrado después de cerrar la app y Windows lo reporta como ocupado.

### `window.ts` — la ventana imposible

Parece una lista de opciones, pero cada línea evita un problema:

| Opción                                                  | Qué evita                                        |
| ------------------------------------------------------- | ------------------------------------------------ |
| `frame: false`                                          | La barra de título de Windows.                   |
| `transparent: true`                                     | El fondo blanco alrededor del personaje.         |
| `skipTaskbar: true`                                     | Un icono en la barra de tareas por cada mascota. |
| `alwaysOnTop` + `'screen-saver'`                        | Quedar debajo de una app a pantalla completa.    |
| `show: false` + `ready-to-show`                         | El parpadeo blanco al abrir.                     |
| `setIgnoreMouseEvents(true, { forward: true })`         | Bloquear clics del trabajo real.                 |
| `contextIsolation`, `nodeIntegration: false`, `sandbox` | Que el renderer toque Node.                      |

La posición se calcula con `workArea`, no con `bounds`: `workArea` excluye la
barra de tareas, así que la ventana no queda medio escondida debajo.

### `hotkey.ts` — el atajo

`globalShortcut.register()` devuelve un booleano y nada más. No distingue entre
"combinación inválida" y "otra app la tiene". Por eso el código valida primero
que tenga un `+` y, si falla el registro, informa el caso accionable: elige otra.

### `config.ts` — los ajustes

Un JSON en `app.getPath('userData')`. Simple a propósito. Y con una advertencia
escrita en el propio archivo: **cuando lleguen las API keys, no van aquí en texto
plano**. Van con `safeStorage.encryptString()` (DPAPI en Windows).

---

## 9. El viaje completo de una pulsación

```
1. Presionas Ctrl+Shift+Space
        │
        ▼
2. electron/hotkey.ts        globalShortcut detecta la tecla (nivel sistema)
        │
        ▼
3. electron/main.ts          notifyHotkeyPress() → sendToRenderer
        │
        ▼
4. electron/preload.ts       traduce el canal a window.milo.onHotkey
        │
        ▼
5. src/app/app.ts            runInteractionLoop(): state = 'listening'
        │
        ├──► app-mascot       data-state="listening" → CSS anima
        │
        └──► effect()         milo.setState('listening') → main (solo log)
        │
        ▼
6. setTimeout(1500)          SIMULADO: aquí irá el micrófono en la fase 2
        │
        ▼
7. state = 'thinking'  →  state = 'acting'  →  mensaje en la burbuja
        │
        ▼
8. state = 'idle'            Milo vuelve a respirar
```

Ese es todo el sistema. La fase 2 reemplaza el paso 6; la fase 3, el 7. Nada más
cambia de sitio.

---

## 10. Glosario mínimo

| Término      | Traducción mental                                          |
| ------------ | ---------------------------------------------------------- |
| **Renderer** | La parte visual: Angular dentro de Chromium.               |
| **Main**     | La parte con permisos: Node dentro de Electron.            |
| **Preload**  | El portero entre ambos.                                    |
| **IPC**      | El "tubo" por donde viajan mensajes entre main y renderer. |
| **Signal**   | Una variable que avisa cuando cambia.                      |
| **Effect**   | Código que se ejecuta solo cuando cambia un signal.        |
| **OnPush**   | "No revises mi vista si no cambió nada".                   |
| **CSP**      | Lista de qué puede cargar la página.                       |
| **VAD**      | Detección de voz: saber cuándo hablas y cuándo callas.     |
| **STT**      | Voz a texto (Whisper).                                     |
| **Hotspot**  | La zona cliqueable del personaje.                          |

---

## 11. Tres ejercicios para comprobar que entendiste

No los hagas todos de golpe. Cada uno toca una capa distinta y te obliga a
recorrer la frontera.

1. **Cambiar el atajo por defecto.**
   Toca `DEFAULT_HOTKEY` en `src/shared/ipc.ts`. Borra `config.json` de
   `userData` para que se regenere. Si además renombras un canal, el build debe
   fallar por el `satisfies`.

2. **Añadir un estado nuevo.**
   Añade `'celebrating'` a `MascotState`, un bloque `.mascot[data-state='celebrating']`
   en `mascot.scss` y dispara ese estado desde `app.ts`. Fíjate en cuántos
   archivos tuviste que tocar: esa es la forma del contrato.

3. **Hacer que la burbuja dure más.**
   Cambia el `3200` de `app.ts`. Es el único sitio donde vive esa decisión; si
   tuvieras que buscar en tres archivos, algo estaría mal diseñado.

---

## 12. Qué no tocar todavía

- **No metas lógica de negocio en `app.ts`.** Es un orquestador. Cuando llegue el
  cerebro, irá en `core/` y `app.ts` solo lo llamará.
- **No añadas `nodeIntegration: true` "para probar".** Es exactamente el atajo
  que convierte este proyecto en un agujero de seguridad.
- **No guardes claves en `config.json`.** Usa `safeStorage`.
- **No dejes `console.log` en el renderer.** La ventana mide 340 px: no lo verás.
