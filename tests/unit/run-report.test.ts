import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { baselineAnalysisKindDefinition, factualReviewKindDefinition } from '../../src/service/analysis/kind-definition.js';
import type { AnalysisReductionResult } from '../../src/service/analysis/kind-definition.js';
import { runReportUnitRows } from '../../src/service/analysis/execution.js';
import {
  PRE_RUN_REPORT_REASON,
  RUN_REPORT_SCHEMA,
  RUN_REPORT_STAGES,
  buildRunReport,
  runReportAccounting,
  runReportAccountingDigest,
  runReportAccountingOf,
  runReportDigest,
  runReportProjection,
  runReportReflectionNotRun,
  runReportUsageReconciles,
  type RunReportFacts,
  type RunReportSpan,
  type RunReportStageId,
  type RunReportUnitRow,
} from '../../src/service/analysis/run-report.js';
import type {
  AnalysisAssuranceSampleProjection,
  AnalysisCrossUnitReductionProjection,
  AnalysisGapProjection,
} from '../../src/shared/protocol.js';

const SEED = 's'.repeat(64);

function span(startedAt: string, wallMs: number): RunReportSpan {
  return { startedAt, settledAt: new Date(Date.parse(startedAt) + wallMs).toISOString(), wallMs };
}

function gap(unitOrdinal: number, code: AnalysisGapProjection['code'], reason: string): AnalysisGapProjection {
  return { unitOrdinal, code, reason, startPosition: 0, endPosition: 1, blockIds: [] };
}

function unitRow(unitOrdinal: number, overrides: Partial<RunReportUnitRow> = {}): RunReportUnitRow {
  return {
    unitOrdinal,
    state: 'closed',
    lineage: 'recomputed',
    attempts: 1,
    wallMs: 40,
    usage: { inputTokens: 100, outputTokens: 20 },
    gapCode: null,
    ...overrides,
  };
}

const CLOSED_SAMPLE: AnalysisAssuranceSampleProjection = {
  state: 'closed',
  seed: SEED,
  size: 2,
  candidateCount: 3,
  strata: [{ sectionOrdinal: 1, candidates: 3, sampled: 2 }],
  dispositions: [
    { ref: '0', unitOrdinal: 1, tier: 'medium', disposition: '成立', reason: '合成理由。' },
    { ref: '1', unitOrdinal: 2, tier: 'low', disposition: '需降级', reason: '合成理由。' },
  ],
  precision: [
    { tier: 'low', sampled: 1, upheld: 0, estimate: 0 },
    { tier: 'medium', sampled: 1, upheld: 1, estimate: 1 },
  ],
  usage: { inputTokens: 300, outputTokens: 40 },
  reason: null,
};

const CLOSED_CROSS_UNIT: AnalysisCrossUnitReductionProjection = {
  state: 'closed',
  reason: null,
  requestDigest: 'c'.repeat(64),
  usage: { inputTokens: 200, outputTokens: 30 },
  findingCount: 2,
};

/**
 * A Run of three units: one reused by lineage, one recomputed and retried once, one that gapped. The
 * numbers are chosen so every reconciliation below is a different arithmetic and not an accident of
 * all-zero usage.
 */
function facts(overrides: Partial<RunReportFacts> = {}): RunReportFacts {
  return {
    runRecordId: 'run-1',
    taskIntentId: 'task-1',
    attemptId: 'attempt-1',
    resultSetRevisionId: 'revision-1',
    classification: 'completed-with-gaps',
    recordedAt: '2026-09-09T00:00:10.000Z',
    spans: new Map<RunReportStageId, RunReportSpan>([
      ['units', span('2026-09-09T00:00:00.000Z', 500)],
      ['cross-unit-reduction', span('2026-09-09T00:00:01.000Z', 120)],
      ['assurance-sampling', span('2026-09-09T00:00:02.000Z', 90)],
      ['reduction', span('2026-09-09T00:00:03.000Z', 30)],
    ]),
    usage: {
      units: { requests: 3, inputTokens: 300, outputTokens: 60 },
      'cross-unit-reduction': { requests: 1, inputTokens: 200, outputTokens: 30 },
      'assurance-sampling': { requests: 1, inputTokens: 300, outputTokens: 40 },
    },
    unitRows: [
      unitRow(1, { lineage: 'reused', attempts: 0, wallMs: null }),
      unitRow(2, { attempts: 2, usage: { inputTokens: 200, outputTokens: 40 } }),
      unitRow(3, { state: 'gap', gapCode: 'contract-invalid', usage: { inputTokens: 100, outputTokens: 20 } }),
    ],
    submitted: 2,
    adaptations: [{ unitOrdinal: 2, classifiedReason: '瞬时故障，可安全重试。', recordedAt: '2026-09-09T00:00:00.500Z' }],
    gaps: [gap(3, 'contract-invalid', '单元结果不符合契约 v1。')],
    crossUnit: CLOSED_CROSS_UNIT,
    sample: CLOSED_SAMPLE,
    findingCounts: [{ kind: 'cross-unit-finding:chronology-conflict', count: 2 }],
    terminalFailure: null,
    ...overrides,
  };
}

