import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  HISTORICALLY_AFFECTED_RESULT_MARKER,
  MAX_SERIES_EXCLUSION_REASON_CHARACTERS,
  SERIES_EXCLUSION_ACTIONS,
  SERIES_EXCLUSION_TARGET_KINDS,
  SERIES_KNOWLEDGE_CLASSES,
  SERIES_KNOWLEDGE_CLASS_LABELS,
  SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL,
  type SeriesExclusionAction,
  type SeriesExclusionHistoryCursor,
  type SeriesExclusionImpactGroupProjection,
  type SeriesExclusionTargetKind,
  type SeriesExclusionTargetProjection,
  type SeriesKnowledgeClass,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';

/**
 * 书系检索排除 (Issue #64, plan slice S29b; V2-UX-SER-020 to SER-029; ADR 0037). A Series Retrieval Exclusion names one exact
 * Series and one exact target — a Series Knowledge Item, a stable knowledge class, a member Book or a Source Version — and from
 * the instant it is recorded it is a current-read guard: every later Series read that would reach the target is refused, a
 * not-yet-performed read of an authorized or running Run included. `修改检索排除` (its reason) and `停止此排除` append a
 * superseding revision; no revision is ever edited or deleted, and ending one restores nothing it stopped.
 *
 * The one Series read there is today is 书系一致性 (S29a), over Series Knowledge. So an item covers its current and later
 * revisions, a class the items of that class now and later, and a member Book the knowledge taken from its manuscript now and
 * later; a Source Version is recorded so the ledger is whole, and nothing reads one yet. No Cross-project source exists, so an
 * exclusion decides no Cross-project access (SER-029).
 *
 * Schema revision 61 owns one relation, a ledger like the others: each revision, canonical and digested, appended once.
 */

export const SERIES_RETRIEVAL_EXCLUSION_SCHEMA_SQL = {
  series_retrieval_exclusions: `CREATE TABLE series_retrieval_exclusions (
  revision_id TEXT PRIMARY KEY,
  exclusion_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  series_id TEXT NOT NULL REFERENCES series(series_id),
  target_kind TEXT NOT NULL CHECK(target_kind IN (${SERIES_EXCLUSION_TARGET_KINDS.map((kind) => `'${kind}'`).join(', ')})),
  target_id TEXT NOT NULL CHECK(length(target_id) BETWEEN 1 AND 64),
  action TEXT NOT NULL CHECK(action IN (${SERIES_EXCLUSION_ACTIONS.map((action) => `'${action}'`).join(', ')})),
  reason TEXT NOT NULL CHECK(length(reason) <= ${MAX_SERIES_EXCLUSION_REASON_CHARACTERS}),
  preview_digest TEXT NOT NULL CHECK(length(preview_digest) = 64),
  supersedes_revision_id TEXT REFERENCES series_retrieval_exclusions(revision_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((revision = 1) = (supersedes_revision_id IS NULL)),
  CHECK((revision = 1) = (action = 'add')),
  UNIQUE(exclusion_id, revision)
) STRICT`,
} as const;

export const SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL: Readonly<Record<string, string>> = {
  series_retrieval_exclusions_no_update: `CREATE TRIGGER series_retrieval_exclusions_no_update
    BEFORE UPDATE ON series_retrieval_exclusions
    BEGIN
      SELECT RAISE(ABORT, 'SERIES_EXCLUSION_LEDGER_IMMUTABLE');
    END`,
  series_retrieval_exclusions_no_delete: `CREATE TRIGGER series_retrieval_exclusions_no_delete
    BEFORE DELETE ON series_retrieval_exclusions
    BEGIN
      SELECT RAISE(ABORT, 'SERIES_EXCLUSION_LEDGER_IMMUTABLE');
    END`,
};

export const SERIES_RETRIEVAL_EXCLUSION_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  series_retrieval_exclusions: [
    'series_id>series.series_id:NO ACTION/NO ACTION/NONE',
    'supersedes_revision_id>series_retrieval_exclusions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class SeriesExclusionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SeriesExclusionError';
  }
}

