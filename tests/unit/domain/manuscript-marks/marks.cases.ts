import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { graphemesOf } from '../../../../src/shared/mark-anchor.js';
import type { CreateEditorialMarkInput, EditorialMarkKind, ManuscriptWindowProjection, UpdateEditorialMarkInput } from '../../../../src/shared/protocol.js';
import { manuscriptMarksBook, type ManuscriptMarksBook } from '../../../support/domain/manuscript-marks.js';
import { imported, manuscript, marks, refusal, windowOf, type Imported } from '../../../support/domain/manuscript-marks-drive.js';

// Editorial Marks (Issue #407), moved from tests/service/editorial-marks.test.ts (Issue #1536): the same claims, driven
// through the real exported operations over a sample1 Book on `:memory:`. Restart, migration, legacy-author repair,
// whole-store scans and the synthetic many-chapter import stay in tests/service.

const NOTE_SENTINEL = '仅编辑可见的备注哨兵文本';

let book: ManuscriptMarksBook | undefined;
afterEach(() => { book?.db.close(); book = undefined; });

/** The first paragraph long enough to hold a mark with room on both sides. */
function markableBlock(window: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'][number] {
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 40);
  if (block === undefined) throw new Error('the sample1 window holds no paragraph of 40 graphemes');
  return block;
}

