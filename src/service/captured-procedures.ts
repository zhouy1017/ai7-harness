import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  CAPTURED_PROCEDURE_SCHEMA,
  CAPTURED_PROCEDURE_SCHEMA_V2,
  CAPTURED_PROCEDURE_CAPTURE_SLOTS,
  CAPTURED_PROCEDURE_STATE_LABELS,
  MAX_CAPTURED_PROCEDURE_PACKAGES_SHOWN,
  MAX_CAPTURED_PROCEDURE_RUNS_SHOWN,
  MAX_CAPTURED_PROCEDURE_TITLE_CHARACTERS,
  MAX_CAPTURED_PROCEDURE_TITLE_GRAPHEMES,
  MAX_CAPTURED_PROCEDURE_VERSIONS_PAGE,
  MAX_CAPTURED_PROCEDURES_SHOWN,
  MAX_DEVELOPER_PROPOSAL_FIELD_CHARACTERS,
  MAX_DEVELOPER_PROPOSAL_FIELD_GRAPHEMES,
  MAX_DEVELOPER_PROPOSAL_FILES_SHOWN,
  MAX_DEVELOPER_PROPOSAL_TITLE_GRAPHEMES,
  MAX_DEVELOPER_PROPOSAL_VERSIONS_PAGE,
  MAX_FRAME_BYTES,
  type CapturedProcedureDocument,
  type CapturedProcedurePackageLinkProjection,
  type CapturedProcedureProjection,
  type CapturedProcedureSummaryProjection,
  type CapturedProcedureScopeSlot,
  type CapturedProcedureState,
  type CapturedProcedureStepDocument,
  type CapturedProcedureStepProjection,
  type CapturedProcedureStepRequirement,
  type CapturedProcedureVersionProjection,
  type DeveloperProposalProjection,
  type DeveloperProposalSummaryProjection,
  type DeveloperProposalVersionProjection,
  type ReviewRunProcedureProjection,
  type ReviewRunState,
  type SaveDeveloperProposalInput,
  type CapturedProceduresProjection,
  type ImportedSkillImportProjection,
  type ImportedSkillsProjection,
  type ImportedSkillUpdateCheckProjection,
  type ImportedSkillUpdateCandidateProjection,
  type ImportedSkillUpdateRuleProjection,
  type ImportedSkillRevisionProjection,
  type ProcedureRecommendationInput,
  type ProcedureRecommendationProjection,
  type ProcedureCaptureProjection,
  type SaveCapturedProcedureInput,
  type CapturedProcedureValidationProjection,
  type CapturedProcedureStopPreviewProjection,
  type CapturedProcedureStopRunProjection,
  type CapturedProcedureRunProjection,
  type CapturedProcedureApplicabilityProjection,
  type CapturedProcedureApplicabilityEntryProjection,
  type KnowledgeProceduresProjection,
} from '../shared/protocol.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalJson, canonicalRecord, hasExactKeys, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import { graphemeCount } from './analysis/factual-review-contract.js';
import type { ReviewCategoryConfiguration, ReviewCategoryConfigurationEntry } from './review/category-configuration.js';
import { ImportedSkills, type AcquiredSkillPackage, acquireSkillPackage, ImportedSkillError, SkillAcquisitions } from './imported-skills.js';
import { StoreError, requireStore, UUID_PATTERN as StoreUUID_PATTERN, sha256, canonicalJson as storeCanonicalJson } from './store-records.js';
import { ImportedSkillUpdates } from './imported-skill-updates.js';
import { type RecommendationReading, recommendProcedures as rankProcedureRecommendations } from './procedure-recommendation.js';
import { procedureOffersSeries } from './review/series-consistency.js';
import { isAbsolute, basename, join, resolve } from 'node:path';
import { lstat, open, rename, rm } from 'node:fs/promises';
import {
  saveProcedureDefinition,
  resolveProcedurePin,
  procedureVersionId,
  selectProcedureForBook,
  readProcedureLibrary,
} from './procedures/editable.js';
import { readKnowledgeProcedures } from './knowledge-procedures.js';
import type { BookDeliveryPackages } from './book-delivery-packages.js';
import type { EditorialWorkspaceProfileStore } from './editorial-workspace-profile.js';
import type { ReviewGuidelineLedger } from './review-guidelines.js';
import type { ReviewRunStore } from './review/review-runs.js';

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

/**
 * What a Book must have for a step naming `executor` to run there (Issue #66, S31b; REUSE-048): a Series for 书系一致性, whose
 * material the editor chooses apart at each run (REUSE-050), and a baseline analysis for the leads; nothing for any other.
 */
export function stepRequirement(executor: string): CapturedProcedureStepRequirement | null {
  if (executor === 'series-knowledge') return 'series';
  return executor === 'baseline-leads' ? 'baseline-analysis' : null;
}

/** The steps of a document whose Series material the editor chooses apart at each run (Issue #66, S31b; REUSE-049, REUSE-050). */
export function chosenApartSteps(document: CapturedProcedureDocument): string[] {
  return document.authorityCeiling.steps.filter((step) => stepRequirement(step.executor) === 'series').map((step) => step.categoryId);
}

/** Why a Run left out a Series step its Book could take: the editor did not choose it (Issue #66, S31b; REUSE-050). */
export const PROCEDURE_STEP_NOT_CHOSEN = '书系资料要在每次运行时另行选择，这次你没有选它。' as const;

/** Whether a category calls a model: every executor but the model-free leads (REV-011). */
export function callsModel(executor: string): boolean {
  return executor !== 'baseline-leads';
}

export function validCapturedProcedureTitle(title: unknown): title is string {
  return typeof title === 'string' && title.isWellFormed() && title.trim().length > 0 && title === title.trim() &&
    title.length <= MAX_CAPTURED_PROCEDURE_TITLE_CHARACTERS && graphemeCount(title) <= MAX_CAPTURED_PROCEDURE_TITLE_GRAPHEMES && !/[\u0000-\u001f\u007f]/u.test(title);
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
    schema: entries.some((entry) => houseExecutor(entry) === 'series-knowledge') ? CAPTURED_PROCEDURE_SCHEMA_V2 : CAPTURED_PROCEDURE_SCHEMA,
    title,
    runAs: 'review-run',
    steps,
    parameters: { scope },
    authorityCeiling: {
      // ADR 0090: /2 publishes Series eligibility; choosing its material remains a per-Run opt-in.
      runSourceScope: entries.some((entry) => houseExecutor(entry) === 'series-knowledge') ? 'series' : 'current-book',
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
  if ((value.schema !== CAPTURED_PROCEDURE_SCHEMA && value.schema !== CAPTURED_PROCEDURE_SCHEMA_V2) || value.runAs !== 'review-run' || !validCapturedProcedureTitle(value.title)) return false;
  // A document carries a capture slot — 全书 or 选定章节 — never `selection`, which is a per-Run handover on the pin (Issue #423).
  if (!isRecord(value.parameters) || !hasExactKeys(value.parameters, ['scope']) ||
      !(CAPTURED_PROCEDURE_CAPTURE_SLOTS as readonly unknown[]).includes(value.parameters.scope)) return false;
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
      !(ceiling.runSourceScope === 'current-book' || (value.schema === CAPTURED_PROCEDURE_SCHEMA_V2 && ceiling.runSourceScope === 'series')) || !Array.isArray(ceiling.steps) || !Array.isArray(ceiling.outputs) ||
      typeof ceiling.model !== 'boolean' || typeof ceiling.searchEngine !== 'boolean') return false;
  const typed = steps as CapturedProcedureStepDocument[];
  // /2's run-source scope is its steps' sum like the rest of its ceiling (ADR 0090 §5); /1 keeps `current-book` whatever it holds.
  const seriesStep = (ceiling.steps as unknown[]).some((entry) => isRecord(entry) && entry.executor === 'series-knowledge');
  if (ceiling.runSourceScope === 'series' ? !seriesStep : value.schema === CAPTURED_PROCEDURE_SCHEMA_V2 && seriesStep) return false;
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
    // A step's model use is its executor's (a document that says otherwise does not read), so the same executor is the same model use.
    const executor = document.authorityCeiling.steps[index]!.executor;
    if (houseExecutor(source) !== executor || source.output !== step.output || (step.searchEngine && !source.searchEngine)) {
      problems.push(`「${source.label}」的权限超出了来源审阅。`);
    }
  });
  return problems;
}

// ---- the capture's source ----------------------------------------------------------------------------------

/** A Review Run as a capture reads it: its state, and each category with the entry it snapshotted and where it ended. */
export interface CaptureSourceRun {
  readonly authorized: boolean;
  readonly state: ReviewRunState;
  readonly canContinue: boolean;
  readonly categories: ReadonlyArray<{ readonly entry: ReviewCategoryConfigurationEntry; readonly state: string; readonly stateLabel: string }>;
}

