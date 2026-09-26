import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError, StoreFatalError } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver, type ReviewRunExecutionOwner } from '../../src/service/review/review-run-driver.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  MAX_FRAME_BYTES,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateRequest,
  type GlobalAttentionGroupKey,
  type GlobalAttentionItemProjection,
  type GlobalAttentionProjection,
  type LaunchPolicyProjection,
  type ReviewRunProjection,
  type ReviewRunScopeRequest,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { STYLE_AND_FORMAT, TYPOS_AND_USAGE } from '../support/review-categories.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for 待我处理 (Issue #424, plan slice S78; editor-surfaces §8.1, V2-UX-ATTN-001
// to 008): the real store over exact `sample1` and small manuscripts composed from it, the one execution owner
// and the Review Run drive loop, and the AI7 local deterministic adapter where a Run has to execute. Each case
// reads records the product's own operations made — a Run blocked before dispatch, one a stopped service left
// executing, a pending Plan Revision, a Run in flight, a Review Run that failed, one left to continue, the
// imports and the Recovery Attention State a stopped service leaves — and proves the read writes nothing: every
// row of every relation reads byte for byte the same after it.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
const TYPOS = TYPOS_AND_USAGE.categoryId;
const STYLE = STYLE_AND_FORMAT.categoryId;
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
  roots = await createServiceTestRoots('ai7-service-global-attention-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
});

afterEach(async () => {
  await roots.dispose();
});

function open(route: ResolvedModelFixture | null, control: Partial<typeof CONTROL> = {}): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    ...CONTROL,
    ...control,
    baselineAnalysisRoute: route === null ? null : { fixtureIdentity: route.identity, fixtureSha256: route.sha256, fixtureLineage: route.lineage },
  });
}

function ownerOf(store: EditorialStore, fixture: ResolvedModelFixture): BaselineAnalysisExecutionOwner {
  return new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
}

