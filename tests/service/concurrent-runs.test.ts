import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { randomUUID } from 'node:crypto';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner, EXECUTION_RUN_CAPACITY, type UnitHold } from '../../src/service/analysis/execution.js';
import { RECONCILED_QUEUED_DETAIL, RECONCILED_YIELDED_DETAIL, RUN_IDLE_YIELD_LABEL, RUN_QUEUED_LABEL } from '../../src/service/analysis/baseline-analysis-store.js';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import { DEVELOPER_LIVE_POLICY_BINDING, ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
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

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

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
  options: { capacity?: number; waitingCapacity?: number; route?: boolean; fixture?: ResolvedModelFixture } = {},
): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    requestGovernor,
    ledger: store.baselineAnalysisLedger,
    launchPolicy,
    fixture: options.route === false ? null : options.fixture ?? fixture,
    secretResolver: { resolve: async () => null },
    unitHold: hold,
    ...(options.capacity === undefined ? {} : { capacity: options.capacity }),
    ...(options.waitingCapacity === undefined ? {} : { waitingCapacity: options.waitingCapacity }),
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
  it('keeps the admitted v1 fixture serial when an unrelated top-level execution declaration says three (#1131)', async () => {
    const selectedProduction = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production');
    launchPolicy = { ...launchPolicy, providerProcessing: { ...launchPolicy.providerProcessing,
      execution: structuredClone(selectedProduction.providerProcessing.execution!),
    } };
    const store = await openWithRoute(); const book = await preparedBook(store, 'v1 与声明边界', true);
    let entered!: () => void; let release!: () => void; let first = true;
    const reached = new Promise<void>((done) => { entered = done; }); const held = new Promise<void>((done) => { release = done; });
    const execution = ownerOf(store, async () => { if (first) { first = false; entered(); await held; } });
    try {
      const runId = store.authorizeBaselineAnalysis(book.bookId, book.taskIntentId, book.planEnvelopeDigest).dispatchRunRecordId!;
      execution.admitAndDispatch(runId); await reached;
      expect(execution.progressFor(runId)).toMatchObject({ currentUnitOrdinal: 1, unitsSettled: 0, completedAttempts: 0 });
      expect(store.baselineAnalysisLedger.unitCheckpoints(runId)).toHaveLength(0);
      expect(store.baselineAnalysisLedger.requestAdmissionOf(runId)).toBeNull();
      expect(requestGovernor.snapshot()).toEqual({ registered: 0, waiting: 0, inFlight: 0, backgroundInFlight: 0 });
      release(); await execution.whenIdle();
      expect(store.inspectBaselineAnalysis(book.bookId).run?.state).toBe('completed');
    } finally { release(); await execution.dispose(); store.close(); }
  });

  it('refuses overflow without an attempt, preserves admitted waiting starts and reuses a cancelled waiting place', async () => {
    const gate = sharedHold();
    const store = await openWithRoute();
    const owner = ownerOf(store, gate.hold, { capacity: 1, waitingCapacity: 1 });
    try {
      const running = await preparedBook(store, 'L2 有界运行', true);
      const waiting = await preparedBook(store, 'L2 有界等待', false);
      const overflow = await preparedBook(store, 'L2 有界拒绝', false);
      const activeRun = start(store, owner, running);
      const queuedRun = start(store, owner, waiting);
      const refused = store.authorizeBaselineAnalysis(overflow.bookId, overflow.taskIntentId, overflow.planEnvelopeDigest);
      expect(() => owner.admitOrQueue(refused.dispatchRunRecordId!)).toThrowError(/等待运行的队列已满/u);
      expect(owner.queuePosition(refused.dispatchRunRecordId!)).toBeNull();
      expect(owner.queuePosition(queuedRun.runRecordId)).toBe(1);
      expect(owner.admitOrQueue(queuedRun.runRecordId)).toBe('queued');
      const blocked = store.inspectBaselineAnalysis(overflow.bookId);
      expect(blocked.run).toMatchObject({ state: 'blocked-before-dispatch', attempt: null });
      expect(blocked.run?.blockedReasons?.join()).toContain('重新准备并开始');
      store.cancelWaitingBaselineAnalysis(waiting.bookId, waiting.taskIntentId);
      expect(owner.dequeue(queuedRun.runRecordId)).toBe(true);
      const prepared = prepare(store, overflow.bookId);
      const retry = start(store, owner, { ...overflow, taskIntentId: prepared.taskIntent!.taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest });
      expect(retry.admission).toBe('queued');
      expect(owner.queuePosition(retry.runRecordId)).toBe(1);
      gate.allow(SAMPLE1_UNITS);
      await owner.whenIdle();
      expect(store.inspectBaselineAnalysis(running.bookId).state).toBe('settled');
      expect(store.inspectBaselineAnalysis(overflow.bookId).state).toBe('settled');
      expect(owner.queuePosition(activeRun.runRecordId)).toBeNull();
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

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

describe('live foreground places and request aborts (#1080)', () => {
  it.each(['ordinary-production', 'developer-live'] as const)('runs two Books under %s, queues the third, pauses at a boundary and aborts only on cancel', async (scope) => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null, induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
    const ceiling = { kind: 'tokens' as const, maxTotalTokens: 500_000 };
    if (scope === 'ordinary-production') {
      const route = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => binding.route === 'deepseek-open-platform')!;
      const pending = store.saveModelServiceConnection('L2 官方并行', null, 'needs-attention', route.route);
      store.saveModelServiceConnection('L2 官方并行', pending.credentialReference, 'ready', route.route);
      store.selectModelServiceRoute(route.route);
      const configured = { ...route, credentialReference: pending.credentialReference };
      launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, scope, configured);
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: scope, policy: launchPolicy,
        live: { scope, ...configured, runBudgetCeiling: 'unset' } });
    } else {
      launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, scope);
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: scope, policy: launchPolicy,
        live: { route: 'opencode-go', model: 'deepseek-v4.1-flash', endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint,
          credentialSlot: 'opencode-go', credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: ceiling } });
      recordMissingCredentialConnection(store, 'L2 开发连接');
    }
    const calls: Array<{ signal: AbortSignal; body: string; release: () => void }> = [];
    const nativeFetch: typeof fetch = async (_url, init) => new Promise<Response>((resolveResponse, reject) => {
      const signal = init!.signal!;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      calls.push({ signal, body: String(init!.body), release: () => resolveResponse(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ schema: 'ai7.baseline-manuscript-analysis.unit-result/1', unitOrdinal: 1,
          synopsis: '合成边界结果。', entities: [], events: [], relationships: [], settingClaims: [], conflicts: [], unresolved: [], confidence: 'high' }) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 })) });
    });
    const execution = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture: null,
      secretResolver: { resolve: async () => 'placeholder-key' },
      ...(scope === 'ordinary-production' ? { production: { scope, nativeFetch } }
        : { developerLive: { launch: { runBudgetCeiling: ceiling, providerCacheRoot: roots.dataRoot, validation: null }, nativeFetch } }) });
    try {
      const a = await preparedBook(store, 'L2 实时甲', false);
      const b = await preparedBook(store, 'L2 实时乙', false);
      const c = await preparedBook(store, 'L2 实时丙', false);
      const ar = start(store, execution, a);
      const br = start(store, execution, b);
      const cr = start(store, execution, c);
      expect([ar.admission, br.admission, cr.admission]).toEqual(['admitted', 'admitted', 'queued']);
      await until(() => calls.length === 2, 'both Books requests in flight');
      expect(calls.every((call) => !call.signal.aborted)).toBe(true);
      expect(execution.busy).toBe(true);
      expect(() => execution.pauseRun(ar.runRecordId, store.baselineAnalysisLedger, 'idle-yield')).toThrowError(/只有后台运行/u);
      store.requestBaselineAnalysisPause(a.bookId, a.taskIntentId);
      execution.pauseRun(ar.runRecordId);
      expect(calls[0]!.signal.aborted).toBe(false);
      expect(store.inspectBaselineAnalysis(a.bookId, () => null).state).toBe('pausing');
      calls[0]!.release();
      await execution.whenDone(ar.runRecordId);
      expect(calls[0]!.signal.aborted).toBe(false);
      expect(store.inspectBaselineAnalysis(a.bookId, () => null).run?.state).toBe('paused');
      expect(store.baselineAnalysisLedger.unconfirmedRangesOf(ar.runRecordId)).toEqual([]);
      expect(store.baselineAnalysisLedger.unitCheckpoints(ar.runRecordId)[0]?.unit.closed.state).toBe('closed');
      await until(() => calls.length === 3, 'queued Book request admitted');
      store.requestBaselineAnalysisCancel(b.bookId, b.taskIntentId);
      execution.cancelRun(br.runRecordId);
      await execution.whenDone(br.runRecordId);
      expect(calls[1]!.signal.aborted).toBe(true);
      const cancelled = store.inspectBaselineAnalysis(b.bookId, () => null);
      expect(cancelled.run?.state).toBe('cancelled');
      expect(cancelled.resultSetRevision?.gaps.find((gap) => gap.unitOrdinal === 1)?.code).toBe('outcome-unknown');
      expect(store.baselineAnalysisLedger.adaptationsOf(br.runRecordId)).toEqual([]);
      expect(calls).toHaveLength(3); // No next step from the paused Run, and no resend of the cancelled request.
      store.requestBaselineAnalysisCancel(c.bookId, c.taskIntentId);
      execution.cancelRun(cr.runRecordId);
      await execution.whenDone(cr.runRecordId);
    } finally { await execution.dispose(); store.close(); }
  }, 60_000);
});


