import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_SERIES_NOTE_CHARACTERS,
  MAX_SERIES_TITLE_CHARACTERS,
  MAX_BOOK_SERIES_MEMBERSHIPS,
  publicationText,
  type SeriesImpactGroupProjection,
  type SeriesListCursor,
  type SeriesMembershipChangeKind,
  type SeriesHistoryCursor,
  type SeriesListProjection,
  MAX_SERIES_LIST_PAGE,
  type CreateSeriesInput,
  type SeriesCreationProjection,
  type SeriesProjection,
  type SeriesMembersCursor,
  type SeriesMembersPageProjection,
  type SeriesCandidatesCursor,
  type SeriesCandidatesProjection,
  MAX_SERIES_CANDIDATE_QUERY_CHARACTERS,
  MAX_SERIES_CANDIDATES_PAGE,
  type SeriesHistoryPageProjection,
  type PreviewSeriesMembershipChangeInput,
  type SeriesMembershipPreviewProjection,
  type ChangeSeriesMembershipInput,
  type SeriesMembershipChangeResultProjection,
  type BookSeriesProjection,
  MAX_SERIES_HISTORY_PAGE,
  type SeriesMembershipChangeProjection,
  type InspectSeriesExclusionTargetsInput,
  type SeriesExclusionTargetsProjection,
  type SeriesExclusionTargetKind,
  type SeriesExclusionTargetProjection,
  MAX_SERIES_EXCLUSION_TARGETS_PAGE,
  SERIES_KNOWLEDGE_CLASSES,
  type InspectSeriesExclusionHistoryInput,
  type SeriesExclusionHistoryPageProjection,
  type PreviewSeriesExclusionInput,
  type SeriesExclusionPreviewProjection,
  type RecordSeriesExclusionInput,
  type SeriesExclusionResultProjection,
  MAX_SERIES_EXCLUSION_REASON_CHARACTERS,
  MAX_SERIES_EXCLUSIONS,
  SERIES_EXCLUSION_ACTION_LABELS,
  type SeriesExclusionsProjection,
  type SeriesExclusionProjection,
  type SeriesExclusionHistoryCursor,
  MAX_SERIES_EXCLUSION_HISTORY_PAGE,
  type SeriesExclusionRevisionProjection,
  type ProposeSeriesKnowledgeInput,
  type SeriesKnowledgeProposalProjection,
  MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS,
  type InspectSeriesKnowledgeReviewInput,
  type SeriesKnowledgeReviewProjection,
  type EditSeriesKnowledgeCandidateInput,
  type PromoteSeriesKnowledgeInput,
  type SeriesKnowledgePromotionProjection,
  SERIES_KNOWLEDGE_CONFLICT_LABEL,
  type SeriesKnowledgeItemsCursor,
  type SeriesKnowledgeItemsPageProjection,
  MAX_SERIES_KNOWLEDGE_QUERY_CHARACTERS,
  MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS,
  type SeriesKnowledgeCandidatesCursor,
  type SeriesKnowledgeCandidatesPageProjection,
  type SeriesKnowledgeConflictsProjection,
  MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN,
  type SeriesKnowledgeRevisionsProjection,
  MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE,
  MAX_SERIES_KNOWLEDGE_ITEMS_PAGE,
  MAX_SERIES_KNOWLEDGE_CANDIDATES_PAGE,
  type SeriesKnowledgeTarget,
  type SeriesKnowledgeSpanInput,
  SERIES_KNOWLEDGE_REUSE_SCOPES,
  SERIES_KNOWLEDGE_REUSE_LABELS,
  type SeriesKnowledgeProvenanceProjection,
  type SeriesKnowledgeCandidateProjection,
  SERIES_KNOWLEDGE_CLASS_LABELS,
  type SeriesKnowledgeRevisionProjection,
  type SeriesKnowledgeItemProjection,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, parseStoredJson, sha256Hex } from './analysis/canonical.js';
import { requireStore, UUID_PATTERN, type SqlRow as StoreSqlRow, asString, canonicalJson as storeCanonicalJson } from './store-records.js';
import {
  isSeriesExclusionTargetKind,
  seriesExclusionTarget,
  type StoredExclusion,
  isSeriesExclusionAction,
  seriesExclusionReason,
  type SeriesKnowledgeMaterial,
  seriesExclusionCovers,
  knowledgeMaterial,
  coveringExclusions,
  seriesExclusionImpact,
  seriesExclusionPreviewDigest,
  type StoredExclusionRevision,
  type SeriesExclusionLedger,
} from './series-exclusions.js';
import {
  isSeriesKnowledgeClass,
  seriesKnowledgeContent,
  countSeriesKnowledgeConflicts,
  seriesKnowledgeConflicts,
  isSeriesKnowledgeReuseScope,
  SERIES_KNOWLEDGE_PAGE_BYTES,
  type ResolvedTarget,
  seriesKnowledgeSubject,
  type StoredProvenance,
  type StoredCandidate,
  type FoundConflict,
  seriesKnowledgeReviewSummary,
  knowledgeQuoteExcerpt,
  type StoredRevision,
  type StoredItem,
  type SeriesKnowledgeLedger,
} from './series-knowledge.js';
import type { ReviewRunStore } from './review/review-runs.js';
import type { EditorialMarkStore } from './editorial-marks.js';
import type { LearningMaterialCandidate, LearningEligibilityLedger } from './learning-eligibility.js';

/**
 * 书系 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012; ADR 0002, ADR 0036). A Series is an explicitly related group of
 * Books; membership is one exact Book in one exact Series, changed only by `加入书系` or `移出书系` after the four-part Series
 * Membership Impact Preview, and each change appends a Series Membership Change Record carrying what the preview showed.
 * Membership is eligibility for later explicit Series-scope selection and nothing more: no Task, Run Authorization, source
 * scope, Learning Eligibility, Provider transmission or cross-Book mutation follows from it.
 *
 * Schema revision 52 owns two relations, ledgers like the others: the Series themselves, and one chain of membership changes
 * per Series and Book that alternates `add` and `remove` by its ordinal. Each record is canonical and digested, appended once
 * and never rewritten.
 */

