import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
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

function mark(blockId: string, from: number, to: number, kind: 'annotation' | 'change-suggestion'): string {
  const now = window();
  const block = now.blocks.find((candidate) => candidate.blockId === blockId)!;
  return store.createEditorialMark({
    ...book, windowStartBlockId: now.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: now.revisionId,
    expectedJournalSequence: now.journalSequence, blockId, baseBlockDigest: block.digest, fromGrapheme: from, toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''), kind, highlightColor: null,
    body: kind === 'annotation' ? '〔批注〕' : '', proposedText: kind === 'change-suggestion' ? '〔建议〕' : null, rationale: null,
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

  it('follows 批注 to their words, drifts what the caret cuts and every moved 修改建议, and 撤销 moves them back (ED-044)', () => {
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
    expect(markAt(suggestion)).toEqual({ blockId: created, fromGrapheme: 10, toGrapheme: 14, anchorState: 'drifted' });
    undo();
    expect(markAt(tail)).toEqual({ blockId: target.blockId, fromGrapheme: 16, toGrapheme: 20, anchorState: 'exact' });
    expect(markAt(suggestion)).toMatchObject({ blockId: target.blockId, fromGrapheme: 22, anchorState: 'drifted' });
  });

  it('carries the absorbed paragraph’s 批注 into the merged one and drifts its 修改建议', () => {
    const [first, second] = adjacentParagraphs();
    const offset = graphemesOf(first.text).length;
    const note = mark(second.blockId, 3, 9, 'annotation');
    const suggestion = mark(second.blockId, 12, 16, 'change-suggestion');
    merge(first.blockId, second.blockId);
    expect(markAt(note)).toEqual({ blockId: first.blockId, fromGrapheme: offset + 3, toGrapheme: offset + 9, anchorState: 'exact' });
    expect(markAt(suggestion)).toMatchObject({ blockId: first.blockId, fromGrapheme: offset + 12, anchorState: 'drifted' });
    undo();
    expect(markAt(note)).toEqual({ blockId: second.blockId, fromGrapheme: 3, toGrapheme: 9, anchorState: 'exact' });
  });
});

describe('undo continuity across an Apply', () => {
  const apply = (blockId: string, from: number, to: number): void => {
    const markId = mark(blockId, from, to, 'change-suggestion');
    store.applyChangeSuggestion({ ...book, windowStartBlockId: window().blocks[0]!.blockId, markId, clientEffectId: randomUUID(),
      interaction: 'accept-and-apply', editedText: null, reason: null });
  };

  it('steps over the Apply to the edit typed before it, and redoes it, while the applied words stay', () => {
    const [typed, applied] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    journal(typed.blockId, 0, undefined, '〔先改〕');
    apply(applied.blockId, 4, 8);
    const appliedText = window().blocks.find((block) => block.blockId === applied.blockId)!.text;
    undo();
    expect(window().blocks.find((block) => block.blockId === typed.blockId)!.digest).toBe(typed.digest);
    expect(window().blocks.find((block) => block.blockId === applied.blockId)!.text === appliedText).toBe(true);
    redo();
    expect(window().blocks.find((block) => block.blockId === typed.blockId)!.text.startsWith('〔先改〕')).toBe(true);
    undo();
    expect(code(undo)).toBe('NOTHING_TO_UNDO');
  });

  it('refuses plainly to undo an edit whose paragraph a later Apply changed', () => {
    const target = paragraphs()[0]!;
    journal(target.blockId, 0, undefined, '〔先改〕');
    apply(target.blockId, 10, 14);
    expect(code(undo)).toBe('HISTORY_AFTER_APPLY');
    expect(window().blocks.find((block) => block.blockId === target.blockId)!.text.startsWith('〔先改〕')).toBe(true);
  });
});

describe('recovery over a structural edit', () => {
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
