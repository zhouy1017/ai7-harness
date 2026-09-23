import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUDGET_REACHED_NEXT_ACTION, BaselineAnalysisExecutionOwner, CROSS_UNIT_BUDGET_REACHED } from '../../src/service/analysis/execution.js';
import { SET_RULE_BUDGET } from '../../src/service/default-execution-rules.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { controlledUnitHold } from '../../src/service/unit-hold.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateRequest,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for the editor's Run Budget Ceiling (Issue #51, plan slice S16a; V2-UX-MODEL-013 to
// MODEL-017): the real store on a temporary Agent Data Root, exact `sample1` imported through the supported path, J-04's
// deterministic route — whose fixture reports each turn's tokens, which the ceiling counts — and no Provider, socket or
// credential value. The editor sets a ceiling as a plan edit; the Run it binds stops once the ceiling is spent, keeping
// what it read as a partial revision and naming the stop; 调整预算并重做 carries that into a new Task under a raised one.

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;
let holdPath: string;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const SYNC = { mode: 'sync-current', selectedRange: null } as const;
const tokens = (maxTotalTokens: number) => ({ kind: 'tokens' as const, maxTotalTokens });
// What the happy fixture reports for each unit's one turn, in unit order: 1,760 + 1,320 + 1,840 + 1,700 = 6,620 after four.
const UNIT_TOKENS = [1760, 1320, 1840, 1700, 1580, 1600, 1660, 920];

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-budget-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  holdPath = join(roots.dataRoot, '..', 'j10-unit-hold.txt');
  writeFileSync(holdPath, 'release');
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
  return new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger,
    launchPolicy,
    fixture,
    secretResolver: { resolve: async () => null },
    unitHold: controlledUnitHold(holdPath, { pollMs: 5 }),
  });
}

function prepare(store: EditorialStore, bookId: string, update: BaselineAnalysisUpdateRequest | null = null, redoOf: string | null = null): BaselineAnalysisProjection {
  const goal = update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode];
  let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, update, launchPolicy, false, redoOf);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

async function importedBook(store: EditorialStore, title: string): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
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

async function run(store: EditorialStore, execution: BaselineAnalysisExecutionOwner, bookId: string, taskIntentId: string, digest: string): Promise<BaselineAnalysisProjection> {
  const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, digest).dispatchRunRecordId!;
  execution.admitAndDispatch(runRecordId);
  await execution.whenIdle();
  return store.inspectBaselineAnalysis(bookId, () => null);
}

