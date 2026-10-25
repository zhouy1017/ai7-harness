import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { BackgroundAnalysisDispatcher, type BackgroundAnalysisDispatcherDependencies } from '../../src/service/background-analysis.js';
import {
  BACKGROUND_CEILING_REQUIRED,
  BACKGROUND_NOT_MOVED,
  BACKGROUND_NO_SHARE,
  BACKGROUND_PAUSED,
  BACKGROUND_REVOKED,
  backgroundShareFullReason,
} from '../../src/service/background-analysis-enrollments.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { fixtureEntryKey, loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { buildClarificationAnswerMessage, clarificationMessageRequestDigest } from '../../src/service/provider/clarification-contract.js';
import { controlledUnitHold } from '../../src/service/unit-hold.js';
import { EditorialStore, StoreError, type BackgroundAnalysisRuntime } from '../../src/service/store.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  type BackgroundAnalysisScopeKind,
  type BaselineAnalysisProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Service-integration suite (L2) for Issue #864 (1.0.0 decision 12) over 后台处理登记 (S39): the real store on a temporary Agent
// Data Root, exact `sample1` imported through the supported path, the J-04 deterministic route, and no Provider, socket or
// credential value. 登记 requires a tokens ceiling; a Series or all-Books Enrollment schedules per Book in the scope's order, its
// ceiling split equally with the remainder to the first Book, and the dispatcher's look names the Books it skipped; 暂停 holds
// and 续行 releases what it would start; background Runs take at most capacity − 1 places, a Run waiting for the editor's answer
// holding none; a background Run is held to its Book's share, and its Run Report says so.

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const QUIET_MS = 30_000;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-background-scope-');
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

function ownerOf(store: EditorialStore, holdPath: string | null = null): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({
    requestGovernor,
    ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null },
    ...(holdPath === null ? {} : { unitHold: controlledUnitHold(holdPath, { pollMs: 5 }) }),
  });
}

function runtime(overrides: Partial<BackgroundAnalysisRuntime> = {}): BackgroundAnalysisRuntime {
  return { routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now() + 10 * QUIET_MS, quietMs: QUIET_MS, ...overrides };
}

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

async function refusal(operation: () => unknown): Promise<{ code: string; message: string }> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return { code: error.code, message: error.message };
    throw error;
  }
  return { code: 'no-error', message: '' };
}

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importedBook(store: EditorialStore, title: string): Promise<Imported> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  return imported;
}

function prepare(store: EditorialStore, bookId: string): BaselineAnalysisProjection {
  let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  return progress.projection!;
}

async function analysedBook(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, title: string): Promise<Imported> {
  const imported = await importedBook(store, title);
  const first = prepare(store, imported.bookId);
  owner.admitAndDispatch(store.authorizeBaselineAnalysis(imported.bookId, first.taskIntent!.taskIntentId, first.planEnvelope!.digest).dispatchRunRecordId!,
    store.baselineAnalysisLedger);
  await owner.whenIdle();
  return imported;
}

function edit(store: EditorialStore, book: Imported, text: string): void {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph')!;
  store.flushJournalEdit({
    clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
    blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: text,
  });
}

function joinSeries(store: EditorialStore, seriesId: string, bookId: string): void {
  const preview = store.previewSeriesMembershipChange({ seriesId, bookId, kind: 'add' });
  store.changeSeriesMembership({ seriesId, bookId, kind: 'add', previewDigest: preview.previewDigest });
}

function enroll(
  store: EditorialStore,
  bookId: string,
  startingPoint: 'prospective' | 'backfill',
  ceilingTokens: number,
  scope: { kind: BackgroundAnalysisScopeKind; seriesId: string | null } = { kind: 'book', seriesId: null },
) {
  const shown = store.inspectBackgroundAnalysisEnrollment(bookId, runtime());
  expect(shown.offer.canEnroll).toBe(true);
  return store.enrollBackgroundAnalysis(bookId, shown.offer.disclosureDigest!, startingPoint, scope, ceilingTokens, runtime());
}

