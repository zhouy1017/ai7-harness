import { PROCEDURE_DEFINITION_SCHEMA_SQL, PROCEDURE_DEFINITION_TRIGGER_SQL } from '../../src/service/procedures/definition-store.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, canonicalRecord, parseCanonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  DATABASE_MERGE_TRIGGER_SQL,
  DatabaseMergeError,
  MAX_MERGE_BOOKS_LISTED,
  MERGE_TABLE_POLICY,
  MERGING_BOOKS_FILE,
  mergeBooks,
  mergeIntoStoreFile,
  planMerge,
  saveStoreFiles,
} from '../../src/service/database-merge.js';
import { writeDatabasePackage } from '../../src/service/database-exports.js';
import { EDITORIAL_WORKSPACE_PROFILE_DIGEST } from '../../src/service/editorial-workspace-profile.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { preMergeBackupFileName, replacementStagingFor, writeMergeReceipt, type ReplacementIntent } from '../../src/service/database-replacement.js';
import { NO_EDIT_QUALITY } from '../../src/service/edit-quality-signals.js';
import { HouseReviewPreferenceLedger, type HousePreferenceSource } from '../../src/service/house-review-preference.js';
import { EDITORIAL_LEARNING_SCHEMA_SQL, EditorialLearningLedger, importBookLearningControls } from '../../src/service/learning/ledger.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { MAX_DATABASE_REPLACEMENTS_LISTED } from '../../src/shared/protocol.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';
import { J03_TASK_GOAL } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, sourceSpanText } from '../support/composed-fixture.js';
import { compileWordTrackedDocx } from '../../src/service/docx.js';
import type { WordTrackedEditSample } from '../../src/service/import-retention.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { ANALYSIS_LEDGER_REVISION_58_SQL } from '../../src/service/task-authorization.js';
import { downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { WRITING_REQUEST } from '../support/writing-task.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { FACTUAL_REVIEW_TASK_GOAL } from '../../src/shared/protocol.js';

// Service-integration suite (L2) for merging a Book (Issue #434, plan slice S86d; V2-UX-DSTO-017; ADR 0079 §1.5) over two real
// stores: a Book with a manuscript and its history, an edit, a mark, a milestone, a 发稿版本, a Production Document delivered
// and a 图书交付包 is merged into another store with every record it owns, beside a Book there of the same title; the merged
// store opens and reads the Book exactly as the store it came from; a Book already here is not taken again; and a merge that
// cannot finish leaves the store as it was. The manuscripts are composed from exact `sample1`'s paragraphs.

let roots: ServiceTestRoots;
let otherRoot: string;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-database-merge-');
  otherRoot = join(dirname(roots.dataRoot), 'other-data');
});

afterEach(async () => {
  await roots.dispose();
});

async function compose(name: string, blocks: ReadonlyArray<number>): Promise<string> {
  const path = join(roots.inputRoot, `${name}-${randomUUID()}.docx`);
  await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: name, paragraphs: blocks.map((block) => ({ runs: [{ text: { block } }] })) });
  return path;
}

async function importBook(store: EditorialStore, path: string): Promise<{ bookId: string; manuscriptId: string; branchId: string }> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

async function importSource(store: EditorialStore, bookId: string, path: string): Promise<string> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
    { kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: null });
  const commitId = randomUUID();
  const commit = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return commit.sourceVersionId;
}

function emptyBook(store: EditorialStore, title: string, internalNumber: string | null = null): string {
  const creation = store.prepareBookCreation(title, internalNumber);
  return store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
}

const TITLE = '合并组稿';

/** A Book with a manuscript and its history, a mark, a milestone, a 发稿版本, a Production Document delivered and a package. */
async function richBook(store: EditorialStore): Promise<{ bookId: string; manuscriptId: string; branchId: string }> {
  const book = await importBook(store, await compose(TITLE, [1, 2, 3, 4]));
  const target = { manuscriptId: book.manuscriptId, branchId: book.branchId };
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph')!;
  // An edit still in the journal, never saved as a revision: the working text the Book brings.
  const edited = store.flushJournalEdit({
    clientEditId: randomUUID(), ...target, baseRevisionId: window.revisionId, blockId: block.blockId, windowStartBlockId: window.blocks[0]!.blockId,
    baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: '合并前',
  }).window;
  const editedBlock = edited.blocks.find((candidate) => candidate.blockId === block.blockId)!;
  store.createEditorialMark({
    ...target, windowStartBlockId: edited.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: edited.revisionId,
    expectedJournalSequence: edited.journalSequence, blockId: block.blockId, baseBlockDigest: editedBlock.digest, fromGrapheme: 0, toGrapheme: 3,
    selectedText: [...editedBlock.text].slice(0, 3).join(''), kind: 'annotation', highlightColor: null, body: '合并时请保留这条批注', proposedText: null, rationale: null,
  });
  const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
  store.designatePublicationVersion({ bookId: book.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
  const sourceVersionId = await importSource(store, book.bookId, await compose('新闻稿初稿', [21, 22, 23]));
  const news = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId })).document!;
  await store.recordProductionDocumentDelivery({
    bookId: book.bookId, documentId: news.documentId, version: { kind: 'saved', revisionId: news.versions[0]!.revisionId },
    recipient: { kind: 'publicity', custom: null }, note: '首发稿',
  });
  for (const typeId of ['promotion-article', 'review-article', 'launch-materials', 'marketing-points']) {
    store.decideProductionDocumentType({ bookId: book.bookId, typeId, notForThisBook: true });
  }
  const bundle = store.inspectBookDeliveryPackage(book.bookId);
  store.prepareBookDeliveryPackage({ bookId: book.bookId, purpose: '交出版社存档', expectedContentDigest: bundle.content.digest });
  return book;
}

/** What the editor reads of one Book, in the terms every surface reads it. */
function readings(store: EditorialStore, book: { bookId: string; manuscriptId: string; branchId: string }): unknown {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  return {
    listed: store.listBooks(null).items.filter((item) => item.bookId === book.bookId).map((item) => ({ ...item })),
    window: { blocks: window.blocks.map((block) => [block.blockId, block.text]), marks: window.marks.map((mark) => [mark.markId, mark.kind, mark.fromGrapheme, mark.toGrapheme]) },
    deliverables: store.inspectBookDeliveryPackage(book.bookId),
    documents: store.inspectProductionDocuments(book.bookId),
  };
}

const storeOf = (dataRoot: string): string => join(dataRoot, 'store', 'ai7.sqlite');

describe('complete Word manifest from one cloned empty Book', () => {
let seed: ServiceTestRoots;
let seedBookId: string;
let completeManifest: Array<{ id: string; digest: string; json: string }> | null = null;
beforeAll(async () => {
  seed = await createServiceTestRoots('ai7-service-word-manifest-seed-');
  const store = await EditorialStore.open(seed.dataRoot, seed.codeRoot);
  try { seedBookId = emptyBook(store, '同一空图书的两种 Word 阅读'); store.markCleanShutdown(); }
  finally { store.close(); }
});
afterAll(async () => { await seed.dispose(); });

it.each([{ mode: 'suggestions', count: 201 }, { mode: 'suggestions', count: 2_001 }, { mode: 'accepted-baseline', count: 2_001 }] as const)(
  'retains the independent $count-edit Word manifest through public $mode import, all pages, reopen and selected-Book merge', async ({ mode, count }) => {
  cpSync(seed.dataRoot, roots.dataRoot, { recursive: true });
  const path = join(roots.inputRoot, `word-manifest-${mode}.docx`);
  const span = { block: 9, from: 0, to: 5 };
  const inserted = await sourceSpanText(ADMITTED_BASELINE_DOCX, span);
  const date = '2026-10-25T00:00:00Z';
  await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '完整 Word 修改清单', paragraphs: Array.from({ length: count }, (_, index) =>
    ({ runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: span, revision: { kind: 'ins', author: `作者${index}`, date } }] })) });
  const compiled = await compileWordTrackedDocx(path);
  if (compiled.kind !== 'ready') throw new Error('expected supported independent insertion recipe');
  expect(compiled.graph.paragraphs).toHaveLength(count);
  expect(compiled.graph.events).toHaveLength(count);
  const byParagraph = new Map(compiled.graph.events.map((event) => [event.location.paragraphIndex, event]));
  const byEvent = new Map(compiled.graph.atoms.filter((atom) => atom.kind === 'text' && atom.eventMembership.length === 1)
    .map((atom) => [atom.eventMembership[0]!, atom]));
  let source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const staged = await source.stageSelectedManuscript(randomUUID(), path);
  expect(source.getBookOverview(seedBookId).manuscriptState.state).toBe('empty');
  const review = source.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'existing-book', bookId: seedBookId, relationship: 'first-manuscript' }, false, 'retain',
    { mode, learnFromEdits: true, acceptedBaselineConfirmed: mode === 'accepted-baseline' });
  if (review.reviewDigest === null) throw new Error('expected complete Word review');
  const commitId = randomUUID();
  const commit = await source.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  try { await source.acknowledgeImportCompletion(commitId); }
  catch (error) { source.close(); throw error; }
  // Enumerate the known recipe independently of compiler.templates and the production sample builder.
  const expected = compiled.graph.paragraphs.map((paragraph, index) => {
    const event = byParagraph.get(paragraph.paragraphIndex)!;
    expect([event.kind, event.rawId, event.rawAuthor, event.rawDate, event.disposition])
      .toEqual(['ins', String(1000 + index), `作者${index}`, date, 'visible-transition']);
    const atom = byEvent.get(event.eventId)!;
    expect([atom.rejected, atom.accepted, atom.codeUnits, atom.sha256, compiled.decodedAtoms.get(atom.atomOrdinal)])
      .toEqual([false, true, inserted.length, sha256Hex(inserted), inserted]);
    const content = { operationKind: 'insert' as const, eventMembership: [event.eventId], before: [],
      after: [{ kind: 'text' as const, part: atom.part, paragraphIndex: atom.paragraphIndex, atomOrdinal: atom.atomOrdinal,
        fromCodeUnit: 0, toCodeUnit: inserted.length, codeUnits: inserted.length, sha256: sha256Hex(inserted) }],
      sourceLocation: null, destinationLocation: { part: atom.part, paragraphIndex: atom.paragraphIndex, atomOrdinal: atom.atomOrdinal, codeUnitOffset: 0 } };
    const templateKey = sha256Hex(canonicalJson({ schema: 'ai7.word-sample-key/1', sourceDigest: compiled.sourceDigest,
      extractorIdentity: 'ai7-word-tracked-extractor/1', ...content }));
    const sample: WordTrackedEditSample = { sampleId: `wts_${sha256Hex(canonicalJson({ schema: 'ai7.word-sample-id/1', bookId: commit.bookId, templateKey }))}`,
      bookId: commit.bookId, sourceDigest: compiled.sourceDigest, extractorIdentity: 'ai7-word-tracked-extractor/1', graphDigest: compiled.graphDigest, ...content };
    const record = canonicalRecord({ schema: 'ai7.word-tracked-edit-sample/1', ...sample });
    return { id: sample.sampleId, digest: record.digest, json: record.json };
  }).sort((a, b) => a.id.localeCompare(b.id));
  expect(new Set(expected.map((entry) => entry.id)).size).toBe(count);
  if (count === 2_001) {
    completeManifest ??= expected;
    expect(expected).toEqual(completeManifest);
  }
  const verify = async (store: EditorialStore, dataRoot: string): Promise<void> => {
    const db = new DatabaseSync(storeOf(dataRoot), { readOnly: true });
    try {
      expect(db.prepare('SELECT sample_id id, sha256 digest, canonical_json json FROM word_tracked_edit_samples WHERE book_id = ? ORDER BY sample_id').all(commit.bookId))
        .toEqual(expected);
      expect(db.prepare('SELECT sample_id id, sample_digest digest FROM word_tracked_edit_sample_imports WHERE commit_id = ? ORDER BY sample_id').all(commitId))
        .toEqual(expected.map(({ id, digest }) => ({ id, digest })));
      expect(db.prepare('SELECT count(*) total FROM word_import_mark_sources WHERE commit_id = ?').get(commitId)?.total).toBe(mode === 'suggestions' ? count : 0);
    } finally { db.close(); }
    const signals: Array<{ id: string; digest: string }> = [];
    for (let offset: number | null = 0; offset !== null;) {
      const page = store.inspectEditorialLearning({ signalOffset: offset, itemOffset: 0 });
      expect(page.signals.length).toBeLessThanOrEqual(30);
      for (const signal of page.signals) {
        if (signal.kind !== 'word-tracked-edit') throw new Error('recipe produced a non-Word signal');
        expect(signal.currentEligibility).toBe('house'); expect(signal.memoryCandidate).toBeNull();
        signals.push({ id: signal.source.sampleId, digest: signal.source.sampleDigest });
      }
      offset = page.nextSignalOffset;
    }
    expect(signals.sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected.map(({ id, digest }) => ({ id, digest })));
    const materials: string[] = [];
    let after: Parameters<EditorialStore['inspectLearningMaterials']>[1] = null;
    do {
      const page = store.inspectLearningMaterials(commit.bookId, after);
      for (const book of page.books) for (const material of book.materials) {
        expect(material.target.kind).toBe('word-tracked-edit'); expect(material.sourceTask).toBeNull();
        expect(material.wordCurrentEligibility).toBe('house'); materials.push(material.materialKey);
      }
      after = page.nextCursor;
    } while (after !== null);
    expect(materials.sort()).toEqual(expected.map((entry) => `word-sample:${entry.id}`).sort());
    for (const index of [0, Math.floor(count / 2), count - 1]) {
      const entry = expected[index]!;
      let cursor: Awaited<ReturnType<EditorialStore['inspectWordTrackedEditSample']>>['nextCursor'] = null;
      const text: string[] = [];
      do {
        const page = await store.inspectWordTrackedEditSample({ bookId: commit.bookId, sampleId: entry.id, sampleDigest: entry.digest, after: cursor });
        expect(page.items.length).toBeLessThanOrEqual(40);
        for (const item of page.items) if (item.section === 'after' && item.kind === 'text' && item.field === 'text') text.push(item.text ?? '');
        cursor = page.nextCursor;
      } while (cursor !== null);
      expect(text.join('')).toBe(inserted);
    }
  };
  try {
    await verify(source, roots.dataRoot);
    source.markCleanShutdown(); source.close();
    source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    await verify(source, roots.dataRoot);
    emptyBook(source, '未选入的图书');
    source.markCleanShutdown();
  } finally { source.close(); }
  let target = await EditorialStore.open(otherRoot, roots.codeRoot); target.markCleanShutdown(); target.close();
  withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [commit.bookId], { source: roots.dataRoot, target: otherRoot }));
  target = await EditorialStore.open(otherRoot, roots.codeRoot);
  try {
    await verify(target, otherRoot);
    expect(target.listBooks(null).items.map((book) => book.bookId)).toEqual([commit.bookId]);
    target.markCleanShutdown();
  } finally { target.close(); }
}, 180_000);
});

