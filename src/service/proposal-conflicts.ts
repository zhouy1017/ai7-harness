import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  conflictUnits,
  draftText,
  resolutionsFit,
  unresolvedUnits,
  type ConflictUnit,
  type ConflictUnitResolution,
} from '../shared/conflict-units.js';
import { graphemesOf } from '../shared/mark-anchor.js';
import {
  MAX_MARK_BODY_CODE_UNITS,
  MAX_PROPOSAL_CONFLICT_DEFERRALS,
  MAX_PROPOSAL_CONFLICT_DRAFTS,
  MAX_PROPOSAL_CONFLICT_NAVIGATOR,
  PROPOSAL_CONFLICT_CONTEXT_GRAPHEMES,
  type EditorialMarkConflictProjection,
  type EditorialMarkSourceProjection,
  type ProposalConflictBindingInput,
  type ProposalConflictDraftProjection,
  type ProposalConflictDraftSaveProjection,
  type ProposalConflictKind,
  type ProposalConflictOutcome,
  type ProposalConflictProjection,
  type ProposalConflictResolutionProjection,
  type ResolveProposalConflictInput,
  type SaveProposalConflictDraftInput,
} from '../shared/protocol.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import type { EditorialMarkStore } from './editorial-marks.js';
import type { ConflictAttentionReading } from './global-attention.js';

/**
 * 稿件冲突 of a single 修改建议 (Issue #57, plan slice S22; ADR 0085; V2-UX-CONFLICT-001 to 013,
 * V2-UX-EREC-012).
 *
 * A 修改建议 targets an exact range inside one block, and ADR 0085 §1 decides its conflict by that range:
 * it is in conflict when the words it replaces changed after its base — its anchor drifted — while it
 * is undecided or accepted and not yet applied (`suggestion`), or when the words its Apply wrote were
 * edited afterwards, so that reversing the Apply meets later work (`reversal`). A change elsewhere in
 * the paragraph is a Safe Non-interacting Merge, and a block that was split, merged or deleted is S63's.
 *
 * The conflict is read, never stored: its three texts are the mark's pinned words (提案基准), what its
 * followed range holds now (当前权威稿件) and what it would write (提议内容) — for a reversal, the words
 * the Apply wrote, what stands there now, and the words the Apply replaced. Schema revision 26 holds only
 * what the editor does with it, in three append-only relations whose every row carries its canonical JSON
 * and digest:
 *
 * - `proposal_conflict_drafts`: each save of the Resolution Draft — every unit with its words and its
 *   resolution, and the draft's text — bound to the exact basis it was made on (V2-UX-CONFLICT-011/012).
 * - `proposal_conflict_deferrals`: each 暂不处理 — who and when (ADR 0085 §3). The conflict stays
 *   unresolved and listed; a deferral is a record of the conflict, not a Proposal Change Disposition.
 * - `proposal_conflict_outcomes`: the one outcome that resolves it — 保留当前稿件, with the rejection it
 *   recorded (none for a reversal: the Apply stays in force), or 保存为新提案版本, with the new 修改建议 and
 *   the draft it came from.
 *
 * Nothing here writes the manuscript. A new version is a new mark on the current words, not accepted and
 * not applied; it goes through 接受并应用 like any other 修改建议.
 *
 * Nothing existing moves (ADR 0079). The relations are created shape-detected in `EditorialStore.open`
 * before the version is stamped, exactly as revisions 21 to 25 add theirs, and join the exact-schema
 * validator the same way.
 */
export const PROPOSAL_CONFLICT_SCHEMA_SQL = {
  proposal_conflict_drafts: `CREATE TABLE proposal_conflict_drafts (
  draft_id TEXT PRIMARY KEY,
  mark_id TEXT NOT NULL REFERENCES editorial_marks(mark_id),
  conflict_kind TEXT NOT NULL CHECK(conflict_kind IN ('suggestion', 'reversal')),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  basis_digest TEXT NOT NULL CHECK(length(basis_digest) = 64),
  units_json TEXT NOT NULL,
  draft_text TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor = 'editor'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  UNIQUE(mark_id, ordinal)
) STRICT`,
  proposal_conflict_deferrals: `CREATE TABLE proposal_conflict_deferrals (
  deferral_id TEXT PRIMARY KEY,
  mark_id TEXT NOT NULL REFERENCES editorial_marks(mark_id),
  conflict_kind TEXT NOT NULL CHECK(conflict_kind IN ('suggestion', 'reversal')),
  basis_digest TEXT NOT NULL CHECK(length(basis_digest) = 64),
  actor TEXT NOT NULL CHECK(actor = 'editor'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64)
) STRICT`,
  proposal_conflict_outcomes: `CREATE TABLE proposal_conflict_outcomes (
  outcome_id TEXT PRIMARY KEY,
  mark_id TEXT NOT NULL UNIQUE REFERENCES editorial_marks(mark_id),
  conflict_kind TEXT NOT NULL CHECK(conflict_kind IN ('suggestion', 'reversal')),
  outcome TEXT NOT NULL CHECK(outcome IN ('keep-current', 'new-version')),
  decision_id TEXT REFERENCES proposal_item_decisions(decision_id),
  new_mark_id TEXT UNIQUE REFERENCES editorial_marks(mark_id),
  draft_id TEXT REFERENCES proposal_conflict_drafts(draft_id),
  basis_digest TEXT NOT NULL CHECK(length(basis_digest) = 64),
  actor TEXT NOT NULL CHECK(actor = 'editor'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  CHECK(outcome <> 'keep-current' OR (new_mark_id IS NULL AND draft_id IS NULL AND (conflict_kind = 'reversal') = (decision_id IS NULL))),
  CHECK(outcome <> 'new-version' OR (new_mark_id IS NOT NULL AND draft_id IS NOT NULL AND decision_id IS NULL))
) STRICT`,
} as const;