async function importBook(store: EditorialStore, title: string, first: boolean): Promise<{ bookId: string; manuscriptId: string; branchId: string }> {
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

/**
 * Every row of every relation of the Book database as one digest per relation: what a read must leave
 * exactly as it found it (the Task Drawer suite's own measure).
 */
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

/** Read 待我处理 twice around a digest of every relation: the two answers agree and nothing moved. */
function readWritingNothing(read: () => GlobalAttentionProjection): GlobalAttentionProjection {
  const before = relationDigests();
  const first = read();
  const second = read();
  expect(relationDigests()).toEqual(before);
  expect(second).toEqual(first);
  expect(Buffer.byteLength(JSON.stringify(first), 'utf8')).toBeLessThan(MAX_FRAME_BYTES);
  return first;
}

function items(projection: GlobalAttentionProjection, key: GlobalAttentionGroupKey): ReadonlyArray<GlobalAttentionItemProjection> {
  return projection.groups.find((group) => group.key === key)!.items;
}

function summary(projection: GlobalAttentionProjection, key: GlobalAttentionGroupKey): Array<[string | null, string, string]> {
  return items(projection, key).map((entry) => [entry.book.title, entry.state, entry.nextStep]);
}

describe('待我处理 over the real store on exact sample1', () => {
  it('places each Book\'s latest baseline Task by its state, lists its completion, resolves an item once a newer Task exists, and writes nothing', async () => {
    // A launch with no executable route: 开始任务 records the Run and it is blocked before dispatch.
    const first = await open(null);
    let bookA: { bookId: string };
    try {
      bookA = await importBook(first, 'L2 待我处理 甲', true);
      const prepared = prepare(first, bookA.bookId, null);
      const authorized = first.authorizeBaselineAnalysis(bookA.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(authorized.dispatchRunRecordId).toBeNull();
      expect(authorized.projection.run!.state).toBe('blocked-before-dispatch');
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
    const store = await open(fixture);
    const owner = ownerOf(store, fixture);
    const read = (): GlobalAttentionProjection => store.inspectGlobalAttention((runRecordId) => owner.progressFor(runRecordId), owner.busy);
    try {
      // Book 乙: a first baseline analysis that completes, then a range update prepared twice with two ranges:
      // version 1 is superseded by a pending Plan Revision that 重新确认计划 settles.
      const bookB = await importBook(store, 'L2 待我处理 乙', false);
      const firstB = prepare(store, bookB.bookId, null);
      owner.admitAndDispatch(store.authorizeBaselineAnalysis(bookB.bookId, firstB.taskIntent!.taskIntentId, firstB.planEnvelope!.digest).dispatchRunRecordId!);
      await owner.whenIdle();
      const settledB = store.inspectBaselineAnalysis(bookB.bookId);
      expect(settledB.state).toBe('settled');
      const options = settledB.updateControls!.actions['reanalyze-range'].options;
      prepare(store, bookB.bookId, { mode: 'reanalyze-range', selectedRange: { startPosition: options[2]!.startPosition, endPosition: options[2]!.endPosition } });
      const drifted = prepare(store, bookB.bookId, { mode: 'reanalyze-range', selectedRange: { startPosition: options[7]!.startPosition, endPosition: options[7]!.endPosition } });
      expect(drifted.planRevision?.state).toBe('pending');
      expect(drifted.actions.canReconfirmPlan).toBe(true);

      // Book 丙: a Run admitted and executing that nothing executes — what a service that stopped under it leaves.
      const bookC = await importBook(store, 'L2 待我处理 丙', false);
      const preparedC = prepare(store, bookC.bookId, null);
      const orphan = store.authorizeBaselineAnalysis(bookC.bookId, preparedC.taskIntent!.taskIntentId, preparedC.planEnvelope!.digest).dispatchRunRecordId!;
      store.baselineAnalysisLedger.recordRunState(orphan, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      store.baselineAnalysisLedger.recordRunState(orphan, 'executing', { detail: '正在执行。' });

      const view = readWritingNothing(read);
      expect(view.groups.map((group) => group.key)).toEqual(['exceptions', 'decisions', 'active', 'recent']);
      // Oldest first among the blocked: 甲's Run was blocked in the first launch, 丙's left executing since.
      expect(summary(view, 'exceptions')).toEqual([
        ['L2 待我处理 甲', 'analysis-blocked', 'view-run'],
        ['L2 待我处理 丙', 'analysis-orphaned', 'view-run'],
      ]);
      expect(items(view, 'exceptions').every((entry) => entry.blocked)).toBe(true);
      expect(summary(view, 'decisions')).toEqual([['L2 待我处理 乙', 'analysis-plan-revision', 'reconfirm-plan']]);
      const decision = items(view, 'decisions')[0]!;
      expect(decision.target).toEqual({ kind: 'analysis-plan', bookId: bookB.bookId, taskIntentId: drifted.taskIntent!.taskIntentId });
      expect(decision.technical.find((row) => row.key === 'plan-revision')?.value).toContain(drifted.planRevision!.planRevisionId!);
      expect(summary(view, 'active')).toEqual([]);
      expect(summary(view, 'recent')).toEqual([['L2 待我处理 乙', 'analysis-completed-with-gaps', 'view-run']]);
      expect(items(view, 'recent')[0]!.facts.revisionOrdinal).toBe(1);
      expect(view.actionableCount).toBe(3);
      expect(view.running).toBe(false);

      // 甲 again, under this launch: a newer Task resolves the blocked one's item. Started, it is the one Run in
      // flight — 运行中, counted nowhere — and once settled it is a completion.
      const againA = prepare(store, bookA.bookId, null);
      expect(summary(readWritingNothing(read), 'exceptions').map(([title]) => title)).toEqual(['L2 待我处理 丙']);
      owner.admitAndDispatch(store.authorizeBaselineAnalysis(bookA.bookId, againA.taskIntent!.taskIntentId, againA.planEnvelope!.digest).dispatchRunRecordId!);
      const inFlight = read();
      expect(inFlight.running).toBe(true);
      expect(summary(inFlight, 'active')).toEqual([['L2 待我处理 甲', 'analysis-queued', 'view-run']]);
      expect(items(inFlight, 'active')[0]!.facts.progress).toMatchObject({ stage: 'units', unitsSettled: 0 });
      expect(inFlight.actionableCount).toBe(2);
      await owner.whenIdle();
      const after = readWritingNothing(read);
      expect(after.running).toBe(false);
      expect(summary(after, 'active')).toEqual([]);
      expect(summary(after, 'recent').map(([title, state]) => [title, state])).toEqual([
        ['L2 待我处理 甲', 'analysis-completed-with-gaps'],
        ['L2 待我处理 乙', 'analysis-completed-with-gaps'],
      ]);
      expect(after.actionableCount).toBe(2);
    } finally {
      await owner.dispose();
      store.markCleanShutdown();
      store.close();
    }
  }, 300_000);

  it('names an import whose outcome cannot be proven, an abandonment whose cleanup is pending, and a Recovery Attention State, and writes nothing', async () => {
    const composed = async (name: string, startBlock: number, title: string): Promise<string> => {
      const path = join(roots.inputRoot, name);
      await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock, blocks: 6, title });
      return path;
    };
    const reviewNewBook = async (store: EditorialStore, path: string, title: string): Promise<{ draftId: string; draftVersion: number; reviewDigest: string }> => {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: title } as const;
      let review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
      if (review.reviewDigest === null) review = store.prepareNewBookReview(review.draftId, review.draftVersion, target, true);
      return { draftId: review.draftId, draftVersion: review.draftVersion, reviewDigest: review.reviewDigest! };
    };

    // The first session stops without closing its lifetime, with one acknowledged edit past the checkpoint of
    // one Book and one import whose commit attempt was recorded and never proven.
    const first = await open(null);
    let bookId: string;
    try {
      const staged = await first.stageSelectedManuscript(randomUUID(), await composed('recovery.docx', 1, 'L2 恢复之书'));
      const review = first.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: 'L2 恢复之书' }, false);
      const ready = review.reviewDigest === null
        ? first.prepareNewBookReview(review.draftId, review.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: 'L2 恢复之书' }, true)
        : review;
      const commitId = randomUUID();
      const commit = await first.commitNewBookImport({ draftId: ready.draftId, expectedDraftVersion: ready.draftVersion, reviewDigest: ready.reviewDigest!, commitId });
      await first.acknowledgeImportCompletion(commitId);
      bookId = commit.bookId;
      const window = first.getManuscriptWindow(commit.manuscriptId, commit.branchId, null);
      const block = window.blocks.find((entry) => entry.kind === 'paragraph')!;
      first.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: commit.manuscriptId, branchId: commit.branchId, baseRevisionId: window.revisionId,
        blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest,
        expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '断电前写入的文字。',
      });
      const pending = await reviewNewBook(first, await composed('uncertain.docx', 20, 'L2 未定之书'), 'L2 未定之书');
      let interrupted: unknown = null;
      try {
        await first.commitNewBookImport({ draftId: pending.draftId, expectedDraftVersion: pending.draftVersion, reviewDigest: pending.reviewDigest, commitId: randomUUID() }, { interruptAfterAttempt: true });
      } catch (error) {
        interrupted = error;
      }
      expect(interrupted).toBeInstanceOf(StoreFatalError);
    } finally {
      first.close();
    }

    // The next session proves nothing about the attempt, and one abandonment cannot finish its cleanup.
    const store = await open(null, { induceUnprovableReconciliation: true, induceAbandonObjectRemovalFailure: true });
    try {
      // A recorded attempt reads as nothing until the startup read reconciles it; its reconciliation writes,
      // so 待我处理 never attempts it.
      const unreconciled = readWritingNothing(() => store.inspectGlobalAttention(() => null, false));
      expect(summary(unreconciled, 'exceptions')).toEqual([['L2 恢复之书', 'recovery-pending', 'return-to-recovery']]);
      expect((await store.getImportStartup()).state).toBe('outcome-uncertain');
      const cleanup = await reviewNewBook(store, await composed('cleanup.docx', 40, 'L2 清理之书'), 'L2 清理之书');
      let refused: unknown = null;
      try {
        await store.abandonImportDraft(cleanup.draftId, cleanup.draftVersion);
      } catch (error) {
        refused = error;
      }
      expect(refused).toBeInstanceOf(StoreError);
      expect((refused as StoreError).code).toBe('ABANDON_CLEANUP_FAILED');

      const view = readWritingNothing(() => store.inspectGlobalAttention(() => null, false));
      expect(summary(view, 'exceptions')).toEqual([
        ['L2 恢复之书', 'recovery-pending', 'return-to-recovery'],
        ['L2 未定之书', 'import-outcome-uncertain', 'await-local-check'],
        ['L2 清理之书', 'import-cleanup-pending', 'retry-abandon-cleanup'],
      ]);
      const [recovery, uncertain, pendingCleanup] = items(view, 'exceptions');
      expect(recovery!.book.bookId).toBe(bookId);
      expect(recovery!.object).toEqual({ kind: 'recovery', branchName: expect.any(String) });
      expect(recovery!.target.kind).toBe('manuscript-recovery');
      expect(uncertain!.book).toEqual({ bookId: null, title: 'L2 未定之书' });
      expect(uncertain!.object).toEqual({ kind: 'import', sourceDisplayName: 'uncertain.docx', relationship: 'first-manuscript' });
      expect(pendingCleanup!.target).toEqual({ kind: 'import-recovery', draftId: cleanup.draftId });
      expect(view.actionableCount).toBe(3);
      // Nothing else is read: no ordinary draft, no completed import, no credential state.
      expect(view.groups.slice(1).every((group) => group.total === 0)).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);
});

