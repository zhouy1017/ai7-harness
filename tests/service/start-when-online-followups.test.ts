import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { capturedMapAnswer, capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, parseUnitMessageHeader, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { parseCrossUnitMessageHeader } from '../../src/service/analysis/cross-unit-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { parseWritingUnitMessageHeader, parseWritingSynthesisMessageHeader } from '../../src/service/writing/writing-contract.js';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { Connectivity, TaskPlanConnectivity } from '../../src/service/connectivity.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { resolveFixtureEntry, loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { reconnectPreflight } from '../../src/service/reconnect-preflight.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { SeriesExclusionLedger, seriesExclusionImpact, seriesExclusionTarget, seriesScopeStopDetail } from '../../src/service/series-exclusions.js';
import { EditorialStore, type WaitingTaskRun } from '../../src/service/store.js';
import { BASELINE_ANALYSIS_TASK_GOAL, SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL, type LaunchPolicyProjection, type StartWhenOnlineTaskKind } from '../../src/shared/protocol.js';
import { LITERARY_EXPRESSION, TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { J13_PLACE, J13_SERIES_TITLE, makeJ13Series } from '../support/series-consistency.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { AUTHORED_WRITING_DRAFT, AUTHORED_WRITING_PASSAGES, WRITING_REQUEST } from '../support/writing-task.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

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

async function withSession(fixtureIdentity: string, body: (session: Session) => Promise<void>, capacity?: number, ordinary = false): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const fixture = await loadModelFixture(FIXTURES_ROOT, fixtureIdentity);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: ordinary ? null : { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  if (ordinary) {
    const search = store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
    store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready'); store.selectSearchBackend('search-tinyfish');
  }
  let holdFirst = ordinary;
  let releaseOccupant!: () => void, occupantEntered!: () => void;
  const released = new Promise<void>((resolve) => { releaseOccupant = resolve; });
  const entered = new Promise<void>((resolve) => { occupantEntered = resolve; });
  const captured = ordinary ? capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, requestGovernor, (request, message) => {
    const baseline = parseUnitMessageHeader(message), review = parseReviewCategoryUnitMessageHeader(message), writing = parseWritingUnitMessageHeader(message);
    if (request.stage === 'units' && baseline !== null) return resolveFixtureEntry(fixture.entries, baseline.ordinal,
      unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, baseline.ordinal, baseline.unitDigest), request.attemptIndex)?.response;
    if (request.stage === 'cross-unit-reduction' && parseCrossUnitMessageHeader(message) !== null) return capturedMapAnswer(fixture.entries)(request, message);
    const content = request.stage === 'units' && review !== null ? { schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: review.ordinal, findings: [] }
      : request.stage === 'units' && writing !== null ? { schema: 'ai7.writing.unit-result/1', unitOrdinal: writing.ordinal, passages: AUTHORED_WRITING_PASSAGES[writing.ordinal] }
        : parseWritingSynthesisMessageHeader(message) !== null ? AUTHORED_WRITING_DRAFT
          : request.stage === 'assurance-sampling' ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(message)
            .map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) }
            : request.stage === 'run-report-reflection' ? { schema: 'ai7.analysis.run-report-reflection-result/1', items: [] } : null;
    return content === null ? undefined : { kind: 'unit-result', text: JSON.stringify(content), usage: { inputTokens: 10, outputTokens: 5 } };
  }, { seriesScopeGuard: (id) => store.seriesScopeGuard(id), unitHold: async () => {
    if (!holdFirst) return; holdFirst = false; occupantEntered(); await released;
  } }) : null;
  if (captured !== null) launchPolicy = captured.policy;
  const owner = captured?.owner ?? new BaselineAnalysisExecutionOwner({ requestGovernor,
    ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null },
    seriesScopeGuard: (runRecordId) => store.seriesScopeGuard(runRecordId), ...(capacity === undefined ? {} : { capacity }) });
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  try {
    if (ordinary) {
      // Actual ordinary runtime has two places. Hold a real finite-Plan Run in one; the target scenario owns one free place.
      const bookId = await sample1Book(store, '已占用一个运行名额');
      let work = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
      const prepared = work.projection!;
      const finite = store.editBaselineAnalysisPlan({ bookId, taskIntentId: prepared.taskIntent!.taskIntentId,
        planEnvelopeDigest: prepared.planEnvelope!.digest, removedSteps: [], disallowedAdaptations: [],
        runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 } });
      owner.admitAndDispatch(store.authorizeBaselineAnalysis(bookId, finite.taskIntent!.taskIntentId, finite.planEnvelope!.digest).dispatchRunRecordId!);
      await entered; expect(owner.capacity).toBe(2); expect(owner.busy).toBe(false);
    }
    await body({ store, owner, driver });
    store.markCleanShutdown();
  } finally {
    releaseOccupant();
    const stopped = driver.dispose();
    await owner.dispose();
    await stopped;
    try { captured?.assertMatched(); } finally { store.close(); }
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
  return store.inspectTaskPlanWithConnection({ bookId, kind, ref }, async () =>
    store.baselineAnalysisLedger.launch.operationalScope === 'ordinary-production' ? 'present' : null, OFFLINE);
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

function prepareReview(store: EditorialStore, bookId: string, categoryId: string | ReadonlyArray<string> = TYPOS): string {
  let progress = store.createReviewRunPreparationWork(bookId, typeof categoryId === 'string' ? [categoryId] : categoryId, WHOLE, launchPolicy);
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
      expect(owner.capacity).toBe(2);
      // One pass, one free place: the older Run takes it, and the governor is never exceeded.
      expect(await preflight(session, 'online')).toEqual({ admitted: 1, blocked: 0, waiting: 1 });
      expect(reviewStates(reviewRunId)[0]).toBe('dispatched');
      expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity']);
      expect(store.waitingTaskRuns(null).map((run) => run.kind)).toEqual(['writing']);
      // The place frees and the next pass admits the later one.
      await session.driver.drive(reviewRunId);
      expect(reviewStates(reviewRunId)).toEqual(['dispatched', 'settled', 'materialized']);
      expect(await preflight(session, 'online')).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
      await owner.whenDone(store.inspectWriting(writingBook)!.run!.runRecordId);
      expect(transitions(taskIntentId).slice(0, 3)).toEqual(['authorized', 'awaiting-connectivity', 'admitted']);
    }, 1, true);
  }, 300_000);
});

