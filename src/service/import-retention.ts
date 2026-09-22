import { createHash } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { ManuscriptBlockProjection, TextBoxDisposition } from '../shared/protocol.js';
import type { ParsedTextBox } from './docx.js';

/**
 * Import retention (Issue #410, plan slice S61; ADR 0086): what schema revision 27 records so that a
 * DOCX's content can stay with its Source Version and be restored from the original on export.
 *
 * - `import_fidelity_categories` widens to the ten classes (`position` 1 to 10) and the `retained`
 *   status. A store that revision 26 or earlier created is rebuilt to the widened text with every row
 *   copied byte for byte, rowid included (`widenImportFidelityCategories`); revision 26's text is kept
 *   only to recognise such a store (`IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL`).
 * - `import_fidelity_choices`: the one choice a review makes for its text boxes — `retain` (保留为文本框,
 *   the default) or `merge` (并入正文) — written with the review at commit (ADR 0086 §2).
 * - `staged_import_block_sources` and `staged_import_text_box_paragraphs`: which `w:p` of the staged
 *   file each staged block came from, and the paragraphs of its text boxes, so the choice can be made at
 *   review without reading the file again. They belong to the staged snapshot and go with it.
 * - `manuscript_block_sources`: written at commit for the Revision an import or reimport creates — which
 *   source paragraph every block came from (a body paragraph, or a paragraph of a merged text box) and
 *   the digest it had there, so an unedited block can be restored from its source paragraph (ADR 0086 §3).
 *
 * Nothing existing moves (ADR 0079 §1.1): the rebuild changes no row, and the four relations are added.
 * `EditorialStore.open` runs `initializeImportRetentionSchema` before the version is stamped; it is
 * shape-detected, so it does its work once.
 */

type SqlRow = Record<string, SQLOutputValue>;

/** `import_fidelity_categories` exactly as revisions 10 to 26 carried it: eight positions, three statuses. */
export const IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL = `CREATE TABLE import_fidelity_categories (
    fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
    category_key TEXT NOT NULL,
    display_label TEXT NOT NULL,
    item_count INTEGER NOT NULL CHECK(item_count >= 0),
    status TEXT NOT NULL CHECK(status IN ('preserved', 'degraded', 'unsupported')),
    detail TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
    PRIMARY KEY(fidelity_review_id, category_key),
    UNIQUE(fidelity_review_id, position)
  ) STRICT`;

/**
 * The widened relation of revision 27: a review parsed under `ai7-docx-fflate-saxes/2` has ten classes
 * and may say `retained`; one recorded under `/1` keeps its eight rows as they were.
 */
export const IMPORT_FIDELITY_CATEGORIES_SQL = `CREATE TABLE import_fidelity_categories (
  fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
  category_key TEXT NOT NULL,
  display_label TEXT NOT NULL,
  item_count INTEGER NOT NULL CHECK(item_count >= 0),
  status TEXT NOT NULL CHECK(status IN ('preserved', 'retained', 'degraded', 'unsupported')),
  detail TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 10),
  PRIMARY KEY(fidelity_review_id, category_key),
  UNIQUE(fidelity_review_id, position)
) STRICT`;

/** The four relations revision 27 adds, in an order that creates every relation after the one it names. */
export const IMPORT_RETENTION_SCHEMA_SQL = {
  import_fidelity_choices: `CREATE TABLE import_fidelity_choices (
  fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
  category_key TEXT NOT NULL CHECK(category_key = 'text-boxes'),
  choice TEXT NOT NULL CHECK(choice IN ('retain', 'merge')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(fidelity_review_id, category_key)
) STRICT`,
  staged_import_block_sources: `CREATE TABLE staged_import_block_sources (
  draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position > 0),
  source_paragraph_index INTEGER NOT NULL CHECK(source_paragraph_index >= 0),
  PRIMARY KEY(draft_id, position),
  UNIQUE(draft_id, source_paragraph_index)
) STRICT`,
  staged_import_text_box_paragraphs: `CREATE TABLE staged_import_text_box_paragraphs (
  draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
  box_ordinal INTEGER NOT NULL CHECK(box_ordinal > 0),
  box_paragraph_ordinal INTEGER NOT NULL CHECK(box_paragraph_ordinal > 0),
  anchor_paragraph_index INTEGER NOT NULL CHECK(anchor_paragraph_index >= 0),
  source_paragraph_index INTEGER NOT NULL CHECK(source_paragraph_index > anchor_paragraph_index),
  kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
  level INTEGER,
  text TEXT NOT NULL,
  digest TEXT NOT NULL CHECK(length(digest) = 64),
  grapheme_length INTEGER NOT NULL CHECK(grapheme_length > 0),
  PRIMARY KEY(draft_id, box_ordinal, box_paragraph_ordinal),
  UNIQUE(draft_id, source_paragraph_index)
) STRICT`,
  manuscript_block_sources: `CREATE TABLE manuscript_block_sources (
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  source_part TEXT NOT NULL CHECK(source_part IN ('body', 'text-box')),
  source_paragraph_index INTEGER NOT NULL CHECK(source_paragraph_index >= 0),
  box_ordinal INTEGER CHECK(box_ordinal IS NULL OR box_ordinal > 0),
  box_paragraph_ordinal INTEGER CHECK(box_paragraph_ordinal IS NULL OR box_paragraph_ordinal > 0),
  source_paragraph_digest TEXT NOT NULL CHECK(length(source_paragraph_digest) = 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY(revision_id, block_id),
  UNIQUE(revision_id, source_paragraph_index),
  CHECK((source_part = 'body') = (box_ordinal IS NULL)),
  CHECK((box_ordinal IS NULL) = (box_paragraph_ordinal IS NULL))
) STRICT`,
} as const;

