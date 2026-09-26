import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner, ExecutionAdmissionError } from '../../src/service/analysis/execution.js';
import { sliceGraphemes } from '../../src/service/analysis/factual-review-contract.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { ReviewCategoryContractInput } from '../../src/service/review/review-category-contract.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import {
  EDITORIAL_REVIEW_CONTRACT_VERSION,
  REVIEW_CATEGORY_ASSURANCE_STATEMENT,
  type LaunchPolicyProjection,
  type ReviewCategoryProjection,
  type ReviewCategoryTaskRequest,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { LITERARY_EXPRESSION, STYLE_AND_FORMAT, TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';

// Service-integration suite (L2) for the review-category kind family (Issue #417): the real store and
// ledger, the one execution owner, the AI7 local deterministic adapter over the authored fixture
// `sample1-review-authored`, and a fake secret resolver. The manuscript is exact `sample1` (ADR 0043);
// no Provider, socket, credential value or Effect is involved. Assertions name counts, states and
// identities, never manuscript text.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
// The fixture answers exactly the edit J-04 acknowledges after its first revision; any other text would
// change unit 1's digest, and the unit would settle as a fixture-mismatch gap.
const J04_EDIT_SUFFIX = '，J-04 结果集形成后的确认编辑';

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-review-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-review-authored');
  expect(fixture.provenance).toBe('authored');
});

afterEach(async () => {
  await roots.dispose();
});

interface Book {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
}

async function withBook(body: (book: Book) => Promise<void>, capacity?: number): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null }, ...(capacity === undefined ? {} : { capacity }),
  });
  try {
    const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 审阅');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    await body({ store, owner, bookId: imported.bookId, manuscriptId: imported.manuscriptId, branchId: imported.branchId });
    store.markCleanShutdown();
  } finally {
    await owner.dispose();
    store.close();
  }
}

/** Prepare one category's Task to the frozen plan and record its authorization; the Run is not dispatched. */
function prepareAndAuthorize(book: Book, input: ReviewCategoryContractInput, request: ReviewCategoryTaskRequest): { runRecordId: string; prepared: ReviewCategoryProjection } {
  const definition = reviewCategoryKindDefinition(input);
  let progress = book.store.createReviewCategoryPreparationWork(book.bookId, definition, request, launchPolicy);
  while (!progress.done) progress = book.store.advanceReviewCategoryPreparationWork(definition, progress.workId!);
  const prepared = progress.projection!;
  expect(prepared.state).toBe('prepared');
  expect(prepared.taskIntent!.mode).toBe(request.mode);
  const authorized = book.store.authorizeReviewCategory(book.bookId, definition, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(authorized.dispatchRunRecordId).not.toBeNull();
  return { runRecordId: authorized.dispatchRunRecordId!, prepared };
}

async function review(book: Book, input: ReviewCategoryContractInput, request: ReviewCategoryTaskRequest): Promise<ReviewCategoryProjection> {
  const definition = reviewCategoryKindDefinition(input);
  const { runRecordId } = prepareAndAuthorize(book, input, request);
  book.owner.admitAndDispatch(runRecordId, book.store.reviewCategoryLedger(definition));
  await book.owner.whenIdle();
  const settled = book.store.inspectReviewCategory(book.bookId, definition);
  expect(settled.state).toBe('settled');
  // The Run Report accounts for every model turn the revision's usage counts.
  const report = settled.taskOutcome?.report ?? null;
  expect(report).not.toBeNull();
  expect(runReportUsageReconciles(report!, settled.resultSetRevision!.usage)).toBe(true);
  return settled;
}

/** Every located finding's source range holds exactly its quotation in the text the Task read. */
function requireAnchored(book: Book, settled: ReviewCategoryProjection): void {
  const revision = settled.resultSetRevision!;
  const blocks = new Map(book.store.baselineAnalysisLedger.readRevisionBlocks(book.manuscriptId, revision.manuscriptPin.revisionId)
    .map((block) => [block.blockId, block.text] as const));
  for (const finding of revision.findings) {
    const text = blocks.get(finding.sourceRange.blockId);
    expect(text).toBeDefined();
    expect(sliceGraphemes(text!, finding.sourceRange.fromGrapheme!, finding.sourceRange.toGrapheme!)).toBe(finding.quote);
  }
}

function appendToFirstBlock(book: Book): void {
  const window = book.store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks[0]!;
  const graphemes = book.store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).find((entry) => entry.blockId === block.blockId)!.graphemes;
  book.store.flushJournalEdit({
    clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId, blockId: block.blockId,
    windowStartBlockId: block.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
    fromGrapheme: graphemes, toGrapheme: graphemes, insertText: J04_EDIT_SUFFIX,
  });
}

