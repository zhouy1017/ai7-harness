import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_SERIES_NOTE_CHARACTERS,
  MAX_SERIES_TITLE_CHARACTERS,
  publicationText,
  type SeriesImpactGroupProjection,
  type SeriesMembershipChangeKind,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';

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
  /** Authorized, queued or running Runs whose frozen scope names this Series: none can yet (S29). */
  readonly seriesScopedRuns: number;
  readonly learningMaterials: number;
  readonly learningDecided: number;
  /** Items of the Series' knowledge holding a revision taken from the Book (Issue #63, S28b). */
  readonly knowledgeFromBook?: number;
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
  const learning = facts.learningMaterials === 0
    ? `${book}还没有学习材料。`
    : `${book}有 ${facts.learningMaterials} 项学习材料，其中 ${facts.learningDecided} 项已决定学习准入。`;
  if (kind === 'add') {
    return [
      impactGroup('future-tasks', [`以后新建任务时，可以明确选用${series}的范围，其中会包括${book}。`],
        [`不会把${book}自动加进任何任务，也不会因此授权运行、让其他图书读到它的原文或发给模型服务。`]),
      impactGroup('runs', [], [runs, '已授权或正在运行的任务按各自冻结的范围继续，计划不会被改动。']),
      impactGroup('knowledge-learning', [], [...knowledge, learning, '书系知识、学习准入和学习记录各有自己的决定；加入书系不会纳入、启用或删除它们。']),
      impactGroup('history', ['追加一条书系成员变更记录，书系和图书两边都能查看。'], ['已完成的任务、结果、决定和以前的记录都保持原样。']),
    ];
  }
  return [
    impactGroup('future-tasks', [`以后新建任务时，${series}的范围不再包括${book}。`], [`${book}自己的任务照旧。`]),
    impactGroup('runs', [], [runs, '已经冻结的任务范围不会因移出而改变，任务也不会被取消。']),
    impactGroup('knowledge-learning', [], [...knowledge, learning, '书系知识、学习准入和学习记录各有自己的决定；移出书系不会删除或改动它们。']),
    impactGroup('history', ['追加一条书系成员变更记录，书系和图书两边都能查看。'], [`${book}和书系以前的记录都不会删除。`]),
  ];
}

