import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { JournalStructuralEdit, ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for the structural Edit Journal commands of Issue #1175 (ADR 0096 §1): Enter's split and
// Backspace's merge as one journal entry each, with lineage, mark following (ED-044), 撤销/重做 as one step, and the Apply
// that 撤销 steps over. The manuscript is composed from the admitted SampleBook; text is compared by length and identity only.

let roots: ServiceTestRoots;
let store: EditorialStore;
let book: { manuscriptId: string; branchId: string };

beforeEach(async () => {
  roots = await createServiceTestRoots();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const path = join(roots.inputRoot, 'structure.docx');
  await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '结构组稿' });
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  book = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };
});

afterEach(async () => {
  store.markCleanShutdown();
  store.close();
  await roots.dispose();
});

const window = (): ManuscriptWindowProjection => store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
const paragraphs = (): ManuscriptWindowProjection['blocks'] => window().blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 30);
/** Two paragraphs side by side, the second one the first's next block. */
const adjacentParagraphs = (): [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]] => {
  const blocks = window().blocks;
  const index = blocks.findIndex((block, at) => block.kind === 'paragraph' && blocks[at + 1]?.kind === 'paragraph' &&
    graphemesOf(block.text).length >= 10 && graphemesOf(blocks[at + 1]!.text).length >= 20);
  expect(index).toBeGreaterThanOrEqual(0);
  return [blocks[index]!, blocks[index + 1]!];
};
const newBlockId = (): string => `blk_${randomBytes(12).toString('hex')}`;
const code = (operation: () => unknown): string => {
  try { operation(); } catch (error) { if (error instanceof StoreError) return error.code; throw error; }
  return 'no-error';
};

function journal(blockId: string, at: number, structure?: JournalStructuralEdit, insertText = '', to = at): ManuscriptWindowProjection {
  const now = window();
  return store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((block) => block.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: at, toGrapheme: to, insertText, ...(structure === undefined ? {} : { structure }),
  }).window;
}

const merge = (into: string, merged: string): ManuscriptWindowProjection => {
  const now = window();
  const intoBlock = now.blocks.find((block) => block.blockId === into)!;
  return journal(into, graphemesOf(intoBlock.text).length, { kind: 'merge', mergedBlockId: merged, mergedBlockDigest: now.blocks.find((block) => block.blockId === merged)!.digest });
};
const undo = (): void => { store.undoManuscript(book.manuscriptId, book.branchId, window().workingDigest); };
const redo = (): void => { store.redoManuscript(book.manuscriptId, book.branchId, window().workingDigest); };

function mark(blockId: string, from: number, to: number, kind: 'annotation' | 'change-suggestion', proposedText = '〔建议〕'): string {
  const now = window();
  const block = now.blocks.find((candidate) => candidate.blockId === blockId)!;
  return store.createEditorialMark({
    ...book, windowStartBlockId: now.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: now.revisionId,
    expectedJournalSequence: now.journalSequence, blockId, baseBlockDigest: block.digest, fromGrapheme: from, toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''), kind, highlightColor: null,
    body: kind === 'annotation' ? '〔批注〕' : '', proposedText: kind === 'change-suggestion' ? proposedText : null, rationale: null,
  }).markId;
}

const markAt = (markId: string): { blockId: string; fromGrapheme: number; toGrapheme: number; anchorState: string } => {
  const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
  return { blockId: card.blockId, fromGrapheme: card.fromGrapheme, toGrapheme: card.toGrapheme, anchorState: card.anchorState };
};

