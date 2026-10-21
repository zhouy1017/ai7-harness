import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// The pinned Node 24 toolchain strips this shared, dependency-free TypeScript contract.
import { parseBuildIdentity } from '../src/shared/build-identity.ts';

export { isSoftwareVersion, parseBuildIdentity } from '../src/shared/build-identity.ts';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(root, args) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      GIT_CONFIG_NOSYSTEM: '1', GIT_NO_LAZY_FETCH: '1' },
  });
  if (result.status !== 0) throw new Error('AI7_BUILD_IDENTITY_GIT_UNAVAILABLE');
  return result.stdout.trim();
}

/** Full reachable ancestry, including merged parents; independent of branch, host, clock and CI run. */
export async function readBuildIdentity(root = ROOT, { requireClean = false } = {}) {
  if (git(root, ['rev-parse', '--show-prefix']) !== '') throw new Error('AI7_BUILD_IDENTITY_ROOT_INVALID');
  if (git(root, ['rev-parse', '--is-shallow-repository']) !== 'false') throw new Error('AI7_BUILD_IDENTITY_SHALLOW_HISTORY');
  if (existsSync(resolve(root, git(root, ['rev-parse', '--git-path', 'info/grafts'])))) throw new Error('AI7_BUILD_IDENTITY_GRAFTED_HISTORY');
  const sourceCommit = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const buildNumberText = git(root, ['rev-list', '--count', sourceCommit]);
  if (!/^[1-9][0-9]*$/u.test(buildNumberText)) throw new Error('AI7_BUILD_IDENTITY_INVALID');
  const dirty = git(root, ['status', '--porcelain=v1', '--untracked-files=normal', '--ignore-submodules=none']) !== '';
  if (requireClean && dirty) throw new Error('AI7_BUILD_IDENTITY_DIRTY_SOURCE');
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')); }
  catch { throw new Error('AI7_BUILD_IDENTITY_PACKAGE_INVALID'); }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('AI7_BUILD_IDENTITY_PACKAGE_INVALID');
  return parseBuildIdentity({ schema: 1, softwareVersion: manifest.version, dataVersion: manifest.ai7?.dataVersion,
    buildNumber: Number(buildNumberText), sourceCommit, dirty });
}

/** Native numeric fields are projections; the complete SemVer and SHA remain in the identity manifest. */
export function nativeBuildVersions(value) {
  const identity = parseBuildIdentity(value);
  const core = identity.softwareVersion.split(/[-+]/u)[0];
  // NSIS and Windows VERSIONINFO have four unsigned 16-bit components. Never silently truncate.
  if (identity.buildNumber > 65535) throw new Error('AI7_BUILD_IDENTITY_WINDOWS_VERSION_OVERFLOW');
  const n = identity.buildNumber;
  return { windowsVersion: `${core}.${n}`, macShortVersion: core,
    macBundleVersion: `${1 + Math.floor(n / 10000)}.${Math.floor(n / 100) % 100}.${n % 100}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--require-clean') || args.length > 1) {
    console.error('AI7_BUILD_IDENTITY_ARGUMENT_INVALID'); process.exitCode = 1;
  } else readBuildIdentity(ROOT, { requireClean: args.includes('--require-clean') })
    .then((identity) => console.log(JSON.stringify(identity, null, 2)))
    .catch((error) => { console.error(/^AI7_BUILD_IDENTITY_[A-Z_]+$/u.test(error.message) ? error.message : 'AI7_BUILD_IDENTITY_INVALID'); process.exitCode = 1; });
}
