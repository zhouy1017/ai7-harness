/**
 * 评估's arithmetic (Issue #429, plan slice S81a; V2-UX-EVAL-002, EVAL-004, EVAL-005), shared by the service, which records
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

export type EvaluationRiskLevel = 'low' | 'medium' | 'high';

/** `推荐出版` waits while any risk item stands at `高` without a person's review (EVAL-004). */
export function recommendationBlocked(risks: ReadonlyArray<{ readonly level: EvaluationRiskLevel | null; readonly reviewed: boolean }>): boolean {
  return risks.some((risk) => risk.level === 'high' && !risk.reviewed);
}
