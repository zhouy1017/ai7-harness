export interface ModelResultSalvage {
  readonly section: string;
  /** Zero-based position in the model's section. */
  readonly index: number;
  readonly reason: string;
}

export interface SalvagedModelResult {
  readonly salvaged?: ReadonlyArray<ModelResultSalvage>;
}

import type { QuickStartBaselineAnalysisResult } from './series.js';
import type {
  AnalysisReusePlanProjection,
  AnalysisReusePlanUnitProjection,
  BaselineAnalysisHistoryEntryProjection,
  BaselineAnalysisHistoryProjection,
  BaselineAnalysisProjection,
  BaselineAnalysisRangeOptionProjection,
  BaselineAnalysisResultSetRevisionProjection,
  BaselineAnalysisUnitProjection,
  BaselineAnalysisUpdateActionProjection,
  BaselineAnalysisUpdateControlsProjection,
  BaselineAnalysisUpdateProjection,
} from './analysis-plan.js';
import type { FrozenWebToolsBackend, ServiceJobProjection, ServiceOperationMap } from '../protocol.js';
import type { FactualRunAssuranceProjection } from './factual-verification.js';

// ---- J-04 covered baseline manuscript analysis (Issue #92) ----------------------------------------

/** One completely enumerated Analysis Unit of a Coverage Manifest: own block range plus bounded overlap context. */
export interface CoverageManifestUnitProjection {
  ordinal: number;
  sectionOrdinal: number;
  subUnitIndex: number;
  subUnitCount: number;
  headingBlockId: string | null;
  headingText: string | null;
  headingLevel: number | null;
  startPosition: number;
  endPosition: number;
  blockIds: ReadonlyArray<string>;
  blockDigests: ReadonlyArray<string>;
  overlapBlockIds: ReadonlyArray<string>;
  graphemes: number;
  digest: string;
}

/** Deterministic, versioned coverage plan for one exact Manuscript Pin; gaps never live here. */
export interface CoverageManifestProjection {
  schema: 'ai7.coverage-manifest/1';
  manuscript: {
    bookId: string;
    manuscriptId: string;
    branchId: string;
    revisionId: string;
    revisionLabel: string;
    revisionDigest: string;
  };
  parameters: { unitBudgetGraphemes: number; overlapBlocks: number };
  totalBlocks: number;
  totalGraphemes: number;
  sectionCount: number;
  units: ReadonlyArray<CoverageManifestUnitProjection>;
  digest: string;
}

/** Transport summaries never replace the complete, digested manifest kept by the ledger. */
export type CoverageManifestSummaryProjection = Omit<CoverageManifestProjection, 'units'> & {
  units: ReadonlyArray<Omit<CoverageManifestUnitProjection, 'blockIds' | 'blockDigests' | 'overlapBlockIds'> & {
    blockCount: number; firstBlockId: string; lastBlockId: string;
  }>;
};

export interface AnalysisUnitPage { shown: number; total: number; nextOrdinal: number | null }

export type AnalysisGapSummaryProjection = Omit<AnalysisGapProjection, 'blockIds'> & {
  blockCount: number; firstBlockId: string | null; lastBlockId: string | null;
};

export type BaselineAnalysisWireUnitProjection = Exclude<BaselineAnalysisUnitProjection, { state: 'gap' }> |
  (Omit<Extract<BaselineAnalysisUnitProjection, { state: 'gap' }>, 'gap'> & { gap: AnalysisGapSummaryProjection });

export type AnalysisRevisionWireProjection = Omit<BaselineAnalysisResultSetRevisionProjection, 'units' | 'gaps' | 'sections' | 'synthesis'> & {
  units: ReadonlyArray<BaselineAnalysisWireUnitProjection>;
  gaps: ReadonlyArray<AnalysisGapSummaryProjection>;
  unitPage: AnalysisUnitPage;
  /** Present inline for short books. D3a pages the exact canonical JSON for larger overviews. */
  sections?: BaselineAnalysisResultSetRevisionProjection['sections'];
  synthesis?: BaselineAnalysisResultSetRevisionProjection['synthesis'];
  overviewPage?: { totalLength: number; sha256: string; chunkCount: number };
};

export type AnalysisRunReportSummaryProjection = Omit<RunReportProjection, 'unitRows'> & {
  unitRows?: RunReportProjection['unitRows']; unitPage?: AnalysisUnitPage;
};

