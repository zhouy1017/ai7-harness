import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, rmdir } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { electronExecutable } from './electron-runtime.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const READINESS = Buffer.from('AI7_READY\n', 'ascii');
const MAX_READINESS_PREFIX_BYTES = 4;
const READINESS_TIMEOUT_MS = 30_000;
const STARTUP_LOCATION_PATTERN = /AI7_STARTUP_FAILED\/(network-denial|application-import|runtime|arguments|data-root|shell-root|single-instance|electron-ready|service-ready|renderer-first-paint|readiness-signal)/;
// The launch form (ADR 0065, Issue #272): `--data-root` is required except for the explicitly flagged production chooser (#961); the trusted operational scope
// defaults to `development-ci`, and the ceiling and cache root are accepted only with `developer-live`, which must name its
// development validation (`--validation-case <family>/<case>`, optionally `--validation-delta <kind>:<rationale>`; Issue #808).
// `ordinary-production` (Issue #811) takes none of those four: its data root is also kept apart from the developer caches.
// Main and the service parse those two exactly; this launcher checks their shape and the scope they need.
// The form travels as argv through Electron main to the service; no environment variable carries it.
const LAUNCH_ARGUMENTS = new Set(['--data-root', '--trusted-operational-scope', '--run-budget-ceiling', '--provider-cache-root', '--validation-case', '--validation-delta', '--allow-first-run-chooser']);
const RUN_BUDGET_CEILING_PATTERN = /^[1-9][0-9]{0,11}$/u;
const VALIDATION_CASE_SHAPE = /^[a-z][a-z0-9-]{0,47}\/[a-z][a-z0-9-]{0,47}$/u;
const VALIDATION_DELTA_SHAPE = /^(?:input|retry-unknown):[a-z][a-z0-9-]{0,47}$/u;
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
  const scope = values.get('--trusted-operational-scope') ?? 'development-ci';
  requireLaunch(scope === 'development-ci' || scope === 'developer-live' || scope === 'ordinary-production');
  const chooser = values.get('--allow-first-run-chooser');
  requireLaunch(chooser === undefined || (chooser === 'true' && scope === 'ordinary-production' && dataRoot === undefined));
  requireLaunch((dataRoot !== undefined && isAbsolute(dataRoot)) || chooser === 'true');
  const ceiling = values.get('--run-budget-ceiling');
  const cacheRoot = values.get('--provider-cache-root');
  const validationCase = values.get('--validation-case');
  const validationDelta = values.get('--validation-delta');
  requireLaunch(scope === 'developer-live' || (ceiling === undefined && cacheRoot === undefined && validationCase === undefined && validationDelta === undefined));
  requireLaunch(scope !== 'developer-live' || validationCase !== undefined);
  requireLaunch(ceiling === undefined || RUN_BUDGET_CEILING_PATTERN.test(ceiling));
  requireLaunch(cacheRoot === undefined || isAbsolute(cacheRoot));
  requireLaunch(validationCase === undefined || VALIDATION_CASE_SHAPE.test(validationCase));
  requireLaunch(validationDelta === undefined || VALIDATION_DELTA_SHAPE.test(validationDelta));
  const forwarded = [];
  if (values.has('--trusted-operational-scope')) forwarded.push('--trusted-operational-scope', scope);
  if (ceiling !== undefined) forwarded.push('--run-budget-ceiling', ceiling);
  if (cacheRoot !== undefined) forwarded.push('--provider-cache-root', cacheRoot);
  if (validationCase !== undefined) forwarded.push('--validation-case', validationCase);
  if (validationDelta !== undefined) forwarded.push('--validation-delta', validationDelta);
  if (chooser === 'true') forwarded.push('--allow-first-run-chooser', 'true');
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

/** Main emits no output during the chooser. These two private exit codes never count as product readiness. */
export function firstRunChooserExit(code, stdoutBytes) {
  requireLaunch(stdoutBytes === 0);
  if (code === 70) return 'relaunch';
  if (code === 71) return 'cancelled';
  throw new Error('AI7_BUILT_CHOOSER_FAILED');
}

