import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { learningRemediationPreview } from '../../src/service/learning-eligibility.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { MAX_LEARNING_AUDIT_PAGE } from '../../src/shared/protocol.js';
import type {
  CreateEditorialMarkInput,
  LearningAuditMaterialProjection,
  LearningMaterialProjection,
  ManuscriptWindowProjection,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 质量与学习 › 学习回溯 (Issue #62, plan slice S27a; V2-UX-LAUD-001 to LAUD-012) over the
// real store: the Book-grouped audit list and its filters, the Learning Lineage Explorer's whole decision chain, and
// 停止今后使用 — preview, digest-bound record, batch drift — appending to the eligibility ledger and deleting nothing. The
// manuscript is composed from the one admitted SampleBook; suggestions and reasons are the suite's own words.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '回溯组稿' };

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-learning-audit-');
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore, name: string, startBlock: number, title: string): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${name}.docx`);
  await composeManuscriptDocx(selectedPath, { ...EXCERPT, startBlock, title });
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: title }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** Rejects `count` suggestions of the Book, each with its own reason: `count` Learning Materials, oldest first. */
function rejectWithReasons(store: EditorialStore, book: Imported, reasons: ReadonlyArray<string>): void {
  const window: ManuscriptWindowProjection = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 60)!;
  const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId };
  reasons.forEach((reason, index) => {
    const input: CreateEditorialMarkInput = {
      ...binding, clientMarkId: randomUUID(), baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence,
      blockId: block.blockId, baseBlockDigest: block.digest, fromGrapheme: index, toGrapheme: index + 1,
      selectedText: graphemesOf(block.text).slice(index, index + 1).join(''), kind: 'change-suggestion', highlightColor: null,
      body: '', proposedText: `回溯建议${index}`, rationale: '回溯检查',
    };
    const markId = store.createEditorialMark(input).markId;
    store.recordChangeSuggestionDecision({ ...binding, markId, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason });
  });
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

const itemOf = (material: Pick<LearningMaterialProjection, 'materialKey' | 'digest' | 'decisions'>) =>
  ({ materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: material.decisions });

describe('学习回溯 over the real store', () => {
  it('lists every Book’s material grouped by Book with where it stands, filters before paging, and says nothing used it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const first = await importBook(store, 'first', 1, '回溯甲');
      const second = await importBook(store, 'second', 41, '回溯乙');
      rejectWithReasons(store, first, ['甲原因零', '甲原因一', '甲原因二']);
      rejectWithReasons(store, second, ['乙原因零']);
      store.updateBookPeople({ bookId: first.bookId, expectedVersion: 0, authors: ['周一'], editors: ['郑三'], related: [] });
      const [a0, a1] = store.inspectLearningMaterials(first.bookId).books[0]!.materials as [LearningMaterialProjection, LearningMaterialProjection];
      const decide = (material: LearningMaterialProjection, choice: 'book' | 'house' | 'excluded' | 'deferred') => store.decideLearningMaterial({
        bookId: first.bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: material.decisions, choice, note: null,
      });
      decide(a0, 'book');
      decide(a1, 'house');

      const all = store.inspectLearningAudit();
      expect(all.nextCursor).toBeNull();
      // The filters' choices come with the page (Issue #677): every Book of the house by title, and its Series.
      expect(all.choices).toEqual({
        books: [{ bookId: second.bookId, title: '回溯乙' }, { bookId: first.bookId, title: '回溯甲' }],
        booksListed: 2,
        booksTruncated: false,
        series: [],
        seriesTruncated: false,
        seriesUnavailable: false,
      });
      // A Book the filter names that is already listed is not listed twice.
      expect(store.inspectLearningAudit({ bookId: first.bookId }).choices).toEqual(all.choices);
      expect(all.books.map((book) => [book.title, book.authors, book.editors, book.materialCount, book.materials.map((material) => material.standing)])).toEqual([
        ['回溯乙', [], [], 1, ['pending']],
        ['回溯甲', ['周一'], ['郑三'], 3, ['book', 'house', 'pending']],
      ]);
      const listed = all.books[1]!.materials[0]!;
      expect(listed).toMatchObject({ materialKey: a0.materialKey, kind: 'proposal-decision', digest: a0.digest, originLabel: '修改建议 · 拒绝', decisions: 1, downstreamTasks: 0 });
      expect(listed.decidedAt).not.toBeNull();
      expect(listed.excerpt.at(-1)).toBe('你的原因：甲原因零');

      // Each filter runs over every material, and a Book's count is of what matches.
      const standings = (input: Parameters<EditorialStore['inspectLearningAudit']>[0]) =>
        store.inspectLearningAudit(input).books.map((book) => [book.title, book.materialCount, book.materials.map((material: LearningAuditMaterialProjection) => material.standing)]);
      expect(standings({ standing: 'house' })).toEqual([['回溯甲', 1, ['house']]]);
      expect(standings({ standing: 'pending' })).toEqual([['回溯乙', 1, ['pending']], ['回溯甲', 1, ['pending']]]);
      expect(standings({ bookId: second.bookId })).toEqual([['回溯乙', 1, ['pending']]]);
      expect(standings({ kind: 'analysis-feedback' })).toEqual([]);
      expect(standings({ query: '甲原因二' })).toEqual([['回溯甲', 1, ['pending']]]);
      expect(standings({ query: '  修改建议 · 拒绝 ' })).toEqual([['回溯乙', 1, ['pending']], ['回溯甲', 3, ['book', 'house', 'pending']]]);
      expect(standings({ recordedFrom: new Date(Date.now() + 60_000).toISOString() })).toEqual([]);
      expect(standings({ recordedBefore: new Date(Date.now() + 60_000).toISOString(), standing: 'book' })).toEqual([['回溯甲', 1, ['book']]]);
      // A Series names the Books it holds now; one with none lists nothing, and an unknown Series is refused.
      const seriesId = store.createSeries({ title: '回溯书系', note: '' }).seriesId;
      expect(standings({ seriesId })).toEqual([]);
      const preview = store.previewSeriesMembershipChange({ seriesId, bookId: second.bookId, kind: 'add' });
      store.changeSeriesMembership({ seriesId, bookId: second.bookId, kind: 'add', previewDigest: preview.previewDigest });
      expect(standings({ seriesId })).toEqual([['回溯乙', 1, ['pending']]]);
      // A filter narrows the page, never the choices: every Book and the new Series are still offered.
      const filtered = store.inspectLearningAudit({ seriesId, standing: 'house' });
      expect(filtered.books).toEqual([]);
      expect(filtered.choices).toEqual({ ...all.choices, series: [{ seriesId, title: '回溯书系' }] });
      expect(refusal(() => store.inspectLearningAudit({ seriesId: randomUUID() }))).toBe('SERIES_NOT_FOUND');
      expect(refusal(() => store.inspectLearningAudit({ bookId: 'not-a-book' }))).toBe('BOOK_INVALID');
      // A Book that does not exist — a remembered filter's, gone since — is refused as a missing Series is, never answered
      // with an empty page (Issue #677).
      expect(refusal(() => store.inspectLearningAudit({ bookId: randomUUID() }))).toBe('BOOK_NOT_FOUND');
      expect(refusal(() => store.inspectLearningAudit({ bookId: randomUUID(), standing: 'pending' }))).toBe('BOOK_NOT_FOUND');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  });

  it('pages a long list by the 学习准入 order, every filter before the cut, the Book repeated at the top of the next page', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store, 'paged', 1, '回溯分页');
      rejectWithReasons(store, book, Array.from({ length: MAX_LEARNING_AUDIT_PAGE + 3 }, (_, index) => `分页原因${index}`));
      const first = store.inspectLearningAudit({ query: '分页原因' });
      expect(first.books.map((entry) => [entry.materialCount, entry.materials.length])).toEqual([[MAX_LEARNING_AUDIT_PAGE + 3, MAX_LEARNING_AUDIT_PAGE]]);
      expect(first.nextCursor).not.toBeNull();
      const second = store.inspectLearningAudit({ query: '分页原因', after: first.nextCursor });
      expect(second.books.map((entry) => [entry.title, entry.materialCount, entry.materials.length])).toEqual([['回溯分页', MAX_LEARNING_AUDIT_PAGE + 3, 3]]);
      expect(second.nextCursor).toBeNull();
      const keys = [...first.books[0]!.materials, ...second.books[0]!.materials].map((material) => material.materialKey);
      expect(keys).toEqual(store.inspectLearningMaterials(book.bookId).books[0]!.materials.map((material) => material.materialKey).concat(
        store.inspectLearningMaterials(book.bookId, store.inspectLearningMaterials(book.bookId).nextCursor).books[0]!.materials.map((material) => material.materialKey)));
      expect(new Set(keys).size).toBe(MAX_LEARNING_AUDIT_PAGE + 3);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  });

  it('stops future use only against the exact preview, appends one superseding exclusion, and re-inclusion appends again', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Imported;
    let key: string;
    let lineageBefore: ReturnType<EditorialStore['inspectLearningLineage']>;
    try {
      book = await importBook(store, 'remedy', 1, '回溯补救');
      rejectWithReasons(store, book, ['补救原因零', '补救原因一', '补救原因二', '补救原因三']);
      store.updateBookPeople({ bookId: book.bookId, expectedVersion: 0, authors: ['周一'], editors: ['郑三'], related: [] });
      const materials = () => store.inspectLearningMaterials(book.bookId).books[0]!.materials as LearningMaterialProjection[];
      const decide = (material: LearningMaterialProjection, choice: 'book' | 'house' | 'excluded' | 'deferred') => store.decideLearningMaterial({
        bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: material.decisions, choice, note: null,
      });
      const [m0, m1, m2, m3] = materials() as [LearningMaterialProjection, LearningMaterialProjection, LearningMaterialProjection, LearningMaterialProjection];
      key = m0.materialKey;
      decide(m0, 'book');
      decide(m1, 'book');
      decide(m2, 'house');
      const historyBefore = store.inspectFeedbackHistory();

      // The explorer: the material, its one decision, and nothing downstream, since nothing reads learning material yet.
      const lineage = store.inspectLearningLineage(book.bookId, key);
      expect([lineage.bookTitle, lineage.standing, lineage.earlierDecisions, lineage.downstream]).toEqual(['回溯补救', 'book', 0,
        { signals: 0, memoryCandidates: 0, activeMemories: 0, tasks: 0 }]);
      expect(lineage.decisions.map((entry) => [entry.ordinal, entry.choice, entry.superseded, entry.currentVersion, entry.via, entry.attribution])).toEqual([
        [1, 'book', false, true, 'learning-eligibility', { peopleVersion: 1, authors: ['周一'], editors: ['郑三'] }],
      ]);
      expect(lineage.decisions[0]!.audit).toMatchObject({ materialDigest: lineage.material.digest, supersedes: null, remediationPreview: null,
        basis: 'ai7.learning-eligibility-policy@1 · recommendation-only' });

      // A batch over one Book: the first included sets the scope and kind; the others are left out and named with why.
      const current = materials();
      const preview = store.previewLearningRemediation({ bookId: book.bookId, items: [
        itemOf(current[0]!), itemOf(current[1]!), itemOf(current[2]!), itemOf(current[3]!), itemOf(current[0]!),
        { materialKey: `proposal-decision:${randomUUID()}`, materialDigest: '0'.repeat(64), expectedDecisions: 0 },
      ] });
      expect([preview.bookTitle, preview.scope, preview.kind, preview.included.map((entry) => entry.materialKey)]).toEqual(['回溯补救', 'book', 'proposal-decision', [m0.materialKey, m1.materialKey]]);
      expect(preview.leftOut.map((entry) => [entry.originLabel, entry.reason])).toEqual([
        ['修改建议 · 拒绝', 'different-scope'], ['修改建议 · 拒绝', 'not-included'], [null, 'duplicate'], [null, 'not-found'],
      ]);
      expect(preview.leftOut.slice(0, 3).map((entry) => entry.materialKey)).toEqual([m2.materialKey, m3.materialKey, m0.materialKey]);
      expect(preview.groups).toEqual({ future: 2, running: 0, memory: 0, completed: 0, decisionsKept: 2 });
      expect(preview.previewDigest).toMatch(/^[0-9a-f]{64}$/u);
      // A preview is a read: asking again answers the same, digest included.
      expect(store.previewLearningRemediation({ bookId: book.bookId, items: [
        itemOf(current[0]!), itemOf(current[1]!), itemOf(current[2]!), itemOf(current[3]!), itemOf(current[0]!),
        { materialKey: preview.leftOut[3]!.materialKey, materialDigest: '0'.repeat(64), expectedDecisions: 0 },
      ] })).toEqual(preview);

      // A material read at a decision count it no longer holds is left out as changed, never coerced.
      const stale = store.previewLearningRemediation({ bookId: book.bookId, items: [{ ...itemOf(current[0]!), expectedDecisions: 0 }, itemOf(current[1]!)] });
      expect([stale.included.map((entry) => entry.materialKey), stale.leftOut.map((entry) => entry.reason)]).toEqual([[m1.materialKey], ['changed']]);

      // Recorded against a preview that moved since: refused, and nothing is appended.
      const single = store.previewLearningRemediation({ bookId: book.bookId, items: [itemOf(current[0]!), itemOf(current[1]!)] });
      decide(current[1]!, 'house');
      expect(refusal(() => store.recordLearningRemediation({ bookId: book.bookId, items: [itemOf(current[0]!), itemOf(current[1]!)], previewDigest: single.previewDigest })))
        .toBe('LEARNING_REMEDIATION_PREVIEW_STALE');
      expect(store.inspectLearningLineage(book.bookId, key).decisions).toHaveLength(1);
      // A preview that includes nothing records nothing.
      const none = store.previewLearningRemediation({ bookId: book.bookId, items: [itemOf(current[3]!)] });
      expect(refusal(() => store.recordLearningRemediation({ bookId: book.bookId, items: [itemOf(current[3]!)], previewDigest: none.previewDigest })))
        .toBe('LEARNING_REMEDIATION_EMPTY');
      expect(refusal(() => store.previewLearningRemediation({ bookId: book.bookId, items: [] }))).toBe('LEARNING_REMEDIATION_INVALID');

      // The exact preview: one superseding `excluded` decision per included material, named against it.
      const fresh = materials();
      const items = [itemOf(fresh[0]!), itemOf(fresh[1]!)];
      const exact = store.previewLearningRemediation({ bookId: book.bookId, items });
      expect([exact.included.map((entry) => entry.materialKey), exact.leftOut.map((entry) => entry.reason)]).toEqual([[m0.materialKey], ['different-scope']]);
      const outcome = store.recordLearningRemediation({ bookId: book.bookId, items, previewDigest: exact.previewDigest });
      expect(outcome).toEqual({ bookId: book.bookId, recorded: exact.included, leftOut: exact.leftOut });
      const after = store.inspectLearningLineage(book.bookId, key);
      expect([after.standing, after.material.state, after.material.decision?.choice, after.material.decisions]).toEqual(['excluded', 'decided', 'excluded', 2]);
      expect(after.decisions.map((entry) => [entry.ordinal, entry.choice, entry.superseded, entry.via])).toEqual([
        [1, 'book', true, 'learning-eligibility'], [2, 'excluded', false, 'learning-audit'],
      ]);
      expect(after.decisions[1]!.audit).toMatchObject({ supersedes: after.decisions[0]!.decisionId, remediationPreview: exact.previewDigest });
      // The originating feedback is untouched (LAUD-009), and the same preview cannot be recorded twice.
      expect(store.inspectFeedbackHistory()).toEqual(historyBefore);
      expect(refusal(() => store.recordLearningRemediation({ bookId: book.bookId, items, previewDigest: exact.previewDigest }))).toBe('LEARNING_REMEDIATION_PREVIEW_STALE');

      // Re-inclusion appends a third decision beside the retained exclusion.
      decide(store.inspectLearningMaterial(book.bookId, key), 'book');
      lineageBefore = store.inspectLearningLineage(book.bookId, key);
      expect(lineageBefore.decisions.map((entry) => [entry.ordinal, entry.choice, entry.superseded])).toEqual([[1, 'book', true], [2, 'excluded', true], [3, 'book', false]]);
      expect(store.inspectLearningAudit({ standing: 'excluded' }).books).toEqual([]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A restart keeps the whole chain exactly.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectLearningLineage(book!.bookId, key!)).toEqual(lineageBefore!);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  });

  it('cuts the 图书 choices at their share of the frame and still offers the Book the filter names beyond the cut (Issue #677)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // Empty Books with the longest titles a Book may carry, so the quarter-frame share binds long before the count bound.
      const created: string[] = [];
      for (let index = 0; index < 240; index += 1) {
        const creation = store.prepareBookCreation(`${String(index).padStart(3, '0')}${'书'.repeat(177)}`, null);
        created.push(store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId);
      }
      const all = store.inspectLearningAudit().choices;
      expect(all.booksTruncated).toBe(true);
      expect(all.booksListed).toBe(all.books.length);
      expect(all.booksListed).toBeLessThan(240);
      expect(all.books.map((book) => book.bookId)).toEqual(created.slice(0, all.booksListed));
      // The last Book, beyond the cut, follows the cut list when the filter names it; the count listed by title is unchanged.
      const last = created.at(-1)!;
      const filtered = store.inspectLearningAudit({ bookId: last }).choices;
      expect(filtered.books).toEqual([...all.books, { bookId: last, title: `239${'书'.repeat(177)}` }]);
      expect([filtered.booksListed, filtered.booksTruncated]).toEqual([all.booksListed, true]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);

  it('still reads with the 书系 choices left out, and says so, when a Series record is damaged (Issue #677)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let seriesId: string;
    try {
      seriesId = store.createSeries({ title: '回溯损坏书系', note: '' }).seriesId;
      expect(store.inspectLearningAudit().choices).toMatchObject({ series: [{ seriesId, title: '回溯损坏书系' }], seriesUnavailable: false });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // Rewrite the Series' name by hand: its record no longer matches it.
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const trigger = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'series_no_update'").get()!;
      db.exec('DROP TRIGGER series_no_update');
      db.exec("UPDATE series SET title = '回溯改名书系', title_key = '回溯改名书系'");
      db.exec(String(trigger.sql));
    } finally {
      db.close();
    }
    const damaged = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const code = (operation: () => unknown): unknown => {
        try {
          operation();
        } catch (error) {
          return (error as { code?: unknown }).code;
        }
        return 'no-error';
      };
      expect(code(() => damaged.inspectSeriesList())).toBe('SERIES_RECORD_INVALID');
      const audit = damaged.inspectLearningAudit();
      expect([audit.books, audit.nextCursor]).toEqual([[], null]);
      expect(audit.choices).toEqual({ books: [], booksListed: 0, booksTruncated: false, series: [], seriesTruncated: false, seriesUnavailable: true });
      // Filtering by the damaged Series itself is still refused.
      expect(code(() => damaged.inspectLearningAudit({ seriesId: seriesId! }))).toBe('SERIES_RECORD_INVALID');
      damaged.markCleanShutdown();
    } finally {
      damaged.close();
    }
  });

  it('refuses a decision chain whose remediation was rewritten to name another choice', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Imported;
    let materialKey: string;
    try {
      book = await importBook(store, 'tamper', 1, '回溯篡改');
      rejectWithReasons(store, book, ['篡改原因']);
      const material = store.inspectLearningMaterials(book.bookId).books[0]!.materials[0]!;
      materialKey = material.materialKey;
      store.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: 0, choice: 'book', note: null });
      const decided = store.inspectLearningMaterial(book.bookId, material.materialKey);
      const preview = store.previewLearningRemediation({ bookId: book.bookId, items: [itemOf(decided)] });
      store.recordLearningRemediation({ bookId: book.bookId, items: [itemOf(decided)], previewDigest: preview.previewDigest });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // Forge the second record: the same remediation, now claiming `book`. Its digest is recomputed, so only the rule catches it.
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const trigger = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'learning_eligibility_decisions_no_update'").get()!;
      db.exec('DROP TRIGGER learning_eligibility_decisions_no_update');
      const row = db.prepare('SELECT decision_id, canonical_json FROM learning_eligibility_decisions WHERE ordinal = 2').get() as { decision_id: string; canonical_json: string };
      const record = JSON.parse(row.canonical_json) as Record<string, unknown>;
      const forged = canonicalJson({ ...record, choice: 'book' });
      db.prepare('UPDATE learning_eligibility_decisions SET choice = ?, canonical_json = ?, sha256 = ? WHERE decision_id = ?').run('book', forged, sha256Hex(forged), row.decision_id);
      db.exec(String(trigger.sql));
    } finally {
      db.close();
    }
    const damaged = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(refusal(() => damaged.inspectLearningAudit())).toBe('LEARNING_ELIGIBILITY_RECORD_INVALID');
      expect(refusal(() => damaged.inspectLearningLineage(book!.bookId, materialKey!))).toBe('LEARNING_ELIGIBILITY_RECORD_INVALID');
      damaged.markCleanShutdown();
    } finally {
      damaged.close();
    }
  });
});

describe('学习补救影响预览, the pure reading', () => {
  const book = { bookId: randomUUID(), title: '纯函数' };
  const key = (index: number) => `proposal-decision:00000000-0000-4000-8000-00000000000${index}`;
  const digest = (index: number) => sha256Hex(String(index));
  const standingOf = (choice: 'book' | 'house' | 'excluded' | null, kind: 'proposal-decision' | 'review-disposition' = 'proposal-decision', state: 'decided' | 'pending' | 'changed' = 'decided') =>
    (index: number) => ({
      candidate: { kind, originLabel: `来源${index}` },
      projection: { digest: digest(index), decisions: 1, state: choice === null ? 'pending' as const : state, decision: choice === null ? null : { choice, note: null, decidedAt: '2026-10-08T00:00:00.000Z' } },
    });

  it('binds the digest to every shown fact, and leaves out a different kind', () => {
    const table = new Map([[key(1), standingOf('book')(1)], [key(2), standingOf('book', 'review-disposition')(2)], [key(3), standingOf('book', 'proposal-decision', 'changed')(3)]]);
    const items = [1, 2, 3].map((index) => ({ materialKey: key(index), materialDigest: digest(index), expectedDecisions: 1 }));
    const preview = learningRemediationPreview(book, items, (materialKey) => table.get(materialKey) ?? null);
    expect([preview.included.map((entry) => entry.originLabel), preview.leftOut.map((entry) => [entry.originLabel, entry.reason])]).toEqual([
      ['来源1'], [['来源2', 'different-kind'], ['来源3', 'not-included']],
    ]);
    // Each fact the preview shows moves its digest.
    const again = (mutate: (value: ReturnType<ReturnType<typeof standingOf>>) => void, index = 1) => {
      const changed = new Map(table);
      const entry = structuredClone(table.get(key(index))!);
      mutate(entry);
      changed.set(key(index), entry);
      return learningRemediationPreview(book, items, (materialKey) => changed.get(materialKey) ?? null).previewDigest;
    };
    expect(learningRemediationPreview(book, items, (materialKey) => table.get(materialKey) ?? null).previewDigest).toBe(preview.previewDigest);
    expect(again((entry) => { (entry.projection as { decisions: number }).decisions = 2; })).not.toBe(preview.previewDigest);
    // A chain that moved on and was read again at its new count is another preview, though every shown line reads the same.
    const later = new Map(table);
    later.set(key(1), { ...table.get(key(1))!, projection: { ...table.get(key(1))!.projection, decisions: 3 } });
    const reread = learningRemediationPreview(book, [{ ...items[0]!, expectedDecisions: 3 }, items[1]!, items[2]!], (materialKey) => later.get(materialKey) ?? null);
    expect([reread.included, reread.leftOut]).toEqual([preview.included, preview.leftOut]);
    expect(reread.previewDigest).not.toBe(preview.previewDigest);
    expect(learningRemediationPreview({ ...book, bookId: randomUUID() }, items, (materialKey) => table.get(materialKey) ?? null).previewDigest).not.toBe(preview.previewDigest);
    expect(learningRemediationPreview(book, items.slice(0, 2), (materialKey) => table.get(materialKey) ?? null).previewDigest).not.toBe(preview.previewDigest);
    expect(learningRemediationPreview(book, [items[1]!, items[0]!, items[2]!], (materialKey) => table.get(materialKey) ?? null).previewDigest).not.toBe(preview.previewDigest);
  });
});
