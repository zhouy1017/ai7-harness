import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { BACKGROUND_AUTHORIZED_DETAIL } from '../../src/service/analysis/baseline-analysis-store.js';
import { BackgroundAnalysisDispatcher } from '../../src/service/background-analysis.js';
import {
  BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL,
  BACKGROUND_ATTEMPTED,
  BACKGROUND_CURRENT,
  BACKGROUND_DEVELOPER_LIVE,
  BACKGROUND_ENROLL_DEVELOPER_LIVE,
  BACKGROUND_NOT_ENROLLED,
  BACKGROUND_NOT_MOVED,
  BACKGROUND_NO_ROUTE,
  BACKGROUND_PLACE_BUSY,
  BACKGROUND_REVOKED,
  BACKGROUND_START_SYNC,
  BACKGROUND_TASK_PREPARED,
  BACKGROUND_TASK_RUNNING,
  BackgroundAnalysisEnrollmentLedger,
  backgroundQuietReason,
} from '../../src/service/background-analysis-enrollments.js';
import { MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError, type BackgroundAnalysisRuntime } from '../../src/service/store.js';
import {
  ANALYSIS_LEDGER_REVISION_65_SQL,
  BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION,
  WRITING_TASK_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateMode,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { analysisRunAuthorizationsShape, downgradeAnalysisRunAuthorizationsToRevision65 } from '../support/default-execution-rules.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 后台分析登记 (Issue #95, plan slice S39; ADR 0048; ADR 0046; V2-UX-ANALYSIS-016 to 021): the
// real store on a temporary Agent Data Root, exact `sample1` imported through the supported path, the J-04 deterministic route,
// and no Provider, socket or credential value. Schema revision 66 adds the enrollment ledger and widens the Run Authorization
// origin; an Enrollment is made only from its disclosure, the dispatcher starts a Run only while every condition holds, each
// Run it starts is an exact Task, plan and Run Authorization naming the enrollment version, and revoking stops what comes
// after while everything already recorded stays.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const QUIET_MS = 30_000;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-background-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
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

function ownerOf(store: EditorialStore): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
}

/** The facts the dispatcher hands the store: a route, a free place, a clock well past the quiet period. */
function runtime(overrides: Partial<BackgroundAnalysisRuntime> = {}): BackgroundAnalysisRuntime {
  return { routeExecutable: true, placeFree: true, now: Date.now() + 10 * QUIET_MS, quietMs: QUIET_MS, ...overrides };
}

