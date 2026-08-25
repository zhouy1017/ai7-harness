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
let childFailureLocation;

function requireLaunch(condition) {
  if (!condition) throw new Error('AI7_BUILT_LAUNCH_INVALID');
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
  requireLaunch(args.length === 2 && args[0] === '--data-root' && isAbsolute(args[1]));
  const executable = electronExecutable();
  const entry = resolve(ROOT, 'dist', 'main', 'index.cjs');
  const dataRootEntry = resolve(ROOT, 'dist', 'shared', 'data-root.mjs');
  requireLaunch(existsSync(executable) && existsSync(entry) && existsSync(dataRootEntry));
  const { createCanonicalExternalDataRoot, ensureCanonicalDataDirectory } = await import(
    pathToFileURL(dataRootEntry).href
  );
  const dataRoot = await createCanonicalExternalDataRoot(args[1], ROOT);
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

main().catch(() => {
  console.error(`AI7_START_FAILED/${childFailureLocation ?? 'launcher'}`);
  process.exitCode = 1;
});