/** The one owner, refusing every hand-off as a launch without a route would. */
class RefusingOwner implements ReviewRunExecutionOwner {
  admitAndDispatch(_runRecordId: string, _ledger: BaselineAnalysisStore): void {
    throw Object.assign(new Error('没有可执行的本地确定性路由。'), { code: 'EXECUTION_ROUTE_ABSENT' });
  }

  whenPlaceFree(): Promise<void> {
    return Promise.resolve();
  }

  whenDone(_runRecordId: string): Promise<void> {
    return Promise.resolve();
  }
}

describe('待我处理 over Review Runs', () => {
  it('names a Review Run that failed, one in flight, one a stopped service left to continue, and one completed, and writes nothing', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-review-authored');
    const prepareRun = (store: EditorialStore, bookId: string, categoryIds: ReadonlyArray<string>): ReviewRunProjection => {
      let progress = store.createReviewRunPreparationWork(bookId, categoryIds, WHOLE, launchPolicy);
      while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
      return progress.projection!.run!;
    };
    const approvals = (run: ReviewRunProjection): Array<{ categoryId: string; planEnvelopeDigest: string }> =>
      run.categories.filter((category) => category.planEnvelopeDigest !== null).map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! }));

    const first = await open(fixture);
    const owner = ownerOf(first, fixture);
    const read = (store: EditorialStore, reader: BaselineAnalysisExecutionOwner): GlobalAttentionProjection =>
      store.inspectGlobalAttention((runRecordId) => reader.progressFor(runRecordId), reader.busy);
    let failedBook: { bookId: string };
    let stoppedBook: { bookId: string };
    let stoppedRunId: string;
    try {
      // 甲: every category refused its dispatch — the Run ended with nothing on the manuscript.
      failedBook = await importBook(first, 'L2 审阅 甲', true);
      const refusing = new ReviewRunDriver(first.reviewRunDriveSteps, new RefusingOwner());
      const failing = prepareRun(first, failedBook.bookId, [TYPOS]);
      first.authorizeReviewRun(failedBook.bookId, failing.reviewRunId, approvals(failing));
      await refusing.drive(failing.reviewRunId);
      await refusing.dispose();

      // 乙: driven now, then on the manuscript in both categories.
      const drivenBook = await importBook(first, 'L2 审阅 乙', false);
      const driver = new ReviewRunDriver(first.reviewRunDriveSteps, owner);
      const driven = prepareRun(first, drivenBook.bookId, [TYPOS, STYLE]);
      first.authorizeReviewRun(drivenBook.bookId, driven.reviewRunId, approvals(driven));
      const loop = driver.drive(driven.reviewRunId);
      const running = read(first, owner);
      expect(summary(running, 'active')).toEqual([['L2 审阅 乙', 'review-running', 'view-review']]);
      // The loop has taken the Run and waits for the slot for its first category, which it names.
      const current = items(running, 'active')[0]!.facts.categories[0];
      expect(current?.label).toBe(TYPOS_AND_USAGE.label);
      expect(['等待审阅', '正在审阅']).toContain(current?.stateLabel);
      expect(running.running).toBe(true);
      await loop;
      await driver.dispose();

      // 丙: its first category's Run was admitted and executing when the service stopped under it.
      stoppedBook = await importBook(first, 'L2 审阅 丙', false);
      const stopped = prepareRun(first, stoppedBook.bookId, [TYPOS, STYLE]);
      stoppedRunId = stopped.reviewRunId;
      first.authorizeReviewRun(stoppedBook.bookId, stoppedRunId, approvals(stopped));
      const steps = first.reviewRunDriveSteps;
      const handOff = steps.start(stoppedRunId, TYPOS)!;
      handOff.ledger.recordRunState(handOff.runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      handOff.ledger.recordRunState(handOff.runRecordId, 'executing', { detail: '正在执行。' });
      steps.recordDispatch(stoppedRunId, TYPOS, handOff.runRecordId);
    } finally {
      await owner.dispose();
      first.markCleanShutdown();
      first.close();
    }

    const second = await open(fixture);
    const idle = ownerOf(second, fixture);
    try {
      const view = readWritingNothing(() => read(second, idle));
      expect(summary(view, 'exceptions')).toEqual([['L2 审阅 甲', 'review-failed', 'view-review']]);
      expect(items(view, 'exceptions')[0]!.facts.categories.map((category) => [category.label, category.state])).toEqual([[TYPOS_AND_USAGE.label, 'failed']]);
      // Left mid-way: 继续审阅, and the category 继续审阅 would take up first, in 审阅's own words.
      expect(summary(view, 'active')).toEqual([['L2 审阅 丙', 'review-continuable', 'continue-review']]);
      const continuable = items(view, 'active')[0]!;
      expect(continuable.target).toEqual({ kind: 'review', bookId: stoppedBook.bookId, reviewRunId: stoppedRunId });
      expect(continuable.facts.categories).toEqual([{
        label: TYPOS_AND_USAGE.label, state: 'interrupted', stateLabel: '已中断', detail: '服务在这一类运行期间停止；继续审阅时记为已中断，再接着审其余类别。',
      }]);
      expect(summary(view, 'recent')).toEqual([['L2 审阅 乙', 'review-completed', 'view-review']]);
      expect(items(view, 'recent')[0]!.facts.categories.map((category) => category.label)).toEqual([TYPOS_AND_USAGE.label, STYLE_AND_FORMAT.label]);
      expect(view.actionableCount).toBe(1);
      expect(view.running).toBe(false);
      expect(failedBook.bookId).not.toBe(stoppedBook.bookId);
    } finally {
      await idle.dispose();
      second.markCleanShutdown();
      second.close();
    }
  }, 300_000);
});

