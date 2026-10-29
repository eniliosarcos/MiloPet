# Historial de cambios — MiloPet

Registro de todo lo que se construyó, en orden inverso (lo más nuevo arriba).
Cada entrada responde: qué se hizo, por qué, y en qué archivos.

---

## Historial

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
