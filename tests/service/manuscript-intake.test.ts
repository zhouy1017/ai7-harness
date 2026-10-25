import { execPre74Fixture } from '../support/pre74-schema.js';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, canonicalRecord, isRecord } from '../../src/service/analysis/canonical.js';
import { EditorialStore } from '../../src/service/store.js';
import { compileWordTrackedDocx, parseDocx } from '../../src/service/docx.js';
import {
  MANUSCRIPT_INTAKE_SCHEMA_VERSION,
  TASK_AUTHORIZATION_SCHEMA_VERSION,
  CLARIFICATION_SCHEMA_VERSION, LATEST_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import type { SourceFormat } from '../../src/shared/protocol.js';
import { LOCAL_ONLY_DOC, localOnlyAvailable, localOnlyPath } from '../support/local-only-manuscripts.js';
import { importSample1Book, requireExactSample1, sample1Path } from '../support/sample1-baseline.js';
import { syntheticPdfBytes } from '../support/synthetic-pdf.js';
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
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx } from '../support/composed-fixture.js';
import { buildSyntheticTrackedDocx } from '../support/synthetic-docx.js';
import { MAX_FRAME_BYTES } from '../../src/shared/protocol.js';

// Service-integration suite (L2) for multi-format intake (ADR 0072 §1–2). It drives the real
// `EditorialStore` on a temporary Agent Data Root without Electron. The admitted material it reads
// is exact `sample1`, through the shared baseline support; every other input is synthetic. Legacy
// binary `.doc` intake is the one route only a real legacy document can stand for, and ADR 0079 §5
// left that document local-only, so its two cases form their own gated suite after the conversion
// section and skip wherever the material is absent. Every file is read in place and spoken of in
// counts and digests alone.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-intake-');
});

afterEach(async () => {
  await roots.dispose();
});

/** The Source Version relations exactly as revision 17 left them: parsed, DOCX-only, never null. */
const REVISION_17_SOURCE_VERSIONS_SQL = `CREATE TABLE source_versions (
  source_version_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
  content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
  structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
  parser_identity TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format = 'DOCX'),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(book_id, source_digest)
) STRICT`;
const REVISION_17_SOURCE_PROVENANCE_SQL = `CREATE TABLE source_provenance (
  provenance_id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
  locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
  sanitized_identity TEXT NOT NULL,
  parser_identity TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT`;
const REVISION_17_SOURCE_TRIGGER_SQL = `
  CREATE TRIGGER abandonment_cleanup_block_source_insert
  BEFORE INSERT ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_source_update
  BEFORE UPDATE OF object_digest ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_source_update_v5
  BEFORE UPDATE ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
`;
const REVISION_17_SOURCE_VERSION_COLUMNS =
  'source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest, ' +
  'parser_identity, format, display_name, created_at';
const REVISION_17_PROVENANCE_COLUMNS =
  'provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at';
const REVISION_17_DRAFT_COLUMNS =
  'draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path, ' +
  'reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at, reviewed_at, committed_at, ' +
  'reviewed_target_kind, reviewed_existing_book_id, reviewed_relationship, reviewed_book_state_digest, ' +
  'reviewed_reuse_source_version_id, reviewed_lineage_status, reviewed_lineage_source_version_id, ' +
  'reviewed_checkpoint_revision_id, reviewed_manuscript_id, reviewed_branch_id';

function tableRows(database: DatabaseSync, table: string, columns = '*'): Row[] {
  return database.prepare(`SELECT ${columns} FROM ${table} ORDER BY rowid`).all() as Row[];
}

/** How many content objects the Agent Data Root actually holds, whatever the records say. */
async function countObjectFiles(dataRoot: string): Promise<number> {
  const entries = await readdir(join(dataRoot, 'objects'), { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).length;
}

/** Take a store back to the revision-17 shape: the narrow relations, and no draft format. */
function downgradeToRevision17(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
    execPre74Fixture(database, `BEGIN IMMEDIATE;
      DROP TRIGGER abandonment_cleanup_block_source_insert;
      DROP TRIGGER abandonment_cleanup_block_source_update;
      DROP TRIGGER abandonment_cleanup_block_source_update_v5;
      ALTER TABLE source_versions RENAME TO source_versions_v18;
      ALTER TABLE source_provenance RENAME TO source_provenance_v18;
      ${REVISION_17_SOURCE_VERSIONS_SQL};
      INSERT INTO source_versions(${REVISION_17_SOURCE_VERSION_COLUMNS})
        SELECT ${REVISION_17_SOURCE_VERSION_COLUMNS} FROM source_versions_v18 ORDER BY rowid;
      ${REVISION_17_SOURCE_PROVENANCE_SQL};
      INSERT INTO source_provenance(${REVISION_17_PROVENANCE_COLUMNS})
        SELECT ${REVISION_17_PROVENANCE_COLUMNS} FROM source_provenance_v18 ORDER BY rowid;
      DROP TABLE source_versions_v18;
      DROP TABLE source_provenance_v18;
      ${REVISION_17_SOURCE_TRIGGER_SQL}
      ALTER TABLE import_drafts DROP COLUMN source_format;
      ALTER TABLE import_drafts DROP COLUMN working_object_digest;
      ALTER TABLE import_drafts DROP COLUMN converter_identity;
      ALTER TABLE import_abandonment_cleanup_intents DROP COLUMN working_object_digest;
      ${[...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER].map((relation) => `DROP TABLE ${relation};`).join(' ')}
      ${PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER.map((relation) => `DROP TABLE ${relation};`).join(' ')}
      ${PUBLICATION_VERSION_RELATIONS_DROP_ORDER.map((relation) => `DROP TABLE ${relation};`).join(' ')}
      ${REVIEW_RUN_RELATIONS_DROP_ORDER.map((relation) => `DROP TABLE ${relation};`).join(' ')}
      DROP TABLE manuscript_effect_receipts;
      DROP TABLE manuscript_effect_dispatches;
      DROP TABLE manuscript_effect_approvals;
      DROP TABLE manuscript_effect_targets;
      DROP TABLE manuscript_effect_intents;
      DROP TABLE proposal_decision_reasons;
      DROP TABLE proposal_item_decisions;
      DROP TABLE proposal_change_items;
      DROP TABLE editorial_mark_replies;
      DROP TABLE editorial_marks;
      DROP TABLE manuscript_entry_positions;
      PRAGMA user_version = ${TASK_AUTHORIZATION_SCHEMA_VERSION};
      COMMIT;`);
    database.exec('PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON;');
  } finally {
    database.close();
  }
}

const encoder = new TextEncoder();

function concat(...parts: Array<Uint8Array | string>): Uint8Array {
  const encoded = parts.map((part) => (typeof part === 'string' ? encoder.encode(part) : part));
  const buffer = new Uint8Array(encoded.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of encoded) {
    buffer.set(part, offset);
    offset += part.length;
  }
  return buffer;
}

/** One stored ZIP local entry, enough for the router and for the parser to read the archive. */
function zipStoredEntry(name: string, data: string): Uint8Array {
  const nameBytes = encoder.encode(name);
  const dataBytes = encoder.encode(data);
  const header = new Uint8Array(30);
  header.set([0x50, 0x4b, 0x03, 0x04], 0);
  header[18] = dataBytes.length & 0xff;
  header[22] = dataBytes.length & 0xff;
  header[26] = nameBytes.length & 0xff;
  header[27] = (nameBytes.length >> 8) & 0xff;
  return concat(header, nameBytes, dataBytes);
}

const ODF_TEXT = 'application/vnd.oasis.opendocument.text';

/** Store refusals are read by their code; the message is product copy and not the assertion. */
function expectStoreErrorCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`Expected a ${code} refusal.`);
}

/** Opens the store at the test's data root again and closes it cleanly; its open-time truth checks are the proof. */
async function expectStoreReopens(): Promise<void> {
  const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  reopened.markCleanShutdown();
  reopened.close();
}

/** 导入稿件 → 作为来源材料导入 → 新建图书, committed and acknowledged. */
async function commitSourceOnlyNewBook(
  store: EditorialStore,
  path: string,
  confirmedTitle: string,
): Promise<{ bookId: string; sourceVersionId: string; format: SourceFormat }> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion, {
    kind: 'new-book', choiceId: 'new-book', confirmedTitle, relationship: 'source-only',
  });
  const commitId = randomUUID();
  const commit = await store.commitSourceImport({
    draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId,
  });
  expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
  return { bookId: commit.bookId, sourceVersionId: commit.sourceVersionId, format: commit.source.format };
}

/** Synthetic inputs only: bytes with no manuscript content, in every format the router recognises. */
const SOURCE_ONLY_INPUTS: ReadonlyArray<{ format: SourceFormat; fileName: string; bytes: () => Uint8Array; reason: string }> = [
  {
    format: 'PDF', fileName: '固定版式样例.pdf', bytes: syntheticPdfBytes,
    reason: 'PDF 为固定版式，没有可靠的可编辑往返；可作为来源材料保留。',
  },
  {
    format: 'RTF', fileName: '样例.rtf', bytes: () => concat('{\\rtf1\\ansi\\deff0}'),
    reason: '该格式的本地转换尚未提供；可作为来源材料保留。',
  },
  {
    format: 'ODT', fileName: '样例.odt', bytes: () => zipStoredEntry('mimetype', ODF_TEXT),
    reason: '该格式的本地转换尚未提供；可作为来源材料保留。',
  },
  {
    format: 'UNKNOWN', fileName: '未知样例.dat', bytes: () => Uint8Array.of(0xff, 0xfe, 0x00, 0x41, 0x42),
    reason: '无法识别文件格式；可作为来源材料保留。',
  },
];

