import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EditorialStore } from '../../../src/service/store.js';
import { BoundedManuscriptStore } from '../../../src/service/bounded-manuscript.js';
import { BaselineAnalysisStore } from '../../../src/service/analysis/baseline-analysis-store.js';
import { BaselineAnalysisExecutionOwner } from '../../../src/service/analysis/execution.js';
import { baselineAnalysisKindDefinition } from '../../../src/service/analysis/kind-definition.js';
import { sliceGraphemes } from '../../../src/service/analysis/factual-review-contract.js';
import { withAmbiguousClarificationValidation } from '../../../src/service/provider/clarification-contract.js';
import type { ResolvedModelFixture } from '../../../src/service/provider/model-fixture.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type LaunchPolicyProjection } from '../../../src/shared/protocol.js';
import { graphemesOf } from '../../../src/shared/mark-anchor.js';
import { caseRequestGovernor, type CaseRoots, type ImportedBook, workingBlocks } from './session.js';

/**
 * The inputs three replayed cases need besides the manuscript, each rebuilt exactly as the earlier evidence made it, so the
 * recorded captures answer the same questions: #865's baseline analysis asked normally and with the declared ambiguous-focus
 * instruction, #813's finalized news release, and #809's sample1-derived 资料库 item.
 */

/** One baseline analysis Run on the fixture's deterministic route, its model questions answered once with the first option. */
export async function clarificationRun(store: EditorialStore, dataRoot: string, fixture: ResolvedModelFixture, book: ImportedBook, policy: LaunchPolicyProjection, ambiguous: boolean) {
  const database = new DatabaseSync(resolve(dataRoot, 'store', 'ai7.sqlite'));
  database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  const route = { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage };
  const definition = ambiguous ? withAmbiguousClarificationValidation(baselineAnalysisKindDefinition()) : baselineAnalysisKindDefinition();
  const ledger = new BaselineAnalysisStore(database, new BoundedManuscriptStore(database), route, definition);
  ledger.bindLaunch({ operationalScope: 'development-ci', live: null, policy, localFixtureRuntime: () => store.localFixtureRuntime() });
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor: caseRequestGovernor(store), ledger, launchPolicy: policy, fixture, secretResolver: { resolve: async () => null } });
  try {
    let work = ledger.prepare({ phase: 'start', bookId: book.bookId, goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false, launchPolicy: policy });
    while (!work.done) work = ledger.prepare({ phase: 'advance', workId: work.workId! });
    const prepared = work.projection!;
    const taskIntentId = prepared.taskIntent!.taskIntentId;
    const runId = ledger.authorize(book.bookId, taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
    owner.admitAndDispatch(runId);
    await owner.whenIdle();
    const questions = ledger.clarificationsOf(runId).filter((request) => request.origin === 'model');
    for (const request of questions) ledger.recordClarificationAnswer(book.bookId, { taskIntentId, requestId: request.requestId, optionId: 'model-option-0', note: null });
    if (questions.length > 0) {
      owner.continueAnswered(runId);
      await owner.whenIdle();
    }
    const settled = ledger.inspect(book.bookId);
    return {
      state: settled.run?.state ?? 'none', unitsClosed: settled.resultSetRevision?.coverage.unitsClosed ?? 0, gaps: settled.resultSetRevision?.coverage.gapCount ?? 0,
      questions: questions.length, unitsAsked: [...new Set(questions.map((request) => request.unitOrdinal))].sort((a, b) => a - b),
      answered: ledger.clarificationsOf(runId).filter((request) => request.origin === 'model' && request.answer !== null).length,
    };
  } finally {
    await owner.dispose();
    database.close();
  }
}

/**
 * #813's participant: sample1 imported again as source-only, a 新闻稿 Production Document made from it, every block cleared
 * through the editor's bounded edits, its title and first paragraph set to the live item's exact sample1-derived words (the
 * first 200 graphemes of the first paragraph over 100 characters that holds a Chinese numeral, its first numeral made 九), then
 * saved and finalized — exactly `tests/service/cross-deliverable-consistency.test.ts`'s `recordedDocument`.
 */
