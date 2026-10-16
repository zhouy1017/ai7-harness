import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_TASK_INTENT_DRAFT_ANSWER_CHARACTERS,
  MAX_TASK_INTENT_DRAFT_RANGES,
  MAX_TASK_INTENT_GOAL_LENGTH,
  TASK_INTENT_OUTCOME_CLASSES,
  type TaskIntentDraftAnswerProjection,
  type TaskIntentDraftOption,
  type TaskIntentDraftOrigin,
  type TaskIntentDraftProcedurePin,
  type TaskIntentDraftResolution,
  type TaskIntentOutcomeClass,
} from '../shared/protocol.js';
import { BLOCK_ID_PATTERN, DIGEST_PATTERN, UUID_PATTERN, canonicalRecord, isRecord, parseCanonicalJson } from './analysis/canonical.js';

/**
 * Task Intent Drafts (Issue #423, wave 10 slice 7a; #52 S17b; V2-UX-TASK-001 to 009, DIALOG-016): what the editor asked AI7 to
 * do, before anything is prepared — the requested goal in the editor's own words, the exact target (the whole Book, or the
 * Pinned Manuscript Ranges it carries), the intended outcome, and the context it came from. A draft is durable, versioned and
 * bound to one Book; it is no Task Intent, plan, Run Authorization or Run Record, and nothing in it is ever sent. 准备计划 makes
 * one exact version of it a prepared Task through the existing preparation of a kind, and the promotion links the two.
 *
 * Schema revision 80 owns three append-only relations:
 * - `task_intent_drafts`: the draft — its Book and where it began;
 * - `task_intent_draft_versions`: each version, numbered — the goal, the target, the intended outcome and, in its record, the
 *   ranges as they were pinned and the dialogue answer it was made from;
 * - `task_intent_draft_promotions`: the one version of a draft that became a Task, and that Task — its Task Intent, and for a
 *   审阅 the Review Run. Model-free baseline leads are not a draft promotion target. A promoted draft is final.
 */
