import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { Connectivity, TaskPlanConnectivity } from '../../src/service/connectivity.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { reconnectPreflight } from '../../src/service/reconnect-preflight.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { SeriesExclusionLedger, seriesExclusionImpact, seriesExclusionTarget, seriesScopeStopDetail } from '../../src/service/series-exclusions.js';
import { EditorialStore, type WaitingTaskRun } from '../../src/service/store.js';
import { SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL, type LaunchPolicyProjection, type StartWhenOnlineTaskKind } from '../../src/shared/protocol.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { J13_PLACE, J13_SERIES_TITLE, makeJ13Series } from '../support/series-consistency.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { WRITING_REQUEST } from '../support/writing-task.js';

// Service-integration suite (L2) for the follow-ups of 联网后开始任务 (Issue #764, from the review of #762): the real store, every
// kind's ledger, the Review Run ledger and its drive loop, the one execution owner and the AI7 local deterministic adapter over
// the authored fixtures, on exact `sample1` (ADR 0043). No Provider, socket or credential value is involved.
// 1. Reconnect Preflight admits strictly oldest-first across kinds; 2. `waitingRuns` reads unsettled approvals only; 3. an
// exclusion that reaches a waiting Run reads in SER-024's words.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const TYPOS = TYPOS_AND_USAGE.categoryId;
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-start-when-online-followups-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
});

afterEach(async () => {
  vi.restoreAllMocks();
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
    ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null },
    readGuard: (runRecordId) => store.seriesReadGuard(runRecordId), ...(capacity === undefined ? {} : { capacity }),
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

/** The device reads offline for a plan's purposes, so a Task's plan offers 联网后开始任务. */
const OFFLINE: TaskPlanConnectivity = { reading: () => 'offline', reachesNetwork: (routeKind) => routeKind === LOCAL_DETERMINISTIC_ROUTE, slotBusy: () => false };

function planOf(store: EditorialStore, bookId: string, kind: StartWhenOnlineTaskKind, ref: string) {
  return store.inspectTaskPlanWithConnection({ bookId, kind, ref }, async () => null, OFFLINE);
}

/** Reconnect Preflight wired exactly as the service wires it (src/service/index.ts), over every kind's waiting Runs. */
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

function transitions(taskIntentId: string): string[] {
  return withDatabase((database) => (database.prepare(
    `SELECT s.state FROM analysis_run_states s JOIN analysis_run_records r ON r.run_record_id = s.run_record_id
     WHERE r.task_intent_id = ? ORDER BY s.sequence`,
  ).all(taskIntentId) as Array<{ state: string }>).map((row) => row.state));
}

function reviewStates(reviewRunId: string): string[] {
  return withDatabase((database) => (database.prepare(
    'SELECT state FROM review_run_category_events WHERE review_run_id = ? ORDER BY rowid',
  ).all(reviewRunId) as Array<{ state: string }>).map((row) => row.state));
}

function prepareReview(store: EditorialStore, bookId: string, categoryId = TYPOS): string {
  let progress = store.createReviewRunPreparationWork(bookId, [categoryId], WHOLE, launchPolicy);
  while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
  return progress.projection!.run!.reviewRunId;
}

async function reviewWaitsOnline(store: EditorialStore, bookId: string, reviewRunId: string): Promise<void> {
  const planDigests = (await planOf(store, bookId, 'review-run', reviewRunId)).start.categoryDigests;
  store.startTaskWhenOnline({ bookId, kind: 'review-run', ref: reviewRunId, planEnvelopeDigest: null, planDigests });
}

function prepareWriting(store: EditorialStore, bookId: string): string {
  let progress = store.createWritingPreparationWork(bookId, WRITING_REQUEST, launchPolicy);
  while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
  return progress.projection!.taskIntent!.taskIntentId;
}

describe('Reconnect Preflight admits strictly oldest-first across kinds (Issue #764, item 1)', () => {
  it('hands the one free place to the older Review Run, and the later 写作任务 waits for the next pass', async () => {
    await withSession('sample1-review-authored', async (session) => {
      const { store, owner } = session;
      const reviewBook = await sample1Book(store, '先到的审阅');
      const writingBook = await sample1Book(store, '后到的写作');
      const reviewRunId = prepareReview(store, reviewBook);
      const taskIntentId = prepareWriting(store, writingBook);
      // The review is approved first; the writing Task, whose ledger Run is admitted through the owner at once, after it.
      await reviewWaitsOnline(store, reviewBook, reviewRunId);
      const digest = (await planOf(store, writingBook, 'writing', taskIntentId)).start.planEnvelopeDigest!;
      store.startTaskWhenOnline({ bookId: writingBook, kind: 'writing', ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
      expect(store.waitingTaskRuns(null).map((run) => run.kind)).toEqual(['review-run', 'writing']);
      expect(owner.capacity).toBe(1);
      // One pass, one free place: the older Run takes it, and the governor is never exceeded.
      expect(await preflight(session, 'online')).toEqual({ admitted: 1, blocked: 0, waiting: 1 });
      expect(reviewStates(reviewRunId)[0]).toBe('dispatched');
      expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity']);
      expect(store.waitingTaskRuns(null).map((run) => run.kind)).toEqual(['writing']);
      // The place frees and the next pass admits the later one.
      await owner.whenIdle();
      expect(reviewStates(reviewRunId)).toEqual(['dispatched', 'settled', 'materialized']);
      expect(await preflight(session, 'online')).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
      await owner.whenIdle();
      expect(transitions(taskIntentId).slice(0, 3)).toEqual(['authorized', 'awaiting-connectivity', 'admitted']);
    }, 1);
  }, 300_000);
});

describe('ReviewRunStore.waitingRuns reads unsettled approvals only (Issue #764, item 2)', () => {
  it('does not read a settled approval again, however many were recorded before', async () => {
    await withSession('sample1-review-authored', async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '等待记录增长');
      // Five approvals to start once online, each cancelled before anything was sent: settled for good.
      for (let round = 0; round < 5; round += 1) {
        const settled = prepareReview(store, bookId);
        await reviewWaitsOnline(store, bookId, settled);
        store.cancelWaitingTask({ bookId, kind: 'review-run', ref: settled });
      }
      const waiting = prepareReview(store, bookId);
      await reviewWaitsOnline(store, bookId, waiting);
      expect(withDatabase((database) => (database.prepare(
        "SELECT count(*) count FROM review_run_authorizations WHERE json_extract(canonical_json, '$.start') = 'when-online'",
      ).get() as { count: number }).count)).toBe(6);

      // Every row `waitingRuns` reads out of the authorizations is counted.
      const read: number[] = [];
      const prepare = DatabaseSync.prototype.prepare;
      vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (this: DatabaseSync, sql: string) {
        const statement = prepare.call(this, sql);
        if (!sql.includes('FROM review_run_authorizations a JOIN review_runs r')) return statement;
        return new Proxy(statement, {
          get: (target, property) => property === 'all'
            ? (...parameters: unknown[]) => {
                const rows = (target.all as (...values: unknown[]) => unknown[])(...parameters);
                read.push(rows.length);
                return rows;
              }
            : Reflect.get(target, property, target) as unknown,
        });
      });
      // The waiting Runs and the reads that ask for them (the workspace, 待我处理 and the Book 任务 panel).
      expect(store.waitingTaskRuns(null).map((run) => run.ref)).toEqual([waiting]);
      store.inspectReviewWorkspace(bookId, waiting);
      store.inspectGlobalAttention(() => null, false, 'network');
      store.inspectBookTasks(bookId, () => null, 'network');
      expect(read.length).toBeGreaterThanOrEqual(2);
      expect(read.every((rows) => rows === 1)).toBe(true);
    });
  }, 300_000);
});

