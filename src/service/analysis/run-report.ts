import type {
  AnalysisAssuranceSampleProjection,
  AnalysisCrossUnitReductionProjection,
  AnalysisGapProjection,
} from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from './canonical.js';

/**
 * The Run Report (ADR 0066 §Run Report): one durable, immutable record of what a Run did, written
 * once into the Run's Task Outcome and never rewritten. It is the first learning loop — the document
 * the Owner reads at the end of Phase 1 and the accounting a future Run of the same manuscript reads
 * before it starts.
 *
 * Three properties decide the whole shape of this module.
 *
 * It counts, and never restates. No finding, entity, quotation, synopsis, or block text reaches a
 * report: every value here is a count, a closed code, an enum, an instant, a token figure, or a
 * digest. That is what lets the report's stable part be handed to a model as the reflection turn's
 * whole input without any manuscript content travelling with it.
 *
 * It is built from facts the Run already recorded. The reduction, the unit records, the Plan
 * Adaptation rows, the cross-unit projection, the assurance sample, and the revision's own usage are
 * all inputs; nothing here recomputes a reduction, redraws a sample, or reads the Harness Session
 * Ledger. Wall time comes from instants the execution owner took around its own work, which is the
 * boundary the Brief's stop condition draws.
 *
 * Its stable part has a digest of its own. `accountingDigest` is taken over the accounting alone —
 * stage *states* but not their wall times, unit counts but not their instants — so two deterministic
 * replays of one fixture over one manuscript mint the same digest even though their clocks differ.
 * That digest keys the reflection turn's fixture entry, which is the only reason it exists.
 */
export const RUN_REPORT_SCHEMA = 'ai7.analysis.run-report/1' as const;

/**
 * The four stages a Run Report accounts for, in the order the Run performs them. `reduction` is the
 * deterministic work — the kind's reducers and the persist — and is measured as disjoint segments
 * that exclude the sampling await, so the four `wallMs` values partition the Run's own work rather
 * than nesting one inside another.
 */
export const RUN_REPORT_STAGES = ['units', 'cross-unit-reduction', 'assurance-sampling', 'reduction'] as const;
export type RunReportStageId = (typeof RUN_REPORT_STAGES)[number];

/**
 * The stages usage is accounted under: the three that transmit for the revision, plus the reflection
 * turn's own. `reduction` never transmits, so it has wall time and no usage; the reflection turn
 * transmits after the revision is already immutable, so it has usage and no stage row. The first
 * three therefore sum to the revision's recorded usage field by field, which is the reconciliation.
 */
export const RUN_REPORT_USAGE_STAGES = ['units', 'cross-unit-reduction', 'assurance-sampling', 'run-report-reflection'] as const;
export type RunReportUsageStageId = (typeof RUN_REPORT_USAGE_STAGES)[number];

/** The three usage stages whose sum is the revision's own total; the reflection is deliberately not among them. */
export const RUN_REPORT_REVISION_USAGE_STAGES = ['units', 'cross-unit-reduction', 'assurance-sampling'] as const;
export type RunReportRevisionUsageStageId = (typeof RUN_REPORT_REVISION_USAGE_STAGES)[number];

export type RunReportClassification = 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted';

