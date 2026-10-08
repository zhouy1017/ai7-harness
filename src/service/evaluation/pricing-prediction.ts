import type { EvaluationPredictionRangeProjection } from '../../shared/protocol.js';

/**
 * 定价与首印's prediction range (Issue #429, plan slice S81b2; V2-UX-EVAL-010; the Owner's answer of 2026-10-07: 「按本社已出版
 * 同类书的实际数据统计」): plain statistics over the actuals the house entered in 设置 › 评估校准与预测 (S82), never a model's and
 * never the web's. The range is the middle half of the Books — the lower to the upper quartile — with the median beside it, so
 * one Book priced far from the rest neither widens nor moves it much; the count of Books it rests on is always said with it.
 *
 * The quartiles are the linear interpolation between the closest ranks of the sorted values (the common "type 7" definition):
 * the p-quantile of n values sits at position (n − 1)·p. Prices are in 分 and first print runs in copies; each figure is rounded
 * to a whole 分 or a whole copy, the units the house entered.
 */

/** One published Book's actuals as the range reads them. */
export interface PublishedActuals {
  readonly priceFen: number;
  readonly firstPrint: number;
}

/** The p-quantile of values sorted ascending, by linear interpolation between the closest ranks. */
export function quantile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) throw new Error('PREDICTION_EMPTY');
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.min(below + 1, sorted.length - 1);
  return sorted[below]! + (position - below) * (sorted[above]! - sorted[below]!);
}

function spread(values: ReadonlyArray<number>): { low: number; median: number; high: number } {
  const sorted = [...values].sort((left, right) => left - right);
  return { low: Math.round(quantile(sorted, 0.25)), median: Math.round(quantile(sorted, 0.5)), high: Math.round(quantile(sorted, 0.75)) };
}

/** The range over some published Books' actuals; `null` over none, which rests on nothing. */
export function predictionRange(books: ReadonlyArray<PublishedActuals>): EvaluationPredictionRangeProjection | null {
  if (books.length === 0) return null;
  return {
    books: books.length,
    priceFen: spread(books.map((book) => book.priceFen)),
    firstPrint: spread(books.map((book) => book.firstPrint)),
  };
}
