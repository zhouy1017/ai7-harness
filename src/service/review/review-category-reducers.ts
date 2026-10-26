import { notExactFetched } from '../retrieval/result-validator.js';
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
  type ReviewCrossChapterInput,
  type ReviewBaselineSource,
  type ReviewSynthesisEvidence,
} from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import type { ManifestBlockInput } from '../analysis/coverage-manifest.js';
import { locateQuotation, normalizedQuotation, sliceGraphemes } from '../analysis/factual-review-contract.js';
import { coverageAxis, orderUnitOutcomes, unitGaps, type ClosedUnitOutcome, type GapUnitOutcome } from '../analysis/reducers.js';
import { reviewCategoryMessageBlockIds, REVIEW_CROSS_CHAPTER_CONTRACT_DIGEST, type ReviewCrossChapterResult, type ReviewCategoryUnitResult, type ReviewUnitFinding } from './review-category-contract.js';
import type { CrossUnitOutcome } from '../analysis/reducers.js';

/**
 * Typed reducers over review-category unit results: Reference Integrity, then the finding set.
 *
 * The order is the factual kind's and for the same reason. The model lists findings and quotes the
 * manuscript for each; nothing it says about *where* a quotation sits is trusted. This reducer locates
 * every quotation itself in the committed block the finding named; only on not-found does it search
 * the complete authorized unit envelope for exactly one occurrence. A verified quotation gains a
 * source range — the range an Editorial Mark is later made
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
  'contract-schema-invalid': '发现的字段或文字不符合审阅契约。',
  'contract-quote-not-in-block': '发现引用的内容块序号不在本单元中。',
  'contract-replacement-required': '修改建议缺少替换文字。',
  'contract-replacement-refused': '批注不能包含替换文字。',
  'contract-clause-unknown': '发现引用了本次审阅未列出的依据。',
  'not-exact-fetched': '未经精确取文',
  'quote-not-found': '引文未能在本单元完整的授权内容块中定位；该发现不获得来源范围，也不形成标记。',
  'quote-ambiguous': '引文存在多个精确匹配，锚点不唯一；该发现不获得来源范围，也不形成标记。',
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
  readonly exactOccurrences?: boolean;
}

export function reduceReviewCategory(input: ReviewCategoryReductionInput): ReviewCategoryReduction {
  const { manifest, blocks, categoryId } = input;
  const ordered = orderUnitOutcomes(manifest, input.outcomes);
  const closed = ordered.filter((outcome): outcome is ClosedUnitOutcome<ReviewCategoryUnitResult> => outcome.state === 'closed');
  const resultDigests = new Map(input.exactOccurrences ? closed.map((outcome) => [outcome.unitOrdinal, sha256Hex(canonicalJson(outcome.result))]) : []);
  const gaps = unitGaps(manifest, ordered);
  // A unit the plan left out of scope is a gap in the coverage and nothing else: the Run lost nothing
  // there, so it never counts against a stage's closure.
  const outOfScope = gaps.filter((gap) => gap.code === 'out-of-scope').length;
  const lost = gaps.length - outOfScope;

  const bySeverity = Object.fromEntries(REVIEW_FINDING_SEVERITIES.map((severity) => [severity, 0])) as Record<ReviewFindingSeverity, number>;
  let listed = 0;

  // Reference Integrity: preserve declared-block matches, then resolve a missed ordinal only within
  // the exact message envelope. Missing pinned records cannot establish envelope-wide uniqueness.
  const located: LocatedFinding[] = [];
  const rejected: ReviewCategoryExcludedProjection[] = [];
  for (const outcome of closed) {
    const unit = manifest.units[outcome.unitOrdinal - 1]!;
    const messageBlockIds = reviewCategoryMessageBlockIds(unit);
    const distinctBlockIds = [...new Set(messageBlockIds)];
    const completeEnvelope = distinctBlockIds.every((id) => blocks.has(id));
    for (const entry of outcome.result.rejected ?? []) {
      listed += 1;
      const reason = `contract-${entry.reasonCode}` as ReviewFindingExclusionReason;
      rejected.push({ findingId: findingId({ kind: 'rejected', categoryId, unitOrdinal: outcome.unitOrdinal, index: entry.index }),
        unitOrdinal: outcome.unitOrdinal, findingIndex: entry.index, blockId: '', blockOrdinal: 0,
        quote: '', severity: 'note', note: '', replacement: null, clauseId: null, rawText: entry.text,
        reason, reasonLabel: REVIEW_EXCLUSION_REASON_LABELS[reason] });
    }
    outcome.result.findings.forEach((finding, index) => {
      listed += 1;
      bySeverity[finding.severity] += 1;
      let blockId = messageBlockIds[finding.blockOrdinal - 1];
      let block = blockId === undefined ? undefined : blocks.get(blockId);
      let location: ReturnType<typeof locateQuotation> = block === undefined ? { state: 'not-found' } : locateQuotation(block.text, finding.quote);
      if (location.state === 'not-found' && block !== undefined && completeEnvelope) {
        let occurrences = 0;
        let unique: { block: ManifestBlockInput; location: Extract<ReturnType<typeof locateQuotation>, { state: 'verified' }> } | undefined;
        for (const id of distinctBlockIds) {
          const candidate = blocks.get(id)!;
          const match = locateQuotation(candidate.text, finding.quote);
          if (match.state === 'verified') {
            occurrences += 1;
            unique = { block: candidate, location: match };
          } else if (match.state === 'ambiguous') {
            occurrences += match.occurrences;
          }
        }
        if (occurrences === 1 && unique !== undefined) {
          block = unique.block;
          blockId = block.blockId;
          location = unique.location;
        } else if (occurrences > 1) {
          location = { state: 'ambiguous', occurrences };
        }
      }
      // The contract parser already refused an out-of-range block ordinal, so a missing block here is
      // one the manifest named and the revision does not hold: not found, and never a silent drop.
      located.push({
        unitOrdinal: outcome.unitOrdinal,
        findingOrdinal: (outcome.result.acceptedIndexes?.[index] ?? index) + 1,
        finding,
        blockId: blockId ?? '',
        blockText: block?.text ?? null,
        location,
      });
    });
  }

  // Finding reduction: located findings merge by block, folded quotation and replacement, in unit
  // order; the first occurrence keeps the record and every later one is listed in `mergedFrom`. Two
  // findings on the same words that propose different replacements are two findings.
  const findings: ReviewCategoryFindingProjection[] = [];
  const findingsByKey = new Map<string, number>();
  const excluded: ReviewCategoryExcludedProjection[] = [...rejected];
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
    if (notExactFetched(finding)) { exclude('not-exact-fetched'); continue; }
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
    const coordinates = { blockId: entry.blockId, fromGrapheme: entry.location.fromGrapheme, toGrapheme: entry.location.toGrapheme };
    const reference = { unitOrdinal: entry.unitOrdinal, blockOrdinal: finding.blockOrdinal, findingOrdinal: entry.findingOrdinal,
      unitDigest: manifest.units[entry.unitOrdinal - 1]!.digest,
      resultDigest: resultDigests.get(entry.unitOrdinal)! };
    const key = canonicalJson(input.exactOccurrences ? [coordinates, replacement] : [entry.blockId, normalized, replacement]);
    const existing = findingsByKey.get(key);
    if (existing !== undefined) {
      merged += 1;
      const survivor = findings[existing]!;
      findings[existing] = {
        ...survivor,
        mergedFrom: [...survivor.mergedFrom, { unitOrdinal: entry.unitOrdinal, blockOrdinal: finding.blockOrdinal, findingOrdinal: entry.findingOrdinal }],
        ...(input.exactOccurrences ? { unitFindingRefs: [...survivor.unitFindingRefs!, reference] } : {}),
      };
      continue;
    }
    findingsByKey.set(key, findings.length);
    findings.push({
      findingId: findingId(input.exactOccurrences ? { kind: 'finding', categoryId, ...coordinates, replacement }
        : { kind: 'finding', categoryId, blockId: entry.blockId, quote: normalized, replacement }),
      unitOrdinal: entry.unitOrdinal,
      blockId: entry.blockId,
      sourceRange: { blockId: entry.blockId, fromGrapheme: entry.location.fromGrapheme, toGrapheme: entry.location.toGrapheme },
      quote: finding.quote,
      severity: finding.severity,
      note: finding.note,
      replacement,
      clauseId: finding.clauseId ?? null,
      mergedFrom: [],
      ...(input.exactOccurrences ? { unitFindingRefs: [reference] } : {}),
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

/** Local grouping precedes the one model turn. Only closed, in-scope blocks can supply evidence. */
export function reviewCrossChapterInput(input: ReviewCategoryReductionInput, baseline: ReviewBaselineSource | null, categoryContractDigest: string): ReviewCrossChapterInput {
  const reduction = reduceReviewCategory({ ...input, exactOccurrences: true });
  const findings = reduction.findings.slice(0, 200);
  const closed = new Set(input.outcomes.filter((outcome) => outcome.state === 'closed').map((outcome) => outcome.unitOrdinal));
  const unitsByBlock = new Map(input.manifest.units.filter((unit) => closed.has(unit.ordinal))
    .flatMap((unit) => unit.blockIds.map((id) => [id, unit.ordinal] as const)));
  const evidence: ReviewSynthesisEvidence[] = [];
  const byRange = new Map<string, ReviewSynthesisEvidence>();
  let omittedEvidence = 0;
  const add = (range: ReviewSynthesisEvidence['sourceRange'], refs: ReviewSynthesisEvidence['unitFindingRefs'], leadRefs: string[]): boolean => {
    const block = input.blocks.get(range.blockId);
    const unitOrdinal = unitsByBlock.get(range.blockId);
    if (block === undefined || unitOrdinal === undefined || range.fromGrapheme < 0 || range.toGrapheme > block.graphemes || range.toGrapheme <= range.fromGrapheme) return false;
    const key = canonicalJson(range);
    const existing = byRange.get(key);
    if (existing !== undefined) {
      existing.unitFindingRefs = [...existing.unitFindingRefs, ...refs];
      existing.baselineLeadRefs = [...new Set([...existing.baselineLeadRefs, ...leadRefs])];
      return true;
    }
    if (evidence.length >= 320) { omittedEvidence += 1; return false; }
    const entry = { ref: `e${evidence.length + 1}`, blockPosition: block.position, sourceRange: range, quote: sliceGraphemes(block.text, range.fromGrapheme, range.toGrapheme), unitOrdinal,
      unitFindingRefs: refs, baselineLeadRefs: leadRefs };
    evidence.push(entry); byRange.set(key, entry); return true;
  };
  for (const finding of findings) add(finding.sourceRange, finding.unitFindingRefs!, []);
  const leads: ReviewBaselineSource['leads'][number][] = [];
  const sameSource = baseline?.manuscriptPin.manuscriptId === input.manifest.manuscript.manuscriptId && baseline.manuscriptPin.revisionDigest === input.manifest.manuscript.revisionDigest;
  if (sameSource && baseline !== null) for (const lead of baseline.leads) {
    // A baseline claim with an out-of-scope side must not leak that side's words through its description.
    if (lead.ranges.length === 0 || lead.ranges.some((range) => !unitsByBlock.has(range.blockId))) continue;
    const ranges = lead.ranges.flatMap((range) => {
      const block = input.blocks.get(range.blockId);
      if (block === undefined) return [];
      const from = range.fromGrapheme ?? 0;
      const exact = { blockId: range.blockId, fromGrapheme: from, toGrapheme: Math.min(range.toGrapheme ?? block.graphemes, from + 80) };
      return add(exact, [], [lead.ref]) ? [exact] : [];
    });
    if (ranges.length > 0) leads.push({ ...lead, ranges });
  }
  const units = input.outcomes.filter((outcome) => outcome.state === 'closed').map((outcome) => ({ unitOrdinal: outcome.unitOrdinal,
    unitDigest: input.manifest.units.find((unit) => unit.ordinal === outcome.unitOrdinal)!.digest, resultDigest: sha256Hex(canonicalJson(outcome.result)) }));
  return { schema: 'ai7.editorial-review.cross-chapter-input/1', categoryId: input.categoryId, categoryContractDigest,
    closedUnitSetDigest: sha256Hex(canonicalJson(units)), units: units.slice(0, 200), manuscriptPin: input.manifest.manuscript,
    baseline: baseline === null ? null : { ...baseline, leads }, findings: findings.filter((finding) => unitsByBlock.has(finding.blockId)), evidence,
    omitted: { units: Math.max(0, units.length - 200), findings: reduction.findings.length - findings.length, evidence: omittedEvidence, baselineLeads: (baseline?.omitted ?? 0) + (baseline?.leads.length ?? 0) - leads.length } };
}

