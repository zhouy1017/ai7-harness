import { execPre74Fixture, expectedSchema75 } from '../support/pre74-schema.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SeriesKnowledgeLedger, SERIES_KNOWLEDGE_PAGE_BYTES, SERIES_KNOWLEDGE_SCHEMA_SQL, SERIES_KNOWLEDGE_TRIGGER_SQL } from '../../src/service/series-knowledge.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { LATEST_SCHEMA_VERSION, SERIES_SCHEMA_VERSION, ANALYSIS_LEDGER_REVISION_58_SQL } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  MAX_FRAME_BYTES,
  MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS,
  MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE,
  type SeriesKnowledgeSpanInput,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';

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
let store: EditorialStore;
let storeOpen = false;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-series-knowledge-');
  await openStore();
});

afterEach(async () => {
  closeStore();
  await roots.dispose();
});

async function openStore(): Promise<void> {
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  storeOpen = true;
}

function closeStore(): void {
  if (!storeOpen) return;
  store.markCleanShutdown();
  store.close();
  storeOpen = false;
}

async function restartStore(): Promise<void> {
  closeStore();
  await openStore();
}

function withDatabase<T>(operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(databasePath());
  try { return operation(database); } finally { database.close(); }
}

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

function promote(seriesId: string, candidateId: string, conflictDisposition: 'none' | 'preserved' = 'none') {
  const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId });
  return store.promoteSeriesKnowledge({ seriesId, candidateId, candidateVersion: review.candidate.version,
    reviewDigest: review.reviewDigest, reuseScope: 'series-tasks', conflictDisposition });
}

