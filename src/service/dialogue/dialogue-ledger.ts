import type { GlobalMemoryPin } from '../../shared/protocol.js';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalJson, sha256Hex } from '../analysis/canonical.js';
import type { DialogueMessageInput } from './contract.js';

/**
 * The AI7 side of Interactive Editorial Dialogue (Issue #52, plan slice S17a; UI ADR 0014, ADR 0011): a dialogue Task bound
 * to one exact Book, manuscript branch and selected range, its attempts, and for each attempt the Execution Binding and the
 * Harness Execution Span that join it to the Harness Session Ledger — and nothing else. The question, the selected words as
 * they were sent and every answer stay in that ledger, the persisted DSH Session log; these relations hold identities,
 * digests, sequence numbers and states, never a copy of the transcript, and there is no third ledger.
 *
 * Schema revision 60 owns six append-only relations:
 * - `dialogue_tasks`: the Task — Book, manuscript, branch, the range and the block digest it stood in, the digests of the
 *   selected words and of the question, and its Response Presentation Mode, `interactive-stream` (DIALOG-002);
 * - `dialogue_attempts`: each attempt, numbered, as the first ask, a 继续回答 or a 重新回答 of the attempt before (DIALOG-014);
 * - `dialogue_execution_bindings`: the technical Session an attempt runs in and what it was bound to;
 * - `dialogue_harness_spans`: where in that Session the attempt's turn starts, recorded before anything is sent;
 * - `dialogue_attempt_outcomes`: how the attempt settled — completed, stopped, interrupted or failed — and where its turn
 *   ends in the Session;
 * - `dialogue_conversions`: the 修改建议 an editor made of a completed answer with 转为修改建议 (DIALOG-016).
 *
 * Revision 71 (Issue #52, S17c) widens `dialogue_execution_bindings` for the live route: an attempt bound to the Go route
 * under developer-live names no fixture and instead the Provider Processing version and allow rule that admitted it; one
 * bound to the local deterministic fixture names the fixture and neither of them, exactly as revision 60 recorded it.
 * Revision 72 (Issue #811) widens it again for ordinary production: an attempt there is bound to the editor's configured
 * route — Go or DeepSeek 开放平台（官方） — and names its policy version and rule exactly as a developer-live one does;
 * developer-live attempts stay on the Go route only.
 */
