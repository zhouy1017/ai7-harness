import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function requireLaunch(condition) {
  if (!condition) throw new Error('AI7_BUILT_LAUNCH_INVALID');
}

function launchEnvironment() {
  const selected = {};
  const names =
    process.platform === 'win32'
      ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'ComSpec']
      : ['PATH', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) selected[name] = value;
  }
  return selected;
}

async function main() {
  requireLaunch(process.versions.node === '24.18.1');
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  requireLaunch(args.length === 2 && args[0] === '--data-root' && isAbsolute(args[1]));
  const executable =
    process.platform === 'win32'
      ? resolve(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
      : resolve(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
  const entry = resolve(ROOT, 'dist', 'main', 'index.cjs');
  requireLaunch(existsSync(executable) && existsSync(entry));
  const child = spawn(executable, [entry, '--data-root', args[1]], {
    cwd: ROOT,
    env: launchEnvironment(),
    stdio: 'ignore',
    windowsHide: false,
  });
  const forward = () => child.kill();
  process.once('SIGINT', forward);
  process.once('SIGTERM', forward);
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
}

main().catch(() => {
  process.exitCode = 1;
});
