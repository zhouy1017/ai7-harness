/**
 * 设置 › 评估校准与预测's thresholds (Issue #430, plan slice S82; V2-UX-EVAL-010, EVAL-011, EVAL-014; ADR 0076 §7), shared by
 * the service, which gates on them, and the page, which states them. They are the defaults ADR 0076 records and change only
 * through an ADR, never by tuning here.
 */

/** House-level calibration of AI7's starting scores begins only after this many of the editor's adjustments (EVAL-011). */
export const CALIBRATION_MIN_ADJUSTMENTS = 10 as const;

/** The pricing and first-print prediction can be enabled only once this many published Books carry actuals (EVAL-010). */
export const PREDICTION_MIN_BOOKS_WITH_ACTUALS = 30 as const;

/** The largest price in 分 and first print run in copies the entry accepts: beyond any real book, never a real limit. */
export const MAX_PRICE_FEN = 100_000_000 as const;
export const MAX_FIRST_PRINT = 100_000_000 as const;

/** Whether the prediction switch may be turned on: only once enough published Books carry actuals. */
export function predictionAvailable(booksWithActuals: number): boolean {
  return booksWithActuals >= PREDICTION_MIN_BOOKS_WITH_ACTUALS;
}

/** Whether house calibration applies to AI7's starting scores: enough adjustments, and the editor has not turned it off. */
export function calibrationActive(adjustments: number, enabled: boolean): boolean {
  return enabled && adjustments >= CALIBRATION_MIN_ADJUSTMENTS;
}

/** A price in 分 as the editor writes it: yuan with two decimals. */
export function formatPriceFen(priceFen: number): string {
  return `¥${Math.floor(priceFen / 100)}.${String(priceFen % 100).padStart(2, '0')}`;
}

/** A price the editor typed, in yuan with at most two decimals, as 分; `null` when it is not one. */
export function parsePriceYuan(text: string): number | null {
  const match = /^\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/u.exec(text);
  if (match === null) return null;
  const fen = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return fen >= 1 && fen <= MAX_PRICE_FEN ? fen : null;
}

/** A first print run the editor typed, in copies; `null` when it is not one. */
export function parseFirstPrint(text: string): number | null {
  const match = /^\s*(\d{1,9})\s*$/u.exec(text);
  if (match === null) return null;
  const copies = Number(match[1]);
  return copies >= 1 && copies <= MAX_FIRST_PRINT ? copies : null;
}
