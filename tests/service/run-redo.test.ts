import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { NO_PLAN_EDITS } from '../../src/service/analysis/plan-edits.js';
import { ALWAYS_ONLINE, type Connectivity } from '../../src/service/connectivity.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { reconnectPreflight } from '../../src/service/reconnect-preflight.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { RESUME_BLOCKED_BINDING, RUN_CONTROL_REDO_NOT_BEGUN_REASON, RUN_CONTROL_REDO_REASON } from '../../src/service/task-plan.js';
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

/** Reconnect Preflight wired exactly as the service wires it, over this store and this owner. */
function preflight(store: EditorialStore, execution: BaselineAnalysisExecutionOwner, connectivity: () => Connectivity) {
  return reconnectPreflight({
    waitingRuns: () => store.waitingBaselineAnalysisRuns(null),
    stillWaiting: (runRecordId) => store.baselineAnalysisRunWaits(runRecordId),
    drift: (runRecordId) => store.baselineAnalysisPreflightDrift(runRecordId),
    block: (runRecordId, reasons, cause) => store.blockWaitingBaselineAnalysisRun(runRecordId, reasons, cause),
    reachesNetwork: true,
    connectivity,
    credentialReadiness: () => execution.liveCredentialReadiness(),
    slotBusy: () => execution.busy,
    admit: (runRecordId) => execution.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { afterReconnectPreflight: true }),
    frozen: () => store.replacementFrozen(),
  });
}

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

  it('prepares a redo again as it was once a moved plan blocked its waiting Run: its 同步 over the kept revision stays open (Issue #536)', async () => {
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const bookId = await importedBook(store, 'L2 sample1 重做后重新准备');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      writeFileSync(holdPath, '2');
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === 3, 'unit 3 in flight');
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      execution.pauseRun(runRecordId, store.baselineAnalysisLedger);
      writeFileSync(holdPath, '3');
      await execution.whenIdle();
      // Cancelled once it began, the Run keeps the three ranges it read in a partial revision, which the redo reads on from.
      expect(store.requestBaselineAnalysisCancel(bookId, taskIntentId)).toBe(runRecordId);
      execution.cancelRun(runRecordId, store.baselineAnalysisLedger);
      await execution.whenIdle();
      const kept = store.inspectBaselineAnalysis(bookId, () => null).resultSetRevision!;
      expect(kept.coverage.unitsClosed).toBe(3);
      const redo = prepare(store, bookId, SYNC, runRecordId);
      const redoIntentId = redo.taskIntent!.taskIntentId;
      // ②A's own 同步 waits for the manuscript to move past that revision; the redo's is its own way on.
      expect((redo.updateControls!.actions as Readonly<Record<string, { available: boolean }>>)['sync-current']!.available).toBe(false);

      // 联网后开始任务: the redo's Run waits for the network, and the launch changes meanwhile, so Reconnect Preflight
      // blocks it before it begins — its plan moved.
      const live = () => store.baselineAnalysisLedger.bindLaunch({
        operationalScope: 'developer-live',
        live: {
          route: 'opencode-go',
          model: 'deepseek-v4-flash',
          endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
          credentialSlot: 'opencode-go',
          credentialReference: randomUUID(),
          runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 240_000 },
        },
      });
      const offline = () => store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });
      const moved = async (taskIntentId: string, digest: string) => {
        store.startBaselineAnalysisWhenOnline(bookId, taskIntentId, digest);
        live();
        expect(await preflight(store, execution, () => 'online')).toEqual({ admitted: 0, blocked: 1, waiting: 0 });
        const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
        expect(plan.state.key).toBe('plan-moved');
        expect(plan.reprepare?.prepare).toEqual({ goal: BASELINE_ANALYSIS_MODE_GOALS['sync-current'], update: SYNC });
        return plan.reprepare!.prepare.update;
      };
      const asBefore = (projection: BaselineAnalysisProjection, previous: string) => {
        expect(projection.state).toBe('prepared');
        expect(projection.taskIntent?.taskIntentId).not.toBe(previous);
        expect(projection.taskIntent?.mode).toBe('sync-current');
        expect(projection.update?.predecessor?.revisionId).toBe(kept.revisionId);
        expect(projection.update?.reusePlan?.counts).toEqual({ reused: 3, recomputed: SAMPLE1_UNITS - 3, invalidated: SAMPLE1_UNITS - 3, bypassed: 0 });
      };

      // 重新准备 prepares that redo again — the same 同步 over the kept revision — rather than refusing it because ②A waits.
      const update = await moved(redoIntentId, redo.planEnvelope!.digest);
      offline();
      const again = prepare(store, bookId, update);
      asBefore(again, redoIntentId);
      // Its plan moves again while it waits (Issue #551): 重新准备 prepares it again the same way, as often as the plan moves,
      // though that Task is no redo of its own.
      const againId = again.taskIntent!.taskIntentId;
      const once = await moved(againId, again.planEnvelope!.digest);
      offline();
      const third = prepare(store, bookId, once);
      asBefore(third, againId);
      // Only a Task whose plan moved, or one reconfirmed, is let through (Issue #582): the same 同步 asked of ②A while that
      // Task is merely prepared is still ②A's to offer, and it does not.
      expect(await refusal(() => prepare(store, bookId, once))).toBe('ANALYSIS_UPDATE_MODE_UNAVAILABLE');
      // Prepared and not yet started, its plan drifts with no manuscript edit — the launch binds the live route — and
      // 重新确认计划 under that launch revises it in place, the next version of the same Task.
      live();
      const drifted = store.inspectBaselineAnalysis(bookId, () => null);
      expect(drifted.planRevision?.state).toBe('pending');
      expect(drifted.actions.canReconfirmPlan).toBe(true);
      const livePolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
      let reconfirmed = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_MODE_GOALS['sync-current'], SYNC, livePolicy, true, null);
      while (!reconfirmed.done) reconfirmed = store.advanceBaselineAnalysisPreparationWork(reconfirmed.workId!);
      expect(reconfirmed.projection!.taskIntent?.taskIntentId).toBe(third.taskIntent!.taskIntentId);
      expect(reconfirmed.projection!.planVersion?.ordinal).toBe(2);
      expect(reconfirmed.projection!.planRevision).toBeNull();
      // Only that Task as it was: any other way over the kept revision is still ②A's to offer — and once its waiting Run is
      // cancelled, the Task is no longer one whose plan moved, so the same 同步 is refused too (Issue #582).
      const waiting = store.startBaselineAnalysisWhenOnline(bookId, third.taskIntent!.taskIntentId, reconfirmed.projection!.planEnvelope!.digest);
      expect(waiting.run?.state).toBe('awaiting-connectivity');
      expect(store.cancelWaitingBaselineAnalysis(bookId, third.taskIntent!.taskIntentId).run?.state).toBe('cancelled');
      offline();
      expect(await refusal(() => prepare(store, bookId, once))).toBe('ANALYSIS_UPDATE_MODE_UNAVAILABLE');
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
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: redo.taskIntent!.taskIntentId }).goal.sentence).toBe('改计划重做：不沿用上一次运行的结果，这次从头读');
      // A prepared Task is never offered a start of its own.
      expect(redo.actions.canPrepare).toBe(false);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('says a stopped Run a launch can no longer carry keeps nothing, and redoes it from the beginning (CONT-016)', async () => {
    const store = await openWithRoute();
    const first = owner(store);
    let second: BaselineAnalysisExecutionOwner | null = null;
    try {
      const bookId = await importedBook(store, 'L2 sample1 重做换绑定');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      writeFileSync(holdPath, '2');
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      first.admitAndDispatch(runRecordId);
      await until(() => first.progressFor(runRecordId)?.currentUnitOrdinal === 3, 'unit 3 in flight');
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      first.pauseRun(runRecordId, store.baselineAnalysisLedger);
      writeFileSync(holdPath, 'release');
      await first.whenIdle();
      expect(first.carriesStoppedRun(runRecordId)).toBe(true);
      await first.dispose();
      // The next launch executes another fixture, so the binding the Run persisted no longer reads the same.
      second = new BaselineAnalysisExecutionOwner({
        ledger: store.baselineAnalysisLedger,
        launchPolicy,
        fixture: await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-transient-retry'),
        secretResolver: { resolve: async () => null },
      });
      const next = second;
      expect(next.carriesStoppedRun(runRecordId)).toBe(false);
      const input = { bookId, kind: 'baseline-analysis', ref: taskIntentId } as const;
      const plan = await store.inspectTaskPlanWithConnection(input, async () => null, { ...ALWAYS_ONLINE, carriesStoppedRun: (id) => next.carriesStoppedRun(id) }, () => null);
      expect(plan.state.key).toBe('paused');
      // 续行 says why it cannot go on and where the way on is; 取消任务 and 改计划重做 say nothing is kept.
      expect(plan.runControl?.resume).toEqual({ reason: RESUME_BLOCKED_BINDING });
      expect(plan.runControl?.cancel.impact[1]).toBe('执行绑定已经变化，已读完的 3 个阅读范围不能整理成结果集修订版；这次取消不会形成修订版。');
      expect(plan.redo).toEqual({
        summary: [
          '这项任务会在这里停下并取消；执行绑定已经变化，已读完的 3 个阅读范围不能沿用，不会形成结果集修订版。',
          '然后准备一项新任务，从头读；开始之前可以先改计划。',
          '这项分析不改稿，没有需要撤回的受控动作。',
          '新任务由你开始，不会自己运行。',
        ],
        prepare: { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, redoOf: runRecordId },
      });
      // The cancellation settles as the summary said, without a revision, and the redo is the first baseline again.
      store.requestBaselineAnalysisCancel(bookId, taskIntentId);
      expect(next.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('settled');
      const cancelled = store.inspectBaselineAnalysis(bookId, () => null);
      expect(cancelled.run?.state).toBe('cancelled');
      expect(cancelled.resultSetRevision).toBeNull();
      expect(store.inspectTaskPlan(input).redo).toEqual({ summary: [], prepare: { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, redoOf: runRecordId } });
      expect(prepare(store, bookId, null, runRecordId).taskIntent).toMatchObject({ mode: 'first-baseline', redoOf: { runRecordId, taskIntentId } });
      store.markCleanShutdown();
    } finally {
      await first.dispose();
      await second?.dispose();
      store.close();
    }
  }, 300_000);

  it('carries only the ranges a stopped Run read to a result, and reads a range it left a gap in again', async () => {
    fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
    const store = await openWithRoute();
    const execution = owner(store);
    try {
      const bookId = await importedBook(store, 'L2 sample1 重做缺口');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      writeFileSync(holdPath, '2');
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      execution.admitAndDispatch(runRecordId);
      await until(() => execution.progressFor(runRecordId)?.currentUnitOrdinal === 3, 'unit 3 in flight');
      store.requestBaselineAnalysisPause(bookId, taskIntentId);
      execution.pauseRun(runRecordId, store.baselineAnalysisLedger);
      writeFileSync(holdPath, '3');
      await execution.whenIdle();
      // Three ranges kept, unit 2 a gap: the redo carries the two with a result and reads the other six again.
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, (id) => execution.progressFor(id));
      expect(plan.redo?.summary.slice(0, 2)).toEqual([
        '这项任务会在这里停下并取消；已读完的 3 个阅读范围保留在一份新的结果集修订版里，没读到的记为未尝试。',
        '然后准备一项新任务：沿用其中有结果的 2 个阅读范围，其余 6 个（含留下缺口的 1 个）重新读；开始之前可以先改计划。',
      ]);
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);

  it('offers no redo on a stopped Run that never began reading, and says why', async () => {
    const store = await openWithRoute();
    try {
      const bookId = await importedBook(store, 'L2 sample1 未开始的重做');
      const prepared = prepare(store, bookId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      // Admitted when the service stopped, it is reconciled 可续行 without having read a range.
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      expect(store.reconcileStoppedBaselineAnalysisRuns()).toEqual({ settled: 1, cancelling: [], answered: [] });
      const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.state.key).toBe('resumable');
      expect(plan.runControl?.redo).toEqual({ reason: RUN_CONTROL_REDO_NOT_BEGUN_REASON });
      expect(plan.redo).toBeNull();
      store.markCleanShutdown();
    } finally {
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
      expect(store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: redo.taskIntent!.taskIntentId }).goal.sentence).toBe('改计划重做：不沿用上一次运行的结果，这次从头读');
      store.markCleanShutdown();
    } finally {
      await execution.dispose();
      store.close();
    }
  }, 300_000);
});