describe('后台处理登记 with a mandatory ceiling, Series and all-Books scopes (Issue #864)', () => {
  it('refuses 登记 without a tokens ceiling, and an Enrollment binds the ceiling it was given as its budget', async () => {
    const store = await openWithRoute();
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await importedBook(store, 'L2 后台上限');
      const shown = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime());
      // One Book in the house: only the Book itself is offered, and the budget is the editor's to set, required.
      expect(shown.offer.scopes.map((scope) => [scope.kind, scope.label])).toEqual([['book', '《L2 后台上限》这一本书']]);
      expect(shown.offer.binds.find((row) => row.label === '预算上限')?.value).toBe(BACKGROUND_CEILING_REQUIRED);
      for (const ceiling of [0, -1, 1.5, Number.NaN, 1_000_000_000_000]) {
        expect((await refusal(() => store.enrollBackgroundAnalysis(book.bookId, shown.offer.disclosureDigest!, 'backfill', { kind: 'book', seriesId: null }, ceiling, runtime()))).code)
          .toBe('BACKGROUND_ANALYSIS_CEILING_REQUIRED');
      }
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).state).toBe('none');
      const enrolled = enroll(store, book.bookId, 'prospective', 500_000);
      expect(enrolled.enrollment).toMatchObject({ ceilingTokens: 500_000, shareTokens: 500_000, scope: { kind: 'book', position: 1 } });
      expect(enrolled.enrollment!.binds.find((row) => row.label === '预算上限')?.value).toContain('500,000 tokens');
      // The same confirmation with another ceiling is another decision: refused while this one is in force.
      expect((await refusal(() => store.enrollBackgroundAnalysis(book.bookId, shown.offer.disclosureDigest!, 'prospective', { kind: 'book', seriesId: null }, 400_000, runtime()))).code)
        .toBe('BACKGROUND_ANALYSIS_ENROLLMENT_UNAVAILABLE');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('holds a background Run to its Book\'s share: the plan freezes it, and the Run Report names the Enrollment, the share and the outcome', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 后台运行报告');
      // The editor's own Run carries no background lines.
      expect(store.inspectBaselineAnalysis(book.bookId, () => null).taskOutcome!.report!.background).toBeUndefined();
      enroll(store, book.bookId, 'prospective', 777_777);
      edit(store, book, '〔后台改动〕');
      await pass(dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }), owner);
      const after = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect(after.authorization!.origin).toBe('background-analysis-enrollment');
      expect(after.planVersion!.materialInputs.runBudgetCeiling).toEqual({ kind: 'tokens', maxTotalTokens: 777_777 });
      expect(after.taskIntent!.preparedByEnrollmentVersionId).not.toBeNull();
      const lines = after.taskOutcome!.report!.background!;
      expect(lines.slice(0, 2)).toEqual(['由后台处理登记开始 · 按第 1 版登记', '范围：《L2 后台运行报告》这一本书；登记上限 777777 tokens']);
      expect(lines[2]).toMatch(/^没有达到上限：用了 \d+ tokens，这次运行的上限 777777 tokens$/u);
      // The report's own record and digest are what they were: the lines are read beside it.
      expect(Object.keys(after.taskOutcome!.report!)).toContain('reportDigest');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('schedules a Series per Book in its order, splits the ceiling equally with the remainder to the first, and names the Books it skipped', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const jia = await importedBook(store, 'L2 书系甲');
      const yi = await importedBook(store, 'L2 书系乙');
      const bing = await importedBook(store, 'L2 书系丙');
      const seriesId = store.createSeries({ title: 'L2 后台书系', note: '' }).seriesId;
      // The Series' order is the order its Books joined it, not their titles.
      joinSeries(store, seriesId, yi.bookId);
      joinSeries(store, seriesId, jia.bookId);
      joinSeries(store, seriesId, bing.bookId);
      const shown = store.inspectBackgroundAnalysisEnrollment(jia.bookId, runtime());
      expect(shown.offer.scopes.map((scope) => [scope.kind, scope.label])).toEqual([
        ['book', '《L2 书系甲》这一本书'], ['series', '书系《L2 后台书系》的 3 本书'], ['all-books', '全部 3 本图书'],
      ]);
      const series = shown.offer.scopes[1]!;
      expect(series.books.map((entry) => entry.title)).toEqual(['L2 书系乙', 'L2 书系甲', 'L2 书系丙']);
      const scope = { kind: 'series' as const, seriesId };
      // Every Book must have at least one token of the ceiling.
      expect((await refusal(() => store.enrollBackgroundAnalysis(jia.bookId, shown.offer.disclosureDigest!, 'prospective', scope, 2, runtime()))).code)
        .toBe('BACKGROUND_ANALYSIS_CEILING_TOO_LOW');
      // A Book of the scope with an Enrollment of its own in force refuses the whole 登记, named; nothing is recorded.
      enroll(store, bing.bookId, 'prospective', 10_000);
      const blocked = await refusal(() => store.enrollBackgroundAnalysis(jia.bookId, shown.offer.disclosureDigest!, 'prospective', scope, 1000, runtime()));
      expect(blocked).toEqual({ code: 'BACKGROUND_ANALYSIS_ENROLLMENT_ACTIVE', message: '《L2 书系丙》已经登记了后台分析；请先撤销它的登记，再按这个范围登记。' });
      expect(store.inspectBackgroundAnalysisEnrollment(yi.bookId, runtime()).state).toBe('none');
      const own = store.inspectBackgroundAnalysisEnrollment(bing.bookId, runtime()).enrollment!;
      store.revokeBackgroundAnalysisEnrollment(bing.bookId, own.enrollmentId, runtime());

      // 1000 tokens over three Books: 334 to the first in the Series' order, 333 to each other.
      const enrolled = store.enrollBackgroundAnalysis(jia.bookId, shown.offer.disclosureDigest!, 'prospective', scope, 1000, runtime());
      expect(enrolled.enrollment!.scope).toMatchObject({ kind: 'series', label: '书系《L2 后台书系》的 3 本书', position: 2 });
      const shares = [yi, jia, bing].map((book) => {
        const read = store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime());
        return [read.state, read.enrollment!.ceilingTokens, read.enrollment!.shareTokens, read.enrollment!.scope.position];
      });
      expect(shares).toEqual([['active', 1000, 334, 1], ['active', 1000, 333, 2], ['active', 1000, 333, 3]]);
      // 丙 was enrolled before, so its Enrollment is the next version; the dispatcher still looks at the Series' Books together, in order.
      expect(store.inspectBackgroundAnalysisEnrollment(bing.bookId, runtime()).enrollment!.ordinal).toBe(2);
      expect(store.backgroundAnalysisBooks()).toEqual([yi.bookId, jia.bookId, bing.bookId]);

      // Only 甲 changes: it gets its first baseline, held to its share, and the others are skipped and named.
      edit(store, jia, '〔书系甲的改动〕');
      await pass(dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }), owner);
      const started = store.inspectBaselineAnalysis(jia.bookId, () => null);
      expect([started.taskIntent!.mode, started.authorization!.origin]).toEqual(['first-baseline', 'background-analysis-enrollment']);
      expect(started.planVersion!.materialInputs.runBudgetCeiling).toEqual({ kind: 'tokens', maxTotalTokens: 333 });
      expect(started.taskOutcome!.report!.background![1]).toBe('范围：书系《L2 后台书系》的 3 本书；登记上限 1000 tokens，本书份额 333 tokens');
      expect(store.inspectBaselineAnalysis(yi.bookId, () => null).taskIntent).toBeNull();
      expect(store.inspectBaselineAnalysis(bing.bookId, () => null).taskIntent).toBeNull();
      const read = store.inspectBackgroundAnalysisEnrollment(jia.bookId, runtime());
      expect(read.skipped.map((entry) => [entry.title, entry.reason])).toEqual([['L2 书系乙', BACKGROUND_NOT_MOVED], ['L2 书系丙', BACKGROUND_NOT_MOVED]]);

      // 暂停 and 撤销 from any Book of the Series reach every Book of it.
      const paused = store.holdBackgroundAnalysisEnrollment(bing.bookId, store.inspectBackgroundAnalysisEnrollment(bing.bookId, runtime()).enrollment!.enrollmentId, 'pause', runtime());
      expect(paused.state).toBe('paused');
      expect([yi, jia].map((book) => store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).state)).toEqual(['paused', 'paused']);
      store.revokeBackgroundAnalysisEnrollment(yi.bookId, store.inspectBackgroundAnalysisEnrollment(yi.bookId, runtime()).enrollment!.enrollmentId, runtime());
      expect([yi, jia, bing].map((book) => store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).next.reason)).toEqual([BACKGROUND_REVOKED, BACKGROUND_REVOKED, BACKGROUND_REVOKED]);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('enrolls every Book of the house in the order they were made, the remainder to the first', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS });
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const first = await importedBook(store, 'L2 全部甲');
      const second = await importedBook(store, 'L2 全部乙');
      const shown = store.inspectBackgroundAnalysisEnrollment(second.bookId, runtime());
      const all = shown.offer.scopes.find((scope) => scope.kind === 'all-books')!;
      expect(all.books.map((entry) => entry.bookId)).toEqual([first.bookId, second.bookId]);
      store.enrollBackgroundAnalysis(second.bookId, shown.offer.disclosureDigest!, 'backfill', { kind: 'all-books', seriesId: null }, 1001, runtime());
      expect([first, second].map((book) => store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).enrollment!.shareTokens)).toEqual([501, 500]);
      expect(store.inspectBackgroundAnalysisEnrollment(first.bookId, runtime()).enrollment!.scope.label).toBe('全部 2 本图书');
      expect(store.backgroundAnalysisBooks()).toEqual([first.bookId, second.bookId]);
      await pass(dispatcher, owner);
      await pass(dispatcher, owner);
      expect([first, second].map((book) => {
        const run = store.inspectBaselineAnalysis(book.bookId, () => null);
        return [run.authorization!.origin, run.planVersion!.materialInputs.runBudgetCeiling];
      })).toEqual([
        ['background-analysis-enrollment', { kind: 'tokens', maxTotalTokens: 501 }],
        ['background-analysis-enrollment', { kind: 'tokens', maxTotalTokens: 500 }],
      ]);
      store.markCleanShutdown();
    } finally {
      await dispatcher.dispose();
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('暂停 holds what it would start and 续行 releases it; neither touches anything already recorded', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await importedBook(store, 'L2 后台暂停');
      const enrolled = enroll(store, book.bookId, 'backfill', 900_000);
      const enrollmentId = enrolled.enrollment!.enrollmentId;
      expect(enrolled.hold).toEqual({ canPause: true, canResume: false });
      const paused = store.holdBackgroundAnalysisEnrollment(book.bookId, enrollmentId, 'pause', runtime());
      expect([paused.state, paused.stateLabel, paused.next, paused.hold]).toEqual(['paused', '已暂停', { kind: 'stopped', reason: BACKGROUND_PAUSED }, { canPause: false, canResume: true }]);
      // Pausing twice answers as once; the history says it was paused, under the same version.
      expect(store.holdBackgroundAnalysisEnrollment(book.bookId, enrollmentId, 'pause', runtime()).historyCount).toBe(2);
      expect(paused.history.map((entry) => [entry.state, entry.ordinal])).toEqual([['paused', 1], ['active', 1]]);
      const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS });
      await pass(dispatcher, owner);
      expect(store.inspectBaselineAnalysis(book.bookId, () => null).taskIntent).toBeNull();
      expect(store.inspectBackgroundAnalysisEnrollment(book.bookId, runtime()).lastLook).toMatchObject({ kind: 'stopped', reason: BACKGROUND_PAUSED });
      const resumed = store.holdBackgroundAnalysisEnrollment(book.bookId, enrollmentId, 'resume', runtime());
      expect([resumed.state, resumed.enrollment!.ordinal, resumed.history[0]!.state]).toEqual(['active', 1, 'active']);
      await pass(dispatcher, owner);
      const first = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect([first.taskIntent!.mode, first.authorization!.origin, first.state]).toEqual(['first-baseline', 'background-analysis-enrollment', 'settled']);
      // A revoked Enrollment can be neither paused nor resumed.
      store.revokeBackgroundAnalysisEnrollment(book.bookId, enrollmentId, runtime());
      expect((await refusal(() => store.holdBackgroundAnalysisEnrollment(book.bookId, enrollmentId, 'resume', runtime()))).code).toBe('BACKGROUND_ANALYSIS_ENROLLMENT_NOT_ACTIVE');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('takes capacity − 1 places: one of two, none of one, and a Run waiting for the editor\'s answer holds none', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const one = await importedBook(store, 'L2 名额一');
      const two = await importedBook(store, 'L2 名额二');
      enroll(store, one.bookId, 'backfill', 1000);
      enroll(store, two.bookId, 'backfill', 1000);
      const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }, {
        execution: { full: false, routeExecutable: true, capacity: 2, admitOrQueue: () => 'queued' },
      });
      dispatcher.nudge();
      await dispatcher.settled();
      const held = store.inspectBaselineAnalysis(one.bookId, () => null);
      expect(held.run!.state).toBe('authorized');
      expect(store.backgroundAnalysisDecisionFor(two.bookId, runtime()).decision).toEqual({ kind: 'wait', reason: backgroundShareFullReason(1) });
      // A governor of one place leaves background analysis none.
      expect(store.backgroundAnalysisDecisionFor(two.bookId, runtime({ capacity: 1 })).decision).toEqual({ kind: 'stopped', reason: BACKGROUND_NO_SHARE });
      // The first waits for the editor's answer to a question (Issue #865): it holds no place, and the second may start.
      store.baselineAnalysisLedger.recordRunState(held.run!.runRecordId, 'awaiting-clarification', { detail: '等待你的说明。' });
      expect(store.backgroundAnalysisDecisionFor(two.bookId, runtime()).decision.kind).toBe('start');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('keeps the foreground place when a paused background Run resumes beside another background Run', async () => {
    const store = await openWithRoute();
    const holdPath = join(roots.inputRoot, 'background-resume-hold.txt');
    const owner = ownerOf(store, holdPath);
    const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS });
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const first = await importedBook(store, 'L2 暂停的后台');
      const second = await importedBook(store, 'L2 运行的后台');
      const foreground = await importedBook(store, 'L2 前台保留名额');
      enroll(store, first.bookId, 'backfill', 1_000_000);
      writeFileSync(holdPath, '0');
      dispatcher.nudge();
      await dispatcher.settled();
      const paused = store.inspectBaselineAnalysis(first.bookId, () => null);
      const firstRun = paused.run!.runRecordId;
      store.requestBaselineAnalysisPause(first.bookId, paused.taskIntent!.taskIntentId);
      owner.pauseRun(firstRun);
      writeFileSync(holdPath, '99');
      await owner.whenIdle();
      expect(store.baselineAnalysisLedger.currentRunState(firstRun)).toBe('paused');
      const single = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture, capacity: 1,
        secretResolver: { resolve: async () => null } });
      try {
        expect(() => single.admitAndDispatch(firstRun, undefined, { resume: true })).toThrowError(/后台分析最多同时占用 0/u);
      } finally {
        await single.dispose();
      }

      enroll(store, second.bookId, 'backfill', 1_000_000);
      writeFileSync(holdPath, '0');
      dispatcher.nudge();
      await dispatcher.settled();
      const secondRun = store.inspectBaselineAnalysis(second.bookId, () => null).run!.runRecordId;
      expect(owner.progressFor(secondRun)).not.toBeNull();
      expect(() => owner.admitAndDispatch(firstRun, undefined, { resume: true })).toThrowError(/后台分析最多同时占用/u);
      expect(store.baselineAnalysisLedger.currentRunState(firstRun)).toBe('paused');
      const plan = prepare(store, foreground.bookId);
      const foregroundRun = store.authorizeBaselineAnalysis(foreground.bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest).dispatchRunRecordId!;
      expect(owner.admitOrQueue(foregroundRun)).toBe('admitted');
      expect(owner.full).toBe(true);
      writeFileSync(holdPath, '99');
      await owner.whenIdle();
      owner.admitAndDispatch(firstRun, undefined, { resume: true });
      await owner.whenIdle();
      expect(store.inspectBaselineAnalysis(first.bookId, () => null).state).toBe('settled');
      store.markCleanShutdown();
    } finally {
      await dispatcher.dispose();
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it.each([
    { clarification: 'safe-retry', action: 'answer' }, { clarification: 'safe-retry', action: 'cancel' },
    { clarification: 'model', action: 'answer' }, { clarification: 'model', action: 'cancel' },
  ] as const)('retains a background $clarification $action while its share is full, including after a foreground Run frees its place', async ({ clarification, action }) => {
    fixture = await loadModelFixture(FIXTURES_ROOT, clarification === 'model' ? 'sample1-baseline-happy' : 'sample1-baseline-transient-retry');
    const entries = new Map(fixture.entries);
    const baseEntries = [...fixture.entries.values()];
    if (clarification === 'model') fixture = { ...fixture, identity: 'sample1-model-clarification-background-restack', entries };
    const store = await openWithRoute();
    let holdNext = false;
    let held = false;
    let released = false;
    const owner = new BaselineAnalysisExecutionOwner({
      requestGovernor,
      ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null },
      unitHold: async (_units, interrupted) => {
        if (!holdNext) return;
        holdNext = false;
        held = true;
        while (!released && !interrupted()) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      },
    });
    const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS });
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const first = await importedBook(store, 'L2 后台等说明');
      const second = await importedBook(store, 'L2 后台占用名额');
      const foreground = await importedBook(store, 'L2 前台释放名额');
      const enrolled = enroll(store, first.bookId, 'backfill', 1_000_000);
      const version = enrolled.enrollment!.enrollmentVersionId;
      let work = store.createBackgroundBaselineAnalysisPreparationWork(first.bookId, 'first-baseline', version, launchPolicy);
      while (!work.done) work = store.advanceBaselineAnalysisPreparationWork(work.workId!);
      const prepared = work.projection!;
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const asking = clarification === 'model' ? prepared : store.editBaselineAnalysisPlan({
        bookId: first.bookId, taskIntentId, planEnvelopeDigest: prepared.planEnvelope!.digest,
        removedSteps: [], disallowedAdaptations: [], askFirstAdaptations: ['safe-retry'] });
      if (clarification === 'model') {
        for (const unit of prepared.coverageManifest!.units) {
          const base = baseEntries.find((entry) => entry.unitOrdinal === unit.ordinal)!;
          const digest = store.baselineAnalysisLedger.definition.requestDigest(unit.ordinal, unit.digest);
          entries.set(fixtureEntryKey(unit.ordinal, digest), { ...base, requestDigest: digest,
            response: unit.ordinal === 1 ? { kind: 'unit-result', usage: { inputTokens: 10, outputTokens: 5 },
              text: JSON.stringify({ question: '本范围按哪个阅读重点处理？', options: ['人物', '事件'], freeTextAllowed: true }) } : base.response });
        }
      }
      const firstRun = store.startEnrolledBaselineAnalysis(first.bookId, taskIntentId, asking.planEnvelope!.digest, version, 'first-baseline', runtime()).dispatchRunRecordId!;
      owner.admitAndDispatch(firstRun);
      await owner.whenIdle();
      expect(store.baselineAnalysisLedger.currentRunState(firstRun)).toBe('awaiting-clarification');
      expect(owner.idle).toBe(true);
      expect([owner.busy, owner.full]).toEqual([false, false]);
      const kept = store.baselineAnalysisLedger.unitCheckpoints(firstRun).length;
      expect(kept).toBe(7);
      enroll(store, second.bookId, 'backfill', 1_000_000);
      expect(store.backgroundAnalysisDecisionFor(second.bookId, runtime()).decision.kind).toBe('start');
      holdNext = true;
      dispatcher.nudge();
      await dispatcher.settled();
      for (let tries = 0; !held && tries < 2000; tries += 1) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      expect(held).toBe(true);
      if (action === 'answer') {
        const request = store.baselineAnalysisLedger.clarificationsOf(firstRun)[0]!;
        expect(request.origin === 'model').toBe(clarification === 'model');
        store.answerBaselineAnalysisClarification({ bookId: first.bookId, taskIntentId, requestId: request.requestId,
          optionId: clarification === 'model' ? 'model-option-0' : 'retry', note: null });
        if (clarification === 'model') {
          const ledger = store.baselineAnalysisLedger;
          const facts = ledger.loadExecutionPlan(firstRun);
          const unit = facts.manifest.units[0]!;
          const blocks = ledger.readRevisionBlocks(facts.checkpoint.manuscriptId, facts.checkpoint.revisionId);
          const message = buildClarificationAnswerMessage(ledger.definition.buildUnitMessage(unit, facts.manifest.units.length,
            new Map(blocks.map((block) => [block.blockId, block]))), ledger.clarificationsOf(firstRun)[0]!);
          const digest = clarificationMessageRequestDigest(message)!;
          entries.set(fixtureEntryKey(1, digest), { ...baseEntries.find((entry) => entry.unitOrdinal === 1)!, requestDigest: digest });
        }
        expect(owner.continueAnswered(firstRun)).toBe('queued');
      } else {
        store.requestBaselineAnalysisCancel(first.bookId, taskIntentId);
        expect(owner.cancelRun(firstRun)).toBe('stopping');
      }
      expect(owner.progressFor(firstRun)?.stage ?? null).toBe(action === 'answer' ? null : 'units');
      const plan = prepare(store, foreground.bookId);
      const foregroundRun = store.authorizeBaselineAnalysis(foreground.bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest).dispatchRunRecordId!;
      expect(owner.admitOrQueue(foregroundRun)).toBe('admitted');
      await owner.whenDone(foregroundRun);
      expect(store.baselineAnalysisLedger.currentRunState(firstRun)).toBe(action === 'answer' ? 'awaiting-clarification' : 'cancelling');
      expect(store.baselineAnalysisLedger.unitCheckpoints(firstRun)).toHaveLength(kept);
      released = true;
      await owner.whenIdle();
      const settled = store.inspectBaselineAnalysis(first.bookId, () => null);
      expect(settled.run!.state).toBe(action === 'answer' ? clarification === 'model' ? 'completed' : 'completed-with-gaps' : 'cancelled');
      expect(settled.resultSetRevision!.coverage.unitsClosed).toBe((action === 'answer' ? 7 : 6) + (clarification === 'model' ? 1 : 0));
      if (action === 'answer') expect(store.baselineAnalysisLedger.clarificationsOf(firstRun)[0]!.answer?.optionId)
        .toBe(clarification === 'model' ? 'model-option-0' : 'retry');
      store.markCleanShutdown();
    } finally {
      released = true;
      await dispatcher.dispose();
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('lists a completed background Run under 待我处理 › 最近完成 and leaves the counted groups as they were', async () => {
    const store = await openWithRoute();
    const owner = ownerOf(store);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await analysedBook(store, owner, 'L2 后台待我处理');
      const before = store.inspectGlobalAttention(() => null, false);
      enroll(store, book.bookId, 'prospective', 1_000_000);
      edit(store, book, '〔待我处理前的改动〕');
      await pass(dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS }), owner);
      const after = store.inspectGlobalAttention(() => null, false);
      expect(after.actionableCount).toBe(before.actionableCount);
      const counted = (projection: typeof after) => projection.groups.filter((group) => group.key === 'exceptions' || group.key === 'decisions').map((group) => group.total);
      expect(counted(after)).toEqual(counted(before));
      const recent = (projection: typeof after) => projection.groups.find((group) => group.key === 'recent')!;
      expect(recent(after).total).toBe(recent(before).total + 1);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);

  it('a background Run cancelled after it began keeps the ranges it read as its partial revision', async () => {
    const store = await openWithRoute();
    const holdPath = join(roots.inputRoot, 'background-unit-hold.txt');
    const owner = ownerOf(store, holdPath);
    try {
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const book = await importedBook(store, 'L2 后台取消');
      enroll(store, book.bookId, 'backfill', 1_000_000);
      writeFileSync(holdPath, '2');
      const dispatcher = dispatcherOf(store, owner, { now: Date.now() + 2 * QUIET_MS });
      dispatcher.nudge();
      await dispatcher.settled();
      const running = store.inspectBaselineAnalysis(book.bookId, () => null);
      const runRecordId = running.run!.runRecordId;
      for (let tries = 0; (owner.progressFor(runRecordId)?.unitsSettled ?? 0) < 2 && tries < 2_000; tries += 1) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      }
      expect(store.requestBaselineAnalysisCancel(book.bookId, running.taskIntent!.taskIntentId)).toBe(runRecordId);
      owner.cancelRun(runRecordId, store.baselineAnalysisLedger);
      writeFileSync(holdPath, '99');
      await owner.whenIdle();
      const cancelled = store.inspectBaselineAnalysis(book.bookId, () => null);
      expect([cancelled.run!.state, cancelled.authorization!.origin]).toEqual(['cancelled', 'background-analysis-enrollment']);
      expect(cancelled.resultSetRevision?.coverage.unitsClosed).toBeGreaterThanOrEqual(2);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
  }, 300_000);
});