/** The digest a preview carries: the change, the chain it follows and every line it shows, so a commit can tell it moved. */
export function seriesPreviewDigest(input: {
  readonly seriesId: string;
  readonly bookId: string;
  readonly kind: SeriesMembershipChangeKind;
  readonly chainHead: string | null;
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

/** 书系一致性 for a Book already in a Series (Issue #63, S28a): the category still waits for Series Knowledge to reach review. */
export function seriesConsistencyWaitingReason(titles: ReadonlyArray<string>): string {
  return `这本书已在书系${titles.map((title) => `「${title}」`).join('、')}中；书系知识接入审阅后才能选。`;
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

  /** Every Series, by name, each verified against its digest and its row. */
  list(): StoredSeries[] {
    return (this.#db.prepare('SELECT * FROM series ORDER BY title, series_id').all() as SqlRow[]).map((row) => this.#series(row));
  }

  /** One Series, or `null` when there is none by that identity. */
  find(seriesId: string): StoredSeries | null {
    const row = this.#db.prepare('SELECT * FROM series WHERE series_id = ?').get(seriesId) as SqlRow | undefined;
    return row === undefined ? null : this.#series(row);
  }

  #series(row: SqlRow): StoredSeries {
    const json = String(row.canonical_json);
    requireSeries(sha256Hex(json) === String(row.sha256), 'SERIES_RECORD_INVALID', INVALID);
    const record = JSON.parse(json) as unknown;
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

  /** One Series and Book's chain of changes in order, each verified: its digest, its record against its row, its place. */
  chain(seriesId: string, bookId: string): StoredMembershipChange[] {
    const rows = this.#db.prepare('SELECT * FROM series_membership_changes WHERE series_id = ? AND book_id = ? ORDER BY ordinal')
      .all(seriesId, bookId) as SqlRow[];
    return this.#verified(rows);
  }

  /** Every change of one Series, or of one Book across Series: each pair's chain verified, the whole newest first. */
  history(filter: { readonly seriesId: string } | { readonly bookId: string }): StoredMembershipChange[] {
    const rows = 'seriesId' in filter
      ? this.#db.prepare('SELECT * FROM series_membership_changes WHERE series_id = ? ORDER BY book_id, ordinal').all(filter.seriesId) as SqlRow[]
      : this.#db.prepare('SELECT * FROM series_membership_changes WHERE book_id = ? ORDER BY series_id, ordinal').all(filter.bookId) as SqlRow[];
    const pairs = new Map<string, SqlRow[]>();
    for (const row of rows) {
      const key = `${String(row.series_id)}/${String(row.book_id)}`;
      pairs.set(key, [...(pairs.get(key) ?? []), row]);
    }
    // Newest first; within one Series and Book the chain's own order decides, whatever the clock said.
    return [...pairs.values()].flatMap((pair) => this.#verified(pair))
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) ||
        (left.seriesId === right.seriesId && left.bookId === right.bookId ? right.ordinal - left.ordinal : right.changeId.localeCompare(left.changeId)));
  }

  #verified(rows: SqlRow[]): StoredMembershipChange[] {
    let before: StoredMembershipChange | null = null;
    return rows.map((row) => {
      const json = String(row.canonical_json);
      requireSeries(sha256Hex(json) === String(row.sha256), 'SERIES_RECORD_INVALID', INVALID);
      const record = JSON.parse(json) as unknown;
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
      return entry;
    });
  }

  /** The Books a Series holds now: each pair whose newest change is `加入书系`, with when it was. */
  members(seriesId: string): Array<{ readonly bookId: string; readonly joinedAt: string }> {
    return (this.#db.prepare(`SELECT c.book_id, c.recorded_at FROM series_membership_changes c
      WHERE c.series_id = ? AND c.kind = 'add' AND c.ordinal = (
        SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id)
      ORDER BY c.recorded_at, c.book_id`).all(seriesId) as SqlRow[]).map((row) => ({ bookId: String(row.book_id), joinedAt: String(row.recorded_at) }));
  }

  /** The Series a Book is in now, by name, with when it joined each. */
  seriesOf(bookId: string): Array<{ readonly seriesId: string; readonly title: string; readonly joinedAt: string }> {
    if (this.#db.prepare(TABLE_PRESENT).get() === undefined) return [];
    return (this.#db.prepare(`SELECT s.series_id, s.title, c.recorded_at FROM series_membership_changes c JOIN series s ON s.series_id = c.series_id
      WHERE c.book_id = ? AND c.kind = 'add' AND c.ordinal = (
        SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id)
      ORDER BY s.title, s.series_id`).all(bookId) as SqlRow[])
      .map((row) => ({ seriesId: String(row.series_id), title: String(row.title), joinedAt: String(row.recorded_at) }));
  }

  /** How many Books each Series holds now. */
  memberCounts(): Map<string, number> {
    const rows = this.#db.prepare(`SELECT c.series_id, count(*) count FROM series_membership_changes c
      WHERE c.kind = 'add' AND c.ordinal = (
        SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id)
      GROUP BY c.series_id`).all() as SqlRow[];
    return new Map(rows.map((row) => [String(row.series_id), Number(row.count)]));
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
    const chain = this.chain(input.seriesId, input.bookId);
    const latest = chain.at(-1) ?? null;
    const member = latest?.kind === 'add';
    requireSeries(input.kind !== 'add' || !member, 'SERIES_MEMBER_ALREADY', seriesMemberAlready(input.names.book, input.names.series));
    requireSeries(input.kind !== 'remove' || member, 'SERIES_MEMBER_ABSENT', seriesMemberAbsent(input.names.book, input.names.series));
    const changeId = randomUUID();
    const ordinal = chain.length + 1;
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
