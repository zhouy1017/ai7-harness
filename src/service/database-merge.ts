import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { DIGEST_PATTERN, canonicalJson, isRecord, parseCanonicalJson } from './analysis/canonical.js';

/**
 * 只导入其中的图书，与本机合并（重名的另存） (Issue #434, plan slice S86d; V2-UX-DSTO-017; ADR 0079 §1.5). A Book merges with
 * every record it owns; house settings and credentials never merge; a Book already here is not taken again; a Book with a
 * title already here is stored beside it.
 *
 * What a Book owns is read from the store's own foreign keys, over a policy every relation has:
 * - `seed`: `books`, fixed to the Books chosen — a reference to any other Book is refused, never followed;
 * - `owned`: a row that references an owned row, or that an owned row references, belongs to the Book;
 * - `dependent`: a row taken only because an owned row references it (an import draft a reimport compared against);
 * - `shared`: a house row an owned row references, taken when this store lacks it (a content object, a workflow profile,
 *   the service lifetime a journal entry was written in, the 编辑工作区方案 a Book enabled);
 * - `excluded`: a Book's row that stays behind, said as a notice — its Series membership and Series knowledge, its 资料库
 *   decisions;
 * - `transient`: working state of a session, never taken — import drafts in progress, searches, replacement previews;
 * - `house`: the house's own records, never taken;
 * - `derived`: the search index, rebuilt for the rows taken.
 */

