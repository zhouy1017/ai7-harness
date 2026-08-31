import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inspectDevelopmentInputs } from './doctor.mjs';
import { electronLicenseCarriers } from './electron-runtime.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const MAX_TYPESCRIPT_DIAGNOSTICS = 64;
let runEsbuild;
let typeScriptDiagnosticsReported = false;

function requireBuild(condition, message) {
  if (!condition) throw new Error(message);
}

function outputPath(...parts) {
  const candidate = resolve(DIST, ...parts);
  requireBuild(candidate.startsWith(`${DIST}${sep}`), 'Build output escaped the exact dist root.');
  return candidate;
}

function safeProjectPath(file) {
  const candidate = resolve(ROOT, file);
  const projectPath = relative(ROOT, candidate);
  if (
    projectPath.length === 0 ||
    isAbsolute(projectPath) ||
    projectPath === '..' ||
    projectPath.startsWith(`..${sep}`)
  ) {
    return 'project-file';
  }
  const normalized = projectPath.split(sep).join('/');
  return /^[A-Za-z0-9._/-]{1,240}$/u.test(normalized) ? normalized : 'project-file';
}

function reportTypeScriptDiagnostics(stdout, stderr) {
  const diagnostics = [];
  const seen = new Set();
  const lines = `${stdout ?? ''}\n${stderr ?? ''}`.split(/\r?\n/u);
  for (const line of lines) {
    const fileMatch = /^(.*)\((\d+),(\d+)\):\s+error\s+(TS\d+):/u.exec(line);
    const globalMatch = /^error\s+(TS\d+):/u.exec(line);
    const diagnostic = fileMatch
      ? `BUILD_TYPESCRIPT/${safeProjectPath(fileMatch[1])}/${fileMatch[2]}/${fileMatch[3]}/${fileMatch[4]}`
      : globalMatch
        ? `BUILD_TYPESCRIPT/config/${globalMatch[1]}`
        : null;
    if (diagnostic !== null && !seen.has(diagnostic)) {
      seen.add(diagnostic);
      diagnostics.push(diagnostic);
    }
  }
  const admitted = diagnostics.slice(0, MAX_TYPESCRIPT_DIAGNOSTICS);
  for (const diagnostic of admitted) console.error(diagnostic);
  if (diagnostics.length > admitted.length) {
    console.error(`BUILD_TYPESCRIPT/omitted/${diagnostics.length - admitted.length}`);
  }
  if (diagnostics.length === 0) console.error('BUILD_TYPESCRIPT/unclassified');
}