export const CAPTURE_NOT_STARTED = '这次审阅还没有开始；审阅完成后才能保存为可复用工序。' as const;
export const CAPTURE_RUNNING = '这次审阅还在进行；审阅完成后才能保存为可复用工序。' as const;
export const CAPTURE_CONTINUABLE = '这次审阅还有类别可以继续；继续审阅完成后才能保存为可复用工序。' as const;
export const CAPTURE_CANCELLED = '这次审阅已取消，不能保存为可复用工序；从一次完成的审阅保存。' as const;
export const CAPTURE_SCOPE_CHANGED = '这次审阅因书系检索排除停下，还没有完成；修改计划并重新授权、审阅完成后才能保存。' as const;
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
      : source.state === 'cancelled'
        ? CAPTURE_CANCELLED
        : source.state === 'scope-changed'
          ? CAPTURE_SCOPE_CHANGED
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
/**
 * A pin that left a step out by the editor's choice is written as `/2`, each step left out saying whether it was (Issue #66,
 * S31b). Every other pin is written as `/1`, exactly as before S31b — every step it left out was one its Book could not take —
 * so a build from before reads it still (S31b review P3-8).
 */
const PIN_SCHEMA_V1 = 'ai7.review.procedure-pin/1' as const;
const PIN_SCHEMA = 'ai7.review.procedure-pin/2' as const;
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
  /** Its steps whose Series material the editor chooses apart at each run, and may leave out (Issue #66, S31b; REUSE-050). */
  readonly chosenApart: ReadonlyArray<string>;
}

/** A step a Run prepared from a version left out, with why: one its Book could not take, or one the editor did not choose. */
export interface ProcedureLeftOutStep {
  readonly categoryId: string;
  readonly label: string;
  readonly reason: string;
  readonly byChoice: boolean;
}

