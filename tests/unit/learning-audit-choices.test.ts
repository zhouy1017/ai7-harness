import { describe, expect, it } from 'vitest';
import {
  LEARNING_AUDIT_BOOK_CHOICE_BYTES,
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
    expect(learningAuditChoices(books(3), series(2))).toEqual({ books: books(3), booksTruncated: false, series: series(2), seriesTruncated: false });
    expect(learningAuditChoices([], [])).toEqual({ books: [], booksTruncated: false, series: [], seriesTruncated: false });
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
    // At their fullest, both lists and the half frame a page may take still fit one frame with room for the envelope.
    expect(wire(long) + MAX_FRAME_BYTES / 2 + 4_096).toBeLessThan(MAX_FRAME_BYTES);
  });
});
