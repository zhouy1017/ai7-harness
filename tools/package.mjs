import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, delimiter, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { electronRuntimeRoot } from './electron-runtime.mjs';
import { isSoftwareVersion, nativeBuildVersions, parseBuildIdentity, readBuildIdentity } from './build-identity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = resolve(ROOT, 'release');
export const PACKAGER_CACHE = resolve(ROOT, '.cache', 'bootstrap', 'electron-builder');

function requirePackage(condition) { if (!condition) throw new Error('AI7_PACKAGE_INPUT_INVALID'); }
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
let phase = 'inputs';
function reachPhase(value) { phase = value; console.log(`PACKAGE/${value}`); }

export function plannedOutputs(version, platform = process.platform) {
  requirePackage(isSoftwareVersion(version));
  if (platform === 'win32') return [`AI7-${version}-win-x64-setup.exe`, `AI7-${version}-win-x64-portable.zip`, 'self-check.txt'];
  if (platform === 'darwin') return [`AI7-${version}-mac-arm64.dmg`];
  throw new Error('AI7_PACKAGE_HOST_UNSUPPORTED');
}

export function packagerArtifacts(manifest, platform = process.platform, arch = process.arch) {
  const inputs = manifest.artifacts.filter((entry) => entry.kind === 'packager-secondary-artifact' && entry.platform === platform && entry.arch === arch);
  requirePackage(inputs.length === 2);
  for (const entry of inputs) {
    requirePackage(/^[\w@.-]+$/.test(entry.cacheDirectory) && /^[\w.-]+$/.test(entry.fileName) &&
      entry.url === `https://github.com/electron-userland/electron-builder-binaries/releases/download/${entry.cacheDirectory}/${entry.fileName}` &&
      /^[a-f0-9]{64}$/.test(entry.sha256) && Number.isSafeInteger(entry.size) && entry.size > 0);
  }
  return inputs;
}

export async function verifyPackagerArchives(manifest) {
  for (const artifact of packagerArtifacts(manifest)) {
    const path = resolve(PACKAGER_CACHE, artifact.cacheDirectory, artifact.fileName);
    requirePackage(samePath(await realpath(path), path));
    const hash = createHash('sha256');
    let size = 0;
    for await (const bytes of createReadStream(path)) { hash.update(bytes); size += bytes.length; }
    requirePackage(size === artifact.size && hash.digest('hex') === artifact.sha256);
  }
}

/** Resolve installed packages without relying on exports exposing package.json. */
async function dependencyDirectory(name, parent) {
  const paths = createRequire(resolve(parent, 'package.json')).resolve.paths(name) ?? [];
  for (const path of paths) {
    const candidate = resolve(path, name);
    if (existsSync(resolve(candidate, 'package.json'))) return realpath(candidate);
  }
  throw new Error('AI7_PACKAGE_DEPENDENCY_MISSING');
}

/** Hoist the verified runtime graph and copy actual bytes, never pnpm junctions or development packages. */
export async function copyRuntimeClosure(source, target, platform = process.platform, arch = process.arch) {
  const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
  const selected = new Map();
  const nodes = new Map();
  const pending = Object.keys(manifest.dependencies ?? {}).map((name) => ({ name, parent: source, optional: false }));
  while (pending.length > 0) {
    const { name, parent, optional } = pending.shift();
    let directory;
    try { directory = await dependencyDirectory(name, parent); }
    catch (error) { if (optional) continue; throw error; }
    const pkg = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
    if (pkg.os && !pkg.os.includes(platform)) { requirePackage(optional); continue; }
    if (pkg.cpu && !pkg.cpu.includes(arch)) { requirePackage(optional); continue; }
    const id = `${name}@${pkg.version}`;
    if (!selected.has(name)) selected.set(name, id);
    if (nodes.has(id)) continue;
    nodes.set(id, { name, directory, pkg });
    for (const dep of Object.keys(pkg.dependencies ?? {})) pending.push({ name: dep, parent: directory, optional: false });
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) pending.push({ name: dep, parent: directory, optional: true });
  }
  const carrier = platform === 'win32' ? '@napi-rs/keyring-win32-x64-msvc' : '@napi-rs/keyring-darwin-arm64';
  requirePackage(selected.has('@napi-rs/keyring') && selected.has(carrier));
  const materialize = async (id, destination, available) => {
    const node = nodes.get(id);
    await cp(node.directory, destination, {
      recursive: true, dereference: true,
      filter: (path) => !relative(node.directory, path).split(sep).includes('node_modules') && !/(?:\.key[^/\\]*|\.pem)$|^\.env(?:\.|$)/i.test(basename(path)),
    });
    const visible = new Map(available).set(node.name, id);
    for (const name of Object.keys({ ...node.pkg.dependencies, ...node.pkg.optionalDependencies })) {
      let dependency;
      try { dependency = await dependencyDirectory(name, node.directory); } catch { continue; }
      const pkg = JSON.parse(await readFile(resolve(dependency, 'package.json'), 'utf8'));
      const dependencyId = `${name}@${pkg.version}`;
      if (!nodes.has(dependencyId) || visible.get(name) === dependencyId) continue;
      await materialize(dependencyId, resolve(destination, 'node_modules', name), visible);
    }
  };
  for (const [name, id] of selected) await materialize(id, resolve(target, 'node_modules', name), selected);
  return [...selected.keys()].sort();
}

