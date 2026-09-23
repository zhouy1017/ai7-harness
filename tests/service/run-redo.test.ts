import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { NO_PLAN_EDITS } from '../../src/service/analysis/plan-edits.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { RUN_CONTROL_REDO_REASON } from '../../src/service/task-plan.js';
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

// Service-integration suite (L2) for 改计划重做 (Issue #422, plan slice S76c; V2-UX-AUTH-010, CONT-013): the real store on
// a temporary Agent Data Root, exact `sample1` imported through the supported path, J-04's deterministic route, and no
// Provider, socket or credential value. A stopped Run offers the redo and says what it will do; once the Run is
// cancelled, the redo is a new Task — its own intent, plan and envelope — that carries what the Run read, begins from
// the prior plan's edits and names the Run it redoes; a Run that kept nothing is redone as a first baseline, and the
// Book it left without a revision can be started again.

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;
let holdPath: string;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const SYNC = { mode: 'sync-current', selectedRange: null } as const;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-redo-');
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

async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((settle) => setTimeout(settle, 5));
  }
}

const states = (projection: BaselineAnalysisProjection): string[] => projection.run!.transitions.map((transition) => transition.state);

describe('改计划重做 over the real store', () => {
  it('offers a stopped Run the redo with what it will do, and redoes it as a new Task that carries what the Run read', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const bookId = await importedBook(store, 'L2 sample1 改计划重做');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      // The plan the Run binds leaves 核对与抽检 out, so the redo can be seen to begin from it.
      const edited = store.editBaselineAnalysisPlan({ bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: ['assurance-sampling'], disallowedAdaptations: [] });
      writeFileSync(holdPath, '2');
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, edited.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === 3, 'unit 3 in flight');
      const plan = (): ReturnType<EditorialStore['inspectTaskPlan']> => store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, (id) => execution.progressFor(id));
      // Under way, 改计划重做 waits for the Run to be paused.
      expect(plan().runControl?.redo).toEqual({ reason: RUN_CONTROL_REDO_REASON });
      expect(plan().redo).toBeNull();
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      execution.pauseRun(runRecordId, store.baselineAnalysisLedger);
      writeFileSync(holdPath, '3');
      await execution.whenIdle();
      // Paused with three ranges kept: the redo is offered, and its summary says what it will do before anything is recorded.
      const paused = plan();
      expect(paused.state.key).toBe('paused');
      expect(paused.runControl?.redo).toEqual({ reason: null });
      expect(paused.redo).toEqual({
        summary: [
          '这项任务会在这里停下并取消；已读完的 3 个阅读范围保留在一份新的结果集修订版里，没读到的记为未尝试。',
          '然后准备一项新任务：沿用这 3 个阅读范围的结果，接着读其余 5 个；开始之前可以先改计划。',
          '这项分析不改稿，没有需要撤回的受控动作。',
          '新任务由你开始，不会自己运行。',
        ],
        prepare: { goal: BASELINE_ANALYSIS_MODE_GOALS['sync-current'], update: SYNC, redoOf: runRecordId },
      });
      // Nothing is redone while the Run has not been cancelled.
      expect(await refusal(() => prepare(store, bookId, SYNC, runRecordId))).toBe('ANALYSIS_TASK_ACTIVE');
      // The confirmation cancels the Run into its partial revision…
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      execution.cancelRun(runRecordId, store.baselineAnalysisLedger);
      await execution.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.state).toBe('cancelled');
      expect(cancelled.resultSetRevision?.coverage.unitsClosed).toBe(3);
      // …and the cancelled Run offers the redo at once, with nothing more to confirm.
      expect(plan().redo).toEqual({ summary: [], prepare: { goal: BASELINE_ANALYSIS_MODE_GOALS['sync-current'], update: SYNC, redoOf: runRecordId } });
      // A redo must name that Run, and read what it did not.
      expect(await refusal(() => prepare(store, bookId, SYNC, taskIntentId))).toBe('ANALYSIS_REDO_STALE');
      expect(await refusal(() => prepare(store, bookId, { mode: 'reanalyze-book', selectedRange: null }, runRecordId))).toBe('ANALYSIS_REDO_INVALID');

      // The redo: its own Task Intent, plan and envelope, carrying the three ranges and reading the five.
      const redo = prepare(store, bookId, SYNC, runRecordId);
      const redoIntentId = redo.taskIntent!.taskIntentId;
      expect(redoIntentId).not.toBe(taskIntentId);
      expect(redo.taskIntent).toMatchObject({ mode: 'sync-current', redoOf: { runRecordId, taskIntentId } });
      // Prepared and waiting for the editor: nothing runs, and the Book's latest revision is the one the Run formed.
      expect(redo.state).toBe('prepared');
      expect(redo.run).toBeNull();
      expect(redo.resultSetRevision?.revisionId).toBe(cancelled.resultSetRevision!.revisionId);
      expect(redo.resultSetRevision?.provenance).toMatchObject({ taskIntentId, runRecordId });
      expect(redo.update?.reusePlan?.counts).toEqual({ reused: 3, recomputed: SAMPLE1_UNITS - 3, invalidated: SAMPLE1_UNITS - 3, bypassed: 0 });
      expect(redo.update?.predecessor?.revisionId).toBe(cancelled.resultSetRevision!.revisionId);
      // It begins from the plan the redone Task last had, and is the editor's to change before it starts.
      expect(redo.planVersion).toMatchObject({ ordinal: 1, edits: { removedSteps: ['assurance-sampling'], disallowedAdaptations: [] } });
      const redoPlan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: redoIntentId });
      expect(redoPlan.state.key).toBe('ready');
      expect(redoPlan.goal.sentence).toBe('改计划重做：沿用已读完的 3 个阅读范围，接着读其余 5 个');
      expect(redoPlan.technical.find((row) => row.key === 'redo-of')?.value).toBe(`运行 ${runRecordId} · 任务意图 ${taskIntentId}`);
      expect(redoPlan.edit).toMatchObject({ editable: true });
      expect(redoPlan.redo).toBeNull();
      // Started like any Task, it reads only the five ranges the Run did not.
      writeFileSync(holdPath, 'release');
      const settled = await (async () => {
        const next = store.authorizeBaselineAnalysis(bookId, redoIntentId, redo.planEnvelope!.digest).dispatchRunRecordId!;
        execution.admitAndDispatch(next);
        await execution.whenIdle();
        return store.inspectBaselineAnalysis(bookId, () => null);
      })();
      expect(settled.run?.state).toBe('completed');
      expect(states(settled)).toEqual(['authorized', 'admitted', 'executing', 'completed']);
      expect(settled.taskOutcome?.classification).toBe('completed');
      expect(settled.run?.attempt?.spans.map((span) => span.unitOrdinal)).toEqual([4, 5, 6, 7, 8]);
      expect(settled.resultSetRevision?.coverage).toMatchObject({ unitsTotal: SAMPLE1_UNITS, unitsClosed: SAMPLE1_UNITS });
      expect(settled.resultSetRevision?.assuranceSample.state).toBe('not-run');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('redoes a Run that kept nothing as a first baseline, and lets the Book it left without a revision start again', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const bookId = await importedBook(store, 'L2 sample1 重做首次');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      // A Run AI7 left executing when it last closed, cancelled with nothing kept: no revision exists.
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'executing', { detail: '执行绑定已持久化并核对；开始逐单元执行。' });
      store.requestBaselineAnalysisCancel(bookId, taskIntentId);
      expect(execution.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('settled');
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.resultSetRevision).toBeNull();
      // The Book is not stuck: ②A may start it again…
      expect(cancelled.actions.canPrepare).toBe(true);
      // …and the drawer's redo is the first baseline again, naming the Run.
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.state.key).toBe('cancelled-after-start');
      expect(plan.redo).toEqual({ summary: [], prepare: { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, redoOf: runRecordId } });
      const redo = prepare(store, bookId, null, runRecordId);
      expect(redo.taskIntent).toMatchObject({ mode: 'first-baseline', redoOf: { runRecordId, taskIntentId } });
      expect(redo.planVersion?.edits).toEqual(NO_PLAN_EDITS);
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: redo.taskIntent!.taskIntentId }).goal.sentence).toBe('改计划重做：上一次运行没有读完任何阅读范围，这次从头读');
      // A prepared Task is never offered a start of its own.
      expect(redo.actions.canPrepare).toBe(false);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('redoes an update that kept nothing as the Task it was, never as a 同步 of the revision before it', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const bookId = await importedBook(store, 'L2 sample1 重做更新');
      const first = prepare(store, bookId);
      execution.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, first.taskIntent!.taskIntentId, first.planEnvelope!.digest).dispatchRunRecordId!);
      await execution.whenIdle();
      const baseline = store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision!;
      expect(baseline.coverage.unitsClosed).toBe(SAMPLE1_UNITS);
      // 重新分析全书, left executing when AI7 closed and cancelled before any range was kept: the Book's latest revision is
      // still the first baseline's, which that Run did not form.
      const whole = { mode: 'reanalyze-book', selectedRange: null } as const;
      const reanalysis = prepare(store, bookId, whole);
      const taskIntentId = reanalysis.taskIntent!.taskIntentId;
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, reanalysis.planEnvelope!.digest).dispatchRunRecordId!;
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'executing', { detail: '执行绑定已持久化并核对；开始逐单元执行。' });
      store.requestBaselineAnalysisCancel(bookId, taskIntentId);
      expect(execution.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('settled');
      expect(store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision?.revisionId).toBe(baseline.revisionId);
      // The redo is 重新分析全书 again, not a 同步 that would find nothing to read.
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.redo).toEqual({ summary: [], prepare: { goal: BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], update: whole, redoOf: runRecordId } });
      expect(await refusal(() => prepare(store, bookId, SYNC, runRecordId))).toBe('ANALYSIS_REDO_INVALID');
      const redo = prepare(store, bookId, whole, runRecordId);
      expect(redo.taskIntent).toMatchObject({ mode: 'reanalyze-book', redoOf: { runRecordId, taskIntentId } });
      expect(redo.update?.reusePlan?.counts).toMatchObject({ reused: 0, recomputed: SAMPLE1_UNITS });
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: redo.taskIntent!.taskIntentId }).goal.sentence).toBe('改计划重做：上一次运行没有读完任何阅读范围，这次从头读');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);
});
