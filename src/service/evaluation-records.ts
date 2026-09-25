import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  EVALUATION_CONCLUSIONS,
  MAX_EVALUATION_COMMENT_GRAPHEMES,
  MAX_EVALUATION_LINE_GRAPHEMES,
  MAX_EVALUATION_LINES,
  MAX_EVALUATION_RISK_STATEMENT_GRAPHEMES,
  MAX_EVALUATION_VERDICT_GRAPHEMES,
  type EvaluationComparisonProjection,
  type EvaluationContent,
  type EvaluationProfileProjection,
  type EvaluationProfilesProjection,
  type EvaluationRecordProjection,
  type EvaluationRecordSummaryProjection,
  type EvaluationTotalProjection,
  type EvaluationWorkspaceProjection,
} from '../shared/protocol.js';
import { evaluationTotal, recommendationBlocked, validEvaluationScore } from '../shared/evaluation-scoring.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';

/**
 * ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012; ADR 0076 §7): a
 * Book's versioned Evaluation Records under the house Evaluation Profile. A version binds the manuscript's current revision
 * and snapshots the profile; the editor scores each item out of its 满分 — a whole or half point, or `不评` with a reason —
 * rates the two risk items, lists what is still missing, and chooses the conclusion, which `推荐出版` waits on while a `高`
 * risk is unreviewed. `定稿` closes the version with the actor and the time; `重新评估` begins the next, seeded from it and
 * compared with it item by item. AI7's own 初评, the market block and 审稿意见 arrive with the later S81 slices.
 *
 * Schema revision 47 owns two relations, ledgers like the others: each version's record, and its entries — one chain per
 * version, every save appending the editor's whole content, the last one `finalized` — appended once and never rewritten.
 */

export const EVALUATION_RECORD_SCHEMA_SQL = {
  evaluation_records: `CREATE TABLE evaluation_records (
  record_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  previous_record_id TEXT REFERENCES evaluation_records(record_id),
  profile_sha256 TEXT NOT NULL CHECK(length(profile_sha256) = 64),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(book_id, ordinal)
) STRICT`,
  evaluation_record_entries: `CREATE TABLE evaluation_record_entries (
  entry_id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES evaluation_records(record_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('draft', 'finalized')),
  previous_sha256 TEXT NOT NULL CHECK(length(previous_sha256) = 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(record_id, ordinal)
) STRICT`,
} as const;

export const EVALUATION_RECORD_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(EVALUATION_RECORD_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EVALUATION_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const EVALUATION_RECORD_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  evaluation_records: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'previous_record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  evaluation_record_entries: ['record_id>evaluation_records.record_id:NO ACTION/NO ACTION/NONE'],
};

export class EvaluationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EvaluationError';
  }
}

function requireEvaluation(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new EvaluationError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;
type Profile = Omit<EvaluationProfileProjection, 'sha256'>;

const RECORD_SCHEMA = 'ai7.evaluation-record/1';
const ENTRY_SCHEMA = 'ai7.evaluation-entry/1';
const PROFILE_SCHEMA = 'ai7.evaluation-profile/1';
/** Who scores and finalizes, as the other editor records of this device name it. */
export const EVALUATION_ACTOR = '本机编辑' as const;
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'evaluation_records'";
const CONTROL_CHARACTER = /[\p{Zl}\p{Zp}]|(?![\n])\p{Cc}/u;
const LINE_CONTROL_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}]/u;

/**
 * AI7's built-in Evaluation Profile (EVAL-002, EVAL-003, EVAL-005), `AI7 内置默认` at version 1 and never stored: the five
 * default scored items, Editorial Dimensions 1, 2, 3, 4 and 6, dividing the 100 evenly; the bands with their anchor wording;
 * the two risk items; and the four conclusions. A house's own profile arrives with 知识库 › 评估方案's editing.
 */