const REFLECTION = {
  ifRedone: {
    state: 'closed' as const,
    items: [{ suggestion: '下次运行提高单元预算。', basis: '本次有 1 个单元以契约不符合闭合。' }],
    reason: null,
  },
  usage: { requests: 1, inputTokens: 500, outputTokens: 80 },
};

describe('Run Report', () => {
  it('reconciles the three revision-facing stages with the revision usage and keeps the reflection apart', () => {
    const report = buildRunReport(facts(), REFLECTION);
    // 3 + 1 + 1 requests, 300 + 200 + 300 input, 60 + 30 + 40 output: exactly what the revision recorded.
    expect(runReportUsageReconciles(report, { requests: 5, inputTokens: 800, outputTokens: 130 })).toBe(true);
    expect(runReportUsageReconciles(report, { requests: 6, inputTokens: 800, outputTokens: 130 })).toBe(false);
    // The reflection turn is recorded, and is recorded nowhere the revision could have seen it.
    expect(report.usagePerStage['run-report-reflection']).toEqual({ requests: 1, inputTokens: 500, outputTokens: 80 });
  });

  it('reports the four stages with the owner instants, and a stage that never ran with none', () => {
    const report = buildRunReport(facts(), REFLECTION);
    expect(report.stages.map((stage) => stage.stage)).toEqual([...RUN_REPORT_STAGES]);
    expect(report.stages.map((stage) => stage.wallMs)).toEqual([500, 120, 90, 30]);
    expect(report.stages[0]).toMatchObject({ stage: 'units', state: 'closed-with-gaps', startedAt: '2026-09-09T00:00:00.000Z' });

    const spans = new Map(facts().spans);
    spans.delete('cross-unit-reduction');
    const notRun = buildRunReport(facts({
      spans,
      crossUnit: { state: 'not-run', reason: '本类型不声明跨单元归纳。', requestDigest: null, usage: null, findingCount: 0 },
    }), REFLECTION);
    expect(notRun.stages[1]).toEqual({ stage: 'cross-unit-reduction', state: 'not-run', startedAt: null, settledAt: null, wallMs: null });
  });

  it('counts the units and the retries from the rows the revision itself carries', () => {
    const report = buildRunReport(facts(), REFLECTION);
    expect(report.units).toEqual({ submitted: 2, reused: 1, recomputed: 2, gaps: 1, retried: 1 });
    expect(report.unitRows).toHaveLength(3);
    expect(report.adaptations).toEqual([{ unitOrdinal: 2, classifiedReason: '瞬时故障，可安全重试。', recordedAt: '2026-09-09T00:00:00.500Z' }]);
  });

  it('names every failure once, with its stage and its classified code', () => {
    const report = buildRunReport(facts({
      crossUnit: { state: 'gap', reason: '跨单元归纳未闭合。', requestDigest: 'c'.repeat(64), usage: null, findingCount: 0 },
      sample: { ...CLOSED_SAMPLE, state: 'closed-with-gaps', reason: '单元 2 的保证抽样未闭合。' },
    }), REFLECTION);
    expect(report.failures).toEqual([
      { stage: 'units', code: 'contract-invalid', reason: '单元结果不符合契约 v1。' },
      { stage: 'cross-unit-reduction', code: 'gap', reason: '跨单元归纳未闭合。' },
      { stage: 'assurance-sampling', code: 'closed-with-gaps', reason: '单元 2 的保证抽样未闭合。' },
    ]);
  });

  it('copies the assurance section rather than recomputing it', () => {
    const report = buildRunReport(facts(), REFLECTION);
    expect(report.assurance).toEqual({
      state: 'closed',
      seed: SEED,
      size: 2,
      candidateCount: 3,
      precision: CLOSED_SAMPLE.precision,
      upheld: 1,
    });
  });

  it('records a Run that failed before it formed a revision', () => {
    const report = buildRunReport(facts({
      classification: 'failed',
      attemptId: null,
      resultSetRevisionId: null,
      spans: new Map(),
      usage: {
        units: { requests: 0, inputTokens: 0, outputTokens: 0 },
        'cross-unit-reduction': { requests: 0, inputTokens: 0, outputTokens: 0 },
        'assurance-sampling': { requests: 0, inputTokens: 0, outputTokens: 0 },
      },
      unitRows: [],
      submitted: 0,
      adaptations: [],
      gaps: [],
      crossUnit: { state: 'not-run', reason: '运行在形成结果前失败。', requestDigest: null, usage: null, findingCount: 0 },
      sample: { state: 'not-run', seed: null, size: 0, candidateCount: 0, strata: [], dispositions: [], precision: [], usage: null, reason: '运行在形成结果前失败。' },
      findingCounts: [],
      terminalFailure: { code: 'EXECUTION_BINDING_DIGEST_DRIFT', reason: '执行绑定摘要在持久化时发生变化。' },
    }), runReportReflectionNotRun('运行在形成结果集修订版前失败，运行反思未发起。'));
    expect(report.classification).toBe('failed');
    expect(report.stages.every((stage) => stage.state === 'not-run' && stage.wallMs === null)).toBe(true);
    expect(report.units).toEqual({ submitted: 0, reused: 0, recomputed: 0, gaps: 0, retried: 0 });
    expect(report.failures).toEqual([
      { stage: 'units', code: 'EXECUTION_BINDING_DIGEST_DRIFT', reason: '执行绑定摘要在持久化时发生变化。' },
    ]);
    expect(report.ifRedone.state).toBe('not-run');
  });

  it('mints one accounting digest for two Runs whose only differences are clocks and identities', () => {
    const first = buildRunReport(facts(), REFLECTION);
    const second = buildRunReport(facts({
      runRecordId: 'run-2',
      taskIntentId: 'task-2',
      attemptId: 'attempt-2',
      resultSetRevisionId: 'revision-2',
      recordedAt: '2026-09-10T09:41:00.000Z',
      spans: new Map<RunReportStageId, RunReportSpan>([
        ['units', span('2026-09-10T09:40:00.000Z', 9_999)],
        ['cross-unit-reduction', span('2026-09-10T09:40:20.000Z', 8_888)],
        ['assurance-sampling', span('2026-09-10T09:40:30.000Z', 7_777)],
        ['reduction', span('2026-09-10T09:40:40.000Z', 6_666)],
      ]),
      unitRows: facts().unitRows.map((row) => ({ ...row, wallMs: row.wallMs === null ? null : row.wallMs + 1_000 })),
      adaptations: [{ unitOrdinal: 2, classifiedReason: '瞬时故障，可安全重试。', recordedAt: '2026-09-10T09:40:05.000Z' }],
      sample: { ...CLOSED_SAMPLE, seed: 'f'.repeat(64) },
    }), {
      ifRedone: { state: 'closed', items: [{ suggestion: '完全不同的建议。', basis: '完全不同的依据。' }], reason: null },
      usage: { requests: 1, inputTokens: 1, outputTokens: 1 },
    });
    // The clocks, the identities, the seed, and the reflection all moved; the accounting did not.
    expect(second.accountingDigest).toBe(first.accountingDigest);
    expect(runReportDigest(second)).not.toBe(runReportDigest(first));
    // And the accounting a report discloses is the accounting its own digest was taken over.
    expect(runReportAccountingDigest(runReportAccountingOf(first))).toBe(first.accountingDigest);
    expect(runReportAccountingOf(first)).toEqual(runReportAccounting(facts()));
  });

  it('moves the accounting digest when the counts move', () => {
    const base = buildRunReport(facts(), REFLECTION);
    const moved = buildRunReport(facts({ findingCounts: [{ kind: 'cross-unit-finding:chronology-conflict', count: 3 }] }), REFLECTION);
    expect(moved.accountingDigest).not.toBe(base.accountingDigest);
  });

  it('projects the report with the digest of its own canonical JSON', () => {
    const report = buildRunReport(facts(), REFLECTION);
    const projected = runReportProjection(report);
    const { reportDigest, ...body } = projected;
    expect(reportDigest).toBe(sha256Hex(canonicalJson(body)));
    expect(body).toEqual(report);
    expect(report.schema).toBe(RUN_REPORT_SCHEMA);
  });

  it('states how a Task Outcome recorded before this slice reads', () => {
    expect(PRE_RUN_REPORT_REASON).toBe('该任务结果由未生成运行报告的运行产生。');
  });
});

