import { allowedProductionBindingOf } from '../launch-policy.js';
import { editorialMemoryDefinition, withEditorialMemoryDefinition, type EditorialMemorySnapshot } from '../learning/editorial-memory.js';
import { analysisRunSummary, completedWithGapsLabel } from '../../shared/analysis-run-summary.js';
import { effectiveModelReasoningEffort, modelProfileFor } from '../provider/model-profile.js';
import * as requestAdmissionOperations from './request-admission-operations.js';
import * as clarificationOperations from './clarification-operations.js';
import * as runCheckpointOperations from './run-checkpoint-operations.js';
import * as curationRuns from './curation-runs.js';
import {
  currentPreinstalledVersion,
  selectedProcedureForBook,
  resolveProcedureForKind,
  readProcedurePlanView,
  procedureStopped,
  validateProcedureEdit,
} from '../procedures/editable.js';
import { withProcedureDefinition, procedureInstruction } from '../procedures/execution.js';
import { procedureIdForKind, FACTUAL_CLAIM_PROCEDURE_ID } from '../procedures/preinstalled.js';
import {
  recordProcedurePlanPin,
  readProcedurePlanPin,
  resolveProcedureDefinition,
} from '../procedures/definition-store.js';
import {
  withReviewLocalTools,
  pinnedReviewDefinition,
  reviewCategoryKindDefinition,
} from '../review/review-category-kind.js';
import {
  BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  reviewCategoryEntry,
  reviewCategoryContractInput,
} from '../review/category-configuration.js';
import {
  type CompositionOptions,
  describeComposition,
  STOCK_TYPOS_FANOUT,
  STOCK_TYPOS_LEAF,
} from '../harness/primary-agent-harness.js';
import type { PinnedLocalToolSources } from '../retrieval/index.js';
import { kindResearchDeclaration, liveKindAdmission, liveKindRule, kindLocalTools } from './live-kind-admission.js';
import {
  factualReviewDefinitionsByDigest,
  factualReviewKindDefinition,
  factualReviewLevelDefinition,
  withFactualResearch,
  type AnalysisKindDefinition,
  baselineAnalysisKindDefinition,
} from './kind-definition.js';
import { factualClaimKindDefinition, FACTUAL_CLAIM_UPDATE_MODES } from './factual-claim-contract.js';
import {
  FACTUAL_REVIEW_KIND,
  MODEL_SERVICE_CONNECTION_IDS,
  modelServiceChannelOf,
  MODEL_SERVICE_ROUTE_BINDINGS,
  type EvidenceAssuranceLevel,
  type ProcedureDefinitionPin,
  type FrozenWebToolsBackend,
  type FrozenWebToolsFallback,
  isResultSetPolicyPin,
  selectedPolicyIdentityOf,
  BASELINE_ANALYSIS_KIND,
  WRITING_KIND,
  type AnalysisKindId,
  type AnalysisProjection,
  type AnalysisTaskMode,
  type BaselineAnalysisTaskMode,
  type AnalysisFreshnessAxis,
  type AnalysisReusePlanCounts,
  type AnalysisUnitLineage,
  type BaselineAnalysisExecutionBindingProjection,
  type BaselineAnalysisHistoryEntryProjection,
  type BaselineAnalysisHistoryProjection,
  type BaselineAnalysisPlanAdaptationProjection,
  type BaselineAnalysisPlanRevisionProjection,
  type BaselineAnalysisPlanVersionProjection,
  type BaselineAnalysisProjection,
  type BaselineAnalysisRangeOptionProjection,
  type BaselineAnalysisResultSetRevisionProjection,
  type BaselineAnalysisRevisionUpdateProjection,
  type BaselineAnalysisRunState,
  type ResumableStopReason,
  type BaselineAnalysisSelectedRange,
  type BaselineAnalysisUnitProjection,
  type BaselineAnalysisUpdateControlsProjection,
  type BaselineAnalysisUpdateMode,
  type BaselineAnalysisUpdateProjection,
  type BaselineAnalysisUpdateRequest,
  type CoverageManifestProjection,
  type LaunchPolicyProjection,
  type MaterialPlanInputsProjection,
  type ModelCredentialOperationState,
  type PlanBoundarySplitProjection,
  type PlanRevisionDiffEntryProjection,
  type PlanRevisionState,
  type CredentialSlotId,
  type ExecutionRouteId,
  type ReviewCategoryUpdateControlsProjection,
  type ReviewCategoryUpdateProjection,
  type ReviewScopePlanCounts,
  type RunBudgetCeilingState,
  type SafeRetryRepetition,
  MODEL_SERVICE_SETUP_REQUIRED_REASON,
} from '../../shared/protocol.js';

function resumableStopReasonOf(value: unknown): ResumableStopReason | undefined {
  if (!isRecord(value)) return undefined;
  return value.stopReason === 'proxy-unreachable' || value.stopReason === 'model-service-unreachable' || value.stopReason === 'outcome-unknown' || value.stopReason === 'shutdown'
    ? value.stopReason : undefined;
}
import { factualReviewUnitResultOfRecordV2 } from './factual-review-contract-v2.js';
import { platformToolsFromProjection } from '../provider/search-service.js';
import { searchBackend, searchBackendConfigurationDigest } from '../provider/search-backends/index.js';
import { SEARCH_BACKENDS } from '../provider/search-backends.js';
import { CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../shared/provider-configuration.generated.js';
import { freezeSearchFallback, readSearchOverride } from '../provider/search-backend-settings.js';
import {
  STOCK_TYPOS_LEAF_FIXTURE,
  STOCK_TYPOS_LEAF_LOCAL_TOOLS,
  localFixtureRegisteredProfile,
} from '../provider/model-fixture.js';
import {
  providerPlanPolicyMetadata,
  PLAN_REVISION_REQUIRED_REASON,
  buildPlanAdaptationRecord,
  diffMaterialPlanInputs,
  materialPlanInputsOfComponents,
  planAdaptationLabel,
  planBoundarySplit,
  planRevisionLabel,
  reusePlanCountsDiffEntry,
  sameMaterialPlanInputs,
  type PlanAdaptationRecord,
} from './plan-boundary.js';
import { randomUUID } from 'node:crypto';
import { withModelClarification } from '../provider/clarification-contract.js';
import type { DatabaseSync } from 'node:sqlite';
import {
  NO_PLAN_EDITS,
  PLAN_CEILING_LAUNCH_REASON,
  canonicalPlanEdits,
  planEditCeiling,
  planEditAssuranceLevel,
  planEditDiff,
  planEditsAreEmpty,
  planEditsOf,
  withoutCeiling,
  type PlanEdits,
} from './plan-edits.js';
import type { ModelClarificationQuestion, ClarificationFacts } from './clarifications.js';
import {
  AnalysisError,
  DIGEST_PATTERN,
  UUID_PATTERN,
  canonicalJson,
  canonicalRecord,
  isRecord,
  parseCanonicalJson,
  requireAnalysis,
  sha256Hex,
} from './canonical.js';
import { unitRequestDigest } from './contract.js';
import { saysCarried, saysOutcomeUnknown } from './outcome-unknown.js';
import {
  deriveCoverageManifest,
  manifestCoversEveryBlock,
  manifestDigestIsExact,
  unitContentKeys,
  type ManifestBlockInput,
} from './coverage-manifest.js';
import {
  manifestWeight,
  UnreadWalkCache,
  unreadWalkWeight,
  walkUnreadChanges,
  type UnreadWalk,
  type UnreadWalkCut,
} from './unread-changes.js';
import { TASK_INPUT_CHECKPOINT_PURPOSE } from './identity.js';
import {
  ACTIVE_SET_VERSION,
  DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION,
  ORDINARY_PRODUCTION_ALLOWED_BINDINGS,
  ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION,
  searchFallbackTermsOf,
} from '../launch-policy.js';
import { DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../shared/protected-secret-identity.js';
import {
  deriveReusePlan,
  deriveScopePlan,
  requireSelectedRange,
  reusePlanRecord,
  type ReusePlanPredecessor,
  type ScopePlanPredecessor,
} from './reuse-plan.js';
import {
  NO_TASK_OUTCOME_REASON,
  PRE_RUN_REPORT_REASON,
  runReportDigest,
  runReportProjection,
  type RunReportRecord,
} from './run-report.js';
import { ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST } from './assurance-sampling-contract.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../provider/egress-gate.js';
import type { AnalysisOutcomeAttentionReading, AnalysisTaskAttentionReading } from '../global-attention.js';
import { PLAN_MOVED_LABEL, type WaitingRunBlockCause } from '../reconnect-preflight.js';
import { isPublicSampleBookSourceDigest } from '../../shared/public-samplebooks.js';
import { ANALYSIS_LINEAGE_UNAVAILABLE_REASON } from '../../shared/public-samplebook-labels.js';
import type {
  AnalysisAuthorizationOrigin,
  AnalysisModeRequest,
  AnalysisPlanRecord,
  AnalysisProjectionShape,
  AnalysisRequestIdentity,
  BackgroundRunBudgetCeiling,
  BaselineAnalysisPreparationResult,
  BaselineAnalysisPrepareInput,
  BaselineAnalysisRouteFacts,
  CarriedStages,
  ChainRevisionRead,
  CheckpointOwner,
  CheckpointPurpose,
  ExecutionBindingRecord,
  ExecutionPlanFacts,
  ExecutionUpdateFacts,
  IntentFacts,
  LaunchBinding,
  LiveReading,
  ManuscriptCheckpointBinding,
  PendingIntent,
  PlanAdaptationInput,
  PlanVersionFacts,
  PredecessorUnitResult,
  PreparationWork,
  ProductionPlanBinding,
  ProgressReader,
  RequestAdmissionEvent,
  RequestAdmissionPins,
  RequestAdmissionReading,
  ResendPlan,
  RevisionPersistInput,
  RunProgressStage,
  RunStop,
  SqlRow,
  StageContinuation,
  UnconfirmedOutcomeRecord,
  UnconfirmedStage,
  UnconfirmedUnitRecord,
  UnitCheckpoint,
  UnitResultRecord,
} from './baseline-analysis-types.js';
import {
  ACCOUNT_LIMIT_RUN_LABEL,
  BACKGROUND_AUTHORIZED_DETAIL,
  BUDGET_REACHED_OUTCOME_LABEL,
  BUDGET_REACHED_RUN_LABEL,
  CHAIN_REVISION_CACHE_ENTRIES,
  CHAIN_REVISION_CACHE_WEIGHT,
  CONNECTIVITY_WAIT_DETAIL,
  DEVELOPMENT_CI_LAUNCH,
  FACTUAL_POLICY_MINIMUM_REASON,
  FACTUAL_VERIFIED_FIXTURE_IDENTITY,
  MODEL_SERVICE_SETUP_REQUIRED,
  NATIVE_CARRIER_DIGEST,
  OUTCOME_LABELS,
  OUTCOME_UNKNOWN_NO_RESUME,
  OUTCOME_UNKNOWN_RUN_LABEL,
  RECONCILED_PAUSED_DETAIL,
  RECONCILED_QUEUED_DETAIL,
  RECONCILED_RESUMABLE_DETAIL,
  RECONCILED_YIELDED_DETAIL,
  REUSE_PLAN_DRIFT_AUTHORIZE_REASON,
  REUSE_PLAN_DRIFT_REASON,
  RUN_CANCELLED_AFTER_START_LABEL,
  RUN_CANCELLING_DETAIL,
  RUN_IDLE_YIELD_LABEL,
  RUN_PAUSING_DETAIL,
  RUN_QUEUED_LABEL,
  RUN_STATE_LABELS,
  RUN_WAITING_IDLE_LABEL,
  SELECTED_BLOCKS_GONE,
  SELECTED_RANGE_MOVED,
  SIDECAR_DIGEST,
  STANDARD_DIRECT,
  SUCCESSOR_BEHAVIOR,
  UNREAD_WALK_CACHE_ENTRIES,
  UNREAD_WALK_CACHE_WEIGHT,
  activeRunReason,
  asNumber,
  asString,
  assuranceContractMoved,
  authorizationOrigin,
  blockedReasons,
  changedModeUnavailableReason,
  firstBaselineCounts,
  frozenAssurancePromptContractDigest,
  isBackgroundRunBudgetCeiling,
  isDraftGoal,
  launchSetsCeilingOf,
  levelBelowPolicyMinimum,
  namedNonEffects,
  providerConsequence,
  resolveDeveloperLiveCeiling,
  runBegan,
  runBudgetCeilingStateOf,
  runIsActive,
  runStopOf,
  sameRange,
  transact,
  unconfirmedOutcomeKey,
} from './run-state.js';

export { AnalysisError, isRecord };

export { type UnitCheckpoint, type UnconfirmedUnitRecord, type UnconfirmedStage, type UnconfirmedOutcomeRecord, type ResendPlan, type RunStop, type BaselineAnalysisRouteFacts, type BackgroundRunBudgetCeiling, type AnalysisPlanRecord, type AnalysisModeRequest, type AnalysisPreparationResult, type BaselineAnalysisPreparationResult, type BaselineAnalysisPrepareInput, type RunProgress, type RunProgressStage, type ProgressReader, type ExecutionUpdateFacts, type PlanAdaptationInput, type ExecutionPlanFacts, type ProductionPlanBinding, type ExecutionBindingRecord, type UnitResultRecord, type PredecessorUnitResult, type RevisionPersistInput, type AnalysisAuthorizationOrigin, type LaunchBinding, type DeveloperLiveLaunchBinding, type OrdinaryProductionLaunchBinding, type CarriedStages, type StageContinuation, type AnalysisRequestIdentity, type RequestAdmissionReading } from './baseline-analysis-types.js';
export { SAMPLE1_SOURCE_DIGEST, RUN_QUEUED_LABEL, RUN_WAITING_IDLE_LABEL, RUN_IDLE_YIELD_LABEL, REUSE_PLAN_DRIFT_REASON, REUSE_PLAN_DRIFT_AUTHORIZE_REASON, UNREAD_WALK_CACHE_ENTRIES, CHAIN_REVISION_CACHE_ENTRIES, UNREAD_WALK_CACHE_WEIGHT, CHAIN_REVISION_CACHE_WEIGHT, RUN_CANCELLED_AFTER_START_LABEL, RUN_CANCELLING_DETAIL, RUN_PAUSING_DETAIL, RECONCILED_RESUMABLE_DETAIL, RECONCILED_PAUSED_DETAIL, RECONCILED_YIELDED_DETAIL, RECONCILED_INTERRUPTED_DETAIL, RECONCILED_QUEUED_DETAIL, BUDGET_REACHED_RUN_LABEL, ACCOUNT_LIMIT_RUN_LABEL, OUTCOME_UNKNOWN_RUN_LABEL, OUTCOME_UNKNOWN_NO_RESUME, unconfirmedOutcomeKey, frozenAssurancePromptContractDigest, assuranceContractMoved, BACKGROUND_AUTHORIZED_DETAIL, runIsActive, activeRunReason, MODEL_SERVICE_SETUP_REQUIRED, resolveDeveloperLiveCeiling, namedNonEffects, blockedReasons, providerConsequence, CARRIED_STAGES, FACTUAL_VERIFIED_FIXTURE_IDENTITY, FACTUAL_POLICY_MINIMUM_REASON, levelBelowPolicyMinimum } from './run-state.js';
export { validateRequestAdmissionRecords } from './request-admissions.js';

export class BaselineAnalysisStore {
  readonly #requestAdmissionOperationsHost: requestAdmissionOperations.RequestAdmissionOperationsHost = this.#requestAdmissionOperationsHostOf();

  #requestAdmissionOperationsHostOf(): requestAdmissionOperations.RequestAdmissionOperationsHost {
    const store = this;
    return {
      get db() { return store.#db; },
      planRecords: this.#planRecords.bind(this),
      get carriedUsageOf() { return store.carriedUsageOf.bind(store); },
      get checkpointClarificationRequests() { return store.checkpointClarificationRequests.bind(store); },
      get checkpointModelRequests() { return store.checkpointModelRequests.bind(store); },
      get checkpointReflectionRequests() { return store.checkpointReflectionRequests.bind(store); },
      get checkpointStageRequests() { return store.checkpointStageRequests.bind(store); },
      get clarificationsOf() { return store.clarificationsOf.bind(store); },
      get definitionForRun() { return store.definitionForRun.bind(store); },
      get executionBindingOf() { return store.executionBindingOf.bind(store); },
      get hasCommittedOutcome() { return store.hasCommittedOutcome.bind(store); },
      get modelClarificationAnswerClaimed() { return store.modelClarificationAnswerClaimed.bind(store); },
      get readRevisionBlocks() { return store.readRevisionBlocks.bind(store); },
      get recordRunState() { return store.recordRunState.bind(store); },
      get recordUnitCheckpoint() { return store.recordUnitCheckpoint.bind(store); },
      get requestAdmissionOf() { return store.requestAdmissionOf.bind(store); },
      get stageContinuationOf() { return store.stageContinuationOf.bind(store); },
      get unitCheckpoints() { return store.unitCheckpoints.bind(store); },
    };
  }

  readonly #clarificationOperationsHost: clarificationOperations.ClarificationOperationsHost = this.#clarificationOperationsHostOf();

  #clarificationOperationsHostOf(): clarificationOperations.ClarificationOperationsHost {
    const store = this;
    return {
      appendExecutionEvidence: this.#appendExecutionEvidence.bind(this),
      get db() { return store.#db; },
      get checkpointClarificationRequests() { return store.checkpointClarificationRequests.bind(store); },
      get clarificationsOf() { return store.clarificationsOf.bind(store); },
      get inspect() { return store.inspect.bind(store); },
      get modelClarificationAnswerClaimed() { return store.modelClarificationAnswerClaimed.bind(store); },
      get recordRunState() { return store.recordRunState.bind(store); },
      get requestAdmissionOf() { return store.requestAdmissionOf.bind(store); },
    };
  }

  readonly #runCheckpointOperationsHost: runCheckpointOperations.RunCheckpointOperationsHost = this.#runCheckpointOperationsHostOf();

  #runCheckpointOperationsHostOf(): runCheckpointOperations.RunCheckpointOperationsHost {
    const store = this;
    return {
      get db() { return store.#db; },
      unitResultOfRecord: this.#unitResultOfRecord.bind(this),
      get requestAdmissionOf() { return store.requestAdmissionOf.bind(store); },
    };
  }

  readonly #curationRunsHost: curationRuns.CurationRunsHost = this.#curationRunsHostOf();

  #curationRunsHostOf(): curationRuns.CurationRunsHost {
    const store = this;
    return {
      get db() { return store.#db; },
      insertRunState: this.#insertRunState.bind(this),
      get recordRunState() { return store.recordRunState.bind(store); },
      get settleCuration() { return store.settleCuration.bind(store); },
    };
  }

  #factualVerification: import('../factual-verification.js').FactualVerificationLedger | null = null;

  bindFactualVerification(owner: import('../factual-verification.js').FactualVerificationLedger): void {
    requireAnalysis(this.kind === FACTUAL_REVIEW_KIND, 'FACTUAL_CLAIM_KIND_INVALID', '只有事实核查任务可以绑定断言账本。');
    this.#factualVerification = owner;
  }

  get factualVerification(): import('../factual-verification.js').FactualVerificationLedger {
    requireAnalysis(this.#factualVerification !== null, 'FACTUAL_CLAIM_OWNER_MISSING', '事实核查账本未绑定。');
    return this.#factualVerification;
  }
  readonly #db: DatabaseSync;
  readonly #checkpointOwner: CheckpointOwner;
  readonly #route: BaselineAnalysisRouteFacts | null;
  readonly #originalDefinition: AnalysisKindDefinition;
  #definition: AnalysisKindDefinition;
  readonly #work = new Map<string, PreparationWork>();
  /**
   * The unread-changes walk of each latest revision, and each revision as the walk reads it (Issue #709; #711 review P2-2).
   * Revisions are immutable once written, so both are kept by revision id: a read — the 审阅 screen's poll among them —
   * walks the chain once per latest revision, and the plan, the gate and the coverage matrix share that one answer.
   */
  readonly #unreadWalks = new UnreadWalkCache<UnreadWalk>(UNREAD_WALK_CACHE_ENTRIES, UNREAD_WALK_CACHE_WEIGHT, unreadWalkWeight);
  readonly #chainRevisions = new UnreadWalkCache<ChainRevisionRead>(CHAIN_REVISION_CACHE_ENTRIES, CHAIN_REVISION_CACHE_WEIGHT,
    (read) => read === 'unreadable' ? 1 : manifestWeight(read.revision.manifest) + read.revision.units.size);
  #unreadWalksComputed = 0;
  #chainRevisionsRead = 0;
  #launch: LaunchBinding = DEVELOPMENT_CI_LAUNCH;

  constructor(
    db: DatabaseSync,
    checkpointOwner: CheckpointOwner,
    route: BaselineAnalysisRouteFacts | null,
    definition: AnalysisKindDefinition = baselineAnalysisKindDefinition(),
  ) {
    this.#db = db;
    this.#checkpointOwner = checkpointOwner;
    this.#route = route;
    this.#originalDefinition = definition;
    this.#definition = route?.fixtureIdentity.startsWith('sample1-model-clarification') === true ? withModelClarification(definition) : definition;
  }

  get route(): BaselineAnalysisRouteFacts | null {
    return this.#route;
  }

  /** Reservations belong to actual Runs, including a send whose result is unknown after restart. */
  curationBudgetUse(controlEntryId: string): { passesUsed: number; reservedTokens: number } {
    return curationRuns.curationBudgetUse(this.#curationRunsHost, controlEntryId);
  }

  curationRuns(): Array<{ runRecordId: string; state: string; summary: string }> {
    return curationRuns.curationRuns(this.#curationRunsHost);
  }

  /** Called by the existing startup reconciliation; possible sends never become retries or fresh budget. */
  reconcileCuration(): void {
    return curationRuns.reconcileCuration(this.#curationRunsHost);
  }

  startCuration(bundle: import('../../shared/protocol/learning.js').LearningCurationBundle,
    control: { entryId: string; envelope: import('../../shared/protocol/learning.js').EnabledLearningEnvelope }): import('../learning/curation.js').CurationRun {
    return curationRuns.startCuration(this.#curationRunsHost, bundle, control);
  }

  bindCuration(run: import('../learning/curation.js').CurationRun, sessionId: string): { attemptId: string; bindingDigest: string } {
    return curationRuns.bindCuration(this.#curationRunsHost, run, sessionId);
  }

  settleCuration(run: import('../learning/curation.js').CurationRun, state: 'completed' | 'failed' | 'interrupted',
    evidence: { usage: import('../provider/classification.js').UsageFacts | null; proposals: number; transmitted: boolean; reason: string }): void {
    return curationRuns.settleCuration(this.#curationRunsHost, run, state, evidence);
  }

  /** The analysis kind this ledger serves; the execution owner reads its contract through this. */
  factualRecheckUsed(onceKey: string): boolean {
    return this.#db.prepare("SELECT 1 FROM analysis_run_authorizations WHERE origin = 'background-analysis-enrollment' AND json_extract(canonical_json, '$.factualRecheckOnceKey') = ? LIMIT 1").get(onceKey) !== undefined;
  }

  startFactualRecheck(candidate: import('./factual-recheck.js').FactualRecheckCandidate): import('./factual-recheck.js').FactualRecheckRun {
    requireAnalysis(this.#db.isTransaction && !this.factualRecheckUsed(candidate.onceKey), 'FACTUAL_RECHECK_ALREADY_SUBMITTED', '这条断言已按这个登记和决定提交过，不会自动重发。');
    const taskIntentId = randomUUID(), runRecordId = randomUUID(), authorizationId = randomUUID(), planVersionId = randomUUID();
    const instant = new Date().toISOString();
    const { ledger, limits, ...frozen } = candidate;
    const session = { sessionId: randomUUID(), runRecordId, stage: 'web-verification' as const, scopeId: candidate.selection.claimId,
      ledgerDigest: ledger.digest, sourceMessageDigest: sha256Hex(candidate.message), promptContractDigest: candidate.promptDigest, limits };
    const compositionDigest = describeComposition(candidate.binding.route, candidate.binding.model, candidate.promptDigest, {
      version: 2, procedure: candidate.procedure, platformTools: true, localTools: false,
      researchDeclaration: { webSearch: true, searchEngine: 'user-selected-backend' } }).digest;
    const intent = canonicalRecord({ taskIntentId, bookId: candidate.selection.bookId, kind: 'factual-recheck',
      contractVersion: 'ai7.factual-claim-verification/1', mode: 'factual-recheck', goal: '核查编辑要求补充证据的一条冻结断言',
      factualDecision: candidate.selection, expectedOutcome: 'versioned-factual-verification', createdAt: instant });
    this.#db.prepare(`INSERT INTO analysis_task_intents(task_intent_id,book_id,kind,contract_version,goal,created_at,canonical_json,sha256,mode)
      VALUES (?,?,'factual-recheck','ai7.factual-claim-verification/1',?,?,?,?, 'factual-recheck')`)
      .run(taskIntentId, candidate.selection.bookId, '核查编辑要求补充证据的一条冻结断言', instant, intent.json, intent.digest);
    const plan = canonicalRecord({ schema: 'ai7.factual-recheck-plan/1', ...frozen, taskIntentId, runRecordId, authorizationId,
      session, compositionDigest, policyVersion: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, stages: ['web-verification'], startWhen: 'idle', recordedAt: instant });
    for (const [component, value] of [['run-source-scope', { selection: candidate.selection, messageDigest: session.sourceMessageDigest,
      messageByteCount: Buffer.byteLength(candidate.message, 'utf8') }], ['provider-resolution-plan', { binding: candidate.binding, search: candidate.search }], ['plan-envelope', JSON.parse(plan.json)]] as const) {
      const record = canonicalRecord(value);
      this.#db.prepare('INSERT INTO analysis_plan_records VALUES (?,1,?,?,?,?)').run(taskIntentId, component, record.json, record.digest, instant);
    }
    const version = canonicalRecord({ planVersionId, taskIntentId, ordinal: 1, planEnvelopeDigest: plan.digest, createdAt: instant });
    this.#db.prepare('INSERT INTO analysis_plan_versions VALUES (?,?,1,NULL,?,?,?,?)').run(planVersionId, taskIntentId, plan.digest, instant, version.json, version.digest);
    const authorization = canonicalRecord({ authorizationId, taskIntentId, origin: 'background-analysis-enrollment', authority: 'standard-direct-dispatch',
      startWhen: 'idle',
      enrollmentId: candidate.enrollmentId, enrollmentVersionId: candidate.enrollmentVersionId, factualRecheckOnceKey: candidate.onceKey,
      planEnvelopeDigest: plan.digest, runBudgetCeiling: { kind: 'tokens', maxTotalTokens: candidate.maximumTokens }, authorizedAt: instant });
    this.#db.prepare(`INSERT INTO analysis_run_authorizations VALUES (?,?,?,'background-analysis-enrollment','standard-direct-dispatch',?,?,?,'idle')`)
      .run(authorizationId, taskIntentId, plan.digest, instant, authorization.json, authorization.digest);
    const run = canonicalRecord({ runRecordId, taskIntentId, authorizationId, recordedAt: instant });
    this.#db.prepare('INSERT INTO analysis_run_records VALUES (?,?,?,?,?,?)').run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
    this.#insertRunState(runRecordId, 1, 'authorized', { detail: '独立事实复核登记与最新编辑决定已固定；一次性提交身份已保留。' }, instant);
    this.factualVerification.freezeClaims(runRecordId, ledger);
    this.factualVerification.admitClaimSession(session);
    return { ...frozen, taskIntentId, runRecordId, authorizationId, session, compositionDigest, planDigest: plan.digest };
  }

  bindFactualRecheck(run: import('./factual-recheck.js').FactualRecheckRun): { attemptId: string; bindingDigest: string } {
    const attemptId = randomUUID(), at = new Date().toISOString();
    const attempt = canonicalRecord({ attemptId, runRecordId: run.runRecordId, ordinal: 1, startedAt: at });
    const binding = canonicalRecord({ schema: 'ai7.factual-recheck-binding/1', attemptId, harnessSessionId: run.session.sessionId,
      planEnvelopeDigest: run.planDigest, selection: run.selection, binding: run.binding, compositionDigest: run.compositionDigest, boundAt: at });
    transact(this.#db, () => {
      this.#db.prepare('INSERT INTO analysis_execution_attempts VALUES (?,?,1,?,?,?)').run(attemptId, run.runRecordId, at, attempt.json, attempt.digest);
      this.#db.prepare('INSERT INTO analysis_execution_bindings VALUES (?,?,?,?,?)').run(attemptId, run.session.sessionId, at, binding.json, binding.digest);
      this.recordRunState(run.runRecordId, 'admitted', { detail: '单条事实复核执行绑定已固定。', attemptId, bindingDigest: binding.digest });
    });
    return { attemptId, bindingDigest: binding.digest };
  }

  settleFactualRecheck(run: import('./factual-recheck.js').FactualRecheckRun, state: 'completed' | 'failed' | 'interrupted', usage: import('../provider/classification.js').UsageFacts | null): void {
    transact(this.#db, () => {
      const reason = state === 'completed' ? '单条事实复核结果已保留。' : '单条事实复核未完成；提交额度保留，不自动重发。';
      this.recordRunState(run.runRecordId, state, { detail: reason });
      const outcomeId = randomUUID(), recordedAt = new Date().toISOString();
      const outcome = canonicalRecord({ schema: 'ai7.factual-recheck-outcome/1', outcomeId, taskIntentId: run.taskIntentId,
        runRecordId: run.runRecordId, classification: state, resultSetRevisionId: null, selection: run.selection, usage,
        summary: reason, safeNextAction: '查看核查历史；需要进一步核查时记录新的明确决定。', recordedAt });
      this.#db.prepare('INSERT INTO analysis_task_outcomes VALUES (?,?,?,?,NULL,?,?,?)').run(outcomeId, run.taskIntentId, run.runRecordId, state, recordedAt, outcome.json, outcome.digest);
    });
  }

  reconcileFactualRechecks(): void {
    for (const row of this.#db.prepare(`SELECT p.canonical_json, p.sha256 FROM analysis_plan_records p JOIN analysis_task_intents t ON t.task_intent_id = p.task_intent_id
      WHERE t.kind = 'factual-recheck' AND p.component = 'plan-envelope' AND NOT EXISTS
      (SELECT 1 FROM analysis_task_outcomes o WHERE o.task_intent_id = t.task_intent_id)`).all()) {
      const plan = JSON.parse(String(row.canonical_json)) as import('./factual-recheck.js').FactualRecheckRun;
      this.settleFactualRecheck({ ...plan, planDigest: String(row.sha256) }, 'interrupted', null);
    }
  }

  get definition(): AnalysisKindDefinition {
    this.#refreshClarificationDefinition();
    return this.#definition;
  }

  /**
   * Whether this launch runs the factual Evidence Assurance Levels (Issue #901): a live rule that hands the kind the research
   * tools, or the deterministic route over the provider-free v2 fixture. Anywhere else no Run can research, and every level
   * executes v1 exactly as before, its results 待核查.
   */
  #factualLevelsActive(rule: ReturnType<typeof liveKindRule>): boolean {
    if (this.#launch.live !== null) return platformToolsFromProjection(rule) !== null;
    const route = this.#route;
    return route !== null && (route.fixtureIdentity === FACTUAL_VERIFIED_FIXTURE_IDENTITY ||
      (route.fixtureLineage ?? []).some((link) => link.identity === FACTUAL_VERIFIED_FIXTURE_IDENTITY));
  }

  #factualUnwrapped(level: EvidenceAssuranceLevel, rule: ReturnType<typeof liveKindRule>): AnalysisKindDefinition {
    if (level === 'quick') return factualReviewLevelDefinition('quick');
    if (rule?.claimScopedFactualStages?.evidenceAssuranceLevels.includes(level)) return factualClaimKindDefinition(level);
    if (this.#factualLevelsActive(rule)) return factualReviewLevelDefinition(level);
    const v1 = factualReviewKindDefinition();
    return platformToolsFromProjection(rule) === null ? v1 : withFactualResearch(v1);
  }

  /** The factual definition of one level as this launch executes it, the clarification instruction wrapped as for the kind. */
  #factualDefinitionFor(level: EvidenceAssuranceLevel): AnalysisKindDefinition {
    const rule = liveKindRule(this.#launch.policy, FACTUAL_REVIEW_KIND);
    const unwrapped = this.#factualUnwrapped(level, rule);
    return unwrapped.factualClaims === undefined && (this.#route?.fixtureIdentity.startsWith('sample1-model-clarification') === true || rule?.clarificationQuestionAllowed === true)
      ? withModelClarification(unwrapped) : unwrapped;
  }

  /** The definition one plan version executes: its level's for the factual kind (Issue #901), the ledger's own for every other. */
  #planDefinition(edits: PlanEdits, _mode?: string): AnalysisKindDefinition {
    if (this.definition.kind !== FACTUAL_REVIEW_KIND) return this.#definition;
    // New range tasks use the same admitted claim pipeline as whole-book tasks. Frozen plans resolve by digest.
    return this.#factualDefinitionFor(planEditAssuranceLevel(edits));
  }

  /**
   * The definition a frozen plan executes under (Issue #901): for the factual kind the one — of its three levels as this launch
   * runs them, or of the two definitions that predate the levels — whose prompt-contract digest the plan froze; for every other
   * kind, and for a digest no factual definition has, the ledger's own. A plan therefore executes, and replays, under exactly
   * the contract it froze.
   */
  definitionForDigest(promptContractDigest: string): AnalysisKindDefinition {
    const row = this.#db.prepare(`SELECT p.canonical_json, p.sha256 FROM analysis_plan_records p JOIN analysis_task_intents t ON t.task_intent_id = p.task_intent_id
      WHERE p.component = 'plan-envelope' AND t.kind = ? AND json_extract(p.canonical_json, '$.promptContractDigest') = ?
      AND (json_extract(p.canonical_json, '$.basePromptContractDigest') IS NOT NULL OR json_extract(p.canonical_json, '$.editorialMemory') IS NOT NULL) LIMIT 1`).get(this.#definition.kind, promptContractDigest);
    if (row !== undefined) {
      const json = asString(row.canonical_json);
      requireAnalysis(sha256Hex(json) === row.sha256, 'ANALYSIS_RECORD_INVALID', '计划记录已损坏。');
      const plan = parseCanonicalJson(json) as { basePromptContractDigest?: string; editorialMemoryBasePromptContractDigest?: string; editorialMemory?: EditorialMemorySnapshot };
      let definition = this.#baseDefinitionForDigest(plan.basePromptContractDigest ?? plan.editorialMemoryBasePromptContractDigest!);
      if (plan.basePromptContractDigest !== undefined) {
        const member = readProcedurePlanView(this.#db, String(row.sha256), this.#definition.kind)!;
        definition = withProcedureDefinition(definition, member.document, member.pin);
      }
      definition = withEditorialMemoryDefinition(definition, plan.editorialMemory ?? null);
      requireAnalysis(definition.promptContractDigest === promptContractDigest, 'ANALYSIS_RECORD_INVALID', '计划的编辑记忆契约不一致。');
      return definition;
    }
    return this.#baseDefinitionForDigest(promptContractDigest);
  }

  #baseDefinitionForDigest(promptContractDigest: string): AnalysisKindDefinition {
    if (this.#originalDefinition.kind.startsWith('editorial-review/')) {
      const original = pinnedReviewDefinition(this.#originalDefinition, promptContractDigest);
      if (original.promptContractDigest === promptContractDigest) return original;
    }
    const current = this.definition;
    if (current.kind === BASELINE_ANALYSIS_KIND) {
      const base = current.clarificationBase ?? current;
      for (const candidate of [current, base, withModelClarification(base)]) {
        if (candidate.promptContractDigest === promptContractDigest) return candidate;
      }
    }
    if (current.kind.startsWith('editorial-review/')) return pinnedReviewDefinition(current, promptContractDigest);
    if (current.kind !== FACTUAL_REVIEW_KIND) return current;
    for (const level of ['standard', 'strict'] as const) {
      const candidate = factualClaimKindDefinition(level);
      if (candidate.promptContractDigest === promptContractDigest) return candidate;
    }
    for (const level of ['standard', 'strict', 'quick'] as const) {
      const candidate = this.#factualDefinitionFor(level);
      if (candidate.promptContractDigest === promptContractDigest) return candidate;
    }
    for (const candidate of factualReviewDefinitionsByDigest().values()) {
      if (candidate.promptContractDigest === promptContractDigest) return candidate;
      const wrapped = withModelClarification(candidate);
      if (wrapped.promptContractDigest === promptContractDigest) return wrapped;
    }
    return current;
  }

  /** The only permitted departure from a frozen factual plan is its durable offline-at-start downgrade. */
  definitionForRun(runRecordId: string, promptContractDigest: string): AnalysisKindDefinition {
    const planned = this.definitionForDigest(promptContractDigest);
    if (planned.kind !== FACTUAL_REVIEW_KIND) return planned;
    const assurance = this.factualRunAssurance(runRecordId);
    if (assurance?.effectiveLevel !== 'quick') return planned;
    const quick = this.#factualDefinitionFor('quick');
    return withEditorialMemoryDefinition(planned.procedureBinding === undefined ? quick : withProcedureDefinition(quick, planned.procedureBinding.document, planned.procedureBinding.pin),
      editorialMemoryDefinition(planned)?.memory ?? null);
  }

  procedureForRun(runRecordId: string): import('../../shared/protocol/procedures.js').ProcedureDefinitionDocument | null {
    const digest = this.#db.prepare(`SELECT a.plan_envelope_sha256 FROM analysis_run_records r
      JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id WHERE r.run_record_id = ?`).get(runRecordId);
    return digest === undefined ? null : readProcedurePlanView(this.#db, String(digest.plan_envelope_sha256), this.#definition.kind)?.document ?? null;
  }

  factualRunAssurance(runRecordId: string): import('../../shared/protocol.js').FactualRunAssuranceProjection | null {
    if (this.#definition.kind !== FACTUAL_REVIEW_KIND ||
        this.#db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'factual_run_assurance'").get() === undefined) return null;
    const row = this.#db.prepare('SELECT canonical_json, sha256 FROM factual_run_assurance WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    if (row === undefined) return null;
    const json = asString(row.canonical_json);
    requireAnalysis(sha256Hex(json) === row.sha256, 'ANALYSIS_RECORD_INVALID', '事实核查运行级别记录已损坏。');
    return JSON.parse(json) as import('../../shared/protocol.js').FactualRunAssuranceProjection;
  }

  /** A closed unit record read back by the contract that wrote it: a factual v2 record carries `corrections` (Issue #901). */
  #unitResultOfRecord(record: Record<string, unknown>, unitOrdinal: number): unknown {
    if (this.#definition.kind === FACTUAL_REVIEW_KIND) {
      return Object.hasOwn(record, 'corrections') ? factualReviewUnitResultOfRecordV2(record, unitOrdinal)
        : factualReviewKindDefinition().unitResultOfRecord(record, unitOrdinal);
    }
    return this.#definition.unitResultOfRecord(record, unitOrdinal);
  }

  get kind(): AnalysisKindId {
    return this.#definition.kind;
  }

  /** Resolve an immutable baseline revision by the authorized id/digest, never by latest at tool time. */
  pinnedToolSourcesForRun(runRecordId: string): PinnedLocalToolSources | null {
    const facts = this.loadExecutionPlan(runRecordId);
    const sources = facts.compositionOptions?.sources;
    if (sources === undefined) return null;
    const pin = sources.baseline;
    if (pin === null) return sources;
    const row = this.#db.prepare(`SELECT r.* FROM analysis_result_set_revisions r JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
      WHERE r.revision_id = ? AND s.book_id = ? AND s.kind = 'baseline-manuscript-analysis'`).get(pin.revisionId, facts.bookId);
    requireAnalysis(row !== undefined && row.sha256 === pin.digest && sha256Hex(asString(row.canonical_json)) === pin.digest,
      'ANALYSIS_RECORD_INVALID', '固定基线来源不可用。');
    const body = parseCanonicalJson(asString(row.canonical_json)) as { synthesis?: { entities?: unknown[]; events?: unknown[]; settingClaims?: unknown[] } };
    const baseline = { ...pin, entities: body.synthesis?.entities ?? [], events: body.synthesis?.events ?? [], settingClaims: body.synthesis?.settingClaims ?? [] };
    return { ...sources, baseline, terms: baseline.entities.filter((entity) => isRecord(entity) && ['person', 'place', 'term'].includes(String(entity.kind))) };
  }

  #newCompositionOptions(bookId: string, leafMode = false, definition = this.#definition, selected?: ProcedureDefinitionPin): CompositionOptions {
    const id = definition.factualClaims === undefined ? procedureIdForKind(this.#definition.kind) : FACTUAL_CLAIM_PROCEDURE_ID;
    const resolved = selected === undefined ? id === null ? null : resolveProcedureDefinition(this.#db, id, this.#definition.contractVersion === 'ai7.editorial-review/1' ? 1 : currentPreinstalledVersion(id))
      : (({ document, executor }) => ({ document, pin: executor }))(resolveProcedureForKind(this.#db, selected, this.#definition.kind));
    const procedureOptions = resolved === null ? {} : { procedure: resolved.pin, stages: resolved.document.stages.map((stage, index) =>
      ({ ordinal: index + 1, stageType: stage.stageType, digest: sha256Hex(canonicalJson(stage)) })) };
    const stock = reviewCategoryEntry('typos-and-usage')!;
    const expected = withModelClarification(reviewCategoryKindDefinition(reviewCategoryContractInput(stock), 2, STOCK_TYPOS_LEAF_LOCAL_TOOLS));
    const localLeaf = this.#route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE;
    const productionLeaf = leafMode && this.#launch.operationalScope === 'ordinary-production' &&
      this.#launch.policy?.providerProcessing.subAgents !== undefined && this.#definition.promptContractDigest === expected.promptContractDigest;
    if ((localLeaf || productionLeaf) && (selected === undefined || selected.procedureId === resolved?.pin.procedureId)) {
      requireAnalysis(leafMode && this.#definition.promptContractDigest === expected.promptContractDigest &&
        resolved?.pin.procedureId === 'ai7-procedure/review-typos-and-usage' && resolved.pin.version === 2,
      'ANALYSIS_CHILD_PROFILE_REFUSED', '单元子代理只适用于固定的标准错字用词审阅。');
      return { version: 4, subagents: STOCK_TYPOS_FANOUT, ...procedureOptions, localTools: STOCK_TYPOS_LEAF_LOCAL_TOOLS,
        sources: { baseline: null, guidelines: stock.guidelineDocuments.map(({ documentId, version, clauses }) => ({ documentId, version, clauses })), terms: [] } };
    }
    const local = kindLocalTools(this.#launch.policy, this.#definition.kind);
    if (local?.declarations === undefined) return { version: 2, ...procedureOptions };
    const row = this.#db.prepare(`SELECT r.* FROM analysis_result_set_revisions r JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
      WHERE s.book_id = ? AND s.kind = 'baseline-manuscript-analysis' ORDER BY r.ordinal DESC LIMIT 1`).get(bookId);
    let baseline: PinnedLocalToolSources['baseline'] = null;
    if (row !== undefined) {
      const json = asString(row.canonical_json);
      requireAnalysis(sha256Hex(json) === row.sha256, 'ANALYSIS_RECORD_INVALID', '基线记录摘要无效。');
      baseline = { revisionId: asString(row.revision_id), digest: asString(row.sha256), entities: [], events: [], settingClaims: [] };
    }
    const documents = liveKindRule(this.#launch.policy, this.#definition.kind)?.outboundDataCategories.includes('house-review-guideline-clause') === true
      ? BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.flatMap((category) => category.guidelineDocuments) : [];
    let remaining = 40;
    const guidelines = [...new Map(documents.map((document) => [document.documentId, document])).values()].flatMap((document) => {
      if (remaining === 0) return [];
      const latest = this.#db.prepare('SELECT * FROM review_guideline_versions WHERE document_id = ? ORDER BY ordinal DESC LIMIT 1').get(document.documentId);
      let clauses = document.clauses;
      let version = document.version;
      if (latest !== undefined) {
        const json = asString(latest.canonical_json);
        requireAnalysis(sha256Hex(json) === latest.sha256, 'ANALYSIS_RECORD_INVALID', '规范文件版本摘要无效。');
        const body = parseCanonicalJson(json) as { clauses: typeof clauses };
        clauses = body.clauses;
        version = asString(latest.version_id);
      }
      const admitted = clauses.filter((clause) => [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(clause.text)].length <= 300).slice(0, remaining);
      remaining -= admitted.length;
      return [{ documentId: document.documentId, version, clauses: admitted }];
    });
    return { version: 2, ...procedureOptions, sources: { baseline, guidelines, terms: [] } };
  }

  get launch(): LaunchBinding {
    return this.#launch;
  }

  /** The source a new research Task would freeze, also used by the new-review sheet. */
  currentResearchBackend(): FrozenWebToolsBackend | undefined {
    return this.#currentSearchPlan(this.#definition, null).webToolsBackend;
  }

  /** Whether a preparation is in flight, which only this instance holds; the store keeps such a ledger (Issue #649). */
  get preparing(): boolean {
    return this.#work.size > 0;
  }

  /** Whether this instance holds the preparation `workId`; the store finds a kept ledger's preparation by it (Issue #672). */
  holdsPreparation(workId: string): boolean {
    return this.#work.has(workId);
  }

  /**
   * Bind the trusted launch facts. The service entry calls this once, before it serves any frame, so
   * that the store never has to reach for a launch policy of its own; a `developer-live` scope
   * without its live binding, or a live binding under any other scope, is refused rather than
   * silently downgraded to the provider-free plan.
   */
  bindLaunch(launch: LaunchBinding): void {
    // Under ordinary-production (Issue #811) the binding may be absent — no route configured yet — and is the editor's, read
    // again whenever a plan freezes; under every other scope it is the launch's, present exactly under developer-live.
    const live = launch.live;
    requireAnalysis(launch.operationalScope === 'ordinary-production'
      ? live === null || live.scope === 'ordinary-production'
      : (launch.operationalScope === 'developer-live') === (live !== null) && (live === null || live.scope !== 'ordinary-production'),
    'ANALYSIS_LAUNCH_BINDING_INVALID', '可信区间与开发者实时绑定不一致。');
    const ceiling = live === null || live.scope === 'ordinary-production' ? null : live.runBudgetCeiling;
    requireAnalysis(live === null ||
      ((ceiling === null || (ceiling.kind === 'tokens'
        ? Number.isSafeInteger(ceiling.maxTotalTokens) && ceiling.maxTotalTokens > 0
        : Number.isSafeInteger(ceiling.tokensPerFrozenUnit) && ceiling.tokensPerFrozenUnit > 0)) &&
        UUID_PATTERN.test(live.credentialReference)),
    'ANALYSIS_LAUNCH_BINDING_INVALID', '开发者实时绑定缺少必需的运行预算上限或凭据引用。');
    // Preserve own fields for callers that spread/rebind the launch. Its policy/live accessors must still read the
    // caller's current connection with their original receiver; the retained reader alone falls back to the Store's.
    const retainedPolicyFor = launch.retainedPolicyFor ?? this.#launch.retainedPolicyFor;
    // Editorial memory is read from the Store that owns this ledger, which binds its reader first: a launch carried over from
    // another (possibly closed) Store never redirects a plan's memory read to that Store's database.
    const editorialMemory = this.#launch.editorialMemory ?? launch.editorialMemory;
    if ((launch.retainedPolicyFor !== undefined || retainedPolicyFor === undefined) && launch.editorialMemory === editorialMemory) this.#launch = launch;
    else {
      const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(launch);
      for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key]!;
        if (descriptor.get !== undefined) descriptor.get = descriptor.get.bind(launch);
        if (descriptor.set !== undefined) descriptor.set = descriptor.set.bind(launch);
      }
      this.#launch = Object.defineProperties({}, { ...descriptors,
        ...(retainedPolicyFor === undefined ? {} : { retainedPolicyFor: { value: retainedPolicyFor, enumerable: true } }),
        ...(editorialMemory === undefined ? {} : { editorialMemory: { value: editorialMemory, enumerable: true } }) }) as LaunchBinding;
    }
    this.#refreshClarificationDefinition();
  }

  #refreshClarificationDefinition(): void {
    const launch = this.#launch;
    const rule = liveKindRule(launch.policy, this.#definition.kind);
    const leaf = this.#route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE;
    this.#definition = withReviewLocalTools(this.#definition, leaf ? STOCK_TYPOS_LEAF_LOCAL_TOOLS : kindLocalTools(launch.policy, this.#definition.kind));
    const base = this.#definition.clarificationBase ?? this.#definition;
    // The factual kind's own definition is its default level's (Issue #901): 标准核查 where the levels apply, else v1 as before.
    if (base.kind === FACTUAL_REVIEW_KIND) this.#definition = this.#factualUnwrapped('standard', rule);
    // The one origin-qualified admitted rule owns eligibility; missing terms deny.
    if (leaf || this.#route?.fixtureIdentity.startsWith('sample1-model-clarification') === true ||
        rule?.clarificationQuestionAllowed === true) {
      this.#definition = withModelClarification(this.#definition);
    // An unconfigured production route has no current rule, but a stopped Run still owns its frozen binding.
    } else if (rule !== null) this.#definition = this.#definition.clarificationBase ?? this.#definition;
  }

  /** The launch's binding as its sentences read it: under ordinary-production without a route, 模型服务需设置. */
  #liveReading(): LiveReading {
    return this.#launch.operationalScope === 'ordinary-production' && this.#launch.live === null ? MODEL_SERVICE_SETUP_REQUIRED : this.#launch.live;
  }

  // ---- inspection -------------------------------------------------------------------------------

  /**
   * The Book's latest Task of this ledger's kind with the latest Result Set Revision, the Revision
   * History, and the Analysis Update Controls; `revisionId` additionally opens one exact revision
   * read-only. Older revisions never replace `resultSetRevision`, which is always the latest.
   *
   * The shape is discriminated on `kind`: a caller that knows which ledger it asked narrows the union
   * on that member, and the baseline kind's shape is exactly what it has always been.
   */
  inspect(bookId: string, progress: ProgressReader = () => null, revisionId: string | null = null): AnalysisProjection {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '任务所属图书无效。');
    requireAnalysis(revisionId === null || UUID_PATTERN.test(revisionId), 'ANALYSIS_REVISION_INVALID', '结果集修订版标识无效。');
    const intentRow = this.#latestIntentRow(bookId);
    if (intentRow === undefined) {
      this.#binding(bookId);
      requireAnalysis(revisionId === null, 'ANALYSIS_REVISION_NOT_FOUND', '本图书没有该结果集修订版。');
      return this.#available(bookId);
    }
    const intent = this.#intentFacts(intentRow);
    const taskIntent = {
      taskIntentId: intent.taskIntentId,
      goal: intent.goal,
      expectedOutcome: intent.expectedOutcome,
      createdAt: intent.createdAt,
      mode: intent.mode,
      modeLabel: this.#recordedMode(intent.mode).label,
      ...(this.#definition.kind !== BASELINE_ANALYSIS_KIND ? {} : {
        redoOf: intent.redoOfRunRecordId === null
          ? null
          : { runRecordId: intent.redoOfRunRecordId, taskIntentId: this.#redoneTaskIntentId(intent.redoOfRunRecordId) },
        // A Task the 后台分析登记 dispatcher prepared says so (Issue #95, S39): it is never shown as one the editor asked for.
        ...(intent.preparedByEnrollmentVersionId === null ? {} : { preparedByEnrollmentVersionId: intent.preparedByEnrollmentVersionId }),
      }),
    };
    const revisionRows = this.#revisionRows(bookId);
    const latestRow = revisionRows.at(-1);
    const latestOrdinal = latestRow === undefined ? 0 : asNumber(latestRow.ordinal);
    const revision = latestRow === undefined ? null : this.#revisionProjection(latestRow, latestOrdinal);
    const history = this.#history(bookId, revisionRows, revision);
    const inspectedRevision = revisionId === null ? null : this.#inspectedRevision(revisionRows, revisionId, latestOrdinal);
    const checkpoint = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    if (checkpoint === undefined) {
      this.#binding(bookId);
      const update = this.#carriesPlan(intent.mode) ? this.#updateProjection(intent, null, null, revision) : null;
      return this.#asProjection({
        ...this.#shape(bookId),
        taskIntent,
        resultSetRevision: revision,
        update,
        updateControls: this.#updateControlsFor(bookId, revision, null),
        history,
        inspectedRevision,
        actions: { canPrepare: revision === null, canAuthorize: false, canReconfirmPlan: false },
      });
    }
    const versions = this.#planVersionFacts(intent.taskIntentId);
    const currentVersion = versions.at(-1);
    requireAnalysis(currentVersion !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划缺少计划版本。');
    const plan = this.#planRecords(intent.taskIntentId, intent.mode, currentVersion.ordinal);
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest) && manifestCoversEveryBlock(manifest), 'ANALYSIS_RECORD_INVALID', '覆盖清单记录无效。');
    const digests = this.#planDigests(intent.taskIntentId, currentVersion.ordinal);
    requireAnalysis(digests['plan-envelope'] === currentVersion.planEnvelopeDigest, 'ANALYSIS_RECORD_INVALID', '计划版本与其计划信封不一致。');
    const envelope = plan['plan-envelope'] as Record<string, unknown>;
    const authorization = this.#db.prepare('SELECT * FROM analysis_run_authorizations WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    const runRecord = this.#db.prepare('SELECT * FROM analysis_run_records WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    const run = runRecord === undefined ? null : this.#runProjection(runRecord, progress);
    const outcome = this.#db.prepare('SELECT * FROM analysis_task_outcomes WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    // A Run whose last state is `authorized` is one the governor has not admitted yet: it waits for a place (Issue #49,
    // S14; CONC-007). One with no route is recorded blocked before dispatch in the same transaction.
    const state: BaselineAnalysisProjection['state'] = run === null
      ? 'prepared'
      : run.state === 'authorized' ? 'queued'
        : run.state === 'blocked-before-dispatch'
        ? 'authorized-blocked'
        // A cancelled Run never ran, so it reads as cancelled — never as 已中断, which OFF-012 keeps for a Run
        // that can resume (Issue #502).
        : run.state === 'awaiting-connectivity' ? 'waiting'
          : run.state === 'cancelled' ? 'cancelled'
            : run.state === 'cancelling' ? 'cancelling'
              : run.state === 'pausing' ? 'pausing'
                : run.state === 'paused' ? 'paused'
                  : run.state === 'resumable' ? 'resumable'
                    : run.state === 'awaiting-clarification' ? 'awaiting-clarification'
        : run.state === 'admitted' ? 'admitted'
          : run.state === 'executing' ? 'executing'
            : run.state === 'completed' || run.state === 'completed-with-gaps' ? 'settled'
              : run.state === 'failed' ? 'failed' : 'interrupted';
    const providerPlan = plan['provider-resolution-plan'] as BaselineAnalysisProjection['providerResolutionPlan'];
    const planned = this.#carriesPlan(intent.mode);
    const reusePlan = planned ? plan['reuse-plan'] as AnalysisPlanRecord : null;
    const update = planned ? this.#updateProjection(intent, reusePlan, digests['reuse-plan'] ?? null, revision) : null;
    // A frozen scope plan the chain no longer derives (#711 review P3-4) — one prepared before a release changed how it
    // derives — is never authorized: the Task reads as changed, and preparing again makes a new one.
    const planDerives = authorization !== undefined || this.#frozenPlanDerives(update, manifest);
    // Drift detection (Issue #48): before authorization the material inputs are re-derived from durable
    // state and compared with the frozen version; a stored pending Plan Revision takes precedence over a
    // live difference. After authorization the bound plan is final for its Run and nothing is compared.
    const materialInputs = materialPlanInputsOfComponents(plan, intent.record);
    const revisions = this.#planRevisionProjections(intent.taskIntentId, versions);
    let planRevision: BaselineAnalysisPlanRevisionProjection | null = null;
    if (authorization === undefined) {
      planRevision = revisions.filter((entry) => entry.state === 'pending' && entry.priorPlanVersionId === currentVersion.planVersionId).at(-1) ?? null;
      if (planRevision === null) {
        const live = this.#currentMaterialInputs(bookId, intent.mode, materialInputs.selectedRange, manifest.units.length,
          planEditCeiling(this.#planEditsOf(intent.taskIntentId, currentVersion.ordinal)), undefined, intent.backgroundRunBudgetCeiling);
        const diff = diffMaterialPlanInputs(materialInputs, live);
        if (diff.length > 0) {
          const changedFields = diff.map((entry) => entry.field);
          planRevision = {
            planRevisionId: null,
            priorPlanVersionId: currentVersion.planVersionId,
            priorOrdinal: currentVersion.ordinal,
            nextOrdinal: null,
            trigger: 'inspect',
            detectedAt: null,
            changedFields,
            diff,
            proposed: live,
            state: 'pending',
            supersedes: [],
            resolved: false,
            label: planRevisionLabel(currentVersion.ordinal, null, changedFields, 'pending'),
          };
        }
      }
    }
    const boundVersion = authorization === undefined ? null : versions.find((entry) => entry.planEnvelopeDigest === asString(authorization.plan_envelope_sha256)) ?? null;
    const planVersions = versions.map((entry): BaselineAnalysisPlanVersionProjection => ({
      planVersionId: entry.planVersionId,
      ordinal: entry.ordinal,
      planEnvelopeDigest: entry.planEnvelopeDigest,
      planRevisionId: entry.planRevisionId,
      createdAt: entry.createdAt,
      edits: this.#planEditsOf(intent.taskIntentId, entry.ordinal),
      state: boundVersion !== null && entry.planVersionId === boundVersion.planVersionId
        ? 'bound'
        : entry.ordinal < currentVersion.ordinal || planRevision !== null ? 'superseded' : 'current',
    }));
    // A predecessor drift is a different Task Intent, never a reconfirmation of this one.
    const canReconfirmPlan = authorization === undefined && planRevision !== null && !planRevision.changedFields.includes('predecessorRevision');
    return this.#asProjection({
      bookId,
      kind: this.#definition.kind,
      contractVersion: this.#definition.contractVersion,
      state,
      // A Run in Connectivity Wait, or cancelled while it waited, never ran: it reads as its Run state does, never as
      // 已中断, which OFF-012 keeps for a Run that can resume (Issue #502). One cancelled after it began reads 已取消,
      // and one stopping at the editor's word 正在取消 (Issue #422).
      stateLabel: state === 'prepared' ? '计划已冻结 · 待授权'
        : state === 'authorized-blocked' ? (run?.blockedBy === 'plan-moved' ? PLAN_MOVED_LABEL : '已授权 · 派发前阻止')
          : state === 'queued' ? (authorization?.start_when === 'idle' ? RUN_WAITING_IDLE_LABEL : RUN_QUEUED_LABEL)
          : state === 'waiting' ? RUN_STATE_LABELS['awaiting-connectivity']
            : state === 'cancelled' ? (run !== null && runBegan(run.transitions) ? RUN_CANCELLED_AFTER_START_LABEL : RUN_STATE_LABELS.cancelled)
              : state === 'cancelling' ? RUN_STATE_LABELS.cancelling
                : state === 'pausing' ? RUN_STATE_LABELS.pausing
                  : state === 'paused' ? (run?.stateLabel ?? RUN_STATE_LABELS.paused)
                    : state === 'resumable' ? (run !== null && this.accountLimitOf(run.runRecordId) !== null ? ACCOUNT_LIMIT_RUN_LABEL
                      : run !== null && this.outcomeUnknownOf(run.runRecordId) !== null ? OUTCOME_UNKNOWN_RUN_LABEL : RUN_STATE_LABELS.resumable)
                      : state === 'awaiting-clarification' ? RUN_STATE_LABELS['awaiting-clarification']
              : state === 'admitted' ? '已进入调度'
                : state === 'executing' ? '正在执行'
                  : state === 'settled' ? '已形成结果集修订版'
                    : state === 'failed' ? '运行失败'
                      // Run Budget Ceiling Reached keeps its own words, never 已中断's (Issue #51, S16a; RUN-012).
                      : outcome !== undefined && run !== null && this.#runStop(run.runRecordId) !== null ? BUDGET_REACHED_RUN_LABEL : '运行已中断',
      taskIntent,
      checkpoint: {
        manuscriptId: asString(checkpoint.manuscript_id),
        branchId: asString(checkpoint.branch_id),
        revisionId: asString(checkpoint.revision_id),
        revisionLabel: asString(checkpoint.revision_label),
        revisionDigest: asString(checkpoint.revision_digest),
        journalSequence: asNumber(checkpoint.journal_sequence),
        purpose: TASK_INPUT_CHECKPOINT_PURPOSE,
        createdForDirtyJournal: asNumber(checkpoint.created_for_dirty_journal) === 1,
      },
      manuscriptPin: plan['manuscript-pin'] as BaselineAnalysisProjection['manuscriptPin'],
      artifactPin: plan['artifact-pin'] as BaselineAnalysisProjection['artifactPin'],
      runSourceScope: plan['run-source-scope'] as BaselineAnalysisProjection['runSourceScope'],
      coverageManifest: manifest,
      providerResolutionPlan: providerPlan,
      executionPlan: plan['execution-plan'] as BaselineAnalysisProjection['executionPlan'],
      planEnvelope: {
        digest: asString(digests['plan-envelope']),
        procedure: readProcedurePlanPin(this.#db, asString(digests['plan-envelope'])),
        dispatchAllowed: envelope.dispatchAllowed === true,
        providerStatus: envelope.providerStatus as 'remote-denied-local-deterministic' | 'remote-denied-no-route',
        summary: asString(envelope.summary),
        promptContractDigest: asString(envelope.promptContractDigest),
        behaviorCompositionDigest: asString(envelope.behaviorCompositionDigest),
        ...(envelope.compositionVersion === 2 || envelope.compositionVersion === 3 || envelope.compositionVersion === 4 ? { compositionVersion: envelope.compositionVersion } : {}),
        planVersion: typeof envelope.planVersion === 'number' ? envelope.planVersion : null,
        boundary: isRecord(envelope.boundary) ? envelope.boundary as unknown as PlanBoundarySplitProjection : null,
      },
      planVersion: { ...planVersions[planVersions.length - 1]!, materialInputs },
      planVersions,
      planRevisions: revisions,
      planRevision,
      authorization: authorization === undefined ? null : {
        authorizationId: asString(authorization.authorization_id),
        planEnvelopeDigest: asString(authorization.plan_envelope_sha256),
        planVersionOrdinal: boundVersion?.ordinal ?? null,
        ...authorizationOrigin(authorization),
        startWhen: authorization.start_when === 'idle' ? 'idle' : 'now',
        authority: asString(authorization.authority) as 'standard-direct-dispatch' | 'record-only-no-dispatch',
        authorizedAt: asString(authorization.authorized_at),
      },
      run,
      resultSetRevision: revision,
      taskOutcome: outcome === undefined ? null : this.#outcomeProjection(outcome),
      update,
      updateControls: this.#updateControlsFor(bookId, revision, runIsActive(run?.state ?? null) ? run! : null),
      history,
      inspectedRevision,
      actions: {
        // A baseline analysis whose Run ended before it kept anything — cancelled, a wait included (Issue #502, OFF-010),
        // failed, interrupted or blocked — leaves the Book with no revision: it can be started again, as a Book never
        // analysed can (Issue #422, S76c).
        canPrepare: this.#definition.kind === BASELINE_ANALYSIS_KIND && revision === null && run !== null &&
          (run.state === 'cancelled' || run.state === 'failed' || run.state === 'interrupted' || run.state === 'blocked-before-dispatch'),
        canAuthorize: authorization === undefined && (update === null || update.predecessorCurrent) && planRevision === null && planDerives,
        canReconfirmPlan,
      },
      namedNonEffects: namedNonEffects(this.#liveReading(), manifest.units.length),
    });
  }

  /**
   * The durable `safe-retry` Plan Adaptations of one Run, in record order. Both the Run's timeline
   * and its Run Report read them from here, so neither restates what the other saw. Each follows the
   * span that names it to the retry's own turn, and reads whether that turn repeated the first
   * attempt's unit message byte for byte (Issue #286).
   */
  adaptationsOf(runRecordId: string): BaselineAnalysisPlanAdaptationProjection[] {
    return (this.#db.prepare(
      `SELECT adaptation.* FROM analysis_plan_adaptations adaptation
       JOIN analysis_execution_attempts attempt ON attempt.attempt_id = adaptation.attempt_id
       WHERE attempt.run_record_id = ? ORDER BY adaptation.ordinal`,
    ).all(runRecordId) as SqlRow[]).map((row): BaselineAnalysisPlanAdaptationProjection => {
      // An adaptation recorded before Issue #286 names no unit-message digest, and reads as one that kept none.
      const record = parseCanonicalJson(asString(row.canonical_json)) as Omit<PlanAdaptationRecord, 'firstUnitMessageDigest'> & { firstUnitMessageDigest?: string | null };
      const first = record.firstUnitMessageDigest ?? null;
      requireAnalysis(record.adaptationId === row.adaptation_id && (record.adaptationClass === 'safe-retry' || record.adaptationClass === 'contract-retry'), 'ANALYSIS_RECORD_INVALID', '计划内调整记录无效。');
      const retry = this.#retryTurnOf(asString(row.attempt_id), asNumber(row.unit_ordinal), record.adaptationId, record.firstUnitMessageDigest === undefined);
      const repetition: SafeRetryRepetition = first === null || retry === null || retry.unitMessageDigest === null ? 'unrecorded'
        : retry.unitMessageDigest === first ? 'byte-identical' : 'differs';
      return { ...record, firstUnitMessageDigest: first, retry, repetition, label: planAdaptationLabel(record.unitOrdinal, record.classifiedReason, repetition, record.adaptationClass) };
    });
  }

  /**
   * A safe retry's own turn (Issue #286): the span of its attempt and unit that names the adaptation it carried out, found by
   * the store rather than by reading every span of the unit (Issue #286 review). An adaptation recorded before Issue #286 has
   * spans that name no adaptation; its retry's turn is then the one second attempt of its unit in its attempt recorded before
   * the digests were kept, when there is exactly one, and only when it is the one adaptation of that unit in that attempt
   * recorded before them (Issue #286 review). An explicit Resume could have added more of either, and then none is taken. Such
   * a turn keeps its payload digest and no unit-message digest.
   */
  #retryTurnOf(attemptId: string, unitOrdinal: number, adaptationId: string, recordedBefore286: boolean): BaselineAnalysisPlanAdaptationProjection['retry'] {
    const turn = (row: SqlRow): NonNullable<BaselineAnalysisPlanAdaptationProjection['retry']> => {
      const span = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      return {
        spanOrdinal: asNumber(row.ordinal),
        unitMessageDigest: typeof span.unitMessageDigest === 'string' ? span.unitMessageDigest : null,
        payloadDigest: typeof span.payloadDigest === 'string' ? span.payloadDigest : null,
      };
    };
    const named = this.#db.prepare(
      `SELECT ordinal, canonical_json FROM analysis_harness_spans
       WHERE attempt_id = ? AND unit_ordinal = ? AND json_extract(canonical_json, '$.adaptationId') = ?
       ORDER BY ordinal LIMIT 1`,
    ).get(attemptId, unitOrdinal, adaptationId) as SqlRow | undefined;
    if (named !== undefined) return turn(named);
    if (!recordedBefore286) return null;
    // Both sides are one: a second adaptation of the unit recorded before the digests could claim the same turn.
    const adaptations = this.#db.prepare(
      `SELECT count(*) AS total FROM (SELECT 1 FROM analysis_plan_adaptations
       WHERE attempt_id = ? AND unit_ordinal = ? AND json_type(canonical_json, '$.firstUnitMessageDigest') IS NULL LIMIT 2)`,
    ).get(attemptId, unitOrdinal) as SqlRow;
    if (asNumber(adaptations.total) !== 1) return null;
    const earlier = this.#db.prepare(
      `SELECT ordinal, canonical_json FROM analysis_harness_spans
       WHERE attempt_id = ? AND unit_ordinal = ? AND json_type(canonical_json, '$.unitMessageDigest') IS NULL
         AND json_type(canonical_json, '$.adaptationId') IS NULL AND json_extract(canonical_json, '$.attemptIndex') = 2
       ORDER BY ordinal LIMIT 2`,
    ).all(attemptId, unitOrdinal) as SqlRow[];
    return earlier.length === 1 ? turn(earlier[0]!) : null;
  }

  /**
   * One frozen plan version of one of this ledger's Tasks, named by the envelope digest a reader holds
   * for it: its Task Input checkpoint and its components, read back exactly as `inspect` reads the
   * latest Task's (Issue #418). A Review Run's category keeps naming its own Task after later Tasks of
   * the same kind exist, so the Task Drawer reads that plan here rather than through `inspect`. Nothing
   * is written.
   */
  frozenPlan(taskIntentId: string, planEnvelopeDigest: string): {
    checkpoint: NonNullable<BaselineAnalysisProjection['checkpoint']>;
    planVersion: number;
    components: Readonly<Record<string, unknown>>;
  } {
    requireAnalysis(UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest), 'ANALYSIS_RECORD_INVALID', '任务计划标识无效。');
    const intent = this.#db.prepare('SELECT kind FROM analysis_task_intents WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    requireAnalysis(intent !== undefined && intent.kind === this.#definition.kind, 'ANALYSIS_RECORD_INVALID', '任务计划不属于该分析种类。');
    const version = this.#planVersionByEnvelopeDigest(planEnvelopeDigest);
    requireAnalysis(version !== undefined && version.taskIntentId === taskIntentId, 'ANALYSIS_RECORD_INVALID', '任务计划版本缺失。');
    const checkpoint = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpoint !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    const components = this.#planRecords(taskIntentId, 'any', version.ordinal);
    requireAnalysis(this.#planDigests(taskIntentId, version.ordinal)['plan-envelope'] === planEnvelopeDigest, 'ANALYSIS_RECORD_INVALID', '计划版本与其计划信封不一致。');
    return {
      checkpoint: {
        manuscriptId: asString(checkpoint.manuscript_id),
        branchId: asString(checkpoint.branch_id),
        revisionId: asString(checkpoint.revision_id),
        revisionLabel: asString(checkpoint.revision_label),
        revisionDigest: asString(checkpoint.revision_digest),
        journalSequence: asNumber(checkpoint.journal_sequence),
        purpose: TASK_INPUT_CHECKPOINT_PURPOSE,
        createdForDirtyJournal: asNumber(checkpoint.created_for_dirty_journal) === 1,
      },
      planVersion: version.ordinal,
      components,
    };
  }

  // ---- 待我处理 (Issue #424, plan slice S78) ------------------------------------------------------------

  /**
   * What 待我处理 reads of this ledger's kind across every Book (V2-UX-ATTN-002 to 005): each Book's latest
   * Task — exactly the one `inspect` reads — with its Run's last recorded state, and, for a prepared Task,
   * the pending Plan Revision that 重新确认计划 would settle, derived exactly as `inspect` derives it: a
   * stored revision still pending on the current version first, then a live difference of the material
   * inputs. A difference in the predecessor revision is left out, because no reconfirmation settles it.
   * Then the Task Outcomes that completed since `since`, newest first.
   *
   * A read: nothing is written. A Run left admitted or executing is reported with the owner's `progress`
   * reading of it, which is `null` when nothing executes it; what that means is the reader's to say.
   */
  attentionReadings(
    progress: ProgressReader,
    since: string,
    limit: number,
    // A Book's 任务 panel (Issue #423, S77a): that Book alone, and its cancelled Tasks among the outcomes.
    scope: { bookId: string; cancelled: boolean } | null = null,
  ): {
    tasks: AnalysisTaskAttentionReading[];
    outcomes: AnalysisOutcomeAttentionReading[];
  } {
    const kind = this.#definition.kind;
    // The caller composes each kind's readings under its own Task target; review categories remain one Review Run item.
    // Each Book's latest Task, exactly as `#latestIntentRow` orders them, kept only when it could need the
    // editor: prepared and not yet started, or with a Run whose last state is not a completion — whose
    // outcome is read below instead.
    const lastState = `(SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1)`;
    const rows = this.#db.prepare(
      `SELECT t.*, b.title book_title, r.run_record_id, r.recorded_at run_recorded_at,
              ${lastState} last_state,
              (SELECT s.recorded_at FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1) last_state_at,
              (SELECT s.canonical_json FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1) last_state_json,
              (SELECT 1 FROM analysis_run_authorizations a WHERE a.task_intent_id = t.task_intent_id) has_authorization
       FROM analysis_task_intents t
       JOIN books b ON b.book_id = t.book_id
       LEFT JOIN analysis_run_records r ON r.task_intent_id = t.task_intent_id
       WHERE t.kind = ? AND t.rowid = (
           SELECT t2.rowid FROM analysis_task_intents t2 WHERE t2.book_id = t.book_id AND t2.kind = t.kind
           ORDER BY t2.created_at DESC, t2.rowid DESC LIMIT 1)
         AND EXISTS (SELECT 1 FROM analysis_task_input_checkpoints c WHERE c.task_intent_id = t.task_intent_id)
         AND (r.run_record_id IS NULL OR ${lastState} NOT IN ('completed', 'completed-with-gaps'))
         AND (? IS NULL OR t.book_id = ?)
       ORDER BY t.created_at, t.task_intent_id LIMIT ?`,
    ).all(kind, scope?.bookId ?? null, scope?.bookId ?? null, limit) as SqlRow[];
    const tasks: AnalysisTaskAttentionReading[] = [];
    for (const row of rows) {
      const base = {
        bookId: asString(row.book_id),
        bookTitle: asString(row.book_title),
        taskIntentId: asString(row.task_intent_id),
        mode: asString(row.mode) as BaselineAnalysisTaskMode,
        createdAt: asString(row.created_at),
      };
      if (row.run_record_id !== null) {
        const runRecordId = asString(row.run_record_id);
        requireAnalysis(row.last_state !== null, 'ANALYSIS_RECORD_INVALID', '运行记录缺少状态转换。');
        const state = asString(row.last_state) as BaselineAnalysisRunState;
        tasks.push({
          ...base,
          run: {
            runRecordId,
            state,
            waitingIdle: state === 'authorized' && this.loadExecutionPlan(runRecordId).startWhen === 'idle',
            idleYield: (state === 'paused' || state === 'pausing') && this.#idleYielded(runRecordId),
            stateAt: asString(row.last_state_at),
            recordedAt: asString(row.run_recorded_at),
            progress: state === 'admitted' || state === 'executing' || state === 'cancelling' || state === 'pausing' ? progress(runRecordId) : null,
            openClarification: this.#openClarificationOf(runRecordId, state),
            // 已停止 · 预算已达上限 (Issue #51, S16a): an interrupted Run whose outcome names the ceiling — and whether the
            // launch set it, under developer-live (Issue #541).
            budgetReached: state === 'interrupted' && this.#runStop(runRecordId) !== null,
            launchSetsCeiling: state === 'interrupted' && this.#runStop(runRecordId) !== null && this.#launchSetsCeiling(asString(row.task_intent_id)),
            // 模型服务账户限额 (Issue #51, S16b): a resumable Run the provider's account limit stopped.
            accountLimited: state === 'resumable' && this.accountLimitOf(runRecordId) !== null,
            // 结果待确认 (Issue #51, S16c): a resumable Run stopped on a sent request whose result cannot be known.
            // It holds them while paused, account-limited, waiting for an answer or left 可续行 too, and is listed so (P2-1).
            outcomeUnknown: (state === 'paused' || state === 'resumable' || state === 'awaiting-clarification') && this.unconfirmedRangesOf(runRecordId).length > 0,
            ...(row.last_state_json === null ? {} : (() => {
              const detail = parseCanonicalJson(asString(row.last_state_json)) as { resumeFailure?: string };
              return typeof detail.resumeFailure === 'string' ? { resumeFailure: detail.resumeFailure } : {};
            })()),
            ...(state === 'resumable' && row.last_state_json !== null
              ? (() => { const stopReason = resumableStopReasonOf(parseCanonicalJson(asString(row.last_state_json))); return stopReason === undefined ? {} : { stopReason }; })() : {}),
            // 需要重新确认计划 (Issue #536; OFF-008): a waiting Run blocked because its plan moved.
            planMoved: state === 'blocked-before-dispatch' && this.blockedByOf(runRecordId) === 'plan-moved',
          },
          planRevision: null,
        });
        continue;
      }
      if (row.has_authorization !== null) continue;
      tasks.push({ ...base, run: null, planRevision: this.#pendingPlanRevision(row) });
    }
    const outcomes = (this.#db.prepare(
      `SELECT o.outcome_id, o.task_intent_id, o.run_record_id, o.classification, o.recorded_at, o.result_set_revision_id,
              o.canonical_json, t.book_id, t.mode, b.title book_title, r.ordinal revision_ordinal
       FROM analysis_task_outcomes o
       JOIN analysis_task_intents t ON t.task_intent_id = o.task_intent_id
       JOIN books b ON b.book_id = t.book_id
       LEFT JOIN analysis_result_set_revisions r ON r.revision_id = o.result_set_revision_id
       WHERE t.kind = ? AND o.classification IN ('completed', 'completed-with-gaps'${scope?.cancelled === true ? ", 'cancelled'" : ''}) AND o.recorded_at >= ?
         AND (? IS NULL OR t.book_id = ?)
       ORDER BY o.recorded_at DESC, o.outcome_id LIMIT ?`,
    ).all(kind, since, scope?.bookId ?? null, scope?.bookId ?? null, limit) as SqlRow[]).map((row): AnalysisOutcomeAttentionReading => {
      const report = this.#outcomeProjection(row).report;
      return {
        bookId: asString(row.book_id),
        bookTitle: asString(row.book_title),
        taskIntentId: asString(row.task_intent_id),
        mode: asString(row.mode) as BaselineAnalysisTaskMode,
        outcomeId: asString(row.outcome_id),
        runRecordId: asString(row.run_record_id),
        classification: asString(row.classification) as 'completed' | 'completed-with-gaps' | 'cancelled',
        recordedAt: asString(row.recorded_at),
        revisionId: row.result_set_revision_id === null ? null : asString(row.result_set_revision_id),
        revisionOrdinal: row.revision_ordinal === null ? null : asNumber(row.revision_ordinal),
        ...(report === null ? {} : { completion: analysisRunSummary(report) }),
      };
    });
    return { tasks, outcomes };
  }

  /**
   * A prepared Task's pending Plan Revision, as `inspect` finds it: the latest stored one still pending on
   * the current version, else a live difference between the version's frozen material inputs and durable
   * state now. `null` when the plan stands, and when the only way on is a new Task — a difference in the
   * predecessor revision, which no reconfirmation settles (`canReconfirmPlan` is false for it).
   */
  #pendingPlanRevision(intentRow: SqlRow): AnalysisTaskAttentionReading['planRevision'] {
    const intent = this.#intentFacts(intentRow);
    const versions = this.#planVersionFacts(intent.taskIntentId);
    const current = versions.at(-1);
    requireAnalysis(current !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划缺少计划版本。');
    const stored = this.#planRevisionProjections(intent.taskIntentId, versions)
      .filter((entry) => entry.state === 'pending' && entry.priorPlanVersionId === current.planVersionId).at(-1);
    let revision: { planRevisionId: string | null; at: string; changedFields: ReadonlyArray<string> } | null = stored === undefined
      ? null
      : { planRevisionId: stored.planRevisionId, at: stored.detectedAt ?? current.createdAt, changedFields: stored.changedFields };
    if (revision === null) {
      const plan = this.#planRecords(intent.taskIntentId, intent.mode, current.ordinal);
      const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
      const frozen = materialPlanInputsOfComponents(plan, intent.record);
      const diff = diffMaterialPlanInputs(frozen, this.#currentMaterialInputs(intent.bookId, intent.mode, frozen.selectedRange, manifest.units.length,
        planEditCeiling(this.#planEditsOf(intent.taskIntentId, current.ordinal)), undefined, intent.backgroundRunBudgetCeiling));
      revision = diff.length === 0 ? null : { planRevisionId: null, at: current.createdAt, changedFields: diff.map((entry) => entry.field) };
    }
    if (revision === null || revision.changedFields.includes('predecessorRevision')) return null;
    return { ...revision, priorOrdinal: current.ordinal };
  }

  /**
   * One Task Outcome as a reader receives it, its Run Report included.
   *
   * A Task Outcome recorded before Issue #276 carries no report. It is immutable history and is read
   * as exactly what it is: `report` is `null`, the absence is disclosed in the reader's own language,
   * and nothing here rewrites the row to invent one. A report that is present is projected with the
   * digest of its own stored canonical JSON, checked against the digest the Run recorded beside it —
   * so a reader never receives a report whose bytes and whose digest disagree.
   */
  #outcomeProjection(row: SqlRow): NonNullable<BaselineAnalysisProjection['taskOutcome']> {
    const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    const classification = asString(row.classification) as keyof typeof OUTCOME_LABELS;
    const report = isRecord(record.report) ? record.report as unknown as RunReportRecord : null;
    if (report !== null) {
      requireAnalysis(runReportDigest(report) === record.reportDigest, 'ANALYSIS_RECORD_INVALID', '运行报告与其记录的摘要不一致。');
    }
    // A stop is named only on an interrupted outcome recorded since S16a (Issue #51); every earlier one reads as it was.
    const stop = classification === 'interrupted' ? runStopOf(record.stop) : null;
    const completion = report === null ? null : analysisRunSummary(runReportProjection(report));
    return {
      outcomeId: asString(row.outcome_id),
      classification,
      label: classification === 'completed-with-gaps' && completion !== null
        ? completedWithGapsLabel(completion.gaps, completion.total)
        : stop === null ? OUTCOME_LABELS[classification] : BUDGET_REACHED_OUTCOME_LABEL,
      recordedAt: asString(row.recorded_at),
      resultSetRevisionId: row.result_set_revision_id === null ? null : asString(row.result_set_revision_id),
      safeNextAction: asString(record.safeNextAction),
      stop,
      report: report === null ? null : runReportProjection(report),
      reportAbsentReason: report === null ? PRE_RUN_REPORT_REASON : null,
    };
  }

  /**
   * The one place the kind-generic shape the store builds becomes the discriminated projection a
   * caller reads. Every member is already the member its kind declares — the kind, the contract
   * version, the Task mode, the declared stages, and the revision components all come from the
   * definition — and the union is discriminated on `kind`, which no other value in the shape can
   * contradict.
   */
  #asProjection(shape: AnalysisProjectionShape): AnalysisProjection {
    return shape as AnalysisProjection;
  }

  #available(bookId: string): AnalysisProjection {
    return this.#asProjection(this.#shape(bookId));
  }

  /** The `待开始` shape of this ledger's kind: the Book has no Task of it yet. */
  #shape(bookId: string): AnalysisProjectionShape {
    return {
      bookId,
      kind: this.#definition.kind,
      contractVersion: this.#definition.contractVersion,
      state: 'available',
      stateLabel: '待开始',
      taskIntent: null,
      checkpoint: null,
      manuscriptPin: null,
      artifactPin: null,
      runSourceScope: null,
      coverageManifest: null,
      providerResolutionPlan: null,
      executionPlan: null,
      planEnvelope: null,
      planVersion: null,
      planVersions: [],
      planRevisions: [],
      planRevision: null,
      authorization: null,
      run: null,
      resultSetRevision: null,
      taskOutcome: null,
      update: null,
      updateControls: null,
      history: null,
      inspectedRevision: null,
      actions: { canPrepare: true, canAuthorize: false, canReconfirmPlan: false },
      namedNonEffects: namedNonEffects(this.#liveReading()),
    };
  }

  // ---- plan versions and revisions ---------------------------------------------------------------

  #planVersionFacts(taskIntentId: string): PlanVersionFacts[] {
    return (this.#db.prepare('SELECT * FROM analysis_plan_versions WHERE task_intent_id = ? ORDER BY ordinal').all(taskIntentId) as SqlRow[])
      .map((row) => this.#planVersionOfRow(row));
  }

  #planVersionOfRow(row: SqlRow): PlanVersionFacts {
    const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    requireAnalysis(record.planVersionId === row.plan_version_id && record.ordinal === row.ordinal && record.planEnvelopeDigest === row.plan_envelope_sha256,
      'ANALYSIS_RECORD_INVALID', '计划版本记录无效。');
    return {
      planVersionId: asString(row.plan_version_id),
      taskIntentId: asString(row.task_intent_id),
      ordinal: asNumber(row.ordinal),
      planRevisionId: row.plan_revision_id === null ? null : asString(row.plan_revision_id),
      planEnvelopeDigest: asString(row.plan_envelope_sha256),
      createdAt: asString(row.created_at),
    };
  }

  #planVersionByEnvelopeDigest(planEnvelopeDigest: string): PlanVersionFacts | undefined {
    const row = this.#db.prepare('SELECT * FROM analysis_plan_versions WHERE plan_envelope_sha256 = ?').get(planEnvelopeDigest) as SqlRow | undefined;
    return row === undefined ? undefined : this.#planVersionOfRow(row);
  }

  #envelopeDigestOfRun(runRecordId: string): string | undefined {
    const row = this.#db.prepare(
      `SELECT a.plan_envelope_sha256 FROM analysis_run_records r
       JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
       WHERE r.run_record_id = ?`,
    ).get(runRecordId) as SqlRow | undefined;
    return row === undefined ? undefined : asString(row.plan_envelope_sha256);
  }

  /**
   * Every Plan Revision of a Task in detection order, each with how it was settled.
   *
   * The rows are append-only and their immutability triggers stand, so a settled revision is never
   * rewritten to say it is settled: the later row carries the fact and this read derives it (Issue
   * #281). A revision is `resolved` when a later plan version links back to it, `reverted` when it is
   * itself the way back to the inputs its prior version froze, `superseded` when a later revision on
   * the same prior version names it in `supersedes`, and `pending` only while none of the three holds
   * — which is what keeps an abandoned proposal from asking the editor to reconfirm it forever.
   */
  #planRevisionProjections(taskIntentId: string, versions: ReadonlyArray<PlanVersionFacts>): BaselineAnalysisPlanRevisionProjection[] {
    const rows = this.#db.prepare('SELECT * FROM analysis_plan_revisions WHERE task_intent_id = ? ORDER BY rowid').all(taskIntentId) as SqlRow[];
    const parsed = rows.map((row) => {
      const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      const planRevisionId = asString(row.plan_revision_id);
      requireAnalysis(record.planRevisionId === planRevisionId && Array.isArray(record.diff) && isRecord(record.proposed), 'ANALYSIS_RECORD_INVALID', '计划修订记录无效。');
      const supersedes = record.supersedes === undefined ? [] : record.supersedes;
      requireAnalysis(Array.isArray(supersedes) && supersedes.every((entry) => typeof entry === 'string') &&
        (record.revert === undefined || record.revert === true), 'ANALYSIS_RECORD_INVALID', '计划修订记录无效。');
      return { row, record, planRevisionId, supersedes: supersedes as string[], revert: record.revert === true };
    });
    const settledByLater = new Set(parsed.flatMap((entry) => entry.supersedes));
    return parsed.map(({ row, record, planRevisionId, supersedes, revert }) => {
      const diff = record.diff as PlanRevisionDiffEntryProjection[];
      const changedFields = diff.map((entry) => entry.field);
      const resolvedBy = versions.find((entry) => entry.planRevisionId === planRevisionId);
      const priorOrdinal = asNumber(row.prior_ordinal);
      const state: PlanRevisionState = resolvedBy !== undefined ? 'resolved'
        : revert ? 'reverted'
          : settledByLater.has(planRevisionId) ? 'superseded' : 'pending';
      const nextOrdinal = resolvedBy?.ordinal ?? (revert ? priorOrdinal : null);
      return {
        planRevisionId,
        priorPlanVersionId: asString(row.prior_plan_version_id),
        priorOrdinal,
        nextOrdinal,
        trigger: asString(row.trigger_kind) as 'prepare' | 'inspect' | 'reconfirm' | 'plan-edit',
        detectedAt: asString(row.detected_at),
        changedFields,
        diff,
        proposed: record.proposed as unknown as MaterialPlanInputsProjection,
        state,
        supersedes,
        resolved: state !== 'pending',
        label: planRevisionLabel(priorOrdinal, nextOrdinal, changedFields, state),
      };
    });
  }

  /**
   * The material plan inputs a plan prepared **now** would freeze: the Main Editorial Role connection
   * (provider, model, adapter and configuration revisions, Credential Reference — never its readiness),
   * the highest pinned authority sidecar with its native carrier, the range the caller names, the
   * Book's latest Result Set Revision for an update Task, the launch's ceiling, and the outbound
   * category and expected outcome class this kind's plan builder and definition would declare. Read
   * leniently so a drifted pin or binding yields a diff rather than a refusal. The unit count is the
   * frozen Coverage Manifest's, so the policy's per-frozen-unit default resolves to the same total the
   * freeze wrote.
   *
   * This is the live half of the comparison; the frozen half is read from the plan components and the
   * Task Intent record (Issue #281). The two halves therefore differ whenever durable state moved —
   * a re-bound ceiling, a re-pinned sidecar, a contract that now promises another outcome class —
   * which is exactly when ADR 0009 suspends the plan for a Plan Revision.
   */
  #currentMaterialInputs(
    bookId: string,
    mode: AnalysisTaskMode,
    selectedRange: BaselineAnalysisSelectedRange | null,
    unitCount: number,
    /**
     * The ceiling the plan version's own edit sets (Issue #51, S16a): the editor's, which is the plan's to hold and never
     * a drift of it. The launch sets none outside developer-live, where the launch's is the one there is.
     */
    editorCeiling: RunBudgetCeilingState = 'unset',
    frozenProductionBinding?: MaterialPlanInputsProjection['providerBinding'],
    /** A 后台分析登记's Task: the Book's share of the Enrollment's ceiling, which replaces the editor's (Issue #864). */
    backgroundCeiling: BackgroundRunBudgetCeiling | null = null,
  ): MaterialPlanInputsProjection {
    const connection = this.#db.prepare(
      `SELECT provider_id, model_id, adapter_revision, configuration_revision, credential_reference
       FROM model_service_connections WHERE connection_id = 'main-editorial-deepseek-v4-pro'`,
    ).get() as SqlRow | undefined;
    // A live binding names its own route and reference; ordinary production's may be the Go row alone (Issue #811).
    requireAnalysis(frozenProductionBinding !== undefined || connection !== undefined || this.#launch.live !== null, 'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的凭据引用元数据。');
    // Drift is a comparison of like with like: the re-derivation must name the binding this launch
    // binds, exactly as the freeze did. Under developer-live that is the live route, its development
    // Credential Reference, and the launch form's ceiling — not the production connection row, whose
    // binding this scope never uses. Otherwise every developer-live plan would look drifted at once.
    const live = this.#launch.live;
    const latest = this.#isInitial(mode) ? undefined : this.#revisionRows(bookId).at(-1);
    return {
      ...this.#selectedPlanMetadata(),
      providerBinding: frozenProductionBinding ?? (live === null
        ? {
            providerId: asString(connection!.provider_id),
            // The denied production binding a development-ci plan freezes names the model Issue #712 named; since revision 72
            // the connection row names its route's current model instead, which no development-ci plan calls (Issue #811).
            modelId: 'deepseek-v4-pro',
            adapterRevision: asNumber(connection!.adapter_revision),
            configurationRevision: asNumber(connection!.configuration_revision),
            credentialReference: asString(connection!.credential_reference),
          }
        : {
            providerId: live.route,
            modelId: live.model,
            adapterRevision: 1,
            configurationRevision: 1,
            credentialReference: live.credentialReference,
          }),
      artifactPin: {
        identity: '@ai7/editorial-workspace-profile',
        version: '1.0.0',
        nativeCarrierSha256: NATIVE_CARRIER_DIGEST,
        sidecarRevision: 2,
        sidecarSha256: SIDECAR_DIGEST,
      },
      selectedRange: this.#definition.mode(mode).rangeBound ? selectedRange : null,
      predecessorRevision: latest === undefined ? null : { revisionId: asString(latest.revision_id), ordinal: asNumber(latest.ordinal), digest: asString(latest.sha256) },
      runBudgetCeiling: this.#planCeiling(unitCount, editorCeiling, backgroundCeiling),
      outboundDataCategory: this.#launch.operationalScope === 'ordinary-production' ? 'unpublished-excerpts' : 'public-or-synthetic',
      expectedOutcome: this.#definition.expectedOutcome,
    };
  }

  #selectedPlanMetadata(policy = this.#launch.policy): Pick<MaterialPlanInputsProjection, 'selectedPolicyIdentity' | 'localFixtureProfile'> {
    if (policy?.selectedPolicyIdentity === undefined) {
      requireAnalysis(!['v21', 'v22', 'v23', 'v24', 'v25', 'v26'].includes(policy?.activePolicySetVersion ?? '') && !['v29', 'v30', 'v31', 'v32', 'v33', 'v34', 'v35'].includes(policy?.providerProcessing.version ?? ''),
        'ANALYSIS_POLICY_UNAVAILABLE', '当前计划缺少已选处理策略身份。');
      return {};
    }
    const selected = selectedPolicyIdentityOf(policy.selectedPolicyIdentity);
    requireAnalysis(policy.integrityState === 'verified' && selected !== null && selected.providerProcessingVersion === policy.providerProcessing.version,
      'ANALYSIS_POLICY_UNAVAILABLE', '已选处理策略身份无效。');
    if (selected.providerProcessingVersion !== 'v29' || this.#route === null) return { selectedPolicyIdentity: selected };
    const runtime = this.#launch.localFixtureRuntime?.();
    requireAnalysis(runtime !== undefined && runtime !== null && canonicalJson(runtime.selectedPolicyIdentity) === canonicalJson(selected),
      'ANALYSIS_POLICY_UNAVAILABLE', '本地夹具策略目录缺失或不一致。');
    // Plan inputs are also re-derived to detect drift; a launch whose fixture cannot serve this kind must read as drift, not
    // fail the read. Execution still refuses an unserved fixture before any replay (LocalFixturePolicyCatalog.entriesFor).
    return { selectedPolicyIdentity: selected,
      localFixtureProfile: runtime.catalog.legacyProfile(selected, localFixtureRegisteredProfile(this.#definition.kind, null)) };
  }

  /**
   * The ceiling a plan freezes (Issue #51; ADR 0070; Issue #864): a 后台分析登记's Task its Book's share of the Enrollment's
   * ceiling — under developer-live the lower of that share and the launch's own — and every other Task the editor's outside
   * developer-live and the launch's under it.
   */
  #planCeiling(unitCount: number, editorCeiling: RunBudgetCeilingState, background: BackgroundRunBudgetCeiling | null): RunBudgetCeilingState {
    const live = this.#launch.live;
    const share = background === null ? null : { kind: 'tokens' as const, maxTotalTokens: background.maxTotalTokens };
    if (live === null || live.scope === 'ordinary-production') return share ?? editorCeiling;
    const launch = resolveDeveloperLiveCeiling(live.runBudgetCeiling, unitCount);
    return share === null || launch.maxTotalTokens < share.maxTotalTokens ? launch : share;
  }

  /**
   * Where the Book's primary manuscript stands now (Issue #95, S39): its branch, revision, journal and working digest — what a
   * `prospective` Background Analysis Enrollment compares with the text it was made against — and when the last confirmed edit
   * of the branch was made durable, whatever revision it was made on, so a checkpoint any Task takes never clears the
   * Enrollment's quiet period (#713 review, P2-1); `null` when the branch was never edited.
   */
  workingPointOf(bookId: string): { branchId: string; revisionId: string; journalSequence: number; workingDigest: string; lastEditAt: string | null } {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '图书标识无效。');
    const manuscript = this.#db.prepare("SELECT manuscript_id FROM manuscripts WHERE book_id = ? AND role = 'primary'").get(bookId) as SqlRow | undefined;
    requireAnalysis(manuscript !== undefined, 'ANALYSIS_RECORD_INVALID', '无法读取当前稿件工作状态。');
    const head = this.#workingHead(asString(manuscript.manuscript_id), bookId);
    const last = this.#db.prepare('SELECT max(durable_at) last FROM edit_journal_entries WHERE branch_id = ?').get(head.branchId) as SqlRow;
    return {
      branchId: head.branchId,
      revisionId: head.currentRevisionId,
      journalSequence: head.currentJournalSequence,
      workingDigest: head.currentWorkingDigest,
      lastEditAt: last.last === null ? null : asString(last.last),
    };
  }

  /**
   * The Book's latest Task the editor asked for — not one the 后台分析登记 dispatcher prepared (Issue #95, S39) — with when it was
   * made and the working text its Task Input checkpoint pinned, if it has one; `null` when the editor never asked for one.
   */
  latestEditorTaskOf(bookId: string): { taskIntentId: string; createdAt: string; checkpointDigest: string | null } | null {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '图书标识无效。');
    // One row, found by the record's own mark (#713 re-review, P3-3): never a walk over the Tasks the dispatcher made since.
    const row = this.#db.prepare(
      `SELECT * FROM analysis_task_intents WHERE book_id = ? AND kind = ?
         AND json_extract(canonical_json, '$.preparedByEnrollmentVersionId') IS NULL
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).get(bookId, this.#definition.kind) as SqlRow | undefined;
    if (row === undefined) return null;
    const intent = this.#intentFacts(row);
    requireAnalysis(intent.preparedByEnrollmentVersionId === null, 'ANALYSIS_RECORD_INVALID', '任务意图记录无效。');
    const checkpoint = this.#db.prepare('SELECT revision_digest FROM analysis_task_input_checkpoints WHERE task_intent_id = ?')
      .get(intent.taskIntentId) as SqlRow | undefined;
    return { taskIntentId: intent.taskIntentId, createdAt: intent.createdAt, checkpointDigest: checkpoint === undefined ? null : asString(checkpoint.revision_digest) };
  }

  /**
   * The Book's latest Task as the 后台分析登记 dispatcher weighs it, read without building a projection (#713 re-review, P3-3):
   * whose it is, the text its checkpoint pinned, whether its plan froze, whether it was authorized, and its Run's last state.
   */
  latestTaskFactsOf(bookId: string): null | {
    preparedByEnrollment: boolean; checkpointDigest: string | null; planned: boolean; authorized: boolean; runState: BaselineAnalysisRunState | null;
  } {
    const row = this.#latestIntentRow(bookId);
    if (row === undefined) return null;
    const intent = this.#intentFacts(row);
    const checkpoint = this.#db.prepare('SELECT revision_digest FROM analysis_task_input_checkpoints WHERE task_intent_id = ?')
      .get(intent.taskIntentId) as SqlRow | undefined;
    const planned = this.#db.prepare('SELECT 1 FROM analysis_plan_versions WHERE task_intent_id = ? LIMIT 1').get(intent.taskIntentId) !== undefined;
    const authorized = this.#db.prepare('SELECT 1 FROM analysis_run_authorizations WHERE task_intent_id = ?').get(intent.taskIntentId) !== undefined;
    const state = this.#db.prepare(
      `SELECT s.state FROM analysis_run_records r JOIN analysis_run_states s ON s.run_record_id = r.run_record_id
       WHERE r.task_intent_id = ? ORDER BY s.sequence DESC LIMIT 1`,
    ).get(intent.taskIntentId) as SqlRow | undefined;
    return {
      preparedByEnrollment: intent.preparedByEnrollmentVersionId !== null,
      checkpointDigest: checkpoint === undefined ? null : asString(checkpoint.revision_digest),
      planned,
      authorized,
      runState: state === undefined ? null : asString(state.state) as BaselineAnalysisRunState,
    };
  }

  /**
   * Whether the Book's latest Result Set Revision is current with the working text, read from its pin alone (#713 re-review,
   * P3-3): the same comparison `#freshness` makes for the latest revision, with no projection built.
   */
  analysisFreshnessOf(bookId: string): 'absent' | 'current' | 'stale' {
    const latest = this.#db.prepare(
      `SELECT r.manuscript_revision_id, r.manuscript_revision_digest FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal DESC LIMIT 1`,
    ).get(bookId, this.#definition.kind) as SqlRow | undefined;
    if (latest === undefined) return 'absent';
    const point = this.workingPointOf(bookId);
    return point.revisionId === asString(latest.manuscript_revision_id) && point.workingDigest === asString(latest.manuscript_revision_digest)
      ? 'current' : 'stale';
  }

  /** Whether any preparation of the Book is under way on this ledger (Issue #95, S39): the editor's or the dispatcher's. */
  preparationInFlight(bookId: string): boolean {
    return Array.from(this.#work.values()).some((work) => work.bookId === bookId);
  }

  /** Whether a preparation of the Book other than `workId` is under way: the dispatcher's own is never counted against it. */
  preparationInFlightBesides(bookId: string, workId: string | null): boolean {
    return Array.from(this.#work.values()).some((work) => work.bookId === bookId && work.workId !== workId);
  }

  /**
   * The facts a 默认执行规则 binds, as the Book's durable state reads now (Issue #421): the re-derivation Reconnect
   * Preflight compares a waiting Run's plan with, for an update of the whole Book. Outside developer-live the ceiling
   * depends on no unit count. Under it a rule is read only for writing's quick start, whose selected rule admits the
   * default-execution-rule origin (#810): every other kind is refused as before, and the writing ceiling resolves against
   * the units the next checkpoint would freeze — the primary manuscript's working blocks — as the freeze resolves it.
   */
  currentRuleFacts(bookId: string, mode: AnalysisTaskMode): MaterialPlanInputsProjection {
    const live = this.#launch.live;
    const liveWriting = live !== null && this.#definition.kind === WRITING_KIND && liveKindRule(this.#launch.policy, WRITING_KIND) !== null;
    // What a 后台分析登记 binds, under the selected policy's enrolled-background rule (Issue #864).
    const liveBackground = live !== null && this.#definition.kind === BASELINE_ANALYSIS_KIND &&
      liveKindRule(this.#launch.policy, BASELINE_ANALYSIS_KIND, [], 'background') !== null;
    requireAnalysis(UUID_PATTERN.test(bookId) && (live === null || liveWriting || liveBackground) && !this.#definition.mode(mode).rangeBound,
      'ANALYSIS_RULE_FACTS_INVALID', '无法读取默认执行规则所需的当前事实。');
    return this.#currentMaterialInputs(bookId, mode, null, liveWriting ? this.#workingUnitCount(bookId) : 0);
  }

  /** How many units a checkpoint of the Book's primary manuscript would freeze now: its working blocks' manifest. */
  #workingUnitCount(bookId: string): number {
    const manuscript = this.#db.prepare("SELECT manuscript_id FROM manuscripts WHERE book_id = ? AND role = 'primary'").get(bookId) as SqlRow | undefined;
    requireAnalysis(manuscript !== undefined, 'ANALYSIS_RULE_FACTS_INVALID', '无法读取默认执行规则所需的当前事实。');
    const manuscriptId = asString(manuscript.manuscript_id);
    const head = this.#workingHead(manuscriptId, bookId);
    return deriveCoverageManifest({
      bookId,
      manuscriptId,
      branchId: head.branchId,
      revisionId: head.currentRevisionId,
      revisionLabel: head.currentRevisionLabel,
      revisionDigest: head.currentWorkingDigest,
      blocks: this.readWorkingBlocks(head.branchId),
    }).units.length;
  }

  /** The reuse-plan counts a version would derive for the given range against the latest revision; `null` for a mode that carries no plan. */
  #reusePlanCountsFor(bookId: string, mode: AnalysisTaskMode, manifest: CoverageManifestProjection, selectedRange: BaselineAnalysisSelectedRange | null): AnalysisReusePlanCounts | null {
    if (!this.#carriesPlan(mode)) return null;
    const latestRow = this.#isInitial(mode) ? undefined : this.#revisionRows(bookId).at(-1);
    if (latestRow === undefined && !this.#isInitial(mode)) return null;
    return this.#derivePlan(
      mode,
      this.#definition.mode(mode).rangeBound ? selectedRange : null,
      manifest,
      latestRow === undefined ? null : this.#planPredecessor(latestRow),
    ).counts;
  }

  /**
   * One immutable Plan Revision row. `supersedes` names the pending revisions on the same prior
   * version this one settles and `revert` marks the way back to the frozen inputs; both are omitted
   * when they do not apply, so an ordinary drift row keeps exactly the canonical bytes it has always
   * had and no existing row is touched to record either fact (Issue #281).
   */
  #insertPlanRevision(input: {
    taskIntentId: string;
    prior: PlanVersionFacts;
    priorInputs: MaterialPlanInputsProjection;
    proposed: MaterialPlanInputsProjection;
    diff: ReadonlyArray<PlanRevisionDiffEntryProjection>;
    trigger: 'prepare' | 'inspect' | 'reconfirm' | 'plan-edit';
    instant: string;
    supersedes?: ReadonlyArray<string>;
    revert?: true;
    /** Who made an edit (Issue #419, PLAN-011): the editor, recorded with the time. */
    actor?: 'editor';
  }): string {
    const planRevisionId = randomUUID();
    const supersedes = input.supersedes === undefined || input.supersedes.length === 0 ? undefined : [...input.supersedes];
    const record = canonicalRecord({
      planRevisionId,
      taskIntentId: input.taskIntentId,
      priorPlanVersionId: input.prior.planVersionId,
      priorOrdinal: input.prior.ordinal,
      trigger: input.trigger,
      detectedAt: input.instant,
      prior: input.priorInputs,
      proposed: input.proposed,
      diff: input.diff,
      supersedes,
      revert: input.revert,
      actor: input.actor,
    });
    this.#db.prepare(
      `INSERT INTO analysis_plan_revisions(plan_revision_id, task_intent_id, prior_plan_version_id, prior_ordinal, trigger_kind, detected_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(planRevisionId, input.taskIntentId, input.prior.planVersionId, input.prior.ordinal, input.trigger, input.instant, record.json, record.digest);
    return planRevisionId;
  }

  /**
   * A prepared, unauthorized Task prepared again (Issue #48). The same material inputs return the
   * frozen plan. Different inputs — a different `重新分析所选范围` range, or durable-state drift of the
   * Provider Binding, artifact pin, ceiling, category, or outcome — record one pending Plan Revision
   * with its field-level diff and the derived reuse-plan counts; the prepared version is thereby
   * superseded and cannot be authorized. `重新确认计划` (`reconfirm`) resolves the pending revision — or
   * records the live drift as one — and writes the next plan version on the same Task Intent.
   *
   * There is also a way back (Issue #281). Proposing the inputs the frozen version already holds — by
   * preparing again at them, or by reconfirming while they stand — records the revert as its own
   * append-only revision, settles the pending one, and restores the start action on the version that
   * was never replaced. No plan version is written for a revert: its envelope would repeat the frozen
   * one, and a plan version's envelope digest is unique. A second differing proposal settles the first
   * the same way, so at most one revision is ever pending on a version.
   */
  #revisePreparedPlan(
    bookId: string,
    intent: IntentFacts,
    existing: AnalysisProjection,
    requestedRange: BaselineAnalysisSelectedRange | null,
    reconfirm: boolean,
  ): AnalysisProjection {
    const current = this.#planVersionFacts(intent.taskIntentId).at(-1);
    requireAnalysis(current !== undefined && existing.planVersion !== null && existing.coverageManifest !== null, 'ANALYSIS_RECORD_INVALID', '任务计划缺少计划版本。');
    const stored = existing.planVersion.materialInputs;
    const pending = existing.planRevision;
    const instant = new Date().toISOString();
    const manifest = existing.coverageManifest;
    const proposed = this.#currentMaterialInputs(bookId, intent.mode, requestedRange, manifest.units.length,
      planEditCeiling(this.#planEditsOf(intent.taskIntentId, current.ordinal)), undefined, intent.backgroundRunBudgetCeiling);
    const storedCounts = existing.update?.reusePlan?.counts ?? null;
    const countsFor = (inputs: MaterialPlanInputsProjection): AnalysisReusePlanCounts | null =>
      this.#reusePlanCountsFor(bookId, intent.mode, manifest, inputs.selectedRange);
    const withDerived = (
      entries: PlanRevisionDiffEntryProjection[],
      priorCounts: AnalysisReusePlanCounts | null,
      proposedCounts: AnalysisReusePlanCounts | null,
    ): PlanRevisionDiffEntryProjection[] => {
      const derived = priorCounts === null || proposedCounts === null ? null : reusePlanCountsDiffEntry(priorCounts, proposedCounts);
      return derived === null ? entries : [...entries, derived];
    };
    const diffFor = (): PlanRevisionDiffEntryProjection[] =>
      withDerived(diffMaterialPlanInputs(stored, proposed), storedCounts, countsFor(proposed));
    // The pending revisions this proposal settles: every one still waiting on the frozen version.
    const pendingIds = existing.planRevisions
      .filter((entry) => entry.state === 'pending' && entry.planRevisionId !== null && entry.priorPlanVersionId === current.planVersionId)
      .map((entry) => entry.planRevisionId!);
    // The way back: the proposal restates the frozen version's own inputs while a revision is pending.
    // The record reads from the abandoned proposal back to what stands, which is what the editor sees.
    const insertRevert = (trigger: 'prepare' | 'reconfirm'): void => {
      const abandoned = pending!.proposed;
      const diff = withDerived(diffMaterialPlanInputs(abandoned, proposed), countsFor(abandoned), storedCounts);
      transact(this.#db, () => this.#insertPlanRevision({
        taskIntentId: intent.taskIntentId, prior: current, priorInputs: abandoned, proposed, diff, trigger, instant, supersedes: pendingIds, revert: true,
      }));
    };
    if (!reconfirm) {
      if (sameMaterialPlanInputs(stored, proposed)) {
        if (pending === null || pendingIds.length === 0) return existing;
        insertRevert('prepare');
        return this.inspect(bookId);
      }
      if (pending !== null && pending.planRevisionId !== null && sameMaterialPlanInputs(pending.proposed, proposed)) return existing;
      const diff = diffFor();
      requireAnalysis(!diff.some((entry) => entry.field === 'predecessorRevision'), 'ANALYSIS_PREDECESSOR_DRIFT',
        '该任务的前一修订版已不再是结果集的最新修订版；请基于最新修订版重新准备更新。');
      transact(this.#db, () => this.#insertPlanRevision({
        taskIntentId: intent.taskIntentId, prior: current, priorInputs: stored, proposed, diff, trigger: 'prepare', instant, supersedes: pendingIds,
      }));
      return this.inspect(bookId);
    }
    requireAnalysis(pending !== null, 'ANALYSIS_PLAN_REVISION_ABSENT', '当前计划没有待重新确认的计划修订。');
    requireAnalysis(existing.actions.canReconfirmPlan, 'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；请基于最新修订版重新准备更新。');
    if (pendingIds.length > 0 && sameMaterialPlanInputs(stored, proposed)) {
      insertRevert('reconfirm');
      return this.inspect(bookId);
    }
    requireAnalysis(sameMaterialPlanInputs(pending.proposed, proposed), 'ANALYSIS_PLAN_REVISION_STALE', '计划修订已过期；请重新查看计划修订后再确认。');
    const checkpointRow = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpointRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    const checkpoint: ManuscriptCheckpointBinding = {
      bookId,
      manuscriptId: asString(checkpointRow.manuscript_id),
      branchId: asString(checkpointRow.branch_id),
      revisionId: asString(checkpointRow.revision_id),
      revisionLabel: asString(checkpointRow.revision_label),
      revisionDigest: asString(checkpointRow.revision_digest),
      journalSequence: asNumber(checkpointRow.journal_sequence),
      createdForDirtyJournal: asNumber(checkpointRow.created_for_dirty_journal) === 1,
    };
    transact(this.#db, () => {
      // A live drift has no stored row yet: recording it here names `inspect`, the read that detected
      // it, rather than the reconfirmation that is settling it (Issue #281).
      const planRevisionId = pending.planRevisionId ??
        this.#insertPlanRevision({ taskIntentId: intent.taskIntentId, prior: current, priorInputs: stored, proposed, diff: diffFor(), trigger: 'inspect', instant });
      this.#writePlanVersion({
        intent,
        checkpoint,
        checkpointDigest: asString(checkpointRow.sha256),
        ordinal: current.ordinal + 1,
        selectedRange: proposed.selectedRange,
        planRevisionId,
        instant,
        // What the editor left out stays out: the new version answers the key-content change, not the edit.
        edits: this.#planEditsOf(intent.taskIntentId, current.ordinal),
      });
    });
    return this.inspect(bookId);
  }

  /** What one plan version leaves out at the editor's word (Issue #419), read from its frozen execution plan. */
  #planEditsOf(taskIntentId: string, ordinal: number): PlanEdits {
    const row = this.#db.prepare(
      "SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ? AND component = 'execution-plan'",
    ).get(taskIntentId, ordinal) as SqlRow | undefined;
    if (row === undefined) return NO_PLAN_EDITS;
    try {
      return planEditsOf(parseCanonicalJson(asString(row.canonical_json)));
    } catch {
      throw new AnalysisError('ANALYSIS_RECORD_INVALID', '计划记录的修改无效。');
    }
  }

  /**
   * 更新计划 (Issue #419, plan slice S73; V2-UX-PLAN-009, PLAN-011): the plan the editor sees, as they left it, becomes
   * the next plan version of the same Task Intent. `edits` is the full set of what the plan leaves out — only what its
   * Run honours — against the version whose envelope digest the editor was reading. One transaction records the Plan
   * Revision, whose trigger is `plan-edit`, whose diff names each changed item as `edited`, and which carries the
   * editor as its actor with the time, and writes the version it yields. The material inputs are the prior version's.
   *
   * Nothing is recorded when the Task has been authorized, a key-content change is pending (重新确认计划 settles it
   * first; the editor's pending edits are theirs to apply after), the editor was reading another version, the edit
   * names what the plan cannot leave out, or nothing changed. An edit changes the execution plan and the envelope
   * only — and, when it sets the Run Budget Ceiling (Issue #51, S16a), that one field of the Provider Resolution Plan: a
   * version whose other components would differ — the route or the fixture this launch binds has moved since the plan
   * froze — is refused rather than written. Under developer-live the launch sets the ceiling, so no edit does.
   */
  editPlan(
    bookId: string,
    input: {
      taskIntentId: string;
      planEnvelopeDigest: string;
      removedSteps: unknown;
      disallowedAdaptations: unknown;
      askFirstAdaptations?: unknown;
      runBudgetCeiling?: unknown;
      evidenceAssuranceLevel?: unknown;
    },
  ): AnalysisProjection {
    const existing = this.inspect(bookId);
    const intentRow = this.#latestIntentRow(bookId);
    requireAnalysis(intentRow !== undefined && existing.taskIntent !== null && existing.taskIntent.taskIntentId === input.taskIntentId,
      'ANALYSIS_PLAN_EDIT_STALE', '这项任务已不是这本书当前的任务；请重新打开它的计划。');
    const intent = this.#intentFacts(intentRow);
    requireAnalysis(existing.authorization === null && existing.state === 'prepared',
      'ANALYSIS_PLAN_EDIT_STARTED', '任务已经开始，计划不能再改。');
    requireAnalysis(existing.planRevision === null, 'ANALYSIS_PLAN_REVISION_PENDING', '计划的关键内容已变化：先重新确认计划，你的改动会保留。');
    requireAnalysis(existing.planEnvelope !== null && existing.planEnvelope.digest === input.planEnvelopeDigest && existing.planVersion !== null,
      'ANALYSIS_PLAN_EDIT_STALE', '计划已经变了；请重新查看计划后再修改。');
    // The Evidence Assurance Level is a factual-review Task's term alone (Issue #901); left out, the version keeps its own.
    requireAnalysis(input.evidenceAssuranceLevel === undefined || this.#definition.kind === FACTUAL_REVIEW_KIND,
      'ANALYSIS_PLAN_EDIT_INVALID', '只有事实核查任务有证据保证级别。');
    const next = canonicalPlanEdits({ ...input, evidenceAssuranceLevel: input.evidenceAssuranceLevel ?? existing.planVersion?.edits.evidenceAssuranceLevel });
    requireAnalysis(next !== null, 'ANALYSIS_PLAN_EDIT_INVALID', '这项修改不在这份计划可以改的范围内。');
    if (isRecord(intent.record.factualDecision)) requireAnalysis(planEditAssuranceLevel(next) === intent.record.factualDecision.level || planEditAssuranceLevel(next) === 'strict',
      'ANALYSIS_PLAN_EDIT_INVALID', '补充核查不能降低编辑决定要求的核查级别。');
    requireAnalysis(!levelBelowPolicyMinimum(planEditAssuranceLevel(next)), 'ANALYSIS_PLAN_EDIT_INVALID', FACTUAL_POLICY_MINIMUM_REASON);
    requireAnalysis(this.#definition.assurance !== null || next.removedSteps.length === 0,
      'ANALYSIS_PLAN_EDIT_INVALID', '这项任务没有核对与抽检步骤，不能修改该步骤。');
    requireAnalysis(this.#definition.kind === BASELINE_ANALYSIS_KIND || (next.askFirstAdaptations ?? []).length === 0,
      'ANALYSIS_PLAN_EDIT_INVALID', '这项任务暂不能把安全重试改成先问你。');
    requireAnalysis(!launchSetsCeilingOf(this.#launch.live) || next.runBudgetCeiling === undefined, 'ANALYSIS_PLAN_EDIT_INVALID', PLAN_CEILING_LAUNCH_REASON);
    const current = this.#planVersionFacts(intent.taskIntentId).at(-1);
    requireAnalysis(current !== undefined && current.ordinal === existing.planVersion.ordinal, 'ANALYSIS_RECORD_INVALID', '任务计划缺少计划版本。');
    const prior = this.#planEditsOf(intent.taskIntentId, current.ordinal);
    const diff = planEditDiff(prior, next);
    requireAnalysis(diff.length > 0, 'ANALYSIS_PLAN_EDIT_UNCHANGED', '计划没有改动。');
    const checkpointRow = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpointRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    const checkpoint: ManuscriptCheckpointBinding = {
      bookId,
      manuscriptId: asString(checkpointRow.manuscript_id),
      branchId: asString(checkpointRow.branch_id),
      revisionId: asString(checkpointRow.revision_id),
      revisionLabel: asString(checkpointRow.revision_label),
      revisionDigest: asString(checkpointRow.revision_digest),
      journalSequence: asNumber(checkpointRow.journal_sequence),
      createdForDirtyJournal: asNumber(checkpointRow.created_for_dirty_journal) === 1,
    };
    const stored = existing.planVersion.materialInputs;
    // The connection's credential readiness is not key content: it may change after the plan froze, and the version an
    // edit writes keeps the one the edited version froze, so only the execution plan and the envelope differ.
    const priorProvider = this.#planRecords(intent.taskIntentId, intent.mode, current.ordinal)['provider-resolution-plan'] as
      { remoteBinding: { credentialReadiness: ModelCredentialOperationState } };
    // The ceiling is a material input: the version this edit yields proposes the editor's (Issue #51, S16a).
    const proposed: MaterialPlanInputsProjection = { ...stored, runBudgetCeiling: !launchSetsCeilingOf(this.#launch.live) ? planEditCeiling(next) : stored.runBudgetCeiling };
    const ceilingMoved = canonicalJson(stored.runBudgetCeiling) !== canonicalJson(proposed.runBudgetCeiling);
    const instant = new Date().toISOString();
    transact(this.#db, () => {
      const planRevisionId = this.#insertPlanRevision({
        taskIntentId: intent.taskIntentId, prior: current, priorInputs: stored, proposed, diff, trigger: 'plan-edit', instant, actor: 'editor',
      });
      this.#writePlanVersion({
        intent,
        checkpoint,
        checkpointDigest: asString(checkpointRow.sha256),
        ordinal: current.ordinal + 1,
        selectedRange: stored.selectedRange,
        planRevisionId,
        instant,
        edits: next,
        credentialReadiness: priorProvider.remoteBinding.credentialReadiness,
      });
      const before = this.#planDigests(intent.taskIntentId, current.ordinal);
      const after = this.#planDigests(intent.taskIntentId, current.ordinal + 1);
      // A ceiling the editor moved moves the Provider Resolution Plan too — in that one field, and nothing else. A factual
      // Task's Evidence Assurance Level (Issue #901) moves its research declaration: the web tools backend the plan freezes and
      // the provider plan's naming of it, and nothing else.
      const levelMoved = planEditAssuranceLevel(prior) !== planEditAssuranceLevel(next);
      const providerMoved = (ceilingMoved || levelMoved) && !this.#providerPlansDifferOnlyIn(intent.taskIntentId, current.ordinal, ceilingMoved, levelMoved);
      const moved = Object.keys({ ...before, ...after }).filter((component) =>
        component !== 'execution-plan' && component !== 'plan-envelope' && before[component] !== after[component] &&
        (component !== 'web-tools-backend' || !levelMoved) &&
        (component !== 'provider-resolution-plan' || !(ceilingMoved || levelMoved) || providerMoved));
      requireAnalysis(moved.length === 0, 'ANALYSIS_PLAN_EDIT_STALE', '这份计划准备之后，执行它的路由或所用工序已经变了；请重新准备这项任务再修改。');
    });
    return this.inspect(bookId);
  }

  /**
   * The Book's latest Task **of this ledger's kind**. The kind filter is what lets a Book hold both
   * kinds at once: without it the factual Task a Book gained would be handed to the baseline
   * projection, which would then read a plan frozen under a contract it does not speak.
   */
  #latestIntentRow(bookId: string): SqlRow | undefined {
    return this.#db.prepare(
      'SELECT * FROM analysis_task_intents WHERE book_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    ).get(bookId, this.#definition.kind) as SqlRow | undefined;
  }

  /** A mode that starts a Result Set rather than updating one; the kind's definition decides which. */
  #isInitial(mode: AnalysisTaskMode): boolean {
    return this.#recordedMode(mode).initial;
  }

  /** History keeps its intent vocabulary when today's model/policy is unconfigured.
   * Preparation still uses the current definition's admitted modes and update controls. */
  #recordedMode(mode: AnalysisTaskMode) {
    return this.#definition.modes.find(entry => entry.mode === mode)
      ?? (this.#definition.kind === FACTUAL_REVIEW_KIND ? FACTUAL_CLAIM_UPDATE_MODES.find(entry => entry.mode === mode) : undefined)
      ?? this.#definition.mode(mode);
  }

  /**
   * A mode whose Task freezes a `reuse-plan` component: every update mode, and a range-bound first
   * mode (Issue #417), whose plan has no predecessor and says which units are read and which are left
   * unreviewed. Only a whole first Task carries none — it reads every unit, and there is nothing to plan.
   */
  #carriesPlan(mode: AnalysisTaskMode): boolean {
    const definition = this.#recordedMode(mode);
    return !definition.initial || definition.rangeBound;
  }

  /**
   * Derive the plan of one mode over one manifest. Which derivation is the kind's to say: a kind that
   * leaves out-of-scope units unreviewed gets the scope plan, and the baseline kind gets the reuse plan
   * it has always had, from the same untouched function and therefore with the same bytes.
   */
  #currentEditorialMemory(bookId: string): EditorialMemorySnapshot | null {
    // Category review keeps its existing exact preference pins, assembled by the same memory builder.
    return this.#definition.kind.startsWith('editorial-review/') || this.#launch.operationalScope !== 'ordinary-production' ||
      this.#launch.policy?.providerProcessing.version !== 'v35' ? null : this.#launch.editorialMemory?.(bookId, this.#definition.kind) ?? null;
  }

  #selectedDefinition(base: AnalysisKindDefinition, bookId: string): AnalysisKindDefinition {
    const pin = selectedProcedureForBook(this.#db, bookId, base.kind);
    return withEditorialMemoryDefinition(pin === null ? base : ((member) => withProcedureDefinition(base, member.document, member.pin))(resolveProcedureForKind(this.#db, pin, base.kind)),
      this.#currentEditorialMemory(bookId));
  }

  #derivePlan(
    mode: AnalysisTaskMode,
    selectedRange: BaselineAnalysisSelectedRange | null,
    manifest: CoverageManifestProjection,
    predecessor: ReusePlanPredecessor | ScopePlanPredecessor | null,
    definition = this.#selectedDefinition(this.#planDefinition(NO_PLAN_EDITS, mode), manifest.manuscript.bookId),
  ): AnalysisPlanRecord {
    const prior = predecessor === null ? null : this.#revisionBody(this.#revisionRowById(predecessor.revisionId));
    const priorDefinition = prior === null ? null : this.definitionForDigest(String((prior.bindingPin as Record<string, unknown>).promptContractDigest));
    const procedureCompatible = definition.procedureBinding === undefined && priorDefinition?.procedureBinding === undefined ||
      prior?.schemaDigest === definition.schemaDigest;
    if (this.#definition.outOfScope === 'leave-unreviewed') {
      requireAnalysis(predecessor === null || 'schemaDigest' in predecessor, 'ANALYSIS_RECORD_INVALID', '前一修订版缺少审阅范围计划所需的事实。');
      return deriveScopePlan({
        procedureCompatible,
        kind: this.#definition.kind,
        contractVersion: this.#definition.contractVersion,
        schemaDigest: this.#definition.kind === FACTUAL_REVIEW_KIND ? definition.schemaDigest : this.#definition.schemaDigest,
        ...(this.#definition.contractIdentity?.categoryConfiguration === undefined ? {} : { categoryConfigurationIdentity: canonicalJson(this.#definition.contractIdentity.categoryConfiguration) }),
        mode,
        recompute: this.#definition.mode(mode).recompute,
        selectedRange,
        manifest,
        predecessor: predecessor as ScopePlanPredecessor | null,
      });
    }
    requireAnalysis(predecessor !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
    return deriveReusePlan({ procedureCompatible, mode: mode as BaselineAnalysisUpdateMode, selectedRange, manifest, predecessor });
  }

  /** The counts a whole first Task's revision states: every unit read, none reused. */
  #wholeFirstCounts(unitCount: number): AnalysisReusePlanCounts | ReviewScopePlanCounts {
    const counts = firstBaselineCounts(unitCount);
    return this.#definition.outOfScope === 'leave-unreviewed' ? { ...counts, unreviewed: 0 } : counts;
  }

  #intentFacts(row: SqlRow): IntentFacts {
    const mode = asString(row.mode) as AnalysisTaskMode;
    const goal = asString(row.goal);
    const record = parseCanonicalJson(asString(row.canonical_json));
    // A Task promoted from a draft holds the draft's sentence (Issue #423, slice 7a); every other Task its mode's fixed goal.
    const intentDraftVersionId = isRecord(record) && typeof record.intentDraftVersionId === 'string' && UUID_PATTERN.test(record.intentDraftVersionId)
      ? record.intentDraftVersionId : null;
    requireAnalysis(isRecord(record) && (record.intentDraftVersionId === undefined || intentDraftVersionId !== null) &&
      (intentDraftVersionId === null ? goal === this.#recordedMode(mode).goal ||
        this.#definition.kind === FACTUAL_REVIEW_KIND && goal === FACTUAL_CLAIM_UPDATE_MODES.find(entry => entry.mode === mode)?.goal
        : isDraftGoal(goal) && record.goal === goal),
    'ANALYSIS_RECORD_INVALID', '任务意图的目标与更新方式不一致。');
    requireAnalysis(isRecord(record) && record.taskIntentId === row.task_intent_id && typeof record.expectedOutcome === 'string' &&
      (record.redoOfRunRecordId === undefined || (typeof record.redoOfRunRecordId === 'string' && UUID_PATTERN.test(record.redoOfRunRecordId))) &&
      (record.preparedByEnrollmentVersionId === undefined ||
        (typeof record.preparedByEnrollmentVersionId === 'string' && UUID_PATTERN.test(record.preparedByEnrollmentVersionId) && record.redoOfRunRecordId === undefined)) &&
      // Only the dispatcher's Task carries the ceiling its Enrollment holds it to (Issue #864).
      (record.backgroundRunBudgetCeiling === undefined ||
        (record.preparedByEnrollmentVersionId !== undefined && isBackgroundRunBudgetCeiling(record.backgroundRunBudgetCeiling))),
    'ANALYSIS_RECORD_INVALID', '任务意图记录无效。');
    const start = row.selected_start_position;
    const end = row.selected_end_position;
    return {
      taskIntentId: asString(row.task_intent_id),
      bookId: asString(row.book_id),
      mode,
      goal,
      createdAt: asString(row.created_at),
      predecessorRevisionId: row.predecessor_revision_id === null ? null : asString(row.predecessor_revision_id),
      selectedRange: start === null || end === null ? null : { startPosition: asNumber(start), endPosition: asNumber(end) },
      record,
      expectedOutcome: record.expectedOutcome,
      redoOfRunRecordId: record.redoOfRunRecordId === undefined ? null : record.redoOfRunRecordId as string,
      preparedByEnrollmentVersionId: record.preparedByEnrollmentVersionId === undefined ? null : record.preparedByEnrollmentVersionId as string,
      backgroundRunBudgetCeiling: record.backgroundRunBudgetCeiling === undefined ? null : record.backgroundRunBudgetCeiling as BackgroundRunBudgetCeiling,
      intentDraftVersionId,
      intentDraftParagraphs: isRecord(record) && Number.isSafeInteger(record.intentDraftParagraphs) && (record.intentDraftParagraphs as number) > 0
        ? record.intentDraftParagraphs as number : null,
    };
  }

  /** The Task the Run a redo names belongs to (Issue #422, S76c); refused when the record is not there. */
  #redoneTaskIntentId(runRecordId: string): string {
    const row = this.#db.prepare('SELECT task_intent_id FROM analysis_run_records WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '改计划重做所接续的运行记录缺失。');
    return asString(row.task_intent_id);
  }

  /**
   * What a redo's first plan version leaves out (Issue #422, S76c; CONT-013: a redo begins from a copyable prior plan):
   * the edits of the redone Task's last plan version; nothing for any other Task.
   */
  #redoPlanEdits(intent: IntentFacts): PlanEdits {
    if (isRecord(intent.record.factualDecision)) return intent.record.factualDecision.level === 'strict'
      ? { ...NO_PLAN_EDITS, evidenceAssuranceLevel: 'strict' } : NO_PLAN_EDITS;
    if (intent.redoOfRunRecordId === null) return NO_PLAN_EDITS;
    const prior = this.#redoneTaskIntentId(intent.redoOfRunRecordId);
    const last = this.#planVersionFacts(prior).at(-1);
    return last === undefined ? NO_PLAN_EDITS : this.#planEditsOf(prior, last.ordinal);
  }

  /** The frozen plan components of one plan version of a Task; an update Task must also carry its `reuse-plan`. */
  #planRecords(taskIntentId: string, mode: AnalysisTaskMode | 'any', planVersion: number): Record<string, unknown> {
    const rows = this.#db.prepare('SELECT component, canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ?').all(taskIntentId, planVersion) as SqlRow[];
    const records: Record<string, unknown> = {};
    for (const row of rows) records[asString(row.component)] = parseCanonicalJson(asString(row.canonical_json));
    const required = ['manuscript-pin', 'artifact-pin', 'run-source-scope', 'coverage-manifest', 'provider-resolution-plan', 'execution-plan', 'plan-envelope'];
    if (mode !== 'any' && this.#carriesPlan(mode)) required.push('reuse-plan');
    for (const component of required) {
      requireAnalysis(records[component] !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
    }
    requireAnalysis(isRecord(records['provider-resolution-plan']), 'ANALYSIS_RECORD_INVALID', '处理策略计划记录无效。');
    providerPlanPolicyMetadata(records['provider-resolution-plan']);
    const envelope = records['plan-envelope'] as Record<string, unknown>;
    const route = (records['provider-resolution-plan'] as { executionRoute?: { kind: string; model: string; fixtureIdentity?: string; fixtureSha256?: string } }).executionRoute;
    if (route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE || envelope.compositionVersion === 3 || envelope.compositionVersion === 4) {
      const stock = reviewCategoryEntry('typos-and-usage')!;
      const definition = withModelClarification(reviewCategoryKindDefinition(reviewCategoryContractInput(stock), 2, STOCK_TYPOS_LEAF_LOCAL_TOOLS));
      const options = envelope.compositionOptions as CompositionOptions | undefined;
      const procedure = resolveProcedureDefinition(this.#db, 'ai7-procedure/review-typos-and-usage', 2);
      requireAnalysis((envelope.compositionVersion === 3 || envelope.compositionVersion === 4) && route !== undefined && options?.version === envelope.compositionVersion &&
        (mode === 'any' || mode === 'review-first') && envelope.promptContractDigest === definition.promptContractDigest &&
        canonicalJson(options.subagents) === canonicalJson(options.version === 4 ? STOCK_TYPOS_FANOUT : STOCK_TYPOS_LEAF) &&
        canonicalJson(options.localTools) === canonicalJson(STOCK_TYPOS_LEAF_LOCAL_TOOLS) &&
        canonicalJson(options.sources) === canonicalJson({ baseline: null, guidelines: stock.guidelineDocuments.map(({ documentId, version, clauses }) => ({ documentId, version, clauses })), terms: [] }) &&
        procedure !== null && canonicalJson(options.procedure) === canonicalJson(procedure.pin) &&
        canonicalJson(options.stages) === canonicalJson(procedure.document.stages.map((stage, index) => ({ ordinal: index + 1, stageType: stage.stageType, digest: sha256Hex(canonicalJson(stage)) }))) &&
        (route.kind !== LOCAL_DETERMINISTIC_ROUTE || route.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE),
      'ANALYSIS_CHILD_PROFILE_REFUSED', '冻结的单元子代理配置不属于固定标准审阅。');
      requireAnalysis(describeComposition(route.kind as ExecutionRouteId, route.model, definition.promptContractDigest, options).digest === envelope.behaviorCompositionDigest,
        'ANALYSIS_CHILD_PROFILE_REFUSED', '冻结的单元子代理组合摘要不一致。');
    }
    if (envelope.webToolsBackendDigest !== undefined) {
      const backend = records['web-tools-backend'];
      const provider = records['provider-resolution-plan'] as Record<string, unknown>;
      requireAnalysis(isRecord(backend) && canonicalRecord(backend).digest === envelope.webToolsBackendDigest && canonicalJson(backend) === canonicalJson(provider.webToolsBackend),
        'ANALYSIS_RECORD_INVALID', '联网检索冻结记录与计划信封不一致。');
    }
    return records;
  }

  #planDigests(taskIntentId: string, planVersion: number): Record<string, string> {
    return Object.fromEntries((this.#db.prepare('SELECT component, sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ?').all(taskIntentId, planVersion) as SqlRow[])
      .map((row) => [asString(row.component), asString(row.sha256)]));
  }

  /** Whether one version's Provider Resolution Plan and the next differ in the Run Budget Ceiling alone (Issue #51, S16a). */
  #providerPlansDifferOnlyIn(taskIntentId: string, priorOrdinal: number, ceiling: boolean, tools: boolean): boolean {
    const sansCeiling = (ordinal: number): string => {
      const row = this.#db.prepare(
        "SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ? AND component = 'provider-resolution-plan'",
      ).get(taskIntentId, ordinal) as SqlRow | undefined;
      requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
      const record = parseCanonicalJson(asString(row.canonical_json));
      requireAnalysis(isRecord(record), 'ANALYSIS_RECORD_INVALID', '任务计划记录图不完整。');
      const { webToolsBackend: _backend, searchCredentialReference: _reference, webToolsFallback: _fallback, ...rest } = record as Record<string, unknown>;
      const kept = tools ? rest : record;
      return canonicalJson(ceiling ? { ...kept, runBudgetCeiling: null } : kept);
    };
    return sansCeiling(priorOrdinal) === sansCeiling(priorOrdinal + 1);
  }

  #runProjection(runRecord: SqlRow, progress: ProgressReader): NonNullable<BaselineAnalysisProjection['run']> {
    const runRecordId = asString(runRecord.run_record_id);
    const states = this.#db.prepare('SELECT * FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence').all(runRecordId) as SqlRow[];
    requireAnalysis(states.length >= 1, 'ANALYSIS_RECORD_INVALID', '运行记录缺少状态转换。');
    const transitions = states.map((row) => {
      const detail = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      return {
        sequence: asNumber(row.sequence),
        state: asString(row.state) as BaselineAnalysisRunState,
        recordedAt: asString(row.recorded_at),
        detail: typeof detail.detail === 'string' ? detail.detail : null,
      };
    });
    const current = transitions[transitions.length - 1]!;
    const resumedAt = current.state === 'resumable'
      ? states.reduce<string | undefined>((latest, row) => {
        const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
        return record.resumed === true ? asString(row.recorded_at) : latest;
      }, undefined)
      : undefined;
    // A blocked Run states the reasons its own state transition recorded, not the reasons the launch
    // running right now would state: a Run blocked under development-ci keeps that reading forever,
    // exactly as a Result Set Revision keeps its own policy pin. Only a record written before those
    // reasons were durable falls back to the bound launch.
    const currentRecord = parseCanonicalJson(asString(states[states.length - 1]!.canonical_json)) as Record<string, unknown>;
    const stopReason = current.state === 'resumable' ? resumableStopReasonOf(currentRecord) : undefined;
    const recordedReasons = Array.isArray(currentRecord.reasons) && currentRecord.reasons.every((reason) => typeof reason === 'string')
      ? currentRecord.reasons as ReadonlyArray<string>
      : null;
    const attemptRow = this.#db.prepare('SELECT * FROM analysis_execution_attempts WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    let attempt: NonNullable<BaselineAnalysisProjection['run']>['attempt'] = null;
    if (attemptRow !== undefined) {
      const attemptId = asString(attemptRow.attempt_id);
      const attemptJson = parseCanonicalJson(asString(attemptRow.canonical_json)) as Record<string, unknown>;
      const check = attemptJson.credentialReadinessCheck as { slot: CredentialSlotId; readiness: 'present' | 'missing' };
      const bindingRow = this.#db.prepare('SELECT * FROM analysis_execution_bindings WHERE attempt_id = ?').get(attemptId) as SqlRow | undefined;
      const spans = (this.#db.prepare('SELECT * FROM analysis_harness_spans WHERE attempt_id = ? ORDER BY ordinal').all(attemptId) as SqlRow[]).map((row) => {
        const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
        return {
          ordinal: asNumber(row.ordinal),
          harnessSessionId: asString(row.harness_session_id),
          startSeq: asNumber(row.start_seq),
          endSeq: asNumber(row.end_seq),
          unitOrdinal: row.unit_ordinal === null ? null : asNumber(row.unit_ordinal),
          attemptIndex: typeof record.attemptIndex === 'number' ? record.attemptIndex : 1,
          payloadDigest: typeof record.payloadDigest === 'string' ? record.payloadDigest : null,
          unitMessageDigest: typeof record.unitMessageDigest === 'string' ? record.unitMessageDigest : null,
        };
      });
      if (this.requestAdmissionOf(runRecordId)?.width === 3) spans.sort((left, right) =>
        (left.unitOrdinal ?? Number.MAX_SAFE_INTEGER) - (right.unitOrdinal ?? Number.MAX_SAFE_INTEGER) || left.ordinal - right.ordinal);
      attempt = {
        attemptId,
        ordinal: 1,
        startedAt: asString(attemptRow.started_at),
        credentialReadinessCheck: { slot: check.slot, readiness: check.readiness, valueReleased: false },
        executionBinding: bindingRow === undefined ? null : this.#bindingProjection(bindingRow),
        spans,
      };
    }
    const adaptations = this.adaptationsOf(runRecordId);
    // The liveness signal's fifth fact: when this Run last changed state. The execution owner cannot
    // hold it — it is the ledger's transition, read here already — so the projection composes it onto
    // the four facts the owner does hold. A Run with no owner in flight keeps today's `null`.
    // A Run stopping at the editor's cancellation is still in flight: its signal is read until it has stopped.
    const live = current.state === 'admitted' || current.state === 'executing' || current.state === 'cancelling' || current.state === 'pausing'
      ? progress(runRecordId)
      : null;
    // Why a Run blocked before dispatch never ran (Issue #536): only Reconnect Preflight records `plan-moved`.
    const blockedBy = current.state === 'blocked-before-dispatch' ? (currentRecord.cause === 'plan-moved' ? 'plan-moved' : 'launch') : null;
    return {
      runRecordId,
      procedure: (parseCanonicalJson(asString(runRecord.canonical_json)) as { procedure?: ProcedureDefinitionPin }).procedure ?? null,
      state: current.state,
      ...(stopReason === undefined ? {} : { stopReason }),
      ...(resumedAt === undefined ? {} : { resumedAt }),
      stateLabel: currentRecord.idleYield === true ? RUN_IDLE_YIELD_LABEL : current.state === 'cancelled' && runBegan(transitions) ? RUN_CANCELLED_AFTER_START_LABEL
        : current.state === 'interrupted' && this.#runStop(runRecordId) !== null ? BUDGET_REACHED_RUN_LABEL
          : current.state === 'resumable' && this.accountLimitOf(runRecordId) !== null ? ACCOUNT_LIMIT_RUN_LABEL
            : current.state === 'resumable' && this.outcomeUnknownOf(runRecordId) !== null ? OUTCOME_UNKNOWN_RUN_LABEL
            : blockedBy === 'plan-moved' ? PLAN_MOVED_LABEL
              : current.state === 'completed-with-gaps' ? completedWithGapsLabel(Number(currentRecord.gapCount ?? 0), Number(currentRecord.unitsTotal ?? 0))
                : RUN_STATE_LABELS[current.state],
      recordedAt: asString(runRecord.recorded_at),
      transitions,
      adaptations,
      blockedReasons: current.state === 'blocked-before-dispatch' ? recordedReasons ?? blockedReasons(this.#liveReading()) : null,
      blockedBy,
      progress: live === null ? null : { ...live, lastTransitionAt: current.recordedAt },
      attempt,
    };
  }

  #bindingProjection(row: SqlRow): BaselineAnalysisExecutionBindingProjection {
    const binding = parseCanonicalJson(asString(row.canonical_json)) as ExecutionBindingRecord;
    return {
      attemptId: binding.attemptId,
      bindingDigest: asString(row.sha256),
      harnessSessionId: binding.harnessSessionId,
      behaviorCompositionDigest: binding.behaviorCompositionDigest,
      ...(binding.compositionVersion === 2 || binding.compositionVersion === 3 || binding.compositionVersion === 4 ? { compositionVersion: binding.compositionVersion } : {}),
      promptContractDigest: binding.promptContractDigest,
      planEnvelopeDigest: binding.planEnvelopeDigest,
      runSourceScopeDigest: binding.runSourceScopeDigest,
      providerResolutionPlanDigest: binding.providerResolutionPlanDigest,
      coverageManifestDigest: binding.coverageManifestDigest,
      route: binding.route,
      model: binding.model,
      fixtureIdentity: binding.adapterPin?.fixtureIdentity ?? null,
      fixtureSha256: binding.adapterPin?.fixtureSha256 ?? null,
      nativeCarrierSha256: binding.nativeArtifact.nativeCarrierSha256,
      sidecarRevision: 2,
      boundAt: binding.boundAt,
    };
  }

  // ---- revisions and history ---------------------------------------------------------------------

  #revisionRows(bookId: string): SqlRow[] {
    return this.#db.prepare(
      `SELECT r.* FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal`,
    ).all(bookId, this.#definition.kind) as SqlRow[];
  }

  /** A revision's `outcome-unknown` gaps (Issue #51, S16c): the ranges whose request was sent and whose result is unknown. */
  #unknownGapOrdinals(row: SqlRow): number[] {
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || !Array.isArray(record.gaps)) return [];
    return record.gaps.flatMap((gap: unknown) =>
      isRecord(gap) && gap.code === 'outcome-unknown' && typeof gap.unitOrdinal === 'number' ? [gap.unitOrdinal] : []);
  }

  /**
   * 结果待确认 left in the Book's latest revision (Issue #51, S16c): its `outcome-unknown` gaps, which any Task that recomputes
   * them would send again — the background dispatcher never starts one over them (CTRL-007, CONT-011).
   */
  latestUnconfirmedRangesOf(bookId: string): number[] {
    return this.unconfirmedOutcomesOf(bookId).ranges.flatMap((range) => range.unitOrdinal === null ? [] : [range.unitOrdinal]);
  }

  /**
   * A revision's `outcome-unknown` gaps by the content key of their unit, with each gap's own words (Issue #51, S16c): what a
   * later Run that ends without reading such a range carries forward as the same gap.
   */
  unknownGapsByContentKey(revisionId: string): Map<string, string> {
    const row = this.#db.prepare('SELECT * FROM analysis_result_set_revisions WHERE revision_id = ?').get(revisionId) as SqlRow | undefined;
    if (row === undefined) return new Map();
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || !Array.isArray(record.gaps)) return new Map();
    const reasons = new Map<number, string>(record.gaps.flatMap((gap: unknown) =>
      isRecord(gap) && gap.code === 'outcome-unknown' && typeof gap.unitOrdinal === 'number' && typeof gap.reason === 'string'
        ? [[gap.unitOrdinal, gap.reason] as const] : []));
    if (reasons.size === 0) return new Map();
    const manifest = this.#predecessorFacts(row).manifest;
    const keys = unitContentKeys(manifest);
    return new Map(manifest.units.flatMap((unit, index) => reasons.has(unit.ordinal) ? [[keys[index]!, reasons.get(unit.ordinal)!] as const] : []));
  }

  /**
   * The units a Task's frozen reuse plan recomputes whose content is the content of an `outcome-unknown` gap of its
   * history (Issue #51, S16c; CONT-011), whatever the reason each is recomputed — matched by the same content key
   * the reuse plan matches by, so a block inserted before the range moves nothing and no other gap is ever named. Empty once
   * its Run has begun, as `resendUnitsByContentOf` is: the history then holds the Task's own revision, which never counts against it.
   */
  resendUnitsOf(projection: BaselineAnalysisProjection): number[] {
    return this.resendUnitsByContentOf(projection);
  }

  /**
   * 结果待确认 that a Book's Runs of one kind left and no later Run of that kind has read since (Issue #757; CTRL-007, CONT-011,
   * ATTN-002): the ranges whose sent requests' results cannot be known, and the steps of the latest Run that reached its Task
   * Outcome — the reduction, a sample, the reflection — whose results cannot be known either.
   *
   * The ranges are walked through the kind's revisions in order, by the content key the reuse plans match by: a range read to a
   * result by a later revision is no longer unconfirmed, a range a later Run ended without reading stays so — carried forward,
   * under the Run that first sent it — and one whose own content an edit changed is a different request, no longer this one.
   * The steps are the latest completed Run's alone, since every later Run that completes makes its own. A read: nothing is
   * written. `kind` reads another kind's revisions through this ledger, whose readings here are kind-generic.
   */
  unconfirmedOutcomesOf(bookId: string, kind: string = this.#definition.kind, includeEarlierText = false): { ranges: UnconfirmedOutcomeRecord[]; steps: UnconfirmedOutcomeRecord[] } {
    // Revision gaps and revisionless outcomes both contribute ranges to the same content-key walk.
    const held = this.#db.prepare(
      `SELECT 1 FROM analysis_result_set_revisions r JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? AND instr(r.canonical_json, '"outcome-unknown"') > 0 LIMIT 1`,
    ).get(bookId, kind) !== undefined;
    const outcomeOf = this.#db.prepare('SELECT classification, recorded_at FROM analysis_task_outcomes WHERE run_record_id = ?');
    const checkpointOf = this.#db.prepare('SELECT revision_id FROM analysis_task_input_checkpoints WHERE task_intent_id = ?');
    const outstanding = new Map<string, UnconfirmedOutcomeRecord>();
    let latestKeys: Set<string> | null = null;
    let latestKeysAt = '';
    // Zero-closure failures have no revision, but their sent requests remain unconfirmed (#1307).
    const failed = this.#db.prepare(
      `SELECT o.* FROM analysis_task_outcomes o JOIN analysis_task_intents t ON t.task_intent_id = o.task_intent_id
       WHERE t.book_id = ? AND t.kind = ? AND o.classification = 'failed' AND o.result_set_revision_id IS NULL
       ORDER BY o.recorded_at, o.rowid`,
    ).all(bookId, kind) as SqlRow[];
    for (const row of failed) {
      const report = this.#outcomeProjection(row).report;
      const unknown = report?.unitRows.filter((unit) => unit.gapCode === 'outcome-unknown') ?? [];
      if (unknown.length === 0) continue;
      const runRecordId = asString(row.run_record_id);
      // This history walk is kind-generic and must not require today's execution route
      // or interpret another kind's mode through this ledger's definition.
      const envelopeDigest = this.#envelopeDigestOfRun(runRecordId);
      const version = envelopeDigest === undefined ? undefined : this.#planVersionByEnvelopeDigest(envelopeDigest);
      requireAnalysis(version !== undefined, 'ANALYSIS_RECORD_INVALID', '失败运行的计划版本缺失。');
      const manifest = this.#planRecords(asString(row.task_intent_id), 'any', version.ordinal)['coverage-manifest'] as CoverageManifestProjection;
      requireAnalysis(manifestDigestIsExact(manifest), 'ANALYSIS_RECORD_INVALID', '失败运行的覆盖清单记录无效。');
      const keys = unitContentKeys(manifest);
      const recordedAt = asString(row.recorded_at);
      latestKeys = new Set(keys);
      latestKeysAt = recordedAt;
      const heldAt = checkpointOf.get(asString(row.task_intent_id)) as SqlRow;
      for (const unit of unknown) {
        const contentKey = keys[unit.unitOrdinal - 1]!;
        outstanding.set(contentKey, {
          key: unconfirmedOutcomeKey(kind, runRecordId, { contentKey }), kind, runRecordId,
          taskIntentId: asString(row.task_intent_id), classification: 'failed', recordedAt,
          unitOrdinal: unit.unitOrdinal, heldAtRevisionId: asString(heldAt.revision_id), contentKey, stage: null,
        });
      }
    }
    const rows = !held && outstanding.size === 0 ? [] : this.#db.prepare(
      `SELECT r.* FROM analysis_result_set_revisions r
       JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
       WHERE s.book_id = ? AND s.kind = ? ORDER BY r.ordinal`,
    ).all(bookId, kind) as SqlRow[];
    for (const row of rows) {
      const record = parseCanonicalJson(asString(row.canonical_json));
      const unknown = isRecord(record) && Array.isArray(record.gaps)
        ? record.gaps.flatMap((gap: unknown) => isRecord(gap) && gap.code === 'outcome-unknown' && typeof gap.unitOrdinal === 'number'
          ? [{ unitOrdinal: gap.unitOrdinal, carried: typeof gap.reason === 'string' && saysCarried(gap.reason) }] : [])
        : [];
      let facts: ReusePlanPredecessor;
      try {
        facts = this.#predecessorFacts(row);
      } catch {
        // A revision whose plan no longer reads back names no range by content; the walk goes on past it.
        continue;
      }
      const keys = unitContentKeys(facts.manifest);
      if (asString(row.created_at) >= latestKeysAt) {
        latestKeys = new Set(keys);
        latestKeysAt = asString(row.created_at);
      }
      const keyOf = new Map(facts.manifest.units.map((unit, index) => [unit.ordinal, keys[index]!] as const));
      for (const unit of facts.unitStates) {
        const key = keyOf.get(unit.unitOrdinal);
        if (key === undefined || (outstanding.get(key)?.recordedAt ?? '') > asString(row.created_at)) continue;
        if (unit.state === 'closed') outstanding.delete(key);
        else if (isRecord(record) && Array.isArray(record.gaps) && record.gaps.some((gap: unknown) =>
          isRecord(gap) && gap.unitOrdinal === unit.unitOrdinal && gap.code === 'contract-invalid')) {
          const earlier = outstanding.get(key);
          if (earlier !== undefined) outstanding.set(key, { ...earlier, rereadFailed: true });
        }
      }
      const runRecordId = asString(row.run_record_id);
      const outcome = outcomeOf.get(runRecordId) as SqlRow | undefined;
      const heldAt = unknown.length === 0 ? undefined : checkpointOf.get(asString(row.task_intent_id)) as SqlRow | undefined;
      const heldAtRevisionId = heldAt === undefined ? null : asString(heldAt.revision_id);
      for (const gap of unknown) {
        const contentKey = keyOf.get(gap.unitOrdinal);
        if (contentKey === undefined) continue;
        const earlier = outstanding.get(contentKey);
        if (earlier !== undefined && earlier.recordedAt > asString(row.created_at)) continue;
        // Carried forward: the same request, still unconfirmed, now at this revision's ordinal.
        if (gap.carried && earlier !== undefined) {
          outstanding.set(contentKey, { ...earlier, unitOrdinal: gap.unitOrdinal, heldAtRevisionId });
          continue;
        }
        outstanding.set(contentKey, {
          key: unconfirmedOutcomeKey(kind, runRecordId, { contentKey }),
          kind,
          runRecordId,
          taskIntentId: asString(row.task_intent_id),
          classification: outcome === undefined ? null : asString(outcome.classification),
          recordedAt: outcome === undefined ? asString(row.created_at) : asString(outcome.recorded_at),
          unitOrdinal: gap.unitOrdinal,
          heldAtRevisionId,
          contentKey,
          stage: null,
        });
      }
    }
    const latest = this.#db.prepare(
      `SELECT o.* FROM analysis_task_outcomes o JOIN analysis_task_intents t ON t.task_intent_id = o.task_intent_id
       WHERE t.book_id = ? AND t.kind = ? AND o.classification IN ('completed', 'completed-with-gaps')
       ORDER BY o.recorded_at DESC, o.rowid DESC LIMIT 1`,
    ).get(bookId, kind) as SqlRow | undefined;
    const steps: UnconfirmedOutcomeRecord[] = [];
    if (latest !== undefined) {
      const record = parseCanonicalJson(asString(latest.canonical_json));
      const report = isRecord(record) && isRecord(record.report) ? record.report : null;
      const failures = report !== null && Array.isArray(report.failures) ? report.failures.filter(isRecord) : [];
      const said = (stage: string): boolean => failures.some((failure) => failure.stage === stage && typeof failure.reason === 'string' && saysOutcomeUnknown(failure.reason));
      const reflection = report !== null && isRecord(report.ifRedone) && report.ifRedone.state === 'gap' &&
        typeof report.ifRedone.reason === 'string' && saysOutcomeUnknown(report.ifRedone.reason);
      const runRecordId = asString(latest.run_record_id);
      const stages: UnconfirmedStage[] = [
        ...(said('cross-unit-reduction') ? ['cross-unit-reduction' as const] : []),
        ...(said('assurance-sampling') ? ['assurance-sampling' as const] : []),
        ...(reflection ? ['run-report-reflection' as const] : []),
      ];
      for (const stage of stages) {
        steps.push({
          key: unconfirmedOutcomeKey(kind, runRecordId, { stage }),
          kind,
          runRecordId,
          taskIntentId: asString(latest.task_intent_id),
          classification: asString(latest.classification),
          recordedAt: asString(latest.recorded_at),
          unitOrdinal: null,
          heldAtRevisionId: null,
          contentKey: null,
          stage,
        });
      }
    }
    const ranges = [...outstanding.values()].filter((range) => includeEarlierText || latestKeys === null || latestKeys.has(range.contentKey!)).sort((left, right) => (left.unitOrdinal ?? 0) - (right.unitOrdinal ?? 0));
    return { ranges, steps };
  }

  /**
   * The units a Task of a kind that keeps no progress sends again whose content is that of a range an earlier Run of the kind
   * left 结果待确认 and no Run has read since (Issue #757; CONT-011) — matched by content key, whatever the reason the Task
   * reads it, and whether or not the editor kept it as a gap: its earlier request may already have been processed and billed.
   * The units it sends are its reuse or scope plan's recomputed ones, or, with no such plan, every unit of its coverage
   * manifest. Empty once its Run has begun — so its own Run never counts against it: the disclosure is its Plan Preview's.
   */
  resendUnitsByContentOf(projection: AnalysisProjection, kind: string = this.#definition.kind): number[] {
    const intent = projection.taskIntent;
    const manifest = projection.coverageManifest;
    // Until its Run begins — authorized, waiting to start once online (Issue #760), or blocked before dispatch — the Task has read
    // nothing, so nothing of its own counts and its plan keeps saying what starting it will send.
    const begun = projection.run !== null && !['authorized', 'awaiting-connectivity', 'blocked-before-dispatch'].includes(projection.run.state);
    if (intent === null || manifest === null || begun) return [];
    const update = projection.update as { reusePlan?: ResendPlan | null } | null;
    return this.resendUnitsByContent(projection.bookId, kind, manifest, update?.reusePlan ?? null);
  }

  /**
   * `resendUnitsByContentOf` over a Task's frozen parts (Issue #757): a Review Run's category reads its coverage manifest and its
   * scope plan from the components it froze.
   */
  resendUnitsByContent(bookId: string, kind: string, manifest: CoverageManifestProjection, plan: ResendPlan | null): number[] {
    const unconfirmed = new Set(this.unconfirmedOutcomesOf(bookId, kind, true).ranges.map((range) => range.contentKey));
    if (unconfirmed.size === 0) return [];
    const keys = unitContentKeys(manifest);
    const sent = plan !== null
      ? plan.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => ({ ordinal: unit.unitOrdinal, key: unit.contentKey }))
      : manifest.units.map((unit, index) => ({ ordinal: unit.ordinal, key: keys[index]! }));
    return sent.filter((unit) => unconfirmed.has(unit.key)).map((unit) => unit.ordinal).sort((left, right) => left - right);
  }

  #revisionBody(row: SqlRow): Record<string, unknown> {
    const body = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
    requireAnalysis(body.schema === this.#definition.revisionSchema || body.schema === this.#definition.successorRevisionSchema,
      'ANALYSIS_RECORD_INVALID', '结果集修订版记录无效。');
    return body;
  }

  /** The `update` facts of a revision body; an initial-mode body carries none and is synthesized. */
  #revisionUpdate(body: Record<string, unknown>, unitCount: number): BaselineAnalysisRevisionUpdateProjection {
    const initial = this.#definition.initialMode;
    if (!isRecord(body.update)) {
      return {
        mode: initial as BaselineAnalysisRevisionUpdateProjection['mode'],
        modeLabel: this.#definition.mode(initial).label,
        predecessor: null,
        reusePlanDigest: null,
        selectedRange: null,
        counts: this.#wholeFirstCounts(unitCount),
      };
    }
    const update = body.update as Omit<BaselineAnalysisRevisionUpdateProjection, 'modeLabel'>;
    return { ...update, modeLabel: this.#recordedMode(update.mode).label };
  }

  #unitLineage(unit: Record<string, unknown>): AnalysisUnitLineage {
    return isRecord(unit.lineage) ? unit.lineage as AnalysisUnitLineage : { kind: 'recomputed' };
  }

  #revisionProjection(row: SqlRow, latestOrdinal: number): BaselineAnalysisResultSetRevisionProjection {
    const body = this.#revisionBody(row);
    const revisionId = asString(row.revision_id);
    const ordinal = asNumber(row.ordinal);
    const units = (this.#db.prepare('SELECT * FROM analysis_unit_results WHERE revision_id = ? ORDER BY unit_ordinal').all(revisionId) as SqlRow[])
      .map((unit) => {
        const record = parseCanonicalJson(asString(unit.canonical_json)) as Record<string, unknown>;
        return { ...record, lineage: this.#unitLineage(record) } as BaselineAnalysisUnitProjection;
      });
    if (ordinal < latestOrdinal && units.some((unit) => unit.state === 'gap' && unit.gap.code === 'outcome-unknown')) {
      const set = this.#db.prepare('SELECT book_id FROM analysis_result_sets WHERE result_set_id = ?').get(asString(row.result_set_id)) as SqlRow;
      const bookId = asString(set.book_id);
      const all = this.unconfirmedOutcomesOf(bookId, this.#definition.kind, true).ranges;
      const current = new Set(this.unconfirmedOutcomesOf(bookId, this.#definition.kind).ranges.map((range) => range.contentKey));
      const earlier = new Set(all.filter((range) => !current.has(range.contentKey)).map((range) => range.contentKey));
      try {
        const manifest = this.#predecessorFacts(row).manifest;
        const keys = unitContentKeys(manifest);
        const keyOf = new Map(manifest.units.map((unit, index) => [unit.ordinal, keys[index]!] as const));
        for (const unit of units) {
          if (unit.state === 'gap' && unit.gap.code === 'outcome-unknown' && earlier.has(keyOf.get(unit.unitOrdinal)!)) unit.originalTextChanged = true;
        }
      } catch {
        // An unreadable historical manifest cannot identify a range by content.
      }
    }
    const manuscriptPin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
    const coverage = body.coverage as BaselineAnalysisResultSetRevisionProjection['coverage'];
    // The shared components are read the same way for every kind; the kind's own components — the
    // baseline's sections and synthesis, the factual kind's findings and excluded appendix — are read
    // back by its definition, so this projection never needs to know which kind it is serving.
    return {
      ...this.#definition.revisionComponents(body),
      resultSetId: asString(row.result_set_id),
      revisionId,
      ordinal,
      createdAt: asString(row.created_at),
      digest: asString(row.sha256),
      contractVersion: asString(row.contract_version),
      manuscriptPin,
      coverageManifestDigest: asString(row.coverage_manifest_sha256),
      schemaDigest: asString(body.schemaDigest),
      reducerDigest: asString(body.reducerDigest),
      adapterPin: body.adapterPin as BaselineAnalysisResultSetRevisionProjection['adapterPin'],
      bindingPin: body.bindingPin as BaselineAnalysisResultSetRevisionProjection['bindingPin'],
      policyPin: body.policyPin as BaselineAnalysisResultSetRevisionProjection['policyPin'],
      provenance: body.provenance as BaselineAnalysisResultSetRevisionProjection['provenance'],
      usage: body.usage as BaselineAnalysisResultSetRevisionProjection['usage'],
      update: this.#revisionUpdate(body, units.length),
      lineage: units.map((unit) => ({ unitOrdinal: unit.unitOrdinal, ...unit.lineage })),
      coverage: { ...coverage, unitsReused: typeof coverage.unitsReused === 'number' ? coverage.unitsReused : 0 },
      reducerClosure: body.reducerClosure as BaselineAnalysisResultSetRevisionProjection['reducerClosure'],
      freshness: this.#freshness(manuscriptPin, ordinal < latestOrdinal),
      assurance: body.assurance as BaselineAnalysisResultSetRevisionProjection['assurance'],
      gaps: body.gaps as BaselineAnalysisResultSetRevisionProjection['gaps'],
      units,
      // The kind's own components complete the shape; which they are is the definition's to know.
    } as unknown as BaselineAnalysisResultSetRevisionProjection;
  }

  #inspectedRevision(rows: SqlRow[], revisionId: string, latestOrdinal: number): NonNullable<BaselineAnalysisProjection['inspectedRevision']> {
    const row = rows.find((candidate) => candidate.revision_id === revisionId);
    requireAnalysis(row !== undefined, 'ANALYSIS_REVISION_NOT_FOUND', '本图书没有该结果集修订版。');
    const revision = this.#revisionProjection(row, latestOrdinal);
    return { revision, current: revision.ordinal === latestOrdinal, readOnly: true };
  }

  /**
   * Exact-revision freshness through local deterministic comparison against the current branch
   * head. A superseded (non-latest) revision keeps its original pin and is never current.
   */
  #freshness(pin: BaselineAnalysisResultSetRevisionProjection['manuscriptPin'], superseded: boolean): AnalysisFreshnessAxis {
    const head = this.#workingHead(pin.manuscriptId, pin.bookId);
    const current = !superseded && head.currentRevisionId === pin.revisionId && head.currentWorkingDigest === pin.revisionDigest;
    return {
      axis: 'freshness',
      state: superseded ? 'superseded' : current ? 'current' : 'stale',
      label: superseded
        ? `精确修订版新鲜度：已被后续修订版取代 · 绑定 ${pin.revisionLabel}`
        : current
          ? `精确修订版新鲜度：当前 · 绑定 ${pin.revisionLabel}`
          : `精确修订版新鲜度：已过期 · 绑定 ${pin.revisionLabel}，稿件已有后续已确认编辑`,
      boundRevisionId: pin.revisionId,
      boundRevisionDigest: pin.revisionDigest,
      currentRevisionId: head.currentRevisionId,
      currentWorkingDigest: head.currentWorkingDigest,
      currentJournalSequence: head.currentJournalSequence,
      comparison: 'local-deterministic',
    };
  }

  /** Whether a Task Input checkpoint still pins the working text: no edit since, by journal sequence and digest. */
  #checkpointIsCurrent(checkpoint: NonNullable<BaselineAnalysisProjection['checkpoint']>, bookId: string): boolean {
    const head = this.#workingHead(checkpoint.manuscriptId, bookId);
    return head.currentJournalSequence === checkpoint.journalSequence && head.currentWorkingDigest === checkpoint.revisionDigest;
  }

  #workingHead(manuscriptId: string, bookId: string): { branchId: string; currentRevisionId: string; currentRevisionLabel: string; currentWorkingDigest: string; currentJournalSequence: number } {
    const head = this.#db.prepare(
      `SELECT bws.branch_id, bws.base_revision_id, bws.journal_sequence, bws.working_digest, mr.revision_label
       FROM branch_working_state bws
       JOIN manuscripts m ON m.manuscript_id = bws.manuscript_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       WHERE m.manuscript_id = ? AND m.book_id = ?`,
    ).get(manuscriptId, bookId) as SqlRow | undefined;
    requireAnalysis(head !== undefined, 'ANALYSIS_RECORD_INVALID', '无法读取当前稿件工作状态。');
    return {
      branchId: asString(head.branch_id),
      currentRevisionId: asString(head.base_revision_id),
      currentRevisionLabel: asString(head.revision_label),
      currentWorkingDigest: asString(head.working_digest),
      currentJournalSequence: asNumber(head.journal_sequence),
    };
  }

  #history(bookId: string, rows: SqlRow[], latest: BaselineAnalysisResultSetRevisionProjection | null): BaselineAnalysisHistoryProjection | null {
    if (rows.length === 0 || latest === null) return null;
    const resultSet = this.#db.prepare('SELECT * FROM analysis_result_sets WHERE book_id = ? AND kind = ?').get(bookId, this.#definition.kind) as SqlRow | undefined;
    requireAnalysis(resultSet !== undefined, 'ANALYSIS_RECORD_INVALID', '结果集记录缺失。');
    const entries = rows.map((row): BaselineAnalysisHistoryEntryProjection => {
      const body = this.#revisionBody(row);
      const ordinal = asNumber(row.ordinal);
      const revisionId = asString(row.revision_id);
      const unitDigests = body.unitDigests as ReadonlyArray<{ unitOrdinal: number; state: 'closed' | 'gap' }>;
      const update = this.#revisionUpdate(body, unitDigests.length);
      const pin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
      const provenance = body.provenance as BaselineAnalysisResultSetRevisionProjection['provenance'];
      // The whole outcome rather than its classification alone: the entry carries its Run's report, so the
      // history opens every Run's report through the one reading that checks a report against its digest.
      const outcomeRow = this.#db.prepare('SELECT * FROM analysis_task_outcomes WHERE run_record_id = ?').get(provenance.runRecordId) as SqlRow | undefined;
      const outcome = outcomeRow === undefined ? null : this.#outcomeProjection(outcomeRow);
      const coverage = body.coverage as BaselineAnalysisResultSetRevisionProjection['coverage'];
      const freshness = ordinal === latest.ordinal ? latest.freshness : this.#freshness(pin, true);
      return {
        revisionId,
        ordinal,
        digest: asString(row.sha256),
        createdAt: asString(row.created_at),
        mode: update.mode as BaselineAnalysisHistoryEntryProjection['mode'],
        modeLabel: update.modeLabel,
        manuscriptPin: { revisionLabel: pin.revisionLabel, revisionId: pin.revisionId, revisionDigest: pin.revisionDigest },
        coverageManifestDigest: asString(row.coverage_manifest_sha256),
        contractVersion: this.#definition.contractVersion as BaselineAnalysisHistoryEntryProjection['contractVersion'],
        counts: update.counts,
        predecessor: update.predecessor,
        reusePlanDigest: update.reusePlanDigest,
        producingRun: {
          taskIntentId: provenance.taskIntentId,
          runRecordId: provenance.runRecordId,
          attemptId: provenance.attemptId,
          classification: outcome === null ? null : outcome.classification,
        },
        report: outcome === null ? null : outcome.report,
        reportAbsentReason: outcome === null ? NO_TASK_OUTCOME_REASON : outcome.reportAbsentReason,
        usage: body.usage as BaselineAnalysisResultSetRevisionProjection['usage'],
        unitsTotal: coverage.unitsTotal,
        unitsClosed: coverage.unitsClosed,
        gapCount: (body.gaps as unknown[]).length,
        conflictCount: this.#definition.conflictCountOf(body),
        current: ordinal === latest.ordinal,
        freshness: freshness.state,
        freshnessLabel: freshness.label,
      };
    });
    return {
      resultSetId: asString(resultSet.result_set_id),
      kind: this.#definition.kind,
      createdAt: asString(resultSet.created_at),
      latestOrdinal: latest.ordinal,
      entries,
    } as BaselineAnalysisHistoryProjection;
  }

  /** Read immutable result history without revalidating a later prepared Task's current configuration. */
  inspectRevision(bookId: string, revisionId: string): NonNullable<AnalysisProjection['resultSetRevision']> {
    const rows = this.#revisionRows(bookId);
    return this.#inspectedRevision(rows, revisionId, rows.length === 0 ? 0 : asNumber(rows.at(-1)!.ordinal)).revision;
  }

  /** The predecessor facts a reuse plan is derived against, read from the immutable revision rows and the plan version its Run bound. */
  #predecessorFacts(row: SqlRow): ReusePlanPredecessor {
    const revisionId = asString(row.revision_id);
    const taskIntentId = asString(row.task_intent_id);
    const envelopeDigest = this.#envelopeDigestOfRun(asString(row.run_record_id));
    const version = (envelopeDigest === undefined ? undefined : this.#planVersionByEnvelopeDigest(envelopeDigest)) ?? this.#planVersionFacts(taskIntentId).at(-1);
    requireAnalysis(version !== undefined, 'ANALYSIS_RECORD_INVALID', '前一修订版的计划版本缺失。');
    const manifest = this.#planRecords(taskIntentId, 'any', version.ordinal)['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest) && manifest.digest === asString(row.coverage_manifest_sha256),
      'ANALYSIS_RECORD_INVALID', '前一修订版的覆盖清单记录无效。');
    const unitStates = (this.#db.prepare('SELECT unit_ordinal, state FROM analysis_unit_results WHERE revision_id = ? ORDER BY unit_ordinal').all(revisionId) as SqlRow[])
      .map((unit) => ({ unitOrdinal: asNumber(unit.unit_ordinal), state: asString(unit.state) as 'closed' | 'gap' }));
    return {
      revisionId,
      ordinal: asNumber(row.ordinal),
      digest: asString(row.sha256),
      contractVersion: asString(row.contract_version),
      coverageManifestDigest: asString(row.coverage_manifest_sha256),
      manifest,
      unitStates,
    };
  }

  /**
   * The predecessor facts this kind's plan derivation reads. A kind that leaves out-of-scope units
   * unreviewed needs two more than the baseline does: the schema digest the predecessor pinned — the
   * frozen category contract its units were read under — and which of its gaps were units it was never
   * asked to read, which a later Run must tell apart from units it lost.
   */
  #planPredecessor(row: SqlRow): ReusePlanPredecessor | ScopePlanPredecessor {
    const facts = this.#predecessorFacts(row);
    if (this.#definition.outOfScope !== 'leave-unreviewed') return facts;
    const unreviewedUnitOrdinals = this.#unreviewedOrdinals(facts.revisionId);
    return {
      ...facts,
      schemaDigest: asString(this.#revisionBody(row).schemaDigest),
      ...(typeof this.#revisionBody(row).categoryConfigurationIdentity === 'string' ? { categoryConfigurationIdentity: asString(this.#revisionBody(row).categoryConfigurationIdentity) } : {}),
      unreviewedUnitOrdinals,
      changedUnreadUnitOrdinals: [...this.#unreadWalk(row).changed.keys()].sort((left, right) => left - right),
    };
  }

  /**
   * The units the latest revision left unread although they changed since the category last read them (Issue #709), the
   * blocks that make them changed, and where the walk stopped short, if it did: the one fact 只审改动过的章's plan and gate
   * and the coverage matrix all read. Nothing for a kind that never leaves a unit unreviewed, or a Book with no revision.
   */
  unreadChanges(bookId: string): { readonly units: number; readonly blockIds: ReadonlySet<string>; readonly cut: UnreadWalkCut } {
    const none = { units: 0, blockIds: new Set<string>(), cut: null };
    if (this.#definition.outOfScope !== 'leave-unreviewed') return none;
    const row = this.#revisionRows(bookId).at(-1);
    if (row === undefined) return none;
    const walk = this.#unreadWalk(row);
    return { units: walk.changed.size, blockIds: walk.blockIds, cut: walk.cut };
  }

  /**
   * Whether a Task's frozen scope plan still derives, byte for byte, from the chain as it stands (#711 review P3-4). Only a
   * kind that leaves units unreviewed is asked: its plan reads the walk, whose rule a release may change under a prepared
   * Task; the baseline's reuse plan never moves. A plan that no longer derives would be refused at dispatch, so it is
   * refused before it is authorized instead, with 请重新准备.
   */
  #frozenPlanDerives(update: AnalysisProjection['update'], manifest: CoverageManifestProjection): boolean {
    if (this.#definition.outOfScope !== 'leave-unreviewed' || update === null || update.reusePlan === null || update.predecessor === null ||
        !update.predecessorCurrent) return true;
    try {
      const predecessor = this.#planPredecessor(this.#revisionRowById(update.predecessor.revisionId));
      return reusePlanRecord(this.#derivePlan(update.mode, update.reusePlan.selectedRange, manifest, predecessor)).digest === update.reusePlanDigest;
    } catch (error) {
      if (error instanceof AnalysisError) return false;
      throw error;
    }
  }

  /** How many walks this ledger has computed: each latest revision is walked once, however often it is read. */
  get unreadWalksComputed(): number {
    return this.#unreadWalksComputed;
  }

  /** How many revisions this ledger's walks have read from SQLite: one per revision while the chain stays cached (Issue #727). */
  get chainRevisionsRead(): number {
    return this.#chainRevisionsRead;
  }

  /** The walk of one latest revision, computed once (see {@link walkUnreadChanges}). */
  #unreadWalk(row: SqlRow): UnreadWalk {
    const revisionId = asString(row.revision_id);
    const kept = this.#unreadWalks.get(revisionId);
    if (kept !== undefined) return kept;
    const latest = this.#chainRevision(row);
    requireAnalysis(latest !== 'unreadable', 'ANALYSIS_RECORD_INVALID', '结果集修订版记录无效。');
    // The revision each one this walk read followed, noted as it is read. `#chainRevision` hands back the read it has just
    // kept, and the cache never lets go of the entry it just wrote, so the walk could not miss a predecessor it has read
    // (Issue #727); the map only spares a second cache lookup per step.
    const followed = new Map<string, string | null>([[latest.revision.revisionId, latest.predecessorRevisionId]]);
    const walk = walkUnreadChanges(latest.revision, (revision) => {
      const predecessorRevisionId = followed.get(revision.revisionId);
      if (predecessorRevisionId === undefined) return 'unreadable';
      if (predecessorRevisionId === null) return null;
      let prior: SqlRow;
      try {
        prior = this.#revisionRowById(predecessorRevisionId);
      } catch (error) {
        if (error instanceof AnalysisError) return 'unreadable';
        throw error;
      }
      const read = this.#chainRevision(prior);
      if (read === 'unreadable') return 'unreadable';
      followed.set(read.revision.revisionId, read.predecessorRevisionId);
      return read.revision;
    });
    this.#unreadWalksComputed += 1;
    this.#unreadWalks.set(revisionId, walk);
    return walk;
  }

  /** One revision as the walk reads it, and the revision it followed; `'unreadable'` when its records cannot be read. */
  #chainRevision(row: SqlRow): ChainRevisionRead {
    const revisionId = asString(row.revision_id);
    const kept = this.#chainRevisions.get(revisionId);
    if (kept !== undefined) return kept;
    this.#chainRevisionsRead += 1;
    let read: ChainRevisionRead;
    try {
      const facts = this.#predecessorFacts(row);
      const outOfScope = new Set(this.#unreviewedOrdinals(revisionId));
      const intent = this.#db.prepare('SELECT predecessor_revision_id FROM analysis_task_intents WHERE task_intent_id = ?')
        .get(asString(row.task_intent_id)) as SqlRow | undefined;
      requireAnalysis(intent !== undefined, 'ANALYSIS_RECORD_INVALID', '结果集修订版的任务意图缺失。');
      read = {
        revision: {
          revisionId,
          ordinal: facts.ordinal,
          contract: `${facts.contractVersion}\n${asString(this.#revisionBody(row).schemaDigest)}`,
          manifest: facts.manifest,
          units: new Map(facts.unitStates.map((unit) => [unit.unitOrdinal,
            unit.state === 'closed' ? 'closed' : outOfScope.has(unit.unitOrdinal) ? 'out-of-scope' : 'failed'] as const)),
        },
        predecessorRevisionId: intent.predecessor_revision_id === null ? null : asString(intent.predecessor_revision_id),
      };
    } catch (error) {
      if (!(error instanceof AnalysisError)) throw error;
      read = 'unreadable';
    }
    this.#chainRevisions.set(revisionId, read);
    return read;
  }

  /** A revision's `out-of-scope` gaps: the units its Run was never asked to read. */
  #unreviewedOrdinals(revisionId: string): number[] {
    const gapRows = this.#db.prepare("SELECT unit_ordinal, canonical_json FROM analysis_unit_results WHERE revision_id = ? AND state = 'gap' ORDER BY unit_ordinal")
      .all(revisionId) as SqlRow[];
    return gapRows.filter((unit) => {
      const record = parseCanonicalJson(asString(unit.canonical_json));
      return isRecord(record) && isRecord(record.gap) && record.gap.code === 'out-of-scope';
    }).map((unit) => asNumber(unit.unit_ordinal));
  }

  #revisionRowById(revisionId: string): SqlRow {
    const row = this.#db.prepare('SELECT * FROM analysis_result_set_revisions WHERE revision_id = ?').get(revisionId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '前一结果集修订版缺失。');
    return row;
  }

  #updateProjection(
    intent: IntentFacts,
    reusePlan: AnalysisPlanRecord | null,
    reusePlanDigest: string | null,
    latest: BaselineAnalysisResultSetRevisionProjection | null,
  ): BaselineAnalysisUpdateProjection | ReviewCategoryUpdateProjection {
    requireAnalysis(this.#carriesPlan(intent.mode) && this.#isInitial(intent.mode) === (intent.predecessorRevisionId === null),
      'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
    if (intent.predecessorRevisionId === null) {
      // A range-bound first Task (Issue #417): it starts the Result Set, so what authorization must
      // re-verify is not that a predecessor is still the latest revision but that there is still none.
      return {
        mode: intent.mode,
        modeLabel: this.#recordedMode(intent.mode).label,
        meaning: this.#recordedMode(intent.mode).meaning,
        predecessor: null,
        predecessorCurrent: latest === null,
        selectedRange: reusePlan === null ? intent.selectedRange : reusePlan.selectedRange,
        reusePlan,
        reusePlanDigest,
      } as ReviewCategoryUpdateProjection;
    }
    const predecessorRow = this.#revisionRowById(intent.predecessorRevisionId);
    const body = this.#revisionBody(predecessorRow);
    const pin = body.manuscriptPin as BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
    return {
      mode: intent.mode as BaselineAnalysisUpdateMode,
      modeLabel: this.#recordedMode(intent.mode).label,
      meaning: this.#recordedMode(intent.mode).meaning,
      predecessor: {
        revisionId: intent.predecessorRevisionId,
        ordinal: asNumber(predecessorRow.ordinal),
        digest: asString(predecessorRow.sha256),
        manuscriptPin: { revisionLabel: pin.revisionLabel, revisionId: pin.revisionId, revisionDigest: pin.revisionDigest },
      },
      predecessorCurrent: latest !== null && latest.revisionId === intent.predecessorRevisionId && latest.digest === asString(predecessorRow.sha256),
      // The current plan version's range; the intent row keeps the range first requested.
      selectedRange: reusePlan === null ? intent.selectedRange : reusePlan.selectedRange,
      reusePlan,
      reusePlanDigest,
      // The plan is the kind's own record version, and the mode one of the kind's own update modes.
    } as BaselineAnalysisUpdateProjection | ReviewCategoryUpdateProjection;
  }

  /**
   * The Analysis Update Controls of a kind that declares update modes. A kind with none — the factual
   * review, whose update surfaces are S18b's and S19's — offers no control rather than an empty one,
   * so nothing claims an editor could start an update this slice cannot plan.
   */
  #updateControlsFor(
    bookId: string,
    revision: BaselineAnalysisResultSetRevisionProjection | null,
    activeRun: BaselineAnalysisProjection['run'] | null,
  ): BaselineAnalysisUpdateControlsProjection | ReviewCategoryUpdateControlsProjection | null {
    if (revision === null || this.#definition.updateModes.length === 0) return null;
    return this.#updateControls(bookId, revision, activeRun);
  }

  /** Read one immutable Task's complete manifest, including historical Tasks. */
  coverageManifestFor(bookId: string, taskIntentId: string): CoverageManifestProjection {
    const row = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ? AND book_id = ? AND kind = ?')
      .get(taskIntentId, bookId, this.#definition.kind) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_TASK_NOT_FOUND', '没有找到这项分析任务。');
    const version = this.#planVersionFacts(taskIntentId).at(-1);
    requireAnalysis(version !== undefined, 'ANALYSIS_PLAN_MISSING', '分析计划尚未准备。');
    return this.#planRecords(taskIntentId, 'any', version.ordinal)['coverage-manifest'] as CoverageManifestProjection;
  }

  /** Derive only the range the editor actually selected; no plan is written. */
  rangePlan(bookId: string, unitOrdinal: number): { selectedRange: BaselineAnalysisSelectedRange; expected: AnalysisReusePlanCounts } {
    const latest = this.inspect(bookId).resultSetRevision as BaselineAnalysisResultSetRevisionProjection | null;
    requireAnalysis(latest !== null, 'ANALYSIS_REVISION_NOT_FOUND', '还没有可更新的分析结果。');
    const head = this.#workingHead(latest.manuscriptPin.manuscriptId, bookId);
    const preview = deriveCoverageManifest({ bookId, manuscriptId: latest.manuscriptPin.manuscriptId,
      branchId: head.branchId, revisionId: head.currentRevisionId, revisionLabel: head.currentRevisionLabel,
      revisionDigest: head.currentWorkingDigest, blocks: this.readWorkingBlocks(head.branchId) });
    const unit = preview.units.find((entry) => entry.ordinal === unitOrdinal);
    requireAnalysis(unit !== undefined, 'ANALYSIS_RANGE_INVALID', '所选阅读范围已改变，请重新选择。');
    const selectedRange = { startPosition: unit.startPosition, endPosition: unit.endPosition };
    const predecessor = this.#planPredecessor(this.#revisionRowById(latest.revisionId));
    return { selectedRange, expected: this.#derivePlan('reanalyze-range', selectedRange, preview, predecessor).counts };
  }

  /**
   * The Analysis Update Controls: the preview manifest is derived over the current working blocks of
   * the primary branch (exactly what the next Task Input checkpoint would pin), and every expected
   * count is a real reuse-plan derivation against the latest revision, never an estimate. The
   * baseline kind's range options carry none: `rangePlan` derives the one the editor picks (#988).
   *
   * The controls are keyed by the kind's own update modes and offered by what each mode means to
   * read: a mode that reads only what changed is on offer once something has, a range-bound mode
   * carries one option per structural unit, and a mode that reads everything always stands. For the
   * baseline kind that is exactly the three actions it has always had, in the order it declares them.
   */
  #updateControls(
    bookId: string,
    latest: BaselineAnalysisResultSetRevisionProjection,
    activeRun: BaselineAnalysisProjection['run'] | null,
  ): BaselineAnalysisUpdateControlsProjection | ReviewCategoryUpdateControlsProjection {
    const blockedByActiveRun = activeRun !== null;
    const blockedReason = blockedByActiveRun ? activeRunReason(activeRun.state, this.#definition.kind, activeRun.stopReason) : null;
    const head = this.#workingHead(latest.manuscriptPin.manuscriptId, bookId);
    const blocks = this.readWorkingBlocks(head.branchId);
    const preview = deriveCoverageManifest({
      bookId,
      manuscriptId: latest.manuscriptPin.manuscriptId,
      branchId: head.branchId,
      revisionId: head.currentRevisionId,
      revisionLabel: head.currentRevisionLabel,
      revisionDigest: head.currentWorkingDigest,
      blocks,
    });
    const predecessor = this.#planPredecessor(this.#revisionRowById(latest.revisionId));
    const expected = (mode: AnalysisTaskMode, selectedRange: BaselineAnalysisSelectedRange | null): AnalysisReusePlanCounts =>
      this.#derivePlan(mode, selectedRange, preview, predecessor).counts;
    const freshness = latest.freshness.state === 'stale' ? 'stale' : 'current';
    const action = (mode: AnalysisTaskMode, available: boolean, unavailableReason: string | null, counts: AnalysisReusePlanCounts | null) => ({
      mode,
      label: this.#definition.mode(mode).label,
      goal: this.#definition.mode(mode).goal,
      meaning: this.#definition.mode(mode).meaning,
      available: available && !blockedByActiveRun,
      unavailableReason: blockedReason ?? unavailableReason,
      expected: counts,
    });
    const options = (mode: AnalysisTaskMode): BaselineAnalysisRangeOptionProjection[] => preview.units.map((unit) => ({
      unitOrdinal: unit.ordinal,
      sectionOrdinal: unit.sectionOrdinal,
      headingText: unit.headingText,
      subUnitIndex: unit.subUnitIndex,
      subUnitCount: unit.subUnitCount,
      startPosition: unit.startPosition,
      endPosition: unit.endPosition,
      graphemes: unit.graphemes,
      label: `结构段 ${unit.sectionOrdinal}${unit.headingText === null ? '' : `「${unit.headingText}」`} · 单元 ${unit.ordinal}/${preview.units.length}（${unit.subUnitIndex}/${unit.subUnitCount}）· 段落 ${unit.startPosition}–${unit.endPosition} · ${unit.graphemes} 字素`,
      expected: this.#definition.kind === BASELINE_ANALYSIS_KIND ? null : expected(mode, { startPosition: unit.startPosition, endPosition: unit.endPosition }),
    }));
    const actions = Object.fromEntries(this.#definition.updateModes.map((mode) => {
      const definition = this.#definition.mode(mode);
      if (definition.recompute === 'changed') {
        // Something changed since the latest revision, or since the category last read a unit a range Run then left
        // unread (Issue #709): the latest revision being current says nothing about an edit made before it outside its range.
        const changed = freshness === 'stale' || ('changedUnreadUnitOrdinals' in predecessor && (predecessor.changedUnreadUnitOrdinals?.length ?? 0) > 0);
        return [mode, action(mode, changed, changed ? null : changedModeUnavailableReason(definition.label), changed ? expected(mode, null) : null)];
      }
      if (definition.recompute === 'selected-range') return [mode, { ...action(mode, true, null, null), options: options(mode) }];
      return [mode, action(mode, true, null, expected(mode, null))];
    }));
    return {
      target: {
        revisionId: latest.revisionId,
        ordinal: latest.ordinal,
        digest: latest.digest,
        manuscriptPin: { revisionLabel: latest.manuscriptPin.revisionLabel, revisionId: latest.manuscriptPin.revisionId, revisionDigest: latest.manuscriptPin.revisionDigest },
        freshness,
      },
      working: {
        branchId: head.branchId,
        revisionLabel: head.currentRevisionLabel,
        journalSequence: head.currentJournalSequence,
        workingDigest: head.currentWorkingDigest,
        totalBlocks: preview.totalBlocks,
        unitCount: preview.units.length,
        sectionCount: preview.sectionCount,
      },
      blockedByActiveRun,
      blockedReason,
      actions,
      providerConsequence: providerConsequence(this.#liveReading(), preview.units.length, this.#definition.mode(this.#definition.initialMode).label),
      successorBehavior: SUCCESSOR_BEHAVIOR,
      // Keyed by the kind's own update modes, which is the one thing the two controls shapes differ in.
    } as BaselineAnalysisUpdateControlsProjection | ReviewCategoryUpdateControlsProjection;
  }

  // ---- preparation -----------------------------------------------------------------------------

  /** A fresh task and its run authority are written together; no pending approval is observable. */
  launchTask(input: Extract<BaselineAnalysisPrepareInput, { phase: 'start' }>, snapshotId: string,
    binding: import('../launch-policy.js').ConfiguredProviderBinding | null): AnalysisProjection {
    const ledger = new BaselineAnalysisStore(this.#db, this.#checkpointOwner, this.#route, this.#originalDefinition);
    const route = allowedProductionBindingOf(binding);
    ledger.bindLaunch({ ...this.#launch, policy: input.launchPolicy, live: this.#launch.operationalScope === 'ordinary-production' && binding !== null && route !== null
      ? { ...binding, route: route.route, credentialSlot: route.credentialSlot, scope: 'ordinary-production', runBudgetCeiling: 'unset' } : this.#launch.live });
    return ledger.#launchTask(input, snapshotId);
  }

  #launchTask(input: Extract<BaselineAnalysisPrepareInput, { phase: 'start' }>, snapshotId: string): AnalysisProjection {
    this.#requireDeniedPolicy(input.launchPolicy);
    requireAnalysis(this.#liveReading() !== MODEL_SERVICE_SETUP_REQUIRED, 'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', MODEL_SERVICE_SETUP_REQUIRED_REASON);
    const existing = this.inspect(input.bookId);
    requireAnalysis(!runIsActive(existing.run?.state ?? null), 'ANALYSIS_TASK_ACTIVE', activeRunReason(existing.run?.state ?? null, this.#definition.kind));
    const update = this.#resolveSelectedBlocks(input.bookId, input.update);
    const mode = update?.mode ?? this.#definition.initialMode;
    const modeDefinition = this.#definition.mode(mode);
    requireAnalysis(input.goal === modeDefinition.goal, 'ANALYSIS_GOAL_INVALID', '任务目标与所选方式不一致。');
    const first = modeDefinition.initial;
    const predecessor = first ? null : existing.resultSetRevision;
    requireAnalysis(first || predecessor !== null, 'ANALYSIS_PREDECESSOR_ABSENT', '请先完成首次分析。');
    const head = this.#binding(input.bookId);
    const selectedRange = modeDefinition.rangeBound ? requireSelectedRange(update?.selectedRange ?? null, this.readWorkingBlocks(head.branchId).length) : null;
    const taskIntentId = randomUUID();
    const selected = selectedProcedureForBook(this.#db, input.bookId, this.#definition.kind);
    const intent: PendingIntent = { taskIntentId, bookId: input.bookId, goal: input.goal, mode, redoOf: input.redoOf ?? null,
      preparedByEnrollmentVersionId: null, backgroundRunBudgetCeiling: null,
      predecessor: predecessor === null ? null : { revisionId: predecessor.revisionId, digest: predecessor.digest }, selectedRange,
      intentDraftVersionId: null, intentDraftParagraphs: null, ...(selected === null ? {} : { procedure: selected }),
      ...(input.factualDecision === undefined ? {} : { factualDecision: input.factualDecision }) };
    const persist = (checkpoint: ManuscriptCheckpointBinding): void => {
      this.#insertIntent(intent);
      this.#persistPrepared(taskIntentId, checkpoint, TASK_INPUT_CHECKPOINT_PURPOSE, input.launchPolicy);
      const plan = this.inspect(input.bookId);
      requireAnalysis(plan.planEnvelope?.dispatchAllowed && plan.planVersion !== null, 'ANALYSIS_ROUTE_ABSENT', '当前没有可执行的模型路线。');
      const authorizationId = randomUUID(), runRecordId = randomUUID(), instant = new Date().toISOString();
      const authority = canonicalRecord({ authorizationId, origin: 'standard-direct', startWhen: 'now',
        planEnvelopeDigest: plan.planEnvelope.digest, planVersionId: plan.planVersion.planVersionId, planVersionOrdinal: 1,
        taskIntentId, authority: 'standard-direct-dispatch', launchSnapshotId: snapshotId });
      const procedure = readProcedurePlanPin(this.#db, plan.planEnvelope.digest);
      const run = canonicalRecord({ runRecordId, authorizationId, taskIntentId, recordedAt: instant, ...(procedure === null ? {} : { procedure }) });
      this.#db.prepare('INSERT INTO analysis_run_authorizations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(authorizationId, taskIntentId, plan.planEnvelope.digest, 'standard-direct', 'standard-direct-dispatch', instant, authority.json, authority.digest, 'now');
      this.#db.prepare('INSERT INTO analysis_run_records VALUES (?, ?, ?, ?, ?, ?)')
        .run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
      this.#insertRunState(runRecordId, 1, 'authorized', { detail: '任务已启动，等待运行名额。' }, instant);
    };
    const work = this.#checkpointOwner.createManuscriptCheckpointWork(head.manuscriptId, head.branchId, TASK_INPUT_CHECKPOINT_PURPOSE);
    if (work.workId === null) {
      requireAnalysis(work.checkpoint !== null, 'ANALYSIS_CHECKPOINT_INVALID', '任务输入固定点缺失。');
      persist(work.checkpoint);
    } else {
      try {
        while (!this.#checkpointOwner.advanceManuscriptCheckpointWork(work.workId).done) { /* Complete the pinned input within the launch transaction. */ }
        this.#checkpointOwner.finalizeManuscriptCheckpointWork(work.workId, persist);
      } catch (error) { this.#checkpointOwner.cancelManuscriptCheckpointWork(work.workId); throw error; }
    }
    return this.inspect(input.bookId);
  }

  prepare(input: BaselineAnalysisPrepareInput): BaselineAnalysisPreparationResult {
    if (input.phase === 'cancel-all') {
      for (const workId of Array.from(this.#work.keys())) this.prepare({ phase: 'cancel', workId });
      return { done: true, workId: null, completed: 0, total: 0, projection: null };
    }
    if (input.phase === 'cancel') {
      const work = this.#work.get(input.workId);
      if (work !== undefined) {
        this.#checkpointOwner.cancelManuscriptCheckpointWork(work.checkpointWorkId);
        this.#work.delete(input.workId);
      }
      return { done: true, workId: null, completed: 0, total: 0, projection: null };
    }
    if (input.phase === 'advance') {
      try { return this.#advance(input.workId); } catch (error) {
        const work = this.#work.get(input.workId);
        if (work?.intentDraft !== undefined) {
          this.#checkpointOwner.cancelManuscriptCheckpointWork(work.checkpointWorkId);
          this.#work.delete(input.workId);
        }
        throw error;
      }
    }
    // Ordinary production without a configured route refuses before anything is prepared, naming both routes (Issue #811).
    requireAnalysis(this.#liveReading() !== MODEL_SERVICE_SETUP_REQUIRED, 'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', MODEL_SERVICE_SETUP_REQUIRED_REASON);
    if (this.#launch.live !== null) {
      const scope = this.#launch.operationalScope;
      requireAnalysis(this.#definition.kind === BASELINE_ANALYSIS_KIND || plannedRunAdmission(input.launchPolicy, this.#definition, this.#launch.live) !== null,
        'ANALYSIS_KIND_NOT_ADMITTED', `${scope} 当前只允许基线稿件分析；该任务种类尚未获准实时执行。`);
      // A 后台分析登记's preparation only under the selected policy's enrolled-background rule (Issue #864; Provider Processing v14/v15).
      requireAnalysis(input.background == null ||
          (this.#definition.kind === BASELINE_ANALYSIS_KIND && liveKindRule(input.launchPolicy, BASELINE_ANALYSIS_KIND, [], 'background') !== null),
        'ANALYSIS_ORIGIN_NOT_ADMITTED', `${scope} 当前只允许直接发起的分析任务。`);
    }
    const update = this.#resolveSelectedBlocks(input.bookId, input.update);
    const mode: AnalysisTaskMode = update === null ? this.#definition.initialMode : update.mode;
    // A named mode is one of the kind's update modes, or the range-bound first mode of a kind that
    // declares one (Issue #417). The whole first mode is never named: it is what `null` asks for.
    const modeDefinition = this.#definition.modes.find((entry) => entry.mode === mode);
    const firstRange = update !== null && modeDefinition !== undefined && modeDefinition.initial && modeDefinition.rangeBound;
    requireAnalysis(update === null || firstRange || this.#definition.updateModes.includes(mode), 'ANALYSIS_UPDATE_MODE_UNAVAILABLE', '本分析种类没有该更新方式。');
    // A Task promoted from a draft keeps the draft's sentence as its goal (Issue #423, slice 7a); 重新确认计划 of such a Task names
    // that sentence again, which is checked against the Task once it is read. Every other preparation names the mode's fixed goal.
    const fixedGoal = input.goal === this.#definition.mode(mode).goal;
    const intentDraft = input.intentDraft ?? null;
    requireAnalysis(fixedGoal || (intentDraft !== null && isDraftGoal(input.goal)) || (input.reconfirm && isDraftGoal(input.goal)),
      'ANALYSIS_GOAL_INVALID', '任务目标与所选更新方式的固定目标不一致。');
    requireAnalysis(intentDraft === null || (UUID_PATTERN.test(intentDraft.versionId) && input.background == null && input.redoOf == null && !input.reconfirm),
      'ANALYSIS_GOAL_INVALID', '任务意图草稿的准备参数无效。');
    this.#requireDeniedPolicy(input.launchPolicy);
    const background = input.background ?? null;
    if (background === null) {
      // Any preparation the editor starts on the Book stops the 后台分析登记 dispatcher's first (Issue #95, S39; #713 review, P1-2):
      // AI7 never holds the Book's checkpoint against the editor, and its Task Intent is never one the editor's reuses.
      for (const work of Array.from(this.#work.values())) {
        if (work.background && work.bookId === input.bookId) this.prepare({ phase: 'cancel', workId: work.workId });
      }
    } else {
      requireAnalysis(UUID_PATTERN.test(background.enrollmentVersionId) && isBackgroundRunBudgetCeiling(background.runBudgetCeiling) &&
        input.redoOf == null && !input.reconfirm,
        'ANALYSIS_BACKGROUND_INVALID', '后台分析的准备参数无效。');
      requireAnalysis(!this.preparationInFlight(input.bookId), 'ANALYSIS_PREPARATION_IN_FLIGHT', '这本书正在准备一项任务；后台分析不接手。');
    }
    const existing = this.inspect(input.bookId);
    requireAnalysis(!runIsActive(existing.run?.state ?? null), 'ANALYSIS_TASK_ACTIVE', activeRunReason(existing.run?.state ?? null, this.#definition.kind));
    const latest = existing.resultSetRevision;
    // 改计划重做 (Issue #422, S76c; AUTH-010, CONT-013): a new Task after the latest Task's Run was cancelled once it
    // began. What that Run kept it formed into the Book's latest revision, which the redo carries and reads again
    // wherever it is not closed (同步到当前稿件 reuses every closed range and re-reads every gap); a Run that kept
    // nothing is redone as the Task it was — the same way over the same range, or the first baseline again.
    const redoOf = input.redoOf ?? null;
    if (redoOf !== null) {
      const run = existing.run;
      // 调整预算并重做 (Issue #51, S16a; V2-UX-MODEL-017): a Run the Run Budget Ceiling stopped is redone the same way — the
      // ceiling is raised or removed in the new Task's plan, never on the stopped Run.
      const budgetReached = run !== null && run.state === 'interrupted' && existing.taskOutcome?.stop?.reason === 'run-budget-ceiling-reached';
      requireAnalysis(run !== null && run.runRecordId === redoOf &&
        ((run.state === 'cancelled' && run.transitions.some((transition) => transition.state === 'executing')) || budgetReached),
      'ANALYSIS_REDO_STALE', '只有这本书最近一项任务里开始后取消、或因预算上限停止的运行可以改计划重做。');
      const expected = latest !== null && latest.provenance.runRecordId === redoOf
        ? { mode: 'sync-current', selectedRange: null }
        : existing.update === null ? null : { mode: existing.update.mode, selectedRange: existing.update.selectedRange };
      requireAnalysis(!input.reconfirm && (this.#definition.kind !== BASELINE_ANALYSIS_KIND || (expected === null
        ? update === null
        : update !== null && update.mode === expected.mode && update.selectedRange?.startPosition === expected.selectedRange?.startPosition &&
          update.selectedRange?.endPosition === expected.selectedRange?.endPosition)),
      'ANALYSIS_REDO_INVALID', '改计划重做沿用这次运行已读完的部分，接着读其余的；什么都没读完时，照原样从头再做。');
    }
    // The latest Task asked for again as it was — the same way over the same range, its predecessor still the latest
    // revision: 重新准备 (Issue #536; OFF-008) of a Task whose Run a moved plan blocked before it began, and 重新确认计划
    // of a Task prepared and not yet started (Issue #551). A way ②A's own controls do not offer now stays open to it: a
    // redo's 同步 over the revision its stopped Run kept, and so every Task 重新准备 makes of it, however often the plan
    // moves while it waits.
    const blocked = existing.run;
    const asked = redoOf === null && update !== null && existing.update !== null && existing.update.predecessorCurrent &&
      update.mode === existing.update.mode &&
      update.selectedRange?.startPosition === existing.update.selectedRange?.startPosition &&
      update.selectedRange?.endPosition === existing.update.selectedRange?.endPosition &&
      (input.reconfirm
        ? blocked === null
        : blocked !== null && blocked.state === 'blocked-before-dispatch' && blocked.blockedBy === 'plan-moved');
    // 重新确认计划 and 重新准备 of a range Task name its range by position, as the plan froze it (Issue #423 review, P3-4). Its
    // paragraphs are the ones those positions held at the Task Input revision; once the working manuscript holds other blocks
    // there, the same positions would read the neighbours, so the Task is chosen again instead.
    if ((input.reconfirm || asked) && update !== null && update.selectedRange !== null && existing.checkpoint !== null) {
      requireAnalysis(this.#rangeStillHolds(input.bookId, existing.checkpoint, update.selectedRange), 'ANALYSIS_SELECTED_RANGE_MOVED', SELECTED_RANGE_MOVED);
    }
    let selectedRange: BaselineAnalysisSelectedRange | null = null;
    if (update === null) {
      requireAnalysis(latest === null, 'ANALYSIS_FIRST_BASELINE_EXISTS', '本图书已存在结果集修订版；请使用分析更新操作追加后继修订版。');
    } else if (firstRange) {
      // The range is checked against the working manuscript the Task Input checkpoint is about to pin;
      // there is no revision yet for the update controls to have derived it from.
      requireAnalysis(latest === null, 'ANALYSIS_FIRST_BASELINE_EXISTS', '本图书已存在结果集修订版；请使用分析更新操作追加后继修订版。');
      selectedRange = requireSelectedRange(update.selectedRange, this.readWorkingBlocks(this.#binding(input.bookId).branchId).length);
    } else {
      const initialLabel = this.#definition.mode(this.#definition.initialMode).label;
      requireAnalysis(latest !== null && existing.updateControls !== null, 'ANALYSIS_PREDECESSOR_ABSENT', `本图书尚无结果集修订版；请先完成${initialLabel}。`);
      const control = (existing.updateControls!.actions as Readonly<Record<string, { available: boolean; unavailableReason: string | null }>>)[mode];
      // A redo's 同步 reads the gaps of a revision the manuscript has not moved past, which ②A's own 同步 waits for; so
      // does the latest Task asked for again as it was.
      requireAnalysis(control !== undefined && (control.available || redoOf !== null || asked), 'ANALYSIS_UPDATE_MODE_UNAVAILABLE',
        control?.unavailableReason ?? changedModeUnavailableReason(this.#definition.mode(mode).label));
      if (this.#definition.mode(mode).rangeBound) {
        selectedRange = requireSelectedRange(update.selectedRange, existing.updateControls!.working.totalBlocks);
      } else {
        requireAnalysis(update.selectedRange === null, 'ANALYSIS_SELECTED_RANGE_INVALID', '只有重新分析所选范围可以携带内容块范围。');
      }
    }
    const binding = this.#binding(input.bookId);
    const latestIntent = existing.taskIntent === null ? null : this.#intentFacts(this.#latestIntentRow(input.bookId)!);
    requireAnalysis(fixedGoal || intentDraft !== null || (latestIntent !== null && latestIntent.intentDraftVersionId !== null && latestIntent.goal === input.goal),
      'ANALYSIS_GOAL_INVALID', '任务目标与所选更新方式的固定目标不一致。');
    // The dispatcher never steps in beside the editor's own plan, prepared and not started (#713 review, P1-2).
    requireAnalysis(background === null || latestIntent === null || latestIntent.preparedByEnrollmentVersionId !== null ||
      existing.planEnvelope === null || existing.authorization !== null,
    'ANALYSIS_TASK_PREPARED', '这本书有一份你准备好但还没开始的计划；后台分析不接手。');
    // The same Task: the latest intent, no Run yet, the same update mode and the same predecessor. A
    // prepared one is revised in place (Issue #48); an interrupted preparation is resumed only for the
    // same request; anything else is a new Task Intent.
    // A prepared Task is the same Task only while the text its Task Input checkpoint pinned is still the working text.
    // After an edit the next preparation takes a new checkpoint as a new Task, so a quick start — whose plan the editor
    // never saw — never reads text older than the editor's (TASK-024). 开始任务 in the drawer still starts the plan the
    // editor is reading, at the Task Input revision that plan names; 重新确认计划 revises the plan in place, whatever moved.
    const checkpointCurrent = existing.checkpoint === null || this.#checkpointIsCurrent(existing.checkpoint, input.bookId);
    // Nor is a Task whose plan froze another prompt contract of this kind — a review category whose guideline clauses were
    // imported anew since (Issue #427 review): its plan could never execute under this contract, so the preparation is a
    // new Task Intent under the contract that applies now.
    // So is one whose plan froze another assurance sampling contract (Issue #826): the composition does not pin it.
    const currentDefinition = this.#selectedDefinition(this.#planDefinition(existing.planVersion?.edits ?? NO_PLAN_EDITS, existing.taskIntent?.mode), input.bookId);
    const contractCurrent = existing.planEnvelope === null || (existing.planEnvelope.promptContractDigest === currentDefinition.promptContractDigest &&
      (existing.executionPlan === null ||
        !assuranceContractMoved(currentDefinition, frozenAssurancePromptContractDigest(existing.executionPlan as unknown as Record<string, unknown>))));
    // Nor is a Task whose frozen scope plan the chain no longer derives (#711 review P3-4): 重新准备 makes it anew.
    const planDerives = existing.coverageManifest === null || existing.authorization !== null || this.#frozenPlanDerives(existing.update, existing.coverageManifest);
    // A Task the 后台分析登记 dispatcher prepared is never the editor's to revise or resume, and the dispatcher never takes up any
    // Task Intent but the one it creates now (#713 review, P1-2): each side's preparation is a Task of its own.
    const selectedProcedure = background === null ? selectedProcedureForBook(this.#db, input.bookId, this.#definition.kind) : null;
    const sameProcedure = canonicalJson(latestIntent?.record.procedure ?? null) === canonicalJson(selectedProcedure);
    // A fresh initiation uses the search selection now, while the earlier Review keeps its frozen Task.
    // Search is not part of the model material-input comparison; reusing that Task would silently send to its old backend.
    const priorProvider = existing.providerResolutionPlan;
    const searchCurrent = priorProvider === null || existing.run !== null || canonicalJson({
      ...(priorProvider.webToolsBackend === undefined ? {} : { webToolsBackend: priorProvider.webToolsBackend, searchCredentialReference: priorProvider.searchCredentialReference }),
      ...(priorProvider.webToolsFallback === undefined ? {} : { webToolsFallback: priorProvider.webToolsFallback }),
    }) === canonicalJson(this.#currentSearchPlan(currentDefinition, latestIntent?.preparedByEnrollmentVersionId ?? null, input.launchPolicy));
    const sameTask = sameProcedure && (input.reconfirm || searchCurrent) && background === null && input.newTask !== true && intentDraft === null && latestIntent !== null && latestIntent.preparedByEnrollmentVersionId === null &&
      existing.run === null && latestIntent.mode === mode &&
      latestIntent.predecessorRevisionId === (latest?.revisionId ?? null) && (input.reconfirm || checkpointCurrent) && contractCurrent && planDerives;
    if (sameTask && existing.checkpoint !== null) {
      return { done: true, workId: null, completed: 1, total: 1, projection: this.#revisePreparedPlan(input.bookId, latestIntent, existing, selectedRange, input.reconfirm) };
    }
    requireAnalysis(!input.reconfirm, 'ANALYSIS_PLAN_REVISION_ABSENT', '当前没有已冻结且待重新确认的计划。');
    const reusable = sameTask && sameRange(latestIntent.selectedRange, selectedRange);
    const taskIntentId = reusable ? latestIntent.taskIntentId : randomUUID();
    const initial = this.#isInitial(mode);
    // Background preparations and draft promotions write their intent only when the plan freezes. A stopped preparation leaves
    // no orphan intent, and a failed draft promotion leaves its draft editable. Ordinary preparation retains its existing path.
    const pendingIntent: PendingIntent | null = reusable ? null : {
      ...(selectedProcedure === null ? {} : { procedure: selectedProcedure }),
      ...(input.factualDecision === undefined ? {} : { factualDecision: input.factualDecision }),
      taskIntentId, bookId: input.bookId, goal: input.goal, mode, redoOf,
      preparedByEnrollmentVersionId: background?.enrollmentVersionId ?? null,
      backgroundRunBudgetCeiling: background === null ? null : { kind: 'tokens', maxTotalTokens: background.runBudgetCeiling.maxTotalTokens },
      predecessor: initial ? null : { revisionId: latest!.revisionId, digest: latest!.digest },
      selectedRange,
      intentDraftVersionId: intentDraft?.versionId ?? null,
      intentDraftParagraphs: intentDraft?.paragraphs ?? null,
    };
    // A draft remains editable if saving its Task Input or plan fails. Its intent and promotion commit only with the plan.
    const deferIntent = background !== null || intentDraft !== null;
    if (pendingIntent !== null && !deferIntent) this.#insertIntent(pendingIntent);
    const active = Array.from(this.#work.values()).find((work) => work.taskIntentId === taskIntentId);
    if (active !== undefined) return { done: false, workId: active.workId, completed: 0, total: active.total, projection: null };
    const checkpoint = this.#checkpointOwner.createManuscriptCheckpointWork(binding.manuscriptId, binding.branchId, TASK_INPUT_CHECKPOINT_PURPOSE,
      { preemptible: background !== null });
    if (checkpoint.workId === null) {
      requireAnalysis(checkpoint.checkpoint !== null, 'ANALYSIS_CHECKPOINT_INVALID', '任务输入固定点缺失。');
      transact(this.#db, () => {
        if (pendingIntent !== null && deferIntent) this.#insertIntent(pendingIntent);
        this.#persistPrepared(taskIntentId, checkpoint.checkpoint!, TASK_INPUT_CHECKPOINT_PURPOSE, input.launchPolicy);
        intentDraft?.promoted(taskIntentId);
      });
      return { done: true, workId: null, completed: 1, total: 1, projection: this.inspect(input.bookId) };
    }
    const workId = randomUUID();
    this.#work.set(workId, {
      workId, taskIntentId, bookId: input.bookId, checkpointWorkId: checkpoint.workId, launchPolicy: structuredClone(input.launchPolicy),
      total: checkpoint.total, background: background !== null, pendingIntent: deferIntent ? pendingIntent : null,
      ...(intentDraft === null ? {} : { intentDraft }),
    });
    return { done: false, workId, completed: 0, total: checkpoint.total, projection: null };
  }

  /** One Task Intent row, its record made at the moment it is written. */
  #insertIntent(intent: PendingIntent): void {
    const createdAt = new Date().toISOString();
    const base = {
      ...(intent.procedure === undefined ? {} : { procedure: intent.procedure }),
      ...(intent.factualDecision === undefined ? {} : { factualDecision: intent.factualDecision }),
      bookId: intent.bookId,
      contractVersion: this.#definition.contractVersion,
      createdAt,
      expectedOutcome: this.#definition.expectedOutcome,
      goal: intent.goal,
      kind: this.#definition.kind,
      taskIntentId: intent.taskIntentId,
      ...(intent.redoOf === null ? {} : { redoOfRunRecordId: intent.redoOf }),
      ...(intent.preparedByEnrollmentVersionId === null ? {} : { preparedByEnrollmentVersionId: intent.preparedByEnrollmentVersionId }),
      ...(intent.backgroundRunBudgetCeiling === null ? {} : { backgroundRunBudgetCeiling: { ...intent.backgroundRunBudgetCeiling } }),
      ...(intent.intentDraftVersionId === null ? {} : { intentDraftVersionId: intent.intentDraftVersionId }),
      ...(intent.intentDraftParagraphs === null ? {} : { intentDraftParagraphs: intent.intentDraftParagraphs }),
    };
    // A whole first Task's record is the base alone, as it has been since revision 15. Every Task that
    // carries a plan also states its mode, its predecessor and its range — and a range-bound first
    // Task states that it has no predecessor rather than leaving the fact to the reader.
    const record = canonicalRecord(!this.#carriesPlan(intent.mode) ? base : {
      ...base,
      mode: intent.mode,
      predecessorRevisionId: intent.predecessor?.revisionId ?? null,
      predecessorRevisionDigest: intent.predecessor?.digest ?? null,
      selectedRange: intent.selectedRange,
    });
    this.#db.prepare(
      `INSERT INTO analysis_task_intents(
         task_intent_id, book_id, kind, contract_version, goal, created_at, canonical_json, sha256,
         mode, predecessor_revision_id, selected_start_position, selected_end_position
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(intent.taskIntentId, intent.bookId, this.#definition.kind, this.#definition.contractVersion, intent.goal, createdAt, record.json, record.digest,
      intent.mode, intent.predecessor?.revisionId ?? null, intent.selectedRange?.startPosition ?? null, intent.selectedRange?.endPosition ?? null);
  }

  #advance(workId: string): BaselineAnalysisPreparationResult {
    requireAnalysis(UUID_PATTERN.test(workId), 'JOB_INVALID', '任务准备标识无效。');
    const work = this.#work.get(workId);
    requireAnalysis(work !== undefined, 'JOB_NOT_FOUND', '任务准备不存在或已结束。');
    const progress = this.#checkpointOwner.advanceManuscriptCheckpointWork(work.checkpointWorkId);
    if (!progress.done) return { done: false, workId, completed: progress.completed, total: progress.total, projection: null };
    this.#checkpointOwner.finalizeManuscriptCheckpointWork(
      work.checkpointWorkId,
      (checkpoint, purpose) => {
        // The dispatcher's Task Intent is written here, in the transaction that freezes its plan, and nowhere earlier.
        if (work.pendingIntent !== null) this.#insertIntent(work.pendingIntent);
        this.#persistPrepared(work.taskIntentId, checkpoint, purpose, work.launchPolicy);
        work.intentDraft?.promoted(work.taskIntentId);
      },
    );
    this.#work.delete(workId);
    const intent = this.#db.prepare('SELECT book_id FROM analysis_task_intents WHERE task_intent_id = ?').get(work.taskIntentId) as SqlRow;
    return { done: true, workId: null, completed: progress.total, total: progress.total, projection: this.inspect(asString(intent.book_id)) };
  }

  #persistPrepared(taskIntentId: string, checkpoint: ManuscriptCheckpointBinding, purpose: CheckpointPurpose, launchPolicy: LaunchPolicyProjection): void {
    requireAnalysis(purpose === TASK_INPUT_CHECKPOINT_PURPOSE, 'ANALYSIS_CHECKPOINT_INVALID', '任务输入固定点用途无效。');
    this.#requireDeniedPolicy(launchPolicy);
    const intentRow = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
    requireAnalysis(intentRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务意图缺失。');
    const intent = this.#intentFacts(intentRow);
    // The checkpoint must still be the working head when the plan is first frozen.
    this.#binding(checkpoint.bookId, checkpoint);
    const instant = new Date().toISOString();
    const checkpointRecord = canonicalRecord({
      branchId: checkpoint.branchId,
      createdForDirtyJournal: checkpoint.createdForDirtyJournal,
      journalSequence: checkpoint.journalSequence,
      manuscriptId: checkpoint.manuscriptId,
      purpose,
      revisionDigest: checkpoint.revisionDigest,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      taskIntentId,
    });
    this.#db.prepare(
      `INSERT INTO analysis_task_input_checkpoints(
         task_intent_id, manuscript_id, branch_id, revision_id, revision_label, revision_digest,
         journal_sequence, purpose, created_for_dirty_journal, canonical_json, sha256, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskIntentId, checkpoint.manuscriptId, checkpoint.branchId, checkpoint.revisionId, checkpoint.revisionLabel,
      checkpoint.revisionDigest, checkpoint.journalSequence, purpose, checkpoint.createdForDirtyJournal ? 1 : 0,
      checkpointRecord.json, checkpointRecord.digest, instant);
    this.#writePlanVersion({ intent, checkpoint, checkpointDigest: checkpointRecord.digest, ordinal: 1, selectedRange: intent.selectedRange,
      planRevisionId: null, instant, edits: this.#redoPlanEdits(intent), policy: launchPolicy });
  }

  /** Derive the search pins for both fresh preparation reuse and plan freezing. */
  #currentSearchPlan(definition: AnalysisKindDefinition, enrollmentVersionId: string | null, policy = this.#launch.policy): {
    webToolsBackend?: FrozenWebToolsBackend; searchCredentialReference?: string; webToolsFallback?: FrozenWebToolsFallback;
  } {
    const admitted = definition.kind === BASELINE_ANALYSIS_KIND || enrollmentVersionId !== null ? null : liveKindRule(this.#launch.policy, definition.kind);
    if (this.#launch.live === null || admitted === null || !kindResearchDeclaration(this.#launch.policy, definition.kind, definition.researchDeclaration).webSearch) return {};
    const production = this.#launch.live.scope === 'ordinary-production';
    const rows = this.#db.prepare('SELECT * FROM search_backend_connections').all() as SqlRow[];
    const selected = rows.find((entry) => entry.selected === 1);
    const channel = modelServiceChannelOf(this.#launch.live.route);
    const native = SEARCH_BACKENDS.find((entry) => channel?.startsWith(`${entry.service}-`));
    const modelConnection = production ? this.#db.prepare("SELECT credential_updated_at FROM model_service_connections WHERE credential_reference = ? AND credential_operation_state = 'ready'").get(this.#launch.live.credentialReference) : undefined;
    const nativeAdmitted = native !== undefined && platformToolsFromProjection(admitted) !== null &&
      admitted.platformTools?.websearch.backends.some((backend) => backend.id === native.id) === true;
    const usingNative = !readSearchOverride(this.#db) && nativeAdmitted && modelConnection !== undefined;
    const selectedRow = selected !== undefined && (!production || (selected.credential_operation_state === 'ready' && typeof selected.credential_reference === 'string')) ? selected : undefined;
    const configuredRows = rows.filter((entry) => !production || (entry.credential_operation_state === 'ready' && typeof entry.credential_reference === 'string'));
    const row = selectedRow ?? configuredRows[0];
    const adapterId = usingNative ? native.id : asString(row?.backend_id ?? '');
    requireAnalysis(adapterId.length > 0, 'SEARCH_CREDENTIAL_MISSING', native === undefined
      ? '当前模型渠道不自带联网搜索，请在 设置 › 联网检索 保存一个后端密钥。'
      : nativeAdmitted ? '当前模型渠道自带联网搜索，可一键启用；请前往 设置 › 联网检索。'
      : '当前模型渠道的原生搜索为候选接口 · 未实测；请前往 设置 › 联网检索 的后端列表，保存一个可用后端的密钥。');
    const adapter = searchBackend(adapterId);
    const webToolsBackend = { backendId: adapter.declaration.id, host: adapter.declaration.host!, configurationDigest: searchBackendConfigurationDigest(adapter.declaration.id),
      selectedAt: usingNative ? asString(modelConnection!.credential_updated_at) : asString(row!.selected_at),
      selectionSource: usingNative ? 'model-channel' as const : 'configured-backend' as const,
      ...(usingNative ? { sourceLabel: channel === null ? native.displayName : MODEL_SERVICE_ROUTE_BINDINGS[channel].providerLabel } : {}) };
    const searchCredentialReference = usingNative ? this.#launch.live.credentialReference
      : production ? asString(row!.credential_reference) : CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES[adapter.declaration.credentialSlot];
    const webToolsFallback = production && !usingNative ? freezeSearchFallback(this.#db, searchFallbackTermsOf(policy), adapter.declaration.id) : undefined;
    return { webToolsBackend, searchCredentialReference, ...(webToolsFallback === undefined ? {} : { webToolsFallback }) };
  }

  /**
   * Freeze one plan version of a Task: the seven components (eight for an update Task) derived from
   * the checkpoint revision, the current Provider Binding, the artifact pin, and the version's own
   * selected range, plus the envelope that pins their digests, the prompt contract, the behavior
   * composition, the version ordinal, and the Plan Boundary Split; then the version row itself.
   * Version 1 is written with the checkpoint; a later version resolves a Plan Revision.
   */
  #writePlanVersion(input: {
    policy?: LaunchPolicyProjection;
    intent: IntentFacts;
    checkpoint: ManuscriptCheckpointBinding;
    checkpointDigest: string;
    ordinal: number;
    selectedRange: BaselineAnalysisSelectedRange | null;
    planRevisionId: string | null;
    instant: string;
    /** What the version leaves out at the editor's word (Issue #419); nothing for a plan AI7 proposed. */
    edits: PlanEdits;
    /**
     * The credential readiness an edit carries forward from the version it edits (Issue #419): readiness is not a
     * material input, so an edit leaves the provider component as it froze. Absent, the connection is read now.
     */
    credentialReadiness?: ModelCredentialOperationState;
  }): { planVersionId: string; planEnvelopeDigest: string } {
    const { intent, checkpoint, ordinal, instant } = input;
    if (this.#route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE) requireAnalysis(intent.mode === 'review-first' &&
      intent.selectedRange === null && intent.preparedByEnrollmentVersionId === null,
    'ANALYSIS_CHILD_PROFILE_REFUSED', '单元子代理只适用于标准前台全文首次审阅。');
    const taskIntentId = intent.taskIntentId;
    // A later version never re-validates the checkpoint against the working head: manuscript edits are non-material.
    const facts = this.#binding(checkpoint.bookId, checkpoint, ordinal === 1);
    const blocks = this.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId);
    const factualRange = this.#definition.kind === FACTUAL_REVIEW_KIND && input.selectedRange !== null;
    const priorManifest = !factualRange || intent.predecessorRevisionId === null ? null
      : this.#planPredecessor(this.#revisionRowById(intent.predecessorRevisionId)).manifest;
    const positions = new Map(blocks.map(block => [block.blockId, block.position]));
    const manifest = deriveCoverageManifest({
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      branchId: checkpoint.branchId,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      revisionDigest: checkpoint.revisionDigest,
      blocks,
      ...(factualRange ? { exactRange: input.selectedRange!, priorRangeBoundaries: priorManifest?.units
        .filter(unit => unit.overlapBlockIds.length === 0)
        .flatMap(unit => { const position = positions.get(unit.blockIds[0]!); return position === undefined ? [] : [position]; }) ?? [] } : {}),
    });
    const live = this.#launch.live;
    const production = live !== null && live.scope === 'ordinary-production' ? live : null;
    // The editor's ceiling is the plan's own outside developer-live (Issue #51, S16a); under it the launch sets the
    // ceiling, so a redo that copies a ceiling the editor once set keeps the rest of the edit and not the ceiling.
    const edits = !launchSetsCeilingOf(live) ? input.edits : withoutCeiling(input.edits);
    // The factual Task's level decides its contract and its research declaration (Issue #901); every other kind's is its own.
    const baseDefinition = this.#planDefinition(edits, intent.mode);
    const selected = intent.record.procedure as ProcedureDefinitionPin | undefined;
    const document = selected === undefined ? null : resolveProcedureForKind(this.#db, selected, baseDefinition.kind).document;
    if (selected !== undefined && document !== null) {
      const currentId = baseDefinition.factualClaims === undefined ? procedureIdForKind(baseDefinition.kind) : FACTUAL_CLAIM_PROCEDURE_ID;
      if (currentId !== null) validateProcedureEdit(resolveProcedureDefinition(this.#db, currentId, currentPreinstalledVersion(currentId)).document,
        { procedureId: null, basedOn: selected, title: document.title, editorInstruction: document.editorInstruction, stages: document.stages });
    }
    const unwrappedDefinition = selected === undefined || document === null ? baseDefinition : withProcedureDefinition(baseDefinition, document, selected);
    // Plan edits keep their original memory; a newly initiated task selects current enabled rules.
    const firstEnvelope = ordinal === 1 ? undefined : this.#db.prepare(
      "SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = 1 AND component = 'plan-envelope'",
    ).get(taskIntentId);
    const memory = ordinal === 1 ? this.#currentEditorialMemory(checkpoint.bookId)
      : firstEnvelope === undefined ? null : (parseCanonicalJson(asString(firstEnvelope.canonical_json)) as { editorialMemory?: EditorialMemorySnapshot }).editorialMemory ?? null;
    const definition = withEditorialMemoryDefinition(unwrappedDefinition, memory);
    if (selected !== undefined) requireAnalysis(!procedureStopped(this.#db, selected), 'PROCEDURE_STOPPED', '所选工序版本已停用，请选择另一个版本。');
    if (selected !== undefined && document !== null && procedureInstruction(document, selected) !== '' && live !== null) {
      requireAnalysis(liveKindRule(this.#launch.policy, definition.kind, ['editor-task-instruction'])?.editorTaskInstruction !== undefined,
        'PROCEDURE_INSTRUCTION_NOT_ADMITTED', '这项任务暂不支持带编辑指令的工序。');
    }
    let reusePlan: AnalysisPlanRecord | null = null;
    if (this.#carriesPlan(intent.mode)) {
      const latestRow = this.#revisionRows(checkpoint.bookId).at(-1);
      if (this.#isInitial(intent.mode)) {
        // A range-bound first Task starts the Result Set: a revision that appeared since it was
        // prepared makes it an update of that revision, which is a different Task.
        requireAnalysis(intent.predecessorRevisionId === null && latestRow === undefined,
          'ANALYSIS_PREDECESSOR_DRIFT', '本图书已存在结果集修订版；请基于最新修订版重新准备更新。');
      } else {
        requireAnalysis(intent.predecessorRevisionId !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
        requireAnalysis(latestRow !== undefined && asString(latestRow.revision_id) === intent.predecessorRevisionId,
          'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；请基于最新修订版重新准备更新。');
      }
      reusePlan = this.#derivePlan(
        intent.mode,
        this.#definition.mode(intent.mode).rangeBound ? requireSelectedRange(input.selectedRange, manifest.totalBlocks) : null,
        manifest,
        latestRow === undefined ? null : this.#planPredecessor(latestRow),
        definition,
      );
    }
    const manuscriptPin = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      revisionId: checkpoint.revisionId,
      revisionLabel: checkpoint.revisionLabel,
      revisionDigest: checkpoint.revisionDigest,
      sourceVersionId: facts.sourceVersionId,
      // Exact sample1 outside ordinary production, which #binding enforced; the editor's own Book's source under it (Issue #811).
      sourceDigest: facts.sourceDigest,
    };
    const artifactPin = {
      identity: '@ai7/editorial-workspace-profile',
      version: '1.0.0',
      nativeCarrierSha256: NATIVE_CARRIER_DIGEST,
      sidecarIdentity: 'ai7.editorial-workspace-profile.authority',
      sidecarRevision: 2,
      sidecarSha256: SIDECAR_DIGEST,
    };
    const sourceScopeBase = {
      bookId: checkpoint.bookId,
      manuscriptId: checkpoint.manuscriptId,
      taskInputRevision: { revisionId: checkpoint.revisionId, revisionDigest: checkpoint.revisionDigest },
      readableScopeKinds: [this.#definition.manuscriptTarget === undefined ? 'current-book-primary-manuscript-revision' : 'current-book-production-document-revision'],
      ...(this.#definition.seriesScopes === undefined ? {} : { readableScopeKinds: ['current-book-primary-manuscript-revision', 'series'],
        seriesScopes: this.#definition.seriesScopes.map((scope) => ({ ...scope, members: scope.members.map((member) => member.bookId !== checkpoint.bookId ? member : {
          ...member, manuscriptId: checkpoint.manuscriptId, revisionId: checkpoint.revisionId, revisionDigest: checkpoint.revisionDigest, sourceVersionId: facts.sourceVersionId,
        }) })) }),
      sourceVersionEvidence: { sourceVersionId: facts.sourceVersionId, readable: false },
      ...(intent.intentDraftParagraphs === null ? {} : {
        draftRangeExpansion: {
          paragraphs: intent.intentDraftParagraphs,
          statement: `所选文字已扩展为所在的 ${intent.intentDraftParagraphs} 个完整段落；任务按包含这些段落的阅读范围处理。`,
        },
      }),
    };
    // An update Run admits only the recomputed units' messages; a reused unit never forms a model-bound
    // payload, and neither does a unit a scope plan leaves unreviewed — which the scope says in so many
    // words, and only a scope plan says, so a baseline scope keeps the two lists it has always had.
    const planUnits: ReadonlyArray<{ unitOrdinal: number; disposition: 'reused' | 'recomputed' | 'unreviewed' }> = reusePlan?.units ?? [];
    const ordinalsOf = (disposition: 'reused' | 'recomputed' | 'unreviewed'): number[] =>
      planUnits.filter((unit) => unit.disposition === disposition).map((unit) => unit.unitOrdinal);
    const unreviewedCount = reusePlan !== null && 'unreviewed' in reusePlan.counts ? reusePlan.counts.unreviewed : null;
    const sourceScope = reusePlan === null ? sourceScopeBase : {
      ...sourceScopeBase,
      unitScope: {
        mode: reusePlan.mode,
        recomputedUnitOrdinals: ordinalsOf('recomputed'),
        reusedUnitOrdinals: ordinalsOf('reused'),
        ...(unreviewedCount === null ? {} : { unreviewedUnitOrdinals: ordinalsOf('unreviewed') }),
      },
    };
    // The plan freezes whichever binding the launch bound: the denied production binding on the
    // deterministic route, or the selected developer-live binding. Both are frozen before authorization, never chosen
    // at dispatch, so an authorized Run can never transmit somewhere its plan did not name.
    const promptContractDigest = definition.promptContractDigest;
    const admittedToolRule = this.#definition.kind === BASELINE_ANALYSIS_KIND || intent.preparedByEnrollmentVersionId !== null ? null
      : liveKindRule(this.#launch.policy, this.#definition.kind);
    const toolsProjection: unknown = admittedToolRule !== null && 'platformTools' in admittedToolRule ? admittedToolRule.platformTools : null;
    // A Task a 后台分析登记 prepared declares no research, as before the declaration existed (#744 keeps #887's guard).
    const researchDeclaration = admittedToolRule === null ? { webSearch: false, searchEngine: null } as const
      : kindResearchDeclaration(this.#launch.policy, definition.kind, definition.researchDeclaration);
    const { webToolsBackend, searchCredentialReference, webToolsFallback } = this.#currentSearchPlan(definition, intent.preparedByEnrollmentVersionId, input.policy);
    const leafMode = intent.mode === 'review-first' && intent.selectedRange === null && intent.preparedByEnrollmentVersionId === null;
    const composition = live === null
      ? describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, promptContractDigest, this.#newCompositionOptions(checkpoint.bookId, leafMode, definition, selected))
      : describeComposition(live.route, live.model, promptContractDigest, { platformTools: webToolsBackend !== undefined && definition.factualClaims === undefined,
        researchDeclaration: definition.factualClaims === undefined ? researchDeclaration : { webSearch: false, searchEngine: null },
        ...this.#newCompositionOptions(checkpoint.bookId, leafMode, definition, selected),
        localTools: intent.preparedByEnrollmentVersionId === null && definition.evidenceAssuranceLevel !== 'quick' && definition.factualClaims === undefined ? kindLocalTools(this.#launch.policy, this.#definition.kind) ?? false : false });
    const providerPlan = {
      ...this.#selectedPlanMetadata(input.policy),
      ...(webToolsBackend === undefined ? {} : { webToolsBackend, searchCredentialReference }), ...(webToolsFallback === undefined ? {} : { webToolsFallback }),
      role: 'Main Editorial Role',
      capabilities: [],
      remoteBinding: live === null
        ? {
            providerId: 'deepseek-open-platform',
            modelId: 'deepseek-v4-pro',
            adapterRevision: 1,
            configurationRevision: 1,
            approvedFallbackChain: [],
            credentialSlot: 'deepseek-api-key',
            credentialReference: facts.credentialReference,
            credentialReadiness: input.credentialReadiness ?? facts.credentialOperationState,
            providerProcessing: { operationalScope: 'development-ci', version: this.#selectedPlanMetadata(input.policy).selectedPolicyIdentity?.providerProcessingVersion ?? 'v1',
              decision: 'deny', authorizedLiveTransmissionCount: 0 },
          }
        : {
            providerId: live.route,
            modelId: live.model,
            adapterRevision: 1,
            configurationRevision: 1,
            approvedFallbackChain: [],
            credentialSlot: live.credentialSlot,
            credentialReference: live.credentialReference,
            credentialReadiness: input.credentialReadiness ?? facts.credentialOperationState,
            providerProcessing: production !== null
              ? { operationalScope: 'ordinary-production', version: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' }
              : { operationalScope: 'developer-live', version: DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION, decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' },
          },
      executionRoute: live !== null
        ? { kind: live.route, model: live.model, endpoint: live.endpoint,
            ...(effectiveModelReasoningEffort(modelProfileFor(live.route, live.model), live.reasoningEffort) === null ? {} :
              { reasoningEffort: effectiveModelReasoningEffort(modelProfileFor(live.route, live.model), live.reasoningEffort) }) }
        : this.#route === null
          ? { kind: 'none', reason: 'j04-model-adapter-control-absent' }
          : {
              kind: LOCAL_DETERMINISTIC_ROUTE,
              model: LOCAL_DETERMINISTIC_MODEL,
              fixtureIdentity: this.#route.fixtureIdentity,
              fixtureSha256: this.#route.fixtureSha256,
              fixtureLineage: this.#route.fixtureLineage,
            },
      outboundDataCategory: production !== null ? 'unpublished-excerpts' : 'public-or-synthetic',
      runBudgetCeiling: this.#planCeiling(manifest.units.length, planEditCeiling(edits), intent.backgroundRunBudgetCeiling),
    };
    const dispatchAllowed = live !== null || this.#route !== null;
    const stopCondition = production !== null
      ? `Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} binds the configured ${production.route} under ordinary-production; the Coverage Manifest unit count and the plan's own Run Budget Ceiling, when set, bound every transmission`
      : live !== null
      ? `Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} binds opencode-go under developer-live; the Run Budget Ceiling and the Coverage Manifest unit count bound every transmission`
      : dispatchAllowed
        ? 'Provider Processing v1 denies the remote route; execution binds only ai7-local-deterministic'
        : 'Provider Processing v1 denies the remote route and no local deterministic route is bound';
    // An edited plan names what it leaves out; a plan AI7 proposed names nothing, so its record reads as before.
    const editorEdits = planEditsAreEmpty(edits) ? {} : { editorEdits: edits };
    const executionPlan = reusePlan === null
      ? { steps: definition.executionSteps, effects: [], unitCount: manifest.units.length, reducerStages: this.#definition.reducerStages, stopCondition, ...editorEdits }
      : {
          steps: definition.updateExecutionSteps,
          effects: [],
          unitCount: manifest.units.length,
          recomputedUnitCount: reusePlan.counts.recomputed,
          reusedUnitCount: reusePlan.counts.reused,
          ...(unreviewedCount === null ? {} : { unreviewedUnitCount: unreviewedCount }),
          reducerStages: this.#definition.reducerStages,
          stopCondition,
          ...editorEdits,
        };
    // The sampling contract, only when it is not /1 (Issue #826): every other plan's record reads exactly as before.
    const assurance = definition.assurance;
    const samplingPin = assurance !== null && assurance.promptContractDigest !== ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST
      ? { assurancePromptContractDigest: assurance.promptContractDigest }
      : {};
    const clarificationPin = unwrappedDefinition.clarificationBase === undefined ? {} : {
      clarificationBasePromptContractDigest: unwrappedDefinition.clarificationBase.promptContractDigest,
    };
    const records: Record<string, { json: string; digest: string }> = {
      'manuscript-pin': canonicalRecord(manuscriptPin),
      'artifact-pin': canonicalRecord(artifactPin),
      'run-source-scope': canonicalRecord(composition.sources === undefined ? sourceScope : { ...sourceScope, localToolSources: composition.sources }),
      'coverage-manifest': canonicalRecord(manifest),
      'provider-resolution-plan': canonicalRecord(providerPlan),
      'execution-plan': canonicalRecord(this.#definition.materialReferences === undefined ? { ...executionPlan, ...samplingPin, ...clarificationPin } : {
        ...executionPlan,
        ...samplingPin,
        ...clarificationPin,
        materialReferences: this.#definition.materialReferences.sources,
        materialReferenceBasePromptContractDigest: this.#definition.materialReferences.basePromptContractDigest,
      }),
    };
    if (webToolsBackend !== undefined) records['web-tools-backend'] = canonicalRecord(webToolsBackend);
    if (reusePlan !== null) records['reuse-plan'] = reusePlanRecord(reusePlan);
    const envelopeBase = {
      ...(intent.record.factualDecision === undefined ? {} : { factualDecision: intent.record.factualDecision }),
      providerStatus: production !== null
        ? 'remote-eligible-ordinary-production'
        : live !== null
        ? 'remote-eligible-developer-live'
        : dispatchAllowed ? 'remote-denied-local-deterministic' : 'remote-denied-no-route',
      dispatchAllowed,
      summary: production !== null
        ? `计划已冻结；ordinary-production · Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} 绑定你配置的 ${production.route} · ${production.model}，每个单元实际调用`
        : live !== null
        ? `计划已冻结；developer-live · Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} 允许绑定 ${live.route} · ${live.model}，实时传输受运行边界约束`
        : dispatchAllowed
          ? '计划已冻结；远程绑定被 Provider Processing v1 拒绝，执行绑定至 AI7 本地确定性模型适配器'
          : '计划已冻结；远程绑定被 Provider Processing v1 拒绝，且没有可执行的本地路由',
      ...(webToolsBackend === undefined ? {} : { webToolsBackendDigest: records['web-tools-backend']!.digest }),
      taskIntentId,
      checkpointDigest: input.checkpointDigest,
      manuscriptPinDigest: records['manuscript-pin']!.digest,
      artifactPinDigest: records['artifact-pin']!.digest,
      runSourceScopeDigest: records['run-source-scope']!.digest,
      coverageManifestDigest: manifest.digest,
      providerResolutionPlanDigest: records['provider-resolution-plan']!.digest,
      executionPlanDigest: records['execution-plan']!.digest,
      promptContractDigest,
      ...(memory === null ? {} : { editorialMemory: memory, editorialMemoryBasePromptContractDigest: unwrappedDefinition.promptContractDigest }),
      ...(definition.procedureBinding === undefined ? {} : { basePromptContractDigest: baseDefinition.promptContractDigest }),
      ...(definition.contractIdentity === undefined ? {} : { contractIdentity: { ...definition.contractIdentity, digest: promptContractDigest } }),
      behaviorCompositionDigest: composition.digest,
      compositionVersion: composition.version,
      compositionOptions: { version: composition.version, ...(composition.subagents === false ? {} : { subagents: composition.version === 4 ? STOCK_TYPOS_FANOUT : STOCK_TYPOS_LEAF, localTools: STOCK_TYPOS_LEAF_LOCAL_TOOLS }),
        ...(composition.procedure === undefined ? {} : { procedure: composition.procedure }),
        ...(composition.stages === undefined ? {} : { stages: composition.stages }),
        ...(composition.sources === undefined ? {} : { sources: composition.sources }) },
      // The plan version and the Plan Boundary Split are part of the canonical envelope (Issue #48).
      planVersion: ordinal,
      boundary: planBoundarySplit(edits.disallowedAdaptations, edits.askFirstAdaptations ?? [], true,
        providerPlan.selectedPolicyIdentity !== undefined),
    };
    const envelope = canonicalRecord(reusePlan === null ? envelopeBase : {
      ...envelopeBase,
      updateMode: reusePlan.mode,
      // `null` only for a range-bound first Task's scope plan; a baseline plan always names its predecessor.
      predecessorRevisionId: reusePlan.predecessor?.revisionId ?? null,
      predecessorRevisionDigest: reusePlan.predecessor?.digest ?? null,
      reusePlanDigest: records['reuse-plan']!.digest,
    });
    const insert = this.#db.prepare(
      'INSERT INTO analysis_plan_records(task_intent_id, plan_version, component, canonical_json, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const [component, record] of Object.entries(records)) insert.run(taskIntentId, ordinal, component, record.json, record.digest, instant);
    insert.run(taskIntentId, ordinal, 'plan-envelope', envelope.json, envelope.digest, instant);
    const planVersionId = randomUUID();
    const version = canonicalRecord({ planVersionId, taskIntentId, ordinal, planRevisionId: input.planRevisionId, planEnvelopeDigest: envelope.digest, createdAt: instant });
    this.#db.prepare(
      `INSERT INTO analysis_plan_versions(plan_version_id, task_intent_id, ordinal, plan_revision_id, plan_envelope_sha256, created_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(planVersionId, taskIntentId, ordinal, input.planRevisionId, envelope.digest, instant, version.json, version.digest);
    if (composition.procedure !== undefined) recordProcedurePlanPin(this.#db, taskIntentId, envelope.digest, (selected ?? composition.procedure).procedureId, (selected ?? composition.procedure).version);
    return { planVersionId, planEnvelopeDigest: envelope.digest };
  }

  // ---- authorization -----------------------------------------------------------------------------

  /**
   * A Run that would dispatch is recorded `authorized` and named for the execution owner, which admits it at once or,
   * while the governor has no place, when one frees (Issue #49, S14; CONC-007): nothing is refused for a busy
   * instance, and a repeat of an authorization already recorded answers as it always has.
   *
   * `start` is `when-online` for 联网后开始任务 (Issue #502; AUTH-004, OFF-005): the same exact Run Authorization
   * and Run Record, and the Run then waits in Connectivity Wait instead of being handed to the slot — nothing
   * sent, no usage, nothing implying it began. Only a plan that could dispatch can wait, and a waiting Run takes
   * no slot, so a busy slot refuses only a start that would dispatch now.
   *
   * `origin` is `default-execution-rule` for 快速开始 (Issue #421; TASK-020, TASK-028): the same records, the
   * authorization naming the rule version the start was made under. Whether the rule may start this plan is the
   * caller's to have settled; the rule never widens what the plan binds.
   */
  authorize(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    start: 'now' | 'when-online' | 'idle' = 'now',
    origin: AnalysisAuthorizationOrigin = STANDARD_DIRECT,
  ): { projection: AnalysisProjection; dispatchRunRecordId: string | null } {
    if (this.#route?.fixtureIdentity === STOCK_TYPOS_LEAF_FIXTURE) requireAnalysis(start === 'now' && origin.kind === 'standard-direct',
      'ANALYSIS_CHILD_PROFILE_REFUSED', '单元子代理只适用于直接授权的前台审阅。');
    // The baseline rule of the selected Provider Processing admits one kind and one origin, each refused under its own code, as preparation refuses them.
    requireAnalysis(this.#liveReading() !== MODEL_SERVICE_SETUP_REQUIRED, 'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', MODEL_SERVICE_SETUP_REQUIRED_REASON);
    if (this.#launch.live !== null) {
      const scope = this.#launch.operationalScope;
      const admitted = this.#definition.kind === BASELINE_ANALYSIS_KIND ? null : plannedRunAdmission(this.#launch.policy, this.#definition, this.#launch.live);
      requireAnalysis(this.#definition.kind === BASELINE_ANALYSIS_KIND || admitted !== null,
        'ANALYSIS_KIND_NOT_ADMITTED', `${scope} 当前只允许基线稿件分析；该任务种类尚未获准实时执行。`);
      // Every admitted kind starts by a direct authorization; writing's developer-live quick start and a kind whose
      // selected rule admits a matching active default execution rule may also start under that rule (Issue #866).
      // A 后台分析登记's start only under the selected policy's enrolled-background rule (Issue #864; Provider Processing v14/v15).
      requireAnalysis(origin.kind === 'standard-direct' || (origin.kind === 'default-execution-rule' && admitted !== null &&
          ((this.#definition.kind === WRITING_KIND && scope === 'developer-live') ||
            liveKindRule(this.#launch.policy, this.#definition.kind)?.matchingActiveDefaultExecutionRuleAllowed === true)) ||
          (origin.kind === 'background-analysis-enrollment' && this.#definition.kind === BASELINE_ANALYSIS_KIND &&
            liveKindRule(this.#launch.policy, BASELINE_ANALYSIS_KIND, [], 'background') !== null),
        'ANALYSIS_ORIGIN_NOT_ADMITTED', `${scope} 当前只允许直接授权的基线稿件分析。`);
    }
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest) &&
      (origin.kind === 'standard-direct' || (start === 'now' && UUID_PATTERN.test(origin.kind === 'default-execution-rule' ? origin.ruleVersionId : origin.enrollmentVersionId))),
    'ANALYSIS_AUTHORIZATION_INVALID', '任务运行授权参数无效。');
    const prepared = this.inspect(bookId);
    requireAnalysis(prepared.taskIntent?.taskIntentId === taskIntentId && prepared.planEnvelope !== null && prepared.planVersion !== null,
      'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
    if (prepared.planEnvelope.compositionVersion === 3 || prepared.planEnvelope.compositionVersion === 4) requireAnalysis(start === 'now' && origin.kind === 'standard-direct',
      'ANALYSIS_CHILD_PROFILE_REFUSED', '单元子代理只适用于直接授权的前台审阅。');
    if (prepared.authorization !== null) {
      requireAnalysis(prepared.planEnvelope.digest === planEnvelopeDigest, 'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
      return { projection: prepared, dispatchRunRecordId: null };
    }
    // Version-bound authorization (Issue #48): a superseded plan version, or the current version while a
    // Plan Revision is pending, is refused with the safe reason `plan-revision-required` and no Run Record.
    const namesSupersededVersion = prepared.planVersions.some((version) => version.planEnvelopeDigest === planEnvelopeDigest && version.ordinal < prepared.planVersion!.ordinal);
    requireAnalysis(!namesSupersededVersion && prepared.planRevision === null, 'ANALYSIS_PLAN_REVISION_REQUIRED',
      `计划需要修订（${PLAN_REVISION_REQUIRED_REASON}）：该计划版本已被取代或有待重新确认的计划修订；请查看计划修订并重新确认计划后再授权。`);
    requireAnalysis(prepared.planEnvelope.digest === planEnvelopeDigest, 'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
    requireAnalysis(prepared.state === 'prepared', 'ANALYSIS_AUTHORIZATION_INVALID', '任务计划尚未准备完成。');
    // An update Task is re-verified against the Result Set: its predecessor must still be the latest revision.
    requireAnalysis(prepared.update === null || prepared.update.predecessorCurrent,
      'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；无法授权。请基于最新修订版重新准备更新。');
    requireAnalysis(prepared.actions.canAuthorize, 'ANALYSIS_REUSE_PLAN_DRIFT', REUSE_PLAN_DRIFT_AUTHORIZE_REASON);
    const dispatchAllowed = prepared.planEnvelope.dispatchAllowed;
    requireAnalysis(start === 'now' || dispatchAllowed, 'ANALYSIS_START_WHEN_ONLINE_INVALID', '这份计划没有可执行的路由，不能联网后开始。');
    const authorizationId = randomUUID();
    const runRecordId = randomUUID();
    const instant = new Date().toISOString();
    const authority = dispatchAllowed ? 'standard-direct-dispatch' : 'record-only-no-dispatch';
    const authorization = canonicalRecord({
      authorizationId,
      origin: origin.kind,
      startWhen: start === 'idle' ? 'idle' : 'now',
      planEnvelopeDigest,
      planVersionId: prepared.planVersion.planVersionId,
      planVersionOrdinal: prepared.planVersion.ordinal,
      taskIntentId,
      authority,
      ...(origin.kind === 'default-execution-rule' ? { ruleVersionId: origin.ruleVersionId } : {}),
      ...(origin.kind === 'background-analysis-enrollment' ? { enrollmentVersionId: origin.enrollmentVersionId } : {}),
    });
    const procedure = readProcedurePlanPin(this.#db, planEnvelopeDigest);
    requireAnalysis(procedure === null || !procedureStopped(this.#db, procedure), 'PROCEDURE_STOPPED', '计划固定的工序版本已停用，请选择另一个版本重新准备。');
    const run = canonicalRecord({ runRecordId, authorizationId, taskIntentId, recordedAt: instant,
      ...(procedure === null ? {} : { procedure }) });
    transact(this.#db, () => {
      this.#db.prepare(
        `INSERT INTO analysis_run_authorizations(authorization_id, task_intent_id, plan_envelope_sha256, origin, authority, authorized_at, canonical_json, sha256, start_when)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(authorizationId, taskIntentId, planEnvelopeDigest, origin.kind, authority, instant, authorization.json, authorization.digest, start === 'idle' ? 'idle' : 'now');
      this.#db.prepare(
        'INSERT INTO analysis_run_records(run_record_id, task_intent_id, authorization_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
      this.#insertRunState(runRecordId, 1, 'authorized', origin.kind === 'standard-direct'
        ? { detail: '标准直接运行授权已记录。' }
        : origin.kind === 'default-execution-rule'
          ? { detail: '快速开始按默认执行规则记录了运行授权。', ruleVersionId: origin.ruleVersionId }
          : { detail: BACKGROUND_AUTHORIZED_DETAIL, enrollmentVersionId: origin.enrollmentVersionId }, instant);
      if (!dispatchAllowed) {
        const reasons = blockedReasons(this.#liveReading());
        this.#insertRunState(runRecordId, 2, 'blocked-before-dispatch', { detail: reasons.join(' '), reasons }, instant);
      } else if (start === 'when-online') {
        this.#insertRunState(runRecordId, 2, 'awaiting-connectivity', { detail: CONNECTIVITY_WAIT_DETAIL }, instant);
      }
    });
    return { projection: this.inspect(bookId), dispatchRunRecordId: dispatchAllowed && start !== 'when-online' ? runRecordId : null };
  }

  // ---- Connectivity Wait (Issue #502, plan slice S74b) -------------------------------------------------

  /**
   * 取消 while the Book's Run waits (OFF-010): the terminal cancellation, before any dispatch and without
   * provider work. Only a waiting Run can be cancelled here — one already admitted has begun, and pausing or
   * cancelling it is S76's — and cancelling twice answers as the first did.
   */
  cancelWaiting(bookId: string, taskIntentId: string): AnalysisProjection {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId), 'ANALYSIS_CANCEL_INVALID', '取消任务的参数无效。');
    const current = this.inspect(bookId);
    const run = current.run;
    requireAnalysis(current.taskIntent?.taskIntentId === taskIntentId && run !== null, 'ANALYSIS_CANCEL_STALE', '这项任务已经变化；无法取消。');
    if (run.state === 'cancelled') return current;
    // 取消 on a Task of another kind whose Run never began: blocked before dispatch after it waited — its plan moved, or this
    // launch could not start it (Issue #764). Under developer-live 初评 cannot be prepared again, so nothing else would end it;
    // the item leaves 待我处理 once the Run is cancelled. A Run that began (so one holding a 结果待确认 range) is never here.
    if (run.state === 'blocked-before-dispatch' && this.#definition.kind !== BASELINE_ANALYSIS_KIND && !runBegan(run.transitions)) {
      this.recordRunState(run.runRecordId, 'cancelled', { detail: '编辑取消了这项没能开始的任务；没有发送任何内容，也没有产生用量。' });
      return this.inspect(bookId);
    }
    // A Run waiting on the governor (Issue #49, S14) is cancelled the same way: nothing of it ran either.
    requireAnalysis(run.state === 'awaiting-connectivity' || run.state === 'authorized', 'ANALYSIS_CANCEL_NOT_WAITING', '只有等待中或没能开始的任务可以在这里取消；它已经开始或已经结束。');
    this.recordRunState(run.runRecordId, 'cancelled', {
      detail: run.state === 'authorized'
        ? '编辑在派发前取消了这项等待运行名额的任务；没有发送任何内容，也没有产生用量。'
        : '编辑在派发前取消了这项等待中的任务；没有发送任何内容，也没有产生用量。',
    });
    return this.inspect(bookId);
  }

  // ---- 取消任务 (Issue #422, plan slice S76a) ------------------------------------------------------------

  /**
   * 取消任务 on the Book's started Run (CTRL-004 to CTRL-008), once the editor confirmed the Cancellation Impact
   * Summary: `cancelling` is recorded at once and the Run is named for the execution owner, which stops it at the
   * next unit boundary and records `cancelled`. A waiting Run is cancelled by `cancelWaiting` instead, since
   * nothing of it ran. A Run already cancelling is named again — the owner that holds it stops it once, and one AI7
   * left behind when it last closed is settled there — and one already cancelled answers as it did.
   */
  requestCancel(bookId: string, taskIntentId: string): { projection: AnalysisProjection; runRecordId: string | null } {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId), 'ANALYSIS_CANCEL_INVALID', '取消任务的参数无效。');
    const current = this.inspect(bookId);
    const run = current.run;
    requireAnalysis(current.taskIntent?.taskIntentId === taskIntentId && run !== null, 'ANALYSIS_CANCEL_STALE', '这项任务已经变化；无法取消。');
    if (run.state === 'cancelled') return { projection: current, runRecordId: null };
    if (run.state === 'cancelling') return { projection: current, runRecordId: run.runRecordId };
    requireAnalysis(run.state !== 'awaiting-connectivity' && run.state !== 'authorized', 'ANALYSIS_CANCEL_WAITING', '这项任务还在等待开始；请用等待中的「取消」。');
    // A paused Run, one pausing, one left 可续行 (Issue #422, S76b) and one waiting for the editor's answer (S76d) are
    // cancelled as a running one is.
    requireAnalysis(run.state === 'admitted' || run.state === 'executing' || run.state === 'pausing' || run.state === 'paused' || run.state === 'resumable' ||
      run.state === 'awaiting-clarification',
      'ANALYSIS_CANCEL_NOT_RUNNING', '只有正在运行或暂停中的任务可以取消；它尚未开始或已经结束。');
    this.recordRunState(run.runRecordId, 'cancelling', { detail: RUN_CANCELLING_DETAIL });
    return { projection: this.inspect(bookId), runRecordId: run.runRecordId };
  }

  /** What settling a cancellation needs of a Run it did not reach through its plan: its Task Intent and its attempt. */
  cancellationFacts(runRecordId: string): { taskIntentId: string; attemptId: string | null } {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const run = this.#db.prepare('SELECT task_intent_id FROM analysis_run_records WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    requireAnalysis(run !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const attempt = this.#db.prepare('SELECT attempt_id FROM analysis_execution_attempts WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    return { taskIntentId: asString(run.task_intent_id), attemptId: attempt === undefined ? null : asString(attempt.attempt_id) };
  }

  // ---- 暂停 and 续行 (Issue #422, plan slice S76b) -----------------------------------------------------------

  /**
   * 暂停 (CTRL-001): `pausing` is recorded at once and the Run is named for the execution owner, which stops it at the
   * next unit boundary and records `paused` once what it read is kept. Pausing twice names the same Run and records
   * nothing more; a Run already paused, or left 可续行, answers as it is.
   */
  requestPause(bookId: string, taskIntentId: string): { projection: AnalysisProjection; runRecordId: string | null } {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId), 'ANALYSIS_PAUSE_INVALID', '暂停任务的参数无效。');
    const current = this.inspect(bookId);
    const run = current.run;
    requireAnalysis(current.taskIntent?.taskIntentId === taskIntentId && run !== null, 'ANALYSIS_PAUSE_STALE', '这项任务已经变化；无法暂停。');
    if (run.state === 'paused' || run.state === 'resumable' || run.state === 'awaiting-clarification') return { projection: current, runRecordId: null };
    if (run.state === 'pausing') return { projection: current, runRecordId: run.runRecordId };
    requireAnalysis(run.state === 'admitted' || run.state === 'executing', 'ANALYSIS_PAUSE_NOT_RUNNING', '只有正在运行的任务可以暂停；它尚未开始、正在取消或已经结束。');
    this.recordRunState(run.runRecordId, 'pausing', { detail: RUN_PAUSING_DETAIL });
    return { projection: this.inspect(bookId), runRecordId: run.runRecordId };
  }

  /** The paused or 可续行 Run of the Book's current Task, which 续行 would continue; `null` when there is none. */
  continuableRun(bookId: string, taskIntentId: string): string {
    requireAnalysis(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId), 'ANALYSIS_RESUME_INVALID', '续行的参数无效。');
    const current = this.inspect(bookId);
    const run = current.run;
    requireAnalysis(current.taskIntent?.taskIntentId === taskIntentId && run !== null, 'ANALYSIS_RESUME_STALE', '这项任务已经变化；无法续行。');
    requireAnalysis(run.state === 'paused' || run.state === 'resumable', 'ANALYSIS_RESUME_NOT_PAUSED', '只有已暂停或中断后可续行的任务可以续行。');
    // 结果待确认 (Issue #51, S16c; ADR 0034, CONT-011, CONT-016): the Run does not go on; nothing the old authorization covers
    // may send again under it.
    requireAnalysis(this.outcomeUnknownOf(run.runRecordId) === null, 'ANALYSIS_RESUME_OUTCOME_UNKNOWN', OUTCOME_UNKNOWN_NO_RESUME);
    return run.runRecordId;
  }

  /**
   * 续行's lightweight revalidation (CONT-015, CONT-016), local half: the reasons a paused Run cannot go on as it was
   * authorized — its bound plan's material inputs moved (the same comparison Reconnect Preflight makes), or its
   * continuation checkpoints no longer read back — or none. The route's credential is the service's to read.
   */
  continuationBlockers(runRecordId: string): ReadonlyArray<string> {
    const drift = this.preflightDrift(runRecordId);
    // CONT-016: material drift routes to a newly authorized Redo Run — 改计划重做 — never past the old authorization.
    const reasons = drift.length === 0 ? [] : [`计划的关键内容已经变化：${drift.join('、')}。这次运行不能照原计划续行；请改计划重做。`];
    try {
      this.unitCheckpoints(runRecordId);
      this.stageContinuationOf(runRecordId);
    } catch {
      reasons.push('已保存的阅读进度无法核对，这次运行不能续行；请取消它，再重新开始。');
    }
    return reasons;
  }

  /** Read the latest optional stage evidence, refusing corrupt or incompatible evidence before admission. */
  stageContinuationOf(runRecordId: string): StageContinuation | null {
    const rows = this.#db.prepare('SELECT canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC').all(runRecordId) as SqlRow[];
    for (const row of rows) {
      const record = parseCanonicalJson(asString(row.canonical_json)) as { stageContinuation?: { schema?: unknown; data?: StageContinuation; digest?: unknown }; carriedUsage?: unknown };
      const kept = record.stageContinuation;
      if (kept === undefined) continue;
      const invalid = (): never => { throw new AnalysisError('ANALYSIS_RECORD_INVALID', '已保存的阶段进度无法核对；不能续行。'); };
      if (canonicalRecord(record).digest !== row.sha256 || kept === null || kept.schema !== 'ai7.analysis.stage-continuation/1' ||
          kept.data === undefined || canonicalRecord(kept.data).digest !== kept.digest || JSON.stringify(kept).length > 16_777_216) invalid();
      const data = kept.data!;
      const stored = this.executionBindingOf(runRecordId);
      if (stored === null || data.runRecordId !== runRecordId || data.attemptId !== stored.attemptId || data.bindingDigest !== stored.bindingDigest ||
          data.manifestDigest !== stored.binding.coverageManifestDigest || data.promptContractDigest !== stored.binding.promptContractDigest || record.carriedUsage === undefined || data.reduction === undefined) invalid();
      const definition = this.definitionForRun(runRecordId, data.promptContractDigest);
      const count = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
      if (data.reduction !== undefined) {
        const reduction = data.reduction;
        if (!DIGEST_PATTERN.test(reduction.inputDigest) || reduction.contractDigest !== (definition.crossUnit?.promptContractDigest ?? data.promptContractDigest) ||
            !['closed', 'gap', 'not-run'].includes(reduction.outcome?.state) ||
            (reduction.requestDigest === null) !== (reduction.outcome.state === 'not-run') ||
            reduction.requestDigest !== null && (!DIGEST_PATTERN.test(reduction.requestDigest) || reduction.outcome.state === 'not-run' || reduction.outcome.requestDigest !== reduction.requestDigest) ||
            reduction.outcome.state === 'closed' && (!Array.isArray(reduction.outcome.findings) || reduction.outcome.usage !== null &&
              (!count(reduction.outcome.usage.inputTokens) || !count(reduction.outcome.usage.outputTokens)))) invalid();
      }
      if (data.sampling !== undefined) {
        const sample = data.sampling;
        if (data.reduction === undefined || !DIGEST_PATTERN.test(sample.inputDigest) || sample.contractDigest !== definition.assurance?.promptContractDigest ||
            !count(sample.nextTurn) || sample.nextTurn < 1 || !Array.isArray(sample.turns) || sample.turns.length !== sample.nextTurn - 1 ||
            !sample.turns.every((turn) => DIGEST_PATTERN.test(turn.requestDigest) && count(turn.unitOrdinal) && turn.unitOrdinal > 0 &&
              ['closed', 'gap', 'outcome-unknown'].includes(turn.state) && (turn.usage === null || count(turn.usage.inputTokens) && count(turn.usage.outputTokens))) ||
            typeof sample.ended !== 'boolean' || sample.turns.some((turn) => turn.state === 'outcome-unknown') && !sample.ended ||
            !Array.isArray(sample.dispositions) || !Array.isArray(sample.gapReasons) || !sample.gapReasons.every((reason) => typeof reason === 'string') ||
            !Array.isArray(sample.draw?.sampled) || !count(sample.sampled?.inputTokens) || !count(sample.sampled?.outputTokens) || !count(sample.sampled?.turnsWithUsage)) invalid();
      }
      // A newer snapshot may only follow all submitted units; no corrupt stage pin can send unfinished units first.
      const governed = this.requestAdmissionOf(runRecordId) !== null;
      const plan = governed ? this.#planRecords(stored!.binding.taskIntentId, 'any', stored!.binding.planVersion) : null;
      const reuse = plan?.['reuse-plan'] as { units: Array<{ disposition: string }> } | undefined;
      const facts = governed ? null : this.loadExecutionPlan(runRecordId);
      const expected = governed ? reuse === undefined ? this.#requestManifest(stored!).units.length : reuse.units.filter((unit) => unit.disposition === 'recomputed').length
        : facts!.update === null ? facts!.manifest.units.length : facts!.update.reusePlan.units.filter((unit) => unit.disposition === 'recomputed').length;
      if (this.unitCheckpoints(runRecordId).length !== expected) invalid();
      const usage = this.carriedUsageOf(runRecordId)?.stages;
      if (usage == null || data.reduction?.outcome.state === 'closed' && usage['cross-unit-reduction'].requests < 1) invalid();
      if (data.sampling !== undefined && (usage!['assurance-sampling'].requests < data.sampling.nextTurn - 1 ||
          data.sampling.sampled.turnsWithUsage > data.sampling.nextTurn - 1 ||
          usage!['assurance-sampling'].inputTokens < data.sampling.sampled.inputTokens || usage!['assurance-sampling'].outputTokens < data.sampling.sampled.outputTokens)) invalid();
      return data;
    }
    return null;
  }

  /** One settled unit of a Run, kept the moment it settles: the continuation point 续行 goes on from (CONT-015). */
  recordUnitCheckpoint(input: {
    runRecordId: string;
    attemptId: string;
    unit: UnitResultRecord;
    observation: UnitCheckpoint['observation'];
    requests?: readonly string[];
  }): void {
    return runCheckpointOperations.recordUnitCheckpoint(this.#runCheckpointOperationsHost, input);
  }

  /**
   * What a stopped Run spent beyond its units before it stopped — settled or refused stage work — as its latest
   * stop kept it (Issue #51, S16a): the ceiling counts it after 续行 as it did before. `null` when no stop kept any.
   */
  carriedUsageOf(runRecordId: string): { inputTokens: number; outputTokens: number; stages: CarriedStages | null; webVerification?: { inputTokens: number; outputTokens: number } } | null {
    return runCheckpointOperations.carriedUsageOf(this.#runCheckpointOperationsHost, runRecordId);
  }

  /** A Run's continuation checkpoints in unit order, each read back against its own digest. */
  unitCheckpoints(runRecordId: string): UnitCheckpoint[] {
    return runCheckpointOperations.unitCheckpoints(this.#runCheckpointOperationsHost, runRecordId);
  }

  // ---- Clarification Requests (Issue #422, plan slice S76d) ---------------------------------------------------

  /**
   * What the Run asked the editor at an adaptation moved into 先问你 (CLAR-001, CLAR-005): the unit whose safe retry
   * waits, bound to the Run, its attempt, the plan version and envelope it runs under, with the failure that raised it
   * and what the first attempt cost. One request per unit and Run; the unit waits until it is answered.
   */
  recordClarificationRequest(input: {
    modelQuestion?: ModelClarificationQuestion;
    firstAttempts?: number;
    raisedAt?: string;
    runRecordId: string;
    attemptId: string;
    taskIntentId: string;
    unitOrdinal: number;
    planVersion: number;
    planEnvelopeDigest: string;
    requestDigest: string;
    failure: { code: string; failureClass: string; status: number | null; reason: string };
    firstPayloadDigest: string | null;
    firstUnitMessageDigest: string;
    firstUsage: { inputTokens: number; outputTokens: number } | null;
    firstWallMs: number;
  }): string {
    return clarificationOperations.recordClarificationRequest(this.#clarificationOperationsHost, input);
  }

  /** A Run's Clarification Requests in unit order, each with its answer when it has one, read back against their digests. */
  clarificationsOf(runRecordId: string): ClarificationFacts[] {
    return clarificationOperations.clarificationsOf(this.#clarificationOperationsHost, runRecordId);
  }

  /**
   * 提交回答 (CLAR-005, CLAR-006, INPUT-004): the editor's one answer to a question the Book's current Task's Run asked —
   * the option chosen and the note that qualifies it — bound to the exact request shown, with who and when. Refused, and
   * nothing recorded, when the question is not that Run's, is already answered, or the Run has ended or is stopping.
   */
  recordClarificationAnswer(bookId: string, input: { taskIntentId: string; requestId: string; optionId: unknown; note: unknown }): {
    answerId: string;
    runRecordId: string;
    runState: BaselineAnalysisRunState;
  } {
    return clarificationOperations.recordClarificationAnswer(this.#clarificationOperationsHost, bookId, input);
  }

  /** Service-clock timeout, append-only and idempotent; an editor answer already recorded wins. */
  expireModelClarifications(runRecordId: string, now = Date.now()): number {
    return clarificationOperations.expireModelClarifications(this.#clarificationOperationsHost, runRecordId, now);
  }

  modelClarificationAnswerClaimed(runRecordId: string, requestId: string): boolean {
    return clarificationOperations.modelClarificationAnswerClaimed(this.#clarificationOperationsHost, runRecordId, requestId);
  }

  claimModelClarificationAnswer(runRecordId: string, requestId: string, preserveState = false): boolean {
    return clarificationOperations.claimModelClarificationAnswer(this.#clarificationOperationsHost, runRecordId, requestId, preserveState);
  }

  /**
   * The provider-account-limit stop of a resumable Run (Issue #51, S16b): the provider's words and the unit it refused
   * — `null` for the reduction or a sample — read from the Run's latest state; `null` for every other Run.
   */
  accountLimitOf(runRecordId: string): { condition: string; unitOrdinal: number | null } | null {
    const row = this.#db.prepare('SELECT state, canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1')
      .get(runRecordId) as SqlRow | undefined;
    if (row === undefined || row.state !== 'resumable') return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || record.stopReason !== 'provider-account-limit' || typeof record.condition !== 'string') return null;
    return { condition: record.condition, unitOrdinal: typeof record.unitOrdinal === 'number' ? record.unitOrdinal : null };
  }

  /**
   * The account-limit stop a Run goes on from (Issue #51, S16b): its latest stop, when that was the provider's limit, with
   * the attempt the provider refused — which was sent — when it refused a unit. `null` when the Run's latest stop was
   * anything else, or it never stopped.
   */
  accountLimitStopOf(runRecordId: string): {
    condition: string;
    unitOrdinal: number | null;
    refusedAttempt: { attempts: number; wallMs: number; usage: { inputTokens: number; outputTokens: number } | null } | null;
  } | null {
    const row = this.#db.prepare(
      "SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? AND state IN ('paused', 'resumable', 'awaiting-clarification') ORDER BY sequence DESC LIMIT 1",
    ).get(runRecordId) as SqlRow | undefined;
    if (row === undefined) return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || record.stopReason !== 'provider-account-limit' || typeof record.condition !== 'string') return null;
    const refused = record.refusedAttempt;
    let refusedAttempt: { attempts: number; wallMs: number; usage: { inputTokens: number; outputTokens: number } | null } | null = null;
    if (refused !== undefined) {
      const usage = isRecord(refused) ? refused.usage : undefined;
      requireAnalysis(isRecord(refused) && Number.isSafeInteger(refused.attempts) && (refused.attempts as number) >= 1 &&
        typeof refused.wallMs === 'number' && refused.wallMs >= 0 &&
        (usage === null || (isRecord(usage) && Number.isSafeInteger(usage.inputTokens) && Number.isSafeInteger(usage.outputTokens))),
      'ANALYSIS_RECORD_INVALID', '运行记录的被拒绝尝试无效。');
      refusedAttempt = {
        attempts: refused.attempts as number,
        wallMs: refused.wallMs as number,
        usage: usage === null ? null : { inputTokens: (usage as Record<string, number>).inputTokens!, outputTokens: (usage as Record<string, number>).outputTokens! },
      };
    }
    return { condition: record.condition, unitOrdinal: typeof record.unitOrdinal === 'number' ? record.unitOrdinal : null, refusedAttempt };
  }

  /**
   * 结果待确认 (Issue #51, S16c): the ranges of a Run whose sent requests' results cannot be known — its kept checkpoints whose gap
   * is `outcome-unknown`, durable from the instant each was found, so every stop, reconciliation and continuation keeps them
   * and none ever reads them again. Empty when there are none, or when the kept progress no longer reads back.
   */
  unconfirmedRangesOf(runRecordId: string): UnconfirmedUnitRecord[] {
    let checkpoints: UnitCheckpoint[];
    try {
      checkpoints = this.unitCheckpoints(runRecordId);
    } catch {
      return [];
    }
    return checkpoints.flatMap((checkpoint) => checkpoint.unit.closed.state === 'gap' && checkpoint.unit.closed.gap.code === 'outcome-unknown'
      ? [{ unitOrdinal: checkpoint.unit.unitOrdinal, attempts: checkpoint.observation?.attempts ?? 1, reason: checkpoint.unit.closed.gap.reason }]
      : []);
  }

  /**
   * The 结果待确认 stop of a resumable Run (Issue #51, S16c): its latest state stopped there, with the unconfirmed ranges; `null`
   * for every other Run. Such a Run does not go on (ADR 0034, CONT-011, CONT-016): 续行 refuses it.
   */
  outcomeUnknownOf(runRecordId: string): { units: UnconfirmedUnitRecord[] } | null {
    const row = this.#db.prepare('SELECT state, canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1')
      .get(runRecordId) as SqlRow | undefined;
    if (row === undefined || row.state !== 'resumable') return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    if (!isRecord(record) || record.stopReason !== 'outcome-unknown') return null;
    const units = this.unconfirmedRangesOf(runRecordId);
    return units.length === 0 ? null : { units };
  }

  /** Whether the plan a Task holds was frozen under developer-live, where the launch sets the Run Budget Ceiling (Issue #541). */
  #launchSetsCeiling(taskIntentId: string): boolean {
    const row = this.#db.prepare(
      "SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'plan-envelope' ORDER BY plan_version DESC LIMIT 1",
    ).get(taskIntentId) as SqlRow | undefined;
    if (row === undefined) return false;
    const envelope = parseCanonicalJson(asString(row.canonical_json));
    return isRecord(envelope) && envelope.providerStatus === 'remote-eligible-developer-live';
  }

  /** Why a Run's interrupted outcome says it stopped (Issue #51, S16a); `null` for any other Run, or one with no outcome. */
  #runStop(runRecordId: string): RunStop | null {
    const row = this.#db.prepare("SELECT canonical_json FROM analysis_task_outcomes WHERE run_record_id = ? AND classification = 'interrupted'")
      .get(runRecordId) as SqlRow | undefined;
    if (row === undefined) return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    return isRecord(record) ? runStopOf(record.stop) : null;
  }

  /** The first question of a Run under way or stopped that still waits for its answer; `null` when none does. */
  #openClarificationOf(runRecordId: string, state: BaselineAnalysisRunState): { requestId: string; unitOrdinal: number; raisedAt: string; origin?: 'model' } | null {
    if (!(state === 'admitted' || state === 'executing' || state === 'pausing' || state === 'paused' || state === 'resumable' ||
      state === 'awaiting-clarification')) return null;
    const open = this.clarificationsOf(runRecordId).find((entry) => entry.answer === null);
    return open === undefined ? null : { requestId: open.requestId, unitOrdinal: open.unitOrdinal, raisedAt: open.raisedAt,
      ...(open.origin === 'model' ? { origin: 'model' } : {}) };
  }

  /** How many turns each unit of a Run was given across its executions so far, from the spans its attempt recorded. */
  unitAttemptsOf(runRecordId: string): Map<number, number> {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const rows = this.#db.prepare(
      `SELECT s.unit_ordinal, count(*) turns FROM analysis_harness_spans s
       JOIN analysis_execution_attempts a ON a.attempt_id = s.attempt_id
       WHERE a.run_record_id = ? AND s.unit_ordinal IS NOT NULL GROUP BY s.unit_ordinal`,
    ).all(runRecordId) as SqlRow[];
    return new Map(rows.map((row) => [asNumber(row.unit_ordinal), asNumber(row.turns)] as const));
  }

  /** The attempt and Execution Binding a Run persisted, for 续行 to go on under; `null` before it persisted them. */
  executionBindingOf(runRecordId: string): { attemptId: string; binding: ExecutionBindingRecord; bindingDigest: string; spanCount: number } | null {
    const attempt = this.#db.prepare('SELECT attempt_id FROM analysis_execution_attempts WHERE run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    if (attempt === undefined) return null;
    const attemptId = asString(attempt.attempt_id);
    const row = this.#db.prepare('SELECT * FROM analysis_execution_bindings WHERE attempt_id = ?').get(attemptId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RECORD_INVALID', '执行尝试缺少执行绑定。');
    const binding = parseCanonicalJson(asString(row.canonical_json)) as ExecutionBindingRecord;
    requireAnalysis(canonicalRecord(binding).digest === asString(row.sha256) && binding.attemptId === attemptId && isResultSetPolicyPin(binding.policyPin),
      'ANALYSIS_RECORD_INVALID', '执行绑定与其摘要或策略 pin 不一致。');
    const spans = this.#db.prepare('SELECT count(*) total, max(ordinal) last FROM analysis_harness_spans WHERE attempt_id = ?').get(attemptId) as SqlRow;
    return { attemptId, binding, bindingDigest: asString(row.sha256), spanCount: spans.last === null ? 0 : asNumber(spans.last) };
  }

  /**
   * Startup reconciliation (CONT-014): every Run of this kind a stopped service left admitted, executing or pausing has
   * nothing running it. One pausing settles `paused` — the boundary it waited for is reached — and one admitted or
   * executing `resumable`, 任务已中断 · 可续行, its Run Authorization kept and nothing dispatched until 续行. A start the
   * governor had not admitted yet is blocked before dispatch with why: nothing starts by itself after a restart (ADR
   * 0034). A Run left cancelling is named for the execution owner, which finishes the cancellation.
   */
  reconcileStoppedRuns(options: {
    /**
     * A start left `authorized` that another owner takes on by the editor's own choice, and that this reconciliation so
     * leaves as it is: a Review Run's category, which 继续审阅 dispatches (Issue #657 review).
     */
    readonly leaveAuthorized?: (runRecordId: string) => boolean;
  } = {}): { settled: number; cancelling: ReadonlyArray<string> } {
    const rows = this.#db.prepare(
      `SELECT r.run_record_id,
              (SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1) last_state
       FROM analysis_run_records r
       JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id
       WHERE i.kind = ?
       ORDER BY r.recorded_at, r.rowid`,
    ).all(this.#definition.kind) as SqlRow[];
    let settled = 0;
    const cancelling: string[] = [];
    for (const row of rows) {
      const runRecordId = asString(row.run_record_id);
      this.reconcileRequestAdmissions(runRecordId);
      const state = row.last_state === null ? null : asString(row.last_state);
      if (state === 'pausing') {
        this.recordRunState(runRecordId, 'paused', { detail: RECONCILED_PAUSED_DETAIL, reconciled: true });
        settled += 1;
      } else if (state === 'paused' && this.#idleYielded(runRecordId)) {
        // Yielding lasts only while this lifetime runs (Issue #1089): afterwards the Run waits for 续行 like any paused Run.
        this.recordRunState(runRecordId, 'paused', { detail: RECONCILED_YIELDED_DETAIL, reconciled: true });
        settled += 1;
      } else if (state === 'admitted' || state === 'executing') {
        this.recordRunState(runRecordId, 'resumable', { detail: RECONCILED_RESUMABLE_DETAIL, stopReason: 'shutdown', reconciled: true });
        settled += 1;
      } else if (state === 'cancelling') {
        cancelling.push(runRecordId);
      } else if (state === 'awaiting-clarification' && this.clarificationsOf(runRecordId).every((entry) => entry.answer !== null)) {
        // The editor answered while another Run held the slot, and AI7 closed before it went on (Issue #767; ADR 0034): the answer
        // stays recorded, and the Run waits for the editor's 续行 like every Run a restart left, so nothing is sent by itself.
        this.recordRunState(runRecordId, 'resumable', { detail: RECONCILED_RESUMABLE_DETAIL, stopReason: 'shutdown', reconciled: true });
        settled += 1;
      } else if (state === 'authorized' && options.leaveAuthorized?.(runRecordId) !== true) {
        // A start the governor had not admitted yet (Issue #49, S14) — or one a service stopped on between its
        // authorization and its admission — never began: blocked with why, it waits for the editor, not for a place.
        this.recordRunState(runRecordId, 'blocked-before-dispatch', { detail: RECONCILED_QUEUED_DETAIL, reasons: [RECONCILED_QUEUED_DETAIL], reconciled: true });
        settled += 1;
      }
    }
    return { settled, cancelling };
  }

  /**
   * Each Book's latest Task of this kind whose Run waits in Connectivity Wait, or that Reconnect Preflight blocked after it
   * waited — its plan moved, or this launch could not start it (Issue #760, S74c; ATTN-004, CONC-006): what 待我处理 and the 任务
   * panel read of a kind they otherwise leave to its own surface. Every row the query keeps is a reading, so the limit bounds
   * what is shown and nothing is dropped after it. A read; nothing is written.
   */
  waitingAttentionReadings(bookId: string | null, limit: number): Array<{
    bookId: string; bookTitle: string; taskIntentId: string; runRecordId: string; state: 'awaiting-connectivity' | 'plan-moved' | 'launch-blocked'; stateAt: string;
  }> {
    const lastState = `(SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1)`;
    const rows = this.#db.prepare(
      `SELECT t.task_intent_id, t.book_id, b.title book_title, r.run_record_id, ${lastState} last_state,
              (SELECT s.recorded_at FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1) last_state_at
       FROM analysis_task_intents t
       JOIN books b ON b.book_id = t.book_id
       JOIN analysis_run_records r ON r.task_intent_id = t.task_intent_id
       WHERE t.kind = ? AND t.rowid = (
           SELECT t2.rowid FROM analysis_task_intents t2 WHERE t2.book_id = t.book_id AND t2.kind = t.kind
           ORDER BY t2.created_at DESC, t2.rowid DESC LIMIT 1)
         AND (${lastState} = 'awaiting-connectivity' OR (${lastState} = 'blocked-before-dispatch' AND EXISTS (
           SELECT 1 FROM analysis_run_states w WHERE w.run_record_id = r.run_record_id AND w.state = 'awaiting-connectivity')))
         AND (? IS NULL OR t.book_id = ?)
       ORDER BY t.created_at, t.task_intent_id LIMIT ?`,
    ).all(this.#definition.kind, bookId, bookId, limit) as SqlRow[];
    return rows.map((row) => {
      const runRecordId = asString(row.run_record_id);
      const state = row.last_state === 'awaiting-connectivity' ? 'awaiting-connectivity' as const
        : this.blockedByOf(runRecordId) === 'plan-moved' ? 'plan-moved' as const : 'launch-blocked' as const;
      return { bookId: asString(row.book_id), bookTitle: asString(row.book_title), taskIntentId: asString(row.task_intent_id), runRecordId, state, stateAt: asString(row.last_state_at) };
    });
  }

  /** Every Run of this kind waiting in Connectivity Wait, oldest first, with its Book. */
  waitingRuns(): Array<{ bookId: string; taskIntentId: string; runRecordId: string; recordedAt: string }> {
    const rows = this.#db.prepare(
      `SELECT r.run_record_id, r.task_intent_id, r.recorded_at, i.book_id
       FROM analysis_run_records r
       JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id
       WHERE i.kind = ?
         AND (SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1)
           = 'awaiting-connectivity'
       ORDER BY r.recorded_at, r.rowid`,
    ).all(this.#definition.kind) as SqlRow[];
    return rows.map((row) => ({
      bookId: asString(row.book_id), taskIntentId: asString(row.task_intent_id), runRecordId: asString(row.run_record_id), recordedAt: asString(row.recorded_at),
    }));
  }

  /**
   * Reconnect Preflight's local half (OFF-007, OFF-008, UI ADR 0008): whether the plan a waiting Run's
   * authorization bound still stands. The material inputs are re-derived from durable state exactly as an
   * unauthorized plan's are and compared with the bound version's; the answer is the labels of the fields that
   * moved, or none. A credential is not a material input — its absence is a blocker the service reads
   * separately, and never drift (OFF-009).
   */
  preflightDrift(runRecordId: string): ReadonlyArray<string> {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const run = this.#db.prepare(
      `SELECT r.task_intent_id, a.plan_envelope_sha256 FROM analysis_run_records r
       JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id WHERE r.run_record_id = ?`,
    ).get(runRecordId) as SqlRow | undefined;
    requireAnalysis(run !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const intentRow = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(asString(run.task_intent_id)) as SqlRow | undefined;
    requireAnalysis(intentRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务意图缺失。');
    const intent = this.#intentFacts(intentRow);
    const version = this.#planVersionByEnvelopeDigest(asString(run.plan_envelope_sha256));
    requireAnalysis(version !== undefined && version.taskIntentId === intent.taskIntentId, 'ANALYSIS_RECORD_INVALID', '运行授权绑定的计划版本缺失。');
    const plan = this.#planRecords(intent.taskIntentId, intent.mode, version.ordinal);
    const frozen = materialPlanInputsOfComponents(plan, intent.record);
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    const live = this.#currentMaterialInputs(intent.bookId, intent.mode, frozen.selectedRange, manifest.units.length,
      planEditCeiling(this.#planEditsOf(intent.taskIntentId, version.ordinal)),
      // An authorized production Run owns its connection; settings select the next Task's connection (#811 revision 9).
      this.#launch.operationalScope === 'ordinary-production' ? frozen.providerBinding : undefined, intent.backgroundRunBudgetCeiling);
    return diffMaterialPlanInputs(frozen, live).map((entry) => entry.label);
  }

  /**
   * A waiting Run that can never dispatch as it was authorized is blocked with its reasons (OFF-008): its bound
   * plan no longer stands, or this launch cannot carry it. The editor prepares the Task again — a Task Intent
   * holds one Run, so the way on is a new plan, never this one revised.
   */
  blockWaitingRun(runRecordId: string, reasons: ReadonlyArray<string>, cause: WaitingRunBlockCause): void {
    requireAnalysis(reasons.length > 0 && reasons.every((reason) => typeof reason === 'string' && reason.length > 0),
      'ANALYSIS_RUN_INVALID', '阻止运行需要写明原因。');
    requireAnalysis(cause === 'plan-moved' || cause === 'launch', 'ANALYSIS_RUN_INVALID', '阻止运行需要写明缘由。');
    requireAnalysis(this.currentRunState(runRecordId) === 'awaiting-connectivity', 'ANALYSIS_RUN_INVALID', '该运行已不在等待中。');
    // Why it was blocked travels in the state record's canonical detail (Issue #536): no schema change.
    this.recordRunState(runRecordId, 'blocked-before-dispatch', { detail: reasons.join(' '), reasons: [...reasons], cause });
  }

  /**
   * Why a Run blocked before dispatch never ran (Issue #536; OFF-008): `plan-moved` when Reconnect Preflight found the
   * plan its authorization bound had moved, else `launch` — a block this launch made, or one recorded before the cause
   * was kept. `null` for a Run not blocked.
   */
  blockedByOf(runRecordId: string): 'plan-moved' | 'launch' | null {
    const row = this.#db.prepare('SELECT state, canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1')
      .get(runRecordId) as SqlRow | undefined;
    if (row === undefined || row.state !== 'blocked-before-dispatch') return null;
    const record = parseCanonicalJson(asString(row.canonical_json));
    return isRecord(record) && record.cause === 'plan-moved' ? 'plan-moved' : 'launch';
  }

  #insertRunState(runRecordId: string, sequence: number, state: BaselineAnalysisRunState, detail: Record<string, unknown>, recordedAt: string): void {
    const record = canonicalRecord({ runRecordId, sequence, state, recordedAt, ...detail });
    this.#db.prepare(
      'INSERT INTO analysis_run_states(run_record_id, sequence, state, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(runRecordId, sequence, state, recordedAt, record.json, record.digest);
  }

  // ---- execution persistence -------------------------------------------------------------------

  /** Immutable request pins remain readable after this Run publishes its successor revision. */
  #requestManifest(stored: NonNullable<ReturnType<BaselineAnalysisStore['executionBindingOf']>>): CoverageManifestProjection {
    return requestAdmissionOperations.internalRequestManifest(this.#requestAdmissionOperationsHost, stored);
  }

  /** An absent receipt is historical evidence, never an inferred admission. */
  requestAdmissionOf(runRecordId: string): RequestAdmissionReading | null {
    return requestAdmissionOperations.requestAdmissionOf(this.#requestAdmissionOperationsHost, runRecordId);
  }

  /** Preserve the latest stop, detail and idle-yield marker when appending private execution evidence. */
  #appendExecutionEvidence(runRecordId: string, detail: Record<string, unknown>): void {
    return requestAdmissionOperations.internalAppendExecutionEvidence(this.#requestAdmissionOperationsHost, runRecordId, detail);
  }

  #appendRequestAdmission(runRecordId: string, pins: RequestAdmissionPins, event: RequestAdmissionEvent, detail: Record<string, unknown> = {}): void {
    return requestAdmissionOperations.internalAppendRequestAdmission(this.#requestAdmissionOperationsHost, runRecordId, pins, event, detail);
  }

  beginRequestAdmissions(runRecordId: string, width: 1 | 3, policyRuleId: string): 1 | 3 {
    return requestAdmissionOperations.beginRequestAdmissions(this.#requestAdmissionOperationsHost, runRecordId, width, policyRuleId);
  }

  admitModelRequest(runRecordId: string, request: AnalysisRequestIdentity, clarificationRequestId: string | null = null): void {
    return requestAdmissionOperations.admitModelRequest(this.#requestAdmissionOperationsHost, runRecordId, request, clarificationRequestId);
  }

  recordModelRequestNotSent(runRecordId: string, requestId: string): void {
    return requestAdmissionOperations.recordModelRequestNotSent(this.#requestAdmissionOperationsHost, runRecordId, requestId);
  }

  checkpointFactualRequests(runRecordId: string, round: import('../factual-verification.js').FactualClaimRound): void {
    return requestAdmissionOperations.checkpointFactualRequests(this.#requestAdmissionOperationsHost, runRecordId, round);
  }

  checkpointModelRequests(runRecordId: string, unitOrdinal: number): void {
    return requestAdmissionOperations.checkpointModelRequests(this.#requestAdmissionOperationsHost, runRecordId, unitOrdinal);
  }

  checkpointClarificationRequests(runRecordId: string, unitOrdinal: number): void {
    return requestAdmissionOperations.checkpointClarificationRequests(this.#requestAdmissionOperationsHost, runRecordId, unitOrdinal);
  }

  modelClarificationAnswerNotSent(runRecordId: string, clarificationRequestId: string, unitOrdinal: number): boolean {
    return requestAdmissionOperations.modelClarificationAnswerNotSent(this.#requestAdmissionOperationsHost, runRecordId, clarificationRequestId, unitOrdinal);
  }

  checkpointStageRequests(runRecordId: string, stage: 'cross-unit-reduction' | 'assurance-sampling', stages: StageContinuation, carriedUsage: { inputTokens: number; outputTokens: number; stages: CarriedStages }): void {
    return requestAdmissionOperations.checkpointStageRequests(this.#requestAdmissionOperationsHost, runRecordId, stage, stages, carriedUsage);
  }

  checkpointReflectionRequests(runRecordId: string): void {
    return requestAdmissionOperations.checkpointReflectionRequests(this.#requestAdmissionOperationsHost, runRecordId);
  }

  hasCommittedOutcome(runRecordId: string): boolean {
    return requestAdmissionOperations.hasCommittedOutcome(this.#requestAdmissionOperationsHost, runRecordId);
  }

  checkpointRefusedRequests(runRecordId: string, stage: RunProgressStage, unitOrdinal: number | null,
    observation: { attempts: number; usage: { inputTokens: number; outputTokens: number } | null }): void {
    return requestAdmissionOperations.checkpointRefusedRequests(this.#requestAdmissionOperationsHost, runRecordId, stage, unitOrdinal, observation);
  }

  /** Startup only: a possible send without an exact committed result is never re-executed. */
  reconcileRequestAdmissions(runRecordId: string): void {
    return requestAdmissionOperations.reconcileRequestAdmissions(this.#requestAdmissionOperationsHost, runRecordId);
  }

  recordRunState(runRecordId: string, state: BaselineAnalysisRunState, detail: Record<string, unknown>): void {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const row = this.#db.prepare('SELECT max(sequence) last FROM analysis_run_states WHERE run_record_id = ?').get(runRecordId) as SqlRow;
    const last = row.last === null ? 0 : asNumber(row.last);
    requireAnalysis(last >= 1, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    this.#insertRunState(runRecordId, last + 1, state, detail, new Date().toISOString());
  }

  /** Whether the Run's latest state is AI7's yield to the editor's waiting Run (Issue #1089), not the editor's own 暂停. */
  #idleYielded(runRecordId: string): boolean {
    const row = this.#db.prepare('SELECT canonical_json FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1').get(runRecordId) as SqlRow | undefined;
    return row !== undefined && (parseCanonicalJson(asString(row.canonical_json)) as { idleYield?: unknown }).idleYield === true;
  }

  currentRunState(runRecordId: string): BaselineAnalysisRunState {
    const row = this.#db.prepare('SELECT state FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1').get(runRecordId) as SqlRow | undefined;
    requireAnalysis(row !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    return asString(row.state) as BaselineAnalysisRunState;
  }

  /**
   * The frozen plan of one Run. For an update Task the reuse plan is re-derived from the same inputs
   * and must digest to the recorded plan component; any drift refuses execution before a model call.
   */
  loadExecutionPlan(runRecordId: string): ExecutionPlanFacts {
    requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
    const run = this.#db.prepare(
      `SELECT r.run_record_id, r.task_intent_id, a.plan_envelope_sha256, a.origin, a.canonical_json
       FROM analysis_run_records r
       JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
       WHERE r.run_record_id = ?`,
    ).get(runRecordId) as SqlRow | undefined;
    requireAnalysis(run !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const intentRow = this.#db.prepare('SELECT * FROM analysis_task_intents WHERE task_intent_id = ?').get(asString(run.task_intent_id)) as SqlRow | undefined;
    requireAnalysis(intentRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务意图缺失。');
    const intent = this.#intentFacts(intentRow);
    // Who started the Run (Issue #864): a 后台分析登记's Run is only ever the Task its dispatcher created under that very version.
    const origin = authorizationOrigin(run);
    requireAnalysis(origin.origin !== 'background-analysis-enrollment' || intent.preparedByEnrollmentVersionId === origin.enrollmentVersionId,
      'ANALYSIS_RECORD_INVALID', '运行授权的来源与任务意图不一致。');
    const checkpointRow = this.#db.prepare('SELECT * FROM analysis_task_input_checkpoints WHERE task_intent_id = ?').get(intent.taskIntentId) as SqlRow | undefined;
    requireAnalysis(checkpointRow !== undefined, 'ANALYSIS_RECORD_INVALID', '任务输入固定点缺失。');
    // The Run executes exactly the plan version its authorization bound, never a later one.
    const version = this.#planVersionByEnvelopeDigest(asString(run.plan_envelope_sha256));
    requireAnalysis(version !== undefined && version.taskIntentId === intent.taskIntentId, 'ANALYSIS_RECORD_INVALID', '运行授权绑定的计划版本缺失。');
    const plan = this.#planRecords(intent.taskIntentId, intent.mode, version.ordinal);
    const digests = this.#planDigests(intent.taskIntentId, version.ordinal);
    const manifest = plan['coverage-manifest'] as CoverageManifestProjection;
    requireAnalysis(manifestDigestIsExact(manifest), 'ANALYSIS_RECORD_INVALID', '覆盖清单记录无效。');
    const providerPlan = plan['provider-resolution-plan'] as NonNullable<BaselineAnalysisProjection['providerResolutionPlan']>;
    const selectedMetadata = providerPlanPolicyMetadata(providerPlan);
    const retainedBinding = this.executionBindingOf(runRecordId);
    if (retainedBinding !== null) requireAnalysis(
      retainedBinding.binding.policyPin.operationalScope === providerPlan.remoteBinding.providerProcessing.operationalScope &&
      retainedBinding.binding.policyPin.providerProcessingVersion === providerPlan.remoteBinding.providerProcessing.version &&
      (selectedMetadata.selectedPolicyIdentity === undefined || retainedBinding.binding.policyPin.activePolicySetVersion === selectedMetadata.selectedPolicyIdentity.activePolicySetVersion),
    'ANALYSIS_RECORD_INVALID', '执行绑定的策略 pin 与冻结计划不一致。');
    const localFixtureRuntime = selectedMetadata.localFixtureProfile === undefined ? null : this.#launch.localFixtureRuntime?.();
    requireAnalysis(selectedMetadata.localFixtureProfile === undefined || localFixtureRuntime !== undefined && localFixtureRuntime !== null &&
      canonicalJson(localFixtureRuntime.selectedPolicyIdentity) === canonicalJson(selectedMetadata.selectedPolicyIdentity),
    'ANALYSIS_RECORD_INVALID', '冻结计划的本地夹具策略目录缺失或不一致。');
    const runBudgetCeiling = runBudgetCeilingStateOf(providerPlan.runBudgetCeiling);
    // The route the plan froze must still be the route this launch binds. A developer-live plan
    // cannot execute under a provider-free launch, and a deterministic plan cannot execute live.
    const live = this.#launch.live;
    let productionBinding: ProductionPlanBinding | null = null;
    if (this.#launch.operationalScope === 'ordinary-production') {
      // Ordinary production (Issue #811): the Run keeps the binding its plan froze — one of the two allowed routes, exactly, on
      // a production connection's own Credential Reference — whatever route the editor has configured since.
      const route = providerPlan.executionRoute;
      const allowed = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => route.kind === binding.route && 'endpoint' in route &&
        route.endpoint === binding.endpoint && providerPlan.remoteBinding.credentialSlot === binding.credentialSlot);
      const reference = providerPlan.remoteBinding.credentialReference;
      requireAnalysis(allowed !== undefined && providerPlan.remoteBinding.providerProcessing.operationalScope === 'ordinary-production' &&
        UUID_PATTERN.test(reference) && !DEVELOPMENT_CREDENTIAL_REFERENCES.has(reference.toLowerCase()),
      'ANALYSIS_ROUTE_STALE', '冻结计划不是正式使用下可执行的模型服务路线。');
      requireAnalysis('model' in route, 'ANALYSIS_ROUTE_STALE', '冻结计划缺少模型。');
      productionBinding = { route: allowed.route, model: route.model, endpoint: allowed.endpoint, credentialSlot: allowed.credentialSlot,
        ...('reasoningEffort' in route && typeof route.reasoningEffort === 'string' ? { reasoningEffort: route.reasoningEffort } : {}) };
    } else if (live !== null && live.scope !== 'ordinary-production') {
      requireAnalysis(providerPlan.executionRoute.kind === live.route && providerPlan.executionRoute.model === live.model &&
        providerPlan.executionRoute.endpoint === live.endpoint, 'ANALYSIS_ROUTE_STALE', '当前启动的实时路由与冻结计划不一致。');
      requireAnalysis(providerPlan.remoteBinding.credentialReference === live.credentialReference &&
        canonicalJson(runBudgetCeiling) === canonicalJson(this.#planCeiling(manifest.units.length, 'unset', intent.backgroundRunBudgetCeiling)),
      'ANALYSIS_ROUTE_STALE', '当前启动的凭据引用或运行预算上限与冻结计划不一致。');
    } else {
      requireAnalysis(providerPlan.executionRoute.kind === LOCAL_DETERMINISTIC_ROUTE, 'ANALYSIS_ROUTE_ABSENT', '计划没有可执行的本地路由。');
      requireAnalysis(this.#route !== null && this.#route.fixtureIdentity === providerPlan.executionRoute.fixtureIdentity &&
        this.#route.fixtureSha256 === providerPlan.executionRoute.fixtureSha256, 'ANALYSIS_ROUTE_STALE', '当前启动的本地路由与冻结计划不一致。');
    }
    let retainedPolicy: LaunchPolicyProjection | null = null;
    if (retainedBinding !== null && selectedMetadata.selectedPolicyIdentity === undefined && productionBinding !== null) {
      retainedPolicy = this.#launch.retainedPolicyFor?.(retainedBinding.binding.policyPin,
        { ...productionBinding, credentialReference: providerPlan.remoteBinding.credentialReference }) ?? null;
      requireAnalysis(retainedPolicy !== null, 'ANALYSIS_RECORD_INVALID', '历史执行绑定缺少准确的已核实策略阅读。');
    }
    const envelope = plan['plan-envelope'] as Record<string, unknown>;
    const artifactPin = plan['artifact-pin'] as { nativeCarrierSha256: string; sidecarSha256: string };
    // What the editor left out (Issue #419), read from the execution plan and matched by the adaptations the envelope's
    // split names, which the Run Authorization bound: the two are written together and never disagree. Only a class the
    // editor withdrew is looked for — the split's words, and a class a later release adds, are not a plan's to answer.
    let editorEdits: PlanEdits;
    try {
      editorEdits = planEditsOf(plan['execution-plan']);
    } catch {
      throw new AnalysisError('ANALYSIS_RECORD_INVALID', '计划记录的修改无效。');
    }
    const split = envelope.boundary as PlanBoundarySplitProjection | undefined;
    // Only the classes the editor withdrew, or moved into 先问你 (Issue #422, S76d), are looked for: neither may be in the
    // adaptable list, and each moved one is in the split's own.
    const withdrawn: ReadonlyArray<string> = editorEdits.disallowedAdaptations;
    const asked: ReadonlyArray<string> = editorEdits.askFirstAdaptations ?? [];
    requireAnalysis(split === undefined || (!split.adaptable.some((entry) => withdrawn.includes(entry.adaptationClass) || asked.includes(entry.adaptationClass)) &&
      asked.every((adaptationClass) => (split.askFirst ?? []).some((entry) => entry.adaptationClass === adaptationClass))),
      'ANALYSIS_RECORD_INVALID', '计划信封与计划修改不一致。');
    // Outside developer-live the ceiling the Run is held to is the one the editor set in this version, or none (Issue #51).
    // A 后台分析登记's Task is held to its Book's share under every scope (Issue #864).
    requireAnalysis((live !== null && intent.backgroundRunBudgetCeiling === null) ||
      canonicalJson(runBudgetCeiling) === canonicalJson(this.#planCeiling(manifest.units.length, planEditCeiling(editorEdits), intent.backgroundRunBudgetCeiling)),
      'ANALYSIS_RECORD_INVALID', '计划的预算上限与计划修改不一致。');
    let update: ExecutionUpdateFacts | null = null;
    if (this.#carriesPlan(intent.mode)) {
      const latestRow = this.#revisionRows(intent.bookId).at(-1);
      let predecessor: ReusePlanPredecessor | ScopePlanPredecessor | null = null;
      if (this.#isInitial(intent.mode)) {
        // A range-bound first Task still starts the Result Set at dispatch, or it does not start.
        requireAnalysis(intent.predecessorRevisionId === null && latestRow === undefined,
          'ANALYSIS_PREDECESSOR_DRIFT', '本图书已存在结果集修订版；未开始执行。');
      } else {
        requireAnalysis(intent.predecessorRevisionId !== null, 'ANALYSIS_RECORD_INVALID', '更新任务缺少前一修订版。');
        const predecessorRow = this.#revisionRowById(intent.predecessorRevisionId);
        requireAnalysis(latestRow !== undefined && asString(latestRow.revision_id) === intent.predecessorRevisionId,
          'ANALYSIS_PREDECESSOR_DRIFT', '该任务的前一修订版已不再是结果集的最新修订版；未开始执行。');
        predecessor = this.#planPredecessor(predecessorRow);
      }
      const stored = plan['reuse-plan'] as AnalysisPlanRecord;
      const rederived = this.#derivePlan(intent.mode, stored.selectedRange, manifest, predecessor, this.definitionForDigest(asString(envelope.promptContractDigest)));
      const record = reusePlanRecord(rederived);
      requireAnalysis(record.digest === digests['reuse-plan'] && canonicalJson(stored) === record.json && envelope.reusePlanDigest === record.digest,
        'ANALYSIS_REUSE_PLAN_DRIFT', REUSE_PLAN_DRIFT_REASON);
      update = {
        mode: intent.mode,
        selectedRange: stored.selectedRange,
        predecessor: predecessor === null ? null : {
          revisionId: predecessor.revisionId,
          ordinal: predecessor.ordinal,
          digest: predecessor.digest,
          coverageManifestDigest: predecessor.coverageManifestDigest,
          manifest: predecessor.manifest,
        },
        reusePlan: rederived,
        reusePlanDigest: record.digest,
      };
    }
    return {
      bookId: intent.bookId,
      taskIntentId: intent.taskIntentId,
      runRecordId,
      ...(intent.record.factualDecision === undefined ? {} : { factualDecision: intent.record.factualDecision as import('../factual-verification.js').FactualRecheckSelection }),
      planVersionId: version.planVersionId,
      planVersionOrdinal: version.ordinal,
      origin: origin.origin,
      startWhen: (parseCanonicalJson(asString(run.canonical_json)) as { startWhen?: 'now' | 'idle' }).startWhen ?? 'now',
      checkpoint: {
        bookId: intent.bookId,
        manuscriptId: asString(checkpointRow.manuscript_id),
        branchId: asString(checkpointRow.branch_id),
        revisionId: asString(checkpointRow.revision_id),
        revisionLabel: asString(checkpointRow.revision_label),
        revisionDigest: asString(checkpointRow.revision_digest),
        journalSequence: asNumber(checkpointRow.journal_sequence),
        createdForDirtyJournal: asNumber(checkpointRow.created_for_dirty_journal) === 1,
      },
      manifest,
      manifestDigest: manifest.digest,
      planEnvelopeDigest: asString(run.plan_envelope_sha256),
      runSourceScopeDigest: asString(digests['run-source-scope']),
      ...(providerPlan.webToolsBackend === undefined ? {} : { webToolsBackend: providerPlan.webToolsBackend, searchCredentialReference: providerPlan.searchCredentialReference! }), ...(providerPlan.webToolsFallback === undefined ? {} : { webToolsFallback: providerPlan.webToolsFallback }),
      providerResolutionPlanDigest: asString(digests['provider-resolution-plan']),
      credentialReference: providerPlan.remoteBinding.credentialReference,
      sourceDigest: (plan['manuscript-pin'] as { sourceDigest: string }).sourceDigest,
      // The deterministic fixture facts; `null` on the live route, which replays no fixture.
      route: this.#route,
      ...selectedMetadata,
      ...(retainedBinding === null ? {} : { retainedPolicyPin: retainedBinding.binding.policyPin }),
      ...(retainedPolicy === null ? {} : { retainedPolicy }),
      ...(localFixtureRuntime == null ? {} : { localFixtureRuntime }),
      productionBinding,
      artifactPin: { nativeCarrierSha256: artifactPin.nativeCarrierSha256, sidecarRevision: 2, sidecarSha256: artifactPin.sidecarSha256 },
      promptContractDigest: asString(envelope.promptContractDigest),
      behaviorCompositionDigest: asString(envelope.behaviorCompositionDigest),
      ...(envelope.compositionVersion === 2 || envelope.compositionVersion === 3 || envelope.compositionVersion === 4 ? { compositionOptions: envelope.compositionOptions as CompositionOptions } : {}),
      assurancePromptContractDigest: frozenAssurancePromptContractDigest(plan['execution-plan'] as Record<string, unknown>),
      runBudgetCeiling,
      update,
      editorEdits,
    };
  }

  readRevisionBlocks(manuscriptId: string, revisionId: string): ManifestBlockInput[] {
    requireAnalysis(UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(revisionId), 'ANALYSIS_RECORD_INVALID', '修订版身份无效。');
    const rows = this.#db.prepare(
      `SELECT version.block_id, version.position, version.kind, version.level, version.text, version.digest, version.grapheme_length
       FROM manuscript_block_versions version
       JOIN manuscript_blocks block ON block.block_id = version.block_id AND block.manuscript_id = ?
       WHERE version.revision_id = ? ORDER BY version.position`,
    ).all(manuscriptId, revisionId) as SqlRow[];
    return rows.map((row) => this.#blockInput(row));
  }

  /** The current working blocks of one branch: what the next Task Input checkpoint would materialize. */
  /**
   * 重新分析这段 names its paragraphs by block identity (Issue #423 review, P3-3): resolved here, as the Task is prepared, to the
   * range they hold in the working manuscript the Task Input checkpoint is about to pin. Every other request is as it came.
   */
  /** Whether the working manuscript holds, at `range`, the blocks the Task Input revision held there (P3-4). */
  #rangeStillHolds(bookId: string, checkpoint: { readonly manuscriptId: string; readonly revisionId: string }, range: BaselineAnalysisSelectedRange): boolean {
    const pinned = new Map(this.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId).map((block) => [block.position, block.blockId] as const));
    const working = new Map(this.readWorkingBlocks(this.#binding(bookId).branchId).map((block) => [block.position, block.blockId] as const));
    for (let position = range.startPosition; position <= range.endPosition; position += 1) {
      const blockId = pinned.get(position);
      if (blockId === undefined || working.get(position) !== blockId) return false;
    }
    return true;
  }

  #resolveSelectedBlocks(bookId: string, update: BaselineAnalysisUpdateRequest | AnalysisModeRequest | null): AnalysisModeRequest | null {
    const blocks = update !== null && 'selectedBlocks' in update ? update.selectedBlocks ?? null : null;
    if (update === null || blocks === null) return update === null ? null : { mode: update.mode, selectedRange: update.selectedRange };
    requireAnalysis(update.mode === 'reanalyze-range' && update.selectedRange === null, 'ANALYSIS_SELECTED_RANGE_INVALID', '只有重新分析所选范围可以携带内容块范围。');
    const working = this.readWorkingBlocks(this.#binding(bookId).branchId);
    const from = working.find((block) => block.blockId === blocks.fromBlockId)?.position;
    const to = working.find((block) => block.blockId === blocks.toBlockId)?.position;
    requireAnalysis(from !== undefined && to !== undefined && from <= to, 'ANALYSIS_SELECTED_RANGE_INVALID', SELECTED_BLOCKS_GONE);
    return { mode: update.mode, selectedRange: { startPosition: from, endPosition: to } };
  }

  readWorkingBlocks(branchId: string): ManifestBlockInput[] {
    requireAnalysis(UUID_PATTERN.test(branchId), 'ANALYSIS_RECORD_INVALID', '分支身份无效。');
    const rows = this.#db.prepare(
      `SELECT block_id, position, kind, level, text, digest, grapheme_length
       FROM working_blocks WHERE branch_id = ? ORDER BY position`,
    ).all(branchId) as SqlRow[];
    return rows.map((row) => this.#blockInput(row));
  }

  #blockInput(row: SqlRow): ManifestBlockInput {
    return {
      blockId: asString(row.block_id),
      position: asNumber(row.position),
      kind: asString(row.kind) as ManifestBlockInput['kind'],
      level: row.level === null ? null : asNumber(row.level),
      text: asString(row.text),
      digest: asString(row.digest),
      graphemes: asNumber(row.grapheme_length),
    };
  }

  /** The closed unit results of one revision, parsed back into contract results for reuse by lineage. */
  loadPredecessorUnitResults(revisionId: string): Map<number, PredecessorUnitResult> {
    requireAnalysis(UUID_PATTERN.test(revisionId), 'ANALYSIS_REVISION_INVALID', '结果集修订版标识无效。');
    const rows = this.#db.prepare("SELECT * FROM analysis_unit_results WHERE revision_id = ? AND state = 'closed' ORDER BY unit_ordinal").all(revisionId) as SqlRow[];
    const results = new Map<number, PredecessorUnitResult>();
    for (const row of rows) {
      const record = parseCanonicalJson(asString(row.canonical_json)) as Record<string, unknown>;
      const unitOrdinal = asNumber(row.unit_ordinal);
      requireAnalysis(record.state === 'closed' && record.unitOrdinal === unitOrdinal, 'ANALYSIS_RECORD_INVALID', '前一修订版的单元结果无效。');
      results.set(unitOrdinal, {
        unitOrdinal,
        requestDigest: asString(record.requestDigest),
        responseDigest: asString(record.responseDigest),
        usage: record.usage as PredecessorUnitResult['usage'],
        // Which keys a closed unit record carries is the kind's to know: its definition wrote them
        // (`unitRecord`) and its definition reads them back.
        result: this.#unitResultOfRecord(record, unitOrdinal),
      });
    }
    return results;
  }

  /** The attempt and its Execution Binding are written together, before the first model call. */
  persistAttemptAndBinding(input: {
    runRecordId: string;
    binding: ExecutionBindingRecord;
    credentialReadiness: 'present' | 'missing';
  }): { bindingDigest: string } {
    const startedAt = input.binding.boundAt;
    const attempt = canonicalRecord({
      attemptId: input.binding.attemptId,
      runRecordId: input.runRecordId,
      ordinal: 1,
      startedAt,
      dispatchAttribution: 'Dispatch',
      credentialReadinessCheck: {
        modelRole: 'Main Editorial Role',
        slot: input.binding.credentialSlot.slot,
        credentialReference: input.binding.credentialSlot.credentialReference,
        readiness: input.credentialReadiness,
        valueReleased: false,
        checkedAt: startedAt,
      },
    });
    const binding = canonicalRecord(input.binding);
    transact(this.#db, () => {
      this.#db.prepare(
        'INSERT INTO analysis_execution_attempts(attempt_id, run_record_id, ordinal, started_at, canonical_json, sha256) VALUES (?, ?, 1, ?, ?, ?)',
      ).run(input.binding.attemptId, input.runRecordId, startedAt, attempt.json, attempt.digest);
      this.#db.prepare(
        'INSERT INTO analysis_execution_bindings(attempt_id, harness_session_id, bound_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)',
      ).run(input.binding.attemptId, input.binding.harnessSessionId, startedAt, binding.json, binding.digest);
    });
    return { bindingDigest: binding.digest };
  }

  /** The units an attempt recorded a turn for: what it submitted, as far as the ledger knows. */
  submittedUnitCount(attemptId: string): number {
    const row = this.#db.prepare('SELECT count(DISTINCT unit_ordinal) submitted FROM analysis_harness_spans WHERE attempt_id = ? AND unit_ordinal IS NOT NULL')
      .get(attemptId) as SqlRow;
    return asNumber(row.submitted);
  }

  /**
   * One technical turn by reference; from Issue #48 also which attempt of its unit it was and the payload digest the gate
   * admitted, and from Issue #286 the digest of the unit message it submitted and, on a safe retry's turn, the adaptation
   * it carried out.
   */
  recordSpan(
    attemptId: string,
    ordinal: number,
    span: { sessionId: string; startSeq: number; endSeq: number },
    unitOrdinal: number | null,
    turn: { attemptIndex: number; payloadDigest: string | null; unitMessageDigest: string; adaptationId: string | null },
  ): void {
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      spanId: randomUUID(), attemptId, ordinal, harnessSessionId: span.sessionId, startSeq: span.startSeq, endSeq: span.endSeq, unitOrdinal, recordedAt,
      attemptIndex: turn.attemptIndex, payloadDigest: turn.payloadDigest, unitMessageDigest: turn.unitMessageDigest,
      // Only a safe retry's turn names the adaptation it carried out.
      ...(turn.adaptationId === null ? {} : { adaptationId: turn.adaptationId }),
    });
    const spanId = (parseCanonicalJson(record.json) as { spanId: string }).spanId;
    this.#db.prepare(
      `INSERT INTO analysis_harness_spans(span_id, attempt_id, ordinal, harness_session_id, start_seq, end_seq, unit_ordinal, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(spanId, attemptId, ordinal, span.sessionId, span.startSeq, span.endSeq, unitOrdinal, recordedAt, record.json, record.digest);
  }

  /** The durable `safe-retry` Plan Adaptation, written before the retry is dispatched; immutable like every ledger row. */
  recordAdaptation(input: PlanAdaptationInput): { adaptationId: string; digest: string; recordedAt: string } {
    const adaptationId = randomUUID();
    const recordedAt = new Date().toISOString();
    const built = buildPlanAdaptationRecord({ adaptationId, ...input, attemptIndex: input.attemptIndex ?? 2, recordedAt });
    this.#db.prepare(
      `INSERT INTO analysis_plan_adaptations(adaptation_id, attempt_id, ordinal, unit_ordinal, adaptation_class, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(adaptationId, input.attemptId, input.ordinal, input.unitOrdinal, input.adaptationClass ?? 'safe-retry', recordedAt, built.json, built.digest);
    return { adaptationId, digest: built.digest, recordedAt };
  }

  /**
   * Append one immutable Result Set Revision with the next ordinal on the Book's Result Set. A
   * first-baseline revision keeps the `/1` record shape; a successor revision is a `/2` record that
   * adds the update facts (mode, predecessor identity and digest, reuse-plan digest, counts) and the
   * per-unit lineage. The predecessor rows are never touched.
   */
  persistRevision(input: RevisionPersistInput): { resultSetId: string; revisionId: string; ordinal: number; digest: string } {
    const { facts } = input;
    const live = this.#launch.live;
    // Under ordinary-production the revision names the binding the Run's plan froze (Issue #811), not the one configured now.
    const produced = facts.productionBinding;
    const createdAt = new Date().toISOString();
    return transact(this.#db, () => {
      const kind = this.#definition.kind;
      let resultSetRow = this.#db.prepare('SELECT result_set_id FROM analysis_result_sets WHERE book_id = ? AND kind = ?').get(facts.bookId, kind) as SqlRow | undefined;
      if (resultSetRow === undefined) {
        const resultSetId = randomUUID();
        const record = canonicalRecord({ resultSetId, bookId: facts.bookId, kind, createdAt });
        this.#db.prepare('INSERT INTO analysis_result_sets(result_set_id, book_id, kind, created_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)')
          .run(resultSetId, facts.bookId, kind, createdAt, record.json, record.digest);
        resultSetRow = { result_set_id: resultSetId };
      }
      const resultSetId = asString(resultSetRow.result_set_id);
      const ordinalRow = this.#db.prepare('SELECT count(*) total, max(ordinal) latest FROM analysis_result_set_revisions WHERE result_set_id = ?').get(resultSetId) as SqlRow;
      const ordinal = asNumber(ordinalRow.total) + 1;
      if (facts.update !== null) {
        // A plan with a predecessor appends directly after it; a range-bound first Task's plan has none
        // and must still be the revision that starts the Result Set.
        const predecessor = facts.update.predecessor;
        requireAnalysis(predecessor === null
          ? ordinal === 1
          : asNumber(ordinalRow.latest) === predecessor.ordinal && ordinal === predecessor.ordinal + 1,
        'ANALYSIS_PREDECESSOR_DRIFT', '前一修订版已不再是结果集的最新修订版；后继修订版未写入。');
      }
      const revisionId = randomUUID();
      const successor = facts.update !== null;
      const unitRecords = input.units.map((unit) => {
        const lineage = successor ? { lineage: unit.lineage } : {};
        const body = unit.closed.state === 'closed'
          ? {
              unitOrdinal: unit.unitOrdinal,
              state: 'closed',
              requestDigest: unit.requestDigest,
              responseDigest: unit.closed.responseDigest,
              usage: unit.closed.usage,
              ...lineage,
              ...(unit.closed.result as Record<string, unknown>),
            }
          : { unitOrdinal: unit.unitOrdinal, state: 'gap', requestDigest: unit.requestDigest, ...lineage, gap: unit.closed.gap };
        return { unitOrdinal: unit.unitOrdinal, state: unit.closed.state, record: canonicalRecord(body) };
      });
      const base = {
        schema: successor ? this.#definition.successorRevisionSchema : this.#definition.revisionSchema,
        kind,
        contractVersion: this.#definition.contractVersion,
        resultSetId,
        revisionId,
        ordinal,
        createdAt,
        manuscriptPin: {
          bookId: facts.bookId,
          manuscriptId: facts.checkpoint.manuscriptId,
          revisionId: facts.checkpoint.revisionId,
          revisionLabel: facts.checkpoint.revisionLabel,
          revisionDigest: facts.checkpoint.revisionDigest,
        },
        coverageManifestDigest: facts.manifestDigest,
        // The contract the Run executed (Issue #901): a factual level's own; every other kind's, and an earlier plan's, as before.
        schemaDigest: this.definitionForRun(facts.runRecordId, facts.promptContractDigest).schemaDigest,
        ...(this.#definition.contractIdentity?.categoryConfiguration === undefined ? {} : { categoryConfigurationIdentity: canonicalJson(this.#definition.contractIdentity.categoryConfiguration) }),
        reducerDigest: this.#definition.reducerDigest,
        // The revision pins the route that produced it: the fixture on the deterministic route, the
        // live route's own identity when the Run actually transmitted.
        adapterPin: produced !== null
          ? { route: produced.route, model: produced.model, fixtureIdentity: null, fixtureSha256: null }
          : live === null
          ? { route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL, fixtureIdentity: facts.route!.fixtureIdentity, fixtureSha256: facts.route!.fixtureSha256 }
          : { route: live.route, model: live.model, fixtureIdentity: null, fixtureSha256: null },
        bindingPin: {
          attemptId: input.attemptId,
          bindingDigest: input.bindingDigest,
          harnessSessionId: input.harnessSessionId,
          behaviorCompositionDigest: facts.behaviorCompositionDigest,
          promptContractDigest: facts.promptContractDigest,
        },
        policyPin: this.executionBindingOf(facts.runRecordId)?.binding.policyPin ?? (produced !== null
          ? { operationalScope: 'ordinary-production', providerProcessingVersion: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION, activePolicySetVersion: ACTIVE_SET_VERSION, liveTransmissions: 'bounded-by-run' }
          : live === null
          ? { operationalScope: 'development-ci', providerProcessingVersion: facts.selectedPolicyIdentity?.providerProcessingVersion === 'v29' ? 'v29' : 'v1',
            activePolicySetVersion: facts.selectedPolicyIdentity?.activePolicySetVersion ?? ACTIVE_SET_VERSION, liveTransmissions: 0 }
          : { operationalScope: 'developer-live', providerProcessingVersion: DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION, activePolicySetVersion: ACTIVE_SET_VERSION, liveTransmissions: 'bounded-by-run' }),
        provenance: {
          taskIntentId: facts.taskIntentId,
          runRecordId: facts.runRecordId,
          attemptId: input.attemptId,
          planVersion: facts.planVersionOrdinal,
          adaptations: { count: input.adaptedUnitOrdinals.length, unitOrdinals: [...input.adaptedUnitOrdinals] },
        },
        usage: input.usage,
        coverage: input.reduction.coverage,
        reducerClosure: input.reduction.reducerClosure,
        assurance: input.reduction.assurance,
        gaps: input.reduction.gaps,
        // The kind's own components: the baseline's conflicts, cross-unit findings, sections, and
        // synthesis; the factual kind's findings, excluded appendix, assertion counts, and research
        // disclosure. Canonical JSON sorts keys, so the record's bytes do not depend on this order.
        ...input.reduction.components,
        unitDigests: unitRecords.map((unit) => ({ unitOrdinal: unit.unitOrdinal, state: unit.state, sha256: unit.record.digest })),
      };
      const body = canonicalRecord(facts.update === null ? base : {
        ...base,
        update: {
          mode: facts.update.mode,
          predecessor: facts.update.predecessor === null
            ? null
            : { revisionId: facts.update.predecessor.revisionId, ordinal: facts.update.predecessor.ordinal, digest: facts.update.predecessor.digest },
          reusePlanDigest: facts.update.reusePlanDigest,
          selectedRange: facts.update.selectedRange,
          counts: facts.update.reusePlan.counts,
        },
        lineage: input.units.map((unit) => ({ unitOrdinal: unit.unitOrdinal, ...unit.lineage })),
      });
      this.#db.prepare(
        `INSERT INTO analysis_result_set_revisions(
           revision_id, result_set_id, ordinal, task_intent_id, run_record_id, attempt_id, manuscript_revision_id,
           manuscript_revision_digest, coverage_manifest_sha256, contract_version, created_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(revisionId, resultSetId, ordinal, facts.taskIntentId, facts.runRecordId, input.attemptId, facts.checkpoint.revisionId,
        facts.checkpoint.revisionDigest, facts.manifestDigest, this.#definition.contractVersion, createdAt, body.json, body.digest);
      const insertUnit = this.#db.prepare('INSERT INTO analysis_unit_results(revision_id, unit_ordinal, state, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)');
      for (const unit of unitRecords) insertUnit.run(revisionId, unit.unitOrdinal, unit.state, unit.record.json, unit.record.digest);
      return { resultSetId, revisionId, ordinal, digest: body.digest };
    });
  }

  recordOutcome(input: {
    taskIntentId: string;
    runRecordId: string;
    classification: keyof typeof OUTCOME_LABELS;
    resultSetRevisionId: string | null;
    summary: string;
    safeNextAction: string;
    /**
     * The Run Report of the Run this outcome settles (ADR 0066 §Run Report). It is written here,
     * once, inside the outcome's canonical JSON and beside the digest of its own canonical form;
     * the outcomes relation is insert-only under the immutability triggers, so nothing rewrites it.
     */
    report: RunReportRecord;
    /** Why an interrupted Run stopped, when the Run Budget Ceiling stopped it (Issue #51, S16a); named only then. */
    stop?: RunStop;
  }): void {
    const outcomeId = randomUUID();
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      outcomeId,
      taskIntentId: input.taskIntentId,
      runRecordId: input.runRecordId,
      classification: input.classification,
      resultSetRevisionId: input.resultSetRevisionId,
      summary: input.summary,
      safeNextAction: input.safeNextAction,
      report: input.report,
      reportDigest: runReportDigest(input.report),
      recordedAt,
      ...(input.stop === undefined ? {} : { stop: { ...input.stop } }),
    });
    this.#db.prepare(
      `INSERT INTO analysis_task_outcomes(outcome_id, task_intent_id, run_record_id, classification, result_set_revision_id, recorded_at, canonical_json, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(outcomeId, input.taskIntentId, input.runRecordId, input.classification, input.resultSetRevisionId, recordedAt, record.json, record.digest);
  }

  /** Unit request digests for the frozen manifest, in unit order. */
  unitRequestDigests(manifest: CoverageManifestProjection, promptContractDigest: string): string[] {
    return manifest.units.map((unit) => unitRequestDigest(promptContractDigest, unit.ordinal, unit.digest));
  }

  // ---- shared bindings -------------------------------------------------------------------------

  #binding(bookId: string, checkpoint?: ManuscriptCheckpointBinding, enforceHead = true): {
    manuscriptId: string;
    branchId: string;
    sourceVersionId: string;
    sourceDigest: string;
    credentialReference: string;
    credentialOperationState: ModelCredentialOperationState;
  } {
    requireAnalysis(UUID_PATTERN.test(bookId), 'ANALYSIS_BOOK_INVALID', '任务所属图书无效。');
    this.#refreshClarificationDefinition();
    // Under ordinary production (Issue #811) the Book is the editor's own manuscript, of any source, and the connection whose
    // credential a plan names is the configured route's; under every other scope one of the five Public SampleBooks (exact sample1 or an
    // ADR 0091 work, Issue #990) and the official row.
    const live = this.#launch.live;
    const production = this.#launch.operationalScope === 'ordinary-production';
    // The connection row of the live route's channel (Issue #1225): a Zen model's route names the one Zen row.
    const channel = live !== null && live.scope === 'ordinary-production' ? modelServiceChannelOf(live.route) : null;
    const connectionId = channel === null ? 'main-editorial-deepseek-v4-pro' : MODEL_SERVICE_CONNECTION_IDS[channel];
    const row = this.#db.prepare(
      `SELECT m.manuscript_id, mb.branch_id, bws.base_revision_id, bws.journal_sequence, bws.working_digest,
              mr.source_version_id, sv.source_digest,
              connection.credential_reference, connection.credential_operation_state
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN branch_working_state bws ON bws.branch_id = mb.branch_id
       JOIN manuscript_revisions mr ON mr.revision_id = ${checkpoint === undefined ? 'bws.base_revision_id' : '?'}
       JOIN source_versions sv ON sv.source_version_id = mr.source_version_id AND sv.book_id = m.book_id
       LEFT JOIN model_service_connections connection ON connection.connection_id = ?
       WHERE m.book_id = ? AND ${checkpoint !== undefined || this.#definition.manuscriptTarget !== undefined ? 'm.manuscript_id = ? AND mb.branch_id = ?' : "m.role = 'primary'"}`,
    ).get(...(checkpoint === undefined ? [connectionId, bookId] : [checkpoint.revisionId, connectionId, bookId]),
      ...(checkpoint !== undefined ? [checkpoint.manuscriptId, checkpoint.branchId] : this.#definition.manuscriptTarget === undefined ? [] : [this.#definition.manuscriptTarget.manuscriptId, this.#definition.manuscriptTarget.branchId])) as SqlRow | undefined;
    requireAnalysis(row !== undefined && typeof row.source_digest === 'string' && DIGEST_PATTERN.test(row.source_digest),
    'ANALYSIS_LINEAGE_UNAVAILABLE', ANALYSIS_LINEAGE_UNAVAILABLE_REASON);
    requireAnalysis(this.#launch.operationalScope !== 'developer-live' || isPublicSampleBookSourceDigest(row.source_digest),
      'ANALYSIS_LINEAGE_UNAVAILABLE', ANALYSIS_LINEAGE_UNAVAILABLE_REASON);
    // Ordinary production with no connection yet: 模型服务需设置, naming both routes (Issue #811).
    requireAnalysis(!production || (typeof row.credential_operation_state === 'string' && typeof row.credential_reference === 'string'),
      'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', MODEL_SERVICE_SETUP_REQUIRED_REASON);
    requireAnalysis(typeof row.credential_operation_state === 'string' && typeof row.credential_reference === 'string',
      'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的凭据引用元数据。');
    const state = asString(row.credential_operation_state);
    requireAnalysis((state === 'ready' || state === 'missing' || state === 'needs-attention') && UUID_PATTERN.test(asString(row.credential_reference)),
      'ANALYSIS_PROVIDER_BINDING_UNAVAILABLE', '主编辑角色缺少固定的凭据引用元数据。');
    if (checkpoint !== undefined && enforceHead) {
      requireAnalysis(row.manuscript_id === checkpoint.manuscriptId && row.branch_id === checkpoint.branchId &&
        row.base_revision_id === checkpoint.revisionId && row.journal_sequence === checkpoint.journalSequence &&
        row.working_digest === checkpoint.revisionDigest,
      'ANALYSIS_CHECKPOINT_STALE', '任务输入固定点已经变化。');
    } else if (checkpoint !== undefined) {
      requireAnalysis(row.manuscript_id === checkpoint.manuscriptId && row.branch_id === checkpoint.branchId,
        'ANALYSIS_CHECKPOINT_STALE', '任务输入固定点不属于当前稿件。');
    }
    return {
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      sourceVersionId: asString(row.source_version_id),
      sourceDigest: asString(row.source_digest),
      credentialReference: asString(row.credential_reference),
      credentialOperationState: state,
    };
  }

  /**
   * A plan may be frozen only under a verified launch policy that matches the bound launch: the
   * provider-free `development-ci` v1 denial, or the selected `developer-live` eligibility whose live
   * binding this store already holds. An unverified or mismatched policy freezes nothing.
   */
  #requireDeniedPolicy(policy: LaunchPolicyProjection): void {
    requireAnalysis(policy.integrityState === 'verified' && policy.denialReason === null &&
      policy.operationalScope === this.#launch.operationalScope && policy.activePolicySetVersion === ACTIVE_SET_VERSION,
    'ANALYSIS_POLICY_UNAVAILABLE', '可信启动策略与已绑定的可信区间不一致。');
    if (this.#launch.operationalScope === 'ordinary-production') {
      requireAnalysis(this.#launch.live !== null, 'ANALYSIS_MODEL_SERVICE_SETUP_REQUIRED', MODEL_SERVICE_SETUP_REQUIRED_REASON);
      requireAnalysis(policy.providerProcessing.version === ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION && policy.providerProcessing.decision === 'eligible-only' &&
        policy.providerProcessing.authorizedLiveTransmissionCount === 'bounded-by-run' && policy.providerProcessing.liveTransmissionAllowed === true &&
        policy.providerProcessing.bindingState === 'configured',
      'ANALYSIS_POLICY_UNAVAILABLE', `无法建立可信的 ordinary-production Provider Processing ${ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION} 记录。`);
      return;
    }
    if (this.#launch.live !== null) {
      requireAnalysis(policy.providerProcessing.version === DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION && policy.providerProcessing.decision === 'eligible-only' &&
        policy.providerProcessing.authorizedLiveTransmissionCount === 'bounded-by-run' && policy.providerProcessing.liveTransmissionAllowed === true,
      'ANALYSIS_POLICY_UNAVAILABLE', `无法建立可信的 developer-live Provider Processing ${DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION} 记录。`);
      return;
    }
    requireAnalysis(['v1', 'v29'].includes(policy.providerProcessing.version ?? '') && policy.providerProcessing.decision === 'deny' &&
      policy.providerProcessing.authorizedLiveTransmissionCount === 0 && policy.providerProcessing.liveTransmissionAllowed === false,
    'ANALYSIS_POLICY_UNAVAILABLE', '无法建立可信的 development-ci Provider Processing 拒绝记录。');
  }
}

/** The shared live admission of a planned Run's kind (Issue #429), on the Main Editorial Role its Execution Binding names. */
function plannedRunAdmission(...args: Parameters<typeof liveKindAdmission>): ReturnType<typeof liveKindAdmission> {
  const rule = liveKindAdmission(...args);
  return rule?.modelRole === 'Main Editorial Role' ? rule : null;
}
