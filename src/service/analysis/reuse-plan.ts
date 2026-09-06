import type {
  AnalysisReusePlanCounts,
  AnalysisReusePlanPredecessorUnitProjection,
  AnalysisReusePlanProjection,
  AnalysisReusePlanUnitProjection,
  BaselineAnalysisSelectedRange,
  BaselineAnalysisUpdateMode,
  CoverageManifestProjection,
} from '../../shared/protocol.js';
import { canonicalRecord, requireAnalysis } from './canonical.js';
import { unitContentKeys } from './coverage-manifest.js';
import { BASELINE_ANALYSIS_CONTRACT_VERSION } from './identity.js';

/**
 * The deterministic reuse plan of one update Task: which units of the new Coverage Manifest reuse a
 * predecessor unit result and which are recomputed, and what became of every predecessor unit.
 *
 * Compatibility is content-exact and position-independent: a predecessor unit result serves a new
 * unit only when the predecessor unit closed (a gap is never reused), the predecessor revision was
 * produced under the same contract version, and the two units share the {@link unitContentKeys} key
 * (own block digests and overlap block digests, in order). Ordinal and position may differ; the
 * lineage remaps them. Every new unit is classified exactly once as `reused` or `recomputed`; every
 * predecessor unit is exactly once `reused` (by a successor), `bypassed` (compatible, but the mode
 * bypassed it), or `invalidated` (no compatible successor). The same inputs always yield the same
 * canonical plan and digest, which preparation records and execution re-derives.
 */
export const REUSE_PLAN_SCHEMA = 'ai7.baseline-manuscript-analysis.reuse-plan/1' as const;

export interface ReusePlanPredecessor {
  readonly revisionId: string;
  readonly ordinal: number;
  readonly digest: string;
  readonly contractVersion: string;
  readonly coverageManifestDigest: string;
  readonly manifest: CoverageManifestProjection;
  readonly unitStates: ReadonlyArray<{ readonly unitOrdinal: number; readonly state: 'closed' | 'gap' }>;
}

export interface ReusePlanInput {
  readonly mode: BaselineAnalysisUpdateMode;
  readonly selectedRange: BaselineAnalysisSelectedRange | null;
  readonly manifest: CoverageManifestProjection;
  readonly predecessor: ReusePlanPredecessor;
}

/** A selected range is an explicit editor choice over exact block positions of the Task Input revision. */
export function requireSelectedRange(range: BaselineAnalysisSelectedRange | null, totalBlocks: number): BaselineAnalysisSelectedRange {
  requireAnalysis(range !== null && Number.isSafeInteger(range.startPosition) && Number.isSafeInteger(range.endPosition) &&
    range.startPosition >= 1 && range.endPosition >= range.startPosition && range.endPosition <= totalBlocks,
  'ANALYSIS_SELECTED_RANGE_INVALID', '所选内容块范围不在任务输入修订版之内。');
  return { startPosition: range.startPosition, endPosition: range.endPosition };
}

/**
 * The units `重新分析所选范围` recomputes: every unit whose own range intersects the selected block
 * range, plus every unit whose overlap context comes from one of those units.
 */
export function selectedRangeClosure(manifest: CoverageManifestProjection, range: BaselineAnalysisSelectedRange): Set<number> {
  const intersecting = new Set<number>();
  for (const unit of manifest.units) {
    if (unit.endPosition >= range.startPosition && unit.startPosition <= range.endPosition) intersecting.add(unit.ordinal);
  }
  const closure = new Set(intersecting);
  for (const unit of manifest.units) {
    if (unit.overlapBlockIds.length === 0) continue;
    const source = manifest.units.find((candidate) => intersecting.has(candidate.ordinal) &&
      unit.overlapBlockIds.every((blockId) => candidate.blockIds.includes(blockId)));
    if (source !== undefined) closure.add(unit.ordinal);
  }
  return closure;
}

