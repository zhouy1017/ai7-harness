import { randomUUID } from 'node:crypto';
import { cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, canonicalRecord, sha256Hex } from '../../src/service/analysis/canonical.js';
import { mergeBooks } from '../../src/service/database-merge.js';
import { compileWordTrackedDocx } from '../../src/service/docx.js';
import type { WordTrackedEditSample } from '../../src/service/import-retention.js';
import { EditorialStore } from '../../src/service/store.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx, sourceSpanText } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2): a complete Word manifest of N tracked insertions, imported into one cloned empty Book through
// the public review/commit path, retains every edit as a signal, a learning material, and (in 'suggestions' mode only) a mark.
// It lives apart from `database-merge.test.ts` (#1537, F-14 of #1033): its 2001-edit cases are the longest in the service layer,
// and a file of their own keeps them off that file's critical path. The recipe — composed DOCX, compiled graph, independent
// expected manifest — does not depend on the mode, so it is built once per size; each case still imports it through its own mode.

const storeOf = (dataRoot: string): string => join(dataRoot, 'store', 'ai7.sqlite');

let roots: ServiceTestRoots;
let otherRoot: string;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-word-manifest-');
  otherRoot = join(dirname(roots.dataRoot), 'other-data');
});

afterEach(async () => {
  await roots.dispose();
});

function emptyBook(store: EditorialStore, title: string): string {
  const creation = store.prepareBookCreation(title, null);
  return store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
}

async function importWord(store: EditorialStore, path: string, mode: 'suggestions' | 'accepted-baseline', bookId: string) {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  expect(store.getBookOverview(bookId).manuscriptState.state).toBe('empty');
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'existing-book' as const, bookId, relationship: 'first-manuscript' as const }, false, 'retain',
    { mode, learnFromEdits: true, acceptedBaselineConfirmed: mode === 'accepted-baseline' });
  if (review.reviewDigest === null) throw new Error('expected complete Word review');
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { commit, commitId };
}

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

type ImportedBook = { bookId: string; manuscriptId: string; branchId: string };
type Manifest = Array<{ id: string; digest: string }>;
type ReadyWord = Extract<Awaited<ReturnType<typeof compileWordTrackedDocx>>, { kind: 'ready' }>;

describe('complete Word manifest from one cloned empty Book', () => {
let seed: ServiceTestRoots;
let seedBookId: string;
const recipes = new Map<number, Promise<{ path: string; inserted: string; expected: Manifest }>>();
beforeAll(async () => {
  seed = await createServiceTestRoots('ai7-service-word-manifest-seed-');
  const store = await EditorialStore.open(seed.dataRoot, seed.codeRoot);
  try { seedBookId = emptyBook(store, '同一空图书的两种 Word 阅读'); store.markCleanShutdown(); }
  finally { store.close(); }
});
afterAll(async () => { recipes.clear(); await seed.dispose(); });

function expectedManifest(compiled: ReadyWord, bookId: string, inserted: string, date: string): Manifest {
  const byParagraph = new Map(compiled.graph.events.map((event) => [event.location.paragraphIndex, event]));
  const byEvent = new Map(compiled.graph.atoms.filter((atom) => atom.kind === 'text' && atom.eventMembership.length === 1)
    .map((atom) => [atom.eventMembership[0]!, atom]));
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
    const sample: WordTrackedEditSample = { sampleId: `wts_${sha256Hex(canonicalJson({ schema: 'ai7.word-sample-id/1', bookId: bookId, templateKey }))}`,
      bookId, sourceDigest: compiled.sourceDigest, extractorIdentity: 'ai7-word-tracked-extractor/1', graphDigest: compiled.graphDigest, ...content };
    const record = canonicalRecord({ schema: 'ai7.word-tracked-edit-sample/1', ...sample });
    return { id: sample.sampleId, digest: record.digest };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return expected;
}

/** The mode-independent recipe of `count` insertions: one DOCX, its compiled graph and the independent expected manifest, built once per size. */
function recipe(count: number) {
  let built = recipes.get(count);
  if (built === undefined) {
    built = (async () => {
      const path = join(seed.inputRoot, `word-manifest-${count}.docx`);
      const span = { block: 9, from: 0, to: 5 };
      const inserted = await sourceSpanText(ADMITTED_BASELINE_DOCX, span);
      const date = '2026-10-25T00:00:00Z';
      await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '完整 Word 修改清单', paragraphs: Array.from({ length: count }, (_, index) =>
        ({ runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: span, revision: { kind: 'ins', author: `作者${index}`, date } }] })) });
      const compiled = await compileWordTrackedDocx(path);
      if (compiled.kind !== 'ready') throw new Error('expected supported independent insertion recipe');
      expect(compiled.graph.paragraphs).toHaveLength(count);
      expect(compiled.graph.events).toHaveLength(count);
      // Both modes import into the same cloned empty Book, so its id is the one every sample id is derived from.
      const expected = expectedManifest(compiled, seedBookId, inserted, date);
      expect(new Set(expected.map((entry) => entry.id)).size).toBe(count);
      return { path, inserted, expected };
    })();
    recipes.set(count, built);
  }
  return built;
}

