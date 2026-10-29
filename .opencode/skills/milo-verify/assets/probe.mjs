/**
 * Sonda CDP para la ventana real de Milo.
 *
 * Uso:
 *   1. npm run dev:web      (terminal 1)
 *   2. npm run dev:debug    (terminal 2, abre el puerto 9222)
 *   3. node .opencode/skills/milo-verify/assets/probe.mjs
 *
 * No necesita dependencias: usa fetch y WebSocket nativos de Node 22.
 * Devuelve código 1 si falta el SVG o el puente, para que sirva en un script.
 */

const port = process.argv[2] ?? '9222';

async function connect() {
  const response = await fetch(`http://127.0.0.1:${port}/json`);

  if (!response.ok) {
    throw new Error(`El puerto ${port} no responde. ¿Arrancaste con npm run dev:debug?`);
  }

  const targets = await response.json();
  const page = targets.find((target) => target.type === 'page');

  if (!page) throw new Error('No hay ninguna página inspeccionable.');

  const socket = new WebSocket(page.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener(
      'error',
      () => reject(new Error('No se pudo abrir el WebSocket de depuración.')),
      { once: true },
    );
  });

  return socket;
}

function evaluate(socket, expression) {
  const id = 1;

  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;

      socket.removeEventListener('message', onMessage);

      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result.result.value);
    };

    socket.addEventListener('message', onMessage);
    socket.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    );
  });
}

const expression = `(() => {
  const svg = document.querySelector('svg.mascot');
  const stage = document.querySelector('.stage');
  const rect = svg?.getBoundingClientRect();

  return {
    state: stage?.getAttribute('data-state') ?? null,
    svg: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
    bridge: typeof window.milo === 'object' && window.milo !== null,
    bubble: document.querySelector('.bubble')?.textContent?.trim() || null,
  };
})()`;

const socket = await connect();
const result = await evaluate(socket, expression);
socket.close();

console.log(JSON.stringify(result, null, 2));

if (result.svg && result.bridge) {
  console.log('✔ Render y puente presentes.');
} else {
  console.error('✖ Falta el SVG o window.milo: revisa la ventana.');
  process.exitCode = 1;
}
