import { createHash } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES } from '../../shared/protocol.js';

/**
 * The bounded manuscript store's own primitives (Issue #1175 moved them out of `bounded-manuscript.ts` for its structural
 * edit owner): the store's errors and row readers, canonical digests, graphemes and the one transaction shape every write
 * takes. The working state's positions are `working-positions.ts`'s (Issue #1654).
 */
export type SqlRow = Record<string, SQLOutputValue>;

export const REVISION_IMPORT_LINEAGE = `lineage AS (
  SELECT revision_id, parent_revision_id, source_version_id, revision_digest, branch_id FROM manuscript_revisions WHERE revision_id = ? AND branch_id = ?
  UNION SELECT p.revision_id, p.parent_revision_id, p.source_version_id, p.revision_digest, p.branch_id FROM manuscript_revisions p
    JOIN lineage child ON p.revision_id = child.parent_revision_id AND p.source_version_id = child.source_version_id AND p.branch_id = child.branch_id
    WHERE NOT EXISTS (SELECT 1 FROM manuscript_block_sources b WHERE b.revision_id = child.revision_id)
      AND NOT EXISTS (SELECT 1 FROM manuscript_note_sources n WHERE n.revision_id = child.revision_id)
)`;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
export const BLOCK_PATTERN = /^blk_[0-9a-f]{24}$/;
export const MIGRATION_BATCH = 256;
export const HISTORY_BATCH = 128;

export class BoundedStoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BoundedStoreError';
  }
}

export class BoundedStoreFatalError extends Error {
  constructor(cause: unknown) {
    super('Bounded SQLite transaction rollback failed.', { cause });
    this.name = 'BoundedStoreFatalError';
  }
}

export function requireBounded(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new BoundedStoreError(code, message);
}

export function one(rows: SqlRow[], code: string, message: string): SqlRow {
  requireBounded(rows.length === 1, code, message);
  return rows[0]!;
}

export function asString(value: SQLOutputValue | undefined): string {
  requireBounded(typeof value === 'string' && value.isWellFormed(), 'STORE_CORRUPT', '持久化记录类型无效。');
  return value;
}

export function asNumber(value: SQLOutputValue | undefined): number {
  requireBounded(typeof value === 'number' && Number.isSafeInteger(value), 'STORE_CORRUPT', '持久化数字无效。');
  return value;
}

export function canonicalJson(value: unknown): string {
  if (typeof value === 'string') requireBounded(value.isWellFormed(), 'CANONICAL_VALUE_INVALID', '无法形成规范摘要。');
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  requireBounded(encoded !== undefined, 'CANONICAL_VALUE_INVALID', '无法形成规范摘要。');
  return encoded;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

let nestedTransactions = 0;

/**
 * One bounded write: its own `BEGIN IMMEDIATE`, or — inside a caller's transaction, as a replacement written as per-occurrence
 * revisions is (Issue #1411) — a savepoint that the caller's commit or rollback decides with everything else it wrote.
 */
export function transact<T>(db: DatabaseSync, operation: () => T): T {
  if (db.isTransaction) {
    const savepoint = `ai7_bounded_${++nestedTransactions}`;
    db.exec(`SAVEPOINT ${savepoint}`);
    try {
      const result = operation();
      db.exec(`RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      try {
        db.exec(`ROLLBACK TO ${savepoint}`);
        db.exec(`RELEASE ${savepoint}`);
      } catch (rollbackError) {
        throw new BoundedStoreFatalError(new AggregateError([error, rollbackError], 'SQLite savepoint rollback failed.'));
      }
      throw error;
    }
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new BoundedStoreFatalError(new AggregateError([error, rollbackError], 'SQLite rollback failed.'));
    }
    throw error;
  }
}

export function stagedBlockLength(
  text: string,
  code = 'SCHEMA_MIGRATION_FAILED',
  message = '暂存稿件包含无法按内容块有界校验的文字。',
): number {
  requireBounded(
    text.isWellFormed() && text.length <= MAX_BLOCK_CODE_UNITS,
    code,
    message,
  );
  const length = graphemes(text).length;
  requireBounded(length <= MAX_BLOCK_GRAPHEMES, code, message);
  return length;
}

/** A relation's or index's SQL as the exact-schema check compares it: case, whitespace and identifier quoting aside. */
export function canonicalSchemaSql(sql: string): string {
  let result = '';
  let quoted: "'" | '"' | '`' | ']' | undefined;
  let identifierValue = '';
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]!;
    if (quoted !== undefined) {
      if (quoted === "'") {
        result += character;
        if (character === "'" && sql[index + 1] === "'") {
          result += sql[index + 1]!;
          index += 1;
        } else if (character === "'") {
          quoted = undefined;
        }
        continue;
      }
      const closing = quoted === ']' ? ']' : quoted;
      if (character === closing && quoted !== ']' && sql[index + 1] === closing) {
        identifierValue += closing;
        index += 1;
      } else if (character === closing) {
        const normalized = identifierValue.toLocaleLowerCase('en-US');
        result += /^[a-z_][a-z0-9_]*$/u.test(normalized) ? normalized : `⟦${normalized}⟧`;
        identifierValue = '';
        quoted = undefined;
      } else {
        identifierValue += character;
      }
      continue;
    }
    if (character === "'") {
      quoted = "'";
      result += character;
    } else if (character === '"' || character === '`') {
      quoted = character;
      identifierValue = '';
    } else if (character === '[') {
      quoted = ']';
      identifierValue = '';
    } else if (!/\s/.test(character) && character !== ';') {
      result += character.toLocaleLowerCase('en-US');
    }
  }
  requireBounded(quoted === undefined && identifierValue.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库结构 SQL 引号无效。');
  return result.replace(/^createtableifnotexists/, 'createtable');
}