export interface RunReportUsage {
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export const RUN_REPORT_NO_USAGE: RunReportUsage = { requests: 0, inputTokens: 0, outputTokens: 0 };

/**
 * One stage's row. `state` says what the stage did; the three time fields are present exactly when
 * the owner actually entered the stage, so a stage that never ran carries `not-run` and no instants
 * rather than a zero that would read as work done in no time.
 */
export interface RunReportStageProjection {
  readonly stage: RunReportStageId;
  readonly state: 'closed' | 'closed-with-gaps' | 'gap' | 'not-run';
  readonly startedAt: string | null;
  readonly settledAt: string | null;
  /** The sum of this stage's disjoint segments; for `reduction` that is two segments, never the span between them. */
  readonly wallMs: number | null;
}

/** One measured segment of one stage, as the execution owner's own clock saw it. */
export interface RunReportSpan {
  readonly startedAt: string;
  readonly settledAt: string;
  readonly wallMs: number;
}

export interface RunReportUnitAccounting {
  readonly submitted: number;
  readonly reused: number;
  readonly recomputed: number;
  readonly gaps: number;
  readonly retried: number;
}

export interface RunReportUnitRow {
  readonly unitOrdinal: number;
  readonly state: 'closed' | 'gap';
  readonly lineage: 'recomputed' | 'reused';
  /** Model turns this unit cost: `0` for a reused unit and for one the interrupted loop never reached. */
  readonly attempts: number;
  readonly wallMs: number | null;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null;
  readonly gapCode: AnalysisGapProjection['code'] | null;
}

/** What the execution owner observed about one unit while it settled it; absent for a unit it never reached. */
export interface RunReportUnitObservation {
  readonly unitOrdinal: number;
  readonly attempts: number;
  readonly wallMs: number;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null;
}

export interface RunReportAdaptationRow {
  readonly unitOrdinal: number;
  readonly classifiedReason: string;
  readonly recordedAt: string;
}

export interface RunReportFailureRow {
  readonly stage: RunReportStageId;
  readonly code: string;
  readonly reason: string;
}

export interface RunReportAssurance {
  readonly state: AnalysisAssuranceSampleProjection['state'];
  readonly seed: string | null;
  readonly size: number;
  readonly candidateCount: number;
  readonly precision: AnalysisAssuranceSampleProjection['precision'];
  /** Sampled findings the model upheld as `成立`; the numerator every per-tier estimate is built from. */
  readonly upheld: number;
}

/** One class of finding the Run produced, as the kind that owns it names its own classes. */
export interface RunReportFindingCount {
  readonly kind: string;
  readonly count: number;
}

export interface RunReportSuggestion {
  readonly suggestion: string;
  readonly basis: string;
}

/**
 * The `if redone` list: what the model would do differently on the next Run of this manuscript. It
 * closes only when the reflection turn dispatched and parsed; every other outcome states its reason
 * in the reader's own language, exactly as the two existing suboperations state theirs.
 */
export type RunReportIfRedone =
  | { readonly state: 'closed'; readonly items: ReadonlyArray<RunReportSuggestion>; readonly reason: null }
  | { readonly state: 'not-run' | 'policy-bounded' | 'gap'; readonly items: readonly []; readonly reason: string };

/** The reflection turn never dispatched and named no reason yet; the assembler's stand-in while the accounting is minted. */
const IF_REDONE_PENDING: RunReportIfRedone = { state: 'not-run', items: [], reason: '' };

/** What the reflection suboperation produced, as the execution owner observed it. */
export interface RunReportReflectionOutcome {
  readonly ifRedone: RunReportIfRedone;
  readonly usage: RunReportUsage;
}

/** The reflection outcome of a Run that never reached the turn at all. */
export function runReportReflectionNotRun(reason: string): RunReportReflectionOutcome {
  return { ifRedone: { state: 'not-run', items: [], reason }, usage: RUN_REPORT_NO_USAGE };
}

export interface RunReportRecord {
  readonly schema: typeof RUN_REPORT_SCHEMA;
  readonly runRecordId: string;
  readonly taskIntentId: string;
  /** The Run's one execution attempt; `null` for a Run that failed before its attempt was persisted. */
  readonly attemptId: string | null;
  readonly resultSetRevisionId: string | null;
  readonly classification: RunReportClassification;
  readonly recordedAt: string;
  readonly stages: ReadonlyArray<RunReportStageProjection>;
  readonly units: RunReportUnitAccounting;
  readonly unitRows: ReadonlyArray<RunReportUnitRow>;
  readonly adaptations: ReadonlyArray<RunReportAdaptationRow>;
  readonly failures: ReadonlyArray<RunReportFailureRow>;
  readonly usagePerStage: Readonly<Record<RunReportUsageStageId, RunReportUsage>>;
  readonly findingCounts: ReadonlyArray<RunReportFindingCount>;
  readonly assurance: RunReportAssurance;
  readonly ifRedone: RunReportIfRedone;
  /** SHA-256 over the canonical JSON of {@link runReportAccountingOf}; the reflection turn's fixture key. */
  readonly accountingDigest: string;
}

/** The report as a reader receives it: the record plus the digest of its own canonical JSON. */
export interface RunReportProjection extends RunReportRecord {
  readonly reportDigest: string;
}

/**
 * The stable accounting: every part of the report whose value is a function of the fixture and the
 * manuscript alone. Wall times, instants, identities, and the reflection's own result are all absent,
 * which is exactly why a hand-written fixture can pin its digest across imports and across replays.
 */
export interface RunReportAccounting {
  readonly classification: RunReportClassification;
  readonly stages: ReadonlyArray<{ readonly stage: RunReportStageId; readonly state: RunReportStageProjection['state'] }>;
  readonly units: RunReportUnitAccounting;
  readonly gapCodes: ReadonlyArray<{ readonly code: string; readonly count: number }>;
  readonly failureCodes: ReadonlyArray<{ readonly stage: RunReportStageId; readonly code: string; readonly count: number }>;
  readonly adaptationCount: number;
  readonly usagePerStage: Readonly<Record<RunReportRevisionUsageStageId, RunReportUsage>>;
  readonly assurance: Omit<RunReportAssurance, 'seed'>;
  readonly findingCounts: ReadonlyArray<RunReportFindingCount>;
}

/** Everything the report is built from, apart from what the reflection turn itself produces. */
export interface RunReportFacts {
  readonly runRecordId: string;
  readonly taskIntentId: string;
  readonly attemptId: string | null;
  readonly resultSetRevisionId: string | null;
  readonly classification: RunReportClassification;
  readonly recordedAt: string;
  /** The segments the owner measured, by stage; a stage it never entered is simply absent. */
  readonly spans: ReadonlyMap<RunReportStageId, RunReportSpan>;
  /** Usage the owner accumulated per stage; the reflection's own is added when the report is sealed. */
  readonly usage: Readonly<Record<RunReportRevisionUsageStageId, RunReportUsage>>;
  /** Every unit of the revision, in ordinal order, exactly as the revision records them. */
  readonly unitRows: ReadonlyArray<RunReportUnitRow>;
  /** Units this Run submitted to the model; a reused unit is not among them. */
  readonly submitted: number;
  readonly adaptations: ReadonlyArray<RunReportAdaptationRow>;
  readonly gaps: ReadonlyArray<AnalysisGapProjection>;
  readonly crossUnit: AnalysisCrossUnitReductionProjection;
  readonly sample: AnalysisAssuranceSampleProjection;
  readonly findingCounts: ReadonlyArray<RunReportFindingCount>;
  /** The terminal reason of a Run that failed before it formed a revision; `null` for every other Run. */
  readonly terminalFailure: { readonly code: string; readonly reason: string } | null;
}

/** The reading a Task Outcome recorded before this slice carries; it is history and is never rewritten. */
export const PRE_RUN_REPORT_REASON = '该任务结果由未生成运行报告的运行产生。' as const;

function tally<T>(items: ReadonlyArray<T>, key: (item: T) => string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  // Sorted by code point so two Runs over the same codes list them the same way and the digest is stable.
  return [...counts.keys()].sort().map((value) => ({ key: value, count: counts.get(value)! }));
}

/**
 * The stage rows. A stage's `state` is what the Run itself already decided — the sample's own state,
 * the reduction's own state — and never a second judgement made here; its instants are present
 * exactly when the owner entered it.
 */
function stageRows(facts: RunReportFacts): RunReportStageProjection[] {
  const submittedAny = facts.submitted > 0;
  const gapsInUnits = facts.gaps.length > 0;
  const states: Record<RunReportStageId, RunReportStageProjection['state']> = {
    units: !submittedAny && facts.unitRows.length === 0 ? 'not-run' : gapsInUnits ? 'closed-with-gaps' : 'closed',
    'cross-unit-reduction': facts.crossUnit.state,
    'assurance-sampling': facts.sample.state,
    // The deterministic reducers and the persist either ran, and produced the revision, or the Run
    // failed before them; the span is the fact that decides which.
    reduction: facts.spans.has('reduction') ? 'closed' : 'not-run',
  };
  return RUN_REPORT_STAGES.map((stage) => {
    const span = facts.spans.get(stage) ?? null;
    return {
      stage,
      state: states[stage],
      startedAt: span?.startedAt ?? null,
      settledAt: span?.settledAt ?? null,
      wallMs: span?.wallMs ?? null,
    };
  });
}

/**
 * Every failure the Run carries, in the order a reader meets them: the unit gaps in ordinal order,
 * then the one reduction's, then the sample's, then the terminal reason of a Run that never formed a
 * revision at all. Each names its stage and its classified code; none restates what was lost.
 */
function failureRows(facts: RunReportFacts): RunReportFailureRow[] {
  const rows: RunReportFailureRow[] = [...facts.gaps]
    .sort((left, right) => left.unitOrdinal - right.unitOrdinal)
    .map((gap) => ({ stage: 'units' as const, code: gap.code, reason: gap.reason }));
  // A stage that never ran is not a failure: `not-run` says there was nothing for it to close, which
  // the stage row already discloses. Only a stage that ran and lost something is named here.
  if (facts.crossUnit.state === 'gap' && facts.crossUnit.reason !== null) {
    rows.push({ stage: 'cross-unit-reduction', code: facts.crossUnit.state, reason: facts.crossUnit.reason });
  }
  if ((facts.sample.state === 'gap' || facts.sample.state === 'closed-with-gaps') && facts.sample.reason !== null) {
    rows.push({ stage: 'assurance-sampling', code: facts.sample.state, reason: facts.sample.reason });
  }
  if (facts.terminalFailure !== null) {
    rows.push({ stage: 'units', code: facts.terminalFailure.code, reason: facts.terminalFailure.reason });
  }
  return rows;
}

function assuranceOf(sample: AnalysisAssuranceSampleProjection): RunReportAssurance {
  return {
    state: sample.state,
    seed: sample.seed,
    size: sample.size,
    candidateCount: sample.candidateCount,
    precision: sample.precision,
    upheld: sample.dispositions.filter((entry) => entry.disposition === '成立').length,
  };
}

function assembleRunReport(
  facts: RunReportFacts,
  reflection: RunReportReflectionOutcome,
  accountingDigest: string,
): RunReportRecord {
  const reused = facts.unitRows.filter((unit) => unit.lineage === 'reused').length;
  return {
    schema: RUN_REPORT_SCHEMA,
    runRecordId: facts.runRecordId,
    taskIntentId: facts.taskIntentId,
    attemptId: facts.attemptId,
    resultSetRevisionId: facts.resultSetRevisionId,
    classification: facts.classification,
    recordedAt: facts.recordedAt,
    stages: stageRows(facts),
    units: {
      submitted: facts.submitted,
      reused,
      recomputed: facts.unitRows.length - reused,
      gaps: facts.unitRows.filter((unit) => unit.state === 'gap').length,
      retried: facts.adaptations.length,
    },
    unitRows: facts.unitRows,
    adaptations: facts.adaptations,
    failures: failureRows(facts),
    usagePerStage: { ...facts.usage, 'run-report-reflection': reflection.usage },
    findingCounts: facts.findingCounts,
    assurance: assuranceOf(facts.sample),
    ifRedone: reflection.ifRedone,
    accountingDigest,
  };
}

/**
 * The accounting of a recorded report, derived from the report alone. Reading it back off the record
 * rather than off the facts is what lets any reader — a unit case, the Journey — recompute the
 * digest a report claims and check that the wall times and instants beside it changed nothing.
 */
export function runReportAccountingOf(report: RunReportRecord): RunReportAccounting {
  const { seed: _seed, ...assurance } = report.assurance;
  return {
    classification: report.classification,
    stages: report.stages.map((stage) => ({ stage: stage.stage, state: stage.state })),
    units: report.units,
    gapCodes: tally(report.unitRows.filter((unit) => unit.gapCode !== null), (unit) => unit.gapCode!)
      .map((entry) => ({ code: entry.key, count: entry.count })),
    failureCodes: tally(report.failures, (failure) => `${failure.stage} ${failure.code}`)
      .map((entry) => {
        const [stage, code] = entry.key.split(' ');
        return { stage: stage as RunReportStageId, code: code!, count: entry.count };
      }),
    adaptationCount: report.adaptations.length,
    usagePerStage: {
      units: report.usagePerStage.units,
      'cross-unit-reduction': report.usagePerStage['cross-unit-reduction'],
      'assurance-sampling': report.usagePerStage['assurance-sampling'],
    },
    assurance,
    findingCounts: report.findingCounts,
  };
}

/**
 * The accounting the reflection turn is given, minted before that turn is dispatched. It is exactly
 * `runReportAccountingOf` of the report the Run would have recorded had the turn not run, which is
 * what makes the digest the turn is keyed by the same digest the finished report discloses.
 */
export function runReportAccounting(facts: RunReportFacts): RunReportAccounting {
  return runReportAccountingOf(assembleRunReport(facts, { ifRedone: IF_REDONE_PENDING, usage: RUN_REPORT_NO_USAGE }, ''));
}

export function runReportAccountingDigest(accounting: RunReportAccounting): string {
  return sha256Hex(canonicalJson(accounting));
}

/** The finished report: the Run's facts, the reflection's result, and the accounting digest of the former. */
export function buildRunReport(facts: RunReportFacts, reflection: RunReportReflectionOutcome): RunReportRecord {
  return assembleRunReport(facts, reflection, runReportAccountingDigest(runReportAccounting(facts)));
}

export function runReportDigest(report: RunReportRecord): string {
  return sha256Hex(canonicalJson(report));
}

/** The report as a reader receives it: the recorded record with the digest of its own canonical JSON beside it. */
export function runReportProjection(report: RunReportRecord): RunReportProjection {
  return { ...report, reportDigest: runReportDigest(report) };
}

/**
 * Whether the three revision-facing usage stages reconcile with the revision's own recorded usage,
 * field by field. The owner increments both from the same three call sites, so this holds by
 * construction; it is stated as a function because that is what the unit case and the Journey assert.
 */
export function runReportUsageReconciles(report: RunReportRecord, revisionUsage: RunReportUsage): boolean {
  const summed = RUN_REPORT_REVISION_USAGE_STAGES.reduce<RunReportUsage>((total, stage) => ({
    requests: total.requests + report.usagePerStage[stage].requests,
    inputTokens: total.inputTokens + report.usagePerStage[stage].inputTokens,
    outputTokens: total.outputTokens + report.usagePerStage[stage].outputTokens,
  }), RUN_REPORT_NO_USAGE);
  return summed.requests === revisionUsage.requests &&
    summed.inputTokens === revisionUsage.inputTokens &&
    summed.outputTokens === revisionUsage.outputTokens;
}
