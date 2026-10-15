import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EditorialStore } from '../../../src/service/store.js';
import { ReviewRunDriver } from '../../../src/service/review/review-run-driver.js';
import { reviewCategoryEntry, reviewCategoryEntryForBook, reviewCategoryContractInput } from '../../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../../src/service/review/review-category-kind.js';
import type { BaselineAnalysisExecutionOwner } from '../../../src/service/analysis/execution.js';
import type { ReviewCategoryResultSetRevisionProjection, ReviewFindingProjection, ReviewRunProjection } from '../../../src/shared/protocol.js';
import type { EditorialCase } from './case-file.js';
import { type ImportedBook, workingBlocks } from './session.js';
import { applyAndReverse, type EditingEffort, type FindingCounts, scoreTextFindings, type TextResolution } from './text-cases.js';

/**
 * 审阅 cases (review, material-bearing review, cross-deliverable): one Review Run over the case's categories and scope, its
 * findings read back with the marks the product made of them, scored against the case, then edited, applied and reversed.
 */

export interface ReviewObservation {
  readonly outcome: { state: string; categories: ReadonlyArray<{ categoryId: string; state: string }>; unitsClosed: number; unitsTotal: number; gaps: ReadonlyArray<string> };
  readonly findings: FindingCounts;
  readonly concerns: { met: ReadonlyArray<string>; missed: ReadonlyArray<string> };
  readonly checks: { triggered: ReadonlyArray<string> };
  readonly effort: EditingEffort;
}

function scopeOf(store: EditorialStore, book: ImportedBook, scope: unknown) {
  if (scope === 'whole') return { kind: 'whole' as const, fromChapterBlockId: null, toChapterBlockId: null };
  const paragraph = (scope as { paragraph: number }).paragraph;
  const block = workingBlocks(store, book).find((candidate) => candidate.position === paragraph);
  if (block === undefined) throw new Error('EDITORIAL_CASE/scope-paragraph-absent');
  return { kind: 'selection' as const, fromChapterBlockId: block.blockId, toChapterBlockId: block.blockId };
}

function allFindings(store: EditorialStore, bookId: string, run: ReviewRunProjection): ReadonlyArray<ReviewFindingProjection> {
  const found = [...run.findings];
  for (let page = store.inspectReviewWorkspace(bookId, run.reviewRunId).run!; page.findings.length === 300;) {
    page = store.inspectReviewWorkspace(bookId, run.reviewRunId, undefined,
      { findingsAfterOrdinal: page.findings.at(-1)!.ordinal, categoryId: null, severity: null, status: null, chapterBlockId: null }).run!;
    found.push(...page.findings);
  }
  return found;
}

export async function runReviewCase(
  store: EditorialStore,
  owner: BaselineAnalysisExecutionOwner,
  book: ImportedBook,
  policy: Parameters<EditorialStore['createReviewRunPreparationWork']>[3],
  testCase: EditorialCase,
  resolution: TextResolution,
  dataRoot: string,
  materialIds: ReadonlyArray<string> = [],
): Promise<ReviewObservation> {
  const categories = testCase.input.categories as ReadonlyArray<string>;
  let work = store.createReviewRunPreparationWork(book.bookId, categories, scopeOf(store, book, testCase.input.scope), policy, null, materialIds);
  while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
  const prepared = work.projection!.run!;
  if (prepared.state !== 'prepared') throw new Error(`EDITORIAL_CASE/review-not-prepared: ${prepared.state}`);
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  try {
    store.authorizeReviewRun(book.bookId, prepared.reviewRunId, prepared.categories.filter((category) => category.planEnvelopeDigest !== null)
      .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
    await driver.drive(prepared.reviewRunId);
    await owner.whenIdle();
  } finally {
    const stopped = driver.dispose();
    await stopped;
  }
  const run = store.inspectReviewWorkspace(book.bookId, prepared.reviewRunId).run!;
  let unitsClosed = 0;
  let unitsTotal = 0;
  const gaps: string[] = [];
  let listed = 0;
  let located = 0;
  let excluded = 0;
  // A Book-dependent category (跨交付物一致性) reads its entry for this Book, as the store froze it.
  const database = new DatabaseSync(resolve(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  for (const categoryId of categories) {
    const builtIn = reviewCategoryEntry(categoryId);
    if (builtIn === null || builtIn === undefined) continue;
    const entry = reviewCategoryEntryForBook(builtIn, database, book.bookId);
    let revision: ReviewCategoryResultSetRevisionProjection | null = null;
    try {
      revision = store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(reviewCategoryContractInput(entry))).resultSetRevision as ReviewCategoryResultSetRevisionProjection | null;
    } catch { revision = null; }
    if (revision === null) continue;
    unitsClosed += revision.coverage.unitsClosed;
    unitsTotal += revision.coverage.unitsTotal;
    gaps.push(...revision.gaps.map((gap) => `${categoryId}/${gap.unitOrdinal}:${gap.code}`));
    listed += revision.findingCounts.listed;
    located += revision.findingCounts.located;
    excluded += revision.findingCounts.excluded;
  }
  database.close();
  const findings = allFindings(store, book.bookId, run).filter((finding) => categories.includes(finding.categoryId));
  const scored = scoreTextFindings(findings.map((finding) => ({
    key: finding.findingId, categoryId: finding.categoryId, paragraph: finding.blockPosition, from: finding.fromGrapheme, to: finding.toGrapheme,
    quote: finding.quote, replacement: finding.replacement, markId: finding.markId,
  })), resolution);
  const effort = await applyAndReverse(store, book, scored, resolution, {
    resolveAnnotation: (finding) => {
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      store.updateEditorialMark({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId,
        markId: finding.markId!, action: 'set-status', body: null, highlightColor: null, status: 'resolved', targetKind: null, proposedText: null, rationale: null });
    },
    ignoreAnnotation: (finding) => { store.recordReviewFindingDisposition(book.bookId, run.reviewRunId, finding.key, '编辑价值证据：误报'); },
  });
  return {
    outcome: { state: run.state, categories: run.categories.map((category) => ({ categoryId: category.categoryId, state: category.state })), unitsClosed, unitsTotal, gaps },
    findings: { listed, located, excluded, ...scored.counts },
    concerns: scored.concerns,
    checks: scored.checks,
    effort,
  };
}
