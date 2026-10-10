import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { activeRunReason } from '../../src/service/analysis/baseline-analysis-store.js';
import type { Connectivity, TaskPlanConnectivity } from '../../src/service/connectivity.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { PLAN_MOVED_LABEL, reconnectPreflight } from '../../src/service/reconnect-preflight.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { EditorialStore, StoreError, type WaitingTaskRun } from '../../src/service/store.js';
import type {
  GlobalAttentionItemProjection,
  LaunchPolicyProjection,
  ReviewRunProjection,
  StartWhenOnlineTaskKind,
  TaskPlanProjection,
} from '../../src/shared/protocol.js';
import { EVALUATION_REWRITE_FIXTURE_IDENTITY, beginRewriteAsJ11 } from '../support/evaluation-rewrite.js';
import { READERS_REPORT_FIXTURE_IDENTITY, finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { WRITING_FIXTURE_IDENTITY, WRITING_REQUEST } from '../support/writing-task.js';

// Service-integration suite (L2) for 联网后开始任务 of every Task kind with a plan (Issue #760, plan slice S74c): the real store,
// every kind's ledger, the Review Run ledger and its drive loop, the one execution owner and the AI7 local deterministic adapter
// over the authored fixtures, on exact `sample1` (ADR 0043). No Provider, socket or credential value is involved. Offline, each
// kind's plan offers the wait; 联网后开始任务 records exactly the authorization 开始任务 would and the Run waits in Connectivity
// Wait; Reconnect Preflight, wired as the service wires it, leaves it waiting offline, blocks it when what it bound moved, and
// otherwise starts it as 开始任务 would; 取消 ends it before anything is sent. 待我处理 and the 任务 panel read the wait.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const TYPOS = TYPOS_AND_USAGE.categoryId;
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-start-when-online-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
});

afterEach(async () => {
  await roots.dispose();
});

interface Session {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
  readonly driver: ReviewRunDriver;
}

async function withSession(fixtureIdentity: string, body: (session: Session) => Promise<void>, capacity?: number): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const fixture = await loadModelFixture(FIXTURES_ROOT, fixtureIdentity);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null }, ...(capacity === undefined ? {} : { capacity }),
  });
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  try {
    await body({ store, owner, driver });
    store.markCleanShutdown();
  } finally {
    const stopped = driver.dispose();
    await owner.dispose();
    await stopped;
    store.close();
  }
}

async function sample1Book(store: EditorialStore, title: string): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  if (store.getModelServiceConnection() === null) recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
}

/** What the service reads, as J-04's connectivity control makes it read: the deterministic route needs the network. */
function reader(state: { connectivity: Connectivity }): TaskPlanConnectivity {
  return { reading: () => state.connectivity, reachesNetwork: (routeKind) => routeKind === LOCAL_DETERMINISTIC_ROUTE, slotBusy: () => false };
}

function planOf(store: EditorialStore, bookId: string, kind: StartWhenOnlineTaskKind, ref: string, connectivity: Connectivity): Promise<TaskPlanProjection> {
  return store.inspectTaskPlanWithConnection({ bookId, kind, ref }, async () => null, reader({ connectivity }));
}

/** Reconnect Preflight wired exactly as the service wires it, over every kind's waiting Runs. */
function preflight(session: Session, connectivity: Connectivity) {
  const { store, owner, driver } = session;
  return reconnectPreflight<WaitingTaskRun>({
    waitingRuns: () => store.waitingTaskRuns(null),
    stillWaiting: (run) => store.taskRunWaits(run),
    drift: (run) => store.taskPreflightDrift(run),
    block: (run, reasons, cause) => store.blockWaitingTaskRun(run, reasons, cause),
    reachesNetwork: true,
    connectivity: () => connectivity,
    credentialReadiness: () => owner.liveCredentialReadiness(),
    slotBusy: () => owner.busy,
    admit: (run) => {
      if (run.kind === 'review-run') {
        store.admitWaitingReviewRun(run.ref, () => void driver.drive(run.ref));
        return;
      }
      owner.admitAndDispatch(run.runRecordId, store.waitingRunLedger({ ...run, kind: run.kind }), { afterReconnectPreflight: true });
    },
    frozen: () => store.replacementFrozen(),
  });
}

