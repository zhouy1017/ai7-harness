import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, accountLimitDetail } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 模型服务账户限额 (Issue #51, plan slice S16b; V2-UX-MODEL-018, RUN-012): the real store on
// a temporary Agent Data Root, exact `sample1` imported through the supported path, and J-04's deterministic route over
// `sample1-baseline-account-limit` — unit 4's first turn is refused on the account's limit, and its next turn is the
// base's result, which models the provider-side condition clearing. No Provider, socket or credential value. The Run stops
// at that boundary keeping what it read, holds nothing, and names the stop in its own words; 续行 goes on in the same Run.

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-account-limit-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-account-limit');
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

describe('模型服务账户限额 over the real store', () => {
  it('stops a Run the account limit refused, keeping what it read, and goes on with 续行 once the limit clears', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 账户限额');
      const bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await execution.whenIdle();

      // Unit 4 was refused: the Run stopped at that boundary with three ranges kept, nothing more sent, holding nothing.
      const stopped = store.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.state).toBe('resumable');
      expect(stopped.stateLabel).toBe('模型服务账户限额');
      expect(stopped.run?.stateLabel).toBe('模型服务账户限额');
      expect(states(stopped)).toEqual(['authorized', 'admitted', 'executing', 'resumable']);
      expect(stopped.run?.transitions.at(-1)?.detail).toBe(accountLimitDetail(3, SAMPLE1_UNITS));
      expect(stopped.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4]);
      expect(stopped.taskOutcome).toBeNull();
      expect(stopped.resultSetRevision).toBeNull();
      expect(execution.busy).toBe(false);
      expect(store.baselineAnalysisLedger.unitCheckpoints(runRecordId).map((checkpoint) => checkpoint.unit.unitOrdinal)).toEqual([1, 2, 3]);
      const limit = store.baselineAnalysisLedger.accountLimitOf(runRecordId);
      expect(limit).toMatchObject({ unitOrdinal: 4 });
      expect(limit?.condition).toContain('模型服务账户限额');

      // The drawer: 模型服务账户限额 in its own words, 处理模型服务 and 续行, never 任务已中断 · 可续行 (RUN-012).
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.state).toEqual({ key: 'account-limit', label: '模型服务账户限额' });
      expect(plan.runControl).toMatchObject({
        resume: { reason: null }, continuation: { unitsSettled: 3, unitsTotal: SAMPLE1_UNITS }, accountLimit: { unitOrdinal: 4, condition: limit!.condition },
      });
      expect(limit!.condition).toBe('Provider Account Limit：模型服务账户限额阻止了本次请求。（QUOTA）');
      expect(plan.technical.find((row) => row.key === 'account-limit')?.value).toBe(limit!.condition);
      // 待我处理: an exception, blocking, whose next step is 处理模型服务.
      const item = store.inspectGlobalAttention(() => null, false).groups.flatMap((group) => group.items.map((entry) => [group.key, entry] as const))
        .find(([, entry]) => entry.book.bookId === bookId);
      expect(item?.[0]).toBe('exceptions');
      expect(item?.[1]).toMatchObject({ state: 'analysis-account-limit', blocked: true, nextStep: 'resolve-model-service', target: { kind: 'analysis-plan', bookId, taskIntentId } });
      // A stopped Task is not done: the Book takes no new one until it is continued or cancelled.
      expect(await refusal(() => prepare(store, bookId))).toBe('ANALYSIS_TASK_ACTIVE');

      // 续行 once the limit cleared: the same Run and attempt, a new span; unit 4's next turn is its second, and closes.
      execution.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true });
      await execution.whenIdle();
      const settled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(states(settled)).toEqual(['authorized', 'admitted', 'executing', 'resumable', 'admitted', 'executing', 'completed']);
      expect(settled.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 4, 5, 6, 7, 8]);
      expect(settled.taskOutcome?.classification).toBe('completed');
      expect(settled.taskOutcome?.stop).toBeNull();
      expect(settled.resultSetRevision?.coverage).toMatchObject({ unitsTotal: SAMPLE1_UNITS, unitsClosed: SAMPLE1_UNITS });
      expect(store.baselineAnalysisLedger.accountLimitOf(runRecordId)).toBeNull();
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).state.key).toBe('settled');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('cancels a Run the account limit stopped into its partial revision, the refused range not attempted', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 账户限额取消');
      const bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await execution.whenIdle();
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).state.key).toBe('account-limit');
      store.requestBaselineAnalysisCancel(bookId, taskIntentId);
      execution.cancelRun(runRecordId, store.baselineAnalysisLedger);
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.state).toBe('cancelled');
      expect(cancelled.resultSetRevision?.coverage.unitsClosed).toBe(3);
      expect(cancelled.resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([4, 5, 6, 7, 8].map((ordinal) => [ordinal, 'not-attempted']));
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);
});
