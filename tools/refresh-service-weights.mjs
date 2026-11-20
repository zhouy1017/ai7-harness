// Refreshes tests/support/service-file-weights.json from the per-file lines of a service-layer run's own report
// (`tests/service/<file>.test.ts (<n> tests) <ms>ms`, as the guest runner's log keeps them). Usage:
//   pnpm run test:service:weights -- <log> [<log>...]
// A file in a report takes its reported seconds (rounded, at least 1); a file the reports do not mention keeps its old
// weight while it still exists; a file that is gone is dropped. The default is the median of the listed files. The output
// A file whose tests are all skipped prints no line: give it a weight of 1 by hand; a refresh keeps it. The output
// has sorted keys and whole seconds, so a refresh is a small diff.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const weightsPath = fileURLToPath(new URL('../tests/support/service-file-weights.json', import.meta.url));
const logs = process.argv.slice(2).filter((argument) => argument !== '--');
if (logs.length === 0) { console.error('usage: pnpm run test:service:weights -- <service run log>...'); process.exit(2); }

const ansi = /\x1b\[[0-9;]*m/g;
const fileLine = /[✓×❯↓]\s+(tests\/service\/\S+\.test\.ts)\s+\(\d+ tests?[^)]*\)\s+(\d+)ms/;
const reported = new Map();
for (const log of logs) {
  for (const raw of readFileSync(log, 'utf8').split(/\r?\n/)) {
    const match = raw.replace(ansi, '').match(fileLine);
    if (match) reported.set(match[1], Number(match[2]));
  }
}
if (reported.size === 0) { console.error('no per-file lines found in the given logs'); process.exit(1); }

const present = new Set(readdirSync(`${root}tests/service`).filter((name) => name.endsWith('.test.ts')).map((name) => `tests/service/${name}`));
const previous = existsSync(weightsPath) ? JSON.parse(readFileSync(weightsPath, 'utf8')).files : {};
const files = {};
for (const path of [...present].sort()) {
  const seconds = reported.has(path) ? Math.max(1, Math.round(reported.get(path) / 1000)) : previous[path];
  if (seconds !== undefined) files[path] = seconds;
}
const sorted = Object.values(files).sort((a, b) => a - b);
const defaultSeconds = sorted[Math.floor(sorted.length / 2)];
writeFileSync(weightsPath, `${JSON.stringify({ defaultSeconds, files }, null, 2)}\n`);
const unlisted = [...present].filter((path) => files[path] === undefined);
console.log(`${Object.keys(files).length} files weighted, default ${defaultSeconds} s; ${reported.size} reported${unlisted.length ? `; not weighted (default applies): ${unlisted.join(', ')}` : ''}`);
