import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { EditorialStore } from '../../src/service/store.js';
import { loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { buildCorpusSource } from '../fixtures/docx-fidelity/builder.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from './sample1-baseline.js';
import type { ServiceTestRoots } from './temp-data-root.js';
import { legacyFixtureService } from './upgrade-sample1.js';

type Book = Awaited<ReturnType<typeof importSample1Book>>;
type LegacyService = Awaited<ReturnType<typeof legacyFixtureService>>;
type RehearsalFixture = ResolvedModelFixture & { entries: Map<string, ModelFixtureEntry> };

/** Reuse answer bytes in the local route, without claiming the original provider request identity. */
function bindAnswer(service: LegacyService, fixture: RehearsalFixture, { capture: _capture, ...entry }: ModelFixtureEntry, requestDigest: string) {
  fixture.entries.set(service.fixtureEntryKey(entry.unitOrdinal, requestDigest, entry.attempt), { ...entry, requestDigest });
}

function bindRecordedEvaluation(service: LegacyService, store: EditorialStore,
  plan: NonNullable<ReturnType<EditorialStore['createInitialEvaluationPreparationWork']>['projection']>,
  recorded: ResolvedModelFixture, fixture: RehearsalFixture) {
  const digest = plan.planEnvelope!.promptContractDigest;
  const definition = store.initialEvaluationLedger.definition;
  // v41 captured a different policy envelope. Bind the unchanged recorded responses to the
  // released local route's requests for the same ordinal and exact SampleBook.
  const closed = plan.coverageManifest!.units.map(unit => {
    const entry = [...recorded.entries.values()].find(answer => answer.unitOrdinal === unit.ordinal)!;
    if (entry.response.kind !== 'unit-result') throw Error('Missing recorded evaluation unit response');
    bindAnswer(service, fixture, entry, definition.requestDigest(unit.ordinal, unit.digest));
    return { unitOrdinal: unit.ordinal, result: JSON.parse(entry.response.text) };
  });
  const synthesis = [...recorded.entries.values()].find(entry => entry.unitOrdinal === 0 &&
    entry.response.kind === 'unit-result' && entry.response.text.includes('ai7.evaluation.synthesis-result/2'))!;
  const set = service.initialEvaluationObservationSetDigest(closed);
  bindAnswer(service, fixture, synthesis, service.taskSynopsisRequestDigest(service.initialEvaluationSynthesisRequestDigest(digest, set),
    plan.executionPlan?.baselineSynopsisContext));
}

async function recordReports(service: LegacyService, store: EditorialStore, bookId: string,
  fixture: RehearsalFixture, recordedBaseline: ResolvedModelFixture, recordedEvaluation: ResolvedModelFixture,
  summary: ModelFixtureEntry, roots: ServiceTestRoots) {
  const policy = await service.resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  const requestGovernor = new service.ModelRequestGovernor();
  const owner = new service.BaselineAnalysisExecutionOwner({
    requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture,
    secretResolver: { resolve: async () => { throw Error('A fixture must never ask for a credential'); } },
  });
  const steps = store.reviewRunDriveSteps;
  const driver = new service.ReviewRunDriver({ ...steps,
    start(reviewRunId, categoryId) {
      const handoff = steps.start(reviewRunId, categoryId);
      if (categoryId === 'run-synthesis' && handoff !== null) {
        bindAnswer(service, fixture, summary, handoff.ledger.definition.crossUnit!.step!.requestDigest([]));
      }
      return handoff;
    },
  }, owner);
  try {
    let analysis = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, policy);
    while (!analysis.done) analysis = store.advanceBaselineAnalysisPreparationWork(analysis.workId!);
    const { taskIntent, planEnvelope, coverageManifest } = analysis.projection!;
    for (const unit of coverageManifest!.units) {
      const entry = [...recordedBaseline.entries.values()].find(answer => answer.unitOrdinal === unit.ordinal)!;
      const requestDigest = store.baselineAnalysisLedger.definition.requestDigest(unit.ordinal, unit.digest);
      bindAnswer(service, fixture, entry, requestDigest);
    }
    const baseline = store.authorizeBaselineAnalysis(bookId, taskIntent!.taskIntentId, planEnvelope!.digest);
    owner.admitAndDispatch(baseline.dispatchRunRecordId!);
    await owner.whenIdle();
    expect(store.inspectBaselineAnalysis(bookId).resultSetRevision).toBeTruthy();

    let review = store.createReviewRunPreparationWork(bookId, ['typos-and-usage'],
      { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy);
    while (!review.done) review = store.advanceReviewRunPreparationWork(review.workId!);
    const run = review.projection!.run!;
    store.authorizeReviewRun(bookId, run.reviewRunId, run.categories.flatMap(category =>
      category.planEnvelopeDigest === null ? [] : [{ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest }]));
    await driver.drive(run.reviewRunId);
    const reviewed = store.generateReviewReport(bookId, run.reviewRunId).run!;
    expect(reviewed.findings.length).toBeGreaterThan(0);
    expect(reviewed.synthesis?.state).toBe('completed');

    let evaluation = store.createInitialEvaluationPreparationWork(bookId, policy);
    while (!evaluation.done) evaluation = store.advanceInitialEvaluationPreparationWork(evaluation.workId!);
    const prepared = evaluation.projection!;
    bindRecordedEvaluation(service, store, prepared, recordedEvaluation, fixture);
    const authorized = store.authorizeInitialEvaluation(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    owner.admitOrQueue(authorized.dispatchRunRecordId!, store.initialEvaluationLedger);
    await owner.whenIdle();
    expect(store.inspectEvaluation(bookId, null).initial.latest).toBeTruthy();
    store.startEvaluation(bookId, true);
    return run.reviewRunId;
  } finally {
    const stopped = driver.dispose();
    await owner.dispose();
    await stopped;
    requestGovernor.close();
    await requestGovernor.whenIdle();
  }
}

async function addDerivative(store: EditorialStore, bookId: string, roots: ServiceTestRoots) {
  const path = join(roots.inputRoot, 'illustrated-sample1.docx');
  await writeFile(path, await buildCorpusSource('sample1'));
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
    { kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: null });
  const commitId = randomUUID();
  const source = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  const created = await store.createProductionDocument({ bookId, typeId: 'news-release', sourceVersionId: source.sourceVersionId });
  const { documentId, branchId } = created.document!;
  const window = store.getManuscriptWindow(documentId, branchId, null);
  const block = window.blocks[0]!;
  store.flushJournalEdit({
    manuscriptId: documentId, branchId, clientEditId: randomUUID(), baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence, windowStartBlockId: block.blockId, blockId: block.blockId,
    baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: 0, insertText: '〔校改〕',
  });
  const saved = await store.saveProductionDocumentVersion({ bookId, documentId, branchId });
  expect(saved.document!.versions).toHaveLength(2);
  return { documentId, branchId, revisionId: saved.document!.versions[0]!.revisionId, sourcePath: path };
}

export async function importRehearsalDocx(store: EditorialStore, path: string, title: string) {
  const commitId = randomUUID();
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const choice = staged.targetChoices.find(item => item.kind === 'new-book')!;
  const tracked = staged.wordTrackedChanges === undefined ? undefined :
    { mode: 'suggestions' as const, learnFromEdits: false, acceptedBaselineConfirmed: false };
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: choice.id as 'new-book' | 'new-book-distinct-intended-work', confirmedTitle: title }, true, 'retain', tracked);
  const committed = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return committed;
}

