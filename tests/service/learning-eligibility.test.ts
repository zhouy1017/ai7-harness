import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LEARNING_ELIGIBILITY_BASIS, LEARNING_ELIGIBILITY_TRIGGER_SQL } from '../../src/service/learning-eligibility.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DECISION_FEEDBACK_SCHEMA_VERSION, SERIES_KNOWLEDGE_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type {
  CreateEditorialMarkInput,
  DecideLearningMaterialInput,
  GlobalAttentionItemProjection,
  LearningMaterialProjection,
  ManuscriptWindowProjection,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 质量与学习 › 学习准入 (Issue #61, plan slice S26b; V2-UX-LEARN-001 to LEARN-012, ATTN-009,
// FDBK-013) over the real store. The manuscript is composed from the one admitted SampleBook and no assertion prints its
// text: suggestions, reasons and notes are the suite's own words, and excerpts are compared by line prefix and count.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '学习组稿' };

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-learning-eligibility-');
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, 'learning.docx');
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

function suggestion(book: Imported, window: ManuscriptWindowProjection, from: number, to: number, proposedText: string): CreateEditorialMarkInput {
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 60)!;
  return {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: window.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''),
    kind: 'change-suggestion',
    highlightColor: null,
    body: '',
    proposedText,
    rationale: '与全书用法统一。',
  };
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

/** The Learning Material 待我处理 lists, as its group, state, Book, object, next step and target. */
function attention(store: EditorialStore): Array<[string, GlobalAttentionItemProjection['state'], string | null, unknown, string, unknown]> {
  return store.inspectGlobalAttention(() => null, false).groups.flatMap((group) => group.items
    .filter((item) => item.object.kind === 'learning-materials')
    .map((item) => [group.key, item.state, item.book.title, item.object, item.nextStep, item.target] as [string, GlobalAttentionItemProjection['state'], string | null, unknown, string, unknown]));
}

