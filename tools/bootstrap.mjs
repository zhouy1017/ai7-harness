import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectDevelopmentInputs } from './doctor.mjs';
import { materializeElectronRuntime } from './electron-runtime.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_ROOT = resolve(ROOT, '.cache', 'bootstrap');
const ELECTRON_CACHE = resolve(CACHE_ROOT, 'electron');
const STORE_ROOT = resolve(ROOT, '.pnpm-store');
let configRoot;
let xdgConfigRoot;
let pnpmConfigRoot;
let emptyUserConfig;
let emptyGlobalConfig;
let emptyAuthConfig;
const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

function requireValue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

async function requireCanonicalDirectory(checkoutRoot, directory) {
  await mkdir(directory, { recursive: true });
  const canonical = await realpath(directory);
  requireValue(
    samePath(canonical, directory) && isStrictChild(checkoutRoot, canonical),
    'Generated dependency root escaped the canonical checkout.',
  );
  return canonical;
}

async function prepareGeneratedRoots() {
  const checkoutRoot = await realpath(ROOT);
  requireValue(samePath(checkoutRoot, ROOT), 'Checkout root must not be redirected during bootstrap.');
  const cacheParent = await requireCanonicalDirectory(checkoutRoot, resolve(ROOT, '.cache'));
  requireValue(samePath(cacheParent, resolve(checkoutRoot, '.cache')), 'Bootstrap cache root was redirected.');
  await requireCanonicalDirectory(checkoutRoot, CACHE_ROOT);
  await requireCanonicalDirectory(checkoutRoot, ELECTRON_CACHE);
  await requireCanonicalDirectory(checkoutRoot, STORE_ROOT);

  const nodeModules = resolve(ROOT, 'node_modules');
  if (existsSync(nodeModules)) {
    const canonicalNodeModules = await realpath(nodeModules);
    requireValue(
      samePath(canonicalNodeModules, resolve(checkoutRoot, 'node_modules')) &&
        isStrictChild(checkoutRoot, canonicalNodeModules),
      'Checkout node_modules was redirected outside its exact generated path.',
    );
    await rm(nodeModules, { recursive: true, force: true });
  }

  configRoot = await mkdtemp(resolve(CACHE_ROOT, '.config-'));
  const canonicalConfigRoot = await realpath(configRoot);
  requireValue(
    samePath(configRoot, canonicalConfigRoot) && dirname(canonicalConfigRoot) === CACHE_ROOT,
    'Bootstrap configuration root escaped its task-local cache.',
  );
  xdgConfigRoot = resolve(configRoot, 'xdg');
  pnpmConfigRoot = resolve(xdgConfigRoot, 'pnpm');
  emptyUserConfig = resolve(configRoot, 'user.npmrc');
  emptyGlobalConfig = resolve(configRoot, 'global.npmrc');
  emptyAuthConfig = resolve(configRoot, 'auth.npmrc');
  await requireCanonicalDirectory(checkoutRoot, pnpmConfigRoot);
}

function childEnvironment(extraEnv = {}) {
  requireValue(
    emptyUserConfig && emptyGlobalConfig && emptyAuthConfig && xdgConfigRoot,
    'Bootstrap controlled configuration is unavailable.',
  );
  const selected = {
    npm_config_cache: resolve(CACHE_ROOT, 'pnpm'),
    npm_config_globalconfig: emptyGlobalConfig,
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_userconfig: emptyUserConfig,
    pnpm_config_npmrc_auth_file: emptyAuthConfig,
    XDG_CONFIG_HOME: xdgConfigRoot,
  };
  const names = process.platform === 'win32' ? ['TEMP', 'TMP'] : ['TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) selected[name] = value;
  }
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    requireValue(systemRoot, 'Windows system root is unavailable.');
    selected.SystemRoot = systemRoot;
    selected.WINDIR = systemRoot;
    selected.ComSpec = resolve(systemRoot, 'System32', 'cmd.exe');
    selected.PATHEXT = '.COM;.EXE;.BAT;.CMD';
    selected.PATH = [dirname(process.execPath), resolve(systemRoot, 'System32'), systemRoot].join(delimiter);
  } else {
    selected.PATH = [dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  }
  return { ...selected, ...extraEnv };
}

function runNode(script, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    env: childEnvironment(extraEnv),
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

function artifactCachePath(cacheRoot, artifact) {
  const parsed = new URL(artifact.url);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = posix.dirname(parsed.pathname);
  const directory = createHash('sha256').update(parsed.toString()).digest('hex');
  const candidate = resolve(cacheRoot, directory, artifact.fileName);
  requireValue(candidate.startsWith(`${cacheRoot}${sep}`), 'Artifact cache path escaped its task-local root.');
  return candidate;
}

async function downloadPinnedArtifact(artifact, target, cacheRoot, allowedHosts) {
  let current = new URL(artifact.url);
  const redirectHosts = new Set(allowedHosts);
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
    'Artifact download left its declared immutable source carrier.',
  );

  const partial = `${target}.${process.pid}.partial`;
  requireValue(!existsSync(partial), 'Artifact partial download target already exists.');
  let handle = await open(partial, 'wx');
  const hash = createHash('sha256');
  let size = 0;

  try {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      requireValue(size <= MAX_ARTIFACT_BYTES, 'Pinned artifact exceeded the bounded download size.');
      hash.update(value);
      await handle.write(value);
    }
    await handle.close();
    handle = undefined;
    requireValue(hash.digest('hex') === artifact.sha256, 'Pinned artifact SHA-256 mismatch.');
    await rename(partial, target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (existsSync(partial)) {
      const canonicalPartial = await realpath(partial);
      requireValue(
        samePath(canonicalPartial, partial) && isStrictChild(cacheRoot, canonicalPartial),
        'Artifact partial download target was redirected.',
      );
      await rm(partial, { force: true });
    }
    throw error;
  }
}

