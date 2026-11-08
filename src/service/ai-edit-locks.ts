import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { canonicalJson, sha256Hex } from './analysis/canonical.js';
import { StoreError, requireStore } from './store-records.js';
import { MAX_WINDOW_BLOCKS } from '../shared/protocol.js';
import {
  MAX_AI_EDIT_LOCK_TARGETS,
  type AiEditLockTarget,
  type AiEditLocksProjection,
  type InspectAiEditLocksInput,
  type ManuscriptWindowAiLocks,
  type SetAiEditLocksInput,
  AI_EDIT_LOCKED_REASON,
} from '../shared/protocol/scoped-edit.js';

/**
 * 🔒 锁定（AI 不修改）(Issue #1412, schema revision 111): which blocks of a manuscript branch — the Book's Manuscript or a
 * derivative document — AI7 may not change. A lock names one block, or a section: a heading and every block under it up to the
 * next heading of its level or above (or the title), resolved against the working state whenever it is read, so a paragraph
 * written into a locked chapter later is locked too.
 *
 * The locks are one append-only ledger, as every ledger of the store is: each lock or unlock is a row appended once and never
 * rewritten or removed, and a target's lock stands as its latest row says. A branch that has never locked anything has no row
 * and nothing locked, so a store from before revision 111 reads exactly as it did.
 */
export const AI_EDIT_LOCK_SCHEMA_SQL = {
  ai_edit_lock_events: `CREATE TABLE ai_edit_lock_events (
  event_id TEXT PRIMARY KEY,
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('block', 'section')),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  locked INTEGER NOT NULL CHECK(locked IN (0, 1)),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  recorded_at TEXT NOT NULL,
  UNIQUE(branch_id, sequence)
) STRICT`,
} as const;

export const AI_EDIT_LOCK_TRIGGER_SQL: Readonly<Record<string, string>> = {
  ai_edit_lock_events_no_update: `CREATE TRIGGER ai_edit_lock_events_no_update
    BEFORE UPDATE ON ai_edit_lock_events
    BEGIN
      SELECT RAISE(ABORT, 'AI_EDIT_LOCK_LEDGER_IMMUTABLE');
    END`,
  ai_edit_lock_events_no_delete: `CREATE TRIGGER ai_edit_lock_events_no_delete
    BEFORE DELETE ON ai_edit_lock_events
    BEGIN
      SELECT RAISE(ABORT, 'AI_EDIT_LOCK_LEDGER_IMMUTABLE');
    END`,
};

/** The foreign keys of the relation, in the exact-schema validator's own spelling. */
export const AI_EDIT_LOCK_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  ai_edit_lock_events: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
  ],
};

type SqlRow = Record<string, SQLOutputValue>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'ai_edit_lock_events'";
const relationSeen = new WeakSet<DatabaseSync>();

function relationExists(db: DatabaseSync): boolean {
  if (relationSeen.has(db)) return true;
  const exists = db.prepare(TABLE_PRESENT).get() !== undefined;
  if (exists) relationSeen.add(db);
  return exists;
}

/** Revision 111's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeAiEditLockSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(AI_EDIT_LOCK_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(AI_EDIT_LOCK_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'AI edit lock schema rollback failed.');
    }
    throw error;
  }
}

/** The lock set as it stands: the blocks locked one by one and the sections locked whole, each still in the working state. */
interface LockSet {
  readonly blockIds: ReadonlyArray<string>;
  readonly sectionHeadingBlockIds: ReadonlyArray<string>;
}

export function aiEditLocksDigest(set: LockSet): string {
  return sha256Hex(canonicalJson({ schema: 'ai7.ai-edit-locks/1', blocks: [...set.blockIds].sort(), sections: [...set.sectionHeadingBlockIds].sort() }));
}

