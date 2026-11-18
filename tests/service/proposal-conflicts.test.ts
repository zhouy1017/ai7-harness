import { IMPORTED_SKILL_RELATIONS, CUSTOM_ANALYSIS_RELATIONS, HOUSE_REVIEW_PREFERENCE_RELATIONS, TASK_INTENT_DRAFT_RELATIONS } from '../support/pre74-schema.js';
import { execPre74Fixture, FACTUAL_VERIFICATION_RELATIONS, MATERIAL_INDEX_LAYER_RELATIONS, PROPOSAL_REVIEW_RELATIONS, RESEARCH_EVIDENCE_RELATIONS } from '../support/pre74-schema.js';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { KEEP_CURRENT_REASON, PROPOSAL_CONFLICT_SCHEMA_SQL } from '../../src/service/proposal-conflicts.js';
import { CLARIFICATION_SCHEMA_VERSION, LATEST_SCHEMA_VERSION, PUBLICATION_VERSION_SCHEMA_VERSION, ANALYSIS_LEDGER_REVISION_58_SQL } from '../../src/service/task-authorization.js';
import { conflictUnits, initialResolutions, type ConflictUnitResolution } from '../../src/shared/conflict-units.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection, ProposalConflictProjection } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER } from '../support/proposal-conflicts.js';
import { IMPORT_RETENTION_RELATIONS_DROP_ORDER } from '../support/import-retention.js';
import { IMPORTED_MARK_RELATIONS_DROP_ORDER } from '../support/imported-marks.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER } from '../support/default-execution-rules.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { MIGRATION_EMPTY_RELATIONS, PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';

// Service-integration suite (L2) for 稿件冲突 of a single 修改建议 (Issue #57, plan slice S22; ADR 0085). It
// drives the real `EditorialStore` on a temporary Agent Data Root. The manuscript is composed from the one
// admitted SampleBook; every string written into it is authored here, and manuscript text is compared by
// equality, length and offset only.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '冲突组稿' };
const PROPOSED = '〔建议〕';
const TYPED = '〔改〕';
const EDITED = '〔合并〕';
const LEDGER = Object.keys(PROPOSAL_CONFLICT_SCHEMA_SQL);

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(
    staged.draftId,
    staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value },
    false,
  );
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  await store.acknowledgeImportCompletion(commitId);
  return { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

function windowOf(store: EditorialStore, book: Imported): ManuscriptWindowProjection {
  return store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
}

/** Two paragraphs long enough to hold a suggestion with room on both sides of it. */
function paragraphs(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'] {
  const found = window.blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 60);
  if (found.length < 3) throw new Error('the composed window holds fewer than three paragraphs of 60 graphemes');
  return found;
}

function blockText(store: EditorialStore, book: Imported, blockId: string): string {
  return windowOf(store, book).blocks.find((block) => block.blockId === blockId)!.text;
}

function binding(store: EditorialStore, book: Imported): Imported & { windowStartBlockId: string } {
  return { ...book, windowStartBlockId: windowOf(store, book).blocks[0]!.blockId };
}

function suggest(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, proposedText = PROPOSED, rationale: string | null = null): string {
  const window = windowOf(store, book);
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  return store.createEditorialMark({
    ...book,
    windowStartBlockId: window.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''),
    kind: 'change-suggestion',
    highlightColor: null,
    body: '',
    proposedText,
    rationale,
  }).markId;
}

/** The editor's own typing: one journal edit of one block, against the window as it stands now. */
function typeInto(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, insertText: string): void {
  const now = windowOf(store, book);
  store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: from, toGrapheme: to, insertText,
  });
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

