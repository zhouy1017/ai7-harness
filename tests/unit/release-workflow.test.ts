import { copyFile, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { artifactName, assetNames, draftArguments, findBuild, findRelease, parsePrepareArguments, publicationNames, readPublicationRecord, reconcilePublished, recheckTag, releaseCandidate, releasePlan, requireEmptyRelease, resolveNightlySource, resolveTag, selectArtifacts, selectTags, stageAssets, validatePush, verifyArchive, verifyArchiveEntries, verifyCheckout, verifyDownloads, verifyGate, verifyIdentity, verifyPublicationRecord, workflowPackageCandidate } from '../../tools/release.mjs';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { parsePackageArguments } from '../../tools/package.mjs';

const repo = 'zhouy1017/ai7-harness';
const candidate = releaseCandidate({ sha: 'a'.repeat(40), version: '0.1.0', gateRun: '123' });
const identity = { schema: 1, softwareVersion: '0.1.0', dataVersion: 1, buildNumber: 72, sourceCommit: candidate.sha, dirty: false };
const identityReader = async () => identity;
const run = { id: 123, run_attempt: 2, repository: { id: 7, full_name: repo }, head_repository: { id: 7, full_name: repo },
  path: '.github/workflows/e2e-nightly-queue.yml', event: 'workflow_dispatch', head_sha: 'b'.repeat(40),
  head_branch: 'dev', status: 'completed', conclusion: 'failure' };
const workflowRun = { id: '123', attempt: '2', workflowSha: run.head_sha };
const time = (minute: number) => `2026-10-21T01:${String(minute).padStart(2, '0')}:00Z`;
const passedJob = (name: string, start: number, end: number) => ({ name, run_id: 123, run_attempt: 2,
  status: 'completed', conclusion: 'success', started_at: time(start), completed_at: time(end),
  steps: ['Require the selected immutable checkout', 'Run every admitted Journey'].map((name) => ({ name, conclusion: 'success' })) });
const jobs = [passedJob('Resolve final dev once', 0, 1),
  passedJob('Full Gate over the final dev / J-01 + admitted set (Windows Server 2025 x64 CI)', 2, 20),
  passedJob('Package final dev (win-x64)', 21, 30)];
// ADR 0097: the queue builds one Windows artifact; no macOS artifact exists to select or verify.
const artifacts = ['win32'].map((platform, index) => ({ id: index + 10, name: artifactName(candidate, run, platform),
  expired: false, expires_at: '2099-01-01T00:00:00Z', digest: `sha256:${'d'.repeat(64)}`,
  workflow_run: { id: 123, repository_id: 7, head_repository_id: 7, head_branch: 'dev', head_sha: run.head_sha } }));
const tagObject = 'e'.repeat(40);
const push = { repository: { full_name: repo }, created: true, deleted: false, forced: false,
  before: '0'.repeat(40), after: tagObject, ref: 'refs/tags/v0.1.0' };

async function fixture(root: string, platform: string) {
  await mkdir(join(root, 'config'), { recursive: true });
  await mkdir(join(root, 'dist'));
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'dist/build-identity.json'), JSON.stringify(identity));
  await writeFile(join(root, 'pnpm-lock.yaml'), 'synthetic lock');
  await writeFile(join(root, 'config/dependency-artifacts.json'), '{}');
  await requireEmptyRelease(root);
  for (const directory of ['.builder', '.stage', '.resources', ...(platform === 'win32' ? ['AI7/data'] : [])]) {
    await mkdir(join(root, 'release', directory), { recursive: true });
  }
  for (const { source } of assetNames(candidate.version, platform)) await writeFile(join(root, 'release', source), 'synthetic package bytes');
}

async function withFixture(body: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ai7-release-test-')));
  try { await body(root); } finally { await rm(root, { recursive: true, force: true }); }
}

