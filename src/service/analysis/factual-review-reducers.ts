import {
  FACTUAL_ASSERTION_CATEGORIES,
  FACTUAL_ASSERTION_CLASSES,
  FACTUAL_FINDING_CLASSES,
  FACTUAL_RESEARCH_NOT_AUTHORIZED,
  FACTUAL_REVIEW_ASSURANCE_STATEMENT,
  FACTUAL_SEVERITY_TIERS,
  FACTUAL_UNCHECKED_STATE,
  FACTUAL_UNREVIEWED_VERDICT,
  type AnalysisAssuranceAxis,
  type AnalysisCoverageAxis,
  type AnalysisGapProjection,
  type AnalysisReducerClosureAxis,
  type AnalysisReducerStageProjection,
  type CoverageManifestProjection,
  type FactualAssertionCategory,
  type FactualAssertionClass,
  type FactualReviewAssertionCountsProjection,
  type FactualReviewExcludedProjection,
  type FactualReviewFindingProjection,
  type FactualReviewResearchProjection,
  type FactualSeverityTier,
} from '../../shared/protocol.js';
import { researchDisclosure, type ResearchCapability, type ResearchOutcome } from '../capabilities/research.js';
import { canonicalJson, sha256Hex } from './canonical.js';
import type { ManifestBlockInput } from './coverage-manifest.js';
import {
  factualReviewMessageBlockIds,
  locateQuotation,
  normalizedQuotation,
  type FactualReviewUnitResult,
  type FactualUnitAssertion,
} from './factual-review-contract.js';
import { coverageAxis, orderUnitOutcomes, unitGaps, type ClosedUnitOutcome, type GapUnitOutcome } from './reducers.js';

/**
 * Typed reducers over factual-review unit results: Reference Integrity, then the finding set.
 *
 * The order is the point. The model lists assertions and quotes the manuscript for each; nothing it
 * says about *where* a quotation sits is trusted. This reducer locates every quotation itself in the
 * committed block the assertion named, and only a quotation found there exactly once becomes a
 * finding with a source range. A quotation found nowhere, or found twice, is kept — with its reason,
 * in the excluded appendix, without a range — because deleting it would hide what the model claimed.
 *
 * No reducer here judges a claim. Claim Support and Factual Verification need evidence, the research
 * capability is authorized to fetch none (ADR 0074, proposed), and so every finding leaves this
 * module with the verdict `未外部复核` and both evidence states `未核查`.
 */
export type FactualUnitOutcome = ClosedUnitOutcome<FactualReviewUnitResult> | GapUnitOutcome;

export interface FactualReduction {
  readonly coverage: AnalysisCoverageAxis;
  readonly reducerClosure: AnalysisReducerClosureAxis;
  readonly assurance: AnalysisAssuranceAxis;
  readonly gaps: ReadonlyArray<AnalysisGapProjection>;
  readonly findings: ReadonlyArray<FactualReviewFindingProjection>;
  readonly excluded: ReadonlyArray<FactualReviewExcludedProjection>;
  readonly assertionCounts: FactualReviewAssertionCountsProjection;
  readonly research: FactualReviewResearchProjection;
}

export const EXCLUSION_REASON_LABELS = {
  'quote-not-found': '引文未在其所声明的内容块中找到；该断言不获得来源范围。',
  'quote-ambiguous': '引文在其所声明的内容块中出现多于一次，锚点不唯一；该断言不获得来源范围。',
} as const;

/**
 * A stable identity for one finding: a pure function of the block it is anchored to and the folded
 * form of its quotation. Two Runs over the same manuscript therefore mint the same identity for the
 * same finding, which an immutable digest-bound revision needs and a random identity could not give.
 */
function findingId(parts: Readonly<Record<string, unknown>>): string {
  return `fnd_${sha256Hex(canonicalJson(parts)).slice(0, 24)}`;
}

function emptyCounts<T extends string>(keys: ReadonlyArray<T>): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

interface LocatedAssertion {
  readonly unitOrdinal: number;
  readonly assertionOrdinal: number;
  readonly assertion: FactualUnitAssertion;
  readonly blockId: string;
  readonly location: ReturnType<typeof locateQuotation>;
}

function stage(name: AnalysisReducerStageProjection['stage'], inputCount: number, gaps: number): AnalysisReducerStageProjection {
  return { stage: name, state: gaps > 0 ? 'closed-with-gaps' : 'closed', inputCount };
}

