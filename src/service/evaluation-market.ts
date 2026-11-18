import type { DatabaseSync } from 'node:sqlite';
import type { EvaluationCalibrationLedger } from './evaluation-calibration.js';
import { predictionRange } from './evaluation/pricing-prediction.js';
import type { SeriesLedger } from './series.js';
import { StoreError, asNumber, asString, type SqlRow } from './store-records.js';
import { PREDICTION_MIN_BOOKS_WITH_ACTUALS, predictionAvailable } from '../shared/evaluation-calibration.js';
import {
  MAX_EVALUATION_COMPARABLES,
  MIN_SERIES_PREDICTION_BOOKS,
  type EvaluationComparableProjection,
  type EvaluationMarketProjection,
  type EvaluationPricingProjection,
} from '../shared/protocol/evaluation.js';

// ---- 市场 section of 评估 (Issue #429, plan slice S81b2; V2-UX-EVAL-008 to EVAL-010; moved from store.ts by Issue #1534) -----

/** What the market section reads of the store, lent by EditorialStore: its connection and ledgers live, its guarded calls bound. */
export interface EvaluationMarketHost {
  readonly authority: DatabaseSync;
  calibrationCall<T>(operation: () => T): T;
  readonly evaluationCalibration: EvaluationCalibrationLedger;
  readonly series: SeriesLedger;
  seriesCall<T>(operation: () => T): T;
}

/**
 * The market section's house data for one Book (EVAL-009, EVAL-010): the 书系 it is in and their other Books as comparables
 * tagged `书系`, and 定价与首印 — the prediction range over the house's other published Books' actuals, shown only once 设置 ›
 * 评估校准与预测's switch is on and at least the threshold of other Books carry actuals (the Owner's answer of 2026-10-07:
 * 「按本社已出版同类书的实际数据统计」), with a 书系 range only over `MIN_SERIES_PREDICTION_BOOKS` or more. The Book itself never
 * counts toward its own range or the gate it waits on. No model reads any of it, and nothing here comes from the web.
 *
 * It reads other Books' entries, so a damaged one anywhere must not take 评估 of this Book down (S81b2 review): a part that
 * cannot be read this time says so — 暂时读不到本社数据 — and the rest of 评估, a save included, stands.
 */
export function evaluationMarket(host: EvaluationMarketHost, bookId: string): EvaluationMarketProjection {
  let memberships: ReadonlyArray<{ seriesId: string; title: string }> = [];
  const others = new Map<string, string>();
  let seriesUnreadable = false;
  try {
    memberships = host.seriesCall(() => host.series.seriesOf(bookId)).memberships;
    for (const membership of memberships) {
      for (const member of host.seriesCall(() => [...host.series.members(membership.seriesId)])) {
        if (member.bookId !== bookId && !others.has(member.bookId)) others.set(member.bookId, membership.title);
      }
    }
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    memberships = [];
    others.clear();
    seriesUnreadable = true;
  }
  const comparables: EvaluationComparableProjection[] = [];
  for (const [otherId, seriesTitle] of others) {
    if (comparables.length >= MAX_EVALUATION_COMPARABLES) break;
    const row = host.authority.prepare(
      'SELECT b.title, EXISTS (SELECT 1 FROM publication_versions p WHERE p.book_id = b.book_id) AS published FROM books b WHERE b.book_id = ?',
    ).get(otherId) as SqlRow | undefined;
    if (row === undefined) continue;
    comparables.push({ bookId: otherId, title: asString(row.title), seriesTitle, published: asNumber(row.published) === 1, source: 'series' });
  }
  const unread: EvaluationPricingProjection = {
    booksWithActuals: 0, otherBooksWithActuals: 0, threshold: PREDICTION_MIN_BOOKS_WITH_ACTUALS, enabled: false, available: false, unreadable: true,
    house: null, series: null, seriesBooksWithActuals: null, seriesMinimum: MIN_SERIES_PREDICTION_BOOKS,
  };
  let pricing = unread;
  try {
    pricing = host.calibrationCall(() => {
      const preferences = host.evaluationCalibration.preferences();
      const booksWithActuals = host.evaluationCalibration.booksWithActuals();
      const available = predictionAvailable(booksWithActuals);
      const asked = preferences.predictionEnabled && available;
      const actuals = asked ? [...host.evaluationCalibration.everyLatestActuals()].filter(([otherId]) => otherId !== bookId) : [];
      const otherBooksWithActuals = asked ? actuals.length
        : booksWithActuals - (host.evaluationCalibration.hasActuals(bookId) ? 1 : 0);
      // The gate counts the Books the range rests on: the others, never this one.
      const shown = asked && predictionAvailable(otherBooksWithActuals);
      const inSeries = shown ? actuals.filter(([otherId]) => others.has(otherId)).map(([, entry]) => entry) : [];
      return {
        booksWithActuals,
        otherBooksWithActuals,
        threshold: PREDICTION_MIN_BOOKS_WITH_ACTUALS,
        enabled: preferences.predictionEnabled,
        available,
        unreadable: false,
        house: shown ? predictionRange(actuals.map(([, entry]) => entry)) : null,
        series: shown && inSeries.length >= MIN_SERIES_PREDICTION_BOOKS ? predictionRange(inSeries) : null,
        seriesBooksWithActuals: shown && memberships.length > 0 ? inSeries.length : null,
        seriesMinimum: MIN_SERIES_PREDICTION_BOOKS,
      };
    });
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    pricing = unread;
  }
  return {
    series: memberships.map((membership) => ({ seriesId: membership.seriesId, title: membership.title })),
    comparables,
    comparableCount: others.size,
    seriesUnreadable,
    pricing,
  };
}