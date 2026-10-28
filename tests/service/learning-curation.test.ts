import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { importSample1Book } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, sourceSpanText } from '../support/composed-fixture.js';

let roots: ServiceTestRoots, store: EditorialStore, owner: BaselineAnalysisExecutionOwner;
let book: Awaited<ReturnType<typeof importSample1Book>>;
let sent: Array<{ model: string; messages: Array<{ role: string; content: string }>; tools?: unknown[] }>;
let answer: () => Promise<Response>;
const budget = { maxPasses: 2, totalTokens: 40_000, perPassTokens: 20_000 };
const inspect = () => store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
function response(proposals: unknown[] = []): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ proposals }) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 80 } }), { status: 200 });
}
function edit(text = '校订', index = 0): void {
  const view = store.getManuscriptWindow(book.manuscriptId, book.branchId, null), block = view.blocks[index]!;
  store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId,
    baseRevisionId: view.revisionId, blockId: block.blockId, windowStartBlockId: view.blocks[0]!.blockId,
    baseBlockDigest: block.digest, expectedJournalSequence: view.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: text });
}
function enable(): void { store.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: inspect().controlEntries, curation: budget }); }
async function run(): Promise<void> {
  owner.setBackgroundIdle(true); owner.startLearningCuration(store);
  await owner.whenIdle();
}

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-curation-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  book = await importSample1Book(store, roots.codeRoot, '学习整理样书');
  const allowed = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((entry) => entry.route === 'opencode-go')!;
  const connection = store.saveModelServiceConnection('Synthetic curation transport', null, 'needs-attention', 'opencode-go');
  store.saveModelServiceConnection(connection.connectionName, connection.credentialReference, 'ready', 'opencode-go');
  store.selectModelServiceRoute('opencode-go');
  const binding = { ...allowed, credentialReference: connection.credentialReference };
  const policy = resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', binding);
  store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'ordinary-production', policy,
    live: { ...binding, scope: 'ordinary-production', runBudgetCeiling: 'unset' } });
  sent = []; answer = async () => response();
  owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, requestGovernor: new ModelRequestGovernor(),
    launchPolicy: policy, currentLaunchPolicy: () => policy, fixture: null,
    secretResolver: { resolve: async () => 'synthetic-curation-test-placeholder' },
    production: { scope: 'ordinary-production', nativeFetch: async (_url, input) => {
      sent.push(JSON.parse(String(input?.body))); return answer();
    } } });
});
afterEach(async () => { await owner?.dispose(); store?.markCleanShutdown(); store?.close(); await roots.dispose(); });

