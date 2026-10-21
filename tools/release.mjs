import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isDeepStrictEqual } from 'node:util';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plannedOutputs } from './package.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHA = /^[a-f0-9]{40}$/u;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-rc\.[1-9][0-9]*)?$/u;
const REPO = 'zhouy1017/ai7-harness';
const PLATFORMS = ['win32', 'darwin'];
const QUEUE = '.github/workflows/e2e-nightly-queue.yml';
const HELP = `pnpm run release:prepare -- --sha <40-hex-commit> --version <X.Y.Z[-rc.N]> --gate-run <run-id>

Requires a clean, bootstrapped supported host and an empty/absent release/.
Builds unsigned native packages with the existing packager, without running
the packaged product; stages only named assets plus checksums/provenance.
Does not sign, notarize, create a tag, upload or publish. The automatic nightly
lane packages only after the existing two-platform final-dev Gate succeeds.
Local preparation records the supplied Gate ID without claiming remote proof.
Workflow-only commands: resolve, select, publish.
`;
function requireRelease(condition, code = 'input') { if (!condition) throw new Error(`AI7_RELEASE_FAILED/${code}`); }
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
const platformId = (platform) => platform === 'win32' ? 'win-x64' : 'mac-arm64';
const positiveId = (value) => /^[1-9][0-9]{0,15}$/u.test(String(value)) && Number.isSafeInteger(Number(value));
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const equal = isDeepStrictEqual;

async function readIdentity(root) {
  const { readBuildIdentity } = await import('./build-identity.mjs');
  return readBuildIdentity(root, { requireClean: true });
}

export function verifyIdentity(identity, candidate) {
  requireRelease(identity?.schema === 1 && identity.softwareVersion === candidate.version &&
    Number.isSafeInteger(identity.dataVersion) && identity.dataVersion > 0 &&
    Number.isSafeInteger(identity.buildNumber) && identity.buildNumber > 0 &&
    identity.sourceCommit === candidate.sha && identity.dirty === false &&
    equal(Object.keys(identity).sort(), ['schema', 'softwareVersion', 'dataVersion', 'buildNumber', 'sourceCommit', 'dirty'].sort()), 'identity');
  return identity;
}

export function resolveNightlySource(identity, gateRun) {
  // Canonical identity validation owns SemVer. Reserved publication syntax must not suppress the Gate.
  requireRelease(SHA.test(identity?.sourceCommit ?? '') && typeof identity.softwareVersion === 'string' && positiveId(gateRun), 'source');
  const candidate = { sha: identity.sourceCommit, version: identity.softwareVersion, gateRun };
  verifyIdentity(identity, candidate);
  return { ...candidate, eligible: VERSION.test(candidate.version) && candidate.version.length <= 64 };
}

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
    manifest.build.dmg.sign === false &&
    (manifest.build.win.signExecutable === false || manifest.build.win.signAndEditExecutable === false), 'unsigned-config');
  return manifest;
}

