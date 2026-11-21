import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMarksPaging, type MarksPagingHost } from '../../src/renderer/marks-paging.js';
import type { EditorialMarkAnchorProjection, ManuscriptMarksPage, ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { installMiniDom } from '../support/mini-dom.js';

// The page reads behind 显示更多 and a navigation step: no ceiling on the pages, one move however many are read, and a read that
// the editor leaves behind changes nothing (Issue #1604, review round 1).
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => { vi.restoreAllMocks(); restore(); });

const mark = (index: number): EditorialMarkAnchorProjection => ({ markId: `m${index}`, blockId: 'block', fromGrapheme: index, toGrapheme: index + 1 }) as unknown as EditorialMarkAnchorProjection;
const page = (from: number, size: number, total: number, digest = 'd'): { marks: EditorialMarkAnchorProjection[]; marksPage: ManuscriptMarksPage } => {
  const end = Math.min(total, from + size);
  return { marks: Array.from({ length: end - from }, (_, index) => mark(from + index)), marksPage: { shown: end - from, total, nextOrdinal: end < total ? end : null, digest } };
};

/** A window of `total` marks served `size` at a time, one editor window that can be replaced meanwhile. */
function hosted(total: number, size: number) {
  const first = page(0, size, total);
  let window = { manuscriptId: 'm', branchId: 'b', blocks: [{ blockId: 'block' }], journalSequence: 3, marks: first.marks, marksPage: first.marksPage } as unknown as ReturnType<MarksPagingHost['window']>;
  const sets: Array<{ held: number; page: ManuscriptMarksPage | undefined }> = [];
  const reads: number[] = [];
  const host: MarksPagingHost = {
    window: () => window,
    setMarks: (marks, _truncated, marksPage) => { sets.push({ held: marks.length, page: marksPage }); window = { ...window, marks, ...(marksPage === undefined ? {} : { marksPage }) } as typeof window; },
    read: async (input) => {
      const after = input.marks?.afterOrdinal ?? 0;
      reads.push(after);
      const served = page(after, size, total);
      return { ...window, journalSequence: 3, blocks: [{ blockId: 'block' }], marks: served.marks, marksPage: served.marksPage } as unknown as ManuscriptWindowProjection;
    },
    changed: vi.fn(), alive: () => true, focusAfter: vi.fn(), errorMessage: (_error, fallback) => fallback, setStatus: vi.fn(),
  };
  return { host, sets, reads, replace: () => { window = { ...window, marks: [...window.marks] } as typeof window; }, put: (next: unknown) => { window = next as typeof window; }, current: () => window };
}

it('reaches a mark beyond any fixed number of pages, painting the list once when it is held', async () => {
  const { host, sets, reads, current } = hosted(70 * 400, 400);
  const paging = createMarksPaging(host);
  expect(await paging.hold('m27999')).toBe(true);
  expect(reads).toHaveLength(69); expect(reads[68]).toBe(69 * 400);
  expect(current().marks.some((entry) => entry.markId === 'm27999')).toBe(true);
  // One move for the whole walk: the editor does not watch the list grow page by page.
  expect(sets).toHaveLength(1); expect(sets[0]?.held).toBe(70 * 400);
});

it('stops reading once the mark is held, and keeps the pages read until then in one move', async () => {
  const { host, sets, reads } = hosted(10 * 400, 400);
  expect(await createMarksPaging(host).hold('m1500')).toBe(true);
  expect(reads).toEqual([400, 800, 1200]); expect(sets).toHaveLength(1); expect(sets[0]?.held).toBe(1600);
});

it('stops when the editor leaves the window during the walk and changes nothing', async () => {
  const { host, sets, reads, replace } = hosted(10 * 400, 400);
  const read = host.read;
  host.read = async (input) => { const answered = await read(input); if (reads.length === 2) replace(); return answered; };
  expect(await createMarksPaging(host).hold('m3999')).toBe(false);
  expect(reads).toHaveLength(2); expect(sets).toHaveLength(0);
});

it('stops when a page makes no progress instead of reading it for ever', async () => {
  const { host, sets, reads } = hosted(4 * 400, 400);
  host.read = async (input) => { reads.push(input.marks?.afterOrdinal ?? 0); return { ...host.window(), journalSequence: 3, blocks: [{ blockId: 'block' }], marks: page(0, 400, 1600).marks, marksPage: { shown: 400, total: 1600, nextOrdinal: 400, digest: 'd' } } as unknown as ManuscriptWindowProjection; };
  expect(await createMarksPaging(host).hold('m1500')).toBe(false);
  expect(reads.length).toBeLessThan(5); expect(sets.length).toBeLessThanOrEqual(1);
});

// The editor moves to ANOTHER window while a page is on its way (review round 1, finding 1): the hold is over, whatever that window
// holds, and it reads nothing more.
function gated(total: number, size: number) {
  const made = hosted(total, size);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const read = made.host.read;
  made.host.read = async (input) => { const answered = await read(input); await gate; return answered; };
  const elsewhere = (marks: EditorialMarkAnchorProjection[], marksPage?: ManuscriptMarksPage) =>
    ({ manuscriptId: 'm', branchId: 'b', blocks: [{ blockId: 'elsewhere' }], journalSequence: 3, marks, ...(marksPage === undefined ? {} : { marksPage }) });
  return { ...made, release, elsewhere };
}

it('is over when the editor moves to a distinct window: nothing is set, nothing more is read', async () => {
  const { host, sets, reads, put, release, elsewhere } = gated(10 * 400, 400);
  const held = createMarksPaging(host).hold('m3999');
  await Promise.resolve(); put(elsewhere([]));
  release();
  expect(await held).toBe(false); expect(reads).toEqual([400]); expect(sets).toHaveLength(0);
});

it('is over when the editor moves to an overlapping window that already holds the target, which it does not select', async () => {
  const { host, sets, reads, put, release, elsewhere } = gated(10, 2);
  const held = createMarksPaging(host).hold('m4');
  await Promise.resolve(); put(elsewhere([0, 1, 2, 3, 4].map(mark)));
  release();
  expect(await held).toBe(false); expect(reads).toEqual([2]); expect(sets).toHaveLength(0);
});

it('is over when the editor moves to a window with a larger held prefix, and reads none of its pages', async () => {
  const { host, sets, reads, put, release, elsewhere } = gated(10 * 400, 400);
  const held = createMarksPaging(host).hold('m3999');
  await Promise.resolve(); put(elsewhere(Array.from({ length: 800 }, (_, index) => mark(index)), { shown: 800, total: 1600, nextOrdinal: 800, digest: 'other' }));
  release();
  expect(await held).toBe(false); expect(reads).toEqual([400]); expect(sets).toHaveLength(0);
});
