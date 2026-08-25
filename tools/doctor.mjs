import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { arch, platform, release, version } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_PACKAGE_MANAGER =
  'pnpm@11.24.0+sha512.bd27e345e976dcb0be0b7a1228217b049a817e21b1f355c90dbe7dc46671895a8bc1e6d06c24554505ea93ea0b45f489a27ec1bfbc8de6a9659fca0f16fa0000';

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf8'));
}

function sha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(resolve(ROOT, relativePath)))
    .digest('hex');
}

function requireValue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyAmbientSelectors() {
  const forbiddenExact = new Set([
    'COREPACK_HOME',
    'COREPACK_INTEGRITY_KEYS',
    'COREPACK_NPM_REGISTRY',
    'ESBUILD_BINARY_PATH',
    'NODE_OPTIONS',
    'NPM_CONFIG_CACHE',
    'NPM_CONFIG_GLOBALCONFIG',
    'NPM_CONFIG_REGISTRY',
    'NPM_CONFIG_STORE_DIR',
    'NPM_CONFIG_USERCONFIG',
    'PNPM_HOME',
    'PNPM_STORE_PATH',
  ]);
  const forbidden = Object.keys(process.env).filter((name) => {
    const normalized = name.toUpperCase();
    return (
      forbiddenExact.has(normalized) ||
      normalized.startsWith('ELECTRON_') ||
      /^NPM_CONFIG_(?:CAFILE|HTTPS?_PROXY|PROXY|STRICT_SSL)$/.test(normalized) ||
      /^PNPM_(?:CACHE|REGISTRY|STORE)(?:_|$)/.test(normalized) ||
      /^PNPM_CONFIG_(?:CACHE|GLOBALCONFIG|REGISTRY|STORE_DIR|USERCONFIG)$/.test(normalized)
    );
  });
  requireValue(
    forbidden.length === 0,
    `Ambient acquisition selectors are not allowed: ${forbidden.map((name) => name.toUpperCase()).sort().join(', ')}.`,
  );
}

function verifyHost() {
  const host = { platform: platform(), arch: arch(), release: release(), version: version() };

  if (host.platform === 'win32') {
    const build = Number(host.release.split('.')[2]);
    const isWindows11 = /Windows 11/i.test(host.version);
    const isAuthorizedServerCI =
      /Windows Server 2025/i.test(host.version) &&
      process.env.GITHUB_ACTIONS === 'true' &&
      process.env.RUNNER_OS === 'Windows' &&
      process.env.AI7_CI_WINDOWS_SERVER_2025 === '1';
    requireValue(host.arch === 'x64', 'J-01 supports Windows x64 only.');
    requireValue(build >= 26100, 'J-01 requires Windows NT build 10.0.26100 or later.');
    requireValue(
      isWindows11 || isAuthorizedServerCI,
      'J-01 requires Windows 11 24H2+, except the explicitly labelled Windows Server 2025 CI job.',
    );
    return host;
  }

  if (host.platform === 'darwin') {
    requireValue(host.arch === 'arm64', 'J-01 supports Apple Silicon only.');
    requireValue(Number(host.release.split('.')[0]) >= 24, 'J-01 requires macOS 15 or later.');
    return host;
  }

  throw new Error(`Unsupported J-01 development host: ${host.platform}/${host.arch}.`);
}

export function inspectDevelopmentInputs() {
  verifyAmbientSelectors();
  const packageManifest = readJson('package.json');
  const artifactManifest = readJson('config/dependency-artifacts.json');
  const host = verifyHost();
  const pnpmUserAgent = process.env.npm_config_user_agent ?? '';

  requireValue(process.versions.node === '24.18.1', 'Node 24.18.1 is required.');
  requireValue(pnpmUserAgent.startsWith('pnpm/11.24.0 '), 'Run this command through pnpm 11.24.0.');
  requireValue(packageManifest.packageManager === EXPECTED_PACKAGE_MANAGER, 'packageManager pin or SRI drifted.');
  requireValue(packageManifest.engines?.node === '24.18.1', 'The exact Node engine pin drifted.');
  requireValue(packageManifest.engines?.pnpm === '11.24.0', 'The exact pnpm engine pin drifted.');
  requireValue(readFileSync(resolve(ROOT, '.node-version'), 'utf8').trim() === '24.18.1', '.node-version drifted.');
  requireValue(
    readFileSync(resolve(ROOT, '.npmrc'), 'utf8').replace(/\r\n/g, '\n') ===
      'registry=https://registry.npmjs.org/\nalways-auth=false\n',
    '.npmrc must keep the exact official unauthenticated registry boundary.',
  );

  for (const [name, specifier] of Object.entries({
    ...packageManifest.dependencies,
    ...packageManifest.devDependencies,
  })) {
    requireValue(
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(specifier),
      `Direct dependency ${name} is not pinned to one exact version.`,
    );
  }

  requireValue(artifactManifest.toolchain.node === '24.18.1', 'Artifact manifest Node pin drifted.');
  requireValue(artifactManifest.toolchain.pnpm === '11.24.0', 'Artifact manifest pnpm pin drifted.');
  requireValue(artifactManifest.toolchain.electron === '43.4.1', 'Artifact manifest Electron pin drifted.');
  requireValue(artifactManifest.toolchain.typescript === '6.0.3', 'Artifact manifest TypeScript pin drifted.');

  const runtimeArtifact = artifactManifest.artifacts.find(
    (artifact) =>
      artifact.kind === 'runtime-secondary-artifact' &&
      artifact.platform === host.platform &&
      artifact.arch === host.arch,
  );
  requireValue(runtimeArtifact, 'No pinned Electron secondary artifact exists for this host.');
  requireValue(
    runtimeArtifact.url ===
      `https://github.com/electron/electron/releases/download/v43.4.1/${runtimeArtifact.fileName}`,
    'Electron secondary artifact URL is not the exact official immutable release URL.',
  );
  requireValue(/^[0-9a-f]{64}$/.test(runtimeArtifact.sha256), 'Electron secondary artifact digest is invalid.');

  return {
    host,
    runtime: {
      node: process.versions.node,
      pnpm: '11.24.0',
      electron: artifactManifest.toolchain.electron,
      typescript: artifactManifest.toolchain.typescript,
    },
    inputs: {
      packageJsonSha256: sha256('package.json'),
      lockfileSha256: sha256('pnpm-lock.yaml'),
      pnpmWorkspaceSha256: sha256('pnpm-workspace.yaml'),
      npmrcSha256: sha256('.npmrc'),
      artifactManifestSha256: sha256('config/dependency-artifacts.json'),
      secondaryArtifact: {
        id: runtimeArtifact.id,
        fileName: runtimeArtifact.fileName,
        url: runtimeArtifact.url,
        sha256: runtimeArtifact.sha256,
      },
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(inspectDevelopmentInputs(), null, 2));
  } catch (error) {
    console.error(`doctor failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