/**
 * Ordinary production over a synthetic transport whose every request waits until the suite releases it (#1089): a unit in
 * flight stays sent, so a yield is seen to wait for it and never to abort it.
 */
async function heldProductionLaunch(): Promise<{ store: EditorialStore; owner: BaselineAnalysisExecutionOwner; calls: Array<{ signal: AbortSignal; release: () => void }> }> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null,
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const route = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => binding.route === 'deepseek-open-platform')!;
  const pending = store.saveModelServiceConnection('合成空闲运行', null, 'needs-attention', route.route);
  store.saveModelServiceConnection('合成空闲运行', pending.credentialReference, 'ready', route.route);
  store.selectModelServiceRoute(route.route);
  const configured = { ...route, credentialReference: pending.credentialReference };
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', configured);
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy: launchPolicy,
    live: { scope: 'ordinary-production', ...configured, runBudgetCeiling: 'unset' } });
  const calls: Array<{ signal: AbortSignal; release: () => void }> = [];
  const nativeFetch: typeof fetch = async (_url, init) => {
    const message = (JSON.parse(String(init!.body)) as { messages: Array<{ content: string }> }).messages.at(-1)!.content;
    const ordinal = Number(/^分析单元 (\d+)/u.exec(message)?.[1] ?? 1);
    return new Promise<Response>((resolveResponse, reject) => {
      const signal = init!.signal!;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      calls.push({ signal, release: () => resolveResponse(new Response(JSON.stringify({ model: configured.model,
        choices: [{ message: { content: JSON.stringify({ schema: 'ai7.baseline-manuscript-analysis.unit-result/1', unitOrdinal: ordinal,
          synopsis: '合成单元结果。', entities: [], events: [], relationships: [], settingClaims: [], conflicts: [], unresolved: [], confidence: 'high' }) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 })) });
    });
  };
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture: null,
    production: { scope: 'ordinary-production', nativeFetch }, secretResolver: { resolve: async () => 'synthetic-placeholder-key' } });
  return { store, owner, calls };
}

it.each([false, true])('yields at a sent unit boundary and honors manual pause=%s before idle resume (#1089, #1114)', async (manual) => {
  const { store, owner, calls } = await heldProductionLaunch();
  try {
    const background = await preparedBook(store, '合成空闲甲', false);
    const foreground = await preparedBook(store, '合成即时乙', false);
    const waiting = await preparedBook(store, '合成即时丙', false);
    const ceiling = { kind: 'tokens' as const, maxTotalTokens: 5_000 };
    const plan = store.inspectBaselineAnalysis(background.bookId, () => null);
    const edited = store.editBaselineAnalysisPlan({ bookId: background.bookId, taskIntentId: background.taskIntentId, planEnvelopeDigest: plan.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: ceiling });
    const started = store.authorizeBaselineAnalysis(background.bookId, background.taskIntentId, edited.planEnvelope!.digest, 'idle');
    const runRecordId = started.dispatchRunRecordId!;
    owner.setBackgroundIdle(false);
    expect(owner.admitOrQueue(runRecordId)).toBe('queued');
    expect(calls).toHaveLength(0);
    const deferred = store.inspectBaselineAnalysis(background.bookId, () => null);
    expect(deferred.authorization?.startWhen).toBe('idle');
    expect(deferred.stateLabel).toBe('等待空闲');
    const attention = store.inspectGlobalAttention(() => null, false, 'admitting');
    expect(attention.groups.find((group) => group.key === 'active')!.items.some((item) => item.state === 'analysis-waiting-idle')).toBe(true);
    owner.setBackgroundIdle(true);
    await until(() => calls.length === 1, 'idle dispatch');
    // The editor returns while a place is still free: nothing of theirs waits for one, so the background Run keeps going.
    owner.setBackgroundIdle(false);
    await owner.whenPlaceFree();
    expect(start(store, owner, foreground).admission).toBe('admitted');
    await until(() => calls.length === 2, 'foreground beside idle Run');
    expect(store.baselineAnalysisLedger.currentRunState(runRecordId)).toBe('executing');
    expect(start(store, owner, waiting).admission).toBe('queued');
    expect(calls[0]!.signal.aborted).toBe(false);
    if (manual) {
      store.requestBaselineAnalysisPause(background.bookId, background.taskIntentId);
      owner.pauseRun(runRecordId);
    }
    calls[0]!.release();
    await until(() => store.inspectBaselineAnalysis(background.bookId, () => null).state === 'paused', 'unit-boundary yield');
    expect(calls[0]!.signal.aborted).toBe(false);
    expect(store.baselineAnalysisLedger.unitCheckpoints(runRecordId)).toHaveLength(1);
    expect(store.baselineAnalysisLedger.unconfirmedRangesOf(runRecordId)).toEqual([]);
    expect(store.inspectBaselineAnalysis(background.bookId, () => null).run?.stateLabel).toBe(manual ? '已暂停' : '让位给你的任务');
    expect(store.inspectGlobalAttention(() => null, false, 'admitting').groups.find((group) => group.key === 'active')!.items.some((item) => item.state === (manual ? 'analysis-paused' : 'analysis-yielded'))).toBe(true);
    await until(() => calls.length === 3, 'foreground uses yielded place');
    for (const book of [foreground, waiting]) {
      const run = store.inspectBaselineAnalysis(book.bookId, () => null).run!;
      store.requestBaselineAnalysisCancel(book.bookId, book.taskIntentId);
      owner.cancelRun(run.runRecordId);
    }
    await until(() => !owner.full, 'foreground cancelled');
    owner.setBackgroundIdle(true);
    if (manual) {
      await owner.whenPlaceFree();
      expect(calls).toHaveLength(3);
      expect(store.baselineAnalysisLedger.currentRunState(runRecordId)).toBe('paused');
      owner.admitAndDispatch(runRecordId, store.baselineAnalysisLedger, { resume: true });
    }
    await until(() => calls.length === 4, 'same Run resumes on idle');
    const resumed = store.inspectBaselineAnalysis(background.bookId, owner.progressFor.bind(owner));
    expect(resumed.run?.runRecordId).toBe(runRecordId);
    expect(resumed.authorization?.authorizationId).toBe(deferred.authorization?.authorizationId);
    expect(resumed.planVersion?.materialInputs.runBudgetCeiling).toEqual(ceiling);
    expect(resumed.run?.progress?.currentUnitOrdinal).toBe(2);
    store.requestBaselineAnalysisCancel(background.bookId, background.taskIntentId);
    owner.cancelRun(runRecordId);
    await owner.whenDone(runRecordId);
  } finally { await owner.dispose(); store.close(); }
}, 60_000);


it('cancels a deferred start without dispatch and reconciles an unstarted idle authorization without restarting it (#1089)', async () => {
  const store = await openWithRoute();
  const owner = ownerOf(store, null);
  let survivingBook = '';
  let survivingRun = '';
  try {
    owner.setBackgroundIdle(false);
    for (const [index, title] of ['等待取消', '等待恢复'].entries()) {
      const book = await preparedBook(store, title, index === 0);
      const authorized = store.authorizeBaselineAnalysis(book.bookId, book.taskIntentId, book.planEnvelopeDigest, 'idle');
      const runRecordId = authorized.dispatchRunRecordId!;
      expect(owner.admitOrQueue(runRecordId)).toBe('queued');
      if (index === 0) {
        store.cancelWaitingBaselineAnalysis(book.bookId, book.taskIntentId);
        owner.dequeue(runRecordId);
        expect(store.inspectBaselineAnalysis(book.bookId).state).toBe('cancelled');
      } else { survivingBook = book.bookId; survivingRun = runRecordId; }
      expect(store.inspectBaselineAnalysis(book.bookId).run?.attempt).toBeNull();
    }
    store.markCleanShutdown();
  } finally { await owner.dispose(); store.close(); }
  const reopened = await openWithRoute();
  try {
    expect(reopened.reconcileStoppedBaselineAnalysisRuns().settled).toBe(1);
    const reading = reopened.inspectBaselineAnalysis(survivingBook);
    expect(reading.authorization?.startWhen).toBe('idle');
    expect(reading.run?.runRecordId).toBe(survivingRun);
    expect(reading.state).toBe('authorized-blocked');
    expect(reading.run?.attempt).toBeNull();
    reopened.markCleanShutdown();
  } finally { reopened.close(); }
});


it('reads a Run AI7 yielded as an ordinary paused Run after a restart, which nothing resumes by itself (#1089; ADR 0034)', async () => {
  const { store, owner, calls } = await heldProductionLaunch();
  let bookId = '';
  let runRecordId = '';
  try {
    const background = await preparedBook(store, '合成重启让位甲', false);
    const foreground = await preparedBook(store, '合成重启即时乙', false);
    const waiting = await preparedBook(store, '合成重启即时丙', false);
    bookId = background.bookId;
    runRecordId = store.authorizeBaselineAnalysis(bookId, background.taskIntentId, background.planEnvelopeDigest, 'idle').dispatchRunRecordId!;
    owner.setBackgroundIdle(true);
    expect(owner.admitOrQueue(runRecordId)).toBe('admitted');
    await until(() => calls.length === 1, 'idle dispatch');
    start(store, owner, foreground);
    await until(() => calls.length === 2, 'foreground beside idle Run');
    owner.setBackgroundIdle(false);
    expect(start(store, owner, waiting).admission).toBe('queued');
    calls[0]!.release();
    await until(() => store.baselineAnalysisLedger.currentRunState(runRecordId) === 'paused', 'unit-boundary yield');
    expect(store.inspectBaselineAnalysis(bookId, () => null).run?.stateLabel).toBe(RUN_IDLE_YIELD_LABEL);
    for (const book of [foreground, waiting]) {
      const run = store.inspectBaselineAnalysis(book.bookId, () => null).run!;
      store.requestBaselineAnalysisCancel(book.bookId, book.taskIntentId);
      owner.cancelRun(run.runRecordId);
    }
    await until(() => !owner.full, 'foreground cancelled');
    store.markCleanShutdown();
  } finally { await owner.dispose(); store.close(); }
  const reopened = await openWithRoute();
  try {
    expect(reopened.reconcileStoppedBaselineAnalysisRuns().settled).toBe(1);
    const reading = reopened.inspectBaselineAnalysis(bookId, () => null);
    expect([reading.run?.runRecordId, reading.state, reading.run?.stateLabel]).toEqual([runRecordId, 'paused', '已暂停']);
    expect(reopened.baselineAnalysisLedger.unitCheckpoints(runRecordId)).toHaveLength(1);
    const items = reopened.inspectGlobalAttention(() => null, false, 'admitting').groups.find((group) => group.key === 'active')!.items;
    expect(items.filter((item) => item.book.bookId === bookId).map((item) => item.state)).toEqual(['analysis-paused']);
    expect(reopened.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: reading.taskIntent!.taskIntentId }).state.label).toBe('已暂停');
    expect(RECONCILED_YIELDED_DETAIL).toContain('续行');
    reopened.markCleanShutdown();
  } finally { reopened.close(); }
}, 60_000);

