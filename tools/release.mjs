import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plannedOutputs } from './package.mjs';
import { hostedGatePassed } from './orca-release.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHA = /^[a-f0-9]{40}$/u;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-rc\.[1-9][0-9]*)?$/u;
const REPO = 'zhouy1017/ai7-harness';
const PLATFORMS = ['win32', 'darwin'];
const HELP = `pnpm run release:prepare -- --sha <40-hex-commit> --version <X.Y.Z[-rc.N]> --gate-run <run-id>

Requires a clean, bootstrapped supported host and an empty/absent release/.
Builds unsigned inspection packages with the existing packager, without running
the packaged product; stages only named assets plus checksums/provenance.
Does not sign, notarize, create a tag, upload or publish. Packaging still requires
separate Owner scope and completed ADR 0054 re-entry. This command records the
Gate run ID; the manual workflow validates it against GitHub before packaging.
Workflow-only commands: validate, draft (inputs from RELEASE_* environment).
`;
function requireRelease(condition, code = 'input') { if (!condition) throw new Error(`AI7_RELEASE_FAILED/${code}`); }
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
const platformId = (platform) => platform === 'win32' ? 'win-x64' : 'mac-arm64';

export function releaseCandidate({ sha, version, gateRun }) {
  requireRelease(typeof sha === 'string' && SHA.test(sha));
  requireRelease(typeof version === 'string' && VERSION.test(version) && version.length <= 64);
  requireRelease(typeof gateRun === 'string' && /^[1-9][0-9]{0,15}$/u.test(gateRun) && Number.isSafeInteger(Number(gateRun)));
  return { sha, version, gateRun, tag: `v${version}` };
}

export function parsePrepareArguments(args) {
  const values = [...args];
  if (values[0] === '--') values.shift();
  if (values.length === 1 && values[0] === '--help') return { help: true };
  const options = {};
  const keys = { '--sha': 'sha', '--version': 'version', '--gate-run': 'gateRun' };
  while (values.length) {
    const option = values.shift();
    requireRelease(Object.hasOwn(keys, option));
    const key = keys[option];
    requireRelease(key !== undefined && options[key] === undefined && values.length > 0);
    options[key] = values.shift();
  }
  return releaseCandidate(options);
}

function command(executable, args, { cwd = ROOT, inherit = false, env = process.env } = {}) {
  const child = spawnSync(executable, args, { cwd, env, windowsHide: true, encoding: 'utf8',
    stdio: inherit ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 });
  requireRelease(child.status === 0, 'command');
  return child.stdout?.trim() ?? '';
}

export async function verifyCheckout(root, candidate, git = (args) => command('git', args, { cwd: root })) {
  requireRelease(git(['rev-parse', 'HEAD']) === candidate.sha, 'checkout');
  requireRelease(git(['status', '--porcelain', '--untracked-files=all']) === '', 'dirty-checkout');
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  requireRelease(manifest.version === candidate.version, 'version');
  // This workflow has no signed mode; fail closed if the packaging contract changes.
  requireRelease(manifest.build.publish === null && manifest.build.mac.identity === null &&
    manifest.build.mac.hardenedRuntime === false && manifest.build.mac.notarize === false &&
    manifest.build.dmg.sign === false && manifest.build.win.signAndEditExecutable === false, 'unsigned-config');
  return manifest;
}

export function assetNames(version, platform) {
  requireRelease(PLATFORMS.includes(platform) && VERSION.test(version));
  return plannedOutputs(version, platform).filter((name) => name !== 'self-check.txt').map((source) => ({ source,
    name: source.replace(/\.(exe|zip|dmg)$/u, '-unsigned-inspection.$1') }));
}

async function canonicalDirectory(path) {
  const info = await lstat(path);
  requireRelease(info.isDirectory() && !info.isSymbolicLink() && samePath(await realpath(path), path), 'directory');
}

export async function requireEmptyRelease(root) {
  const directory = resolve(root, 'release');
  try { await canonicalDirectory(directory); }
  catch (error) { if (error.code === 'ENOENT') { await mkdir(directory); await canonicalDirectory(directory); return; } throw error; }
  requireRelease((await readdir(directory)).length === 0, 'stale-output');
}

async function fileDigest(path) {
  const info = await lstat(path);
  requireRelease(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size > 0 && samePath(await realpath(path), path), 'asset');
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  return { sha256: digest.digest('hex'), size: info.size };
}

async function inputDigests(root) {
  const result = {};
  for (const name of ['package.json', 'pnpm-lock.yaml', 'config/dependency-artifacts.json']) {
    result[name] = createHash('sha256').update(await readFile(resolve(root, name))).digest('hex');
  }
  return result;
}

