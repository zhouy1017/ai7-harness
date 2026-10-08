import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { EVALUATION_CALIBRATION_TRIGGER_SQL } from '../../src/service/evaluation-calibration.js';
import { SERIES_TRIGGER_SQL } from '../../src/service/series.js';
import { EditorialStore } from '../../src/service/store.js';
import { MIN_SERIES_PREDICTION_BOOKS, type EvaluationPricingProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 定价与首印 in the market section (Issue #429, plan slice S81b2; V2-UX-EVAL-010; the Owner's
// answer of 2026-10-07: 「按本社已出版同类书的实际数据统计」) over the real store: no range until 设置 › 评估校准与预测's switch is on
// and thirty other published Books carry actuals; then the middle half and the median of the house's other published Books'
// actuals, and of its own 书系's over five or more of them — the Book itself never counted, in the range or the gate, no model
// involved; and a damaged entry of another Book or of the 书系 leaves 评估 readable and a save reported as saved. Manuscripts are composed from the
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

/** The pricing the market section shows, with the fields every case leaves as they are filled in. */
function pricing(fields: Partial<EvaluationPricingProjection>): EvaluationPricingProjection {
  return {
    booksWithActuals: 0, otherBooksWithActuals: 0, threshold: 30, enabled: false, available: false, unreadable: false,
    house: null, series: null, seriesBooksWithActuals: null, seriesMinimum: MIN_SERIES_PREDICTION_BOOKS, ...fields,
  };
}

const databasePath = (): string => join(roots.dataRoot, 'store', 'ai7.sqlite');

describe('定价与首印 in the market section over the real store', () => {
  it('shows no range before thirty other published Books and the switch, then the house\'s middle half, and the 书系\'s only over five of its Books', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let evaluated: Imported;
    let others: Imported[];
    let seriesId: string;
    try {
      // The Book under evaluation: published too, at a price the ranges — and the gate they wait on — must never count.
      evaluated = await importBook(store, false);
      await publishWithActuals(store, evaluated, 99_900, 99_000);
      seriesId = store.createSeries({ title: '定价书系', note: '' }).seriesId;
      joinSeries(store, seriesId, evaluated.bookId);
      others = [];
      for (let index = 1; index <= 28; index += 1) {
        const book = await importBook(store, true);
        await publishWithActuals(store, book, 3000 + index * 100, 2000 + index * 100);
        if (index <= 3) joinSeries(store, seriesId, book.bookId);
        others.push(book);
      }
      // Twenty-nine published Books carry actuals: the prediction waits, and says for what.
      expect(store.inspectEvaluation(evaluated.bookId, null).market.pricing).toEqual(pricing({ booksWithActuals: 29, otherBooksWithActuals: 28 }));
      const thirtieth = await importBook(store, true);
      await publishWithActuals(store, thirtieth, 3000 + 29 * 100, 2000 + 29 * 100);
      others.push(thirtieth);
      // Available, but off until 设置 turns it on.
      expect(store.inspectEvaluation(evaluated.bookId, null).market.pricing)
        .toEqual(pricing({ booksWithActuals: 30, otherBooksWithActuals: 29, available: true }));
      store.setEvaluationPreferences({ expectedEntries: 0, predictionEnabled: true, calibrationEnabled: true });
      // On — but the Book itself makes the thirtieth: the other twenty-nine are not enough for a range over them.
      expect(store.inspectEvaluation(evaluated.bookId, null).market.pricing)
        .toEqual(pricing({ booksWithActuals: 30, otherBooksWithActuals: 29, available: true, enabled: true }));
      const thirtyFirst = await importBook(store, true);
      await publishWithActuals(store, thirtyFirst, 3000 + 30 * 100, 2000 + 30 * 100);
      others.push(thirtyFirst);
      let market = store.inspectEvaluation(evaluated.bookId, null).market;
      // The other thirty: 31.00 to 60.00 yuan and 2,100 to 5,000 copies; the middle half by linear interpolation. The 书系 holds
      // three of them, too few for a range: only their count shows.
      expect(market.pricing).toEqual(pricing({
        booksWithActuals: 31, otherBooksWithActuals: 30, available: true, enabled: true,
        house: { books: 30, priceFen: { low: 3825, median: 4550, high: 5275 }, firstPrint: { low: 2825, median: 3550, high: 4275 } },
        seriesBooksWithActuals: 3,
      }));
      // The 书系's other Books are its comparables, each published.
      expect(market.seriesUnreadable).toBe(false);
      expect(market.comparableCount).toBe(3);
      expect(market.comparables.every((comparable) => comparable.published && comparable.source === 'series')).toBe(true);
      expect(market.comparables.map((comparable) => comparable.bookId).sort()).toEqual(others.slice(0, 3).map((book) => book.bookId).sort());
      // Five of the 书系's Books: now its own range shows, over them alone.
      joinSeries(store, seriesId, others[3]!.bookId);
      joinSeries(store, seriesId, others[4]!.bookId);
      market = store.inspectEvaluation(evaluated.bookId, null).market;
      expect([market.pricing.seriesBooksWithActuals, market.pricing.series]).toEqual([5, {
        books: 5, priceFen: { low: 3200, median: 3300, high: 3400 }, firstPrint: { low: 2200, median: 2300, high: 2400 },
      }]);
      expect(market.comparableCount).toBe(5);
      // Turned off again, the range is gone with it.
      store.setEvaluationPreferences({ expectedEntries: 1, predictionEnabled: false, calibrationEnabled: true });
      expect(store.inspectEvaluation(evaluated.bookId, null).market.pricing)
        .toEqual(pricing({ booksWithActuals: 31, otherBooksWithActuals: 30, available: true }));
      store.setEvaluationPreferences({ expectedEntries: 2, predictionEnabled: true, calibrationEnabled: true });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // Another Book's actuals entry and the 书系's own record, damaged.
    const database = new DatabaseSync(databasePath());
    try {
      const damage = (table: string, key: string, id: string): void => {
        database.exec(`DROP TRIGGER ${table}_no_update`);
        database.prepare(`UPDATE ${table} SET canonical_json = canonical_json || ' ' WHERE ${key} = ?`).run(id);
        database.exec((table === 'series' ? SERIES_TRIGGER_SQL : EVALUATION_CALIBRATION_TRIGGER_SQL)[`${table}_no_update`]!);
      };
      const actual = database.prepare('SELECT actual_id FROM publication_actuals WHERE book_id = ?').get(others![10]!.bookId) as { actual_id: string };
      damage('publication_actuals', 'actual_id', actual.actual_id);
    } finally {
      database.close();
    }
    const damaged = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // 评估 of this Book stays readable: 定价与首印 says it could not read the house data, and the 书系 still lists.
      const page = damaged.inspectEvaluation(evaluated!.bookId, null);
      expect(page.market.pricing).toEqual(pricing({ unreadable: true }));
      expect([page.market.seriesUnreadable, page.market.comparableCount]).toEqual([false, 5]);
      // A save goes through, and says so: the page after it is built from the same guarded reads.
      const started = damaged.startEvaluation(evaluated!.bookId).record!;
      const saved = damaged.saveEvaluation({
        bookId: evaluated!.bookId, recordId: started.recordId, expectedEntries: started.entries,
        content: { ...started.content, verdict: '本社数据损坏时照常保存。' }, finalize: false,
      });
      expect([saved.record!.entries, saved.record!.content.verdict, saved.market.pricing.unreadable]).toEqual([started.entries + 1, '本社数据损坏时照常保存。', true]);
      damaged.markCleanShutdown();
    } finally {
      damaged.close();
    }
    const again = new DatabaseSync(databasePath());
    try {
      again.exec('DROP TRIGGER series_no_update');
      again.prepare("UPDATE series SET canonical_json = canonical_json || ' ' WHERE series_id = ?").run(seriesId!);
      again.exec(SERIES_TRIGGER_SQL.series_no_update!);
    } finally {
      again.close();
    }
    const unreadSeries = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const page = unreadSeries.inspectEvaluation(evaluated!.bookId, null);
      expect([page.market.seriesUnreadable, page.market.series, page.market.comparables, page.market.comparableCount]).toEqual([true, [], [], 0]);
      expect(page.record!.content.verdict).toBe('本社数据损坏时照常保存。');
      unreadSeries.markCleanShutdown();
    } finally {
      unreadSeries.close();
    }
  }, 900_000);

  it('shows no range while fewer than thirty published Books carry actuals, even with a switch recorded on', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    try {
      const book = await importBook(store, false);
      bookId = book.bookId;
      const other = await importBook(store, true);
      await publishWithActuals(store, other, 4500, 3000);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // A switch on that no build of this product records below the threshold: the range still waits for thirty Books.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const preferenceId = randomUUID();
      const recordedAt = new Date().toISOString();
      const record = canonicalRecord({
        schema: 'ai7.evaluation-preferences/1', preferenceId, ordinal: 1, predictionEnabled: true, calibrationEnabled: true,
        thresholds: { calibrationAdjustments: 10, predictionBooks: 30 }, supersedes: null, actor: '本机编辑', recordedAt,
      });
      database.prepare(`INSERT INTO evaluation_preferences(preference_id, ordinal, prediction_enabled, calibration_enabled, supersedes_preference_id, recorded_at, canonical_json, sha256)
        VALUES (?, 1, 1, 1, NULL, ?, ?, ?)`).run(preferenceId, recordedAt, record.json, record.digest);
    } finally {
      database.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectEvaluation(bookId!, null).market.pricing)
        .toEqual(pricing({ booksWithActuals: 1, otherBooksWithActuals: 1, enabled: true }));
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);
});
