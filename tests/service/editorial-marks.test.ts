import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION,
  CLARIFICATION_SCHEMA_VERSION, BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type {
  CreateEditorialMarkInput,
  EditorialMarkKind,
  ManuscriptWindowProjection,
  UpdateEditorialMarkInput,
} from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { downgradeKindCoupledRelationsToRevision23 } from '../support/analysis-ledger-revisions.js';
import { REVIEW_RUN_RELATIONS_DROP_ORDER } from '../support/review-categories.js';
import { PUBLICATION_VERSION_RELATIONS_DROP_ORDER } from '../support/publication-versions.js';
import { PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER } from '../support/proposal-conflicts.js';
import { IMPORT_RETENTION_RELATIONS_DROP_ORDER } from '../support/import-retention.js';
import { IMPORTED_MARK_RELATIONS_DROP_ORDER } from '../support/imported-marks.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER } from '../support/default-execution-rules.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';

// Service-integration suite (L2) for Editorial Marks (Issue #407). It drives the real `EditorialStore`
// on a temporary Agent Data Root. The manuscript is composed from the one admitted SampleBook, so no
// assertion prints its text: marks are made on ranges found at test time and compared by count,
// offset, state and boolean.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '标记组稿' };
const NOTE_SENTINEL = '仅编辑可见的备注哨兵文本';
const MARK_RELATIONS = [
  // A store taken back below revision 26 never held its proposal-conflict relations, and one below 25
  // never held its Publication Version relations.
  // A store taken back below revision 27 never held its import-retention relations, nor one below 28 its
  // staged imported marks.
  ...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER,
  ...EXPORT_LEDGER_RELATIONS_DROP_ORDER,
  ...IMPORTED_MARK_RELATIONS_DROP_ORDER,
  ...IMPORT_RETENTION_RELATIONS_DROP_ORDER,
  ...PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER,
  ...PUBLICATION_VERSION_RELATIONS_DROP_ORDER,
  // Revision 24's Review Run relations refer to the marks, so a store taken back below them loses them first.
  ...REVIEW_RUN_RELATIONS_DROP_ORDER,
  'manuscript_effect_receipts', 'manuscript_effect_dispatches', 'manuscript_effect_approvals', 'manuscript_effect_targets', 'manuscript_effect_intents', 'proposal_decision_reasons', 'proposal_item_decisions', 'proposal_change_items', 'editorial_mark_replies', 'editorial_marks',
];

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, 'marks.docx');
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

/** The first paragraph long enough to hold a mark with room on both sides. */
function markableBlock(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'][number] {
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 40);
  if (block === undefined) throw new Error('the composed window holds no paragraph of 40 graphemes');
  return block;
}

function markInput(
  book: Imported,
  window: ManuscriptWindowProjection,
  blockId: string,
  from: number,
  to: number,
  kind: EditorialMarkKind,
  extra: Partial<CreateEditorialMarkInput> = {},
): CreateEditorialMarkInput {
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  return {
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
    kind,
    highlightColor: kind === 'personal-highlight' ? 2 : null,
    body: kind === 'annotation' ? '此处称谓与前文不一致。' : kind === 'editor-note' ? NOTE_SENTINEL : '',
    proposedText: kind === 'change-suggestion' ? '示例替换文字' : null,
    rationale: kind === 'change-suggestion' ? '与全书用法统一。' : null,
    ...extra,
  };
}

function change(book: Imported, window: ManuscriptWindowProjection, markId: string, action: UpdateEditorialMarkInput['action'], extra: Partial<UpdateEditorialMarkInput> = {}): UpdateEditorialMarkInput {
  return {
    ...book,
    windowStartBlockId: window.blocks[0]!.blockId,
    markId,
    action,
    body: null,
    highlightColor: null,
    status: null,
    targetKind: null,
    proposedText: null,
    rationale: null,
    ...extra,
  };
}

