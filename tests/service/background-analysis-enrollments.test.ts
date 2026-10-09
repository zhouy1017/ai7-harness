import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { BACKGROUND_AUTHORIZED_DETAIL, type LaunchBinding } from '../../src/service/analysis/baseline-analysis-store.js';
import { BackgroundAnalysisDispatcher, type BackgroundAnalysisDispatcherDependencies } from '../../src/service/background-analysis.js';
import {
  BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL,
  BACKGROUND_ANALYSIS_ENROLLMENT_TRIGGER_SQL,
  BACKGROUND_ATTEMPTED,
  BACKGROUND_CHECKPOINT_PREEMPTED,
  BACKGROUND_CURRENT,
  BACKGROUND_DEVELOPER_LIVE,
  BACKGROUND_EDITOR_TASK,
  BACKGROUND_ENROLL_DEVELOPER_LIVE,
  BACKGROUND_ENROLL_NO_ROUTE,
  BACKGROUND_ENROLL_NO_SHARE,
  BACKGROUND_NOT_ENROLLED,
  BACKGROUND_NOT_MOVED,
  BACKGROUND_NO_ROUTE,
  BACKGROUND_PLACE_BUSY,
  BACKGROUND_PREPARATION_IN_FLIGHT,
  BACKGROUND_EDITOR_JOB,
  BACKGROUND_RECOVERY_PENDING,
  BACKGROUND_REPLACEMENT_WAITING,
  BACKGROUND_RECORD_DAMAGED,
  BACKGROUND_REVOKED,
  BACKGROUND_START_SYNC,
  BACKGROUND_SUSPENDED,
  BACKGROUND_TASK_PREPARED,
  BACKGROUND_TASK_RUNNING,
  BackgroundAnalysisEnrollmentLedger,
  backgroundDriftReason,
  backgroundNotStartedReason,
  backgroundQuietReason,
  backgroundShareFullReason,
} from '../../src/service/background-analysis-enrollments.js';
import { MATERIAL_INDEX_SCHEMA_SQL } from '../../src/service/material-index.js';
import { QUICK_START_PLAN_CHANGED } from '../../src/service/default-execution-rules.js';
import { MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import { controlledUnitHold } from '../../src/service/unit-hold.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError, type BackgroundAnalysisRuntime } from '../../src/service/store.js';
import {
  ANALYSIS_LEDGER_REVISION_65_SQL,
  BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION,
  MATERIAL_INDEX_SCHEMA_VERSION,
  WRITING_TASK_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  J03_TASK_GOAL,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateMode,
  type LaunchPolicyProjection,
  type ReviewRunScopeRequest,
} from '../../src/shared/protocol.js';
import { analysisRunAuthorizationsShape, downgradeAnalysisRunAuthorizationsToRevision65 } from '../support/default-execution-rules.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, sample1Path } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 后台分析登记 (Issue #95, plan slice S39; ADR 0048; ADR 0046; V2-UX-ANALYSIS-016 to 021): the
// real store on a temporary Agent Data Root, exact `sample1` imported through the supported path, the J-04 deterministic route,
// and no Provider, socket or credential value. Schema revision 66 adds the enrollment ledger and widens the Run Authorization
// origin; an Enrollment is made only from its disclosure, the dispatcher starts a Task of its own only while every condition
// holds and never beside the editor's work, each Run it starts is an exact Task, plan and Run Authorization naming the enrollment
// version, and revoking stops what comes after while everything already recorded stays.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const QUIET_MS = 30_000;
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-background-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(route = true): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: route ? { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage } : null,
  });
}

function ownerOf(store: EditorialStore): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
}

/** The facts the dispatcher hands the store: a route, a free place of two, no job of the editor's, a clock well past the quiet period. */
function runtime(overrides: Partial<BackgroundAnalysisRuntime> = {}): BackgroundAnalysisRuntime {
  return { routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now() + 10 * QUIET_MS, quietMs: QUIET_MS, ...overrides };
}

/** The dispatcher with the clock it is given, so a test decides whether the quiet period has passed. */
function dispatcherOf(
  store: EditorialStore,
  owner: BaselineAnalysisExecutionOwner,
  clock: { now: number },
  extra: Partial<BackgroundAnalysisDispatcherDependencies> = {},
): BackgroundAnalysisDispatcher {
  return new BackgroundAnalysisDispatcher({ store, execution: owner, launchPolicy, quietMs: QUIET_MS, now: () => clock.now, ...extra });
}

async function pass(dispatcher: BackgroundAnalysisDispatcher, owner: BaselineAnalysisExecutionOwner): Promise<void> {
  dispatcher.nudge();
  await dispatcher.settled();
  await owner.whenIdle();
}

function withDatabase<T>(readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
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

function prepare(store: EditorialStore, bookId: string, mode: BaselineAnalysisUpdateMode | null = null): BaselineAnalysisProjection {
  const goal = mode === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[mode];
  let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, mode === null ? null : { mode, selectedRange: null }, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

/** Every Run Authorization of the store, byte for byte. */
function authorizations(): unknown[] {
  return withDatabase(true, (database) => database.prepare('SELECT rowid, * FROM analysis_run_authorizations ORDER BY rowid').all());
}

function intentCount(bookId: string): number {
  return withDatabase(true, (database) => (database.prepare('SELECT count(*) n FROM analysis_task_intents WHERE book_id = ?').get(bookId) as Row).n as number);
}

function backgroundOrigins(): number {
  return withDatabase(true, (database) =>
    (database.prepare("SELECT count(*) n FROM analysis_run_authorizations WHERE origin = 'background-analysis-enrollment'").get() as Row).n as number);
}

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importedBook(store: EditorialStore, title: string): Promise<Imported> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  return imported;
}

async function analysedBook(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, title: string): Promise<Imported> {
  const imported = await importedBook(store, title);
  const first = prepare(store, imported.bookId);
  const authorized = store.authorizeBaselineAnalysis(imported.bookId, first.taskIntent!.taskIntentId, first.planEnvelope!.digest);
  owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.baselineAnalysisLedger);
  await owner.whenIdle();
  expect(store.inspectBaselineAnalysis(imported.bookId, () => null).state).toBe('settled');
  return imported;
}

/** One confirmed edit at the start of the first paragraph, as the editor's typing makes one. */
function edit(store: EditorialStore, book: Imported, text: string): void {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph')!;
  store.flushJournalEdit({
    clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
    blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: text,
  });
}

function enroll(store: EditorialStore, bookId: string, startingPoint: 'prospective' | 'backfill') {
  const shown = store.inspectBackgroundAnalysisEnrollment(bookId, runtime());
  expect(shown.offer.canEnroll).toBe(true);
  return store.enrollBackgroundAnalysis(bookId, shown.offer.disclosureDigest!, startingPoint, runtime());
}

const LIVE: LaunchBinding = {
  operationalScope: 'developer-live',
  live: {
    route: 'opencode-go', model: 'deepseek-v4-flash', endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
    credentialSlot: 'opencode-go', credentialReference: randomUUID(), runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 240_000 },
  },
};

