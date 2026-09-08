import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// L0 of the Local Verification Ladder (ADR 0062): the exact TypeScript check the build performs,
// with full diagnostics for the developer host, then a syntax parse of every tracked runner and
// tool so a parse error fails here rather than riding green to Electron (#346, the #332 finding).
// It is a developer command, never a hosted gate.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiler = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const ENV = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR };

if (!existsSync(compiler)) {
  console.error('CHECK/typescript-absent: run the frozen bootstrap first.');
  process.exit(1);
}

const typeCheck = spawnSync(process.execPath, [compiler, '--noEmit', '--pretty', 'false'], {
  cwd: ROOT,
  env: ENV,
  stdio: 'inherit',
  windowsHide: true,
});

if (typeCheck.error) {
  console.error('CHECK/typescript-spawn-failed');
  process.exit(1);
}
if (typeCheck.status !== 0) {
  process.exit(typeCheck.status ?? 1);
}

const enumerated = spawnSync('git', ['ls-files', '-z', '--', 'e2e/*.mjs', 'tools/*.mjs'], {
  cwd: ROOT,
  env: ENV,
  windowsHide: true,
});

if (enumerated.error || enumerated.status !== 0) {
  console.error('CHECK/runner-enumeration-failed');
  process.exit(1);
}

const separator = String.fromCharCode(0);
const runners = enumerated.stdout.toString('utf8').split(separator).filter(Boolean);

for (const runner of runners) {
  const parsed = spawnSync(process.execPath, ['--check', runner], {
    cwd: ROOT,
    env: ENV,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (parsed.error || parsed.status !== 0) {
    console.error(`CHECK/runner-parse-failed: ${runner}`);
    process.exit(1);
  }
}

process.exit(0);
