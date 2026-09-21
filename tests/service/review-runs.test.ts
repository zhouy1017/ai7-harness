import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { CooperativeJobOwner } from '../../src/service/cooperative-jobs.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { BaselineAnalysisStore } from '../../src/service/analysis/baseline-analysis-store.js';
import { graphemeCount, sliceGraphemes } from '../../src/service/analysis/factual-review-contract.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { ReviewRunDriver, type ReviewRunExecutionOwner } from '../../src/service/review/review-run-driver.js';
import { reviewLeadsOf } from '../../src/service/review/review-leads.js';
import {
  FACTUAL_AGAIN_REASON,
  FACTUAL_CHAPTERS_REASON,
  LEADS_ABSENT_REASON,
  LEADS_CHANGED_REASON,
  NEVER_REVIEWED_REASON,
  SELECTION_UNAVAILABLE_REASON,
} from '../../src/service/review/review-scope.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  MAX_FRAME_BYTES,
  MAX_REVIEW_FINDINGS_PER_PAGE,
  MAX_REVIEW_RUN_SUMMARIES,
  type LaunchPolicyProjection,
  type ReviewFindingPageRequest,
  type ReviewRunProjection,
  type ReviewRunScopeRequest,
  type ReviewWorkspaceProjection,
  type ServiceJobProjection,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { LITERARY_EXPRESSION, STYLE_AND_FORMAT, TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';

// Service-integration suite (L2) for Review Runs (Issue #417, plan slice S69, Stage B): the real store,
// the Review Run ledger and its drive loop, every category ledger, the one execution owner, and the AI7
// local deterministic adapter over the authored fixtures — `sample1-review-authored`, layered over the
// baseline's J-04 fixture so one store lifetime runs the baseline the leads come from, and
// `sample1-factual-authored` for 事实核查. The manuscript is exact `sample1` (ADR 0043); no Provider,
// socket, credential value or Effect beyond an editor's own Apply is involved. Assertions name counts,
// states and identities; manuscript text is compared, never printed.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const J04_EDIT_SUFFIX = '，J-04 结果集形成后的确认编辑';
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
const CHANGED: ReviewRunScopeRequest = { kind: 'changed', fromChapterBlockId: null, toChapterBlockId: null };
const SELECTION: ReviewRunScopeRequest = { kind: 'selection', fromChapterBlockId: null, toChapterBlockId: null };
const TYPOS = TYPOS_AND_USAGE.categoryId;
const STYLE = STYLE_AND_FORMAT.categoryId;
const LITERARY = LITERARY_EXPRESSION.categoryId;
const PLOT = 'plot-consistency';
const FACTUAL = 'factual-review';

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-review-runs-');
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
  readonly fixture: ResolvedModelFixture;
}

interface Book {
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
}

async function open(fixtureIdentity: string, owner?: (inner: BaselineAnalysisExecutionOwner) => ReviewRunExecutionOwner): Promise<Session> {
  const fixture = await loadModelFixture(FIXTURES_ROOT, fixtureIdentity);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const executionOwner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner === undefined ? executionOwner : owner(executionOwner));
  return { store, owner: executionOwner, driver, fixture };
}

/** The service entry's own shutdown order: the loop stops first, the owner interrupts, the loop records it. */
async function close(session: Session): Promise<void> {
  const stopped = session.driver.dispose();
  await session.owner.dispose();
  await stopped;
  session.store.markCleanShutdown();
  session.store.close();
}

async function importBook(session: Session): Promise<Book> {
  await requireExactSample1(roots.codeRoot);
  const imported = await importSample1Book(session.store, roots.codeRoot, 'L2 sample1 审阅记录');
  await pinEditorialWorkspaceProfileRevision2(session.store, imported.bookId);
  recordMissingCredentialConnection(session.store, 'L2 主编辑连接');
  return { bookId: imported.bookId, manuscriptId: imported.manuscriptId, branchId: imported.branchId };
}

async function withBook(fixtureIdentity: string, body: (session: Session, book: Book) => Promise<void>): Promise<void> {
  const session = await open(fixtureIdentity);
  try {
    const book = await importBook(session);
    await body(session, book);
  } finally {
    await close(session);
  }
}

/** The baseline analysis the leads of 情节逻辑与前后一致 come from, settled through the same owner. */
async function runBaseline(session: Session, book: Book): Promise<void> {
  let progress = session.store.createBaselineAnalysisPreparationWork(book.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
  while (!progress.done) progress = session.store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const authorized = session.store.authorizeBaselineAnalysis(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  session.owner.admitAndDispatch(authorized.dispatchRunRecordId!);
  await session.owner.whenIdle();
  expect(session.store.inspectBaselineAnalysis(book.bookId).state).toBe('settled');
}

/** 先看计划: the preparation job run to its end, one cooperative step at a time. */
function prepare(session: Session, book: Book, categoryIds: ReadonlyArray<string>, scope: ReviewRunScopeRequest): ReviewRunProjection {
  let progress = session.store.createReviewRunPreparationWork(book.bookId, categoryIds, scope, launchPolicy);
  while (!progress.done) progress = session.store.advanceReviewRunPreparationWork(progress.workId!);
  const run = progress.projection!.run!;
  expect(run.state).toBe('prepared');
  return run;
}

function approvals(run: ReviewRunProjection): Array<{ categoryId: string; planEnvelopeDigest: string }> {
  return run.categories.filter((category) => category.planEnvelopeDigest !== null)
    .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! }));
}

/** 授权并开始审阅: the one approval, then the drive loop to its end. */
async function authorizeAndDrive(session: Session, book: Book, run: ReviewRunProjection): Promise<ReviewRunProjection> {
  session.store.authorizeReviewRun(book.bookId, run.reviewRunId, approvals(run));
  await session.driver.drive(run.reviewRunId);
  return workspace(session, book, run.reviewRunId).run!;
}

function workspace(session: Session, book: Book, reviewRunId: string | null = null): ReviewWorkspaceProjection {
  return session.store.inspectReviewWorkspace(book.bookId, reviewRunId);
}

function storeCode(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

function storeMessage(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.message;
    throw error;
  }
  return '';
}

function binding(session: Session, book: Book): { manuscriptId: string; branchId: string; windowStartBlockId: string } {
  return { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: session.store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId };
}

function workingText(session: Session, book: Book): Map<string, string> {
  return new Map(session.store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).map((block) => [block.blockId, block.text] as const));
}

function appendToFirstBlock(session: Session, book: Book): void {
  const window = session.store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks[0]!;
  const graphemes = session.store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).find((entry) => entry.blockId === block.blockId)!.graphemes;
  session.store.flushJournalEdit({
    clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId, blockId: block.blockId,
    windowStartBlockId: block.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
    fromGrapheme: graphemes, toGrapheme: graphemes, insertText: J04_EDIT_SUFFIX,
  });
}

function database(): DatabaseSync {
  return new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
}

/**
 * A material plan input moving under a prepared plan: the Main Editorial Role's Credential Reference is
 * re-enrolled, which every frozen plan names. Written beside the open store, as a re-enrolment would be.
 */
function reenrollCredential(): void {
  const db = database();
  try {
    expect(db.prepare("UPDATE model_service_connections SET credential_reference = ? WHERE connection_id = 'main-editorial-deepseek-v4-pro'").run(randomUUID()).changes).toBe(1);
  } finally {
    db.close();
  }
}