function edit(store: EditorialStore, book: Imported, window: ManuscriptWindowProjection, blockId: string, from: number, to: number, insertText: string): ManuscriptWindowProjection {
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  return store.flushJournalEdit({
    clientEditId: randomUUID(),
    ...book,
    baseRevisionId: window.revisionId,
    blockId,
    windowStartBlockId: window.blocks[0]!.blockId,
    baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence,
    fromGrapheme: from,
    toGrapheme: to,
    insertText,
  }).window;
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

describe('Editorial Marks on a manuscript', () => {
  it('makes the four kinds on exact text, carries them in the window, and keeps them across a restart', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Imported;
    let blockId: string;
    try {
      book = await importBook(first);
      const window = first.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      expect(window.marks).toEqual([]);
      expect(window.marksTruncated).toBe(false);
      const block = markableBlock(window);
      blockId = block.blockId;
      const kinds: EditorialMarkKind[] = ['change-suggestion', 'annotation', 'editor-note', 'personal-highlight'];
      kinds.forEach((kind, index) => {
        const result = first.createEditorialMark(markInput(book, window, blockId, 2 + index * 6, 6 + index * 6, kind));
        expect(result.marks).toHaveLength(index + 1);
        expect(result.card?.kind).toBe(kind);
        expect(result.card?.source).toEqual({ kind: 'editor', origin: null, label: null, taskId: null });
        expect(result.card?.anchorState).toBe('exact');
        expect(graphemesOf(result.card!.pinnedText)).toHaveLength(4);
      });
      const marked = first.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks;
      expect(marked.map((mark) => mark.kind)).toEqual(kinds);
      expect(marked.map((mark) => [mark.fromGrapheme, mark.toGrapheme])).toEqual([[2, 6], [8, 12], [14, 18], [20, 24]]);
      expect(marked.map((mark) => mark.highlightColor)).toEqual([null, null, null, 2]);
      expect(marked.every((mark) => mark.blockId === blockId && mark.anchorState === 'exact' && mark.status === 'open' && mark.sourceKind === 'editor')).toBe(true);
      const cards = marked.map((mark) => first.getEditorialMarkCard(book.manuscriptId, book.branchId, mark.markId));
      expect(cards.map((card) => card.exportDisposition)).toEqual(['exported-by-default', 'exported-by-default', 'only-when-included', 'never-exported']);
      expect(cards[0]!.suggestion).toMatchObject({ proposedText: '示例替换文字', rationale: '与全书用法统一。', decision: null, atomicGroupId: null });
      expect(cards[0]!.suggestion!.currentText).toBe(cards[0]!.pinnedText);
      expect(cards[0]!.pin).toMatchObject({ revisionId: window.revisionId, journalSequence: window.journalSequence, blockDigest: block.digest });
      first.markCleanShutdown();
    } finally {
      first.close();
    }

    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const marks = second.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks;
      expect(marks).toHaveLength(4);
      expect(marks.every((mark) => mark.blockId === blockId && mark.anchorState === 'exact')).toBe(true);
      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 300_000);

  it('refuses a mark that is not made on the text the editor saw', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(window);
      const valid = markInput(book, window, block.blockId, 3, 8, 'annotation');
      expect(storeError(() => store.createEditorialMark({ ...valid, selectedText: `${valid.selectedText}改` }))).toBe('MARK_ANCHOR_CHANGED');
      expect(storeError(() => store.createEditorialMark({ ...valid, toGrapheme: 100_000 }))).toBe('MARK_RANGE_INVALID');
      expect(storeError(() => store.createEditorialMark({ ...valid, body: '   ' }))).toBe('MARK_BODY_INVALID');
      expect(storeError(() => store.createEditorialMark({ ...valid, highlightColor: 1 }))).toBe('MARK_INVALID');
      const suggestion = markInput(book, window, block.blockId, 3, 8, 'change-suggestion');
      expect(storeError(() => store.createEditorialMark({ ...suggestion, proposedText: suggestion.selectedText }))).toBe('MARK_BODY_INVALID');
      // The journal moved on after the editor read the window: the mark is refused, not silently re-pinned.
      edit(store, book, window, block.blockId, 0, 0, '新');
      expect(storeError(() => store.createEditorialMark(valid))).toBe('MARK_BINDING_CHANGED');
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks).toEqual([]);
      // A repeated command with the same client identity answers with the mark it already made.
      const fresh = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const once = markInput(book, fresh, block.blockId, 3, 8, 'annotation');
      const made = store.createEditorialMark(once);
      expect(store.createEditorialMark(once).markId).toBe(made.markId);
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks).toHaveLength(1);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('follows every durable change of its block and discloses a drift instead of re-matching', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      let window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(window);
      const markId = store.createEditorialMark(markInput(book, window, block.blockId, 10, 15, 'personal-highlight')).markId;
      const pinned = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).pinnedText;
      const range = (): [number, number, string] => {
        const mark = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks.find((candidate) => candidate.markId === markId)!;
        return [mark.fromGrapheme, mark.toGrapheme, mark.anchorState];
      };
      const standsAtRange = (): boolean => {
        const now = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
        const [from, to] = range();
        return graphemesOf(now.blocks.find((candidate) => candidate.blockId === block.blockId)!.text).slice(from, to).join('') === pinned;
      };

      window = edit(store, book, window, block.blockId, 0, 0, '前置三字');
      expect(range()).toEqual([14, 19, 'exact']);
      expect(window.marks.find((mark) => mark.markId === markId)).toMatchObject({ fromGrapheme: 14, toGrapheme: 19 });
      window = edit(store, book, window, block.blockId, 30, 32, '');
      expect(range()).toEqual([14, 19, 'exact']);
      window = edit(store, book, window, block.blockId, 14, 14, '贴前');
      expect(range()).toEqual([16, 21, 'exact']);
      window = edit(store, book, window, block.blockId, 21, 21, '贴后');
      expect(range()).toEqual([16, 21, 'exact']);
      expect(standsAtRange()).toBe(true);

      // A change inside the marked text: the mark stays where it was made and says 原文已变.
      window = edit(store, book, window, block.blockId, 18, 19, '改动');
      expect(range()).toEqual([16, 22, 'drifted']);
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId)).toMatchObject({ anchorState: 'drifted', pinnedText: pinned });
      expect(storeError(() => store.updateEditorialMark(change(book, window, markId, 'convert', { targetKind: 'editor-note', body: '转成备注' })))).toBe('MARK_ANCHOR_CHANGED');

      // Undoing that change puts the pinned text back, and the mark is exact again on it.
      store.undoManuscript(book.manuscriptId, book.branchId, window.workingDigest);
      expect(range()).toEqual([16, 21, 'exact']);
      expect(standsAtRange()).toBe(true);
      const undone = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      store.redoManuscript(book.manuscriptId, book.branchId, undone.workingDigest);
      expect(range()).toEqual([16, 22, 'drifted']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('keeps a mark exact between two occurrences a replacement rewrites around it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      let window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(window);
      // Plant one authored token on both sides of the text to be marked, so the replacement has two
      // occurrences in this block and the mark stands between them.
      window = edit(store, book, window, block.blockId, 4, 4, '〔替换靶〕');
      window = edit(store, book, window, block.blockId, 24, 24, '〔替换靶〕');
      const markId = store.createEditorialMark(markInput(book, window, block.blockId, 12, 18, 'annotation')).markId;
      const searchId = store.createSearch(book.manuscriptId, book.branchId, '〔替换靶〕').searchId;
      while (!store.advanceSearch(searchId).done) { /* bounded batches */ }
      const preview = store.prepareReplacement(searchId, '〔换〕', []);
      while (!store.advanceReplacementWork(preview.previewId).done) { /* preparing */ }
      expect(store.freezeReplacement(preview.previewId, []).state).toBe('frozen');
      while (!store.advanceReplacementWork(preview.previewId).done) { /* validating */ }
      expect(store.commitReplacement(preview.previewId).committedCount).toBe(2);
      const mark = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks.find((candidate) => candidate.markId === markId)!;
      // The first occurrence shrank by two graphemes in front of the mark; the second is behind it.
      expect([mark.fromGrapheme, mark.toGrapheme, mark.anchorState]).toEqual([10, 16, 'exact']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('converts along the allowed routes only, and a converted mark keeps its pin and its lineage', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(window);
      const highlight = store.createEditorialMark(markInput(book, window, block.blockId, 5, 11, 'personal-highlight'));
      expect(store.updateEditorialMark(change(book, window, highlight.markId, 'recolor', { highlightColor: 3 })).marks[0]!.highlightColor).toBe(3);
      expect(storeError(() => store.updateEditorialMark(change(book, window, highlight.markId, 'reply', { body: '回复' })))).toBe('MARK_ACTION_INVALID');

      const note = store.updateEditorialMark(change(book, window, highlight.markId, 'convert', { targetKind: 'editor-note', body: NOTE_SENTINEL }));
      expect(note.markId).not.toBe(highlight.markId);
      expect(note.marks.map((mark) => mark.kind)).toEqual(['editor-note']);
      expect(note.card).toMatchObject({ kind: 'editor-note', body: NOTE_SENTINEL, pinnedText: highlight.card!.pinnedText, fromGrapheme: 5, toGrapheme: 11 });
      expect(note.card!.convertedFrom).toEqual({ markId: highlight.markId, kind: 'personal-highlight', sourceKind: 'editor' });
      expect(note.card!.pin).toEqual(highlight.card!.pin);
      expect(storeError(() => store.getEditorialMarkCard(book.manuscriptId, book.branchId, highlight.markId))).toBe('MARK_NOT_FOUND');
      expect(storeError(() => store.updateEditorialMark(change(book, window, note.markId, 'convert', { targetKind: 'personal-highlight' })))).toBe('MARK_ACTION_INVALID');
      expect(store.updateEditorialMark(change(book, window, note.markId, 'edit-body', { body: '改过的备注' })).card!.body).toBe('改过的备注');

      const annotation = store.updateEditorialMark(change(book, window, note.markId, 'convert', { targetKind: 'annotation' }));
      expect(annotation.card).toMatchObject({ kind: 'annotation', body: '改过的备注', exportDisposition: 'exported-by-default' });
      const replied = store.updateEditorialMark(change(book, window, annotation.markId, 'reply', { body: '已与作者确认。' }));
      expect(replied.card!.replies.map((reply) => reply.body)).toEqual(['已与作者确认。']);
      expect(store.updateEditorialMark(change(book, window, annotation.markId, 'set-status', { status: 'resolved' })).marks[0]!.status).toBe('resolved');
      expect(store.updateEditorialMark(change(book, window, annotation.markId, 'set-status', { status: 'open' })).marks[0]!.status).toBe('open');

      const suggestion = store.updateEditorialMark(change(book, window, annotation.markId, 'convert', { targetKind: 'change-suggestion', proposedText: '替换后的说法' }));
      // The comment that prompted it is the reason it carries unless the editor writes another.
      expect(suggestion.card!.suggestion).toMatchObject({ currentText: highlight.card!.pinnedText, proposedText: '替换后的说法', rationale: '改过的备注', decision: null });
      expect(storeError(() => store.updateEditorialMark(change(book, window, suggestion.markId, 'remove')))).toBe('MARK_ACTION_INVALID');
      const back = store.updateEditorialMark(change(book, window, suggestion.markId, 'convert', { targetKind: 'annotation' }));
      expect(back.card!.kind).toBe('annotation');
      expect(back.card!.body).toContain('替换后的说法');
      expect(store.updateEditorialMark(change(book, window, back.markId, 'remove')).marks).toEqual([]);
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks).toEqual([]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('records a Proposal Decision apart from the item and from the manuscript, and supersedes instead of rewriting', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(window);
      const made = store.createEditorialMark(markInput(book, window, block.blockId, 6, 12, 'change-suggestion'));
      const decide = (disposition: 'rejected' | 'accepted-with-edit' | 'withdrawn', editedText: string | null, reason: string | null) =>
        store.recordChangeSuggestionDecision({ ...book, windowStartBlockId: window.blocks[0]!.blockId, markId: made.markId, clientDecisionId: randomUUID(), disposition, editedText, reason });

      expect(storeError(() => decide('withdrawn', null, null))).toBe('MARK_DECISION_INVALID');
      const rejected = decide('rejected', null, null);
      expect(rejected.marks[0]).toMatchObject({ status: 'resolved', disposition: 'rejected' });
      expect(rejected.card!.suggestion!.decision).toMatchObject({ disposition: 'rejected', editedText: null, reason: null, reasonSource: null });
      expect(storeError(() => decide('accepted-with-edit', '另一种说法', null))).toBe('MARK_DECISION_INVALID');

      // The optional reason chips follow a decision recorded without a reason, once.
      const decisionId = rejected.card!.suggestion!.decision!.decisionId;
      const reasoned = store.recordProposalDecisionReason({ ...book, windowStartBlockId: window.blocks[0]!.blockId, markId: made.markId, decisionId, reason: '方向不合适', reasonSource: 'suggested' });
      expect(reasoned.card!.suggestion!.decision).toMatchObject({ reason: '方向不合适', reasonSource: 'suggested' });
      expect(storeError(() => store.recordProposalDecisionReason({ ...book, windowStartBlockId: window.blocks[0]!.blockId, markId: made.markId, decisionId, reason: '再说一次', reasonSource: 'free-text' }))).toBe('MARK_DECISION_INVALID');

      const withdrawn = decide('withdrawn', null, null);
      expect(withdrawn.marks[0]).toMatchObject({ status: 'open', disposition: null });
      expect(withdrawn.card!.suggestion!.decision).toBeNull();

      expect(storeError(() => decide('accepted-with-edit', made.card!.pinnedText, null))).toBe('MARK_DECISION_INVALID');
      const accepted = decide('accepted-with-edit', '编辑改过的说法', '更贴近作者的语气');
      expect(accepted.marks[0]).toMatchObject({ status: 'open', disposition: 'accepted-with-edit' });
      expect(accepted.card!.suggestion!.decision).toMatchObject({ editedText: '编辑改过的说法', reason: '更贴近作者的语气', reasonSource: 'reason-field' });
      // Recording a decision changes no character of the manuscript: Apply is a separate step.
      const after = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      expect(after.workingDigest).toBe(window.workingDigest);
      expect(after.journalSequence).toBe(window.journalSequence);
      expect(storeError(() => store.updateEditorialMark(change(book, window, made.markId, 'convert', { targetKind: 'annotation' })))).toBe('MARK_ACTION_INVALID');
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    const database = new DatabaseSync(databasePath);
    try {
      expect(database.prepare('SELECT ordinal, disposition, supersedes_decision_id IS NULL first FROM proposal_item_decisions ORDER BY ordinal').all())
        .toEqual([
          { ordinal: 1, disposition: 'rejected', first: 1 },
          { ordinal: 2, disposition: 'withdrawn', first: 0 },
          { ordinal: 3, disposition: 'accepted-with-edit', first: 0 },
        ]);
      for (const relation of ['proposal_change_items', 'proposal_item_decisions', 'proposal_decision_reasons']) {
        expect(() => database.exec(`UPDATE ${relation} SET rowid = rowid`)).toThrow(/EDITORIAL_MARK_LEDGER_IMMUTABLE/);
        expect(() => database.exec(`DELETE FROM ${relation}`)).toThrow(/EDITORIAL_MARK_LEDGER_IMMUTABLE/);
      }
    } finally {
      database.close();
    }
  }, 300_000);

  it('carries AI7\'s marks with their source and basis, and keeps an Editor Note inside the mark relation', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(window);
      const parts = graphemesOf(block.text);
      const produced = store.createProducedEditorialMark({
        ...book,
        blockId: block.blockId,
        fromGrapheme: 8,
        toGrapheme: 13,
        pinnedText: parts.slice(8, 13).join(''),
        kind: 'annotation',
        body: '此处称谓与第三章不一致，是否为同一人？',
        proposedText: null,
        rationale: null,
        atomicGroupId: null,
        source: { kind: 'ai7', origin: 'review-category', label: '人名与称谓一致', taskId: null },
        basis: [{ label: '第三章 第二节', blockId: window.blocks[1]!.blockId, fromGrapheme: 0, toGrapheme: 2, quote: null }],
      });
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, produced);
      expect(card.source).toEqual({ kind: 'ai7', origin: 'review-category', label: '人名与称谓一致', taskId: null });
      expect(card.basis).toHaveLength(1);
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks[0]).toMatchObject({ markId: produced, sourceKind: 'ai7' });
      // AI7's words are not the editor's to rewrite; what the editor may do is turn the comment into a suggestion.
      expect(storeError(() => store.updateEditorialMark(change(book, window, produced, 'edit-body', { body: '改写 AI7 的批注' })))).toBe('MARK_ACTION_INVALID');
      const suggestion = store.updateEditorialMark(change(book, window, produced, 'convert', { targetKind: 'change-suggestion', proposedText: '统一后的称谓' }));
      expect(suggestion.card!.source.kind).toBe('editor');
      expect(suggestion.card!.convertedFrom).toEqual({ markId: produced, kind: 'annotation', sourceKind: 'ai7' });
      expect(suggestion.card!.basis).toHaveLength(1);
      expect(storeError(() => store.createProducedEditorialMark({
        ...book, blockId: block.blockId, fromGrapheme: 8, toGrapheme: 13, pinnedText: '不是这段文字', kind: 'annotation', body: '错位',
        proposedText: null, rationale: null, atomicGroupId: null, source: { kind: 'imported-author', label: '示例作者' }, basis: [],
      }))).toBe('MARK_ANCHOR_CHANGED');

      store.createEditorialMark(markInput(book, window, block.blockId, 20, 26, 'editor-note'));
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // V2-UX-MARK-006: an Editor Note is never part of what a Task reads. Every Task reads the manuscript
    // relations, so the note's words must stand in the mark relation and nowhere else in the store.
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const holders: string[] = [];
      const tables = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((row) => row.name);
      for (const table of tables) {
        const columns = (database.prepare(`PRAGMA table_xinfo("${table}")`).all() as { name: string; type: string; hidden: number }[])
          .filter((column) => column.hidden === 0 && (column.type === 'TEXT' || column.type === ''));
        for (const column of columns) {
          const hit = database.prepare(`SELECT 1 FROM "${table}" WHERE instr("${column.name}", ?) > 0 LIMIT 1`).get(NOTE_SENTINEL);
          if (hit !== undefined) holders.push(`${table}.${column.name}`);
        }
      }
      expect(holders).toEqual(['editorial_marks.body']);
    } finally {
      database.close();
    }
  }, 300_000);

  it('places chapters, open marks and nothing else on the position rail', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const empty = store.getManuscriptRail(book.manuscriptId, book.branchId);
      expect(empty.marks).toEqual([]);
      expect(empty.uncovered).toBeNull();
      expect(empty.chapters.every((chapter, index, all) => chapter.proportion >= 0 && chapter.proportion <= 1 && (index === 0 || chapter.proportion >= all[index - 1]!.proportion))).toBe(true);
      expect(empty.totalCharacters).toBe(window.position.totalCharacters);

      const paragraphs = window.blocks.filter((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 40);
      const [first, second] = paragraphs;
      store.createEditorialMark(markInput(book, window, first!.blockId, 2, 6, 'personal-highlight'));
      let current = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      store.createEditorialMark(markInput(book, current, first!.blockId, 8, 12, 'change-suggestion'));
      current = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const annotation = store.createEditorialMark(markInput(book, current, second!.blockId, 3, 9, 'annotation')).markId;
      current = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      store.createEditorialMark(markInput(book, current, second!.blockId, 12, 16, 'editor-note'));

      const rail = store.getManuscriptRail(book.manuscriptId, book.branchId);
      // A highlight carries no meaning and draws nothing on the rail; the three system kinds stand in reading order.
      expect(rail.marks.map((mark) => mark.kind)).toEqual(['change-suggestion', 'annotation', 'editor-note']);
      expect(rail.marks.map((mark) => mark.blockId)).toEqual([first!.blockId, second!.blockId, second!.blockId]);
      expect(rail.marks.every((mark, index, all) => index === 0 || mark.proportion >= all[index - 1]!.proportion)).toBe(true);
      expect(rail.marksTruncated).toBe(false);
      // Each mark is counted by the chapter it stands in: the last one that starts at or before it. The
      // composed excerpt may open before its first heading, so the expectation is read from the places.
      const counted = rail.chapters.reduce((sum, chapter) => sum + chapter.suggestions + chapter.annotations + chapter.notes, 0);
      const firstChapter = rail.chapters[0]?.proportion;
      expect(counted).toBe(firstChapter === undefined ? 0 : rail.marks.filter((mark) => mark.proportion >= firstChapter).length);
      // A comment that is dealt with asks for nothing on the rail any more.
      store.updateEditorialMark(change(book, current, annotation, 'set-status', { status: 'resolved' }));
      expect(store.getManuscriptRail(book.manuscriptId, book.branchId).marks.map((mark) => mark.kind)).toEqual(['change-suggestion', 'editor-note']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('migrates a revision-21 store forward, adding the mark and effect relations and keeping what it held', async () => {
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Imported;
    try {
      book = await importBook(first);
      const window = first.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      first.recordManuscriptEntryPosition(book.manuscriptId, book.branchId, window.blocks[2]!.blockId, 1);
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const downgrade = new DatabaseSync(databasePath);
    try {
      // A revision-21 store carried the three kind-coupled analysis relations as revision 20 left them;
      // revision 24 (Issue #417) validates exactly that before it rebuilds them.
      downgradeKindCoupledRelationsToRevision23(downgrade);
      downgrade.exec(`BEGIN IMMEDIATE;
        ${MARK_RELATIONS.map((relation) => `DROP TABLE ${relation};`).join('\n')}
        PRAGMA user_version = ${MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION};
        COMMIT;`);
      expect(downgrade.prepare("SELECT count(*) total FROM sqlite_schema WHERE name LIKE '%no_update' AND tbl_name IN ('proposal_change_items', 'proposal_item_decisions')").get())
        .toEqual({ total: 0 });
    } finally {
      downgrade.close();
    }

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(migrated.readManuscriptEntryPosition(book.manuscriptId, book.branchId)?.grapheme).toBe(1);
      const window = migrated.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      expect(window.marks).toEqual([]);
      const block = markableBlock(window);
      expect(migrated.createEditorialMark(markInput(book, window, block.blockId, 1, 5, 'annotation')).marks).toHaveLength(1);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION);
      expect(after.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      after.close();
    }
  }, 300_000);
});