describe('Enter and Backspace as structural journal commands', () => {
  it('splits a paragraph at the caret as one journal entry, and 撤销/重做 take it back and forth as one step each', () => {
    const before = window();
    const target = paragraphs()[0]!;
    const length = graphemesOf(target.text).length;
    const created = newBlockId();
    const split = journal(target.blockId, 10, { kind: 'split', newBlockId: created });
    const at = split.blocks.findIndex((block) => block.blockId === target.blockId);
    expect(split.journalSequence).toBe(before.journalSequence + 1);
    expect(split.blocks[at + 1]).toMatchObject({ blockId: created, kind: 'paragraph', position: target.position + 1 });
    expect([graphemesOf(split.blocks[at]!.text).length, graphemesOf(split.blocks[at + 1]!.text).length]).toEqual([10, length - 10]);
    expect(split.blocks[at]!.text + split.blocks[at + 1]!.text === target.text).toBe(true);
    expect(split.position.totalCharacters).toBe(before.position.totalCharacters);
    undo();
    expect(window().blocks.map((block) => block.blockId)).toEqual(before.blocks.map((block) => block.blockId));
    expect(window().blocks.find((block) => block.blockId === target.blockId)!.digest).toBe(target.digest);
    redo();
    expect(window().blocks.map((block) => block.blockId)).toEqual(split.blocks.map((block) => block.blockId));
    expect(window().journalSequence).toBe(before.journalSequence + 3);
  });

  it('merges a paragraph into the one before it, keeps both identities through 撤销, and refuses a gap or a used identity', () => {
    const [first, second] = adjacentParagraphs();
    const third = window().blocks.find((block) => block.kind === 'paragraph' && block.position > second.position + 1)!;
    const merged = merge(first.blockId, second.blockId);
    expect(merged.blocks.some((block) => block.blockId === second.blockId)).toBe(false);
    expect(merged.blocks.find((block) => block.blockId === first.blockId)!.text === first.text + second.text).toBe(true);
    expect(code(() => merge(first.blockId, third.blockId))).toBe('STRUCTURE_INVALID');
    expect(code(() => journal(first.blockId, 1, { kind: 'split', newBlockId: third.blockId }))).toBe('STRUCTURE_INVALID');
    undo();
    expect(window().blocks.find((block) => block.blockId === second.blockId)!.digest).toBe(second.digest);
    expect(window().blocks.find((block) => block.blockId === first.blockId)!.digest).toBe(first.digest);
  });

  it('follows every mark to its words with its state, drifts what the caret cuts, and 撤销 puts every one back (ED-044, ADR 0105 §1–§2)', () => {
    const target = paragraphs()[0]!;
    const head = mark(target.blockId, 2, 6, 'annotation');
    const cut = mark(target.blockId, 8, 14, 'annotation');
    const tail = mark(target.blockId, 16, 20, 'annotation');
    const suggestion = mark(target.blockId, 22, 26, 'change-suggestion');
    const created = newBlockId();
    journal(target.blockId, 12, { kind: 'split', newBlockId: created });
    expect(markAt(head)).toEqual({ blockId: target.blockId, fromGrapheme: 2, toGrapheme: 6, anchorState: 'exact' });
    expect(markAt(cut)).toMatchObject({ blockId: target.blockId, anchorState: 'drifted' });
    expect(markAt(tail)).toEqual({ blockId: created, fromGrapheme: 4, toGrapheme: 8, anchorState: 'exact' });
    expect(markAt(suggestion)).toEqual({ blockId: created, fromGrapheme: 10, toGrapheme: 14, anchorState: 'exact' });
    undo();
    expect(markAt(tail)).toEqual({ blockId: target.blockId, fromGrapheme: 16, toGrapheme: 20, anchorState: 'exact' });
    expect(markAt(suggestion)).toEqual({ blockId: target.blockId, fromGrapheme: 22, toGrapheme: 26, anchorState: 'exact' });
    // The split's step recorded the cut mark's anchor; the paragraph is byte-identical again, so it stands on its words (#1654).
    expect(markAt(cut)).toEqual({ blockId: target.blockId, fromGrapheme: 8, toGrapheme: 14, anchorState: 'exact' });
  });

  it('carries the absorbed paragraph’s marks into the merged one with their state', () => {
    const [first, second] = adjacentParagraphs();
    const offset = graphemesOf(first.text).length;
    const note = mark(second.blockId, 3, 9, 'annotation');
    const suggestion = mark(second.blockId, 12, 16, 'change-suggestion');
    merge(first.blockId, second.blockId);
    expect(markAt(note)).toEqual({ blockId: first.blockId, fromGrapheme: offset + 3, toGrapheme: offset + 9, anchorState: 'exact' });
    expect(markAt(suggestion)).toEqual({ blockId: first.blockId, fromGrapheme: offset + 12, toGrapheme: offset + 16, anchorState: 'exact' });
    undo();
    expect(markAt(note)).toEqual({ blockId: second.blockId, fromGrapheme: 3, toGrapheme: 9, anchorState: 'exact' });
    expect(markAt(suggestion)).toEqual({ blockId: second.blockId, fromGrapheme: 12, toGrapheme: 16, anchorState: 'exact' });
  });
});