function withDatabase<T>(operation: (database: DatabaseSync) => T, readOnly = true): T {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

/** The Run states of a Task's Run, in order. */
function transitions(taskIntentId: string): string[] {
  return withDatabase((database) => (database.prepare(
    `SELECT s.state FROM analysis_run_states s JOIN analysis_run_records r ON r.run_record_id = s.run_record_id
     WHERE r.task_intent_id = ? ORDER BY s.sequence`,
  ).all(taskIntentId) as Array<{ state: string }>).map((row) => row.state));
}

/** Whether anything of the Task's Run was attempted: an execution attempt is the first thing a dispatch records. */
function attempts(taskIntentId: string): number {
  return withDatabase((database) => (database.prepare(
    `SELECT count(*) count FROM analysis_execution_attempts a JOIN analysis_run_records r ON r.run_record_id = a.run_record_id WHERE r.task_intent_id = ?`,
  ).get(taskIntentId) as { count: number }).count);
}

function reviewEvents(reviewRunId: string): Array<[string, string, string | undefined]> {
  return withDatabase((database) => (database.prepare(
    'SELECT category_id, state, canonical_json FROM review_run_category_events WHERE review_run_id = ? ORDER BY rowid',
  ).all(reviewRunId) as Array<{ category_id: string; state: string; canonical_json: string }>)
    .map((row) => [row.category_id, row.state, (JSON.parse(row.canonical_json) as { code?: string }).code]));
}

/** A Credential Reference the plan froze moves (OFF-007): every plan of the launch's binding drifts. */
function reenrollCredential(): void {
  withDatabase((database) => {
    expect(database.prepare("UPDATE model_service_connections SET credential_reference = ? WHERE connection_id = 'main-editorial-deepseek-v4-pro'").run(randomUUID()).changes).toBe(1);
  }, false);
}

async function code(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    if (error instanceof Error && 'code' in error && typeof error.code === 'string') return error.code;
    throw error;
  }
  return 'no-error';
}

function attentionItem(store: EditorialStore, itemId: string, waitingFor: 'network' | 'admitting' = 'network'): GlobalAttentionItemProjection | undefined {
  return store.inspectGlobalAttention(() => null, false, waitingFor).groups.flatMap((group) => group.items).find((item) => item.itemId === itemId);
}

function panelItem(store: EditorialStore, bookId: string, itemId: string): GlobalAttentionItemProjection | undefined {
  return store.inspectBookTasks(bookId, () => null, 'network').groups.flatMap((group) => group.items.map((entry) => entry.item)).find((item) => item.itemId === itemId);
}

/**
 * The shared course of one ledger Task (OFF-004 to OFF-008): offline its plan offers the wait; 联网后开始任务 records the exact
 * authorization 开始任务 records and nothing is attempted; a repeat answers the same; 待我处理 and the 任务 panel read it waiting;
 * offline, Reconnect Preflight leaves it; online, it starts it, and the Run ends as an immediate start's does.
 */