describe('native Word reading preparation over the real store', () => {
  it('refuses a corrupt off-page Word signal before the first page and keeps source pairs current after manuscript edits', async () => {
    const path = join(roots.inputRoot, 'word-current-source-batch.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '完整当前来源验证', paragraphs: Array.from({ length: 35 }, (_, index) =>
      ({ runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
        revision: { kind: 'ins', author: `作者${index}`, date: '2026-10-25T00:00:00Z' } }] })) });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false, 'retain',
        { mode: 'accepted-baseline', learnFromEdits: true, acceptedBaselineConfirmed: true });
      if (review.reviewDigest === null) throw new Error('expected complete current-source review');
      const commitId = randomUUID();
      const book = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
      await store.acknowledgeImportCompletion(commitId);
      const first = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
      expect(first.signals).toHaveLength(30); expect(first.nextSignalOffset).toBe(30);
      const signal = first.signals[0]!;
      if (signal.kind !== 'word-tracked-edit') throw new Error('expected actual Word signal');
      const originalSource = structuredClone(signal.source);
      Reflect.set(signal.source, 'graphDigest', 'e'.repeat(64));
      expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!.source).toEqual(originalSource);
      const detailInput = { bookId: book.bookId, sampleId: signal.source.sampleId, sampleDigest: signal.source.sampleDigest, after: null };
      const detail = await store.inspectWordTrackedEditSample(detailInput);
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        const oldest = db.prepare('SELECT * FROM learning_signals ORDER BY rowid LIMIT 1').get()!;
        expect(first.signals.some((entry) => entry.signalId === oldest.signal_id)).toBe(false);
        const raw: unknown = JSON.parse(String(oldest.canonical_json));
        if (!isRecord(raw) || !isRecord(raw.source)) throw new Error('expected canonical Word source fixture');
        const corrupt = canonicalRecord({ ...raw, source: { ...raw.source, graphDigest: 'f'.repeat(64) } });
        const trigger = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'learning_signals_no_update'").get()?.sql;
        if (typeof trigger !== 'string') throw new Error('expected exact signal immutability trigger');
        const replace = (json: string, digest: string): void => {
          db.exec('BEGIN IMMEDIATE; DROP TRIGGER learning_signals_no_update');
          db.prepare('UPDATE learning_signals SET canonical_json = ?, sha256 = ? WHERE signal_id = ?').run(json, digest, oldest.signal_id!);
          db.exec(trigger); db.exec('COMMIT');
        };
        replace(corrupt.json, corrupt.digest);
        try {
          expect(() => store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 })).toThrow();
          expect(() => store.inspectLearningMaterials(book.bookId)).toThrow();
        } finally { replace(String(oldest.canonical_json), String(oldest.sha256)); }
      } finally { db.close(); }
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = window.blocks[0]!;
      store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
        blockId: block.blockId, windowStartBlockId: block.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
        fromGrapheme: 0, toGrapheme: 0, insertText: '〔编辑〕' });
      expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals.every((entry) => entry.currentEligibility === 'house')).toBe(true);
      expect((await store.inspectWordTrackedEditSample(detailInput)).detailDigest).toBe(detail.detailDigest);
      store.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 0 });
      expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals.every((entry) => entry.currentEligibility === 'excluded')).toBe(true);
      expect((await store.inspectWordTrackedEditSample(detailInput)).detailDigest).toBe(detail.detailDigest);
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('refuses an unsupported tracked story for both first-manuscript modes while preserving the old source-only route', async () => {
    const path = join(roots.inputRoot, 'word-unsupported-story.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '范围外修订', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
        revision: { kind: 'ins', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
    ], footnoteRevision: { text: { block: 10, from: 0, to: 5 }, author: '作者', date: '2026-10-25T00:00:00Z' } });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      expect(staged.wordTrackedChanges).toMatchObject({ compatibility: 'unsupported', reasonCodes: ['story-or-text-box-revision'] });
      for (const mode of ['suggestions', 'accepted-baseline'] as const) expect(() => store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false, 'retain',
        { mode, learnFromEdits: true, acceptedBaselineConfirmed: mode === 'accepted-baseline' })).toThrow(expect.objectContaining({ code: 'WORD_INTAKE_UNSUPPORTED' }));
      expect(store.listBooks(null).items).toEqual([]);
      const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value, relationship: 'source-only' });
      const commitId = randomUUID();
      const committed = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
        reviewDigest: review.reviewDigest, commitId });
      await store.acknowledgeImportCompletion(commitId);
      expect(store.getBookOverview(committed.bookId).manuscriptState.state).toBe('empty');
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try { for (const table of ['word_revision_sources', 'word_revision_imports', 'word_tracked_edit_samples', 'learning_signals']) {
        expect(db.prepare(`SELECT count(*) total FROM ${table}`).get()!.total).toBe(0);
      } } finally { db.close(); }
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('refuses a stale Word learning-control pin before committing any Book, source, sample or signal', async () => {
    const path = join(roots.inputRoot, 'word-stale-learning.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '准入变化', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
        revision: { kind: 'ins', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
    ] });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false, 'retain',
        { mode: 'suggestions', learnFromEdits: true, acceptedBaselineConfirmed: false });
      if (review.reviewDigest === null) throw new Error('expected Word review before control drift');
      store.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
      await expect(store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
        reviewDigest: review.reviewDigest, commitId: randomUUID() })).rejects.toMatchObject({ code: 'REVIEW_CHANGED' });
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try { for (const table of ['books', 'source_versions', 'import_commits', 'word_revision_sources', 'word_revision_imports',
        'word_tracked_edit_samples', 'word_tracked_edit_sample_imports', 'learning_signals']) {
        expect(db.prepare(`SELECT count(*) total FROM ${table}`).get()!.total).toBe(0);
      } } finally { db.close(); }
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('reads every raw Unicode fragment and nullable metadata through public detail pages without writing, then resumes the exact cursor after reopen', async () => {
    const path = join(roots.inputRoot, 'word-unicode-detail.docx');
    const author = '\\😀e\u0301"'.repeat(2_000);
    const fragments = Array.from({ length: 520 }, (_, index) => `${index === 0 ? '😀' : ''}${'\u0301'.repeat(5)}`);
    const runs = fragments.map((text) => `<w:r><w:t>${text}</w:t></w:r>`).join('');
    await writeFile(path, buildSyntheticTrackedDocx(`<w:p><w:r><w:t>base</w:t></w:r><w:ins w:id="" w:author="${author.replace(/"/gu, '&quot;')}" w:date="">${runs}</w:ins></w:p>`));
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false, 'retain',
        { mode: 'accepted-baseline', learnFromEdits: true, acceptedBaselineConfirmed: true });
      if (review.reviewDigest === null) throw new Error('expected complete Unicode Word preparation');
      const commitId = randomUUID();
      const committed = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
      await store.acknowledgeImportCompletion(commitId);
      const signal = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!;
      if (signal.kind !== 'word-tracked-edit') throw new Error('expected one exact Unicode Word sample');
      const input = { bookId: committed.bookId, sampleId: signal.source.sampleId, sampleDigest: signal.source.sampleDigest };
      let cursor: Awaited<ReturnType<EditorialStore['inspectWordTrackedEditSample']>>['nextCursor'] = null;
      const seen = new Set<string>(); const after: string[] = []; const metadata = new Map<string, string | null>();
      let detailDigest = ''; let pages = 0; let splitCluster = false;
      let saved: { cursor: NonNullable<Awaited<ReturnType<EditorialStore['inspectWordTrackedEditSample']>>['nextCursor']>;
        page: Awaited<ReturnType<EditorialStore['inspectWordTrackedEditSample']>> } | null = null;
      do {
        const page = await store.inspectWordTrackedEditSample({ ...input, after: cursor });
        if (cursor !== null && saved === null) saved = { cursor, page };
        if (detailDigest !== '') expect(page.detailDigest).toBe(detailDigest); detailDigest = page.detailDigest;
        expect(page.items.length).toBeLessThanOrEqual(40);
        expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThanOrEqual(MAX_FRAME_BYTES - 8192);
        const beforePageLength = after.length;
        for (const item of page.items) if (item.kind === 'text') {
          if (item.section === 'after' && item.field === 'text') {
            if (beforePageLength > 0 && after.length === beforePageLength && item.text?.startsWith('\u0301')) splitCluster = true;
            after.push(item.text ?? '');
          }
          if (item.section === 'events') {
            const prior = metadata.get(item.field);
            metadata.set(item.field, item.text === null ? null : `${prior ?? ''}${item.text}`);
          }
        }
        cursor = page.nextCursor; pages += 1;
        if (cursor !== null) { const key = JSON.stringify(cursor); expect(seen.has(key)).toBe(false); seen.add(key); }
      } while (cursor !== null);
      expect(pages).toBeGreaterThan(10); expect(splitCluster).toBe(true);
      expect(after).toEqual(fragments);
      expect(metadata).toEqual(new Map([['rawId', ''], ['rawAuthor', author], ['rawDate', ''], ['rangeName', null]]));
      await expect(store.inspectWordTrackedEditSample({ ...input, after: { schema: 'ai7.word-sample-cursor/1', sampleDigest: input.sampleDigest,
        detailDigest, section: 'after', entryOrdinal: 0, field: 'text', codeUnitOffset: 1 } })).rejects.toMatchObject({ code: 'WORD_SAMPLE_CURSOR_INVALID' });
      await expect(store.inspectWordTrackedEditSample({ ...input, bookId: randomUUID(), after: null })).rejects.toMatchObject({ code: 'WORD_SAMPLE_INVALID' });
      if (saved === null) throw new Error('expected a public continuation page');
      store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(await store.inspectWordTrackedEditSample({ ...input, after: saved.cursor })).toEqual(saved.page);
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try { expect(db.prepare('SELECT count(*) total FROM learning_eligibility_decisions').get()!.total).toBe(0);
        expect(db.prepare('SELECT count(*) total FROM learning_signals').get()!.total).toBe(1); } finally { db.close(); }
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('rolls the whole Word import back when signal capture fails and retries the same durable commit once', async () => {
    const path = join(roots.inputRoot, 'word-atomic-rollback.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '原子导入', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
        revision: { kind: 'ins', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
    ] });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const reviewed = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false, 'retain',
        { mode: 'suggestions', learnFromEdits: true, acceptedBaselineConfirmed: false });
      if (reviewed.reviewDigest === null) throw new Error('expected Word review before fault injection');
      const input = { draftId: staged.draftId, expectedDraftVersion: reviewed.draftVersion, reviewDigest: reviewed.reviewDigest, commitId: randomUUID() };
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        db.exec(`CREATE TRIGGER word_capture_atomic_failure BEFORE INSERT ON learning_signals
          WHEN json_extract(NEW.canonical_json, '$.kind') = 'word-tracked-edit'
          BEGIN SELECT RAISE(ABORT, 'WORD_ATOMIC_CAPTURE_FAILURE'); END`);
        await expect(store.commitNewBookImport(input)).rejects.toThrow('WORD_ATOMIC_CAPTURE_FAILURE');
        for (const table of ['books', 'manuscripts', 'source_versions', 'source_provenance', 'manuscript_import_records', 'import_commits',
          'word_revision_sources', 'word_revision_imports', 'word_manuscript_source_segments', 'word_import_mark_sources',
          'word_tracked_edit_samples', 'word_tracked_edit_sample_imports', 'learning_signals', 'editorial_marks']) {
          expect(db.prepare(`SELECT count(*) total FROM ${table}`).get()!.total).toBe(0);
        }
        expect(db.prepare('SELECT state FROM import_commit_attempts WHERE attempt_id = ?').get(input.commitId)!.state).toBe('prepared');
        expect(db.prepare('SELECT state FROM import_drafts WHERE draft_id = ?').get(staged.draftId)!.state).toBe('reviewed');
        expect(db.prepare('SELECT count(*) total FROM staged_word_revision_intakes').get()!.total).toBe(1);
        db.exec('DROP TRIGGER word_capture_atomic_failure');
        const committed = await store.commitNewBookImport(input);
        expect((await store.commitNewBookImport(input)).revisionId).toBe(committed.revisionId);
        expect(db.prepare('SELECT count(*) total FROM import_commits').get()!.total).toBe(1);
        expect(db.prepare('SELECT count(*) total FROM word_revision_imports').get()!.total).toBe(1);
        expect(db.prepare('SELECT count(*) total FROM word_tracked_edit_samples').get()!.total).toBe(1);
        expect(db.prepare('SELECT count(*) total FROM learning_signals').get()!.total).toBe(1);
        await store.acknowledgeImportCompletion(input.commitId);
      } finally { db.close(); }
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('reuses an unchanged actual /3 original and proves mode-independent samples by cloning one empty Book', async () => {
    const path = join(roots.inputRoot, 'word-preserved-original.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '原来源独立于阅读', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
        revision: { kind: 'ins', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
    ] });
    const base = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let sourceVersionId: string;
    let provenanceId: string;
    try {
      const staged = await base.stageSelectedManuscript(randomUUID(), path);
      const reviewed = base.prepareSourceImportReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value, relationship: 'source-only' });
      const commitId = randomUUID();
      const source = await base.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: reviewed.draftVersion,
        reviewDigest: reviewed.reviewDigest, commitId });
      await base.acknowledgeImportCompletion(commitId);
      bookId = source.bookId; sourceVersionId = source.sourceVersionId; provenanceId = source.provenance.provenanceId;
      expect(base.getBookOverview(bookId).manuscriptState.state).toBe('empty');
      base.markCleanShutdown();
    } finally { base.close(); }
    const baseDb = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    let oldSource: Row;
    let oldProvenance: Row;
    try {
      oldSource = baseDb.prepare('SELECT rowid, * FROM source_versions WHERE source_version_id = ?').get(sourceVersionId)!;
      oldProvenance = baseDb.prepare('SELECT rowid, * FROM source_provenance WHERE provenance_id = ?').get(provenanceId)!;
      expect(oldSource.parser_identity).toBe('ai7-docx-fflate-saxes/3');
    } finally { baseDb.close(); }
    const alias = join(roots.inputRoot, 'word-same-bytes-other-name.docx');
    await copyFile(path, alias);
    const manifests: Row[][] = [];
    for (const mode of ['suggestions', 'accepted-baseline'] as const) {
      const dataRoot = join(roots.inputRoot, `word-clone-${mode}`);
      await cp(roots.dataRoot, dataRoot, { recursive: true });
      let store = await EditorialStore.open(dataRoot, roots.codeRoot);
      try {
        const staged = await store.stageSelectedManuscript(randomUUID(), alias);
        const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
          { kind: 'existing-book', bookId, relationship: 'first-manuscript' }, false, 'retain',
          { mode, learnFromEdits: true, acceptedBaselineConfirmed: mode === 'accepted-baseline' });
        if (review.reviewDigest === null) throw new Error('expected complete preserved-source Word review');
        const commitId = randomUUID();
        const committed = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
          reviewDigest: review.reviewDigest, commitId });
        expect(committed.source.displayName).toBe('word-same-bytes-other-name.docx');
        await store.acknowledgeImportCompletion(commitId);
        store.markCleanShutdown(); store.close();
        store = await EditorialStore.open(dataRoot, roots.codeRoot);
        expect(store.getBookOverview(bookId).manuscriptState.state).toBe('populated');
        const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
        try {
          expect(db.prepare('SELECT rowid, * FROM source_versions WHERE source_version_id = ?').get(sourceVersionId)).toEqual(oldSource);
          expect(db.prepare('SELECT rowid, * FROM source_provenance WHERE provenance_id = ?').get(provenanceId)).toEqual(oldProvenance);
          expect(db.prepare('SELECT count(*) total FROM source_versions WHERE book_id = ?').get(bookId)!.total).toBe(1);
          expect(db.prepare('SELECT source_version_id, parent_parser_identity FROM word_revision_sources').get())
            .toEqual({ source_version_id: sourceVersionId, parent_parser_identity: 'ai7-docx-fflate-saxes/3' });
          manifests.push(db.prepare('SELECT sample_id, template_key, sha256, canonical_json FROM word_tracked_edit_samples ORDER BY sample_id').all());
        } finally { db.close(); }
        store.markCleanShutdown();
      } finally { store.close(); }
    }
    expect(manifests[0]!.length).toBeGreaterThan(0);
    expect(manifests[1]).toEqual(manifests[0]);
  });

  it.each(['ai7-docx-fflate-saxes/1', 'ai7-docx-fflate-saxes/2'] as const)(
    'reuses frozen historical %s source-only rows without rewriting them under either Word reading', async (parserIdentity) => {
    const path = join(roots.inputRoot, 'word-historical-boundary.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '历史来源仍归原解析器', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } }], markRevision: { kind: 'del', author: '作者', date: '2026-10-25T00:00:00Z' } },
      { runs: [{ text: { block: 9, from: 0, to: 10 } }] },
    ] });
    // Frozen historical metadata fixture, not an execution of /1 or /2: both old readers leave these two literal paragraphs
    // unchanged. A source-only record has no import fidelity review, mark conversion or manuscript mapping to relabel.
    const literalBlocks: string[] = [];
    await parseDocx(path, 'word-historical-boundary.docx', (block) => { literalBlocks.push(block.text); });
    expect(literalBlocks).toHaveLength(2);
    const base = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let sourceVersionId: string;
    try {
      const staged = await base.stageSelectedManuscript(randomUUID(), path);
      const prepared = base.prepareSourceImportReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value, relationship: 'source-only' });
      const commitId = randomUUID();
      const imported = await base.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: prepared.draftVersion,
        reviewDigest: prepared.reviewDigest, commitId });
      await base.acknowledgeImportCompletion(commitId);
      bookId = imported.bookId; sourceVersionId = imported.sourceVersionId;
      base.markCleanShutdown();
    } finally { base.close(); }
    const baseline = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    let originalSource: Row;
    let originalProvenance: Row[];
    let originalSourceImports: Row[];
    try {
      baseline.prepare('UPDATE source_versions SET parser_identity = ? WHERE source_version_id = ?').run(parserIdentity, sourceVersionId);
      baseline.prepare('UPDATE source_provenance SET parser_identity = ? WHERE source_version_id = ?').run(parserIdentity, sourceVersionId);
      originalSource = baseline.prepare('SELECT rowid, * FROM source_versions WHERE source_version_id = ?').get(sourceVersionId)!;
      originalProvenance = baseline.prepare('SELECT rowid, * FROM source_provenance WHERE source_version_id = ? ORDER BY rowid').all(sourceVersionId);
      originalSourceImports = baseline.prepare('SELECT rowid, * FROM source_import_records ORDER BY rowid').all();
    } finally { baseline.close(); }
    for (const mode of ['suggestions', 'accepted-baseline'] as const) {
      const dataRoot = join(roots.inputRoot, `historical-word-${mode}`);
      await cp(roots.dataRoot, dataRoot, { recursive: true });
      let store = await EditorialStore.open(dataRoot, roots.codeRoot);
      try {
        const staged = await store.stageSelectedManuscript(randomUUID(), path);
        const prepared = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
          { kind: 'existing-book', bookId, relationship: 'first-manuscript' }, false, 'retain',
          { mode, learnFromEdits: true, acceptedBaselineConfirmed: mode === 'accepted-baseline' });
        if (prepared.reviewDigest === null) throw new Error('expected historical-source Word preparation');
        const commitId = randomUUID();
        const imported = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: prepared.draftVersion,
          reviewDigest: prepared.reviewDigest, commitId });
        await store.acknowledgeImportCompletion(commitId);
        store.markCleanShutdown(); store.close();
        store = await EditorialStore.open(dataRoot, roots.codeRoot);
        expect(store.getManuscriptWindow(imported.manuscriptId, imported.branchId, null).blocks.map((block) => block.text))
          .toEqual(mode === 'suggestions' ? literalBlocks : [literalBlocks.join('')]);
        const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
        try {
          expect(db.prepare('SELECT rowid, * FROM source_versions WHERE source_version_id = ?').get(sourceVersionId)).toEqual(originalSource);
          expect(db.prepare('SELECT rowid, * FROM source_provenance WHERE source_version_id = ? AND parser_identity = ? ORDER BY rowid')
            .all(sourceVersionId, parserIdentity)).toEqual(originalProvenance);
          expect(db.prepare('SELECT rowid, * FROM source_import_records ORDER BY rowid').all()).toEqual(originalSourceImports);
          expect(db.prepare('SELECT count(*) total FROM source_versions').get()!.total).toBe(1);
          expect(db.prepare('SELECT parent_parser_identity FROM word_revision_sources').get()!.parent_parser_identity).toBe(parserIdentity);
        } finally { db.close(); }
        expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals).toHaveLength(1);
        store.markCleanShutdown();
      } finally { store.close(); }
    }
  });

  it.each([{ mode: 'suggestions', learnFromEdits: true, globalEnabled: true, bookExcluded: false },
    { mode: 'accepted-baseline', learnFromEdits: true, globalEnabled: true, bookExcluded: false },
    { mode: 'suggestions', learnFromEdits: false, globalEnabled: true, bookExcluded: false },
    { mode: 'suggestions', learnFromEdits: true, globalEnabled: false, bookExcluded: false },
    { mode: 'accepted-baseline', learnFromEdits: true, globalEnabled: true, bookExcluded: true }] as const)(
    'atomically commits, retries and reopens native Word $mode with learning $learnFromEdits, global $globalEnabled and Book exclusion $bookExcluded', async ({ mode, learnFromEdits, globalEnabled, bookExcluded }) => {
    const path = join(roots.inputRoot, `word-${mode}.docx`);
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '双阅读完整导入', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } },
        { text: { block: 9, from: 0, to: 5 }, revision: { kind: 'del', author: '作者甲', date: '2026-10-25T00:00:00Z' } },
        { text: { block: 10, from: 0, to: 6 }, revision: { kind: 'ins', author: '作者乙', date: '2026-10-25T00:00:01Z' } },
        { text: { block: 11, from: 0, to: 8 } }] },
    ] });
    const compiled = await compileWordTrackedDocx(path);
    if (compiled.kind !== 'ready') throw new Error('expected supported real Word compilation');
    const reading = compiled.readings[mode === 'suggestions' ? 'rejected' : 'accepted'];
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      if (!globalEnabled) store.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
      let emptyBookId: string | null = null;
      if (bookExcluded) {
        const creation = store.prepareBookCreation('已排除学习的空图书', null);
        emptyBookId = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
        store.changeEditorialLearning({ kind: 'book', bookId: emptyBookId, excluded: true, expectedEntries: 0 });
      }
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        emptyBookId === null ? { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }
          : { kind: 'existing-book', bookId: emptyBookId, relationship: 'first-manuscript' }, false, 'retain',
        { mode, learnFromEdits, acceptedBaselineConfirmed: mode === 'accepted-baseline' });
      if (review.reviewDigest === null) throw new Error('expected complete Word preparation');
      const capture = learnFromEdits && globalEnabled && !bookExcluded;
      expect(review.wordLearning).toEqual({ globalEnabled, bookExcluded, sourceTemplateCount: compiled.templates.length,
        eligibleSampleCount: capture ? compiled.templates.length : 0 });
      const input = { draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId: randomUUID() };
      const committed = await store.commitNewBookImport(input);
      expect((await store.commitNewBookImport(input)).revisionId).toBe(committed.revisionId);
      await store.acknowledgeImportCompletion(input.commitId);
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getBookOverview(committed.bookId).manuscriptState.state).toBe('populated');
      expect(store.getManuscriptWindow(committed.manuscriptId, committed.branchId, null).blocks.map((block) => block.digest))
        .toEqual(reading.blocks.map((block) => block.digest));
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      let sample: { sampleId: string; digest: string } | null = null;
      try {
        expect(db.prepare('SELECT count(*) total FROM word_revision_sources').get()!.total).toBe(1);
        expect(db.prepare('SELECT count(*) total FROM word_revision_imports').get()!.total).toBe(1);
        expect(db.prepare('SELECT count(*) total FROM word_tracked_edit_samples').get()!.total).toBe(capture ? compiled.templates.length : 0);
        expect(db.prepare('SELECT count(*) total FROM word_tracked_edit_sample_imports').get()!.total).toBe(capture ? compiled.templates.length : 0);
        expect(db.prepare('SELECT count(*) total FROM learning_signals').get()!.total).toBe(capture ? compiled.templates.length : 0);
        expect(db.prepare('SELECT count(*) total FROM word_import_mark_sources').get()!.total).toBe(reading.marks.length);
        expect(db.prepare('SELECT count(*) total FROM manuscript_block_sources WHERE revision_id = ?').get(committed.revisionId)!.total).toBe(0);
        expect(db.prepare('SELECT content_digest FROM source_versions').get()!.content_digest).toBe(compiled.readings[compiled.previewReading].contentDigest);
        if (capture) {
          const row = db.prepare('SELECT sample_id, sha256 FROM word_tracked_edit_samples ORDER BY sample_id LIMIT 1').get()!;
          sample = { sampleId: String(row.sample_id), digest: String(row.sha256) };
        }
      } finally { db.close(); }
      if (sample !== null) {
        const signals = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals;
        expect(signals.length).toBe(compiled.templates.length);
        expect(signals.every((signal) => signal.kind === 'word-tracked-edit' && signal.currentEligibility === 'house' && signal.memoryCandidate === null)).toBe(true);
        const materials = store.inspectLearningMaterials(committed.bookId).books[0]!.materials;
        expect(materials).toHaveLength(compiled.templates.length);
        const material = materials.find((entry) => entry.materialKey === `word-sample:${sample.sampleId}`)!;
        expect(material).toMatchObject({ kind: 'word-tracked-edit', sourceTask: null, decisions: 0, decision: null,
          wordCurrentEligibility: 'house', target: { kind: 'word-tracked-edit', bookId: committed.bookId, sampleId: sample.sampleId, sampleDigest: sample.digest } });
        const lineage = store.inspectLearningLineage(committed.bookId, material.materialKey);
        expect(lineage.automaticAdmission?.choice).toBe('house');
        expect(lineage.downstream).toEqual({ signals: 0, memoryCandidates: 0, activeMemories: 0, tasks: 0 });
        expect(store.inspectLearningAudit({ bookId: committed.bookId, kind: 'word-tracked-edit' }).books[0]!.materials).toHaveLength(compiled.templates.length);
        const objectDb = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
        let originalObjectPath: string;
        try { originalObjectPath = join(roots.dataRoot, 'objects', ...String(objectDb.prepare('SELECT relative_key FROM content_objects WHERE object_digest = ?')
          .get(compiled.sourceDigest)!.relative_key).split('/')); } finally { objectDb.close(); }
        const originalBytes = await readFile(path);
        const changedBytes = Buffer.from(originalBytes); changedBytes[0] = changedBytes[0]! ^ 1;
        await writeFile(originalObjectPath, changedBytes);
        try {
          expect(() => store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 })).toThrow(expect.objectContaining({ code: 'WORD_SOURCE_UNAVAILABLE' }));
          expect(() => store.inspectLearningMaterial(committed.bookId, material.materialKey)).toThrow(expect.objectContaining({ code: 'WORD_SOURCE_UNAVAILABLE' }));
          await expect(store.inspectWordTrackedEditSample({ bookId: committed.bookId, sampleId: sample.sampleId, sampleDigest: sample.digest, after: null }))
            .rejects.toMatchObject({ code: 'WORD_SOURCE_UNAVAILABLE' });
        } finally { await writeFile(originalObjectPath, originalBytes); }
        expect(store.inspectLearningMaterial(committed.bookId, material.materialKey).wordCurrentEligibility).toBe('house');
        const sourceSignal = signals.find((signal) => signal.source.materialKey === material.materialKey)!;
        expect(() => store.createEditorialMemory({ clientMemoryId: randomUUID(), signalId: sourceSignal.signalId,
          title: '不得从 Word 创建记忆', editorialDimension: 'copy-edit', confidence: 0.5 })).toThrow();
        expect(() => store.createEditorialMemory({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(), signalIds: [sourceSignal.signalId],
          applicability: { kind: 'book', bookId: committed.bookId }, title: '不得从 Word 创建第二版记忆',
          editorialDimension: 'typos-and-usage', confidence: 0.5 })).toThrow();
        expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).items).toEqual([]);
        const remediation = store.previewLearningRemediation({ bookId: committed.bookId,
          items: [{ materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: 0 }] });
        expect(remediation.included.map((entry) => entry.materialKey)).toEqual([material.materialKey]);
        store.recordLearningRemediation({ bookId: committed.bookId, previewDigest: remediation.previewDigest,
          items: [{ materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: 0 }] });
        expect(store.inspectLearningMaterial(committed.bookId, material.materialKey).wordCurrentEligibility).toBe('excluded');
        expect(store.inspectLearningLineage(committed.bookId, material.materialKey).automaticAdmission).toBeNull();
        const detail = await store.inspectWordTrackedEditSample({ bookId: committed.bookId, sampleId: sample.sampleId, sampleDigest: sample.digest, after: null });
        expect(detail.sectionCounts.before).toBeGreaterThan(0);
        expect(detail.sectionCounts.after).toBeGreaterThan(0);
        expect(detail.sourceDigest).toBe(compiled.sourceDigest);
      }
      if (!globalEnabled || bookExcluded) {
        if (!globalEnabled) store.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 1 });
        else store.changeEditorialLearning({ kind: 'book', bookId: committed.bookId, excluded: false, expectedEntries: 1 });
        expect(store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals).toEqual([]);
        const check = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
        try { expect(check.prepare('SELECT count(*) total FROM word_tracked_edit_samples').get()!.total).toBe(0); } finally { check.close(); }
      }
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('keeps tracked source-only import on the actual historical reader without Word capture', async () => {
    const path = join(roots.inputRoot, 'word-source-only.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '来源修订保留', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 } }, { text: { block: 9, from: 0, to: 5 },
        revision: { kind: 'ins', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
    ] });
    const old = await parseDocx(path, 'word-source-only.docx', () => undefined);
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      expect(staged.wordTrackedChanges?.compatibility).toBe('ready');
      const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value, relationship: 'source-only' });
      expect(review.retainedBoundary).toMatchObject({ contentDigest: old.contentDigest, structureDigest: old.structureDigest });
      const commitId = randomUUID();
      const committed = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
        reviewDigest: review.reviewDigest, commitId });
      await store.acknowledgeImportCompletion(commitId);
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getBookOverview(committed.bookId).manuscriptState.state).toBe('empty');
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        expect(db.prepare('SELECT parser_identity, content_digest, structure_digest FROM source_versions WHERE source_version_id = ?')
          .get(committed.sourceVersionId)).toEqual({ parser_identity: old.parserIdentity, content_digest: old.contentDigest, structure_digest: old.structureDigest });
        for (const table of ['word_revision_sources', 'word_revision_imports', 'word_tracked_edit_samples', 'word_tracked_edit_sample_imports', 'learning_signals']) {
          expect(db.prepare(`SELECT count(*) total FROM ${table}`).get()!.total).toBe(0);
        }
      } finally { db.close(); }
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('keeps an all-deleted file on its usable rejected reading and refuses its empty accepted baseline', async () => {
    const path = join(roots.inputRoot, 'word-all-deleted.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '全文删除修订', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 }, revision: { kind: 'del', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
    ] });
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      expect(staged.wordTrackedChanges).toMatchObject({ compatibility: 'ready', previewReading: 'rejected',
        readings: { rejected: { usable: true, blockCount: 1 }, accepted: { usable: false, blockCount: 0 } }, savedChoice: null });
      const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value } as const;
      expect(() => store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false, 'retain',
        { mode: 'accepted-baseline', learnFromEdits: true, acceptedBaselineConfirmed: true })).toThrow('没有可编辑');
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false, 'retain',
        { mode: 'suggestions', learnFromEdits: true, acceptedBaselineConfirmed: false });
      if (review.reviewDigest === null) throw new Error('expected usable all-deleted review');
      const commitId = randomUUID();
      const committed = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion,
        reviewDigest: review.reviewDigest, commitId });
      await store.acknowledgeImportCompletion(commitId);
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getManuscriptWindow(committed.manuscriptId, committed.branchId, null).blocks).toHaveLength(1);
      const signal = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 }).signals[0]!;
      if (signal.kind !== 'word-tracked-edit') throw new Error('expected all-deleted Word sample');
      const detail = await store.inspectWordTrackedEditSample({ bookId: committed.bookId, sampleId: signal.source.sampleId,
        sampleDigest: signal.source.sampleDigest, after: null });
      expect(detail.operationKind).toBe('delete'); expect(detail.sectionCounts.before).toBeGreaterThan(0); expect(detail.sectionCounts.after).toBe(0);
      store.markCleanShutdown();
    } finally { store.close(); }
  });

  it('stages an all-inserted preview without choosing a baseline and reopens the explicitly confirmed accepted preparation', async () => {
    const path = join(roots.inputRoot, 'word-all-inserted.docx');
    await composeRevisedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '原始修订导入', paragraphs: [
      { runs: [{ text: { block: 8, from: 0, to: 10 }, revision: { kind: 'ins', author: '作者', date: '2026-10-25T00:00:00Z' } }] },
    ] });
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      expect(staged.wordTrackedChanges).toEqual({ compatibility: 'ready', previewReading: 'accepted',
        readings: { rejected: { usable: false, blockCount: 0 }, accepted: { usable: true, blockCount: 1 } }, savedChoice: null });
      const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value } as const;
      expect(() => store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false, 'retain',
        { mode: 'suggestions', learnFromEdits: true, acceptedBaselineConfirmed: false })).toThrow('没有可编辑');
      expect(() => store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false, 'retain',
        { mode: 'accepted-baseline', learnFromEdits: true, acceptedBaselineConfirmed: false })).toThrow();
      const choice = { mode: 'accepted-baseline', learnFromEdits: false, acceptedBaselineConfirmed: true } as const;
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false, 'retain', choice);
      expect(review.reviewDigest).not.toBeNull();
      expect(review.trackedChanges).toEqual(choice);
      expect(store.listBooks(null).items).toEqual([]);
      store.markCleanShutdown(); store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const startup = await store.getImportStartup();
      expect(startup.state).toBe('draft-recovery');
      if (startup.state !== 'draft-recovery') throw new Error('expected prepared Word draft recovery');
      expect(startup.recovery.snapshotState).toBe('complete');
      expect(startup.recovery.staged?.wordTrackedChanges).toMatchObject({ savedChoice: choice });
      const continued = await store.continueImportDraft(staged.draftId, review.draftVersion);
      expect(continued.state).toBe('review-ready');
      if (continued.state !== 'review-ready') throw new Error('expected exact prepared Word continuation');
      expect(continued.review).toMatchObject({ reviewDigest: review.reviewDigest, trackedChanges: choice });
      expect(store.listBooks(null).items).toEqual([]);
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        expect(db.prepare('SELECT parser_identity, block_count FROM staged_import_snapshots WHERE draft_id = ?').get(staged.draftId))
          .toEqual(expect.objectContaining({ parser_identity: 'ai7-docx-word-revisions/1', block_count: 1 }));
        expect(db.prepare('SELECT count(*) total FROM staged_import_block_sources WHERE draft_id = ?').get(staged.draftId)!.total).toBe(0);
        expect(db.prepare('SELECT count(*) total FROM learning_signals').get()!.total).toBe(0);
      } finally { db.close(); }
      store.markCleanShutdown();
    } finally { store.close(); }
  });
});

