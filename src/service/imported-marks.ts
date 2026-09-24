import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { IMPORTED_MARK_ORIGINS, type ImportedMarkOrigin, type ParsedImportedMark } from './docx-marks.js';
import {
  proposalChangeItemsShape,
  widenProposalChangeItems,
  type EditorialMarkStore,
  type ProducedEditorialMarkInput,
} from './editorial-marks.js';

/**
 * Imported marks (Issue #411, plan slice S62; V2-UX-MARK-009, editor-surfaces §7 批注与修订): what schema
 * revision 28 records so that a DOCX's comments and tracked changes enter the imported manuscript as 批注 and
 * 修改建议 whose source is the file's author.
 *
 * - `proposal_change_items` widens to the `insert` kind — an item with no current text that writes its
 *   proposal at a point — rebuilt with every row byte for byte by `editorial-marks.ts`, which owns it.
 * - `staged_import_marks`: the marks a parse read, pinned in the staged blocks, staged with the snapshot and
 *   going with it, so the commit creates exactly what the review counted without reading the file again.
 *
 * The marks themselves are ordinary Editorial Marks created in the import's own commit transaction, after
 * the branch's working state exists, all or none: a mark that cannot be pinned exactly refuses the import
 * rather than being dropped (D5). Nothing is ever applied by importing.
 *
 * Nothing existing moves (ADR 0079 §1.1): the rebuild changes no row, and the one relation is added.
 * `EditorialStore.open` runs `initializeImportedMarkSchema` before the version is stamped; it is
 * shape-detected, so it does its work once.
 */

type SqlRow = Record<string, SQLOutputValue>;

const ORIGIN_LIST = IMPORTED_MARK_ORIGINS.map((origin) => `'${origin}'`).join(', ');

export const IMPORTED_MARK_SCHEMA_SQL = {
  staged_import_marks: `CREATE TABLE staged_import_marks (
  draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  block_position INTEGER NOT NULL CHECK(block_position > 0),
  from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
  to_grapheme INTEGER NOT NULL CHECK(to_grapheme >= from_grapheme),
  pinned_text TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('annotation', 'change-suggestion')),
  origin TEXT NOT NULL CHECK(origin IN (${ORIGIN_LIST})),
  author_label TEXT NOT NULL CHECK(length(author_label) BETWEEN 1 AND 200),
  body TEXT NOT NULL,
  proposed_text TEXT,
  status TEXT NOT NULL CHECK(status IN ('open', 'resolved')),
  PRIMARY KEY(draft_id, ordinal),
  CHECK((kind = 'change-suggestion') = (proposed_text IS NOT NULL)),
  CHECK((kind = 'annotation') = (length(body) > 0)),
  CHECK((to_grapheme > from_grapheme) = (pinned_text <> '')),
  CHECK(pinned_text <> '' OR kind = 'change-suggestion'),
  CHECK(status = 'open' OR kind = 'annotation')
) STRICT`,
} as const;

/** The foreign key of the staged relation, in the exact-schema validator's own spelling. */
export const IMPORTED_MARK_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  staged_import_marks: ['draft_id>staged_import_snapshots.draft_id:NO ACTION/CASCADE/NONE'],
};

export class ImportedMarkError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ImportedMarkError';
  }
}

function requireImported(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ImportedMarkError(code, message);
}

function integer(value: SQLOutputValue | undefined): number {
  requireImported(typeof value === 'number' && Number.isSafeInteger(value), 'SNAPSHOT_INCOMPLETE', '暂存批注与修订的数字无效。');
  return value;
}

function text(value: SQLOutputValue | undefined): string {
  requireImported(typeof value === 'string' && value.isWellFormed(), 'SNAPSHOT_INCOMPLETE', '暂存批注与修订的文字无效。');
  return value;
}

/**
 * Revision 28, once per store and in one transaction: `proposal_change_items` is rebuilt while it holds
 * revision 27's exact text, with foreign keys off around the transaction; then the staged relation is
 * created, and every reference is checked before anything commits. Shape-detected: once
 * `staged_import_marks` exists this has been done.
 */
export function initializeImportedMarkSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'staged_import_marks'").get();
  if (existing !== undefined) return;
  const widen = proposalChangeItemsShape(db) === 'revision-27';
  const foreignKeys = (): number => integer((db.prepare('PRAGMA foreign_keys').get() as SqlRow).foreign_keys);
  const restoreForeignKeys = widen && foreignKeys() === 1;
  if (widen) {
    db.exec('PRAGMA foreign_keys = OFF');
    requireImported(foreignKeys() === 0, 'SCHEMA_MIGRATION_FAILED', '无法暂时停用引用校验以迁移数据库。');
  }
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (widen) widenProposalChangeItems(db);
      for (const sql of Object.values(IMPORTED_MARK_SCHEMA_SQL)) db.exec(sql);
      requireImported(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Imported mark schema rollback failed.');
      }
      throw error;
    }
  } finally {
    if (restoreForeignKeys) {
      db.exec('PRAGMA foreign_keys = ON');
      requireImported(foreignKeys() === 1, 'SCHEMA_MIGRATION_FAILED', '无法恢复引用校验。');
    }
  }
}

