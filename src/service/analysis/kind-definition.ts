import {
  BASELINE_ANALYSIS_CONTRACT_VERSION,
  BASELINE_ANALYSIS_KIND,
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_MODE_LABELS,
  BASELINE_ANALYSIS_MODE_MEANINGS,
  BASELINE_ANALYSIS_UPDATE_MODES,
  FACTUAL_REVIEW_CONTRACT_VERSION,
  FACTUAL_REVIEW_EXPECTED_OUTCOME,
  FACTUAL_REVIEW_KIND,
  FACTUAL_REVIEW_MODE_GOALS,
  FACTUAL_REVIEW_MODE_LABELS,
  FACTUAL_REVIEW_MODE_MEANINGS,
  FACTUAL_REVIEW_TASK_MODES,
  type AnalysisAssuranceAxis,
  type AnalysisCoverageAxis,
  type AnalysisCrossUnitFindingProjection,
  type AnalysisGapProjection,
  type AnalysisKindId,
  type AnalysisReducerClosureAxis,
  type AnalysisReducerStageProjection,
  type AnalysisTaskMode,
  type CoverageManifestProjection,
  type CoverageManifestUnitProjection,
  type FactualReviewFindingProjection,
} from '../../shared/protocol.js';
import { FixtureReplayResearchCapability, type ResearchCapability } from '../capabilities/research.js';
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  ASSURANCE_SAMPLING_RESULT_SCHEMA,
  type AssuranceSamplingCandidate,
} from './assurance-sampling-contract.js';
import { canonicalJson, sha256Hex } from './canonical.js';
import {
  BASELINE_PROMPT_CONTRACT,
  BASELINE_PROMPT_CONTRACT_DIGEST,
  BASELINE_UNIT_RESULT_SCHEMA,
  buildUnitMessage,
  parseUnitMessageHeader,
  parseUnitResult,
  unitRequestDigest,
  type BaselineUnitResult,
} from './contract.js';
import type { ManifestBlockInput } from './coverage-manifest.js';
import {
  BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST,
  BASELINE_CROSS_UNIT_RESULT_SCHEMA,
  CROSS_UNIT_FINDING_KINDS,
} from './cross-unit-contract.js';
import {
  BASELINE_ANALYSIS_EXPECTED_OUTCOME,
  BASELINE_ANALYSIS_TASK_GOAL,
  BASELINE_ANALYSIS_TASK_MODES,
} from './identity.js';
import {
  FACTUAL_REVIEW_PROMPT_CONTRACT,
  FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST,
  FACTUAL_REVIEW_RESULT_SET_REVISION_SCHEMA,
  FACTUAL_REVIEW_SUCCESSOR_REVISION_SCHEMA,
  FACTUAL_REVIEW_UNIT_RESULT_SCHEMA,
  buildFactualReviewUnitMessage,
  factualReviewMessageBlockIds,
  factualReviewRequestDigest,
  parseFactualReviewUnitMessageHeader,
  parseFactualReviewUnitResult,
  type FactualReviewUnitResult,
} from './factual-review-contract.js';
import { reduceFactualReview, type FactualUnitOutcome } from './factual-review-reducers.js';
import {
  PRE_ASSURANCE_SAMPLE,
  assuranceSamplingStage,
  reduceBaselineAnalysis,
  withSampledPrecision,
  type AssuranceSampleOutcome,
  type ClosedUnitOutcome,
  type GapUnitOutcome,
  type UnitOutcome,
} from './reducers.js';
import type { CrossUnitOutcome } from './reducers.js';

/**
 * What one analysis kind is, as data the shared owners read.
 *
 * A Book may hold more than one kind of covered analysis (Issue #53). Both kinds travel the same real
 * path — Task Intent, input checkpoint, Coverage Manifest, Plan Envelope, standard Run Authorization,
 * Run, Result Set Revision — and the ledger, the execution owner, the Egress Gate, the adapter, and
 * the Provider Result Cache are the same owners for both. What differs is exactly this record: the
 * kind's identity and contract version, its Task modes and their fixed goal texts, the frozen prompt
 * contract its units are read under, the parser that admits a unit result, the reducer that turns
 * closed units into Result Set components, and the stages its closure reports.
 *
 * Nothing here is a copy of the baseline owner. The baseline definition is assembled from the modules
 * that already own its parts, so a change to the baseline contract still has exactly one home.
 */