/** Each target's latest row, kept when it locks and its block still stands in the branch's working state (as a heading, for a section). */
function currentLocks(db: DatabaseSync, branchId: string): LockSet {
  if (!relationExists(db)) return { blockIds: [], sectionHeadingBlockIds: [] };
  const rows = db.prepare(
    `SELECT e.target_kind, e.block_id FROM ai_edit_lock_events e
     JOIN working_blocks wb ON wb.branch_id = e.branch_id AND wb.block_id = e.block_id
     WHERE e.branch_id = ? AND e.locked = 1
       AND e.sequence = (SELECT MAX(l.sequence) FROM ai_edit_lock_events l
                         WHERE l.branch_id = e.branch_id AND l.target_kind = e.target_kind AND l.block_id = e.block_id)
       AND (e.target_kind = 'block' OR wb.kind = 'heading')
     ORDER BY wb.position`,
  ).all(branchId) as SqlRow[];
  return {
    blockIds: rows.filter((row) => row.target_kind === 'block').map((row) => String(row.block_id)),
    sectionHeadingBlockIds: rows.filter((row) => row.target_kind === 'section').map((row) => String(row.block_id)),
  };
}

/** The positions a locked section covers: from its heading up to, not including, the next heading of its level or above, or the title. */
function sectionRanges(db: DatabaseSync, branchId: string, headingBlockIds: ReadonlyArray<string>): Array<{ from: number; to: number }> {
  const heading = db.prepare("SELECT position, level FROM working_blocks WHERE branch_id = ? AND block_id = ? AND kind = 'heading'");
  const next = db.prepare(
    `SELECT MIN(position) AS position FROM working_blocks
     WHERE branch_id = ? AND position > ? AND (kind = 'title' OR (kind = 'heading' AND COALESCE(level, 1) <= ?))`,
  );
  return headingBlockIds.flatMap((blockId) => {
    const row = heading.get(branchId, blockId) as SqlRow | undefined;
    if (row === undefined) return [];
    const from = Number(row.position);
    const end = (next.get(branchId, from, Number(row.level ?? 1)) as SqlRow | undefined)?.position;
    return [{ from, to: end === null || end === undefined ? Number.MAX_SAFE_INTEGER : Number(end) }];
  });
}

/**
 * Which of the given blocks AI7 may not change, and the digest of the lock set that says so: locked one by one, or inside a
 * locked section. A block the branch does not hold is not named.
 */
export function aiLockedBlocks(db: DatabaseSync, branchId: string, blockIds?: ReadonlyArray<string>): { locked: Set<string>; digest: string } {
  const set = currentLocks(db, branchId);
  const digest = aiEditLocksDigest(set);
  const locked = new Set<string>();
  if (set.blockIds.length === 0 && set.sectionHeadingBlockIds.length === 0) return { locked, digest };
  const direct = new Set(set.blockIds);
  const ranges = sectionRanges(db, branchId, set.sectionHeadingBlockIds);
  const at = db.prepare('SELECT position FROM working_blocks WHERE branch_id = ? AND block_id = ?');
  const candidates = blockIds ?? (db.prepare('SELECT block_id FROM working_blocks WHERE branch_id = ? ORDER BY position').all(branchId) as SqlRow[]).map((row) => String(row.block_id));
  for (const blockId of candidates) {
    if (direct.has(blockId)) { locked.add(blockId); continue; }
    if (ranges.length === 0) continue;
    const row = at.get(branchId, blockId) as SqlRow | undefined;
    if (row === undefined) continue;
    const position = Number(row.position);
    if (ranges.some((range) => position >= range.from && position < range.to)) locked.add(blockId);
  }
  return { locked, digest };
}

/**
 * The window's view of the locks, for the window owner to carry beside its marks: the locked blocks among the
 * `MAX_WINDOW_BLOCKS` from `startPosition`, and the lock set's digest. A store without the relation carries none.
 */
export function aiLocksOfWindow(db: DatabaseSync, branchId: string, startPosition: number): ManuscriptWindowAiLocks {
  if (!relationExists(db)) return {};
  const ids = (db.prepare('SELECT block_id FROM working_blocks WHERE branch_id = ? AND position >= ? AND position < ? ORDER BY position')
    .all(branchId, startPosition, startPosition + MAX_WINDOW_BLOCKS) as SqlRow[]).map((row) => String(row.block_id));
  const { locked, digest } = aiLockedBlocks(db, branchId, ids);
  return { aiLockedBlockIds: ids.filter((id) => locked.has(id)), aiLocksDigest: digest };
}

