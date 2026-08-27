import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import {
  MAX_BLOCK_CODE_UNITS,
  MAX_BLOCK_GRAPHEMES,
  MAX_EDIT_CODE_UNITS,
  MAX_EDIT_GRAPHEMES,
  MAX_OUTLINE_RESULTS,
  MAX_REPLACEMENT_GRAPHEMES,
  MAX_SEARCH_QUERY_GRAPHEMES,
  MAX_SEARCH_RESULTS,
  MAX_WINDOW_BLOCKS,
  type DurableHistoryProjection,
  type JournalAcknowledgement,
  type JournalEditInput,
  type ManuscriptBlockProjection,
  type ManuscriptWindowProjection,
  type ManuscriptWindowTarget,
  type MilestoneProjection,
  type OutlineProjection,
  type PriorWorkItemProjection,
  type ReplacementCommitProjection,
  type ReplacementPreviewProjection,
  type SearchMatchProjection,
  type SearchResultsProjection,
  type SearchSummaryProjection,
} from '../shared/protocol.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const BLOCK_PATTERN = /^blk_[0-9a-f]{24}$/;
const SCHEMA_VERSION = 3;
const MIGRATION_BATCH = 256;
const SEARCH_BATCH = 128;
const HISTORY_BATCH = 128;
const CONTEXT_GRAPHEMES = 36;
const WINDOW_STRIDE = Math.floor(MAX_WINDOW_BLOCKS / 2);
const MAX_RETAINED_TRANSIENT_SEARCHES = 32;
const REPLACEMENT_MATCHING_RULE = '精确字素匹配；从左向右；重叠时保留最早匹配' as const;
const REPLACEMENT_INCLUSION_RULE = '仅提交冻结时明确纳入的非重叠精确匹配' as const;

type SqlRow = Record<string, SQLOutputValue>;

export class BoundedStoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BoundedStoreError';
  }
}

function requireBounded(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new BoundedStoreError(code, message);
}

function one(rows: SqlRow[], code: string, message: string): SqlRow {
  requireBounded(rows.length === 1, code, message);
  return rows[0]!;
}

function asString(value: SQLOutputValue | undefined): string {
  requireBounded(typeof value === 'string' && value.isWellFormed(), 'STORE_CORRUPT', '持久化记录类型无效。');
  return value;
}

function asNumber(value: SQLOutputValue | undefined): number {
  requireBounded(typeof value === 'number' && Number.isSafeInteger(value), 'STORE_CORRUPT', '持久化数字无效。');
  return value;
}

function canonicalJson(value: unknown): string {
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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

function blockDigest(kind: ManuscriptBlockProjection['kind'], level: number | null, text: string): string {
  return sha256(canonicalJson({ kind, level, text }));
}

function validateIdentity(manuscriptId: string, branchId: string): void {
  requireBounded(UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(branchId), 'MANUSCRIPT_INVALID', '稿件绑定无效。');
}

function validateShortText(value: string, maximum: number, code: string, message: string, allowEmpty = false): string {
  requireBounded(value.isWellFormed(), code, message);
  const normalized = value.normalize('NFC').trim();
  requireBounded((allowEmpty || normalized.length > 0) && normalized.length <= maximum, code, message);
  return normalized;
}

function transact<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite rollback failed.');
    }
    throw error;
  }
}

function recreateRevisionTable(db: DatabaseSync): void {
  db.exec(`
    PRAGMA legacy_alter_table = ON;
    CREATE TABLE manuscript_revisions_v3 (
      revision_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      ordinal INTEGER NOT NULL CHECK(ordinal > 0),
      revision_label TEXT NOT NULL,
      parent_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
      revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, ordinal),
      UNIQUE(manuscript_id, revision_label)
    ) STRICT;
    INSERT INTO manuscript_revisions_v3 SELECT * FROM manuscript_revisions;
    DROP TABLE manuscript_revisions;
    ALTER TABLE manuscript_revisions_v3 RENAME TO manuscript_revisions;
    PRAGMA legacy_alter_table = OFF;
  `);
}

function rebuildRevisionOffsets(db: DatabaseSync, revisionId: string): number {
  const updateVersion = db.prepare(
    `UPDATE manuscript_block_versions SET start_offset = ?, grapheme_length = ?
     WHERE revision_id = ? AND block_id = ?`,
  );
  let position = 0;
  let offset = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT block_id, position, text FROM manuscript_block_versions
       WHERE revision_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(revisionId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const blockId = asString(row.block_id);
      position = asNumber(row.position);
      const length = graphemes(asString(row.text)).length;
      updateVersion.run(offset, length, revisionId, blockId);
      offset += length;
    }
  }
  return offset;
}

function rebuildBranchDerived(db: DatabaseSync, branchId: string): number {
  db.prepare('DELETE FROM manuscript_outline WHERE branch_id = ?').run(branchId);
  db.prepare('DELETE FROM working_block_search WHERE branch_id = ?').run(branchId);
  const updateBlock = db.prepare(
    'UPDATE working_blocks SET start_offset = ?, grapheme_length = ? WHERE branch_id = ? AND block_id = ?',
  );
  const insertOutline = db.prepare(
    `INSERT INTO manuscript_outline(branch_id, block_id, position, start_offset, kind, level, text, digest)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSearch = db.prepare('INSERT INTO working_block_search(branch_id, block_id, text) VALUES (?, ?, ?)');
  let position = 0;
  let offset = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT block_id, position, kind, level, text, digest FROM working_blocks
       WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(branchId, position, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const blockId = asString(row.block_id);
      position = asNumber(row.position);
      const kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
      const level = row.level === null ? null : asNumber(row.level);
      const text = asString(row.text);
      const digest = asString(row.digest);
      const length = graphemes(text).length;
      updateBlock.run(offset, length, branchId, blockId);
      if (kind === 'title' || kind === 'heading') insertOutline.run(branchId, blockId, position, offset, kind, level ?? 1, text, digest);
      insertSearch.run(branchId, blockId, text);
      offset += length;
    }
  }
  db.prepare('UPDATE branch_working_state SET total_graphemes = ? WHERE branch_id = ?').run(offset, branchId);
  return offset;
}

function migrateLegacyJournal(db: DatabaseSync, branchId: string): number {
  const state = one(
    db.prepare('SELECT base_revision_id FROM branch_working_state WHERE branch_id = ?').all(branchId) as SqlRow[],
    'SCHEMA_MIGRATION_FAILED',
    '稿件工作状态缺失。',
  );
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS migration_block_state (
      branch_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL,
      PRIMARY KEY(branch_id, block_id)
    ) STRICT;
  `);
  db.prepare('DELETE FROM migration_block_state WHERE branch_id = ?').run(branchId);
  db.prepare(
    `INSERT INTO migration_block_state(branch_id, block_id, kind, level, text, digest)
     SELECT ?, block_id, kind, level, text, digest FROM manuscript_block_versions WHERE revision_id = ?`,
  ).run(branchId, asString(state.base_revision_id));
  let sequence = 0;
  let previousWorkingDigest = asString(
    one(db.prepare('SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?').all(asString(state.base_revision_id)) as SqlRow[], 'SCHEMA_MIGRATION_FAILED', '基础修订版缺失。').revision_digest,
  );
  while (true) {
    const rows = db.prepare(
      `SELECT journal_entry_id, sequence, block_id, from_grapheme, to_grapheme, insert_text,
              resulting_block_digest, resulting_working_digest, durable_at
       FROM edit_journal_entries WHERE branch_id = ? AND sequence > ? ORDER BY sequence LIMIT ?`,
    ).all(branchId, sequence, MIGRATION_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      const groupId = asString(row.journal_entry_id);
      sequence = asNumber(row.sequence);
      const blockId = asString(row.block_id);
      const block = one(db.prepare('SELECT kind, level, text, digest FROM migration_block_state WHERE branch_id = ? AND block_id = ?').all(branchId, blockId) as SqlRow[], 'SCHEMA_MIGRATION_FAILED', '旧修订日志内容块缺失。');
      const beforeText = asString(block.text);
      const parts = graphemes(beforeText);
      const from = asNumber(row.from_grapheme);
      const to = asNumber(row.to_grapheme);
      const afterText = [...parts.slice(0, from), asString(row.insert_text), ...parts.slice(to)].join('');
      const afterDigest = blockDigest(asString(block.kind) as ManuscriptBlockProjection['kind'], block.level === null ? null : asNumber(block.level), afterText);
      requireBounded(afterDigest === asString(row.resulting_block_digest), 'SCHEMA_MIGRATION_FAILED', '旧修订日志无法精确重建。');
      const afterWorkingDigest = asString(row.resulting_working_digest);
      db.prepare(
        `INSERT INTO manuscript_command_groups(
           command_group_id, branch_id, ordinal, kind, status, source_group_id,
           before_working_digest, after_working_digest, created_at
         ) VALUES (?, ?, ?, 'edit', 'applied', NULL, ?, ?, ?)`,
      ).run(groupId, branchId, sequence, previousWorkingDigest, afterWorkingDigest, asString(row.durable_at));
      db.prepare(
        `INSERT INTO manuscript_command_edits(
           command_group_id, position, block_id, before_text, before_digest, after_text, after_digest
         ) VALUES (?, 1, ?, ?, ?, ?, ?)`,
      ).run(groupId, blockId, beforeText, asString(block.digest), afterText, afterDigest);
      db.prepare('UPDATE edit_journal_entries SET command_group_id = ?, command_kind = ? WHERE journal_entry_id = ?').run(groupId, 'edit', groupId);
      db.prepare('UPDATE migration_block_state SET text = ?, digest = ? WHERE branch_id = ? AND block_id = ?').run(afterText, afterDigest, branchId, blockId);
      previousWorkingDigest = afterWorkingDigest;
    }
  }
  db.prepare('DELETE FROM migration_block_state WHERE branch_id = ?').run(branchId);
  return sequence;
}

