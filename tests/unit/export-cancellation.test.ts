import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeAtomically } from '../../src/service/manuscript-export.js';

// A stop asked for while an export checks its destination, the last await before the file is put in place (Issue #434
// review, V2-UX-EXP-011): the write is cancelled there, nothing is published, and nothing is left beside the destination.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, lstat: vi.fn(actual.lstat) };
});

const PAYLOAD = new TextEncoder().encode('AI7 export payload');
const digest = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'ai7-export-cancellation-'));
});
afterEach(async () => {
  vi.mocked(lstat).mockReset();
  await rm(folder, { recursive: true, force: true });
});

describe('a stop just before an export commits', () => {
  it('is honoured when it comes while the destination is checked: nothing is published and no stage is left', async () => {
    const destination = join(folder, '数据库.ai7db');
    const controller = new AbortController();
    const { lstat: realLstat } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(lstat).mockImplementation(async (path, ...rest) => {
      if (String(path) === destination) controller.abort();
      return (realLstat as (...args: unknown[]) => ReturnType<typeof realLstat>)(path, ...rest);
    });
    let committed = false;
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'create', randomUUID(), null, {
      signal: controller.signal,
      onCommit: () => { committed = true; },
    });
    expect(written).toEqual({ outcome: 'failed', code: 'EXPORT_CANCELLED' });
    expect([committed, await readdir(folder)]).toEqual([false, []]);
  });
});