describe('Run Report unit rows', () => {
  it('joins the revision unit records with what the owner observed', () => {
    const rows = runReportUnitRows(
      [
        {
          unitOrdinal: 1,
          requestDigest: 'a'.repeat(64),
          lineage: { kind: 'reused', revisionId: 'r', revisionOrdinal: 1, unitOrdinal: 1 },
          closed: { state: 'closed', responseDigest: 'b'.repeat(64), usage: { inputTokens: 11, outputTokens: 2 }, result: {} },
        },
        {
          unitOrdinal: 2,
          requestDigest: 'c'.repeat(64),
          lineage: { kind: 'recomputed' },
          closed: { state: 'closed', responseDigest: 'd'.repeat(64), usage: { inputTokens: 50, outputTokens: 5 }, result: {} },
        },
        {
          unitOrdinal: 3,
          requestDigest: 'e'.repeat(64),
          lineage: { kind: 'recomputed' },
          closed: { state: 'gap', gap: gap(3, 'not-attempted', '运行在到达本单元前停止。') },
        },
      ],
      new Map([[2, { unitOrdinal: 2, attempts: 2, wallMs: 77, usage: { inputTokens: 90, outputTokens: 9 } }]]),
    );
    // A reused unit keeps the predecessor's usage and takes no attempt of its own; a retried unit
    // carries what both of its attempts cost, not what its last one did; a unit never reached has
    // neither, and names the gap code the revision recorded for it.
    expect(rows).toEqual([
      { unitOrdinal: 1, state: 'closed', lineage: 'reused', attempts: 0, wallMs: null, usage: { inputTokens: 11, outputTokens: 2 }, gapCode: null },
      { unitOrdinal: 2, state: 'closed', lineage: 'recomputed', attempts: 2, wallMs: 77, usage: { inputTokens: 90, outputTokens: 9 }, gapCode: null },
      { unitOrdinal: 3, state: 'gap', lineage: 'recomputed', attempts: 0, wallMs: null, usage: null, gapCode: 'not-attempted' },
    ]);
  });
});

