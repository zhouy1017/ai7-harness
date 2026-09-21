import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  followGraphemeEdit,
  followPoint,
  graphemesOf,
  resolvePinnedRange,
  deriveSpanEdit,
  type GraphemeEdit,
} from '../shared/mark-anchor.js';
import {
  MAX_MARK_BODY_CODE_UNITS,
  MAX_MARK_REPLIES,
  MAX_WINDOW_BLOCKS,
  MAX_WINDOW_MARKS,
  type CreateEditorialMarkInput,
  type EditorialMarkAnchorProjection,
  type EditorialMarkBasisProjection,
  type EditorialMarkCardProjection,
  type EditorialMarkCommandProjection,
  type EditorialMarkKind,
  type EditorialMarkSourceProjection,
  type EditorialMarkStatus,
  type ManuscriptApplyProjection,
  type PersonalHighlightColor,
  type ProposalItemDecisionProjection,
  type ProposalItemDisposition,
  type RecordChangeSuggestionDecisionInput,
  type RecordProposalDecisionReasonInput,
  type UpdateEditorialMarkInput,
} from '../shared/protocol.js';

/**
 * Editorial Marks and the Proposal Change Items behind 修改建议 (Issue #407, schema revision 22).
 *
 * `editorial_marks` is the one mutable relation: a mark's live range follows the text of its block,
 * its status moves, and a note's words may be rewritten by the editor who owns them. What the mark
 * was made on — the Revision, the journal position, the block digest, the range and the exact text —
 * is written once and never changes; that is the Pinned Manuscript Range the mark is bound to. The
 * other four relations are ledgers: a Proposal Change Item, a Proposal Decision, the reason given
 * for one, and a reply are appended and never rewritten, so a decision stays a record apart from
 * the item it decides and from any change to the manuscript (V2-UX-PDEC-006, PDEC-008, PDEC-011).
 *
 * `block_id` references the durable block identity, not the working block, for the reason the entry
 * position does: a mark whose block leaves the working state must stay readable as `detached`.
 *
 * The two vocabularies are written whole here although this revision's commands write only part of
 * them: a plain `accepted` decision and an `applied` mark are what 接受并应用 records (Issue #408), and
 * a CHECK that admits them now spares the next revision a rebuild of relations one revision old. The
 * same holds for the one pin that is empty: a 修改建议 whose Apply deleted its words is pinned on no
 * text, at the zero-width range where they were, and is exact there until an edit spans that point.
 */
export const EDITORIAL_MARK_SCHEMA_SQL = {
  editorial_marks: `CREATE TABLE editorial_marks (
  mark_id TEXT PRIMARY KEY,
  client_mark_id TEXT NOT NULL UNIQUE,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  kind TEXT NOT NULL CHECK(kind IN ('change-suggestion', 'annotation', 'editor-note', 'personal-highlight')),
  highlight_color INTEGER CHECK(highlight_color IN (1, 2, 3)),
  pinned_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  pinned_journal_sequence INTEGER NOT NULL CHECK(pinned_journal_sequence >= 0),
  pinned_block_digest TEXT NOT NULL,
  pinned_from_grapheme INTEGER NOT NULL CHECK(pinned_from_grapheme >= 0),
  pinned_to_grapheme INTEGER NOT NULL CHECK(pinned_to_grapheme >= pinned_from_grapheme),
  pinned_text TEXT NOT NULL,
  pinned_text_digest TEXT NOT NULL,
  from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
  to_grapheme INTEGER NOT NULL CHECK(to_grapheme >= from_grapheme),
  anchor_state TEXT NOT NULL CHECK(anchor_state IN ('exact', 'drifted', 'detached')),
  followed_journal_sequence INTEGER NOT NULL CHECK(followed_journal_sequence >= 0),
  body TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('editor', 'ai7', 'imported-author')),
  source_origin TEXT CHECK(source_origin IN ('task', 'review-category', 'analysis')),
  source_label TEXT,
  source_task_id TEXT,
  basis_json TEXT NOT NULL,
  export_disposition TEXT NOT NULL CHECK(export_disposition IN ('exported-by-default', 'only-when-included', 'never-exported')),
  status TEXT NOT NULL CHECK(status IN ('open', 'resolved', 'applied', 'removed', 'converted')),
  converted_from_mark_id TEXT REFERENCES editorial_marks(mark_id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((kind = 'personal-highlight') = (highlight_color IS NOT NULL)),
  CHECK((source_kind = 'ai7') = (source_origin IS NOT NULL)),
  CHECK(source_kind = 'editor' OR source_label IS NOT NULL),
  CHECK(kind NOT IN ('editor-note', 'personal-highlight') OR source_kind = 'editor'),
  CHECK((pinned_to_grapheme > pinned_from_grapheme) = (pinned_text <> '')),
  CHECK(pinned_text <> '' OR kind = 'change-suggestion'),
  CHECK(anchor_state <> 'exact' OR (to_grapheme > from_grapheme) = (pinned_text <> '')),
  UNIQUE(branch_id, block_id, mark_id)
) STRICT`,
  editorial_mark_replies: `CREATE TABLE editorial_mark_replies (
  reply_id TEXT PRIMARY KEY,
  mark_id TEXT NOT NULL REFERENCES editorial_marks(mark_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  body TEXT NOT NULL CHECK(length(body) > 0),
  author TEXT NOT NULL CHECK(author = 'editor'),
  created_at TEXT NOT NULL,
  UNIQUE(mark_id, ordinal)
) STRICT`,
  proposal_change_items: `CREATE TABLE proposal_change_items (
  item_id TEXT PRIMARY KEY,
  mark_id TEXT NOT NULL UNIQUE REFERENCES editorial_marks(mark_id),
  change_type TEXT NOT NULL CHECK(change_type IN ('replace', 'delete')),
  current_text TEXT NOT NULL CHECK(length(current_text) > 0),
  proposed_text TEXT NOT NULL,
  rationale TEXT NOT NULL,
  atomic_group_id TEXT,
  created_at TEXT NOT NULL,
  CHECK((change_type = 'delete') = (length(proposed_text) = 0)),
  CHECK(proposed_text <> current_text)
) STRICT`,
  proposal_item_decisions: `CREATE TABLE proposal_item_decisions (
  decision_id TEXT PRIMARY KEY,
  client_decision_id TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL REFERENCES proposal_change_items(item_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  disposition TEXT NOT NULL CHECK(disposition IN ('accepted', 'accepted-with-edit', 'rejected', 'withdrawn')),
  edited_text TEXT,
  supersedes_decision_id TEXT REFERENCES proposal_item_decisions(decision_id),
  decided_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  decided_journal_sequence INTEGER NOT NULL CHECK(decided_journal_sequence >= 0),
  decided_block_digest TEXT,
  actor TEXT NOT NULL CHECK(actor = 'editor'),
  recorded_at TEXT NOT NULL,
  CHECK((disposition = 'accepted-with-edit') = (edited_text IS NOT NULL)),
  CHECK((ordinal = 1) = (supersedes_decision_id IS NULL)),
  UNIQUE(item_id, ordinal)
) STRICT`,
  proposal_decision_reasons: `CREATE TABLE proposal_decision_reasons (
  decision_id TEXT PRIMARY KEY REFERENCES proposal_item_decisions(decision_id),
  reason TEXT NOT NULL CHECK(length(reason) > 0),
  reason_source TEXT NOT NULL CHECK(reason_source IN ('reason-field', 'suggested', 'free-text')),
  recorded_at TEXT NOT NULL
) STRICT`,
} as const;

