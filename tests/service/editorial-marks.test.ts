import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogueLedger } from '../../src/service/dialogue/dialogue-ledger.js';
import * as markSources from '../../src/service/editorial-mark-source.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION,
  CLARIFICATION_SCHEMA_VERSION, LATEST_SCHEMA_VERSION, ANALYSIS_LEDGER_REVISION_23_SQL,
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
  sourceSpanText,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { writeSyntheticDocx } from '../support/synthetic-docx.js';
import { MAX_RAIL_CHAPTERS } from '../../src/shared/protocol.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
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
  it.each([
    ['gpt-6-luna', undefined, 'gpt-6-luna'],
    ['gpt-6-luna', 'high', 'gpt-6-luna@high'],
    ['gpt-6-luna@low', 'high', 'gpt-6-luna@low'],
    ['deepseek-flash', undefined, 'DeepSeek V4.1 Flash'],
  ])('shows the executing model %s with only recorded effort %s (#1402)', (model, effort, label) => {
    expect(markSources.markModelLabels({ route: model.startsWith('deepseek') ? 'deepseek-open-platform' : 'openai-platform',
      model, ...(effort === undefined ? {} : { reasoningEffort: effort }) }).modelLabel).toBe(label);
  });

  it('repairs frozen provider-only authors on read without regenerating historical marks (#1402)', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(window);
      // Emulate the 0.6.1 writer at its label seam; persist through the real immutable mark owner.
      const legacyWriter = vi.spyOn(markSources, 'markModelLabels').mockReturnValueOnce({
        modelLabel: 'OpenAI 官方', modelTechnicalLabel: 'OpenAI 官方 · gpt-6-luna',
      });
      let markId: string;
      try {
        markId = store.createProducedEditorialMark({ ...book, blockId: block.blockId, fromGrapheme: 2, toGrapheme: 6,
          pinnedText: graphemesOf(block.text).slice(2, 6).join(''), kind: 'annotation', body: '公开合成批注',
          proposedText: null, rationale: null, atomicGroupId: null, basis: [],
          source: { kind: 'ai7', origin: 'task', label: '校对', taskId: randomUUID() },
          sourceModelBinding: { route: 'openai-platform', model: 'gpt-6-luna' } });
      } finally { legacyWriter.mockRestore(); }
      const read = () => store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(read().source.modelLabel).toBe('gpt-6-luna');
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(read().source.modelLabel).toBe('gpt-6-luna');
    } finally { store.close(); }
  });

  it.each(['bare-array', 'frozen-provider'])('keeps the original author through legacy %s conversions after a later dialogue binding (#1402)', async (shape) => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(window);
      const selection = markInput(book, window, block.blockId, 2, 6, 'annotation');
      const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 0, minute));
      const turn = store.askAboutSelection(window.bookId, { selection, question: '公开合成问题' }, at(0));
      // Backfill the historical ledger after producing bare arrays: this builds the old reader's valid shape
      // through the real owners, without mutating stored JSON, disabling triggers or sending any request.
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(at(1));
      const produce = () => store.createProducedEditorialMark({ ...book, blockId: block.blockId, fromGrapheme: 2, toGrapheme: 6,
        pinnedText: selection.selectedText, kind: 'change-suggestion', body: '', proposedText: '公开合成改稿', rationale: '',
        atomicGroupId: null, basis: [], source: { kind: 'ai7', origin: 'task', label: '对话回答', taskId: turn.dialogueId } });
      const legacyWriter = shape === 'frozen-provider' ? vi.spyOn(markSources, 'markModelLabels').mockReturnValue({
        modelLabel: 'OpenCode Go', modelTechnicalLabel: 'OpenCode Go · historical-model-a',
      }) : null;
      const original = produce(); const alreadyConverted = produce();
      legacyWriter?.mockRestore();
      vi.setSystemTime(at(3));
      const legacyAnnotation = store.updateEditorialMark(change(book, window, alreadyConverted, 'convert', { targetKind: 'annotation' })).card!;
      vi.useRealTimers();
      const ledger = new DialogueLedger(database);
      const bind = (attemptId: string, route: 'opencode-go' | 'deepseek-open-platform', model: string, minute: number) => {
        const session = randomUUID();
        ledger.bind(attemptId, { harnessSessionId: session, route, model, operationalScope: 'ordinary-production',
          providerProcessingVersion: 'v13', policyRuleId: 'ordinary-production-editorial-dialogue',
          behaviorCompositionSha256: 'a'.repeat(64), promptContractSha256: 'b'.repeat(64), boundAt: at(minute).toISOString() });
        ledger.openSpan(attemptId, session, 0, at(minute)); ledger.settle(attemptId, 'completed', 1, null, at(minute));
      };
      bind(turn.attemptId, 'opencode-go', 'historical-model-a', 0);
      ledger.convert(turn.attemptId, original, at(1)); ledger.convert(turn.attemptId, alreadyConverted, at(1));
      const next = ledger.nextAttempt(turn.dialogueId, 'regenerate', () => 0, at(2));
      bind(next, 'deepseek-open-platform', 'historical-model-b', 2);
      const converted = store.updateEditorialMark(change(book, window, original, 'convert', { targetKind: 'annotation' })).card!;
      expect(converted.source.modelLabel).toBe('historical-model-a');
      expect(converted.source.modelTechnicalLabel).toBe('OpenCode Go · historical-model-a');
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, legacyAnnotation.markId).source.modelTechnicalLabel).toBe('OpenCode Go · historical-model-a');
      store.markCleanShutdown(); store.close(); database.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      for (const markId of [converted.markId, legacyAnnotation.markId]) {
        expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).source.modelTechnicalLabel).toBe('OpenCode Go · historical-model-a');
      }
    } finally { vi.useRealTimers(); store.close(); if (database.isOpen) database.close(); }
  });

  it('projects registered editors and keeps a produced model author frozen across conversion and restart (#1379)', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(window);
      const own = store.createEditorialMark(markInput(book, window, block.blockId, 2, 6, 'annotation')).card!;
      expect(own.source.editorName).toBeNull();
      store.updateBookPeople({ bookId: window.bookId, expectedVersion: 0, authors: [], editors: ['责编甲', '责编乙'], related: [] });
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, own.markId).source.editorName).toBe('责编甲、责编乙');
      const markId = store.createProducedEditorialMark({ ...book, blockId: block.blockId, fromGrapheme: 8, toGrapheme: 13,
        pinnedText: graphemesOf(block.text).slice(8, 13).join(''), kind: 'change-suggestion', body: '', proposedText: '公开合成建议',
        rationale: '公开合成理由', atomicGroupId: null, basis: [],
        source: { kind: 'ai7', origin: 'task', label: '润色这段', taskId: randomUUID() },
        sourceModelBinding: { route: 'openai-platform', model: 'historical-custom-model', reasoningEffort: 'high' } });
      const source = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).source;
      expect(source.modelLabel).toBe('historical-custom-model@high');
      expect(source.modelTechnicalLabel).toBe('OpenAI 官方 · historical-custom-model@high');
      const converted = store.updateEditorialMark(change(book, window, markId, 'convert', { targetKind: 'annotation' })).card!;
      expect(converted.source).toEqual(source);
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, converted.markId).source).toEqual(source);
    } finally { store.close(); }
  });

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
        expect(result.card?.source).toEqual({ kind: 'editor', origin: null, label: null, taskId: null, editorName: null });
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
        source: { kind: 'ai7', origin: 'review-category', label: '人物与称谓一致', taskId: null },
        basis: [{ label: '第三章 第二节', blockId: window.blocks[1]!.blockId, fromGrapheme: 0, toGrapheme: 2, quote: null }],
      });
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, produced);
      expect(card.source).toMatchObject({ kind: 'ai7', origin: 'review-category', label: '人物与称谓一致', taskId: null, modelLabel: 'AI7 本地检查' });
      expect(card.basis).toHaveLength(1);
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).marks[0]).toMatchObject({ markId: produced, sourceKind: 'ai7', sourceOrigin: 'review-category', sourceLabel: '人物与称谓一致', categoryKey: 'consistency', categoryLabel: '剧情与人物逻辑' });
      expect(card).toMatchObject({ categoryKey: 'consistency', categoryLabel: '剧情与人物逻辑' });
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

  it('does not fold omitted chapters into the last retained chapter count', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const path = join(roots.inputRoot, 'rail-chapters.docx');
      const text = graphemesOf(await sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 5 })).slice(0, 20).join('');
      await writeSyntheticDocx(path, { paragraphs: Array.from({ length: MAX_RAIL_CHAPTERS + 1 }, () => ({ text, style: 'Heading1' })) });
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
      const commitId = randomUUID();
      const imported = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
      await store.acknowledgeImportCompletion(commitId);
      const book = { manuscriptId: imported.manuscriptId, branchId: imported.branchId };
      const window = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'proportion', proportion: 1 });
      for (const block of window.blocks.slice(-2)) store.createEditorialMark(markInput(book, window, block.blockId, 0, 1, 'annotation'));
      const rail = store.getManuscriptRail(book.manuscriptId, book.branchId);
      expect(rail.chapters).toHaveLength(MAX_RAIL_CHAPTERS);
      expect(rail.chaptersTruncated).toBe(true);
      expect(rail.marks).toHaveLength(2);
      expect(rail.chapters.at(-1)!.annotations).toBe(1);
      expect(rail.chapters.reduce((sum, chapter) => sum + chapter.annotations, 0)).toBe(1);
      store.markCleanShutdown();
    } finally { store.close(); }
  });

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
      downgradeKindCoupledRelations(downgrade, ANALYSIS_LEDGER_REVISION_23_SQL);
      execPre74Fixture(downgrade, `BEGIN IMMEDIATE;
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
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
      expect(after.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      after.close();
    }
  }, 300_000);
});


describe('inline editor revision journal (#1428)', () => {
  it.each([true, false])('keeps a half-clause rewrite in one reversible card (auto apply %s, #1539 N.1)', async (autoApply) => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store), initial = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(initial), sessionId = randomUUID();
      const baseline = '他昨天在书房里仔细核对了第三章的引文，其他文字不变。';
      const current = '他昨晚在案头认真查核了这一章的全部引文，其他文字不变。';
      const prepared = edit(store, book, initial, block.blockId, 0, graphemesOf(block.text).length, baseline);
      const written = store.flushJournalEdit({
        ...book, clientEditId: randomUUID(), baseRevisionId: prepared.revisionId, blockId: block.blockId,
        windowStartBlockId: prepared.blocks[0]!.blockId, baseBlockDigest: prepared.blocks.find((b) => b.blockId === block.blockId)!.digest,
        expectedJournalSequence: prepared.journalSequence, fromGrapheme: 0, toGrapheme: graphemesOf(baseline).length,
        insertText: current, editorRevision: { sessionId, autoApply },
      }).window;
      const revisions = written.marks.filter((mark) => mark.inlineRevision);
      expect(revisions).toMatchObject([{ fromGrapheme: 2, toGrapheme: 17, anchorState: 'exact', status: autoApply ? 'applied' : 'open',
        inlineRevision: { beforeText: '天在书房里仔细核对了第三章的', afterText: '晚在案头认真查核了这一章的全部', sessionId } }]);
      const markId = revisions[0]!.markId;
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId)).toMatchObject({
        inlineRevision: true, suggestion: { currentText: '天在书房里仔细核对了第三章的', proposedText: '晚在案头认真查核了这一章的全部' },
      });
      const reverted = store.updateEditorialMark({ ...book, windowStartBlockId: initial.blocks[0]!.blockId,
        markId, action: 'revert-inline-revision', body: null, highlightColor: null, status: null, targetKind: null, proposedText: null, rationale: null });
      expect(reverted.window?.blocks.find((b) => b.blockId === block.blockId)?.text).toBe(baseline);
      expect(reverted.window?.marks.filter((mark) => mark.inlineRevision)).toEqual([]);
    } finally { store.close(); }
  });

  it.each([true, false])('coalesces an edit, follows undo/redo and restores the baseline (auto apply %s)', async (autoApply) => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store), initial = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(initial), sessionId = randomUUID();
      const write = (window: ManuscriptWindowProjection, from: number, to: number, insertText: string) => store.flushJournalEdit({
        ...book, clientEditId: randomUUID(), baseRevisionId: window.revisionId, blockId: block.blockId,
        windowStartBlockId: initial.blocks[0]!.blockId, baseBlockDigest: window.blocks.find((b) => b.blockId === block.blockId)!.digest,
        expectedJournalSequence: window.journalSequence, fromGrapheme: from, toGrapheme: to, insertText,
        editorRevision: { sessionId, autoApply },
      }).window;
      let window = write(initial, 4, 8, '公开修订');
      const markId = window.marks.find((m) => m.blockId === block.blockId && m.inlineRevision)!.markId;
      window = write(window, 4, 8, '公开新修订');
      expect(window.marks.filter((m) => m.inlineRevision).map((m) => m.markId)).toEqual([markId]);
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).status).toBe(autoApply ? 'applied' : 'open');
      store.undoManuscript(book.manuscriptId, book.branchId, window.workingDigest);
      window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).suggestion?.proposedText).toBe('公开修订');
      store.redoManuscript(book.manuscriptId, book.branchId, window.workingDigest);
      const result = store.updateEditorialMark({ ...book, windowStartBlockId: initial.blocks[0]!.blockId,
        markId, action: 'revert-inline-revision', body: null, highlightColor: null, status: null, targetKind: null, proposedText: null, rationale: null });
      expect(result.window?.blocks.find((b) => b.blockId === block.blockId)?.text === block.text).toBe(true);
      expect(result.window?.marks.some((m) => m.markId === markId)).toBe(false);
    } finally { store.close(); }
  });

  it('keeps pending cards across reopen and accepts without writing the edited text twice', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store), initial = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = markableBlock(initial);
      const input = { ...book, clientEditId: randomUUID(), baseRevisionId: initial.revisionId, blockId: block.blockId,
        windowStartBlockId: initial.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: initial.journalSequence,
        fromGrapheme: 4, toGrapheme: 8, insertText: '公开修订', editorRevision: { sessionId: randomUUID(), autoApply: false } };
      const written = store.flushJournalEdit(input);
      expect(store.flushJournalEdit(input).sequence).toBe(written.sequence);
      const markId = written.window.marks.find((m) => m.inlineRevision)!.markId;
      store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId).status).toBe('open');
      const result = store.updateEditorialMark({ ...book, windowStartBlockId: initial.blocks[0]!.blockId,
        markId, action: 'apply-inline-revision', body: null, highlightColor: null, status: null, targetKind: null, proposedText: null, rationale: null });
      expect(result.card?.status).toBe('applied');
      expect(result.window?.journalSequence).toBe(written.sequence);
    } finally { store.close(); }
  });
});