export interface FactualReductionInput {
  readonly manifest: CoverageManifestProjection;
  readonly outcomes: ReadonlyArray<FactualUnitOutcome>;
  readonly reusedUnitOrdinals?: ReadonlySet<number>;
  /** The committed blocks of the Task Input revision, by identity: the text every quotation is located in. */
  readonly blocks: ReadonlyMap<string, ManifestBlockInput>;
  /** The capability each finding's verification question is put to; it refuses in this slice. */
  readonly research: ResearchCapability;
}

export function reduceFactualReview(input: FactualReductionInput): FactualReduction {
  const { manifest, blocks } = input;
  const ordered = orderUnitOutcomes(manifest, input.outcomes);
  const closed = ordered.filter((outcome): outcome is ClosedUnitOutcome<FactualReviewUnitResult> => outcome.state === 'closed');
  const gaps = unitGaps(manifest, ordered);

  const byClass = emptyCounts<FactualAssertionClass>(FACTUAL_ASSERTION_CLASSES);
  const byCategory = emptyCounts<FactualAssertionCategory>(FACTUAL_ASSERTION_CATEGORIES);
  const bySeverity = emptyCounts<FactualSeverityTier>(FACTUAL_SEVERITY_TIERS);
  let listed = 0;

  // Reference Integrity: every assertion of a finding class is located in the block it named. The
  // other classes are counted and go no further — they are what the model declined to treat as fact.
  const located: LocatedAssertion[] = [];
  for (const outcome of closed) {
    const unit = manifest.units[outcome.unitOrdinal - 1]!;
    const messageBlockIds = factualReviewMessageBlockIds(unit);
    outcome.result.assertions.forEach((assertion, index) => {
      listed += 1;
      byClass[assertion.assertionClass] += 1;
      byCategory[assertion.category] += 1;
      bySeverity[assertion.severity] += 1;
      if (!FACTUAL_FINDING_CLASSES.includes(assertion.assertionClass)) return;
      const blockId = messageBlockIds[assertion.blockOrdinal - 1];
      const block = blockId === undefined ? undefined : blocks.get(blockId);
      if (blockId === undefined || block === undefined) {
        // The contract parser already refused an out-of-range block ordinal, so this is a block the
        // manifest named and the revision does not hold: not found, and never a silent drop.
        located.push({
          unitOrdinal: outcome.unitOrdinal,
          assertionOrdinal: index + 1,
          assertion,
          blockId: blockId ?? '',
          location: { state: 'not-found' },
        });
        return;
      }
      located.push({
        unitOrdinal: outcome.unitOrdinal,
        assertionOrdinal: index + 1,
        assertion,
        blockId,
        location: locateQuotation(block.text, assertion.quote),
      });
    });
  }

  // Finding reduction: verified assertions merge by block and folded quotation, in unit order; the
  // first occurrence keeps the record and every later one is listed in `mergedFrom`.
  const findings: FactualReviewFindingProjection[] = [];
  const findingsByKey = new Map<string, number>();
  const excluded: FactualReviewExcludedProjection[] = [];
  let merged = 0;
  let verified = 0;
  const questions: ResearchOutcome[] = [];
  for (const entry of located) {
    const { assertion } = entry;
    if (entry.location.state !== 'verified') {
      const reason = entry.location.state === 'ambiguous' ? 'quote-ambiguous' as const : 'quote-not-found' as const;
      excluded.push({
        findingId: findingId({ kind: 'excluded', unitOrdinal: entry.unitOrdinal, assertionOrdinal: entry.assertionOrdinal, quote: normalizedQuotation(assertion.quote) }),
        unitOrdinal: entry.unitOrdinal,
        blockId: entry.blockId,
        blockOrdinal: assertion.blockOrdinal,
        quote: assertion.quote,
        assertionClass: assertion.assertionClass,
        category: assertion.category,
        severity: assertion.severity,
        question: assertion.question,
        basis: assertion.basis,
        states: { referenceIntegrity: 'failed', claimSupport: FACTUAL_UNCHECKED_STATE, factualVerification: FACTUAL_UNCHECKED_STATE },
        reason,
        reasonLabel: EXCLUSION_REASON_LABELS[reason],
      });
      continue;
    }
    verified += 1;
    const normalized = normalizedQuotation(assertion.quote);
    const key = `${entry.blockId} ${normalized}`;
    const existing = findingsByKey.get(key);
    if (existing !== undefined) {
      merged += 1;
      const survivor = findings[existing]!;
      findings[existing] = {
        ...survivor,
        mergedFrom: [...survivor.mergedFrom, { unitOrdinal: entry.unitOrdinal, blockOrdinal: assertion.blockOrdinal, assertionOrdinal: entry.assertionOrdinal }],
      };
      continue;
    }
    const identity = findingId({ kind: 'finding', blockId: entry.blockId, quote: normalized });
    const outcome = input.research.lookup(
      { findingId: identity, question: assertion.question, severity: assertion.severity },
      null,
    );
    questions.push(outcome);
    findingsByKey.set(key, findings.length);
    findings.push({
      findingId: identity,
      unitOrdinal: entry.unitOrdinal,
      blockId: entry.blockId,
      sourceRange: { blockId: entry.blockId, fromGrapheme: entry.location.fromGrapheme, toGrapheme: entry.location.toGrapheme },
      quote: assertion.quote,
      assertionClass: assertion.assertionClass,
      category: assertion.category,
      severity: assertion.severity,
      question: assertion.question,
      basis: assertion.basis,
      // Nothing external answered the question, so the verdict states exactly that. It is not a
      // downgrade of a checked claim; it is the honest reading of an unchecked one.
      verdict: FACTUAL_UNREVIEWED_VERDICT,
      states: { referenceIntegrity: 'verified', claimSupport: FACTUAL_UNCHECKED_STATE, factualVerification: FACTUAL_UNCHECKED_STATE },
      evidence: [],
      research: { state: outcome.state, budget: null },
      mergedFrom: [],
    });
  }

  const assertionCounts: FactualReviewAssertionCountsProjection = {
    listed,
    byClass: FACTUAL_ASSERTION_CLASSES.map((assertionClass) => ({ assertionClass, count: byClass[assertionClass] })),
    byCategory: FACTUAL_ASSERTION_CATEGORIES.map((category) => ({ category, count: byCategory[category] })),
    bySeverity: FACTUAL_SEVERITY_TIERS.map((severity) => ({ severity, count: bySeverity[severity] })),
    verified,
    excluded: excluded.length,
    merged,
  };
  const disclosure = researchDisclosure(questions);
  const research: FactualReviewResearchProjection = {
    state: disclosure.state,
    fetched: 0,
    statement: disclosure.statement,
  };

  const stages: AnalysisReducerStageProjection[] = [
    stage('unit-validation', ordered.length, gaps.length),
    stage('reference-integrity', located.length, excluded.length),
    stage('finding-reduction', findings.length, 0),
  ];
  const stagesCarriedGaps = stages.some((entry) => entry.state === 'closed-with-gaps');
  const reducerClosure: AnalysisReducerClosureAxis = {
    axis: 'reducer-closure',
    state: stagesCarriedGaps ? 'closed-with-gaps' : 'closed',
    label: !stagesCarriedGaps
      ? '归约/综合闭合：全部阶段已闭合'
      : gaps.length > 0
        ? `归约/综合闭合：已闭合 · 保留 ${gaps.length} 处缺口`
        : `归约/综合闭合：已闭合 · 引文完整性排除 ${excluded.length} 条断言`,
    stages,
  };

  // Nothing was checked against evidence, so the axis can never read better than `limited` once a
  // quotation failed to anchor, and its statement says what the whole result is and is not.
  const assuranceState: AnalysisAssuranceAxis['state'] = excluded.length > 0 ? 'limited' : 'qualified';
  const assurance: AnalysisAssuranceAxis = {
    axis: 'assurance',
    state: assuranceState,
    label: assuranceState === 'qualified'
      ? `语义/证据保证：合格 · ${findings.length} 条断言已定位引文 · 均未外部复核`
      : `语义/证据保证：有限 · ${findings.length} 条断言已定位引文 · ${excluded.length} 条引文未能唯一定位 · 均未外部复核`,
    unresolvedConflictCount: 0,
    // Every finding is unresolved: a question was raised and no admissible evidence answered it.
    unresolvedItemCount: findings.length,
    lowConfidenceUnitCount: 0,
    crossUnitFindingCount: 0,
    // Filled in by the sampling pass after this reduction, exactly as the baseline kind's is.
    sampledPrecision: null,
    statement: FACTUAL_REVIEW_ASSURANCE_STATEMENT,
  };

  const unitsReused = closed.filter((outcome) => (input.reusedUnitOrdinals ?? new Set<number>()).has(outcome.unitOrdinal)).length;
  return {
    coverage: coverageAxis({ unitsTotal: manifest.units.length, unitsClosed: closed.length, unitsReused, gapCount: gaps.length }),
    reducerClosure,
    assurance,
    gaps,
    findings,
    excluded,
    assertionCounts,
    research,
  };
}

/** The research state a revision must carry while no egress is accepted; the suite pins it. */
export const FACTUAL_REVIEW_RESEARCH_STATE = FACTUAL_RESEARCH_NOT_AUTHORIZED;