export function initializeBoundedSchema(db: DatabaseSync): void {
  const version = asNumber(one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version);
  requireBounded(version === 2 || version === SCHEMA_VERSION, 'SCHEMA_UNSUPPORTED', '数据库版本不受支持。');
  if (version === SCHEMA_VERSION) return;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    recreateRevisionTable(db);
    db.exec(`
      ALTER TABLE staged_import_snapshots ADD COLUMN character_count INTEGER NOT NULL DEFAULT 0 CHECK(character_count >= 0);
      ALTER TABLE staged_import_blocks ADD COLUMN start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0);
      ALTER TABLE staged_import_blocks ADD COLUMN grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0);
      ALTER TABLE manuscript_block_versions ADD COLUMN start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0);
      ALTER TABLE manuscript_block_versions ADD COLUMN grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0);
      ALTER TABLE working_blocks ADD COLUMN start_offset INTEGER NOT NULL DEFAULT 0 CHECK(start_offset >= 0);
      ALTER TABLE working_blocks ADD COLUMN grapheme_length INTEGER NOT NULL DEFAULT 0 CHECK(grapheme_length >= 0);
      ALTER TABLE branch_working_state ADD COLUMN total_graphemes INTEGER NOT NULL DEFAULT 0 CHECK(total_graphemes >= 0);
      ALTER TABLE branch_working_state ADD COLUMN history_sequence INTEGER NOT NULL DEFAULT 0 CHECK(history_sequence >= 0);
      ALTER TABLE branch_working_state ADD COLUMN last_checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_checkpoint_sequence >= 0);
      ALTER TABLE edit_journal_entries ADD COLUMN command_group_id TEXT;
      ALTER TABLE edit_journal_entries ADD COLUMN command_kind TEXT NOT NULL DEFAULT 'edit';

      CREATE TABLE manuscript_outline (
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        position INTEGER NOT NULL CHECK(position > 0),
        start_offset INTEGER NOT NULL CHECK(start_offset >= 0),
        kind TEXT NOT NULL CHECK(kind IN ('title', 'heading')),
        level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 6),
        text TEXT NOT NULL,
        digest TEXT NOT NULL CHECK(length(digest) = 64),
        PRIMARY KEY(branch_id, block_id),
        UNIQUE(branch_id, position)
      ) STRICT;
      CREATE INDEX manuscript_outline_order ON manuscript_outline(branch_id, position);
      CREATE INDEX working_blocks_global_offset ON working_blocks(branch_id, start_offset);

      CREATE VIRTUAL TABLE working_block_search USING fts5(
        branch_id UNINDEXED,
        block_id UNINDEXED,
        text,
        tokenize='trigram'
      );

      CREATE TABLE manuscript_command_groups (
        command_group_id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        ordinal INTEGER NOT NULL CHECK(ordinal > 0),
        kind TEXT NOT NULL CHECK(kind IN ('edit', 'replacement')),
        status TEXT NOT NULL CHECK(status IN ('applied', 'undone', 'superseded')),
        source_group_id TEXT,
        before_working_digest TEXT NOT NULL CHECK(length(before_working_digest) = 64),
        after_working_digest TEXT NOT NULL CHECK(length(after_working_digest) = 64),
        created_at TEXT NOT NULL,
        UNIQUE(branch_id, ordinal)
      ) STRICT;
      CREATE TABLE manuscript_command_edits (
        command_group_id TEXT NOT NULL REFERENCES manuscript_command_groups(command_group_id),
        position INTEGER NOT NULL CHECK(position > 0),
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        before_text TEXT NOT NULL,
        before_digest TEXT NOT NULL CHECK(length(before_digest) = 64),
        after_text TEXT NOT NULL,
        after_digest TEXT NOT NULL CHECK(length(after_digest) = 64),
        PRIMARY KEY(command_group_id, position),
        UNIQUE(command_group_id, block_id)
      ) STRICT;
      CREATE INDEX command_history_state ON manuscript_command_groups(branch_id, status, ordinal);

      CREATE TABLE milestone_versions (
        milestone_id TEXT PRIMARY KEY,
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        label TEXT NOT NULL,
        purpose TEXT NOT NULL,
        note TEXT,
        actor TEXT NOT NULL CHECK(actor = '本机编辑'),
        created_at TEXT NOT NULL,
        UNIQUE(branch_id, label)
      ) STRICT;
      CREATE TABLE milestone_signoff_records (
        signoff_record_id TEXT PRIMARY KEY,
        milestone_id TEXT NOT NULL UNIQUE REFERENCES milestone_versions(milestone_id),
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(workflow_instance_id),
        workflow_evidence_digest TEXT NOT NULL CHECK(length(workflow_evidence_digest) = 64),
        actor TEXT NOT NULL CHECK(actor = '本机编辑'),
        signed_at TEXT NOT NULL,
        label TEXT NOT NULL,
        stated_next_use TEXT NOT NULL
      ) STRICT;

      CREATE TABLE manuscript_search_sessions (
        search_id TEXT PRIMARY KEY,
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
        query TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('running', 'completed', 'cancelled', 'failed')),
        scanned_position INTEGER NOT NULL DEFAULT 0 CHECK(scanned_position >= 0),
        total_blocks INTEGER NOT NULL CHECK(total_blocks > 0),
        total_matches INTEGER NOT NULL DEFAULT 0 CHECK(total_matches >= 0),
        created_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT;
      CREATE TABLE manuscript_search_results (
        search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK(ordinal > 0),
        match_id TEXT NOT NULL,
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
        to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
        global_character INTEGER NOT NULL CHECK(global_character >= 0),
        heading_label TEXT NOT NULL,
        context TEXT NOT NULL,
        range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
        PRIMARY KEY(search_id, ordinal),
        UNIQUE(search_id, match_id)
      ) STRICT;

      CREATE TABLE manuscript_replacement_previews (
        preview_id TEXT PRIMARY KEY,
        search_id TEXT NOT NULL REFERENCES manuscript_search_sessions(search_id),
        manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
        branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
        revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
        working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
        query TEXT NOT NULL,
        replacement TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('reviewing', 'frozen', 'committed', 'cancelled', 'failed')),
        total_matches INTEGER NOT NULL CHECK(total_matches > 0),
        included_matches INTEGER NOT NULL CHECK(included_matches >= 0),
        validated_ordinal INTEGER NOT NULL DEFAULT 0 CHECK(validated_ordinal >= 0),
        created_at TEXT NOT NULL,
        committed_at TEXT
      ) STRICT;
      CREATE TABLE manuscript_replacement_matches (
        preview_id TEXT NOT NULL REFERENCES manuscript_replacement_previews(preview_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK(ordinal > 0),
        match_id TEXT NOT NULL,
        block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
        from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
        to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
        range_digest TEXT NOT NULL CHECK(length(range_digest) = 64),
        included INTEGER NOT NULL CHECK(included IN (0, 1)),
        PRIMARY KEY(preview_id, ordinal),
        UNIQUE(preview_id, match_id)
      ) STRICT;
      CREATE INDEX replacement_matches_block ON manuscript_replacement_matches(preview_id, included, block_id, from_grapheme);
    `);

    let branchCursor = '';
    while (true) {
      const branches = db.prepare('SELECT branch_id FROM branch_working_state WHERE branch_id > ? ORDER BY branch_id LIMIT ?').all(branchCursor, MIGRATION_BATCH) as SqlRow[];
      if (branches.length === 0) break;
      for (const branch of branches) {
        branchCursor = asString(branch.branch_id);
        const baseRevisionId = asString(one(
          db.prepare('SELECT base_revision_id FROM branch_working_state WHERE branch_id = ?').all(branchCursor) as SqlRow[],
          'SCHEMA_MIGRATION_FAILED',
          '稿件工作状态缺失。',
        ).base_revision_id);
        rebuildRevisionOffsets(db, baseRevisionId);
        const history = migrateLegacyJournal(db, branchCursor);
        db.prepare('UPDATE branch_working_state SET history_sequence = ? WHERE branch_id = ?').run(history, branchCursor);
        rebuildBranchDerived(db, branchCursor);
      }
    }
    db.exec('DROP TABLE IF EXISTS temp.migration_block_state');
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    requireBounded(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库迁移后的引用校验失败。');
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}; COMMIT;`);
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* terminal migration failure is reported by the caller */ }
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

interface BranchBinding {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  workingDigest: string;
  totalCharacters: number;
  historySequence: number;
}

export class BoundedManuscriptStore {
  readonly #db: DatabaseSync;
  readonly #cursorSecret = randomBytes(32);

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  initializeImportedBranch(branchId: string): number {
    return rebuildBranchDerived(this.#db, branchId);
  }

  listPriorWork(): ReadonlyArray<PriorWorkItemProjection> {
    const rows = this.#db.prepare(
      `SELECT b.book_id, b.title, m.manuscript_id, mb.branch_id, mb.name branch_name,
              mr.revision_id, mr.revision_label, bws.journal_sequence, bws.working_digest, bws.total_graphemes,
              mv.milestone_id, mv.label milestone_label, mv.purpose milestone_purpose, mvr.revision_label milestone_revision_label
       FROM branch_working_state bws
       JOIN manuscript_branches mb ON mb.branch_id = bws.branch_id
       JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
       JOIN books b ON b.book_id = m.book_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       LEFT JOIN milestone_versions mv ON mv.milestone_id = (
         SELECT milestone_id FROM milestone_versions WHERE branch_id = mb.branch_id ORDER BY created_at DESC, milestone_id DESC LIMIT 1
       )
       LEFT JOIN manuscript_revisions mvr ON mvr.revision_id = mv.revision_id
       ORDER BY b.created_at DESC, b.book_id DESC LIMIT 20`,
    ).all() as SqlRow[];
    return rows.map((row) => ({
      bookId: asString(row.book_id),
      bookTitle: asString(row.title),
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      branchName: asString(row.branch_name),
      revisionId: asString(row.revision_id),
      revisionLabel: asString(row.revision_label),
      journalSequence: asNumber(row.journal_sequence),
      workingDigest: asString(row.working_digest),
      totalCharacters: asNumber(row.total_graphemes),
      latestMilestone: row.milestone_id === null ? null : {
        milestoneId: asString(row.milestone_id),
        label: asString(row.milestone_label),
        purpose: asString(row.milestone_purpose),
        revisionLabel: asString(row.milestone_revision_label),
      },
    }));
  }

  getWindow(manuscriptId: string, branchId: string, target: ManuscriptWindowTarget): ManuscriptWindowProjection {
    const binding = this.#binding(manuscriptId, branchId);
    let targetPosition = 1;
    let focusBlockId: string | null = null;
    if (target.kind === 'cursor') {
      targetPosition = this.#decodeCursor(target.cursor, 'window', binding).position;
    } else if (target.kind === 'block' || target.kind === 'window-start') {
      requireBounded(BLOCK_PATTERN.test(target.blockId), 'WINDOW_INVALID', '稿件位置无效。');
      const row = one(this.#db.prepare('SELECT position FROM working_blocks WHERE branch_id = ? AND block_id = ?').all(branchId, target.blockId) as SqlRow[], 'WINDOW_NOT_FOUND', '稿件位置不存在。');
      targetPosition = asNumber(row.position);
      if (target.kind === 'block') focusBlockId = target.blockId;
    } else if (target.kind === 'character') {
      requireBounded(Number.isSafeInteger(target.character) && target.character >= 0, 'WINDOW_INVALID', '全稿位置无效。');
      const character = Math.min(target.character, Math.max(0, binding.totalCharacters - 1));
      const row = one(this.#db.prepare(
        `SELECT block_id, position FROM working_blocks WHERE branch_id = ? AND start_offset <= ?
         ORDER BY start_offset DESC LIMIT 1`,
      ).all(branchId, character) as SqlRow[], 'WINDOW_NOT_FOUND', '全稿位置不存在。');
      targetPosition = asNumber(row.position);
      focusBlockId = asString(row.block_id);
    } else if (target.kind === 'proportion') {
      requireBounded(Number.isFinite(target.proportion) && target.proportion >= 0 && target.proportion <= 1, 'WINDOW_INVALID', '全稿比例无效。');
      const character = Math.min(Math.max(0, binding.totalCharacters - 1), Math.floor(binding.totalCharacters * target.proportion));
      const row = one(this.#db.prepare(
        `SELECT block_id, position FROM working_blocks WHERE branch_id = ? AND start_offset <= ?
         ORDER BY start_offset DESC LIMIT 1`,
      ).all(branchId, character) as SqlRow[], 'WINDOW_NOT_FOUND', '全稿位置不存在。');
      targetPosition = asNumber(row.position);
      focusBlockId = asString(row.block_id);
    }
    const totalBlocks = asNumber(one(this.#db.prepare('SELECT count(*) total FROM working_blocks WHERE branch_id = ?').all(branchId) as SqlRow[], 'WINDOW_NOT_FOUND', '稿件窗口计数缺失。').total);
    requireBounded(totalBlocks > 0, 'WINDOW_NOT_FOUND', '稿件窗口为空。');
    const startPosition = Math.min(Math.max(1, targetPosition - (focusBlockId ? Math.floor(MAX_WINDOW_BLOCKS / 2) : 0)), Math.max(1, totalBlocks - MAX_WINDOW_BLOCKS + 1));
    const rows = this.#db.prepare(
      `SELECT block_id, position, kind, level, text, digest, start_offset, grapheme_length
       FROM working_blocks WHERE branch_id = ? AND position >= ? ORDER BY position LIMIT ?`,
    ).all(branchId, startPosition, MAX_WINDOW_BLOCKS + 1) as SqlRow[];
    const visible = rows.slice(0, MAX_WINDOW_BLOCKS);
    const blocks = visible.map((row) => ({
      blockId: asString(row.block_id),
      position: asNumber(row.position),
      kind: asString(row.kind) as ManuscriptBlockProjection['kind'],
      level: row.level === null ? null : asNumber(row.level),
      text: asString(row.text),
      digest: asString(row.digest),
    }));
    requireBounded(blocks.length > 0 && blocks.length <= MAX_WINDOW_BLOCKS, 'WINDOW_NOT_FOUND', '稿件窗口为空。');
    const first = visible[0]!;
    const last = visible.at(-1)!;
    const startCharacter = asNumber(first.start_offset);
    const endCharacter = asNumber(last.start_offset) + asNumber(last.grapheme_length);
    const resolvedPosition = focusBlockId === null ? asNumber(first.position) : targetPosition;
    const resolvedCharacter = focusBlockId === null
      ? startCharacter
      : asNumber(one(this.#db.prepare(
          'SELECT start_offset FROM working_blocks WHERE branch_id = ? AND position = ?',
        ).all(branchId, resolvedPosition) as SqlRow[], 'WINDOW_NOT_FOUND', '稿件精确位置不存在。').start_offset);
    const structure = this.#db.prepare(
      'SELECT text FROM manuscript_outline WHERE branch_id = ? AND position <= ? ORDER BY position DESC LIMIT 1',
    ).get(branchId, resolvedPosition) as SqlRow | undefined;
    const proportion = binding.totalCharacters === 0 ? 0 : resolvedCharacter / binding.totalCharacters;
    const cursorBinding = { ...binding };
    return {
      bookId: binding.bookId,
      manuscriptId,
      branchId,
      revisionId: binding.revisionId,
      revisionLabel: binding.revisionLabel,
      journalSequence: binding.journalSequence,
      workingDigest: binding.workingDigest,
      focusBlockId,
      previousCursor: startPosition > 1 ? this.#encodeCursor('window', cursorBinding, { position: Math.max(1, startPosition - WINDOW_STRIDE) }) : null,
      nextCursor: rows.length > MAX_WINDOW_BLOCKS ? this.#encodeCursor('window', cursorBinding, { position: startPosition + WINDOW_STRIDE }) : null,
      position: {
        startBlock: asNumber(first.position),
        endBlock: asNumber(last.position),
        totalBlocks,
        startCharacter,
        endCharacter,
        totalCharacters: binding.totalCharacters,
        proportion,
        structureLabel: structure ? asString(structure.text) : null,
        label: `${structure ? `${asString(structure.text)} · ` : ''}全稿 ${(proportion * 100).toFixed(3)}%`,
      },
      blocks,
    };
  }

  getOutline(manuscriptId: string, branchId: string, cursor: string | null): OutlineProjection {
    const binding = this.#binding(manuscriptId, branchId);
    const position = cursor === null ? 0 : this.#decodeCursor(cursor, 'outline', binding).position;
    const rows = this.#db.prepare(
      `SELECT block_id, position, kind, level, text, start_offset FROM manuscript_outline
       WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(branchId, position, MAX_OUTLINE_RESULTS + 1) as SqlRow[];
    const visible = rows.slice(0, MAX_OUTLINE_RESULTS);
    return {
      manuscriptId,
      branchId,
      revisionId: binding.revisionId,
      workingDigest: binding.workingDigest,
      entries: visible.map((row) => ({
        outlineId: `${branchId}:${asString(row.block_id)}`,
        blockId: asString(row.block_id),
        kind: asString(row.kind) as 'title' | 'heading',
        level: asNumber(row.level),
        text: asString(row.text),
        character: asNumber(row.start_offset),
        proportion: binding.totalCharacters === 0 ? 0 : asNumber(row.start_offset) / binding.totalCharacters,
      })),
      previousCursor: position === 0
        ? null
        : this.#encodeCursor('outline', binding, {
            position: asNumber(this.#db.prepare(
              `SELECT COALESCE((
                 SELECT position FROM manuscript_outline
                 WHERE branch_id = ? AND position <= ?
                 ORDER BY position DESC LIMIT 1 OFFSET ?
               ), 0) position`,
            ).get(branchId, position, MAX_OUTLINE_RESULTS) as SqlRow).position,
          }),
      nextCursor: rows.length > MAX_OUTLINE_RESULTS
        ? this.#encodeCursor('outline', binding, { position: asNumber(visible.at(-1)!.position) })
        : null,
    };
  }

  flushJournalEdit(input: JournalEditInput): JournalAcknowledgement {
    validateIdentity(input.manuscriptId, input.branchId);
    requireBounded(UUID_PATTERN.test(input.clientEditId) && UUID_PATTERN.test(input.baseRevisionId) && BLOCK_PATTERN.test(input.blockId) && BLOCK_PATTERN.test(input.windowStartBlockId) && DIGEST_PATTERN.test(input.baseBlockDigest), 'EDIT_INVALID', '编辑标识无效。');
    requireBounded(input.insertText.isWellFormed() && input.insertText.length <= MAX_EDIT_CODE_UNITS, 'EDIT_TOO_LARGE', '单次编辑超出安全范围。');
    const inserted = graphemes(input.insertText);
    requireBounded(inserted.length <= MAX_EDIT_GRAPHEMES, 'EDIT_TOO_LARGE', '单次编辑超出安全范围。');
    const fingerprint = sha256(canonicalJson(input));
    const prior = this.#db.prepare(
      `SELECT client_edit_id, request_fingerprint, branch_id, base_revision_id, block_id, sequence,
              resulting_block_digest, resulting_working_digest, durable_at
       FROM edit_journal_entries WHERE client_edit_id = ?`,
    ).all(input.clientEditId) as SqlRow[];
    if (prior.length === 1) {
      requireBounded(asString(prior[0]!.request_fingerprint) === fingerprint, 'IDEMPOTENCY_CONFLICT', '编辑标识已用于另一项修改。');
      return this.#journalAck(prior[0]!, input);
    }
    transact(this.#db, () => {
      const binding = this.#binding(input.manuscriptId, input.branchId);
      requireBounded(binding.revisionId === input.baseRevisionId, 'EDIT_BINDING_CHANGED', '编辑绑定已变化。');
      requireBounded(binding.journalSequence === input.expectedJournalSequence, 'EDIT_SEQUENCE_CHANGED', '修订日志已前进，请刷新窗口。');
      requireBounded(
        this.#db.prepare('SELECT 1 FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(input.branchId, input.windowStartBlockId) !== undefined,
        'EDIT_BLOCK_CHANGED',
        '编辑窗口已变化，请刷新窗口。',
      );
      const block = one(this.#db.prepare(
        'SELECT position, kind, level, text, digest, grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?',
      ).all(input.branchId, input.blockId) as SqlRow[], 'EDIT_BLOCK_CHANGED', '稳定内容块不存在。');
      requireBounded(asString(block.digest) === input.baseBlockDigest, 'EDIT_BLOCK_CHANGED', '内容块已变化，请刷新窗口。');
      const beforeText = asString(block.text);
      const before = graphemes(beforeText);
      requireBounded(Number.isSafeInteger(input.fromGrapheme) && Number.isSafeInteger(input.toGrapheme) && input.fromGrapheme >= 0 && input.toGrapheme >= input.fromGrapheme && input.toGrapheme <= before.length && input.toGrapheme - input.fromGrapheme <= MAX_EDIT_GRAPHEMES, 'EDIT_RANGE_INVALID', '编辑字素范围无效。');
      const afterText = [...before.slice(0, input.fromGrapheme), ...inserted, ...before.slice(input.toGrapheme)].join('');
      const after = graphemes(afterText);
      requireBounded(afterText.length <= MAX_BLOCK_CODE_UNITS && after.length <= MAX_BLOCK_GRAPHEMES, 'EDIT_TOO_LARGE', '编辑后内容块超出安全范围。');
      const kind = asString(block.kind) as ManuscriptBlockProjection['kind'];
      const level = block.level === null ? null : asNumber(block.level);
      const afterDigest = blockDigest(kind, level, afterText);
      const sequence = binding.journalSequence + 1;
      const groupId = randomUUID();
      const historyOrdinal = binding.historySequence + 1;
      const workingDigest = sha256(canonicalJson({ previous: binding.workingDigest, sequence, groupId, blockId: input.blockId, afterDigest }));
      const durableAt = new Date().toISOString();
      this.#db.prepare("UPDATE manuscript_command_groups SET status = 'superseded' WHERE branch_id = ? AND status = 'undone'").run(input.branchId);
      this.#db.prepare(
        `INSERT INTO manuscript_command_groups(
           command_group_id, branch_id, ordinal, kind, status, source_group_id,
           before_working_digest, after_working_digest, created_at
         ) VALUES (?, ?, ?, 'edit', 'applied', NULL, ?, ?, ?)`,
      ).run(groupId, input.branchId, historyOrdinal, binding.workingDigest, workingDigest, durableAt);
      this.#db.prepare(
        `INSERT INTO manuscript_command_edits(
           command_group_id, position, block_id, before_text, before_digest, after_text, after_digest
         ) VALUES (?, 1, ?, ?, ?, ?, ?)`,
      ).run(groupId, input.blockId, beforeText, input.baseBlockDigest, afterText, afterDigest);
      const delta = after.length - before.length;
      const updated = this.#db.prepare(
        `UPDATE working_blocks SET text = ?, digest = ?, grapheme_length = ?
         WHERE branch_id = ? AND block_id = ? AND digest = ?`,
      ).run(afterText, afterDigest, after.length, input.branchId, input.blockId, input.baseBlockDigest);
      requireBounded(updated.changes === 1, 'EDIT_BLOCK_CHANGED', '内容块在保存时已变化。');
      if (delta !== 0) this.#db.prepare('UPDATE working_blocks SET start_offset = start_offset + ? WHERE branch_id = ? AND position > ?').run(delta, input.branchId, asNumber(block.position));
      this.#refreshBlockIndexes(input.branchId, input.blockId, asNumber(block.position), kind, level, afterText, afterDigest);
      this.#db.prepare(
        `INSERT INTO edit_journal_entries(
           journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
           sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
           resulting_working_digest, durable_at, command_group_id, command_kind
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'edit')`,
      ).run(randomUUID(), input.clientEditId, fingerprint, input.manuscriptId, input.branchId, input.baseRevisionId,
        sequence, input.blockId, input.fromGrapheme, input.toGrapheme, input.insertText, afterDigest,
        workingDigest, durableAt, groupId);
      const state = this.#db.prepare(
        `UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?, total_graphemes = total_graphemes + ?, history_sequence = ?
         WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?`,
      ).run(sequence, workingDigest, delta, historyOrdinal, input.branchId, binding.journalSequence, binding.workingDigest);
      requireBounded(state.changes === 1, 'EDIT_SEQUENCE_CHANGED', '修订日志在保存时已前进。');
    });
    const committed = one(this.#db.prepare(
      `SELECT client_edit_id, request_fingerprint, branch_id, base_revision_id, block_id, sequence,
              resulting_block_digest, resulting_working_digest, durable_at
       FROM edit_journal_entries WHERE client_edit_id = ?`,
    ).all(input.clientEditId) as SqlRow[], 'JOURNAL_ACK_FAILED', '修订日志已提交但无法读取确认。');
    return this.#journalAck(committed, input);
  }

  createSearch(manuscriptId: string, branchId: string, queryInput: string): SearchSummaryProjection & { scannedPosition: number; totalBlocks: number } {
    const query = validateShortText(queryInput, 256, 'SEARCH_INVALID', '搜索文字必须为有效的短文本。');
    requireBounded(graphemes(query).length <= MAX_SEARCH_QUERY_GRAPHEMES, 'SEARCH_INVALID', '搜索文字过长。');
    const binding = this.#binding(manuscriptId, branchId);
    this.#pruneTransientSearches();
    const totalBlocks = asNumber(one(this.#db.prepare('SELECT count(*) total FROM working_blocks WHERE branch_id = ?').all(branchId) as SqlRow[], 'SEARCH_INVALID', '稿件内容缺失。').total);
    const searchId = randomUUID();
    this.#db.prepare(
      `INSERT INTO manuscript_search_sessions(
         search_id, manuscript_id, branch_id, revision_id, working_digest, query, state,
         scanned_position, total_blocks, total_matches, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'running', 0, ?, 0, ?)`,
    ).run(searchId, manuscriptId, branchId, binding.revisionId, binding.workingDigest, query, totalBlocks, new Date().toISOString());
    return { searchId, manuscriptId, branchId, revisionId: binding.revisionId, workingDigest: binding.workingDigest, query, scopeLabel: '全稿', totalMatches: 0, scannedPosition: 0, totalBlocks };
  }

  advanceSearch(searchId: string): { done: boolean; summary: SearchSummaryProjection; scannedPosition: number; totalBlocks: number } {
    requireBounded(UUID_PATTERN.test(searchId), 'SEARCH_INVALID', '搜索标识无效。');
    const session = one(this.#db.prepare('SELECT * FROM manuscript_search_sessions WHERE search_id = ?').all(searchId) as SqlRow[], 'SEARCH_NOT_FOUND', '搜索不存在。');
    const state = asString(session.state);
    requireBounded(state === 'running' || state === 'completed', state === 'cancelled' ? 'JOB_CANCELLED' : 'SEARCH_FAILED', state === 'cancelled' ? '搜索已取消。' : '搜索已失效。');
    const summary = this.#searchSummary(session);
    if (state === 'completed') return { done: true, summary, scannedPosition: asNumber(session.total_blocks), totalBlocks: asNumber(session.total_blocks) };
    const binding = this.#binding(asString(session.manuscript_id), asString(session.branch_id));
    if (binding.workingDigest !== asString(session.working_digest)) {
      this.#db.prepare("UPDATE manuscript_search_sessions SET state = 'failed', completed_at = ? WHERE search_id = ?").run(new Date().toISOString(), searchId);
      this.#pruneTransientSearches();
      throw new BoundedStoreError('SEARCH_STALE', '稿件已变化，请刷新搜索。');
    }
    const afterPosition = asNumber(session.scanned_position);
    const query = asString(session.query);
    const useTrigram = graphemes(query).length >= 3;
    const ftsQuery = `"${query.replace(/"/g, '""')}"`;
    const rows = (useTrigram
      ? this.#db.prepare(
          `SELECT wb.block_id, wb.position, wb.text, wb.digest, wb.start_offset
           FROM working_block_search
           JOIN working_blocks wb ON wb.branch_id = working_block_search.branch_id
             AND wb.block_id = working_block_search.block_id
           WHERE working_block_search.branch_id = ? AND working_block_search MATCH ? AND wb.position > ?
           ORDER BY wb.position LIMIT ?`,
        ).all(binding.branchId, ftsQuery, afterPosition, SEARCH_BATCH)
      : this.#db.prepare(
          `SELECT block_id, position, text, digest, start_offset FROM working_blocks
           WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?`,
        ).all(binding.branchId, afterPosition, SEARCH_BATCH)) as SqlRow[];
    let scannedPosition = afterPosition;
    let nextOrdinal = asNumber(session.total_matches);
    const insert = this.#db.prepare(
      `INSERT INTO manuscript_search_results(
         search_id, ordinal, match_id, block_id, from_grapheme, to_grapheme,
         global_character, heading_label, context, range_digest
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    transact(this.#db, () => {
      for (const row of rows) {
        const blockId = asString(row.block_id);
        scannedPosition = Math.max(scannedPosition, asNumber(row.position));
        const text = graphemes(asString(row.text));
        const needle = graphemes(query);
        for (let start = 0; start <= text.length - needle.length; start += 1) {
          if (!needle.every((part, index) => text[start + index] === part)) continue;
          nextOrdinal += 1;
          const to = start + needle.length;
          const contextStart = Math.max(0, start - CONTEXT_GRAPHEMES);
          const contextEnd = Math.min(text.length, to + CONTEXT_GRAPHEMES);
          const rangeDigest = sha256(canonicalJson({ blockDigest: asString(row.digest), from: start, to, query }));
          const heading = this.#db.prepare(
            'SELECT text FROM manuscript_outline WHERE branch_id = ? AND position <= ? ORDER BY position DESC LIMIT 1',
          ).get(binding.branchId, asNumber(row.position)) as SqlRow | undefined;
          const matchId = `hit_${sha256(`${searchId}\u0000${blockId}\u0000${start}`).slice(0, 24)}`;
          insert.run(searchId, nextOrdinal, matchId, blockId, start, to, asNumber(row.start_offset) + start,
            heading ? asString(heading.text) : '正文', text.slice(contextStart, contextEnd).join(''), rangeDigest);
          start = to - 1;
        }
      }
      const done = useTrigram ? rows.length < SEARCH_BATCH : rows.length < SEARCH_BATCH;
      if (done) {
        this.#db.prepare(
          "UPDATE manuscript_search_sessions SET state = 'completed', scanned_position = total_blocks, total_matches = ?, completed_at = ? WHERE search_id = ?",
        ).run(nextOrdinal, new Date().toISOString(), searchId);
      } else {
        this.#db.prepare('UPDATE manuscript_search_sessions SET scanned_position = ?, total_matches = ? WHERE search_id = ?').run(scannedPosition, nextOrdinal, searchId);
      }
    });
    const updated = one(this.#db.prepare('SELECT * FROM manuscript_search_sessions WHERE search_id = ?').all(searchId) as SqlRow[], 'SEARCH_NOT_FOUND', '搜索不存在。');
    if (asString(updated.state) === 'completed') this.#pruneTransientSearches();
    return { done: asString(updated.state) === 'completed', summary: this.#searchSummary(updated), scannedPosition: asNumber(updated.scanned_position), totalBlocks: asNumber(updated.total_blocks) };
  }

  cancelSearch(searchId: string): void {
    this.#db.prepare("UPDATE manuscript_search_sessions SET state = 'cancelled', completed_at = ? WHERE search_id = ? AND state = 'running'").run(new Date().toISOString(), searchId);
    this.#pruneTransientSearches();
  }

  getSearchResults(searchId: string, cursor: string | null): SearchResultsProjection {
    const session = one(this.#db.prepare('SELECT * FROM manuscript_search_sessions WHERE search_id = ?').all(searchId) as SqlRow[], 'SEARCH_NOT_FOUND', '搜索不存在。');
    requireBounded(asString(session.state) === 'completed', 'SEARCH_NOT_READY', '搜索仍在进行。');
    const offset = cursor === null ? 0 : this.#decodeSimpleCursor(cursor, `search:${searchId}`);
    const rows = this.#db.prepare(
      `SELECT ordinal, match_id, block_id, from_grapheme, to_grapheme, global_character,
              heading_label, context, range_digest
       FROM manuscript_search_results WHERE search_id = ? AND ordinal > ? ORDER BY ordinal LIMIT ?`,
    ).all(searchId, offset, MAX_SEARCH_RESULTS + 1) as SqlRow[];
    const visible = rows.slice(0, MAX_SEARCH_RESULTS);
    const results = visible.map((row) => this.#searchMatch(row));
    return {
      ...this.#searchSummary(session),
      results,
      previousCursor: offset > 0 ? this.#encodeSimpleCursor(`search:${searchId}`, Math.max(0, offset - MAX_SEARCH_RESULTS)) : null,
      nextCursor: rows.length > MAX_SEARCH_RESULTS ? this.#encodeSimpleCursor(`search:${searchId}`, asNumber(visible.at(-1)!.ordinal)) : null,
    };
  }

  prepareReplacement(searchId: string, replacementInput: string): ReplacementPreviewProjection {
    requireBounded(replacementInput.isWellFormed() && replacementInput.length <= 1_024, 'REPLACEMENT_INVALID', '替换文字无效。');
    const replacement = replacementInput.normalize('NFC');
    requireBounded(graphemes(replacement).length <= MAX_REPLACEMENT_GRAPHEMES, 'REPLACEMENT_INVALID', '替换文字过长。');
    const search = one(this.#db.prepare('SELECT * FROM manuscript_search_sessions WHERE search_id = ?').all(searchId) as SqlRow[], 'SEARCH_NOT_FOUND', '搜索不存在。');
    requireBounded(asString(search.state) === 'completed' && asNumber(search.total_matches) > 0, 'REPLACEMENT_INVALID', '没有可供替换的精确匹配。');
    const binding = this.#binding(asString(search.manuscript_id), asString(search.branch_id));
    requireBounded(binding.workingDigest === asString(search.working_digest), 'SEARCH_STALE', '稿件已变化，请刷新搜索。');
    const previewId = randomUUID();
    transact(this.#db, () => {
      this.#db.prepare(
        `INSERT INTO manuscript_replacement_previews(
           preview_id, search_id, manuscript_id, branch_id, revision_id, working_digest,
           query, replacement, state, total_matches, included_matches, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reviewing', ?, ?, ?)`,
      ).run(previewId, searchId, binding.manuscriptId, binding.branchId, binding.revisionId, binding.workingDigest,
        asString(search.query), replacement, asNumber(search.total_matches), asNumber(search.total_matches), new Date().toISOString());
      this.#db.prepare(
        `INSERT INTO manuscript_replacement_matches(
           preview_id, ordinal, match_id, block_id, from_grapheme, to_grapheme, range_digest, included
         ) SELECT ?, ordinal, match_id, block_id, from_grapheme, to_grapheme, range_digest, 1
           FROM manuscript_search_results WHERE search_id = ? ORDER BY ordinal`,
      ).run(previewId, searchId);
      this.#requireNonOverlappingReplacement(previewId);
    });
    return this.#replacementProjection(previewId);
  }

  freezeReplacement(previewId: string, excludedMatchIds: ReadonlyArray<string>): ReplacementPreviewProjection {
    requireBounded(UUID_PATTERN.test(previewId) && excludedMatchIds.length <= 1_000 && new Set(excludedMatchIds).size === excludedMatchIds.length && excludedMatchIds.every((id) => /^hit_[0-9a-f]{24}$/.test(id)), 'REPLACEMENT_INVALID', '替换排除项无效。');
    transact(this.#db, () => {
      const preview = one(this.#db.prepare('SELECT state FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
      requireBounded(asString(preview.state) === 'reviewing', 'REPLACEMENT_STATE_CHANGED', '替换预览状态已变化。');
      const exclude = this.#db.prepare('UPDATE manuscript_replacement_matches SET included = 0 WHERE preview_id = ? AND match_id = ? AND included = 1');
      for (const id of excludedMatchIds) requireBounded(exclude.run(previewId, id).changes === 1, 'REPLACEMENT_INVALID', '替换排除项不属于当前预览。');
      const included = asNumber(one(this.#db.prepare('SELECT count(*) total FROM manuscript_replacement_matches WHERE preview_id = ? AND included = 1').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换匹配缺失。').total);
      requireBounded(included > 0, 'REPLACEMENT_INVALID', '至少保留一项替换。');
      this.#requireNonOverlappingReplacement(previewId);
      this.#db.prepare("UPDATE manuscript_replacement_previews SET state = 'frozen', included_matches = ? WHERE preview_id = ? AND state = 'reviewing'").run(included, previewId);
    });
    return this.#replacementProjection(previewId);
  }

  advanceReplacementValidation(previewId: string): { done: boolean; completed: number; total: number } {
    const preview = one(this.#db.prepare('SELECT * FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
    requireBounded(asString(preview.state) === 'frozen', 'REPLACEMENT_STATE_CHANGED', '替换预览状态已变化。');
    const binding = this.#binding(asString(preview.manuscript_id), asString(preview.branch_id));
    requireBounded(binding.workingDigest === asString(preview.working_digest), 'REPLACEMENT_STALE', '稿件已变化，替换未提交，请刷新预览。');
    this.#requireNonOverlappingReplacement(previewId);
    const after = asNumber(preview.validated_ordinal);
    const rows = this.#db.prepare(
      `SELECT rm.ordinal, rm.block_id, rm.from_grapheme, rm.to_grapheme, rm.range_digest,
              wb.text, wb.digest
       FROM manuscript_replacement_matches rm
       JOIN working_blocks wb ON wb.branch_id = ? AND wb.block_id = rm.block_id
       WHERE rm.preview_id = ? AND rm.included = 1 AND rm.ordinal > ? ORDER BY rm.ordinal LIMIT ?`,
    ).all(binding.branchId, previewId, after, SEARCH_BATCH) as SqlRow[];
    let validated = after;
    const query = graphemes(asString(preview.query));
    for (const row of rows) {
      const text = graphemes(asString(row.text));
      const from = asNumber(row.from_grapheme);
      const to = asNumber(row.to_grapheme);
      const digest = sha256(canonicalJson({ blockDigest: asString(row.digest), from, to, query: asString(preview.query) }));
      requireBounded(digest === asString(row.range_digest) && to - from === query.length && query.every((part, index) => text[from + index] === part), 'REPLACEMENT_STALE', '匹配范围已变化，替换未提交，请刷新预览。');
      validated = asNumber(row.ordinal);
    }
    this.#db.prepare('UPDATE manuscript_replacement_previews SET validated_ordinal = ? WHERE preview_id = ? AND state = ?').run(validated, previewId, 'frozen');
    const remaining = asNumber(one(this.#db.prepare('SELECT count(*) total FROM manuscript_replacement_matches WHERE preview_id = ? AND included = 1 AND ordinal > ?').all(previewId, validated) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换匹配缺失。').total);
    return { done: remaining === 0, completed: asNumber(preview.included_matches) - remaining, total: asNumber(preview.included_matches) };
  }

  commitReplacement(previewId: string): ReplacementCommitProjection {
    return transact(this.#db, () => {
      const preview = one(this.#db.prepare('SELECT * FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
      requireBounded(asString(preview.state) === 'frozen' && asNumber(preview.validated_ordinal) > 0, 'REPLACEMENT_NOT_READY', '替换尚未完成复核。');
      const unvalidated = asNumber(one(this.#db.prepare(
        'SELECT count(*) total FROM manuscript_replacement_matches WHERE preview_id = ? AND included = 1 AND ordinal > ?',
      ).all(previewId, asNumber(preview.validated_ordinal)) as SqlRow[], 'REPLACEMENT_NOT_READY', '替换匹配缺失。').total);
      requireBounded(unvalidated === 0, 'REPLACEMENT_NOT_READY', '替换尚未完成全部精确范围复核。');
      const binding = this.#binding(asString(preview.manuscript_id), asString(preview.branch_id));
      requireBounded(binding.workingDigest === asString(preview.working_digest), 'REPLACEMENT_STALE', '稿件已变化，替换未提交，请刷新预览。');
      this.#requireNonOverlappingReplacement(previewId);
      const groupId = randomUUID();
      const ordinal = binding.historySequence + 1;
      const now = new Date().toISOString();
      const sequence = binding.journalSequence + 1;
      const workingDigest = sha256(canonicalJson({ previous: binding.workingDigest, sequence, groupId, previewId, count: asNumber(preview.included_matches) }));
      this.#db.prepare("UPDATE manuscript_command_groups SET status = 'superseded' WHERE branch_id = ? AND status = 'undone'").run(binding.branchId);
      this.#db.prepare(
        `INSERT INTO manuscript_command_groups(
           command_group_id, branch_id, ordinal, kind, status, source_group_id,
           before_working_digest, after_working_digest, created_at
         ) VALUES (?, ?, ?, 'replacement', 'applied', NULL, ?, ?, ?)`,
      ).run(groupId, binding.branchId, ordinal, binding.workingDigest, workingDigest, now);
      const insertEdit = this.#db.prepare(
        `INSERT INTO manuscript_command_edits(
           command_group_id, position, block_id, before_text, before_digest, after_text, after_digest
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      let blockCursor = 0;
      let editPosition = 0;
      let firstBlockId: string | undefined;
      let firstDigest: string | undefined;
      while (true) {
        const page = this.#db.prepare(
          `SELECT DISTINCT rm.block_id, wb.position, wb.kind, wb.level, wb.text, wb.digest
           FROM manuscript_replacement_matches rm
           JOIN working_blocks wb ON wb.branch_id = ? AND wb.block_id = rm.block_id
           WHERE rm.preview_id = ? AND rm.included = 1 AND wb.position > ?
           ORDER BY wb.position LIMIT ?`,
        ).all(binding.branchId, previewId, blockCursor, HISTORY_BATCH) as SqlRow[];
        if (page.length === 0) break;
        for (const row of page) {
          blockCursor = asNumber(row.position);
          editPosition += 1;
          const blockId = asString(row.block_id);
          const beforeText = asString(row.text);
          const text = graphemes(beforeText);
          const matches = this.#db.prepare(
            `SELECT from_grapheme, to_grapheme FROM manuscript_replacement_matches
             WHERE preview_id = ? AND included = 1 AND block_id = ? ORDER BY from_grapheme DESC`,
          ).all(previewId, blockId) as SqlRow[];
          const replacement = graphemes(asString(preview.replacement));
          for (const match of matches) text.splice(asNumber(match.from_grapheme), asNumber(match.to_grapheme) - asNumber(match.from_grapheme), ...replacement);
          const afterText = text.join('');
          requireBounded(afterText.length <= MAX_BLOCK_CODE_UNITS && text.length <= MAX_BLOCK_GRAPHEMES, 'REPLACEMENT_TOO_LARGE', '替换后内容块超出安全范围。');
          const kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
          const level = row.level === null ? null : asNumber(row.level);
          const afterDigest = blockDigest(kind, level, afterText);
          insertEdit.run(groupId, editPosition, blockId, beforeText, asString(row.digest), afterText, afterDigest);
          const update = this.#db.prepare('UPDATE working_blocks SET text = ?, digest = ? WHERE branch_id = ? AND block_id = ? AND digest = ?').run(afterText, afterDigest, binding.branchId, blockId, asString(row.digest));
          requireBounded(update.changes === 1, 'REPLACEMENT_STALE', '匹配范围在提交时已变化。');
          firstBlockId ??= blockId;
          firstDigest ??= afterDigest;
        }
        if (page.length < HISTORY_BATCH) break;
      }
      requireBounded(firstBlockId && firstDigest, 'REPLACEMENT_NOT_READY', '替换匹配缺失。');
      rebuildBranchDerived(this.#db, binding.branchId);
      this.#db.prepare(
        `INSERT INTO edit_journal_entries(
           journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
           sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
           resulting_working_digest, durable_at, command_group_id, command_kind
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 'replacement')`,
      ).run(randomUUID(), randomUUID(), sha256(canonicalJson({ previewId })), binding.manuscriptId, binding.branchId,
        binding.revisionId, sequence, firstBlockId, asString(preview.replacement), firstDigest, workingDigest, now, groupId);
      this.#db.prepare(
        `UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?, history_sequence = ?
         WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?`,
      ).run(sequence, workingDigest, ordinal, binding.branchId, binding.journalSequence, binding.workingDigest);
      this.#db.prepare("UPDATE manuscript_replacement_previews SET state = 'committed', committed_at = ? WHERE preview_id = ? AND state = 'frozen'").run(now, previewId);
      return {
        previewId,
        branchId: binding.branchId,
        revisionId: binding.revisionId,
        journalSequence: sequence,
        workingDigest,
        committedCount: asNumber(preview.included_matches),
        completionLabel: `已原子替换 ${asNumber(preview.included_matches)} 处并写入修订日志`,
      };
    });
  }

  cancelReplacement(previewId: string): void {
    this.#db.prepare("UPDATE manuscript_replacement_previews SET state = 'cancelled' WHERE preview_id = ? AND state IN ('reviewing', 'frozen')").run(previewId);
  }

  saveMilestone(manuscriptId: string, branchId: string, labelInput: string, purposeInput: string, noteInput: string): MilestoneProjection {
    const label = validateShortText(labelInput, 80, 'MILESTONE_INVALID', '里程碑标签必须为 1–80 个字符。');
    const purpose = validateShortText(purposeInput, 120, 'MILESTONE_INVALID', '里程碑用途必须为 1–120 个字符。');
    const note = validateShortText(noteInput, 500, 'MILESTONE_INVALID', '里程碑备注过长。', true) || null;
    return transact(this.#db, () => {
      let binding = this.#binding(manuscriptId, branchId);
      let revisionId = binding.revisionId;
      let revisionLabel = binding.revisionLabel;
      const now = new Date().toISOString();
      const state = one(this.#db.prepare('SELECT last_checkpoint_sequence FROM branch_working_state WHERE branch_id = ?').all(branchId) as SqlRow[], 'MILESTONE_INVALID', '稿件工作状态缺失。');
      if (binding.journalSequence > asNumber(state.last_checkpoint_sequence)) {
        const previous = one(this.#db.prepare('SELECT source_version_id, ordinal FROM manuscript_revisions WHERE revision_id = ?').all(binding.revisionId) as SqlRow[], 'MILESTONE_INVALID', '当前修订版缺失。');
        const ordinal = asNumber(previous.ordinal) + 1;
        revisionId = randomUUID();
        revisionLabel = `r${ordinal}`;
        this.#db.prepare(
          `INSERT INTO manuscript_revisions(
             revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
             source_version_id, revision_digest, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(revisionId, manuscriptId, branchId, ordinal, revisionLabel, binding.revisionId, asString(previous.source_version_id), binding.workingDigest, now);
        this.#db.prepare(
          `INSERT INTO manuscript_block_versions(
             revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           ) SELECT ?, block_id, position, kind, level, text, digest, start_offset, grapheme_length
             FROM working_blocks WHERE branch_id = ? ORDER BY position`,
        ).run(revisionId, branchId);
        this.#db.prepare(
          `UPDATE branch_working_state SET base_revision_id = ?, last_checkpoint_sequence = ?
           WHERE branch_id = ? AND base_revision_id = ? AND journal_sequence = ?`,
        ).run(revisionId, binding.journalSequence, branchId, binding.revisionId, binding.journalSequence);
        this.#db.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(revisionId, branchId);
        binding = this.#binding(manuscriptId, branchId);
      }
      const milestoneId = randomUUID();
      const signoffRecordId = randomUUID();
      const workflow = one(this.#db.prepare(
        `SELECT workflow_instance_id, profile_id, profile_version, current_phase, state
         FROM workflow_instances WHERE manuscript_id = ?`,
      ).all(manuscriptId) as SqlRow[], 'MILESTONE_INVALID', '稿件工作流程证据缺失。');
      const workflowEvidenceDigest = sha256(canonicalJson({
        workflowInstanceId: asString(workflow.workflow_instance_id),
        profileId: asString(workflow.profile_id),
        profileVersion: asString(workflow.profile_version),
        phase: asString(workflow.current_phase),
        state: asString(workflow.state),
        revisionId,
        revisionDigest: binding.workingDigest,
        journalSequence: binding.journalSequence,
      }));
      this.#db.prepare(
        `INSERT INTO milestone_versions(
           milestone_id, manuscript_id, branch_id, revision_id, label, purpose, note, actor, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, '本机编辑', ?)`,
      ).run(milestoneId, manuscriptId, branchId, revisionId, label, purpose, note, now);
      this.#db.prepare(
        `INSERT INTO milestone_signoff_records(
           signoff_record_id, milestone_id, manuscript_id, branch_id, revision_id,
           workflow_instance_id, workflow_evidence_digest, actor, signed_at, label, stated_next_use
         ) VALUES (?, ?, ?, ?, ?, ?, ?, '本机编辑', ?, ?, ?)`,
      ).run(signoffRecordId, milestoneId, manuscriptId, branchId, revisionId,
        asString(workflow.workflow_instance_id), workflowEvidenceDigest, now, label, purpose);
      return {
        milestoneId, manuscriptId, branchId, revisionId, revisionLabel, label, purpose, note, createdAt: now,
        journalSequence: binding.journalSequence, workingDigest: binding.workingDigest,
        signoffRecordId, workflowEvidenceDigest, actor: '本机编辑', signedAt: now, statedNextUse: purpose,
        completionLabel: `已保存里程碑版本「${label}」 · ${revisionLabel}`,
      };
    });
  }

  undo(manuscriptId: string, branchId: string, expectedWorkingDigest: string): DurableHistoryProjection {
    return this.#applyHistory('undo', manuscriptId, branchId, expectedWorkingDigest);
  }

  redo(manuscriptId: string, branchId: string, expectedWorkingDigest: string): DurableHistoryProjection {
    return this.#applyHistory('redo', manuscriptId, branchId, expectedWorkingDigest);
  }

  #applyHistory(action: 'undo' | 'redo', manuscriptId: string, branchId: string, expectedWorkingDigest: string): DurableHistoryProjection {
    requireBounded(DIGEST_PATTERN.test(expectedWorkingDigest), 'HISTORY_INVALID', '历史状态绑定无效。');
    return transact(this.#db, () => {
      const binding = this.#binding(manuscriptId, branchId);
      requireBounded(binding.workingDigest === expectedWorkingDigest, 'HISTORY_STALE', '稿件已变化，请刷新历史状态。');
      const group = one(this.#db.prepare(
        action === 'undo'
          ? "SELECT * FROM manuscript_command_groups WHERE branch_id = ? AND status = 'applied' ORDER BY ordinal DESC LIMIT 1"
          : "SELECT * FROM manuscript_command_groups WHERE branch_id = ? AND status = 'undone' ORDER BY ordinal ASC LIMIT 1",
      ).all(branchId) as SqlRow[], action === 'undo' ? 'NOTHING_TO_UNDO' : 'NOTHING_TO_REDO', action === 'undo' ? '没有可撤销的编辑。' : '没有可重做的编辑。');
      const groupId = asString(group.command_group_id);
      let cursor = 0;
      while (true) {
        const rows = this.#db.prepare(
          `SELECT position, block_id, before_text, before_digest, after_text, after_digest
           FROM manuscript_command_edits WHERE command_group_id = ? AND position > ? ORDER BY position LIMIT ?`,
        ).all(groupId, cursor, HISTORY_BATCH) as SqlRow[];
        if (rows.length === 0) break;
        for (const row of rows) {
          cursor = asNumber(row.position);
          const expectedDigest = action === 'undo' ? asString(row.after_digest) : asString(row.before_digest);
          const targetText = action === 'undo' ? asString(row.before_text) : asString(row.after_text);
          const targetDigest = action === 'undo' ? asString(row.before_digest) : asString(row.after_digest);
          const update = this.#db.prepare('UPDATE working_blocks SET text = ?, digest = ? WHERE branch_id = ? AND block_id = ? AND digest = ?').run(targetText, targetDigest, branchId, asString(row.block_id), expectedDigest);
          requireBounded(update.changes === 1, 'HISTORY_STALE', '稿件历史无法在当前状态精确重放。');
        }
      }
      rebuildBranchDerived(this.#db, branchId);
      const sequence = binding.journalSequence + 1;
      const nextDigest = sha256(canonicalJson({ previous: binding.workingDigest, sequence, action, groupId }));
      const now = new Date().toISOString();
      this.#db.prepare('UPDATE manuscript_command_groups SET status = ? WHERE command_group_id = ? AND status = ?').run(action === 'undo' ? 'undone' : 'applied', groupId, action === 'undo' ? 'applied' : 'undone');
      const representative = one(this.#db.prepare('SELECT block_id, before_digest, after_digest FROM manuscript_command_edits WHERE command_group_id = ? ORDER BY position LIMIT 1').all(groupId) as SqlRow[], 'HISTORY_CORRUPT', '历史命令内容缺失。');
      this.#db.prepare(
        `INSERT INTO edit_journal_entries(
           journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
           sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
           resulting_working_digest, durable_at, command_group_id, command_kind
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), randomUUID(), sha256(canonicalJson({ action, groupId, sequence })), manuscriptId, branchId,
        binding.revisionId, sequence, asString(representative.block_id), action === 'undo' ? asString(representative.before_digest) : asString(representative.after_digest),
        nextDigest, now, groupId, action);
      this.#db.prepare(
        'UPDATE branch_working_state SET journal_sequence = ?, working_digest = ? WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?',
      ).run(sequence, nextDigest, branchId, binding.journalSequence, binding.workingDigest);
      const refreshed = this.#binding(manuscriptId, branchId);
      return {
        action, branchId, revisionId: refreshed.revisionId, revisionLabel: refreshed.revisionLabel,
        journalSequence: sequence, workingDigest: nextDigest, commandGroupId: groupId,
        completionLabel: action === 'undo' ? '已撤销并写入修订日志' : '已重做并写入修订日志',
        canUndo: this.#hasHistory(branchId, 'applied'), canRedo: this.#hasHistory(branchId, 'undone'),
      };
    });
  }

  #binding(manuscriptId: string, branchId: string): BranchBinding {
    validateIdentity(manuscriptId, branchId);
    const row = one(this.#db.prepare(
      `SELECT m.book_id, bws.manuscript_id, bws.branch_id, bws.base_revision_id, mr.revision_label,
              bws.journal_sequence, bws.working_digest, bws.total_graphemes, bws.history_sequence
       FROM branch_working_state bws
       JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       WHERE bws.manuscript_id = ? AND bws.branch_id = ?`,
    ).all(manuscriptId, branchId) as SqlRow[], 'MANUSCRIPT_NOT_FOUND', '稿件工作状态不存在。');
    return {
      bookId: asString(row.book_id), manuscriptId, branchId, revisionId: asString(row.base_revision_id),
      revisionLabel: asString(row.revision_label), journalSequence: asNumber(row.journal_sequence),
      workingDigest: asString(row.working_digest), totalCharacters: asNumber(row.total_graphemes),
      historySequence: asNumber(row.history_sequence),
    };
  }

  #refreshBlockIndexes(branchId: string, blockId: string, position: number, kind: ManuscriptBlockProjection['kind'], level: number | null, text: string, digest: string): void {
    this.#db.prepare('DELETE FROM working_block_search WHERE branch_id = ? AND block_id = ?').run(branchId, blockId);
    this.#db.prepare('INSERT INTO working_block_search(branch_id, block_id, text) VALUES (?, ?, ?)').run(branchId, blockId, text);
    if (kind === 'title' || kind === 'heading') {
      const start = asNumber(one(this.#db.prepare('SELECT start_offset FROM working_blocks WHERE branch_id = ? AND block_id = ?').all(branchId, blockId) as SqlRow[], 'EDIT_BLOCK_CHANGED', '内容块索引缺失。').start_offset);
      this.#db.prepare(
        `INSERT INTO manuscript_outline(branch_id, block_id, position, start_offset, kind, level, text, digest)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(branch_id, block_id) DO UPDATE SET position=excluded.position, start_offset=excluded.start_offset,
           kind=excluded.kind, level=excluded.level, text=excluded.text, digest=excluded.digest`,
      ).run(branchId, blockId, position, start, kind, level ?? 1, text, digest);
    }
    this.#db.prepare(
      `UPDATE manuscript_outline SET start_offset = (
         SELECT start_offset FROM working_blocks WHERE working_blocks.branch_id = manuscript_outline.branch_id
           AND working_blocks.block_id = manuscript_outline.block_id
       ) WHERE branch_id = ? AND position > ?`,
    ).run(branchId, position);
  }

  #searchSummary(row: SqlRow): SearchSummaryProjection {
    return {
      searchId: asString(row.search_id), manuscriptId: asString(row.manuscript_id), branchId: asString(row.branch_id),
      revisionId: asString(row.revision_id), workingDigest: asString(row.working_digest), query: asString(row.query),
      scopeLabel: '全稿', totalMatches: asNumber(row.total_matches),
    };
  }

  #searchMatch(row: SqlRow): SearchMatchProjection {
    return {
      matchId: asString(row.match_id), blockId: asString(row.block_id), fromGrapheme: asNumber(row.from_grapheme),
      toGrapheme: asNumber(row.to_grapheme), globalCharacter: asNumber(row.global_character),
      headingLabel: asString(row.heading_label), context: asString(row.context), rangeDigest: asString(row.range_digest),
    };
  }

  #replacementProjection(previewId: string): ReplacementPreviewProjection {
    const row = one(this.#db.prepare('SELECT * FROM manuscript_replacement_previews WHERE preview_id = ?').all(previewId) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换预览不存在。');
    const contexts = this.#db.prepare(
      `SELECT sr.match_id, sr.block_id, sr.from_grapheme, sr.to_grapheme, sr.global_character,
               sr.heading_label, sr.context, sr.range_digest
       FROM manuscript_replacement_matches rm
       JOIN manuscript_search_results sr ON sr.search_id = ? AND sr.match_id = rm.match_id
       WHERE rm.preview_id = ? AND rm.included = 1 ORDER BY rm.ordinal LIMIT 6`,
    ).all(asString(row.search_id), previewId) as SqlRow[];
    const revision = one(this.#db.prepare('SELECT revision_label FROM manuscript_revisions WHERE revision_id = ?').all(asString(row.revision_id)) as SqlRow[], 'REPLACEMENT_NOT_FOUND', '替换绑定的修订版不存在。');
    const state = asString(row.state);
    requireBounded(state === 'reviewing' || state === 'frozen', 'REPLACEMENT_STATE_CHANGED', '替换预览状态已变化。');
    return {
      previewId, searchId: asString(row.search_id), manuscriptId: asString(row.manuscript_id), branchId: asString(row.branch_id),
      revisionId: asString(row.revision_id), workingDigest: asString(row.working_digest), query: asString(row.query),
      replacement: asString(row.replacement), scopeLabel: '全稿', matchingRule: REPLACEMENT_MATCHING_RULE,
      inclusionRule: REPLACEMENT_INCLUSION_RULE, revisionLabel: asString(revision.revision_label),
      totalMatches: asNumber(row.total_matches), includedMatches: asNumber(row.included_matches),
      excludedMatches: asNumber(row.total_matches) - asNumber(row.included_matches), state,
      representativeContexts: contexts.map((context) => this.#searchMatch(context)),
    };
  }

  #requireNonOverlappingReplacement(previewId: string): void {
    const overlap = this.#db.prepare(
      `SELECT 1 overlap_found
       FROM manuscript_replacement_matches earlier
       JOIN manuscript_replacement_matches later
         ON later.preview_id = earlier.preview_id
        AND later.block_id = earlier.block_id
        AND later.ordinal > earlier.ordinal
        AND later.from_grapheme < earlier.to_grapheme
        AND earlier.from_grapheme < later.to_grapheme
       WHERE earlier.preview_id = ? AND earlier.included = 1 AND later.included = 1
       LIMIT 1`,
    ).get(previewId);
    requireBounded(overlap === undefined, 'REPLACEMENT_INVALID', '冻结匹配包含重叠范围，请刷新预览。');
  }

  #pruneTransientSearches(): void {
    this.#db.prepare(
      `DELETE FROM manuscript_search_sessions
       WHERE state IN ('completed', 'cancelled', 'failed')
         AND NOT EXISTS (
           SELECT 1 FROM manuscript_replacement_previews rp
           WHERE rp.search_id = manuscript_search_sessions.search_id
         )
         AND search_id NOT IN (
           SELECT search_id FROM manuscript_search_sessions retained
           WHERE retained.state IN ('completed', 'cancelled', 'failed')
             AND NOT EXISTS (
               SELECT 1 FROM manuscript_replacement_previews rp
               WHERE rp.search_id = retained.search_id
             )
           ORDER BY COALESCE(completed_at, created_at) DESC, search_id DESC
           LIMIT ?
         )`,
    ).run(MAX_RETAINED_TRANSIENT_SEARCHES);
  }

  #hasHistory(branchId: string, state: 'applied' | 'undone'): boolean {
    return this.#db.prepare('SELECT 1 ok FROM manuscript_command_groups WHERE branch_id = ? AND status = ? LIMIT 1').get(branchId, state) !== undefined;
  }

  #journalAck(row: SqlRow, input: JournalEditInput): JournalAcknowledgement {
    const acknowledgement = {
      clientEditId: asString(row.client_edit_id), branchId: asString(row.branch_id), baseRevisionId: asString(row.base_revision_id),
      blockId: asString(row.block_id), sequence: asNumber(row.sequence), resultingBlockDigest: asString(row.resulting_block_digest),
      resultingWorkingDigest: asString(row.resulting_working_digest), durableAt: asString(row.durable_at), completionLabel: '已写入修订日志',
    } satisfies Omit<JournalAcknowledgement, 'window'>;
    const window = this.getWindow(input.manuscriptId, input.branchId, { kind: 'window-start', blockId: input.windowStartBlockId });
    requireBounded(
      window.journalSequence === acknowledgement.sequence && window.workingDigest === acknowledgement.resultingWorkingDigest,
      'JOURNAL_ACK_FAILED',
      '修订日志已提交但窗口确认已变化。',
    );
    return { ...acknowledgement, window };
  }

  #encodeCursor(kind: string, binding: BranchBinding, value: { position: number }): string {
    const payload = Buffer.from(JSON.stringify({ kind, manuscriptId: binding.manuscriptId, branchId: binding.branchId, revisionId: binding.revisionId, workingDigest: binding.workingDigest, position: value.position }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.#cursorSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  #decodeCursor(cursor: string, kind: string, binding: BranchBinding): { position: number } {
    const [payload, signature, extra] = cursor.split('.');
    requireBounded(payload && signature && extra === undefined, 'CURSOR_INVALID', '稿件位置已失效。');
    const expected = createHmac('sha256', this.#cursorSecret).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    requireBounded(expected.length === supplied.length && timingSafeEqual(expected, supplied), 'CURSOR_INVALID', '稿件位置已失效。');
    let value: unknown;
    try { value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new BoundedStoreError('CURSOR_INVALID', '稿件位置已失效。'); }
    requireBounded(value !== null && typeof value === 'object' && !Array.isArray(value), 'CURSOR_INVALID', '稿件位置已失效。');
    const row = value as Record<string, unknown>;
    requireBounded(row.kind === kind && row.manuscriptId === binding.manuscriptId && row.branchId === binding.branchId && row.revisionId === binding.revisionId && row.workingDigest === binding.workingDigest && typeof row.position === 'number' && Number.isSafeInteger(row.position) && row.position >= 0, 'CURSOR_INVALID', '稿件位置已失效。');
    return { position: Number(row.position) };
  }

  #encodeSimpleCursor(kind: string, position: number): string {
    const payload = Buffer.from(JSON.stringify({ kind, position }), 'utf8').toString('base64url');
    return `${payload}.${createHmac('sha256', this.#cursorSecret).update(payload).digest('base64url')}`;
  }

  #decodeSimpleCursor(cursor: string, kind: string): number {
    const [payload, signature, extra] = cursor.split('.');
    requireBounded(payload && signature && extra === undefined, 'CURSOR_INVALID', '结果位置已失效。');
    const expected = createHmac('sha256', this.#cursorSecret).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    requireBounded(expected.length === supplied.length && timingSafeEqual(expected, supplied), 'CURSOR_INVALID', '结果位置已失效。');
    let value: unknown;
    try { value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new BoundedStoreError('CURSOR_INVALID', '结果位置已失效。'); }
    requireBounded(value !== null && typeof value === 'object' && !Array.isArray(value), 'CURSOR_INVALID', '结果位置已失效。');
    const row = value as Record<string, unknown>;
    requireBounded(row.kind === kind && typeof row.position === 'number' && Number.isSafeInteger(row.position) && row.position >= 0, 'CURSOR_INVALID', '结果位置已失效。');
    return Number(row.position);
  }
}
