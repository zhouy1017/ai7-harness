import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  REVIEW_COVERAGE_STATE_LABELS,
  REVIEW_FINDING_SEVERITY_LABELS,
  REVIEW_FINDING_STATUS_LABELS,
  REVIEW_SCOPE_KINDS,
  type AnalysisGoal,
  type AnalysisProjection,
  type AnalysisTaskMode,
  type BaselineAnalysisProjection,
  type BaselineAnalysisResultSetRevisionProjection,
  type EditorialMarkBasisProjection,
  type FactualReviewResultSetRevisionProjection,
  type FactualSeverityTier,
  type LaunchPolicyProjection,
  type ReviewAvailabilityProjection,
  type ReviewCategoryResultSetRevisionProjection,
  type ReviewChapterOptionProjection,
  type ReviewCoverageRowProjection,
  type ReviewFindingProjection,
  type ReviewFindingSeverity,
  type ReviewFindingStatus,
  type ReviewReportProjection,
  type ReviewReportRecord,
  type ReviewRunCategoryPlanProjection,
  type ReviewRunCategoryProjection,
  type ReviewRunCategoryState,
  type ReviewRunProjection,
  type ReviewRunScopeRequest,
  type ReviewRunState,
  type ReviewRunSummaryProjection,
  type ReviewScopeKind,
  type ReviewScopeOptionsProjection,
  type ReviewWorkspaceCategoryProjection,
  type ReviewWorkspaceProjection,
} from '../../shared/protocol.js';
import type { BaselineAnalysisStore, ProgressReader } from '../analysis/baseline-analysis-store.js';
import {
  AnalysisError,
  BLOCK_ID_PATTERN,
  DIGEST_PATTERN,
  UUID_PATTERN,
  canonicalRecord,
  hasExactKeys,
  isRecord,
  parseCanonicalJson,
  sha256Hex,
} from '../analysis/canonical.js';
import { deriveCoverageManifest } from '../analysis/coverage-manifest.js';
import { graphemeCount, sliceGraphemes } from '../analysis/factual-review-contract.js';
import type { EditorialMarkStore, ProducedEditorialMarkInput } from '../editorial-marks.js';
import {
  BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  reviewCategoryBasisStatement,
  reviewCategoryConfigurationDigest,
  type ReviewCategoryConfiguration,
  type ReviewCategoryConfigurationEntry,
  type ReviewCategoryExecutor,
} from './category-configuration.js';
import { reviewLeadBody, reviewLeadsOf } from './review-leads.js';
import { buildReviewReport, reportQuote, reviewFindingCounts } from './review-report.js';
import {
  REVIEW_RUN_CATEGORY_STATE_LABELS,
  TERMINAL_CATEGORY_EVENTS,
  reviewFindingStatus,
  reviewRunCategoryState,
  reviewRunState,
  reviewRunStateLabel,
  type ReviewMarkStatus,
  type ReviewRunCategoryEventState,
} from './review-run-state.js';
import {
  FACTUAL_AGAIN_REASON,
  LEADS_ABSENT_REASON,
  NO_CHAPTERS_REASON,
  SELECTION_UNAVAILABLE_REASON,
  chapterOfPosition,
  chapterOptionsFromOutline,
  chapterOptionsFromUnits,
  resolveChapterRange,
  reviewCategoryScopePlan,
  reviewScopeLabel,
  type ResolvedReviewScope,
  type ReviewBlockRange,
  type ReviewCategoryLedgerFacts,
  type ReviewCategoryScopePlan,
} from './review-scope.js';

/**
 * Review Runs (Issue #417, plan slice S69; V2-UX-REV-001 to REV-013, MARK-010, FIND-002): one Book-owned
 * execution of Editorial Review over the categories an editor selected and one scope, against an exact
 * Manuscript Revision. A Review Run is a record over several Tasks — one per Task-backed category, each
 * on its own category ledger — plus the model-free leads of 情节逻辑与前后一致, approved in one editor
 * interaction and executed one category after another through the one execution owner.
 *
 * Schema revision 24 carries seven additive relations beside the three kind-coupled analysis relations
 * it rebuilds. Every one of them is append-only — a review record is evidence — and every evidence row
 * carries its canonical JSON and digest:
 *
 * - `review_runs`: the Run as prepared — 第 N 次 of its Book, the manuscript binding, the scope, and the
 *   snapshot of every selected category's configuration entry, basis statement, executor, mode, Task
 *   and plan digest, beside the configuration's digest (REV-012).
 * - `review_run_authorizations`: the editor's one approval, naming the exact plan digest approved for
 *   every Task-backed category.
 * - `review_run_category_events`: what became of each category — dispatched, settled, failed,
 *   interrupted, refused, materialized. A category's state is its last event.
 * - `review_findings`: every located finding of a materialized category, with the Editorial Mark it
 *   became — or `anchor-changed` when the words it points at no longer stand. A finding and its mark
 *   are one record family (MARK-010): the finding's status is derived from the mark and never stored,
 *   and a finding a later Run finds again is the same record, so it names the same mark.
 * - `review_finding_dispositions`: 忽略并说明, with its required reason (REV-004).
 * - `quality_signals`: the minimal Quality Signal an ignored finding records (REV-004).
 * - `review_reports`: the versioned 审阅报告 (REV-009).
 *
 * Nothing existing moves (ADR 0079: an additive revision keeps the same Data Version). The relations are
 * created shape-detected in `EditorialStore.open` before `initializeTaskAuthorizationSchema` stamps the
 * version, exactly as revisions 21 to 23 add theirs, and join the exact-schema validator the same way.
 */
export const REVIEW_RUN_SCHEMA_SQL = {
  review_runs: `CREATE TABLE review_runs (
  review_run_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
  manuscript_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
  working_digest TEXT NOT NULL CHECK(length(working_digest) = 64),
  scope_kind TEXT NOT NULL CHECK(scope_kind IN ('whole', 'chapters', 'changed', 'selection')),
  selected_start_position INTEGER CHECK(selected_start_position IS NULL OR selected_start_position >= 1),
  selected_end_position INTEGER CHECK(selected_end_position IS NULL OR selected_end_position >= selected_start_position),
  configuration_digest TEXT NOT NULL CHECK(length(configuration_digest) = 64),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  CHECK((scope_kind IN ('chapters', 'selection')) = (selected_start_position IS NOT NULL)),
  CHECK((selected_start_position IS NULL) = (selected_end_position IS NULL)),
  UNIQUE(book_id, ordinal)
) STRICT`,
  review_run_authorizations: `CREATE TABLE review_run_authorizations (
  review_run_id TEXT PRIMARY KEY REFERENCES review_runs(review_run_id),
  authorized_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64)
) STRICT`,
  review_run_category_events: `CREATE TABLE review_run_category_events (
  event_id TEXT PRIMARY KEY,
  review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  category_id TEXT NOT NULL CHECK(length(category_id) BETWEEN 1 AND 48),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  state TEXT NOT NULL CHECK(state IN ('dispatched', 'settled', 'failed', 'interrupted', 'refused', 'materialized')),
  detail TEXT NOT NULL CHECK(length(detail) > 0),
  run_record_id TEXT REFERENCES analysis_run_records(run_record_id),
  result_set_revision_id TEXT REFERENCES analysis_result_set_revisions(revision_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  CHECK(state NOT IN ('dispatched', 'settled') OR run_record_id IS NOT NULL),
  CHECK(state NOT IN ('settled', 'materialized') OR result_set_revision_id IS NOT NULL),
  UNIQUE(review_run_id, category_id, sequence)
) STRICT`,
  review_findings: `CREATE TABLE review_findings (
  review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  finding_id TEXT NOT NULL CHECK(length(finding_id) = 28 AND substr(finding_id, 1, 4) = 'rvf_'),
  category_id TEXT NOT NULL CHECK(length(category_id) BETWEEN 1 AND 48),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  kind_ref TEXT NOT NULL CHECK(length(kind_ref) BETWEEN 1 AND 64),
  severity TEXT NOT NULL CHECK(severity IN ('must', 'should', 'note')),
  output TEXT NOT NULL CHECK(output IN ('change-suggestion', 'annotation')),
  risk_point INTEGER NOT NULL CHECK(risk_point IN (0, 1)),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
  to_grapheme INTEGER NOT NULL CHECK(to_grapheme > from_grapheme),
  quote TEXT NOT NULL CHECK(length(quote) > 0),
  note TEXT NOT NULL CHECK(length(note) > 0),
  replacement TEXT,
  clause_ref TEXT,
  state_line TEXT,
  mark_id TEXT REFERENCES editorial_marks(mark_id),
  anchor TEXT NOT NULL CHECK(anchor IN ('marked', 'anchor-changed')),
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  CHECK((anchor = 'marked') = (mark_id IS NOT NULL)),
  CHECK((output = 'change-suggestion') = (replacement IS NOT NULL)),
  CHECK(risk_point = 0 OR output = 'annotation'),
  PRIMARY KEY(review_run_id, finding_id),
  UNIQUE(review_run_id, ordinal)
) STRICT`,
  review_finding_dispositions: `CREATE TABLE review_finding_dispositions (
  disposition_id TEXT PRIMARY KEY,
  review_run_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  disposition TEXT NOT NULL CHECK(disposition = 'ignored'),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  FOREIGN KEY(review_run_id, finding_id) REFERENCES review_findings(review_run_id, finding_id),
  UNIQUE(review_run_id, finding_id, ordinal)
) STRICT`,
  quality_signals: `CREATE TABLE quality_signals (
  signal_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  kind TEXT NOT NULL CHECK(kind = 'review-finding-ignored'),
  review_run_id TEXT NOT NULL,
  category_id TEXT NOT NULL CHECK(length(category_id) BETWEEN 1 AND 48),
  finding_id TEXT NOT NULL,
  disposition_id TEXT NOT NULL UNIQUE REFERENCES review_finding_dispositions(disposition_id),
  mark_id TEXT REFERENCES editorial_marks(mark_id),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  FOREIGN KEY(review_run_id, finding_id) REFERENCES review_findings(review_run_id, finding_id)
) STRICT`,
  review_reports: `CREATE TABLE review_reports (
  report_id TEXT PRIMARY KEY,
  review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  version INTEGER NOT NULL CHECK(version >= 1),
  generated_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  UNIQUE(review_run_id, version)
) STRICT`,
} as const;

/** Every Review Run relation is a ledger: a row is appended once and never rewritten or removed. */
export const REVIEW_RUN_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(REVIEW_RUN_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'REVIEW_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'REVIEW_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the seven relations, in the exact-schema validator's own spelling. */
export const REVIEW_RUN_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  review_runs: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'manuscript_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  review_run_authorizations: ['review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE'],
  review_run_category_events: [
    'result_set_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE',
    'run_record_id>analysis_run_records.run_record_id:NO ACTION/NO ACTION/NONE',
  ],
  review_findings: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE',
  ],
  review_finding_dispositions: [
    'finding_id>review_findings.finding_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_findings.review_run_id:NO ACTION/NO ACTION/NONE',
  ],
  quality_signals: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'disposition_id>review_finding_dispositions.disposition_id:NO ACTION/NO ACTION/NONE',
    'finding_id>review_findings.finding_id:NO ACTION/NO ACTION/NONE',
    'mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
    'review_run_id>review_findings.review_run_id:NO ACTION/NO ACTION/NONE',
  ],
  review_reports: ['review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE'],
};

export class ReviewRunError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ReviewRunError';
  }
}

export function requireReview(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ReviewRunError(code, message);
}

/**
 * The seven relations and their ledger triggers. Created once and never rebuilt: a store that predates
 * them gains seven empty relations and nothing existing moves. Like revisions 21 to 23 this runs before
 * the version is stamped in `task-authorization.ts` and is shape-detected, so a store that already has
 * them does no work here. On a store older than revision 15 the analysis relations two of them refer to
 * are created after this, by the version stamp's own migration; SQLite resolves a reference when a row
 * uses it, and no row is written before both exist.
 */
