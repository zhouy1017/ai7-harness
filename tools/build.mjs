import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

function requireBuild(condition, message) {
  if (!condition) throw new Error(message);
}

function outputPath(...parts) {
  const candidate = resolve(DIST, ...parts);
  requireBuild(candidate.startsWith(`${DIST}${sep}`), 'Build output escaped the exact dist root.');
  return candidate;
}

function typecheck() {
  const compiler = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  requireBuild(existsSync(compiler), 'TypeScript is absent; run the frozen bootstrap first.');
  const result = spawnSync(process.execPath, [compiler, '--noEmit'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
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
    'renderer/index.html',
    'renderer/renderer.js',
    'renderer/styles.css',
    'service/index.mjs',
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
  const renderer = await readFile(outputPath('renderer', 'renderer.js'), 'utf8');
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
  requireBuild(
    !renderer.includes('require("node:') && !renderer.includes('selectedPath'),
    'Renderer bundle gained Node or raw-path authority.',
  );
}

async function main() {
  requireBuild(process.versions.node === '24.18.1', 'Build requires exact Node 24.18.1.');
  requireBuild(dirname(DIST) === ROOT && DIST !== ROOT, 'Unsafe dist target.');
  typecheck();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(outputPath('main'), { recursive: true });
  await mkdir(outputPath('renderer'), { recursive: true });
  await mkdir(outputPath('service'), { recursive: true });

  await build({
    ...nodeBuild,
    entryPoints: [resolve(ROOT, 'src', 'main', 'index.ts')],
    external: ['electron'],
    format: 'cjs',
    outfile: outputPath('main', 'index.cjs'),
  });
  await build({
    ...nodeBuild,
    entryPoints: [resolve(ROOT, 'src', 'main', 'preload.ts')],
    external: ['electron'],
    format: 'cjs',
    outfile: outputPath('main', 'preload.cjs'),
  });
  await build({
    ...nodeBuild,
    entryPoints: [resolve(ROOT, 'src', 'service', 'index.ts')],
    format: 'esm',
    outfile: outputPath('service', 'index.mjs'),
  });
  await build({
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
  await ensureClosedOutputs();
}

main().catch((error) => {
  console.error(`build failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