export function assetNames(version, platform) {
  requireRelease(PLATFORMS.includes(platform) && VERSION.test(version));
  return plannedOutputs(version, platform).filter((name) => name !== 'self-check.txt').map((source) => ({ source,
    name: platform === 'win32' ? source : source.replace(/\.dmg$/u, '-unsigned-inspection.dmg') }));
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

export async function stageAssets(root, candidate, platform, run = {}, identityReader = readIdentity) {
  requireRelease((run.id === undefined && run.attempt === undefined) ||
    (positiveId(run.id) && positiveId(run.attempt) && SHA.test(run.workflowSha ?? '') && run.id === candidate.gateRun), 'run');
  const identity = verifyIdentity(await identityReader(root), candidate);
  requireRelease(equal(JSON.parse(await readFile(resolve(root, 'dist/build-identity.json'), 'utf8')), identity), 'built-identity');
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
  const provenance = { schema: 2, repository: REPO, identity,
    gateRun: candidate.gateRun, inspectionOnly: platform === 'darwin', signed: false, notarized: false,
    platform, arch: platform === 'win32' ? 'x64' : 'arm64', inputs: await inputDigests(root),
    workflowRun: run.id ?? null, workflowAttempt: run.attempt ?? null, workflowSha: run.workflowSha ?? null, assets: records };
  await writeFile(resolve(output, provenanceName), `${JSON.stringify(provenance, null, 2)}\n`, { flag: 'wx' });
  const entries = [...records, { name: provenanceName, ...await fileDigest(resolve(output, provenanceName)) }];
  const checksumName = `SHA256SUMS-${id}.txt`;
  await writeFile(resolve(output, checksumName), entries.map(({ name, sha256 }) => `${sha256}  ${name}\n`).join(''), { flag: 'wx' });
  return [...entries.map(({ name }) => resolve(output, name)), resolve(output, checksumName)];
}

export function verifyQueueRun(run) {
  requireRelease(run?.repository?.full_name === REPO && run.head_repository?.full_name === REPO &&
    positiveId(run.repository.id) && run.head_repository.id === run.repository.id &&
    positiveId(run.id) && positiveId(run.run_attempt) && run.path === QUEUE &&
    ['schedule', 'workflow_dispatch'].includes(run.event) && run.head_branch === 'dev' && SHA.test(run.head_sha) &&
    run.status === 'completed' && ['success', 'failure'].includes(run.conclusion), 'nightly-run');
}

export function verifyGate(candidate, run, jobs) {
  verifyQueueRun(run);
  requireRelease(String(run.id) === candidate.gateRun && Array.isArray(jobs), 'gate');
  const passed = (job) => job?.status === 'completed' && job.conclusion === 'success' &&
    job.run_id === run.id && job.run_attempt === run.run_attempt;
  const one = (predicate) => {
    const matches = jobs.filter(predicate);
    requireRelease(matches.length === 1 && passed(matches[0]), 'gate');
    return matches[0];
  };
  const resolved = one((job) => job.name === 'Resolve final dev once');
  const gates = ['Windows Server 2025 x64 CI', 'macOS 15 arm64'].map((label) =>
    one((job) => job.name.startsWith('Full Gate over the final dev / J-01 + ') && job.name.endsWith(`(${label})`)));
  for (const gate of gates) {
    for (const name of ['Require the selected immutable checkout', 'Run every admitted Journey']) {
      const steps = gate.steps?.filter((step) => step.name === name);
      requireRelease(steps?.length === 1 && steps[0].conclusion === 'success', 'gate');
    }
    requireRelease(Date.parse(gate.started_at) >= Date.parse(resolved.completed_at), 'gate-order');
  }
  for (const platform of PLATFORMS) {
    const packaged = one((job) => job.name === `Package final dev (${platformId(platform)})`);
    requireRelease(gates.every((gate) => Date.parse(packaged.started_at) >= Date.parse(gate.completed_at)), 'gate-order');
  }
}

async function githubResponse(path, options = {}) {
  return fetch(`https://api.github.com/repos/${REPO}/${path}`, { redirect: 'manual', ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28', ...options.headers }, signal: AbortSignal.timeout(60_000) });
}
async function github(path, options) {
  const response = await githubResponse(path, options);
  requireRelease(response.ok, 'github');
  return response.json();
}
async function list(path, key, request = github) {
  const result = [];
  for (let page = 1; ; page++) {
    const response = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const entries = key ? response[key] : response;
    requireRelease(Array.isArray(entries), 'github-page');
    result.push(...entries);
    if (entries.length < 100) return result;
  }
}

// Listing exposes partial drafts to the write job, unlike the published-only tag endpoint.
export async function findRelease(candidate, request = github) {
  const matches = (await list('releases', null, request)).filter((release) => release.tag_name === candidate.tag);
  requireRelease(matches.length <= 1, 'duplicate-release');
  return matches[0] ?? null;
}
export async function resolveTag(tag, request = github) {
  requireRelease(typeof tag === 'string' && tag.startsWith('v') && VERSION.test(tag.slice(1)), 'tag');
  let object = (await request(`git/ref/tags/${tag}`)).object;
  const tagObject = object?.sha;
  requireRelease(SHA.test(tagObject ?? ''), 'tag');
  for (let depth = 0; object.type === 'tag' && depth < 8; depth++) {
    requireRelease(SHA.test(object.sha), 'tag');
    object = (await request(`git/tags/${object.sha}`)).object;
  }
  requireRelease(object.type === 'commit' && SHA.test(object.sha), 'tag');
  return { tag, tagObject, sha: object.sha, version: tag.slice(1) };
}
export async function recheckTag(candidate, request = github) {
  const current = await resolveTag(candidate.tag, request);
  requireRelease(current.sha === candidate.sha && current.tagObject === candidate.tagObject, 'tag-moved');
}

export function artifactName(candidate, run, platform) {
  return `inspection-${candidate.sha}-${run.id}-${run.run_attempt}-${platformId(platform)}`;
}
export function selectArtifacts(candidate, run, artifacts, now = Date.now()) {
  const selected = PLATFORMS.map((platform) => {
    const matches = artifacts.filter((artifact) => artifact.name === artifactName(candidate, run, platform));
    requireRelease(matches.length === 1, 'artifact-set');
    const artifact = matches[0];
    requireRelease(positiveId(artifact.id) && artifact.expired === false &&
      Date.parse(artifact.expires_at) > now && digestPattern.test(artifact.digest ?? '') &&
      artifact.workflow_run?.id === run.id && artifact.workflow_run.repository_id === run.repository.id &&
      artifact.workflow_run.head_repository_id === run.repository.id && artifact.workflow_run.head_branch === 'dev' &&
      artifact.workflow_run.head_sha === run.head_sha, 'artifact-provenance');
    return artifact;
  });
  requireRelease(new Set(selected.map((artifact) => artifact.id)).size === 2, 'artifact-set');
  return selected;
}

export async function verifyDownloads(root, directory, candidate, run, identityReader = readIdentity) {
  await canonicalDirectory(directory);
  const identity = verifyIdentity(await identityReader(root), candidate);
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
    requireRelease(provenance.schema === 2 && provenance.repository === REPO && equal(provenance.identity, identity) &&
      provenance.gateRun === candidate.gateRun && provenance.platform === platform &&
      provenance.arch === (platform === 'win32' ? 'x64' : 'arm64') && provenance.inspectionOnly === (platform === 'darwin') &&
      provenance.signed === false && provenance.notarized === false && provenance.workflowRun === run.id &&
      provenance.workflowAttempt === run.attempt && provenance.workflowSha === run.workflowSha &&
      equal(provenance.inputs, inputs) && provenance.assets?.length === names.length, 'provenance');
    const lines = [];
    for (const [index, name] of names.entries()) {
      const digest = await fileDigest(resolve(directory, name));
      requireRelease(equal(provenance.assets[index], { name, ...digest }), 'digest');
      lines.push(`${digest.sha256}  ${name}\n`);
    }
    lines.push(`${(await fileDigest(resolve(directory, provenanceName))).sha256}  ${provenanceName}\n`);
    requireRelease(await readFile(resolve(directory, checksumName), 'utf8') === lines.join(''), 'checksums');
  }
  requireRelease(equal((await readdir(directory)).sort(), expected.sort()), 'unexpected-download');
  return expected.map((name) => resolve(directory, name));
}

// Download the immutable archive by ID; fail on its server-recorded digest before parsing any entry.
// download-artifact only warns on digest mismatch, so it is not the publication verifier.
export async function verifyArchive(path, artifact) {
  requireRelease(digestPattern.test(artifact.digest ?? '') &&
    `sha256:${(await fileDigest(path)).sha256}` === artifact.digest, 'archive-digest');
}
export function verifyArchiveEntries(entries, expected) {
  requireRelease(equal([...entries].sort(), [...expected].sort()) && new Set(entries).size === entries.length, 'archive-entries');
}
async function downloadArtifact(artifact, path) {
  const response = await githubResponse(`actions/artifacts/${artifact.id}/zip`);
  requireRelease(response.status === 302, 'artifact-download');
  const url = new URL(response.headers.get('location'));
  requireRelease(url.protocol === 'https:' && !url.username && !url.password, 'artifact-download');
  // Do not forward the API token to the signed blob URL or follow a second redirect.
  const blob = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(300_000) });
  requireRelease(blob.ok && blob.body, 'artifact-download');
  await pipeline(Readable.fromWeb(blob.body), createWriteStream(path, { flags: 'wx' }));
  await verifyArchive(path, artifact);
}
async function downloadPackages(candidate, run, artifacts, directory) {
  await mkdir(directory);
  for (const [index, platform] of PLATFORMS.entries()) {
    const archive = resolve(directory, `../${platformId(platform)}.zip`);
    await downloadArtifact(artifacts[index], archive);
    const names = [...assetNames(candidate.version, platform).map(({ name }) => name),
      `provenance-${platformId(platform)}.json`, `SHA256SUMS-${platformId(platform)}.txt`];
    verifyArchiveEntries(command('unzip', ['-Z1', archive]).split(/\r?\n/u), names);
    // All entry names are literal allowlisted basenames. Extraction is followed by link/file checks.
    command('unzip', ['-q', archive, '-d', directory]);
  }
}