/** A 修改建议 over graphemes [20, 26) of the first long paragraph whose own words the editor then edits (Issue #57's test). */
function conflictedSuggestion(store: EditorialStore, book: { manuscriptId: string; branchId: string }): string {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 60)!;
  const markId = store.createEditorialMark({
    ...book,
    windowStartBlockId: window.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: 20,
    toGrapheme: 26,
    selectedText: graphemesOf(block.text).slice(20, 26).join(''),
    kind: 'change-suggestion',
    highlightColor: null,
    body: '',
    proposedText: '〔建议〕',
    rationale: null,
  }).markId;
  const now = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId: block.blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === block.blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: 23, toGrapheme: 23, insertText: '〔改〕',
  });
  return markId;
}

describe('待我处理 over Manuscript Conflicts (V2-UX-ATTN-002)', () => {
  it('lists a conflicted 修改建议 as blocking, says so again after 暂不处理, drops it once resolved, and writes nothing', async () => {
    const store = await open(null);
    try {
      const book = await importBook(store, '冲突之书', true);
      const markId = conflictedSuggestion(store, book);
      const target = { kind: 'manuscript-conflict', bookId: book.bookId, manuscriptId: book.manuscriptId, branchId: book.branchId, markId };
      const listed = readWritingNothing(() => store.inspectGlobalAttention(() => null, false));
      expect(items(listed, 'exceptions')).toHaveLength(1);
      expect(items(listed, 'exceptions')[0]).toMatchObject({
        itemId: `conflict:${markId}`, state: 'manuscript-conflict', blocked: true, nextStep: 'resolve-conflict', target,
        book: { bookId: book.bookId, title: '冲突之书' }, object: { kind: 'manuscript-conflict', conflictKind: 'suggestion' },
      });
      expect(listed.actionableCount).toBe(1);

      // 暂不处理 records the conflict and leaves it standing: still listed, from the moment it was put aside.
      const conflict = store.inspectProposalConflict({ ...book, markId });
      const deferred = store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'defer', draftOrdinal: null });
      const aside = readWritingNothing(() => store.inspectGlobalAttention(() => null, false));
      expect(summary(aside, 'exceptions')).toEqual([['冲突之书', 'manuscript-conflict-deferred', 'resolve-conflict']]);
      expect(items(aside, 'exceptions')[0]!.at).toBe(deferred.recordedAt);

      // 保留当前稿件 resolves it: the item resolves by itself.
      const again = store.inspectProposalConflict({ ...book, markId });
      store.resolveProposalConflict({ ...book, markId, basisDigest: again.basisDigest, outcome: 'keep-current', draftOrdinal: null });
      const resolved = readWritingNothing(() => store.inspectGlobalAttention(() => null, false));
      expect(items(resolved, 'exceptions')).toEqual([]);
      expect(resolved.actionableCount).toBe(0);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);
});