function lineageKinds(settled: ReviewCategoryProjection): string[] {
  return settled.resultSetRevision!.lineage.map((unit) => unit.kind);
}

describe('a review category over the real store on exact sample1', () => {
  it('reviews the whole manuscript, anchors every finding it keeps, and after an acknowledged edit reviews only what changed', async () => {
    await withBook(async (book) => {
      const first = await review(book, TYPOS_AND_USAGE, { mode: 'review-first', selectedRange: null });
      const revision = first.resultSetRevision!;
      expect(first.kind).toBe('editorial-review/typos-and-usage');
      expect(revision.ordinal).toBe(1);
      expect(revision.contractVersion).toBe(EDITORIAL_REVIEW_CONTRACT_VERSION);
      expect(revision.adapterPin).toMatchObject({ route: 'ai7-local-deterministic', fixtureIdentity: 'sample1-review-authored' });
      expect(revision.category).toEqual({ categoryId: 'typos-and-usage', label: '错别字与规范用语', output: 'change-suggestion', riskPointsOnly: false });
      expect(revision.assurance.statement).toBe(REVIEW_CATEGORY_ASSURANCE_STATEMENT);
      // Every finding of a 修改建议 category proposes its replacement; the two the fixture wrote to fail
      // Reference Integrity sit in the excluded appendix with their reasons, and never become marks.
      expect(revision.findings.length).toBeGreaterThan(0);
      expect(revision.findings.every((finding) => finding.replacement !== null && finding.findingId.startsWith('rfd_'))).toBe(true);
      expect(revision.excluded.map((excluded) => excluded.reason).sort()).toEqual(['quote-ambiguous', 'quote-not-found']);
      expect(revision.findingCounts.listed).toBe(revision.findingCounts.located + revision.findingCounts.excluded);
      expect(revision.findingCounts.located).toBe(revision.findings.length + revision.findingCounts.merged);
      expect(lineageKinds(first)).toEqual(Array(8).fill('recomputed'));
      expect(revision.gaps).toEqual([]);
      requireAnchored(book, first);

      // Nothing changed yet, so there is nothing to review again by change.
      const sync = first.updateControls!.actions['review-sync'];
      expect(sync.available).toBe(false);
      expect(sync.unavailableReason).toBe('结果集修订版仍绑定当前稿件；只有在已确认编辑使精确修订版新鲜度为“已过期”后才可只审改动过的章。');

      appendToFirstBlock(book);
      expect(book.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(TYPOS_AND_USAGE)).updateControls!.actions['review-sync'].available).toBe(true);
      const second = await review(book, TYPOS_AND_USAGE, { mode: 'review-sync', selectedRange: null });
      const successor = second.resultSetRevision!;
      expect(successor.ordinal).toBe(2);
      expect(successor.update.counts).toMatchObject({ recomputed: 1, reused: 7, unreviewed: 0 });
      expect(lineageKinds(second)).toEqual(['recomputed', ...Array(7).fill('reused')]);
      expect(successor.gaps).toEqual([]);
      // The same words in the same place are the same finding: identities carry across the revisions.
      expect(successor.findings.map((finding) => finding.findingId).sort()).toEqual(revision.findings.map((finding) => finding.findingId).sort());
      requireAnchored(book, second);
    });
  });

  it('starts with one range, leaves every other unit unreviewed, and carries the first range forward when another is reviewed', async () => {
    await withBook(async (book) => {
      const first = await review(book, LITERARY_EXPRESSION, { mode: 'review-first-range', selectedRange: { startPosition: 16, endPosition: 43 } });
      const revision = first.resultSetRevision!;
      const counts = revision.update.counts;
      expect(revision.update.predecessor).toBeNull();
      expect(counts.reused).toBe(0);
      expect(counts.recomputed).toBeGreaterThan(0);
      expect(counts.unreviewed).toBeGreaterThan(0);
      expect(counts.recomputed + counts.unreviewed).toBe(8);
      // A unit outside the range was never sent: it is a gap of its own kind, named for the editor.
      const outOfScope = revision.gaps.filter((gap) => gap.code === 'out-of-scope');
      expect(outOfScope).toHaveLength(counts.unreviewed);
      expect(outOfScope.every((gap) => gap.reason === '不在本次审阅范围内')).toBe(true);
      expect(revision.coverage.unitsOutOfScope).toBe(counts.unreviewed);
      expect(revision.units.filter((unit) => unit.state === 'closed')).toHaveLength(counts.recomputed);
      requireAnchored(book, first);
      const reviewedFirst = revision.lineage.filter((unit) => unit.kind === 'recomputed').map((unit) => unit.unitOrdinal);

      const second = await review(book, LITERARY_EXPRESSION, { mode: 'review-range', selectedRange: { startPosition: 60, endPosition: 75 } });
      const successor = second.resultSetRevision!;
      const reused = successor.lineage.filter((unit) => unit.kind === 'reused').map((unit) => unit.unitOrdinal);
      const recomputed = successor.lineage.filter((unit) => unit.kind === 'recomputed').map((unit) => unit.unitOrdinal);
      expect(successor.ordinal).toBe(2);
      expect(reused).toEqual(reviewedFirst.filter((ordinal) => !recomputed.includes(ordinal)));
      expect(recomputed.length).toBeGreaterThan(0);
      expect(successor.update.counts.unreviewed).toBe(8 - reused.length - recomputed.length);
      requireAnchored(book, second);
    });
  });

  it('reads every unit afresh when reviewed again, even with nothing changed', async () => {
    await withBook(async (book) => {
      const first = await review(book, STYLE_AND_FORMAT, { mode: 'review-first', selectedRange: null });
      expect(first.resultSetRevision!.findings.every((finding) => finding.replacement === null)).toBe(true);
      expect(first.resultSetRevision!.excluded.map((excluded) => excluded.reason)).toEqual(['quote-not-found']);
      const again = await review(book, STYLE_AND_FORMAT, { mode: 'review-again', selectedRange: null });
      expect(again.resultSetRevision!.update.counts).toMatchObject({ recomputed: 8, reused: 0, unreviewed: 0, bypassed: 8 });
      expect(lineageKinds(again)).toEqual(Array(8).fill('recomputed'));
    });
  });

  it('holds one Result Set per category beside each other and runs their Tasks through the one owner\'s places', async () => {
    // One place (Issue #49, S14): the places are the owner's and not a ledger's, whatever their number.
    await withBook(async (book) => {
      const typos = prepareAndAuthorize(book, TYPOS_AND_USAGE, { mode: 'review-first', selectedRange: null });
      const style = prepareAndAuthorize(book, STYLE_AND_FORMAT, { mode: 'review-first', selectedRange: null });
      const typosLedger = book.store.reviewCategoryLedger(reviewCategoryKindDefinition(TYPOS_AND_USAGE));
      const styleLedger = book.store.reviewCategoryLedger(reviewCategoryKindDefinition(STYLE_AND_FORMAT));
      book.owner.admitAndDispatch(typos.runRecordId, typosLedger);
      // The place is the owner's and not a ledger's: a second category waits for the first.
      let refused: unknown = null;
      try {
        book.owner.admitAndDispatch(style.runRecordId, styleLedger);
      } catch (error) {
        refused = error;
      }
      expect(refused).toBeInstanceOf(ExecutionAdmissionError);
      expect((refused as ExecutionAdmissionError).code).toBe('EXECUTION_BUSY');
      await book.owner.whenIdle();
      book.owner.admitAndDispatch(style.runRecordId, styleLedger);
      await book.owner.whenIdle();
      const settledTypos = book.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(TYPOS_AND_USAGE));
      const settledStyle = book.store.inspectReviewCategory(book.bookId, reviewCategoryKindDefinition(STYLE_AND_FORMAT));
      expect([settledTypos.state, settledStyle.state]).toEqual(['settled', 'settled']);
      expect(settledTypos.resultSetRevision!.resultSetId).not.toBe(settledStyle.resultSetRevision!.resultSetId);
      // The baseline kind's own Result Set is untouched by either.
      expect(book.store.inspectBaselineAnalysis(book.bookId).resultSetRevision).toBeNull();
    }, 1);
  });
});