function requireBranch(db: DatabaseSync, input: InspectAiEditLocksInput): void {
  requireStore(input !== null && typeof input === 'object' && typeof input.manuscriptId === 'string' && UUID_PATTERN.test(input.manuscriptId) &&
    typeof input.branchId === 'string' && UUID_PATTERN.test(input.branchId), 'AI_EDIT_LOCKS_INVALID', '锁定请求无效。');
  requireStore(db.prepare('SELECT 1 FROM manuscript_branches WHERE manuscript_id = ? AND branch_id = ?').get(input.manuscriptId, input.branchId) !== undefined,
    'MANUSCRIPT_NOT_FOUND', '稿件不存在。');
}

function locksLabel(set: LockSet): string {
  if (set.blockIds.length === 0 && set.sectionHeadingBlockIds.length === 0) return '没有锁定的段落';
  const parts = [set.blockIds.length > 0 ? `${set.blockIds.length} 段` : null, set.sectionHeadingBlockIds.length > 0 ? `${set.sectionHeadingBlockIds.length} 节` : null];
  return `已锁定 ${parts.filter((part) => part !== null).join('、')}：AI 修改时保持原样`;
}

export function inspectAiEditLocks(db: DatabaseSync, input: InspectAiEditLocksInput): AiEditLocksProjection {
  requireBranch(db, input);
  const set = currentLocks(db, input.branchId);
  return { manuscriptId: input.manuscriptId, branchId: input.branchId, ...set, digest: aiEditLocksDigest(set), label: locksLabel(set) };
}

function validTarget(target: unknown): target is AiEditLockTarget {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return false;
  const value = target as Record<string, unknown>;
  return (value.kind === 'block' && Object.keys(value).length === 2 && typeof value.blockId === 'string' && value.blockId.length > 0 && value.blockId.length <= 128) ||
    (value.kind === 'section' && Object.keys(value).length === 2 && typeof value.headingBlockId === 'string' && value.headingBlockId.length > 0 && value.headingBlockId.length <= 128);
}

/**
 * Lock or unlock targets against the lock set the editor saw (`expectedLocksDigest`): one appended row per target whose lock
 * changes, in one transaction. A block the branch does not hold, or a section that is not a heading, is refused by name.
 * `transaction` is the store's own writer.
 */
