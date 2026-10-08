import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 定价与首印 in the market section (Issue #429, plan slice S81b2; V2-UX-EVAL-010; the Owner's
// answer of 2026-10-07: 「按本社已出版同类书的实际数据统计」) over the real store: no range until 设置 › 评估校准与预测's switch is on
// and thirty published Books carry actuals; then the middle half and the median of the house's other published Books' actuals,
// and of its own 书系's where it has any — the Book itself never counted, no model involved. Manuscripts are composed from the
// one admitted SampleBook and no assertion reads their text; prices and print runs are the suite's own.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 24, title: '定价组稿' };

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-evaluation-market-');
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore, distinct: boolean): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: distinct ? 'new-book-distinct-intended-work' : 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** 设为发稿版本 over a milestone, then 录入定价与首印 for it. */
async function publishWithActuals(store: EditorialStore, book: Imported, priceFen: number, firstPrint: number): Promise<void> {
  const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '发稿稿', 'delivery-candidate', null, '');
  expect(store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版', basis: '三审通过' }).outcome).toBe('designated');
  const focused = store.inspectEvaluationCalibration({ after: null, focusBookId: book.bookId }).focusedBook!;
  store.recordPublicationActuals({ bookId: book.bookId, publicationVersionId: focused.publicationVersionId, expectedEntries: 0, priceFen, firstPrint });
}

function joinSeries(store: EditorialStore, seriesId: string, bookId: string): void {
  const preview = store.previewSeriesMembershipChange({ seriesId, bookId, kind: 'add' });
  store.changeSeriesMembership({ seriesId, bookId, kind: 'add', previewDigest: preview.previewDigest });
}

describe('定价与首印 in the market section over the real store', () => {
  it('shows no range before thirty published Books and the switch, then the house\'s and the 书系\'s middle half without the Book itself', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // The Book under evaluation: published too, at a price the ranges must never count.
      const evaluated = await importBook(store, false);
      await publishWithActuals(store, evaluated, 99_900, 99_000);
      const series = store.createSeries({ title: '定价书系', note: '' }).seriesId;
      joinSeries(store, series, evaluated.bookId);
      const others: Imported[] = [];
      for (let index = 1; index <= 28; index += 1) {
        const book = await importBook(store, true);
        await publishWithActuals(store, book, 3000 + index * 100, 2000 + index * 100);
        if (index <= 3) joinSeries(store, series, book.bookId);
        others.push(book);
      }
      // Twenty-nine published Books carry actuals: the prediction waits, and says for what.
      expect(store.inspectEvaluation(evaluated.bookId, null).market.pricing)
        .toEqual({ booksWithActuals: 29, threshold: 30, enabled: false, available: false, house: null, series: null });
      const thirtieth = await importBook(store, true);
      await publishWithActuals(store, thirtieth, 3000 + 29 * 100, 2000 + 29 * 100);
      // Available, but off until 设置 turns it on.
      expect(store.inspectEvaluation(evaluated.bookId, null).market.pricing)
        .toEqual({ booksWithActuals: 30, threshold: 30, enabled: false, available: true, house: null, series: null });
      store.setEvaluationPreferences({ expectedEntries: 0, predictionEnabled: true, calibrationEnabled: true });
      const market = store.inspectEvaluation(evaluated.bookId, null).market;
      // The other twenty-nine: 31.00 to 59.00 yuan and 2,100 to 4,900 copies; the middle half by linear interpolation.
      expect(market.pricing).toEqual({
        booksWithActuals: 30, threshold: 30, enabled: true, available: true,
        house: { books: 29, priceFen: { low: 3800, median: 4500, high: 5200 }, firstPrint: { low: 2800, median: 3500, high: 4200 } },
        series: { books: 3, priceFen: { low: 3150, median: 3200, high: 3250 }, firstPrint: { low: 2150, median: 2200, high: 2250 } },
      });
      // The 书系's other Books are its comparables, each published.
      expect(market.comparableCount).toBe(3);
      expect(market.comparables.every((comparable) => comparable.published && comparable.source === 'series')).toBe(true);
      expect(market.comparables.map((comparable) => comparable.bookId).sort()).toEqual(others.slice(0, 3).map((book) => book.bookId).sort());
      // Turned off again, the range is gone with it.
      store.setEvaluationPreferences({ expectedEntries: 1, predictionEnabled: false, calibrationEnabled: true });
      expect(store.inspectEvaluation(evaluated.bookId, null).market.pricing)
        .toEqual({ booksWithActuals: 30, threshold: 30, enabled: false, available: true, house: null, series: null });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 600_000);
});