const LEGACY_DIALOGUE_SCHEMA_SQL = {
  dialogue_tasks: `CREATE TABLE dialogue_tasks (
  dialogue_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
  block_id TEXT NOT NULL CHECK(length(block_id) = 28),
  from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
  to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
  block_digest TEXT NOT NULL CHECK(length(block_digest) = 64),
  selection_sha256 TEXT NOT NULL CHECK(length(selection_sha256) = 64),
  question_sha256 TEXT NOT NULL CHECK(length(question_sha256) = 64),
  presentation_mode TEXT NOT NULL CHECK(presentation_mode = 'interactive-stream'),
  asked_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  dialogue_attempts: `CREATE TABLE dialogue_attempts (
  attempt_id TEXT PRIMARY KEY,
  dialogue_id TEXT NOT NULL REFERENCES dialogue_tasks(dialogue_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('ask', 'continue', 'regenerate')),
  prior_attempt_id TEXT REFERENCES dialogue_attempts(attempt_id),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (kind = 'ask')),
  CHECK((kind = 'ask') = (prior_attempt_id IS NULL)),
  UNIQUE(dialogue_id, ordinal)
) STRICT`,
  dialogue_execution_bindings: `CREATE TABLE dialogue_execution_bindings (
  attempt_id TEXT PRIMARY KEY REFERENCES dialogue_attempts(attempt_id),
  harness_session_id TEXT NOT NULL UNIQUE,
  route TEXT NOT NULL CHECK(route IN ('ai7-local-deterministic', 'opencode-go', 'deepseek-open-platform')),
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 128),
  operational_scope TEXT NOT NULL CHECK(operational_scope IN ('development-ci', 'developer-live', 'ordinary-production')),
  behavior_composition_sha256 TEXT NOT NULL CHECK(length(behavior_composition_sha256) = 64),
  prompt_contract_sha256 TEXT NOT NULL CHECK(length(prompt_contract_sha256) = 64),
  fixture_sha256 TEXT CHECK(fixture_sha256 IS NULL OR length(fixture_sha256) = 64),
  bound_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  provider_processing_version TEXT CHECK(provider_processing_version IS NULL OR length(provider_processing_version) BETWEEN 2 AND 16),
  policy_rule_id TEXT CHECK(policy_rule_id IS NULL OR length(policy_rule_id) BETWEEN 1 AND 128),
  CHECK((route = 'ai7-local-deterministic') = (operational_scope = 'development-ci')),
  CHECK((route != 'ai7-local-deterministic') = (fixture_sha256 IS NULL)),
  CHECK((route != 'ai7-local-deterministic') = (provider_processing_version IS NOT NULL)),
  CHECK((provider_processing_version IS NULL) = (policy_rule_id IS NULL)),
  CHECK(NOT (operational_scope = 'developer-live' AND route != 'opencode-go'))
) STRICT`,
  dialogue_harness_spans: `CREATE TABLE dialogue_harness_spans (
  attempt_id TEXT PRIMARY KEY REFERENCES dialogue_execution_bindings(attempt_id),
  harness_session_id TEXT NOT NULL REFERENCES dialogue_execution_bindings(harness_session_id),
  start_seq INTEGER NOT NULL CHECK(start_seq >= 0),
  opened_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  dialogue_attempt_outcomes: `CREATE TABLE dialogue_attempt_outcomes (
  attempt_id TEXT PRIMARY KEY REFERENCES dialogue_attempts(attempt_id),
  outcome TEXT NOT NULL CHECK(outcome IN ('completed', 'stopped', 'interrupted', 'failed')),
  end_seq INTEGER CHECK(end_seq IS NULL OR end_seq >= 0),
  cause_code TEXT CHECK(cause_code IS NULL OR length(cause_code) BETWEEN 1 AND 64),
  settled_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((outcome IN ('completed', 'stopped')) = (cause_code IS NULL))
) STRICT`,
  dialogue_conversions: `CREATE TABLE dialogue_conversions (
  conversion_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES dialogue_attempts(attempt_id),
  mark_id TEXT NOT NULL UNIQUE REFERENCES editorial_marks(mark_id),
  converted_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

export const DIALOGUE_TASKS_REVISION_86_SQL = LEGACY_DIALOGUE_SCHEMA_SQL.dialogue_tasks;
/** Revision 87 admits an all-null manuscript binding for an explicitly scoped Global Agent turn. */
export const DIALOGUE_SCHEMA_SQL = {
  ...LEGACY_DIALOGUE_SCHEMA_SQL,
  dialogue_tasks: DIALOGUE_TASKS_REVISION_86_SQL.replace(
    /((?:book_id|manuscript_id|branch_id|revision_id|journal_sequence|block_id|from_grapheme|to_grapheme|block_digest) (?:TEXT|INTEGER)) NOT NULL/gu, '$1',
  ).replace(') STRICT', `, CHECK(
    (book_id IS NULL AND manuscript_id IS NULL AND branch_id IS NULL AND revision_id IS NULL AND journal_sequence IS NULL AND block_id IS NULL AND from_grapheme IS NULL AND to_grapheme IS NULL AND block_digest IS NULL)
    OR (book_id IS NOT NULL AND manuscript_id IS NOT NULL AND branch_id IS NOT NULL AND revision_id IS NOT NULL AND journal_sequence IS NOT NULL AND block_id IS NOT NULL AND from_grapheme IS NOT NULL AND to_grapheme IS NOT NULL AND block_digest IS NOT NULL)
  )) STRICT`),
} as const;

export const DIALOGUE_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(DIALOGUE_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'DIALOGUE_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'DIALOGUE_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const DIALOGUE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  dialogue_tasks: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  dialogue_attempts: [
    'dialogue_id>dialogue_tasks.dialogue_id:NO ACTION/NO ACTION/NONE',
    'prior_attempt_id>dialogue_attempts.attempt_id:NO ACTION/NO ACTION/NONE',
  ],
  dialogue_execution_bindings: ['attempt_id>dialogue_attempts.attempt_id:NO ACTION/NO ACTION/NONE'],
  dialogue_harness_spans: [
    'attempt_id>dialogue_execution_bindings.attempt_id:NO ACTION/NO ACTION/NONE',
    'harness_session_id>dialogue_execution_bindings.harness_session_id:NO ACTION/NO ACTION/NONE',
  ],
  dialogue_attempt_outcomes: ['attempt_id>dialogue_attempts.attempt_id:NO ACTION/NO ACTION/NONE'],
  dialogue_conversions: [
    'attempt_id>dialogue_attempts.attempt_id:NO ACTION/NO ACTION/NONE',
    'mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
  ],
};

/** `dialogue_execution_bindings` as revision 60 created it: the local deterministic route only. Kept to recognise such a store. */
export const DIALOGUE_EXECUTION_BINDINGS_REVISION_60_SQL = `CREATE TABLE dialogue_execution_bindings (
  attempt_id TEXT PRIMARY KEY REFERENCES dialogue_attempts(attempt_id),
  harness_session_id TEXT NOT NULL UNIQUE,
  route TEXT NOT NULL CHECK(route = 'ai7-local-deterministic'),
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 128),
  operational_scope TEXT NOT NULL CHECK(operational_scope = 'development-ci'),
  behavior_composition_sha256 TEXT NOT NULL CHECK(length(behavior_composition_sha256) = 64),
  prompt_contract_sha256 TEXT NOT NULL CHECK(length(prompt_contract_sha256) = 64),
  fixture_sha256 TEXT NOT NULL CHECK(length(fixture_sha256) = 64),
  bound_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`;

/** `dialogue_execution_bindings` as revision 71 widened it: the developer-live Go route beside the local one. */
export const DIALOGUE_EXECUTION_BINDINGS_REVISION_71_SQL = `CREATE TABLE dialogue_execution_bindings (
  attempt_id TEXT PRIMARY KEY REFERENCES dialogue_attempts(attempt_id),
  harness_session_id TEXT NOT NULL UNIQUE,
  route TEXT NOT NULL CHECK(route IN ('ai7-local-deterministic', 'opencode-go')),
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 128),
  operational_scope TEXT NOT NULL CHECK(operational_scope IN ('development-ci', 'developer-live')),
  behavior_composition_sha256 TEXT NOT NULL CHECK(length(behavior_composition_sha256) = 64),
  prompt_contract_sha256 TEXT NOT NULL CHECK(length(prompt_contract_sha256) = 64),
  fixture_sha256 TEXT CHECK(fixture_sha256 IS NULL OR length(fixture_sha256) = 64),
  bound_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  provider_processing_version TEXT CHECK(provider_processing_version IS NULL OR length(provider_processing_version) BETWEEN 2 AND 16),
  policy_rule_id TEXT CHECK(policy_rule_id IS NULL OR length(policy_rule_id) BETWEEN 1 AND 128),
  CHECK((route = 'opencode-go') = (operational_scope = 'developer-live')),
  CHECK((route = 'opencode-go') = (fixture_sha256 IS NULL)),
  CHECK((route = 'opencode-go') = (provider_processing_version IS NOT NULL)),
  CHECK((provider_processing_version IS NULL) = (policy_rule_id IS NULL))
) STRICT`;

/** A relation's text with its whitespace folded, the way the other ledgers compare exact texts. */
function foldedSql(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

/**
 * Which of its three texts `dialogue_execution_bindings` holds: revision 60's, revision 71's that admits the developer-live
 * route, or revision 72's that admits ordinary production's two routes. No other text was ever created, so any other is refused.
 */
export function dialogueExecutionBindingsShape(db: DatabaseSync): 'revision-60' | 'revision-71' | 'current' {
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'dialogue_execution_bindings'").get() as SqlRow | undefined;
  const sql = row === undefined ? '' : foldedSql(text(row.sql));
  if (sql === foldedSql(DIALOGUE_SCHEMA_SQL.dialogue_execution_bindings)) return 'current';
  if (sql === foldedSql(DIALOGUE_EXECUTION_BINDINGS_REVISION_71_SQL)) return 'revision-71';
  requireDialogue(sql === foldedSql(DIALOGUE_EXECUTION_BINDINGS_REVISION_60_SQL), 'SCHEMA_MIGRATION_FAILED', '对话执行绑定表结构不兼容。');
  return 'revision-60';
}

/**
 * Revision 60 or 71 → 72 for `dialogue_execution_bindings` (Issue #52, S17c; Issue #811): the relation is rebuilt from its
 * current text, every row copied byte for byte, rowid included, in rowid order — from revision 60 the two columns revision 71
 * added stay empty, as a local binding's always are — and its two ledger triggers re-armed from their own texts. It runs in
 * the caller's transaction with foreign keys off, so the spans that name a binding keep their rows while the relation they
 * reference is re-created.
 */
function widenDialogueExecutionBindings(db: DatabaseSync, from: 'revision-60' | 'revision-71'): void {
  requireDialogue(
    db.isTransaction && integer((db.prepare('PRAGMA foreign_keys').get() as SqlRow).foreign_keys) === 0,
    'SCHEMA_MIGRATION_FAILED',
    '对话执行绑定表只能在停用引用校验的事务中重建。',
  );
  const columnsOf = (): string[] => (db.prepare("SELECT name FROM pragma_table_info('dialogue_execution_bindings') ORDER BY cid").all() as SqlRow[])
    .map((row) => text(row.name));
  const rows = (): number => integer((db.prepare('SELECT count(*) total FROM dialogue_execution_bindings').get() as SqlRow).total);
  const columns = columnsOf();
  const before = rows();
  const attached = (db.prepare(
    "SELECT sql FROM sqlite_schema WHERE tbl_name = 'dialogue_execution_bindings' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
  ).all() as SqlRow[]).map((row) => text(row.sql));
  db.exec('CREATE TEMP TABLE migrate_dialogue_execution_bindings AS SELECT rowid AS migrate_rowid, * FROM dialogue_execution_bindings');
  db.exec('DROP TABLE dialogue_execution_bindings');
  db.exec(DIALOGUE_SCHEMA_SQL.dialogue_execution_bindings);
  requireDialogue(columnsOf().join(', ') === (from === 'revision-60' ? [...columns, 'provider_processing_version', 'policy_rule_id'] : columns).join(', '),
    'SCHEMA_MIGRATION_FAILED', '对话执行绑定表迁移前后的列不一致。');
  const list = columns.join(', ');
  db.exec(`INSERT INTO dialogue_execution_bindings(rowid, ${list})
    SELECT migrate_rowid, ${list} FROM temp.migrate_dialogue_execution_bindings ORDER BY migrate_rowid`);
  db.exec('DROP TABLE temp.migrate_dialogue_execution_bindings');
  for (const sql of attached) db.exec(sql);
  requireDialogue(rows() === before, 'SCHEMA_MIGRATION_FAILED', '对话执行绑定表迁移未保留全部记录。');
}

/**
 * Revision 60's relations, created once: a store that predates them gains six empty relations and nothing existing moves.
 * A store that has them at revision 60's or 71's text has `dialogue_execution_bindings` widened for revision 72, in one
 * transaction.
 */
export function initializeDialogueSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'dialogue_tasks'").get() !== undefined;
  const shape = existing ? dialogueExecutionBindingsShape(db) : null;
  const taskSql = existing ? String(db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'dialogue_tasks'").get()!.sql) : null;
  const legacyTasks = taskSql !== null && foldedSql(taskSql) === foldedSql(DIALOGUE_TASKS_REVISION_86_SQL);
  if (shape === 'current' && !legacyTasks) return;
  const foreignKeys = (): number => integer((db.prepare('PRAGMA foreign_keys').get() as SqlRow).foreign_keys);
  const restoreForeignKeys = existing && foreignKeys() === 1;
  if (existing) {
    db.exec('PRAGMA foreign_keys = OFF');
    requireDialogue(foreignKeys() === 0, 'SCHEMA_MIGRATION_FAILED', '无法暂时停用引用校验以迁移数据库。');
  }
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (shape !== null) {
        if (shape !== 'current') widenDialogueExecutionBindings(db, shape);
        if (legacyTasks) {
          db.exec('CREATE TEMP TABLE migrate_global_dialogue_tasks AS SELECT rowid AS migrate_rowid, * FROM dialogue_tasks');
          db.exec('DROP TABLE dialogue_tasks');
          db.exec(DIALOGUE_SCHEMA_SQL.dialogue_tasks);
          db.exec('INSERT INTO dialogue_tasks SELECT dialogue_id, book_id, manuscript_id, branch_id, revision_id, journal_sequence, block_id, from_grapheme, to_grapheme, block_digest, selection_sha256, question_sha256, presentation_mode, asked_at, canonical_json, sha256 FROM temp.migrate_global_dialogue_tasks ORDER BY migrate_rowid');
          db.exec('DROP TABLE temp.migrate_global_dialogue_tasks');
          db.exec(DIALOGUE_TRIGGER_SQL.dialogue_tasks_no_update!);
          db.exec(DIALOGUE_TRIGGER_SQL.dialogue_tasks_no_delete!);
        }
        requireDialogue(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
      } else {
        for (const sql of Object.values(DIALOGUE_SCHEMA_SQL)) db.exec(sql);
        for (const sql of Object.values(DIALOGUE_TRIGGER_SQL)) db.exec(sql);
      }
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Dialogue schema rollback failed.');
      }
      throw error;
    }
  } finally {
    if (restoreForeignKeys) {
      db.exec('PRAGMA foreign_keys = ON');
      requireDialogue(foreignKeys() === 1, 'SCHEMA_MIGRATION_FAILED', '无法恢复引用校验。');
    }
  }
}

export class DialogueError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DialogueError';
  }
}

export function requireDialogue(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DialogueError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;
const INVALID = '对话记录已损坏。';
const TASK_SCHEMA = 'ai7.dialogue-task/1';
const ATTEMPT_SCHEMA = 'ai7.dialogue-attempt/1';
const BINDING_SCHEMA = 'ai7.dialogue-execution-binding/1';
const SPAN_SCHEMA = 'ai7.dialogue-harness-span/1';
const OUTCOME_SCHEMA = 'ai7.dialogue-attempt-outcome/1';
const CONVERSION_SCHEMA = 'ai7.dialogue-conversion/1';
/** The most dialogue Tasks a Book's 任务 panel reads, newest first. */
export const DIALOGUE_TASKS_READ_LIMIT = 50;

export type DialogueAttemptKind = 'ask' | 'continue' | 'regenerate';

/** The mark source a 转为修改建议 names (DIALOG-016), and how much of the answer its basis quotes. */
export const DIALOGUE_MARK_SOURCE_LABEL = '对话回答';
export const DIALOGUE_BASIS_QUOTE_CHARACTERS = 200;
export { MAX_DIALOGUE_PROPOSAL_CHARACTERS } from '../../shared/protocol.js';

/** An attempt about to be sent: the Task, the attempt, and the one message its turn sends. */
export interface DialogueTurnStart {
  readonly dialogueId: string;
  readonly attemptId: string;
  readonly message: DialogueMessageInput;
}
export type DialogueOutcome = 'completed' | 'stopped' | 'interrupted' | 'failed';

export interface StoredGlobalDialogueTask {
  readonly dialogueId: string;
  readonly bookId: null;
  readonly sources: ReadonlyArray<GlobalMemoryPin>;
  readonly operationalScope: import('../../shared/protocol.js').TrustedOperationalScope;
  readonly sourcesSha256: string;
  readonly questionSha256: string;
  readonly askedAt: string;
}

export interface StoredDialogueTask {
  readonly dialogueId: string;
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly revisionId: string;
  readonly journalSequence: number;
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly blockDigest: string;
  readonly selectionSha256: string;
  readonly questionSha256: string;
  readonly askedAt: string;
}

interface DialogueBindingBase {
  readonly harnessSessionId: string;
  readonly model: string;
  readonly behaviorCompositionSha256: string;
  readonly promptContractSha256: string;
  readonly boundAt: string;
}

/** An attempt answered by the J-04 deterministic fixture under development-ci, recorded exactly as revision 60 did. */
export interface StoredLocalDialogueBinding extends DialogueBindingBase {
  readonly route: 'ai7-local-deterministic';
  readonly operationalScope: 'development-ci';
  readonly fixtureSha256: string;
}

/**
 * An attempt sent on a live route (S17c; Issue #811): the Go route under developer-live, or the editor's configured Go or
 * DeepSeek 开放平台（官方） route under ordinary-production, with the policy version and allow rule that admitted it.
 */
export interface StoredLiveDialogueBinding extends DialogueBindingBase {
  readonly route: 'opencode-go' | 'deepseek-open-platform';
  readonly operationalScope: 'developer-live' | 'ordinary-production';
  readonly providerProcessingVersion: string;
  readonly policyRuleId: string;
}

/** Whether a live binding's scope and route are a pair the ledger records: developer-live on Go only. */
function livePairAdmitted(route: string, scope: string): boolean {
  return (scope === 'developer-live' && route === 'opencode-go') ||
    (scope === 'ordinary-production' && (route === 'opencode-go' || route === 'deepseek-open-platform'));
}

export type StoredDialogueBinding = StoredLocalDialogueBinding | StoredLiveDialogueBinding;

export interface StoredDialogueAttempt {
  readonly attemptId: string;
  readonly dialogueId: string;
  readonly ordinal: number;
  readonly kind: DialogueAttemptKind;
  readonly priorAttemptId: string | null;
  readonly createdAt: string;
  readonly binding: StoredDialogueBinding | null;
  readonly span: { readonly harnessSessionId: string; readonly startSeq: number; readonly openedAt: string } | null;
  readonly outcome: { readonly outcome: DialogueOutcome; readonly endSeq: number | null; readonly causeCode: string | null; readonly settledAt: string } | null;
  readonly conversions: ReadonlyArray<{ readonly conversionId: string; readonly markId: string; readonly convertedAt: string }>;
}

function text(value: SQLOutputValue | undefined): string {
  requireDialogue(typeof value === 'string', 'DIALOGUE_RECORD_INVALID', INVALID);
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  requireDialogue(typeof value === 'number' && Number.isSafeInteger(value), 'DIALOGUE_RECORD_INVALID', INVALID);
  return value;
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : text(value);
}

function nullableInteger(value: SQLOutputValue | undefined): number | null {
  return value === null || value === undefined ? null : integer(value);
}

/** The canonical record of a row and its digest: what each row carries and is read back against. */
function sealed(record: Record<string, unknown>): { json: string; sha256: string } {
  const json = canonicalJson(record);
  return { json, sha256: sha256Hex(json) };
}

/**
 * A binding's canonical record. A local binding's is exactly revision 60's, so every binding that revision wrote reads back
 * under its own digest; a live binding's carries the policy version and rule id in place of the fixture.
 */
function bindingRecord(attemptId: string, binding: StoredDialogueBinding): Record<string, unknown> {
  return { schema: BINDING_SCHEMA, attemptId, ...binding };
}

/** A row read back: its record must be exactly the canonical form of what its columns say, under its digest. */
function verified(row: SqlRow, record: Record<string, unknown>): void {
  const json = text(row.canonical_json);
  requireDialogue(sha256Hex(json) === text(row.sha256) && json === canonicalJson(record), 'DIALOGUE_RECORD_INVALID', INVALID);
}

export class DialogueLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** A new dialogue Task and its first attempt, inside the caller's transaction. */
  ask(input: Omit<StoredDialogueTask, 'dialogueId' | 'askedAt'> & { readonly now: Date }): { task: StoredDialogueTask; attemptId: string } {
    requireDialogue(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.manuscriptId) && UUID_PATTERN.test(input.branchId) &&
      UUID_PATTERN.test(input.revisionId) && Number.isSafeInteger(input.journalSequence) && input.journalSequence >= 0 &&
      /^blk_[0-9a-f]{24}$/u.test(input.blockId) && Number.isSafeInteger(input.fromGrapheme) && input.fromGrapheme >= 0 &&
      Number.isSafeInteger(input.toGrapheme) && input.toGrapheme > input.fromGrapheme && DIGEST_PATTERN.test(input.blockDigest) &&
      DIGEST_PATTERN.test(input.selectionSha256) && DIGEST_PATTERN.test(input.questionSha256),
    'DIALOGUE_INVALID', '对话的所选文字或问题无效。');
    const task: StoredDialogueTask = {
      dialogueId: randomUUID(),
      bookId: input.bookId,
      manuscriptId: input.manuscriptId,
      branchId: input.branchId,
      revisionId: input.revisionId,
      journalSequence: input.journalSequence,
      blockId: input.blockId,
      fromGrapheme: input.fromGrapheme,
      toGrapheme: input.toGrapheme,
      blockDigest: input.blockDigest,
      selectionSha256: input.selectionSha256,
      questionSha256: input.questionSha256,
      askedAt: input.now.toISOString(),
    };
    const seal = sealed(this.#taskRecord(task));
    this.#db.prepare(
      `INSERT INTO dialogue_tasks (dialogue_id, book_id, manuscript_id, branch_id, revision_id, journal_sequence, block_id,
         from_grapheme, to_grapheme, block_digest, selection_sha256, question_sha256, presentation_mode, asked_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'interactive-stream', ?, ?, ?)`,
    ).run(task.dialogueId, task.bookId, task.manuscriptId, task.branchId, task.revisionId, task.journalSequence, task.blockId,
      task.fromGrapheme, task.toGrapheme, task.blockDigest, task.selectionSha256, task.questionSha256, task.askedAt, seal.json, seal.sha256);
    const attemptId = this.#insertAttempt(task.dialogueId, 1, 'ask', null, input.now);
    return { task, attemptId };
  }

  askGlobal(scope: import('../../shared/protocol.js').TrustedOperationalScope, sources: ReadonlyArray<GlobalMemoryPin>, questionSha256: string, now: Date): { task: StoredGlobalDialogueTask; attemptId: string } {
    requireDialogue(DIGEST_PATTERN.test(questionSha256) && sources.length <= 12, 'DIALOGUE_INVALID', '全域对话范围无效。');
    const task: StoredGlobalDialogueTask = { dialogueId: randomUUID(), bookId: null, sources, operationalScope: scope,
      sourcesSha256: sha256Hex(canonicalJson(sources)), questionSha256, askedAt: now.toISOString() };
    const seal = sealed({ schema: 'ai7.global-agent-dialogue/1', ...task, presentationMode: 'interactive-stream' });
    this.#db.prepare(`INSERT INTO dialogue_tasks (dialogue_id, selection_sha256, question_sha256, presentation_mode, asked_at, canonical_json, sha256)
      VALUES (?, ?, ?, 'interactive-stream', ?, ?, ?)`).run(task.dialogueId, task.sourcesSha256, questionSha256, task.askedAt, seal.json, seal.sha256);
    return { task, attemptId: this.#insertAttempt(task.dialogueId, 1, 'ask', null, now) };
  }

  globalTask(dialogueId: string): StoredGlobalDialogueTask | null {
    requireDialogue(UUID_PATTERN.test(dialogueId), 'DIALOGUE_INVALID', '对话标识无效。');
    const row = this.#db.prepare('SELECT * FROM dialogue_tasks WHERE dialogue_id = ? AND book_id IS NULL').get(dialogueId) as SqlRow | undefined;
    if (row === undefined) return null;
    const record = JSON.parse(text(row.canonical_json)) as StoredGlobalDialogueTask;
    const task: StoredGlobalDialogueTask = { dialogueId: text(row.dialogue_id), bookId: null, sources: record.sources, operationalScope: record.operationalScope,
      sourcesSha256: text(row.selection_sha256), questionSha256: text(row.question_sha256), askedAt: text(row.asked_at) };
    requireDialogue(['development-ci', 'developer-live', 'ordinary-production'].includes(task.operationalScope) && DIGEST_PATTERN.test(task.questionSha256) && Array.isArray(task.sources) && task.sources.length <= 12 && task.sources.every((pin) => pin !== null && typeof pin === 'object' &&
      Object.keys(pin).sort().join(',') === 'itemId,revisionId' && typeof pin.itemId === 'string' && pin.itemId.length > 0 && pin.itemId.length <= 180 &&
      typeof pin.revisionId === 'string' && pin.revisionId.length > 0 && pin.revisionId.length <= 180) && sha256Hex(canonicalJson(task.sources)) === task.sourcesSha256,
      'DIALOGUE_RECORD_INVALID', INVALID);
    verified(row, { schema: 'ai7.global-agent-dialogue/1', ...task, presentationMode: 'interactive-stream' });
    return task;
  }

  globalTasks(): StoredGlobalDialogueTask[] {
    return this.#db.prepare('SELECT dialogue_id FROM dialogue_tasks WHERE book_id IS NULL ORDER BY asked_at DESC, dialogue_id DESC LIMIT ?')
      .all(DIALOGUE_TASKS_READ_LIMIT).map((row) => this.globalTask(String(row.dialogue_id))!);
  }

  #taskRecord(task: StoredDialogueTask): Record<string, unknown> {
    return { schema: TASK_SCHEMA, ...task, presentationMode: 'interactive-stream' };
  }

  /** One dialogue Task, verified, or `null` when there is none by that identity. */
  task(dialogueId: string): StoredDialogueTask | null {
    requireDialogue(UUID_PATTERN.test(dialogueId), 'DIALOGUE_INVALID', '对话标识无效。');
    const row = this.#db.prepare('SELECT * FROM dialogue_tasks WHERE dialogue_id = ?').get(dialogueId) as SqlRow | undefined;
    return row === undefined || row.book_id === null ? null : this.#task(row);
  }

  #task(row: SqlRow): StoredDialogueTask {
    requireDialogue(row.presentation_mode === 'interactive-stream', 'DIALOGUE_RECORD_INVALID', INVALID);
    const task: StoredDialogueTask = {
      dialogueId: text(row.dialogue_id),
      bookId: text(row.book_id),
      manuscriptId: text(row.manuscript_id),
      branchId: text(row.branch_id),
      revisionId: text(row.revision_id),
      journalSequence: integer(row.journal_sequence),
      blockId: text(row.block_id),
      fromGrapheme: integer(row.from_grapheme),
      toGrapheme: integer(row.to_grapheme),
      blockDigest: text(row.block_digest),
      selectionSha256: text(row.selection_sha256),
      questionSha256: text(row.question_sha256),
      askedAt: text(row.asked_at),
    };
    verified(row, this.#taskRecord(task));
    return task;
  }

  /** The Book's dialogue Tasks, newest first, at most `limit`. */
  tasksOf(bookId: string, limit = DIALOGUE_TASKS_READ_LIMIT): StoredDialogueTask[] {
    return (this.#db.prepare('SELECT * FROM dialogue_tasks WHERE book_id = ? ORDER BY asked_at DESC, dialogue_id DESC LIMIT ?')
      .all(bookId, limit) as SqlRow[]).map((row) => this.#task(row));
  }

  /** Every attempt of one Task, in order, each with its binding, span, outcome and conversions, verified. */
  attempts(dialogueId: string): StoredDialogueAttempt[] {
    const rows = this.#db.prepare('SELECT * FROM dialogue_attempts WHERE dialogue_id = ? ORDER BY ordinal').all(dialogueId) as SqlRow[];
    const attempts = rows.map((row) => this.#attempt(row));
    attempts.forEach((attempt, index) => {
      requireDialogue(attempt.ordinal === index + 1 && (index === 0 ? attempt.priorAttemptId === null : attempt.priorAttemptId === attempts[index - 1]!.attemptId),
        'DIALOGUE_RECORD_INVALID', INVALID);
    });
    return attempts;
  }

  /** One attempt, or `null`. */
  attempt(attemptId: string): StoredDialogueAttempt | null {
    requireDialogue(UUID_PATTERN.test(attemptId), 'DIALOGUE_INVALID', '回答标识无效。');
    const row = this.#db.prepare('SELECT * FROM dialogue_attempts WHERE attempt_id = ?').get(attemptId) as SqlRow | undefined;
    return row === undefined ? null : this.#attempt(row);
  }

  #attempt(row: SqlRow): StoredDialogueAttempt {
    const kind = text(row.kind);
    requireDialogue(kind === 'ask' || kind === 'continue' || kind === 'regenerate', 'DIALOGUE_RECORD_INVALID', INVALID);
    const base = {
      attemptId: text(row.attempt_id),
      dialogueId: text(row.dialogue_id),
      ordinal: integer(row.ordinal),
      kind: kind as DialogueAttemptKind,
      priorAttemptId: nullableText(row.prior_attempt_id),
      createdAt: text(row.created_at),
    };
    verified(row, { schema: ATTEMPT_SCHEMA, ...base });
    const bindingRow = this.#db.prepare('SELECT * FROM dialogue_execution_bindings WHERE attempt_id = ?').get(base.attemptId) as SqlRow | undefined;
    let binding: StoredDialogueBinding | null = null;
    if (bindingRow !== undefined) {
      const route = text(bindingRow.route);
      const scope = text(bindingRow.operational_scope);
      const shared = {
        harnessSessionId: text(bindingRow.harness_session_id),
        model: text(bindingRow.model),
        behaviorCompositionSha256: text(bindingRow.behavior_composition_sha256),
        promptContractSha256: text(bindingRow.prompt_contract_sha256),
        boundAt: text(bindingRow.bound_at),
      };
      if (route === 'ai7-local-deterministic' && scope === 'development-ci') {
        requireDialogue(bindingRow.provider_processing_version === null && bindingRow.policy_rule_id === null, 'DIALOGUE_RECORD_INVALID', INVALID);
        binding = { ...shared, route, operationalScope: scope, fixtureSha256: text(bindingRow.fixture_sha256) };
      } else {
        requireDialogue(livePairAdmitted(route, scope) && bindingRow.fixture_sha256 === null, 'DIALOGUE_RECORD_INVALID', INVALID);
        binding = {
          ...shared, route: route as StoredLiveDialogueBinding['route'], operationalScope: scope as StoredLiveDialogueBinding['operationalScope'],
          providerProcessingVersion: text(bindingRow.provider_processing_version), policyRuleId: text(bindingRow.policy_rule_id),
        };
      }
      verified(bindingRow, bindingRecord(base.attemptId, binding));
    }
    const spanRow = this.#db.prepare('SELECT * FROM dialogue_harness_spans WHERE attempt_id = ?').get(base.attemptId) as SqlRow | undefined;
    let span: StoredDialogueAttempt['span'] = null;
    if (spanRow !== undefined) {
      span = { harnessSessionId: text(spanRow.harness_session_id), startSeq: integer(spanRow.start_seq), openedAt: text(spanRow.opened_at) };
      verified(spanRow, { schema: SPAN_SCHEMA, attemptId: base.attemptId, ...span });
      requireDialogue(binding !== null && binding.harnessSessionId === span.harnessSessionId, 'DIALOGUE_RECORD_INVALID', INVALID);
    }
    const outcomeRow = this.#db.prepare('SELECT * FROM dialogue_attempt_outcomes WHERE attempt_id = ?').get(base.attemptId) as SqlRow | undefined;
    let outcome: StoredDialogueAttempt['outcome'] = null;
    if (outcomeRow !== undefined) {
      const value = text(outcomeRow.outcome);
      requireDialogue(value === 'completed' || value === 'stopped' || value === 'interrupted' || value === 'failed', 'DIALOGUE_RECORD_INVALID', INVALID);
      outcome = { outcome: value, endSeq: nullableInteger(outcomeRow.end_seq), causeCode: nullableText(outcomeRow.cause_code), settledAt: text(outcomeRow.settled_at) };
      verified(outcomeRow, { schema: OUTCOME_SCHEMA, attemptId: base.attemptId, ...outcome });
      // A turn that reached the Session ends inside its span; one that never did names no end.
      requireDialogue(outcome.endSeq === null || (span !== null && outcome.endSeq >= span.startSeq), 'DIALOGUE_RECORD_INVALID', INVALID);
    }
    const conversions = (this.#db.prepare('SELECT * FROM dialogue_conversions WHERE attempt_id = ? ORDER BY converted_at, conversion_id')
      .all(base.attemptId) as SqlRow[]).map((conversionRow) => {
      const conversion = { conversionId: text(conversionRow.conversion_id), markId: text(conversionRow.mark_id), convertedAt: text(conversionRow.converted_at) };
      verified(conversionRow, { schema: CONVERSION_SCHEMA, attemptId: base.attemptId, ...conversion });
      return conversion;
    });
    requireDialogue(conversions.length === 0 || outcome?.outcome === 'completed', 'DIALOGUE_RECORD_INVALID', INVALID);
    return { ...base, binding, span, outcome, conversions };
  }

  #insertAttempt(dialogueId: string, ordinal: number, kind: DialogueAttemptKind, priorAttemptId: string | null, now: Date): string {
    const attempt = { attemptId: randomUUID(), dialogueId, ordinal, kind, priorAttemptId, createdAt: now.toISOString() };
    const seal = sealed({ schema: ATTEMPT_SCHEMA, ...attempt });
    this.#db.prepare(
      `INSERT INTO dialogue_attempts (attempt_id, dialogue_id, ordinal, kind, prior_attempt_id, created_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(attempt.attemptId, dialogueId, ordinal, kind, priorAttemptId, attempt.createdAt, seal.json, seal.sha256);
    return attempt.attemptId;
  }

  /**
   * A new attempt after the last, which must have settled (DIALOG-014): 继续回答 only after an answer that stopped or was
   * interrupted with something kept, 重新回答 after any. Inside the caller's transaction.
   */
  nextAttempt(dialogueId: string, kind: 'continue' | 'regenerate', keptFragments: (attempt: StoredDialogueAttempt) => number, now: Date): string {
    const attempts = this.attempts(dialogueId);
    const last = attempts.at(-1);
    requireDialogue(last !== undefined, 'DIALOGUE_NOT_FOUND', '这段对话不存在。');
    requireDialogue(last.outcome !== null, 'DIALOGUE_ANSWERING', '这个问题还在回答中；停止回答后才能继续或重新回答。');
    if (kind === 'continue') {
      requireDialogue(last.outcome.outcome === 'stopped' || last.outcome.outcome === 'interrupted', 'DIALOGUE_NOT_INCOMPLETE',
        '只有停止或中断、内容不完整的回答才能继续回答。');
      requireDialogue(keptFragments(last) > 0, 'DIALOGUE_NOTHING_KEPT', '这次回答没有留下完整的内容可以接着回答；请重新回答。');
    }
    return this.#insertAttempt(dialogueId, last.ordinal + 1, kind, last.attemptId, now);
  }

  bind(attemptId: string, binding: StoredDialogueBinding): void {
    const live = binding.route !== 'ai7-local-deterministic';
    requireDialogue(UUID_PATTERN.test(binding.harnessSessionId) && DIGEST_PATTERN.test(binding.behaviorCompositionSha256) &&
      DIGEST_PATTERN.test(binding.promptContractSha256) &&
      (live
        ? livePairAdmitted(binding.route, binding.operationalScope) && /^v[1-9][0-9]{0,14}$/u.test(binding.providerProcessingVersion) &&
          binding.policyRuleId.length > 0 && binding.policyRuleId.length <= 128
        : binding.operationalScope === 'development-ci' && DIGEST_PATTERN.test(binding.fixtureSha256)),
    'DIALOGUE_INVALID', '对话的执行绑定无效。');
    const seal = sealed(bindingRecord(attemptId, binding));
    this.#db.prepare(
      `INSERT INTO dialogue_execution_bindings (attempt_id, harness_session_id, route, model, operational_scope, behavior_composition_sha256,
         prompt_contract_sha256, fixture_sha256, bound_at, canonical_json, sha256, provider_processing_version, policy_rule_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(attemptId, binding.harnessSessionId, binding.route, binding.model, binding.operationalScope, binding.behaviorCompositionSha256,
      binding.promptContractSha256, live ? null : binding.fixtureSha256, binding.boundAt, seal.json, seal.sha256,
      live ? binding.providerProcessingVersion : null, live ? binding.policyRuleId : null);
  }

  openSpan(attemptId: string, harnessSessionId: string, startSeq: number, now: Date): void {
    const span = { harnessSessionId, startSeq, openedAt: now.toISOString() };
    const seal = sealed({ schema: SPAN_SCHEMA, attemptId, ...span });
    this.#db.prepare(
      `INSERT INTO dialogue_harness_spans (attempt_id, harness_session_id, start_seq, opened_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(attemptId, harnessSessionId, startSeq, span.openedAt, seal.json, seal.sha256);
  }

  settle(attemptId: string, outcome: DialogueOutcome, endSeq: number | null, causeCode: string | null, now: Date): void {
    const record = { outcome, endSeq, causeCode, settledAt: now.toISOString() };
    const seal = sealed({ schema: OUTCOME_SCHEMA, attemptId, ...record });
    this.#db.prepare(
      `INSERT INTO dialogue_attempt_outcomes (attempt_id, outcome, end_seq, cause_code, settled_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(attemptId, outcome, endSeq, causeCode, record.settledAt, seal.json, seal.sha256);
  }

  /** Every attempt no outcome settled: what a service that stopped left answering. */
  unsettled(): StoredDialogueAttempt[] {
    return (this.#db.prepare(
      `SELECT a.* FROM dialogue_attempts a LEFT JOIN dialogue_attempt_outcomes o ON o.attempt_id = a.attempt_id
       WHERE o.attempt_id IS NULL ORDER BY a.created_at, a.attempt_id`,
    ).all() as SqlRow[]).map((row) => this.#attempt(row));
  }

  convert(attemptId: string, markId: string, now: Date): string {
    const conversion = { conversionId: randomUUID(), markId, convertedAt: now.toISOString() };
    const seal = sealed({ schema: CONVERSION_SCHEMA, attemptId, ...conversion });
    this.#db.prepare(
      `INSERT INTO dialogue_conversions (conversion_id, attempt_id, mark_id, converted_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(conversion.conversionId, attemptId, markId, conversion.convertedAt, seal.json, seal.sha256);
    return conversion.conversionId;
  }
}