export interface AnalysisModeDefinition {
  readonly mode: AnalysisTaskMode;
  readonly goal: string;
  readonly label: string;
  readonly meaning: string;
  /** A mode that starts a Result Set: it names no predecessor revision. */
  readonly initial: boolean;
  /** A mode that carries an explicitly selected block range. */
  readonly rangeBound: boolean;
}

/** The reduction every kind produces: the shared axes, the gaps, and the kind's own components. */
export interface AnalysisReductionResult {
  readonly coverage: AnalysisCoverageAxis;
  readonly reducerClosure: AnalysisReducerClosureAxis;
  readonly assurance: AnalysisAssuranceAxis;
  readonly gaps: ReadonlyArray<AnalysisGapProjection>;
  /** The kind-specific keys of the Result Set Revision body, canonicalized with the shared ones. */
  readonly components: Readonly<Record<string, unknown>>;
  /** What the Run's terminal state row discloses as its conflict count; `0` for a kind with no conflict pass. */
  readonly conflictCount: number;
}

export interface AnalysisReductionInput {
  readonly manifest: CoverageManifestProjection;
  readonly outcomes: ReadonlyArray<ClosedUnitOutcome<unknown> | GapUnitOutcome>;
  readonly reusedUnitOrdinals: ReadonlySet<number>;
  /** The committed blocks of the Task Input revision; a kind that anchors quotations reads their text. */
  readonly blocks: ReadonlyMap<string, ManifestBlockInput>;
  /** The model-driven cross-unit reduction's outcome, for the one kind that declares the suboperation. */
  readonly crossUnit: CrossUnitOutcome;
}

export type UnitResultParseOutcome =
  | { readonly ok: true; readonly result: unknown; readonly canonicalJson: string; readonly digest: string }
  | { readonly ok: false; readonly code: string; readonly detail: string };

/** The cross-unit suboperation of a kind that declares one (ADR 0066); `null` for a kind that does not. */
export interface CrossUnitContractBinding {
  readonly promptContractDigest: string;
  readonly resultSchema: string;
}

/**
 * The assurance sampling suboperation of a kind that declares one (ADR 0066); `null` for a kind that
 * does not. The universe of the sample is whatever the kind calls a finding, so the kind — not the
 * execution owner and not the sampling contract — says which of its own reduction's components are
 * sampleable and how each one reads as a candidate.
 */
export interface AssuranceSamplingBinding {
  readonly promptContractDigest: string;
  readonly resultSchema: string;
  /** The sampleable findings of one reduction, in the order their `ref`s were assigned. */
  candidates(reduction: AnalysisReductionResult): ReadonlyArray<AssuranceSamplingCandidate>;
}

/**
 * The second reducer pass: fold one Run's assurance sample into the reduction it was drawn from.
 *
 * It adds the sample component, appends the sampling stage to the closure axis after the kind's last
 * stage, and re-labels the assurance axis. It touches nothing else — every finding component comes
 * through byte-identical, which is the whole promise of ADR 0066's "sampling never edits, deletes, or
 * reorders findings" and what the Journey asserts by reading the same revision both ways.
 *
 * The closure axis keeps the `state` and `label` its kind's reducers gave it. What the sampling did is
 * reported by its own stage row and by `assuranceSample.state`; the axis it feeds is the assurance
 * axis, which is where ADR 0066 puts it.
 */
export function applyAssuranceSample(reduction: AnalysisReductionResult, sample: AssuranceSampleOutcome): AnalysisReductionResult {
  return {
    ...reduction,
    assurance: withSampledPrecision(reduction.assurance, sample),
    reducerClosure: { ...reduction.reducerClosure, stages: [...reduction.reducerClosure.stages, assuranceSamplingStage(sample)] },
    components: { ...reduction.components, assuranceSample: sample },
  };
}