describe('nightly source and artifact admission', () => {
  it.each([{ sha: 'dev' }, { sha: 'A'.repeat(40) }, { version: '../escape' }, { version: '1.0.0\nname=x' },
    { version: '01.0.0' }, { version: '1.0.0-beta.1' }, { gateRun: '0' }, { gateRun: '1;echo' }])('rejects invalid identity %j', (override) => {
    expect(() => releaseCandidate({ ...candidate, ...override })).toThrow();
  });

  it('preserves local preparation and side-effect-free help', () => {
    expect(releaseCandidate({ ...candidate, version: '1.0.0-rc.1' }).tag).toBe('v1.0.0-rc.1');
    expect(parsePrepareArguments(['--', '--help'])).toEqual({ help: true });
    for (const args of [[], ['--sha'], ['--publish'], ['__proto__', 'x'], ['--sha', candidate.sha, '--sha', candidate.sha]]) {
      expect(() => parsePrepareArguments(args)).toThrow();
    }
    expect(parsePackageArguments(['--build-only'])).toEqual({ list: false, buildOnly: true });
    expect(parsePackageArguments([])).toEqual({ list: false, buildOnly: false });
  });

  it('resolves immutable source for the existing Gate independently of reserved release-version syntax', () => {
    expect(resolveNightlySource(identity, '123')).toMatchObject({ sha: candidate.sha, eligible: true });
    expect(resolveNightlySource({ ...identity, softwareVersion: '0.1.0-beta.1+test' }, '123'))
      .toMatchObject({ sha: candidate.sha, version: '0.1.0-beta.1+test', eligible: false });
  });

  it('binds packaging to the queue while keeping workflow head distinct from final dev', () => {
    const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: repo,
      GITHUB_REF: 'refs/heads/dev', GITHUB_SHA: run.head_sha, GITHUB_WORKFLOW_SHA: run.head_sha,
      GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/e2e-nightly-queue.yml@refs/heads/dev`, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' };
    expect(() => workflowPackageCandidate(env, candidate)).not.toThrow();
    for (const patch of [{ GITHUB_REF: 'refs/heads/feature' }, { GITHUB_WORKFLOW_SHA: candidate.sha },
      { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REPOSITORY: 'other/repo' },
      { GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/e2e-candidate.yml@refs/heads/dev` }, { GITHUB_RUN_ID: '999' }]) {
      expect(() => workflowPackageCandidate({ ...env, ...patch }, candidate)).toThrow(/workflow/);
    }
  });

  it('requires the exact final-dev Windows Gate and package jobs, even when the enclosing queue failed a candidate', () => {
    expect(() => verifyGate(candidate, run, jobs)).not.toThrow();
    const extraCandidate = passedJob('Candidate #9 / J-01 + admitted set (macOS 15 arm64)', 1, 2);
    expect(() => verifyGate(candidate, run, [...jobs, { ...extraCandidate, conclusion: 'failure' }])).not.toThrow();
    for (const patch of [{ path: '.github/workflows/e2e-nightly.yml' }, { event: 'pull_request' },
      { head_repository: { id: 8, full_name: 'fork/repo' } }, { head_branch: 'nightly/candidate-9' },
      { status: 'in_progress' }, { conclusion: 'cancelled' }, { run_attempt: 3 }, { id: 999 }]) {
      expect(() => verifyGate(candidate, { ...run, ...patch }, jobs)).toThrow();
    }
    expect(() => verifyGate(candidate, run, jobs.slice(0, -1))).toThrow(/gate/);
    expect(() => verifyGate(candidate, run, [...jobs, jobs[1]])).toThrow(/gate/);
    for (const status of ['failure', 'skipped', 'cancelled']) {
      expect(() => verifyGate(candidate, run, jobs.map((job, index) => index === 2 ? { ...job, conclusion: status } : job))).toThrow(/gate/);
    }
    expect(() => verifyGate(candidate, run, jobs.map((job, index) => index === 2 ? extraCandidate : job))).toThrow(/gate/);
    expect(() => verifyGate(candidate, run, jobs.map((job, index) => index === 1 ? { ...job, steps: [] } : job))).toThrow(/gate/);
    expect(() => verifyGate(candidate, run, jobs.map((job, index) => index === 2 ? { ...job, started_at: time(3) } : job))).toThrow(/gate-order/);
  });

  it('selects exactly one unexpired Windows artifact from the exact run/attempt, never PR, macOS or older-attempt files', () => {
    expect(selectArtifacts(candidate, run, artifacts)).toEqual(artifacts);
    expect(() => selectArtifacts(candidate, run, [])).toThrow(/artifact-set/);
    expect(() => selectArtifacts(candidate, run, [{ ...artifacts[0], name: artifactName(candidate, run, 'darwin') }])).toThrow(/artifact-set/);
    expect(() => selectArtifacts(candidate, run, [...artifacts, artifacts[0]])).toThrow(/artifact-set/);
    expect(() => selectArtifacts(candidate, { ...run, run_attempt: 3 }, artifacts)).toThrow(/artifact-set/);
    for (const patch of [{ expired: true }, { expires_at: time(0) }, { digest: null },
      { workflow_run: { ...artifacts[0]!.workflow_run, head_sha: candidate.sha } },
      { workflow_run: { ...artifacts[0]!.workflow_run, head_repository_id: 8 } }]) {
      expect(() => selectArtifacts(candidate, run, [{ ...artifacts[0], ...patch }])).toThrow(/artifact-provenance/);
    }
  });

  it('uses the canonical clean identity and rejects run-number substitutions and built identity drift', async () => {
    expect(verifyIdentity(identity, candidate)).toEqual(identity);
    for (const patch of [{ dirty: true }, { dataVersion: 0 }, { buildNumber: 0 }, { buildNumber: 1.5 },
      { sourceCommit: run.head_sha }, { softwareVersion: '9.0.0' }, { workflowRun: 123 }]) {
      expect(() => verifyIdentity({ ...identity, ...patch }, candidate)).toThrow(/identity/);
    }
    await withFixture(async (root) => {
      await fixture(root, 'win32');
      await writeFile(join(root, 'dist/build-identity.json'), JSON.stringify({ ...identity, buildNumber: 123 }));
      await expect(stageAssets(root, candidate, 'win32', workflowRun, identityReader)).rejects.toThrow(/built-identity/);
    });
  });
});

