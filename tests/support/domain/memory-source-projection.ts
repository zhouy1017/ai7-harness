import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { EditorialLearningLedger, LearningReads } from '../../../src/service/learning/ledger.js';
import { EditorialMemoryFacade } from '../../../src/service/learning/memory-facade.js';
import { BookPeople } from '../../../src/service/book-people.js';
import { canonicalRecord } from '../../../src/service/analysis/canonical.js';
import { initializeDecisionFeedbackSchema } from '../../../src/service/decision-feedback.js';
import { LearningEligibilityLedger, proposalDecisionCandidate, learningMaterialDigest, type LearningMaterialCandidate } from '../../../src/service/learning-eligibility.js';
import { HouseReviewPreferenceLedger, type HousePreferenceSource } from '../../../src/service/house-review-preference.js';
import { SupervisionDirectives, editorialMemoryGovernanceItem, governedMemoryItems, preferenceItems } from '../../../src/service/learning/supervision-directives.js';
import type { CreateEditorialMemoryInput, EditorialMemoryVersion, RecordLearningSupervisionInput, ChangeEditorialLearningInput, DeactivateEditorialMemoryInput, DecideLearningMaterialInput } from '../../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, sourceSpanText } from '../composed-fixture.js';
import { editorialMemoryDatabase, transaction } from './editorial-memory.js';

