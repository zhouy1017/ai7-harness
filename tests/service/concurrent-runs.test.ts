import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, EXECUTION_RUN_CAPACITY, type UnitHold } from '../../src/service/analysis/execution.js';
import { RECONCILED_QUEUED_DETAIL, RUN_QUEUED_LABEL } from '../../src/service/analysis/baseline-analysis-store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { RESUME_BLOCKED_SLOT } from '../../src/service/task-plan.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateRequest,
  type GlobalAttentionProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for concurrent Book work (Issue #49, plan slice S14; ADR 0021, V2-UX-CONC-001 to 009):
// the real store on a temporary Agent Data Root, exact `sample1` imported through the supported path as several Books,
// J-04's deterministic route, and no Provider, socket or credential value. The one execution owner's governor runs
// two Runs at once under development-ci; a third start waits for a place as 等待运行名额 — recorded, nothing sent — and
// is admitted in its turn; each Run keeps its own attempt, progress, usage and revision; a queued start is cancelled
// before it begins; a start the launch could never admit is blocked at once, places or none; a start AI7 closed on
// while it waited is blocked with why at the next start, which starts nothing by itself; and a Controlled Apply Effect
// the editor committed while a Run read the Book stands after that Run is cancelled.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const PROPOSED = '〔并行建议〕';

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;
/** Another fixture of the same Book's first baseline: a launch bound to it cannot execute a plan frozen under `fixture`. */
let otherFixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-concurrent-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  otherFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-transient-retry');
});

afterEach(async () => {
  await roots.dispose();
});

interface Book {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  taskIntentId: string;
  planEnvelopeDigest: string;
}

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

/** The owner as the service builds it under development-ci, with J-10's unit hold as a number the suite moves. */
function ownerOf(
  store: EditorialStore,
  hold: UnitHold | null,
  options: { capacity?: number; route?: boolean; fixture?: ResolvedModelFixture } = {},
): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger,
    launchPolicy,
    fixture: options.route === false ? null : options.fixture ?? fixture,
    secretResolver: { resolve: async () => null },
    unitHold: hold,
    ...(options.capacity === undefined ? {} : { capacity: options.capacity }),
  });
}

/**
 * The unit hold every Run of the owner shares: a unit whose turn is back waits, in flight, while its own Run has
 * settled at least `allowed` units — so each Run stops at the same count of its own, whatever the others read.
 */
function sharedHold(): { hold: UnitHold; allow: (units: number) => void } {
  let allowed = 0;
  return {
    hold: async (unitsSettled, interrupted) => {
      while (allowed <= unitsSettled && !interrupted()) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    },
    allow: (units) => {
      allowed = units;
    },
  };
}

function prepare(store: EditorialStore, bookId: string, update: BaselineAnalysisUpdateRequest | null = null): BaselineAnalysisProjection {
  const goal = update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode];
  let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, update, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

/** Exact `sample1` as a Book of its own, its first baseline prepared; one Main Editorial Role connection for the store. */
async function preparedBook(store: EditorialStore, title: string, first: boolean): Promise<Book> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  if (first) recordMissingCredentialConnection(store, 'L2 主编辑连接');
  const prepared = prepare(store, imported.bookId);
  return {
    bookId: imported.bookId,
    manuscriptId: imported.manuscriptId,
    branchId: imported.branchId,
    taskIntentId: prepared.taskIntent!.taskIntentId,
    planEnvelopeDigest: prepared.planEnvelope!.digest,
  };
}

/** 开始任务 as the service answers it: the start is recorded, then handed to the governor. */
function start(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, book: Book): { runRecordId: string; admission: 'admitted' | 'queued' } {
  const authorized = store.authorizeBaselineAnalysis(book.bookId, book.taskIntentId, book.planEnvelopeDigest);
  expect(authorized.dispatchRunRecordId).not.toBeNull();
  return { runRecordId: authorized.dispatchRunRecordId!, admission: owner.admitOrQueue(authorized.dispatchRunRecordId!) };
}

function refusal(operation: () => unknown): { code: string; message: string } | 'no-error' {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return { code: error.code, message: error.message };
    throw error;
  }
  return 'no-error';
}

/** Wait, bounded, until `condition` holds: the owner moves between awaits the suite does not see. */
async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
}

