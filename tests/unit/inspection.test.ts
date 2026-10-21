import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { defaultInspectionRoot, inspect, parseInspectionArguments, requireExternalInspectionRoot } from '../../tools/inspect.mjs';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import * as launcher from '../../tools/start-built.mjs';

afterEach(() => vi.restoreAllMocks());

describe('quick provider-free inspection', () => {
  it('build-only awaits the existing build owner without calculating data paths or launching', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const launch = vi.fn();
    const defaultRoot = vi.fn(() => { throw new Error('must not select data'); });
    await inspect(['--build-only'], { run, launch, defaultRoot, codeRoot: resolve('checkout'), log: vi.fn() });
    expect(run.mock.calls).toEqual([[[resolve('checkout/tools/build-controller.mjs')]]]);
    expect(defaultRoot).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  it('waits for the build, then delegates readiness and exit to start-built in development-ci', async () => {
    const events: string[] = [];
    const run = vi.fn(async (args: string[]) => { events.push(args[0]!); });
    const launch = vi.fn(async () => { events.push('launch'); });
    const dataRoot = resolve('external-data');
    await inspect(['--', '--data-root', dataRoot], { run, launch, codeRoot: resolve('checkout'),
      externalRoot: async () => dataRoot, log: vi.fn() });
    expect(events).toEqual([resolve('checkout/tools/build-controller.mjs'), 'launch']);
    expect(run).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith(['--data-root', dataRoot, '--trusted-operational-scope', 'development-ci']);
  });

  it('never launches after a build failure or invalid root', async () => {
    const run = vi.fn().mockRejectedValue(new Error('synthetic build failure'));
    const launch = vi.fn();
    await expect(inspect(['--data-root', resolve('external')], { run, launch, externalRoot: async () => resolve('external') })).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
    run.mockClear();
    await expect(inspect([], { run, launch, defaultRoot: () => resolve('external'), externalRoot: async () => { throw new Error('invalid'); } })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
  });

  it('uses the launcher in this process and waits for its result without an intermediate child', async () => {
    let finish!: () => void;
    const launch = vi.spyOn(launcher, 'startBuilt').mockImplementation(() => new Promise<void>((done) => { finish = done; }));
    const run = vi.fn().mockResolvedValue(undefined);
    const dataRoot = resolve('external-data');
    let settled = false;
    const inspection = inspect(['--data-root', dataRoot], { run, externalRoot: async () => dataRoot, log: vi.fn() })
      .then(() => { settled = true; });
    await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);
    expect(run).toHaveBeenCalledTimes(1); // The only child is the build controller.
    expect(launch).toHaveBeenCalledWith(['--data-root', dataRoot, '--trusted-operational-scope', 'development-ci']);
    finish();
    await inspection;
    launch.mockRejectedValue(new Error('synthetic readiness failure'));
    await expect(inspect(['--data-root', dataRoot], { run, externalRoot: async () => dataRoot, log: vi.fn() })).rejects.toThrow('synthetic readiness failure');
  });

  it('preserves bounded failure diagnostics for imported and CLI launch without starting Electron', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(launcher.startBuilt(['--invalid', 'synthetic'])).rejects.toThrow('AI7_BUILT_LAUNCH_FAILED');
    expect(report.mock.calls).toEqual([['AI7_START_FAILED/launcher']]);
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('../../tools/start-built.mjs', import.meta.url)), '--invalid', 'synthetic'],
      { encoding: 'utf8', windowsHide: true });
    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr.trim()).toBe('AI7_START_FAILED/launcher');
  });

  it.each([['--data-root', 'relative'], ['--build-only', '--data-root', resolve('external')],
    ['--build-only', '--build-only'], ['--trusted-operational-scope', 'developer-live'], ['--help', '--build-only'], ['--data-root']])(
    'refuses ambiguous or scope-changing options: %j', (...args) => expect(() => parseInspectionArguments(args)).toThrow());

  it('uses stable checkout-specific roots separate from production', () => {
    const context = { platform: 'win32', env: { LOCALAPPDATA: resolve('local') } };
    const first = defaultInspectionRoot(resolve('first'), context);
    expect(first).toContain('AI7-inspection');
    expect(first).toBe(defaultInspectionRoot(resolve('first'), context));
    expect(first).not.toBe(defaultInspectionRoot(resolve('second'), context));
    expect(() => defaultInspectionRoot(resolve('first'), { platform: 'win32', env: {} })).toThrow();
  });

  it('refuses roots inside any repository, including linked worktrees and aliases', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'ai7-inspection-test-')));
    try {
      const repo = join(root, 'other-checkout');
      await mkdir(repo);
      await writeFile(join(repo, '.git'), 'gitdir: synthetic');
      await expect(requireExternalInspectionRoot(join(repo, 'new-data'))).rejects.toThrow();
      const alias = join(root, 'alias');
      await symlink(repo, alias, 'junction');
      await expect(requireExternalInspectionRoot(join(alias, 'new-data'))).rejects.toThrow();
      expect(await requireExternalInspectionRoot(join(root, 'data'))).toBe(join(root, 'data'));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('help does not build', async () => {
    const run = vi.fn();
    await inspect(['--help'], { run, log: vi.fn() });
    expect(run).not.toHaveBeenCalled();
  });
});
