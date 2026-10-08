import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  CAPTURED_PROCEDURE_SCHEMA,
  CAPTURED_PROCEDURE_SCOPE_SLOTS,
  CAPTURED_PROCEDURE_STATE_LABELS,
  MAX_CAPTURED_PROCEDURE_RUNS_SHOWN,
  MAX_CAPTURED_PROCEDURE_TITLE_GRAPHEMES,
  MAX_CAPTURED_PROCEDURE_VERSIONS_SHOWN,
  MAX_CAPTURED_PROCEDURES_SHOWN,
  MAX_DEVELOPER_PROPOSAL_FIELD_GRAPHEMES,
  MAX_DEVELOPER_PROPOSAL_TITLE_GRAPHEMES,
  type CapturedProcedureDocument,
  type CapturedProcedureProjection,
  type CapturedProcedureScopeSlot,
  type CapturedProcedureState,
  type CapturedProcedureStepDocument,
  type CapturedProcedureStepProjection,
  type CapturedProcedureVersionProjection,
  type DeveloperProposalProjection,
  type DeveloperProposalVersionProjection,
  type ReviewRunProcedureProjection,
  type SaveDeveloperProposalInput,
} from '../shared/protocol.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalJson, canonicalRecord, hasExactKeys, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';
import type { ReviewCategoryConfiguration, ReviewCategoryConfigurationEntry } from './review/category-configuration.js';

/**
 * 可复用工序 — the Captured Procedure (Issue #65, plan slice S30; ADR 0087; V2-UX-REUSE-001 to 020, 029 to 031, 038 to 054, 063 to
 * 066, KB-010). A Captured Procedure is AI7 configuration over the Review Run executors: it selects and orders review categories
 * AI7 already executes, carries no prompt text of its own, and runs only as an ordinary Review Run through Plan and Run
 * Authorization. It is not a DSH Skill or a second instruction format (ADR 0045 stays untouched).
 *
 * Schema revision 63 adds six append-only relations, each row carrying canonical JSON and its digest:
 *
 * - `captured_procedures`: one stable identity per procedure.
 * - `captured_procedure_versions`: each immutable version — its document `ai7.captured-procedure/1` and that document's digest,
 *   chained to the previous version's digest — with the local provenance outside the digest: the Review Run it was captured
 *   from (REUSE-015).
 * - `captured_procedure_states`: `enabled` after `验证并启用…`, a failed validation's reasons, or `stopped` — final for the
 *   version, which stays as its own Historical Version Stub (ADR 0087 §5). No state reads `待验证`.
 * - `review_run_procedure_pins`: the exact version and digest a Review Run was prepared from, and the steps it left out for its
 *   Book. A later version, a 停用 or a guideline update never moves it. It names the version by value, never by reference, so a
 *   Book merged into another house keeps naming what it ran.
 * - `developer_capability_proposals`: each version of a Developer Capability Proposal — no Book material (ADR 0087 §6).
 * - `developer_capability_proposal_exports`: each file a version was written to through the Save dialog; AI7 sends it nowhere.
 *
 * Nothing here calls a model, dispatches a Task or reads manuscript text: capture, validation and resolution are deterministic.
 */
