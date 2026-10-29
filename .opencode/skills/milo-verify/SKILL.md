---
name: milo-verify
description: 'Trigger: verificar, no funciona, ventana en blanco, depurar el renderer. Demuestra en la ventana real de Electron que Milo funciona.'
license: Apache-2.0
metadata:
  author: 'eniliosarcos'
  version: '1.0'
---

# Verificar Milo

## Activation Contract

Carga esta skill antes de afirmar que un cambio funciona, y cuando algo falle en
la ventana: pantalla en blanco, el atajo no responde, el personaje no se ve.

## Hard Rules

- No afirmes que el atajo global funciona sin pulsarlo. Los tests cubren la máquina de estados, no `globalShortcut`.
- Un build verde no prueba que la ventana se vea: `baseHref` y CSP solo fallan bajo `file://`.
- Reporta lo observado (valores, captura), no lo esperado.
- Si no pudiste comprobar algo, dilo explícitamente.

## Decision Gates

| Quiero comprobar    | Comando                     |
| ------------------- | --------------------------- |
| Lógica y estados    | `npm run test:ci`           |
| Solo Angular        | `npm run dev:web`           |
| Ventana real        | `npm run dev`               |
| Inspeccionar el DOM | `npm run dev:debug` + sonda |
| Rutas de producción | `npm run preview`           |

## Execution Steps

1. Ejecuta `npm run verify`.
2. `npm run dev:web` y abre `http://localhost:4200`: debe existir `svg.mascot` y `window.milo`.
3. `npm run dev`: ventana abajo a la derecha, transparente, sin marco.
4. Con `dev:web` activo, en otra terminal: `npm run dev:debug`.
5. Ejecuta `node .opencode/skills/milo-verify/assets/probe.mjs`. Imprime `state`, el tamaño del `svg`, si existe `window.milo` y el texto de la burbuja.
6. Pulsa `Ctrl+Shift+Space`: `state` debe pasar de `idle` a `listening` y volver solo.
7. `npm run preview`: si la ventana queda en blanco, revisa `baseHref` y CSP antes que nada.

## Output Contract

Devuelve: comando ejecutado, valor observado y qué quedó sin verificar.

## References

- `assets/probe.mjs` — sonda CDP sin dependencias.
- `docs/RECORRIDO-DEL-CODIGO.md` — flujo esperado, paso a paso.
