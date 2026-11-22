import { describe, expect, it, vi } from 'vitest';
import { MarkDrafts, type DraftScope, type DraftPlace } from '../../src/renderer/mark-drafts.js';

const scope: DraftScope = { bookId: 'book', manuscriptId: 'manuscript', branchId: 'branch' };
const reply: DraftPlace = { kind: 'reply', markId: 'comment' };
const creation: DraftPlace = { kind: 'annotation', range: { blockId: 'paragraph', blockDigest: 'digest', fromGrapheme: 0, toGrapheme: 2, text: '合成' } };
const deferred = () => { let resolve!: (done: boolean) => void; const promise = new Promise<boolean>(done => { resolve = done; }); return { promise, resolve }; };

describe('session-only mark drafts', () => {
  it('separates Books, manuscripts, branches, marks and exact creation places', () => {
    const drafts = new MarkDrafts();
    drafts.write(scope, reply, '公开合成回复'); drafts.write(scope, creation, '公开合成批注');
    for (const other of [{ ...scope, bookId: 'other' }, { ...scope, manuscriptId: 'other' }, { ...scope, branchId: 'other' }]) expect(drafts.list(other)).toEqual([]);
    expect(drafts.read(scope, { kind: 'reply', markId: 'other' })).toBe('');
    expect(drafts.read(scope, { ...creation, range: { ...creation.range, blockDigest: 'changed' } })).toBe('');
    expect(drafts.read(scope, { ...creation, kind: 'editor-note' })).toBe('');
    expect(drafts.list(scope).map(entry => entry.body)).toEqual(['公开合成回复', '公开合成批注']);
  });
  it('clears empty input or explicit discard, and retains words after a refused send', async () => {
    const drafts = new MarkDrafts();
    drafts.write(scope, reply, '公开合成回复');
    expect(await drafts.send(scope, reply, async () => false)).toBe(false);
    expect(drafts.read(scope, reply)).toBe('公开合成回复');
    drafts.write(scope, reply, ''); expect(drafts.list(scope)).toEqual([]);
    drafts.write(scope, creation, '公开合成批注'); drafts.discard(scope, creation);
    expect(drafts.list(scope)).toEqual([]);
  });
  it('sends once across surfaces and clears a successful send after its original surface unsubscribes', async () => {
    const drafts = new MarkDrafts(), answer = deferred(), run = vi.fn(() => answer.promise), changed = vi.fn();
    const leave = drafts.subscribe(changed);
    drafts.write(scope, reply, '公开合成回复');
    const sending = drafts.send(scope, reply, run);
    expect(drafts.send(scope, reply, run)).toBe(sending); expect(run).toHaveBeenCalledExactlyOnceWith('公开合成回复');
    leave(); const count = changed.mock.calls.length;
    answer.resolve(true); expect(await sending).toBe(true);
    expect(drafts.read(scope, reply)).toBe(''); expect(changed).toHaveBeenCalledTimes(count);
  });
  it('preserves a new draft or composition revision while a captured send finishes', async () => {
    const drafts = new MarkDrafts(), answer = deferred();
    drafts.write(scope, reply, '公开合成回复'); const sending = drafts.send(scope, reply, () => answer.promise);
    drafts.write(scope, reply, '另一条公开合成回复'); answer.resolve(true); await sending;
    expect(drafts.read(scope, reply)).toBe('另一条公开合成回复');
  });
  it('keeps words in memory without calling storage, console, status or an unrelated API', () => {
    const drafts = new MarkDrafts();
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    const storage = vi.fn(), status = vi.fn(), api = vi.fn();
    vi.stubGlobal('localStorage', { setItem: storage }); vi.stubGlobal('sessionStorage', { setItem: storage });
    try {
      drafts.write(scope, creation, '公开合成草稿'); drafts.read(scope, creation); drafts.list(scope);
      for (const spy of [...logs, storage, status, api]) expect(spy).not.toHaveBeenCalled();
    } finally { for (const spy of logs) spy.mockRestore(); vi.unstubAllGlobals(); }
  });
});