export const BUILTIN_EVALUATION_PROFILE: Profile = {
  profileId: 'ai7-builtin/evaluation-profile',
  title: '审稿评估方案',
  version: '1',
  issuer: 'AI7 内置默认',
  total: 100,
  items: [
    { itemId: 'literary-quality', label: '文学品质与作者声音', fullMarks: 20 },
    { itemId: 'theme-and-context', label: '主题、价值与社会文化语境', fullMarks: 20 },
    { itemId: 'structure-and-coherence', label: '结构、叙事逻辑与连贯', fullMarks: 20 },
    { itemId: 'chinese-language', label: '中文语言与表达', fullMarks: 20 },
    { itemId: 'readers-and-market', label: '读者与市场潜力', fullMarks: 20 },
  ],
  bands: [
    { band: 'excellent', label: '卓越', floor: 90, anchor: '可作为同类书的标杆。' },
    { band: 'good', label: '优秀', floor: 70, anchor: '明显高于出版要求，少量修改即可。' },
    { band: 'adequate', label: '合格', floor: 50, anchor: '达到出版要求，需要常规修改。' },
    { band: 'weak', label: '薄弱', floor: 30, anchor: '低于出版要求，需要较大修改。' },
    { band: 'unsuitable', label: '不宜', floor: 0, anchor: '在这一项上不宜出版。' },
  ],
  risks: [
    { riskId: 'facts-and-sources', label: '事实与来源' },
    { riskId: 'law-rights-ethics-policy', label: '法律、权利、伦理与出版政策' },
  ],
  conclusions: [
    { conclusion: 'recommend', label: '推荐出版' },
    { conclusion: 'revise', label: '修改后再议' },
    { conclusion: 'defer', label: '暂缓' },
    { conclusion: 'reject', label: '不推荐' },
  ],
};

export function evaluationProfileDigest(profile: Profile): string {
  return sha256Hex(canonicalJson({ schema: PROFILE_SCHEMA, profile }));
}

function withDigest(profile: Profile): EvaluationProfileProjection {
  return { ...profile, sha256: evaluationProfileDigest(profile) };
}

/** Revision 47's relations, created once: a store that predates them gains two empty relations and nothing existing moves. */
export function initializeEvaluationRecordSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(EVALUATION_RECORD_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EVALUATION_RECORD_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Evaluation record schema rollback failed.');
    }
    throw error;
  }
}

/** A version's empty content: every item unscored, every risk unrated, nothing listed, no conclusion. */
export function emptyEvaluationContent(profile: Pick<Profile, 'items' | 'risks'>): EvaluationContent {
  return {
    items: profile.items.map((item) => ({ itemId: item.itemId, score: null, notRated: null, comment: null })),
    risks: profile.risks.map((risk) => ({ riskId: risk.riskId, level: null, statement: null, reviewed: false })),
    readiness: [],
    strengths: [],
    weaknesses: [],
    verdict: null,
    conclusion: null,
  };
}

function text(value: unknown, maximum: number, code: string, message: string, multiline: boolean): string | null {
  if (value === null) return null;
  requireEvaluation(typeof value === 'string', 'EVALUATION_CONTENT_INVALID', '评估内容无效。');
  const trimmed = value.replace(/\r\n?/gu, '\n').trim();
  if (trimmed.length === 0) return null;
  requireEvaluation(graphemeCount(trimmed) <= maximum, code, message);
  requireEvaluation(!(multiline ? CONTROL_CHARACTER : LINE_CONTROL_CHARACTER).test(trimmed), 'EVALUATION_CONTENT_INVALID', '评估内容含有不能显示的控制字符。');
  return trimmed;
}

function lines(value: unknown, what: string): string[] {
  requireEvaluation(Array.isArray(value), 'EVALUATION_CONTENT_INVALID', '评估内容无效。');
  const kept = value.map((line) => text(line, MAX_EVALUATION_LINE_GRAPHEMES, 'EVALUATION_LINE_TOO_LONG', `${what}每一条要在 ${MAX_EVALUATION_LINE_GRAPHEMES} 字以内。`, false))
    .filter((line): line is string => line !== null);
  requireEvaluation(kept.length <= MAX_EVALUATION_LINES, 'EVALUATION_TOO_MANY_LINES', `${what}最多 ${MAX_EVALUATION_LINES} 条。`);
  return kept;
}