async function waitThenStart(session: Session, bookId: string, kind: Exclude<StartWhenOnlineTaskKind, 'review-run'>, taskIntentId: string): Promise<void> {
  const { store, owner } = session;
  const offline = await planOf(store, bookId, kind, taskIntentId, 'offline');
  expect(offline.state).toEqual({ key: 'offline', label: '离线' });
  expect(offline.start.readiness).toBe('offline');
  const digest = offline.start.planEnvelopeDigest!;
  expect(digest).toMatch(/^[0-9a-f]{64}$/u);
  store.startTaskWhenOnline({ bookId, kind, ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
  expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity']);
  expect(attempts(taskIntentId)).toBe(0);
  // The same Run Authorization 开始任务 records: the editor's own direct start (AUTH-004).
  expect(withDatabase((database) => database.prepare('SELECT origin, authority FROM analysis_run_authorizations WHERE task_intent_id = ?').get(taskIntentId)))
    .toEqual({ origin: 'standard-direct', authority: 'standard-direct-dispatch' });
  // A repeat answers as the first did: one Run.
  store.startTaskWhenOnline({ bookId, kind, ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
  expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity']);
  const waiting = await planOf(store, bookId, kind, taskIntentId, 'offline');
  expect(waiting.state).toEqual({ key: 'waiting', label: '等待网络' });
  expect(waiting.start.readiness).toBe('started');
  expect(store.waitingTaskRuns(bookId)).toEqual([expect.objectContaining({ kind, bookId, ref: taskIntentId })]);
  // 待我处理 and the 任务 panel read the wait for this kind too (ATTN-004), on the Task's own plan.
  const expected = {
    group: 'active', state: 'analysis-waiting-network', blocked: false, nextStep: 'view-run',
    object: { kind: 'task', taskKind: kind }, target: { kind: 'task-plan', bookId, taskKind: kind, ref: taskIntentId },
  };
  expect(attentionItem(store, `task:${taskIntentId}`)).toMatchObject(expected);
  expect(panelItem(store, bookId, `task:${taskIntentId}`)).toMatchObject(expected);
  expect(store.inspectBookTasks(bookId, () => null, 'network').running).toBe(true);
  // Offline, Reconnect Preflight leaves it waiting, and nothing is sent.
  expect(await preflight(session, 'offline')).toEqual({ admitted: 0, blocked: 0, waiting: 1 });
  expect(attempts(taskIntentId)).toBe(0);
  // Online, it starts exactly as 开始任务 starts it.
  expect(await preflight(session, 'online')).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
  await owner.whenIdle();
  expect(transitions(taskIntentId).slice(0, 4)).toEqual(['authorized', 'awaiting-connectivity', 'admitted', 'executing']);
  expect(transitions(taskIntentId).at(-1)).toMatch(/^completed/u);
  expect(attempts(taskIntentId)).toBeGreaterThan(0);
  expect(store.waitingTaskRuns(null)).toEqual([]);
  expect(attentionItem(store, `task:${taskIntentId}`)).toBeUndefined();
}

function prepareWriting(store: EditorialStore, bookId: string): string {
  let progress = store.createWritingPreparationWork(bookId, WRITING_REQUEST, launchPolicy);
  while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
  return progress.projection!.taskIntent!.taskIntentId;
}

function prepareReview(store: EditorialStore, bookId: string): ReviewRunProjection {
  let progress = store.createReviewRunPreparationWork(bookId, [TYPOS], WHOLE, launchPolicy);
  while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
  return progress.projection!.run!;
}

describe('联网后开始任务 of a 写作任务 (Issue #760, S74c)', () => {
  it('waits for the network, keeps a new Task from being prepared over it, and starts once online with nothing moved', async () => {
    await withSession(WRITING_FIXTURE_IDENTITY, async (session) => {
      const bookId = await sample1Book(session.store, '写作联网后开始');
      const taskIntentId = prepareWriting(session.store, bookId);
      expect(session.store.waitingTaskRuns(null)).toEqual([]);
      await waitThenStart(session, bookId, 'writing', taskIntentId);
      expect(session.store.inspectWriting(bookId)!.state).toBe('settled');
    });
  }, 300_000);

  it('is cancelled directly before it starts, and cancelling twice answers the same; a Run that never waited is not this 取消\'s', async () => {
    await withSession(WRITING_FIXTURE_IDENTITY, async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '写作取消等待');
      const taskIntentId = prepareWriting(store, bookId);
      const digest = (await planOf(store, bookId, 'writing', taskIntentId, 'offline')).start.planEnvelopeDigest!;
      store.startTaskWhenOnline({ bookId, kind: 'writing', ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
      // A waiting Run counts as active: nothing is prepared over it, and the refusal says it waits to start (OFF-005).
      expect(await code(() => prepareWriting(store, bookId))).toBe('WRITING_UNAVAILABLE');
      // …in the writing kind's own words, never an 分析任务's (Issue #760 review).
      expect(() => prepareWriting(store, bookId)).toThrow('有一项写作任务在等待联网后开始；它开始并结束之前，或在任务抽屉里取消它之前，不能准备新的写作任务。');
      expect(store.cancelWaitingTask({ bookId, kind: 'writing', ref: taskIntentId })).toEqual({ dequeue: null });
      expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity', 'cancelled']);
      expect((await planOf(store, bookId, 'writing', taskIntentId, 'online')).state).toEqual({ key: 'cancelled', label: '已取消' });
      store.cancelWaitingTask({ bookId, kind: 'writing', ref: taskIntentId });
      expect(transitions(taskIntentId)).toHaveLength(3);
      expect(attempts(taskIntentId)).toBe(0);
      expect(await preflight(session, 'online')).toEqual({ admitted: 0, blocked: 0, waiting: 0 });
      // A Task started now is not a waiting Run, and the wrong Task is never the current one.
      const next = prepareWriting(store, bookId);
      expect(await code(() => store.cancelWaitingTask({ bookId, kind: 'writing', ref: randomUUID() }))).toBe('TASK_PLAN_NOT_CURRENT');
      store.authorizeWriting(bookId, next, (await planOf(store, bookId, 'writing', next, 'online')).start.planEnvelopeDigest!);
      expect(await code(() => store.startTaskWhenOnline({ bookId, kind: 'writing', ref: next, planEnvelopeDigest: null, planDigests: [] }))).toBe('TASK_PLAN_INVALID');
    });
  }, 300_000);

  it('is blocked, never started, when what its plan bound moved while it waited: 需要重新确认计划, saying what moved (OFF-008)', async () => {
    await withSession(WRITING_FIXTURE_IDENTITY, async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '写作计划变化');
      const taskIntentId = prepareWriting(store, bookId);
      const digest = (await planOf(store, bookId, 'writing', taskIntentId, 'offline')).start.planEnvelopeDigest!;
      store.startTaskWhenOnline({ bookId, kind: 'writing', ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
      reenrollCredential();
      // Offline, nothing is decided: the drift is looked at only once the Run could start.
      expect(await preflight(session, 'offline')).toEqual({ admitted: 0, blocked: 0, waiting: 1 });
      expect(await preflight(session, 'online')).toEqual({ admitted: 0, blocked: 1, waiting: 0 });
      expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity', 'blocked-before-dispatch']);
      expect(attempts(taskIntentId)).toBe(0);
      const plan = await planOf(store, bookId, 'writing', taskIntentId, 'online');
      expect(plan.state).toEqual({ key: 'plan-moved', label: PLAN_MOVED_LABEL });
      // The writing kind has no 重新准备 in the drawer: the plan says what moved, and 交付物 prepares it again.
      expect(plan.reprepare).toBeNull();
      expect(plan.planMovedReason).toMatch(/^需要重新确认计划：.+已经变化，这次授权不再对应当前的情况。$/u);
      expect(attentionItem(store, `task:${taskIntentId}`)).toMatchObject({ group: 'decisions', state: 'analysis-plan-moved', blocked: true });
      expect(panelItem(store, bookId, `task:${taskIntentId}`)).toMatchObject({ state: 'analysis-plan-moved' });
      expect(await code(() => store.cancelWaitingTask({ bookId, kind: 'writing', ref: taskIntentId }))).toBe('ANALYSIS_CANCEL_NOT_WAITING');
    });
  }, 300_000);
});

describe('取消 of a waiting or queued Run of another kind (Issue #760 review)', () => {
  it('says why a new Task waits in its own kind’s words: 分析任务, 写作任务, 评估任务 or 审阅任务, never one for every kind', () => {
    expect(activeRunReason('awaiting-connectivity')).toBe('有一项分析任务在等待联网后开始；它开始并结束之前，或在任务抽屉里取消它之前，不能准备新的更新任务。');
    expect(activeRunReason('authorized', 'writing')).toBe('有一项写作任务在等待运行名额；它开始并结束之前，或在任务抽屉里取消它之前，不能准备新的写作任务。');
    for (const kind of ['evaluation', 'readers-report', 'evaluation-rewrite']) {
      expect(activeRunReason('executing', kind), kind).toBe('当前已有评估任务在调度或执行中；在其结束前不能准备新的评估任务。');
    }
    expect(activeRunReason('awaiting-connectivity', 'factual-review')).toBe('有一项审阅任务在等待联网后开始；它开始并结束之前，或在任务抽屉里取消它之前，不能准备新的审阅。');
  });

  it('cancels a waiting 写作任务 offline after a 资料库 item it lists may no longer be listed: the start checks never stand in its way', async () => {
    await withSession(WRITING_FIXTURE_IDENTITY, async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '写作资料变化后取消');
      const directory = join(roots.inputRoot, 'start-when-online');
      mkdirSync(directory, { recursive: true });
      const path = join(directory, '参考资料.txt');
      writeFileSync(path, '这份资料记录了一座古城在战火中保存青铜器的经过，馆员连夜把器物装箱转移。');
      const preview = await store.previewLibraryMaterial(path);
      const material = await store.addLibraryMaterial({ previewId: preview.previewId, title: '参考资料', kind: 'document' });
      store.decideLibraryMaterial({ materialId: material.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId } } });
      store.decideLibraryMaterial({ materialId: material.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      let progress = store.createWritingPreparationWork(bookId, { ...WRITING_REQUEST, materialIds: [material.materialId] }, launchPolicy);
      while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
      const taskIntentId = progress.projection!.taskIntent!.taskIntentId;
      const digest = (await planOf(store, bookId, 'writing', taskIntentId, 'offline')).start.planEnvelopeDigest!;
      store.startTaskWhenOnline({ bookId, kind: 'writing', ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
      // While it waits offline, the item may no longer be listed by this Book's Tasks: the writing start check now refuses.
      store.decideLibraryMaterial({ materialId: material.materialId, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
      expect(await code(() => store.authorizeWriting(bookId, taskIntentId, digest))).toBe('MATERIAL_REFERENCE_UNAVAILABLE');
      // 取消 still ends it, offline, before anything is sent (OFF-010) — and a new Task can then be prepared.
      expect(store.cancelWaitingTask({ bookId, kind: 'writing', ref: taskIntentId })).toEqual({ dequeue: null });
      expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity', 'cancelled']);
      expect(attempts(taskIntentId)).toBe(0);
      expect(prepareWriting(store, bookId)).not.toBe(taskIntentId);
    });
  }, 300_000);

  it('cancels a waiting rewrite offline after its version was saved again, where re-preparing said to cancel it first', async () => {
    await withSession(EVALUATION_REWRITE_FIXTURE_IDENTITY, async (session) => {
      const { store, owner } = session;
      const bookId = await sample1Book(store, '重写变化后取消');
      await runInitialEvaluationToEnd(store, owner, bookId, launchPolicy);
      finalizeAsJ11(store, bookId);
      const record = beginRewriteAsJ11(store, bookId);
      const prepare = (): string => {
        let progress = store.createEvaluationRewritePreparationWork(bookId, record.recordId, launchPolicy);
        while (!progress.done) progress = store.advanceEvaluationRewritePreparationWork(progress.workId!);
        return progress.projection!.taskIntent!.taskIntentId;
      };
      const taskIntentId = prepare();
      const digest = (await planOf(store, bookId, 'evaluation-rewrite', taskIntentId, 'offline')).start.planEnvelopeDigest!;
      store.startTaskWhenOnline({ bookId, kind: 'evaluation-rewrite', ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
      store.saveEvaluation({ bookId, recordId: record.recordId, expectedEntries: record.entries, finalize: false, content: { ...record.content, readiness: [...record.content.readiness, '补一句。'] } });
      expect(await code(() => store.authorizeEvaluationRewrite(bookId, taskIntentId, digest))).toBe('EVALUATION_REWRITE_STALE');
      // Re-preparing waits for the wait, in 评估's words, and says to cancel it there.
      expect(() => prepare()).toThrow('有一项评估任务在等待联网后开始；它开始并结束之前，或在任务抽屉里取消它之前，不能准备新的评估任务。');
      expect(store.cancelWaitingTask({ bookId, kind: 'evaluation-rewrite', ref: taskIntentId })).toEqual({ dequeue: null });
      expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity', 'cancelled']);
      // Prepared again at the scores as they are now.
      expect(prepare()).not.toBe(taskIntentId);
    });
  }, 300_000);

  it('cancels a 写作任务 waiting on the governor for a place, and the governor lets it go (Issue #49, S14; CONC-007)', async () => {
    await withSession(WRITING_FIXTURE_IDENTITY, async (session) => {
      const { store, owner } = session;
      const holding = await sample1Book(store, '写作占位');
      const queuedBook = await sample1Book(store, '写作排队后取消');
      const first = prepareWriting(store, holding);
      const second = prepareWriting(store, queuedBook);
      const started = store.authorizeWriting(holding, first, (await planOf(store, holding, 'writing', first, 'online')).start.planEnvelopeDigest!);
      expect(owner.admitOrQueue(started.dispatchRunRecordId!, started.ledger)).toBe('admitted');
      const queued = store.authorizeWriting(queuedBook, second, (await planOf(store, queuedBook, 'writing', second, 'online')).start.planEnvelopeDigest!);
      expect(owner.admitOrQueue(queued.dispatchRunRecordId!, queued.ledger)).toBe('queued');
      expect((await planOf(store, queuedBook, 'writing', second, 'online')).state).toEqual({ key: 'queued', label: '等待运行名额' });
      // The service's 取消 names the Run the governor must let go of, exactly as it does for a queued baseline Run.
      const cancelled = store.cancelWaitingTask({ bookId: queuedBook, kind: 'writing', ref: second });
      expect(cancelled).toEqual({ dequeue: queued.dispatchRunRecordId });
      expect(owner.dequeue(cancelled.dequeue!)).toBe(true);
      await owner.whenIdle();
      expect(transitions(second)).toEqual(['authorized', 'cancelled']);
      expect(attempts(second)).toBe(0);
    }, 1);
  }, 300_000);

  it('lists a waiting Run Reconnect Preflight could not start under 异常与结果待确认, where the editor acts on it (CONC-006)', async () => {
    await withSession(WRITING_FIXTURE_IDENTITY, async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '写作不能开始');
      const taskIntentId = prepareWriting(store, bookId);
      const digest = (await planOf(store, bookId, 'writing', taskIntentId, 'offline')).start.planEnvelopeDigest!;
      store.startTaskWhenOnline({ bookId, kind: 'writing', ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
      const [run] = store.waitingTaskRuns(bookId);
      store.blockWaitingTaskRun(run!, ['这次启动不能开始写作任务。'], 'launch');
      expect(attentionItem(store, `task:${taskIntentId}`)).toMatchObject({ group: 'exceptions', state: 'analysis-blocked', blocked: true, nextStep: 'view-run' });
      expect(store.inspectGlobalAttention(() => null, false).actionableCount).toBe(1);
      expect(panelItem(store, bookId, `task:${taskIntentId}`)).toMatchObject({ state: 'analysis-blocked' });
    });
  }, 300_000);
});

describe('联网后开始任务 of AI7 初评, 审稿意见 and 按我的评分重写评语 (Issue #760, S74c)', () => {
  it('AI7 初评 waits for the network and starts once online', async () => {
    await withSession('sample1-evaluation-authored', async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '初评联网后开始');
      let progress = store.createInitialEvaluationPreparationWork(bookId, launchPolicy);
      while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
      const taskIntentId = progress.projection!.taskIntent!.taskIntentId;
      await waitThenStart(session, bookId, 'initial-evaluation', taskIntentId);
      expect(store.inspectInitialEvaluation(bookId).state).toBe('settled');
      // 评估 reads the 初评's Task as it is now.
      expect(store.inspectEvaluation(bookId, null).initial.task?.state).toBe('settled');
    });
  }, 300_000);

  it('审稿意见 waits for the network and starts once online; 取消 is offered for it as for every kind', async () => {
    await withSession(READERS_REPORT_FIXTURE_IDENTITY, async (session) => {
      const { store, owner } = session;
      const bookId = await sample1Book(store, '审稿意见联网后开始');
      await runInitialEvaluationToEnd(store, owner, bookId, launchPolicy);
      finalizeAsJ11(store, bookId);
      const prepare = (): string => {
        let progress = store.createReadersReportPreparationWork(bookId, 'author', launchPolicy);
        while (!progress.done) progress = store.advanceReadersReportPreparationWork(progress.workId!);
        return progress.projection!.taskIntent!.taskIntentId;
      };
      const first = prepare();
      const digest = (await planOf(store, bookId, 'readers-report', first, 'offline')).start.planEnvelopeDigest!;
      store.startTaskWhenOnline({ bookId, kind: 'readers-report', ref: first, planEnvelopeDigest: digest, planDigests: [] });
      store.cancelWaitingTask({ bookId, kind: 'readers-report', ref: first });
      expect(transitions(first)).toEqual(['authorized', 'awaiting-connectivity', 'cancelled']);
      await waitThenStart(session, bookId, 'readers-report', prepare());
      expect(store.inspectReadersReport(bookId)!.state).toBe('settled');
    });
  }, 300_000);

  it('按我的评分重写评语 waits, and is blocked with 这一版的评分 when the version is saved again while it waits', async () => {
    await withSession(EVALUATION_REWRITE_FIXTURE_IDENTITY, async (session) => {
      const { store, owner } = session;
      const bookId = await sample1Book(store, '重写联网后开始');
      await runInitialEvaluationToEnd(store, owner, bookId, launchPolicy);
      finalizeAsJ11(store, bookId);
      const record = beginRewriteAsJ11(store, bookId);
      const prepare = (recordId: string): string => {
        let progress = store.createEvaluationRewritePreparationWork(bookId, recordId, launchPolicy);
        while (!progress.done) progress = store.advanceEvaluationRewritePreparationWork(progress.workId!);
        return progress.projection!.taskIntent!.taskIntentId;
      };
      const taskIntentId = prepare(record.recordId);
      const digest = (await planOf(store, bookId, 'evaluation-rewrite', taskIntentId, 'offline')).start.planEnvelopeDigest!;
      store.startTaskWhenOnline({ bookId, kind: 'evaluation-rewrite', ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
      // The editor saves the version again while the rewrite waits: it would write to scores that may have changed (S81b2).
      store.saveEvaluation({ bookId, recordId: record.recordId, expectedEntries: record.entries, finalize: false, content: { ...record.content, readiness: [...record.content.readiness, '补一句。'] } });
      expect(await preflight(session, 'online')).toEqual({ admitted: 0, blocked: 1, waiting: 0 });
      expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity', 'blocked-before-dispatch']);
      const plan = await planOf(store, bookId, 'evaluation-rewrite', taskIntentId, 'online');
      expect(plan.state.key).toBe('plan-moved');
      expect(plan.planMovedReason).toBe('需要重新确认计划：这一版的评分已经变化，这次授权不再对应当前的情况。');
      // Prepared again at the scores as they are now, it waits and starts.
      await waitThenStart(session, bookId, 'evaluation-rewrite', prepare(record.recordId));
    });
  }, 300_000);
});

describe('联网后开始任务 of a Review Run (Issue #760, S74c)', () => {
  it('approves once and waits; nothing drives it but Reconnect Preflight, which starts it once online, and it reviews as it would have', async () => {
    await withSession('sample1-review-authored', async (session) => {
      const { store, driver } = session;
      const bookId = await sample1Book(store, '审阅联网后开始');
      const prepared = prepareReview(store, bookId);
      const reviewRunId = prepared.reviewRunId;
      const offline = await planOf(store, bookId, 'review-run', reviewRunId, 'offline');
      // A review's route reaches its model over the network as the baseline's does, so it is offline too.
      expect(offline.state).toEqual({ key: 'offline', label: '离线' });
      expect(offline.start).toMatchObject({ readiness: 'offline', planEnvelopeDigest: null });
      const planDigests = offline.start.categoryDigests;
      expect(planDigests.map((entry) => entry.categoryId)).toEqual([TYPOS]);
      store.startTaskWhenOnline({ bookId, kind: 'review-run', ref: reviewRunId, planEnvelopeDigest: null, planDigests });
      // A repeat answers as the first did.
      store.startTaskWhenOnline({ bookId, kind: 'review-run', ref: reviewRunId, planEnvelopeDigest: null, planDigests });
      const run = store.inspectReviewWorkspace(bookId, reviewRunId).run!;
      expect(run).toMatchObject({ state: 'waiting', stateLabel: '等待网络 · 未启动', canContinue: false });
      expect(run.categories.map((category) => [category.state, category.detail])).toEqual([['waiting', '联网后开始：恢复联网后，AI7 先核对计划再开始这次审阅；在此之前什么都没有发送。']]);
      expect(reviewEvents(reviewRunId)).toEqual([]);
      expect((await planOf(store, bookId, 'review-run', reviewRunId, 'offline')).state).toEqual({ key: 'waiting', label: '等待网络' });
      expect(store.waitingTaskRuns(bookId)).toEqual([expect.objectContaining({ kind: 'review-run', ref: reviewRunId, runRecordId: reviewRunId })]);
      // 继续审阅 never starts it, and no new 审阅 is prepared over it.
      expect(await code(() => driver.drive(reviewRunId))).toBe('REVIEW_RUN_WAITING');
      expect(store.inspectReviewWorkspace(bookId, reviewRunId).newReview).toEqual({ available: false, unavailableReason: '这本书有一次审阅在等待联网后开始；取消它之后才能新建审阅。' });
      expect(await code(() => store.createReviewRunPreparationWork(bookId, [TYPOS], WHOLE, launchPolicy))).toBe('REVIEW_RUN_WAITING');
      const expected = { group: 'active', state: 'analysis-waiting-network', nextStep: 'view-review', target: { kind: 'review', bookId, reviewRunId } };
      expect(attentionItem(store, `review:${reviewRunId}`)).toMatchObject(expected);
      expect(panelItem(store, bookId, `review:${reviewRunId}`)).toMatchObject(expected);
      expect(await preflight(session, 'offline')).toEqual({ admitted: 0, blocked: 0, waiting: 1 });
      expect(reviewEvents(reviewRunId)).toEqual([]);
      expect(await preflight(session, 'online')).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
      await driver.drive(reviewRunId);
      const reviewed = store.inspectReviewWorkspace(bookId, reviewRunId).run!;
      expect(reviewed).toMatchObject({ state: 'settled', canContinue: false });
      expect(reviewEvents(reviewRunId).map(([categoryId, state]) => [categoryId, state])).toEqual([[TYPOS, 'dispatched'], [TYPOS, 'settled'], [TYPOS, 'materialized']]);
      expect(store.waitingTaskRuns(null)).toEqual([]);
    });
  }, 300_000);

  it('survives a restart waiting, is cancelled directly, and is blocked 需要重新确认计划 when its plans moved while it waited', async () => {
    let bookId = '';
    let waitingRunId = '';
    await withSession('sample1-review-authored', async (session) => {
      const { store } = session;
      bookId = await sample1Book(store, '审阅取消与变化');
      const prepared = prepareReview(store, bookId);
      waitingRunId = prepared.reviewRunId;
      const planDigests = (await planOf(store, bookId, 'review-run', waitingRunId, 'offline')).start.categoryDigests;
      store.startTaskWhenOnline({ bookId, kind: 'review-run', ref: waitingRunId, planEnvelopeDigest: null, planDigests });
    });
    await withSession('sample1-review-authored', async (session) => {
      const { store, driver } = session;
      // AI7 closed and opened again (OFF-013): it still waits, untouched by the startup reconciliation.
      expect(store.inspectReviewWorkspace(bookId, waitingRunId).run!.state).toBe('waiting');
      expect(store.waitingTaskRuns(null).map((run) => run.ref)).toEqual([waitingRunId]);
      store.cancelWaitingTask({ bookId, kind: 'review-run', ref: waitingRunId });
      expect(store.inspectReviewWorkspace(bookId, waitingRunId).run).toMatchObject({ state: 'cancelled', stateLabel: '已取消', canContinue: false });
      expect(reviewEvents(waitingRunId)).toEqual([[TYPOS, 'refused', 'REVIEW_RUN_CANCELLED']]);
      // Cancelling twice answers the same; a prepared Run never waited.
      store.cancelWaitingTask({ bookId, kind: 'review-run', ref: waitingRunId });
      expect(reviewEvents(waitingRunId)).toHaveLength(1);
      expect(await code(() => driver.drive(waitingRunId))).toBe('REVIEW_RUN_STOPPED');
      const next = prepareReview(store, bookId);
      expect(await code(() => store.cancelWaitingTask({ bookId, kind: 'review-run', ref: next.reviewRunId }))).toBe('REVIEW_RUN_NOT_WAITING');

      const planDigests = (await planOf(store, bookId, 'review-run', next.reviewRunId, 'offline')).start.categoryDigests;
      store.startTaskWhenOnline({ bookId, kind: 'review-run', ref: next.reviewRunId, planEnvelopeDigest: null, planDigests });
      reenrollCredential();
      expect(await preflight(session, 'online')).toEqual({ admitted: 0, blocked: 1, waiting: 0 });
      const moved = store.inspectReviewWorkspace(bookId, next.reviewRunId).run!;
      expect(moved).toMatchObject({ state: 'plan-moved', stateLabel: PLAN_MOVED_LABEL, canContinue: false });
      expect(moved.categories.map((category) => [category.state, category.stateLabel, category.detail]))
        .toEqual([['refused', PLAN_MOVED_LABEL, `需要重新确认计划：「${TYPOS_AND_USAGE.label}」的计划已经变化，这次授权不再对应当前的情况。`]]);
      expect(reviewEvents(next.reviewRunId)).toEqual([[TYPOS, 'refused', 'REVIEW_RUN_PLAN_MOVED']]);
      const plan = await planOf(store, bookId, 'review-run', next.reviewRunId, 'online');
      expect(plan.state).toEqual({ key: 'plan-moved', label: PLAN_MOVED_LABEL });
      expect(plan.planMovedReason).toBe(`需要重新确认计划：「${TYPOS_AND_USAGE.label}」的计划已经变化，这次授权不再对应当前的情况。`);
      expect(attentionItem(store, `review:${next.reviewRunId}`)).toMatchObject({ group: 'decisions', state: 'analysis-plan-moved', blocked: true, nextStep: 'view-review' });
      expect(await code(() => driver.drive(next.reviewRunId))).toBe('REVIEW_RUN_STOPPED');
      // A new 审阅 is the way on.
      expect(store.inspectReviewWorkspace(bookId, next.reviewRunId).newReview.available).toBe(true);
    });
  }, 300_000);
});