describe('enabled learning curation through real Task/Run, DSH and final gate', () => {
  it('keeps old local learning capture inert until an explicit finite envelope exists', async () => {
    edit(); await run();
    expect(sent).toHaveLength(0);
    expect(inspect().curation).toMatchObject({ available: true, envelope: null, passesUsed: 0 });
    enable(); await run();
    expect(sent).toHaveLength(1);
    expect(inspect().curation).toMatchObject({ passesUsed: 1, reservedTokens: 20_000 });
    expect(inspect().items).toEqual([]);
    await run(); expect(sent).toHaveLength(1);
  });

  it('sends exact typed before/after and publishes a proposal with real lineage, without activation or votes', async () => {
    enable(); edit('e\u0301"\\😀');
    const signal = inspect().signals[0]!;
    const source = store.inspectManualLearningSource(signal.signalId).members[0]!;
    answer = async () => response([{ title: '保持语句简洁', editorialDimension: 'typos-and-usage', confidence: 0.6, exampleIds: ['e1'] }]);
    await run();
    expect(sent).toHaveLength(1); expect(sent[0]!.tools ?? []).toEqual([]);
    const packet = JSON.parse(sent[0]!.messages.find((entry) => entry.role === 'user')!.content);
    expect(packet.examples).toEqual([{ exampleId: 'e1', sourceRef: 's1', sourceKind: 'manual-edit-journal', operation: 'edit',
      before: [source.beforeText], after: [source.afterText] }]);
    const memory = inspect().items[0]!;
    expect(memory.usable).toBe(false);
    expect(memory.current).toMatchObject({ state: 'proposed', actor: 'AI7', signalIds: [signal.signalId], positiveExamples: [], negativeExamples: [] });
    expect(memory.sources?.[0]).toMatchObject({ sourceKind: 'manual-edit-journal', signalId: signal.signalId });
    expect(memory.sources?.[0]?.source).not.toHaveProperty('decisionId');
    store.acceptEditorialMemory({ itemId: memory.current.itemId, expectedVersionId: memory.current.versionId, actionId: randomUUID() });
    expect(store.inspectHouseReviewPreference().current?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '保持语句简洁', sources: expect.arrayContaining([expect.objectContaining({ decisionId: null, sourceKey: memory.sources![0]!.sourceKey })]) })]));
    store.changeEditorialLearning({ kind: 'material', signalId: signal.signalId });
    expect(inspect().items[0]!.usable).toBe(false);
    expect(store.inspectHouseReviewPreference().current?.lines.some((line) => line.owner?.itemId === memory.current.itemId)).toBe(false);
  });

  it('withholds a whole oversized source and never silently sends a prefix', async () => {
    enable();
    for (const index of [0, 1]) { for (let i = 0; i < 6; i += 1) edit('字'.repeat(200), index); edit('替换标识', index); }
    const search = store.createSearch(book.manuscriptId, book.branchId, '替换标识');
    while (!store.advanceSearch(search.searchId).done) { /* bounded preparation */ }
    const preview = store.prepareReplacement(search.searchId, '结果', []);
    while (!store.advanceReplacementWork(preview.previewId).done) { /* complete group */ }
    store.freezeReplacement(preview.previewId, []);
    while (!store.advanceReplacementWork(preview.previewId).done) { /* validate */ }
    store.commitReplacement(preview.previewId); await run();
    expect(sent).toEqual([]); expect(inspect().curation?.passesUsed).toBe(0);
    const bundle = store.prepareLearningCuration(book.bookId, [inspect().signals[0]!.signalId]);
    expect(bundle).toMatchObject({ state: 'held', emittedText: null });
    expect(bundle.coverage).toEqual([{ signalId: inspect().signals[0]!.signalId, state: 'held', reason: 'whole-bundle-held' }]);
  });

  it('rechecks exclusions after a real response and retains the spent pass without publishing', async () => {
    enable(); edit();
    answer = async () => {
      store.changeEditorialLearning({ kind: 'material', signalId: inspect().signals[0]!.signalId });
      return response([{ title: '保持语句简洁', editorialDimension: 'typos-and-usage', confidence: 0.7, exampleIds: ['e1'] }]);
    };
    await run();
    expect(sent).toHaveLength(1); expect(inspect().items).toEqual([]);
    expect(inspect().curation?.passesUsed).toBe(1);
    await run(); expect(sent).toHaveLength(1);
  });

  it('rejects invented example references and does not retry an uncertain response', async () => {
    enable(); edit();
    answer = async () => response([{ title: '保持语句简洁', editorialDimension: 'typos-and-usage', confidence: 0.7, exampleIds: ['invented'] }]);
    await run(); expect(inspect().items).toEqual([]);
    edit('新改动', 1); answer = async () => new Response('{"choices":[', { status: 200 });
    await run(); await run();
    expect(sent).toHaveLength(2); expect(inspect().curation?.passesUsed).toBe(2);
    expect(inspect().items).toEqual([]);
  });

  it.each(['suggestions', 'accepted-baseline'] as const)('curates the actual Word %s pair without inventing a decision', async (mode) => {
    enable();
    const file = join(roots.inputRoot, `curation-${mode}.docx`), before = { block: 9, from: 0, to: 5 }, after = { block: 10, from: 0, to: 6 };
    await composeRevisedDocx(file, { source: ADMITTED_BASELINE_DOCX, title: 'Word 学习样例', paragraphs: [{ runs: [
      { text: { block: 8, from: 0, to: 10 } },
      { text: before, revision: { kind: 'del', author: '原修订作者', date: '2026-10-25T00:00:00Z' } },
      { text: after, revision: { kind: 'ins', author: '原修订作者', date: '2026-10-25T00:00:00Z' } },
    ] }] });
    const draft = await store.stageSelectedManuscript(randomUUID(), file);
    const review = store.prepareNewBookReview(draft.draftId, draft.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: 'Word 学习样例' }, false, 'retain',
      { mode, learnFromEdits: true, acceptedBaselineConfirmed: mode === 'accepted-baseline' });
    const commitId = randomUUID();
    await store.commitNewBookImport({ draftId: draft.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
    await store.acknowledgeImportCompletion(commitId);
    await run();
    expect(sent).toHaveLength(1);
    const packet = JSON.parse(sent[0]!.messages.find((entry) => entry.role === 'user')!.content);
    expect(packet.examples).toEqual([{ exampleId: 'e1', sourceRef: 's1', sourceKind: 'word-tracked-edit', operation: 'replace', intakeMode: mode,
      before: [{ kind: 'text', text: await sourceSpanText(ADMITTED_BASELINE_DOCX, before) }],
      after: [{ kind: 'text', text: await sourceSpanText(ADMITTED_BASELINE_DOCX, after) }] }]);
  });

  it('retains a pending Run and its budget across restart without retrying its batch', async () => {
    enable(); edit();
    const pending = store.nextLearningCuration()!;
    expect(pending.runRecordId).toMatch(/^[0-9a-f-]{36}$/u);
    const launch = store.baselineAnalysisLedger.launch;
    await owner.dispose(); store.markCleanShutdown(); store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot); store.baselineAnalysisLedger.bindLaunch(launch);
    store.baselineAnalysisLedger.reconcileCuration();
    expect(inspect().curation).toMatchObject({ passesUsed: 1, reservedTokens: 20_000,
      recentRuns: [expect.objectContaining({ runRecordId: pending.runRecordId, state: 'interrupted' })] });
    expect(store.nextLearningCuration()).toBeNull(); expect(sent).toEqual([]);
  });
});