function withDatabase<T>(readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(databasePath(), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function ledgerCounts(): Record<string, number> {
  return withDatabase(true, (database) => Object.fromEntries(LEDGER.map((table) => [
    table,
    (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total,
  ])));
}

/** Every relation with its exact `CREATE` text and a digest over its whole content (row count and hex digest). */
function relationTruth(database: DatabaseSync): Map<string, { sql: string; content: string }> {
  const relations = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name").all() as { name: string; sql: string | null }[];
  return new Map(relations.map((relation) => {
    const rows = database.prepare(`SELECT * FROM "${relation.name}"`).all() as Record<string, SQLOutputValue>[];
    const hash = createHash('sha256');
    for (const row of rows) {
      for (const column of Object.keys(row).sort()) {
        const value = row[column]!;
        hash.update(JSON.stringify([column, value instanceof Uint8Array ? [...value] : typeof value === 'bigint' ? value.toString() : value]));
      }
    }
    return [relation.name, { sql: String(relation.sql), content: `${rows.length}:${hash.digest('hex')}` }];
  }));
}

function anchorConflict(store: EditorialStore, book: Imported, markId: string): string | null | undefined {
  return windowOf(store, book).marks.find((mark) => mark.markId === markId)?.conflict;
}

/** Every changed unit resolved one way, the same unit kinds staying `null`. */
function resolveEvery(conflict: ProposalConflictProjection, entry: ConflictUnitResolution): ConflictUnitResolution[] {
  return conflict.units.map((unit) => (unit.kind === 'same' ? { resolution: null, text: null } : entry));
}

interface Suggested {
  book: Imported;
  blockId: string;
  markId: string;
  pinned: string;
  /** The block's text before anything was typed into it. */
  original: string;
}

/** A 修改建议 over graphemes [20, 26) of the first long paragraph, whose own words the editor then edits. */
async function driftedSuggestion(store: EditorialStore): Promise<Suggested & { current: string }> {
  const book = await importBook(store);
  const block = paragraphs(windowOf(store, book))[0]!;
  const original = block.text;
  const markId = suggest(store, book, block.blockId, 20, 26, PROPOSED, '理由：语气更准');
  const pinned = graphemesOf(original).slice(20, 26).join('');
  typeInto(store, book, block.blockId, 23, 23, TYPED);
  return { book, blockId: block.blockId, markId, pinned, original, current: graphemesOf(blockText(store, book, block.blockId)).slice(20, 26 + graphemesOf(TYPED).length).join('') };
}

describe('稿件冲突 of a single 修改建议 (ADR 0085)', () => {
  it('saves the Resolution Draft on its basis, repeats nothing, refuses a stale or ill-fitting draft, and restores it after a restart', async () => {
    let book: Imported;
    let markId: string;
    let basis: string;
    let saved: ReturnType<EditorialStore['saveProposalConflictDraft']>;
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const made = await driftedSuggestion(first);
      book = made.book;
      markId = made.markId;
      const conflict = first.inspectProposalConflict({ ...book, markId });
      basis = conflict.basisDigest;
      const textBefore = blockText(first, book, made.blockId);
      const units = resolveEvery(conflict, { resolution: 'edited', text: EDITED });
      saved = first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units });
      expect(saved).toMatchObject({ markId, basisDigest: basis, draft: { ordinal: 1, resolutions: units, text: EDITED, complete: true } });
      // The same draft again appends nothing; another one is the next ordinal.
      expect(first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units }).draft.draftId).toBe(saved.draft.draftId);
      const partial = first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: initialResolutions(conflict.units) });
      expect(partial.draft).toMatchObject({ ordinal: 2, complete: false, text: made.current });
      saved = first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units });
      expect(saved.draft.ordinal).toBe(3);
      expect(ledgerCounts()).toEqual({ proposal_conflict_drafts: 3, proposal_conflict_deferrals: 0, proposal_conflict_outcomes: 0 });
      // A draft for another basis, of another shape, or with an unbounded edit is refused whole.
      expect(refusal(() => first.saveProposalConflictDraft({ ...book, markId, basisDigest: 'f'.repeat(64), units }))).toBe('PROPOSAL_CONFLICT_STALE');
      expect(refusal(() => first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: [...units, { resolution: 'current', text: null }] })))
        .toBe('PROPOSAL_CONFLICT_DRAFT_INVALID');
      expect(refusal(() => first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: resolveEvery(conflict, { resolution: 'edited', text: null }) })))
        .toBe('PROPOSAL_CONFLICT_DRAFT_INVALID');
      expect(refusal(() => first.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: resolveEvery(conflict, { resolution: 'edited', text: '长'.repeat(4_001) }) })))
        .toBe('PROPOSAL_CONFLICT_DRAFT_INVALID');
      expect(ledgerCounts().proposal_conflict_drafts).toBe(3);
      expect(blockText(first, book, made.blockId)).toBe(textBefore);
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const restored = second.inspectProposalConflict({ ...book, markId });
      expect(restored.basisDigest).toBe(basis);
      expect(restored.draft).toEqual(saved.draft);
      // A change anywhere in the paragraph is a new basis: the draft is kept, not loaded, and the old basis is refused.
      const blockId = restored.blockId;
      typeInto(second, book, blockId, 0, 0, TYPED);
      const moved = second.inspectProposalConflict({ ...book, markId });
      expect(moved.basisDigest).not.toBe(basis);
      expect(moved.draft).toBeNull();
      expect(moved.draftOnEarlierBasis).toBe(true);
      expect(refusal(() => second.saveProposalConflictDraft({ ...book, markId, basisDigest: basis, units: saved.draft.resolutions }))).toBe('PROPOSAL_CONFLICT_STALE');
      expect(refusal(() => second.resolveProposalConflict({ ...book, markId, basisDigest: basis, outcome: 'new-version', draftOrdinal: 3 }))).toBe('PROPOSAL_CONFLICT_STALE');
      // Undoing that change brings the basis back, and with it the draft saved on it.
      second.undoManuscript(book.manuscriptId, book.branchId, windowOf(second, book).workingDigest);
      expect(second.inspectProposalConflict({ ...book, markId }).draft).toEqual(saved.draft);
      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 300_000);

  it('defers a conflict with a record, keeps it listed, blocking and its draft kept, across a restart', async () => {
    let book: Imported;
    let markId: string;
    let draftId: string;
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const made = await driftedSuggestion(first);
      book = made.book;
      markId = made.markId;
      const conflict = first.inspectProposalConflict({ ...book, markId });
      draftId = first.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: resolveEvery(conflict, { resolution: 'proposed', text: null }) }).draft.draftId;
      const deferred = first.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'defer', draftOrdinal: null });
      expect(deferred).toMatchObject({ markId, outcome: 'defer', newMarkId: null });
      const card = first.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card.conflict).toEqual({ kind: 'suggestion', state: 'deferred', deferredAt: deferred.recordedAt, outcome: null, newMarkId: null, resolvedAt: null });
      expect(card.status).toBe('open');
      expect(card.suggestion?.decision).toBeNull();
      expect(anchorConflict(first, book, markId)).toBe('deferred');
      expect(refusal(() => first.applyChangeSuggestion({
        ...binding(first, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null,
      }))).toBe('APPLY_TARGET_DRIFTED');
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const reopened = second.inspectProposalConflict({ ...book, markId });
      expect(reopened.deferral).not.toBeNull();
      expect(reopened.draft?.draftId).toBe(draftId);
      expect(reopened.navigator.entries).toEqual([{ markId, blockId: reopened.blockId, conflictKind: 'suggestion', deferred: true }]);
      expect(ledgerCounts()).toEqual({ proposal_conflict_drafts: 1, proposal_conflict_deferrals: 1, proposal_conflict_outcomes: 0 });
      // A deferred conflict is still resolved later like any other.
      second.resolveProposalConflict({ ...book, markId, basisDigest: reopened.basisDigest, outcome: 'new-version', draftOrdinal: reopened.draft!.ordinal });
      expect(ledgerCounts().proposal_conflict_outcomes).toBe(1);
      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 300_000);

  it('keeps its records immutable, and refuses to show one whose columns no longer match what was written', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const { book, markId } = await driftedSuggestion(store);
      const conflict = store.inspectProposalConflict({ ...book, markId });
      store.saveProposalConflictDraft({ ...book, markId, basisDigest: conflict.basisDigest, units: resolveEvery(conflict, { resolution: 'edited', text: EDITED }) });
      store.resolveProposalConflict({ ...book, markId, basisDigest: conflict.basisDigest, outcome: 'defer', draftOrdinal: null });
      // A second conflict, kept as it is, so every one of the three relations holds a row.
      const second = paragraphs(windowOf(store, book))[1]!;
      const keptId = suggest(store, book, second.blockId, 10, 16);
      typeInto(store, book, second.blockId, 12, 12, TYPED);
      const kept = store.inspectProposalConflict({ ...book, markId: keptId });
      store.resolveProposalConflict({ ...book, markId: keptId, basisDigest: kept.basisDigest, outcome: 'keep-current', draftOrdinal: null });
      expect(ledgerCounts()).toEqual({ proposal_conflict_drafts: 1, proposal_conflict_deferrals: 1, proposal_conflict_outcomes: 1 });
      withDatabase(false, (database) => {
        for (const table of LEDGER) {
          expect(() => database.exec(`UPDATE ${table} SET actor = actor`)).toThrow(/PROPOSAL_CONFLICT_LEDGER_IMMUTABLE/);
          expect(() => database.exec(`DELETE FROM ${table}`)).toThrow(/PROPOSAL_CONFLICT_LEDGER_IMMUTABLE/);
        }
      });
      // Only by lifting the ledger's own guard can a row change; the read then refuses rather than show it.
      const guard = withDatabase(true, (database) =>
        (database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'proposal_conflict_drafts_no_update'").get() as { sql: string }).sql);
      withDatabase(false, (database) => database.exec(`DROP TRIGGER proposal_conflict_drafts_no_update;
        UPDATE proposal_conflict_drafts SET draft_text = '〔篡改〕';
        ${guard};`));
      expect(refusal(() => store.inspectProposalConflict({ ...book, markId }))).toBe('PROPOSAL_CONFLICT_RECORD_INVALID');
      const deferralGuard = withDatabase(true, (database) =>
        (database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'proposal_conflict_deferrals_no_update'").get() as { sql: string }).sql);
      withDatabase(false, (database) => database.exec(`DROP TRIGGER proposal_conflict_deferrals_no_update;
        UPDATE proposal_conflict_deferrals SET created_at = '2000-01-01T00:00:00.000Z';
        ${deferralGuard};`));
      expect(refusal(() => store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId))).toBe('PROPOSAL_CONFLICT_RECORD_INVALID');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('migrates a revision-25 store by adding the three relations empty, and moves nothing else', async () => {
    let book: Imported;
    let markId: string;
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const made = await driftedSuggestion(first);
      book = made.book;
      markId = made.markId;
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    // Plant revision 25: its relations are exactly the current ones less the three revision 26 adds.
    const truthBefore = withDatabase(false, (database) => {
      execPre74Fixture(database, `BEGIN IMMEDIATE;
        ${[...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER].map((relation) => `DROP TABLE ${relation};`).join('\n        ')}
        ${PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER.map((relation) => `DROP TABLE ${relation};`).join('\n        ')}
        PRAGMA user_version = ${PUBLICATION_VERSION_SCHEMA_VERSION};
        COMMIT;`);
      downgradeKindCoupledRelations(database, ANALYSIS_LEDGER_REVISION_58_SQL);
      expect(database.prepare("SELECT count(*) total FROM sqlite_schema WHERE name LIKE 'proposal_conflict%'").get()).toEqual({ total: 0 });
      return relationTruth(database);
    });
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
      const truthAfter = relationTruth(database);
      expect([...truthAfter.keys()]).toEqual([...truthBefore.keys(), 'review_run_synthesis', ...RESEARCH_EVIDENCE_RELATIONS, ...MATERIAL_INDEX_LAYER_RELATIONS, ...PROPOSAL_REVIEW_RELATIONS, ...FACTUAL_VERIFICATION_RELATIONS, ...HOUSE_REVIEW_PREFERENCE_RELATIONS, ...TASK_INTENT_DRAFT_RELATIONS, ...IMPORTED_SKILL_RELATIONS, ...CUSTOM_ANALYSIS_RELATIONS, ...PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER].sort());
      for (const relation of RESEARCH_EVIDENCE_RELATIONS) expect(truthAfter.get(relation)?.content).toMatch(/^0:/);
      for (const relation of [...PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...MIGRATION_EMPTY_RELATIONS, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER]) expect(truthAfter.get(relation)?.content).toMatch(/^0:/);
      // Revision 59 rebuilds the three kind-coupled analysis relations for the evaluation kind (Issue #429), every row kept.
      expect([...truthBefore].filter(([name, before]) => truthAfter.get(name)!.sql !== before.sql).map(([name]) => name)).toEqual(['analysis_plan_records', 'analysis_result_set_revisions', 'analysis_result_sets', 'analysis_run_authorizations', 'analysis_task_intents', 'proposal_item_decisions']);
      expect([...truthBefore].filter(([name, before]) => truthAfter.get(name)!.content !== before.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      expect(database.prepare(`SELECT count(*) total FROM sqlite_schema WHERE type = 'trigger' AND tbl_name IN (${LEDGER.map((table) => `'${table}'`).join(', ')})`).get())
        .toEqual({ total: 6 });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
    // The suggestion that was in conflict before the migration is in conflict after it, unresolved.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectProposalConflict({ ...book, markId })).toMatchObject({ conflictKind: 'suggestion', deferral: null, draft: null });
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);
});