describe('a leads-first Review Run keeps its place in the order (Issue #764 review)', () => {
  it('writes the baseline leads of 情节逻辑与前后一致 and takes the free place for the next category before a later 写作任务 is admitted', async () => {
    await withSession('sample1-review-authored', async (session) => {
      const { store, owner } = session;
      const reviewBook = await sample1Book(store, '先到的本地审阅');
      const writingBook = await sample1Book(store, '后到的写作');
      // The leads come from the Book's baseline analysis, settled through the same owner.
      let baseline = store.createBaselineAnalysisPreparationWork(reviewBook, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!baseline.done) baseline = store.advanceBaselineAnalysisPreparationWork(baseline.workId!);
      const prepared = baseline.projection!;
      const baselineRun = store.authorizeBaselineAnalysis(reviewBook, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      owner.admitAndDispatch(baselineRun);
      await owner.whenDone(baselineRun);
      expect(store.inspectBaselineAnalysis(reviewBook).state).toBe('settled');

      // The configuration orders 情节逻辑 (no model) before 文学表达 (a model), whatever the selection order.
      const reviewRunId = prepareReview(store, reviewBook, [LITERARY_EXPRESSION.categoryId, 'plot-consistency']);
      const taskIntentId = prepareWriting(store, writingBook);
      await reviewWaitsOnline(store, reviewBook, reviewRunId);
      const digest = (await planOf(store, writingBook, 'writing', taskIntentId)).start.planEnvelopeDigest!;
      store.startTaskWhenOnline({ bookId: writingBook, kind: 'writing', ref: taskIntentId, planEnvelopeDigest: digest, planDigests: [] });
      expect(owner.capacity).toBe(2);
      expect(await preflight(session, 'online')).toEqual({ admitted: 1, blocked: 0, waiting: 1 });
      expect(withDatabase((database) => (database.prepare(
        'SELECT category_id, state FROM review_run_category_events WHERE review_run_id = ? ORDER BY rowid',
      ).all(reviewRunId) as Array<{ category_id: string; state: string }>).map((row) => [row.category_id, row.state]))[0]).toEqual(['plot-consistency', 'materialized']);
      expect(reviewStates(reviewRunId)).toContain('dispatched');
      expect(transitions(taskIntentId)).toEqual(['authorized', 'awaiting-connectivity']);
      await session.driver.drive(reviewRunId);
      expect(await preflight(session, 'online')).toEqual({ admitted: 1, blocked: 0, waiting: 0 });
      await owner.whenDone(store.inspectWriting(writingBook)!.run!.runRecordId);
    }, 1, true);
  }, 300_000);
});

/** How many statements over the approvals ran while `read` did, counted where they are executed. */
function approvalStatements<T>(read: () => T): { result: T; ran: number; sql: Set<string> } {
  let ran = 0;
  const sql = new Set<string>();
  const prepare = DatabaseSync.prototype.prepare;
  const spy = vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (this: DatabaseSync, statementSql: string) {
    const statement = prepare.call(this, statementSql);
    if (!statementSql.includes('review_run_authorizations')) return statement;
    return new Proxy(statement, {
      get: (target, property) => property === 'all' || property === 'get'
        ? (...parameters: unknown[]) => {
            ran += 1;
            sql.add(statementSql);
            return (Reflect.get(target, property, target) as (...values: unknown[]) => unknown).apply(target, parameters);
          }
        : Reflect.get(target, property, target) as unknown,
    });
  });
  try {
    return { result: read(), ran, sql };
  } finally {
    spy.mockRestore();
  }
}