export const DATABASE_MERGE_SCHEMA_SQL = {
  database_merges: `CREATE TABLE database_merges (
  merge_id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL CHECK(outcome IN ('applied', 'failed')),
  package_file_name TEXT NOT NULL CHECK(length(package_file_name) BETWEEN 1 AND 255),
  package_sha256 TEXT NOT NULL CHECK(length(package_sha256) = 64),
  backup_file_name TEXT NOT NULL CHECK(length(backup_file_name) BETWEEN 1 AND 255),
  backup_sha256 TEXT NOT NULL CHECK(length(backup_sha256) = 64),
  books_count INTEGER NOT NULL CHECK(books_count >= 0),
  books_sha256 TEXT NOT NULL CHECK(length(books_sha256) = 64),
  notices_json TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  database_merge_books: `CREATE TABLE database_merge_books (
  merge_id TEXT NOT NULL REFERENCES database_merges(merge_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  book_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('new', 'same-title')),
  internal_number_cleared INTEGER NOT NULL CHECK(internal_number_cleared IN (0, 1)),
  PRIMARY KEY (merge_id, ordinal)
) STRICT`,
} as const;

export const DATABASE_MERGE_TRIGGER_SQL: Readonly<Record<string, string>> = {
  database_merges_no_update: `CREATE TRIGGER database_merges_no_update
    BEFORE UPDATE ON database_merges
    BEGIN
      SELECT RAISE(ABORT, 'DATABASE_MERGE_LEDGER_IMMUTABLE');
    END`,
  database_merges_no_delete: `CREATE TRIGGER database_merges_no_delete
    BEFORE DELETE ON database_merges
    BEGIN
      SELECT RAISE(ABORT, 'DATABASE_MERGE_LEDGER_IMMUTABLE');
    END`,
  database_merge_books_no_update: `CREATE TRIGGER database_merge_books_no_update
    BEFORE UPDATE ON database_merge_books
    BEGIN
      SELECT RAISE(ABORT, 'DATABASE_MERGE_LEDGER_IMMUTABLE');
    END`,
  database_merge_books_no_delete: `CREATE TRIGGER database_merge_books_no_delete
    BEFORE DELETE ON database_merge_books
    BEGIN
      SELECT RAISE(ABORT, 'DATABASE_MERGE_LEDGER_IMMUTABLE');
    END`,
};

export const DATABASE_MERGE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  database_merge_books: ['merge_id>database_merges.merge_id:NO ACTION/NO ACTION/NONE'],
};

/** Revision 58's relations, created once: a store that predates them gains an empty ledger and nothing existing moves. */
export function initializeDatabaseMergeSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'database_merges'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(DATABASE_MERGE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(DATABASE_MERGE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Database merge schema rollback failed.');
    }
    throw error;
  }
}

export type MergeTablePolicy = 'seed' | 'owned' | 'dependent' | 'shared' | 'excluded' | 'transient' | 'house' | 'derived';

export const MERGE_TABLE_POLICY: Readonly<Record<string, MergeTablePolicy>> = {
  books: 'seed',
  // The Book's manuscripts and their history.
  manuscripts: 'owned',
  manuscript_branches: 'owned',
  manuscript_blocks: 'owned',
  manuscript_revisions: 'owned',
  manuscript_block_versions: 'owned',
  manuscript_block_sources: 'owned',
  manuscript_command_groups: 'owned',
  manuscript_command_edits: 'owned',
  manuscript_entry_positions: 'owned',
  manuscript_outline: 'owned',
  branch_working_state: 'owned',
  working_blocks: 'owned',
  working_offset_nodes: 'owned',
  edit_journal_entries: 'owned',
  milestone_versions: 'owned',
  milestone_signoff_records: 'owned',
  recovery_snapshots: 'owned',
  workflow_instances: 'owned',
  // Edits still in the journal are bound to the service lifetime that wrote them, and a lifetime that ended unclean to
  // the recovery it raised: the Book keeps both, as its store did.
  service_lifetime_branch_writes: 'owned',
  recovery_attention: 'owned',
  recovery_decisions: 'owned',
  recovery_restorations: 'owned',
  recovery_restore_stages: 'owned',
  recovery_restore_stage_blocks: 'owned',
  manuscript_recovery_review_status: 'owned',
  // Its sources and their imports.
  source_versions: 'owned',
  source_provenance: 'owned',
  source_import_records: 'owned',
  manuscript_import_records: 'owned',
  import_fidelity_reviews: 'owned',
  import_fidelity_categories: 'owned',
  import_fidelity_choices: 'owned',
  import_degradation_decisions: 'owned',
  manuscript_reimport_comparisons: 'owned',
  manuscript_reimport_mappings: 'owned',
  manuscript_reimport_mapping_resolutions: 'owned',
  manuscript_reimport_groups: 'owned',
  manuscript_reimport_group_sets: 'owned',
  manuscript_reimport_group_members: 'owned',
  manuscript_reimport_group_resolutions: 'owned',
  manuscript_reimport_records: 'owned',
  manuscript_reimport_mark_outcomes: 'owned',
  // The commits the Book's imports were recorded by, and the drafts they committed — never a draft still in progress.
  import_commits: 'owned',
  import_drafts: 'dependent',
  // Its marks, suggestions and the decisions and Effects on them.
  editorial_marks: 'owned',
  editorial_mark_replies: 'owned',
  proposal_change_items: 'owned',
  proposal_item_decisions: 'owned',
  proposal_decision_reasons: 'owned',
  proposal_decision_feedback: 'owned',
  proposal_conflict_drafts: 'owned',
  proposal_conflict_deferrals: 'owned',
  proposal_conflict_outcomes: 'owned',
  manuscript_effect_intents: 'owned',
  manuscript_effect_approvals: 'owned',
  manuscript_effect_dispatches: 'owned',
  manuscript_effect_receipts: 'owned',
  manuscript_effect_targets: 'owned',
  // Its Tasks, Runs and Result Sets.
  task_intents: 'owned',
  execution_plans: 'owned',
  plan_envelopes: 'owned',
  provider_resolution_plans: 'owned',
  run_source_scopes: 'owned',
  task_artifact_pins: 'owned',
  task_manuscript_pins: 'owned',
  task_input_checkpoints: 'owned',
  run_authorizations: 'owned',
  run_records: 'owned',
  analysis_task_intents: 'owned',
  analysis_task_input_checkpoints: 'owned',
  analysis_plan_records: 'owned',
  analysis_plan_versions: 'owned',
  analysis_plan_revisions: 'owned',
  analysis_run_authorizations: 'owned',
  analysis_run_records: 'owned',
  analysis_run_states: 'owned',
  analysis_execution_attempts: 'owned',
  analysis_execution_bindings: 'owned',
  analysis_harness_spans: 'owned',
  analysis_plan_adaptations: 'owned',
  analysis_unit_checkpoints: 'owned',
  analysis_clarification_requests: 'owned',
  analysis_clarification_answers: 'owned',
  analysis_result_sets: 'owned',
  analysis_result_set_revisions: 'owned',
  analysis_unit_results: 'owned',
  analysis_task_outcomes: 'owned',
  analysis_feedback_signals: 'owned',
  default_execution_rules: 'owned',
  default_execution_rule_versions: 'owned',
  default_execution_rule_states: 'owned',
  review_runs: 'owned',
  review_run_authorizations: 'owned',
  review_run_category_events: 'owned',
  review_findings: 'owned',
  review_finding_dispositions: 'owned',
  review_reports: 'owned',
  quality_signals: 'owned',
  learning_eligibility_decisions: 'owned',
  // Its deliverables, publication and people.
  publication_versions: 'owned',
  publication_events: 'owned',
  publication_actuals: 'owned',
  public_release_permissions: 'owned',
  export_preparations: 'owned',
  export_approvals: 'owned',
  export_receipts: 'owned',
  production_documents: 'owned',
  production_document_versions: 'owned',
  production_document_deliveries: 'owned',
  production_document_origin_readings: 'owned',
  production_document_type_decisions: 'owned',
  production_document_workflow_instances: 'owned',
  production_document_phase_transitions: 'owned',
  book_delivery_package_versions: 'owned',
  book_delivery_package_exports: 'owned',
  book_delivery_package_export_files: 'owned',
  maintenance_cases: 'owned',
  maintenance_case_revisions: 'owned',
  maintenance_errata_versions: 'owned',
  evaluation_records: 'owned',
  evaluation_record_entries: 'owned',
  book_dimension_sets: 'owned',
  book_dimensions: 'owned',
  book_people_versions: 'owned',
  // Its enablement of the 编辑工作区方案 and the 权限侧车 revisions it pinned, which its prepared Tasks name (Issue #434 review).
  native_artifact_book_enablements: 'owned',
  editorial_workspace_profile_book_pins: 'owned',
  // House rows a Book's records reference: taken when this store lacks them. The 方案 is the one every AI7 carries, fixed to
  // its bytes: a Book that enabled it brings it, whole, to data that has not installed it.
  content_objects: 'shared',
  workflow_profiles: 'shared',
  service_lifetimes: 'shared',
  native_artifact_installations: 'shared',
  editorial_workspace_profile_sidecar_revisions: 'shared',
  // What stays behind, said as a notice.
  series_membership_changes: 'excluded',
  series_knowledge_candidates: 'excluded',
  series_knowledge_revisions: 'excluded',
  library_material_decisions: 'excluded',
  // Working state of a session.
  import_commit_attempts: 'transient',
  import_abandonment_cleanup_intents: 'transient',
  import_ingest_blocks: 'transient',
  staged_import_snapshots: 'transient',
  staged_import_blocks: 'transient',
  staged_import_block_sources: 'transient',
  staged_import_marks: 'transient',
  staged_import_text_box_paragraphs: 'transient',
  manuscript_search_sessions: 'transient',
  manuscript_search_results: 'transient',
  manuscript_replacement_previews: 'transient',
  manuscript_replacement_matches: 'transient',
  // The house's own records.
  model_service_connections: 'house',
  review_guideline_versions: 'house',
  library_materials: 'house',
  series: 'house',
  series_knowledge_items: 'house',
  series_knowledge_promotions: 'house',
  evaluation_preferences: 'house',
  store_versions: 'house',
  database_export_preparations: 'house',
  database_export_approvals: 'house',
  database_export_receipts: 'house',
  backup_preferences: 'house',
  scheduled_backups: 'house',
  scheduled_backup_removals: 'house',
  database_replacements: 'house',
  database_merges: 'house',
  database_merge_books: 'house',
  // The search index over the working text, and its own relations.
  working_block_search: 'derived',
  working_block_search_config: 'derived',
  working_block_search_content: 'derived',
  working_block_search_data: 'derived',
  working_block_search_docsize: 'derived',
  working_block_search_idx: 'derived',
};

/** What stays behind when a Book merges, said to the editor. */
export type MergeNotice = 'series' | 'library-materials' | 'internal-number';

const EXCLUSION_NOTICES: Readonly<Record<string, { notice: MergeNotice; bookColumn: string }>> = {
  series_membership_changes: { notice: 'series', bookColumn: 'book_id' },
  series_knowledge_candidates: { notice: 'series', bookColumn: 'source_book_id' },
  series_knowledge_revisions: { notice: 'series', bookColumn: 'source_book_id' },
  library_material_decisions: { notice: 'library-materials', bookColumn: 'book_id' },
};

export class DatabaseMergeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DatabaseMergeError';
  }
}

function requireMerge(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DatabaseMergeError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

/** A quoted identifier, from the store's own catalogue only. */
function quoted(name: string): string {
  requireMerge(/^[a-z_][a-z0-9_]*$/u.test(name), 'DATABASE_MERGE_SCHEMA_INVALID', '数据库结构无法识别。');
  return `"${name}"`;
}

function tableExists(db: DatabaseSync, schema: 'main' | 'src', table: string): boolean {
  return db.prepare(`SELECT 1 FROM ${schema}.sqlite_schema WHERE type = 'table' AND name = ?`).get(table) !== undefined;
}

function columnsOf(db: DatabaseSync, schema: 'main' | 'src', table: string): string[] {
  return (db.prepare(`PRAGMA ${schema}.table_info(${quoted(table)})`).all() as SqlRow[]).map((row) => String(row.name));
}

function primaryKeyOf(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA main.table_info(${quoted(table)})`).all() as SqlRow[])
    .filter((row) => Number(row.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map((row) => String(row.name));
}

interface ForeignKey {
  readonly table: string;
  readonly parent: string;
  readonly columns: ReadonlyArray<string>;
  readonly parentColumns: ReadonlyArray<string>;
}

/**
 * References the store keeps by value, without a foreign key, followed as if they had one: each import record's commit, and
 * each journal entry's service lifetime.
 */
const IMPLICIT_REFERENCES: ReadonlyArray<ForeignKey> = [
  { table: 'manuscript_import_records', parent: 'import_commits', columns: ['commit_id'], parentColumns: ['commit_id'] },
  { table: 'source_import_records', parent: 'import_commits', columns: ['commit_id'], parentColumns: ['commit_id'] },
  { table: 'manuscript_reimport_records', parent: 'import_commits', columns: ['commit_id'], parentColumns: ['commit_id'] },
  { table: 'edit_journal_entries', parent: 'service_lifetimes', columns: ['service_lifetime_id'], parentColumns: ['lifetime_id'] },
];

/** Every foreign key of the store, each with its columns in order; a key naming no parent column names the parent's key. */
function foreignKeysOf(db: DatabaseSync, tables: ReadonlyArray<string>): ForeignKey[] {
  const keys: ForeignKey[] = [];
  for (const table of tables) {
    const rows = db.prepare(`PRAGMA main.foreign_key_list(${quoted(table)})`).all() as SqlRow[];
    const byId = new Map<number, SqlRow[]>();
    for (const row of rows) byId.set(Number(row.id), [...(byId.get(Number(row.id)) ?? []), row]);
    for (const group of byId.values()) {
      group.sort((left, right) => Number(left.seq) - Number(right.seq));
      const parent = String(group[0]!.table);
      const named = group.every((row) => row.to !== null);
      keys.push({
        table,
        parent,
        columns: group.map((row) => String(row.from)),
        parentColumns: named ? group.map((row) => String(row.to)) : primaryKeyOf(db, parent),
      });
    }
  }
  return keys;
}

function tuple(alias: string, columns: ReadonlyArray<string>): string {
  return `(${columns.map((column) => `${alias}.${quoted(column)}`).join(', ')})`;
}

/** Every table of the attached store, and whether its policy is known: a relation without a policy is never guessed at. */
function catalogue(db: DatabaseSync): string[] {
  const tables = (db.prepare("SELECT name FROM main.sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as SqlRow[])
    .map((row) => String(row.name));
  const unknown = tables.filter((table) => MERGE_TABLE_POLICY[table] === undefined);
  requireMerge(unknown.length === 0, 'DATABASE_MERGE_SCHEMA_INVALID', '数据库里有 AI7 不认识的关系，不能合并。');
  return tables;
}

// ---- the plan ------------------------------------------------------------------------------------------

/** One Book of the package, as merging would take it. */
export interface MergeBookPlan {
  readonly bookId: string;
  readonly title: string;
  /** `new` merges; `present` is this very Book, already here, and is not taken again; `same-title` merges beside it. */
  readonly status: 'new' | 'present' | 'same-title';
  /** Its 内部编号 is already another Book's here, so it merges without one. */
  readonly internalNumberCleared: boolean;
}

/** At most this many of a package's Books are listed in a preview or a waiting merge; the rest are counted (Issue #434 review). */
export const MAX_MERGE_BOOKS_LISTED = 50;

export interface MergePlan {
  /** The package's first Books, in the order they were made, as merging would take them: what a preview lists. */
  readonly books: ReadonlyArray<MergeBookPlan>;
  /** How many of the package's Books merging would take as new, leave as already here, or take beside one of the same title. */
  readonly counts: { readonly new: number; readonly present: number; readonly sameTitle: number };
  readonly notices: ReadonlyArray<MergeNotice>;
}

/** A Book of `src` merging would take: none of this store's Books has its id or its identity. */
const MERGING_BOOK = 'NOT EXISTS (SELECT 1 FROM main.books m WHERE m.book_id = b.book_id OR m.stable_identity = b.stable_identity)';

/**
 * The Books of the store attached as `src`, as merging them into `main` would take them: new, already here, or with a title
 * already here — and what would stay behind. A read of both, as a stream (Issue #434 review): it keeps the page listed and
 * the counts, and hands each Book merging would take, in order, to `merging`, never holding them all.
 */
export function planMerge(db: DatabaseSync, listed = MAX_MERGE_BOOKS_LISTED, merging?: (book: MergeBookPlan) => void): MergePlan {
  const counts = { new: 0, present: 0, sameTitle: 0 };
  // A store with no Books offers none to merge.
  if (!tableExists(db, 'src', 'books')) return { books: [], counts, notices: [] };
  const internal = columnsOf(db, 'src', 'books').includes('internal_number');
  // Read as a stream (Issue #434 review): the page listed and the Books merging would take, never every Book whole.
  const rows = db.prepare(
    `SELECT book_id, stable_identity, title, ${internal ? 'internal_number' : 'NULL AS internal_number'} FROM src.books ORDER BY created_at, book_id`,
  ).iterate() as Iterable<SqlRow>;
  const present = db.prepare('SELECT 1 FROM main.books WHERE book_id = ? OR stable_identity = ?');
  const sameTitle = db.prepare('SELECT 1 FROM main.books WHERE title = ?');
  const numberTaken = db.prepare('SELECT 1 FROM main.books WHERE internal_number = ?');
  const books: MergeBookPlan[] = [];
  let numberCleared = false;
  for (const row of rows) {
    const bookId = String(row.book_id);
    const title = String(row.title);
    const status = present.get(bookId, String(row.stable_identity)) !== undefined ? 'present'
      : sameTitle.get(title) !== undefined ? 'same-title' : 'new';
    const book: MergeBookPlan = {
      bookId,
      title,
      status,
      internalNumberCleared: status !== 'present' && row.internal_number !== null && numberTaken.get(String(row.internal_number)) !== undefined,
    };
    if (status === 'present') counts.present += 1;
    else if (status === 'same-title') counts.sameTitle += 1;
    else counts.new += 1;
    if (books.length < listed) books.push(book);
    if (status !== 'present') merging?.(book);
    numberCleared ||= book.internalNumberCleared;
  }
  // What stays behind is asked of the store, over the Books merging would take, never of a list of them.
  const notices = new Set<MergeNotice>();
  for (const [table, { notice, bookColumn }] of Object.entries(EXCLUSION_NOTICES)) {
    if (counts.new + counts.sameTitle === 0 || !tableExists(db, 'src', table)) continue;
    const found = db.prepare(
      `SELECT 1 FROM src.${quoted(table)} t WHERE t.${quoted(bookColumn)} IN (SELECT b.book_id FROM src.books b WHERE ${MERGING_BOOK}) LIMIT 1`,
    ).get();
    if (found !== undefined) notices.add(notice);
  }
  if (numberCleared) notices.add('internal-number');
  return { books, counts, notices: [...notices].sort() };
}

// ---- the list of the Books a merge takes ---------------------------------------------------------------

/** The staged list of the Books a merge takes (Issue #434 review): one canonical line each, in order, never held whole. */
export const MERGING_BOOKS_FILE = 'merging.jsonl';

/** What a merge's intent names of its list: the digest of its lines and how many there are. */
export interface MergingBooks {
  readonly sha256: string;
  readonly count: number;
}

const LIST_CHUNK_BYTES = 64 * 1024;

function mergingLine(book: MergeBookPlan): string {
  return `${canonicalJson({ bookId: book.bookId, internalNumberCleared: book.internalNumberCleared, status: book.status, title: book.title })}\n`;
}

/** Writes the list a line at a time as the plan hands each Book over, hashing and counting it; nothing is held but a chunk. */
export class MergingBooksWriter {
  readonly #fd: number;
  readonly #hash = createHash('sha256');
  #count = 0;
  #pending = '';

  constructor(path: string) {
    this.#fd = openSync(path, 'wx');
  }

  add(book: MergeBookPlan): void {
    const line = mergingLine(book);
    this.#hash.update(line);
    this.#count += 1;
    this.#pending += line;
    if (this.#pending.length >= LIST_CHUNK_BYTES) this.#flush();
  }

  /** The list whole, synced, and what the intent names of it. */
  finish(): MergingBooks {
    this.#flush();
    fsyncSync(this.#fd);
    closeSync(this.#fd);
    return { sha256: this.#hash.digest('hex'), count: this.#count };
  }

  abort(): void {
    try { closeSync(this.#fd); } catch { /* already closed */ }
  }

  #flush(): void {
    if (this.#pending.length > 0) writeSync(this.#fd, this.#pending);
    this.#pending = '';
  }
}

function isMergingBook(value: unknown): value is MergeBookPlan {
  return isRecord(value) && Object.keys(value).length === 4 && typeof value.bookId === 'string' && typeof value.title === 'string' &&
    (value.status === 'new' || value.status === 'same-title') && typeof value.internalNumberCleared === 'boolean';
}

/** Whether `value` is what an intent names of its list. */
export function isMergingBooks(value: unknown): value is MergingBooks {
  return isRecord(value) && Object.keys(value).length === 2 && typeof value.sha256 === 'string' && DIGEST_PATTERN.test(value.sha256) &&
    typeof value.count === 'number' && Number.isSafeInteger(value.count) && value.count >= 1;
}

/**
 * Each Book the staged list at `path` names, in order, read a chunk at a time; the list must be exactly what `expected` names —
 * its digest and its count — or reading it throws `DATABASE_MERGE_BOOKS_CHANGED` once that is known.
 */
export function* readMergingBooks(path: string, expected: MergingBooks): Generator<MergeBookPlan> {
  const changed = (): DatabaseMergeError => new DatabaseMergeError('DATABASE_MERGE_BOOKS_CHANGED', '准备好的图书清单已不完整或被改动。');
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    throw changed();
  }
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(LIST_CHUNK_BYTES);
  let rest = '';
  let count = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      const chunk = buffer.subarray(0, read);
      hash.update(chunk);
      let text: string;
      try {
        text = rest + decoder.decode(chunk, { stream: true });
      } catch {
        throw changed();
      }
      const lines = text.split('\n');
      rest = lines.pop()!;
      // No one line may outgrow a chunk many times over: a list that does is not one AI7 wrote.
      if (rest.length > LIST_CHUNK_BYTES * 4) throw changed();
      for (const line of lines) {
        let book: unknown;
        try {
          book = parseCanonicalJson(line);
        } catch {
          throw changed();
        }
        if (!isMergingBook(book) || `${line}\n` !== mergingLine(book)) throw changed();
        count += 1;
        if (count > expected.count) throw changed();
        yield book;
      }
    }
  } finally {
    closeSync(fd);
  }
  if (rest !== '' || count !== expected.count || hash.digest('hex') !== expected.sha256) throw changed();
}

// ---- the merge -----------------------------------------------------------------------------------------

/** What a merge took: the Books, the rows, and the stored files. */
export interface MergeCounts {
  readonly books: number;
  readonly rows: number;
  readonly files: number;
}

const CONTENT_KEY = /^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]+$/u;
const RECOVERY_KEY = /^v1\/[0-9a-f]{64}\.snapshot$/u;
const RETAINED_CARRIER_KEY = /^sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\/package\.json$/u;

/** Copy a stored file the merge takes, unless this data already has it: its name is its content's digest. */
function copyStoredFile(sourceRoot: string, targetRoot: string, place: string, key: string, pattern: RegExp): boolean {
  requireMerge(pattern.test(key), 'DATABASE_MERGE_FILE_INVALID', '合并所需的文件名无效。');
  const target = join(targetRoot, place, ...key.split('/'));
  if (existsSync(target)) return false;
  const source = join(sourceRoot, place, ...key.split('/'));
  requireMerge(existsSync(source), 'DATABASE_MERGE_FILE_MISSING', '数据库文件里缺少合并所需的文件。');
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  return true;
}

/**
 * Merge the Books `bookIds` of the store attached as `src` into `main`, with every record they own, in one transaction —
 * all of it or none. The stored files their records name are copied from `roots.source` into `roots.target` first; a file
 * the transaction then does not keep is removed by the store's own sweep at its next open. Both stores must be at the same
 * schema revision.
 */
export function mergeBooks(db: DatabaseSync, bookIds: Iterable<string>, roots: { readonly source: string; readonly target: string }): MergeCounts {
  const count = listBooks(db, (function* books(): Generator<MergeBookPlan> {
    for (const bookId of bookIds) yield { bookId, title: '', status: 'new', internalNumberCleared: false };
  })());
  try {
    return mergeListedBooks(db, count, roots);
  } finally {
    db.exec('DROP TABLE IF EXISTS temp.merge_books');
  }
}

/**
 * The Books a merge takes, into a table of the connection's own (`temp.merge_books`), one row each and in their order, as the
 * merge's receipt names them: how many.
 */
function listBooks(db: DatabaseSync, books: Iterable<MergeBookPlan>): number {
  db.exec('DROP TABLE IF EXISTS temp.merge_books');
  db.exec(`CREATE TEMP TABLE merge_books (
    book_id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE, title TEXT NOT NULL, status TEXT NOT NULL, internal_number_cleared INTEGER NOT NULL
  ) WITHOUT ROWID`);
  const insert = db.prepare('INSERT INTO temp.merge_books (book_id, ordinal, title, status, internal_number_cleared) VALUES (?, ?, ?, ?, ?)');
  let count = 0;
  db.exec('BEGIN');
  try {
    for (const book of books) {
      count += 1;
      insert.run(book.bookId, count, book.title, book.status, book.internalNumberCleared ? 1 : 0);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* nothing began */ }
    db.exec('DROP TABLE IF EXISTS temp.merge_books');
    if (error instanceof DatabaseMergeError) throw error;
    throw new DatabaseMergeError('DATABASE_MERGE_BOOKS_CHANGED', '准备好的图书清单已不完整或被改动。');
  }
  return count;
}

/**
 * Merge the `count` Books listed in `temp.merge_books`, as `mergeBooks` describes; `receipt`, when given, writes what the merge
 * took in the same transaction, so the record and the Books it names commit together or not at all.
 */
function mergeListedBooks(
  db: DatabaseSync,
  count: number,
  roots: { readonly source: string; readonly target: string },
  receipt?: (db: DatabaseSync) => void,
): MergeCounts {
  const version = (schema: 'main' | 'src'): number => Number((db.prepare(`PRAGMA ${schema}.user_version`).get() as SqlRow).user_version);
  requireMerge(version('main') === version('src'), 'DATABASE_MERGE_REVISION_MISMATCH', '本机数据与数据库文件的结构版本不同，不能合并。');
  const tables = catalogue(db);
  const keys = [...foreignKeysOf(db, tables), ...IMPLICIT_REFERENCES];
  const policy = (table: string): MergeTablePolicy => MERGE_TABLE_POLICY[table]!;
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('BEGIN IMMEDIATE');
  try {
    // Every foreign key is checked when the merge commits, and the store's insert triggers look only for a conflicting row,
    // never for a parent, so the relations go in whatever order they are listed. The rows of one relation go in the order they
    // were written, which is the order the one trigger that compares rows of its own relation asks for: a Book's 方案 pins,
    // Revision 1 before Revision 2.
    db.exec('PRAGMA defer_foreign_keys = ON');
    db.exec('CREATE TEMP TABLE merge_rows (tbl TEXT NOT NULL, r INTEGER NOT NULL, PRIMARY KEY (tbl, r)) WITHOUT ROWID');
    const seeded = db.prepare(
      `INSERT INTO temp.merge_rows (tbl, r) SELECT 'books', rowid FROM src.books
       WHERE book_id IN (SELECT book_id FROM temp.merge_books) AND book_id NOT IN (SELECT book_id FROM main.books)
         AND stable_identity NOT IN (SELECT stable_identity FROM main.books)`,
    ).run().changes;
    requireMerge(Number(seeded) === count, 'DATABASE_MERGE_BOOK_PRESENT', '要合并的图书已在本机，或不在数据库文件里。');
    const pull = (into: string, where: string): number =>
      Number(db.prepare(
        `INSERT OR IGNORE INTO temp.merge_rows (tbl, r) SELECT ?, x.rowid FROM src.${quoted(into)} x WHERE ${where}`,
      ).run(into).changes);
    const owned = (table: string, alias: string): string => `JOIN temp.merge_rows m ON m.tbl = '${table}' AND m.r = ${alias}.rowid`;
    // The Book's rows, followed through the store's own keys until nothing more is found: a row that references a row of
    // the Book belongs to it, and so does a row one of its rows references.
    for (let changed = true; changed;) {
      changed = false;
      for (const key of keys) {
        const child = policy(key.table);
        const parent = policy(key.parent);
        if (child === 'owned' && (parent === 'owned' || parent === 'seed')) {
          changed = pull(key.table,
            `${tuple('x', key.columns)} IN (SELECT ${tuple('p', key.parentColumns).slice(1, -1)} FROM src.${quoted(key.parent)} p ${owned(key.parent, 'p')})`) > 0 || changed;
        }
        if ((child === 'owned' || child === 'dependent') && (parent === 'owned' || parent === 'dependent')) {
          changed = pull(key.parent,
            `${tuple('x', key.parentColumns)} IN (SELECT ${tuple('c', key.columns).slice(1, -1)} FROM src.${quoted(key.table)} c ${owned(key.table, 'c')})`) > 0 || changed;
        }
      }
    }
    // A reference from the Book's rows to a Book not chosen is refused, never followed.
    for (const key of keys) {
      if (policy(key.parent) !== 'seed' || !['owned', 'dependent'].includes(policy(key.table))) continue;
      const stray = db.prepare(
        `SELECT 1 FROM src.${quoted(key.table)} c ${owned(key.table, 'c')}
         WHERE ${tuple('c', key.columns)} IS NOT NULL AND ${tuple('c', key.columns)} NOT IN (SELECT ${tuple('b', key.parentColumns).slice(1, -1)} FROM src.books b ${owned('books', 'b')}) LIMIT 1`,
      ).get();
      requireMerge(stray === undefined, 'DATABASE_MERGE_CROSS_BOOK', '图书的记录引用了另一本图书，不能单独合并。');
    }
    // The house rows the Book's rows reference.
    for (const key of keys) {
      if (policy(key.parent) !== 'shared' || !['owned', 'dependent'].includes(policy(key.table))) continue;
      pull(key.parent,
        `${tuple('x', key.parentColumns)} IN (SELECT ${tuple('c', key.columns).slice(1, -1)} FROM src.${quoted(key.table)} c ${owned(key.table, 'c')})`);
    }
    // The 编辑工作区方案 a Book enabled comes whole to data that has not installed it: with both of its 权限侧车 revisions, as
    // installing it writes them, not only the one the Book pinned. Data that has installed it keeps its own.
    pull('editorial_workspace_profile_sidecar_revisions',
      `x.native_artifact_id IN (SELECT i.artifact_id FROM src.native_artifact_installations i ${owned('native_artifact_installations', 'i')})`);
    // The stored files first: the content objects and the milestones' recovery objects the rows name, each read as it is copied.
    let files = 0;
    for (const row of db.prepare(`SELECT x.relative_key AS k FROM src.content_objects x ${owned('content_objects', 'x')}`).iterate() as Iterable<SqlRow>) {
      if (copyStoredFile(roots.source, roots.target, 'objects', String(row.k), CONTENT_KEY)) files += 1;
    }
    for (const row of db.prepare(`SELECT x.object_relative_key AS k FROM src.recovery_snapshots x ${owned('recovery_snapshots', 'x')}`).iterate() as Iterable<SqlRow>) {
      if (copyStoredFile(roots.source, roots.target, 'recovery-objects', String(row.k), RECOVERY_KEY)) files += 1;
    }
    // And the carrier a 方案 installed here by the merge keeps, as installing it retains it.
    for (const row of db.prepare(
      `SELECT x.retained_key AS k FROM src.native_artifact_installations x ${owned('native_artifact_installations', 'x')}
       WHERE x.artifact_id NOT IN (SELECT artifact_id FROM main.native_artifact_installations)`,
    ).iterate() as Iterable<SqlRow>) {
      if (copyStoredFile(roots.source, roots.target, 'native-artifacts', String(row.k), RETAINED_CARRIER_KEY)) files += 1;
    }
    // The rows. A Book whose 内部编号 is already another Book's here merges without one; a house row this store already has
    // stays as it is.
    let rows = 0;
    const taken = tables.filter((table) => ['seed', 'owned', 'dependent', 'shared'].includes(policy(table)));
    for (const table of taken) {
      const kind = policy(table);
      const columns = columnsOf(db, 'main', table);
      const sourceColumns = new Set(columnsOf(db, 'src', table));
      requireMerge(columns.every((column) => sourceColumns.has(column)) && sourceColumns.size === columns.length,
        'DATABASE_MERGE_SCHEMA_INVALID', '本机数据与数据库文件的结构不同，不能合并。');
      const selected = columns.map((column) => table === 'books' && column === 'internal_number'
        ? 'CASE WHEN x.internal_number IN (SELECT internal_number FROM main.books WHERE internal_number IS NOT NULL) THEN NULL ELSE x.internal_number END'
        : `x.${quoted(column)}`);
      const absent = kind === 'shared'
        ? ` AND ${tuple('x', primaryKeyOf(db, table))} NOT IN (SELECT ${primaryKeyOf(db, table).map(quoted).join(', ')} FROM main.${quoted(table)})`
        : '';
      rows += Number(db.prepare(
        `INSERT INTO main.${quoted(table)} (${columns.map(quoted).join(', ')})
         SELECT ${selected.join(', ')} FROM src.${quoted(table)} x ${owned(table, 'x')} WHERE 1 = 1${absent} ORDER BY x.rowid`,
      ).run().changes);
    }
    // The search index over the working text the Book brought.
    db.prepare(
      `INSERT INTO main.working_block_search (branch_id, block_id, text)
       SELECT x.branch_id, x.block_id, x.text FROM src.working_blocks x ${owned('working_blocks', 'x')}`,
    ).run();
    db.exec('DROP TABLE temp.merge_rows');
    receipt?.(db);
    db.exec('COMMIT');
    return { books: count, rows, files };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* the transaction is already gone */ }
    try { db.exec('DROP TABLE IF EXISTS temp.merge_rows'); } catch { /* nothing to drop */ }
    if (error instanceof DatabaseMergeError) throw error;
    throw new DatabaseMergeError('DATABASE_MERGE_FAILED', `合并未能完成：${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---- the merge at the next open ---------------------------------------------------------------------------

const STORE_KEPT = ['ai7.sqlite', 'ai7.sqlite-wal'] as const;
const STORE_SIDECARS = ['ai7.sqlite-wal', 'ai7.sqlite-shm', 'ai7.sqlite-journal'] as const;
const SAVED_WHOLE = 'saved';

/** The store's own files, copied aside whole before a merge touches them: the store and any journal it left. */
export function saveStoreFiles(dataRoot: string, into: string): void {
  rmSync(into, { recursive: true, force: true });
  mkdirSync(into, { recursive: true });
  for (const name of STORE_KEPT) {
    const path = join(dataRoot, 'store', name);
    if (existsSync(path)) copyFileSync(path, join(into, name));
  }
  // Written last: without it the copy is not whole and nothing is put back from it.
  writeFileSync(join(into, SAVED_WHOLE), '');
}

/** Whether a whole copy of the store's files waits at `from`. */
export function storeFilesSaved(from: string): boolean {
  return existsSync(join(from, SAVED_WHOLE)) && existsSync(join(from, 'ai7.sqlite'));
}

/** Put the store's files back as they were saved: the files there now go first, the saved ones take their place. */
export function restoreStoreFiles(dataRoot: string, from: string): void {
  requireMerge(storeFilesSaved(from), 'DATABASE_MERGE_RESTORE_FAILED', '合并前的数据副本不完整，无法放回。');
  for (const name of ['ai7.sqlite', ...STORE_SIDECARS]) rmSync(join(dataRoot, 'store', name), { force: true });
  for (const name of STORE_KEPT) {
    if (existsSync(join(from, name))) copyFileSync(join(from, name), join(dataRoot, 'store', name));
  }
}

/** What SQLite may keep beside a store while it is read or written: none of it is the store a package verified. */
export const STORE_JOURNALS: ReadonlyArray<string> = ['-journal', '-wal', '-shm'];

/**
 * Merge the Books the staged list at `books.path` names — exactly what `books` names of it — of the package data at
 * `packageRoot` into the store at `dataRoot`, with the store closed. Answers `already` when every Book is there — a merge that
 * committed before an interruption — and never merges part of them. The package's store is read as the verified file alone:
 * whatever journal lies beside it, an interrupted merge's or one put there, is removed first, so no page SQLite would read from
 * a journal reaches the merge (Issue #434 review).
 */
export function mergeIntoStoreFile(
  dataRoot: string,
  packageRoot: string,
  books: MergingBooks & { readonly path: string },
  receipt?: (db: DatabaseSync) => void,
): 'merged' | 'already' {
  for (const suffix of STORE_JOURNALS) rmSync(join(packageRoot, 'store', `ai7.sqlite${suffix}`), { force: true });
  const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'));
  try {
    const count = listBooks(db, readMergingBooks(books.path, books));
    const present = Number((db.prepare('SELECT count(*) AS n FROM main.books WHERE book_id IN (SELECT book_id FROM temp.merge_books)').get() as SqlRow).n);
    if (present === count) return 'already';
    requireMerge(present === 0, 'DATABASE_MERGE_BOOK_PRESENT', '要合并的图书已有一部分在本机。');
    db.prepare('ATTACH DATABASE ? AS src').run(join(packageRoot, 'store', 'ai7.sqlite'));
    try {
      mergeListedBooks(db, count, { source: packageRoot, target: dataRoot }, receipt);
    } finally {
      db.exec('DETACH DATABASE src');
    }
    return 'merged';
  } finally {
    db.close();
  }
}