async function verifyWordManifest(store: EditorialStore, book: ImportedBook, commitId: string,
  expected: Manifest, inserted: string, mode: 'suggestions' | 'accepted-baseline'): Promise<void> {
  const signals: Manifest = [];
  for (let offset: number | null = 0; offset !== null;) {
    const page = store.inspectEditorialLearning({ signalOffset: offset, itemOffset: 0 });
    expect(page.signals.length).toBeLessThanOrEqual(30);
    for (const signal of page.signals) {
      if (signal.kind !== 'word-tracked-edit') throw new Error('recipe produced a non-Word signal');
      expect(signal.currentEligibility).toBe('house'); expect(signal.memoryCandidate).toBeNull();
      expect(signal.source.importCommitId).toBe(commitId);
      signals.push({ id: signal.source.sampleId, digest: signal.source.sampleDigest });
    }
    offset = page.nextSignalOffset;
  }
  expect(signals.sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected);
  const materials: string[] = [];
  let after: Parameters<EditorialStore['inspectLearningMaterials']>[1] = null;
  do {
    const page = store.inspectLearningMaterials(book.bookId, after);
    for (const book of page.books) for (const material of book.materials) {
      expect(material.target.kind).toBe('word-tracked-edit'); expect(material.sourceTask).toBeNull();
      expect(material.wordCurrentEligibility).toBe('house'); materials.push(material.materialKey);
    }
    after = page.nextCursor;
  } while (after !== null);
  expect(materials.sort()).toEqual(expected.map((entry) => `word-sample:${entry.id}`).sort());
  const marks = new Set<string>();
  let cursor: string | null = null;
  do {
    const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, cursor);
    expect(window.marksTruncated).toBe(false);
    for (const mark of window.marks) marks.add(mark.markId);
    cursor = window.nextCursor;
  } while (cursor !== null);
  expect(marks.size).toBe(mode === 'suggestions' ? expected.length : 0);
  for (const index of [0, Math.floor(expected.length / 2), expected.length - 1]) {
    const entry = expected[index]!;
    let cursor: Awaited<ReturnType<EditorialStore['inspectWordTrackedEditSample']>>['nextCursor'] = null;
    const text: string[] = [];
    do {
      const page = await store.inspectWordTrackedEditSample({ bookId: book.bookId, sampleId: entry.id, sampleDigest: entry.digest, after: cursor });
      expect(page.items.length).toBeLessThanOrEqual(40);
      for (const item of page.items) if (item.section === 'after' && item.kind === 'text' && item.field === 'text') text.push(item.text ?? '');
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(text.join('')).toBe(inserted);
  }
}

// What each case follows its import with. The 201-edit case runs the whole lifecycle; the 2001-edit cases prove the import of
// every edit in their own mode, and only the 'suggestions' one (the larger: 2001 marks as well) carries it through the
// selected-Book merge, which reads the closed source file and so proves it persisted. Reopening a store and merging it do
// not depend on the mode (the rows are the same signals and materials), and the 'accepted-baseline' merge keeps its own
// single-edit proof in `database-merge.test.ts` ('carries Word accepted-baseline through public package inspection …').
const CASES = [
  { mode: 'suggestions', count: 201, reopen: true, merge: true, name: 'all pages, reopen and selected-Book merge' },
  { mode: 'suggestions', count: 2_001, reopen: false, merge: true, name: 'all pages and selected-Book merge' },
  { mode: 'accepted-baseline', count: 2_001, reopen: false, merge: false, name: 'all pages, with no marks' },
] as const;

for (const { mode, count, reopen, merge, name } of CASES) {
it(`retains the independent ${count}-edit Word manifest through public '${mode}' import, ${name}`, async () => {
  cpSync(seed.dataRoot, roots.dataRoot, { recursive: true });
  const { path, inserted, expected } = await recipe(count);
  let source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const { commit, commitId } = await importWord(source, path, mode, seedBookId);
  expect(commit.bookId).toBe(seedBookId);
  const verify = (store: EditorialStore) => verifyWordManifest(store, commit, commitId, expected, inserted, mode);
  try {
    await verify(source);
    if (reopen) {
      source.markCleanShutdown(); source.close();
      source = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      await verify(source);
    }
    if (merge) emptyBook(source, '未选入的图书');
    source.markCleanShutdown();
  } finally { source.close(); }
  if (!merge) return;
  let target = await EditorialStore.open(otherRoot, roots.codeRoot); target.markCleanShutdown(); target.close();
  withAttached(otherRoot, roots.dataRoot, (db) => mergeBooks(db, [commit.bookId], { source: roots.dataRoot, target: otherRoot }));
  target = await EditorialStore.open(otherRoot, roots.codeRoot);
  try {
    await verify(target);
    expect(target.listBooks(null).items.map((book) => book.bookId)).toEqual([commit.bookId]);
    target.markCleanShutdown();
  } finally { target.close(); }
}, 180_000);
}
});