describe('学习准入 over the real store', () => {
  it('finds the material quietly, waits for the editor’s decision on each exact version, and decides again what changed', async () => {
    let book: Imported;
    let rejectedMark: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId };
      const make = (from: number, to: number, text: string) => store.createEditorialMark(suggestion(book, window, from, to, text)).markId;
      const decide = (markId: string, disposition: 'rejected' | 'accepted-with-edit', editedText: string | null, reason: string | null) =>
        store.recordChangeSuggestionDecision({ ...binding, markId, clientDecisionId: randomUUID(), disposition, editedText, reason }).card!.suggestion!.decision!;
      store.updateBookPeople({ bookId: book.bookId, expectedVersion: 0, authors: ['周一'], editors: ['郑三'], related: [] });

      // Nothing yet: a Book with no feedback has no Learning Material, and 待我处理 lists nothing for it.
      expect(store.inspectLearningMaterials(null)).toEqual({ basis: LEARNING_ELIGIBILITY_BASIS, books: [] });
      expect(attention(store)).toEqual([]);

      // A rejection with a reason and an acceptance in the editor's own wording are material; a rejection with no reason,
      // and one the editor said 不说明 about, are not.
      rejectedMark = make(2, 6, '示例替换一');
      const rejected = decide(rejectedMark, 'rejected', null, null);
      store.recordProposalDecisionReason({ ...binding, markId: rejectedMark, decisionId: rejected.decisionId, reason: '证据不足', reasonSource: 'suggested' });
      const editedMark = make(10, 14, '示例替换二');
      decide(editedMark, 'accepted-with-edit', '编辑自己的说法', null);
      decide(make(20, 24, '示例替换三'), 'rejected', null, null);
      const silent = make(30, 34, '示例替换四');
      const dismissedDecision = decide(silent, 'rejected', null, null);
      store.recordProposalDecisionFeedback({ ...binding, markId: silent, decisionId: dismissedDecision.decisionId, expectedFeedback: 0, action: 'dismiss', reason: null, reasonSource: null });

      const found = store.inspectLearningMaterials(null);
      expect(found.books.map((entry) => [entry.bookId, entry.authors, entry.editors, entry.materials.length])).toEqual([[book.bookId, ['周一'], ['郑三'], 2]]);
      const [reasoned, edited] = found.books[0]!.materials as [LearningMaterialProjection, LearningMaterialProjection];
      expect([reasoned.kind, reasoned.originLabel, reasoned.state, reasoned.decision, reasoned.decisions]).toEqual(['proposal-decision', '修改建议 · 拒绝', 'pending', null, 0]);
      expect(reasoned.excerpt.map((line) => line.split('：')[0])).toEqual(['原文', '建议', '你的原因']);
      expect(reasoned.excerpt.at(-1)).toBe('你的原因：证据不足');
      expect(reasoned.rationale).toBe('你说明了为什么这样处理：它可以帮 AI7 以后的建议更接近你的判断。');
      expect([edited.originLabel, edited.excerpt.map((line) => line.split('：')[0]), edited.rationale]).toEqual([
        '修改建议 · 修改后接受', ['原文', '建议', '你改为'], '你改写了建议的文字：这处改动可以帮 AI7 以后的建议更接近你的写法。',
      ]);
      expect(reasoned.digest).toMatch(/^[0-9a-f]{64}$/u);
      // One item for the Book in 等待你的决定, however many materials wait.
      expect(attention(store)).toEqual([['decisions', 'learning-materials-pending', '学习组稿', { kind: 'learning-materials', pending: 2, deferred: 0 },
        'decide-learning-materials', { kind: 'learning-materials', bookId: book.bookId }]]);

      const choose = (material: LearningMaterialProjection, input: Partial<DecideLearningMaterialInput>) => store.decideLearningMaterial({
        bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: material.decisions, choice: 'book', note: null, ...input,
      });
      // The exact version the editor read, the decisions they saw, a material that is one, and a note of the house's length.
      expect(refusal(() => choose(reasoned, { materialDigest: '0'.repeat(64) }))).toBe('LEARNING_MATERIAL_CHANGED:这条材料在你打开后改过；请看过现在的内容再定。');
      expect(refusal(() => choose(reasoned, { expectedDecisions: 1 }))).toBe('LEARNING_ELIGIBILITY_MOVED:这条材料的学习准入刚被改过；请看过现在的决定再定。');
      expect(refusal(() => choose(reasoned, { materialKey: `proposal-decision:${randomUUID()}` }))).toBe('LEARNING_MATERIAL_NOT_FOUND:这条材料已经不在学习准入之列。');
      expect(refusal(() => choose(reasoned, { note: '字'.repeat(501) }))).toBe('LEARNING_ELIGIBILITY_NOTE_TOO_LONG:补充说明要在 500 字以内。');

      // 仅纳入当前图书, with the editor's note: decided, and one fewer waits.
      const decided = choose(reasoned, { note: '  只在这本书里参考  ' }).books[0]!.materials.find((entry) => entry.materialKey === reasoned.materialKey)!;
      expect([decided.state, decided.decision?.choice, decided.decision?.note, decided.decisions]).toEqual(['decided', 'book', '只在这本书里参考', 1]);
      expect(refusal(() => choose(decided, { note: '只在这本书里参考' }))).toBe('LEARNING_ELIGIBILITY_UNCHANGED:学习准入没有变化。');
      // 稍后决定 keeps one unresolved material, neither eligible nor excluded, and the Book's item says so.
      const deferred = choose(edited, { choice: 'deferred' }).books[0]!.materials.find((entry) => entry.materialKey === edited.materialKey)!;
      expect([deferred.state, deferred.decision?.choice]).toEqual(['deferred', 'deferred']);
      expect(attention(store)).toEqual([['decisions', 'learning-materials-deferred', '学习组稿', { kind: 'learning-materials', pending: 0, deferred: 1 },
        'decide-learning-materials', { kind: 'learning-materials', bookId: book.bookId }]]);

      // The reason changed after the decision: the material is decided again; the decision it had stays on record.
      store.recordProposalDecisionFeedback({ ...binding, markId: rejectedMark, decisionId: rejected.decisionId, expectedFeedback: 0, action: 'revise', reason: '方向不合适', reasonSource: 'suggested' });
      const changed = store.inspectLearningMaterials(book.bookId).books[0]!.materials.find((entry) => entry.materialKey === reasoned.materialKey)!;
      expect([changed.state, changed.decision?.choice, changed.decisions, changed.digest === reasoned.digest, changed.excerpt.at(-1)]).toEqual(['changed', 'book', 1, false, '你的原因：方向不合适']);
      expect(attention(store)[0]?.[1]).toBe('learning-materials-pending');
      expect(refusal(() => choose(decided, {}))).toBe('LEARNING_MATERIAL_CHANGED:这条材料在你打开后改过；请看过现在的内容再定。');
      const house = choose(changed, { choice: 'house' }).books[0]!.materials.find((entry) => entry.materialKey === reasoned.materialKey)!;
      expect([house.state, house.decision?.choice, house.decisions]).toEqual(['decided', 'house', 2]);
      const excluded = choose(deferred, { choice: 'excluded', note: '不代表我的一贯做法' }).books[0]!.materials.find((entry) => entry.materialKey === edited.materialKey)!;
      expect([excluded.state, excluded.decision?.choice]).toEqual(['decided', 'excluded']);
      expect(attention(store)).toEqual([]);
      // 反馈记录 (Issue #61, S26c) lists every current decision, newest first — the silent and the dismissed ones too, each read
      // as no more than that — with the Book's people and where each opens; the withdrawn and the material alike are there once.
      const history = store.inspectFeedbackHistory();
      expect(history.books).toEqual([{ bookId: book.bookId, title: '学习组稿', authors: ['周一'], editors: ['郑三'] }]);
      expect(history.truncated).toBe(false);
      expect(history.entries.map((entry) => [entry.origin, entry.dimension, entry.signal, entry.reason, entry.reasonState])).toEqual([
        ['proposal-decision', null, '拒绝', null, 'dismissed'],
        ['proposal-decision', null, '拒绝', null, 'none'],
        ['proposal-decision', null, '修改后接受', null, 'none'],
        ['proposal-decision', null, '拒绝', '方向不合适', 'given'],
      ]);
      expect(history.entries[3]!.target).toEqual({ kind: 'mark', bookId: book.bookId, manuscriptId: book.manuscriptId, branchId: book.branchId, blockId: expect.stringMatching(/^blk_/u), markId: rejectedMark });
      // Deciding changes nothing it came from: the decision and its reason read as they were.
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, rejectedMark).suggestion!.decision).toMatchObject({ disposition: 'rejected', reason: '方向不合适', reasonState: 'given' });
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A restart keeps every decision; the ledger refuses to be rewritten, and a record rewritten by hand no longer reads.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectLearningMaterials(book!.bookId).books[0]!.materials.map((entry) => [entry.state, entry.decision?.choice, entry.decisions])).toEqual([
        ['decided', 'house', 2], ['decided', 'excluded', 2],
      ]);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SERIES_KNOWLEDGE_SCHEMA_VERSION);
      const records = (database.prepare('SELECT canonical_json FROM learning_eligibility_decisions ORDER BY recorded_at').all() as Array<{ canonical_json: string }>)
        .map((row) => JSON.parse(row.canonical_json) as { attribution: unknown; basis: string; choice: string });
      expect(records.map((record) => record.choice)).toEqual(['book', 'deferred', 'house', 'excluded']);
      expect(records.every((record) => record.basis === LEARNING_ELIGIBILITY_BASIS && JSON.stringify(record.attribution) === JSON.stringify({ authors: ['周一'], editors: ['郑三'], peopleVersion: 1 }))).toBe(true);
      expect(() => database.exec("UPDATE learning_eligibility_decisions SET choice = 'book'")).toThrowError(/LEARNING_ELIGIBILITY_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM learning_eligibility_decisions')).toThrowError(/LEARNING_ELIGIBILITY_LEDGER_IMMUTABLE/u);
      database.exec('DROP TRIGGER learning_eligibility_decisions_no_update');
      database.exec("UPDATE learning_eligibility_decisions SET canonical_json = replace(canonical_json, '不代表我的一贯做法', '改过')");
      database.exec(LEARNING_ELIGIBILITY_TRIGGER_SQL.learning_eligibility_decisions_no_update!);
    } finally {
      database.close();
    }
    const tampered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(refusal(() => tampered.inspectLearningMaterials(book!.bookId))).toBe('LEARNING_ELIGIBILITY_RECORD_INVALID:学习准入记录已损坏。');
      tampered.markCleanShutdown();
    } finally {
      tampered.close();
    }
  }, 180_000);

  it('adds revision 50 to a revision-49 store with nothing else moved', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const plant = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      plant.exec(`DROP TABLE series_knowledge_promotions; DROP TABLE series_knowledge_revisions; DROP TABLE series_knowledge_candidates; DROP TABLE series_knowledge_items; DROP TABLE series_membership_changes; DROP TABLE series; DROP TABLE evaluation_preferences; DROP TABLE publication_actuals; DROP TABLE learning_eligibility_decisions; PRAGMA user_version = ${DECISION_FEEDBACK_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SERIES_KNOWLEDGE_SCHEMA_VERSION);
      expect((database.prepare('SELECT count(*) count FROM learning_eligibility_decisions').get() as { count: number }).count).toBe(0);
    } finally {
      database.close();
    }
  }, 120_000);
});
