import { describe, expect, it } from 'vitest';
import { FEEDBACK_HISTORY_PAGE_BYTES, feedbackHistoryPage, feedbackReasonExcerpt } from '../../src/service/learning-eligibility.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  MAX_FEEDBACK_HISTORY_ENTRIES,
  MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES,
  MAX_FRAME_BYTES,
  type FeedbackHistoryEntryProjection,
  type FeedbackHistoryPeopleVersion,
} from '../../src/shared/protocol.js';

// 质量与学习 › 反馈历史's answer (Issue #61, S26c review): how many entries one read carries, by count and by weight, the Books
// and people versions they bring, and how much of a reason stands in the list.

const BOOK_A = '00000000-0000-4000-8000-00000000000a';
const BOOK_B = '00000000-0000-4000-8000-00000000000b';

function entry(index: number, bookId: string, peopleVersion: number, reason: string | null = null): FeedbackHistoryEntryProjection {
  const decisionId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  return {
    entryId: `proposal-decision:${decisionId}`,
    origin: 'proposal-decision',
    bookId,
    dimension: null,
    signal: '拒绝',
    reason,
    reasonState: reason === null ? 'none' : 'given',
    recordedAt: new Date(Date.UTC(2026, 8, 26) - index * 1000).toISOString(),
    peopleVersion,
    target: { kind: 'mark', bookId, manuscriptId: decisionId, branchId: decisionId, blockId: `blk_${'0'.repeat(24)}`, markId: decisionId, detached: false },
  };
}

const titles: Record<string, string> = { [BOOK_A]: '二书', [BOOK_B]: '一书' };
const bookOf = (bookId: string) => ({ bookId, title: titles[bookId]!, authors: ['周一'], editors: ['王五'] });
const versions: Record<string, FeedbackHistoryPeopleVersion[]> = {
  [BOOK_A]: [{ version: 1, authors: ['周一'], editors: ['郑三'] }, { version: 2, authors: ['周一'], editors: ['王五'] }],
  [BOOK_B]: [],
};
const peopleOf = (bookId: string, version: number) => versions[bookId]!.find((entry) => entry.version === version) ?? null;
const wire = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

describe('反馈历史 answer (Issue #61, S26c review)', () => {
  it('keeps a reason whole up to its bound and its opening beyond it', () => {
    expect(feedbackReasonExcerpt(null)).toBeNull();
    const whole = '证'.repeat(MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES);
    expect(feedbackReasonExcerpt(whole)).toBe(whole);
    // Counted in graphemes: a character outside the basic plane, or one with a combining mark, is one.
    const wide = '𠀀'.repeat(MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES + 1);
    expect(feedbackReasonExcerpt(wide)).toBe(`${'𠀀'.repeat(MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES)}…`);
    const combined = 'é'.repeat(4000);
    expect(graphemesOf(feedbackReasonExcerpt(combined)!)).toHaveLength(MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES + 1);
  });

  it('carries at most three hundred entries, newest first, with each Book and people version they bring once', () => {
    const entries = Array.from({ length: MAX_FEEDBACK_HISTORY_ENTRIES + 1 }, (_, index) => entry(index, index % 2 === 0 ? BOOK_A : BOOK_B, index % 2 === 0 ? 1 + (index % 4 === 0 ? 1 : 0) : 0));
    const read: string[] = [];
    const page = feedbackHistoryPage(entries, (bookId) => { read.push(bookId); return bookOf(bookId); }, peopleOf);
    expect(page.entries).toEqual(entries.slice(0, MAX_FEEDBACK_HISTORY_ENTRIES));
    expect(page.truncated).toBe(true);
    // Books by title, each read once; a version any kept entry is attributed to, once and in order; none for version 0.
    expect(read).toEqual([BOOK_A, BOOK_B]);
    expect(page.books.map((book) => [book.title, book.peopleVersions.map((version) => version.version)])).toEqual([['一书', []], ['二书', [1, 2]]]);
    expect(page.books[1]).toEqual({ ...bookOf(BOOK_A), peopleVersions: versions[BOOK_A] });
    const all = feedbackHistoryPage(entries.slice(0, 3), bookOf, peopleOf);
    expect([all.entries.length, all.truncated]).toEqual([3, false]);
    expect(feedbackHistoryPage([], bookOf, peopleOf)).toEqual({ books: [], entries: [], truncated: false });
  });

  it('stops by weight before the frame, whatever the entries hold, yet always carries the newest', () => {
    // Each entry near the most a reason can weigh once bounded: the answer stops at the budget, well inside a frame.
    const heavy = '字'.repeat(MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES);
    const entries = Array.from({ length: MAX_FEEDBACK_HISTORY_ENTRIES }, (_, index) => entry(index, BOOK_A, 1, `${heavy}${'长'.repeat(index % 7)}`));
    const page = feedbackHistoryPage(entries, bookOf, peopleOf);
    expect(page.truncated).toBe(true);
    expect(page.entries.length).toBeGreaterThan(100);
    expect(page.entries.length).toBeLessThan(MAX_FEEDBACK_HISTORY_ENTRIES);
    expect(page.entries).toEqual(entries.slice(0, page.entries.length));
    expect(wire(page)).toBeLessThanOrEqual(FEEDBACK_HISTORY_PAGE_BYTES + 64);
    expect(FEEDBACK_HISTORY_PAGE_BYTES).toBeLessThanOrEqual(MAX_FRAME_BYTES / 2);
    // A budget smaller than one entry still carries that one, so the newest feedback always reads.
    const tight = feedbackHistoryPage(entries, bookOf, peopleOf, 100);
    expect([tight.entries.length, tight.truncated, tight.books.length]).toEqual([1, true, 1]);
    // The Book and people version an entry brings weigh with it: a budget that fits the entry alone does not fit it with them.
    const alone = wire(entries[0]) + 1;
    expect(feedbackHistoryPage(entries.slice(0, 2), bookOf, peopleOf, alone + wire(entries[1]) + 1).entries).toHaveLength(1);
  });
});
