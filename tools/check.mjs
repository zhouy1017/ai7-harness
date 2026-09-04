import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// L0 of the Local Verification Ladder (ADR 0062): the exact TypeScript check the build performs,
// with full diagnostics for the developer host. It is a developer command, never a hosted gate.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiler = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

if (!existsSync(compiler)) {
  console.error('CHECK/typescript-absent: run the frozen bootstrap first.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [compiler, '--noEmit', '--pretty', 'false'], {
  cwd: ROOT,
  env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error('CHECK/typescript-spawn-failed');
  process.exit(1);
}
process.exit(result.status ?? 1);