/** Every conflict relation is a ledger: a row is appended once and never rewritten or removed. */
export const PROPOSAL_CONFLICT_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(PROPOSAL_CONFLICT_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PROPOSAL_CONFLICT_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'PROPOSAL_CONFLICT_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the three relations, in the exact-schema validator's own spelling. */
export const PROPOSAL_CONFLICT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  proposal_conflict_drafts: ['mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE'],
  proposal_conflict_deferrals: ['mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE'],
  proposal_conflict_outcomes: [
    'decision_id>proposal_item_decisions.decision_id:NO ACTION/NO ACTION/NONE',
    'draft_id>proposal_conflict_drafts.draft_id:NO ACTION/NO ACTION/NONE',
    'mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
    'new_mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class ProposalConflictError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProposalConflictError';
  }
}

function requireConflict(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ProposalConflictError(code, message);
}

/**
 * The three relations and their ledger triggers, created once and never rebuilt: a store that predates
 * them gains three empty relations and nothing existing moves. Like revisions 21 to 25 this runs before
 * the version is stamped in `task-authorization.ts` and is shape-detected, so a store that already has
 * them does no work here.
 */
export function initializeProposalConflictSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'proposal_conflict_drafts'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(PROPOSAL_CONFLICT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(PROPOSAL_CONFLICT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Proposal conflict schema rollback failed.');
    }
    throw error;
  }
  requireConflict(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

const relationSeen = new WeakSet<DatabaseSync>();

/**
 * The mark projections read the conflict of a mark on every connection, the journal's included, and a
 * store that has not reached revision 26 yet has no conflict to read.
 */
export function proposalConflictRelationsExist(db: DatabaseSync): boolean {
  if (relationSeen.has(db)) return true;
  const exists = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'proposal_conflict_outcomes'").get() !== undefined;
  if (exists) relationSeen.add(db);
  return exists;
}

/**
 * The state of the conflict a mark read as `em` is in, as one SQL expression for the anchor projection:
 * `resolved` once it has an outcome; otherwise, while it is a conflict at all — a drifted 修改建议, open or
 * applied — `deferred` after a 暂不处理 and `unresolved` before one; `NULL` for any other mark.
 */
export const ANCHOR_CONFLICT_STATE_SQL = `CASE
         WHEN EXISTS (SELECT 1 FROM proposal_conflict_outcomes o WHERE o.mark_id = em.mark_id) THEN 'resolved'
         WHEN em.kind = 'change-suggestion' AND em.anchor_state = 'drifted' AND em.status IN ('open', 'applied') THEN
           CASE WHEN EXISTS (SELECT 1 FROM proposal_conflict_deferrals x WHERE x.mark_id = em.mark_id) THEN 'deferred' ELSE 'unresolved' END
       END`;

type SqlRow = Record<string, SQLOutputValue>;

const DRAFT_SCHEMA = 'ai7.proposal-conflict.draft/1' as const;
const DEFERRAL_SCHEMA = 'ai7.proposal-conflict.deferral/1' as const;
const OUTCOME_SCHEMA = 'ai7.proposal-conflict.outcome/1' as const;
const BASIS_SCHEMA = 'ai7.proposal-conflict.basis/1' as const;
const ACTOR = 'editor' as const;
/** The reason 保留当前稿件 records with its rejection, so later counts can tell it from an ordinary one (ADR 0085 §3). */
export const KEEP_CURRENT_REASON = '保留当前稿件' as const;
const STALE_BASIS = '稿件又有改动，请重新比较。' as const;

function text(value: SQLOutputValue | undefined): string {
  requireConflict(typeof value === 'string' && value.isWellFormed(), 'PROPOSAL_CONFLICT_RECORD_INVALID', '冲突记录无效。');
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  requireConflict(typeof value === 'number' && Number.isSafeInteger(value), 'PROPOSAL_CONFLICT_RECORD_INVALID', '冲突记录无效。');
  return value;
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : text(value);
}

/** One transaction, or the caller's when one is already open. */
function transact<T>(db: DatabaseSync, operation: () => T): T {
  if (db.isTransaction) return operation();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Proposal conflict transaction rollback failed.');
    }
    throw error;
  }
}

/**
 * A stored record read back: its canonical JSON must still digest to the recorded SHA-256 and name exactly
 * the facts its columns hold. Answers the parsed record.
 */
function requireRecord(json: SQLOutputValue | undefined, digest: SQLOutputValue | undefined, facts: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const canonical = text(json);
  const recorded = text(digest);
  requireConflict(DIGEST_PATTERN.test(recorded) && sha256Hex(canonical) === recorded, 'PROPOSAL_CONFLICT_RECORD_INVALID', '冲突记录与其摘要不一致。');
  const record = parseCanonicalJson(canonical);
  requireConflict(
    isRecord(record) && Object.entries(facts).every(([key, value]) => record[key] === value),
    'PROPOSAL_CONFLICT_RECORD_INVALID',
    '冲突记录与其字段不一致。',
  );
  return record;
}

