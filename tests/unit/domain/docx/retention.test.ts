import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { canonicalRecord } from '../../../../src/service/analysis/canonical.js';
import { renderDocxExport } from '../../../../src/service/docx-export.js';
import {
  bindWordReadingToRevision,
  requireWordManuscriptSourceSegments,
  retainWordManuscriptSourceSegments,
  retainWordRevisionImport
} from '../../../../src/service/import-retention.js';
import { createWordImportedMarks, validateWordImportedMarkSources } from '../../../../src/service/imported-marks.js';
import { planWordManuscriptExport, readWordManuscriptExportSource } from '../../../../src/service/manuscript-export.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } from '../../../../src/shared/protocol.js';
import { docxDatabase, docxTestHost, wordRetentionFixture } from '../../../support/domain/docx.js';
let db: DatabaseSync;
let fixture: ReturnType<typeof wordRetentionFixture>;
let host: ReturnType<typeof docxTestHost>;
beforeAll(async () => { db = await docxDatabase(); host = docxTestHost(db); });
afterAll(() => db?.close());
beforeEach(() => { db.exec('BEGIN IMMEDIATE'); fixture = host.transaction(host.authority, () => wordRetentionFixture(host.authority)); });
afterEach(() => db.exec('ROLLBACK'));
function insertChoice(selected = fixture.choice): void {
  expect(retainWordRevisionImport(host.authority, fixture.bookId, selected, fixture.recordedAt).digest).toBe(canonicalRecord(selected).digest);
}
function retainMapping(): void {
  insertChoice();
  retainWordManuscriptSourceSegments(host.authority, fixture.bookId, fixture.choice, fixture.compiled.readings.rejected);
}
it('retains the committed Word choice idempotently and refuses drift', () => {
      const { choice, bookId, recordedAt } = fixture;
      insertChoice(choice);
      insertChoice(choice);
      expect(() => retainWordRevisionImport(host.authority, bookId, { ...choice, learnFromEdits: false }, recordedAt)).toThrow('已提交');
    });
it('binds one selected reading idempotently and refuses another Book or reading', () => {
      const { bookId, choice, compiled, bound, sourceVersionId } = fixture;
      insertChoice();
      expect(() => requireWordManuscriptSourceSegments(host.authority, bookId, choice, compiled.readings.rejected)).toThrow('不完整');
      expect(retainWordManuscriptSourceSegments(host.authority, bookId, choice, compiled.readings.rejected).mappingDigest).toBe(bound.mappingDigest);
      expect(retainWordManuscriptSourceSegments(host.authority, bookId, choice, compiled.readings.rejected).mappingDigest).toBe(bound.mappingDigest);
      expect(() => bindWordReadingToRevision(host.authority, randomUUID(), choice.revisionId, sourceVersionId, compiled.readings.rejected)).toThrow();
      expect(() => requireWordManuscriptSourceSegments(host.authority, bookId, choice, compiled.readings.accepted)).toThrow('另一条阅读');
    });
it('rolls back imported marks when their source cannot commit', () => {
      const { bookId, commitId, compiled, markStore, branchId } = fixture;
      retainMapping();
      expect(() => createWordImportedMarks(host.authority, markStore, bookId, commitId, compiled, randomUUID())).toThrow('基线');
      const priorMarks = db.prepare('SELECT count(*) total FROM editorial_marks').get()!.total;
      db.exec(`SAVEPOINT word_mark_rollback;
        CREATE TRIGGER word_mark_source_failure BEFORE INSERT ON word_import_mark_sources
        BEGIN SELECT RAISE(ABORT, 'WORD_MARK_SOURCE_FAILURE'); END`);
      try {
        expect(() => createWordImportedMarks(host.authority, markStore, bookId, commitId, compiled, branchId)).toThrow('WORD_MARK_SOURCE_FAILURE');
      } finally { db.exec('ROLLBACK TO word_mark_rollback; RELEASE word_mark_rollback'); }
      expect(db.prepare('SELECT count(*) total FROM editorial_marks').get()!.total).toBe(priorMarks);
      expect(db.prepare('SELECT count(*) total FROM word_import_mark_sources').get()!.total).toBe(0);
    });
it('creates one pinned source for each imported mark on retry', () => {
      const { bookId, commitId, compiled, markStore, branchId, choice, sourceVersionId } = fixture;
      retainMapping();
      const priorMarks = db.prepare('SELECT count(*) total FROM editorial_marks').get()!.total;
      const record = canonicalRecord(choice);
      const wordMarkCount = createWordImportedMarks(host.authority, markStore, bookId, commitId, compiled, branchId);
      expect(wordMarkCount).toBe(compiled.readings.rejected.marks.length);
      expect(createWordImportedMarks(host.authority, markStore, bookId, commitId, compiled, branchId)).toBe(wordMarkCount);
      expect(() => validateWordImportedMarkSources(host.authority, bookId, commitId, compiled)).not.toThrow();
      expect(db.prepare('SELECT count(*) total FROM editorial_marks').get()!.total).toBe(Number(priorMarks) + wordMarkCount);
      const sourceMarkRows = db.prepare(`SELECT s.*, m.pinned_revision_id, m.book_id FROM word_import_mark_sources s
        JOIN editorial_marks m ON m.mark_id = s.mark_id WHERE s.commit_id = ? ORDER BY s.source_ordinal`).all(commitId);
      expect(sourceMarkRows).toHaveLength(wordMarkCount);
      expect(sourceMarkRows.every((row) => row.book_id === bookId && row.pinned_revision_id === choice.revisionId)).toBe(true);
      expect(JSON.parse(String(sourceMarkRows[0]!.canonical_json))).toMatchObject({ schema: 'ai7.word-import-mark-source/1',
        sourceVersionId, sourceDigest: compiled.sourceDigest, graphDigest: compiled.graphDigest, importCommitId: commitId,
        importChoiceDigest: record.digest, locator: { kind: 'revision', templateKey: compiled.templates[0]!.templateKey } });
    });
it('exports the selected reading only from its pinned Book and original bytes', () => {
      const { bookId, choice, sourceVersionId, originalBytes, bound, commitId } = fixture;
      retainMapping();
      const mapped = readWordManuscriptExportSource(host.authority, bookId, choice.revisionId, sourceVersionId, originalBytes);
      expect(mapped.pins).toMatchObject({ importCommitId: commitId, mappingAncestorRevisionId: choice.revisionId,
        parentSourcePinDigest: choice.parentSourcePinDigest });
      const exportInput = { title: 'Word 对应契约', blocks: bound.blocks, marks: [], options: DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, source: mapped.source };
      expect(renderDocxExport(exportInput, { emit: true }).bytes).not.toBeNull();
      expect(planWordManuscriptExport(exportInput, 'docx', { ...mapped.pins, revisionId: choice.revisionId,
        revisionDigest: String(db.prepare('SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?').get(choice.revisionId)!.revision_digest) }).binding.mode)
        .toBe('suggestions');
      expect(() => readWordManuscriptExportSource(host.authority, randomUUID(), choice.revisionId, sourceVersionId, originalBytes)).toThrow();
      expect(() => readWordManuscriptExportSource(host.authority, bookId, choice.revisionId, sourceVersionId, originalBytes.slice(1))).toThrow('字节');
    });