export const SERIES_SCHEMA_SQL = {
  series: `CREATE TABLE series (
  series_id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND ${MAX_SERIES_TITLE_CHARACTERS}),
  title_key TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL CHECK(length(note) <= ${MAX_SERIES_NOTE_CHARACTERS}),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  series_membership_changes: `CREATE TABLE series_membership_changes (
  change_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(series_id),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('add', 'remove')),
  preview_digest TEXT NOT NULL CHECK(length(preview_digest) = 64),
  supersedes_change_id TEXT REFERENCES series_membership_changes(change_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (supersedes_change_id IS NULL)),
  CHECK((ordinal % 2 = 1) = (kind = 'add')),
  UNIQUE(series_id, book_id, ordinal)
) STRICT`,
} as const;

/** The most one page of a 书系 list weighs on the wire (Issue #63 review); an answer that holds two pages holds two of these. */
export const SERIES_PAGE_BYTES = 96 * 1024;

function wireBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * One page of a 书系 list (Issue #63 review): from the items given, in order, at most `count` and no more than `bytes` — but
 * always the first while there is one, so paging reaches the end — and whether any were left for the next page.
 */
export function weighedPage<T>(items: ReadonlyArray<T>, count: number, bytes: number = SERIES_PAGE_BYTES): { page: T[]; more: boolean } {
  const page: T[] = [];
  let spent = 0;
  for (const item of items) {
    if (page.length >= count) break;
    const weight = wireBytes(item) + 1;
    if (page.length > 0 && spent + weight > bytes) break;
    page.push(item);
    spent += weight;
  }
  return { page, more: page.length < items.length };
}

/**
 * The order a membership change record is listed in, newest first: by when it was recorded, then by Series, Book and the
 * chain's own ordinal, so every record has one place and a page can start after any of them. An exact tie within one Series
 * and Book falls to the chain's order; a clock stepped back can still list a pair's records out of it here — membership
 * itself always follows the chain, never this listing.
 */
export function seriesHistoryOrder(
  left: { readonly recordedAt: string; readonly seriesId: string; readonly bookId: string; readonly ordinal: number },
  right: { readonly recordedAt: string; readonly seriesId: string; readonly bookId: string; readonly ordinal: number },
): number {
  const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return text(right.recordedAt, left.recordedAt) || text(right.seriesId, left.seriesId) || text(right.bookId, left.bookId) ||
    right.ordinal - left.ordinal;
}

export const SERIES_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(SERIES_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'SERIES_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'SERIES_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const SERIES_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  series: [],
  series_membership_changes: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'series_id>series.series_id:NO ACTION/NO ACTION/NONE',
    'supersedes_change_id>series_membership_changes.change_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class SeriesError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SeriesError';
  }
}

function requireSeries(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new SeriesError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const SERIES_SCHEMA = 'ai7.series/1';
const CHANGE_SCHEMA = 'ai7.series-membership-change/1';
const PREVIEW_SCHEMA = 'ai7.series-membership-preview/1';
const ACTOR = '本机编辑';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'series'";
const INVALID = '书系记录已损坏。';
/** The four consequence groups of the preview, in the order SER-003 fixes. */
export const SERIES_IMPACT_GROUPS = [
  { key: 'future-tasks', title: '未来任务' },
  { key: 'runs', title: '已授权或正在运行' },
  { key: 'knowledge-learning', title: '书系知识与学习' },
  { key: 'history', title: '历史记录' },
] as const;

/** Revision 52's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeSeriesSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(SERIES_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(SERIES_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Series schema rollback failed.');
    }
    throw error;
  }
}

/** A Series name as it is recorded: 1 to 40 characters on one line, NFC-normalized and trimmed, spaces collapsed. */
export function seriesTitle(value: unknown): string | null {
  const text = publicationText(value, MAX_SERIES_TITLE_CHARACTERS);
  if (text === null || /[\u0000-\u001f\u007f]/u.test(text)) return null;
  return text.replace(/\s+/gu, ' ');
}

/** What makes two Series names the same name: spacing and case do not tell them apart. */
function titleKey(title: string): string {
  return title.replace(/\s+/gu, '').toLowerCase();
}

/** A Series' 说明: empty, or up to 500 characters. */
export function seriesNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.trim().length === 0) return '';
  return publicationText(value, MAX_SERIES_NOTE_CHARACTERS);
}

export interface StoredSeries {
  readonly seriesId: string;
  readonly title: string;
  readonly note: string;
  readonly createdAt: string;
}

export interface StoredMembershipChange {
  readonly changeId: string;
  readonly seriesId: string;
  readonly bookId: string;
  readonly ordinal: number;
  readonly kind: SeriesMembershipChangeKind;
  readonly previewDigest: string;
  readonly impact: ReadonlyArray<SeriesImpactGroupProjection>;
  readonly recordedAt: string;
}

/** The facts a preview states, read by the store from the records that own them. */
export interface SeriesImpactFacts {
  readonly seriesTitle: string;
  readonly bookTitle: string;
  /** Authorized, queued or running Runs whose frozen scope names this Series (Issue #64, 7b). */
  readonly seriesScopedRuns: number;
  readonly learningMaterials: number;
  readonly learningDecided: number;
  /** Items of the Series' knowledge holding a revision taken from the Book (Issue #63, S28b). */
  readonly knowledgeFromBook?: number;
  /** Open knowledge candidates citing the Book's manuscript (Issue #63 review): held back while it is not a member. */
  readonly knowledgeCandidatesFromBook?: number;
}

/** The Book's Learning Material as the preview names it (SER-007): how many, and how many the editor has decided. */
export function seriesLearningFacts(materials: ReadonlyArray<{ readonly state: string }>): Pick<SeriesImpactFacts, 'learningMaterials' | 'learningDecided'> {
  return { learningMaterials: materials.length, learningDecided: materials.filter((material) => material.state === 'decided').length };
}

function impactGroup(key: SeriesImpactGroupProjection['key'], changes: string[], unchanged: string[]): SeriesImpactGroupProjection {
  const title = SERIES_IMPACT_GROUPS.find((group) => group.key === key)!.title;
  return { key, title, changes, unchanged };
}

/**
 * The Series Membership Impact Preview (SER-003 to SER-007): what the change does and what it leaves as it is, in four groups
 * that are never compressed into one. Membership changes only later explicit Series-scope selection; Runs already frozen,
 * governed knowledge and learning records, and history stay exactly as they are.
 */
export function seriesMembershipImpact(kind: SeriesMembershipChangeKind, facts: SeriesImpactFacts): SeriesImpactGroupProjection[] {
  const book = `《${facts.bookTitle}》`;
  const series = `书系「${facts.seriesTitle}」`;
  const runs = facts.seriesScopedRuns === 0
    ? `现在没有使用${series}范围、已授权或正在运行的任务。`
    : `${facts.seriesScopedRuns} 个使用${series}范围的任务已授权或正在运行。`;
  const knowledge = (facts.knowledgeFromBook ?? 0) === 0 ? [] : [`${series}的书系知识里有 ${facts.knowledgeFromBook} 个条目取自${book}的稿件；它们留在书系知识中不变。`];
  const candidates = facts.knowledgeCandidatesFromBook ?? 0;
  const learning = facts.learningMaterials === 0
    ? `${book}还没有学习材料。`
    : `${book}有 ${facts.learningMaterials} 项学习材料，其中 ${facts.learningDecided} 项已决定学习准入。`;
  if (kind === 'add') {
    return [
      impactGroup('future-tasks', [`以后新建任务时，可以明确选用${series}的范围，其中会包括${book}。`],
        [`不会把${book}自动加进任何任务，也不会因此授权运行、让其他图书读到它的原文或发给模型服务。`]),
      impactGroup('runs', [], [runs, '已授权或正在运行的任务按各自冻结的范围继续，计划不会被改动。']),
      impactGroup('knowledge-learning', candidates === 0 ? [] : [`来自${book}稿件、尚未纳入的 ${candidates} 个书系知识候选项重新可以审阅纳入。`],
        [...knowledge, learning, '书系知识、学习准入和学习记录各有自己的决定；加入书系不会纳入、启用或删除它们。']),
      impactGroup('history', ['追加一条书系成员变更记录，书系和图书两边都能查看。'], ['已完成的任务、结果、决定和以前的记录都保持原样。']),
    ];
  }
  return [
    impactGroup('future-tasks', [`以后新建任务时，${series}的范围不再包括${book}。`], [`${book}自己的任务照旧。`]),
    impactGroup('runs', [], [runs, '已经冻结的任务范围不会因移出而改变，任务也不会被取消。']),
    // What it holds back says so (SER-003, SER-007; Issue #63 review): candidates citing the Book wait until it rejoins.
    impactGroup('knowledge-learning', candidates === 0 ? [] : [`来自${book}稿件、尚未纳入的 ${candidates} 个书系知识候选项在它重新加入书系前不能纳入。`],
      [...knowledge, learning, '书系知识、学习准入和学习记录各有自己的决定；移出书系不会删除或改动它们。']),
    impactGroup('history', ['追加一条书系成员变更记录，书系和图书两边都能查看。'], [`${book}和书系以前的记录都不会删除。`]),
  ];
}

/** The digest a preview carries: the change, governing versions, the chain it follows and every line it shows. */
export function seriesPreviewDigest(input: {
  readonly seriesId: string;
  readonly bookId: string;
  readonly kind: SeriesMembershipChangeKind;
  readonly chainHead: string | null;
  readonly governingDigest: string;
  readonly groups: ReadonlyArray<SeriesImpactGroupProjection>;
}): string {
  return sha256Hex(canonicalJson({ schema: PREVIEW_SCHEMA, ...input }));
}

function isImpact(value: unknown): value is SeriesImpactGroupProjection[] {
  return Array.isArray(value) && value.length === SERIES_IMPACT_GROUPS.length && value.every((group, index) =>
    isRecord(group) && group.key === SERIES_IMPACT_GROUPS[index]!.key && group.title === SERIES_IMPACT_GROUPS[index]!.title &&
    Array.isArray(group.changes) && group.changes.every((line) => typeof line === 'string') &&
    Array.isArray(group.unchanged) && group.unchanged.every((line) => typeof line === 'string'));
}

/** Why 加入书系 cannot go on: the Book already is a member. */
export function seriesMemberAlready(book: string, series: string): string {
  return `《${book}》已经在书系「${series}」中。`;
}

/** Why 移出书系 cannot go on: the Book is not a member. */
export function seriesMemberAbsent(book: string, series: string): string {
  return `《${book}》不在书系「${series}」中。`;
}

export class SeriesLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Series-scoped Tasks are a projection of the existing plan records, never another scope ledger. */
  tasks(seriesId: string): NonNullable<import('../shared/protocol.js').SeriesProjection['tasks']> {
    return this.#db.prepare(`SELECT DISTINCT t.task_intent_id, t.book_id, b.title book_title, t.kind, t.goal, r.run_record_id
      FROM analysis_plan_records p JOIN analysis_task_intents t ON t.task_intent_id = p.task_intent_id
      JOIN books b ON b.book_id = t.book_id LEFT JOIN analysis_run_records r ON r.task_intent_id = t.task_intent_id
      JOIN json_each(p.canonical_json, '$.seriesScopes') s ON json_extract(s.value, '$.seriesId') = ?
      WHERE p.component = 'run-source-scope' AND p.plan_version = (SELECT max(v.plan_version) FROM analysis_plan_records v WHERE v.task_intent_id = p.task_intent_id)
      ORDER BY t.created_at DESC, t.task_intent_id DESC LIMIT 100`).all(seriesId).map((row) => ({
      taskIntentId: String(row.task_intent_id), bookId: String(row.book_id), bookTitle: String(row.book_title), kind: String(row.kind), title: String(row.goal),
      runRecordId: row.run_record_id === null ? null : String(row.run_record_id),
    }));
  }

  /**
   * The Runs whose authorized plan froze this Series and that are still authorized, waiting or running (SER-006): a finished,
   * failed, stopped or cancelled Run keeps its frozen scope as history and is not counted.
   */
  liveTaskRuns(seriesId: string): number {
    const row = this.#db.prepare(`SELECT count(DISTINCT r.run_record_id) count FROM analysis_run_records r
      JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
      JOIN analysis_plan_versions v ON v.task_intent_id = r.task_intent_id AND v.plan_envelope_sha256 = a.plan_envelope_sha256
      JOIN analysis_plan_records p ON p.task_intent_id = r.task_intent_id AND p.plan_version = v.ordinal AND p.component = 'run-source-scope'
      JOIN json_each(p.canonical_json, '$.seriesScopes') s ON json_extract(s.value, '$.seriesId') = ?
      WHERE (SELECT st.state FROM analysis_run_states st WHERE st.run_record_id = r.run_record_id ORDER BY st.sequence DESC LIMIT 1)
        NOT IN ('completed', 'completed-with-gaps', 'failed', 'interrupted', 'cancelled', 'blocked-before-dispatch')`).get(seriesId) as SqlRow;
    return Number(row.count);
  }

  /** Up to `limit` Series by name after the one named, each verified: a page of 书系, in the database's own order. */
  listAfter(after: { readonly title: string; readonly seriesId: string } | null, limit: number): StoredSeries[] {
    const rows = after === null
      ? this.#db.prepare('SELECT * FROM series ORDER BY title, series_id LIMIT ?').all(limit)
      : this.#db.prepare('SELECT * FROM series WHERE title > ? OR (title = ? AND series_id > ?) ORDER BY title, series_id LIMIT ?')
        .all(after.title, after.title, after.seriesId, limit);
    return (rows as SqlRow[]).map((row) => this.#series(row));
  }

  /** One Series, or `null` when there is none by that identity. */
  find(seriesId: string): StoredSeries | null {
    const row = this.#db.prepare('SELECT * FROM series WHERE series_id = ?').get(seriesId) as SqlRow | undefined;
    return row === undefined ? null : this.#series(row);
  }

  #series(row: SqlRow): StoredSeries {
    const json = String(row.canonical_json);
    requireSeries(sha256Hex(json) === String(row.sha256), 'SERIES_RECORD_INVALID', INVALID);
    const record = parseStoredJson(json, () => new SeriesError('SERIES_RECORD_INVALID', INVALID));
    requireSeries(isRecord(record) && record.schema === SERIES_SCHEMA && record.seriesId === row.series_id && record.title === row.title &&
      titleKey(String(row.title)) === row.title_key && record.note === row.note && record.createdAt === row.created_at && record.actor === ACTOR,
    'SERIES_RECORD_INVALID', INVALID);
    return { seriesId: String(row.series_id), title: String(row.title), note: String(row.note), createdAt: String(row.created_at) };
  }

  /** 新建书系, inside the caller's transaction: refused when the name or 说明 is not one, or the house has a Series by that name. */
  create(input: { readonly title: unknown; readonly note: unknown }): StoredSeries {
    const title = seriesTitle(input.title);
    requireSeries(title !== null, 'SERIES_TITLE_INVALID', `书系名称要 1–${MAX_SERIES_TITLE_CHARACTERS} 个字，写在一行里。`);
    const note = seriesNote(input.note);
    requireSeries(note !== null, 'SERIES_NOTE_INVALID', `说明最多 ${MAX_SERIES_NOTE_CHARACTERS} 个字。`);
    const key = titleKey(title);
    requireSeries(this.#db.prepare('SELECT 1 FROM series WHERE title_key = ?').get(key) === undefined, 'SERIES_TITLE_TAKEN', `已经有名为「${title}」的书系了。`);
    const seriesId = randomUUID();
    const createdAt = new Date().toISOString();
    const record = canonicalRecord({ schema: SERIES_SCHEMA, seriesId, title, note, actor: ACTOR, createdAt });
    this.#db.prepare('INSERT INTO series(series_id, title, title_key, note, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(seriesId, title, key, note, createdAt, record.json, record.digest);
    return { seriesId, title, note, createdAt };
  }

  /** Validate a pair's complete chain while retaining only its latest change. */
  latest(seriesId: string, bookId: string): StoredMembershipChange | null {
    const rows = this.#db.prepare('SELECT * FROM series_membership_changes WHERE series_id = ? AND book_id = ? ORDER BY ordinal')
      .iterate(seriesId, bookId);
    let latest: StoredMembershipChange | null = null;
    for (const entry of this.#verified(rows)) latest = entry;
    return latest;
  }

  /** Validate every pair in order, keeping only the requested newest-first page and an exact total. */
  historyPage(filter: { readonly seriesId: string } | { readonly bookId: string }, after: SeriesHistoryCursor | null,
    limit: number): { entries: StoredMembershipChange[]; count: number } {
    const rows = 'seriesId' in filter
      ? this.#db.prepare('SELECT * FROM series_membership_changes WHERE series_id = ? ORDER BY book_id, ordinal').iterate(filter.seriesId)
      : this.#db.prepare('SELECT * FROM series_membership_changes WHERE book_id = ? ORDER BY series_id, ordinal').iterate(filter.bookId);
    const entries: StoredMembershipChange[] = [];
    let count = 0;
    for (const entry of this.#verified(rows)) {
      count += 1;
      if (after !== null && seriesHistoryOrder(entry, after) <= 0) continue;
      const insertion = entries.findIndex((kept) => seriesHistoryOrder(entry, kept) < 0);
      if (insertion >= 0) entries.splice(insertion, 0, entry);
      else if (entries.length < limit) entries.push(entry);
      if (entries.length > limit) entries.pop();
    }
    return { entries, count };
  }

  /** Rows are contiguous by Series/Book and ascending ordinal; never retain earlier chains. */
  *#verified(rows: Iterable<SqlRow>): Generator<StoredMembershipChange> {
    let before: StoredMembershipChange | null = null;
    for (const row of rows) {
      if (before?.seriesId !== row.series_id || before?.bookId !== row.book_id) before = null;
      const json = String(row.canonical_json);
      requireSeries(sha256Hex(json) === String(row.sha256), 'SERIES_RECORD_INVALID', INVALID);
      const record = parseStoredJson(json, () => new SeriesError('SERIES_RECORD_INVALID', INVALID));
      const ordinal = Number(row.ordinal);
      const kind = row.kind === 'add' ? 'add' : 'remove';
      requireSeries(isRecord(record) && record.schema === CHANGE_SCHEMA && record.changeId === row.change_id && record.seriesId === row.series_id &&
        record.bookId === row.book_id && record.ordinal === ordinal && record.kind === row.kind && record.priorMember === (kind === 'remove') &&
        record.newMember === (kind === 'add') && record.previewDigest === row.preview_digest && isImpact(record.impact) &&
        record.recordedAt === row.recorded_at && record.actor === ACTOR &&
        (record.supersedes ?? null) === (row.supersedes_change_id ?? null) && (record.supersedes ?? null) === (before?.changeId ?? null) &&
        ordinal === (before?.ordinal ?? 0) + 1,
      'SERIES_RECORD_INVALID', INVALID);
      const entry: StoredMembershipChange = {
        changeId: String(row.change_id),
        seriesId: String(row.series_id),
        bookId: String(row.book_id),
        ordinal,
        kind,
        previewDigest: String(row.preview_digest),
        impact: record.impact as SeriesImpactGroupProjection[],
        recordedAt: String(row.recorded_at),
      };
      before = entry;
      yield entry;
    }
  }

  /**
   * The Books a Series holds now: each pair whose newest change is `加入书系`, with when it was — newest joined first, so a
   * Book just added heads the first page (Issue #63 review).
   */
  *members(seriesId: string): Generator<{ readonly bookId: string; readonly joinedAt: string }> {
    for (const row of this.#db.prepare(`SELECT c.book_id, c.recorded_at FROM series_membership_changes c
      WHERE c.series_id = ? AND c.kind = 'add' AND c.ordinal = (
        SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id)
      ORDER BY c.recorded_at DESC, c.book_id DESC`).iterate(seriesId)) {
      yield { bookId: String(row.book_id), joinedAt: String(row.recorded_at) };
    }
  }

  /** The Series a Book is in now, by name, with when it joined each. */
  seriesOf(bookId: string, after: SeriesListCursor | null = null): {
    memberships: Array<{ readonly seriesId: string; readonly title: string; readonly joinedAt: string }>;
    count: number;
    nextCursor: SeriesListCursor | null;
  } {
    const memberships: Array<{ seriesId: string; title: string; joinedAt: string }> = [];
    let count = 0;
    if (this.#db.prepare(TABLE_PRESENT).get() === undefined) return { memberships, count, nextCursor: null };
    for (const _change of this.#verified(this.#db.prepare('SELECT * FROM series_membership_changes WHERE book_id = ? ORDER BY series_id, ordinal').iterate(bookId))) {
      // Validate every chain, including removed pairs and rows outside this page, without retaining history.
    }
    for (const row of this.#db.prepare(`SELECT s.*, c.recorded_at AS joined_at,
        CASE WHEN ? IS NULL OR s.title > ? OR (s.title = ? AND s.series_id > ?) THEN 1 ELSE 0 END AS after_cursor
      FROM series_membership_changes c LEFT JOIN series s ON s.series_id = c.series_id
      WHERE c.book_id = ? AND c.kind = 'add' AND c.ordinal = (
        SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id)
      ORDER BY s.title, s.series_id`).iterate(after?.title ?? null, after?.title ?? null, after?.title ?? null, after?.seriesId ?? null, bookId)) {
      const series = this.#series(row);
      count += 1;
      if (Number(row.after_cursor) === 1 && memberships.length < MAX_BOOK_SERIES_MEMBERSHIPS + 1) {
        memberships.push({ seriesId: series.seriesId, title: series.title, joinedAt: String(row.joined_at) });
      }
    }
    const { page, more } = weighedPage(memberships, MAX_BOOK_SERIES_MEMBERSHIPS);
    const last = page.at(-1);
    return { memberships: page, count, nextCursor: more && last !== undefined ? { title: last.title, seriesId: last.seriesId } : null };
  }

  /** How many Books this exact Series holds now, without building a house-wide map. */
  memberCount(seriesId: string): number {
    const row = this.#db.prepare(`SELECT count(*) count FROM series_membership_changes c
      WHERE c.series_id = ? AND c.kind = 'add' AND c.ordinal = (
        SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id)
      `).get(seriesId)!;
    return Number(row.count);
  }

  /**
   * 加入书系 or 移出书系, inside the caller's transaction, with the preview the editor saw: the caller has recomputed it and
   * compared digests. Refused when the Book already is, or is not, a member.
   */
  record(input: {
    readonly seriesId: string;
    readonly bookId: string;
    readonly kind: SeriesMembershipChangeKind;
    readonly previewDigest: string;
    readonly impact: ReadonlyArray<SeriesImpactGroupProjection>;
    /** The Book's and the Series' names, for a refusal to say which. */
    readonly names: { readonly book: string; readonly series: string };
  }): StoredMembershipChange {
    requireSeries((input.kind === 'add' || input.kind === 'remove') && /^[0-9a-f]{64}$/u.test(input.previewDigest) && isImpact(input.impact),
      'SERIES_CHANGE_INVALID', '书系成员变更无效。');
    const latest = this.latest(input.seriesId, input.bookId);
    const member = latest?.kind === 'add';
    requireSeries(input.kind !== 'add' || !member, 'SERIES_MEMBER_ALREADY', seriesMemberAlready(input.names.book, input.names.series));
    requireSeries(input.kind !== 'remove' || member, 'SERIES_MEMBER_ABSENT', seriesMemberAbsent(input.names.book, input.names.series));
    const changeId = randomUUID();
    const ordinal = (latest?.ordinal ?? 0) + 1;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: CHANGE_SCHEMA,
      changeId,
      seriesId: input.seriesId,
      bookId: input.bookId,
      ordinal,
      kind: input.kind,
      priorMember: member,
      newMember: input.kind === 'add',
      previewDigest: input.previewDigest,
      impact: input.impact,
      supersedes: latest?.changeId ?? null,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO series_membership_changes(change_id, series_id, book_id, ordinal, kind, preview_digest, supersedes_change_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(changeId, input.seriesId, input.bookId, ordinal, input.kind, input.previewDigest, latest?.changeId ?? null, recordedAt, record.json, record.digest);
    return { changeId, seriesId: input.seriesId, bookId: input.bookId, ordinal, kind: input.kind, previewDigest: input.previewDigest, impact: input.impact, recordedAt };
  }
}

/**
 * 书库's search by 书系 (BOOK-006, IA-008): the SQL that keeps a Book now in a Series whose name holds the words, over
 * `books b`, for one parameter.
 */
export const SERIES_TITLE_FILTER_SQL = `EXISTS (SELECT 1 FROM series_membership_changes c JOIN series s ON s.series_id = c.series_id
  WHERE c.book_id = b.book_id AND c.kind = 'add' AND c.ordinal = (
    SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id)
  AND instr(lower(s.title), lower(?)) > 0)`;

// ---- 书系 operations of the store (Issue #63 S28a/S28b, Issue #64 S29b; moved from store.ts by Issue #1172) ---------------------

/** The store state and calls the 书系 operations use, lent by EditorialStore: its fields read live through getters, its own methods bound. */
export interface SeriesStoreHost {
  readonly authority: DatabaseSync;
  readonly editorialMarks: EditorialMarkStore;
  evaluationBookTitle(bookId: string): string;
  learningCandidates(bookId: string, withExcerpt: boolean, includeWord?: boolean): IterableIterator<LearningMaterialCandidate>;
  readonly learningEligibility: LearningEligibilityLedger;
  markCall<T>(operation: () => T): T;
  readonly reviewRuns: ReviewRunStore;
  readonly series: SeriesLedger;
  seriesCall<T>(operation: () => T): T;
  readonly seriesExclusions: SeriesExclusionLedger;
  readonly seriesKnowledge: SeriesKnowledgeLedger;
  seriesMembersPage(seriesId: string, after: SeriesMembersCursor | null): SeriesMembersPageProjection & { count: number };
  seriesScopedTaskReach(seriesId: string, covers: (material: SeriesKnowledgeMaterial) => boolean): {
    readonly active: ReadonlyArray<{ readonly taskIntentId: string; readonly route: string }>;
    readonly completed: ReadonlyArray<{ readonly taskIntentId: string; readonly route: string }>;
  };
  transaction<T>(db: DatabaseSync, operation: () => T): T;
}

/** How many items or Runs one line of an exclusion's impact preview names before it gives the count. */
const NAMED_EXCLUSION_ENTRIES = 5;

/** 书系: one page of the house's Series, by name, with how many Books each holds now (Issue #63 review). A read. */
export function inspectSeriesList(host: SeriesStoreHost, after: SeriesListCursor | null = null): SeriesListProjection {
  return host.seriesCall(() => {
    requireStore(after === null || (UUID_PATTERN.test(after.seriesId) && typeof after.title === 'string' && after.title.length >= 1 &&
      after.title.length <= 2 * MAX_SERIES_TITLE_CHARACTERS), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const rows = host.series.listAfter(after, MAX_SERIES_LIST_PAGE + 1).map((entry) => ({ ...entry, memberCount: host.series.memberCount(entry.seriesId) }));
    const { page, more } = weighedPage(rows, MAX_SERIES_LIST_PAGE);
    const last = page.at(-1);
    return { series: page, nextCursor: more && last !== undefined ? { title: last.title, seriesId: last.seriesId } : null };
  });
}

/** 新建书系: a name the house has not used, and an optional 说明. It holds no Book until one is added; the answer is it alone. */
export function createSeries(host: SeriesStoreHost, input: CreateSeriesInput): SeriesCreationProjection {
  return host.seriesCall(() => {
    const created = host.transaction(host.authority, () => host.series.create(input));
    return { seriesId: created.seriesId, completionLabel: `已新建书系「${created.title}」`, series: { ...created, memberCount: 0 } };
  });
}

/**
 * One Series' 成员与共享范围 (SER-001): the first page of its members and of its membership changes, and how many Books it
 * and the house hold. A read.
 */
export function inspectSeries(host: SeriesStoreHost, seriesId: string): SeriesProjection {
  return host.seriesCall(() => seriesProjection(host, requireStoredSeries(host, seriesId)));
}

/** `更多成员…`: the next page of a Series' members, newest joined first (Issue #63 review). A read. */
export function inspectSeriesMembers(host: SeriesStoreHost, seriesId: string, after: SeriesMembersCursor | null): SeriesMembersPageProjection {
  return host.seriesCall(() => {
    const series = requireStoredSeries(host, seriesId);
    requireStore(after === null || (UUID_PATTERN.test(after.bookId) && typeof after.joinedAt === 'string' && !Number.isNaN(Date.parse(after.joinedAt))),
      'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const { members, nextCursor } = host.seriesMembersPage(series.seriesId, after);
    return { members, nextCursor };
  });
}

/**
 * 加入书系…'s Books (Issue #63 review): a page of every Book the Series does not hold, by title, narrowed to titles holding
 * the editor's words when they give any — so every Book can be found and added, however many the house holds. A read.
 */
export function inspectSeriesCandidates(host: SeriesStoreHost, seriesId: string, text: string, after: SeriesCandidatesCursor | null): SeriesCandidatesProjection {
  return host.seriesCall(() => {
    const series = requireStoredSeries(host, seriesId);
    const words = typeof text === 'string' && text.isWellFormed() ? text.normalize('NFC').trim() : null;
    requireStore(words !== null && [...words].length <= MAX_SERIES_CANDIDATE_QUERY_CHARACTERS && !/[\r\n]/u.test(words), 'SERIES_QUERY_INVALID',
      `查找的书名字词最多 ${MAX_SERIES_CANDIDATE_QUERY_CHARACTERS} 个字，写在一行里。`);
    requireStore(after === null || (UUID_PATTERN.test(after.bookId) && typeof after.title === 'string' && after.title.length >= 1 && after.title.length <= 180),
      'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const rows = host.authority.prepare(
      `SELECT b.book_id, b.title FROM books b
         WHERE NOT EXISTS (
             SELECT 1 FROM series_membership_changes c WHERE c.series_id = ? AND c.book_id = b.book_id AND c.kind = 'add'
               AND c.ordinal = (SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id))
           AND (? = '' OR instr(lower(b.title), lower(?)) > 0)
           AND (? IS NULL OR b.title > ? OR (b.title = ? AND b.book_id > ?))
         ORDER BY b.title, b.book_id LIMIT ?`,
    ).all(series.seriesId, words, words, after?.title ?? null, after?.title ?? null, after?.title ?? null, after?.bookId ?? null,
      MAX_SERIES_CANDIDATES_PAGE + 1) as StoreSqlRow[];
    const { page, more } = weighedPage(rows.map((row) => ({ bookId: asString(row.book_id), title: asString(row.title) })), MAX_SERIES_CANDIDATES_PAGE);
    const last = page.at(-1);
    return { candidates: page, nextCursor: more && last !== undefined ? { title: last.title, bookId: last.bookId } : null };
  });
}

/** `更早的记录…`: the next page of one Series' or one Book's membership change records, newest first (Issue #63 review). A read. */
export function inspectSeriesHistory(host: SeriesStoreHost, filter: { readonly seriesId: string | null; readonly bookId: string | null }, after: SeriesHistoryCursor | null): SeriesHistoryPageProjection {
  return host.seriesCall(() => {
    requireStore((filter.seriesId === null) !== (filter.bookId === null), 'SERIES_HISTORY_INVALID', '成员变更记录要按一个书系或一本书读取。');
    requireStore(after === null || (typeof after.recordedAt === 'string' && !Number.isNaN(Date.parse(after.recordedAt)) && UUID_PATTERN.test(after.seriesId) &&
      UUID_PATTERN.test(after.bookId) && Number.isSafeInteger(after.ordinal) && after.ordinal >= 1), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const read = filter.seriesId !== null
      ? seriesHistoryPage(host, { seriesId: requireStoredSeries(host, filter.seriesId).seriesId }, after)
      : seriesHistoryPage(host, { bookId: filter.bookId! }, after);
    return { history: read.history, nextCursor: read.nextCursor };
  });
}

/**
 * The Series Membership Impact Preview (SER-003 to SER-007) for 加入书系 or 移出书系 of one exact Book and Series. A read:
 * nothing is recorded until the editor commits the change against this preview's digest.
 */
export function previewSeriesMembershipChange(host: SeriesStoreHost, input: PreviewSeriesMembershipChangeInput): SeriesMembershipPreviewProjection {
  return host.seriesCall(() => seriesPreview(host, input));
}

/**
 * 加入书系 or 移出书系 (SER-008 to SER-010): the preview is recomputed inside the transaction, and a preview the membership
 * or a governing record has moved past is refused rather than applied; the change record keeps what the preview showed.
 * The answer is that record alone (Issue #63 review): the page reads the Series again, each list a page at a time.
 */
export function changeSeriesMembership(host: SeriesStoreHost, input: ChangeSeriesMembershipInput): SeriesMembershipChangeResultProjection {
  return host.seriesCall(() => {
    const recorded = host.transaction(host.authority, () => {
      const preview = seriesPreview(host, input);
      requireStore(preview.previewDigest === input.previewDigest, 'SERIES_PREVIEW_STALE',
        '预览之后，书系成员或相关记录有了变化；请重新查看影响，再决定。');
      const change = host.series.record({
        seriesId: preview.seriesId,
        bookId: preview.bookId,
        kind: preview.kind,
        previewDigest: preview.previewDigest,
        impact: preview.groups,
        names: { book: preview.bookTitle, series: preview.seriesTitle },
      });
      return { change, preview };
    });
    const { change, preview } = recorded;
    return {
      changeId: change.changeId,
      completionLabel: `${change.kind === 'add' ? '已加入' : '已移出'}书系「${preview.seriesTitle}」：《${preview.bookTitle}》`,
      change: seriesChange(host, change, preview.seriesTitle, preview.bookTitle),
    };
  });
}

/**
 * A Book's side of 书系 (SER-009): the Series it is in now — at most `MAX_BOOK_SERIES_MEMBERSHIPS`, with how many in all —
 * and the first page of its membership changes, newest first. A read.
 */
export function inspectBookSeries(host: SeriesStoreHost, bookId: string, after: SeriesListCursor | null = null): BookSeriesProjection {
  return host.seriesCall(() => {
    host.evaluationBookTitle(bookId);
    requireStore(after === null || (typeof after.title === 'string' && after.title.isWellFormed() &&
      after.title.length >= 1 && after.title.length <= 2 * MAX_SERIES_TITLE_CHARACTERS &&
      typeof after.seriesId === 'string' && UUID_PATTERN.test(after.seriesId)), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const memberships = host.series.seriesOf(bookId, after);
    const history = seriesHistoryPage(host, { bookId }, null);
    return {
      bookId,
      memberships: memberships.memberships,
      membershipCount: memberships.count,
      membershipsNext: memberships.nextCursor,
      history: history.history,
      historyCount: history.count,
      historyNext: history.nextCursor,
    };
  });
}

export function requireStoredSeries(host: SeriesStoreHost, seriesId: string): StoredSeries {
  requireStore(typeof seriesId === 'string' && UUID_PATTERN.test(seriesId), 'SERIES_INVALID', '书系标识无效。');
  const found = host.series.find(seriesId);
  requireStore(found !== null, 'SERIES_NOT_FOUND', '书系不存在。');
  return found;
}

export function seriesPreview(host: SeriesStoreHost, input: PreviewSeriesMembershipChangeInput): SeriesMembershipPreviewProjection {
  const series = requireStoredSeries(host, input.seriesId);
  const bookTitle = host.evaluationBookTitle(input.bookId);
  requireStore(input.kind === 'add' || input.kind === 'remove', 'SERIES_CHANGE_INVALID', '书系成员变更只有加入书系和移出书系。');
  const latest = host.series.latest(series.seriesId, input.bookId);
  const member = latest?.kind === 'add';
  requireStore(input.kind !== 'add' || !member, 'SERIES_MEMBER_ALREADY', seriesMemberAlready(bookTitle, series.title));
  requireStore(input.kind !== 'remove' || member, 'SERIES_MEMBER_ABSENT', seriesMemberAbsent(bookTitle, series.title));
  // Counts alone cannot detect a new eligibility decision (including a change back to the old choice).
  // Hash each exact material and its immutable decision ordinal without retaining another collection.
  const governing = createHash('sha256');
  let learningMaterials = 0;
  let learningDecided = 0;
  for (const material of host.learningEligibility.projectEntries(input.bookId, host.learningCandidates(input.bookId, false))) {
    learningMaterials += 1;
    if (material.state === 'decided') learningDecided += 1;
    governing.update(storeCanonicalJson({ materialKey: material.materialKey, digest: material.digest, decisions: material.decisions }));
    governing.update('\n');
  }
  // Knowledge versions govern the same preview even when a revision or candidate edit leaves every count unchanged.
  for (const item of host.seriesKnowledge.items(series.seriesId)) {
    governing.update(storeCanonicalJson({ kind: 'series-knowledge', itemId: item.itemId, revisionId: item.current.revisionId }));
    governing.update('\n');
  }
  for (const candidate of host.seriesKnowledge.open(series.seriesId)) {
    governing.update(storeCanonicalJson({ kind: 'series-candidate', candidateId: candidate.candidateId, versionId: candidate.versionId }));
    governing.update('\n');
  }
  const groups = seriesMembershipImpact(input.kind, {
    seriesTitle: series.title,
    bookTitle,
    // Runs whose authorized plan froze this Series and have not ended (Issue #64, 7b; SER-006).
    seriesScopedRuns: host.series.liveTaskRuns(series.seriesId),
    learningMaterials,
    learningDecided,
    knowledgeFromBook: host.seriesKnowledge.itemsFromBook(series.seriesId, input.bookId),
    knowledgeCandidatesFromBook: host.seriesKnowledge.openFromBook(series.seriesId, input.bookId),
  });
  return {
    seriesId: series.seriesId,
    seriesTitle: series.title,
    bookId: input.bookId,
    bookTitle,
    kind: input.kind,
    actionLabel: input.kind === 'add' ? '加入书系' : '移出书系',
    groups,
    previewDigest: seriesPreviewDigest({ seriesId: series.seriesId, bookId: input.bookId, kind: input.kind,
      chainHead: latest?.changeId ?? null, governingDigest: governing.digest('hex'), groups }),
  };
}

export function seriesProjection(host: SeriesStoreHost, series: StoredSeries): SeriesProjection {
  const members = host.seriesMembersPage(series.seriesId, null);
  const tasks = host.series.tasks(series.seriesId);
  const history = seriesHistoryPage(host, { seriesId: series.seriesId }, null);
  return {
    ...series,
    memberCount: members.count,
    bookCount: Number((host.authority.prepare('SELECT count(*) count FROM books').get() as StoreSqlRow).count),
    members: members.members,
    membersNext: members.nextCursor,
    history: history.history,
    historyCount: history.count,
    historyNext: history.nextCursor,
    knowledge: seriesKnowledgeProjection(host, series.seriesId),
    exclusions: seriesExclusionsProjection(host, series.seriesId),
    ...(tasks.length === 0 ? {} : { tasks }),
  };
}

/** One page of one Series' or one Book's membership change records after the one named, newest first, and how many in all. */
export function seriesHistoryPage(host: SeriesStoreHost, filter: { readonly seriesId: string } | { readonly bookId: string }, after: SeriesHistoryCursor | null):
SeriesHistoryPageProjection & { count: number } {
  const { entries: rest, count } = host.series.historyPage(filter, after, MAX_SERIES_HISTORY_PAGE + 1);
  const seriesTitles = new Map<string, string>();
  const bookTitles = new Map<string, string>();
  const titleOf = (titles: Map<string, string>, key: string, read: () => string): string => {
    if (!titles.has(key)) titles.set(key, read());
    return titles.get(key)!;
  };
  const projected = rest.map((change) => seriesChange(host, 
    change,
    titleOf(seriesTitles, change.seriesId, () => requireStoredSeries(host, change.seriesId).title),
    titleOf(bookTitles, change.bookId, () => host.evaluationBookTitle(change.bookId)),
  ));
  const { page, more } = weighedPage(projected, MAX_SERIES_HISTORY_PAGE);
  const last = rest[page.length - 1];
  return {
    history: page,
    nextCursor: more && last !== undefined ? { recordedAt: last.recordedAt, seriesId: last.seriesId, bookId: last.bookId, ordinal: last.ordinal } : null,
    count,
  };
}

export function seriesChange(host: SeriesStoreHost, change: StoredMembershipChange, seriesTitle: string, bookTitle: string): SeriesMembershipChangeProjection {
  return {
    changeId: change.changeId,
    seriesId: change.seriesId,
    seriesTitle,
    bookId: change.bookId,
    bookTitle,
    kind: change.kind,
    label: change.kind === 'add' ? '加入书系' : '移出书系',
    priorMember: change.kind === 'remove',
    newMember: change.kind === 'add',
    actor: '本机编辑',
    recordedAt: change.recordedAt,
    impact: change.impact,
  };
}

/**
 * 添加检索排除…'s choices (SER-020): a page of what one kind of target may name in this Series — its knowledge items by name,
 * the eight classes, its member Books newest joined first, or its members' Source Versions newest first — each saying whether
 * an exclusion in force names it already. A read.
 */
export function inspectSeriesExclusionTargets(host: SeriesStoreHost, input: InspectSeriesExclusionTargetsInput): SeriesExclusionTargetsProjection {
  return host.seriesCall(() => {
    const series = requireStoredSeries(host, input.seriesId);
    requireStore(isSeriesExclusionTargetKind(input.kind), 'SERIES_EXCLUSION_TARGET_INVALID', '检索排除的对象无效。');
    const after = input.after;
    requireStore(after === null || (isRecord(after) && typeof after.key === 'string' && after.key.length <= 400 && typeof after.id === 'string' &&
      after.id.length >= 1 && after.id.length <= 64), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const effective = host.seriesExclusions.effective(series.seriesId);
    const excluded = (kind: SeriesExclusionTargetKind, id: string): boolean => effective.some((entry) => entry.target.kind === kind && entry.target.id === id);
    const rows: Array<{ target: SeriesExclusionTargetProjection; key: string }> = [];
    const limit = MAX_SERIES_EXCLUSION_TARGETS_PAGE + 1;
    if (input.kind === 'knowledge-item') {
      for (const item of host.seriesKnowledge.itemsPage(series.seriesId, '', after === null ? null : { subject: after.key, itemId: after.id }, limit)) {
        rows.push({ key: item.subject, target: seriesExclusionTarget('knowledge-item', item.itemId, { subject: item.subject, knowledgeClass: item.knowledgeClass }) });
      }
    } else if (input.kind === 'knowledge-class') {
      for (const knowledgeClass of SERIES_KNOWLEDGE_CLASSES) rows.push({ key: knowledgeClass, target: seriesExclusionTarget('knowledge-class', knowledgeClass, {}) });
    } else if (input.kind === 'book') {
      for (const member of host.series.members(series.seriesId)) {
        if (after !== null && (member.joinedAt > after.key || (member.joinedAt === after.key && member.bookId >= after.id))) continue;
        rows.push({ key: member.joinedAt, target: seriesExclusionTarget('book', member.bookId, { bookTitle: host.evaluationBookTitle(member.bookId) }) });
        if (rows.length >= limit) break;
      }
    } else {
      for (const row of host.authority.prepare(
        `SELECT sv.source_version_id, sv.display_name, sv.created_at, b.title FROM source_versions sv JOIN books b ON b.book_id = sv.book_id
           WHERE EXISTS (SELECT 1 FROM series_membership_changes c WHERE c.series_id = ? AND c.book_id = sv.book_id AND c.kind = 'add'
               AND c.ordinal = (SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id))
             AND (? IS NULL OR sv.created_at < ? OR (sv.created_at = ? AND sv.source_version_id < ?))
           ORDER BY sv.created_at DESC, sv.source_version_id DESC LIMIT ?`,
      ).all(series.seriesId, after?.key ?? null, after?.key ?? null, after?.key ?? null, after?.id ?? null, limit) as StoreSqlRow[]) {
        rows.push({ key: asString(row.created_at), target: seriesExclusionTarget('source-version', asString(row.source_version_id),
          { displayName: asString(row.display_name), bookTitle: asString(row.title) }) });
      }
    }
    const { page, more } = weighedPage(rows, MAX_SERIES_EXCLUSION_TARGETS_PAGE);
    const last = page.at(-1);
    return {
      kind: input.kind,
      targets: page.map((row) => ({ ...row.target, excluded: excluded(row.target.kind, row.target.id) })),
      nextCursor: more && last !== undefined ? { key: last.key, id: last.target.id } : null,
    };
  });
}

/** `更早的排除记录…`: the next page of one Series' exclusion revisions, newest first. A read. */
export function inspectSeriesExclusionHistory(host: SeriesStoreHost, input: InspectSeriesExclusionHistoryInput): SeriesExclusionHistoryPageProjection {
  return host.seriesCall(() => {
    const series = requireStoredSeries(host, input.seriesId);
    requireStore(isRecord(input.after) && typeof input.after.recordedAt === 'string' && !Number.isNaN(Date.parse(input.after.recordedAt)) &&
      typeof input.after.revisionId === 'string' && UUID_PATTERN.test(input.after.revisionId), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const read = seriesExclusionHistoryPage(host, series.seriesId, input.after);
    return { history: read.history, nextCursor: read.nextCursor };
  });
}

/**
 * 书系检索排除影响预览 (SER-021, SER-022) for 添加检索排除, 修改检索排除 or 停止此排除. A read: nothing is recorded until the
 * editor commits the exclusion against this preview's digest.
 */
export function previewSeriesExclusion(host: SeriesStoreHost, input: PreviewSeriesExclusionInput): SeriesExclusionPreviewProjection {
  return host.seriesCall(() => seriesExclusionPreview(host, input).preview);
}

/**
 * 添加检索排除, 修改检索排除 or 停止此排除 (SER-020 to SER-027): the preview is recomputed inside the transaction and a stale one
 * is refused; the revision keeps what the preview showed. An exclusion takes effect as it is recorded: an approved Run whose
 * reading of the excluded material has not begun stops in the same transaction, and one reading now stops at the guard
 * before its next range. Ending one restores nothing it stopped.
 */
export function recordSeriesExclusion(host: SeriesStoreHost, input: RecordSeriesExclusionInput): SeriesExclusionResultProjection {
  return host.seriesCall(() => {
    const { revision, stoppedRuns } = host.transaction(host.authority, () => {
      const { preview, prior, reach } = seriesExclusionPreview(host, input);
      requireStore(typeof input.previewDigest === 'string' && preview.previewDigest === input.previewDigest, 'SERIES_EXCLUSION_PREVIEW_STALE',
        '预览之后，检索排除、书系知识或相关任务有了变化；请重新查看影响，再决定。');
      const stored = host.seriesExclusions.record({
        seriesId: preview.seriesId,
        action: preview.action,
        prior,
        target: preview.target,
        reason: preview.reason,
        previewDigest: preview.previewDigest,
        impact: preview.groups,
      });
      let stopped = 0;
      if (preview.action === 'add') {
        for (const run of reach.active) {
          if (!run.started && host.reviewRuns.stopForSeriesScope(run.reviewRunId, run.categoryId)) stopped += 1;
        }
      }
      return { revision: stored, stoppedRuns: stopped };
    });
    return {
      exclusionId: revision.exclusionId,
      revisionId: revision.revisionId,
      completionLabel: revision.action === 'add' ? '书系检索排除已生效' : revision.action === 'change' ? '检索排除已修改' : '已停止此排除',
      stoppedRuns,
      revision: seriesExclusionRevision(host, revision),
    };
  });
}

/** What an exclusion target names now, read from the records that own it; refused when this Series cannot name it. */
export function seriesExclusionTargetOf(host: SeriesStoreHost, series: StoredSeries, input: unknown): SeriesExclusionTargetProjection {
  requireStore(isRecord(input) && isSeriesExclusionTargetKind(input.kind) && typeof input.id === 'string', 'SERIES_EXCLUSION_TARGET_INVALID', '检索排除的对象无效。');
  const id = input.id;
  switch (input.kind) {
    case 'knowledge-item': {
      const item = UUID_PATTERN.test(id) ? host.seriesKnowledge.item(id) : null;
      requireStore(item !== null && item.seriesId === series.seriesId, 'SERIES_EXCLUSION_TARGET_NOT_FOUND', `书系「${series.title}」没有这个书系知识条目。`);
      return seriesExclusionTarget('knowledge-item', id, { subject: item.subject, knowledgeClass: item.knowledgeClass });
    }
    case 'knowledge-class':
      requireStore(isSeriesKnowledgeClass(id), 'SERIES_EXCLUSION_TARGET_NOT_FOUND', '没有这个知识类别。');
      return seriesExclusionTarget('knowledge-class', id, {});
    case 'book': {
      requireStore(UUID_PATTERN.test(id), 'SERIES_EXCLUSION_TARGET_INVALID', '检索排除的对象无效。');
      const bookTitle = host.evaluationBookTitle(id);
      requireStore(host.series.latest(series.seriesId, id)?.kind === 'add', 'SERIES_EXCLUSION_NOT_MEMBER',
        `《${bookTitle}》不在书系「${series.title}」中；检索排除只针对这个书系的成员图书。`);
      return seriesExclusionTarget('book', id, { bookTitle });
    }
    case 'source-version': {
      const row = UUID_PATTERN.test(id)
        ? host.authority.prepare('SELECT sv.book_id, sv.display_name, b.title FROM source_versions sv JOIN books b ON b.book_id = sv.book_id WHERE sv.source_version_id = ?').get(id) as StoreSqlRow | undefined
        : undefined;
      requireStore(row !== undefined, 'SERIES_EXCLUSION_TARGET_NOT_FOUND', '没有这个来源版本。');
      requireStore(host.series.latest(series.seriesId, asString(row.book_id))?.kind === 'add', 'SERIES_EXCLUSION_NOT_MEMBER',
        `《${asString(row.title)}》不在书系「${series.title}」中；检索排除只针对这个书系成员图书的来源版本。`);
      return seriesExclusionTarget('source-version', id, { displayName: asString(row.display_name), bookTitle: asString(row.title) });
    }
  }
}

export function seriesExclusionPreview(host: SeriesStoreHost, input: PreviewSeriesExclusionInput): {
  preview: SeriesExclusionPreviewProjection;
  prior: StoredExclusion | null;
  reach: ReturnType<ReviewRunStore['seriesExclusionReach']>;
} {
  const series = requireStoredSeries(host, input.seriesId);
  requireStore(isSeriesExclusionAction(input.action), 'SERIES_EXCLUSION_INVALID', '检索排除只有添加、修改和停止。');
  const reason = seriesExclusionReason(input.reason);
  requireStore(reason !== null, 'SERIES_EXCLUSION_REASON_INVALID', `排除理由最多 ${MAX_SERIES_EXCLUSION_REASON_CHARACTERS} 个字，写在一行里。`);
  const effective = host.seriesExclusions.effective(series.seriesId);
  let prior: StoredExclusion | null = null;
  let target: SeriesExclusionTargetProjection;
  if (input.action === 'add') {
    requireStore(input.exclusionId === null && input.target !== null, 'SERIES_EXCLUSION_INVALID', '添加检索排除要指定一个对象。');
    target = seriesExclusionTargetOf(host, series, input.target);
    requireStore(!effective.some((entry) => entry.target.kind === target.kind && entry.target.id === target.id), 'SERIES_EXCLUSION_ALREADY',
      `${target.label}已经排除在书系「${series.title}」的检索之外。`);
    requireStore(effective.length < MAX_SERIES_EXCLUSIONS, 'SERIES_EXCLUSION_LIMIT',
      `书系「${series.title}」已有 ${MAX_SERIES_EXCLUSIONS} 条检索排除在生效；先停止不再需要的，再添加。`);
  } else {
    requireStore(typeof input.exclusionId === 'string' && UUID_PATTERN.test(input.exclusionId) && input.target === null, 'SERIES_EXCLUSION_INVALID',
      '要指定修改或停止哪一条检索排除。');
    prior = host.seriesExclusions.exclusion(series.seriesId, input.exclusionId);
    requireStore(prior !== null, 'SERIES_EXCLUSION_NOT_FOUND', '这条检索排除不存在。');
    requireStore(prior.effective, 'SERIES_EXCLUSION_ENDED', '这条检索排除已经停止；以后的检索已经可以读取它。');
    requireStore(input.action !== 'change' || reason !== prior.current.reason, 'SERIES_EXCLUSION_UNCHANGED', '排除理由没有变化。');
    target = prior.target;
  }
  const covers = (material: SeriesKnowledgeMaterial): boolean => seriesExclusionCovers(series.seriesId, target, material);
  // What the target reaches of the Series' knowledge now, and every version governing the preview, hashed one by one.
  const governing = createHash('sha256');
  const itemsNamed: string[] = [];
  let itemCount = 0;
  // 停止此排除 reopens only what no other exclusion in force still reaches (Issue #64 review).
  const others = prior === null ? [] : effective.filter((entry) => entry.exclusionId !== prior!.exclusionId);
  const stillNamed: string[] = [];
  let stillCount = 0;
  for (const item of host.seriesKnowledge.items(series.seriesId)) {
    const material = knowledgeMaterial(host.authority, { seriesId: series.seriesId, itemId: item.itemId, revisionId: item.current.revisionId });
    requireStore(material !== null, 'SERIES_SCOPE_INVALID', '书系知识来源记录无法核对。');
    if (!covers(material)) continue;
    itemCount += 1;
    if (itemsNamed.length < NAMED_EXCLUSION_ENTRIES) itemsNamed.push(`「${item.subject}」`);
    if (coveringExclusions(others, material).length > 0) {
      stillCount += 1;
      if (stillNamed.length < NAMED_EXCLUSION_ENTRIES) stillNamed.push(`「${item.subject}」`);
    }
    governing.update(storeCanonicalJson({ kind: 'item', itemId: item.itemId, revisionId: item.current.revisionId }));
    governing.update('\n');
  }
  for (const entry of effective) {
    governing.update(storeCanonicalJson({ kind: 'exclusion', exclusionId: entry.exclusionId, revisionId: entry.current.revisionId }));
    governing.update('\n');
  }
  const reach = input.action === 'add' ? host.reviewRuns.seriesExclusionReach(covers) : { active: [], prepared: 0, completed: [] };
  governing.update(storeCanonicalJson({ kind: 'runs', active: reach.active, prepared: reach.prepared, completed: reach.completed }));
  // One entry per Review Run, even where two Books share a title (Issue #64 review).
  const routes = (runs: ReadonlyArray<{ readonly reviewRunId: string; readonly route: string }>): string[] =>
    [...new Map(runs.map((run) => [run.reviewRunId, run.route] as const)).values()];
  // A Series-scoped Run outside 审阅 — an AI7 初评 that froze the Series — is named beside them (Issue #64, 7b; SER-022).
  const tasks = input.action === 'add' ? host.seriesScopedTaskReach(series.seriesId, covers) : { active: [], completed: [] };
  if (tasks.active.length + tasks.completed.length > 0) governing.update(storeCanonicalJson({ kind: 'task-runs', active: tasks.active, completed: tasks.completed }));
  const runRoutes = [...routes(reach.active), ...tasks.active.map((task) => task.route)];
  const completedRoutes = [...routes(reach.completed), ...tasks.completed.map((task) => task.route)];
  const groups = seriesExclusionImpact(input.action, {
    seriesTitle: series.title,
    target,
    reason,
    priorReason: prior?.current.reason ?? null,
    itemsNamed,
    itemCount,
    stillNamed,
    stillCount,
    runsNamed: runRoutes.slice(0, NAMED_EXCLUSION_ENTRIES),
    runCount: runRoutes.length,
    preparedCount: reach.prepared,
    completedNamed: completedRoutes.slice(0, NAMED_EXCLUSION_ENTRIES),
    completedCount: completedRoutes.length,
  });
  const preview: SeriesExclusionPreviewProjection = {
    seriesId: series.seriesId,
    seriesTitle: series.title,
    action: input.action,
    actionLabel: SERIES_EXCLUSION_ACTION_LABELS[input.action],
    exclusionId: prior?.exclusionId ?? null,
    target,
    reason,
    scope: `只限书系「${series.title}」的书系检索`,
    effectiveTime: '记录后立即生效',
    actor: '本机编辑',
    groups,
    previewDigest: seriesExclusionPreviewDigest({
      seriesId: series.seriesId,
      action: input.action,
      exclusionId: prior?.exclusionId ?? null,
      target,
      reason,
      chainHead: prior?.current.revisionId ?? null,
      governingDigest: governing.digest('hex'),
      groups,
    }),
  };
  return { preview, prior, reach };
}

/** A Series' 检索排除 as its page opens: every exclusion in force, and the first page of revisions. */
export function seriesExclusionsProjection(host: SeriesStoreHost, seriesId: string): SeriesExclusionsProjection {
  const effective = host.seriesExclusions.effective(seriesId).map((entry): SeriesExclusionProjection => ({
    exclusionId: entry.exclusionId,
    target: entry.target,
    reason: entry.current.reason,
    effectiveSince: entry.since,
    revision: entry.current.revision,
  }));
  const history = seriesExclusionHistoryPage(host, seriesId, null);
  return { effective, history: history.history, historyCount: history.count, historyNext: history.nextCursor };
}

export function seriesExclusionHistoryPage(host: SeriesStoreHost, seriesId: string, after: SeriesExclusionHistoryCursor | null):
SeriesExclusionHistoryPageProjection & { count: number } {
  const { entries, count } = host.seriesExclusions.historyPage(seriesId, after, MAX_SERIES_EXCLUSION_HISTORY_PAGE + 1);
  const { page, more } = weighedPage(entries.map((entry) => seriesExclusionRevision(host, entry)), MAX_SERIES_EXCLUSION_HISTORY_PAGE);
  const last = page.at(-1);
  return { history: page, nextCursor: more && last !== undefined ? { recordedAt: last.recordedAt, revisionId: last.revisionId } : null, count };
}

export function seriesExclusionRevision(host: SeriesStoreHost, entry: StoredExclusionRevision): SeriesExclusionRevisionProjection {
  return {
    revisionId: entry.revisionId,
    exclusionId: entry.exclusionId,
    revision: entry.revision,
    action: entry.action,
    actionLabel: SERIES_EXCLUSION_ACTION_LABELS[entry.action],
    target: entry.target,
    reason: entry.reason,
    actor: '本机编辑',
    recordedAt: entry.recordedAt,
    impact: entry.impact,
  };
}

/**
 * 提议为书系知识 (SER-013, SER-014): the editor's own words, or the exact span of a member Book's manuscript, becomes a
 * non-authoritative candidate for a new or an exact existing item. Nothing reads it until it is taken in.
 */
export function proposeSeriesKnowledge(host: SeriesStoreHost, input: ProposeSeriesKnowledgeInput): SeriesKnowledgeProposalProjection {
  return host.seriesCall(() => {
    const created = host.transaction(host.authority, () => {
      const series = requireStoredSeries(host, input.seriesId);
      const target = knowledgeTarget(host, series.seriesId, input.target);
      const content = seriesKnowledgeContent(input.content);
      requireStore(content !== null, 'SERIES_KNOWLEDGE_CONTENT_INVALID', `内容要 1–${MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS} 个字。`);
      const provenance = input.span === null ? null : knowledgeSpan(host, series, input.span);
      return host.seriesKnowledge.propose({ seriesId: series.seriesId, target, content, provenance });
    });
    const series = requireStoredSeries(host, input.seriesId);
    // The answer is the candidate alone (Issue #63 review): the page reads its lists again, each a page at a time.
    const items = host.seriesKnowledge.items(series.seriesId);
    const open = host.seriesKnowledge.open(series.seriesId);
    return {
      candidateId: created.candidateId,
      completionLabel: `已提议为书系「${series.title}」的知识候选项`,
      candidate: knowledgeCandidateProjection(host, created, countSeriesKnowledgeConflicts(seriesKnowledgeConflicts(created, items, open))),
    };
  });
}

/** 书系知识纳入审阅 (SER-015, SER-016, SER-019) of one open candidate as it stands now. A read. */
export function inspectSeriesKnowledgeReview(host: SeriesStoreHost, input: InspectSeriesKnowledgeReviewInput): SeriesKnowledgeReviewProjection {
  return host.seriesCall(() => {
    const page = input.conflictsPage;
    requireStore(page === undefined || (Number.isSafeInteger(page.after) && page.after >= 0), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const review = seriesKnowledgeReview(host, input.seriesId, input.candidateId, page?.after ?? 0);
    requireStore(page === undefined || (review.candidate.version === page.candidateVersion && review.projection.reviewDigest === page.reviewDigest),
      'SERIES_KNOWLEDGE_REVIEW_STALE', '候选项、条目或冲突在审阅之后有了变化；请重新审阅。');
    requireStore((page?.after ?? 0) <= review.projection.conflictCount, 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    return review.projection;
  });
}

/** 编辑候选项 (SER-015): the candidate's next version, read again in review against the item as it stands now. */
export function editSeriesKnowledgeCandidate(host: SeriesStoreHost, input: EditSeriesKnowledgeCandidateInput): SeriesKnowledgeReviewProjection {
  return host.seriesCall(() => {
    host.transaction(host.authority, () => {
      const series = requireStoredSeries(host, input.seriesId);
      requireStore(typeof input.candidateId === 'string' && UUID_PATTERN.test(input.candidateId), 'SERIES_KNOWLEDGE_CANDIDATE_INVALID', '候选项标识无效。');
      const candidate = host.seriesKnowledge.candidate(input.candidateId);
      requireStore(candidate !== null && candidate.seriesId === series.seriesId, 'SERIES_KNOWLEDGE_CANDIDATE_NOT_FOUND', '这个候选项不存在。');
      const target = knowledgeTarget(host, series.seriesId, input.target);
      const content = seriesKnowledgeContent(input.content);
      requireStore(content !== null, 'SERIES_KNOWLEDGE_CONTENT_INVALID', `内容要 1–${MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS} 个字。`);
      host.seriesKnowledge.edit(input.candidateId, input.expectedVersion, target, content);
    });
    return seriesKnowledgeReview(host, input.seriesId, input.candidateId).projection;
  });
}

/**
 * 纳入书系知识 (SER-017 to SER-019): against the exact review the editor read — a moved candidate, item, conflict or
 * membership refuses it — a conflict kept only by 保留已披露冲突, and where it may later be used chosen by the editor.
 */
export function promoteSeriesKnowledge(host: SeriesStoreHost, input: PromoteSeriesKnowledgeInput): SeriesKnowledgePromotionProjection {
  return host.seriesCall(() => {
    const promoted = host.transaction(host.authority, () => {
      const review = seriesKnowledgeReview(host, input.seriesId, input.candidateId);
      requireStore(review.candidate.version === input.candidateVersion && review.projection.reviewDigest === input.reviewDigest,
        'SERIES_KNOWLEDGE_REVIEW_STALE', '候选项、条目或冲突在审阅之后有了变化；请重新审阅。');
      requireStore(review.projection.blocked === null, 'SERIES_KNOWLEDGE_BLOCKED', review.projection.blocked ?? '');
      requireStore(isSeriesKnowledgeReuseScope(input.reuseScope), 'SERIES_KNOWLEDGE_REUSE_INVALID', '请选择以后的用途。');
      if (review.projection.conflictCount > 0) {
        requireStore(input.conflictDisposition === 'preserved', 'SERIES_KNOWLEDGE_CONFLICT_UNRESOLVED',
          `${SERIES_KNOWLEDGE_CONFLICT_LABEL}：请编辑候选项，或选择保留已披露冲突。`);
      } else {
        requireStore(input.conflictDisposition === 'none', 'SERIES_KNOWLEDGE_DISPOSITION_INVALID', '没有已披露的冲突可以保留。');
      }
      return host.seriesKnowledge.promote({ candidate: review.candidate, conflicts: review.conflicts(), reuseScope: input.reuseScope, reviewDigest: input.reviewDigest });
    });
    return {
      itemId: promoted.itemId,
      revisionId: promoted.revisionId,
      completionLabel: promoted.outcome === 'created' ? '书系知识已纳入' as const : '书系知识已更新' as const,
      item: knowledgeItemProjection(host, host.seriesKnowledge.item(promoted.itemId)!),
    };
  });
}

/** `查找条目` and `更多条目…`: a page of a Series' knowledge items by name, narrowed to names holding the words (Issue #63 review). A read. */
export function inspectSeriesKnowledgeItems(host: SeriesStoreHost, seriesId: string, text: string, after: SeriesKnowledgeItemsCursor | null): SeriesKnowledgeItemsPageProjection {
  return host.seriesCall(() => {
    const series = requireStoredSeries(host, seriesId);
    const words = typeof text === 'string' && text.isWellFormed() ? text.normalize('NFC').trim() : null;
    requireStore(words !== null && [...words].length <= MAX_SERIES_KNOWLEDGE_QUERY_CHARACTERS && !/[\r\n]/u.test(words), 'SERIES_KNOWLEDGE_QUERY_INVALID',
      `查找的条目字词最多 ${MAX_SERIES_KNOWLEDGE_QUERY_CHARACTERS} 个字，写在一行里。`);
    requireStore(after === null || (typeof after.itemId === 'string' && UUID_PATTERN.test(after.itemId) && typeof after.subject === 'string' &&
      after.subject.length >= 1 && after.subject.length <= 2 * MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    return knowledgeItemsPage(host, series.seriesId, words, after);
  });
}

/** `更多候选项…`: the next page of a Series' open candidates, oldest proposed first (Issue #63 review). A read. */
export function inspectSeriesKnowledgeCandidates(host: SeriesStoreHost, seriesId: string, after: SeriesKnowledgeCandidatesCursor | null): SeriesKnowledgeCandidatesPageProjection {
  return host.seriesCall(() => {
    const series = requireStoredSeries(host, seriesId);
    requireStore(after === null || (typeof after.candidateId === 'string' && UUID_PATTERN.test(after.candidateId) && typeof after.firstAt === 'string' &&
      !Number.isNaN(Date.parse(after.firstAt))), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const { candidates, nextCursor } = knowledgeCandidatesPage(host, series.seriesId, after);
    return { candidates, nextCursor };
  });
}

/** 历次版本: a page of one item's revisions, newest first, below the ordinal named (Issue #63 review). A read. */
export function inspectSeriesKnowledgeConflicts(host: SeriesStoreHost, input: { seriesId: string; itemId: string; revisionId: string; after: number }): SeriesKnowledgeConflictsProjection {
  return host.seriesCall(() => {
    const series = requireStoredSeries(host, input.seriesId);
    requireStore(typeof input.itemId === 'string' && UUID_PATTERN.test(input.itemId) && typeof input.revisionId === 'string' && UUID_PATTERN.test(input.revisionId),
      'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识条目或版本不存在。');
    const item = host.seriesKnowledge.item(input.itemId);
    requireStore(item !== null && item.seriesId === series.seriesId, 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识条目不存在。');
    const revision = host.seriesKnowledge.revision(input.itemId, input.revisionId);
    requireStore(revision !== null, 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识版本不存在。');
    requireStore(Number.isSafeInteger(input.after) && input.after >= 0 && input.after <= revision.conflictCount, 'SERIES_CURSOR_INVALID', '冲突列表位置无效。');
    const { page, more } = weighedPage(host.seriesKnowledge.conflictsPage(revision.revisionId, revision.conflictCount, revision.conflictsDigest, input.after, MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN + 1),
      MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN, SERIES_KNOWLEDGE_PAGE_BYTES);
    return { itemId: input.itemId, revisionId: input.revisionId, conflicts: page, total: revision.conflictCount,
      nextAfter: more ? input.after + page.length : null };
  });
}

export function inspectSeriesKnowledgeRevisions(host: SeriesStoreHost, seriesId: string, itemId: string, before: number | null): SeriesKnowledgeRevisionsProjection {
  return host.seriesCall(() => {
    const series = requireStoredSeries(host, seriesId);
    requireStore(typeof itemId === 'string' && UUID_PATTERN.test(itemId), 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识条目不存在。');
    const item = host.seriesKnowledge.item(itemId);
    requireStore(item !== null && item.seriesId === series.seriesId, 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识条目不存在。');
    requireStore(before === null || (Number.isSafeInteger(before) && before >= 1), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
    const rest = host.seriesKnowledge.revisionsPage(itemId, before, MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE + 1);
    const { page, more } = weighedPage(rest.slice(0, MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE + 1).map((revision) => knowledgeRevisionProjection(host, revision)),
      MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE, SERIES_KNOWLEDGE_PAGE_BYTES);
    return { itemId: item.itemId, revisions: page, nextBefore: more ? page.at(-1)!.ordinal : null };
  });
}

/** One page of a Series' knowledge items after the one named, each with its current revision only. */
export function knowledgeItemsPage(host: SeriesStoreHost, seriesId: string, words: string, after: SeriesKnowledgeItemsCursor | null): SeriesKnowledgeItemsPageProjection {
  const items = host.seriesKnowledge.itemsPage(seriesId, words, after, MAX_SERIES_KNOWLEDGE_ITEMS_PAGE + 1).map((item) => knowledgeItemProjection(host, item));
  const { page, more } = weighedPage(items, MAX_SERIES_KNOWLEDGE_ITEMS_PAGE, SERIES_KNOWLEDGE_PAGE_BYTES);
  const last = page.at(-1);
  return { items: page, nextCursor: more && last !== undefined ? { subject: last.subject, itemId: last.itemId } : null };
}

/** One page of a Series' open candidates after the one named, oldest proposed first, each with how many conflicts it discloses. */
export function knowledgeCandidatesPage(host: SeriesStoreHost, seriesId: string, after: SeriesKnowledgeCandidatesCursor | null): SeriesKnowledgeCandidatesPageProjection {
  const read = host.seriesKnowledge.openPage(seriesId, after, MAX_SERIES_KNOWLEDGE_CANDIDATES_PAGE + 1);
  const projected = read.map(({ candidate }) => knowledgeCandidateProjection(host, candidate, countSeriesKnowledgeConflicts(seriesKnowledgeConflicts(candidate, host.seriesKnowledge.items(seriesId), host.seriesKnowledge.open(seriesId)))));
  const { page, more } = weighedPage(projected, MAX_SERIES_KNOWLEDGE_CANDIDATES_PAGE, SERIES_KNOWLEDGE_PAGE_BYTES);
  const last = read[page.length - 1];
  return { candidates: page, nextCursor: more && last !== undefined ? { firstAt: last.firstAt, candidateId: last.candidate.candidateId } : null };
}

/** The item a candidate proposes, resolved against the Series as it stands: a new name and class, or the exact item now. */
export function knowledgeTarget(host: SeriesStoreHost, seriesId: string, target: SeriesKnowledgeTarget): ResolvedTarget {
  requireStore(typeof target === 'object' && target !== null && (target.kind === 'new' || target.kind === 'existing'), 'SERIES_KNOWLEDGE_TARGET_INVALID', '候选项要写明是新条目还是已有条目。');
  if (target.kind === 'new') {
    const subject = seriesKnowledgeSubject(target.subject);
    requireStore(subject !== null, 'SERIES_KNOWLEDGE_SUBJECT_INVALID', `条目名称要 1–${MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS} 个字，写在一行里。`);
    requireStore(isSeriesKnowledgeClass(target.knowledgeClass), 'SERIES_KNOWLEDGE_CLASS_INVALID', '请选择条目类别。');
    return { kind: 'new', subject, knowledgeClass: target.knowledgeClass };
  }
  requireStore(typeof target.itemId === 'string' && UUID_PATTERN.test(target.itemId), 'SERIES_KNOWLEDGE_TARGET_INVALID', '候选项要写明是新条目还是已有条目。');
  const item = host.seriesKnowledge.item(target.itemId);
  requireStore(item !== null && item.seriesId === seriesId, 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识条目不存在。');
  return { kind: 'existing', itemId: item.itemId, subject: item.subject, knowledgeClass: item.knowledgeClass, baseRevisionId: item.current.revisionId };
}

/** The exact span a provenance-bound candidate cites (SER-013): verified as a mark's is, in a Book the Series holds now. */
export function knowledgeSpan(host: SeriesStoreHost, series: StoredSeries, span: SeriesKnowledgeSpanInput): StoredProvenance {
  requireStore(typeof span === 'object' && span !== null, 'SERIES_KNOWLEDGE_SPAN_INVALID', '所选文字无效。');
  const verified = host.markCall(() => host.editorialMarks.verifySpan(span));
  const bookTitle = host.evaluationBookTitle(verified.bookId);
  requireStore(host.series.latest(series.seriesId, verified.bookId)?.kind === 'add', 'SERIES_KNOWLEDGE_NOT_MEMBER',
    `《${bookTitle}》不在书系「${series.title}」中；只有成员图书的稿件可以提议为书系知识。`);
  return {
    kind: 'manuscript-revision',
    bookId: verified.bookId,
    manuscriptId: span.manuscriptId,
    branchId: span.branchId,
    revisionId: verified.revisionId,
    revisionLabel: verified.revisionLabel,
    journalSequence: verified.journalSequence,
    blockId: span.blockId,
    fromGrapheme: span.fromGrapheme,
    toGrapheme: span.toGrapheme,
    quote: verified.text,
  };
}

export function seriesKnowledgeReview(host: SeriesStoreHost, seriesId: string, candidateId: string, after = 0): {
  readonly projection: SeriesKnowledgeReviewProjection;
  readonly candidate: StoredCandidate;
  readonly conflicts: () => IterableIterator<FoundConflict>;
} {
  const series = requireStoredSeries(host, seriesId);
  requireStore(typeof candidateId === 'string' && UUID_PATTERN.test(candidateId), 'SERIES_KNOWLEDGE_CANDIDATE_INVALID', '候选项标识无效。');
  const candidate = host.seriesKnowledge.candidate(candidateId);
  requireStore(candidate !== null && candidate.seriesId === series.seriesId, 'SERIES_KNOWLEDGE_CANDIDATE_NOT_FOUND', '这个候选项不存在。');
  requireStore(!candidate.promoted, 'SERIES_KNOWLEDGE_ALREADY_PROMOTED', '这个候选项已经纳入书系知识。');
  const conflicts = (): IterableIterator<FoundConflict> => seriesKnowledgeConflicts(candidate, host.seriesKnowledge.items(series.seriesId), host.seriesKnowledge.open(series.seriesId));
  const target = candidate.target;
  const current = target.kind === 'existing' ? host.seriesKnowledge.item(target.itemId)?.current ?? null : null;
  // A provenance-bound candidate cites a member Book's manuscript: once the Book has left the Series it cannot be taken in.
  const blocked = candidate.provenance !== null && host.series.latest(series.seriesId, candidate.provenance.bookId)?.kind !== 'add'
    ? `《${host.evaluationBookTitle(candidate.provenance.bookId)}》已不在书系「${series.title}」中；来自它的候选项不能纳入。`
    : null;
  const summary = seriesKnowledgeReviewSummary({ seriesId: series.seriesId, candidateVersionId: candidate.versionId, currentRevisionId: current?.revisionId ?? null, conflicts: conflicts(), blocked, after });
  const { page } = weighedPage(summary.preview.map((entry) => ({ kind: entry.kind, line: entry.line })),
    MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN, SERIES_KNOWLEDGE_PAGE_BYTES);
  return {
    candidate,
    conflicts,
    projection: {
      seriesId: series.seriesId,
      seriesTitle: series.title,
      candidate: knowledgeCandidateProjection(host, candidate, summary.count),
      current: current === null ? null : knowledgeRevisionProjection(host, current),
      conflicts: page,
      conflictCount: summary.count,
      conflictsAfter: after,
      conflictsNextAfter: after + page.length < summary.count ? after + page.length : null,
      conflictLabel: summary.count === 0 ? null : SERIES_KNOWLEDGE_CONFLICT_LABEL,
      reuseScopes: SERIES_KNOWLEDGE_REUSE_SCOPES.map((scope) => ({ scope, label: SERIES_KNOWLEDGE_REUSE_LABELS[scope] })),
      blocked,
      reviewDigest: summary.digest,
      actionLabel: '纳入书系知识',
    },
  };
}

/** A Series' knowledge as its page first shows it (Issue #63 review): the first page of items and of open candidates, and the counts. */
export function seriesKnowledgeProjection(host: SeriesStoreHost, seriesId: string): SeriesProjection['knowledge'] {
  const items = knowledgeItemsPage(host, seriesId, '', null);
  const candidates = knowledgeCandidatesPage(host, seriesId, null);
  return {
    items: items.items,
    itemCount: host.seriesKnowledge.itemCount(seriesId),
    itemsNext: items.nextCursor,
    candidates: candidates.candidates,
    candidateCount: host.seriesKnowledge.openCount(seriesId),
    candidatesNext: candidates.nextCursor,
  };
}

export function knowledgeProvenance(host: SeriesStoreHost, provenance: StoredProvenance | null): SeriesKnowledgeProvenanceProjection | null {
  if (provenance === null) return null;
  return {
    kind: provenance.kind,
    bookId: provenance.bookId,
    bookTitle: host.evaluationBookTitle(provenance.bookId),
    manuscriptId: provenance.manuscriptId,
    revisionId: provenance.revisionId,
    revisionLabel: provenance.revisionLabel,
    journalSequence: provenance.journalSequence,
    blockId: provenance.blockId,
    fromGrapheme: provenance.fromGrapheme,
    toGrapheme: provenance.toGrapheme,
    quote: knowledgeQuoteExcerpt(provenance.quote),
    // Changes waited in the journal beyond the revision when the words were cited (Issue #63 review).
    // The counter is cumulative across checkpoints. Only entries based on this exact cited revision and present
    // by the cited position belong to its unsaved suffix; later checkpoints or edits cannot relabel this provenance.
    uncheckpointed: host.authority.prepare(
      `SELECT 1 FROM edit_journal_entries WHERE manuscript_id = ? AND branch_id = ?
         AND base_revision_id = ? AND sequence <= ? LIMIT 1`,
    ).get(provenance.manuscriptId, provenance.branchId, provenance.revisionId, provenance.journalSequence) !== undefined,
  };
}

export function knowledgeCandidateProjection(
    host: SeriesStoreHost,
  candidate: StoredCandidate,
  conflicts: number,
): SeriesKnowledgeCandidateProjection {
  const target = candidate.target;
  const base = target.kind === 'existing'
    ? host.seriesKnowledge.revision(target.itemId, target.baseRevisionId)
    : null;
  return {
    candidateId: candidate.candidateId,
    version: candidate.version,
    target: {
      kind: target.kind,
      itemId: target.kind === 'existing' ? target.itemId : null,
      subject: target.subject,
      knowledgeClass: target.knowledgeClass,
      classLabel: SERIES_KNOWLEDGE_CLASS_LABELS[target.knowledgeClass],
      baseRevisionOrdinal: base?.ordinal ?? null,
    },
    content: candidate.content,
    authoring: candidate.authoring,
    provenance: knowledgeProvenance(host, candidate.provenance),
    recordedAt: candidate.recordedAt,
    conflicts,
  };
}

export function knowledgeRevisionProjection(host: SeriesStoreHost, revision: StoredRevision): SeriesKnowledgeRevisionProjection {
  return {
    revisionId: revision.revisionId,
    ordinal: revision.ordinal,
    content: revision.content,
    authoring: revision.authoring,
    provenance: knowledgeProvenance(host, revision.provenance),
    conflicts: revision.conflicts.slice(0, MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN),
    conflictCount: revision.conflictCount,
    reuseScope: revision.reuseScope,
    reuseLabel: SERIES_KNOWLEDGE_REUSE_LABELS[revision.reuseScope],
    decisionId: revision.decisionId,
    outcome: revision.outcome,
    recordedAt: revision.recordedAt,
  };
}

export function knowledgeItemProjection(host: SeriesStoreHost, item: StoredItem): SeriesKnowledgeItemProjection {
  return {
    itemId: item.itemId,
    subject: item.subject,
    knowledgeClass: item.knowledgeClass,
    classLabel: SERIES_KNOWLEDGE_CLASS_LABELS[item.knowledgeClass],
    createdAt: item.createdAt,
    current: knowledgeRevisionProjection(host, item.current),
    revisionCount: item.revisionCount,
  };
}