/** A unit of a stored draft: the comparison's words and the editor's resolution, index for index. */
interface StoredUnit extends ConflictUnit, ConflictUnitResolution {}

function storedUnits(units: ReadonlyArray<ConflictUnit>, resolutions: ReadonlyArray<ConflictUnitResolution>): StoredUnit[] {
  return units.map((unit, index) => ({ ...unit, resolution: resolutions[index]!.resolution, text: resolutions[index]!.text }));
}

/** The conflict of one mark as it stands now, read in the caller's transaction. */
interface ConflictRead {
  markId: string;
  manuscriptId: string;
  branchId: string;
  bookId: string;
  conflictKind: ProposalConflictKind;
  blockId: string;
  blockDigest: string;
  fromGrapheme: number;
  toGrapheme: number;
  base: string;
  current: string;
  proposed: string;
  before: string;
  after: string;
  units: ConflictUnit[];
  basisDigest: string;
  itemId: string;
  rationale: string;
  source: EditorialMarkSourceProjection;
  basisJson: string;
}

/**
 * The conflict a mark card shows (Issue #57): its outcome once it has one; otherwise, while the mark is
 * a conflict at all, whether 暂不处理 was recorded for it. `null` for a mark that is in none.
 */
export function markConflictOf(
  db: DatabaseSync,
  mark: { markId: string; kind: string; status: string; anchorState: string },
): EditorialMarkConflictProjection | null {
  if (!proposalConflictRelationsExist(db)) return null;
  const outcome = readOutcome(db, mark.markId);
  if (outcome !== null) {
    return {
      kind: outcome.conflictKind,
      state: 'resolved',
      deferredAt: null,
      outcome: outcome.outcome,
      newMarkId: outcome.newMarkId,
      resolvedAt: outcome.createdAt,
    };
  }
  const kind = conflictKindOf(mark);
  if (kind === null) return null;
  const deferral = latestDeferral(db, mark.markId);
  return {
    kind,
    state: deferral === null ? 'unresolved' : 'deferred',
    deferredAt: deferral?.deferredAt ?? null,
    outcome: null,
    newMarkId: null,
    resolvedAt: null,
  };
}

/**
 * 待我处理's reading of the Manuscript Conflicts (Issue #424; V2-UX-ATTN-002): every 修改建议 in conflict with the
 * manuscript across every Book and not yet resolved — the same test `ANCHOR_CONFLICT_STATE_SQL` makes — with its Book
 * and whether 暂不处理 was recorded, oldest first and at most `limit`. A read: nothing is claimed or written.
 */
export function readConflictAttention(db: DatabaseSync, limit: number): ConflictAttentionReading[] {
  if (!proposalConflictRelationsExist(db)) return [];
  const rows = db.prepare(
    `SELECT em.mark_id, em.status, em.updated_at, em.book_id, em.manuscript_id, em.branch_id, b.title,
            (SELECT max(x.created_at) FROM proposal_conflict_deferrals x WHERE x.mark_id = em.mark_id) AS deferred_at
     FROM editorial_marks em
     JOIN books b ON b.book_id = em.book_id
     WHERE em.kind = 'change-suggestion' AND em.anchor_state = 'drifted' AND em.status IN ('open', 'applied')
       AND NOT EXISTS (SELECT 1 FROM proposal_conflict_outcomes o WHERE o.mark_id = em.mark_id)
     ORDER BY em.updated_at, em.rowid
     LIMIT ?`,
  ).all(limit) as SqlRow[];
  return rows.map((row) => ({
    markId: text(row.mark_id),
    conflictKind: text(row.status) === 'applied' ? 'reversal' : 'suggestion',
    deferredAt: nullableText(row.deferred_at),
    updatedAt: text(row.updated_at),
    bookId: text(row.book_id),
    bookTitle: text(row.title),
    manuscriptId: text(row.manuscript_id),
    branchId: text(row.branch_id),
  }));
}

/** The conflict a 修改建议 was saved from as a new Proposal version, if it was. */
export function resolvedFromOf(db: DatabaseSync, markId: string): { markId: string; conflictKind: ProposalConflictKind } | null {
  if (!proposalConflictRelationsExist(db)) return null;
  const row = db.prepare('SELECT * FROM proposal_conflict_outcomes WHERE new_mark_id = ?').get(markId) as SqlRow | undefined;
  if (row === undefined) return null;
  const outcome = readOutcomeRow(row);
  return { markId: outcome.markId, conflictKind: outcome.conflictKind };
}

/** Whether a Proposal Decision is the rejection 保留当前稿件 recorded; such a decision is never withdrawn. */
export function decisionResolvesConflict(db: DatabaseSync, decisionId: string): boolean {
  if (!proposalConflictRelationsExist(db)) return false;
  return db.prepare('SELECT 1 FROM proposal_conflict_outcomes WHERE decision_id = ?').get(decisionId) !== undefined;
}

