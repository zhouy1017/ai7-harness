import { createHash } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES } from '../../shared/protocol.js';

/**
 * The bounded manuscript store's own primitives (Issue #1175 moved them out of `bounded-manuscript.ts` for its structural
 * edit owner): the store's errors and row readers, canonical digests, graphemes, the working state's Fenwick offset index
 * and the one transaction shape every write takes.
 */
export type SqlRow = Record<string, SQLOutputValue>;

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

export interface OffsetSegment {
  size: number;
  total: number;
}

export function fenwickSpan(position: number): number {
  requireBounded(Number.isSafeInteger(position) && position > 0, 'OFFSET_INDEX_INVALID', '稿件偏移索引位置无效。');
  let remainder = position;
  let span = 1;
  while (remainder % 2 === 0) {
    remainder /= 2;
    span *= 2;
  }
  return span;
}

export function appendOffsetSegment(stack: OffsetSegment[], position: number, length: number): number {
  requireBounded(Number.isSafeInteger(length) && length >= 0, 'OFFSET_INDEX_INVALID', '稿件偏移索引长度无效。');
  let segment: OffsetSegment = { size: 1, total: length };
  while (stack.at(-1)?.size === segment.size) {
    const previous = stack.pop()!;
    const total = previous.total + segment.total;
    requireBounded(Number.isSafeInteger(total), 'OFFSET_INDEX_INVALID', '稿件偏移索引总量无效。');
    segment = { size: segment.size * 2, total };
  }
  requireBounded(segment.size === fenwickSpan(position), 'OFFSET_INDEX_INVALID', '稿件偏移索引范围无效。');
  stack.push(segment);
  return segment.total;
}

export function lastWorkingPosition(db: DatabaseSync, branchId: string): number {
  const row = db.prepare(
    'SELECT position FROM working_blocks WHERE branch_id = ? ORDER BY position DESC LIMIT 1',
  ).get(branchId) as SqlRow | undefined;
  requireBounded(row !== undefined, 'WINDOW_NOT_FOUND', '稿件窗口为空。');
  return asNumber(row.position);
}

export function workingOffsetPrefix(db: DatabaseSync, branchId: string, throughPosition: number): number {
  requireBounded(Number.isSafeInteger(throughPosition) && throughPosition >= 0, 'OFFSET_INDEX_INVALID', '稿件偏移查询位置无效。');
  let position = throughPosition;
  let total = 0;
  const read = db.prepare('SELECT span_graphemes FROM working_offset_nodes WHERE branch_id = ? AND position = ?');
  while (position > 0) {
    const row = read.get(branchId, position) as SqlRow | undefined;
    requireBounded(row !== undefined, 'OFFSET_INDEX_INVALID', '稿件偏移索引节点缺失。');
    total += asNumber(row.span_graphemes);
    requireBounded(Number.isSafeInteger(total), 'OFFSET_INDEX_INVALID', '稿件偏移查询总量无效。');
    position -= fenwickSpan(position);
  }
  return total;
}

export function updateWorkingOffsetNodes(db: DatabaseSync, branchId: string, position: number, delta: number): number {
  requireBounded(Number.isSafeInteger(delta), 'OFFSET_INDEX_INVALID', '稿件偏移变化无效。');
  if (delta === 0) return 0;
  const totalBlocks = lastWorkingPosition(db, branchId);
  requireBounded(position <= totalBlocks, 'OFFSET_INDEX_INVALID', '稿件偏移更新位置无效。');
  const update = db.prepare(
    'UPDATE working_offset_nodes SET span_graphemes = span_graphemes + ? WHERE branch_id = ? AND position = ?',
  );
  let nodePosition = position;
  let changes = 0;
  while (nodePosition <= totalBlocks) {
    requireBounded(
      update.run(delta, branchId, nodePosition).changes === 1,
      'OFFSET_INDEX_INVALID',
      '稿件偏移索引节点无法更新。',
    );
    changes += 1;
    nodePosition += fenwickSpan(nodePosition);
  }
  requireBounded(
    changes <= Math.ceil(Math.log2(totalBlocks)) + 1,
    'OFFSET_INDEX_INVALID',
    '稿件偏移索引更新超出对数边界。',
  );
  return changes;
}


export function transact<T>(db: DatabaseSync, operation: () => T): T {
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
