# MiloPet

A desktop companion that listens when you press a hotkey, understands what you
say, and does small things for you. Think Clippy, minus the interruptions.

Angular renders the character. Electron owns the window, the global hotkey and
every privileged action. The renderer never touches Node.

## Status

Phase 1 of 5 — the spine. What works today:

- Transparent, frameless, always-on-top window anchored to the bottom-right.
- Click-through everywhere except the mascot's hotspot.
- Global push-to-talk hotkey (`Ctrl+Shift+Space` by default) with conflict detection.
- State machine: `idle → listening → thinking → acting → idle`, driving both the
  character and the text bubble.

What is stubbed:

- No microphone yet. The `listening` state is a `setTimeout`, not audio capture.
- No brain. The bubble shows a canned message.

## Requirements

- Node **22.22.3+** (`nvm use` picks up `.nvmrc`). Angular 22 will not run on Node 20.
- Windows 10/11 for the packaging target.

## Run it

```bash
npm install
npm run dev
```

> If `npm install` finishes suspiciously fast and `node_modules/electron/dist/`
> is missing, the Electron binary download was skipped. Fix it with:
> `node node_modules/electron/install.js`

`npm run dev` starts the Angular dev server and Electron together. Edit anything
under `src/` and it hot-reloads inside the window.

If you only want to iterate on the character:

```bash
npm run dev:web
```

Open <http://localhost:4200> in Chrome. The bridge falls back to a browser
stand-in, so `Ctrl+Shift+Space` still drives the state machine.

> Changes under `electron/` require restarting `npm run dev` — the main process
> is compiled once, not watched. Use the VS Code launch config for breakpoints.

## Other scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Compiles Electron to `dist-electron/` and the Angular app to `dist/`. |
| `npm run preview` | Builds, then runs the real production window. |
| `npm run package` | Builds and produces a Windows NSIS installer in `release/`. |
| `npm run test` | Unit tests (Vitest). |
| `npm run typecheck` | Type-checks the Electron side and builds the renderer. |

## Layout

```
electron/
  main.ts      app lifecycle, IPC handlers
  window.ts    the mascot window (transparency, always-on-top, click-through)
  hotkey.ts    global shortcut registration and conflict reporting
  config.ts    settings in userData/config.json
  preload.ts   the only API the renderer can see
src/
  shared/ipc.ts        the main <-> renderer contract (types + channel names)
  app/core/milo/       MILO injection token + browser fallback
  app/features/mascot/ SVG body, states, animations
  app/features/bubble/ text output
```

`src/shared/ipc.ts` is the single source of truth. Changing a channel name there
breaks the build on both sides, which is the point.

## Phases

1. **Spine** ← you are here. Window, hotkey, state machine.
2. **Voice.** `getUserMedia` + `MediaRecorder`, VAD auto-stop, STT provider
   (Groq Whisper in dev, `whisper.cpp` for offline).
3. **Brain.** `Brain` interface, constrained JSON output, intent router,
   an alias table that learns your vocabulary.
4. **Actions.** `app.open`, `web.search`, `timer.set`, `media.*`, `note` behind
   an explicit allowlist.
5. **Context.** Active window via UI Automation, on-demand screen summaries.

## Rules that are not negotiable

- API keys live in the **main process only**, encrypted with `safeStorage`.
- The model never generates a shell command. It picks from a closed action catalog.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
