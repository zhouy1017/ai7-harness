import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_ROOT = resolve(ROOT, '.runtime');
const ELECTRON_VERSION = '43.4.1';

function requireRuntime(condition, message) {
  if (!condition) throw new Error(message);
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function isStrictChild(parent, child) {
  const candidate = relative(parent, child);
  return candidate !== '' && candidate !== '..' && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate);
}

function runtimeName() {
  const platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'unsupported';
  return `electron-${ELECTRON_VERSION}-${platform}-${process.arch}`;
}

export function electronRuntimeRoot() {
  return resolve(RUNTIME_ROOT, runtimeName());
}

export function electronExecutable(runtimeRoot = electronRuntimeRoot()) {
  return process.platform === 'win32'
    ? resolve(runtimeRoot, 'electron.exe')
    : resolve(runtimeRoot, 'Electron.app', 'Contents', 'MacOS', 'Electron');
}

export function electronLicenseCarriers(artifact, runtimeRoot = electronRuntimeRoot()) {
  requireRuntime(Array.isArray(artifact.requiredNoticeFiles) && artifact.requiredNoticeFiles.length === 2, 'Electron notice declaration is invalid.');
  return artifact.requiredNoticeFiles.map((notice) => {
    requireRuntime(
      (notice.id === 'electron-license' || notice.id === 'electron-chromium-notices') &&
        typeof notice.relativePath === 'string' &&
        !isAbsolute(notice.relativePath),
      'Electron notice declaration is invalid.',
    );
    const candidate = resolve(runtimeRoot, ...notice.relativePath.split('/'));
    requireRuntime(isStrictChild(runtimeRoot, candidate), 'Electron notice carrier escaped its runtime root.');
    return { id: notice.id, path: candidate };
  });
}

async function canonicalRuntimeParent() {
  const checkoutRoot = await realpath(ROOT);
  requireRuntime(samePath(ROOT, checkoutRoot), 'Checkout root must not be redirected during Electron materialization.');
  await mkdir(RUNTIME_ROOT, { recursive: true });
  const runtimeParent = await realpath(RUNTIME_ROOT);
  requireRuntime(
    samePath(runtimeParent, resolve(checkoutRoot, '.runtime')) && isStrictChild(checkoutRoot, runtimeParent),
    'Electron runtime root escaped the canonical checkout.',
  );
  return { checkoutRoot, runtimeParent };
}

async function requireExactRuntimeChild(runtimeParent, candidate, requireExisting = true) {
  requireRuntime(dirname(candidate) === runtimeParent, 'Electron runtime target is not an exact runtime-root child.');
  if (!requireExisting) return;
  const canonical = await realpath(candidate);
  requireRuntime(
    isStrictChild(runtimeParent, canonical) && samePath(canonical, candidate),
    'Electron runtime target was redirected outside its canonical checkout-local path.',
  );
}

async function removeExactRuntimeChild(runtimeParent, candidate) {
  if (!existsSync(candidate)) return;
  await requireExactRuntimeChild(runtimeParent, candidate);
  await rm(candidate, { recursive: true, force: true });
}

async function extractionAdapter() {
  const lexical =
    process.platform === 'win32'
      ? resolve(process.env.SystemRoot ?? process.env.WINDIR ?? '', 'System32', 'tar.exe')
      : '/usr/bin/ditto';
  requireRuntime(isAbsolute(lexical) && existsSync(lexical), 'The fixed operating-system archive adapter is unavailable.');
  const canonical = await realpath(lexical);
  requireRuntime(samePath(canonical, lexical), 'The fixed operating-system archive adapter was redirected.');
  return canonical;
}