/**
 * The editor's content held to the profile it scores under: exactly its items and risks, each score a whole or half point
 * within its 满分, `不评` only with a reason, `推荐出版` never while a `高` risk is unreviewed — and, to finalize, every item
 * scored or `不评`, every risk rated with a statement for `中` and `高`, and a conclusion chosen.
 */
export function evaluationContent(input: unknown, profile: Pick<Profile, 'items' | 'risks'>, finalize: boolean): EvaluationContent {
  requireEvaluation(isRecord(input) && Array.isArray(input.items) && Array.isArray(input.risks), 'EVALUATION_CONTENT_INVALID', '评估内容无效。');
  const givenItems = input.items as unknown[];
  const givenRisks = input.risks as unknown[];
  requireEvaluation(givenItems.length === profile.items.length && givenRisks.length === profile.risks.length,
    'EVALUATION_CONTENT_INVALID', '评估内容与评估方案不一致。');
  const items = profile.items.map((item, index) => {
    const given = givenItems[index];
    requireEvaluation(isRecord(given) && given.itemId === item.itemId, 'EVALUATION_CONTENT_INVALID', '评估内容与评估方案不一致。');
    const notRated = text(given.notRated, MAX_EVALUATION_LINE_GRAPHEMES, 'EVALUATION_REASON_TOO_LONG', `不评的理由要在 ${MAX_EVALUATION_LINE_GRAPHEMES} 字以内。`, false);
    requireEvaluation(given.notRated === null || notRated !== null, 'EVALUATION_NOT_RATED_REASON', `「${item.label}」不评时要写明理由。`);
    const score = given.score;
    requireEvaluation(score === null || (typeof score === 'number' && validEvaluationScore(score, item.fullMarks)),
      'EVALUATION_SCORE_INVALID', `「${item.label}」的得分要在 0 到 ${item.fullMarks} 之间，可以有半分。`);
    requireEvaluation(notRated === null || score === null, 'EVALUATION_CONTENT_INVALID', `「${item.label}」不评时不能有得分。`);
    requireEvaluation(!finalize || score !== null || notRated !== null, 'EVALUATION_ITEM_UNSCORED', `定稿前，「${item.label}」要打分或写明不评的理由。`);
    const comment = text(given.comment, MAX_EVALUATION_COMMENT_GRAPHEMES, 'EVALUATION_COMMENT_TOO_LONG', `评语要在 ${MAX_EVALUATION_COMMENT_GRAPHEMES} 字以内。`, true);
    return { itemId: item.itemId, score: score as number | null, notRated, comment };
  });
  const risks = profile.risks.map((risk, index) => {
    const given = givenRisks[index];
    requireEvaluation(isRecord(given) && given.riskId === risk.riskId, 'EVALUATION_CONTENT_INVALID', '评估内容与评估方案不一致。');
    requireEvaluation(given.level === null || given.level === 'low' || given.level === 'medium' || given.level === 'high',
      'EVALUATION_CONTENT_INVALID', '风险等级无效。');
    requireEvaluation(typeof given.reviewed === 'boolean', 'EVALUATION_CONTENT_INVALID', '评估内容无效。');
    const statement = text(given.statement, MAX_EVALUATION_RISK_STATEMENT_GRAPHEMES, 'EVALUATION_STATEMENT_TOO_LONG',
      `风险说明要在 ${MAX_EVALUATION_RISK_STATEMENT_GRAPHEMES} 字以内。`, true);
    const level = given.level as EvaluationContent['risks'][number]['level'];
    requireEvaluation(!finalize || level !== null, 'EVALUATION_RISK_UNRATED', `定稿前，要给「${risk.label}」定风险等级。`);
    requireEvaluation(!finalize || level === null || level === 'low' || statement !== null, 'EVALUATION_RISK_STATEMENT',
      `「${risk.label}」为中或高时，要写明风险说明。`);
    // Only a `高` risk is reviewed by a person; the mark means nothing on a lower one, so it is not kept there.
    return { riskId: risk.riskId, level, statement, reviewed: level === 'high' && given.reviewed === true };
  });
  const conclusion = input.conclusion ?? null;
  requireEvaluation(conclusion === null || EVALUATION_CONCLUSIONS.includes(conclusion as EvaluationContent['conclusion'] & string),
    'EVALUATION_CONTENT_INVALID', '结论无效。');
  requireEvaluation(conclusion !== 'recommend' || !recommendationBlocked(risks), 'EVALUATION_RECOMMEND_BLOCKED',
    '有「高」风险还没有经人工复核，不能选「推荐出版」。');
  requireEvaluation(!finalize || conclusion !== null, 'EVALUATION_CONCLUSION_REQUIRED', '定稿前要选定结论。');
  return {
    items,
    risks,
    readiness: lines(input.readiness, '就绪清单'),
    strengths: lines(input.strengths, '主要优点'),
    weaknesses: lines(input.weaknesses, '主要问题'),
    verdict: text(input.verdict, MAX_EVALUATION_VERDICT_GRAPHEMES, 'EVALUATION_VERDICT_TOO_LONG', `总评要在 ${MAX_EVALUATION_VERDICT_GRAPHEMES} 字以内。`, true),
    conclusion: conclusion as EvaluationContent['conclusion'],
  };
}