/** The one owner, refusing its first hand-off as a launch without a route would. */
class RefusingFirstDispatch implements ReviewRunExecutionOwner {
  readonly #inner: BaselineAnalysisExecutionOwner;
  #refused = false;

  constructor(inner: BaselineAnalysisExecutionOwner) {
    this.#inner = inner;
  }

  admitAndDispatch(runRecordId: string, ledger: BaselineAnalysisStore): void {
    if (!this.#refused) {
      this.#refused = true;
      throw Object.assign(new Error('没有可执行的本地确定性路由。'), { code: 'EXECUTION_ROUTE_ABSENT' });
    }
    this.#inner.admitAndDispatch(runRecordId, ledger);
  }

  whenIdle(): Promise<void> {
    return this.#inner.whenIdle();
  }
}

/** The one owner, holding the loop at its `gateAt`-th wait for the slot until the suite releases it. */
class GatedOwner implements ReviewRunExecutionOwner {
  readonly #inner: BaselineAnalysisExecutionOwner;
  readonly #gateAt: number;
  readonly reached: Promise<void>;
  readonly #gate: Promise<void>;
  #reach: () => void = () => {};
  #release: () => void = () => {};
  #waits = 0;

  constructor(inner: BaselineAnalysisExecutionOwner, gateAt: number) {
    this.#inner = inner;
    this.#gateAt = gateAt;
    this.reached = new Promise((resolve) => { this.#reach = resolve; });
    this.#gate = new Promise((resolve) => { this.#release = resolve; });
  }

  admitAndDispatch(runRecordId: string, ledger: BaselineAnalysisStore): void {
    this.#inner.admitAndDispatch(runRecordId, ledger);
  }

  async whenIdle(): Promise<void> {
    this.#waits += 1;
    if (this.#waits === this.#gateAt) {
      this.#reach();
      await this.#gate;
    }
    return this.#inner.whenIdle();
  }

  release(): void {
    this.#release();
  }
}

function eventTrail(reviewRunId: string): Array<[string, string]> {
  const db = database();
  try {
    return (db.prepare('SELECT category_id, state FROM review_run_category_events WHERE review_run_id = ? ORDER BY rowid').all(reviewRunId) as Array<{ category_id: string; state: string }>)
      .map((row) => [row.category_id, row.state]);
  } finally {
    db.close();
  }
}
describe('a Review Run over the real store on exact sample1', () => {
  it('reviews several categories and the baseline leads one after another and puts every finding on the manuscript as one record with its mark', async () => {
    await withBook('sample1-review-authored', async (session, book) => {
      const before = workspace(session, book);
      // Nothing to lead from yet: the leads say so, and so do the two categories whose basis does not exist.
      expect(before.categories.map((category) => category.categoryId)).toEqual([
        'typos-and-usage', 'style-and-format', 'plot-consistency', 'factual-review', 'academic-integrity', 'publication-risk',
        'literary-expression', 'series-consistency', 'cross-deliverable-consistency',
      ]);
      expect(before.categories.find((category) => category.categoryId === PLOT)).toMatchObject({ available: false, unavailableReason: LEADS_ABSENT_REASON });
      expect(before.categories.find((category) => category.categoryId === 'series-consistency')!.available).toBe(false);
      expect(before.coverage.map((row) => row.state)).toEqual(['never', 'never', 'unavailable', 'never', 'never', 'never', 'never', 'unavailable', 'unavailable']);
      expect(before.scopeOptions.selection).toEqual({ available: false, unavailableReason: SELECTION_UNAVAILABLE_REASON });
      expect(before.newReview).toEqual({ available: true, unavailableReason: null });
      expect(before.runs).toEqual([]);
      expect(before.run).toBeNull();

      await runBaseline(session, book);
      expect(workspace(session, book).categories.find((category) => category.categoryId === PLOT)!.available).toBe(true);

      // One preparation of a Book at a time, one category's plan per step; a cancelled one writes no Run.
      const pending = session.store.createReviewRunPreparationWork(book.bookId, [TYPOS, STYLE], WHOLE, launchPolicy);
      expect(pending).toMatchObject({ done: false, completed: 1, total: 3, projection: null });
      expect(storeCode(() => session.store.createReviewRunPreparationWork(book.bookId, [TYPOS], WHOLE, launchPolicy))).toBe('REVIEW_RUN_PREPARING');
      expect(session.store.cancelReviewRunPreparationWork(pending.workId!)).toBe(true);
      expect(workspace(session, book).runs).toEqual([]);

      // Ticked in any order, a Run keeps the configuration's order.
      const prepared = prepare(session, book, [LITERARY, PLOT, STYLE, TYPOS], WHOLE);
      expect(prepared).toMatchObject({ ordinal: 1, label: '第 1 次', scope: { kind: 'whole', label: '全书', selectedRange: null }, authorization: null, canContinue: false });
      expect(prepared.categories.map((category) => [category.categoryId, category.state])).toEqual([
        [TYPOS, 'prepared'], [STYLE, 'prepared'], [PLOT, 'prepared'], [LITERARY, 'prepared'],
      ]);
      const typosPlan = prepared.categories[0]!;
      expect(typosPlan.plan).toMatchObject({ units: 8, recomputed: 8, reused: 0, unreviewed: 0, budgetCeilingLabel: '未设置任务预算上限' });
      expect(typosPlan.plan!.routeLabel).toContain('sample1-review-authored');
      expect(typosPlan.modeLabel).toBe('全书审阅');
      // The leads have no Task, no plan and nothing to approve.
      expect(prepared.categories[2]).toMatchObject({ taskIntentId: null, planEnvelopeDigest: null, plan: null });
      expect(approvals(prepared).map((approval) => approval.categoryId)).toEqual([TYPOS, STYLE, LITERARY]);

      const settled = await authorizeAndDrive(session, book, prepared);
      expect(settled).toMatchObject({ state: 'settled', stateLabel: '已完成', canContinue: false });
      expect(settled.categories.every((category) => category.state === 'settled')).toBe(true);
      // One category after another through the one slot: each is on the manuscript before the next starts.
      expect(eventTrail(settled.reviewRunId)).toEqual([
        [TYPOS, 'dispatched'], [TYPOS, 'settled'], [TYPOS, 'materialized'],
        [STYLE, 'dispatched'], [STYLE, 'settled'], [STYLE, 'materialized'],
        [PLOT, 'materialized'],
        [LITERARY, 'dispatched'], [LITERARY, 'settled'], [LITERARY, 'materialized'],
      ]);

      // Each category's findings are exactly its revision's located findings, all on the manuscript; what
      // Reference Integrity could not anchor stays in the excluded appendix and never becomes a mark.
      for (const input of [TYPOS_AND_USAGE, STYLE_AND_FORMAT, LITERARY_EXPRESSION]) {
        const revision = session.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(input)).resultSetRevision!;
        const category = settled.categories.find((candidate) => candidate.categoryId === input.categoryId)!;
        expect(category.findingsCount).toBe(revision.findings.length);
        expect(category.excludedCount).toBe(revision.excluded.length);
        expect(category.excludedCount).toBeGreaterThan(0);
      }
      expect(settled.categories[0]!.excludedCount).toBe(2);
      const baseline = session.store.inspectBaselineAnalysis(book.bookId).resultSetRevision!;
      expect(settled.categories.find((category) => category.categoryId === PLOT)!.findingsCount).toBe(reviewLeadsOf(baseline).length);
      expect(settled.findings.length).toBe(settled.categories.reduce((sum, category) => sum + category.findingsCount, 0));
      expect(settled.findings.every((finding) => finding.markId !== null && finding.anchorState === 'exact' && finding.status === 'pending')).toBe(true);
      expect(settled.findings.map((finding) => finding.ordinal)).toEqual(settled.findings.map((_finding, index) => index + 1));
      expect(settled.findingCounts.pending).toBe(settled.findings.length);

      // A finding and its mark are one record (MARK-010): the mark stands on exactly the words the finding quotes.
      const blocks = workingText(session, book);
      for (const finding of settled.findings) {
        const card = session.store.getEditorialMarkCard(book.manuscriptId, book.branchId, finding.markId!);
        expect(card.pinnedText === sliceGraphemes(blocks.get(finding.blockId)!, finding.fromGrapheme, finding.toGrapheme)).toBe(true);
        expect(card.kind).toBe(finding.output);
        expect(card.source).toMatchObject({ kind: 'ai7', origin: 'review-category', label: finding.categoryLabel });
        const task = settled.categories.find((category) => category.categoryId === finding.categoryId)!.taskIntentId;
        expect(card.source.taskId).toBe(task);
        if (finding.output === 'change-suggestion') {
          expect(card.suggestion).toMatchObject({ proposedText: finding.replacement, rationale: finding.note });
        } else if (finding.categoryId === PLOT) {
          expect(card.body.startsWith('【线索 · ')).toBe(true);
          expect(card.basis.length).toBeGreaterThanOrEqual(1);
          expect(card.basis.every((basis) => basis.label.startsWith('线索来源'))).toBe(true);
        } else {
          expect(card.body === finding.note).toBe(true);
        }
        // Every finding cites its basis (REV-005): the clause it named, or its category's guideline document.
        if (finding.clauseRefs.length > 0) expect(card.basis[0]!.label).toBe(`条款 ${finding.clauseRefs[0]!.clauseId} · ${finding.clauseRefs[0]!.documentTitle}（第 1 版）`);
      }

      // The coverage matrix names each reviewed category current, against the Run that reviewed it.
      const after = workspace(session, book);
      expect(after.coverage.filter((row) => row.state === 'current').map((row) => row.categoryId)).toEqual([TYPOS, STYLE, PLOT, LITERARY]);
      expect(after.coverage.find((row) => row.categoryId === TYPOS)).toMatchObject({ lastRunOrdinal: 1, changedBlocks: 0, lastReviewedRevisionLabel: 'r1' });
      expect(after.runs).toHaveLength(1);
      expect(after.runs[0]).toMatchObject({ ordinal: 1, label: '第 1 次', scopeLabel: '全书', state: 'settled', reportVersion: null });
      expect(after.runs[0]!.categoryLabels).toEqual(['错别字与规范用语', '体例与格式', '情节逻辑与前后一致', '文学性与表达改进']);
      expect(after.run!.reviewRunId).toBe(settled.reviewRunId);
    });
  }, 300_000);
  it('derives each finding\'s status from its mark, records an ignored finding with its reason and Quality Signal, and versions the Report', async () => {
    await withBook('sample1-review-authored', async (session, book) => {
      const run = await authorizeAndDrive(session, book, prepare(session, book, [TYPOS, STYLE], WHOLE));
      const reviewRunId = run.reviewRunId;
      const [annotation, anotherAnnotation] = run.findings.filter((finding) => finding.categoryId === STYLE);
      const [applied, ignored] = run.findings.filter((finding) => finding.categoryId === TYPOS && finding.severity !== 'must');
      const must = run.findings.filter((finding) => finding.severity === 'must');
      expect(annotation && anotherAnnotation && applied && ignored).toBeTruthy();
      expect(must.length).toBeGreaterThan(0);

      // 标记为已处理 on the manuscript is the finding handled in 审阅 (FIND-002: one record, every surface).
      session.store.updateEditorialMark({
        ...binding(session, book), markId: annotation!.markId!, action: 'set-status', body: null, highlightColor: null, status: 'resolved',
        targetKind: null, proposedText: null, rationale: null,
      });
      // 接受并应用 through the one Apply path is handled too.
      session.store.applyChangeSuggestion({ ...binding(session, book), markId: applied!.markId!, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
      let current = workspace(session, book, reviewRunId).run!;
      const status = (findingId: string) => current.findings.find((finding) => finding.findingId === findingId)!;
      expect(status(annotation!.findingId)).toMatchObject({ status: 'handled', statusLabel: '已处理', statusDetail: '已标记为已处理', markStatus: 'resolved' });
      expect(status(applied!.findingId)).toMatchObject({ status: 'handled', statusDetail: '已接受并应用', markStatus: 'applied' });

      // 忽略并说明 needs its reason, and only a pending finding can be ignored.
      expect(storeCode(() => session.store.recordReviewFindingDisposition(book.bookId, reviewRunId, ignored!.findingId, '   '))).toBe('REVIEW_REASON_REQUIRED');
      expect(storeCode(() => session.store.recordReviewFindingDisposition(book.bookId, reviewRunId, ignored!.findingId, '字'.repeat(501)))).toBe('REVIEW_REASON_TOO_LONG');
      expect(storeCode(() => session.store.recordReviewFindingDisposition(book.bookId, reviewRunId, applied!.findingId, '已经应用'))).toBe('REVIEW_FINDING_NOT_PENDING');
      const reason = '作者坚持保留这一写法，出版社体例允许。';
      current = session.store.recordReviewFindingDisposition(book.bookId, reviewRunId, ignored!.findingId, `  ${reason}  `).run!;
      expect(status(ignored!.findingId)).toMatchObject({ status: 'ignored', statusLabel: '已忽略', ignoreReason: reason, markStatus: 'removed' });
      expect(storeCode(() => session.store.recordReviewFindingDisposition(book.bookId, reviewRunId, ignored!.findingId, reason))).toBe('REVIEW_FINDING_NOT_PENDING');
      // The ignored finding's mark is set aside: it no longer stands on the manuscript.
      expect(storeCode(() => session.store.getEditorialMarkCard(book.manuscriptId, book.branchId, ignored!.markId!))).toBe('MARK_NOT_FOUND');
      expect(current.findingCounts).toMatchObject({ handled: 2, ignored: 1, pending: current.findings.length - 3 });

      const db = database();
      try {
        const signals = db.prepare('SELECT * FROM quality_signals').all() as Array<Record<string, unknown>>;
        expect(signals).toHaveLength(1);
        expect(signals[0]).toMatchObject({ kind: 'review-finding-ignored', book_id: book.bookId, review_run_id: reviewRunId, category_id: TYPOS, finding_id: ignored!.findingId, mark_id: ignored!.markId, reason });
        const bound = JSON.parse(signals[0]!.canonical_json as string) as { binding: Record<string, unknown>; disposition: Record<string, unknown> };
        expect(bound.binding).toMatchObject({ reviewRunId, reviewRunOrdinal: 1, categoryId: TYPOS, findingId: ignored!.findingId, configurationDigest: workspace(session, book).configuration.digest });
        expect(bound.disposition).toMatchObject({ disposition: 'ignored', reason });
        expect((db.prepare('SELECT count(*) total FROM review_finding_dispositions').get() as { total: number }).total).toBe(1);
        // Every relation of the Review Run ledger is append-only.
        for (const relation of ['review_runs', 'review_run_authorizations', 'review_run_category_events', 'review_findings', 'review_finding_dispositions', 'quality_signals']) {
          expect(() => db.exec(`UPDATE ${relation} SET rowid = rowid`)).toThrow(/REVIEW_LEDGER_IMMUTABLE/u);
          expect(() => db.exec(`DELETE FROM ${relation}`)).toThrow(/REVIEW_LEDGER_IMMUTABLE/u);
        }
      } finally {
        db.close();
      }

      // 审阅报告 version 1, then version 2 over what stands later; the first is never rewritten.
      const first = session.store.generateReviewReport(book.bookId, reviewRunId).run!;
      expect(first.reportVersions.map((version) => version.version)).toEqual([1]);
      const report = first.report!;
      expect([report.record.overview.title, report.record.mustItems.title, report.record.categorySummaries.title, report.record.appendix.title])
        .toEqual(['概览表', '必须处理的事项', '各类别摘要', '附录']);
      expect(report.record.mustItems.items.map((item) => item.findingId).sort()).toEqual(must.map((finding) => finding.findingId).sort());
      expect(report.record.mustItems.items.every((item) => graphemeCount(item.quote) <= 80 && item.locationLabel.startsWith('内容块 '))).toBe(true);
      expect(report.record.overview.rows.find((row) => row.categoryId === TYPOS)!.counts).toMatchObject({ handled: 1, ignored: 1 });
      expect(report.record.appendix.categories.map((category) => [category.categoryId, category.procedure.version, category.guidelineDocuments[0]!.version]))
        .toEqual([[TYPOS, '1', '1'], [STYLE, '1', '1']]);
      expect(report.record.appendix.categories[0]!.adapterPin).toMatchObject({ route: 'ai7-local-deterministic', fixtureIdentity: 'sample1-review-authored' });
      expect(report.record.appendix.configuration.digest).toBe(first.configurationDigest);
      session.store.updateEditorialMark({
        ...binding(session, book), markId: anotherAnnotation!.markId!, action: 'set-status', body: null, highlightColor: null, status: 'resolved',
        targetKind: null, proposedText: null, rationale: null,
      });
      const second = session.store.generateReviewReport(book.bookId, reviewRunId).run!;
      expect(second.reportVersions.map((version) => version.version)).toEqual([1, 2]);
      expect(second.reportVersions[0]!.digest).toBe(report.digest);
      expect(second.report!.version).toBe(2);
      expect(second.report!.record.overview.rows.find((row) => row.categoryId === STYLE)!.counts.handled).toBe(2);
      expect(workspace(session, book).runs[0]!.reportVersion).toBe(2);
    });
  }, 300_000);
  it('reads 选章 by the analysis units of a manuscript without headings, and keeps only the leads anchored there', async () => {
    await withBook('sample1-review-authored', async (session, book) => {
      await runBaseline(session, book);
      const ready = workspace(session, book);
      // The leads read the baseline's whole result, never only the changed chapters.
      expect(ready.categories.find((category) => category.categoryId === PLOT)!.scopes.changed).toEqual({ available: false, unavailableReason: LEADS_CHANGED_REASON });
      const options = ready.scopeOptions.chapters;
      // sample1 carries no heading styles, so its chapters are the analysis units every category reads by.
      expect(options).toMatchObject({ available: true, basis: 'analysis-units' });
      expect(options.chapters.map((chapter) => [chapter.position, chapter.endPosition])).toEqual([[1, 15], [16, 25], [26, 43], [44, 59], [60, 68], [69, 75], [76, 92], [93, 97]]);
      const scope: ReviewRunScopeRequest = { kind: 'chapters', fromChapterBlockId: options.chapters[1]!.blockId, toChapterBlockId: options.chapters[2]!.blockId };
      // Chapters out of order are no range at all.
      expect(storeCode(() => session.store.createReviewRunPreparationWork(book.bookId, [LITERARY], { ...scope, fromChapterBlockId: options.chapters[2]!.blockId, toChapterBlockId: options.chapters[1]!.blockId }, launchPolicy)))
        .toBe('REVIEW_SCOPE_INVALID');

      const prepared = prepare(session, book, [PLOT, LITERARY], scope);
      expect(prepared.scope).toEqual({ kind: 'chapters', label: '选章 · 内容块 16–43', selectedRange: { startPosition: 16, endPosition: 43 } });
      const literaryPlan = prepared.categories.find((category) => category.categoryId === LITERARY)!;
      expect(literaryPlan.modeLabel).toBe('所选范围审阅');
      expect(literaryPlan.plan!.unreviewed).toBeGreaterThan(0);
      expect(literaryPlan.plan!.recomputed + literaryPlan.plan!.unreviewed).toBe(8);

      const run = await authorizeAndDrive(session, book, prepared);
      expect(run.state).toBe('settled');
      // A range review's findings are the ones of the units it read, and nothing outside them.
      const revision = session.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(LITERARY_EXPRESSION));
      const read = new Set(revision.resultSetRevision!.lineage.filter((unit) => unit.kind === 'recomputed').flatMap((unit) => {
        const manifestUnit = revision.coverageManifest!.units[unit.unitOrdinal - 1]!;
        return [...manifestUnit.overlapBlockIds, ...manifestUnit.blockIds];
      }));
      const literary = run.findings.filter((finding) => finding.categoryId === LITERARY);
      expect(literary.length).toBeGreaterThan(0);
      expect(literary.every((finding) => read.has(finding.blockId))).toBe(true);
      // The leads kept are exactly those anchored in the chosen chapters.
      const positions = new Map(session.store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).map((block) => [block.blockId, block.position] as const));
      const inRange = reviewLeadsOf(session.store.inspectBaselineAnalysis(book.bookId).resultSetRevision!)
        .filter((lead) => { const position = positions.get(lead.ranges[0]!.blockId)!; return position >= 16 && position <= 43; });
      const leads = run.findings.filter((finding) => finding.categoryId === PLOT);
      expect(leads.length).toBeGreaterThan(0);
      expect(leads.length).toBeLessThan(reviewLeadsOf(session.store.inspectBaselineAnalysis(book.bookId).resultSetRevision!).length);
      expect(leads.map((finding) => finding.blockId).sort()).toEqual(inRange.map((lead) => lead.ranges[0]!.blockId).sort());
      expect(leads.every((finding) => finding.blockPosition! >= 16 && finding.blockPosition! <= 43)).toBe(true);
      // Each finding names the chapter it falls in, for the 章 filter.
      expect(run.findings.every((finding) => options.chapters.some((chapter) => chapter.blockId === finding.chapterBlockId))).toBe(true);
    });
  }, 300_000);

  it('reviews only what changed, names the marks it already made again, and moves the coverage matrix with the manuscript', async () => {
    await withBook('sample1-review-authored', async (session, book) => {
      const first = await authorizeAndDrive(session, book, prepare(session, book, [TYPOS], WHOLE));
      expect(workspace(session, book).coverage.find((row) => row.categoryId === TYPOS)).toMatchObject({ state: 'current', lastRunOrdinal: 1, changedBlocks: 0 });

      appendToFirstBlock(session, book);
      const edited = workspace(session, book);
      expect(edited.coverage.find((row) => row.categoryId === TYPOS)).toMatchObject({ state: 'needs-review', stateLabel: '需复审', lastRunOrdinal: 1, changedBlocks: 1 });
      // What each category can read of the changed chapters: a reviewed one can, a never-reviewed one says why, the leads never do.
      const scopes = (categoryId: string) => edited.categories.find((category) => category.categoryId === categoryId)!.scopes;
      expect(scopes(TYPOS).changed).toEqual({ available: true, unavailableReason: null });
      expect(scopes(STYLE).changed).toEqual({ available: false, unavailableReason: NEVER_REVIEWED_REASON });
      expect(scopes(PLOT).changed).toEqual({ available: false, unavailableReason: LEADS_ABSENT_REASON });
      expect(scopes(TYPOS).selection).toEqual({ available: false, unavailableReason: SELECTION_UNAVAILABLE_REASON });
      expect(storeMessage(() => session.store.createReviewRunPreparationWork(book.bookId, [STYLE], CHANGED, launchPolicy))).toContain(NEVER_REVIEWED_REASON);
      expect(storeCode(() => session.store.createReviewRunPreparationWork(book.bookId, [TYPOS], SELECTION, launchPolicy))).toBe('REVIEW_SCOPE_UNAVAILABLE');

      const prepared = prepare(session, book, [TYPOS], CHANGED);
      expect(prepared.categories[0]).toMatchObject({ modeLabel: '只审改动过的章', plan: { recomputed: 1, reused: 7 } });
      const second = await authorizeAndDrive(session, book, prepared);
      expect(second).toMatchObject({ ordinal: 2, state: 'settled' });
      // The findings of the one unit it read, each the same record the first Run made: the same mark, not a second one.
      const firstMarks = new Map(first.findings.map((finding) => [finding.quote, finding.markId] as const));
      expect(second.findings.length).toBeGreaterThan(0);
      expect(second.findings.every((finding) => finding.markId !== null && firstMarks.get(finding.quote) === finding.markId)).toBe(true);
      const db = database();
      try {
        expect((db.prepare("SELECT count(*) total FROM editorial_marks WHERE source_origin = 'review-category'").get() as { total: number }).total).toBe(first.findings.length);
      } finally {
        db.close();
      }
      const after = workspace(session, book);
      expect(after.coverage.find((row) => row.categoryId === TYPOS)).toMatchObject({ state: 'current', lastRunOrdinal: 2, changedBlocks: 0 });
      expect(after.runs.map((run) => [run.ordinal, run.scopeLabel])).toEqual([[2, '只审改动过的章'], [1, '全书']]);
      // Nothing changed since: the ledger's own reason says so.
      expect(after.categories.find((category) => category.categoryId === TYPOS)!.scopes.changed.available).toBe(false);
    });
  }, 300_000);
  it('refuses an approval over a plan that moved, and refuses at its turn a category whose plan moved after the approval', async () => {
    await withBook('sample1-review-authored', async (session, book) => {
      const stale = prepare(session, book, [TYPOS, STYLE], WHOLE);
      reenrollCredential();
      expect(storeCode(() => session.store.authorizeReviewRun(book.bookId, stale.reviewRunId, approvals(stale)))).toBe('REVIEW_PLAN_CHANGED');
      // Preparing again reconfirms each moved plan as its Task's next plan version, and the older Run is superseded.
      const fresh = prepare(session, book, [TYPOS, STYLE], WHOLE);
      expect(fresh.ordinal).toBe(2);
      expect(fresh.categories.map((category) => category.taskIntentId)).toEqual(stale.categories.map((category) => category.taskIntentId));
      expect(fresh.categories.map((category) => category.planEnvelopeDigest)).not.toEqual(stale.categories.map((category) => category.planEnvelopeDigest));
      expect(storeCode(() => session.store.authorizeReviewRun(book.bookId, stale.reviewRunId, approvals(stale)))).toBe('REVIEW_RUN_SUPERSEDED');
      expect(storeCode(() => session.store.authorizeReviewRun(book.bookId, fresh.reviewRunId, approvals(stale)))).toBe('REVIEW_AUTHORIZATION_STALE');
      session.store.authorizeReviewRun(book.bookId, fresh.reviewRunId, approvals(fresh));
      // An approval repeated with the same digests records nothing new.
      session.store.authorizeReviewRun(book.bookId, fresh.reviewRunId, approvals(fresh));

      // The plans move again after the approval: each category is refused at its turn, with the ledger's reason.
      reenrollCredential();
      await session.driver.drive(fresh.reviewRunId);
      const run = workspace(session, book, fresh.reviewRunId).run!;
      expect(run).toMatchObject({ state: 'failed', canContinue: false });
      expect(run.categories.map((category) => category.state)).toEqual(['refused', 'refused']);
      expect(run.categories.every((category) => category.detail!.includes('plan-revision-required'))).toBe(true);
      expect(eventTrail(fresh.reviewRunId)).toEqual([[TYPOS, 'refused'], [STYLE, 'refused']]);
      // No Run was recorded on either ledger: a refused approval never leaves a category authorized.
      expect(session.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(TYPOS_AND_USAGE)).run).toBeNull();
      expect(run.findings).toEqual([]);
      expect(workspace(session, book).runs.map((summary) => [summary.ordinal, summary.state])).toEqual([[2, 'failed'], [1, 'prepared']]);
    });
  }, 300_000);

  it('keeps going when one category cannot be dispatched, and ends that ledger Run instead of leaving it authorized', async () => {
    const session = await open('sample1-review-authored', (inner) => new RefusingFirstDispatch(inner));
    try {
      const book = await importBook(session);
      const run = await authorizeAndDrive(session, book, prepare(session, book, [TYPOS, STYLE], WHOLE));
      expect(run).toMatchObject({ state: 'partial', stateLabel: '部分完成', canContinue: false });
      expect(run.categories[0]).toMatchObject({ categoryId: TYPOS, state: 'failed', findingsCount: 0 });
      expect(run.categories[0]!.detail).toContain('EXECUTION_ROUTE_ABSENT');
      expect(run.categories[1]).toMatchObject({ categoryId: STYLE, state: 'settled' });
      expect(run.categories[1]!.findingsCount).toBeGreaterThan(0);
      const typos = session.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(TYPOS_AND_USAGE));
      expect(typos.run!.state).toBe('failed');
      // The category is free for its next Task.
      const next = prepare(session, book, [TYPOS], WHOLE);
      expect(next.categories[0]!.taskIntentId).not.toBe(run.categories[0]!.taskIntentId);
    } finally {
      await close(session);
    }
  }, 300_000);

