import {
  REVIEW_CATEGORY_ASSURANCE_STATEMENT,
  REVIEW_FINDING_SEVERITIES,
  type AnalysisAssuranceAxis,
  type AnalysisCoverageAxis,
  type AnalysisGapProjection,
  type AnalysisReducerClosureAxis,
  type AnalysisReducerStageProjection,
  type CoverageManifestProjection,
  type ReviewCategoryExcludedProjection,
  type ReviewCategoryFindingCountsProjection,
  type ReviewCategoryFindingProjection,
  type ReviewFindingExclusionReason,
  type ReviewFindingSeverity,
} from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import type { ManifestBlockInput } from '../analysis/coverage-manifest.js';
import { locateQuotation, normalizedQuotation, sliceGraphemes } from '../analysis/factual-review-contract.js';
import { coverageAxis, orderUnitOutcomes, unitGaps, type ClosedUnitOutcome, type GapUnitOutcome } from '../analysis/reducers.js';
import { reviewCategoryMessageBlockIds, type ReviewCategoryUnitResult, type ReviewUnitFinding } from './review-category-contract.js';

/**
 * Typed reducers over review-category unit results: Reference Integrity, then the finding set.
 *
 * The order is the factual kind's and for the same reason. The model lists findings and quotes the
 * manuscript for each; nothing it says about *where* a quotation sits is trusted. This reducer locates
 * every quotation itself in the committed block the finding named, and only a quotation found there
 * exactly once becomes a finding with a source range — the range an Editorial Mark is later made
 * from, so it must be one the service proved rather than one the model offered. A quotation found
 * nowhere, or found twice, is kept with its reason in the excluded appendix, never as a mark, because
 * deleting it would hide what the model claimed.
 *
 * No reducer here decides a finding. Severity is the model's reading under the category's clauses,
 * carried as listed; what becomes of each finding is the editor's (V2-UX-REV-003).
 */
export type ReviewUnitOutcome = ClosedUnitOutcome<ReviewCategoryUnitResult> | GapUnitOutcome;

export interface ReviewCategoryReduction {
  readonly coverage: AnalysisCoverageAxis;
  readonly reducerClosure: AnalysisReducerClosureAxis;
  readonly assurance: AnalysisAssuranceAxis;
  readonly gaps: ReadonlyArray<AnalysisGapProjection>;
  readonly findings: ReadonlyArray<ReviewCategoryFindingProjection>;
  readonly excluded: ReadonlyArray<ReviewCategoryExcludedProjection>;
  readonly findingCounts: ReviewCategoryFindingCountsProjection;
}

export const REVIEW_EXCLUSION_REASON_LABELS = {
  'quote-not-found': '引文未在其所声明的内容块中找到；该发现不获得来源范围，也不形成标记。',
  'quote-ambiguous': '引文在其所声明的内容块中出现多于一次，锚点不唯一；该发现不获得来源范围，也不形成标记。',
  'replacement-identical': '替换文字与其定位到的原文完全相同，没有提出任何修改；该发现不形成修改建议。',
} as const satisfies Record<ReviewFindingExclusionReason, string>;

/**
 * A stable identity for one finding: a pure function of the category, the block it is anchored to, the
 * folded form of its quotation and the replacement it proposes. Two Runs over the same manuscript
 * therefore mint the same identity for the same finding — which is what lets a Review Run recognise a
 * finding it has already turned into a mark — and two categories that flag the same words never share
 * one.
 */
function findingId(parts: Readonly<Record<string, unknown>>): string {
  return `rfd_${sha256Hex(canonicalJson(parts)).slice(0, 24)}`;
}

interface LocatedFinding {
  readonly unitOrdinal: number;
  readonly findingOrdinal: number;
  readonly finding: ReviewUnitFinding;
  readonly blockId: string;
  readonly blockText: string | null;
  readonly location: ReturnType<typeof locateQuotation>;
}

function stage(name: AnalysisReducerStageProjection['stage'], inputCount: number, gaps: number): AnalysisReducerStageProjection {
  return { stage: name, state: gaps > 0 ? 'closed-with-gaps' : 'closed', inputCount };
}