export interface AnalysisKindDefinition {
  readonly kind: AnalysisKindId;
  readonly contractVersion: string;
  readonly expectedOutcome: string;
  /** The goal text of the kind's initial mode: what `prepare` without an update request must carry. */
  readonly taskGoal: string;
  readonly initialMode: AnalysisTaskMode;
  readonly modes: ReadonlyArray<AnalysisModeDefinition>;
  /** The update modes an editor may prepare today; empty for a kind whose update surfaces are later work. */
  readonly updateModes: ReadonlyArray<AnalysisTaskMode>;
  readonly systemPrompt: string;
  readonly promptContractDigest: string;
  readonly unitResultSchema: string;
  readonly revisionSchema: string;
  readonly successorRevisionSchema: string;
  readonly schemaDigest: string;
  readonly reducerDigest: string;
  /** The stages the plan declares, in order; the closure axis reports the same list. */
  readonly reducerStages: ReadonlyArray<AnalysisReducerStageProjection['stage']>;
  readonly executionSteps: ReadonlyArray<string>;
  readonly updateExecutionSteps: ReadonlyArray<string>;
  readonly crossUnit: CrossUnitContractBinding | null;
  /** Why the cross-unit stage did not run, for a kind that declares no such stage. */
  readonly crossUnitAbsentReason: string;
  readonly assurance: AssuranceSamplingBinding | null;
  /** Why the sampling stage did not run, for a kind that declares no such stage. */
  readonly assuranceAbsentReason: string;
  buildUnitMessage(
    unit: CoverageManifestUnitProjection,
    totalUnits: number,
    blocksById: ReadonlyMap<string, Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>>,
  ): string;
  /** Recover the unit identity from a message this kind built; `null` for any other message. */
  parseUnitMessageHeader(text: string): { ordinal: number; total: number; unitDigest: string } | null;
  requestDigest(unitOrdinal: number, unitDigest: string): string;
  parseUnitResult(text: string, unit: CoverageManifestUnitProjection): UnitResultParseOutcome;
  reduce(input: AnalysisReductionInput): AnalysisReductionResult;
  /** The kind-specific keys one persisted unit result carries, beside the shared identity and lineage. */
  unitRecord(result: unknown): Record<string, unknown>;
  /** The kind-specific keys of a stored revision body, read back for the projection. */
  revisionComponents(body: Readonly<Record<string, unknown>>): Record<string, unknown>;
  /** The unresolved-conflict count a stored revision discloses; `0` for a kind with no conflict pass. */
  conflictCountOf(body: Readonly<Record<string, unknown>>): number;
  mode(mode: AnalysisTaskMode): AnalysisModeDefinition;
}

function modeIndex(modes: ReadonlyArray<AnalysisModeDefinition>): (mode: AnalysisTaskMode) => AnalysisModeDefinition {
  const byMode = new Map(modes.map((entry) => [entry.mode, entry] as const));
  return (mode) => {
    const definition = byMode.get(mode);
    if (definition === undefined) throw new Error('ANALYSIS_MODE_UNKNOWN');
    return definition;
  };
}

// ---- baseline manuscript analysis ---------------------------------------------------------------

/** The reducer descriptor and schema digest the baseline revision pins; unchanged since Issue #274. */
export const BASELINE_REDUCER_DESCRIPTOR = {
  schema: 'ai7.baseline-manuscript-analysis.reducers/1',
  stages: ['unit-validation', 'section-reduction', 'contradiction-continuity', 'cross-unit-reduction', 'book-synthesis', 'assurance-sampling'],
  contradictionRules: ['alias-collision', 'entity-kind-divergence', 'setting-claim-divergence'],
  crossUnitFindingKinds: CROSS_UNIT_FINDING_KINDS,
  certaintyPolicy: 'report-only-never-resolve',
} as const;

export const BASELINE_REDUCER_DIGEST = sha256Hex(canonicalJson(BASELINE_REDUCER_DESCRIPTOR));
export const BASELINE_SCHEMA_DIGEST = sha256Hex(canonicalJson({
  contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
  unitResultSchema: BASELINE_UNIT_RESULT_SCHEMA,
  promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
  crossUnitResultSchema: BASELINE_CROSS_UNIT_RESULT_SCHEMA,
  crossUnitPromptContractDigest: BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST,
}));