describe('an exclusion that reaches a waiting Review Run reads in SER-024\'s words (Issue #764, item 3)', () => {
  it('stops the Run 书系检索范围已变化 when Reconnect Preflight finds the exclusion in force, not 需要重新确认计划 of a plan drift', async () => {
    await withSession('sample1-series-consistency-authored', async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '星河之三');
      const seriesId = makeJ13Series(store, bookId);
      const itemId = store.inspectSeries(seriesId).knowledge.items[0]!.itemId;
      const reviewRunId = prepareReview(store, bookId, 'series-consistency');
      await reviewWaitsOnline(store, bookId, reviewRunId);
      // The exclusion is in force while the Run waits, though nothing stopped the Run as it was recorded: written to the ledger
      // directly, as no command of the product would.
      withDatabase((database) => {
        const target = seriesExclusionTarget('knowledge-item', itemId, { subject: J13_PLACE, knowledgeClass: 'places' });
        new SeriesExclusionLedger(database).record({
          seriesId, action: 'add', prior: null, target, reason: '', previewDigest: 'a'.repeat(64),
          impact: seriesExclusionImpact('add', { seriesTitle: J13_SERIES_TITLE, target, reason: '', priorReason: null, itemsNamed: [], itemCount: 1,
            runsNamed: [], runCount: 0, preparedCount: 0, completedNamed: [], completedCount: 0 }),
        });
      }, false);
      expect(store.inspectReviewWorkspace(bookId, reviewRunId).run!.state).toBe('waiting');

      expect(await preflight(session, 'online')).toEqual({ admitted: 0, blocked: 1, waiting: 0 });
      const stopped = store.inspectReviewWorkspace(bookId, reviewRunId).run!;
      expect([stopped.state, stopped.stateLabel, stopped.canContinue]).toEqual(['scope-changed', SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL, false]);
      expect([stopped.categories[0]!.state, stopped.categories[0]!.stateLabel]).toEqual(['refused', SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL]);
      expect(stopped.categories[0]!.detail).toBe(seriesScopeStopDetail([`书系知识条目「${J13_PLACE}」（地点）`]));
      expect(JSON.stringify(stopped)).not.toContain('已经变化，这次授权不再对应当前的情况');
      expect(store.inspectTaskPlan({ bookId, kind: 'review-run', ref: reviewRunId }).state).toEqual({ key: 'stopped', label: SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL });
      expect(reviewStates(reviewRunId)).toEqual(['refused']);
      // The ways on are SER-024's: 取消任务 ends it, and nothing was ever sent.
      expect(store.cancelReviewRun(bookId, reviewRunId).run!.state).toBe('cancelled');
    });
  }, 300_000);
});