export const CAPTURED_PROCEDURE_SCHEMA_SQL = {
  captured_procedures: `CREATE TABLE captured_procedures (
  procedure_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  captured_procedure_versions: `CREATE TABLE captured_procedure_versions (
  version_id TEXT PRIMARY KEY,
  procedure_id TEXT NOT NULL REFERENCES captured_procedures(procedure_id),
  version INTEGER NOT NULL CHECK(version >= 1),
  document_json TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256) = 64),
  previous_document_sha256 TEXT CHECK(previous_document_sha256 IS NULL OR length(previous_document_sha256) = 64),
  source_book_id TEXT NOT NULL REFERENCES books(book_id),
  source_review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((version = 1) = (previous_document_sha256 IS NULL)),
  UNIQUE(procedure_id, version)
) STRICT`,
  captured_procedure_states: `CREATE TABLE captured_procedure_states (
  version_id TEXT NOT NULL REFERENCES captured_procedure_versions(version_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  state TEXT NOT NULL CHECK(state IN ('validation-failed', 'enabled', 'stopped')),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  PRIMARY KEY(version_id, sequence)
) STRICT`,
  review_run_procedure_pins: `CREATE TABLE review_run_procedure_pins (
  review_run_id TEXT PRIMARY KEY REFERENCES review_runs(review_run_id),
  procedure_id TEXT NOT NULL CHECK(length(procedure_id) = 36),
  version_id TEXT NOT NULL CHECK(length(version_id) = 36),
  version INTEGER NOT NULL CHECK(version >= 1),
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256) = 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  developer_capability_proposals: `CREATE TABLE developer_capability_proposals (
  proposal_version_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL CHECK(length(proposal_id) = 36),
  version INTEGER NOT NULL CHECK(version >= 1),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(proposal_id, version)
) STRICT`,
  developer_capability_proposal_exports: `CREATE TABLE developer_capability_proposal_exports (
  export_id TEXT PRIMARY KEY,
  proposal_version_id TEXT NOT NULL REFERENCES developer_capability_proposals(proposal_version_id),
  file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
  file_sha256 TEXT NOT NULL CHECK(length(file_sha256) = 64),
  bytes INTEGER NOT NULL CHECK(bytes >= 1),
  written_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

/** Every relation is a ledger; a stopped version takes no further state, whoever writes it (ADR 0087 §5). */
export const CAPTURED_PROCEDURE_TRIGGER_SQL: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.keys(CAPTURED_PROCEDURE_SCHEMA_SQL).flatMap((table) => [
      [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'CAPTURED_PROCEDURE_LEDGER_IMMUTABLE');
    END`],
      [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'CAPTURED_PROCEDURE_LEDGER_IMMUTABLE');
    END`],
    ]),
  ),
  captured_procedure_states_after_stopped: `CREATE TRIGGER captured_procedure_states_after_stopped
    BEFORE INSERT ON captured_procedure_states
    WHEN EXISTS (SELECT 1 FROM captured_procedure_states s WHERE s.version_id = NEW.version_id AND s.state = 'stopped')
    BEGIN
      SELECT RAISE(ABORT, 'CAPTURED_PROCEDURE_STOPPED');
    END`,
};

/** The foreign keys of the six relations, in the exact-schema validator's own spelling. */
export const CAPTURED_PROCEDURE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  captured_procedure_versions: [
    'procedure_id>captured_procedures.procedure_id:NO ACTION/NO ACTION/NONE',
    'source_book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'source_review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE',
  ],
  captured_procedure_states: ['version_id>captured_procedure_versions.version_id:NO ACTION/NO ACTION/NONE'],
  review_run_procedure_pins: ['review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE'],
  developer_capability_proposal_exports: ['proposal_version_id>developer_capability_proposals.proposal_version_id:NO ACTION/NO ACTION/NONE'],
};

export class CapturedProcedureError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CapturedProcedureError';
  }
}

export function requireProcedure(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new CapturedProcedureError(code, message);
}

/**
 * Revision 63's six relations and their triggers, created once and never rebuilt: a store that predates them gains six empty
 * relations and nothing existing moves. Shape-detected, and run before the version is stamped in `task-authorization.ts`.
 */
export function initializeCapturedProcedureSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'captured_procedures'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(CAPTURED_PROCEDURE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(CAPTURED_PROCEDURE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Captured procedure schema rollback failed.');
    }
    throw error;
  }
  requireProcedure(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

// ---- the document ----------------------------------------------------------------------------------------

/** The executor a step names: 书系一致性 is the house's `series-knowledge`, whatever one Book resolved it to. */
export function houseExecutor(entry: ReviewCategoryConfigurationEntry): string {
  return entry.seriesKnowledge !== undefined ? 'series-knowledge' : entry.executor;
}

/** Whether a category calls a model: every executor but the model-free leads (REV-011). */
export function callsModel(executor: string): boolean {
  return executor !== 'baseline-leads';
}

export function validCapturedProcedureTitle(title: unknown): title is string {
  return typeof title === 'string' && title.isWellFormed() && title.trim().length > 0 && title === title.trim() &&
    graphemeCount(title) <= MAX_CAPTURED_PROCEDURE_TITLE_GRAPHEMES && !/[\u0000-\u001f\u007f]/u.test(title);
}

/**
 * The document one version is (ADR 0087 §1): the title, `runAs`, the steps in the order given — the configuration's — the
 * scope slot and the Authority Ceiling, from the entries the source Run snapshotted. Nothing else is in it.
 */
export function capturedProcedureDocument(
  title: string,
  entries: ReadonlyArray<ReviewCategoryConfigurationEntry>,
  scope: CapturedProcedureScopeSlot,
): CapturedProcedureDocument {
  const steps: CapturedProcedureStepDocument[] = entries.map((entry) => ({
    categoryId: entry.categoryId,
    procedure: { procedureId: entry.procedure.procedureId, version: entry.procedure.version },
    output: entry.output,
    model: callsModel(houseExecutor(entry)),
    searchEngine: entry.searchEngine,
  }));
  return {
    schema: CAPTURED_PROCEDURE_SCHEMA,
    title,
    runAs: 'review-run',
    steps,
    parameters: { scope },
    authorityCeiling: {
      runSourceScope: 'current-book',
      steps: entries.map((entry) => ({ categoryId: entry.categoryId, executor: houseExecutor(entry) })),
      outputs: Array.from(new Set(steps.map((step) => step.output))).sort(),
      model: steps.some((step) => step.model),
      searchEngine: steps.some((step) => step.searchEngine),
    },
  };
}

const EXECUTORS = new Set(['review-category-contract', 'baseline-leads', 'factual-review-kind', 'series-knowledge']);
const OUTPUTS = new Set(['change-suggestion', 'annotation']);

/**
 * Read one document back, held to exactly its schema and keys, and to the digest it was stored under (ADR 0087 §3). A document
 * that fails any of these is not a Captured Procedure: `null`.
 */
export function readCapturedProcedureDocument(json: string, digest: string): CapturedProcedureDocument | null {
  if (typeof json !== 'string' || typeof digest !== 'string' || !DIGEST_PATTERN.test(digest) || sha256Hex(json) !== digest) return null;
  let value: unknown;
  try {
    value = parseCanonicalJson(json);
  } catch {
    return null;
  }
  return isCapturedProcedureDocument(value) ? value : null;
}

export function isCapturedProcedureDocument(value: unknown): value is CapturedProcedureDocument {
  if (!isRecord(value) || !hasExactKeys(value, ['schema', 'title', 'runAs', 'steps', 'parameters', 'authorityCeiling'])) return false;
  if (value.schema !== CAPTURED_PROCEDURE_SCHEMA || value.runAs !== 'review-run' || !validCapturedProcedureTitle(value.title)) return false;
  if (!isRecord(value.parameters) || !hasExactKeys(value.parameters, ['scope']) ||
      !(CAPTURED_PROCEDURE_SCOPE_SLOTS as readonly unknown[]).includes(value.parameters.scope)) return false;
  const steps = value.steps;
  if (!Array.isArray(steps) || steps.length === 0) return false;
  const seen = new Set<string>();
  for (const step of steps as unknown[]) {
    if (!isRecord(step) || !hasExactKeys(step, ['categoryId', 'procedure', 'output', 'model', 'searchEngine'])) return false;
    if (typeof step.categoryId !== 'string' || step.categoryId.length < 1 || step.categoryId.length > 48 || seen.has(step.categoryId)) return false;
    seen.add(step.categoryId);
    if (!isRecord(step.procedure) || !hasExactKeys(step.procedure, ['procedureId', 'version']) ||
        typeof step.procedure.procedureId !== 'string' || step.procedure.procedureId.length < 1 ||
        typeof step.procedure.version !== 'string' || step.procedure.version.length < 1) return false;
    if (!OUTPUTS.has(step.output as string) || typeof step.model !== 'boolean' || typeof step.searchEngine !== 'boolean') return false;
  }
  const ceiling = value.authorityCeiling;
  if (!isRecord(ceiling) || !hasExactKeys(ceiling, ['runSourceScope', 'steps', 'outputs', 'model', 'searchEngine']) ||
      ceiling.runSourceScope !== 'current-book' || !Array.isArray(ceiling.steps) || !Array.isArray(ceiling.outputs) ||
      typeof ceiling.model !== 'boolean' || typeof ceiling.searchEngine !== 'boolean') return false;
  const typed = steps as CapturedProcedureStepDocument[];
  if (ceiling.steps.length !== typed.length) return false;
  for (const [index, entry] of (ceiling.steps as unknown[]).entries()) {
    if (!isRecord(entry) || !hasExactKeys(entry, ['categoryId', 'executor']) || entry.categoryId !== typed[index]!.categoryId ||
        !EXECUTORS.has(entry.executor as string) || callsModel(entry.executor as string) !== typed[index]!.model) return false;
  }
  // The ceiling is exactly its steps' sum: nothing in it a step does not need, nothing a step needs left out of it.
  return canonicalJson(ceiling.outputs) === canonicalJson(Array.from(new Set(typed.map((step) => step.output))).sort()) &&
    ceiling.model === typed.some((step) => step.model) && ceiling.searchEngine === typed.some((step) => step.searchEngine);
}

/**
 * Whether one step still resolves in the configuration as it applies now (ADR 0087 §3): the category exists, its executor is
 * not `unavailable`, its 工序 is the same version, and it does no more than the document says — the same output, executor,
 * model and search-engine use. The reason in the editor's words when it does not; `null` when it does.
 */
export function capturedStepProblem(
  document: CapturedProcedureDocument,
  index: number,
  configuration: ReviewCategoryConfiguration,
): string | null {
  const step = document.steps[index]!;
  const executor = document.authorityCeiling.steps[index]!.executor;
  const entry = configuration.categories.find((candidate) => candidate.categoryId === step.categoryId);
  if (entry === undefined) return '这一类已不在审阅配置中。';
  const label = `「${entry.label}」`;
  if (entry.executor === 'unavailable') return `${label}现在不能运行：${entry.unavailableReason ?? '它的依据还没有接通。'}`;
  if (entry.procedure.procedureId !== step.procedure.procedureId || entry.procedure.version !== step.procedure.version) {
    return `${label}的工序已换成第 ${entry.procedure.version} 版，与保存时的第 ${step.procedure.version} 版不同；请从一次新的审阅重新保存。`;
  }
  if (houseExecutor(entry) !== executor || entry.output !== step.output || callsModel(houseExecutor(entry)) !== step.model ||
      entry.searchEngine !== step.searchEngine) {
    return `${label}现在的做法超出了保存时的范围；请从一次新的审阅重新保存。`;
  }
  return null;
}

/**
 * Whether a document's Authority Ceiling is no wider than the source Run's (ADR 0087 §3): every step a category the Run itself
 * ran, with the same executor, output and search-engine use. The reasons when it is wider; none when it is not.
 */
export function ceilingWiderThanSource(
  document: CapturedProcedureDocument,
  sourceEntries: ReadonlyArray<ReviewCategoryConfigurationEntry>,
): string[] {
  const problems: string[] = [];
  document.steps.forEach((step, index) => {
    const source = sourceEntries.find((entry) => entry.categoryId === step.categoryId);
    if (source === undefined) {
      problems.push(`「${step.categoryId}」不是来源审阅运行过的类别。`);
      return;
    }
    const executor = document.authorityCeiling.steps[index]!.executor;
    if (houseExecutor(source) !== executor || source.output !== step.output || (step.searchEngine && !source.searchEngine) ||
        (step.model && !callsModel(houseExecutor(source)))) {
      problems.push(`「${source.label}」的权限超出了来源审阅。`);
    }
  });
  return problems;
}

// ---- the capture's source ----------------------------------------------------------------------------------

/** A Review Run as a capture reads it: its state, and each category with the entry it snapshotted and where it ended. */
export interface CaptureSourceRun {
  readonly authorized: boolean;
  readonly state: 'prepared' | 'running' | 'settled' | 'partial' | 'failed';
  readonly canContinue: boolean;
  readonly categories: ReadonlyArray<{ readonly entry: ReviewCategoryConfigurationEntry; readonly state: string; readonly stateLabel: string }>;
}

export const CAPTURE_NOT_STARTED = '这次审阅还没有开始；审阅完成后才能保存为可复用工序。' as const;
export const CAPTURE_RUNNING = '这次审阅还在进行；审阅完成后才能保存为可复用工序。' as const;
export const CAPTURE_CONTINUABLE = '这次审阅还有类别可以继续；继续审阅完成后才能保存为可复用工序。' as const;
export const CAPTURE_NOTHING_SETTLED = '这次审阅没有一类完成，没有可以保存的工序。' as const;
export const CAPTURE_NOTHING_ELIGIBLE = '这次审阅完成的类别现在都不能再按原工序运行，没有可以保存的工序。' as const;

/**
 * What a capture may keep of one Review Run (ADR 0087 §2; REUSE-011, REUSE-019): a Run authorized and ended 已完成, or 部分完成
 * with nothing left to continue; of it, every category that settled and whose category still resolves now at the same 工序
 * version. A failed, interrupted or refused category is left out with its reason, and so is one whose 工序 moved on. `steps`
 * lists every category of the Run in its order; `unavailableReason` is why nothing may be captured, `null` when something may.
 */
export function procedureCaptureSource(
  source: CaptureSourceRun,
  configuration: ReviewCategoryConfiguration,
): { unavailableReason: string | null; steps: ProcedureCaptureStep[] } {
  const steps = source.categories.map(({ entry, state, stateLabel }): ProcedureCaptureStep => {
    const current = configuration.categories.find((candidate) => candidate.categoryId === entry.categoryId);
    const excludedReason = state !== 'settled'
      ? `这一类在这次审阅中没有完成（${stateLabel}），不会保存。`
      : current === undefined
        ? '这一类已不在审阅配置中，不会保存。'
        : current.executor === 'unavailable'
          ? `这一类现在不能运行：${current.unavailableReason ?? '它的依据还没有接通。'}`
          : current.procedure.procedureId !== entry.procedure.procedureId || current.procedure.version !== entry.procedure.version
            ? `这一类的工序已换成第 ${current.procedure.version} 版，与这次审阅用的第 ${entry.procedure.version} 版不同，不会保存。`
            : null;
    return { entry, eligible: excludedReason === null, excludedReason };
  });
  const unavailableReason = !source.authorized || source.state === 'prepared'
    ? CAPTURE_NOT_STARTED
    : source.state === 'running'
      ? CAPTURE_RUNNING
      : source.canContinue
        ? CAPTURE_CONTINUABLE
        : !source.categories.some((category) => category.state === 'settled')
          ? CAPTURE_NOTHING_SETTLED
          : !steps.some((step) => step.eligible) ? CAPTURE_NOTHING_ELIGIBLE : null;
  return { unavailableReason, steps };
}

export interface ProcedureCaptureStep {
  readonly entry: ReviewCategoryConfigurationEntry;
  readonly eligible: boolean;
  readonly excludedReason: string | null;
}

// ---- the ledger ------------------------------------------------------------------------------------------

type SqlRow = Record<string, SQLOutputValue>;
const IDENTITY_SCHEMA = 'ai7.captured-procedure.identity/1' as const;
const VERSION_SCHEMA = 'ai7.captured-procedure.version/1' as const;
const STATE_SCHEMA = 'ai7.captured-procedure.state/1' as const;
const PIN_SCHEMA = 'ai7.review.procedure-pin/1' as const;
const PROPOSAL_SCHEMA = 'ai7.developer-capability-proposal/1' as const;
const PROPOSAL_EXPORT_SCHEMA = 'ai7.developer-capability-proposal.export/1' as const;
const ACTOR = '本机编辑' as const;

function text(value: SQLOutputValue | undefined): string {
  requireProcedure(typeof value === 'string', 'CAPTURED_PROCEDURE_RECORD_INVALID', '可复用工序的记录已损坏。');
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  requireProcedure(typeof value === 'number' && Number.isSafeInteger(value), 'CAPTURED_PROCEDURE_RECORD_INVALID', '可复用工序的记录已损坏。');
  return value;
}

function recordOf(row: SqlRow): Record<string, unknown> {
  const json = text(row.canonical_json);
  requireProcedure(sha256Hex(json) === text(row.sha256), 'CAPTURED_PROCEDURE_RECORD_INVALID', '可复用工序的记录与其摘要不一致。');
  let value: unknown;
  try {
    value = parseCanonicalJson(json);
  } catch {
    throw new CapturedProcedureError('CAPTURED_PROCEDURE_RECORD_INVALID', '可复用工序的记录已损坏。');
  }
  requireProcedure(isRecord(value), 'CAPTURED_PROCEDURE_RECORD_INVALID', '可复用工序的记录已损坏。');
  return value;
}

/** One stored version, its document read back and held to its digest. */
export interface StoredCapturedVersion {
  readonly versionId: string;
  readonly procedureId: string;
  readonly version: number;
  readonly document: CapturedProcedureDocument;
  readonly documentSha256: string;
  readonly previousDocumentSha256: string | null;
  readonly sourceBookId: string;
  readonly sourceReviewRunId: string;
  readonly createdAt: string;
  readonly state: CapturedProcedureState;
  readonly stateRecordedAt: string | null;
  readonly validationProblems: ReadonlyArray<string>;
}

/** What a Review Run prepared from a version pins (ADR 0087 §4), before it has its Run's identity. */
export interface ReviewRunProcedurePinInput {
  readonly procedureId: string;
  readonly versionId: string;
  readonly version: number;
  readonly title: string;
  readonly documentSha256: string;
  readonly scope: CapturedProcedureScopeSlot;
  /** The steps of the version, in their order. */
  readonly steps: ReadonlyArray<string>;
}

/** Record a Review Run's pin, in the caller's transaction — the one that writes the Run (ADR 0087 §4). */
export function recordReviewRunProcedurePin(
  db: DatabaseSync,
  reviewRunId: string,
  pin: ReviewRunProcedurePinInput,
  ran: ReadonlyArray<string>,
  leftOut: ReadonlyArray<{ categoryId: string; label: string; reason: string }>,
  recordedAt: string,
): void {
  const record = canonicalRecord({
    schema: PIN_SCHEMA,
    reviewRunId,
    procedureId: pin.procedureId,
    versionId: pin.versionId,
    version: pin.version,
    title: pin.title,
    documentSha256: pin.documentSha256,
    scope: pin.scope,
    ran,
    leftOut,
    recordedAt,
  });
  db.prepare(
    `INSERT INTO review_run_procedure_pins(review_run_id, procedure_id, version_id, version, document_sha256, recorded_at, canonical_json, sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(reviewRunId, pin.procedureId, pin.versionId, pin.version, pin.documentSha256, recordedAt, record.json, record.digest);
}