export function setAiEditLocks(db: DatabaseSync, input: SetAiEditLocksInput, transaction: <T>(work: () => T) => T, now: () => Date = () => new Date()): AiEditLocksProjection {
  requireBranch(db, input);
  requireStore(Array.isArray(input.targets) && input.targets.length >= 1 && input.targets.length <= MAX_AI_EDIT_LOCK_TARGETS && input.targets.every(validTarget) &&
    typeof input.locked === 'boolean' && typeof input.expectedLocksDigest === 'string' && DIGEST_PATTERN.test(input.expectedLocksDigest),
  'AI_EDIT_LOCKS_INVALID', '锁定请求无效。');
  return transaction(() => {
    const before = currentLocks(db, input.branchId);
    if (aiEditLocksDigest(before) !== input.expectedLocksDigest) {
      throw new StoreError('AI_EDIT_LOCKS_STALE', '锁定状态已经变化；请看当前的锁定再试。');
    }
    const block = db.prepare('SELECT kind FROM working_blocks WHERE branch_id = ? AND block_id = ?');
    const held = { block: new Set(before.blockIds), section: new Set(before.sectionHeadingBlockIds) };
    let sequence = Number((db.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM ai_edit_lock_events WHERE branch_id = ?').get(input.branchId) as SqlRow).sequence);
    const insert = db.prepare(`INSERT INTO ai_edit_lock_events(event_id, manuscript_id, branch_id, target_kind, block_id, locked, sequence, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const at = now().toISOString();
    const seen = new Set<string>();
    for (const target of input.targets) {
      const blockId = target.kind === 'block' ? target.blockId : target.headingBlockId;
      const row = block.get(input.branchId, blockId) as SqlRow | undefined;
      requireStore(row !== undefined, 'AI_EDIT_LOCK_TARGET_GONE', '要锁定的段落已不在当前稿件中；请重新选择。');
      requireStore(target.kind === 'block' || row.kind === 'heading', 'AI_EDIT_LOCK_TARGET_INVALID', '只能按标题锁定一节。');
      const key = `${target.kind}:${blockId}`;
      if (seen.has(key) || held[target.kind].has(blockId) === input.locked) continue;
      seen.add(key);
      sequence += 1;
      insert.run(randomUUID(), input.manuscriptId, input.branchId, target.kind, blockId, input.locked ? 1 : 0, sequence, at);
    }
    return inspectAiEditLocks(db, input);
  });
}

/** One block of the working state as a scoped edit reads it, with whether it is AI-locked now. */
export interface ScopedEditWorkingBlock {
  readonly blockId: string;
  readonly position: number;
  readonly kind: string;
  readonly level: number | null;
  readonly text: string;
  readonly digest: string;
  readonly locked: boolean;
}

/**
 * The working blocks a scoped edit reads, in order, with their locks and the lock set's digest: the named blocks with the
 * block before the first and after the last (for context), every block of the branch, or one section's blocks with the block
 * before and after it. A named block the branch does not hold is absent, which the caller refuses.
 */
export function scopedEditWorkingBlocks(db: DatabaseSync, branchId: string,
  selector: { readonly kind: 'blocks'; readonly blockIds: ReadonlyArray<string> } | { readonly kind: 'document' } | { readonly kind: 'section'; readonly headingBlockId: string },
): { blocks: ScopedEditWorkingBlock[]; locksDigest: string; range: { from: number; to: number } | null } {
  const columns = 'block_id, position, kind, level, text, digest';
  const rows = (from: number, to: number): SqlRow[] => db.prepare(`SELECT ${columns} FROM working_blocks WHERE branch_id = ? AND position >= ? AND position <= ? ORDER BY position`)
    .all(branchId, from, to) as SqlRow[];
  let found: SqlRow[];
  let section: { from: number; to: number } | null = null;
  if (selector.kind === 'document') {
    found = db.prepare(`SELECT ${columns} FROM working_blocks WHERE branch_id = ? ORDER BY position`).all(branchId) as SqlRow[];
  } else if (selector.kind === 'section') {
    const range = sectionRanges(db, branchId, [selector.headingBlockId])[0];
    if (range === undefined) throw new StoreError('AI_EDIT_SCOPE_INVALID', '这一节的标题已不在当前稿件中；请重新选择。');
    section = range;
    found = rows(range.from - 1, range.to);
  } else {
    const at = db.prepare('SELECT position FROM working_blocks WHERE branch_id = ? AND block_id = ?');
    const positions = selector.blockIds.map((blockId) => (at.get(branchId, blockId) as SqlRow | undefined)?.position).filter((value) => value !== undefined).map(Number);
    found = positions.length === 0 ? [] : rows(Math.min(...positions) - 1, Math.max(...positions) + 1);
  }
  const ids = found.map((row) => String(row.block_id));
  const { locked, digest } = aiLockedBlocks(db, branchId, ids);
  return {
    locksDigest: digest,
    range: section,
    blocks: found.map((row) => ({
      blockId: String(row.block_id), position: Number(row.position), kind: String(row.kind), level: row.level === null ? null : Number(row.level),
      text: String(row.text), digest: String(row.digest), locked: locked.has(String(row.block_id)),
    })),
  };
}

/**
 * The store's guard at Apply (Issue #1412): an AI7 suggestion — of any task — never reaches a block locked now. Returns the
 * refusal for the first such mark among `markIds`, or `null`. The editor's own revisions are never held back.
 */
export function aiLockedMarkRefusal(db: DatabaseSync, branchId: string, markIds: ReadonlyArray<string>): string | null {
  if (!relationExists(db) || markIds.length === 0) return null;
  const mark = db.prepare("SELECT block_id FROM editorial_marks WHERE mark_id = ? AND branch_id = ? AND source_kind = 'ai7'");
  const blocks = markIds.flatMap((markId) => {
    const row = mark.get(markId, branchId) as SqlRow | undefined;
    return row === undefined ? [] : [String(row.block_id)];
  });
  if (blocks.length === 0) return null;
  return aiLockedBlocks(db, branchId, blocks).locked.size > 0 ? AI_EDIT_LOCKED_REASON : null;
}