const BASELINE_EXECUTION_STEPS = ['派生覆盖清单', '逐单元执行基线稿件分析契约 v1', '章节归约', '跨单元矛盾与连续性核对', '全书综合', '形成结果集修订版'] as const;
const BASELINE_UPDATE_EXECUTION_STEPS = ['派生覆盖清单并计算复用计划', '按血缘复用兼容单元', '仅对重算单元逐单元执行基线稿件分析契约 v1', '章节归约', '跨单元矛盾与连续性核对', '全书综合', '追加后继结果集修订版'] as const;
const BASELINE_REDUCER_STAGES = ['unit-validation', 'section-reduction', 'contradiction-continuity', 'book-synthesis'] as const;
/** How a revision recorded before Issue #274 reads: its Run had no cross-unit reduction to report. */
const PRE_CROSS_UNIT_REDUCTION = {
  state: 'not-run',
  reason: '该修订版由未包含跨单元归纳的运行产生。',
  requestDigest: null,
  usage: null,
  findingCount: 0,
} as const;

const BASELINE_MODES: ReadonlyArray<AnalysisModeDefinition> = BASELINE_ANALYSIS_TASK_MODES.map((mode) => ({
  mode,
  goal: BASELINE_ANALYSIS_MODE_GOALS[mode],
  label: BASELINE_ANALYSIS_MODE_LABELS[mode],
  meaning: BASELINE_ANALYSIS_MODE_MEANINGS[mode],
  initial: mode === 'first-baseline',
  rangeBound: mode === 'reanalyze-range',
}));

export function baselineAnalysisKindDefinition(): AnalysisKindDefinition {
  return {
    kind: BASELINE_ANALYSIS_KIND,
    contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
    expectedOutcome: BASELINE_ANALYSIS_EXPECTED_OUTCOME,
    taskGoal: BASELINE_ANALYSIS_TASK_GOAL,
    initialMode: 'first-baseline',
    modes: BASELINE_MODES,
    updateModes: BASELINE_ANALYSIS_UPDATE_MODES,
    systemPrompt: BASELINE_PROMPT_CONTRACT.systemPrompt,
    promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
    unitResultSchema: BASELINE_UNIT_RESULT_SCHEMA,
    revisionSchema: 'ai7.baseline-manuscript-analysis.result-set-revision/1',
    successorRevisionSchema: 'ai7.baseline-manuscript-analysis.result-set-revision/2',
    schemaDigest: BASELINE_SCHEMA_DIGEST,
    reducerDigest: BASELINE_REDUCER_DIGEST,
    reducerStages: BASELINE_REDUCER_STAGES,
    executionSteps: BASELINE_EXECUTION_STEPS,
    updateExecutionSteps: BASELINE_UPDATE_EXECUTION_STEPS,
    crossUnit: { promptContractDigest: BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, resultSchema: BASELINE_CROSS_UNIT_RESULT_SCHEMA },
    crossUnitAbsentReason: '',
    assurance: {
      promptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
      resultSchema: ASSURANCE_SAMPLING_RESULT_SCHEMA,
      // The baseline kind's sampleable findings are the model-driven cross-unit ones: the deterministic
      // conflicts are a string-matching pass whose reading a re-read of one unit could not settle. A
      // finding is anchored in its first side's unit, which is the unit the sample re-reads it against.
      candidates: (reduction) =>
        (reduction.components.crossUnitFindings as ReadonlyArray<AnalysisCrossUnitFindingProjection>).map((finding, index) => ({
          ref: String(index),
          unitOrdinal: finding.sides[0]!.unitOrdinal,
          tier: finding.confidence,
          text: finding.description,
        })),
    },
    assuranceAbsentReason: '',
    buildUnitMessage,
    parseUnitMessageHeader,
    requestDigest: (unitOrdinal, unitDigest) => unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unitOrdinal, unitDigest),
    parseUnitResult: (text, unit) => parseUnitResult(text, { unitOrdinal: unit.ordinal, blockIds: [...unit.blockIds, ...unit.overlapBlockIds] }),
    reduce: (input) => {
      const reduction = reduceBaselineAnalysis(
        input.manifest,
        input.outcomes as ReadonlyArray<UnitOutcome>,
        input.reusedUnitOrdinals,
        input.crossUnit,
      );
      return {
        coverage: reduction.coverage,
        reducerClosure: reduction.reducerClosure,
        assurance: reduction.assurance,
        gaps: reduction.gaps,
        components: {
          conflicts: reduction.conflicts,
          crossUnitFindings: reduction.crossUnitFindings,
          crossUnitReduction: reduction.crossUnitReduction,
          sections: reduction.sections,
          synthesis: reduction.synthesis,
        },
        conflictCount: reduction.conflicts.length,
      };
    },
    unitRecord: (result) => {
      const { schema: _schema, unitOrdinal: _unitOrdinal, ...rest } = result as Record<string, unknown>;
      return rest;
    },
    revisionComponents: (body) => ({
      conflicts: body.conflicts,
      // A revision written before Issue #274 carries neither field; it is immutable history and is
      // read as what it is — a revision whose Run never ran the reduction — never rewritten to add them.
      crossUnitFindings: body.crossUnitFindings ?? [],
      crossUnitReduction: body.crossUnitReduction ?? PRE_CROSS_UNIT_REDUCTION,
      assuranceSample: body.assuranceSample ?? PRE_ASSURANCE_SAMPLE,
      sections: body.sections,
      synthesis: body.synthesis,
    }),
    conflictCountOf: (body) => (body.conflicts as ReadonlyArray<unknown> | undefined)?.length ?? 0,
    mode: modeIndex(BASELINE_MODES),
  };
}

