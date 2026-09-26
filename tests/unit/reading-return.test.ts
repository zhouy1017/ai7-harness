import { afterEach, describe, expect, it, vi } from 'vitest';

// A request/transaction boundary fake; J-16 exercises actual Chromium storage, restart and refusal.
function storage() {
  const records = new Map<string, unknown>();
  const reads: string[] = [];
  let failWrite = false;
  const db = {
    close() {},
    transaction(_name: string, mode: string) {
      if (failWrite && mode === 'readwrite') throw new Error('storage-unavailable');
      let aborted = false;
      const transaction = {
        oncomplete: () => {}, onabort: () => {}, onerror: () => {},
        abort() { aborted = true; queueMicrotask(() => transaction.onabort()); },
        objectStore() {
          return {
            get(key: string) {
              reads.push(key);
              const request = { result: undefined as unknown, onsuccess: () => {} };
              queueMicrotask(() => {
                request.result = records.get(key);
                request.onsuccess();
                if (!aborted) queueMicrotask(() => transaction.oncomplete());
              });
              return request;
            },
            put(value: unknown, key: string) { records.set(key, value); },
            delete(key: string) { records.delete(key); },
          };
        },
      };
      return transaction;
    },
  };
  vi.stubGlobal('indexedDB', {
    open() {
      const request = { result: db, onsuccess: () => {}, onerror: () => {}, onblocked: () => {}, onupgradeneeded: () => {} };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  });
  return { records, reads, refuseWrites: () => { failWrite = true; } };
}

const first = { manuscriptId: 'manuscript-a', branchId: 'branch-a', blockId: 'block-a', place: '第 1 段' };
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('reading return hints', () => {
  it('preserves the first unused position under concurrent attempts and reads only the requested branch', async () => {
    const fake = storage();
    const hints = await import('../../src/renderer/reading-return.js');
    const later = { ...first, blockId: 'block-b', place: '第 2 段' };
    expect(await Promise.all([hints.preserveReturnPlace(first), hints.preserveReturnPlace(later)])).toEqual([first, first]);
    expect(await hints.readReturnPlace('manuscript-b', 'branch-b')).toBeNull();
    expect(fake.reads).toEqual(['manuscript-a\nbranch-a', 'manuscript-a\nbranch-a', 'manuscript-b\nbranch-b']);
    expect(fake.records.size).toBe(1);
  });

  it('consumes only the position just reached, allowing a subsequent jump to retain its own origin', async () => {
    storage();
    const hints = await import('../../src/renderer/reading-return.js');
    await hints.preserveReturnPlace(first);
    expect(await hints.consumeReturnPlace({ ...first, blockId: 'different' })).toEqual(first);
    expect(await hints.consumeReturnPlace(first)).toBeNull();
    const later = { ...first, blockId: 'block-b' };
    expect(await hints.preserveReturnPlace(later)).toEqual(later);
  });

  it('rejects failed writes and consumption without discarding the original hint', async () => {
    const fake = storage();
    const hints = await import('../../src/renderer/reading-return.js');
    await hints.preserveReturnPlace(first);
    fake.refuseWrites();
    await expect(hints.preserveReturnPlace({ ...first, blockId: 'later' })).rejects.toThrow('返回位置');
    await expect(hints.consumeReturnPlace(first)).rejects.toThrow('返回位置');
    expect(await hints.readReturnPlace(first.manuscriptId, first.branchId)).toEqual(first);
  });

  it('refuses corrupt or oversized navigation hints rather than treating them as manuscript authority', async () => {
    const fake = storage();
    fake.records.set('manuscript-a\nbranch-a', { ...first, place: 'x'.repeat(201) });
    const hints = await import('../../src/renderer/reading-return.js');
    await expect(hints.readReturnPlace(first.manuscriptId, first.branchId)).rejects.toThrow('返回位置');
  });
});
