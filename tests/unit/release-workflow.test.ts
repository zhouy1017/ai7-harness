import { copyFile, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { assetNames, draftArguments, findRelease, parsePrepareArguments, releaseCandidate, requireEmptyRelease, stageAssets, verifyCheckout, verifyDownloads, verifyGate, verifyRemote, workflowCandidate } from '../../tools/release.mjs';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { parsePackageArguments } from '../../tools/package.mjs';

const candidate = releaseCandidate({ sha: 'a'.repeat(40), version: '0.1.0', gateRun: '123' });
const run = { id: 123, run_attempt: 1, repository: { full_name: 'zhouy1017/ai7-harness' },
  path: '.github/workflows/e2e-nightly.yml', event: 'workflow_dispatch', head_sha: 'b'.repeat(40),
  head_branch: 'dev', status: 'completed', conclusion: 'success', display_title: `E2E Nightly Full Gate · ${candidate.sha}` };
const jobs = ['Windows Server 2025 x64 CI', 'macOS 15 arm64'].map((label) => ({ name: `J-01 + admitted set (${label})`, status: 'completed', conclusion: 'success' }));
const workflowRun = { id: '456', attempt: '1' };

async function fixture(root: string, platform: string) {
  await mkdir(join(root, 'config'), { recursive: true });
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'pnpm-lock.yaml'), 'synthetic lock');
  await writeFile(join(root, 'config/dependency-artifacts.json'), '{}');
  await requireEmptyRelease(root);
  for (const directory of ['.builder', '.stage', '.resources', ...(platform === 'win32' ? ['AI7/data'] : [])]) {
    await mkdir(join(root, 'release', directory), { recursive: true });
  }
  for (const { source } of assetNames(candidate.version, platform)) await writeFile(join(root, 'release', source), 'synthetic package bytes');
}