const LEDGER_TABLES = ['editorial_mark_replies', 'proposal_change_items', 'proposal_item_decisions', 'proposal_decision_reasons'] as const;

export const EDITORIAL_MARK_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  LEDGER_TABLES.flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EDITORIAL_MARK_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EDITORIAL_MARK_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the five relations, in the exact-schema validator's own spelling. */
export const EDITORIAL_MARK_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  editorial_marks: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'converted_from_mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'pinned_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  editorial_mark_replies: ['mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE'],
  proposal_change_items: ['mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE'],
  proposal_item_decisions: [
    'decided_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'item_id>proposal_change_items.item_id:NO ACTION/NO ACTION/NONE',
    'supersedes_decision_id>proposal_item_decisions.decision_id:NO ACTION/NO ACTION/NONE',
  ],
  proposal_decision_reasons: ['decision_id>proposal_item_decisions.decision_id:NO ACTION/NO ACTION/NONE'],
};

type SqlRow = Record<string, SQLOutputValue>;

export class EditorialMarkError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EditorialMarkError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOCK_PATTERN = /^blk_[0-9a-f]{24}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const KINDS: ReadonlyArray<EditorialMarkKind> = ['change-suggestion', 'annotation', 'editor-note', 'personal-highlight'];
const LIVE_STATUSES = "('open', 'resolved', 'applied')";

/** What each kind may become (V2-UX-MARK-003, MARK-006, MARK-007); a kind absent here converts to nothing. */
const CONVERSIONS: Readonly<Record<EditorialMarkKind, ReadonlyArray<EditorialMarkKind>>> = {
  'personal-highlight': ['editor-note', 'annotation', 'change-suggestion'],
  'editor-note': ['annotation', 'change-suggestion'],
  annotation: ['change-suggestion'],
  'change-suggestion': ['annotation'],
};

const EXPORT_DISPOSITION: Readonly<Record<EditorialMarkKind, EditorialMarkCardProjection['exportDisposition']>> = {
  'change-suggestion': 'exported-by-default',
  annotation: 'exported-by-default',
  'editor-note': 'only-when-included',
  'personal-highlight': 'never-exported',
};

function requireMark(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new EditorialMarkError(code, message);
}

