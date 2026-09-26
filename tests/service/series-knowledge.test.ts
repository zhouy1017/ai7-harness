import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SERIES_KNOWLEDGE_PAGE_BYTES, SERIES_KNOWLEDGE_SCHEMA_SQL, SERIES_KNOWLEDGE_TRIGGER_SQL } from '../../src/service/series-knowledge.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { SERIES_KNOWLEDGE_SCHEMA_VERSION, SERIES_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  MAX_FRAME_BYTES,
  MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS,
  MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE,
  type SeriesKnowledgeSpanInput,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 书系知识 (Issue #63, plan slice S28b; V2-UX-SER-013 to SER-019; ADR 0036) over the real
// store: candidates from the editor's own words and from the exact span of a member Book's manuscript, conflicts found by
// identity, 书系知识纳入审阅 with its dispositions, `纳入书系知识` creating an item and appending a revision, a review the
// knowledge moved past refused, a candidate from a Book that left the Series held back, the ledgers across a restart
// refusing to be rewritten, and revision 53 added to a revision-52 store. The manuscripts are composed from the one admitted
// SampleBook; a quoted span is compared with the manuscript's own words for that span and is never printed.

const MEMBER: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 24, title: '书系成员' };
const OUTSIDER: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 30, blocks: 24, title: '书系之外' };
const TABLES = Object.keys(SERIES_KNOWLEDGE_SCHEMA_SQL);
const EDITOR_WORDS = '林默生于海边小城，三部曲里他的年龄以第一部为准。';
const CHANGED_WORDS = '林默的年龄以第二部的修订为准。';

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-series-knowledge-');
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore, excerpt: ComposedManuscriptRequest): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, excerpt);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** The first six graphemes of the first paragraph long enough, as the editor would select them in the window. */
function span(store: EditorialStore, book: Imported): SeriesKnowledgeSpanInput {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 20)!;
  return {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: window.blocks[0]!.blockId,
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: 0,
    toGrapheme: 6,
    selectedText: graphemesOf(block.text).slice(0, 6).join(''),
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

function join2(store: EditorialStore, seriesId: string, bookId: string, kind: 'add' | 'remove'): void {
  const preview = store.previewSeriesMembershipChange({ seriesId, bookId, kind });
  store.changeSeriesMembership({ seriesId, bookId, kind, previewDigest: preview.previewDigest });
}

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

function counts(): Record<string, number> {
  const database = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    return Object.fromEntries(TABLES.map((table) => [table, (database.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count]));
  } finally {
    database.close();
  }
}

/**
 * Items by name with their revisions' ordinals and preserved conflicts — read as 历次版本 reads them — and open candidates by
 * name, authorship and conflicts: each list's first page.
 */
function knowledgeOf(store: EditorialStore, seriesId: string): { items: unknown[]; candidates: unknown[] } {
  const { knowledge } = store.inspectSeries(seriesId);
  return {
    items: knowledge.items.map((item) => [item.subject, item.classLabel, store.inspectSeriesKnowledgeRevisions(seriesId, item.itemId, null).revisions
      .map((revision) => [revision.ordinal, revision.outcome, revision.conflicts.length, revision.reuseScope])]),
    candidates: knowledge.candidates.map((candidate) => [candidate.target.kind, candidate.target.subject, candidate.authoring, candidate.conflicts]),
  };
}

const wire = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');
/** A moment later: records a step apart never share an instant, so which came first is never a tie. */
const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 3));

