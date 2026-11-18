import { randomUUID } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import { EditorialLearningLedger, LearningReads } from '../../../src/service/learning/ledger.js';
import { EditorialMemoryFacade } from '../../../src/service/learning/memory-facade.js';
import { BookPeople } from '../../../src/service/book-people.js';
import { canonicalRecord } from '../../../src/service/analysis/canonical.js';
import { LearningEligibilityLedger } from '../../../src/service/learning-eligibility.js';
import * as memoryOperations from '../../../src/service/house-review-preference.js';
import * as globalOperations from '../../../src/service/global-agent-operations.js';
import { SupervisionDirectives } from '../../../src/service/learning/supervision-directives.js';
import type { CreateEditorialMemoryInput, EditorialMemoryVersion, RecordLearningSupervisionInput, ChangeEditorialLearningInput, DeactivateEditorialMemoryInput, DecideLearningMaterialInput, AcceptEditorialMemoryInput, EditorialLearningProjection } from '../../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, sourceSpanText } from '../composed-fixture.js';
import { editorialMemoryDatabase } from './editorial-memory.js';
import { initializeMemorySourceProjections } from './memory-projections.js';
import { transaction } from './transaction.js';
// One admitted source read per test file; no generated manuscript fixture or fingerprint.
let sampleText: Promise<string> | undefined;
export async function memoryDomainFixture(admitLegacy = true) {
  const text = await (sampleText ??= sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 9, from: 0, to: 5 }));
  const db = editorialMemoryDatabase();
  initializeMemorySourceProjections(db);
  // The supplying owner has the same per-operation, write-invalidated read lifetime as EditorialStore.
  let depth = 0; let generation = -1; let reads: LearningReads | undefined;
  const call = <T>(operation: () => T): T => {
    depth += 1;
    try { return operation(); } finally { if (--depth === 0) reads = undefined; }
  };
  const learning = () => {
    if (depth === 0) return new EditorialLearningLedger(db);
    const changes = Number(db.prepare('SELECT total_changes() n').get()!.n);
    if (reads === undefined || generation !== changes) { reads = new LearningReads(); generation = changes; }
    return new EditorialLearningLedger(db, reads);
  };
  const write = <T>(operation: () => T): T => call(() => transaction(db, operation));
  const people = new BookPeople(db);
  const eligibility = new LearningEligibilityLedger(db);
  const unexpected = (): never => { throw new Error('This upstream operation is outside the memory fixture'); };
  // Upstream read stubs only: no Task/Run, Apply, analysis result or dialogue claim is made here.
  const baseline = { launch: { operationalScope: 'ordinary-production', policy: null, live: null },
    curationBudgetUse: () => ({ passesUsed: 0, reservedTokens: 0 }), curationRuns: () => [] } as unknown as memoryOperations.EditorialLearningStoreHost['baselineAnalysis'];
  const feedback = { latestWithWords: () => [], latestEntries: () => [] } as unknown as memoryOperations.LearningSupervisionStoreHost['analysisFeedback'];
  const facade = (): EditorialMemoryFacade => new EditorialMemoryFacade(db, learning, () => memoryOperations.housePreferencePeopleNames(supervisionHost));
  const supervisionHost: memoryOperations.LearningSupervisionStoreHost = {
    get authority() { return db; }, get baselineAnalysis() { return baseline; }, get bookPeople() { return people; },
    get learningEligibility() { return eligibility; }, get analysisFeedback() { return feedback; },
    learningCall: call, transaction, memoryFacade: facade,
    evaluationBookTitle: bookId => String(db.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId)!.title),
    inspectBaselineAnalysis: unexpected,
    inspectGlobalAgent: () => globalOperations.inspectGlobalAgent(globalHost),
    inspectLearningMaterial: (bookId, key) => memoryOperations.inspectLearningMaterial(editorialHost, bookId, key),
    learningCandidates: (bookId, excerpt, word) => memoryOperations.learningCandidates(supervisionHost, bookId, excerpt, word),
    learningMaterialSource: (bookId, candidate) => memoryOperations.learningMaterialSource(supervisionHost, bookId, candidate),
    reviewRuns: { planFacts: unexpected } as unknown as memoryOperations.LearningSupervisionStoreHost['reviewRuns'],
    series: {} as memoryOperations.LearningSupervisionStoreHost['series'],
    safeTitle: unexpected, requireSeries: unexpected, reviewCall: call, analysisItemLabel: unexpected,
  };
  const editorialHost: memoryOperations.EditorialLearningStoreHost = {
    get authority() { return db; }, get baselineAnalysis() { return baseline; }, get bookPeople() { return people; },
    get learningEligibility() { return eligibility; }, get learningSupervisionHost() { return supervisionHost; },
    learningCall: call, transaction, memoryFacade: facade, replacementFrozen: () => false,
    learningMaterialSource: (bookId, candidate) => memoryOperations.learningMaterialSource(supervisionHost, bookId, candidate),
    inspectEditorialLearning: input => memoryOperations.inspectEditorialLearning(editorialHost, input),
    dialogueTask: unexpected, editorialMemory: (bookId, kind) => memoryOperations.editorialMemory(editorialHost, bookId, kind),
  };
  // The real Global Agent projection is an upstream read of the real memory operations.
  // Its unrelated conversation/provider/procedure inputs are empty in this fixture.
  const globalHost = {
    get authority() { return db; }, get baselineAnalysis() { return baseline; }, memoryFacade: facade, learningCall: call,
    getConfiguredModelRoleBinding: () => null, dialogues: { globalTasks: () => [] },
  } as unknown as globalOperations.GlobalAgentOperationsHost;
  const inspect = (): EditorialLearningProjection => memoryOperations.inspectEditorialLearning(editorialHost, { signalOffset: 0, itemOffset: 0 });
  const current = (itemId: string): EditorialMemoryVersion => {
    const version = learning().version(itemId);
    if (version.schema !== 'ai7.global-editorial-memory/2') throw new Error('Expected governed memory');
    return version;
  };
  const create = (signalIds: readonly string[], title: string): CreateEditorialMemoryInput => ({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(),
    signalIds, applicability: { kind: 'house' }, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
  // Bind real feature functions to the test owner. No operation or projection is reimplemented.
  const subject = {
    createEditorialMemory: (input: CreateEditorialMemoryInput) => memoryOperations.createEditorialMemory(editorialHost, input),
    acceptEditorialMemory: (input: AcceptEditorialMemoryInput) => memoryOperations.acceptEditorialMemory(editorialHost, input),
    deactivateEditorialMemory: (input: DeactivateEditorialMemoryInput) => memoryOperations.deactivateEditorialMemory(editorialHost, input),
    changeEditorialLearning: (input: ChangeEditorialLearningInput) => memoryOperations.changeEditorialLearning(editorialHost, input),
    recordLearningSupervision: (input: RecordLearningSupervisionInput) => memoryOperations.recordLearningSupervision(supervisionHost, input),
    inspectGlobalAgent: () => globalOperations.inspectGlobalAgent(globalHost),
    inspectHouseReviewPreference: () => memoryOperations.inspectHouseReviewPreference(supervisionHost),
    inspectLearningMaterial: (bookId: string, key: string) => memoryOperations.inspectLearningMaterial(editorialHost, bookId, key),
    decideLearningMaterial: (input: DecideLearningMaterialInput) => memoryOperations.decideLearningMaterial(editorialHost, input),
  };
  const make = (input: CreateEditorialMemoryInput) => {
    const ids = new Set(db.prepare('SELECT item_id FROM global_editorial_memory_items').all().map((row) => String(row.item_id)));
    subject.createEditorialMemory(input);
    const inserted = db.prepare('SELECT item_id FROM global_editorial_memory_items').all().find((row) => !ids.has(String(row.item_id)));
    return current(String(inserted!.item_id));
  };
  const accept = (memory: EditorialMemoryVersion) => {
    subject.acceptEditorialMemory({ itemId: memory.itemId, expectedVersionId: memory.versionId, actionId: randomUUID() }); return current(memory.itemId);
  };
  const govern = (memories: readonly EditorialMemoryVersion[], operation: RecordLearningSupervisionInput['operation'], title: string,
    effect: RecordLearningSupervisionInput['effect'] = 'guide') => subject.recordLearningSupervision({ actionId: randomUUID(), operation,
    targets: memories.map((entry) => ({ itemId: entry.itemId, revisionId: entry.versionId })), scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: title, effect });
  const sourceBook = async (title: string) => {
    const book = { bookId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID() };
    const at = '2026-11-16T00:00:00.000Z'; const runId = randomUUID(), revisionId = randomUUID();
    const insert = (table: string, row: Record<string, SQLInputValue>) => {
      const columns = Object.keys(row);
      db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(row));
    };
    insert('books', { book_id: book.bookId, stable_identity: `book:${book.bookId}`, title, created_at: at });
    const result = canonicalRecord({ reviewRunId: runId, policyPin: { operationalScope: 'ordinary-production' } });
    insert('analysis_result_set_revisions', { revision_id: revisionId, canonical_json: result.json, sha256: result.digest });
    insert('review_run_category_events', { event_id: randomUUID(), review_run_id: runId, category_id: 'typos-and-usage', state: 'materialized', sequence: 1, result_set_revision_id: revisionId });
    for (let index = 0; index < 4; index++) {
      const decisionId = randomUUID(), itemId = randomUUID(), markId = randomUUID();
      const disposition = index === 1 ? 'rejected' : 'accepted-with-edit'; const edited = index === 1 ? null : `合成统一表达${index}`;
      insert('editorial_marks', { mark_id: markId, book_id: book.bookId, manuscript_id: book.manuscriptId, branch_id: book.branchId,
        block_id: randomUUID(), status: 'resolved', anchor_state: 'exact', source_task_id: null, source_label: null, from_grapheme: 0, to_grapheme: 1 });
      insert('proposal_change_items', { item_id: itemId, mark_id: markId, current_text: text, proposed_text: `${text}合成` });
      insert('proposal_item_decisions', { decision_id: decisionId, item_id: itemId, ordinal: 1, disposition, edited_text: edited,
        decided_revision_id: revisionId, decided_journal_sequence: 0, decided_block_digest: null, recorded_at: at });
      insert('proposal_decision_reasons', { decision_id: decisionId, reason: '合成编辑判断。', reason_source: 'reason-field' });
      const finding = canonicalRecord({});
      insert('review_findings', { review_run_id: runId, finding_id: `rvf_${index}`, mark_id: markId, category_id: 'typos-and-usage',
        output: 'change-suggestion', canonical_json: finding.json, sha256: finding.digest });
      learning().captureDecision(decisionId);
    }
    const signals = inspect().signals.filter((signal) => signal.source.bookId === book.bookId);
    return { book, signals };
  };
  // Fixture setup: append real directives, then publish once; intermediate projections are not under assertion.
  const seedPreferences = (texts: readonly string[]) => write(() => {
    for (const text of texts) new SupervisionDirectives(db).record('ordinary-production', { operation: 'create', targets: [],
      scope: { kind: 'house' }, categoryId: 'style-and-format', text, effect: 'guide' }, []);
    facade().refreshGovernance('ordinary-production', memoryOperations.housePreferencePeopleNames(supervisionHost), true);
  });
  // Fixture setup creates/accepts real rows and publishes the completed setup once.
  // The cases use the facade for each admission/refusal they assert at the boundary.
  const seedActiveMemories = (inputs: readonly CreateEditorialMemoryInput[]) => write(() => {
    const versions = inputs.map((input) => {
      learning().create(input, 'ordinary-production');
      const row = db.prepare('SELECT item_id FROM global_editorial_memory_items WHERE client_memory_id = ?').get('schema' in input ? input.actionId : input.clientMemoryId)!;
      const created = current(String(row.item_id));
      learning().accept({ itemId: created.itemId, expectedVersionId: created.versionId, actionId: randomUUID() }, 'ordinary-production');
      return current(created.itemId);
    });
    facade().refreshGovernance('ordinary-production', memoryOperations.housePreferencePeopleNames(supervisionHost), 'memory');
    return versions;
  });
  const { book, signals } = await sourceBook('合成记忆来源');
  const explicit = signals[1]!;
  if (admitLegacy) {
    const material = subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
    subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest,
      expectedDecisions: material.decisions, choice: 'house', note: null });
  }
  return { db, subject, book, signals, explicit, inspect, create, make, accept, current, govern, sourceBook, seedPreferences, seedActiveMemories };
}