describe('multi-format intake over the real store', () => {
  it('reads a DOCX exactly as before, whatever its name says', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
      expect(staged.source.format).toBe('DOCX');
      expect(staged.editableImport).toEqual({ available: true });
      expect(staged.detectedBlockCount).toBeGreaterThan(0);
      expect(staged.fidelity.length).toBeGreaterThan(0);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it.each(SOURCE_ONLY_INPUTS)(
    'stages $format source-only and commits a Source Version with no parse',
    async ({ format, fileName, bytes, reason }) => {
      const selectedPath = join(roots.inputRoot, fileName);
      await writeFile(selectedPath, bytes());
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      let commitId: string;
      try {
        const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
        expect(staged.source.format).toBe(format);
        expect(staged.editableImport).toEqual({
          available: false,
          code: 'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT',
          reason,
        });
        // Nothing was parsed, so nothing is claimed: no fidelity, no blocks, the file name as title.
        expect(staged.fidelity).toEqual([]);
        expect(staged.detectedBlockCount).toBe(0);
        expect(staged.titleSuggestion.sourceLabel).toBe('文件名');

        // Editable import is refused whatever a client asks for, not only in the surface.
        expectStoreErrorCode(
          () => store.prepareNewBookReview(staged.draftId, staged.draftVersion,
            { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '不应创建' }, false),
          'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT',
        );

        const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion, {
          kind: 'new-book', choiceId: 'new-book', confirmedTitle: `来源材料 ${format}`, relationship: 'source-only',
        });
        expect(review.retainedBoundary).toMatchObject({
          format,
          label: '保留完整所选原始文件及其精确身份；未进行本地解析',
          contentDigest: null,
          structureDigest: null,
        });
        commitId = randomUUID();
        const commit = await store.commitSourceImport({
          draftId: staged.draftId,
          expectedDraftVersion: review.draftVersion,
          reviewDigest: review.reviewDigest,
          commitId,
        });
        expect(commit.completionLabel).toBe('来源材料已导入');
        expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
        store.markCleanShutdown();
      } finally {
        store.close();
      }

      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        expect(tableRows(database, 'source_versions', 'format, content_digest, structure_digest, parser_identity'))
          .toEqual([{ format, content_digest: null, structure_digest: null, parser_identity: null }]);
        expect(tableRows(database, 'source_provenance', 'parser_identity')).toEqual([{ parser_identity: null }]);
        // The retained original keeps its own extension, never the DOCX one.
        expect(tableRows(database, 'content_objects', 'relative_key')).toEqual([
          { relative_key: expect.stringMatching(new RegExp(`\\${OBJECT_EXTENSIONS[format]}$`, 'u')) },
        ]);
        expect(tableRows(database, 'staged_import_snapshots')).toEqual([]);
        expect(tableRows(database, 'manuscripts')).toEqual([]);
      } finally {
        database.close();
      }

      // The store's open-time truth checks read the unparsed original as the store wrote it (#552).
      await expectStoreReopens();
    },
    120_000,
  );

  it('reopens over a parsed non-DOCX source import and a reviewed reuse of an unparsed original', async () => {
    const textPath = join(roots.inputRoot, '来源说明.txt');
    await writeFile(textPath, '第一段说明。\n\n第二段说明。\n');
    const pdfPath = join(roots.inputRoot, '固定版式样例.pdf');
    await writeFile(pdfPath, syntheticPdfBytes());
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let pdfBookId: string;
    let pdfSourceVersionId: string;
    let reuse: { draftId: string; draftVersion: number; reviewDigest: string };
    try {
      const text = await commitSourceOnlyNewBook(store, textPath, '来源材料 TXT');
      expect(text.format).toBe('TXT');
      const pdf = await commitSourceOnlyNewBook(store, pdfPath, '来源材料 PDF');
      expect(pdf.format).toBe('PDF');
      pdfBookId = pdf.bookId;
      pdfSourceVersionId = pdf.sourceVersionId;

      // The same file again into its own Book, reusing the unparsed Source Version, reviewed and left uncommitted.
      const staged = await store.stageSelectedManuscript(randomUUID(), pdfPath);
      const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion, {
        kind: 'existing-book', bookId: pdfBookId, relationship: 'source-only', reuseSourceVersionId: pdfSourceVersionId,
      });
      reuse = { draftId: staged.draftId, draftVersion: review.draftVersion, reviewDigest: review.reviewDigest };
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const commitId = randomUUID();
      const commit = await store.commitSourceImport({
        draftId: reuse.draftId, expectedDraftVersion: reuse.draftVersion, reviewDigest: reuse.reviewDigest, commitId,
      });
      expect(commit.sourceVersionId).toBe(pdfSourceVersionId);
      expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    await expectStoreReopens();
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect(tableRows(database, 'source_import_records', 'book_id, source_version_disposition')
        .filter((row) => row.book_id === pdfBookId)
        .map((row) => row.source_version_disposition)
        .sort()).toEqual(['created', 'reused-same-book']);
    } finally {
      database.close();
    }
  }, 120_000);

  it('refuses at open a Source Version whose format does not say whether it was parsed (Issue #583)', async () => {
    const textPath = join(roots.inputRoot, '来源说明.txt');
    await writeFile(textPath, '第一段说明。\n\n第二段说明。\n');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect((await commitSourceOnlyNewBook(store, textPath, '来源材料 TXT')).format).toBe('TXT');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // A parsed TXT with its working representation taken away: its record still reads, since the working object is not in
    // it, but no Source Version the store writes is parsed without being a DOCX or converted.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.exec("UPDATE source_versions SET working_object_digest = NULL, converter_identity = NULL WHERE format = 'TXT'");
    } finally {
      database.close();
    }
    const opened = await EditorialStore.open(roots.dataRoot, roots.codeRoot).then((reopened) => {
      reopened.close();
      return null;
    }, (error: unknown) => error);
    expect([(opened as { code?: unknown } | null)?.code, opened instanceof Error ? opened.message : null]).toEqual(['SCHEMA_INVALID', '来源版本的格式与是否解析不一致。']);
  }, 120_000);

  /** Opens the store at the test's data root and returns its refusal as `[code, message]`, or `[null, null]` when it opened. */
  async function openRefusal(): Promise<[unknown, string | null]> {
    const opened = await EditorialStore.open(roots.dataRoot, roots.codeRoot).then((reopened) => {
      reopened.close();
      return null;
    }, (error: unknown) => error);
    return [(opened as { code?: unknown } | null)?.code ?? null, opened instanceof Error ? opened.message : null];
  }

  it('refuses at open a converted Source Version that no longer names its converter (Issue #583)', async () => {
    const textPath = join(roots.inputRoot, '来源说明.txt');
    await writeFile(textPath, '第一段说明。\n\n第二段说明。\n');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect((await commitSourceOnlyNewBook(store, textPath, '来源材料 TXT')).format).toBe('TXT');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The working representation stays and its converter goes: the format still says the TXT was parsed, so the format
    // check passes, but no Source Version the store writes holds one of the two conversion columns without the other.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.exec("UPDATE source_versions SET converter_identity = NULL WHERE format = 'TXT'");
    } finally {
      database.close();
    }
    expect(await openRefusal()).toEqual(['SCHEMA_INVALID', '来源版本的转换记录不完整。']);
  }, 120_000);

  it('refuses at open an unparsed Source Version that names a converter without a working representation (Issue #583)', async () => {
    const pdfPath = join(roots.inputRoot, '固定版式样例.pdf');
    await writeFile(pdfPath, syntheticPdfBytes());
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect((await commitSourceOnlyNewBook(store, pdfPath, '来源材料 PDF')).format).toBe('PDF');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // A converter named on a row with nothing converted: unparsed with no working object, so the format check passes,
    // but the two conversion columns are set together or null together.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.exec("UPDATE source_versions SET converter_identity = 'ai7.test-converter/1' WHERE format = 'PDF'");
    } finally {
      database.close();
    }
    expect(await openRefusal()).toEqual(['SCHEMA_INVALID', '来源版本的转换记录不完整。']);
  }, 120_000);

  it('refuses at open a DOCX Source Version given a working representation (Issue #583)', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect((await commitSourceOnlyNewBook(store, sample1Path(roots.codeRoot), '来源材料 DOCX')).format).toBe('DOCX');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // Both conversion columns set, together, on a format the product reads natively: the DOCX is parsed either way, so
    // the format check passes, but the store converts only TXT, MD and DOC.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.exec("UPDATE source_versions SET working_object_digest = object_digest, converter_identity = 'ai7.test-converter/1' WHERE format = 'DOCX'");
    } finally {
      database.close();
    }
    expect(await openRefusal()).toEqual(['SCHEMA_INVALID', '来源版本的格式不能带有转换记录。']);
  }, 120_000);

  /** Synthetic text in each format the product converts to a working representation that a test can author. */
  const LABELLED_INPUTS = [
    { format: 'TXT', fileName: '合成纯文本.txt', text: '第一段。\n\n第二段。\n' },
    { format: 'MD', fileName: '合成标记.md', text: '# 合成标题\n\n一段正文。\n' },
  ] as const;
  const OLD_PARSED_LABEL = '保留完整所选 DOCX 文件及本地解析出的完整内容与结构身份';

  /** The label a converted record carries since Issue #583: its original format, and that it was converted. */
  const convertedLabel = (format: string): string => `保留完整所选 ${format} 文件及本地转换出的完整内容与结构身份（已转换）`;

  /**
   * Writes `label` into every stored Source Import Record's boundary and, when asked, seals the record digest over it
   * again, so that the label check alone stands between the row and a clean open.
   */
  function rewriteRecordLabel(label: string, resealDigest: boolean): void {
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      for (const row of tableRows(database, 'source_import_records')) {
        const boundary = { ...(JSON.parse(String(row.retained_boundary_json)) as Record<string, unknown>), label };
        const digest = resealDigest
          ? createHash('sha256').update(canonicalJson({
              schema: 'ai7.source-import-record/1',
              sourceImportRecordId: row.source_import_record_id,
              commitId: row.commit_id,
              bookId: row.book_id,
              sourceVersionId: row.source_version_id,
              provenanceId: row.provenance_id,
              targetKind: row.target_kind,
              sourceVersionDisposition: row.source_version_disposition,
              retainedBoundary: boundary,
              namedNonEffects: JSON.parse(String(row.named_non_effects_json)),
              importedAt: row.imported_at,
            })).digest('hex')
          : String(row.record_digest);
        database.prepare(
          'UPDATE source_import_records SET retained_boundary_json = ?, record_digest = ? WHERE source_import_record_id = ?',
        ).run(canonicalJson(boundary), digest, String(row.source_import_record_id));
      }
    } finally {
      database.close();
    }
  }

  it.each(LABELLED_INPUTS)(
    'labels a new converted $format source with its original format and says it was converted (Issue #583)',
    async ({ format, fileName, text }) => {
      const selectedPath = join(roots.inputRoot, fileName);
      await writeFile(selectedPath, concat(text));
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
        const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion, {
          kind: 'new-book', choiceId: 'new-book', confirmedTitle: `来源材料 ${format}`, relationship: 'source-only',
        });
        expect(review.retainedBoundary.format).toBe(format);
        expect(review.retainedBoundary.label).toBe(convertedLabel(format));
        const commitId = randomUUID();
        const commit = await store.commitSourceImport({
          draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId,
        });
        expect(commit.retainedBoundary.label).toBe(convertedLabel(format));
        expect(commit.receipt.record.retainedBoundary).toMatchObject({ format, label: convertedLabel(format) });
        expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
        store.markCleanShutdown();
      } finally {
        store.close();
      }
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const [record] = tableRows(database, 'source_import_records', 'retained_boundary_json');
        expect(JSON.parse(String(record?.retained_boundary_json))).toMatchObject({ format, label: convertedLabel(format) });
      } finally {
        database.close();
      }
      await expectStoreReopens();
    },
    120_000,
  );

  it.each(LABELLED_INPUTS)(
    'still opens and reads a stored $format source record that carries the label it was written with before (Issue #583)',
    async ({ format, fileName, text }) => {
      const selectedPath = join(roots.inputRoot, fileName);
      await writeFile(selectedPath, concat(text));
      let bookId: string;
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        bookId = (await commitSourceOnlyNewBook(store, selectedPath, `来源材料 ${format}`)).bookId;
        store.markCleanShutdown();
      } finally {
        store.close();
      }
      // A record from before the label named its format: the DOCX label on a converted source, its digest sealed over it.
      rewriteRecordLabel(OLD_PARSED_LABEL, true);
      const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const record = reopened.getBookOverview(bookId).records.find((candidate) => candidate.kind === 'source-import-record');
        // Nothing rewrote it: the record reads with the label it was stored with.
        expect(record).toMatchObject({ retainedBoundary: { format, label: OLD_PARSED_LABEL } });
        reopened.markCleanShutdown();
      } finally {
        reopened.close();
      }
    },
    120_000,
  );

  it('keeps the DOCX label on a DOCX source and refuses the converted label there (Issue #583)', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
      const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion, {
        kind: 'new-book', choiceId: 'new-book', confirmedTitle: '来源材料 DOCX', relationship: 'source-only',
      });
      expect(review.retainedBoundary).toMatchObject({ format: 'DOCX', label: OLD_PARSED_LABEL });
      const commitId = randomUUID();
      await store.commitSourceImport({
        draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId,
      });
      expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    await expectStoreReopens();
    rewriteRecordLabel(convertedLabel('DOCX'), true);
    expect((await openRefusal())[0]).toBe('SCHEMA_INVALID');
  }, 120_000);

  it.each([
    ['another format’s converted label', convertedLabel('MD'), true],
    ['the label of an unparsed original', '保留完整所选原始文件及其精确身份；未进行本地解析', true],
    ['a label the product never wrote', '保留完整所选 TXT 文件', true],
    ['a changed label under the digest it was sealed with', convertedLabel('MD'), false],
  ] as const)('refuses at open a converted TXT source record carrying %s (Issue #583)', async (_name, label, resealDigest) => {
    const textPath = join(roots.inputRoot, '来源说明.txt');
    await writeFile(textPath, '第一段说明。\n\n第二段说明。\n');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect((await commitSourceOnlyNewBook(store, textPath, '来源材料 TXT')).format).toBe('TXT');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    rewriteRecordLabel(label, resealDigest);
    expect((await openRefusal())[0]).toBe('SCHEMA_INVALID');
  }, 120_000);

  it('keeps refusing a hostile archive instead of retaining it', async () => {
    // A traversal entry name is a hostile-input bound, not a "this is not a DOCX" verdict, so it
    // stays a refusal with no source-only offer.
    const selectedPath = join(roots.inputRoot, '恶意.docx');
    await writeFile(selectedPath, zipStoredEntry('../escape.xml', '<Types/>'));
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await expect(store.stageSelectedManuscript(randomUUID(), selectedPath)).rejects.toMatchObject({ code: 'DOCX_REJECTED' });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('retains a ZIP that is not a WordprocessingML package as an unrecognised original', async () => {
    const selectedPath = join(roots.inputRoot, '并非稿件.docx');
    await writeFile(selectedPath, zipStoredEntry('readme.txt', 'not a package'));
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
      expect(staged.source.format).toBe('UNKNOWN');
      expect(staged.editableImport.available).toBe(false);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);
});

const OBJECT_EXTENSIONS: Readonly<Record<SourceFormat, string>> = {
  DOCX: '.docx', DOC: '.doc', PDF: '.pdf', ODT: '.odt', RTF: '.rtf', TXT: '.txt', MD: '.md', UNKNOWN: '.bin',
};

const DOC_CONVERTER = 'ai7-doc-to-docx/1';
/** The local-only legacy document, with the identity `SampleBooks/README.md` records for it. */
const LOCAL_DOC_SHA256 = '931d8035946f7689aaaa25c14c5822f46eedc59d23925081ded7b06618d9e4d2';
const LOCAL_DOC_BYTES = LOCAL_ONLY_DOC.bytes;
/** What this converter makes of it: a derived object's digest, and its body paragraph count. */
const LOCAL_DOC_WORKING_SHA256 = 'ea5068a74444217fbca9ece5ab572933c007b0d8797f0d1cd3f815314a8213a1';
const LOCAL_DOC_BLOCKS = 5_815;

/** Synthetic text authored for this suite; a `.md` construct is there to be counted, not read. */
const CONVERTED_INPUTS: ReadonlyArray<{
  format: 'TXT' | 'MD';
  fileName: string;
  text: string;
  blockCount: number;
  degraded: ReadonlyArray<{ key: string; count: number }>;
}> = [
  {
    format: 'TXT', fileName: '合成纯文本.txt', text: '第一段。\n\n第二段。\n\n第三段。\n',
    blockCount: 3, degraded: [],
  },
  {
    format: 'MD', fileName: '合成标记.md', text: '# 合成标题\n\n带 *强调* 的一段。\n\n| 甲 | 乙 |\n',
    blockCount: 3, degraded: [{ key: 'inline-styles', count: 1 }, { key: 'tables', count: 1 }],
  },
];

describe('conversion to a DOCX working representation over the real store', () => {
  it.each(CONVERTED_INPUTS)(
    'stages $format as an editable draft beside the retained original and commits both links',
    async ({ format, fileName, text, blockCount, degraded }) => {
      const selectedPath = join(roots.inputRoot, fileName);
      await writeFile(selectedPath, concat(text));
      const originalDigest = createHash('sha256').update(concat(text)).digest('hex');
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const commitId = randomUUID();
      try {
        const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
        // The Source Version's identity is the original's, whatever the Manuscript was read from.
        expect(staged.source.format).toBe(format);
        expect(staged.source.sourceSha256).toBe(originalDigest);
        expect(staged.source.conversion).toEqual({ converterIdentity: 'ai7-text-to-docx/1', sourceFormat: format });
        expect(staged.source.workingObjectSha256).toMatch(/^[0-9a-f]{64}$/u);
        expect(staged.source.workingObjectSha256).not.toBe(originalDigest);
        expect(staged.editableImport).toEqual({
          available: true,
          conversion: { converterIdentity: 'ai7-text-to-docx/1', sourceFormat: format },
        });
        expect(staged.detectedBlockCount).toBe(blockCount);
        expect(staged.titleSuggestion.sourceLabel).toBe('文件名');
        // Every class the conversion touched names the converter as its cause; the rest do not.
        expect(staged.fidelity.filter((category) => category.count > 0)
          .map((category) => ({ key: category.key, count: category.count }))).toEqual(degraded);
        for (const category of staged.fidelity) {
          expect(category.detail.startsWith(`由 ai7-text-to-docx/1 从 ${format} 转换保留为原文字符：`))
            .toBe(category.count > 0);
        }

        const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
          { kind: 'new-book', choiceId: 'new-book', confirmedTitle: `转换稿件 ${format}` }, degraded.length > 0);
        expect(review.source.conversion).toEqual({ converterIdentity: 'ai7-text-to-docx/1', sourceFormat: format });
        expect(review.fidelity).toEqual(staged.fidelity);
        const commit = await store.commitNewBookImport({
          draftId: staged.draftId,
          expectedDraftVersion: review.draftVersion,
          reviewDigest: review.reviewDigest!,
          commitId,
        });
        expect(commit.completionLabel).toBe('稿件已导入');
        expect(commit.source.conversion).toEqual({ converterIdentity: 'ai7-text-to-docx/1', sourceFormat: format });
        expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
        // The Book's records read the same way after the commit as the review said they would.
        const overview = store.getBookOverview(commit.bookId);
        const sourceRecord = overview.records.find((record) => record.kind === 'source');
        expect(sourceRecord).toMatchObject({
          format,
          sourceDigest: originalDigest,
          converterIdentity: 'ai7-text-to-docx/1',
          workingObjectDigest: staged.source.workingObjectSha256,
        });
        store.markCleanShutdown();
      } finally {
        store.close();
      }

      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const sources = tableRows(database, 'source_versions',
          'format, source_digest, parser_identity, working_object_digest, converter_identity') as Row[];
        expect(sources).toHaveLength(1);
        expect(sources[0]).toMatchObject({
          format,
          source_digest: originalDigest,
          parser_identity: 'ai7-docx-fflate-saxes/3',
          converter_identity: 'ai7-text-to-docx/1',
        });
        expect(sources[0]!.working_object_digest).not.toBe(originalDigest);
        // Two objects: the original under its own extension, the working representation under DOCX.
        const keys = (tableRows(database, 'content_objects', 'relative_key') as Row[])
          .map((row) => extname(String(row.relative_key))).sort();
        expect(keys).toEqual([OBJECT_EXTENSIONS[format], '.docx'].sort());
      } finally {
        database.close();
      }
    },
    120_000,
  );

  it('converts the same file to the same working object, so a reselection changes nothing', async () => {
    const selectedPath = join(roots.inputRoot, '重复转换.txt');
    await writeFile(selectedPath, concat('第一段。\n\n第二段。\n'));
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let workingDigest: string | null;
    try {
      const staged = await first.stageSelectedManuscript(randomUUID(), selectedPath);
      workingDigest = staged.source.workingObjectSha256;
      await first.abandonImportDraft(staged.draftId, staged.draftVersion);
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const second = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await second.stageSelectedManuscript(randomUUID(), selectedPath);
      expect(staged.source.workingObjectSha256).toBe(workingDigest);
      second.markCleanShutdown();
    } finally {
      second.close();
    }
  }, 120_000);

  /**
   * As after a converter change: the draft names a working representation its original no longer converts to, and its
   * staged snapshot no longer says what that original reads as, so only a reselection that converts and restages again
   * can make it whole. `converterIdentity` also stands in for the converter recorded at the first staging.
   */
  function driftConvertedDraft(draftId: string, workingObjectSha256: string, converterIdentity?: string): void {
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.prepare('UPDATE import_drafts SET working_object_digest = ? WHERE draft_id = ?').run(workingObjectSha256, draftId);
      database.prepare("UPDATE staged_import_snapshots SET title_suggestion = '不是原文件的标题' WHERE draft_id = ?").run(draftId);
      if (converterIdentity !== undefined) {
        database.prepare('UPDATE import_drafts SET converter_identity = ? WHERE draft_id = ?').run(converterIdentity, draftId);
      }
    } finally {
      database.close();
    }
  }

  function draftRow(draftId: string): Row {
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      return database.prepare('SELECT * FROM import_drafts WHERE draft_id = ?').get(draftId) as Row;
    } finally {
      database.close();
    }
  }

  it.each(['staged', 'reviewed'] as const)(
    'reconverts a %s converted draft on reselecting its exact original when its working representation no longer reproduces (#611)',
    async (reached) => {
      const selectedPath = join(roots.inputRoot, '重新转换.txt');
      await writeFile(selectedPath, concat('第一段。\n\n第二段。\n'));
      const otherPath = join(roots.inputRoot, '另一份.txt');
      await writeFile(otherPath, concat('另一段。\n'));
      const neverStagedPath = join(roots.inputRoot, '从未暂存.txt');
      await writeFile(neverStagedPath, concat('从未暂存的一段。\n'));
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
        const other = await store.stageSelectedManuscript(randomUUID(), otherPath);
        let version = staged.draftVersion;
        if (reached === 'reviewed') {
          version = store.prepareNewBookReview(staged.draftId, version,
            { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '重新转换' }, false).draftVersion;
          expect(draftRow(staged.draftId).state).toBe('reviewed');
        }
        driftConvertedDraft(staged.draftId, other.source.workingObjectSha256!);
        const continued = await store.continueImportDraft(staged.draftId, version);
        if (continued.state !== 'reselection-required') throw new Error(`expected reselection-required, got ${continued.state}`);
        version = continued.recovery.draftVersion;
        // Another file, never staged, is refused as the reselection's own mismatch, before any copy of it is written.
        const filesBefore = await countObjectFiles(roots.dataRoot);
        const rowBefore = draftRow(staged.draftId);
        await expect(store.reselectImportDraft(staged.draftId, version, randomUUID(), neverStagedPath)).rejects.toMatchObject({ code: 'RESELECTION_MISMATCH' });
        expect(await countObjectFiles(roots.dataRoot)).toBe(filesBefore);
        expect(draftRow(staged.draftId)).toEqual(rowBefore);
        // The exact original is converted again and restaged, where it used to come back needing reselection every time.
        const reselected = await store.reselectImportDraft(staged.draftId, version, randomUUID(), selectedPath);
        if (reselected.state !== 'target-review-required') throw new Error(`expected target-review-required, got ${reselected.state}`);
        expect(reselected.staged.source.workingObjectSha256).toBe(staged.source.workingObjectSha256);
        expect(reselected.staged.titleSuggestion).toEqual(staged.titleSuggestion);
        expect(reselected.reviewInvalidated).toBe(reached === 'reviewed');
        expect(reselected.notice).toBe('已通过原来源摘要精确匹配完成重选，并重新转换、形成完整暂存与预检；请重新确认全部决定。');
        const row = draftRow(staged.draftId);
        expect([row.state, row.reviewed_title, row.review_digest]).toEqual(['staged', null, null]);
        expect((await store.continueImportDraft(staged.draftId, reselected.staged.draftVersion)).state).toBe('target-review-required');
        // It commits as a new Book, read through its working representation.
        const review = store.prepareNewBookReview(staged.draftId, reselected.staged.draftVersion,
          { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '重新转换' }, false);
        const commitId = randomUUID();
        const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
        expect(commit.completionLabel).toBe('稿件已导入');
        expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
        store.markCleanShutdown();
      } finally {
        store.close();
      }
      await expectStoreReopens();
    },
    120_000,
  );

  it.each([
    { format: 'TXT', fileName: '原文件.txt', renamed: '原文件.md', wrong: '另一份.md' },
    { format: 'MD', fileName: '原文件.md', renamed: '原文件.txt', wrong: '另一份.txt' },
  ] as const)(
    'reconverts a $format draft as $format when its exact original is reselected under another text name, and refuses another file before writing it',
    async ({ format, fileName, renamed, wrong }) => {
      const text = '第一段。\n\n第二段。\n';
      const selectedPath = join(roots.inputRoot, fileName);
      await writeFile(selectedPath, concat(text));
      const renamedPath = join(roots.inputRoot, renamed);
      await writeFile(renamedPath, concat(text));
      const wrongPath = join(roots.inputRoot, wrong);
      await writeFile(wrongPath, concat('另一段。\n'));
      const otherPath = join(roots.inputRoot, `别的草稿${format === 'TXT' ? '.txt' : '.md'}`);
      await writeFile(otherPath, concat('别的草稿。\n'));
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
        expect(staged.source.format).toBe(format);
        const other = await store.stageSelectedManuscript(randomUUID(), otherPath);
        driftConvertedDraft(staged.draftId, other.source.workingObjectSha256!);
        const continued = await store.continueImportDraft(staged.draftId, staged.draftVersion);
        if (continued.state !== 'reselection-required') throw new Error(`expected reselection-required, got ${continued.state}`);
        const version = continued.recovery.draftVersion;
        // A file of the other text format is refused by the draft's own conversion, before any copy of it is kept.
        const filesBefore = await countObjectFiles(roots.dataRoot);
        const rowBefore = draftRow(staged.draftId);
        await expect(store.reselectImportDraft(staged.draftId, version, randomUUID(), wrongPath)).rejects.toMatchObject({ code: 'RESELECTION_MISMATCH' });
        expect(await countObjectFiles(roots.dataRoot)).toBe(filesBefore);
        expect(draftRow(staged.draftId)).toEqual(rowBefore);
        // The same bytes under the other text name are the draft's own original: it is converted again as its own format.
        const reselected = await store.reselectImportDraft(staged.draftId, version, randomUUID(), renamedPath);
        if (reselected.state !== 'target-review-required') throw new Error(`expected target-review-required, got ${reselected.state}`);
        expect(reselected.staged.source.format).toBe(format);
        expect(reselected.staged.source.conversion).toEqual(staged.source.conversion);
        expect(reselected.staged.source.workingObjectSha256).toBe(staged.source.workingObjectSha256);
        expect(reselected.notice).toBe('已通过原来源摘要精确匹配完成重选，并重新转换、形成完整暂存与预检；请重新确认全部决定。');
        expect(draftRow(staged.draftId).source_format).toBe(format);
        expect((await store.continueImportDraft(staged.draftId, reselected.staged.draftVersion)).state).toBe('target-review-required');
        await store.abandonImportDraft(staged.draftId, reselected.staged.draftVersion);
        store.markCleanShutdown();
      } finally {
        store.close();
      }
      await expectStoreReopens();
    },
    120_000,
  );

  it('names the converter that converted again, not the one recorded at the first staging, on reselecting a converted draft', async () => {
    const selectedPath = join(roots.inputRoot, '换了转换器.md');
    await writeFile(selectedPath, concat('第一段。\n\n第二段。\n'));
    const otherPath = join(roots.inputRoot, '另一份.md');
    await writeFile(otherPath, concat('另一段。\n'));
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
      const current = staged.source.conversion!.converterIdentity;
      const other = await store.stageSelectedManuscript(randomUUID(), otherPath);
      // As a draft staged before the converter's identity moved on. The stand-in is an identity the product knows (the
      // legacy .doc route's), so the review can still be told, and only the assertions below can decide.
      const earlier = 'ai7-doc-to-docx/1';
      expect(earlier).not.toBe(current);
      driftConvertedDraft(staged.draftId, other.source.workingObjectSha256!, earlier);
      const continued = await store.continueImportDraft(staged.draftId, staged.draftVersion);
      if (continued.state !== 'reselection-required') throw new Error(`expected reselection-required, got ${continued.state}`);
      const reselected = await store.reselectImportDraft(staged.draftId, continued.recovery.draftVersion, randomUUID(), selectedPath);
      if (reselected.state !== 'target-review-required') throw new Error(`expected target-review-required, got ${reselected.state}`);
      expect(reselected.staged.source.conversion).toEqual({ converterIdentity: current, sourceFormat: 'MD' });
      expect(draftRow(staged.draftId).converter_identity).toBe(current);
      await store.abandonImportDraft(staged.draftId, reselected.staged.draftVersion);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    await expectStoreReopens();
  }, 120_000);

  it.each(CONVERTED_INPUTS)(
    'reopens over a staged and then a reviewed reuse of a parsed $format source import before it commits',
    async ({ format, fileName, text }) => {
      const selectedPath = join(roots.inputRoot, fileName);
      await writeFile(selectedPath, concat(text));
      let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      let source: { bookId: string; sourceVersionId: string; format: SourceFormat };
      let staged: { draftId: string; draftVersion: number };
      try {
        source = await commitSourceOnlyNewBook(store, selectedPath, `来源材料 ${format}`);
        expect(source.format).toBe(format);
        // The same file again, read through its converter: a parsed draft, so it holds a snapshot.
        const draft = await store.stageSelectedManuscript(randomUUID(), selectedPath);
        expect(draft.source.conversion).toEqual({ converterIdentity: 'ai7-text-to-docx/1', sourceFormat: format });
        staged = { draftId: draft.draftId, draftVersion: draft.draftVersion };
        store.markCleanShutdown();
      } finally {
        store.close();
      }

      // Staged and not yet reviewed, the converted draft holds a snapshot as a parsed one does, and the
      // store opens over it (#552).
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      let reuse: { draftId: string; draftVersion: number; reviewDigest: string };
      try {
        const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion, {
          kind: 'existing-book', bookId: source.bookId, relationship: 'source-only',
          reuseSourceVersionId: source.sourceVersionId,
        });
        reuse = { draftId: staged.draftId, draftVersion: review.draftVersion, reviewDigest: review.reviewDigest };
        store.markCleanShutdown();
      } finally {
        store.close();
      }

      // Reviewed and not yet committed, it opens over it again.
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const commitId = randomUUID();
        const commit = await store.commitSourceImport({
          draftId: reuse.draftId, expectedDraftVersion: reuse.draftVersion, reviewDigest: reuse.reviewDigest, commitId,
        });
        expect(commit.sourceVersionId).toBe(source.sourceVersionId);
        expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
        store.markCleanShutdown();
      } finally {
        store.close();
      }

      await expectStoreReopens();
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        expect(tableRows(database, 'source_import_records', 'source_version_disposition')
          .map((row) => row.source_version_disposition)
          .sort()).toEqual(['created', 'reused-same-book']);
        // The commit released the snapshot the parsed draft held until then.
        expect(tableRows(database, 'staged_import_snapshots')).toEqual([]);
      } finally {
        database.close();
      }
    },
    120_000,
  );

  it('removes the working representation with the original when a converted draft is abandoned', async () => {
    const selectedPath = join(roots.inputRoot, '放弃转换.txt');
    await writeFile(selectedPath, concat('第一段。\n\n第二段。\n'));
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
      expect(await countObjectFiles(roots.dataRoot)).toBe(2);
      const startup = await store.abandonImportDraft(staged.draftId, staged.draftVersion);
      expect(startup.state).toBe('none');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // Neither object remains: not the original the editor selected, and not what it was read from.
    expect(await countObjectFiles(roots.dataRoot)).toBe(0);
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect(tableRows(database, 'content_objects')).toEqual([]);
      expect(tableRows(database, 'import_drafts')).toEqual([]);
      expect(tableRows(database, 'import_abandonment_cleanup_intents')).toEqual([]);
    } finally {
      database.close();
    }
  }, 120_000);
});