describe('manual unsigned inspection draft boundaries', () => {
  it.each([
    { sha: 'dev' }, { sha: 'A'.repeat(40) }, { version: '../escape' }, { version: '1.0.0\nname=x' },
    { version: '01.0.0' }, { version: '1.0.0-beta.1' }, { gateRun: '0' }, { gateRun: '1;echo' },
  ])('rejects mutable, unsafe and mismatched identities %j', (override) => {
    expect(() => releaseCandidate({ ...candidate, ...override })).toThrow();
  });

  it('accepts reserved versions and rejects unknown, duplicate and partial command options', () => {
    expect(releaseCandidate({ ...candidate, version: '1.0.0-rc.1' }).tag).toBe('v1.0.0-rc.1');
    expect(parsePrepareArguments(['--', '--help'])).toEqual({ help: true });
    for (const args of [[], ['--sha'], ['--publish'], ['__proto__', 'x'], ['--sha', candidate.sha, '--sha', candidate.sha]]) {
      expect(() => parsePrepareArguments(args)).toThrow();
    }
    expect(parsePackageArguments(['--build-only'])).toEqual({ list: false, buildOnly: true });
    expect(parsePackageArguments([])).toEqual({ list: false, buildOnly: false });
    expect(() => parsePackageArguments(['--build-only', '--list'])).toThrow();
  });

  it('binds workflow, checked-out commit and dispatch source to dev', () => {
    const env = { RELEASE_SHA: candidate.sha, RELEASE_VERSION: candidate.version, RELEASE_GATE_RUN: candidate.gateRun,
      GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'zhouy1017/ai7-harness',
      GITHUB_REF: 'refs/heads/dev', GITHUB_SHA: candidate.sha, GITHUB_WORKFLOW_SHA: candidate.sha,
      GITHUB_RUN_ID: '456', GITHUB_RUN_ATTEMPT: '1' };
    expect(workflowCandidate(env)).toEqual(candidate);
    for (const patch of [{ GITHUB_REF: 'refs/heads/feature' }, { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) },
      { GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REPOSITORY: 'other/repo' }]) {
      expect(() => workflowCandidate({ ...env, ...patch })).toThrow();
    }
  });

  it('requires existing full Gate success for both platforms at exactly this candidate', () => {
    expect(() => verifyGate(candidate, run, jobs)).not.toThrow();
    for (const patch of [{ display_title: `E2E Nightly Full Gate · ${'c'.repeat(40)}` }, { conclusion: 'failure' },
      { path: '.github/workflows/e2e.yml' }, { repository: { full_name: 'other/repo' } }, { id: 999 }]) {
      expect(() => verifyGate(candidate, { ...run, ...patch }, jobs)).toThrow();
    }
    expect(() => verifyGate(candidate, run, [jobs[0], jobs[0]])).toThrow();
    expect(() => verifyGate(candidate, run, [jobs[0]])).toThrow();
    expect(() => verifyGate(candidate, run, [jobs[0], { ...jobs[1], conclusion: 'skipped' }])).toThrow();
  });

  it('peels an existing annotated tag and refuses moved tags or existing releases', async () => {
    const request = async (path: string) => {
      if (path.startsWith('git/ref/')) return { object: { type: 'tag', sha: 'd'.repeat(40) } };
      if (path.startsWith('git/tags/')) return { object: { type: 'commit', sha: candidate.sha } };
      if (path.startsWith('releases?')) return [];
      if (path.includes('/jobs?')) return { total_count: 2, jobs };
      return run;
    };
    await expect(verifyRemote(candidate, request)).resolves.toBeUndefined();
    await expect(verifyRemote(candidate, async (path: string) => path.startsWith('git/tags/')
      ? { object: { type: 'commit', sha: 'e'.repeat(40) } } : request(path))).rejects.toThrow(/tag/);
    for (const draft of [true, false]) {
      await expect(verifyRemote(candidate, async (path: string) => path.startsWith('releases?')
        ? [{ tag_name: candidate.tag, draft }] : request(path))).rejects.toThrow(/existing-release/);
    }
  });

  it('finds a pending draft beyond the first release page without the published-only tag endpoint', async () => {
    const draft = { id: 1234, tag_name: candidate.tag, draft: true, prerelease: true, assets: [] };
    const paths: string[] = [];
    const request = async (path: string) => {
      paths.push(path);
      if (path === 'releases?per_page=100&page=1') {
        return Array.from({ length: 100 }, (_, index) => ({ tag_name: `v2.0.${index}`, draft: false }));
      }
      if (path === 'releases?per_page=100&page=2') return [draft];
      throw new Error('Unexpected release endpoint');
    };
    await expect(findRelease(candidate, request)).resolves.toEqual(draft);
    expect(paths).toEqual(['releases?per_page=100&page=1', 'releases?per_page=100&page=2']);
    await expect(findRelease(candidate, async () => [draft, draft])).rejects.toThrow(/duplicate-release/);
    await expect(findRelease(candidate, async () => ({}))).rejects.toThrow(/releases/);
    await expect(findRelease(candidate, async () => [])).resolves.toBeNull();
  });

  it('refuses dirty/wrong-head checkouts and version drift before packaging', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ai7-release-test-')));
    try {
      await fixture(root, 'win32');
      const cleanGit = (args: string[]) => args[0] === 'rev-parse' ? candidate.sha : '';
      await expect(verifyCheckout(root, candidate, cleanGit)).resolves.toHaveProperty('version', candidate.version);
      await expect(verifyCheckout(root, candidate, () => 'wrong')).rejects.toThrow(/checkout/);
      await expect(verifyCheckout(root, candidate, (args: string[]) => args[0] === 'rev-parse' ? candidate.sha : ' M file')).rejects.toThrow(/dirty/);
      await expect(verifyCheckout(root, { ...candidate, version: '1.0.0' }, cleanGit)).rejects.toThrow(/version/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('stages only expected assets, binds provenance and detects missing/tampered/extra downloads', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ai7-release-test-')));
    try {
      const download = join(root, 'download');
      await mkdir(download);
      for (const platform of ['win32', 'darwin']) {
        const source = join(root, platform);
        await mkdir(source);
        await fixture(source, platform);
        const files = await stageAssets(source, candidate, platform, workflowRun);
        expect(files.every((file: string) => !/self-check|\.stage|\.builder/.test(file))).toBe(true);
        for (const file of files) await copyFile(file, join(download, basename(file)));
      }
      const source = join(root, 'win32');
      const files = await verifyDownloads(source, download, candidate, workflowRun);
      expect(files).toHaveLength(7);
      await expect(verifyDownloads(source, download, candidate, { ...workflowRun, attempt: '2' })).rejects.toThrow(/provenance/);
      await writeFile(join(download, 'unexpected.txt'), 'synthetic');
      await expect(verifyDownloads(source, download, candidate, workflowRun)).rejects.toThrow(/unexpected-download/);
      await rm(join(download, 'unexpected.txt'));
      await writeFile(files[0], 'changed synthetic package');
      await expect(verifyDownloads(source, download, candidate, workflowRun)).rejects.toThrow(/digest/);
      await rm(files[0]);
      await expect(verifyDownloads(source, download, candidate, workflowRun)).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each(['self-check.txt', 'stale-package.zip', 'AI7/data/synthetic.txt'])('refuses residual output %s', async (name) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ai7-release-test-')));
    try {
      await fixture(root, 'win32');
      await expect(requireEmptyRelease(root)).rejects.toThrow(/stale-output/);
      await writeFile(join(root, 'release', name), 'synthetic');
      await expect(stageAssets(root, candidate, 'win32')).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('refuses redirected release directories and hard-linked output files', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ai7-release-test-')));
    try {
      await mkdir(join(root, 'redirect'));
      await symlink(join(root, 'redirect'), join(root, 'release'), 'junction');
      await expect(requireEmptyRelease(root)).rejects.toThrow(/directory/);
      await rm(join(root, 'release'));
      await fixture(root, 'win32');
      await link(join(root, 'release', assetNames(candidate.version, 'win32')[0].source), join(root, 'outside-link'));
      await expect(stageAssets(root, candidate, 'win32')).rejects.toThrow(/asset/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('creates only a new draft against a pre-existing tag using explicit files', () => {
    const args = draftArguments(candidate, [resolve('asset.zip')], resolve('notes.md'));
    expect(args).toContain('--draft');
    expect(args).toContain('--verify-tag');
    expect(args).toContain('--prerelease');
    expect(args).toContain('--latest=false');
    expect(args).not.toContain('--clobber');
    expect(args.slice(0, 3)).toEqual(['release', 'create', 'v0.1.0']);
  });
});
