import { resolveProcedureDefinition, readProcedurePlanPin } from '../procedures/definition-store.js';
import { reviewProcedureId } from '../procedures/preinstalled.js';
import type { ProcedureDefinitionPin } from '../../shared/protocol/procedures.js';
import { LOCAL_REVIEW_SCHEMA_VERSION, REVIEW_CONTRACT_SCHEMA_VERSION } from '../task-authorization.js';
import { LocalCheckError, freezeLocalPlan, freezeLocalPlanV3, numeralBasis, validLocalOptions, validateAnyLocalPlan, type AnyLocalCheckPlan, type LocalCheckBlock } from './deterministic/plan.js';
import { exactLocalCandidateIds, checkLocalPlan, anyLocalCandidateNote, mechanicalReplacement, validateLocalResultV3, type AnyLocalCheckResult } from './deterministic/checker.js';
import { LOCAL_CHECK_CATEGORY, LOCAL_CHECK_PROCEDURE, LOCAL_CHECK_LIMITATION, LOCAL_TABLE_LIMITATION, LOCAL_RULE_IDS } from './deterministic/rules.js';
import { HouseWordLists } from './house-word-list.js';
import { HouseWordListError } from '../../shared/protocol/house-word-list.js';
import { LOCAL_REVIEW_CATEGORY, LOCAL_REVIEW_CATEGORY_V3, REVIEW_CATEGORY_CONFIGURATION_SCHEMA } from './category-configuration.js';
import type { LocalCheckOptions } from '../../shared/protocol/procedures.js';
import { HouseReviewPreferenceLedger, housePreferenceLabel } from '../house-review-preference.js';
import { LearningEligibilityError } from '../learning-eligibility.js';
import type { ReferencedRuleVersion } from '../../shared/protocol/learning.js';
import type { HouseReviewPreferenceUse, LearningLedgerMaterialKind, ReviewRunInfluenceProjection } from '../../shared/protocol.js';
import { randomUUID } from 'node:crypto';
import { clarificationPlanBaseDigest } from '../provider/clarification-contract.js';
import { TASK_MATERIAL_LIVE_UNAVAILABLE, taskMaterialSettled, taskMaterialSources, type TaskMaterialBoundary, type TaskMaterialReading, type MaterialGuardRefusal } from '../task-material-references.js';
import { liveMaterialRule, liveKindAdmission } from '../analysis/live-kind-admission.js';
import { reviewDeliverables, REVIEW_DELIVERABLE_CHANGED } from '../production-documents.js';
import { liveReviewRule, liveReviewUnavailableReason } from './live-review-admission.js';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  EDITORIAL_REVIEW_KIND_PREFIX,
  HISTORICALLY_AFFECTED_RESULT_MARKER,
  HISTORICAL_MARKER_UNVERIFIABLE,
  LEARNING_INFLUENCE_RESULT_MARKER,
  LEARNING_INFLUENCE_STOP_SUMMARY,
  LEARNING_INFLUENCE_WITHDRAWN_LABEL,
  LEARNING_MATERIAL_KINDS,
  MAX_REVIEW_RUN_INFLUENCE_MATERIALS,
  SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL,
  isReviewCategoryId,
  reviewCategoryKindId,
  MAX_FRAME_BYTES,
  MAX_REVIEW_FINDING_REASON_CHARACTERS,
  MAX_REVIEW_FINDINGS_PER_PAGE,
  MAX_REVIEW_RUN_SUMMARIES,
  REVIEW_COVERAGE_STATE_LABELS,
  REVIEW_FINDING_ID_PATTERN,
  REVIEW_FINDING_SEVERITIES,
  REVIEW_FINDING_SEVERITY_LABELS,
  REVIEW_FINDING_STATUSES,
  REVIEW_FINDING_STATUS_LABELS,
  REVIEW_SCOPE_KINDS,
  type AnalysisGoal,
  type AnalysisProjection,
  type AnalysisTaskMode,
  type BaselineAnalysisProjection,
  type BaselineAnalysisResultSetRevisionProjection,
  type EditorialMarkBasisProjection,
  type EditorialMarkKind,
  type FactualReviewResultSetRevisionProjection,
  type FactualSeverityTier,
  type LaunchPolicyProjection,
  type ReviewAvailabilityProjection,
  type ReviewCategoryResultSetRevisionProjection,
  type ReviewChapterOptionProjection,
  type ReviewCoverageRowProjection,
  type ReviewFindingPageRequest,
  type ReviewExcludedFindingProjection,
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
import { RUN_WAITING_IDLE_LABEL, type BaselineAnalysisStore, type ProgressReader } from '../analysis/baseline-analysis-store.js';
import { UNREAD_WALK_BOUND, type UnreadWalkCut } from '../analysis/unread-changes.js';
import {
  AnalysisError,
  BLOCK_ID_PATTERN,
  DIGEST_PATTERN,
  UUID_PATTERN,
  canonicalRecord,
  canonicalJson,
  hasExactKeys,
  isRecord,
  parseCanonicalJson,
  sha256Hex,
} from '../analysis/canonical.js';
import { deriveCoverageManifest } from '../analysis/coverage-manifest.js';
import { graphemeCount, sliceGraphemes } from '../analysis/factual-review-contract.js';
import type { PackageReviewRunReading } from '../book-delivery-packages.js';
import type { EditorialMarkStore, ProducedEditorialMarkInput } from '../editorial-marks.js';
import type { ReviewRunAttentionReading } from '../global-attention.js';
import {
  PROCEDURE_STEP_NOT_CHOSEN,
  capturedVersionStopped,
  procedureCaptureSource,
  procedurePinRefusal,
  readReviewRunProcedurePin,
  recordReviewRunProcedurePin,
  type ProcedureCaptureStep,
  type ProcedureLeftOutStep,
  type ReviewRunProcedurePinInput,
} from '../captured-procedures.js';
import {
  BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  houseGuidelineDocuments,
  reviewCategoryBasisStatement,
  reviewCategoryConfigurationDigest,
  reviewCategoryEntryForBook,
  type ReviewCategoryConfiguration,
  type ReviewCategoryConfigurationEntry,
  type ReviewCategoryExecutor,
} from './category-configuration.js';
import { reviewBaselineSource, reviewLeadBody, reviewLeadsOf } from './review-leads.js';
import { resolveSeriesConsistency, seriesConsistencyEntry, seriesKnowledgePinsCurrent, freezeSeriesScope, seriesKnowledgeAllowed, frozenSeriesScopes, seriesScopeMaterials, seriesScopeChanged, SERIES_POLICY_CLOSED, type SeriesKnowledgeReadings } from './series-consistency.js';
import { buildReviewReport, reportQuote, reviewFindingCounts } from './review-report.js';
import {
  REVIEW_CATEGORY_PLACE_WAIT_DETAIL,
  TERMINAL_CATEGORY_EVENTS,
  reviewFindingStatus,
  newestSuggestionVersion,
  reviewRunCategoryState,
  reviewRunCategoryStateLabel,
  reviewRunCategoryStopLabel,
  reviewRunState,
  reviewRunStateLabel,
  LEARNING_INFLUENCE_WITHDRAWN,
  REVIEW_RUN_CANCELLED,
  REVIEW_RUN_CANCELLED_LABEL,
  REVIEW_RUN_LAUNCH_BLOCKED,
  REVIEW_RUN_PLAN_MOVED,
  SERIES_RETRIEVAL_SCOPE_CHANGED,
  type ReviewLedgerRunOutcome,
  type ReviewRunStop,
  type ReviewMarkStatus,
  type ReviewRunCategoryEventState,
} from './review-run-state.js';
import {
  SERIES_SCOPE_STOP_SUMMARY,
  SeriesExclusionError,
  SeriesExclusionLedger,
  coveringExclusions,
  excludedAfter,
  knowledgeMaterial,
  seriesScopeChangedReason,
  seriesScopeStopDetail,
  type SeriesKnowledgeMaterial,
  type StoredExclusion,
} from '../series-exclusions.js';
import {
  FACTUAL_AGAIN_REASON,
  LEADS_ABSENT_REASON,
  NO_CHAPTERS_REASON,
  MAX_SELECTION_BLOCKS,
  SELECTION_GONE_REASON,
  SELECTION_MOVED_REASON,
  SELECTION_TOO_LONG_REASON,
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
/** Revision 90: a local stage has no model Run or analysis-result FK. Old event SQL is untouched. */
export const LOCAL_STAGE_SCHEMA_SQL = { review_local_stage_artifacts: `CREATE TABLE review_local_stage_artifacts (
  review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  attempt_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('started', 'completed', 'materialized', 'interrupted', 'cancelled', 'failed', 'refused')),
  plan_digest TEXT NOT NULL CHECK(length(plan_digest) = 64),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  PRIMARY KEY(review_run_id, sequence),
  UNIQUE(review_run_id, attempt_id, state)
) STRICT` } as const;
export const LOCAL_STAGE_TRIGGER_SQL = Object.fromEntries(['update', 'delete'].map((operation) => [
  `review_local_stage_artifacts_no_${operation}`,
  `CREATE TRIGGER review_local_stage_artifacts_no_${operation} BEFORE ${operation.toUpperCase()} ON review_local_stage_artifacts
    BEGIN SELECT RAISE(ABORT, 'REVIEW_LOCAL_STAGE_IMMUTABLE'); END`,
]));
export const LOCAL_STAGE_FOREIGN_KEYS = { review_local_stage_artifacts: ['review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE'] };

export function initializeLocalStageSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'review_local_stage_artifacts'").get() !== undefined) return;
  requireReview(Number(db.prepare('PRAGMA user_version').get()?.user_version) < LOCAL_REVIEW_SCHEMA_VERSION, 'SCHEMA_INVALID', '本地工序记录表缺失。');
  transact(db, () => {
    db.exec(LOCAL_STAGE_SCHEMA_SQL.review_local_stage_artifacts);
    for (const sql of Object.values(LOCAL_STAGE_TRIGGER_SQL)) db.exec(sql);
  });
}
type LocalStageState = 'started' | 'completed' | 'materialized' | 'interrupted' | 'cancelled' | 'failed' | 'refused';
interface LocalStageArtifact {
  schema: 'ai7.review.local-stage-artifact/1' | 'ai7.review.local-stage-artifact/3'; reviewRunId: string; categoryId: typeof LOCAL_CHECK_CATEGORY;
  sequence: number; attemptId: string; state: LocalStageState; planDigest: string;
  procedure: ProcedureDefinitionPin; source: AnyLocalCheckPlan['source']; previousDigest: string | null;
  recordedAt: string; result: AnyLocalCheckResult | null; detail: string;
}