/** A Review Run's pin as the Run reads it, with whether its version was stopped since; `null` for a Run chosen by hand. */
export function readReviewRunProcedurePin(db: DatabaseSync, reviewRunId: string): ReviewRunProcedureProjection | null {
  const row = db.prepare('SELECT * FROM review_run_procedure_pins WHERE review_run_id = ?').get(reviewRunId) as SqlRow | undefined;
  if (row === undefined) return null;
  const record = recordOf(row);
  requireProcedure(record.schema === PIN_SCHEMA && record.reviewRunId === reviewRunId && record.versionId === text(row.version_id) &&
    record.documentSha256 === text(row.document_sha256) && typeof record.title === 'string' && Array.isArray(record.leftOut),
  'CAPTURED_PROCEDURE_RECORD_INVALID', '审阅所依据的可复用工序记录已损坏。');
  const stopped = db.prepare("SELECT 1 FROM captured_procedure_states WHERE version_id = ? AND state = 'stopped'").get(text(row.version_id)) !== undefined;
  return {
    procedureId: text(row.procedure_id),
    versionId: text(row.version_id),
    version: integer(row.version),
    title: record.title,
    documentSha256: text(row.document_sha256),
    stopped,
    leftOut: (record.leftOut as Array<{ categoryId: string; label: string; reason: string }>).map((entry) => ({
      categoryId: entry.categoryId, label: entry.label, reason: entry.reason,
    })),
  };
}