/** The dispatcher with the clock it is given, so a test decides whether the quiet period has passed. */
function dispatcherOf(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, clock: { now: number }): BackgroundAnalysisDispatcher {
  return new BackgroundAnalysisDispatcher({ store, execution: owner, launchPolicy, quietMs: QUIET_MS, now: () => clock.now });
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

describe('后台分析登记 over the real store on exact sample1', () => {
  it('discloses everything an Enrollment binds before the editor decides, chooses no starting point, and makes none by itself', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 后台分析登记');
      const shown = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime());
      expect([shown.state, shown.stateLabel, shown.enrollment, shown.history, shown.startedRuns, shown.startedRunCount]).toEqual(['none', '未登记', null, [], [], 0]);
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

      // A confirmation of a disclosure other than the one on show is refused, and records nothing.
      expect(await refusal(() => store.enrollBackgroundAnalysis(book.bookId, 'f'.repeat(64), 'prospective', runtime()))).toBe('BACKGROUND_ANALYSIS_ENROLLMENT_STALE');
      const enrolled = store.enrollBackgroundAnalysis(book.bookId, shown.offer.disclosureDigest!, 'prospective', runtime());
      expect([enrolled.state, enrolled.stateLabel, enrolled.enrollment?.ordinal, enrolled.enrollment?.name, enrolled.enrollment?.startingPoint])
        .toEqual(['active', '已登记', 1, '后台分析登记 · 第 1 版', 'prospective']);
      expect(enrolled.enrollment!.binds).toEqual(shown.offer.binds);
      expect(enrolled.history.map((entry) => [entry.state, entry.ordinal])).toEqual([['active', 1]]);
      expect([enrolled.offer.canEnroll, enrolled.revoke.canRevoke]).toEqual([false, true]);
      // The same confirmation twice answers as once; another one while it is in force is refused.
      expect(store.enrollBackgroundAnalysis(book.bookId, shown.offer.disclosureDigest!, 'prospective', runtime()).enrollment!.enrollmentVersionId)
        .toBe(enrolled.enrollment!.enrollmentVersionId);
      expect(await refusal(() => store.enrollBackgroundAnalysis(book.bookId, shown.offer.disclosureDigest!, 'backfill', runtime())))
        .toBe('BACKGROUND_ANALYSIS_ENROLLMENT_UNAVAILABLE');
      // Prospective, over a current analysis: nothing to do, and nothing moved since it was made.
      expect(enrolled.next).toEqual({ kind: 'none', reason: BACKGROUND_CURRENT });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('starts one exact Run after a change has stood still, naming the enrollment version, and keeps the Book current', async () => {
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
      // Just edited: it waits for the manuscript to stand still, and records nothing.
      expect(store.backgroundAnalysisDecisionFor(book.bookId, dispatcher.runtime()).decision).toEqual({ kind: 'wait', reason: backgroundQuietReason(QUIET_MS) });
      await pass(dispatcher, owner);
      expect(store.inspectBaselineAnalysis(book.bookId, () => null).taskIntent!.taskIntentId).toBe(before.taskIntent!.taskIntentId);
      // While every place is taken it waits too: nothing queues.
      clock.now += 2 * QUIET_MS;
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime({ now: clock.now, placeFree: false })).decision)
        .toEqual({ kind: 'wait', reason: BACKGROUND_PLACE_BUSY });
      expect(store.backgroundAnalysisDecisionFor(book.bookId, dispatcher.runtime()).decision)
        .toEqual({ kind: 'start', mode: 'sync-current', reason: BACKGROUND_START_SYNC });
      await pass(dispatcher, owner);
      const after = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect(after.taskIntent!.taskIntentId).not.toBe(before.taskIntent!.taskIntentId);
      expect(after.taskIntent!.mode).toBe('sync-current');
      expect(after.authorization).toMatchObject({ origin: 'background-analysis-enrollment', ruleVersionId: null, enrollmentVersionId: enrolled.enrollment!.enrollmentVersionId });
      expect(after.run!.transitions[0]).toMatchObject({ state: 'authorized', detail: BACKGROUND_AUTHORIZED_DETAIL });
      expect(['completed', 'completed-with-gaps']).toContain(after.run!.state);
      expect(after.resultSetRevision!.ordinal).toBe(2);
      expect(after.resultSetRevision!.freshness.state).toBe('current');
      const read = store.inspectBackgroundAnalysisEnrollment(book.bookId, dispatcher.runtime());
      expect(read.startedRuns).toEqual([{ taskIntentId: after.taskIntent!.taskIntentId, modeLabel: '同步到当前稿件', enrollmentOrdinal: 1, authorizedAt: after.authorization!.authorizedAt }]);
      expect(read.next).toEqual({ kind: 'none', reason: BACKGROUND_CURRENT });
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
      const recorded = withDatabase(true, (database) => database.prepare(
        'SELECT authorization_id, canonical_json, sha256 FROM analysis_run_authorizations ORDER BY rowid',
      ).all() as Row[]);

      expect(await refusal(() => store.revokeBackgroundAnalysisEnrollment(book.bookId, randomUUID(), runtime()))).toBe('BACKGROUND_ANALYSIS_ENROLLMENT_NOT_FOUND');
      const revoked = store.revokeBackgroundAnalysisEnrollment(book.bookId, enrolled.enrollment!.enrollmentId, runtime());
      expect([revoked.state, revoked.stateLabel, revoked.next]).toEqual(['revoked', '已撤销', { kind: 'stopped', reason: BACKGROUND_REVOKED }]);
      expect(revoked.history.map((entry) => [entry.state, entry.ordinal])).toEqual([['active', 1], ['revoked', 1]]);
      // Revoking twice answers as once.
      expect(store.revokeBackgroundAnalysisEnrollment(book.bookId, enrolled.enrollment!.enrollmentId, runtime()).history).toHaveLength(2);

      // Another change, well past the quiet period: nothing starts.
      edit(store, book, '〔撤销后的改动〕');
      clock.now += 4 * QUIET_MS;
      await pass(dispatcher, owner);
      const after = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect(after.taskIntent!.taskIntentId).toBe(started.taskIntent!.taskIntentId);
      expect(after.resultSetRevision!.freshness.state).toBe('stale');
      // History intact: the Run it started still names its version, every authorization byte for byte.
      expect(withDatabase(true, (database) => database.prepare('SELECT authorization_id, canonical_json, sha256 FROM analysis_run_authorizations ORDER BY rowid').all())).toEqual(recorded);
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).startedRuns.map((run) => run.enrollmentOrdinal)).toEqual([1]);
      expect(after.resultSetRevision!.ordinal).toBe(2);

      // A start the dispatcher decided under the revoked version records nothing.
      expect(store.startEnrolledBaselineAnalysis(book.bookId, randomUUID(), 'a'.repeat(64), enrolled.enrollment!.enrollmentVersionId, 'sync-current', runtime()))
        .toEqual({ dispatchRunRecordId: null, reason: BACKGROUND_REVOKED });

      // Enrolling again is a new decision, the next version.
      const again = enroll(store, book.bookId, 'backfill');
      expect([again.state, again.enrollment!.ordinal, again.enrollment!.startingPoint]).toEqual(['active', 2, 'backfill']);
      expect(again.history.map((entry) => [entry.state, entry.ordinal])).toEqual([['active', 1], ['revoked', 1], ['active', 2]]);
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

  it('never starts under developer-live, without a route, beside an unfinished Task, or twice over the same text', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 sample1 后台不开始');
      enroll(store, book.bookId, 'prospective');
      edit(store, book, '〔改动〕');
      // No route this launch can execute.
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime({ routeExecutable: false })).decision).toEqual({ kind: 'stopped', reason: BACKGROUND_NO_ROUTE });
      // Developer-live: neither an Enrollment nor a start (Provider Processing v5: backgroundAnalysisEnrollmentAllowed false).
      store.baselineAnalysisLedger.bindLaunch({
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
      const live = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime());
      expect(live.next).toEqual({ kind: 'stopped', reason: BACKGROUND_DEVELOPER_LIVE });
      expect(store.startEnrolledBaselineAnalysis(book.bookId, randomUUID(), 'a'.repeat(64), live.enrollment!.enrollmentVersionId, 'sync-current', runtime()))
        .toEqual({ dispatchRunRecordId: null, reason: BACKGROUND_DEVELOPER_LIVE });
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });

      // A plan the editor prepared and has not started is theirs: the Enrollment waits.
      const prepared = prepare(store, book.bookId, 'reanalyze-book');
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision).toEqual({ kind: 'wait', reason: BACKGROUND_TASK_PREPARED });
      const authorized = store.authorizeBaselineAnalysis(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(store.backgroundAnalysisDecisionFor(book.bookId, runtime()).decision).toEqual({ kind: 'wait', reason: BACKGROUND_TASK_RUNNING });
      owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.baselineAnalysisLedger);
      await owner.whenIdle();

      // The Enrollment's own Run cancelled before it began: the same text is not tried again until it changes.
      edit(store, book, '〔再改动〕');
      const clock = { now: Date.now() + 2 * QUIET_MS };
      const dispatcher = new BackgroundAnalysisDispatcher({
        store, launchPolicy, quietMs: QUIET_MS, now: () => clock.now,
        // A governor whose places are free for the decision, but which leaves the start waiting for one.
        execution: { busy: false, routeExecutable: true, admitOrQueue: () => 'queued' },
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

  it('refuses to enroll under developer-live, and keeps its ledger append-only', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await importedBook(store, 'L2 sample1 登记不变');
      enroll(store, book.bookId, 'backfill');
      const other = await importedBook(store, 'L2 sample1 开发者实时登记');
      store.baselineAnalysisLedger.bindLaunch({
        operationalScope: 'developer-live',
        live: {
          route: 'opencode-go', model: 'deepseek-v4-flash', endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
          credentialSlot: 'opencode-go', credentialReference: randomUUID(), runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 240_000 },
        },
      });
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
      // The ledger itself enrolls a Book in force only by the confirmation that put it there: any other is refused.
      const ledger = new BackgroundAnalysisEnrollmentLedger(database);
      const [active] = ledger.active();
      expect(active).toBeDefined();
      const input = { bookId: active!.bookId, startingPoint: active!.version.startingPoint, binding: active!.version.binding,
        enrolledAt: active!.version.enrolledAt, disclosureDigest: active!.version.disclosureDigest };
      expect(ledger.enroll(input).version.enrollmentVersionId).toBe(active!.version.enrollmentVersionId);
      expect(() => ledger.enroll({ ...input, disclosureDigest: 'b'.repeat(64) })).toThrow(/已经登记了后台分析/u);
      expect(() => ledger.enroll({ ...input, startingPoint: 'prospective' })).toThrow(/已经登记了后台分析/u);
      expect(ledger.history(active!.bookId)).toHaveLength(1);
    });
    // Merging a Book from another house never brings its Enrollment.
    for (const table of Object.keys(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL)) expect(MERGE_TABLE_POLICY[table]).toBe('house');
  }, 300_000);

  it('brings a revision-65 store to revision 66: three empty relations, the origin widened, every authorization byte for byte', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      await analysedBook(store, owner, 'L2 sample1 修订版 65');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
    const before = withDatabase(false, (database) => {
      database.exec('PRAGMA foreign_keys = OFF');
      for (const table of Object.keys(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL).reverse()) database.exec(`DROP TABLE ${table}`);
      database.exec('PRAGMA foreign_keys = ON');
      downgradeAnalysisRunAuthorizationsToRevision65(database);
      database.exec(`PRAGMA user_version = ${WRITING_TASK_SCHEMA_VERSION}`);
      expect(analysisRunAuthorizationsShape(database)).toBe('revision-65');
      return database.prepare('SELECT rowid, * FROM analysis_run_authorizations ORDER BY rowid').all();
    });
    const reopened = await openWithRoute();
    try {
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION);
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