// external-owner stub — not a schema or provenance proof.
// Only the upstream columns consumed by the unmocked domain readers are projected here.
// The service parity case checks every declared column/type and every relied-on key/nullability.
export const MEMORY_SOURCE_PROJECTION_SQL = {
  review_runs: 'CREATE TABLE review_runs(review_run_id TEXT PRIMARY KEY) STRICT',
  analysis_task_intents: 'CREATE TABLE analysis_task_intents(task_intent_id TEXT PRIMARY KEY, book_id TEXT, kind TEXT) STRICT',
  editorial_marks: 'CREATE TABLE editorial_marks(mark_id TEXT PRIMARY KEY, book_id TEXT, manuscript_id TEXT, branch_id TEXT) STRICT',
  proposal_change_items: 'CREATE TABLE proposal_change_items(item_id TEXT PRIMARY KEY, mark_id TEXT, current_text TEXT, proposed_text TEXT) STRICT',
  proposal_item_decisions: `CREATE TABLE proposal_item_decisions(decision_id TEXT PRIMARY KEY, item_id TEXT, ordinal INTEGER,
    disposition TEXT, edited_text TEXT, decided_revision_id TEXT, decided_journal_sequence INTEGER, decided_block_digest TEXT, recorded_at TEXT) STRICT`,
  proposal_decision_reasons: 'CREATE TABLE proposal_decision_reasons(decision_id TEXT PRIMARY KEY, reason TEXT, reason_source TEXT) STRICT',
  proposal_conflict_outcomes: 'CREATE TABLE proposal_conflict_outcomes(decision_id TEXT) STRICT',
  review_findings: 'CREATE TABLE review_findings(review_run_id TEXT, finding_id TEXT, mark_id TEXT, category_id TEXT) STRICT',
  analysis_result_set_revisions: 'CREATE TABLE analysis_result_set_revisions(revision_id TEXT PRIMARY KEY, canonical_json TEXT, sha256 TEXT) STRICT',
  review_run_category_events: `CREATE TABLE review_run_category_events(review_run_id TEXT, category_id TEXT, state TEXT, sequence INTEGER,
    result_set_revision_id TEXT) STRICT`,
} as const;
export function initializeMemorySourceProjections(db: DatabaseSync): void {
  for (const sql of Object.values(MEMORY_SOURCE_PROJECTION_SQL)) db.exec(sql);
  initializeDecisionFeedbackSchema(db);
}

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
  const names = () => (db.prepare('SELECT book_id FROM books').all()).flatMap((row) => {
    const current = people.current(String(row.book_id)); return [...current.authors, ...current.editors];
  });
  const facade = () => new EditorialMemoryFacade(db, learning, names);
  const candidates = new Map<string, { bookId: string; candidate: LearningMaterialCandidate; decisionId: string; reason: string; disposition: string }>();
  const inspect = () => call(() => facade().inspect({ signalOffset: 0, itemOffset: 0 }));
  const rebuild = () => {
    const sources: HousePreferenceSource[] = [];
    for (const { bookId, candidate, decisionId, reason, disposition } of candidates.values()) {
      const decision = eligibility.history(bookId, candidate.materialKey).at(-1);
      if (!decision || decision.materialDigest !== learningMaterialDigest(candidate) || !['house', 'book'].includes(decision.choice)) continue;
      sources.push({ bookId, bookTitle: String(db.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId)!.title),
        categoryId: 'typos-and-usage', categoryLabel: '错别字与规范用语', materialDigest: decision.materialDigest, decisionId,
        eligibilityDecisionId: decision.decisionId, eligibility: decision.choice, operationalScope: 'ordinary-production', disposition, reason,
        attribution: decision.attribution ?? { peopleVersion: 0, authors: [], editors: [] },
        // No Apply exists in this external-owner stub. Apply/provenance assertions stay in service.
        quality: { applied: 0, surviving: 0, editVolume: 0, lineageDigest: '0'.repeat(64) } });
    }
    facade().rebuild('ordinary-production', sources, names());
  };
  const global = () => call(() => {
    const memory = facade(); const basis = memory.globalSourceBasis('ordinary-production');
    const facts = memory.globalSources('ordinary-production', true, basis);
    const base = basis.preference === null ? null : { ...basis.preference, lines: basis.preference.governance?.baseLines ?? basis.preference.lines };
    const items = governedMemoryItems(preferenceItems(base), facts.legacyDirectives).map((item) => ({ ...item,
      revisionId: item.revisionId + '@' + (basis.directives.at(-1)?.directiveId ?? 'base') }));
    return { items: [...items, ...facts.revisions.map((entry) => editorialMemoryGovernanceItem(entry, entry.current.editorialDimension))], directives: basis.directives };
  });
  const current = (itemId: string): EditorialMemoryVersion => {
    const version = learning().version(itemId);
    if (version.schema !== 'ai7.global-editorial-memory/2') throw new Error('Expected governed memory');
    return version;
  };
  const create = (signalIds: readonly string[], title: string): CreateEditorialMemoryInput => ({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(),
    signalIds, applicability: { kind: 'house' }, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
  const subject = {
    createEditorialMemory(input: CreateEditorialMemoryInput) { return write(() => facade().create(input, 'ordinary-production')); },
    acceptEditorialMemory(input: { itemId: string; expectedVersionId: string; actionId: string }) { return write(() => facade().accept(input, 'ordinary-production')); },
    deactivateEditorialMemory(input: DeactivateEditorialMemoryInput) { return write(() => facade().deactivate(input, 'ordinary-production')); },
    changeEditorialLearning(input: ChangeEditorialLearningInput) { return write(() => { facade().change(input); rebuild(); }); },
    recordLearningSupervision(input: RecordLearningSupervisionInput) { return write(() => {
      facade().recordSupervision('ordinary-production', input, input.targets.length === 0 ? [] : global().items);
      return { get items() { return global().items; }, get directives() { return global().directives; } };
    }); },
    inspectGlobalAgent: global,
    inspectHouseReviewPreference() { const history = facade().history('ordinary-production'); return { current: history.at(-1) ?? null, history }; },
    inspectLearningMaterial(bookId: string, materialKey: string) {
      const value = candidates.get(materialKey); if (!value || value.bookId !== bookId) throw new Error('Unknown fixture source');
      return eligibility.project(bookId, [value.candidate])[0]!;
    },
    decideLearningMaterial(input: DecideLearningMaterialInput) { return write(() => {
      const value = candidates.get(input.materialKey); if (!value) throw new Error('Unknown fixture source');
      eligibility.decide({ bookId: input.bookId, candidate: value.candidate, expectedDecisions: input.expectedDecisions, choice: input.choice,
        note: input.note, attribution: { peopleVersion: 0, authors: [], editors: [] } }); rebuild();
    }); },
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
    db.prepare('INSERT INTO books VALUES (?, ?, ?, ?)').run(book.bookId, `book:${book.bookId}`, title, at);
    const result = canonicalRecord({ policyPin: { operationalScope: 'ordinary-production' } });
    db.prepare('INSERT INTO analysis_result_set_revisions VALUES (?, ?, ?)').run(revisionId, result.json, result.digest);
    db.prepare('INSERT INTO review_run_category_events VALUES (?, ?, ?, ?, ?)').run(runId, 'typos-and-usage', 'materialized', 1, revisionId);
    for (let index = 0; index < 4; index++) {
      const decisionId = randomUUID(), itemId = randomUUID(), markId = randomUUID();
      const disposition = index === 1 ? 'rejected' : 'accepted-with-edit'; const edited = index === 1 ? null : `合成统一表达${index}`;
      const reason = '合成编辑判断。';
      db.prepare('INSERT INTO editorial_marks VALUES (?, ?, ?, ?)').run(markId, book.bookId, book.manuscriptId, book.branchId);
      db.prepare('INSERT INTO proposal_change_items VALUES (?, ?, ?, ?)').run(itemId, markId, text, `${text}合成`);
      db.prepare('INSERT INTO proposal_item_decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(decisionId, itemId, 1, disposition, edited, revisionId, 0, null, at);
      db.prepare('INSERT INTO proposal_decision_reasons VALUES (?, ?, ?)').run(decisionId, reason, 'reason-field');
      db.prepare('INSERT INTO review_findings VALUES (?, ?, ?, ?)').run(runId, `rvf_${index}`, markId, 'typos-and-usage');
      const candidate = proposalDecisionCandidate({ decisionId, disposition, currentText: text, proposedText: `${text}合成`, editedText: edited,
        reason, reasonSource: 'reason-field', feedbackEntries: 0, recordedAt: at, decidedAt: at }, false);
      candidates.set(candidate.materialKey, { bookId: book.bookId, candidate, decisionId, reason, disposition });
      learning().captureDecision(decisionId);
    }
    const signals = inspect().signals.filter((signal) => signal.source.bookId === book.bookId);
    return { book, signals };
  };
  // Fixture setup: append real directives, then publish once; intermediate projections are not under assertion.
  const seedPreferences = (texts: readonly string[]) => write(() => {
    for (const text of texts) new SupervisionDirectives(db).record('ordinary-production', { operation: 'create', targets: [],
      scope: { kind: 'house' }, categoryId: 'style-and-format', text, effect: 'guide' }, []);
    facade().refreshGovernance('ordinary-production', names(), true);
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
    facade().refreshGovernance('ordinary-production', names(), 'memory');
    return versions;
  });
  const prepare = () => {
    const reviewRunId = randomUUID(), taskIntentId = randomUUID();
    db.prepare('INSERT INTO review_runs VALUES (?)').run(reviewRunId);
    db.prepare('INSERT INTO analysis_task_intents VALUES (?, ?, ?)').run(taskIntentId, book.bookId, 'editorial-review/typos-and-usage');
    new HouseReviewPreferenceLedger(db, learning).pin(reviewRunId, taskIntentId, 'a'.repeat(64), facade().reviewPreference('ordinary-production', book.bookId, 'typos-and-usage')!);
    return { reviewRunId, categories: [{ categoryId: 'typos-and-usage', taskIntentId }] };
  };
  const { book, signals } = await sourceBook('合成记忆来源');
  const explicit = signals[1]!;
  if (admitLegacy) {
    const material = subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
    subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest,
      expectedDecisions: material.decisions, choice: 'house', note: null });
  }
  return { db, subject, book, signals, explicit, inspect, create, make, accept, current, govern, sourceBook, prepare, seedPreferences, seedActiveMemories };
}