function active(projection: GlobalAttentionProjection): Array<[string | null, string]> {
  return projection.groups.find((group) => group.key === 'active')!.items.map((item) => [item.book.title, item.state]);
}

describe('the execution owner\'s concurrency governor over the real store on exact sample1', () => {
  it('runs two Books at once, holds a third at 等待运行名额 until a place frees, and keeps every Run to its own Book', async () => {
    const gate = sharedHold();
    const store = await openWithRoute();
    const owner = ownerOf(store, gate.hold);
    const progress = (runRecordId: string) => owner.progressFor(runRecordId);
    try {
      // Two places under development-ci.
      expect(EXECUTION_RUN_CAPACITY).toBe(2);
      expect(owner.capacity).toBe(EXECUTION_RUN_CAPACITY);
      const jia = await preparedBook(store, 'L2 并行 甲', true);
      const yi = await preparedBook(store, 'L2 并行 乙', false);
      const bing = await preparedBook(store, 'L2 并行 丙', false);
      gate.allow(1);
      // Nothing runs yet (Issue #434 review: a replacement waits for this).
      expect(owner.idle).toBe(true);

      const runJia = start(store, owner, jia);
      expect(runJia.admission).toBe('admitted');
      expect(owner.busy).toBe(false);
      expect(owner.idle).toBe(false);
      const runYi = start(store, owner, yi);
      expect(runYi.admission).toBe('admitted');
      expect(owner.busy).toBe(true);
      // The third start is recorded and waits for a place, first in the queue; a second hand-off of it takes no second place.
      const runBing = start(store, owner, bing);
      expect(runBing.admission).toBe('queued');
      expect(owner.idle).toBe(false);
      expect(owner.queuePosition(runBing.runRecordId)).toBe(1);
      expect(owner.admitOrQueue(runBing.runRecordId)).toBe('queued');
      expect(owner.queuePosition(runBing.runRecordId)).toBe(1);
      expect(owner.queuePosition(runJia.runRecordId)).toBeNull();

      // Both Runs execute at once: each has read one range and holds its second in flight.
      await until(() => progress(runJia.runRecordId)?.currentUnitOrdinal === 2 && progress(runYi.runRecordId)?.currentUnitOrdinal === 2, 'both Runs at their second range');
      for (const runRecordId of [runJia.runRecordId, runYi.runRecordId]) {
        expect(progress(runRecordId)).toMatchObject({ unitsSettled: 1, unitsTotal: SAMPLE1_UNITS, stage: 'units' });
      }
      expect(progress(runBing.runRecordId)).toBeNull();

      // 丙 waits: recorded, nothing sent, nothing begun — 等待运行名额 on ②A, in the plan and in 待我处理.
      const queued = store.inspectBaselineAnalysis(bing.bookId, progress);
      expect(queued).toMatchObject({ state: 'queued', stateLabel: RUN_QUEUED_LABEL });
      expect(RUN_QUEUED_LABEL).toBe('等待运行名额');
      expect(queued.run).toMatchObject({ state: 'authorized', progress: null, attempt: null });
      expect(queued.run!.transitions.map((transition) => transition.state)).toEqual(['authorized']);
      expect(store.inspectTaskPlan({ bookId: bing.bookId, kind: 'baseline-analysis', ref: bing.taskIntentId }, progress).state)
        .toEqual({ key: 'queued', label: '等待运行名额' });
      // It holds its Book as a Run does — no new Task beside it — and 取消任务 is not its way out: 取消 before it begins is.
      const busyPrepare = refusal(() => prepare(store, bing.bookId));
      expect(busyPrepare).toMatchObject({ code: 'ANALYSIS_TASK_ACTIVE' });
      expect(busyPrepare !== 'no-error' && busyPrepare.message).toContain('等待运行名额');
      expect(refusal(() => store.requestBaselineAnalysisCancel(bing.bookId, bing.taskIntentId))).toMatchObject({ code: 'ANALYSIS_CANCEL_WAITING' });
      const attention = store.inspectGlobalAttention(progress, owner.busy);
      expect(active(attention).sort()).toEqual([
        ['L2 并行 丙', 'analysis-waiting-capacity'],
        ['L2 并行 乙', 'analysis-running'],
        ['L2 并行 甲', 'analysis-running'],
      ].sort());
      expect(attention.actionableCount).toBe(0);
      expect(attention.running).toBe(true);
      // Its 任务 panel card reads the same, in 进行中.
      const bingTasks = store.inspectBookTasks(bing.bookId, progress);
      expect(bingTasks.groups.find((group) => group.key === 'running')!.items.map((entry) => entry.item.state)).toEqual(['analysis-waiting-capacity']);

      // 暂停 甲: its range in flight finishes and it stops there; the place it held goes to 丙, which reads to the hold.
      expect(store.requestBaselineAnalysisPause(jia.bookId, jia.taskIntentId)).toBe(runJia.runRecordId);
      expect(owner.pauseRun(runJia.runRecordId, store.baselineAnalysisLedger)).toBe('pausing');
      gate.allow(2);
      await until(() => store.inspectBaselineAnalysis(jia.bookId, progress).state === 'paused' &&
        progress(runBing.runRecordId)?.currentUnitOrdinal === 3 && progress(runYi.runRecordId)?.currentUnitOrdinal === 3, '甲 paused, 丙 admitted');
      expect(owner.queuePosition(runBing.runRecordId)).toBeNull();
      const admitted = store.inspectBaselineAnalysis(bing.bookId, progress);
      expect(admitted.state).toBe('executing');
      expect(admitted.run!.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'executing']);
      expect(admitted.run!.transitions[1]!.detail).toBe('已进入 AI7 调度器。');
      // 续行 of 甲 waits for a place while 乙 and 丙 hold both.
      const resume = await store.inspectTaskPlanWithConnection(
        { bookId: jia.bookId, kind: 'baseline-analysis', ref: jia.taskIntentId },
        async () => null,
        { reading: () => 'online', reachesNetwork: () => false, slotBusy: () => owner.busy },
        progress,
      );
      expect(resume.runControl?.resume?.reason).toBe(RESUME_BLOCKED_SLOT);

      // 取消任务 on 乙: it stops after its range in flight, and what it read forms its own partial revision.
      expect(store.requestBaselineAnalysisCancel(yi.bookId, yi.taskIntentId)).toBe(runYi.runRecordId);
      expect(owner.cancelRun(runYi.runRecordId, store.baselineAnalysisLedger)).toBe('stopping');
      gate.allow(SAMPLE1_UNITS);
      await owner.whenIdle();

      const jiaAfter = store.inspectBaselineAnalysis(jia.bookId, progress);
      const yiAfter = store.inspectBaselineAnalysis(yi.bookId, progress);
      const bingAfter = store.inspectBaselineAnalysis(bing.bookId, progress);
      expect([jiaAfter.state, yiAfter.state, bingAfter.state]).toEqual(['paused', 'cancelled', 'settled']);
      // Each Run kept its own reading: 甲 two ranges kept for 续行 and no revision, 乙 three ranges in its partial revision,
      // 丙 every range in its first revision — each on its own Book, from its own attempt.
      expect(store.baselineAnalysisLedger.unitCheckpoints(runJia.runRecordId)).toHaveLength(2);
      expect(jiaAfter.resultSetRevision).toBeNull();
      expect(yiAfter.resultSetRevision!.coverage.unitsClosed).toBe(3);
      expect(yiAfter.taskOutcome!.classification).toBe('cancelled');
      expect(yiAfter.resultSetRevision!.usage.requests).toBe(3);
      expect(bingAfter.resultSetRevision!.coverage.unitsClosed).toBe(SAMPLE1_UNITS);
      expect(bingAfter.run!.state).toBe('completed');
      const attempts = [jiaAfter, yiAfter, bingAfter].map((projection) => projection.run!.attempt!);
      expect(new Set(attempts.map((attempt) => attempt.attemptId)).size).toBe(3);
      expect(attempts.map((attempt) => attempt.spans.length)).toEqual([2, 3, SAMPLE1_UNITS]);
      expect(new Set([yiAfter.resultSetRevision!.revisionId, bingAfter.resultSetRevision!.revisionId]).size).toBe(2);
      for (const [book, projection, runRecordId] of [[yi, yiAfter, runYi.runRecordId], [bing, bingAfter, runBing.runRecordId]] as const) {
        expect(projection.bookId).toBe(book.bookId);
        expect(projection.resultSetRevision!.manuscriptPin.bookId).toBe(book.bookId);
        expect(projection.resultSetRevision!.provenance.runRecordId).toBe(runRecordId);
        expect(projection.resultSetRevision!.provenance.attemptId).toBe(projection.run!.attempt!.attemptId);
      }
      expect(owner.busy).toBe(false);
      // A paused Run holds no place and writes nothing more until it is continued.
      expect(owner.idle).toBe(true);
      const settled = store.inspectGlobalAttention(progress, owner.busy);
      expect(active(settled)).toEqual([['L2 并行 甲', 'analysis-paused']]);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('takes a queued start out of the queue when it is cancelled before its turn, and admits the next in order', async () => {
    const gate = sharedHold();
    const store = await openWithRoute();
    const owner = ownerOf(store, gate.hold, { capacity: 1 });
    const progress = (runRecordId: string) => owner.progressFor(runRecordId);
    try {
      const jia = await preparedBook(store, 'L2 排队 甲', true);
      const yi = await preparedBook(store, 'L2 排队 乙', false);
      const bing = await preparedBook(store, 'L2 排队 丙', false);
      const runJia = start(store, owner, jia);
      const runYi = start(store, owner, yi);
      const runBing = start(store, owner, bing);
      expect([runJia.admission, runYi.admission, runBing.admission]).toEqual(['admitted', 'queued', 'queued']);
      expect([owner.queuePosition(runYi.runRecordId), owner.queuePosition(runBing.runRecordId)]).toEqual([1, 2]);
      await until(() => progress(runJia.runRecordId)?.currentUnitOrdinal === 1, '甲 at its first range');

      // 取消 on 乙 before it begins: terminal, nothing sent, and its place in the queue goes to 丙.
      const cancelled = store.cancelWaitingBaselineAnalysis(yi.bookId, yi.taskIntentId);
      expect(owner.dequeue(runYi.runRecordId)).toBe(true);
      expect(owner.dequeue(runYi.runRecordId)).toBe(false);
      expect(cancelled).toMatchObject({ state: 'cancelled' });
      expect(cancelled.run!.transitions.map((transition) => [transition.state, transition.detail])).toEqual([
        ['authorized', expect.any(String)],
        ['cancelled', '编辑在派发前取消了这项等待运行名额的任务；没有发送任何内容，也没有产生用量。'],
      ]);
      expect(cancelled.run!.attempt).toBeNull();
      expect(owner.queuePosition(runBing.runRecordId)).toBe(1);
      // A second 取消 answers the cancelled Run as it is.
      expect(store.cancelWaitingBaselineAnalysis(yi.bookId, yi.taskIntentId).run!.transitions).toHaveLength(2);

      gate.allow(SAMPLE1_UNITS);
      await owner.whenIdle();
      expect(store.inspectBaselineAnalysis(jia.bookId, progress).state).toBe('settled');
      expect(store.inspectBaselineAnalysis(bing.bookId, progress).state).toBe('settled');
      // 乙 never began: its Book holds no revision and a new first baseline is prepared as the way on.
      expect(store.inspectBaselineAnalysis(yi.bookId, progress).resultSetRevision).toBeNull();
      expect(prepare(store, yi.bookId).state).toBe('prepared');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('blocks at once, with the reason, a start the launch could never admit, though every place is taken', async () => {
    // 乙 is prepared under the first fixture's launch.
    const first = await openWithRoute();
    let yi: Book;
    try {
      yi = await preparedBook(first, 'L2 不可执行 乙', true);
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    // A launch bound to another fixture: 甲 is prepared under it and runs; 乙's plan still names the first.
    const gate = sharedHold();
    const second = await openWithRoute(otherFixture);
    const owner = ownerOf(second, gate.hold, { capacity: 1, fixture: otherFixture });
    try {
      const jia = await preparedBook(second, 'L2 不可执行 甲', false);
      const runJia = start(second, owner, jia);
      expect(runJia.admission).toBe('admitted');
      await until(() => owner.progressFor(runJia.runRecordId)?.currentUnitOrdinal === 1, '甲 at its first range');
      expect(owner.busy).toBe(true);
      // 开始任务 on 乙 while the one place is taken: it could never run under this launch, so it is blocked now, never
      // read as 等待运行名额.
      const authorized = second.authorizeBaselineAnalysis(yi.bookId, yi.taskIntentId, yi.planEnvelopeDigest);
      const runYi = authorized.dispatchRunRecordId!;
      expect(() => owner.admitOrQueue(runYi)).toThrowError(/当前启动的本地路由与冻结计划不一致/u);
      expect(owner.queuePosition(runYi)).toBeNull();
      const blocked = second.inspectBaselineAnalysis(yi.bookId);
      expect(blocked.state).toBe('authorized-blocked');
      expect(blocked.run).toMatchObject({ state: 'blocked-before-dispatch', blockedBy: 'launch', blockedReasons: ['当前启动的本地路由与冻结计划不一致。'] });
      gate.allow(SAMPLE1_UNITS);
      await owner.whenIdle();
      expect(second.inspectBaselineAnalysis(jia.bookId).state).toBe('settled');
      second.markCleanShutdown();
    } finally {
      await owner.dispose();
      second.close();
    }
  }, 300_000);

  it('blocks with why the starts a closed AI7 left waiting, starting nothing by itself, and one a launch cannot admit', async () => {
    const gate = sharedHold();
    const first = await openWithRoute();
    const firstOwner = ownerOf(first, gate.hold, { capacity: 1 });
    let jia: Book;
    let yi: Book;
    let bing: Book;
    let runYi: string;
    let runBing: string;
    try {
      jia = await preparedBook(first, 'L2 重启 甲', true);
      yi = await preparedBook(first, 'L2 重启 乙', false);
      bing = await preparedBook(first, 'L2 重启 丙', false);
      const runJia = start(first, firstOwner, jia);
      runYi = start(first, firstOwner, yi).runRecordId;
      runBing = start(first, firstOwner, bing).runRecordId;
      await until(() => firstOwner.progressFor(runJia.runRecordId)?.currentUnitOrdinal === 1, '甲 at its first range');
      // AI7 closes: 甲 is interrupted where it stood, and the queue is left as the ledger holds it — two starts `authorized`.
      await firstOwner.dispose();
      expect(() => firstOwner.admitOrQueue(runYi)).toThrowError(/正在停止/u);
      expect(first.inspectBaselineAnalysis(yi.bookId).state).toBe('queued');
      first.markCleanShutdown();
    } finally {
      await firstOwner.dispose();
      first.close();
    }

    const second = await openWithRoute();
    const secondOwner = ownerOf(second, null);
    try {
      // Nothing starts by itself after a restart (ADR 0034): the two starts never began, and they are blocked with why,
      // while 甲 waits for 续行. The governor admits nothing.
      second.reconcileStoppedBaselineAnalysisRuns();
      for (const [book, runRecordId] of [[yi, runYi], [bing, runBing]] as const) {
        const blocked = second.inspectBaselineAnalysis(book.bookId);
        expect(blocked.state).toBe('authorized-blocked');
        expect(blocked.run).toMatchObject({ runRecordId, state: 'blocked-before-dispatch', blockedReasons: [RECONCILED_QUEUED_DETAIL] });
        expect(blocked.run!.attempt).toBeNull();
      }
      expect(second.inspectBaselineAnalysis(jia.bookId).state).toBe('resumable');
      expect(secondOwner.busy).toBe(false);
      // The editor starts one again when they choose: prepared anew, it runs; nothing else moved meanwhile.
      const again = prepare(second, yi.bookId);
      const authorized = second.authorizeBaselineAnalysis(yi.bookId, again.taskIntent!.taskIntentId, again.planEnvelope!.digest);
      expect(secondOwner.admitOrQueue(authorized.dispatchRunRecordId!, second.baselineAnalysisLedger)).toBe('admitted');
      await secondOwner.whenIdle();
      expect(second.inspectBaselineAnalysis(yi.bookId).state).toBe('settled');
      expect(second.inspectBaselineAnalysis(bing.bookId).state).toBe('authorized-blocked');
      // Reconciled once, nothing is left to reconcile.
      expect(second.reconcileStoppedBaselineAnalysisRuns().settled).toBe(0);
      second.markCleanShutdown();
    } finally {
      await secondOwner.dispose();
      second.close();
    }

    // A launch with no route for them: the start is blocked before dispatch with the owner's reason, never left waiting.
    const third = await openWithRoute();
    const noRoute = ownerOf(third, null, { route: false });
    try {
      const again = prepare(third, yi.bookId, { mode: 'reanalyze-book', selectedRange: null });
      expect(again.update).not.toBeNull();
      const authorized = third.authorizeBaselineAnalysis(yi.bookId, again.taskIntent!.taskIntentId, again.planEnvelope!.digest);
      expect(() => noRoute.admitOrQueue(authorized.dispatchRunRecordId!)).toThrowError(/没有可执行的本地确定性路由/u);
      const blocked = third.inspectBaselineAnalysis(yi.bookId);
      expect(blocked.state).toBe('authorized-blocked');
      expect(blocked.run).toMatchObject({ state: 'blocked-before-dispatch', blockedBy: 'launch', blockedReasons: ['没有可执行的本地确定性路由。'] });
      expect(third.reconcileStoppedBaselineAnalysisRuns().settled).toBe(0);
      third.markCleanShutdown();
    } finally {
      await noRoute.dispose();
      third.close();
    }
  }, 300_000);

  it('keeps a Controlled Apply Effect the editor committed while a Run read the Book after that Run is cancelled', async () => {
    const gate = sharedHold();
    const store = await openWithRoute();
    const owner = ownerOf(store, gate.hold);
    const progress = (runRecordId: string) => owner.progressFor(runRecordId);
    try {
      const book = await preparedBook(store, 'L2 并行 应用', true);
      gate.allow(1);
      const run = start(store, owner, book);
      await until(() => progress(run.runRecordId)?.currentUnitOrdinal === 2, 'the second range in flight');

      // While the Run reads its frozen input, the editor accepts and applies a Change Suggestion on the same Book.
      const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId };
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 12)!;
      const made = store.createEditorialMark({
        ...binding,
        windowStartBlockId: window.blocks[0]!.blockId,
        clientMarkId: randomUUID(),
        baseRevisionId: window.revisionId,
        expectedJournalSequence: window.journalSequence,
        blockId: block.blockId,
        baseBlockDigest: block.digest,
        fromGrapheme: 2,
        toGrapheme: 6,
        selectedText: graphemesOf(block.text).slice(2, 6).join(''),
        kind: 'change-suggestion',
        highlightColor: null,
        body: '',
        proposedText: PROPOSED,
        rationale: null,
      });
      const clientEffectId = randomUUID();
      const applied = store.applyChangeSuggestion({
        ...binding, windowStartBlockId: window.blocks[0]!.blockId, markId: made.markId, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null,
      });
      const appliedText = applied.window.blocks.find((candidate) => candidate.blockId === block.blockId)!.text;
      expect(graphemesOf(appliedText).slice(2, 2 + graphemesOf(PROPOSED).length).join('')).toBe(PROPOSED);

      // 取消任务: the Run stops after its range in flight; nothing it does touches the manuscript the editor changed.
      expect(store.requestBaselineAnalysisCancel(book.bookId, book.taskIntentId)).toBe(run.runRecordId);
      expect(owner.cancelRun(run.runRecordId, store.baselineAnalysisLedger)).toBe('stopping');
      gate.allow(SAMPLE1_UNITS);
      await owner.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(book.bookId, progress);
      expect(cancelled.state).toBe('cancelled');
      expect(cancelled.resultSetRevision!.coverage.unitsClosed).toBe(2);
      // The partial revision read the manuscript revision the Run was authorized on, not the edited one.
      expect(cancelled.resultSetRevision!.manuscriptPin.revisionId).toBe(window.revisionId);
      const after = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      expect(after.journalSequence).toBe(applied.window.journalSequence);
      expect(after.workingDigest).toBe(applied.window.workingDigest);
      expect(after.blocks.find((candidate) => candidate.blockId === block.blockId)!.text === appliedText).toBe(true);
      expect(store.getManuscriptApplyOutcome(book.manuscriptId, book.branchId, clientEffectId)).toEqual({ state: 'committed', application: applied.application });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('refuses a capacity that is no count of Runs', async () => {
    const store = await openWithRoute();
    try {
      for (const capacity of [0, -1, 1.5, Number.NaN]) {
        expect(() => ownerOf(store, null, { capacity })).toThrowError(/运行名额设置无效/u);
      }
      expect(ownerOf(store, null, { capacity: 3 }).capacity).toBe(3);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  });
});