function totalOf(profile: Pick<Profile, 'items'>, content: EvaluationContent): EvaluationTotalProjection {
  return evaluationTotal(profile.items.map((item, index) => ({
    fullMarks: item.fullMarks,
    score: content.items[index]!.score,
    notRated: content.items[index]!.notRated !== null,
  })));
}

interface StoredRecord {
  readonly recordId: string;
  readonly bookId: string;
  readonly ordinal: number;
  readonly manuscriptId: string;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly uncheckpointed: boolean;
  readonly previousRecordId: string | null;
  readonly profile: EvaluationProfileProjection;
  readonly createdAt: string;
  readonly sha256: string;
}

interface StoredEntry {
  readonly ordinal: number;
  readonly kind: 'draft' | 'finalized';
  readonly content: EvaluationContent;
  readonly recordedAt: string;
  readonly sha256: string;
}

/** Where a new version binds: the Book's primary manuscript at its current revision, and whether edits wait in its journal. */
export interface EvaluationManuscriptReader {
  current(bookId: string): { manuscriptId: string; revisionId: string; revisionLabel: string; uncheckpointed: boolean } | null;
}

function integer(value: SQLOutputValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

function sameContent(a: EvaluationContent, b: EvaluationContent): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export class EvaluationRecords {
  readonly #db: DatabaseSync;
  readonly #manuscripts: EvaluationManuscriptReader;

  constructor(db: DatabaseSync, manuscripts: EvaluationManuscriptReader) {
    this.#db = db;
    this.#manuscripts = manuscripts;
  }

  /** The profile a new version snapshots: AI7's built-in one until a house's own is managed in 知识库. */
  profile(): EvaluationProfileProjection {
    return withDigest(BUILTIN_EVALUATION_PROFILE);
  }

  #record(row: SqlRow): StoredRecord {
    const json = String(row.canonical_json);
    requireEvaluation(sha256Hex(json) === String(row.sha256), 'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
    const record = JSON.parse(json) as unknown;
    requireEvaluation(isRecord(record) && record.schema === RECORD_SCHEMA && record.recordId === row.record_id && record.bookId === row.book_id &&
      record.ordinal === integer(row.ordinal) && record.manuscriptId === row.manuscript_id && record.revisionId === row.revision_id &&
      (record.previousRecordId ?? null) === (row.previous_record_id ?? null) && record.createdAt === row.created_at &&
      isRecord(record.profile) && evaluationProfileDigest(record.profile as unknown as Profile) === row.profile_sha256 &&
      typeof record.revisionLabel === 'string' && typeof record.uncheckpointed === 'boolean',
    'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
    return {
      recordId: String(row.record_id),
      bookId: String(row.book_id),
      ordinal: integer(row.ordinal),
      manuscriptId: String(row.manuscript_id),
      revisionId: String(row.revision_id),
      revisionLabel: record.revisionLabel,
      uncheckpointed: record.uncheckpointed,
      previousRecordId: row.previous_record_id === null ? null : String(row.previous_record_id),
      profile: withDigest(record.profile as unknown as Profile),
      createdAt: String(row.created_at),
      sha256: String(row.sha256),
    };
  }

  /** One version's entries, oldest first, each verified and chained to the one before; the first to the record itself. */
  #entries(record: StoredRecord): StoredEntry[] {
    const rows = this.#db.prepare('SELECT * FROM evaluation_record_entries WHERE record_id = ? ORDER BY ordinal').all(record.recordId) as SqlRow[];
    let previous = record.sha256;
    const entries = rows.map((row, index) => {
      const json = String(row.canonical_json);
      requireEvaluation(sha256Hex(json) === String(row.sha256), 'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
      const entry = JSON.parse(json) as unknown;
      requireEvaluation(isRecord(entry) && entry.schema === ENTRY_SCHEMA && entry.entryId === row.entry_id && entry.recordId === record.recordId &&
        entry.ordinal === index + 1 && integer(row.ordinal) === index + 1 && entry.kind === row.kind && entry.previousSha256 === previous &&
        String(row.previous_sha256) === previous && entry.recordedAt === row.recorded_at && entry.actor === EVALUATION_ACTOR && isRecord(entry.content),
      'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
      previous = String(row.sha256);
      return {
        ordinal: index + 1,
        kind: entry.kind as StoredEntry['kind'],
        content: entry.content as unknown as EvaluationContent,
        recordedAt: String(row.recorded_at),
        sha256: String(row.sha256),
      };
    });
    requireEvaluation(entries.length >= 1 && entries.slice(0, -1).every((entry) => entry.kind === 'draft'), 'EVALUATION_RECORD_INVALID', '评估记录已损坏。');
    return entries;
  }

  #records(bookId: string): StoredRecord[] {
    return (this.#db.prepare('SELECT * FROM evaluation_records WHERE book_id = ? ORDER BY ordinal').all(bookId) as SqlRow[]).map((row) => this.#record(row));
  }

  #append(record: StoredRecord, previous: string, ordinal: number, kind: StoredEntry['kind'], content: EvaluationContent): void {
    const entryId = randomUUID();
    const recordedAt = new Date().toISOString();
    const entry = canonicalRecord({
      schema: ENTRY_SCHEMA,
      entryId,
      recordId: record.recordId,
      ordinal,
      kind,
      content,
      actor: EVALUATION_ACTOR,
      previousSha256: previous,
      recordedAt,
    });
    this.#db.prepare(
      'INSERT INTO evaluation_record_entries(entry_id, record_id, ordinal, kind, previous_sha256, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(entryId, record.recordId, ordinal, kind, previous, recordedAt, entry.json, entry.digest);
  }

  /**
   * 开始评估 or 重新评估 (EVAL-001, EVAL-012), inside the caller's transaction: a new version bound to the manuscript's current
   * revision under the profile that applies now — empty the first time, seeded from the last 定稿 after — refused while the
   * Book has no manuscript or a version is still being scored.
   */
  start(bookId: string): string {
    const manuscript = this.#manuscripts.current(bookId);
    requireEvaluation(manuscript !== null, 'EVALUATION_NO_MANUSCRIPT', '这本书还没有稿件，没有可以评估的内容。');
    const records = this.#records(bookId);
    const last = records.at(-1);
    const lastEntries = last === undefined ? [] : this.#entries(last);
    requireEvaluation(last === undefined || lastEntries.at(-1)!.kind === 'finalized', 'EVALUATION_OPEN',
      `第 ${last?.ordinal ?? 0} 版还没有定稿；定稿后才能重新评估。`);
    const profile = this.profile();
    const { sha256: profileSha256, ...snapshot } = profile;
    const seed = last === undefined
      ? emptyEvaluationContent(snapshot)
      : this.#reseed(lastEntries.at(-1)!.content, snapshot);
    const recordId = randomUUID();
    const ordinal = records.length + 1;
    const createdAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: RECORD_SCHEMA,
      recordId,
      bookId,
      ordinal,
      manuscriptId: manuscript.manuscriptId,
      revisionId: manuscript.revisionId,
      revisionLabel: manuscript.revisionLabel,
      uncheckpointed: manuscript.uncheckpointed,
      previousRecordId: last?.recordId ?? null,
      profile: snapshot,
      createdAt,
    });
    this.#db.prepare(
      `INSERT INTO evaluation_records(record_id, book_id, ordinal, manuscript_id, revision_id, previous_record_id, profile_sha256, created_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(recordId, bookId, ordinal, manuscript.manuscriptId, manuscript.revisionId, last?.recordId ?? null, profileSha256, createdAt, record.json, record.digest);
    const stored = this.#record(this.#db.prepare('SELECT * FROM evaluation_records WHERE record_id = ?').get(recordId) as SqlRow);
    this.#append(stored, stored.sha256, 1, 'draft', seed);
    return recordId;
  }

  /** The last 定稿's content carried into the next version: what the profile still holds, by identity, the rest empty. */
  #reseed(content: EvaluationContent, to: Pick<Profile, 'items' | 'risks'>): EvaluationContent {
    const empty = emptyEvaluationContent(to);
    const items = new Map(content.items.map((item) => [item.itemId, item] as const));
    const risks = new Map(content.risks.map((risk) => [risk.riskId, risk] as const));
    return {
      ...content,
      items: empty.items.map((item, index) => {
        const carried = items.get(item.itemId);
        return carried === undefined || (carried.score !== null && !validEvaluationScore(carried.score, to.items[index]!.fullMarks)) ? item : { ...carried };
      }),
      risks: empty.risks.map((risk) => ({ ...(risks.get(risk.riskId) ?? risk) })),
    };
  }

  /**
   * 保存评估 or 定稿 (EVAL-001, EVAL-004, EVAL-007), inside the caller's transaction: the editor's whole content appended to the
   * version's chain — refused when the version belongs to another Book, is already 定稿, moved since the editor read it, or
   * would record nothing new — and `定稿` closing it with the actor and the time.
   */
  save(bookId: string, recordId: string, expectedEntries: number, content: unknown, finalize: boolean): void {
    requireEvaluation(UUID_PATTERN.test(recordId), 'EVALUATION_NOT_FOUND', '没有这个评估版本。');
    const row = this.#db.prepare('SELECT * FROM evaluation_records WHERE record_id = ?').get(recordId) as SqlRow | undefined;
    requireEvaluation(row !== undefined, 'EVALUATION_NOT_FOUND', '没有这个评估版本。');
    const record = this.#record(row);
    requireEvaluation(record.bookId === bookId, 'EVALUATION_NOT_FOUND', '这个评估版本不属于当前图书。');
    const entries = this.#entries(record);
    const last = entries.at(-1)!;
    requireEvaluation(last.kind !== 'finalized', 'EVALUATION_FINALIZED', `第 ${record.ordinal} 版已经定稿，不能再改；要改就重新评估。`);
    requireEvaluation(entries.length === expectedEntries, 'EVALUATION_MOVED', '这一版评估刚在另一个窗口保存过；请看过最新的再改。');
    const { sha256: _digest, ...profile } = record.profile;
    const checked = evaluationContent(content, profile, finalize);
    requireEvaluation(finalize || !sameContent(checked, last.content), 'EVALUATION_UNCHANGED', '评估没有变化。');
    this.#append(record, last.sha256, entries.length + 1, finalize ? 'finalized' : 'draft', checked);
  }

  #summary(record: StoredRecord, entries: ReadonlyArray<StoredEntry>): EvaluationRecordSummaryProjection {
    const last = entries.at(-1)!;
    return {
      recordId: record.recordId,
      ordinal: record.ordinal,
      state: last.kind === 'finalized' ? 'finalized' : 'editing',
      revisionLabel: record.revisionLabel,
      total: totalOf(record.profile, last.content),
      conclusion: last.content.conclusion,
      createdAt: record.createdAt,
      finalizedAt: last.kind === 'finalized' ? last.recordedAt : null,
    };
  }

  #comparison(previous: { record: StoredRecord; entries: ReadonlyArray<StoredEntry> } | undefined, current: { record: StoredRecord; content: EvaluationContent }): EvaluationComparisonProjection | null {
    if (previous === undefined) return null;
    const before = previous.entries.at(-1)!.content;
    const value = (item: EvaluationContent['items'][number] | undefined): number | 'not-rated' | null =>
      item === undefined ? null : item.notRated !== null ? 'not-rated' : item.score;
    return {
      previousOrdinal: previous.record.ordinal,
      items: current.record.profile.items.map((item, index) => ({
        itemId: item.itemId,
        previous: value(before.items.find((entry) => entry.itemId === item.itemId)),
        current: value(current.content.items[index]),
      })),
      risks: current.record.profile.risks.map((risk, index) => ({
        riskId: risk.riskId,
        previous: before.risks.find((entry) => entry.riskId === risk.riskId)?.level ?? null,
        current: current.content.risks[index]!.level,
      })),
      total: { previous: totalOf(previous.record.profile, before), current: totalOf(current.record.profile, current.content) },
      conclusion: { previous: before.conclusion, current: current.content.conclusion },
    };
  }

  /** ②C 评估 of one Book (EVAL-001, EVAL-012): every version newest first, one on show with its comparison, and whether to begin. */
  workspace(bookId: string, bookTitle: string, recordId: string | null): EvaluationWorkspaceProjection {
    const records = this.#records(bookId);
    const chains = records.map((record) => ({ record, entries: this.#entries(record) }));
    const shown = recordId === null ? chains.at(-1) : chains.find((chain) => chain.record.recordId === recordId);
    requireEvaluation(recordId === null || shown !== undefined, 'EVALUATION_NOT_FOUND', '没有这个评估版本。');
    let record: EvaluationRecordProjection | null = null;
    if (shown !== undefined) {
      const last = shown.entries.at(-1)!;
      const previous = shown.record.previousRecordId === null ? undefined : chains.find((chain) => chain.record.recordId === shown.record.previousRecordId);
      record = {
        ...this.#summary(shown.record, shown.entries),
        revisionId: shown.record.revisionId,
        uncheckpointed: shown.record.uncheckpointed,
        profile: shown.record.profile,
        content: last.content,
        entries: shown.entries.length,
        savedAt: last.recordedAt,
        finalized: last.kind === 'finalized' ? { actor: EVALUATION_ACTOR, at: last.recordedAt } : null,
        recommendationBlocked: recommendationBlocked(last.content.risks),
        comparison: this.#comparison(previous, { record: shown.record, content: last.content }),
      };
    }
    const manuscript = this.#manuscripts.current(bookId);
    const open = chains.at(-1);
    const start: EvaluationWorkspaceProjection['start'] = manuscript === null
      ? { allowed: false, reason: '这本书还没有稿件，没有可以评估的内容。' }
      : open !== undefined && open.entries.at(-1)!.kind !== 'finalized'
        ? { allowed: false, reason: `第 ${open.record.ordinal} 版还没有定稿；定稿后才能重新评估。` }
        : { allowed: true, kind: open === undefined ? 'first' : 'again' };
    return {
      bookId,
      bookTitle,
      manuscript: manuscript === null ? null : { revisionId: manuscript.revisionId, revisionLabel: manuscript.revisionLabel, uncheckpointed: manuscript.uncheckpointed },
      profile: this.profile(),
      records: chains.map((chain) => this.#summary(chain.record, chain.entries)).reverse(),
      record,
      start,
    };
  }

  /** 知识库 › 评估方案: the profile a new version snapshots, with how many versions of how many Books used it. */
  profiles(): EvaluationProfilesProjection {
    const profile = this.profile();
    const use = this.#db.prepare('SELECT count(*) AS records, count(DISTINCT book_id) AS books FROM evaluation_records WHERE profile_sha256 = ?').get(profile.sha256) as SqlRow;
    return { profiles: [{ ...profile, records: integer(use.records), books: integer(use.books) }] };
  }
}