export async function stageAssets(root, candidate, platform, run = {}) {
  requireRelease((run.id === undefined && run.attempt === undefined) ||
    (/^[1-9][0-9]*$/u.test(run.id ?? '') && /^[1-9][0-9]*$/u.test(run.attempt ?? '')), 'run');
  const release = resolve(root, 'release');
  await canonicalDirectory(release);
  const assets = assetNames(candidate.version, platform);
  const scratch = ['.builder', '.stage', '.resources', ...(platform === 'win32' ? ['AI7'] : [])];
  const admitted = new Set([...assets.map(({ source }) => source), ...scratch]);
  requireRelease((await readdir(release)).every((name) => admitted.has(name)), 'unexpected-output');
  for (const name of scratch) await canonicalDirectory(resolve(release, name));
  // Refuse stale product state even inside the known Windows scratch folder.
  if (platform === 'win32') {
    await canonicalDirectory(resolve(release, 'AI7/data'));
    requireRelease((await readdir(resolve(release, 'AI7/data'))).length === 0, 'product-data');
  }
  const output = resolve(release, 'upload');
  await mkdir(output); // exclusive: never merge an earlier attempt
  const records = [];
  for (const { source, name } of assets) {
    const digest = await fileDigest(resolve(release, source));
    await copyFile(resolve(release, source), resolve(output, name));
    requireRelease((await fileDigest(resolve(output, name))).sha256 === digest.sha256, 'copy');
    records.push({ name, ...digest });
  }
  const id = platformId(platform);
  const provenanceName = `provenance-${id}.json`;
  const provenance = { schema: 1, repository: REPO, commit: candidate.sha, version: candidate.version, tag: candidate.tag,
    gateRun: candidate.gateRun, inspectionOnly: true, signed: false, notarized: false,
    platform, arch: platform === 'win32' ? 'x64' : 'arm64', inputs: await inputDigests(root),
    workflowRun: run.id ?? null, workflowAttempt: run.attempt ?? null, assets: records };
  await writeFile(resolve(output, provenanceName), `${JSON.stringify(provenance, null, 2)}\n`, { flag: 'wx' });
  const entries = [...records, { name: provenanceName, ...await fileDigest(resolve(output, provenanceName)) }];
  const checksumName = `SHA256SUMS-${id}.txt`;
  await writeFile(resolve(output, checksumName), entries.map(({ name, sha256 }) => `${sha256}  ${name}\n`).join(''), { flag: 'wx' });
  return [...entries.map(({ name }) => resolve(output, name)), resolve(output, checksumName)];
}

export function verifyGate(candidate, run, jobs) {
  requireRelease(run?.repository?.full_name === REPO && String(run.id) === candidate.gateRun &&
    run.path === '.github/workflows/e2e-nightly.yml' && run.event === 'workflow_dispatch' &&
    hostedGatePassed({ run, jobs, candidate: candidate.sha }) &&
    ['(Windows Server 2025 x64 CI)', '(macOS 15 arm64)'].every((suffix) =>
      jobs.filter((job) => job.name.endsWith(suffix)).length === 1), 'gate');
}

function github(path, optional = false) {
  return fetch(`https://api.github.com/repos/${REPO}/${path}`, { redirect: 'error',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(30_000) }).then(async (response) => {
    if (optional && response.status === 404) return null;
    requireRelease(response.ok, 'github');
    return response.json();
  });
}

export async function verifyRemote(candidate, request = github) {
  let object = (await request(`git/ref/tags/${candidate.tag}`)).object;
  for (let depth = 0; object.type === 'tag' && depth < 8; depth++) {
    requireRelease(SHA.test(object.sha), 'tag');
    object = (await request(`git/tags/${object.sha}`)).object;
  }
  requireRelease(object.type === 'commit' && object.sha === candidate.sha, 'tag');
  requireRelease(await request(`releases/tags/${candidate.tag}`, true) === null, 'existing-release');
  const run = await request(`actions/runs/${candidate.gateRun}`);
  requireRelease(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'gate');
  const page = await request(`actions/runs/${candidate.gateRun}/attempts/${run.run_attempt}/jobs?per_page=100`);
  requireRelease(page.total_count === page.jobs?.length, 'gate');
  verifyGate(candidate, run, page.jobs);
}

