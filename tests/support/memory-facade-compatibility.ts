import { strictEqual, ok } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { EditorialStore } from '../../src/service/store.js';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { parseReviewCategoryUnitMessageHeader } from '../../src/service/review/review-category-contract.js';
import { parseUnitMessageHeader } from '../../src/service/analysis/contract.js';
import { parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { DialogueExecutionOwner, productionDialogueRoute } from '../../src/service/dialogue/dialogue-execution.js';
import { prepareGlobalAgentDisclosure, startGlobalAgentTurn } from '../../src/service/dialogue/global-agent-session.js';
import { FastRoleExecutionOwner, productionFastRoleRoutes } from '../../src/service/fast-role/fast-role-execution.js';
import { FastRoleRequests } from '../../src/service/fast-role/fast-role-suggestions.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type DialogueSelectionInput } from '../../src/shared/protocol.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { capturedOrdinaryExecution } from './captured-ordinary-transport.js';
import { createServiceTestRoots } from './temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from './sample1-baseline.js';
import { sample1SynthesisAnswer } from './review-synthesis-answer.js';
import { composeRevisedDocx, ADMITTED_BASELINE_DOCX } from './composed-fixture.js';

/** The same public editor operations are interpreted by the exact base and by the candidate. No expected value is built here. */
export async function memoryCompatibilityPacket() {
  const timing: Array<{ surface: string; operation: string; inTransaction: boolean }> = [];
  let surface = 'open';
  const prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql: string) {
    const operation = /^\s*(SELECT|INSERT|UPDATE|DELETE)/u.exec(sql)?.[1];
    if (operation !== undefined && /(?:house_review_preference_versions|review_run_preference_pins|learning_signals|learning_supervision_directives|global_editorial_memory_item_versions)/u.test(sql)) {
      const point = { surface, operation, inTransaction: this.isTransaction };
      if (!timing.some(entry => entry.surface === point.surface && entry.operation === point.operation && entry.inTransaction === point.inTransaction)) timing.push(point);
    }
    return prepare.call(this, sql);
  };
  const roots = await createServiceTestRoots('ai7-memory-compatibility-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null,
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  const governor = new ModelRequestGovernor();
  const requests: Array<{ surface: string; body: string }> = [];
  const snapshots: Record<string, unknown> = {};
  surface = 'source-review';
  const capture = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, governor, (request, message) => {
    const synthesis = sample1SynthesisAnswer(message);
    if (synthesis !== undefined) return synthesis;
    const review = parseReviewCategoryUnitMessageHeader(message);
    const baseline = parseUnitMessageHeader(message);
    const factual = parseFactualReviewUnitMessageHeader(message);
    let response: object = { items: [], findings: [], notes: [] };
    if (review !== null) response = { schema: 'ai7.editorial-review.unit-result/2', unitOrdinal: review.ordinal,
      findings: review.ordinal !== 1 ? [] : [...message.matchAll(/^\[([1-9][0-9]*)\] \[blk_[0-9a-f]{24}\] \((?:title|heading|paragraph)(?: h[1-6])?\) (.*)$/gmu)]
        .filter(match => match[2]!.length >= 10 && match[2]!.length <= 80).slice(0, 2).map(match => ({
          quote: match[2]!, blockOrdinal: Number(match[1]), severity: 'should', note: '统一编辑尺度。', replacement: match[2]! + '合成' })) };
    else if (baseline !== null) response = { synopsis: '本章按已写明的叙述展开。', entities: [], events: [], relationships: [], settingClaims: [], conflicts: [], unresolved: [] };
    else if (factual !== null) response = { schema: 'ai7.factual-claim-extraction/1', unitOrdinal: factual.ordinal, assertions: [] };
    else if (request.stage === 'assurance-sampling') response = { schema: 'ai7.analysis.assurance-sampling-result/1',
      dispositions: parseAssuranceSamplingListedRefs(message).map(ref => ({ ref, disposition: '成立', reason: '样书回归。' })) };
    return { kind: 'unit-result', text: JSON.stringify(response), usage: { inputTokens: 40, outputTokens: 20 } };
  });
  await capture.owner.dispose();
  const ordinaryFetch: typeof fetch = (url, init) => {
    const body = String(init?.body);
    requests.push({ surface: body.includes('ai7.review.run-synthesis-input/1') ? surface + '-synthesis' : surface, body });
    return capture.nativeFetch(url, init);
  };
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor: governor, ledger: store.baselineAnalysisLedger,
    launchPolicy: capture.policy, currentLaunchPolicy: () => capture.policy, fixture: null,
    productionPolicyFor: binding => resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', binding),
    production: { scope: 'ordinary-production', nativeFetch: ordinaryFetch }, secretResolver: { resolve: async () => 'synthetic-compatibility' } });
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  let dialogue: DialogueExecutionOwner | undefined;
  let fast: FastRoleExecutionOwner | undefined;
  const book = await importSample1Book(store, roots.codeRoot, 'sample1 记忆兼容');
  await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
  const read = (name: string) => {
    snapshots[name] = Object.fromEntries(['baseline-manuscript-analysis', 'editorial-dialogue', 'global-agent', 'factual-review', 'custom-analysis/plot-consistency']
      .map(kind => [kind, store.editorialMemory(kind === 'global-agent' ? null : book.bookId, kind)]));
  };
  const guide = (categoryId: string, text: string, scope: { kind: 'house' } | { kind: 'book'; bookId: string } = { kind: 'house' }) =>
    store.recordLearningSupervision({ operation: 'create', targets: [], scope, categoryId, text, effect: 'guide', actionId: randomUUID() });
  const review = async (categories: string[]) => {
    const phase = surface; surface = phase + '-prepare';
    const launched = store.launchReviewRun({ bookId: book.bookId, clientCommandId: randomUUID(), categoryIds: categories,
      ...(categories.includes('factual-review') ? { evidenceAssuranceLevel: 'quick' as const } : {}), scope: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } }, capture.policy);
    const id = launched.projection.run!.reviewRunId;
    surface = phase; await driver.driveLaunch(id);
    const result = store.inspectReviewWorkspace(book.bookId, id).run!;
    strictEqual(result.state, 'settled');
    return result;
  };
  try {
    read('empty');
    for (const category of ['typos-and-usage', 'style-and-format', 'plot-consistency', 'factual-review', 'academic-integrity']) guide(category, '本社保留原有叙述尺度：' + category);
    guide('style-and-format', '本书采用已确认的体例。', { kind: 'book', bookId: book.bookId });
    read('house-and-book');
    const source = await review(['typos-and-usage']);
    ok(source.findings.length > 0);
    for (const finding of source.findings) store.recordChangeSuggestionDecision({ manuscriptId: book.manuscriptId, branchId: book.branchId,
      windowStartBlockId: finding.blockId, markId: finding.markId!, clientDecisionId: randomUUID(), disposition: 'accepted-with-edit',
      editedText: '编辑确认的合成表达。', reason: '保留叙述节奏。' });
    const signals = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals;
    ok(signals.length > 0);
    store.createEditorialMemory({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(), signalIds: signals.map(signal => signal.signalId),
      applicability: { kind: 'house' }, title: '保持叙述节奏并统一体例。', editorialDimension: 'typos-and-usage', confidence: 0.7 });
    const memory = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).items[0]!.current;
    store.acceptEditorialMemory({ itemId: memory.itemId, expectedVersionId: memory.versionId, actionId: randomUUID() });
    read('accepted');
    const procedure = store.procedureLibrary({ action: 'inspect' }).procedures.find(entry => entry.executorKind === 'baseline-manuscript-analysis')!;
    const edited = store.procedureLibrary({ action: 'save', input: { procedureId: procedure.procedureId,
      basedOn: { procedureId: procedure.procedureId, version: procedure.version, digest: procedure.digest }, title: procedure.document.title,
      editorInstruction: '仅按已给出的叙述作出判断。', stages: procedure.document.stages.map((stage, index) => index === 1 ? { ...stage, exemptionRules: ['保留明确写出的设定。'] } : stage) } }).procedures.find(entry => entry.procedureId === procedure.procedureId)!;
    store.procedureLibrary({ action: 'select', bookId: book.bookId, procedure: { procedureId: edited.procedureId, version: edited.version, digest: edited.digest } });
    surface = 'analysis-prepare';
    const launched = store.launchBaselineAnalysis({ bookId: book.bookId, clientCommandId: randomUUID(), goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }, capture.policy);
    surface = 'analysis';
    owner.admitAndDispatch(launched.runRecordId, store.baselineAnalysisLedger); await owner.whenIdle();
    strictEqual(store.baselineAnalysisLedger.currentRunState(launched.runRecordId), 'completed');
    surface = 'review';
    const reviewed = await review(['typos-and-usage', 'style-and-format']);
    snapshots.reviewAttribution = reviewed.findings.map(finding => finding.referencedRuleVersions);
    snapshots.reviewSynthesis = reviewed.synthesis;
    surface = 'factual-first';
    const search = store.saveSearchBackendCredential('search-tinyfish', null, 'needs-attention');
    store.saveSearchBackendCredential('search-tinyfish', search.credentialReference, 'ready'); store.selectSearchBackend('search-tinyfish');
    snapshots.factualSynthesis = (await review(['factual-review', 'typos-and-usage'])).synthesis;
    const connection = store.getModelServiceRouteConnection('opencode-go')!;
    const binding = { ...capture.launch.live!, credentialReference: connection.credentialReference };
    store.selectFastRoleModel(connection.binding.providerId, binding.model);
    const policy = resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'ordinary-production', binding, binding);
    const fastFetch: typeof fetch = async (_url, init) => {
      requests.push({ surface, body: String(init?.body) });
      return new Response(JSON.stringify({ model: binding.model, choices: [{ message: { content: JSON.stringify({ schema: 'ai7.editorial-polish.result/1', suggestions: [] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 20 } }), { status: 200 });
    };
    surface = 'fast-role';
    fast = new FastRoleExecutionOwner({ requestGovernor: governor, fixture: null, live: productionFastRoleRoutes(
      { scope: 'ordinary-production', nativeFetch: fastFetch }, () => policy, () => connection.credentialReference, { resolve: async () => 'synthetic-compatibility' }) });
    const fastRequests = new FastRoleRequests(fast, store);
    const polished = fastRequests.polish(book.bookId, { selection: selection(store, book) }); await fastRequests.settled();
    snapshots.fast = fastRequests.inspect(book.bookId, polished.taskId);
    const dialogueFetch: typeof fetch = async (_url, init) => {
      requests.push({ surface, body: String(init?.body) });
      const chunks = [{ model: binding.model, choices: [{ index: 0, delta: { content: '请结合语境参考已确认的编辑准则。' } }] },
        { model: binding.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, { model: binding.model, choices: [], usage: { prompt_tokens: 40, completion_tokens: 20 } }];
      return new Response(chunks.map(chunk => 'data: ' + JSON.stringify(chunk) + '\n\n').join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    dialogue = new DialogueExecutionOwner({ requestGovernor: governor, records: store, fixture: null, sessionLogRoot: store.harnessSessionLogRoot,
      live: productionDialogueRoute({ scope: 'ordinary-production', nativeFetch: dialogueFetch }, () => policy, () => connection.credentialReference, { resolve: async () => 'synthetic-compatibility' }) });
    surface = 'dialogue';
    const turn = store.askAboutSelection(book.bookId, { selection: selection(store, book), question: '这一段应采用什么编辑尺度？' });
    guide('style-and-format', '在提问后派发前确认的准则。', { kind: 'book', bookId: book.bookId });
    dialogue.begin(turn); await until(() => !dialogue!.answering);
    snapshots.dialogue = store.inspectDialogue(book.bookId, turn.dialogueId, 0, id => dialogue!.liveText(id));
    surface = 'global-agent';
    const input = { kind: 'ask' as const, question: '这些编辑准则如何应用？', sources: [] };
    const disclosure = prepareGlobalAgentDisclosure(store, dialogue, policy, input);
    const global = startGlobalAgentTurn(store, dialogue, () => policy, input, disclosure.sha256);
    await until(() => !dialogue!.answering);
    snapshots.global = store.inspectGlobalAgentDialogue(global.dialogueId, id => dialogue!.liveText(id));
    for (let index = 0; index < 16; index++) guide('academic-integrity', '规则' + index + '：保持编辑尺度并注明核对依据。');
    read('line-limit');
    for (let index = 0; index < 8; index++) guide('academic-integrity', '长规则' + index + '：' + '保留本书的叙述节奏。'.repeat(12));
    read('character-limit');
    const controls = () => store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).controlEntries;
    store.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: controls() }); read('excluded');
    store.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: controls() });
    store.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: controls() }); read('disabled');
    store.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: controls() }); read('restored');
    const current = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: memory.itemId }).items[0]!.current;
    store.deactivateEditorialMemory({ itemId: current.itemId, expectedVersionId: current.versionId, actionId: randomUUID() });
    surface = 'manual-write';
    const edit = selection(store, book);
    store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: edit.manuscriptId, branchId: edit.branchId, baseRevisionId: edit.baseRevisionId,
      blockId: edit.blockId, windowStartBlockId: edit.windowStartBlockId, baseBlockDigest: edit.baseBlockDigest, expectedJournalSequence: edit.expectedJournalSequence,
      fromGrapheme: edit.fromGrapheme, toGrapheme: edit.fromGrapheme, insertText: '合成编辑' });
    surface = 'word-write';
    const path = join(roots.inputRoot, 'sample1-word-memory.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: 'sample1 Word 记忆来源', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 }, revision: { kind: 'ins', author: '编辑', date: '2026-11-16T00:00:00Z' } }] }] });
    const staged = await store.stageSelectedManuscript(randomUUID(), path);
    const prepared = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false, 'retain', { mode: 'suggestions', learnFromEdits: true, acceptedBaselineConfirmed: false });
    const commitId = randomUUID(); await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: prepared.draftVersion, reviewDigest: prepared.reviewDigest!, commitId }); await store.acknowledgeImportCompletion(commitId);
    surface = 'legacy-preference-plan';
    const legacyCredential = recordMissingCredentialConnection(store, '旧版记忆计划元数据');
    const legacyPolicy = resolveSourceCheckoutLaunchPolicySync(roots.codeRoot, 'developer-live');
    store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'developer-live', policy: legacyPolicy, live: { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: legacyCredential, runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 } } });
    const freezeLegacy = (bookId: string) => {
      let work = store.createReviewRunPreparationWork(bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, legacyPolicy);
      while (!work.done) work = store.advanceReviewRunPreparationWork(work.workId!);
      const id = work.projection!.run!.reviewRunId;
      return id;
    };
    for (let index = 0; index < 6; index++) guide('typos-and-usage', '旧版短规则' + index);
    const legacyLines = freezeLegacy(book.bookId);
    const second = await importSample1Book(store, roots.codeRoot, 'sample1 旧版字符预算');
    await pinEditorialWorkspaceProfileRevision2(store, second.bookId);
    for (let index = 0; index < 3; index++) guide('typos-and-usage', ('长' + index + '：').padEnd(100, '字'), { kind: 'book', bookId: second.bookId });
    const legacyCharacters = freezeLegacy(second.bookId);
    capture.assertMatched();
    const db = new DatabaseSync(join(roots.dataRoot, 'store/ai7.sqlite'), { readOnly: true });
    try {
      const tables = ['learning_signals', 'editorial_learning_controls', 'global_editorial_memory_items', 'global_editorial_memory_item_versions', 'house_review_preference_versions', 'learning_supervision_directives', 'review_run_preference_pins'];
      const records = Object.fromEntries(tables.map(table => [table, db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]));
      const envelopes = db.prepare("SELECT t.kind,p.canonical_json,p.sha256 FROM analysis_plan_records p JOIN analysis_task_intents t ON t.task_intent_id=p.task_intent_id WHERE p.component='plan-envelope' ORDER BY p.rowid").all();
      const frozen = envelopes.map(row => { const value = JSON.parse(String(row.canonical_json)); return { kind: row.kind, editorialMemory: value.editorialMemory, editorialMemoryBasePromptContractDigest: value.editorialMemoryBasePromptContractDigest, promptContractDigest: value.promptContractDigest }; });
      snapshots.legacyPreferences = [legacyLines, legacyCharacters].map(id => db.prepare('SELECT canonical_json FROM review_run_preference_pins WHERE review_run_id=?').all(id).map(row => JSON.parse(String(row.canonical_json)).preference));
      strictEqual((snapshots.legacyPreferences as Array<Array<{ lines: string[] }>>)[0]![0]!.lines.length, 5);
      strictEqual((snapshots.legacyPreferences as Array<Array<{ lines: string[] }>>)[1]![0]!.lines.length, 2);
      const bindings = db.prepare('SELECT canonical_json FROM dialogue_execution_bindings ORDER BY rowid').all();
      return { schema: 'ai7.memory-facade-compatibility/1', timing, requests, snapshots, frozen, bindings, records };
    } finally { db.close(); }
  } finally {
    await dialogue?.dispose(); await fast?.dispose(); await driver.dispose(); await owner.dispose();
    governor.close(); await governor.whenIdle(); store.close(); await roots.dispose(); DatabaseSync.prototype.prepare = prepare;
  }
}

function selection(store: EditorialStore, book: { manuscriptId: string; branchId: string }): DialogueSelectionInput {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find(block => block.kind === 'paragraph' && graphemesOf(block.text).length >= 30)!;
  return { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId,
    baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence, blockId: block.blockId,
    baseBlockDigest: block.digest, fromGrapheme: 2, toGrapheme: 22, selectedText: graphemesOf(block.text).slice(2, 22).join('') };
}

async function until(done: () => boolean) {
  const end = performance.now() + 20_000;
  while (!done()) { if (performance.now() > end) throw new Error('MEMORY_COMPATIBILITY_DID_NOT_SETTLE'); await new Promise(resolve => setImmediate(resolve)); }
}