/** Synthesis enriches exact occurrences without deleting any unit evidence or moving a source anchor. */
export function applyReviewCrossChapter(reduction: ReviewCategoryReduction, outcome: CrossUnitOutcome, categoryId: string): ReviewCategoryReduction {
  const result = outcome.state === 'closed' ? outcome.result as ReviewCrossChapterResult : null;
  const findings = [...reduction.findings];
  const excluded = [...reduction.excluded];
  let merged = 0;
  const baseline = result?.input.baseline;
  const pin = baseline == null ? null : { resultSetId: baseline.resultSetId, revisionId: baseline.revisionId, digest: baseline.digest, manuscriptPin: baseline.manuscriptPin };
  if (result !== null && outcome.state === 'closed') {
    for (const finding of result.findings) {
      const { anchor } = finding;
      const index = findings.findIndex((existing) => canonicalJson(existing.sourceRange) === canonicalJson(anchor.sourceRange) && existing.replacement === null);
      const previous = index < 0 ? undefined : findings[index];
      const refs = [...(previous?.unitFindingRefs ?? []), ...finding.evidence.flatMap((evidence) => evidence.unitFindingRefs)];
      const card: ReviewCategoryFindingProjection = {
        findingId: previous?.findingId ?? findingId({ kind: 'finding', categoryId, ...anchor.sourceRange, replacement: null }),
        unitOrdinal: anchor.unitOrdinal, blockId: anchor.sourceRange.blockId, sourceRange: anchor.sourceRange, quote: anchor.quote,
        severity: finding.severity, note: finding.note, replacement: null, clauseId: finding.clauseId, mergedFrom: previous?.mergedFrom ?? [],
        unitFindingRefs: [...new Map(refs.map((ref) => [canonicalJson(ref), ref])).values()],
        crossChapter: { contractDigest: REVIEW_CROSS_CHAPTER_CONTRACT_DIGEST, requestDigest: outcome.requestDigest, evidence: finding.evidence, baseline: pin },
      };
      if (index < 0) findings.push(card); else { findings[index] = card; merged += 1; }
    }
    for (const rejected of result.rejected) excluded.push({ findingId: findingId({ kind: 'cross-chapter-excluded', categoryId, requestDigest: outcome.requestDigest, index: rejected.index }),
      unitOrdinal: 0, findingIndex: rejected.index, blockId: '', blockOrdinal: 0, quote: '', severity: 'note', note: '', replacement: null, clauseId: null,
      rawText: rejected.text, reason: 'contract-schema-invalid', reasonLabel: rejected.reason === 'evidence-unknown' ? '跨章发现引用了未提供的来源。' : REVIEW_EXCLUSION_REASON_LABELS['contract-schema-invalid'] });
  }
  const state: AnalysisReducerStageProjection['state'] = outcome.state === 'closed' ? result!.rejected.length > 0 ? 'closed-with-gaps' : 'closed' : outcome.state === 'gap' ? 'closed-with-gaps' : 'not-run';
  const stages = [...reduction.reducerClosure.stages, stage('cross-unit-reduction', reduction.findings.length, 0),
    { stage: 'cross-chapter-consistency' as const, state, inputCount: result?.input.findings.length ?? 0 }];
  const closedWithGaps = stages.some((entry) => entry.state !== 'closed');
  return { ...reduction, findings, excluded,
    findingCounts: { ...reduction.findingCounts, listed: reduction.findingCounts.listed + (result?.findings.length ?? 0) + (result?.rejected.length ?? 0),
      located: reduction.findingCounts.located + (result?.findings.length ?? 0), excluded: excluded.length, merged: reduction.findingCounts.merged + merged,
      bySeverity: reduction.findingCounts.bySeverity.map((entry) => ({ ...entry, count: entry.count + (result?.findings.filter((finding) => finding.severity === entry.severity).length ?? 0) })) },
    reducerClosure: { axis: 'reducer-closure', state: closedWithGaps ? 'closed-with-gaps' : 'closed', stages,
      label: closedWithGaps ? `归约/综合闭合：跨章一致性${outcome.state === 'closed' ? '保留排除发现' : `未闭合 · ${outcome.reason}`}` : '归约/综合闭合：全部阶段已闭合' },
    assurance: { ...reduction.assurance, state: excluded.length > 0 || outcome.state !== 'closed' ? 'limited' : reduction.assurance.state,
      label: `语义/证据保证：${closedWithGaps ? '有限' : '合格'} · ${findings.length} 条发现已定位 · 均待编辑处置`,
      unresolvedItemCount: findings.length, crossUnitFindingCount: result?.findings.length ?? 0 },
  };
}
