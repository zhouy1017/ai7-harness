import { createHash, randomUUID } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import {
  MANUSCRIPT_INTAKE_SCHEMA_VERSION,
  TASK_AUTHORIZATION_SCHEMA_VERSION,
  CLARIFICATION_SCHEMA_VERSION, DECISION_FEEDBACK_SCHEMA_VERSION,
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
    database.exec(`BEGIN IMMEDIATE;
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
        .toBe(DECISION_FEEDBACK_SCHEMA_VERSION);
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
    database.exec(`BEGIN IMMEDIATE;
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
        .toBe(DECISION_FEEDBACK_SCHEMA_VERSION);
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
