import { describe, expect, it } from 'vitest';
import {
  LEARNING_AUDIT_BOOK_CHOICE_BYTES,
  LEARNING_AUDIT_ENVELOPE_BYTES,
  LEARNING_AUDIT_SERIES_CHOICE_BYTES,
  learningAuditChoices,
} from '../../src/service/learning-eligibility.js';
import { MAX_FRAME_BYTES, MAX_LEARNING_AUDIT_BOOK_CHOICES, MAX_LEARNING_AUDIT_SERIES_CHOICES } from '../../src/shared/protocol.js';

// Unit suite (L1) for 学习回溯's filter choices (Issue #677): the house's Books and Series, answered with every page, each list
// cut at its count bound or its share of the frame, whichever comes first, and saying when it was cut.

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const books = (count: number, title: (n: number) => string = (n) => `书${n}`) =>
  Array.from({ length: count }, (_, n) => ({ bookId: id(n), title: title(n) }));
const series = (count: number, title: (n: number) => string = (n) => `书系${n}`) =>
  Array.from({ length: count }, (_, n) => ({ seriesId: id(n), title: title(n) }));
const wire = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

describe('学习回溯 filter choices', () => {
  it('offers every Book and Series of a house within the bounds, in the order read, and says nothing was cut', () => {
    expect(learningAuditChoices(books(3), series(2)))
      .toEqual({ books: books(3), booksListed: 3, booksTruncated: false, series: series(2), seriesTruncated: false, seriesUnavailable: false });
    expect(learningAuditChoices([], []))
      .toEqual({ books: [], booksListed: 0, booksTruncated: false, series: [], seriesTruncated: false, seriesUnavailable: false });
    // Exactly at the count bound is not cut.
    const atBound = learningAuditChoices(books(MAX_LEARNING_AUDIT_BOOK_CHOICES), series(MAX_LEARNING_AUDIT_SERIES_CHOICES));
    expect([atBound.books.length, atBound.booksTruncated, atBound.series.length, atBound.seriesTruncated])
      .toEqual([MAX_LEARNING_AUDIT_BOOK_CHOICES, false, MAX_LEARNING_AUDIT_SERIES_CHOICES, false]);
  });

  it('cuts each list at its count bound and says so, the other list untouched', () => {
    const cutBooks = learningAuditChoices(books(MAX_LEARNING_AUDIT_BOOK_CHOICES + 1), series(1));
    expect([cutBooks.books.length, cutBooks.booksTruncated, cutBooks.series.length, cutBooks.seriesTruncated])
      .toEqual([MAX_LEARNING_AUDIT_BOOK_CHOICES, true, 1, false]);
    expect(cutBooks.books.at(-1)).toEqual(books(MAX_LEARNING_AUDIT_BOOK_CHOICES).at(-1));
    const cutSeries = learningAuditChoices(books(1), series(MAX_LEARNING_AUDIT_SERIES_CHOICES + 1));
    expect([cutSeries.books.length, cutSeries.booksTruncated, cutSeries.series.length, cutSeries.seriesTruncated])
      .toEqual([1, false, MAX_LEARNING_AUDIT_SERIES_CHOICES, true]);
  });

  it('cuts a list of long titles at its share of the frame before its count bound, and says so', () => {
    // 180-character titles, the longest a Book may carry, three bytes each.
    const long = learningAuditChoices(books(MAX_LEARNING_AUDIT_BOOK_CHOICES, (n) => `${n}${'书'.repeat(179)}`.slice(0, 180)),
      series(MAX_LEARNING_AUDIT_SERIES_CHOICES, (n) => `${n}${'系'.repeat(39)}`.slice(0, 40)));
    expect(long.booksTruncated).toBe(true);
    expect(long.books.length).toBeGreaterThan(100);
    expect(long.books.length).toBeLessThan(MAX_LEARNING_AUDIT_BOOK_CHOICES);
    expect(long.books.reduce((sum, entry) => sum + wire(entry) + 1, 0)).toBeLessThanOrEqual(LEARNING_AUDIT_BOOK_CHOICE_BYTES);
    expect(long.seriesTruncated).toBe(true);
    expect(long.series.length).toBeLessThan(MAX_LEARNING_AUDIT_SERIES_CHOICES);
    expect(long.series.reduce((sum, entry) => sum + wire(entry) + 1, 0)).toBeLessThanOrEqual(LEARNING_AUDIT_SERIES_CHOICE_BYTES);
    // This example at its fullest stays within the two shares and the envelope allowance.
    expect(wire(long)).toBeLessThanOrEqual(LEARNING_AUDIT_BOOK_CHOICE_BYTES + LEARNING_AUDIT_SERIES_CHOICE_BYTES + LEARNING_AUDIT_ENVELOPE_BYTES);
  });

  it('fits a frame by its bounds: the page’s half (its own slack within it), both shares and the envelope allowance', () => {
    expect(LEARNING_AUDIT_BOOK_CHOICE_BYTES + LEARNING_AUDIT_SERIES_CHOICE_BYTES + MAX_FRAME_BYTES / 2 + LEARNING_AUDIT_ENVELOPE_BYTES)
      .toBeLessThanOrEqual(MAX_FRAME_BYTES);
    // The allowance holds the one chosen Book beyond the cut at the longest title a Book may carry, with room to spare.
    expect(wire({ bookId: id(0), title: '书'.repeat(180) }) * 4).toBeLessThan(LEARNING_AUDIT_ENVELOPE_BYTES);
  });

  it('follows the cut list with the Book the filter names when it lies beyond it, and counts only the cut list as listed', () => {
    const all = books(MAX_LEARNING_AUDIT_BOOK_CHOICES + 1);
    const beyond = all.at(-1)!;
    const chosen = learningAuditChoices(all, series(1), beyond);
    expect(chosen.books.length).toBe(MAX_LEARNING_AUDIT_BOOK_CHOICES + 1);
    expect(chosen.books.at(-1)).toEqual(beyond);
    expect([chosen.booksListed, chosen.booksTruncated]).toEqual([MAX_LEARNING_AUDIT_BOOK_CHOICES, true]);
    // A Book already listed is not listed twice.
    const within = learningAuditChoices(all, series(1), all[3]!);
    expect([within.books.length, within.booksListed]).toEqual([MAX_LEARNING_AUDIT_BOOK_CHOICES, MAX_LEARNING_AUDIT_BOOK_CHOICES]);
    expect(learningAuditChoices(books(2), [], books(2)[1]!).books).toEqual(books(2));
  });

  it('offers no Series, and says they could not be read, when the house’s Series are unreadable', () => {
    expect(learningAuditChoices(books(2), null))
      .toEqual({ books: books(2), booksListed: 2, booksTruncated: false, series: [], seriesTruncated: false, seriesUnavailable: true });
  });
});
