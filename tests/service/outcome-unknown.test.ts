import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, OUTCOME_UNKNOWN_CANCELLED_UNREAD, outcomeUnknownDetail } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, outcomeUnknownFixtureAllowed, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 结果待确认 (Issue #51, plan slice S16c; V2-UX-CTRL-007, COPY-009, CONT-011, CONT-016): the
// real store on a temporary Agent Data Root, exact `sample1` imported through the supported path, and J-04's deterministic
// route over `sample1-baseline-outcome-unknown` — unit 4's first request is sent and its answer never comes back whole, and
// its next turn is the base's result. No Provider, socket or credential value. The unit is never sent again on its own; the
// Run reads the other seven, then stops keeping what it read, in its own words; only the editor's 续行 reads unit 4 again,
// and 取消任务 keeps what was read with unit 4 the gap its sent request left.

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

describe('结果待确认 over the real store', () => {
  it('reads every other range, stops 结果待确认 without sending unit 4 again, and reads only it on the editor\'s 续行', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await stoppedRun(store, execution, 'L2 sample1 结果待确认');

      // Unit 4 was sent once and never again; the Run read on, kept seven ranges, and stopped holding nothing.
      const stopped = store.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.state).toBe('resumable');
      expect(stopped.stateLabel).toBe('结果待确认');
      expect(stopped.run?.stateLabel).toBe('结果待确认');
      expect(states(stopped)).toEqual(['authorized', 'admitted', 'executing', 'resumable']);
      expect(stopped.run?.transitions.at(-1)?.detail).toBe(outcomeUnknownDetail([4], 7, SAMPLE1_UNITS));
      expect(stopped.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(store.baselineAnalysisLedger.adaptationsOf(runRecordId)).toEqual([]);
      expect(stopped.taskOutcome).toBeNull();
      expect(stopped.resultSetRevision).toBeNull();
      expect(execution.busy).toBe(false);
      expect(store.baselineAnalysisLedger.unitCheckpoints(runRecordId).map((checkpoint) => checkpoint.unit.unitOrdinal)).toEqual([1, 2, 3, 5, 6, 7, 8]);
      expect(store.baselineAnalysisLedger.outcomeUnknownOf(runRecordId)).toEqual({
        units: [{ unitOrdinal: 4, attempts: 1, wallMs: expect.any(Number), usage: null, reason: UNKNOWN_REASON }],
      });

      // The drawer: 结果待确认 in its own words, the unconfirmed range, and 续行 — never 任务已中断 · 可续行.
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.state).toEqual({ key: 'outcome-unknown', label: '结果待确认' });
      expect(plan.runControl).toMatchObject({
        resume: { reason: null }, continuation: { unitsSettled: 7, unitsTotal: SAMPLE1_UNITS }, accountLimit: null,
        outcomeUnknown: { units: [{ unitOrdinal: 4, attempts: 1 }] },
      });
      expect(plan.technical.find((row) => row.key === 'outcome-unknown')?.value).toBe(`第 4 个阅读范围 · 已发送 1 次 · ${UNKNOWN_REASON}`);
      // 待我处理: 异常与结果待确认, blocking, whose next step is 查看未确认的部分.
      const item = store.inspectGlobalAttention(() => null, false).groups.flatMap((group) => group.items.map((entry) => [group.key, entry] as const))
        .find(([, entry]) => entry.book.bookId === bookId);
      expect(item?.[0]).toBe('exceptions');
      expect(item?.[1]).toMatchObject({ state: 'analysis-outcome-unknown', blocked: true, nextStep: 'view-unconfirmed', target: { kind: 'analysis-plan', bookId, taskIntentId } });
      // A stopped Task is not done: the Book takes no new one until it is continued or cancelled.
      expect(await refusal(() => prepare(store, bookId))).toBe('ANALYSIS_TASK_ACTIVE');

      // The editor's 续行: the same Run and attempt, a new span that reads unit 4 alone, as its second attempt.
      execution.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true });
      await execution.whenIdle();
      const settled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(states(settled)).toEqual(['authorized', 'admitted', 'executing', 'resumable', 'admitted', 'executing', 'completed']);
      expect(settled.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 4]);
      expect(settled.taskOutcome?.classification).toBe('completed');
      // The unknown request was sent: it counts toward the Run, and unit 4's row carries both its turns.
      const report = settled.taskOutcome!.report!;
      expect(report.usagePerStage.units.requests).toBe(SAMPLE1_UNITS + 1);
      expect(report.unitRows.find((row) => row.unitOrdinal === 4)?.attempts).toBe(2);
      expect(settled.resultSetRevision?.coverage).toMatchObject({ unitsTotal: SAMPLE1_UNITS, unitsClosed: SAMPLE1_UNITS });
      expect(store.baselineAnalysisLedger.outcomeUnknownOf(runRecordId)).toBeNull();
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).state.key).toBe('settled');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('cancels a Run stopped 结果待确认 into its partial revision, unit 4 the gap its sent request left under its own code', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const { bookId, taskIntentId, runRecordId } = await stoppedRun(store, execution, 'L2 sample1 结果待确认取消');
      const before = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(before.state.key).toBe('outcome-unknown');
      // 取消任务's summary says what it keeps, and that unit 4 ends as its own gap rather than a range not attempted.
      expect(before.runControl?.cancel.impact.slice(0, 3)).toEqual([
        '这项任务已经停下；之后的归纳、抽样都不再进行，不再发送任何内容。',
        '已读完的 7 个阅读范围的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
        '第 4 个阅读范围的结果待确认；取消后不再重读，在这份修订版里记为结果待确认的缺口。',
      ]);
      store.requestBaselineAnalysisCancel(bookId, taskIntentId);
      execution.cancelRun(runRecordId, store.baselineAnalysisLedger);
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.state).toBe('cancelled');
      // What was read is kept; nothing more was sent.
      expect(cancelled.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(cancelled.resultSetRevision?.coverage.unitsClosed).toBe(7);
      expect(cancelled.resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([[4, 'outcome-unknown']]);
      expect(cancelled.resultSetRevision!.gaps[0]!.reason).toBe(`${UNKNOWN_REASON}；${OUTCOME_UNKNOWN_CANCELLED_UNREAD}`);
      expect(cancelled.taskOutcome!.report!.usagePerStage.units.requests).toBe(SAMPLE1_UNITS);
      expect(store.baselineAnalysisLedger.outcomeUnknownOf(runRecordId)).toBeNull();
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('keeps unit 4 unconfirmed across a pause: the 续行 after it reads on and stops 结果待确认 again, sending unit 4 nothing', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 结果待确认暂停');
      const bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      // A unit hold lets five turns come back, then the editor pauses: units 1 to 3 and 5 settle, unit 4 is unconfirmed.
      let turns = 0;
      const held = new BaselineAnalysisExecutionOwner({
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
      const paused = store.inspectBaselineAnalysis(bookId, () => null);
      expect(paused.run?.state).toBe('paused');
      expect(store.baselineAnalysisLedger.unconfirmedUnitsOf(runRecordId)).toMatchObject({ rereading: false, units: [{ unitOrdinal: 4, attempts: 1 }] });
      // 续行 from the pause reads the rest — never unit 4, which only 结果待确认's 续行 reads — and stops 结果待确认.
      execution.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true });
      await execution.whenIdle();
      const stopped = store.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.stateLabel).toBe('结果待确认');
      expect(stopped.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(store.baselineAnalysisLedger.outcomeUnknownOf(runRecordId)?.units.map((unit) => [unit.unitOrdinal, unit.attempts])).toEqual([[4, 1]]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('binds its stimulus only under J-10: every other launch refuses the fixture before the store opens', () => {
    expect(outcomeUnknownFixtureAllowed(fixture, 'J-10')).toBe(true);
    for (const journey of [undefined, 'J-04', 'J-09', 'J-11', 'J-13', 'J-16', 'J-07']) expect(outcomeUnknownFixtureAllowed(fixture, journey)).toBe(false);
  });
});