describe('per-kind finding counts', () => {
  function reduction(components: Record<string, unknown>): AnalysisReductionResult {
    return {
      coverage: { axis: 'coverage', state: 'complete', label: '', unitsTotal: 1, unitsClosed: 1, unitsReused: 0, gapCount: 0 },
      reducerClosure: { axis: 'reducer-closure', state: 'closed', label: '', stages: [] },
      assurance: {
        axis: 'assurance', state: 'qualified', label: '', unresolvedConflictCount: 0, unresolvedItemCount: 0,
        lowConfidenceUnitCount: 0, crossUnitFindingCount: 0, sampledPrecision: null,
        statement: '仅为模型输出的结构化归纳；不构成事实判定、编辑评审或稿件变更。',
      },
      gaps: [],
      components,
      conflictCount: 0,
    };
  }

  it('counts the baseline kind by cross-unit finding kind and by conflict kind', () => {
    const counts = baselineAnalysisKindDefinition().findingCounts(reduction({
      crossUnitFindings: [{ kind: 'chronology-conflict' }, { kind: 'chronology-conflict' }, { kind: 'continuity-break' }],
      conflicts: [{ kind: 'alias-collision' }],
    }));
    expect(counts).toEqual([
      { kind: 'cross-unit-finding:chronology-conflict', count: 2 },
      { kind: 'cross-unit-finding:continuity-break', count: 1 },
      { kind: 'conflict:alias-collision', count: 1 },
    ]);
  });

  it('counts the factual kind by severity tier and by exclusion reason', () => {
    const counts = factualReviewKindDefinition().findingCounts(reduction({
      findings: [{ severity: 'high' }, { severity: 'low' }, { severity: 'high' }],
      excluded: [{ reason: 'quote-not-found' }],
    }));
    expect(counts).toEqual([
      { kind: 'finding:high', count: 2 },
      { kind: 'finding:low', count: 1 },
      { kind: 'excluded:quote-not-found', count: 1 },
    ]);
  });
});