/** Record a Review Run's pin, in the caller's transaction — the one that writes the Run (ADR 0087 §4). */
export function recordReviewRunProcedurePin(
  db: DatabaseSync,
  reviewRunId: string,
  pin: ReviewRunProcedurePinInput,
  ran: ReadonlyArray<string>,
  leftOut: ReadonlyArray<ProcedureLeftOutStep>,
  recordedAt: string,
): void {
  const byChoice = leftOut.some((entry) => entry.byChoice);
  const record = canonicalRecord({
    schema: byChoice ? PIN_SCHEMA : PIN_SCHEMA_V1,
    reviewRunId,
    procedureId: pin.procedureId,
    versionId: pin.versionId,
    version: pin.version,
    title: pin.title,
    documentSha256: pin.documentSha256,
    scope: pin.scope,
    ran,
    leftOut: leftOut.map((entry) => byChoice
      ? { categoryId: entry.categoryId, label: entry.label, reason: entry.reason, byChoice: entry.byChoice }
      : { categoryId: entry.categoryId, label: entry.label, reason: entry.reason }),
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
  const current = record.schema === PIN_SCHEMA;
  requireProcedure((current || record.schema === PIN_SCHEMA_V1) && record.reviewRunId === reviewRunId && record.versionId === text(row.version_id) &&
    record.documentSha256 === text(row.document_sha256) && typeof record.title === 'string' && Array.isArray(record.leftOut) &&
    (record.leftOut as unknown[]).every((entry) => isRecord(entry) && typeof entry.categoryId === 'string' && typeof entry.label === 'string' &&
      typeof entry.reason === 'string' && (current ? typeof entry.byChoice === 'boolean' : !('byChoice' in entry))),
  'CAPTURED_PROCEDURE_RECORD_INVALID', '审阅所依据的可复用工序记录已损坏。');
  const stopped = db.prepare("SELECT 1 FROM captured_procedure_states WHERE version_id = ? AND state = 'stopped'").get(text(row.version_id)) !== undefined;
  // A Book merged in from another house brings its pins and none of that house's procedures (Issue #65 review).
  const present = db.prepare('SELECT document_sha256 FROM captured_procedure_versions WHERE version_id = ?').get(text(row.version_id)) as SqlRow | undefined;
  return {
    procedureId: text(row.procedure_id),
    versionId: text(row.version_id),
    version: integer(row.version),
    title: record.title,
    documentSha256: text(row.document_sha256),
    stopped,
    missing: present === undefined || text(present.document_sha256) !== text(row.document_sha256),
    // A `/1` pin left out only what its Book could not take.
    leftOut: (record.leftOut as Array<{ categoryId: string; label: string; reason: string; byChoice?: boolean }>).map((entry) => ({
      categoryId: entry.categoryId, label: entry.label, reason: entry.reason, byChoice: entry.byChoice === true,
    })),
  };
}

/** Whether one Captured Procedure version has been stopped (Issue #66, S31): final, whoever stopped it. */
export function capturedVersionStopped(db: DatabaseSync, versionId: string): boolean {
  return db.prepare("SELECT 1 FROM captured_procedure_states WHERE version_id = ? AND state = 'stopped'").get(versionId) !== undefined;
}

/**
 * Why a prepared Run pinned to a Captured Procedure version cannot be authorized; `null` when nothing stands in the way. A
 * stopped version is final (ADR 0087 §5); a version this house does not hold — the Book was merged in from another (Issue #65
 * review) — is refused the same way: the Run is prepared again, by hand or from a procedure this house has.
 */
export function procedurePinRefusal(db: DatabaseSync, reviewRunId: string): { code: string; message: string } | null {
  const pin = readReviewRunProcedurePin(db, reviewRunId);
  if (pin === null) return null;
  if (pin.missing) {
    return { code: 'REVIEW_PROCEDURE_MISSING', message: `这次审阅按可复用工序《${pin.title}》第 ${pin.version} 版准备，本机没有这一版；请重新准备这次审阅。` };
  }
  return pin.stopped
    ? { code: 'REVIEW_PROCEDURE_STOPPED', message: `这次审阅按可复用工序《${pin.title}》第 ${pin.version} 版准备，这一版已停用；请重新准备这次审阅。` }
    : null;
}

// ---- Latest Eligible Version Resolution (Issue #66, plan slice S31; UI ADR 0013; REUSE-043 to REUSE-045, REUSE-054) --------

/** One version as resolution weighs it: its state, and — for an 已启用 one — the first reason it no longer validates. */
export interface ResolvableVersion {
  readonly versionId: string;
  readonly version: number;
  readonly state: CapturedProcedureState;
  /** Whether the last `验证并启用…` failed, for a version still waiting. */
  readonly failedValidation: boolean;
  /** For an 已启用 version: why it no longer validates, `null` when it does. Ignored for any other state. */
  readonly problem: string | null;
}

export const PASSED_OVER_STOPPED = '这一版已停用。' as const;
export const PASSED_OVER_PENDING = '这一版还没有验证并启用。' as const;
export const PASSED_OVER_FAILED = '这一版上次验证没有通过，仍是「待验证」。' as const;

/** Whether one version may be resolved or chosen for a new use: 已启用 and still validating (REUSE-044). */
export function versionEligible(version: ResolvableVersion): boolean {
  return version.state === 'enabled' && version.problem === null;
}

/** Why one version is not eligible, in the editor's words; `null` when it is. */
export function versionIneligibleReason(version: ResolvableVersion): string | null {
  if (version.state === 'stopped') return PASSED_OVER_STOPPED;
  if (version.state === 'pending-validation') return version.failedValidation ? PASSED_OVER_FAILED : PASSED_OVER_PENDING;
  return version.problem;
}

/**
 * Latest Eligible Version Resolution over one procedure's versions, in any order (REUSE-043, REUSE-044): the eligible versions
 * newest first — the first is the one a new unpinned use takes — and every version newer than it, passed over with why. With no
 * eligible version every version is passed over. `excluded` versions are weighed as stopped: what a 停用 would leave.
 */
export function resolveProcedureVersions(
  versions: ReadonlyArray<ResolvableVersion>,
  excluded: ReadonlySet<string> = new Set(),
): { eligible: ResolvableVersion[]; passedOver: Array<{ version: number; reason: string }> } {
  const weighed = [...versions]
    .map((version) => excluded.has(version.versionId) ? { ...version, state: 'stopped' as const } : version)
    .sort((left, right) => right.version - left.version);
  const eligible = weighed.filter(versionEligible);
  const latest = eligible[0]?.version ?? 0;
  const passedOver = weighed
    .filter((version) => version.version > latest)
    .map((version) => ({ version: version.version, reason: versionIneligibleReason(version) ?? '' }));
  return { eligible, passedOver };
}

/** Room kept beside a page of versions for the rest of its answer and its envelope. */
const VERSION_PAGE_BUDGET_BYTES = MAX_FRAME_BYTES - 64 * 1024;

/** The newest of `items` that fit the budget, at most `limit`, and always one while any remain. */
export function boundedPage<T>(items: ReadonlyArray<T>, limit: number, budget: number = VERSION_PAGE_BUDGET_BYTES): T[] {
  const page: T[] = [];
  let spent = 0;
  for (const item of items) {
    if (page.length >= limit) break;
    const weight = Buffer.byteLength(JSON.stringify(item), 'utf8') + 1;
    if (page.length > 0 && spent + weight > budget) break;
    page.push(item);
    spent += weight;
  }
  return page;
}

/** What one step reads as in the editor's words: its category's label and its 工序's title, from the configuration. */
export type StepWords = (categoryId: string) => { label: string; procedureTitle: string };

/**
 * The 图书交付包 versions holding a report of any of `reviewRunIds`, newest first, at most `limit`, and how many there are in
 * all (Issue #66, S31b; REUSE-031). The store reads them from the package ledger.
 */
export type LinkedPackages = (reviewRunIds: ReadonlyArray<string>, limit: number) => { packages: CapturedProcedurePackageLinkProjection[]; total: number };

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

  /**
   * `停用` (ADR 0087 §5): final for the version, which is never resolved again and stays as its own Historical Version Stub. The
   * state records the digest of the `停用…` preview the editor confirmed (Issue #66, S31).
   */
  stop(versionId: string, previewDigest: string, now: Date = new Date()): void {
    const current = this.version(versionId);
    requireProcedure(current !== null, 'CAPTURED_PROCEDURE_NOT_FOUND', '这一版可复用工序不存在。');
    if (current.state === 'stopped') return;
    this.#appendState(versionId, 'stopped', { previewDigest }, now);
  }

  /** Every Review Run that pinned one version, oldest first (Issue #66, S31). */
  pinnedRunIds(versionId: string): string[] {
    // A pin is written with its Run, so the order it was recorded in is the order the Runs were prepared in.
    return (this.#db.prepare('SELECT review_run_id FROM review_run_procedure_pins WHERE version_id = ? ORDER BY recorded_at, review_run_id')
      .all(versionId) as SqlRow[]).map((row) => text(row.review_run_id));
  }

  /**
   * The Review Runs pinned to one version that its `停用…` preview has to weigh, oldest first (Issue #66, S31 review P3-10): a
   * superset of those still prepared or still going, read in one query so the preview never derives the state of a Run that
   * finished long ago. A prepared Run counts only while it is its Book's newest — no other can be approved — and an approved
   * Run only while one of its categories has no terminal last event (materialized, failed, interrupted or refused) yet.
   */
  liveCandidateRunIds(versionId: string): string[] {
    return (this.#db.prepare(
      `SELECT p.review_run_id FROM review_run_procedure_pins p JOIN review_runs r ON r.review_run_id = p.review_run_id
       WHERE p.version_id = ? AND (
         (NOT EXISTS (SELECT 1 FROM review_run_authorizations a WHERE a.review_run_id = r.review_run_id)
           AND r.ordinal = (SELECT max(o.ordinal) FROM review_runs o WHERE o.book_id = r.book_id))
         OR (EXISTS (SELECT 1 FROM review_run_authorizations a WHERE a.review_run_id = r.review_run_id)
           AND (SELECT count(*) FROM review_run_category_events e
                WHERE e.review_run_id = r.review_run_id AND e.state IN ('materialized', 'failed', 'interrupted', 'refused')
                  AND e.sequence = (SELECT max(f.sequence) FROM review_run_category_events f WHERE f.review_run_id = e.review_run_id AND f.category_id = e.category_id))
               < json_array_length(r.canonical_json, '$.categories'))
       ) ORDER BY p.recorded_at, p.review_run_id`,
    ).all(versionId) as SqlRow[]).map((row) => text(row.review_run_id));
  }

  /** How many Review Runs pinned to one version were approved — ran, or began to — and how many were only prepared (S31 review P3-3). */
  pinCounts(versionId: string): { ran: number; prepared: number } {
    const row = this.#db.prepare(
      `SELECT count(a.review_run_id) ran, count(*) - count(a.review_run_id) prepared FROM review_run_procedure_pins p
       LEFT JOIN review_run_authorizations a ON a.review_run_id = p.review_run_id WHERE p.version_id = ?`,
    ).get(versionId) as SqlRow;
    return { ran: integer(row.ran), prepared: integer(row.prepared) };
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

  /**
   * The Review Runs that pinned one version, newest first, at most `MAX_CAPTURED_PROCEDURE_RUNS_SHOWN` (REUSE-031). How many
   * ran and how many were only prepared is `pinCounts`'s answer, so nothing here counts them a second time (Issue #684).
   */
  runsOf(versionId: string): Array<{ bookId: string; bookTitle: string; reviewRunId: string; ordinal: number; createdAt: string }> {
    return (this.#db.prepare(
      `SELECT r.book_id, b.title, r.review_run_id, r.ordinal, r.created_at FROM review_run_procedure_pins p
       JOIN review_runs r ON r.review_run_id = p.review_run_id JOIN books b ON b.book_id = r.book_id
       WHERE p.version_id = ? ORDER BY r.created_at DESC, r.review_run_id LIMIT ?`,
    ).all(versionId, MAX_CAPTURED_PROCEDURE_RUNS_SHOWN) as SqlRow[]).map((row) => ({
      bookId: text(row.book_id), bookTitle: text(row.title), reviewRunId: text(row.review_run_id), ordinal: integer(row.ordinal), createdAt: text(row.created_at),
    }));
  }

  /** One procedure as 工序与规则's list names it: its newest version's title and state, its count, and whether it runs. */
  summary(procedureId: string): CapturedProcedureSummaryProjection {
    const versions = this.versions(procedureId);
    requireProcedure(versions.length > 0, 'CAPTURED_PROCEDURE_NOT_FOUND', '这个可复用工序不存在。');
    const latest = versions[0]!;
    return {
      procedureId,
      title: latest.document.title,
      versionCount: versions.length,
      latestVersion: latest.version,
      latestState: latest.state,
      latestStateLabel: CAPTURED_PROCEDURE_STATE_LABELS[latest.state],
      runnable: versions.some((stored) => stored.state === 'enabled'),
    };
  }

  /**
   * One procedure with a page of its versions, newest first, below `before` when it is given: at most
   * `MAX_CAPTURED_PROCEDURE_VERSIONS_PAGE`, each with its state, use and provenance, and no more than one frame holds.
   */
  projection(
    procedureId: string,
    words: StepWords,
    bookTitle: (bookId: string) => string,
    runOrdinal: (reviewRunId: string) => number,
    // Where each linked Run stands now, and the version a new use resolves to (Issue #66, S31; REUSE-031, REUSE-043).
    runStateLabel: (reviewRunId: string) => string,
    latestEligibleVersionId: string | null,
    before: number | null = null,
    // The packages that hold a report of a Run pinned to a version (Issue #66, S31b; REUSE-031).
    linkedPackages: LinkedPackages = () => ({ packages: [], total: 0 }),
  ): CapturedProcedureProjection {
    requireProcedure(before === null || (Number.isSafeInteger(before) && before >= 1), 'CAPTURED_PROCEDURE_INVALID', '版本位置无效。');
    const summary = this.summary(procedureId);
    const candidates = (this.#db.prepare(
      'SELECT * FROM captured_procedure_versions WHERE procedure_id = ? AND (? IS NULL OR version < ?) ORDER BY version DESC LIMIT ?',
    ).all(procedureId, before, before, MAX_CAPTURED_PROCEDURE_VERSIONS_PAGE) as SqlRow[]).map((row): CapturedProcedureVersionProjection => {
      const stored = this.#versionOf(row);
      const runs = this.runsOf(stored.versionId);
      const counts = this.pinCounts(stored.versionId);
      const packages = linkedPackages(this.pinnedRunIds(stored.versionId), MAX_CAPTURED_PROCEDURE_PACKAGES_SHOWN);
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
        runCount: counts.ran,
        preparedRunCount: counts.prepared,
        runs: runs.map((run) => ({
          bookId: run.bookId, bookTitle: run.bookTitle, reviewRunId: run.reviewRunId, label: `第 ${run.ordinal} 次`, createdAt: run.createdAt,
          stateLabel: runStateLabel(run.reviewRunId),
        })),
        packages: packages.packages,
        packageCount: packages.total,
        technical: { documentSha256: stored.documentSha256, previousDocumentSha256: stored.previousDocumentSha256 },
      };
    });
    const versions = boundedPage(candidates, MAX_CAPTURED_PROCEDURE_VERSIONS_PAGE);
    const last = versions.at(-1);
    return { ...summary, latestEligibleVersionId, versions, versionsBefore: last === undefined || last.version === 1 ? null : last.version };
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
    const files = (this.#db.prepare('SELECT file_name, written_at FROM developer_capability_proposal_exports WHERE proposal_version_id = ? ORDER BY written_at DESC, export_id LIMIT ?')
      .all(proposalVersionId, MAX_DEVELOPER_PROPOSAL_FILES_SHOWN) as SqlRow[]).map((file) => ({ fileName: text(file.file_name), writtenAt: text(file.written_at) }));
    const fileCount = integer((this.#db.prepare('SELECT count(*) n FROM developer_capability_proposal_exports WHERE proposal_version_id = ?').get(proposalVersionId) as SqlRow).n);
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
      fileCount,
      technical: { sha256: text(row.sha256) },
      canonical: text(row.canonical_json),
    };
  }

  /** One proposal as 工序与规则's list names it: its newest version's title, its count, and when it was last changed. */
  proposalSummary(proposalId: string): DeveloperProposalSummaryProjection {
    requireProcedure(typeof proposalId === 'string' && UUID_PATTERN.test(proposalId), 'DEVELOPER_PROPOSAL_INVALID', '开发建议标识无效。');
    const row = this.#db.prepare('SELECT * FROM developer_capability_proposals WHERE proposal_id = ? ORDER BY version DESC LIMIT 1').get(proposalId) as SqlRow | undefined;
    requireProcedure(row !== undefined, 'DEVELOPER_PROPOSAL_NOT_FOUND', '这条开发建议不存在。');
    const latest = this.#proposalVersionOf(row);
    return { proposalId, title: latest.title, versionCount: latest.version, latestVersion: latest.version, latestCreatedAt: latest.createdAt };
  }

  /** One proposal with a page of its versions, newest first, below `before` when it is given, no more than one frame holds. */
  proposal(proposalId: string, before: number | null = null): DeveloperProposalProjection {
    requireProcedure(before === null || (Number.isSafeInteger(before) && before >= 1), 'DEVELOPER_PROPOSAL_INVALID', '版本位置无效。');
    const summary = this.proposalSummary(proposalId);
    const candidates = (this.#db.prepare(
      'SELECT * FROM developer_capability_proposals WHERE proposal_id = ? AND (? IS NULL OR version < ?) ORDER BY version DESC LIMIT ?',
    ).all(proposalId, before, before, MAX_DEVELOPER_PROPOSAL_VERSIONS_PAGE) as SqlRow[]).map((row) => {
      const { canonical: _canonical, ...version } = this.#proposalVersionOf(row);
      return version;
    });
    const versions = boundedPage(candidates, MAX_DEVELOPER_PROPOSAL_VERSIONS_PAGE);
    const last = versions.at(-1);
    return { ...summary, versions, versionsBefore: last === undefined || last.version === 1 ? null : last.version };
  }

  /** The proposals newest first, at most `MAX_CAPTURED_PROCEDURES_SHOWN`, as summaries. */
  proposals(): { proposals: DeveloperProposalSummaryProjection[]; truncated: boolean } {
    const rows = this.#db.prepare(
      'SELECT proposal_id, max(created_at) latest FROM developer_capability_proposals GROUP BY proposal_id ORDER BY latest DESC, proposal_id LIMIT ?',
    ).all(MAX_CAPTURED_PROCEDURES_SHOWN + 1) as SqlRow[];
    return {
      proposals: rows.slice(0, MAX_CAPTURED_PROCEDURES_SHOWN).map((row) => this.proposalSummary(text(row.proposal_id))),
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
  return typeof value === 'string' && value.isWellFormed() && (!required || value.trim().length > 0) && value.length <= MAX_DEVELOPER_PROPOSAL_FIELD_CHARACTERS &&
    graphemeCount(value) <= MAX_DEVELOPER_PROPOSAL_FIELD_GRAPHEMES && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

/** A version's steps in the editor's words, each with what a Book must have for it to run there (S31b). */
export function capturedStepProjections(document: CapturedProcedureDocument, words: StepWords): CapturedProcedureStepProjection[] {
  return document.steps.map((step) => {
    const named = words(step.categoryId);
    const executor = document.authorityCeiling.steps.find((ceiling) => ceiling.categoryId === step.categoryId)?.executor ?? '';
    return {
      categoryId: step.categoryId,
      label: named.label,
      procedureTitle: named.procedureTitle,
      procedureVersion: step.procedure.version,
      output: step.output,
      model: step.model,
      searchEngine: step.searchEngine,
      requirement: stepRequirement(executor),
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

// ---- 可复用工序 operations of the store (Issue #65 S30, ADR 0087; moved from store.ts by Issue #1172) ------------------------------

/** The store state and calls the 可复用工序 operations use, lent by EditorialStore: its fields read live through getters, its own methods bound. */
export interface CapturedProcedureStoreHost {
  analysisCall<T>(operation: () => T): T;
  artifactCall<T>(operation: () => Promise<T>): Promise<T>;
  assertAvailable(): void;
  readonly authority: DatabaseSync;
  readonly bookDeliveryPackages: BookDeliveryPackages;
  readonly capturedProcedures: CapturedProcedures;
  readonly editorialWorkspaceProfile: EditorialWorkspaceProfileStore;
  evaluationBookTitle(bookId: string): string;
  guidelineCall<T>(operation: () => T): T;
  reviewCall<T>(operation: () => T): T;
  readonly reviewGuidelines: ReviewGuidelineLedger;
  readonly reviewRuns: ReviewRunStore;
  readonly skillAcquisitions: SkillAcquisitions;
  transaction<T>(db: DatabaseSync, operation: () => T): T;
}

/** Each step's words from the configuration as it applies now; a category no longer there keeps its identity as its label. */
export function capturedStepWords(host: CapturedProcedureStoreHost): StepWords {
  const configuration = host.reviewGuidelines.configuration();
  return (categoryId) => {
    const entry = configuration.categories.find((candidate) => candidate.categoryId === categoryId);
    return { label: entry?.label ?? categoryId, procedureTitle: entry?.procedure.title ?? categoryId };
  };
}

export function capturedProcedureProjection(host: CapturedProcedureStoreHost, procedureId: string, before: number | null = null): CapturedProcedureProjection {
  const { eligible } = resolveProcedureVersions(resolvableVersions(host, host.capturedProcedures.versions(procedureId)));
  return host.capturedProcedures.projection(procedureId, capturedStepWords(host), (bookId) => host.evaluationBookTitle(bookId),
    (reviewRunId) => host.reviewRuns.ordinalOf(reviewRunId), (reviewRunId) => host.reviewRuns.runStatus(reviewRunId).stateLabel,
    eligible[0]?.versionId ?? null, before, (reviewRunIds, limit) => {
      // The 图书交付包 versions that hold a report of a Run pinned to the version (Issue #66, S31b; REUSE-031).
      const held = host.bookDeliveryPackages.holdingReviewRuns(reviewRunIds, limit);
      return { packages: held.packages.map((entry) => ({ ...entry, bookTitle: host.evaluationBookTitle(entry.bookId) })), total: held.total };
    });
}

/**
 * Each version as Latest Eligible Version Resolution weighs it (Issue #66, S31; REUSE-043, REUSE-044): its state, and for an
 * 已启用 one whether it still validates against the configuration as it applies now — deterministic and provider-free.
 */
export function resolvableVersions(host: CapturedProcedureStoreHost, versions: ReadonlyArray<StoredCapturedVersion>): ResolvableVersion[] {
  return versions.map((stored) => ({
    versionId: stored.versionId,
    version: stored.version,
    state: stored.state,
    failedValidation: stored.validationProblems.length > 0,
    problem: stored.state === 'enabled' ? capturedValidation(host, stored).problems[0] ?? null : null,
  }));
}

/** 知识库 › 工序与规则's 可复用工序, apart from the built-in 工序, and the 开发建议 (ADR 0087 §5, §6). A read. */
export function inspectCapturedProcedures(host: CapturedProcedureStoreHost): CapturedProceduresProjection {
  return procedureCall(host, () => {
    const { ids, truncated } = host.capturedProcedures.procedureIds();
    const proposals = host.capturedProcedures.proposals();
    return {
      procedures: ids.map((procedureId) => host.capturedProcedures.summary(procedureId)),
      proceduresTruncated: truncated,
      proposals: proposals.proposals,
      proposalsTruncated: proposals.truncated,
    };
  });
}

/**
 * 导入 Skill… (ADR 0090 §2; REUSE-021, REUSE-022): acquisition reads the picked package into memory and discloses it, keeping
 * nothing; `keep` then keeps exactly those bytes — the source snapshot and an inert working revision — and nothing more.
 */
export async function importSkillPackage(host: CapturedProcedureStoreHost, input: { path: string | null; keep: string | null }): Promise<ImportedSkillImportProjection> {
  host.assertAvailable();
  const { keep } = input;
  if (keep !== null) {
    return procedureCall(host, () => {
      const acquired = host.skillAcquisitions.read(keep);
      const skills = new ImportedSkills(host.authority);
      const revision = skills.keep(acquired);
      host.skillAcquisitions.release(keep);
      return { acquisition: skills.disclose(acquired, keep), revision };
    });
  }
  let acquired: AcquiredSkillPackage;
  try { acquired = await acquireSkillPackage(input.path ?? ''); }
  catch (error) {
    if (error instanceof ImportedSkillError) throw new StoreError(error.code, error.message);
    throw error;
  }
  return procedureCall(host, () => {
    const acquisition = new ImportedSkills(host.authority).disclose(acquired, host.skillAcquisitions.stage(acquired));
    return { acquisition, revision: null };
  });
}

export function inspectImportedSkills(host: CapturedProcedureStoreHost, revisionId: string | null, before: string | null): ImportedSkillsProjection {
  host.assertAvailable();
  return procedureCall(host, () => skillUpdates(host).inspect(revisionId, before));
}

export function skillUpdates(host: CapturedProcedureStoreHost): ImportedSkillUpdates {
  return new ImportedSkillUpdates(host.authority, new ImportedSkills(host.authority));
}

/**
 * 检查更新（从文件）… (ADR 0090 §3; REUSE-032): the picked package is read and disclosed against the Skill it would update, keeping
 * nothing; `keep` then keeps exactly those bytes as a new Source Skill Snapshot and one inert update candidate, and nothing more
 * unless the Skill's own Artifact Update Rule adopts a clean one. A package that is not that Skill is refused with nothing recorded.
 */
export async function checkImportedSkillUpdate(host: CapturedProcedureStoreHost, input: { skillId: string; path: string | null; keep: string | null }): Promise<ImportedSkillUpdateCheckProjection> {
  host.assertAvailable();
  const { keep } = input;
  if (keep !== null) {
    return procedureCall(host, () => {
      const acquired = host.skillAcquisitions.read(keep, input.skillId);
      const result = skillUpdates(host).keep(input.skillId, acquired, keep);
      host.skillAcquisitions.release(keep);
      return result;
    });
  }
  let acquired: AcquiredSkillPackage;
  try { acquired = await acquireSkillPackage(input.path ?? ''); }
  catch (error) {
    if (error instanceof ImportedSkillError) throw new StoreError(error.code, error.message);
    throw error;
  }
  return procedureCall(host, () => {
    // Identity is checked before the package is staged: one that is not this Skill leaves no trace.
    skillUpdates(host).verify(input.skillId, acquired);
    return skillUpdates(host).disclose(input.skillId, acquired, host.skillAcquisitions.stage(acquired, input.skillId));
  });
}

export function inspectImportedSkillUpdate(host: CapturedProcedureStoreHost, candidateId: string): ImportedSkillUpdateCandidateProjection {
  host.assertAvailable();
  return procedureCall(host, () => skillUpdates(host).inspectCandidate(candidateId));
}

export function adoptImportedSkillUpdate(host: CapturedProcedureStoreHost, input: { candidateId: string; reviewDigest: string; acceptItems: readonly string[]; upstreamPaths: readonly string[] }): ImportedSkillUpdateCandidateProjection {
  host.assertAvailable();
  return procedureCall(host, () => skillUpdates(host).adopt(input.candidateId, input));
}

export function dismissImportedSkillUpdate(host: CapturedProcedureStoreHost, candidateId: string): ImportedSkillUpdateCandidateProjection {
  host.assertAvailable();
  return procedureCall(host, () => skillUpdates(host).dismiss(candidateId));
}

export function createImportedSkillUpdateRule(host: CapturedProcedureStoreHost, skillId: string, confirmation: string): ImportedSkillUpdateRuleProjection {
  host.assertAvailable();
  return procedureCall(host, () => skillUpdates(host).createRule(skillId, confirmation));
}

export function revokeImportedSkillUpdateRule(host: CapturedProcedureStoreHost, skillId: string): ImportedSkillUpdateRuleProjection {
  host.assertAvailable();
  return procedureCall(host, () => skillUpdates(host).revokeRule(skillId));
}

export function rollbackImportedSkill(host: CapturedProcedureStoreHost, skillId: string, revisionId: string): ImportedSkillRevisionProjection {
  host.assertAvailable();
  return procedureCall(host, () => skillUpdates(host).rollback(skillId, revisionId));
}

export function validateImportedSkill(host: CapturedProcedureStoreHost, revisionId: string): ImportedSkillRevisionProjection {
  host.assertAvailable();
  return procedureCall(host, () => new ImportedSkills(host.authority).validate(revisionId));
}

export function installImportedSkill(host: CapturedProcedureStoreHost, revisionId: string, previewDigest: string): ImportedSkillRevisionProjection {
  host.assertAvailable();
  return procedureCall(host, () => new ImportedSkills(host.authority).install(revisionId, previewDigest));
}

export function enableImportedSkill(host: CapturedProcedureStoreHost, revisionId: string, bookId: string, previewDigest: string): ImportedSkillRevisionProjection {
  host.assertAvailable();
  return procedureCall(host, () => new ImportedSkills(host.authority).enable(revisionId, bookId, previewDigest));
}

/** ADR 0090: recommendations consume existing eligibility; neither this read nor selection writes authority. */
export function recommendProcedures(host: CapturedProcedureStoreHost, input: ProcedureRecommendationInput): ProcedureRecommendationProjection {
  host.assertAvailable();
  return procedureCall(host, () => {
    requireStore(typeof input.goal === 'string' && input.goal.length <= 2000 && input.goal.isWellFormed() &&
      ['whole', 'chapters', 'selection'].includes(input.scope) && ['review-run', 'baseline-analysis', 'writing', 'unclassified'].includes(input.taskKind) &&
      Array.isArray(input.categoryIds) && input.categoryIds.length <= 32 && input.categoryIds.every((id) => typeof id === 'string'),
    'PROCEDURE_RECOMMENDATION_INVALID', '工序推荐的任务条件无效。');
    const applicability = inspectCapturedProcedureApplicability(host, input.bookId, input.scope === 'selection' ? 'selection' : null);
    const readings: RecommendationReading[] = [];
    for (const entry of applicability.procedures) {
      if (entry.latestEligible === null) continue;
      const stored = host.capturedProcedures.version(entry.latestEligible.versionId)!;
      readings.push({ applicability: entry, document: stored.document, documentSha256: stored.documentSha256,
        labels: capturedStepProjections(stored.document, capturedStepWords(host)).map((step) => step.label) });
    }
    return rankProcedureRecommendations(input, readings);
  });
}

/** One Captured Procedure with a page of its versions, newest first, below `before` when it is given (Issue #65 review). */
export function inspectCapturedProcedure(host: CapturedProcedureStoreHost, procedureId: string, before: number | null): CapturedProcedureProjection {
  return procedureCall(host, () => {
    requireStore(typeof procedureId === 'string' && StoreUUID_PATTERN.test(procedureId), 'CAPTURED_PROCEDURE_INVALID', '可复用工序标识无效。');
    return capturedProcedureProjection(host, procedureId, before);
  });
}

/** One 开发建议 with a page of its versions, newest first, below `before` when it is given (Issue #65 review). */
export function inspectDeveloperProposal(host: CapturedProcedureStoreHost, proposalId: string, before: number | null): DeveloperProposalProjection {
  return procedureCall(host, () => host.capturedProcedures.proposal(proposalId, before));
}

/** One 开发建议 version alone: what 导出为文件… names and writes. */
export function inspectDeveloperProposalVersion(host: CapturedProcedureStoreHost, proposalVersionId: string): DeveloperProposalVersionProjection {
  return procedureCall(host, () => {
    const version = host.capturedProcedures.proposalVersion(proposalVersionId);
    requireStore(version !== null, 'DEVELOPER_PROPOSAL_NOT_FOUND', '这一版开发建议不存在。');
    const { canonical: _canonical, ...projection } = version;
    return projection;
  });
}

/**
 * `将以上工序保存为可复用工序` on one Review Run of the Book (ADR 0087 §2; REUSE-002, REUSE-011 to REUSE-019): its source set —
 * every category, which may be kept and why not — the scope slot it suggests, the deterministic classification, and the
 * procedures a next version may join. A read: closing it creates nothing (REUSE-020).
 */
export function inspectProcedureCapture(host: CapturedProcedureStoreHost, bookId: string, reviewRunId: string): ProcedureCaptureProjection {
  return procedureCall(host, () => {
    const source = host.reviewRuns.captureSource(bookId, reviewRunId);
    const { ids } = host.capturedProcedures.procedureIds();
    return {
      bookId,
      reviewRunId,
      runLabel: `第 ${source.ordinal} 次审阅`,
      available: source.unavailableReason === null,
      unavailableReason: source.unavailableReason,
      steps: source.steps.map(({ entry, eligible, excludedReason }) => ({
        categoryId: entry.categoryId,
        label: entry.label,
        procedureTitle: entry.procedure.title,
        procedureVersion: entry.procedure.version,
        output: entry.output,
        model: callsModel(houseExecutor(entry)),
        searchEngine: entry.searchEngine,
        eligible,
        excludedReason,
      })),
      scopeSlot: source.scopeKind === 'whole' ? 'whole' : 'chapters',
      sourceScopeLabel: source.scopeLabel,
      // A finished Review Run is review work the existing executors already perform: a Captured Procedure. Anything that needs
      // new code is a Developer Capability Proposal; the native Skill and Workflow drafts and a Default Execution Rule over a
      // Captured Procedure stay deferred (ADR 0087 §1, §6).
      classification: {
        recommended: 'captured-procedure',
        alternatives: [
          { kind: 'developer-proposal', available: true },
          { kind: 'skill-draft', available: false },
          { kind: 'workflow-draft', available: false },
          { kind: 'default-rule', available: false },
        ],
      },
      procedures: ids.map((procedureId) => {
        const latest = host.capturedProcedures.versions(procedureId)[0]!;
        return { procedureId, title: latest.document.title, latestVersion: latest.version };
      }),
    };
  });
}

/**
 * 保存为可复用工序 (ADR 0087 §2): the kept steps of a finished Review Run, in the configuration's order, saved as version 1 of a
 * new Captured Procedure or the next version of an existing one, 待验证. Its document holds nothing of the Book; the Run is
 * named only in the local provenance outside its digest.
 */
export function saveCapturedProcedure(host: CapturedProcedureStoreHost, input: SaveCapturedProcedureInput, now: Date = new Date()): CapturedProcedureProjection {
  return procedureCall(host, () => {
    requireStore(typeof input === 'object' && input !== null &&
      Array.isArray(input.categoryIds) && input.categoryIds.length >= 1 && new Set(input.categoryIds).size === input.categoryIds.length &&
      input.categoryIds.every((categoryId) => typeof categoryId === 'string'),
    'CAPTURED_PROCEDURE_STEPS_INVALID', '请至少保留一个步骤，且不要重复。');
    // A capture sets 全书 or 选定章节; a selection is handed over at each run, never saved as a setting (Issue #423, S77 deferred item a).
    requireStore((CAPTURED_PROCEDURE_CAPTURE_SLOTS as readonly string[]).includes(input.scopeSlot), 'CAPTURED_PROCEDURE_INVALID', '审阅范围的设定无效。');
    requireStore(validCapturedProcedureTitle(input.title), 'CAPTURED_PROCEDURE_TITLE_INVALID',
      `请给这个工序起一个名字（1–${MAX_CAPTURED_PROCEDURE_TITLE_GRAPHEMES} 个字，前后不留空格）。`);
    const source = host.reviewRuns.captureSource(input.bookId, input.reviewRunId);
    requireStore(source.unavailableReason === null, 'CAPTURED_PROCEDURE_SOURCE_INELIGIBLE', source.unavailableReason ?? '');
    for (const categoryId of input.categoryIds) {
      const step = source.steps.find((candidate) => candidate.entry.categoryId === categoryId);
      requireStore(step !== undefined, 'CAPTURED_PROCEDURE_STEPS_INVALID', '要保存的步骤不在这次审阅中。');
      requireStore(step.eligible, 'CAPTURED_PROCEDURE_STEP_INELIGIBLE', `「${step.entry.label}」不能保存：${step.excludedReason ?? ''}`);
    }
    // The steps keep the configuration's order — the Run's own — whatever order they were named in (ADR 0087 §2).
    const entries = source.steps.filter((step) => input.categoryIds.includes(step.entry.categoryId)).map((step) => step.entry);
    const document = capturedProcedureDocument(input.title, entries, input.scopeSlot);
    const stored = host.transaction(host.authority, () => host.capturedProcedures.save({
      procedureId: input.procedureId,
      document,
      sourceBookId: input.bookId,
      sourceReviewRunId: input.reviewRunId,
      sourceRunOrdinal: source.ordinal,
    }, now));
    return capturedProcedureProjection(host, stored.procedureId);
  });
}

/**
 * `验证并启用…`'s preview of one version (ADR 0087 §3), deterministic and provider-free: each step with its 工序 and version,
 * its output, its model and search-engine use, the guideline versions a run would apply today against the source Run's, the
 * scope slot, the Authority Ceiling, and every problem — a step that no longer resolves at the same 工序 version, or a ceiling
 * wider than the source Run's. Its digest is what enabling confirms.
 */
export function capturedValidation(host: CapturedProcedureStoreHost, stored: StoredCapturedVersion): CapturedProcedureValidationProjection {
  const configuration = host.reviewGuidelines.configuration();
  const sourceEntries = host.reviewRuns.snapshotEntries(stored.sourceReviewRunId);
  const words = capturedStepWords(host);
  const steps = stored.document.steps.map((step, index) => {
    const entry = configuration.categories.find((candidate) => candidate.categoryId === step.categoryId);
    const source = sourceEntries.find((candidate) => candidate.categoryId === step.categoryId);
    // 书系一致性's documents are each Book's Series Knowledge, read when it runs; the house's guideline documents are compared.
    const guidelines = entry === undefined || houseExecutor(entry) === 'series-knowledge' ? [] : entry.guidelineDocuments.map((document) => ({
      title: document.title,
      issuer: document.issuer,
      version: document.version,
      sourceVersion: source?.guidelineDocuments.find((candidate) => candidate.documentId === document.documentId)?.version ?? null,
    }));
    return {
      ...capturedStepProjections(stored.document, words)[index]!,
      guidelines,
      problem: capturedStepProblem(stored.document, index, configuration),
    };
  });
  const problems = [
    ...steps.flatMap((step) => step.problem === null ? [] : [step.problem]),
    ...ceilingWiderThanSource(stored.document, sourceEntries),
  ];
  const previewDigest = sha256(storeCanonicalJson({
    versionId: stored.versionId,
    documentSha256: stored.documentSha256,
    steps: steps.map((step) => ({ categoryId: step.categoryId, guidelines: step.guidelines, problem: step.problem })),
    problems,
  }));
  return {
    versionId: stored.versionId,
    procedureId: stored.procedureId,
    version: stored.version,
    title: stored.document.title,
    state: stored.state,
    steps,
    scopeSlot: stored.document.parameters.scope,
    ceiling: stored.document.authorityCeiling,
    problems,
    passes: problems.length === 0,
    previewDigest,
  };
}

export function requireCapturedVersion(host: CapturedProcedureStoreHost, versionId: string): StoredCapturedVersion {
  requireStore(typeof versionId === 'string' && StoreUUID_PATTERN.test(versionId), 'CAPTURED_PROCEDURE_INVALID', '可复用工序的版本标识无效。');
  const stored = host.capturedProcedures.version(versionId);
  requireStore(stored !== null, 'CAPTURED_PROCEDURE_NOT_FOUND', '这一版可复用工序不存在。');
  return stored;
}

export function previewCapturedProcedureValidation(host: CapturedProcedureStoreHost, versionId: string): CapturedProcedureValidationProjection {
  return procedureCall(host, () => capturedValidation(host, requireCapturedVersion(host, versionId)));
}

/**
 * Confirm `验证并启用…` (ADR 0087 §3): exactly the preview the editor saw, by its digest. A version that passes is `已启用`; one
 * that does not keeps `待验证` with its reasons recorded. Nothing is planned, prepared or run.
 */
export function enableCapturedProcedure(host: CapturedProcedureStoreHost, versionId: string, previewDigest: string, now: Date = new Date()): CapturedProcedureProjection {
  return procedureCall(host, () => {
    const stored = requireCapturedVersion(host, versionId);
    const preview = capturedValidation(host, stored);
    requireStore(typeof previewDigest === 'string' && preview.previewDigest === previewDigest, 'CAPTURED_PROCEDURE_PREVIEW_STALE',
      '验证的结果在你查看之后有了变化；请重新查看再启用。');
    host.transaction(host.authority, () => host.capturedProcedures.recordValidation(versionId, preview.problems, preview.previewDigest, now));
    return capturedProcedureProjection(host, stored.procedureId);
  });
}

/**
 * `停用…`'s preview (Issue #66, plan slice S31; REUSE-038, REUSE-040, REUSE-041): the Version Removal Preview for a 停用, which
 * removes nothing (ADR 0087 §5). For one version, or — with `versionId` `null` — every version not stopped yet: each with the
 * Review Runs that pinned it — a prepared one not yet approved and still its Book's newest is prepared again, an approved one
 * not yet finished goes on under the version it was approved with, and every one keeps naming it — and the version a new use
 * resolves to afterwards. Its digest is what `stopCapturedProcedure` confirms. A read.
 */
export function previewCapturedProcedureStop(host: CapturedProcedureStoreHost, procedureId: string, versionId: string | null): CapturedProcedureStopPreviewProjection {
  return procedureCall(host, () => capturedStopPreview(host, procedureId, versionId).projection);
}

export function capturedStopPreview(host: CapturedProcedureStoreHost, procedureId: string, versionId: string | null): { projection: CapturedProcedureStopPreviewProjection; stoppingIds: string[] } {
  requireStore(typeof procedureId === 'string' && StoreUUID_PATTERN.test(procedureId), 'CAPTURED_PROCEDURE_INVALID', '可复用工序标识无效。');
  requireStore(versionId === null || (typeof versionId === 'string' && StoreUUID_PATTERN.test(versionId)), 'CAPTURED_PROCEDURE_INVALID', '可复用工序的版本标识无效。');
  const versions = host.capturedProcedures.versions(procedureId);
  requireStore(versions.length > 0, 'CAPTURED_PROCEDURE_NOT_FOUND', '这个可复用工序不存在。');
  if (versionId !== null) {
    const chosen = versions.find((stored) => stored.versionId === versionId);
    requireStore(chosen !== undefined, 'CAPTURED_PROCEDURE_NOT_FOUND', '这一版可复用工序不存在。');
    requireStore(chosen.state !== 'stopped', 'CAPTURED_PROCEDURE_STOPPED', `《${chosen.document.title}》第 ${chosen.version} 版已经停用。`);
  }
  const stopping = versions.filter((stored) => stored.state !== 'stopped' && (versionId === null || stored.versionId === versionId));
  requireStore(stopping.length > 0, 'CAPTURED_PROCEDURE_STOPPED', `《${versions[0]!.document.title}》的全部版本都已停用。`);
  const link = (reviewRunId: string, status: { bookId: string; ordinal: number; stateLabel: string }): CapturedProcedureStopRunProjection => ({
    bookId: status.bookId, bookTitle: host.evaluationBookTitle(status.bookId), reviewRunId, label: `第 ${status.ordinal} 次`, stateLabel: status.stateLabel,
  });
  // Every version it takes, each with every Run it touches: the digest binds all of them, the answer shows what one frame holds.
  const weighed = stopping.map((stored) => {
    const prepared: CapturedProcedureStopRunProjection[] = [];
    const active: CapturedProcedureStopRunProjection[] = [];
    for (const reviewRunId of host.capturedProcedures.liveCandidateRunIds(stored.versionId)) {
      const status = host.reviewRuns.runStatus(reviewRunId);
      // Prepared and still its Book's newest: its approval would be refused once the version is stopped (ADR 0087 §5).
      if (!status.authorized && status.newestOfBook) prepared.push(link(reviewRunId, status));
      // Approved and not finished — running, or with 继续审阅 left: it goes on under the version it was approved with.
      else if (status.authorized && (status.state === 'running' || status.canContinue)) active.push(link(reviewRunId, status));
    }
    return { stored, prepared, active };
  });
  const previewVersions = weighed.map(({ stored, prepared, active }) => ({
    versionId: stored.versionId,
    version: stored.version,
    stateLabel: CAPTURED_PROCEDURE_STATE_LABELS[stored.state],
    runCount: host.capturedProcedures.pinCounts(stored.versionId).ran,
    prepared: prepared.slice(-MAX_CAPTURED_PROCEDURE_RUNS_SHOWN).reverse(),
    preparedCount: prepared.length,
    active: active.slice(-MAX_CAPTURED_PROCEDURE_RUNS_SHOWN).reverse(),
    activeCount: active.length,
  }));
  const after = resolveProcedureVersions(resolvableVersions(host, versions), new Set(stopping.map((stored) => stored.versionId))).eligible[0] ?? null;
  const previewDigest = sha256(storeCanonicalJson({
    procedureId,
    versionId,
    versions: weighed.map(({ stored, prepared, active }) => ({
      versionId: stored.versionId,
      state: stored.state,
      prepared: prepared.map((run) => run.reviewRunId),
      active: active.map((run) => run.reviewRunId),
    })),
    afterVersionId: after?.versionId ?? null,
  }));
  return {
    stoppingIds: stopping.map((stored) => stored.versionId),
    projection: {
      procedureId,
      title: versions[0]!.document.title,
      versionId,
      // As many of the newest as one frame holds, at most a page (S31 review P2-2); the rest are counted.
      versions: boundedPage(previewVersions, MAX_CAPTURED_PROCEDURE_VERSIONS_PAGE),
      versionCount: previewVersions.length,
      afterVersion: after?.version ?? null,
      previewDigest,
    },
  };
}

/**
 * `停用` (ADR 0087 §5): one version, or — with `versionId` `null` — every version not stopped yet, confirming exactly the
 * `停用…` preview the editor read, by its digest, checked inside the write (Issue #66, S31). Final for each: a stopped version
 * is never resolved again and stays as its own Historical Version Stub, and every Run that pinned it keeps naming it. Nothing
 * is deleted or blocked.
 */
export function stopCapturedProcedure(host: CapturedProcedureStoreHost, procedureId: string, versionId: string | null, previewDigest: string, now: Date = new Date()): CapturedProcedureProjection {
  return procedureCall(host, () => {
    host.transaction(host.authority, () => {
      const preview = capturedStopPreview(host, procedureId, versionId);
      requireStore(typeof previewDigest === 'string' && preview.projection.previewDigest === previewDigest, 'CAPTURED_PROCEDURE_STOP_PREVIEW_STALE',
        '停用的影响在你查看之后有了变化；请重新查看再停用。');
      for (const stopping of preview.stoppingIds) host.capturedProcedures.stop(stopping, previewDigest, now);
    });
    return capturedProcedureProjection(host, procedureId);
  });
}

/**
 * `运行此工序…` / `按已保存的工序` for one Book (ADR 0087 §4; UI ADR 0013; REUSE-043 to REUSE-045, REUSE-054): the newest
 * `已启用` version that still validates — every newer one passed over and said why — or, with `versionId`, the exact eligible
 * version the editor chose instead (Issue #66, S31), with its steps as this Book can take them and where today's guideline
 * versions differ from the source Run's. A version that is not eligible cannot be chosen. A read: the 新建审阅 sheet prepares.
 */
export function inspectCapturedProcedureRun(host: CapturedProcedureStoreHost, bookId: string, procedureId: string, versionId: string | null = null, scope: CapturedProcedureScopeSlot | null = null): CapturedProcedureRunProjection {
  return procedureCall(host, () => {
    requireStore(scope === null || scope === 'selection', 'CAPTURED_PROCEDURE_INVALID', '可复用工序的运行范围无效。');
    const resolution = capturedRunResolution(host, bookId, procedureId, versionId, { scope });
    requireStore(resolution.ineligible === null, 'REVIEW_PROCEDURE_VERSION_INELIGIBLE', resolution.ineligible ?? '');
    return resolution.projection;
  });
}

/**
 * One procedure resolved for one Book. `read` lets a caller that weighs many procedures for the same Book (S31b review P3-3)
 * pass the versions it already read and share the Book's category availability, which depends only on the scope slot — or on
 * `read.scope`, the 当前选区 a selection menu asks for instead of each version's slot (Issue #423, S77 deferred item a).
 */
export function capturedRunResolution(
    host: CapturedProcedureStoreHost,
  bookId: string,
  procedureId: string,
  versionId: string | null,
  read: { versions?: ReadonlyArray<StoredCapturedVersion>; availability?: Map<CapturedProcedureScopeSlot, ReadonlyMap<string, string | null>>; scope?: CapturedProcedureScopeSlot | null } = {},
): { projection: CapturedProcedureRunProjection; ineligible: string | null } {
  requireStore(typeof bookId === 'string' && StoreUUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
  requireStore(versionId === null || (typeof versionId === 'string' && StoreUUID_PATTERN.test(versionId)), 'CAPTURED_PROCEDURE_INVALID', '可复用工序的版本标识无效。');
  const versions = read.versions ?? host.capturedProcedures.versions(procedureId);
  requireStore(versions.length > 0, 'CAPTURED_PROCEDURE_NOT_FOUND', '这个可复用工序不存在。');
  const resolvable = resolvableVersions(host, versions);
  const { eligible, passedOver } = resolveProcedureVersions(resolvable);
  const title = versions[0]!.document.title;
  const eligibleVersions = eligible.map((version) => ({ versionId: version.versionId, version: version.version }));
  let chosen = eligible[0] ?? null;
  let ineligible: string | null = null;
  if (versionId !== null) {
    const asked = resolvable.find((version) => version.versionId === versionId);
    requireStore(asked !== undefined, 'CAPTURED_PROCEDURE_NOT_FOUND', '这一版可复用工序不存在。');
    if (!versionEligible(asked)) ineligible = `《${title}》第 ${asked.version} 版现在不能选用：${versionIneligibleReason(asked) ?? ''}`;
    chosen = asked;
  }
  if (chosen === null || ineligible !== null) {
    return {
      ineligible,
      projection: {
        bookId,
        procedureId,
        title,
        resolved: null,
        passedOver,
        eligibleVersions,
        unavailableReason: resolvable.some((version) => version.state === 'enabled')
          ? '这个工序启用的各版现在都不能按原样运行；请从一次新的审阅重新保存。'
          : '这个工序还没有启用的版本；先在知识库「工序与规则」里验证并启用。',
      },
    };
  }
  const stored = versions.find((candidate) => candidate.versionId === chosen.versionId)!;
  const validation = capturedValidation(host, stored);
  const slot = read.scope ?? stored.document.parameters.scope;
  let availability = read.availability?.get(slot);
  if (availability === undefined) {
    availability = host.reviewRuns.categoryAvailability(bookId, slot);
    read.availability?.set(slot, availability);
  }
  const chosenApart = chosenApartSteps(stored.document);
  return {
    ineligible: null,
    projection: {
      bookId,
      procedureId,
      title,
      resolved: {
        ...(procedureOffersSeries(stored.document) ? { runSourceScope: 'series' as const } : {}),
        versionId: stored.versionId,
        version: stored.version,
        latestEligible: stored.versionId === eligible[0]!.versionId,
        documentSha256: stored.documentSha256,
        scopeSlot: stored.document.parameters.scope,
        steps: validation.steps.map((step) => {
          const reason = availability.has(step.categoryId) ? availability.get(step.categoryId)! : '这一类已不在审阅配置中。';
          // Series material is chosen apart at each run (Issue #66, S31b; REUSE-049, REUSE-050).
          return { categoryId: step.categoryId, label: step.label, available: reason === null, unavailableReason: reason, chosenApart: chosenApart.includes(step.categoryId) };
        }),
        guidelineChanges: validation.steps.flatMap((step) => step.guidelines
          .filter((guideline) => guideline.sourceVersion !== guideline.version)
          .map((guideline) => ({ categoryId: step.categoryId, label: step.label, title: guideline.title, sourceVersion: guideline.sourceVersion, version: guideline.version }))),
      },
      passedOver,
      eligibleVersions,
      unavailableReason: null,
    },
  };
}

/**
 * The pin a preparation from a Captured Procedure carries (ADR 0087 §4): only exactly the version and digest the sheet was
 * pre-filled from, and only while it is still eligible for this Book — the latest eligible, or the older eligible one the
 * editor chose (Issue #66, S31; REUSE-054). A version stopped, or one that no longer validates since, makes the editor choose
 * again.
 */
export function capturedProcedurePin(host: CapturedProcedureStoreHost, bookId: string, chosen: { versionId: string; documentSha256: string }): ReviewRunProcedurePinInput {
  requireStore(typeof chosen === 'object' && chosen !== null && typeof chosen.versionId === 'string' && StoreUUID_PATTERN.test(chosen.versionId) &&
    typeof chosen.documentSha256 === 'string' && /^[0-9a-f]{64}$/u.test(chosen.documentSha256), 'REVIEW_PROCEDURE_INVALID', '所选的可复用工序无效。');
  const stored = requireCapturedVersion(host, chosen.versionId);
  const run = capturedRunResolution(host, bookId, stored.procedureId, chosen.versionId);
  requireStore(run.ineligible === null && run.projection.resolved !== null && run.projection.resolved.versionId === chosen.versionId &&
    run.projection.resolved.documentSha256 === chosen.documentSha256,
  'REVIEW_PROCEDURE_STALE', `可复用工序《${stored.document.title}》在你选择之后有了变化；请重新选择它。`);
  return {
    procedureId: stored.procedureId,
    versionId: stored.versionId,
    version: stored.version,
    title: stored.document.title,
    documentSha256: stored.documentSha256,
    scope: stored.document.parameters.scope,
    steps: stored.document.steps.map((step) => step.categoryId),
    chosenApart: chosenApartSteps(stored.document),
  };
}

/**
 * 按已保存的工序 on one Book's 新建审阅 (Issue #66, plan slice S31b; REUSE-046, REUSE-053, REUSE-054): every enabled Captured
 * Procedure of the house, each with the one version a new use takes — its latest eligible — and how many of that version's
 * steps this Book can take now, the Series steps chosen apart among them, and why each other is left out. Deterministic and
 * provider-free, and a read: it recommends nothing itself — 工序推荐 reads it (ADR 0090 §1) — and rules none out: a mismatch is said, and the
 * editor may still choose it by hand. With `scope: 'selection'` (Issue #423, S77 deferred item a) each applies to a 当前选区 of
 * the Book instead of its own slot, for the selection menu's list of the house's procedures.
 */
export function inspectCapturedProcedureApplicability(host: CapturedProcedureStoreHost, bookId: string, scope: CapturedProcedureScopeSlot | null = null): CapturedProcedureApplicabilityProjection {
  return procedureCall(host, () => {
    requireStore(typeof bookId === 'string' && StoreUUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    requireStore(scope === null || scope === 'selection', 'CAPTURED_PROCEDURE_INVALID', '可复用工序的运行范围无效。');
    const { ids, truncated } = host.capturedProcedures.procedureIds();
    const procedures: CapturedProcedureApplicabilityEntryProjection[] = [];
    // The Book's category availability once per scope slot, and each procedure's versions read once (S31b review P3-3).
    const availability = new Map<CapturedProcedureScopeSlot, ReadonlyMap<string, string | null>>();
    for (const procedureId of ids) {
      const versions = host.capturedProcedures.versions(procedureId);
      if (!versions.some((stored) => stored.state === 'enabled')) continue;
      const { projection } = capturedRunResolution(host, bookId, procedureId, null, { versions, availability, scope });
      const resolved = projection.resolved;
      if (resolved === null) {
        procedures.push({ procedureId, title: projection.title, latestEligible: null, fit: 'no-version', stepCount: 0, availableCount: 0, chosenApart: [], chosenApartSteps: [], leftOut: [] });
        continue;
      }
      const available = resolved.steps.filter((step) => step.available);
      const chosenApart = available.filter((step) => step.chosenApart);
      procedures.push({
        procedureId,
        title: projection.title,
        latestEligible: { versionId: resolved.versionId, version: resolved.version },
        fit: available.length === resolved.steps.length ? 'all' : available.length === 0 ? 'none' : 'partial',
        stepCount: resolved.steps.length,
        availableCount: available.length,
        chosenApart: chosenApart.map((step) => step.label),
        chosenApartSteps: chosenApart.map((step) => ({ categoryId: step.categoryId, label: step.label })),
        leftOut: resolved.steps.filter((step) => !step.available).map((step) => ({ label: step.label, reason: step.unavailableReason ?? '' })),
      });
    }
    return { bookId, procedures, truncated };
  });
}

/** 保存开发建议 (ADR 0087 §6; REUSE-063, REUSE-064): a new Developer Capability Proposal, or its next version. Sent nowhere. */
export function saveDeveloperProposal(host: CapturedProcedureStoreHost, input: SaveDeveloperProposalInput, now: Date = new Date()): DeveloperProposalProjection {
  return procedureCall(host, () => {
    const proposalId = host.transaction(host.authority, () => host.capturedProcedures.saveProposal(input, now));
    return host.capturedProcedures.proposal(proposalId);
  });
}

/**
 * 导出为文件… (ADR 0087 §6): one proposal version written as Markdown to the file the editor chose through the platform Save
 * dialog — beside it first, synced, then renamed onto the name — and the file's name, digest and length recorded. It holds no
 * Book material, so it is not an External Export Policy target, and AI7 sends it nowhere.
 */
export async function writeDeveloperProposalFile(host: CapturedProcedureStoreHost, proposalVersionId: string, destination: string, now: Date = new Date()): Promise<DeveloperProposalProjection> {
  host.assertAvailable();
  const version = procedureCall(host, () => host.capturedProcedures.proposalVersion(proposalVersionId));
  requireStore(version !== null, 'DEVELOPER_PROPOSAL_NOT_FOUND', '这一版开发建议不存在。');
  requireStore(typeof destination === 'string' && destination.isWellFormed() && isAbsolute(destination) && basename(destination).length > 0 &&
    basename(destination).length <= 255, 'DEVELOPER_PROPOSAL_DESTINATION_INVALID', '保存位置无效。');
  const existing = await lstat(destination).catch(() => null);
  requireStore(existing === null || existing.isFile(), 'DEVELOPER_PROPOSAL_DESTINATION_INVALID', '保存位置不是一个文件。');
  const bytes = new TextEncoder().encode(developerProposalFileText(version));
  const partial = join(resolve(destination, '..'), `.${randomUUID()}.ai7-partial`);
  try {
    const handle = await open(partial, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(partial, destination);
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined);
    if (error instanceof StoreError) throw error;
    throw new StoreError('DEVELOPER_PROPOSAL_WRITE_FAILED', '无法把开发建议写到所选位置。');
  }
  return procedureCall(host, () => {
    host.transaction(host.authority, () => host.capturedProcedures.recordProposalFile(proposalVersionId, basename(destination), bytes, now));
    return host.capturedProcedures.proposal(version.proposalId);
  });
}

export function procedureCall<T>(host: CapturedProcedureStoreHost, operation: () => T): T {
  return host.reviewCall(() => {
    try {
      return operation();
    } catch (error) {
      if (error instanceof CapturedProcedureError || error instanceof ImportedSkillError) throw new StoreError(error.code, error.message);
      throw error;
    }
  });
}

/**
 * 知识库 › 工序与规则 (Issue #427, S79d; KB-010): the review categories' 工序 as they apply now, and the native artifact as
 * its owner reads it for the house.
 */
export function procedureLibrary(host: CapturedProcedureStoreHost, command: import('../shared/protocol/procedures.js').ProcedureLibraryCommand): import('../shared/protocol/procedures.js').ProcedureLibraryProjection {
  host.assertAvailable();
  return host.analysisCall(() => {
    host.transaction(host.authority, () => {
      if (command.action === 'save') saveProcedureDefinition(host.authority, command.input, new Date());
      if (command.action === 'stop') {
        resolveProcedurePin(host.authority, command.procedure);
        host.authority.prepare('INSERT INTO procedure_version_stops VALUES (?,?) ON CONFLICT(version_id) DO NOTHING')
          .run(procedureVersionId(command.procedure), new Date().toISOString());
      }
      if (command.action === 'select') {
        host.evaluationBookTitle(command.bookId);
        selectProcedureForBook(host.authority, command.bookId, command.procedure);
      }
    });
    return readProcedureLibrary(host.authority);
  });
}

export async function inspectKnowledgeProcedures(host: CapturedProcedureStoreHost): Promise<KnowledgeProceduresProjection> {
  const profile = await host.artifactCall(() => host.editorialWorkspaceProfile.house());
  return host.guidelineCall(() => readKnowledgeProcedures(host.authority, host.reviewGuidelines.configuration(), profile));
}
