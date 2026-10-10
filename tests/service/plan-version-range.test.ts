import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { type Connectivity } from '../../src/service/connectivity.js';
import { QUICK_START_RANGE_REASON } from '../../src/service/default-execution-rules.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { reconnectPreflight } from '../../src/service/reconnect-preflight.js';
import { EditorialStore } from '../../src/service/store.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type BaselineAnalysisSelectedRange,
  type BaselineAnalysisUpdateRequest,
  type LaunchPolicyProjection,
  type TaskPlanProjection,
} from '../../src/shared/protocol.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for Issue #288 under the Owner's decision of 2026-10-07 (甲): the latest plan version is
// what a Task's range reads as, wherever a Task names its scope, while the Task Intent row keeps the range it was first
// prepared with. Each Task here is prepared at one range and revised in place to another by 重新确认计划, so a surface
// that read the intent row would name the first range and fail: the Task Drawer's chips and technical row, ②A's update
// projection, a plan edit's next version, the Run that executes it and the revision it forms, 重新准备 of a Run a moved
// plan blocked, and 改计划重做 of a Run cancelled after it began. 待我处理 and the 任务 panel name no range at all, and
// must not start to name the first one. The real store over exact `sample1` (ADR 0043), J-04's deterministic route, and
// no Provider, socket or credential value.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const RANGE = 'reanalyze-range' as const;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-plan-range-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.operationalScope).toBe('development-ci');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
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

/** The Task Intent row's own range, read straight from the ledger. */
function intentRowRange(taskIntentId: string): BaselineAnalysisSelectedRange | null {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const row = database.prepare('SELECT selected_start_position start, selected_end_position end FROM analysis_task_intents WHERE task_intent_id = ?')
      .get(taskIntentId) as { start: number | null; end: number | null };
    return row.start === null || row.end === null ? null : { startPosition: row.start, endPosition: row.end };
  } finally {
    database.close();
  }
}

const segments = (range: BaselineAnalysisSelectedRange): string => `第 ${range.startPosition}–${range.endPosition} 段`;
const blocks = (range: BaselineAnalysisSelectedRange): string => `内容块 ${range.startPosition}–${range.endPosition}`;

