import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, OUTCOME_UNKNOWN_NOT_RESENT, outcomeUnknownDetail } from '../../src/service/analysis/execution.js';
import { OUTCOME_UNKNOWN_NO_RESUME, RECONCILED_RESUMABLE_DETAIL } from '../../src/service/analysis/baseline-analysis-store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { ModelFixtureError, loadLaunchFixture, loadModelFixture, outcomeUnknownFixtureAllowed, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 结果待确认 (Issue #51, plan slice S16c; V2-UX-CTRL-007, COPY-009, CONT-011, CONT-016; ADR
// 0034): the real store on a temporary Agent Data Root, exact `sample1` imported through the supported path, and J-04's
// deterministic route over `sample1-baseline-outcome-unknown` — unit 4's first request is sent and its answer never comes
// back whole. No Provider, socket or credential value. Unit 4 is kept at once as its own `outcome-unknown` gap and nothing in
// the Run ever sends it again — not 续行, not after a pause, a reconciliation or a spent ceiling; the Run reads the other
// seven and stops 结果待确认, which has no 续行, and 取消任务 keeps what was read.

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const UNKNOWN_REASON = '结果待确认：请求已发出，但回答没有完整传回，无法确认模型服务是否已处理并计费。（AI7_OUTCOME_UNKNOWN）';

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-outcome-unknown-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-outcome-unknown');
  writeFileSync(join(roots.dataRoot, '..', 'j10-unit-hold.txt'), 'release');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

function owner(store: EditorialStore): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
}

function prepare(store: EditorialStore, bookId: string): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

const states = (projection: BaselineAnalysisProjection): string[] => projection.run!.transitions.map((transition) => transition.state);

async function stoppedRun(store: EditorialStore, execution: BaselineAnalysisExecutionOwner, title: string): Promise<{ bookId: string; taskIntentId: string; runRecordId: string }> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  const bookId = imported.bookId;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  const prepared = prepare(store, bookId);
  const taskIntentId = prepared.taskIntent!.taskIntentId;
  const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
  execution.admitAndDispatch(runRecordId);
  await execution.whenIdle();
  return { bookId, taskIntentId, runRecordId };
}


/** A Run that pauses once five turns came back: units 1 to 3 and 5 kept, unit 4 kept as its own outcome-unknown gap. */
async function pausedHoldingUnit4(store: EditorialStore, title: string): Promise<{ bookId: string; taskIntentId: string; runRecordId: string }> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  const bookId = imported.bookId;
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  const prepared = prepare(store, bookId);
  const taskIntentId = prepared.taskIntent!.taskIntentId;
  const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
  let turns = 0;
  const held: BaselineAnalysisExecutionOwner = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null },
    unitHold: async () => {
      turns += 1;
      if (turns === 5) {
        store.requestBaselineAnalysisPause(bookId, taskIntentId);
        held.pauseRun(runRecordId, store.baselineAnalysisLedger);
      }
    },
  });
  try {
    held.admitAndDispatch(runRecordId);
    await held.whenIdle();
  } finally {
    await held.dispose();
  }
  return { bookId, taskIntentId, runRecordId };
}

const spansOf = (store: EditorialStore, bookId: string): Array<number | null> =>
  store.inspectBaselineAnalysis(bookId, () => null).run!.attempt!.spans.map((span) => span.unitOrdinal);
const attentionOf = (store: EditorialStore, bookId: string) => store.inspectGlobalAttention(() => null, false).groups
  .flatMap((group) => group.items.map((entry) => [group.key, entry] as const)).find(([, entry]) => entry.book.bookId === bookId);
const UNKNOWN_GAP = `${UNKNOWN_REASON}；${OUTCOME_UNKNOWN_NOT_RESENT}`;
const CANCEL_LINE = '第 4 个阅读范围的请求已发出、结果待确认；不会再发，在这份修订版里记为结果待确认的缺口，不记为未尝试。';