async function ensurePinnedArchive(artifact, cacheRoot, allowedHosts) {
  const target = artifactCachePath(cacheRoot, artifact);
  await mkdir(dirname(target), { recursive: true });
  const canonicalDirectory = await realpath(dirname(target));
  requireValue(
    samePath(canonicalDirectory, dirname(target)) && isStrictChild(cacheRoot, canonicalDirectory),
    'Artifact cache directory was redirected.',
  );
  if (existsSync(target)) {
    const canonical = await realpath(target);
    requireValue(samePath(canonical, target) && isStrictChild(cacheRoot, canonical), 'Artifact cache file was redirected.');
    if ((await digestFile(target)) === artifact.sha256) return target;
    await rm(target, { force: true });
  }
  await downloadPinnedArtifact(artifact, target, cacheRoot, allowedHosts);
  return target;
}

async function countIncompletePayloads(directory) {
  let incomplete = 0;
  let inspected = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      inspected += 1;
      if (!existsSync(child)) incomplete += 1;
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('@')) {
      const scoped = await countIncompletePayloads(child);
      incomplete += scoped.inspected === 0 ? 1 : scoped.incomplete;
      inspected += scoped.inspected === 0 ? 1 : scoped.inspected;
      continue;
    }
    inspected += 1;
    if ((await readdir(child)).length === 0) incomplete += 1;
  }
  return { incomplete, inspected };
}

async function countDanglingLinks(directory) {
  let dangling = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.pnpm' || entry.name === '.bin') continue;
    const child = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (!existsSync(child)) dangling += 1;
      continue;
    }
    if (entry.isDirectory() && entry.name.startsWith('@')) {
      dangling += await countDanglingLinks(child);
    }
  }
  return dangling;
}

async function verifyInstalledClosure() {
  const nodeModules = resolve(ROOT, 'node_modules');
  const virtualStore = resolve(nodeModules, '.pnpm');
  requireValue(existsSync(virtualStore), 'The frozen install produced no pnpm virtual store to verify.');

  let incomplete = 0;
  let inspected = 0;
  for (const entry of await readdir(virtualStore, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const payloads = resolve(virtualStore, entry.name, 'node_modules');
    if (!existsSync(payloads)) {
      incomplete += 1;
      inspected += 1;
      continue;
    }
    const counted = await countIncompletePayloads(payloads);
    incomplete += counted.inspected === 0 ? 1 : counted.incomplete;
    inspected += counted.inspected === 0 ? 1 : counted.inspected;
  }
  incomplete += await countDanglingLinks(nodeModules);

  requireValue(inspected > 0, 'The frozen install resolved no package directories to verify.');
  requireValue(
    incomplete === 0,
    `The installed dependency closure is incomplete: ${incomplete} of ${inspected} resolved package directories are empty or dangling. Remove node_modules and re-run bootstrap.`,
  );
}

async function main() {
  const diagnosis = inspectDevelopmentInputs();
  await prepareGeneratedRoots();
  const artifact = diagnosis.inputs.secondaryArtifact;
  const nodeDistribution = diagnosis.inputs.nodeDistribution;
  await mkdir(pnpmConfigRoot, { recursive: true });
  await Promise.all([
    writeFile(emptyUserConfig, 'registry=https://registry.npmjs.org/\nalways-auth=false\n', { encoding: 'utf8', flag: 'wx' }),
    writeFile(emptyGlobalConfig, '', { encoding: 'utf8', flag: 'wx' }),
    writeFile(emptyAuthConfig, '', { encoding: 'utf8', flag: 'wx' }),
    writeFile(resolve(pnpmConfigRoot, 'auth.ini'), '', { encoding: 'utf8', flag: 'wx' }),
    writeFile(resolve(pnpmConfigRoot, 'config.yaml'), '', { encoding: 'utf8', flag: 'wx' }),
  ]);
  const pnpmVersion = runPnpm(['--version']);
  requireValue(pnpmVersion === '11.24.0', 'The pnpm lifecycle launcher drifted.');

  runPnpm([
    'install',
    '--frozen-lockfile',
    `--config.userconfig=${emptyUserConfig}`,
    `--config.npmrc-auth-file=${emptyAuthConfig}`,
    '--store-dir',
    STORE_ROOT,
    '--cache-dir',
    resolve(CACHE_ROOT, 'pnpm'),
  ]);
  await verifyInstalledClosure();
  const archive = await ensurePinnedArchive(artifact, ELECTRON_CACHE, [
    'github.com',
    'release-assets.githubusercontent.com',
  ]);
  requireValue((await digestFile(archive)) === artifact.sha256, 'Cached Electron artifact digest drifted.');
  const materialized = await materializeElectronRuntime({
    archive,
    artifact,
    environment: childEnvironment(),
  });

  console.log(
    JSON.stringify(
      {
        status: 'ready',
        host: diagnosis.host,
        runtime: diagnosis.runtime,
        lockfileSha256: diagnosis.inputs.lockfileSha256,
        nodeDistribution: {
          id: nodeDistribution.id,
          declaredDistributionSha256: nodeDistribution.sha256,
          executingVersionMatched: true,
        },
        secondaryArtifact: { id: artifact.id, sha256: artifact.sha256, verified: true },
        electronExtraction: materialized.adapter,
        electronNodeMode: materialized.evidence,
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