function addEditorMark(store: EditorialStore, book: Book) {
  const { manuscriptId, branchId } = book;
  const window = store.getManuscriptWindow(manuscriptId, branchId, null);
  const block = window.blocks.find(candidate => candidate.kind === 'paragraph' && candidate.text.length > 0)!;
  const first = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(block.text)][0]!.segment;
  const binding = { manuscriptId, branchId, windowStartBlockId: window.blocks[0]!.blockId };
  const mark = store.createEditorialMark({
    ...binding, clientMarkId: randomUUID(), baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence, blockId: block.blockId, baseBlockDigest: block.digest,
    fromGrapheme: 0, toGrapheme: 1, selectedText: first, kind: 'change-suggestion',
    highlightColor: null, body: '', proposedText: first + first, rationale: null,
  });
  store.applyChangeSuggestion({ ...binding, markId: mark.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
  const current = store.getManuscriptWindow(manuscriptId, branchId, null);
  const changed = current.blocks.find(candidate => candidate.blockId === block.blockId)!;
  store.createEditorialMark({
    ...binding, clientMarkId: randomUUID(), baseRevisionId: current.revisionId, expectedJournalSequence: current.journalSequence,
    blockId: changed.blockId, baseBlockDigest: changed.digest, fromGrapheme: 0, toGrapheme: 1, selectedText: first,
    kind: 'personal-highlight', highlightColor: 1, body: '', proposedText: null, rationale: null,
  });
}

function addEditorialMemory(store: EditorialStore, book: Book, reviewRunId: string) {
  const run = store.inspectReviewWorkspace(book.bookId, reviewRunId).run!;
  const findings = run.findings.filter(finding => finding.markId !== null).slice(0, 2);
  expect(findings).toHaveLength(2);
  for (const finding of findings) {
    store.recordChangeSuggestionDecision({ manuscriptId: book.manuscriptId, branchId: book.branchId,
      windowStartBlockId: finding.blockId, markId: finding.markId!, clientDecisionId: randomUUID(),
      disposition: 'rejected', editedText: null, reason: '保留作者用语。' });
  }
  const learning = () => store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
  const signals = learning().signals;
  expect(signals).toHaveLength(2);
  for (const [index, signal] of signals.entries()) {
    const title = index === 0 ? '本社用语' : '本书用语';
    const applicability = index === 0 ? { kind: 'house' as const } : { kind: 'book' as const, bookId: book.bookId };
    store.createEditorialMemory({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(),
      signalIds: [signal.signalId], applicability, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
    const current = () => learning().items.find(item => item.current.title === title)!.current;
    const accept = current();
    store.acceptEditorialMemory({ itemId: accept.itemId, expectedVersionId: accept.versionId, actionId: randomUUID() });
    if (index === 1) {
      const stop = current();
      store.deactivateEditorialMemory({ itemId: stop.itemId, expectedVersionId: stop.versionId, actionId: randomUUID() });
    }
  }
}

export async function writeLegacyLibrary(roots: ServiceTestRoots, revision: string) {
  const service = await legacyFixtureService(roots.dataRoot, roots.codeRoot, revision);
  const fixtureRoot = join(roots.codeRoot, 'tests', 'fixtures', 'model');
  const [baseline, review, evaluation, summary] = await Promise.all([
    'sample1-recorded-v41-baseline', 'sample1-recorded-v41-review-typos-and-usage',
    'sample1-recorded-v41-evaluation-initial', 'sample1-recorded-v2-editorial-quality-review',
  ].map(identity => loadModelFixture(fixtureRoot, identity)));
  // The v41 fixtures have category reports but no recorded whole-book synthesis.
  const summaryEntry = [...summary!.entries.values()].find(entry =>
    entry.response.kind === 'unit-result' && entry.response.text.includes('ai7.review.run-synthesis-result/1'))!;
  const fixture = { ...baseline!, entries: new Map(baseline!.entries) };
  for (const entry of review!.entries.values()) bindAnswer(service, fixture, entry, entry.requestDigest);
  const open = (root: string) => service.EditorialStore.open(root, service.checkout);
  const store = await service.EditorialStore.open(roots.dataRoot, service.checkout, {
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage, reviewContractVersion: 1 },
  });
  try {
    const book = await importSample1Book(store, roots.codeRoot, 'sample1');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, '验收连接');
    const reviewRunId = await recordReports(service, store, book.bookId, fixture, baseline!, evaluation!, summaryEntry, roots);
    addEditorialMemory(store, book, reviewRunId);
    const derivative = await addDerivative(store, book.bookId, roots);
    const illustrated = await importRehearsalDocx(store, derivative.sourcePath, '插图书稿');
    const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '第一校', 'stage-archive', null, '');
    addEditorMark(store, book);
    const backup = await store.setScheduledBackup({ enabled: true, expectedOrdinal: store.inspectScheduledBackups().ordinal });
    await store.setScheduledBackup({ enabled: false, expectedOrdinal: backup.ordinal });
    return { book, derivative, illustrated, milestone, reviewRunId, open };
  } finally {
    store.markCleanShutdown();
    store.close();
  }
}