function markInput(at: Imported, window: ManuscriptWindowProjection, blockId: string, from: number, to: number, kind: EditorialMarkKind,
  extra: Partial<CreateEditorialMarkInput> = {}): CreateEditorialMarkInput {
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  return {
    ...at,
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

function change(at: Imported, window: ManuscriptWindowProjection, markId: string, action: UpdateEditorialMarkInput['action'],
  extra: Partial<UpdateEditorialMarkInput> = {}): UpdateEditorialMarkInput {
  return { ...at, windowStartBlockId: window.blocks[0]!.blockId, markId, action, body: null, highlightColor: null, status: null, targetKind: null,
    proposedText: null, rationale: null, ...extra };
}

function edit(on: ManuscriptMarksBook, window: ManuscriptWindowProjection, blockId: string, from: number, to: number, insertText: string): ManuscriptWindowProjection {
  const block = window.blocks.find((candidate) => candidate.blockId === blockId)!;
  return manuscript.flushJournalEdit(on.manuscriptHost, {
    clientEditId: randomUUID(), ...imported(on), baseRevisionId: window.revisionId, blockId, windowStartBlockId: window.blocks[0]!.blockId,
    baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence, fromGrapheme: from, toGrapheme: to, insertText,
  }).window;
}

describe('Editorial Marks on a manuscript', () => {
  it('refuses a mark that is not made on the text the editor saw', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost, at = imported(book);
    const window = windowOf(book);
    const block = markableBlock(window);
    const valid = markInput(at, window, block.blockId, 3, 8, 'annotation');
    expect(refusal(() => marks.createEditorialMark(h, { ...valid, selectedText: `${valid.selectedText}改` }))).toBe('MARK_ANCHOR_CHANGED');
    expect(refusal(() => marks.createEditorialMark(h, { ...valid, toGrapheme: 100_000 }))).toBe('MARK_RANGE_INVALID');
    expect(refusal(() => marks.createEditorialMark(h, { ...valid, body: '   ' }))).toBe('MARK_BODY_INVALID');
    expect(refusal(() => marks.createEditorialMark(h, { ...valid, highlightColor: 1 }))).toBe('MARK_INVALID');
    const suggestion = markInput(at, window, block.blockId, 3, 8, 'change-suggestion');
    expect(refusal(() => marks.createEditorialMark(h, { ...suggestion, proposedText: suggestion.selectedText }))).toBe('MARK_BODY_INVALID');
    // The journal moved on after the editor read the window: the mark is refused, not silently re-pinned.
    edit(book, window, block.blockId, 0, 0, '新');
    expect(refusal(() => marks.createEditorialMark(h, valid))).toBe('MARK_BINDING_CHANGED');
    expect(windowOf(book).marks).toEqual([]);
    // A repeated command with the same client identity answers with the mark it already made.
    const fresh = windowOf(book);
    const once = markInput(at, fresh, block.blockId, 3, 8, 'annotation');
    const made = marks.createEditorialMark(h, once);
    expect(marks.createEditorialMark(h, once).markId).toBe(made.markId);
    expect(windowOf(book).marks).toHaveLength(1);
  });

  it('follows every durable change of its block and discloses a drift instead of re-matching', async () => {
    book = await manuscriptMarksBook();
    const on = book, h = book.marksHost, at = imported(book);
    let window = windowOf(book);
    const block = markableBlock(window);
    const markId = marks.createEditorialMark(h, markInput(at, window, block.blockId, 10, 15, 'personal-highlight')).markId;
    const pinned = marks.getEditorialMarkCard(h, at.manuscriptId, at.branchId, markId).pinnedText;
    const range = (): [number, number, string] => {
      const mark = windowOf(on).marks.find((candidate) => candidate.markId === markId)!;
      return [mark.fromGrapheme, mark.toGrapheme, mark.anchorState];
    };
    const standsAtRange = (): boolean => {
      const now = windowOf(on);
      const [from, to] = range();
      return graphemesOf(now.blocks.find((candidate) => candidate.blockId === block.blockId)!.text).slice(from, to).join('') === pinned;
    };

    window = edit(book, window, block.blockId, 0, 0, '前置三字');
    expect(range()).toEqual([14, 19, 'exact']);
    expect(window.marks.find((mark) => mark.markId === markId)).toMatchObject({ fromGrapheme: 14, toGrapheme: 19 });
    window = edit(book, window, block.blockId, 30, 32, '');
    expect(range()).toEqual([14, 19, 'exact']);
    window = edit(book, window, block.blockId, 14, 14, '贴前');
    expect(range()).toEqual([16, 21, 'exact']);
    window = edit(book, window, block.blockId, 21, 21, '贴后');
    expect(range()).toEqual([16, 21, 'exact']);
    expect(standsAtRange()).toBe(true);

    // A change inside the marked text: the mark stays where it was made and says 原文已变.
    window = edit(book, window, block.blockId, 18, 19, '改动');
    expect(range()).toEqual([16, 22, 'drifted']);
    expect(marks.getEditorialMarkCard(h, at.manuscriptId, at.branchId, markId)).toMatchObject({ anchorState: 'drifted', pinnedText: pinned });
    expect(refusal(() => marks.updateEditorialMark(h, change(at, window, markId, 'convert', { targetKind: 'editor-note', body: '转成备注' })))).toBe('MARK_ANCHOR_CHANGED');

    // Undoing that change puts the pinned text back, and the mark is exact again on it.
    manuscript.undoManuscript(book.manuscriptHost, { manuscriptId: at.manuscriptId, branchId: at.branchId, expectedWorkingDigest: window.workingDigest });
    expect(range()).toEqual([16, 21, 'exact']);
    expect(standsAtRange()).toBe(true);
    const undone = windowOf(book);
    manuscript.redoManuscript(book.manuscriptHost, { manuscriptId: at.manuscriptId, branchId: at.branchId, expectedWorkingDigest: undone.workingDigest });
    expect(range()).toEqual([16, 22, 'drifted']);
  });

  it('keeps a mark exact between two occurrences a replacement rewrites around it', async () => {
    book = await manuscriptMarksBook();
    const m = book.manuscriptHost, at = imported(book);
    let window = windowOf(book);
    const block = markableBlock(window);
    // Plant one authored token on both sides of the text to be marked, so the replacement has two
    // occurrences in this block and the mark stands between them.
    window = edit(book, window, block.blockId, 4, 4, '〔替换靶〕');
    window = edit(book, window, block.blockId, 24, 24, '〔替换靶〕');
    const markId = marks.createEditorialMark(book.marksHost, markInput(at, window, block.blockId, 12, 18, 'annotation')).markId;
    const searchId = manuscript.createSearch(m, at.manuscriptId, at.branchId, '〔替换靶〕').searchId;
    while (!manuscript.advanceSearch(m, searchId).done) { /* bounded batches */ }
    const preview = manuscript.prepareReplacement(m, searchId, '〔换〕', []);
    while (!manuscript.advanceReplacementWork(m, preview.previewId).done) { /* preparing */ }
    expect(manuscript.freezeReplacement(m, preview.previewId, []).state).toBe('frozen');
    while (!manuscript.advanceReplacementWork(m, preview.previewId).done) { /* validating */ }
    expect(manuscript.commitReplacement(m, preview.previewId).committedCount).toBe(2);
    const mark = windowOf(book).marks.find((candidate) => candidate.markId === markId)!;
    // The first occurrence shrank by two graphemes in front of the mark; the second is behind it.
    expect([mark.fromGrapheme, mark.toGrapheme, mark.anchorState]).toEqual([10, 16, 'exact']);
  });

  it('converts along the allowed routes only, and a converted mark keeps its pin and its lineage', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost, at = imported(book);
    const window = windowOf(book);
    const block = markableBlock(window);
    const highlight = marks.createEditorialMark(h, markInput(at, window, block.blockId, 5, 11, 'personal-highlight'));
    expect(marks.updateEditorialMark(h, change(at, window, highlight.markId, 'recolor', { highlightColor: 3 })).marks[0]!.highlightColor).toBe(3);
    expect(refusal(() => marks.updateEditorialMark(h, change(at, window, highlight.markId, 'reply', { body: '回复' })))).toBe('MARK_ACTION_INVALID');

    const note = marks.updateEditorialMark(h, change(at, window, highlight.markId, 'convert', { targetKind: 'editor-note', body: NOTE_SENTINEL }));
    expect(note.markId).not.toBe(highlight.markId);
    expect(note.marks.map((mark) => mark.kind)).toEqual(['editor-note']);
    expect(note.card).toMatchObject({ kind: 'editor-note', body: NOTE_SENTINEL, pinnedText: highlight.card!.pinnedText, fromGrapheme: 5, toGrapheme: 11 });
    expect(note.card!.convertedFrom).toEqual({ markId: highlight.markId, kind: 'personal-highlight', sourceKind: 'editor' });
    expect(note.card!.pin).toEqual(highlight.card!.pin);
    expect(refusal(() => marks.getEditorialMarkCard(h, at.manuscriptId, at.branchId, highlight.markId))).toBe('MARK_NOT_FOUND');
    expect(refusal(() => marks.updateEditorialMark(h, change(at, window, note.markId, 'convert', { targetKind: 'personal-highlight' })))).toBe('MARK_ACTION_INVALID');
    expect(marks.updateEditorialMark(h, change(at, window, note.markId, 'edit-body', { body: '改过的备注' })).card!.body).toBe('改过的备注');

    const annotation = marks.updateEditorialMark(h, change(at, window, note.markId, 'convert', { targetKind: 'annotation' }));
    expect(annotation.card).toMatchObject({ kind: 'annotation', body: '改过的备注', exportDisposition: 'exported-by-default' });
    const replied = marks.updateEditorialMark(h, change(at, window, annotation.markId, 'reply', { body: '已与作者确认。' }));
    expect(replied.card!.replies.map((reply) => reply.body)).toEqual(['已与作者确认。']);
    expect(marks.updateEditorialMark(h, change(at, window, annotation.markId, 'set-status', { status: 'resolved' })).marks[0]!.status).toBe('resolved');
    expect(marks.updateEditorialMark(h, change(at, window, annotation.markId, 'set-status', { status: 'open' })).marks[0]!.status).toBe('open');

    const suggestion = marks.updateEditorialMark(h, change(at, window, annotation.markId, 'convert', { targetKind: 'change-suggestion', proposedText: '替换后的说法' }));
    // The comment that prompted it is the reason it carries unless the editor writes another.
    expect(suggestion.card!.suggestion).toMatchObject({ currentText: highlight.card!.pinnedText, proposedText: '替换后的说法', rationale: '改过的备注', decision: null });
    expect(refusal(() => marks.updateEditorialMark(h, change(at, window, suggestion.markId, 'remove')))).toBe('MARK_ACTION_INVALID');
    const back = marks.updateEditorialMark(h, change(at, window, suggestion.markId, 'convert', { targetKind: 'annotation' }));
    expect(back.card!.kind).toBe('annotation');
    expect(back.card!.body).toContain('替换后的说法');
    expect(marks.updateEditorialMark(h, change(at, window, back.markId, 'remove')).marks).toEqual([]);
    expect(windowOf(book).marks).toEqual([]);
  });

  it('records a Proposal Decision apart from the item and from the manuscript, and supersedes instead of rewriting', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost, at = imported(book);
    const window = windowOf(book);
    const block = markableBlock(window);
    const made = marks.createEditorialMark(h, markInput(at, window, block.blockId, 6, 12, 'change-suggestion'));
    const decide = (disposition: 'rejected' | 'accepted-with-edit' | 'withdrawn', editedText: string | null, reason: string | null) =>
      marks.recordChangeSuggestionDecision(h, { ...at, windowStartBlockId: window.blocks[0]!.blockId, markId: made.markId, clientDecisionId: randomUUID(), disposition, editedText, reason });

    expect(refusal(() => decide('withdrawn', null, null))).toBe('MARK_DECISION_INVALID');
    const rejected = decide('rejected', null, null);
    expect(rejected.marks[0]).toMatchObject({ status: 'resolved', disposition: 'rejected' });
    expect(rejected.card!.suggestion!.decision).toMatchObject({ disposition: 'rejected', editedText: null, reason: null, reasonSource: null });
    expect(refusal(() => decide('accepted-with-edit', '另一种说法', null))).toBe('MARK_DECISION_INVALID');

    // The optional reason chips follow a decision recorded without a reason, once.
    const decisionId = rejected.card!.suggestion!.decision!.decisionId;
    const reasoned = marks.recordProposalDecisionReason(h, { ...at, windowStartBlockId: window.blocks[0]!.blockId, markId: made.markId, decisionId, reason: '方向不合适', reasonSource: 'suggested' });
    expect(reasoned.card!.suggestion!.decision).toMatchObject({ reason: '方向不合适', reasonSource: 'suggested' });
    expect(refusal(() => marks.recordProposalDecisionReason(h, { ...at, windowStartBlockId: window.blocks[0]!.blockId, markId: made.markId, decisionId, reason: '再说一次', reasonSource: 'free-text' }))).toBe('MARK_DECISION_INVALID');

    const withdrawn = decide('withdrawn', null, null);
    expect(withdrawn.marks[0]).toMatchObject({ status: 'open', disposition: null });
    expect(withdrawn.card!.suggestion!.decision).toBeNull();

    expect(refusal(() => decide('accepted-with-edit', made.card!.pinnedText, null))).toBe('MARK_DECISION_INVALID');
    const accepted = decide('accepted-with-edit', '编辑改过的说法', '更贴近作者的语气');
    expect(accepted.marks[0]).toMatchObject({ status: 'open', disposition: 'accepted-with-edit' });
    expect(accepted.card!.suggestion!.decision).toMatchObject({ editedText: '编辑改过的说法', reason: '更贴近作者的语气', reasonSource: 'reason-field' });
    // Recording a decision changes no character of the manuscript: Apply is a separate step.
    const after = windowOf(book);
    expect(after.workingDigest).toBe(window.workingDigest);
    expect(after.journalSequence).toBe(window.journalSequence);
    expect(refusal(() => marks.updateEditorialMark(h, change(at, window, made.markId, 'convert', { targetKind: 'annotation' })))).toBe('MARK_ACTION_INVALID');

    expect(book.db.prepare('SELECT ordinal, disposition, supersedes_decision_id IS NULL first FROM proposal_item_decisions ORDER BY ordinal').all().map((row) => ({ ...row })))
      .toEqual([
        { ordinal: 1, disposition: 'rejected', first: 1 },
        { ordinal: 2, disposition: 'withdrawn', first: 0 },
        { ordinal: 3, disposition: 'accepted-with-edit', first: 0 },
      ]);
    // The production immutability triggers (compared whole with an opened store by the parity case).
    for (const relation of ['proposal_change_items', 'proposal_item_decisions', 'proposal_decision_reasons']) {
      expect(() => book!.db.exec(`UPDATE ${relation} SET rowid = rowid`)).toThrow(/EDITORIAL_MARK_LEDGER_IMMUTABLE/);
      expect(() => book!.db.exec(`DELETE FROM ${relation}`)).toThrow(/EDITORIAL_MARK_LEDGER_IMMUTABLE/);
    }
  });

  it('places chapters, open marks and nothing else on the position rail', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost, m = book.manuscriptHost, at = imported(book), on = book;
    const window = windowOf(book);
    const empty = manuscript.getManuscriptRail(m, at.manuscriptId, at.branchId);
    expect(empty.marks).toEqual([]);
    expect(empty.uncovered).toBeNull();
    expect(empty.chapters.every((chapter, index, all) => chapter.proportion >= 0 && chapter.proportion <= 1 && (index === 0 || chapter.proportion >= all[index - 1]!.proportion))).toBe(true);
    expect(empty.totalCharacters).toBe(window.position.totalCharacters);

    const paragraphs = window.blocks.filter((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 40);
    const [first, second] = paragraphs;
    marks.createEditorialMark(h, markInput(at, window, first!.blockId, 2, 6, 'personal-highlight'));
    let current = windowOf(on);
    marks.createEditorialMark(h, markInput(at, current, first!.blockId, 8, 12, 'change-suggestion'));
    current = windowOf(on);
    const annotation = marks.createEditorialMark(h, markInput(at, current, second!.blockId, 3, 9, 'annotation')).markId;
    current = windowOf(on);
    marks.createEditorialMark(h, markInput(at, current, second!.blockId, 12, 16, 'editor-note'));

    const rail = manuscript.getManuscriptRail(m, at.manuscriptId, at.branchId);
    // A highlight carries no meaning and draws nothing on the rail; the three system kinds stand in reading order.
    expect(rail.marks.map((mark) => mark.kind)).toEqual(['change-suggestion', 'annotation', 'editor-note']);
    expect(rail.marks.map((mark) => mark.blockId)).toEqual([first!.blockId, second!.blockId, second!.blockId]);
    expect(rail.marks.every((mark, index, all) => index === 0 || mark.proportion >= all[index - 1]!.proportion)).toBe(true);
    expect(rail.marksTruncated).toBe(false);
    // Each mark is counted by the chapter it stands in: the last one that starts at or before it. The
    // excerpt may open before its first heading, so the expectation is read from the places.
    const counted = rail.chapters.reduce((sum, chapter) => sum + chapter.suggestions + chapter.annotations + chapter.notes, 0);
    const firstChapter = rail.chapters[0]?.proportion;
    expect(counted).toBe(firstChapter === undefined ? 0 : rail.marks.filter((mark) => mark.proportion >= firstChapter).length);
    // A comment that is dealt with asks for nothing on the rail any more.
    marks.updateEditorialMark(h, change(at, current, annotation, 'set-status', { status: 'resolved' }));
    expect(manuscript.getManuscriptRail(m, at.manuscriptId, at.branchId).marks.map((mark) => mark.kind)).toEqual(['change-suggestion', 'editor-note']);
  });
});