// Local-only (ADR 0079 §5): the legacy binary `.doc` route, which only a real legacy document can
// stand for and no generator produces. Absent, these two cases skip; the converted `.txt` and `.md`
// cases above keep the conversion route itself covered on every host.
describe.skipIf(!localOnlyAvailable(LOCAL_ONLY_DOC))('legacy .doc conversion over the real store', () => {
  it('stages the local-only legacy .doc as an editable draft and commits both links', async () => {
    const selectedPath = localOnlyPath(LOCAL_ONLY_DOC);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const commitId = randomUUID();
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
      // The original is the digest of record; the working representation is a second object.
      expect(staged.source.format).toBe('DOC');
      expect(staged.source.sourceSha256).toBe(LOCAL_DOC_SHA256);
      expect(staged.source.sourceBytes).toBe(LOCAL_DOC_BYTES);
      expect(staged.source.conversion).toEqual({ converterIdentity: DOC_CONVERTER, sourceFormat: 'DOC' });
      expect(staged.source.workingObjectSha256).toBe(LOCAL_DOC_WORKING_SHA256);
      expect(staged.editableImport).toEqual({
        available: true,
        conversion: { converterIdentity: DOC_CONVERTER, sourceFormat: 'DOC' },
      });
      expect(staged.detectedBlockCount).toBe(LOCAL_DOC_BLOCKS);
      expect(staged.titleSuggestion.sourceLabel).toBe('文件名');
      // What the reader exposed and the conversion dropped, named as this converter's doing.
      expect(staged.fidelity.filter((category) => category.count > 0)
        .map((category) => ({ key: category.key, count: category.count })))
        .toEqual([{ key: 'headers-footers', count: 1 }]);
      for (const category of staged.fidelity) {
        expect(category.detail.startsWith(`由 ${DOC_CONVERTER} 从 DOC 转换时未能保留：`)).toBe(category.count > 0);
      }

      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '转换稿件 DOC' }, true);
      expect(review.source.conversion).toEqual({ converterIdentity: DOC_CONVERTER, sourceFormat: 'DOC' });
      expect(review.fidelity).toEqual(staged.fidelity);
      const commit = await store.commitNewBookImport({
        draftId: staged.draftId,
        expectedDraftVersion: review.draftVersion,
        reviewDigest: review.reviewDigest!,
        commitId,
      });
      expect(commit.completionLabel).toBe('稿件已导入');
      expect(commit.source.conversion).toEqual({ converterIdentity: DOC_CONVERTER, sourceFormat: 'DOC' });
      expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
      const sourceRecord = store.getBookOverview(commit.bookId).records.find((record) => record.kind === 'source');
      expect(sourceRecord).toMatchObject({
        format: 'DOC',
        sourceDigest: LOCAL_DOC_SHA256,
        parserIdentity: 'ai7-docx-fflate-saxes/3',
        converterIdentity: DOC_CONVERTER,
        workingObjectDigest: LOCAL_DOC_WORKING_SHA256,
      });
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      const sources = tableRows(database, 'source_versions',
        'format, source_digest, parser_identity, working_object_digest, converter_identity') as Row[];
      expect(sources).toEqual([{
        format: 'DOC',
        source_digest: LOCAL_DOC_SHA256,
        parser_identity: 'ai7-docx-fflate-saxes/3',
        working_object_digest: LOCAL_DOC_WORKING_SHA256,
        converter_identity: DOC_CONVERTER,
      }]);
      // Two objects: the original under `.doc`, the working representation under `.docx`.
      const keys = (tableRows(database, 'content_objects', 'relative_key') as Row[])
        .map((row) => extname(String(row.relative_key))).sort();
      expect(keys).toEqual(['.doc', '.docx']);
    } finally {
      database.close();
    }
  }, 180_000);

  it('removes both objects when a converted legacy .doc draft is abandoned', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), localOnlyPath(LOCAL_ONLY_DOC));
      expect(await countObjectFiles(roots.dataRoot)).toBe(2);
      expect((await store.abandonImportDraft(staged.draftId, staged.draftVersion)).state).toBe('none');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(await countObjectFiles(roots.dataRoot)).toBe(0);
  }, 180_000);
});