function text(value: SQLOutputValue | undefined): string {
  requireMark(typeof value === 'string', 'MARK_STORE_INVALID', '标记记录无效。');
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  requireMark(typeof value === 'number' && Number.isSafeInteger(value), 'MARK_STORE_INVALID', '标记记录无效。');
  return value;
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : text(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function transact<T>(db: DatabaseSync, operation: () => T): T {
  if (db.isTransaction) return operation();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Revision 22's relations and their ledger triggers. Created once and never rebuilt: a store that
 * predates the revision gains five empty relations, and nothing existing moves. Like revision 21's
 * relation this runs before the version moves in `task-authorization.ts` and is shape-detected.
 */
export function initializeEditorialMarkSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'editorial_marks'").get();
  if (existing !== undefined) return;
  transact(db, () => {
    for (const sql of Object.values(EDITORIAL_MARK_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EDITORIAL_MARK_TRIGGER_SQL)) db.exec(sql);
  });
  requireMark(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

const relationSeen = new WeakSet<DatabaseSync>();

/**
 * The followers run inside every manuscript text change, including the ones a migrating store makes
 * before revision 22 exists for it; until the relation is there, there is nothing to follow.
 */
function marksRelationExists(db: DatabaseSync): boolean {
  if (relationSeen.has(db)) return true;
  const exists = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'editorial_marks'").get() !== undefined;
  if (exists) relationSeen.add(db);
  return exists;
}

interface FollowedMarkRow {
  markId: string;
  fromGrapheme: number;
  toGrapheme: number;
  state: 'exact' | 'drifted';
  pinned: string[];
}

function liveMarksOfBlock(db: DatabaseSync, branchId: string, blockId: string): FollowedMarkRow[] {
  const rows = db.prepare(
    `SELECT mark_id, from_grapheme, to_grapheme, anchor_state, pinned_text FROM editorial_marks
     WHERE branch_id = ? AND block_id = ? AND status IN ${LIVE_STATUSES} AND anchor_state IN ('exact', 'drifted')`,
  ).all(branchId, blockId) as SqlRow[];
  return rows.map((row) => ({
    markId: text(row.mark_id),
    fromGrapheme: integer(row.from_grapheme),
    toGrapheme: integer(row.to_grapheme),
    state: text(row.anchor_state) as 'exact' | 'drifted',
    pinned: graphemesOf(text(row.pinned_text)),
  }));
}

/**
 * Carry the marks of one block through a change of its text, inside the caller's transaction.
 * `edits` are the spans the caller replaced, each against the text the previous one left; without
 * them the one span between the two texts is derived. Runs on every durable text change — a journal
 * edit, a replacement, an undo or a redo — so a mark's range is never read against text it was not
 * followed through. A mark pinned on no text, where an applied suggestion deleted its words, is a
 * point: it carries its state through the spans (`followPoint`) instead of being found again.
 */
export function followBlockTextChangeForMarks(
  db: DatabaseSync,
  branchId: string,
  blockId: string,
  beforeText: string,
  afterText: string,
  journalSequence: number,
  edits?: ReadonlyArray<GraphemeEdit & { readonly inserted: ReadonlyArray<string> }>,
): void {
  if (!marksRelationExists(db)) return;
  const marks = liveMarksOfBlock(db, branchId, blockId);
  if (marks.length === 0) return;
  const finalText = graphemesOf(afterText);
  let current = graphemesOf(beforeText);
  const spans = edits ?? (() => {
    const span = deriveSpanEdit(current, finalText);
    return span === null ? [] : [{ ...span, inserted: finalText.slice(span.fromGrapheme, span.fromGrapheme + span.insertedGraphemes) }];
  })();
  const update = db.prepare(
    `UPDATE editorial_marks SET from_grapheme = ?, to_grapheme = ?, anchor_state = ?, followed_journal_sequence = ?
     WHERE mark_id = ?`,
  );
  const followed = marks.map((mark) => ({ ...mark }));
  spans.forEach((span, index) => {
    const next = index === spans.length - 1
      ? finalText
      : [...current.slice(0, span.fromGrapheme), ...span.inserted, ...current.slice(span.toGrapheme)];
    // Points that stand at one place — two deletions applied side by side — have lost the order between
    // them: text inserted exactly there could belong between them, so none can say which side it is on.
    const crowded = followed.filter((mark) => mark.pinned.length === 0 && mark.state === 'exact' &&
      mark.fromGrapheme === span.fromGrapheme && mark.toGrapheme === span.toGrapheme);
    for (const mark of followed) {
      const result = mark.pinned.length === 0 ? followPoint(mark, current, next, span) : followGraphemeEdit(mark, mark.pinned, next, span);
      mark.fromGrapheme = result.fromGrapheme;
      mark.toGrapheme = result.toGrapheme;
      mark.state = crowded.length > 1 && crowded.includes(mark) ? 'drifted' : result.state;
    }
    current = next;
  });
  if (spans.length === 0) {
    for (const mark of followed) {
      const result = mark.pinned.length === 0 ? followPoint(mark, finalText, finalText, null) : resolvePinnedRange(finalText, mark.pinned, mark, mark);
      mark.fromGrapheme = result.fromGrapheme;
      mark.toGrapheme = result.toGrapheme;
      mark.state = result.state;
    }
  }
  for (const mark of followed) update.run(mark.fromGrapheme, mark.toGrapheme, mark.state, journalSequence, mark.markId);
}

/**
 * After the whole working state was replaced — a recovery restoration, a reimport — no spans exist
 * to follow. Every live mark is resolved against what its block holds now: `exact` where its pinned
 * text stands at its range or stands alone in the block, `drifted` otherwise, and `detached` when
 * the block is no longer part of the working state. A detached mark that finds its block again is
 * resolved like any other. A point pinned on no text has nothing to be found by, so it resolves
 * `drifted`: rewritten text never proves where an applied suggestion deleted its words.
 */
export function resolveBranchMarksAfterRewrite(db: DatabaseSync, branchId: string): void {
  if (!marksRelationExists(db)) return;
  const state = db.prepare('SELECT journal_sequence FROM branch_working_state WHERE branch_id = ?').get(branchId) as SqlRow | undefined;
  requireMark(state !== undefined, 'MANUSCRIPT_NOT_FOUND', '稿件工作状态不存在。');
  const journalSequence = integer(state.journal_sequence);
  const rows = db.prepare(
    `SELECT em.mark_id, em.from_grapheme, em.to_grapheme, em.pinned_text, wb.text block_text
     FROM editorial_marks em
     LEFT JOIN working_blocks wb ON wb.branch_id = em.branch_id AND wb.block_id = em.block_id
     WHERE em.branch_id = ? AND em.status IN ${LIVE_STATUSES}`,
  ).all(branchId) as SqlRow[];
  const update = db.prepare(
    `UPDATE editorial_marks SET from_grapheme = ?, to_grapheme = ?, anchor_state = ?, followed_journal_sequence = ?
     WHERE mark_id = ?`,
  );
  const segmented = new Map<string, string[]>();
  for (const row of rows) {
    const markId = text(row.mark_id);
    const from = integer(row.from_grapheme);
    const to = integer(row.to_grapheme);
    if (row.block_text === null || row.block_text === undefined) {
      update.run(from, to, 'detached', journalSequence, markId);
      continue;
    }
    const blockText = text(row.block_text);
    let parts = segmented.get(blockText);
    if (parts === undefined) {
      parts = graphemesOf(blockText);
      segmented.set(blockText, parts);
    }
    const resolved = resolvePinnedRange(parts, graphemesOf(text(row.pinned_text)), { fromGrapheme: from, toGrapheme: to });
    update.run(resolved.fromGrapheme, resolved.toGrapheme, resolved.state, journalSequence, markId);
  }
}

/**
 * The latest committed Apply of one Proposal Change Item, as its Effect Receipt states it, with the
 * Reverse Apply that counteracted it when there is one. Read from the Effect ledger revision 23 adds;
 * a store without it has applied nothing.
 */
export function applicationOfItem(db: DatabaseSync, itemId: string): ManuscriptApplyProjection | null {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'manuscript_effect_receipts'").get() === undefined) return null;
  const row = db.prepare(
    `SELECT i.effect_id, i.kind, i.payload_digest, i.target_count, i.base_revision_id, i.base_journal_sequence, i.base_working_digest,
            i.reverses_effect_id, a.approval_id, a.interaction, d.dispatch_id, r.receipt_id, r.receipt_digest, r.committed_at,
            r.resulting_revision_id, r.resulting_journal_sequence, r.resulting_working_digest,
            (SELECT x.effect_id FROM manuscript_effect_intents x
               JOIN manuscript_effect_receipts xr ON xr.effect_id = x.effect_id
              WHERE x.reverses_effect_id = i.effect_id LIMIT 1) reversed_by
     FROM manuscript_effect_targets t
     JOIN manuscript_effect_intents i ON i.effect_id = t.effect_id AND i.kind = 'apply'
     JOIN manuscript_effect_approvals a ON a.effect_id = i.effect_id
     JOIN manuscript_effect_dispatches d ON d.effect_id = i.effect_id
     JOIN manuscript_effect_receipts r ON r.effect_id = i.effect_id
     WHERE t.item_id = ? ORDER BY r.resulting_journal_sequence DESC LIMIT 1`,
  ).get(itemId) as SqlRow | undefined;
  return row === undefined ? null : applyProjection(row);
}

export function applyProjection(row: SqlRow): ManuscriptApplyProjection {
  return {
    effectId: text(row.effect_id),
    kind: text(row.kind) as ManuscriptApplyProjection['kind'],
    interaction: text(row.interaction) as ManuscriptApplyProjection['interaction'],
    approvalId: text(row.approval_id),
    dispatchId: text(row.dispatch_id),
    receiptId: text(row.receipt_id),
    changeCount: integer(row.target_count),
    payloadDigest: text(row.payload_digest),
    receiptDigest: text(row.receipt_digest),
    before: { revisionId: text(row.base_revision_id), journalSequence: integer(row.base_journal_sequence), workingDigest: text(row.base_working_digest) },
    after: { revisionId: text(row.resulting_revision_id), journalSequence: integer(row.resulting_journal_sequence), workingDigest: text(row.resulting_working_digest) },
    committedAt: text(row.committed_at),
    reversesEffectId: nullableText(row.reverses_effect_id),
    reversedByEffectId: nullableText(row.reversed_by),
  };
}

const ANCHOR_SELECT = `SELECT em.mark_id, em.kind, em.block_id, em.from_grapheme, em.to_grapheme, em.anchor_state, em.status,
       em.highlight_color, em.source_kind,
       (SELECT d.disposition FROM proposal_change_items i
          JOIN proposal_item_decisions d ON d.item_id = i.item_id
         WHERE i.mark_id = em.mark_id ORDER BY d.ordinal DESC LIMIT 1) current_disposition
     FROM editorial_marks em
     JOIN working_blocks wb ON wb.branch_id = em.branch_id AND wb.block_id = em.block_id`;

function anchorProjection(row: SqlRow): EditorialMarkAnchorProjection {
  const disposition = nullableText(row.current_disposition);
  return {
    markId: text(row.mark_id),
    kind: text(row.kind) as EditorialMarkKind,
    blockId: text(row.block_id),
    fromGrapheme: integer(row.from_grapheme),
    toGrapheme: integer(row.to_grapheme),
    anchorState: text(row.anchor_state) as 'exact' | 'drifted',
    status: text(row.status) as EditorialMarkStatus,
    highlightColor: row.highlight_color === null ? null : integer(row.highlight_color) as PersonalHighlightColor,
    sourceKind: text(row.source_kind) as EditorialMarkSourceProjection['kind'],
    disposition: disposition === null || disposition === 'withdrawn' ? null : disposition as ProposalItemDisposition,
  };
}

/**
 * The marks standing in the window that starts at `startPosition`, in reading order. The window is
 * the manuscript window's own — `MAX_WINDOW_BLOCKS` working blocks — so a projection and the marks
 * it carries always describe the same blocks.
 */
export function marksOfWindow(
  db: DatabaseSync,
  branchId: string,
  startPosition: number,
): { marks: EditorialMarkAnchorProjection[]; marksTruncated: boolean } {
  if (!marksRelationExists(db)) return { marks: [], marksTruncated: false };
  const rows = db.prepare(
    `${ANCHOR_SELECT}
     WHERE em.branch_id = ? AND em.status IN ${LIVE_STATUSES} AND em.anchor_state IN ('exact', 'drifted')
       AND wb.position >= ? AND wb.position < ?
     ORDER BY wb.position, em.from_grapheme, em.to_grapheme DESC, em.created_at, em.mark_id
     LIMIT ?`,
  ).all(branchId, startPosition, startPosition + MAX_WINDOW_BLOCKS, MAX_WINDOW_MARKS + 1) as SqlRow[];
  return { marks: rows.slice(0, MAX_WINDOW_MARKS).map(anchorProjection), marksTruncated: rows.length > MAX_WINDOW_MARKS };
}

interface BranchState {
  bookId: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
}

/** A mark an agent-side producer hands over: a review category, a Task or the analysis (S69 onwards). */
export interface ProducedEditorialMarkInput {
  manuscriptId: string;
  branchId: string;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  pinnedText: string;
  kind: 'change-suggestion' | 'annotation';
  body: string;
  proposedText: string | null;
  rationale: string | null;
  atomicGroupId: string | null;
  source: { kind: 'ai7'; origin: 'task' | 'review-category' | 'analysis'; label: string; taskId: string | null }
    | { kind: 'imported-author'; label: string };
  basis: ReadonlyArray<EditorialMarkBasisProjection>;
}

export class EditorialMarkStore {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  create(input: CreateEditorialMarkInput): EditorialMarkCommandProjection {
    this.#requireBinding(input);
    requireMark(
      UUID_PATTERN.test(input.clientMarkId) && UUID_PATTERN.test(input.baseRevisionId) && BLOCK_PATTERN.test(input.blockId) &&
        DIGEST_PATTERN.test(input.baseBlockDigest) && Number.isSafeInteger(input.expectedJournalSequence) && input.expectedJournalSequence >= 0,
      'MARK_INVALID',
      '标记标识无效。',
    );
    requireMark(KINDS.includes(input.kind), 'MARK_INVALID', '标记种类无效。');
    const content = this.#content(input.kind, input.highlightColor, input.body, input.proposedText, input.rationale, input.selectedText);
    const prior = this.#db.prepare('SELECT mark_id, kind, block_id FROM editorial_marks WHERE client_mark_id = ?').get(input.clientMarkId) as SqlRow | undefined;
    if (prior !== undefined) {
      requireMark(text(prior.kind) === input.kind && text(prior.block_id) === input.blockId, 'IDEMPOTENCY_CONFLICT', '标记标识已用于另一条标记。');
      return this.#command(input, text(prior.mark_id));
    }
    const markId = randomUUID();
    transact(this.#db, () => {
      const state = this.#branchState(input.manuscriptId, input.branchId);
      requireMark(
        state.revisionId === input.baseRevisionId && state.journalSequence === input.expectedJournalSequence,
        'MARK_BINDING_CHANGED',
        '稿件已有新的写入，请重新选择文字。',
      );
      const pinned = this.#requireRange(input.branchId, input.blockId, input.baseBlockDigest, input.fromGrapheme, input.toGrapheme, input.selectedText);
      const now = new Date().toISOString();
      this.#insertMark({
        markId, clientMarkId: input.clientMarkId, state, manuscriptId: input.manuscriptId, branchId: input.branchId,
        blockId: input.blockId, blockDigest: input.baseBlockDigest, fromGrapheme: input.fromGrapheme, toGrapheme: input.toGrapheme,
        pinnedText: pinned, kind: input.kind, highlightColor: content.highlightColor, body: content.body,
        source: { kind: 'editor', origin: null, label: null, taskId: null }, basis: [], convertedFrom: null,
        anchorState: 'exact', now,
      });
      if (input.kind === 'change-suggestion') this.#insertItem(markId, pinned, content.proposedText!, content.rationale, null, now);
    });
    return this.#command(input, markId);
  }

  /**
   * A mark made by AI7 or carried in from an imported file. The range is verified against the working
   * state exactly as an editor's is; nothing reaches the manuscript surface unanchored.
   */
  createProduced(input: ProducedEditorialMarkInput): string {
    requireMark(UUID_PATTERN.test(input.manuscriptId) && UUID_PATTERN.test(input.branchId) && BLOCK_PATTERN.test(input.blockId), 'MARK_INVALID', '标记标识无效。');
    requireMark(input.kind === 'change-suggestion' || input.kind === 'annotation', 'MARK_INVALID', '标记种类无效。');
    requireMark(input.source.label.trim().length > 0 && input.source.label.length <= 200, 'MARK_INVALID', '标记来源无效。');
    const content = this.#content(input.kind, null, input.body, input.proposedText, input.rationale, input.pinnedText);
    const markId = randomUUID();
    transact(this.#db, () => {
      const state = this.#branchState(input.manuscriptId, input.branchId);
      const block = this.#db.prepare('SELECT digest FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(input.branchId, input.blockId) as SqlRow | undefined;
      requireMark(block !== undefined, 'MARK_ANCHOR_CHANGED', '所选文字已不在当前稿件中。');
      const digest = text(block.digest);
      const pinned = this.#requireRange(input.branchId, input.blockId, digest, input.fromGrapheme, input.toGrapheme, input.pinnedText);
      const now = new Date().toISOString();
      const source: EditorialMarkSourceProjection = input.source.kind === 'ai7'
        ? { kind: 'ai7', origin: input.source.origin, label: input.source.label, taskId: input.source.taskId }
        : { kind: 'imported-author', origin: null, label: input.source.label, taskId: null };
      this.#insertMark({
        markId, clientMarkId: randomUUID(), state, manuscriptId: input.manuscriptId, branchId: input.branchId,
        blockId: input.blockId, blockDigest: digest, fromGrapheme: input.fromGrapheme, toGrapheme: input.toGrapheme,
        pinnedText: pinned, kind: input.kind, highlightColor: null, body: content.body, source,
        basis: input.basis, convertedFrom: null, anchorState: 'exact', now,
      });
      if (input.kind === 'change-suggestion') this.#insertItem(markId, pinned, content.proposedText!, content.rationale, input.atomicGroupId, now);
    });
    return markId;
  }

  card(manuscriptId: string, branchId: string, markId: string): EditorialMarkCardProjection {
    requireMark(UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(branchId) && UUID_PATTERN.test(markId), 'MARK_INVALID', '标记标识无效。');
    const row = this.#db.prepare(
      `SELECT em.*, mr.revision_label FROM editorial_marks em
       JOIN manuscript_revisions mr ON mr.revision_id = em.pinned_revision_id
       WHERE em.mark_id = ? AND em.manuscript_id = ? AND em.branch_id = ?`,
    ).get(markId, manuscriptId, branchId) as SqlRow | undefined;
    requireMark(row !== undefined && (row.status === 'open' || row.status === 'resolved' || row.status === 'applied'), 'MARK_NOT_FOUND', '这条标记已不存在。');
    const kind = text(row.kind) as EditorialMarkKind;
    const replies = (this.#db.prepare(
      'SELECT reply_id, body, created_at FROM editorial_mark_replies WHERE mark_id = ? ORDER BY ordinal',
    ).all(markId) as SqlRow[]).map((reply) => ({ replyId: text(reply.reply_id), body: text(reply.body), createdAt: text(reply.created_at) }));
    const converted = row.converted_from_mark_id === null ? undefined : this.#db.prepare(
      'SELECT mark_id, kind, source_kind FROM editorial_marks WHERE mark_id = ?',
    ).get(text(row.converted_from_mark_id)) as SqlRow | undefined;
    return {
      markId,
      kind,
      status: text(row.status) as EditorialMarkStatus,
      anchorState: text(row.anchor_state) as EditorialMarkCardProjection['anchorState'],
      highlightColor: row.highlight_color === null ? null : integer(row.highlight_color) as PersonalHighlightColor,
      blockId: text(row.block_id),
      fromGrapheme: integer(row.from_grapheme),
      toGrapheme: integer(row.to_grapheme),
      pinnedText: text(row.pinned_text),
      source: {
        kind: text(row.source_kind) as EditorialMarkSourceProjection['kind'],
        origin: nullableText(row.source_origin) as EditorialMarkSourceProjection['origin'],
        label: nullableText(row.source_label),
        taskId: nullableText(row.source_task_id),
      },
      body: text(row.body),
      replies,
      basis: JSON.parse(text(row.basis_json)) as EditorialMarkBasisProjection[],
      suggestion: kind === 'change-suggestion' ? this.#suggestion(markId) : null,
      convertedFrom: converted === undefined ? null : {
        markId: text(converted.mark_id),
        kind: text(converted.kind) as EditorialMarkKind,
        sourceKind: text(converted.source_kind) as EditorialMarkSourceProjection['kind'],
      },
      exportDisposition: text(row.export_disposition) as EditorialMarkCardProjection['exportDisposition'],
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
      pin: {
        revisionId: text(row.pinned_revision_id),
        revisionLabel: text(row.revision_label),
        journalSequence: integer(row.pinned_journal_sequence),
        blockDigest: text(row.pinned_block_digest),
      },
    };
  }

  update(input: UpdateEditorialMarkInput): EditorialMarkCommandProjection {
    this.#requireBinding(input);
    requireMark(UUID_PATTERN.test(input.markId), 'MARK_INVALID', '标记标识无效。');
    let resultingMarkId = input.markId;
    transact(this.#db, () => {
      const mark = this.#liveMark(input);
      const kind = text(mark.kind) as EditorialMarkKind;
      const now = new Date().toISOString();
      if (input.action === 'edit-body') {
        requireMark((kind === 'annotation' || kind === 'editor-note') && mark.source_kind === 'editor', 'MARK_ACTION_INVALID', '只有自己写的批注和备注可以编辑。');
        const body = this.#body(input.body);
        this.#db.prepare('UPDATE editorial_marks SET body = ?, updated_at = ? WHERE mark_id = ?').run(body, now, input.markId);
      } else if (input.action === 'recolor') {
        requireMark(kind === 'personal-highlight' && (input.highlightColor === 1 || input.highlightColor === 2 || input.highlightColor === 3), 'MARK_ACTION_INVALID', '只有高亮可以换颜色。');
        this.#db.prepare('UPDATE editorial_marks SET highlight_color = ?, updated_at = ? WHERE mark_id = ?').run(input.highlightColor, now, input.markId);
      } else if (input.action === 'set-status') {
        requireMark(kind === 'annotation' && (input.status === 'open' || input.status === 'resolved'), 'MARK_ACTION_INVALID', '只有批注可以标记为已处理。');
        this.#db.prepare('UPDATE editorial_marks SET status = ?, updated_at = ? WHERE mark_id = ?').run(input.status, now, input.markId);
      } else if (input.action === 'reply') {
        requireMark(kind === 'annotation', 'MARK_ACTION_INVALID', '只有批注可以回复。');
        const body = this.#body(input.body);
        const ordinal = integer((this.#db.prepare('SELECT count(*) total FROM editorial_mark_replies WHERE mark_id = ?').get(input.markId) as SqlRow).total) + 1;
        requireMark(ordinal <= MAX_MARK_REPLIES, 'MARK_REPLIES_FULL', '这条批注的回复已达上限。');
        this.#db.prepare(
          "INSERT INTO editorial_mark_replies(reply_id, mark_id, ordinal, body, author, created_at) VALUES (?, ?, ?, ?, 'editor', ?)",
        ).run(randomUUID(), input.markId, ordinal, body, now);
        this.#db.prepare('UPDATE editorial_marks SET updated_at = ? WHERE mark_id = ?').run(now, input.markId);
      } else if (input.action === 'remove') {
        requireMark(kind !== 'change-suggestion', 'MARK_ACTION_INVALID', '修改建议不能删除，请拒绝它。');
        this.#db.prepare("UPDATE editorial_marks SET status = 'removed', updated_at = ? WHERE mark_id = ?").run(now, input.markId);
      } else {
        requireMark(input.action === 'convert', 'MARK_ACTION_INVALID', '标记操作无效。');
        resultingMarkId = this.#convert(input, mark, kind, now);
      }
    });
    return this.#command(input, resultingMarkId, input.action === 'remove');
  }

  decide(input: RecordChangeSuggestionDecisionInput): EditorialMarkCommandProjection {
    this.#requireBinding(input);
    requireMark(UUID_PATTERN.test(input.markId) && UUID_PATTERN.test(input.clientDecisionId), 'MARK_INVALID', '标记标识无效。');
    requireMark(
      input.disposition === 'rejected' || input.disposition === 'accepted-with-edit' || input.disposition === 'withdrawn',
      'MARK_INVALID',
      '处理方式无效。',
    );
    const prior = this.#db.prepare('SELECT 1 FROM proposal_item_decisions WHERE client_decision_id = ?').get(input.clientDecisionId);
    if (prior !== undefined) return this.#command(input, input.markId);
    transact(this.#db, () => {
      const mark = this.#liveMark(input);
      requireMark(mark.kind === 'change-suggestion', 'MARK_ACTION_INVALID', '只有修改建议可以这样处理。');
      requireMark(mark.status !== 'applied', 'MARK_DECISION_INVALID', '这条修改建议已经应用；要改回去，请准备撤销本次应用。');
      const item = this.#db.prepare('SELECT item_id, current_text FROM proposal_change_items WHERE mark_id = ?').get(input.markId) as SqlRow | undefined;
      requireMark(item !== undefined, 'MARK_STORE_INVALID', '修改建议缺少提案修改项。');
      const itemId = text(item.item_id);
      const current = this.#db.prepare(
        'SELECT decision_id, ordinal, disposition FROM proposal_item_decisions WHERE item_id = ? ORDER BY ordinal DESC LIMIT 1',
      ).get(itemId) as SqlRow | undefined;
      const decided = current !== undefined && current.disposition !== 'withdrawn';
      let editedText: string | null = null;
      if (input.disposition === 'withdrawn') {
        requireMark(decided && input.editedText === null && input.reason === null, 'MARK_DECISION_INVALID', '没有可以撤回的处理。');
      } else {
        requireMark(!decided, 'MARK_DECISION_INVALID', '这条修改建议已经处理过，请先撤回。');
        if (input.disposition === 'accepted-with-edit') {
          requireMark(mark.anchor_state === 'exact', 'MARK_ANCHOR_CHANGED', '原文已变，无法接受这条修改建议。');
          requireMark(
            typeof input.editedText === 'string' && input.editedText.isWellFormed() && input.editedText.length <= MAX_MARK_BODY_CODE_UNITS &&
              input.editedText !== text(item.current_text),
            'MARK_DECISION_INVALID',
            '修改后的文字需要与原文不同。',
          );
          editedText = input.editedText;
        } else {
          requireMark(input.editedText === null, 'MARK_DECISION_INVALID', '拒绝时不能附带修改文字。');
        }
      }
      const reason = input.reason === null ? null : this.#body(input.reason);
      const state = this.#branchState(input.manuscriptId, input.branchId);
      const block = this.#db.prepare('SELECT digest FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(input.branchId, text(mark.block_id)) as SqlRow | undefined;
      const decisionId = randomUUID();
      const now = new Date().toISOString();
      this.#db.prepare(
        `INSERT INTO proposal_item_decisions(
           decision_id, client_decision_id, item_id, ordinal, disposition, edited_text, supersedes_decision_id,
           decided_revision_id, decided_journal_sequence, decided_block_digest, actor, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'editor', ?)`,
      ).run(
        decisionId, input.clientDecisionId, itemId, current === undefined ? 1 : integer(current.ordinal) + 1, input.disposition,
        editedText, current === undefined ? null : text(current.decision_id), state.revisionId, state.journalSequence,
        block === undefined ? null : text(block.digest), now,
      );
      if (reason !== null) {
        this.#db.prepare(
          "INSERT INTO proposal_decision_reasons(decision_id, reason, reason_source, recorded_at) VALUES (?, ?, 'reason-field', ?)",
        ).run(decisionId, reason, now);
      }
      this.#db.prepare('UPDATE editorial_marks SET status = ?, updated_at = ? WHERE mark_id = ?')
        .run(input.disposition === 'rejected' ? 'resolved' : 'open', now, input.markId);
    });
    return this.#command(input, input.markId);
  }

  recordDecisionReason(input: RecordProposalDecisionReasonInput): EditorialMarkCommandProjection {
    this.#requireBinding(input);
    requireMark(UUID_PATTERN.test(input.markId) && UUID_PATTERN.test(input.decisionId), 'MARK_INVALID', '标记标识无效。');
    requireMark(input.reasonSource === 'suggested' || input.reasonSource === 'free-text', 'MARK_INVALID', '原因来源无效。');
    const reason = this.#body(input.reason);
    transact(this.#db, () => {
      this.#liveMark(input);
      const current = this.#db.prepare(
        `SELECT d.decision_id, d.disposition FROM proposal_change_items i
         JOIN proposal_item_decisions d ON d.item_id = i.item_id
         WHERE i.mark_id = ? ORDER BY d.ordinal DESC LIMIT 1`,
      ).get(input.markId) as SqlRow | undefined;
      requireMark(
        current !== undefined && text(current.decision_id) === input.decisionId && current.disposition !== 'withdrawn',
        'MARK_DECISION_INVALID',
        '这次处理已经变化，无法补记原因。',
      );
      requireMark(
        this.#db.prepare('SELECT 1 FROM proposal_decision_reasons WHERE decision_id = ?').get(input.decisionId) === undefined,
        'MARK_DECISION_INVALID',
        '这次处理已经记过原因。',
      );
      this.#db.prepare(
        'INSERT INTO proposal_decision_reasons(decision_id, reason, reason_source, recorded_at) VALUES (?, ?, ?, ?)',
      ).run(input.decisionId, reason, input.reasonSource, new Date().toISOString());
    });
    return this.#command(input, input.markId);
  }

  #convert(input: UpdateEditorialMarkInput, mark: SqlRow, kind: EditorialMarkKind, now: string): string {
    const target = input.targetKind;
    requireMark(target !== null && CONVERSIONS[kind].includes(target), 'MARK_ACTION_INVALID', '这种标记不能这样转换。');
    requireMark(mark.status !== 'applied', 'MARK_ACTION_INVALID', '已经应用的修改建议不能转换。');
    requireMark(mark.anchor_state === 'exact', 'MARK_ANCHOR_CHANGED', '原文已变，请先重新标注再转换。');
    const pinnedText = text(mark.pinned_text);
    let source: EditorialMarkSourceProjection = { kind: 'editor', origin: null, label: null, taskId: null };
    let body = '';
    let proposedText: string | null = null;
    let rationale = '';
    if (kind === 'change-suggestion') {
      const item = this.#db.prepare('SELECT item_id, proposed_text, rationale FROM proposal_change_items WHERE mark_id = ?').get(input.markId) as SqlRow | undefined;
      requireMark(item !== undefined, 'MARK_STORE_INVALID', '修改建议缺少提案修改项。');
      const decided = this.#db.prepare(
        'SELECT disposition FROM proposal_item_decisions WHERE item_id = ? ORDER BY ordinal DESC LIMIT 1',
      ).get(text(item.item_id)) as SqlRow | undefined;
      requireMark(decided === undefined || decided.disposition === 'withdrawn', 'MARK_ACTION_INVALID', '已经处理过的修改建议不能转为批注。');
      const proposed = text(item.proposed_text);
      const why = text(item.rationale);
      body = `${proposed.length === 0 ? `建议删去「${pinnedText}」` : `建议将「${pinnedText}」改为「${proposed}」`}${why.length > 0 ? `：${why}` : '。'}`;
      // The words are still the suggestion's own, so the comment keeps the suggestion's source.
      source = {
        kind: text(mark.source_kind) as EditorialMarkSourceProjection['kind'],
        origin: nullableText(mark.source_origin) as EditorialMarkSourceProjection['origin'],
        label: nullableText(mark.source_label),
        taskId: nullableText(mark.source_task_id),
      };
    } else if (target === 'change-suggestion') {
      const content = this.#content(target, null, '', input.proposedText, input.rationale ?? (kind === 'annotation' ? text(mark.body) : null), pinnedText);
      proposedText = content.proposedText;
      rationale = content.rationale;
    } else {
      body = this.#body(input.body ?? (kind === 'editor-note' ? text(mark.body) : null));
    }
    const markId = randomUUID();
    const state = this.#branchState(input.manuscriptId, input.branchId);
    this.#insertMark({
      markId, clientMarkId: randomUUID(), state: {
        ...state,
        revisionId: text(mark.pinned_revision_id),
        journalSequence: integer(mark.pinned_journal_sequence),
      },
      manuscriptId: input.manuscriptId, branchId: input.branchId, blockId: text(mark.block_id),
      blockDigest: text(mark.pinned_block_digest), fromGrapheme: integer(mark.pinned_from_grapheme),
      toGrapheme: integer(mark.pinned_to_grapheme), pinnedText, kind: target, highlightColor: null, body, source,
      basis: JSON.parse(text(mark.basis_json)) as EditorialMarkBasisProjection[], convertedFrom: input.markId,
      anchorState: 'exact', now, live: { fromGrapheme: integer(mark.from_grapheme), toGrapheme: integer(mark.to_grapheme), followed: integer(mark.followed_journal_sequence) },
    });
    if (target === 'change-suggestion') this.#insertItem(markId, pinnedText, proposedText!, rationale, null, now);
    this.#db.prepare("UPDATE editorial_marks SET status = 'converted', updated_at = ? WHERE mark_id = ?").run(now, input.markId);
    return markId;
  }

  #suggestion(markId: string): NonNullable<EditorialMarkCardProjection['suggestion']> {
    const item = this.#db.prepare(
      'SELECT item_id, current_text, proposed_text, rationale, atomic_group_id FROM proposal_change_items WHERE mark_id = ?',
    ).get(markId) as SqlRow | undefined;
    requireMark(item !== undefined, 'MARK_STORE_INVALID', '修改建议缺少提案修改项。');
    const row = this.#db.prepare(
      `SELECT d.decision_id, d.disposition, d.edited_text, d.recorded_at, r.reason, r.reason_source
       FROM proposal_item_decisions d LEFT JOIN proposal_decision_reasons r ON r.decision_id = d.decision_id
       WHERE d.item_id = ? ORDER BY d.ordinal DESC LIMIT 1`,
    ).get(text(item.item_id)) as SqlRow | undefined;
    const decision: ProposalItemDecisionProjection | null = row === undefined || row.disposition === 'withdrawn' ? null : {
      decisionId: text(row.decision_id),
      disposition: text(row.disposition) as ProposalItemDisposition,
      editedText: nullableText(row.edited_text),
      reason: nullableText(row.reason),
      reasonSource: nullableText(row.reason_source) as ProposalItemDecisionProjection['reasonSource'],
      recordedAt: text(row.recorded_at),
    };
    return {
      itemId: text(item.item_id),
      currentText: text(item.current_text),
      proposedText: text(item.proposed_text),
      rationale: text(item.rationale),
      atomicGroupId: nullableText(item.atomic_group_id),
      decision,
      application: applicationOfItem(this.#db, text(item.item_id)),
    };
  }

  /**
   * The seam the Apply owner works through (Issue #408), always inside its own transaction: what one
   * Change Suggestion asks to have written, the Proposal Decision the one interaction records, and
   * where the mark stands once the text under it is the applied text — or the restored one.
   */
  suggestionTarget(binding: { manuscriptId: string; branchId: string; markId: string }): {
    itemId: string; blockId: string; fromGrapheme: number; toGrapheme: number; anchorState: string; status: string;
    currentText: string; proposedText: string; standingText: string;
    decision: { decisionId: string; disposition: string; editedText: string | null } | null;
  } {
    const mark = this.#liveMark(binding);
    requireMark(mark.kind === 'change-suggestion', 'MARK_ACTION_INVALID', '只有修改建议可以应用。');
    const item = this.#db.prepare('SELECT item_id, current_text, proposed_text FROM proposal_change_items WHERE mark_id = ?').get(binding.markId) as SqlRow | undefined;
    requireMark(item !== undefined, 'MARK_STORE_INVALID', '修改建议缺少提案修改项。');
    const decision = this.#db.prepare(
      'SELECT decision_id, disposition, edited_text FROM proposal_item_decisions WHERE item_id = ? ORDER BY ordinal DESC LIMIT 1',
    ).get(text(item.item_id)) as SqlRow | undefined;
    return {
      itemId: text(item.item_id),
      blockId: text(mark.block_id),
      fromGrapheme: integer(mark.from_grapheme),
      toGrapheme: integer(mark.to_grapheme),
      anchorState: text(mark.anchor_state),
      status: text(mark.status),
      currentText: text(item.current_text),
      proposedText: text(item.proposed_text),
      standingText: text(mark.pinned_text),
      decision: decision === undefined || decision.disposition === 'withdrawn' ? null : {
        decisionId: text(decision.decision_id),
        disposition: text(decision.disposition),
        editedText: nullableText(decision.edited_text),
      },
    };
  }

  recordDecisionForApply(
    binding: { manuscriptId: string; branchId: string },
    itemId: string,
    blockId: string,
    disposition: 'accepted' | 'accepted-with-edit' | 'withdrawn',
    editedText: string | null,
    reason: string | null,
    now: string,
  ): string {
    const current = this.#db.prepare(
      'SELECT decision_id, ordinal FROM proposal_item_decisions WHERE item_id = ? ORDER BY ordinal DESC LIMIT 1',
    ).get(itemId) as SqlRow | undefined;
    const state = this.#branchState(binding.manuscriptId, binding.branchId);
    const block = this.#db.prepare('SELECT digest FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(binding.branchId, blockId) as SqlRow | undefined;
    const decisionId = randomUUID();
    this.#db.prepare(
      `INSERT INTO proposal_item_decisions(
         decision_id, client_decision_id, item_id, ordinal, disposition, edited_text, supersedes_decision_id,
         decided_revision_id, decided_journal_sequence, decided_block_digest, actor, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'editor', ?)`,
    ).run(
      decisionId, randomUUID(), itemId, current === undefined ? 1 : integer(current.ordinal) + 1, disposition, editedText,
      current === undefined ? null : text(current.decision_id), state.revisionId, state.journalSequence,
      block === undefined ? null : text(block.digest), now,
    );
    if (reason !== null) {
      this.#db.prepare(
        "INSERT INTO proposal_decision_reasons(decision_id, reason, reason_source, recorded_at) VALUES (?, ?, 'reason-field', ?)",
      ).run(decisionId, this.#body(reason), now);
    }
    return decisionId;
  }

  /**
   * Put a mark on the text an Apply — or its reversal — just wrote. The mark is the mutable relation:
   * it is re-pinned to what now stands under it, and what stood there before stays in the Proposal
   * Change Item and in the Effect's own target record. An Apply that deleted its words wrote no text:
   * the mark is pinned, exactly like any other, on the empty range at the point where they were.
   */
  standMarkOn(
    markId: string,
    status: 'applied' | 'open',
    pin: { revisionId: string; journalSequence: number; blockDigest: string; fromGrapheme: number; toGrapheme: number; text: string },
    now: string,
  ): void {
    const updated = this.#db.prepare(
      `UPDATE editorial_marks SET status = ?, pinned_revision_id = ?, pinned_journal_sequence = ?, pinned_block_digest = ?,
         pinned_from_grapheme = ?, pinned_to_grapheme = ?, pinned_text = ?, pinned_text_digest = ?,
         from_grapheme = ?, to_grapheme = ?, anchor_state = 'exact', followed_journal_sequence = ?, updated_at = ?
       WHERE mark_id = ?`,
    ).run(
      status, pin.revisionId, pin.journalSequence, pin.blockDigest, pin.fromGrapheme, pin.toGrapheme, pin.text, sha256(pin.text),
      pin.fromGrapheme, pin.toGrapheme, pin.journalSequence, now, markId,
    );
    requireMark(updated.changes === 1, 'MARK_STORE_INVALID', '标记记录无效。');
  }

  commandProjection(binding: { manuscriptId: string; branchId: string; windowStartBlockId: string }, markId: string): EditorialMarkCommandProjection {
    this.#requireBinding(binding);
    return this.#command(binding, markId);
  }

  #command(binding: { manuscriptId: string; branchId: string; windowStartBlockId: string }, markId: string, gone = false): EditorialMarkCommandProjection {
    const start = this.#db.prepare('SELECT position FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(binding.branchId, binding.windowStartBlockId) as SqlRow | undefined;
    requireMark(start !== undefined, 'MARK_BINDING_CHANGED', '稿件窗口已变化，请刷新后再试。');
    const live = gone ? undefined : this.#db.prepare(`SELECT 1 FROM editorial_marks WHERE mark_id = ? AND status IN ${LIVE_STATUSES}`).get(markId);
    return {
      markId,
      ...marksOfWindow(this.#db, binding.branchId, integer(start.position)),
      card: live === undefined ? null : this.card(binding.manuscriptId, binding.branchId, markId),
    };
  }

  #requireBinding(binding: { manuscriptId: string; branchId: string; windowStartBlockId: string }): void {
    requireMark(
      UUID_PATTERN.test(binding.manuscriptId) && UUID_PATTERN.test(binding.branchId) && BLOCK_PATTERN.test(binding.windowStartBlockId),
      'MARK_INVALID',
      '标记标识无效。',
    );
  }

  #liveMark(binding: { manuscriptId: string; branchId: string; markId: string }): SqlRow {
    const row = this.#db.prepare(
      `SELECT * FROM editorial_marks WHERE mark_id = ? AND manuscript_id = ? AND branch_id = ? AND status IN ${LIVE_STATUSES}`,
    ).get(binding.markId, binding.manuscriptId, binding.branchId) as SqlRow | undefined;
    requireMark(row !== undefined, 'MARK_NOT_FOUND', '这条标记已不存在。');
    return row;
  }

  #branchState(manuscriptId: string, branchId: string): BranchState {
    const row = this.#db.prepare(
      `SELECT m.book_id, bws.base_revision_id, mr.revision_label, bws.journal_sequence
       FROM branch_working_state bws
       JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       WHERE bws.manuscript_id = ? AND bws.branch_id = ?`,
    ).get(manuscriptId, branchId) as SqlRow | undefined;
    requireMark(row !== undefined, 'MANUSCRIPT_NOT_FOUND', '稿件工作状态不存在。');
    return {
      bookId: text(row.book_id),
      revisionId: text(row.base_revision_id),
      revisionLabel: text(row.revision_label),
      journalSequence: integer(row.journal_sequence),
    };
  }

  /** The range must hold exactly the text the caller says it marks, in the block the caller saw. */
  #requireRange(branchId: string, blockId: string, blockDigest: string, from: number, to: number, selectedText: string): string {
    const block = this.#db.prepare('SELECT text, digest FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(branchId, blockId) as SqlRow | undefined;
    requireMark(block !== undefined && text(block.digest) === blockDigest, 'MARK_ANCHOR_CHANGED', '所选文字所在的段落已变化，请重新选择。');
    const parts = graphemesOf(text(block.text));
    requireMark(
      Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && to > from && to <= parts.length,
      'MARK_RANGE_INVALID',
      '所选文字范围无效。',
    );
    const pinned = parts.slice(from, to).join('');
    requireMark(pinned === selectedText, 'MARK_ANCHOR_CHANGED', '所选文字已变化，请重新选择。');
    return pinned;
  }

  #body(value: string | null): string {
    requireMark(
      typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && value.length <= MAX_MARK_BODY_CODE_UNITS,
      'MARK_BODY_INVALID',
      '请填写内容，且不要超过长度上限。',
    );
    return value.trim();
  }

  #content(
    kind: EditorialMarkKind,
    highlightColor: PersonalHighlightColor | null,
    body: string,
    proposedText: string | null,
    rationale: string | null,
    pinnedText: string,
  ): { highlightColor: PersonalHighlightColor | null; body: string; proposedText: string | null; rationale: string } {
    if (kind === 'personal-highlight') {
      requireMark((highlightColor === 1 || highlightColor === 2 || highlightColor === 3) && body === '' && proposedText === null && rationale === null, 'MARK_INVALID', '高亮内容无效。');
      return { highlightColor, body: '', proposedText: null, rationale: '' };
    }
    requireMark(highlightColor === null, 'MARK_INVALID', '只有高亮带颜色。');
    if (kind === 'change-suggestion') {
      requireMark(
        body === '' && typeof proposedText === 'string' && proposedText.isWellFormed() && proposedText.length <= MAX_MARK_BODY_CODE_UNITS &&
          proposedText !== pinnedText,
        'MARK_BODY_INVALID',
        '修改后的文字需要与原文不同。',
      );
      requireMark(
        rationale === null || (rationale.isWellFormed() && rationale.length <= MAX_MARK_BODY_CODE_UNITS),
        'MARK_BODY_INVALID',
        '修改理由超过长度上限。',
      );
      return { highlightColor: null, body: '', proposedText, rationale: rationale?.trim() ?? '' };
    }
    requireMark(proposedText === null && rationale === null, 'MARK_INVALID', '批注和备注不带修改文字。');
    return { highlightColor: null, body: this.#body(body), proposedText: null, rationale: '' };
  }

  #insertMark(input: {
    markId: string; clientMarkId: string; state: BranchState; manuscriptId: string; branchId: string; blockId: string;
    blockDigest: string; fromGrapheme: number; toGrapheme: number; pinnedText: string; kind: EditorialMarkKind;
    highlightColor: PersonalHighlightColor | null; body: string; source: EditorialMarkSourceProjection;
    basis: ReadonlyArray<EditorialMarkBasisProjection>; convertedFrom: string | null; anchorState: 'exact'; now: string;
    live?: { fromGrapheme: number; toGrapheme: number; followed: number };
  }): void {
    this.#db.prepare(
      `INSERT INTO editorial_marks(
         mark_id, client_mark_id, book_id, manuscript_id, branch_id, block_id, kind, highlight_color,
         pinned_revision_id, pinned_journal_sequence, pinned_block_digest, pinned_from_grapheme, pinned_to_grapheme,
         pinned_text, pinned_text_digest, from_grapheme, to_grapheme, anchor_state, followed_journal_sequence,
         body, source_kind, source_origin, source_label, source_task_id, basis_json, export_disposition, status,
         converted_from_mark_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    ).run(
      input.markId, input.clientMarkId, input.state.bookId, input.manuscriptId, input.branchId, input.blockId, input.kind,
      input.highlightColor, input.state.revisionId, input.state.journalSequence, input.blockDigest, input.fromGrapheme,
      input.toGrapheme, input.pinnedText, sha256(input.pinnedText), input.live?.fromGrapheme ?? input.fromGrapheme,
      input.live?.toGrapheme ?? input.toGrapheme, input.anchorState, input.live?.followed ?? input.state.journalSequence,
      input.body, input.source.kind, input.source.origin, input.source.label, input.source.taskId,
      JSON.stringify(input.basis), EXPORT_DISPOSITION[input.kind], input.convertedFrom, input.now, input.now,
    );
  }

  #insertItem(markId: string, currentText: string, proposedText: string, rationale: string, atomicGroupId: string | null, now: string): void {
    this.#db.prepare(
      `INSERT INTO proposal_change_items(item_id, mark_id, change_type, current_text, proposed_text, rationale, atomic_group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), markId, proposedText.length === 0 ? 'delete' : 'replace', currentText, proposedText, rationale, atomicGroupId, now);
  }
}