export async function finalizedNewsRelease(store: EditorialStore, codeRoot: string, dataRoot: string, book: ImportedBook): Promise<void> {
  const database = new DatabaseSync(resolve(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  let sourceVersionId: string;
  try {
    sourceVersionId = database.prepare('SELECT source_version_id FROM manuscript_revisions WHERE revision_id = ?').get(book.revisionId)!.source_version_id as string;
  } finally { database.close(); }
  const staged = await store.stageSelectedManuscript(randomUUID(), join(codeRoot, 'SampleBooks', 'sample1.docx'));
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion, { kind: 'existing-book', bookId: book.bookId, relationship: 'source-only', reuseSourceVersionId: sourceVersionId });
  const commitId = randomUUID();
  const committed = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  const documentId = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId: committed.sourceVersionId })).document!.documentId;
  const documentOf = () => store.inspectProductionDocuments(book.bookId).types.find((type) => type.document?.documentId === documentId)!.document!;
  const passage = workingBlocks(store, book).find((block) => block.kind === 'paragraph' && block.text.length > 100 && /[一二三四五六七八〇○]/u.test(block.text))!;
  const composed = sliceGraphemes(passage.text, 0, 200).replace(/[一二三四五六七八〇○]/u, '九');
  let placed = false;
  const branchId = documentOf().branchId;
  for (const block of store.baselineAnalysisLedger.readWorkingBlocks(branchId)) {
    const replacement = block.kind === 'title' ? 'sample1 新闻稿（合成比对）' : !placed && block.kind === 'paragraph' ? (placed = true, composed) : '';
    const replace = (from: number, to: number, insertText: string) => {
      const window = store.getManuscriptWindowAt(documentId, branchId, { kind: 'block', blockId: block.blockId });
      const current = window.blocks.find((candidate) => candidate.blockId === block.blockId)!;
      store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: documentId, branchId, baseRevisionId: window.revisionId,
        windowStartBlockId: window.blocks[0]!.blockId, expectedJournalSequence: window.journalSequence,
        blockId: current.blockId, baseBlockDigest: current.digest, fromGrapheme: from, toGrapheme: to, insertText });
    };
    let remaining = graphemesOf(block.text).length;
    while (remaining > 0) { const from = Math.max(0, remaining - 256); replace(from, remaining, ''); remaining = from; }
    if (replacement.length > 0) replace(0, 0, replacement);
  }
  await store.saveProductionDocumentVersion({ bookId: book.bookId, documentId, branchId });
  for (const action of ['start', 'complete'] as const) {
    store.transitionProductionDocumentPhase({ bookId: book.bookId, documentId, phaseId: 'finalization', action,
      expectedTransitions: documentOf().workflow.transitions, reason: null });
  }
}

/**
 * #809's 资料库 item: the first two paragraphs over 40 characters of the Book as one plain-text file titled 「sample1 背景摘录」,
 * attributed to and eligible for this Book, then indexed — exactly `tests/service/live-material-references.test.ts`'s setup.
 */
export async function sample1DerivedLibraryItem(store: EditorialStore, roots: Pick<CaseRoots, 'inputRoot'>, book: ImportedBook): Promise<string> {
  const paragraphs = workingBlocks(store, book).filter((block) => block.kind === 'paragraph' && block.text.length > 40).slice(0, 2).map((block) => block.text);
  const path = join(roots.inputRoot, `${randomUUID()}.txt`);
  writeFileSync(path, paragraphs.join('\n\n'));
  const preview = await store.previewLibraryMaterial(path);
  const material = await store.addLibraryMaterial({ previewId: preview.previewId, title: 'sample1 背景摘录', kind: 'document' });
  store.decideLibraryMaterial({ materialId: material.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId: book.bookId } } });
  store.decideLibraryMaterial({ materialId: material.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
  store.startMaterialIndexing();
  await store.settleMaterialIndexing();
  return material.materialId;
}