  it('stops between categories, reads partial after a restart, and 继续审阅 finishes the Run where it stopped', async () => {
    let gated = null as GatedOwner | null;
    const first = await open('sample1-review-authored', (inner) => { gated = new GatedOwner(inner, 3); return gated; });
    let book: Book;
    let reviewRunId: string;
    try {
      book = await importBook(first);
      const prepared = prepare(first, book, [TYPOS, STYLE], WHOLE);
      reviewRunId = prepared.reviewRunId;
      first.store.authorizeReviewRun(book.bookId, reviewRunId, approvals(prepared));
      const loop = first.driver.drive(reviewRunId);
      // Driven: the Run reads running while the loop holds it, and no second Run of the Book can be prepared.
      expect(workspace(first, book, reviewRunId).run!.state).toBe('running');
      expect(workspace(first, book).newReview.available).toBe(false);
      expect(storeCode(() => first.store.createReviewRunPreparationWork(book.bookId, [LITERARY], WHOLE, launchPolicy))).toBe('REVIEW_RUN_ACTIVE');
      // The first category is on the manuscript; the service stops before the second starts.
      await gated!.reached;
      const stopped = first.driver.dispose();
      gated!.release();
      await stopped;
      await loop;
      const stoppedRun = workspace(first, book, reviewRunId).run!;
      expect(stoppedRun.categories.map((category) => category.state)).toEqual(['settled', 'waiting']);
    } finally {
      await close(first);
    }

    const second = await open('sample1-review-authored');
    try {
      const partial = workspace(second, book, reviewRunId).run!;
      expect(partial).toMatchObject({ state: 'partial', stateLabel: '部分完成 · 可继续审阅', canContinue: true });
      expect(partial.categories[1]).toMatchObject({ state: 'waiting', detail: '尚未开始；继续审阅时从这一类接着审。' });
      await second.driver.continue(reviewRunId);
      const finished = workspace(second, book, reviewRunId).run!;
      expect(finished).toMatchObject({ state: 'settled', canContinue: false });
      expect(finished.categories.map((category) => category.state)).toEqual(['settled', 'settled']);
      expect(eventTrail(reviewRunId)).toEqual([
        [TYPOS, 'dispatched'], [TYPOS, 'settled'], [TYPOS, 'materialized'],
        [STYLE, 'dispatched'], [STYLE, 'settled'], [STYLE, 'materialized'],
      ]);
      // Continuing a finished Run does nothing.
      await second.driver.continue(reviewRunId);
      expect(eventTrail(reviewRunId)).toHaveLength(6);
    } finally {
      await close(second);
    }
  }, 300_000);