export const TASK_INTENT_DRAFT_SCHEMA_SQL = {
  task_intent_drafts: `CREATE TABLE task_intent_drafts (
  draft_id TEXT PRIMARY KEY CHECK(length(draft_id) = 36),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  origin TEXT NOT NULL CHECK(origin IN ('composer-selection', 'composer-book', 'dialogue-answer')),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  task_intent_draft_versions: `CREATE TABLE task_intent_draft_versions (
  version_id TEXT PRIMARY KEY CHECK(length(version_id) = 36),
  draft_id TEXT NOT NULL REFERENCES task_intent_drafts(draft_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  goal TEXT NOT NULL CHECK(length(goal) BETWEEN 1 AND ${MAX_TASK_INTENT_GOAL_LENGTH}),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('book', 'ranges')),
  outcome_class TEXT CHECK(outcome_class IS NULL OR outcome_class IN ('analysis', 'review', 'factual', 'writing')),
  range_count INTEGER NOT NULL CHECK(range_count BETWEEN 0 AND ${MAX_TASK_INTENT_DRAFT_RANGES}),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((target_kind = 'ranges') = (range_count >= 1)),
  UNIQUE(draft_id, ordinal)
) STRICT`,
  task_intent_draft_promotions: `CREATE TABLE task_intent_draft_promotions (
  draft_id TEXT PRIMARY KEY REFERENCES task_intent_drafts(draft_id),
  version_id TEXT NOT NULL UNIQUE REFERENCES task_intent_draft_versions(version_id),
  task_kind TEXT NOT NULL CHECK(task_kind IN ('baseline-analysis', 'review-run', 'writing')),
  task_intent_id TEXT NOT NULL UNIQUE REFERENCES analysis_task_intents(task_intent_id),
  review_run_id TEXT UNIQUE REFERENCES review_runs(review_run_id),
  promoted_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((task_kind = 'review-run') = (review_run_id IS NOT NULL)),
  CHECK(task_kind = 'review-run' OR task_intent_id IS NOT NULL)
) STRICT`,
} as const;

export const TASK_INTENT_DRAFT_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(TASK_INTENT_DRAFT_SCHEMA_SQL).flatMap((table) => ['update', 'delete'].map((op) => [
    `${table}_no_${op}`, `CREATE TRIGGER ${table}_no_${op} BEFORE ${op.toUpperCase()} ON ${table}
    BEGIN SELECT RAISE(ABORT, 'TASK_INTENT_DRAFT_IMMUTABLE'); END`,
  ])),
);

export const TASK_INTENT_DRAFT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  task_intent_drafts: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
  task_intent_draft_versions: ['draft_id>task_intent_drafts.draft_id:NO ACTION/NO ACTION/NONE'],
  task_intent_draft_promotions: [
    'draft_id>task_intent_drafts.draft_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
    'version_id>task_intent_draft_versions.version_id:NO ACTION/NO ACTION/NONE',
  ],
};

/** Revision 80's relations, created once before the version is stamped: an older store gains them empty and nothing moves. */
export function initializeTaskIntentDraftSchema(db: DatabaseSync, version: number): void {
  if (version >= 80 || Object.keys(TASK_INTENT_DRAFT_SCHEMA_SQL).some((name) => db.prepare('SELECT 1 FROM sqlite_schema WHERE name = ?').get(name) !== undefined)) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(TASK_INTENT_DRAFT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(TASK_INTENT_DRAFT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Task Intent Draft schema rollback failed.');
    }
    throw error;
  }
}

export class TaskIntentDraftError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TaskIntentDraftError';
  }
}

export function requireDraft(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new TaskIntentDraftError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const invalidRecord = (): TaskIntentDraftError => new TaskIntentDraftError('TASK_INTENT_DRAFT_RECORD_INVALID', '任务意图草稿记录无效。');
function text(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') throw invalidRecord();
  return value;
}
function integer(value: SQLOutputValue | undefined): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalidRecord();
  return value;
}

/** One Pinned Manuscript Range as the draft keeps it: the exact words and where they stood when pinned. */
export interface StoredDraftRange {
  readonly rangeId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly blockId: string;
  readonly blockDigest: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly journalSequence: number;
  /** Whether the words were pinned on edits newer than the revision named: `待保存修订版` until a revision holds them. */
  readonly pendingSave: boolean;
  readonly text: string;
}

/** What one version holds: the editor's words and choices, and the context it came from. */
export interface DraftContent {
  readonly goal: string;
  readonly target: 'book' | 'ranges';
  readonly outcomeClass: TaskIntentOutcomeClass | null;
  readonly ranges: ReadonlyArray<StoredDraftRange>;
  readonly answer: TaskIntentDraftAnswerProjection | null;
  /** The 工序 picked in the recommendation slot (#423 rev 6), by identity only. */
  readonly procedurePin: TaskIntentDraftProcedurePin | null;
}

export interface StoredDraftVersion extends DraftContent {
  readonly versionId: string;
  readonly ordinal: number;
  readonly createdAt: string;
}

export interface StoredDraft {
  readonly draftId: string;
  readonly bookId: string;
  readonly origin: TaskIntentDraftOrigin;
  readonly createdAt: string;
  readonly latest: StoredDraftVersion;
  readonly promotion: null | StoredPromotion;
}

/** The Task a draft became: its kind, its mandatory Task Intent, and its optional Review Run. */
export interface StoredPromotion {
  readonly versionId: string;
  readonly taskKind: 'baseline-analysis' | 'review-run' | 'writing';
  readonly taskIntentId: string;
  readonly reviewRunId: string | null;
  readonly promotedAt: string;
}

/** The goal as the editor wrote it, trimmed: one to `MAX_TASK_INTENT_GOAL_LENGTH` characters. */
export function draftGoal(value: unknown): string {
  requireDraft(typeof value === 'string', 'TASK_INTENT_DRAFT_GOAL_INVALID', '请描述希望 AI7 完成的编辑工作。');
  const goal = value.trim();
  requireDraft(goal.length > 0, 'TASK_INTENT_DRAFT_GOAL_INVALID', '请描述希望 AI7 完成的编辑工作。');
  requireDraft([...goal].length <= MAX_TASK_INTENT_GOAL_LENGTH && goal.length <= MAX_TASK_INTENT_GOAL_LENGTH,
    'TASK_INTENT_DRAFT_GOAL_INVALID', `任务描述最多 ${MAX_TASK_INTENT_GOAL_LENGTH} 个字。`);
  return goal;
}

export function draftOutcomeClass(value: unknown): TaskIntentOutcomeClass | null {
  requireDraft(value === null || TASK_INTENT_OUTCOME_CLASSES.includes(value as TaskIntentOutcomeClass),
    'TASK_INTENT_DRAFT_INVALID', '希望得到的结果无效。');
  return value as TaskIntentOutcomeClass | null;
}

function isStoredRange(value: unknown): value is StoredDraftRange {
  return isRecord(value) && typeof value.rangeId === 'string' && UUID_PATTERN.test(value.rangeId) &&
    typeof value.manuscriptId === 'string' && UUID_PATTERN.test(value.manuscriptId) && typeof value.branchId === 'string' && UUID_PATTERN.test(value.branchId) &&
    typeof value.blockId === 'string' && BLOCK_ID_PATTERN.test(value.blockId) && typeof value.blockDigest === 'string' && DIGEST_PATTERN.test(value.blockDigest) &&
    Number.isSafeInteger(value.fromGrapheme) && Number.isSafeInteger(value.toGrapheme) && (value.fromGrapheme as number) >= 0 &&
    (value.toGrapheme as number) > (value.fromGrapheme as number) && typeof value.revisionId === 'string' && UUID_PATTERN.test(value.revisionId) &&
    typeof value.revisionLabel === 'string' && Number.isSafeInteger(value.journalSequence) && (value.journalSequence as number) >= 0 &&
    typeof value.pendingSave === 'boolean' && typeof value.text === 'string' && value.text.length > 0;
}

export function isProcedurePin(value: unknown): value is TaskIntentDraftProcedurePin {
  return isRecord(value) && Object.keys(value).length === 2 && typeof value.procedureId === 'string' && UUID_PATTERN.test(value.procedureId) &&
    typeof value.versionId === 'string' && UUID_PATTERN.test(value.versionId);
}

function isStoredAnswer(value: unknown): value is TaskIntentDraftAnswerProjection {
  return isRecord(value) && typeof value.dialogueId === 'string' && UUID_PATTERN.test(value.dialogueId) &&
    typeof value.attemptId === 'string' && UUID_PATTERN.test(value.attemptId) && Number.isSafeInteger(value.attemptOrdinal) &&
    typeof value.selectionSha256 === 'string' && DIGEST_PATTERN.test(value.selectionSha256) && typeof value.text === 'string' &&
    value.text.length <= MAX_TASK_INTENT_DRAFT_ANSWER_CHARACTERS && Array.isArray(value.rows) && value.rows.every((row) => typeof row === 'string') &&
    typeof value.truncated === 'boolean';
}

/**
 * The drafts of one store. Every write appends: a draft with its first version, a further version of an unpromoted draft, or the
 * one promotion of a draft's latest version. Reads revalidate each record against its digest-bearing row.
 */
export class TaskIntentDraftLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  create(bookId: string, origin: TaskIntentDraftOrigin, content: DraftContent, now: Date): StoredDraft {
    requireDraft(UUID_PATTERN.test(bookId), 'TASK_INTENT_DRAFT_INVALID', '图书标识无效。');
    const draftId = randomUUID();
    const createdAt = now.toISOString();
    const record = canonicalRecord({ bookId, createdAt, draftId, origin });
    this.#db.prepare('INSERT INTO task_intent_drafts(draft_id, book_id, origin, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(draftId, bookId, origin, createdAt, record.json, record.digest);
    this.#appendVersion(draftId, 1, null, content, createdAt);
    return this.draft(draftId)!;
  }

  /** A further version of the draft the editor edited at `expectedOrdinal`; refused once promoted, or when another was saved since. */
  saveVersion(draftId: string, bookId: string, expectedOrdinal: number, content: DraftContent, now: Date): StoredDraft {
    const draft = this.draft(draftId);
    requireDraft(draft !== null && draft.bookId === bookId, 'TASK_INTENT_DRAFT_NOT_FOUND', '这份任务意图草稿不在这本书里。');
    requireDraft(draft.promotion === null, 'TASK_INTENT_DRAFT_PROMOTED', '这份草稿已经准备成任务，不能再修改；请在任务计划里继续。');
    requireDraft(draft.latest.ordinal === expectedOrdinal, 'TASK_INTENT_DRAFT_STALE', '这份草稿在你修改之后已有新的版本；请看最新的版本再改。');
    this.#appendVersion(draftId, expectedOrdinal + 1, draft.latest.versionId, content, now.toISOString());
    return this.draft(draftId)!;
  }

  #appendVersion(draftId: string, ordinal: number, previousVersionId: string | null, content: DraftContent, createdAt: string): void {
    const goal = draftGoal(content.goal);
    requireDraft((content.target === 'ranges') === (content.ranges.length > 0) && content.ranges.length <= MAX_TASK_INTENT_DRAFT_RANGES &&
      content.ranges.every(isStoredRange) && new Set(content.ranges.map((range) => range.rangeId)).size === content.ranges.length &&
      (content.answer === null || isStoredAnswer(content.answer)) && (content.procedurePin === null || isProcedurePin(content.procedurePin)),
    'TASK_INTENT_DRAFT_INVALID', '任务意图草稿的内容无效。');
    const versionId = randomUUID();
    const record = canonicalRecord({
      answer: content.answer,
      createdAt,
      draftId,
      goal,
      ordinal,
      outcomeClass: content.outcomeClass,
      previousVersionId,
      procedurePin: content.procedurePin === null ? null : { procedureId: content.procedurePin.procedureId, versionId: content.procedurePin.versionId },
      ranges: content.ranges,
      target: content.target,
      versionId,
    });
    this.#db.prepare(
      `INSERT INTO task_intent_draft_versions(version_id, draft_id, ordinal, goal, target_kind, outcome_class, range_count, created_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(versionId, draftId, ordinal, goal, content.target, content.outcomeClass, content.ranges.length, createdAt, record.json, record.digest);
  }

  /**
   * The promotion of the draft's latest version into the Task Intent the existing preparation just wrote — in that write's own
   * transaction, so a draft is promoted exactly once and a refusal here leaves no Task behind.
   */
  promote(draftId: string, versionId: string, task: Omit<StoredPromotion, 'versionId' | 'promotedAt' | 'taskIntentId'> & { taskIntentId: string | null }, now: Date): void {
    const draft = this.draft(draftId);
    requireDraft(draft !== null, 'TASK_INTENT_DRAFT_NOT_FOUND', '这份任务意图草稿不存在。');
    requireDraft(draft.promotion === null, 'TASK_INTENT_DRAFT_PROMOTED', '这份草稿已经准备成任务。');
    requireDraft(draft.latest.versionId === versionId, 'TASK_INTENT_DRAFT_STALE', '这份草稿在你准备计划之前已有新的版本；请看最新的版本。');
    requireDraft(task.taskIntentId !== null && UUID_PATTERN.test(task.taskIntentId) && (task.reviewRunId === null || UUID_PATTERN.test(task.reviewRunId)) &&
      (task.taskKind === 'review-run') === (task.reviewRunId !== null) && (task.taskKind === 'review-run' || task.taskIntentId !== null),
    'TASK_INTENT_DRAFT_INVALID', '任务标识无效。');
    const promotedAt = now.toISOString();
    const record = canonicalRecord({ draftId, promotedAt, reviewRunId: task.reviewRunId, taskIntentId: task.taskIntentId, taskKind: task.taskKind, versionId });
    this.#db.prepare(
      `INSERT INTO task_intent_draft_promotions(draft_id, version_id, task_kind, task_intent_id, review_run_id, promoted_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(draftId, versionId, task.taskKind, task.taskIntentId, task.reviewRunId, promotedAt, record.json, record.digest);
  }

  draft(draftId: string): StoredDraft | null {
    if (typeof draftId !== 'string' || !UUID_PATTERN.test(draftId)) return null;
    const row = this.#db.prepare('SELECT * FROM task_intent_drafts WHERE draft_id = ?').get(draftId) as SqlRow | undefined;
    return row === undefined ? null : this.#read(row);
  }

  /** The drafts of a Book — or of every Book, for 待我处理 — not yet promoted, newest first. */
  unpromoted(bookId: string | null, limit: number): StoredDraft[] {
    const rows = this.#db.prepare(
      `SELECT d.* FROM task_intent_drafts d
       WHERE (? IS NULL OR d.book_id = ?) AND NOT EXISTS (SELECT 1 FROM task_intent_draft_promotions p WHERE p.draft_id = d.draft_id)
       ORDER BY d.created_at DESC, d.rowid DESC LIMIT ?`,
    ).all(bookId, bookId, limit) as SqlRow[];
    return rows.map((row) => this.#read(row));
  }

  /** The Book's promoted drafts, newest promotion first. */
  promoted(bookId: string, limit: number): StoredDraft[] {
    const rows = this.#db.prepare(
      `SELECT d.* FROM task_intent_drafts d JOIN task_intent_draft_promotions p ON p.draft_id = d.draft_id
       WHERE d.book_id = ? ORDER BY p.promoted_at DESC, p.rowid DESC LIMIT ?`,
    ).all(bookId, limit) as SqlRow[];
    return rows.map((row) => this.#read(row));
  }

  /** The draft promoted into the Task Intent or the Review Run `ref` names, if one was. */
  promotedInto(ref: string): StoredDraft | null {
    if (typeof ref !== 'string' || !UUID_PATTERN.test(ref)) return null;
    const row = this.#db.prepare('SELECT draft_id FROM task_intent_draft_promotions WHERE task_intent_id = ? OR review_run_id = ? LIMIT 1').get(ref, ref) as SqlRow | undefined;
    return row === undefined ? null : this.draft(text(row.draft_id));
  }

  #read(row: SqlRow): StoredDraft {
    const draftId = text(row.draft_id);
    const bookId = text(row.book_id);
    const origin = text(row.origin) as TaskIntentDraftOrigin;
    const createdAt = text(row.created_at);
    if (canonicalRecord({ bookId, createdAt, draftId, origin }).json !== text(row.canonical_json) ||
      canonicalRecord({ bookId, createdAt, draftId, origin }).digest !== text(row.sha256)) throw invalidRecord();
    const versionRow = this.#db.prepare('SELECT * FROM task_intent_draft_versions WHERE draft_id = ? ORDER BY ordinal DESC LIMIT 1').get(draftId) as SqlRow | undefined;
    if (versionRow === undefined) throw invalidRecord();
    const latest = this.#version(versionRow, draftId);
    const promotionRow = this.#db.prepare('SELECT * FROM task_intent_draft_promotions WHERE draft_id = ?').get(draftId) as SqlRow | undefined;
    let promotion: StoredDraft['promotion'] = null;
    if (promotionRow !== undefined) {
      const nullable = (value: SQLOutputValue | undefined): string | null => value === null ? null : text(value);
      const value = {
        draftId,
        promotedAt: text(promotionRow.promoted_at),
        reviewRunId: nullable(promotionRow.review_run_id),
        taskIntentId: text(promotionRow.task_intent_id),
        taskKind: text(promotionRow.task_kind) as StoredPromotion['taskKind'],
        versionId: text(promotionRow.version_id),
      };
      const record = canonicalRecord(value);
      if (record.json !== text(promotionRow.canonical_json) || record.digest !== text(promotionRow.sha256)) throw invalidRecord();
      promotion = { versionId: value.versionId, taskKind: value.taskKind, taskIntentId: value.taskIntentId, reviewRunId: value.reviewRunId, promotedAt: value.promotedAt };
    }
    return { draftId, bookId, origin, createdAt, latest, promotion };
  }

  #version(row: SqlRow, draftId: string): StoredDraftVersion {
    const json = text(row.canonical_json);
    const record = parseCanonicalJson(json);
    if (!isRecord(record) || canonicalRecord(record).digest !== text(row.sha256) || canonicalRecord(record).json !== json ||
      record.draftId !== draftId || record.versionId !== text(row.version_id) || record.ordinal !== integer(row.ordinal) ||
      record.goal !== text(row.goal) || record.target !== text(row.target_kind) || record.outcomeClass !== (row.outcome_class ?? null) ||
      !Array.isArray(record.ranges) || record.ranges.length !== integer(row.range_count) || !record.ranges.every(isStoredRange) ||
      (record.answer !== null && !isStoredAnswer(record.answer)) || (record.procedurePin !== null && !isProcedurePin(record.procedurePin)) ||
      typeof record.createdAt !== 'string') throw invalidRecord();
    return {
      versionId: record.versionId as string,
      ordinal: record.ordinal as number,
      goal: record.goal as string,
      target: record.target as 'book' | 'ranges',
      outcomeClass: record.outcomeClass as TaskIntentOutcomeClass | null,
      ranges: record.ranges as StoredDraftRange[],
      answer: record.answer as TaskIntentDraftAnswerProjection | null,
      procedurePin: record.procedurePin as TaskIntentDraftProcedurePin | null,
      createdAt: record.createdAt,
    };
  }
}

// ---- 准备计划: which Task a draft becomes (decision 1) --------------------------------------------------------------

/** What the existing preparations of the Book offer now, read from their own projections: the facts a resolution is made of. */
export interface DraftResolutionFacts {
  readonly analysis: null | {
    /** The Book has no Result Set revision yet: 首次基线分析 is the analysis it can take, when `firstAvailable`. */
    readonly first: boolean;
    readonly firstAvailable: boolean;
    readonly firstReason: string | null;
    readonly modes: ReadonlyArray<{ readonly mode: 'sync-current' | 'reanalyze-book' | 'reanalyze-range'; readonly label: string; readonly available: boolean; readonly reason: string | null }>;
  };
  readonly review: null | {
    readonly available: boolean;
    readonly reason: string | null;
    readonly categories: ReadonlyArray<{ readonly categoryId: string; readonly label: string; readonly book: boolean; readonly selection: boolean }>;
  };
  readonly writing: null | ReadonlyArray<{ readonly typeId: string; readonly label: string; readonly available: boolean; readonly reason: string | null }>;
  /** The longest requirements a writing Task takes, in graphemes. */
  readonly writingRequirementsLimit: number;
}

export const FACTUAL_REVIEW_CATEGORY_ID = 'factual-review' as const;

export const DRAFT_RESOLUTION_REASONS = {
  noOutcome: '先选「希望得到的结果」，再准备计划。',
  rangesApart: '这份草稿的几段文字不在同一段落里；一项任务一次只就一段准备计划。请只保留同一段落里的文字，或分别发起。',
  analysisUnreadable: '无法读取稿件分析现在能做什么。',
  reviewUnreadable: '无法读取审阅现在能做什么。',
  writingUnreadable: '无法读取写作任务现在能做什么。',
  noCategory: '没有能审阅这个范围的审阅类别。',
  factualUnavailable: '事实核查现在不能就这个范围准备。',
  writingRanges: '写作任务读全书，不就所选段落准备；请把范围改为全书。',
  noWritingType: '本社没有现在可以起草的文档类型。',
  rangeUnavailable: '重新分析所选范围要先完成首次基线分析。',
} as const;

/** How a pinned range stands now (TASK-002, 031, 043), in the composer's words; an exact range needs no label. */
export const DRAFT_RANGE_STATE_LABELS = {
  exact: null,
  'pending-save': '待保存修订版',
  'awaiting-resolution': '待核对到任务修订版',
  reselect: '任务范围需要重新选择',
} as const;

export const DRAFT_FIRST_BASELINE_UNAVAILABLE = '这本书现在不能准备首次基线分析。';

export function writingRequirementsTooLong(limit: number): string {
  return `写作任务的要求最多 ${limit} 个字；请把任务描述改短。`;
}

const option = (choice: TaskIntentDraftOption['choice'], taskKind: TaskIntentDraftOption['taskKind'], label: string, available: boolean, reason: string | null): TaskIntentDraftOption =>
  ({ choice, taskKind, label, available, reason });

function settle(options: ReadonlyArray<TaskIntentDraftOption>, none: string): TaskIntentDraftResolution {
  const open = options.filter((entry) => entry.available);
  if (options.length === 0) return { state: 'unsupported', reason: none };
  if (open.length === 0) return { state: 'unsupported', reason: options[0]!.reason ?? none };
  if (open.length === 1 && options.length === 1) return { state: 'ready', option: open[0]! };
  return { state: 'choose', options };
}

/**
 * The Task a draft becomes, from its target and intended outcome and the facts alone (no model call): 稿件分析 — the first
 * baseline, or the update modes the Book offers, or 重新分析所选范围 on its one paragraph; 审阅 in one category that reads the
 * target; 事实核查 as its category; 写作任务 of one house type, over the whole Book. Ranges spread over more than one paragraph
 * are never widened to the text between them (TASK-003): the draft says so and stays editable.
 */
export function resolveDraft(draft: Pick<DraftContent, 'target' | 'outcomeClass' | 'ranges' | 'goal'>, facts: DraftResolutionFacts): TaskIntentDraftResolution {
  if (draft.outcomeClass === null) return { state: 'unsupported', reason: DRAFT_RESOLUTION_REASONS.noOutcome };
  const onRanges = draft.target === 'ranges';
  if (onRanges && new Set(draft.ranges.map((range) => range.blockId)).size !== 1) return { state: 'unsupported', reason: DRAFT_RESOLUTION_REASONS.rangesApart };
  switch (draft.outcomeClass) {
    case 'analysis': {
      const analysis = facts.analysis;
      if (analysis === null) return { state: 'unsupported', reason: DRAFT_RESOLUTION_REASONS.analysisUnreadable };
      if (onRanges) {
        const range = analysis.modes.find((entry) => entry.mode === 'reanalyze-range');
        if (analysis.first || range === undefined) return { state: 'unsupported', reason: DRAFT_RESOLUTION_REASONS.rangeUnavailable };
        return settle([option({ kind: 'baseline', mode: 'reanalyze-range' }, 'baseline-analysis', range.label, range.available, range.reason)], DRAFT_RESOLUTION_REASONS.rangeUnavailable);
      }
      if (analysis.first) {
        return settle([option({ kind: 'baseline', mode: 'first-baseline' }, 'baseline-analysis', '首次基线分析', analysis.firstAvailable, analysis.firstReason)],
          analysis.firstReason ?? DRAFT_RESOLUTION_REASONS.analysisUnreadable);
      }
      return settle(analysis.modes.filter((entry) => entry.mode !== 'reanalyze-range')
        .map((entry) => option({ kind: 'baseline', mode: entry.mode }, 'baseline-analysis', entry.label, entry.available, entry.reason)), DRAFT_RESOLUTION_REASONS.analysisUnreadable);
    }
    case 'review':
    case 'factual': {
      const review = facts.review;
      if (review === null) return { state: 'unsupported', reason: DRAFT_RESOLUTION_REASONS.reviewUnreadable };
      if (!review.available) return { state: 'unsupported', reason: review.reason ?? DRAFT_RESOLUTION_REASONS.reviewUnreadable };
      const factual = draft.outcomeClass === 'factual';
      const reads = review.categories.filter((category) => (category.categoryId === FACTUAL_REVIEW_CATEGORY_ID) === factual && (onRanges ? category.selection : category.book));
      return settle(reads.map((category) => option({ kind: 'review', categoryId: category.categoryId }, 'review-run',
        factual ? category.label : `审阅 · 「${category.label}」`, true, null)), factual ? DRAFT_RESOLUTION_REASONS.factualUnavailable : DRAFT_RESOLUTION_REASONS.noCategory);
    }
    case 'writing': {
      if (onRanges) return { state: 'unsupported', reason: DRAFT_RESOLUTION_REASONS.writingRanges };
      if (facts.writing === null) return { state: 'unsupported', reason: DRAFT_RESOLUTION_REASONS.writingUnreadable };
      if ([...draft.goal].length > facts.writingRequirementsLimit) return { state: 'unsupported', reason: writingRequirementsTooLong(facts.writingRequirementsLimit) };
      const types = facts.writing.map((type) => option({ kind: 'writing', typeId: type.typeId }, 'writing', `写作任务 · ${type.label}`, type.available, type.reason));
      // A writing Task always asks for its audience and channel, so even one type is offered as a choice.
      if (types.every((entry) => !entry.available)) return { state: 'unsupported', reason: types[0]?.reason ?? DRAFT_RESOLUTION_REASONS.noWritingType };
      return { state: 'choose', options: types };
    }
  }
}

/** Whether `choice` is one the resolution offers and can take now. */
export function resolutionOffers(resolution: TaskIntentDraftResolution, choice: TaskIntentDraftOption['choice']): TaskIntentDraftOption | null {
  const options = resolution.state === 'ready' ? [resolution.option] : resolution.state === 'choose' ? resolution.options : [];
  const key = JSON.stringify(choice);
  return options.find((entry) => entry.available && JSON.stringify(entry.choice) === key) ?? null;
}

/**
 * What a draft keeps of a completed dialogue answer (DIALOG-016): its complete fragments' words — cut at a fragment within
 * `MAX_TASK_INTENT_DRAFT_ANSWER_CHARACTERS` — with each citation of the manuscript said as one, and its lines as rows when it has
 * more than one.
 */
export function draftAnswer(fragments: ReadonlyArray<{ readonly text: string; readonly breakAfter: boolean }>): { text: string; rows: string[]; truncated: boolean } {
  const plain = (value: string): string => value.replace(/\[retrieval:[0-9a-f]{64}\]/gu, '〔稿件引用〕');
  let kept = '';
  let truncated = false;
  const lines: string[] = [];
  let line = '';
  for (const fragment of fragments) {
    const piece = plain(fragment.text);
    const next = `${kept}${piece}${fragment.breakAfter ? '\n' : ''}`;
    if (next.length > MAX_TASK_INTENT_DRAFT_ANSWER_CHARACTERS) {
      truncated = true;
      break;
    }
    kept = next;
    line += piece;
    if (fragment.breakAfter) {
      lines.push(line.trim());
      line = '';
    }
  }
  if (line.trim().length > 0) lines.push(line.trim());
  const rows = lines.filter((entry) => entry.length > 0);
  return { text: kept.trim(), rows: rows.length > 1 ? rows : [], truncated };
}

/** A draft's first goal made from other words — a dialogue question — cut at a character so it fits the goal's bound. */
export function goalFromText(value: string): string {
  const words = value.trim().replace(/\s+/gu, ' ');
  if (words.length <= MAX_TASK_INTENT_GOAL_LENGTH) return words;
  let kept = '';
  for (const character of words) {
    if (kept.length + character.length > MAX_TASK_INTENT_GOAL_LENGTH - 1) break;
    kept += character;
  }
  return `${kept}…`;
}