describe('a Task\'s range reads as its latest plan version (Issue #288 甲)', () => {
  it('names the revised range on every surface while the Task Intent row keeps the first', async () => {
    const store = await openWithRoute();
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
    const prepare = (bookId: string, update: BaselineAnalysisUpdateRequest | null, options: { reconfirm?: boolean; redoOf?: string } = {}): BaselineAnalysisProjection => {
      const goal = update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode];
      let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, update, launchPolicy, options.reconfirm ?? false, options.redoOf ?? null);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      return progress.projection!;
    };
    const drawer = (bookId: string, taskIntentId: string): TaskPlanProjection =>
      store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, (id) => owner.progressFor(id));
    /** Prepared at `first`, revised in place to `next` and reconfirmed: the same Task Intent, plan version 2. */
    const revisedInPlace = (bookId: string, first: BaselineAnalysisSelectedRange, next: BaselineAnalysisSelectedRange): BaselineAnalysisProjection => {
      const prepared = prepare(bookId, { mode: RANGE, selectedRange: first });
      expect(prepared.planVersion?.ordinal).toBe(1);
      expect(prepare(bookId, { mode: RANGE, selectedRange: next }).planRevision?.changedFields).toContain('selectedRange');
      const reconfirmed = prepare(bookId, { mode: RANGE, selectedRange: next }, { reconfirm: true });
      expect(reconfirmed.taskIntent?.taskIntentId).toBe(prepared.taskIntent!.taskIntentId);
      expect(reconfirmed.planVersion?.ordinal).toBe(2);
      expect(reconfirmed.planRevision).toBeNull();
      // 甲: the Task Intent row is never rewritten; it keeps the range the Task was first prepared with.
      expect(intentRowRange(reconfirmed.taskIntent!.taskIntentId)).toEqual(first);
      return reconfirmed;
    };
    /** Every surface that names a prepared Task's range names `current`; none names `first`, which only the row keeps. */
    const namesOnly = (bookId: string, taskIntentId: string, current: BaselineAnalysisSelectedRange, first: BaselineAnalysisSelectedRange): void => {
      const projection = store.inspectBaselineAnalysis(bookId, () => null);
      expect(projection.taskIntent?.taskIntentId).toBe(taskIntentId);
      expect(projection.planVersion?.materialInputs.selectedRange).toEqual(current);
      expect(projection.update?.selectedRange).toEqual(current);
      expect(projection.update?.reusePlan?.selectedRange).toEqual(current);
      const plan = drawer(bookId, taskIntentId);
      expect(plan.goal.chips.position).toBe(segments(current));
      expect(plan.technical.find((row) => row.key === 'selected-range')?.value).toBe(blocks(current));
      // The manifest row lists every unit of the Task Input revision, whichever the plan selects, so it is left out.
      const surfaces = JSON.stringify([
        { ...plan, technical: plan.technical.filter((row) => row.key !== 'manifest-units') },
        store.inspectBookTasks(bookId, (id) => owner.progressFor(id)),
        store.inspectGlobalAttention((id) => owner.progressFor(id), owner.busy),
      ]);
      expect(surfaces).not.toContain(segments(first));
      expect(surfaces).not.toContain(blocks(first));
    };
    const live = (): void => store.baselineAnalysisLedger.bindLaunch({
      operationalScope: 'developer-live',
      live: {
        route: 'opencode-go',
        model: 'deepseek-v4-flash',
        endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
        credentialSlot: 'opencode-go',
        credentialReference: randomUUID(),
        runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 240_000 },
        platformTools: null, toolCalling: 'none',
      },
    });
    const offline = (): void => store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });
    const preflight = (connectivity: () => Connectivity) => reconnectPreflight({
      waitingRuns: () => store.waitingBaselineAnalysisRuns(null),
      stillWaiting: ({ runRecordId }) => store.baselineAnalysisRunWaits(runRecordId),
      drift: ({ runRecordId }) => store.baselineAnalysisPreflightDrift(runRecordId),
      block: ({ runRecordId }, reasons, cause) => store.blockWaitingBaselineAnalysisRun(runRecordId, reasons, cause),
      reachesNetwork: true,
      connectivity,
      credentialReadiness: () => owner.liveCredentialReadiness(),
      slotBusy: () => owner.busy,
      admit: ({ runRecordId }) => owner.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { afterReconnectPreflight: true }),
      frozen: () => store.replacementFrozen(),
    });
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 计划版本范围');
      const { bookId } = imported;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const baseline = prepare(bookId, null);
      owner.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, baseline.taskIntent!.taskIntentId, baseline.planEnvelope!.digest).dispatchRunRecordId!);
      await owner.whenIdle();
      const settledBaseline = store.inspectBaselineAnalysis(bookId, () => null);
      expect(settledBaseline.state).toBe('settled');
      const options = settledBaseline.updateControls!.actions[RANGE].options;
      const rangeOf = (index: number): BaselineAnalysisSelectedRange => ({ startPosition: options[index]!.startPosition, endPosition: options[index]!.endPosition });
      const rangeA = rangeOf(2);
      const rangeB = rangeOf(5);
      const rangeC = rangeOf(7);
      // 快速开始 never reads a range: 重新分析所选范围 has no rule, so no rule matching can name the first one.
      expect(settledBaseline.updateControls!.actions[RANGE].quickStart).toEqual({ available: false, reason: QUICK_START_RANGE_REASON, rule: null });

      // Task X: prepared at A, revised in place to B.
      const x = revisedInPlace(bookId, rangeA, rangeB);
      const xId = x.taskIntent!.taskIntentId;
      namesOnly(bookId, xId, rangeB, rangeA);
      // 更新计划 writes the next version of the same Task over the range the plan holds, not the row's.
      const edited = store.editBaselineAnalysisPlan({ bookId, taskIntentId: xId, planEnvelopeDigest: x.planEnvelope!.digest, removedSteps: ['assurance-sampling'], disallowedAdaptations: [] });
      expect(edited.planVersion?.ordinal).toBe(3);
      namesOnly(bookId, xId, rangeB, rangeA);
      // The Run executes the version its authorization bound, and the revision it forms names that version's range.
      owner.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, xId, edited.planEnvelope!.digest).dispatchRunRecordId!);
      await owner.whenIdle();
      const settledX = store.inspectBaselineAnalysis(bookId, () => null);
      expect(settledX.state).toBe('settled');
      expect(settledX.resultSetRevision?.provenance.taskIntentId).toBe(xId);
      expect(settledX.resultSetRevision?.update?.selectedRange).toEqual(rangeB);
      expect(settledX.run?.attempt?.spans.map((span) => span.unitOrdinal))
        .toEqual(edited.update!.reusePlan!.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => unit.unitOrdinal));
      expect(drawer(bookId, xId).goal.chips.position).toBe(segments(rangeB));
      expect(intentRowRange(xId)).toEqual(rangeA);

      // Task Y: prepared at A, revised in place to C, and its waiting Run blocked because its plan moved. 重新准备
      // prepares it again over C — the range of the plan it was — never over the A its row keeps.
      const y = revisedInPlace(bookId, rangeA, rangeC);
      const yId = y.taskIntent!.taskIntentId;
      namesOnly(bookId, yId, rangeC, rangeA);
      store.startBaselineAnalysisWhenOnline(bookId, yId, y.planEnvelope!.digest);
      live();
      expect(await preflight(() => 'online')).toEqual({ admitted: 0, blocked: 1, waiting: 0 });
      const moved = drawer(bookId, yId);
      expect(moved.state.key).toBe('plan-moved');
      expect(moved.goal.chips.position).toBe(segments(rangeC));
      expect(moved.reprepare?.prepare).toEqual({ goal: BASELINE_ANALYSIS_MODE_GOALS[RANGE], update: { mode: RANGE, selectedRange: rangeC } });
      offline();
      const z = prepare(bookId, moved.reprepare!.prepare.update);
      const zFirstId = z.taskIntent!.taskIntentId;
      expect(zFirstId).not.toBe(yId);
      expect(intentRowRange(zFirstId)).toEqual(rangeC);
      expect(z.update?.selectedRange).toEqual(rangeC);

      // That Task, revised in place to A and cancelled after its Run began with nothing kept: 改计划重做 redoes it over A —
      // the range of the plan its Run bound — never over the C its row keeps.
      const zDrifted = prepare(bookId, { mode: RANGE, selectedRange: rangeA });
      expect(zDrifted.taskIntent?.taskIntentId).toBe(zFirstId);
      expect(zDrifted.planRevision?.changedFields).toContain('selectedRange');
      const zRevised = prepare(bookId, { mode: RANGE, selectedRange: rangeA }, { reconfirm: true });
      expect(zRevised.taskIntent?.taskIntentId).toBe(zFirstId);
      expect(zRevised.planVersion?.ordinal).toBe(2);
      expect(intentRowRange(zFirstId)).toEqual(rangeC);
      namesOnly(bookId, zFirstId, rangeA, rangeC);
      const runRecordId = store.authorizeBaselineAnalysis(bookId, zFirstId, zRevised.planEnvelope!.digest).dispatchRunRecordId!;
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'executing', { detail: '执行绑定已持久化并核对；开始逐单元执行。' });
      store.requestBaselineAnalysisCancel(bookId, zFirstId);
      expect(owner.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('settled');
      const cancelled = drawer(bookId, zFirstId);
      expect(cancelled.state.key).toBe('cancelled-after-start');
      expect(cancelled.goal.chips.position).toBe(segments(rangeA));
      expect(cancelled.redo).toEqual({ summary: [], prepare: { goal: BASELINE_ANALYSIS_MODE_GOALS[RANGE], update: { mode: RANGE, selectedRange: rangeA }, redoOf: runRecordId } });
      const redo = prepare(bookId, cancelled.redo!.prepare.update, { redoOf: runRecordId });
      expect(redo.taskIntent).toMatchObject({ mode: RANGE, redoOf: { runRecordId, taskIntentId: zFirstId } });
      expect(intentRowRange(redo.taskIntent!.taskIntentId)).toEqual(rangeA);
      expect(redo.update?.selectedRange).toEqual(rangeA);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);
});
