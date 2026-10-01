import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../src/service/analysis/canonical.js';
import { ReviewGuidelineLedger, initializeReviewGuidelineSchema } from '../../src/service/review-guidelines.js';
import { MAX_GUIDELINE_MERGED_VERSIONS_SHOWN, MAX_FRAME_BYTES, type ReviewGuidelineDocumentProjection } from '../../src/shared/protocol.js';

// Unit suite for the guideline versions a merged Book brings (Issue #434 review; ADR 0079 §1.5; V2-UX-KB-002): a Review Run
// snapshots each guideline document it applies, clauses included, so a Book merged here brings the exact versions it was
// reviewed under inside its own Runs. 知识库 › 审阅规范文件 shows one this data never had read-only, beside the house's own,
// and never takes it for this data's version of the same number; a merged Run that applied this data's very version counts
// under it, and the house's own Runs are read by number as ever. The store here holds only what the page reads.

const TYPOS = 'typos-and-usage';
const TYPOS_DOCUMENT = 'ai7-builtin/typos-and-usage';
const SOURCE = { displayName: '本社文字规范.txt', format: 'text' as const, sha256: 'a'.repeat(64), bytes: 1 };

function store(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  initializeReviewGuidelineSchema(db);
  db.exec(`
    CREATE TABLE books (book_id TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE review_runs (review_run_id TEXT PRIMARY KEY, book_id TEXT NOT NULL, ordinal INTEGER NOT NULL, created_at TEXT NOT NULL, canonical_json TEXT NOT NULL);
    CREATE TABLE review_run_category_events (review_run_id TEXT NOT NULL, category_id TEXT NOT NULL, state TEXT NOT NULL);
    CREATE TABLE review_findings (review_run_id TEXT NOT NULL, category_id TEXT NOT NULL, clause_ref TEXT, kind_ref TEXT NOT NULL);
    CREATE TABLE database_merges (merge_id TEXT PRIMARY KEY, outcome TEXT NOT NULL);
    CREATE TABLE database_merge_books (merge_id TEXT NOT NULL, book_id TEXT NOT NULL);
  `);
  return db;
}

/** The house's own next version of 文字规范条款, imported as 导入新版本 records it. */
function importVersion(ledger: ReviewGuidelineLedger, clauses: ReadonlyArray<string>): void {
  const preview = ledger.preview(TYPOS_DOCUMENT, { source: SOURCE, paragraphs: clauses.map((text, index) => `${index + 1}. ${text}`) });
  ledger.commit(preview.previewId);
}

/** A Book, merged here by an applied merge or a failed one, or the house's own. */
function book(db: DatabaseSync, bookId: string, title: string, merge: 'applied' | 'failed' | null = null): void {
  db.prepare('INSERT INTO books (book_id, title) VALUES (?, ?)').run(bookId, title);
  if (merge === null) return;
  db.prepare('INSERT INTO database_merges (merge_id, outcome) VALUES (?, ?)').run(`merge-${bookId}`, merge);
  db.prepare('INSERT INTO database_merge_books (merge_id, book_id) VALUES (?, ?)').run(`merge-${bookId}`, bookId);
}

/**
 * A Review Run of the Book whose 错别字与规范用语 formed its findings under the version of 文字规范条款 given, as its snapshot
 * holds it: the number, who issued it, the title and the clauses.
 */
function run(db: DatabaseSync, reviewRunId: string, bookId: string, ordinal: number, version: { version: string; issuer: string; clauses: ReadonlyArray<string> }): void {
  const document = {
    documentId: TYPOS_DOCUMENT,
    title: '文字规范条款',
    issuer: version.issuer,
    version: version.version,
    clauses: version.clauses.map((text, index) => ({ clauseId: `${TYPOS}/${index + 1}`, text })),
  };
  const snapshot = { categories: [{ categoryId: TYPOS, entry: { categoryId: TYPOS, guidelineDocuments: [document] } }] };
  db.prepare('INSERT INTO review_runs (review_run_id, book_id, ordinal, created_at, canonical_json) VALUES (?, ?, ?, ?, ?)')
    .run(reviewRunId, bookId, ordinal, new Date(Date.UTC(2026, 8, 20 + ordinal)).toISOString(), canonicalJson(snapshot));
  db.prepare("INSERT INTO review_run_category_events (review_run_id, category_id, state) VALUES (?, ?, 'materialized')").run(reviewRunId, TYPOS);
}

function typos(db: DatabaseSync): ReviewGuidelineDocumentProjection {
  return new ReviewGuidelineLedger(db).projection().documents.find((document) => document.documentId === TYPOS_DOCUMENT)!;
}

