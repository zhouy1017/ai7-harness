import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASSURANCE_SAMPLING_BUDGET_REACHED,
  BUDGET_REACHED_NEXT_ACTION,
  BaselineAnalysisExecutionOwner,
  CROSS_UNIT_BUDGET_REACHED,
  SAFE_RETRY_BUDGET_REACHED,
} from '../../src/service/analysis/execution.js';
import { ASSURANCE_SAMPLING_REMOVED } from '../../src/service/analysis/plan-edits.js';
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
import { CLARIFICATION_UNANSWERABLE_ENDED } from '../../src/service/task-plan.js';

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

function openWithRoute(route: ResolvedModelFixture = fixture): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: route.identity, fixtureSha256: route.sha256, fixtureLineage: route.lineage },
  });
}

function owner(store: EditorialStore, route: ResolvedModelFixture = fixture): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger,
    launchPolicy,
    fixture: route,
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

async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((settle) => setTimeout(settle, 5));
  }
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
        budgetCeiling: '任务运行预算上限：5,000 tokens', usage: `达到 5,000 tokens 后不再发送新的请求（${SAMPLE1_UNITS} 个阅读范围）`, usageIsCeiling: true,
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
      expect(reached.budgetStop).toEqual({ maxTotalTokens: 5000, usedTokens: used, unitsSettled: 4, unitsTotal: SAMPLE1_UNITS, launchSetsCeiling: false });
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

  it('asks nothing once the ceiling is spent: the Run ends at the ceiling, and its question stays on record unanswered', async () => {
    // The transient-retry fixture: unit 2 fails for good, and unit 5's first attempt fails retry-safe. Neither failed
    // turn reports tokens; the six ranges read spend 1,760 + 1,840 + 1,700 + 1,600 + 1,660 + 920 = 9,480.
    const transient = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-transient-retry');
    const store = await openWithRoute(transient);
    const execution = owner(store, transient);
    try {
      const bookId = await importedBook(store, 'L2 sample1 预算与澄清');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      // Asked first, under 9,000 tokens: the eighth range is sent at 8,560, and the ceiling is spent once it is read.
      const edited = store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [],
        askFirstAdaptations: ['safe-retry'], runBudgetCeiling: tokens(9000),
      });
      expect(edited.planVersion?.edits).toEqual({ removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry'], runBudgetCeiling: tokens(9000) });
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, edited.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await execution.whenIdle();
      // No answer could be honoured once the ceiling is spent — its 再试一次 would be a further dispatch — so the Run does not
      // wait for one: it ends at the ceiling, and unit 5 is the gap its first attempt left, in words that say why.
      const stopped = store.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'executing', 'interrupted']);
      expect(stopped.run?.attempt?.spans.map((span) => [span.unitOrdinal, span.attemptIndex])).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1]]);
      expect(stopped.run?.adaptations).toEqual([]);
      expect(stopped.taskOutcome?.stop).toEqual({ reason: 'run-budget-ceiling-reached', maxTotalTokens: 9000, usedTokens: 9480, unitsSettled: SAMPLE1_UNITS, unitsTotal: SAMPLE1_UNITS });
      const gap = stopped.resultSetRevision?.gaps.find((entry) => entry.unitOrdinal === 5);
      expect(gap?.code).toBe('adapter-failure');
      expect(gap?.reason).toContain(SAFE_RETRY_BUDGET_REACHED);
      expect(stopped.resultSetRevision?.gaps.map((entry) => entry.unitOrdinal)).toEqual([2, 5]);
      // Every range settled before the ceiling ended the Run, so the reduction is the request it stopped, in its own words.
      expect(stopped.resultSetRevision?.crossUnitReduction).toMatchObject({ state: 'gap', reason: CROSS_UNIT_BUDGET_REACHED });
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.state.key).toBe('budget-reached');
      // The question stays on record, unanswered, and 待我处理 asks nothing of the editor for it.
      expect(plan.clarifications.map((card) => [card.unitOrdinal, card.state, card.answerable.reason])).toEqual([[5, 'unanswered', CLARIFICATION_UNANSWERABLE_ENDED]]);
      const attention = store.inspectGlobalAttention(() => null, false);
      expect(attention.groups.flatMap((group) => group.items).filter((entry) => entry.state === 'analysis-clarification')).toEqual([]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('keeps a retry the editor answered while the Run read on from being sent once the ceiling is spent', async () => {
    // The transient-retry fixture: unit 5 asks after units 1 to 4 (unit 2 a gap) spent 5,300; 6 and 7 bring it to 8,560.
    const transient = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-transient-retry');
    const store = await openWithRoute(transient);
    const execution = owner(store, transient);
    try {
      const bookId = await importedBook(store, 'L2 sample1 预算与答复');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const edited = store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [],
        askFirstAdaptations: ['safe-retry'], runBudgetCeiling: tokens(8000),
      });
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, edited.planEnvelope!.digest).dispatchRunRecordId!;
      // Five units settle — 1 to 4, then 6 — while unit 5 waits for its answer; unit 7 is held in flight.
      writeFileSync(holdPath, '5');
      execution.admitAndDispatch(runRecordId);
      await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === 7, 'unit 7 in flight');
      const card = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, (id) => execution.progressFor(id)).clarifications[0]!;
      store.answerBaselineAnalysisClarification({ bookId, taskIntentId, requestId: card.requestId, optionId: 'retry', note: null });
      writeFileSync(holdPath, 'release');
      await execution.whenIdle();
      // At the next boundary the answer is found, but the ceiling is spent: the retry is not sent, and the Run ends there.
      const stopped = store.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.run?.state).toBe('interrupted');
      expect(stopped.run?.attempt?.spans.map((span) => [span.unitOrdinal, span.attemptIndex])).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]]);
      expect(stopped.taskOutcome?.stop).toMatchObject({ reason: 'run-budget-ceiling-reached', maxTotalTokens: 8000, usedTokens: 8560 });
      expect(stopped.resultSetRevision?.gaps.find((entry) => entry.unitOrdinal === 5)?.reason).toContain(SAFE_RETRY_BUDGET_REACHED);
      expect(stopped.resultSetRevision?.gaps.find((entry) => entry.unitOrdinal === 8)?.code).toBe('not-attempted');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('counts what a paused Run spent on its reduction toward the ceiling after 续行', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let heldAt: string | null = null;
    const store = await openWithRoute();
    const execution = new BaselineAnalysisExecutionOwner({
      ledger: store.baselineAnalysisLedger,
      launchPolicy,
      fixture,
      secretResolver: { resolve: async () => null },
      stageHold: async (stage) => {
        heldAt = stage;
        await held;
      },
    });
    try {
      const bookId = await importedBook(store, 'L2 sample1 预算与续行');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      // The eight ranges spend 12,380 and the reduction a little over 2,000 more, under a 15,000 ceiling; forming the
      // reduction a second time passes it.
      const units = UNIT_TOKENS.reduce((total, count) => total + count, 0);
      const edited = store.editBaselineAnalysisPlan({
        bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: tokens(15000),
      });
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, edited.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await until(() => heldAt === 'cross-unit-reduction', 'the reduction turn back');
      // 暂停 while the reduction's turn is back: the Run waits, and 续行 forms the reduction again.
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      execution.pauseRun(runRecordId, store.baselineAnalysisLedger);
      release();
      await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(bookId, () => null).run?.state).toBe('paused');
      const carried = store.baselineAnalysisLedger.carriedUsageOf(runRecordId);
      expect(carried).not.toBeNull();
      expect(carried!.inputTokens + carried!.outputTokens).toBeGreaterThan(1);
      // After 续行 the first reduction's spend still counts: with the reduction formed again the ceiling is spent, and the
      // sample is never sent. Without it, the Run would have read on as if it had spent less than it had.
      const reduction = carried!.inputTokens + carried!.outputTokens;
      expect(units + reduction).toBeLessThan(15000);
      execution.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true });
      await execution.whenIdle();
      const stopped = store.inspectBaselineAnalysis(bookId, () => null);
      expect(stopped.run?.state).toBe('interrupted');
      expect(stopped.taskOutcome?.stop).toMatchObject({ reason: 'run-budget-ceiling-reached', usedTokens: units + 2 * reduction });
      expect(stopped.resultSetRevision?.crossUnitReduction?.state).toBe('closed');
      // The sample is drawn, and its one turn is not sent: the ceiling is spent before it.
      expect(stopped.resultSetRevision?.assuranceSample).toMatchObject({ state: 'gap', reason: expect.stringContaining('任务运行预算上限已达到，本轮未派发') });
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  describe('a pause at a spent ceiling lapses, and the ceiling counts only where it stops a request', () => {
    // An owner whose reduction and sampling turns, once back, give the test the moment to ask for a pause — as the
    // editor's 暂停 arrives while a turn is out.
    function pausingOwner(store: EditorialStore, at: (stage: 'cross-unit-reduction' | 'assurance-sampling', turn: number) => boolean) {
      let pause: () => void = () => undefined;
      let samplingTurns = 0;
      const execution = new BaselineAnalysisExecutionOwner({
        ledger: store.baselineAnalysisLedger,
        launchPolicy,
        fixture,
        secretResolver: { resolve: async () => null },
        stageHold: async (stage) => {
          if (at(stage, stage === 'assurance-sampling' ? ++samplingTurns : 1)) pause();
        },
      });
      const start = (bookId: string, taskIntentId: string, digest: string): string => {
        const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, digest).dispatchRunRecordId!;
        pause = () => {
          store.requestBaselineAnalysisPause(bookId, taskIntentId);
          execution.pauseRun(runRecordId, store.baselineAnalysisLedger);
        };
        execution.admitAndDispatch(runRecordId);
        return runRecordId;
      };
      return { execution, start };
    }

    function edit(store: EditorialStore, bookId: string, prepared: BaselineAnalysisProjection, ceiling: number, removedSteps: ReadonlyArray<'assurance-sampling'> = []) {
      return store.editBaselineAnalysisPlan({
        bookId, taskIntentId: prepared.taskIntent!.taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest,
        removedSteps: [...removedSteps], disallowedAdaptations: [], runBudgetCeiling: tokens(ceiling),
      });
    }

    it('completes a Run paused while its reduction spends the ceiling, with nothing left to send', async () => {
      const store = await openWithRoute();
      const { execution, start } = pausingOwner(store, (stage) => stage === 'cross-unit-reduction');
      try {
        const bookId = await importedBook(store, 'L2 sample1 预算与暂停于归纳');
        const prepared = prepare(store, bookId);
        const taskIntentId = prepared.taskIntent!.taskIntentId;
        // 核对与抽检 removed, under 13,000 tokens: the eight ranges spend 12,380, and the reduction, out when 暂停 comes,
        // passes 13,000. Nothing is left to send, so the Run completes as it would without the pause: the ceiling stopped
        // no request, and a Run left paused could only be continued past what it may spend.
        const edited = edit(store, bookId, prepared, 13000, ['assurance-sampling']);
        start(bookId, taskIntentId, edited.planEnvelope!.digest);
        await execution.whenIdle();
        const completed = store.inspectBaselineAnalysis(bookId, () => null);
        expect(completed.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'executing', 'pausing', 'completed']);
        expect(completed.taskOutcome?.stop).toBeNull();
        expect(completed.resultSetRevision?.crossUnitReduction?.state).toBe('closed');
        expect(completed.resultSetRevision?.assuranceSample).toMatchObject({ state: 'not-run', reason: ASSURANCE_SAMPLING_REMOVED });
        expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).state.key).not.toBe('budget-reached');
        store.markCleanShutdown();
      } finally {
        await execution.dispose();
        store.close();
      }
    }, 300_000);

    it('completes a Run paused while its one sampling turn spends the ceiling', async () => {
      const store = await openWithRoute();
      const { execution, start } = pausingOwner(store, (stage, turn) => stage === 'assurance-sampling' && turn === 1);
      try {
        const bookId = await importedBook(store, 'L2 sample1 预算与暂停于抽检');
        const prepared = prepare(store, bookId);
        const taskIntentId = prepared.taskIntent!.taskIntentId;
        // Under 16,000 tokens: the ranges and the reduction spend 14,680, and the sample's one turn, out when 暂停 comes,
        // brings the Run to 16,500. Every request was sent — the reflection is the Run Report's, and the ceiling keeps it
        // back without counting — so the Run completes.
        const edited = edit(store, bookId, prepared, 16000);
        start(bookId, taskIntentId, edited.planEnvelope!.digest);
        await execution.whenIdle();
        const completed = store.inspectBaselineAnalysis(bookId, () => null);
        expect(completed.run?.state).toBe('completed');
        expect(completed.taskOutcome?.stop).toBeNull();
        expect(completed.resultSetRevision?.assuranceSample?.state).toBe('closed');
        expect(completed.taskOutcome?.report?.usagePerStage['assurance-sampling'].requests).toBe(1);
        store.markCleanShutdown();
      } finally {
        await execution.dispose();
        store.close();
      }
    }, 300_000);

    it('ends a Run at the ceiling, its drawn turn a gap, when a pause comes while the reduction spends it', async () => {
      const store = await openWithRoute();
      const { execution, start } = pausingOwner(store, (stage) => stage === 'cross-unit-reduction');
      try {
        const bookId = await importedBook(store, 'L2 sample1 预算与抽检前的暂停');
        const prepared = prepare(store, bookId);
        const taskIntentId = prepared.taskIntent!.taskIntentId;
        // Under 14,000 tokens: the reduction, out when 暂停 comes, brings the Run to 14,680. The pause lapses, the sample is
        // drawn, and the ceiling keeps its turn back before the pause could hide it: the Run ends at the ceiling, and the
        // sample says why it holds no disposition rather than reading as closed.
        const edited = edit(store, bookId, prepared, 14000);
        start(bookId, taskIntentId, edited.planEnvelope!.digest);
        await execution.whenIdle();
        const stopped = store.inspectBaselineAnalysis(bookId, () => null);
        expect(stopped.run?.state).toBe('interrupted');
        expect(stopped.taskOutcome?.stop).toMatchObject({ reason: 'run-budget-ceiling-reached', maxTotalTokens: 14000, usedTokens: 14680 });
        expect(stopped.resultSetRevision?.crossUnitReduction?.state).toBe('closed');
        expect(stopped.resultSetRevision?.assuranceSample).toMatchObject({ state: 'gap', reason: expect.stringContaining('任务运行预算上限已达到，本轮未派发') });
        expect(stopped.taskOutcome?.report?.usagePerStage['assurance-sampling'].requests).toBe(0);
        store.markCleanShutdown();
      } finally {
        await execution.dispose();
        store.close();
      }
    }, 300_000);

    it('ends a Run paused while its last range spends the ceiling exactly as without the pause: at the reduction', async () => {
      const store = await openWithRoute();
      const execution = owner(store);
      try {
        const bookId = await importedBook(store, 'L2 sample1 预算与暂停于末段');
        const prepared = prepare(store, bookId);
        const taskIntentId = prepared.taskIntent!.taskIntentId;
        // Under 12,000 tokens, 暂停 while the eighth range is out: it brings the Run to 12,380. The pause lapses, and the
        // reduction's own check stops it, in the reduction's words.
        const edited = edit(store, bookId, prepared, 12000);
        const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, edited.planEnvelope!.digest).dispatchRunRecordId!;
        writeFileSync(holdPath, String(SAMPLE1_UNITS - 1));
        execution.admitAndDispatch(runRecordId);
        await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === SAMPLE1_UNITS, 'the last range in flight');
        store.requestBaselineAnalysisPause(bookId, taskIntentId);
        execution.pauseRun(runRecordId, store.baselineAnalysisLedger);
        writeFileSync(holdPath, 'release');
        await execution.whenIdle();
        const stopped = store.inspectBaselineAnalysis(bookId, () => null);
        expect(stopped.run?.state).toBe('interrupted');
        expect(stopped.taskOutcome?.stop).toEqual({ reason: 'run-budget-ceiling-reached', maxTotalTokens: 12000, usedTokens: 12380, unitsSettled: SAMPLE1_UNITS, unitsTotal: SAMPLE1_UNITS });
        expect(stopped.resultSetRevision?.crossUnitReduction).toMatchObject({ state: 'gap', reason: CROSS_UNIT_BUDGET_REACHED });
        expect(stopped.resultSetRevision?.assuranceSample).toMatchObject({ state: 'not-run', reason: ASSURANCE_SAMPLING_BUDGET_REACHED });
        store.markCleanShutdown();
      } finally {
        await execution.dispose();
        store.close();
      }
    }, 300_000);
  });

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