/** Why a prepared Run pinned to a stopped version cannot be authorized (ADR 0087 §5); `null` when nothing stands in the way. */
export function procedurePinRefusal(db: DatabaseSync, reviewRunId: string): string | null {
  const pin = readReviewRunProcedurePin(db, reviewRunId);
  return pin !== null && pin.stopped
    ? `这次审阅按可复用工序《${pin.title}》第 ${pin.version} 版准备，这一版已停用；请重新准备这次审阅。`
    : null;
}

/** What one step reads as in the editor's words: its category's label and its 工序's title, from the configuration. */
export type StepWords = (categoryId: string) => { label: string; procedureTitle: string };

export class CapturedProcedures {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * Save a capture (ADR 0087 §2): a new Captured Procedure at version 1, or the next version of `procedureId`, chained to its
   * latest by that version's document digest. The version waits for `验证并启用…`; nothing is enabled, prepared or run here.
   */
  save(input: {
    procedureId: string | null;
    document: CapturedProcedureDocument;
    sourceBookId: string;
    sourceReviewRunId: string;
    sourceRunOrdinal: number;
  }, now: Date = new Date()): StoredCapturedVersion {
    requireProcedure(isCapturedProcedureDocument(input.document), 'CAPTURED_PROCEDURE_INVALID', '要保存的工序无效。');
    const createdAt = now.toISOString();
    const document = canonicalRecord(input.document);
    let procedureId = input.procedureId;
    let version = 1;
    let previous: string | null = null;
    if (procedureId === null) {
      procedureId = randomUUID();
      const identity = canonicalRecord({ schema: IDENTITY_SCHEMA, procedureId, createdAt, actor: ACTOR });
      this.#db.prepare('INSERT INTO captured_procedures(procedure_id, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?)')
        .run(procedureId, createdAt, identity.json, identity.digest);
    } else {
      requireProcedure(UUID_PATTERN.test(procedureId), 'CAPTURED_PROCEDURE_INVALID', '可复用工序标识无效。');
      const latest = this.#db.prepare('SELECT version, document_sha256 FROM captured_procedure_versions WHERE procedure_id = ? ORDER BY version DESC LIMIT 1')
        .get(procedureId) as SqlRow | undefined;
      requireProcedure(latest !== undefined, 'CAPTURED_PROCEDURE_NOT_FOUND', '这个可复用工序不存在。');
      version = integer(latest.version) + 1;
      previous = text(latest.document_sha256);
    }
    const versionId = randomUUID();
    const record = canonicalRecord({
      schema: VERSION_SCHEMA,
      versionId,
      procedureId,
      version,
      documentSha256: document.digest,
      previousDocumentSha256: previous,
      // The local provenance (REUSE-015): outside the document and its digest.
      provenance: { bookId: input.sourceBookId, reviewRunId: input.sourceReviewRunId, reviewRunOrdinal: input.sourceRunOrdinal },
      actor: ACTOR,
      createdAt,
    });
    this.#db.prepare(
      `INSERT INTO captured_procedure_versions(
         version_id, procedure_id, version, document_json, document_sha256, previous_document_sha256,
         source_book_id, source_review_run_id, created_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(versionId, procedureId, version, document.json, document.digest, previous, input.sourceBookId, input.sourceReviewRunId, createdAt, record.json, record.digest);
    return this.version(versionId)!;
  }

  /** One version, read back whole and held to its digests; `null` when there is none. */
  version(versionId: string): StoredCapturedVersion | null {
    if (typeof versionId !== 'string' || !UUID_PATTERN.test(versionId)) return null;
    const row = this.#db.prepare('SELECT * FROM captured_procedure_versions WHERE version_id = ?').get(versionId) as SqlRow | undefined;
    return row === undefined ? null : this.#versionOf(row);
  }

  /** Every version of one procedure, newest first. */
  versions(procedureId: string): StoredCapturedVersion[] {
    requireProcedure(typeof procedureId === 'string' && UUID_PATTERN.test(procedureId), 'CAPTURED_PROCEDURE_INVALID', '可复用工序标识无效。');
    return (this.#db.prepare('SELECT * FROM captured_procedure_versions WHERE procedure_id = ? ORDER BY version DESC').all(procedureId) as SqlRow[])
      .map((row) => this.#versionOf(row));
  }

  #versionOf(row: SqlRow): StoredCapturedVersion {
    const record = recordOf(row);
    const versionId = text(row.version_id);
    const documentSha256 = text(row.document_sha256);
    const document = readCapturedProcedureDocument(text(row.document_json), documentSha256);
    requireProcedure(document !== null && record.schema === VERSION_SCHEMA && record.versionId === versionId &&
      record.procedureId === text(row.procedure_id) && record.version === integer(row.version) && record.documentSha256 === documentSha256,
    'CAPTURED_PROCEDURE_RECORD_INVALID', '可复用工序的版本记录已损坏。');
    const states = (this.#db.prepare('SELECT * FROM captured_procedure_states WHERE version_id = ? ORDER BY sequence').all(versionId) as SqlRow[]);
    let state: CapturedProcedureState = 'pending-validation';
    let stateRecordedAt: string | null = null;
    let validationProblems: string[] = [];
    for (const stateRow of states) {
      const stateRecord = recordOf(stateRow);
      const kind = text(stateRow.state);
      requireProcedure(stateRecord.schema === STATE_SCHEMA && stateRecord.state === kind, 'CAPTURED_PROCEDURE_RECORD_INVALID', '可复用工序的状态记录已损坏。');
      if (kind === 'validation-failed') {
        validationProblems = Array.isArray(stateRecord.problems) ? (stateRecord.problems as unknown[]).filter((item): item is string => typeof item === 'string') : [];
        continue;
      }
      state = kind as 'enabled' | 'stopped';
      stateRecordedAt = text(stateRow.recorded_at);
      validationProblems = [];
    }
    return {
      versionId,
      procedureId: text(row.procedure_id),
      version: integer(row.version),
      document,
      documentSha256,
      previousDocumentSha256: row.previous_document_sha256 === null ? null : text(row.previous_document_sha256),
      sourceBookId: text(row.source_book_id),
      sourceReviewRunId: text(row.source_review_run_id),
      createdAt: text(row.created_at),
      state,
      stateRecordedAt,
      validationProblems,
    };
  }

  /**
   * Record what `验证并启用…` came to (ADR 0087 §3): `enabled`, or `validation-failed` with its reasons, which leaves the version
   * waiting and inspectable (REUSE-025). A stopped version takes neither; an enabled one is not enabled again.
   */
  recordValidation(versionId: string, problems: ReadonlyArray<string>, previewDigest: string, now: Date = new Date()): StoredCapturedVersion {
    const current = this.version(versionId);
    requireProcedure(current !== null, 'CAPTURED_PROCEDURE_NOT_FOUND', '这一版可复用工序不存在。');
    requireProcedure(current.state !== 'stopped', 'CAPTURED_PROCEDURE_STOPPED', '这一版已停用，不能再启用；要再用它，请从一次新的审阅重新保存。');
    requireProcedure(current.state !== 'enabled', 'CAPTURED_PROCEDURE_ALREADY_ENABLED', '这一版已经启用。');
    this.#appendState(versionId, problems.length === 0 ? 'enabled' : 'validation-failed', { problems: [...problems], previewDigest }, now);
    return this.version(versionId)!;
  }

  /** `停用` (ADR 0087 §5): final for the version, which is never resolved again and stays as its own Historical Version Stub. */
  stop(versionId: string, now: Date = new Date()): void {
    const current = this.version(versionId);
    requireProcedure(current !== null, 'CAPTURED_PROCEDURE_NOT_FOUND', '这一版可复用工序不存在。');
    if (current.state === 'stopped') return;
    this.#appendState(versionId, 'stopped', {}, now);
  }

  #appendState(versionId: string, state: 'enabled' | 'validation-failed' | 'stopped', facts: Readonly<Record<string, unknown>>, now: Date): void {
    const last = this.#db.prepare('SELECT max(sequence) last FROM captured_procedure_states WHERE version_id = ?').get(versionId) as SqlRow;
    const sequence = last.last === null ? 1 : integer(last.last) + 1;
    const recordedAt = now.toISOString();
    const record = canonicalRecord({ schema: STATE_SCHEMA, versionId, sequence, state, actor: ACTOR, recordedAt, ...facts });
    this.#db.prepare('INSERT INTO captured_procedure_states(version_id, sequence, state, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(versionId, sequence, state, recordedAt, record.json, record.digest);
  }

  /** The procedures newest first, at most `MAX_CAPTURED_PROCEDURES_SHOWN`, and whether there are more. */
  procedureIds(): { ids: string[]; truncated: boolean } {
    const rows = this.#db.prepare(
      `SELECT p.procedure_id FROM captured_procedures p
       ORDER BY (SELECT max(v.created_at) FROM captured_procedure_versions v WHERE v.procedure_id = p.procedure_id) DESC, p.procedure_id LIMIT ?`,
    ).all(MAX_CAPTURED_PROCEDURES_SHOWN + 1) as SqlRow[];
    return { ids: rows.slice(0, MAX_CAPTURED_PROCEDURES_SHOWN).map((row) => text(row.procedure_id)), truncated: rows.length > MAX_CAPTURED_PROCEDURES_SHOWN };
  }

  /** The Review Runs that pinned one version, newest first, with how many there are (REUSE-031). */
  runsOf(versionId: string): { count: number; runs: Array<{ bookId: string; bookTitle: string; reviewRunId: string; ordinal: number; createdAt: string }> } {
    const count = integer((this.#db.prepare('SELECT count(*) n FROM review_run_procedure_pins WHERE version_id = ?').get(versionId) as SqlRow).n);
    const runs = (this.#db.prepare(
      `SELECT r.book_id, b.title, r.review_run_id, r.ordinal, r.created_at FROM review_run_procedure_pins p
       JOIN review_runs r ON r.review_run_id = p.review_run_id JOIN books b ON b.book_id = r.book_id
       WHERE p.version_id = ? ORDER BY r.created_at DESC, r.review_run_id LIMIT ?`,
    ).all(versionId, MAX_CAPTURED_PROCEDURE_RUNS_SHOWN) as SqlRow[]).map((row) => ({
      bookId: text(row.book_id), bookTitle: text(row.title), reviewRunId: text(row.review_run_id), ordinal: integer(row.ordinal), createdAt: text(row.created_at),
    }));
    return { count, runs };
  }

  /** One procedure as 工序与规则 reads it: its versions newest first, each with its state, use and provenance. */
  projection(procedureId: string, words: StepWords, bookTitle: (bookId: string) => string, runOrdinal: (reviewRunId: string) => number): CapturedProcedureProjection {
    const versions = this.versions(procedureId);
    requireProcedure(versions.length > 0, 'CAPTURED_PROCEDURE_NOT_FOUND', '这个可复用工序不存在。');
    const shown = versions.slice(0, MAX_CAPTURED_PROCEDURE_VERSIONS_SHOWN).map((stored): CapturedProcedureVersionProjection => {
      const { count, runs } = this.runsOf(stored.versionId);
      return {
        versionId: stored.versionId,
        procedureId: stored.procedureId,
        version: stored.version,
        title: stored.document.title,
        state: stored.state,
        stateLabel: CAPTURED_PROCEDURE_STATE_LABELS[stored.state],
        createdAt: stored.createdAt,
        stateRecordedAt: stored.stateRecordedAt,
        steps: capturedStepProjections(stored.document, words),
        scopeSlot: stored.document.parameters.scope,
        validationProblems: stored.validationProblems,
        source: {
          bookId: stored.sourceBookId,
          bookTitle: bookTitle(stored.sourceBookId),
          reviewRunId: stored.sourceReviewRunId,
          runLabel: `第 ${runOrdinal(stored.sourceReviewRunId)} 次审阅`,
        },
        runCount: count,
        runs: runs.map((run) => ({ bookId: run.bookId, bookTitle: run.bookTitle, reviewRunId: run.reviewRunId, label: `第 ${run.ordinal} 次`, createdAt: run.createdAt })),
        technical: { documentSha256: stored.documentSha256, previousDocumentSha256: stored.previousDocumentSha256 },
      };
    });
    return {
      procedureId,
      title: versions[0]!.document.title,
      versionCount: versions.length,
      versions: shown,
      runnable: versions.some((stored) => stored.state === 'enabled'),
    };
  }

  // ---- Developer Capability Proposals (ADR 0087 §6; REUSE-063, REUSE-064) ------------------------------------

  /** 保存开发建议: a new proposal at version 1, or the next version of `proposalId`. Nothing of a Book is in it. */
  saveProposal(input: SaveDeveloperProposalInput, now: Date = new Date()): string {
    requireProcedure(isRecord(input) && hasExactKeys(input as unknown as Record<string, unknown>,
      ['proposalId', 'title', 'missingCapability', 'affectedProcedure', 'direction', 'pluginCandidate']), 'DEVELOPER_PROPOSAL_INVALID', '开发建议无效。');
    requireProcedure(validCapturedProcedureTitle(input.title) && graphemeCount(input.title) <= MAX_DEVELOPER_PROPOSAL_TITLE_GRAPHEMES,
      'DEVELOPER_PROPOSAL_TITLE_INVALID', `开发建议的标题要 1–${MAX_DEVELOPER_PROPOSAL_TITLE_GRAPHEMES} 个字。`);
    requireProcedure(proposalField(input.missingCapability, true), 'DEVELOPER_PROPOSAL_INVALID', `请写明缺少的能力（最多 ${MAX_DEVELOPER_PROPOSAL_FIELD_GRAPHEMES} 个字）。`);
    for (const field of [input.affectedProcedure, input.direction, input.pluginCandidate]) {
      requireProcedure(proposalField(field, false), 'DEVELOPER_PROPOSAL_INVALID', `每一项最多 ${MAX_DEVELOPER_PROPOSAL_FIELD_GRAPHEMES} 个字。`);
    }
    let proposalId = input.proposalId;
    let version = 1;
    let previous: string | null = null;
    if (proposalId === null) {
      proposalId = randomUUID();
    } else {
      requireProcedure(typeof proposalId === 'string' && UUID_PATTERN.test(proposalId), 'DEVELOPER_PROPOSAL_INVALID', '开发建议标识无效。');
      const latest = this.#db.prepare('SELECT version, sha256 FROM developer_capability_proposals WHERE proposal_id = ? ORDER BY version DESC LIMIT 1')
        .get(proposalId) as SqlRow | undefined;
      requireProcedure(latest !== undefined, 'DEVELOPER_PROPOSAL_NOT_FOUND', '这条开发建议不存在。');
      version = integer(latest.version) + 1;
      previous = text(latest.sha256);
    }
    const proposalVersionId = randomUUID();
    const createdAt = now.toISOString();
    const record = canonicalRecord({
      schema: PROPOSAL_SCHEMA,
      proposalVersionId,
      proposalId,
      version,
      previousSha256: previous,
      title: input.title,
      missingCapability: input.missingCapability,
      affectedProcedure: input.affectedProcedure,
      direction: input.direction,
      pluginCandidate: input.pluginCandidate,
      actor: ACTOR,
      createdAt,
    });
    this.#db.prepare('INSERT INTO developer_capability_proposals(proposal_version_id, proposal_id, version, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
      .run(proposalVersionId, proposalId, version, createdAt, record.json, record.digest);
    return proposalId;
  }

  /** One proposal version as stored; `null` when there is none. */
  proposalVersion(proposalVersionId: string): (DeveloperProposalVersionProjection & { readonly canonical: string }) | null {
    if (typeof proposalVersionId !== 'string' || !UUID_PATTERN.test(proposalVersionId)) return null;
    const row = this.#db.prepare('SELECT * FROM developer_capability_proposals WHERE proposal_version_id = ?').get(proposalVersionId) as SqlRow | undefined;
    return row === undefined ? null : this.#proposalVersionOf(row);
  }

  #proposalVersionOf(row: SqlRow): DeveloperProposalVersionProjection & { readonly canonical: string } {
    const record = recordOf(row);
    const proposalVersionId = text(row.proposal_version_id);
    requireProcedure(record.schema === PROPOSAL_SCHEMA && record.proposalVersionId === proposalVersionId && record.proposalId === text(row.proposal_id) &&
      record.version === integer(row.version) && ['title', 'missingCapability', 'affectedProcedure', 'direction', 'pluginCandidate'].every((key) => typeof record[key] === 'string'),
    'CAPTURED_PROCEDURE_RECORD_INVALID', '开发建议的记录已损坏。');
    const files = (this.#db.prepare('SELECT file_name, written_at FROM developer_capability_proposal_exports WHERE proposal_version_id = ? ORDER BY written_at DESC, export_id')
      .all(proposalVersionId) as SqlRow[]).map((file) => ({ fileName: text(file.file_name), writtenAt: text(file.written_at) }));
    return {
      proposalVersionId,
      proposalId: text(row.proposal_id),
      version: integer(row.version),
      title: record.title as string,
      missingCapability: record.missingCapability as string,
      affectedProcedure: record.affectedProcedure as string,
      direction: record.direction as string,
      pluginCandidate: record.pluginCandidate as string,
      createdAt: text(row.created_at),
      files,
      technical: { sha256: text(row.sha256) },
      canonical: text(row.canonical_json),
    };
  }

  /** One proposal, its versions newest first. */
  proposal(proposalId: string): DeveloperProposalProjection {
    requireProcedure(typeof proposalId === 'string' && UUID_PATTERN.test(proposalId), 'DEVELOPER_PROPOSAL_INVALID', '开发建议标识无效。');
    const versions = (this.#db.prepare('SELECT * FROM developer_capability_proposals WHERE proposal_id = ? ORDER BY version DESC LIMIT ?')
      .all(proposalId, MAX_CAPTURED_PROCEDURE_VERSIONS_SHOWN) as SqlRow[]).map((row) => {
      const { canonical: _canonical, ...version } = this.#proposalVersionOf(row);
      return version;
    });
    requireProcedure(versions.length > 0, 'DEVELOPER_PROPOSAL_NOT_FOUND', '这条开发建议不存在。');
    return { proposalId, title: versions[0]!.title, versions };
  }

  /** The proposals newest first, at most `MAX_CAPTURED_PROCEDURES_SHOWN`. */
  proposals(): { proposals: DeveloperProposalProjection[]; truncated: boolean } {
    const rows = this.#db.prepare(
      'SELECT proposal_id, max(created_at) latest FROM developer_capability_proposals GROUP BY proposal_id ORDER BY latest DESC, proposal_id LIMIT ?',
    ).all(MAX_CAPTURED_PROCEDURES_SHOWN + 1) as SqlRow[];
    return {
      proposals: rows.slice(0, MAX_CAPTURED_PROCEDURES_SHOWN).map((row) => this.proposal(text(row.proposal_id))),
      truncated: rows.length > MAX_CAPTURED_PROCEDURES_SHOWN,
    };
  }

  /** The file a proposal version was written to through the Save dialog: its name, digest and length — never where it is. */
  recordProposalFile(proposalVersionId: string, fileName: string, bytes: Uint8Array, now: Date = new Date()): void {
    const exportId = randomUUID();
    const writtenAt = now.toISOString();
    const fileSha256 = sha256Hex(bytes);
    const record = canonicalRecord({
      schema: PROPOSAL_EXPORT_SCHEMA, exportId, proposalVersionId, fileName, fileSha256, bytes: bytes.length, actor: ACTOR, writtenAt,
      // AI7 never sends it (ADR 0087 §6): the editor's own Save dialog chose where the file went.
      sentBy: 'nobody',
    });
    this.#db.prepare(
      `INSERT INTO developer_capability_proposal_exports(export_id, proposal_version_id, file_name, file_sha256, bytes, written_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(exportId, proposalVersionId, fileName, fileSha256, bytes.length, writtenAt, record.json, record.digest);
  }
}

function proposalField(value: unknown, required: boolean): boolean {
  return typeof value === 'string' && value.isWellFormed() && (!required || value.trim().length > 0) &&
    graphemeCount(value) <= MAX_DEVELOPER_PROPOSAL_FIELD_GRAPHEMES && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

/** A version's steps in the editor's words. */
export function capturedStepProjections(document: CapturedProcedureDocument, words: StepWords): CapturedProcedureStepProjection[] {
  return document.steps.map((step) => {
    const named = words(step.categoryId);
    return {
      categoryId: step.categoryId,
      label: named.label,
      procedureTitle: named.procedureTitle,
      procedureVersion: step.procedure.version,
      output: step.output,
      model: step.model,
      searchEngine: step.searchEngine,
    };
  });
}

/**
 * The text a Developer Capability Proposal version is written to a file as (ADR 0087 §6): Markdown the editor can read and hand
 * to the repository-development process (REUSE-065), with its exact digest. It holds no Book material.
 */
export function developerProposalFileText(version: DeveloperProposalVersionProjection): string {
  const section = (heading: string, body: string): string => `## ${heading}\n\n${body.trim().length === 0 ? '（未填写）' : body.trim()}\n`;
  return [
    `# 开发建议：${version.title}`,
    '',
    `第 ${version.version} 版 · 记录于 ${version.createdAt}`,
    '',
    section('缺少的能力', version.missingCapability),
    section('涉及的工序', version.affectedProcedure),
    section('建议的实现方向', version.direction),
    section('可以评估的插件', version.pluginCandidate),
    '---',
    '',
    'AI7 不会发送这份开发建议，也不会安装或启用任何插件；实现它需要另走开发流程。',
    '',
    `记录摘要（SHA-256）：${version.technical.sha256}`,
    '',
  ].join('\n');
}

/** The file name a proposal version is offered under: its title, made safe for every file system. */
export function developerProposalFileName(version: Pick<DeveloperProposalVersionProjection, 'title' | 'version'>): string {
  const safe = version.title.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_').slice(0, 80);
  return `开发建议 ${safe} 第 ${version.version} 版.md`;
}

/** The ordinal Captured Procedure state a version's canonical record names, for a test or a reader that has only the rows. */
export function capturedProcedureVersionLabel(title: string, version: number): string {
  return `《${title}》第 ${version} 版`;
}