export type AnalysisReusePlanSummaryProjection = Omit<AnalysisReusePlanProjection, 'units'> & {
  units: ReadonlyArray<Pick<AnalysisReusePlanUnitProjection, 'unitOrdinal' | 'disposition' | 'reason' | 'reusedFrom'>>;
};

export type BaselineAnalysisWireProjection = Omit<BaselineAnalysisProjection,
  'coverageManifest' | 'resultSetRevision' | 'inspectedRevision' | 'update' | 'run' | 'history' | 'taskOutcome' | 'updateControls'> & {
  listPages: Readonly<Record<string, AnalysisUnitPage & { descending?: boolean }>>;
  coverageManifest: CoverageManifestSummaryProjection | null;
  resultSetRevision: AnalysisRevisionWireProjection | null;
  inspectedRevision: null | { revision: AnalysisRevisionWireProjection; current: boolean; readOnly: true };
  update: null | (Omit<BaselineAnalysisUpdateProjection, 'reusePlan'> & { reusePlan: AnalysisReusePlanSummaryProjection | null });
  run: null | (Omit<NonNullable<BaselineAnalysisProjection['run']>, 'attempt'> & {
    attempt: null | (NonNullable<NonNullable<BaselineAnalysisProjection['run']>['attempt']> & { spanCount: number });
  });
  history: null | (Omit<BaselineAnalysisHistoryProjection, 'entries'> & { entries: ReadonlyArray<
    Omit<BaselineAnalysisHistoryEntryProjection, 'report'> & { report: AnalysisRunReportSummaryProjection | null }> });
  taskOutcome: null | (Omit<NonNullable<BaselineAnalysisProjection['taskOutcome']>, 'report'> & { report: AnalysisRunReportSummaryProjection | null });
  updateControls: null | (Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> & { actions:
    Omit<BaselineAnalysisUpdateControlsProjection['actions'], 'reanalyze-range'> & {
      'reanalyze-range': BaselineAnalysisUpdateActionProjection & { options: ReadonlyArray<
        Pick<BaselineAnalysisRangeOptionProjection, 'unitOrdinal' | 'sectionOrdinal' | 'label' | 'startPosition' | 'endPosition'>> };
    } });
};

/** In-process operations retain full records; main/preload consume the explicitly mapped wire output. */
export type ServiceWireOutput<T> = T extends BaselineAnalysisProjection ? BaselineAnalysisWireProjection
  : T extends ServiceJobProjection ? Omit<ServiceJobProjection, 'result'> & { result: ServiceWireOutput<ServiceJobProjection['result']> }
  : T extends QuickStartBaselineAnalysisResult ? Omit<T, 'projection'> & { projection: BaselineAnalysisWireProjection }
  : T;

export type QuickStartBaselineAnalysisWireResult = ServiceWireOutput<QuickStartBaselineAnalysisResult>;

export type HydratedAnalysisRevisionProjection = AnalysisRevisionWireProjection & Required<Pick<AnalysisRevisionWireProjection, 'sections' | 'synthesis'>>;

export type ServiceWireJobProjection = ServiceWireOutput<ServiceJobProjection>;

export type WireServiceOperationMap = { [K in keyof ServiceOperationMap]: {
  input: ServiceOperationMap[K]['input']; output: ServiceWireOutput<ServiceOperationMap[K]['output']>;
} };

export type AnalysisEntityKind = 'person' | 'place' | 'organization' | 'object' | 'term' | 'other';

export interface AnalysisSourceRangeProjection {
  blockId: string;
  fromGrapheme: number | null;
  toGrapheme: number | null;
}

export interface AnalysisEntityProjection {
  name: string;
  kind: AnalysisEntityKind;
  aliases: ReadonlyArray<string>;
  note: string | null;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
  unitOrdinals: ReadonlyArray<number>;
}