function typecheck() {
  const compiler = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  requireBuild(existsSync(compiler), 'TypeScript is absent; run the frozen bootstrap first.');
  const result = spawnSync(process.execPath, [compiler, '--noEmit', '--pretty', 'false'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    reportTypeScriptDiagnostics(result.stdout, result.stderr);
    typeScriptDiagnosticsReported = true;
  }
  requireBuild(result.status === 0, 'TypeScript validation failed.');
}

const nodeBuild = {
  absWorkingDir: ROOT,
  bundle: true,
  legalComments: 'none',
  logLevel: 'silent',
  minify: false,
  packages: 'external',
  platform: 'node',
  sourcemap: false,
  target: 'node24.18',
};

async function ensureClosedOutputs() {
  const expected = new Set([
    'main/index.cjs',
    'main/preload.cjs',
    'config/dsh-profiles/manuscript-editorial/package.json',
    'config/native-artifact-sources/editorial-workspace-profile/package.json',
    'config/source-checkout-launch-authority.json',
    'docs/policies/active-policy-set.v3.json',
    'docs/policies/external-export-policy.v1.json',
    'docs/policies/provider-processing-policy.v1.json',
    'docs/policies/provider-processing-policy.v2.json',
    'docs/policies/provider-processing-policy.v3.json',
    'notices/ELECTRON_LICENSE',
    'notices/ELECTRON_LICENSES.chromium.html',
    'notices/THIRD_PARTY_NOTICES.md',
    'renderer/index.html',
    'renderer/renderer.js',
    'renderer/styles.css',
    'service/index.mjs',
    'shared/data-root.mjs',
    'shared/network-denial.mjs',
  ]);
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else found.push(relative(DIST, path).split(sep).join('/'));
    }
  }
  await visit(DIST);
  requireBuild(found.length === expected.size && found.every((path) => expected.has(path)), 'Built carrier set drifted.');

  const main = await readFile(outputPath('main', 'index.cjs'), 'utf8');
  const preload = await readFile(outputPath('main', 'preload.cjs'), 'utf8');
  const service = await readFile(outputPath('service', 'index.mjs'), 'utf8');
  const dataRoot = await readFile(outputPath('shared', 'data-root.mjs'), 'utf8');
  const renderer = await readFile(outputPath('renderer', 'renderer.js'), 'utf8');
  const builtProfile = await readFile(outputPath('config', 'dsh-profiles', 'manuscript-editorial', 'package.json'));
  const sourceProfile = await readFile(
    resolve(ROOT, 'config', 'dsh-profiles', 'manuscript-editorial', 'package.json'),
  );
  requireBuild(builtProfile.equals(sourceProfile), 'Built native DSH Profile bytes drifted.');
  const profileManifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(builtProfile));
  requireBuild(
    profileManifest?.name === '@ai7/manuscript-editorial-profile' &&
      profileManifest?.version === '1.0.0' &&
      profileManifest?.private === true &&
      Array.isArray(profileManifest?.dsh?.profile?.bundles) &&
      profileManifest.dsh.profile.bundles.length === 0 &&
      !('scripts' in profileManifest) &&
      !('dependencies' in profileManifest) &&
      !('devDependencies' in profileManifest),
    'Built native DSH Profile gained identity, dependency, script, or bundle drift.',
  );
  const builtEditorialWorkspaceProfile = await readFile(
    outputPath('config', 'native-artifact-sources', 'editorial-workspace-profile', 'package.json'),
  );
  const sourceEditorialWorkspaceProfile = await readFile(
    resolve(ROOT, 'config', 'native-artifact-sources', 'editorial-workspace-profile', 'package.json'),
  );
  requireBuild(
    builtEditorialWorkspaceProfile.equals(sourceEditorialWorkspaceProfile) &&
      builtEditorialWorkspaceProfile.length === 263 &&
      createHash('sha256').update(builtEditorialWorkspaceProfile).digest('hex') ===
        'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d',
    'Built editorial workspace Profile bytes drifted.',
  );
  const editorialWorkspaceManifest = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(builtEditorialWorkspaceProfile),
  );
  requireBuild(
    editorialWorkspaceManifest?.name === '@ai7/editorial-workspace-profile' &&
      editorialWorkspaceManifest?.version === '1.0.0' &&
      editorialWorkspaceManifest?.private === true &&
      Array.isArray(editorialWorkspaceManifest?.dsh?.profile?.bundles) &&
      editorialWorkspaceManifest.dsh.profile.bundles.length === 0 &&
      !('scripts' in editorialWorkspaceManifest) &&
      !('dependencies' in editorialWorkspaceManifest) &&
      !('devDependencies' in editorialWorkspaceManifest),
    'Built editorial workspace Profile gained identity, dependency, script, or bundle drift.',
  );
  const exactPolicyCarriers = [
    'config/source-checkout-launch-authority.json',
    'docs/policies/active-policy-set.v3.json',
    'docs/policies/external-export-policy.v1.json',
    'docs/policies/provider-processing-policy.v1.json',
    'docs/policies/provider-processing-policy.v2.json',
    'docs/policies/provider-processing-policy.v3.json',
  ];
  for (const path of exactPolicyCarriers) {
    const built = await readFile(outputPath(...path.split('/')));
    const source = await readFile(resolve(ROOT, ...path.split('/')));
    requireBuild(built.equals(source), `Built launch-policy carrier bytes drifted: ${path}`);
  }
  for (const [name, source] of Object.entries({ main, service })) {
    requireBuild(source.includes('installNodeNetworkDenial();'), `${name} omitted the synchronous Node network guard.`);
    requireBuild(source.includes('syncBuiltinESMExports'), `${name} omitted named built-in synchronization.`);
  }
  requireBuild(
    !preload.includes('node:http') &&
      !preload.includes('node:net') &&
      !preload.includes('installNodeNetworkDenial') &&
      preload.includes('contextBridge'),
    'Sandboxed preload gained Node network authority or lost its narrow bridge.',
  );
  requireBuild(
    service.includes('process.versions.electron === "43.4.1"') &&
      service.includes('process.versions.node === "24.18.1"') &&
      service.includes('process.versions.modules === "148"'),
    'Built service omitted its exact Electron Node-mode guard.',
  );
  requireBuild(service.includes('@deepseek-ai/dsh-agent-loop'), 'Built service omitted the dormant six-service composition.');
  requireBuild(main.includes('AI7_READY\\n'), 'Built main omitted its payload-free readiness handshake.');
  requireBuild(
    main.includes('@napi-rs/keyring') &&
      main.includes('NAPI_RS_NATIVE_LIBRARY_PATH') &&
      main.includes('NAPI_RS_FORCE_WASI') &&
      main.includes('PROTECTED_SECRET_NATIVE_OVERRIDE_DENIED'),
    'Built main omitted the exact native protected-secret-store boundary.',
  );
  requireBuild(main.includes('requestSingleInstanceLock'), 'Built main omitted its pre-store single-instance lock.');
  requireBuild(
    main.includes('getSwitchValue("user-data-dir")') &&
      main.includes('getPath("userData")') &&
      dataRoot.includes('requireSameCanonicalDataDirectory'),
    'Built subject omitted the pre-Electron canonical shell-root binding.',
  );
  requireBuild(
    main.includes('ai7:j01:close-risk-changed') &&
      main.includes('ai7:j01:close-blocked') &&
      main.includes('ai7:j01:product-ready') &&
      preload.includes('ai7ProductReady') &&
      renderer.includes('ai7CloseState') &&
      renderer.includes('data-ai7-close-state'),
    'Built subject omitted its close guard or persistent product-readiness bridge.',
  );
  const serviceRun = service.indexOf('async function run()');
  const serviceRunGuard = service.indexOf('installNodeNetworkDenial();', serviceRun);
  const deferredStore = service.indexOf('init_store(), store_exports', serviceRun);
  requireBuild(
    serviceRun >= 0 && serviceRunGuard > serviceRun && deferredStore > serviceRunGuard,
    'Built service evaluated its store or third-party parser before network denial.',
  );
  requireBuild(
    !renderer.includes('require("node:') && !renderer.includes('selectedPath'),
    'Renderer bundle gained Node or raw-path authority.',
  );
}

