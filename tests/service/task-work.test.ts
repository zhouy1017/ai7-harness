import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore } from '../../src/service/store.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type LaunchPolicyProjection, type TaskWorkProjection } from '../../src/shared/protocol.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// 用时 (Issue #1670) over the real store and exact `sample1`: the run states a baseline Run records — written through the ledger's
// own public `recordRunState`, exactly the rows every version before this one wrote — read as one working time on the plan, the
// 任务 overview row and the Book's 任务 panel row, across a pause, a queue wait, a wait for the editor's answer, two restarts
// hours apart and a cancellation. The clock is the only seam: `Date` is set, nothing sleeps.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const T0 = Date.parse('2026-11-20T08:00:00.000Z');
const MINUTE = 60_000;
let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;
let governor: ModelRequestGovernor;

beforeEach(() => { governor = new ModelRequestGovernor(); });
afterEach(async () => { governor.close(); await governor.whenIdle(); });
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-task-work-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
});
afterEach(async () => { vi.useRealTimers(); await roots.dispose(); });

function open(): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, { induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false, induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage } });
}

async function preparedBaseline(store: EditorialStore, title: string, first: boolean): Promise<{ bookId: string; taskIntentId: string; digest: string }> {
  const book = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  if (first) recordMissingCredentialConnection(store, '用时连接');
  let progress = store.createBaselineAnalysisPreparationWork(book.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return { bookId: book.bookId, taskIntentId: progress.projection!.taskIntent!.taskIntentId, digest: progress.projection!.planEnvelope!.digest };
}

/** The figure at the clock's now, as a reader ticks it. */
const figure = (work: TaskWorkProjection | null | undefined): number | null =>
  work == null ? null : work.workedMs + (work.workingSince === null ? 0 : Date.now() - Date.parse(work.workingSince));

/** The same Task's 用时 on its plan, its 任务 overview row and its Book 任务 panel row: one number everywhere. */
function readings(store: EditorialStore, bookId: string, taskIntentId: string): TaskWorkProjection | null {
  const plan = store.inspectTaskPlan({ bookId, kind: 'baseline-analysis', ref: taskIntentId }).work ?? null;
  const row = store.inspectBookTasks(bookId, () => null).groups.flatMap((group) => group.items)
    .find((entry) => entry.item.target.kind === 'analysis' && entry.item.target.taskIntentId === taskIntentId);
  const overview = store.inspectTaskOverview(() => null, 2, () => null, false).groups.flatMap((group) => group.items)
    .find((item) => item.target.kind === 'analysis' && item.target.taskIntentId === taskIntentId);
  expect(row?.work).toEqual(plan);
  expect(overview?.work).toEqual(plan);
  return plan;
}

it('reads one 用时 across pause, queue, an answer wait, two restarts and a cancellation, from the rows alone (#1670)', async () => {
  let store = await open();
  const clock = (minutes: number) => vi.setSystemTime(T0 + minutes * MINUTE);
  let bookId = '', taskIntentId = '', runRecordId = '';
  try {
    const prepared = await preparedBaseline(store, '用时 甲', true);
    bookId = prepared.bookId; taskIntentId = prepared.taskIntentId;
    vi.useFakeTimers({ toFake: ['Date'] });
    clock(0);
    runRecordId = store.authorizeBaselineAnalysis(bookId, taskIntentId, prepared.digest).dispatchRunRecordId!;
    const ledger = store.baselineAnalysisLedger;
    const write = (minutes: number, state: Parameters<typeof ledger.recordRunState>[1]) => { clock(minutes); ledger.recordRunState(runRecordId, state, { detail: state }); };
    expect(readings(store, bookId, taskIntentId)).toEqual({ workedMs: 0, workingSince: null, finished: null });
    write(2, 'admitted'); write(3, 'executing');
    clock(5);
    expect(readings(store, bookId, taskIntentId)).toEqual({ workedMs: 0, workingSince: new Date(T0 + 3 * MINUTE).toISOString(), finished: null });
    expect(figure(readings(store, bookId, taskIntentId))).toBe(2 * MINUTE);
    // 正在暂停 still works: the step in flight goes on until 已暂停.
    write(6, 'pausing'); write(7, 'paused');
    clock(15);
    expect(figure(readings(store, bookId, taskIntentId))).toBe(4 * MINUTE);
    // 续行 waits in the queue, works, waits for the editor's answer, works again: only the working counts.
    write(20, 'admitted'); write(21, 'executing'); write(23, 'awaiting-clarification'); write(40, 'executing'); write(41, 'executing');
    clock(42);
    expect(figure(readings(store, bookId, taskIntentId))).toBe(8 * MINUTE);
    store.markCleanShutdown();
  } finally { store.close(); }
  // AI7 was closed for hours: the reconciliation is stamped at the next start, and none of the closed time counts.
  for (const restartAt of [300, 600]) {
    clock(restartAt);
    store = await open();
    try {
      store.reconcileStoppedBaselineAnalysisRuns();
      expect(store.baselineAnalysisLedger.currentRunState(runRecordId)).toBe('resumable');
      expect(readings(store, bookId, taskIntentId)).toEqual({ workedMs: 7 * MINUTE, workingSince: null, finished: null });
      store.markCleanShutdown();
    } finally { store.close(); }
  }
  store = await open();
  try {
    const ledger = store.baselineAnalysisLedger;
    const write = (minutes: number, state: Parameters<typeof ledger.recordRunState>[1]) => { clock(minutes); ledger.recordRunState(runRecordId, state, { detail: state }); };
    write(601, 'admitted'); write(602, 'executing');
    clock(603);
    expect(figure(readings(store, bookId, taskIntentId))).toBe(8 * MINUTE);
    // 正在取消 counts until the Run's last own record; 已取消 ends it, and the running and the finished figure are one number.
    write(604, 'cancelling');
    const running = figure(readings(store, bookId, taskIntentId));
    write(604.5, 'cancelled');
    const ended = readings(store, bookId, taskIntentId)!;
    expect([running, ended.workedMs, ended.workingSince]).toEqual([9 * MINUTE, 9 * MINUTE, null]);
    expect(ended.finished).toEqual({ requests: null, modelLabel: expect.any(String) });
    store.markCleanShutdown();
  } finally { store.close(); }
}, 60_000);

it('measures a duration from two completed same-kind Tasks, and names their requests and model once ended (#1670)', async () => {
  const store = await open();
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture,
    secretResolver: { resolve: async () => null }, unitHold: null });
  try {
    const books = [await preparedBaseline(store, '用时 乙', true), await preparedBaseline(store, '用时 丙', false), await preparedBaseline(store, '用时 丁', false)];
    const planOf = (book: (typeof books)[number]) => store.inspectTaskPlan({ bookId: book.bookId, kind: 'baseline-analysis', ref: book.taskIntentId });
    expect(planOf(books[2]!).estimate).toMatchObject({ durationMs: null, sentence: expect.stringMatching(/^预计读 \d+ 个部分，至少 \d+ 次模型调用（重试、抽检或复盘时会更多）；用时暂无可靠估计。$/u) });
    const rates: number[] = [];
    for (const book of books.slice(0, 2)) {
      owner.admitOrQueue(store.authorizeBaselineAnalysis(book.bookId, book.taskIntentId, book.digest).dispatchRunRecordId!);
      await owner.whenIdle();
      const plan = planOf(book);
      const overview = store.inspectTaskOverview(() => null, 2, () => null, false).groups.flatMap((group) => group.items)
        .find((item) => item.target.kind === 'analysis' && item.target.taskIntentId === book.taskIntentId)!;
      const row = store.inspectBookTasks(book.bookId, () => null).groups.flatMap((group) => group.items).find((entry) => entry.item.target.kind === 'analysis' && entry.item.target.taskIntentId === book.taskIntentId)!;
      expect(plan.work).toEqual({ workedMs: expect.any(Number), workingSince: null, finished: { requests: overview.usage!.calls, modelLabel: row.item.modelLabel } });
      expect([overview.work, row.work]).toEqual([plan.work, plan.work]);
      // 「至少」 holds: every addend of the estimate is a request the Run made.
      expect(plan.work!.finished!.requests).toBeGreaterThanOrEqual(plan.estimate!.fewestRequests);
      expect(plan.work!.workedMs).toBeGreaterThan(0);
      rates.push(plan.work!.workedMs / plan.estimate!.parts);
    }
    const third = planOf(books[2]!).estimate!;
    expect(third.durationMs).toBe(Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length * third.parts));
    expect(third.sentence).toMatch(/；按最近同类任务，(不到 1 分钟|约 \d+ 分钟)。$/u);
  } finally { await owner.dispose(); store.close(); }
}, 60_000);