export interface ReviewCategoryReductionInput {
  readonly categoryId: string;
  readonly manifest: CoverageManifestProjection;
  readonly outcomes: ReadonlyArray<ReviewUnitOutcome>;
  readonly reusedUnitOrdinals?: ReadonlySet<number>;
  /** The committed blocks of the Task Input revision, by identity: the text every quotation is located in. */
  readonly blocks: ReadonlyMap<string, ManifestBlockInput>;
}

export function reduceReviewCategory(input: ReviewCategoryReductionInput): ReviewCategoryReduction {
  const { manifest, blocks, categoryId } = input;
  const ordered = orderUnitOutcomes(manifest, input.outcomes);
  const closed = ordered.filter((outcome): outcome is ClosedUnitOutcome<ReviewCategoryUnitResult> => outcome.state === 'closed');
  const gaps = unitGaps(manifest, ordered);
  // A unit the plan left out of scope is a gap in the coverage and nothing else: the Run lost nothing
  // there, so it never counts against a stage's closure.
  const outOfScope = gaps.filter((gap) => gap.code === 'out-of-scope').length;
  const lost = gaps.length - outOfScope;

  const bySeverity = Object.fromEntries(REVIEW_FINDING_SEVERITIES.map((severity) => [severity, 0])) as Record<ReviewFindingSeverity, number>;
  let listed = 0;

  // Reference Integrity: every listed finding is located in the block it named.
  const located: LocatedFinding[] = [];
  for (const outcome of closed) {
    const unit = manifest.units[outcome.unitOrdinal - 1]!;
    const messageBlockIds = reviewCategoryMessageBlockIds(unit);
    outcome.result.findings.forEach((finding, index) => {
      listed += 1;
      bySeverity[finding.severity] += 1;
      const blockId = messageBlockIds[finding.blockOrdinal - 1];
      const block = blockId === undefined ? undefined : blocks.get(blockId);
      // The contract parser already refused an out-of-range block ordinal, so a missing block here is
      // one the manifest named and the revision does not hold: not found, and never a silent drop.
      located.push({
        unitOrdinal: outcome.unitOrdinal,
        findingOrdinal: index + 1,
        finding,
        blockId: blockId ?? '',
        blockText: block?.text ?? null,
        location: block === undefined ? { state: 'not-found' } : locateQuotation(block.text, finding.quote),
      });
    });
  }

  // Finding reduction: located findings merge by block, folded quotation and replacement, in unit
  // order; the first occurrence keeps the record and every later one is listed in `mergedFrom`. Two
  // findings on the same words that propose different replacements are two findings.
  const findings: ReviewCategoryFindingProjection[] = [];
  const findingsByKey = new Map<string, number>();
  const excluded: ReviewCategoryExcludedProjection[] = [];
  let merged = 0;
  let verified = 0;
  for (const entry of located) {
    const { finding } = entry;
    const normalized = normalizedQuotation(finding.quote);
    const replacement = finding.replacement ?? null;
    const exclude = (reason: ReviewFindingExclusionReason): void => {
      excluded.push({
        findingId: findingId({ kind: 'excluded', categoryId, unitOrdinal: entry.unitOrdinal, findingOrdinal: entry.findingOrdinal, quote: normalized }),
        unitOrdinal: entry.unitOrdinal,
        blockId: entry.blockId,
        blockOrdinal: finding.blockOrdinal,
        quote: finding.quote,
        severity: finding.severity,
        note: finding.note,
        replacement,
        clauseId: finding.clauseId ?? null,
        reason,
        reasonLabel: REVIEW_EXCLUSION_REASON_LABELS[reason],
      });
    };
    if (entry.location.state !== 'verified') {
      exclude(entry.location.state === 'ambiguous' ? 'quote-ambiguous' : 'quote-not-found');
      continue;
    }
    verified += 1;
    // The parser refused a replacement equal to the quotation as the model wrote it. The text actually
    // standing in the block can still differ from that by width or spacing, and a replacement equal to
    // *it* would make a 修改建议 that changes nothing — which the mark owner refuses outright.
    if (replacement !== null && replacement === sliceGraphemes(entry.blockText!, entry.location.fromGrapheme, entry.location.toGrapheme)) {
      exclude('replacement-identical');
      continue;
    }
    const key = canonicalJson([entry.blockId, normalized, replacement]);
    const existing = findingsByKey.get(key);
    if (existing !== undefined) {
      merged += 1;
      const survivor = findings[existing]!;
      findings[existing] = {
        ...survivor,
        mergedFrom: [...survivor.mergedFrom, { unitOrdinal: entry.unitOrdinal, blockOrdinal: finding.blockOrdinal, findingOrdinal: entry.findingOrdinal }],
      };
      continue;
    }
    findingsByKey.set(key, findings.length);
    findings.push({
      findingId: findingId({ kind: 'finding', categoryId, blockId: entry.blockId, quote: normalized, replacement }),
      unitOrdinal: entry.unitOrdinal,
      blockId: entry.blockId,
      sourceRange: { blockId: entry.blockId, fromGrapheme: entry.location.fromGrapheme, toGrapheme: entry.location.toGrapheme },
      quote: finding.quote,
      severity: finding.severity,
      note: finding.note,
      replacement,
      clauseId: finding.clauseId ?? null,
      mergedFrom: [],
    });
  }

  const findingCounts: ReviewCategoryFindingCountsProjection = {
    listed,
    bySeverity: REVIEW_FINDING_SEVERITIES.map((severity) => ({ severity, count: bySeverity[severity] })),
    located: verified,
    excluded: excluded.length,
    merged,
  };

  const stages: AnalysisReducerStageProjection[] = [
    stage('unit-validation', ordered.length - outOfScope, lost),
    stage('reference-integrity', located.length, excluded.length),
    stage('finding-reduction', findings.length, 0),
  ];
  const stagesCarriedGaps = stages.some((entry) => entry.state === 'closed-with-gaps');
  const reducerClosure: AnalysisReducerClosureAxis = {
    axis: 'reducer-closure',
    state: stagesCarriedGaps ? 'closed-with-gaps' : 'closed',
    label: !stagesCarriedGaps
      ? '归约/综合闭合：全部阶段已闭合'
      : lost > 0
        ? `归约/综合闭合：已闭合 · 保留 ${lost} 处缺口`
        : `归约/综合闭合：已闭合 · 引文完整性排除 ${excluded.length} 条发现`,
    stages,
  };

  // Every finding is the model's reading under the category's clauses and the editor's to dispose of,
  // so the axis never reads better than `limited` once a quotation failed to anchor.
  const assuranceState: AnalysisAssuranceAxis['state'] = excluded.length > 0 ? 'limited' : 'qualified';
  const assurance: AnalysisAssuranceAxis = {
    axis: 'assurance',
    state: assuranceState,
    label: assuranceState === 'qualified'
      ? `语义/证据保证：合格 · ${findings.length} 条发现已定位引文 · 均待编辑处置`
      : `语义/证据保证：有限 · ${findings.length} 条发现已定位引文 · ${excluded.length} 条未能形成发现 · 均待编辑处置`,
    unresolvedConflictCount: 0,
    // Every finding is unresolved until an editor disposes of it, which is not this ledger's record.
    unresolvedItemCount: findings.length,
    lowConfidenceUnitCount: 0,
    crossUnitFindingCount: 0,
    // Filled in by the sampling pass after this reduction, exactly as the other kinds' is.
    sampledPrecision: null,
    statement: REVIEW_CATEGORY_ASSURANCE_STATEMENT,
  };

  const unitsReused = closed.filter((outcome) => (input.reusedUnitOrdinals ?? new Set<number>()).has(outcome.unitOrdinal)).length;
  const shared = coverageAxis({ unitsTotal: manifest.units.length, unitsClosed: closed.length, unitsReused, gapCount: gaps.length });
  // The shared wording calls every gap a `缺口`. A range review's out-of-scope units are not something
  // the Run lost, so its coverage says which of its gaps are which.
  const coverage: AnalysisCoverageAxis = {
    ...shared,
    label: outOfScope === 0 ? shared.label : [
      `覆盖：部分 · ${closed.length}/${manifest.units.length} 单元`,
      ...(lost > 0 ? [`${lost} 处缺口`] : []),
      `${outOfScope} 个单元不在本次审阅范围内`,
      ...(unitsReused > 0 ? [`复用 ${unitsReused} 单元`] : []),
    ].join(' · '),
    unitsOutOfScope: outOfScope,
  };
  return { coverage, reducerClosure, assurance, gaps, findings, excluded, findingCounts };
}
