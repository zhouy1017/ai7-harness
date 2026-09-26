import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  MAX_FRAME_BYTES,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateRequest,
  type BookTaskGroupKey,
  type BookTasksProjection,
  type LaunchPolicyProjection,
  type ReviewRunProjection,
  type ReviewRunScopeRequest,
} from '../../src/shared/protocol.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for the 任务 panel (Issue #423, plan slice S77a; editor-surfaces §1 任务面, V2-UX-TASK-044):
// the real store over exact `sample1`, the one execution owner and the Review Run drive loop, with the AI7 local
// deterministic adapter where a Run has to execute. Each case reads one Book's Tasks as the product's own operations
// made them — a plan nobody started, a Run in flight, its completion, a Task cancelled before it read anything, a 审阅
// prepared and then on the manuscript — and proves the read writes nothing and names no other Book's Task.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
const CONTROL = {
  induceUnprovableReconciliation: false,
  persistLegacyReviewedDraft: false,
  induceReimportProofTamper: false,
  induceAbandonObjectRemovalFailure: false,
  interruptAfterAbandonObjectRemoval: false,
  baselineAnalysisRoute: null,
};

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-book-tasks-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
});

afterEach(async () => {
  await roots.dispose();
});

function open(route: ResolvedModelFixture): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    ...CONTROL,
    baselineAnalysisRoute: { fixtureIdentity: route.identity, fixtureSha256: route.sha256, fixtureLineage: route.lineage },
  });
}

function ownerOf(store: EditorialStore, fixture: ResolvedModelFixture): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
}

async function importBook(store: EditorialStore, title: string, first: boolean): Promise<{ bookId: string }> {
  await requireExactSample1(roots.codeRoot);
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  // One Main Editorial Role connection for the whole store: a second one would move every prepared plan.
  if (first) recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported;
}

function prepare(store: EditorialStore, bookId: string, update: BaselineAnalysisUpdateRequest | null): BaselineAnalysisProjection {
  const goal = update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode];
  let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, update, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

/** Every row of every relation as one digest per relation: what a read must leave exactly as it found it. */
function relationDigests(): Record<string, string> {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const tables = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
      .map((row) => row.name);
    return Object.fromEntries(tables.map((table) => {
      const rows = database.prepare(`SELECT * FROM "${table}"`).all()
        .map((row) => JSON.stringify(row, (_key, value: unknown) => value instanceof Uint8Array ? Buffer.from(value).toString('hex') : value))
        .sort();
      return [table, createHash('sha256').update(rows.join('\n')).digest('hex')] as const;
    }));
  } finally {
    database.close();
  }
}

/** Read the panel twice around a digest of every relation: the two answers agree and nothing moved. */
function readWritingNothing(read: () => BookTasksProjection): BookTasksProjection {
  const before = relationDigests();
  const first = read();
  const second = read();
  expect(relationDigests()).toEqual(before);
  expect(second).toEqual(first);
  expect(Buffer.byteLength(JSON.stringify(first), 'utf8')).toBeLessThan(MAX_FRAME_BYTES);
  return first;
}

function states(projection: BookTasksProjection, key: BookTaskGroupKey): string[] {
  return projection.groups.find((group) => group.key === key)!.items.map((entry) => `${entry.item.state}/${entry.item.nextStep}`);
}