const HOUSE = ['指出错字、别字、多字与漏字。', '指出成分残缺与搭配不当。'];
const THEIRS = ['错字别字一律改正。', '标点按国家标准。', '引文先核对原文。'];

describe('知识库 › 审阅规范文件 after a merge', () => {
  it("shows a version a merged Book was reviewed under and this data never had read-only, never as this data's version of that number", () => {
    const db = store();
    importVersion(new ReviewGuidelineLedger(db), HOUSE);
    book(db, 'b-merged', '合并来的书', 'applied');
    run(db, 'r-merged', 'b-merged', 1, { version: '2', issuer: '本社', clauses: THEIRS });
    // Its findings cite clauses of the version it applied, not of this data's.
    db.prepare("INSERT INTO review_findings (review_run_id, category_id, clause_ref, kind_ref) VALUES ('r-merged', ?, ?, 'k')").run(TYPOS, `${TYPOS}/1`);
    const document = typos(db);
    expect(document.versions.map((version) => [version.ordinal, version.issuer, version.usedByCount])).toEqual([[2, '本社', 0], [1, 'AI7 内置默认', 0]]);
    expect(document.clauses.map((clause) => clause.citations)).toEqual([0, 0]);
    expect(document.mergedVersionCount).toBe(1);
    expect(document.mergedVersions).toEqual([{
      ordinal: 2,
      issuer: '本社',
      title: '文字规范条款',
      clauses: THEIRS.map((text, index) => ({ number: index + 1, text })),
      clauseCount: 3, clausePage: 0, clausePages: 1,
      digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      usedByCount: 1,
      usedBy: [{ bookId: 'b-merged', bookTitle: '合并来的书', reviewRunId: 'r-merged', reviewOrdinal: 1, createdAt: '2026-09-21T00:00:00.000Z' }],
    }]);
    // The Book reads under a version it brought, not under the current one.
    expect(document.olderVersionBooks).toEqual([{ bookId: 'b-merged', bookTitle: '合并来的书', ordinal: 2, merged: true }]);
  });

  it("counts a merged Book's review under this data's version when it applied that very version", () => {
    const db = store();
    importVersion(new ReviewGuidelineLedger(db), HOUSE);
    book(db, 'b-merged', '合并来的书', 'applied');
    run(db, 'r-merged', 'b-merged', 1, { version: '2', issuer: '本社', clauses: HOUSE });
    db.prepare("INSERT INTO review_findings (review_run_id, category_id, clause_ref, kind_ref) VALUES ('r-merged', ?, ?, 'k')").run(TYPOS, `${TYPOS}/1`);
    const document = typos(db);
    expect(document.versions.map((version) => [version.ordinal, version.usedByCount])).toEqual([[2, 1], [1, 0]]);
    expect(document.clauses.map((clause) => clause.citations)).toEqual([1, 0]);
    expect([document.mergedVersions, document.mergedVersionCount, document.olderVersionBooks]).toEqual([[], 0, []]);
  });

  it("reads the house's own reviews by number, and a Book of a merge that failed as the house's", () => {
    const db = store();
    importVersion(new ReviewGuidelineLedger(db), HOUSE);
    book(db, 'b-house', '本社的书');
    book(db, 'b-failed', '没合并成的书', 'failed');
    // Neither Book came by an applied merge: a snapshot that is not this data's version 2 is still read as version 2.
    run(db, 'r-house', 'b-house', 1, { version: '2', issuer: '本社', clauses: THEIRS });
    run(db, 'r-failed', 'b-failed', 2, { version: '1', issuer: 'AI7 内置默认', clauses: THEIRS });
    const document = typos(db);
    expect(document.versions.map((version) => [version.ordinal, version.usedByCount])).toEqual([[2, 1], [1, 1]]);
    expect(document.mergedVersionCount).toBe(0);
    expect(document.olderVersionBooks).toEqual([{ bookId: 'b-failed', bookTitle: '没合并成的书', ordinal: 1, merged: false }]);
  });

  it('names a version this data never reached by its own number, and counts past the versions it names', () => {
    const db = store();
    book(db, 'b-merged', '合并来的书', 'applied');
    // This data never imported a version of its own; the merged Book was reviewed under another house's third.
    run(db, 'r-third', 'b-merged', 1, { version: '3', issuer: '本社', clauses: THEIRS });
    let document = typos(db);
    expect(document.mergedVersions.map((version) => [version.ordinal, version.usedByCount])).toEqual([[3, 1]]);
    expect(document.olderVersionBooks).toEqual([{ bookId: 'b-merged', bookTitle: '合并来的书', ordinal: 3, merged: true }]);
    // More merged versions than the page names: the highest numbers first, and all of them counted.
    for (let index = 0; index < MAX_GUIDELINE_MERGED_VERSIONS_SHOWN; index += 1) {
      book(db, `b-${index}`, `书 ${index}`, 'applied');
      run(db, `r-${index}`, `b-${index}`, 1, { version: String(index + 4), issuer: '本社', clauses: [`第 ${index} 种说法`] });
    }
    document = typos(db);
    expect(document.mergedVersionCount).toBe(MAX_GUIDELINE_MERGED_VERSIONS_SHOWN + 1);
    expect(document.mergedVersions.map((version) => version.ordinal))
      .toEqual(Array.from({ length: MAX_GUIDELINE_MERGED_VERSIONS_SHOWN }, (_, index) => MAX_GUIDELINE_MERGED_VERSIONS_SHOWN + 3 - index));
  });

  it('streams equal-number snapshots, counts every use, and pages all versions and exact clause fragments', () => {
    const db = store();
    try {
      book(db, 'many', '合并来的书', 'applied');
      const long = 'a\u0301'.repeat(1800);
      for (let index = 1; index <= 25; index += 1) run(db, `r-many-${String(index).padStart(2, '0')}`, 'many', index,
        { version: '2', issuer: '本社', clauses: [long] });
      for (let index = 0; index < 12; index += 1) {
        book(db, `other-${index}`, `其他书${index}`, 'applied');
        run(db, `r-other-${index}`, `other-${index}`, 1, { version: '2', issuer: '本社', clauses: [`其他说法${index}`] });
      }
      db.prepare("INSERT INTO review_run_category_events VALUES ('r-many-25', ?, 'materialized')").run(TYPOS);
      const prepare = db.prepare.bind(db);
      const guard = vi.spyOn(db, 'prepare').mockImplementation((sql) => {
        const statement = prepare(sql);
        return new Proxy(statement, { get(target, name) {
          if (name === 'all' && /FROM\s+(?:review_runs|review_run_category_events|review_findings)\b/iu.test(sql) && !/\bLIMIT\b/iu.test(sql)) {
            return () => { throw new Error('unbounded review history read'); };
          }
          const value: unknown = Reflect.get(target, name);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      });
      const ledger = new ReviewGuidelineLedger(db);
      const first = ledger.projection();
      expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(MAX_FRAME_BYTES);
      let document = first.documents.find((item) => item.documentId === TYPOS_DOCUMENT)!;
      expect(document.mergedVersionCount).toBe(13);
      const all = [...document.mergedVersions];
      expect(document.mergedVersions.map((item) => item.digest)).toEqual(document.mergedVersions.map((item) => item.digest).sort());
      while (document.mergedVersionsNext !== null) {
        document = ledger.projection({ documentId: TYPOS_DOCUMENT, mergedVersionsBefore: document.mergedVersionsNext })
          .documents.find((item) => item.documentId === TYPOS_DOCUMENT)!;
        all.push(...document.mergedVersions);
      }
      expect(new Set(all.map((item) => item.digest)).size).toBe(13);
      const version = all.find((item) => item.usedByCount === 25)!;
      expect(version.usedBy.map((item) => item.reviewRunId)).toEqual(['r-many-25', 'r-many-24', 'r-many-23', 'r-many-22', 'r-many-21']);
      const reset = ledger.projection().documents.find((item) => item.documentId === TYPOS_DOCUMENT)!;
      const cursor = reset.mergedVersions.some((item) => item.digest === version.digest) ? null : reset.mergedVersionsNext;
      let recovered = '';
      for (let page = 0; page < version.clausePages; page += 1) {
        const shown = ledger.projection({ documentId: TYPOS_DOCUMENT, mergedVersionsBefore: cursor, mergedClause: { digest: version.digest, page } })
          .documents.find((item) => item.documentId === TYPOS_DOCUMENT)!.mergedVersions.find((item) => item.digest === version.digest)!;
        expect(shown.clausePage).toBe(page);
        recovered += shown.clauses.map((clause) => clause.text).join('');
      }
      expect(recovered === long).toBe(true);
      expect(() => ledger.projection({ documentId: TYPOS_DOCUMENT, mergedClause: { digest: '0'.repeat(64), page: 0 } })).toThrow();
      expect(db.prepare("SELECT name FROM sqlite_temp_schema WHERE name LIKE 'guideline_%'").all()).toEqual([]);
      expect(ledger.projection().documents.find((item) => item.documentId === TYPOS_DOCUMENT)!.mergedVersionCount).toBe(13);
      guard.mockRestore();
    } finally { db.close(); }
  });
});
