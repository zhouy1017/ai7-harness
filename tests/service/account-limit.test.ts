import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_LIMIT_CANCELLED_UNREAD, BaselineAnalysisExecutionOwner, accountLimitDetail } from '../../src/service/analysis/execution.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type BaselineAnalysisProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { accountLimitReached } from '../../src/service/task-plan.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

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
  return new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
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
      // ⑤'s 账户限额 says the limit was reached, in the provider's words, rather than 「未知」.
      expect(plan.service.accountLimit).toBe(accountLimitReached(limit!.condition));
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
      // The refused attempt was sent: it counts toward the Run, and unit 4's row carries both its turns.
      const report = settled.taskOutcome!.report!;
      expect(report.usagePerStage.units.requests).toBe(SAMPLE1_UNITS + 1);
      expect(report.unitRows.find((row) => row.unitOrdinal === 4)?.attempts).toBe(2);
      expect(settled.resultSetRevision?.coverage).toMatchObject({ unitsTotal: SAMPLE1_UNITS, unitsClosed: SAMPLE1_UNITS });
      expect(store.baselineAnalysisLedger.accountLimitOf(runRecordId)).toBeNull();
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).state.key).toBe('settled');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('cancels a Run the account limit stopped into its partial revision, the refused range the gap its sent attempt left', async () => {
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
      // Unit 4's attempt was sent and refused: it is that gap, in the provider's words, never a range not attempted.
      expect(cancelled.resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([[4, 'adapter-failure'], ...[5, 6, 7, 8].map((ordinal) => [ordinal, 'not-attempted'])]);
      const refused = cancelled.resultSetRevision!.gaps.find((gap) => gap.unitOrdinal === 4)!;
      expect(refused.reason).toBe(`Provider Account Limit：模型服务账户限额阻止了本次请求。（QUOTA）；${ACCOUNT_LIMIT_CANCELLED_UNREAD}`);
      expect(cancelled.taskOutcome!.report!.usagePerStage.units.requests).toBe(4);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);
});

// Finite-ceiling serial compatibility over the real production gate and DSH composition; no network or credential.
async function retryableLaunch() {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null, induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const route = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => binding.route === 'deepseek-open-platform')!;
  const pending = store.saveModelServiceConnection('L2 官方重试', null, 'needs-attention', route.route);
  store.saveModelServiceConnection('L2 官方重试', pending.credentialReference, 'ready', route.route);
  store.selectModelServiceRoute(route.route);
  const configured = { ...route, credentialReference: pending.credentialReference };
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy,
    live: { scope: 'ordinary-production', ...configured, runBudgetCeiling: 'unset' } });
  const { bookId } = await importSample1Book(store, roots.codeRoot, 'L2 官方限速');
  await pinEditorialWorkspaceProfileRevision2(store, bookId);
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const finite = store.editBaselineAnalysisPlan({ bookId, taskIntentId: prepared.taskIntent!.taskIntentId,
    planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [],
    runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 } });
  return { store, bookId, policy, prepared: finite };
}

describe('finite-ceiling serial backoff before the safe retry on the declared retryable route', () => {
  it.each([{ status: 429, retryAfter: '1', minimum: 1_000 }, { status: 503, retryAfter: null, minimum: 5_000 }])
    ('waits before the single $status retry and repeats the exact request', async ({ status, retryAfter, minimum }) => {
      const { store, bookId, policy, prepared } = await retryableLaunch();
      const calls: Array<{ at: number; body: string }> = [];
      const execution = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
        productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', binding),
        secretResolver: { resolve: async () => 'placeholder-production-key' },
        production: { scope: 'ordinary-production', nativeFetch: async (_url, init) => {
          calls.push({ at: Date.now(), body: String(init?.body) });
          return new Response('{}', { status: calls.length === 1 ? status : 401,
            headers: retryAfter === null ? {} : { 'Retry-After': retryAfter } });
        } } });
      try {
        const runId = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
        execution.admitAndDispatch(runId);
        await execution.whenIdle();
        expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(minimum - 10);
        expect(calls[1]!.body).toBe(calls[0]!.body);
        expect(store.baselineAnalysisLedger.adaptationsOf(runId)).toHaveLength(1);
        expect(store.inspectBaselineAnalysis(bookId, () => null).run?.attempt?.spans.filter((span) => span.unitOrdinal === 1)).toHaveLength(2);
      } finally { await execution.dispose(); store.close(); }
    }, 60_000);

  it('cancels a pending rate-limit backoff without sending its retry', async () => {
    const { store, bookId, policy, prepared } = await retryableLaunch();
    let sent!: () => void;
    const first = new Promise<void>((resolve) => { sent = resolve; });
    let calls = 0;
    const execution = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture: null,
      productionPolicyFor: (binding) => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', binding),
      secretResolver: { resolve: async () => 'placeholder-production-key' },
      production: { scope: 'ordinary-production', nativeFetch: async () => {
        calls += 1;
        sent();
        return new Response('{}', { status: 429, headers: { 'Retry-After': '60' } });
      } } });
    try {
      const taskId = prepared.taskIntent!.taskIntentId;
      const runId = store.authorizeBaselineAnalysis(bookId, taskId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runId);
      await first;
      await new Promise((resolve) => setTimeout(resolve, 50));
      store.requestBaselineAnalysisCancel(bookId, taskId);
      execution.cancelRun(runId);
      await execution.whenIdle();
      expect(calls).toBe(1);
      expect(store.baselineAnalysisLedger.adaptationsOf(runId)).toEqual([]);
      expect(store.inspectBaselineAnalysis(bookId, () => null).run?.state).toBe('cancelled');
    } finally { await execution.dispose(); store.close(); }
  }, 60_000);
});