describe('the 任务 panel over the real store on exact sample1', () => {
  it('follows one Book\'s baseline Tasks from a plan nobody started to a completion and a cancellation, lists no other Book\'s, and writes nothing', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
    const store = await open(fixture);
    const owner = ownerOf(store, fixture);
    const read = (bookId: string): BookTasksProjection => store.inspectBookTasks(bookId, (runRecordId) => owner.progressFor(runRecordId));
    try {
      const bookA = await importBook(store, 'L2 任务面 甲', true);
      const bookB = await importBook(store, 'L2 任务面 乙', false);

      // A plan prepared and not started: 等你处理, with 查看计划并开始 — and 待我处理 lists none of it.
      const prepared = prepare(store, bookA.bookId, null);
      const waiting = readWritingNothing(() => read(bookA.bookId));
      expect(waiting.groups.map((group) => group.key)).toEqual(['waiting', 'running', 'recent']);
      expect(states(waiting, 'waiting')).toEqual(['analysis-prepared/view-plan']);
      expect(waiting.groups[0]!.items[0]!.item.target).toEqual({ kind: 'analysis-plan', bookId: bookA.bookId, taskIntentId: prepared.taskIntent!.taskIntentId });
      expect([states(waiting, 'running'), states(waiting, 'recent'), waiting.running]).toEqual([[], [], false]);
      expect(store.inspectGlobalAttention((runRecordId) => owner.progressFor(runRecordId), owner.busy).groups.every((group) => group.items.length === 0)).toBe(true);
      // The other Book has nothing, and this Book's plan is not its.
      expect(readWritingNothing(() => read(bookB.bookId)).groups.every((group) => group.total === 0)).toBe(true);

      // Started: the one Run in flight is 进行中, and the panel follows it.
      owner.admitAndDispatch(store.authorizeBaselineAnalysis(bookA.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!);
      const inFlight = read(bookA.bookId);
      expect(inFlight.running).toBe(true);
      expect(states(inFlight, 'waiting')).toEqual([]);
      expect(states(inFlight, 'running')).toHaveLength(1);
      expect(['analysis-queued/view-run', 'analysis-running/view-run']).toContain(states(inFlight, 'running')[0]);
      await owner.whenIdle();

      // Finished: 最近完成, naming the revision it formed, which 查看结果 opens.
      const settled = store.inspectBaselineAnalysis(bookA.bookId);
      expect(settled.state).toBe('settled');
      const done = readWritingNothing(() => read(bookA.bookId));
      expect([states(done, 'waiting'), states(done, 'running'), done.running]).toEqual([[], [], false]);
      expect(states(done, 'recent')).toEqual(['analysis-completed/view-run']);
      expect(done.groups[2]!.items[0]!.result).toEqual({ kind: 'analysis-revision', revisionId: settled.resultSetRevision!.revisionId });
      expect(done.groups[2]!.items[0]!.item.facts.revisionOrdinal).toBe(1);

      // A second Task, left executing with nothing executing it and then cancelled: it read nothing, so it formed no
      // result, and it stands first in 最近完成 as 已取消 — which 待我处理 never lists.
      const again = prepare(store, bookA.bookId, { mode: 'reanalyze-book', selectedRange: null });
      const againId = again.taskIntent!.taskIntentId;
      const runRecordId = store.authorizeBaselineAnalysis(bookA.bookId, againId, again.planEnvelope!.digest).dispatchRunRecordId!;
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      store.baselineAnalysisLedger.recordRunState(runRecordId, 'executing', { detail: '执行绑定已持久化并核对；开始逐单元执行。' });
      expect(states(read(bookA.bookId), 'waiting')).toEqual(['analysis-orphaned/view-run']);
      expect(store.requestBaselineAnalysisCancel(bookA.bookId, againId)).toBe(runRecordId);
      expect(owner.cancelRun(runRecordId, store.baselineAnalysisLedger)).toBe('settled');
      const cancelled = readWritingNothing(() => read(bookA.bookId));
      expect(states(cancelled, 'recent')).toEqual(['analysis-cancelled/view-run', 'analysis-completed/view-run']);
      expect(cancelled.groups[2]!.items[0]!.result).toBeNull();
      expect(cancelled.groups[2]!.items[0]!.item.target).toEqual({ kind: 'analysis', bookId: bookA.bookId, taskIntentId: againId });
      expect(store.inspectGlobalAttention((id) => owner.progressFor(id), owner.busy).groups.flatMap((group) => group.items).map((item) => item.state))
        .not.toContain('analysis-cancelled');
      expect(readWritingNothing(() => read(bookB.bookId)).groups.every((group) => group.total === 0)).toBe(true);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('lists a 审阅 prepared and not started in 等你处理, and once on the manuscript in 最近完成 with its Run as the result', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-review-authored');
    const store = await open(fixture);
    const owner = ownerOf(store, fixture);
    const read = (bookId: string): BookTasksProjection => store.inspectBookTasks(bookId, (runRecordId) => owner.progressFor(runRecordId));
    try {
      const book = await importBook(store, 'L2 任务面 审阅', true);
      let progress = store.createReviewRunPreparationWork(book.bookId, [TYPOS_AND_USAGE.categoryId], WHOLE, launchPolicy);
      while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
      const run: ReviewRunProjection = progress.projection!.run!;
      const prepared = readWritingNothing(() => read(book.bookId));
      expect(states(prepared, 'waiting')).toEqual(['review-prepared/view-plan']);
      expect(prepared.groups[0]!.items[0]!.item.target).toEqual({ kind: 'review-plan', bookId: book.bookId, reviewRunId: run.reviewRunId });
      expect(prepared.groups[0]!.items[0]!.item.facts.categories.map((category) => category.label)).toEqual([TYPOS_AND_USAGE.label]);

      store.authorizeReviewRun(book.bookId, run.reviewRunId, run.categories
        .filter((category) => category.planEnvelopeDigest !== null)
        .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
      const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
      await driver.drive(run.reviewRunId);
      await driver.dispose();
      const done = readWritingNothing(() => read(book.bookId));
      expect([states(done, 'waiting'), states(done, 'running')]).toEqual([[], []]);
      expect(states(done, 'recent')).toEqual(['review-completed/view-review']);
      expect(done.groups[2]!.items[0]!.result).toEqual({ kind: 'review-run', reviewRunId: run.reviewRunId });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);
});
