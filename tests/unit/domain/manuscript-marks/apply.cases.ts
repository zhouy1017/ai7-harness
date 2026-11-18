import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { graphemesOf } from '../../../../src/shared/mark-anchor.js';
import { manuscriptMarksBook, type ManuscriptMarksBook } from '../../../support/domain/manuscript-marks.js';
import { binding, blockText, marks, paragraphs, refusal, suggest, typeInto, windowOf } from '../../../support/domain/manuscript-marks-drive.js';

// AI7 Apply on Change Suggestions (Issue #408), moved from tests/service/manuscript-apply.test.ts (Issue #1536): the same
// claims, driven through the real exported operations over a sample1 Book on `:memory:`. Restart, migration, ledger
// immutability and learning-signal cases stay in tests/service.

const PROPOSED = '〔建议〕';
const EDITED = '〔编辑改定〕';

let book: ManuscriptMarksBook | undefined;
afterEach(() => { book?.db.close(); book = undefined; });

describe('AI7 Apply on a Change Suggestion', () => {
  it('applies the editor\'s own wording, and a decision recorded before Apply existed', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost;
    const [first, second] = paragraphs(windowOf(book));
    const one = suggest(book, first!.blockId, 4, 9, PROPOSED);
    const edited = marks.applyChangeSuggestion(h, { ...binding(book), markId: one.markId, clientEffectId: randomUUID(), interaction: 'accept-edited-and-apply', editedText: EDITED, reason: '更贴近作者的语气' });
    expect(graphemesOf(blockText(book, first!.blockId)).slice(4, 4 + graphemesOf(EDITED).length).join('')).toBe(EDITED);
    expect(edited.card!.suggestion!.decision).toMatchObject({ disposition: 'accepted-with-edit', editedText: EDITED, reason: '更贴近作者的语气', reasonSource: 'reason-field' });
    expect(edited.application.interaction).toBe('accept-edited-and-apply');
    expect(refusal(() => marks.applyChangeSuggestion(h, { ...binding(book!), markId: suggest(book!, second!.blockId, 30, 34, PROPOSED).markId, clientEffectId: randomUUID(), interaction: 'accept-edited-and-apply', editedText: null, reason: null })))
      .toBe('APPLY_INVALID');

    const two = suggest(book, second!.blockId, 4, 9, PROPOSED);
    marks.recordChangeSuggestionDecision(h, { ...binding(book), markId: two.markId, clientDecisionId: randomUUID(), disposition: 'accepted-with-edit', editedText: EDITED, reason: null });
    expect(refusal(() => marks.applyChangeSuggestion(h, { ...binding(book!), markId: two.markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null })))
      .toBe('APPLY_INVALID');
    const recorded = marks.applyChangeSuggestion(h, { ...binding(book), markId: two.markId, clientEffectId: randomUUID(), interaction: 'apply-recorded-decision', editedText: null, reason: null });
    expect(recorded.card).toMatchObject({ status: 'applied', pinnedText: EDITED });
    expect(graphemesOf(blockText(book, second!.blockId)).slice(4, 4 + graphemesOf(EDITED).length).join('')).toBe(EDITED);
  });

  it('refuses a drifted target whole: no text, no decision, no approval, no receipt', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost;
    const block = paragraphs(windowOf(book))[0]!;
    const { markId } = suggest(book, block.blockId, 6, 12, PROPOSED);
    const edited = typeInto(book, block.blockId, 8, 9, '改');
    const clientEffectId = randomUUID();
    expect(refusal(() => marks.applyChangeSuggestion(h, { ...binding(book!), markId, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null })))
      .toBe('APPLY_TARGET_DRIFTED');
    expect(windowOf(book).workingDigest).toBe(edited.workingDigest);
    expect(marks.getManuscriptApplyOutcome(h, book.manuscriptId, book.branchId, clientEffectId).state).toBe('not-committed');
    expect(marks.getEditorialMarkCard(h, book.manuscriptId, book.branchId, markId)).toMatchObject({ status: 'open', anchorState: 'drifted' });
    expect(marks.getEditorialMarkCard(h, book.manuscriptId, book.branchId, markId).suggestion!.decision).toBeNull();
    expect(book.db.prepare('SELECT (SELECT count(*) FROM manuscript_effect_intents) intents, (SELECT count(*) FROM proposal_item_decisions) decisions').get())
      .toEqual({ intents: 0, decisions: 0 });
  });

  it('reverses a committed Apply with a new Effect and leaves the original receipt as it was', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost;
    const block = paragraphs(windowOf(book))[0]!;
    const original = block.text;
    const { markId, pinned } = suggest(book, block.blockId, 6, 12, PROPOSED);
    expect(refusal(() => marks.reverseAppliedChangeSuggestion(h, { ...binding(book!), markId, clientEffectId: randomUUID() }))).toBe('APPLY_INVALID');
    const applied = marks.applyChangeSuggestion(h, { ...binding(book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });

    const reverseId = randomUUID();
    const reversed = marks.reverseAppliedChangeSuggestion(h, { ...binding(book), markId, clientEffectId: reverseId });
    expect(blockText(book, block.blockId) === original).toBe(true);
    expect(reversed.application).toMatchObject({ kind: 'reverse-apply', interaction: 'confirm-reverse-apply', reversesEffectId: applied.application.effectId });
    expect(reversed.application.after.journalSequence).toBe(applied.application.after.journalSequence + 1);
    // The mark stands on the restored text and the item is undecided again; the first Apply is history, named as reversed.
    expect(reversed.card).toMatchObject({ status: 'open', anchorState: 'exact', pinnedText: pinned, fromGrapheme: 6, toGrapheme: 12 });
    expect(reversed.card!.suggestion!.decision).toBeNull();
    expect(reversed.card!.suggestion!.application).toMatchObject({ effectId: applied.application.effectId, receiptDigest: applied.application.receiptDigest, reversedByEffectId: reversed.application.effectId });
    expect(marks.reverseAppliedChangeSuggestion(h, { ...binding(book), markId, clientEffectId: reverseId }).application).toEqual(reversed.application);
    expect(refusal(() => marks.reverseAppliedChangeSuggestion(h, { ...binding(book!), markId, clientEffectId: randomUUID() }))).toBe('APPLY_INVALID');

    // It can be accepted again: a new Effect, a new receipt.
    const second = marks.applyChangeSuggestion(h, { ...binding(book), markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
    expect(second.application.effectId).not.toBe(applied.application.effectId);
    // Text typed into the applied words afterwards is the editor's own: reversing would overwrite it, so it is refused.
    typeInto(book, block.blockId, 7, 7, '后改');
    expect(refusal(() => marks.reverseAppliedChangeSuggestion(h, { ...binding(book!), markId, clientEffectId: randomUUID() }))).toBe('APPLY_TARGET_DRIFTED');
  });

  it('applies a suggestion that deletes its words, stands exactly where they were, and writes them back there when reversed', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost;
    let point = 6;
    const block = paragraphs(windowOf(book))[0]!;
    const { markId, pinned } = suggest(book, block.blockId, 6, 12, '');
    const length = graphemesOf(pinned).length;
    const applyId = randomUUID();
    const applied = marks.applyChangeSuggestion(h, { ...binding(book), markId, clientEffectId: applyId, interaction: 'accept-and-apply', editedText: null, reason: null });
    let text = [...graphemesOf(block.text).slice(0, 6), ...graphemesOf(block.text).slice(12)];
    expect(blockText(book, block.blockId) === text.join('')).toBe(true);
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
    typeInto(book, block.blockId, 2, 2, front.join(''));
    text = [...text.slice(0, 2), ...front, ...text.slice(2)];
    point += front.length;
    typeInto(book, block.blockId, point, point, at.join(''));
    text = [...text.slice(0, point), ...at, ...text.slice(point)];
    point += at.length;
    const typed = typeInto(book, block.blockId, point + 5, point + 5, behind.join(''));
    text = [...text.slice(0, point + 5), ...behind, ...text.slice(point + 5)];
    expect(blockText(book, block.blockId) === text.join('')).toBe(true);
    expect(typed.marks.find((mark) => mark.markId === markId)).toMatchObject({ status: 'applied', anchorState: 'exact', fromGrapheme: point, toGrapheme: point });

    // 确认撤销本次应用 writes the words back at the point as one new Effect, and the mark stands on them, open and exact.
    const reverseId = randomUUID();
    const reversed = marks.reverseAppliedChangeSuggestion(h, { ...binding(book), markId, clientEffectId: reverseId });
    expect(blockText(book, block.blockId) === [...text.slice(0, point), ...graphemesOf(pinned), ...text.slice(point)].join('')).toBe(true);
    expect(reversed.application).toMatchObject({
      kind: 'reverse-apply', interaction: 'confirm-reverse-apply', changeCount: 1, reversesEffectId: applied.application.effectId,
      before: { journalSequence: typed.journalSequence, workingDigest: typed.workingDigest },
      after: { journalSequence: typed.journalSequence + 1, workingDigest: reversed.window.workingDigest },
    });
    expect(reversed.card).toMatchObject({ status: 'open', anchorState: 'exact', pinnedText: pinned, fromGrapheme: point, toGrapheme: point + length });
    expect(reversed.marks.find((mark) => mark.markId === markId)!.deletedText).toBeNull();
    expect(reversed.card!.suggestion!.decision).toBeNull();
    // The first Apply and its receipt stay exactly as committed; only the link to the Effect that reversed it is new.
    expect(marks.getManuscriptApplyOutcome(h, book.manuscriptId, book.branchId, applyId))
      .toEqual({ state: 'committed', application: { ...applied.application, reversedByEffectId: reversed.application.effectId } });
    expect(marks.reverseAppliedChangeSuggestion(h, { ...binding(book), markId, clientEffectId: reverseId }).application).toEqual(reversed.application);
    const targets = (kind: string): unknown => book!.db.prepare(
      `SELECT t.from_grapheme, t.to_grapheme, t.resulting_from_grapheme, t.resulting_to_grapheme
       FROM manuscript_effect_targets t JOIN manuscript_effect_intents i ON i.effect_id = t.effect_id WHERE i.kind = ?`,
    ).all(kind).map((row) => ({ ...row }));
    // The Apply replaced six graphemes with none; its reversal is an insertion into the empty range at the point.
    expect(targets('apply')).toEqual([{ from_grapheme: 6, to_grapheme: 12, resulting_from_grapheme: 6, resulting_to_grapheme: 6 }]);
    expect(targets('reverse-apply')).toEqual([{ from_grapheme: point, to_grapheme: point, resulting_from_grapheme: point, resulting_to_grapheme: point + length }]);
  });

  it('refuses to reverse a deletion once an edit has spanned the point its words left', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost;
    const block = paragraphs(windowOf(book))[0]!;
    // 修改后接受 with the field left empty: the editor's own wording deletes the words.
    const { markId } = suggest(book, block.blockId, 6, 12, PROPOSED);
    const applied = marks.applyChangeSuggestion(h, { ...binding(book), markId, clientEffectId: randomUUID(), interaction: 'accept-edited-and-apply', editedText: '', reason: null });
    expect(applied.card).toMatchObject({ status: 'applied', anchorState: 'exact', pinnedText: '', fromGrapheme: 6, toGrapheme: 6 });
    expect(applied.card!.suggestion!.decision).toMatchObject({ disposition: 'accepted-with-edit', editedText: '' });

    // Taking away the grapheme on one side of the point leaves it exact; an edit taking graphemes from both sides does not.
    typeInto(book, block.blockId, 5, 6, '');
    expect(marks.getEditorialMarkCard(h, book.manuscriptId, book.branchId, markId)).toMatchObject({ status: 'applied', anchorState: 'exact', fromGrapheme: 5, toGrapheme: 5 });
    const spanned = typeInto(book, block.blockId, 4, 6, '改');
    expect(spanned.marks.find((mark) => mark.markId === markId)).toMatchObject({ status: 'applied', anchorState: 'drifted' });
    expect(marks.getEditorialMarkCard(h, book.manuscriptId, book.branchId, markId)).toMatchObject({ status: 'applied', anchorState: 'drifted' });

    const clientEffectId = randomUUID();
    let refused: unknown;
    try {
      marks.reverseAppliedChangeSuggestion(h, { ...binding(book), markId, clientEffectId });
    } catch (error) {
      refused = error;
    }
    // The store's wrapper carries this code and message as a StoreError (kept on disk by manuscript-apply.test.ts).
    expect(refused).toMatchObject({ code: 'APPLY_TARGET_DRIFTED', message: '应用后的文字又改过，不能直接撤销这次应用。' });
    expect(windowOf(book).workingDigest).toBe(spanned.workingDigest);
    expect(marks.getManuscriptApplyOutcome(h, book.manuscriptId, book.branchId, clientEffectId).state).toBe('not-committed');
  });

  it('restores adjacent batch deletions in their original committed Effect order', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost;
    const block = paragraphs(windowOf(book))[0]!;
    const parts = graphemesOf(block.text);
    const first = suggest(book, block.blockId, 4, 6, '');
    const second = suggest(book, block.blockId, 6, 9, '');
    const batch = marks.applyChangeSuggestionBatch(h, { ...binding(book), markIds: [first.markId, second.markId], clientEffectId: randomUUID() });
    expect(blockText(book, block.blockId) === [...parts.slice(0, 4), ...parts.slice(9)].join('')).toBe(true);
    for (const { markId } of [first, second]) {
      expect(batch.marks.find((mark) => mark.markId === markId)).toMatchObject({ status: 'applied', anchorState: 'exact', fromGrapheme: 4, toGrapheme: 4 });
    }
    // Original Effect ranges retain the order even though both current deletion anchors share one point.
    const inverse = { ...binding(book), markId: second.markId, clientEffectId: randomUUID() };
    expect(marks.prepareReverseApply(h, inverse)).toMatchObject({ ready: true, originalEffectId: batch.application.effectId });
    const restored = marks.reverseAppliedChangeSuggestion(h, inverse);
    expect(blockText(book, block.blockId) === block.text).toBe(true);
    expect(restored.application.reversesEffectId).toBe(batch.application.effectId);
    expect(restored.marks.find((mark) => mark.markId === first.markId)).toMatchObject({ status: 'open', anchorState: 'exact', fromGrapheme: 4, toGrapheme: 6 });
    expect(restored.marks.find((mark) => mark.markId === second.markId)).toMatchObject({ status: 'open', anchorState: 'exact', fromGrapheme: 6, toGrapheme: 9 });
    expect(marks.reverseAppliedChangeSuggestion(h, inverse).application.effectId).toBe(restored.application.effectId);
  });

  it('applies a confirmed batch as one Effect, all or none', async () => {
    book = await manuscriptMarksBook();
    const h = book.marksHost;
    const [first, second] = paragraphs(windowOf(book));
    const made = [suggest(book, first!.blockId, 2, 5, PROPOSED), suggest(book, first!.blockId, 14, 18, PROPOSED), suggest(book, second!.blockId, 3, 7, PROPOSED)];
    const texts = [first!.blockId, second!.blockId].map((blockId) => blockText(book!, blockId));

    // One member drifts: the whole Effect is refused and nothing is written, the drifted one included by name.
    const drifting = suggest(book, second!.blockId, 20, 24, PROPOSED);
    const edited = typeInto(book, second!.blockId, 21, 22, '改');
    expect(refusal(() => marks.applyChangeSuggestionBatch(h, { ...binding(book!), markIds: [...made.map((mark) => mark.markId), drifting.markId], clientEffectId: randomUUID() })))
      .toBe('APPLY_TARGET_DRIFTED');
    expect(windowOf(book).workingDigest).toBe(edited.workingDigest);

    const batch = marks.applyChangeSuggestionBatch(h, { ...binding(book), markIds: made.map((mark) => mark.markId), clientEffectId: randomUUID() });
    expect(batch.application).toMatchObject({ kind: 'apply', interaction: 'confirm-batch-apply', changeCount: 3 });
    expect(batch.application.after.journalSequence).toBe(edited.journalSequence + 1);
    const length = graphemesOf(PROPOSED).length;
    const firstNow = graphemesOf(blockText(book, first!.blockId));
    expect(firstNow.slice(2, 2 + length).join('')).toBe(PROPOSED);
    expect(firstNow.slice(14 + (length - 3), 14 + (length - 3) + length).join('')).toBe(PROPOSED);
    expect(firstNow.length).toBe(graphemesOf(texts[0]!).length + (length - 3) + (length - 4));
    expect(graphemesOf(blockText(book, second!.blockId)).slice(3, 3 + length).join('')).toBe(PROPOSED);
    for (const mark of made) {
      expect(marks.getEditorialMarkCard(h, book.manuscriptId, book.branchId, mark.markId)).toMatchObject({ status: 'applied', anchorState: 'exact', pinnedText: PROPOSED });
    }
    expect(marks.getEditorialMarkCard(h, book.manuscriptId, book.branchId, drifting.markId)).toMatchObject({ status: 'open', anchorState: 'drifted' });
  });
});
