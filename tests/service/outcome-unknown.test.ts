import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, OUTCOME_UNKNOWN_CARRIED, OUTCOME_UNKNOWN_NOT_RESENT } from '../../src/service/analysis/execution.js';
import { RECONCILED_RESUMABLE_DETAIL } from '../../src/service/analysis/baseline-analysis-store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { resendDisclosure } from '../../src/service/task-plan.js';
import { ModelFixtureError, fixtureEntryKey, loadLaunchFixture, loadModelFixture, outcomeUnknownFixtureAllowed, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { QUICK_START_RESEND } from '../../src/service/default-execution-rules.js';
import { BACKGROUND_OUTCOME_UNKNOWN } from '../../src/service/background-analysis-enrollments.js';
import { BackgroundAnalysisDispatcher } from '../../src/service/background-analysis.js';
import { EditorialStore, StoreError, type BackgroundAnalysisRuntime } from '../../src/service/store.js';
import { BASELINE_ANALYSIS_MODE_GOALS, BASELINE_ANALYSIS_TASK_GOAL, FACTUAL_REVIEW_TASK_GOAL, type BaselineAnalysisProjection, type BaselineAnalysisUpdateMode, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 结果待确认 (Issue #51, plan slice S16c; V2-UX-CTRL-007, COPY-009, CONT-011, CONT-016; ADR
// 0034): the real store on a temporary Agent Data Root, exact `sample1` imported through the supported path, and J-04's
// deterministic route over `sample1-baseline-outcome-unknown` — unit 4's first request is sent and its answer never comes
// back whole. No Provider, socket or credential value. Unit 4 is kept at once as its own `outcome-unknown` gap and nothing in
// the Run ever sends it again — not 续行, not after a pause, a reconciliation or a spent ceiling; the Run reads the other
// seven and completes with its revision and outcome, without resending the unknown unit.

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const UNKNOWN_REASON = '该单元结果未知：请求已发出，但回答没有完整传回，无法确认模型服务是否已处理并计费。（AI7_OUTCOME_UNKNOWN）';

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
  it('completes the baseline with unit 4 as a gap, a revision and an outcome, without resending', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await stoppedRun(store, execution, 'L2 sample1 单元结果未知');
      const ledger = store.baselineAnalysisLedger;
      const completed = store.inspectBaselineAnalysis(bookId, () => null);
      expect(completed.state).toBe('settled');
      expect(states(completed)).toEqual(['authorized', 'admitted', 'executing', 'completed-with-gaps']);
      expect(completed.taskOutcome?.classification).toBe('completed-with-gaps');
      expect(completed.resultSetRevision?.coverage.unitsClosed).toBe(7);
      expect(completed.resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code, gap.reason]))
        .toEqual([[4, 'outcome-unknown', UNKNOWN_GAP]]);
      expect(spansOf(store, bookId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(ledger.adaptationsOf(runRecordId)).toEqual([]);
      expect(ledger.outcomeUnknownOf(runRecordId)).toBeNull();
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.state).toEqual({ key: 'settled', label: '已完成' });
      expect(plan.runControl?.resume ?? null).toBeNull();
      expect(plan.unconfirmed?.ranges.map((range) => range.unitOrdinal)).toEqual([4]);
      expect(attentionOf(store, bookId)?.[1]).toMatchObject({ state: 'analysis-outcome-unconfirmed', blocked: false, nextStep: 'view-unconfirmed' });
      expect(() => execution.admitAndDispatch(runRecordId, ledger, { resume: true })).toThrow();
      expect(spansOf(store, bookId).filter((ordinal) => ordinal === 4)).toHaveLength(1);
      // A fresh Task is allowed, but its Plan Preview discloses the possible double billing before new authorization.
      let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], { mode: 'reanalyze-book', selectedRange: null }, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const next = progress.projection!;
      expect(next.update?.reusePlan?.counts).toMatchObject({ reused: 0, recomputed: 8 });
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: next.taskIntent!.taskIntentId }).resend)
        .toEqual({ units: [4], statement: resendDisclosure([4]) });
      store.markCleanShutdown();
    } finally { await execution.dispose(); store.close(); }
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
      // Its 改计划重做 summary counts what was read apart from unit 4 and discloses that the new Task sends unit 4 again.
      expect(paused.redo?.summary).toContain('这项任务会在这里停下并取消；已读完的 4 个阅读范围（另有 1 个结果待确认）保留在一份新的结果集修订版里，没读到的记为未尝试。');
      expect(paused.redo?.summary).toContain(resendDisclosure([4]));
      // 续行, then 暂停 before it reaches its first range: the early pause keeps unit 4 where it was.
      execution.admitAndDispatch(runRecordId, ledger, { resume: true });
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      execution.pauseRun(runRecordId, ledger);
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).run?.state).toBe('paused');
      expect(ledger.unconfirmedRangesOf(runRecordId).map((unit) => unit.unitOrdinal)).toEqual([4]);
      // 续行 again reads 6, 7 and 8 — never 4 — and completes with its gap.
      execution.admitAndDispatch(runRecordId, ledger, { resume: true });
      await execution.whenIdle();
      expect(spansOf(store, bookId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(store.inspectBaselineAnalysis(bookId, () => null).state).toBe('settled');
      expect(ledger.outcomeUnknownOf(runRecordId)).toBeNull();
      expect(ledger.unconfirmedRangesOf(runRecordId).map((unit) => [unit.unitOrdinal, unit.attempts])).toEqual([[4, 1]]);
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
      expect(store.inspectBaselineAnalysis(bookId, () => null).state).toBe('settled');
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

  it('settles an unknown unit of a kind that keeps no progress as its gap, reads on and completes with a Task Outcome', async () => {
    // The factual kind (Issue #53) keeps no continuation checkpoints, so it never stops 结果待确认: unit 3's request is sent once,
    // its answer never comes back whole, the unit is its own outcome-unknown gap, and the Run reads on to its end.
    const factual = await loadModelFixture(FIXTURES_ROOT, 'sample1-factual-authored');
    fixture = {
      ...factual,
      entries: new Map([...factual.entries].map(([key, entry]) => [key, entry.unitOrdinal === 3
        ? { ...entry, response: { kind: 'outcome-unknown' as const, message: '合成：回答没有完整传回。' } }
        : entry])),
    };
    const store = await openWithRoute();
    const execution = new BaselineAnalysisExecutionOwner({
      ledger: store.factualReviewLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null },
    });
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 事实核查结果待确认');
      const bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      let progress = store.createFactualReviewPreparationWork(bookId, FACTUAL_REVIEW_TASK_GOAL, launchPolicy);
      while (!progress.done) progress = store.advanceFactualReviewPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      const runRecordId = store.authorizeFactualReview(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId, store.factualReviewLedger);
      await execution.whenIdle();
      const settled = store.inspectFactualReview(bookId);
      expect(settled.state).toBe('settled');
      expect(settled.taskOutcome?.classification).toBe('completed-with-gaps');
      expect(settled.resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code, gap.reason])).toEqual([[3, 'outcome-unknown', UNKNOWN_GAP]]);
      expect(settled.run?.attempt?.spans.filter((span) => span.unitOrdinal === 3)).toHaveLength(1);
      expect(store.factualReviewLedger.currentRunState(runRecordId)).toBe('completed-with-gaps');
      // Nothing is left standing: a further factual Task is never refused as one still active.
      expect(await refusal(() => store.createFactualReviewPreparationWork(bookId, FACTUAL_REVIEW_TASK_GOAL, launchPolicy))).not.toBe('ANALYSIS_TASK_ACTIVE');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
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

// Issue #51 (S16c; review of #755, P2-a and P2-b): after 取消任务 settles 结果待确认, every Task that sends unit 4 again says so in
// its plan, whatever recomputes it, and nothing starts one without the editor reading that plan.
describe('per-unit unknown after completion', () => {
  /** A Run stopped 结果待确认 and cancelled: the Book's latest revision holds unit 4 as its own outcome-unknown gap. */
  async function cancelledHoldingUnit4(store: EditorialStore, execution: BaselineAnalysisExecutionOwner, title: string) {
    const stopped = await stoppedRun(store, execution, title);
    expect(store.inspectBaselineAnalysis(stopped.bookId, () => null).run?.state).toBe('completed-with-gaps');
    return stopped;
  }
  const prepareUpdate = (store: EditorialStore, bookId: string, mode: BaselineAnalysisUpdateMode, selectedRange: { startPosition: number; endPosition: number } | null = null) => {
    let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_MODE_GOALS[mode], { mode, selectedRange }, launchPolicy);
    while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
    return progress.projection!;
  };
  const resendOf = (store: EditorialStore, bookId: string, taskIntentId: string) => store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).resend;
  const ONLINE = { reading: () => 'online' as const, reachesNetwork: (routeKind: string | null) => routeKind === LOCAL_DETERMINISTIC_ROUTE, slotBusy: () => false };

  it('names unit 4 for 重新分析全书 and for 重新分析所选范围 over it, by content, whatever recomputes it', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId } = await cancelledHoldingUnit4(store, execution, 'L2 sample1 结果待确认重算');
      const book = prepareUpdate(store, bookId, 'reanalyze-book');
      expect(book.update?.reusePlan?.units.find((unit) => unit.unitOrdinal === 4)?.reason).toBe('bypassed-whole-book');
      expect(resendOf(store, bookId, book.taskIntent!.taskIntentId)).toEqual({ units: [4], statement: resendDisclosure([4]) });
      const unit4 = book.coverageManifest!.units[3]!;
      const range = prepareUpdate(store, bookId, 'reanalyze-range', { startPosition: unit4.startPosition, endPosition: unit4.endPosition });
      expect(range.update?.reusePlan?.units.find((unit) => unit.unitOrdinal === 4)?.reason).toBe('bypassed-selected-range');
      expect(resendOf(store, bookId, range.taskIntent!.taskIntentId)).toEqual({ units: [4], statement: resendDisclosure([4]) });
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('never counts a Task\'s own Run against its plan: a 重新分析全书 that first leaves unit 4 结果待确认 names no re-send (#765 review)', async () => {
    // The happy fixture for the first Task; the second Task's unit 4 answers 结果待确认 on its first send.
    const unknown4 = [...fixture.entries.values()].find((entry) => entry.unitOrdinal === 4 && entry.response.kind === 'outcome-unknown')!;
    const happy = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
    fixture = happy;
    const store = await openWithRoute();
    const first = owner(store);
    fixture = { ...happy, entries: new Map([...happy.entries, [fixtureEntryKey(4, unknown4.requestDigest, 1), unknown4]]) };
    const second = owner(store);
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 自身结果待确认');
      const bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const initial = prepare(store, bookId);
      first.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, initial.taskIntent!.taskIntentId, initial.planEnvelope!.digest).dispatchRunRecordId!);
      await first.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision!.gaps).toEqual([]);
      const book = prepareUpdate(store, bookId, 'reanalyze-book');
      const taskIntentId = book.taskIntent!.taskIntentId;
      expect(resendOf(store, bookId, taskIntentId)).toBeNull();
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, book.planEnvelope!.digest).dispatchRunRecordId!;
      second.admitAndDispatch(runRecordId);
      await second.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.resultSetRevision!.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([[4, 'outcome-unknown']]);
      // Its own send is no earlier request: the cancelled Task's plan names none, and the Task the editor prepares next does.
      expect(store.baselineAnalysisLedger.resendUnitsOf(cancelled)).toEqual([]);
      expect(resendOf(store, bookId, taskIntentId)).toBeNull();
      const next = prepareUpdate(store, bookId, 'reanalyze-book');
      expect(resendOf(store, bookId, next.taskIntent!.taskIntentId)).toEqual({ units: [4], statement: resendDisclosure([4]) });
      store.markCleanShutdown();
    } finally {
      await first.dispose();
      await second.dispose();
      store.close();
    }
  }, 300_000);

  it('never names an ordinary gap: unit 2 failed for good beside unit 4, and only unit 4 is sent again knowingly', async () => {
    // The one-unit-failure fixture (unit 2 fails for good) with unit 4 answering 结果待确认.
    const failing = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
    const unknown4 = [...fixture.entries.values()].find((entry) => entry.unitOrdinal === 4 && entry.response.kind === 'outcome-unknown')!;
    fixture = { ...failing, entries: new Map([...failing.entries, [fixtureEntryKey(4, unknown4.requestDigest, 1), unknown4]]) };
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId } = await cancelledHoldingUnit4(store, execution, 'L2 sample1 结果待确认与失败');
      expect(store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code]))
        .toEqual([[2, 'adapter-failure'], [4, 'outcome-unknown']]);
      // 重新分析全书 reads every range again, unit 2 among them: only unit 4 is named.
      const book = prepareUpdate(store, bookId, 'reanalyze-book');
      expect(book.update?.reusePlan?.counts.recomputed).toBe(SAMPLE1_UNITS);
      expect(resendOf(store, bookId, book.taskIntent!.taskIntentId)).toEqual({ units: [4], statement: resendDisclosure([4]) });
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('快速开始 falls back to the plan, recording nothing, when the Task would send unit 4 again', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId } = await cancelledHoldingUnit4(store, execution, 'L2 sample1 结果待确认快速开始');
      const plan = prepareUpdate(store, bookId, 'reanalyze-book');
      const rule = store.setDefaultExecutionRule(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest);
      const quick = await store.quickStartBaselineAnalysis(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest, rule.ruleVersionId,
        { credentialReadiness: async () => null, connectivity: ONLINE });
      expect(quick).toEqual({ outcome: 'fell-back', reasons: [QUICK_START_RESEND], dispatchRunRecordId: null });
      const after = store.inspectBaselineAnalysis(bookId, () => null);
      expect(after.taskIntent!.taskIntentId).toBe(plan.taskIntent!.taskIntentId);
      expect(after.authorization).toBeNull();
      expect(after.run).toBeNull();
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('the background dispatcher never starts a Task that would send unit 4 again, and says why until the editor starts one', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId } = await cancelledHoldingUnit4(store, execution, 'L2 sample1 结果待确认后台');
      const imported = store.inspectBaselineAnalysis(bookId, () => null).checkpoint!;
      const runtime = (): BackgroundAnalysisRuntime => ({ routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now() + 600_000, quietMs: 30_000 });
      const shown = store.inspectBackgroundAnalysisEnrollment(bookId, runtime());
      expect(shown.offer.canEnroll).toBe(true);
      store.enrollBackgroundAnalysis(bookId, shown.offer.disclosureDigest!, 'prospective', { kind: 'book', seriesId: null }, 1_000_000, runtime());
      // A confirmed edit: the analysis is stale, the text moved since the editor's Task, and the quiet period has passed.
      const window = store.getManuscriptWindow(imported.manuscriptId, imported.branchId, null);
      const block = window.blocks.find((candidate) => candidate.kind === 'paragraph')!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: imported.manuscriptId, branchId: imported.branchId, baseRevisionId: window.revisionId,
        blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
        expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '〔结果待确认后的改动〕',
      });
      expect(store.backgroundAnalysisDecisionFor(bookId, runtime()).decision).toEqual({ kind: 'wait', reason: BACKGROUND_OUTCOME_UNKNOWN });
      const before = store.inspectBaselineAnalysis(bookId, () => null);
      const dispatcher = new BackgroundAnalysisDispatcher({ store, execution, launchPolicy, quietMs: 30_000, now: () => Date.now() + 600_000 });
      try {
        dispatcher.nudge();
        await dispatcher.settled();
        await execution.whenIdle();
      } finally {
        await dispatcher.dispose();
      }
      // Nothing was prepared or started; ②A reads why.
      const after = store.inspectBaselineAnalysis(bookId, () => null);
      expect(after.taskIntent!.taskIntentId).toBe(before.taskIntent!.taskIntentId);
      expect(after.run?.runRecordId).toBe(before.run?.runRecordId);
      expect(store.inspectBackgroundAnalysisEnrollment(bookId, runtime()).lastLook).toMatchObject({ kind: 'wait', reason: BACKGROUND_OUTCOME_UNKNOWN });
      // The editor's own Task names unit 4 in its plan before they start it; the dispatcher still prepares nothing of its own.
      const sync = prepareUpdate(store, bookId, 'sync-current');
      expect(resendOf(store, bookId, sync.taskIntent!.taskIntentId)?.units).toEqual([4]);
      expect(store.baselineAnalysisLedger.latestUnconfirmedRangesOf(bookId)).toEqual([4]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);
});