describe('撤销本次修改 across 分段 and 合段 (ADR 0105 §2)', () => {
  const binding = () => ({ ...book, windowStartBlockId: window().blocks[0]!.blockId });
  const accepted = (blockId: string, from: number, to: number, proposed = '〔建议〕'): string => {
    const markId = mark(blockId, from, to, 'change-suggestion', proposed);
    store.applyChangeSuggestion({ ...binding(), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
    return markId;
  };
  const reverse = (markId: string): string => code(() => store.reverseAppliedChangeSuggestion({ ...binding(), markId, clientEffectId: randomUUID() }));
  const textOf = (blockId: string): string => window().blocks.find((block) => block.blockId === blockId)!.text;
  const status = (markId: string): string => store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).status;

  it('keeps a suggestion moved whole by 分段 exact, reverses it in the new paragraph, and again after joining back', () => {
    const target = paragraphs()[0]!;
    const once = accepted(target.blockId, 20, 24);
    const created = newBlockId();
    journal(target.blockId, 10, { kind: 'split', newBlockId: created });
    expect(markAt(once)).toEqual({ blockId: created, fromGrapheme: 10, toGrapheme: 14, anchorState: 'exact' });
    expect(reverse(once)).toBe('no-error');
    expect(textOf(target.blockId) + textOf(created) === target.text).toBe(true);
    expect(status(once)).toBe('open');
    const again = accepted(created, 12, 16);
    merge(target.blockId, created);
    expect(markAt(again)).toMatchObject({ blockId: target.blockId, fromGrapheme: 22, anchorState: 'exact' });
    expect(reverse(again)).toBe('no-error');
    expect(textOf(target.blockId) === target.text).toBe(true);
  });

  it('keeps the absorbed paragraph’s suggestion exact through 合段 and a later 分段 elsewhere, and reverses it there', () => {
    const [first, second] = adjacentParagraphs();
    const offset = graphemesOf(first.text).length;
    const joined = accepted(second.blockId, 12, 16);
    merge(first.blockId, second.blockId);
    expect(markAt(joined)).toEqual({ blockId: first.blockId, fromGrapheme: offset + 12, toGrapheme: offset + 16, anchorState: 'exact' });
    const created = newBlockId();
    journal(first.blockId, offset + 2, { kind: 'split', newBlockId: created });
    expect(markAt(joined)).toEqual({ blockId: created, fromGrapheme: 10, toGrapheme: 14, anchorState: 'exact' });
    expect(reverse(joined)).toBe('no-error');
    expect(textOf(first.blockId) + textOf(created) === first.text + second.text).toBe(true);
  });

  it('drifts the accepted suggestion the caret cuts and the point at the caret, and reverses the one moved whole', () => {
    const target = paragraphs()[0]!;
    const cut = accepted(target.blockId, 4, 8);
    const whole = accepted(target.blockId, 16, 20);
    const point = accepted(target.blockId, 26, 28, '');
    const created = newBlockId();
    journal(target.blockId, 6, { kind: 'split', newBlockId: created });
    expect(markAt(cut)).toMatchObject({ blockId: target.blockId, anchorState: 'drifted' });
    expect(markAt(whole)).toEqual({ blockId: created, fromGrapheme: 10, toGrapheme: 14, anchorState: 'exact' });
    expect(reverse(cut)).toBe('APPLY_TARGET_DRIFTED');
    expect(reverse(whole)).toBe('no-error');
    const at = markAt(point).fromGrapheme;
    journal(created, at, { kind: 'split', newBlockId: newBlockId() });
    expect(markAt(point)).toEqual({ blockId: created, fromGrapheme: at, toGrapheme: at, anchorState: 'drifted' });
    const sequence = window().journalSequence;
    expect(reverse(point)).toBe('APPLY_TARGET_DRIFTED');
    expect(window().journalSequence).toBe(sequence);
  });

  it('reverses a suggestion moved by 分段 after a restart', async () => {
    const target = paragraphs()[0]!;
    const moved = accepted(target.blockId, 20, 24);
    const created = newBlockId();
    journal(target.blockId, 10, { kind: 'split', newBlockId: created });
    store.markCleanShutdown();
    store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(reverse(moved)).toBe('no-error');
    expect(textOf(target.blockId) + textOf(created) === target.text).toBe(true);
  });

  it('keeps an applied deletion at a caret at the very end or start of a paragraph exact, and reverses it', () => {
    const [first, second] = adjacentParagraphs();
    const length = graphemesOf(first.text).length;
    const atEnd = accepted(first.blockId, length - 2, length, '');
    const atStart = accepted(second.blockId, 0, 2, '');
    const afterFirst = newBlockId();
    journal(first.blockId, length - 2, { kind: 'split', newBlockId: afterFirst });
    expect(markAt(atEnd)).toEqual({ blockId: first.blockId, fromGrapheme: length - 2, toGrapheme: length - 2, anchorState: 'exact' });
    const beforeSecond = newBlockId();
    journal(second.blockId, 0, { kind: 'split', newBlockId: beforeSecond });
    expect(markAt(atStart)).toEqual({ blockId: beforeSecond, fromGrapheme: 0, toGrapheme: 0, anchorState: 'exact' });
    expect([reverse(atEnd), reverse(atStart)]).toEqual(['no-error', 'no-error']);
    expect(textOf(first.blockId) + textOf(afterFirst) === first.text && textOf(beforeSecond) === second.text).toBe(true);
  });

  it('reverses a moved suggestion whose split and merge groups were superseded by a recovery restore', async () => {
    const [first, second] = adjacentParagraphs();
    const moved = accepted(second.blockId, 12, 16);
    merge(first.blockId, second.blockId);
    const created = newBlockId();
    journal(first.blockId, graphemesOf(first.text).length + 2, { kind: 'split', newBlockId: created });
    store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const startup = await store.getStartup();
    if (startup.state !== 'manuscript-recovery') throw new Error('expected journal recovery');
    await store.restoreRecovery(randomUUID(), startup.recovery.attentionId, startup.recovery.attentionVersion, { kind: 'journal' });
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    expect(db.prepare("SELECT DISTINCT status FROM manuscript_command_groups WHERE branch_id = ? AND kind IN ('split', 'merge')").all(book.branchId))
      .toEqual([{ status: 'superseded' }]);
    db.close();
    expect(markAt(moved)).toMatchObject({ blockId: created, anchorState: 'exact' });
    expect(reverse(moved)).toBe('no-error');
    expect(textOf(first.blockId) + textOf(created) === first.text + second.text).toBe(true);
  });

  it('refuses, writing nothing, a point a 0.7.3 撤销 of a join left exact on the paragraph that had absorbed it', async () => {
    const [first, second] = adjacentParagraphs();
    const length = graphemesOf(first.text).length;
    const point = accepted(second.blockId, 0, 2, '');
    merge(first.blockId, second.blockId);
    undo();
    // 0.7.3's replay left a point at the caret of the undone join exact on the first paragraph; write that state as it left it.
    store.markCleanShutdown();
    store.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    db.prepare("UPDATE editorial_marks SET block_id = ?, from_grapheme = ?, to_grapheme = ?, anchor_state = 'exact' WHERE mark_id = ?").run(first.blockId, length, length, point);
    db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const before = window();
    // The card and the guard agree (Issue #1654, loss 4): the card reads the point as drifted, offering no 撤销本次修改, and the
    // guard refuses both of its callers — the card's reversal and the accepting step's undo, which is set aside instead.
    expect(markAt(point).anchorState).toBe('drifted');
    expect(reverse(point)).toBe('APPLY_INVALID');
    expect(store.undoManuscript(book.manuscriptId, book.branchId, window().workingDigest).blocked).toBe(true);
    expect(window().journalSequence).toBe(before.journalSequence);
    expect(textOf(first.blockId) === first.text && textOf(second.blockId) === before.blocks.find((block) => block.blockId === second.blockId)!.text).toBe(true);
  });

  it.each(['Enter at the seam', '撤销 of the join'] as const)('refuses two applied replacements touching across a joined seam, and reverses them after %s', (way) => {
    const [first, second] = adjacentParagraphs();
    const length = graphemesOf(first.text).length;
    const end = mark(first.blockId, length - 4, length, 'change-suggestion');
    const start = mark(second.blockId, 0, 4, 'change-suggestion');
    store.applyChangeSuggestionBatch({ ...binding(), markIds: [end, start], clientEffectId: randomUUID() });
    merge(first.blockId, second.blockId);
    const sequence = window().journalSequence;
    expect(store.prepareReverseApply({ ...book, markId: start }).ready).toBe(false);
    expect(reverse(start)).toBe('APPLY_TARGET_DRIFTED');
    expect(window().journalSequence).toBe(sequence);
    const created = way === 'Enter at the seam' ? newBlockId() : second.blockId;
    if (way === 'Enter at the seam') journal(first.blockId, length, { kind: 'split', newBlockId: created }); else undo();
    expect([markAt(end).anchorState, markAt(start)]).toEqual(['exact', { blockId: created, fromGrapheme: 0, toGrapheme: 4, anchorState: 'exact' }]);
    expect(reverse(start)).toBe('no-error');
    expect(textOf(first.blockId) === first.text && textOf(created) === second.text).toBe(true);
  });

  it('refuses, writing nothing, a reversal whose mark stands in a paragraph its words did not flow to', async () => {
    const [target, other] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    const applied = accepted(target.blockId, 4, 8);
    journal(other.blockId, 0, undefined, '〔建议〕');
    // The words the Apply wrote also stand at the start of another paragraph; put the mark there, as no command could.
    store.markCleanShutdown();
    store.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    db.prepare('UPDATE editorial_marks SET block_id = ?, from_grapheme = 0, to_grapheme = 4 WHERE mark_id = ?').run(other.blockId, applied);
    db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const before = window();
    expect(reverse(applied)).toBe('APPLY_INVALID');
    expect(window().journalSequence).toBe(before.journalSequence);
  });

  it.each([['a combining mark', '́'], ['U+200D', '‍'], ['a variation selector', '️']])(
    'drifts the absorbed paragraph’s marks when it starts with %s that fuses across the join, and refuses their reversal', (_name, lead) => {
      const [first, second] = adjacentParagraphs();
      journal(second.blockId, 0, undefined, lead);
      const point = accepted(second.blockId, 3, 5, '');
      merge(first.blockId, second.blockId);
      expect(markAt(point).anchorState).toBe('drifted');
      const sequence = window().journalSequence;
      expect(reverse(point)).toBe('APPLY_TARGET_DRIFTED');
      expect(window().journalSequence).toBe(sequence);
    });

  it('drifts the 就地编辑修订 a split moves, so an accepted one is never turned back to pending by reverting the other', () => {
    const target = paragraphs()[0]!;
    const sessionId = randomUUID();
    const revise = (from: number, to: number, insertText: string): ManuscriptWindowProjection => {
      const now = window();
      return store.flushJournalEdit({
        clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId: target.blockId, windowStartBlockId: now.blocks[0]!.blockId,
        baseBlockDigest: now.blocks.find((block) => block.blockId === target.blockId)!.digest, expectedJournalSequence: now.journalSequence,
        fromGrapheme: from, toGrapheme: to, insertText, editorRevision: { sessionId, autoApply: false },
      }).window;
    };
    revise(10, 12, '〔甲〕');
    const [kept, reverted] = revise(22, 24, '〔乙〕').marks.filter((m) => m.inlineRevision).sort((a, b) => a.fromGrapheme - b.fromGrapheme).map((m) => m.markId) as [string, string];
    const decide = (markId: string, action: 'apply-inline-revision' | 'revert-inline-revision'): string => code(() => store.updateEditorialMark({ ...binding(),
      markId, action, body: null, highlightColor: null, status: null, targetKind: null, proposedText: null, rationale: null }));
    expect(decide(kept, 'apply-inline-revision')).toBe('no-error');
    journal(target.blockId, 5, { kind: 'split', newBlockId: newBlockId() });
    expect([markAt(kept).anchorState, markAt(reverted).anchorState]).toEqual(['drifted', 'drifted']);
    expect(decide(reverted, 'revert-inline-revision')).toBe('MARK_BINDING_CHANGED');
    expect(status(kept)).toBe('applied');
  });

  it('refuses, writing nothing, the touching reversal of two applied deletions in two paragraphs joined into one; after 撤销 of the join both points stand again', () => {
    const [first, second] = adjacentParagraphs();
    const length = graphemesOf(first.text).length;
    // The original ranges meet by number — B's ends where A's starts — so only their paragraphs tell their order apart.
    const end = mark(first.blockId, 2, length, 'change-suggestion', '');
    const start = mark(second.blockId, 0, 2, 'change-suggestion', '');
    store.applyChangeSuggestionBatch({ ...binding(), markIds: [end, start], clientEffectId: randomUUID() });
    merge(first.blockId, second.blockId);
    expect([markAt(end), markAt(start)].map((at) => [at.blockId, at.fromGrapheme, at.toGrapheme, at.anchorState]))
      .toEqual([[first.blockId, 2, 2, 'exact'], [first.blockId, 2, 2, 'exact']]);
    const before = window();
    expect(store.prepareReverseApply({ ...book, markId: end }).ready).toBe(false);
    expect(reverse(end)).toBe('APPLY_TARGET_DRIFTED');
    expect(reverse(start)).toBe('APPLY_TARGET_DRIFTED');
    expect(window().journalSequence).toBe(before.journalSequence);
    expect(textOf(first.blockId) === before.blocks.find((block) => block.blockId === first.blockId)!.text).toBe(true);
    // The undone join is a split at the caret where both points sit; the join's step recorded their anchors, and the text is
    // byte-identical again, so each point stands where it stood before the join (Issue #1654, loss 3) and the batch reverses.
    undo();
    expect([markAt(end), markAt(start)].map((at) => [at.blockId, at.fromGrapheme, at.toGrapheme, at.anchorState]))
      .toEqual([[first.blockId, 2, 2, 'exact'], [second.blockId, 0, 0, 'exact']]);
    expect(reverse(end)).toBe('no-error');
    expect(textOf(first.blockId) === first.text && textOf(second.blockId) === second.text).toBe(true);
  });
});

describe('undo continuity across an Apply', () => {
  const apply = (blockId: string, from: number, to: number): void => {
    const markId = mark(blockId, from, to, 'change-suggestion');
    store.applyChangeSuggestion({ ...book, windowStartBlockId: window().blocks[0]!.blockId, markId, clientEffectId: randomUUID(),
      interaction: 'accept-and-apply', editedText: null, reason: null });
  };

  it('takes back the Apply first, then the edit typed before it, and redoes them in order (ADR 0105 §1)', () => {
    const [typed, applied] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    journal(typed.blockId, 0, undefined, '〔先改〕');
    apply(applied.blockId, 4, 8);
    const appliedText = window().blocks.find((block) => block.blockId === applied.blockId)!.text;
    undo();
    expect(window().blocks.find((block) => block.blockId === applied.blockId)!.digest).toBe(applied.digest);
    expect(window().blocks.find((block) => block.blockId === typed.blockId)!.text.startsWith('〔先改〕')).toBe(true);
    undo();
    expect(window().blocks.find((block) => block.blockId === typed.blockId)!.digest).toBe(typed.digest);
    redo();
    redo();
    expect(window().blocks.find((block) => block.blockId === applied.blockId)!.text === appliedText).toBe(true);
    undo();
    undo();
    expect(code(undo)).toBe('NOTHING_TO_UNDO');
  });

  it('undoes an edit whose paragraph a later Apply changed once the Apply is taken back: HISTORY_AFTER_APPLY is not reached', () => {
    const target = paragraphs()[0]!;
    journal(target.blockId, 0, undefined, '〔先改〕');
    apply(target.blockId, 10, 14);
    expect(code(undo)).toBe('no-error');
    expect(code(undo)).toBe('no-error');
    expect(window().blocks.find((block) => block.blockId === target.blockId)!.digest).toBe(target.digest);
  });
});

describe('recovery over a structural edit', () => {
  it('changes paragraph styles and creates body text after a heading, with undo/redo and journal recovery', async () => {
    const target = paragraphs()[0]!;
    journal(target.blockId, 0, undefined, '〔编辑〕');
    const text = window().blocks.find((block) => block.blockId === target.blockId)!.text;
    journal(target.blockId, 0, { kind: 'style', blockKind: 'heading', level: 2 });
    expect(store.getOutline(book.manuscriptId, book.branchId, null).entries.some((entry) => entry.blockId === target.blockId && entry.level === 2)).toBe(true);
    const created = newBlockId();
    journal(target.blockId, graphemesOf(text).length, { kind: 'split', newBlockId: created });
    expect(window().blocks.find((block) => block.blockId === created)).toMatchObject({ kind: 'paragraph', text: '' });
    undo();
    undo();
    expect(window().blocks.find((block) => block.blockId === target.blockId)).toMatchObject({ kind: 'paragraph', text });
    expect(store.getOutline(book.manuscriptId, book.branchId, null).entries.some((entry) => entry.blockId === target.blockId)).toBe(false);
    redo();
    redo();
    const expected = window().blocks.map((block) => [block.blockId, block.kind, block.digest]);
    store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const startup = await store.getStartup();
    if (startup.state !== 'manuscript-recovery') throw new Error('expected journal recovery');
    const restored = await store.restoreRecovery(randomUUID(), startup.recovery.attentionId, startup.recovery.attentionVersion, { kind: 'journal' });
    expect(restored.window.blocks.map((block) => [block.blockId, block.kind, block.digest])).toEqual(expected);
  });

  it('replays a split and a merge from the checkpoint by identity and restores the journal state after an unclean close', async () => {
    const [first, second] = adjacentParagraphs();
    const created = newBlockId();
    journal(first.blockId, 5, { kind: 'split', newBlockId: created });
    merge(created, second.blockId);
    const expected = window().blocks.map((block) => [block.blockId, block.digest]);
    store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const startup = await store.getStartup();
    expect(startup.state).toBe('manuscript-recovery');
    if (startup.state !== 'manuscript-recovery') throw new Error('unreachable');
    expect(startup.recovery.journal).toMatchObject({ kind: 'journal', journalSequence: 2 });
    const restored = await store.restoreRecovery(randomUUID(), startup.recovery.attentionId, startup.recovery.attentionVersion, { kind: 'journal' });
    expect(restored.window.blocks.map((block) => [block.blockId, block.digest])).toEqual(expected);
  });
});