describe('ReviewRunStore.waitingRuns reads unsettled approvals only (Issue #764, item 2)', () => {
  it('scans the history of approvals once per store lifetime, not on every read', async () => {
    let waiting = '';
    let bookId = '';
    await withSession('sample1-review-authored', async (session) => {
      const { store } = session;
      bookId = await sample1Book(store, '等待记录增长');
      // Settled for good, two ways: cancelled before anything was sent, and blocked by Reconnect Preflight. A read costs two statements per candidate: its records, and its approval.
      for (const how of ['cancel', 'block', 'cancel', 'block'] as const) {
        const settled = prepareReview(store, bookId);
        await reviewWaitsOnline(store, bookId, settled);
        if (how === 'cancel') store.cancelWaitingTask({ bookId, kind: 'review-run', ref: settled });
        else store.blockWaitingTaskRun(store.waitingTaskRuns(bookId)[0]!, ['这次启动不能开始审阅。'], 'launch');
      }
      waiting = prepareReview(store, bookId);
      await reviewWaitsOnline(store, bookId, waiting);
      expect(store.waitingTaskRuns(null).map((run) => run.ref)).toEqual([waiting]);
    });
    // A later lifetime of the same store: the history is read once, and every read after it asks about the one that waits.
    await withSession('sample1-review-authored', async (session) => {
      const { store } = session;
      const first = approvalStatements(() => store.waitingTaskRuns(null));
      expect(first.result.map((run) => run.ref)).toEqual([waiting]);
      expect(first.ran).toBeGreaterThan(4);
      const one = approvalStatements(() => store.waitingTaskRuns(null));
      expect(one.ran).toBe(2);
      // Every statement over the approvals is keyed by the one Run: none scans them, whatever the history holds.
      expect([...one.sql].every((statement) => /review_run_id = \?/u.test(statement))).toBe(true);
      expect([...first.sql].some((statement) => !/review_run_id = \?/u.test(statement))).toBe(true);
      const book = approvalStatements(() => store.waitingTaskRuns(bookId));
      expect(book.ran).toBe(2);
      // The reads of the workspace, 待我处理 and the 任务 panel ask for the waiting Runs as well: what they cost does not grow with a read.
      const readPanels = (): number => approvalStatements(() => {
        store.inspectReviewWorkspace(bookId, waiting);
        store.inspectGlobalAttention(() => null, false, 'network');
        store.inspectBookTasks(bookId, () => null, 'network');
      }).ran;
      const panels = readPanels();
      expect(readPanels()).toBe(panels);
      // A new 审阅 is still not prepared over it.
      expect(() => prepareReview(store, bookId)).toThrow('这本书有一次审阅在等待联网后开始');
    });
  }, 300_000);

  it('keeps a Run that began its ledger Run before any category event out of the waiting, across a restart', async () => {
    let reviewRunId = '';
    await withSession('sample1-review-authored', async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '授权后未记事件');
      reviewRunId = prepareReview(store, bookId);
      await reviewWaitsOnline(store, bookId, reviewRunId);
      expect(store.waitingTaskRuns(null).map((run) => run.ref)).toEqual([reviewRunId]);
      // The category's ledger authorized by its turn and the service stopped before the category recorded anything.
      expect(store.reviewRunDriveSteps.start(reviewRunId, TYPOS)).not.toBeNull();
      expect(reviewStates(reviewRunId)).toEqual([]);
      expect(store.waitingTaskRuns(null)).toEqual([]);
    });
    await withSession('sample1-review-authored', async (session) => {
      expect(session.store.waitingTaskRuns(null)).toEqual([]);
      expect(approvalStatements(() => session.store.waitingTaskRuns(null)).ran).toBe(0);
    });
  }, 300_000);

  it('finds an approval written while the store was closed, as an import or a merge writes it', async () => {
    let imported = '';
    await withSession('sample1-review-authored', async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '关闭时写入');
      const sibling = prepareReview(store, bookId);
      await reviewWaitsOnline(store, bookId, sibling);
      store.cancelWaitingTask({ bookId, kind: 'review-run', ref: sibling });
      imported = prepareReview(store, bookId);
      expect(store.waitingTaskRuns(null)).toEqual([]);
      // The sibling's approval, copied for the prepared Run.
      withDatabase((database) => {
        database.prepare(
          `INSERT INTO review_run_authorizations(review_run_id, authorized_at, canonical_json, sha256)
           SELECT ?, authorized_at, canonical_json, sha256 FROM review_run_authorizations WHERE review_run_id = ?`,
        ).run(imported, sibling);
      }, false);
    });
    await withSession('sample1-review-authored', async (session) => {
      expect(session.store.waitingTaskRuns(null).map((run) => run.ref)).toEqual([imported]);
    });
  }, 300_000);

  it('loses no wait to a write that rolls back, and invents none', async () => {
    await withSession('sample1-review-authored', async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, '回滚');
      const reviewRunId = prepareReview(store, bookId);
      // An approval whose surrounding write rolls back leaves no wait behind…
      withDatabase((database) => database.exec(
        "CREATE TRIGGER induce_approval_rollback AFTER INSERT ON review_run_authorizations BEGIN SELECT RAISE(ABORT, 'induced'); END",
      ), false);
      await expect(reviewWaitsOnline(store, bookId, reviewRunId)).rejects.toThrow();
      expect(withDatabase((database) => (database.prepare('SELECT count(*) count FROM review_run_authorizations').get() as { count: number }).count)).toBe(0);
      expect(store.waitingTaskRuns(null)).toEqual([]);
      withDatabase((database) => database.exec('DROP TRIGGER induce_approval_rollback'), false);
      // …and the same approval, recorded after it, waits.
      await reviewWaitsOnline(store, bookId, reviewRunId);
      expect(store.waitingTaskRuns(null).map((run) => run.ref)).toEqual([reviewRunId]);
      // A cancellation that rolls back leaves the wait where it was…
      withDatabase((database) => database.exec(
        "CREATE TRIGGER induce_cancel_rollback BEFORE INSERT ON review_run_category_events BEGIN SELECT RAISE(ABORT, 'induced'); END",
      ), false);
      expect(() => store.cancelWaitingTask({ bookId, kind: 'review-run', ref: reviewRunId })).toThrow();
      expect(reviewStates(reviewRunId)).toEqual([]);
      expect(store.waitingTaskRuns(null).map((run) => run.ref)).toEqual([reviewRunId]);
      withDatabase((database) => database.exec('DROP TRIGGER induce_cancel_rollback'), false);
      // …and the one that commits settles it.
      store.cancelWaitingTask({ bookId, kind: 'review-run', ref: reviewRunId });
      expect(store.waitingTaskRuns(null)).toEqual([]);
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
