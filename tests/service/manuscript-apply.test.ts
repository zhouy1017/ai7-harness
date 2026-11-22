import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

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

  it('counts an Apply taken back and put back by editor steps (redo, or Ctrl+Z of a card reversal) as one applied target (#1654)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const suggestion = suggest(store, book, block.blockId, 6, 12, '建议');
      store.applyChangeSuggestion({ ...binding(store, book), markId: suggestion.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
      const digest = (): string => store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest;
      const signals = (): { applied: number; surviving: number } => {
        const { applied, surviving } = store.inspectEditQualitySignals(null);
        return { applied, surviving };
      };
      expect(signals()).toEqual({ applied: 1, surviving: 1 });
      for (let round = 0; round < 2; round += 1) {
        store.undoManuscript(book.manuscriptId, book.branchId, digest());
        expect(signals()).toEqual({ applied: 1, surviving: 0 });
        store.redoManuscript(book.manuscriptId, book.branchId, digest());
        expect(signals()).toEqual({ applied: 1, surviving: 1 });
      }
      // The card's 撤销本次修改, then Ctrl+Z of it, puts the same accepted change back: still one applied target, twice over.
      for (let round = 0; round < 2; round += 1) {
        store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId: suggestion.markId, clientEffectId: randomUUID() });
        expect(signals()).toEqual({ applied: 1, surviving: 0 });
        store.undoManuscript(book.manuscriptId, book.branchId, digest());
        expect(signals()).toEqual({ applied: 1, surviving: 1 });
      }
      // Two accepted changes: each Apply's re-applied generations are counted once, through the card and the history alike.
      const other = suggest(store, book, paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[1]!.blockId, 4, 7, '甲');
      store.applyChangeSuggestion({ ...binding(store, book), markId: other.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
      expect(signals()).toEqual({ applied: 2, surviving: 2 });
      store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId: suggestion.markId, clientEffectId: randomUUID() });
      expect(signals()).toEqual({ applied: 2, surviving: 1 });
      store.undoManuscript(book.manuscriptId, book.branchId, digest());
      expect(signals()).toEqual({ applied: 2, surviving: 2 });
      store.redoManuscript(book.manuscriptId, book.branchId, digest());
      expect(signals()).toEqual({ applied: 2, surviving: 1 });
      store.undoManuscript(book.manuscriptId, book.branchId, digest());
      store.undoManuscript(book.manuscriptId, book.branchId, digest());
      expect(signals()).toEqual({ applied: 2, surviving: 1 });
      store.redoManuscript(book.manuscriptId, book.branchId, digest());
      expect(signals()).toEqual({ applied: 2, surviving: 2 });
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
      // An applied suggestion is neither re-decided nor converted. The committed Apply is the editor step Ctrl+Z would take back
      // next (#1654); tests/service/editor-steps.test.ts takes it back.
      expect(storeError(() => first.recordChangeSuggestionDecision({ ...binding(first, book), markId, clientDecisionId: randomUUID(), disposition: 'withdrawn', editedText: null, reason: null })))
        .toBe('MARK_DECISION_INVALID');
      expect(first.inspectEditorHistory(book.manuscriptId, book.branchId).undo).toMatchObject({ kind: 'accept', label: '接受修改建议', changeCount: 1 });
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

});