describe('书系知识 over the real store', () => {
  it('keeps saved-revision provenance checkpoint-relative across later edits, saves and restart', async () => {
    let seriesId: string;
    let savedId: string;
    let dirtyId: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const member = await importBook(store, MEMBER);
      seriesId = store.createSeries({ title: '来源边界', note: '' }).seriesId;
      join2(store, seriesId, member.bookId, 'add');
      const edit = () => {
        const window = store.getManuscriptWindow(member.manuscriptId, member.branchId, null);
        const block = window.blocks.find((entry) => entry.kind === 'paragraph')!;
        store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: member.manuscriptId, branchId: member.branchId,
          baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence,
          windowStartBlockId: window.blocks[0]!.blockId, blockId: block.blockId, baseBlockDigest: block.digest,
          fromGrapheme: 0, toGrapheme: 0, insertText: '〔修改〕' });
      };
      edit();
      const dirty = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '日志来源', knowledgeClass: 'canon' },
        content: '日志时提议', span: span(store, member) });
      dirtyId = dirty.candidate.candidateId;
      expect(dirty.candidate.provenance?.uncheckpointed).toBe(true);
      await store.saveMilestone(member.manuscriptId, member.branchId, '来源修订', 'stage-archive', null, '');
      const saved = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '已存来源', knowledgeClass: 'canon' },
        content: '保存后提议', span: span(store, member) });
      savedId = saved.candidate.candidateId;
      expect(saved.candidate.provenance!.journalSequence).toBeGreaterThan(0);
      expect(saved.candidate.provenance!.uncheckpointed).toBe(false);
      edit();
      // An edit after the citation does not make the already saved citation unsaved.
      expect(store.inspectSeriesKnowledgeReview({ seriesId, candidateId: savedId }).candidate.provenance?.uncheckpointed).toBe(false);
      await store.saveMilestone(member.manuscriptId, member.branchId, '再存修订', 'stage-archive', null, '');
      // A later save does not erase the journal suffix the older dirty citation actually named.
      expect(store.inspectSeriesKnowledgeReview({ seriesId, candidateId: dirtyId }).candidate.provenance?.uncheckpointed).toBe(true);
      store.markCleanShutdown();
    } finally { store.close(); }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectSeriesKnowledgeReview({ seriesId: seriesId!, candidateId: savedId! }).candidate.provenance?.uncheckpointed).toBe(false);
      expect(reopened.inspectSeriesKnowledgeReview({ seriesId: seriesId!, candidateId: dirtyId! }).candidate.provenance?.uncheckpointed).toBe(true);
      reopened.markCleanShutdown();
    } finally { reopened.close(); }
  }, 180_000);

  it('takes in candidates from the editor\'s words and a member\'s manuscript through review, conflicts disclosed and kept or resolved', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const member = await importBook(store, MEMBER);
      const outsider = await importBook(store, OUTSIDER);
      const seriesId = store.createSeries({ title: '星河三部曲', note: '' }).seriesId;
      join2(store, seriesId, member.bookId, 'add');
      expect(knowledgeOf(store, seriesId)).toEqual({ items: [], candidates: [] });

      // 提议为书系知识 is refused when its item, words or span is not one, or the span is not a member Book's.
      const newItem = { kind: 'new' as const, subject: '林默', knowledgeClass: 'characters' as const };
      for (const [input, expected] of [
        [{ target: { ...newItem, subject: '林\n默' }, content: EDITOR_WORDS, span: null }, 'SERIES_KNOWLEDGE_SUBJECT_INVALID:条目名称要 1–40 个字，写在一行里。'],
        [{ target: { ...newItem, knowledgeClass: 'people' }, content: EDITOR_WORDS, span: null }, 'SERIES_KNOWLEDGE_CLASS_INVALID:请选择条目类别。'],
        [{ target: newItem, content: '   ', span: null }, 'SERIES_KNOWLEDGE_CONTENT_INVALID:内容要 1–2000 个字。'],
        [{ target: { kind: 'existing', itemId: randomUUID() }, content: EDITOR_WORDS, span: null }, 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND:这个书系知识条目不存在。'],
        [{ target: newItem, content: EDITOR_WORDS, span: span(store, outsider) }, 'SERIES_KNOWLEDGE_NOT_MEMBER:《书系之外》不在书系「星河三部曲」中；只有成员图书的稿件可以提议为书系知识。'],
        [{ target: newItem, content: EDITOR_WORDS, span: { ...span(store, member), selectedText: '不是原文' } }, 'MARK_ANCHOR_CHANGED:所选文字已变化，请重新选择。'],
      ] as const) {
        expect(refusal(() => store.proposeSeriesKnowledge({ seriesId, ...(input as Omit<Parameters<EditorialStore['proposeSeriesKnowledge']>[0], 'seriesId'>) }))).toBe(expected);
      }
      expect(counts()).toEqual({ series_knowledge_items: 0, series_knowledge_candidates: 0, series_knowledge_revisions: 0, series_knowledge_promotions: 0 });

      // One candidate cites the member's manuscript, one is the editor's own words; both propose 林默, so each discloses the other.
      const cited = span(store, member);
      const fromManuscript = store.proposeSeriesKnowledge({ seriesId, target: newItem, content: cited.selectedText, span: cited });
      expect(fromManuscript.completionLabel).toBe('已提议为书系「星河三部曲」的知识候选项');
      const fromEditor = store.proposeSeriesKnowledge({ seriesId, target: { ...newItem, subject: ' 林 默 ' }, content: EDITOR_WORDS, span: null });
      // The answer is the candidate alone (Issue #63 review).
      expect([fromEditor.candidate.candidateId, fromEditor.candidate.target.subject, fromEditor.candidate.conflicts]).toEqual([fromEditor.candidateId, '林 默', 1]);
      expect(knowledgeOf(store, seriesId)).toEqual({ items: [], candidates: [['new', '林默', 'manuscript-revision', 1], ['new', '林 默', 'editor', 1]] });
      const provenance = store.inspectSeries(seriesId).knowledge.candidates[0]!.provenance!;
      expect([provenance.bookTitle, provenance.revisionLabel, provenance.blockId, provenance.fromGrapheme, provenance.toGrapheme, provenance.quote === cited.selectedText, provenance.uncheckpointed])
        .toEqual(['书系成员', 'r1', cited.blockId, 0, 6, true, false]);

      // 书系知识纳入审阅: the conflict is disclosed with its label, the uses offered with none chosen, and nothing is taken in
      // until the conflict is kept explicitly — against the exact review read.
      const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: fromManuscript.candidateId });
      expect([review.conflictLabel, review.conflicts.map((entry) => entry.kind), review.conflicts[0]!.line, review.current, review.blocked, review.actionLabel])
        .toEqual(['存在书系知识冲突 · 需要处理', ['competing-candidate'], '另一个候选项也在提议「林 默」（第 1 版）。', null, null, '纳入书系知识']);
      // A conflict names the other candidate and its version, never its words (Issue #63 review).
      expect(review.conflictCount).toBe(1);
      expect(review.reuseScopes).toEqual([
        { scope: 'series-tasks', label: '以后的书系范围任务都可以选用' },
        { scope: 'consistency-review', label: '只用于书系一致性审阅' },
      ]);
      const promote = { seriesId, candidateId: fromManuscript.candidateId, candidateVersion: 1, reviewDigest: review.reviewDigest, reuseScope: 'consistency-review' as const };
      expect(refusal(() => store.promoteSeriesKnowledge({ ...promote, conflictDisposition: 'none' })))
        .toBe('SERIES_KNOWLEDGE_CONFLICT_UNRESOLVED:存在书系知识冲突 · 需要处理：请编辑候选项，或选择保留已披露冲突。');
      expect(refusal(() => store.promoteSeriesKnowledge({ ...promote, reviewDigest: 'f'.repeat(64), conflictDisposition: 'preserved' })))
        .toBe('SERIES_KNOWLEDGE_REVIEW_STALE:候选项、条目或冲突在审阅之后有了变化；请重新审阅。');
      expect(counts().series_knowledge_promotions).toBe(0);
      const created = store.promoteSeriesKnowledge({ ...promote, conflictDisposition: 'preserved' });
      expect(created.completionLabel).toBe('书系知识已纳入');
      expect(knowledgeOf(store, seriesId)).toEqual({ items: [['林默', '人物', [[1, 'created', 1, 'consistency-review']]]], candidates: [['new', '林 默', 'editor', 1]] });
      // The answer is the item alone, with its current revision and how many it holds.
      expect([created.item.itemId, created.item.revisionCount, created.item.current.ordinal]).toEqual([created.itemId, 1, 1]);
      const first = created.item.current;
      expect([first.authoring, first.provenance?.quote === cited.selectedText, first.conflicts[0]!.kind, first.reuseLabel])
        .toEqual(['manuscript-revision', true, 'competing-candidate', '只用于书系一致性审阅']);
      expect(refusal(() => store.inspectSeriesKnowledgeReview({ seriesId, candidateId: fromManuscript.candidateId }))).toBe('SERIES_KNOWLEDGE_ALREADY_PROMOTED:这个候选项已经纳入书系知识。');

      // The editor's candidate now names an item that exists: 编辑候选项 retargets it to that item, and the review read again
      // discloses nothing, so it is taken in without a disposition as the item's second revision.
      const again = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: fromEditor.candidateId });
      expect([again.conflicts.map((entry) => entry.kind), again.conflicts[0]!.line]).toEqual([['existing-item'], '书系知识里已有「林默」（人物）第 1 版。']);
      expect(refusal(() => store.editSeriesKnowledgeCandidate({ seriesId, candidateId: fromEditor.candidateId, expectedVersion: 2, target: { kind: 'existing', itemId: created.itemId }, content: EDITOR_WORDS })))
        .toBe('SERIES_KNOWLEDGE_CANDIDATE_MOVED:这个候选项刚被改过；请看过现在的内容再改。');
      const edited = store.editSeriesKnowledgeCandidate({ seriesId, candidateId: fromEditor.candidateId, expectedVersion: 1, target: { kind: 'existing', itemId: created.itemId }, content: EDITOR_WORDS });
      expect([edited.candidate.version, edited.candidate.target.kind, edited.candidate.target.baseRevisionOrdinal, edited.conflicts, edited.current?.ordinal])
        .toEqual([2, 'existing', 1, [], 1]);
      expect(refusal(() => store.editSeriesKnowledgeCandidate({ seriesId, candidateId: fromEditor.candidateId, expectedVersion: 2, target: { kind: 'existing', itemId: created.itemId }, content: EDITOR_WORDS })))
        .toBe('SERIES_KNOWLEDGE_CANDIDATE_UNCHANGED:候选项没有变化。');
      // An edit that names the version before is refused, whatever it would write.
      expect(refusal(() => store.editSeriesKnowledgeCandidate({ seriesId, candidateId: fromEditor.candidateId, expectedVersion: 1, target: { kind: 'existing', itemId: created.itemId }, content: CHANGED_WORDS })))
        .toBe('SERIES_KNOWLEDGE_CANDIDATE_MOVED:这个候选项刚被改过；请看过现在的内容再改。');
      const settled = { seriesId, candidateId: fromEditor.candidateId, candidateVersion: 2, reviewDigest: edited.reviewDigest, reuseScope: 'series-tasks' as const };
      expect(refusal(() => store.promoteSeriesKnowledge({ ...settled, conflictDisposition: 'preserved' }))).toBe('SERIES_KNOWLEDGE_DISPOSITION_INVALID:没有已披露的冲突可以保留。');
      const updated = store.promoteSeriesKnowledge({ ...settled, conflictDisposition: 'none' });
      expect(updated.completionLabel).toBe('书系知识已更新');
      expect(knowledgeOf(store, seriesId)).toEqual({ items: [['林默', '人物', [[2, 'updated', 0, 'series-tasks'], [1, 'created', 1, 'consistency-review']]]], candidates: [] });

      // A review the item moved past is refused: a candidate read against revision 2 is overtaken by another taken in first.
      const late = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId: created.itemId }, content: CHANGED_WORDS, span: null });
      const lateReview = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: late.candidateId });
      expect(lateReview.conflicts).toEqual([]);
      const rival = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId: created.itemId }, content: '林默的年龄不再写明。', span: null });
      const rivalReview = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: rival.candidateId });
      expect(rivalReview.conflicts.map((entry) => entry.kind)).toEqual(['competing-candidate']);
      store.promoteSeriesKnowledge({ seriesId, candidateId: rival.candidateId, candidateVersion: 1, reviewDigest: rivalReview.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'preserved' });
      expect(refusal(() => store.promoteSeriesKnowledge({ seriesId, candidateId: late.candidateId, candidateVersion: 1, reviewDigest: lateReview.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'none' })))
        .toBe('SERIES_KNOWLEDGE_REVIEW_STALE:候选项、条目或冲突在审阅之后有了变化；请重新审阅。');
      expect(store.inspectSeriesKnowledgeReview({ seriesId, candidateId: late.candidateId }).conflicts[0]!.line).toBe('「林默」在提议之后已更新为第 3 版。');

      // 移出书系 names the knowledge taken from the Book and leaves it in place; a manuscript candidate from a Book that left
      // is held back.
      const pending = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '海边小城', knowledgeClass: 'places' }, content: cited.selectedText, span: span(store, member) });
      const leave = store.previewSeriesMembershipChange({ seriesId, bookId: member.bookId, kind: 'remove' });
      expect(leave.groups[2]!.unchanged[0]).toBe('书系「星河三部曲」的书系知识里有 1 个条目取自《书系成员》的稿件；它们留在书系知识中不变。');
      // What the removal holds back is said too (Issue #63 review): the Book's candidate waits until it rejoins.
      expect(leave.groups[2]!.changes).toEqual(['来自《书系成员》稿件、尚未纳入的 1 个书系知识候选项在它重新加入书系前不能纳入。']);
      store.changeSeriesMembership({ seriesId, bookId: member.bookId, kind: 'remove', previewDigest: leave.previewDigest });
      const held = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: pending.candidateId });
      expect(held.blocked).toBe('《书系成员》已不在书系「星河三部曲」中；来自它的候选项不能纳入。');
      expect(refusal(() => store.promoteSeriesKnowledge({ seriesId, candidateId: pending.candidateId, candidateVersion: 1, reviewDigest: held.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'none' })))
        .toBe('SERIES_KNOWLEDGE_BLOCKED:《书系成员》已不在书系「星河三部曲」中；来自它的候选项不能纳入。');
      expect(knowledgeOf(store, seriesId).items).toEqual([['林默', '人物', [[3, 'updated', 1, 'series-tasks'], [2, 'updated', 0, 'series-tasks'], [1, 'created', 1, 'consistency-review']]]]);
      // Rejoining makes it reviewable again, and the preview says so.
      expect(store.previewSeriesMembershipChange({ seriesId, bookId: member.bookId, kind: 'add' }).groups[2]!.changes)
        .toEqual(['来自《书系成员》稿件、尚未纳入的 1 个书系知识候选项重新可以审阅纳入。']);
      expect(counts()).toEqual({ series_knowledge_items: 1, series_knowledge_candidates: 6, series_knowledge_revisions: 3, series_knowledge_promotions: 3 });
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A restart keeps every item, revision and candidate; the ledgers refuse to be rewritten, and a revision rewritten by
    // hand no longer reads.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let seriesId: string;
    try {
      seriesId = reopened.inspectSeriesList().series[0]!.seriesId;
      expect(knowledgeOf(reopened, seriesId)).toEqual({
        items: [['林默', '人物', [[3, 'updated', 1, 'series-tasks'], [2, 'updated', 0, 'series-tasks'], [1, 'created', 1, 'consistency-review']]]],
        candidates: [['existing', '林默', 'editor', 1], ['new', '海边小城', 'manuscript-revision', 0]],
      });
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(databasePath());
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SERIES_KNOWLEDGE_SCHEMA_VERSION);
      for (const table of TABLES) expect(() => database.exec(`DELETE FROM ${table}`)).toThrowError(/SERIES_KNOWLEDGE_LEDGER_IMMUTABLE/u);
      expect(() => database.exec("UPDATE series_knowledge_revisions SET content = '改过'")).toThrowError(/SERIES_KNOWLEDGE_LEDGER_IMMUTABLE/u);
      database.exec('DROP TRIGGER series_knowledge_revisions_no_update');
      const row = database.prepare('SELECT revision_id, canonical_json FROM series_knowledge_revisions WHERE ordinal = 2').get() as { revision_id: string; canonical_json: string };
      const rewritten = row.canonical_json.replace(JSON.stringify(EDITOR_WORDS), JSON.stringify(CHANGED_WORDS));
      expect(rewritten).not.toBe(row.canonical_json);
      database.prepare('UPDATE series_knowledge_revisions SET canonical_json = ?, sha256 = ? WHERE revision_id = ?')
        .run(rewritten, createHash('sha256').update(rewritten).digest('hex'), row.revision_id);
      database.exec(SERIES_KNOWLEDGE_TRIGGER_SQL.series_knowledge_revisions_no_update!);
    } finally {
      database.close();
    }
    const tampered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(refusal(() => tampered.inspectSeries(seriesId!))).toBe('SERIES_KNOWLEDGE_RECORD_INVALID:书系知识记录已损坏。');
      tampered.markCleanShutdown();
    } finally {
      tampered.close();
    }
  }, 240_000);

  it('adds revision 53 to a revision-52 store with nothing else moved', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.createSeries({ title: '早先的书系', note: '' });
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const schemaOf = (database: DatabaseSync): Array<{ name: string; sql: string }> =>
      database.prepare("SELECT name, sql FROM sqlite_schema WHERE type IN ('table', 'trigger', 'index') AND sql IS NOT NULL ORDER BY name").all() as Array<{ name: string; sql: string }>;
    const plant = new DatabaseSync(databasePath());
    let before: Array<{ name: string; sql: string }>;
    try {
      plant.exec(`${TABLES.slice().reverse().map((table) => `DROP TABLE ${table};`).join(' ')} PRAGMA user_version = ${SERIES_SCHEMA_VERSION};`);
      before = schemaOf(plant);
    } finally {
      plant.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const series = migrated.inspectSeriesList().series[0]!;
      expect(migrated.inspectSeries(series.seriesId).knowledge).toEqual({ items: [], itemCount: 0, itemsNext: null, candidates: [], candidateCount: 0, candidatesNext: null });
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const database = new DatabaseSync(databasePath(), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SERIES_KNOWLEDGE_SCHEMA_VERSION);
      const after = schemaOf(database);
      expect(after.filter((entry) => !/^series_knowledge/u.test(entry.name))).toEqual(before!);
      expect(after.filter((entry) => TABLES.includes(entry.name)).map((entry) => entry.sql))
        .toEqual(TABLES.slice().sort().map((table) => SERIES_KNOWLEDGE_SCHEMA_SQL[table as keyof typeof SERIES_KNOWLEDGE_SCHEMA_SQL]));
      expect(counts()).toEqual({ series_knowledge_items: 0, series_knowledge_candidates: 0, series_knowledge_revisions: 0, series_knowledge_promotions: 0 });
    } finally {
      database.close();
    }
  }, 120_000);

  it('reads items, candidates and revisions a page at a time, finds an item by name, and keeps every answer well inside a frame (Issue #63 review)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const member = await importBook(store, MEMBER);
      const seriesId = store.createSeries({ title: '长篇书系', note: '' }).seriesId;
      join2(store, seriesId, member.bookId, 'add');
      const words = (index: number): string => `${String(index).padStart(2, '0')}${'设'.repeat(MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS - 2)}`;
      // Thirty-five candidates as long as words may be: the list comes a page at a time, each in its place once.
      const proposed = [];
      for (let index = 0; index < 35; index += 1) {
        proposed.push(store.proposeSeriesKnowledge({
          seriesId, target: { kind: 'new', subject: `条目${String(index).padStart(2, '0')}`, knowledgeClass: 'terminology' }, content: words(index), span: null,
        }));
        await later();
      }
      const opening = store.inspectSeries(seriesId);
      expect([opening.knowledge.candidateCount, opening.knowledge.candidates.length < 35, opening.knowledge.candidatesNext !== null]).toEqual([35, true, true]);
      expect(wire(opening)).toBeLessThan(MAX_FRAME_BYTES / 2);
      expect(wire(opening.knowledge.candidates)).toBeLessThanOrEqual(SERIES_KNOWLEDGE_PAGE_BYTES);
      const seen = opening.knowledge.candidates.map((candidate) => candidate.candidateId);
      let after = opening.knowledge.candidatesNext;
      for (let guard = 0; after !== null && guard < 35; guard += 1) {
        const page = store.inspectSeriesKnowledgeCandidates(seriesId, after);
        seen.push(...page.candidates.map((candidate) => candidate.candidateId));
        after = page.nextCursor;
      }
      expect(seen).toEqual(proposed.map((entry) => entry.candidateId));
      // Each taken in: the items come by name a page at a time, and 查找条目 finds one directly.
      for (const entry of proposed) {
        const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: entry.candidateId });
        store.promoteSeriesKnowledge({ seriesId, candidateId: entry.candidateId, candidateVersion: 1, reviewDigest: review.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'none' });
      }
      const listed = store.inspectSeries(seriesId).knowledge;
      expect([listed.itemCount, listed.items.length < 35, listed.candidateCount]).toEqual([35, true, 0]);
      expect(wire(listed.items)).toBeLessThanOrEqual(SERIES_KNOWLEDGE_PAGE_BYTES);
      const names = listed.items.map((item) => item.subject);
      let next = listed.itemsNext;
      for (let guard = 0; next !== null && guard < 35; guard += 1) {
        const page = store.inspectSeriesKnowledgeItems(seriesId, '', next);
        names.push(...page.items.map((item) => item.subject));
        next = page.nextCursor;
      }
      expect(names).toEqual(Array.from({ length: 35 }, (_, index) => `条目${String(index).padStart(2, '0')}`));
      expect(store.inspectSeriesKnowledgeItems(seriesId, ' 条目34 ', null).items.map((item) => item.subject)).toEqual(['条目34']);
      expect(store.inspectSeriesKnowledgeItems(seriesId, '没有这个名字', null)).toEqual({ items: [], nextCursor: null });
      expect(refusal(() => store.inspectSeriesKnowledgeItems(seriesId, '名'.repeat(41), null))).toBe('SERIES_KNOWLEDGE_QUERY_INVALID:查找的条目字词最多 40 个字，写在一行里。');
      // One item updated again and again: an item answers with its current revision, and 历次版本 reads the rest ten at a time.
      const itemId = listed.items[0]!.itemId;
      for (let round = 0; round < 11; round += 1) {
        const update = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId }, content: `第 ${round + 2} 次的写法`, span: null });
        const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: update.candidateId });
        store.promoteSeriesKnowledge({ seriesId, candidateId: update.candidateId, candidateVersion: 1, reviewDigest: review.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'none' });
      }
      const item = store.inspectSeriesKnowledgeItems(seriesId, '条目00', null).items[0]!;
      expect([item.revisionCount, item.current.ordinal]).toEqual([12, 12]);
      const newest = store.inspectSeriesKnowledgeRevisions(seriesId, itemId, null);
      expect([newest.revisions.length, newest.revisions[0]!.ordinal, newest.nextBefore]).toEqual([MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE, 12, 3]);
      const oldest = store.inspectSeriesKnowledgeRevisions(seriesId, itemId, newest.nextBefore);
      expect([oldest.revisions.map((revision) => revision.ordinal), oldest.nextBefore]).toEqual([[2, 1], null]);
      expect(refusal(() => store.inspectSeriesKnowledgeRevisions(seriesId, randomUUID(), null))).toBe('SERIES_KNOWLEDGE_ITEM_NOT_FOUND:这个书系知识条目不存在。');
      // Many candidates for one name: a review lists fifty of the conflicts and says how many there are.
      const crowd = [];
      for (let index = 0; index < 52; index += 1) {
        crowd.push(store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '同名条目', knowledgeClass: 'canon' }, content: `第 ${index} 种说法`, span: null }));
      }
      const crowded = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: crowd[0]!.candidateId });
      expect([crowded.conflicts.length, crowded.conflictCount, crowded.conflictLabel]).toEqual([50, 51, '存在书系知识冲突 · 需要处理']);
      // Words cited after the manuscript changed beyond its revision say so, since they may come from that change.
      const window = store.getManuscriptWindow(member.manuscriptId, member.branchId, null);
      const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 20)!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: member.manuscriptId, branchId: member.branchId, baseRevisionId: window.revisionId, blockId: block.blockId,
        windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
        fromGrapheme: 0, toGrapheme: 0, insertText: '〔改动〕',
      });
      const changed = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '改动之后', knowledgeClass: 'canon' }, content: '〔改动〕', span: span(store, member) });
      expect(changed.candidate.provenance?.uncheckpointed).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);
});