describe('schema revision 18 over the real store', () => {
  it('migrates a revision-17 store forward with every Source Version row byte for byte', async () => {
    await requireExactSample1(roots.codeRoot);
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    try {
      bookId = (await importSample1Book(store, roots.codeRoot, '修订版 18 迁移')).bookId;
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    downgradeToRevision17(databasePath);

    // At revision 17 the widened columns are simply not there, which is what the migration answers.
    const downgraded = new DatabaseSync(databasePath, { readOnly: true });
    let sourceVersionsBefore: Row[];
    let provenanceBefore: Row[];
    let draftsBefore: Row[];
    try {
      expect((downgraded.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
        .toBe(TASK_AUTHORIZATION_SCHEMA_VERSION);
      expect(() => downgraded.prepare('SELECT source_format FROM import_drafts').all()).toThrow();
      sourceVersionsBefore = tableRows(downgraded, 'source_versions', REVISION_17_SOURCE_VERSION_COLUMNS);
      provenanceBefore = tableRows(downgraded, 'source_provenance', REVISION_17_PROVENANCE_COLUMNS);
      draftsBefore = tableRows(downgraded, 'import_drafts', REVISION_17_DRAFT_COLUMNS);
      expect(sourceVersionsBefore).toHaveLength(1);
      expect(provenanceBefore).toHaveLength(1);
      expect(draftsBefore).toHaveLength(1);
    } finally {
      downgraded.close();
    }

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // The Book the store read before the downgrade is the Book it reads after the migration.
      expect(migrated.listBooks(null).items.map((item) => item.bookId)).toEqual([bookId]);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }

    const after = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
        .toBe(LATEST_SCHEMA_VERSION);
      // Every row is the row it was: the parsed DOCX keeps its digests, its parser, and its format.
      expect(tableRows(after, 'source_versions', REVISION_17_SOURCE_VERSION_COLUMNS)).toEqual(sourceVersionsBefore);
      expect(tableRows(after, 'source_provenance', REVISION_17_PROVENANCE_COLUMNS)).toEqual(provenanceBefore);
      expect(tableRows(after, 'import_drafts', REVISION_17_DRAFT_COLUMNS)).toEqual(draftsBefore);
      // The widened shape is there, and every row that predates the revision reads DOCX.
      expect(tableRows(after, 'import_drafts', 'source_format')).toEqual([{ source_format: 'DOCX' }]);
      expect(tableRows(after, 'source_versions', 'format')).toEqual([{ format: 'DOCX' }]);
      expect(after.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      const columns = after.prepare('PRAGMA table_info(source_versions)').all() as Row[];
      const nullable = columns.filter((column) => column.notnull === 0).map((column) => column.name).sort();
      expect(nullable).toEqual([
        'content_digest', 'converter_identity', 'parser_identity', 'structure_digest', 'working_object_digest',
      ]);
      // The three guards on the rebuilt relation are back, so a pending cleanup still blocks a write.
      const triggers = after.prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'source_versions' ORDER BY name",
      ).all() as Row[];
      expect(triggers.map((trigger) => trigger.name)).toEqual([
        'abandonment_cleanup_block_source_insert',
        'abandonment_cleanup_block_source_update',
        'abandonment_cleanup_block_source_update_v5',
      ]);
    } finally {
      after.close();
    }
  }, 120_000);
});

/** Take a store back to the revision-18 shape: the conversion columns are simply not there. */
function downgradeToRevision18(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    execPre74Fixture(database, `BEGIN IMMEDIATE;
      ALTER TABLE source_versions DROP COLUMN working_object_digest;
      ALTER TABLE source_versions DROP COLUMN converter_identity;
      ALTER TABLE import_drafts DROP COLUMN working_object_digest;
      ALTER TABLE import_drafts DROP COLUMN converter_identity;
      ALTER TABLE import_abandonment_cleanup_intents DROP COLUMN working_object_digest;
      ${[...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER].map((relation) => `DROP TABLE ${relation};`).join(' ')}
      ${PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER.map((relation) => `DROP TABLE ${relation};`).join(' ')}
      ${PUBLICATION_VERSION_RELATIONS_DROP_ORDER.map((relation) => `DROP TABLE ${relation};`).join(' ')}
      ${REVIEW_RUN_RELATIONS_DROP_ORDER.map((relation) => `DROP TABLE ${relation};`).join(' ')}
      DROP TABLE manuscript_effect_receipts;
      DROP TABLE manuscript_effect_dispatches;
      DROP TABLE manuscript_effect_approvals;
      DROP TABLE manuscript_effect_targets;
      DROP TABLE manuscript_effect_intents;
      DROP TABLE proposal_decision_reasons;
      DROP TABLE proposal_item_decisions;
      DROP TABLE proposal_change_items;
      DROP TABLE editorial_mark_replies;
      DROP TABLE editorial_marks;
      DROP TABLE manuscript_entry_positions;
      PRAGMA user_version = ${MANUSCRIPT_INTAKE_SCHEMA_VERSION};
      COMMIT;`);
  } finally {
    database.close();
  }
}

