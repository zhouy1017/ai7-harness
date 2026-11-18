import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { canonicalRecord } from '../../../../src/service/analysis/canonical.js';
import { EVALUATION_CALIBRATION_TRIGGER_SQL } from '../../../../src/service/evaluation-calibration.js';
import * as calibration from '../../../../src/service/evaluation-calibration-operations.js';
import { evaluationMarket } from '../../../../src/service/evaluation-market.js';
import { SERIES_IMPACT_GROUPS, SERIES_TRIGGER_SQL, SeriesLedger } from '../../../../src/service/series.js';
import { MIN_SERIES_PREDICTION_BOOKS, type EvaluationPricingProjection } from '../../../../src/shared/protocol/evaluation.js';
import { calibrationHost, domainEvaluationRecords, marketHost, seedBook, seedPublication, seededEvaluationDatabase } from '../../../support/domain/evaluation.js';

// 定价与首印 in the market section over the domain relations: no range until 设置 › 评估校准与预测's switch is on and thirty
// other published Books carry actuals; then the middle half and the median of the house's other published Books' actuals, and of
// its own 书系's over five or more of them — the Book itself never counted, in the range or the gate, no model involved; and a
// damaged entry of another Book or of the 书系 leaves 评估 readable and a save reported as saved. Prices and print runs are
// the suite's own.

interface Published { readonly bookId: string }

/** 设为发稿版本, then 录入定价与首印 for it. */
function publishWithActuals(db: DatabaseSync, priceFen: number, firstPrint: number): Published {
  const bookId = seedBook(db, '定价组稿');
  const publication = seedPublication(db, bookId);
  calibration.recordPublicationActuals(calibrationHost(db), { bookId, publicationVersionId: publication.publicationVersionId, expectedEntries: 0, priceFen, firstPrint });
  return { bookId };
}

function joinSeries(db: DatabaseSync, seriesId: string, bookId: string): void {
  new SeriesLedger(db).record({ seriesId, bookId, kind: 'add', previewDigest: 'b'.repeat(64), impact: SERIES_IMPACT_GROUPS.map(({ key, title }) => ({ key, title, changes: [], unchanged: [] })), names: { book: '书', series: '定价书系' } });
}

/** The pricing the market section shows, with the fields every case leaves as they are filled in. */
function pricing(fields: Partial<EvaluationPricingProjection>): EvaluationPricingProjection {
  return {
    booksWithActuals: 0, otherBooksWithActuals: 0, threshold: 30, enabled: false, available: false, unreadable: false,
    house: null, series: null, seriesBooksWithActuals: null, seriesMinimum: MIN_SERIES_PREDICTION_BOOKS, ...fields,
  };
}