export interface AnalysisEventProjection {
  unitOrdinal: number;
  ordinal: number;
  summary: string;
  chronology: string | null;
  participants: ReadonlyArray<string>;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface AnalysisRelationshipProjection {
  subject: string;
  object: string;
  relation: string;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
  unitOrdinals: ReadonlyArray<number>;
}

export interface AnalysisSettingClaimProjection {
  unitOrdinal: number;
  subject: string;
  claim: string;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface AnalysisConflictProjection {
  kind: 'unit-reported' | 'alias-collision' | 'entity-kind-divergence' | 'setting-claim-divergence';
  description: string;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
  unitOrdinals: ReadonlyArray<number>;
}

/**
 * One model-driven cross-unit finding (ADR 0066): a divergence the deterministic pre-filter cannot
 * reach, stated with the source ranges on every side and a confidence. `unitOrdinals` is the lineage
 * the Result Set is read by — every unit the finding cites, sorted and deduplicated from its sides.
 * A finding is evidence for the editor, never a verdict: no side is marked right.
 */
export interface AnalysisCrossUnitFindingProjection {
  kind: 'contradiction' | 'continuity-break' | 'alias-identity-divergence' | 'chronology-conflict';
  description: string;
  sides: ReadonlyArray<{ unitOrdinal: number; sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection> }>;
  unitOrdinals: ReadonlyArray<number>;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * What the cross-unit reduction did in the Run that produced this revision, including why it did not
 * run. The reduction forms no execution-span row of its own — the span table is unit-only — so this
 * is where its one attempt is recorded, transport facts included.
 */
export interface AnalysisCrossUnitReductionProjection extends SalvagedModelResult {
  state: 'closed' | 'gap' | 'not-run';
  /** The exact reason for a gap or for not running; `null` when the reduction closed. */
  reason: string | null;
  /** The reduction's request digest; `null` when it never formed a request. */
  requestDigest: string | null;
  /** What the reduction's one turn cost; `null` when it never dispatched or reported no usage. */
  usage: { inputTokens: number; outputTokens: number } | null;
  findingCount: number;
}

/** The closed disposition set of the assurance sampling suboperation (ADR 0066); never a boolean. */
export type AnalysisAssuranceDisposition = '成立' | '需降级' | '应删除';

export interface AnalysisAssuranceSampleStratumProjection {
  sectionOrdinal: number;
  /** Candidates the section held, and how many of them the allocation drew. */
  candidates: number;
  sampled: number;
}

/**
 * One sampled finding's disposition. It names the finding by `ref` and lives only here: no finding is
 * edited, deleted, reordered, or re-ranked by a disposition, which is evidence for the editor and for
 * the Run Report and never a verdict.
 */
export interface AnalysisAssuranceSampleDispositionProjection {
  ref: string;
  unitOrdinal: number;
  /** The finding's own tier: the baseline kind's confidence, the factual kind's severity. */
  tier: string;
  disposition: AnalysisAssuranceDisposition;
  reason: string;
}

/** Estimated precision of one tier of the sampled set: upheld over sampled, rounded to two decimals. */
export interface AnalysisAssuranceSamplePrecisionProjection {
  tier: string;
  sampled: number;
  upheld: number;
  estimate: number;
}

/**
 * What the assurance sampling suboperation did in the Run that produced this revision, including why
 * it did not run. Like the cross-unit reduction it forms no execution-span row of its own, so this is
 * where its turns are recorded. The seed is disclosed so the sample can be redrawn from the manifest
 * and the revision's own findings and checked.
 */
export interface AnalysisAssuranceSampleProjection {
  state: 'closed' | 'closed-with-gaps' | 'gap' | 'not-run';
  /** The recorded seed the draw is reproducible from; `null` when no sample was drawn. */
  seed: string | null;
  size: number;
  candidateCount: number;
  strata: ReadonlyArray<AnalysisAssuranceSampleStratumProjection>;
  dispositions: ReadonlyArray<AnalysisAssuranceSampleDispositionProjection>;
  precision: ReadonlyArray<AnalysisAssuranceSamplePrecisionProjection>;
  /** What the sampling turns cost; `null` when none dispatched or none reported usage. */
  usage: { inputTokens: number; outputTokens: number } | null;
  /** The exact reason for a gap or for not running; `null` when every turn closed. */
  reason: string | null;
}

/**
 * The Run Report (ADR 0066 §Run Report): one durable record of what a Run did, written once into the
 * Run's Task Outcome and never rewritten. It is the first learning loop — the document the Owner
 * reads at the end of Phase 1 and the accounting a future Run of the same manuscript reads first.
 *
 * The report counts and never restates. No finding, entity, quotation, synopsis, or block text
 * appears anywhere in it: every value is a count, a closed code, an enum, an instant, a token figure,
 * or a digest. That is what lets its stable part travel to a model as the reflection turn's whole
 * input with no manuscript content going with it.
 */
export const RUN_REPORT_STAGES = ['units', 'cross-unit-reduction', 'assurance-sampling', 'reduction'] as const;

export type RunReportStageId = (typeof RUN_REPORT_STAGES)[number];

/**
 * The stages usage is accounted under. `reduction` is deterministic and never transmits, so it has
 * wall time and no usage; the reflection turn dispatches after the revision is already immutable, so
 * it has usage and no stage row. The first three therefore sum to the revision's own recorded usage
 * field by field, which is the reconciliation the Run Report promises.
 */
export const RUN_REPORT_USAGE_STAGES = ['units', 'cross-unit-reduction', 'assurance-sampling', 'run-report-reflection', 'platform-tools'] as const;

export type RunReportUsageStageId = (typeof RUN_REPORT_USAGE_STAGES)[number];

export interface RunReportUsageProjection {
  localToolCalls?: Readonly<Record<string, number>>;
  retrievalCalls?: number;
  exactFetchCalls?: number;
  refusedRetrievalCalls?: number;
  searchCalls?: Readonly<Record<string, number>>;
  refusedSearchCalls?: number; searchFailures?: Readonly<Record<string, number>>;
  fetchCount?: number;
  fetchBytes?: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * One stage's row. The three time fields are present exactly when the owner entered the stage, so a
 * stage that never ran carries `not-run` and no instants rather than a zero that would read as work
 * done in no time. `wallMs` is the sum of the stage's own disjoint segments: for `reduction`, whose
 * two segments sit either side of the sampling await, that is deliberately less than the distance
 * between `startedAt` and `settledAt`, so the four stage totals partition the Run's work.
 */
export interface RunReportStageProjection {
  stage: RunReportStageId;
  state: 'closed' | 'closed-with-gaps' | 'gap' | 'not-run';
  startedAt: string | null;
  settledAt: string | null;
  wallMs: number | null;
}

export interface RunReportUnitAccountingProjection {
  submitted: number;
  reused: number;
  recomputed: number;
  gaps: number;
  retried: number;
  /**
   * Units the Run planned not to read (Issue #417). Present only when there is at least one, so the
   * accounting — and the digest taken over it — of every Run that has none is exactly what it was.
   */
  unreviewed?: number;
}

export interface RunReportUnitRowProjection {
  unitOrdinal: number;
  state: 'closed' | 'gap';
  /** `unreviewed` is a unit the Run's plan left out of scope: neither recomputed nor reused, and never dispatched. */
  lineage: 'recomputed' | 'reused' | 'unreviewed';
  /** Model turns this unit cost: `0` for a reused unit and for one an interrupted loop never reached. */
  attempts: number;
  wallMs: number | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  gapCode: AnalysisGapProjection['code'] | null;
}

export interface RunReportAdaptationProjection {
  unitOrdinal: number;
  classifiedReason: string;
  recordedAt: string;
}

/** One failure the Run carries, named by the stage that produced it and its classified code. */
export interface RunReportFailureProjection {
  stage: RunReportStageId;
  code: string;
  reason: string;
}

/** The assurance sample as the report copies it; never a second draw and never a recomputation. */
export interface RunReportAssuranceProjection {
  state: AnalysisAssuranceSampleProjection['state'];
  seed: string | null;
  size: number;
  candidateCount: number;
  precision: ReadonlyArray<AnalysisAssuranceSamplePrecisionProjection>;
  /** Sampled findings the model upheld as `成立`; the numerator every per-tier estimate is built from. */
  upheld: number;
}

/** One class of finding the Run produced, as the kind that owns it names its own classes. */
export interface RunReportFindingCountProjection {
  kind: string;
  count: number;
}

export interface RunReportSuggestionProjection {
  suggestion: string;
  basis: string;
}

/**
 * The `if redone` list: what the model would do differently on the next Run of this manuscript. It
 * closes only when the reflection turn dispatched and parsed; every other outcome states its reason
 * in the reader's own language, exactly as the two other suboperations state theirs. No item
 * restates a finding, quotes the manuscript, or proposes an edit — the contract forbids all three.
 */
export type RunReportIfRedoneProjection =
  | { state: 'closed'; items: ReadonlyArray<RunReportSuggestionProjection>; reason: null }
  | { state: 'not-run' | 'policy-bounded' | 'gap'; items: readonly []; reason: string };

/** The Run Report as it is recorded inside the Task Outcome, before its own digest is taken. */
export interface RunReportRecordProjection {
  /** The factual Run's frozen level and its disclosed offline-at-start downgrade, absent on predecessor reports. */
  factualAssurance?: FactualRunAssuranceProjection;
  webToolsBackend?: FrozenWebToolsBackend;
  /** Editorial choices only; no question or answer content enters the Run Report. */
  modelClarifications?: ReadonlyArray<{ unitOrdinal: number; outcome: 'answered' | 'no-answer' | 'timed-out' | 'unanswered'; line: string }>;
  schema: 'ai7.analysis.run-report/1';
  runRecordId: string;
  taskIntentId: string;
  /** The Run's one execution attempt; `null` for a Run that failed before its attempt was persisted. */
  attemptId: string | null;
  resultSetRevisionId: string | null;
  classification: 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted' | 'cancelled';
  recordedAt: string;
  stages: ReadonlyArray<RunReportStageProjection>;
  units: RunReportUnitAccountingProjection;
  unitRows: ReadonlyArray<RunReportUnitRowProjection>;
  adaptations: ReadonlyArray<RunReportAdaptationProjection>;
  failures: ReadonlyArray<RunReportFailureProjection>;
  usagePerStage: Readonly<Record<RunReportUsageStageId, RunReportUsageProjection>>;
  findingCounts: ReadonlyArray<RunReportFindingCountProjection>;
  assurance: RunReportAssuranceProjection;
  ifRedone: RunReportIfRedoneProjection;
  /**
   * SHA-256 over the canonical JSON of the report's stable accounting — stage states but not their
   * wall times, unit counts but not their instants, and neither the seed nor the reflection's own
   * result. Two deterministic replays of one fixture over one manuscript therefore mint the same
   * digest even though their clocks differ, which is what lets a fixture pin the reflection turn.
   */
  accountingDigest: string;
}

/** The report as a reader receives it: the recorded record with the digest of its own canonical JSON. */
export interface RunReportProjection extends RunReportRecordProjection {
  reportDigest: string;
  /**
   * A Run a 后台分析登记 started (Issue #864): which Enrollment version started it, the share of its ceiling the Run was held to,
   * and how the Run ended against that ceiling, in the reader's words. Read beside the recorded report, never part of its digest;
   * absent for every Run the editor started.
   */
  background?: ReadonlyArray<string>;
}

export interface AnalysisUnresolvedProjection {
  unitOrdinal: number;
  description: string;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface AnalysisGapProjection {
  unitOrdinal: number;
  /**
   * Why the unit carries no result. The first five are things that went wrong or never happened in a
   * Run that meant to read the unit. `out-of-scope` (Issue #417) is the one that is not a failure: a
   * kind that leaves out-of-scope units unreviewed planned not to read this unit, never dispatched it,
   * and says so — `不在本次审阅范围内`. No baseline or factual Run produces it.
   */
  code: 'adapter-failure' | 'contract-invalid' | 'interrupted' | 'egress-refused' | 'not-attempted' | 'out-of-scope' | 'outcome-unknown';
  reason: string;
  startPosition: number;
  endPosition: number;
  blockIds: ReadonlyArray<string>;
}

export interface AnalysisReducerStageProjection {
  /**
   * The declared reducer stages of every analysis kind. The first five are the baseline kind's; the
   * factual-review kind (S18a) reports `unit-validation`, then `reference-integrity` — the
   * deterministic location of each quotation in the block it names — and `finding-reduction`.
   * `assurance-sampling` (S43) closes both kinds: it is the one stage every kind that declares a
   * sampling binding reports, and it sits after that kind's last stage.
   */
  stage:
    | 'unit-validation'
    | 'section-reduction'
    | 'contradiction-continuity'
    | 'cross-unit-reduction'
    | 'cross-chapter-consistency'
    | 'book-synthesis'
    | 'reference-integrity'
    | 'finding-reduction'
    | 'assurance-sampling';
  state: 'closed' | 'closed-with-gaps' | 'not-run';
  inputCount: number;
}

export interface AnalysisSectionProjection {
  sectionOrdinal: number;
  headingText: string | null;
  headingLevel: number | null;
  unitOrdinals: ReadonlyArray<number>;
  closedUnitOrdinals: ReadonlyArray<number>;
  gapUnitOrdinals: ReadonlyArray<number>;
  synopsis: string;
  entities: ReadonlyArray<AnalysisEntityProjection>;
  events: ReadonlyArray<AnalysisEventProjection>;
  relationships: ReadonlyArray<AnalysisRelationshipProjection>;
  settingClaims: ReadonlyArray<AnalysisSettingClaimProjection>;
  conflicts: ReadonlyArray<AnalysisConflictProjection>;
  unresolved: ReadonlyArray<AnalysisUnresolvedProjection>;
}

export interface AnalysisSynthesisProjection {
  synopsis: string;
  entities: ReadonlyArray<AnalysisEntityProjection>;
  events: ReadonlyArray<AnalysisEventProjection>;
  relationships: ReadonlyArray<AnalysisRelationshipProjection>;
  settingClaims: ReadonlyArray<AnalysisSettingClaimProjection>;
  conflicts: ReadonlyArray<AnalysisConflictProjection>;
  unresolved: ReadonlyArray<AnalysisUnresolvedProjection>;
}

/** Four independently labeled state axes; no aggregate flag, colour, or score collapses them. */
export interface AnalysisCoverageAxis {
  axis: 'coverage';
  state: 'complete' | 'partial';
  label: string;
  unitsTotal: number;
  unitsClosed: number;
  /** Closed units whose result was reused from the predecessor revision by lineage; disclosed, never hidden. */
  unitsReused: number;
  gapCount: number;
  /**
   * How many of `gapCount` are units the Run planned not to read (`out-of-scope`), so a reader can
   * tell a range review that did everything it was asked from a Run that lost units. Present only on
   * a revision of a kind that leaves out-of-scope units unreviewed (Issue #417).
   */
  unitsOutOfScope?: number;
}

export interface AnalysisReducerClosureAxis {
  axis: 'reducer-closure';
  state: 'closed' | 'closed-with-gaps' | 'open';
  label: string;
  stages: ReadonlyArray<AnalysisReducerStageProjection>;
}

/**
 * Exact-revision freshness. Only the latest revision of a Result Set can be `current`; an older
 * revision is `superseded` and stays labeled by its original pin, never as deleted or current truth.
 */
export interface AnalysisFreshnessAxis {
  axis: 'freshness';
  state: 'current' | 'stale' | 'superseded';
  label: string;
  boundRevisionId: string;
  boundRevisionDigest: string;
  currentRevisionId: string;
  currentWorkingDigest: string;
  currentJournalSequence: number;
  comparison: 'local-deterministic';
}

export interface AnalysisAssuranceAxis {
  axis: 'assurance';
  state: 'qualified' | 'qualified-with-open-conflicts' | 'limited';
  label: string;
  /** Unresolved conflicts from the deterministic pass and the units themselves; the reading it has always been. */
  unresolvedConflictCount: number;
  unresolvedItemCount: number;
  lowConfidenceUnitCount: number;
  /** Model-driven cross-unit findings, disclosed beside the deterministic count and never folded into it. */
  crossUnitFindingCount: number;
  /**
   * What the assurance sample found, when one closed: how many findings were judged, how many were
   * upheld, and the estimated precision. `null` when no sample closed. The axis *state* never moves on
   * a disposition — a sample is evidence about the findings, not a re-reading of the Run.
   */
  sampledPrecision: { size: number; upheld: number; estimate: number } | null;
  /** The kind's own statement of what its result is and is not; one exact text per analysis kind. */
  statement: AnalysisAssuranceStatement;
}

/**
 * The assurance statement of each analysis kind, exact and fixed. The baseline kind's says its result
 * is a structured summary; the factual-review kind's says its result is a list of checkable assertions
 * with their exact quotation positions and that no external evidence has checked any of them.
 */
export const BASELINE_ANALYSIS_ASSURANCE_STATEMENT = '仅为模型输出的结构化归纳；不构成事实判定、编辑评审或稿件变更。' as const;

export const FACTUAL_REVIEW_ASSURANCE_STATEMENT =
  '仅为模型列出的可核查断言与其精确引文位置；未经外部证据核查，不构成事实判定、编辑评审或稿件变更。' as const;

/** A review category's: findings are located, never decided — the editor disposes of each (V2-UX-REV-003). */
export const REVIEW_CATEGORY_ASSURANCE_STATEMENT =
  '仅为模型按审阅依据列出的发现与其精确引文位置；是否采纳由编辑逐条决定，不构成事实判定、合规结论或稿件变更。' as const;

/** 审稿意见 (Issue #429, S81c): a draft from the record and what was read, never a delivery (V2-UX-EVAL-013). */
export const READERS_REPORT_ASSURANCE_STATEMENT =
  '审稿意见是模型依据定稿的评估记录与所读稿件写成的草稿，由编辑在稿件编辑面上修改；它不会交付或发送，也不改变评估记录。' as const;

/** AI7's 初评 (Issue #429, S81b1): scores to score against, never the editor's — the record keeps theirs (V2-UX-EVAL-006). */
export const INITIAL_EVALUATION_ASSURANCE_STATEMENT =
  'AI7 初评是模型据所读稿件给出的初步分数与评语，只作编辑打分的参考；记录保存的是编辑的评分，结论由编辑选定。' as const;

/** 按我的评分重写评语 (Issue #429, S81b2): words to the editor's scores, never a number — 采用 is the editor's (V2-UX-EVAL-008). */
export const EVALUATION_REWRITE_ASSURANCE_STATEMENT =
  '重写的评语是模型按编辑的评分与所读稿件写成的建议文字，只在编辑采用后才记入评估；它不改任何分数，也不选定结论。' as const;

/** 写作任务 (Issue #432, S84a): a document draft the editor edits, with an exemplar only referenced (V2-UX-DELIV-007, KB-004). */
export const WRITING_ASSURANCE_STATEMENT =
  '写作草稿是模型依据本书的稿件与所列参考材料写成的文档草稿，由编辑在稿件编辑面上修改；范例只作参照，不照抄；草稿不会交付或发送。' as const;

/** 自定义分析维度 (Issue #922, slice 7f): per-unit answers to the editor's own question, located and never concluded across units. */
export const CUSTOM_ANALYSIS_ASSURANCE_STATEMENT =
  '仅为模型就编辑自拟的提问逐单元给出的回答与其精确引文位置；不跨单元归纳，不打分，不构成事实判定、编辑评审或稿件变更。' as const;

export type AnalysisAssuranceStatement =
  | typeof WRITING_ASSURANCE_STATEMENT
  | typeof CUSTOM_ANALYSIS_ASSURANCE_STATEMENT
  | typeof BASELINE_ANALYSIS_ASSURANCE_STATEMENT
  | typeof FACTUAL_REVIEW_ASSURANCE_STATEMENT
  | typeof REVIEW_CATEGORY_ASSURANCE_STATEMENT
  | typeof INITIAL_EVALUATION_ASSURANCE_STATEMENT
  | typeof READERS_REPORT_ASSURANCE_STATEMENT
  | typeof EVALUATION_REWRITE_ASSURANCE_STATEMENT;

// ---- 审阅记录 Review Runs (Issue #417, plan slice S69) ---------------------------------------------

/**
 * The editor's words for the analysis's own lead tokens (V2-UX-LAYER-003). The deterministic conflict
 * kinds are ②A's; the four cross-unit kinds read as the 情节逻辑与前后一致 leads they become (REV-011).
 * `Record`s over the closed unions, so a new kind fails to compile instead of reaching a mark as a token.
 */
export const ANALYSIS_CONFLICT_KIND_LABELS: Record<AnalysisConflictProjection['kind'], string> = {
  'unit-reported': '单元内报告',
  'alias-collision': '别名冲突',
  'entity-kind-divergence': '实体类别分歧',
  'setting-claim-divergence': '设定声明分歧',
};

export const ANALYSIS_CROSS_UNIT_FINDING_KIND_LABELS: Record<AnalysisCrossUnitFindingProjection['kind'], string> = {
  contradiction: '前后矛盾',
  'continuity-break': '连续性断裂',
  'alias-identity-divergence': '同名异指',
  'chronology-conflict': '时间线冲突',
};
