import { describe, expect, it } from 'vitest';
import {
  admitReadersReportExemplar,
  boundedGraphemes,
  readersReportExemplarStatement,
  readersReportExemplars,
} from '../../../../src/service/readers-reports.js';
import { seedBook, seedPublication, seededEvaluationDatabase } from '../../../support/domain/evaluation.js';
import { readersReportExemplarFixture, type ReadersReportExemplarFixture } from '../../../support/domain/readers-report-exemplars.js';

// 审稿意见 范例 over the domain relations: the house's 审稿意见 that seed a draft, read from the 发稿版本-pinned versions the editor
// admitted into 范例 (EVAL-013; Issue #429, #778). The Books, their drafts and 发稿版本 are seeded; the ledgers and the reading are
// the production ones. The words are the suite's own.

const LATER = (): string => new Date(Date.now() + 60_000).toISOString();

/** What 评估 says of the exemplars a draft for `bookId` would be seeded with. */
function exemplarsOf(fixture: ReadersReportExemplarFixture, bookId: string): { count: number; statement: string } {
  const readings = readersReportExemplars(fixture.host, bookId);
  // The statement reads only the readings it is given.
  return { count: readings.exemplars.length, statement: readersReportExemplarStatement(fixture.host as never, readings) };
}

describe('审稿意见 范例 over the domain relations', () => {
  it('seeds a draft with at most two admitted 审稿意见, by Book title, each its opening past the contract\'s bound (Issue #429)', async () => {
    const db = await seededEvaluationDatabase();
    try {
      const fixture = await readersReportExemplarFixture(db);
      // Three Books drafted first — before any admission, so each contract asks the same question — then each designated and
      // admitted; the fourth reads exactly two 范例 in `b.title COLLATE BINARY` order: 丙 (U+4E19), 乙 (U+4E59), never 审 (U+5BA1).
      const drafted = ['审稿意见之书', '丙书', '乙书'].map((title) => {
        const bookId = seedBook(db, title);
        return { bookId, revisionDigest: fixture.draft(bookId, 'author', [`${title}的总评。`, '建议：保持现有结构。']).revisionDigest };
      });
      for (const entry of drafted) {
        seedPublication(db, entry.bookId, 1, LATER());
        expect(admitReadersReportExemplar(fixture.host, { bookId: entry.bookId, template: 'author', revisionDigest: entry.revisionDigest, expectedDecisions: 0 })
          .readersReports[0]!.admission.state).toBe('admitted');
      }
      const fourth = seedBook(db, '丁书');
      expect(exemplarsOf(fixture, fourth)).toEqual({
        count: 2, statement: '参考本社 2 份审稿意见范例：《丙书 · 审稿意见 · 给作者的修改意见》、《乙书 · 审稿意见 · 给作者的修改意见》',
      });
      // Each admitting Book still takes none of its own, and the two the fourth takes are the other two Books' when it is 审稿意见之书.
      expect(exemplarsOf(fixture, drafted[0]!.bookId)).toEqual({
        count: 2, statement: '参考本社 2 份审稿意见范例：《丙书 · 审稿意见 · 给作者的修改意见》、《乙书 · 审稿意见 · 给作者的修改意见》',
      });
      // The opening a 范例 hands the contract: whole graphemes, never a split combining mark, cut at the bound.
      expect(boundedGraphemes(`${'á'.repeat(3)}bcd`, 4)).toBe(`${'á'.repeat(3)}b`);
      expect(boundedGraphemes('短', 4_000)).toBe('短');
    } finally { db.close(); }
  });
});