export function initializeReviewRunSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'review_runs'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(REVIEW_RUN_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(REVIEW_RUN_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  requireReview(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

// ---- the store ------------------------------------------------------------------------------------

type SqlRow = Record<string, SQLOutputValue>;

const RUN_SCHEMA = 'ai7.review.run/1' as const;
const AUTHORIZATION_SCHEMA = 'ai7.review.run-authorization/1' as const;
const EVENT_SCHEMA = 'ai7.review.category-event/1' as const;
const FINDING_SCHEMA = 'ai7.review.finding/1' as const;
const DISPOSITION_SCHEMA = 'ai7.review.finding-disposition/1' as const;
const QUALITY_SIGNAL_SCHEMA = 'ai7.quality-signal/1' as const;
/** The findings one projection carries; the counts always cover every finding (Appendix 1). */
const MAX_PROJECTED_FINDINGS = 2_000;
const MAX_REASON_CHARACTERS = 500;
const MAX_CHAPTER_TITLE_GRAPHEMES = 40;
const FINDING_ID_PATTERN = /^rvf_[0-9a-f]{24}$/u;
const NO_MANUSCRIPT_REASON = '这本书还没有稿件；导入稿件后才能审阅。' as const;
const RUN_ACTIVE_REASON = '这本书有一次审阅正在进行；结束后才能新建审阅。' as const;
const ORPHANED_RUN_DETAIL = '服务在这一类运行期间停止，运行已中断；已完成单元的结果与缺口保留在该类别的账本中。' as const;
const RISK_POINT_PREFIX = '【需人工复核的风险点】' as const;
const UNSTARTED_DETAIL = '尚未开始；继续审阅时从这一类接着审。' as const;
const UNWRITTEN_DETAIL = '运行已结束，发现尚未标到稿件上；继续审阅时写入。' as const;
const INTERRUPTED_DETAIL = '服务在这一类运行期间停止；继续审阅时记为已中断，再接着审其余类别。' as const;

/** ADR 0066's tiers read as V2-UX-REV-004's severities (ambiguity A3, decided by the slice). */
const FACTUAL_TIER_SEVERITY: Readonly<Record<FactualSeverityTier, ReviewFindingSeverity>> = { A: 'must', B: 'should', C: 'note' };

const PROVIDER_STATUS_LABELS: Readonly<Record<string, string>> = {
  'remote-denied-local-deterministic': '远程模型绑定被拒绝（0 次实时传输）；由 AI7 本地确定性模型适配器执行',
  'remote-denied-no-route': '远程模型绑定被拒绝，且没有可执行的本地路由；授权后会在派发前阻止',
  'remote-eligible-developer-live': 'developer-live：实时传输受运行边界约束',
};

function text(value: SQLOutputValue | undefined): string {
  requireReview(typeof value === 'string', 'REVIEW_RECORD_INVALID', '审阅记录无效。');
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  requireReview(typeof value === 'number' && Number.isSafeInteger(value), 'REVIEW_RECORD_INVALID', '审阅记录无效。');
  return value;
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : text(value);
}

/** One transaction, or the caller's when one is already open: every write here is part of the caller's. */
function transact<T>(db: DatabaseSync, operation: () => T): T {
  if (db.isTransaction) return operation();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Review ledger transaction rollback failed.');
    }
    throw error;
  }
}

function recordOf(json: string, sha256: string): Readonly<Record<string, unknown>> {
  requireReview(sha256Hex(json) === sha256, 'REVIEW_RECORD_INVALID', '审阅记录与其摘要不一致。');
  const record = parseCanonicalJson(json);
  requireReview(isRecord(record), 'REVIEW_RECORD_INVALID', '审阅记录无效。');
  return record;
}

/**
 * What a category's Task froze, as the plan screen states it: how many units it reads and reuses, the
 * revision it reads, and the route, provider status and ceiling its envelope binds.
 */
function planSummary(projection: AnalysisProjection): ReviewRunCategoryPlanProjection {
  const manifest = projection.coverageManifest;
  const provider = projection.providerResolutionPlan;
  const envelope = projection.planEnvelope;
  const checkpoint = projection.checkpoint;
  requireReview(manifest !== null && provider !== null && envelope !== null && checkpoint !== null, 'REVIEW_PLAN_UNAVAILABLE', '类别的计划尚未冻结。');
  const counts = projection.update?.reusePlan?.counts ?? null;
  // Only a scope plan (`ai7.analysis.reuse-plan/2`) states the units it leaves unreviewed.
  const unreviewed = counts !== null && 'unreviewed' in counts && typeof counts.unreviewed === 'number' ? counts.unreviewed : 0;
  const route = provider.executionRoute;
  const ceiling = provider.runBudgetCeiling;
  return {
    units: manifest.units.length,
    recomputed: counts === null ? manifest.units.length : counts.recomputed,
    reused: counts === null ? 0 : counts.reused,
    unreviewed,
    taskInputRevisionLabel: checkpoint.revisionLabel,
    routeLabel: route.kind === 'ai7-local-deterministic'
      ? `AI7 本地确定性模型适配器 · 夹具 ${route.fixtureIdentity}`
      : route.kind === 'opencode-go' ? `${route.kind} · ${route.model}` : '没有可执行的本地路由',
    providerStatusLabel: PROVIDER_STATUS_LABELS[envelope.providerStatus] ?? envelope.providerStatus,
    budgetCeilingLabel: ceiling === 'unset' ? '未设置任务预算上限' : `任务运行预算上限：${ceiling.maxTotalTokens} tokens`,
  };
}

function boundedTitle(title: string): string {
  return graphemeCount(title) <= MAX_CHAPTER_TITLE_GRAPHEMES ? title : `${sliceGraphemes(title, 0, MAX_CHAPTER_TITLE_GRAPHEMES - 1)}…`;
}

/**
 * The ledgers a Review Run's categories are executed on. The store that owns them hands them over, so
 * this module never constructs a ledger or a kind definition of its own: a Task-backed category's
 * ledger is its own kind's — built from the configuration entry the Run snapshotted — or the factual
 * kind's, and the leads read the baseline's.
 */
export interface ReviewRunLedgers {
  ledgerOf(entry: ReviewCategoryConfigurationEntry): BaselineAnalysisStore;
  baseline(): BaselineAnalysisStore;
}

/** One category as a Review Run froze it. */
interface SnapshotCategory {
  readonly position: number;
  readonly categoryId: string;
  readonly executor: ReviewCategoryExecutor;
  /** The whole configuration entry: what a finished review keeps naming after the configuration moves on (REV-012). */
  readonly entry: ReviewCategoryConfigurationEntry;
  readonly basisStatement: string;
  /** The block range the leads are read over for 选章; `null` everywhere else. */
  readonly selectedRange: ReviewBlockRange | null;
  /** The category's Task; `null` for the leads. */
  readonly task: null | {
    readonly kind: string;
    readonly taskIntentId: string;
    readonly mode: AnalysisTaskMode;
    readonly modeLabel: string;
    readonly planEnvelopeDigest: string;
    readonly plan: ReviewRunCategoryPlanProjection;
  };
}

/** The canonical record of `review_runs`. */
interface RunSnapshot {
  readonly schema: typeof RUN_SCHEMA;
  readonly reviewRunId: string;
  readonly bookId: string;
  readonly ordinal: number;
  readonly createdAt: string;
  readonly manuscript: { readonly manuscriptId: string; readonly branchId: string; readonly revisionId: string; readonly revisionLabel: string; readonly journalSequence: number; readonly workingDigest: string };
  readonly scope: { readonly kind: ReviewScopeKind; readonly label: string; readonly selectedRange: ReviewBlockRange | null };
  readonly configuration: { readonly schema: string; readonly version: string; readonly digest: string };
  readonly categories: ReadonlyArray<SnapshotCategory>;
}

interface CategoryEvent {
  readonly sequence: number;
  readonly state: ReviewRunCategoryEventState;
  readonly detail: string;
  readonly runRecordId: string | null;
  readonly resultSetRevisionId: string | null;
  readonly record: Readonly<Record<string, unknown>>;
}

interface ManuscriptHead {
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly journalSequence: number;
  readonly workingDigest: string;
  readonly totalBlocks: number;
}

interface ChapterOptions {
  readonly basis: 'outline' | 'analysis-units';
  readonly chapters: ReadonlyArray<ReviewChapterOptionProjection>;
}

interface BaselineReading {
  readonly revision: BaselineAnalysisResultSetRevisionProjection | null;
  readonly error: string | null;
}

/** What one category of the configuration can do now, read once per projection or preparation. */
interface CategoryReading {
  readonly entry: ReviewCategoryConfigurationEntry;
  /** Why the category cannot run at all now; `null` when it can. */
  readonly unavailableReason: string | null;
  readonly facts: ReviewCategoryLedgerFacts;
  /** The category ledger's projection of its latest Task, when it could be read. */
  readonly projection: AnalysisProjection | null;
}

/** A located finding ready to be written with the mark it becomes. */
interface MaterializedFinding {
  readonly kindRef: string;
  readonly severity: ReviewFindingSeverity;
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  /** The exact words the reviewed revision held at the range: what the mark pins, and what must still stand. */
  readonly pinnedText: string;
  readonly quote: string;
  readonly note: string;
  readonly replacement: string | null;
  readonly clauseId: string | null;
  readonly stateLine: string | null;
  /** The 批注's words on the manuscript; a 修改建议 carries its note as the rationale instead. */
  readonly body: string;
  readonly basis: ReadonlyArray<EditorialMarkBasisProjection>;
}

/** One finding row read back with the mark it names and everything its status is derived from. */
interface FindingView {
  readonly findingId: string;
  readonly categoryId: string;
  readonly ordinal: number;
  readonly kindRef: string;
  readonly severity: ReviewFindingSeverity;
  readonly output: 'change-suggestion' | 'annotation';
  readonly riskPoint: boolean;
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly quote: string;
  readonly note: string;
  readonly replacement: string | null;
  readonly clauseRef: string | null;
  readonly stateLine: string | null;
  readonly markId: string | null;
  readonly markStatus: ReviewMarkStatus | null;
  readonly anchorState: ReviewFindingProjection['anchorState'];
  readonly blockPosition: number | null;
  readonly ignoreReason: string | null;
  readonly status: ReviewFindingStatus;
  readonly statusDetail: string;
}

interface CategoryView {
  readonly category: SnapshotCategory;
  readonly events: ReadonlyArray<CategoryEvent>;
  readonly state: ReviewRunCategoryState;
  readonly detail: string | null;
  readonly pending: boolean;
  readonly materialized: CategoryEvent | null;
}

interface RunView {
  readonly snapshot: RunSnapshot;
  readonly authorization: null | { readonly authorizedAt: string; readonly approvals: ReadonlyMap<string, string> };
  readonly driving: boolean;
  readonly categories: ReadonlyArray<CategoryView>;
  readonly findings: ReadonlyArray<FindingView>;
  readonly state: ReviewRunState;
  readonly canContinue: boolean;
}

export type ReviewRunPrepareInput =
  | { phase: 'start'; bookId: string; categoryIds: ReadonlyArray<string>; scope: ReviewRunScopeRequest; launchPolicy: LaunchPolicyProjection }
  | { phase: 'advance'; workId: string }
  | { phase: 'cancel'; workId: string }
  | { phase: 'cancel-all' };

/** The progress of one cooperative Review Run preparation; `reviewRunId` names the Run once it is written. */
export interface ReviewRunPreparationProgress {
  readonly done: boolean;
  readonly workId: string | null;
  readonly completed: number;
  readonly total: number;
  readonly bookId: string | null;
  readonly reviewRunId: string | null;
}

interface PlannedCategory {
  readonly position: number;
  readonly entry: ReviewCategoryConfigurationEntry;
  readonly plan: Exclude<ReviewCategoryScopePlan, { kind: 'refused' }>;
}

interface PreparationWork {
  readonly workId: string;
  readonly bookId: string;
  readonly launchPolicy: LaunchPolicyProjection;
  readonly scope: ResolvedReviewScope;
  readonly planned: ReadonlyArray<PlannedCategory>;
  readonly prepared: SnapshotCategory[];
  index: number;
  /** The category ledger's own preparation in flight for `planned[index]`. */
  ledgerWorkId: string | null;
}

/**
 * What the drive loop does next for one category (B1, B2). `write` puts the category's findings on the
 * manuscript: the leads, or a settled Task's revision. `start` is the category's turn: its ledger's own
 * authorization, then dispatch. `dispatch` is a ledger Run authorized by an earlier hand-off that never
 * reached the owner. `settle` records what the category's dispatched ledger Run came to.
 */
export type ReviewRunDriveStep =
  | { readonly kind: 'done' }
  | { readonly kind: 'write' }
  | { readonly kind: 'start' }
  | { readonly kind: 'dispatch'; readonly runRecordId: string; readonly ledger: BaselineAnalysisStore }
  | { readonly kind: 'settle' };

/** A category Run authorized on its ledger and ready for the one execution owner. */
export interface ReviewRunHandOff {
  readonly runRecordId: string;
  readonly ledger: BaselineAnalysisStore;
}

const DONE: ReviewRunDriveStep = { kind: 'done' };
const WRITE: ReviewRunDriveStep = { kind: 'write' };
const START: ReviewRunDriveStep = { kind: 'start' };
const SETTLE: ReviewRunDriveStep = { kind: 'settle' };

/** A ledger Run state the Run has left for good. */
const TERMINAL_LEDGER_STATES: ReadonlySet<string> = new Set(['completed', 'completed-with-gaps', 'failed', 'interrupted', 'blocked-before-dispatch']);

/**
 * The Review Run ledger of one Book database and the 审阅 projection over it (Issue #417, Stage B).
 *
 * It never executes anything. Preparing a Run prepares each Task-backed category's Task on that
 * category's own ledger, one after another inside one cooperative job, and then writes the Run (B1).
 * Approving it records the editor's one approval. Executing it is the drive loop's, which asks this
 * store, one step at a time, what a category needs next and records what each step came to — so every
 * durable fact of a Run is written here, and the loop holds nothing a restart would lose (B2).
 *
 * The Runs being driven in this service lifetime are held in memory. That is the one fact a restart
 * must lose: a Run nobody drives any more reads `partial`, and 继续审阅 drives it again.
 */
export class ReviewRunStore {
  readonly #db: DatabaseSync;
  readonly #marks: EditorialMarkStore;
  readonly #ledgers: ReviewRunLedgers;
  readonly #configuration: ReviewCategoryConfiguration;
  readonly #work = new Map<string, PreparationWork>();
  /** The Review Runs being driven in this service lifetime, with the Book each belongs to. */
  readonly #driving = new Map<string, string>();

  constructor(
    db: DatabaseSync,
    marks: EditorialMarkStore,
    ledgers: ReviewRunLedgers,
    configuration: ReviewCategoryConfiguration = BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  ) {
    this.#db = db;
    this.#marks = marks;
    this.#ledgers = ledgers;
    this.#configuration = configuration;
  }

  // ---- preparation --------------------------------------------------------------------------------

  /**
   * One cooperative preparation of a Review Run (B1). `start` validates the selection and the scope
   * against what each category can read now, then prepares the categories' Tasks one per step; the
   * last step writes the Run with the snapshot of every selected category.
   */
  prepare(input: ReviewRunPrepareInput): ReviewRunPreparationProgress {
    if (input.phase === 'cancel-all') {
      for (const workId of Array.from(this.#work.keys())) this.prepare({ phase: 'cancel', workId });
      return { done: true, workId: null, completed: 0, total: 0, bookId: null, reviewRunId: null };
    }
    if (input.phase === 'cancel') {
      const work = this.#work.get(input.workId);
      if (work !== undefined) this.#abandon(work);
      return { done: true, workId: null, completed: 0, total: 0, bookId: null, reviewRunId: null };
    }
    if (input.phase === 'advance') {
      requireReview(UUID_PATTERN.test(input.workId), 'JOB_INVALID', '审阅准备标识无效。');
      const work = this.#work.get(input.workId);
      requireReview(work !== undefined, 'JOB_NOT_FOUND', '审阅准备不存在或已结束。');
      return this.#advance(work);
    }
    const bookId = input.bookId;
    this.#requireBook(bookId);
    const head = this.#head(bookId);
    requireReview(head !== null, 'REVIEW_MANUSCRIPT_ABSENT', NO_MANUSCRIPT_REASON);
    requireReview(!this.#bookIsDriving(bookId), 'REVIEW_RUN_ACTIVE', RUN_ACTIVE_REASON);
    requireReview(Array.isArray(input.categoryIds) && input.categoryIds.length >= 1 && input.categoryIds.length <= this.#configuration.categories.length &&
      new Set(input.categoryIds).size === input.categoryIds.length, 'REVIEW_CATEGORIES_INVALID', '请选择至少一个审阅类别，且不要重复。');
    for (const categoryId of input.categoryIds) {
      requireReview(this.#configuration.categories.some((entry) => entry.categoryId === categoryId), 'REVIEW_CATEGORY_UNKNOWN', '没有这个审阅类别。');
    }
    const chapters = this.#chapterOptions(bookId, head);
    const scope = this.#resolveScope(input.scope, chapters);
    const baseline = this.#readBaseline(bookId);
    // Configuration order is the categories' position in the Run, whatever order they were ticked in.
    const planned = this.#configuration.categories
      .filter((entry) => input.categoryIds.includes(entry.categoryId))
      .map((entry, position): PlannedCategory => {
        const reading = this.#readCategory(bookId, head, entry, baseline, undefined);
        requireReview(reading.unavailableReason === null, 'REVIEW_CATEGORY_UNAVAILABLE', `「${entry.label}」：${reading.unavailableReason ?? ''}`);
        const plan = reviewCategoryScopePlan(entry.executor, entry.unavailableReason, scope, reading.facts);
        requireReview(plan.kind !== 'refused', 'REVIEW_SCOPE_UNAVAILABLE', `「${entry.label}」：${plan.kind === 'refused' ? plan.reason : ''}`);
        return { position: position + 1, entry, plan };
      });
    const work: PreparationWork = {
      workId: randomUUID(),
      bookId,
      launchPolicy: structuredClone(input.launchPolicy),
      scope,
      planned,
      prepared: [],
      index: 0,
      ledgerWorkId: null,
    };
    this.#work.set(work.workId, work);
    return this.#advance(work);
  }

  #advance(work: PreparationWork): ReviewRunPreparationProgress {
    const total = work.planned.filter((planned) => planned.plan.kind === 'task').length + 1;
    const progress = (): ReviewRunPreparationProgress => ({
      done: false,
      workId: work.workId,
      completed: work.prepared.filter((category) => category.task !== null).length,
      total,
      bookId: work.bookId,
      reviewRunId: null,
    });
    try {
      while (work.index < work.planned.length) {
        const planned = work.planned[work.index]!;
        if (planned.plan.kind === 'leads') {
          work.prepared.push(this.#snapshotCategory(planned, null));
          work.index += 1;
          continue;
        }
        const ledger = this.#ledgers.ledgerOf(planned.entry);
        const request = this.#ledgerRequest(work, planned.plan.mode, planned.plan.selectedRange, ledger);
        const result = work.ledgerWorkId === null
          ? ledger.prepare({ ...request, reconfirm: false })
          : ledger.prepare({ phase: 'advance', workId: work.ledgerWorkId });
        if (!result.done) {
          work.ledgerWorkId = result.workId;
          return progress();
        }
        work.ledgerWorkId = null;
        let projection = result.projection;
        requireReview(projection !== null, 'REVIEW_PLAN_UNAVAILABLE', `「${planned.entry.label}」的计划没有准备好。`);
        // A Task an earlier, abandoned preparation froze is prepared again in place. When a material input
        // moved since, the ledger holds a pending Plan Revision; the editor is about to see this plan and
        // approve it, so it is reconfirmed as the next plan version rather than left unauthorizable.
        if (projection.planRevision !== null) {
          requireReview(projection.actions.canReconfirmPlan, 'REVIEW_PLAN_UNAVAILABLE', `「${planned.entry.label}」的计划需要重新准备。`);
          projection = ledger.prepare({ ...request, reconfirm: true }).projection;
          requireReview(projection !== null, 'REVIEW_PLAN_UNAVAILABLE', `「${planned.entry.label}」的计划没有准备好。`);
        }
        requireReview(projection.state === 'prepared' && projection.actions.canAuthorize && projection.taskIntent !== null && projection.planEnvelope !== null,
          'REVIEW_PLAN_UNAVAILABLE', `「${planned.entry.label}」的计划没有准备好。`);
        work.prepared.push(this.#snapshotCategory(planned, projection));
        work.index += 1;
        // One category's plan per step keeps the job cooperative; the next step takes the next one.
        if (work.index < work.planned.length) return progress();
      }
      const reviewRunId = this.#writeRun(work);
      this.#work.delete(work.workId);
      return { done: true, workId: null, completed: total, total, bookId: work.bookId, reviewRunId };
    } catch (error) {
      this.#abandon(work);
      throw error;
    }
  }

  #abandon(work: PreparationWork): void {
    this.#work.delete(work.workId);
    const planned = work.planned[work.index];
    if (work.ledgerWorkId !== null && planned !== undefined) {
      this.#ledgers.ledgerOf(planned.entry).prepare({ phase: 'cancel', workId: work.ledgerWorkId });
    }
  }

  /** The ledger's own start request for one category: the definition's fixed goal for the mode, never a restated one. */
  #ledgerRequest(work: PreparationWork, mode: AnalysisTaskMode, selectedRange: ReviewBlockRange | null, ledger: BaselineAnalysisStore): {
    phase: 'start'; bookId: string; goal: AnalysisGoal; update: { mode: AnalysisTaskMode; selectedRange: ReviewBlockRange | null } | null; launchPolicy: LaunchPolicyProjection;
  } {
    const definition = ledger.definition;
    return {
      phase: 'start',
      bookId: work.bookId,
      goal: definition.mode(mode).goal as AnalysisGoal,
      update: mode === definition.initialMode ? null : { mode, selectedRange },
      launchPolicy: work.launchPolicy,
    };
  }

  #snapshotCategory(planned: PlannedCategory, projection: AnalysisProjection | null): SnapshotCategory {
    return {
      position: planned.position,
      categoryId: planned.entry.categoryId,
      executor: planned.entry.executor,
      entry: planned.entry,
      basisStatement: reviewCategoryBasisStatement(planned.entry),
      selectedRange: planned.plan.kind === 'leads' ? planned.plan.selectedRange : null,
      task: projection === null ? null : {
        kind: projection.kind,
        taskIntentId: projection.taskIntent!.taskIntentId,
        mode: projection.taskIntent!.mode,
        modeLabel: projection.taskIntent!.modeLabel,
        planEnvelopeDigest: projection.planEnvelope!.digest,
        plan: planSummary(projection),
      },
    };
  }

  /** The Run as prepared, 第 N 次 of its Book, bound to the manuscript as it stands when the last plan froze. */
  #writeRun(work: PreparationWork): string {
    const head = this.#head(work.bookId);
    requireReview(head !== null, 'REVIEW_MANUSCRIPT_ABSENT', NO_MANUSCRIPT_REASON);
    const reviewRunId = randomUUID();
    const createdAt = new Date().toISOString();
    transact(this.#db, () => {
      const last = this.#db.prepare('SELECT max(ordinal) last FROM review_runs WHERE book_id = ?').get(work.bookId) as SqlRow;
      const ordinal = last.last === null ? 1 : integer(last.last) + 1;
      const snapshot: RunSnapshot = {
        schema: RUN_SCHEMA,
        reviewRunId,
        bookId: work.bookId,
        ordinal,
        createdAt,
        manuscript: {
          manuscriptId: head.manuscriptId,
          branchId: head.branchId,
          revisionId: head.revisionId,
          revisionLabel: head.revisionLabel,
          journalSequence: head.journalSequence,
          workingDigest: head.workingDigest,
        },
        scope: { kind: work.scope.kind, label: reviewScopeLabel(work.scope), selectedRange: work.scope.selectedRange },
        configuration: this.#configurationPin(),
        categories: work.prepared,
      };
      const record = canonicalRecord(snapshot);
      this.#db.prepare(
        `INSERT INTO review_runs(
           review_run_id, book_id, ordinal, manuscript_id, branch_id, manuscript_revision_id, journal_sequence, working_digest,
           scope_kind, selected_start_position, selected_end_position, configuration_digest, created_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(reviewRunId, work.bookId, ordinal, head.manuscriptId, head.branchId, head.revisionId, head.journalSequence, head.workingDigest,
        work.scope.kind, work.scope.selectedRange?.startPosition ?? null, work.scope.selectedRange?.endPosition ?? null,
        snapshot.configuration.digest, createdAt, record.json, record.digest);
    });
    return reviewRunId;
  }

  #configurationPin(): { schema: string; version: string; digest: string } {
    return {
      schema: this.#configuration.schema,
      version: this.#configuration.version,
      digest: reviewCategoryConfigurationDigest(this.#configuration),
    };
  }

  // ---- the one approval ---------------------------------------------------------------------------

  /**
   * The editor's one approval of a prepared Run (B1): every Task-backed category's exact plan digest,
   * recorded once. Each plan must still be the one its category ledger would authorize now — the latest
   * Task, still prepared, with no pending Plan Revision — so an approval never names a plan already
   * stale. The ledgers' own authorizations are written later, one category at a time, when the drive
   * loop reaches each; a plan that moves in between is refused there, with the ledger's reason.
   */
  authorize(bookId: string, reviewRunId: string, planDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>): void {
    const snapshot = this.#runOfBook(bookId, reviewRunId);
    const existing = this.#authorizationOf(reviewRunId);
    const tasks = snapshot.categories.filter((category) => category.task !== null);
    requireReview(Array.isArray(planDigests) && planDigests.every((entry) => isRecord(entry) && hasExactKeys(entry, ['categoryId', 'planEnvelopeDigest']) &&
      typeof entry.categoryId === 'string' && typeof entry.planEnvelopeDigest === 'string' && DIGEST_PATTERN.test(entry.planEnvelopeDigest)),
    'REVIEW_AUTHORIZATION_INVALID', '授权的计划摘要无效。');
    const approved = new Map(planDigests.map((entry) => [entry.categoryId, entry.planEnvelopeDigest] as const));
    requireReview(approved.size === planDigests.length && approved.size === tasks.length &&
      tasks.every((category) => approved.get(category.categoryId) === category.task!.planEnvelopeDigest),
    'REVIEW_AUTHORIZATION_STALE', '授权所依据的计划与这次审阅准备的计划不一致；请重新查看计划。');
    if (existing !== null) return;
    const latest = this.#db.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(bookId) as SqlRow;
    requireReview(text(latest.review_run_id) === reviewRunId, 'REVIEW_RUN_SUPERSEDED', '这次审阅的计划已被之后准备的一次取代；请授权最新的一次。');
    requireReview(!this.#bookIsDriving(bookId), 'REVIEW_RUN_ACTIVE', RUN_ACTIVE_REASON);
    for (const category of tasks) {
      const projection = this.#ledgers.ledgerOf(category.entry).inspect(bookId);
      requireReview(projection.taskIntent?.taskIntentId === category.task!.taskIntentId && projection.state === 'prepared' &&
        projection.actions.canAuthorize && projection.planEnvelope?.digest === category.task!.planEnvelopeDigest,
      'REVIEW_PLAN_CHANGED', `「${category.entry.label}」的计划已经变化；请重新准备这次审阅。`);
    }
    const authorizedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: AUTHORIZATION_SCHEMA,
      reviewRunId,
      authorizedAt,
      actor: 'editor',
      interaction: 'authorize-review-run',
      approvals: tasks.map((category) => ({
        categoryId: category.categoryId,
        taskIntentId: category.task!.taskIntentId,
        planEnvelopeDigest: category.task!.planEnvelopeDigest,
      })),
    });
    this.#db.prepare('INSERT INTO review_run_authorizations(review_run_id, authorized_at, canonical_json, sha256) VALUES (?, ?, ?, ?)')
      .run(reviewRunId, authorizedAt, record.json, record.digest);
  }

  // ---- reading the records ------------------------------------------------------------------------

  #requireBook(bookId: string): void {
    requireReview(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'REVIEW_BOOK_INVALID', '图书标识无效。');
    requireReview(this.#db.prepare('SELECT 1 FROM books WHERE book_id = ?').get(bookId) !== undefined, 'REVIEW_BOOK_NOT_FOUND', '这本书不存在。');
  }

  #run(reviewRunId: string): RunSnapshot {
    requireReview(typeof reviewRunId === 'string' && UUID_PATTERN.test(reviewRunId), 'REVIEW_RUN_INVALID', '审阅记录标识无效。');
    const row = this.#db.prepare('SELECT * FROM review_runs WHERE review_run_id = ?').get(reviewRunId) as SqlRow | undefined;
    requireReview(row !== undefined, 'REVIEW_RUN_NOT_FOUND', '这次审阅不存在。');
    return this.#snapshotOf(row);
  }

  #runOfBook(bookId: string, reviewRunId: string): RunSnapshot {
    this.#requireBook(bookId);
    const snapshot = this.#run(reviewRunId);
    requireReview(snapshot.bookId === bookId, 'REVIEW_RUN_NOT_FOUND', '这次审阅不属于当前图书。');
    return snapshot;
  }

  #snapshotOf(row: SqlRow): RunSnapshot {
    const record = recordOf(text(row.canonical_json), text(row.sha256)) as unknown as RunSnapshot;
    requireReview(record.schema === RUN_SCHEMA && record.reviewRunId === text(row.review_run_id) && record.bookId === text(row.book_id) &&
      record.ordinal === integer(row.ordinal) && Array.isArray(record.categories), 'REVIEW_RECORD_INVALID', '审阅记录无效。');
    return record;
  }

  #authorizationOf(reviewRunId: string): RunView['authorization'] {
    const row = this.#db.prepare('SELECT * FROM review_run_authorizations WHERE review_run_id = ?').get(reviewRunId) as SqlRow | undefined;
    if (row === undefined) return null;
    const record = recordOf(text(row.canonical_json), text(row.sha256));
    const approvals = record.approvals;
    requireReview(Array.isArray(approvals), 'REVIEW_RECORD_INVALID', '审阅授权记录无效。');
    return {
      authorizedAt: text(row.authorized_at),
      approvals: new Map((approvals as ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>).map((entry) => [entry.categoryId, entry.planEnvelopeDigest] as const)),
    };
  }

  #events(reviewRunId: string, categoryId: string): CategoryEvent[] {
    return (this.#db.prepare(
      'SELECT * FROM review_run_category_events WHERE review_run_id = ? AND category_id = ? ORDER BY sequence',
    ).all(reviewRunId, categoryId) as SqlRow[]).map((row) => ({
      sequence: integer(row.sequence),
      state: text(row.state) as ReviewRunCategoryEventState,
      detail: text(row.detail),
      runRecordId: nullableText(row.run_record_id),
      resultSetRevisionId: nullableText(row.result_set_revision_id),
      record: recordOf(text(row.canonical_json), text(row.sha256)),
    }));
  }

  /** Append one event to a category's history, the next in its sequence. */
  #recordEvent(
    reviewRunId: string,
    categoryId: string,
    state: ReviewRunCategoryEventState,
    detail: string,
    facts: { runRecordId?: string | null; resultSetRevisionId?: string | null; extra?: Readonly<Record<string, unknown>> } = {},
  ): void {
    transact(this.#db, () => {
      const last = this.#db.prepare('SELECT max(sequence) last FROM review_run_category_events WHERE review_run_id = ? AND category_id = ?')
        .get(reviewRunId, categoryId) as SqlRow;
      const sequence = last.last === null ? 1 : integer(last.last) + 1;
      const eventId = randomUUID();
      const recordedAt = new Date().toISOString();
      const runRecordId = facts.runRecordId ?? null;
      const resultSetRevisionId = facts.resultSetRevisionId ?? null;
      const record = canonicalRecord({
        schema: EVENT_SCHEMA,
        eventId,
        reviewRunId,
        categoryId,
        sequence,
        state,
        detail,
        runRecordId,
        resultSetRevisionId,
        recordedAt,
        ...(facts.extra ?? {}),
      });
      this.#db.prepare(
        `INSERT INTO review_run_category_events(
           event_id, review_run_id, category_id, sequence, state, detail, run_record_id, result_set_revision_id, recorded_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(eventId, reviewRunId, categoryId, sequence, state, detail, runRecordId, resultSetRevisionId, recordedAt, record.json, record.digest);
    });
  }

  /** The ledger Run of a category's Task, once one was authorized. */
  #runRecordOf(taskIntentId: string): string | null {
    const row = this.#db.prepare('SELECT run_record_id FROM analysis_run_records WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    return row === undefined ? null : text(row.run_record_id);
  }

  #bookIsDriving(bookId: string): boolean {
    for (const drivenBookId of this.#driving.values()) if (drivenBookId === bookId) return true;
    return false;
  }

  // ---- the drive loop's steps (B1, B2) ------------------------------------------------------------

  /**
   * The drive loop takes an approved Run: it is driven in this lifetime until `endDrive`, and no other
   * Run of the same Book is. Returns the Run's categories in position order.
   */
  beginDrive(reviewRunId: string): ReadonlyArray<string> {
    const snapshot = this.#run(reviewRunId);
    requireReview(this.#authorizationOf(reviewRunId) !== null, 'REVIEW_RUN_NOT_AUTHORIZED', '这次审阅尚未授权。');
    requireReview(!this.#driving.has(reviewRunId), 'REVIEW_RUN_ACTIVE', '这次审阅已在进行。');
    requireReview(!this.#bookIsDriving(snapshot.bookId), 'REVIEW_RUN_ACTIVE', RUN_ACTIVE_REASON);
    this.#driving.set(reviewRunId, snapshot.bookId);
    return snapshot.categories.map((category) => category.categoryId);
  }

  endDrive(reviewRunId: string): void {
    this.#driving.delete(reviewRunId);
  }

  isDriving(reviewRunId: string): boolean {
    return this.#driving.has(reviewRunId);
  }

  #category(reviewRunId: string, categoryId: string): { snapshot: RunSnapshot; category: SnapshotCategory } {
    const snapshot = this.#run(reviewRunId);
    const category = snapshot.categories.find((candidate) => candidate.categoryId === categoryId);
    requireReview(category !== undefined, 'REVIEW_CATEGORY_UNKNOWN', '这次审阅没有这个类别。');
    return { snapshot, category };
  }

  /**
   * What one category needs next. It is read from the records alone — the category's events and its
   * ledger Run — so after a restart the same question gets the answer the lost loop would have had: a
   * category never started starts, one whose ledger Run finished is settled from that Run's record, and
   * one settled but not yet written is written.
   */
  step(reviewRunId: string, categoryId: string): ReviewRunDriveStep {
    const { category } = this.#category(reviewRunId, categoryId);
    const last = this.#events(reviewRunId, categoryId).at(-1)?.state ?? null;
    if (last !== null && TERMINAL_CATEGORY_EVENTS.has(last)) return DONE;
    if (category.task === null || last === 'settled') return WRITE;
    if (last === 'dispatched') return SETTLE;
    const runRecordId = this.#runRecordOf(category.task.taskIntentId);
    if (runRecordId === null) return START;
    // An earlier hand-off reached the ledger and not the owner, or the owner and not this history.
    const ledger = this.#ledgers.ledgerOf(category.entry);
    return ledger.currentRunState(runRecordId) === 'authorized' ? { kind: 'dispatch', runRecordId, ledger } : SETTLE;
  }

  /**
   * The category's turn (B1): its ledger's own standard authorization of the exact plan the editor
   * approved, written only now — so at most one category is ever authorized and not yet dispatched, and
   * only for as long as the caller takes to hand it to the owner. A plan that moved since the approval
   * is refused by the ledger, and the category is recorded `refused` with the ledger's reason.
   */
  start(reviewRunId: string, categoryId: string): ReviewRunHandOff | null {
    const { snapshot, category } = this.#category(reviewRunId, categoryId);
    requireReview(category.task !== null, 'REVIEW_CATEGORY_NOT_TASK_BACKED', '这一类没有任务。');
    const approved = this.#authorizationOf(reviewRunId)?.approvals.get(categoryId);
    requireReview(approved !== undefined, 'REVIEW_RUN_NOT_AUTHORIZED', '这次审阅尚未授权这一类的计划。');
    const ledger = this.#ledgers.ledgerOf(category.entry);
    let dispatchRunRecordId: string | null;
    try {
      dispatchRunRecordId = ledger.authorize(snapshot.bookId, category.task.taskIntentId, approved).dispatchRunRecordId;
    } catch (error) {
      if (!(error instanceof AnalysisError)) throw error;
      this.#recordEvent(reviewRunId, categoryId, 'refused', error.message, { extra: { code: error.code } });
      return null;
    }
    if (dispatchRunRecordId !== null) return { runRecordId: dispatchRunRecordId, ledger };
    // No Run to hand over: this launch cannot execute the plan and the ledger blocked it before dispatch,
    // or an earlier hand-off already authorized it. Its own record says which.
    const runRecordId = this.#runRecordOf(category.task.taskIntentId);
    if (runRecordId !== null && ledger.currentRunState(runRecordId) === 'authorized') return { runRecordId, ledger };
    this.settle(reviewRunId, categoryId);
    return null;
  }

  recordDispatch(reviewRunId: string, categoryId: string, runRecordId: string): void {
    this.#category(reviewRunId, categoryId);
    this.#recordEvent(reviewRunId, categoryId, 'dispatched', '已进入 AI7 调度器（单槽位）。', { runRecordId });
  }

  /**
   * The owner refused a Run this Review Run authorized on the category's ledger. The ledger Run is
   * ended there — never left authorized and undispatched, which would block the category's next Task —
   * as `interrupted` when the service is stopping and `failed` otherwise, and the category with it.
   */
  refuseDispatch(reviewRunId: string, categoryId: string, runRecordId: string, code: string, message: string): void {
    const { category } = this.#category(reviewRunId, categoryId);
    const ledger = this.#ledgers.ledgerOf(category.entry);
    const stopping = code === 'EXECUTION_STOPPING';
    const detail = stopping ? `服务正在停止，这一类的运行没有开始（${code}）。` : `运行未能进入调度（${code}）：${message}`;
    transact(this.#db, () => {
      if (ledger.currentRunState(runRecordId) === 'authorized') ledger.recordRunState(runRecordId, stopping ? 'interrupted' : 'failed', { detail, code });
      this.#recordEvent(reviewRunId, categoryId, stopping ? 'interrupted' : 'failed', detail, { runRecordId, extra: { code } });
    });
  }

  /**
   * What the category's ledger Run came to, recorded as the category's event. The drive loop asks only
   * once the owner is idle, so a ledger Run still admitted or executing then is one a stopped service
   * left behind: it is ended on its ledger as `interrupted` — the category can then be prepared again —
   * and recorded so.
   */
  settle(reviewRunId: string, categoryId: string): void {
    const { category } = this.#category(reviewRunId, categoryId);
    requireReview(category.task !== null, 'REVIEW_CATEGORY_NOT_TASK_BACKED', '这一类没有任务。');
    const runRecordId = this.#runRecordOf(category.task.taskIntentId);
    requireReview(runRecordId !== null, 'REVIEW_RECORD_INVALID', '这一类的运行记录缺失。');
    const ledger = this.#ledgers.ledgerOf(category.entry);
    const state = ledger.currentRunState(runRecordId);
    if (state === 'authorized') return;
    transact(this.#db, () => {
      const events = this.#events(reviewRunId, categoryId);
      if (events.some((event) => TERMINAL_CATEGORY_EVENTS.has(event.state) || event.state === 'settled')) return;
      if (state !== 'blocked-before-dispatch' && !events.some((event) => event.state === 'dispatched')) {
        this.#recordEvent(reviewRunId, categoryId, 'dispatched', '已进入 AI7 调度器（单槽位）。', { runRecordId });
      }
      const outcome = this.#db.prepare('SELECT classification, result_set_revision_id, canonical_json, sha256 FROM analysis_task_outcomes WHERE run_record_id = ?')
        .get(runRecordId) as SqlRow | undefined;
      const summary = outcome === undefined ? null : recordOf(text(outcome.canonical_json), text(outcome.sha256)).summary;
      const outcomeSummary = typeof summary === 'string' ? summary : null;
      if (state === 'completed' || state === 'completed-with-gaps') {
        const revisionId = outcome === undefined ? null : nullableText(outcome.result_set_revision_id);
        if (revisionId === null) {
          this.#recordEvent(reviewRunId, categoryId, 'failed', '运行已结束，但没有形成结果集修订版。', { runRecordId });
          return;
        }
        this.#recordEvent(reviewRunId, categoryId, 'settled',
          state === 'completed' ? '已形成结果集修订版。' : '已形成结果集修订版 · 有缺口单元。', { runRecordId, resultSetRevisionId: revisionId });
      } else if (state === 'failed') {
        this.#recordEvent(reviewRunId, categoryId, 'failed', outcomeSummary ?? '运行失败。', { runRecordId });
      } else if (state === 'interrupted') {
        this.#recordEvent(reviewRunId, categoryId, 'interrupted', outcomeSummary ?? '运行已中断。', { runRecordId });
      } else if (state === 'blocked-before-dispatch') {
        const last = this.#db.prepare('SELECT canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1')
          .get(runRecordId) as SqlRow;
        const detail = recordOf(text(last.canonical_json), text(last.sha256)).detail;
        this.#recordEvent(reviewRunId, categoryId, 'refused', `授权已记录，派发前阻止：${typeof detail === 'string' ? detail : '当前启动没有可执行的路由。'}`, { runRecordId });
      } else {
        ledger.recordRunState(runRecordId, 'interrupted', { detail: ORPHANED_RUN_DETAIL });
        this.#recordEvent(reviewRunId, categoryId, 'interrupted', ORPHANED_RUN_DETAIL, { runRecordId });
      }
    });
  }

  /**
   * A step of the loop failed for a reason no step records itself. The category is recorded `failed`
   * unless it already finished; a ledger Run it authorized and never handed over is ended too.
   */
  fail(reviewRunId: string, categoryId: string, code: string, message: string): void {
    const { category } = this.#category(reviewRunId, categoryId);
    transact(this.#db, () => {
      const last = this.#events(reviewRunId, categoryId).at(-1)?.state ?? null;
      if (last !== null && TERMINAL_CATEGORY_EVENTS.has(last)) return;
      const detail = `这一类未能完成（${code}）：${message}`;
      const runRecordId = category.task === null ? null : this.#runRecordOf(category.task.taskIntentId);
      if (runRecordId !== null) {
        const ledger = this.#ledgers.ledgerOf(category.entry);
        if (ledger.currentRunState(runRecordId) === 'authorized') ledger.recordRunState(runRecordId, 'failed', { detail, code });
      }
      this.#recordEvent(reviewRunId, categoryId, 'failed', detail, { runRecordId, extra: { code } });
    });
  }

  // ---- materialization (B4) -----------------------------------------------------------------------

  /** Put one category's findings on the manuscript: the leads, or the revision its settled Task formed. */
  write(reviewRunId: string, categoryId: string): void {
    const { snapshot, category } = this.#category(reviewRunId, categoryId);
    if (category.task === null) {
      this.#writeLeads(snapshot, category);
      return;
    }
    const settled = this.#events(reviewRunId, categoryId).find((event) => event.state === 'settled');
    requireReview(settled !== undefined && settled.resultSetRevisionId !== null, 'REVIEW_RECORD_INVALID', '这一类还没有可写入的结果集修订版。');
    const ledger = this.#ledgers.ledgerOf(category.entry);
    const inspected = ledger.inspect(snapshot.bookId, undefined, settled.resultSetRevisionId).inspectedRevision;
    requireReview(inspected !== null, 'REVIEW_RECORD_INVALID', '这一类的结果集修订版缺失。');
    const revision = inspected.revision;
    const blocks = new Map(ledger.readRevisionBlocks(revision.manuscriptPin.manuscriptId, revision.manuscriptPin.revisionId)
      .map((block) => [block.blockId, block.text] as const));
    // A Run's findings are the ones of the units it read. A unit it reused is an earlier Run's reading,
    // and a unit it left out of scope was not read at all.
    const recomputed = new Set(revision.lineage.filter((unit) => unit.kind === 'recomputed').map((unit) => unit.unitOrdinal));
    const read = (finding: { unitOrdinal: number; mergedFrom: ReadonlyArray<{ unitOrdinal: number }> }): boolean =>
      recomputed.has(finding.unitOrdinal) || finding.mergedFrom.some((merged) => recomputed.has(merged.unitOrdinal));
    const pinned = (blockId: string, fromGrapheme: number, toGrapheme: number): string => {
      const blockText = blocks.get(blockId);
      requireReview(blockText !== undefined, 'REVIEW_RECORD_INVALID', '发现所在的内容块不在该修订版中。');
      return sliceGraphemes(blockText, fromGrapheme, toGrapheme);
    };
    let findings: MaterializedFinding[];
    let excludedCount: number;
    if (category.executor === 'factual-review-kind') {
      const factual = revision as FactualReviewResultSetRevisionProjection;
      findings = factual.findings.filter(read).map((finding) => ({
        kindRef: finding.findingId,
        severity: FACTUAL_TIER_SEVERITY[finding.severity],
        blockId: finding.sourceRange.blockId,
        fromGrapheme: finding.sourceRange.fromGrapheme,
        toGrapheme: finding.sourceRange.toGrapheme,
        pinnedText: pinned(finding.sourceRange.blockId, finding.sourceRange.fromGrapheme, finding.sourceRange.toGrapheme),
        quote: finding.quote,
        note: finding.question,
        replacement: null,
        clauseId: null,
        // Model knowledge is not evidence: until the research path exists (S70) the verdict says so.
        stateLine: finding.verdict,
        body: `【${finding.verdict}】${finding.question}`,
        basis: [{ label: `可核查依据 · ${finding.category}`, blockId: null, fromGrapheme: null, toGrapheme: null, quote: finding.basis }],
      }));
      excludedCount = factual.excluded.filter((excluded) => recomputed.has(excluded.unitOrdinal)).length;
    } else {
      const review = revision as ReviewCategoryResultSetRevisionProjection;
      findings = review.findings.filter(read).map((finding) => ({
        kindRef: finding.findingId,
        severity: finding.severity,
        blockId: finding.sourceRange.blockId,
        fromGrapheme: finding.sourceRange.fromGrapheme,
        toGrapheme: finding.sourceRange.toGrapheme,
        pinnedText: pinned(finding.sourceRange.blockId, finding.sourceRange.fromGrapheme, finding.sourceRange.toGrapheme),
        quote: finding.quote,
        note: finding.note,
        replacement: finding.replacement,
        clauseId: finding.clauseId,
        stateLine: null,
        body: category.entry.riskPointsOnly ? `${RISK_POINT_PREFIX}${finding.note}` : finding.note,
        basis: this.#clauseBasis(category.entry, finding.clauseId),
      }));
      excludedCount = review.excluded.filter((excluded) => recomputed.has(excluded.unitOrdinal)).length;
    }
    this.#writeFindings(snapshot, category, findings, {
      runRecordId: settled.runRecordId,
      resultSetRevisionId: settled.resultSetRevisionId,
      excludedCount,
      adapterPin: { route: revision.adapterPin.route, model: revision.adapterPin.model, fixtureIdentity: revision.adapterPin.fixtureIdentity, fixtureSha256: revision.adapterPin.fixtureSha256 },
    });
  }

  /**
   * The basis a finding cites (REV-005): the guideline clause it named, or — when it named none — the
   * guideline documents its category applies.
   */
  #clauseBasis(entry: ReviewCategoryConfigurationEntry, clauseId: string | null): EditorialMarkBasisProjection[] {
    for (const document of entry.guidelineDocuments) {
      const clause = document.clauses.find((candidate) => candidate.clauseId === clauseId);
      if (clause !== undefined) {
        return [{ label: `条款 ${clause.clauseId} · ${document.title}（第 ${document.version} 版）`, blockId: null, fromGrapheme: null, toGrapheme: null, quote: clause.text }];
      }
    }
    return entry.guidelineDocuments.map((document) => ({
      label: `依据 · ${document.issuer} · ${document.title}（第 ${document.version} 版）`, blockId: null, fromGrapheme: null, toGrapheme: null, quote: null,
    }));
  }

  /**
   * The leads of 情节逻辑与前后一致, model-free (B5, REV-011): read at the category's turn from the
   * baseline's latest revision, each anchored at its first source range — a whole block when the range
   * names none — in the text that revision read. 选章 keeps the leads anchored in the chosen chapters.
   */
  #writeLeads(snapshot: RunSnapshot, category: SnapshotCategory): void {
    const baseline = this.#ledgers.baseline();
    const revision = (baseline.inspect(snapshot.bookId) as BaselineAnalysisProjection).resultSetRevision;
    if (revision === null) {
      this.#recordEvent(snapshot.reviewRunId, category.categoryId, 'refused', LEADS_ABSENT_REASON);
      return;
    }
    const blocks = new Map(baseline.readRevisionBlocks(revision.manuscriptPin.manuscriptId, revision.manuscriptPin.revisionId)
      .map((block) => [block.blockId, block] as const));
    const working = new Map((this.#db.prepare('SELECT block_id, position FROM working_blocks WHERE branch_id = ?').all(snapshot.manuscript.branchId) as SqlRow[])
      .map((row) => [text(row.block_id), integer(row.position)] as const));
    const range = category.selectedRange;
    const findings: MaterializedFinding[] = [];
    let excludedCount = 0;
    for (const lead of reviewLeadsOf(revision)) {
      const anchor = lead.ranges[0];
      const block = anchor === undefined ? undefined : blocks.get(anchor.blockId);
      if (anchor === undefined || block === undefined) {
        excludedCount += 1;
        continue;
      }
      if (range !== null) {
        const position = working.get(anchor.blockId);
        if (position === undefined || position < range.startPosition || position > range.endPosition) continue;
      }
      const fromGrapheme = anchor.fromGrapheme ?? 0;
      const toGrapheme = anchor.toGrapheme ?? block.graphemes;
      if (toGrapheme <= fromGrapheme || toGrapheme > block.graphemes) {
        excludedCount += 1;
        continue;
      }
      const pinnedText = sliceGraphemes(block.text, fromGrapheme, toGrapheme);
      findings.push({
        kindRef: lead.leadId,
        severity: lead.severity,
        blockId: anchor.blockId,
        fromGrapheme,
        toGrapheme,
        pinnedText,
        quote: reportQuote(pinnedText),
        note: lead.description,
        replacement: null,
        clauseId: null,
        stateLine: null,
        body: reviewLeadBody(lead),
        basis: lead.ranges.map((source) => {
          const sourceBlock = blocks.get(source.blockId);
          const bounded = sourceBlock !== undefined && source.fromGrapheme !== null && source.toGrapheme !== null
            ? sliceGraphemes(sourceBlock.text, source.fromGrapheme, source.toGrapheme)
            : null;
          return {
            label: sourceBlock === undefined ? '线索来源' : `线索来源 · 内容块 ${sourceBlock.position}`,
            blockId: source.blockId,
            fromGrapheme: source.fromGrapheme,
            toGrapheme: source.toGrapheme,
            quote: bounded !== null && bounded.length > 0 && graphemeCount(bounded) <= 80 ? bounded : null,
          };
        }),
      });
    }
    this.#writeFindings(snapshot, category, findings, {
      runRecordId: null,
      resultSetRevisionId: revision.revisionId,
      excludedCount,
      adapterPin: { route: revision.adapterPin.route, model: revision.adapterPin.model, fixtureIdentity: revision.adapterPin.fixtureIdentity, fixtureSha256: revision.adapterPin.fixtureSha256 },
    });
  }

  /**
   * One category's findings and marks in ONE transaction, with the `materialized` event (B4). Every
   * finding becomes a produced mark written together with its row; a finding whose words no longer
   * stand is written `anchor-changed` with no mark instead of failing the category; a finding an
   * earlier Review Run of this Book already put on the manuscript is the same record and names that
   * mark again (MARK-010), so a finding found twice is never marked twice. A category with a
   * `materialized` event is never written again, and a crash anywhere in here rolls the whole category
   * back.
   */
  #writeFindings(
    snapshot: RunSnapshot,
    category: SnapshotCategory,
    findings: ReadonlyArray<MaterializedFinding>,
    source: { runRecordId: string | null; resultSetRevisionId: string; excludedCount: number; adapterPin: { route: string; model: string; fixtureIdentity: string | null; fixtureSha256: string | null } },
  ): void {
    const reviewRunId = snapshot.reviewRunId;
    transact(this.#db, () => {
      const events = this.#events(reviewRunId, category.categoryId);
      if (events.some((event) => event.state === 'materialized')) return;
      requireReview(!events.some((event) => TERMINAL_CATEGORY_EVENTS.has(event.state)), 'REVIEW_CATEGORY_FINISHED', '这一类已经结束，不能再写入发现。');
      const earlier = this.#db.prepare(
        `SELECT f.mark_id FROM review_findings f JOIN review_runs r ON r.review_run_id = f.review_run_id
         WHERE r.book_id = ? AND f.category_id = ? AND f.kind_ref = ? AND f.mark_id IS NOT NULL
         ORDER BY r.ordinal DESC, f.ordinal DESC LIMIT 1`,
      );
      const carried = findings.map((finding) => {
        const row = earlier.get(snapshot.bookId, category.categoryId, finding.kindRef) as SqlRow | undefined;
        return row === undefined ? null : text(row.mark_id);
      });
      const fresh = findings.filter((_finding, index) => carried[index] === null);
      this.#marks.createProducedMany(fresh.map((finding) => this.#markInput(snapshot, category, finding)), (created) => {
        let next = 0;
        const markIds = findings.map((_finding, index) => {
          const carriedMarkId = carried[index] ?? null;
          if (carriedMarkId !== null) return carriedMarkId;
          const createdMarkId = created[next] ?? null;
          next += 1;
          return createdMarkId;
        });
        const last = this.#db.prepare('SELECT max(ordinal) last FROM review_findings WHERE review_run_id = ?').get(reviewRunId) as SqlRow;
        let ordinal = last.last === null ? 0 : integer(last.last);
        const insert = this.#db.prepare(
          `INSERT INTO review_findings(
             review_run_id, finding_id, category_id, ordinal, kind_ref, severity, output, risk_point, block_id, from_grapheme, to_grapheme,
             quote, note, replacement, clause_ref, state_line, mark_id, anchor, canonical_json, sha256
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        findings.forEach((finding, index) => {
          ordinal += 1;
          const markId = markIds[index] ?? null;
          const findingId = `rvf_${sha256Hex(`${reviewRunId}\n${category.categoryId}\n${finding.kindRef}`).slice(0, 24)}`;
          const output = category.entry.output;
          const anchor = markId === null ? 'anchor-changed' : 'marked';
          const record = canonicalRecord({
            schema: FINDING_SCHEMA,
            reviewRunId,
            findingId,
            categoryId: category.categoryId,
            ordinal,
            kindRef: finding.kindRef,
            resultSetRevisionId: source.resultSetRevisionId,
            severity: finding.severity,
            output,
            riskPoint: category.entry.riskPointsOnly,
            blockId: finding.blockId,
            fromGrapheme: finding.fromGrapheme,
            toGrapheme: finding.toGrapheme,
            quote: finding.quote,
            note: finding.note,
            replacement: output === 'change-suggestion' ? finding.replacement : null,
            clauseId: finding.clauseId,
            stateLine: finding.stateLine,
            basis: finding.basis,
            markId,
            carried: carried[index] !== null,
            anchor,
          });
          insert.run(reviewRunId, findingId, category.categoryId, ordinal, finding.kindRef, finding.severity, output, category.entry.riskPointsOnly ? 1 : 0,
            finding.blockId, finding.fromGrapheme, finding.toGrapheme, finding.quote, finding.note,
            output === 'change-suggestion' ? finding.replacement : null, finding.clauseId, finding.stateLine, markId, anchor, record.json, record.digest);
        });
        const marked = markIds.filter((markId) => markId !== null).length;
        const changed = findings.length - marked;
        const detail = [
          `已形成 ${findings.length} 条发现：${marked} 条在稿件上`,
          ...(changed > 0 ? [`${changed} 条原文已变，未能标出`] : []),
          ...(source.excludedCount > 0 ? [`另有 ${source.excludedCount} 条未能定位引文，列在排除附录中`] : []),
        ].join('；') + '。';
        this.#recordEvent(reviewRunId, category.categoryId, 'materialized', detail, {
          runRecordId: source.runRecordId,
          resultSetRevisionId: source.resultSetRevisionId,
          extra: {
            findingCount: findings.length,
            markedCount: marked,
            carriedCount: carried.filter((markId) => markId !== null).length,
            anchorChangedCount: changed,
            excludedCount: source.excludedCount,
            adapterPin: source.adapterPin,
          },
        });
      });
    });
  }

  #markInput(snapshot: RunSnapshot, category: SnapshotCategory, finding: MaterializedFinding): ProducedEditorialMarkInput {
    const suggestion = category.entry.output === 'change-suggestion';
    return {
      manuscriptId: snapshot.manuscript.manuscriptId,
      branchId: snapshot.manuscript.branchId,
      blockId: finding.blockId,
      fromGrapheme: finding.fromGrapheme,
      toGrapheme: finding.toGrapheme,
      pinnedText: finding.pinnedText,
      kind: category.entry.output,
      body: suggestion ? '' : finding.body,
      proposedText: suggestion ? finding.replacement : null,
      rationale: suggestion ? finding.note : null,
      atomicGroupId: null,
      source: { kind: 'ai7', origin: 'review-category', label: category.entry.label, taskId: category.task?.taskIntentId ?? null },
      basis: finding.basis,
    };
  }

  // ---- dispositions and the Quality Signal (B7) ---------------------------------------------------

  /**
   * 忽略并说明 (REV-004): the disposition with its required reason, the Quality Signal it records, and
   * the finding's mark set aside — all in one transaction. Only a pending finding can be ignored; what
   * became of any other is already on record through its mark.
   */
  ignoreFinding(bookId: string, reviewRunId: string, findingId: string, reasonInput: string): void {
    const snapshot = this.#runOfBook(bookId, reviewRunId);
    requireReview(typeof findingId === 'string' && FINDING_ID_PATTERN.test(findingId), 'REVIEW_FINDING_INVALID', '发现标识无效。');
    requireReview(typeof reasonInput === 'string' && reasonInput.isWellFormed(), 'REVIEW_REASON_REQUIRED', '忽略一条发现需要说明原因。');
    const reason = reasonInput.trim();
    requireReview(reason.length > 0, 'REVIEW_REASON_REQUIRED', '忽略一条发现需要说明原因。');
    requireReview([...reason].length <= MAX_REASON_CHARACTERS, 'REVIEW_REASON_TOO_LONG', `原因不能超过 ${MAX_REASON_CHARACTERS} 个字。`);
    transact(this.#db, () => {
      const finding = this.#findingViews(reviewRunId, snapshot.manuscript.branchId, findingId)[0];
      requireReview(finding !== undefined, 'REVIEW_FINDING_NOT_FOUND', '这次审阅没有这条发现。');
      requireReview(finding.status === 'pending', 'REVIEW_FINDING_NOT_PENDING',
        finding.status === 'ignored' ? '这条发现已经忽略过。' : '这条发现已经处理过，不能再忽略。');
      const now = new Date().toISOString();
      const last = this.#db.prepare('SELECT max(ordinal) last FROM review_finding_dispositions WHERE review_run_id = ? AND finding_id = ?')
        .get(reviewRunId, findingId) as SqlRow;
      const ordinal = last.last === null ? 1 : integer(last.last) + 1;
      const dispositionId = randomUUID();
      const disposition = canonicalRecord({
        schema: DISPOSITION_SCHEMA, dispositionId, reviewRunId, findingId, ordinal, disposition: 'ignored', reason, actor: 'editor', recordedAt: now,
      });
      this.#db.prepare(
        `INSERT INTO review_finding_dispositions(disposition_id, review_run_id, finding_id, ordinal, disposition, reason, recorded_at, canonical_json, sha256)
         VALUES (?, ?, ?, ?, 'ignored', ?, ?, ?, ?)`,
      ).run(dispositionId, reviewRunId, findingId, ordinal, reason, now, disposition.json, disposition.digest);
      const materialized = this.#events(reviewRunId, finding.categoryId).find((event) => event.state === 'materialized');
      const signalId = randomUUID();
      // The domain fixes a Quality Signal's binding only for analysis feedback; for a review finding the
      // slice states it here (ambiguity A11): the Book, the Run and its manuscript pin, the category, the
      // finding and its mark, the configuration, and the revision the finding came from.
      const signal = canonicalRecord({
        schema: QUALITY_SIGNAL_SCHEMA,
        signalId,
        kind: 'review-finding-ignored',
        recordedAt: now,
        actor: 'editor',
        binding: {
          bookId,
          reviewRunId,
          reviewRunOrdinal: snapshot.ordinal,
          manuscript: {
            manuscriptId: snapshot.manuscript.manuscriptId,
            branchId: snapshot.manuscript.branchId,
            revisionId: snapshot.manuscript.revisionId,
            journalSequence: snapshot.manuscript.journalSequence,
          },
          configurationDigest: snapshot.configuration.digest,
          categoryId: finding.categoryId,
          findingId,
          kindRef: finding.kindRef,
          severity: finding.severity,
          markId: finding.markId,
          resultSetRevisionId: materialized?.resultSetRevisionId ?? null,
        },
        disposition: { dispositionId, disposition: 'ignored', reason },
      });
      this.#db.prepare(
        `INSERT INTO quality_signals(signal_id, book_id, kind, review_run_id, category_id, finding_id, disposition_id, mark_id, reason, recorded_at, canonical_json, sha256)
         VALUES (?, ?, 'review-finding-ignored', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(signalId, bookId, reviewRunId, finding.categoryId, findingId, dispositionId, finding.markId, reason, now, signal.json, signal.digest);
      if (finding.markId !== null) this.#marks.setAsideProduced(finding.markId, now);
    });
  }

  // ---- the Report (B8) ----------------------------------------------------------------------------

  /** Record the next version of the Run's 审阅报告, over what stands now. */
  generateReport(bookId: string, reviewRunId: string): void {
    const snapshot = this.#runOfBook(bookId, reviewRunId);
    const view = this.#runView(snapshot);
    requireReview(view.authorization !== null, 'REVIEW_REPORT_UNAVAILABLE', '这次审阅尚未授权，还没有可以报告的结果。');
    requireReview(!view.driving, 'REVIEW_REPORT_UNAVAILABLE', '审阅进行中；结束后再生成报告。');
    transact(this.#db, () => {
      const last = this.#db.prepare('SELECT max(version) last FROM review_reports WHERE review_run_id = ?').get(reviewRunId) as SqlRow;
      const version = last.last === null ? 1 : integer(last.last) + 1;
      const generatedAt = new Date().toISOString();
      const record = buildReviewReport({
        reviewRunId,
        version,
        generatedAt,
        run: {
          ordinal: snapshot.ordinal,
          label: `第 ${snapshot.ordinal} 次`,
          createdAt: snapshot.createdAt,
          scopeLabel: snapshot.scope.label,
          manuscript: { revisionId: snapshot.manuscript.revisionId, revisionLabel: snapshot.manuscript.revisionLabel, journalSequence: snapshot.manuscript.journalSequence },
        },
        configuration: snapshot.configuration,
        categories: view.categories.map((categoryView) => {
          const { category, materialized } = categoryView;
          const stateLabel = REVIEW_RUN_CATEGORY_STATE_LABELS[categoryView.state];
          const pin = materialized?.record.adapterPin;
          return {
            categoryId: category.categoryId,
            label: category.entry.label,
            output: category.entry.output,
            state: categoryView.state,
            stateLabel,
            stateLine: categoryView.detail === null ? stateLabel : `${stateLabel}：${categoryView.detail}`,
            basisStatement: category.basisStatement,
            excludedCount: typeof materialized?.record.excludedCount === 'number' ? materialized.record.excludedCount : 0,
            guidelineDocuments: category.entry.guidelineDocuments,
            procedure: category.entry.procedure,
            planEnvelopeDigest: category.task?.planEnvelopeDigest ?? null,
            resultSetRevisionId: materialized?.resultSetRevisionId ?? null,
            adapterPin: isRecord(pin) ? pin as { route: string; model: string; fixtureIdentity: string | null; fixtureSha256: string | null } : null,
          };
        }),
        findings: view.findings.map((finding) => ({
          findingId: finding.findingId,
          categoryId: finding.categoryId,
          severity: finding.severity,
          status: finding.status,
          quote: finding.quote,
          note: finding.note,
          locationLabel: finding.blockPosition === null ? '内容块已不在当前稿件中' : `内容块 ${finding.blockPosition}`,
        })),
      });
      const canonical = canonicalRecord(record);
      this.#db.prepare('INSERT INTO review_reports(report_id, review_run_id, version, generated_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), reviewRunId, version, generatedAt, canonical.json, canonical.digest);
    });
  }

  #reports(reviewRunId: string): ReviewReportProjection[] {
    return (this.#db.prepare('SELECT * FROM review_reports WHERE review_run_id = ? ORDER BY version').all(reviewRunId) as SqlRow[]).map((row) => {
      const record = recordOf(text(row.canonical_json), text(row.sha256)) as unknown as ReviewReportRecord;
      requireReview(record.schema === 'ai7.review.report/1' && record.version === integer(row.version), 'REVIEW_RECORD_INVALID', '审阅报告记录无效。');
      return { reportId: text(row.report_id), version: integer(row.version), generatedAt: text(row.generated_at), digest: text(row.sha256), record };
    });
  }

  /** The Review Run and finding a produced mark belongs to, for the Mark Card's `查看任务`; the latest Run naming it. */
  findingOfMark(markId: string): { bookId: string; reviewRunId: string; findingId: string } | null {
    requireReview(typeof markId === 'string' && UUID_PATTERN.test(markId), 'REVIEW_MARK_INVALID', '标记标识无效。');
    const row = this.#db.prepare(
      `SELECT r.book_id, f.review_run_id, f.finding_id FROM review_findings f JOIN review_runs r ON r.review_run_id = f.review_run_id
       WHERE f.mark_id = ? ORDER BY r.ordinal DESC LIMIT 1`,
    ).get(markId) as SqlRow | undefined;
    return row === undefined ? null : { bookId: text(row.book_id), reviewRunId: text(row.review_run_id), findingId: text(row.finding_id) };
  }

  // ---- the 审阅 projection (Appendix 1) -----------------------------------------------------------

  /**
   * The Book's 审阅 destination: the nine categories with their basis and what each can read now, the
   * coverage matrix, the scope options, the 审阅记录 newest first, and the opened Run — the latest when
   * none is named. `progress` is the one execution owner's reader, so a category executing now carries
   * its Measured Run Progress.
   */
  workspace(bookId: string, reviewRunId: string | null, progress?: ProgressReader): ReviewWorkspaceProjection {
    this.#requireBook(bookId);
    requireReview(reviewRunId === null || (typeof reviewRunId === 'string' && UUID_PATTERN.test(reviewRunId)), 'REVIEW_RUN_INVALID', '审阅记录标识无效。');
    const head = this.#head(bookId);
    const baseline = head === null ? { revision: null, error: null } : this.#readBaseline(bookId);
    const readings = this.#configuration.categories.map((entry) => this.#readCategory(bookId, head, entry, baseline, progress));
    const chapters = head === null ? { basis: 'outline' as const, chapters: [] } : this.#chapterOptions(bookId, head);
    const rows = this.#db.prepare('SELECT * FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC').all(bookId) as SqlRow[];
    const snapshots = rows.map((row) => this.#snapshotOf(row));
    const views = new Map(snapshots.map((snapshot) => [snapshot.reviewRunId, this.#runView(snapshot)] as const));
    const opened = reviewRunId === null ? snapshots[0] ?? null : snapshots.find((snapshot) => snapshot.reviewRunId === reviewRunId) ?? null;
    requireReview(reviewRunId === null || opened !== null, 'REVIEW_RUN_NOT_FOUND', '这次审阅不属于当前图书。');
    const driving = this.#bookIsDriving(bookId);
    return {
      bookId,
      manuscript: head,
      configuration: this.#configurationPin(),
      categories: readings.map((reading) => this.#workspaceCategory(reading, chapters)),
      coverage: this.#coverage(bookId, head, readings, baseline),
      scopeOptions: this.#scopeOptions(head, chapters),
      newReview: head === null
        ? { available: false, unavailableReason: NO_MANUSCRIPT_REASON }
        : driving ? { available: false, unavailableReason: RUN_ACTIVE_REASON } : { available: true, unavailableReason: null },
      runs: snapshots.map((snapshot) => this.#summary(views.get(snapshot.reviewRunId)!)),
      run: opened === null ? null : this.#runProjection(views.get(opened.reviewRunId)!, readings, chapters),
    };
  }

  #head(bookId: string): ManuscriptHead | null {
    const row = this.#db.prepare(
      `SELECT m.manuscript_id, bws.branch_id, bws.base_revision_id, mr.revision_label, bws.journal_sequence, bws.working_digest,
              (SELECT count(*) FROM working_blocks wb WHERE wb.branch_id = bws.branch_id) total_blocks
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN branch_working_state bws ON bws.branch_id = mb.branch_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       WHERE m.book_id = ? AND m.role = 'primary'`,
    ).get(bookId) as SqlRow | undefined;
    if (row === undefined) return null;
    return {
      manuscriptId: text(row.manuscript_id),
      branchId: text(row.branch_id),
      revisionId: text(row.base_revision_id),
      revisionLabel: text(row.revision_label),
      journalSequence: integer(row.journal_sequence),
      workingDigest: text(row.working_digest),
      totalBlocks: integer(row.total_blocks),
    };
  }

  /**
   * The chapters 选章 offers: the outline's headings, or — for a manuscript without one — the analysis
   * units the working manuscript derives, which is the structure every category reads by.
   */
  #chapterOptions(bookId: string, head: ManuscriptHead): ChapterOptions {
    const headings = (this.#db.prepare(
      "SELECT block_id, position, level, text FROM manuscript_outline WHERE branch_id = ? AND kind = 'heading' ORDER BY position",
    ).all(head.branchId) as SqlRow[]).map((row) => ({
      blockId: text(row.block_id),
      position: integer(row.position),
      level: integer(row.level),
      title: boundedTitle(text(row.text)),
    }));
    if (headings.length > 0) return { basis: 'outline', chapters: chapterOptionsFromOutline(headings, head.totalBlocks) };
    try {
      const manifest = deriveCoverageManifest({
        bookId,
        manuscriptId: head.manuscriptId,
        branchId: head.branchId,
        revisionId: head.revisionId,
        revisionLabel: head.revisionLabel,
        revisionDigest: head.workingDigest,
        blocks: this.#ledgers.baseline().readWorkingBlocks(head.branchId),
      });
      return {
        basis: 'analysis-units',
        chapters: chapterOptionsFromUnits(manifest.units.map((unit) => ({
          ordinal: unit.ordinal,
          startPosition: unit.startPosition,
          endPosition: unit.endPosition,
          firstBlockId: unit.blockIds[0]!,
        }))),
      };
    } catch (error) {
      if (error instanceof AnalysisError) return { basis: 'analysis-units', chapters: [] };
      throw error;
    }
  }

  #resolveScope(request: ReviewRunScopeRequest, chapters: ChapterOptions): ResolvedReviewScope {
    requireReview(isRecord(request) && hasExactKeys(request, ['kind', 'fromChapterBlockId', 'toChapterBlockId']) &&
      REVIEW_SCOPE_KINDS.includes(request.kind), 'REVIEW_SCOPE_INVALID', '审阅范围无效。');
    if (request.kind !== 'chapters') {
      requireReview(request.fromChapterBlockId === null && request.toChapterBlockId === null, 'REVIEW_SCOPE_INVALID', '只有选章可以指明章。');
      return { kind: request.kind, selectedRange: null };
    }
    requireReview(typeof request.fromChapterBlockId === 'string' && BLOCK_ID_PATTERN.test(request.fromChapterBlockId) &&
      typeof request.toChapterBlockId === 'string' && BLOCK_ID_PATTERN.test(request.toChapterBlockId), 'REVIEW_SCOPE_INVALID', '请选择起止的章。');
    requireReview(chapters.chapters.length > 0, 'REVIEW_SCOPE_INVALID', NO_CHAPTERS_REASON);
    const range = resolveChapterRange(chapters.chapters, request.fromChapterBlockId, request.toChapterBlockId);
    requireReview(range !== null, 'REVIEW_SCOPE_INVALID', '所选的章不在当前稿件中，或先后颠倒；请重新选择。');
    return { kind: 'chapters', selectedRange: range };
  }

  #readBaseline(bookId: string): BaselineReading {
    try {
      return { revision: (this.#ledgers.baseline().inspect(bookId) as BaselineAnalysisProjection).resultSetRevision, error: null };
    } catch (error) {
      if (error instanceof AnalysisError) return { revision: null, error: error.message };
      throw error;
    }
  }

  /** What one category can do now: from its own ledger for a Task-backed one, from the baseline for the leads. */
  #readCategory(bookId: string, head: ManuscriptHead | null, entry: ReviewCategoryConfigurationEntry, baseline: BaselineReading, progress: ProgressReader | undefined): CategoryReading {
    const none: ReviewCategoryLedgerFacts = { hasRevision: false, stale: false, syncUnavailableReason: null, baselineRevision: baseline.revision !== null };
    if (entry.executor === 'unavailable') return { entry, unavailableReason: entry.unavailableReason ?? '这一类暂不可用。', facts: none, projection: null };
    if (head === null) return { entry, unavailableReason: NO_MANUSCRIPT_REASON, facts: none, projection: null };
    if (entry.executor === 'baseline-leads') {
      return { entry, unavailableReason: baseline.error ?? (baseline.revision === null ? LEADS_ABSENT_REASON : null), facts: none, projection: null };
    }
    let projection: AnalysisProjection;
    try {
      projection = this.#ledgers.ledgerOf(entry).inspect(bookId, progress);
    } catch (error) {
      if (error instanceof AnalysisError) return { entry, unavailableReason: error.message, facts: none, projection: null };
      throw error;
    }
    const revision = projection.resultSetRevision;
    const actions = projection.updateControls?.actions as Readonly<Record<string, { unavailableReason: string | null }>> | undefined;
    const facts: ReviewCategoryLedgerFacts = {
      hasRevision: revision !== null,
      stale: revision !== null && revision.freshness.state === 'stale',
      syncUnavailableReason: actions?.['review-sync']?.unavailableReason ?? null,
      baselineRevision: baseline.revision !== null,
    };
    return {
      entry,
      unavailableReason: entry.executor === 'factual-review-kind' && revision !== null ? FACTUAL_AGAIN_REASON : null,
      facts,
      projection,
    };
  }

  #workspaceCategory(reading: CategoryReading, chapters: ChapterOptions): ReviewWorkspaceCategoryProjection {
    const entry = reading.entry;
    const first = chapters.chapters[0];
    const scope = (kind: ReviewScopeKind): ReviewAvailabilityProjection => {
      if (reading.unavailableReason !== null) return { available: false, unavailableReason: reading.unavailableReason };
      const selectedRange = kind === 'chapters' && first !== undefined ? { startPosition: first.position, endPosition: first.endPosition } : null;
      const plan = reviewCategoryScopePlan(entry.executor, entry.unavailableReason, { kind, selectedRange }, reading.facts);
      return plan.kind === 'refused' ? { available: false, unavailableReason: plan.reason } : { available: true, unavailableReason: null };
    };
    return {
      categoryId: entry.categoryId,
      label: entry.label,
      description: entry.description,
      output: entry.output,
      riskPointsOnly: entry.riskPointsOnly,
      batchApply: entry.batchApply,
      searchEngine: entry.searchEngine,
      basisStatement: reviewCategoryBasisStatement(entry),
      guidelineDocuments: entry.guidelineDocuments.map((document) => ({
        documentId: document.documentId, title: document.title, issuer: document.issuer, version: document.version, clauseCount: document.clauses.length,
      })),
      procedure: { title: entry.procedure.title, version: entry.procedure.version },
      available: reading.unavailableReason === null,
      unavailableReason: reading.unavailableReason,
      scopes: { whole: scope('whole'), chapters: scope('chapters'), changed: scope('changed'), selection: scope('selection') },
    };
  }

  #scopeOptions(head: ManuscriptHead | null, chapters: ChapterOptions): ReviewScopeOptionsProjection {
    if (head === null) {
      const none = { available: false, unavailableReason: NO_MANUSCRIPT_REASON };
      return { whole: none, chapters: { ...none, basis: chapters.basis, chapters: [] }, changed: none, selection: none };
    }
    return {
      whole: { available: true, unavailableReason: null },
      chapters: chapters.chapters.length > 0
        ? { available: true, unavailableReason: null, basis: chapters.basis, chapters: chapters.chapters }
        : { available: false, unavailableReason: NO_CHAPTERS_REASON, basis: chapters.basis, chapters: [] },
      changed: { available: true, unavailableReason: null },
      // A selection is handed over from the manuscript, which reaches 审阅 with the Task surface.
      selection: { available: false, unavailableReason: SELECTION_UNAVAILABLE_REASON },
    };
  }

  /**
   * The coverage matrix (B9): each category against the manuscript as it stands, from the latest
   * revision one of this Book's Review Runs put on the manuscript — `current` while the manuscript is
   * still the one it read (and, for the leads, while their baseline revision is still the latest),
   * `needs-review` once it moved, `never` before any, and `unavailable` for a category that cannot run
   * and never has.
   */
  #coverage(bookId: string, head: ManuscriptHead | null, readings: ReadonlyArray<CategoryReading>, baseline: BaselineReading): ReviewCoverageRowProjection[] {
    const latest = new Map<string, { ordinal: number; revisionId: string }>();
    for (const row of this.#db.prepare(
      `SELECT e.category_id, e.result_set_revision_id, r.ordinal FROM review_run_category_events e
       JOIN review_runs r ON r.review_run_id = e.review_run_id
       WHERE r.book_id = ? AND e.state = 'materialized' ORDER BY r.ordinal, e.sequence`,
    ).all(bookId) as SqlRow[]) {
      latest.set(text(row.category_id), { ordinal: integer(row.ordinal), revisionId: text(row.result_set_revision_id) });
    }
    return readings.map((reading): ReviewCoverageRowProjection => {
      const entry = reading.entry;
      const last = latest.get(entry.categoryId);
      const row = (state: ReviewCoverageRowProjection['state'], rest: Partial<ReviewCoverageRowProjection> = {}): ReviewCoverageRowProjection => ({
        categoryId: entry.categoryId,
        label: entry.label,
        state,
        stateLabel: REVIEW_COVERAGE_STATE_LABELS[state],
        lastRunOrdinal: null,
        lastReviewedRevisionLabel: null,
        changedBlocks: null,
        unavailableReason: null,
        ...rest,
      });
      if (head === null) return row('unavailable', { unavailableReason: NO_MANUSCRIPT_REASON });
      if (last === undefined) return reading.unavailableReason !== null && reading.unavailableReason !== FACTUAL_AGAIN_REASON
        ? row('unavailable', { unavailableReason: reading.unavailableReason })
        : row('never');
      const pin = this.#db.prepare(
        `SELECT r.manuscript_revision_id, r.manuscript_revision_digest, mr.revision_label FROM analysis_result_set_revisions r
         JOIN manuscript_revisions mr ON mr.revision_id = r.manuscript_revision_id WHERE r.revision_id = ?`,
      ).get(last.revisionId) as SqlRow | undefined;
      requireReview(pin !== undefined, 'REVIEW_RECORD_INVALID', '审阅所依据的结果集修订版缺失。');
      const pinnedRevisionId = text(pin.manuscript_revision_id);
      const fresh = pinnedRevisionId === head.revisionId && text(pin.manuscript_revision_digest) === head.workingDigest;
      const current = fresh && (entry.executor !== 'baseline-leads' || baseline.revision?.revisionId === last.revisionId);
      return row(current ? 'current' : 'needs-review', {
        lastRunOrdinal: last.ordinal,
        lastReviewedRevisionLabel: text(pin.revision_label),
        changedBlocks: fresh ? 0 : this.#changedBlocks(head, pinnedRevisionId),
      });
    });
  }

  /** Blocks added, removed or changed between a Manuscript Revision and the working manuscript now. */
  #changedBlocks(head: ManuscriptHead, revisionId: string): number {
    const row = this.#db.prepare(
      `SELECT
         (SELECT count(*) FROM working_blocks wb WHERE wb.branch_id = ? AND NOT EXISTS (
            SELECT 1 FROM manuscript_block_versions v WHERE v.revision_id = ? AND v.block_id = wb.block_id AND v.digest = wb.digest))
       + (SELECT count(*) FROM manuscript_block_versions v WHERE v.revision_id = ? AND NOT EXISTS (
            SELECT 1 FROM working_blocks wb WHERE wb.branch_id = ? AND wb.block_id = v.block_id)) changed`,
    ).get(head.branchId, revisionId, revisionId, head.branchId) as SqlRow;
    return integer(row.changed);
  }

  /** Everything a Run reads as: its categories' states, its findings with their derived status, its own state. */
  #runView(snapshot: RunSnapshot): RunView {
    const authorization = this.#authorizationOf(snapshot.reviewRunId);
    const driving = this.#driving.has(snapshot.reviewRunId);
    const categories = snapshot.categories.map((category): CategoryView => {
      const events = this.#events(snapshot.reviewRunId, category.categoryId);
      const last = events.at(-1) ?? null;
      let ledgerRunTerminal = false;
      if (last?.state === 'dispatched' && last.runRecordId !== null) {
        try {
          ledgerRunTerminal = TERMINAL_LEDGER_STATES.has(this.#ledgers.ledgerOf(category.entry).currentRunState(last.runRecordId));
        } catch (error) {
          if (!(error instanceof AnalysisError)) throw error;
        }
      }
      const { state, pending } = reviewRunCategoryState({ authorized: authorization !== null, driving, lastEvent: last?.state ?? null, ledgerRunTerminal });
      const derived = !driving && pending && authorization !== null
        ? state === 'interrupted' ? INTERRUPTED_DETAIL : state === 'waiting' && last !== null ? UNWRITTEN_DETAIL : UNSTARTED_DETAIL
        : null;
      return {
        category,
        events,
        state,
        detail: derived ?? (last === null || last.state === 'dispatched' ? null : last.detail),
        pending,
        materialized: events.find((event) => event.state === 'materialized') ?? null,
      };
    });
    const { state, canContinue } = reviewRunState({
      authorized: authorization !== null,
      driving,
      categories: categories.map((view) => ({ pending: view.pending, materialized: view.materialized !== null })),
    });
    return {
      snapshot,
      authorization,
      driving,
      categories,
      findings: this.#findingViews(snapshot.reviewRunId, snapshot.manuscript.branchId, null),
      state,
      canContinue,
    };
  }

  /**
   * The findings of one Run (or one of them) with everything their status is derived from (B7): the
   * mark each names, the latest decision on it, what it became when converted, and whether it — or the
   * same finding in another Run, through the one mark they share — was ignored.
   */
  #findingViews(reviewRunId: string, branchId: string, findingId: string | null): FindingView[] {
    const rows = this.#db.prepare(
      `SELECT f.*, em.status mark_status, em.anchor_state mark_anchor, em.from_grapheme mark_from, em.to_grapheme mark_to,
              (SELECT d.disposition FROM proposal_change_items i JOIN proposal_item_decisions d ON d.item_id = i.item_id
                WHERE i.mark_id = f.mark_id ORDER BY d.ordinal DESC LIMIT 1) decision,
              (SELECT c.kind FROM editorial_marks c WHERE c.converted_from_mark_id = f.mark_id ORDER BY c.created_at LIMIT 1) converted_to,
              (SELECT x.reason FROM review_finding_dispositions x
                 JOIN review_findings y ON y.review_run_id = x.review_run_id AND y.finding_id = x.finding_id
                WHERE x.disposition = 'ignored'
                  AND ((y.review_run_id = f.review_run_id AND y.finding_id = f.finding_id) OR (f.mark_id IS NOT NULL AND y.mark_id = f.mark_id))
                ORDER BY x.recorded_at DESC, x.ordinal DESC LIMIT 1) ignore_reason,
              wb.position block_position
       FROM review_findings f
       LEFT JOIN editorial_marks em ON em.mark_id = f.mark_id
       LEFT JOIN working_blocks wb ON wb.branch_id = ? AND wb.block_id = f.block_id
       WHERE f.review_run_id = ? AND (? IS NULL OR f.finding_id = ?)
       ORDER BY f.ordinal`,
    ).all(branchId, reviewRunId, findingId, findingId) as SqlRow[];
    return rows.map((row): FindingView => {
      const markId = nullableText(row.mark_id);
      const markStatus = nullableText(row.mark_status) as ReviewMarkStatus | null;
      const decision = nullableText(row.decision);
      const ignoreReason = nullableText(row.ignore_reason);
      const { status, statusDetail } = reviewFindingStatus({
        ignored: ignoreReason !== null,
        markId,
        markStatus,
        decision: decision === null || decision === 'withdrawn' ? null : decision as 'accepted' | 'accepted-with-edit' | 'rejected',
        convertedTo: nullableText(row.converted_to) as ReviewFindingProjection['output'] | null,
      });
      return {
        findingId: text(row.finding_id),
        categoryId: text(row.category_id),
        ordinal: integer(row.ordinal),
        kindRef: text(row.kind_ref),
        severity: text(row.severity) as ReviewFindingSeverity,
        output: text(row.output) as FindingView['output'],
        riskPoint: integer(row.risk_point) === 1,
        blockId: text(row.block_id),
        fromGrapheme: markId === null || row.mark_from === null ? integer(row.from_grapheme) : integer(row.mark_from),
        toGrapheme: markId === null || row.mark_to === null ? integer(row.to_grapheme) : integer(row.mark_to),
        quote: text(row.quote),
        note: text(row.note),
        replacement: nullableText(row.replacement),
        clauseRef: nullableText(row.clause_ref),
        stateLine: nullableText(row.state_line),
        markId,
        markStatus,
        anchorState: markId === null ? 'anchor-changed' : text(row.mark_anchor) as FindingView['anchorState'],
        blockPosition: row.block_position === null || row.block_position === undefined ? null : integer(row.block_position),
        ignoreReason,
        status,
        statusDetail,
      };
    });
  }

  #summary(view: RunView): ReviewRunSummaryProjection {
    const reports = this.#db.prepare('SELECT max(version) latest FROM review_reports WHERE review_run_id = ?').get(view.snapshot.reviewRunId) as SqlRow;
    return {
      reviewRunId: view.snapshot.reviewRunId,
      ordinal: view.snapshot.ordinal,
      label: `第 ${view.snapshot.ordinal} 次`,
      createdAt: view.snapshot.createdAt,
      scopeLabel: view.snapshot.scope.label,
      categoryLabels: view.snapshot.categories.map((category) => category.entry.label),
      state: view.state,
      stateLabel: reviewRunStateLabel(view.state, view.canContinue),
      findingCounts: reviewFindingCounts(view.findings),
      reportVersion: reports.latest === null ? null : integer(reports.latest),
    };
  }

  #runProjection(view: RunView, readings: ReadonlyArray<CategoryReading>, chapters: ChapterOptions): ReviewRunProjection {
    const { snapshot } = view;
    const reports = this.#reports(snapshot.reviewRunId);
    const labels = new Map(snapshot.categories.map((category) => [category.categoryId, category.entry.label] as const));
    const findingsOf = (categoryId: string): number => view.findings.filter((finding) => finding.categoryId === categoryId).length;
    const categories = view.categories.map((categoryView): ReviewRunCategoryProjection => {
      const { category } = categoryView;
      // The ledger's own projection of this category's Task carries its Measured Run Progress while the
      // owner executes it; an older Run's Task is no longer its category's latest, and reads none.
      const projection = readings.find((reading) => reading.entry.categoryId === category.categoryId)?.projection ?? null;
      const live = categoryView.state === 'running' && category.task !== null && projection?.taskIntent?.taskIntentId === category.task.taskIntentId
        ? projection.run?.progress ?? null
        : null;
      const excluded = categoryView.materialized?.record.excludedCount;
      return {
        categoryId: category.categoryId,
        label: category.entry.label,
        position: category.position,
        output: category.entry.output,
        riskPointsOnly: category.entry.riskPointsOnly,
        batchApply: category.entry.batchApply,
        basisStatement: category.basisStatement,
        state: categoryView.state,
        stateLabel: REVIEW_RUN_CATEGORY_STATE_LABELS[categoryView.state],
        detail: categoryView.detail,
        taskIntentId: category.task?.taskIntentId ?? null,
        planEnvelopeDigest: category.task?.planEnvelopeDigest ?? null,
        modeLabel: category.task?.modeLabel ?? null,
        plan: category.task?.plan ?? null,
        progress: live,
        findingsCount: findingsOf(category.categoryId),
        excludedCount: typeof excluded === 'number' ? excluded : 0,
      };
    });
    const clauseRefs = (categoryId: string, clauseId: string | null): ReviewFindingProjection['clauseRefs'] => {
      const entry = snapshot.categories.find((category) => category.categoryId === categoryId)?.entry;
      for (const document of entry?.guidelineDocuments ?? []) {
        const clause = document.clauses.find((candidate) => candidate.clauseId === clauseId);
        if (clause !== undefined) return [{ documentTitle: document.title, clauseId: clause.clauseId, text: clause.text }];
      }
      return [];
    };
    const findings = view.findings.slice(0, MAX_PROJECTED_FINDINGS).map((finding): ReviewFindingProjection => {
      const chapter = finding.blockPosition === null ? null : chapterOfPosition(chapters.chapters, finding.blockPosition);
      return {
        findingId: finding.findingId,
        categoryId: finding.categoryId,
        categoryLabel: labels.get(finding.categoryId) ?? finding.categoryId,
        ordinal: finding.ordinal,
        severity: finding.severity,
        severityLabel: REVIEW_FINDING_SEVERITY_LABELS[finding.severity],
        output: finding.output,
        riskPoint: finding.riskPoint,
        status: finding.status,
        statusLabel: REVIEW_FINDING_STATUS_LABELS[finding.status],
        statusDetail: finding.statusDetail,
        blockId: finding.blockId,
        fromGrapheme: finding.fromGrapheme,
        toGrapheme: finding.toGrapheme,
        blockPosition: finding.blockPosition,
        chapterBlockId: chapter?.blockId ?? null,
        chapterTitle: chapter?.title ?? null,
        quote: finding.quote,
        note: finding.note,
        replacement: finding.replacement,
        clauseRefs: clauseRefs(finding.categoryId, finding.clauseRef),
        stateLine: finding.stateLine,
        markId: finding.markId,
        markStatus: finding.markStatus,
        anchorState: finding.anchorState,
        ignoreReason: finding.ignoreReason,
      };
    });
    return {
      reviewRunId: snapshot.reviewRunId,
      ordinal: snapshot.ordinal,
      label: `第 ${snapshot.ordinal} 次`,
      createdAt: snapshot.createdAt,
      state: view.state,
      stateLabel: reviewRunStateLabel(view.state, view.canContinue),
      canContinue: view.canContinue,
      scope: { kind: snapshot.scope.kind, label: snapshot.scope.label, selectedRange: snapshot.scope.selectedRange },
      manuscript: snapshot.manuscript,
      configurationDigest: snapshot.configuration.digest,
      authorization: view.authorization === null ? null : { authorizedAt: view.authorization.authorizedAt },
      categories,
      findings,
      findingsTruncated: view.findings.length > MAX_PROJECTED_FINDINGS,
      findingCounts: reviewFindingCounts(view.findings),
      report: reports.at(-1) ?? null,
      reportVersions: reports.map((report) => ({ reportId: report.reportId, version: report.version, generatedAt: report.generatedAt, digest: report.digest })),
    };
  }
}
