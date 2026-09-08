import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { MANUSCRIPT_INTAKE_SCHEMA_VERSION, TASK_AUTHORIZATION_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import type { SourceFormat } from '../../src/shared/protocol.js';
import { importSample1Book, requireExactSample1, sample1Path } from '../support/sample1-baseline.js';
import { syntheticPdfBytes } from '../support/synthetic-pdf.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for multi-format intake (ADR 0072 §1–2). It drives the real
// `EditorialStore` on a temporary Agent Data Root without Electron. The only admitted material it
// reads is exact `sample1`, through the shared baseline support; every other input is synthetic.

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

/** Synthetic inputs only: bytes with no manuscript content, in every format the router recognises. */
const SOURCE_ONLY_INPUTS: ReadonlyArray<{ format: SourceFormat; fileName: string; bytes: () => Uint8Array; reason: string }> = [
  {
    format: 'PDF', fileName: '固定版式样例.pdf', bytes: syntheticPdfBytes,
    reason: 'PDF 为固定版式，没有可靠的可编辑往返；可作为来源材料保留。',
  },
  {
    format: 'DOC', fileName: '旧版样例.doc',
    bytes: () => concat(Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), new Uint8Array(504)),
    reason: '旧版 Word（.doc）的本地转换尚未提供；可作为来源材料保留。',
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
    format: 'TXT', fileName: '样例.txt', bytes: () => concat('合成纯文本\n第二行\n'),
    reason: '纯文本与 Markdown 的本地转换尚未提供；可作为来源材料保留。',
  },
  {
    format: 'MD', fileName: '样例.md', bytes: () => concat('# 合成标题\n\n正文\n'),
    reason: '纯文本与 Markdown 的本地转换尚未提供；可作为来源材料保留。',
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
    },
    120_000,
  );

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
        .toBe(MANUSCRIPT_INTAKE_SCHEMA_VERSION);
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
      expect(nullable).toEqual(['content_digest', 'parser_identity', 'structure_digest']);
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