// ---- factual review ------------------------------------------------------------------------------

export const FACTUAL_REVIEW_REDUCER_DESCRIPTOR = {
  schema: 'ai7.factual-review.reducers/1',
  stages: ['unit-validation', 'reference-integrity', 'finding-reduction', 'assurance-sampling'],
  referenceIntegrity: 'deterministic-normalized-exact-match-in-committed-block',
  normalization: ['whitespace-collapse', 'fullwidth-halfwidth-ascii'],
  findingClasses: ['real-world-fact', 'quotation'],
  mergeRule: 'same-block-same-normalized-quotation',
  exclusionReasons: ['quote-not-found', 'quote-ambiguous'],
  certaintyPolicy: 'list-and-locate-never-verify',
} as const;

export const FACTUAL_REVIEW_REDUCER_DIGEST = sha256Hex(canonicalJson(FACTUAL_REVIEW_REDUCER_DESCRIPTOR));
export const FACTUAL_REVIEW_SCHEMA_DIGEST = sha256Hex(canonicalJson({
  contractVersion: FACTUAL_REVIEW_CONTRACT_VERSION,
  unitResultSchema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA,
  promptContractDigest: FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST,
}));

const FACTUAL_REVIEW_EXECUTION_STEPS = ['派生覆盖清单', '逐单元执行事实核查契约 v1', '按内容块文本确定性校验每条引文', '归约为事实核查发现', '形成结果集修订版'] as const;
const FACTUAL_REVIEW_UPDATE_EXECUTION_STEPS = FACTUAL_REVIEW_EXECUTION_STEPS;
const FACTUAL_REVIEW_REDUCER_STAGES = ['unit-validation', 'reference-integrity', 'finding-reduction'] as const;
const FACTUAL_REVIEW_CROSS_UNIT_ABSENT_REASON = '本分析种类没有跨单元归纳阶段。' as const;

const FACTUAL_REVIEW_MODES: ReadonlyArray<AnalysisModeDefinition> = FACTUAL_REVIEW_TASK_MODES.map((mode) => ({
  mode,
  goal: FACTUAL_REVIEW_MODE_GOALS[mode],
  label: FACTUAL_REVIEW_MODE_LABELS[mode],
  meaning: FACTUAL_REVIEW_MODE_MEANINGS[mode],
  initial: mode === 'whole-manuscript',
  rangeBound: mode === 'range',
}));

/**
 * The factual kind. Its research capability refuses under every scope this slice can run in, so the
 * definition takes the `development-ci` fixture-replay implementation with no fixtures admitted:
 * that is exactly what the slice ships, and its answer — `外部研究未获准` — is the same refusal every
 * other scope returns. A scope-bound capability arrives with the accepted egress (ADR 0074).
 */