/** A drifted 修改建议 still open is a suggestion conflict; one whose Apply stands is a reversal conflict. */
function conflictKindOf(mark: { kind: string; status: string; anchorState: string }): ProposalConflictKind | null {
  if (mark.kind !== 'change-suggestion' || mark.anchorState !== 'drifted') return null;
  if (mark.status === 'open') return 'suggestion';
  if (mark.status === 'applied') return 'reversal';
  return null;
}

interface OutcomeRecord {
  outcomeId: string;
  markId: string;
  conflictKind: ProposalConflictKind;
  outcome: ProposalConflictOutcome;
  decisionId: string | null;
  newMarkId: string | null;
  draftId: string | null;
  basisDigest: string;
  createdAt: string;
}

function readOutcomeRow(row: SqlRow): OutcomeRecord {
  const record: OutcomeRecord = {
    outcomeId: text(row.outcome_id),
    markId: text(row.mark_id),
    conflictKind: text(row.conflict_kind) as ProposalConflictKind,
    outcome: text(row.outcome) as ProposalConflictOutcome,
    decisionId: nullableText(row.decision_id),
    newMarkId: nullableText(row.new_mark_id),
    draftId: nullableText(row.draft_id),
    basisDigest: text(row.basis_digest),
    createdAt: text(row.created_at),
  };
  requireConflict(text(row.actor) === ACTOR, 'PROPOSAL_CONFLICT_RECORD_INVALID', '冲突记录无效。');
  requireRecord(row.canonical_json, row.sha256, { schema: OUTCOME_SCHEMA, ...record, actor: ACTOR });
  return record;
}

function readOutcome(db: DatabaseSync, markId: string): OutcomeRecord | null {
  const row = db.prepare('SELECT * FROM proposal_conflict_outcomes WHERE mark_id = ?').get(markId) as SqlRow | undefined;
  return row === undefined ? null : readOutcomeRow(row);
}

function latestDeferral(db: DatabaseSync, markId: string): { deferralId: string; deferredAt: string } | null {
  const row = db.prepare(
    'SELECT * FROM proposal_conflict_deferrals WHERE mark_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
  ).get(markId) as SqlRow | undefined;
  if (row === undefined) return null;
  const deferral = {
    deferralId: text(row.deferral_id),
    markId: text(row.mark_id),
    conflictKind: text(row.conflict_kind),
    basisDigest: text(row.basis_digest),
    createdAt: text(row.created_at),
  };
  requireConflict(text(row.actor) === ACTOR, 'PROPOSAL_CONFLICT_RECORD_INVALID', '冲突记录无效。');
  requireRecord(row.canonical_json, row.sha256, { schema: DEFERRAL_SCHEMA, ...deferral, actor: ACTOR });
  return { deferralId: deferral.deferralId, deferredAt: deferral.createdAt };
}

/**
 * Whether the words a new version would replace are gone: a conflict whose range holds nothing now. A pending insertion
 * (Issue #533; S62 D6) stands at a point, where the text is naturally empty, so nothing of it was deleted: a new version
 * writes its words at that point. Only a suggestion whose own words were there — a deletion's, a replacement's — or a
 * reversal whose applied words are gone cannot be written in place.
 */
function targetDeleted(read: { conflictKind: 'suggestion' | 'reversal'; base: string; current: string }): boolean {
  return read.current.length === 0 && !(read.conflictKind === 'suggestion' && read.base.length === 0);
}

/**
 * 稿件冲突 for one 修改建议 (Issue #57): the conflict read against the working state, the Resolution Draft
 * saved while the editor works, and the three ways it is left — 保留当前稿件, 暂不处理, 保存为新提案版本.
 * Every write is one transaction on the authority connection, and every read verifies what it shows
 * against the digests it was written with. The mark relation's writes go through its owner.
 */
export class ProposalConflictStore {
  readonly #db: DatabaseSync;
  readonly #marks: EditorialMarkStore;

  constructor(db: DatabaseSync, marks: EditorialMarkStore) {
    this.#db = db;
    this.#marks = marks;
  }