async function runFirstRunChooser(executable, entry, forwarded, dataRoots) {
  const defaultRoot = dataRoots.defaultProductionDataRoot();
  const parent = dirname(defaultRoot);
  const createdParent = await mkdir(parent, { recursive: true });
  const bootstrap = await mkdtemp(resolve(parent, '.startup-shell-'));
  const canonical = await realpath(bootstrap);
  requireLaunch(dirname(canonical) === await realpath(parent));
  let child;
  const forward = () => child?.kill();
  try {
    child = spawn(executable, [
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability',
      '--disable-sync', '--metrics-recording-only', '--no-first-run', `--user-data-dir=${canonical}`, entry,
      '--launcher-pid', String(process.pid), ...forwarded,
    ], { cwd: ROOT, env: launchEnvironment(executable), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
    process.once('SIGINT', forward);
    process.once('SIGTERM', forward);
    let stdoutBytes = 0;
    child.stdout.on('data', (chunk) => { stdoutBytes += chunk.length; child.kill(); });
    child.stderr.on('data', (chunk) => {
      const match = STARTUP_LOCATION_PATTERN.exec(chunk.toString('utf8'));
      if (match) childFailureLocation = match[1];
    });
    // A person choosing a folder is not a stalled product startup: no product-ready deadline on this one branch.
    const code = await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', resolveExit);
    });
    return firstRunChooserExit(code, stdoutBytes);
  } finally {
    process.removeListener('SIGINT', forward);
    process.removeListener('SIGTERM', forward);
    // Delete only the exact temporary sibling we created, after its Electron child has exited.
    requireLaunch(await realpath(bootstrap) === canonical && dirname(canonical) === await realpath(parent));
    await rm(canonical, { recursive: true, force: true });
    if (createdParent !== undefined) await rmdir(parent).catch(() => undefined); // only if still empty after cancellation
  }
}

async function main(argumentsOverride) {
  requireLaunch(process.versions.node === '24.18.1');
  const args = argumentsOverride ?? process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const launch = parseBuiltLaunchArguments(args);
  const executable = electronExecutable();
  const entry = resolve(ROOT, 'dist', 'main', 'index.cjs');
  const dataRootEntry = resolve(ROOT, 'dist', 'shared', 'data-root.mjs');
  requireLaunch(existsSync(executable) && existsSync(entry) && existsSync(dataRootEntry));
  const dataRoots = await import(
    pathToFileURL(dataRootEntry).href
  );
  const { createCanonicalExternalDataRoot, createCanonicalProductionDataRoot, ensureCanonicalDataDirectory } = dataRoots;
  if (launch.dataRoot === undefined) {
    const outcome = await runFirstRunChooser(executable, entry, launch.forwarded, dataRoots);
    if (outcome === 'cancelled') { process.exitCode = 0; return; }
    const selected = await dataRoots.readStartupDataChoice(dataRoots.defaultProductionDataRoot());
    requireLaunch(selected !== null);
    const canonical = await createCanonicalProductionDataRoot(selected, ROOT);
    return main(['--data-root', canonical, '--trusted-operational-scope', 'ordinary-production']);
  }
  const dataRoot = launch.trustedOperationalScope === 'ordinary-production'
    ? await createCanonicalProductionDataRoot(launch.dataRoot, ROOT)
    : await createCanonicalExternalDataRoot(launch.dataRoot, ROOT);
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

// Composition callers retain this launcher's process identity, readiness and
// bounded diagnostics rather than adding an unmonitored parent process.
export async function startBuilt(args) {
  try {
    await main(args);
  } catch {
    console.error(`AI7_START_FAILED/${childFailureLocation ?? 'launcher'}`);
    throw new Error('AI7_BUILT_LAUNCH_FAILED');
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  startBuilt().catch(() => { process.exitCode = 1; });
}