describe('the editor\'s Run Budget Ceiling over the real store', () => {
  it('sets a ceiling in the plan, stops the Run at it keeping what it read, and redoes it under a raised one', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const bookId = await importedBook(store, 'L2 sample1 预算上限');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const plan = (ref = taskIntentId): ReturnType<EditorialStore['inspectTaskPlan']> => store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref });
      // MODEL-013: no ceiling by default, and the editor may set one here.
      expect(prepared.providerResolutionPlan?.runBudgetCeiling).toBe('unset');
      expect(plan().service).toMatchObject({ budgetCeiling: '未设置任务预算上限', usage: '不发送，没有模型用量', usageIsCeiling: false });
      expect(plan().edit.budget).toEqual({ ceiling: 'unset', settable: true, reason: null });

      // 设置上限… then 更新计划: version 2 freezes 5,000 tokens into the Provider Resolution Plan, as the editor's own change.
      const edited = store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: tokens(5000),
      });
      expect(edited.planVersion).toMatchObject({ ordinal: 2, edits: { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: tokens(5000) } });
      expect(edited.planVersion?.materialInputs.runBudgetCeiling).toEqual(tokens(5000));
      expect(edited.providerResolutionPlan?.runBudgetCeiling).toEqual(tokens(5000));
      const revision = edited.planRevisions.at(-1)!;
      expect(revision).toMatchObject({ trigger: 'plan-edit', state: 'resolved', nextOrdinal: 2, changedFields: ['runBudgetCeiling'] });
      expect(revision.diff).toEqual([{ field: 'runBudgetCeiling', label: 'Run Budget Ceiling 状态', prior: 'unset', proposed: tokens(5000), materiality: 'edited' }]);
      expect(revision.proposed.runBudgetCeiling).toEqual(tokens(5000));
      // The ceiling is the plan's own, never a drift of it: the plan can start, and preparing again changes nothing.
      expect(edited.planRevision).toBeNull();
      expect(edited.actions.canAuthorize).toBe(true);
      expect(prepare(store, bookId).planRevisions).toHaveLength(edited.planRevisions.length);
      const withCeiling = plan();
      expect(withCeiling.state.key).toBe('ready');
      expect(withCeiling.service).toMatchObject({
        budgetCeiling: '任务运行预算上限：5,000 tokens', usage: `至多 5,000 tokens（${SAMPLE1_UNITS} 个阅读范围）`, usageIsCeiling: true,
      });
      expect(withCeiling.edit.budget).toEqual({ ceiling: tokens(5000), settable: true, reason: null });
      expect(withCeiling.edit.lastEdit?.entries).toEqual([
        { field: 'runBudgetCeiling', label: '预算上限', prior: '未设置任务预算上限', proposed: '任务运行预算上限：5,000 tokens', materiality: 'edited' },
      ]);
      // An edit that names nothing new is refused; a ceiling of nothing is not a ceiling.
      expect(await refusal(() => store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: edited.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: tokens(5000),
      }))).toBe('ANALYSIS_PLAN_EDIT_UNCHANGED');
      expect(await refusal(() => store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: edited.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: tokens(0),
      }))).toBe('ANALYSIS_PLAN_EDIT_INVALID');

      // The Run spends 6,620 tokens on four ranges; the fifth would pass the ceiling, so it is never sent.
      const stopped = await run(store, execution, bookId, taskIntentId, edited.planEnvelope!.digest);
      const runRecordId = stopped.run!.runRecordId;
      expect(stopped.run?.state).toBe('interrupted');
      // ②A reads it in its own words, never 已中断's (RUN-012).
      expect(stopped.stateLabel).toBe('任务运行预算已达上限 · 已保留部分结果');
      expect(stopped.run?.stateLabel).toBe('任务运行预算已达上限 · 已保留部分结果');
      expect(stopped.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4]);
      expect(stopped.run?.transitions.at(-1)?.detail).toContain('run-budget-ceiling-reached');
      const used = UNIT_TOKENS.slice(0, 4).reduce((total, count) => total + count, 0);
      expect(stopped.taskOutcome).toMatchObject({
        classification: 'interrupted',
        label: '任务结果：任务运行预算已达上限 · 已保留部分结果',
        safeNextAction: BUDGET_REACHED_NEXT_ACTION,
        stop: { reason: 'run-budget-ceiling-reached', maxTotalTokens: 5000, usedTokens: used, unitsSettled: 4, unitsTotal: SAMPLE1_UNITS },
      });
      // The partial result: four ranges closed, the rest not attempted, and nothing after them run.
      expect(stopped.resultSetRevision?.coverage).toMatchObject({ unitsTotal: SAMPLE1_UNITS, unitsClosed: 4 });
      expect(stopped.resultSetRevision?.gaps.map((gap) => [gap.unitOrdinal, gap.code])).toEqual([[5, 'not-attempted'], [6, 'not-attempted'], [7, 'not-attempted'], [8, 'not-attempted']]);
      expect(stopped.taskOutcome?.report?.usagePerStage['cross-unit-reduction']).toMatchObject({ requests: 0 });

      // The drawer: 已停止 · 预算已达上限, what it read and used, and 调整预算并重做 at once — no 续行, no 重试.
      const reached = plan();
      expect(reached.state).toEqual({ key: 'budget-reached', label: '已停止 · 预算已达上限' });
      expect(reached.budgetStop).toEqual({ maxTotalTokens: 5000, usedTokens: used, unitsSettled: 4, unitsTotal: SAMPLE1_UNITS });
      expect(reached.runControl).toBeNull();
      expect(reached.redo).toEqual({ summary: [], prepare: { goal: BASELINE_ANALYSIS_MODE_GOALS['sync-current'], update: SYNC, redoOf: runRecordId } });
      // 待我处理: an exception whose next step is the drawer's own.
      const attention = store.inspectGlobalAttention(() => null, false);
      const entry = attention.groups.flatMap((group) => group.items.map((item) => [group.key, item] as const)).find(([, item]) => item.book.bookId === bookId);
      expect(entry?.[0]).toBe('exceptions');
      expect(entry?.[1]).toMatchObject({
        state: 'analysis-budget-reached', blocked: false, nextStep: 'adjust-budget-redo', target: { kind: 'analysis-plan', bookId, taskIntentId },
      });

      // 调整预算并重做: a new Task carrying the four ranges, beginning from the plan's 5,000 tokens.
      const redo = prepare(store, bookId, SYNC, runRecordId);
      const redoIntentId = redo.taskIntent!.taskIntentId;
      expect(redo.taskIntent).toMatchObject({ mode: 'sync-current', redoOf: { runRecordId, taskIntentId } });
      expect(redo.update?.reusePlan?.counts).toEqual({ reused: 4, recomputed: SAMPLE1_UNITS - 4, invalidated: SAMPLE1_UNITS - 4, bypassed: 0 });
      expect(redo.planVersion).toMatchObject({ ordinal: 1, edits: { removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: tokens(5000) } });
      expect(redo.providerResolutionPlan?.runBudgetCeiling).toEqual(tokens(5000));
      expect(redo.planRevision).toBeNull();
      expect(plan(redoIntentId).goal.sentence).toBe('改计划重做：沿用已读完的 4 个阅读范围，接着读其余 4 个');
      // A plan with the editor's ceiling cannot yet be a quick-start rule, which would start its Tasks with none.
      expect(plan(redoIntentId).defaultRule).toMatchObject({ canSet: false, reason: SET_RULE_BUDGET });
      // Raised to 20,000 tokens, the redo reads the four ranges left, and the Book's analysis is whole.
      const raised = store.editBaselineAnalysisPlan({
        bookId, taskIntentId: redoIntentId, planEnvelopeDigest: redo.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: tokens(20000),
      });
      expect(raised.planRevisions.at(-1)?.diff).toEqual([{ field: 'runBudgetCeiling', label: 'Run Budget Ceiling 状态', prior: tokens(5000), proposed: tokens(20000), materiality: 'edited' }]);
      const settled = await run(store, execution, bookId, redoIntentId, raised.planEnvelope!.digest);
      expect(settled.run?.state).toBe('completed');
      expect(settled.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([5, 6, 7, 8]);
      expect(settled.taskOutcome).toMatchObject({ classification: 'completed', stop: null });
      expect(settled.resultSetRevision?.coverage).toMatchObject({ unitsTotal: SAMPLE1_UNITS, unitsClosed: SAMPLE1_UNITS });
      expect(plan(redoIntentId).state.key).toBe('settled');
      // The redone Run stays what it was: the ceiling stopped it, and it is never resumed or retried.
      expect(store.inspectGlobalAttention(() => null, false).groups.flatMap((group) => group.items).some((item) => item.state === 'analysis-budget-reached')).toBe(false);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('stops a Run whose ceiling is spent by its last range before the reduction, and keeps every range it read', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const bookId = await importedBook(store, 'L2 sample1 预算用尽于归纳前');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      // 12,000 tokens: the eighth range is sent at 11,460 and brings the Run to 12,380, so the reduction is not.
      const edited = store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: tokens(12000),
      });
      const stopped = await run(store, execution, bookId, taskIntentId, edited.planEnvelope!.digest);
      const used = UNIT_TOKENS.reduce((total, count) => total + count, 0);
      expect(stopped.run?.state).toBe('interrupted');
      expect(stopped.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(stopped.taskOutcome?.stop).toEqual({ reason: 'run-budget-ceiling-reached', maxTotalTokens: 12000, usedTokens: used, unitsSettled: SAMPLE1_UNITS, unitsTotal: SAMPLE1_UNITS });
      expect(stopped.resultSetRevision?.coverage).toMatchObject({ unitsTotal: SAMPLE1_UNITS, unitsClosed: SAMPLE1_UNITS });
      expect(stopped.resultSetRevision?.crossUnitReduction).toMatchObject({ state: 'gap', reason: CROSS_UNIT_BUDGET_REACHED, usage: null });
      expect(stopped.resultSetRevision?.assuranceSample).toMatchObject({ state: 'not-run', reason: '任务运行预算上限已达到，保证抽样未发起。' });
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).state.key).toBe('budget-reached');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('takes the ceiling off a plan the editor set it on, and keeps a plan that is running from taking one', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const bookId = await importedBook(store, 'L2 sample1 去掉预算上限');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const set = store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: ['assurance-sampling'], disallowedAdaptations: [], runBudgetCeiling: tokens(5000),
      });
      // 去掉上限: the edit is the whole plan as the editor left it, so a request without the ceiling removes it.
      const removed = store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: set.planEnvelope!.digest, removedSteps: ['assurance-sampling'], disallowedAdaptations: [],
      });
      expect(removed.planVersion).toMatchObject({ ordinal: 3, edits: { removedSteps: ['assurance-sampling'], disallowedAdaptations: [] } });
      expect(removed.planVersion?.edits).not.toHaveProperty('runBudgetCeiling');
      expect(removed.providerResolutionPlan?.runBudgetCeiling).toBe('unset');
      expect(removed.planRevisions.at(-1)?.diff).toEqual([{ field: 'runBudgetCeiling', label: 'Run Budget Ceiling 状态', prior: tokens(5000), proposed: 'unset', materiality: 'edited' }]);
      expect(removed.planRevision).toBeNull();
      // Its Run is held to no ceiling, and reads every range.
      writeFileSync(holdPath, '1');
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, removed.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      // Once started, the plan takes no ceiling, and says why.
      const started = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(started.edit.budget).toEqual({ ceiling: 'unset', settable: false, reason: '任务已经开始，计划不能再改' });
      expect(await refusal(() => store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: removed.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: tokens(100),
      }))).toBe('ANALYSIS_PLAN_EDIT_STARTED');
      writeFileSync(holdPath, 'release');
      await execution.whenIdle();
      const settled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(settled.run?.state).toBe('completed');
      expect(settled.taskOutcome?.stop).toBeNull();
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);
});