export function builderConfiguration(manifest, stage, value) {
  const identity = parseBuildIdentity(value);
  requirePackage(identity.softwareVersion === manifest.version && identity.dataVersion === manifest.ai7?.dataVersion && !identity.dirty);
  const native = nativeBuildVersions(identity);
  return {
    ...manifest.build,
    buildNumber: String(identity.buildNumber), buildVersion: native.windowsVersion,
    win: { ...manifest.build.win, signAndEditExecutable: true, signExecutable: false },
    mac: { ...manifest.build.mac, bundleVersion: native.macBundleVersion, bundleShortVersion: native.macShortVersion,
      extendInfo: { AI7SoftwareVersion: identity.softwareVersion, AI7DataVersion: identity.dataVersion,
        AI7BuildNumber: identity.buildNumber, AI7SourceCommit: identity.sourceCommit, AI7Dirty: identity.dirty } },
    electronVersion: '43.4.1', electronDist: electronRuntimeRoot(),
    directories: { app: stage, output: resolve(RELEASE, '.builder'), buildResources: resolve(RELEASE, '.resources') },
  };
}

/** Like start-built, the package probe passes OS prerequisites, never acquisition credentials or Node overrides. */
export function selfCheckEnvironment(executable, env = process.env, platform = process.platform) {
  const selected = {};
  const names = platform === 'win32'
    ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
    : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) if (env[name] !== undefined) selected[name] = env[name];
  if (platform === 'win32') {
    const systemRoot = env.SystemRoot ?? env.WINDIR;
    requirePackage(systemRoot !== undefined && isAbsolute(systemRoot));
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  return selected;
}

async function resetOwnedDirectory(path) {
  requirePackage(relative(RELEASE, path) !== '' && !relative(RELEASE, path).startsWith('..') && !isAbsolute(relative(RELEASE, path)));
  if (existsSync(path)) {
    requirePackage(samePath(await realpath(path), path));
    await rm(path, { recursive: true, force: true });
  }
  await mkdir(path, { recursive: true });
}

function run(executable, args, options = {}) {
  const child = spawnSync(executable, args, { cwd: ROOT, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024, ...options });
  if (child.status !== 0) throw new Error('AI7_PACKAGE_CHILD_FAILED');
  return child.stdout;
}

export function parsePackageArguments(args) {
  const values = [...args];
  if (values[0] === '--') values.shift();
  requirePackage(values.length === 0 || (values.length === 1 && ['--list', '--build-only'].includes(values[0])));
  return { list: values[0] === '--list', buildOnly: values[0] === '--build-only' };
}

