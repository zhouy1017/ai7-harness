import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
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
  type LaunchPolicyProjection,
  type ReviewRunProjection,
  type ReviewRunScopeRequest,
  type ReviewWorkspaceProjection,
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
// REVIEW-RUNS-TESTS
});
