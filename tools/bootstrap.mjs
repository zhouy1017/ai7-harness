import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectDevelopmentInputs } from './doctor.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_ROOT = resolve(ROOT, '.cache', 'bootstrap');
const ELECTRON_CACHE = resolve(CACHE_ROOT, 'electron');
const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

function requireValue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runNode(script, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `${script} exited ${result.status}.`);
  }
  return result.stdout.trim();
}

function runPnpm(args) {
  const npmExecPath = process.env.npm_execpath;
  requireValue(npmExecPath && existsSync(npmExecPath), 'pnpm did not expose its exact lifecycle launcher.');
  return runNode(npmExecPath, args);
}

async function digestFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function electronCachePath(artifact) {
  const parsed = new URL(artifact.url);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = posix.dirname(parsed.pathname);
  const directory = createHash('sha256').update(parsed.toString()).digest('hex');
  const candidate = resolve(ELECTRON_CACHE, directory, artifact.fileName);
  requireValue(candidate.startsWith(`${ELECTRON_CACHE}${sep}`), 'Electron cache path escaped its task-local root.');
  return candidate;
}

async function downloadPinnedArtifact(artifact, target) {
  let current = new URL(artifact.url);
  const redirectHosts = new Set(['github.com', 'release-assets.githubusercontent.com']);
  let response;

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    requireValue(current.protocol === 'https:' && redirectHosts.has(current.hostname), 'Unexpected artifact redirect.');
    response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': 'AI7-bootstrap/0.1' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      requireValue(location, 'Artifact redirect omitted Location.');
      current = new URL(location, current);
      continue;
    }
    break;
  }

  requireValue(response?.status === 200 && response.body, `Artifact download failed with HTTP ${response?.status}.`);
  requireValue(
    current.protocol === 'https:' && redirectHosts.has(current.hostname),
    'Artifact download left the official GitHub release carrier.',
  );

  await mkdir(dirname(target), { recursive: true });
  const partial = `${target}.${process.pid}.partial`;
  await rm(partial, { force: true });
  const handle = await open(partial, 'wx');
  const hash = createHash('sha256');
  let size = 0;

  try {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      requireValue(size <= MAX_ARTIFACT_BYTES, 'Electron artifact exceeded the bounded download size.');
      hash.update(value);
      await handle.write(value);
    }
  } finally {
    await handle.close();
  }

  requireValue(hash.digest('hex') === artifact.sha256, 'Electron secondary artifact SHA-256 mismatch.');
  await rename(partial, target);
}

async function ensureElectronArchive(artifact) {
  const target = electronCachePath(artifact);
  if (existsSync(target) && (await digestFile(target)) === artifact.sha256) {
    return target;
  }
  await rm(target, { force: true });
  await downloadPinnedArtifact(artifact, target);
  return target;
}

function verifyElectronNodeMode() {
  const binary =
    process.platform === 'win32'
      ? resolve(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
      : resolve(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
  requireValue(existsSync(binary), 'Electron runtime was not extracted.');
  const probe = [
    "const { DatabaseSync } = require('node:sqlite');",
    "const db = new DatabaseSync(':memory:');",
    "const sqlite = db.prepare('select sqlite_version() value').get().value;",
    "const fts5 = db.prepare(\"select 1 ok from pragma_compile_options where compile_options='ENABLE_FTS5'\").get()?.ok === 1;",
    'db.close();',
    "console.log(JSON.stringify({ node: process.versions.node, modules: process.versions.modules, sqlite, fts5 }));",
  ].join('');
  const output = spawnSync(binary, ['-e', probe], {
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  requireValue(output.status === 0, output.stderr.trim() || 'Electron Node-mode probe failed.');
  const evidence = JSON.parse(output.stdout.trim());
  requireValue(evidence.node === '24.18.1', 'Electron embedded Node version drifted.');
  requireValue(evidence.modules === '148', 'Electron modules ABI drifted.');
  requireValue(evidence.fts5 === true, 'Electron node:sqlite lacks required FTS5 support.');
  return evidence;
}

async function main() {
  const diagnosis = inspectDevelopmentInputs();
  const artifact = diagnosis.inputs.secondaryArtifact;
  const pnpmVersion = runPnpm(['--version']);
  requireValue(pnpmVersion === '11.24.0', 'The pnpm lifecycle launcher drifted.');

  runPnpm([
    'install',
    '--frozen-lockfile',
    '--store-dir',
    resolve(ROOT, '.pnpm-store'),
    '--cache-dir',
    resolve(CACHE_ROOT, 'pnpm'),
  ]);
  const archive = await ensureElectronArchive(artifact);
  requireValue((await digestFile(archive)) === artifact.sha256, 'Cached Electron artifact digest drifted.');
  runNode(resolve(ROOT, 'node_modules', 'electron', 'install.js'), [], {
    electron_config_cache: ELECTRON_CACHE,
  });
  const electronNodeMode = verifyElectronNodeMode();

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        host: diagnosis.host,
        runtime: diagnosis.runtime,
        lockfileSha256: diagnosis.inputs.lockfileSha256,
        secondaryArtifact: { id: artifact.id, sha256: artifact.sha256, verified: true },
        electronNodeMode,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
