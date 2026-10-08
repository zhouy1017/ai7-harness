/**
 * 评估's arithmetic (Issue #429, plan slices S81a and S81b1; V2-UX-EVAL-002, EVAL-004 to EVAL-006), shared by the service, which records
 * and checks an Evaluation Record, and the page, which shows it while the editor types. An item has a 满分 and a 得分 and
 * nothing else is named: no weight, no percentage. The total is the sum of the scores over the 满分 of the items rated; an
 * item left `不评` with its reason leaves the total and its 满分 with it. Bands apply to each item in proportion to its 满分.
 */

export type EvaluationBandId = 'excellent' | 'good' | 'adequate' | 'weak' | 'unsuitable';

/** The band floors of the 100-point scale (EVAL-005), applied to an item in proportion to its 满分. */
export const EVALUATION_BAND_FLOORS: ReadonlyArray<{ readonly band: EvaluationBandId; readonly floor: number }> = [
  { band: 'excellent', floor: 90 },
  { band: 'good', floor: 70 },
  { band: 'adequate', floor: 50 },
  { band: 'weak', floor: 30 },
  { band: 'unsuitable', floor: 0 },
];

/** A score the scale admits: a whole or half point from 0 to the item's 满分. */
export function validEvaluationScore(score: number, fullMarks: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= fullMarks && Number.isInteger(score * 2);
}

/**
 * A score as the editor types it, before anything is saved (Issue #638): one the scale admits counts; anything else counts as
 * no score — no band, nothing in the total — and is `invalid`, so the page can say why. Saving it is still refused.
 */
export function provisionalEvaluationScore(raw: string, fullMarks: number): { readonly score: number | null; readonly invalid: boolean } {
  if (raw.trim() === '') return { score: null, invalid: false };
  const score = Number(raw);
  return validEvaluationScore(score, fullMarks) ? { score, invalid: false } : { score: null, invalid: true };
}

/** The band a score reaches out of its 满分: its proportion of the 100-point scale against the floors, never shown as one. */
export function evaluationBand(score: number, fullMarks: number): EvaluationBandId {
  const scaled = fullMarks === 0 ? 0 : (score * 100) / fullMarks;
  return EVALUATION_BAND_FLOORS.find((entry) => scaled >= entry.floor)?.band ?? 'unsuitable';
}

export interface EvaluationItemScoreInput {
  readonly fullMarks: number;
  readonly score: number | null;
  readonly notRated: boolean;
}

export interface EvaluationTotal {
  /** The sum of the rated items' scores. */
  readonly score: number;
  /** The 满分 of the items rated or still to be rated: 100 less the 满分 of each item left `不评`. */
  readonly fullMarks: number;
  readonly notRated: number;
  /** Items neither scored nor left `不评` yet. */
  readonly unscored: number;
}

export function evaluationTotal(items: ReadonlyArray<EvaluationItemScoreInput>): EvaluationTotal {
  let score = 0;
  let fullMarks = 0;
  let notRated = 0;
  let unscored = 0;
  for (const item of items) {
    if (item.notRated) {
      notRated += 1;
      continue;
    }
    fullMarks += item.fullMarks;
    if (item.score === null) unscored += 1;
    else score += item.score;
  }
  return { score, fullMarks, notRated, unscored };
}

/**
 * 定稿 waits while every item is `不评` (Issue #638; the Owner's answer of 2026-10-07): a version that scored nothing is no
 * evaluation to keep. An item neither scored nor `不评` is the per-item refusal's, not this one's.
 */
export function finalizationNeedsScore(items: ReadonlyArray<{ readonly score: number | null; readonly notRated: boolean }>): boolean {
  return items.length > 0 && items.every((item) => item.notRated);
}
export const EVALUATION_FINALIZE_NEEDS_SCORE = '至少要给一项打分才能定稿。';

export type EvaluationRiskLevel = 'low' | 'medium' | 'high';

/** `推荐出版` waits while any risk item stands at `高` without a person's review (EVAL-004). */
export function recommendationBlocked(risks: ReadonlyArray<{ readonly level: EvaluationRiskLevel | null; readonly reviewed: boolean }>): boolean {
  return risks.some((risk) => risk.level === 'high' && !risk.reviewed);
}

// ---- AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-005, EVAL-006, EVAL-011) ------------------------------------------

/** 依据充分度 (EVAL-005): how well AI7's 初评 of one item stands on what it cited. */
export type EvaluationSufficiency = 'sufficient' | 'fair' | 'insufficient';

/** At least this many distinct cited blocks for `充分`. */
export const SUFFICIENT_MIN_CITED_BLOCKS = 3 as const;

/**
 * 依据充分度 of one item, from what AI7 cited for it across the whole Book and nothing else:
 * - `充分` — at least {@link SUFFICIENT_MIN_CITED_BLOCKS} distinct blocks cited, in at least half the Book's reading ranges;
 * - `一般` — at least one block cited, short of that;
 * - `不足` — nothing cited.
 * A reading range AI7 could not read (a gap) counts against the half, as a range with nothing cited does.
 */
export function evaluationSufficiency(input: { readonly citedBlocks: number; readonly unitsCited: number; readonly unitsTotal: number }): EvaluationSufficiency {
  if (input.citedBlocks <= 0 || input.unitsCited <= 0) return 'insufficient';
  return input.citedBlocks >= SUFFICIENT_MIN_CITED_BLOCKS && input.unitsCited * 2 >= input.unitsTotal ? 'sufficient' : 'fair';
}

/** Why the editor's score departs from AI7's (EVAL-006): offered, never preselected. `own` carries the editor's words. */
export type EvaluationAdjustmentReason = 'too-high' | 'too-low' | 'insufficient-basis' | 'missed-aspect' | 'own';
export const EVALUATION_ADJUSTMENT_REASONS: ReadonlyArray<EvaluationAdjustmentReason> = ['too-high', 'too-low', 'insufficient-basis', 'missed-aspect', 'own'];
/** Each reason in the editor's words: the page offers them so, and 按我的评分重写评语 hands them to AI7 so (S81b2). */
export const EVALUATION_ADJUSTMENT_REASON_WORDS: Readonly<Record<EvaluationAdjustmentReason, string>> = {
  'too-high': '打分偏高',
  'too-low': '打分偏低',
  'insufficient-basis': '依据不足',
  'missed-aspect': '未考虑某方面',
  own: '自行输入',
};

/**
 * Whether the editor adjusted AI7's 初评 of one item: AI7 gave a score, and the editor's own differs from it — another number,
 * or `不评`. An item the editor has not scored yet has not been adjusted.
 */
export function evaluationItemAdjusted(editor: { readonly score: number | null; readonly notRated: boolean }, ai7Score: number | null): boolean {
  if (ai7Score === null) return false;
  if (editor.notRated) return true;
  return editor.score !== null && editor.score !== ai7Score;
}