function withAttached<T>(target: string, source: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(storeOf(target));
  try {
    db.prepare('ATTACH DATABASE ? AS src').run(storeOf(source));
    try {
      return run(db);
    } finally {
      db.exec('DETACH DATABASE src');
    }
  } finally {
    db.close();
  }
}

/** A whole-manuscript search run to completion; answers how many times the query is found. */
function found(store: EditorialStore, book: { manuscriptId: string; branchId: string }, query: string): number {
  const created = store.createSearch(book.manuscriptId, book.branchId, query);
  for (;;) {
    const step = store.advanceSearch(created.searchId);
    if (step.done) return step.summary.totalMatches;
  }
}

/** Change a closed store's rows as no product path would: foreign keys off, and the relation's own triggers gone. */
function tamper(dataRoot: string, table: string, change: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(storeOf(dataRoot));
  try {
    db.exec('PRAGMA foreign_keys = OFF');
    const triggers = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ?").all(table) as Array<{ name: string }>;
    for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
    change(db);
  } finally {
    db.close();
  }
}

function titles(store: EditorialStore): string[] {
  return store.listBooks(null).items.map((item) => item.title).sort();
}

describe('合并图书 over two real stores', () => {
  it.each(['suggestions', 'accepted-baseline'] as const)('carries Word %s through public package inspection and selected-Book merge under destination learning controls', async (mode) => {
    let source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const existingBookId = emptyBook(source, '两处原有的图书');
    source.markCleanShutdown(); source.close();
    cpSync(roots.dataRoot, otherRoot, { recursive: true });
    source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const path = join(roots.inputRoot, `word-public-merge-${mode}.docx`);
    const wordTables = ['word_revision_sources', 'word_revision_imports', 'word_manuscript_source_segments',
      'word_tracked_edit_samples', 'word_tracked_edit_sample_imports', 'word_import_mark_sources'];
    let packagePath: string;
    let bookId: string;
    let detailInput: Parameters<EditorialStore['inspectWordTrackedEditSample']>[0];
    let detail: Awaited<ReturnType<EditorialStore['inspectWordTrackedEditSample']>>;
    let originalWord: ReturnType<typeof learningRows>[];
    try {
      await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '公开包中的 Word 图书', paragraphs: [
        { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
          revision: { kind: 'ins', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
      ] });
      const staged = await source.stageSelectedManuscript(randomUUID(), path);
      const reviewed = source.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false, 'retain',
        { mode, learnFromEdits: true, acceptedBaselineConfirmed: mode === 'accepted-baseline' });
      if (reviewed.reviewDigest === null) throw new Error('expected complete public Word merge fixture');
      const commitId = randomUUID();
      bookId = (await source.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: reviewed.draftVersion,
        reviewDigest: reviewed.reviewDigest, commitId })).bookId;
      await source.acknowledgeImportCompletion(commitId);
      const signal = source.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!;
      if (signal.kind !== 'word-tracked-edit') throw new Error('expected real Word merge signal');
      detailInput = { bookId, sampleId: signal.source.sampleId, sampleDigest: signal.source.sampleDigest, after: null };
      detail = await source.inspectWordTrackedEditSample(detailInput);
      originalWord = wordTables.map((table) => learningRows(roots.dataRoot, table));
      source.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
      packagePath = await exportedFrom(source, `word-public-${mode}.ai7db`);
      source.markCleanShutdown();
    } finally { source.close(); }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      target.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
      const ownControls = learningRows(otherRoot);
      const preview = await target.inspectDatabaseImport(packagePath);
      expect(preview).toMatchObject({ compatibility: 'compatible', contents: { books: 2, sourceVersions: 1 } });
      const waiting = await target.prepareDatabaseMerge(preview.previewId, T);
      expect(waiting.pending?.mergeBooks?.map((book) => book.title)).toEqual(['公开包中的 Word 图书']);
      expect(target.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals).toEqual([]);
      target.markCleanShutdown(); target.close();
      target = await EditorialStore.open(otherRoot, roots.codeRoot);
      expect(target.listBooks(null).items.map((book) => book.bookId).sort()).toEqual([existingBookId, bookId].sort());
      expect(wordTables.map((table) => learningRows(otherRoot, table))).toEqual(originalWord);
      expect(learningRows(otherRoot)).toEqual(ownControls);
      expect(await target.inspectWordTrackedEditSample(detailInput)).toEqual(detail);
      expect(target.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!.currentEligibility).toBe('excluded');
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'applied', mergedCount: 1 });
      target.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 1 });
      expect(target.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!.currentEligibility).toBe('house');
      const material = target.inspectLearningMaterials(bookId).books[0]!.materials[0]!;
      const input = { bookId, items: [{ materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: 0 }] };
      const exclusion = target.previewLearningRemediation(input);
      target.recordLearningRemediation({ ...input, previewDigest: exclusion.previewDigest });
      expect(target.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!.currentEligibility).toBe('excluded');
      expect(await target.inspectWordTrackedEditSample(detailInput)).toEqual(detail);
      expect(wordTables.map((table) => learningRows(otherRoot, table))).toEqual(originalWord);
      target.markCleanShutdown();
    } finally { target.close(); }
  });

  it('names a policy for every relation of the store, and none it does not have', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.close();
    const database = new DatabaseSync(storeOf(roots.dataRoot), { readOnly: true });
    try {
      const tables = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[])
        .map((row) => row.name).sort();
      expect(Object.keys(MERGE_TABLE_POLICY).sort()).toEqual(tables);
    } finally {
      database.close();
    }
  }, 180_000);

  it('merges a Book with every record it owns, beside a Book of the same title, and reads it as the store it came from', async () => {
    let source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string; manuscriptId: string; branchId: string };
    let before: unknown;
    let emptyId: string;
    let foundBefore: number;
    try {
      book = await richBook(source);
      emptyId = emptyBook(source, '空白之书', 'AI7-0001');
      // Issue #922: a Custom Analysis Dimension belongs to the house, so a Book merge must leave its document history behind.
      const dimension = source.saveCustomAnalysisDimension({ dimensionId: null, title: '合并维度', questionTemplate: '本单元从哪里开始？' }).dimensions[0]!;
      source.enableCustomAnalysisDimension(dimension.versions[0]!.versionId);
      // The rich Book is in a Series here; the Series stays behind.
      const series = source.createSeries({ title: '合并书系', note: '' });
      const membership = source.previewSeriesMembershipChange({ seriesId: series.seriesId, bookId: book.bookId, kind: 'add' });
      source.changeSeriesMembership({ seriesId: series.seriesId, bookId: book.bookId, kind: 'add', previewDigest: membership.previewDigest });
      before = readings(source, book);
      foundBefore = found(source, book, '合并前');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, TITLE);
      emptyBook(target, '本机之书', 'AI7-0001');
    } finally {
      target.close();
    }

    const plan = withAttached(otherRoot, roots.dataRoot, (db) => planMerge(db));
    expect(plan.books.map((entry) => [entry.bookId, entry.title, entry.status, entry.internalNumberCleared])).toEqual([
      [book.bookId, TITLE, 'same-title', false],
      [emptyId, '空白之书', 'new', true],
    ]);
    expect(plan.notices).toEqual(['internal-number', 'series']);
    const keys = withAttached(otherRoot, roots.dataRoot, (db) => (db.prepare(
      `SELECT DISTINCT co.relative_key AS k FROM src.content_objects co JOIN src.source_versions sv ON sv.object_digest = co.object_digest
       WHERE sv.book_id = ?`,
    ).all(book.bookId) as Array<{ k: string }>).map((row) => row.k));
    expect(keys.length).toBeGreaterThan(0);
    const snapshots = withAttached(otherRoot, roots.dataRoot, (db) => (db.prepare(
      'SELECT object_relative_key AS k FROM src.recovery_snapshots WHERE book_id = ?').all(book.bookId) as Array<{ k: string }>).map((row) => row.k));
    expect(snapshots.length).toBeGreaterThan(0);
    const counts = withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [book.bookId, emptyId], { source: roots.dataRoot, target: otherRoot }));
    expect(counts.books).toBe(2);
    expect(counts.rows).toBeGreaterThan(50);
    expect(counts.files).toBeGreaterThan(0);
    // The stored files the Book's Source Versions and its milestone name came with it.
    for (const key of keys) expect(existsSync(join(otherRoot, 'objects', ...key.split('/')))).toBe(true);
    for (const key of snapshots) expect(existsSync(join(otherRoot, 'recovery-objects', ...key.split('/')))).toBe(true);

    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE, TITLE, '本机之书', '空白之书'].sort());
      expect(readings(target, book)).toEqual(before);
      // Its working text is searchable as it was, and its Series stayed behind.
      expect(found(target, book, '合并前')).toBe(foundBefore);
      expect(foundBefore).toBeGreaterThan(0);
      expect(target.inspectSeriesList().series).toEqual([]);
      expect(target.inspectCustomAnalysisDimensions(null).dimensions).toEqual([]);
      expect(target.inspectBookSeries(book.bookId).memberships).toEqual([]);
      // A 内部编号 already another Book's here is not taken.
      expect(target.listBooks(null).items.filter((item) => item.title === '空白之书').map((item) => item.internalNumber)).toEqual([null]);
      expect(target.listBooks(null).items.filter((item) => item.title === '本机之书').map((item) => item.internalNumber)).toEqual(['AI7-0001']);
      // A Book already here is not taken again, and nothing changes.
      const again = <T>(run: (db: DatabaseSync) => T): T => withAttached(otherRoot, roots.dataRoot, run);
      target.close();
      const replan = again((db) => planMerge(db));
      expect(replan.books.map((entry) => entry.status)).toEqual(['present', 'present']);
      expect(() => again((db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: otherRoot })))
        .toThrowError(expect.objectContaining({ code: 'DATABASE_MERGE_BOOK_PRESENT' }) as unknown as Error);
      // Nor is a Book whose id is here under another identity: it is refused before anything goes in, not inserted twice.
      const probe = join(dirname(otherRoot), 'probe-data');
      mkdirSync(join(probe, 'store'), { recursive: true });
      again((db) => db.prepare('VACUUM main INTO ?').run(storeOf(probe)));
      tamper(probe, 'books', (db) => db.prepare('UPDATE books SET stable_identity = ? WHERE book_id = ?').run(randomUUID(), book.bookId));
      expect(() => withAttached(probe, roots.dataRoot, (db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: probe })))
        .toThrowError(expect.objectContaining({ code: 'DATABASE_MERGE_BOOK_PRESENT' }) as unknown as Error);
      target = await EditorialStore.open(otherRoot, roots.codeRoot);
      expect(titles(target)).toEqual([TITLE, TITLE, '本机之书', '空白之书'].sort());
    } finally {
      target.close();
    }
    // The store the Book came from is untouched by the merge.
    source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(readings(source, book)).toEqual(before);
      expect(source.inspectCustomAnalysisDimensions(null).dimensions[0]!.versions[0]!.state).toBe('enabled');
    } finally {
      source.close();
    }
  }, 180_000);

  it('leaves the store as it was when a merge cannot finish', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string; manuscriptId: string; branchId: string };
    try {
      book = await importBook(source, await compose(TITLE, [1, 2]));
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    target.close();
    // The file a Source Version names is gone from where the merge takes it.
    const key = withAttached(otherRoot, roots.dataRoot, (db) =>
      (db.prepare('SELECT relative_key FROM src.content_objects LIMIT 1').get() as { relative_key: string }).relative_key);
    await rm(join(roots.dataRoot, 'objects', ...key.split('/')));
    expect(() => withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: otherRoot })))
      .toThrowError(DatabaseMergeError);
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([]);
    } finally {
      target.close();
    }
  }, 180_000);
});