export function workflowPackageCandidate(env, candidate) {
  requireRelease(env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY === REPO &&
    ['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) && env.GITHUB_REF === 'refs/heads/dev' &&
    env.GITHUB_WORKFLOW_REF === `${REPO}/${QUEUE}@refs/heads/dev` &&
    SHA.test(env.GITHUB_SHA ?? '') && env.GITHUB_WORKFLOW_SHA === env.GITHUB_SHA &&
    positiveId(env.GITHUB_RUN_ID) && positiveId(env.GITHUB_RUN_ATTEMPT) && candidate.gateRun === env.GITHUB_RUN_ID, 'workflow');
}
export function validatePush(event) {
  requireRelease(event?.repository?.full_name === REPO && event.created === true && event.deleted === false &&
    event.forced === false && event.before === '0'.repeat(40) && SHA.test(event.after ?? '') &&
    event.ref?.startsWith('refs/tags/v') && VERSION.test(event.ref.slice('refs/tags/v'.length)), 'tag-event');
  return event.ref.slice('refs/tags/'.length);
}

function git(args, root = ROOT) { return command('git', args, { cwd: root }); }
function sourceVersion(sha) {
  requireRelease(SHA.test(sha), 'source');
  git(['merge-base', '--is-ancestor', sha, 'refs/remotes/origin/dev']);
  return JSON.parse(git(['show', `${sha}:package.json`])).version;
}
export async function selectTags(event, eventName, request = github, versionAt = sourceVersion) {
  let tags;
  let runId = null;
  let source = null;
  if (eventName === 'push') {
    tags = [validatePush(event)];
  } else {
    requireRelease(eventName === 'workflow_run' && event.action === 'completed' &&
      event.repository?.full_name === REPO && positiveId(event.workflow_run?.id), 'workflow');
    const run = await request(`actions/runs/${event.workflow_run.id}`);
    verifyQueueRun(run);
    requireRelease(run.run_attempt === event.workflow_run.run_attempt, 'stale-event');
    const artifacts = await list(`actions/runs/${run.id}/artifacts`, 'artifacts', request);
    const pattern = new RegExp(`^inspection-([a-f0-9]{40})-${run.id}-${run.run_attempt}-(?:win-x64|mac-arm64)$`, 'u');
    const sources = [...new Set(artifacts.map((artifact) => pattern.exec(artifact.name)?.[1]).filter(Boolean))];
    requireRelease(sources.length <= 1, 'artifact-source');
    if (sources.length === 0) return [];
    source = sources[0];
    runId = String(run.id);
    tags = [`v${versionAt(source)}`];
    // A nightly without its matching tag only stores packages. A later tag push performs publication.
    const refs = await request(`git/matching-refs/tags/${tags[0]}`);
    requireRelease(Array.isArray(refs), 'tag');
    if (!refs.some((ref) => ref.ref === `refs/tags/${tags[0]}`)) return [];
  }
  const selections = [];
  for (const name of tags) {
    const tag = await resolveTag(name, request);
    if (source !== null && tag.sha !== source) continue;
    requireRelease(versionAt(tag.sha) === tag.version, 'version');
    // Push `after` identifies the ref object; for an annotated tag, `head_commit` is
    // the peeled commit instead. Comparing only that commit would admit reannotation.
    if (eventName === 'push') requireRelease(event.after === tag.tagObject, 'tag-moved');
    selections.push({ ...tag, runId });
  }
  return selections;
}

async function admittedBuild(candidate, runId, attempt, request = github) {
  requireRelease(positiveId(runId) && (attempt === undefined || positiveId(attempt)), 'run');
  const run = await request(`actions/runs/${runId}${attempt === undefined ? '' : `/attempts/${attempt}`}`);
  requireRelease(String(run.id) === String(runId) && (attempt === undefined || run.run_attempt === Number(attempt)), 'run');
  const bound = { ...candidate, gateRun: String(run.id) };
  const jobs = await list(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs', request);
  verifyGate(bound, run, jobs);
  // The workflow head predates any queue merges; the source must descend from that head.
  git(['merge-base', '--is-ancestor', run.head_sha, candidate.sha]);
  const artifacts = selectArtifacts(bound, run, await list(`actions/runs/${run.id}/artifacts`, 'artifacts', request));
  return { candidate: bound, run, artifacts };
}
export async function findBuild(candidate, request = github, admit = admittedBuild) {
  if (candidate.runId !== null) return admit(candidate, candidate.runId, undefined, request);
  const runs = await list('actions/workflows/e2e-nightly-queue.yml/runs?branch=dev', 'workflow_runs', request);
  // Latest completed occurrence; an existing draft always freezes its original occurrence instead.
  for (const run of runs.filter((value) => value.status === 'completed').sort((a, b) => b.id - a.id)) {
    const artifacts = await list(`actions/runs/${run.id}/artifacts`, 'artifacts', request);
    if (!artifacts.some((artifact) => artifact.name.startsWith(`inspection-${candidate.sha}-${run.id}-${run.run_attempt}-`))) continue;
    return admit(candidate, String(run.id), undefined, request);
  }
  return null; // Early tag: queue completion reconciles it automatically.
}

const RECORD_PREFIX = '<!-- ai7-windows-release-v2 ';
export function publicationNames(version) {
  return [...assetNames(version, 'win32').map(({ name }) => name), 'provenance-win-x64.json', 'SHA256SUMS-win-x64.txt'].sort();
}
const prerelease = (version) => version.includes('-rc.');

export function verifyPublicationRecord(record, candidate, identity) {
  verifyIdentity(identity, candidate);
  requireRelease(record.sha === candidate.sha && record.version === candidate.version && record.tag === candidate.tag &&
    record.tagObject === candidate.tagObject && equal(record.identity, identity) && SHA.test(record.workflowSha ?? '') &&
    positiveId(record.runId) && positiveId(record.attempt) && record.assets?.length === 4 &&
    equal(record.assets.map((asset) => asset.name).sort(), publicationNames(candidate.version)) &&
    record.assets.every((asset) => Number.isSafeInteger(asset.size) && asset.size > 0 && /^[a-f0-9]{64}$/u.test(asset.sha256)) &&
    record.artifacts?.length === 2 && new Set(record.artifacts.map((artifact) => artifact.id)).size === 2 &&
    record.artifacts.every((artifact, index) => positiveId(artifact.id) && digestPattern.test(artifact.digest ?? '') &&
      artifact.name === artifactName(candidate, { id: record.runId, run_attempt: record.attempt }, PLATFORMS[index])), 'publication-record');
}
export function readPublicationRecord(release) {
  const body = release?.body;
  requireRelease(typeof body === 'string' && body.split(RECORD_PREFIX).length === 2, 'existing-release');
  const encoded = body.split(RECORD_PREFIX)[1].split(' -->')[0];
  const record = JSON.parse(encoded);
  requireRelease(record.schema === 2 && positiveId(record.runId) && positiveId(record.attempt) &&
    SHA.test(record.sha ?? '') && SHA.test(record.tagObject ?? '') &&
    record.tag === `v${record.version}` && VERSION.test(record.version ?? ''), 'existing-release');
  return record;
}
export function releasePlan(release, record, assets) {
  requireRelease(release.tag_name === record.tag && release.target_commitish === record.sha &&
    release.prerelease === prerelease(record.version) && equal(readPublicationRecord(release), record), 'existing-release');
  requireRelease(Array.isArray(assets) && new Set(assets.map((asset) => asset.name)).size === assets.length, 'release-assets');
  for (const asset of assets) {
    const expected = record.assets.find((entry) => entry.name === asset.name);
    requireRelease(expected && asset.state === 'uploaded' && asset.size === expected.size &&
      asset.digest === `sha256:${expected.sha256}`, 'release-assets');
  }
  const missing = record.assets.filter((entry) => !assets.some((asset) => asset.name === entry.name));
  requireRelease(release.draft === true || missing.length === 0, 'partial-published-release');
  return { missing: missing.map((entry) => entry.name), publish: release.draft === true };
}
export function draftArguments(candidate, files, notes) {
  return ['release', 'create', candidate.tag, ...files, '--repo', REPO, '--verify-tag', '--target', candidate.sha,
    '--draft', ...(prerelease(candidate.version) ? ['--prerelease', '--latest=false'] : []),
    '--title', `AI7 ${candidate.version} — Windows (unsigned)`, '--notes-file', notes];
}

export async function reconcilePublished(release, candidate, identity, request = github) {
  if (release?.draft !== false) return false;
  const record = readPublicationRecord(release);
  verifyPublicationRecord(record, candidate, identity);
  requireRelease(releasePlan(release, record, await list(`releases/${release.id}/assets`, null, request)).missing.length === 0, 'release-assets');
  await recheckTag(candidate, request);
  return true;
}

async function publish(selection) {
  const { tag, tagObject, sha, version, runId } = selection;
  requireRelease(tag === `v${version}` && SHA.test(tagObject ?? '') &&
    (runId === null || positiveId(runId)), 'selection');
  let candidate = releaseCandidate({ sha, version, gateRun: runId ?? '1' });
  candidate = { ...candidate, tagObject, runId };
  requireRelease(sourceVersion(sha) === version, 'version');
  await recheckTag(candidate);
  let release = await findRelease(candidate);
  const scratch = await realpath(await mkdtemp(resolve(tmpdir(), 'ai7-publication-')));
  const source = resolve(scratch, 'source');
  // Source is read as data only. Never install or execute downloaded/tagged source in the write job.
  command('git', ['clone', '--shared', '--no-checkout', ROOT, source]);
  git(['checkout', '--detach', sha], source);
  await verifyCheckout(source, candidate);
  const identity = verifyIdentity(await readIdentity(source), candidate);
  let build;
  if (release) {
    const record = readPublicationRecord(release);
    verifyPublicationRecord(record, candidate, identity);
    if (await reconcilePublished(release, candidate, identity)) {
      // Published assets are durable. Their frozen binding and API digests remain verifiable after
      // seven-day nightly archives expire; a retry never chooses or uploads another occurrence.
      console.log('RELEASE/already-published');
      return;
    }
    build = await admittedBuild(candidate, record.runId, record.attempt);
  } else {
    build = await findBuild(candidate);
  }
  if (!build) { console.log('RELEASE/waiting-for-nightly-packages'); return; }
  const { run, artifacts } = build;
  candidate = build.candidate;
  const directory = resolve(scratch, 'assets');
  await downloadPackages(candidate, run, artifacts, directory);
  const files = await verifyDownloads(source, directory, candidate,
    { id: String(run.id), attempt: String(run.run_attempt), workflowSha: run.head_sha });
  const assetRecords = [];
  for (const file of files.filter((file) => publicationNames(version).includes(basename(file)))) {
    assetRecords.push({ name: basename(file), ...await fileDigest(file) });
  }
  const record = { schema: 2, tag, tagObject, sha, version, identity, runId: String(run.id), attempt: String(run.run_attempt),
    workflowSha: run.head_sha, artifacts: artifacts.map(({ id, name, digest }) => ({ id, name, digest })), assets: assetRecords };
  verifyPublicationRecord(record, candidate, identity);
  await recheckTag(candidate);
  if (!release) {
    const notes = resolve(scratch, 'notes.md');
    await writeFile(notes, `Windows x64 release — unsigned installer and portable ZIP.\n\n` +
      `Source: ${sha}\nSoftware version: ${version}\nData Version: ${identity.dataVersion}\nBuild: ${identity.buildNumber}\n` +
      `Nightly Gate and packages: https://github.com/${REPO}/actions/runs/${run.id}/attempts/${run.run_attempt}\n` +
      `Workflow head (before queue merges): ${run.head_sha}\n\n` +
      `Windows code signing is deferred; Windows may show SmartScreen warnings. ` +
      `macOS publication is held until its signing and notarization path is configured and authorized. ` +
      `No packaged launch verification was performed. Provenance and checksums are descriptive, not signed attestations.\n\n` +
      `${RECORD_PREFIX}${JSON.stringify(record)} -->\n`, { flag: 'wx' });
    command('gh', draftArguments(candidate, [], notes));
    release = await findRelease(candidate);
    requireRelease(release, 'draft');
  }
  let assets = await list(`releases/${release.id}/assets`);
  const plan = releasePlan(release, record, assets);
  for (const name of plan.missing) {
    await recheckTag(candidate);
    // No clobber/delete: an ambiguous upload is reconciled on the next attempt by digest.
    command('gh', ['release', 'upload', tag, resolve(directory, name), '--repo', REPO]);
  }
  assets = await list(`releases/${release.id}/assets`);
  requireRelease(releasePlan(release, record, assets).missing.length === 0, 'release-assets');
  await recheckTag(candidate);
  if (plan.publish) {
    release = await github(`releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: false, prerelease: prerelease(version), make_latest: prerelease(version) ? 'false' : 'legacy' }) });
  }
  requireRelease(release.draft === false && releasePlan(release, record, assets).missing.length === 0, 'publication');
  await recheckTag(candidate);
  console.log(plan.publish ? 'RELEASE/windows-published' : 'RELEASE/already-published');
}

async function main(args) {
  const action = args.shift();
  requireRelease(['prepare', 'resolve', 'select', 'publish'].includes(action));
  if (action === 'prepare') {
    const candidate = parsePrepareArguments(args);
    if (candidate.help) { console.log(HELP); return; }
    if (process.env.GITHUB_ACTIONS === 'true') workflowPackageCandidate(process.env, candidate);
    await verifyCheckout(ROOT, candidate);
    requireRelease((process.platform === 'win32' && process.arch === 'x64') ||
      (process.platform === 'darwin' && process.arch === 'arm64'), 'host');
    verifyIdentity(await readIdentity(ROOT), candidate);
    await requireEmptyRelease(ROOT);
    command(process.execPath, [resolve(ROOT, 'tools/package.mjs'), '--build-only'], { inherit: true });
    await verifyCheckout(ROOT, candidate);
    const files = await stageAssets(ROOT, candidate, process.platform, { id: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT, workflowSha: process.env.GITHUB_WORKFLOW_SHA });
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `files<<AI7_ASSETS\n${files.join('\n')}\nAI7_ASSETS\n`);
    console.log('RELEASE/native-assets-staged');
    return;
  }
  requireRelease(args.length === 0 && process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === REPO, 'workflow');
  if (action === 'resolve') {
    const identity = await readIdentity(ROOT);
    const candidate = resolveNightlySource(identity, process.env.GITHUB_RUN_ID);
    workflowPackageCandidate(process.env, candidate);
    verifyIdentity(identity, candidate);
    await appendFile(process.env.GITHUB_OUTPUT, `sha=${candidate.sha}\nversion=${candidate.version}\neligible=${candidate.eligible}\n`);
  } else if (action === 'select') {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const include = await selectTags(event, process.env.GITHUB_EVENT_NAME);
    await appendFile(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include })}\ncount=${include.length}\ncontroller=${git(['rev-parse', 'HEAD'])}\n`);
  } else {
    requireRelease(['push', 'workflow_run'].includes(process.env.GITHUB_EVENT_NAME), 'workflow');
    await publish(JSON.parse(process.env.RELEASE_SELECTION));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(/^AI7_RELEASE_FAILED\/[a-z-]+$/u.test(error.message) ? error.message : 'AI7_RELEASE_FAILED/unclassified');
    process.exitCode = 1;
  });
}