describe('结果待确认 over the real store', () => {
  it('keeps unit 4 at once as its own gap, reads the other seven, and stops 结果待确认 with no 续行', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await stoppedRun(store, execution, 'L2 sample1 结果待确认');
      const ledger = store.baselineAnalysisLedger;
      // Unit 4 was sent once and never again; it is kept as its own gap, and the Run stopped holding nothing.
      const stopped = store.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.state).toBe('resumable');
      expect(stopped.stateLabel).toBe('结果待确认');
      expect(stopped.run?.stateLabel).toBe('结果待确认');
      expect(states(stopped)).toEqual(['authorized', 'admitted', 'executing', 'resumable']);
      expect(stopped.run?.transitions.at(-1)?.detail).toBe(outcomeUnknownDetail([4], SAMPLE1_UNITS, SAMPLE1_UNITS));
      expect(spansOf(store, bookId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(ledger.adaptationsOf(runRecordId)).toEqual([]);
      expect(stopped.taskOutcome).toBeNull();
      expect(stopped.resultSetRevision).toBeNull();
      const kept = ledger.unitCheckpoints(runRecordId);
      expect(kept.map((checkpoint) => checkpoint.unit.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(kept[3]!.unit.closed).toMatchObject({ state: 'gap', gap: { code: 'outcome-unknown', reason: UNKNOWN_GAP } });
      expect(ledger.outcomeUnknownOf(runRecordId)).toEqual({ units: [{ unitOrdinal: 4, attempts: 1, reason: UNKNOWN_GAP }] });

      // The drawer: 结果待确认 in its own words, the unconfirmed range, and no 续行 (ADR 0034, CONT-011, CONT-016).
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.state).toEqual({ key: 'outcome-unknown', label: '结果待确认' });
      expect(plan.runControl).toMatchObject({
        resume: null, redo: { reason: null }, continuation: { unitsSettled: SAMPLE1_UNITS, unitsTotal: SAMPLE1_UNITS }, accountLimit: null,
        outcomeUnknown: { units: [{ unitOrdinal: 4, attempts: 1 }], stopped: true },
      });
      expect(plan.technical.find((row) => row.key === 'outcome-unknown')?.value).toBe(`第 4 个阅读范围 · 已发送 1 次 · ${UNKNOWN_GAP}`);
      // 待我处理: 异常与结果待确认, blocking, whose next step is 查看未确认的部分.
      expect(attentionOf(store, bookId)?.[0]).toBe('exceptions');
      expect(attentionOf(store, bookId)?.[1]).toMatchObject({ state: 'analysis-outcome-unknown', blocked: true, nextStep: 'view-unconfirmed', target: { kind: 'analysis-plan', bookId, taskIntentId } });
      // A stopped Task is not done: the Book takes no new one until it is cancelled or redone.
      expect(await refusal(() => prepare(store, bookId))).toBe('ANALYSIS_TASK_ACTIVE');
      // 续行 is refused by the store and by the executor alike, and nothing is sent.
      expect(await refusal(() => store.continuableBaselineAnalysisRun(bookId, taskIntentId))).toBe('ANALYSIS_RESUME_OUTCOME_UNKNOWN');
      expect(() => execution.admitAndDispatch(runRecordId, ledger, { resume: true })).toThrowError(OUTCOME_UNKNOWN_NO_RESUME);
      await execution.whenIdle();
      expect(spansOf(store, bookId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(states(store.inspectBaselineAnalysis(bookId, () => null))).toEqual(['authorized', 'admitted', 'executing', 'resumable']);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('cancels a Run stopped 结果待确认 into its partial revision, unit 4 its own outcome-unknown gap', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await stoppedRun(store, execution, 'L2 sample1 结果待确认取消');
      const before = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(before.state.key).toBe('outcome-unknown');
      // 取消任务's summary says what it keeps, and that unit 4 ends as its own gap rather than a range not attempted.
      expect(before.runControl?.cancel.impact).toContain(CANCEL_LINE);
      store.requestBaselineAnalysisCancel(bookId, taskIntentId);
      execution.cancelRun(runRecordId, store.baselineAnalysisLedger);
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.state).toBe('cancelled');
      expect(spansOf(store, bookId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(cancelled.resultSetRevision?.coverage.unitsClosed).toBe(7);
      expect(cancelled.resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code, gap.reason])).toEqual([[4, 'outcome-unknown', UNKNOWN_GAP]]);
      expect(cancelled.taskOutcome!.report!.usagePerStage.units.requests).toBe(SAMPLE1_UNITS);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('Scenario A: a pause holding unit 4, 续行, an immediate 暂停 and 续行 again never re-send unit 4', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await pausedHoldingUnit4(store, 'L2 sample1 结果待确认暂停');
      const ledger = store.baselineAnalysisLedger;
      expect(store.inspectBaselineAnalysis(bookId, () => null).run?.state).toBe('paused');
      expect(ledger.unconfirmedRangesOf(runRecordId).map((unit) => unit.unitOrdinal)).toEqual([4]);
      // The paused Run lists in 异常与结果待确认, and its 取消影响摘要 names unit 4 (P2-1); it may still go on with the others.
      expect(attentionOf(store, bookId)?.[1]).toMatchObject({ state: 'analysis-outcome-unknown', nextStep: 'view-unconfirmed' });
      const paused = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(paused.state.key).toBe('paused');
      expect(paused.runControl).toMatchObject({ resume: { reason: null }, outcomeUnknown: { units: [{ unitOrdinal: 4, attempts: 1 }], stopped: false } });
      expect(paused.runControl?.cancel.impact).toContain(CANCEL_LINE);
      // 续行, then 暂停 before it reaches its first range: the early pause keeps unit 4 where it was.
      execution.admitAndDispatch(runRecordId, ledger, { resume: true });
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      execution.pauseRun(runRecordId, ledger);
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).run?.state).toBe('paused');
      expect(ledger.unconfirmedRangesOf(runRecordId).map((unit) => unit.unitOrdinal)).toEqual([4]);
      // 续行 again reads 6, 7 and 8 — never 4 — and stops 结果待确认.
      execution.admitAndDispatch(runRecordId, ledger, { resume: true });
      await execution.whenIdle();
      expect(spansOf(store, bookId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(store.inspectBaselineAnalysis(bookId, () => null).stateLabel).toBe('结果待确认');
      expect(ledger.outcomeUnknownOf(runRecordId)?.units.map((unit) => [unit.unitOrdinal, unit.attempts])).toEqual([[4, 1]]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('Scenario B: the same pauses and then 取消任务 record unit 4 as outcome-unknown, never not-attempted', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await pausedHoldingUnit4(store, 'L2 sample1 结果待确认暂停取消');
      const ledger = store.baselineAnalysisLedger;
      execution.admitAndDispatch(runRecordId, ledger, { resume: true });
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      execution.pauseRun(runRecordId, ledger);
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).run?.state).toBe('paused');
      store.requestBaselineAnalysisCancel(bookId, taskIntentId);
      execution.cancelRun(runRecordId, ledger);
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.state).toBe('cancelled');
      expect(spansOf(store, bookId)).toEqual([1, 2, 3, 4, 5]);
      expect(cancelled.resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([
        [4, 'outcome-unknown'], [6, 'not-attempted'], [7, 'not-attempted'], [8, 'not-attempted'],
      ]);
      expect(cancelled.taskOutcome!.report!.usagePerStage.units.requests).toBe(5);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('keeps unit 4 through the startup reconciliation of a Run a stopped service left executing, and its 续行 never re-sends it', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await pausedHoldingUnit4(store, 'L2 sample1 结果待确认对账');
      const ledger = store.baselineAnalysisLedger;
      // A 续行 under way when the service stopped: the ledger says admitted and executing, and nothing more.
      ledger.recordRunState(runRecordId, 'admitted', { detail: '服务停止前记录。' });
      ledger.recordRunState(runRecordId, 'executing', { detail: '服务停止前记录。' });
      expect(store.reconcileStoppedBaselineAnalysisRuns()).toMatchObject({ settled: 1 });
      const reconciled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(reconciled.run?.transitions.at(-1)).toMatchObject({ state: 'resumable', detail: RECONCILED_RESUMABLE_DETAIL });
      expect(ledger.unconfirmedRangesOf(runRecordId).map((unit) => unit.unitOrdinal)).toEqual([4]);
      expect(attentionOf(store, bookId)?.[1]).toMatchObject({ state: 'analysis-outcome-unknown' });
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).runControl).toMatchObject({ outcomeUnknown: { stopped: false } });
      execution.admitAndDispatch(runRecordId, ledger, { resume: true });
      await execution.whenIdle();
      expect(spansOf(store, bookId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(store.inspectBaselineAnalysis(bookId, () => null).stateLabel).toBe('结果待确认');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('ends as the ceiling reached when it is spent while unit 4 is unconfirmed, unit 4 its own gap and never re-sent', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 结果待确认预算');
      const bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      // 5,000 tokens: units 1 to 3 spend 4,920, unit 4 reports none, unit 5 takes the Run past the ceiling.
      const edited = store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [],
        runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 5000 },
      });
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, edited.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await execution.whenIdle();
      const ended = store.inspectBaselineAnalysis(bookId, () => null);
      expect(ended.run?.state).toBe('interrupted');
      expect(ended.taskOutcome?.stop).toMatchObject({ reason: 'run-budget-ceiling-reached', maxTotalTokens: 5000 });
      expect(spansOf(store, bookId)).toEqual([1, 2, 3, 4, 5]);
      expect(ended.resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([
        [4, 'outcome-unknown'], [6, 'not-attempted'], [7, 'not-attempted'], [8, 'not-attempted'],
      ]);
      expect(store.baselineAnalysisLedger.outcomeUnknownOf(runRecordId)).toBeNull();
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('names an ambiguous reduction and sample 结果待确认 in their own words, never 被中断 (P2-2)', async () => {
    const happy = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
    // The happy fixture with the ordinal-0 entries of one suboperation — told apart by the result schema they answer in —
    // answering 结果待确认 instead.
    const ambiguousFor = (schema: string): ResolvedModelFixture => ({
      ...happy,
      entries: new Map([...happy.entries].map(([key, entry]) => [key,
        entry.unitOrdinal === 0 && entry.response.kind === 'unit-result' && entry.response.text.includes(schema)
          ? { ...entry, response: { kind: 'outcome-unknown' as const, message: '合成：回答没有完整传回。' } }
          : entry])),
    });
    const UNKNOWN_SUBOPERATION = `${UNKNOWN_REASON}；${OUTCOME_UNKNOWN_NOT_RESENT}。`;
    // Each variant on its own Agent Data Root, since a route is bound when the store opens.
    const runOver = async (route: ResolvedModelFixture, title: string) => {
      const outer = roots;
      roots = await createServiceTestRoots('ai7-service-outcome-unknown-step-');
      fixture = route;
      const store = await openWithRoute();
      const execution = owner(store);
      try {
        const { bookId } = await stoppedRun(store, execution, title);
        const report = store.inspectBaselineAnalysis(bookId, () => null).taskOutcome!.report!;
        store.markCleanShutdown();
        return report;
      } finally {
        await execution.dispose();
        store.close();
        await roots.dispose();
        roots = outer;
      }
    };
    const reduction = await runOver(ambiguousFor('cross-unit-result'), 'L2 sample1 归纳结果待确认');
    expect(reduction.failures).toEqual([{ stage: 'cross-unit-reduction', code: 'gap', reason: UNKNOWN_SUBOPERATION }]);
    const sampling = await runOver(ambiguousFor('assurance-sampling-result'), 'L2 sample1 抽样结果待确认');
    const sampled = sampling.failures.filter((entry) => entry.stage === 'assurance-sampling');
    expect(sampled.length).toBeGreaterThan(0);
    for (const entry of sampled) expect(entry.reason).toContain(UNKNOWN_SUBOPERATION);
    expect(JSON.stringify(sampling)).not.toContain('保证抽样被中断');
    // The reflection's request digest binds the Run's own accounting, which no edited fixture reproduces; its words come from the
    // same `ambiguousTurnReason`, pinned in tests/unit/baseline-analysis-gap-readings.test.ts.
  }, 300_000);

  it('refuses its stimulus at startup for every launch but J-10, before the store opens', async () => {
    // The very loader the service's startup calls for `--j04-model-adapter` (src/service/index.ts).
    for (const journey of [undefined, 'J-04', 'J-09', 'J-11', 'J-13', 'J-16', 'J-07']) {
      await expect(loadLaunchFixture(FIXTURES_ROOT, 'sample1-baseline-outcome-unknown', journey)).rejects.toMatchObject({ code: 'MODEL_FIXTURE_REFUSED' });
      await expect(loadLaunchFixture(FIXTURES_ROOT, 'sample1-baseline-outcome-unknown', journey)).rejects.toBeInstanceOf(ModelFixtureError);
      expect(outcomeUnknownFixtureAllowed(fixture, journey)).toBe(false);
    }
    expect((await loadLaunchFixture(FIXTURES_ROOT, 'sample1-baseline-outcome-unknown', 'J-10')).sha256).toBe(fixture.sha256);
    // Every other fixture binds as it always has.
    expect((await loadLaunchFixture(FIXTURES_ROOT, 'sample1-baseline-happy', undefined)).identity).toBe('sample1-baseline-happy');
  });
});