  /**
   * The conflict of one 修改建议 as it stands now, with the latest Resolution Draft saved on exactly this
   * basis. A draft saved on another state of the paragraph is kept and not loaded, and the answer says so.
   */
  inspect(input: ProposalConflictBindingInput): ProposalConflictProjection {
    requireBinding(input);
    const read = this.#read(input);
    const onBasis = this.#latestDraft(read.markId, read.basisDigest);
    if (onBasis !== null) {
      requireConflict(
        onBasis.units.length === read.units.length && onBasis.units.every((unit, index) => sameUnit(unit, read.units[index]!)),
        'PROPOSAL_CONFLICT_RECORD_INVALID',
        '解决草稿与它所依据的比较不一致。',
      );
    }
    return {
      markId: read.markId,
      manuscriptId: read.manuscriptId,
      branchId: read.branchId,
      bookId: read.bookId,
      conflictKind: read.conflictKind,
      deferral: latestDeferral(this.#db, read.markId),
      blockId: read.blockId,
      fromGrapheme: read.fromGrapheme,
      toGrapheme: read.toGrapheme,
      basisDigest: read.basisDigest,
      base: read.base,
      current: read.current,
      proposed: read.proposed,
      context: { before: read.before, after: read.after },
      units: read.units,
      draft: onBasis === null ? null : draftProjection(onBasis, read.units),
      draftOnEarlierBasis: onBasis === null && this.#latestDraft(read.markId, null) !== null,
      newVersion: targetDeleted(read) ? { available: false, blocker: 'target-deleted' } : { available: true, blocker: null },
      suggestion: { itemId: read.itemId, rationale: read.rationale, source: read.source },
      navigator: this.#navigator(read.branchId),
    };
  }

  /**
   * Save the Resolution Draft (V2-UX-CONFLICT-008, CONFLICT-012): one entry per unit of the comparison the
   * editor saw, on exactly the basis they saw it on. A save that repeats the latest draft appends nothing.
   * The manuscript, the 修改建议 and its decisions are untouched.
   */
  saveDraft(input: SaveProposalConflictDraftInput): ProposalConflictDraftSaveProjection {
    requireBinding(input);
    requireConflict(typeof input.basisDigest === 'string' && DIGEST_PATTERN.test(input.basisDigest), 'PROPOSAL_CONFLICT_INVALID', '冲突请求无效。');
    requireConflict(Array.isArray(input.units), 'PROPOSAL_CONFLICT_INVALID', '解决草稿无效。');
    return transact(this.#db, () => {
      const read = this.#read(input);
      requireConflict(read.basisDigest === input.basisDigest, 'PROPOSAL_CONFLICT_STALE', STALE_BASIS);
      const resolutions = input.units.map((entry) => ({
        resolution: isRecord(entry) ? entry.resolution : undefined,
        text: isRecord(entry) ? entry.text : undefined,
      })) as ConflictUnitResolution[];
      requireConflict(resolutionsFit(read.units, resolutions), 'PROPOSAL_CONFLICT_DRAFT_INVALID', '解决草稿与这处冲突的比较不一致，请重新比较。');
      requireConflict(
        resolutions.every((entry) => entry.text === null || entry.text.length <= MAX_MARK_BODY_CODE_UNITS),
        'PROPOSAL_CONFLICT_DRAFT_INVALID',
        '编辑的文字超过长度上限。',
      );
      const words = draftText(read.units, resolutions);
      requireConflict(words.length <= MAX_MARK_BODY_CODE_UNITS, 'PROPOSAL_CONFLICT_DRAFT_INVALID', '解决草稿超过长度上限。');
      const units = storedUnits(read.units, resolutions);
      const latest = this.#latestDraft(read.markId, null);
      if (latest !== null && latest.basisDigest === read.basisDigest && canonicalJson(latest.units) === canonicalJson(units)) {
        return { markId: read.markId, basisDigest: read.basisDigest, draft: draftProjection(latest, read.units) };
      }
      const ordinal = latest === null ? 1 : latest.ordinal + 1;
      requireConflict(ordinal <= MAX_PROPOSAL_CONFLICT_DRAFTS, 'PROPOSAL_CONFLICT_DRAFTS_FULL', '这处冲突的草稿保存次数已达上限；请保存为新提案版本，或选择其他处理方式。');
      const draftId = randomUUID();
      const createdAt = new Date().toISOString();
      const record = canonicalRecord({
        schema: DRAFT_SCHEMA,
        draftId,
        markId: read.markId,
        conflictKind: read.conflictKind,
        ordinal,
        basisDigest: read.basisDigest,
        units,
        draftText: words,
        actor: ACTOR,
        createdAt,
      });
      this.#db.prepare(
        `INSERT INTO proposal_conflict_drafts(
           draft_id, mark_id, conflict_kind, ordinal, basis_digest, units_json, draft_text, actor, created_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(draftId, read.markId, read.conflictKind, ordinal, read.basisDigest, canonicalJson(units), words, ACTOR, createdAt, record.json, record.digest);
      return {
        markId: read.markId,
        basisDigest: read.basisDigest,
        draft: draftProjection({ draftId, ordinal, units, text: words, createdAt }, read.units),
      };
    });
  }

  /**
   * One of the three ways a conflict is left (V2-UX-CONFLICT-005, ADR 0085 §3), on exactly the basis the
   * editor saw, in one transaction:
   *
   * - `keep-current`: a suggestion conflict records the 修改建议's rejection with the reason 保留当前稿件 and
   *   the outcome; a reversal conflict records the outcome only, and its Apply stays in force.
   * - `defer`: 暂不处理 — a deferral; the conflict stays unresolved and listed, and its draft is kept.
   * - `new-version`: the saved draft `draftOrdinal`, every changed unit resolved, becomes a new 修改建议 on
   *   the current words (V2-UX-CONFLICT-011, CONFLICT-013): for a suggestion conflict it is the old one's
   *   next version and the old one is retired as `converted`; for a reversal conflict it is a Correction
   *   Proposal and the applied 修改建议 stays applied. Nothing is accepted or applied.
   */
  resolve(input: ResolveProposalConflictInput): ProposalConflictResolutionProjection {
    requireBinding(input);
    requireConflict(
      typeof input.basisDigest === 'string' && DIGEST_PATTERN.test(input.basisDigest) &&
        (input.outcome === 'keep-current' || input.outcome === 'defer' || input.outcome === 'new-version') &&
        (input.outcome === 'new-version'
          ? typeof input.draftOrdinal === 'number' && Number.isSafeInteger(input.draftOrdinal) && input.draftOrdinal >= 1
          : input.draftOrdinal === null),
      'PROPOSAL_CONFLICT_INVALID',
      '冲突请求无效。',
    );
    return transact(this.#db, () => {
      const read = this.#read(input);
      requireConflict(read.basisDigest === input.basisDigest, 'PROPOSAL_CONFLICT_STALE', STALE_BASIS);
      const createdAt = new Date().toISOString();
      if (input.outcome === 'defer') {
        const total = integer((this.#db.prepare('SELECT count(*) total FROM proposal_conflict_deferrals WHERE mark_id = ?').get(read.markId) as SqlRow).total);
        requireConflict(total < MAX_PROPOSAL_CONFLICT_DEFERRALS, 'PROPOSAL_CONFLICT_DEFERRALS_FULL', '这处冲突的「暂不处理」记录已达上限。');
        const deferralId = randomUUID();
        const record = canonicalRecord({
          schema: DEFERRAL_SCHEMA,
          deferralId,
          markId: read.markId,
          conflictKind: read.conflictKind,
          basisDigest: read.basisDigest,
          actor: ACTOR,
          createdAt,
        });
        this.#db.prepare(
          `INSERT INTO proposal_conflict_deferrals(deferral_id, mark_id, conflict_kind, basis_digest, actor, created_at, canonical_json, sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(deferralId, read.markId, read.conflictKind, read.basisDigest, ACTOR, createdAt, record.json, record.digest);
        return { markId: read.markId, outcome: 'defer', newMarkId: null, blockId: read.blockId, recordedAt: createdAt };
      }
      if (input.outcome === 'keep-current') {
        const decisionId = read.conflictKind === 'suggestion'
          ? this.#marks.rejectForConflict({ manuscriptId: read.manuscriptId, branchId: read.branchId }, read.markId, KEEP_CURRENT_REASON, createdAt)
          : null;
        this.#appendOutcome(read, 'keep-current', { decisionId, newMarkId: null, draftId: null }, createdAt);
        return { markId: read.markId, outcome: 'keep-current', newMarkId: null, blockId: read.blockId, recordedAt: createdAt };
      }
      requireConflict(!targetDeleted(read), 'PROPOSAL_CONFLICT_TARGET_DELETED', '原文已被删去，不能在原处生成新版本；可选「保留当前稿件」或「暂不处理」。');
      const draft = this.#draftAt(read.markId, input.draftOrdinal!);
      requireConflict(draft !== null, 'PROPOSAL_CONFLICT_DRAFT_INVALID', '找不到要保存的解决草稿。');
      requireConflict(draft.basisDigest === read.basisDigest, 'PROPOSAL_CONFLICT_STALE', STALE_BASIS);
      requireConflict(
        draft.units.length === read.units.length && draft.units.every((unit, index) => sameUnit(unit, read.units[index]!)),
        'PROPOSAL_CONFLICT_STALE',
        STALE_BASIS,
      );
      requireConflict(unresolvedUnits(read.units, draft.units).length === 0, 'PROPOSAL_CONFLICT_DRAFT_INCOMPLETE', '还有未解决的冲突；每一处都选定后才能保存为新提案版本。');
      requireConflict(draft.text !== read.current, 'PROPOSAL_CONFLICT_DRAFT_UNCHANGED', '解决结果与当前稿件相同，请选「保留当前稿件」。');
      const newMarkId = this.#marks.createConflictVersion({
        manuscriptId: read.manuscriptId,
        branchId: read.branchId,
        blockId: read.blockId,
        blockDigest: read.blockDigest,
        fromGrapheme: read.fromGrapheme,
        toGrapheme: read.toGrapheme,
        currentText: read.current,
        proposedText: draft.text,
        rationale: read.rationale,
        basisJson: read.basisJson,
        convertedFrom: read.conflictKind === 'suggestion' ? read.markId : null,
        now: createdAt,
      });
      this.#appendOutcome(read, 'new-version', { decisionId: null, newMarkId, draftId: draft.draftId }, createdAt);
      return { markId: read.markId, outcome: 'new-version', newMarkId, blockId: read.blockId, recordedAt: createdAt };
    });
  }

  #appendOutcome(
    read: ConflictRead,
    outcome: ProposalConflictOutcome,
    links: { decisionId: string | null; newMarkId: string | null; draftId: string | null },
    createdAt: string,
  ): void {
    const outcomeId = randomUUID();
    const record = canonicalRecord({
      schema: OUTCOME_SCHEMA,
      outcomeId,
      markId: read.markId,
      conflictKind: read.conflictKind,
      outcome,
      decisionId: links.decisionId,
      newMarkId: links.newMarkId,
      draftId: links.draftId,
      basisDigest: read.basisDigest,
      actor: ACTOR,
      createdAt,
    });
    this.#db.prepare(
      `INSERT INTO proposal_conflict_outcomes(
         outcome_id, mark_id, conflict_kind, outcome, decision_id, new_mark_id, draft_id, basis_digest, actor, created_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(outcomeId, read.markId, read.conflictKind, outcome, links.decisionId, links.newMarkId, links.draftId, read.basisDigest, ACTOR,
      createdAt, record.json, record.digest);
  }

  /**
   * The conflict of one mark as the working state holds it now. The mark must be a live 修改建议 of this
   * manuscript whose followed range stands in a working block, in conflict, and not yet resolved.
   */
  #read(binding: ProposalConflictBindingInput): ConflictRead {
    const row = this.#db.prepare(
      `SELECT em.mark_id, em.manuscript_id, em.branch_id, em.book_id, em.block_id, em.kind, em.status, em.anchor_state,
              em.from_grapheme, em.to_grapheme, em.pinned_text, em.source_kind, em.source_origin, em.source_label,
              em.source_task_id, em.basis_json, wb.text block_text, wb.digest block_digest
       FROM editorial_marks em
       LEFT JOIN working_blocks wb ON wb.branch_id = em.branch_id AND wb.block_id = em.block_id
       WHERE em.mark_id = ? AND em.manuscript_id = ? AND em.branch_id = ?`,
    ).get(binding.markId, binding.manuscriptId, binding.branchId) as SqlRow | undefined;
    requireConflict(row !== undefined && row.kind === 'change-suggestion', 'MARK_NOT_FOUND', '这条修改建议已不存在。');
    const markId = text(row.mark_id);
    // A suggestion saved as a new version is retired as `converted`; its conflict is answered as resolved.
    requireConflict(readOutcome(this.#db, markId) === null, 'PROPOSAL_CONFLICT_RESOLVED', '这处冲突已经处理过。');
    requireConflict(row.status === 'open' || row.status === 'resolved' || row.status === 'applied', 'MARK_NOT_FOUND', '这条修改建议已不存在。');
    const anchorState = text(row.anchor_state);
    requireConflict(anchorState !== 'detached' && row.block_text !== null && row.block_text !== undefined, 'PROPOSAL_CONFLICT_STRUCTURAL', '这条修改建议所在的段落已不在当前稿件中；这类结构冲突不在这里处理。');
    const conflictKind = conflictKindOf({ kind: 'change-suggestion', status: text(row.status), anchorState });
    requireConflict(conflictKind !== null, 'PROPOSAL_CONFLICT_NONE', '这条修改建议现在没有冲突；请回到稿件查看。');
    const item = this.#db.prepare(
      'SELECT item_id, current_text, proposed_text, rationale FROM proposal_change_items WHERE mark_id = ?',
    ).get(markId) as SqlRow | undefined;
    requireConflict(item !== undefined, 'PROPOSAL_CONFLICT_RECORD_INVALID', '修改建议缺少提案修改项。');
    const decision = this.#db.prepare(
      `SELECT d.disposition, d.edited_text FROM proposal_item_decisions d WHERE d.item_id = ? ORDER BY d.ordinal DESC LIMIT 1`,
    ).get(text(item.item_id)) as SqlRow | undefined;
    const parts = graphemesOf(text(row.block_text));
    const fromGrapheme = integer(row.from_grapheme);
    const toGrapheme = integer(row.to_grapheme);
    requireConflict(fromGrapheme >= 0 && fromGrapheme <= toGrapheme && toGrapheme <= parts.length, 'PROPOSAL_CONFLICT_RECORD_INVALID', '修改建议的范围无效。');
    const base = text(row.pinned_text);
    const current = parts.slice(fromGrapheme, toGrapheme).join('');
    // What it would write: the words an accepted edit settled on while that decision stands, or the
    // suggestion's own; a reversal would write back the words its Apply replaced.
    const proposed = conflictKind === 'reversal'
      ? text(item.current_text)
      : decision !== undefined && decision.disposition === 'accepted-with-edit' ? text(decision.edited_text) : text(item.proposed_text);
    const blockId = text(row.block_id);
    const blockDigest = text(row.block_digest);
    const basis = canonicalRecord({
      schema: BASIS_SCHEMA,
      markId,
      conflictKind,
      blockId,
      blockDigest,
      fromGrapheme,
      toGrapheme,
      base,
      current,
      proposed,
    });
    return {
      markId,
      manuscriptId: text(row.manuscript_id),
      branchId: text(row.branch_id),
      bookId: text(row.book_id),
      conflictKind,
      blockId,
      blockDigest,
      fromGrapheme,
      toGrapheme,
      base,
      current,
      proposed,
      before: parts.slice(Math.max(0, fromGrapheme - PROPOSAL_CONFLICT_CONTEXT_GRAPHEMES), fromGrapheme).join(''),
      after: parts.slice(toGrapheme, toGrapheme + PROPOSAL_CONFLICT_CONTEXT_GRAPHEMES).join(''),
      units: conflictUnits(base, current, proposed),
      basisDigest: basis.digest,
      itemId: text(item.item_id),
      rationale: text(item.rationale),
      source: {
        kind: text(row.source_kind) as EditorialMarkSourceProjection['kind'],
        origin: nullableText(row.source_origin) as EditorialMarkSourceProjection['origin'],
        label: nullableText(row.source_label),
        taskId: nullableText(row.source_task_id),
      },
      basisJson: text(row.basis_json),
    };
  }

  /** The manuscript's unresolved conflicts in reading order, bounded. */
  #navigator(branchId: string): ProposalConflictProjection['navigator'] {
    const rows = this.#db.prepare(
      `SELECT em.mark_id, em.block_id, em.status,
              EXISTS (SELECT 1 FROM proposal_conflict_deferrals x WHERE x.mark_id = em.mark_id) deferred
       FROM editorial_marks em
       JOIN working_blocks wb ON wb.branch_id = em.branch_id AND wb.block_id = em.block_id
       WHERE em.branch_id = ? AND em.kind = 'change-suggestion' AND em.anchor_state = 'drifted'
         AND em.status IN ('open', 'applied')
         AND NOT EXISTS (SELECT 1 FROM proposal_conflict_outcomes o WHERE o.mark_id = em.mark_id)
       ORDER BY wb.position, em.from_grapheme, em.to_grapheme DESC, em.created_at, em.mark_id
       LIMIT ?`,
    ).all(branchId, MAX_PROPOSAL_CONFLICT_NAVIGATOR + 1) as SqlRow[];
    return {
      entries: rows.slice(0, MAX_PROPOSAL_CONFLICT_NAVIGATOR).map((entry) => ({
        markId: text(entry.mark_id),
        blockId: text(entry.block_id),
        conflictKind: entry.status === 'applied' ? 'reversal' : 'suggestion',
        deferred: integer(entry.deferred) === 1,
      })),
      truncated: rows.length > MAX_PROPOSAL_CONFLICT_NAVIGATOR,
    };
  }

  /** The newest draft of a conflict, or the newest saved on exactly `basisDigest` when one is named. */
  #latestDraft(markId: string, basisDigest: string | null): StoredDraft | null {
    const row = this.#db.prepare(
      `SELECT * FROM proposal_conflict_drafts WHERE mark_id = ? AND (? IS NULL OR basis_digest = ?) ORDER BY ordinal DESC LIMIT 1`,
    ).get(markId, basisDigest, basisDigest) as SqlRow | undefined;
    return row === undefined ? null : readDraftRow(row);
  }

  #draftAt(markId: string, ordinal: number): StoredDraft | null {
    const row = this.#db.prepare('SELECT * FROM proposal_conflict_drafts WHERE mark_id = ? AND ordinal = ?').get(markId, ordinal) as SqlRow | undefined;
    return row === undefined ? null : readDraftRow(row);
  }
}

interface StoredDraft {
  draftId: string;
  ordinal: number;
  basisDigest: string;
  units: StoredUnit[];
  text: string;
  createdAt: string;
}

/** A saved draft read back whole: its record verifies, its units parse, and its text is what they make. */
function readDraftRow(row: SqlRow): StoredDraft {
  const facts = {
    draftId: text(row.draft_id),
    markId: text(row.mark_id),
    conflictKind: text(row.conflict_kind),
    ordinal: integer(row.ordinal),
    basisDigest: text(row.basis_digest),
    draftText: text(row.draft_text),
    createdAt: text(row.created_at),
  };
  requireConflict(text(row.actor) === ACTOR, 'PROPOSAL_CONFLICT_RECORD_INVALID', '冲突记录无效。');
  const record = requireRecord(row.canonical_json, row.sha256, { schema: DRAFT_SCHEMA, ...facts, actor: ACTOR });
  const unitsJson = text(row.units_json);
  requireConflict(canonicalJson(record.units) === unitsJson, 'PROPOSAL_CONFLICT_RECORD_INVALID', '解决草稿与其摘要不一致。');
  const units = record.units;
  requireConflict(Array.isArray(units) && units.every(isStoredUnit), 'PROPOSAL_CONFLICT_RECORD_INVALID', '解决草稿无效。');
  const stored = units as StoredUnit[];
  requireConflict(resolutionsFit(stored, stored) && draftText(stored, stored) === facts.draftText, 'PROPOSAL_CONFLICT_RECORD_INVALID', '解决草稿无效。');
  return { draftId: facts.draftId, ordinal: facts.ordinal, basisDigest: facts.basisDigest, units: stored, text: facts.draftText, createdAt: facts.createdAt };
}

function isStoredUnit(value: unknown): value is StoredUnit {
  return isRecord(value) &&
    (value.kind === 'same' || value.kind === 'current-only' || value.kind === 'proposed-only' || value.kind === 'both-same' || value.kind === 'conflict') &&
    typeof value.base === 'string' && typeof value.current === 'string' && typeof value.proposed === 'string' &&
    (value.resolution === null || typeof value.resolution === 'string') && (value.text === null || typeof value.text === 'string');
}

function sameUnit(left: ConflictUnit, right: ConflictUnit): boolean {
  return left.kind === right.kind && left.base === right.base && left.current === right.current && left.proposed === right.proposed;
}

function draftProjection(
  draft: { draftId: string; ordinal: number; units: ReadonlyArray<StoredUnit>; text: string; createdAt: string },
  units: ReadonlyArray<ConflictUnit>,
): ProposalConflictDraftProjection {
  const resolutions = draft.units.map((unit) => ({ resolution: unit.resolution, text: unit.text }));
  return {
    draftId: draft.draftId,
    ordinal: draft.ordinal,
    resolutions,
    text: draft.text,
    complete: unresolvedUnits(units, resolutions).length === 0,
    savedAt: draft.createdAt,
  };
}

function requireBinding(input: ProposalConflictBindingInput): void {
  requireConflict(
    isRecord(input) && typeof input.manuscriptId === 'string' && UUID_PATTERN.test(input.manuscriptId) &&
      typeof input.branchId === 'string' && UUID_PATTERN.test(input.branchId) &&
      typeof input.markId === 'string' && UUID_PATTERN.test(input.markId),
    'PROPOSAL_CONFLICT_INVALID',
    '冲突请求无效。',
  );
}
