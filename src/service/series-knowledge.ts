import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS,
  MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN,
  MAX_SERIES_KNOWLEDGE_QUOTE_GRAPHEMES,
  MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS,
  SERIES_KNOWLEDGE_CLASSES,
  SERIES_KNOWLEDGE_CLASS_LABELS,
  SERIES_KNOWLEDGE_REUSE_SCOPES,
  publicationText,
  type SeriesKnowledgeClass,
  type SeriesKnowledgeConflictProjection,
  type SeriesKnowledgeReuseScope,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';
import { graphemesOf } from '../shared/mark-anchor.js';

/**
 * 书系知识 (Issue #63, plan slice S28b; V2-UX-SER-013 to SER-019; ADR 0036). Series Knowledge enters only through an explicit
 * review: an editor-authored draft or the exact span of a member Book's manuscript becomes a non-authoritative Series Knowledge
 * Candidate for a new or an exact existing Series Knowledge Item; 书系知识纳入审阅 shows its item, content, provenance, the
 * disclosed conflicts and where it may later be used; and only `纳入书系知识` creates the item with its first immutable revision
 * or appends one revision to the exact item, with one Series Knowledge Promotion Decision. The Book and its manuscript remain
 * the source of record; promotion creates no Run Source Scope, performs no retrieval and permits no transmission.
 *
 * Conflicts are found by identity only — the same item, or the same name — never by what the words mean.
 *
 * Schema revision 53 owns five relations, ledgers like the others: each candidate's versions, the items, their revisions,
 * the promotion decisions, and individually retained conflicts. Each record is canonical and digested, appended once and never rewritten.
 */

const CLASS_CHECK = SERIES_KNOWLEDGE_CLASSES.map((entry) => `'${entry}'`).join(', ');
const REUSE_CHECK = SERIES_KNOWLEDGE_REUSE_SCOPES.map((entry) => `'${entry}'`).join(', ');