describe('定价与首印 in the market section over the domain relations', () => {
  it('shows no range before thirty other published Books and the switch, then the house\'s middle half, and the 书系\'s only over five of its Books', async () => {
    const db = await seededEvaluationDatabase();
    try {
      const market = (bookId: string) => evaluationMarket(marketHost(db), bookId);
      // The Book under evaluation: published too, at a price the ranges — and the gate they wait on — must never count.
      const evaluated = publishWithActuals(db, 99_900, 99_000);
      const seriesId = new SeriesLedger(db).create({ title: '定价书系', note: '' }).seriesId;
      joinSeries(db, seriesId, evaluated.bookId);
      const others: Published[] = [];
      for (let index = 1; index <= 28; index += 1) {
        const book = publishWithActuals(db, 3000 + index * 100, 2000 + index * 100);
        if (index <= 3) joinSeries(db, seriesId, book.bookId);
        others.push(book);
      }
      // Twenty-nine published Books carry actuals: the prediction waits, and says for what.
      expect(market(evaluated.bookId).pricing).toEqual(pricing({ booksWithActuals: 29, otherBooksWithActuals: 28 }));
      others.push(publishWithActuals(db, 3000 + 29 * 100, 2000 + 29 * 100));
      // Available, but off until 设置 turns it on.
      expect(market(evaluated.bookId).pricing).toEqual(pricing({ booksWithActuals: 30, otherBooksWithActuals: 29, available: true }));
      calibration.setEvaluationPreferences(calibrationHost(db), { expectedEntries: 0, predictionEnabled: true, calibrationEnabled: true });
      // On — but the Book itself makes the thirtieth: the other twenty-nine are not enough for a range over them.
      expect(market(evaluated.bookId).pricing).toEqual(pricing({ booksWithActuals: 30, otherBooksWithActuals: 29, available: true, enabled: true }));
      others.push(publishWithActuals(db, 3000 + 30 * 100, 2000 + 30 * 100));
      let page = market(evaluated.bookId);
      // The other thirty: 31.00 to 60.00 yuan and 2,100 to 5,000 copies; the middle half by linear interpolation. The 书系 holds
      // three of them, too few for a range: only their count shows.
      expect(page.pricing).toEqual(pricing({
        booksWithActuals: 31, otherBooksWithActuals: 30, available: true, enabled: true,
        house: { books: 30, priceFen: { low: 3825, median: 4550, high: 5275 }, firstPrint: { low: 2825, median: 3550, high: 4275 } },
        seriesBooksWithActuals: 3,
      }));
      // The 书系's other Books are its comparables, each published.
      expect(page.seriesUnreadable).toBe(false);
      expect(page.comparableCount).toBe(3);
      expect(page.comparables.every((comparable) => comparable.published && comparable.source === 'series')).toBe(true);
      expect(page.comparables.map((comparable) => comparable.bookId).sort()).toEqual(others.slice(0, 3).map((book) => book.bookId).sort());
      // Five of the 书系's Books: now its own range shows, over them alone.
      joinSeries(db, seriesId, others[3]!.bookId);
      joinSeries(db, seriesId, others[4]!.bookId);
      page = market(evaluated.bookId);
      expect([page.pricing.seriesBooksWithActuals, page.pricing.series]).toEqual([5, {
        books: 5, priceFen: { low: 3200, median: 3300, high: 3400 }, firstPrint: { low: 2200, median: 2300, high: 2400 },
      }]);
      expect(page.comparableCount).toBe(5);
      // Turned off again, the range is gone with it.
      calibration.setEvaluationPreferences(calibrationHost(db), { expectedEntries: 1, predictionEnabled: false, calibrationEnabled: true });
      expect(market(evaluated.bookId).pricing).toEqual(pricing({ booksWithActuals: 31, otherBooksWithActuals: 30, available: true }));
      calibration.setEvaluationPreferences(calibrationHost(db), { expectedEntries: 2, predictionEnabled: true, calibrationEnabled: true });

      // Another Book's actuals entry, damaged.
      const damage = (table: string, key: string, id: string): void => {
        db.exec(`DROP TRIGGER ${table}_no_update`);
        db.prepare(`UPDATE ${table} SET canonical_json = canonical_json || ' ' WHERE ${key} = ?`).run(id);
        db.exec((table === 'series' ? SERIES_TRIGGER_SQL : EVALUATION_CALIBRATION_TRIGGER_SQL)[`${table}_no_update`]!);
      };
      const actual = db.prepare('SELECT actual_id FROM publication_actuals WHERE book_id = ?').get(others[10]!.bookId) as { actual_id: string };
      damage('publication_actuals', 'actual_id', actual.actual_id);
      // 评估 of this Book stays readable: 定价与首印 says it could not read the house data, and the 书系 still lists.
      const wired = domainEvaluationRecords(db, {
        market: (bookId) => evaluationMarket(marketHost(db), bookId),
        rewrite: () => ({ prepare: { allowed: false, reason: '按我的评分重写评语暂不可用。' }, task: null, proposal: null, decided: null }),
      });
      const readable = wired.workspace(evaluated.bookId, '定价组稿', null);
      expect(readable.market.pricing).toEqual(pricing({ unreadable: true }));
      expect([readable.market.seriesUnreadable, readable.market.comparableCount]).toEqual([false, 5]);
      // A save goes through, and says so: the page after it is built from the same guarded reads.
      const recordId = wired.start(evaluated.bookId);
      const started = wired.workspace(evaluated.bookId, '定价组稿', recordId).record!;
      wired.save(evaluated.bookId, recordId, started.entries, { ...started.content, verdict: '本社数据损坏时照常保存。' }, false);
      const saved = wired.workspace(evaluated.bookId, '定价组稿', recordId);
      expect([saved.record!.entries, saved.record!.content.verdict, saved.market.pricing.unreadable]).toEqual([started.entries + 1, '本社数据损坏时照常保存。', true]);
      // The 书系's own record, damaged.
      damage('series', 'series_id', seriesId);
      const unreadSeries = wired.workspace(evaluated.bookId, '定价组稿', null);
      expect([unreadSeries.market.seriesUnreadable, unreadSeries.market.series, unreadSeries.market.comparables, unreadSeries.market.comparableCount]).toEqual([true, [], [], 0]);
      expect(unreadSeries.record!.content.verdict).toBe('本社数据损坏时照常保存。');
    } finally { db.close(); }
  });

  it('shows no range while fewer than thirty published Books carry actuals, even with a switch recorded on', async () => {
    const db = await seededEvaluationDatabase();
    try {
      const bookId = seedBook(db, '定价组稿');
      publishWithActuals(db, 4500, 3000);
      // A switch on that no build of this product records below the threshold: the range still waits for thirty Books.
      const preferenceId = randomUUID();
      const recordedAt = new Date().toISOString();
      const record = canonicalRecord({
        schema: 'ai7.evaluation-preferences/1', preferenceId, ordinal: 1, predictionEnabled: true, calibrationEnabled: true,
        thresholds: { calibrationAdjustments: 10, predictionBooks: 30 }, supersedes: null, actor: '本机编辑', recordedAt,
      });
      db.prepare(`INSERT INTO evaluation_preferences(preference_id, ordinal, prediction_enabled, calibration_enabled, supersedes_preference_id, recorded_at, canonical_json, sha256)
        VALUES (?, 1, 1, 1, NULL, ?, ?, ?)`).run(preferenceId, recordedAt, record.json, record.digest);
      expect(evaluationMarket(marketHost(db), bookId).pricing).toEqual(pricing({ booksWithActuals: 1, otherBooksWithActuals: 1, enabled: true }));
    } finally { db.close(); }
  });
});