describe('tag timing and immutable published releases', () => {
  const tagRequest = async (path: string) => {
    if (path.startsWith('git/ref/')) return { object: { type: 'tag', sha: tagObject } };
    if (path.startsWith('git/tags/')) return { object: { type: 'commit', sha: candidate.sha } };
    throw new Error(`unexpected ${path}`);
  };

  it.each(['lightweight', 'annotated'])('binds a %s push to its ref object rather than head_commit', async (kind) => {
    // GitHub's push schema distinguishes after (the ref object) from head_commit
    // (the expanded, peeled commit) when an annotated tag is pushed.
    const after = kind === 'annotated' ? tagObject : candidate.sha;
    const event = { ...push, after, head_commit: { id: candidate.sha } };
    const request = kind === 'annotated' ? tagRequest : async (path: string) => {
      expect(path).toBe(`git/ref/tags/${candidate.tag}`);
      return { object: { type: 'commit', sha: candidate.sha } };
    };
    await expect(selectTags(event, 'push', request, () => candidate.version)).resolves.toEqual([
      { tag: candidate.tag, tagObject: after, sha: candidate.sha, version: candidate.version, runId: null },
    ]);
    // Even replacing the annotation while retaining the same commit moves the ref.
    const replaced = async (path: string) => path.startsWith('git/ref/')
      ? { object: { type: 'tag', sha: 'f'.repeat(40) } }
      : { object: { type: 'commit', sha: candidate.sha } };
    await expect(selectTags(event, 'push', replaced, () => candidate.version)).rejects.toThrow(/tag-moved/);
  });

  it('peels annotated tags, checks the exact pushed object and rejects moves, deletions and version drift', async () => {
    const tag = await resolveTag(candidate.tag, tagRequest);
    expect(tag).toEqual({ tag: candidate.tag, tagObject, sha: candidate.sha, version: candidate.version });
    await expect(recheckTag(tag, tagRequest)).resolves.toBeUndefined();
    await expect(recheckTag({ ...tag, tagObject: 'f'.repeat(40) }, tagRequest)).rejects.toThrow(/tag-moved/);
    expect(validatePush(push)).toBe(candidate.tag);
    for (const patch of [{ forced: true }, { deleted: true }, { created: false }, { before: candidate.sha },
      { ref: 'refs/tags/v01.0.0' }, { repository: { full_name: 'fork/repo' } }]) {
      expect(() => validatePush({ ...push, ...patch })).toThrow(/tag-event/);
    }
    await expect(selectTags(push, 'push', tagRequest, () => candidate.version)).resolves.toEqual([{ ...tag, runId: null }]);
    await expect(selectTags({ ...push, after: 'f'.repeat(40) }, 'push', tagRequest, () => candidate.version)).rejects.toThrow(/tag-moved/);
    await expect(selectTags(push, 'push', tagRequest, () => '1.0.0')).rejects.toThrow(/version/);
    await expect(resolveTag(candidate.tag, async () => ({ object: { type: 'commit', sha: candidate.sha } })))
      .resolves.toHaveProperty('tagObject', candidate.sha);
  });

  it('defers an early tag and reconciles it automatically after the exact package occurrence completes', async () => {
    await expect(findBuild({ ...candidate, runId: null }, async () => ({ workflow_runs: [] }))).resolves.toBeNull();
    const request = async (path: string) => {
      if (path === 'actions/runs/123') return run;
      if (path.startsWith('actions/runs/123/artifacts?')) return { artifacts };
      if (path.startsWith('git/matching-refs/')) return [{ ref: `refs/tags/${candidate.tag}` }];
      return tagRequest(path);
    };
    const event = { repository: { full_name: repo }, action: 'completed', workflow_run: run };
    const selected = await selectTags(event, 'workflow_run', request, () => candidate.version);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ sha: candidate.sha, runId: '123' });
    await expect(selectTags(event, 'workflow_run', async (path: string) => path.startsWith('git/matching-refs/') ? [] : request(path),
      () => candidate.version)).resolves.toEqual([]);
    await expect(selectTags({ ...event, workflow_run: { ...run, run_attempt: 1 } }, 'workflow_run', request,
      () => candidate.version)).rejects.toThrow(/stale-event/);
    const chosen: unknown[] = [];
    await findBuild({ ...candidate, runId: '123' }, request, async (...args: unknown[]) => { chosen.push(args[1]); return {}; });
    expect(chosen).toEqual(['123']);
  });

  it('finds partial drafts past the first page rather than treating them as missing published releases', async () => {
    const draft = { id: 1234, tag_name: candidate.tag, draft: true };
    const request = async (path: string) => path.endsWith('page=1')
      ? Array.from({ length: 100 }, (_, index) => ({ tag_name: `v2.0.${index}` })) : [draft];
    await expect(findRelease(candidate, request)).resolves.toEqual(draft);
    await expect(findRelease(candidate, async () => [draft, draft])).rejects.toThrow(/duplicate-release/);
  });

  it('resumes only missing draft assets and never replaces a published build or uploaded bytes', () => {
    const asset = { name: 'synthetic.zip', size: 8, sha256: 'f'.repeat(64) };
    const record = { schema: 2, sha: candidate.sha, version: candidate.version, tag: candidate.tag, tagObject,
      runId: '123', attempt: '2', assets: [asset] };
    const release = { tag_name: candidate.tag, target_commitish: candidate.sha, draft: true, prerelease: false,
      body: `inspection\n<!-- ai7-windows-release-v2 ${JSON.stringify(record)} -->\n` };
    expect(readPublicationRecord(release)).toEqual(record);
    expect(releasePlan(release, record, [])).toEqual({ missing: ['synthetic.zip'], publish: true });
    const uploaded = { ...asset, state: 'uploaded', digest: `sha256:${asset.sha256}` };
    expect(releasePlan(release, record, [uploaded])).toEqual({ missing: [], publish: true });
    expect(releasePlan({ ...release, draft: false }, record, [uploaded])).toEqual({ missing: [], publish: false });
    expect(() => releasePlan({ ...release, draft: false }, record, [])).toThrow(/partial-published/);
    expect(() => releasePlan(release, { ...record, runId: '124' }, [uploaded])).toThrow(/existing-release/);
    expect(() => releasePlan(release, { ...record, attempt: '3' }, [uploaded])).toThrow(/existing-release/);
    expect(() => releasePlan(release, { ...record, tagObject: 'a'.repeat(40) }, [uploaded])).toThrow(/existing-release/);
    for (const patch of [{ digest: `sha256:${'0'.repeat(64)}` }, { state: 'starter' }, { name: 'surprise.zip' }, { size: 9 }]) {
      expect(() => releasePlan(release, record, [{ ...uploaded, ...patch }])).toThrow(/release-assets/);
    }
    expect(() => releasePlan(release, record, [uploaded, uploaded])).toThrow(/release-assets/);
    const args = draftArguments(candidate, [], resolve('notes.md'));
    expect(args).toEqual(expect.arrayContaining(['--draft', '--verify-tag']));
    expect(args).not.toContain('--prerelease');
    expect(draftArguments({ ...candidate, version: '1.0.0-rc.1' }, [], resolve('notes.md'))).toEqual(expect.arrayContaining(['--prerelease', '--latest=false']));
    expect(args).not.toContain('--clobber');
  });

  it('verifies durable Windows-only published assets without requiring expired nightly archives', async () => {
    const bound = { ...candidate, tagObject };
    const assetRecords = publicationNames(candidate.version).map((name: string) => ({ name, size: 8, sha256: 'f'.repeat(64) }));
    const record = { schema: 2, sha: candidate.sha, version: candidate.version, tag: candidate.tag, tagObject, identity,
      workflowSha: run.head_sha, runId: '123', attempt: '2', assets: assetRecords,
      artifacts: artifacts.map(({ id, name, digest }) => ({ id, name, digest })) };
    const release = { id: 25, tag_name: candidate.tag, target_commitish: candidate.sha, draft: false, prerelease: false,
      body: `Windows\n<!-- ai7-windows-release-v2 ${JSON.stringify(record)} -->\n` };
    const uploaded = assetRecords.map((asset: { name: string; size: number; sha256: string }) =>
      ({ ...asset, state: 'uploaded', digest: `sha256:${asset.sha256}` }));
    const paths: string[] = [];
    const request = async (path: string) => {
      paths.push(path);
      if (path.startsWith('releases/25/assets?')) return uploaded;
      if (path.startsWith('git/')) return tagRequest(path);
      throw new Error('Published retries must not depend on ephemeral nightly evidence');
    };
    await expect(reconcilePublished(release, bound, identity, request)).resolves.toBe(true);
    expect(paths.some((path) => path.startsWith('actions/'))).toBe(false);
    expect(publicationNames(candidate.version)).toEqual([
      'AI7-0.1.0-win-x64-portable.zip', 'AI7-0.1.0-win-x64-setup.exe', 'SHA256SUMS-win-x64.txt', 'provenance-win-x64.json',
    ]);
    expect(() => verifyPublicationRecord({ ...record, assets: [...assetRecords, { name: 'mac.dmg', size: 8, sha256: 'f'.repeat(64) }] }, bound, identity)).toThrow();
    expect(() => verifyPublicationRecord({ ...record, identity: { ...identity, dataVersion: 2 } }, bound, identity)).toThrow();
    expect(() => verifyPublicationRecord({ ...record, artifacts: [record.artifacts[0], record.artifacts[0]] }, bound, identity)).toThrow();
    await expect(reconcilePublished(release, { ...bound, tagObject: 'f'.repeat(40) }, identity, request)).rejects.toThrow();
    await expect(reconcilePublished(release, bound, identity, async (path: string) => path.startsWith('releases/') ? uploaded.slice(1) : request(path)))
      .rejects.toThrow(/partial-published/);
    await expect(reconcilePublished({ ...release, draft: true }, bound, identity, request)).resolves.toBe(false);
  });
});

