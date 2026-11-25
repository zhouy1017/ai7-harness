import { beforeEach, expect, it, vi } from 'vitest';

const { execFile, showMessageBox } = vi.hoisted(() => ({ execFile: vi.fn(), showMessageBox: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile }));
vi.mock('electron', () => ({ dialog: { showMessageBox } }));
import { storageMaintenance } from '../../src/main/storage-maintenance.js';

beforeEach(() => {
  execFile.mockReset();
  showMessageBox.mockReset();
});

it.each([
  [new Error('private child diagnostic'), ''],
  [null, 'unreadable child reply'],
  [null, '{"ok":false,"message":"磁盘空间不足。"}'],
])('shows a recovery message when maintenance fails (%#)', async (error, stdout) => {
  execFile.mockImplementation((_file, _args, _options, done) => done(error, stdout));
  expect(await storageMaintenance('service.js', 'test-library', 'upgrade')).toBeUndefined();
  expect(execFile.mock.calls[0]?.[2].maxBuffer).toBe(1024 * 1024);
  expect(showMessageBox).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    type: 'error', message: expect.stringMatching(/升级前的书库会安全保留。[\s\S]+test-library-backups/u),
  }));
  expect(showMessageBox.mock.calls[0]?.[0].message).not.toContain('private child diagnostic');
});