function requireExclusion(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new SeriesExclusionError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const REVISION_SCHEMA = 'ai7.series-retrieval-exclusion/1';
const PREVIEW_SCHEMA = 'ai7.series-retrieval-exclusion-preview/1';
const ACTOR = '本机编辑';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'series_retrieval_exclusions'";
const INVALID = '书系检索排除记录已损坏。';
const DIGEST = /^[0-9a-f]{64}$/u;

/** Revision 61's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeSeriesRetrievalExclusionSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(SERIES_RETRIEVAL_EXCLUSION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Series Retrieval Exclusion schema rollback failed.');
    }
    throw error;
  }
}

/** An exclusion's reason as it is recorded: empty, or up to 200 characters on one line, NFC-normalized and trimmed. */
export function seriesExclusionReason(value: unknown): string | null {
  if (typeof value !== 'string' || !value.isWellFormed()) return null;
  const text = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (/[\u0000-\u001f\u007f]/u.test(text) || [...text].length > MAX_SERIES_EXCLUSION_REASON_CHARACTERS) return null;
  return text;
}

export function isSeriesExclusionTargetKind(value: unknown): value is SeriesExclusionTargetKind {
  return typeof value === 'string' && (SERIES_EXCLUSION_TARGET_KINDS as readonly string[]).includes(value);
}

export function isSeriesExclusionAction(value: unknown): value is SeriesExclusionAction {
  return typeof value === 'string' && (SERIES_EXCLUSION_ACTIONS as readonly string[]).includes(value);
}

/** What a target of each kind keeps covering after it is recorded (SER-020, SER-021): continuing, or fixed to the one. */
export const SERIES_EXCLUSION_CONTINUING: Readonly<Record<SeriesExclusionTargetKind, string>> = {
  'knowledge-item': '这个条目现在和以后的修订版都一并排除。',
  'knowledge-class': '这一类现有的条目和以后新纳入的同类条目都一并排除，直到停止此排除。',
  book: '取自这本书稿件的书系知识，现在的和以后纳入的都一并排除。',
  'source-version': '只排除这一个来源版本，不包括这本书以后的来源版本。',
};

/** A target in the editor's words, given the names its identity resolves to now. */
export function seriesExclusionTarget(kind: SeriesExclusionTargetKind, id: string, names: {
  readonly subject?: string;
  readonly knowledgeClass?: SeriesKnowledgeClass;
  readonly bookTitle?: string;
  readonly displayName?: string;
}): SeriesExclusionTargetProjection {
  const label = kind === 'knowledge-item'
    ? `书系知识条目「${names.subject ?? ''}」（${names.knowledgeClass === undefined ? '' : SERIES_KNOWLEDGE_CLASS_LABELS[names.knowledgeClass]}）`
    : kind === 'knowledge-class'
      ? `知识类别「${SERIES_KNOWLEDGE_CLASS_LABELS[id as SeriesKnowledgeClass]}」`
      : kind === 'book'
        ? `成员图书《${names.bookTitle ?? ''}》`
        : `来源版本「${names.displayName ?? ''}」（《${names.bookTitle ?? ''}》）`;
  return { kind, id, label, continuing: SERIES_EXCLUSION_CONTINUING[kind], read: kind !== 'source-version' };
}

function isTarget(value: unknown): value is SeriesExclusionTargetProjection {
  return isRecord(value) && isSeriesExclusionTargetKind(value.kind) && typeof value.id === 'string' && typeof value.label === 'string' &&
    value.continuing === SERIES_EXCLUSION_CONTINUING[value.kind] && value.read === (value.kind !== 'source-version');
}

/**
 * What a stop for an exclusion says (SER-024, SER-025). A category stopped before its turn sent nothing; a Run stopped between
 * its reading ranges keeps what it read, and data already sent cannot be recalled. Either way only 修改计划并重新授权 or
 * 取消任务 goes on from it.
 */
export function seriesScopeStopDetail(targets: ReadonlyArray<string>): string {
  return `${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}：这一类所依据的${targets.join('、')}已排除在书系检索之外，它在读取前停下，没有发送任何内容。只能修改计划并重新授权，或取消任务。`;
}

/**
 * How the outcome of a Run the guard stopped between its reading ranges begins: the Review Run reads its category's stop from
 * it. The words after it are the Run's own.
 */
export const SERIES_SCOPE_STOP_SUMMARY = `${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}：所依据的书系材料已排除在书系检索之外，运行在下一个阅读范围前停下；已读完的结果保留，已经发给模型服务的内容无法收回。` as const;

/** Why a prepared plan's one approval is refused: what it would read is excluded now (SER-023). */
export function seriesScopeChangedReason(label: string, targets: ReadonlyArray<string>): string {
  return `「${label}」：${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}——它所依据的${targets.join('、')}已排除在书系检索之外；请重新准备这次审阅。`;
}

/** The four groups of 书系检索排除影响预览, in the order SER-022 fixes. */
export const SERIES_EXCLUSION_IMPACT_GROUPS = [
  { key: 'future-reads', title: '今后的检索' },
  { key: 'runs', title: '已排队、已授权或正在运行的任务' },
  { key: 'history', title: '已完成的历史' },
  { key: 'unaffected', title: '不受影响的授权' },
] as const;

function isImpact(value: unknown): value is SeriesExclusionImpactGroupProjection[] {
  return Array.isArray(value) && value.length === SERIES_EXCLUSION_IMPACT_GROUPS.length && value.every((group, index) =>
    isRecord(group) && group.key === SERIES_EXCLUSION_IMPACT_GROUPS[index]!.key && group.title === SERIES_EXCLUSION_IMPACT_GROUPS[index]!.title &&
    Array.isArray(group.changes) && group.changes.every((line) => typeof line === 'string') &&
    Array.isArray(group.unchanged) && group.unchanged.every((line) => typeof line === 'string'));
}

/** The facts a preview states, read by the store from the records that own them. */
export interface SeriesExclusionImpactFacts {
  readonly seriesTitle: string;
  readonly target: SeriesExclusionTargetProjection;
  /** The reason the revision records, and the one it supersedes for `修改检索排除`. */
  readonly reason: string;
  readonly priorReason: string | null;
  /** The Series Knowledge Items the target reaches now, by label — at most a few named — and how many in all. */
  readonly itemsNamed: ReadonlyArray<string>;
  readonly itemCount: number;
  /** Authorized Runs whose next read the exclusion stops, by route — at most a few named — and how many in all. */
  readonly runsNamed: ReadonlyArray<string>;
  readonly runCount: number;
  /** Runs prepared and not yet authorized that read the target: their approval is refused, and they are prepared again. */
  readonly preparedCount: number;
  /** Completed results that used the target, by route — at most a few named — and how many in all. */
  readonly completedNamed: ReadonlyArray<string>;
  readonly completedCount: number;
}

function group(key: SeriesExclusionImpactGroupProjection['key'], changes: string[], unchanged: string[]): SeriesExclusionImpactGroupProjection {
  const title = SERIES_EXCLUSION_IMPACT_GROUPS.find((entry) => entry.key === key)!.title;
  return { key, title, changes, unchanged };
}

function named(names: ReadonlyArray<string>, count: number): string {
  const listed = names.join('、');
  return count > names.length ? `${listed}等 ${count} 个` : listed;
}

/** What stays as it is whatever the exclusion does (SER-025, SER-029). */
const UNAFFECTED = [
  '图书、稿件和来源版本不会被删除或隐藏；书系成员和学习准入都不变。',
  '只限这个书系的检索：AI7 现在还没有跨项目来源，这条排除也不决定跨项目访问。',
  '不读书系材料的任务和它们的授权不受影响。',
];

/**
 * 书系检索排除影响预览 (SER-021, SER-022, SER-025 to SER-027): what the revision does and what it leaves as it is, in four
 * groups that are never collapsed into one, and never in a membership change's prospective words.
 */
export function seriesExclusionImpact(action: SeriesExclusionAction, facts: SeriesExclusionImpactFacts): SeriesExclusionImpactGroupProjection[] {
  const target = facts.target.label;
  const items = facts.itemCount === 0
    ? facts.target.read
      ? `现在还没有书系知识条目属于${target}；以后纳入的也会被排除。`
      : `现在还没有哪项书系检索读取${target}；这条排除先记下，以后读取来源版本的检索都要遵守。`
    : `现在涉及 ${facts.itemCount} 个书系知识条目：${named(facts.itemsNamed, facts.itemCount)}。`;
  if (action === 'add') {
    const runs: string[] = [];
    if (facts.runCount > 0) {
      runs.push(`${facts.runCount} 个已授权或正在运行的任务会在下一次读取前停下，显示「${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}」：${named(facts.runsNamed, facts.runCount)}。`);
      runs.push('它们只能「修改计划并重新授权」或「取消任务」，不能续行、重试，也不会改用别的材料。');
    }
    if (facts.preparedCount > 0) runs.push(`${facts.preparedCount} 次已准备、尚未授权的审阅不能再授权，需要重新准备。`);
    return [
      group('future-reads', [`记录后立即生效：以后的书系检索不再读取${target}。`, items, facts.target.continuing],
        ['书系知识本身和它的历次版本都不变；这不是删除。']),
      group('runs', runs, [
        ...(facts.runCount === 0 && facts.preparedCount === 0 ? ['现在没有已排队、已授权或正在运行的任务用到这些材料。'] : []),
        '已经冻结的计划、授权和已经读到的内容保持原样；已经发给模型服务的内容无法收回。',
      ]),
      group('history', facts.completedCount === 0 ? [] : [`${facts.completedCount} 个已完成的结果用过这些材料，会标上「${HISTORICALLY_AFFECTED_RESULT_MARKER}」：${named(facts.completedNamed, facts.completedCount)}。`],
        ['已完成的结果、发现和报告都不会改写；这个标记不表示结果有错，也不删除任何内容。']),
      group('unaffected', [], UNAFFECTED),
    ];
  }
  if (action === 'change') {
    const reason = facts.reason.length === 0 ? '去掉排除理由。' : `排除理由改为「${facts.reason}」。`;
    return [
      group('future-reads', [reason], [`排除的对象和范围不变：以后的书系检索仍然不读取${target}。`]),
      group('runs', [], ['因这条排除停下的任务保持停下；已经冻结的计划和授权保持原样。']),
      group('history', [], [`已标上「${HISTORICALLY_AFFECTED_RESULT_MARKER}」的结果保留这个标记。`]),
      group('unaffected', [], UNAFFECTED),
    ];
  }
  return [
    group('future-reads', [`以后的书系检索重新可以读取${target}；要用到它，仍要重新准备计划并授权。`, items], []),
    group('runs', [], ['因这条排除停下的任务不会自动恢复，旧的授权和来源范围也不会恢复；要继续，需修改计划并重新授权。']),
    group('history', [], [`已标上「${HISTORICALLY_AFFECTED_RESULT_MARKER}」的结果保留这个标记；以前的排除记录都保留。`]),
    group('unaffected', [], UNAFFECTED),
  ];
}

/** The digest a preview carries: the revision it would append, the chain it follows, what governs it, and every line it shows. */
export function seriesExclusionPreviewDigest(input: {
  readonly seriesId: string;
  readonly action: SeriesExclusionAction;
  readonly exclusionId: string | null;
  readonly target: SeriesExclusionTargetProjection;
  readonly reason: string;
  readonly chainHead: string | null;
  readonly governingDigest: string;
  readonly groups: ReadonlyArray<SeriesExclusionImpactGroupProjection>;
}): string {
  return sha256Hex(canonicalJson({ schema: PREVIEW_SCHEMA, ...input }));
}

export interface StoredExclusionRevision {
  readonly revisionId: string;
  readonly exclusionId: string;
  readonly revision: number;
  readonly seriesId: string;
  readonly target: SeriesExclusionTargetProjection;
  readonly action: SeriesExclusionAction;
  readonly reason: string;
  readonly previewDigest: string;
  readonly impact: ReadonlyArray<SeriesExclusionImpactGroupProjection>;
  readonly supersedes: string | null;
  readonly recordedAt: string;
}

/** One exclusion's whole chain, oldest first, verified link by link. */
export interface StoredExclusion {
  readonly exclusionId: string;
  readonly seriesId: string;
  readonly target: SeriesExclusionTargetProjection;
  readonly revisions: ReadonlyArray<StoredExclusionRevision>;
  readonly current: StoredExclusionRevision;
  /** In force now: its latest revision is not `停止此排除`. */
  readonly effective: boolean;
  /** When it first took effect: its first revision's instant. */
  readonly since: string;
}

/** What one piece of Series Knowledge is, as an exclusion decides whether it reaches it. */
export interface SeriesKnowledgeMaterial {
  readonly seriesId: string;
  readonly itemId: string;
  readonly knowledgeClass: SeriesKnowledgeClass;
  /** The member Book whose manuscript the revision was taken from; `null` for the editor's own words. */
  readonly sourceBookId: string | null;
}

/** Whether a target reaches one piece of knowledge of its own Series. A Source Version reaches none: no Series read reads one. */
export function seriesExclusionCovers(seriesId: string, target: { readonly kind: SeriesExclusionTargetKind; readonly id: string }, material: SeriesKnowledgeMaterial): boolean {
  if (seriesId !== material.seriesId) return false;
  switch (target.kind) {
    case 'knowledge-item':
      return target.id === material.itemId;
    case 'knowledge-class':
      return target.id === material.knowledgeClass;
    case 'book':
      return material.sourceBookId !== null && target.id === material.sourceBookId;
    case 'source-version':
      return false;
  }
}

/** The exclusions in force that reach a piece of knowledge, by their targets' labels. */
export function coveringExclusions(effective: ReadonlyArray<StoredExclusion>, material: SeriesKnowledgeMaterial): StoredExclusion[] {
  return effective.filter((exclusion) => exclusion.effective && seriesExclusionCovers(exclusion.seriesId, exclusion.target, material));
}

/**
 * Whether a revision that was ever in force — `添加检索排除` or `修改检索排除`, never `停止此排除` — reached the material after
 * `since`: the material a result used was later excluded (SER-026). Read from the append-only ledger, it never goes away.
 */
export function excludedAfter(chains: ReadonlyArray<StoredExclusion>, material: SeriesKnowledgeMaterial, since: string): boolean {
  return chains.some((chain) => seriesExclusionCovers(chain.seriesId, chain.target, material) &&
    chain.revisions.some((revision) => revision.action !== 'end' && revision.recordedAt > since));
}

/** The knowledge class and source Book of one exact Series Knowledge revision, read from its rows; `null` when there is none. */
export function knowledgeMaterial(db: DatabaseSync, pin: { readonly seriesId: string; readonly itemId: string; readonly revisionId: string }): SeriesKnowledgeMaterial | null {
  const row = db.prepare(`SELECT i.knowledge_class, r.source_book_id FROM series_knowledge_revisions r
    JOIN series_knowledge_items i ON i.item_id = r.item_id WHERE r.revision_id = ? AND r.item_id = ? AND i.series_id = ?`)
    .get(pin.revisionId, pin.itemId, pin.seriesId) as SqlRow | undefined;
  if (row === undefined || !(SERIES_KNOWLEDGE_CLASSES as readonly string[]).includes(String(row.knowledge_class))) return null;
  return {
    seriesId: pin.seriesId,
    itemId: pin.itemId,
    knowledgeClass: row.knowledge_class as SeriesKnowledgeClass,
    sourceBookId: row.source_book_id === null ? null : String(row.source_book_id),
  };
}

/** The order a revision is listed in, newest first, so a page can start after any of them. */
function newestFirst(left: { readonly recordedAt: string; readonly revisionId: string }, right: { readonly recordedAt: string; readonly revisionId: string }): number {
  const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return text(right.recordedAt, left.recordedAt) || text(right.revisionId, left.revisionId);
}

export class SeriesExclusionLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Every exclusion of a Series, each chain verified whole; oldest first by when each began. */
  chains(seriesId: string): StoredExclusion[] {
    if (this.#db.prepare(TABLE_PRESENT).get() === undefined) return [];
    const rows = this.#db.prepare('SELECT * FROM series_retrieval_exclusions WHERE series_id = ? ORDER BY exclusion_id, revision').iterate(seriesId) as Iterable<SqlRow>;
    const chains: StoredExclusion[] = [];
    let open: StoredExclusionRevision[] = [];
    const close = (): void => {
      if (open.length === 0) return;
      const first = open[0]!;
      const current = open.at(-1)!;
      chains.push({ exclusionId: first.exclusionId, seriesId: first.seriesId, target: first.target, revisions: open, current, effective: current.action !== 'end', since: first.recordedAt });
      open = [];
    };
    for (const row of rows) {
      if (open.length > 0 && open[0]!.exclusionId !== row.exclusion_id) close();
      open.push(this.#verified(row, open.at(-1) ?? null));
    }
    close();
    return chains.sort((left, right) => (left.since < right.since ? -1 : left.since > right.since ? 1 : left.exclusionId < right.exclusionId ? -1 : 1));
  }

  /** The exclusions of a Series in force now. */
  effective(seriesId: string): StoredExclusion[] {
    return this.chains(seriesId).filter((chain) => chain.effective);
  }

  /** One exclusion's chain, or `null` when there is none by that identity in that Series. */
  exclusion(seriesId: string, exclusionId: string): StoredExclusion | null {
    return this.chains(seriesId).find((chain) => chain.exclusionId === exclusionId) ?? null;
  }

  /** A page of a Series' revisions after the one named, newest first, and how many there are in all. */
  historyPage(seriesId: string, after: SeriesExclusionHistoryCursor | null, limit: number): { entries: StoredExclusionRevision[]; count: number } {
    const all = this.chains(seriesId).flatMap((chain) => chain.revisions).sort(newestFirst);
    const rest = after === null ? all : all.filter((entry) => newestFirst(entry, after) > 0);
    return { entries: rest.slice(0, limit), count: all.length };
  }

  #verified(row: SqlRow, before: StoredExclusionRevision | null): StoredExclusionRevision {
    const json = String(row.canonical_json);
    requireExclusion(sha256Hex(json) === String(row.sha256), 'SERIES_EXCLUSION_RECORD_INVALID', INVALID);
    const record = JSON.parse(json) as unknown;
    const revision = Number(row.revision);
    requireExclusion(isRecord(record) && record.schema === REVISION_SCHEMA && record.revisionId === row.revision_id &&
      record.exclusionId === row.exclusion_id && record.revision === revision && record.seriesId === row.series_id &&
      isTarget(record.target) && record.target.kind === row.target_kind && record.target.id === row.target_id &&
      isSeriesExclusionAction(record.action) && record.action === row.action && record.reason === row.reason &&
      record.previewDigest === row.preview_digest && DIGEST.test(String(row.preview_digest)) && isImpact(record.impact) &&
      record.recordedAt === row.recorded_at && record.actor === ACTOR &&
      (record.supersedes ?? null) === (row.supersedes_revision_id ?? null) && (record.supersedes ?? null) === (before?.revisionId ?? null) &&
      revision === (before?.revision ?? 0) + 1 && (before === null) === (record.action === 'add') && before?.action !== 'end' &&
      (before === null || (canonicalJson(before.target) === canonicalJson(record.target) && before.seriesId === record.seriesId)),
    'SERIES_EXCLUSION_RECORD_INVALID', INVALID);
    return {
      revisionId: String(row.revision_id),
      exclusionId: String(row.exclusion_id),
      revision,
      seriesId: String(row.series_id),
      target: record.target as SeriesExclusionTargetProjection,
      action: record.action as SeriesExclusionAction,
      reason: String(row.reason),
      previewDigest: String(row.preview_digest),
      impact: record.impact as SeriesExclusionImpactGroupProjection[],
      supersedes: row.supersedes_revision_id === null ? null : String(row.supersedes_revision_id),
      recordedAt: String(row.recorded_at),
    };
  }

  /**
   * One revision, inside the caller's transaction, with the preview the editor saw: the caller has recomputed it and compared
   * digests. `添加检索排除` starts a chain; `修改检索排除` and `停止此排除` supersede the chain's latest revision, which must still
   * be in force.
   */
  record(input: {
    readonly seriesId: string;
    readonly action: SeriesExclusionAction;
    readonly prior: StoredExclusion | null;
    readonly target: SeriesExclusionTargetProjection;
    readonly reason: string;
    readonly previewDigest: string;
    readonly impact: ReadonlyArray<SeriesExclusionImpactGroupProjection>;
  }): StoredExclusionRevision {
    requireExclusion(isSeriesExclusionAction(input.action) && isTarget(input.target) && seriesExclusionReason(input.reason) === input.reason &&
      DIGEST.test(input.previewDigest) && isImpact(input.impact) && (input.action === 'add') === (input.prior === null) &&
      (input.prior === null || (input.prior.effective && input.prior.seriesId === input.seriesId)),
    'SERIES_EXCLUSION_INVALID', '书系检索排除无效。');
    const exclusionId = input.prior?.exclusionId ?? randomUUID();
    const revisionId = randomUUID();
    const revision = (input.prior?.current.revision ?? 0) + 1;
    const supersedes = input.prior?.current.revisionId ?? null;
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: REVISION_SCHEMA,
      revisionId,
      exclusionId,
      revision,
      seriesId: input.seriesId,
      target: input.target,
      action: input.action,
      reason: input.reason,
      previewDigest: input.previewDigest,
      impact: input.impact,
      supersedes,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO series_retrieval_exclusions(revision_id, exclusion_id, revision, series_id, target_kind, target_id, action, reason, preview_digest,
         supersedes_revision_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(revisionId, exclusionId, revision, input.seriesId, input.target.kind, input.target.id, input.action, input.reason, input.previewDigest,
      supersedes, recordedAt, record.json, record.digest);
    return { revisionId, exclusionId, revision, seriesId: input.seriesId, target: input.target, action: input.action, reason: input.reason,
      previewDigest: input.previewDigest, impact: input.impact, supersedes, recordedAt };
  }
}
