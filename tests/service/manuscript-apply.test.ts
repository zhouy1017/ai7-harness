import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { EDITORIAL_MARK_SCHEMA_VERSION, EDITORIAL_REVIEW_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { downgradeKindCoupledRelationsToRevision23 } from '../support/analysis-ledger-revisions.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { downgradeEditorialMarksToRevision22 } from '../support/editorial-mark-revisions.js';
import { EDITORIAL_MARK_REVISION_22_SQL, EDITORIAL_MARK_SCHEMA_SQL } from '../../src/service/editorial-marks.js';

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

  it('applies the editor\'s own wording, and a decision recorded before Apply existed', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const [first, second] = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null));
      const one = suggest(store, book, first!.blockId, 4, 9);
      const edited = store.applyChangeSuggestion({ ...binding(store, book), markId: one.markId, clientEffectId: randomUUID(), interaction: 'accept-edited-and-apply', editedText: EDITED, reason: '更贴近作者的语气' });
      expect(graphemesOf(blockText(store, book, first!.blockId)).slice(4, 4 + graphemesOf(EDITED).length).join('')).toBe(EDITED);
      expect(edited.card!.suggestion!.decision).toMatchObject({ disposition: 'accepted-with-edit', editedText: EDITED, reason: '更贴近作者的语气', reasonSource: 'reason-field' });
      expect(edited.application.interaction).toBe('accept-edited-and-apply');
      expect(storeError(() => store.applyChangeSuggestion({ ...binding(store, book), markId: suggest(store, book, second!.blockId, 30, 34).markId, clientEffectId: randomUUID(), interaction: 'accept-edited-and-apply', editedText: null, reason: null })))
        .toBe('APPLY_INVALID');

      const two = suggest(store, book, second!.blockId, 4, 9);
      store.recordChangeSuggestionDecision({ ...binding(store, book), markId: two.markId, clientDecisionId: randomUUID(), disposition: 'accepted-with-edit', editedText: EDITED, reason: null });
      expect(storeError(() => store.applyChangeSuggestion({ ...binding(store, book), markId: two.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null })))
        .toBe('APPLY_INVALID');
      const recorded = store.applyChangeSuggestion({ ...binding(store, book), markId: two.markId, clientEffectId: randomUUID(), interaction: 'apply-recorded-decision', editedText: null, reason: null });
      expect(recorded.card).toMatchObject({ status: 'applied', pinnedText: EDITED });
      expect(graphemesOf(blockText(store, book, second!.blockId)).slice(4, 4 + graphemesOf(EDITED).length).join('')).toBe(EDITED);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('refuses a drifted target whole: no text, no decision, no approval, no receipt', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = paragraphs(window)[0]!;
      const { markId } = suggest(store, book, block.blockId, 6, 12);
      const current = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const edited = store.flushJournalEdit({
        clientEditId: randomUUID(), ...book, baseRevisionId: current.revisionId, blockId: block.blockId,
        windowStartBlockId: current.blocks[0]!.blockId, baseBlockDigest: current.blocks.find((candidate) => candidate.blockId === block.blockId)!.digest,
        expectedJournalSequence: current.journalSequence, fromGrapheme: 8, toGrapheme: 9, insertText: '改',
      }).window;
      const clientEffectId = randomUUID();
      expect(storeError(() => store.applyChangeSuggestion({ ...binding(store, book), markId, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null })))
        .toBe('APPLY_TARGET_DRIFTED');
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest).toBe(edited.workingDigest);
      expect(store.getManuscriptApplyOutcome(book.manuscriptId, book.branchId, clientEffectId).state).toBe('not-committed');
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId)).toMatchObject({ status: 'open', anchorState: 'drifted' });
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).suggestion!.decision).toBeNull();
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(database.prepare('SELECT (SELECT count(*) FROM manuscript_effect_intents) intents, (SELECT count(*) FROM proposal_item_decisions) decisions').get())
        .toEqual({ intents: 0, decisions: 0 });
    } finally {
      database.close();
    }
  }, 300_000);

  it('reverses a committed Apply with a new Effect and leaves the original receipt as it was', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const original = block.text;
      const { markId, pinned } = suggest(store, book, block.blockId, 6, 12);
      expect(storeError(() => store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: randomUUID() }))).toBe('APPLY_INVALID');
      const applied = store.applyChangeSuggestion({ ...binding(store, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });

      const reverseId = randomUUID();
      const reversed = store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: reverseId });
      expect(blockText(store, book, block.blockId) === original).toBe(true);
      expect(reversed.application).toMatchObject({ kind: 'reverse-apply', interaction: 'confirm-reverse-apply', reversesEffectId: applied.application.effectId });
      expect(reversed.application.after.journalSequence).toBe(applied.application.after.journalSequence + 1);
      // The mark stands on the restored text and the item is undecided again; the first Apply is history, named as reversed.
      expect(reversed.card).toMatchObject({ status: 'open', anchorState: 'exact', pinnedText: pinned, fromGrapheme: 6, toGrapheme: 12 });
      expect(reversed.card!.suggestion!.decision).toBeNull();
      expect(reversed.card!.suggestion!.application).toMatchObject({ effectId: applied.application.effectId, receiptDigest: applied.application.receiptDigest, reversedByEffectId: reversed.application.effectId });
      expect(store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: reverseId }).application).toEqual(reversed.application);
      expect(storeError(() => store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: randomUUID() }))).toBe('APPLY_INVALID');

      // It can be accepted again: a new Effect, a new receipt.
      const second = store.applyChangeSuggestion({ ...binding(store, book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
      expect(second.application.effectId).not.toBe(applied.application.effectId);
      // Text typed into the applied words afterwards is the editor's own: reversing would overwrite it, so it is refused.
      const now = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      store.flushJournalEdit({
        clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId: block.blockId, windowStartBlockId: now.blocks[0]!.blockId,
        baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === block.blockId)!.digest, expectedJournalSequence: now.journalSequence,
        fromGrapheme: 7, toGrapheme: 7, insertText: '后改',
      });
      expect(storeError(() => store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: randomUUID() }))).toBe('APPLY_TARGET_DRIFTED');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('applies a suggestion that deletes its words, stands exactly where they were, and writes them back there when reversed', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let point = 6;
    let length = 0;
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const { markId, pinned } = suggest(store, book, block.blockId, 6, 12, '');
      length = graphemesOf(pinned).length;
      const applyId = randomUUID();
      const applied = store.applyChangeSuggestion({ ...binding(store, book), markId, clientEffectId: applyId, interaction: 'accept-and-apply', editedText: null, reason: null });
      let text = [...graphemesOf(block.text).slice(0, 6), ...graphemesOf(block.text).slice(12)];
      expect(blockText(store, book, block.blockId) === text.join('')).toBe(true);
      // Nothing was changed after the Apply: the mark is 已应用 and exact, pinned on no text at the point the words left.
      expect(applied.card).toMatchObject({ status: 'applied', anchorState: 'exact', pinnedText: '', fromGrapheme: 6, toGrapheme: 6 });
      expect(applied.card!.pin).toMatchObject({
        journalSequence: applied.application.after.journalSequence,
        blockDigest: applied.window.blocks.find((candidate) => candidate.blockId === block.blockId)!.digest,
      });
      expect(applied.marks.find((mark) => mark.markId === markId)).toMatchObject({ status: 'applied', anchorState: 'exact', fromGrapheme: 6, toGrapheme: 6 });
      // The window names the words the point stands for, so the surface can draw and name it without a card.
      expect(applied.marks.find((mark) => mark.markId === markId)!.deletedText === pinned).toBe(true);

      // Typing in front of the point moves it, text typed exactly at it lands in front of it, and typing behind it leaves it.
      const [front, at, behind] = ['〔前〕', '〔点〕', '〔后〕'].map(graphemesOf) as [string[], string[], string[]];
      typeInto(store, book, block.blockId, 2, 2, front.join(''));
      text = [...text.slice(0, 2), ...front, ...text.slice(2)];
      point += front.length;
      typeInto(store, book, block.blockId, point, point, at.join(''));
      text = [...text.slice(0, point), ...at, ...text.slice(point)];
      point += at.length;
      const typed = typeInto(store, book, block.blockId, point + 5, point + 5, behind.join(''));
      text = [...text.slice(0, point + 5), ...behind, ...text.slice(point + 5)];
      expect(blockText(store, book, block.blockId) === text.join('')).toBe(true);
      expect(typed.marks.find((mark) => mark.markId === markId)).toMatchObject({ status: 'applied', anchorState: 'exact', fromGrapheme: point, toGrapheme: point });

      // 确认撤销本次应用 writes the words back at the point as one new Effect, and the mark stands on them, open and exact.
      const reverseId = randomUUID();
      const reversed = store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: reverseId });
      expect(blockText(store, book, block.blockId) === [...text.slice(0, point), ...graphemesOf(pinned), ...text.slice(point)].join('')).toBe(true);
      expect(reversed.application).toMatchObject({
        kind: 'reverse-apply', interaction: 'confirm-reverse-apply', changeCount: 1, reversesEffectId: applied.application.effectId,
        before: { journalSequence: typed.journalSequence, workingDigest: typed.workingDigest },
        after: { journalSequence: typed.journalSequence + 1, workingDigest: reversed.window.workingDigest },
      });
      expect(reversed.card).toMatchObject({ status: 'open', anchorState: 'exact', pinnedText: pinned, fromGrapheme: point, toGrapheme: point + length });
      expect(reversed.marks.find((mark) => mark.markId === markId)!.deletedText).toBeNull();
      expect(reversed.card!.suggestion!.decision).toBeNull();
      // The first Apply and its receipt stay exactly as committed; only the link to the Effect that reversed it is new.
      expect(store.getManuscriptApplyOutcome(book.manuscriptId, book.branchId, applyId))
        .toEqual({ state: 'committed', application: { ...applied.application, reversedByEffectId: reversed.application.effectId } });
      expect(store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId: reverseId }).application).toEqual(reversed.application);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const targets = (kind: string): unknown => database.prepare(
        `SELECT t.from_grapheme, t.to_grapheme, t.resulting_from_grapheme, t.resulting_to_grapheme
         FROM manuscript_effect_targets t JOIN manuscript_effect_intents i ON i.effect_id = t.effect_id WHERE i.kind = ?`,
      ).all(kind);
      // The Apply replaced six graphemes with none; its reversal is an insertion into the empty range at the point.
      expect(targets('apply')).toEqual([{ from_grapheme: 6, to_grapheme: 12, resulting_from_grapheme: 6, resulting_to_grapheme: 6 }]);
      expect(targets('reverse-apply')).toEqual([{ from_grapheme: point, to_grapheme: point, resulting_from_grapheme: point, resulting_to_grapheme: point + length }]);
    } finally {
      database.close();
    }
  }, 300_000);

  it('refuses to reverse a deletion once an edit has spanned the point its words left', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      // 修改后接受 with the field left empty: the editor's own wording deletes the words.
      const { markId } = suggest(store, book, block.blockId, 6, 12);
      const applied = store.applyChangeSuggestion({ ...binding(store, book), markId, clientEffectId: randomUUID(), interaction: 'accept-edited-and-apply', editedText: '', reason: null });
      expect(applied.card).toMatchObject({ status: 'applied', anchorState: 'exact', pinnedText: '', fromGrapheme: 6, toGrapheme: 6 });
      expect(applied.card!.suggestion!.decision).toMatchObject({ disposition: 'accepted-with-edit', editedText: '' });

      // Taking away the grapheme on one side of the point leaves it exact; an edit taking graphemes from both sides does not.
      typeInto(store, book, block.blockId, 5, 6, '');
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId)).toMatchObject({ status: 'applied', anchorState: 'exact', fromGrapheme: 5, toGrapheme: 5 });
      const spanned = typeInto(store, book, block.blockId, 4, 6, '改');
      expect(spanned.marks.find((mark) => mark.markId === markId)).toMatchObject({ status: 'applied', anchorState: 'drifted' });
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId)).toMatchObject({ status: 'applied', anchorState: 'drifted' });

      const clientEffectId = randomUUID();
      let refusal: unknown;
      try {
        store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId, clientEffectId });
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toBeInstanceOf(StoreError);
      expect(refusal).toMatchObject({ code: 'APPLY_TARGET_DRIFTED', message: '应用后的文字又改过，不能直接撤销这次应用。' });
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest).toBe(spanned.workingDigest);
      expect(store.getManuscriptApplyOutcome(book.manuscriptId, book.branchId, clientEffectId).state).toBe('not-committed');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('never guesses which side of each other two deletions applied side by side stood', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const block = paragraphs(store.getManuscriptWindow(book.manuscriptId, book.branchId, null))[0]!;
      const parts = graphemesOf(block.text);
      const first = suggest(store, book, block.blockId, 4, 6, '');
      const second = suggest(store, book, block.blockId, 6, 9, '');
      const batch = store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: [first.markId, second.markId], clientEffectId: randomUUID() });
      expect(blockText(store, book, block.blockId) === [...parts.slice(0, 4), ...parts.slice(9)].join('')).toBe(true);
      for (const { markId } of [first, second]) {
        expect(batch.marks.find((mark) => mark.markId === markId)).toMatchObject({ status: 'applied', anchorState: 'exact', fromGrapheme: 4, toGrapheme: 4 });
      }
      // The second deletion's words go back at the one point both stand on. Whether the first deletion's
      // words belong in front of them or behind them is no longer known there, so that one drifts.
      const reversed = store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId: second.markId, clientEffectId: randomUUID() });
      expect(blockText(store, book, block.blockId) === [...parts.slice(0, 4), ...parts.slice(6)].join('')).toBe(true);
      expect(reversed.card).toMatchObject({ status: 'open', anchorState: 'exact', pinnedText: second.pinned, fromGrapheme: 4, toGrapheme: 7 });
      expect(reversed.marks.find((mark) => mark.markId === first.markId)).toMatchObject({ status: 'applied', anchorState: 'drifted' });
      expect(storeError(() => store.reverseAppliedChangeSuggestion({ ...binding(store, book), markId: first.markId, clientEffectId: randomUUID() })))
        .toBe('APPLY_TARGET_DRIFTED');
      store.markCleanShutdown();
    } finally {
      store.close();
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
      downgrade.exec(`BEGIN IMMEDIATE;
        ${EFFECT_RELATIONS.map((relation) => `DROP TABLE ${relation};`).join('\n')}
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
      // Revision 23: the widened text, every row of the five relations exactly as revision 22 held it, and the Effect relations beside them.
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MANUSCRIPT_EFFECT_SCHEMA_VERSION);
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

  it('applies a confirmed batch as one Effect, all or none', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const before = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const [first, second] = paragraphs(before);
      const marks = [suggest(store, book, first!.blockId, 2, 5), suggest(store, book, first!.blockId, 14, 18), suggest(store, book, second!.blockId, 3, 7)];
      const texts = [first!.blockId, second!.blockId].map((blockId) => blockText(store, book, blockId));

      // One member drifts: the whole Effect is refused and nothing is written, the drifted one included by name.
      const drifting = suggest(store, book, second!.blockId, 20, 24);
      const current = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const edited = store.flushJournalEdit({
        clientEditId: randomUUID(), ...book, baseRevisionId: current.revisionId, blockId: second!.blockId, windowStartBlockId: current.blocks[0]!.blockId,
        baseBlockDigest: current.blocks.find((candidate) => candidate.blockId === second!.blockId)!.digest, expectedJournalSequence: current.journalSequence,
        fromGrapheme: 21, toGrapheme: 22, insertText: '改',
      }).window;
      expect(storeError(() => store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: [...marks.map((mark) => mark.markId), drifting.markId], clientEffectId: randomUUID() })))
        .toBe('APPLY_TARGET_DRIFTED');
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest).toBe(edited.workingDigest);

      const batch = store.applyChangeSuggestionBatch({ ...binding(store, book), markIds: marks.map((mark) => mark.markId), clientEffectId: randomUUID() });
      expect(batch.application).toMatchObject({ kind: 'apply', interaction: 'confirm-batch-apply', changeCount: 3 });
      expect(batch.application.after.journalSequence).toBe(edited.journalSequence + 1);
      const length = graphemesOf(PROPOSED).length;
      const firstNow = graphemesOf(blockText(store, book, first!.blockId));
      expect(firstNow.slice(2, 2 + length).join('')).toBe(PROPOSED);
      expect(firstNow.slice(14 + (length - 3), 14 + (length - 3) + length).join('')).toBe(PROPOSED);
      expect(firstNow.length).toBe(graphemesOf(texts[0]!).length + (length - 3) + (length - 4));
      expect(graphemesOf(blockText(store, book, second!.blockId)).slice(3, 3 + length).join('')).toBe(PROPOSED);
      for (const mark of marks) {
        expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, mark.markId)).toMatchObject({ status: 'applied', anchorState: 'exact', pinnedText: PROPOSED });
      }
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, drifting.markId)).toMatchObject({ status: 'open', anchorState: 'drifted' });
      store.markCleanShutdown();
    } finally {
      store.close();
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
      // revision 24 (Issue #417) validates exactly that before it rebuilds them.
      downgradeKindCoupledRelationsToRevision23(downgrade);
      downgrade.exec(`BEGIN IMMEDIATE;
        ${EFFECT_RELATIONS.map((relation) => `DROP TABLE ${relation};`).join('\n')}
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
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(EDITORIAL_REVIEW_SCHEMA_VERSION);
      expect(after.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      after.close();
    }
  }, 300_000);
});
