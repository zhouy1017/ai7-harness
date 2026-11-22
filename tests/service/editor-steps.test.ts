import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { DurableHistoryProjection, JournalStructuralEdit, ManuscriptWindowProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for undo by editor step (Issue #1654; ADR 0105 §1; the #1555 design record §1 and §5): every
// editor action is one step, Ctrl+Z takes back the newest whatever its kind, a step owns the Effect generations it wrote, and a
// step whose words changed since is set aside so the stack never wedges. The manuscript is composed from the admitted
// SampleBook; text is compared by equality and length only.

let roots: ServiceTestRoots;
let store: EditorialStore;
let book: { manuscriptId: string; branchId: string };

beforeEach(async () => {
  roots = await createServiceTestRoots();
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const path = join(roots.inputRoot, 'steps.docx');
  await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '步骤组稿' });
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
const texts = (): string[] => window().blocks.map((block) => block.text);
const textOf = (blockId: string): string => window().blocks.find((block) => block.blockId === blockId)!.text;
const paragraphs = (): ManuscriptWindowProjection['blocks'] => window().blocks.filter((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 30);
const binding = () => ({ ...book, windowStartBlockId: window().blocks[0]!.blockId });
const code = (operation: () => unknown): string => {
  try { operation(); } catch (error) { if (error instanceof StoreError) return error.code; throw error; }
  return 'no-error';
};
const undo = (expectedStepId?: string): DurableHistoryProjection => store.undoManuscript(book.manuscriptId, book.branchId, window().workingDigest, expectedStepId);
const redo = (): DurableHistoryProjection => store.redoManuscript(book.manuscriptId, book.branchId, window().workingDigest);

function journal(blockId: string, at: number, insertText = '', to = at, structure?: JournalStructuralEdit): void {
  const now = window();
  store.flushJournalEdit({
    clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
    baseBlockDigest: now.blocks.find((block) => block.blockId === blockId)!.digest, expectedJournalSequence: now.journalSequence,
    fromGrapheme: at, toGrapheme: to, insertText, ...(structure === undefined ? {} : { structure }),
  });
}

function suggestion(blockId: string, from: number, to: number, proposedText = '〔建议〕'): string {
  const now = window();
  const block = now.blocks.find((candidate) => candidate.blockId === blockId)!;
  return store.createEditorialMark({
    ...book, windowStartBlockId: now.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: now.revisionId,
    expectedJournalSequence: now.journalSequence, blockId, baseBlockDigest: block.digest, fromGrapheme: from, toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''), kind: 'change-suggestion', highlightColor: null,
    body: '', proposedText, rationale: null,
  }).markId;
}

const accept = (markId: string, editedText: string | null = null): void => {
  store.applyChangeSuggestion({ ...binding(), markId, clientEffectId: randomUUID(), interaction: editedText === null ? 'accept-and-apply' : 'accept-edited-and-apply', editedText, reason: null });
};
const reverseCard = (markId: string): string => code(() => store.reverseAppliedChangeSuggestion({ ...binding(), markId, clientEffectId: randomUUID() }));
const markAt = (markId: string) => {
  const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
  return { blockId: card.blockId, from: card.fromGrapheme, to: card.toGrapheme, anchorState: card.anchorState, status: card.status };
};

/** The store's own ledger rows, read on a second connection (the store keeps its own). */
function ledger<T>(read: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try { return read(db); } finally { db.close(); }
}
const interactions = (): string[] => ledger((db) => (db.prepare(`SELECT a.interaction FROM manuscript_effect_approvals a
  JOIN manuscript_effect_intents i ON i.effect_id = a.effect_id WHERE i.branch_id = ? ORDER BY i.base_journal_sequence`).all(book.branchId) as Array<{ interaction: string }>).map((row) => row.interaction));
const steps = (): Array<{ kind: string; status: string }> => ledger((db) => db.prepare('SELECT kind, status FROM editor_steps WHERE branch_id = ? ORDER BY ordinal').all(book.branchId) as Array<{ kind: string; status: string }>);

describe('undo by editor step (ADR 0105 §1)', () => {
  it('accept X, type B, Ctrl+Z, Ctrl+Z, redo, redo: B stays undone until its own redo, and the text equals the state after B', () => {
    const [x, b] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    const original = texts();
    accept(suggestion(x.blockId, 4, 8));
    const afterX = texts();
    journal(b.blockId, 0, '〔乙〕');
    const afterB = texts();
    expect(undo().completionLabel).toMatch(/^已撤销：编辑文字（第 [\d,]+ 段）$/);
    expect(texts()).toEqual(afterX);
    const undoneX = undo();
    expect(undoneX.completionLabel).toMatch(/^已撤销：接受修改建议（第 [\d,]+ 段）$/);
    expect(texts()).toEqual(original);
    // The Apply's reversal, dispatched by Ctrl+Z, supersedes nothing: B is still there to redo.
    expect(steps().map((step) => step.status)).toEqual(['undone', 'undone']);
    redo();
    expect(texts()).toEqual(afterX);
    expect(steps().map((step) => step.status)).toEqual(['applied', 'undone']);
    expect(redo().canRedo).toBe(false);
    expect(texts()).toEqual(afterB);
    expect(interactions()).toEqual(['accept-and-apply', 'undo-step', 'redo-step']);
  });

  it('Apply → card reversal → Ctrl+Z → redo → Ctrl+Z → Ctrl+Z returns to the original, each step on its own slot generations (C1)', () => {
    const x = paragraphs()[0]!;
    const original = texts();
    const markId = suggestion(x.blockId, 4, 8);
    accept(markId);
    const applied = texts();
    expect(reverseCard(markId)).toBe('no-error');
    expect(texts()).toEqual(original);
    // Loss 1: Ctrl+Z after the card's reversal undoes that reversal; HISTORY_AFTER_APPLY is not reachable from it.
    expect(undo().completionLabel).toMatch(/^已撤销：撤销本次修改/);
    expect(texts()).toEqual(applied);
    redo();
    expect(texts()).toEqual(original);
    undo();
    expect(texts()).toEqual(applied);
    undo();
    expect(texts()).toEqual(original);
    expect(interactions()).toEqual(['accept-and-apply', 'confirm-reverse-apply', 'undo-step', 'redo-step', 'undo-step', 'undo-step']);
    // Every Effect stands in the accepting step's one slot, generation after generation; none is owned twice.
    const chain = ledger((db) => db.prepare(`SELECT s.kind owner, e.slot, e.generation, e.polarity, w.kind writer, e.written_as
      FROM editor_step_effects e JOIN editor_steps s ON s.step_id = e.step_id JOIN editor_steps w ON w.step_id = e.written_by_step_id
      ORDER BY e.generation`).all());
    expect(chain.map((row) => [row.owner, row.slot, row.generation, row.polarity, row.writer, row.written_as])).toEqual([
      ['accept', 1, 1, 'apply', 'accept', 'do'],
      ['accept', 1, 2, 'reverse', 'reverse-card', 'do'],
      ['accept', 1, 3, 'apply', 'reverse-card', 'undo'],
      ['accept', 1, 4, 'reverse', 'reverse-card', 'redo'],
      ['accept', 1, 5, 'apply', 'reverse-card', 'undo'],
      ['accept', 1, 6, 'reverse', 'accept', 'undo'],
    ]);
  });

  it('re-applies the edited text on redo of an accept-with-edit, and exactly one learning signal stands for an applied accept', () => {
    const x = paragraphs()[0]!;
    const markId = suggestion(x.blockId, 4, 8);
    // The signals of this suggestion and where each stands now (a signal stands while its decision is the item's latest).
    const standing = (): string[] => store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals
      .filter((signal) => 'markId' in signal.source && signal.source.markId === markId).map((signal) => signal.currentEligibility);
    const stands = (states: string[]): number => states.filter((state) => state !== 'superseded').length;
    accept(markId, '〔编辑改定〕');
    const edited = texts();
    expect(stands(standing())).toBe(1);
    const usable = standing()[0]!;
    expect(['book', 'house']).toContain(usable);
    undo();
    expect(stands(standing())).toBe(0);
    redo();
    expect(texts()).toEqual(edited);
    expect(textOf(x.blockId).includes('〔编辑改定〕')).toBe(true);
    // The redone accept's own signal stands; the first is set aside, never counted twice.
    expect(standing().sort()).toEqual([usable, 'superseded'].sort());
    undo();
    expect(stands(standing())).toBe(0);
    // The card reads the decision as it stands: withdrawn after the last undo, as a card reversal leaves it.
    expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).suggestion?.decision).toBeNull();
  });

  it('keeps the editor\'s reason on redo of an accept-with-edit, on the card and on the one standing signal', () => {
    const x = paragraphs()[0]!;
    const markId = suggestion(x.blockId, 4, 8);
    store.applyChangeSuggestion({ ...binding(), markId, clientEffectId: randomUUID(), interaction: 'accept-edited-and-apply', editedText: '〔编辑改定〕', reason: '术语统一' });
    undo();
    redo();
    const decision = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).suggestion!.decision!;
    expect(decision).toMatchObject({ disposition: 'accepted-with-edit', reason: '术语统一', reasonState: 'given' });
    const standing = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals
      .filter((signal) => 'markId' in signal.source && signal.source.markId === markId && signal.currentEligibility !== 'superseded');
    expect(standing).toHaveLength(1);
    expect(standing[0]!.eligibility.decisionId ?? (standing[0]!.source as { decisionId?: string }).decisionId).toBe(decision.decisionId);
  });

  it('says a redo meets a suggestion the editor rejected since as handled another way, not as changed words', () => {
    const x = paragraphs()[0]!;
    const markId = suggestion(x.blockId, 4, 8);
    accept(markId);
    undo();
    store.recordChangeSuggestionDecision({ ...binding(), markId, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason: null });
    const blocked = redo();
    expect(blocked.blocked).toBe(true);
    expect(blocked.completionLabel).toMatch(/^第 [\d,]+ 段的修改建议在撤销后已另作处理，「接受修改建议」不能重做。/);
  });

  it('sets aside a step whose point mark drifted (the point-mark case), says where, and the next Ctrl+Z moves to the step before', () => {
    const [p, d] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    journal(p.blockId, 0, '〔先改〕');
    const deletion = suggestion(d.blockId, 4, 8, '');
    accept(deletion);
    const afterDeletion = texts();
    // Typing across the point the deletion left drifts its mark; undoing the typing brings the text back, not the anchor.
    journal(d.blockId, 3, '〔跨〕', 5);
    undo();
    expect(texts()).toEqual(afterDeletion);
    expect(markAt(deletion).anchorState).toBe('drifted');
    const blocked = undo();
    expect(blocked.blocked).toBe(true);
    expect(blocked.completionLabel).toMatch(/^第 [\d,]+ 段这处在接受后又改过，这一步不能撤销；可以在卡片上处理。再按 Ctrl\+Z 撤销更早的一步。$/);
    expect(texts()).toEqual(afterDeletion);
    expect(steps().map((step) => step.status)).toEqual(['applied', 'kept', 'undone']);
    undo();
    expect(textOf(p.blockId).startsWith('〔先改〕')).toBe(false);
    expect(textOf(d.blockId)).toBe(afterDeletion[window().blocks.findIndex((block) => block.blockId === d.blockId)]);
  });

  it('skips a slot that a card reversal took back and whose own undo was set aside', async () => {
    const x = paragraphs()[0]!;
    const original = texts();
    const markId = suggestion(x.blockId, 4, 8);
    accept(markId);
    expect(reverseCard(markId)).toBe('no-error');
    // The card's mark no longer stands on its words (as an edit across it since leaves it), so the card step's undo is set aside.
    store.markCleanShutdown();
    store.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    db.prepare("UPDATE editorial_marks SET anchor_state = 'drifted' WHERE mark_id = ?").run(markId);
    db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(undo().blocked).toBe(true);
    // The accepting step's slot already stands reversed by the kept card step: undoing it writes nothing and is no refusal,
    // its answer says so (never 「已撤销」), and it is set aside so no later press comes back to it.
    const skipped = undo();
    expect(skipped.blocked).toBe(false);
    expect(skipped.completionLabel).toBe('「接受修改建议」已在卡片上撤销过，这次没有改动文字。再按 Ctrl+Z 撤销更早的一步。');
    expect(texts()).toEqual(original);
    expect(steps().map((step) => [step.kind, step.status])).toEqual([['accept', 'kept'], ['reverse-card', 'kept']]);
    expect(code(redo)).toBe('NOTHING_TO_REDO');
  });

  it('sets aside a redo whose suggestion became a 批注 since, says why, and the next redo moves on (B2)', () => {
    const [x, b] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    const markId = suggestion(x.blockId, 4, 8);
    accept(markId);
    journal(b.blockId, 0, '〔乙〕');
    undo();
    undo();
    const original = texts();
    store.updateEditorialMark({ ...binding(), markId, action: 'convert', body: null, highlightColor: null, status: null, rationale: null, targetKind: 'annotation', proposedText: null });
    const blocked = redo();
    expect(blocked.blocked).toBe(true);
    expect(blocked.completionLabel).toMatch(/^第 [\d,]+ 段的修改建议在撤销后已另作处理，「接受修改建议」不能重做。再按重做会重做后面的一步。$/);
    expect(texts()).toEqual(original);
    expect(redo().completionLabel).toMatch(/^已重做：编辑文字/);
    expect(textOf(b.blockId).startsWith('〔乙〕')).toBe(true);
    expect(textOf(x.blockId)).toBe(original[window().blocks.findIndex((block) => block.blockId === x.blockId)]);
    expect(steps().map((step) => step.status)).toEqual(['superseded', 'applied']);
  });

  it('never re-applies on redo a slot that another step took back: only the step\'s own undo is put back', () => {
    const [a, b] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    const original = texts();
    const marks = [suggestion(a.blockId, 4, 8), suggestion(b.blockId, 2, 6)];
    store.withEditorStep(book.branchId, { kind: 'ai-edit', label: (count) => `AI 修改（${count} 处）` }, () => marks.forEach((markId) => accept(markId)));
    const bothApplied = texts();
    // A's card takes A back; A's suggestion then becomes a 批注, so the card step's own undo is set aside.
    expect(reverseCard(marks[0]!)).toBe('no-error');
    store.updateEditorialMark({ ...binding(), markId: marks[0]!, action: 'convert', body: null, highlightColor: null, status: null, rationale: null, targetKind: 'annotation', proposedText: null });
    expect(undo().blocked).toBe(true);
    // The AI edit's undo takes back B (A already stands taken back by the card); its redo puts back B only.
    expect(undo().completionLabel).toMatch(/^已撤销：AI 修改（2 处）/);
    expect(texts()).toEqual(original);
    expect(redo().blocked).toBe(false);
    const at = (blockId: string): number => window().blocks.findIndex((block) => block.blockId === blockId);
    expect(textOf(a.blockId)).toBe(original[at(a.blockId)]);
    expect(textOf(b.blockId)).toBe(bothApplied[at(b.blockId)]);
  });

  it('undoes a 全部替换 as one step, each occurrence still reversible on its card first', () => {
    const original = texts();
    const [a, b] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    journal(a.blockId, 0, '〔替〕');
    journal(b.blockId, 0, '〔替〕');
    const typed = texts();
    const search = store.createSearch(book.manuscriptId, book.branchId, '〔替〕').searchId;
    while (!store.advanceSearch(search).done) { /* bounded search */ }
    const preview = store.prepareReplacement(search, '〔换〕', []);
    while (!store.advanceReplacementWork(preview.previewId).done) { /* prepare */ }
    store.freezeReplacement(preview.previewId, []);
    while (!store.advanceReplacementWork(preview.previewId).done) { /* validate */ }
    const replaced = store.commitReplacementRevisions({ previewId: preview.previewId, windowStartBlockId: window().blocks[0]!.blockId });
    expect(replaced.completionLabel).toBe('已替换 2 处；Ctrl+Z 可整批撤销，每处卡片仍可单独撤销本次修改');
    expect(reverseCard(replaced.markIds[0]!)).toBe('no-error');
    expect(undo().stepLabel).toBe('撤销本次修改');
    expect(undo().completionLabel).toMatch(/^已撤销：全部替换「〔替〕」→「〔换〕」2 处/);
    expect(texts()).toEqual(typed);
    undo();
    undo();
    expect(texts()).toEqual(original);
  });

  it('undoes an AI edit\'s Applies as one step', () => {
    const original = texts();
    const [a, b] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    const marks = [suggestion(a.blockId, 4, 8), suggestion(b.blockId, 2, 6)];
    store.withEditorStep(book.branchId, { kind: 'ai-edit', label: (count) => `AI 修改（${count} 处）` }, () => marks.forEach((markId) => accept(markId)));
    expect(steps()).toEqual([{ kind: 'ai-edit', status: 'applied' }]);
    expect(undo().completionLabel).toMatch(/^已撤销：AI 修改（2 处）/);
    expect(texts()).toEqual(original);
  });

  it('names the paragraph of the part that refused when a composite step is set aside', async () => {
    const all = paragraphs();
    const [a, b] = [all[0]!, all[3]!];
    const marks = [suggestion(a.blockId, 4, 8), suggestion(b.blockId, 2, 6)];
    store.withEditorStep(book.branchId, { kind: 'ai-edit', label: (count) => `AI 修改（${count} 处）` }, () => marks.forEach((markId) => accept(markId)));
    // The later paragraph's applied mark no longer stands on its words; the earlier one's still does.
    store.markCleanShutdown();
    store.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    db.prepare("UPDATE editorial_marks SET anchor_state = 'drifted' WHERE mark_id = ?").run(marks[1]!);
    db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const blocked = undo();
    const later = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: b.blockId }).blocks.find((block) => block.blockId === b.blockId)!.position;
    expect(blocked.blocked).toBe(true);
    expect(blocked.paragraph).toBe(later);
    expect(blocked.completionLabel.startsWith(`第 ${later.toLocaleString('zh-CN')} 段`)).toBe(true);
  });

  it('names the paragraph of the target that refused inside one batch Effect', () => {
    const all = paragraphs();
    const [a, d] = [all[0]!, all[3]!];
    const deletion = suggestion(d.blockId, 4, 8, '');
    store.applyChangeSuggestionBatch({ ...binding(), markIds: [suggestion(a.blockId, 4, 8), deletion], clientEffectId: randomUUID() });
    // Typing across the later paragraph's point drifts its mark; undoing the typing brings the text back, not the anchor.
    journal(d.blockId, 3, '〔跨〕', 5);
    undo();
    expect(markAt(deletion).anchorState).toBe('drifted');
    const blocked = undo();
    const later = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: d.blockId }).blocks.find((block) => block.blockId === d.blockId)!.position;
    expect(blocked.blocked).toBe(true);
    expect(blocked.anchorBlockId).toBe(d.blockId);
    expect(blocked.paragraph).toBe(later);
    expect(blocked.completionLabel.startsWith(`第 ${later.toLocaleString('zh-CN')} 段`)).toBe(true);
  });

  it('puts back no anchor of a mark that left its recorded post side, even when the text replays exactly', async () => {
    const target = paragraphs()[0]!;
    const deletion = suggestion(target.blockId, 10, 12, '');
    accept(deletion);
    const created = `blk_${randomBytes(12).toString('hex')}`;
    journal(target.blockId, 10, '', 10, { kind: 'split', newBlockId: created });
    // The point at the caret was recorded (pre: exact at 10, post: as the split left it); move it elsewhere without a word changing.
    expect(markAt(deletion).anchorState).toBe('drifted');
    store.markCleanShutdown();
    store.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    db.prepare('UPDATE editorial_marks SET from_grapheme = 3, to_grapheme = 3 WHERE mark_id = ?').run(deletion);
    db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    undo();
    expect(window().blocks.some((block) => block.blockId === created)).toBe(false);
    expect(markAt(deletion)).toMatchObject({ blockId: target.blockId, from: 3, to: 3, anchorState: 'drifted' });
  });

  it('takes back an in-place revision decision as a step', () => {
    const target = paragraphs()[0]!;
    const sessionId = randomUUID();
    const now = window();
    store.flushJournalEdit({
      clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId: target.blockId, windowStartBlockId: now.blocks[0]!.blockId,
      baseBlockDigest: target.digest, expectedJournalSequence: now.journalSequence, fromGrapheme: 10, toGrapheme: 12, insertText: '〔甲〕',
      editorRevision: { sessionId, autoApply: false },
    });
    const revision = window().marks.find((mark) => mark.inlineRevision)!.markId;
    store.updateEditorialMark({ ...binding(), markId: revision, action: 'apply-inline-revision', body: null, highlightColor: null, status: null, targetKind: null, proposedText: null, rationale: null });
    expect(markAt(revision).status).toBe('applied');
    expect(undo().stepLabel).toBe('处理编辑修订');
    expect(markAt(revision).status).toBe('open');
    redo();
    expect(markAt(revision).status).toBe('applied');
  });

  it('keeps the batch step after a restart, and 撤销本批应用 undoes exactly it', async () => {
    const original = texts();
    const [a, b] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    store.applyChangeSuggestionBatch({ ...binding(), markIds: [suggestion(a.blockId, 4, 8), suggestion(b.blockId, 2, 6)], clientEffectId: randomUUID() });
    store.markCleanShutdown();
    store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const history = store.inspectEditorHistory(book.manuscriptId, book.branchId);
    expect(history.undo).toMatchObject({ kind: 'accept-batch', label: '接受本批修改建议（2 条）', changeCount: 2 });
    expect(code(() => undo(randomUUID()))).toBe('HISTORY_STEP_CHANGED');
    undo(history.undo!.stepId);
    expect(texts()).toEqual(original);
    expect(store.inspectEditorHistory(book.manuscriptId, book.branchId)).toMatchObject({ undo: null, redo: { kind: 'accept-batch' } });
  });

  it('says plainly that there is nothing to redo after a card reversal superseded undone typing (loss 2)', () => {
    const [x, b] = paragraphs() as [ManuscriptWindowProjection['blocks'][number], ManuscriptWindowProjection['blocks'][number]];
    const markId = suggestion(x.blockId, 4, 8);
    accept(markId);
    journal(b.blockId, 0, '〔乙〕');
    expect(undo().canRedo).toBe(true);
    expect(reverseCard(markId)).toBe('no-error');
    expect(store.inspectEditorHistory(book.manuscriptId, book.branchId).redo).toBeNull();
    expect(code(redo)).toBe('NOTHING_TO_REDO');
  });

  it('puts back the anchors of the marks at a 合段 caret when the join is undone (loss 3), and the card reverses again', () => {
    const blocks = window().blocks;
    const at = blocks.findIndex((block, index) => block.kind === 'paragraph' && blocks[index + 1]?.kind === 'paragraph' &&
      graphemesOf(block.text).length >= 10 && graphemesOf(blocks[index + 1]!.text).length >= 20);
    const [first, second] = [blocks[at]!, blocks[at + 1]!];
    const original = texts();
    const length = graphemesOf(first.text).length;
    const end = suggestion(first.blockId, 2, length, '');
    accept(end);
    const now = window();
    journal(first.blockId, 2, '', 2, { kind: 'merge', mergedBlockId: second.blockId, mergedBlockDigest: now.blocks.find((block) => block.blockId === second.blockId)!.digest });
    undo();
    expect(markAt(end)).toMatchObject({ blockId: first.blockId, from: 2, to: 2, anchorState: 'exact' });
    expect(reverseCard(end)).toBe('no-error');
    expect(texts()).toEqual(original);
  });

  it('undo and redo of a split keep the new block\'s identity', () => {
    const x = paragraphs()[0]!;
    const created = `blk_${randomBytes(12).toString('hex')}`;
    journal(x.blockId, 5, '', 5, { kind: 'split', newBlockId: created });
    expect(undo().completionLabel).toMatch(/^已撤销：分段（第 [\d,]+ 段）$/);
    expect(redo().completionLabel).toMatch(/^已重做：分段（第 [\d,]+ 段）$/);
    expect(window().blocks.some((block) => block.blockId === created)).toBe(true);
  });
});