/** Every file under `root`, by its path there; none when there is no `root`. */
async function filesUnder(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name)).sort();
}

describe('the files a merge takes (Issue #434 review)', () => {
  it('replaces a file cut short at a merged file\'s name, and leaves no copy in progress', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string; manuscriptId: string; branchId: string };
    try {
      book = await importBook(source, await compose(TITLE, [1, 2]));
    } finally {
      source.close();
    }
    (await EditorialStore.open(otherRoot, roots.codeRoot)).close();
    // An interrupted merge left the first half of a content object under its digest name.
    const row = withAttached(otherRoot, roots.dataRoot, (db) =>
      db.prepare('SELECT relative_key, object_digest FROM src.content_objects ORDER BY rowid LIMIT 1').get() as { relative_key: string; object_digest: string });
    const whole = await readFile(join(roots.dataRoot, 'objects', ...row.relative_key.split('/')));
    const planted = join(otherRoot, 'objects', ...row.relative_key.split('/'));
    await mkdir(dirname(planted), { recursive: true });
    await writeFile(planted, whole.subarray(0, Math.floor(whole.byteLength / 2)));
    const counts = withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: otherRoot }));
    expect(counts.books).toBe(1);
    expect(sha256Hex(await readFile(planted))).toBe(row.object_digest);
    expect(await filesUnder(join(dirname(roots.dataRoot), 'copying'))).toEqual([]);
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE]);
    } finally {
      target.close();
    }
  }, 180_000);

  it('refuses a package file that is not what its row records, and takes away every file it had put', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string; manuscriptId: string; branchId: string };
    try {
      book = await richBook(source);
    } finally {
      source.close();
    }
    (await EditorialStore.open(otherRoot, roots.codeRoot)).close();
    const before = await filesUnder(otherRoot);
    // The milestone's recovery object is copied after every content object, so the merge has put files when it meets it.
    const key = withAttached(otherRoot, roots.dataRoot, (db) =>
      (db.prepare('SELECT object_relative_key FROM src.recovery_snapshots ORDER BY rowid DESC LIMIT 1').get() as { object_relative_key: string }).object_relative_key);
    const recovery = join(roots.dataRoot, 'recovery-objects', ...key.split('/'));
    const bytes = await readFile(recovery);
    bytes[0] = bytes[0]! ^ 0xff;
    await writeFile(recovery, bytes);
    expect(() => withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: otherRoot })))
      .toThrowError(expect.objectContaining({ code: 'DATABASE_MERGE_FILE_INVALID' }));
    expect(await filesUnder(otherRoot)).toEqual(before);
    expect(await filesUnder(join(dirname(roots.dataRoot), 'copying'))).toEqual([]);
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([]);
    } finally {
      target.close();
    }
  }, 180_000);
});

const T = new Date(2026, 8, 26, 10, 0, 0);
const LATER = new Date(2026, 8, 26, 11, 0, 0);
const LATEST = new Date(2026, 8, 26, 12, 0, 0);

function code(error: unknown): unknown {
  return error instanceof StoreError ? error.code : error;
}

/** 导出数据库 of the store, into the input root. */
async function exportedFrom(store: EditorialStore, name: string): Promise<string> {
  const destination = join(roots.inputRoot, name);
  const preparation = await store.prepareDatabaseExport(destination, true);
  expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
  return destination;
}

function learningRows(dataRoot: string, table = 'editorial_learning_controls'): Array<Record<string, import('node:sqlite').SQLOutputValue>> {
  const db = new DatabaseSync(storeOf(dataRoot), { readOnly: true });
  try { return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(); } finally { db.close(); }
}

const learning = (store: EditorialStore) => store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
function excludeBook(store: EditorialStore, bookId: string, excluded: boolean): void {
  store.changeEditorialLearning({ kind: 'book', bookId, excluded, expectedEntries: learning(store).controlEntries });
}
function learningSwitch(store: EditorialStore, enabled: boolean): void {
  store.changeEditorialLearning({ kind: 'switch', enabled, expectedEntries: learning(store).controlEntries });
}

/** The decision is synthetic; its manuscript anchor comes only from the admitted SampleBook composition. */
function learningDecision(store: EditorialStore, book: { manuscriptId: string; branchId: string }, from = 0): void {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((entry) => entry.kind === 'paragraph' && [...entry.text].length > from + 2)!;
  const binding = { ...book, windowStartBlockId: window.blocks[0]!.blockId };
  const mark = store.createEditorialMark({ ...binding, clientMarkId: randomUUID(), baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence, blockId: block.blockId, baseBlockDigest: block.digest,
    fromGrapheme: from, toGrapheme: from + 2, selectedText: [...block.text].slice(from, from + 2).join(''),
    kind: 'change-suggestion', highlightColor: null, body: '', proposedText: '公开合并建议', rationale: '统一用法' });
  store.recordChangeSuggestionDecision({ ...binding, markId: mark.markId, clientDecisionId: randomUUID(),
    disposition: 'rejected', editedText: null, reason: '公开合并理由' });
}

