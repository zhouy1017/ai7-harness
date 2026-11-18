import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { ANALYSIS_LEDGER_REVISION_23_SQL, EDITORIAL_MARK_SCHEMA_VERSION, CLARIFICATION_SCHEMA_VERSION, LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
import { REVIEW_RUN_RELATIONS_DROP_ORDER } from '../support/review-categories.js';
import { PUBLICATION_VERSION_RELATIONS_DROP_ORDER } from '../support/publication-versions.js';
import { PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER } from '../support/proposal-conflicts.js';
import { IMPORT_RETENTION_RELATIONS_DROP_ORDER } from '../support/import-retention.js';
import { IMPORTED_MARK_RELATIONS_DROP_ORDER } from '../support/imported-marks.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER } from '../support/default-execution-rules.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { downgradeEditorialMarksToRevision22 } from '../support/editorial-mark-revisions.js';
import { EDITORIAL_MARK_REVISION_22_SQL, EDITORIAL_MARK_SCHEMA_SQL } from '../../src/service/editorial-marks.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';

// Service-integration suite (L2) for AI7 Apply on Change Suggestions (Issue #408). The manuscript is
// composed from the one admitted SampleBook; every string written into it is authored here, and
// manuscript text is compared by boolean, length and offset only.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '应用组稿' };
const PROPOSED = '〔建议〕';
const EDITED = '〔编辑改定〕';
const EFFECT_RELATIONS = ['manuscript_effect_receipts', 'manuscript_effect_dispatches', 'manuscript_effect_approvals', 'manuscript_effect_targets', 'manuscript_effect_intents'];

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, 'apply.docx');
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

function paragraphs(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'] {
  const found = window.blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 40);
  if (found.length < 2) throw new Error('the composed window holds fewer than two paragraphs of 40 graphemes');
  return found;
}

function blockText(store: EditorialStore, book: Imported, blockId: string): string {
  return store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.find((block) => block.blockId === blockId)!.text;
}

function suggest(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, proposedText = PROPOSED): { markId: string; pinned: string } {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  const made = store.createEditorialMark({
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
    rationale: null,
  });
  return { markId: made.markId, pinned: made.card!.pinnedText };
}

function binding(store: EditorialStore, book: Imported): Imported & { windowStartBlockId: string } {
  return { ...book, windowStartBlockId: store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks[0]!.blockId };
}

function storeError(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

/** The editor's own typing: one journal edit of one block, against the window as it stands now. */
function typeInto(store: EditorialStore, book: Imported, blockId: string, from: number, to: number, insertText: string): ManuscriptWindowProjection {
  const now = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  return store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: from, toGrapheme: to, insertText,
  }).window;
}