/** The choice and the mapping are records of a committed import: appended once, never rewritten. */
export const IMPORT_RETENTION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  (['import_fidelity_choices', 'manuscript_block_sources'] as const).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RETENTION_RECORD_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'IMPORT_RETENTION_RECORD_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the four relations, in the exact-schema validator's own spelling. */
export const IMPORT_RETENTION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  import_fidelity_choices: ['fidelity_review_id>import_fidelity_reviews.fidelity_review_id:NO ACTION/NO ACTION/NONE'],
  staged_import_block_sources: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  staged_import_text_box_paragraphs: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
  manuscript_block_sources: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'source_version_id>source_versions.source_version_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class ImportRetentionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ImportRetentionError';
  }
}

function requireRetention(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ImportRetentionError(code, message);
}

function integer(value: SQLOutputValue | undefined): number {
  requireRetention(typeof value === 'number' && Number.isSafeInteger(value), 'STORE_CORRUPT', '导入保留记录数字无效。');
  return value;
}

function text(value: SQLOutputValue | undefined): string {
  requireRetention(typeof value === 'string' && value.isWellFormed(), 'STORE_CORRUPT', '导入保留记录文本无效。');
  return value;
}

/** A relation's text as the exact-schema validator compares it: no identifier quoting, no whitespace, no case. */
function canonicalTableSql(sql: string): string {
  return sql.replace(/["`[\]]/gu, '').replace(/\s+/gu, '').toLowerCase();
}

/**
 * Which of its two texts `import_fidelity_categories` holds: revision 26's, or revision 27's widened
 * one. No other text was ever created, so any other is refused.
 */
export function importFidelityCategoriesShape(db: DatabaseSync): 'revision-26' | 'current' {
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'import_fidelity_categories'").get() as SqlRow | undefined;
  const sql = row === undefined ? '' : canonicalTableSql(text(row.sql));
  if (sql === canonicalTableSql(IMPORT_FIDELITY_CATEGORIES_SQL)) return 'current';
  requireRetention(sql === canonicalTableSql(IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL), 'SCHEMA_MIGRATION_FAILED', '导入保真分类表结构不兼容。');
  return 'revision-26';
}

/**
 * Revision 26 → 27 for `import_fidelity_categories`: rebuilt from its widened text with every row
 * copied byte for byte, rowid included, in rowid order, and every index or trigger on it re-armed from
 * its own text (revision 26 created none; the indexes behind its keys come back with the table). It runs
 * in the caller's transaction with foreign keys off; the caller checks every reference before it commits.
 */
export function widenImportFidelityCategories(db: DatabaseSync): void {
  requireRetention(
    db.isTransaction && integer((db.prepare('PRAGMA foreign_keys').get() as SqlRow).foreign_keys) === 0,
    'SCHEMA_MIGRATION_FAILED',
    '导入保真分类表只能在停用引用校验的事务中重建。',
  );
  const columnsOf = (): string => (db.prepare("SELECT name FROM pragma_table_info('import_fidelity_categories') ORDER BY cid").all() as SqlRow[])
    .map((row) => text(row.name)).join(', ');
  const rows = (): number => integer((db.prepare('SELECT count(*) total FROM import_fidelity_categories').get() as SqlRow).total);
  const columns = columnsOf();
  const before = rows();
  const attached = (db.prepare(
    "SELECT sql FROM sqlite_schema WHERE tbl_name = 'import_fidelity_categories' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
  ).all() as SqlRow[]).map((row) => text(row.sql));
  db.exec('CREATE TEMP TABLE migrate_import_fidelity_categories AS SELECT rowid AS migrate_rowid, * FROM import_fidelity_categories');
  db.exec('DROP TABLE import_fidelity_categories');
  db.exec(IMPORT_FIDELITY_CATEGORIES_SQL);
  requireRetention(columnsOf() === columns, 'SCHEMA_MIGRATION_FAILED', '导入保真分类表迁移前后的列不一致。');
  db.exec(`INSERT INTO import_fidelity_categories(rowid, ${columns})
    SELECT migrate_rowid, ${columns} FROM temp.migrate_import_fidelity_categories ORDER BY migrate_rowid`);
  db.exec('DROP TABLE temp.migrate_import_fidelity_categories');
  for (const sql of attached) db.exec(sql);
  requireRetention(rows() === before, 'SCHEMA_MIGRATION_FAILED', '导入保真分类表迁移未保留全部记录。');
}

/**
 * Revision 27, once per store and in one transaction: `import_fidelity_categories` is rebuilt while it
 * holds revision 26's exact text, with foreign keys off around the transaction; then the four relations
 * are created, and every reference is checked before anything commits. Shape-detected: once
 * `import_fidelity_choices` exists this has been done.
 */
export function initializeImportRetentionSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'import_fidelity_choices'").get();
  if (existing !== undefined) return;
  const widen = importFidelityCategoriesShape(db) === 'revision-26';
  const foreignKeys = (): number => integer((db.prepare('PRAGMA foreign_keys').get() as SqlRow).foreign_keys);
  const restoreForeignKeys = widen && foreignKeys() === 1;
  if (widen) {
    db.exec('PRAGMA foreign_keys = OFF');
    requireRetention(foreignKeys() === 0, 'SCHEMA_MIGRATION_FAILED', '无法暂时停用引用校验以迁移数据库。');
  }
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (widen) widenImportFidelityCategories(db);
      for (const sql of Object.values(IMPORT_RETENTION_SCHEMA_SQL)) db.exec(sql);
      for (const sql of Object.values(IMPORT_RETENTION_TRIGGER_SQL)) db.exec(sql);
      requireRetention(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Import retention schema rollback failed.');
      }
      throw error;
    }
  } finally {
    if (restoreForeignKeys) {
      db.exec('PRAGMA foreign_keys = ON');
      requireRetention(foreignKeys() === 1, 'SCHEMA_MIGRATION_FAILED', '无法恢复引用校验。');
    }
  }
}

