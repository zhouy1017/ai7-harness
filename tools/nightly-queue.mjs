// Stable CLI/import entry for existing workflows and trusted control checkouts.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './ci/queue.mjs';
export * from './ci/queue.mjs';

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