export function factualReviewKindDefinition(research: ResearchCapability = new FixtureReplayResearchCapability()): AnalysisKindDefinition {
  return {
    kind: FACTUAL_REVIEW_KIND,
    contractVersion: FACTUAL_REVIEW_CONTRACT_VERSION,
    expectedOutcome: FACTUAL_REVIEW_EXPECTED_OUTCOME,
    taskGoal: FACTUAL_REVIEW_MODE_GOALS['whole-manuscript'],
    initialMode: 'whole-manuscript',
    modes: FACTUAL_REVIEW_MODES,
    updateModes: [],
    systemPrompt: FACTUAL_REVIEW_PROMPT_CONTRACT.systemPrompt,
    promptContractDigest: FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST,
    unitResultSchema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA,
    revisionSchema: FACTUAL_REVIEW_RESULT_SET_REVISION_SCHEMA,
    successorRevisionSchema: FACTUAL_REVIEW_SUCCESSOR_REVISION_SCHEMA,
    schemaDigest: FACTUAL_REVIEW_SCHEMA_DIGEST,
    reducerDigest: FACTUAL_REVIEW_REDUCER_DIGEST,
    reducerStages: FACTUAL_REVIEW_REDUCER_STAGES,
    executionSteps: FACTUAL_REVIEW_EXECUTION_STEPS,
    updateExecutionSteps: FACTUAL_REVIEW_UPDATE_EXECUTION_STEPS,
    crossUnit: null,
    crossUnitAbsentReason: FACTUAL_REVIEW_CROSS_UNIT_ABSENT_REASON,
    assurance: {
      promptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
      resultSchema: ASSURANCE_SAMPLING_RESULT_SCHEMA,
      // The factual kind's sampleable findings are the ones Reference Integrity located: an excluded
      // assertion has no source range to re-read it against, and its exclusion is already its reading.
      candidates: (reduction) =>
        (reduction.components.findings as ReadonlyArray<FactualReviewFindingProjection>).map((finding) => ({
          ref: finding.findingId,
          unitOrdinal: finding.unitOrdinal,
          tier: finding.severity,
          text: `「${finding.quote}」${finding.question}`,
        })),
    },
    assuranceAbsentReason: '',
    buildUnitMessage: buildFactualReviewUnitMessage,
    parseUnitMessageHeader: parseFactualReviewUnitMessageHeader,
    requestDigest: (unitOrdinal, unitDigest) => factualReviewRequestDigest(FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST, unitOrdinal, unitDigest),
    parseUnitResult: (text, unit) =>
      parseFactualReviewUnitResult(text, { unitOrdinal: unit.ordinal, blockCount: factualReviewMessageBlockIds(unit).length }),
    reduce: (input) => {
      const reduction = reduceFactualReview({
        manifest: input.manifest,
        outcomes: input.outcomes as ReadonlyArray<FactualUnitOutcome>,
        reusedUnitOrdinals: input.reusedUnitOrdinals,
        blocks: input.blocks,
        research,
      });
      return {
        coverage: reduction.coverage,
        reducerClosure: reduction.reducerClosure,
        assurance: reduction.assurance,
        gaps: reduction.gaps,
        components: {
          findings: reduction.findings,
          excluded: reduction.excluded,
          assertionCounts: reduction.assertionCounts,
          research: reduction.research,
        },
        // The factual kind runs no contradiction pass: its conflicts, when it gains any, are between
        // an assertion and external evidence, and no evidence has been gathered.
        conflictCount: 0,
      };
    },
    unitRecord: (result) => ({ assertions: (result as FactualReviewUnitResult).assertions }),
    revisionComponents: (body) => ({
      findings: body.findings,
      excluded: body.excluded,
      assertionCounts: body.assertionCounts,
      research: body.research,
      // A revision recorded before Issue #275 carries no sample; it is read as the Run it was.
      assuranceSample: body.assuranceSample ?? PRE_ASSURANCE_SAMPLE,
    }),
    // The factual kind runs no conflict pass; its unresolved items are findings, counted in their own axis.
    conflictCountOf: () => 0,
    mode: modeIndex(FACTUAL_REVIEW_MODES),
  };
}

/** The baseline unit result type, re-exported so the execution owner can remap a reused unit by lineage. */
export type { BaselineUnitResult };