it('decodes 空闲时处理 for every kind that dispatches, the baseline included, and never for the record-only fixed Task (#1089)', () => {
  const frame = (request: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(request));
  const ledger = { id: randomUUID(), op: 'startTaskWhenIdle', input: { bookId: randomUUID(), kind: 'baseline-analysis', ref: randomUUID(), planEnvelopeDigest: 'c'.repeat(64), planDigests: [] } };
  for (const kind of ['baseline-analysis', 'initial-evaluation', 'readers-report', 'evaluation-rewrite', 'writing']) {
    expect(decodeRequest(frame({ ...ledger, input: { ...ledger.input, kind } }))).toEqual({ ...ledger, input: { ...ledger.input, kind } });
  }
  const review = { ...ledger, input: { ...ledger.input, kind: 'review-run', planEnvelopeDigest: null, planDigests: [{ categoryId: 'typos-and-usage', planEnvelopeDigest: 'd'.repeat(64) }] } };
  expect(decodeRequest(frame(review))).toEqual(review);
  expect(() => decodeRequest(frame({ ...ledger, input: { ...ledger.input, kind: 'fixed-task' } }))).toThrow(ProtocolError);
  // 联网后开始任务 keeps the baseline on its own operation, as before.
  expect(() => decodeRequest(frame({ ...ledger, op: 'startTaskWhenOnline' }))).toThrow(ProtocolError);
});