const REVISION_18_SOURCE_VERSION_COLUMNS = REVISION_17_SOURCE_VERSION_COLUMNS;

describe('schema revision 19 over the real store', () => {
  it('reads a revision-18 store holding parsed and unparsed source imports, where no Source Version has a working representation (Issue #583)', async () => {
    await requireExactSample1(roots.codeRoot);
    const pdfPath = join(roots.inputRoot, '固定版式样例.pdf');
    await writeFile(pdfPath, syntheticPdfBytes());
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect((await commitSourceOnlyNewBook(store, pdfPath, '来源材料 PDF')).format).toBe('PDF');
      expect((await commitSourceOnlyNewBook(store, sample1Path(roots.codeRoot), '来源材料 DOCX')).format).toBe('DOCX');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    downgradeToRevision18(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    // At revision 18 the record check reads each Source Version without the column revision 19 adds: the unparsed PDF and
    // the parsed DOCX both stand, and the store opens and migrates.
    await expectStoreReopens();
  }, 120_000);

  it('migrates a revision-18 store holding a staged PDF draft forward with every Source Version row byte for byte', async () => {
    await requireExactSample1(roots.codeRoot);
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const pdfPath = join(roots.inputRoot, '固定版式样例.pdf');
    await writeFile(pdfPath, syntheticPdfBytes());
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    try {
      bookId = (await importSample1Book(store, roots.codeRoot, '修订版 19 迁移')).bookId;
      // A PDF staged source-only holds no snapshot, as revision 18 already staged it; the open-time checks
      // read that draft at revision 18, before the migration, and again after it (#552).
      expect((await store.stageSelectedManuscript(randomUUID(), pdfPath)).source.format).toBe('PDF');
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    downgradeToRevision18(databasePath);

    const downgraded = new DatabaseSync(databasePath, { readOnly: true });
    let sourceVersionsBefore: Row[];
    let draftsBefore: Row[];
    try {
      expect((downgraded.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
        .toBe(MANUSCRIPT_INTAKE_SCHEMA_VERSION);
      expect(() => downgraded.prepare('SELECT converter_identity FROM source_versions').all()).toThrow();
      sourceVersionsBefore = tableRows(downgraded, 'source_versions', REVISION_18_SOURCE_VERSION_COLUMNS);
      draftsBefore = tableRows(downgraded, 'import_drafts', `${REVISION_17_DRAFT_COLUMNS}, source_format`);
      expect(sourceVersionsBefore).toHaveLength(1);
      expect(draftsBefore.map((draft) => ({ state: draft.state, source_format: draft.source_format }))).toEqual([
        { state: 'committed', source_format: 'DOCX' },
        { state: 'staged', source_format: 'PDF' },
      ]);
      expect(tableRows(downgraded, 'staged_import_snapshots')).toEqual([]);
    } finally {
      downgraded.close();
    }

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(migrated.listBooks(null).items.map((item) => item.bookId)).toEqual([bookId]);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }

    const after = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
        .toBe(LATEST_SCHEMA_VERSION);
      // Every row is the row it was; a DOCX read natively gains two columns and fills neither.
      expect(tableRows(after, 'source_versions', REVISION_18_SOURCE_VERSION_COLUMNS)).toEqual(sourceVersionsBefore);
      expect(tableRows(after, 'import_drafts', `${REVISION_17_DRAFT_COLUMNS}, source_format`)).toEqual(draftsBefore);
      expect(tableRows(after, 'source_versions', 'working_object_digest, converter_identity'))
        .toEqual([{ working_object_digest: null, converter_identity: null }]);
      // Nor does a draft: neither the DOCX nor the PDF was read through a converter.
      expect(tableRows(after, 'import_drafts', 'working_object_digest, converter_identity')).toEqual([
        { working_object_digest: null, converter_identity: null },
        { working_object_digest: null, converter_identity: null },
      ]);
      expect(after.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      after.close();
    }
  }, 120_000);
});