export async function verifyDownloads(root, directory, candidate, run) {
  await canonicalDirectory(directory);
  const files = [];
  const expected = [];
  const inputs = await inputDigests(root);
  for (const platform of PLATFORMS) {
    const id = platformId(platform);
    const names = assetNames(candidate.version, platform).map(({ name }) => name);
    const provenanceName = `provenance-${id}.json`;
    const checksumName = `SHA256SUMS-${id}.txt`;
    expected.push(...names, provenanceName, checksumName);
    for (const name of [...names, provenanceName, checksumName]) await fileDigest(resolve(directory, name));
    const provenance = JSON.parse(await readFile(resolve(directory, provenanceName), 'utf8'));
    requireRelease(provenance.schema === 1 && provenance.repository === REPO && provenance.commit === candidate.sha &&
      provenance.version === candidate.version && provenance.tag === candidate.tag && provenance.gateRun === candidate.gateRun &&
      provenance.platform === platform && provenance.arch === (platform === 'win32' ? 'x64' : 'arm64') &&
      provenance.inspectionOnly === true && provenance.signed === false && provenance.notarized === false &&
      provenance.workflowRun === run.id && provenance.workflowAttempt === run.attempt &&
      JSON.stringify(provenance.inputs) === JSON.stringify(inputs) && provenance.assets?.length === names.length, 'provenance');
    const lines = [];
    for (const [index, name] of names.entries()) {
      const digest = await fileDigest(resolve(directory, name));
      requireRelease(JSON.stringify(provenance.assets[index]) === JSON.stringify({ name, ...digest }), 'digest');
      lines.push(`${digest.sha256}  ${name}\n`);
    }
    lines.push(`${(await fileDigest(resolve(directory, provenanceName))).sha256}  ${provenanceName}\n`);
    requireRelease(await readFile(resolve(directory, checksumName), 'utf8') === lines.join(''), 'checksums');
    files.push(...names, provenanceName, checksumName);
  }
  requireRelease(JSON.stringify((await readdir(directory)).sort()) === JSON.stringify(expected.sort()), 'unexpected-download');
  return files.map((name) => resolve(directory, name));
}

export function draftArguments(candidate, files, notes) {
  return ['release', 'create', candidate.tag, ...files, '--repo', REPO, '--verify-tag', '--target', candidate.sha,
    '--draft', '--prerelease', '--latest=false', '--title', `AI7 ${candidate.version} — UNSIGNED INSPECTION ONLY`, '--notes-file', notes];
}

export function workflowCandidate(env) {
  const candidate = releaseCandidate({ sha: env.RELEASE_SHA, version: env.RELEASE_VERSION, gateRun: env.RELEASE_GATE_RUN });
  requireRelease(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REPOSITORY === REPO &&
    env.GITHUB_REF === 'refs/heads/dev' && env.GITHUB_SHA === candidate.sha && env.GITHUB_WORKFLOW_SHA === candidate.sha &&
    /^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID ?? '') &&
    /^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'workflow');
  return candidate;
}

async function main(args) {
  const action = args.shift();
  requireRelease(['prepare', 'validate', 'draft'].includes(action));
  if (action === 'prepare') {
    const candidate = parsePrepareArguments(args);
    if (candidate.help) { console.log(HELP); return; }
    await verifyCheckout(ROOT, candidate);
    requireRelease((process.platform === 'win32' && process.arch === 'x64') ||
      (process.platform === 'darwin' && process.arch === 'arm64'), 'host');
    await requireEmptyRelease(ROOT);
    command(process.execPath, [resolve(ROOT, 'tools/package.mjs'), '--build-only'], { inherit: true });
    await verifyCheckout(ROOT, candidate);
    const files = await stageAssets(ROOT, candidate, process.platform, { id: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT });
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `files<<AI7_ASSETS\n${files.join('\n')}\nAI7_ASSETS\n`);
    console.log('RELEASE/unsigned-inspection-staged');
    return;
  }
  requireRelease(args.length === 0);
  const candidate = workflowCandidate(process.env);
  await verifyCheckout(ROOT, candidate);
  await verifyRemote(candidate);
  if (action === 'validate') { console.log('RELEASE/candidate-validated'); return; }
  const directory = resolve(ROOT, 'release', 'download');
  const files = await verifyDownloads(ROOT, directory, candidate, { id: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT });
  const notes = resolve(ROOT, 'release', 'draft-notes.md');
  await writeFile(notes, `UNSIGNED INSPECTION ONLY — NOT AN END-USER macOS RELEASE.\n\nCommit: ${candidate.sha}\nExisting tag: ${candidate.tag}\nFull Gate: https://github.com/${REPO}/actions/runs/${candidate.gateRun}\nBuild: https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}\n\nNo signing, hardened runtime, notarization or packaged launch verification was performed.\nmacOS end-user distribution requires Developer ID signing, hardened runtime, notarization and separate Owner publication authority under ADR 0052.\nChecksums and unsigned build provenance accompany these assets; they are not signed attestations.\n`, { flag: 'wx' });
  // gh checks that the tag exists itself; no --clobber, release edit or publish path.
  command('gh', draftArguments(candidate, files, notes));
  const release = await github(`releases/tags/${candidate.tag}`);
  requireRelease(release.draft === true && release.prerelease === true && release.tag_name === candidate.tag &&
    release.assets?.length === files.length && files.every((file) => release.assets.some((asset) => asset.name === basename(file) && asset.state === 'uploaded')), 'draft');
  console.log('RELEASE/draft-created');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(/^AI7_RELEASE_FAILED\/[a-z-]+$/u.test(error.message) ? error.message : 'AI7_RELEASE_FAILED/unclassified');
    process.exitCode = 1;
  });
}