async function main() {
  const diagnosis = inspectDevelopmentInputs();
  ({ build: runEsbuild } = await import('esbuild'));
  requireBuild(dirname(DIST) === ROOT && DIST !== ROOT, 'Unsafe dist target.');
  typecheck();
  const checkoutRoot = await realpath(ROOT);
  requireBuild(checkoutRoot === ROOT, 'Checkout root must not be redirected during build.');
  if (existsSync(DIST)) {
    const canonicalDist = await realpath(DIST);
    const candidate = relative(checkoutRoot, canonicalDist);
    requireBuild(
      canonicalDist === DIST && candidate === 'dist' && !isAbsolute(candidate),
      'Build dist root was redirected outside its exact generated path.',
    );
    await rm(DIST, { recursive: true, force: true });
  }
  await mkdir(outputPath('main'), { recursive: true });
  await mkdir(outputPath('renderer'), { recursive: true });
  await mkdir(outputPath('service'), { recursive: true });
  await mkdir(outputPath('shared'), { recursive: true });
  await mkdir(outputPath('notices'), { recursive: true });
  await mkdir(outputPath('config', 'dsh-profiles', 'manuscript-editorial'), { recursive: true });
  await mkdir(outputPath('config', 'native-artifact-sources', 'editorial-workspace-profile'), { recursive: true });
  await mkdir(outputPath('docs', 'policies'), { recursive: true });

  const editorialWorkspaceSourceDirectory = resolve(
    ROOT,
    'config',
    'native-artifact-sources',
    'editorial-workspace-profile',
  );
  const editorialWorkspaceEntries = await readdir(editorialWorkspaceSourceDirectory, { withFileTypes: true });
  const editorialWorkspaceSourcePath = resolve(editorialWorkspaceSourceDirectory, 'package.json');
  const editorialWorkspaceSourceMetadata = await lstat(editorialWorkspaceSourcePath);
  requireBuild(
    editorialWorkspaceEntries.length === 1 &&
      editorialWorkspaceEntries[0]?.name === 'package.json' &&
      editorialWorkspaceEntries[0].isFile() &&
      !editorialWorkspaceEntries[0].isSymbolicLink() &&
      editorialWorkspaceSourceMetadata.isFile() &&
      !editorialWorkspaceSourceMetadata.isSymbolicLink() &&
      (await realpath(editorialWorkspaceSourceDirectory)) === editorialWorkspaceSourceDirectory &&
      (await realpath(editorialWorkspaceSourcePath)) === editorialWorkspaceSourcePath,
    'Editorial workspace Profile source must be one exact regular non-symlink package.json.',
  );

  const keyringPackage = JSON.parse(await readFile(resolve(ROOT, 'node_modules', '@napi-rs', 'keyring', 'package.json'), 'utf8'));
  requireBuild(keyringPackage.version === '1.3.0', 'Exact @napi-rs/keyring@1.3.0 is absent.');
  const carrier = process.platform === 'win32' && process.arch === 'x64'
    ? { packageName: 'keyring-win32-x64-msvc', binary: 'keyring.win32-x64-msvc.node' }
    : process.platform === 'darwin' && process.arch === 'arm64'
      ? { packageName: 'keyring-darwin-arm64', binary: 'keyring.darwin-arm64.node' }
      : undefined;
  requireBuild(carrier !== undefined, 'The exact protected-secret native carrier does not support this build platform.');
  const keyringRoot = await realpath(resolve(ROOT, 'node_modules', '@napi-rs', 'keyring'));
  const keyringRequire = createRequire(resolve(keyringRoot, 'index.js'));
  const carrierBinary = keyringRequire.resolve(`@napi-rs/${carrier.packageName}`);
  const carrierRoot = dirname(carrierBinary);
  const carrierPackage = JSON.parse(await readFile(resolve(carrierRoot, 'package.json'), 'utf8'));
  requireBuild(
    carrierPackage.version === '1.3.0' &&
      carrierBinary === resolve(carrierRoot, carrier.binary) &&
      existsSync(carrierBinary),
    'The exact protected-secret native carrier is absent.',
  );

  await runEsbuild({
    ...nodeBuild,
    entryPoints: [resolve(ROOT, 'src', 'main', 'index.ts')],
    external: ['electron'],
    format: 'cjs',
    outfile: outputPath('main', 'index.cjs'),
  });
  await runEsbuild({
    ...nodeBuild,
    entryPoints: [resolve(ROOT, 'src', 'main', 'preload.ts')],
    external: ['electron'],
    format: 'cjs',
    outfile: outputPath('main', 'preload.cjs'),
  });
  await runEsbuild({
    ...nodeBuild,
    entryPoints: [resolve(ROOT, 'src', 'service', 'index.ts')],
    format: 'esm',
    outfile: outputPath('service', 'index.mjs'),
  });
  await runEsbuild({
    ...nodeBuild,
    entryPoints: [resolve(ROOT, 'src', 'shared', 'data-root.ts')],
    format: 'esm',
    outfile: outputPath('shared', 'data-root.mjs'),
  });
  await runEsbuild({
    ...nodeBuild,
    entryPoints: [resolve(ROOT, 'src', 'shared', 'network-denial.ts')],
    format: 'esm',
    outfile: outputPath('shared', 'network-denial.mjs'),
  });
  await runEsbuild({
    absWorkingDir: ROOT,
    bundle: true,
    entryPoints: [resolve(ROOT, 'src', 'renderer', 'index.ts')],
    format: 'iife',
    legalComments: 'none',
    logLevel: 'silent',
    minify: true,
    outfile: outputPath('renderer', 'renderer.js'),
    platform: 'browser',
    sourcemap: false,
    target: 'chrome144',
  });
  await copyFile(resolve(ROOT, 'src', 'renderer', 'index.html'), outputPath('renderer', 'index.html'));
  await copyFile(resolve(ROOT, 'src', 'renderer', 'styles.css'), outputPath('renderer', 'styles.css'));
  await copyFile(
    resolve(ROOT, 'config', 'dsh-profiles', 'manuscript-editorial', 'package.json'),
    outputPath('config', 'dsh-profiles', 'manuscript-editorial', 'package.json'),
  );
  await copyFile(
    editorialWorkspaceSourcePath,
    outputPath('config', 'native-artifact-sources', 'editorial-workspace-profile', 'package.json'),
  );
  for (const path of [
    'config/source-checkout-launch-authority.json',
    'docs/policies/active-policy-set.v3.json',
    'docs/policies/external-export-policy.v1.json',
    'docs/policies/provider-processing-policy.v1.json',
    'docs/policies/provider-processing-policy.v2.json',
    'docs/policies/provider-processing-policy.v3.json',
  ]) {
    await copyFile(resolve(ROOT, ...path.split('/')), outputPath(...path.split('/')));
  }
  const electronNotices = electronLicenseCarriers(diagnosis.inputs.secondaryArtifact);
  const electronLicense = electronNotices.find((notice) => notice.id === 'electron-license');
  const electronChromium = electronNotices.find((notice) => notice.id === 'electron-chromium-notices');
  requireBuild(electronLicense && electronChromium, 'Electron notice carrier declaration is incomplete.');
  await copyFile(resolve(ROOT, 'THIRD_PARTY_NOTICES.md'), outputPath('notices', 'THIRD_PARTY_NOTICES.md'));
  await copyFile(electronLicense.path, outputPath('notices', 'ELECTRON_LICENSE'));
  await copyFile(electronChromium.path, outputPath('notices', 'ELECTRON_LICENSES.chromium.html'));
  await ensureClosedOutputs();
}

export async function runBuild() {
  try {
    await main();
  } catch {
    if (!typeScriptDiagnosticsReported) console.error('BUILD/unclassified');
    process.exitCode = 1;
  }
}
