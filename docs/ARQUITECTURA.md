# Arquitectura de MiloPet

Documento de referencia corto. Si vuelves al proyecto en dos semanas, esto es lo
que necesitas leer antes de tocar código.

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

| Archivo               | Responsabilidad                                                         |
| --------------------- | ----------------------------------------------------------------------- |
| `electron/main.ts`    | Ciclo de vida, instancia única, registro de handlers IPC.               |
| `electron/window.ts`  | Crea la ventana; posición, transparencia, always-on-top, click-through. |
| `electron/hotkey.ts`  | Registra el atajo global; informa si otro programa ya lo tiene.         |
| `electron/config.ts`  | Lee/escribe `config.json` en `app.getPath('userData')`.                 |
| `electron/preload.ts` | Puente. Traduce métodos del `MiloBridge` a mensajes IPC concretos.      |

### Contrato compartido

| Archivo             | Responsabilidad                                         |
| ------------------- | ------------------------------------------------------- |
| `src/shared/ipc.ts` | Nombres de canales y tipos. **Fuente única de verdad.** |

### Renderer (Angular)

| Archivo                            | Responsabilidad                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `src/app/app.ts`                   | Máquina de estados, suscripción al atajo, paso del ratón.                       |
| `src/app/core/milo/milo-bridge.ts` | Token `MILO`; si no hay Electron, devuelve un sustituto que funciona en Chrome. |
| `src/app/features/mascot/`         | El cuerpo: SVG + estados + animaciones.                                         |
| `src/app/features/bubble/`         | La burbuja de texto.                                                            |

## Las cinco decisiones que no son obvias

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
reactiva los clics. El "punto caliente" es `.hotspot` en `app.scss`.

**5. El atajo no soporta "mantener apretado".**
`globalShortcut` de Electron no emite eventos de tecla liberada. Por eso el
diseño es **pulsar una vez para empezar** y que pare solo, mediante detección de
silencio (VAD) en la fase 2. Si intentas implementar push-to-talk clásico,
terminarás metiendo un hook de teclado nativo y builds frágiles.

## Qué está simulado (no confundir con real)

| Parece               | Realidad                                               |
| -------------------- | ------------------------------------------------------ |
| Milo "escucha"       | `setTimeout(1500)` en `app.ts`. No hay `getUserMedia`. |
| Milo "piensa"        | Otro `setTimeout(900)`. No hay LLM.                    |
| Milo "responde"      | Texto fijo en el código.                               |
| Ajustes persistentes | Sí es real: `config.json` en `userData`.               |

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
| Cambiar el estilo de la burbuja           | `features/bubble/bubble.scss`                             |

## Reglas que no se negocian

1. **Las API keys viven solo en el proceso main**, cifradas con `safeStorage`
   (DPAPI en Windows). Nunca en el renderer, nunca en `config.json` en claro.
2. **El modelo nunca genera comandos de shell.** Elige de un catálogo cerrado de
   acciones. Un LLM gratis alucinando `rm -rf` no es un riesgo teórico.
3. **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.**