describe('Book learning controls across database merge (#1115)', () => {
  it('exports, merges and reopens exclusions without granting capture or memory use, while a restored comparison Book works', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const excluded = await importBook(source, await compose('学习排除图书', [1, 2]));
    const comparison = await importBook(source, await compose('学习恢复图书', [21, 22]));
    learningDecision(source, excluded); learningDecision(source, comparison);
    const excludedSignal = learning(source).signals.find((signal) => signal.source.bookId === excluded.bookId)!;
    const comparisonSignal = learning(source).signals.find((signal) => signal.source.bookId === comparison.bookId)!;
    learningDecision(source, comparison, 4);
    const materialSignal = learning(source).signals.find((signal) => ![excludedSignal.signalId, comparisonSignal.signalId].includes(signal.signalId))!;
    source.changeEditorialLearning({ kind: 'material', signalId: materialSignal.signalId });
    source.createEditorialMemory({ clientMemoryId: randomUUID(), signalId: comparisonSignal.signalId,
      title: '源出版社记忆', editorialDimension: '语言', confidence: 0.5 });
    excludeBook(source, excluded.bookId, true); excludeBook(source, comparison.bookId, true);
    excludeBook(source, excluded.bookId, false); excludeBook(source, comparison.bookId, false);
    excludeBook(source, excluded.bookId, true);
    learningSwitch(source, false);
    const packagePath = await exportedFrom(source, 'learning-exclusions.ai7db');
    source.markCleanShutdown(); source.close();
    const sourceControls = learningRows(roots.dataRoot);
    const sourceSignals = learningRows(roots.dataRoot, 'learning_signals');
    const sourceEligibility = learningRows(roots.dataRoot, 'learning_eligibility_decisions');

    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    const localBook = await importBook(target, await compose('本机排除图书', [41, 42]));
    learningDecision(target, localBook);
    const localSignal = learning(target).signals[0]!;
    target.changeEditorialLearning({ kind: 'material', signalId: localSignal.signalId });
    excludeBook(target, localBook.bookId, true); learningSwitch(target, false); learningSwitch(target, true);
    const destinationControls = learningRows(otherRoot);
    const destinationEligibility = learningRows(otherRoot, 'learning_eligibility_decisions');
    const destinationSignals = learningRows(otherRoot, 'learning_signals');
    const preview = await target.inspectDatabaseImport(packagePath);
    await target.prepareDatabaseMerge(preview.previewId, T);
    target.markCleanShutdown(); target.close();
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const projection = learning(target);
      expect(projection.enabled).toBe(true);
      expect(projection.excludedBooks.map((book) => book.bookId).sort()).toEqual([localBook.bookId, excluded.bookId].sort());
      expect(projection.signals.find((signal) => signal.signalId === excludedSignal.signalId)).toMatchObject({
        ...excludedSignal, currentEligibility: 'excluded' });
      expect(projection.signals.find((signal) => signal.signalId === comparisonSignal.signalId)?.currentEligibility).toBe('house');
      expect(projection.signals.find((signal) => signal.signalId === materialSignal.signalId)?.currentEligibility).toBe('excluded');
      expect(projection.items).toEqual([]); // House memory does not travel with its Book-owned source.
      expect(learningRows(otherRoot, 'learning_signals')).toEqual([...destinationSignals, ...sourceSignals]);
      expect(learningRows(otherRoot, 'learning_eligibility_decisions')).toEqual([...destinationEligibility, ...sourceEligibility]);
      expect(projection.excludedMaterials).toContainEqual({ bookId: localBook.bookId, materialKey: localSignal.source.materialKey });
      const carried = learningRows(otherRoot);
      expect(carried.slice(0, destinationControls.length)).toEqual(destinationControls);
      const selected = sourceControls.filter((row) => row.kind === 'book');
      expect(carried.slice(destinationControls.length).map((row) => row.entry_id)).toEqual(selected.map((row) => row.entry_id));
      for (const [index, row] of carried.slice(destinationControls.length).entries()) {
        const original = selected[index]!;
        const ordinal = destinationControls.length + index + 1;
        const source = JSON.parse(String(original.canonical_json));
        const record = canonicalRecord({ ...source, ordinal, importedFrom: { record: source, sha256: original.sha256 } });
        expect(row).toEqual({ ...original, ordinal, canonical_json: record.json, sha256: record.digest });
        // The embedded source is the source row's exact bytes, held to its digest.
        expect(canonicalJson(JSON.parse(String(row.canonical_json)).importedFrom.record)).toBe(original.canonical_json);
      }
      const memory = (signalId: string) => target.createEditorialMemory({ clientMemoryId: randomUUID(), signalId,
        title: '合并后记忆', editorialDimension: '语言', confidence: 0.5 });
      const refusal = (signalId: string): unknown => { try { memory(signalId); return null; } catch (error) { return code(error); } };
      expect(refusal(excludedSignal.signalId)).toBe('EDITORIAL_LEARNING_INVALID');
      expect(refusal(materialSignal.signalId)).toBe('EDITORIAL_LEARNING_INVALID');
      memory(comparisonSignal.signalId);
      expect(learning(target).items[0]!.usable).toBe(true);
      learningDecision(target, excluded);
      expect(learning(target).signals).toHaveLength(4);
      learningDecision(target, comparison);
      expect(learning(target).signals).toHaveLength(5);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'applied', mergedCount: 2 });
      const again = await target.inspectDatabaseImport(packagePath);
      expect(code(await target.prepareDatabaseMerge(again.previewId, LATER).catch((error: unknown) => error))).toBe('DATABASE_MERGE_NOTHING');
      const beforeRestart = learning(target);
      target.markCleanShutdown(); target.close();
      target = await EditorialStore.open(otherRoot, roots.codeRoot);
      expect(learning(target)).toEqual(beforeRestart);
      expect(learningRows(otherRoot)).toEqual(carried);
      expect(learningRows(roots.dataRoot)).toEqual(sourceControls);
      target.markCleanShutdown();
    } finally { target.close(); }

    // The actual consumer (Issue #1113) over the merged data. House preferences never merge, so controlled sources name the
    // imported Books: the line the imported excluded Book supports is refused, the restored comparison Book's line is used.
    const scope = 'ordinary-production';
    const preferenceSource = (bookId: string, bookTitle: string, categoryId: string, categoryLabel: string, reason: string): HousePreferenceSource => ({
      bookId, bookTitle, categoryId, categoryLabel, materialDigest: sha256Hex(`${bookId}/${categoryId}`), decisionId: randomUUID(),
      eligibilityDecisionId: randomUUID(), eligibility: 'house', operationalScope: scope, disposition: 'rejected', reason,
      attribution: { peopleVersion: 0, authors: [], editors: [] }, quality: NO_EDIT_QUALITY });
    const withPreferences = <T>(run: (preferences: HouseReviewPreferenceLedger, db: DatabaseSync) => T): T => {
      const db = new DatabaseSync(storeOf(otherRoot));
      try { return run(new HouseReviewPreferenceLedger(db), db); } finally { db.close(); }
    };
    const typosLine = withPreferences((preferences, db) => {
      expect(db.prepare('SELECT count(*) AS n FROM house_review_preference_versions').get()!.n).toBe(0);
      const version = preferences.rebuild(scope, [
        preferenceSource(excluded.bookId, '学习排除图书', 'typos-and-usage', '错别字与规范用语', '保留作者用字'),
        preferenceSource(comparison.bookId, '学习恢复图书', 'style-and-format', '体例与格式', '体例从旧')])!;
      const line = (categoryId: string) => version.lines.find((entry) => entry.categoryId === categoryId)!;
      expect(line('typos-and-usage').sources.map((source) => source.bookId)).toEqual([excluded.bookId]);
      expect(line('style-and-format').sources.map((source) => source.bookId)).toEqual([comparison.bookId]);
      expect(preferences.use(scope, comparison.bookId, 'style-and-format')).toMatchObject({
        versionId: version.versionId, lines: [line('style-and-format').text], sourceCount: 1 });
      expect(preferences.use(scope, comparison.bookId, 'typos-and-usage')).toBeNull();
      expect(preferences.use(scope, excluded.bookId, 'style-and-format')).toBeNull();
      return line('typos-and-usage').text;
    });
    // Restoring the imported Book after its carried history lets the same line be used: the carried exclusion was the refusal.
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      excludeBook(target, excluded.bookId, false);
      expect(learningRows(otherRoot).at(-1)).toMatchObject({ ordinal: learningRows(otherRoot).length, kind: 'book', book_id: excluded.bookId, value: 0 });
      target.markCleanShutdown();
    } finally { target.close(); }
    withPreferences((preferences) => expect(preferences.use(scope, comparison.bookId, 'typos-and-usage')?.lines).toEqual([typosLine]));
  }, 180_000);

  it('takes only selected new Books, never switches or already-present Book controls, and retains multi-hop provenance', async () => {
    let source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const present = emptyBook(source, '已有图书');
    const selected = emptyBook(source, '所选图书');
    const unselected = emptyBook(source, '未选图书');
    source.markCleanShutdown(); source.close();
    let target = await EditorialStore.open(otherRoot, roots.codeRoot); target.markCleanShutdown(); target.close();
    withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [present], { source: roots.dataRoot, target: otherRoot }));
    source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    excludeBook(source, present, true); excludeBook(source, selected, true); excludeBook(source, unselected, true);
    learningSwitch(source, true); source.markCleanShutdown(); source.close();
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    excludeBook(target, present, false); learningSwitch(target, false); target.markCleanShutdown(); target.close();
    const before = learningRows(otherRoot);
    withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [selected], { source: roots.dataRoot, target: otherRoot }));
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    expect(learning(target)).toMatchObject({ enabled: false, controlEntries: 3, excludedBooks: [{ bookId: selected, title: '所选图书' }] });
    target.markCleanShutdown(); target.close();
    expect(learningRows(otherRoot).slice(0, 2)).toEqual(before);
    const thirdRoot = join(dirname(otherRoot), 'third-data');
    const third = await EditorialStore.open(thirdRoot, roots.codeRoot); third.markCleanShutdown(); third.close();
    withAttached(thirdRoot, otherRoot, (db) => mergeBooks(db, [selected], { source: otherRoot, target: thirdRoot }));
    const carried = learningRows(thirdRoot)[0]!;
    const firstHop = learningRows(otherRoot)[2]!;
    const origin = learningRows(roots.dataRoot).find((row) => row.book_id === selected)!;
    const provenance = JSON.parse(String(carried.canonical_json)).importedFrom;
    expect(provenance.sha256).toBe(firstHop.sha256);
    expect(canonicalJson(provenance.record)).toBe(firstHop.canonical_json);
    expect(provenance.record.importedFrom.sha256).toBe(origin.sha256);
    expect(canonicalJson(provenance.record.importedFrom.record)).toBe(origin.canonical_json);
    const reopened = await EditorialStore.open(thirdRoot, roots.codeRoot);
    try { expect(learning(reopened)).toMatchObject({ enabled: true, excludedBooks: [{ bookId: selected, title: '所选图书' }] }); }
    finally { reopened.close(); }
  });

  it('adds each hop’s source once, so a long merge chain grows linearly and still verifies back to the editor’s entry', () => {
    const bookId = randomUUID();
    const hops = 12;
    const sizes: number[] = [];
    let first: Record<string, import('node:sqlite').SQLOutputValue> | undefined;
    for (let hop = 0; hop <= hops; hop += 1) {
      const db = new DatabaseSync(join(dirname(otherRoot), `controls-hop-${hop}.sqlite`));
      try {
        db.exec(`CREATE TABLE books (book_id TEXT PRIMARY KEY); ${EDITORIAL_LEARNING_SCHEMA_SQL.editorial_learning_controls}`);
        db.prepare('INSERT INTO books VALUES (?)').run(bookId);
        if (hop === 0) new EditorialLearningLedger(db).change({ kind: 'book', bookId, excluded: true, expectedEntries: 0 });
        else {
          db.prepare('ATTACH DATABASE ? AS src').run(join(dirname(otherRoot), `controls-hop-${hop - 1}.sqlite`));
          expect(importBookLearningControls(db, (id) => id === bookId)).toBe(1);
          db.exec('DETACH DATABASE src');
        }
        const [row] = db.prepare('SELECT * FROM editorial_learning_controls').all();
        first ??= row;
        sizes.push(Buffer.byteLength(String(row!.canonical_json)));
        expect([...new EditorialLearningLedger(db).controls().excludedBooks]).toEqual([bookId]);
        if (hop === hops) {
          let origin = JSON.parse(String(row!.canonical_json));
          for (let step = 0; step < hops; step += 1) origin = origin.importedFrom.record;
          expect(canonicalJson(origin)).toBe(first!.canonical_json);
        }
      } finally { db.close(); }
    }
    // Escaped text would double every hop (seven megabytes at sixteen); an embedded record adds the same bytes each time.
    expect(new Set(sizes.slice(1).map((size, index) => size - sizes[index]!)).size).toBe(1);
  });

  it.each(['digest', 'gap', 'provenance', 'provenance-digest', 'collision', 'destination'] as const)('fails closed and rolls back Book/control rows for %s corruption', async (damage) => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const bookId = emptyBook(source, '待合并图书'); excludeBook(source, bookId, true);
    source.markCleanShutdown(); source.close();
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    learningSwitch(target, false); target.markCleanShutdown(); target.close();
    if (damage === 'destination') {
      tamper(otherRoot, 'editorial_learning_controls', (db) => db.exec("UPDATE editorial_learning_controls SET sha256 = printf('%064d', 0)"));
    } else {
      tamper(roots.dataRoot, 'editorial_learning_controls', (db) => {
        const row = db.prepare('SELECT * FROM editorial_learning_controls').get()!;
        const original = JSON.parse(String(row.canonical_json));
        if (damage === 'digest') { db.exec("UPDATE editorial_learning_controls SET sha256 = printf('%064d', 0)"); return; }
        if (damage === 'gap') original.ordinal = 2;
        if (damage === 'collision') original.entryId = learningRows(otherRoot)[0]!.entry_id;
        if (damage === 'provenance') original.importedFrom = {
          record: { ...original, value: false }, sha256: canonicalRecord({ ...original, value: false }).digest };
        if (damage === 'provenance-digest') original.importedFrom = { record: { ...original }, sha256: '0'.repeat(64) };
        const changed = canonicalRecord(original);
        db.prepare('UPDATE editorial_learning_controls SET entry_id = ?, ordinal = ?, canonical_json = ?, sha256 = ?')
          .run(original.entryId, original.ordinal, changed.json, changed.digest);
      });
    }
    const before = learningRows(otherRoot);
    expect(() => withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [bookId], { source: roots.dataRoot, target: otherRoot }))).toThrow();
    expect(learningRows(otherRoot)).toEqual(before);
    expect(learningRows(otherRoot, 'books')).toEqual([]);
    expect(learningRows(otherRoot, 'database_merges')).toEqual([]);
  });

  it('rolls controls, signals and Books back if the receipt cannot commit, then retries once', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const book = await importBook(source, await compose('原子合并图书', [1, 2]));
    learningDecision(source, book); excludeBook(source, book.bookId, true);
    const packagePath = await exportedFrom(source, 'atomic-learning.ai7db');
    source.markCleanShutdown(); source.close();
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    learningSwitch(target, false);
    await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
    target.markCleanShutdown(); target.close();
    const before = learningRows(otherRoot);
    const staging = replacementStagingFor(otherRoot);
    const intent = JSON.parse(await readFile(join(staging, 'intent.json'), 'utf8')) as { json: string };
    const prepared = parseCanonicalJson(intent.json) as ReplacementIntent;
    const listed = { ...prepared.mergeBooks!, path: join(staging, MERGING_BOOKS_FILE) };
    saveStoreFiles(otherRoot, join(staging, 'store-before'));
    expect(() => mergeIntoStoreFile(otherRoot, join(staging, 'incoming'), listed, (db) => {
      expect(db.prepare('SELECT count(*) n FROM editorial_learning_controls').get()!.n).toBe(2);
      writeMergeReceipt(db, prepared, T);
      throw new Error('TEST_RECEIPT_ROLLBACK');
    })).toThrow('TEST_RECEIPT_ROLLBACK');
    expect(learningRows(otherRoot)).toEqual(before);
    expect(learningRows(otherRoot, 'learning_signals')).toEqual([]);
    expect(learningRows(otherRoot, 'books')).toEqual([]);
    expect(learningRows(otherRoot, 'database_merges')).toEqual([]);
    expect(mergeIntoStoreFile(otherRoot, join(staging, 'incoming'), listed, (db) => writeMergeReceipt(db, prepared, T))).toBe('merged');
    expect(learningRows(otherRoot)).toHaveLength(2);
    expect(mergeIntoStoreFile(otherRoot, join(staging, 'incoming'), listed)).toBe('already');
    expect(learningRows(otherRoot)).toHaveLength(2);
    const reopened = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(learning(reopened)).toMatchObject({ enabled: false, controlEntries: 2,
        excludedBooks: [{ bookId: book.bookId, title: '原子合并图书' }] });
      expect((await reopened.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ outcome: 'applied', mergedCount: 1 });
    } finally { reopened.close(); }
  }, 120_000);
});