// Issue #51 (S16c; fourth review of #755): a Task the editor started over unit 4 and cancelled before it read unit 4 carries unit
// 4 forward as its own outcome-unknown gap — never `not-attempted` — so the next plan still names it and the dispatcher still
// waits; and the dispatcher's own start refuses a plan that would re-send it, whatever changed since its look.
describe('结果待确认 carried forward', () => {
  it('discloses a baseline re-send after the unknown range is edited and then reverted (#765)', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const stopped = await stoppedRun(store, execution, 'L2 sample1 改后还原');
      const { bookId } = stopped;
      const initial = store.inspectBaselineAnalysis(bookId, () => null);
      const checkpoint = initial.checkpoint!;
      const blockId = initial.coverageManifest!.units[3]!.blockIds.find((id) => store.baselineAnalysisLedger.readWorkingBlocks(checkpoint.branchId).find((block) => block.blockId === id)?.kind === 'paragraph')!;
      const edit = (revert: boolean) => {
        const window = store.getManuscriptWindowAt(checkpoint.manuscriptId, checkpoint.branchId, { kind: 'block', blockId });
        const block = window.blocks.find((entry) => entry.blockId === blockId)!;
        store.flushJournalEdit({
          clientEditId: randomUUID(), manuscriptId: checkpoint.manuscriptId, branchId: checkpoint.branchId, baseRevisionId: window.revisionId,
          blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
          fromGrapheme: 0, toGrapheme: revert ? 1 : 0, insertText: revert ? '' : '改',
        });
      };
      const sync = () => {
        let work = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_MODE_GOALS['sync-current'], { mode: 'sync-current', selectedRange: null }, launchPolicy);
        while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
        return work.projection!;
      };
      edit(false);
      const changed = sync();
      expect(store.baselineAnalysisLedger.resendUnitsOf(changed)).not.toContain(4);
      execution.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, changed.taskIntent!.taskIntentId, changed.planEnvelope!.digest).dispatchRunRecordId!);
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision!.gaps.some((gap) => gap.code === 'outcome-unknown')).toBe(false);
      edit(true);
      const reverted = sync();
      expect(store.baselineAnalysisLedger.resendUnitsOf(reverted)).toContain(4);
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: reverted.taskIntent!.taskIntentId }).resend?.units).toContain(4);
      store.markCleanShutdown();
    } finally { await execution.dispose(); store.close(); }
  }, 300_000);

  it('keeps unit 4 outcome-unknown through a later Task cancelled before it, and the dispatcher never re-sends it', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const stopped = await stoppedRun(store, execution, 'L2 sample1 结果待确认延续');
      const { bookId } = stopped;
      const checkpoint = store.inspectBaselineAnalysis(bookId, () => null).checkpoint!;
      const editFirstParagraph = (text: string): void => {
        const window = store.getManuscriptWindow(checkpoint.manuscriptId, checkpoint.branchId, null);
        const block = window.blocks.find((candidate) => candidate.kind === 'paragraph')!;
        store.flushJournalEdit({
          clientEditId: randomUUID(), manuscriptId: checkpoint.manuscriptId, branchId: checkpoint.branchId, baseRevisionId: window.revisionId,
          blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
          expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: text,
        });
      };
      const prepareSync = () => {
        let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_MODE_GOALS['sync-current'], { mode: 'sync-current', selectedRange: null }, launchPolicy);
        while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
        return progress.projection!;
      };
      // The editor edits, prepares 同步到当前稿件 — whose plan names unit 4 — starts it, and cancels it after its first turn.
      editFirstParagraph('〔结果待确认后的第一次改动〕');
      const sync = prepareSync();
      const recomputed = sync.update!.reusePlan!.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => unit.unitOrdinal);
      expect(recomputed).toContain(4);
      expect(recomputed[0]).toBeLessThan(4);
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: sync.taskIntent!.taskIntentId }).resend?.units).toEqual([4]);
      const runRecordId = store.authorizeBaselineAnalysis(bookId, sync.taskIntent!.taskIntentId, sync.planEnvelope!.digest).dispatchRunRecordId!;
      let turns = 0;
      const held: BaselineAnalysisExecutionOwner = new BaselineAnalysisExecutionOwner({
        ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null },
        unitHold: async () => {
          turns += 1;
          if (turns === 1) {
            store.requestBaselineAnalysisCancel(bookId, sync.taskIntent!.taskIntentId);
            held.cancelRun(runRecordId, store.baselineAnalysisLedger);
          }
        },
      });
      try {
        held.admitAndDispatch(runRecordId);
        await held.whenIdle();
      } finally {
        await held.dispose();
      }
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.state).toBe('cancelled');
      expect(cancelled.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([recomputed[0]]);
      // Unit 4 was not read by this Run: it is still the outcome-unknown gap it was, never `not-attempted`.
      const gap4 = cancelled.resultSetRevision!.gaps.find((gap) => gap.unitOrdinal === 4)!;
      expect(gap4.code).toBe('outcome-unknown');
      expect(gap4.reason).toBe(`${UNKNOWN_REASON}；${OUTCOME_UNKNOWN_CARRIED}`);
      expect(store.baselineAnalysisLedger.latestUnconfirmedRangesOf(bookId)).toEqual([4]);

      // One more edit: the next 同步 still names unit 4, and the dispatcher still waits rather than re-sending it.
      const runtime = (): BackgroundAnalysisRuntime => ({ routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now() + 600_000, quietMs: 30_000 });
      const shown = store.inspectBackgroundAnalysisEnrollment(bookId, runtime());
      const enrollmentVersionId = store.enrollBackgroundAnalysis(bookId, shown.offer.disclosureDigest!, 'prospective', { kind: 'book', seriesId: null }, 1_000_000, runtime()).enrollment!.enrollmentVersionId;
      editFirstParagraph('〔再一次改动〕');
      expect(store.backgroundAnalysisDecisionFor(bookId, runtime()).decision).toEqual({ kind: 'wait', reason: BACKGROUND_OUTCOME_UNKNOWN });
      // Were the dispatcher to prepare a 同步 regardless — something changing between its look and its start — its start refuses
      // it and records nothing (P3).
      let background = store.createBackgroundBaselineAnalysisPreparationWork(bookId, 'sync-current', enrollmentVersionId, launchPolicy);
      while (!background.done) background = store.advanceBaselineAnalysisPreparationWork(background.workId!);
      const planned = background.projection!;
      expect(store.baselineAnalysisLedger.resendUnitsOf(planned)).toEqual([4]);
      expect(store.startEnrolledBaselineAnalysis(bookId, planned.taskIntent!.taskIntentId, planned.planEnvelope!.digest, enrollmentVersionId, 'sync-current', runtime()))
        .toEqual({ dispatchRunRecordId: null, reason: BACKGROUND_OUTCOME_UNKNOWN });
      expect(store.inspectBaselineAnalysis(bookId, () => null).authorization).toBeNull();
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);
});