export const SERIES_KNOWLEDGE_SCHEMA_SQL = {
  series_knowledge_items: `CREATE TABLE series_knowledge_items (
  item_id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(series_id),
  subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND ${MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS}),
  knowledge_class TEXT NOT NULL CHECK(knowledge_class IN (${CLASS_CHECK})),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  series_knowledge_candidates: `CREATE TABLE series_knowledge_candidates (
  version_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  series_id TEXT NOT NULL REFERENCES series(series_id),
  target_item_id TEXT REFERENCES series_knowledge_items(item_id),
  subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND ${MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS}),
  knowledge_class TEXT NOT NULL CHECK(knowledge_class IN (${CLASS_CHECK})),
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND ${MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS}),
  authoring TEXT NOT NULL CHECK(authoring IN ('editor', 'manuscript-revision')),
  source_book_id TEXT REFERENCES books(book_id),
  supersedes_version_id TEXT REFERENCES series_knowledge_candidates(version_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((version = 1) = (supersedes_version_id IS NULL)),
  CHECK((authoring = 'editor') = (source_book_id IS NULL)),
  UNIQUE(candidate_id, version)
) STRICT`,
  series_knowledge_revisions: `CREATE TABLE series_knowledge_revisions (
  revision_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES series_knowledge_items(item_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND ${MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS}),
  candidate_version_id TEXT NOT NULL UNIQUE REFERENCES series_knowledge_candidates(version_id),
  source_book_id TEXT REFERENCES books(book_id),
  supersedes_revision_id TEXT REFERENCES series_knowledge_revisions(revision_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((ordinal = 1) = (supersedes_revision_id IS NULL)),
  UNIQUE(item_id, ordinal)
) STRICT`,
  series_knowledge_conflicts: `CREATE TABLE series_knowledge_conflicts (
  revision_id TEXT NOT NULL REFERENCES series_knowledge_revisions(revision_id) DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  kind TEXT NOT NULL CHECK(kind IN ('existing-item', 'competing-candidate', 'item-updated')),
  line TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(revision_id, ordinal)
) STRICT`,
  series_knowledge_promotions: `CREATE TABLE series_knowledge_promotions (
  decision_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE,
  candidate_version_id TEXT NOT NULL UNIQUE REFERENCES series_knowledge_candidates(version_id),
  revision_id TEXT NOT NULL UNIQUE REFERENCES series_knowledge_revisions(revision_id),
  outcome TEXT NOT NULL CHECK(outcome IN ('created', 'updated')),
  conflict_disposition TEXT NOT NULL CHECK(conflict_disposition IN ('none', 'preserved')),
  reuse_scope TEXT NOT NULL CHECK(reuse_scope IN (${REUSE_CHECK})),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

export const SERIES_KNOWLEDGE_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(SERIES_KNOWLEDGE_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'SERIES_KNOWLEDGE_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'SERIES_KNOWLEDGE_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const SERIES_KNOWLEDGE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  series_knowledge_items: ['series_id>series.series_id:NO ACTION/NO ACTION/NONE'],
  series_knowledge_candidates: [
    'series_id>series.series_id:NO ACTION/NO ACTION/NONE',
    'source_book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'supersedes_version_id>series_knowledge_candidates.version_id:NO ACTION/NO ACTION/NONE',
    'target_item_id>series_knowledge_items.item_id:NO ACTION/NO ACTION/NONE',
  ],
  series_knowledge_revisions: [
    'candidate_version_id>series_knowledge_candidates.version_id:NO ACTION/NO ACTION/NONE',
    'item_id>series_knowledge_items.item_id:NO ACTION/NO ACTION/NONE',
    'source_book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'supersedes_revision_id>series_knowledge_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  series_knowledge_conflicts: ['revision_id>series_knowledge_revisions.revision_id:NO ACTION/NO ACTION/NONE'],
  series_knowledge_promotions: [
    'candidate_version_id>series_knowledge_candidates.version_id:NO ACTION/NO ACTION/NONE',
    'revision_id>series_knowledge_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class SeriesKnowledgeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SeriesKnowledgeError';
  }
}

function requireKnowledge(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new SeriesKnowledgeError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const CANDIDATE_SCHEMA = 'ai7.series-knowledge-candidate/1';
const ITEM_SCHEMA = 'ai7.series-knowledge-item/1';
const REVISION_SCHEMA = 'ai7.series-knowledge-revision/2';
const CONFLICT_SCHEMA = 'ai7.series-knowledge-conflict/1';
const PROMOTION_SCHEMA = 'ai7.series-knowledge-promotion/1';
const REVIEW_SCHEMA = 'ai7.series-knowledge-review/1';
const ACTOR = '本机编辑';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'series_knowledge_items'";
const INVALID = '书系知识记录已损坏。';

/** Revision 53's relations, created once: a store that predates them gains five empty relations and nothing existing moves. */
export function initializeSeriesKnowledgeSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(SERIES_KNOWLEDGE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(SERIES_KNOWLEDGE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Series Knowledge schema rollback failed.');
    }
    throw error;
  }
}

/** An item's name as it is recorded: 1 to 40 characters on one line, NFC-normalized and trimmed, spaces collapsed. */
export function seriesKnowledgeSubject(value: unknown): string | null {
  const text = publicationText(value, MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS);
  if (text === null || /[\u0000-\u001f\u007f]/u.test(text)) return null;
  return text.replace(/\s+/gu, ' ');
}

/** What makes two names the same name: spacing and case do not tell them apart. */
export function seriesKnowledgeSubjectKey(subject: string): string {
  return subject.normalize('NFC').replace(/\s+/gu, '').toLowerCase();
}

/** A candidate's words: 1 to 2,000 characters, lines kept. */
export function seriesKnowledgeContent(value: unknown): string | null {
  return publicationText(value, MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS);
}

export function isSeriesKnowledgeClass(value: unknown): value is SeriesKnowledgeClass {
  return typeof value === 'string' && (SERIES_KNOWLEDGE_CLASSES as readonly string[]).includes(value);
}

export function isSeriesKnowledgeReuseScope(value: unknown): value is SeriesKnowledgeReuseScope {
  return typeof value === 'string' && (SERIES_KNOWLEDGE_REUSE_SCOPES as readonly string[]).includes(value);
}

/** The most one page of 书系知识 weighs on the wire (Issue #63 review): the Series page holds two beside its members and records. */
export const SERIES_KNOWLEDGE_PAGE_BYTES = 64 * 1024;

/** A cited passage as a list or a review shows it: whole up to `MAX_SERIES_KNOWLEDGE_QUOTE_GRAPHEMES`, beyond that its opening and `…`. */
export function knowledgeQuoteExcerpt(quote: string): string {
  const graphemes = graphemesOf(quote);
  return graphemes.length <= MAX_SERIES_KNOWLEDGE_QUOTE_GRAPHEMES ? quote : `${graphemes.slice(0, MAX_SERIES_KNOWLEDGE_QUOTE_GRAPHEMES).join('')}…`;
}

/** Where a provenance-bound candidate came from, as its record keeps it. */
export interface StoredProvenance {
  readonly kind: 'manuscript-revision';
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly journalSequence: number;
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly quote: string;
}

/** The item a candidate proposes, resolved: a new one by name and class, or an exact existing one at the revision it read. */
export type ResolvedTarget =
  | { readonly kind: 'new'; readonly subject: string; readonly knowledgeClass: SeriesKnowledgeClass }
  | { readonly kind: 'existing'; readonly itemId: string; readonly subject: string; readonly knowledgeClass: SeriesKnowledgeClass; readonly baseRevisionId: string };

export interface StoredCandidate {
  readonly versionId: string;
  readonly candidateId: string;
  readonly version: number;
  readonly seriesId: string;
  readonly target: ResolvedTarget;
  readonly content: string;
  readonly authoring: 'editor' | 'manuscript-revision';
  readonly provenance: StoredProvenance | null;
  readonly recordedAt: string;
  readonly promoted: boolean;
}

export interface StoredRevision {
  readonly revisionId: string;
  readonly itemId: string;
  readonly ordinal: number;
  readonly content: string;
  readonly authoring: 'editor' | 'manuscript-revision';
  readonly provenance: StoredProvenance | null;
  /** Bounded preview; the immutable conflict ledger retains every entry. */
  readonly conflicts: ReadonlyArray<SeriesKnowledgeConflictProjection>;
  readonly conflictCount: number;
  readonly conflictsDigest: string;
  readonly reuseScope: SeriesKnowledgeReuseScope;
  readonly candidateVersionId: string;
  readonly decisionId: string;
  readonly outcome: 'created' | 'updated';
  readonly recordedAt: string;
}

export interface StoredItem {
  readonly itemId: string;
  readonly seriesId: string;
  readonly subject: string;
  readonly knowledgeClass: SeriesKnowledgeClass;
  readonly createdAt: string;
  /** Current revision after complete history validation, with its exact total. */
  readonly current: StoredRevision;
  readonly revisionCount: number;
}

/** A disclosed conflict with what it points at, so a review can tell when it moved. */
export interface FoundConflict extends SeriesKnowledgeConflictProjection {
  readonly ref: string;
}

function isProvenance(value: unknown): value is StoredProvenance {
  return isRecord(value) && value.kind === 'manuscript-revision' && typeof value.bookId === 'string' && typeof value.manuscriptId === 'string' &&
    typeof value.branchId === 'string' && typeof value.revisionId === 'string' && typeof value.revisionLabel === 'string' &&
    Number.isSafeInteger(value.journalSequence) && typeof value.blockId === 'string' && Number.isSafeInteger(value.fromGrapheme) &&
    Number.isSafeInteger(value.toGrapheme) && typeof value.quote === 'string' && value.quote.length > 0;
}


/**
 * The conflicts a review discloses for a candidate (SER-016), by identity alone: for a new item, an item of the Series with the
 * same name; for an existing item, a revision appended since the candidate read it; and any other open candidate proposing
 * the same item or the same name. Each line names the item or the candidate and its version, never their words (Issue #63
 * review), so a review stays small however many there are.
 */
export function* seriesKnowledgeConflicts(
  candidate: Pick<StoredCandidate, 'candidateId' | 'target'>,
  items: Iterable<StoredItem>,
  open: Iterable<Pick<StoredCandidate, 'candidateId' | 'versionId' | 'version' | 'target'>>,
): IterableIterator<FoundConflict> {
  const key = seriesKnowledgeSubjectKey(candidate.target.subject);
  if (candidate.target.kind === 'new') {
    for (const item of items) {
      if (seriesKnowledgeSubjectKey(item.subject) !== key) continue;
      const current = item.current;
      yield {
        kind: 'existing-item',
        ref: current.revisionId,
        line: `书系知识里已有「${item.subject}」（${SERIES_KNOWLEDGE_CLASS_LABELS[item.knowledgeClass]}）第 ${current.ordinal} 版。`,
      };
    }
  } else {
    const target = candidate.target;
    for (const item of items) {
      if (item.itemId === target.itemId && item.current.revisionId !== target.baseRevisionId) {
        yield { kind: 'item-updated', ref: item.current.revisionId, line: `「${item.subject}」在提议之后已更新为第 ${item.current.ordinal} 版。` };
      }
    }
  }
  for (const other of open) {
    if (other.candidateId === candidate.candidateId) continue;
    const sameItem = candidate.target.kind === 'existing' && other.target.kind === 'existing' && other.target.itemId === candidate.target.itemId;
    if (!sameItem && seriesKnowledgeSubjectKey(other.target.subject) !== key) continue;
    yield { kind: 'competing-candidate', ref: other.versionId, line: `另一个候选项也在提议「${other.target.subject}」（第 ${other.version} 版）。` };
  }
}

/** Stream the complete identity list into its existing canonical digest, retaining only the disclosed preview and count. */
export function seriesKnowledgeReviewSummary(input: {
  readonly seriesId: string;
  readonly candidateVersionId: string;
  readonly currentRevisionId: string | null;
  readonly conflicts: Iterable<FoundConflict>;
  readonly blocked: string | null;
}): { readonly digest: string; readonly count: number; readonly preview: FoundConflict[] } {
  const hash = createHash('sha256');
  hash.update('{"blocked":' + canonicalJson(input.blocked) + ',"candidateVersionId":' + canonicalJson(input.candidateVersionId) + ',"conflicts":[');
  let count = 0;
  const preview: FoundConflict[] = [];
  for (const conflict of input.conflicts) {
    if (count > 0) hash.update(',');
    hash.update(canonicalJson({ kind: conflict.kind, ref: conflict.ref }));
    count += 1;
    if (preview.length < MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN) preview.push(conflict);
  }
  hash.update('],"currentRevisionId":' + canonicalJson(input.currentRevisionId) + ',"schema":' + canonicalJson(REVIEW_SCHEMA) + ',"seriesId":' + canonicalJson(input.seriesId) + '}');
  return { digest: hash.digest('hex'), count, preview };
}

/** Candidate list badges need only the exact count, never the complete conflict list. */
export function countSeriesKnowledgeConflicts(conflicts: Iterable<FoundConflict>): number {
  let count = 0;
  for (const _conflict of conflicts) count += 1;
  return count;
}

export class SeriesKnowledgeLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /** Every item of a Series, by name, with its revisions verified oldest first and each one's decision. */
  *items(seriesId: string): IterableIterator<StoredItem> {
    const rows = this.#db.prepare('SELECT * FROM series_knowledge_items WHERE series_id = ? ORDER BY subject, item_id').iterate(seriesId) as IterableIterator<SqlRow>;
    for (const row of rows) yield this.#item(row);
  }

  /**
   * Up to `limit` items of a Series by name after the one named, narrowed to names holding the words when there are any — a
   * page of 书系知识 (Issue #63 review) — each verified with its revisions.
   */
  itemsPage(seriesId: string, words: string, after: { readonly subject: string; readonly itemId: string } | null, limit: number): StoredItem[] {
    const rows = this.#db.prepare(`SELECT * FROM series_knowledge_items WHERE series_id = ?
        AND (? = '' OR instr(lower(subject), lower(?)) > 0)
        AND (? IS NULL OR subject > ? OR (subject = ? AND item_id > ?))
      ORDER BY subject, item_id LIMIT ?`)
      .all(seriesId, words, words, after?.subject ?? null, after?.subject ?? null, after?.subject ?? null, after?.itemId ?? null, limit) as SqlRow[];
    return rows.map((row) => this.#item(row));
  }

  /** How many items a Series holds. */
  itemCount(seriesId: string): number {
    return Number((this.#db.prepare('SELECT count(*) count FROM series_knowledge_items WHERE series_id = ?').get(seriesId) as SqlRow).count);
  }

  /** One item, or `null`. */
  item(itemId: string): StoredItem | null {
    const row = this.#db.prepare('SELECT * FROM series_knowledge_items WHERE item_id = ?').get(itemId) as SqlRow | undefined;
    return row === undefined ? null : this.#item(row);
  }

  #item(row: SqlRow): StoredItem {
    const json = String(row.canonical_json);
    requireKnowledge(sha256Hex(json) === String(row.sha256), 'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
    const record = JSON.parse(json) as unknown;
    requireKnowledge(isRecord(record) && record.schema === ITEM_SCHEMA && record.itemId === row.item_id && record.seriesId === row.series_id &&
      record.subject === row.subject && record.knowledgeClass === row.knowledge_class && isSeriesKnowledgeClass(record.knowledgeClass) &&
      record.createdAt === row.created_at && record.actor === ACTOR, 'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
    const itemId = String(row.item_id);
    let current: StoredRevision | null = null;
    for (const revision of this.#revisions(itemId)) current = revision;
    requireKnowledge(current !== null, 'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
    return {
      itemId,
      seriesId: String(row.series_id),
      subject: String(row.subject),
      knowledgeClass: record.knowledgeClass as SeriesKnowledgeClass,
      createdAt: String(row.created_at),
      current,
      revisionCount: current.ordinal,
    };
  }

  *#revisions(itemId: string): IterableIterator<StoredRevision> {
    const rows = this.#db.prepare(`SELECT r.*, p.decision_id, p.canonical_json decision_json, p.sha256 decision_sha256, p.outcome, p.conflict_disposition,
        p.reuse_scope, p.review_digest, p.candidate_id, p.recorded_at decision_recorded_at, p.candidate_version_id decision_version_id
      FROM series_knowledge_revisions r JOIN series_knowledge_promotions p ON p.revision_id = r.revision_id
      WHERE r.item_id = ? ORDER BY r.ordinal`).iterate(itemId) as IterableIterator<SqlRow>;
    const expected = Number((this.#db.prepare('SELECT count(*) count FROM series_knowledge_revisions WHERE item_id = ?').get(itemId) as SqlRow).count);
    let count = 0;
    let before: StoredRevision | null = null;
    for (const row of rows) {
      const json = String(row.canonical_json);
      requireKnowledge(sha256Hex(json) === String(row.sha256) && sha256Hex(String(row.decision_json)) === String(row.decision_sha256),
        'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
      const record = JSON.parse(json) as unknown;
      const decision = JSON.parse(String(row.decision_json)) as unknown;
      const ordinal = Number(row.ordinal);
      requireKnowledge(isRecord(record) && record.schema === REVISION_SCHEMA && record.revisionId === row.revision_id && record.itemId === itemId &&
        record.ordinal === ordinal && record.content === row.content && (record.authoring === 'editor' || record.authoring === 'manuscript-revision') &&
        (record.authoring === 'editor' ? record.provenance === null : isProvenance(record.provenance)) &&
        (record.provenance === null ? row.source_book_id === null : (record.provenance as StoredProvenance).bookId === row.source_book_id) &&
        Number.isSafeInteger(record.conflictCount) && Number(record.conflictCount) >= 0 &&
        typeof record.conflictsDigest === 'string' && /^[a-f0-9]{64}$/u.test(record.conflictsDigest) && isSeriesKnowledgeReuseScope(record.reuseScope) && record.candidateVersionId === row.candidate_version_id &&
        record.recordedAt === row.recorded_at && record.actor === ACTOR &&
        (record.supersedes ?? null) === (row.supersedes_revision_id ?? null) && (record.supersedes ?? null) === (before?.revisionId ?? null) &&
        ordinal === (before?.ordinal ?? 0) + 1,
      'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
      requireKnowledge(isRecord(decision) && decision.schema === PROMOTION_SCHEMA && decision.decisionId === row.decision_id &&
        decision.revisionId === row.revision_id && decision.itemId === itemId && decision.candidateId === row.candidate_id &&
        decision.candidateVersionId === row.decision_version_id && decision.candidateVersionId === row.candidate_version_id &&
        decision.outcome === row.outcome && decision.outcome === (ordinal === 1 ? 'created' : 'updated') &&
        decision.conflictDisposition === row.conflict_disposition &&
        decision.conflictDisposition === (record.conflictCount === 0 ? 'none' : 'preserved') &&
        decision.reuseScope === row.reuse_scope && decision.reuseScope === record.reuseScope && decision.reviewDigest === row.review_digest &&
        decision.recordedAt === row.decision_recorded_at && decision.actor === ACTOR,
      'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
      const entry: StoredRevision = {
        revisionId: String(row.revision_id),
        itemId,
        ordinal,
        content: String(row.content),
        authoring: record.authoring as 'editor' | 'manuscript-revision',
        provenance: (record.provenance ?? null) as StoredProvenance | null,
        conflicts: this.conflictsPage(String(row.revision_id), Number(record.conflictCount), String(record.conflictsDigest), 0, MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN),
        conflictCount: Number(record.conflictCount),
        conflictsDigest: String(record.conflictsDigest),
        reuseScope: record.reuseScope as SeriesKnowledgeReuseScope,
        candidateVersionId: String(row.candidate_version_id),
        decisionId: String(row.decision_id),
        outcome: decision.outcome as 'created' | 'updated',
        recordedAt: String(row.recorded_at),
      };
      before = entry;
      count += 1;
      yield entry;
    }
    requireKnowledge(count === expected, 'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
  }

  /** Validate the complete immutable conflict ledger while retaining one requested page. */
  conflictsPage(revisionId: string, total: number, digest: string, after: number, limit: number): SeriesKnowledgeConflictProjection[] {
    const page: SeriesKnowledgeConflictProjection[] = [];
    const hash = createHash('sha256').update('[');
    let count = 0;
    for (const row of this.#db.prepare('SELECT * FROM series_knowledge_conflicts WHERE revision_id = ? ORDER BY ordinal').iterate(revisionId)) {
      const json = String(row.canonical_json);
      requireKnowledge(sha256Hex(json) === row.sha256, 'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
      const record = JSON.parse(json) as unknown;
      requireKnowledge(isRecord(record) && record.schema === CONFLICT_SCHEMA && record.revisionId === revisionId &&
        record.ordinal === count + 1 && record.ordinal === row.ordinal && record.kind === row.kind && record.line === row.line &&
        (record.kind === 'existing-item' || record.kind === 'competing-candidate' || record.kind === 'item-updated') && typeof record.line === 'string',
      'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
      const conflict = { kind: record.kind, line: record.line } as SeriesKnowledgeConflictProjection;
      if (count > 0) hash.update(',');
      hash.update(canonicalJson(conflict));
      count += 1;
      if (count > after && page.length < limit) page.push(conflict);
    }
    requireKnowledge(count === total && hash.update(']').digest('hex') === digest, 'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
    return page;
  }

  /** Exact immutable revision, with all predecessors and successors still validated. */
  revision(itemId: string, revisionId: string): StoredRevision | null {
    let found: StoredRevision | null = null;
    for (const revision of this.#revisions(itemId)) if (revision.revisionId === revisionId) found = revision;
    return found;
  }

  /** Newest-first bounded history page; validation always reaches the end of the ledger. */
  revisionsPage(itemId: string, before: number | null, limit: number): StoredRevision[] {
    const page: StoredRevision[] = [];
    for (const revision of this.#revisions(itemId)) {
      if (before !== null && revision.ordinal >= before) continue;
      page.unshift(revision);
      if (page.length > limit) page.pop();
    }
    return page;
  }

  /** One candidate's newest version, verified with its whole chain, and whether it was taken in; `null` when there is none. */
  candidate(candidateId: string): StoredCandidate | null {
    const rows = this.#db.prepare('SELECT * FROM series_knowledge_candidates WHERE candidate_id = ? ORDER BY version').iterate(candidateId) as IterableIterator<SqlRow>;
    let before: StoredCandidate | null = null;
    for (const row of rows) before = this.#candidate(row, before);
    return before;
  }

  #candidate(row: SqlRow, before: StoredCandidate | null): StoredCandidate {
    const json = String(row.canonical_json);
    requireKnowledge(sha256Hex(json) === String(row.sha256), 'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
    const record = JSON.parse(json) as unknown;
    const version = Number(row.version);
    requireKnowledge(isRecord(record) && record.schema === CANDIDATE_SCHEMA && record.versionId === row.version_id && record.candidateId === row.candidate_id &&
      record.version === version && record.seriesId === row.series_id && record.content === row.content && isRecord(record.target) &&
      (record.target.kind === 'new' ? row.target_item_id === null : record.target.kind === 'existing' && record.target.itemId === row.target_item_id &&
        typeof record.target.baseRevisionId === 'string') &&
      record.target.subject === row.subject && record.target.knowledgeClass === row.knowledge_class && isSeriesKnowledgeClass(record.target.knowledgeClass) &&
      record.authoring === row.authoring && (record.authoring === 'editor' ? record.provenance === null && row.source_book_id === null
        : isProvenance(record.provenance) && record.provenance.bookId === row.source_book_id) &&
      record.recordedAt === row.recorded_at && record.actor === ACTOR &&
      (record.supersedes ?? null) === (row.supersedes_version_id ?? null) && (record.supersedes ?? null) === (before?.versionId ?? null) &&
      version === (before?.version ?? 0) + 1 && (before === null || (before.seriesId === row.series_id && before.authoring === row.authoring &&
        canonicalJson(before.provenance) === canonicalJson(record.provenance ?? null))),
    'SERIES_KNOWLEDGE_RECORD_INVALID', INVALID);
    const candidateId = String(row.candidate_id);
    return {
      versionId: String(row.version_id),
      candidateId,
      version,
      seriesId: String(row.series_id),
      target: record.target as ResolvedTarget,
      content: String(row.content),
      authoring: record.authoring as 'editor' | 'manuscript-revision',
      provenance: (record.provenance ?? null) as StoredProvenance | null,
      recordedAt: String(row.recorded_at),
      promoted: this.#db.prepare('SELECT 1 FROM series_knowledge_promotions WHERE candidate_id = ?').get(candidateId) !== undefined,
    };
  }

  /** The candidates of a Series not yet taken in, each at its newest version, oldest first. */
  *open(seriesId: string): IterableIterator<StoredCandidate> {
    const rows = this.#db.prepare(`SELECT candidate_id, min(recorded_at) first FROM series_knowledge_candidates WHERE series_id = ?
      AND candidate_id NOT IN (SELECT candidate_id FROM series_knowledge_promotions) GROUP BY candidate_id ORDER BY first, candidate_id`)
      .iterate(seriesId) as IterableIterator<SqlRow>;
    for (const row of rows) yield this.candidate(String(row.candidate_id))!;
  }

  /**
   * Up to `limit` open candidates of a Series after the one named, oldest proposed first, each at its newest version with when
   * it was first proposed: a page of 待审阅的候选项 (Issue #63 review).
   */
  openPage(seriesId: string, after: { readonly firstAt: string; readonly candidateId: string } | null, limit: number): Array<{ candidate: StoredCandidate; firstAt: string }> {
    const rows = this.#db.prepare(`SELECT candidate_id, min(recorded_at) first FROM series_knowledge_candidates WHERE series_id = ?
        AND candidate_id NOT IN (SELECT candidate_id FROM series_knowledge_promotions) GROUP BY candidate_id
        HAVING ? IS NULL OR first > ? OR (first = ? AND candidate_id > ?)
      ORDER BY first, candidate_id LIMIT ?`)
      .all(seriesId, after?.firstAt ?? null, after?.firstAt ?? null, after?.firstAt ?? null, after?.candidateId ?? null, limit) as SqlRow[];
    return rows.map((row) => ({ candidate: this.candidate(String(row.candidate_id))!, firstAt: String(row.first) }));
  }

  /** How many candidates of a Series wait to be taken in. */
  openCount(seriesId: string): number {
    return Number((this.#db.prepare(`SELECT count(DISTINCT candidate_id) count FROM series_knowledge_candidates WHERE series_id = ?
      AND candidate_id NOT IN (SELECT candidate_id FROM series_knowledge_promotions)`).get(seriesId) as SqlRow).count);
  }

  /**
   * How many open candidates of a Series cite one Book's manuscript: what 移出书系 holds back until the Book rejoins, and what
   * a rejoining makes reviewable again (Issue #63 review).
   */
  openFromBook(seriesId: string, bookId: string): number {
    if (this.#db.prepare(TABLE_PRESENT).get() === undefined) return 0;
    return Number((this.#db.prepare(`SELECT count(DISTINCT candidate_id) count FROM series_knowledge_candidates WHERE series_id = ? AND source_book_id = ?
      AND candidate_id NOT IN (SELECT candidate_id FROM series_knowledge_promotions)`).get(seriesId, bookId) as SqlRow).count);
  }

  /** How many items of a Series hold a revision taken from one Book: what 移出书系 names and leaves in place (SER-007). */
  itemsFromBook(seriesId: string, bookId: string): number {
    if (this.#db.prepare(TABLE_PRESENT).get() === undefined) return 0;
    return Number((this.#db.prepare(`SELECT count(DISTINCT r.item_id) count FROM series_knowledge_revisions r
      JOIN series_knowledge_items i ON i.item_id = r.item_id WHERE i.series_id = ? AND r.source_book_id = ?`).get(seriesId, bookId) as SqlRow).count);
  }

  /** 提议为书系知识, inside the caller's transaction: the candidate's first version. */
  propose(input: {
    readonly seriesId: string;
    readonly target: ResolvedTarget;
    readonly content: string;
    readonly provenance: StoredProvenance | null;
  }): StoredCandidate {
    return this.#append(randomUUID(), null, input.seriesId, input.target, input.content, input.provenance);
  }

  /** 编辑候选项, inside the caller's transaction: the candidate's next version, keeping its authorship and provenance. */
  edit(candidateId: string, expectedVersion: number, target: ResolvedTarget, content: string): StoredCandidate {
    const current = this.candidate(candidateId);
    requireKnowledge(current !== null, 'SERIES_KNOWLEDGE_CANDIDATE_NOT_FOUND', '这个候选项不存在。');
    requireKnowledge(!current.promoted, 'SERIES_KNOWLEDGE_ALREADY_PROMOTED', '这个候选项已经纳入书系知识。');
    requireKnowledge(current.version === expectedVersion, 'SERIES_KNOWLEDGE_CANDIDATE_MOVED', '这个候选项刚被改过；请看过现在的内容再改。');
    requireKnowledge(canonicalJson(current.target) !== canonicalJson(target) || current.content !== content,
      'SERIES_KNOWLEDGE_CANDIDATE_UNCHANGED', '候选项没有变化。');
    return this.#append(candidateId, current, current.seriesId, target, content, current.provenance);
  }

  #append(
    candidateId: string,
    before: StoredCandidate | null,
    seriesId: string,
    target: ResolvedTarget,
    content: string,
    provenance: StoredProvenance | null,
  ): StoredCandidate {
    const versionId = randomUUID();
    const version = (before?.version ?? 0) + 1;
    const recordedAt = new Date().toISOString();
    const authoring = provenance === null ? 'editor' : 'manuscript-revision';
    const record = canonicalRecord({
      schema: CANDIDATE_SCHEMA,
      versionId,
      candidateId,
      version,
      seriesId,
      target,
      content,
      authoring,
      provenance,
      supersedes: before?.versionId ?? null,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO series_knowledge_candidates(version_id, candidate_id, version, series_id, target_item_id, subject, knowledge_class, content, authoring,
         source_book_id, supersedes_version_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(versionId, candidateId, version, seriesId, target.kind === 'existing' ? target.itemId : null, target.subject, target.knowledgeClass, content,
      authoring, provenance?.bookId ?? null, before?.versionId ?? null, recordedAt, record.json, record.digest);
    return { versionId, candidateId, version, seriesId, target, content, authoring, provenance, recordedAt, promoted: false };
  }

  /**
   * 纳入书系知识, inside the caller's transaction and after the caller has recomputed the review and compared digests: the new
   * item with its first revision, or the exact item's next revision, and the decision that made it.
   */
  promote(input: {
    readonly candidate: StoredCandidate;
    readonly conflicts: Iterable<SeriesKnowledgeConflictProjection>;
    readonly reuseScope: SeriesKnowledgeReuseScope;
    readonly reviewDigest: string;
  }): { readonly itemId: string; readonly revisionId: string; readonly decisionId: string; readonly outcome: 'created' | 'updated' } {
    const { candidate } = input;
    requireKnowledge(!candidate.promoted, 'SERIES_KNOWLEDGE_ALREADY_PROMOTED', '这个候选项已经纳入书系知识。');
    const recordedAt = new Date().toISOString();
    const revisionId = randomUUID();
    const conflictHash = createHash('sha256').update('[');
    let conflictCount = 0;
    // Consume the live review before creating the item or revision changes its inputs. The deferred
    // parent key and caller transaction keep these rows atomic with the promotion, even on failure.
    const appendConflict = this.#db.prepare('INSERT INTO series_knowledge_conflicts(revision_id, ordinal, kind, line, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)');
    for (const entry of input.conflicts) {
      const conflict = { kind: entry.kind, line: entry.line };
      if (conflictCount > 0) conflictHash.update(',');
      conflictHash.update(canonicalJson(conflict));
      conflictCount += 1;
      const record = canonicalRecord({ schema: CONFLICT_SCHEMA, revisionId, ordinal: conflictCount, ...conflict });
      appendConflict.run(revisionId, conflictCount, conflict.kind, conflict.line, record.json, record.digest);
    }
    const conflictsDigest = conflictHash.update(']').digest('hex');
    let itemId: string;
    let before: StoredRevision | null = null;
    if (candidate.target.kind === 'new') {
      itemId = randomUUID();
      const item = canonicalRecord({
        schema: ITEM_SCHEMA,
        itemId,
        seriesId: candidate.seriesId,
        subject: candidate.target.subject,
        knowledgeClass: candidate.target.knowledgeClass,
        actor: ACTOR,
        createdAt: recordedAt,
      });
      this.#db.prepare('INSERT INTO series_knowledge_items(item_id, series_id, subject, knowledge_class, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(itemId, candidate.seriesId, candidate.target.subject, candidate.target.knowledgeClass, recordedAt, item.json, item.digest);
    } else {
      const existing = this.item(candidate.target.itemId);
      requireKnowledge(existing !== null && existing.seriesId === candidate.seriesId, 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识条目不存在。');
      itemId = existing.itemId;
      before = existing.current;
    }
    const ordinal = (before?.ordinal ?? 0) + 1;
    const outcome = ordinal === 1 ? 'created' as const : 'updated' as const;
    const revision = canonicalRecord({
      schema: REVISION_SCHEMA,
      revisionId,
      itemId,
      ordinal,
      content: candidate.content,
      authoring: candidate.authoring,
      provenance: candidate.provenance,
      conflictCount,
      conflictsDigest,
      reuseScope: input.reuseScope,
      candidateVersionId: candidate.versionId,
      supersedes: before?.revisionId ?? null,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO series_knowledge_revisions(revision_id, item_id, ordinal, content, candidate_version_id, source_book_id, supersedes_revision_id, recorded_at,
         canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(revisionId, itemId, ordinal, candidate.content, candidate.versionId, candidate.provenance?.bookId ?? null, before?.revisionId ?? null, recordedAt,
      revision.json, revision.digest);
    const decisionId = randomUUID();
    const conflictDisposition = conflictCount === 0 ? 'none' : 'preserved';
    const decision = canonicalRecord({
      schema: PROMOTION_SCHEMA,
      decisionId,
      seriesId: candidate.seriesId,
      candidateId: candidate.candidateId,
      candidateVersionId: candidate.versionId,
      itemId,
      revisionId,
      outcome,
      conflictDisposition,
      reuseScope: input.reuseScope,
      reviewDigest: input.reviewDigest,
      actor: ACTOR,
      recordedAt,
    });
    this.#db.prepare(
      `INSERT INTO series_knowledge_promotions(decision_id, candidate_id, candidate_version_id, revision_id, outcome, conflict_disposition, reuse_scope,
         review_digest, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(decisionId, candidate.candidateId, candidate.versionId, revisionId, outcome, conflictDisposition, input.reuseScope, input.reviewDigest,
      recordedAt, decision.json, decision.digest);
    return { itemId, revisionId, decisionId, outcome };
  }
}
