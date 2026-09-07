import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { electronExecutable } from './electron-runtime.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const READINESS = Buffer.from('AI7_READY\n', 'ascii');
const MAX_READINESS_PREFIX_BYTES = 4;
const READINESS_TIMEOUT_MS = 30_000;
const STARTUP_LOCATION_PATTERN = /AI7_STARTUP_FAILED\/(network-denial|application-import|runtime|arguments|data-root|shell-root|single-instance|electron-ready|service-ready|renderer-first-paint|readiness-signal)/;
// The launch form (ADR 0065, Issue #272): `--data-root` is required; the trusted operational scope
// defaults to `development-ci`, and the ceiling and cache root are accepted only with `developer-live`.
// The form travels as argv through Electron main to the service; no environment variable carries it.
const LAUNCH_ARGUMENTS = new Set(['--data-root', '--trusted-operational-scope', '--run-budget-ceiling', '--provider-cache-root']);
const RUN_BUDGET_CEILING_PATTERN = /^[1-9][0-9]{0,11}$/u;
let childFailureLocation;

function requireLaunch(condition) {
  if (!condition) throw new Error('AI7_BUILT_LAUNCH_INVALID');
}

/** Parse the exact launch form; every invalid shape fails closed before Electron exists. */
export function parseBuiltLaunchArguments(args) {
  requireLaunch(Array.isArray(args) && args.length % 2 === 0);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    requireLaunch(typeof key === 'string' && typeof value === 'string' && value.length > 0 && LAUNCH_ARGUMENTS.has(key) && !values.has(key));
    values.set(key, value);
  }
  const dataRoot = values.get('--data-root');
  requireLaunch(dataRoot !== undefined && isAbsolute(dataRoot));
  const scope = values.get('--trusted-operational-scope') ?? 'development-ci';
  requireLaunch(scope === 'development-ci' || scope === 'developer-live');
  const ceiling = values.get('--run-budget-ceiling');
  const cacheRoot = values.get('--provider-cache-root');
  requireLaunch(scope === 'developer-live' || (ceiling === undefined && cacheRoot === undefined));
  requireLaunch(ceiling === undefined || RUN_BUDGET_CEILING_PATTERN.test(ceiling));
  requireLaunch(cacheRoot === undefined || isAbsolute(cacheRoot));
  const forwarded = [];
  if (values.has('--trusted-operational-scope')) forwarded.push('--trusted-operational-scope', scope);
  if (ceiling !== undefined) forwarded.push('--run-budget-ceiling', ceiling);
  if (cacheRoot !== undefined) forwarded.push('--provider-cache-root', cacheRoot);
  return { dataRoot, trustedOperationalScope: scope, runBudgetCeiling: ceiling ?? null, providerCacheRoot: cacheRoot ?? null, forwarded };
}

function launchEnvironment(executable) {
  const selected = {};
  const names =
    process.platform === 'win32'
      ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
      : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) selected[name] = value;
  }
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    requireLaunch(systemRoot !== undefined && isAbsolute(systemRoot));
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else {
    selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  }
  return selected;
}

async function main() {
  requireLaunch(process.versions.node === '24.18.1');
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const launch = parseBuiltLaunchArguments(args);
  const executable = electronExecutable();
  const entry = resolve(ROOT, 'dist', 'main', 'index.cjs');
  const dataRootEntry = resolve(ROOT, 'dist', 'shared', 'data-root.mjs');
  requireLaunch(existsSync(executable) && existsSync(entry) && existsSync(dataRootEntry));
  const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(
    pathToFileURL(dataRootEntry).href
  );
  const dataRoot = await createCanonicalExternalDataRoot(launch.dataRoot, ROOT);
  const shellRoot = await ensureCanonicalDataDirectory(dataRoot, 'shell');
  const child = spawn(executable, [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-domain-reliability',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    `--user-data-dir=${shellRoot}`,
    entry,
    '--data-root',
    dataRoot,
    '--launcher-pid',
    String(process.pid),
    ...launch.forwarded,
  ], {
    cwd: ROOT,
    env: launchEnvironment(executable),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });
  let stderrTail = '';
  child.stderr.on('data', (chunk) => {
    stderrTail = `${stderrTail}${chunk.toString('utf8')}`.slice(-512);
    const match = STARTUP_LOCATION_PATTERN.exec(stderrTail);
    if (match) childFailureLocation = match[1];
  });
  const forward = () => child.kill();
  process.once('SIGINT', forward);
  process.once('SIGTERM', forward);
  let readinessBuffer = Buffer.alloc(0);
  let ready = false;
  let settleReadiness;
  const readiness = new Promise((resolveReady, rejectReady) => {
    settleReadiness = { resolveReady, rejectReady };
  });
  child.stdout.on('data', (chunk) => {
    if (ready) {
      if (!chunk.every((byte) => byte === 10 || byte === 13)) child.kill();
      return;
    }
    readinessBuffer = Buffer.concat([readinessBuffer, chunk]);
    const prefixLength = readinessBuffer.findIndex((byte) => byte !== 10 && byte !== 13);
    const readinessStart = prefixLength === -1 ? readinessBuffer.length : prefixLength;
    const candidate = readinessBuffer.subarray(readinessStart);
    if (
      readinessStart > MAX_READINESS_PREFIX_BYTES ||
      candidate.length > READINESS.length ||
      !READINESS.subarray(0, candidate.length).equals(candidate)
    ) {
      settleReadiness.rejectReady(new Error('AI7_BUILT_READINESS_INVALID'));
      child.kill();
      return;
    }
    if (candidate.length === READINESS.length) {
      ready = true;
      settleReadiness.resolveReady();
    }
  });
  child.once('error', (error) => settleReadiness.rejectReady(error));
  child.once('exit', () => {
    if (!ready) settleReadiness.rejectReady(new Error('AI7_BUILT_EXITED_BEFORE_READY'));
  });
  const timeout = setTimeout(() => {
    settleReadiness.rejectReady(new Error('AI7_BUILT_READINESS_TIMEOUT'));
    child.kill();
  }, READINESS_TIMEOUT_MS);
  timeout.unref();
  try {
    await readiness;
  } finally {
    clearTimeout(timeout);
  }
  process.stdout.write('AI7_READY\n');
  const exitCode = await new Promise((resolveExit, reject) => {
    if (child.exitCode !== null) return resolveExit(child.exitCode);
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch(() => {
    console.error(`AI7_START_FAILED/${childFailureLocation ?? 'launcher'}`);
    process.exitCode = 1;
  });
}