/** Shared by store startup and database export/merge validation; never consults current prose or runs work. */
export function readLocalStageArtifacts(db: DatabaseSync, runId: string): Array<{ record: LocalStageArtifact; digest: string }> {
  const row = db.prepare('SELECT canonical_json, sha256 FROM review_runs WHERE review_run_id = ?').get(runId) as SqlRow | undefined;
  requireReview(row !== undefined, 'REVIEW_RECORD_INVALID', '本地检查所属审阅记录缺失。');
  const snapshot = recordOf(text(row.canonical_json), text(row.sha256)) as unknown as RunSnapshot;
  const plan = snapshot.localPlan;
  requireReview(plan !== undefined, 'REVIEW_RECORD_INVALID', '本地检查计划缺失。');
  validateAnyLocalPlan(plan);
  requireReview(canonicalJson(plan.source) === canonicalJson(localSource(snapshot.manuscript)), 'REVIEW_RECORD_INVALID', '本地检查来源与审阅记录不一致。');
  const artifacts: Array<{ record: LocalStageArtifact; digest: string }> = [];
  for (const row of db.prepare('SELECT * FROM review_local_stage_artifacts WHERE review_run_id = ? ORDER BY sequence').all(runId) as SqlRow[]) {
    if (artifacts.length === 0) {
      const authorizationRow = db.prepare('SELECT canonical_json, sha256 FROM review_run_authorizations WHERE review_run_id = ?').get(runId) as SqlRow | undefined;
      requireReview(authorizationRow !== undefined, 'REVIEW_RECORD_INVALID', '本地工序缺少授权。');
      const authorization = recordOf(text(authorizationRow.canonical_json), text(authorizationRow.sha256));
      requireReview(Array.isArray(authorization.approvals) && authorization.approvals.length === 1 && isRecord(authorization.approvals[0]) &&
        authorization.approvals[0].categoryId === LOCAL_CHECK_CATEGORY && authorization.approvals[0].planEnvelopeDigest === plan.digest && authorization.approvals[0].taskIntentId === null,
      'REVIEW_RECORD_INVALID', '本地工序授权与冻结计划不一致。');
    }
    const record = recordOf(text(row.canonical_json), text(row.sha256)) as unknown as LocalStageArtifact;
    const previous = artifacts.at(-1);
    requireReview(hasExactKeys(record as unknown as Record<string, unknown>, ['schema', 'reviewRunId', 'categoryId', 'sequence', 'attemptId', 'state', 'planDigest', 'procedure', 'source', 'previousDigest', 'recordedAt', 'result', 'detail']) &&
      record.schema === (plan.schema === 'ai7.review.local-plan/3' ? 'ai7.review.local-stage-artifact/3' : 'ai7.review.local-stage-artifact/1') && record.reviewRunId === runId && record.categoryId === LOCAL_CHECK_CATEGORY &&
      record.sequence === artifacts.length + 1 && record.sequence === row.sequence && record.attemptId === row.attempt_id && UUID_PATTERN.test(record.attemptId) &&
      record.state === row.state && record.planDigest === row.plan_digest && record.planDigest === plan.digest && record.recordedAt === row.recorded_at &&
      record.previousDigest === (previous?.digest ?? null) && canonicalJson(record.procedure) === canonicalJson(plan.procedure) && canonicalJson(record.source) === canonicalJson(plan.source) &&
      typeof record.detail === 'string' && record.detail.length <= 2000,
    'REVIEW_RECORD_INVALID', '本地工序记录的摘要链或计划绑定无效。');
    const previousState = previous?.record.state;
    const follows = record.state === 'started' ? previous === undefined || previousState === 'interrupted'
      : record.state === 'materialized' ? previousState === 'completed'
        : record.state === 'completed' || record.state === 'interrupted' ? previousState === 'started'
          : previous === undefined || previousState === 'started' || previousState === 'interrupted' || previousState === 'completed';
    requireReview(follows && (record.state === 'started' || previous === undefined || record.attemptId === previous.record.attemptId),
      'REVIEW_RECORD_INVALID', '本地工序状态次序无效。');
    if (record.state === 'completed' || record.state === 'materialized') {
      const result = record.result;
      if (plan.schema === 'ai7.review.local-plan/3') validateLocalResultV3(result, plan);
      else {
      requireReview(result !== null && isRecord(result) && hasExactKeys(result, ['schema', 'planDigest', 'paragraphs', 'candidates', 'excluded', 'counts']) &&
        result.schema === 'ai7.review.local-result/1' && result.planDigest === plan.digest && result.paragraphs === plan.blocks.length &&
        Array.isArray(result.candidates) && result.candidates.length <= 10000 && Array.isArray(result.excluded) && result.excluded.length <= 256 && isRecord(result.counts) && hasExactKeys(result.counts, [...LOCAL_RULE_IDS]),
      'REVIEW_RECORD_INVALID', '本地工序结果无效或超出界限。');
      const ids = new Set<string>();
      for (const candidate of result.candidates) {
        requireReview(isRecord(candidate) && hasExactKeys(candidate, ['id', 'ruleId', 'version', 'blockId', 'from', 'to', 'quote', 'observation', 'basis']) &&
          typeof candidate.id === 'string' && DIGEST_PATTERN.test(candidate.id) && !ids.has(candidate.id) && LOCAL_RULE_IDS.some((id) => id === candidate.ruleId) && candidate.version === 1 &&
          typeof candidate.blockId === 'string' && BLOCK_ID_PATTERN.test(candidate.blockId) && Number.isSafeInteger(candidate.from) && Number.isSafeInteger(candidate.to) && Number(candidate.from) >= 0 && Number(candidate.to) > Number(candidate.from) &&
          typeof candidate.quote === 'string' && candidate.quote.length <= 65536 && typeof candidate.observation === 'string' && candidate.observation.length <= 500 &&
          (candidate.basis === 'national-standard' || candidate.basis === 'editor-convention'), 'REVIEW_RECORD_INVALID', '本地发现记录无效。');
        ids.add(candidate.id);
      }
      for (const count of Object.values(result.counts)) requireReview(isRecord(count) && hasExactKeys(count, ['checked', 'exempt', 'skipped', 'error', 'findings', 'disabled', 'outOfApplicability', 'notRecognized', 'noFinding']) &&
        Object.values(count).every((value) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100000000), 'REVIEW_RECORD_INVALID', '本地检查计数无效。');
      for (const exclusion of result.excluded) requireReview(isRecord(exclusion) && hasExactKeys(exclusion, ['candidateId', 'reason']) && typeof exclusion.candidateId === 'string' &&
        exclusion.candidateId.length <= 64 && typeof exclusion.reason === 'string' && exclusion.reason.length <= 100, 'REVIEW_RECORD_INVALID', '本地排除记录无效。');
      }
      if (record.state === 'materialized') requireReview(canonicalJson(result) === canonicalJson(previous!.record.result), 'REVIEW_RECORD_INVALID', '本地物化结果与完成记录不一致。');
    } else requireReview(record.result === null, 'REVIEW_RECORD_INVALID', '未完成的本地工序不能携带结果。');
    artifacts.push({ record, digest: text(row.sha256) });
  }
  return artifacts;
}
export function validateLocalStageArtifacts(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'review_local_stage_artifacts' AND type = 'table'").get() === undefined) return;
  for (const row of db.prepare("SELECT review_run_id FROM review_runs WHERE json_type(canonical_json, '$.localPlan') IS NOT NULL OR review_run_id IN (SELECT review_run_id FROM review_local_stage_artifacts)").all()) readLocalStageArtifacts(db, String(row.review_run_id));
}
/** A refused local plan reaches the editor in its own words, as the Review Run's refusal rather than a failed request. */
function localRefusal<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof LocalCheckError || error instanceof HouseWordListError) throw new ReviewRunError(error.code, error.message);
    throw error;
  }
}
function localSource(source: AnyLocalCheckPlan['source']): AnyLocalCheckPlan['source'] {
  return { manuscriptId: source.manuscriptId, branchId: source.branchId, revisionId: source.revisionId, journalSequence: source.journalSequence, workingDigest: source.workingDigest };
}

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
  review_excluded_findings: `CREATE TABLE review_excluded_findings (
  review_run_id TEXT NOT NULL REFERENCES review_runs(review_run_id),
  category_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  result_set_revision_id TEXT NOT NULL REFERENCES analysis_result_set_revisions(revision_id),
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  PRIMARY KEY(review_run_id, category_id, ordinal)
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
  review_excluded_findings: ['result_set_revision_id>analysis_result_set_revisions.revision_id:NO ACTION/NO ACTION/NONE', 'review_run_id>review_runs.review_run_id:NO ACTION/NO ACTION/NONE'],
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

/** A 当前选区 Run's paragraphs by identity; `null` for every other scope, and for a Run recorded before they were kept. */
function selectionBlocks(snapshot: { readonly scope: { readonly kind: ReviewScopeKind; readonly blockIds?: ReadonlyArray<string> } }): ReadonlySet<string> | null {
  return snapshot.scope.kind === 'selection' && snapshot.scope.blockIds !== undefined ? new Set(snapshot.scope.blockIds) : null;
}

/** What a 当前选区 Run found in its reading ranges outside the selected paragraphs, in the category's own line (P1-1). */
export function selectionOutsideLine(count: number): string {
  return `所选范围外另有 ${count} 处，未标记`;
}

/** A 当前选区 Run's unplaceable quotes carry no paragraph, so its line names the reading ranges they came from (P3-1). */
export function selectionExcludedLine(count: number): string {
  return `所读范围内另有 ${count} 条未能定位引文，列在排除附录中`;
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
  if (existing !== undefined && db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'review_excluded_findings'").get() !== undefined) return;
  requireReview(existing === undefined || Number(db.prepare('PRAGMA user_version').get()?.user_version) < REVIEW_CONTRACT_SCHEMA_VERSION,
    'SCHEMA_INVALID', '数据库缺少本版本的审阅排除记录。');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (existing === undefined) {
      for (const sql of Object.values(REVIEW_RUN_SCHEMA_SQL)) db.exec(sql);
      for (const sql of Object.values(REVIEW_RUN_TRIGGER_SQL)) db.exec(sql);
    } else {
      db.exec(REVIEW_RUN_SCHEMA_SQL.review_excluded_findings);
      db.exec(REVIEW_RUN_TRIGGER_SQL['review_excluded_findings_no_update']!);
      db.exec(REVIEW_RUN_TRIGGER_SQL['review_excluded_findings_no_delete']!);
    }
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
/**
 * What one workspace answer spends on its page of findings at most. A finding weighs about a kilobyte on
 * the wire and up to three with a long note, replacement and clause, so the page is bounded by weight as
 * well as by count, and never by more than the frame leaves once everything else is in.
 */
const FINDINGS_PAGE_BYTES = 256 * 1024;
/** Room kept beside the workspace for the response envelope and, on the job path, the job around it. */
const WORKSPACE_WIRE_HEADROOM_BYTES = 8 * 1024;
/** The first page of every finding: what an answer that names no page carries. */
const FIRST_FINDING_PAGE: ReviewFindingPageRequest = { findingsAfterOrdinal: null, categoryId: null, severity: null, status: null, chapterBlockId: null };

/** The store's own reading of a page: the request frame already holds a renderer's to the same shape. */
function validFindingPage(page: ReviewFindingPageRequest): boolean {
  return isRecord(page) && hasExactKeys(page, ['findingsAfterOrdinal', 'categoryId', 'severity', 'status', 'chapterBlockId', ...(Object.hasOwn(page, 'excludedAfterOrdinal') ? ['excludedAfterOrdinal'] : [])]) &&
    (page.excludedAfterOrdinal == null || (Number.isSafeInteger(page.excludedAfterOrdinal) && page.excludedAfterOrdinal >= 1)) &&
    (page.findingsAfterOrdinal === null || (Number.isSafeInteger(page.findingsAfterOrdinal) && page.findingsAfterOrdinal >= 1)) &&
    (page.categoryId === null || (typeof page.categoryId === 'string' && page.categoryId.length >= 1 && page.categoryId.length <= 48)) &&
    (page.severity === null || REVIEW_FINDING_SEVERITIES.includes(page.severity)) &&
    (page.status === null || REVIEW_FINDING_STATUSES.includes(page.status)) &&
    (page.chapterBlockId === null || (typeof page.chapterBlockId === 'string' && BLOCK_ID_PATTERN.test(page.chapterBlockId)));
}

function wireBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * The page of findings one answer carries: from the cursor on, in ordinal order, at most
 * `MAX_REVIEW_FINDINGS_PER_PAGE`, and no more than the frame leaves once the rest of the workspace is
 * weighed — but always at least one while any remain, so paging always reaches the end.
 */
function findingPage(
  workspace: ReviewWorkspaceProjection,
  run: ReviewRunProjection,
  candidates: ReadonlyArray<ReviewFindingProjection>,
): ReviewRunProjection {
  const budget = Math.min(FINDINGS_PAGE_BYTES, MAX_FRAME_BYTES - WORKSPACE_WIRE_HEADROOM_BYTES - wireBytes(workspace));
  const page: ReviewFindingProjection[] = [];
  let spent = 0;
  for (const finding of candidates) {
    if (page.length >= MAX_REVIEW_FINDINGS_PER_PAGE) break;
    const weight = wireBytes(finding) + 1;
    if (page.length > 0 && spent + weight > budget) break;
    page.push(finding);
    spent += weight;
  }
  return { ...run, findings: page, findingsTruncated: page.length < candidates.length };
}
/** The request frame bounds the same reason and finding identity with these very constants (Stage C). */
const MAX_REASON_CHARACTERS = MAX_REVIEW_FINDING_REASON_CHARACTERS;
const MAX_CHAPTER_TITLE_GRAPHEMES = 40;
const FINDING_ID_PATTERN = REVIEW_FINDING_ID_PATTERN;
const NO_MANUSCRIPT_REASON = '这本书还没有稿件；导入稿件后才能审阅。' as const;
const RUN_ACTIVE_REASON = '这本书有一次审阅正在进行；结束后才能新建审阅。' as const;
const ORPHANED_RUN_DETAIL = '服务在这一类运行期间停止，运行已中断；已完成单元的结果与缺口保留在该类别的账本中。' as const;
const RISK_POINT_PREFIX = '【需人工复核的风险点】' as const;
const UNSTARTED_DETAIL = '尚未开始；继续审阅时从这一类接着审。' as const;
const UNWRITTEN_DETAIL = '运行已结束，发现尚未标到稿件上；继续审阅时写入。' as const;
const INTERRUPTED_DETAIL = '服务在这一类运行期间停止；继续审阅时记为已中断，再接着审其余类别。' as const;
const FAILED_UNRECORDED_DETAIL = '这一类的运行失败了；继续审阅时记下这一结果，再接着审其余类别。' as const;
/** A category not yet begun when the Run stopped for a Series Retrieval Exclusion (Issue #64, S29b): it waits for the editor. */
const STOPPED_UNSTARTED_DETAIL = '这次审阅已停下，这一类没有开始；修改计划并重新授权后在新的一次审阅里进行。' as const;
/** 取消任务 of a stopped Review Run, as each category it ends records (Issue #64, S29b). */
/** What a stale reason names when the exclusion ledger no longer reads (Issue #64 review). */
const UNREADABLE_EXCLUSIONS = '无法读取的书系检索排除记录' as const;
const CANCELLED_DETAIL = '已取消任务：这次审阅不再继续；已经写到稿件上的发现和已形成的结果都保持原样。' as const;
/** A Run waiting to start once online (Issue #760, S74c): a new 审阅 waits for it to start or be cancelled, as a driven one does. */
const RUN_WAITING_REASON = '这本书有一次审阅在等待联网后开始；取消它之后才能新建审阅。' as const;
/** A category of a Run waiting to start once online: nothing of it is sent before Reconnect Preflight starts the Run. */
const WAITING_DETAIL = '联网后开始：恢复联网后，AI7 先核对计划再开始这次审阅；在此之前什么都没有发送。' as const;
/** 取消 of a Run waiting to start once online (OFF-010), as each of its categories records it. */
const WAITING_CANCELLED_DETAIL = '编辑在开始前取消了这次等待联网的审阅；没有发送任何内容，也没有产生用量。' as const;
/** 继续审阅 of a Run waiting to start once online: only Reconnect Preflight starts it, after checking its plan (OFF-008). */
const WAITING_DRIVE_REASON = '这次审阅在等待联网后开始：联网后 AI7 先核对计划再开始；请等待，或取消它。' as const;
export const HOUSE_GUIDELINE_NOT_TRANSMITTABLE = 'REVIEW_GUIDELINE_NOT_TRANSMITTABLE' as const;

/** Why a prepared 书系一致性 plan is no longer approvable: the Book's Series or their knowledge moved since (Issue #64, S29a). */
function seriesKnowledgeMovedReason(label: string): string {
  return `「${label}」所依据的书系或书系知识在准备之后有了变化；请重新准备这次审阅。`;
}

/**
 * Under developer-live, a category whose guideline clauses the house imported is refused before any dispatch (Issue #427,
 * S79a review): those clauses would enter the category's prompt, and the active Provider Processing policy admits only
 * public or synthetic text until the Owner admits house guideline text in a policy revision. Under development-ci nothing
 * is transmitted, so nothing is refused. `null` when nothing stands in the way.
 */
export function houseGuidelineRefusal(entry: ReviewCategoryConfigurationEntry, live: boolean, seriesAdmitted = false): string | null {
  if (!live || entry.executor !== 'review-category-contract') return null;
  // 书系一致性's clauses are the house's own Series Knowledge (Issue #64, S29a), held back exactly as imported guidelines are.
  if (entry.seriesKnowledge !== undefined) {
    return seriesAdmitted ? null : SERIES_POLICY_CLOSED;
  }
  const house = houseGuidelineDocuments(entry);
  if (house.length === 0) return null;
  const named = house.map((document) => `《${document.title}》第 ${document.version} 版`).join('、');
  return `这一类按本社导入的${named}审阅；开发者实时模式下，本社的条款在获准发给模型之前不会发出，这一类暂不能开始。`;
}

/** ADR 0066's tiers read as V2-UX-REV-004's severities (ambiguity A3, decided by the slice). */
const FACTUAL_TIER_SEVERITY: Readonly<Record<FactualSeverityTier, ReviewFindingSeverity>> = { A: 'must', B: 'should', C: 'note' };

const PROVIDER_STATUS_LABELS: Readonly<Record<string, string>> = {
  'remote-denied-local-deterministic': '远程模型绑定被拒绝（0 次实时传输）；由 AI7 本地确定性模型适配器执行',
  'remote-denied-no-route': '远程模型绑定被拒绝，且没有可执行的本地路由；授权后会在派发前阻止',
  'remote-eligible-developer-live': 'developer-live：实时传输受运行边界约束',
  'remote-eligible-ordinary-production': 'ordinary-production：经你配置的模型服务实时传输，受运行边界约束',
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
  learningLedger?: () => import('../learning/ledger.js').EditorialLearningLedger;
  ledgerOf(entry: ReviewCategoryConfigurationEntry, materials?: TaskMaterialBoundary, frozenPromptDigest?: string, latestForBook?: string, preference?: HouseReviewPreferenceUse | null, contractVersion?: 1 | 2): BaselineAnalysisStore;
  /**
   * The house's 本社审阅偏好 for one category of one Book (Issue #911): its use when the category has lines and the kind's one rule
   * names the outbound category, `'closed'` when it has lines and the rule does not, `null` when it has none.
   */
  housePreference?(bookId: string, categoryId: string, kind: string, policy: LaunchPolicyProjection): HouseReviewPreferenceUse | 'closed' | null;
  materialReadings?(boundary: TaskMaterialBoundary): ReadonlyArray<TaskMaterialReading>;
  materialOffers?(bookId: string): NonNullable<ReviewWorkspaceProjection['materials']>;
  baseline(): BaselineAnalysisStore;
}

/** One category as a Review Run froze it. */
interface SnapshotCategory {
  /** Absent on immutable legacy preparations; only new factual Tasks opt in. */
  readonly partialFactualRetentionVersion?: 1;
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
  readonly localPlan?: AnyLocalCheckPlan;
  readonly preinstalledProcedures?: ReadonlyArray<{ categoryId: string; procedure: ProcedureDefinitionPin }>;
  /** By category kind, the version each category Task reads; empty when the house has lines but the selected rule is closed to them. */
  readonly housePreferences?: Readonly<Record<string, HouseReviewPreferenceUse>> | undefined;
  readonly materialReferences?: TaskMaterialBoundary;
  readonly schema: typeof RUN_SCHEMA;
  readonly reviewRunId: string;
  readonly bookId: string;
  readonly ordinal: number;
  readonly createdAt: string;
  readonly manuscript: { readonly manuscriptId: string; readonly branchId: string; readonly revisionId: string; readonly revisionLabel: string; readonly journalSequence: number; readonly workingDigest: string };
  /**
   * `blockIds` only for 当前选区 (Issue #423 review, P2-2): the selection's paragraphs by identity, kept in the canonical record
   * with no schema change, so what the Run marks and whether it may start never depend on positions that move.
   */
  readonly scope: { readonly kind: ReviewScopeKind; readonly label: string; readonly selectedRange: ReviewBlockRange | null; readonly blockIds?: ReadonlyArray<string> };
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
  /** What a range Run left unread after it changed since the category read it (Issue #709); absent reads as none. */
  readonly unread?: UnreadChanges;
}

/** The ledger's one unread-changes fact (Issue #709): the units, the blocks that make them changed, and any cut in the walk. */
type UnreadChanges = ReturnType<BaselineAnalysisStore['unreadChanges']>;
const NO_UNREAD_CHANGES: UnreadChanges = { units: 0, blockIds: new Set(), cut: null };

/**
 * Said beside a category whose walk back through its revisions stopped short (#711 review P3-3): an earlier revision could
 * not be read, so what it read is not known, and a chapter read before it and changed since is not re-read by 只审改动过的章.
 */
export const UNREAD_WALK_CUT_NOTE = '这一类有较早的审阅记录无法核对：在它之前读过、之后又改动的章，只审改动过的章不会重读；需要时请审全书或所选各章。' as const;

/**
 * Said instead when the walk stopped only at its bound (Issue #716): every record it read could be checked, but it looked
 * back no further than the latest {@link UNREAD_WALK_BOUND} reviews of this category.
 */
export const UNREAD_WALK_BOUND_NOTE =
  `这一类的审阅记录很多，只往回查了最近 ${UNREAD_WALK_BOUND} 次审阅：更早读过、之后又改动的章，只审改动过的章不会重读；需要时请审全书或所选各章。` as const;

/** The note a cut walk puts beside its category, worded by why it stopped; `null` for a walk that was not cut. */
export function unreadWalkCutNote(cut: UnreadWalkCut): string | null {
  return cut === null ? null : cut === 'bounded' ? UNREAD_WALK_BOUND_NOTE : UNREAD_WALK_CUT_NOTE;
}

/** A located finding ready to be written with the mark it becomes. */
interface MaterializedFinding {
  readonly output?: 'annotation' | 'change-suggestion';
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
  readonly referencedRuleVersions?: ReadonlyArray<ReferencedRuleVersion>;
}

/** One finding row read back with the mark it names and everything its status is derived from. */
/** What a finding reads of one version of its 修改建议 (Issue #57). */
interface SuggestionVersionView {
  readonly markId: string | null;
  readonly kind: EditorialMarkKind | null;
  readonly markStatus: ReviewMarkStatus | null;
  readonly anchor: string | null;
  readonly from: number | null;
  readonly to: number | null;
  readonly decision: string | null;
  readonly convertedTo: EditorialMarkKind | null;
}

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
  readonly referencedRuleVersions: ReadonlyArray<ReferencedRuleVersion>;
  readonly learningDecisionId: string | null;
  readonly replacement: string | null;
  readonly clauseRef: string | null;
  readonly stateLine: string | null;
  /** The mark the finding reads: its own, or the newest version a conflict saved it as (Issue #57). */
  readonly markId: string | null;
  /** The mark the review made for the finding. */
  readonly originMarkId: string | null;
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
  readonly stateLabel: string;
  readonly detail: string | null;
  readonly pending: boolean;
  readonly materialized: CategoryEvent | null;
  readonly retained?: CategoryEvent | null;
}

interface RunView {
  readonly snapshot: RunSnapshot;
  /** `whenOnline` for an approval made with 联网后开始任务 (Issue #760, S74c), which the Run waits under until it begins. */
  readonly authorization: null | { readonly authorizedAt: string; readonly approvals: ReadonlyMap<string, string>; readonly whenOnline: boolean; readonly startWhen: 'now' | 'idle'; readonly ruleVersionId: string | null };
  readonly driving: boolean;
  readonly categories: ReadonlyArray<CategoryView>;
  readonly findings: ReadonlyArray<FindingView>;
  readonly state: ReviewRunState;
  readonly canContinue: boolean;
  /** What a `scope-changed` Run stopped for (Issue #912): Series material, or a withdrawn 本社审阅偏好 material. */
  readonly scopeStop: 'series-knowledge' | 'house-review-preference' | null;
  /**
   * The categories whose result used Series material excluded afterwards (Issue #64, S29b; SER-026), or read a 本社审阅偏好
   * version whose material was 停止今后使用 afterwards (Issue #912; LAUD-008), each with its marker.
   */
  readonly historicallyAffected: ReadonlyMap<string, string>;
}

/** An approval made 「空闲时处理」 that has not begun (Issue #1089): it waits for quiet, not for the network. */
function waitsForIdleStart(view: Pick<RunView, 'state' | 'authorization'>): boolean {
  return view.state === 'waiting' && view.authorization?.startWhen === 'idle';
}

function runViewStateLabel(view: Pick<RunView, 'state' | 'authorization' | 'canContinue' | 'scopeStop'>): string {
  return waitsForIdleStart(view) ? RUN_WAITING_IDLE_LABEL : reviewRunStateLabel(view.state, view.canContinue, view.scopeStop);
}

/**
 * What the Task Drawer reads of one Review Run (Issue #418, plan slice S72): the Run as it was prepared,
 * where it stands, each category with the plan its own ledger froze, and — while the Run waits for its one
 * approval — why that approval would now be refused, in the words the refusal itself uses (D8).
 */
export interface ReviewRunPlanFacts {
  readonly localPlan?: { readonly digest: string; readonly options: LocalCheckOptions; readonly paragraphs: number; readonly blocks: readonly LocalCheckBlock[] };
  readonly waitingIdle?: boolean;
  /** Each category that reads 本社审阅偏好 with the version it reads; empty when the selected rule is closed to them. */
  readonly housePreferences?: ReadonlyArray<{ readonly categoryLabel: string; readonly preference: HouseReviewPreferenceUse }>;
  readonly materials?: ReadonlyArray<Pick<TaskMaterialReading, 'source' | 'refusal'> & { readonly settledNote?: string }>;
  /** The Run lists 资料库 items and the launch now bound is developer-live, which sends none of them: the plan is refused. */
  readonly materialsRefusedLive?: boolean;
  readonly reviewRunId: string;
  readonly ordinal: number;
  readonly label: string;
  readonly createdAt: string;
  readonly state: ReviewRunState;
  readonly stateLabel: string;
  readonly canContinue: boolean;
  readonly authorizedAt: string | null;
  readonly manuscript: RunSnapshot['manuscript'];
  readonly scope: RunSnapshot['scope'];
  readonly configuration: RunSnapshot['configuration'];
  /** The Task Input revision the Run's Task-backed categories read; the Run's own revision for the leads alone. */
  readonly inputRevision: { readonly revisionId: string; readonly revisionLabel: string; readonly createdForDirtyJournal: boolean };
  /** The launch the categories' ledgers were bound to: the live binding under developer-live, `null` otherwise. */
  readonly live: BaselineAnalysisStore['launch']['live'];
  readonly categories: ReadonlyArray<{
    readonly categoryId: string;
    readonly label: string;
    readonly output: ReviewCategoryConfigurationEntry['output'];
    readonly riskPointsOnly: boolean;
    readonly modelFree: boolean;
    readonly basisStatement: string;
    readonly procedure: { readonly title: string; readonly version: string };
    readonly guidelineDocuments: ReadonlyArray<{ readonly title: string; readonly issuer: string; readonly version: string }>;
    readonly state: ReviewRunCategoryState;
    readonly stateLabel: string;
    readonly detail: string | null;
    readonly task: null | {
      readonly taskIntentId: string;
      readonly modeLabel: string;
      readonly planEnvelopeDigest: string;
      readonly planVersion: number;
      readonly plan: ReviewRunCategoryPlanProjection;
      readonly components: Readonly<Record<string, unknown>>;
      readonly researchReport?: import('../../shared/protocol.js').RunReportProjection | null;
    };
  }>;
  /** Why the one approval would be refused now; empty while the prepared plans still stand, and once approved. */
  readonly staleReasons: ReadonlyArray<string>;
}

export type ReviewRunPrepareInput =
  | {
    phase: 'start';
    bookId: string;
    categoryIds: ReadonlyArray<string>;
    scope: ReviewRunScopeRequest;
    launchPolicy: LaunchPolicyProjection;
    localCheck?: LocalCheckOptions;
    redoOf?: string | null;
    /**
     * The Captured Procedure version the sheet was pre-filled from (Issue #65, S30; ADR 0087 §4), already resolved and checked by
     * its ledger: the Run records it as its pin, with the steps the Book could not take left out and said why.
     */
    procedure?: ReviewRunProcedurePinInput | null;
    materialReferences?: TaskMaterialBoundary;
    /**
     * 准备计划 on a Task Intent Draft (Issue #423, slice 7a; decision 1): exactly one category, its Task — when it has one — a new
     * Task Intent holding the draft's sentence as its goal; the promotion is recorded with the Run, in the write that makes it.
     */
    intentDraft?: ReviewRunIntentDraft;
    seriesId?: string | null;
  }
  | { phase: 'advance'; workId: string }
  | { phase: 'cancel'; workId: string }
  | { phase: 'cancel-all' };

/** A Task Intent Draft a Review Run is prepared from (Issue #423, slice 7a): its version, its sentence, and how its promotion is recorded. */
export interface ReviewRunIntentDraft {
  readonly versionId: string;
  readonly goal: string;
  readonly paragraphs?: number;
  promoted(task: { readonly taskIntentId: string | null; readonly reviewRunId: string }): void;
}

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
  readonly localPlan?: AnyLocalCheckPlan;
  readonly housePreferences?: Readonly<Record<string, HouseReviewPreferenceUse>> | undefined;
  /** The Task Intent Draft the Run is prepared from (Issue #423, slice 7a); absent for every other preparation. */
  readonly intentDraft?: ReviewRunIntentDraft;
  draftReviewRunId?: string;
  readonly redoOf: string | null;
  readonly materialReferences?: TaskMaterialBoundary;
  readonly workId: string;
  readonly bookId: string;
  readonly configuration: ReviewCategoryConfiguration;
  readonly launchPolicy: LaunchPolicyProjection;
  readonly scope: ResolvedReviewScope;
  readonly planned: ReadonlyArray<PlannedCategory>;
  readonly prepared: SnapshotCategory[];
  /** The Captured Procedure pin the Run records when it is written (Issue #65, S30), with the steps it left out. */
  readonly procedure: null | {
    readonly pin: ReviewRunProcedurePinInput;
    readonly leftOut: ReadonlyArray<ProcedureLeftOutStep>;
  };
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
  | { readonly kind: 'local' }
  | { readonly kind: 'done' }
  | { readonly kind: 'write' }
  | { readonly kind: 'start' }
  | ({ readonly kind: 'dispatch' } & ReviewRunHandOff)
  | { readonly kind: 'settle' };

/** A category Run authorized on its ledger and ready for the one execution owner. */
export interface ReviewRunHandOff {
  readonly resume?: boolean;
  readonly runRecordId: string;
  readonly ledger: BaselineAnalysisStore;
}

const DONE: ReviewRunDriveStep = { kind: 'done' };
const WRITE: ReviewRunDriveStep = { kind: 'write' };
const START: ReviewRunDriveStep = { kind: 'start' };
const SETTLE: ReviewRunDriveStep = { kind: 'settle' };

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
  /** The configuration as it applies now (Issue #427, S79a): each guideline document at its latest version. */
  readonly #configuration: () => ReviewCategoryConfiguration;
  readonly #work = new Map<string, PreparationWork>();
  /** The Review Runs being driven in this service lifetime, with the Book each belongs to. */
  readonly #driving = new Map<string, string>();
  readonly #placeWaits = new Map<string, string>();
  /**
   * The waiting Runs Reconnect Preflight is handing to the drive loop now (Issue #760, S74c): the one way a Run approved with
   * 联网后开始任务 begins, and only for the moment of that hand-off. In memory only.
   */
  readonly #preflightAdmitted = new Set<string>();
  /**
   * The approvals to start once online that may still wait (Issue #764), by Review Run: built from the records on the first read
   * of this store's lifetime — every approval of that kind then recorded, so rows written while the store was closed (an import,
   * a merge, a replaced database) are all in it — and kept by the one writer of an approval. It is a superset the records decide:
   * a candidate that began or was settled is dropped when a read finds it so, outside a transaction, and one a rolled-back write
   * added is dropped when a read finds no approval behind it. So a wait is never lost to a rollback, none is invented, and
   * a read costs the candidates and not the history of settled approvals.
   */
  #unsettledApprovals: Map<string, { bookId: string; authorizedAt: string }> | null = null;

  constructor(
    db: DatabaseSync,
    marks: EditorialMarkStore,
    ledgers: ReviewRunLedgers,
    configuration: () => ReviewCategoryConfiguration = () => BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  ) {
    this.#db = db;
    this.#marks = marks;
    this.#ledgers = ledgers;
    this.#configuration = configuration;
    validateLocalStageArtifacts(db);
    for (const row of db.prepare('SELECT DISTINCT review_run_id FROM review_local_stage_artifacts').all()) {
      const runId = String(row.review_run_id);
      const last = readLocalStageArtifacts(db, runId).at(-1)?.record;
      if (last?.state === 'started') this.#recordLocal(this.#run(runId), last.attemptId, 'interrupted', null, '服务已停止；本地检查未完成，尚未生成批注。');
    }
  }

  #localBlocks(branchId: string, scope: RunSnapshot['scope'] | ResolvedReviewScope): LocalCheckBlock[] {
    const range = scope.selectedRange;
    return (this.#db.prepare('SELECT block_id, position, text FROM working_blocks WHERE branch_id = ? AND position >= ? AND position <= ? ORDER BY position')
      .all(branchId, range?.startPosition ?? 1, range?.endPosition ?? Number.MAX_SAFE_INTEGER) as SqlRow[])
      .map((row) => ({ blockId: text(row.block_id), position: integer(row.position), text: text(row.text) }));
  }

  #prepareLocal(input: Extract<ReviewRunPrepareInput, { phase: 'start' }>, head: ManuscriptHead): ReviewRunPreparationProgress {
    requireReview(input.categoryIds.length === 1 && input.categoryIds[0] === LOCAL_CHECK_CATEGORY && input.procedure == null && input.intentDraft === undefined &&
      input.seriesId == null && input.materialReferences === undefined, 'LOCAL_OPTIONS_INVALID', '本地文字检查请单独运行，只读取所选稿件。');
    requireReview(validLocalOptions(input.localCheck), 'LOCAL_OPTIONS_INVALID', '请明确选择本次本地检查的中文正文与数字适用范围。');
    requireReview(input.scope.kind !== 'changed', 'LOCAL_SCOPE_INVALID', '本地文字检查请选择全书、选章或当前选区。');
    const scope = this.#resolveScope(input.scope, this.#chapterOptions(input.bookId, head), head);
    requireReview(scope.kind !== 'changed' && (scope.kind === 'whole' || scope.selectedRange !== null), 'LOCAL_SCOPE_INVALID', '请重新选择本地检查范围。');
    const version = input.localCheck.tables === undefined ? 1 : 3;
    const frozen = { procedure: resolveProcedureDefinition(this.#db, LOCAL_CHECK_PROCEDURE, version).pin, source: localSource(head),
      bookImportId: this.#localBookImport(input.bookId), scope: scope.kind, options: input.localCheck, blocks: this.#localBlocks(head.branchId, scope) };
    const pin = input.localCheck.tables?.houseWordList ?? null;
    const localPlan = localRefusal(() => version === 1 ? freezeLocalPlan(frozen) : freezeLocalPlanV3({ ...frozen, houseWordList: pin === null ? null : { pin, document: new HouseWordLists(this.#db).selectCurrent(pin) } }));
    const entry = version === 1 ? LOCAL_REVIEW_CATEGORY : LOCAL_REVIEW_CATEGORY_V3;
    const category: SnapshotCategory = { position: 1, categoryId: LOCAL_CHECK_CATEGORY, executor: 'local-text-check', entry,
      basisStatement: reviewCategoryBasisStatement(entry) + `；标点：${localPlan.options.punctuation === 'chinese-prose' ? '编辑确认中文正文' : '未启用'}；数字：${numeralBasis(localPlan.options) === 'editor-convention' ? '编辑约定' : numeralBasis(localPlan.options) === 'national-standard' ? '编辑声明在适用范围内' : numeralBasis(localPlan.options) === 'out-of-applicability' ? '不在声明的适用范围内，未检查' : '未启用'}`,
      selectedRange: scope.selectedRange, task: null };
    const reviewRunId = this.#writeRun({ workId: randomUUID(), bookId: input.bookId, configuration: { schema: REVIEW_CATEGORY_CONFIGURATION_SCHEMA, version: '1', categories: [entry] },
      launchPolicy: input.launchPolicy, scope, planned: [], prepared: [category], procedure: null, index: 0, ledgerWorkId: null, redoOf: input.redoOf ?? null, localPlan });
    return { done: true, workId: null, completed: 1, total: 1, bookId: input.bookId, reviewRunId };
  }

  #requireLocalSource(snapshot: RunSnapshot): void {
    const plan = snapshot.localPlan;
    requireReview(plan !== undefined, 'LOCAL_PLAN_INVALID', '本地检查计划缺失。');
    localRefusal(() => validateAnyLocalPlan(plan));
    requireReview(plan.bookImportId === this.#localBookImport(snapshot.bookId), 'LOCAL_IMPORTED_AUTHORITY', '导入的审阅记录只供查看；请在本机新建本地文字检查。');
    const head = this.#head(snapshot.bookId);
    requireReview(head !== null && canonicalJson(localSource(head)) === canonicalJson(plan.source), 'LOCAL_SOURCE_MOVED', '稿件修订或范围已变化；本地检查没有继续，请重新准备。');
    requireReview(canonicalJson(this.#localBlocks(head.branchId, snapshot.scope)) === canonicalJson(plan.blocks), 'LOCAL_SOURCE_MOVED', '本地检查的冻结正文或段落顺序已变化；请重新准备。');
  }

  #localBookImport(bookId: string): string | null {
    const row = this.#db.prepare("SELECT b.merge_id FROM database_merge_books b JOIN database_merges m ON m.merge_id = b.merge_id WHERE b.book_id = ? AND m.outcome = 'applied' ORDER BY b.rowid DESC LIMIT 1").get(bookId);
    return row === undefined ? null : text(row.merge_id);
  }

  #authorizeLocal(snapshot: RunSnapshot, approvals: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>, start: string, ruleVersionId: string | null): void {
    const plan = snapshot.localPlan!;
    requireReview(start === 'now' && ruleVersionId === null && Array.isArray(approvals) && approvals.length === 1 && approvals[0]?.categoryId === LOCAL_CHECK_CATEGORY && approvals[0].planEnvelopeDigest === plan.digest,
      'REVIEW_AUTHORIZATION_STALE', '请明确授权这次本地检查的冻结计划。');
    if (this.#authorizationOf(snapshot.reviewRunId) !== null) return;
    this.#requireLocalSource(snapshot);
    requireReview(!this.#bookIsDriving(snapshot.bookId), 'REVIEW_RUN_ACTIVE', RUN_ACTIVE_REASON);
    requireReview(this.#db.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(snapshot.bookId)?.review_run_id === snapshot.reviewRunId,
      'REVIEW_RUN_SUPERSEDED', '请授权最新准备的本地检查。');
    const authorizedAt = new Date().toISOString();
    const record = canonicalRecord({ schema: AUTHORIZATION_SCHEMA, reviewRunId: snapshot.reviewRunId, authorizedAt, actor: 'editor', interaction: 'authorize-review-run',
      startWhen: 'now', approvals: [{ categoryId: LOCAL_CHECK_CATEGORY, taskIntentId: null, planEnvelopeDigest: plan.digest }] });
    this.#db.prepare('INSERT INTO review_run_authorizations VALUES (?, ?, ?, ?)').run(snapshot.reviewRunId, authorizedAt, record.json, record.digest);
  }

  #recordLocal(snapshot: RunSnapshot, attemptId: string, state: LocalStageState, result: AnyLocalCheckResult | null, detail: string): void {
    const plan = snapshot.localPlan!;
    transact(this.#db, () => {
      const previous = readLocalStageArtifacts(this.#db, snapshot.reviewRunId).at(-1);
      const record: LocalStageArtifact = { schema: plan.schema === 'ai7.review.local-plan/3' ? 'ai7.review.local-stage-artifact/3' : 'ai7.review.local-stage-artifact/1', reviewRunId: snapshot.reviewRunId, categoryId: LOCAL_CHECK_CATEGORY,
        sequence: (previous?.record.sequence ?? 0) + 1, attemptId, state, planDigest: plan.digest, procedure: plan.procedure, source: plan.source,
        previousDigest: previous?.digest ?? null, recordedAt: new Date().toISOString(), result, detail };
      const canonical = canonicalRecord(record);
      this.#db.prepare('INSERT INTO review_local_stage_artifacts VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(snapshot.reviewRunId, record.sequence, attemptId, state, plan.digest, record.recordedAt, canonical.json, canonical.digest);
      readLocalStageArtifacts(this.#db, snapshot.reviewRunId);
    });
  }

  /** The existing driver calls this one local stage without consulting its model execution owner. */
  async runLocal(reviewRunId: string, stopping: () => boolean): Promise<void> {
    const snapshot = this.#run(reviewRunId);
    requireReview(snapshot.localPlan !== undefined && this.#authorizationOf(reviewRunId)?.approvals.get(LOCAL_CHECK_CATEGORY) === snapshot.localPlan.digest,
      'REVIEW_RUN_NOT_AUTHORIZED', '本地检查的精确计划尚未授权。');
    let last = readLocalStageArtifacts(this.#db, reviewRunId).at(-1)?.record;
    if (last !== undefined && !['interrupted', 'completed'].includes(last.state)) return;
    const attemptId = last?.state === 'completed' ? last.attemptId : randomUUID();
    try {
      this.#requireLocalSource(snapshot);
      if (last?.state !== 'completed') {
        this.#recordLocal(snapshot, attemptId, 'started', null, '正在本机检查冻结正文。');
      const result = await checkLocalPlan(snapshot.localPlan, { cancelled: () => stopping() || this.#db.prepare('SELECT state FROM review_local_stage_artifacts WHERE review_run_id = ? ORDER BY sequence DESC LIMIT 1').get(reviewRunId)?.state === 'cancelled' });
        this.#requireLocalSource(snapshot);
        this.#recordLocal(snapshot, attemptId, 'completed', result, `已检查 ${result.paragraphs} 个段落，待生成批注。`);
        last = readLocalStageArtifacts(this.#db, reviewRunId).at(-1)!.record;
        // Persisted completion is a distinct crash boundary; a restart consumes it without re-running rules.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (stopping()) return;
      if (readLocalStageArtifacts(this.#db, reviewRunId).at(-1)?.record.state === 'cancelled') return;
      this.#requireLocalSource(snapshot);
      const result = last!.result!;
      const valid = exactLocalCandidateIds(snapshot.localPlan, result.candidates);
      const findings = result.candidates.filter((candidate) => valid.has(candidate.id)).map((candidate): MaterializedFinding => {
        const replacement = snapshot.localPlan!.schema === 'ai7.review.local-plan/3' ? mechanicalReplacement(candidate) : null;
        const note = anyLocalCandidateNote(snapshot.localPlan!, candidate);
        return { kindRef: `loc_${(snapshot.localPlan!.schema === 'ai7.review.local-plan/3' ? sha256Hex(snapshot.localPlan!.digest + candidate.id) : candidate.id).slice(0, 56)}`,
          output: replacement === null ? 'annotation' : 'change-suggestion', severity: 'note', blockId: candidate.blockId, fromGrapheme: candidate.from, toGrapheme: candidate.to,
          pinnedText: candidate.quote, quote: candidate.quote, note, replacement, clauseId: null,
          stateLine: `${candidate.ruleId}/v1 · ${replacement === null ? '请编辑复核' : '机械修正'}`, body: note,
          basis: [{ label: note, blockId: null, fromGrapheme: null, toGrapheme: null, quote: null }] };
      });
      this.#writeFindings(snapshot, snapshot.categories[0]!, findings, { runRecordId: null, resultSetRevisionId: null, excludedCount: result.excluded.length + result.candidates.length - findings.length,
        outsideSelection: 0, selection: snapshot.scope.kind === 'selection', adapterPin: null, local: { attemptId, result } });
    } catch (error) {
      const current = readLocalStageArtifacts(this.#db, reviewRunId).at(-1)?.record;
      if (current?.state === 'cancelled' || current?.state === 'materialized') return;
      const code = isRecord(error) && typeof error.code === 'string' ? error.code : error instanceof Error && 'code' in error ? String(error.code) : 'LOCAL_CHECK_FAILED';
      const interrupted = stopping();
      // A shutdown during the atomic mark write rolls that write back; the completed stage remains consumable.
      if (interrupted && current?.state === 'completed') return;
      this.#recordLocal(snapshot, current?.attemptId ?? attemptId, interrupted ? 'interrupted' : code === 'LOCAL_SOURCE_MOVED' || code === 'LOCAL_IMPORTED_AUTHORITY' ? 'refused' : 'failed', null,
        interrupted ? '服务已停止；本地检查未完成。' : code === 'LOCAL_SOURCE_MOVED' ? '稿件已变化；请重新准备本地检查。' : '本地检查未完成；请重新准备。');
    }
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
    // A Run waiting to start once online would find its plans replaced (Issue #760): the editor cancels it first.
    requireReview(!this.#bookWaits(bookId), 'REVIEW_RUN_WAITING', RUN_WAITING_REASON);
    // Two preparations of one Book would prepare the same category ledgers' Tasks under each other.
    requireReview(!Array.from(this.#work.values()).some((work) => work.bookId === bookId), 'REVIEW_RUN_PREPARING', '这本书有一次审阅正在准备计划；准备完成后再新建。');
    if (input.categoryIds.includes(LOCAL_CHECK_CATEGORY)) return this.#prepareLocal(input, head);
    requireReview(input.localCheck === undefined, 'LOCAL_OPTIONS_INVALID', '本地检查选项只能用于本地文字检查。');
    // The configuration a preparation starts under is the one its Run snapshots, whatever is imported meanwhile (REV-012);
    // its 书系一致性 is this Book's, with the Series Knowledge revisions it would use pinned (Issue #64, S29a).
    const house = this.#configuration();
    const resolved = this.#forBook(bookId, house);
    const selected = input.seriesId == null ? undefined : [freezeSeriesScope(this.#db, bookId, input.seriesId)];
    const configuration = { ...resolved, categories: resolved.categories.map((entry) => {
      if (!input.categoryIds.includes(entry.categoryId) || entry.executor === 'unavailable') return entry;
      // 书系一致性 reads exactly the knowledge it pinned, whatever Series the other categories were given (Issue #64 review).
      if (entry.seriesKnowledge !== undefined) {
        return { ...entry, seriesScopes: entry.seriesKnowledge.series.filter((series) => entry.seriesKnowledge!.revisions.some((pin) => pin.seriesId === series.seriesId)).map((series) =>
          freezeSeriesScope(this.#db, bookId, series.seriesId, entry.seriesKnowledge!.revisions.filter((pin) => pin.seriesId === series.seriesId))) };
      }
      if (selected === undefined) return entry;
      requireReview(entry.executor === 'review-category-contract', 'SERIES_SCOPE_UNAVAILABLE', '这个审阅类别本次不能参考书系知识。');
      requireReview(seriesKnowledgeAllowed(input.launchPolicy, reviewCategoryKindId(entry.categoryId)),
        'SERIES_SCOPE_UNAVAILABLE', SERIES_POLICY_CLOSED);
      return { ...entry, seriesScopes: selected };
    }) };
    requireReview(Array.isArray(input.categoryIds) && input.categoryIds.length >= 1 && input.categoryIds.length <= configuration.categories.length &&
      new Set(input.categoryIds).size === input.categoryIds.length, 'REVIEW_CATEGORIES_INVALID', '请选择至少一个审阅类别，且不要重复。');
    for (const categoryId of input.categoryIds) {
      requireReview(configuration.categories.some((entry) => entry.categoryId === categoryId), 'REVIEW_CATEGORY_UNKNOWN', '没有这个审阅类别。');
    }
    const chapters = this.#chapterOptions(bookId, head);
    const scope = this.#resolveScope(input.scope, chapters, head);
    const baseline = this.#readBaseline(bookId);
    const procedure = input.procedure === undefined || input.procedure === null
      ? null
      : this.#procedureSelection(bookId, head, configuration, baseline, scope, input.categoryIds, input.procedure);
    requireReview(input.intentDraft === undefined || (input.categoryIds.length === 1 && procedure === null && (input.redoOf ?? null) === null),
      'REVIEW_CATEGORIES_INVALID', '一份任务意图草稿只准备成一个类别的审阅。');
    // Configuration order is the categories' position in the Run, whatever order they were ticked in.
    const planned = configuration.categories
      .filter((entry) => input.categoryIds.includes(entry.categoryId))
      .map((entry, position): PlannedCategory => {
        const reading = this.#readCategory(bookId, head, entry, baseline, undefined);
        requireReview(reading.unavailableReason === null, 'REVIEW_CATEGORY_UNAVAILABLE', `「${entry.label}」：${reading.unavailableReason ?? ''}`);
        if (this.#ledgers.baseline().launch.live !== null && entry.executor !== 'baseline-leads') {
          requireReview(liveReviewRule(input.launchPolicy, entry) !== null, 'REVIEW_CATEGORY_UNAVAILABLE', `「${entry.label}」：${liveReviewUnavailableReason(entry)}`);
        }
        const plan = reviewCategoryScopePlan(entry.executor, entry.unavailableReason, scope, reading.facts);
        requireReview(plan.kind !== 'refused', 'REVIEW_SCOPE_UNAVAILABLE', `「${entry.label}」：${plan.kind === 'refused' ? plan.reason : ''}`);
        return { position: position + 1, entry, plan };
      });
    // 本社审阅偏好 (Issue #911): each model-backed category reads its own lines when its rule names the outbound category.
    const offeredPreferences = planned.filter((category) => category.entry.executor === 'review-category-contract').map((category) => {
      const kind = this.#ledgers.ledgerOf(category.entry).definition.kind;
      return [kind, this.#ledgers.housePreference?.(bookId, category.entry.categoryId, kind, input.launchPolicy) ?? null] as const;
    });
    const usedPreferences = offeredPreferences.flatMap(([kind, offer]) => offer === null || offer === 'closed' ? [] : [[kind, offer] as const]);
    const housePreferences = usedPreferences.length > 0 ? Object.fromEntries(usedPreferences)
      : offeredPreferences.some(([, offer]) => offer === 'closed') ? {} : undefined;
    const work: PreparationWork = {
      ...(housePreferences === undefined ? {} : { housePreferences }),
      ...(input.intentDraft === undefined ? {} : { intentDraft: input.intentDraft }),
      redoOf: input.redoOf ?? null,
      workId: randomUUID(),
      bookId,
      configuration: house,
      launchPolicy: structuredClone(input.launchPolicy),
      ...(input.materialReferences === undefined ? {} : { materialReferences: input.materialReferences }),
      scope,
      planned,
      prepared: [],
      procedure,
      index: 0,
      ledgerWorkId: null,
    };
    this.#work.set(work.workId, work);
    return this.#advance(work);
  }

  /**
   * A preparation from a Captured Procedure (Issue #65, S30; ADR 0087 §4): the scope is the version's slot, every category asked
   * for is one of its steps, and every step not asked for is one this Book cannot take now — 书系一致性 for a Book in no
   * Series, the leads without a baseline analysis — recorded with why. A step whose Series material the editor chooses apart
   * (Issue #66, S31b; REUSE-049, REUSE-050) may also be left unchosen, and is recorded as left out by choice. Any other step
   * the Book could take is never quietly dropped, and nothing beyond its steps is ever added: the Run can do no more than
   * choosing those categories by hand allows. A 当前选区 (Issue #423, S77 deferred item a) is narrower than any slot: the
   * house's procedure runs on the paragraphs 就这段发起任务… handed over whatever its slot says, reading and marking exactly as a
   * category Run on that selection does, and the pin records the selection as the scope it ran under.
   */
  #procedureSelection(
    bookId: string,
    head: ManuscriptHead,
    configuration: ReviewCategoryConfiguration,
    baseline: BaselineReading,
    scope: ResolvedReviewScope,
    categoryIds: ReadonlyArray<string>,
    pin: ReviewRunProcedurePinInput,
  ): NonNullable<PreparationWork['procedure']> {
    requireReview(scope.kind === pin.scope || scope.kind === 'selection', 'REVIEW_PROCEDURE_SCOPE_INVALID',
      `按可复用工序《${pin.title}》运行时，审阅范围要按它的设定选「${pin.scope === 'whole' ? '全书' : pin.scope === 'chapters' ? '选章' : '当前选区'}」，或在稿件里就所选文字发起。`);
    requireReview(categoryIds.every((categoryId) => pin.steps.includes(categoryId)), 'REVIEW_PROCEDURE_STEPS_INVALID',
      `按可复用工序《${pin.title}》运行时，只能审阅它的步骤。`);
    const leftOut: ProcedureLeftOutStep[] = [];
    for (const categoryId of pin.steps) {
      if (categoryIds.includes(categoryId)) continue;
      const entry = configuration.categories.find((candidate) => candidate.categoryId === categoryId);
      let reason: string | null;
      if (entry === undefined) {
        reason = '这一类已不在审阅配置中。';
      } else {
        const reading = this.#readCategory(bookId, head, entry, baseline, undefined);
        const plan = reading.unavailableReason === null ? reviewCategoryScopePlan(entry.executor, entry.unavailableReason, scope, reading.facts) : null;
        reason = reading.unavailableReason ?? (plan !== null && plan.kind === 'refused' ? plan.reason : null);
      }
      if (reason === null && pin.chosenApart.includes(categoryId)) {
        leftOut.push({ categoryId, label: entry?.label ?? categoryId, reason: PROCEDURE_STEP_NOT_CHOSEN, byChoice: true });
        continue;
      }
      requireReview(reason !== null, 'REVIEW_PROCEDURE_STEP_SKIPPED',
        `「${entry?.label ?? categoryId}」这本书现在可以审阅；按可复用工序运行时不能略过它。`);
      leftOut.push({ categoryId, label: entry?.label ?? categoryId, reason, byChoice: false });
    }
    // The pin names the scope the Run runs under: its slot, or the selection it was narrowed to.
    return { pin: scope.kind === 'selection' ? { ...pin, scope: 'selection' } : pin, leftOut };
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
          requireReview(work.intentDraft === undefined, 'REVIEW_CATEGORIES_INVALID', '任务意图草稿只能准备有任务计划的审阅类别。');
          work.prepared.push(this.#snapshotCategory(planned, null));
          work.index += 1;
          continue;
        }
        const ledger = this.#ledgers.ledgerOf(planned.entry, planned.entry.executor === 'review-category-contract' ? work.materialReferences : undefined, undefined, undefined, work.housePreferences?.[this.#ledgers.ledgerOf(planned.entry).definition.kind]);
        const request = this.#ledgerRequest(work, planned.plan.mode, planned.plan.selectedRange, ledger);
        // A draft's intent, plan, Review Run and promotion commit together, including on cancellation, drift or a repeated request.
        const draft = work.intentDraft === undefined ? {} : {
          goal: work.intentDraft.goal as AnalysisGoal,
          intentDraft: { ...work.intentDraft, promoted: (): void => {
            const prepared = ledger.inspect(work.bookId);
            requireReview(prepared.state === 'prepared' && prepared.taskIntent !== null && prepared.planEnvelope !== null,
              'REVIEW_PLAN_UNAVAILABLE', `「${planned.entry.label}」的计划没有准备好。`);
            work.prepared.push(this.#snapshotCategory(planned, prepared));
            work.draftReviewRunId = this.#writeRun(work);
          } },
        };
        const result = work.ledgerWorkId === null
          ? ledger.prepare({ ...request, reconfirm: false, ...draft })
          : ledger.prepare({ phase: 'advance', workId: work.ledgerWorkId });
        if (!result.done) {
          work.ledgerWorkId = result.workId;
          return progress();
        }
        if (work.intentDraft !== undefined) {
          requireReview(work.draftReviewRunId !== undefined, 'REVIEW_PLAN_UNAVAILABLE', '草稿的任务计划没有准备好。');
          this.#work.delete(work.workId);
          return { done: true, workId: null, completed: total, total, bookId: work.bookId, reviewRunId: work.draftReviewRunId };
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
      this.#ledgers.ledgerOf(planned.entry, planned.entry.executor === 'review-category-contract' ? work.materialReferences : undefined, undefined, undefined, work.housePreferences?.[this.#ledgers.ledgerOf(planned.entry).definition.kind]).prepare({ phase: 'cancel', workId: work.ledgerWorkId });
    }
  }

  /** The ledger's own start request for one category: the definition's fixed goal for the mode, never a restated one. */
  #ledgerRequest(work: PreparationWork, mode: AnalysisTaskMode, selectedRange: ReviewBlockRange | null, ledger: BaselineAnalysisStore): {
    phase: 'start'; bookId: string; goal: AnalysisGoal; update: { mode: AnalysisTaskMode; selectedRange: ReviewBlockRange | null } | null; launchPolicy: LaunchPolicyProjection; redoOf?: string;
  } {
    const definition = ledger.definition;
    const prior = work.redoOf === null ? null : ledger.inspect(work.bookId).run;
    return {
      ...(prior?.state === 'cancelled' && prior.transitions.some((entry) => entry.state === 'executing') ? { redoOf: prior.runRecordId } : {}),
      phase: 'start',
      bookId: work.bookId,
      goal: definition.mode(mode).goal as AnalysisGoal,
      update: mode === definition.initialMode ? null : { mode, selectedRange },
      launchPolicy: work.launchPolicy,
    };
  }

  #snapshotCategory(planned: PlannedCategory, projection: AnalysisProjection | null): SnapshotCategory {
    return {
      ...(planned.entry.categoryId === 'factual-review' && planned.entry.executor === 'factual-review-kind' && projection !== null
        ? { partialFactualRetentionVersion: 1 as const } : {}),
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
    if (work.materialReferences !== undefined) {
      const refusal = this.#ledgers.materialReadings!(work.materialReferences).find((reading) => reading.refusal !== null)?.refusal;
      requireReview(refusal === undefined, refusal?.code ?? 'REVIEW_PLAN_CHANGED', refusal?.message ?? '');
    }
    requireReview(head !== null, 'REVIEW_MANUSCRIPT_ABSENT', NO_MANUSCRIPT_REASON);
    if (work.localPlan !== undefined) requireReview(canonicalJson(localSource(head)) === canonicalJson(work.localPlan.source), 'LOCAL_SOURCE_MOVED', '稿件在准备期间已变化；请重新准备。');
    const reviewRunId = randomUUID();
    const createdAt = new Date().toISOString();
    transact(this.#db, () => {
      const last = this.#db.prepare('SELECT max(ordinal) last FROM review_runs WHERE book_id = ?').get(work.bookId) as SqlRow;
      const ordinal = last.last === null ? 1 : integer(last.last) + 1;
      const snapshot: RunSnapshot = {
        ...(work.localPlan === undefined ? {} : { localPlan: work.localPlan }),
        ...(work.materialReferences === undefined ? {} : { materialReferences: work.materialReferences }),
        ...(work.housePreferences === undefined ? {} : { housePreferences: work.housePreferences }),
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
        scope: {
          kind: work.scope.kind,
          label: work.intentDraft?.paragraphs === undefined ? reviewScopeLabel(work.scope)
            : `${reviewScopeLabel(work.scope)}；所选文字已扩展为所在的 ${work.intentDraft.paragraphs} 个完整段落；任务按包含这些段落的阅读范围处理。`,
          selectedRange: work.scope.selectedRange,
          ...(work.scope.blockIds === undefined ? {} : { blockIds: work.scope.blockIds }),
        },
        configuration: this.#configurationPin(work.configuration),
        categories: work.prepared,
        preinstalledProcedures: work.prepared.map((category) => ({ categoryId: category.categoryId,
          procedure: (category.task === null ? null : readProcedurePlanPin(this.#db, category.task.planEnvelopeDigest)) ?? resolveProcedureDefinition(this.#db, category.executor === 'local-text-check' ? LOCAL_CHECK_PROCEDURE : reviewProcedureId(category.categoryId), category.executor === 'local-text-check' ? work.localPlan?.procedure.version : undefined).pin })),
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
      const preferences = new HouseReviewPreferenceLedger(this.#db, this.#ledgers.learningLedger);
      for (const category of work.prepared) {
        if (category.task === null) continue;
        const preference = work.housePreferences?.[category.task.kind];
        if (preference !== undefined) preferences.pin(reviewRunId, category.task.taskIntentId, category.task.planEnvelopeDigest, preference);
      }
      // The exact Captured Procedure version the Run was prepared from, pinned with it (Issue #65, S30; ADR 0087 §4).
      if (work.procedure !== null) {
        // A version stopped while the preparation advanced is not pinned (Issue #66, S31 review P3-1): its 停用… preview could
        // not name this Run, so the preparation ends here and the editor chooses again.
        requireReview(!capturedVersionStopped(this.#db, work.procedure.pin.versionId), 'REVIEW_PROCEDURE_STALE',
          `可复用工序《${work.procedure.pin.title}》第 ${work.procedure.pin.version} 版在准备期间已停用；请重新选择它。`);
        recordReviewRunProcedurePin(this.#db, reviewRunId, work.procedure.pin, work.prepared.map((category) => category.categoryId),
          work.procedure.leftOut, createdAt);
      }
      // The Task Intent Draft the Run was prepared from (Issue #423, slice 7a): promoted with the Run, once.
      work.intentDraft?.promoted({ taskIntentId: work.prepared[0]?.task?.taskIntentId ?? null, reviewRunId });
    });
    return reviewRunId;
  }

  #configurationPin(configuration: ReviewCategoryConfiguration): { schema: string; version: string; digest: string } {
    return {
      schema: configuration.schema,
      version: configuration.version,
      digest: reviewCategoryConfigurationDigest(configuration),
    };
  }

  // ---- the one approval ---------------------------------------------------------------------------

  /**
   * The editor's one approval of a prepared Run (B1): every Task-backed category's exact plan digest,
   * recorded once. Each plan must still be the one its category ledger would authorize now — the latest
   * Task, still prepared, with no pending Plan Revision — so an approval never names a plan already
   * stale. The ledgers' own authorizations are written later, one category at a time, when the drive
   * loop reaches each; a plan that moves in between is refused there, with the ledger's reason.
   *
   * A full governor never refuses the approval: the driver waits for a place before authorizing the next category
   * (#1080).
   */
  recordAuthorization(
    bookId: string,
    reviewRunId: string,
    planDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>,
    start: 'now' | 'when-online' | 'idle' = 'now',
    ruleVersionId: string | null = null,
  ): void {
    const snapshot = this.#runOfBook(bookId, reviewRunId);
    if (snapshot.localPlan !== undefined) return this.#authorizeLocal(snapshot, planDigests, start, ruleVersionId);
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
    requireReview(ruleVersionId === null || UUID_PATTERN.test(ruleVersionId), 'REVIEW_AUTHORIZATION_INVALID', '默认执行规则版本无效。');
    requireReview(ruleVersionId === null || tasks.every((category) => {
      const ledger = this.#categoryLedger(category);
      return ledger.launch.live === null || ledger.launch.policy?.providerProcessing.admittedRules.some((rule) =>
        rule.taskKinds.includes(ledger.definition.kind) && rule.matchingActiveDefaultExecutionRuleAllowed === true);
    }), 'ANALYSIS_ORIGIN_NOT_ADMITTED', '当前模型处理规则未允许审阅快速开始。');
    requireReview(!this.#materialsRefusedLive(snapshot), 'REVIEW_MATERIAL_UNAVAILABLE', TASK_MATERIAL_LIVE_UNAVAILABLE);
    const unavailableMaterial = this.#materialReadings(snapshot).find((reading) => reading.refusal !== null)?.refusal;
    requireReview(unavailableMaterial === undefined, unavailableMaterial?.code ?? 'REVIEW_PLAN_CHANGED', unavailableMaterial?.message ?? '');
    const latest = this.#db.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(bookId) as SqlRow;
    requireReview(text(latest.review_run_id) === reviewRunId, 'REVIEW_RUN_SUPERSEDED', '这次审阅的计划已被之后准备的一次取代；请授权最新的一次。');
    requireReview(!this.#bookIsDriving(bookId), 'REVIEW_RUN_ACTIVE', RUN_ACTIVE_REASON);
    // A Run prepared from a Captured Procedure version stopped since (ADR 0087 §5), or one this house does not hold (Issue #65
    // review), is prepared again, never authorized — whatever its plans say.
    const procedure = procedurePinRefusal(this.#db, reviewRunId);
    requireReview(procedure === null, procedure?.code ?? 'REVIEW_PROCEDURE_STOPPED', procedure?.message ?? '');
    // A 当前选区 whose paragraphs were removed or reordered since it was prepared is chosen again, never started (P2-2).
    requireReview(!this.#selectionMoved(snapshot), 'REVIEW_PLAN_CHANGED', SELECTION_MOVED_REASON);
    for (const category of tasks) {
      const moved = this.#deliverablesMoved(bookId, category.entry);
      requireReview(moved === null, 'REVIEW_PLAN_CHANGED', moved ?? '');
      const projection = this.#categoryLedger(category).inspect(bookId);
      requireReview(projection.taskIntent?.taskIntentId === category.task!.taskIntentId && projection.state === 'prepared' &&
        projection.actions.canAuthorize && projection.planEnvelope?.digest === category.task!.planEnvelopeDigest,
      'REVIEW_PLAN_CHANGED', `「${category.entry.label}」的计划已经变化；请重新准备这次审阅。`);
      // An exclusion in force now, or one recorded since the plan was prepared even if ended since, refuses the approval in its
      // own words before any other move is named (Issue #64, S29b; SER-023, SER-027).
      const excluded = this.#excludedTargets(category, snapshot.createdAt);
      requireReview(excluded.length === 0, SERIES_RETRIEVAL_SCOPE_CHANGED, seriesScopeChangedReason(category.entry.label, excluded));
      // A 本社审阅偏好 version the plan pinned whose material was 停止今后使用 since is never approved (Issue #912; LAUD-007).
      const withdrawn = this.#withdrawnInfluence(category);
      requireReview(withdrawn === null, LEARNING_INFLUENCE_WITHDRAWN, withdrawn === null ? '' : influenceWithdrawnReason(category.entry.label, withdrawn));
      requireReview(!this.#seriesKnowledgeMoved(bookId, category), 'REVIEW_PLAN_CHANGED', seriesKnowledgeMovedReason(category.entry.label));
    }
    // A Run approved to start once online waits in Connectivity Wait and takes no place until Reconnect Preflight starts it
    // (Issue #760, S74c). An immediate approval is recorded even when full; the driver queues for a place (ADR 0095 §2).
    const authorizedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: AUTHORIZATION_SCHEMA,
      reviewRunId,
      authorizedAt,
      actor: 'editor',
      interaction: 'authorize-review-run',
      ...(ruleVersionId === null ? {} : { origin: 'default-execution-rule', ruleVersionId }),
      // 联网后开始任务 (OFF-005): the same one approval, which the Run waits under. An approval that starts now carries no key,
      // so every record written before this one reads exactly as it did.
      ...(start === 'when-online' ? { start: 'when-online' } : {}),
      startWhen: start === 'idle' ? 'idle' : 'now',
      approvals: tasks.map((category) => ({
        categoryId: category.categoryId,
        taskIntentId: category.task!.taskIntentId,
        planEnvelopeDigest: category.task!.planEnvelopeDigest,
      })),
    });
    this.#db.prepare('INSERT INTO review_run_authorizations(review_run_id, authorized_at, canonical_json, sha256) VALUES (?, ?, ?, ?)')
      .run(reviewRunId, authorizedAt, record.json, record.digest);
    if (start === 'when-online') this.#unsettledApprovals?.set(reviewRunId, { bookId, authorizedAt });
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
    const snapshot = this.#snapshotOf(row);
    // An editor's plan revision belongs to the same category Task. Historical approvals retain their exact digests.
    const authorized = this.#authorizationOf(reviewRunId);
    if (authorized !== null) return { ...snapshot, categories: snapshot.categories.map((category) =>
      this.#withPlanDigest(category, authorized.approvals.get(category.categoryId) ?? category.task?.planEnvelopeDigest ?? '')) };
    const newest = this.#db.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(snapshot.bookId) as SqlRow;
    if (text(newest.review_run_id) !== reviewRunId) return snapshot;
    return { ...snapshot, categories: snapshot.categories.map((category) => {
      if (category.task === null) return category;
      const version = this.#db.prepare(`SELECT v.plan_envelope_sha256 FROM analysis_plan_versions v
        JOIN analysis_plan_revisions r ON r.plan_revision_id = v.plan_revision_id
        WHERE v.task_intent_id = ? AND r.trigger_kind = 'plan-edit' ORDER BY v.ordinal DESC LIMIT 1`).get(category.task.taskIntentId) as SqlRow | undefined;
      return version === undefined ? category : this.#withPlanDigest(category, text(version.plan_envelope_sha256));
    }) };
  }

  #withPlanDigest(category: SnapshotCategory, digest: string): SnapshotCategory {
    const task = category.task;
    if (task === null || task.planEnvelopeDigest === digest) return category;
    const frozen = this.#categoryLedger(category).frozenPlan(task.taskIntentId, digest);
    const provider = frozen.components['provider-resolution-plan'];
    requireReview(isRecord(provider), 'REVIEW_RECORD_INVALID', '审阅类别的模型服务计划缺失。');
    const ceiling = provider.runBudgetCeiling;
    requireReview(ceiling === 'unset' || (isRecord(ceiling) && typeof ceiling.maxTotalTokens === 'number'),
      'REVIEW_RECORD_INVALID', '审阅类别的预算上限无效。');
    return { ...category, task: { ...task, planEnvelopeDigest: digest, plan: { ...task.plan,
      budgetCeilingLabel: ceiling === 'unset' ? '未设置任务预算上限' : `任务运行预算上限：${ceiling.maxTotalTokens} tokens` } } };
  }

  /**
   * Whether a 当前选区 Run's paragraphs are gone from the working manuscript, or no longer in the order the selection named them
   * (Issue #423 review, P2-2). Words typed inside them, and paragraphs added around or between them, move nothing: the Run reads
   * and marks by block identity.
   */
  #selectionMoved(snapshot: RunSnapshot): boolean {
    const blockIds = snapshot.scope.kind === 'selection' ? snapshot.scope.blockIds : undefined;
    if (blockIds === undefined) return false;
    const read = this.#db.prepare('SELECT position FROM working_blocks WHERE branch_id = ? AND block_id = ?');
    let previous = 0;
    for (const blockId of blockIds) {
      const row = read.get(snapshot.manuscript.branchId, blockId) as SqlRow | undefined;
      if (row === undefined || integer(row.position) <= previous) return true;
      previous = integer(row.position);
    }
    return false;
  }

  #runOfBook(bookId: string, reviewRunId: string): RunSnapshot {
    this.#requireBook(bookId);
    const snapshot = this.#run(reviewRunId);
    requireReview(snapshot.bookId === bookId, 'REVIEW_RUN_NOT_FOUND', '这次审阅不属于当前图书。');
    return snapshot;
  }

  /** The Book check alone, for a caller about to hand a Run to the Book-agnostic drive loop. */
  requireRunOfBook(bookId: string, reviewRunId: string): void {
    this.#runOfBook(bookId, reviewRunId);
  }

  controlTasks(bookId: string, reviewRunId: string): Array<{
    categoryId: string; label: string; taskIntentId: string; planEnvelopeDigest: string; ledger: BaselineAnalysisStore;
  }> {
    return this.#runOfBook(bookId, reviewRunId).categories.flatMap((category) => category.task === null ? [] : [{
      categoryId: category.categoryId, label: category.entry.label, taskIntentId: category.task.taskIntentId,
      planEnvelopeDigest: category.task.planEnvelopeDigest, ledger: this.#categoryLedger(category),
    }]);
  }

  ledgerForRun(runRecordId: string): BaselineAnalysisStore {
    const row = this.#db.prepare(`SELECT rr.review_run_id, rr.book_id FROM review_runs rr
      JOIN json_each(rr.canonical_json, '$.categories') c
      JOIN analysis_run_records r ON r.task_intent_id = json_extract(c.value, '$.task.taskIntentId')
      WHERE r.run_record_id = ?`).get(runRecordId) as SqlRow | undefined;
    requireReview(row !== undefined, 'REVIEW_RUN_NOT_FOUND', '运行不属于审阅。');
    const tasks = this.controlTasks(text(row.book_id), text(row.review_run_id));
    const found = tasks.find((task) => this.#runRecordOf(task.taskIntentId) === runRecordId);
    requireReview(found !== undefined, 'REVIEW_RECORD_INVALID', '审阅类别的运行记录缺失。');
    return found.ledger;
  }

  defaultRuleVersion(reviewRunId: string): string | null {
    return this.#authorizationOf(reviewRunId)?.ruleVersionId ?? null;
  }

  paused(reviewRunId: string): boolean {
    const snapshot = this.#run(reviewRunId);
    return this.controlTasks(snapshot.bookId, reviewRunId).some((task) => {
      const runRecordId = this.#runRecordOf(task.taskIntentId);
      const state = runRecordId === null ? null : task.ledger.currentRunState(runRecordId);
      return state === 'paused' || state === 'resumable' || state === 'awaiting-clarification';
    });
  }

  /** Cancel categories not yet dispatched; completed findings stay on their original ledgers. */
  cancelRemaining(bookId: string, reviewRunId: string): void {
    const snapshot = this.#runOfBook(bookId, reviewRunId);
    requireReview(this.#authorizationOf(reviewRunId) !== null, 'REVIEW_RUN_NOT_AUTHORIZED', '这次审阅尚未开始。');
    if (snapshot.localPlan !== undefined) {
      const last = readLocalStageArtifacts(this.#db, reviewRunId).at(-1)?.record;
      if (last === undefined || last.state === 'started' || last.state === 'interrupted' || last.state === 'completed') this.#recordLocal(snapshot, last?.attemptId ?? randomUUID(), 'cancelled', null, CANCELLED_DETAIL);
      return;
    }
    transact(this.#db, () => {
      for (const category of snapshot.categories) {
        if (this.#events(reviewRunId, category.categoryId).length === 0 &&
            (category.task === null || this.#runRecordOf(category.task.taskIntentId) === null)) {
          this.#recordEvent(reviewRunId, category.categoryId, 'refused', CANCELLED_DETAIL, { extra: { code: REVIEW_RUN_CANCELLED } });
        }
      }
    });
  }

  finishCancelled(bookId: string, reviewRunId: string): void {
    for (const task of this.controlTasks(bookId, reviewRunId)) {
      const runId = this.#runRecordOf(task.taskIntentId);
      if (runId === null || task.ledger.currentRunState(runId) !== 'cancelled') continue;
      this.settle(reviewRunId, task.categoryId);
      if (this.step(reviewRunId, task.categoryId).kind === 'write') this.write(reviewRunId, task.categoryId);
    }
  }

  redoRequest(bookId: string, reviewRunId: string) {
    const snapshot = this.#runOfBook(bookId, reviewRunId);
    requireReview(!this.#driving.has(reviewRunId) && this.#stoppedFor(reviewRunId) === 'cancelled',
      'ANALYSIS_REDO_STALE', '这次审阅需要先取消，才能改计划重做。');
    const head = this.#head(bookId);
    requireReview(head !== null, 'REVIEW_MANUSCRIPT_ABSENT', NO_MANUSCRIPT_REASON);
    const chapters = this.#chapterOptions(bookId, head).chapters;
    const range = snapshot.scope.selectedRange;
    const from = range === null ? null : chapters.find((chapter) => chapter.position === range.startPosition)?.blockId ?? null;
    const to = range === null ? null : chapters.find((chapter) => chapter.endPosition === range.endPosition)?.blockId ?? null;
    const scope: ReviewRunScopeRequest = { kind: snapshot.scope.kind,
      fromChapterBlockId: snapshot.scope.kind === 'selection' ? snapshot.scope.blockIds?.[0] ?? null : from,
      toChapterBlockId: snapshot.scope.kind === 'selection' ? snapshot.scope.blockIds?.at(-1) ?? null : to };
    return { categoryIds: snapshot.categories.map((category) => category.categoryId), scope, redoOf: reviewRunId,
      materialIds: snapshot.materialReferences?.references.map((reference) => reference.materialId) ?? [] };
  }

  /**
   * What the Task Drawer shows of one Review Run (Issue #418, plan slice S72). Each Task-backed category's
   * plan is read back from its own ledger by the envelope digest the Run froze, so an older Run keeps its
   * own plans after later Runs prepared newer ones. While the Run waits for its one approval, the checks
   * `recordAuthorization` makes are made here too — a newer Run, a category plan that moved — and what
   * they would refuse with is reported, never acted on. Nothing is written.
   */
  planFacts(bookId: string, reviewRunId: string): ReviewRunPlanFacts {
    const snapshot = this.#runOfBook(bookId, reviewRunId);
    const view = this.#runStateView(snapshot);
    const categories = view.categories.map((categoryView) => {
      const { category } = categoryView;
      const frozen = category.task === null ? null : this.#categoryLedger(category).frozenPlan(category.task.taskIntentId, category.task.planEnvelopeDigest);
      const inspected = category.task === null ? null : this.#categoryLedger(category).inspect(bookId);
      const researchReport = inspected?.taskIntent?.taskIntentId === category.task?.taskIntentId
        ? inspected?.taskOutcome?.report ?? null
        : inspected?.history?.entries.find((entry) => entry.producingRun.taskIntentId === category.task?.taskIntentId)?.report ?? null;
      return {
        categoryId: category.categoryId,
        label: category.entry.label,
        output: category.entry.output,
        riskPointsOnly: category.entry.riskPointsOnly,
        modelFree: category.executor === 'baseline-leads' || category.executor === 'local-text-check',
        basisStatement: category.basisStatement,
        procedure: { title: category.entry.procedure.title, version: category.entry.procedure.version },
        guidelineDocuments: category.entry.guidelineDocuments.map((document) => ({ title: document.title, issuer: document.issuer, version: document.version })),
        state: categoryView.state,
        stateLabel: categoryView.stateLabel,
        detail: categoryView.detail,
        task: category.task === null || frozen === null ? null : {
          taskIntentId: category.task.taskIntentId,
          modeLabel: category.task.modeLabel,
          planEnvelopeDigest: category.task.planEnvelopeDigest,
          planVersion: frozen.planVersion,
          plan: category.task.plan,
          components: frozen.components,
          researchReport,
        },
        checkpoint: frozen?.checkpoint ?? null,
      };
    });
    const staleReasons: string[] = [];
    if (snapshot.localPlan !== undefined && view.authorization === null) {
      try { this.#requireLocalSource(snapshot); } catch (error) { staleReasons.push(error instanceof Error ? error.message : '本地检查来源已变化。'); }
    }
    if (view.authorization === null) {
      if (this.#materialsRefusedLive(snapshot)) staleReasons.push(TASK_MATERIAL_LIVE_UNAVAILABLE);
      staleReasons.push(...this.#materialReadings(snapshot).flatMap((reading) => reading.refusal === null ? [] : [reading.refusal.message]));
      const latest = this.#db.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(bookId) as SqlRow;
      if (text(latest.review_run_id) !== reviewRunId) {
        staleReasons.push('这次审阅的计划已被之后准备的一次取代；请授权最新的一次。');
      } else {
        const procedure = procedurePinRefusal(this.#db, reviewRunId);
        if (procedure !== null) staleReasons.push(procedure.message);
        if (this.#selectionMoved(snapshot)) staleReasons.push(SELECTION_MOVED_REASON);
        for (const category of snapshot.categories) {
          if (category.task === null) continue;
          let current: AnalysisProjection | null = null;
          try {
            current = this.#categoryLedger(category).inspect(bookId);
          } catch (error) {
            if (!(error instanceof AnalysisError)) throw error;
          }
          if (current === null || current.taskIntent?.taskIntentId !== category.task.taskIntentId || current.state !== 'prepared' ||
              !current.actions.canAuthorize || current.planEnvelope?.digest !== category.task.planEnvelopeDigest) {
            staleReasons.push(`「${category.entry.label}」的计划已经变化；请重新准备这次审阅。`);
          } else if (this.#unverifiedTargets(category, snapshot.createdAt) !== null) {
            staleReasons.push(seriesScopeChangedReason(category.entry.label, this.#unverifiedTargets(category, snapshot.createdAt)!));
          } else if (this.#withdrawnInfluence(category) !== null) {
            staleReasons.push(influenceWithdrawnReason(category.entry.label, this.#withdrawnInfluence(category)!));
          } else if (this.#seriesKnowledgeMoved(bookId, category)) {
            staleReasons.push(seriesKnowledgeMovedReason(category.entry.label));
          }
          const deliverablesMoved = this.#deliverablesMoved(bookId, category.entry);
          if (deliverablesMoved !== null) staleReasons.push(deliverablesMoved);
        }
      }
    }
    const firstCheckpoint = categories.find((category) => category.checkpoint !== null)?.checkpoint ?? null;
    const firstTask = snapshot.categories.find((category) => category.task !== null);
    return {
      ...(snapshot.localPlan === undefined ? {} : { localPlan: { digest: snapshot.localPlan.digest, options: snapshot.localPlan.options, paragraphs: snapshot.localPlan.blocks.length, blocks: snapshot.localPlan.blocks } }),
      ...(this.#materialsRefusedLive(snapshot) ? { materialsRefusedLive: true } : {}),
      ...(snapshot.materialReferences === undefined ? {} : { materials: this.#materialReadings(snapshot).map((reading) => view.authorization === null ? reading : taskMaterialSettled(reading)) }),
      ...(snapshot.housePreferences === undefined ? {} : { housePreferences: snapshot.categories.flatMap((category) => {
        const preference = category.task === null ? undefined : snapshot.housePreferences![category.task.kind];
        return preference === undefined ? [] : [{ categoryLabel: category.entry.label, preference }];
      }) }),
      reviewRunId: snapshot.reviewRunId,
      ordinal: snapshot.ordinal,
      label: `第 ${snapshot.ordinal} 次`,
      createdAt: snapshot.createdAt,
      state: view.state,
      stateLabel: runViewStateLabel(view),
      canContinue: view.canContinue,
      authorizedAt: view.authorization?.authorizedAt ?? null,
      waitingIdle: waitsForIdleStart(view),
      manuscript: snapshot.manuscript,
      scope: snapshot.scope,
      configuration: snapshot.configuration,
      inputRevision: firstCheckpoint === null
        ? { revisionId: snapshot.manuscript.revisionId, revisionLabel: snapshot.manuscript.revisionLabel, createdForDirtyJournal: false }
        : { revisionId: firstCheckpoint.revisionId, revisionLabel: firstCheckpoint.revisionLabel, createdForDirtyJournal: firstCheckpoint.createdForDirtyJournal },
      live: snapshot.localPlan !== undefined ? null : (firstTask === undefined ? this.#ledgers.baseline() : this.#categoryLedger(firstTask)).launch.live,
      categories: categories.map(({ checkpoint: _checkpoint, ...category }) => category),
      staleReasons,
    };
  }

  // ---- 可复用工序 (Issue #65, plan slice S30; ADR 0087) -----------------------------------------------------

  /**
   * One Review Run of the Book as a capture's source (ADR 0087 §2): its label and scope, and what may be kept of it, read from
   * the records as the Run itself is read, against the configuration as it applies now. A read.
   */
  captureSource(bookId: string, reviewRunId: string): {
    readonly reviewRunId: string;
    readonly ordinal: number;
    readonly scopeKind: ReviewScopeKind;
    readonly scopeLabel: string;
    readonly unavailableReason: string | null;
    readonly steps: ReadonlyArray<ProcedureCaptureStep>;
  } {
    const view = this.#runStateView(this.#runOfBook(bookId, reviewRunId));
    const { unavailableReason, steps } = this.#captureOf(view);
    return {
      reviewRunId,
      ordinal: view.snapshot.ordinal,
      scopeKind: view.snapshot.scope.kind,
      scopeLabel: view.snapshot.scope.label,
      unavailableReason,
      steps,
    };
  }

  #captureOf(view: Pick<RunView, 'authorization' | 'state' | 'canContinue' | 'categories'>): ReturnType<typeof procedureCaptureSource> {
    return procedureCaptureSource({
      authorized: view.authorization !== null,
      state: view.state,
      canContinue: view.canContinue,
      categories: view.categories.map((category) => ({ entry: category.category.entry, state: category.state, stateLabel: category.stateLabel })),
    }, this.#configuration());
  }

  /** The configuration entries a Run snapshotted, in its order: what a Captured Procedure's ceiling is held to (ADR 0087 §3). */
  snapshotEntries(reviewRunId: string): ReadonlyArray<ReviewCategoryConfigurationEntry> {
    return this.#run(reviewRunId).categories.map((category) => category.entry);
  }

  /** A Run's ordinal, for naming it: 第 N 次. */
  ordinalOf(reviewRunId: string): number {
    return this.#run(reviewRunId).ordinal;
  }

  /**
   * Where one Run stands, as a Captured Procedure version's linked work and its `停用…` preview name it (Issue #66, S31): its
   * state and words, whether it was approved, whether 继续审阅 is left, and whether it is still its Book's newest Run — the only
   * one a prepared Run's approval may name. A read.
   */
  runStatus(reviewRunId: string): {
    bookId: string; ordinal: number; state: ReviewRunState; stateLabel: string; authorized: boolean; canContinue: boolean; newestOfBook: boolean;
  } {
    const snapshot = this.#run(reviewRunId);
    const view = this.#runStateView(snapshot);
    const newest = this.#db.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(snapshot.bookId) as SqlRow;
    return {
      bookId: snapshot.bookId,
      ordinal: snapshot.ordinal,
      state: view.state,
      stateLabel: runViewStateLabel(view),
      authorized: view.authorization !== null,
      canContinue: view.canContinue,
      newestOfBook: text(newest.review_run_id) === reviewRunId,
    };
  }

  /**
   * What each category of the configuration can do for one Book over one scope kind now, as the 新建审阅 sheet offers it: why
   * it cannot, or `null` when it can (ADR 0087 §4). A read.
   */
  categoryAvailability(bookId: string, kind: ReviewScopeKind): ReadonlyMap<string, string | null> {
    this.#requireBook(bookId);
    const head = this.#head(bookId);
    const baseline = head === null ? { revision: null, error: null } : this.#readBaseline(bookId);
    const chapters = head === null ? { basis: 'outline' as const, chapters: [] } : this.#chapterOptions(bookId, head);
    const readings = this.#forBook(bookId, this.#configuration()).categories.map((entry) => this.#readCategory(bookId, head, entry, baseline, undefined));
    return new Map(readings.map((reading) => {
      const scope = this.#workspaceCategory(reading, chapters).scopes[kind];
      return [reading.entry.categoryId, scope.available ? null : scope.unavailableReason ?? '这一类暂不可用。'] as const;
    }));
  }

  #categoryLedger(category: SnapshotCategory): BaselineAnalysisStore {
    if (category.task === null || category.entry.executor !== 'review-category-contract') return this.#ledgers.ledgerOf(category.entry);
    const frozen = this.#ledgers.ledgerOf(category.entry).frozenPlan(category.task.taskIntentId, category.task.planEnvelopeDigest);
    const execution = frozen.components['execution-plan'] as Record<string, unknown>;
    const envelope = frozen.components['plan-envelope'] as Record<string, unknown>;
    const contractVersion = isRecord(envelope.contractIdentity) && envelope.contractIdentity.version === 2 ? 2 : 1;
    const preference = new HouseReviewPreferenceLedger(this.#db, this.#ledgers.learningLedger).pinned(category.task.taskIntentId);
    const materialPromptDigest = clarificationPlanBaseDigest(execution, envelope);
    requireReview(materialPromptDigest !== null, 'REVIEW_RECORD_INVALID', '任务澄清指令的基础契约与计划不一致。');
    if (execution.materialReferences === undefined) return this.#ledgers.ledgerOf(category.entry, undefined, materialPromptDigest, undefined, preference, contractVersion);
    const references = taskMaterialSources(execution.materialReferences);
    const intent = this.#db.prepare('SELECT book_id FROM analysis_task_intents WHERE task_intent_id = ?').get(category.task.taskIntentId) as SqlRow;
    return this.#ledgers.ledgerOf(category.entry, { bookId: text(intent.book_id), references }, materialPromptDigest, undefined, preference, contractVersion);
  }

  #materialReadings(snapshot: RunSnapshot): ReadonlyArray<TaskMaterialReading> {
    return snapshot.materialReferences === undefined ? [] : this.#ledgers.materialReadings!(snapshot.materialReferences);
  }

  #snapshotOf(row: SqlRow): RunSnapshot {
    const record = recordOf(text(row.canonical_json), text(row.sha256)) as unknown as RunSnapshot;
    requireReview(record.schema === RUN_SCHEMA && record.reviewRunId === text(row.review_run_id) && record.bookId === text(row.book_id) &&
      record.ordinal === integer(row.ordinal) && Array.isArray(record.categories), 'REVIEW_RECORD_INVALID', '审阅记录无效。');
    // Absence is legacy, never inferred or backfilled. Unknown/malformed versions fail closed, including local snapshots.
    for (const category of record.categories) {
      if (!Object.hasOwn(category, 'partialFactualRetentionVersion')) continue;
      requireReview(category.partialFactualRetentionVersion === 1 && record.localPlan === undefined &&
        category.categoryId === 'factual-review' && category.executor === 'factual-review-kind' && category.task != null &&
        category.task.kind === 'factual-review' && UUID_PATTERN.test(category.task.taskIntentId) && DIGEST_PATTERN.test(category.task.planEnvelopeDigest),
      'REVIEW_RECORD_INVALID', '部分事实核查保留版本或任务绑定无效。');
    }
    if (record.localPlan !== undefined) {
      validateAnyLocalPlan(record.localPlan);
      requireReview(record.categories.length === 1 && record.categories[0]?.executor === 'local-text-check' && record.categories[0].task === null &&
        canonicalJson(record.localPlan.procedure) === canonicalJson(resolveProcedureDefinition(this.#db, LOCAL_CHECK_PROCEDURE, record.localPlan.procedure.version).pin), 'REVIEW_RECORD_INVALID', '本地检查工序绑定无效。');
    }
    if (record.materialReferences !== undefined) {
      requireReview(record.materialReferences.bookId === record.bookId, 'REVIEW_RECORD_INVALID', '审阅参考资料记录无效。');
      taskMaterialSources(record.materialReferences.references);
    }
    return record;
  }

  backgroundOrigin(reviewRunId: string): boolean { return this.#authorizationOf(reviewRunId)?.startWhen === 'idle'; }

  waitsForIdle(reviewRunId: string): boolean {
    return this.#authorizationOf(reviewRunId)?.startWhen === 'idle' && this.#waits(this.#run(reviewRunId));
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
      whenOnline: record.start === 'when-online',
      startWhen: record.startWhen === 'idle' ? 'idle' : 'now',
      ruleVersionId: record.origin === 'default-execution-rule' && typeof record.ruleVersionId === 'string' ? record.ruleVersionId : null,
    };
  }

  /**
   * Whether the Run waits in Connectivity Wait (Issue #760, S74c; OFF-005): approved with 联网后开始任务, not driven now, and
   * nothing of it begun — no category has an event, and no category's ledger holds a Run of its Task. A Run whose drive began
   * and was lost before anything was recorded waits again, and the next Reconnect Preflight starts it; one whose first category
   * was authorized on its ledger is no longer waiting, and 继续审阅 takes it on as it does after any restart (Issue #657).
   */
  #waits(snapshot: RunSnapshot, authorization: RunView['authorization'] = this.#authorizationOf(snapshot.reviewRunId)): boolean {
    if (authorization === null || (!authorization.whenOnline && authorization.startWhen !== 'idle') || this.#driving.has(snapshot.reviewRunId)) return false;
    return !this.#begun(snapshot);
  }

  /** Whether anything of the Run began: a category has an event, or a category's ledger holds a Run of its Task. It never undoes. */
  #begun(snapshot: RunSnapshot): boolean {
    if (this.#db.prepare('SELECT 1 FROM review_run_category_events WHERE review_run_id = ? LIMIT 1').get(snapshot.reviewRunId) !== undefined) return true;
    return !snapshot.categories.every((category) => category.task === null || this.#runRecordOf(category.task.taskIntentId) === null);
  }

  // ---- Connectivity Wait (Issue #760, plan slice S74c) ----------------------------------------------------------

  /**
   * Every Review Run waiting in Connectivity Wait, oldest approval first, with its Book — or the Book's alone. Only the
   * unsettled approvals are read (Issue #764): the history of settled ones is never scanned, however long it has grown.
   */
  waitingRuns(bookId?: string): Array<{ bookId: string; reviewRunId: string; authorizedAt: string }> {
    const candidates = this.#unsettledApprovals ??= this.#whenOnlineApprovals();
    const waiting: Array<{ bookId: string; reviewRunId: string; authorizedAt: string }> = [];
    const settled: string[] = [];
    for (const [reviewRunId, candidate] of candidates) {
      if (bookId !== undefined && candidate.bookId !== bookId) continue;
      const row = this.#db.prepare(
        `SELECT r.*, a.authorized_at approved_at FROM review_run_authorizations a JOIN review_runs r ON r.review_run_id = a.review_run_id
         WHERE a.review_run_id = ?`,
      ).get(reviewRunId) as SqlRow | undefined;
      if (row === undefined) {
        settled.push(reviewRunId);
        continue;
      }
      const snapshot = this.#snapshotOf(row);
      if (this.#waits(snapshot)) waiting.push({ bookId: snapshot.bookId, reviewRunId, authorizedAt: text(row.approved_at) });
      else if (this.#begun(snapshot)) settled.push(reviewRunId);
    }
    // Dropped only outside a transaction: what a surrounding write recorded may still be rolled back.
    if (!this.#db.isTransaction) for (const reviewRunId of settled) candidates.delete(reviewRunId);
    return waiting.sort((a, b) => (a.authorizedAt < b.authorizedAt ? -1 : a.authorizedAt > b.authorizedAt ? 1 : a.reviewRunId < b.reviewRunId ? -1 : 1));
  }

  /** Every approval to start once online the records hold: the one read of the history this store's lifetime makes. */
  #whenOnlineApprovals(): Map<string, { bookId: string; authorizedAt: string }> {
    const rows = this.#db.prepare(
      `SELECT a.review_run_id, a.authorized_at, r.book_id FROM review_run_authorizations a JOIN review_runs r ON r.review_run_id = a.review_run_id
       WHERE json_extract(a.canonical_json, '$.start') = 'when-online'`,
    ).all() as SqlRow[];
    return new Map(rows.map((row) => [text(row.review_run_id), { bookId: text(row.book_id), authorizedAt: text(row.authorized_at) }] as const));
  }

  /** Whether this Run still waits: Reconnect Preflight reads it again before it acts. */
  runWaits(reviewRunId: string): boolean {
    return this.#waits(this.#run(reviewRunId));
  }

  /** Whether one of the Book's Runs waits to start once online: no new 审阅 is prepared over it. */
  #bookWaits(bookId: string): boolean {
    return this.waitingRuns(bookId).length > 0;
  }

  /**
   * Reconnect Preflight's local half for a waiting Run (OFF-007, OFF-008): what the one approval bound that no longer stands —
   * every check `recordAuthorization` makes, read as the labels of what moved; none while the approval still stands. A
   * missing credential is never among them (OFF-009).
   */
  preflightDrift(reviewRunId: string): ReadonlyArray<string> {
    const snapshot = this.#run(reviewRunId);
    const moved: string[] = [];
    const latest = this.#db.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(snapshot.bookId) as SqlRow;
    if (text(latest.review_run_id) !== reviewRunId) moved.push('这次审阅的计划');
    if (procedurePinRefusal(this.#db, reviewRunId) !== null) moved.push('审阅工序');
    if (this.#selectionMoved(snapshot)) moved.push('所选段落');
    const approvals = this.#authorizationOf(reviewRunId)?.approvals ?? new Map<string, string>();
    for (const category of snapshot.categories) {
      if (category.task === null) continue;
      let current: AnalysisProjection | null = null;
      try {
        current = this.#categoryLedger(category).inspect(snapshot.bookId);
      } catch (error) {
        if (!(error instanceof AnalysisError)) throw error;
      }
      const stands = current !== null && current.taskIntent?.taskIntentId === category.task.taskIntentId && current.state === 'prepared' &&
        current.actions.canAuthorize && current.planEnvelope?.digest === category.task.planEnvelopeDigest &&
        approvals.get(category.categoryId) === category.task.planEnvelopeDigest &&
        this.#unverifiedTargets(category, snapshot.createdAt) === null &&
        (this.#authorizationOf(snapshot.reviewRunId) !== null || !this.#seriesKnowledgeMoved(snapshot.bookId, category)) &&
        this.#deliverablesMoved(snapshot.bookId, category.entry) === null;
      if (!stands) moved.push(`「${category.entry.label}」的计划`);
    }
    return moved;
  }

  /**
   * A waiting Run that can never start as it was approved (OFF-008): every category records why — its plan moved, or this
   * launch cannot start it — so nothing of it is driven, and the Run reads 需要重新确认计划 or 未能完成 with the reason. Nothing
   * was sent. The way on is a new 审阅, prepared from the manuscript as it is now.
   */
  blockWaiting(reviewRunId: string, reasons: ReadonlyArray<string>, cause: 'plan-moved' | 'launch'): void {
    const snapshot = this.#run(reviewRunId);
    requireReview(reasons.length > 0 && reasons.every((reason) => typeof reason === 'string' && reason.length > 0) && (cause === 'plan-moved' || cause === 'launch'),
      'REVIEW_RUN_INVALID', '阻止审阅需要写明原因。');
    requireReview(this.#waits(snapshot), 'REVIEW_RUN_NOT_WAITING', '这次审阅已不在等待中。');
    const detail = reasons.join(' ');
    const code = cause === 'plan-moved' ? REVIEW_RUN_PLAN_MOVED : REVIEW_RUN_LAUNCH_BLOCKED;
    transact(this.#db, () => {
      // A Series Retrieval Exclusion that reaches a category stops the Run in SER-024's words, exactly as the exclusion stops a
      // waiting Run when it is recorded (Issue #764): 书系检索范围已变化, never the plan drift the same exclusion also causes.
      if (cause === 'plan-moved' && this.#stopForSeriesScopeWhileWaiting(snapshot)) return;
      for (const category of snapshot.categories) this.#recordEvent(reviewRunId, category.categoryId, 'refused', detail, { extra: { code } });
    });
  }

  /** The stop `stopForSeriesScope` records for the first category an exclusion in force reaches, for a Run that waits. */
  #stopForSeriesScopeWhileWaiting(snapshot: RunSnapshot): boolean {
    for (const category of snapshot.categories) {
      const excluded = this.#unverifiedTargets(category, snapshot.createdAt);
      if (excluded === null) continue;
      this.#recordEvent(snapshot.reviewRunId, category.categoryId, 'refused', seriesScopeStopDetail(excluded), { extra: { code: SERIES_RETRIEVAL_SCOPE_CHANGED } });
      return true;
    }
    return false;
  }

  /**
   * 取消 while the Run waits to start once online (OFF-010): terminal, before anything is sent — every category records the
   * cancellation, so the Run reads 已取消 and offers nothing more. Cancelling twice answers as the first did.
   */
  cancelWaiting(bookId: string, reviewRunId: string): void {
    const snapshot = this.#runOfBook(bookId, reviewRunId);
    if (this.#stoppedFor(reviewRunId) === 'cancelled') return;
    requireReview(this.#waits(snapshot), 'REVIEW_RUN_NOT_WAITING', '只有等待联网后开始的审阅可以在这里取消；它已经开始或已经结束。');
    transact(this.#db, () => {
      for (const category of snapshot.categories) {
        this.#recordEvent(reviewRunId, category.categoryId, 'refused', WAITING_CANCELLED_DETAIL, { extra: { code: REVIEW_RUN_CANCELLED } });
      }
    });
  }

  /**
   * Reconnect Preflight starts a waiting Run (OFF-008): `drive` hands it to the drive loop, which may take it only now. The loop
   * then starts its categories one after another exactly as an approval that started at once does.
   */
  admitWaiting(reviewRunId: string, drive: () => void): void {
    requireReview(this.#waits(this.#run(reviewRunId)), 'REVIEW_RUN_NOT_WAITING', '这次审阅已不在等待中。');
    this.#preflightAdmitted.add(reviewRunId);
    try {
      drive();
    } finally {
      this.#preflightAdmitted.delete(reviewRunId);
    }
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

  /** Closed v1 bookkeeping is output, never successful coverage. Absence is an unfinished retention phase. */
  #retained(event: CategoryEvent): boolean {
    if (!Object.hasOwn(event.record, 'partialFactualRetentionVersion')) return false;
    requireReview(event.record.partialFactualRetentionVersion === 1 && (event.state === 'failed' || event.state === 'interrupted') &&
      event.record.categoryId === 'factual-review' && event.record.state === event.state &&
      event.record.runRecordId === event.runRecordId && event.record.resultSetRevisionId === event.resultSetRevisionId &&
      event.runRecordId !== null && event.resultSetRevisionId !== null &&
      ['findingCount', 'markedCount', 'carriedCount', 'anchorChangedCount', 'excludedCount'].every((key) =>
        Number.isSafeInteger(event.record[key]) && (event.record[key] as number) >= 0) &&
      (event.record.markedCount as number) + (event.record.anchorChangedCount as number) === event.record.findingCount &&
      (event.record.carriedCount as number) <= (event.record.markedCount as number),
    'REVIEW_RECORD_INVALID', '部分事实核查保留记录无效。');
    return true;
  }

  /** Only the exact durable Task Outcome can authorize local retention; checkpoints never do. */
  #terminalFactualRevision(snapshot: RunSnapshot, category: SnapshotCategory): { state: 'failed' | 'interrupted'; runRecordId: string; revisionId: string } | null {
    if (snapshot.localPlan !== undefined || category.partialFactualRetentionVersion !== 1 || category.categoryId !== 'factual-review' ||
        category.executor !== 'factual-review-kind' || category.task === null) return null;
    const runRecordId = this.#runRecordOf(category.task.taskIntentId);
    if (runRecordId === null) return null;
    const state = this.#categoryLedger(category).currentRunState(runRecordId);
    if (state !== 'failed' && state !== 'interrupted') return null;
    const row = this.#db.prepare(`SELECT o.* FROM analysis_task_outcomes o
      JOIN analysis_result_set_revisions v ON v.revision_id = o.result_set_revision_id AND v.run_record_id = o.run_record_id AND v.task_intent_id = o.task_intent_id
      JOIN analysis_result_sets s ON s.result_set_id = v.result_set_id AND s.book_id = ? AND s.kind = 'factual-review'
      JOIN analysis_task_intents i ON i.task_intent_id = o.task_intent_id AND i.book_id = s.book_id AND i.kind = s.kind
      WHERE o.run_record_id = ? AND o.task_intent_id = ? AND o.classification = ?`)
      .get(snapshot.bookId, runRecordId, category.task.taskIntentId, state) as SqlRow | undefined;
    if (row === undefined) return null;
    const outcome = recordOf(text(row.canonical_json), text(row.sha256));
    const revisionId = text(row.result_set_revision_id);
    requireReview(outcome.runRecordId === runRecordId && outcome.taskIntentId === category.task.taskIntentId &&
      outcome.classification === state && outcome.resultSetRevisionId === revisionId, 'REVIEW_RECORD_INVALID', '事实核查终态与结果修订版不一致。');
    // Retention grants no way around a withdrawn influence or a stopped retrieval scope.
    if (this.#unverifiedTargets(category, snapshot.createdAt) !== null || this.#withdrawnInfluence(category) !== null) return null;
    return { state, runRecordId, revisionId };
  }

  /** The store's second durability phase reads this binding again, including withdrawal/scope guards. */
  retainedFactualRevision(reviewRunId: string): string | null {
    const { snapshot, category } = this.#category(reviewRunId, 'factual-review');
    const terminal = this.#terminalFactualRevision(snapshot, category);
    const last = this.#events(reviewRunId, category.categoryId).at(-1);
    return terminal !== null && last !== undefined && last.state === terminal.state && last.runRecordId === terminal.runRecordId &&
      last.resultSetRevisionId === terminal.revisionId && this.#retained(last) ? terminal.revisionId : null;
  }

  /** Startup's existing store composition calls this only after execution-ledger reconciliation. No execution is started. */
  retainStoppedFactualRuns(): string[] {
    const retained: string[] = [];
    const rows = this.#db.prepare(`SELECT DISTINCT rr.* FROM review_runs rr
      JOIN json_each(rr.canonical_json, '$.categories') c
      JOIN analysis_run_records r ON r.task_intent_id = json_extract(c.value, '$.task.taskIntentId')
      JOIN analysis_task_outcomes o ON o.run_record_id = r.run_record_id
      WHERE json_extract(c.value, '$.partialFactualRetentionVersion') = 1
        AND o.classification IN ('failed', 'interrupted') AND o.result_set_revision_id IS NOT NULL`).all() as SqlRow[];
    for (const row of rows) {
      try {
        const snapshot = this.#snapshotOf(row);
        const category = snapshot.categories.find((entry) => entry.categoryId === 'factual-review');
        if (category === undefined || this.#driving.has(snapshot.reviewRunId) || this.#terminalFactualRevision(snapshot, category) === null) continue;
        this.settle(snapshot.reviewRunId, category.categoryId);
        if (this.retainedFactualRevision(snapshot.reviewRunId) !== null) retained.push(snapshot.reviewRunId);
      } catch {
        // A Run whose records do not read back keeps its terminal state without retained output, and its own surface reports
        // the refusal; it never stops startup or another Run's retention.
        continue;
      }
    }
    return retained;
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
      const unitPreferenceReferences = state === 'dispatched' || runRecordId === null ? undefined : this.#unitPreferenceReferences(runRecordId);
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
        ...(unitPreferenceReferences === undefined ? {} : { unitPreferenceReferences }),
      });
      this.#db.prepare(
        `INSERT INTO review_run_category_events(
           event_id, review_run_id, category_id, sequence, state, detail, run_record_id, result_set_revision_id, recorded_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(eventId, reviewRunId, categoryId, sequence, state, detail, runRecordId, resultSetRevisionId, recordedAt, record.json, record.digest);
    });
  }

  /** The actual unit turns, including failed requests, joined to this Task's immutable selection. No span means no use. */
  #unitPreferenceReferences(runRecordId: string): ReadonlyArray<{ unitOrdinal: number; referencedRuleVersions: ReadonlyArray<ReferencedRuleVersion> }> | undefined {
    const run = this.#db.prepare('SELECT task_intent_id FROM analysis_run_records WHERE run_record_id = ?').get(runRecordId);
    if (run === undefined) return undefined;
    const preference = new HouseReviewPreferenceLedger(this.#db, this.#ledgers.learningLedger).pinned(String(run.task_intent_id));
    if (preference?.selection === undefined) return undefined;
    const referencedRuleVersions = preference.lines.map((text, index) => ({ versionId: preference.versionId, ordinal: preference.ordinal,
      lineIndex: preference.selection!.lineIndexes[index]!, text }));
    const ordinals = new Set<number>();
    for (const row of this.#db.prepare(`SELECT s.* FROM analysis_harness_spans s JOIN analysis_execution_attempts a ON a.attempt_id = s.attempt_id
      WHERE a.run_record_id = ? AND s.unit_ordinal IS NOT NULL ORDER BY s.unit_ordinal, s.ordinal`).iterate(runRecordId) as IterableIterator<SqlRow>) {
      const span = recordOf(text(row.canonical_json), text(row.sha256));
      requireReview(span.unitOrdinal === row.unit_ordinal, 'REVIEW_RECORD_INVALID', '单元请求的引用记录无法核对。');
      ordinals.add(integer(row.unit_ordinal));
    }
    return [...ordinals].map((unitOrdinal) => ({ unitOrdinal, referencedRuleVersions }));
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
    // A Run waiting to start once online is begun by Reconnect Preflight alone, once it found the plan standing (Issue #760).
    requireReview(this.#preflightAdmitted.has(reviewRunId) || !this.#waits(snapshot), 'REVIEW_RUN_WAITING', WAITING_DRIVE_REASON);
    // A Run a Series Retrieval Exclusion stopped, or the editor then cancelled, is never driven again (Issue #64, S29b; SER-024).
    const stop = this.#stoppedFor(reviewRunId);
    requireReview(stop === null, 'REVIEW_RUN_STOPPED',
      stop === 'cancelled' ? '这次审阅已取消；不能继续审阅。'
        : stop === 'plan-moved' ? '这次审阅等待联网时计划已经变化，没有开始；请新建一次审阅。'
          : `这次审阅显示「${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}」；只能修改计划并重新授权，或取消任务。`);
    this.#driving.set(reviewRunId, snapshot.bookId);
    return snapshot.categories.map((category) => category.categoryId);
  }

  endDrive(reviewRunId: string): void {
    this.#driving.delete(reviewRunId);
    this.#placeWaits.delete(reviewRunId);
    const snapshot = this.#run(reviewRunId);
    if (snapshot.localPlan !== undefined && readLocalStageArtifacts(this.#db, reviewRunId).at(-1)?.record.state === 'materialized' && this.#reports(reviewRunId).length === 0) this.generateReport(snapshot.bookId, reviewRunId);
  }

  /**
   * The category of a driven Run whose turn came while every place of the governor is taken, or `null` once it has one
   * (Issue #632). Kept for this lifetime only, as the drive itself is: a Run read while it waits names that wait.
   */
  waitingForPlace(reviewRunId: string, categoryId: string | null): void {
    if (categoryId === null) this.#placeWaits.delete(reviewRunId);
    else this.#placeWaits.set(reviewRunId, categoryId);
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
    const { snapshot, category } = this.#category(reviewRunId, categoryId);
    if (snapshot.localPlan !== undefined) {
      const last = readLocalStageArtifacts(this.#db, reviewRunId).at(-1)?.record;
      return last === undefined || last.state === 'interrupted' || last.state === 'completed' ? { kind: 'local' } : DONE;
    }
    const last = this.#events(reviewRunId, categoryId).at(-1)?.state ?? null;
    if (last !== null && TERMINAL_CATEGORY_EVENTS.has(last)) return DONE;
    // A Run a Series Retrieval Exclusion stopped starts nothing more (Issue #64, S29b; SER-024): the categories not yet begun
    // wait for 修改计划并重新授权 or 取消任务, never for the same Run to go on.
    if (last === null && this.#stoppedFor(reviewRunId) !== null) return DONE;
    if (category.task === null || last === 'settled') return WRITE;
    const runRecordId = this.#runRecordOf(category.task.taskIntentId);
    requireReview(runRecordId !== null || last === null, 'REVIEW_RECORD_INVALID', '这一类的运行记录缺失。');
    if (runRecordId === null) return START;
    // A ledger Run still only authorized is one an earlier hand-off never got to the owner — the startup reconciliation
    // leaves it so for 继续审阅 (Issue #657 review) — and is dispatched; every other Run is settled from its own record,
    // including one the owner took that this history never heard of.
    const ledger = this.#categoryLedger(category);
    const state = ledger.currentRunState(runRecordId);
    return state === 'authorized' ? { kind: 'dispatch', runRecordId, ledger }
      : state === 'paused' || state === 'resumable' ? { kind: 'dispatch', runRecordId, ledger, resume: true } : SETTLE;
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
    // An exclusion recorded while the category waited for its turn stopped it already; nothing is authorized after that.
    const last = this.#events(reviewRunId, categoryId).at(-1)?.state ?? null;
    if ((last !== null && TERMINAL_CATEGORY_EVENTS.has(last)) || (last === null && this.#stoppedFor(reviewRunId) !== null)) return null;
    // The current-read guard (Issue #64, S29b; SER-023, SER-024): the Series Knowledge the plan froze is read again only if no
    // exclusion in force now reaches it. The Run's approval predates the exclusion, and that never lets the read go on.
    const excluded = this.#excludedTargets(category, snapshot.createdAt);
    if (excluded.length > 0) {
      const detail = seriesScopeStopDetail(excluded);
      transact(this.#db, () => {
        this.#recordEvent(reviewRunId, categoryId, 'refused', detail, { extra: { code: SERIES_RETRIEVAL_SCOPE_CHANGED } });
        this.#blockUndispatchedStarts(snapshot, detail);
      });
      return null;
    }
    // The consumption guard (Issue #912; LAUD-007, LAUD-008): a category whose pinned 本社审阅偏好 version reads a material
    // 停止今后使用 since never starts; the Run stops as a scope change does, and nothing of the category is sent.
    if (this.#stopForWithdrawnInfluence(snapshot, category)) return null;
    const ledger = this.#categoryLedger(category);
    // House guideline text never reaches a live model before the Owner admits it, whenever the Run was prepared.
    const withheld = this.#guidelineRefusal(category.entry);
    if (withheld !== null) {
      this.#recordEvent(reviewRunId, categoryId, 'refused', withheld, { extra: { code: HOUSE_GUIDELINE_NOT_TRANSMITTABLE } });
      return null;
    }
    let dispatchRunRecordId: string | null;
    try {
      const ruleVersionId = this.defaultRuleVersion(reviewRunId);
      dispatchRunRecordId = ledger.authorize(snapshot.bookId, category.task.taskIntentId, approved, this.#authorizationOf(reviewRunId)?.startWhen === 'idle' ? 'idle' : 'now',
        ruleVersionId === null ? { kind: 'standard-direct' } : { kind: 'default-execution-rule', ruleVersionId }).dispatchRunRecordId;
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
    this.#recordEvent(reviewRunId, categoryId, 'dispatched', '已进入 AI7 调度器。', { runRecordId });
  }

  /**
   * The owner refused a Run this Review Run authorized on the category's ledger. The ledger Run is
   * ended there — never left authorized and undispatched, which would block the category's next Task —
   * as `interrupted` when the service is stopping and `failed` otherwise, and the category with it.
   */
  refuseDispatch(reviewRunId: string, categoryId: string, runRecordId: string, code: string, message: string): void {
    const { category } = this.#category(reviewRunId, categoryId);
    const ledger = this.#categoryLedger(category);
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
    const { snapshot, category } = this.#category(reviewRunId, categoryId);
    requireReview(category.task !== null, 'REVIEW_CATEGORY_NOT_TASK_BACKED', '这一类没有任务。');
    const runRecordId = this.#runRecordOf(category.task.taskIntentId);
    requireReview(runRecordId !== null, 'REVIEW_RECORD_INVALID', '这一类的运行记录缺失。');
    const ledger = this.#categoryLedger(category);
    const state = ledger.currentRunState(runRecordId);
    if (state === 'authorized') return;
    const terminal = this.#terminalFactualRevision(snapshot, category);
    transact(this.#db, () => {
      const events = this.#events(reviewRunId, categoryId);
      if (events.some((event) => TERMINAL_CATEGORY_EVENTS.has(event.state) || event.state === 'settled')) return;
      if (state !== 'blocked-before-dispatch' && !events.some((event) => event.state === 'dispatched')) {
        this.#recordEvent(reviewRunId, categoryId, 'dispatched', '已进入 AI7 调度器。', { runRecordId });
      }
      const outcome = this.#db.prepare('SELECT classification, result_set_revision_id, canonical_json, sha256 FROM analysis_task_outcomes WHERE run_record_id = ?')
        .get(runRecordId) as SqlRow | undefined;
      const summary = outcome === undefined ? null : recordOf(text(outcome.canonical_json), text(outcome.sha256)).summary;
      const outcomeSummary = typeof summary === 'string' ? summary : null;
      if (state === 'completed' || state === 'completed-with-gaps' || (state === 'cancelled' && outcome?.result_set_revision_id != null)) {
        const revisionId = outcome === undefined ? null : nullableText(outcome.result_set_revision_id);
        if (revisionId === null) {
          this.#recordEvent(reviewRunId, categoryId, 'failed', '运行已结束，但没有形成结果集修订版。', { runRecordId });
          return;
        }
        this.#recordEvent(reviewRunId, categoryId, 'settled',
          state === 'completed' ? '已形成结果集修订版。' : '已形成结果集修订版 · 有缺口单元。', { runRecordId, resultSetRevisionId: revisionId });
      } else if (state === 'failed') {
        this.#recordEvent(reviewRunId, categoryId, 'failed', outcomeSummary ?? '运行失败。', { runRecordId, resultSetRevisionId: terminal?.revisionId ?? null });
      } else if (state === 'interrupted' || state === 'cancelled') {
        // The guard stopped it between its reading ranges (Issue #64, S29b): the category carries the stop, and the Run with it.
        const scope = outcomeSummary?.startsWith(SERIES_SCOPE_STOP_SUMMARY) === true;
        // A 本社审阅偏好 material withdrawn while it read (Issue #912; LAUD-008) stops it the same way, in its own words.
        const influence = !scope && outcomeSummary?.startsWith(LEARNING_INFLUENCE_STOP_SUMMARY) === true;
        this.#recordEvent(reviewRunId, categoryId, 'interrupted', outcomeSummary ?? (state === 'cancelled' ? '这一类的运行已取消。' : '运行已中断。'),
          { runRecordId, resultSetRevisionId: terminal?.revisionId ?? null, ...(scope ? { extra: { code: SERIES_RETRIEVAL_SCOPE_CHANGED } } : influence ? { extra: { code: LEARNING_INFLUENCE_WITHDRAWN } } : {}) });
        if (scope) this.#blockUndispatchedStarts(this.#run(reviewRunId), SERIES_SCOPE_STOP_SUMMARY);
        if (influence) this.#blockUndispatchedStarts(this.#run(reviewRunId), LEARNING_INFLUENCE_STOP_SUMMARY);
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
    const last = this.#events(reviewRunId, categoryId).at(-1);
    if (terminal !== null && last?.state === terminal.state && last.runRecordId === terminal.runRecordId) this.write(reviewRunId, categoryId);
  }

  /**
   * A step of the loop failed for a reason no step records itself. The category is recorded `failed`
   * unless it already finished; a ledger Run it authorized and never handed over is ended too.
   */
  fail(reviewRunId: string, categoryId: string, code: string, message: string): void {
    const { snapshot, category } = this.#category(reviewRunId, categoryId);
    if (snapshot.localPlan !== undefined) {
      const last = readLocalStageArtifacts(this.#db, reviewRunId).at(-1)?.record;
      if (last !== undefined && ['failed', 'refused', 'cancelled', 'materialized'].includes(last.state)) return;
      this.#recordLocal(snapshot, last?.attemptId ?? randomUUID(), 'failed', null, '本地检查未能完成；请重新准备。');
      return;
    }
    transact(this.#db, () => {
      const last = this.#events(reviewRunId, categoryId).at(-1)?.state ?? null;
      if (last !== null && TERMINAL_CATEGORY_EVENTS.has(last)) return;
      const detail = `这一类未能完成（${code}）：${message}`;
      const runRecordId = category.task === null ? null : this.#runRecordOf(category.task.taskIntentId);
      if (runRecordId !== null) {
        const ledger = this.#categoryLedger(category);
        if (ledger.currentRunState(runRecordId) === 'authorized') ledger.recordRunState(runRecordId, 'failed', { detail, code });
      }
      this.#recordEvent(reviewRunId, categoryId, 'failed', detail, { runRecordId, extra: { code } });
    });
  }

  /**
   * Whether a Review Run's snapshot names the Task of this ledger Run: a category the Run owns, which 继续审阅 takes on.
   */
  ownsCategoryRun(runRecordId: string): boolean {
    const row = this.#db.prepare(
      `SELECT rr.review_run_id FROM analysis_run_records r
       JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id
       JOIN review_runs rr ON rr.book_id = i.book_id
       JOIN json_each(rr.canonical_json, '$.categories') c ON json_extract(c.value, '$.task.taskIntentId') = i.task_intent_id
       WHERE r.run_record_id = ? LIMIT 1`,
    ).get(runRecordId) as SqlRow | undefined;
    // A Review Run a Series Retrieval Exclusion stopped, or the editor then cancelled, is never driven again (Issue #64,
    // S29b): 继续审阅 takes none of its categories on, so a start it left authorized is not its to keep.
    return row !== undefined && this.#stoppedFor(text(row.review_run_id)) === null;
  }

  /**
   * Startup reconciliation of the review-category kinds (Issue #657): a category Run a stopped service left admitted,
   * executing or pausing has nothing running it. Unsettled, it reads as under way for good — the category's next Task is
   * refused, and a page may poll — until the editor happens on 继续审阅. Each kind's ledger keeps its
   * continuation point for explicit 续行, without forming a terminal outcome. A category Run left `authorized` sent nothing and stays as it is:
   * its Review Run owns it, and 继续审阅 — the editor's own choice — dispatches it (ADR 0034; Issue #657 review). One
   * no Review Run owns is blocked before dispatch with why.
   *
   * A kind's ledger is the one the configuration entry a Review Run snapshotted names, and it settles every Run of its
   * kind, whatever contract prepared it. So a stranded Run whose Task no Review Run snapshotted is settled only when a
   * Run of the same kind that one did is stranded too; 继续审阅 and a new Task are its other ways out. A snapshot that does
   * not read back is passed over, so one damaged record never stops the service starting. Returns how many it settled.
   */
  reconcileStoppedCategoryRuns(): number {
    // An idle approval stranded before its first category follows the governor's queued-start recovery: no automatic restart.
    for (const approval of this.#db.prepare("SELECT review_run_id FROM review_run_authorizations WHERE json_extract(canonical_json, '$.startWhen') = 'idle'").all()) {
      const reviewRunId = text(approval.review_run_id);
      if (this.waitsForIdle(reviewRunId)) this.blockWaiting(reviewRunId,
        ['AI7 上次关闭时这项任务还在等待空闲，没有开始；请重新准备并开始。'], 'launch');
    }
    const rows = this.#db.prepare(
      `SELECT i.kind, rr.review_run_id, json_extract(c.value, '$.categoryId') AS category_id
       FROM analysis_run_records r
       JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id
       JOIN review_runs rr ON rr.book_id = i.book_id
       JOIN json_each(rr.canonical_json, '$.categories') c ON json_extract(c.value, '$.task.taskIntentId') = i.task_intent_id
       WHERE substr(i.kind, 1, ?) = ?
         AND (SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1)
           IN ('admitted', 'executing', 'pausing')
       ORDER BY r.recorded_at, r.rowid`,
    ).all(EDITORIAL_REVIEW_KIND_PREFIX.length, EDITORIAL_REVIEW_KIND_PREFIX) as SqlRow[];
    const reconciled = new Set<string>();
    let settled = 0;
    for (const row of rows) {
      const kind = text(row.kind);
      if (reconciled.has(kind)) continue;
      let ledger: BaselineAnalysisStore;
      try {
        ledger = this.#categoryLedger(this.#category(text(row.review_run_id), text(row.category_id)).category);
      } catch {
        // This snapshot does not read back; another Run of the kind, or 继续审阅, may still reach its ledger.
        continue;
      }
      reconciled.add(kind);
      settled += ledger.reconcileStoppedRuns({ leaveAuthorized: (runRecordId) => this.ownsCategoryRun(runRecordId) }).settled;
    }
    return settled;
  }

  // ---- materialization (B4) -----------------------------------------------------------------------

  /** Put findings on the manuscript from successful work, or an eligible exact terminal factual revision. */
  write(reviewRunId: string, categoryId: string): void {
    const { snapshot, category } = this.#category(reviewRunId, categoryId);
    if (category.task === null) {
      this.#writeLeads(snapshot, category);
      return;
    }
    const events = this.#events(reviewRunId, categoryId);
    const terminal = this.#terminalFactualRevision(snapshot, category);
    const last = events.at(-1);
    const retention = terminal !== null && last?.state === terminal.state && last.runRecordId === terminal.runRecordId &&
      (last.resultSetRevisionId === null || last.resultSetRevisionId === terminal.revisionId) ? last : null;
    if (retention !== null && this.#retained(retention)) return;
    const settled = retention === null ? events.find((event) => event.state === 'settled')
      : { ...retention, resultSetRevisionId: terminal!.revisionId };
    requireReview(settled !== undefined && settled.resultSetRevisionId !== null, 'REVIEW_RECORD_INVALID', '这一类还没有可写入的结果集修订版。');
    const ledger = this.#categoryLedger(category);
    const inspected = ledger.inspect(snapshot.bookId, undefined, settled.resultSetRevisionId).inspectedRevision;
    requireReview(inspected !== null, 'REVIEW_RECORD_INVALID', '这一类的结果集修订版缺失。');
    const revision = inspected.revision;
    requireReview(revision.provenance.runRecordId === settled.runRecordId && revision.provenance.taskIntentId === category.task.taskIntentId &&
      revision.manuscriptPin.bookId === snapshot.bookId, 'REVIEW_RECORD_INVALID', '结果修订版不属于这一类的运行。');
    const revisionBlocks = ledger.readRevisionBlocks(revision.manuscriptPin.manuscriptId, revision.manuscriptPin.revisionId);
    const blocks = new Map(revisionBlocks.map((block) => [block.blockId, block.text] as const));
    // A Run's findings are the ones of the units it read. A unit it reused is an earlier Run's reading,
    // and a unit it left out of scope was not read at all.
    const recomputed = new Set(revision.lineage.filter((unit) => unit.kind === 'recomputed').map((unit) => unit.unitOrdinal));
    // A reused unit's findings were put on the manuscript by the Run that read it — unless that Run read it on a 当前选区 and left
    // them off (Issue #423 review, P1-2). So a finding of a reused unit that no Review Run of this Book ever recorded for this
    // category is this Run's to put on the manuscript; one recorded before — marked, ignored, or with its words changed — is not.
    const recorded = new Set((this.#db.prepare(
      `SELECT DISTINCT f.kind_ref FROM review_findings f JOIN review_runs r ON r.review_run_id = f.review_run_id
       WHERE r.book_id = ? AND f.category_id = ?`,
    ).all(snapshot.bookId, category.categoryId) as SqlRow[]).map((row) => text(row.kind_ref)));
    // Only within the Run's own scope (review P3-1): a 选章 puts on the manuscript what was left off in its chapters, never elsewhere.
    const chapters = snapshot.scope.kind === 'chapters' ? snapshot.scope.selectedRange : null;
    // By the positions of the revision the Run read, the ones its chapters were resolved against (final review P3-3).
    const positions = chapters === null ? null : new Map(revisionBlocks.map((block) => [block.blockId, block.position] as const));
    const inScope = (blockId: string): boolean => {
      if (chapters === null || positions === null) return true;
      const position = positions.get(blockId);
      return position !== undefined && position >= chapters.startPosition && position <= chapters.endPosition;
    };
    const read = (finding: { findingId: string; unitOrdinal: number; mergedFrom: ReadonlyArray<{ unitOrdinal: number }>; sourceRange: { blockId: string } }): boolean =>
      recomputed.has(finding.unitOrdinal) || finding.mergedFrom.some((merged) => recomputed.has(merged.unitOrdinal)) ||
      (!recorded.has(finding.findingId) && inScope(finding.sourceRange.blockId));
    const pinned = (blockId: string, fromGrapheme: number, toGrapheme: number): string => {
      const blockText = blocks.get(blockId);
      requireReview(blockText !== undefined, 'REVIEW_RECORD_INVALID', '发现所在的内容块不在该修订版中。');
      return sliceGraphemes(blockText, fromGrapheme, toGrapheme);
    };
    const references = new Map<number, ReadonlyArray<ReferencedRuleVersion>>();
    for (const row of this.#db.prepare('SELECT * FROM analysis_unit_results WHERE revision_id = ? AND state = ?').all(revision.revisionId, 'closed') as SqlRow[]) {
      const unit = recordOf(text(row.canonical_json), text(row.sha256));
      references.set(integer(row.unit_ordinal), (unit.referencedRuleVersions ?? []) as ReadonlyArray<ReferencedRuleVersion>);
    }
    const rulesOf = (finding: { unitOrdinal: number; mergedFrom: ReadonlyArray<{ unitOrdinal: number }> }): ReferencedRuleVersion[] => {
      const unique = new Map<string, ReferencedRuleVersion>();
      for (const ordinal of [finding.unitOrdinal, ...finding.mergedFrom.map((entry) => entry.unitOrdinal)]) {
        for (const rule of references.get(ordinal) ?? []) unique.set(`${rule.versionId}/${rule.lineIndex}`, rule);
      }
      return [...unique.values()];
    };
    let findings: MaterializedFinding[];
    let excludedCount: number;
    let excluded: ReviewExcludedFindingProjection[] = [];
    let outside = 0;
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
      // #809: the live non-web route has no external evidence. The label follows the recorded
      // result into both its finding and its mark; model confidence cannot turn it into verification.
      const unverified = revision.policyPin.operationalScope === 'developer-live' || revision.policyPin.operationalScope === 'ordinary-production';
      const disclosure = unverified ? '【未联网核查】' : '';
      findings = review.findings.filter(read).map((finding) => ({
        kindRef: finding.findingId,
        severity: finding.severity,
        blockId: finding.sourceRange.blockId,
        fromGrapheme: finding.sourceRange.fromGrapheme,
        toGrapheme: finding.sourceRange.toGrapheme,
        pinnedText: pinned(finding.sourceRange.blockId, finding.sourceRange.fromGrapheme, finding.sourceRange.toGrapheme),
        quote: finding.quote,
        note: `${disclosure}${finding.note}`,
        replacement: finding.replacement,
        clauseId: finding.clauseId,
        stateLine: unverified ? '未联网核查' : null,
        body: `${disclosure}${category.entry.riskPointsOnly ? RISK_POINT_PREFIX : ''}${finding.note}`,
        basis: this.#clauseBasis(category.entry, finding.clauseId),
        referencedRuleVersions: rulesOf(finding),
      }));
      excluded = review.excluded.filter((finding) => recomputed.has(finding.unitOrdinal)).map((finding) => ({
        categoryId: category.categoryId, categoryLabel: category.entry.label, unitOrdinal: finding.unitOrdinal,
        text: finding.rawText ?? JSON.stringify({ quote: finding.quote, note: finding.note, replacement: finding.replacement }),
        reasonCode: finding.reason, reasonLabel: finding.reasonLabel,
      }));
      excludedCount = excluded.length;
    }
    // 当前选区 (Issue #423 review, P1-1; V2-UX-TASK-003): the reading ranges are read whole, as context, and only what lies on the
    // selected paragraphs is put on the manuscript. The rest is counted, never stored as a mark, so the editor can widen to 选章.
    const selected = selectionBlocks(snapshot);
    if (selected !== null) {
      const kept = findings.filter((finding) => selected.has(finding.blockId));
      outside = findings.length - kept.length;
      findings = kept;
    }
    this.#writeFindings(snapshot, category, findings, {
      runRecordId: settled.runRecordId,
      resultSetRevisionId: settled.resultSetRevisionId,
      excludedCount,
      excluded,
      outsideSelection: outside,
      selection: selected !== null,
      adapterPin: { route: revision.adapterPin.route, model: revision.adapterPin.model, fixtureIdentity: revision.adapterPin.fixtureIdentity, fixtureSha256: revision.adapterPin.fixtureSha256 },
      ...(retention === null ? {} : { retention }),
    });
  }

  /**
   * The basis a finding cites (REV-005): the guideline clause it named, or — when it named none — the
   * guideline documents its category applies.
   */
  #clauseBasis(entry: ReviewCategoryConfigurationEntry, clauseId: string | null): EditorialMarkBasisProjection[] {
    const deliverable = this.#deliverableReference(entry, clauseId);
    if (deliverable !== null) return [{ label: `交付物（只读） · ${deliverable.documentTitle} · ${deliverable.clauseId}`,
      quote: deliverable.text, blockId: null, fromGrapheme: null, toGrapheme: null }];
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
    // A 当前选区 keeps the leads anchored on its paragraphs by identity (Issue #423 review, P2-2): positions move with every edit.
    const selected = selectionBlocks(snapshot);
    const findings: MaterializedFinding[] = [];
    let excludedCount = 0;
    const outside = 0;
    for (const lead of reviewLeadsOf(revision)) {
      // On a 当前选区 a lead whose sides include the selected paragraph is anchored there, on the first such side, so a 前后一致
      // lead naming the paragraph second is not lost (Issue #423 review, P3-2); a lead naming none of it is not this Run's.
      const anchor = selected === null ? lead.ranges[0] : lead.ranges.find((range) => selected.has(range.blockId));
      const block = anchor === undefined ? undefined : blocks.get(anchor.blockId);
      if (selected !== null && anchor === undefined) continue;
      if (anchor === undefined || block === undefined) {
        excludedCount += 1;
        continue;
      }
      if (selected === null && range !== null) {
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
      outsideSelection: outside,
      selection: selected !== null,
      adapterPin: { route: revision.adapterPin.route, model: revision.adapterPin.model, fixtureIdentity: revision.adapterPin.fixtureIdentity, fixtureSha256: revision.adapterPin.fixtureSha256 },
    });
  }

  /**
   * One category's findings and marks in ONE transaction, with successful `materialized` or closed terminal-retention bookkeeping (B4). Every
   * finding becomes a produced mark written together with its row; a finding whose words no longer
   * stand is written `anchor-changed` with no mark instead of failing the category; a finding an
   * earlier Review Run of this Book already put on the manuscript is the same record and names that
   * mark again (MARK-010), so a finding found twice is never marked twice. A category with a
   * `materialized` or retained completion is never written again, and a crash anywhere in here rolls the whole category
   * back.
   */
  #writeFindings(
    snapshot: RunSnapshot,
    category: SnapshotCategory,
    findings: ReadonlyArray<MaterializedFinding>,
    source: {
      runRecordId: string | null;
      resultSetRevisionId: string | null;
      excludedCount: number;
      excluded?: ReadonlyArray<ReviewExcludedFindingProjection>;
      /** Findings of a 当前选区 Run's reading ranges that lie outside the selected paragraphs: counted, not marked. */
      outsideSelection: number;
      /** A 当前选区 Run: its unplaceable quotes belong to the reading ranges, which its line says (P3-1). */
      selection: boolean;
      adapterPin: { route: string; model: string; fixtureIdentity: string | null; fixtureSha256: string | null } | null;
      local?: { attemptId: string; result: AnyLocalCheckResult };
      retention?: CategoryEvent;
    },
  ): void {
    const reviewRunId = snapshot.reviewRunId;
    transact(this.#db, () => {
      const events = this.#events(reviewRunId, category.categoryId);
      if (source.local !== undefined && readLocalStageArtifacts(this.#db, reviewRunId).at(-1)?.record.state === 'materialized') return;
      if (events.some((event) => event.state === 'materialized')) return;
      if (events.some((event) => this.#retained(event))) return;
      requireReview(source.retention !== undefined || !events.some((event) => TERMINAL_CATEGORY_EVENTS.has(event.state)), 'REVIEW_CATEGORY_FINISHED', '这一类已经结束，不能再写入发现。');
      const excludedInsert = this.#db.prepare('INSERT INTO review_excluded_findings(review_run_id, category_id, ordinal, result_set_revision_id, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)');
      (source.excluded ?? []).forEach((finding, index) => {
        const record = canonicalRecord(finding);
        excludedInsert.run(reviewRunId, category.categoryId, index + 1, source.resultSetRevisionId, record.json, record.digest);
      });
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
          const output = finding.output ?? category.entry.output;
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
            ...((finding.referencedRuleVersions?.length ?? 0) === 0 ? {} : { referencedRuleVersions: finding.referencedRuleVersions }),
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
          // A local candidate has no quotation to locate; its exclusions are listed with the local check, not in the appendix.
          ...(source.excludedCount > 0
            ? [source.local !== undefined ? `另有 ${source.excludedCount} 个本地候选未通过精确定位或超出结果界限，未生成批注，列在本次本地检查的排除记录中`
              : source.selection ? selectionExcludedLine(source.excludedCount) : `另有 ${source.excludedCount} 条未能定位引文，列在排除附录中`]
            : []),
          ...(source.outsideSelection > 0 ? [selectionOutsideLine(source.outsideSelection)] : []),
        ].join('；') + '。';
        if (source.local !== undefined) {
          this.#recordLocal(snapshot, source.local.attemptId, 'materialized', source.local.result, detail);
          return;
        }
        this.#recordEvent(reviewRunId, category.categoryId, source.retention?.state ?? 'materialized', source.retention?.detail ?? detail, {
          runRecordId: source.runRecordId,
          resultSetRevisionId: source.resultSetRevisionId,
          extra: {
            ...(source.retention === undefined ? {} : { partialFactualRetentionVersion: 1,
              ...(source.retention.record.code === undefined ? {} : { code: source.retention.record.code }) }),
            findingCount: findings.length,
            markedCount: marked,
            carriedCount: carried.filter((markId) => markId !== null).length,
            anchorChangedCount: changed,
            excludedCount: source.excludedCount,
            // A 当前选区 Run's findings left off the manuscript, as a number the record answers by itself (P3-3).
            ...(source.selection ? { outsideSelectionCount: source.outsideSelection } : {}),
            adapterPin: source.adapterPin,
          },
        });
      });
    });
  }

  #markInput(snapshot: RunSnapshot, category: SnapshotCategory, finding: MaterializedFinding): ProducedEditorialMarkInput {
    const output = finding.output ?? category.entry.output;
    const suggestion = output === 'change-suggestion';
    return {
      manuscriptId: snapshot.manuscript.manuscriptId,
      branchId: snapshot.manuscript.branchId,
      blockId: finding.blockId,
      fromGrapheme: finding.fromGrapheme,
      toGrapheme: finding.toGrapheme,
      pinnedText: finding.pinnedText,
      kind: output,
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
      requireReview(finding.markId === finding.originMarkId, 'REVIEW_FINDING_NOT_PENDING', '这条发现已在稿件上保存为新的修改建议版本，请在稿件上处理它。');
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
      const output = this.#events(reviewRunId, finding.categoryId).find((event) => event.state === 'materialized' || this.#retained(event));
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
          markId: finding.originMarkId,
          resultSetRevisionId: output?.resultSetRevisionId ?? null,
        },
        disposition: { dispositionId, disposition: 'ignored', reason },
      });
      this.#db.prepare(
        `INSERT INTO quality_signals(signal_id, book_id, kind, review_run_id, category_id, finding_id, disposition_id, mark_id, reason, recorded_at, canonical_json, sha256)
         VALUES (?, ?, 'review-finding-ignored', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(signalId, bookId, reviewRunId, finding.categoryId, findingId, dispositionId, finding.originMarkId, reason, now, signal.json, signal.digest);
      if (finding.originMarkId !== null) this.#marks.setAsideProduced(finding.originMarkId, now);
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
          const { category } = categoryView;
          const output = categoryView.materialized ?? categoryView.retained;
          const stateLabel = categoryView.stateLabel;
          const pin = output?.record.adapterPin;
          return {
            categoryId: category.categoryId,
            label: category.entry.label,
            output: category.entry.output,
            state: categoryView.state,
            stateLabel,
            stateLine: (categoryView.detail === null ? stateLabel : `${stateLabel}：${categoryView.detail}`) + (snapshot.localPlan === undefined ? '' : ` ${snapshot.localPlan.schema === 'ai7.review.local-plan/3' ? LOCAL_TABLE_LIMITATION : LOCAL_CHECK_LIMITATION} ` + (() => {
              const result = readLocalStageArtifacts(this.#db, reviewRunId).at(-1)?.record.result;
              return Object.entries(result?.counts ?? {}).map(([id, count]) => `${id}/v1：检查${count.checked}，排除${count.exempt}，跳过${count.skipped}，未识别${count.notRecognized}，无发现${count.noFinding}，发现${count.findings}，错误${count.error}，未启用${count.disabled}，不适用${count.outOfApplicability}`).join('；');
            })()),
            basisStatement: category.basisStatement + (category.task === null || snapshot.housePreferences?.[category.task.kind] === undefined ? '' : `；参考${housePreferenceLabel(snapshot.housePreferences[category.task.kind]!)}`),
            excludedCount: typeof output?.record.excludedCount === 'number' ? output.record.excludedCount : 0,
            guidelineDocuments: category.entry.guidelineDocuments,
            procedure: category.entry.procedure,
            planEnvelopeDigest: snapshot.localPlan?.digest ?? category.task?.planEnvelopeDigest ?? null,
            resultSetRevisionId: output?.resultSetRevisionId ?? null,
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
      // Named as the report names a finding elsewhere (its category and place), never by an internal identity alone.
      const categoryLabels = new Map(record.overview.rows.map((row) => [row.categoryId, row.label] as const));
      const referencedRules = view.findings.filter((finding) => finding.referencedRuleVersions.length > 0)
        .map((finding) => ({ findingId: finding.findingId, categoryLabel: categoryLabels.get(finding.categoryId) ?? finding.categoryId,
          locationLabel: finding.blockPosition === null ? '内容块已不在当前稿件中' : `内容块 ${finding.blockPosition}`, rules: finding.referencedRuleVersions }));
      if (referencedRules.length > 0) record.appendix.referencedRules = referencedRules;
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
  /** Whether any selected category calls a model, so a 资料库 reference has a reader; the configuration answers it without reading the Book. */
  materialReferencesAllowed(bookId: string, categoryIds: ReadonlyArray<string>): boolean {
    this.#requireBook(bookId);
    return this.#forBook(bookId, this.#configuration()).categories.some((entry) => categoryIds.includes(entry.categoryId) && entry.executor === 'review-category-contract');
  }

  /** Only Task-backed readers transmit material; each must carry its own admitting rule. */
  materialReferencesLiveAllowed(bookId: string, categoryIds: ReadonlyArray<string>): boolean {
    const policy = this.#ledgers.baseline().launch.policy;
    // A launch none of whose selected readers' rules admits material refuses before reading the Book, as before #809.
    if (!Array.isArray(categoryIds) || !categoryIds.some((id) => isReviewCategoryId(id) && liveMaterialRule(policy, reviewCategoryKindId(id)) !== null)) return false;
    this.#requireBook(bookId);
    const readers = this.#forBook(bookId, this.#configuration()).categories.filter((entry) => categoryIds.includes(entry.categoryId) && entry.executor === 'review-category-contract');
    return readers.length > 0 && readers.every((entry) => liveMaterialRule(this.#ledgers.baseline().launch.policy, reviewCategoryKindId(entry.categoryId)) !== null);
  }

  #materialsRefusedLive(snapshot: RunSnapshot): boolean {
    const launch = this.#ledgers.baseline().launch;
    return snapshot.materialReferences !== undefined && launch.live !== null && snapshot.categories.some((category) =>
      category.entry.executor === 'review-category-contract' && liveMaterialRule(launch.policy, reviewCategoryKindId(category.categoryId)) === null);
  }

  workspace(bookId: string, reviewRunId: string | null, progress?: ProgressReader, page: ReviewFindingPageRequest = FIRST_FINDING_PAGE): ReviewWorkspaceProjection {
    this.#requireBook(bookId);
    requireReview(reviewRunId === null || (typeof reviewRunId === 'string' && UUID_PATTERN.test(reviewRunId)), 'REVIEW_RUN_INVALID', '审阅记录标识无效。');
    requireReview(validFindingPage(page), 'REVIEW_PAGE_INVALID', '发现的分页或筛选无效。');
    const head = this.#head(bookId);
    const baseline = head === null ? { revision: null, error: null } : this.#readBaseline(bookId);
    const house = this.#configuration();
    const readings = this.#forBook(bookId, house).categories.map((entry) => this.#readCategory(bookId, head, entry, baseline, progress));
    const chapters = head === null ? { basis: 'outline' as const, chapters: [] } : this.#chapterOptions(bookId, head);
    // The 审阅记录 lists the newest Runs only; a Run beyond them is still opened when it is named.
    const rows = this.#db.prepare('SELECT * FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT ?')
      .all(bookId, MAX_REVIEW_RUN_SUMMARIES + 1) as SqlRow[];
    const listed = rows.slice(0, MAX_REVIEW_RUN_SUMMARIES).map((row) => this.#snapshotOf(row));
    let opened = reviewRunId === null ? listed[0] ?? null : listed.find((snapshot) => snapshot.reviewRunId === reviewRunId) ?? null;
    if (opened === null && reviewRunId !== null) {
      const row = this.#db.prepare('SELECT * FROM review_runs WHERE book_id = ? AND review_run_id = ?').get(bookId, reviewRunId) as SqlRow | undefined;
      opened = row === undefined ? null : this.#snapshotOf(row);
    }
    requireReview(reviewRunId === null || opened !== null, 'REVIEW_RUN_NOT_FOUND', '这次审阅不属于当前图书。');
    // Each Series' exclusions are read once for every Run listed (Issue #64, S29b).
    const chains = new Map<string, StoredExclusion[]>();
    const views = new Map(listed.map((snapshot) => [snapshot.reviewRunId, this.#runView(snapshot, chains)] as const));
    if (opened !== null && !views.has(opened.reviewRunId)) views.set(opened.reviewRunId, this.#runView(opened, chains));
    const driving = this.#bookIsDriving(bookId);
    const run = opened === null ? null : this.#runProjection(views.get(opened.reviewRunId)!, readings, chapters, page);
    const workspace: ReviewWorkspaceProjection = {
      bookId,
      localBookTerms: (() => {
        const row = this.#db.prepare("SELECT * FROM review_runs WHERE book_id = ? AND json_type(canonical_json, '$.localPlan.options.tables') = 'object' ORDER BY ordinal DESC LIMIT 1").get(bookId) as SqlRow | undefined;
        return row === undefined ? [] : this.#snapshotOf(row).localPlan?.options.tables?.bookTerms ?? [];
      })(),
      ...(this.#ledgers.materialOffers === undefined ? {} : { materials: this.#ledgers.materialOffers(bookId) }),
      manuscript: head,
      configuration: this.#configurationPin(house),
      categories: readings.map((reading) => this.#workspaceCategory(reading, chapters)),
      coverage: this.#coverage(bookId, head, readings, baseline),
      scopeOptions: this.#scopeOptions(head, chapters),
      newReview: head === null
        ? { available: false, unavailableReason: NO_MANUSCRIPT_REASON }
        : driving ? { available: false, unavailableReason: RUN_ACTIVE_REASON }
          : this.#bookWaits(bookId) ? { available: false, unavailableReason: RUN_WAITING_REASON } : { available: true, unavailableReason: null },
      runs: listed.map((snapshot) => this.#summary(views.get(snapshot.reviewRunId)!)),
      runsTruncated: rows.length > MAX_REVIEW_RUN_SUMMARIES,
      run: run?.projection ?? null,
    };
    return run === null ? workspace : { ...workspace, run: findingPage(workspace, run.projection, run.candidates) };
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

  #resolveScope(request: ReviewRunScopeRequest, chapters: ChapterOptions, head: ManuscriptHead): ResolvedReviewScope {
    requireReview(isRecord(request) && hasExactKeys(request, ['kind', 'fromChapterBlockId', 'toChapterBlockId']) &&
      REVIEW_SCOPE_KINDS.includes(request.kind), 'REVIEW_SCOPE_INVALID', '审阅范围无效。');
    if (request.kind === 'selection') return this.#resolveSelection(request, head);
    if (request.kind !== 'chapters') {
      requireReview(request.fromChapterBlockId === null && request.toChapterBlockId === null, 'REVIEW_SCOPE_INVALID', '只有选章和当前选区可以指明内容块。');
      return { kind: request.kind, selectedRange: null };
    }
    requireReview(typeof request.fromChapterBlockId === 'string' && BLOCK_ID_PATTERN.test(request.fromChapterBlockId) &&
      typeof request.toChapterBlockId === 'string' && BLOCK_ID_PATTERN.test(request.toChapterBlockId), 'REVIEW_SCOPE_INVALID', '请选择起止的章。');
    requireReview(chapters.chapters.length > 0, 'REVIEW_SCOPE_INVALID', NO_CHAPTERS_REASON);
    const range = resolveChapterRange(chapters.chapters, request.fromChapterBlockId, request.toChapterBlockId);
    requireReview(range !== null, 'REVIEW_SCOPE_INVALID', '所选的章不在当前稿件中，或先后颠倒；请重新选择。');
    return { kind: 'chapters', selectedRange: range };
  }

  /**
   * 当前选区 (Issue #423, S77b; V2-UX-REV-001, TASK-001): the selection 就这段发起任务… hands over, named by the block identity of
   * its first and last block in the two fields 选章 names its chapters by. Each must stand in the working manuscript now, in
   * order; the range is those blocks' positions, nothing around them.
   */
  #resolveSelection(request: ReviewRunScopeRequest, head: ManuscriptHead): ResolvedReviewScope {
    requireReview(typeof request.fromChapterBlockId === 'string' && BLOCK_ID_PATTERN.test(request.fromChapterBlockId) &&
      typeof request.toChapterBlockId === 'string' && BLOCK_ID_PATTERN.test(request.toChapterBlockId), 'REVIEW_SCOPE_INVALID', SELECTION_UNAVAILABLE_REASON);
    const position = (blockId: string): number | null => {
      const row = this.#db.prepare('SELECT position FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(head.branchId, blockId) as SqlRow | undefined;
      return row === undefined ? null : integer(row.position);
    };
    const from = position(request.fromChapterBlockId);
    const to = position(request.toChapterBlockId);
    requireReview(from !== null && to !== null && from <= to, 'REVIEW_SCOPE_INVALID', SELECTION_GONE_REASON);
    requireReview(to - from < MAX_SELECTION_BLOCKS, 'REVIEW_SCOPE_INVALID', SELECTION_TOO_LONG_REASON);
    const blockIds = (this.#db.prepare('SELECT block_id FROM working_blocks WHERE branch_id = ? AND position BETWEEN ? AND ? ORDER BY position')
      .all(head.branchId, from, to) as SqlRow[]).map((row) => text(row.block_id));
    return { kind: 'selection', selectedRange: { startPosition: from, endPosition: to }, blockIds };
  }

  #readBaseline(bookId: string): BaselineReading {
    try {
      return { revision: (this.#ledgers.baseline().inspect(bookId) as BaselineAnalysisProjection).resultSetRevision, error: null };
    } catch (error) {
      if (error instanceof AnalysisError) return { revision: null, error: error.message };
      throw error;
    }
  }

  /**
   * The configuration as it applies to one Book: the house's, with 书系一致性 resolved from the Series Knowledge of the Series
   * the Book is in now (Issue #64, S29a). The house's own digest still names the configuration a Run was prepared under.
   */
  #forBook(bookId: string, house: ReviewCategoryConfiguration, readings?: SeriesKnowledgeReadings): ReviewCategoryConfiguration {
    const resolution = house.categories.some((entry) => entry.executor === 'series-knowledge') ? resolveSeriesConsistency(this.#db, bookId, readings) : null;
    const baseline = house.categories.some((entry) => entry.crossChapter !== undefined) ? reviewBaselineSource(this.#readBaseline(bookId).revision) : null;
    return {
      ...house,
      categories: house.categories.map((entry) => {
        if (entry.crossChapter !== undefined) return { ...entry, crossChapter: { baseline } };
        if (entry.executor !== 'series-knowledge') return reviewCategoryEntryForBook(entry, this.#db, bookId);
        const resolved = seriesConsistencyEntry(entry, resolution!);
        if (resolved.seriesKnowledge === undefined || this.#ledgers.baseline().launch.live === null) return resolved;
        return { ...resolved, seriesScopes: resolved.seriesKnowledge.series.filter((series) => resolved.seriesKnowledge!.revisions.some((pin) => pin.seriesId === series.seriesId))
          .map((series) => freezeSeriesScope(this.#db, bookId, series.seriesId, resolved.seriesKnowledge!.revisions.filter((pin) => pin.seriesId === series.seriesId))) };
      }),
    };
  }

  #guidelineRefusal(entry: ReviewCategoryConfigurationEntry): string | null {
    const launch = this.#ledgers.baseline().launch;
    const admitted = entry.seriesKnowledge === undefined || launch.live === null || launch.policy === undefined ? false
      : liveKindAdmission(launch.policy, this.#ledgers.ledgerOf(entry).definition, launch.live) !== null;
    return houseGuidelineRefusal(entry, launch.live !== null, admitted);
  }

  #deliverablesMoved(bookId: string, entry: ReviewCategoryConfigurationEntry): string | null {
    if (entry.deliverables === undefined) return null;
    const current = reviewDeliverables(this.#db, bookId);
    if (current.unavailableReason !== null) return `${REVIEW_DELIVERABLE_CHANGED} ${current.unavailableReason}`;
    const pins = (reading: typeof current): string => canonicalJson(reading.participants.map(({ documentId, revisionId, revisionDigest, sourceDigest, paragraphs }) =>
      ({ documentId, revisionId, revisionDigest, sourceDigest, paragraphs })));
    return pins(current) === pins(entry.deliverables) ? null : REVIEW_DELIVERABLE_CHANGED;
  }

  #deliverableReference(entry: ReviewCategoryConfigurationEntry, ref: string | null): ReviewFindingProjection['clauseRefs'][number] | null {
    for (const document of entry.deliverables?.participants ?? []) {
      const paragraph = document.paragraphs.find((candidate) => candidate.ref === ref);
      if (paragraph !== undefined) return { documentTitle: `${document.typeLabel}《${document.title}》${document.versionLabel} · 文档 ${document.documentId} · 修订 ${document.revisionId} · 第 ${paragraph.position} 段（只读）`,
        clauseId: paragraph.ref, text: paragraph.text };
    }
    return null;
  }

  /** Existing execution material-guard seam; finalized deliverables are compared again before every transmission. */
  deliverableGuard(runRecordId: string, live: boolean): MaterialGuardRefusal | null {
    // Asked before every transmission of every kind: only a cross-deliverable Run reaches its own Book's Review Run snapshots.
    const row = this.#db.prepare(`SELECT rr.*, i.task_intent_id AS guarded_task_intent_id FROM analysis_run_records r
      JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id AND i.kind = ?
      JOIN review_runs rr ON rr.book_id = i.book_id
      JOIN json_each(rr.canonical_json, '$.categories') c ON json_extract(c.value, '$.task.taskIntentId') = i.task_intent_id
      WHERE r.run_record_id = ? AND json_type(c.value, '$.entry.deliverables') = 'object' LIMIT 1`)
      .get(reviewCategoryKindId('cross-deliverable-consistency'), runRecordId) as SqlRow | undefined;
    if (row === undefined) return null;
    const snapshot = this.#snapshotOf(row);
    const category = snapshot.categories.find((candidate) => candidate.task?.taskIntentId === text(row.guarded_task_intent_id))!;
    let message = this.#deliverablesMoved(snapshot.bookId, category.entry);
    if (message === null && live) {
      const manuscript = this.#db.prepare('SELECT sv.source_digest FROM manuscript_revisions mr JOIN source_versions sv ON sv.source_version_id = mr.source_version_id WHERE mr.revision_id = ?').get(snapshot.manuscript.revisionId) as SqlRow | undefined;
      if (manuscript === undefined || category.entry.deliverables!.participants.some((participant) => participant.sourceDigest !== manuscript.source_digest)) {
        message = '开发者实时模式只允许与本次获准稿件同源的交付物片段；交付物来源未获准，未发送任何内容。';
      }
    }
    return message === null ? null : { code: 'REVIEW_DELIVERABLE_CHANGED', materialTitle: category.entry.label,
      message: `${message} 运行已停止；已完成的单元保留。` };
  }

  /**
   * Whether a Run's 书系一致性 still reads what the Book would be given now: the same Series and exactly the same revisions.
   * A revision taken in or a membership changed after preparation leaves the frozen plan approvable by nobody.
   */
  #seriesKnowledgeMoved(bookId: string, category: SnapshotCategory): boolean {
    if (category.entry.seriesScopes !== undefined) {
      const scopes = category.task === null ? category.entry.seriesScopes : frozenSeriesScopes(this.#db, category.task.taskIntentId, category.task.planEnvelopeDigest) ?? category.entry.seriesScopes;
      try { if (canonicalJson(scopes) !== canonicalJson(scopes.map((scope) => freezeSeriesScope(this.#db, bookId, scope.seriesId,
        category.entry.seriesKnowledge?.revisions.filter((pin) => pin.seriesId === scope.seriesId))))) return true; }
      catch { return true; }
    }
    const pins = category.entry.seriesKnowledge;
    return pins !== undefined && !seriesKnowledgePinsCurrent(pins, resolveSeriesConsistency(this.#db, bookId));
  }

  // ---- 书系检索排除 (Issue #64, plan slice S29b; V2-UX-SER-022 to SER-026) -----------------------------------------------

  /** What each Series Knowledge revision a category pinned is — its class and source Book — read from the knowledge's rows. */
  #pinnedMaterial(category: SnapshotCategory): SeriesKnowledgeMaterial[] {
    if (category.entry.seriesScopes !== undefined) {
      try {
        return seriesScopeMaterials(this.#db, category.entry.seriesScopes);
      } catch (error) {
        // As for the pins below: a frozen record that no longer reads is named as such, never taking 审阅 down with it.
        if (error instanceof AnalysisError) throw new ReviewRunError('REVIEW_RECORD_INVALID', '审阅所依据的书系知识记录无效。');
        throw error;
      }
    }
    const pins = category.entry.seriesKnowledge;
    if (pins === undefined) return [];
    return pins.revisions.map((pin) => {
      const material = knowledgeMaterial(this.#db, pin);
      // A pinned revision is never removed: one that does not read is a record that no longer stands.
      requireReview(material !== null, 'REVIEW_RECORD_INVALID', '审阅所依据的书系知识记录无效。');
      return material;
    });
  }

  /**
   * The current-read guard over one category (SER-023, SER-027): the targets of the exclusions that reach any Series Knowledge
   * it pinned and are in force now, or were in force at any moment after `since` — the Run's own making — even if ended since,
   * by label. Empty when none does, and for every category that reads no Series material. Ending an exclusion never lets a
   * Run made before it read on.
   */
  #excludedTargets(category: SnapshotCategory, since: string): string[] {
    const materials = this.#pinnedMaterial(category);
    if (materials.length === 0) return [];
    const ledger = new SeriesExclusionLedger(this.#db);
    const chains = new Map<string, StoredExclusion[]>();
    const labels = new Set<string>();
    for (const material of materials) {
      let series = chains.get(material.seriesId);
      if (series === undefined) {
        series = ledger.chains(material.seriesId);
        chains.set(material.seriesId, series);
      }
      for (const exclusion of coveringExclusions(series, material)) labels.add(exclusion.target.label);
      for (const chain of series) if (excludedAfter([chain], material, since)) labels.add(chain.target.label);
    }
    return [...labels];
  }

  /**
   * `#excludedTargets` for a read that must not fail (Issue #64 review): what reaches the category, an unreadable record named
   * as such, or `null` when nothing does.
   */
  #unverifiedTargets(category: SnapshotCategory, since: string): string[] | null {
    try {
      const labels = this.#excludedTargets(category, since);
      return labels.length === 0 ? null : labels;
    } catch (error) {
      if (error instanceof SeriesExclusionError || error instanceof ReviewRunError) return [UNREADABLE_EXCLUSIONS];
      throw error;
    }
  }

  /** What stopped a Run for good, from its categories' events: an exclusion, the editor's 取消任务 after it, or nothing. */
  #stoppedFor(reviewRunId: string): ReviewRunStop | null {
    const local = this.#db.prepare('SELECT state FROM review_local_stage_artifacts WHERE review_run_id = ? ORDER BY sequence DESC LIMIT 1').get(reviewRunId);
    if (local?.state === 'cancelled') return 'cancelled';
    const cancelled = this.#db.prepare(`SELECT 1 FROM review_runs rr JOIN json_each(rr.canonical_json, '$.categories') c
      JOIN analysis_run_records r ON r.task_intent_id = json_extract(c.value, '$.task.taskIntentId')
      WHERE rr.review_run_id = ? AND (SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id
        ORDER BY s.sequence DESC LIMIT 1) IN ('cancelling', 'cancelled') LIMIT 1`).get(reviewRunId);
    if (cancelled !== undefined) return 'cancelled';
    let stop: ReviewRunStop | null = null;
    for (const row of this.#db.prepare(
      "SELECT canonical_json, sha256 FROM review_run_category_events WHERE review_run_id = ? AND state IN ('refused', 'interrupted')",
    ).all(reviewRunId) as SqlRow[]) {
      const code = recordOf(text(row.canonical_json), text(row.sha256)).code;
      if (code === REVIEW_RUN_CANCELLED) return 'cancelled';
      if (code === SERIES_RETRIEVAL_SCOPE_CHANGED || code === LEARNING_INFLUENCE_WITHDRAWN) stop = 'scope-changed';
      // Reconnect Preflight found the plan moved while the Run waited (Issue #760): nothing of it began.
      else if (code === REVIEW_RUN_PLAN_MOVED && stop === null) stop = 'plan-moved';
    }
    return stop;
  }

  /**
   * The Review Runs an exclusion reaches, as its impact preview names them (SER-022): Runs approved whose category reading the
   * material has not begun or is reading now — the guard stops each before its next read — Runs prepared and not approved,
   * whose approval is refused, and Runs whose category put on the manuscript a result that used it (SER-026). `covers` says
   * whether the exclusion reaches one piece of knowledge.
   */
  seriesExclusionReach(covers: (material: SeriesKnowledgeMaterial) => boolean): {
    readonly active: ReadonlyArray<{ readonly reviewRunId: string; readonly categoryId: string; readonly route: string; readonly started: boolean }>;
    readonly prepared: number;
    readonly completed: ReadonlyArray<{ readonly reviewRunId: string; readonly route: string }>;
  } {
    const active: Array<{ reviewRunId: string; categoryId: string; route: string; started: boolean }> = [];
    const completed: Array<{ reviewRunId: string; route: string }> = [];
    let prepared = 0;
    const rows = this.#db.prepare(
      `SELECT r.*, b.title book_title,
         (SELECT max(r2.ordinal) FROM review_runs r2 WHERE r2.book_id = r.book_id) latest_ordinal
       FROM review_runs r JOIN books b ON b.book_id = r.book_id
       WHERE EXISTS (SELECT 1 FROM json_each(r.canonical_json, '$.categories') c WHERE json_type(c.value, '$.entry.seriesKnowledge') = 'object' OR json_type(c.value, '$.entry.seriesScopes') = 'array')
       ORDER BY r.created_at, r.review_run_id`,
    ).all() as SqlRow[];
    for (const row of rows) {
      const snapshot = this.#snapshotOf(row);
      const route = `《${text(row.book_title)}》第 ${snapshot.ordinal} 次审阅`;
      const authorized = this.#authorizationOf(snapshot.reviewRunId) !== null;
      const stopped = this.#stoppedFor(snapshot.reviewRunId);
      for (const category of snapshot.categories) {
        if (!this.#pinnedMaterial(category).some(covers)) continue;
        const events = this.#events(snapshot.reviewRunId, category.categoryId);
        const last = events.at(-1)?.state ?? null;
        // A result formed — written to the manuscript or waiting to be — used the material (Issue #64 review).
        if (events.some((event) => event.state === 'materialized' || event.state === 'settled')) completed.push({ reviewRunId: snapshot.reviewRunId, route });
        else if (!authorized) {
          if (integer(row.ordinal) === integer(row.latest_ordinal)) prepared += 1;
        } else if (stopped === null && (last === null || last === 'dispatched')) {
          active.push({ reviewRunId: snapshot.reviewRunId, categoryId: category.categoryId, route, started: last !== null });
        }
      }
    }
    return { active, prepared, completed };
  }

  /**
   * The stop an exclusion makes at once (SER-023, SER-024): an approved Run whose category reading the excluded material has not
   * begun stops now, before its turn, in the exclusion's words. One reading now is stopped by the guard before its next range.
   * Inside the caller's transaction, beside the exclusion's own revision.
   */
  stopForSeriesScope(reviewRunId: string, categoryId: string): boolean {
    const { snapshot, category } = this.#category(reviewRunId, categoryId);
    if (this.#events(reviewRunId, categoryId).length > 0 || this.#stoppedFor(reviewRunId) !== null) return false;
    const excluded = this.#excludedTargets(category, snapshot.createdAt);
    if (excluded.length === 0) return false;
    const detail = seriesScopeStopDetail(excluded);
    transact(this.#db, () => {
      const runRecordId = category.task === null ? null : this.#runRecordOf(category.task.taskIntentId);
      this.#recordEvent(reviewRunId, categoryId, 'refused', detail, { runRecordId, extra: { code: SERIES_RETRIEVAL_SCOPE_CHANGED } });
      this.#blockUndispatchedStarts(snapshot, detail);
    });
    return true;
  }

  /**
   * Every category start of a stopped Run that an earlier hand-off authorized and never got to the owner — the one the stop
   * reached, one #661 left for 继续审阅, one parked after `EXECUTION_BUSY` — sent nothing. Each is blocked before dispatch in
   * the stop's words, inside the stop's own transaction, so none stays authorized and reads as queued for its kind's next
   * Task (Issue #64 review): the stopped Run is never driven again to take it on.
   */
  #blockUndispatchedStarts(snapshot: RunSnapshot, detail: string): void {
    for (const category of snapshot.categories) {
      if (category.task === null) continue;
      const runRecordId = this.#runRecordOf(category.task.taskIntentId);
      if (runRecordId === null) continue;
      if (this.#events(snapshot.reviewRunId, category.categoryId).some((event) => event.state === 'dispatched')) continue;
      const ledger = this.#categoryLedger(category);
      if (ledger.currentRunState(runRecordId) === 'authorized') ledger.recordRunState(runRecordId, 'blocked-before-dispatch', { detail, reasons: [detail] });
    }
  }

  /**
   * The current-read guard the execution owner asks before each reading range of a Run, and before what follows them (SER-023,
   * SER-028): the targets of the exclusions in force that reach the Series Knowledge the Run's Review Run category pinned, or
   * `null` when none does — and for every Run that is not a Review Run category's.
   */
  seriesScopeGuard(runRecordId: string): string | null {
    const binding = this.#db.prepare(`SELECT r.task_intent_id, a.plan_envelope_sha256, v.created_at FROM analysis_run_records r
      JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
      JOIN analysis_plan_versions v ON v.task_intent_id = r.task_intent_id AND v.plan_envelope_sha256 = a.plan_envelope_sha256
      WHERE r.run_record_id = ?`).get(runRecordId);
    if (binding !== undefined) {
      const scopes = frozenSeriesScopes(this.#db, text(binding.task_intent_id), text(binding.plan_envelope_sha256));
      if (scopes !== undefined) return seriesScopeChanged(this.#db, scopes, text(binding.created_at));
    }
    // The Run's Task first, then only the Review Runs whose record names it (Issue #64 review): asked before every range.
    const task = this.#db.prepare('SELECT task_intent_id FROM analysis_run_records WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    if (task === undefined) return null;
    const taskIntentId = text(task.task_intent_id);
    const row = this.#db.prepare(
      `SELECT r.canonical_json, r.sha256, r.review_run_id, r.book_id, r.ordinal, c.value category_json FROM review_runs r
       JOIN json_each(r.canonical_json, '$.categories') c ON json_extract(c.value, '$.task.taskIntentId') = ?
       WHERE instr(r.canonical_json, ?) > 0 AND json_type(c.value, '$.entry.seriesKnowledge') = 'object'`,
    ).get(taskIntentId, taskIntentId) as SqlRow | undefined;
    if (row === undefined) return null;
    const snapshot = this.#snapshotOf(row);
    const categoryId = (JSON.parse(text(row.category_json)) as { categoryId?: unknown }).categoryId;
    const category = snapshot.categories.find((candidate) => candidate.categoryId === categoryId);
    if (category === undefined) return null;
    const excluded = this.#excludedTargets(category, snapshot.createdAt);
    return excluded.length === 0 ? null : excluded.join('、');
  }

  /**
   * 取消任务 of a Run an exclusion stopped (Issue #64, S29b; SER-024): every category not finished, and the stopped one, records
   * the cancellation, so the Run reads 已取消 and offers nothing more. What it put on the manuscript and what it formed stay as
   * they are (SER-025). Refused for a Run the exclusion did not stop.
   */
  cancelStoppedRun(bookId: string, reviewRunId: string): void {
    if (this.#runOfBook(bookId, reviewRunId).localPlan !== undefined) { this.cancelRemaining(bookId, reviewRunId); return; }
    const snapshot = this.#runOfBook(bookId, reviewRunId);
    requireReview(!this.#driving.has(reviewRunId), 'REVIEW_RUN_ACTIVE', '这次审阅正在进行。');
    const stop = this.#stoppedFor(reviewRunId);
    if (stop === 'cancelled') return;
    requireReview(stop === 'scope-changed', 'REVIEW_RUN_NOT_CANCELLABLE', `只有显示「${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}」的审阅可以在这里取消任务。`);
    transact(this.#db, () => {
      for (const category of snapshot.categories) {
        const last = this.#events(reviewRunId, category.categoryId).at(-1) ?? null;
        if (last === null || last.record.code === SERIES_RETRIEVAL_SCOPE_CHANGED || last.record.code === LEARNING_INFLUENCE_WITHDRAWN) {
          this.#recordEvent(reviewRunId, category.categoryId, 'refused', CANCELLED_DETAIL, { extra: { code: REVIEW_RUN_CANCELLED } });
        }
      }
      // Whatever start the stop left authorized ends with the cancellation too (Issue #64 review).
      this.#blockUndispatchedStarts(snapshot, CANCELLED_DETAIL);
    });
  }

  /** The 本社审阅偏好 version a category's Task pinned and the materials behind what it read (Issue #912); `null` for none. */
  #influenceOf(category: SnapshotCategory): ReturnType<HouseReviewPreferenceLedger['pinnedInfluence']> {
    return category.task === null ? null : new HouseReviewPreferenceLedger(this.#db, this.#ledgers.learningLedger).pinnedInfluence(category.task.taskIntentId);
  }

  /**
   * The consumption guard over one category (Issue #912; LAUD-007, LAUD-008): its pinned 本社审阅偏好 version and how many of
   * the materials behind the lines it reads were 停止今后使用 since each was admitted, or `null` when none was. A record that no
   * longer reads stops the category as one withdrawn does: what cannot be checked is never sent.
   */
  #withdrawnInfluence(category: SnapshotCategory): { readonly ordinal: number; readonly withdrawn: number } | null {
    try {
      const influence = this.#influenceOf(category);
      if (influence === null) return null;
      const withdrawn = influence.sources.filter((source) => source.withdrawnAt !== null).length;
      return withdrawn === 0 ? null : { ordinal: influence.version.ordinal, withdrawn };
    } catch (error) {
      if (!(error instanceof LearningEligibilityError)) throw error;
      return { ordinal: 0, withdrawn: 0 };
    }
  }

  /**
   * The stop a withdrawal makes for a category that has not begun (Issue #912; LAUD-008): it records the stop in the
   * withdrawal's words, and every start an earlier hand-off authorized is blocked before dispatch with it, inside one
   * transaction. `false` when the category reads no withdrawn material.
   */
  #stopForWithdrawnInfluence(snapshot: RunSnapshot, category: SnapshotCategory): boolean {
    const withdrawn = this.#withdrawnInfluence(category);
    if (withdrawn === null) return false;
    const detail = influenceStopDetail(category.entry.label, withdrawn);
    transact(this.#db, () => {
      const runRecordId = category.task === null ? null : this.#runRecordOf(category.task.taskIntentId);
      this.#recordEvent(snapshot.reviewRunId, category.categoryId, 'refused', detail, { runRecordId, extra: { code: LEARNING_INFLUENCE_WITHDRAWN } });
      this.#blockUndispatchedStarts(snapshot, detail);
    });
    return true;
  }

  /**
   * The stop 停止今后使用 makes at once (Issue #912; LAUD-008): an approved Run whose category reading the withdrawn material has
   * not begun stops now, before its turn, exactly as `start` would stop it. Inside the caller's transaction.
   */
  stopForWithdrawnInfluence(reviewRunId: string, categoryId: string): boolean {
    const { snapshot, category } = this.#category(reviewRunId, categoryId);
    if (this.#driving.has(reviewRunId) || this.#events(reviewRunId, categoryId).length > 0 || this.#stoppedFor(reviewRunId) !== null) return false;
    return this.#stopForWithdrawnInfluence(snapshot, category);
  }

  /**
   * The current-read guard over 本社审阅偏好 (Issue #912; LAUD-008), asked by the execution owner before each reading range of a
   * Run and before what follows them: the version a Review Run category's Task pinned, by label, when a material behind what it
   * reads was 停止今后使用 since, or `null` — and for every Run that pinned none.
   */
  learningReadGuard(runRecordId: string): string | null {
    const task = this.#db.prepare('SELECT task_intent_id FROM analysis_run_records WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    if (task === undefined) return null;
    try {
      const influence = new HouseReviewPreferenceLedger(this.#db, this.#ledgers.learningLedger).pinnedInfluence(text(task.task_intent_id));
      if (influence === null || influence.sources.every((source) => source.withdrawnAt === null)) return null;
      return `本社审阅偏好 v${influence.version.ordinal}`;
    } catch (error) {
      if (!(error instanceof LearningEligibilityError)) throw error;
      return '无法读取的本社审阅偏好记录';
    }
  }

  /** Dispatch is scheduling, not consumption: only a recorded model turn admitted with this Task's frozen prompt proves use. */
  #preferenceConsumed(taskIntentId: string): boolean {
    for (const row of this.#db.prepare(`SELECT s.canonical_json, s.sha256 FROM analysis_harness_spans s
      JOIN analysis_execution_attempts a ON a.attempt_id = s.attempt_id
      JOIN analysis_run_records r ON r.run_record_id = a.run_record_id
      WHERE r.task_intent_id = ? ORDER BY s.ordinal`).iterate(taskIntentId) as IterableIterator<SqlRow>) {
      const span = recordOf(text(row.canonical_json), text(row.sha256));
      if (typeof span.payloadDigest === 'string') return true;
    }
    return false;
  }

  /**
   * What each Run pin of a material is now (Issue #912; LAUD-004, LAUD-006): its Review Run and category by name, and whether
   * the category was only prepared, approved and not begun, reading, finished with a result, or stopped — and whether it sent
   * anything. A prepared Run a later preparation of its Book superseded is never approved, and says so.
   */
  influenceUses(pins: ReadonlyArray<{ readonly reviewRunId: string; readonly taskIntentId: string }>): Array<{
    readonly reviewRunId: string;
    readonly categoryId: string;
    readonly bookId: string;
    readonly label: string;
    readonly route: string;
    readonly state: 'prepared' | 'superseded' | 'approved' | 'running' | 'completed' | 'stopped';
    readonly consumed: boolean;
  }> {
    return pins.flatMap((pin) => {
      const row = this.#db.prepare(`SELECT r.*, b.title book_title, (SELECT max(r2.ordinal) FROM review_runs r2 WHERE r2.book_id = r.book_id) latest_ordinal
        FROM review_runs r JOIN books b ON b.book_id = r.book_id WHERE r.review_run_id = ?`).get(pin.reviewRunId) as SqlRow | undefined;
      if (row === undefined) return [];
      const snapshot = this.#snapshotOf(row);
      const category = snapshot.categories.find((entry) => entry.task?.taskIntentId === pin.taskIntentId);
      if (category === undefined) return [];
      const events = this.#events(snapshot.reviewRunId, category.categoryId);
      const dispatched = events.some((event) => event.state === 'dispatched');
      const consumed = this.#preferenceConsumed(pin.taskIntentId);
      const authorized = this.#authorizationOf(snapshot.reviewRunId) !== null;
      const state = consumed && events.some((event) => event.state === 'materialized' || event.state === 'settled') ? 'completed' as const
        : !authorized ? integer(row.ordinal) === integer(row.latest_ordinal) ? 'prepared' as const : 'superseded' as const
          : events.some((event) => TERMINAL_CATEGORY_EVENTS.has(event.state)) || this.#stoppedFor(snapshot.reviewRunId) !== null ? 'stopped' as const
            : dispatched ? 'running' as const : 'approved' as const;
      const route = `《${text(row.book_title)}》第 ${snapshot.ordinal} 次审阅`;
      return [{ reviewRunId: snapshot.reviewRunId, categoryId: category.categoryId, bookId: snapshot.bookId, route, label: `${route} · ${category.entry.label}`, state, consumed }];
    });
  }

  /**
   * 为什么会影响这个结果 of one Run (Issue #912; LAUD-004): each category's pinned 本社审阅偏好 version and the materials behind
   * the lines it read. A record that no longer reads leaves its category out rather than take 审阅 down.
   */
  #influenceProjection(snapshot: RunSnapshot): ReviewRunInfluenceProjection[] {
    return snapshot.categories.flatMap((category) => {
      if (category.task === null || !this.#preferenceConsumed(category.task.taskIntentId)) return [];
      let influence: ReturnType<HouseReviewPreferenceLedger['pinnedInfluence']>;
      try {
        influence = new HouseReviewPreferenceLedger(this.#db, this.#ledgers.learningLedger).pinnedInfluence(category.task.taskIntentId, { historical: true });
      } catch (error) {
        if (!(error instanceof LearningEligibilityError)) throw error;
        return [];
      }
      if (influence === null) return [];
      return [{
        categoryId: category.categoryId,
        categoryLabel: category.entry.label,
        versionId: influence.version.versionId,
        ordinal: influence.version.ordinal,
        sourceCount: influence.preference.sourceCount,
        materials: influence.sources.slice(0, MAX_REVIEW_RUN_INFLUENCE_MATERIALS).map((source) => ({
          bookId: source.bookId,
          bookTitle: source.bookTitle,
          materialKey: source.materialKey,
          kind: materialKindOf(source.materialKey),
          ...(source.provenanceAvailability === undefined ? {} : { provenanceAvailability: source.provenanceAvailability }),
          withdrawnAt: source.withdrawnAt,
        })),
        moreMaterials: Math.max(0, influence.sources.length - MAX_REVIEW_RUN_INFLUENCE_MATERIALS),
      }];
    });
  }

  /** The first withdrawal behind a marked category's result, which the marker links to (Issue #912; LAUD-008). */
  #influenceRemediation(snapshot: RunSnapshot, affected: ReadonlyMap<string, string>): { bookId: string; materialKey: string; recordedAt: string } | null {
    for (const category of snapshot.categories) {
      if (!affected.has(category.categoryId) || category.task === null || !this.#preferenceConsumed(category.task.taskIntentId)) continue;
      try {
        const source = this.#influenceOf(category)?.sources.filter((entry) => entry.withdrawnAt !== null && entry.materialKey !== null)
          .sort((a, b) => a.withdrawnAt! < b.withdrawnAt! ? -1 : a.withdrawnAt! > b.withdrawnAt! ? 1 : 0)[0];
        if (source !== undefined) return { bookId: source.bookId, materialKey: source.materialKey!, recordedAt: source.withdrawnAt! };
      } catch (error) {
        if (!(error instanceof LearningEligibilityError)) throw error;
      }
    }
    return null;
  }

  /** What stopped a `scope-changed` Run, from the first stop its categories recorded. */
  #scopeStopOf(reviewRunId: string): RunView['scopeStop'] {
    for (const row of this.#db.prepare(
      "SELECT canonical_json, sha256 FROM review_run_category_events WHERE review_run_id = ? AND state IN ('refused', 'interrupted') ORDER BY sequence",
    ).all(reviewRunId) as SqlRow[]) {
      const code = recordOf(text(row.canonical_json), text(row.sha256)).code;
      if (code === SERIES_RETRIEVAL_SCOPE_CHANGED) return 'series-knowledge';
      if (code === LEARNING_INFLUENCE_WITHDRAWN) return 'house-review-preference';
    }
    return null;
  }

  /**
   * The categories of a Run whose result used Series material an exclusion reached afterwards (SER-026): each put its findings
   * on the manuscript, and a revision that was ever in force — not one that ended it — was recorded after the Run was made.
   * From the append-only ledger alone, so the marker never goes away.
   */
  #historicallyAffected(snapshot: RunSnapshot, chains: Map<string, StoredExclusion[]>): Map<string, string> {
    const affected = this.#seriesAffected(snapshot, chains);
    // A result that read a 本社审阅偏好 version whose material was 停止今后使用 afterwards (Issue #912; LAUD-008): the Run, its
    // findings and its reports stay as they are, and the append-only decision ledger keeps the marker.
    for (const category of snapshot.categories) {
      if (affected.has(category.categoryId) || category.task === null || !this.#preferenceConsumed(category.task.taskIntentId)) continue;
      if (!this.#events(snapshot.reviewRunId, category.categoryId).some((event) => event.state === 'materialized' || this.#retained(event))) continue;
      try {
        if (this.#influenceOf(category)?.sources.some((source) => source.withdrawnAt !== null) === true) affected.set(category.categoryId, LEARNING_INFLUENCE_RESULT_MARKER);
      } catch (error) {
        if (!(error instanceof LearningEligibilityError)) throw error;
        affected.set(category.categoryId, HISTORICAL_MARKER_UNVERIFIABLE);
      }
    }
    return affected;
  }

  #seriesAffected(snapshot: RunSnapshot, chains: Map<string, StoredExclusion[]>): Map<string, string> {
    const affected = new Map<string, string>();
    for (const category of snapshot.categories) {
      if (category.entry.seriesKnowledge === undefined && category.entry.seriesScopes === undefined) continue;
      const hasOutput = this.#events(snapshot.reviewRunId, category.categoryId).some((event) => event.state === 'materialized' || this.#retained(event));
      if (!hasOutput) continue;
      // The material was used from the category's dispatch on (Issue #64 review): an exclusion after that marks the result.
      const dispatched = this.#db.prepare(
        "SELECT min(recorded_at) at FROM review_run_category_events WHERE review_run_id = ? AND category_id = ? AND state = 'dispatched'",
      ).get(snapshot.reviewRunId, category.categoryId) as SqlRow;
      const usedFrom = nullableText(dispatched.at) ?? snapshot.createdAt;
      try {
        for (const material of this.#pinnedMaterial(category)) {
          let series = chains.get(material.seriesId);
          if (series === undefined) {
            series = new SeriesExclusionLedger(this.#db).chains(material.seriesId);
            chains.set(material.seriesId, series);
          }
          if (excludedAfter(series, material, usedFrom)) {
            affected.set(category.categoryId, HISTORICALLY_AFFECTED_RESULT_MARKER);
            break;
          }
        }
      } catch (error) {
        // A record that no longer reads says so on the result, and never takes 审阅 down with it (Issue #64 review).
        if (!(error instanceof SeriesExclusionError || error instanceof ReviewRunError)) throw error;
        affected.set(category.categoryId, HISTORICAL_MARKER_UNVERIFIABLE);
      }
    }
    return affected;
  }

  /**
   * 书系一致性 of one member Book as the 书系 page's 成员与共享范围 states it (Issue #64, S29a; editor-surfaces §8.3): why it
   * cannot be chosen now, `null` when it can, and when its findings were last put on the manuscript. `readings` is shared by
   * the members of one page, so each Series is read once for them all (Issue #64 review). The reasons are 审阅's own,
   * developer-live's refusal of the house's text included, so the two never disagree.
   */
  seriesConsistencyState(bookId: string, readings?: SeriesKnowledgeReadings): { readonly unavailableReason: string | null; readonly reviewedAt: string | null } {
    const entry = this.#forBook(bookId, this.#configuration(), readings).categories.find((candidate) => candidate.categoryId === 'series-consistency');
    const last = this.#db.prepare(
      `SELECT max(e.recorded_at) reviewed_at FROM review_run_category_events e JOIN review_runs r ON r.review_run_id = e.review_run_id
       WHERE r.book_id = ? AND e.category_id = 'series-consistency' AND e.state = 'materialized' AND r.scope_kind <> 'selection'`,
    ).get(bookId) as SqlRow;
    const unavailableReason = entry === undefined
      ? '这一类暂不可用。'
      : entry.executor === 'unavailable'
        ? entry.unavailableReason ?? '这一类暂不可用。'
        : this.#head(bookId) === null ? NO_MANUSCRIPT_REASON : this.#guidelineRefusal(entry);
    return { unavailableReason, reviewedAt: nullableText(last.reviewed_at) };
  }

  /** What one category can do now: from its own ledger for a Task-backed one, from the baseline for the leads. */
  #readCategory(bookId: string, head: ManuscriptHead | null, entry: ReviewCategoryConfigurationEntry, baseline: BaselineReading, progress: ProgressReader | undefined): CategoryReading {
    const none: ReviewCategoryLedgerFacts = { hasRevision: false, stale: false, syncUnavailableReason: null, baselineRevision: baseline.revision !== null };
    // The house's 书系一致性 is never read unresolved; were it, it could not run.
    if (entry.executor === 'unavailable' || entry.executor === 'series-knowledge') {
      return { entry, unavailableReason: entry.unavailableReason ?? '这一类暂不可用。', facts: none, projection: null };
    }
    if (head === null) return { entry, unavailableReason: NO_MANUSCRIPT_REASON, facts: none, projection: null };
    if (entry.executor === 'local-text-check') return { entry, unavailableReason: null, facts: none, projection: null };
    if (entry.executor === 'baseline-leads') {
      return { entry, unavailableReason: baseline.error ?? (baseline.revision === null ? LEADS_ABSENT_REASON : null), facts: none, projection: null };
    }
    const withheld = this.#guidelineRefusal(entry);
    if (withheld !== null) return { entry, unavailableReason: withheld, facts: none, projection: null };
    const launch = this.#ledgers.baseline().launch;
    if (launch.live !== null && (launch.policy === undefined || liveReviewRule(launch.policy, entry) === null)) {
      return { entry, unavailableReason: liveReviewUnavailableReason(entry), facts: none, projection: null };
    }
    let projection: AnalysisProjection;
    try {
      projection = this.#ledgers.ledgerOf(entry, undefined, undefined, bookId).inspect(bookId, progress);
    } catch (error) {
      if (error instanceof AnalysisError) return { entry, unavailableReason: error.message, facts: none, projection: null };
      throw error;
    }
    const revision = projection.resultSetRevision;
    const actions = projection.updateControls?.actions as Readonly<Record<string, { unavailableReason: string | null }>> | undefined;
    // Reviewed as the coverage matrix reads it (P1-3): by a Run that is not a 当前选区, which put the category on the manuscript.
    const reviewed = revision !== null && this.#db.prepare(
      `SELECT 1 FROM review_run_category_events e JOIN review_runs r ON r.review_run_id = e.review_run_id
       WHERE r.book_id = ? AND e.category_id = ? AND e.state = 'materialized' AND r.scope_kind <> 'selection' LIMIT 1`,
    ).get(bookId, entry.categoryId) !== undefined;
    // The ledger's latest revision is a 当前选区 Run's (final review P1-4): never the base 只审改动过的章 measures from.
    const selectionBase = revision !== null && this.#db.prepare(
      `SELECT 1 FROM review_run_category_events e JOIN review_runs r ON r.review_run_id = e.review_run_id
       WHERE e.result_set_revision_id = ? AND e.category_id = ? AND r.scope_kind = 'selection' LIMIT 1`,
    ).get(revision.revisionId, entry.categoryId) !== undefined;
    // What a 选章 left unread after it changed since the category read it (Issue #709): measured per unit, from the latest
    // revision that read it — the one walk the ledger keeps per revision, which its plan and gate read too (#711 review).
    let unread: UnreadChanges = NO_UNREAD_CHANGES;
    if (revision !== null) {
      try {
        unread = this.#ledgers.ledgerOf(entry, undefined, undefined, bookId).unreadChanges(bookId);
      } catch (error) {
        if (error instanceof AnalysisError) return { entry, unavailableReason: error.message, facts: none, projection: null };
        throw error;
      }
    }
    const facts: ReviewCategoryLedgerFacts = {
      hasRevision: revision !== null,
      reviewed,
      selectionBase,
      stale: revision !== null && revision.freshness.state === 'stale',
      unreadChanges: unread.units > 0,
      syncUnavailableReason: actions?.['review-sync']?.unavailableReason ?? null,
      baselineRevision: baseline.revision !== null,
    };
    return {
      entry,
      unavailableReason: entry.executor === 'factual-review-kind' && revision !== null ? FACTUAL_AGAIN_REASON : null,
      facts,
      projection,
      unread,
    };
  }

  #workspaceCategory(reading: CategoryReading, chapters: ChapterOptions): ReviewWorkspaceCategoryProjection {
    const entry = reading.entry;
    const first = chapters.chapters[0];
    const scope = (kind: ReviewScopeKind): ReviewAvailabilityProjection => {
      if (reading.unavailableReason !== null) return { available: false, unavailableReason: reading.unavailableReason };
      // 当前选区 is offered for whatever paragraph a selection will name (Issue #423, S77b). Block 1 stands in for every one: this
      // holds only while `reviewCategoryScopePlan` decides a range scope by whether a range exists, never by its positions — a rule
      // that read the range's values would have to be asked with the selection itself.
      const selectedRange = kind === 'chapters' && first !== undefined ? { startPosition: first.position, endPosition: first.endPosition }
        : kind === 'selection' ? { startPosition: 1, endPosition: 1 } : null;
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
      modelFree: entry.executor === 'baseline-leads' || entry.executor === 'local-text-check',
      materialReferencesAllowed: entry.executor === 'review-category-contract',
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
      // A selection is handed over from the manuscript by 就这段发起任务… (Issue #423, S77b); the sheet holds none of its own.
      selection: { available: false, unavailableReason: SELECTION_UNAVAILABLE_REASON },
    };
  }

  /**
   * The coverage matrix (B9): each category against the manuscript as it stands, from the latest
   * revision one of this Book's Review Runs put on the manuscript — `current` while the manuscript is
   * still the one it read (and, for the leads, while their baseline revision is still the latest) and no
   * 选章 left an edit unread (Issue #709), `needs-review` once it moved or while one did, `never` before
   * any, and `unavailable` for a category that cannot run and never has.
   */
  #coverage(bookId: string, head: ManuscriptHead | null, readings: ReadonlyArray<CategoryReading>, baseline: BaselineReading): ReviewCoverageRowProjection[] {
    const latest = new Map<string, { ordinal: number; revisionId: string }>();
    for (const row of this.#db.prepare(
      `SELECT e.category_id, e.result_set_revision_id, r.ordinal FROM review_run_category_events e
       JOIN review_runs r ON r.review_run_id = e.review_run_id
       WHERE r.book_id = ? AND e.state = 'materialized' AND r.scope_kind <> 'selection' ORDER BY r.ordinal, e.sequence`,
    ).all(bookId) as SqlRow[]) {
      latest.set(text(row.category_id), { ordinal: integer(row.ordinal), revisionId: text(row.result_set_revision_id) });
    }
    // The local procedure reports predicate counters, never the nine categories' whole-coverage badge.
    return readings.filter((reading) => reading.entry.executor !== 'local-text-check').map((reading): ReviewCoverageRowProjection => {
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
      // An edit a 选章 left unread is still to review, however current its revision (Issue #709).
      // The gate's own fact (#711 review P2-1): a unit 只审改动过的章 would read again keeps the row at 需复审, and its blocks
      // are counted.
      const unread = reading.unread ?? NO_UNREAD_CHANGES;
      const current = fresh && unread.units === 0 && (entry.executor !== 'baseline-leads' || baseline.revision?.revisionId === last.revisionId);
      return row(current ? 'current' : 'needs-review', {
        lastRunOrdinal: last.ordinal,
        lastReviewedRevisionLabel: text(pin.revision_label),
        changedBlocks: fresh && unread.units === 0 ? 0 : this.#changedBlocks(head, pinnedRevisionId, unread.blockIds),
        unavailableReason: unreadWalkCutNote(unread.cut),
      });
    });
  }

  /** Blocks added, removed or changed between a Manuscript Revision and the working manuscript now. */
  /**
   * Blocks added, removed or changed between a Manuscript Revision and the working manuscript now — and, each counted once
   * with them, the blocks that make a unit a 选章 left unread changed since the category read it (Issue #709): changed,
   * added, removed from its place or reordered within it.
   */
  #changedBlocks(head: ManuscriptHead, revisionId: string, unread: ReadonlySet<string>): number {
    const changed = new Set((this.#db.prepare(
      `SELECT wb.block_id FROM working_blocks wb WHERE wb.branch_id = ? AND NOT EXISTS (
         SELECT 1 FROM manuscript_block_versions v WHERE v.revision_id = ? AND v.block_id = wb.block_id AND v.digest = wb.digest)
       UNION
       SELECT v.block_id FROM manuscript_block_versions v WHERE v.revision_id = ? AND NOT EXISTS (
         SELECT 1 FROM working_blocks wb WHERE wb.branch_id = ? AND wb.block_id = v.block_id)`,
    ).all(head.branchId, revisionId, revisionId, head.branchId) as SqlRow[]).map((row) => text(row.block_id)));
    for (const blockId of unread) changed.add(blockId);
    return changed.size;
  }

  /** Everything a Run reads as: its categories' states, its findings with their derived status, its own state. */
  #runView(snapshot: RunSnapshot, chains: Map<string, StoredExclusion[]> = new Map()): RunView {
    return {
      ...this.#runStateView(snapshot),
      findings: this.#findingViews(snapshot.reviewRunId, snapshot.manuscript.branchId, null),
      historicallyAffected: this.#historicallyAffected(snapshot, chains),
    };
  }

  /** A Run's categories and its own state, from the records alone: everything `#runView` reads but the findings. */
  #runStateView(snapshot: RunSnapshot): Omit<RunView, 'findings' | 'historicallyAffected'> {
    snapshot = this.#run(snapshot.reviewRunId);
    const authorization = this.#authorizationOf(snapshot.reviewRunId);
    const driving = this.#driving.has(snapshot.reviewRunId);
    const stop = this.#stoppedFor(snapshot.reviewRunId);
    const waiting = this.#waits(snapshot, authorization);
    const categories = snapshot.categories.map((category): CategoryView => {
      if (category.executor === 'local-text-check') {
        const last = readLocalStageArtifacts(this.#db, snapshot.reviewRunId).at(-1)?.record;
        const state: ReviewRunCategoryState = last?.state === 'materialized' ? 'settled' : last?.state === 'failed' ? 'failed'
          : last?.state === 'refused' ? 'refused' : last?.state === 'cancelled' ? 'interrupted'
            : driving ? 'running' : authorization === null ? 'prepared' : last?.state === 'interrupted' ? 'interrupted' : 'waiting';
        // This is a view of the local artifact, never a model-event row or an analysis-result identity.
        const materialized: CategoryEvent | null = last?.state !== 'materialized' ? null : { sequence: last.sequence, state: 'materialized', detail: last.detail,
          runRecordId: null, resultSetRevisionId: null, record: { localPlanDigest: last.planDigest,
            excludedCount: last.result === null ? 0 : last.result.excluded.length + last.result.candidates.length - exactLocalCandidateIds(snapshot.localPlan!, last.result.candidates).size } };
        return { category, events: [], state, stateLabel: last?.state === 'cancelled' ? REVIEW_RUN_CANCELLED_LABEL : reviewRunCategoryStateLabel(state, false),
          detail: last?.detail ?? null, pending: last === undefined || ['started', 'completed', 'interrupted'].includes(last.state), materialized };
      }
      const events = this.#events(snapshot.reviewRunId, category.categoryId);
      const last = events.at(-1) ?? null;
      let ledgerRun: ReviewLedgerRunOutcome = 'unfinished';
      if (last?.state === 'dispatched' && last.runRecordId !== null) {
        try {
          const ledgerState = this.#categoryLedger(category).currentRunState(last.runRecordId);
          ledgerRun = ledgerState === 'completed' || ledgerState === 'completed-with-gaps' ? 'completed' : ledgerState === 'failed' ? 'failed' : 'unfinished';
        } catch (error) {
          if (!(error instanceof AnalysisError)) throw error;
        }
      }
      const { state, pending } = reviewRunCategoryState({ authorized: authorization !== null, driving, lastEvent: last?.state ?? null, ledgerRun });
      const waitingForPlace = driving && state === 'waiting' && this.#placeWaits.get(snapshot.reviewRunId) === category.categoryId;
      const derived = !driving && pending && authorization !== null
        ? waiting ? WAITING_DETAIL
          : stop !== null && last === null ? STOPPED_UNSTARTED_DETAIL
          : state === 'interrupted' ? INTERRUPTED_DETAIL
            : state === 'failed' ? FAILED_UNRECORDED_DETAIL
              : last !== null ? UNWRITTEN_DETAIL : UNSTARTED_DETAIL
        : null;
      return {
        category,
        events,
        state,
        // A category the exclusion stopped, or the editor then cancelled, reads the stop's own words (SER-024).
        stateLabel: reviewRunCategoryStopLabel(last?.record.code) ?? reviewRunCategoryStateLabel(state, waitingForPlace),
        detail: waitingForPlace ? REVIEW_CATEGORY_PLACE_WAIT_DETAIL : derived ?? (last === null || last.state === 'dispatched' ? null : last.detail),
        pending,
        materialized: events.find((event) => event.state === 'materialized') ?? null,
        retained: events.find((event) => this.#retained(event)) ?? null,
      };
    });
    const { state, canContinue } = reviewRunState({
      authorized: authorization !== null,
      driving,
      categories: categories.map((view) => ({ pending: view.pending, materialized: view.materialized !== null,
        retained: typeof view.retained?.record.findingCount === 'number' && view.retained.record.findingCount > 0 })),
      stop,
      waiting,
    });
    return {
      snapshot,
      authorization,
      driving,
      categories,
      state,
      canContinue,
      scopeStop: state === 'scope-changed' ? this.#scopeStopOf(snapshot.reviewRunId) : null,
    };
  }

  // ---- 图书交付包 (Issue #416, plan slice S67a) -----------------------------------------------------------

  /**
   * What 图书交付包 reads of a Book's Review Runs (BUNDLE-001, BUNDLE-002): each Run oldest first, with its state as
   * `#runView` derives it — a category a stopped service left dispatched is read, never recorded — and its newest
   * report version, if the Run has not moved since. A read.
   */
  packageReadings(bookId: string): PackageReviewRunReading[] {
    const rows = this.#db.prepare('SELECT * FROM review_runs WHERE book_id = ? ORDER BY ordinal').all(bookId) as SqlRow[];
    const latestReport = this.#db.prepare('SELECT report_id, version, generated_at, sha256 FROM review_reports WHERE review_run_id = ? ORDER BY version DESC LIMIT 1');
    const latestEvent = this.#db.prepare('SELECT max(recorded_at) last FROM review_run_category_events WHERE review_run_id = ?');
    return rows.map((row) => {
      const view = this.#runStateView(this.#snapshotOf(row));
      const report = latestReport.get(view.snapshot.reviewRunId) as SqlRow | undefined;
      const moved = (latestEvent.get(view.snapshot.reviewRunId) as SqlRow).last;
      // A report the Run moved past — a category dispatched, settled or stopped after it was generated, as 继续审阅 does
      // after a report of a partial Run — writes a Run that no longer is: the package reads it as none until a newer one.
      const current = report !== undefined && (moved === null || text(report.generated_at) >= text(moved));
      return {
        reviewRunId: view.snapshot.reviewRunId,
        ordinal: view.snapshot.ordinal,
        label: `第 ${view.snapshot.ordinal} 次`,
        state: view.state,
        report: !current
          ? null
          : { reportId: text(report.report_id), version: integer(report.version), digest: text(report.sha256), generatedAt: text(report.generated_at) },
      };
    });
  }

  // ---- 待我处理 (Issue #424, plan slice S78) ------------------------------------------------------------

  /**
   * What 待我处理 reads of the Review Runs (V2-UX-ATTN-002 to 005): each Book's latest Run — a newer Run
   * settles an older one's item — and the Runs that put a category on the manuscript since `since`, newest
   * first, of which the reader keeps those that reached it in every category. Each is read as `#runView`
   * reads it, without its findings: a Book's findings belong to its own 发现 (V2-UX-IA-013). A read: a
   * category a stopped service left dispatched is reported as `#runView` derives it, never recorded.
   * `progress` is the execution owner's reader, so a category executing now carries its progress.
   */
  attentionReadings(
    progress: ProgressReader,
    since: string,
    limit: number,
    // A Book's 任务 panel (Issue #423, S77a): that Book alone, and its latest Run even when it was prepared and not started.
    scope: { bookId: string; prepared: boolean } | null = null,
  ): {
    latest: ReviewRunAttentionReading[];
    completed: ReviewRunAttentionReading[];
  } {
    const read = (row: SqlRow): ReviewRunAttentionReading => {
      const view = this.#runStateView(this.#snapshotOf(row));
      const last = this.#db.prepare('SELECT max(recorded_at) last FROM review_run_category_events WHERE review_run_id = ?')
        .get(view.snapshot.reviewRunId) as SqlRow;
      const blockIds = view.snapshot.scope.kind === 'selection' ? view.snapshot.scope.blockIds ?? [] : [];
      const selection = blockIds.length === 0 ? null : { manuscriptId: view.snapshot.manuscript.manuscriptId, fromBlockId: blockIds[0]!, toBlockId: blockIds[blockIds.length - 1]! };
      const control = this.controlTasks(view.snapshot.bookId, view.snapshot.reviewRunId).flatMap((task) =>
        task.ledger.attentionReadings(progress, since, limit, { bookId: view.snapshot.bookId, cancelled: false }).tasks
          .filter((reading) => reading.taskIntentId === task.taskIntentId && reading.run !== null &&
            (['pausing', 'paused', 'resumable', 'awaiting-clarification', 'cancelling'].includes(reading.run.state) || reading.run.progress !== null)))[0];
      return {
        ...(control === undefined ? {} : { control }),
        bookId: view.snapshot.bookId,
        bookTitle: text(row.book_title),
        reviewRunId: view.snapshot.reviewRunId,
        ordinal: view.snapshot.ordinal,
        scopeKind: view.snapshot.scope.kind,
        // The paragraphs a 当前选区 Run was started on, for the card's 跳到所选文字 (Issue #423, S77 deferred item d).
        ...(selection === null ? {} : { selection }),
        createdAt: view.snapshot.createdAt,
        authorizedAt: view.authorization?.authorizedAt ?? null,
        waitingIdle: waitsForIdleStart(view),
        state: view.state,
        canContinue: view.canContinue,
        categories: view.categories.map((category) => {
          const dispatched = category.state === 'running' ? category.events.findLast((event) => event.runRecordId !== null)?.runRecordId ?? null : null;
          return {
            categoryId: category.category.categoryId,
            label: category.category.entry.label,
            state: category.state,
            stateLabel: category.stateLabel,
            pending: category.pending,
            detail: category.detail,
            progress: dispatched === null ? null : progress(dispatched),
          };
        }),
        lastEventAt: nullableText(last.last),
      };
    };
    // A Run reached the manuscript in every category exactly when each of its categories has a
    // `materialized` event; counted in SQL so neither list reads a Run it would drop.
    const materialized = `(SELECT count(DISTINCT e.category_id) FROM review_run_category_events e
                            WHERE e.review_run_id = r.review_run_id AND e.state = 'materialized')`;
    const categories = `json_array_length(r.canonical_json, '$.categories')`;
    const lastEvent = `(SELECT max(e.recorded_at) FROM review_run_category_events e WHERE e.review_run_id = r.review_run_id)`;
    // Each Book's latest Run, approved and not yet on the manuscript in every category.
    const latest = (this.#db.prepare(
      `SELECT r.*, b.title book_title FROM review_runs r JOIN books b ON b.book_id = r.book_id
       WHERE r.ordinal = (SELECT max(r2.ordinal) FROM review_runs r2 WHERE r2.book_id = r.book_id)
         AND (? = 1 OR EXISTS (SELECT 1 FROM review_run_authorizations a WHERE a.review_run_id = r.review_run_id))
         AND ${materialized} < ${categories}
         AND (? IS NULL OR r.book_id = ?)
       ORDER BY r.created_at, r.review_run_id LIMIT ?`,
    ).all(scope?.prepared === true ? 1 : 0, scope?.bookId ?? null, scope?.bookId ?? null, limit) as SqlRow[]).map(read);
    // Every Run on the manuscript in every category whose last category finished within the window.
    const completed = (this.#db.prepare(
      `SELECT r.*, b.title book_title FROM review_runs r JOIN books b ON b.book_id = r.book_id
       WHERE ${materialized} = ${categories} AND ${lastEvent} >= ?
         AND (? IS NULL OR r.book_id = ?)
       ORDER BY ${lastEvent} DESC, r.review_run_id LIMIT ?`,
    ).all(since, scope?.bookId ?? null, scope?.bookId ?? null, limit) as SqlRow[]).map(read).filter((reading) => reading.state === 'settled');
    return { latest, completed };
  }

  /**
   * The findings of one Run (or one of them) with everything their status is derived from (B7): the
   * mark each names, the latest decision on it, what it became when converted, and whether it — or the
   * same finding in another Run, through the one mark they share — was ignored.
   */
  #findingViews(reviewRunId: string, branchId: string, findingId: string | null): FindingView[] {
    const rows = this.#db.prepare(
      `SELECT f.*, em.kind mark_kind, em.status mark_status, em.anchor_state mark_anchor, em.from_grapheme mark_from, em.to_grapheme mark_to,
              COALESCE((SELECT d.decision_id FROM proposal_change_items i JOIN proposal_item_decisions d ON d.item_id = i.item_id WHERE i.mark_id = f.mark_id ORDER BY d.ordinal DESC LIMIT 1),
                (SELECT d.disposition_id FROM review_finding_dispositions d WHERE d.review_run_id = f.review_run_id AND d.finding_id = f.finding_id ORDER BY d.ordinal DESC LIMIT 1)) learning_decision_id,
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
      const originMarkId = nullableText(row.mark_id);
      const ignoreReason = nullableText(row.ignore_reason);
      // A suggestion a conflict saved as a new version is the same finding's: it reads the newest version.
      const mark = newestSuggestionVersion(this.#versionView(row), (version) =>
        version.convertedTo === 'change-suggestion' && version.markId !== null ? this.#nextVersion(version.markId) : null);
      const { markId, markStatus, decision } = mark;
      const { status, statusDetail } = reviewFindingStatus({
        ignored: ignoreReason !== null,
        markId,
        markStatus,
        decision: decision === null || decision === 'withdrawn' ? null : decision as 'accepted' | 'accepted-with-edit' | 'rejected',
        convertedTo: mark.convertedTo,
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
        fromGrapheme: markId === null || mark.from === null ? integer(row.from_grapheme) : mark.from,
        toGrapheme: markId === null || mark.to === null ? integer(row.to_grapheme) : mark.to,
        quote: text(row.quote),
        note: text(row.note),
        referencedRuleVersions: text(row.canonical_json).includes('"referencedRuleVersions"')
          ? (recordOf(text(row.canonical_json), text(row.sha256)).referencedRuleVersions ?? []) as ReadonlyArray<ReferencedRuleVersion> : [],
        learningDecisionId: nullableText(row.learning_decision_id),
        replacement: nullableText(row.replacement),
        clauseRef: nullableText(row.clause_ref),
        stateLine: nullableText(row.state_line),
        markId,
        originMarkId,
        markStatus,
        anchorState: markId === null ? 'anchor-changed' : mark.anchor as FindingView['anchorState'],
        blockPosition: row.block_position === null || row.block_position === undefined ? null : integer(row.block_position),
        ignoreReason,
        status,
        statusDetail,
      };
    });
  }

  /** A finding's own mark as `#findingViews` read it, in the shape its next versions are read in. */
  #versionView(row: SqlRow): SuggestionVersionView {
    return {
      markId: nullableText(row.mark_id),
      kind: nullableText(row.mark_kind) as EditorialMarkKind | null,
      markStatus: nullableText(row.mark_status) as ReviewMarkStatus | null,
      anchor: nullableText(row.mark_anchor),
      from: row.mark_from === null || row.mark_from === undefined ? null : integer(row.mark_from),
      to: row.mark_to === null || row.mark_to === undefined ? null : integer(row.mark_to),
      decision: nullableText(row.decision),
      convertedTo: nullableText(row.converted_to) as EditorialMarkKind | null,
    };
  }

  /** The 修改建议 saved from a mark as its next version, with what the finding reads of it, or `null`. */
  #nextVersion(markId: string): SuggestionVersionView | null {
    const row = this.#db.prepare(
      `SELECT c.mark_id, c.kind mark_kind, c.status mark_status, c.anchor_state mark_anchor, c.from_grapheme mark_from, c.to_grapheme mark_to,
              (SELECT d.disposition FROM proposal_change_items i JOIN proposal_item_decisions d ON d.item_id = i.item_id
                WHERE i.mark_id = c.mark_id ORDER BY d.ordinal DESC LIMIT 1) decision,
              (SELECT x.kind FROM editorial_marks x WHERE x.converted_from_mark_id = c.mark_id ORDER BY x.created_at LIMIT 1) converted_to
       FROM editorial_marks c WHERE c.converted_from_mark_id = ? AND c.kind = 'change-suggestion'
       ORDER BY c.created_at LIMIT 1`,
    ).get(markId) as SqlRow | undefined;
    return row === undefined ? null : this.#versionView(row);
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
      stateLabel: runViewStateLabel(view),
      findingCounts: reviewFindingCounts(view.findings),
      reportVersion: reports.latest === null ? null : integer(reports.latest),
      historicalMarker: [...view.historicallyAffected.values()][0] ?? null,
    };
  }

  /**
   * The opened Run without its page of findings, and the findings that pass the page's filters from its
   * cursor on: the caller takes the page once it knows what the rest of the answer weighs.
   */
  #runProjection(
    view: RunView,
    readings: ReadonlyArray<CategoryReading>,
    chapters: ChapterOptions,
    page: ReviewFindingPageRequest,
  ): { projection: ReviewRunProjection; candidates: ReviewFindingProjection[] } {
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
      const excluded = (categoryView.materialized ?? categoryView.retained)?.record.excludedCount;
      return {
        categoryId: category.categoryId,
        label: category.entry.label,
        position: category.position,
        output: category.entry.output,
        riskPointsOnly: category.entry.riskPointsOnly,
        batchApply: category.entry.batchApply,
        basisStatement: category.basisStatement,
        state: categoryView.state,
        stateLabel: categoryView.stateLabel,
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
      const deliverable = entry === undefined ? null : this.#deliverableReference(entry, clauseId);
      if (deliverable !== null) return [deliverable];
      for (const document of entry?.guidelineDocuments ?? []) {
        const clause = document.clauses.find((candidate) => candidate.clauseId === clauseId);
        if (clause !== undefined) return [{ documentTitle: document.title, clauseId: clause.clauseId, text: clause.text }];
      }
      return [];
    };
    const findings = view.findings.map((finding): ReviewFindingProjection => {
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
        referencedRuleVersions: finding.referencedRuleVersions,
        learningDecisionId: finding.learningDecisionId,
        stateLine: finding.stateLine,
        markId: finding.markId,
        markStatus: finding.markStatus,
        anchorState: finding.anchorState,
        ignoreReason: finding.ignoreReason,
        historicalMarker: view.historicallyAffected.get(finding.categoryId) ?? null,
      };
    });
    // The four filters are a view (FIND-003): they choose which findings this answer carries and change
    // nothing; the counts below keep covering every finding of the Run.
    const matching = findings.filter((finding) =>
      (page.categoryId === null || finding.categoryId === page.categoryId) &&
      (page.severity === null || finding.severity === page.severity) &&
      (page.status === null || finding.status === page.status) &&
      (page.chapterBlockId === null || finding.chapterBlockId === page.chapterBlockId));
    const excludedRows = this.#db.prepare('SELECT canonical_json, sha256 FROM review_excluded_findings WHERE review_run_id = ? ORDER BY category_id, ordinal').all(snapshot.reviewRunId) as SqlRow[];
    const excludedParts = excludedRows.flatMap((row): ReviewExcludedFindingProjection[] => {
      const json = text(row.canonical_json);
      requireReview(sha256Hex(json) === row.sha256, 'REVIEW_RECORD_INVALID', '未列为发现的记录与摘要不一致。');
      const entry = JSON.parse(json) as ReviewExcludedFindingProjection;
      // Even a malformed finding may contain a long string. Persist it whole and page its text without loss.
      const characters = Array.from(entry.text);
      const total = Math.max(1, Math.ceil(characters.length / 8192));
      if (total === 1) return [entry];
      return Array.from({ length: total }, (_part, index) => ({ ...entry,
        text: characters.slice(index * 8192, (index + 1) * 8192).join(''), textPart: { index: index + 1, total } }));
    });
    const excluded: ReviewExcludedFindingProjection[] = [];
    let excludedBytes = 0;
    const excludedAfter = page.excludedAfterOrdinal ?? 0;
    // As with findings, at least one entry while any remain, so paging always reaches the end.
    for (const entry of excludedParts.slice(excludedAfter)) {
      const weight = wireBytes(entry);
      if (excluded.length >= MAX_REVIEW_FINDINGS_PER_PAGE || (excluded.length > 0 && excludedBytes + weight > MAX_FRAME_BYTES / 8)) break;
      excludedBytes += weight;
      excluded.push(entry);
    }
    const after = page.findingsAfterOrdinal;
    return {
      projection: {
        ...(snapshot.localPlan === undefined ? {} : { localCheck: (() => {
          const last = readLocalStageArtifacts(this.#db, snapshot.reviewRunId).at(-1)?.record;
          const result = last?.result;
          const valid = result === undefined || result === null ? new Set<string>() : exactLocalCandidateIds(snapshot.localPlan!, result.candidates);
          return { planDigest: snapshot.localPlan!.digest, options: snapshot.localPlan!.options, state: last?.state ?? 'prepared', paragraphs: snapshot.localPlan!.blocks.length,
            counts: result?.counts ?? null, excluded: [...(result?.excluded ?? []), ...(result?.candidates.filter((candidate) => !valid.has(candidate.id)).slice(0, 256).map((candidate) => ({ candidateId: candidate.id, reason: 'exact-grapheme-anchor-invalid' })) ?? [])] };
        })() }),
        reviewRunId: snapshot.reviewRunId,
        ordinal: snapshot.ordinal,
        label: `第 ${snapshot.ordinal} 次`,
        createdAt: snapshot.createdAt,
        state: view.state,
        stateLabel: runViewStateLabel(view),
        canContinue: view.canContinue,
        scope: {
          kind: snapshot.scope.kind,
          label: snapshot.scope.label,
          selectedRange: snapshot.scope.selectedRange,
          selection: snapshot.scope.blockIds === undefined || snapshot.scope.blockIds.length === 0
            ? null
            : { fromBlockId: snapshot.scope.blockIds[0]!, toBlockId: snapshot.scope.blockIds.at(-1)! },
        },
        manuscript: snapshot.manuscript,
        configurationDigest: snapshot.configuration.digest,
        authorization: view.authorization === null ? null : { authorizedAt: view.authorization.authorizedAt },
        categories,
        excluded,
        excludedTotal: excludedRows.length,
        excludedTruncated: excludedAfter + excluded.length < excludedParts.length,
        excludedNextOrdinal: excludedAfter + excluded.length < excludedParts.length ? excludedAfter + excluded.length : null,
        findings: [],
        findingsTotal: matching.length,
        findingsTruncated: false,
        findingCounts: reviewFindingCounts(view.findings),
        report: reports.at(-1) ?? null,
        reportVersions: reports.map((report) => ({ reportId: report.reportId, version: report.version, generatedAt: report.generatedAt, digest: report.digest })),
        historicalMarker: view.historicallyAffected.size === 0 ? null : (() => {
          // A Series marker must not hide a later learning remediation on the same result.
          const remediation = this.#influenceRemediation(snapshot, view.historicallyAffected);
          const learning = [...view.historicallyAffected.values()].every((label) => label === LEARNING_INFLUENCE_RESULT_MARKER);
          if (learning) {
            const named = snapshot.categories.filter((category) => view.historicallyAffected.has(category.categoryId)).map((category) => `「${category.entry.label}」`).join('、');
            return { label: LEARNING_INFLUENCE_RESULT_MARKER,
              detail: `${named}参考的本社审阅偏好版本中，有学习材料在这次审阅之后停止今后使用。这次审阅的结果、发现和报告都保持原样；这个标记不表示结果有错。`,
              ...(remediation === null ? {} : { remediation }) };
          }
          const series = new Map([...view.historicallyAffected].filter(([, label]) => label !== LEARNING_INFLUENCE_RESULT_MARKER));
          const named = snapshot.categories.filter((category) => series.has(category.categoryId)).map((category) => `「${category.entry.label}」`).join('、');
          const unverifiable = [...series.values()].every((label) => label === HISTORICAL_MARKER_UNVERIFIABLE);
          const marker = unverifiable
            ? { label: HISTORICAL_MARKER_UNVERIFIABLE, detail: `${named}所依据的书系材料有没有在这次审阅之后被排除，书系检索排除记录无法读取，无法核对。这次审阅的结果、发现和报告都保持原样。` }
            : { label: HISTORICALLY_AFFECTED_RESULT_MARKER, detail: `${named}所依据的书系材料在这次审阅之后被排除在书系检索之外。这次审阅的结果、发现和报告都保持原样；这个标记不表示结果有错。` };
          return remediation === null ? marker : { ...marker, detail: `${marker.detail}这次审阅参考的学习材料后来也停止今后使用。`, remediation };
        })(),
        influence: this.#influenceProjection(snapshot),
        scopeStop: view.scopeStop,
        procedure: readReviewRunProcedurePin(this.#db, snapshot.reviewRunId),
        preinstalledProcedures: snapshot.preinstalledProcedures ?? [],
        capture: (() => {
          const reason = this.#captureOf(view).unavailableReason;
          return { available: reason === null, unavailableReason: reason };
        })(),
      },
      candidates: after === null ? matching : matching.filter((finding) => finding.ordinal > after),
    };
  }
}

/** Why one approval is refused for a category whose pinned 本社审阅偏好 version reads a withdrawn material (Issue #912). */
function influenceWithdrawnReason(label: string, withdrawn: { readonly ordinal: number; readonly withdrawn: number }): string {
  return withdrawn.ordinal === 0
    ? `「${label}」参考的本社审阅偏好记录无法读取，无法核对它的学习材料是否已停止今后使用；请重新准备这次审阅。`
    : `「${label}」参考的本社审阅偏好 v${withdrawn.ordinal} 中有 ${withdrawn.withdrawn} 条学习材料已停止今后使用；请重新准备这次审阅，新的计划不含该影响。`;
}

/** The stop a category that had not begun records for a withdrawn material (Issue #912; LAUD-008). */
function influenceStopDetail(label: string, withdrawn: { readonly ordinal: number; readonly withdrawn: number }): string {
  return `${LEARNING_INFLUENCE_WITHDRAWN_LABEL}：${influenceWithdrawnReason(label, withdrawn)}这一类没有开始，什么都没有发送。`;
}

/** A material's kind, from its key. */
function materialKindOf(materialKey: string | null): LearningLedgerMaterialKind | null {
  const kind = materialKey?.slice(0, materialKey.indexOf(':'));
  return LEARNING_MATERIAL_KINDS.find((entry) => entry === kind) ?? (kind === 'readers-report-exemplar' ? kind : null);
}