describe('只导入其中的图书 over the store', () => {
  it('selected policy profile merge preserves exact frozen Book metadata without importing House authority', async () => {
    const fixture = await loadModelFixture(join(roots.codeRoot, 'tests/fixtures/model'), 'sample1-factual-authored');
    const control = { induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false,
      baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage } };
    let source = await EditorialStore.open(roots.dataRoot, roots.codeRoot, control);
    const book = await importSample1Book(source, roots.codeRoot, '合成本地策略合并图书');
    await pinEditorialWorkspaceProfileRevision2(source, book.bookId);
    recordMissingCredentialConnection(source, '来源本社合成连接');
    source.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
      categoryId: 'typos-and-usage', text: '来源本社的合成偏好。', effect: 'guide' });
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    let work = source.createFactualReviewPreparationWork(book.bookId, FACTUAL_REVIEW_TASK_GOAL, policy);
    while (!work.done) work = source.advanceFactualReviewPreparationWork(work.workId!);
    const original = work.projection!.providerResolutionPlan!;
    expect(original.selectedPolicyIdentity).toEqual(policy.selectedPolicyIdentity);
    expect(original.localFixtureProfile).toBeUndefined();
    const sourceRows = learningRows(roots.dataRoot, 'analysis_plan_records');
    const packagePath = await exportedFrom(source, 'selected-policy-merge.ai7db');
    source.close();
    let target = await EditorialStore.open(otherRoot, roots.codeRoot, control);
    recordMissingCredentialConnection(target, '目标本社独立的合成连接');
    target.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
      categoryId: 'typos-and-usage', text: '目标本社保留的合成偏好。', effect: 'guide' });
    const targetHouse = target.inspectGlobalAgent();
    const preview = await target.inspectDatabaseImport(packagePath);
    expect(preview).toMatchObject({ compatibility: 'compatible', schemaRevision: 98, dataVersion: 1 });
    await target.prepareDatabaseMerge(preview.previewId, T);
    target.close();
    target = await EditorialStore.open(otherRoot, roots.codeRoot, control);
    try {
      expect(target.inspectFactualReview(book.bookId).providerResolutionPlan).toEqual(original);
      expect(learningRows(otherRoot, 'analysis_plan_records')).toEqual(sourceRows);
      const global = target.inspectGlobalAgent();
      expect(global.items).toEqual(targetHouse.items);
      expect(global.sourceCandidates).toEqual(targetHouse.sourceCandidates);
      expect(global.history).toEqual(targetHouse.history);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ outcome: 'applied', mergedCount: 1 });
    } finally { target.close(); }
    source = await EditorialStore.open(roots.dataRoot, roots.codeRoot, control);
    try { expect(source.inspectFactualReview(book.bookId).providerResolutionPlan).toEqual(original); }
    finally { source.close(); }
  }, 120_000);

  it('previews each Book as the merge would take it, merges at the next open onto the data as it is then, and records it', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string; manuscriptId: string; branchId: string };
    let before: unknown;
    let packagePath: string;
    try {
      book = await richBook(source);
      emptyBook(source, '空白之书');
      before = readings(source, book);
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, '空白之书');
      const preview = await target.inspectDatabaseImport(packagePath);
      expect(preview.books.map((entry) => [entry.title, entry.status])).toEqual([[TITLE, 'new'], ['空白之书', 'same-title']]);
      expect(preview.mergeNotices).toEqual([]);
      const waiting = await target.prepareDatabaseMerge(preview.previewId, T);
      expect(waiting.pending).toMatchObject({
        kind: 'merge', packageFileName: 'AI7 数据库.ai7db', backupFileName: preMergeBackupFileName(T),
        mergeBooks: [{ title: TITLE, status: 'new' }, { title: '空白之书', status: 'same-title' }], mergeNotices: [],
      });
      const backup = unzipSync(await readFile(join(`${otherRoot}-backups`, preMergeBackupFileName(T))));
      expect(parseCanonicalJson(strFromU8(backup['manifest.json']!))).toMatchObject({ origin: 'pre-merge-backup', contents: { books: 1 } });
      // A change made after the merge was prepared stays: the merge is applied onto the data as it is at the next open.
      emptyBook(target, '准备合并之后');
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE, '准备合并之后', '空白之书', '空白之书'].sort());
      expect(readings(target, book)).toEqual(before);
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
      const recorded = await target.inspectDatabaseReplacements();
      expect(recorded).toMatchObject({ pending: null, total: 1, rollBackOf: null });
      expect(recorded.replacements[0]).toMatchObject({
        kind: 'merge', outcome: 'applied', packageFileName: 'AI7 数据库.ai7db', backupFileName: preMergeBackupFileName(T),
        mergedTitles: [TITLE, '空白之书'], backupPresent: true,
      });
      // A file whose Books are all here has nothing to merge.
      const again = await target.inspectDatabaseImport(packagePath);
      expect(again.books.map((entry) => entry.status)).toEqual(['present', 'present']);
      expect(code(await target.prepareDatabaseMerge(again.previewId, LATER).catch((error: unknown) => error))).toBe('DATABASE_MERGE_NOTHING');
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
    } finally {
      target.close();
    }
  }, 180_000);

  it('writes the backup before a merge alone in the backup location, beside 定期自动备份 (Issue #434, S86d restack)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      emptyBook(source, '空白之书');
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    const tomorrow = new Date(T.getTime() + 25 * 60 * 60 * 1000);
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      await target.setScheduledBackup({ enabled: true, expectedOrdinal: 0 }, T);
      expect(await target.runScheduledBackupIfDue(T)).toBe(true);
      const preview = await target.inspectDatabaseImport(packagePath);
      // While the backup before the merge is being made, a 定期自动备份 check starts nothing: no sweep, no backup.
      const preparing = target.prepareDatabaseMerge(preview.previewId, LATER);
      expect(await target.runScheduledBackupIfDue(tomorrow)).toBe(false);
      expect((await preparing).pending).toMatchObject({ kind: 'merge', backupFileName: preMergeBackupFileName(LATER) });
      // Once it is written, the check runs as ever: a merge keeps what is saved before AI7 starts again, so nothing waits on it.
      expect(target.replacementWaiting()).toBe(false);
      expect(await target.runScheduledBackupIfDue(tomorrow)).toBe(true);
      const names = await readdir(`${otherRoot}-backups`);
      expect([names.includes(preMergeBackupFileName(LATER)), names.filter((name) => name.includes('.partial'))]).toEqual([true, []]);
      target.markCleanShutdown();
    } finally {
      target.close();
    }
  }, 180_000);

  it('leaves the data as it was when the merge cannot finish at the next open, and merges once however it is interrupted', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      await importBook(source, await compose(TITLE, [1, 2]));
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, '本机之书');
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
    } finally {
      target.close();
    }
    // The files the merged Source Version names are gone from the staged package: the merge cannot finish.
    const incoming = join(replacementStagingFor(otherRoot), 'incoming');
    await rm(join(incoming, 'objects'), { recursive: true, force: true });
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['本机之书']);
      // A merge that failed took nothing, and its record names no Book (Issue #434 review).
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed', mergedTitles: [], mergedCount: 0 });
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
      // Prepared again, and interrupted after its transaction committed: the next open finds the Book there and merges nothing twice.
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, LATER);
    } finally {
      target.close();
    }
    const staging = replacementStagingFor(otherRoot);
    const intent = JSON.parse(await readFile(join(staging, 'intent.json'), 'utf8')) as { json: string };
    const prepared = parseCanonicalJson(intent.json) as ReplacementIntent & { schema: string };
    const listed = { ...prepared.mergeBooks!, path: join(staging, MERGING_BOOKS_FILE) };
    saveStoreFiles(otherRoot, join(staging, 'store-before'));
    // Journals beside the package's store are not the package: they are gone before the merge reads it (Issue #434 review).
    const journals = ['-journal', '-wal', '-shm'].map((suffix) => join(staging, 'incoming', 'store', `ai7.sqlite${suffix}`));
    for (const journal of journals) await writeFile(journal, 'not the verified store');
    // The merge commits its receipt with its Books, as the apply's own merge does.
    expect(mergeIntoStoreFile(otherRoot, join(staging, 'incoming'), listed, (db) => writeMergeReceipt(db, prepared, LATER))).toBe('merged');
    expect(journals.filter((journal) => existsSync(journal))).toEqual([]);
    await writeFile(join(staging, 'phase.json'), JSON.stringify('merging'));
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE, '本机之书'].sort());
      const recorded = await target.inspectDatabaseReplacements();
      expect(recorded.replacements.map((entry) => [entry.kind, entry.outcome])).toEqual([['merge', 'applied'], ['merge', 'failed']]);
      expect(existsSync(staging)).toBe(false);
      expect((await readdir(`${otherRoot}-backups`)).filter((name) => name.startsWith('AI7 合并前备份 ')).length).toBe(2);
    } finally {
      target.close();
    }
  }, 180_000);
});