  it('records a category the owner interrupted on shutdown as interrupted, and 继续审阅 goes on with the rest', async () => {
    let gated = null as GatedOwner | null;
    const first = await open('sample1-review-authored', (inner) => { gated = new GatedOwner(inner, 2); return gated; });
    let book: Book;
    let reviewRunId: string;
    try {
      book = await importBook(first);
      const prepared = prepare(first, book, [TYPOS, STYLE], WHOLE);
      reviewRunId = prepared.reviewRunId;
      first.store.authorizeReviewRun(book.bookId, reviewRunId, approvals(prepared));
      const loop = first.driver.drive(reviewRunId);
      // The first category's Run is executing when the service stops: the loop first, then the owner.
      await gated!.reached;
      const stopped = first.driver.dispose();
      await first.owner.dispose();
      gated!.release();
      await stopped;
      await loop;
      expect(eventTrail(reviewRunId)).toEqual([[TYPOS, 'dispatched'], [TYPOS, 'interrupted']]);
    } finally {
      await close(first);
    }

    const second = await open('sample1-review-authored');
    try {
      expect(workspace(second, book, reviewRunId).run).toMatchObject({ state: 'partial', canContinue: true });
      await second.driver.continue(reviewRunId);
      const finished = workspace(second, book, reviewRunId).run!;
      expect(finished).toMatchObject({ state: 'partial', canContinue: false });
      expect(finished.categories.map((category) => category.state)).toEqual(['interrupted', 'settled']);
      expect(second.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(TYPOS_AND_USAGE)).run!.state).toBe('interrupted');
    } finally {
      await close(second);
    }
  }, 300_000);

  it('ends a category Run a stopped service left executing, records it interrupted, and finishes the rest', async () => {
    const first = await open('sample1-review-authored');
    let book: Book;
    let reviewRunId: string;
    try {
      book = await importBook(first);
      const prepared = prepare(first, book, [TYPOS, STYLE], WHOLE);
      reviewRunId = prepared.reviewRunId;
      first.store.authorizeReviewRun(book.bookId, reviewRunId, approvals(prepared));
      // The hand-off reaches the ledger and the owner admits the Run; then the process dies under it.
      const steps = first.store.reviewRunDriveSteps;
      const handOff = steps.start(reviewRunId, TYPOS)!;
      handOff.ledger.recordRunState(handOff.runRecordId, 'admitted', { detail: '已进入 AI7 调度器（单槽位）。' });
      handOff.ledger.recordRunState(handOff.runRecordId, 'executing', { detail: '正在执行。' });
      steps.recordDispatch(reviewRunId, TYPOS, handOff.runRecordId);
    } finally {
      await close(first);
    }

    const second = await open('sample1-review-authored');
    try {
      const partial = workspace(second, book, reviewRunId).run!;
      expect(partial).toMatchObject({ state: 'partial', canContinue: true });
      expect(partial.categories.map((category) => category.state)).toEqual(['interrupted', 'waiting']);
      await second.driver.continue(reviewRunId);
      const finished = workspace(second, book, reviewRunId).run!;
      expect(finished).toMatchObject({ state: 'partial', canContinue: false });
      expect(finished.categories.map((category) => category.state)).toEqual(['interrupted', 'settled']);
      expect(finished.categories[0]!.detail).toContain('服务在这一类运行期间停止');
      // The category's ledger Run is ended, not left executing: the category can be reviewed again.
      expect(second.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(TYPOS_AND_USAGE)).run!.state).toBe('interrupted');
      expect(prepare(second, book, [TYPOS], WHOLE).categories[0]!.modeLabel).toBe('全书审阅');
    } finally {
      await close(second);
    }
  }, 300_000);

  it('reads a Book without a manuscript as having nothing to review, and names why', async () => {
    const session = await open('sample1-review-authored');
    try {
      const creation = session.store.prepareBookCreation('空图书', null);
      const bookId = session.store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
      const empty = session.store.inspectReviewWorkspace(bookId, null);
      expect(empty).toMatchObject({ bookId, manuscript: null, newReview: { available: false }, runs: [], run: null });
      expect(empty.categories.every((category) => !category.available)).toBe(true);
      expect(empty.coverage.every((row) => row.state === 'unavailable')).toBe(true);
      expect(empty.scopeOptions.whole.available).toBe(false);
      expect(storeCode(() => session.store.createReviewRunPreparationWork(bookId, [TYPOS], WHOLE, launchPolicy))).toBe('REVIEW_MANUSCRIPT_ABSENT');
      expect(storeCode(() => session.store.inspectReviewWorkspace(randomUUID(), null))).toBe('REVIEW_BOOK_NOT_FOUND');
    } finally {
      await close(session);
    }
  }, 300_000);

  it('checks facts as 事实核查 over the whole manuscript once, tiers read as severities and every finding 未外部复核', async () => {
    await withBook('sample1-factual-authored', async (session, book) => {
      const before = workspace(session, book).categories.find((category) => category.categoryId === FACTUAL)!;
      expect(before.available).toBe(true);
      expect(before.scopes).toMatchObject({ whole: { available: true }, chapters: { available: false, unavailableReason: FACTUAL_CHAPTERS_REASON } });
      expect(before.basisStatement).toContain('会使用搜索引擎');

      const prepared = prepare(session, book, [FACTUAL], WHOLE);
      expect(prepared.categories[0]!.modeLabel).toBe('全书事实核查');
      const run = await authorizeAndDrive(session, book, prepared);
      expect(run.state).toBe('settled');
      const revision = session.store.inspectFactualReview(book.bookId).resultSetRevision!;
      expect(run.findings).toHaveLength(revision.findings.length);
      const tiers = new Map(revision.findings.map((finding) => [finding.quote, finding.severity] as const));
      for (const finding of run.findings) {
        expect(finding).toMatchObject({ output: 'annotation', stateLine: '未外部复核', replacement: null, status: 'pending' });
        expect(finding.severity).toBe({ A: 'must', B: 'should', C: 'note' }[tiers.get(finding.quote)!]);
        const card = session.store.getEditorialMarkCard(book.manuscriptId, book.branchId, finding.markId!);
        expect(card.kind).toBe('annotation');
        expect(card.body.startsWith('【未外部复核】')).toBe(true);
        expect(card.basis[0]!.label.startsWith('可核查依据')).toBe(true);
      }
      // Once checked, 事实核查 says why it cannot check again yet, and its coverage stands.
      const after = workspace(session, book);
      expect(after.categories.find((category) => category.categoryId === FACTUAL)).toMatchObject({ available: false, unavailableReason: FACTUAL_AGAIN_REASON });
      expect(after.coverage.find((row) => row.categoryId === FACTUAL)!.state).toBe('current');
      expect(storeCode(() => session.store.createReviewRunPreparationWork(book.bookId, [FACTUAL], WHOLE, launchPolicy))).toBe('REVIEW_CATEGORY_UNAVAILABLE');
    });
  }, 300_000);
});