/** Stage the marks of one parse beside its staged blocks, in the caller's transaction. */
export function stageImportedMarks(db: DatabaseSync, draftId: string, marks: ReadonlyArray<ParsedImportedMark>): void {
  const insert = db.prepare(
    `INSERT INTO staged_import_marks(
       draft_id, ordinal, block_position, from_grapheme, to_grapheme, pinned_text, kind, origin, author_label, body,
       proposed_text, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  marks.forEach((mark, index) => {
    requireImported(mark.ordinal === index + 1, 'SNAPSHOT_INCOMPLETE', '暂存批注与修订的次序不连续。');
    insert.run(draftId, mark.ordinal, mark.blockPosition, mark.fromGrapheme, mark.toGrapheme, mark.pinnedText, mark.kind,
      mark.origin, mark.authorLabel, mark.body, mark.proposedText, mark.status);
  });
}

/** Every staged mark of a draft, in ordinal order. */
export function stagedImportedMarks(db: DatabaseSync, draftId: string): ParsedImportedMark[] {
  const rows = db.prepare(
    `SELECT ordinal, block_position, from_grapheme, to_grapheme, pinned_text, kind, origin, author_label, body,
            proposed_text, status
     FROM staged_import_marks WHERE draft_id = ? ORDER BY ordinal`,
  ).all(draftId) as SqlRow[];
  return rows.map((row, index) => {
    const origin = text(row.origin) as ImportedMarkOrigin;
    const kind = text(row.kind);
    const status = text(row.status);
    requireImported(
      integer(row.ordinal) === index + 1 && IMPORTED_MARK_ORIGINS.includes(origin) &&
        (kind === 'annotation' || kind === 'change-suggestion') && (status === 'open' || status === 'resolved'),
      'SNAPSHOT_INCOMPLETE',
      '暂存批注与修订无法证明。',
    );
    return {
      ordinal: integer(row.ordinal),
      blockPosition: integer(row.block_position),
      fromGrapheme: integer(row.from_grapheme),
      toGrapheme: integer(row.to_grapheme),
      pinnedText: text(row.pinned_text),
      kind,
      origin,
      authorLabel: text(row.author_label),
      body: text(row.body),
      proposedText: row.proposed_text === null ? null : text(row.proposed_text),
      status,
    };
  });
}

/** Whether a fresh parse of the staged file reproduces the staged marks exactly, field for field. */
export function stagedImportedMarksMatch(db: DatabaseSync, draftId: string, marks: ReadonlyArray<ParsedImportedMark>): boolean {
  const staged = stagedImportedMarks(db, draftId);
  return staged.length === marks.length && staged.every((mark, index) => {
    const other = marks[index]!;
    return mark.ordinal === other.ordinal && mark.blockPosition === other.blockPosition &&
      mark.fromGrapheme === other.fromGrapheme && mark.toGrapheme === other.toGrapheme && mark.pinnedText === other.pinnedText &&
      mark.kind === other.kind && mark.origin === other.origin && mark.authorLabel === other.authorLabel &&
      mark.body === other.body && mark.proposedText === other.proposedText && mark.status === other.status;
  });
}

/**
 * Create every staged mark of a draft on the manuscript its import commit just wrote, inside that commit's
 * transaction (D5). `blockIdOf` names the Manuscript block a staged position became. Every mark is verified
 * against the working text exactly as an editor's is; one that does not stand where the parse put it refuses
 * the import — nothing is dropped, and nothing is applied. Returns how many marks were created.
 */
export function createImportedMarks(
  db: DatabaseSync,
  marks: EditorialMarkStore,
  draftId: string,
  binding: { manuscriptId: string; branchId: string; blockIdOf: (position: number) => string },
): number {
  const staged = stagedImportedMarks(db, draftId);
  const inputs: ProducedEditorialMarkInput[] = staged.map((mark) => ({
    manuscriptId: binding.manuscriptId,
    branchId: binding.branchId,
    blockId: binding.blockIdOf(mark.blockPosition),
    fromGrapheme: mark.fromGrapheme,
    toGrapheme: mark.toGrapheme,
    pinnedText: mark.pinnedText,
    kind: mark.kind,
    body: mark.body,
    proposedText: mark.proposedText,
    rationale: null,
    atomicGroupId: null,
    source: { kind: 'imported-author', label: mark.authorLabel },
    basis: [],
    status: mark.status,
  }));
  return marks.createProducedMany(inputs, (markIds) => {
    requireImported(
      markIds.every((markId) => markId !== null),
      'IMPORT_MARK_ANCHOR_FAILED',
      '文件中的批注或修订无法准确落在稿件文字上，本次导入没有提交。',
    );
    return markIds.length;
  });
}
