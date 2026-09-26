import { resolve } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';

const faults = vi.hoisted(() => ({
  probe: false, promote: false, rollback: false, cleanup: false, finalExists: false, backedUp: false,
}));
vi.mock('node:fs', () => ({
  existsSync: (path: string) => {
    if (path.includes('.electron-backup-')) return faults.backedUp;
    if (/electron-43\.4\.1-/u.test(path)) return faults.finalExists;
    return true;
  },
}));
vi.mock('node:fs/promises', () => ({
  mkdir: async () => undefined,
  mkdtemp: async (prefix: string) => `${prefix}test`,
  realpath: async (path: string) => path,
  stat: async () => ({ isFile: () => true, size: 1 }),
  writeFile: async () => undefined,
  rm: async () => {
    if (faults.cleanup) throw Object.assign(new Error('private cleanup path'), { code: 'EBUSY' });
  },
  rename: async (from: string, to: string) => {
    if (to.includes('.electron-backup-')) { faults.backedUp = true; faults.finalExists = false; return; }
    if (from.includes('.electron-staging-') && faults.promote) throw Object.assign(new Error('private promotion path'), { code: 'EACCES' });
    if (from.includes('.electron-backup-') && faults.rollback) throw Object.assign(new Error('private rollback path'), { code: 'EPERM' });
    faults.finalExists = true;
  },
}));
vi.mock('node:child_process', () => ({
  spawnSync: (_executable: string, args: string[]) => args[0] !== '-e' ? { status: 0 } : {
    status: faults.probe ? 1 : 0,
    stdout: JSON.stringify({ electron: '43.4.1', node: '24.18.1', modules: '148', sqlite: '3.50.0', fts5: true }),
    stderr: 'private child output',
  },
}));

const runtimeModule = '../../tools/electron-runtime.mjs';
const runtime = await import(runtimeModule) as {
  materializeElectronRuntime(input: { archive: string; artifact: unknown; environment: NodeJS.ProcessEnv }): Promise<{ adapter: string }>;
};
const input = () => ({
  archive: resolve('declared.zip'), environment: process.env,
  artifact: { id: 'electron', sha256: 'a'.repeat(64), requiredNoticeFiles: [
    { id: 'electron-license', relativePath: 'LICENSE' },
    { id: 'electron-chromium-notices', relativePath: 'LICENSES.chromium.html' },
  ] },
});
beforeEach(() => Object.assign(faults, { probe: false, promote: false, rollback: false, cleanup: false, finalExists: false, backedUp: false }));

it('retains the initiating probe failure when staging cleanup also fails', async () => {
  faults.probe = true;
  faults.cleanup = true;
  const error: unknown = await runtime.materializeElectronRuntime(input()).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(Error);
  if (!(error instanceof Error)) throw new Error('Expected materialization failure');
  expect(error.message).toBe('ELECTRON_MATERIALIZATION/probe/unclassified ELECTRON_CLEANUP/EBUSY');
  expect(error.cause).toBeInstanceOf(Error);
  expect(error.message).not.toContain('private');
});

it('reports promotion, rollback and cleanup separately without masking promotion', async () => {
  Object.assign(faults, { finalExists: true, promote: true, rollback: true, cleanup: true });
  await expect(runtime.materializeElectronRuntime(input())).rejects.toThrow(
    'ELECTRON_MATERIALIZATION/promote/EACCES ELECTRON_ROLLBACK/EPERM ELECTRON_CLEANUP/EBUSY',
  );
});

it('keeps successful materialization successful', async () => {
  await expect(runtime.materializeElectronRuntime(input())).resolves.toMatchObject({ adapter: process.platform === 'win32' ? 'windows-system-tar' : 'macos-system-ditto' });
});
