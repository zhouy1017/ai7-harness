import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildIdentityLine, currentBuildIdentity, parseBuildIdentity, requireMatchingVersions } from '../../src/shared/build-identity.js';
import { readBuiltIdentity } from '../../src/shared/read-build-identity.js';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { nativeBuildVersions, readBuildIdentity } from '../../tools/build-identity.mjs';

const identity = { schema: 1 as const, softwareVersion: '0.1.0-rc.1', dataVersion: 1,
  buildNumber: 1234, sourceCommit: 'a'.repeat(40), dirty: false };
const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function temporary() { const root = await mkdtemp(join(tmpdir(), 'ai7-build-identity-')); roots.push(root); return root; }
function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', ['-c', 'user.name=Identity Test', '-c', 'user.email=identity@example.invalid',
    '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('fixture Git command failed');
  return result.stdout.trim();
}
async function repository() {
  const root = await temporary();
  git(root, 'init', '--initial-branch=base');
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.1.0', ai7: { dataVersion: 1 } }));
  git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  return root;
}

describe('one source/build/runtime identity', () => {
  it('requires the exact manifest shape and never invents a missing identity', () => {
    expect(parseBuildIdentity(identity)).toEqual(identity);
    for (const value of [undefined, null, {}, { ...identity, extra: 1 }, { ...identity, schema: 2 },
      { ...identity, buildNumber: 0 }, { ...identity, buildNumber: Number.MAX_SAFE_INTEGER + 1 },
      { ...identity, dataVersion: 0 }, { ...identity, sourceCommit: 'abc123' }, { ...identity, dirty: 'false' },
      { ...identity, softwareVersion: '01.2.3' }, { ...identity, softwareVersion: '1.2.3-01' },
      { ...identity, softwareVersion: `1.2.3-${'x'.repeat(33)}` }]) {
      expect(() => parseBuildIdentity(value)).toThrow('AI7_BUILD_IDENTITY_INVALID');
    }
    expect(() => currentBuildIdentity()).toThrow('AI7_BUILD_IDENTITY_UNAVAILABLE');
    expect(buildIdentityLine({ ...identity, dirty: true })).toContain('本地修改（未提交）');
    expect(() => requireMatchingVersions(identity, { softwareVersion: '0.1.0', dataVersion: 1 })).toThrow('MISMATCH');
    expect(() => requireMatchingVersions(identity, { softwareVersion: identity.softwareVersion, dataVersion: 2 })).toThrow('MISMATCH');
  });

  it('counts all merge ancestors and gives a detached checkout the same identity', async () => {
    const root = await repository();
    git(root, 'checkout', '-b', 'side'); git(root, 'commit', '--allow-empty', '-m', 'side');
    git(root, 'checkout', 'base'); git(root, 'commit', '--allow-empty', '-m', 'base two');
    git(root, 'merge', '--no-ff', 'side', '-m', 'merge');
    const clean = await readBuildIdentity(root, { requireClean: true });
    expect(clean).toEqual({ schema: 1, softwareVersion: '0.1.0', dataVersion: 1, buildNumber: 4,
      sourceCommit: git(root, 'rev-parse', 'HEAD'), dirty: false });
    git(root, 'checkout', '--detach');
    vi.stubEnv('BUILD_NUMBER', '9999');
    try { expect(await readBuildIdentity(root)).toEqual(clean); } finally { vi.unstubAllEnvs(); }
    await writeFile(join(root, 'untracked.txt'), 'synthetic');
    expect(await readBuildIdentity(root)).toEqual({ ...clean, dirty: true });
    await expect(readBuildIdentity(root, { requireClean: true })).rejects.toThrow('DIRTY_SOURCE');
    git(root, 'add', 'untracked.txt');
    await expect(readBuildIdentity(root, { requireClean: true })).rejects.toThrow('DIRTY_SOURCE');
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.2.0', ai7: { dataVersion: 1 } }));
    expect(await readBuildIdentity(root)).toMatchObject({ softwareVersion: '0.2.0', dirty: true, buildNumber: 4 });
  });

  it('rejects shallow/missing Git and malformed/missing canonical package metadata', async () => {
    const root = await repository();
    git(root, 'commit', '--allow-empty', '-m', 'second');
    const shallow = join(await temporary(), 'shallow');
    git(root, 'clone', '--depth=1', pathToFileURL(root).href, shallow);
    await expect(readBuildIdentity(shallow)).rejects.toThrow('SHALLOW_HISTORY');
    await expect(readBuildIdentity(await temporary())).rejects.toThrow('GIT_UNAVAILABLE');
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.1.0' }));
    await expect(readBuildIdentity(root)).rejects.toThrow('IDENTITY_INVALID');
    await writeFile(join(root, 'package.json'), 'null');
    await expect(readBuildIdentity(root)).rejects.toThrow('PACKAGE_INVALID');
    await rm(join(root, 'package.json'));
    await expect(readBuildIdentity(root)).rejects.toThrow('PACKAGE_INVALID');
  });

  it('loads persisted identity only if every field agrees with the built code', async () => {
    const root = await temporary();
    await expect(readBuiltIdentity(root, identity)).rejects.toThrow('UNAVAILABLE');
    await writeFile(join(root, 'build-identity.json'), JSON.stringify(identity));
    expect(await readBuiltIdentity(root, identity)).toEqual(identity);
    for (const altered of [{ ...identity, sourceCommit: 'b'.repeat(40) }, { ...identity, dirty: true },
      { ...identity, buildNumber: 1235 }, { ...identity, softwareVersion: '0.1.0' }, { ...identity, dataVersion: 2 }]) {
      await expect(readBuiltIdentity(root, altered)).rejects.toThrow('MISMATCH');
    }
    await writeFile(join(root, 'build-identity.json'), '{');
    await expect(readBuiltIdentity(root, identity)).rejects.toThrow('UNAVAILABLE');
  });

  it('keeps prerelease SemVer separate from numeric native fields and fails rather than wrapping', () => {
    expect(nativeBuildVersions(identity)).toEqual({ windowsVersion: '0.1.0.1234', macShortVersion: '0.1.0', macBundleVersion: '1.12.34' });
    for (const n of [1, 99, 100, 9999, 10000, 65535]) {
      const native = nativeBuildVersions({ ...identity, buildNumber: n });
      const [a, b, c] = native.macBundleVersion.split('.').map(Number);
      expect((a - 1) * 10000 + b * 100 + c).toBe(n);
      expect(native.macBundleVersion).toMatch(/^[1-9][0-9]{0,3}\.[0-9]{1,2}\.[0-9]{1,2}$/u);
      expect(native.windowsVersion).toBe(`0.1.0.${n}`);
    }
    expect(() => nativeBuildVersions({ ...identity, buildNumber: 65536 })).toThrow('WINDOWS_VERSION_OVERFLOW');
  });
});