describe('what a merge refuses, puts back and brings forward', () => {
  it('refuses a Book whose records reference a Book not chosen', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: { bookId: string };
    let otherId: string;
    try {
      book = await richBook(source);
      otherId = emptyBook(source, '另一本');
    } finally {
      source.close();
    }
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    target.close();
    // One of its marks names the other Book.
    tamper(roots.dataRoot, 'editorial_marks', (db) => db.prepare('UPDATE editorial_marks SET book_id = ? WHERE book_id = ?').run(otherId, book.bookId));
    expect(() => withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: otherRoot })))
      .toThrowError(expect.objectContaining({ code: 'DATABASE_MERGE_CROSS_BOOK' }) as unknown as Error);
  }, 180_000);

  it('merges nothing from a staged package that lost records after its preparation, as what waited having changed', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      const book = await importBook(source, await compose(TITLE, [1, 2]));
      await importSource(source, book.bookId, await compose('新闻稿初稿', [21, 22]));
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, '本机之书');
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
    } finally {
      target.close();
    }
    // The staged package loses the commits its imports were recorded by, which no foreign key names. What waits is checked
    // again against what the preparation verified before anything merges (Issue #434 review), so nothing is merged.
    const incoming = join(replacementStagingFor(otherRoot), 'incoming');
    tamper(incoming, 'import_commits', (db) => db.exec('DELETE FROM import_commits'));
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['本机之书']);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed', failure: 'changed' });
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
    } finally {
      target.close();
    }
  }, 180_000);

  it('puts the store back when the merged data will not open at the next open, and records it as unopenable (Issue #644)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      const book = await importBook(source, await compose(TITLE, [1, 2]));
      await importSource(source, book.bookId, await compose('新闻稿初稿', [21, 22]));
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, '本机之书');
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
    } finally {
      target.close();
    }
    // The merge runs as the apply runs it and commits, with its receipt; then the merged data loses the commits its imports were
    // recorded by, which no foreign key names, and the apply resumes at its open: the data fails the store's own check of its
    // import records, so the store's files go back as they were saved, and the merge is recorded as data that would not open.
    const staging = replacementStagingFor(otherRoot);
    const intent = JSON.parse(await readFile(join(staging, 'intent.json'), 'utf8')) as { json: string };
    const prepared = parseCanonicalJson(intent.json) as ReplacementIntent & { schema: string };
    const listed = { ...prepared.mergeBooks!, path: join(staging, MERGING_BOOKS_FILE) };
    saveStoreFiles(otherRoot, join(staging, 'store-before'));
    expect(mergeIntoStoreFile(otherRoot, join(staging, 'incoming'), listed, (db) => writeMergeReceipt(db, prepared, T))).toBe('merged');
    tamper(otherRoot, 'import_commits', (db) => db.exec('DELETE FROM import_commits'));
    await writeFile(join(staging, 'phase.json'), JSON.stringify('opening-merge'));
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['本机之书']);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed', failure: 'unopenable' });
      expect(existsSync(staging)).toBe(false);
    } finally {
      target.close();
    }
  }, 180_000);

  it('records a merge that could not finish writing its Books as such, not as data that would not open (Issue #644)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      await importBook(source, await compose(TITLE, [1, 2]));
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, '本机之书');
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
    } finally {
      target.close();
    }
    // What waits is exactly what was verified, but this data holds a folder at the name of a file the merge takes: putting the
    // file there fails, which is neither a conflict the rules name nor what waited having changed.
    const key = withAttached(otherRoot, roots.dataRoot, (db) =>
      (db.prepare('SELECT relative_key FROM src.content_objects LIMIT 1').get() as { relative_key: string }).relative_key);
    const occupied = join(otherRoot, 'objects', ...key.split('/'));
    await mkdir(occupied, { recursive: true });
    await writeFile(join(occupied, 'not-a-content-object.txt'), 'here before');
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['本机之书']);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({
        kind: 'merge', outcome: 'failed', failure: 'unmergeable', mergedCount: 0, mergedTitles: [],
      });
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
      expect(await readFile(join(occupied, 'not-a-content-object.txt'), 'utf8')).toBe('here before');
      target.markCleanShutdown();
    } finally {
      target.close();
    }
  }, 180_000);

  it('verifies what waits again when it resumes a merge before its Books went in, and merges nothing that changed (Issue #434 review)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      await importBook(source, await compose(TITLE, [1, 2]));
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    const prepared = async (at: Date): Promise<string> => {
      const target = await EditorialStore.open(otherRoot, roots.codeRoot);
      try {
        await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, at);
      } finally {
        target.close();
      }
      return replacementStagingFor(otherRoot);
    };
    const phase = (staging: string, value: string): Promise<void> => writeFile(join(staging, 'phase.json'), JSON.stringify(value));
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      emptyBook(target, '本机之书');
    } finally {
      target.close();
    }
    // Stopped while the store's files were being saved, then a file put among what waits: nothing is merged.
    let staging = await prepared(T);
    await phase(staging, 'saving-store');
    await writeFile(join(staging, 'incoming', 'extra.bin'), 'extra');
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['本机之书']);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed', failure: 'changed' });
    } finally {
      target.close();
    }
    // Stopped once they were saved — here even after the merge went in — then a member of the package changed: the saved files
    // go back, and nothing is merged.
    staging = await prepared(LATER);
    saveStoreFiles(otherRoot, join(staging, 'store-before'));
    await phase(staging, 'merging');
    const intent = JSON.parse(await readFile(join(staging, 'intent.json'), 'utf8')) as { json: string };
    const listed = { ...(parseCanonicalJson(intent.json) as { mergeBooks: { sha256: string; count: number } }).mergeBooks, path: join(staging, MERGING_BOOKS_FILE) };
    expect(mergeIntoStoreFile(otherRoot, join(staging, 'incoming'), listed)).toBe('merged');
    const member = join(staging, 'incoming', 'store', 'ai7.sqlite');
    const bytes = await readFile(member);
    await writeFile(member, Buffer.concat([bytes, Buffer.from('changed')]));
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['本机之书']);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed', failure: 'changed' });
    } finally {
      target.close();
    }
    // The journals SQLite keeps beside the package's store while a merge reads it are not the package's: the merge goes on — and
    // a write-ahead log put there with committed rows, as another program could leave one, never reaches it (Issue #434 review).
    staging = await prepared(LATEST);
    saveStoreFiles(otherRoot, join(staging, 'store-before'));
    await phase(staging, 'merging');
    const packageStore = join(staging, 'incoming', 'store', 'ai7.sqlite');
    const clone = join(roots.inputRoot, 'clone.sqlite');
    copyFileSync(packageStore, clone);
    const writer = new DatabaseSync(clone);
    try {
      writer.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;');
      writer.prepare("UPDATE books SET title = '改过的书名'").run();
      copyFileSync(`${clone}-wal`, `${packageStore}-wal`);
      copyFileSync(`${clone}-shm`, `${packageStore}-shm`);
    } finally {
      writer.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE, '本机之书'].sort());
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'applied' });
      target.markCleanShutdown();
    } finally {
      target.close();
    }
  }, 180_000);

  it('migrates a genuine revision-97 package on selected-Book merge (#1170)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const creation = source.prepareBookCreation('版本97待合并图书', null);
    source.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }); source.close();
    const db = new DatabaseSync(storeOf(roots.dataRoot));
    const path = join(roots.inputRoot, 'revision97.ai7db');
    try {
      db.exec('DROP TABLE procedure_run_choices; DROP TABLE procedure_version_stops; DROP TABLE procedure_version_origins; DROP TABLE procedure_plan_pins;');
      db.exec(PROCEDURE_DEFINITION_SCHEMA_SQL.procedure_plan_pins);
      for (const action of ['update', 'delete']) db.exec(PROCEDURE_DEFINITION_TRIGGER_SQL[`procedure_plan_pins_no_${action}`]!);
      execPre74Fixture(db, 'PRAGMA user_version = 97');
      await writeDatabasePackage(db, roots.dataRoot, path, () => ({ dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: 97,
        createdAt: T.toISOString(), origin: 'database-export', contents: { books: 1, sourceVersions: 0, libraryMaterials: 0, series: 0 } }));
    } finally { db.close(); }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(path);
      expect(preview).toMatchObject({ schemaRevision: 97, compatibility: 'compatible' });
      await target.prepareDatabaseMerge(preview.previewId, T);
      target.close(); target = await EditorialStore.open(otherRoot, roots.codeRoot);
      expect(titles(target)).toEqual(['版本97待合并图书']);
      expect(target.procedureLibrary({ action: 'inspect' }).procedures).toHaveLength(16);
      target.markCleanShutdown();
    } finally { target.close(); }
  });

  it('keeps an imported Run exact without installing the source house procedure library (#1170)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string, procedure: { procedureId: string; version: number; digest: string }, promptDigest: string, path: string;
    try {
      ({ bookId } = await importSample1Book(source, roots.codeRoot, '合并工序公开样书'));
      await pinEditorialWorkspaceProfileRevision2(source, bookId); recordMissingCredentialConnection(source, '合并工序连接');
      const original = source.procedureLibrary({ action: 'inspect' }).procedures.find((entry) => entry.executorKind === 'baseline-manuscript-analysis')!;
      const created = source.procedureLibrary({ action: 'save', input: { procedureId: null,
        basedOn: { procedureId: original.procedureId, version: original.version, digest: original.digest },
        title: '源社工序', editorInstruction: '保留短句', stages: original.document.stages } }).procedures.find((entry) => entry.document.title === '源社工序')!;
      procedure = { procedureId: created.procedureId, version: created.version, digest: created.digest };
      source.procedureLibrary({ action: 'select', bookId, procedure });
      let work = source.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, await resolveSourceCheckoutLaunchPolicy(roots.codeRoot));
      while (!work.done) work = source.advanceBaselineAnalysisPreparationWork(work.workId!);
      const plan = work.projection!; promptDigest = plan.planEnvelope!.promptContractDigest;
      source.authorizeBaselineAnalysis(bookId, plan.taskIntent!.taskIntentId, plan.planEnvelope!.digest);
      path = await exportedFrom(source, 'pinned-procedure.ai7db'); source.markCleanShutdown();
    } finally { source.close(); }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(path!); await target.prepareDatabaseMerge(preview.previewId, T);
      target.close(); target = await EditorialStore.open(otherRoot, roots.codeRoot);
      expect(target.inspectBaselineAnalysis(bookId!).run!.procedure).toEqual(procedure!);
      expect(target.baselineAnalysisLedger.definitionForDigest(promptDigest!).systemPrompt).toContain('保留短句');
      expect(target.procedureLibrary({ action: 'inspect' }).procedures.some((entry) => entry.procedureId === procedure!.procedureId)).toBe(false);
      target.markCleanShutdown();
    } finally { target.close(); }
  });

  it('brings a package made at an older revision to this one before it merges', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(source, await compose(TITLE, [1, 2]));
    } finally {
      source.close();
    }
    // The package as an AI7 at revision 57 exactly would have made it: its store without any relation revisions 58 to 65 added —
    // the writing Tasks and drafts (65), the evaluation rewrite records (64), the Captured Procedures (63), the 审稿意见 records (62), the Series Retrieval Exclusions (61), the dialogue ledger (60), the
    // 初评 drafts (59) and the merges (58) — and its kind-coupled relations as revision 58 left them (Issue #674).
    const older = join(roots.inputRoot, 'older.sqlite');
    copyFileSync(storeOf(roots.dataRoot), older);
    const packagePath = join(roots.inputRoot, 'AI7 旧版数据库.ai7db');
    const db = new DatabaseSync(older);
    try {
      execPre74Fixture(db, `DROP TABLE analysis_outcome_resolutions; DROP TABLE material_index_segments; DROP TABLE material_index_builds; DROP TABLE writing_drafts; DROP TABLE writing_tasks; DROP TABLE evaluation_rewrite_decisions; DROP TABLE evaluation_rewrite_tasks;
        DROP TABLE developer_capability_proposal_exports; DROP TABLE developer_capability_proposals; DROP TABLE review_run_procedure_pins;
        DROP TABLE captured_procedure_states; DROP TABLE captured_procedure_versions; DROP TABLE captured_procedures;
        DROP TABLE readers_report_drafts; DROP TABLE readers_report_tasks; DROP TABLE series_retrieval_exclusions;
        DROP TABLE dialogue_conversions; DROP TABLE dialogue_attempt_outcomes; DROP TABLE dialogue_harness_spans; DROP TABLE dialogue_execution_bindings;
        DROP TABLE dialogue_attempts; DROP TABLE dialogue_tasks; DROP TABLE evaluation_initial_drafts; DROP TABLE database_merge_books; DROP TABLE database_merges;
        PRAGMA user_version = 57;`);
      downgradeKindCoupledRelations(db, ANALYSIS_LEDGER_REVISION_58_SQL);
      await writeDatabasePackage(db, roots.dataRoot, packagePath, () => ({
        dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: 57, createdAt: T.toISOString(), origin: 'database-export',
        contents: { books: 1, sourceVersions: 1, libraryMaterials: 0, series: 0 },
      }));
    } finally {
      db.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(packagePath);
      expect([preview.schemaRevision, preview.compatibility, preview.books.map((entry) => entry.status)]).toEqual([57, 'compatible', ['new']]);
      await target.prepareDatabaseMerge(preview.previewId, T);
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([TITLE]);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'applied', mergedTitles: [TITLE] });
    } finally {
      target.close();
    }
  }, 180_000);

  it('refuses to preview a file whose store does not read, as damaged, and stages nothing', async () => {
    const store = 'not a database';
    const manifest = canonicalRecord({
      schema: 'ai7.database-package/1', dataVersion: 1, softwareVersion: '0.1.0', schemaRevision: 58, createdAt: T.toISOString(),
      origin: 'database-export', contents: { books: 0, sourceVersions: 0, libraryMaterials: 0, series: 0 }, credentials: 'excluded',
      members: [{ path: 'store/ai7.sqlite', bytes: strToU8(store).byteLength, sha256: sha256Hex(store) }],
    });
    const packagePath = join(roots.inputRoot, '坏数据库.ai7db');
    await writeFile(packagePath, zipSync({ 'store/ai7.sqlite': strToU8(store), 'manifest.json': strToU8(manifest.json) }, { mtime: fixedArchiveTime() }));
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      // The preview reads the package's store before offering anything (#620's review), so no plan is made of it.
      await expect(target.inspectDatabaseImport(packagePath)).rejects.toMatchObject({ code: 'DATABASE_PACKAGE_DAMAGED' });
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
    } finally {
      target.close();
    }
  }, 180_000);

  it("lists a package's first fifty Books and counts the rest, in the preview, the waiting merge and its record (Issue #434 review)", async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      for (let index = 1; index <= MAX_MERGE_BOOKS_LISTED + 5; index += 1) emptyBook(source, `书 ${String(index).padStart(3, '0')}`);
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
      source.markCleanShutdown();
    } finally {
      source.close();
    }
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    // The order is the package's own — Books made in the same millisecond follow their ids — and every list keeps it.
    let listed: string[];
    try {
      const preview = await target.inspectDatabaseImport(packagePath);
      expect(preview.books).toHaveLength(MAX_MERGE_BOOKS_LISTED);
      listed = preview.books.map((book) => book.title);
      expect(new Set(listed).size).toBe(MAX_MERGE_BOOKS_LISTED);
      expect(preview.bookCounts).toEqual({ new: MAX_MERGE_BOOKS_LISTED + 5, present: 0, sameTitle: 0 });
      const waiting = await target.prepareDatabaseMerge(preview.previewId, LATER);
      expect(waiting.pending).toMatchObject({ kind: 'merge', mergeBooksTotal: MAX_MERGE_BOOKS_LISTED + 5 });
      expect(waiting.pending!.mergeBooks!.map((book) => book.title)).toEqual(listed);
      target.markCleanShutdown();
    } finally {
      target.close();
    }
    const merged = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(merged.listBooks(null).items.length).toBeGreaterThan(0);
      const read = await merged.inspectDatabaseReplacements();
      expect(read.replacements[0]).toMatchObject({ kind: 'merge', outcome: 'applied', mergedCount: MAX_MERGE_BOOKS_LISTED + 5 });
      expect(read.replacements[0]!.mergedTitles).toEqual(listed!.slice(0, 10));
      merged.markCleanShutdown();
    } finally {
      merged.close();
    }
  }, 180_000);

  it('brings a Book its 编辑工作区方案 pins and its J-03 Task, to data without the 方案 or a connection and to data with its own (Issue #434 review)', async () => {
    // J-03's Task is bound to exact `sample1` lineage: the Book is the admitted public input itself, imported whole.
    const launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let profile: unknown;
    let task: unknown;
    let packagePath: string;
    try {
      ({ bookId } = await importBook(source, join(roots.codeRoot, 'SampleBooks', ADMITTED_BASELINE_DOCX)));
      await source.installEditorialWorkspaceProfile(bookId);
      await source.enableEditorialWorkspaceProfile(bookId);
      const credentialReference = randomUUID();
      source.saveModelServiceConnection('主编辑连接', credentialReference, 'needs-attention');
      source.setModelServiceCredentialState(credentialReference, 'missing');
      let progress = source.createTaskAuthorizationPreparationWork(bookId, J03_TASK_GOAL, launchPolicy);
      while (!progress.done) progress = source.advanceTaskAuthorizationPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      source.authorizeTaskAuthorization(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      profile = await source.inspectEditorialWorkspaceProfile(bookId);
      task = source.inspectTaskAuthorization(bookId);
      expect([(profile as { lifecycle: { state: string } }).lifecycle.state, (task as { state: string }).state]).toEqual(['enabled-for-book', 'authorized']);
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    const carrier = (dataRoot: string): string => join(dataRoot, 'native-artifacts', 'sha256', 'ae', EDITORIAL_WORKSPACE_PROFILE_DIGEST, 'package.json');

    // Data that has neither installed the 方案 nor recorded a connection: the Book brings the 方案 whole, with its carrier.
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(packagePath);
      expect([preview.books.map((entry) => entry.status), preview.mergeNotices]).toEqual([['new'], []]);
      await target.prepareDatabaseMerge(preview.previewId, T);
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'applied' });
      expect(await target.inspectEditorialWorkspaceProfile(bookId)).toEqual(profile);
      expect(existsSync(carrier(otherRoot))).toBe(true);
      // Its Task reads as it was recorded, though this data has no connection of its own to run anything with.
      expect(target.getModelServiceConnection()).toBeNull();
      expect(target.inspectTaskAuthorization(bookId)).toEqual(task);
    } finally {
      target.close();
    }

    // Data with the 方案 installed for a Book of its own and a connection under another credential reference keeps both.
    const thirdRoot = join(dirname(roots.dataRoot), 'third-data');
    target = await EditorialStore.open(thirdRoot, roots.codeRoot);
    let ownReference: string;
    try {
      const own = emptyBook(target, '本机之书');
      await target.installEditorialWorkspaceProfile(own);
      await target.enableEditorialWorkspaceProfile(own);
      ownReference = target.saveModelServiceConnection('本机连接', randomUUID(), 'ready').credentialReference;
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
    } finally {
      target.close();
    }
    const installations = (dataRoot: string): unknown => {
      const db = new DatabaseSync(storeOf(dataRoot), { readOnly: true });
      try {
        return db.prepare('SELECT artifact_id, installed_at FROM native_artifact_installations').all().map((row) => ({ ...row }));
      } finally {
        db.close();
      }
    };
    const installedAt = installations(thirdRoot);
    target = await EditorialStore.open(thirdRoot, roots.codeRoot);
    try {
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'applied' });
      expect(await target.inspectEditorialWorkspaceProfile(bookId)).toEqual(profile);
      expect(target.inspectTaskAuthorization(bookId)).toEqual(task);
      expect(target.getModelServiceConnection()?.credentialReference).toBe(ownReference);
      expect(installations(thirdRoot)).toEqual(installedAt);
    } finally {
      target.close();
    }
  }, 180_000);

  it('lists replacements and merges as one history, newest first, and offers 回退 for the latest replacement (Issue #434 review)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let replacing: string;
    try {
      emptyBook(source, '替换来的书');
      replacing = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    const second = await EditorialStore.open(join(dirname(roots.dataRoot), 'second-data'), roots.codeRoot);
    let merging: string;
    try {
      emptyBook(second, '合并来的书');
      merging = await exportedFrom(second, 'AI7 另一台电脑.ai7db');
    } finally {
      second.close();
    }
    const opened = async (run: (store: EditorialStore) => Promise<void>): Promise<void> => {
      const store = await EditorialStore.open(otherRoot, roots.codeRoot);
      try {
        await run(store);
      } finally {
        store.close();
      }
    };
    // Replaced, exported with that replacement's record, and replaced again from the export: two replacements, the newer
    // the one 回退 offers.
    await opened(async (store) => { await store.prepareDatabaseReplacement((await store.inspectDatabaseImport(replacing)).previewId, T); });
    let replaced = '';
    await opened(async (store) => { replaced = await exportedFrom(store, 'AI7 替换之后.ai7db'); });
    await opened(async (store) => { await store.prepareDatabaseReplacement((await store.inspectDatabaseImport(replaced)).previewId, LATER); });
    let latest = '';
    await opened(async (store) => {
      const read = await store.inspectDatabaseReplacements();
      expect(read.replacements.map((entry) => entry.kind)).toEqual(['replace', 'replace']);
      latest = read.replacements[0]!.replacementId;
      expect(read.rollBackOf).toBe(latest);
      await store.prepareDatabaseMerge((await store.inspectDatabaseImport(merging)).previewId, LATEST);
    });
    // A merge after them is the newest record; 回退 still offers the latest replacement.
    await opened(async (store) => {
      const read = await store.inspectDatabaseReplacements();
      expect(read.replacements.map((entry) => [entry.kind, entry.outcome])).toEqual([['merge', 'applied'], ['replace', 'applied'], ['replace', 'applied']]);
      expect([read.total, read.replacements[1]!.replacementId, read.rollBackOf]).toEqual([3, latest, latest]);
      expect(titles(store)).toEqual(['合并来的书', '替换来的书']);
    });
  }, 180_000);

  it("merges only the Books its staged list names, as its intent names the list, and keeps each merge's Books as rows it verifies (Issue #434 review)", async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      emptyBook(source, '甲书');
      emptyBook(source, '乙书');
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const waiting = await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
      expect(waiting.pending).toMatchObject({ kind: 'merge', mergeBooksTotal: 2 });
      // A list changed since it was written lists no Book while it waits, though the count its intent names stays.
      const list = join(replacementStagingFor(otherRoot), MERGING_BOOKS_FILE);
      const lines = (await readFile(list, 'utf8')).split('\n');
      await writeFile(list, lines.map((line) => line.replace('乙书', '丙书')).join('\n'));
      expect((await target.inspectDatabaseReplacements()).pending).toMatchObject({ mergeBooks: [], mergeBooksTotal: 2 });
    } finally {
      target.close();
    }
    // At the next start it merges nothing, and says what waited had changed.
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([]);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed', failure: 'changed', mergedCount: 0, mergedTitles: [] });
      // Prepared again, with something that is not a file where its list goes: that is what waited having changed too.
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, LATER);
    } finally {
      target.close();
    }
    const list = join(replacementStagingFor(otherRoot), MERGING_BOOKS_FILE);
    await rm(list);
    await mkdir(list);
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual([]);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed', failure: 'changed', mergedCount: 0 });
      // Prepared again and merged: its record names both Books, from rows of its own.
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, new Date(LATER.getTime() + 60_000));
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['乙书', '甲书']);
      const record = (await target.inspectDatabaseReplacements()).replacements[0]!;
      expect([record.outcome, record.mergedCount, [...record.mergedTitles!].sort()]).toEqual(['applied', 2, ['乙书', '甲书']]);
      target.markCleanShutdown();
    } finally {
      target.close();
    }
    // A row rewritten by hand is not the list the record names: 导入记录 does not read.
    const ledger = new DatabaseSync(storeOf(otherRoot));
    try {
      ledger.exec('DROP TRIGGER database_merge_books_no_update');
      ledger.prepare("UPDATE database_merge_books SET title = '丁书' WHERE title = '乙书'").run();
      ledger.exec(DATABASE_MERGE_TRIGGER_SQL.database_merge_books_no_update!);
      // Twenty newer replacement records push it off the page 导入记录 lists: it is verified all the same.
      for (let index = 0; index < MAX_DATABASE_REPLACEMENTS_LISTED; index += 1) {
        const at = new Date(Date.now() + (index + 1) * 60 * 60 * 1000).toISOString();
        const stored = {
          replacementId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, kind: 'replace', outcome: 'failed',
          packageFileName: `AI7 数据库 ${index}.ai7db`, packageSha256: 'a'.repeat(64), backupFileName: `AI7 替换前备份 ${index}.ai7db`,
          backupSha256: 'b'.repeat(64), preparedAt: at, recordedAt: at, failure: 'changed',
        };
        const record = canonicalRecord({ schema: 'ai7.database-replacement/1', ...stored });
        ledger.prepare(
          `INSERT INTO database_replacements(replacement_id, kind, outcome, package_file_name, package_sha256, backup_file_name, backup_sha256, prepared_at, recorded_at, canonical_json, sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(stored.replacementId, stored.kind, stored.outcome, stored.packageFileName, stored.packageSha256, stored.backupFileName,
          stored.backupSha256, stored.preparedAt, stored.recordedAt, record.json, record.digest);
      }
    } finally {
      ledger.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(code(await target.inspectDatabaseReplacements().catch((error: unknown) => error))).toBe('DATABASE_REPLACEMENT_RECORD_INVALID');
      target.markCleanShutdown();
    } finally {
      target.close();
    }
  }, 180_000);

  it('says what stays behind only of the Books merging would take, never of a Book already here (Issue #434 review)', async () => {
    // A Book in a Series, exported alone; then the same data with another Book beside it.
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let first: string;
    let both: string;
    try {
      const bookId = emptyBook(source, '甲书');
      const series = source.createSeries({ title: '合并书系', note: '' });
      const change = source.previewSeriesMembershipChange({ seriesId: series.seriesId, bookId, kind: 'add' });
      source.changeSeriesMembership({ seriesId: series.seriesId, bookId, kind: 'add', previewDigest: change.previewDigest });
      first = await exportedFrom(source, 'AI7 甲书.ai7db');
      emptyBook(source, '乙书');
      both = await exportedFrom(source, 'AI7 两本.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const alone = await target.inspectDatabaseImport(first);
      expect(alone.mergeNotices).toEqual(['series']);
      await target.prepareDatabaseMerge(alone.previewId, T);
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      // 甲书 is here now, its Series left behind; 乙书, the one Book merging would take, is in no Series.
      const next = await target.inspectDatabaseImport(both);
      expect([next.books.map((book) => [book.title, book.status]), next.mergeNotices]).toEqual([[['甲书', 'present'], ['乙书', 'new']], []]);
      target.markCleanShutdown();
    } finally {
      target.close();
    }
  }, 180_000);

  it('commits a merge and its receipt together, or neither (Issue #434 review)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      emptyBook(source, '甲书');
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    const target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
    } finally {
      target.close();
    }
    const staging = replacementStagingFor(otherRoot);
    const intent = parseCanonicalJson((JSON.parse(await readFile(join(staging, 'intent.json'), 'utf8')) as { json: string }).json) as ReplacementIntent;
    const listed = { ...intent.mergeBooks!, path: join(staging, MERGING_BOOKS_FILE) };
    // The receipt is written and then something stops the merge before it commits: neither the Book nor the receipt stays.
    expect(() => mergeIntoStoreFile(otherRoot, join(staging, 'incoming'), listed, (db) => {
      writeMergeReceipt(db, intent, LATER);
      throw new Error('stopped before the merge committed');
    })).toThrowError(DatabaseMergeError);
    const ledger = new DatabaseSync(storeOf(otherRoot), { readOnly: true });
    try {
      const count = (sql: string): number => (ledger.prepare(sql).get() as { n: number }).n;
      expect([count('SELECT count(*) AS n FROM books'), count('SELECT count(*) AS n FROM database_merges'), count('SELECT count(*) AS n FROM database_merge_books')])
        .toEqual([0, 0, 0]);
    } finally {
      ledger.close();
    }
    // Books merged with no receipt, as only something other than AI7 could leave them: the open is refused rather than a record
    // naming fewer Books than came in.
    saveStoreFiles(otherRoot, join(staging, 'store-before'));
    expect(mergeIntoStoreFile(otherRoot, join(staging, 'incoming'), listed)).toBe('merged');
    await writeFile(join(staging, 'phase.json'), JSON.stringify('merging'));
    expect(code(await EditorialStore.open(otherRoot, roots.codeRoot).then((opened) => {
      opened.close();
      return null;
    }, (error: unknown) => error))).toBe('DATABASE_MERGE_RECEIPT_MISSING');
  }, 180_000);

  /** A 资料库 item made of a file the suite writes itself — AI7's own words, never a manuscript. */
  async function libraryItem(store: EditorialStore, title: string, text: string): Promise<string> {
    const path = join(roots.inputRoot, `${title}-${randomUUID()}.txt`);
    await writeFile(path, text);
    const preview = await store.previewLibraryMaterial(path);
    return (await store.addLibraryMaterial({ previewId: preview.previewId, title, kind: 'book' })).materialId;
  }

  function attribute(store: EditorialStore, materialId: string, expectedDecisions: number, bookId: string | null): void {
    store.decideLibraryMaterial({
      materialId, expectedDecisions, decision: { kind: 'attribution', attribution: bookId === null ? { scope: 'house' } : { scope: 'book', bookId } },
    });
  }

  it.each(['writing', 'review', 'evaluation'] as const)('warns about missing %s material pins before merging and after reopening (Issue #759)', async (kind) => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      const { bookId } = await importSample1Book(source, roots.codeRoot, '合成参考合并测试');
      await pinEditorialWorkspaceProfileRevision2(source, bookId);
      recordMissingCredentialConnection(source, '合成参考测试连接');
      const id = await libraryItem(source, '合成参考', '仅用于验证合并提示的合成资料。');
      attribute(source, id, 0, bookId);
      source.decideLibraryMaterial({ materialId: id, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
      source.startMaterialIndexing();
      await source.settleMaterialIndexing();
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
      if (kind === 'writing') {
        let work = source.createWritingPreparationWork(bookId, { ...WRITING_REQUEST, materialIds: [id] }, policy);
        while (!work.done) work = source.advanceWritingPreparationWork(work.workId!);
        expect(work.projection!.taskIntent).not.toBeNull();
      } else if (kind === 'review') {
        let work = source.createReviewRunPreparationWork(bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, policy, null, [id]);
        while (!work.done) work = source.advanceReviewRunPreparationWork(work.workId!);
        expect(work.projection!.run).not.toBeNull();
      } else {
        let work = source.createInitialEvaluationPreparationWork(bookId, policy, [id]);
        while (!work.done) work = source.advanceInitialEvaluationPreparationWork(work.workId!);
        expect(work.projection!.taskIntent).not.toBeNull();
      }
      packagePath = await exportedFrom(source, '合成参考.ai7db');
    } finally { source.close(); }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(packagePath);
      expect(preview.mergeNotices).toEqual(['writing-material']);
      expect(preview.mergeRefusal).toBeNull();
      await target.prepareDatabaseMerge(preview.previewId, T);
    } finally { target.close(); }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect((await target.inspectDatabaseReplacements()).replacements[0]!.outcome).toBe('applied');
      expect((await target.inspectDatabaseImport(packagePath)).mergeNotices).toEqual([]);
      target.markCleanShutdown();
    } finally { target.close(); }
  }, 180_000);

  it("brings a Book's 资料库 items with their whole history and originals, and nothing of the house's (Issue #434 review; ADR 0079 §1.5)", async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    let itemId: string;
    try {
      const bookId = emptyBook(source, '甲书');
      itemId = await libraryItem(source, '甲书参考', '甲书的参考资料');
      attribute(source, itemId, 0, bookId);
      source.decideLibraryMaterial({ materialId: itemId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: '只用于本书' } });
      // The house's own item stays with the house.
      attribute(source, await libraryItem(source, '本社参考', '本社的参考资料'), 0, null);
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(packagePath);
      expect([preview.mergeNotices, preview.mergeRefusal]).toEqual([[], null]);
      await target.prepareDatabaseMerge(preview.previewId, T);
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const item = target.inspectLibraryMaterial(itemId);
      expect([item.attribution, item.eligibility?.choice, item.eligibility?.reason, item.decisionCount]).toEqual([
        expect.objectContaining({ scope: 'book', bookTitle: '甲书' }), 'book', '只用于本书', 2,
      ]);
      expect(target.inspectLibraryMaterials(null).materials.map((entry) => entry.title)).toEqual(['甲书参考']);
      // Its original came with it, whole, under its content's digest.
      const digest = item.source.sha256;
      expect(await readFile(join(otherRoot, 'library-objects', 'sha256', digest.slice(0, 2), `${digest}.txt`), 'utf8')).toBe('甲书的参考资料');
      target.markCleanShutdown();
    } finally {
      target.close();
    }
  }, 180_000);

  it('merges the Book without source-machine translation attempts and preserves destination attempts exactly', async () => {
    let calls = 0;
    const failedAttempt = async (store: EditorialStore, title: string) => {
      const materialId = await libraryItem(store, title, `${title}. This public synthetic reference paragraph is used only for the database merge test.`);
      store.startMaterialIndexing(); await store.settleMaterialIndexing();
      // A synthetic translator supplies closed metadata to exercise database ownership, not live model behavior.
      store.useMaterialTranslator({ refusal: () => null, translate: async () => {
        calls += 1;
        return { kind: 'failed', message: 'Public synthetic failure.', provenance: {
          role: 'Fast Interaction Role', route: 'openai-platform', model: 'gpt-5.6-luna', endpoint: 'https://api.openai.com/v1/responses',
          credentialSlot: 'openai-platform', credentialReference: randomUUID(), policyVersion: 'v25', bindingDigest: sha256Hex(title),
          usage: { inputTokens: 12, outputTokens: 3 }, failureCode: 'PUBLIC_SYNTHETIC_FAILURE',
        } };
      } });
      store.requestMaterialTranslation(materialId); await store.settleMaterialLayers();
      expect(store.inspectLibraryMaterial(materialId).index.translation?.lastAttempt?.outcome).toBe('failed');
      return materialId;
    };
    const records = (root: string) => {
      const database = new DatabaseSync(storeOf(root), { readOnly: true });
      try { return database.prepare('SELECT * FROM material_translation_attempts ORDER BY attempt_id').all(); }
      finally { database.close(); }
    };
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string; let sourceItem: string; let bookId: string;
    try {
      bookId = emptyBook(source, '来源尝试所属图书');
      sourceItem = await failedAttempt(source, 'Public source attempt');
      attribute(source, sourceItem, 0, bookId);
      packagePath = await exportedFrom(source, 'public-attempt-merge.ai7db');
    } finally { source.close(); }
    const sourceRecords = records(roots.dataRoot);
    expect(sourceRecords).toHaveLength(1);
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    let localItem: string; let localRecords: ReturnType<typeof records>;
    try {
      localItem = await failedAttempt(target, 'Public destination attempt');
      localRecords = records(otherRoot);
      const preview = await target.inspectDatabaseImport(packagePath);
      await target.prepareDatabaseMerge(preview.previewId, T);
    } finally { target.close(); }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect((await target.inspectDatabaseReplacements()).replacements[0]?.outcome).toBe('applied');
      expect(target.listBooks(null).items.map((book) => book.bookId)).toContain(bookId);
      expect(target.inspectLibraryMaterial(sourceItem).index.translation?.lastAttempt).toBeUndefined();
      expect(target.inspectLibraryMaterial(localItem).index.translation?.lastAttempt?.outcome).toBe('failed');
      expect(records(otherRoot)).toEqual(localRecords);
      expect(records(roots.dataRoot)).toEqual(sourceRecords);
      const database = new DatabaseSync(storeOf(otherRoot), { readOnly: true });
      try { expect(database.prepare('SELECT count(*) AS count FROM material_index_translations').get()!.count).toBe(0); }
      finally { database.close(); }
      expect(calls).toBe(2);
    } finally { target.close(); }
  });

  it('refuses a merge whose 资料库 item is here already as another, says so before anything is prepared, and records one the data came to refuse meanwhile (Issue #434 review)', async () => {
    const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      const bookId = emptyBook(source, '甲书');
      attribute(source, await libraryItem(source, '甲书参考', '甲书的参考资料'), 0, bookId);
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
    } finally {
      source.close();
    }
    // Prepared while this data lacked the file, which its 资料库 then took as an item of its own meanwhile: at the next start
    // nothing is merged, and the record says the Book's records conflict with the data as it is.
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      await target.prepareDatabaseMerge((await target.inspectDatabaseImport(packagePath)).previewId, T);
      await libraryItem(target, '本机的同一份', '甲书的参考资料');
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    const refusedWords = '图书带来的资料《甲书参考》，本机资料库里已经有同一份文件，不能合并。';
    try {
      expect(titles(target)).toEqual([]);
      expect((await target.inspectDatabaseReplacements()).replacements[0]).toMatchObject({ kind: 'merge', outcome: 'failed', failure: 'conflict', mergedCount: 0 });
      expect(target.inspectLibraryMaterials(null).materials.map((entry) => entry.title)).toEqual(['本机的同一份']);
      // Previewed now, the merge says why it cannot be taken, and preparing it is refused in the same words.
      const preview = await target.inspectDatabaseImport(packagePath);
      expect(preview.mergeRefusal).toBe(refusedWords);
      const refused = await target.prepareDatabaseMerge(preview.previewId, LATER).catch((error: unknown) => error);
      expect([code(refused), (refused as Error).message]).toEqual(['DATABASE_MERGE_LIBRARY_DUPLICATE', refusedWords]);
      expect(existsSync(replacementStagingFor(otherRoot))).toBe(false);
      target.markCleanShutdown();
    } finally {
      target.close();
    }
  }, 180_000);

  it('adds to an item this data already holds only the rest of its history, and refuses one whose history went another way or that a Book not merging held (Issue #434 review)', async () => {
    // Both data folders hold the same 资料库 items, and 丙书: this one's copy was taken from the other, whole.
    let source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let shared: string;
    let held: string;
    let third: string;
    try {
      third = emptyBook(source, '丙书');
      shared = await libraryItem(source, '共同的资料', '两边都有的资料');
      held = await libraryItem(source, '丙书用过的资料', '丙书用过的资料');
      source.markCleanShutdown();
    } finally {
      source.close();
    }
    const diverged = join(dirname(roots.dataRoot), 'diverged-data');
    const fresh = join(dirname(roots.dataRoot), 'fresh-data');
    for (const copyRoot of [otherRoot, diverged, fresh]) cpSync(roots.dataRoot, copyRoot, { recursive: true });
    // Afterwards the shared item goes to a new Book there, and here, in the other copy, to the house.
    source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let packagePath: string;
    try {
      const bookId = emptyBook(source, '乙书');
      attribute(source, shared, 0, bookId);
      packagePath = await exportedFrom(source, 'AI7 数据库.ai7db');
      // The other item goes first to 丙书, which both copies hold, and then to 乙书.
      attribute(source, held, 0, third);
      attribute(source, held, 1, bookId);
    } finally {
      source.close();
    }
    let copy = await EditorialStore.open(diverged, roots.codeRoot);
    try {
      attribute(copy, shared, 0, null);
      copy.markCleanShutdown();
    } finally {
      copy.close();
    }
    // Merged into the copy whose item has no decision since: the item gains the rest of its history, and is 乙书's.
    let target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      const preview = await target.inspectDatabaseImport(packagePath);
      expect([preview.bookCounts, preview.mergeRefusal]).toEqual([{ new: 1, present: 1, sameTitle: 0 }, null]);
      await target.prepareDatabaseMerge(preview.previewId, T);
    } finally {
      target.close();
    }
    target = await EditorialStore.open(otherRoot, roots.codeRoot);
    try {
      expect(titles(target)).toEqual(['丙书', '乙书']);
      const item = target.inspectLibraryMaterial(shared);
      expect([item.attribution, item.decisionCount]).toEqual([expect.objectContaining({ scope: 'book', bookTitle: '乙书' }), 1]);
      expect(target.inspectLibraryMaterials(null).materials.map((entry) => entry.title).sort()).toEqual(['丙书用过的资料', '共同的资料']);
      target.markCleanShutdown();
    } finally {
      target.close();
    }
    // Into the copy where the item went to the house instead: its history went another way, and nothing is prepared.
    copy = await EditorialStore.open(diverged, roots.codeRoot);
    try {
      expect((await copy.inspectDatabaseImport(packagePath)).mergeRefusal).toBe('图书带来的资料《共同的资料》在本机资料库里也有，但两边的记录不同，不能合并。');
      copy.markCleanShutdown();
    } finally {
      copy.close();
    }
    // A package whose item also went to 丙书, a Book that stays here and does not merge, cannot bring that decision.
    source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      packagePath = await exportedFrom(source, 'AI7 数据库 2.ai7db');
    } finally {
      source.close();
    }
    copy = await EditorialStore.open(diverged, roots.codeRoot);
    try {
      const refused = await copy.prepareDatabaseMerge((await copy.inspectDatabaseImport(packagePath)).previewId, T).catch((error: unknown) => error);
      expect(code(refused)).toBe('DATABASE_MERGE_LIBRARY_CONFLICT');
      copy.markCleanShutdown();
    } finally {
      copy.close();
    }
    // Into a copy that took nothing since: the shared item could come, but not the one that also went to 丙书.
    copy = await EditorialStore.open(fresh, roots.codeRoot);
    try {
      expect((await copy.inspectDatabaseImport(packagePath)).mergeRefusal).toBe('图书带来的资料《丙书用过的资料》也归属过没有一起合并的图书，不能合并。');
      copy.markCleanShutdown();
    } finally {
      copy.close();
    }
  }, 240_000);
});


it('validates a historical reader91 source through the existing selected-Book merge callback (#1131)', async () => {
  const source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const bookId = emptyBook(source, '合成历史来源'); await source.close();
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite')); execPre74Fixture(db, 'PRAGMA user_version = 91');
  const packagePath = join(roots.inputRoot, 'reader91.ai7db');
  try { await writeDatabasePackage(db, roots.dataRoot, packagePath, () => ({ dataVersion: 1, schemaRevision: 91,
    softwareVersion: '0.1.0', createdAt: T.toISOString(), origin: 'database-export' })); } finally { db.close(); }
  let target = await EditorialStore.open(otherRoot, roots.codeRoot);
  const preview = await target.inspectDatabaseImport(packagePath); await target.prepareDatabaseMerge(preview.previewId, T);
  await target.close(); target = await EditorialStore.open(otherRoot, roots.codeRoot);
  try {
    expect(target.listBooks(null).items.map((book) => book.bookId)).toContain(bookId);
    expect(target.inspectDataVersion()).toMatchObject({ dataVersion: 1, schemaRevision: LATEST_SCHEMA_VERSION });
  } finally { await target.close(); }
});