it('keeps disjoint inline spans separate and removes every card when text returns to baseline', async () => {
  book = await manuscriptMarksBook();
  const at = imported(book), m = book.manuscriptHost;
  const initial = windowOf(book);
  const block = markableBlock(initial), parts = graphemesOf(block.text), sessionId = randomUUID();
  const write = (window: ManuscriptWindowProjection, fromGrapheme: number, toGrapheme: number, insertText: string) => manuscript.flushJournalEdit(m, {
    ...at, clientEditId: randomUUID(), baseRevisionId: window.revisionId, blockId: block.blockId,
    windowStartBlockId: initial.blocks[0]!.blockId, baseBlockDigest: window.blocks.find((b) => b.blockId === block.blockId)!.digest,
    expectedJournalSequence: window.journalSequence, fromGrapheme, toGrapheme, insertText,
    editorRevision: { sessionId, autoApply: false },
  }).window;
  const changed = write(initial, 4, 12, '🟢' + parts.slice(6, 10).join('') + '🟣');
  expect(changed.marks.filter((mark) => mark.inlineRevision)).toHaveLength(2);
  const restored = write(changed, 4, 10, parts.slice(4, 12).join(''));
  expect(restored.marks.filter((mark) => mark.inlineRevision)).toHaveLength(0);
  expect(restored.blocks.find((b) => b.blockId === block.blockId)?.text === block.text).toBe(true);
  manuscript.undoManuscript(m, { manuscriptId: at.manuscriptId, branchId: at.branchId, expectedWorkingDigest: restored.workingDigest });
  expect(windowOf(book).marks.filter((mark) => mark.inlineRevision)).toHaveLength(2);
});