describe('explicit packaging and byte verification', () => {
  it('refuses dirty/wrong-head checkouts and version drift', async () => withFixture(async (root) => {
    await fixture(root, 'win32');
    const cleanGit = (args: string[]) => args[0] === 'rev-parse' ? candidate.sha : '';
    await expect(verifyCheckout(root, candidate, cleanGit)).resolves.toHaveProperty('version', candidate.version);
    await expect(verifyCheckout(root, candidate, () => 'wrong')).rejects.toThrow(/checkout/);
    await expect(verifyCheckout(root, candidate, (args: string[]) => args[0] === 'rev-parse' ? candidate.sha : ' M file')).rejects.toThrow(/dirty/);
    await expect(verifyCheckout(root, { ...candidate, version: '1.0.0' }, cleanGit)).rejects.toThrow(/version/);
  }));

  it('verifies the archive digest before parsing an exact allowlisted entry set', async () => withFixture(async (root) => {
    const path = join(root, 'synthetic.zip');
    await writeFile(path, 'synthetic archive');
    const digest = `sha256:${createHash('sha256').update('synthetic archive').digest('hex')}`;
    await expect(verifyArchive(path, { digest })).resolves.toBeUndefined();
    await expect(verifyArchive(path, { digest: `sha256:${'a'.repeat(64)}` })).rejects.toThrow(/archive-digest/);
    expect(() => verifyArchiveEntries(['one', 'two'], ['two', 'one'])).not.toThrow();
    for (const entries of [['../one', 'two'], ['one', 'one'], ['one'], ['one', 'two', 'other']]) {
      expect(() => verifyArchiveEntries(entries, ['one', 'two'])).toThrow(/archive-entries/);
    }
  }));

  it('stages complete fresh assets and rejects run/source/input drift, tampering, missing or extra files', async () => withFixture(async (root) => {
    const download = join(root, 'download');
    await mkdir(download);
    for (const platform of ['win32']) {
      const source = join(root, platform);
      await mkdir(source);
      await fixture(source, platform);
      const files = await stageAssets(source, candidate, platform, workflowRun, identityReader);
      for (const file of files) await copyFile(file, join(download, basename(file)));
    }
    const source = join(root, 'win32');
    const verify = (selectedRun = workflowRun) => verifyDownloads(source, download, candidate, selectedRun, identityReader);
    const files = await verify();
    expect(files).toHaveLength(4);
    for (const patch of [{ attempt: '1' }, { id: '124' }, { workflowSha: candidate.sha }]) {
      await expect(verify({ ...workflowRun, ...patch })).rejects.toThrow(/provenance/);
    }
    const provenance = join(download, 'provenance-win-x64.json');
    const original = await readFile(provenance, 'utf8');
    for (const patch of [{ identity: { ...identity, buildNumber: 123 } }, { signed: true }, { inputs: {} }]) {
      await writeFile(provenance, JSON.stringify({ ...JSON.parse(original), ...patch }));
      await expect(verify()).rejects.toThrow(/provenance/);
    }
    await writeFile(provenance, original);
    await writeFile(join(download, 'unexpected.txt'), 'synthetic');
    await expect(verify()).rejects.toThrow(/unexpected-download/);
    await rm(join(download, 'unexpected.txt'));
    await writeFile(files[0], 'changed package');
    await expect(verify()).rejects.toThrow(/digest/);
    await rm(files[0]);
    await expect(verify()).rejects.toThrow();
  }));

  it.each(['self-check.txt', 'stale-package.zip', 'AI7/data/synthetic.txt'])('refuses residual output %s', async (name) => withFixture(async (root) => {
    await fixture(root, 'win32');
    await expect(requireEmptyRelease(root)).rejects.toThrow(/stale-output/);
    await writeFile(join(root, 'release', name), 'synthetic');
    await expect(stageAssets(root, candidate, 'win32', workflowRun, identityReader)).rejects.toThrow();
  }));

  it('refuses redirected release directories and hard-linked output', async () => withFixture(async (root) => {
    await mkdir(join(root, 'redirect'));
    await symlink(join(root, 'redirect'), join(root, 'release'), 'junction');
    await expect(requireEmptyRelease(root)).rejects.toThrow(/directory/);
    await rm(join(root, 'release'));
    await fixture(root, 'win32');
    await link(join(root, 'release', assetNames(candidate.version, 'win32')[0].source), join(root, 'outside-link'));
    await expect(stageAssets(root, candidate, 'win32', workflowRun, identityReader)).rejects.toThrow(/asset/);
  }));
});