export function deriveReusePlan(input: ReusePlanInput): AnalysisReusePlanProjection {
  const { mode, manifest, predecessor } = input;
  const selectedRange = mode === 'reanalyze-range' ? requireSelectedRange(input.selectedRange, manifest.totalBlocks) : null;
  requireAnalysis(mode !== 'reanalyze-range' || input.selectedRange !== null, 'ANALYSIS_SELECTED_RANGE_INVALID', '重新分析所选范围需要一个明确的内容块范围。');
  requireAnalysis(mode === 'reanalyze-range' || input.selectedRange === null, 'ANALYSIS_SELECTED_RANGE_INVALID', '只有重新分析所选范围可以携带内容块范围。');
  const states = new Map(predecessor.unitStates.map((unit) => [unit.unitOrdinal, unit.state] as const));
  requireAnalysis(predecessor.manifest.units.every((unit) => states.has(unit.ordinal)) && states.size === predecessor.manifest.units.length,
    'ANALYSIS_RECORD_INVALID', '前一修订版的单元结果与其覆盖清单不一致。');
  const contractCompatible = predecessor.contractVersion === BASELINE_ANALYSIS_CONTRACT_VERSION;
  const newKeys = unitContentKeys(manifest);
  const predecessorKeys = unitContentKeys(predecessor.manifest);
  const closedByKey = new Map<string, number[]>();
  const gapKeys = new Set<string>();
  predecessor.manifest.units.forEach((unit, index) => {
    const key = predecessorKeys[index]!;
    if (states.get(unit.ordinal) === 'closed') closedByKey.set(key, [...(closedByKey.get(key) ?? []), unit.ordinal]);
    else gapKeys.add(key);
  });
  const closure = selectedRange === null ? new Set<number>() : selectedRangeClosure(manifest, selectedRange);
  const consumed = new Map<number, { disposition: 'reused' | 'bypassed'; successorUnitOrdinal: number }>();
  const units: AnalysisReusePlanUnitProjection[] = manifest.units.map((unit, index) => {
    const contentKey = newKeys[index]!;
    const candidates = contractCompatible ? (closedByKey.get(contentKey) ?? []) : [];
    const candidate = candidates.find((ordinal) => !consumed.has(ordinal)) ?? null;
    const base = { unitOrdinal: unit.ordinal, startPosition: unit.startPosition, endPosition: unit.endPosition, contentKey };
    const bypassed: 'bypassed-whole-book' | 'bypassed-selected-range' | null = mode === 'reanalyze-book'
      ? 'bypassed-whole-book'
      : mode === 'reanalyze-range' && closure.has(unit.ordinal) ? 'bypassed-selected-range' : null;
    if (candidate !== null) {
      consumed.set(candidate, { disposition: bypassed === null ? 'reused' : 'bypassed', successorUnitOrdinal: unit.ordinal });
      if (bypassed === null) {
        return { ...base, disposition: 'reused', reason: 'compatible', reusedFrom: { revisionId: predecessor.revisionId, revisionOrdinal: predecessor.ordinal, unitOrdinal: candidate } };
      }
      return { ...base, disposition: 'recomputed', reason: bypassed, reusedFrom: null };
    }
    const reason: AnalysisReusePlanUnitProjection['reason'] = bypassed !== null
      ? bypassed
      : !contractCompatible ? 'contract-version-mismatch'
        : gapKeys.has(contentKey) ? 'predecessor-gap' : 'no-compatible-predecessor';
    return { ...base, disposition: 'recomputed', reason, reusedFrom: null };
  });
  const predecessorUnits: AnalysisReusePlanPredecessorUnitProjection[] = predecessor.manifest.units.map((unit) => {
    const use = consumed.get(unit.ordinal);
    return {
      unitOrdinal: unit.ordinal,
      state: states.get(unit.ordinal)!,
      disposition: use === undefined ? 'invalidated' : use.disposition,
      successorUnitOrdinal: use === undefined ? null : use.successorUnitOrdinal,
    };
  });
  const counts: AnalysisReusePlanCounts = {
    reused: units.filter((unit) => unit.disposition === 'reused').length,
    recomputed: units.filter((unit) => unit.disposition === 'recomputed').length,
    invalidated: predecessorUnits.filter((unit) => unit.disposition === 'invalidated').length,
    bypassed: predecessorUnits.filter((unit) => unit.disposition === 'bypassed').length,
  };
  return {
    schema: REUSE_PLAN_SCHEMA,
    mode,
    contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
    predecessor: {
      revisionId: predecessor.revisionId,
      ordinal: predecessor.ordinal,
      digest: predecessor.digest,
      contractVersion: predecessor.contractVersion,
      coverageManifestDigest: predecessor.coverageManifestDigest,
      unitCount: predecessor.manifest.units.length,
    },
    coverageManifestDigest: manifest.digest,
    selectedRange,
    recomputeClosure: Array.from(closure).sort((left, right) => left - right),
    units,
    predecessorUnits,
    counts,
  };
}

/** Canonical JSON and digest of a plan; what the `reuse-plan` plan component stores and the envelope pins. */
export function reusePlanRecord(plan: AnalysisReusePlanProjection): { json: string; digest: string } {
  return canonicalRecord(plan);
}
