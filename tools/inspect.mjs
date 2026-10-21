import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBuilt } from './start-built.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HELP = `pnpm run inspect [-- --data-root <absolute external directory>]
pnpm run inspect:build

After doctor/bootstrap, rebuild current code and launch the normal provider-free
development product. --build-only builds without starting Electron or creating
product data. Agents use build-only; interactive inspection is human-controlled.
No packaging, signing, model calls or automatic bootstrap. Do not build the same
checkout concurrently. Close AI7 before rebuilding it.
`;
function requireInspection(condition) { if (!condition) throw new Error('AI7_INSPECTION_INVALID'); }

export function parseInspectionArguments(args) {
  const values = [...args];
  if (values[0] === '--') values.shift();
  if (values.length === 1 && values[0] === '--help') return { help: true };
  let buildOnly = false;
  let dataRoot;
  while (values.length) {
    const option = values.shift();
    if (option === '--build-only' && !buildOnly) buildOnly = true;
    else if (option === '--data-root' && dataRoot === undefined) {
      dataRoot = values.shift();
      requireInspection(typeof dataRoot === 'string' && isAbsolute(dataRoot));
    } else requireInspection(false);
  }
  requireInspection(!buildOnly || dataRoot === undefined);
  return { buildOnly, dataRoot };
}

export function defaultInspectionRoot(codeRoot, { platform = process.platform, env = process.env, home = homedir() } = {}) {
  const identity = createHash('sha256').update(codeRoot).digest('hex').slice(0, 16);
  requireInspection(platform === 'win32' || platform === 'darwin');
  const parent = platform === 'win32' ? env.LOCALAPPDATA : resolve(home, 'Library', 'Application Support');
  requireInspection(typeof parent === 'string' && isAbsolute(parent));
  return resolve(parent, 'AI7-inspection', identity, 'data');
}

// Resolve prospective aliases before checking every ancestor, including other worktrees.
// start-built remains the owner of canonical creation and the final launch boundary.
export async function requireExternalInspectionRoot(input) {
  requireInspection(isAbsolute(input));
  let current = resolve(input);
  const missing = [];
  for (;;) {
    try { current = resolve(await realpath(current), ...missing); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      requireInspection(dirname(current) !== current);
      missing.unshift(basename(current));
      current = dirname(current);
    }
  }
  const canonical = current;
  for (;;) {
    try { await lstat(resolve(current, '.git')); requireInspection(false); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return canonical;
}

function runNode(args) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit', windowsHide: true });
    const stop = () => child.kill();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const cleanup = () => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); };
    child.once('error', () => { cleanup(); fail(new Error('AI7_INSPECTION_CHILD_FAILED')); });
    child.once('exit', (code) => { cleanup(); code === 0 ? done() : fail(new Error('AI7_INSPECTION_CHILD_FAILED')); });
  });
}

export async function inspect(args, { run = runNode, launch = startBuilt, codeRoot = ROOT, defaultRoot = defaultInspectionRoot,
  externalRoot = requireExternalInspectionRoot, log = console.log } = {}) {
  const options = parseInspectionArguments(args);
  if (options.help) { log(HELP); return; }
  const dataRoot = options.buildOnly ? undefined : await externalRoot(options.dataRoot ?? defaultRoot(codeRoot));
  await run([resolve(codeRoot, 'tools/build-controller.mjs')]);
  if (options.buildOnly) { log('INSPECTION/build-complete (Electron not launched)'); return; }
  log(`Provider-free inspection data: ${dataRoot}`);
  // This process is the existing launcher, so Electron's launcher-pid lease also
  // covers an unexpected inspection-process exit. Only AI7_READY means ready.
  await launch(['--data-root', dataRoot, '--trusted-operational-scope', 'development-ci']);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  inspect(process.argv.slice(2)).catch(() => { console.error('AI7_INSPECTION_FAILED'); process.exitCode = 1; });
}
