/**
 * Controla que HISTORIAL.md no se convierta en un segundo README.
 *
 * Dos límites:
 *   1. La entrada más reciente no puede pasar de 18 líneas.
 *   2. El archivo completo no puede pasar de 350 líneas.
 *
 * Solo mide la entrada NUEVA, no las antiguas: las que ya están escritas no se
 * tocan, y así el check no obliga a reescribir historia para poder trabajar.
 */

import { readFileSync } from 'node:fs';

const FILE = 'HISTORIAL.md';
const MAX_ENTRY_LINES = 18;
const MAX_TOTAL_LINES = 350;
const ARCHIVE_DIR = 'docs/historial';

const lines = readFileSync(FILE, 'utf8').split(/\r?\n/);
const entries = lines.flatMap((line, index) => (line.startsWith('### ') ? [index] : []));

if (entries.length === 0) {
  console.error(`✖ ${FILE} no tiene ninguna entrada (### AAAA-MM-DD — Título).`);
  process.exit(1);
}

const start = entries[0];
const next = entries[1] ?? lines.length;

let end = next;
while (end > start && (lines[end - 1].trim() === '' || lines[end - 1].trim() === '---')) {
  end -= 1;
}

const entryLines = end - start;
const totalLines = lines.findLastIndex((line) => line.trim() !== '') + 1;
const problems = [];

if (entryLines > MAX_ENTRY_LINES) {
  problems.push(
    `La entrada más reciente tiene ${entryLines} líneas (máximo ${MAX_ENTRY_LINES}). ` +
      'Deja solo Qué, Por qué, Tocó, Aprendido y Commits; mueve el resto al commit.',
  );
}

if (totalLines > MAX_TOTAL_LINES) {
  problems.push(
    `${FILE} tiene ${totalLines} líneas (máximo ${MAX_TOTAL_LINES}). ` +
      `Mueve las entradas más antiguas a ${ARCHIVE_DIR}/<año>.md y enlázalas en la cabecera.`,
  );
}

if (problems.length > 0) {
  problems.forEach((problem) => console.error(`✖ ${problem}`));
  process.exit(1);
}

console.log(
  `✔ Historial: última entrada ${entryLines}/${MAX_ENTRY_LINES} líneas, total ${totalLines}/${MAX_TOTAL_LINES}.`,
);