/** One paragraph of a staged text box, as `staged_import_text_box_paragraphs` holds it. */
export interface StagedTextBoxParagraph {
  boxOrdinal: number;
  boxParagraphOrdinal: number;
  anchorParagraphIndex: number;
  sourceParagraphIndex: number;
  kind: ManuscriptBlockProjection['kind'];
  level: number | null;
  text: string;
  digest: string;
  graphemeLength: number;
}

/** The staged sources of one parse: the source paragraph of every block, in block order, and every box. */
export interface StagedImportSources {
  blockSourceIndexes: ReadonlyArray<number>;
  textBoxes: ReadonlyArray<ParsedTextBox>;
}

function flattenTextBoxes(textBoxes: ReadonlyArray<ParsedTextBox>): StagedTextBoxParagraph[] {
  return textBoxes.flatMap((box) => box.paragraphs.map((paragraph) => ({
    boxOrdinal: box.boxOrdinal,
    boxParagraphOrdinal: paragraph.boxParagraphOrdinal,
    anchorParagraphIndex: box.anchorParagraphIndex,
    sourceParagraphIndex: paragraph.sourceParagraphIndex,
    kind: paragraph.kind,
    level: paragraph.level,
    text: paragraph.text,
    digest: paragraph.digest,
    graphemeLength: paragraph.graphemeLength,
  })));
}

/**
 * Stage the sources of a parse beside the staged blocks it produced, in the caller's transaction. The
 * source indexes are the blocks' own, one per staged position; the text-box paragraphs are every
 * non-empty paragraph of every box.
 */