async function main(args) {
  // `pnpm run package -- --list` hands the separator through, as it does to the Journeys.
  const options = parsePackageArguments(args);
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
  const outputs = plannedOutputs(manifest.version);
  console.log(outputs.filter((name) => !options.buildOnly || name !== 'self-check.txt').map((name) => `release/${name}`).join('\n'));
  if (process.platform !== 'darwin') console.log('DMG：仅在 macOS 主机构建');
  if (options.list) return;
  const identity = await readBuildIdentity(ROOT, { requireClean: true });
  nativeBuildVersions(identity);
  requirePackage((process.platform === 'win32' && process.arch === 'x64') || (process.platform === 'darwin' && process.arch === 'arm64'));
  const artifacts = JSON.parse(await readFile(resolve(ROOT, 'config', 'dependency-artifacts.json'), 'utf8'));
  await verifyPackagerArchives(artifacts);
  // Build remains the existing clean, provider-free source-checkout command.
  reachPhase('build');
  run(process.execPath, [resolve(ROOT, 'tools', 'build-controller.mjs')]);
  const builtIdentity = parseBuildIdentity(JSON.parse(await readFile(resolve(ROOT, 'dist', 'build-identity.json'), 'utf8')));
  requirePackage(JSON.stringify(builtIdentity) === JSON.stringify(identity));
  const { installNodeNetworkDenial } = await import(pathToFileURL(resolve(ROOT, 'dist', 'shared', 'network-denial.mjs')).href);
  installNodeNetworkDenial();
  // Ignore ambient packager tool selectors, signing identities and credentials. No author home/config input is adopted.
  for (const name of Object.keys(process.env)) {
    if (/^(?:ELECTRON_|CSC_|WIN_CSC_|APPLE_|CUSTOM_DMGBUILD|USE_SYSTEM_|SIGNTOOL_|NPM_CONFIG_ELECTRON|npm_config_electron|npm_package_config_electron|SQUIRREL_)/i.test(name)) delete process.env[name];
  }
  process.env.ELECTRON_BUILDER_CACHE = PACKAGER_CACHE;
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  process.env.ELECTRON_BUILDER_OFFLINE = 'true';
  process.env.HTTP_PROXY = 'http://127.0.0.1:9';
  process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
  process.env.ALL_PROXY = 'http://127.0.0.1:9';
  process.env.NO_PROXY = '';
  await mkdir(RELEASE, { recursive: true });
  requirePackage(samePath(await realpath(RELEASE), RELEASE));
  reachPhase('staging');
  const stage = resolve(RELEASE, '.stage');
  await resetOwnedDirectory(stage);
  await resetOwnedDirectory(resolve(RELEASE, '.builder'));
  await mkdir(resolve(RELEASE, '.resources'), { recursive: true });
  await cp(resolve(ROOT, 'dist'), resolve(stage, 'dist'), { recursive: true });
  // The closure is explicitly staged, so builder cannot pick up pnpm's dev graph.
  await copyRuntimeClosure(ROOT, stage);
  // productName makes the packaged runtime name itself AI7, so Chromium's own pre-data-root state lands under the OS's AI7 folder.
  await writeFile(resolve(stage, 'package.json'), `${JSON.stringify({ name: manifest.name, productName: manifest.build.productName,
    version: identity.softwareVersion, ai7: { dataVersion: identity.dataVersion, buildIdentity: identity },
    description: manifest.description, type: 'module', main: manifest.main, author: 'AI7 contributors',
    license: 'UNLICENSED' }, null, 2)}\n`);
  const { build, Platform, Arch } = await import('electron-builder');
  const channel = process.platform === 'win32' ? 'windows-installer' : 'macos-dmg';
  const config = builderConfiguration(manifest, stage, identity);
  config.afterPack = async ({ appOutDir }) => {
    const resources = process.platform === 'win32' ? resolve(appOutDir, 'resources') : resolve(appOutDir, 'AI7.app', 'Contents', 'Resources');
    await writeFile(resolve(resources, 'channel.json'), `${JSON.stringify({ channel, softwareVersion: manifest.version })}\n`);
    await cp(resolve(stage, 'node_modules'), resolve(resources, 'app', 'node_modules'), { recursive: true, dereference: true });
  };
  const platform = process.platform === 'win32' ? Platform.WINDOWS : Platform.MAC;
  reachPhase('builder');
  await build({ projectDir: ROOT, targets: platform.createTarget(process.platform === 'win32' ? 'nsis' : 'dmg', process.platform === 'win32' ? Arch.x64 : Arch.arm64), config, publish: 'never' });
  requirePackage(JSON.stringify(await readBuildIdentity(ROOT, { requireClean: true })) === JSON.stringify(identity));
  const output = resolve(RELEASE, '.builder', outputs[0]);
  await rename(output, resolve(RELEASE, outputs[0]));
  if (process.platform === 'win32') {
    reachPhase('portable-archive');
    const portable = resolve(RELEASE, 'AI7');
    await resetOwnedDirectory(portable);
    await cp(resolve(RELEASE, '.builder', 'win-unpacked'), resolve(portable, 'app'), { recursive: true, dereference: true });
    await mkdir(resolve(portable, 'data'));
    await mkdir(resolve(portable, 'resources'));
    const marker = `${JSON.stringify({ channel: 'windows-portable', softwareVersion: manifest.version })}\n`;
    await writeFile(resolve(portable, 'app', 'resources', 'channel.json'), marker);
    await writeFile(resolve(portable, 'resources', 'channel.json'), marker);
    // Archive the pristine folder before self-check creates any product data.
    const require = createRequire(import.meta.url);
    const builderRequire = createRequire(require.resolve('electron-builder'));
    const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
    const { getPath7za } = appBuilderRequire('app-builder-lib/out/toolsets/7zip');
    const archive = resolve(RELEASE, outputs[1]);
    if (existsSync(archive)) await rm(archive);
    run(await getPath7za(), ['a', '-tzip', '-mx=5', archive, 'AI7'], { cwd: RELEASE });
    if (!options.buildOnly) {
      reachPhase('self-check');
      const executable = resolve(portable, 'app', 'AI7.exe');
      const report = run(executable, ['--self-check'], { env: selfCheckEnvironment(executable) });
      const check = JSON.parse(report.trim());
      requirePackage(check.channel === 'windows-portable' && check.writable === true && check.store_versions === 'readable' && check.keyringCarrier === 'loaded');
      requirePackage(JSON.stringify(parseBuildIdentity(check.buildIdentity)) === JSON.stringify(identity));
      await writeFile(resolve(RELEASE, 'self-check.txt'), report);
      console.log('Packaged portable self-check: pass');
    }
  }
  // Scratch payloads never become a second distributable.
  await resetOwnedDirectory(stage);
  console.log('Unsigned host-native package: complete (no signing, notarization or publication)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(/^AI7_BUILD_IDENTITY_[A-Z_]+$/u.test(error.message) ? `AI7_PACKAGE_FAILED/${error.message}` : `AI7_PACKAGE_FAILED/${phase}`);
    process.exitCode = 1;
  });
}