describe('书系知识 over the real store', () => {
  it('orders equal-time candidates by ID after chronology, with identical pages across reopen', async () => {
    const seriesId = store.createSeries({ title: '候选项顺序', note: '' }).seriesId;
    closeStore();
    const early = '2026-01-01T00:00:00.000Z';
    const tied = '2026-01-01T00:00:01.000Z';
    const late = '2026-01-01T00:00:02.000Z';
    const id = (ordinal: number) => `00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
    const expected = [id(9), id(2), id(3), id(4), id(1)];
    const assertOrder = (database: DatabaseSync) => {
      const ledger = new SeriesKnowledgeLedger(database);
      expect([...ledger.open(seriesId)].map((candidate) => candidate.candidateId)).toEqual(expected);
      const first = ledger.openPage(seriesId, null, 2);
      expect(first.map(({ candidate, firstAt }) => [candidate.candidateId, firstAt])).toEqual([[id(9), early], [id(2), tied]]);
      const second = ledger.openPage(seriesId, { firstAt: first[1]!.firstAt, candidateId: first[1]!.candidate.candidateId }, 2);
      expect(second.map(({ candidate, firstAt }) => [candidate.candidateId, firstAt])).toEqual([[id(3), tied], [id(4), tied]]);
      const third = ledger.openPage(seriesId, { firstAt: second[1]!.firstAt, candidateId: second[1]!.candidate.candidateId }, 2);
      expect(third.map(({ candidate, firstAt }) => [candidate.candidateId, firstAt])).toEqual([[id(1), late]]);
      expect(ledger.openPage(seriesId, { firstAt: third[0]!.firstAt, candidateId: third[0]!.candidate.candidateId }, 2)).toEqual([]);
      const paged = [...first, ...second, ...third].map(({ candidate }) => candidate.candidateId);
      expect(paged).toEqual(expected);
      expect(new Set(paged).size).toBe(expected.length);
    };
    withDatabase((database) => {
      // Author canonical first-version fixtures: neither insertion order nor global ID order is the contract.
      for (const [ordinal, recordedAt] of [[1, late], [4, tied], [9, early], [3, tied], [2, tied]] as const) {
        const candidateId = id(ordinal);
        const versionId = randomUUID();
        const target = { kind: 'new', subject: `顺序${ordinal}`, knowledgeClass: 'canon' };
        const content = `候选内容${ordinal}`;
        const record = canonicalRecord({ schema: 'ai7.series-knowledge-candidate/1', versionId, candidateId, version: 1,
          seriesId, target, content, authoring: 'editor', provenance: null, supersedes: null, actor: '本机编辑', recordedAt });
        database.prepare(`INSERT INTO series_knowledge_candidates(version_id, candidate_id, version, series_id, subject, knowledge_class,
          content, authoring, recorded_at, canonical_json, sha256) VALUES (?, ?, 1, ?, ?, ?, ?, 'editor', ?, ?, ?)`)
          .run(versionId, candidateId, seriesId, target.subject, target.knowledgeClass, content, recordedAt, record.json, record.digest);
      }
      assertOrder(database);
    });
    await openStore();
    expect(store.inspectSeries(seriesId).knowledge.candidates.map((candidate) => candidate.candidateId)).toEqual(expected);
    withDatabase(assertOrder);
  });
  it('refuses membership and review pages after a governing candidate changes without changing the displayed counts', async () => {
    const seriesId = store.createSeries({ title: '相关记录版本', note: '' }).seriesId;
    const creation = store.prepareBookCreation('预览图书', null);
    const bookId = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
    const target = { kind: 'new' as const, subject: '版本条目', knowledgeClass: 'canon' as const };
    const candidate = store.proposeSeriesKnowledge({ seriesId, target, content: '第一版说明', span: null });
    const rival = store.proposeSeriesKnowledge({ seriesId, target, content: '另一个说明', span: null });
    const membership = { seriesId, bookId, kind: 'add' as const };
    const preview = store.previewSeriesMembershipChange(membership);
    const reviewInput = { seriesId, candidateId: candidate.candidateId };
    const review = store.inspectSeriesKnowledgeReview(reviewInput);
    store.editSeriesKnowledgeCandidate({ seriesId, candidateId: rival.candidateId, expectedVersion: 1, target, content: '改过的说明' });
    expect(store.previewSeriesMembershipChange(membership).groups).toEqual(preview.groups);
    expect(refusal(() => store.changeSeriesMembership({ ...membership, previewDigest: preview.previewDigest }))).toMatch(/^SERIES_PREVIEW_STALE:/);
    expect(refusal(() => store.inspectSeriesKnowledgeReview({ ...reviewInput,
      conflictsPage: { after: 0, candidateVersion: review.candidate.version, reviewDigest: review.reviewDigest } }))).toMatch(/^SERIES_KNOWLEDGE_REVIEW_STALE:/);
    expect(store.inspectBookSeries(bookId).historyCount).toBe(0);
    const fresh = store.previewSeriesMembershipChange(membership);
    store.changeSeriesMembership({ ...membership, previewDigest: fresh.previewDigest });
    expect(store.inspectBookSeries(bookId).historyCount).toBe(1);
  });
  describe('thousands of preserved conflicts', () => {
    let seriesId: string;
    let candidateId: string;
    beforeEach(() => {
      seriesId = store.createSeries({ title: '冲突分页', note: '' }).seriesId;
      const subject = '同名条目'.repeat(10);
      candidateId = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject, knowledgeClass: 'canon' }, content: '保留冲突的条目', span: null }).candidateId;
      // Canonical ledger arrangement keeps the public promotion test bounded in cost.
      withDatabase((database) => {
        const ledger = new SeriesKnowledgeLedger(database);
        database.exec('BEGIN IMMEDIATE');
        for (let index = 0; index < 2500; index += 1) ledger.propose({ seriesId,
          target: { kind: 'new', subject, knowledgeClass: 'canon' }, content: '另一个候选项', provenance: null });
        database.exec('COMMIT');
      });
    });
    it('pages a review with a stable digest and refuses stale or invalid cursors', async () => {
      const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId });
      expect(review.conflictCount).toBe(2500);
      const cursor = { candidateVersion: review.candidate.version, reviewDigest: review.reviewDigest, after: 50 };
      const pageInput = { seriesId, candidateId };
      const second = store.inspectSeriesKnowledgeReview({ ...pageInput, conflictsPage: cursor });
      expect([second.conflictsAfter, second.conflictsNextAfter, second.conflicts.length]).toEqual([50, 100, 50]);
      expect(second.reviewDigest).toBe(review.reviewDigest);
      const last = store.inspectSeriesKnowledgeReview({ ...pageInput, conflictsPage: { ...cursor, after: 2450 } });
      expect([last.conflictsAfter, last.conflictsNextAfter, last.conflicts.length]).toEqual([2450, null, 50]);
      expect(last.reviewDigest).toBe(review.reviewDigest);
      expect(wire(last)).toBeLessThan(MAX_FRAME_BYTES);
      expect(store.inspectSeriesKnowledgeReview({ ...pageInput, conflictsPage: { ...cursor, after: 0 } })).toEqual(review);
      expect(refusal(() => store.inspectSeriesKnowledgeReview({ ...pageInput, conflictsPage: { ...cursor, candidateVersion: 2 } }))).toMatch(/^SERIES_KNOWLEDGE_REVIEW_STALE:/);
      expect(refusal(() => store.inspectSeriesKnowledgeReview({ ...pageInput, conflictsPage: { ...cursor, reviewDigest: '0'.repeat(64) } }))).toMatch(/^SERIES_KNOWLEDGE_REVIEW_STALE:/);
      expect(refusal(() => store.inspectSeriesKnowledgeReview({ ...pageInput, conflictsPage: { ...cursor, after: 2501 } }))).toMatch(/^SERIES_CURSOR_INVALID:/);
    });
    it('returns bounded promotion and conflict pages covering every disclosed conflict', async () => {
      const promoted = promote(seriesId, candidateId, 'preserved');
      expect(wire(promoted)).toBeLessThan(MAX_FRAME_BYTES);
      expect(promoted.item.current.conflictCount).toBe(2500);
      expect(promoted.item.current.conflicts).toHaveLength(50);
      const saved = { seriesId, itemId: promoted.itemId, revisionId: promoted.revisionId };
      let after: number | null = 0;
      let read = 0;
      while (after !== null) {
        const page = store.inspectSeriesKnowledgeConflicts({ ...saved, after });
        expect(wire(page)).toBeLessThan(SERIES_KNOWLEDGE_PAGE_BYTES + 1024);
        expect(page.conflicts).toHaveLength(50);
        expect(page.total).toBe(2500);
        read += page.conflicts.length;
        after = page.nextAfter;
      }
      expect(read).toBe(2500);
    }, 180_000);
    it('keeps historical conflict pages available after another revision and restart', async () => {
      const promoted = promote(seriesId, candidateId, 'preserved');
      const saved = { seriesId, itemId: promoted.itemId, revisionId: promoted.revisionId };
      const other = store.createSeries({ title: '另一个书系', note: '' });
      expect(refusal(() => store.inspectSeriesKnowledgeConflicts({ ...saved, seriesId: other.seriesId, after: 0 }))).toMatch(/^SERIES_KNOWLEDGE_ITEM_NOT_FOUND:/);
      expect(refusal(() => store.inspectSeriesKnowledgeConflicts({ ...saved, revisionId: randomUUID(), after: 0 }))).toMatch(/^SERIES_KNOWLEDGE_ITEM_NOT_FOUND:/);
      expect(refusal(() => store.inspectSeriesKnowledgeConflicts({ ...saved, after: 2501 }))).toMatch(/^SERIES_CURSOR_INVALID:/);
      const next = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId: promoted.itemId }, content: '后来的版本', span: null });
      const updated = promote(seriesId, next.candidateId, 'preserved');
      expect(updated.revisionId).not.toBe(saved.revisionId);
      expect(wire(store.inspectSeriesKnowledgeRevisions(seriesId, promoted.itemId, null))).toBeLessThan(MAX_FRAME_BYTES);
      expect(store.inspectSeriesKnowledgeConflicts({ ...saved, after: 2450 }).conflicts).toHaveLength(50);
      await restartStore();
      const old = store.inspectSeriesKnowledgeConflicts({ ...saved, after: 2450 });
      expect([old.revisionId, old.total, old.conflicts.length, old.nextAfter]).toEqual([saved.revisionId, 2500, 50, null]);
    }, 180_000);
    it('refuses an off-page conflict rewritten with a recomputed digest', async () => {
      const promoted = promote(seriesId, candidateId, 'preserved');
      const saved = { seriesId, itemId: promoted.itemId, revisionId: promoted.revisionId };
      closeStore();
      withDatabase((database) => {
        // An old, off-page row is still checked, even if its own digest is recomputed: the revision binds the complete ordered set.
        database.exec('DROP TRIGGER series_knowledge_conflicts_no_update');
        const child = database.prepare('SELECT canonical_json FROM series_knowledge_conflicts WHERE revision_id = ? AND ordinal = 2400').get(saved.revisionId) as { canonical_json: string };
        const changed = canonicalRecord({ ...JSON.parse(child.canonical_json), line: '改写的冲突行' });
        database.prepare('UPDATE series_knowledge_conflicts SET line = ?, canonical_json = ?, sha256 = ? WHERE revision_id = ? AND ordinal = 2400')
          .run('改写的冲突行', changed.json, changed.digest, saved.revisionId);
        database.exec(SERIES_KNOWLEDGE_TRIGGER_SQL.series_knowledge_conflicts_no_update!);
      });
      await openStore();
      expect(refusal(() => store.inspectSeriesKnowledgeConflicts({ ...saved, after: 0 }))).toMatch(/^SERIES_KNOWLEDGE_RECORD_INVALID:/);
    }, 180_000);
  });
  it('rolls a refused promotion back so the same review can be retried', async () => {
    const seriesId = store.createSeries({ title: '原子纳入', note: '' }).seriesId;
    const input = { seriesId, target: { kind: 'new' as const, subject: '同名', knowledgeClass: 'canon' as const }, content: '候选内容', span: null };
    const proposed = store.proposeSeriesKnowledge(input);
    store.proposeSeriesKnowledge(input);
    const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: proposed.candidateId });
    withDatabase((database) => database.exec("CREATE TRIGGER refuse_test_promotion BEFORE INSERT ON series_knowledge_promotions BEGIN SELECT RAISE(ABORT, 'TEST_REFUSAL'); END"));
    const promotion = { seriesId, candidateId: proposed.candidateId, candidateVersion: 1, reviewDigest: review.reviewDigest,
      reuseScope: 'series-tasks' as const, conflictDisposition: 'preserved' as const };
    expect(() => store.promoteSeriesKnowledge(promotion)).toThrow();
    expect(store.inspectSeries(seriesId).knowledge).toMatchObject({ itemCount: 0, candidateCount: 2 });
    withDatabase((database) => database.exec('DROP TRIGGER refuse_test_promotion'));
    expect(store.promoteSeriesKnowledge(promotion).item.current.conflictCount).toBe(1);
  }, 120_000);
  it('keeps conflict rows immutable and bound to an existing revision', async () => {
    const seriesId = store.createSeries({ title: '不可改写', note: '' }).seriesId;
    const input = { seriesId, target: { kind: 'new' as const, subject: '同名', knowledgeClass: 'canon' as const }, content: EDITOR_WORDS, span: null };
    const candidate = store.proposeSeriesKnowledge(input);
    store.proposeSeriesKnowledge(input);
    promote(seriesId, candidate.candidateId, 'preserved');
    withDatabase((database) => {
      database.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
      database.prepare('INSERT INTO series_knowledge_conflicts(revision_id, ordinal, kind, line, canonical_json, sha256) VALUES (?, 1, ?, ?, ?, ?)')
        .run(randomUUID(), 'existing-item', '孤立冲突', '{}', 'f'.repeat(64));
      expect(() => database.exec('COMMIT')).toThrow();
      database.exec('ROLLBACK');
      expect(() => database.exec('DELETE FROM series_knowledge_conflicts')).toThrowError(/SERIES_KNOWLEDGE_LEDGER_IMMUTABLE/u);
    });
    expect(store.inspectSeries(seriesId).knowledge.itemCount).toBe(1);
  });
  it('keeps saved-revision provenance checkpoint-relative across later edits, saves and restart', async () => {
    const member = await importBook(store, MEMBER);
    const seriesId = store.createSeries({ title: '来源边界', note: '' }).seriesId;
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
    const dirtyId = dirty.candidate.candidateId;
    expect(dirty.candidate.provenance?.uncheckpointed).toBe(true);
    await store.saveMilestone(member.manuscriptId, member.branchId, '来源修订', 'stage-archive', null, '');
    const saved = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '已存来源', knowledgeClass: 'canon' },
      content: '保存后提议', span: span(store, member) });
    const savedId = saved.candidate.candidateId;
    expect(saved.candidate.provenance!.journalSequence).toBeGreaterThan(0);
    expect(saved.candidate.provenance!.uncheckpointed).toBe(false);
    edit();
    // An edit after the citation does not make the already saved citation unsaved.
    expect(store.inspectSeriesKnowledgeReview({ seriesId, candidateId: savedId }).candidate.provenance?.uncheckpointed).toBe(false);
    await store.saveMilestone(member.manuscriptId, member.branchId, '再存修订', 'stage-archive', null, '');
    // A later save does not erase the journal suffix the older dirty citation actually named.
    expect(store.inspectSeriesKnowledgeReview({ seriesId, candidateId: dirtyId }).candidate.provenance?.uncheckpointed).toBe(true);
    await restartStore();
    expect(store.inspectSeriesKnowledgeReview({ seriesId, candidateId: savedId }).candidate.provenance?.uncheckpointed).toBe(false);
    expect(store.inspectSeriesKnowledgeReview({ seriesId, candidateId: dirtyId }).candidate.provenance?.uncheckpointed).toBe(true);
  }, 180_000);
  describe('candidate review and promotion', () => {
    let member: Imported;
    let outsider: Imported;
    let seriesId: string;
    const newItem = { kind: 'new' as const, subject: '林默', knowledgeClass: 'characters' as const };
    const contentDigest = (content: string) => createHash('sha256').update(content).digest('hex');
    const candidatesById = () => new Map(store.inspectSeries(seriesId).knowledge.candidates
      .map((candidate) => [candidate.candidateId, [candidate.target.kind, candidate.target.subject, contentDigest(candidate.content), candidate.authoring, candidate.conflicts]]));
    beforeEach(async () => {
      member = await importBook(store, MEMBER);
      outsider = await importBook(store, OUTSIDER);
      seriesId = store.createSeries({ title: '星河三部曲', note: '' }).seriesId;
      join2(store, seriesId, member.bookId, 'add');
    });
    it('refuses invalid targets, words and manuscript spans without proposing knowledge', async () => {
      expect(knowledgeOf(store, seriesId)).toEqual({ items: [], candidates: [] });
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
      expect(store.inspectSeries(seriesId).knowledge).toMatchObject({ itemCount: 0, candidateCount: 0 });
    });
    describe('competing manuscript and editor candidates', () => {
      let cited: SeriesKnowledgeSpanInput;
      let fromManuscript: ReturnType<EditorialStore['proposeSeriesKnowledge']>;
      let fromEditor: ReturnType<EditorialStore['proposeSeriesKnowledge']>;
      beforeEach(() => {
        cited = span(store, member);
        fromManuscript = store.proposeSeriesKnowledge({ seriesId, target: newItem, content: cited.selectedText, span: cited });
        fromEditor = store.proposeSeriesKnowledge({ seriesId, target: { ...newItem, subject: ' 林 默 ' }, content: EDITOR_WORDS, span: null });
      });
      it('proposes manuscript and editor candidates with their provenance and competing identity', async () => {
        expect(fromManuscript.completionLabel).toBe('已提议为书系「星河三部曲」的知识候选项');
        // The answer is the candidate alone (Issue #63 review).
        expect([fromEditor.candidate.candidateId, fromEditor.candidate.target.subject, fromEditor.candidate.conflicts]).toEqual([fromEditor.candidateId, '林 默', 1]);
        expect(knowledgeOf(store, seriesId).items).toEqual([]);
        expect(store.inspectSeries(seriesId).knowledge.candidates.length).toBe(2);
        expect(candidatesById()).toEqual(new Map([
          [fromManuscript.candidateId, ['new', '林默', contentDigest(cited.selectedText), 'manuscript-revision', 1]],
          [fromEditor.candidateId, ['new', '林 默', contentDigest(EDITOR_WORDS), 'editor', 1]],
        ]));
        const provenance = store.inspectSeries(seriesId).knowledge.candidates.find((candidate) => candidate.candidateId === fromManuscript.candidateId)!.provenance!;
        expect([provenance.bookTitle, provenance.revisionLabel, provenance.blockId, provenance.fromGrapheme, provenance.toGrapheme, provenance.quote === cited.selectedText, provenance.uncheckpointed])
          .toEqual(['书系成员', 'r1', cited.blockId, 0, 6, true, false]);
      });
      it('discloses conflicts and requires their disposition against the exact review', async () => {
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
        expect(store.inspectSeries(seriesId).knowledge.itemCount).toBe(0);
      });
      let created: ReturnType<EditorialStore['promoteSeriesKnowledge']>;
      let late: ReturnType<EditorialStore['proposeSeriesKnowledge']>;
      let lateReview: ReturnType<EditorialStore['inspectSeriesKnowledgeReview']>;
      let pending: ReturnType<EditorialStore['proposeSeriesKnowledge']>;
      function promoteManuscript(): void {
        const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: fromManuscript.candidateId });
        created = store.promoteSeriesKnowledge({ seriesId, candidateId: fromManuscript.candidateId, candidateVersion: 1,
          reviewDigest: review.reviewDigest, reuseScope: 'consistency-review', conflictDisposition: 'preserved' });
      }
      function prepareUpdatedItem(): void {
        promoteManuscript();
        store.editSeriesKnowledgeCandidate({ seriesId, candidateId: fromEditor.candidateId, expectedVersion: 1,
          target: { kind: 'existing', itemId: created.itemId }, content: EDITOR_WORDS });
      }
      function prepareLateReview(): void {
        prepareUpdatedItem();
        promote(seriesId, fromEditor.candidateId);
        late = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId: created.itemId }, content: CHANGED_WORDS, span: null });
        lateReview = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: late.candidateId });
      }
      function prepareLeavingCandidate(): void {
        prepareLateReview();
        const rival = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId: created.itemId }, content: '林默的年龄不再写明。', span: null });
        promote(seriesId, rival.candidateId, 'preserved');
        pending = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '海边小城', knowledgeClass: 'places' }, content: cited.selectedText, span: span(store, member) });
      }
      it('creates one knowledge revision retaining the chosen scope and disclosed conflict', async () => {
        promoteManuscript();
        expect(created.completionLabel).toBe('书系知识已纳入');
        expect(knowledgeOf(store, seriesId)).toEqual({ items: [['林默', '人物', [[1, 'created', 1, 'consistency-review']]]], candidates: [['new', '林 默', 'editor', 1]] });
        // The answer is the item alone, with its current revision and how many it holds.
        expect([created.item.itemId, created.item.revisionCount, created.item.current.ordinal]).toEqual([created.itemId, 1, 1]);
        const first = created.item.current;
        expect([first.authoring, first.provenance?.quote === cited.selectedText, first.conflicts[0]!.kind, first.reuseLabel])
          .toEqual(['manuscript-revision', true, 'competing-candidate', '只用于书系一致性审阅']);
        expect(refusal(() => store.inspectSeriesKnowledgeReview({ seriesId, candidateId: fromManuscript.candidateId }))).toBe('SERIES_KNOWLEDGE_ALREADY_PROMOTED:这个候选项已经纳入书系知识。');
      });
      it('retargets the editor candidate while refusing unchanged and stale edits', async () => {
        promoteManuscript();
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
      });
      it('updates the item without a conflict disposition after the candidate is retargeted', async () => {
        prepareUpdatedItem();
        const edited = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: fromEditor.candidateId });
        const settled = { seriesId, candidateId: fromEditor.candidateId, candidateVersion: 2, reviewDigest: edited.reviewDigest, reuseScope: 'series-tasks' as const };
        expect(refusal(() => store.promoteSeriesKnowledge({ ...settled, conflictDisposition: 'preserved' }))).toBe('SERIES_KNOWLEDGE_DISPOSITION_INVALID:没有已披露的冲突可以保留。');
        const updated = store.promoteSeriesKnowledge({ ...settled, conflictDisposition: 'none' });
        expect(updated.completionLabel).toBe('书系知识已更新');
        expect(knowledgeOf(store, seriesId)).toEqual({ items: [['林默', '人物', [[2, 'updated', 0, 'series-tasks'], [1, 'created', 1, 'consistency-review']]]], candidates: [] });
      });
      it('refuses promotion against a review the item has moved past', async () => {
        prepareLateReview();
        expect(lateReview.conflicts).toEqual([]);
        const rival = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId: created.itemId }, content: '林默的年龄不再写明。', span: null });
        const rivalReview = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: rival.candidateId });
        expect(rivalReview.conflicts.map((entry) => entry.kind)).toEqual(['competing-candidate']);
        store.promoteSeriesKnowledge({ seriesId, candidateId: rival.candidateId, candidateVersion: 1, reviewDigest: rivalReview.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'preserved' });
        expect(refusal(() => store.promoteSeriesKnowledge({ seriesId, candidateId: late.candidateId, candidateVersion: 1, reviewDigest: lateReview.reviewDigest, reuseScope: 'series-tasks', conflictDisposition: 'none' })))
          .toBe('SERIES_KNOWLEDGE_REVIEW_STALE:候选项、条目或冲突在审阅之后有了变化；请重新审阅。');
        expect(store.inspectSeriesKnowledgeReview({ seriesId, candidateId: late.candidateId }).conflicts[0]!.line).toBe('「林默」在提议之后已更新为第 3 版。');
      });
      it('holds manuscript knowledge back on removal and offers review again on rejoining', async () => {
        prepareLeavingCandidate();
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
      });
      it('retains promoted revisions and remaining candidates across restart', async () => {
        prepareLeavingCandidate();
        join2(store, seriesId, member.bookId, 'remove');
        const remainingCandidates = new Map([
          [late.candidateId, ['existing', '林默', contentDigest(CHANGED_WORDS), 'editor', 1]],
          [pending.candidateId, ['new', '海边小城', contentDigest(cited.selectedText), 'manuscript-revision', 0]],
        ]);
        await restartStore();
        expect(knowledgeOf(store, seriesId).items).toEqual([
          ['林默', '人物', [[3, 'updated', 1, 'series-tasks'], [2, 'updated', 0, 'series-tasks'], [1, 'created', 1, 'consistency-review']]],
        ]);
        expect(candidatesById()).toEqual(remainingCandidates);
        expect(store.inspectSeries(seriesId).knowledge.candidateCount).toBe(2);
      });
      it('refuses a rewritten historical revision while preserving ledger immutability', async () => {
        prepareLeavingCandidate();
        join2(store, seriesId, member.bookId, 'remove');
        closeStore();
        withDatabase((database) => {
          for (const table of TABLES) expect(() => database.exec(`DELETE FROM ${table}`)).toThrowError(/SERIES_KNOWLEDGE_LEDGER_IMMUTABLE/u);
          expect(() => database.exec("UPDATE series_knowledge_revisions SET content = '改过'")).toThrowError(/SERIES_KNOWLEDGE_LEDGER_IMMUTABLE/u);
          database.exec('DROP TRIGGER series_knowledge_revisions_no_update');
          const row = database.prepare('SELECT revision_id, canonical_json FROM series_knowledge_revisions WHERE ordinal = 2').get() as { revision_id: string; canonical_json: string };
          const rewritten = row.canonical_json.replace(JSON.stringify(EDITOR_WORDS), JSON.stringify(CHANGED_WORDS));
          database.prepare('UPDATE series_knowledge_revisions SET canonical_json = ?, sha256 = ? WHERE revision_id = ?')
            .run(rewritten, createHash('sha256').update(rewritten).digest('hex'), row.revision_id);
          database.exec(SERIES_KNOWLEDGE_TRIGGER_SQL.series_knowledge_revisions_no_update!);
        });
        await openStore();
        expect(refusal(() => store.inspectSeries(seriesId))).toBe('SERIES_KNOWLEDGE_RECORD_INVALID:书系知识记录已损坏。');
      });
    });
  });
  it('adds revision 53 to a revision-52 store with nothing else moved', async () => {
    store.createSeries({ title: '早先的书系', note: '' });
    closeStore();
    const schemaOf = (database: DatabaseSync): Array<{ name: string; sql: string }> =>
      database.prepare("SELECT name, sql FROM sqlite_schema WHERE type IN ('table', 'trigger', 'index') AND sql IS NOT NULL ORDER BY name").all() as Array<{ name: string; sql: string }>;
    const before = withDatabase((plant) => {
      execPre74Fixture(plant, `DROP TABLE analysis_outcome_resolutions; DROP TABLE material_index_segments; DROP TABLE material_index_builds; DROP TABLE writing_drafts; DROP TABLE writing_tasks; DROP TABLE evaluation_rewrite_decisions; DROP TABLE evaluation_rewrite_tasks; DROP TABLE developer_capability_proposal_exports; DROP TABLE developer_capability_proposals; DROP TABLE review_run_procedure_pins; DROP TABLE captured_procedure_states; DROP TABLE captured_procedure_versions; DROP TABLE captured_procedures; DROP TABLE readers_report_drafts; DROP TABLE readers_report_tasks; DROP TABLE series_retrieval_exclusions; DROP TABLE dialogue_conversions; DROP TABLE dialogue_attempt_outcomes; DROP TABLE dialogue_harness_spans; DROP TABLE dialogue_execution_bindings; DROP TABLE dialogue_attempts; DROP TABLE dialogue_tasks; DROP TABLE evaluation_initial_drafts; DROP TABLE database_merge_books; DROP TABLE database_merges; DROP TABLE database_replacements; DROP TABLE scheduled_backup_removals; DROP TABLE scheduled_backups; DROP TABLE backup_preferences; DROP TABLE database_export_receipts; DROP TABLE database_export_approvals; DROP TABLE database_export_preparations; DROP TABLE store_versions; ${TABLES.slice().reverse().map((table) => `DROP TABLE ${table};`).join(' ')} PRAGMA user_version = ${SERIES_SCHEMA_VERSION};`);
      const before = schemaOf(plant);
      // Taken before the kind-coupled relations go back to revision 58: revision 59 rebuilds them to these exact shapes again.
      downgradeKindCoupledRelations(plant, ANALYSIS_LEDGER_REVISION_58_SQL);
      return before;
    });
    await openStore();
    const series = store.inspectSeriesList().series[0]!;
    expect(store.inspectSeries(series.seriesId).knowledge).toEqual({ items: [], itemCount: 0, itemsNext: null, candidates: [], candidateCount: 0, candidatesNext: null });
    expect(store.inspectDataVersion().schemaRevision).toBe(LATEST_SCHEMA_VERSION);
    withDatabase((database) => {
      const after = schemaOf(database);
      // Revision 54's version ledger (Issue #433, S85a) returns with it, as the planted store lacked it too.
      expect(after.filter((entry) => !/^(series_knowledge|store_versions|database_export_|backup_preferences|scheduled_backup|database_replacements|database_merge|evaluation_initial_drafts|dialogue_|series_retrieval_exclusions|readers_report_|captured_procedure|review_run_procedure_pins|developer_capability_proposal|evaluation_rewrite_|writing_|material_index_|analysis_outcome_resolutions)/u.test(entry.name))).toEqual(expectedSchema75(before));
      expect(after.filter((entry) => TABLES.includes(entry.name)).map((entry) => entry.sql))
        .toEqual(TABLES.slice().sort().map((table) => SERIES_KNOWLEDGE_SCHEMA_SQL[table as keyof typeof SERIES_KNOWLEDGE_SCHEMA_SQL]));
    });
  }, 120_000);
  describe('bounded knowledge pages', () => {
    let seriesId: string;
    let proposed: Array<ReturnType<EditorialStore['proposeSeriesKnowledge']>>;
    beforeEach(async () => {
      seriesId = store.createSeries({ title: '长篇书系', note: '' }).seriesId;
      const words = (index: number): string => `${String(index).padStart(2, '0')}${'设'.repeat(MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS - 2)}`;
      proposed = [];
      for (let index = 0; index < 35; index += 1) {
        proposed.push(store.proposeSeriesKnowledge({ seriesId,
          target: { kind: 'new', subject: `条目${String(index).padStart(2, '0')}`, knowledgeClass: 'terminology' }, content: words(index), span: null }));
        await later();
      }
    });
    it('pages all candidates once within the frame and page byte limits', async () => {
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
    });
    describe('promoted items', () => {
      beforeEach(() => { for (const entry of proposed) promote(seriesId, entry.candidateId); });
      it('pages items by name within the page byte limit', async () => {
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
      });
      it('finds a named item and refuses a query beyond the public limit', async () => {
        expect(store.inspectSeriesKnowledgeItems(seriesId, ' 条目34 ', null).items.map((item) => item.subject)).toEqual(['条目34']);
        expect(store.inspectSeriesKnowledgeItems(seriesId, '没有这个名字', null)).toEqual({ items: [], nextCursor: null });
        expect(refusal(() => store.inspectSeriesKnowledgeItems(seriesId, '名'.repeat(41), null))).toBe('SERIES_KNOWLEDGE_QUERY_INVALID:查找的条目字词最多 40 个字，写在一行里。');
      });
      it('pages revision history newest first and refuses an unknown item', async () => {
        const listed = store.inspectSeries(seriesId).knowledge;
        const itemId = listed.items[0]!.itemId;
        for (let round = 0; round < 11; round += 1) {
          const update = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId }, content: `第 ${round + 2} 次的写法`, span: null });
          promote(seriesId, update.candidateId);
        }
        const item = store.inspectSeriesKnowledgeItems(seriesId, '条目00', null).items[0]!;
        expect([item.revisionCount, item.current.ordinal]).toEqual([12, 12]);
        const newest = store.inspectSeriesKnowledgeRevisions(seriesId, itemId, null);
        expect([newest.revisions.length, newest.revisions[0]!.ordinal, newest.nextBefore]).toEqual([MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE, 12, 3]);
        const oldest = store.inspectSeriesKnowledgeRevisions(seriesId, itemId, newest.nextBefore);
        expect([oldest.revisions.map((revision) => revision.ordinal), oldest.nextBefore]).toEqual([[2, 1], null]);
        expect(refusal(() => store.inspectSeriesKnowledgeRevisions(seriesId, randomUUID(), null))).toBe('SERIES_KNOWLEDGE_ITEM_NOT_FOUND:这个书系知识条目不存在。');
      });
    });
  });
  it('bounds competing-candidate conflicts while reporting their full count', async () => {
    const seriesId = store.createSeries({ title: '同名候选', note: '' }).seriesId;
    const crowd = [];
    for (let index = 0; index < 52; index += 1) {
      crowd.push(store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '同名条目', knowledgeClass: 'canon' }, content: `第 ${index} 种说法`, span: null }));
    }
    const crowded = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: crowd[0]!.candidateId });
    expect([crowded.conflicts.length, crowded.conflictCount, crowded.conflictLabel]).toEqual([50, 51, '存在书系知识冲突 · 需要处理']);
  });
  it('marks a citation from a journal edit as uncheckpointed', async () => {
    const member = await importBook(store, MEMBER);
    const seriesId = store.createSeries({ title: '日志来源', note: '' }).seriesId;
    join2(store, seriesId, member.bookId, 'add');
    const window = store.getManuscriptWindow(member.manuscriptId, member.branchId, null);
    const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 20)!;
    store.flushJournalEdit({
      clientEditId: randomUUID(), manuscriptId: member.manuscriptId, branchId: member.branchId, baseRevisionId: window.revisionId, blockId: block.blockId,
      windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
      fromGrapheme: 0, toGrapheme: 0, insertText: '〔改动〕',
    });
    const changed = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '改动之后', knowledgeClass: 'canon' }, content: '〔改动〕', span: span(store, member) });
    expect(changed.candidate.provenance?.uncheckpointed).toBe(true);
  });
  describe('deep candidate and revision chains', () => {
    let seriesId: string;
    let itemId: string;
    let pendingId: string;
    let sourceId: string;
    beforeEach(() => {
      seriesId = store.createSeries({ title: '深层版本书系', note: '' }).seriesId;
      const first = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '沿革', knowledgeClass: 'canon' }, content: '初始候选', span: null });
      sourceId = first.candidateId;
      for (let version = 1; version < 66; version += 1) {
        store.editSeriesKnowledgeCandidate({ seriesId, candidateId: sourceId, expectedVersion: version,
          target: { kind: 'new', subject: '沿革', knowledgeClass: 'canon' }, content: '候选版本' + (version + 1) });
      }
      itemId = promote(seriesId, sourceId).itemId;
      pendingId = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId }, content: '基于第一版的待审候选', span: null }).candidateId;
      for (let ordinal = 2; ordinal <= 66; ordinal += 1) {
        const next = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId }, content: '条目版本' + ordinal, span: null });
        promote(seriesId, next.candidateId, 'preserved');
      }
    });
    it('streams all revisions and retains historical targets and pages across restart', async () => {
      expect(withDatabase((database) => new SeriesKnowledgeLedger(database).candidate(sourceId)?.version)).toBe(66);
      expect(store.inspectSeriesKnowledgeReview({ seriesId, candidateId: pendingId }).candidate.target.baseRevisionOrdinal).toBe(1);
      const ordinals: number[] = [];
      let before: number | null = null;
      do {
        const page = store.inspectSeriesKnowledgeRevisions(seriesId, itemId, before);
        expect(page.revisions.length).toBeLessThanOrEqual(MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE);
        ordinals.push(...page.revisions.map((revision) => revision.ordinal));
        before = page.nextBefore;
      } while (before !== null);
      expect(ordinals).toEqual(Array.from({ length: 66 }, (_, index) => 66 - index));
      await restartStore();
      const item = store.inspectSeriesKnowledgeItems(seriesId, '', null).items[0]!;
      expect([item.current.ordinal, item.revisionCount]).toEqual([66, 66]);
      const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: pendingId });
      expect([review.candidate.target.baseRevisionOrdinal, review.current?.ordinal]).toEqual([1, 66]);
    }, 300_000);
    it('refuses a candidate whose off-page historical version was rewritten', async () => {
      closeStore();
      withDatabase((database) => {
        database.exec('DROP TRIGGER series_knowledge_candidates_no_update');
        database.prepare('UPDATE series_knowledge_candidates SET content = ? WHERE candidate_id = ? AND version = 2').run('旧版本损坏', sourceId);
        database.exec(SERIES_KNOWLEDGE_TRIGGER_SQL.series_knowledge_candidates_no_update!);
      });
      await openStore();
      expect(refusal(() => store.inspectSeriesKnowledgeReview({ seriesId, candidateId: sourceId }))).toBe('SERIES_KNOWLEDGE_RECORD_INVALID:书系知识记录已损坏。');
    }, 300_000);
  });
});