async function extractArchive(archive, stagingRoot, environment) {
  const adapter = await extractionAdapter();
  const args =
    process.platform === 'win32'
      ? ['-xf', archive, '-C', stagingRoot]
      : ['-x', '-k', archive, stagingRoot];
  const result = spawnSync(adapter, args, {
    cwd: stagingRoot,
    env: environment,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  requireRuntime(result.status === 0, 'The fixed operating-system archive adapter failed.');
  return process.platform === 'win32' ? 'windows-system-tar' : 'macos-system-ditto';
}

async function validateCarrier(runtimeRoot, artifact) {
  const executable = electronExecutable(runtimeRoot);
  const files = [executable, ...electronLicenseCarriers(artifact, runtimeRoot).map((notice) => notice.path)];
  for (const path of files) {
    const metadata = await stat(path);
    requireRuntime(metadata.isFile() && metadata.size > 0, 'Electron carrier is incomplete.');
    const canonical = await realpath(path);
    requireRuntime(isStrictChild(runtimeRoot, canonical), 'Electron carrier file escaped its staging root.');
  }
  return executable;
}

export function verifyElectronNodeMode(executable, environment) {
  const probe = [
    "const { DatabaseSync } = require('node:sqlite');",
    "const db = new DatabaseSync(':memory:');",
    "const sqlite = db.prepare('select sqlite_version() value').get().value;",
    "const fts5 = db.prepare(\"select 1 ok from pragma_compile_options where compile_options='ENABLE_FTS5'\").get()?.ok === 1;",
    'db.close();',
    "console.log(JSON.stringify({ electron: process.versions.electron, node: process.versions.node, modules: process.versions.modules, sqlite, fts5 }));",
  ].join('');
  const output = spawnSync(executable, ['-e', probe], {
    cwd: ROOT,
    env: { ...environment, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  requireRuntime(output.status === 0, 'Electron Node-mode probe failed.');
  const evidence = JSON.parse(output.stdout.trim());
  requireRuntime(evidence.electron === ELECTRON_VERSION, 'Electron carrier version drifted.');
  requireRuntime(evidence.node === '24.18.1', 'Electron embedded Node version drifted.');
  requireRuntime(evidence.modules === '148', 'Electron modules ABI drifted.');
  requireRuntime(/^3\.\d+\.\d+$/.test(evidence.sqlite), 'Electron node:sqlite version probe failed.');
  requireRuntime(evidence.fts5 === true, 'Electron node:sqlite lacks required FTS5 support.');
  return evidence;
}

export async function materializeElectronRuntime({ archive, artifact, environment }) {
  const { runtimeParent } = await canonicalRuntimeParent();
  const finalRoot = electronRuntimeRoot();
  await requireExactRuntimeChild(runtimeParent, finalRoot, false);
  const stagingRoot = await mkdtemp(resolve(runtimeParent, '.electron-staging-'));
  await requireExactRuntimeChild(runtimeParent, stagingRoot);
  let backupRoot;

  try {
    const adapter = await extractArchive(archive, stagingRoot, environment);
    const executable = await validateCarrier(stagingRoot, artifact);
    const evidence = verifyElectronNodeMode(executable, environment);
    await writeFile(
      resolve(stagingRoot, '.ai7-runtime.json'),
      `${JSON.stringify({ schemaVersion: 1, artifactId: artifact.id, sha256: artifact.sha256, adapter, evidence })}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );

    if (existsSync(finalRoot)) {
      await requireExactRuntimeChild(runtimeParent, finalRoot);
      backupRoot = resolve(runtimeParent, `.electron-backup-${process.pid}-${Date.now()}`);
      await requireExactRuntimeChild(runtimeParent, backupRoot, false);
      requireRuntime(!existsSync(backupRoot), 'Electron runtime backup target already exists.');
      await rename(finalRoot, backupRoot);
    }
    try {
      await rename(stagingRoot, finalRoot);
    } catch (error) {
      if (backupRoot && existsSync(backupRoot) && !existsSync(finalRoot)) await rename(backupRoot, finalRoot);
      throw error;
    }
    if (backupRoot) await removeExactRuntimeChild(runtimeParent, backupRoot);
    return { executable: electronExecutable(finalRoot), adapter, evidence };
  } catch (error) {
    await removeExactRuntimeChild(runtimeParent, stagingRoot);
    throw error;
  }
}