export function stageImportSources(db: DatabaseSync, draftId: string, sources: StagedImportSources): void {
  const insertBlock = db.prepare(
    'INSERT INTO staged_import_block_sources(draft_id, position, source_paragraph_index) VALUES (?, ?, ?)',
  );
  sources.blockSourceIndexes.forEach((index, offset) => insertBlock.run(draftId, offset + 1, index));
  const insertParagraph = db.prepare(
    `INSERT INTO staged_import_text_box_paragraphs(
       draft_id, box_ordinal, box_paragraph_ordinal, anchor_paragraph_index, source_paragraph_index,
       kind, level, text, digest, grapheme_length
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const paragraph of flattenTextBoxes(sources.textBoxes)) {
    insertParagraph.run(
      draftId, paragraph.boxOrdinal, paragraph.boxParagraphOrdinal, paragraph.anchorParagraphIndex,
      paragraph.sourceParagraphIndex, paragraph.kind, paragraph.level, paragraph.text, paragraph.digest,
      paragraph.graphemeLength,
    );
  }
}

/** The source paragraph of every staged block of a draft, in position order. */
export function stagedBlockSourceIndexes(db: DatabaseSync, draftId: string): number[] {
  const rows = db.prepare(
    'SELECT position, source_paragraph_index FROM staged_import_block_sources WHERE draft_id = ? ORDER BY position',
  ).all(draftId) as SqlRow[];
  return rows.map((row, index) => {
    requireRetention(integer(row.position) === index + 1, 'SNAPSHOT_INCOMPLETE', '暂存内容块来源段落不连续。');
    return integer(row.source_paragraph_index);
  });
}

/**
 * A block's digest, exactly as the parser writes it: the canonical JSON of its kind, level and text, whose
 * keys are already in canonical order.
 */
function blockDigest(kind: ManuscriptBlockProjection['kind'], level: number | null, value: string): string {
  return createHash('sha256').update(JSON.stringify({ kind, level, text: value })).digest('hex');
}

/** Every staged text-box paragraph of a draft, in document order. */
export function stagedTextBoxParagraphs(db: DatabaseSync, draftId: string): StagedTextBoxParagraph[] {
  const rows = db.prepare(
    `SELECT box_ordinal, box_paragraph_ordinal, anchor_paragraph_index, source_paragraph_index,
            kind, level, text, digest, grapheme_length
     FROM staged_import_text_box_paragraphs WHERE draft_id = ? ORDER BY source_paragraph_index`,
  ).all(draftId) as SqlRow[];
  return rows.map((row) => {
    const kind = text(row.kind) as ManuscriptBlockProjection['kind'];
    const level = row.level === null ? null : integer(row.level);
    const paragraph = {
      boxOrdinal: integer(row.box_ordinal),
      boxParagraphOrdinal: integer(row.box_paragraph_ordinal),
      anchorParagraphIndex: integer(row.anchor_paragraph_index),
      sourceParagraphIndex: integer(row.source_paragraph_index),
      kind,
      level,
      text: text(row.text),
      digest: text(row.digest),
      graphemeLength: integer(row.grapheme_length),
    };
    requireRetention(
      ((kind === 'title' && level === 1) || (kind === 'heading' && level !== null && level >= 1 && level <= 6) ||
        (kind === 'paragraph' && level === null)) &&
        blockDigest(kind, level, paragraph.text) === paragraph.digest,
      'SNAPSHOT_INCOMPLETE',
      '暂存文本框段落的结构、文字或摘要无法证明。',
    );
    return paragraph;
  });
}

/**
 * Whether a fresh parse of the staged file reproduces the staged sources exactly: the same source index
 * for every block, and the same text-box paragraphs, field for field.
 */
export function stagedImportSourcesMatch(db: DatabaseSync, draftId: string, sources: StagedImportSources): boolean {
  const staged = stagedBlockSourceIndexes(db, draftId);
  if (staged.length !== sources.blockSourceIndexes.length || staged.some((index, offset) => index !== sources.blockSourceIndexes[offset])) {
    return false;
  }
  const expected = flattenTextBoxes(sources.textBoxes).sort((left, right) => left.sourceParagraphIndex - right.sourceParagraphIndex);
  const actual = stagedTextBoxParagraphs(db, draftId);
  return actual.length === expected.length && actual.every((paragraph, index) => {
    const other = expected[index]!;
    return paragraph.boxOrdinal === other.boxOrdinal && paragraph.boxParagraphOrdinal === other.boxParagraphOrdinal &&
      paragraph.anchorParagraphIndex === other.anchorParagraphIndex &&
      paragraph.sourceParagraphIndex === other.sourceParagraphIndex && paragraph.kind === other.kind &&
      paragraph.level === other.level && paragraph.text === other.text && paragraph.digest === other.digest &&
      paragraph.graphemeLength === other.graphemeLength;
  });
}

/** The text-box choice a committed review recorded, or null when it recorded none. */
export function recordedTextBoxChoice(db: DatabaseSync, fidelityReviewId: string): TextBoxDisposition | null {
  const rows = db.prepare(
    "SELECT choice FROM import_fidelity_choices WHERE fidelity_review_id = ? AND category_key = 'text-boxes'",
  ).all(fidelityReviewId) as SqlRow[];
  if (rows.length === 0) return null;
  const choice = text(rows[0]!.choice);
  requireRetention(choice === 'retain' || choice === 'merge', 'STORE_CORRUPT', '文本框选择记录无效。');
  return choice;
}

/** Record a committed review's text-box choice, in the caller's transaction. */
export function recordTextBoxChoice(db: DatabaseSync, fidelityReviewId: string, choice: TextBoxDisposition, createdAt: string): void {
  db.prepare(
    "INSERT INTO import_fidelity_choices(fidelity_review_id, category_key, choice, created_at) VALUES (?, 'text-boxes', ?, ?)",
  ).run(fidelityReviewId, choice, createdAt);
}