describe('AI7 Apply on a Change Suggestion', () => {
  it('counts bulk replacements on an applied range in another block and ignores replacements around a retained range', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const blocks = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null));
      const replace = (query: string, replacement: string) => {
        const search = store.createSearch(book.manuscriptId, book.branchId, query).searchId;
        while (!store.advanceSearch(search).done) { /* bounded search */ }
        const preview = store.prepareReplacement(search, replacement, []);
        while (!store.advanceReplacementWork(preview.previewId).done) { /* prepare */ }
        store.freezeReplacement(preview.previewId, []);
        while (!store.advanceReplacementWork(preview.previewId).done) { /* validate */ }
        return store.commitReplacement(preview.previewId);
      };
      typeInto(store, book, blocks[0]!.blockId, 0, 0, '〔批量靶〕');
      const marked = suggest(store, book, blocks[1]!.blockId, 4, 8, '〔批量靶〕');
      store.applyChangeSuggestion({ ...binding(store, book), markId: marked.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
      expect(store.inspectEditQualitySignals(null)).toMatchObject({ surviving: 1, editVolume: 0 });
      expect(replace('〔批量靶〕', '〔改定〕').committedCount).toBe(2);
      const changed = store.inspectEditQualitySignals(null);
      expect(changed.surviving).toBe(0);
      expect(changed.editVolume).toBeGreaterThan(0);
      store.undoManuscript(book.manuscriptId, book.branchId, store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest);
      expect(store.inspectEditQualitySignals(null).surviving).toBe(1);
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, marked.markId);
      typeInto(store, book, blocks[1]!.blockId, card.toGrapheme, card.toGrapheme, '〔外侧靶〕');
      typeInto(store, book, blocks[1]!.blockId, 0, 0, '〔外侧靶〕');
      const beforeOutside = store.inspectEditQualitySignals(null);
      expect(replace('〔外侧靶〕', '〔外侧改〕').committedCount).toBe(2);
      const afterOutside = store.inspectEditQualitySignals(null);
      expect(afterOutside.surviving).toBe(1);
      expect(afterOutside.editVolume).toBe(beforeOutside.editVolume);
      expect(afterOutside.lineageDigest).not.toBe(beforeOutside.lineageDigest);
    } finally { store.markCleanShutdown(); store.close(); }
  }, 120_000);

  it('projects judged suggestion survival and edit effort through unrelated, reverting and reverse-apply edits', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const suggestion = suggest(store, book, block.blockId, 6, 12, '建议');
      store.applyChangeSuggestion({ ...binding(store, book), markId: suggestion.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
      const initial = store.inspectEditQualitySignals(null);
      expect(initial).toMatchObject({ applied: 1, surviving: 1, editVolume: 0 });
      // A plain accept is judged for survival, but without a reason it is not Learning Material.
      expect(store.inspectLearningMaterials(null).books.flatMap((entry) => entry.materials)).toHaveLength(0);
      typeInto(store, book, block.blockId, 0, 0, '前');
      const unrelated = store.inspectEditQualitySignals(null);
      expect(unrelated).toMatchObject({ applied: 1, surviving: 1, editVolume: 0 });
      expect(unrelated.lineageDigest).not.toBe(initial.lineageDigest);
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, suggestion.markId);
      typeInto(store, book, block.blockId, card.fromGrapheme, card.toGrapheme, suggestion.pinned);
      expect(store.inspectEditQualitySignals(null)).toMatchObject({ applied: 1, surviving: 0 });
      expect(store.inspectEditQualitySignals(null).editVolume).toBeGreaterThan(0);
      const next = suggest(store, book, paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[1]!.blockId, 4, 7, '甲');
      store.applyChangeSuggestion({ ...binding(store, book), markId: next.markId, clientEffectId: randomUUID(), interaction: 'accept-edited-and-apply', editedText: '甲乙', reason: null });
      expect(store.inspectEditQualitySignals(null).surviving).toBe(1);
      const beforeReverse = store.inspectEditQualitySignals(null);
      store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId: next.markId, clientEffectId: randomUUID() });
      expect(store.inspectEditQualitySignals(null).surviving).toBe(0);
      expect(store.inspectEditQualitySignals(null).lineageDigest).not.toBe(beforeReverse.lineageDigest);
    } finally { store.markCleanShutdown(); store.close(); }
  }, 120_000);

  it('writes the text with its receipt in one interaction, keeps the three records apart, and never writes twice', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Imported;
    let markId: string;
    let blockId: string;
    let expected: string;
    try {
      book = await importBook(first);
      const before = first.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = paragraphs(before)[0]!;
      blockId = block.blockId;
      const parts = graphemesOf(block.text);
      // A highlight behind the suggestion: it must follow the Apply like any other change of the block.
      const highlight = first.createEditorialMark({
        ...book, windowStartBlockId: before.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: before.revisionId,
        expectedJournalSequence: before.journalSequence, blockId, baseBlockDigest: block.digest, fromGrapheme: 20, toGrapheme: 26,
        selectedText: parts.slice(20, 26).join(''), kind: 'personal-highlight', highlightColor: 1, body: '', proposedText: null, rationale: null,
      }).markId;
      ({ markId } = suggest(first, book, blockId, 6, 12));
      expected = [...parts.slice(0, 6), ...graphemesOf(PROPOSED), ...parts.slice(12)].join('');

      const clientEffectId = randomUUID();
      expect(first.getManuscriptApplyOutcome(book.manuscriptId, book.branchId, clientEffectId)).toEqual({ state: 'not-committed', application: null });
      const applied = first.applyChangeSuggestion({ ...binding(first, book), markId, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null });
      expect(blockText(first, book, blockId) === expected).toBe(true);
      expect(applied.window.blocks.find((candidate) => candidate.blockId === blockId)!.text === expected).toBe(true);
      expect(applied.application).toMatchObject({
        kind: 'apply', interaction: 'accept-and-apply', changeCount: 1, reversesEffectId: null, reversedByEffectId: null,
        before: { revisionId: before.revisionId, journalSequence: before.journalSequence, workingDigest: before.workingDigest },
        after: { revisionId: before.revisionId, journalSequence: before.journalSequence + 1, workingDigest: applied.window.workingDigest },
      });
      expect(applied.card).toMatchObject({ status: 'applied', anchorState: 'exact', pinnedText: PROPOSED, fromGrapheme: 6, toGrapheme: 6 + graphemesOf(PROPOSED).length });
      expect(applied.card!.suggestion!.decision).toMatchObject({ disposition: 'accepted', editedText: null });
      expect(applied.card!.suggestion!.application).toEqual(applied.application);
      const delta = graphemesOf(PROPOSED).length - 6;
      expect(applied.marks.find((mark) => mark.markId === highlight)).toMatchObject({ fromGrapheme: 20 + delta, toGrapheme: 26 + delta, anchorState: 'exact' });
      expect(applied.marks.find((mark) => mark.markId === markId)).toMatchObject({ status: 'applied', disposition: 'accepted' });

      // A lost acknowledgement asks again with the same identity: the receipt it already has, no second write.
      const again = first.applyChangeSuggestion({ ...binding(first, book), markId, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null });
      expect(again.application).toEqual(applied.application);
      expect(again.window.journalSequence).toBe(before.journalSequence + 1);
      expect(first.getManuscriptApplyOutcome(book.manuscriptId, book.branchId, clientEffectId)).toEqual({ state: 'committed', application: applied.application });
      // Another identity on the same suggestion is a second Apply, and is refused.
      expect(storeError(() => first.applyChangeSuggestion({ ...binding(first, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null })))
        .toBe('APPLY_ALREADY_COMMITTED');
      // A committed Apply is not taken back by 撤销, and an applied suggestion is neither re-decided nor converted.
      expect(storeError(() => first.undoManuscript(book.manuscriptId, book.branchId, applied.window.workingDigest))).toBe('NOTHING_TO_UNDO');
      expect(storeError(() => first.recordChangeSuggestionDecision({ ...binding(first, book), markId, clientDecisionId: randomUUID(), disposition: 'withdrawn', editedText: null, reason: null })))
        .toBe('MARK_DECISION_INVALID');
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    // The outcome is read from the records, not from a session: it is there after a restart (V2-UX-EREC-009).
    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(blockText(second, book, blockId) === expected).toBe(true);
      const card = second.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card.status).toBe('applied');
      expect(card.suggestion!.application).toMatchObject({ kind: 'apply', changeCount: 1 });
      second.markCleanShutdown();
    } finally {
      second.close();
    }

    const database = new DatabaseSync(databasePath);
    try {
      expect(database.prepare(
        `SELECT (SELECT count(*) FROM manuscript_effect_intents) intents, (SELECT count(*) FROM manuscript_effect_targets) targets,
                (SELECT count(*) FROM manuscript_effect_approvals) approvals, (SELECT count(*) FROM manuscript_effect_dispatches) dispatches,
                (SELECT count(*) FROM manuscript_effect_receipts) receipts, (SELECT count(*) FROM proposal_item_decisions) decisions`,
      ).get()).toEqual({ intents: 1, targets: 1, approvals: 1, dispatches: 1, receipts: 1, decisions: 1 });
      // A receipt holds identities and digests, never the words: no relation of the ledger has them.
      for (const relation of EFFECT_RELATIONS) {
        const columns = (database.prepare(`PRAGMA table_xinfo("${relation}")`).all() as { name: string }[]).map((column) => column.name);
        for (const column of columns) {
          expect(database.prepare(`SELECT 1 FROM "${relation}" WHERE instr(CAST("${column}" AS TEXT), ?) > 0`).get(PROPOSED)).toBeUndefined();
        }
        expect(() => database.exec(`UPDATE ${relation} SET rowid = rowid`)).toThrow(/MANUSCRIPT_EFFECT_LEDGER_IMMUTABLE/);
        expect(() => database.exec(`DELETE FROM ${relation}`)).toThrow(/MANUSCRIPT_EFFECT_LEDGER_IMMUTABLE/);
      }
    } finally {
      database.close();
    }
  }, 300_000);

  it('widens a revision-22 store\'s marks relation with every row as it was, and a deletion then applies and reverses on it', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const markRelations = ['editorial_marks', 'editorial_mark_replies', 'proposal_change_items', 'proposal_item_decisions', 'proposal_decision_reasons'];
    const rowsOf = (database: DatabaseSync): Record<string, unknown[]> =>
      Object.fromEntries(markRelations.map((relation) => [relation, database.prepare(`SELECT rowid, * FROM ${relation} ORDER BY rowid`).all()]));
    const markText = (database: DatabaseSync): unknown => database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'editorial_marks'").get();
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Imported;
    let blockId: string;
    try {
      book = await importBook(first);
      const window = first.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = paragraphs(window)[0]!;
      blockId = block.blockId;
      const bound = binding(first, book);
      const mark = (from: number, to: number, kind: 'personal-highlight' | 'annotation', body: string): string => first.createEditorialMark({
        ...bound, clientMarkId: randomUUID(), baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence, blockId,
        baseBlockDigest: block.digest, fromGrapheme: from, toGrapheme: to, selectedText: graphemesOf(block.text).slice(from, to).join(''), kind,
        highlightColor: kind === 'personal-highlight' ? 1 : null, body, proposedText: null, rationale: null,
      }).markId;
      const update = { highlightColor: null, status: null, targetKind: null, proposedText: null, rationale: null } as const;
      // A highlight converted to a 备注 (a mark that names the one it came from), a 批注 with a reply,
      // and a 修改建议 with its Proposal Change Item, a decision and the reason given for it.
      first.updateEditorialMark({ ...bound, ...update, markId: mark(20, 26, 'personal-highlight', ''), action: 'convert', targetKind: 'editor-note', body: '〔转成备注〕' });
      first.updateEditorialMark({ ...bound, ...update, markId: mark(30, 36, 'annotation', '〔批注〕'), action: 'reply', body: '〔回复〕' });
      first.recordChangeSuggestionDecision({
        ...bound, markId: suggest(first, book, blockId, 2, 5).markId, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason: '〔原因〕',
      });
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    let planted: Record<string, unknown[]> = {};
    const downgrade = new DatabaseSync(databasePath);
    try {
      // A revision-22 store also carried the three kind-coupled analysis relations as revision 20 left
      // them, and none of revision 24's Review Run relations (Issue #417).
      downgradeKindCoupledRelations(downgrade, ANALYSIS_LEDGER_REVISION_23_SQL);
      execPre74Fixture(downgrade, `BEGIN IMMEDIATE;
        ${[...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER, ...PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER, ...PUBLICATION_VERSION_RELATIONS_DROP_ORDER, ...REVIEW_RUN_RELATIONS_DROP_ORDER, ...EFFECT_RELATIONS].map((relation) => `DROP TABLE ${relation};`).join('\n')}
        PRAGMA user_version = ${EDITORIAL_MARK_SCHEMA_VERSION};
        COMMIT;`);
      downgradeEditorialMarksToRevision22(downgrade);
      expect(markText(downgrade)).toEqual({ sql: EDITORIAL_MARK_REVISION_22_SQL.editorial_marks });
      planted = rowsOf(downgrade);
    } finally {
      downgrade.close();
    }
    expect(markRelations.map((relation) => planted[relation]!.length)).toEqual([4, 1, 1, 1, 1]);

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(databasePath, { readOnly: true });
    try {
      // Through revisions 23 to 25 to the terminal 26: the widened text, every row of the five relations exactly
      // as revision 22 held it, and the Effect relations beside them.
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
      expect(markText(after)).toEqual({ sql: EDITORIAL_MARK_SCHEMA_SQL.editorial_marks });
      expect(rowsOf(after)).toEqual(planted);
      expect(after.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(after.prepare('SELECT count(*) total FROM manuscript_effect_intents').get()).toEqual({ total: 0 });
    } finally {
      after.close();
    }

    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const before = blockText(reopened, book, blockId);
      const { markId, pinned } = suggest(reopened, book, blockId, 8, 12, '');
      const applied = reopened.applyChangeSuggestion({ ...binding(reopened, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
      expect(applied.card).toMatchObject({ status: 'applied', anchorState: 'exact', pinnedText: '', fromGrapheme: 8, toGrapheme: 8 });
      const reversed = reopened.reverseAppliedChangeSuggestion({ ...binding(reopened, book), markId, clientEffectId: randomUUID() });
      expect(blockText(reopened, book, blockId) === before).toBe(true);
      expect(reversed.card).toMatchObject({ status: 'open', anchorState: 'exact', pinnedText: pinned, fromGrapheme: 8, toGrapheme: 12 });
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);

  it('migrates a revision-22 store forward, adding the five empty Effect relations', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Imported;
    let markId: string;
    try {
      book = await importBook(first);
      ({ markId } = suggest(first, book, paragraphs(first.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!.blockId, 6, 12));
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const downgrade = new DatabaseSync(databasePath);
    try {
      // A revision-22 store carried the three kind-coupled analysis relations as revision 20 left them;
      // revision 24 (Issue #417) validates exactly that before it rebuilds them, and adds its Review Run
      // relations, which a store that old never held.
      downgradeKindCoupledRelations(downgrade, ANALYSIS_LEDGER_REVISION_23_SQL);
      execPre74Fixture(downgrade, `BEGIN IMMEDIATE;
        ${[...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER, ...PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER, ...PUBLICATION_VERSION_RELATIONS_DROP_ORDER, ...REVIEW_RUN_RELATIONS_DROP_ORDER, ...EFFECT_RELATIONS].map((relation) => `DROP TABLE ${relation};`).join('\n')}
        PRAGMA user_version = ${EDITORIAL_MARK_SCHEMA_VERSION};
        COMMIT;`);
      downgradeEditorialMarksToRevision22(downgrade);
    } finally {
      downgrade.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(migrated.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).suggestion!.application).toBeNull();
      expect(migrated.applyChangeSuggestion({ ...binding(migrated, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null }).card!.status)
        .toBe('applied');
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
      expect(after.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      after.close();
    }
  }, 300_000);
});