describe('后台分析登记 over the real store on exact sample1', () => {
  it('discloses everything an Enrollment binds before the editor decides, chooses no starting point, and makes none by itself', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 后台分析登记');
      const shown = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime());
      expect([shown.state, shown.stateLabel, shown.enrollment, shown.history, shown.historyCount, shown.startedRuns, shown.startedRunCount, shown.lastLook, shown.lastNotStarted])
        .toEqual(['none', '未登记', null, [], 0, [], 0, null, null]);
      expect(shown.next).toEqual({ kind: 'none', reason: BACKGROUND_NOT_ENROLLED });
      expect(shown.offer.canEnroll).toBe(true);
      expect(shown.offer.disclosureDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(shown.offer.scope).toBe('《L2 sample1 后台分析登记》这一本书');
      expect(shown.offer.binds.map((row) => row.label)).toEqual(['模型服务', '工序', '预算上限', '发送内容类别', '会得到']);
      expect(shown.offer.startingPoints.map((point) => point.value)).toEqual(['prospective', 'backfill']);
      expect(shown.offer.notGranted.length).toBeGreaterThan(0);
      expect(shown.revoke.canRevoke).toBe(false);
      // Reading is free: nothing was recorded, the import, the profile and the analysis made no Enrollment.
      expect(withDatabase(true, (database) => (database.prepare('SELECT count(*) n FROM background_analysis_enrollments').get() as Row).n)).toBe(0);
      // Never offered where it could never start (#713 review, P3-3): no route, or a governor with no place to share.
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime({ routeExecutable: false })).offer)
        .toMatchObject({ canEnroll: false, reason: BACKGROUND_ENROLL_NO_ROUTE, disclosureDigest: null });
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime({ capacity: 1 })).offer)
        .toMatchObject({ canEnroll: false, reason: BACKGROUND_ENROLL_NO_SHARE, disclosureDigest: null });
      expect(await refusal(() => store.enrollBackgroundAnalysis(book.bookId, shown.offer.disclosureDigest!, 'prospective', runtime({ routeExecutable: false }))))
        .toBe('BACKGROUND_ANALYSIS_ENROLLMENT_UNAVAILABLE');

      // A confirmation of a disclosure other than the one on show is refused, and records nothing.
      expect(await refusal(() => store.enrollBackgroundAnalysis(book.bookId, 'f'.repeat(64), 'prospective', runtime()))).toBe('BACKGROUND_ANALYSIS_ENROLLMENT_STALE');
      const enrolled = store.enrollBackgroundAnalysis(book.bookId, shown.offer.disclosureDigest!, 'prospective', runtime());
      expect([enrolled.state, enrolled.stateLabel, enrolled.enrollment?.ordinal, enrolled.enrollment?.name, enrolled.enrollment?.startingPoint])
        .toEqual(['active', '已登记', 1, '后台分析登记 · 第 1 版', 'prospective']);
      expect(enrolled.enrollment!.binds).toEqual(shown.offer.binds);
      expect([enrolled.history.map((entry) => [entry.state, entry.ordinal]), enrolled.historyCount]).toEqual([[['active', 1]], 1]);
      expect([enrolled.offer.canEnroll, enrolled.revoke.canRevoke]).toEqual([false, true]);
      // The same confirmation twice answers as once; another one while it is in force is refused.
      expect(store.enrollBackgroundAnalysis(book.bookId, shown.offer.disclosureDigest!, 'prospective', runtime()).enrollment!.enrollmentVersionId)
        .toBe(enrolled.enrollment!.enrollmentVersionId);
      expect(await refusal(() => store.enrollBackgroundAnalysis(book.bookId, shown.offer.disclosureDigest!, 'backfill', runtime())))
        .toBe('BACKGROUND_ANALYSIS_ENROLLMENT_UNAVAILABLE');
      // Prospective, over a current analysis: nothing to do.
      expect(enrolled.next).toEqual({ kind: 'none', reason: BACKGROUND_CURRENT });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('starts one exact Task of its own after a change has stood still, naming the enrollment version, and keeps the Book current', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 后台同步');
      const enrolled = enroll(store, book.bookId, 'prospective');
      const before = store.inspectBaselineAnalysis(book.bookId, () => null);
      edit(store, book, '〔后台分析前的改动〕');
      const clock = { now: Date.now() };
      const dispatcher = dispatcherOf(store, owner, clock);
      // Just edited: it waits for the manuscript to stand still, and records nothing; the look is remembered for ②A.
      expect(store.backgroundAnalysisDecisionFor(book.bookId, dispatcher.runtime()).decision).toEqual({ kind: 'wait', reason: backgroundQuietReason(QUIET_MS) });
      await pass(dispatcher, owner);
      expect(store.inspectBaselineAnalysis(book.bookId, () => null).taskIntent!.taskIntentId).toBe(before.taskIntent!.taskIntentId);
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, dispatcher.runtime()).lastLook)
        .toMatchObject({ kind: 'wait', reason: backgroundQuietReason(QUIET_MS) });
      // While every place is taken it waits too, and while the editor's job runs it never steps in beside it.
      clock.now += 2 * QUIET_MS;
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime({ now: clock.now, placeFree: false })).decision)
        .toEqual({ kind: 'wait', reason: BACKGROUND_PLACE_BUSY });
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime({ now: clock.now, editorWorkBusy: true })).decision)
        .toEqual({ kind: 'wait', reason: BACKGROUND_EDITOR_JOB });
      expect(store.backgroundAnalysisDecisionFor(book.bookId, dispatcher.runtime()).decision)
        .toEqual({ kind: 'start', mode: 'sync-current', reason: BACKGROUND_START_SYNC });
      await pass(dispatcher, owner);
      const after = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect(after.taskIntent!.taskIntentId).not.toBe(before.taskIntent!.taskIntentId);
      expect(after.taskIntent!.mode).toBe('sync-current');
      expect(after.taskIntent!.preparedByEnrollmentVersionId).toBe(enrolled.enrollment!.enrollmentVersionId);
      expect(after.authorization).toMatchObject({ origin: 'background-analysis-enrollment', ruleVersionId: null, enrollmentVersionId: enrolled.enrollment!.enrollmentVersionId });
      expect(after.run!.transitions[0]).toMatchObject({ state: 'authorized', detail: BACKGROUND_AUTHORIZED_DETAIL });
      expect(after.run!.transitions[1]).toMatchObject({ state: 'admitted' });
      expect(['completed', 'completed-with-gaps']).toContain(after.run!.state);
      expect(after.resultSetRevision!.ordinal).toBe(2);
      expect(after.resultSetRevision!.freshness.state).toBe('current');
      const read = store.inspectBackgroundAnalysisEnrollment(book.bookId, dispatcher.runtime());
      expect(read.startedRuns).toEqual([{ taskIntentId: after.taskIntent!.taskIntentId, modeLabel: '同步到当前稿件', enrollmentOrdinal: 1, authorizedAt: after.authorization!.authorizedAt }]);
      expect([read.startedRunCount, read.next, read.lastNotStarted]).toEqual([1, { kind: 'none', reason: BACKGROUND_CURRENT }, null]);
      // A second pass starts nothing more: the Book is current.
      await pass(dispatcher, owner);
      expect(store.inspectBaselineAnalysis(book.bookId, () => null).taskIntent!.taskIntentId).toBe(after.taskIntent!.taskIntentId);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('revoking stops every start after it, keeps the Runs and results it started, and enrolling again is the next version', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 撤销登记');
      const enrolled = enroll(store, book.bookId, 'prospective');
      edit(store, book, '〔第一次改动〕');
      const clock = { now: Date.now() + 2 * QUIET_MS };
      const dispatcher = dispatcherOf(store, owner, clock);
      await pass(dispatcher, owner);
      const started = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect(started.authorization!.origin).toBe('background-analysis-enrollment');
      const recorded = authorizations();

      expect(await refusal(() => store.revokeBackgroundAnalysisEnrollment(book.bookId, randomUUID(), runtime()))).toBe('BACKGROUND_ANALYSIS_ENROLLMENT_NOT_FOUND');
      const revoked = store.revokeBackgroundAnalysisEnrollment(book.bookId, enrolled.enrollment!.enrollmentId, runtime());
      expect([revoked.state, revoked.stateLabel, revoked.next]).toEqual(['revoked', '已撤销', { kind: 'stopped', reason: BACKGROUND_REVOKED }]);
      expect(revoked.history.map((entry) => [entry.state, entry.ordinal])).toEqual([['revoked', 1], ['active', 1]]);
      // Revoking twice answers as once.
      expect(store.revokeBackgroundAnalysisEnrollment(book.bookId, enrolled.enrollment!.enrollmentId, runtime()).historyCount).toBe(2);

      // Another change, well past the quiet period: nothing starts, and the look says why.
      edit(store, book, '〔撤销后的改动〕');
      clock.now += 4 * QUIET_MS;
      await pass(dispatcher, owner);
      const after = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect(after.taskIntent!.taskIntentId).toBe(started.taskIntent!.taskIntentId);
      expect(after.resultSetRevision!.freshness.state).toBe('stale');
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).lastLook).toMatchObject({ kind: 'stopped', reason: BACKGROUND_REVOKED });
      // History intact: the Run it started still names its version, every authorization byte for byte.
      expect(authorizations()).toEqual(recorded);
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).startedRuns.map((run) => run.enrollmentOrdinal)).toEqual([1]);
      expect(after.resultSetRevision!.ordinal).toBe(2);

      // A start the dispatcher decided under the revoked version records nothing.
      expect(store.startEnrolledBaselineAnalysis(book.bookId, randomUUID(), 'a'.repeat(64), enrolled.enrollment!.enrollmentVersionId, 'sync-current', runtime()))
        .toEqual({ dispatchRunRecordId: null, reason: BACKGROUND_REVOKED });

      // Enrolling again is a new decision, the next version.
      const again = enroll(store, book.bookId, 'backfill');
      expect([again.state, again.enrollment!.ordinal, again.enrollment!.startingPoint]).toEqual(['active', 2, 'backfill']);
      expect(again.history.map((entry) => [entry.state, entry.ordinal])).toEqual([['active', 2], ['revoked', 1], ['active', 1]]);
      // The revoked version names no start even with a version in force: a start names the one in force, or nothing.
      expect(store.startEnrolledBaselineAnalysis(book.bookId, randomUUID(), 'a'.repeat(64), enrolled.enrollment!.enrollmentVersionId, 'sync-current', runtime()))
        .toEqual({ dispatchRunRecordId: null, reason: BACKGROUND_REVOKED });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('a backfill Enrollment starts a Book that was never analysed with its first baseline; prospective waits for a change', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const waiting = await importedBook(store, 'L2 sample1 只分析之后');
      const backfill = await importedBook(store, 'L2 sample1 现在也分析');
      enroll(store, waiting.bookId, 'prospective');
      enroll(store, backfill.bookId, 'backfill');
      expect(store.backgroundAnalysisDecisionFor(waiting.bookId, runtime()).decision).toEqual({ kind: 'none', reason: BACKGROUND_NOT_MOVED });
      const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS });
      await pass(dispatcher, owner);
      const first = store.inspectBaselineAnalysis(backfill.bookId, () => null);
      expect(first.taskIntent!.mode).toBe('first-baseline');
      expect(first.authorization!.origin).toBe('background-analysis-enrollment');
      expect(first.state).toBe('settled');
      expect(store.inspectBaselineAnalysis(waiting.bookId, () => null).taskIntent).toBeNull();
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('leaves one place for the editor: a background Run waits while another holds the share', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const one = await importedBook(store, 'L2 sample1 名额甲');
      const two = await importedBook(store, 'L2 sample1 名额乙');
      enroll(store, one.bookId, 'backfill');
      enroll(store, two.bookId, 'backfill');
      // The first Book's background Run is started and left waiting for its place, as one admitted and not yet finished holds it.
      const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }, {
        execution: { busy: false, routeExecutable: true, capacity: 2, admitOrQueue: () => 'queued' },
      });
      dispatcher.nudge();
      await dispatcher.settled();
      expect(store.inspectBaselineAnalysis(one.bookId, () => null).run!.state).toBe('authorized');
      // The second waits: background Runs take at most capacity − 1 places.
      expect(store.inspectBaselineAnalysis(two.bookId, () => null).taskIntent).toBeNull();
      expect(store.backgroundAnalysisDecisionFor(two.bookId, runtime()).decision).toEqual({ kind: 'wait', reason: backgroundShareFullReason(1) });
      store.cancelWaitingBaselineAnalysis(one.bookId, store.inspectBaselineAnalysis(one.bookId, () => null).taskIntent!.taskIntentId);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('never starts under developer-live, without a route, beside the editor\'s own plan or Run, or twice over the same text', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 后台不开始');
      enroll(store, book.bookId, 'prospective');
      edit(store, book, '〔改动〕');
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime({ routeExecutable: false })).decision).toEqual({ kind: 'stopped', reason: BACKGROUND_NO_ROUTE });
      // Developer-live: neither an Enrollment nor a start (Provider Processing v5: backgroundAnalysisEnrollmentAllowed false).
      store.baselineAnalysisLedger.bindLaunch(LIVE);
      const live = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime());
      expect(live.next).toEqual({ kind: 'stopped', reason: BACKGROUND_DEVELOPER_LIVE });
      expect(store.startEnrolledBaselineAnalysis(book.bookId, randomUUID(), 'a'.repeat(64), live.enrollment!.enrollmentVersionId, 'sync-current', runtime()))
        .toEqual({ dispatchRunRecordId: null, reason: BACKGROUND_DEVELOPER_LIVE });
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });

      // A plan the editor prepared and has not started is theirs: the Enrollment waits, and never starts it.
      const prepared = prepare(store, book.bookId, 'reanalyze-book');
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision).toEqual({ kind: 'wait', reason: BACKGROUND_TASK_PREPARED });
      expect(await refusal(() => store.startEnrolledBaselineAnalysis(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest,
        live.enrollment!.enrollmentVersionId, 'sync-current', runtime()))).toBe('BACKGROUND_ANALYSIS_START_INVALID');
      expect(await refusal(() => store.createBackgroundBaselineAnalysisPreparationWork(book.bookId, 'sync-current', live.enrollment!.enrollmentVersionId, launchPolicy)))
        .toBe('ANALYSIS_TASK_PREPARED');
      const authorized = store.authorizeBaselineAnalysis(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(authorized.dispatchRunRecordId).not.toBeNull();
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision).toEqual({ kind: 'wait', reason: BACKGROUND_TASK_RUNNING });
      owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.baselineAnalysisLedger);
      await owner.whenIdle();

      // The Enrollment's own Run cancelled before it began: the same text is not tried again until it changes.
      edit(store, book, '〔再改动〕');
      const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }, {
        // A governor whose places are free for the decision, but which leaves the start waiting for one.
        execution: { busy: false, routeExecutable: true, capacity: 2, admitOrQueue: () => 'queued' },
      });
      dispatcher.nudge();
      await dispatcher.settled();
      const waitingRun = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect([waitingRun.authorization!.origin, waitingRun.run!.state]).toEqual(['background-analysis-enrollment', 'authorized']);
      store.cancelWaitingBaselineAnalysis(book.bookId, waitingRun.taskIntent!.taskIntentId);
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision).toEqual({ kind: 'wait', reason: BACKGROUND_ATTEMPTED });
      edit(store, book, '〔又改动〕');
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision.kind).toBe('start');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('never redoes the editor\'s own cancelled Task, keeping its 改计划重做: it acts only on edits made after it (P2-4)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 编辑取消');
      edit(store, book, '〔改动〕');
      enroll(store, book.bookId, 'backfill');
      // The editor starts 同步到当前稿件 and cancels it while it waits. The Enrollment never starts the editor's plan, even of its mode.
      const own = prepare(store, book.bookId, 'sync-current');
      const version = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).enrollment!.enrollmentVersionId;
      expect(await refusal(() => store.startEnrolledBaselineAnalysis(book.bookId, own.taskIntent!.taskIntentId, own.planEnvelope!.digest, version,
        'sync-current', runtime()))).toBe('BACKGROUND_ANALYSIS_START_INVALID');
      expect(backgroundOrigins()).toBe(0);
      store.authorizeBaselineAnalysis(book.bookId, own.taskIntent!.taskIntentId, own.planEnvelope!.digest);
      store.cancelWaitingBaselineAnalysis(book.bookId, own.taskIntent!.taskIntentId);
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision).toEqual({ kind: 'none', reason: BACKGROUND_EDITOR_TASK });
      await pass(dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }), owner);
      expect(store.inspectBaselineAnalysis(book.bookId, () => null).taskIntent!.taskIntentId).toBe(own.taskIntent!.taskIntentId);
      // A further edit is the editor's new change: now the Enrollment may bring it up to date.
      edit(store, book, '〔之后的改动〕');
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision.kind).toBe('start');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('a checkpoint another Task takes never clears the quiet period: it counts from the latest edit, whatever revision (P2-1)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 安静期');
      enroll(store, book.bookId, 'prospective');
      edit(store, book, '〔刚改动〕');
      let j03 = store.createTaskAuthorizationPreparationWork(book.bookId, J03_TASK_GOAL, launchPolicy);
      while (!j03.done) j03 = store.advanceTaskAuthorizationPreparationWork(j03.workId!);
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime({ now: Date.now() })).decision).toEqual({ kind: 'wait', reason: backgroundQuietReason(QUIET_MS) });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('a background step that fails leaves nothing behind: the editor\'s 先看计划, 重新导入, J-03 and 审阅 all work after (P1-1)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 后台失败');
      enroll(store, book.bookId, 'prospective');
      edit(store, book, '〔改动〕');
      const clock = { now: Date.now() + 2 * QUIET_MS };
      // The editor types while the background checkpoint is being built; with no quiet period left to ask about, the step fails.
      let typed = false;
      const dispatcher = dispatcherOf(store, owner, clock, {
        quietMs: 0,
        yieldStep: async () => {
          if (!typed) edit(store, book, '〔准备中又改动〕');
          typed = true;
        },
      });
      await pass(dispatcher, owner);
      expect(typed).toBe(true);
      expect(backgroundOrigins()).toBe(0);
      expect(store.baselineAnalysisLedger.preparationInFlight(book.bookId)).toBe(false);
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).lastNotStarted)
        .toMatchObject({ reason: backgroundNotStartedReason(BACKGROUND_CHECKPOINT_PREEMPTED) });
      // Every preparation the editor makes on the Book works at once: nothing holds its checkpoint.
      const editorsOwn = prepare(store, book.bookId, 'reanalyze-book');
      expect(editorsOwn.state).toBe('prepared');
      let j03 = store.createTaskAuthorizationPreparationWork(book.bookId, J03_TASK_GOAL, launchPolicy);
      while (!j03.done) j03 = store.advanceTaskAuthorizationPreparationWork(j03.workId!);
      let review = store.createReviewRunPreparationWork(book.bookId, [TYPOS_AND_USAGE.categoryId], WHOLE, launchPolicy);
      while (!review.done) review = store.advanceReviewRunPreparationWork(review.workId!);
      edit(store, book, '〔重新导入前的改动〕');
      const staged = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
      const reimport = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, {
        kind: 'existing-book', bookId: book.bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' },
        reuseSourceVersionId: withDatabase(true, (database) => String((database.prepare('SELECT source_version_id FROM source_versions WHERE book_id = ?').get(book.bookId) as Row).source_version_id)),
      });
      let reimported = store.advanceManuscriptReimportPreparationWork(reimport.workId);
      while (!reimported.done) reimported = store.advanceManuscriptReimportPreparationWork(reimport.workId);
      expect(reimported.review).not.toBeNull();
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('a background preparation the next step may not take is cancelled with why, and a later pass starts cleanly', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 后台让开');
      enroll(store, book.bookId, 'prospective');
      edit(store, book, '〔改动〕');
      const clock = { now: Date.now() + 2 * QUIET_MS };
      let typed = false;
      const dispatcher = dispatcherOf(store, owner, clock, {
        yieldStep: async () => {
          if (!typed) {
            edit(store, book, '〔准备中又改动〕');
            clock.now = Date.now();
          }
          typed = true;
        },
      });
      await pass(dispatcher, owner);
      expect(backgroundOrigins()).toBe(0);
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).lastNotStarted)
        .toMatchObject({ reason: backgroundNotStartedReason(backgroundQuietReason(QUIET_MS)) });
      // The Enrollment's intent is left as its own, never the editor's; once the text stands still it starts anew.
      clock.now = Date.now() + 2 * QUIET_MS;
      await pass(dispatcherOf(store, owner, clock), owner);
      const started = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect([started.authorization?.origin, started.state]).toEqual(['background-analysis-enrollment', 'settled']);
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).lastNotStarted).toBeNull();
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('never adopts the editor\'s preparation in flight, in the same mode or another (P1-2)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      for (const mode of ['sync-current', 'reanalyze-book'] as const) {
        const book = await analysedBook(store, owner, `L2 sample1 编辑在前 ${mode}`);
        enroll(store, book.bookId, 'prospective');
        edit(store, book, '〔改动〕');
        // The editor clicks 先看计划: their checkpoint is still being built.
        const started = store.createBaselineAnalysisPreparationWork(book.bookId, BASELINE_ANALYSIS_MODE_GOALS[mode], { mode, selectedRange: null }, launchPolicy);
        expect(started.done).toBe(false);
        expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision).toEqual({ kind: 'wait', reason: BACKGROUND_PREPARATION_IN_FLIGHT });
        const enrolledVersion = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).enrollment!.enrollmentVersionId;
        expect(await refusal(() => store.createBackgroundBaselineAnalysisPreparationWork(book.bookId, 'sync-current', enrolledVersion, launchPolicy)))
          .toBe('ANALYSIS_PREPARATION_IN_FLIGHT');
        const intentsBefore = withDatabase(true, (database) => (database.prepare('SELECT count(*) n FROM analysis_task_intents WHERE book_id = ?').get(book.bookId) as Row).n);
        await pass(dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }), owner);
        expect(withDatabase(true, (database) => (database.prepare('SELECT count(*) n FROM analysis_task_intents WHERE book_id = ?').get(book.bookId) as Row).n))
          .toBe(intentsBefore);
        // The editor's preparation goes on to its own plan, never started, never marked as the Enrollment's.
        let progress = started;
        while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
        const theirs = store.inspectBaselineAnalysis(book.bookId, () => null);
        expect([theirs.state, theirs.taskIntent!.mode, theirs.authorization, theirs.taskIntent!.preparedByEnrollmentVersionId]).toEqual(['prepared', mode, null, undefined]);
      }
      expect(backgroundOrigins()).toBe(0);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('never takes up a Task Intent the editor left behind: a preparation they cancelled stays theirs (P1-2)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 编辑取消准备');
      enroll(store, book.bookId, 'prospective');
      edit(store, book, '〔改动〕');
      // The editor clicks 先看计划 for 同步到当前稿件 and cancels it while its checkpoint is built: their Task Intent stays, planless.
      const started = store.createBaselineAnalysisPreparationWork(book.bookId, BASELINE_ANALYSIS_MODE_GOALS['sync-current'], { mode: 'sync-current', selectedRange: null }, launchPolicy);
      expect(started.done).toBe(false);
      store.cancelBaselineAnalysisPreparationWork(started.workId!);
      const orphan = store.inspectBaselineAnalysis(book.bookId, () => null).taskIntent!.taskIntentId;
      // Even a preparation the editor cancelled is their latest Task: the Enrollment waits for an edit made after it.
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision).toEqual({ kind: 'none', reason: BACKGROUND_EDITOR_TASK });
      edit(store, book, '〔取消之后的改动〕');
      await pass(dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }), owner);
      const after = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect(after.taskIntent!.taskIntentId).not.toBe(orphan);
      expect([after.authorization?.origin, after.taskIntent!.preparedByEnrollmentVersionId !== undefined, after.state]).toEqual(['background-analysis-enrollment', true, 'settled']);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('gives way to a preparation the editor starts while its own is in flight, in the same mode or another (P1-2)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      for (const mode of ['sync-current', 'reanalyze-book'] as const) {
        const book = await analysedBook(store, owner, `L2 sample1 后台在前 ${mode}`);
        enroll(store, book.bookId, 'prospective');
        edit(store, book, '〔改动〕');
        let editorsWork: ReturnType<EditorialStore['createBaselineAnalysisPreparationWork']> | null = null;
        let backgroundIntent: string | null = null;
        let backgroundLeftAtOnce = false;
        const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }, {
          yieldStep: async () => {
            if (editorsWork !== null) return;
            backgroundIntent = store.inspectBaselineAnalysis(book.bookId, () => null).taskIntent!.taskIntentId;
            // The editor clicks 先看计划 while the background checkpoint is being built: the background preparation stops at once.
            editorsWork = store.createBaselineAnalysisPreparationWork(book.bookId, BASELINE_ANALYSIS_MODE_GOALS[mode], { mode, selectedRange: null }, launchPolicy);
            backgroundLeftAtOnce = !store.baselineAnalysisLedger.preparationInFlightBesides(book.bookId, editorsWork.workId);
          },
        });
        await pass(dispatcher, owner);
        expect(editorsWork).not.toBeNull();
        expect(backgroundLeftAtOnce).toBe(true);
        expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).lastNotStarted)
          .toMatchObject({ reason: backgroundNotStartedReason(BACKGROUND_PREPARATION_IN_FLIGHT) });
        let progress = editorsWork!;
        while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
        const theirs = store.inspectBaselineAnalysis(book.bookId, () => null);
        // The editor's plan is their own Task, the latest and on show; the background's was stopped and is never reused.
        expect(theirs.taskIntent!.taskIntentId).not.toBe(backgroundIntent);
        expect([theirs.state, theirs.taskIntent!.mode, theirs.authorization, theirs.taskIntent!.preparedByEnrollmentVersionId]).toEqual(['prepared', mode, null, undefined]);
        expect(store.baselineAnalysisLedger.preparationInFlight(book.bookId)).toBe(false);
      }
      expect(backgroundOrigins()).toBe(0);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('its checkpoint gives way to one another kind of Task asks for, which goes ahead at once (P1-2)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 固定点让开');
      enroll(store, book.bookId, 'prospective');
      edit(store, book, '〔改动〕');
      let j03: ReturnType<EditorialStore['createTaskAuthorizationPreparationWork']> | null = null;
      let refused: unknown = null;
      const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }, {
        yieldStep: async () => {
          if (j03 !== null || refused !== null) return;
          // The editor asks J-03's preparation of the same Book while the background checkpoint is being built.
          try {
            j03 = store.createTaskAuthorizationPreparationWork(book.bookId, J03_TASK_GOAL, launchPolicy);
          } catch (error) {
            refused = error;
          }
        },
      });
      await pass(dispatcher, owner);
      expect(refused).toBeNull();
      let progress = j03!;
      while (!progress.done) progress = store.advanceTaskAuthorizationPreparationWork(progress.workId!);
      expect(backgroundOrigins()).toBe(0);
      expect(store.baselineAnalysisLedger.preparationInFlight(book.bookId)).toBe(false);
      // ②A says, in the editor's words, that the background gave way — never the engineering code.
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).lastNotStarted)
        .toMatchObject({ reason: backgroundNotStartedReason(BACKGROUND_CHECKPOINT_PREEMPTED) });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('refuses at the start what the decision could not see: a Plan Revision, a binding that moved, a plan with no route (P2-5)', async () => {
    const store = await openWithRoute(false);
    try {
      const reference = recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await importedBook(store, 'L2 sample1 开始前复核');
      const version = enroll(store, book.bookId, 'backfill').enrollment!.enrollmentVersionId;
      const before = authorizations();
      const backgroundPlan = (): BaselineAnalysisProjection => {
        let progress = store.createBackgroundBaselineAnalysisPreparationWork(book.bookId, 'first-baseline', version, launchPolicy);
        while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
        return progress.projection!;
      };
      // No route this launch can execute: the frozen plan dispatches nothing, and the start says so.
      const plan = backgroundPlan();
      expect(plan.taskIntent!.preparedByEnrollmentVersionId).toBe(version);
      expect(store.startEnrolledBaselineAnalysis(book.bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest, version, 'first-baseline', runtime()))
        .toEqual({ dispatchRunRecordId: null, reason: BACKGROUND_NO_ROUTE });
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).lastNotStarted)
        .toMatchObject({ reason: backgroundNotStartedReason(BACKGROUND_NO_ROUTE) });
      // The plan is the Enrollment's, not the editor's: the decision does not wait on it as the editor's own.
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision.reason).not.toBe(BACKGROUND_TASK_PREPARED);
      // A Plan Revision appeared since the plan froze: the connection now names another credential reference.
      expect(reference).toMatch(/^[0-9a-f-]{36}$/u);
      withDatabase(false, (database) => database.prepare('UPDATE model_service_connections SET credential_reference = ?').run(randomUUID()));
      expect(store.startEnrolledBaselineAnalysis(book.bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest, version, 'first-baseline', runtime()))
        .toEqual({ dispatchRunRecordId: null, reason: QUICK_START_PLAN_CHANGED });
      // What the Enrollment binds moved, and the plan froze the new binding: the start refuses the drift itself.
      const moved = backgroundPlan();
      const drift = store.startEnrolledBaselineAnalysis(book.bookId, moved.taskIntent!.taskIntentId, moved.planEnvelope!.digest, version, 'first-baseline', runtime());
      expect(drift.dispatchRunRecordId).toBeNull();
      expect(drift.reason).toBe(backgroundDriftReason(['模型服务 · 连接']));
      expect(authorizations()).toEqual(before);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('a damaged enrollment record stops only its own Book, said as damaged', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    let damagedBook = '';
    let soundBook = '';
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      damagedBook = (await importedBook(store, 'L2 sample1 登记损坏')).bookId;
      soundBook = (await importedBook(store, 'L2 sample1 登记完好')).bookId;
      enroll(store, damagedBook, 'backfill');
      enroll(store, soundBook, 'backfill');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
    withDatabase(false, (database) => {
      database.exec('DROP TRIGGER background_analysis_enrollment_states_no_update');
      database.prepare(`UPDATE background_analysis_enrollment_states SET canonical_json = '{}' WHERE enrollment_id =
        (SELECT enrollment_id FROM background_analysis_enrollments WHERE book_id = ?)`).run(damagedBook);
      database.exec(BACKGROUND_ANALYSIS_ENROLLMENT_TRIGGER_SQL.background_analysis_enrollment_states_no_update!);
    });
    const reopened = await openWithRoute();
    const reowner = ownerOf(reopened);
    try {
      const damaged = reopened.inspectBackgroundAnalysisEnrollment(damagedBook, runtime());
      expect([damaged.state, damaged.stateLabel, damaged.next, damaged.offer.canEnroll, damaged.revoke.canRevoke])
        .toEqual(['damaged', '登记记录无法读取', { kind: 'stopped', reason: BACKGROUND_RECORD_DAMAGED }, false, false]);
      expect(reopened.backgroundAnalysisBooks()).toEqual([damagedBook, soundBook]);
      await pass(dispatcherOf(reopened, reowner, { now: Date.now() + 2 * QUIET_MS }), reowner);
      expect(reopened.inspectBaselineAnalysis(soundBook, () => null).authorization?.origin).toBe('background-analysis-enrollment');
      expect(reopened.inspectBaselineAnalysis(damagedBook, () => null).taskIntent).toBeNull();
      // The ledger's own list of Enrollments in force leaves the damaged one out rather than failing for every Book.
      expect(withDatabase(true, (database) => new BackgroundAnalysisEnrollmentLedger(database).active().map((record) => record.bookId))).toEqual([soundBook]);
    } finally {
      await reowner.dispose();
      reopened.close();
    }
  }, 300_000);

  it('data replaced from a package never brings an Enrollment back into force: it comes up waiting for the editor (P3-1)', async () => {
    const T = new Date(2026, 8, 25, 10, 0, 0);
    const store = await openWithRoute();
    let bookId = '';
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      bookId = (await importedBook(store, 'L2 sample1 替换数据')).bookId;
      enroll(store, bookId, 'backfill');
      const destination = join(roots.inputRoot, 'AI7 数据库.ai7db');
      const preparation = await store.prepareDatabaseExport(destination, true);
      expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
      // Revoked after the package was made: the package still holds it in force.
      const enrollmentId = store.inspectBackgroundAnalysisEnrollment(bookId, runtime()).enrollment!.enrollmentId;
      store.revokeBackgroundAnalysisEnrollment(bookId, enrollmentId, runtime());
      const preview = await store.inspectDatabaseImport(destination);
      await store.prepareDatabaseReplacement(preview.previewId, T);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const replaced = await openWithRoute();
    try {
      const read = replaced.inspectBackgroundAnalysisEnrollment(bookId, runtime());
      expect([read.state, read.stateLabel, read.next, read.offer.canEnroll, read.revoke.canRevoke])
        .toEqual(['suspended', '待你确认', { kind: 'stopped', reason: BACKGROUND_SUSPENDED }, true, true]);
      expect(read.history.map((entry) => entry.state)).toEqual(['suspended', 'active']);
      // Confirming it is a new decision of the editor's: the next version.
      const confirmed = replaced.enrollBackgroundAnalysis(bookId, read.offer.disclosureDigest!, 'prospective', runtime());
      expect([confirmed.state, confirmed.enrollment!.ordinal]).toEqual(['active', 2]);
      replaced.markCleanShutdown();
    } finally {
      replaced.close();
    }
  }, 300_000);

  it('refuses to enroll under developer-live, keeps its ledger append-only, and stays the house\'s when Books merge', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await importedBook(store, 'L2 sample1 登记不变');
      enroll(store, book.bookId, 'backfill');
      const other = await importedBook(store, 'L2 sample1 开发者实时登记');
      store.baselineAnalysisLedger.bindLaunch(LIVE);
      const shown = store.inspectBackgroundAnalysisEnrollment(other.bookId, runtime());
      expect([shown.offer.canEnroll, shown.offer.reason, shown.offer.disclosureDigest]).toEqual([false, BACKGROUND_ENROLL_DEVELOPER_LIVE, null]);
      expect(await refusal(() => store.enrollBackgroundAnalysis(other.bookId, 'a'.repeat(64), 'backfill', runtime()))).toBe('BACKGROUND_ANALYSIS_ENROLLMENT_UNAVAILABLE');
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
    withDatabase(false, (database) => {
      for (const table of Object.keys(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL)) {
        expect(() => database.exec(`UPDATE ${table} SET canonical_json = canonical_json`)).toThrow(/BACKGROUND_ANALYSIS_ENROLLMENT_IMMUTABLE/u);
        expect(() => database.exec(`DELETE FROM ${table}`)).toThrow(/BACKGROUND_ANALYSIS_ENROLLMENT_IMMUTABLE/u);
      }
      // A suspension is AI7's alone; every other state is the editor's.
      expect(() => database.exec(`INSERT INTO background_analysis_enrollment_states(enrollment_id, sequence, state, enrollment_version_id, actor, recorded_at, canonical_json, sha256)
        SELECT enrollment_id, 99, 'suspended', enrollment_version_id, '本机编辑', recorded_at, canonical_json, '${'c'.repeat(64)}' FROM background_analysis_enrollment_states LIMIT 1`))
        .toThrow(/CHECK/u);
      // The ledger itself enrolls a Book in force only by the confirmation that put it there: any other is refused.
      const ledger = new BackgroundAnalysisEnrollmentLedger(database);
      const [active] = ledger.active();
      expect(active).toBeDefined();
      const input = { bookId: active!.bookId, startingPoint: active!.version.startingPoint, binding: active!.version.binding,
        enrolledAt: active!.version.enrolledAt, disclosureDigest: active!.version.disclosureDigest };
      expect(ledger.enroll(input).version.enrollmentVersionId).toBe(active!.version.enrollmentVersionId);
      expect(() => ledger.enroll({ ...input, disclosureDigest: 'b'.repeat(64) })).toThrow(/已经登记了后台分析/u);
      expect(() => ledger.enroll({ ...input, startingPoint: 'prospective' })).toThrow(/已经登记了后台分析/u);
      expect(ledger.history(active!.bookId, 10).count).toBe(1);
    });
    // Merging a Book from another house never brings its Enrollment.
    for (const table of Object.keys(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL)) expect(MERGE_TABLE_POLICY[table]).toBe('house');
  }, 300_000);

  it('starts nothing, and writes nothing, on a manuscript waiting on a deferred recovery, and says why (re-review P2-1)', async () => {
    let book: Imported | null = null;
    const interrupted = await openWithRoute();
    const firstOwner = ownerOf(interrupted);
    try {
      recordMissingCredentialConnection(interrupted, 'L2 主编辑连接');
      book = await analysedBook(interrupted, firstOwner, 'L2 sample1 恢复待确认');
      enroll(interrupted, book.bookId, 'prospective');
      edit(interrupted, book, '〔关闭前的改动〕');
    } finally {
      // No clean shutdown: the service lifetime stays running, as an interrupted product leaves it.
      await firstOwner.dispose();
      interrupted.close();
    }
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      const startup = await store.getStartup();
      expect(startup.state).toBe('manuscript-recovery');
      if (startup.state !== 'manuscript-recovery') throw new Error('unreachable');
      expect((await store.deferRecovery(startup.recovery.attentionId, startup.recovery.attentionVersion)).status).toBe('deferred');
      const intents = intentCount(book!.bookId);
      const before = store.inspectBaselineAnalysis(book!.bookId, () => null);
      const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS });
      for (let round = 0; round < 6; round += 1) await pass(dispatcher, owner);
      // Not one Task Intent, plan or Run: the Book's latest Task and its Run card are the editor's, as they were.
      expect(intentCount(book!.bookId)).toBe(intents);
      expect(backgroundOrigins()).toBe(0);
      expect(store.inspectBaselineAnalysis(book!.bookId, () => null).taskIntent).toEqual(before.taskIntent);
      const read = store.inspectBackgroundAnalysisEnrollment(book!.bookId, runtime());
      expect(read.next).toEqual({ kind: 'wait', reason: BACKGROUND_RECOVERY_PENDING });
      expect(read.lastLook).toMatchObject({ kind: 'wait', reason: BACKGROUND_RECOVERY_PENDING });
      // Even asked directly, a background preparation there writes nothing.
      expect(await refusal(() => store.createBackgroundBaselineAnalysisPreparationWork(book!.bookId, 'sync-current', read.enrollment!.enrollmentVersionId, launchPolicy)))
        .toBe('RECOVERY_ATTENTION_REQUIRED');
      expect(intentCount(book!.bookId)).toBe(intents);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('a background preparation that stops leaves no Task Intent: the editor\'s cancelled Run stays the latest, with 改计划重做 (re-review P3-1)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    const holdPath = join(roots.inputRoot, 'unit-hold.txt');
    const held = new BaselineAnalysisExecutionOwner({
      ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null },
      unitHold: controlledUnitHold(holdPath, { pollMs: 5 }),
    });
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 编辑的取消留在最前');
      enroll(store, book.bookId, 'prospective');
      // The editor's own 重新分析全书, cancelled once it has read a range: its Run keeps 改计划重做.
      const own = prepare(store, book.bookId, 'reanalyze-book');
      const authorized = store.authorizeBaselineAnalysis(book.bookId, own.taskIntent!.taskIntentId, own.planEnvelope!.digest);
      const runRecordId = authorized.dispatchRunRecordId!;
      writeFileSync(holdPath, '1');
      held.admitAndDispatch(runRecordId, store.baselineAnalysisLedger);
      for (let tries = 0; (held.progressFor(runRecordId)?.unitsSettled ?? 0) < 1 && tries < 2_000; tries += 1) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      }
      expect(store.requestBaselineAnalysisCancel(book.bookId, own.taskIntent!.taskIntentId)).toBe(runRecordId);
      held.cancelRun(runRecordId, store.baselineAnalysisLedger);
      writeFileSync(holdPath, '99');
      await held.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect(cancelled.run?.state).toBe('cancelled');
      // An edit after it, so the Enrollment may act; the editor types again while the background checkpoint is built.
      edit(store, book, '〔取消之后的改动〕');
      const intents = intentCount(book.bookId);
      const clock = { now: Date.now() + 2 * QUIET_MS };
      let typed = false;
      await pass(dispatcherOf(store, owner, clock, {
        yieldStep: async () => {
          if (typed) return;
          typed = true;
          edit(store, book, '〔准备中又改动〕');
          clock.now = Date.now();
        },
      }), owner);
      expect(typed).toBe(true);
      expect(intentCount(book.bookId)).toBe(intents);
      const after = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect([after.taskIntent!.taskIntentId, after.run!.runRecordId, after.run!.state]).toEqual([own.taskIntent!.taskIntentId, runRecordId, 'cancelled']);
      // 改计划重做 is still the editor's to take.
      let redo = store.createBaselineAnalysisPreparationWork(book.bookId, BASELINE_ANALYSIS_MODE_GOALS['sync-current'], { mode: 'sync-current', selectedRange: null },
        launchPolicy, false, runRecordId);
      while (!redo.done) redo = store.advanceBaselineAnalysisPreparationWork(redo.workId!);
      expect(redo.projection!.taskIntent!.redoOf?.runRecordId).toBe(runRecordId);
      store.markCleanShutdown();
    } finally {
      await held.dispose();
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('stops a preparation under way at the next step, writing nothing, when the Enrollment is revoked, a replacement waits, or the editor starts work (re-review P2-2)', async () => {
    const T = new Date(2026, 8, 25, 10, 0, 0);
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const destination = join(roots.inputRoot, 'AI7 数据库.ai7db');
      const cases: Array<{ title: string; reason: string; during: (book: Imported) => Promise<void>; busy?: { value: boolean } }> = [
        {
          title: 'L2 sample1 准备中撤销', reason: BACKGROUND_REVOKED,
          during: async (book) => {
            const enrollmentId = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).enrollment!.enrollmentId;
            store.revokeBackgroundAnalysisEnrollment(book.bookId, enrollmentId, runtime());
          },
        },
        {
          title: 'L2 sample1 准备中有了编辑的操作', reason: BACKGROUND_EDITOR_JOB, busy: { value: false },
          during: async () => undefined,
        },
        {
          title: 'L2 sample1 准备中编辑先看计划', reason: BACKGROUND_PREPARATION_IN_FLIGHT,
          during: async (book) => {
            store.createBaselineAnalysisPreparationWork(book.bookId, BASELINE_ANALYSIS_MODE_GOALS['reanalyze-book'], { mode: 'reanalyze-book', selectedRange: null }, launchPolicy);
          },
        },
        {
          title: 'L2 sample1 准备中要替换数据', reason: BACKGROUND_REPLACEMENT_WAITING,
          during: async () => {
            const preparation = await store.prepareDatabaseExport(destination, true);
            expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
            const preview = await store.inspectDatabaseImport(destination);
            await store.prepareDatabaseReplacement(preview.previewId, T);
          },
        },
      ];
      for (const entry of cases) {
        const book = await analysedBook(store, owner, entry.title);
        enroll(store, book.bookId, 'prospective');
        edit(store, book, '〔改动〕');
        const intents = intentCount(book.bookId);
        const busy = entry.busy;
        let done = false;
        await pass(dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }, {
          ...(busy === undefined ? {} : { editorWorkBusy: () => busy.value }),
          yieldStep: async () => {
            if (done) return;
            done = true;
            if (busy !== undefined) busy.value = true;
            await entry.during(book);
          },
        }), owner);
        expect(done, entry.title).toBe(true);
        expect(backgroundOrigins(), entry.title).toBe(0);
        expect(store.baselineAnalysisLedger.preparationInFlightBesides(book.bookId, null) && entry.reason !== BACKGROUND_PREPARATION_IN_FLIGHT).toBe(false);
        // The editor's own preparation, if any, is theirs; nothing of the Enrollment's is written.
        expect(withDatabase(true, (database) => (database.prepare(
          "SELECT count(*) n FROM analysis_task_intents WHERE book_id = ? AND json_extract(canonical_json, '$.preparedByEnrollmentVersionId') IS NOT NULL",
        ).get(book.bookId) as Row).n)).toBe(0);
        expect(intentCount(book.bookId)).toBe(intents + (entry.reason === BACKGROUND_PREPARATION_IN_FLIGHT ? 1 : 0));
        const read = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime());
        expect(read.lastNotStarted, entry.title).toMatchObject({ reason: backgroundNotStartedReason(entry.reason) });
        // Each case's Book is left revoked, so the next case's dispatcher looks at its own Book alone.
        if (read.state === 'active') store.revokeBackgroundAnalysisEnrollment(book.bookId, read.enrollment!.enrollmentId, runtime());
      }
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('stops a preparation under way when another Book\'s background Run fills the share meanwhile (re-review P2-2)', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const first = await importedBook(store, 'L2 sample1 名额被占甲');
      const second = await importedBook(store, 'L2 sample1 名额被占乙');
      edit(store, first, '〔改动〕');
      enroll(store, first.bookId, 'backfill');
      const secondVersion = enroll(store, second.bookId, 'backfill').enrollment!.enrollmentVersionId;
      let filled = false;
      const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }, {
        execution: { busy: false, routeExecutable: true, capacity: 2, admitOrQueue: () => 'queued' },
        yieldStep: async () => {
          if (filled) return;
          filled = true;
          // 乙's background Run is recorded while 甲's preparation is under way: it takes the one place background may hold.
          let work = store.createBackgroundBaselineAnalysisPreparationWork(second.bookId, 'first-baseline', secondVersion, launchPolicy);
          while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
          store.startEnrolledBaselineAnalysis(second.bookId, work.projection!.taskIntent!.taskIntentId, work.projection!.planEnvelope!.digest, secondVersion, 'first-baseline', runtime());
        },
      });
      dispatcher.nudge();
      await dispatcher.settled();
      expect(filled).toBe(true);
      expect(store.inspectBaselineAnalysis(first.bookId, () => null).taskIntent).toBeNull();
      expect(store.inspectBackgroundAnalysisEnrollment(first.bookId, runtime()).lastNotStarted).toMatchObject({ reason: backgroundNotStartedReason(backgroundShareFullReason(1)) });
      store.cancelWaitingBaselineAnalysis(second.bookId, store.inspectBaselineAnalysis(second.bookId, () => null).taskIntent!.taskIntentId);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('data rolled back to the backup a replacement took never brings an Enrollment back into force either (re-review P2-2)', async () => {
    const T = new Date(2026, 8, 25, 10, 0, 0);
    const LATER = new Date(2026, 8, 25, 11, 0, 0);
    let bookId = '';
    let store = await openWithRoute();
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      bookId = (await importedBook(store, 'L2 sample1 回退数据')).bookId;
      enroll(store, bookId, 'backfill');
      const destination = join(roots.inputRoot, 'AI7 数据库.ai7db');
      const preparation = await store.prepareDatabaseExport(destination, true);
      expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
      const preview = await store.inspectDatabaseImport(destination);
      // The backup this replacement takes holds the Enrollment in force.
      await store.prepareDatabaseReplacement(preview.previewId, T);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    store = await openWithRoute();
    let replacementId = '';
    try {
      expect(store.inspectBackgroundAnalysisEnrollment(bookId, runtime()).state).toBe('suspended');
      replacementId = (await store.inspectDatabaseReplacements()).replacements[0]!.replacementId;
      await store.rollBackDatabaseReplacement(replacementId, LATER);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    store = await openWithRoute();
    try {
      expect((await store.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'roll-back', outcome: 'applied' });
      const read = store.inspectBackgroundAnalysisEnrollment(bookId, runtime());
      expect([read.state, read.next]).toEqual(['suspended', { kind: 'stopped', reason: BACKGROUND_SUSPENDED }]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('brings a revision-65 store to revision 66: three empty relations, the origin widened, every authorization of every origin byte for byte', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 修订版 65');
      // A 快速开始 under a 默认执行规则, so the rows copied carry both origins revision 65 admitted.
      const source = prepare(store, book.bookId, 'reanalyze-book');
      const rule = store.setDefaultExecutionRule(book.bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest);
      const quick = await store.quickStartBaselineAnalysis(book.bookId, source.taskIntent!.taskIntentId, source.planEnvelope!.digest, rule.ruleVersionId, {
        credentialReadiness: async () => null,
        connectivity: { reading: () => 'online', reachesNetwork: (route) => route === LOCAL_DETERMINISTIC_ROUTE, slotBusy: () => false, carriesStoppedRun: () => false },
      });
      expect(quick.outcome).toBe('started');
      owner.admitAndDispatch(quick.dispatchRunRecordId!, store.baselineAnalysisLedger);
      await owner.whenIdle();
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
    const before = withDatabase(false, (database) => {
      database.exec('PRAGMA foreign_keys = OFF');
      // A revision-65 store holds neither revision 67's relations (Issue #428, S80a) nor revision 66's.
      for (const table of [...Object.keys(MATERIAL_INDEX_SCHEMA_SQL).reverse(), ...Object.keys(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL).reverse()]) database.exec(`DROP TABLE ${table}`);
      database.exec('PRAGMA foreign_keys = ON');
      downgradeAnalysisRunAuthorizationsToRevision65(database);
      database.exec(`PRAGMA user_version = ${WRITING_TASK_SCHEMA_VERSION}`);
      expect(analysisRunAuthorizationsShape(database)).toBe('revision-65');
      return database.prepare('SELECT rowid, * FROM analysis_run_authorizations ORDER BY rowid').all();
    });
    expect((before as Row[]).map((row) => row.origin)).toEqual(['standard-direct', 'default-execution-rule']);
    expect(JSON.parse((before as Row[])[1]!.canonical_json as string)).toHaveProperty('ruleVersionId');
    const reopened = await openWithRoute();
    try {
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    withDatabase(true, (database) => {
      // Revision 66's widening and the stamp of the terminal revision, 67 (Issue #428, S80a), in one open.
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MATERIAL_INDEX_SCHEMA_VERSION);
      expect(analysisRunAuthorizationsShape(database)).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM analysis_run_authorizations ORDER BY rowid').all()).toEqual(before);
      for (const table of Object.keys(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL)) {
        expect((database.prepare(`SELECT count(*) n FROM ${table}`).get() as Row).n).toBe(0);
      }
      expect((database.prepare("SELECT sql FROM sqlite_schema WHERE name = 'analysis_run_authorizations'").get() as Row).sql)
        .not.toBe(ANALYSIS_LEDGER_REVISION_65_SQL.analysis_run_authorizations);
    });
  }, 300_000);
});
