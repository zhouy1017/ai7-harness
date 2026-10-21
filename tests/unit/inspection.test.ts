import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { defaultInspectionRoot, inspect, parseInspectionArguments, requireExternalInspectionRoot } from '../../tools/inspect.mjs';

describe('quick provider-free inspection', () => {
  it('build-only awaits the existing build owner without calculating data paths or launching', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const defaultRoot = vi.fn(() => { throw new Error('must not select data'); });
    await inspect(['--build-only'], { run, defaultRoot, codeRoot: resolve('checkout'), log: vi.fn() });
    expect(run.mock.calls).toEqual([[[resolve('checkout/tools/build-controller.mjs')]]]);
    expect(defaultRoot).not.toHaveBeenCalled();
  });

  it('waits for the build, then delegates readiness and exit to start-built in development-ci', async () => {
    const events: string[] = [];
    const run = vi.fn(async (args: string[]) => { events.push(args[0]!); });
    const dataRoot = resolve('external-data');
    await inspect(['--', '--data-root', dataRoot], { run, codeRoot: resolve('checkout'),
      externalRoot: async () => dataRoot, log: vi.fn() });
    expect(events).toEqual([resolve('checkout/tools/build-controller.mjs'), resolve('checkout/tools/start-built.mjs')]);
    expect(run.mock.calls[1]![0]).toEqual([resolve('checkout/tools/start-built.mjs'), '--data-root', dataRoot,
      '--trusted-operational-scope', 'development-ci']);
  });

  it('never launches after a build failure or invalid root', async () => {
    const run = vi.fn().mockRejectedValue(new Error('synthetic build failure'));
    await expect(inspect(['--data-root', resolve('external')], { run, externalRoot: async () => resolve('external') })).rejects.toThrow();
    expect(run).toHaveBeenCalledTimes(1);
    run.mockClear();
    await expect(inspect([], { run, defaultRoot: () => resolve('external'), externalRoot: async () => { throw new Error('invalid'); } })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
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
    const root = await mkdtemp(join(tmpdir(), 'ai7-inspection-test-'));
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