/** The job owner polled as the renderer polls it through `pollServiceJob`, until the job ends. */
async function settleJob(jobs: CooperativeJobOwner, started: ServiceJobProjection): Promise<ServiceJobProjection[]> {
  const trail = [started];
  let job = started;
  while (job.state === 'queued' || job.state === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 10));
    job = jobs.poll(job.jobId);
    trail.push(job);
  }
  return trail;
}

/** What a projection weighs as the service's response frame carries it. */
function wireBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

// Stage C (Issue #417): the service entry's dispatch is not importable, so these cases drive exactly what
// it calls — the cooperative job owner for 先看计划, the approval followed at once by the drive loop, the
// Book check before 继续审阅, and the mark lookup behind 查看任务.
describe('the 审阅 operations as the service entry dispatches them', () => {
  it('prepares a Review Run as a cooperative service job, cancels one without writing a Run, and completes a Run of the leads alone at once', async () => {
    await withBook('sample1-review-authored', async (session, book) => {
      const jobs = new CooperativeJobOwner(session.store);
      try {
        // A selection the store refuses fails at once, before any job exists.
        expect(storeCode(() => jobs.startReviewRunPreparation(book.bookId, ['series-consistency'], WHOLE, launchPolicy))).toBe('REVIEW_CATEGORY_UNAVAILABLE');

        // Cancelled while queued: the store abandons the preparation, so the Book can be prepared again.
        const cancelled = jobs.startReviewRunPreparation(book.bookId, [TYPOS, STYLE], WHOLE, launchPolicy);
        expect(cancelled).toMatchObject({ kind: 'review-run-preparation', state: 'queued', progress: { completed: 0, total: 3 }, result: null, failure: null });
        expect(jobs.cancel(cancelled.jobId)).toMatchObject({ state: 'cancelled', result: null, progress: { label: '审阅计划准备已取消' } });
        expect(workspace(session, book).runs).toEqual([]);

        // One category's plan per step, then the Run; the progress never goes back and ends at its total.
        const trail = await settleJob(jobs, jobs.startReviewRunPreparation(book.bookId, [TYPOS, STYLE], WHOLE, launchPolicy));
        const completed = trail.map((job) => job.progress.completed);
        expect(trail.every((job) => job.kind === 'review-run-preparation' && job.progress.total === 3)).toBe(true);
        expect(completed).toEqual([...completed].sort((left, right) => left - right));
        const done = trail.at(-1)!;
        expect(done).toMatchObject({ state: 'completed', progress: { completed: 3, total: 3, label: '审阅计划准备完成' }, failure: null });
        const prepared = done.result as ReviewWorkspaceProjection;
        expect(prepared.bookId).toBe(book.bookId);
        expect(prepared.run).toMatchObject({ ordinal: 1, state: 'prepared' });
        expect(prepared.run!.categories.map((category) => category.categoryId)).toEqual([TYPOS, STYLE]);
        // The completed job carries the workspace across the service boundary in one frame.
        expect(wireBytes(done)).toBeLessThan(MAX_FRAME_BYTES);

        // The leads need no plan: their Run is written by the first step, and the job is complete at once.
        await runBaseline(session, book);
        const leads = jobs.startReviewRunPreparation(book.bookId, [PLOT], WHOLE, launchPolicy);
        expect(leads).toMatchObject({ kind: 'review-run-preparation', state: 'completed', progress: { completed: 1, total: 1, label: '审阅计划准备完成' } });
        expect((leads.result as ReviewWorkspaceProjection).run).toMatchObject({ ordinal: 2, state: 'prepared', categories: [{ categoryId: PLOT, planEnvelopeDigest: null }] });
      } finally {
        jobs.dispose();
      }
    });
  }, 300_000);

  it('drives an approved Run before it answers, continues only a Run of the route\'s Book, and finds the Run a produced mark came from', async () => {
    await withBook('sample1-review-authored', async (session, book) => {
      const prepared = prepare(session, book, [TYPOS], WHOLE);
      // Approved and not yet driven, a Run reads partial: the answer is read only once the loop has taken it.
      session.store.authorizeReviewRun(book.bookId, prepared.reviewRunId, approvals(prepared));
      expect(workspace(session, book, prepared.reviewRunId).run).toMatchObject({ state: 'partial', canContinue: true });
      const loop = session.driver.drive(prepared.reviewRunId);
      expect(workspace(session, book, prepared.reviewRunId).run).toMatchObject({ state: 'running', canContinue: false });
      await loop;

      // 继续审阅 asks within the route's Book first: the loop itself knows no Book.
      const creation = session.store.prepareBookCreation('另一本书', null);
      const otherBookId = session.store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
      expect(storeCode(() => session.store.requireReviewRunOfBook(otherBookId, prepared.reviewRunId))).toBe('REVIEW_RUN_NOT_FOUND');
      expect(storeCode(() => session.store.requireReviewRunOfBook(book.bookId, randomUUID()))).toBe('REVIEW_RUN_NOT_FOUND');
      expect(storeCode(() => session.store.requireReviewRunOfBook(book.bookId, prepared.reviewRunId))).toBe('no-error');

      const settled = workspace(session, book, prepared.reviewRunId).run!;
      expect(settled.state).toBe('settled');
      expect(settled.findings.length).toBeGreaterThan(0);
      // 查看任务: every produced mark names its Run and finding; a mark no Review Run made names none.
      for (const finding of settled.findings) {
        expect(session.store.reviewFindingOfMark(finding.markId!)).toEqual({ bookId: book.bookId, reviewRunId: prepared.reviewRunId, findingId: finding.findingId });
      }
      expect(session.store.reviewFindingOfMark(randomUUID())).toBeNull();
      // The settled workspace crosses the service boundary in one frame.
      expect(wireBytes(workspace(session, book, prepared.reviewRunId))).toBeLessThan(MAX_FRAME_BYTES);
    });
  }, 300_000);

  it('pages the findings of a Run too large for one answer, under the frame limit, to the end — filtered in the service', async () => {
    await withBook('sample1-review-authored', async (session, book) => {
      const run = await authorizeAndDrive(session, book, prepare(session, book, [TYPOS, STYLE], WHOLE));
      const made = run.findings.length;
      expect(made).toBeGreaterThan(0);
      const clauseId = run.findings.find((finding) => finding.categoryId === TYPOS && finding.clauseRefs.length > 0)?.clauseRefs[0]?.clauseId ?? null;
      // Beside the findings the Run made, many more written as a materialization writes its rows: light
      // ones, so the count bounds a page, and ones as heavy as the contract lets a finding be — a whole
      // quotation, note and replacement and a cited clause — so the weight does. None became a mark.
      const light = 700;
      const heavy = 200;
      const db = database();
      try {
        const insert = db.prepare(
          `INSERT INTO review_findings(review_run_id, finding_id, category_id, ordinal, kind_ref, severity, output, risk_point, block_id,
             from_grapheme, to_grapheme, quote, note, replacement, clause_ref, state_line, mark_id, anchor, canonical_json, sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 1, ?, ?, ?, ?, NULL, NULL, 'anchor-changed', '{}', ?)`,
        );
        for (let index = 0; index < light + heavy; index += 1) {
          const ordinal = made + index + 1;
          const weighty = index >= light;
          const suggestion = index % 3 !== 0;
          insert.run(
            run.reviewRunId, `rvf_${ordinal.toString(16).padStart(24, '0')}`, suggestion ? TYPOS : STYLE, ordinal,
            `rfd_${ordinal.toString(16).padStart(24, '0')}`, (['must', 'should', 'note'] as const)[index % 3]!, suggestion ? 'change-suggestion' : 'annotation',
            run.findings[0]!.blockId, weighty ? '审'.repeat(80) : '审阅页', weighty ? '说'.repeat(200) : '说明',
            suggestion ? (weighty ? '改'.repeat(200) : '改') : null, suggestion && weighty ? clauseId : null, 'f'.repeat(64),
          );
        }
      } finally {
        db.close();
      }
      const total = made + light + heavy;

      /** Every page of one filter set, each read as the service entry reads it and weighed as its frame carries it. */
      const pages = (filters: Partial<ReviewFindingPageRequest>): ReviewWorkspaceProjection[] => {
        const answers: ReviewWorkspaceProjection[] = [];
        let after: number | null = null;
        for (;;) {
          const answer = session.store.inspectReviewWorkspace(book.bookId, run.reviewRunId, undefined, {
            findingsAfterOrdinal: after, categoryId: null, severity: null, status: null, chapterBlockId: null, ...filters,
          });
          answers.push(answer);
          expect(wireBytes(answer)).toBeLessThan(MAX_FRAME_BYTES);
          const opened = answer.run!;
          expect(opened.findings.length).toBeLessThanOrEqual(MAX_REVIEW_FINDINGS_PER_PAGE);
          // Every page counts every finding, whatever the filters (FIND-003: a filter is a view).
          expect(opened.findingCounts.pending + opened.findingCounts.handled + opened.findingCounts.ignored).toBe(total);
          if (!opened.findingsTruncated) return answers;
          expect(opened.findings.length).toBeGreaterThan(0);
          after = opened.findings.at(-1)!.ordinal;
        }
      };

      const everything = pages({});
      const read = everything.flatMap((answer) => answer.run!.findings);
      expect(read.map((finding) => finding.ordinal)).toEqual(Array.from({ length: total }, (_value, index) => index + 1));
      expect(everything.every((answer) => answer.run!.findingsTotal === total)).toBe(true);
      // The light findings fill a page to its count; the heavy ones fill it to its weight well before that.
      expect(everything[0]!.run!.findings.length).toBe(MAX_REVIEW_FINDINGS_PER_PAGE);
      const heavyPage = everything.find((answer) => answer.run!.findings.some((finding) => finding.ordinal > made + light))!;
      expect(heavyPage.run!.findings.length).toBeLessThan(MAX_REVIEW_FINDINGS_PER_PAGE);
      // Unnamed, a page is the first one — which is what every answer after an action carries.
      expect(workspace(session, book, run.reviewRunId).run!.findings.map((finding) => finding.ordinal))
        .toEqual(everything[0]!.run!.findings.map((finding) => finding.ordinal));

      // Filtered in the service, a page carries only what passes, still in ordinal order and to the end.
      const byFilter = (filters: Partial<ReviewFindingPageRequest>, keep: (finding: (typeof read)[number]) => boolean): void => {
        const answers = pages(filters);
        const expected = read.filter(keep).map((finding) => finding.findingId);
        expect(answers.flatMap((answer) => answer.run!.findings.map((finding) => finding.findingId))).toEqual(expected);
        expect(answers.every((answer) => answer.run!.findingsTotal === expected.length)).toBe(true);
      };
      byFilter({ severity: 'must' }, (finding) => finding.severity === 'must');
      byFilter({ categoryId: STYLE }, (finding) => finding.categoryId === STYLE);
      byFilter({ categoryId: STYLE, severity: 'note', status: 'pending' }, (finding) => finding.categoryId === STYLE && finding.severity === 'note' && finding.status === 'pending');
      byFilter({ status: 'ignored' }, () => false);
      const chapter = everything[0]!.scopeOptions.chapters.chapters.find((option) => read.some((finding) => finding.chapterBlockId === option.blockId))!;
      byFilter({ chapterBlockId: chapter.blockId }, (finding) => finding.chapterBlockId === chapter.blockId);
      // A cursor past the last finding answers an empty, final page.
      const past = session.store.inspectReviewWorkspace(book.bookId, run.reviewRunId, undefined, {
        findingsAfterOrdinal: total, categoryId: null, severity: null, status: null, chapterBlockId: null,
      }).run!;
      expect(past).toMatchObject({ findings: [], findingsTotal: total, findingsTruncated: false });
      expect(storeCode(() => session.store.inspectReviewWorkspace(book.bookId, run.reviewRunId, undefined, {
        findingsAfterOrdinal: 0, categoryId: null, severity: null, status: null, chapterBlockId: null,
      }))).toBe('REVIEW_PAGE_INVALID');
    });
  }, 300_000);

  it('lists the newest Review Runs only, and still opens an older one by its identity', async () => {
    await withBook('sample1-review-authored', async (session, book) => {
      await runBaseline(session, book);
      // The leads need no plan, so each of these Runs is prepared by one step.
      const prepared = Array.from({ length: MAX_REVIEW_RUN_SUMMARIES + 1 }, () => prepare(session, book, [PLOT], WHOLE));
      const latest = workspace(session, book);
      expect(latest.runs).toHaveLength(MAX_REVIEW_RUN_SUMMARIES);
      expect(latest.runsTruncated).toBe(true);
      expect(latest.runs.map((summary) => summary.ordinal)).toEqual(
        Array.from({ length: MAX_REVIEW_RUN_SUMMARIES }, (_value, index) => MAX_REVIEW_RUN_SUMMARIES + 1 - index));
      expect(latest.run!.ordinal).toBe(MAX_REVIEW_RUN_SUMMARIES + 1);
      const oldest = workspace(session, book, prepared[0]!.reviewRunId);
      expect(oldest.run).toMatchObject({ reviewRunId: prepared[0]!.reviewRunId, ordinal: 1 });
      expect(oldest.runs.some((summary) => summary.reviewRunId === prepared[0]!.reviewRunId)).toBe(false);
      expect(wireBytes(latest)).toBeLessThan(MAX_FRAME_BYTES);
    });
  }, 300_000);
});