describe('workflow delivery structure', () => {
  const workflows = new URL('../../.github/workflows/', import.meta.url);
  it('packages Windows only, after the final Windows Gate, using its one resolved SHA', async () => {
    const queue = await readFile(new URL('e2e-nightly-queue.yml', workflows), 'utf8');
    const resolution = queue.split('\n  resolve:')[1]!.split('\n  dev:')[0]!;
    const gate = queue.split('\n  dev:')[1]!.split('\n  package:')[0]!;
    const packages = queue.split('\n  package:')[1]!;
    expect(resolution).toContain('needs: candidates');
    expect(resolution).toContain('node tools/release.mjs resolve');
    expect(gate).toContain('ref: ${{ needs.resolve.outputs.sha }}');
    expect(gate).not.toContain('eligible');
    expect(packages).toContain('needs: [resolve, dev]');
    expect(packages).toContain("needs.dev.result == 'success'");
    expect(packages).toContain("needs.resolve.outputs.eligible == 'true'");
    expect(packages).toContain('ref: ${{ needs.resolve.outputs.sha }}');
    expect(packages).not.toContain('ref: refs/heads/dev');
    expect(packages).not.toContain('secrets:');
    expect(packages).not.toMatch(/: write/);
    expect(packages).toContain('overwrite: false');
    expect(packages).toContain('${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.platform }}');
    expect(packages).not.toContain('mac-arm64'); // ADR 0097
    expect(packages).not.toContain('macos-15');
  });

  it('publishes without a build, provider secret, tag creation, or PR-candidate trigger', async () => {
    const text = await readFile(new URL('release.yml', workflows), 'utf8');
    expect(text).toContain("tags: ['v*']");
    expect(text).toContain('workflows: [E2E Nightly Merge Queue]');
    expect(text).toContain('types: [completed]');
    expect(text).toContain('branches: [dev]');
    expect(text).toContain('ref: ${{ needs.select.outputs.controller }}');
    expect(text).toContain('group: ai7-windows-publication-${{ matrix.tag }}');
    expect(text).not.toMatch(/pnpm|bootstrap|release:prepare|pull_request:|secrets:|workflow_dispatch:/);
    expect(text.match(/contents: write/g)).toHaveLength(1);
    expect(text).not.toContain("workflow_run.conclusion == 'success'");
    for (const file of ['release.yml', 'e2e-nightly-queue.yml', 'e2e-nightly.yml']) {
      const source = await readFile(new URL(file, workflows), 'utf8');
      for (const action of source.matchAll(/uses: (actions\/[^\s]+)@([^\s]+)/g)) expect(action[2]).toMatch(/^[a-f0-9]{40}$/);
    }
  });

  it('gives all existing product build consumers complete Git history', async () => {
    for (const file of ['e2e.yml', 'e2e-candidate.yml', 'e2e-nightly.yml', 'e2e-nightly-queue.yml']) {
      const source = await readFile(new URL(file, workflows), 'utf8');
      for (const job of source.split(/\n  [a-z][a-z-]*:\n/u)) {
        if (!/run: pnpm run build|run: pnpm run release:prepare/.test(job)) continue;
        expect(job, file).toContain('fetch-depth: 0');
        expect(job, file).not.toContain('fetch-depth: 1');
      }
    }
  });
});
