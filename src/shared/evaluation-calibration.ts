/**
 * 设置 › 评估校准与预测's thresholds (Issue #430, plan slice S82; V2-UX-EVAL-010, EVAL-011, EVAL-014; ADR 0076 §7), shared by
 * the service, which gates on them, and the page, which states them. They are the defaults ADR 0076 records and change only
 * through an ADR, never by tuning here.
 */

/**
 * House-level calibration of AI7's starting scores begins only after this many Books carry one of the editor's adjustments
 * (EVAL-011; §8.6 「10 本调分记录」): the gate the house offset waits on.
 */
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

/**
 * Whether house calibration applies to AI7's starting scores (EVAL-011; Issue #429, EVAL-011a): enough Books carry one of the
 * editor's adjustments, and the editor has not turned it off. The offset itself is computed from the house's 定稿 evaluations
 * every time it is read (`calibrationOffset`), never stored as truth, so past the gate it always exists.
 */
export function calibrationActive(adjustments: number, enabled: boolean): boolean {
  return enabled && adjustments >= CALIBRATION_MIN_ADJUSTMENTS;
}

/** A number to the nearest half point, a quarter between two rounding away from zero: −0.25 → −0.5, 0.25 → 0.5, −0.2 → 0. */
export function roundToHalfPoint(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * 2) / 2;
  // Never −0: an offset of nothing reads as 0.
  return rounded === 0 ? 0 : rounded;
}

/**
 * The house offset of one Evaluation Profile item (EVAL-011; the Commander's method of 2026-10-09): the mean of each Book's
 * (editor's 定稿 score − AI7's 初评 score), one value per Book, to the nearest half point; `null` when no Book gives a value
 * for the item. The gate — `CALIBRATION_MIN_ADJUSTMENTS` Books with an adjustment — is the caller's, not this function's.
 */
export function calibrationOffset(differences: ReadonlyArray<number>): number | null {
  if (differences.length === 0) return null;
  const sum = differences.reduce((total, difference) => total + difference, 0);
  return roundToHalfPoint(sum / differences.length);
}

/**
 * AI7's starting score of one item after the house offset (EVAL-011): the raw 初评 score plus the offset, clamped so the
 * adjusted score stays within [0, 满分]. Raw and offset are half points, so their sum is one; the clamp keeps it on the scale.
 */
export function calibratedScore(raw: number, offset: number, fullMarks: number): number {
  return Math.min(fullMarks, Math.max(0, raw + offset));
}

/** An offset as the page states it: `+1.5`, `−0.5`, `0`. */
export function formatCalibrationOffset(offset: number): string {
  if (offset === 0) return '0';
  const magnitude = Math.abs(offset);
  return `${offset > 0 ? '+' : '−'}${Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(1)}`;
}

/** A price in 分 as the editor writes it: yuan with two decimals. */
export function formatPriceFen(priceFen: number): string {
  return `¥${Math.floor(priceFen / 100)}.${String(priceFen % 100).padStart(2, '0')}`;
}

/**
 * What the editor typed, as the ASCII a number is read from (Issue #430 review): a Chinese input method's full-width digits
 * and point read as their own, and its 。 as the decimal point it was meant to be.
 */
function typedNumber(text: string): string {
  return text.normalize('NFKC').replace(/。/gu, '.');
}

/** A price the editor typed, in yuan with at most two decimals, as 分; `null` when it is not one. */
export function parsePriceYuan(text: string): number | null {
  const match = /^\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/u.exec(typedNumber(text));
  if (match === null) return null;
  const fen = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return fen >= 1 && fen <= MAX_PRICE_FEN ? fen : null;
}

/** A first print run the editor typed, in copies; `null` when it is not one. */
export function parseFirstPrint(text: string): number | null {
  const match = /^\s*(\d{1,9})\s*$/u.exec(typedNumber(text));
  if (match === null) return null;
  const copies = Number(match[1]);
  return copies >= 1 && copies <= MAX_FIRST_PRINT ? copies : null;
}
