import { inspectManuscriptExportReceipt as inspectExportReceipt } from './manuscript-export.js';
import * as importRetentionOperations from './import-retention.js';
import type { ReimportPreparationProgress, ReimportResolutionProgress, ReimportCommitProgress } from './manuscript-reimport-operations.js';
export type { ReimportPreparationProgress, ReimportResolutionProgress, ReimportCommitProgress } from './manuscript-reimport-operations.js';
import * as manuscriptReimportOperations from './manuscript-reimport-operations.js';
import * as importIntakeOperations from './import-intake-operations.js';
import { LEGACY_WORKFLOW_PROFILE, LEGACY_WORKFLOW_PROFILE_DIGEST, BASELINE_EDITORIAL_DIMENSION_SET, BASELINE_EDITORIAL_DIMENSION_SET_DIGEST, EDITORIAL_DIMENSIONS } from './import-review-records.js';
import * as importReviewOperations from './import-review-records.js';
import { type AbandonmentCleanupIntent, type CommitAttempt, type DraftSnapshot, INGEST_BATCH_SIZE, type ImmutableManuscriptImportResult, type IngestedDocx, MANUSCRIPT_REIMPORT_NON_EFFECTS, MANUSCRIPT_REIMPORT_RECORD_SCHEMA, REIMPORT_COMMIT_FILE_BATCH_BYTES, REIMPORT_GROUPING, REIMPORT_GROUP_PAGE_SIZE, REIMPORT_MAPPING_BATCH_SIZE, REIMPORT_WIRE_HEADROOM_BYTES, type ReimportBlockFact, type ReimportCommitWork, type ReimportMappingBatch, type ReimportMappingFact, type ReimportPendingResolution, type ReimportPreparationWork, type ReimportReplayWork, type ReimportResolutionWork, type ResolvedImportTarget, type ResolvedReimportTarget, type ResolvedSourceImportTarget, type ReviewedFidelity, SOURCE_IMPORT_NON_EFFECTS, SOURCE_IMPORT_RECORD_SCHEMA, type StoredImportCommitProjection, type WordIntakePlan, appendReimportOffsetSegment, canonicalDegradationDecision, commitRequestFingerprint, continuationNotice, conversionFidelityReport, createImportReviewDigestV6, createLegacyNewBookReviewDigestV2, createReimportComparisonHasher, createReimportResolutionHasher, createReimportReviewDigest, createSourceImportReviewDigest, degradationReview, draftSourceProjection, emptyReimportResolutionDigest, immutableCommitResult, isNotAWordprocessingPackage, manuscriptBlockDigest, readConversionColumns, reconstructReviewedTargetChoice, requireSourceFormat, safeDisplayName, sourceImportRetainedBoundary, workingObjectRelativeKey } from './import-review-records.js';
import { writeImportedManuscriptRows } from './import-intake-operations.js';
import * as editorialMarkOperations from './editorial-mark-operations.js';
import * as manuscriptOperations from './manuscript/operations.js';
import * as reviewOperations from './review/review-operations.js';
import { EditorialMemoryFacade } from './learning/memory-facade.js';
import { reviewCategoryDisplayLabel } from '../shared/review-synthesis-wording.js';
import { launchedTaskPlan } from './task-plan-creation.js';

import { RUN_SYNTHESIS_ENTRY } from './review/run-synthesis-kind.js';
import { launchedRunModelLabels } from './editorial-mark-source.js';
import { transact as transactLaunch } from './analysis/run-state.js';
import { TaskLaunchPreview } from './task-plan-creation.js';
import { launchFromSnapshot, TaskLaunchError } from './task-launch-snapshots.js';
import { WalCheckpointMaintenance, type CheckpointWorkerFactory } from './wal-checkpoint-maintenance.js';
import type { RuntimeExecutionConfig } from '../shared/runtime-execution-config.js';

import { saveProductionDocumentType, deleteProductionDocumentType, reorderProductionDocumentTypes } from './production-document-types.js';
import type { SaveProductionDocumentTypeInput, DeleteProductionDocumentTypeInput, ReorderProductionDocumentTypesInput, UpdateProductionDocumentMetaInput, ProductionDocumentTypesProjection } from '../shared/protocol.js';
import type { AiEditLocksProjection, InspectAiEditLocksInput, SetAiEditLocksInput } from '../shared/protocol/scoped-edit.js';
import type { CommitReplacementRevisionsInput, ReplacementRevisionsProjection } from '../shared/protocol/series.js';
import { effectiveModelReasoningEffort, modelProfileFor } from './provider/model-profile.js';
import { composeTaskOverview, estimateTaskStarts } from './task-overview.js';
import { customAnalysisModeGoal, modelServiceRouteRefusal, type LegacyModelRoleId, type ModelRoleId, type ModelRoleResolutionProjection } from '../shared/protocol.js';
import * as modelSearchSettings from './model-search-settings.js';
import * as materialIndexOperations from './material-index-operations.js';
import * as globalAgentOperations from './global-agent-operations.js';
import * as writingTaskOperations from './writing-task-operations.js';
import * as factualVerificationOperations from './factual-verification-operations.js';
import * as initialEvaluationOperations from './initial-evaluation-operations.js';
import { pinTaskDeliverable, taskDeliverableStale } from './task-deliverable-target.js';
import { ManuscriptSourceObjects } from './manuscript/source-objects.js';
import {
  commitNoteSources,
  stageNoteSources,
  stagedNoteSourcesMatch,
  legacyBlockSources,
  routeBlockSource,
  type LegacyBlockSources,
} from './manuscript/note-blocks.js';
import {
  type ImportStructureChoice,
  type AskGlobalAgentInput,
  type GlobalAgentDialogueProjection,
  type GlobalAgentAttemptInput,
  type GlobalAgentProcedure,
  type GlobalAgentProcedurePin,
  type GlobalAgentScope,
  type GlobalAgentScopeInput,
  type GlobalMemoryPin,
  type HouseReviewPreferenceVersion,
  type PrepareGlobalAgentTurnInput,
  type GlobalAgentProjection,
  type RecordLearningSupervisionInput,
  type ImportedSkillImportProjection,
  type ImportedSkillRevisionProjection,
  type ImportedSkillsProjection,
  type ImportedSkillUpdateCandidateProjection,
  type ImportedSkillUpdateCheckProjection,
  type ImportedSkillUpdateRuleProjection,
  type ProcedureRecommendationInput,
  type ProcedureRecommendationProjection,
  isCustomAnalysisKindId,
  type CustomAnalysisDimensionsProjection,
  type PrepareCustomAnalysisInput,
  type SaveCustomAnalysisDimensionInput,
  type HouseReviewPreferenceProjection,
  type EditQualitySignalsProjection,
  type ApplyReceiptProjection,
  type BatchProposalDecisionDraftInput,
  type InspectApplyReceiptInput,
  type PrepareReverseApplyInput,
  type ProposalDraftBatchProjection,
  type ProposalWorkspaceInput,
  type ProposalWorkspaceProjection,
  type RecordProposalDecisionInput,
  type ReverseApplyPreparationProjection,
  type SaveProposalDecisionDraftInput,
  type ModelConnectionTestStatus,
  acceptedSourceImportRetainedBoundaryLabels,
  sourceImportRetainedBoundaryLabel,
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_MODE_LABELS,
  J03_TASK_GOAL,
  MAX_DIALOGUE_SELECTION_GRAPHEMES,
  LEARNING_MATERIAL_KEY_PATTERN,
  MAX_BLOCK_CODE_UNITS,
  MAX_FRAME_BYTES,
  MAX_LEARNING_MATERIALS_PAGE,
  MAX_LEARNING_AUDIT_PAGE,
  MAX_REIMPORT_EXCERPT_GRAPHEMES,
  MAX_REIMPORT_EXCERPTS_PER_SIDE,
  MAX_REIMPORT_RECORD_ITEMS,
  REIMPORT_GROUP_VERB_LABELS,
  TASK_PLAN_KINDS,
  fidelityStatusLabel,
  isReviewCategoryKindId,
  type ControlTaskRunInput,
  type EditTaskPlanInput,
  type InspectSeriesKnowledgeReviewInput,
  type ServiceOperationMap,
  type InspectTaskPlanInput,
  type TaskPlanProjection,
  type GlobalAttentionProjection,
  type BookTasksProjection,
  type AskAboutSelectionInput,
  type ConvertDialogueToChangeSuggestionInput,
  type DialogueAttemptInput,
  type DialogueConversionProjection,
  type DialogueProjection,
  type CapturedProcedureProjection,
  type CapturedProceduresProjection,
  type CapturedProcedureApplicabilityProjection,
  type CapturedProcedureScopeSlot,
  type CapturedProcedureRunProjection,
  type CapturedProcedureStopPreviewProjection,
  type CapturedProcedureValidationProjection,
  type DeveloperProposalProjection,
  type DeveloperProposalVersionProjection,
  type ProcedureCaptureProjection,
  type SaveCapturedProcedureInput,
  type SaveDeveloperProposalInput,
  type ApproveManuscriptExportInput,
  type InspectManuscriptExportReceiptInput,
  type StageManuscriptExportInput,
  type ManuscriptExportStageProjection,
  type ManuscriptExportPreparationProjection,
  type ManuscriptExportReceiptProjection,
  type ManuscriptExportReviewProjection,
  type PrepareManuscriptExportInput,
  type ReviewManuscriptExportInput,
  type DeliverablesProjection,
  type ProposalConflictDraftSaveProjection,
  type ProposalConflictProjection,
  type ProposalConflictResolutionProjection,
  type ProposalConflictBindingInput,
  type ResolveProposalConflictInput,
  type SaveProposalConflictDraftInput,
  type DesignatePublicationVersionInput,
  type CreateProductionDocumentInput,
  type RenameProductionDocumentInput,
  type DecideProductionDocumentTypeInput,
  type ProductionDocumentResultProjection,
  type SaveProductionDocumentVersionInput,
  type RecordProductionDocumentDeliveryInput,
  type TransitionProductionDocumentPhaseInput,
  type BookDeliveryPackageProjection,
  type BookDeliveryPackageDocumentChoice,
  type BookDeliveryPackageResultProjection,
  type PrepareBookDeliveryPackageInput,
  type ApproveBookDeliveryPackageExportInput,
  type BookPeopleResultProjection,
  type BookSummaryFilter,
  type UpdateBookPeopleInput,
  type ReviewGuidelinePreviewProjection,
  type ReviewGuidelinesProjection,
  type ExemplarBookCursor,
  type ImportedExemplarInput,
  type ImportedExemplarPreview,
  type ImportedExemplarDecisionInput,
  type LibraryMaterialCursor,
  type LibraryMaterialDecisionInput,
  type LibraryMaterialKind,
  type LibraryMaterialPreviewProjection,
  type LibraryMaterialProjection,
  type LibraryMaterialsProjection,
  type EvaluationProfilesProjection,
  type EvaluationProfileProjection,
  type SaveEvaluationProfileInput,
  type EvaluationWorkspaceProjection,
  type AnalysisFeedbackProjection,
  type RecordAnalysisFeedbackInput,
  type ExemplarsProjection,
  type ExemplarBookProjection,
  type ReadersReportExemplarProjection,
  type AdmitReadersReportExemplarInput,
  type KnowledgeProceduresProjection,
  type ReviewGuidelinesPage,
  type AppendMaintenanceCaseRevisionInput,
  type InspectMaintenanceCaseInput,
  type ListMaintenanceCasesInput,
  type MaintenanceCasePageProjection,
  type MaintenanceCaseProjection,
  type MaintenanceCaseResultProjection,
  type RecordMaintenanceCaseInput,
  type SaveMaintenanceErrataInput,
  type BookDeliveryPackageExportProjection,
  type BookDeliveryPackageExportResultProjection,
  type BookDeliveryPackageExportReviewProjection,
  type PrepareBookDeliveryPackageExportInput,
  type PrepareBookDeliveryPackageArchiveInput,
  type ReviewBookDeliveryPackageExportInput,
  type ProductionDocumentsProjection,
  type MilestonePurposeKind,
  type PublicationDesignationProjection,
  type BookCreationCommitProjection,
  type BookCreationReviewProjection,
  type BookHistoryCursor,
  type BookSummaryCursor,
  type BookSummaryPageProjection,
  type BookManuscriptAnchorProjection,
  type BookRecordPresentation,
  type BookWorkOverviewProjection,
  type EditorialWorkspaceProfileProjection,
  type FidelityCategoryProjection,
  type HistoricalRevisionProjection,
  type ImportCommitProjection,
  type ImportDegradationDecisionReviewProjection,
  type ImportDraftRecoveryProjection,
  type ImportIdentityFindingProjection,
  type ImportStartupProjection,
  type ImportTargetSelection,
  type ManuscriptImportCommitProjection,
  type ManuscriptBlockProjection,
  type ManuscriptReimportCommitProjection,
  type ManuscriptReimportTargetSelection,
  type ApplyChangeSuggestionBatchInput,
  type ApplyChangeSuggestionInput,
  type CreateEditorialMarkInput,
  type EditorialMarkCardProjection, type FindPendingMarkInput, type PendingMarkPlace,
  type EditorialMarkCommandProjection,
  type JournalAcknowledgement,
  type JournalEditInput,
  type ManuscriptApplyCommandProjection,
  type ManuscriptApplyOutcomeProjection,
  type ManuscriptConversionProjection,
  type ManuscriptRailProjection,
  type ManuscriptEntryPositionProjection,
  type ManuscriptWindowProjection,
  type ModelCredentialOperationState,
  type ModelServiceConnectionProjection,
  type ModelServiceRouteId,
  type RecordChangeSuggestionDecisionInput,
  type RecordProposalDecisionFeedbackInput,
  type DecideLearningMaterialInput,
  type InspectEvaluationCalibrationInput,
  type BookSeriesProjection,
  type ChangeSeriesMembershipInput,
  type CreateSeriesInput,
  type PreviewSeriesMembershipChangeInput,
  type SeriesCandidatesCursor,
  type SeriesCandidatesProjection,
  type SeriesCreationProjection,
  type SeriesHistoryCursor,
  type SeriesHistoryPageProjection,
  type SeriesListCursor,
  type SeriesListProjection,
  type SeriesMemberProjection,
  type SeriesMembersCursor,
  type SeriesMembersPageProjection,
  type SeriesMembershipChangeResultProjection,
  type SeriesMembershipPreviewProjection,
  type SeriesProjection,
  type EditSeriesKnowledgeCandidateInput,
  type PromoteSeriesKnowledgeInput,
  type ProposeSeriesKnowledgeInput,
  type SeriesKnowledgeCandidatesCursor,
  type SeriesKnowledgeCandidatesPageProjection,
  type SeriesKnowledgeItemsCursor,
  type SeriesKnowledgeItemsPageProjection,
  type SeriesKnowledgeRevisionsProjection,
  type SeriesKnowledgeConflictsProjection,
  type SeriesKnowledgePromotionProjection,
  type SeriesKnowledgeProposalProjection,
  type SeriesKnowledgeReviewProjection,
  type DataVersionProjection,
  type DatabaseExportActivityProjection,
  type DatabaseExportPreparationProjection,
  type DatabaseExportReceiptProjection,
  type DatabaseExportsProjection,
  type ScheduledBackupsProjection,
  type UsageGrouping,
  type UsageProjection,
  type UsageRange,
  type SetScheduledBackupInput,
  type DatabaseImportPreviewProjection,
  type DatabaseReplacementsProjection,
  type EvaluationCalibrationProjection,
  type RecordPublicationActualsInput,
  type SetEvaluationPreferencesInput,
  type FeedbackHistoryInput,
  type FeedbackHistoryProjection,
  type LearningMaterialCursor,
  type LearningMaterialProjection,
  type LearningMaterialsBookProjection,
  type LearningMaterialsProjection,
  type LearningAuditBookProjection,
  type LearningAuditInput,
  type LearningAuditMaterialProjection,
  type LearningAuditProjection,
  type LearningLineageProjection,
  type LearningRemediationOutcomeProjection,
  type LearningRemediationPreviewProjection,
  type PreviewLearningRemediationInput,
  type RecordLearningRemediationInput,
  type RecordProposalDecisionReasonInput,
  type ReverseAppliedChangeSuggestionInput,
  type UpdateEditorialMarkInput,
  type NewBookImportTargetChoiceId,
  type OriginalFileAccessProjection,
  type ReviewBeforeImportProjection,
  type ReviewBeforeSourceImportProjection,
  type ReviewBeforeManuscriptReimportProjection,
  type ReimportLineageSourceVersionPageProjection,
  type EditorialMarkKind,
  type ReimportGroupProjection,
  type ReimportGroupVerb,
  type ReimportMappingPageProjection,
  type SourceFormat,
  type SourceImportCommitProjection,
  type SourceImportRetainedBoundaryLabel,
  type SourceImportTargetSelection,
  type StagedImportProjection,
  type ContinueImportProjection,
  type DurableHistoryProjection,
  type ManuscriptWindowTarget,
  type MilestoneProjection,
  type OutlineProjection,
  type PriorWorkItemProjection,
  type ReplacementCommitProjection,
  type ReplacementDismissalProjection,
  type ReplacementPreviewProjection,
  type RecoveryComparisonProjection,
  type RecoveryDeferralProjection,
  type RecoveryRestorationProjection,
  type RecoverySelection,
  type RecoveryWindowProjection,
  type RecoveryWindowTarget,
  type SearchResultsProjection,
  type SearchSummaryProjection,
  type StartupProjection,
  type BookWorkbenchRoute,
  type ResolvedBookWorkbenchRoute,
  type ForegroundExecutionBoundaryProjection,
  type LaunchPolicyProjection,
  type TaskAuthorizationProjection,
  type BaselineAnalysisGoal,
  type BaselineAnalysisProjection,
  type AnalysisProjection,
  type BaselineAnalysisResultSetRevisionProjection,
  type BaselineAnalysisRunState,
  type BaselineAnalysisQuickStartProjection,
  type BaselineAnalysisUpdateActionProjection,
  type BaselineAnalysisUpdateMode,
  type BaselineAnalysisUpdateRequest,
  type DefaultExecutionRulePattern,
  type MaterialPlanInputsProjection,
  type DefaultExecutionRuleProjection,
  type DefaultExecutionRuleReference,
  type BackgroundAnalysisEnrollmentProjection,
  type BackgroundAnalysisScopeKind,
  type BackgroundAnalysisStartingPoint,
  type DefaultExecutionRulesProjection,
  type TaskPlanDefaultRuleProjection,
  type FactualReviewGoal,
  type FactualReviewProjection,
  type EvaluationInitialProjection,
  type InitialEvaluationProjection,
  type ReadersReportProjection,
  type ReadersReportTemplate,
  type EvaluationMarketProjection,
  type EvaluationRewriteDecision,
  type EvaluationRewriteProjection,
  type WritingDraftCreatedProjection,
  type WritingProjection,
  type WritingTaskProjection,
  type WritingTaskTypeProjection,
  type ReviewCategoryProjection,
  type ReviewCategoryTaskRequest,
  type ReviewFindingPageRequest,
  type ReviewRunScopeRequest,
  type ReviewWorkspaceProjection,
  type BookFindingsProjection,
  type ParagraphAnalysisProjection,
  MAX_WRITING_REQUIREMENTS_GRAPHEMES,
  MAX_WRITING_MATERIALS,
  MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES,
  MAX_WRITING_MATERIAL_GRAPHEMES,
  MAX_WRITING_MATERIAL_OFFERS,
  WRITING_KIND,
  BASELINE_ANALYSIS_KIND,
  FACTUAL_REVIEW_KIND,
  INITIAL_EVALUATION_KIND,
  READERS_REPORT_KIND,
  EVALUATION_REWRITE_KIND,
  type TaskPlanKind,
  type TaskPlanUnconfirmedProjection,
  reviewCategoryKindId,
  type FrozenSeriesScope,
  type CorrectionProposalDraftProjection,
  type CorrectionProposalSavedProjection,
  type EvidenceWorkspaceProjection,
  type FactualRunAssuranceProjection,
  type FactualVerificationLensProjection,
  type InspectEvidenceWorkspaceInput,
  type InspectFactualVerificationInput,
  type PlanEditsProjection,
  type PrepareCorrectionProposalInput,
  type RecordVerificationReviewDecisionInput,
  type SaveCorrectionProposalInput,
  type VerificationReviewDecisionRecordedProjection,
  MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES,
  type ResearchEvidenceBookProjection,
  type ResearchEvidenceCaptureState,
  type MaterialTranslationProjection,
  type MaterialVectorSearchProjection,
  MAX_SERIES_MEMBERS_PAGE,
  type InspectSeriesExclusionHistoryInput,
  type InspectSeriesExclusionTargetsInput,
  type PreviewSeriesExclusionInput,
  type RecordSeriesExclusionInput,
  type SeriesExclusionHistoryPageProjection,
  type SeriesExclusionPreviewProjection,
  type SeriesExclusionResultProjection,
  type SeriesExclusionTargetsProjection,
  type CancelWaitingTaskInput,
  type StartTaskWhenOnlineInput,
  type StartWhenOnlineTaskKind,
  type DialogueSelectionInput,
  type InspectTaskIntentDraftsInput,
  type PromoteAnswerToTaskIntentDraftInput,
  type PromoteTaskIntentDraftInput,
  type SaveTaskIntentDraftInput,
  type TaskIntentDraftProjection,
  type TaskIntentDraftRangeProjection,
  type TaskIntentDraftsProjection,
  MAX_TASK_INTENT_DRAFT_RANGES,
  MAX_EXEMPLAR_BOOKS_PAGE,
} from '../shared/protocol.js';
import { importedMarksRecord, nonEffects, recordsToCreate } from './import-review-records.js';
import {
  recordStructureChoice,
  recordedStructureChoice,
  reviewStructureChoice,
  reviewStructureField,
  stagedHasPieces,
  stagedStructureField,
} from './manuscript/import-structure.js';
import { insertMergedImportBlocks } from './manuscript/merged-import-blocks.js';
import {
  heldSpanPins,
  selectionSpanRange,
  verifySelectionSpan,
  verifyWorkingSpan,
  type VerifiedSelection,
} from './manuscript/selection-span.js';
import { SELECTION_SPAN_SEPARATOR, spanGraphemes } from '../shared/selection-span.js';
import { HouseWordLists } from './review/house-word-list.js';
import {
  HouseWordListError,
  type InspectHouseWordListInput,
  type SaveHouseWordListInput,
} from '../shared/protocol/house-word-list.js';
import {
  validateRequestAdmissionRecords,
  AnalysisError,
  BaselineAnalysisStore,
  RUN_WAITING_IDLE_LABEL,
  runIsActive,
  type AnalysisPreparationResult,
  type BaselineAnalysisPreparationResult,
  type ProgressReader,
  type UnconfirmedOutcomeRecord,
} from './analysis/baseline-analysis-store.js';
import { LATEST_SCHEMA_VERSION, TaskAuthorizationError, TaskAuthorizationStore, type TaskPreparationResult } from './task-authorization.js';
import { ReviewRunError, ReviewRunStore } from './review/review-runs.js';
import { sha256Hex, canonicalRecord, hasExactKeys, isRecord } from './analysis/canonical.js';
import { graphemeCount, FACTUAL_VERIFICATION_POLICY_VERSION } from './analysis/factual-review-contract.js';
import { executionBackgroundShare } from './analysis/execution.js';
import { EditorialLearningLedger, LearningReads, type WordLearningProofs } from './learning/ledger.js';
import type { CurationRun } from './learning/curation.js';
import type {
  LearningCurationBundle,
  WordTrackedEditLearningSource,
  ChangeEditorialLearningInput,
  CreateEditorialMemoryInput,
  DeactivateEditorialMemoryInput,
  InspectEditorialLearningInput,
  EditorialLearningProjection,
  LearningReasonAskInput,
  LearningReasonAskProjection,
} from '../shared/protocol/learning.js';
import {
  AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST,
  AGENT_WORKSPACE_RETRIEVAL_PROMPT_CONTRACT_DIGEST,
  dialogueQuestion,
} from './dialogue/contract.js';
import { globalAgentScopedTools, type GlobalAgentTurnHistory } from './dialogue/global-agent-session.js';
import type { ProcedureDefinitionDocument } from '../shared/protocol/procedures.js';
import { SupervisionDirectives } from './learning/supervision-directives.js';
import {
  analysisBytePage,
  revisionUnitsPage,
  analysisOverviewPage,
  baselineAnalysisSummaryPage,
} from './analysis/baseline-analysis-wire.js';
import { SkillAcquisitions } from './imported-skills.js';
import {
  HOUSE_REVIEW_PREFERENCE_CATEGORY,
  allowedProductionBindingOf,
  resolveSourceCheckoutLaunchPolicySync,
  readRetainedBoundAnalysisPolicySync,
  type ConfiguredProviderBinding,
} from './launch-policy.js';
import * as customAnalysisOperations from './custom-analysis-dimensions.js';
import { CustomAnalysisDimensionError, CustomAnalysisDimensions, customAnalysisVersionInput } from './custom-analysis-dimensions.js';
import { CustomAnalysisDocumentError } from './analysis/custom-analysis-contract.js';
import { customAnalysisPlan } from './analysis/custom-analysis-kind.js';
import * as learningSupervision from './house-review-preference.js';
import { HouseReviewPreferenceLedger } from './house-review-preference.js';
import { EditorialMarkError, EditorialMarkStore, followReimportedMarks, resolveBranchMarksAfterRewrite, workingBlockDigests, type ReimportMarkOutcome, type ReimportMarkRow, type ProducedEditorialMarkInput } from './editorial-marks.js';
import {
  RetrievalIndex,
  RetrievalError,
  type RetrievalMaterialVectorQuery,
  type RetrievalSource,
} from './retrieval/index.js';
import { materialRetrievalSources } from './retrieval/source-readers.js';
import {
  TASK_MATERIALS_NONE,
  TASK_MATERIALS_STATEMENT,
  TASK_MATERIAL_LIVE_UNAVAILABLE,
  taskMaterialSources,
  taskMaterialWords,
  taskMaterialRefusal,
  TASK_MATERIAL_OFFER_DAMAGED,
  type MaterialGuardRefusal,
  type TaskMaterialBoundary,
  type TaskMaterialReading,
  type TaskMaterialSource,
} from './task-material-references.js';
import { createHash, randomUUID } from 'node:crypto';
import type { FactualRecheckCandidate, FactualRecheckRun } from './analysis/factual-recheck.js';
import { LocalFixturePolicyCatalog, type LocalFixtureRuntimeContext } from './provider/model-fixture.js';
import {
  closeSync,
  constants,
  createReadStream,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { copyFile, lstat, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import {
  DIGEST_PATTERN,
  StoreError,
  StoreFatalError,
  UUID_PATTERN,
  asNumber,
  asString,
  canonicalJson,
  requireStore,
  sha256,
  type SqlRow,
} from './store-records.js';
import { inspectBookFindings, paragraphAnalysis, type BookFindingsHost } from './book-findings.js';
import { initialEvaluationKindDefinition } from './evaluation/initial-evaluation-kind.js';
import { liveMaterialRule } from './analysis/live-kind-admission.js';
import { producedUnverified } from './evaluation/unverified-disclosure.js';
import { evaluationRewriteScoredItems } from './evaluation/evaluation-rewrite-contract.js';
import * as evaluationRewriteOperations from './evaluation-rewrites.js';
import { EvaluationRewriteError, EvaluationRewrites, evaluationRewriteRefusal } from './evaluation-rewrites.js';
import {
  type ReadersReportContractInput,
  type ReadersReportExemplarInput,
} from './evaluation/readers-report-contract.js';
import * as readersReportOperations from './readers-reports.js';
import { ReadersReportError, ReadersReports } from './readers-reports.js';
import { WRITING_EXEMPLAR_MOVED, WritingTasks, graphemeLength, writingMaterialDigest, writingMaterialOverBound, writingMaterialOverBoundNamed, writingMaterialParagraph, writingMaterialsOverTotal, writingWords, type StoredWritingTask, type WritingExemplarSource, type WritingMaterialReading, type WritingMaterialSource } from './writing-tasks.js';
import {
  WRITING_COPY_RULES,
  type WritingCopyRules,
  type WritingBookInput,
  type WritingContractInput,
  type WritingEvaluationInput,
  type WritingExemplarInput,
  type WritingMaterialInput,
  type WritingSynopsisInput,
} from './writing/writing-contract.js';
import {
  baselineAnalysisKindDefinition,
  factualReviewKindDefinition,
  RETAINED_V1_RECORDED_FIXTURE_IDENTITY,
  RETAINED_V2_RECORDED_FIXTURE_IDENTITY,
  type AnalysisKindDefinition,
} from './analysis/kind-definition.js';
import { convertDocManuscript, isDocConversionRefusal } from './doc-manuscript.js';
import {
  buildFidelityReport,
  deriveImportFidelityPlan,
  DOCX_PARSER_IDENTITY,
  DOCX_NOTE_PARSER_IDENTITY,
  DOCX_SPLIT_PARSER_IDENTITY,
  isCleanTracerFidelity,
  MAX_ARCHIVE_BYTES,
  parseDocx,
  parseNativeDocxIntake,
  parseNativeDocxIntakeBytes,
  compileWordTrackedDocx,
  compileWordTrackedDocxBytes,
  WORD_DOCX_PARSER_IDENTITY,
  wordImportFidelityReport,
  withTextBoxDisposition,
  type FidelityConversionIdentity,
  type ImportFidelityPlan,
  type ParsedDocx,
  type ParsedDocxBlock,
  type ParsedWordDocx,
  type NativeDocxIntakeParse,
  type WordTrackedCompilation,
  type TextBoxDisposition,
} from './docx.js';
import {
  MANUSCRIPT_FORMAT_HEAD_BYTES,
  editableImport,
  identifyManuscriptFormat,
  isManuscriptObjectKey,
  manuscriptObjectExtension,
} from './manuscript-format.js';
import { convertTextManuscript, isTextConversionRefusal, type ConversionLoss } from './text-manuscript.js';
import { ManuscriptApplyStore } from './manuscript-apply.js';
import { OUTCOME_UNKNOWN_NOT_RESENT } from './analysis/outcome-unknown.js';
import {
  newSeriesKnowledgeReadings,
  frozenSeriesScopes,
  seriesScopeMaterials,
} from './review/series-consistency.js';
import { PublicationVersionError, PublicationVersionStore } from './publication-versions.js';
import {
  GLOBAL_ATTENTION_READ_LIMIT,
  GlobalAttentionError,
  composeBookTasks,
  composeGlobalAttention,
  readImportAttention,
  readApplyOutcomeAttention,
  readRecoveryAttention,
  recentWindowStart,
  type UnconfirmedAttentionReading,
  type DialogueTaskReading,
  type MaterialIndexAttentionReading,
  type TaskIntentDraftAttentionReading,
  type WaitingTaskAttentionReading,
} from './global-attention.js';
import { ALWAYS_ONLINE, type TaskPlanConnectivity } from './connectivity.js';
import { RecentCache } from './recent-cache.js';
import {
  baselineAnalysisPlan,
  baselineClarifications,
  initialEvaluationPlan,
  seriesScopePlan,
  evaluationMaterialPlan,
  readersReportPlan,
  evaluationRewritePlan,
  writingPlan,
  defaultRuleBindingRows,
  fixedTaskPlan,
  noDefaultRule,
  reviewRunPlan,
  TaskPlanError,
  withConnectionReadiness,
  withConnectivityReadiness,
  withPlanMovedReason,
  withAnswerBlockers,
  withResumeBlockers,
  withLedgerRunControls,
  isRemoteExecutionRoute,
  withResend,
  RESUME_BLOCKED_BINDING,
  withWaitingReason,
  type WaitingFor,
  RESUME_BLOCKED_CONNECTION,
  RESUME_BLOCKED_OFFLINE,
  ANSWER_BLOCKED_CONNECTION,
  ANSWER_BLOCKED_OFFLINE,
  type BaselineStoppedRunFacts,
  type BaselineCancellationRanges,
  assuranceSelector,
  taskPlanPage,
  taskDraftsPage,
  bookTasksPage,
  reviewWorkspacePage,
  REVIEW_WORKSPACE_PAGE_PATHS,
} from './task-plan.js';
import { decisionResolvesConflict, ProposalConflictError, ProposalConflictStore, readConflictAttention, type ProposalConflictRegenerationLineage } from './proposal-conflicts.js';
import { ImportRetentionError, validateWordImportRetentionVersion, validateWordImportRetentionClosure, recordTextBoxChoice, recordedTextBoxChoice, stageImportSources, stageWordRevisionIntake, wordIntakeForStagedReading, requireWordStagedIntake, bindWordReadingBlocks, wordTrackedSamples, wordTrackedSampleRecord, validateWordChoice, wordPreparedChoice, wordPreparedSelection, recordWordPreparedIntake, requireWordPreparedIntake, stagedImportSourcesMatch, stagedTextBoxParagraphs, readWordParentSourcePin, requireWordParentSourcePin, retainWordRevisionSource, retainWordRevisionImport, bindWordReadingToRevision, retainWordManuscriptSourceSegments, requireWordManuscriptSourceSegments, readWordImportChoiceRecord, wordParentSourcePinRecord, createWordSampleDetailContext, wordSampleDetailContextCurrent, wordSourceFragmentText, resolveWordSampleDetailSource, pageWordSampleDetail, type WordSampleDetailContext, type WordSampleDetailPage, type WordReadingKind, type WordPreparedIntake, type WordCompiledReading, type WordTrackedChoiceInput, type WordImportChoiceRecord, type StagedImportSources } from './import-retention.js';
import { ImportedMarkError, createImportedMarks, createWordImportedMarks, validateWordImportedMarkSources, stageImportedMarks, stagedImportedMarksMatch } from './imported-marks.js';
import { ExportLedgerError, ManuscriptExportStore, readWordManuscriptExportSource } from './manuscript-export.js';
import { DEFAULT_EXECUTION_RULES_STATEMENT, DEFAULT_EXECUTION_RULE_PROCEDURES, DefaultExecutionRuleError, DefaultExecutionRuleLedger, QUICK_START_DEVELOPER_LIVE, QUICK_START_MODE_UNAVAILABLE, QUICK_START_NEEDS_CONNECTION, QUICK_START_NOT_READY, QUICK_START_OFFLINE, QUICK_START_PLAN_CHANGED, QUICK_START_RANGE_REASON, QUICK_START_RULE_CHANGED, QUICK_START_RESEND, RULE_STATE_LABELS, SET_RULE_BUDGET, SET_RULE_CHANGED, SET_RULE_DEVELOPER_LIVE, SET_RULE_ORDINARY_PRODUCTION, SET_RULE_EDITED, SET_RULE_FIRST_BASELINE, SET_RULE_RANGE, defaultExecutionRuleBindingOf, defaultExecutionRuleCovers, defaultExecutionRuleDoes, defaultExecutionRuleKind, defaultExecutionRuleDrift, defaultExecutionRuleReference, isDefaultExecutionRulePattern, quickStartNoRuleReason, ruleDriftReason, setRuleAlreadyReason, type DefaultExecutionRuleRecord } from './default-execution-rules.js';
import * as backgroundEnrollments from './background-analysis-enrollments.js';
import { BACKGROUND_ANALYSIS_LISTED, BACKGROUND_ANALYSIS_NOT_GRANTED, BACKGROUND_CEILING_RULE, BACKGROUND_NO_CEILING, BACKGROUND_NO_RULE, BACKGROUND_PAUSED, BACKGROUND_ENROLL_NO_ROUTE, BACKGROUND_ENROLL_NO_SHARE, BACKGROUND_NO_ROUTE, BACKGROUND_PLACE_BUSY, BACKGROUND_PREPARATION_IN_FLIGHT, BACKGROUND_EDITOR_JOB, BACKGROUND_RECOVERY_PENDING, BACKGROUND_RECORD_DAMAGED, BACKGROUND_REPLACEMENT_WAITING, BACKGROUND_REVOKED, backgroundQuietReason, backgroundShareFullReason, BACKGROUND_ANALYSIS_KIND, BACKGROUND_ANALYSIS_STATEMENT, BACKGROUND_ANALYSIS_WHAT, BACKGROUND_ENROLL_NO_RULE, BACKGROUND_FACTS_UNREADABLE, BACKGROUND_REVOKE_CONSEQUENCES, BACKGROUND_STARTING_POINT_LABELS, BACKGROUND_STARTING_POINT_NOTES, BACKGROUND_STATE_LABELS, BackgroundAnalysisEnrollmentError, BackgroundAnalysisEnrollmentLedger, backgroundAnalysisDecisionOf, backgroundAnalysisWhen, backgroundDriftReason, backgroundEnrollmentDrift, backgroundEnrollmentName, backgroundScopeLabel, BACKGROUND_CEILING_REQUIRED, type BackgroundAnalysisDecision, type BackgroundAnalysisEnrollmentRecord } from './background-analysis-enrollments.js';
import { BookDeliveryPackageError, BookDeliveryPackages, type PackageReadersReportReading } from './book-delivery-packages.js';
import { MaintenanceCaseError, MaintenanceCases } from './maintenance-cases.js';
import { BookPeople, BookPeopleError } from './book-people.js';
import { ReviewGuidelineError, ReviewGuidelineLedger, readGuidelineFile } from './review-guidelines.js';
import { RESEARCH_EVIDENCE_INCOMPLETE, RESEARCH_EVIDENCE_READ_ONLY, ResearchEvidenceError, ResearchEvidenceLedger } from './research-evidence.js';
import { FactualVerificationLedger, type ManuscriptReader } from './factual-verification.js';
import { planEditAssuranceLevel } from './analysis/plan-edits.js';
import { LibraryMaterialError, LibraryMaterialLedger, libraryMaterialTitle } from './library-materials.js';
import { MaterialIndexError, MaterialIndexLedger, sweepMaterialIndexWork, type MaterialEmbeddingFacts, type MaterialLayerActivity, type MaterialReferenceBoundary, type MaterialReferencePin, type MaterialTaskReading, type MaterialVectorQuery } from './material-index.js';
import type { EmbeddingProvider } from './knowledge/embedding.js';
import { StubEmbeddingProvider } from './knowledge/embedding-stub.js';
import type { MaterialTranslator } from './fast-role/material-translation-contract.js';
import { BUILTIN_EVALUATION_PROFILE, EvaluationError, EvaluationRecords, evaluationProfileDigest, type InitialEvaluationFacts } from './evaluation-records.js';
import { AnalysisFeedbackError, AnalysisFeedbackLedger } from './analysis-feedback.js';
import { OutcomeResolutionLedger } from './analysis/outcome-resolutions.js';
import { DecisionFeedbackError, DecisionFeedbackLedger } from './decision-feedback.js';
import { LOCAL_LEARNING_POLICY_BASIS, LearningEligibilityError, LearningEligibilityLedger, analysisFeedbackCandidate, learningMaterialDigest, wordTrackedEditCandidate, proposalDecisionCandidate, reviewDispositionCandidate, type LearningMaterialCandidate } from './learning-eligibility.js';
import {
  BUILTIN_REVIEW_CATEGORY_CONFIGURATION,
  HISTORICAL_REVIEW_CATEGORY_CONFIGURATION,
  reviewCategoryEntry,
} from './review/category-configuration.js';
import { EvaluationCalibrationError, EvaluationCalibrationLedger } from './evaluation-calibration.js';
import { UsageLedger } from './usage.js';
import * as seriesOperations from './series.js';
import { SeriesError, SeriesLedger, weighedPage } from './series.js';
import {
  CALIBRATION_MIN_ADJUSTMENTS,
} from '../shared/evaluation-calibration.js';
import { DATA_VERSION, DATA_VERSION_FROZEN, dataVersionAt, DataVersionError, DataVersionLedger, inspectDataVersionMarker, MAX_STORE_VERSIONS_LISTED, readDataVersionMarker, readSoftwareVersion, refuseNewerDataVersion, refuseOlderDataVersion, SCHEMA_REVISION_CLASSES, storeRevisionOnDisk, writeDataVersionMarker, type DataVersionMarker } from './data-version.js';
import { DatabaseExportError, DatabaseExports } from './database-exports.js';
import { DATA_VERSION_MARKER_UNWRITABLE } from '../shared/data-version-labels.js';
import { ScheduledBackupError, ScheduledBackups, backupLocationFor } from './scheduled-backups.js';
import { BASELINE_SCHEMA_REVISION, createStoreAtBaseline, requireBaselineSchema } from './baseline-schema.js';
import { validateBoundedStore } from './bounded-manuscript.js';
import { validateConnectionRecords } from './store-schema.js';
import { validateProcedureDefinitions } from './procedures/definition-store.js';
import { validateMaterialTranslationAttemptSchema } from './material-index.js';
import { validateLocalStageArtifacts } from './review/review-runs.js';
import { DatabasePackageError } from './database-package-reader.js';
import { DatabaseReplacementError, DatabaseReplacements, completeReplacement, openWithPendingReplacement } from './database-replacement.js';
import { DatabaseMergeError } from './database-merge.js';
import { SeriesExclusionError, SeriesExclusionLedger, type SeriesKnowledgeMaterial } from './series-exclusions.js';
import { DIALOGUE_BASIS_QUOTE_CHARACTERS, DIALOGUE_MARK_SOURCE_LABEL, DialogueError, DialogueLedger, MAX_DIALOGUE_PROPOSAL_CHARACTERS, type DialogueOutcome, type DialogueTurnStart, type StoredDialogueBinding, type StoredDialogueTask, type QualifiedGlobalAttemptMetadata } from './dialogue/dialogue-ledger.js';
import {
  dialogueProjection,
  harnessHistoryReader,
  keptText,
  resolveAttempts,
  type DialogueHistoryReader,
  type LiveAnswer,
} from './dialogue/dialogue-history.js';
import { HARNESS_SESSION_LOG_DIRECTORY, readHarnessSessionLog } from './harness/session-log.js';
import { DRAFT_FIRST_BASELINE_UNAVAILABLE, DRAFT_RANGE_STATE_LABELS, TaskIntentDraftError, TaskIntentDraftLedger, draftAnswer, draftGoal, draftOutcomeClass, goalFromText, draftBlockBounds, draftParagraphs, draftRangesPlan, isProcedurePin, requireDraft, resolutionOffers, resolveDraft, type DraftResolutionFacts, type StoredDraft, type StoredDraftRange } from './task-intent-drafts.js';
import { graphemesOf } from '../shared/mark-anchor.js';
import { SeriesKnowledgeError, SeriesKnowledgeLedger } from './series-knowledge.js';
import { EvaluationProfiles } from './evaluation-profiles.js';
import { ImportedExemplars, ImportedExemplarError } from './imported-exemplars.js';
import { readExemplarBook, withPackagedVersions, type ExemplarSources } from './exemplars.js';
import * as capturedProcedureOperations from './captured-procedures.js';
import { evaluationMarket, type EvaluationMarketHost } from './evaluation-market.js';
import * as evaluationCalibrationOperations from './evaluation-calibration-operations.js';
import * as productionDocumentOperations from './production-document-operations.js';
import { CapturedProcedures } from './captured-procedures.js';
import { ProductionDocumentOriginError } from './production-document-origins.js';
import { BookDeliveryPackageExportError, BookDeliveryPackageExports } from './book-delivery-package-exports.js';
import { ProductionDocumentWorkflow, ProductionDocumentWorkflowError, type WorkflowProfilePin } from './production-document-workflow.js';
import {
  ProductionDocumentError,
  ProductionDocuments,
} from './production-documents.js';
import type { WaitingRunBlockCause } from './reconnect-preflight.js';
import {
  REIMPORT_GROUP_VERBS,
  groupReimportMappings,
  reimportGroupResolutions,
  reimportGroupVerbs,
} from './reimport-groups.js';
import type { ReviewRunDriveSteps } from './review/review-run-driver.js';

import { BoundedManuscriptStore, BoundedStoreError, BoundedStoreFatalError, type ReimportCheckpointBinding } from './bounded-manuscript.js';
import { RecoveryObjectStore } from './recovery-objects.js';
import {
  createCanonicalExternalDataRoot,
  ensureCanonicalDataDirectory,
  inspectCanonicalDataFile,
} from '../shared/data-root.js';
import { loadBuiltInManuscriptProfile, type BuiltInWorkflowProfile } from './native-workflow-profile.js';
import { EditorialWorkspaceProfileError, EditorialWorkspaceProfileFatalError, EditorialWorkspaceProfileStore, validateEditorialWorkspaceProfileSchema } from './editorial-workspace-profile.js';
import {
  REVIEW_CATEGORY_CACHE_CAPACITY,
  TASK_PLAN_NOT_CURRENT_REASON,
  one,
  parseStoredJson,
  type DraftPromotion,
  type LedgerTaskKind,
  type StoreControl,
  type WritingExemplarScan,
} from './store-operation-support.js';
import { configureDatabase, WalCheckpointPolicy } from './store-schema.js';

export { CUSTOM_ANALYSIS_NOT_ADMITTED_REASON,CUSTOM_ANALYSIS_TEMPLATE_ECHO_REASON } from './custom-analysis-dimensions.js';
export { StoreError,StoreFatalError,importedMarksRecord };

export { boundedGraphemes } from './readers-reports.js';
export { EVALUATION_PROFILE_UNKNOWN_ID,EVALUATION_PROFILE_UNKNOWN_TITLE,REVIEW_CATEGORY_CACHE_CAPACITY,type DraftPromotion,type LedgerTaskKind,type StoreControl } from './store-operation-support.js';

const TOKEN_PATTERN = UUID_PATTERN;

const BOOK_SUMMARY_PAGE_SIZE = 20;

const BOOK_HISTORY_PAGE_SIZE = 8;

const EMPTY_BOOK_NON_EFFECTS = [
  '不创建稿件、来源、修订版、工作流实例或导入记录',
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本',
  '不创建公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
] as const;

function requireBoundedBookOverview(projection: BookWorkOverviewProjection): BookWorkOverviewProjection {
  requireStore(
    Buffer.byteLength(JSON.stringify(projection), 'utf8') <= MAX_FRAME_BYTES - REIMPORT_WIRE_HEADROOM_BYTES,
    'BOOK_HISTORY_PAGE_INVALID',
    '图书概览历史页超出有界服务帧。',
  );
  return projection;
}

/** Which Task kind's plan a kind's 结果待确认 is listed on (Issue #757): a review category's is its Review Run's. */
function unconfirmedSurfaceOf(kind: string): TaskPlanKind | null {
  // A 自定义分析维度's Task is planned and started from ②A as the baseline's is (Issue #922).
  if (kind === BASELINE_ANALYSIS_KIND || isCustomAnalysisKindId(kind)) return 'baseline-analysis';
  if (kind === FACTUAL_REVIEW_KIND || isReviewCategoryKindId(kind)) return 'review-run';
  if (kind === INITIAL_EVALUATION_KIND) return 'initial-evaluation';
  if (kind === READERS_REPORT_KIND) return 'readers-report';
  if (kind === EVALUATION_REWRITE_KIND) return 'evaluation-rewrite';
  if (kind === WRITING_KIND) return 'writing';
  return null;
}

/** What 保留为缺口 names: the digest of exactly the outcomes listed, in key order (Issue #757). */
function unconfirmedDigest(listed: { ranges: ReadonlyArray<{ key: string }>; steps: ReadonlyArray<{ key: string }> }): string {
  return sha256(canonicalJson([...listed.ranges, ...listed.steps].map((entry) => entry.key).sort()));
}

/** Why 保留为缺口 was refused: the list moved since the editor read it (Issue #757). */
export const UNCONFIRMED_CHANGED = '结果待确认的列表已经变化；请重新查看后再确认。' as const;

function stableUuid(value: string): string {
  const digest = sha256(value).slice(0, 32).split('');
  digest[12] = '5';
  digest[16] = '8';
  return `${digest.slice(0, 8).join('')}-${digest.slice(8, 12).join('')}-${digest.slice(12, 16).join('')}-${digest.slice(16, 20).join('')}-${digest.slice(20).join('')}`;
}

function workflowProjectionJson(profile: BuiltInWorkflowProfile): string {
  return canonicalJson({
    schema: profile.projection.schema,
    id: profile.projection.id,
    name: profile.projection.name,
    version: profile.projection.version,
    phases: profile.projection.phases,
    gates: profile.projection.gates,
  });
}

function safeTitle(input: string): string {
  requireStore(input.isWellFormed(), 'TITLE_INVALID', '书名必须是有效文本。');
  const title = input.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  requireStore(title.length > 0 && title.length <= 180, 'TITLE_INVALID', '书名必须为 1–180 个字符。');
  return title;
}

function safeInternalNumber(input: string | null): string | null {
  if (input === null) return null;
  requireStore(input.isWellFormed(), 'INTERNAL_NUMBER_INVALID', '内部编号必须是有效文本。');
  const internalNumber = input.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  requireStore(
    internalNumber.length > 0 && internalNumber.length <= 80,
    'INTERNAL_NUMBER_INVALID',
    '内部编号必须为 1–80 个字符，或留空。',
  );
  return internalNumber;
}

function exactBookChoiceLabel(title: string, bookId: string, internalNumber: string | null): string {
  return `${title} · ${internalNumber === null ? '' : `内部编号 ${internalNumber} · `}图书 ID ${bookId}`;
}

function nullableString(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : asString(value);
}

async function digestFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function contentObjectPath(objectsRoot: string, objectDigest: string, relativeKey: string): string {
  requireStore(DIGEST_PATTERN.test(objectDigest) && isManuscriptObjectKey(objectDigest, relativeKey),
    'OBJECT_PATH_INVALID', '对象摘要或相对路径无效。');
  const path = resolve(objectsRoot, ...relativeKey.split('/'));
  requireStore(isInside(objectsRoot, path), 'OBJECT_PATH_INVALID', '对象路径越界。');
  return path;
}

/** Read one bounded immutable original, with canonical path and actual byte proof rather than a database generation. */
async function readRetainedWordOriginal(db: DatabaseSync, dataRoot: string, objectsRoot: string, bookId: string,
  sourceVersionId: string): Promise<Uint8Array> {
  const parent = readWordParentSourcePin(db, bookId, sourceVersionId);
  requireStore(parent.sourceBytes <= MAX_ARCHIVE_BYTES, 'WORD_SOURCE_INVALID', 'Word 原文件超过已支持的包大小。');
  const object = db.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').get(parent.objectDigest);
  requireStore(object && object.byte_length === parent.sourceBytes, 'WORD_SOURCE_INVALID', 'Word 原文件对象记录不完整。');
  const path = contentObjectPath(objectsRoot, parent.objectDigest, asString(object.relative_key));
  const inspected = await inspectCanonicalDataFile(dataRoot, dirname(path), basename(path));
  requireStore(inspected.exists && inspected.path === path, 'WORD_SOURCE_UNAVAILABLE', 'Word 原文件无法读取。');
  const metadata = await lstat(path);
  requireStore(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size === parent.sourceBytes,
    'WORD_SOURCE_UNAVAILABLE', 'Word 原文件不再是完整的留存文件。');
  const hash = createHash('sha256');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    bytes += chunk.byteLength;
    requireStore(bytes <= parent.sourceBytes, 'WORD_SOURCE_UNAVAILABLE', 'Word 原文件在读取时已经变化。');
    hash.update(chunk); chunks.push(chunk);
  }
  requireStore(bytes === parent.sourceBytes && hash.digest('hex') === parent.sourceDigest,
    'WORD_SOURCE_UNAVAILABLE', 'Word 原文件字节与留存摘要不一致。');
  return Buffer.concat(chunks, bytes);
}

/** Before backup or migration, replay every committed Word source and every complete import manifest. */
async function validateRetainedWordImports(db: DatabaseSync, dataRoot: string, objectsRoot: string): Promise<void> {
  validateWordImportRetentionClosure(db);
  const ledger = new EditorialLearningLedger(db);
  for (const source of db.prepare('SELECT book_id, source_version_id FROM word_revision_sources').iterate()) {
    const bookId = asString(source.book_id);
    const sourceVersionId = asString(source.source_version_id);
    const original = await readRetainedWordOriginal(db, dataRoot, objectsRoot, bookId, sourceVersionId);
    for (const imported of db.prepare('SELECT commit_id, revision_id FROM word_revision_imports WHERE source_version_id = ?').iterate(sourceVersionId)) {
      const commitId = asString(imported.commit_id);
      const { compiled } = readWordManuscriptExportSource(db, bookId, asString(imported.revision_id), sourceVersionId, original);
      validateWordImportedMarkSources(db, bookId, commitId, compiled);
      ledger.validateWordImportSamples(bookId, commitId, compiled);
    }
  }
}

function isInside(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

/**
 * Close one database handle a refusing `EditorialStore.open` has already opened. A failure to close
 * it must never replace the refusal the caller is owed: the handle is unreachable either way, and
 * the original error is thrown immediately after.
 */
function closeDatabaseQuietly(db: DatabaseSync | null): void {
  if (db === null) return;
  try {
    db.close();
  } catch {
    // The refusal that ended the open is the error the caller must see.
  }
}

export const SOURCE_VERSION_PARSER_CHANGED_MESSAGE =
  '这本书里已有同一个文件的来源版本，但它是用旧版 AI7 的读取方式导入的；AI7 现在读取文件的方式已经不同，不能在原来的来源版本上再次导入这个文件。可以把它作为新建图书导入。';

/**
 * J-01's `tamper-reimport-proof-before-validation` control (Issue #569): one reimport mapping's staged text altered before the
 * whole-store validation, which must then refuse the store. Only a mapping that has staged text is chosen — a deletion's is
 * NULL, and `NULL || '篡改'` is NULL, which would report one change and alter nothing — so the store is tampered every time.
 */
export const REIMPORT_PROOF_TAMPER_SQL = `UPDATE manuscript_reimport_mappings SET staged_text = staged_text || '篡改'
           WHERE mapping_id = (
             SELECT mapping_id FROM manuscript_reimport_mappings WHERE staged_text IS NOT NULL ORDER BY mapping_id LIMIT 1
           )`;

/** The profile a Production Document follows (Issue #415, S66c): the Book's built-in workflow profile's projection. */
function workflowProfilePin(profile: BuiltInWorkflowProfile): WorkflowProfilePin {
  return { id: profile.projection.id, name: profile.projection.name, version: profile.projection.version, digest: profile.projection.digest };
}

/** An analysis item's own words, for its Learning Material's excerpt: the synopsis, or one entry of the four lists. */
function analysisItemLabel(revision: BaselineAnalysisResultSetRevisionProjection | null, itemKey: string): string | null {
  if (revision === null) return null;
  const synthesis = revision.synthesis;
  if (itemKey === 'synopsis') return synthesis.synopsis;
  const [dimension, index] = itemKey.split('/');
  const at = Number(index);
  switch (dimension) {
    case 'entities': { const entity = synthesis.entities[at]; return entity === undefined ? null : entity.name; }
    case 'events': { const event = synthesis.events[at]; return event === undefined ? null : event.summary; }
    case 'relationships': { const relationship = synthesis.relationships[at]; return relationship === undefined ? null : `${relationship.subject}—${relationship.relation}—${relationship.object}`; }
    case 'settings': { const claim = synthesis.settingClaims[at]; return claim === undefined ? null : `${claim.subject}：${claim.claim}`; }
    default: return null;
  }
}

/**
 * What the 后台分析登记 dispatcher knows beside the store's records (Issue #95, S39): whether this launch has a route that
 * executes a Run, whether the governor has a place free, the clock, and the quiet period the manuscript must stand still for.
 */
export interface BackgroundAnalysisRuntime {
  readonly routeExecutable: boolean;
  readonly placeFree: boolean;
  /** How many Runs the governor executes at once: background Runs take at most all but one of them. */
  readonly capacity: number;
  /** A job the editor asked for — a preparation of any kind, a search, an export — is queued or under way. */
  readonly editorWorkBusy: boolean;
  readonly now: number;
  readonly quietMs: number;
}

/**
 * A Run waiting in Connectivity Wait, of any kind (Issue #760, plan slice S74c): its Book, its Task, and its Run — a Review Run
 * waits as a whole, and names itself, since its categories' Runs are recorded only as each one's turn comes.
 */
export interface WaitingTaskRun {
  readonly kind: 'baseline-analysis' | StartWhenOnlineTaskKind;
  readonly bookId: string;
  /** The Task Intent of a ledger Task; the Review Run of a review. */
  readonly ref: string;
  /** The Run Record of a ledger Task; the Review Run of a review. */
  readonly runRecordId: string;
  /** When it was authorized to start once online: the order Reconnect Preflight looks at waiting Runs in. */
  readonly at: string;
}

/**
 * What moved, by the refusal a waiting ledger Task's own start check makes at Reconnect Preflight (Issue #760; OFF-008), in the
 * words 需要重新确认计划 names it with.
 */
const WAITING_TASK_MOVED_LABELS: Readonly<Record<string, string>> = {
  TASK_PLAN_NOT_CURRENT: '这本书当前的任务',
  EVALUATION_REWRITE_STALE: '这一版的评分',
  EVALUATION_REWRITE_UNAVAILABLE: '这一版的评分',
  WRITING_EXEMPLAR_MOVED: '范例',
  MATERIAL_INDEX_MOVED: '参考资料的索引版本（已不在本机）',
  MATERIAL_REFERENCE_UNAVAILABLE: '参考资料的允许参考（已撤回）',
  MATERIAL_INDEX_RECORD_INVALID: '参考资料的索引记录（已损坏）',
};

const WAITING_TASK_MOVED_FALLBACK = '计划依据的内容';

/** What 准备计划 starts (Issue #423, slice 7a): the existing preparation of one kind, with the draft it is prepared from. */
export type DraftPreparation =
  | { readonly kind: 'baseline'; readonly goal: BaselineAnalysisGoal; readonly update: BaselineAnalysisUpdateRequest | null; readonly intentDraft: DraftPromotion }
  | { readonly kind: 'review'; readonly categoryId: string; readonly scope: ReviewRunScopeRequest; readonly intentDraft: DraftPromotion }
  | {
    readonly kind: 'writing';
    readonly request: { typeId: string; audience: string; channel: string; requirements: string | null; materialIds: ReadonlyArray<string> };
    readonly intentDraft: DraftPromotion;
  };

export class EditorialStore {
  readonly #importRetentionOperationsHost: importRetentionOperations.ImportRetentionOperationsHost = this.#importRetentionOperationsHostOf();
  #importRetentionOperationsHostOf(): importRetentionOperations.ImportRetentionOperationsHost {
    const store = this;
    return {
      EditorialMemoryFacade,
      canonicalDegradationDecision,
      stageImportedMarks,
      stagedImportedMarksMatch,
      createWordImportedMarks,
      validateWordImportedMarkSources,
      get authority() { return store.#authority; },
      retentionCall: this.#retentionCall.bind(this),
      importedMarkCall: this.#importedMarkCall.bind(this),
      contentObjectPath: this.#contentObjectPath.bind(this),
      memoryFacade: this.#memoryFacade.bind(this),
      boundedCall: this.#boundedCall.bind(this),
      get boundedAuthority() { return store.#boundedAuthority; },
      learningLedger: this.#learningLedger.bind(this),
      get editorialMarks() { return store.#editorialMarks; },
      learningCall: this.#learningCall.bind(this),
      transaction: this.#transaction.bind(this),
      loadDraftSnapshot: this.#loadDraftSnapshot.bind(this),
      get workflowProfile() { return store.#workflowProfile; },
      persistedFidelityPlan: this.#persistedFidelityPlan.bind(this),
    };
  }

  readonly #manuscriptReimportOperationsHost: manuscriptReimportOperations.ManuscriptReimportOperationsHost = this.#manuscriptReimportOperationsHostOf();
  #manuscriptReimportOperationsHostOf(): manuscriptReimportOperations.ManuscriptReimportOperationsHost {
    const store = this;
    return {
      assertAvailable: this.#assertAvailable.bind(this),
      reimportLineageSourceVersionPage: this.#reimportLineageSourceVersionPage.bind(this),
      requireNoAbandonmentCleanupIntent: this.#requireNoAbandonmentCleanupIntent.bind(this),
      loadDraftSnapshot: this.#loadDraftSnapshot.bind(this),
      selectLegacyWordStaging: this.#selectLegacyWordStaging.bind(this),
      requireEditableFormat: this.#requireEditableFormat.bind(this),
      get reimportPreparationWork() { return store.#reimportPreparationWork; },
      boundedCall: this.#boundedCall.bind(this),
      get boundedAuthority() { return store.#boundedAuthority; },
      get authority() { return store.#authority; },
      identityFindings: this.#identityFindings.bind(this),
      transaction: this.#transaction.bind(this),
      reimportFidelity: this.#reimportFidelity.bind(this),
      assertForeignKeys: this.#assertForeignKeys.bind(this),
      get reimportResolutionWork() { return store.#reimportResolutionWork; },
      loadCommitAttemptForDraft: this.#loadCommitAttemptForDraft.bind(this),
      get verifiedCommitObjects() { return store.#verifiedCommitObjects; },
      get reimportCommitWork() { return store.#reimportCommitWork; },
      reconcileCommitAttempt: this.#reconcileCommitAttempt.bind(this),
      contentObjectPath: this.#contentObjectPath.bind(this),
      revalidateConversion: this.#revalidateConversion.bind(this),
      parseIntoIngest: this.#parseIntoIngest.bind(this),
      discardIngest: this.#discardIngest.bind(this),
      loadStoredCommitResult: this.#loadStoredCommitResult.bind(this),
      markCommitAttemptUncertain: this.#markCommitAttemptUncertain.bind(this),
      rememberVerifiedCommitObject: this.#rememberVerifiedCommitObject.bind(this),
      retentionCall: this.#retentionCall.bind(this),
      rewriteCommittedResultWithoutPresentationForTest: (...args) => this.rewriteCommittedResultWithoutPresentationForTest(...args),
      importedMarkCall: this.#importedMarkCall.bind(this),
      get editorialMarks() { return store.#editorialMarks; },
      stagedProjection: this.#stagedProjection.bind(this),
      reimportRecordPresentations: this.#reimportRecordPresentations.bind(this),
      getBookOverview: (...args) => this.getBookOverview(...args),
      getManuscriptWindowAt: (...args) => this.getManuscriptWindowAt(...args),
      stableUuid,
      exactBookChoiceLabel,
      nullableString,
      SOURCE_VERSION_PARSER_CHANGED_MESSAGE,
    };
  }

  readonly #importIntakeOperationsHost: importIntakeOperations.ImportIntakeOperationsHost = this.#importIntakeOperationsHostOf();
  #importIntakeOperationsHostOf(): importIntakeOperations.ImportIntakeOperationsHost {
    const store = this;
    return {
      assertAvailable: this.#assertAvailable.bind(this),
      identifySelectedManuscript: this.#identifySelectedManuscript.bind(this),
      stageSourceOnlyDraft: this.#stageSourceOnlyDraft.bind(this),
      stageConvertedManuscriptDraft: this.#stageConvertedManuscriptDraft.bind(this),
      parseIntoIngest: this.#parseIntoIngest.bind(this),
      withContentObjectLifecycle: this.#withContentObjectLifecycle.bind(this),
      persistContentObject: this.#persistContentObject.bind(this),
      transaction: this.#transaction.bind(this),
      get authority() { return store.#authority; },
      promoteIngestSnapshot: this.#promoteIngestSnapshot.bind(this),
      boundedCall: this.#boundedCall.bind(this),
      get boundedAuthority() { return store.#boundedAuthority; },
      assertForeignKeys: this.#assertForeignKeys.bind(this),
      stagedProjection: this.#stagedProjection.bind(this),
      discardIngest: this.#discardIngest.bind(this),
      requireNoAbandonmentCleanupIntent: this.#requireNoAbandonmentCleanupIntent.bind(this),
      loadCommitAttemptForDraft: this.#loadCommitAttemptForDraft.bind(this),
      reconcileCommitAttempt: this.#reconcileCommitAttempt.bind(this),
      recoveryProjection: this.#recoveryProjection.bind(this),
      loadDraftSnapshot: this.#loadDraftSnapshot.bind(this),
      revalidateSnapshot: this.#revalidateSnapshot.bind(this),
      originalFileAccess: this.#originalFileAccess.bind(this),
      identityFindings: this.#identityFindings.bind(this),
      reconstructReviewedReimportTarget: this.#reconstructReviewedReimportTarget.bind(this),
      invalidateReview: this.#invalidateReview.bind(this),
      reimportReviewProjection: this.#reimportReviewProjection.bind(this),
      reconstructReviewedSourceImportTarget: this.#reconstructReviewedSourceImportTarget.bind(this),
      sourceImportReviewProjection: this.#sourceImportReviewProjection.bind(this),
      reconstructReviewedImport: this.#reconstructReviewedImport.bind(this),
      reviewProjection: this.#reviewProjection.bind(this),
      get reimportCommitWork() { return store.#reimportCommitWork; },
      reselectConvertedDraft: this.#reselectConvertedDraft.bind(this),
      reselectSourceOnlyDraft: this.#reselectSourceOnlyDraft.bind(this),
      loadAbandonmentCleanupIntent: this.#loadAbandonmentCleanupIntent.bind(this),
      resumeAbandonmentCleanupIntent: this.#resumeAbandonmentCleanupIntent.bind(this),
      getImportStartup: (...args) => this.getImportStartup(...args),
      loadCommitAttempt: this.#loadCommitAttempt.bind(this),
      resolveImportTarget: this.#resolveImportTarget.bind(this),
      wordIntakePlan: this.#wordIntakePlan.bind(this),
      reviewedFidelity: this.#reviewedFidelity.bind(this),
      replaceStagedReading: this.#replaceStagedReading.bind(this),
      retentionCall: this.#retentionCall.bind(this),
      get control() { return store.#control; },
      get workflowProfile() { return store.#workflowProfile; },
      selectLegacyWordStaging: this.#selectLegacyWordStaging.bind(this),
      resolveSourceImportTarget: this.#resolveSourceImportTarget.bind(this),
      loadStoredCommitResult: this.#loadStoredCommitResult.bind(this),
      insertBookDimensionSet: this.#insertBookDimensionSet.bind(this),
      emptyBookImportTarget: this.#emptyBookImportTarget.bind(this),
      commitWordEvidence: this.#commitWordEvidence.bind(this),
      importedMarkCall: this.#importedMarkCall.bind(this),
      get editorialMarks() { return store.#editorialMarks; },
      getBookOverview: (...args) => this.getBookOverview(...args),
      assertImportPostconditions: this.#assertImportPostconditions.bind(this),
      getManuscriptWindow: (...args) => this.getManuscriptWindow(...args),
      sourceImportAuthorityCounts: this.#sourceImportAuthorityCounts.bind(this),
      bookSourceImportTarget: this.#bookSourceImportTarget.bind(this),
      sourceImportRecordPresentations: this.#sourceImportRecordPresentations.bind(this),
      TOKEN_PATTERN,
      workflowProjectionJson,
      nullableString,
    };
  }

  readonly #importReviewRecordsHost: importReviewOperations.ImportReviewRecordsHost = this.#importReviewRecordsHostOf();
  #importReviewRecordsHostOf(): importReviewOperations.ImportReviewRecordsHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      readWordIntake: this.#readWordIntake.bind(this),
      retentionCall: this.#retentionCall.bind(this),
      listBooks: (...args) => this.listBooks(...args),
      boundedCall: this.#boundedCall.bind(this),
      getBookOverview: (...args) => this.getBookOverview(...args),
      requireSameParser: this.#requireSameParser.bind(this),
      wordIntakePlan: this.#wordIntakePlan.bind(this),
      requireWordStagedReading: this.#requireWordStagedReading.bind(this),
      get workflowProfile() { return store.#workflowProfile; },
      reimportLandingWindow: this.#reimportLandingWindow.bind(this),
      exactBookChoiceLabel,
      stableUuid,
      safeTitle,
      nullableString,
    };
  }

  readonly #initialEvaluationOperationsHost: initialEvaluationOperations.InitialEvaluationOperationsHost = this.#initialEvaluationOperationsHostOf();

  #initialEvaluationOperationsHostOf(): initialEvaluationOperations.InitialEvaluationOperationsHost {
    const store = this;
    return {
      analysisCall: this.#analysisCall.bind(this),
      assertAvailable: this.#assertAvailable.bind(this),
      get authority() { return store.#authority; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get boundedAuthority() { return store.#boundedAuthority; },
      get control() { return store.#control; },
      evaluationBookTitle: this.#evaluationBookTitle.bind(this),
      evaluationCall: this.#evaluationCall.bind(this),
      get evaluationProfiles() { return store.#evaluationProfiles; },
      get evaluations() { return store.#evaluations; },
      get initialEvaluation() { return store.#initialEvaluation; },
      get initialEvaluationLedgers() { return store.#initialEvaluationLedgers; },
      get initialEvaluationWork() { return store.#initialEvaluationWork; },
      ledgerTaskOf: this.#ledgerTaskOf.bind(this),
      prepareTaskMaterials: this.#prepareTaskMaterials.bind(this),
      requireLedgerKindScope: this.#requireLedgerKindScope.bind(this),
      taskMaterialOffers: this.#taskMaterialOffers.bind(this),
      taskMaterialReadings: this.#taskMaterialReadings.bind(this),
      transaction: this.#transaction.bind(this),
      get initialEvaluationLedgerForBook() { return store.initialEvaluationLedgerForBook.bind(store); },
      get inspectEvaluationProfiles() { return store.inspectEvaluationProfiles.bind(store); },
      get inspectInitialEvaluation() { return store.inspectInitialEvaluation.bind(store); },
    };
  }

  readonly #factualVerificationOperationsHost: factualVerificationOperations.FactualVerificationOperationsHost = this.#factualVerificationOperationsHostOf();

  #factualVerificationOperationsHostOf(): factualVerificationOperations.FactualVerificationOperationsHost {
    const store = this;
    return {
      analysisCall: this.#analysisCall.bind(this),
      get authority() { return store.#authority; },
      get backgroundEnrollmentHost() { return store.#backgroundEnrollmentHost; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get editorialMarks() { return store.#editorialMarks; },
      get enrollments() { return store.#enrollments; },
      evidenceCall: this.#evidenceCall.bind(this),
      evidenceSaveRefusal: this.#evidenceSaveRefusal.bind(this),
      get factualReview() { return store.#factualReview; },
      get factualVerification() { return store.#factualVerification; },
      libraryCall: this.#libraryCall.bind(this),
      markCall: this.#markCall.bind(this),
      get researchEvidence() { return store.#researchEvidence; },
      reviewCall: this.#reviewCall.bind(this),
      get reviewRuns() { return store.#reviewRuns; },
      transaction: this.#transaction.bind(this),
      get factualRecheckCurrent() { return store.factualRecheckCurrent.bind(store); },
      get getConfiguredModelRoleBinding() { return store.getConfiguredModelRoleBinding.bind(store); },
      get getSearchBackendConnections() { return store.getSearchBackendConnections.bind(store); },
      get replacementFrozen() { return store.replacementFrozen.bind(store); },
      get retrievalSourcesForRun() { return store.retrievalSourcesForRun.bind(store); },
    };
  }

  readonly #writingTaskOperationsHost: writingTaskOperations.WritingTaskOperationsHost = this.#writingTaskOperationsHostOf();

  #writingTaskOperationsHostOf(): writingTaskOperations.WritingTaskOperationsHost {
    const store = this;
    return {
      analysisCall: this.#analysisCall.bind(this),
      assertAvailable: this.#assertAvailable.bind(this),
      get authority() { return store.#authority; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get bookPeople() { return store.#bookPeople; },
      get boundedAuthority() { return store.#boundedAuthority; },
      boundedCall: this.#boundedCall.bind(this),
      get control() { return store.#control; },
      documentCall: this.#documentCall.bind(this),
      get documentWorkflow() { return store.#documentWorkflow; },
      evaluationCall: this.#evaluationCall.bind(this),
      get evaluations() { return store.#evaluations; },
      importedCall: this.#importedCall.bind(this),
      indexedMaterialOffers: this.#indexedMaterialOffers.bind(this),
      ledgerTaskOf: this.#ledgerTaskOf.bind(this),
      libraryCall: this.#libraryCall.bind(this),
      get libraryMaterials() { return store.#libraryMaterials; },
      get materialIndex() { return store.#materialIndex; },
      materialIndexCall: this.#materialIndexCall.bind(this),
      peopleCall: this.#peopleCall.bind(this),
      get productionDocuments() { return store.#productionDocuments; },
      requireLedgerKindScope: this.#requireLedgerKindScope.bind(this),
      ruleCall: this.#ruleCall.bind(this),
      ruleOffer: this.#ruleOffer.bind(this),
      ruleProjection: this.#ruleProjection.bind(this),
      ruleStartedBy: this.#ruleStartedBy.bind(this),
      get rules() { return store.#rules; },
      get series() { return store.#series; },
      seriesCall: this.#seriesCall.bind(this),
      transaction: this.#transaction.bind(this),
      get writingExemplarCache() { return store.#writingExemplarCache; },
      get writingLedgers() { return store.#writingLedgers; },
      get writingRevisionDrafts() { return store.#writingRevisionDrafts; },
      get writingTasks() { return store.#writingTasks; },
      get writingWork() { return store.#writingWork; },
      get inspectExemplars() { return store.inspectExemplars.bind(store); },
      get inspectTaskPlanWithConnection() { return store.inspectTaskPlanWithConnection.bind(store); },
      get inspectWritingTask() { return store.inspectWritingTask.bind(store); },
      get pinMaterialReference() { return store.pinMaterialReference.bind(store); },
      get readMaterialIndexForTask() { return store.readMaterialIndexForTask.bind(store); },
    };
  }

  readonly #globalAgentOperationsHost: globalAgentOperations.GlobalAgentOperationsHost = this.#globalAgentOperationsHostOf();

  #globalAgentOperationsHostOf(): globalAgentOperations.GlobalAgentOperationsHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get codeRoot() { return store.#codeRoot; },
      dialogueCall: this.#dialogueCall.bind(this),
      get dialogueHistory() { return store.#dialogueHistory; },
      get dialogues() { return store.#dialogues; },
      learningCall: this.#learningCall.bind(this),
      memoryFacade: this.#memoryFacade.bind(this),
      get localFixtureCatalog() { return store.#localFixtureCatalog; },
      set localFixtureCatalog(value) { store.#localFixtureCatalog = value; },
      transaction: this.#transaction.bind(this),
      get getConfiguredModelRoleBinding() { return store.getConfiguredModelRoleBinding.bind(store); },
      get getManuscriptWindow() { return store.getManuscriptWindow.bind(store); },
      get getModelServiceConnections() { return store.getModelServiceConnections.bind(store); },
      get globalAgentAttempt() { return store.globalAgentAttempt.bind(store); },
      get globalAgentModelConnection() { return store.globalAgentModelConnection.bind(store); },
      get globalAgentProcedureDocument() { return store.globalAgentProcedureDocument.bind(store); },
      get globalAgentRedact() { return store.globalAgentRedact.bind(store); },
      get globalAgentScopeCurrent() { return store.globalAgentScopeCurrent.bind(store); },
      get globalAgentSourcesCurrent() { return store.globalAgentSourcesCurrent.bind(store); },
      get inspectGlobalAgent() { return store.inspectGlobalAgent.bind(store); },
      get prepareGlobalAgentTurn() { return store.prepareGlobalAgentTurn.bind(store); },
    };
  }

  readonly #materialIndexOperationsHost: materialIndexOperations.MaterialIndexOperationsHost = this.#materialIndexOperationsHostOf();

  #materialIndexOperationsHostOf(): materialIndexOperations.MaterialIndexOperationsHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      get dataRoot() { return store.#dataRoot; },
      get embedding() { return store.#embedding; },
      enrollmentCall: this.#enrollmentCall.bind(this),
      get enrollments() { return store.#enrollments; },
      get idleVectorItems() { return store.#idleVectorItems; },
      get indexController() { return store.#indexController; },
      set indexController(value) { store.#indexController = value; },
      get indexEnabled() { return store.#indexEnabled; },
      set indexEnabled(value) { store.#indexEnabled = value; },
      get indexQueue() { return store.#indexQueue; },
      get indexRun() { return store.#indexRun; },
      set indexRun(value) { store.#indexRun = value; },
      get indexStopped() { return store.#indexStopped; },
      set indexStopped(value) { store.#indexStopped = value; },
      get indexing() { return store.#indexing; },
      set indexing(value) { store.#indexing = value; },
      libraryCall: this.#libraryCall.bind(this),
      get libraryMaterials() { return store.#libraryMaterials; },
      get materialIndex() { return store.#materialIndex; },
      get poisoned() { return store.#poisoned; },
      transaction: this.#transaction.bind(this),
      get translating() { return store.#translating; },
      set translating(value) { store.#translating = value; },
      get translationFailures() { return store.#translationFailures; },
      get translationRun() { return store.#translationRun; },
      set translationRun(value) { store.#translationRun = value; },
      get translator() { return store.#translator; },
      set translator(value) { store.#translator = value; },
      get vectorBuilding() { return store.#vectorBuilding; },
      set vectorBuilding(value) { store.#vectorBuilding = value; },
      get vectorLaneIdle() { return store.#vectorLaneIdle; },
      set vectorLaneIdle(value) { store.#vectorLaneIdle = value; },
      get vectorQueue() { return store.#vectorQueue; },
      get vectorRun() { return store.#vectorRun; },
      set vectorRun(value) { store.#vectorRun = value; },
      get inspectLibraryMaterial() { return store.inspectLibraryMaterial.bind(store); },
      get replacementFrozen() { return store.replacementFrozen.bind(store); },
      get startMaterialIndexing() { return store.startMaterialIndexing.bind(store); },
    };
  }

  readonly #modelSearchSettingsHost: modelSearchSettings.ModelSearchSettingsHost = this.#modelSearchSettingsHostOf();

  #modelSearchSettingsHostOf(): modelSearchSettings.ModelSearchSettingsHost {
    const store = this;
    return {
      assertAvailable: this.#assertAvailable.bind(this),
      get authority() { return store.#authority; },
      get dataRoot() { return store.#dataRoot; },
      transaction: this.#transaction.bind(this),
      get getModelServiceConnections() { return store.getModelServiceConnections.bind(store); },
      get getModelServiceModels() { return store.getModelServiceModels.bind(store); },
      get getModelServiceRouteConnection() { return store.getModelServiceRouteConnection.bind(store); },
      get getSearchBackendConnections() { return store.getSearchBackendConnections.bind(store); },
      get modelServiceBinding() { return store.modelServiceBinding.bind(store); },
    };
  }

  readonly #dataRoot: string;
  readonly #objectsRoot: string;
  readonly #authority: DatabaseSync;
  readonly #journal: DatabaseSync;
  readonly #ingest: DatabaseSync;
  readonly #boundedAuthority: BoundedManuscriptStore;
  readonly #bounded: BoundedManuscriptStore;
  readonly #recoveryObjects: RecoveryObjectStore;
  readonly #editorialWorkspaceProfile: EditorialWorkspaceProfileStore;
  readonly #taskAuthorization: TaskAuthorizationStore;
  readonly #baselineAnalysis: BaselineAnalysisStore;
  readonly #factualReview: BaselineAnalysisStore;
  /** AI7 初评 (Issue #429, S81b1): the evaluation kind's own ledger over the same Book database. */
  readonly #initialEvaluation: BaselineAnalysisStore;
  readonly #evaluationProfiles: EvaluationProfiles;
  /** 初评 ledgers of a house profile or of a plan's 资料库 references (Issue #427, #428), one per contract; bounded. */
  readonly #initialEvaluationLedgers = new RecentCache<BaselineAnalysisStore>(REVIEW_CATEGORY_CACHE_CAPACITY, (ledger) => ledger.preparing);
  /** Each 初评 preparation's ledger and the profile it snapshots for its Task. */
  readonly #initialEvaluationWork = new Map<string, { ledger: BaselineAnalysisStore; profile: EvaluationProfileProjection }>();
  /** One ledger per review-category kind and frozen category contract, made when first asked for (Issue #417); bounded (#649). */
  readonly #reviewCategoryLedgers = new RecentCache<BaselineAnalysisStore>(REVIEW_CATEGORY_CACHE_CAPACITY, (ledger) => ledger.preparing);
  /** The kind definition of each configured category a Review Run snapshotted, by its contract input; bounded (#649). */
  readonly #reviewCategoryDefinitions = new RecentCache<AnalysisKindDefinition>(REVIEW_CATEGORY_CACHE_CAPACITY);
  /** One ledger per 自定义分析维度 version (Issue #922, slice 7f), kept as the review categories' are. */
  readonly #customAnalysisLedgers = new RecentCache<BaselineAnalysisStore>(REVIEW_CATEGORY_CACHE_CAPACITY, (ledger) => ledger.preparing);
  readonly #customAnalysisDefinitions = new RecentCache<AnalysisKindDefinition>(REVIEW_CATEGORY_CACHE_CAPACITY);
  readonly #customAnalysisDimensions: CustomAnalysisDimensions;
  // 资料库 reference texts of the 审阅 workspace, by pin: at most four items per Run, a few Runs recent.
  readonly #taskMaterialTexts = new RecentCache<ReadonlyArray<string>>(REVIEW_CATEGORY_CACHE_CAPACITY);
  /**
   * 审稿意见 (Issue #429, S81c): one ledger per frozen reader's report contract, made when first asked for; bounded as the
   * category ledgers are (#672), and a preparation in flight is found on the ledger that holds it.
   */
  readonly #readersReportLedgers = new RecentCache<BaselineAnalysisStore>(REVIEW_CATEGORY_CACHE_CAPACITY, (ledger) => ledger.preparing);
  /**
   * 写作任务 (Issue #432, S84a): one ledger per frozen writing contract, made when first asked for and bounded as the others are;
   * a preparation in flight is held by its work identity.
   */
  readonly #writingLedgers = new RecentCache<BaselineAnalysisStore>(REVIEW_CATEGORY_CACHE_CAPACITY, (ledger) => ledger.preparing);
  readonly #writingWork = new Map<string, BaselineAnalysisStore>();
  /** Each writing Result Set Revision's type and whether it holds a draft — facts a revision never changes. Bounded. */
  readonly #writingRevisionDrafts = new Map<string, { typeId: string; drafted: boolean }>();
  /**
   * The house's 范例 each Book's page last read, by type (#688 review): while a writing Task is under way the page is read on
   * every poll and no type can be drafted, so the scan is not repeated then. Bounded by the Books whose page was read.
   */
  readonly #writingExemplarCache = new Map<string, WritingExemplarScan>();
  #writingTasks!: WritingTasks;
  #readersReports!: ReadersReports;
  #importedExemplars!: ImportedExemplars;
  /** 导入 Skill…'s disclosed packages not yet kept (ADR 0090 §2): memory only. */
  readonly #skillAcquisitions = new SkillAcquisitions();
  /** 按我的评分重写评语 (Issue #429, S81b2): one ledger per frozen rewrite contract, made when first asked for; bounded. */
  readonly #evaluationRewriteLedgers = new RecentCache<BaselineAnalysisStore>(REVIEW_CATEGORY_CACHE_CAPACITY, (ledger) => ledger.preparing);
  /** The ledger each rewrite preparation in flight belongs to, by its work. */
  readonly #evaluationRewriteWork = new Map<string, BaselineAnalysisStore>();
  #evaluationRewrites!: EvaluationRewrites;
  readonly #editorialMarks: EditorialMarkStore;
  readonly #manuscriptApply: ManuscriptApplyStore;
  readonly #reviewRuns: ReviewRunStore;
  /** 可复用工序 and 开发建议 (Issue #65, S30; ADR 0087): the house's Captured Procedures and Developer Capability Proposals. */
  readonly #capturedProcedures: CapturedProcedures;
  readonly #publicationVersions: PublicationVersionStore;
  readonly #maintenanceCases: MaintenanceCases;
  readonly #bookPeople: BookPeople;
  readonly #reviewGuidelines: ReviewGuidelineLedger;
  /** 知识库 › 资料库 (Issue #427, S79c): the items an editor collected and the decisions about them. */
  readonly #libraryMaterials: LibraryMaterialLedger;
  /** 资料索引 (Issue #428, S80a; KB-009): each 资料库 item's Material Index, built here in the background, one at a time. */
  readonly #materialIndex: MaterialIndexLedger;
  /** 来源与证据 (Issue #425, S70; SRC-013): the external sources research Runs retained, and the units' research outcomes. */
  readonly #researchEvidence: ResearchEvidenceLedger;
  readonly #factualVerification: FactualVerificationLedger;
  /** The items waiting for their index, in arrival order, and the one being built now. */
  readonly #indexQueue: string[] = [];
  #indexing: string | null = null;
  #indexController: AbortController | null = null;
  #indexRun: Promise<void> | null = null;
  #indexStopped = false;
  /** Set once the service serves (`startMaterialIndexing`): a store opened for any other purpose builds no index by itself. */
  #indexEnabled = false;
  /**
   * 相似段落检索 (Issue #892): what makes the similarity vectors on this machine — the deterministic built-in provider until a
   * model adapter is admitted — and the items whose vectors the editor asked for, in order, and the one being built now.
   */
  readonly #embedding: EmbeddingProvider = new StubEmbeddingProvider();
  readonly #vectorQueue: string[] = [];
  #vectorBuilding: string | null = null;
  #vectorRun: Promise<void> | null = null;
  /** 来源译文 (Issue #892): who makes it, if this launch can; the item being translated now; why an item's last request stopped. */
  #translator: MaterialTranslator | null = null;
  #translating: string | null = null;
  #translationRun: Promise<void> | null = null;
  readonly #translationFailures = new Map<string, string>();
  readonly #learningEligibility: LearningEligibilityLedger;
  /** One bounded Word source context; actual original-file availability/hash is checked on every detail read. */
  #wordSampleDetailContext: WordSampleDetailContext | null = null;
  #wordSampleDetailReads: { context: WordSampleDetailContext; reads: LearningReads } | null = null;
  #wordLearningRead: { generation: string; reads: LearningReads } | null = null;
  #wordLearningProofs: { context: WordSampleDetailContext; facts: WordLearningProofs } | null = null;
  #learningCallDepth = 0;
  readonly #evaluationCalibration: EvaluationCalibrationLedger;
  readonly #series: SeriesLedger;
  readonly #usage: UsageLedger;
  readonly #seriesKnowledge: SeriesKnowledgeLedger;
  /** 书系检索排除 (Issue #64, S29b): each Series' Retrieval Exclusions and their revisions. */
  readonly #seriesExclusions: SeriesExclusionLedger;
  readonly #dataVersions: DataVersionLedger;
  /** 导出数据库 (Issue #434, S86a): the package's preparations, approvals and receipts. */
  readonly #databaseExports: DatabaseExports;
  /** 定期自动备份 (Issue #434, S86b): the switch, the backups made and those removed. */
  readonly #scheduledBackups: ScheduledBackups;
  /** 导入数据库 (Issue #434, S86c): the package previewed, the replacement waiting and those recorded. */
  readonly #databaseReplacements: DatabaseReplacements;
  /** The software this store was opened by (Issue #433, S85a): read once from the package it ships in. */
  #softwareVersion = '';
  /** The Data Version this software holds the store at: the classification's, read at open (Issue #433, S85b). */
  #dataVersion: number = DATA_VERSION;
  /** The code this store was opened with: what opens a package's data as a store of its own (Issue #434, S86d). */
  #codeRoot = '';
  #localFixtureCatalog: LocalFixturePolicyCatalog | null = null;
  /** ②C 评估 (Issue #429, S81a): each Book's versioned Evaluation Records. */
  readonly #evaluations: EvaluationRecords;
  /** ②A 分析反馈 (Issue #94, S38): the editor's judgments of analysis results. */
  readonly #analysisFeedback: AnalysisFeedbackLedger;
  // 人工结果确认 (Issue #757): the editor's 保留为缺口 over requests whose results cannot be known.
  readonly #outcomeResolutions: OutcomeResolutionLedger;
  /** 就这段提问… (Issue #52, S17a): the dialogue Tasks, and the reader that joins them to the Harness Session Ledger. */
  readonly #dialogues: DialogueLedger;
  /** The editor's Task Intent Drafts (Issue #423, wave 10 slice 7a). */
  readonly #drafts: TaskIntentDraftLedger;
  readonly #dialogueHistory: DialogueHistoryReader;
  readonly #productionDocuments: ProductionDocuments;
  /** Each Production Document's Deliverable Workflow (Issue #415, S66c). */
  readonly #documentWorkflow: ProductionDocumentWorkflow;
  readonly #bookDeliveryPackages: BookDeliveryPackages;
  readonly #packageExports: BookDeliveryPackageExports;
  readonly #manuscriptExport: ManuscriptExportStore;
  readonly #proposalConflicts: ProposalConflictStore;
  /** 默认执行规则 (Issue #421): the rules 快速开始 starts a Task under. */
  readonly #rules: DefaultExecutionRuleLedger;
  readonly #enrollments: BackgroundAnalysisEnrollmentLedger;
  /** The 后台分析登记 dispatcher's latest look at each Book, and why a pass it began did not start (Issue #95, S39): this lifetime's. */
  readonly #backgroundLooks = new Map<string, { at: string; kind: 'start' | 'none' | 'wait' | 'stopped'; reason: string }>();
  readonly #backgroundNotStarted = new Map<string, { at: string; reason: string }>();
  readonly #workflowProfile: BuiltInWorkflowProfile;
  readonly #lifetimeId: string;
  readonly #control: StoreControl;
  #contentObjectLifecycleTail: Promise<void> = Promise.resolve();
  #recoveryObjectLifecycleTail: Promise<void> = Promise.resolve();
  readonly #checkpoint: WalCheckpointPolicy;
  #checkpointWorker: WalCheckpointMaintenance | undefined;
  #cleanShutdownMarked = false;
  #poisoned = false;
  readonly #reimportPreparationWork = new Map<string, ReimportPreparationWork>();
  readonly #reimportResolutionWork = new Map<string, ReimportResolutionWork>();
  readonly #reimportCommitWork = new Map<string, ReimportCommitWork | ReimportReplayWork>();
  readonly #verifiedCommitObjects = new Set<string>();

  private constructor(
    dataRoot: string,
    objectsRoot: string,
    authority: DatabaseSync,
    journal: DatabaseSync,
    ingest: DatabaseSync,
    boundedAuthority: BoundedManuscriptStore,
    bounded: BoundedManuscriptStore,
    recoveryObjects: RecoveryObjectStore,
    editorialWorkspaceProfile: EditorialWorkspaceProfileStore,
    taskAuthorization: TaskAuthorizationStore,
    baselineAnalysis: BaselineAnalysisStore,
    factualReview: BaselineAnalysisStore,
    initialEvaluation: BaselineAnalysisStore,
    workflowProfile: BuiltInWorkflowProfile,
    lifetimeId: string,
    control: StoreControl,
  ) {
    this.#dataRoot = dataRoot;
    this.#objectsRoot = objectsRoot;
    this.#authority = authority;
    this.#checkpoint = new WalCheckpointPolicy(authority, join(dataRoot, 'store', 'ai7.sqlite'));
    this.#journal = journal;
    this.#ingest = ingest;
    this.#boundedAuthority = boundedAuthority;
    this.#bounded = bounded;
    this.#recoveryObjects = recoveryObjects;
    this.#editorialWorkspaceProfile = editorialWorkspaceProfile;
    this.#taskAuthorization = taskAuthorization;
    this.#baselineAnalysis = baselineAnalysis;
    this.#factualReview = factualReview;
    this.#initialEvaluation = initialEvaluation;
    this.#evaluationProfiles = new EvaluationProfiles(authority);
    this.#editorialMarks = new EditorialMarkStore(authority);
    this.#rules = new DefaultExecutionRuleLedger(authority);
    this.#enrollments = new BackgroundAnalysisEnrollmentLedger(authority);
    this.#manuscriptApply = new ManuscriptApplyStore(authority, boundedAuthority, this.#editorialMarks, lifetimeId);
    // 知识库 › 审阅规范文件 (Issue #427, S79a): a Review Run prepared now applies each guideline document at its latest version.
    this.#reviewGuidelines = new ReviewGuidelineLedger(authority);
    this.#materialIndex = new MaterialIndexLedger(authority);
    this.#researchEvidence = new ResearchEvidenceLedger(authority);
    this.#factualVerification = new FactualVerificationLedger(authority);
    this.#factualReview.bindFactualVerification(this.#factualVerification);
    this.#factualReview.reconcileFactualRechecks();
    this.#libraryMaterials = new LibraryMaterialLedger(authority, dataRoot, (material) =>
      this.#materialIndex.projection({ materialId: material.materialId, sha256: material.sha256, format: material.source.format },
        this.#indexing === material.materialId ? 'indexing' : 'queued', this.#layerActivity(material.materialId, material.source.sha256)));
    this.#learningEligibility = new LearningEligibilityLedger(authority);
    this.#evaluationCalibration = new EvaluationCalibrationLedger(authority);
    this.#series = new SeriesLedger(authority);
    this.#usage = new UsageLedger(authority, { sessionLogRoot: join(dataRoot, HARNESS_SESSION_LOG_DIRECTORY),
      operationalScope: () => this.#baselineAnalysis.launch.operationalScope });
    this.#seriesKnowledge = new SeriesKnowledgeLedger(authority);
    this.#seriesExclusions = new SeriesExclusionLedger(authority);
    this.#dialogues = new DialogueLedger(authority);
    this.#drafts = new TaskIntentDraftLedger(authority);
    this.#dialogueHistory = harnessHistoryReader(join(dataRoot, HARNESS_SESSION_LOG_DIRECTORY));
    this.#dataVersions = new DataVersionLedger(authority);
    this.#databaseExports = new DatabaseExports(authority, dataRoot, {
      facts: () => ({ dataVersion: this.#dataVersion, softwareVersion: this.#softwareVersion, schemaRevision: LATEST_SCHEMA_VERSION }),
    });
    this.#scheduledBackups = new ScheduledBackups(authority, dataRoot, {
      facts: () => ({ dataVersion: this.#dataVersion, softwareVersion: this.#softwareVersion, schemaRevision: LATEST_SCHEMA_VERSION }),
    });
    this.#databaseReplacements = new DatabaseReplacements(authority, dataRoot, {
      facts: () => ({ dataVersion: this.#dataVersion, softwareVersion: this.#softwareVersion, schemaRevision: LATEST_SCHEMA_VERSION }),
      // A package's data opens as a store of its own, with no launch control: brought to this revision and checked whole.
      openPackage: async (root) => {
        const opened = await EditorialStore.open(root, this.#codeRoot, {
          induceUnprovableReconciliation: false,
          persistLegacyReviewedDraft: false,
          induceReimportProofTamper: false,
          induceAbandonObjectRemovalFailure: false,
          interruptAfterAbandonObjectRemoval: false,
          baselineAnalysisRoute: null,
          softwareVersion: this.#softwareVersion,
        });
        opened.close();
      },
    });
    this.#readersReports = new ReadersReports(authority);
    this.#importedExemplars = new ImportedExemplars(authority, dataRoot);
    this.#evaluationRewrites = new EvaluationRewrites(authority);
    // A writing Task's 资料库 items are read through the Material Index's Task seam alone, at the builds its plan pinned (Issue #428).
    this.#writingTasks = new WritingTasks(authority, (bookId, source) => this.#readWritingMaterial(bookId, source));
    this.#evaluations = new EvaluationRecords(authority, { current: (bookId) => initialEvaluationOperations.evaluationManuscript(this.#initialEvaluationOperationsHost, bookId) }, {
      latest: (bookId) => this.#initialEvaluationFacts(bookId),
      task: (bookId) => this.#initialEvaluationTask(bookId),
      producedUnverified: (revisionId) => producedUnverified((this.#authority.prepare(
        "SELECT json_extract(canonical_json, '$.policyPin.operationalScope') AS scope FROM analysis_result_set_revisions WHERE revision_id = ?").get(revisionId) as SqlRow | undefined)?.scope),
    }, {
      workspace: (bookId, basis, unreadable) => readersReportOperations.readersReportWorkspace(this.#readersReportHost, bookId, basis, unreadable),
    }, {
      // The market section's house data and 按我的评分重写评语 of the version on show (Issue #429, S81b2).
      market: (bookId) => this.#evaluationMarket(bookId),
      rewrite: (bookId, version) => evaluationRewriteOperations.evaluationRewriteWorkspace(this.#evaluationRewriteHost, bookId, version),
    }, {
      // A mark a version's entry records is tied to the 采用 that appended it (Issue #696). A damaged decision row never makes
      // 评估 unreadable (Issue #702 review): the record keeps the marks it holds and says their source cannot be checked, and
      // 按我的评分重写评语 says it is unavailable, as before.
      adoptionsOf: (recordId) => {
        try {
          return this.#evaluationRewrites.adoptionsOf(recordId);
        } catch (error) {
          if (error instanceof EvaluationRewriteError) return null;
          throw error;
        }
      },
      // After a version that cannot be read, a mark is admitted only when it names a rewrite this Book accepted on an earlier
      // version, over words that rewrite wrote (Issue #708). A decision or words that cannot be read leave the mark unchecked.
      acceptedRewrite: (analysisRevisionId) => evaluationRewriteOperations.acceptedEvaluationRewrite(this.#evaluationRewriteHost, analysisRevisionId),
      adoptionStamps: (bookId) => this.#evaluationRewrites.decisionStamps(bookId),
    }, {
      // The house's calibration switch (EVAL-011a): a version begun from AI7's 初评 applies the offset only while it is on. A
      // preferences chain that cannot be read refuses that start with the ledger's own words (`#evaluationCall`).
      calibrationEnabled: () => this.#evaluationCalibration.preferences().calibrationEnabled,
    }, control.calibrationMinAdjustments ?? CALIBRATION_MIN_ADJUSTMENTS, () => this.#evaluationProfiles.current());
    this.#analysisFeedback = new AnalysisFeedbackLedger(authority);
    this.#outcomeResolutions = new OutcomeResolutionLedger(authority);
    this.#capturedProcedures = new CapturedProcedures(authority);
    this.#customAnalysisDimensions = new CustomAnalysisDimensions(authority);
    this.#reviewRuns = new ReviewRunStore(authority, this.#editorialMarks, {
      executionFor: binding => this.#baselineAnalysis.withExecutionChoice(binding,
        resolveSourceCheckoutLaunchPolicySync(this.#codeRoot, 'ordinary-production', binding)).launch,
      memoryFacade: () => this.#memoryFacade(),
      ledgerOf: (entry, materials, digest, bookId, preference, version) => reviewOperations.reviewLedgerOf(this.#reviewOperationsHost, entry, materials, digest, bookId, preference, version),
      housePreference: (bookId, categoryId, kind, policy) => {
        const use = this.#memoryFacade().reviewPreference(this.#baselineAnalysis.launch.operationalScope, bookId, categoryId);
        if (use === null) return null;
        // The kind's one foreground rule must name the category; the live admission asks the same again before any dispatch.
        const rules = policy.providerProcessing.admittedRules.filter((rule) => rule.backgroundOrigin !== true && rule.taskKinds.includes(kind));
        return rules.length === 1 && rules[0]!.outboundDataCategories.includes(HOUSE_REVIEW_PREFERENCE_CATEGORY) ? use : 'closed';
      },
      materialReadings: (boundary) => this.#taskMaterialReadings(boundary),
      materialOffers: (bookId) => this.#taskMaterialOffers(bookId),
      connectionOf: (reference) => this.getModelServiceConnections().find((connection) => connection.credentialReference === reference)?.connectionId ?? null,
      baseline: () => this.#baselineAnalysis,
    }, () => this.#control.baselineAnalysisRoute?.reviewContractVersion === 1
      ? HISTORICAL_REVIEW_CATEGORY_CONFIGURATION : this.#reviewGuidelines.configuration());
    this.#manuscriptExport = new ManuscriptExportStore(authority, {
      readObject: (objectDigest) => this.#readContentObject(objectDigest),
      dataRoot,
      checkpointOwner: boundedAuthority,
      // A package export's 交付包清单 (Issue #416, S67b), written by the package's export from the version's own record.
      packageManifest: (bookId, packageVersionId, member) => this.#packageExports.manifest(bookId, packageVersionId, member),
      packageVersion: (bookId, packageVersionId) => this.#packageExports.version(bookId, packageVersionId),
      // 导出审阅报告（DOCX） (Issue #1446): a changed report is held until the save destination is chosen, then recorded.
      pendingReport: (reportId) => this.#reviewRuns.pendingReport(reportId),
      recordPendingReport: (reportId) => {
        try {
          this.#reviewRuns.recordPendingReport(reportId);
        } catch (error) {
          if (error instanceof ReviewRunError) throw new ExportLedgerError('EXPORT_REVIEW_CHANGED', error.message);
          throw error;
        }
      },
    });
    // 交付物 lists a Book's approved exports beside its 发稿 (Issue #413), read from the export ledger. Its Production
    // Documents (Issue #415) are a read of their own, each Delivery Record with what its export came to.
    this.#documentWorkflow = new ProductionDocumentWorkflow(authority, workflowProfilePin(workflowProfile));
    this.#productionDocuments = new ProductionDocuments(authority, (bookId, revisionId, from, until) =>
      this.#manuscriptExport.latestExport(bookId, 'production-document-version', revisionId, from, until), this.#documentWorkflow);
    // Each designation carries its 维护事项 (Issue #426, S68a), and a 撤回 one is no longer used for 发稿.
    this.#maintenanceCases = new MaintenanceCases(authority);
    // Each Book's 作者, 责编 and 相关人 (Issue #431, S83).
    this.#bookPeople = new BookPeople(authority);
    this.#publicationVersions = new PublicationVersionStore(authority, (bookId) => this.#manuscriptExport.records(bookId), {
      summaries: (bookId, publicationVersionId) => this.#maintenanceCases.summaries(bookId, publicationVersionId),
      withdrawn: (publicationVersionId) => this.#maintenanceCases.withdrawn(publicationVersionId),
      withdrawnAt: (publicationVersionId) => this.#maintenanceCases.withdrawnAt(publicationVersionId),
    });
    // 图书交付包 (Issue #416) reads the Book's current 发稿版本, each house type's Delivery Records and its Review Runs.
    this.#bookDeliveryPackages = new BookDeliveryPackages(authority, {
      publication: (bookId) => {
        const current = this.#publicationVersions.current(bookId);
        if (current === null) return null;
        const { projection } = current;
        return {
          publicationVersionId: projection.publicationVersionId,
          ordinal: projection.ordinal,
          milestoneId: projection.milestoneId,
          milestoneLabel: projection.milestoneLabel,
          revisionId: projection.revisionId,
          revisionLabel: projection.revisionLabel,
          revisionDigest: projection.technical.revisionDigest,
          scope: projection.scope,
          basis: projection.basis,
          changedSince: current.changedSince,
          withdrawn: current.withdrawn,
        };
      },
      documents: (bookId) => this.#productionDocuments.packageReadings(bookId),
      reviewRuns: (bookId) => this.#reviewRuns.packageReadings(bookId),
      exportHistory: (bookId, packageVersionId) => this.#packageExports.history(bookId, packageVersionId),
      // The Book's latest 定稿 评估记录 and its 审稿意见 at the version 设为发稿版本时的最新一版 (Issue #429; BUNDLE-001). Versions that
      // cannot be read leave the package without an 评估记录 and say so, rather than fail the whole read.
      evaluation: (bookId) => {
        try {
          const finalized = this.#evaluations.latestFinalized(bookId);
          return finalized === null ? null : {
            kind: 'finalized', recordId: finalized.recordId, ordinal: finalized.ordinal, entrySha256: finalized.entrySha256,
            finalizedAt: finalized.finalizedAt, profileTitle: finalized.profile.title, profileVersion: finalized.profile.version,
          };
        } catch (error) {
          if (error instanceof EvaluationError) return { kind: 'unreadable', reason: error.message };
          throw error;
        }
      },
      readersReports: (bookId, designatedAt) => this.#readersReportPins(bookId, designatedAt),
    });
    // Its export (Issue #416, S67b) writes each file through the export ledger and links them to the exact version; the 评估记录
    // member (Issue #429) is written from the 定稿 version the package pinned.
    this.#packageExports = new BookDeliveryPackageExports(authority, this.#manuscriptExport, {
      record: (bookId, packageVersionId) => this.#bookDeliveryPackages.record(bookId, packageVersionId),
      finalizedEvaluation: (bookId, recordId) => this.#evaluationCall(() => this.#evaluations.finalizedOf(bookId, recordId)),
    });
    this.#proposalConflicts = new ProposalConflictStore(authority, this.#editorialMarks);
    this.#workflowProfile = workflowProfile;
    this.#lifetimeId = lifetimeId;
    this.#control = control;
  }

  static async open(
    dataRootInput: string,
    codeRoot: string,
    control: StoreControl = {
      induceUnprovableReconciliation: false,
      persistLegacyReviewedDraft: false,
      induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false,
      interruptAfterAbandonObjectRemoval: false,
      baselineAnalysisRoute: null,
    },
  ): Promise<EditorialStore> {
    requireStore(isAbsolute(dataRootInput), 'DATA_ROOT_INVALID', 'Agent Data Root 必须是绝对路径。');
    const route = control.baselineAnalysisRoute;
    requireStore((control.baselinePromptContract ?? 'current') === 'current' || (control.baselinePromptContract === 'retained-v1' &&
      route !== null && route.fixtureIdentity === RETAINED_V1_RECORDED_FIXTURE_IDENTITY && route.fixtureLineage.length === 1 &&
      route.fixtureLineage[0]!.identity === RETAINED_V1_RECORDED_FIXTURE_IDENTITY) || (control.baselinePromptContract === 'retained-v2' &&
      route !== null && route.fixtureIdentity === RETAINED_V2_RECORDED_FIXTURE_IDENTITY && route.fixtureLineage.length === 1 &&
      route.fixtureLineage[0]!.identity === RETAINED_V2_RECORDED_FIXTURE_IDENTITY),
    'ANALYSIS_PROMPT_CONTRACT_REFUSED', '历史基线提示契约只随已准入的历史录制夹具重放。');
    const workflowProfile = await loadBuiltInManuscriptProfile(codeRoot);
    // The software version the store records beside its Data Version (Issue #433, S85a).
    const softwareVersion = control.softwareVersion ?? await readSoftwareVersion(codeRoot).catch((error: unknown) => {
      if (error instanceof DataVersionError) throw new StoreError(error.code, error.message);
      throw error;
    });
    const dataRoot = await createCanonicalExternalDataRoot(dataRootInput, codeRoot);
    // Refuse before pending replacement recovery can remove staging, move data or merge into SQLite (#967 review).
    await EditorialStore.#checkDataVersionMarker(dataRoot, control);
    // 替换本机全部数据 (Issue #434, S86c; ADR 0079 §1.3): a replacement prepared in the last lifetime is applied before anything
    // opens the data, and what came of it is recorded in the data that opens — the replacement's, or the data it spared.
    const { store, replacement } = await openWithPendingReplacement(
      dataRoot,
      () => EditorialStore.#openAt(dataRoot, codeRoot, control, workflowProfile, softwareVersion),
    ).catch((error: unknown) => {
      if (error instanceof DatabaseReplacementError) throw new StoreError(error.code, error.message);
      throw error;
    });
    if (replacement !== null) {
      try {
        store.#databaseReplacements.record(replacement, new Date());
        // Data replaced or rolled back never brings an Enrollment back into force by itself (#713 review, P3-1).
        if (replacement.outcome === 'applied' && replacement.intent.kind !== 'merge') store.#suspendRestoredEnrollments();
      } catch (error) {
        store.close();
        if (error instanceof DatabaseReplacementError) throw new StoreError(error.code, error.message);
        throw error;
      }
    }
    await completeReplacement(dataRoot);
    return store;
  }

  /** Read-only preflight before recovery or SQLite can touch this data. */
  static async #checkDataVersionMarker(dataRoot: string, control: StoreControl): Promise<void> {
    try {
      const marker = await readDataVersionMarker(dataRoot);
      if (marker !== null) refuseNewerDataVersion(marker, {
        dataVersion: dataVersionAt(LATEST_SCHEMA_VERSION, SCHEMA_REVISION_CLASSES),
        schemaRevision: LATEST_SCHEMA_VERSION,
      });
      // Data an earlier AI7 wrote is refused as it lies, read from its marker and its files without opening SQLite (#1634).
      EditorialStore.#refuseOlder(marker, storeRevisionOnDisk(join(dataRoot, 'store', 'ai7.sqlite')));
    } catch (error) {
      if (error instanceof DataVersionError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  /** Data of an earlier Data Version, by its marker or by the revision its files hold, is refused as it lies (#1634). */
  static #refuseOlder(marker: DataVersionMarker | null, revisionOnDisk: number | null): void {
    try {
      refuseOlderDataVersion(marker, revisionOnDisk, { dataVersion: dataVersionAt(LATEST_SCHEMA_VERSION, SCHEMA_REVISION_CLASSES) });
    } catch (error) {
      if (error instanceof DataVersionError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  /** Check the data again after a pending replacement, then open its store. */
  static async #openAt(
    dataRoot: string,
    codeRoot: string,
    control: StoreControl,
    workflowProfile: BuiltInWorkflowProfile,
    softwareVersion: string,
  ): Promise<EditorialStore> {
    // 数据版本标记 (Issue #967; ADR 0023): data a newer AI7 wrote is refused before anything here touches it — nothing is created,
    // migrated or backed up. A store without a marker yet opens, and this open writes it.
    const classes = SCHEMA_REVISION_CLASSES;
    await EditorialStore.#checkDataVersionMarker(dataRoot, control);
    const objectsRoot = await ensureCanonicalDataDirectory(dataRoot, 'objects');
    const recoveryObjects = await RecoveryObjectStore.open(dataRoot);
    const storeRoot = await ensureCanonicalDataDirectory(dataRoot, 'store');
    const { path: databasePath } = await inspectCanonicalDataFile(dataRoot, storeRoot, 'ai7.sqlite');
    for (const sidecar of ['ai7.sqlite-journal', 'ai7.sqlite-shm', 'ai7.sqlite-wal']) {
      await inspectCanonicalDataFile(dataRoot, storeRoot, sidecar);
    }
    const authority = new DatabaseSync(databasePath);
    let journal: DatabaseSync | null = null;
    let ingest: DatabaseSync | null = null;
    try {
      // 存储基线 (#1634; ADR 0105 §4): a store of an earlier Data Version was refused above from its files; one that reaches
      // SQLite anyway is refused before this open writes anything. An empty store is built at the baseline in one transaction,
      // with its seed and its first version record; a store at the baseline is checked against it, object by object.
      const revision = Number(authority.prepare('PRAGMA user_version').get()?.user_version);
      EditorialStore.#refuseOlder(null, revision);
      requireStore(revision === 0 || revision === BASELINE_SCHEMA_REVISION, 'SCHEMA_UNSUPPORTED', '数据库版本不受支持。');
      configureDatabase(authority, 'FILE');
      if (revision === 0) createStoreAtBaseline(authority, softwareVersion, dataVersionAt(LATEST_SCHEMA_VERSION, classes));
      requireBaselineSchema(authority);
      validateRequestAdmissionRecords(authority, true);
      try {
        validateWordImportRetentionVersion(authority, true);
        await validateRetainedWordImports(authority, dataRoot, objectsRoot);
      } catch (error) {
        if (error instanceof ImportRetentionError) throw new StoreError(error.code, error.message);
        throw error;
      }
      if (control.induceReimportProofTamper) {
        requireStore(authority.prepare(REIMPORT_PROOF_TAMPER_SQL).run().changes === 1, 'E2E_CONTROL_INVALID', '没有可用于启动校验的重新导入证明。');
      }
      // The record checks each owner runs over a store it did not just write: the manuscript core once, then every ledger with
      // rules of its own beyond its shape.
      validateBoundedStore(authority, workflowProfile);
      validateConnectionRecords(authority);
      const editorialWorkspaceProfile = await EditorialWorkspaceProfileStore.open(authority, dataRoot, codeRoot);
      validateEditorialWorkspaceProfileSchema(authority);
      validateProcedureDefinitions(authority);
      validateMaterialTranslationAttemptSchema(authority);
      validateLocalStageArtifacts(authority);
      new EditorialLearningLedger(authority).validate();
      new SupervisionDirectives(authority).validate();
      new HouseReviewPreferenceLedger(authority).validate();
      journal = new DatabaseSync(databasePath);
      configureDatabase(journal);
      ingest = new DatabaseSync(databasePath);
      configureDatabase(ingest);
      const lifetimeId = randomUUID();
      const sourceObjects = new ManuscriptSourceObjects(authority, (digest) => {
        const object = authority.prepare('SELECT relative_key FROM content_objects WHERE object_digest = ?').get(digest) as SqlRow;
        return readFileSync(contentObjectPath(objectsRoot, digest, asString(object.relative_key)));
      });
      const boundedAuthority = new BoundedManuscriptStore(authority, sourceObjects);
      const store = new EditorialStore(
        dataRoot,
        objectsRoot,
        authority,
        journal,
        ingest,
        boundedAuthority,
        new BoundedManuscriptStore(journal, sourceObjects),
        recoveryObjects,
        editorialWorkspaceProfile,
        new TaskAuthorizationStore(authority, boundedAuthority),
        new BaselineAnalysisStore(authority, boundedAuthority, control.baselineAnalysisRoute,
          baselineAnalysisKindDefinition(control.baselinePromptContract ?? 'current')),
        new BaselineAnalysisStore(authority, boundedAuthority, control.baselineAnalysisRoute, factualReviewKindDefinition()),
        // AI7 初评 (Issue #429, S81b1): the evaluation kind under the profile a new 评估 version snapshots.
        new BaselineAnalysisStore(authority, boundedAuthority, control.baselineAnalysisRoute,
          initialEvaluationKindDefinition({ ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) })),
        workflowProfile,
        lifetimeId,
        control,
      );
      store.#transaction(authority, () => {
        authority.prepare('DELETE FROM import_ingest_blocks').run();
      });
      await store.#resumeAbandonmentCleanupIntents();
      store.#normalizeMigratedReviewedTargets();
      store.#invalidateUngroupedReimportReviews();
      await store.#sweepUnreferencedContentObjects();
      await recoveryObjects.cleanup((relativeKey) =>
        store.#boundedCall(() => store.#boundedAuthority.isRecoveryObjectReferenced(relativeKey)));
      // What an interrupted 放入资料库 left beside the kept originals (Issue #427 review).
      await store.#libraryMaterials.sweep();
      // What an interrupted or refused 导入范例 left beside the kept earlier-Book originals (Issue #427).
      await store.#importedExemplars.sweep();
      // A converted working copy an index build stopped mid-way left behind (Issue #428, S80a).
      await sweepMaterialIndexWork(dataRoot);
      // A database package staged and never approved, or cut off mid-write, is a whole copy of the data (Issue #434 review).
      await store.#databaseExports.sweep(true);
      store.#boundedCall(() => store.#boundedAuthority.startServiceLifetime(lifetimeId, new Date().toISOString()));
      // Every store records the versions that open it (Issue #433, S85a; DSTO-016): a new record only when one changed.
      store.#softwareVersion = softwareVersion;
      store.#codeRoot = codeRoot;
      const localLaunch = { operationalScope: 'development-ci' as const, live: null,
        policy: resolveSourceCheckoutLaunchPolicySync(codeRoot), localFixtureRuntime: () => store.localFixtureRuntime(),
        editorialMemory: (bookId: string, taskKind: string) => store.editorialMemory(bookId, taskKind),
        retainedPolicyFor: (pin: import('../shared/protocol.js').ResultSetPolicyPin, binding: ConfiguredProviderBinding) => readRetainedBoundAnalysisPolicySync(codeRoot, pin, binding) };
      store.#baselineAnalysis.bindLaunch(localLaunch);
      store.#factualReview.bindLaunch(localLaunch);
      store.#initialEvaluation.bindLaunch(localLaunch);
      store.#dataVersion = dataVersionAt(LATEST_SCHEMA_VERSION, classes);
      // A new record only when the software, the Data Version or the revision changed since the last (Issue #433, S85a).
      store.#dataVersionCall(() => store.#transaction(authority, () => {
        store.#dataVersions.recordOpen({ softwareVersion, dataVersion: store.#dataVersion, schemaRevision: LATEST_SCHEMA_VERSION });
      }));
      // The marker last, once every owner has opened and the versions are recorded (Issue #967): create or replace.
      await writeDataVersionMarker(dataRoot, {
        dataVersion: store.#dataVersion, schemaRevision: LATEST_SCHEMA_VERSION, softwareVersion, writtenAt: new Date().toISOString(),
      }).catch(() => {
        throw new StoreError('DATA_VERSION_MARKER_UNWRITABLE', DATA_VERSION_MARKER_UNWRITABLE);
      });
      return store;
    } catch (error) {
      // A refused open leaves no handle behind, so the caller can remove the Agent Data Root
      // immediately: on Windows an open SQLite handle is what blocks that removal. The refusal
      // itself is rethrown unchanged, in code and message.
      closeDatabaseQuietly(ingest);
      closeDatabaseQuietly(journal);
      closeDatabaseQuietly(authority);
      throw error;
    }
  }

  /** The checkpoint worker runs only pragmas; data transactions stay on the service's existing serial writer lane. */
  startCheckpointWorker(factory?: CheckpointWorkerFactory): Promise<boolean> {
    this.#checkpointWorker ??= new WalCheckpointMaintenance(this.#checkpoint, join(this.#dataRoot, 'store', 'ai7.sqlite'), factory);
    return this.#checkpointWorker.ready;
  }

  async stopCheckpointWorker(clean = false): Promise<void> { await this.#checkpointWorker?.stop(clean); }

  /** Called only after the service response frame has been written. */
  checkpointAfterResponse(idle: boolean): ReturnType<WalCheckpointPolicy['maintain']> {
    return this.#checkpointWorker ? this.#checkpointWorker.maintain(idle) : this.#checkpoint.maintain(idle);
  }

  markCleanShutdown(checkpoint = true): void {
    this.#assertAvailable();
    requireStore(!this.#cleanShutdownMarked, 'LIFETIME_STATE_CHANGED', '本地服务生命周期无法重复结束。');
    this.#boundedCall(() => this.#boundedAuthority.markServiceLifetimeClean(this.#lifetimeId, new Date().toISOString()));
    this.#cleanShutdownMarked = true;
    if (checkpoint) this.#checkpoint.shutdown();
  }

  async inspectEditorialWorkspaceProfile(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    return this.#artifactCall(() => this.#editorialWorkspaceProfile.inspect(bookId));
  }

  async installEditorialWorkspaceProfile(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    return this.#artifactCall(() => this.#editorialWorkspaceProfile.install(bookId));
  }

  async enableEditorialWorkspaceProfile(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    return this.#artifactCall(() => this.#editorialWorkspaceProfile.enable(bookId));
  }

  inspectTaskAuthorization(bookId: string): TaskAuthorizationProjection {
    return this.#taskCall(() => this.#taskAuthorization.inspect(bookId));
  }

  inspectForegroundExecutionBoundary(
    bookId: string,
    runRecordId: string,
    launchPolicy: LaunchPolicyProjection,
  ): ForegroundExecutionBoundaryProjection {
    return this.#taskCall(() =>
      this.#taskAuthorization.inspectForegroundExecutionBoundary(bookId, runRecordId, launchPolicy));
  }

  createTaskAuthorizationPreparationWork(
    bookId: string,
    goal: typeof J03_TASK_GOAL,
    launchPolicy: LaunchPolicyProjection,
  ): TaskPreparationResult {
    return this.#taskCall(() => this.#taskAuthorization.prepare({ phase: 'start', bookId, goal, launchPolicy }));
  }

  advanceTaskAuthorizationPreparationWork(workId: string): TaskPreparationResult {
    return this.#taskCall(() => this.#taskAuthorization.prepare({ phase: 'advance', workId }));
  }

  cancelTaskAuthorizationPreparationWork(workId: string): boolean {
    this.#taskCall(() => this.#taskAuthorization.prepare({ phase: 'cancel', workId }));
    return true;
  }

  authorizeTaskAuthorization(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
  ): TaskAuthorizationProjection {
    return this.#taskCall(() => this.#taskAuthorization.authorize(bookId, taskIntentId, planEnvelopeDigest));
  }

  // ---- J-04 baseline manuscript analysis (Issue #92) ----------------------------------------------

  /** ②A's analysis; each update mode carries its quick start (Issue #421). */
  inspectBaselineAnalysis(bookId: string, progress?: ProgressReader, revisionId: string | null = null): BaselineAnalysisProjection {
    return backgroundEnrollments.withBackgroundReport(this.#backgroundEnrollmentHost, this.#withQuickStart(this.#analysisCall(() => this.#baselineAnalysis.inspect(bookId, progress, revisionId)) as BaselineAnalysisProjection));
  }

  getBaselineAnalysisPage(input: { bookId: string; taskIntentId: string; revisionId: string | null; path: string; afterOrdinal: number }) {
    const projection = this.#analysisCall(() => this.#baselineAnalysis.inspect(input.bookId, undefined, input.revisionId)) as BaselineAnalysisProjection;
    requireStore(projection.taskIntent?.taskIntentId === input.taskIntentId, 'ANALYSIS_PAGE_STALE', '分析记录已改变，请重新打开分析。');
    return this.#analysisCall(() => baselineAnalysisSummaryPage(projection, input.path, input.afterOrdinal));
  }

  getCoverageManifestUnits(input: { bookId: string; taskIntentId: string; afterOrdinal: number }) {
    const manifest = this.#analysisCall(() => this.#baselineAnalysis.coverageManifestFor(input.bookId, input.taskIntentId));
    const page = analysisBytePage(manifest.units, input.afterOrdinal, (unit) => unit.ordinal);
    return { manifestDigest: manifest.digest, units: page.items, next: page.next };
  }

  #analysisRevisionForPage(bookId: string, revisionId: string) {
    const projection = this.#analysisCall(() => this.#baselineAnalysis.inspect(bookId, undefined, revisionId)) as BaselineAnalysisProjection;
    const revision = projection.inspectedRevision?.revision;
    requireStore(revision !== undefined && revision.revisionId === revisionId && revision.manuscriptPin.bookId === bookId,
      'ANALYSIS_REVISION_NOT_FOUND', '没有找到这本书的分析修订版。');
    return revision;
  }

  getAnalysisRevisionUnits(input: { bookId: string; revisionId: string; afterOrdinal: number }) {
    return revisionUnitsPage(this.#analysisRevisionForPage(input.bookId, input.revisionId), input.afterOrdinal);
  }

  getAnalysisRevisionOverview(input: { bookId: string; revisionId: string; afterIndex: number }) {
    return analysisOverviewPage(this.#analysisRevisionForPage(input.bookId, input.revisionId), input.afterIndex);
  }

  /** The latest Task's report, or the report of the Task that produced an earlier revision in 历次分析. */
  getAnalysisRunReportRows(input: { bookId: string; taskIntentId: string; afterOrdinal: number }) {
    const projection = this.inspectBaselineAnalysis(input.bookId);
    const report = projection.taskIntent?.taskIntentId === input.taskIntentId && projection.taskOutcome?.report != null
      ? projection.taskOutcome.report
      : [...projection.history?.entries ?? []].reverse().find((entry) => entry.producingRun.taskIntentId === input.taskIntentId)?.report ?? null;
    requireStore(report !== null, 'ANALYSIS_REPORT_NOT_FOUND', '没有找到这项任务的运行报告。');
    const page = analysisBytePage(report.unitRows, input.afterOrdinal, (row) => row.unitOrdinal);
    return { reportDigest: report.reportDigest, rows: page.items, next: page.next };
  }

  getBaselineAnalysisRangePlan(input: { bookId: string; unitOrdinal: number }) {
    return this.#analysisCall(() => this.#baselineAnalysis.rangePlan(input.bookId, input.unitOrdinal));
  }

  /** Read-only aggregation: the source owners derive dispositions on every read. */
  readonly #bookFindingsHost: BookFindingsHost = this.#bookFindingsHostOf();

  #bookFindingsHostOf(): BookFindingsHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      evaluationBookTitle: this.#evaluationBookTitle.bind(this),
      latestAnalysisRevision: this.#latestAnalysisRevision.bind(this),
      inspectReviewWorkspace: (bookId, reviewRunId, progress, page) => this.inspectReviewWorkspace(bookId, reviewRunId, progress, page),
      inspectEvaluation: (bookId, recordId) => this.inspectEvaluation(bookId, recordId),
    };
  }

  inspectBookFindings(bookId: string, offset = 0): BookFindingsProjection {
    return inspectBookFindings(this.#bookFindingsHost, bookId, offset);
  }

  inspectParagraphAnalysis(bookId: string, manuscriptId: string, blockId: string, radius: number): ParagraphAnalysisProjection {
    requireStore(Number.isSafeInteger(radius) && radius >= 0 && radius <= 4, 'ANALYSIS_RANGE_INVALID', '段落分析范围无效。');
    const block = this.#authority.prepare(`SELECT wb.position, wb.branch_id FROM manuscripts m
      JOIN branch_working_state bws ON bws.manuscript_id = m.manuscript_id
      JOIN working_blocks wb ON wb.branch_id = bws.branch_id
      WHERE m.book_id = ? AND m.manuscript_id = ? AND m.role = 'primary' AND wb.block_id = ?`).get(bookId, manuscriptId, blockId) as SqlRow | undefined;
    requireStore(block !== undefined, 'ANALYSIS_BLOCK_UNAVAILABLE', '这段文字已不在当前稿件中。');
    const nearby = this.#authority.prepare('SELECT block_id FROM working_blocks WHERE branch_id = ? AND position BETWEEN ? AND ?')
      .all(asString(block.branch_id), asNumber(block.position) - radius, asNumber(block.position) + radius) as SqlRow[];
    return paragraphAnalysis(bookId, manuscriptId, blockId, new Set(nearby.map((row) => asString(row.block_id))), this.#latestAnalysisRevision(bookId));
  }

  /** The latest settled result set alone: the panel reads it on a cadence, so none of 分析's page decorations are built. */
  #latestAnalysisRevision(bookId: string): BaselineAnalysisResultSetRevisionProjection | null {
    if (this.#baselineAnalysis.analysisFreshnessOf(bookId) === 'absent') return null;
    return (this.#analysisCall(() => this.#baselineAnalysis.inspect(bookId, undefined, null)) as BaselineAnalysisProjection).resultSetRevision;
  }

  // ---- J-04 factual review (Issue #53, plan slice S18a) -------------------------------------------

  /**
   * The Book's factual review: the second analysis kind, on the same real path and through the same
   * operations. Its projection is discriminated on `kind`, and no renderer reads it in this slice —
   * the editor surfaces arrive with S18b, so no request frame, preload member, or `window.ai7` entry
   * changes here.
   */
  inspectFactualReview(bookId: string, progress?: ProgressReader, revisionId: string | null = null): FactualReviewProjection {
    return this.#analysisCall(() => this.#factualReview.inspect(bookId, progress, revisionId)) as FactualReviewProjection;
  }

  createFactualReviewPreparationWork(
    bookId: string,
    goal: FactualReviewGoal,
    launchPolicy: LaunchPolicyProjection,
    reconfirm = false,
  ): AnalysisPreparationResult<FactualReviewProjection> {
    const result = this.#analysisCall(() => this.#factualReview.prepare({ phase: 'start', bookId, goal, update: null, reconfirm, launchPolicy }));
    return { ...result, projection: result.projection as FactualReviewProjection | null };
  }

  advanceFactualReviewPreparationWork(workId: string): AnalysisPreparationResult<FactualReviewProjection> {
    const result = this.#analysisCall(() => this.#factualReview.prepare({ phase: 'advance', workId }));
    return { ...result, projection: result.projection as FactualReviewProjection | null };
  }

  authorizeFactualReview(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
  ): { projection: FactualReviewProjection; dispatchRunRecordId: string | null } {
    const authorized = this.#analysisCall(() => this.#factualReview.authorize(bookId, taskIntentId, planEnvelopeDigest));
    return { projection: authorized.projection as FactualReviewProjection, dispatchRunRecordId: authorized.dispatchRunRecordId };
  }

  /** The factual kind's append-only ledger, which its execution owner writes through; service-internal. */
  get factualReviewLedger(): BaselineAnalysisStore {
    this.#assertAvailable();
    return this.#factualReview;
  }

  // ---- 审阅 review categories (Issue #417, plan slice S69) -----------------------------------------

  /**
   * The append-only ledger of one Review Category: the same ledger class over the same Book database,
   * constructed with that category's kind definition. A category is configuration, so its definition
   * is built by the caller (`reviewCategoryKindDefinition`) and its ledger is made when first asked
   * for rather than at open. It is kept per kind *and* frozen category contract: a ledger holds the
   * preparations in flight, so the same definition must keep finding the same ledger, and a category
   * whose clauses changed is a different contract that must not inherit them. Only the
   * `REVIEW_CATEGORY_CACHE_CAPACITY` most recently used are kept besides those with a preparation in
   * flight (Issue #649); everything else a ledger knows is in the Book database, so one made afresh
   * reads exactly what the one let go would have.
   *
   * The ledger takes the route and the launch the baseline ledger was bound to, so every plan it
   * freezes names the binding this launch actually bound — which the one execution owner then checks.
   */
  readonly #reviewOperationsHost: reviewOperations.ReviewOperationsHost = this.#reviewOperationsHostOf();

  #reviewOperationsHostOf(): reviewOperations.ReviewOperationsHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      get boundedAuthority() { return store.#boundedAuthority; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get factualReview() { return store.#factualReview; },
      get control() { return store.#control; },
      get codeRoot() { return store.#codeRoot; },
      get reviewRuns() { return store.#reviewRuns; },
      get reviewCategoryLedgers() { return store.#reviewCategoryLedgers; },
      get reviewCategoryDefinitions() { return store.#reviewCategoryDefinitions; },
      get factualVerification() { return store.#factualVerification; },
      get capturedProcedureHost() { return store.#capturedProcedureHost; },
      get rules() { return store.#rules; },
      get manuscriptExport() { return store.#manuscriptExport; },
      assertAvailable: this.#assertAvailable.bind(this),
      analysisCall: this.#analysisCall.bind(this),
      reviewCall: this.#reviewCall.bind(this),
      verificationCall: this.#verificationCall.bind(this),
      ruleCall: this.#ruleCall.bind(this),
      exportCall: this.#exportCall.bind(this),
      transaction: this.#transaction.bind(this),
      memoryFacade: this.#memoryFacade.bind(this),
      taskMaterialReadings: this.#taskMaterialReadings.bind(this),
      prepareTaskMaterials: this.#prepareTaskMaterials.bind(this),
      resultBinding: this.#resultBinding.bind(this),
      launchChoice: this.#launchChoice.bind(this),
      executionLedgerForRun: (runRecordId) => this.executionLedgerForRun(runRecordId),
      materializeFactualVerification: (reviewRunId) => this.materializeFactualVerification(reviewRunId),
      inspectTaskPlanWithConnection: (input, credentialReadiness, connectivity, progress) => this.inspectTaskPlanWithConnection(input, credentialReadiness, connectivity, progress),
      inspectFactualVerification: (input) => this.inspectFactualVerification(input),
      inspectEvidenceWorkspace: (input) => this.inspectEvidenceWorkspace(input),
      inspectResearchEvidence: (input) => this.inspectResearchEvidence(input),
    };
  }

  reviewCategoryLedger(definition: AnalysisKindDefinition, cached = true): BaselineAnalysisStore {
    return reviewOperations.reviewCategoryLedger(this.#reviewOperationsHost, definition, cached);
  }

  /** One category's Task, latest Result Set Revision, history and update controls; `revisionId` opens one exact revision read-only. */
  inspectReviewCategory(
    bookId: string,
    definition: AnalysisKindDefinition,
    progress?: ProgressReader,
    revisionId: string | null = null,
  ): ReviewCategoryProjection {
    return reviewOperations.inspectReviewCategory(this.#reviewOperationsHost, bookId, definition, progress, revisionId);
  }

  /**
   * Prepare one category's Task in the requested mode. The goal is the definition's own fixed text for
   * that mode, so a caller names what it wants reviewed and never restates the sentence. `review-first`
   * is the whole first review; every other mode is named to the ledger, the range-bound first mode
   * included.
   */
  createReviewCategoryPreparationWork(
    bookId: string,
    definition: AnalysisKindDefinition,
    request: ReviewCategoryTaskRequest,
    launchPolicy: LaunchPolicyProjection,
    reconfirm = false,
  ): AnalysisPreparationResult<ReviewCategoryProjection> {
    return reviewOperations.createReviewCategoryPreparationWork(this.#reviewOperationsHost, bookId, definition, request, launchPolicy, reconfirm);
  }

  advanceReviewCategoryPreparationWork(definition: AnalysisKindDefinition, workId: string): AnalysisPreparationResult<ReviewCategoryProjection> {
    return reviewOperations.advanceReviewCategoryPreparationWork(this.#reviewOperationsHost, definition, workId);
  }

  cancelReviewCategoryPreparationWork(definition: AnalysisKindDefinition, workId: string): boolean {
    return reviewOperations.cancelReviewCategoryPreparationWork(this.#reviewOperationsHost, definition, workId);
  }

  /** Records the standard-direct authorization and the Run; the caller hands the Run and this category's ledger to the execution owner. */
  authorizeReviewCategory(
    bookId: string,
    definition: AnalysisKindDefinition,
    taskIntentId: string,
    planEnvelopeDigest: string,
  ): { projection: ReviewCategoryProjection; dispatchRunRecordId: string | null } {
    return reviewOperations.authorizeReviewCategory(this.#reviewOperationsHost, bookId, definition, taskIntentId, planEnvelopeDigest);
  }

  // ---- 审阅 Review Runs (Issue #417, plan slice S69) ----------------------------------------------

  // ---- 自定义分析维度 (Issue #922, wave 10 slice 7f; ADR 0090 item 4) ---------------------------------------------------

  #customAnalysisCall<T>(operation: () => T): T {
    return this.#analysisCall(() => {
      try {
        return operation();
      } catch (error) {
        if (error instanceof CustomAnalysisDimensionError || error instanceof CustomAnalysisDocumentError) throw new StoreError(error.code, error.message);
        throw error;
      }
    });
  }

  /** What the 自定义分析维度 operations in custom-analysis-dimensions.ts reach of the store (Issue #1172), read live. */
  readonly #customAnalysisHost: customAnalysisOperations.CustomAnalysisStoreHost = this.#customAnalysisHostOf();

  #customAnalysisHostOf(): customAnalysisOperations.CustomAnalysisStoreHost {
    const store = this;
    return {
      analysisCall: this.#analysisCall.bind(this),
      assertAvailable: this.#assertAvailable.bind(this),
      get authority() { return store.#authority; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get boundedAuthority() { return store.#boundedAuthority; },
      get control() { return store.#control; },
      customAnalysisCall: this.#customAnalysisCall.bind(this),
      get customAnalysisDefinitions() { return store.#customAnalysisDefinitions; },
      get customAnalysisDimensions() { return store.#customAnalysisDimensions; },
      get customAnalysisLedgers() { return store.#customAnalysisLedgers; },
    };
  }

  customAnalysisLedger(definition: AnalysisKindDefinition): BaselineAnalysisStore {
    return customAnalysisOperations.customAnalysisLedger(this.#customAnalysisHost, definition);
  }

  /**
   * ②A's ledger of one Task (Issue #922): a 自定义分析维度 Task's own, on the exact version its plan froze, or the Book's baseline
   * ledger for any other — so the plan in the Task Drawer, 开始任务 and the Run's controls reach the ledger of the Task they name.
   */
  #analysisLedgerOfTask(bookId: string, taskIntentId: string | null): BaselineAnalysisStore {
    if (taskIntentId === null) return this.#baselineAnalysis;
    const row = this.#authority.prepare('SELECT kind FROM analysis_task_intents WHERE book_id = ? AND task_intent_id = ?').get(bookId, taskIntentId) as SqlRow | undefined;
    if (row === undefined || !isCustomAnalysisKindId(row.kind)) return this.#baselineAnalysis;
    const version = customAnalysisOperations.customAnalysisVersionOfTask(this.#customAnalysisHost, taskIntentId);
    requireStore(version !== null, 'CUSTOM_ANALYSIS_VERSION_UNKNOWN', '这项自定义分析任务所依据的维度版本已无法读取。');
    return this.customAnalysisLedger(customAnalysisOperations.customAnalysisDefinition(this.#customAnalysisHost, version));
  }

  inspectCustomAnalysisDimensions(bookId: string | null, progress?: ProgressReader): CustomAnalysisDimensionsProjection {
    return customAnalysisOperations.inspectCustomAnalysisDimensions(this.#customAnalysisHost, bookId, progress);
  }

  saveCustomAnalysisDimension(input: SaveCustomAnalysisDimensionInput): CustomAnalysisDimensionsProjection {
    return customAnalysisOperations.saveCustomAnalysisDimension(this.#customAnalysisHost, input);
  }

  enableCustomAnalysisDimension(versionId: string): CustomAnalysisDimensionsProjection {
    return customAnalysisOperations.enableCustomAnalysisDimension(this.#customAnalysisHost, versionId);
  }

  stopCustomAnalysisDimension(versionId: string): CustomAnalysisDimensionsProjection {
    return customAnalysisOperations.stopCustomAnalysisDimension(this.#customAnalysisHost, versionId);
  }

  prepareCustomAnalysis(input: PrepareCustomAnalysisInput, launchPolicy: LaunchPolicyProjection): { taskIntentId: string; dimensions: CustomAnalysisDimensionsProjection } {
    return customAnalysisOperations.prepareCustomAnalysis(this.#customAnalysisHost, input, launchPolicy);
  }

  reconcileStoppedCustomAnalysisRuns(): { settled: number } {
    return customAnalysisOperations.reconcileStoppedCustomAnalysisRuns(this.#customAnalysisHost);
  }

  #taskMaterialReadings(boundary: TaskMaterialBoundary, surface: '审阅' | '评估' = '审阅'): ReadonlyArray<TaskMaterialReading> {
    return this.#analysisCall(() => taskMaterialSources(boundary.references)).map((source) => {
      let paragraphs: ReadonlyArray<string>;
      try {
        // The first page is always read: it re-checks that the pin is still referable and its index version still local.
        // The text of an index version never changes, so the remaining pages are read once per pin and kept.
        const first = this.readMaterialIndexForTask(boundary, source.materialId, 1);
        paragraphs = this.#taskMaterialTexts.obtain(`${boundary.bookId}|${source.materialId}|${source.indexDigest}|${source.sha256}`, () => {
          const texts = first.segments.map((segment) => segment.text);
          for (let from = first.next; from !== null;) {
            const page = this.readMaterialIndexForTask(boundary, source.materialId, from);
            texts.push(...page.segments.map((segment) => segment.text));
            from = page.next;
          }
          return texts;
        });
      } catch (error) {
        if (error instanceof StoreError && (error.code === 'MATERIAL_INDEX_MOVED' || error.code === 'MATERIAL_REFERENCE_UNAVAILABLE' || error.code === 'MATERIAL_INDEX_RECORD_INVALID')) {
          return taskMaterialRefusal(source, error.code, surface);
        }
        throw error;
      }
      return this.#analysisCall(() => taskMaterialWords(source, paragraphs));
    });
  }

  #prepareTaskMaterials(bookId: string, materialIds: ReadonlyArray<string>): ReadonlyArray<TaskMaterialSource> {
    requireStore(materialIds.length <= MAX_WRITING_MATERIALS && new Set(materialIds).size === materialIds.length && materialIds.every((id) => UUID_PATTERN.test(id)),
      'TASK_MATERIAL_INVALID', '最多参考 4 份资料，且不能重复选择。');
    let total = 0;
    const references = materialIds.map((materialId) => {
      const material = this.#libraryCall(() => this.#libraryMaterials.original(materialId));
      const title = writingWords(material.title, 200);
      const pin = this.pinMaterialReference(bookId, materialId);
      const build = this.#materialIndexCall(() => this.#materialIndex.current(materialId));
      requireStore(build !== null && build.sha256 === pin.indexDigest, 'MATERIAL_INDEX_MOVED', `资料《${title}》的索引版本已不在本机。`);
      const characters = build.metadata.characters;
      requireStore(characters <= MAX_WRITING_MATERIAL_GRAPHEMES, 'TASK_MATERIAL_OVER_BOUND', writingMaterialOverBoundNamed(title, characters));
      total += characters;
      const paragraphs: string[] = [];
      const boundary = { bookId, references: [pin] };
      for (let from: number | null = 1; from !== null;) {
        const page = this.readMaterialIndexForTask(boundary, materialId, from);
        paragraphs.push(...page.segments.map((segment) => writingMaterialParagraph(segment.text)).filter((text) => text.length > 0));
        from = page.next;
      }
      requireStore(paragraphs.length > 0, 'MATERIAL_INDEX_NO_TEXT', `资料《${title}》没有提取出可分段的文字。`);
      return { ...pin, title, characters, sha256: writingMaterialDigest(paragraphs) };
    });
    requireStore(total <= MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES, 'TASK_MATERIAL_OVER_BOUND', writingMaterialsOverTotal(total));
    return references;
  }

  /**
   * The 资料库 items a Book's Tasks may list whose index is complete, the latest arrival first. An item whose index record is
   * damaged is not dropped and does not fail the page (#795): it is listed with `damaged` and no known size, and offered as
   * not selectable, with its reason (Issue #759); a frozen reference row names the damage again where a plan lists it.
   */
  #indexedMaterialOffers(bookId: string): Array<{ materialId: string; title: string; scope: 'book' | 'house'; characters: number; damaged: boolean }> {
    return this.#libraryCall(() => this.#libraryMaterials.referable(bookId)).flatMap((item): Array<{ materialId: string; title: string; scope: 'book' | 'house'; characters: number; damaged: boolean }> => {
      try {
        const build = this.#materialIndexCall(() => this.#materialIndex.current(item.materialId));
        return build === null || build.state !== 'complete' ? [] : [{ ...item, characters: build.metadata.characters, damaged: false }];
      } catch (error) {
        if (error instanceof StoreError && error.code === 'MATERIAL_INDEX_RECORD_INVALID') return [{ ...item, characters: 0, damaged: true }];
        throw error;
      }
    });
  }

  #taskMaterialOffers(bookId: string, surface: '审阅' | '评估' = '审阅'): NonNullable<ReviewWorkspaceProjection['materials']> {
    const launch = this.#baselineAnalysis.launch;
    const kinds = surface === '评估' ? [INITIAL_EVALUATION_KIND, READERS_REPORT_KIND]
      : BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.filter((entry) => entry.executor === 'review-category-contract').map((entry) => reviewCategoryKindId(entry.categoryId));
    const live = launch.live !== null && !kinds.some((kind) => liveMaterialRule(launch.policy, kind) !== null);
    const indexed = this.#indexedMaterialOffers(bookId);
    return {
      statement: live ? TASK_MATERIAL_LIVE_UNAVAILABLE : indexed.length === 0 ? TASK_MATERIALS_NONE : TASK_MATERIALS_STATEMENT,
      items: indexed.slice(0, MAX_WRITING_MATERIAL_OFFERS).map((item) => {
        const reason = live ? TASK_MATERIAL_LIVE_UNAVAILABLE : item.damaged ? TASK_MATERIAL_OFFER_DAMAGED
          : item.characters > MAX_WRITING_MATERIAL_GRAPHEMES ? writingMaterialOverBound(item.characters) : null;
        return { materialId: item.materialId, title: item.title, scope: item.scope, characters: item.characters, selectable: reason === null, reason };
      }),
      more: Math.max(0, indexed.length - MAX_WRITING_MATERIAL_OFFERS),
    };
  }

  /**
   * The Book's 审阅 destination (Appendix 1 of the S69 design): the categories with their basis, the
   * coverage matrix, the scope options, the 审阅记录, and the opened Run — the latest when `reviewRunId`
   * is `null`. `progress` is the execution owner's reader, exactly as the analysis inspections take it.
   * `page` chooses which of the opened Run's findings the answer carries — a cursor and the four filters
   * of the results — and is the first page of every finding when it is left out.
   */
  inspectHouseWordList(input: InspectHouseWordListInput) {
    return this.#boundedCall(() => {
      try { return new HouseWordLists(this.#authority).inspect(input); }
      catch (error) { if (error instanceof HouseWordListError) throw new StoreError(error.code, error.message); throw error; }
    });
  }
  saveHouseWordList(input: SaveHouseWordListInput) {
    return this.#boundedCall(() => {
      try { return new HouseWordLists(this.#authority).save(input); }
      catch (error) { if (error instanceof HouseWordListError) throw new StoreError(error.code, error.message); throw error; }
    });
  }

  inspectReviewWorkspace(bookId: string, reviewRunId: string | null, progress?: ProgressReader, page?: ReviewFindingPageRequest, executionConfig?: RuntimeExecutionConfig): ReviewWorkspaceProjection {
    return reviewOperations.inspectReviewWorkspace(this.#reviewOperationsHost, bookId, reviewRunId, progress, page, executionConfig);
  }

  /**
   * Prepare a Review Run as one cooperative job (B1): each selected Task-backed category's Task on its
   * own ledger, one per step, then the Run itself. The projection is the workspace with the new Run open.
   */
  createReviewRunPreparationWork(
    bookId: string,
    categoryIds: ReadonlyArray<string>,
    scope: ReviewRunScopeRequest,
    launchPolicy: LaunchPolicyProjection,
    // The Captured Procedure version the sheet was pre-filled from (Issue #65, S30; ADR 0087 §4): pinned by the Run.
    capturedProcedure: { versionId: string; documentSha256: string } | null = null,
    materialIds: ReadonlyArray<string> = [],
    redoOf: string | null = null,
    // 准备计划 on a Task Intent Draft (Issue #423, slice 7a): the draft the one category's Run is prepared from.
    intentDraft: DraftPromotion | null = null,
    seriesId: string | null = null,
    localCheck?: import('../shared/protocol/procedures.js').LocalCheckOptions,
    decisionId?: string, procedureDefinition: import('../shared/protocol/procedures.js').ProcedureDefinitionPin | null = null,
  ): AnalysisPreparationResult<ReviewWorkspaceProjection> {
    return reviewOperations.createReviewRunPreparationWork(this.#reviewOperationsHost, bookId, categoryIds, scope, launchPolicy, capturedProcedure, materialIds, redoOf, intentDraft, seriesId, localCheck, decisionId, procedureDefinition);
  }


  captureScopedAiEditLaunch(input: import('../shared/protocol/scoped-edit.js').StartScopedAiEditInput & { bookId: string; clientCommandId: string },
    create: (binding: ConfiguredProviderBinding | null) => { runId: string; manuscript: unknown }): { runId: string; repeated: boolean; notice?: string } {
    const { clientCommandId, ...request } = input;
    try {
      return launchFromSnapshot(this.#authority, { clientCommandId, bookId: input.bookId, kind: 'scoped-ai-edit', input: request },
        () => this.#launchChoice('fast-interaction', input.executionConfig ?? {}, input.rememberedChoice), choice => create(choice.binding));
    } catch (error) {
      if (error instanceof TaskLaunchError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  #launchChoice(role: 'main-editorial' | 'fast-interaction', override: RuntimeExecutionConfig, remembered = false): import('./task-launch-snapshots.js').LaunchChoice {
    let notice: string | undefined;
    if (remembered && Object.keys(override).length > 0) {
      const connection = modelSearchSettings.resolveModelRole(this.#modelSearchSettingsHost, role, { ...(override.modelConnectionId === undefined ? {} : { modelConnectionId: override.modelConnectionId }) }).connection;
      // A remembered model the channel can no longer send (#1582) falls back like one no longer listed.
      if (connection?.credentialOperationState !== 'ready' || (override.modelId !== undefined &&
          (!this.getModelServiceModels(connection.binding.providerId).some(model => model.modelId === override.modelId) ||
            modelServiceRouteRefusal(connection.binding.providerId, override.modelId, role === 'main-editorial' ? 'main' : 'fast') !== null))) {
        override = {};
        notice = '上次选择的模型已不可用，本次已使用角色默认模型。';
      }
    }
    const { binding, refusal } = modelSearchSettings.resolveModelRole(this.#modelSearchSettingsHost, role, override);
    requireStore(this.#baselineAnalysis.launch.operationalScope !== 'ordinary-production' || binding !== null,
      refusal === null ? 'MODEL_SERVICE_SETUP_REQUIRED' : 'MODEL_ROUTE_NOT_SERVED', refusal ?? '请先在设置中连接可用模型。');
    const connection = binding === null ? undefined : this.getModelServiceConnections().find(connection => connection.credentialReference === binding.credentialReference);
    return { binding, ...(notice === undefined ? {} : { notice }), executionConfig: { ...(connection === undefined ? {} : { modelConnectionId: connection.connectionId }),
      ...(binding === null ? {} : { modelId: binding.model, reasoningEffort: binding.reasoningEffort ?? 'off' }) } };
  }

  #launchInitialHost(execution: import('./analysis/baseline-analysis-store.js').LaunchBinding): initialEvaluationOperations.InitialEvaluationOperationsHost {
    const host: initialEvaluationOperations.InitialEvaluationOperationsHost = { ...this.#initialEvaluationOperationsHost,
      transaction: transactLaunch,
      baselineAnalysis: this.#baselineAnalysis.forkForLaunch(execution), initialEvaluation: this.#initialEvaluation.forkForLaunch(execution),
      initialEvaluationLedgerForBook: (bookId, materials) => initialEvaluationOperations.initialEvaluationLedgerForBook(host, bookId, materials),
      inspectInitialEvaluation: (bookId, progress, revisionId) => initialEvaluationOperations.inspectInitialEvaluation(host, bookId, progress, revisionId) };
    return host;
  }

  #launchLedgerTask(kind: Exclude<import('./task-launch-snapshots.js').LaunchTaskKind, 'review-run' | 'scoped-ai-edit'>,
    input: import('../shared/protocol.js').LedgerTaskExecutionLaunchInput & { bookId: string }, launchPolicy: LaunchPolicyProjection,
    create: (context: import('./task-plan-creation.js').TaskLaunchContext, policy: LaunchPolicyProjection) => ReturnType<BaselineAnalysisStore['launchTask']>,
    startWhen: 'now' | 'when-online' = 'now', preview?: import('./task-plan-creation.js').TaskLaunchContext['preview']) {
    if (preview !== undefined) {
      const choice = this.#launchChoice('main-editorial', input.executionConfig ?? {}, input.rememberedChoice);
      const policy = choice.binding !== null && this.#baselineAnalysis.launch.operationalScope === 'ordinary-production'
        ? resolveSourceCheckoutLaunchPolicySync(this.#codeRoot, 'ordinary-production', choice.binding) : launchPolicy;
      this.#analysisCall(() => create({ snapshotId: randomUUID(), execution: this.#baselineAnalysis.withExecutionChoice(choice.binding, policy).launch, preview,
        ...(input.planEdits === undefined ? {} : { planEdits: input.planEdits }) }, policy));
      throw new StoreError('TASK_PREVIEW_FAILED', '这次计划暂时无法读取。');
    }
    const { clientCommandId, ...request } = input;
    let execution: import('./analysis/baseline-analysis-store.js').LaunchBinding | null = null;
    try {
      const launched = launchFromSnapshot(this.#authority, { clientCommandId, bookId: input.bookId, kind, input: request },
        () => this.#launchChoice('main-editorial', input.executionConfig ?? {}, input.rememberedChoice), (choice, snapshotId) => {
          const policy = choice.binding !== null && this.#baselineAnalysis.launch.operationalScope === 'ordinary-production'
            ? resolveSourceCheckoutLaunchPolicySync(this.#codeRoot, 'ordinary-production', choice.binding) : launchPolicy;
          execution = this.#baselineAnalysis.withExecutionChoice(choice.binding, policy).launch;
          const projection = create({ snapshotId, execution, startWhen: input.startWhen === 'idle' ? 'idle' : input.startWhen === 'when-online' ? 'when-online' : startWhen,
            ...(input.planEdits === undefined ? {} : { planEdits: input.planEdits }) }, policy);
          requireStore(projection.run !== null && projection.checkpoint !== null, 'TASK_LAUNCH_FAILED', '这次任务未能启动。');
          return { runId: projection.run.runRecordId, manuscript: projection.checkpoint };
        });
      const row = this.#authority.prepare('SELECT task_intent_id FROM analysis_run_records WHERE run_record_id = ?').get(launched.runId) as SqlRow;
      const ledger = this.executionLedgerForRun(launched.runId);
      return { taskIntentId: asString(row.task_intent_id), runRecordId: launched.runId, repeated: launched.repeated,
        ledger: execution === null ? ledger : ledger.forkForLaunch(execution),
        ...(ledger.currentRunState(launched.runId) === 'awaiting-connectivity' ? { waitingForNetwork: true } : {}),
        ...(launched.notice === undefined ? {} : { launchNotice: launched.notice }) };
    } catch (error) {
      if (error instanceof TaskLaunchError) throw new StoreError(error.code, error.message);
      return this.#analysisCall(() => { throw error; });
    }
  }

  launchBaselineAnalysis(input: import('../shared/protocol.js').ServiceOperationMap['launchBaselineAnalysis']['input'], policy: LaunchPolicyProjection, startWhen: 'now' | 'when-online' = 'now', preview?: import('./task-plan-creation.js').TaskLaunchContext['preview']) {
    return this.#launchLedgerTask('baseline-analysis', input, policy, (context, launchPolicy) => {
      const ledger = this.#baselineAnalysis.forkForLaunch(context.execution);
      const task = {
      phase: 'start', bookId: input.bookId, goal: input.goal, update: input.update ?? null, redoOf: input.redoOf ?? null, reconfirm: false, launchPolicy, launchStartWhen: context.startWhen ?? 'now' } as const;
      return launchedTaskPlan(context)(ledger, task).projection!;
    }, startWhen, preview);
  }

  launchCustomAnalysis(input: import('../shared/protocol.js').ServiceOperationMap['launchCustomAnalysis']['input'], policy: LaunchPolicyProjection, startWhen: 'now' | 'when-online' = 'now', preview?: import('./task-plan-creation.js').TaskLaunchContext['preview']) {
    return this.#launchLedgerTask('custom-analysis', input, policy, (context, launchPolicy) => customAnalysisOperations.launchCustomAnalysisTask(
      { ...this.#customAnalysisHost, baselineAnalysis: this.#baselineAnalysis.forkForLaunch(context.execution) }, input, launchPolicy, context), startWhen, preview);
  }

  launchWritingTask(input: import('../shared/protocol.js').ServiceOperationMap['launchWritingTask']['input'], policy: LaunchPolicyProjection, startWhen: 'now' | 'when-online' = 'now', preview?: import('./task-plan-creation.js').TaskLaunchContext['preview']) {
    return this.#launchLedgerTask('writing', input, policy, (context, launchPolicy) => writingTaskOperations.launchWritingTask(
      { ...this.#writingTaskOperationsHost, transaction: transactLaunch, baselineAnalysis: this.#baselineAnalysis.forkForLaunch(context.execution) }, input.bookId, input, launchPolicy, null, null, context), startWhen, preview);
  }

  launchInitialEvaluation(input: import('../shared/protocol.js').ServiceOperationMap['launchInitialEvaluation']['input'], policy: LaunchPolicyProjection, startWhen: 'now' | 'when-online' = 'now', preview?: import('./task-plan-creation.js').TaskLaunchContext['preview']) {
    return this.#launchLedgerTask('initial-evaluation', input, policy, (context, launchPolicy) => initialEvaluationOperations.launchInitialEvaluationTask(
      this.#launchInitialHost(context.execution), input.bookId, launchPolicy, input.materialIds ?? [], null, input.seriesId ?? null, context), startWhen, preview);
  }

  launchReadersReport(input: import('../shared/protocol.js').ServiceOperationMap['launchReadersReport']['input'], policy: LaunchPolicyProjection, startWhen: 'now' | 'when-online' = 'now', preview?: import('./task-plan-creation.js').TaskLaunchContext['preview']) {
    return this.#launchLedgerTask('readers-report', input, policy, (context, launchPolicy) => {
      const evaluation = this.#launchInitialHost(context.execution);
      return readersReportOperations.launchReadersReportTask({ ...this.#readersReportHost, transaction: transactLaunch, baselineAnalysis: evaluation.baselineAnalysis,
        evaluationLiveRefused: kind => initialEvaluationOperations.internalEvaluationLiveRefused(evaluation, kind),
        requireEvaluationMaterialScope: (has, kind) => initialEvaluationOperations.internalRequireEvaluationMaterialScope(evaluation, has, kind) },
        input.bookId, input.template, launchPolicy, input.materialIds ?? [], null, context);
    }, startWhen, preview);
  }

  launchEvaluationRewrite(input: import('../shared/protocol.js').ServiceOperationMap['launchEvaluationRewrite']['input'], policy: LaunchPolicyProjection, startWhen: 'now' | 'when-online' = 'now', preview?: import('./task-plan-creation.js').TaskLaunchContext['preview']) {
    return this.#launchLedgerTask('evaluation-rewrite', input, policy, (context, launchPolicy) => {
      const evaluation = this.#launchInitialHost(context.execution);
      return evaluationRewriteOperations.launchEvaluationRewriteTask({ ...this.#evaluationRewriteHost, transaction: transactLaunch, baselineAnalysis: evaluation.baselineAnalysis,
        evaluationLiveRefused: kind => initialEvaluationOperations.internalEvaluationLiveRefused(evaluation, kind) },
        input.bookId, input.recordId, launchPolicy, null, context);
    }, startWhen, preview);
  }

  previewTaskLaunch(input: import('../shared/protocol.js').TaskLaunchPreviewInput, policy: LaunchPolicyProjection): import('../shared/runtime-execution-config.js').TaskLaunchPreviewProjection {
    const preview: NonNullable<import('./task-plan-creation.js').TaskLaunchContext['preview']> = (ledger, task, describe) => {
      return ledger.previewLaunch(task, input.launch.input.planEdits, (projection, blocks) => {
        const bookTitle = this.#evaluationBookTitle(input.bookId);
        const plan = describe === undefined ? baselineAnalysisPlan({ projection: projection as BaselineAnalysisProjection, bookTitle, blocks })
          : describe(projection, blocks, bookTitle);
        const controlled = withLedgerRunControls(plan, projection as BaselineAnalysisProjection, blocks);
        throw new TaskLaunchPreview({ steps: controlled.steps.map(step => `${step.label}${step.removed ? '（本次不做）' : ''}`),
          scope: controlled.scope.process, units: projection.coverageManifest!.units.length, reference: controlled.scope.reference,
          send: `${controlled.scope.send}；${controlled.service.send}`, usage: controlled.service.usage,
          adaptations: controlled.boundary.adaptable.map(entry => `${entry.label}：${entry.removed ? '不允许' : entry.askFirst ? '先问我' : '允许'}`) });
      });
    };
    const launch = input.launch;
    try {
      switch (launch.operation) {
        case 'launchBaselineAnalysis': this.launchBaselineAnalysis({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
        case 'launchCustomAnalysis': this.launchCustomAnalysis({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
        case 'launchWritingTask': this.launchWritingTask({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
        case 'launchInitialEvaluation': this.launchInitialEvaluation({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
        case 'launchReadersReport': this.launchReadersReport({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
        case 'launchEvaluationRewrite': this.launchEvaluationRewrite({ ...launch.input, bookId: input.bookId }, policy, 'now', preview); break;
      }
    } catch (result) { if (result instanceof TaskLaunchPreview) return result.projection; throw result; }
    throw new StoreError('TASK_PREVIEW_FAILED', '这次计划暂时无法读取。');
  }

  launchReviewRun(input: import('../shared/protocol.js').ServiceOperationMap['launchReviewRun']['input'], launchPolicy: LaunchPolicyProjection,
    startWhen: 'now' | 'when-online' = 'now'): { projection: ReviewWorkspaceProjection; repeated: boolean } {
    return reviewOperations.launchReviewRun(this.#reviewOperationsHost, input, launchPolicy, startWhen);
  }

  advanceReviewRunPreparationWork(workId: string): AnalysisPreparationResult<ReviewWorkspaceProjection> {
    return reviewOperations.advanceReviewRunPreparationWork(this.#reviewOperationsHost, workId);
  }

  /** 生成统合总结 (Issue #1506): the summary alone for a settled Review Run; the caller hands the Run to its drive loop. */
  launchReviewSynthesis(input: import('../shared/protocol.js').ServiceOperationMap['generateReviewSynthesis']['input'], launchPolicy: LaunchPolicyProjection,
    startWhen: 'now' | 'when-online' = 'now'): { projection: ReviewWorkspaceProjection; repeated: boolean } {
    return reviewOperations.launchReviewSynthesis(this.#reviewOperationsHost, input, launchPolicy, startWhen);
  }

  cancelReviewRunPreparationWork(workId: string): boolean {
    return reviewOperations.cancelReviewRunPreparationWork(this.#reviewOperationsHost, workId);
  }


  /**
   * The editor's one approval of a prepared Review Run, naming the exact plan digest of every
   * Task-backed category (B1). The caller then hands the Run to the drive loop. An approval is recorded even while other
   * Runs hold every place of the governor; the drive loop waits for one (#1080, ADR 0095 §2). `_slotBusy` is no longer read.
   */
  authorizeReviewRun(
    bookId: string,
    reviewRunId: string,
    approvedDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>,
    _slotBusy = false,
  ): ReviewWorkspaceProjection {
    return reviewOperations.authorizeReviewRun(this.#reviewOperationsHost, bookId, reviewRunId, approvedDigests, _slotBusy);
  }

  /**
   * 忽略并说明: the disposition, its Quality Signal, and the finding's mark set aside, in one transaction
   * (REV-004). A finished category is actionable while the Run goes on (REV-008), so the answer takes the
   * owner's `progress` reader exactly as the inspection does.
   */
  recordReviewFindingDisposition(
    bookId: string,
    reviewRunId: string,
    findingId: string,
    reason: string,
    progress?: ProgressReader,
  ): ReviewWorkspaceProjection {
    return reviewOperations.recordReviewFindingDisposition(this.#reviewOperationsHost, bookId, reviewRunId, findingId, reason, progress);
  }

  /** The next version of the Run's 审阅报告 (REV-009). */
  generateReviewReport(bookId: string, reviewRunId: string, progress?: ProgressReader): ReviewWorkspaceProjection {
    return reviewOperations.generateReviewReport(this.#reviewOperationsHost, bookId, reviewRunId, progress);
  }

  /** The Review Run and finding a produced mark belongs to, for the Mark Card's `查看任务`; `null` for any other mark. */
  reviewFindingOfMark(markId: string): { bookId: string; reviewRunId: string; findingId: string } | null {
    return reviewOperations.reviewFindingOfMark(this.#reviewOperationsHost, markId);
  }

  /**
   * Refuses a Review Run that is not this Book's. The drive loop is service-internal and knows no Book,
   * so an operation that hands it a Run the renderer named — 继续审阅 — asks this first.
   */
  requireReviewRunOfBook(bookId: string, reviewRunId: string): void {
    return reviewOperations.requireReviewRunOfBook(this.#reviewOperationsHost, bookId, reviewRunId);
  }

  /**
   * The drive loop's steps (B2); service-internal. Each is one call into the Review Run ledger with the
   * store's own error handling, so a fatal store error poisons the store exactly as any other call does.
   */
  get reviewRunDriveSteps(): ReviewRunDriveSteps {
    return reviewOperations.reviewRunDriveSteps(this.#reviewOperationsHost);
  }

  // ---- The Task Drawer (Issue #418, plan slice S72) ------------------------------------------------

  /**
   * The plan of one Task as the Task Drawer shows it (editor-surfaces §6 ③): J-03's fixed task, the Book's
   * baseline analysis Task, or one Review Run, read from the records each kind already keeps and put in
   * the editor's words (`task-plan.ts`). It is a read: nothing is written and no stored byte changes, so
   * every envelope, row and digest a Task froze reads exactly as it did before, and J-03's startup byte
   * checks see the same ledger. The range the chips name is the current plan version's (#288).
   */
  inspectTaskPlan(input: InspectTaskPlanInput, progress?: ProgressReader): TaskPlanProjection {
    return this.#taskPlanWithRoute(input, progress).plan;
  }

  getTaskPlanPage(input: import('../shared/protocol.js').ServiceOperationMap['getTaskPlanPage']['input'], connectedPlan?: TaskPlanProjection | BookTasksProjection) {
    return this.#analysisCall(() => {
      requireStore(Number.isSafeInteger(input.afterOrdinal) && input.afterOrdinal >= 0, 'TASK_PLAN_PAGE_INVALID', '任务计划读取位置无效。');
      if (input.kind === 'book-tasks') {
        requireStore(input.ref === null, 'TASK_PLAN_PAGE_INVALID', '任务列表读取范围无效。');
        const projection = connectedPlan && 'groups' in connectedPlan ? connectedPlan : this.inspectBookTasks(input.bookId, () => null);
        return bookTasksPage(projection, input.path, input.afterOrdinal, input.digest);
      }
      if (input.kind === 'task-intent-drafts') {
        requireStore(input.path === 'drafts', 'TASK_PLAN_PAGE_INVALID', '任务草稿读取范围无效。');
        return taskDraftsPage(this.inspectTaskIntentDrafts({ bookId: input.bookId, draftId: input.ref }), input.afterOrdinal, input.digest);
      }
      if (REVIEW_WORKSPACE_PAGE_PATHS.includes(input.path)) {
        requireStore(input.kind === 'review-run', 'TASK_PLAN_PAGE_INVALID', '审阅读取范围无效。');
        return reviewWorkspacePage(this.inspectReviewWorkspace(input.bookId, input.ref), input.path, input.afterOrdinal, input.digest);
      }
      requireStore(input.ref !== null, 'TASK_PLAN_PAGE_INVALID', '任务计划读取范围无效。');
      const plan = connectedPlan && !('groups' in connectedPlan) ? connectedPlan : this.inspectTaskPlan({ ...input, kind: input.kind });
      requireStore(plan.bookId === input.bookId && plan.kind === input.kind && plan.ref === input.ref, 'TASK_PLAN_PAGE_INVALID', '任务计划读取范围无效。');
      return taskPlanPage(plan, input.path, input.afterOrdinal, input.digest);
    });
  }

  /**
   * The plan and the kind of route it names: the baseline Task's frozen execution route, a Review Run's live route
   * when it sends to a model service, and none for J-03's fixed task, which never dispatches (ADR 0055).
   */
  #taskPlanWithRoute(
    input: InspectTaskPlanInput,
    progress?: ProgressReader,
    carriesStoppedRun: (runRecordId: string) => boolean = () => true,
  ): { plan: TaskPlanProjection; routeKind: string | null; provider?: NonNullable<BaselineAnalysisProjection['providerResolutionPlan']> } {
    const found = this.#taskPlanOfKind(input, progress, carriesStoppedRun);
    if (input.kind !== 'baseline-analysis' && input.kind !== 'fixed-task') {
      const tasks = input.kind === 'review-run'
        ? this.#reviewCall(() => this.#reviewRuns.planFacts(input.bookId, found.plan.ref)).categories.flatMap((category) => category.task === null ? [] : [category.task.taskIntentId])
        : [found.plan.ref];
      const cards = tasks.filter((taskIntentId) => this.#authority.prepare(`SELECT 1 FROM analysis_clarification_requests q
        JOIN analysis_run_records r ON r.run_record_id = q.run_record_id WHERE r.task_intent_id = ? AND q.model_question_json IS NOT NULL LIMIT 1`)
        .get(taskIntentId) !== undefined).flatMap((taskIntentId) => {
        const ledger = this.clarificationLedger(input.bookId, taskIntentId);
        const projection = this.#analysisCall(() => ledger.inspect(input.bookId, progress));
        return baselineClarifications({ run: projection.run }, projection.run === null ? [] : ledger.clarificationsOf(projection.run.runRecordId));
      });
      found.plan = { ...found.plan, clarifications: cards };
    }
    // 结果待确认 a completed Run of this kind left on the Book (Issue #757): listed on whichever of its plans is open.
    if (input.kind === 'fixed-task') return found;
    let plan = found.plan;
    if (input.kind === 'review-run') {
      const tasks = this.#reviewCall(() => this.#reviewRuns.controlTasks(input.bookId, plan.ref));
      const active = tasks.find((task) => {
        const projection = task.ledger.inspect(input.bookId, progress);
        return projection.taskIntent?.taskIntentId === task.taskIntentId && runIsActive(projection.run?.state ?? null);
      });
      // Only this Review Run's own category Task, never a later Task of the same kind on the Book.
      const controlling = active ?? tasks.find((task) => {
        const projection = task.ledger.inspect(input.bookId);
        return projection.taskIntent?.taskIntentId === task.taskIntentId && projection.run?.state === 'cancelled';
      }) ?? tasks[0];
      if (controlling !== undefined) {
        const projection = this.#analysisCall(() => controlling.ledger.inspect(input.bookId, progress)) as unknown as BaselineAnalysisProjection;
        if (projection.taskIntent?.taskIntentId === controlling.taskIntentId) {
          const stopped = this.#baselineStoppedRun(projection, carriesStoppedRun, controlling.ledger);
          const originalState = plan.state;
          plan = withLedgerRunControls(plan, projection, [], stopped ?? undefined, controlling.ledger.launch.operationalScope === 'developer-live',
            this.#liveCancellationRanges(projection, controlling.ledger));
          if (active === undefined && projection.run?.state !== 'cancelled') plan = { ...plan, state: originalState, runControl: null };
          plan = { ...plan, edit: { ...plan.edit, planEnvelopeDigest: plan.edit.editable
            ? canonicalRecord(tasks.map((task) => ({ categoryId: task.categoryId, digest: task.planEnvelopeDigest }))).digest : null } };
        }
      }
      // The Evidence Assurance Level selector (Issue #901; EASSURE-001): only a Review Run with a 事实核查 Task shows it, at the
      // level that Task's version freezes; the policy minimum hook disables the options below it (EASSURE-008).
      const factualTask = tasks.find((task) => task.categoryId === 'factual-review');
      if (factualTask !== undefined) {
        const factual = this.#analysisCall(() => factualTask.ledger.inspect(input.bookId)) as unknown as BaselineAnalysisProjection;
        if (factual.taskIntent?.taskIntentId === factualTask.taskIntentId && factual.planVersion !== null) {
          plan = { ...plan, edit: { ...plan.edit, assurance: assuranceSelector(planEditAssuranceLevel(factual.planVersion.edits), plan.edit,
            FACTUAL_VERIFICATION_POLICY_VERSION.minimumLevel) } };
        }
      }
      plan = { ...plan, defaultRule: reviewOperations.reviewDefaultRule(this.#reviewOperationsHost, input.bookId, plan.ref) };
    }
    if (input.kind !== 'baseline-analysis' && input.kind !== 'review-run') {
      const ledger = this.#currentLedgerOf(input.kind, input.bookId, plan.ref);
      const projection = this.#analysisCall(() => ledger.inspect(input.bookId, progress)) as unknown as BaselineAnalysisProjection;
      const checkpoint = projection.checkpoint;
      if (checkpoint !== null) {
        const blocks = this.#analysisCall(() => ledger.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId));
        const stopped = this.#baselineStoppedRun(projection, carriesStoppedRun, ledger);
        plan = withLedgerRunControls(plan, projection, blocks, stopped ?? undefined, ledger.launch.operationalScope === 'developer-live',
          this.#liveCancellationRanges(projection, ledger));
      }
    }
    // A Task prepared from a Task Intent Draft shows the draft's sentence in its 目标块 (Issue #423, slice 7a).
    const promoted = input.kind === 'baseline-analysis' || input.kind === 'review-run' || input.kind === 'writing'
      ? this.#draftCall(() => this.#drafts.promotedInto(plan.ref)) : null;
    if (promoted !== null && promoted.bookId === input.bookId) {
      plan = { ...plan, goal: { ...plan.goal, draft: { draftId: promoted.draftId, sentence: promoted.latest.goal } } };
      if (promoted.latest.target === 'ranges') plan = draftRangesPlan(plan, promoted.latest.ranges);
    }
    return { ...found, plan: { ...plan, unconfirmed: this.#unconfirmedProjection(input.bookId, input.kind) } };
  }

  #taskPlanOfKind(
    input: InspectTaskPlanInput,
    progress?: ProgressReader,
    carriesStoppedRun: (runRecordId: string) => boolean = () => true,
  ): { plan: TaskPlanProjection; routeKind: string | null; provider?: NonNullable<BaselineAnalysisProjection['providerResolutionPlan']> } {
    this.#assertAvailable();
    requireStore(typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) && TASK_PLAN_KINDS.includes(input.kind) &&
      (input.ref === null || (typeof input.ref === 'string' && UUID_PATTERN.test(input.ref))), 'TASK_PLAN_INVALID', '任务计划请求无效。');
    const book = this.#authority.prepare('SELECT title FROM books WHERE book_id = ?').get(input.bookId) as SqlRow | undefined;
    requireStore(book !== undefined, 'TASK_PLAN_BOOK_NOT_FOUND', '这本书不存在。');
    const bookTitle = asString(book.title);
    const current = (taskIntentId: string): void => requireStore(input.ref === null || input.ref === taskIntentId,
      'TASK_PLAN_NOT_CURRENT', '这项任务已不是这本书当前的任务；请从它所在的位置重新打开计划。');
    if (input.kind === 'fixed-task') {
      const projection = this.#taskCall(() => this.#taskAuthorization.inspect(input.bookId));
      const checkpoint = projection.checkpoint;
      requireStore(projection.taskIntent !== null && checkpoint !== null, 'TASK_PLAN_UNAVAILABLE', '这项任务还没有准备计划。');
      current(projection.taskIntent.taskIntentId);
      const blocks = this.#analysisCall(() => this.#baselineAnalysis.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId));
      return { plan: this.#taskPlanCall(() => fixedTaskPlan({ projection, bookTitle, blocks })), routeKind: null };
    }
    if (input.kind === 'baseline-analysis') {
      // A 自定义分析维度 Task's plan is read on the ledger of the exact version it froze, the Book's baseline otherwise (Issue #922).
      const ledger = this.#analysisLedgerOfTask(input.bookId, input.ref);
      const custom = ledger === this.#baselineAnalysis ? null : customAnalysisOperations.customAnalysisPlanVersion(this.#customAnalysisHost, input.ref);
      // The execution owner's progress feeds the activity card of a Run under way (Issue #422, AUTH-011).
      const inspected = this.#analysisCall(() => ledger.inspect(input.bookId, progress)) as BaselineAnalysisProjection;
      // The ledger names a redo only on the baseline's Tasks; a dimension's Task is read as one that redoes nothing.
      const projection: BaselineAnalysisProjection = custom === null || inspected.taskIntent === null ? inspected
        : { ...inspected, taskIntent: { ...inspected.taskIntent, redoOf: inspected.taskIntent.redoOf ?? null } };
      const checkpoint = projection.checkpoint;
      requireStore(projection.taskIntent !== null && checkpoint !== null, 'TASK_PLAN_UNAVAILABLE', '这项分析还没有准备计划。');
      current(projection.taskIntent.taskIntentId);
      const blocks = this.#analysisCall(() => ledger.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId));
      // 快速开始 rules are the baseline's own; a dimension's plan offers none.
      const defaultRule = custom === null ? this.#baselineDefaultRule(projection) : undefined;
      const stopped = this.#baselineStoppedRun(projection, carriesStoppedRun, ledger);
      // What the Run asked the editor, and the answers (Issue #422, S76d).
      const clarifications = projection.run === null ? [] : this.#analysisCall(() => ledger.clarificationsOf(projection.run!.runRecordId));
      // 结果待确认 (Issue #51, S16c): the ranges this Task would send again whose earlier result could not be known.
      const resendUnits = this.#analysisCall(() => ledger.resendUnitsOf(projection));
      const baseline = this.#taskPlanCall(() => baselineAnalysisPlan({ projection, bookTitle, blocks, ...(defaultRule === undefined ? {} : { defaultRule }), clarifications, resendUnits, ...(stopped === null ? {} : { stopped }),
        liveCancellation: this.#liveCancellationRanges(projection, ledger) }));
      const routeKind = projection.providerResolutionPlan?.executionRoute.kind ?? null;
      const plan = custom === null ? baseline : customAnalysisPlan(baseline, { ...customAnalysisVersionInput(custom), version: custom.version },
        projection.providerResolutionPlan !== null && isRemoteExecutionRoute(projection.providerResolutionPlan.executionRoute));
      return { plan: withPlanMovedReason(plan, projection.run?.blockedReasons), routeKind: projection.providerResolutionPlan?.executionRoute.kind ?? null, ...(projection.providerResolutionPlan === null ? {} : { provider: projection.providerResolutionPlan }) };
    }
    if (input.kind === 'readers-report') {
      // 审稿意见 (Issue #429, S81c): the reader's report kind's latest Task, on the ledger of the contract its plan froze.
      const latest = readersReportOperations.latestReadersReport(this.#readersReportHost, input.bookId, progress);
      const projection = latest?.projection ?? null;
      const checkpoint = projection?.checkpoint ?? null;
      requireStore(latest !== null && projection !== null && projection.taskIntent !== null && checkpoint !== null, 'TASK_PLAN_UNAVAILABLE', '审稿意见还没有准备计划。');
      current(projection.taskIntent.taskIntentId);
      const blocks = this.#analysisCall(() => latest.ledger.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId));
      const plan = this.#taskPlanCall(() => readersReportPlan({
        projection,
        bookTitle,
        blocks,
        task: {
          template: latest.task.template,
          recordOrdinal: this.#evaluationRecordOrdinal(latest.task.recordId),
          profile: latest.task.input.record.profile,
          // The frozen plan's own line (Issue #792): the exemplars this draft kept, and — as 评估 names them — the damaged
          // records and the decision ledgers that were skipped when it was prepared.
          exemplars: readersReportOperations.readersReportExemplarStatement(this.#readersReportHost, {
            exemplars: latest.task.input.exemplars,
            damaged: latest.task.skippedExemplars.filter((entry) => entry.reason === 'record').map((entry) => entry.title),
            ledgerDamaged: latest.task.skippedExemplars.filter((entry) => entry.reason === 'ledger').map((entry) => entry.title),
          }),
        },
      }));
      return { plan: withPlanMovedReason(withResend(evaluationMaterialPlan(plan, this.#evaluationPlanMaterials(latest.ledger, input.bookId, projection.authorization !== null), this.#baselineAnalysis.launch.live !== null && liveMaterialRule(this.#baselineAnalysis.launch.policy, READERS_REPORT_KIND) === null), this.#analysisCall(() => latest.ledger.resendUnitsByContentOf(projection))), projection.run?.blockedReasons), routeKind: projection.providerResolutionPlan?.executionRoute.kind ?? null, ...(projection.providerResolutionPlan === null ? {} : { provider: projection.providerResolutionPlan }) };
    }
    if (input.kind === 'evaluation-rewrite') {
      // 按我的评分重写评语 (Issue #429, S81b2): the rewrite kind's latest Task, on the ledger of the contract its plan froze.
      const latest = evaluationRewriteOperations.latestEvaluationRewrite(this.#evaluationRewriteHost, input.bookId, progress);
      const projection = latest?.projection ?? null;
      const checkpoint = projection?.checkpoint ?? null;
      requireStore(latest !== null && projection !== null && projection.taskIntent !== null && checkpoint !== null, 'TASK_PLAN_UNAVAILABLE', '按我的评分重写评语还没有准备计划。');
      current(projection.taskIntent.taskIntentId);
      const blocks = this.#analysisCall(() => latest.ledger.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId));
      const plan = this.#taskPlanCall(() => evaluationRewritePlan({
        projection,
        bookTitle,
        blocks,
        task: {
          recordOrdinal: this.#evaluationRecordOrdinal(latest.task.recordId),
          entryOrdinal: latest.task.entryOrdinal,
          profile: latest.task.input.profile,
          scored: evaluationRewriteScoredItems(latest.task.input).map((item) => ({ label: item.label, score: item.score!, fullMarks: item.fullMarks })),
        },
      }));
      return { plan: withPlanMovedReason(withResend(plan, this.#analysisCall(() => latest.ledger.resendUnitsByContentOf(projection))), projection.run?.blockedReasons), routeKind: projection.providerResolutionPlan?.executionRoute.kind ?? null, ...(projection.providerResolutionPlan === null ? {} : { provider: projection.providerResolutionPlan }) };
    }
    if (input.kind === 'writing') {
      // 写作任务 (Issue #432, S84a): the writing kind's latest Task, on the ledger of the contract its plan froze.
      const latest = this.#latestWriting(input.bookId, progress);
      const projection = latest?.projection ?? null;
      const checkpoint = projection?.checkpoint ?? null;
      requireStore(latest !== null && projection !== null && projection.taskIntent !== null && checkpoint !== null, 'TASK_PLAN_UNAVAILABLE', '写作任务还没有准备计划。');
      current(projection.taskIntent.taskIntentId);
      const blocks = this.#analysisCall(() => latest.ledger.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId));
      const defaultRule = this.#writingDefaultRule(projection, latest.task);
      const plan = this.#taskPlanCall(() => writingPlan({
        projection, bookTitle, blocks, input: latest.task.input, exemplarsHere: latest.task.exemplarsReadable, copyRules: latest.task.copyRules, defaultRule,
        materials: latest.task.materials,
      }));
      return { plan: withPlanMovedReason(withResend(plan, this.#analysisCall(() => latest.ledger.resendUnitsByContentOf(projection))), projection.run?.blockedReasons), routeKind: projection.providerResolutionPlan?.executionRoute.kind ?? null, ...(projection.providerResolutionPlan === null ? {} : { provider: projection.providerResolutionPlan }) };
    }
    if (input.kind === 'initial-evaluation') {
      // AI7 初评 (Issue #429, S81b1): the evaluation kind's latest Task, read as the baseline's is.
      const ledger = this.initialEvaluationLedgerForBook(input.bookId);
      const projection = this.inspectInitialEvaluation(input.bookId, progress);
      const checkpoint = projection.checkpoint;
      requireStore(projection.taskIntent !== null && checkpoint !== null, 'TASK_PLAN_UNAVAILABLE', 'AI7 初评还没有准备计划。');
      current(projection.taskIntent.taskIntentId);
      const blocks = this.#analysisCall(() => ledger.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId));
      // The profile the Task froze (Issue #427), never the house's current one, beside the references its plan froze (#428).
      const profile = this.#initialProfileForTask(projection.taskIntent.taskIntentId);
      const plan = this.#taskPlanCall(() => seriesScopePlan(initialEvaluationPlan({ projection, bookTitle, blocks, profile }), projection.runSourceScope?.seriesScopes));
      return { plan: withPlanMovedReason(withResend(evaluationMaterialPlan(plan, this.#evaluationPlanMaterials(ledger, input.bookId, projection.authorization !== null), this.#baselineAnalysis.launch.live !== null && liveMaterialRule(this.#baselineAnalysis.launch.policy, INITIAL_EVALUATION_KIND) === null), this.#analysisCall(() => ledger.resendUnitsByContentOf(projection))), projection.run?.blockedReasons), routeKind: projection.providerResolutionPlan?.executionRoute.kind ?? null, ...(projection.providerResolutionPlan === null ? {} : { provider: projection.providerResolutionPlan }) };
    }
    const reviewRunId = input.ref;
    requireStore(reviewRunId !== null, 'TASK_PLAN_INVALID', '审阅的计划要指明是哪一次审阅。');
    const facts = this.#reviewCall(() => this.#reviewRuns.planFacts(input.bookId, reviewRunId));
    const blocks = facts.localPlan?.blocks.map((block) => ({ ...block, kind: 'paragraph' as const, level: null, digest: sha256Hex(block.text), graphemes: graphemeCount(block.text) }))
      ?? this.#analysisCall(() => this.#baselineAnalysis.readRevisionBlocks(facts.manuscript.manuscriptId, facts.inputRevision.revisionId));
    const scopes = [...new Map(facts.categories.flatMap((category) => {
      const scope = category.task?.components['run-source-scope'] as { seriesScopes?: ReadonlyArray<FrozenSeriesScope> } | undefined;
      return (scope?.seriesScopes ?? []).map((series) => [series.seriesId, series] as const);
    })).values()];
    let reviewed = this.#taskPlanCall(() => seriesScopePlan(reviewRunPlan({ bookId: input.bookId, facts, bookTitle, blocks }), scopes));
    const seriesReports = scopes.length === 0 ? [] : facts.categories.flatMap((category) => category.task?.researchReport == null ? [] : [category.task.researchReport]);
    if (seriesReports.length > 0) reviewed = { ...reviewed, technical: [...reviewed.technical, { key: 'series-read-counts', label: '书系范围任务已读取',
      value: `${seriesReports.reduce((count, report) => count + report.unitRows.filter((unit) => unit.attempts > 0).length, 0)} 个阅读范围 · ${seriesReports.reduce((count, report) => count + report.usagePerStage.units.requests, 0)} 次模型请求` }] };
    // 结果待确认 (Issue #757): each category that sends again a range an earlier Run of its kind left unconfirmed says so.
    const plan = { ...reviewed, resend: reviewOperations.reviewResend(this.#reviewOperationsHost, input.bookId, facts) };
    // The route the categories' frozen plans resolve, read from the first Task's Provider Resolution Plan as the
    // baseline reads its own: a review's Tasks share one launch, and a Run of the leads alone reaches no model.
    const frozenRoute = facts.categories
      .map((category) => category.task?.components['provider-resolution-plan'])
      .map((provider) => (provider !== null && typeof provider === 'object' ? (provider as { executionRoute?: { kind?: unknown } }).executionRoute?.kind : undefined))
      .find((kind): kind is string => typeof kind === 'string');
    // Whether the Run can be offline is its route's to say, as the baseline's (Issue #760, S74c): a route that reaches its model
    // over the network — and only one — waits for it. Whether it needs a credential is `needsModelConnection`'s, decided apart.
    const provider = facts.categories.map((category) => category.task?.components['provider-resolution-plan']).find((value) => value !== undefined);
    return { plan, routeKind: frozenRoute ?? null, ...(provider === undefined ? {} : { provider: provider as NonNullable<BaselineAnalysisProjection['providerResolutionPlan']> }) };
  }

  /**
   * The plan as the drawer's authorization bar reads it (Issue #420, plan slice S74a A3): `inspectTaskPlan`,
   * then — only for a plan that could start now and whose route sends to a model service — the readiness of
   * the credential that route resolves, read through `credentialReadiness`: the execution owner's broker
   * check, the one dispatch makes, with the value resolved and discarded. A plan whose route sends nothing
   * asks for no credential at all. A missing credential blocks the start and changes no plan (OFF-009).
   */
  async inspectTaskPlanWithConnection(
    input: InspectTaskPlanInput,
    credentialReadiness: (binding?: ConfiguredProviderBinding | null) => Promise<'present' | 'missing' | null>,
    connectivity: TaskPlanConnectivity = ALWAYS_ONLINE,
    progress?: ProgressReader,
  ): Promise<TaskPlanProjection> {
    const { plan: frozen, routeKind, provider } = this.#taskPlanWithRoute(input, progress, (runRecordId) => connectivity.carriesStoppedRun?.(runRecordId) ?? true);
    const binding = this.#productionCredentialBinding(provider);
    let plan = frozen;
    if (plan.start.needsModelConnection && plan.start.readiness === 'ready') plan = withConnectionReadiness(plan, await credentialReadiness(binding));
    // Connectivity (Issue #502): only a plan whose route reaches its model over the network can be offline,
    // and only once its credential is known to be there — 模型未连接 is decided first.
    const reaches = routeKind !== null && connectivity.reachesNetwork(routeKind);
    plan = withConnectivityReadiness(plan, reaches, reaches ? connectivity.reading() : 'online');
    // 续行 (Issue #422, S76b; CONT-015): a stopped Run goes on only once the service could run it now — the slot free,
    // the route's credential there when it sends to a model service — one that sends nothing asks for none here
    // either — and the device online when the route reaches its model over the network.
    if (plan.runControl?.resume != null) {
      const blockers: string[] = [];
      if (plan.start.needsModelConnection && (await credentialReadiness(binding)) === 'missing') blockers.push(RESUME_BLOCKED_CONNECTION);
      if (reaches && connectivity.reading() === 'offline') blockers.push(RESUME_BLOCKED_OFFLINE);
      plan = withResumeBlockers(plan, blockers);
    }
    // A Run waiting for the editor's answer goes on once answered (Issue #422, S76d; CLAR-006): it is answered only while
    // the service could take it on — the route's credential there, and the device online when the route reaches its
    // model over the network. A busy slot only queues it.
    if (plan.state.key === 'awaiting-clarification') {
      const blockers: string[] = [];
      if (plan.start.needsModelConnection && (await credentialReadiness(binding)) === 'missing') blockers.push(ANSWER_BLOCKED_CONNECTION);
      if (reaches && connectivity.reading() === 'offline') blockers.push(ANSWER_BLOCKED_OFFLINE);
      plan = withAnswerBlockers(plan, blockers);
    }
    if (plan.state.key !== 'waiting' || plan.state.label === RUN_WAITING_IDLE_LABEL) return plan;
    if (reaches && connectivity.reading() === 'offline') return withWaitingReason(plan, 'network');
    if ((await credentialReadiness(binding)) === 'missing') return withWaitingReason(plan, 'connection');
    return withWaitingReason(plan, connectivity.slotBusy() ? 'slot' : 'admitting');
  }

  /** The frozen plan's credential metadata for production readiness; other scopes keep their launch binding. */
  #productionCredentialBinding(provider: NonNullable<BaselineAnalysisProjection['providerResolutionPlan']> | undefined): ConfiguredProviderBinding | null | undefined {
    if (this.#baselineAnalysis.launch.operationalScope !== 'ordinary-production') return undefined;
    if (provider === undefined || !('endpoint' in provider.executionRoute)) return null;
    const binding = { route: provider.executionRoute.kind, endpoint: provider.executionRoute.endpoint,
      model: provider.executionRoute.model, credentialSlot: provider.remoteBinding.credentialSlot,
      credentialReference: provider.remoteBinding.credentialReference };
    return allowedProductionBindingOf(binding) === null ? null : binding;
  }

  /** Reconnect asks about this Run's frozen plan, never the currently selected connection (#811 revision 9). */
  taskCredentialBinding(input: InspectTaskPlanInput, runRecordId?: string): ConfiguredProviderBinding | null | undefined {
    if (this.#baselineAnalysis.launch.operationalScope !== 'ordinary-production') return undefined;
    if (runRecordId !== undefined && input.kind !== 'review-run') {
      // Read the authorized version even if a newer Task replaced it: the drift check must still be able to block that Run.
      const row = this.#authority.prepare(`SELECT p.canonical_json FROM analysis_run_records r
        JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
        JOIN analysis_plan_versions v ON v.plan_envelope_sha256 = a.plan_envelope_sha256
        JOIN analysis_plan_records p ON p.task_intent_id = v.task_intent_id AND p.plan_version = v.ordinal
        WHERE r.run_record_id = ? AND p.component = 'provider-resolution-plan'`).get(runRecordId) as SqlRow | undefined;
      requireStore(row !== undefined, 'ANALYSIS_RECORD_INVALID', '运行授权绑定的模型服务计划缺失。');
      return this.#productionCredentialBinding(parseStoredJson(asString(row.canonical_json), '运行授权绑定的模型服务计划无效。') as NonNullable<BaselineAnalysisProjection['providerResolutionPlan']>);
    }
    return this.#productionCredentialBinding(this.#taskPlanWithRoute(input).provider);
  }

  #taskPlanCall<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof TaskPlanError || error instanceof AnalysisError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  createBaselineAnalysisPreparationWork(
    bookId: string,
    goal: BaselineAnalysisGoal,
    update: BaselineAnalysisUpdateRequest | null,
    launchPolicy: LaunchPolicyProjection,
    reconfirm = false,
    redoOf: string | null = null,
    // 准备计划 on a Task Intent Draft (Issue #423, slice 7a): a new Task Intent holding the draft's sentence.
    intentDraft: DraftPromotion | null = null,
  ): AnalysisPreparationResult<BaselineAnalysisProjection> {
    return this.#baselineProgress(() => this.#baselineAnalysis.prepare({ phase: 'start', bookId, goal, update, reconfirm, launchPolicy, redoOf,
      ...(intentDraft === null ? {} : {
        goal: intentDraft.goal as BaselineAnalysisGoal,
        intentDraft: { ...intentDraft, promoted: (taskIntentId: string) => intentDraft.promoted({ taskIntentId, reviewRunId: null }) },
      }),
    }));
  }

  advanceBaselineAnalysisPreparationWork(workId: string): AnalysisPreparationResult<BaselineAnalysisProjection> {
    return this.#baselineProgress(() => this.#baselineAnalysis.prepare({ phase: 'advance', workId }));
  }

  /** One baseline preparation step, with its projection read as the kind the caller asked for. */
  #baselineProgress(body: () => BaselineAnalysisPreparationResult): AnalysisPreparationResult<BaselineAnalysisProjection> {
    const result = this.#analysisCall(body);
    // The prepared projection carries the quick start ②A offers, as every other read of it does.
    return { ...result, projection: result.projection === null ? null : this.#withQuickStart(result.projection as BaselineAnalysisProjection) };
  }

  cancelBaselineAnalysisPreparationWork(workId: string): boolean {
    this.#analysisCall(() => this.#baselineAnalysis.prepare({ phase: 'cancel', workId }));
    return true;
  }

  /**
   * Records the standard-direct authorization and the Run; the caller hands the Run to the execution owner when
   * dispatch is allowed, which admits it or queues it on the governor (Issue #49, S14; CONC-007).
   */
  authorizeBaselineAnalysis(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    start: 'now' | 'idle' = 'now',
  ): { projection: BaselineAnalysisProjection; dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore } {
    // A 自定义分析维度 Task (Issue #922) is authorized on its own version's ledger, the same ②A Plan → Run Authorization path.
    const ledger = this.#analysisLedgerOfTask(bookId, taskIntentId);
    this.#requireCustomAnalysisStartable(ledger, taskIntentId);
    const authorized = this.#analysisCall(() => ledger.authorize(bookId, taskIntentId, planEnvelopeDigest, start));
    return { projection: authorized.projection as BaselineAnalysisProjection, dispatchRunRecordId: authorized.dispatchRunRecordId, ledger };
  }

  /** ②A's reading of one Task on its own ledger: the Book's baseline Task, or a 自定义分析维度's (Issue #922). */
  inspectAnalysisTask(bookId: string, taskIntentId: string, progress?: ProgressReader): BaselineAnalysisProjection {
    const ledger = this.#analysisLedgerOfTask(bookId, taskIntentId);
    return this.#analysisCall(() => ledger.inspect(bookId, progress)) as unknown as BaselineAnalysisProjection;
  }

  /** A stopped version starts no new Run (ADR 0090 item 4): its prepared Tasks stay readable and keep naming it. */
  #requireCustomAnalysisStartable(ledger: BaselineAnalysisStore, taskIntentId: string): void {
    if (!isCustomAnalysisKindId(ledger.kind)) return;
    const version = customAnalysisOperations.customAnalysisVersionOfTask(this.#customAnalysisHost, taskIntentId);
    requireStore(version !== null && version.state !== 'stopped', 'CUSTOM_ANALYSIS_DIMENSION_STOPPED',
      `这项任务所依据的维度版本${version === null ? '' : `第 ${version.version} 版`}已停用，不能再开始；请在「分析 › 自定义」中按已启用的版本重新运行。`);
  }

  /**
   * 联网后开始任务 (Issue #502; AUTH-004, OFF-005): the Book's baseline Task is authorized exactly as 开始任务 would
   * authorize it, and its Run waits in Connectivity Wait — nothing sent, no usage, nothing begun.
   */
  startBaselineAnalysisWhenOnline(bookId: string, taskIntentId: string, planEnvelopeDigest: string): BaselineAnalysisProjection {
    const ledger = this.#analysisLedgerOfTask(bookId, taskIntentId);
    this.#requireCustomAnalysisStartable(ledger, taskIntentId);
    return this.#analysisCall(() => ledger.authorize(bookId, taskIntentId, planEnvelopeDigest, 'when-online')).projection as BaselineAnalysisProjection;
  }

  /** 取消 while the Book's baseline Run waits (OFF-010): terminal, before any dispatch, without provider work. */
  cancelWaitingBaselineAnalysis(bookId: string, taskIntentId: string): BaselineAnalysisProjection {
    const ledger = this.#analysisLedgerOfTask(bookId, taskIntentId);
    return this.#analysisCall(() => ledger.cancelWaiting(bookId, taskIntentId)) as BaselineAnalysisProjection;
  }

  /**
   * 取消任务 on the Book's started baseline Run (Issue #422; CTRL-004 to CTRL-008): `cancelling` is recorded at once,
   * and the Run the execution owner must stop is named — `null` when the Run was already cancelled and nothing is left
   * to do. The owner stops it at the next unit boundary, or settles it at once when it holds no execution of it.
   */
  requestBaselineAnalysisCancel(bookId: string, taskIntentId: string): string | null {
    this.#assertAvailable();
    const ledger = this.#analysisLedgerOfTask(bookId, taskIntentId);
    return this.#analysisCall(() => ledger.requestCancel(bookId, taskIntentId)).runRecordId;
  }

  /** The existing execution owner receives the actual kind ledger, including frozen contract variants. */
  taskRunLedger(input: Pick<ControlTaskRunInput, 'bookId' | 'kind' | 'ref'>): BaselineAnalysisStore {
    if (input.kind === 'review-run') {
      const tasks = this.#reviewCall(() => this.#reviewRuns.controlTasks(input.bookId, input.ref));
      const active = tasks.find((task) => {
        const projection = this.#analysisCall(() => task.ledger.inspect(input.bookId));
        return projection.taskIntent?.taskIntentId === task.taskIntentId && runIsActive(projection.run?.state ?? null);
      });
      const controlled = active ?? tasks.find((task) => {
        const projection = this.#analysisCall(() => task.ledger.inspect(input.bookId));
        return projection.taskIntent?.taskIntentId === task.taskIntentId && projection.run?.state === 'cancelled';
      });
      requireStore(controlled !== undefined, 'TASK_CONTROL_STALE', '这次审阅没有可控制的类别运行。');
      return controlled.ledger;
    }
    return this.#currentLedgerOf(input.kind, input.bookId, input.ref);
  }

  executionLedgerForRun(runRecordId: string): BaselineAnalysisStore {
    const row = this.#authority.prepare(`SELECT t.book_id, t.task_intent_id, t.kind FROM analysis_run_records r
      JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id WHERE r.run_record_id = ?`).get(runRecordId) as SqlRow | undefined;
    requireStore(row !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const kind = asString(row.kind);
    if (kind === BASELINE_ANALYSIS_KIND) return this.#baselineAnalysis;
    if (isCustomAnalysisKindId(kind)) return this.#analysisLedgerOfTask(asString(row.book_id), asString(row.task_intent_id));
    if (kind === INITIAL_EVALUATION_KIND) return this.#initialLedgerForTask(asString(row.task_intent_id));
    const mapped = kind === READERS_REPORT_KIND ? 'readers-report' : kind === EVALUATION_REWRITE_KIND ? 'evaluation-rewrite'
      : kind === WRITING_KIND ? 'writing' : null;
    if (mapped !== null) {
      const taskIntentId = asString(row.task_intent_id);
      const found = mapped === 'readers-report' ? readersReportOperations.readersReportTaskOf(this.#readersReportHost, taskIntentId)
        : mapped === 'evaluation-rewrite' ? evaluationRewriteOperations.evaluationRewriteTaskOf(this.#evaluationRewriteHost, taskIntentId)
          : writingTaskOperations.internalWritingTaskOf(this.#writingTaskOperationsHost, taskIntentId);
      requireStore(found !== null, 'ANALYSIS_RUN_INVALID', '运行的任务记录不存在。');
      return found.ledger;
    }
    return this.#reviewCall(() => this.#reviewRuns.ledgerForRun(runRecordId));
  }

  /** Restore the existing admission queue, using each committed launch's own contract, without a renderer replay. */
  pendingLaunchedLedgerRuns(): Array<{ runRecordId: string; ledger: BaselineAnalysisStore }> {
    return this.#authority.prepare(`SELECT r.run_record_id, a.canonical_json authorization FROM analysis_run_records r
      JOIN analysis_run_authorizations a USING(authorization_id)
      WHERE (SELECT s.state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1) = 'authorized'
      ORDER BY r.recorded_at, r.rowid`).all().filter(row => typeof JSON.parse(String(row.authorization)).launchSnapshotId === 'string' &&
        !this.#reviewRuns.ownsCategoryRun(String(row.run_record_id))).map(row => {
        const runRecordId = String(row.run_record_id);
        return { runRecordId, ledger: this.executionLedgerForRun(runRecordId) };
      });
  }

  /** Redo prepares the same kind and request through its ordinary, cancellable preparation owner. */
  repeatTaskRequest(bookId: string, source: NonNullable<import('../shared/protocol.js').StartQuickTasksInput['tasks'][number]['repeat']>) {
    if (source.kind === 'review-run') return { kind: source.kind, ...this.#reviewCall(() => this.#reviewRuns.repeatRequest(bookId, source.ref)) };
    const row = this.#authority.prepare(`SELECT r.run_record_id, t.kind FROM analysis_run_records r
      JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id
      WHERE t.book_id = ? AND t.task_intent_id = ? ORDER BY r.rowid DESC LIMIT 1`).get(bookId, source.ref) as SqlRow | undefined;
    requireStore(row !== undefined, 'TASK_REPEAT_UNAVAILABLE', '原任务的运行记录不存在。');
    const expected = source.kind === 'baseline-analysis' ? BASELINE_ANALYSIS_KIND : source.kind === 'writing' ? WRITING_KIND
      : source.kind === 'initial-evaluation' ? INITIAL_EVALUATION_KIND : source.kind === 'readers-report' ? READERS_REPORT_KIND : EVALUATION_REWRITE_KIND;
    requireStore(asString(row.kind) === expected || source.kind === 'baseline-analysis' && isCustomAnalysisKindId(row.kind), 'TASK_REPEAT_UNAVAILABLE', '原任务类型不一致。');
    if (source.kind === 'baseline-analysis') {
      const ledger = this.#analysisLedgerOfTask(bookId, source.ref);
      const facts = ledger.loadExecutionPlan(asString(row.run_record_id));
      const mode = facts.update?.mode;
      const update = mode === 'sync-current' || mode === 'reanalyze-range' || mode === 'reanalyze-book' ? { mode, selectedRange: facts.update!.selectedRange }
        : ledger.inspect(bookId).resultSetRevision === null ? null : { mode: 'reanalyze-book' as const, selectedRange: null };
      return { kind: source.kind, update, customRef: isCustomAnalysisKindId(row.kind) ? source.ref : null };
    }
    const materialIds = this.#evaluationMaterialPlan(source.ref)?.boundary.references.map((entry) => entry.materialId) ?? [];
    if (source.kind === 'initial-evaluation') return { kind: source.kind, materialIds };
    if (source.kind === 'readers-report') {
      const task = this.#readersReportCall(() => this.#readersReports.task(source.ref));
      requireStore(task !== null && task.bookId === bookId, 'TASK_REPEAT_UNAVAILABLE', '原审稿意见任务不存在。');
      return { kind: source.kind, template: task.template, materialIds };
    }
    if (source.kind === 'evaluation-rewrite') {
      const task = this.#evaluationRewriteCall(() => this.#evaluationRewrites.task(source.ref));
      requireStore(task !== null && task.bookId === bookId, 'TASK_REPEAT_UNAVAILABLE', '原评估重写任务不存在。');
      return { kind: source.kind, recordId: task.recordId };
    }
    const task = this.#writingCall(() => this.#writingTasks.task(source.ref));
    requireStore(task !== null && task.bookId === bookId, 'TASK_REPEAT_UNAVAILABLE', '原写作任务不存在。');
    return { kind: source.kind, request: { typeId: task.typeId, audience: task.input.audience, channel: task.input.channel,
      requirements: task.input.requirements, materialIds: task.materials.map((material) => material.source.materialId) } };
  }

  quickTaskRule(bookId: string, ruleId: string) {
    const rule = this.#ruleCall(() => this.#rules.list().find((rule) => (rule.ruleId === ruleId || rule.pattern === ruleId) && rule.bookId === bookId && rule.state === 'active'));
    requireStore(rule !== undefined, 'QUICK_TASK_RULE_UNAVAILABLE', '这条快速开始规则已停用或不属于本书。');
    return rule;
  }

  prepareRepeatedCustomAnalysis(bookId: string, ref: string, update: BaselineAnalysisUpdateRequest | null, policy: LaunchPolicyProjection): BaselineAnalysisProjection {
    const ledger = this.#analysisLedgerOfTask(bookId, ref);
    this.#requireCustomAnalysisStartable(ledger, ref);
    let work = this.#analysisCall(() => ledger.prepare({ phase: 'start', bookId, goal: customAnalysisModeGoal(update?.mode ?? 'first-baseline'), update, reconfirm: false, launchPolicy: policy }));
    while (!work.done) work = this.#analysisCall(() => ledger.prepare({ phase: 'advance', workId: work.workId! }));
    return work.projection as BaselineAnalysisProjection;
  }

  redoTaskRequest(input: Pick<ControlTaskRunInput, 'bookId' | 'kind' | 'ref'>) {
    if (input.kind === 'review-run') return { kind: input.kind, ...this.#reviewCall(() => this.#reviewRuns.redoRequest(input.bookId, input.ref)) };
    const ledger = this.taskRunLedger(input);
    const projection = this.#analysisCall(() => ledger.inspect(input.bookId));
    requireStore(projection.taskIntent?.taskIntentId === input.ref && projection.run !== null &&
      (projection.run.state === 'cancelled' || (projection.run.state === 'interrupted' && projection.taskOutcome?.stop?.reason === 'run-budget-ceiling-reached')) &&
      projection.run.transitions.some((entry) => entry.state === 'executing'), 'ANALYSIS_REDO_STALE', '只有开始后取消的运行可以改计划重做。');
    const redoOf = projection.run.runRecordId;
    const materialIds = ledger.definition.materialReferences?.sources.map((source) => source.materialId) ?? [];
    switch (input.kind) {
      case 'initial-evaluation': return { kind: input.kind, redoOf, materialIds };
      case 'readers-report': return { kind: input.kind, redoOf, materialIds, template: readersReportOperations.latestReadersReport(this.#readersReportHost, input.bookId)!.task.template };
      case 'evaluation-rewrite': return { kind: input.kind, redoOf, recordId: evaluationRewriteOperations.latestEvaluationRewrite(this.#evaluationRewriteHost, input.bookId)!.task.recordId };
      case 'writing': {
        const task = this.#latestWriting(input.bookId)!.task;
        return { kind: input.kind, redoOf, request: { typeId: task.typeId, audience: task.input.audience,
          channel: task.input.channel, requirements: task.input.requirements, materialIds: task.materials.map((material) => material.source.materialId) } };
      }
    }
  }

  requestTaskRunControl(input: ControlTaskRunInput): { runRecordId: string | null; ledger: BaselineAnalysisStore } {
    const ledger = this.taskRunLedger(input);
    const ref = input.kind === 'review-run' ? this.#analysisCall(() => ledger.inspect(input.bookId)).taskIntent!.taskIntentId : input.ref;
    const runRecordId = this.#analysisCall(() => input.action === 'pause'
      ? ledger.requestPause(input.bookId, ref).runRecordId
      : input.action === 'cancel' ? ledger.requestCancel(input.bookId, ref).runRecordId
        : ledger.continuableRun(input.bookId, ref));
    if (input.kind === 'review-run' && input.action === 'cancel') this.#reviewCall(() => this.#reviewRuns.cancelRemaining(input.bookId, input.ref));
    return { runRecordId, ledger };
  }

  editTaskPlan(input: EditTaskPlanInput, progress?: ProgressReader): TaskPlanProjection {
    if (input.kind === 'review-run') {
      const tasks = this.#reviewCall(() => this.#reviewRuns.controlTasks(input.bookId, input.ref));
      const digest = canonicalRecord(tasks.map((task) => ({ categoryId: task.categoryId, digest: task.planEnvelopeDigest }))).digest;
      requireStore(digest === input.planEnvelopeDigest && tasks.length > 0, 'ANALYSIS_PLAN_EDIT_STALE', '计划已经变了；请重新查看计划后再修改。');
      // The Evidence Assurance Level is the 事实核查 Task's alone (Issue #901): only that category's Task is handed it, and a
      // Review Run without one refuses it. An edit of the level alone leaves every other category's plan as it is.
      const { evidenceAssuranceLevel, ...shared } = input;
      const budgetMembers = this.#reviewRuns.planFacts(input.bookId, input.ref).composite === undefined
        ? tasks.filter(task => task.categoryId !== 'run-synthesis').length : 1;
      requireStore(evidenceAssuranceLevel === undefined || tasks.some((task) => task.categoryId === 'factual-review'),
        'ANALYSIS_PLAN_EDIT_INVALID', '只有事实核查任务有证据保证级别。');
      this.#transaction(this.#authority, () => {
        let changed = 0;
        for (const task of tasks) {
          const factual = task.categoryId === 'factual-review';
          try {
            const summaryCeiling = task.categoryId === 'run-synthesis' && shared.runBudgetCeiling != null
              ? { runBudgetCeiling: { ...shared.runBudgetCeiling, maxTotalTokens: shared.runBudgetCeiling.maxTotalTokens * budgetMembers } } : {};
            this.#analysisCall(() => task.ledger.editPlan(input.bookId, { ...shared, ...summaryCeiling, ...(factual && evidenceAssuranceLevel !== undefined ? { evidenceAssuranceLevel } : {}),
              taskIntentId: task.taskIntentId, planEnvelopeDigest: task.planEnvelopeDigest }));
            changed += 1;
          } catch (error) {
            if (evidenceAssuranceLevel !== undefined && error instanceof StoreError && error.code === 'ANALYSIS_PLAN_EDIT_UNCHANGED') continue;
            throw error;
          }
        }
        requireStore(changed > 0, 'ANALYSIS_PLAN_EDIT_UNCHANGED', '计划没有改动。');
      });
      return this.inspectTaskPlan(input, progress);
    }
    const ledger = this.taskRunLedger(input);
    this.#analysisCall(() => ledger.editPlan(input.bookId, { ...input, taskIntentId: input.ref }));
    return this.inspectTaskPlan(input, progress);
  }

  /**
   * 更新计划 (Issue #419, plan slice S73; V2-UX-PLAN-009, PLAN-011): the next plan version of the Book's baseline analysis
   * Task, as the editor left it, and the Book's analysis as it then reads.
   */
  editBaselineAnalysisPlan(
    input: {
      bookId: string;
      taskIntentId: string;
      planEnvelopeDigest: string;
      removedSteps: ReadonlyArray<string>;
      disallowedAdaptations: ReadonlyArray<string>;
      askFirstAdaptations?: ReadonlyArray<string>;
      runBudgetCeiling?: { kind: 'tokens'; maxTotalTokens: number } | null;
    },
    progress?: ProgressReader,
  ): BaselineAnalysisProjection {
    this.#assertAvailable();
    const ledger = this.#analysisLedgerOfTask(input.bookId, input.taskIntentId);
    this.#analysisCall(() => ledger.editPlan(input.bookId, input));
    return this.inspectAnalysisTask(input.bookId, input.taskIntentId, progress);
  }

  /**
   * 提交回答 (Issue #422, plan slice S76d; V2-UX-CLAR-005, CLAR-006): the editor's answer to a question the Book's current
   * baseline Task's Run asked, recorded with who and when; and the Run it belongs to, with the state it was in, so the
   * service can take a Run that waits for it on.
   */
  answerBaselineAnalysisClarification(input: { bookId: string; taskIntentId: string; requestId: string; optionId: string; note: string | null }): {
    runRecordId: string;
    runState: BaselineAnalysisRunState;
  } {
    this.#assertAvailable();
    const ledger = this.clarificationLedger(input.bookId, input.taskIntentId);
    const answered = this.#analysisCall(() => ledger.recordClarificationAnswer(input.bookId, input));
    return { runRecordId: answered.runRecordId, runState: answered.runState };
  }

  /** Resolve the existing Run ledger from its Task, never from a client-selected model or kind. */
  clarificationLedger(bookId: string, taskIntentId: string): BaselineAnalysisStore {
    this.#assertAvailable();
    const row = this.#authority.prepare('SELECT kind FROM analysis_task_intents WHERE book_id = ? AND task_intent_id = ?').get(bookId, taskIntentId) as SqlRow | undefined;
    requireStore(row !== undefined, 'ANALYSIS_CLARIFICATION_STALE', '这个问题不是这本书当前任务提的。');
    const kind = asString(row.kind);
    if (kind === BASELINE_ANALYSIS_KIND) return this.#baselineAnalysis;
    if (isCustomAnalysisKindId(kind)) return this.#analysisLedgerOfTask(bookId, taskIntentId);
    if (kind === FACTUAL_REVIEW_KIND) return this.#factualReview;
    if (isReviewCategoryKindId(kind)) {
      const entry = reviewCategoryEntry(kind.slice(kind.indexOf('/') + 1));
      requireStore(entry !== null, 'ANALYSIS_CLARIFICATION_STALE', '这个审阅类别已经变化。');
      return reviewOperations.reviewLedgerOf(this.#reviewOperationsHost, entry, undefined, undefined, bookId);
    }
    const surface = unconfirmedSurfaceOf(kind);
    requireStore(surface === 'initial-evaluation' || surface === 'readers-report' || surface === 'evaluation-rewrite' || surface === 'writing',
      'ANALYSIS_CLARIFICATION_STALE', '这个任务种类不能回答模型问题。');
    return this.#currentLedgerOf(surface, bookId, taskIntentId);
  }

  /** Waiting model questions survive restart; this read supplies the existing service timer, not a new scheduler. */
  modelClarificationRuns(): Array<{ bookId: string; taskIntentId: string; runRecordId: string; ledger: BaselineAnalysisStore }> {
    const rows = this.#authority.prepare(`SELECT DISTINCT i.book_id, i.task_intent_id, q.run_record_id
      FROM analysis_clarification_requests q JOIN analysis_task_intents i ON i.task_intent_id =
        (SELECT task_intent_id FROM analysis_run_records WHERE run_record_id = q.run_record_id)
      WHERE q.model_question_json IS NOT NULL AND
        (SELECT state FROM analysis_run_states s WHERE s.run_record_id = q.run_record_id ORDER BY sequence DESC LIMIT 1) = 'awaiting-clarification'`).all() as SqlRow[];
    // A Run whose ledger no longer resolves is left to its own surface; the others still time out and continue.
    return rows.flatMap((row) => {
      try {
        return [{ bookId: asString(row.book_id), taskIntentId: asString(row.task_intent_id), runRecordId: asString(row.run_record_id),
          ledger: this.clarificationLedger(asString(row.book_id), asString(row.task_intent_id)) }];
      } catch (error) {
        if (!(error instanceof StoreError)) throw error;
        return [];
      }
    });
  }

  clarificationPlanTarget(bookId: string, taskIntentId: string): InspectTaskPlanInput {
    const ledger = this.clarificationLedger(bookId, taskIntentId);
    const kind = unconfirmedSurfaceOf(ledger.kind)!;
    if (kind !== 'review-run') return { bookId, kind, ref: taskIntentId };
    const row = this.#authority.prepare(`SELECT rr.review_run_id FROM review_runs rr
      JOIN json_each(rr.canonical_json, '$.categories') c ON json_extract(c.value, '$.task.taskIntentId') = ? WHERE rr.book_id = ?`).get(taskIntentId, bookId) as SqlRow | undefined;
    requireStore(row !== undefined, 'ANALYSIS_CLARIFICATION_STALE', '这个审阅任务已经变化。');
    return { bookId, kind, ref: asString(row.review_run_id) };
  }

  /**
   * 暂停 on the Book's baseline Run (Issue #422, S76b; CTRL-001): `pausing` is recorded at once and the Run the execution
   * owner must stop at the next unit boundary is named — `null` when it is already paused or left 可续行.
   */
  requestBaselineAnalysisPause(bookId: string, taskIntentId: string): string | null {
    this.#assertAvailable();
    const ledger = this.#analysisLedgerOfTask(bookId, taskIntentId);
    return this.#analysisCall(() => ledger.requestPause(bookId, taskIntentId)).runRecordId;
  }

  /** The Book's paused or 可续行 baseline Run, which 续行 would continue (CONT-015). */
  continuableBaselineAnalysisRun(bookId: string, taskIntentId: string): string {
    this.#assertAvailable();
    const ledger = this.#analysisLedgerOfTask(bookId, taskIntentId);
    return this.#analysisCall(() => ledger.continuableRun(bookId, taskIntentId));
  }

  /**
   * Startup reconciliation (CONT-014): the baseline Runs a stopped service left under way are settled `paused` or
   * `resumable`; the ones left cancelling are named for the execution owner to finish.
   */
  reconcileStoppedBaselineAnalysisRuns(): { settled: number; cancelling: ReadonlyArray<string> } {
    this.#assertAvailable();
    return this.#analysisCall(() => this.#baselineAnalysis.reconcileStoppedRuns());
  }

  cancellingLedgerRuns(): string[] {
    return (this.#authority.prepare(`SELECT r.run_record_id FROM analysis_run_records r JOIN analysis_task_intents t
      ON t.task_intent_id = r.task_intent_id WHERE t.kind <> ? AND (SELECT s.state FROM analysis_run_states s
      WHERE s.run_record_id = r.run_record_id ORDER BY s.sequence DESC LIMIT 1) = 'cancelling'`).all(BASELINE_ANALYSIS_KIND) as SqlRow[])
      .map((row) => asString(row.run_record_id));
  }

  finishCancelledReviewRun(runRecordId: string): void {
    return reviewOperations.finishCancelledReviewRun(this.#reviewOperationsHost, runRecordId);
  }

  /** Reconcile stranded Runs to their kept continuation points; queued starts still require an explicit new start. */
  reconcileStoppedInitialEvaluationRuns(): { settled: number } {
    this.#assertAvailable();
    return { settled: this.#analysisCall(() => this.#initialEvaluation.reconcileStoppedRuns()).settled };
  }

  /** Reconcile stranded Runs to their kept continuation points; queued starts still require an explicit new start. */
  reconcileStoppedFactualReviewRuns(): { settled: number } {
    this.#assertAvailable();
    const result = this.#analysisCall(() =>
      this.#factualReview.reconcileStoppedRuns({ leaveAuthorized: (runRecordId) => this.#reviewRuns.ownsCategoryRun(runRecordId) }));
    for (const reviewRunId of this.#reviewCall(() => this.#reviewRuns.retainStoppedFactualRuns())) {
      try { this.materializeFactualVerification(reviewRunId); } catch { /* one Run never stops startup; the next open records what is still missing */ }
    }
    return { settled: result.settled };
  }

  /** Reconcile stranded Runs to their kept continuation points; queued starts still require an explicit new start. */
  reconcileStoppedReviewCategoryRuns(): { settled: number } {
    return reviewOperations.reconcileStoppedReviewCategoryRuns(this.#reviewOperationsHost);
  }

  /** Exact recorded ranges for a live Run's cancellation disclosure; no stopped-Run authority is inferred. */
  #liveCancellationRanges(projection: BaselineAnalysisProjection, ledger: BaselineAnalysisStore): BaselineCancellationRanges | null {
    const run = projection.run;
    if (run === null || run.progress === null) return null;
    const inFlight = new Set(run.progress.stage !== 'units' ? [] : run.progress.inFlightUnits?.map((unit) => unit.unitOrdinal) ??
      (run.progress.currentUnitOrdinal === null ? [] : [run.progress.currentUnitOrdinal]));
    return this.#analysisCall(() => {
      const checkpoints = ledger.unitCheckpoints(run.runRecordId);
      const settled = new Set(checkpoints.map((checkpoint) => checkpoint.unit.unitOrdinal));
      return {
        // An answered range already in flight is being continued, not waiting to be continued.
        waiting: ledger.clarificationsOf(run.runRecordId)
          .filter((request) => !settled.has(request.unitOrdinal) && !inFlight.has(request.unitOrdinal))
          .map((request) => ({ unitOrdinal: request.unitOrdinal, answered: request.answer !== null })),
        unconfirmed: checkpoints.filter((checkpoint) => checkpoint.unit.closed.state === 'gap' && checkpoint.unit.closed.gap.code === 'outcome-unknown')
          .map((checkpoint) => checkpoint.unit.unitOrdinal),
      };
    });
  }

  /**
   * What the drawer reads of the Task's Run when nothing executes it — paused, left 可续行, or left under way when AI7
   * closed: what it kept; for a stopped one, why 续行 cannot go on as authorized, if not; and — read by the execution
   * owner — whether this launch can still carry it under the binding it persisted.
   */
  #baselineStoppedRun(projection: BaselineAnalysisProjection, carriesStoppedRun: (runRecordId: string) => boolean,
    ledger: BaselineAnalysisStore = this.#baselineAnalysis): BaselineStoppedRunFacts | null {
    const run = projection.run;
    if (run === null || run.progress !== null) return null;
    const stopped = run.state === 'paused' || run.state === 'resumable' || run.state === 'awaiting-clarification';
    const unheld = run.state === 'admitted' || run.state === 'executing' || run.state === 'cancelling' || run.state === 'pausing';
    if (!stopped && !unheld) return null;
    const unitsTotal = projection.update === null ? (projection.coverageManifest?.units.length ?? 0) : projection.update.reusePlan?.counts.recomputed ?? 0;
    const bindingHolds = carriesStoppedRun(run.runRecordId);
    return this.#analysisCall(() => {
      let unitsSettled: number | null;
      let unitsClosed: number | null;
      let waiting: Array<{ unitOrdinal: number; answered: boolean }> = [];
      try {
        const checkpoints = ledger.unitCheckpoints(run.runRecordId);
        unitsSettled = checkpoints.length;
        unitsClosed = checkpoints.filter((checkpoint) => checkpoint.unit.closed.state === 'closed').length;
        // The units that asked the editor and have not settled since (Issue #422, S76d).
        const settled = new Set(checkpoints.map((checkpoint) => checkpoint.unit.unitOrdinal));
        waiting = ledger.clarificationsOf(run.runRecordId)
          .filter((request) => !settled.has(request.unitOrdinal))
          .map((request) => ({ unitOrdinal: request.unitOrdinal, answered: request.answer !== null }));
      } catch {
        // Its kept progress no longer reads back: 续行 names that, and a cancellation forms no revision from it.
        unitsSettled = null;
        unitsClosed = null;
      }
      const blockers = stopped ? [...ledger.continuationBlockers(run.runRecordId), ...(bindingHolds ? [] : [RESUME_BLOCKED_BINDING])] : [];
      // 模型服务账户限额 (Issue #51, S16b): the stop the provider's limit made, which 续行 takes on once it clears.
      const accountLimit = run.state === 'resumable' ? ledger.accountLimitOf(run.runRecordId) : null;
      // 结果待确认 (Issue #51, S16c): the ranges whose sent requests' results cannot be known — held by any stopped Run, and
      // whether the Run stopped there itself, which it never goes on from.
      const unconfirmed = stopped ? ledger.unconfirmedRangesOf(run.runRecordId) : [];
      const outcomeUnknown = unconfirmed.length === 0 ? null
        : { units: unconfirmed, stopped: run.state === 'resumable' && ledger.outcomeUnknownOf(run.runRecordId) !== null };
      return {
        unitsSettled, unitsClosed, unitsTotal, blockers, bindingHolds, waiting, accountLimit, outcomeUnknown,
        ...(run.stopReason === undefined ? {} : { stopReason: run.stopReason }),
        ...(run.stopReason === undefined || run.resumedAt === undefined ? {} : { stopAt: run.resumedAt }),
      };
    });
  }

  /** The baseline Runs waiting in Connectivity Wait — the route Book's, or every Book's — oldest first. */
  waitingBaselineAnalysisRuns(bookId: string | null): Array<{ bookId: string; taskIntentId: string; runRecordId: string }> {
    this.#assertAvailable();
    return this.#analysisCall(() => this.#baselineAnalysis.waitingRuns())
      .filter((run) => bookId === null || run.bookId === bookId)
      .map((run) => ({ bookId: run.bookId, taskIntentId: run.taskIntentId, runRecordId: run.runRecordId }));
  }

  /** Reconnect Preflight's local half for one waiting Run: the labels of the material inputs that moved, or none. */
  baselineAnalysisPreflightDrift(runRecordId: string): ReadonlyArray<string> {
    this.#assertAvailable();
    return this.#analysisCall(() => this.executionLedgerForRun(runRecordId).preflightDrift(runRecordId));
  }

  /** A waiting Run that can never dispatch as authorized is blocked with its reasons (OFF-008). */
  blockWaitingBaselineAnalysisRun(runRecordId: string, reasons: ReadonlyArray<string>, cause: WaitingRunBlockCause): void {
    this.#assertAvailable();
    this.#analysisCall(() => this.#baselineAnalysis.blockWaitingRun(runRecordId, reasons, cause));
  }

  /** Whether this Run still waits in Connectivity Wait: Reconnect Preflight re-reads it before it acts. */
  baselineAnalysisRunWaits(runRecordId: string): boolean {
    this.#assertAvailable();
    return this.#analysisCall(() => this.#baselineAnalysis.currentRunState(runRecordId)) === 'awaiting-connectivity';
  }

  // ---- 空闲时处理 for every kind (Issue #1089, F-17a; ADR 0095 §3) -------------------------------------------

  /**
   * 空闲时处理 (ADR 0095 §3): exactly the Run Authorization 开始任务 records, marked to start when idle — a ledger Task's Run
   * Record, or a Review Run's one approval. Nothing is sent and no place is taken until the application is quiet.
   */
  startTaskWhenIdle(input: import('../shared/protocol.js').ServiceOperationMap['startTaskWhenIdle']['input']): { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore } | null {
    this.#assertAvailable();
    if (input.kind === 'review-run') {
      this.#reviewCall(() => this.#reviewRuns.recordAuthorization(input.bookId, input.ref, input.planDigests, 'idle'));
      return null;
    }
    requireStore(input.planEnvelopeDigest !== null && input.planDigests.length === 0, 'TASK_PLAN_INVALID', '任务计划请求无效。');
    const digest = input.planEnvelopeDigest;
    switch (input.kind) {
      case 'baseline-analysis': return this.authorizeBaselineAnalysis(input.bookId, input.ref, digest, 'idle');
      case 'initial-evaluation': return this.authorizeInitialEvaluation(input.bookId, input.ref, digest, 'idle');
      case 'readers-report': return this.authorizeReadersReport(input.bookId, input.ref, digest, 'idle');
      case 'evaluation-rewrite': return this.authorizeEvaluationRewrite(input.bookId, input.ref, digest, 'idle');
      case 'writing': return this.authorizeWriting(input.bookId, input.ref, digest, 'idle');
    }
  }

  /** A Review Run approved 「空闲时处理」 begins at the first quiet, after the same preflight 联网后开始任务 makes (OFF-008). */
  admitIdleReview(reviewRunId: string, drive: () => void): void {
    return reviewOperations.admitIdleReview(this.#reviewOperationsHost, reviewRunId, drive);
  }

  // ---- 联网后开始任务 for every kind (Issue #760, plan slice S74c) ----------------------------------------------

  /**
   * 联网后开始任务 of a Task of any other kind with a plan (Issue #760, S74c; AUTH-004, OFF-005): exactly the Run Authorization
   * its 开始任务 records — a ledger Task's Run Record, after every check its own start makes, or a Review Run's one approval —
   * and the Run then waits in Connectivity Wait. Nothing is sent, no usage arises and no place is taken; Reconnect Preflight
   * starts it as 开始任务 would. A repeat answers as the first did.
   */
  startTaskWhenOnline(input: StartTaskWhenOnlineInput): void {
    this.#assertAvailable();
    if (input.kind === 'review-run') {
      this.#reviewCall(() => this.#reviewRuns.recordAuthorization(input.bookId, input.ref, input.planDigests, 'when-online'));
      return;
    }
    const digest = input.planEnvelopeDigest;
    requireStore(digest !== null && input.planDigests.length === 0, 'TASK_PLAN_INVALID', '任务计划请求无效。');
    switch (input.kind) {
      case 'initial-evaluation':
        this.authorizeInitialEvaluation(input.bookId, input.ref, digest, 'when-online');
        return;
      case 'readers-report':
        this.authorizeReadersReport(input.bookId, input.ref, digest, 'when-online');
        return;
      case 'evaluation-rewrite':
        this.authorizeEvaluationRewrite(input.bookId, input.ref, digest, 'when-online');
        return;
      case 'writing':
        this.authorizeWriting(input.bookId, input.ref, digest, 'when-online');
        return;
    }
  }

  /**
   * 取消 while the Task's Run waits (Issue #760; OFF-010) — in Connectivity Wait, or on the governor for a place: terminal, before
   * any dispatch and without provider work. Answers the Run the governor must let go of, when it waited there for a place.
   */
  cancelWaitingTask(input: CancelWaitingTaskInput): { dequeue: string | null } {
    this.#assertAvailable();
    if (input.kind === 'review-run') {
      return { dequeue: this.#reviewCall(() => this.#reviewRuns.cancelWaiting(input.bookId, input.ref)) };
    }
    // Never through the kind's start checks (Issue #760 review, P2-1): a Run whose version, 范例 or 资料库 item moved while it
    // waited is exactly one the editor must be able to cancel, offline too (OFF-010).
    const ledger = this.#currentLedgerOf(input.kind, input.bookId, input.ref);
    const before = this.#analysisCall(() => ledger.inspect(input.bookId)).run;
    this.#analysisCall(() => ledger.cancelWaiting(input.bookId, input.ref));
    return { dequeue: before !== null && before.state === 'authorized' ? before.runRecordId : null };
  }

  /**
   * Every Run waiting in Connectivity Wait — the route Book's, or every Book's — of every kind, oldest authorization first: the
   * baseline's, each ledger kind's, and each Review Run approved to start once online.
   */
  waitingTaskRuns(bookId: string | null): WaitingTaskRun[] {
    this.#assertAvailable();
    const runs: WaitingTaskRun[] = [];
    const ofLedger = (kind: WaitingTaskRun['kind'], ledger: BaselineAnalysisStore | null): void => {
      if (ledger === null) return;
      for (const run of this.#analysisCall(() => ledger.waitingRuns())) {
        runs.push({ kind, bookId: run.bookId, ref: run.taskIntentId, runRecordId: run.runRecordId, at: run.recordedAt });
      }
    };
    ofLedger('baseline-analysis', this.#baselineAnalysis);
    // A custom dimension uses the same drawer/Connectivity Wait path, on the contract its own Task froze.
    const customKinds = this.#authority.prepare(`SELECT t.task_intent_id FROM analysis_task_intents t
      WHERE t.kind GLOB 'custom-analysis/*' AND t.rowid =
        (SELECT max(latest.rowid) FROM analysis_task_intents latest WHERE latest.kind = t.kind)`).all() as SqlRow[];
    for (const row of customKinds) {
      const version = customAnalysisOperations.customAnalysisVersionOfTask(this.#customAnalysisHost, asString(row.task_intent_id));
      if (version !== null) ofLedger('baseline-analysis', this.customAnalysisLedger(customAnalysisOperations.customAnalysisDefinition(this.#customAnalysisHost, version)));
    }
    // A kind whose records no longer read is said where its own surface reads it: it never keeps another kind's Run waiting.
    for (const kind of ['initial-evaluation', 'readers-report', 'evaluation-rewrite', 'writing'] as const) {
      try {
        ofLedger(kind, kind === 'initial-evaluation' ? this.#initialEvaluation : this.#anyLedgerOfKind(kind));
      } catch (error) {
        if (!(error instanceof StoreError)) throw error;
      }
    }
    for (const run of this.#reviewCall(() => this.#reviewRuns.waitingRuns())) {
      runs.push({ kind: 'review-run', bookId: run.bookId, ref: run.reviewRunId, runRecordId: run.reviewRunId, at: run.authorizedAt });
    }
    return runs.filter((run) => bookId === null || run.bookId === bookId).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }

  /** Whether the Run still waits: Reconnect Preflight re-reads it before it acts — the editor may have cancelled it meanwhile. */
  taskRunWaits(run: WaitingTaskRun): boolean {
    this.#assertAvailable();
    if (run.kind === 'review-run') return this.#reviewCall(() => this.#reviewRuns.runWaits(run.ref));
    // The Run states are one relation for every ledger kind: any ledger reads one by its Run Record.
    return this.#analysisCall(() => this.#baselineAnalysis.currentRunState(run.runRecordId)) === 'awaiting-connectivity';
  }

  /**
   * Reconnect Preflight's local half for one waiting Run of any kind (OFF-007, OFF-008): the labels of what the authorization
   * bound that moved — the ledger plan's material inputs, and what the kind's own start checks (the version a rewrite read, a
   * writing Task's 范例 and 资料库 items, the Task still the Book's current one); none while it all stands. This launch's scope
   * is admission's to refuse, in its own words.
   */
  taskPreflightDrift(run: WaitingTaskRun): ReadonlyArray<string> {
    this.#assertAvailable();
    if (run.kind === 'review-run') return this.#reviewCall(() => this.#reviewRuns.preflightDrift(run.ref));
    if (run.kind === 'baseline-analysis') return this.baselineAnalysisPreflightDrift(run.runRecordId);
    let ledger: BaselineAnalysisStore;
    try {
      ledger = this.#ledgerTaskOf(run.kind, run.bookId, run.ref);
    } catch (error) {
      if (!(error instanceof StoreError)) throw error;
      return [WAITING_TASK_MOVED_LABELS[error.code] ?? WAITING_TASK_MOVED_FALLBACK];
    }
    return this.#analysisCall(() => ledger.preflightDrift(run.runRecordId));
  }

  /** A waiting Run that can never start as authorized is blocked with its reasons, whatever its kind (OFF-008). */
  blockWaitingTaskRun(run: WaitingTaskRun, reasons: ReadonlyArray<string>, cause: WaitingRunBlockCause): void {
    this.#assertAvailable();
    if (run.kind === 'review-run') {
      this.#reviewCall(() => this.#reviewRuns.blockWaiting(run.ref, reasons, cause));
      return;
    }
    // The Run states are one relation for every ledger kind: the baseline ledger records the block of any kind's Run.
    this.#analysisCall(() => this.#baselineAnalysis.blockWaitingRun(run.runRecordId, reasons, cause));
  }

  /**
   * What Reconnect Preflight hands a waiting ledger Run to the execution owner on (Issue #760): this launch's scope for the kind
   * checked again — a refusal blocks the Run with its words — and the ledger of its Task's contract.
   */
  waitingRunLedger(run: WaitingTaskRun & { kind: Exclude<WaitingTaskRun['kind'], 'review-run'> }): BaselineAnalysisStore {
    this.#assertAvailable();
    if (run.kind === 'baseline-analysis') return this.#analysisLedgerOfTask(run.bookId, run.ref);
    this.#requireLedgerKindScope(run.kind, run.bookId, run.ref);
    return this.#ledgerTaskOf(run.kind, run.bookId, run.ref);
  }

  /** Reconnect Preflight starts a waiting Review Run (Issue #760): `drive` hands it to the drive loop, which may take it now. */
  admitWaitingReviewRun(reviewRunId: string, drive: () => void): void {
    return reviewOperations.admitWaitingReviewRun(this.#reviewOperationsHost, reviewRunId, drive);
  }

  /**
   * This launch's scope for a ledger kind (Issue #760, S74c): 开始任务, 联网后开始任务 and Reconnect Preflight's admission refuse a
   * kind no policy of this launch sends, in that kind's own words. A writing plan that lists 资料库 items is refused in its own
   * words first (Issue #428).
   */
  #requireLedgerKindScope(kind: LedgerTaskKind, bookId: string, taskIntentId: string): void {
    switch (kind) {
      case 'initial-evaluation':
        this.#requireEvaluationMaterialScope(this.#evaluationMaterialPlan(taskIntentId) !== null, INITIAL_EVALUATION_KIND);
        this.#requireInitialEvaluationScope();
        return;
      case 'readers-report':
        this.#requireEvaluationMaterialScope(this.#evaluationMaterialPlan(taskIntentId) !== null, READERS_REPORT_KIND);
        readersReportOperations.requireReadersReportScope(this.#readersReportHost);
        return;
      case 'evaluation-rewrite':
        evaluationRewriteOperations.requireEvaluationRewriteScope(this.#evaluationRewriteHost);
        return;
      case 'writing':
        this.#assertAvailable();
        if (this.#baselineAnalysis.launch.live !== null) {
          const listed = this.#latestWriting(bookId);
          this.#requireWritingMaterialScope(listed !== null && listed.task.taskIntentId === taskIntentId && listed.task.materials.length > 0);
        }
        this.#requireWritingScope();
        return;
    }
  }

  /**
   * The ledger of a ledger Task of `kind` that 开始任务 and 联网后开始任务 may authorize, and Reconnect Preflight admit (Issue #760):
   * the Book's current Task of the kind, and — for a rewrite — the version it read still as it read it, or — for a writing Task —
   * its 范例 and 资料库 items still giving what its plan pinned. Each refusal is the kind's own, as its 开始任务 always said it.
   */
  #ledgerTaskOf(kind: LedgerTaskKind, bookId: string, taskIntentId: string): BaselineAnalysisStore {
    this.#assertAvailable();
    switch (kind) {
      case 'initial-evaluation': {
        // The ledger itself refuses a Task that is not the Book's current one, as its authorization always did.
        const ledger = this.initialEvaluationLedgerForBook(bookId);
        this.#requireEvaluationMaterialReadings(ledger, bookId);
        return ledger;
      }
      case 'readers-report': {
        const latest = readersReportOperations.latestReadersReport(this.#readersReportHost, bookId);
        requireStore(latest !== null && latest.task.taskIntentId === taskIntentId, 'TASK_PLAN_NOT_CURRENT', TASK_PLAN_NOT_CURRENT_REASON);
        this.#requireEvaluationMaterialReadings(latest.ledger, bookId);
        return latest.ledger;
      }
      case 'evaluation-rewrite': {
        const latest = evaluationRewriteOperations.latestEvaluationRewrite(this.#evaluationRewriteHost, bookId);
        requireStore(latest !== null && latest.task.taskIntentId === taskIntentId, 'TASK_PLAN_NOT_CURRENT', TASK_PLAN_NOT_CURRENT_REASON);
        // The version may have moved since the plan was prepared — saved again, or 定稿 — while the drawer stayed open: a Run then
        // would only write words that can never be 采用 (S81b2 review). Refused here, before any Run is spent.
        const version = this.#evaluationCall(() => this.#evaluations.rewritable(bookId, latest.task.recordId));
        const refusal = evaluationRewriteRefusal(version);
        requireStore(refusal === null, 'EVALUATION_REWRITE_UNAVAILABLE', refusal ?? '');
        requireStore(version.entryOrdinal === latest.task.entryOrdinal && version.entrySha256 === latest.task.entrySha256, 'EVALUATION_REWRITE_STALE',
          '这一版在准备重写之后又保存过：这份计划依据的是之前的分数；请按现在的评分重新准备重写。');
        return latest.ledger;
      }
      case 'writing': {
        const latest = this.#latestWriting(bookId);
        requireStore(latest !== null && latest.task.taskIntentId === taskIntentId, 'TASK_PLAN_NOT_CURRENT', TASK_PLAN_NOT_CURRENT_REASON);
        // A Task whose exemplar no longer gives the text it pinned is never run on other words (#688 re-review).
        requireStore(latest.task.exemplarsReadable, 'WRITING_EXEMPLAR_MOVED', WRITING_EXEMPLAR_MOVED);
        // …nor one whose 资料库 item no longer reads at the build its plan pinned (Issue #428): the Run is not started, and the words
        // say 改计划重做 — a plan prepared again in 交付物 pins the item as it is now.
        const moved = latest.task.materials.find((material) => material.refusal !== null)?.refusal ?? null;
        if (moved !== null) throw new StoreError(moved.code, moved.message);
        return latest.ledger;
      }
    }
  }

  /**
   * 待我处理's and the 任务 panel's reading of every other ledger kind (Issue #760, S74c): each Book's latest Task of the kind whose
   * Run waits to start once online, or was blocked because its plan moved meanwhile.
   */
  #waitingTaskAttention(bookId: string | null, limit: number, progress?: ProgressReader): WaitingTaskAttentionReading[] {
    const readings: WaitingTaskAttentionReading[] = [];
    // A kind whose records no longer read is said where its own surface reads it, never by taking 待我处理 down with it.
    for (const kind of ['initial-evaluation', 'readers-report', 'evaluation-rewrite', 'writing'] as const) {
      try {
        const ledger = kind === 'initial-evaluation' ? this.#initialEvaluation : this.#anyLedgerOfKind(kind);
        if (ledger === null) continue;
        for (const reading of this.#analysisCall(() => ledger.waitingAttentionReadings(bookId, limit))) readings.push({ kind, ...reading, ...launchedRunModelLabels(this.#authority, reading.runRecordId) });
        const controls = this.#analysisCall(() => ledger.attentionReadings(progress ?? (() => null), '', limit,
          bookId === null ? null : { bookId, cancelled: false })).tasks;
        for (const control of controls) {
          const run = control.run;
          if (run === null || !runIsActive(run.state) || run.state === 'awaiting-connectivity') continue;
          readings.push({ kind, bookId: control.bookId, bookTitle: control.bookTitle, taskIntentId: control.taskIntentId,
            runRecordId: run.runRecordId, state: run.state, stateAt: run.stateAt, control });
        }
      } catch (error) {
        if (!(error instanceof StoreError)) throw error;
      }
    }
    const questions = this.#authority.prepare(`SELECT DISTINCT q.run_record_id, q.raised_at, i.book_id, i.task_intent_id, i.kind, b.title
      FROM analysis_clarification_requests q JOIN analysis_run_records r ON r.run_record_id = q.run_record_id
      JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id JOIN books b ON b.book_id = i.book_id
      LEFT JOIN analysis_clarification_answers a ON a.request_id = q.request_id
      WHERE q.model_question_json IS NOT NULL AND a.answer_id IS NULL AND i.kind <> 'editorial-review/run-synthesis' AND i.kind <> ? AND (? IS NULL OR i.book_id = ?)
      AND (SELECT state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY sequence DESC LIMIT 1)
        IN ('admitted','executing','pausing','paused','resumable','awaiting-clarification') LIMIT ?`).all(BASELINE_ANALYSIS_KIND, bookId, bookId, limit) as SqlRow[];
    // A Task the control readings above already carry shows its open question there, as the baseline's does (#870).
    const seen = new Set<string>(readings.map((reading) => reading.taskIntentId));
    for (const row of questions) {
      const taskIntentId = asString(row.task_intent_id);
      if (seen.has(taskIntentId)) continue;
      seen.add(taskIntentId);
      // As above: a Task whose records no longer read is said on its own surface, never by taking 待我处理 down with it.
      try {
        const target = this.clarificationPlanTarget(asString(row.book_id), taskIntentId);
        if (target.kind === 'fixed-task' || target.kind === 'baseline-analysis') continue;
        const reviewOrdinal = target.kind === 'review-run' ? this.#reviewCall(() => this.#reviewRuns.planFacts(asString(row.book_id), target.ref!)).ordinal : null;
        readings.push({ ...launchedRunModelLabels(this.#authority, asString(row.run_record_id)), kind: target.kind, bookId: asString(row.book_id), bookTitle: asString(row.title), taskIntentId,
          ...(reviewOrdinal === null ? {} : { reviewOrdinal }),
          ref: target.ref!, runRecordId: asString(row.run_record_id), state: 'clarification', stateAt: asString(row.raised_at) });
      } catch (error) {
        if (!(error instanceof StoreError)) throw error;
      }
    }
    return readings;
  }

  /**
   * The ledger of the Book's current Task of a ledger kind, with none of the checks its start makes (Issue #760 review, P2-1):
   * what 取消 reads a waiting or queued Run through, whatever moved since it was authorized.
   */
  #currentLedgerOf(kind: LedgerTaskKind, bookId: string, taskIntentId: string): BaselineAnalysisStore {
    this.#assertAvailable();
    // The ledger itself refuses a 初评 that is not the Book's current Task, as its cancellation always did.
    if (kind === 'initial-evaluation') return this.initialEvaluationLedgerForBook(bookId);
    const latest = kind === 'readers-report' ? readersReportOperations.latestReadersReport(this.#readersReportHost, bookId)
      : kind === 'evaluation-rewrite' ? evaluationRewriteOperations.latestEvaluationRewrite(this.#evaluationRewriteHost, bookId) : this.#latestWriting(bookId);
    requireStore(latest !== null && latest.task.taskIntentId === taskIntentId, 'TASK_PLAN_NOT_CURRENT', TASK_PLAN_NOT_CURRENT_REASON);
    return latest.ledger;
  }

  /** One ledger of a kind whose Tasks each run on the ledger of their own contract: any of them reads the kind's Run states. */
  #anyLedgerOfKind(kind: 'readers-report' | 'evaluation-rewrite' | 'writing'): BaselineAnalysisStore | null {
    switch (kind) {
      case 'readers-report': {
        const any = this.#readersReportCall(() => this.#readersReports.anyTask());
        return any === null ? null : this.readersReportLedger(any.input);
      }
      case 'evaluation-rewrite': {
        const any = this.#evaluationRewriteCall(() => this.#evaluationRewrites.anyTask());
        return any === null ? null : evaluationRewriteOperations.evaluationRewriteLedger(this.#evaluationRewriteHost, any.input);
      }
      case 'writing': {
        const any = this.#writingCall(() => this.#writingTasks.anyTask());
        return any === null ? null : this.#writingLedgerOf(any);
      }
    }
  }

  // ---- 默认执行规则 and 快速开始 (Issue #421, plan slice S75) ---------------------------------------------------

  /**
   * ②A's quick start of each update mode (TASK-017, TASK-019): offered only while the Book has a rule for the mode in
   * force, this launch may use one, the mode itself can start, and what the rule binds is what the Book's durable
   * state reads now. Anything else is shown, disabled, with its reason; a rule never widens what a Run may do.
   */
  #withQuickStart(projection: BaselineAnalysisProjection): BaselineAnalysisProjection {
    const controls = projection.updateControls;
    if (controls === null) return projection;
    const quick = <T extends BaselineAnalysisUpdateActionProjection>(mode: BaselineAnalysisUpdateMode, action: T): T =>
      ({ ...action, quickStart: this.#quickStartOf(projection.bookId, mode, action) });
    return {
      ...projection,
      updateControls: {
        ...controls,
        actions: {
          'sync-current': quick('sync-current', controls.actions['sync-current']),
          'reanalyze-range': quick('reanalyze-range', controls.actions['reanalyze-range']),
          'reanalyze-book': quick('reanalyze-book', controls.actions['reanalyze-book']),
        },
      },
    };
  }

  #quickStartOf(bookId: string, mode: BaselineAnalysisUpdateMode, action: BaselineAnalysisUpdateActionProjection): BaselineAnalysisQuickStartProjection {
    if (!isDefaultExecutionRulePattern(mode)) return { available: false, reason: QUICK_START_RANGE_REASON, rule: null };
    const rule = this.#ruleCall(() => this.#rules.activeFor(bookId, mode));
    if (rule === null) return { available: false, reason: quickStartNoRuleReason(mode), rule: null };
    const reference = defaultExecutionRuleReference(rule, rule.version);
    if (this.#baselineAnalysis.launch.live !== null) return { available: false, reason: QUICK_START_DEVELOPER_LIVE, rule: reference };
    if (!action.available) return { available: false, reason: action.unavailableReason ?? QUICK_START_MODE_UNAVAILABLE, rule: reference };
    let drift: ReadonlyArray<string>;
    try {
      drift = defaultExecutionRuleDrift(rule.version.binding, this.#baselineAnalysis.currentRuleFacts(bookId, mode));
    } catch (error) {
      if (error instanceof AnalysisError) return { available: false, reason: error.message, rule: reference };
      throw error;
    }
    if (drift.length > 0) return { available: false, reason: ruleDriftReason(reference.name, drift), rule: reference };
    return { available: true, reason: null, rule: reference };
  }

  /**
   * The drawer's `设为快速开始默认…` for the Book's baseline plan (AUTH-009, TASK-019), and the rule its Task was
   * started under, when 快速开始 started it. A rule comes only from a plan of a whole-Book update whose key content
   * has not changed, and never under developer-live.
   */
  #baselineDefaultRule(projection: BaselineAnalysisProjection): TaskPlanDefaultRuleProjection {
    const intent = projection.taskIntent;
    const envelope = projection.planEnvelope;
    const version = projection.planVersion;
    if (intent === null || envelope === null || version === null) return noDefaultRule(QUICK_START_NOT_READY);
    const startedBy = this.#ruleStartedBy(projection.bookId, 'baseline-analysis', projection.authorization);
    const pattern = intent.mode;
    if (!isDefaultExecutionRulePattern(pattern)) {
      return { ...noDefaultRule(pattern === 'first-baseline' ? SET_RULE_FIRST_BASELINE : SET_RULE_RANGE), startedBy };
    }
    return this.#ruleOffer(projection.bookId, pattern, { planEnvelope: envelope, planVersion: version, planRevision: projection.planRevision }, null, startedBy);
  }

  /** The rule version 快速开始 started a Task under, read from its authorization; `null` for a Task started from its plan. */
  #ruleStartedBy(
    bookId: string,
    kind: DefaultExecutionRuleRecord['taskKind'],
    authorization: BaselineAnalysisProjection['authorization'],
    /** For a writing Task, its house type's pattern: the rule a Task names is its own type's (#701 re-review P3-4). */
    pattern: DefaultExecutionRulePattern | null = null,
  ): DefaultExecutionRuleReference | null {
    if (authorization === null || authorization.origin !== 'default-execution-rule' || authorization.ruleVersionId === null) return null;
    const ruleVersionId = authorization.ruleVersionId;
    const found = this.#ruleCall(() => this.#rules.version(ruleVersionId));
    // The rule a Task names is its own Book's, of its own kind and — for a writing Task — of its own house type.
    requireStore(found !== null && found.rule.bookId === bookId && found.rule.taskKind === kind && (pattern === null || found.rule.pattern === pattern),
      'ANALYSIS_RECORD_INVALID', '运行授权指向的默认执行规则不存在。');
    return defaultExecutionRuleReference(found.rule, found.version);
  }

  /**
   * `设为快速开始默认…` on one frozen plan of a pattern a rule may cover (AUTH-009, TASK-019), shared by the baseline's whole-Book
   * updates and the writing Task (S84b): the Book's rule of the pattern named beside it, and why the plan cannot set it — the
   * kind's own reason first, then developer-live, a changed plan, the editor's ceiling or edits, or that it set the rule in force.
   */
  #ruleOffer(
    bookId: string,
    pattern: DefaultExecutionRulePattern,
    plan: {
      planEnvelope: NonNullable<BaselineAnalysisProjection['planEnvelope']>;
      planVersion: NonNullable<BaselineAnalysisProjection['planVersion']>;
      planRevision: BaselineAnalysisProjection['planRevision'];
    },
    kindReason: string | null,
    startedBy: DefaultExecutionRuleReference | null,
  ): TaskPlanDefaultRuleProjection {
    const envelope = plan.planEnvelope;
    const version = plan.planVersion;
    const rule = this.#ruleCall(() => this.#rules.forPattern(bookId, pattern));
    const current = rule === null ? null : {
      ...defaultExecutionRuleReference(rule, rule.version),
      state: rule.state,
      fromThisPlan: rule.version.sourcePlanEnvelopeDigest === envelope.digest,
    };
    const reason = kindReason !== null
      ? kindReason
      // #810: an admitted writing plan may set its own rule; other live kinds keep the existing refusal.
      : envelope.providerStatus === 'remote-eligible-ordinary-production'
        ? SET_RULE_ORDINARY_PRODUCTION
      : envelope.providerStatus === 'remote-eligible-developer-live' && !(defaultExecutionRuleKind(pattern) === 'writing' && !this.#writingLiveUnavailable())
        ? SET_RULE_DEVELOPER_LIVE
        : plan.planRevision !== null
          ? SET_RULE_CHANGED
          : version.edits.runBudgetCeiling !== undefined
            ? SET_RULE_BUDGET
            : version.edits.removedSteps.length > 0 || version.edits.disallowedAdaptations.length > 0 || (version.edits.askFirstAdaptations ?? []).length > 0
              ? SET_RULE_EDITED
            : current !== null && current.state === 'active' && current.fromThisPlan ? setRuleAlreadyReason(current.name) : null;
    return {
      canSet: reason === null,
      reason,
      planEnvelopeDigest: reason === null ? envelope.digest : null,
      current,
      binds: defaultRuleBindingRows(defaultExecutionRuleBindingOf(version.materialInputs), DEFAULT_EXECUTION_RULE_PROCEDURES[defaultExecutionRuleKind(pattern)],
        defaultExecutionRuleCovers(pattern)),
      startedBy,
    };
  }

  /**
   * `设为快速开始默认…` (AUTH-009, TASK-019): the plan on show — which must still be the Book's current plan, unchanged —
   * sets the Book's rule for its pattern, or the rule's next version. The standard authorization never does.
   */
  setDefaultExecutionRule(bookId: string, taskIntentId: string, planEnvelopeDigest: string): DefaultExecutionRuleProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest),
      'DEFAULT_EXECUTION_RULE_INVALID', '默认执行规则的参数无效。');
    if (this.#authority.prepare('SELECT 1 FROM review_runs WHERE review_run_id = ? AND book_id = ?').get(taskIntentId, bookId) !== undefined) {
      const facts = reviewOperations.reviewRuleFacts(this.#reviewOperationsHost, bookId, taskIntentId);
      const offer = reviewOperations.reviewDefaultRule(this.#reviewOperationsHost, bookId, taskIntentId);
      requireStore(facts.digest === planEnvelopeDigest && (offer.canSet || offer.current?.fromThisPlan === true),
        'DEFAULT_EXECUTION_RULE_UNAVAILABLE', offer.reason ?? SET_RULE_CHANGED);
      requireStore(facts.binding !== null && facts.tasks[0] !== undefined, 'DEFAULT_EXECUTION_RULE_UNAVAILABLE', '没有可设为默认的审阅计划。');
      return this.#ruleProjection(this.#ruleCall(() => this.#rules.set({ bookId, pattern: facts.pattern,
        sourceTaskIntentId: facts.tasks[0]!.taskIntentId, sourcePlanEnvelopeDigest: facts.digest, binding: facts.binding! })));
    }
    // The plan on show is a writing Task's (S84b) when its Task is of that kind; every other plan is the baseline's, as before.
    const intentKind = this.#authority.prepare('SELECT kind FROM analysis_task_intents WHERE task_intent_id = ? AND book_id = ?')
      .get(taskIntentId, bookId) as SqlRow | undefined;
    if (intentKind?.kind === WRITING_KIND) return this.#setWritingDefaultRule(bookId, taskIntentId, planEnvelopeDigest);
    const projection = this.#analysisCall(() => this.#baselineAnalysis.inspect(bookId)) as BaselineAnalysisProjection;
    const intent = projection.taskIntent;
    const version = projection.planVersion;
    requireStore(intent !== null && intent.taskIntentId === taskIntentId && projection.planEnvelope?.digest === planEnvelopeDigest && version !== null,
      'DEFAULT_EXECUTION_RULE_STALE', '这份计划已经变化；请重新打开计划后再设为快速开始默认。');
    const offer = this.#baselineDefaultRule(projection);
    const pattern = intent.mode;
    // The plan that set the rule in force, set again, answers with the rule as it is.
    if (offer.current !== null && offer.current.state === 'active' && offer.current.fromThisPlan && isDefaultExecutionRulePattern(pattern)) {
      const same = this.#ruleCall(() => this.#rules.activeFor(bookId, pattern));
      if (same !== null) return this.#ruleProjection(same);
    }
    requireStore(offer.canSet && isDefaultExecutionRulePattern(pattern), 'DEFAULT_EXECUTION_RULE_UNAVAILABLE', offer.reason ?? SET_RULE_RANGE);
    const record = this.#ruleCall(() => this.#rules.set({
      bookId,
      pattern,
      sourceTaskIntentId: taskIntentId,
      sourcePlanEnvelopeDigest: planEnvelopeDigest,
      binding: defaultExecutionRuleBindingOf(version.materialInputs),
    }));
    return this.#ruleProjection(record);
  }

  /** 知识库 › 工序与规则: every rule of every Book, and the page's statement that a rule starts nothing by itself. */
  inspectDefaultExecutionRules(): DefaultExecutionRulesProjection {
    this.#assertAvailable();
    const rules = this.#ruleCall(() => this.#rules.list()).map((record) => this.#ruleProjection(record));
    return { rules, statement: DEFAULT_EXECUTION_RULES_STATEMENT };
  }


  async quickStartReviewRun(input: { bookId: string; reviewRunId: string; planEnvelopeDigest: string; ruleVersionId: string },
    runtime: { credentialReadiness: (binding?: ConfiguredProviderBinding | null) => Promise<'present' | 'missing' | null>; connectivity: TaskPlanConnectivity },
    progress?: ProgressReader): Promise<{ outcome: 'started' | 'fell-back'; reasons: string[]; dispatch: boolean }> {
    return reviewOperations.quickStartReviewRun(this.#reviewOperationsHost, input, runtime, progress);
  }

  /** 停用 (S75 D7): the rule stays on record with every version, and quick start stops using it. */
  deactivateDefaultExecutionRule(ruleId: string): DefaultExecutionRuleProjection {
    this.#assertAvailable();
    return this.#ruleProjection(this.#ruleCall(() => this.#rules.deactivate(ruleId)));
  }

  /**
   * 快速开始 (TASK-017, TASK-020, TASK-026): the Task the caller has just prepared exactly as 先看计划 prepares it is
   * started exactly as 开始任务 would start it, its authorization naming the rule version the editor started under.
   * Whatever would make the start differ from the rule — the rule changed or was turned off, the plan's key content
   * or what the rule binds moved, developer-live, the model service not connected, no network, a busy slot — leaves
   * the Task at its plan with the reason, and nothing is recorded. The one wait comes first, so every check after it
   * and the authorization read the same state.
   */
  async quickStartBaselineAnalysis(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    ruleVersionId: string,
    runtime: { credentialReadiness: (binding?: ConfiguredProviderBinding | null) => Promise<'present' | 'missing' | null>; connectivity: TaskPlanConnectivity },
  ): Promise<{ outcome: 'started' | 'fell-back'; reasons: ReadonlyArray<string>; dispatchRunRecordId: string | null }> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest) && UUID_PATTERN.test(ruleVersionId),
      'QUICK_START_INVALID', '快速开始的参数无效。');
    const plan = await this.inspectTaskPlanWithConnection({ bookId, kind: 'baseline-analysis', ref: taskIntentId }, runtime.credentialReadiness, runtime.connectivity);
    const projection = this.#analysisCall(() => this.#baselineAnalysis.inspect(bookId)) as BaselineAnalysisProjection;
    const intent = projection.taskIntent;
    const envelope = projection.planEnvelope;
    const version = projection.planVersion;
    requireStore(intent !== null && intent.taskIntentId === taskIntentId && envelope?.digest === planEnvelopeDigest && version !== null,
      'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
    requireStore(isDefaultExecutionRulePattern(intent.mode), 'QUICK_START_INVALID', '这项任务没有快速开始。');
    if (projection.authorization !== null) {
      // The same quick start made twice answers as the first did; a Task started any other way is not started again.
      requireStore(projection.authorization.origin === 'default-execution-rule' && projection.authorization.ruleVersionId === ruleVersionId,
        'ANALYSIS_AUTHORIZATION_STALE', '这项任务已经开始了。');
      return { outcome: 'started', reasons: [], dispatchRunRecordId: null };
    }
    const fellBack = (reason: string) => ({ outcome: 'fell-back' as const, reasons: [reason], dispatchRunRecordId: null });
    const rule = this.#ruleCall(() => this.#rules.activeFor(bookId, intent.mode as DefaultExecutionRulePattern));
    if (rule === null || rule.version.ruleVersionId !== ruleVersionId) return fellBack(QUICK_START_RULE_CHANGED);
    if (this.#baselineAnalysis.launch.live !== null) return fellBack(QUICK_START_DEVELOPER_LIVE);
    if (projection.planRevision !== null) return fellBack(QUICK_START_PLAN_CHANGED);
    const drift = defaultExecutionRuleDrift(rule.version.binding, version.materialInputs);
    if (drift.length > 0) return fellBack(ruleDriftReason(defaultExecutionRuleReference(rule, rule.version).name, drift));
    // 结果待确认 (Issue #51, S16c; CONT-011): a Task that sends again a range whose earlier result could not be known is started
    // only from its plan, where the editor has read that it will.
    if (plan.resend !== null) return fellBack(QUICK_START_RESEND);
    switch (plan.start.readiness) {
      case 'ready':
      case 'no-route':
        break;
      case 'needs-connection':
        return fellBack(QUICK_START_NEEDS_CONNECTION);
      case 'offline':
        return fellBack(QUICK_START_OFFLINE);
      default:
        return fellBack(QUICK_START_NOT_READY);
    }
    const authorized = this.#analysisCall(() => this.#baselineAnalysis.authorize(bookId, taskIntentId, planEnvelopeDigest, 'now',
      { kind: 'default-execution-rule', ruleVersionId }));
    return { outcome: 'started', reasons: [], dispatchRunRecordId: authorized.dispatchRunRecordId };
  }

  #ruleProjection(record: DefaultExecutionRuleRecord): DefaultExecutionRuleProjection {
    const book = this.#authority.prepare('SELECT title FROM books WHERE book_id = ?').get(record.bookId) as SqlRow | undefined;
    requireStore(book !== undefined, 'DEFAULT_EXECUTION_RULE_RECORD_INVALID', '默认执行规则所属的图书不存在。');
    return {
      ...defaultExecutionRuleReference(record, record.version),
      bookId: record.bookId,
      bookTitle: asString(book.title),
      taskKind: record.taskKind,
      pattern: record.pattern,
      state: record.state,
      stateLabel: RULE_STATE_LABELS[record.state],
      does: defaultExecutionRuleDoes(record.pattern),
      binds: defaultRuleBindingRows(record.version.binding, DEFAULT_EXECUTION_RULE_PROCEDURES[record.taskKind], defaultExecutionRuleCovers(record.pattern)),
      setBy: '本机编辑',
      setAt: record.version.createdAt,
      stateRecordedAt: record.stateRecordedAt,
      sourceTaskIntentId: record.version.sourceTaskIntentId,
      sourcePlanEnvelopeDigest: record.version.sourcePlanEnvelopeDigest,
      binding: record.version.binding,
    };
  }

  // ---- 后台分析登记 (Issue #95, plan slice S39; ADR 0048; V2-UX-ANALYSIS-016 to 021) ------------------------------------

  /**
   * ②A's 后台分析: the Book's Enrollment, what it would do now and why, the Runs it started, the dispatcher's latest look at the
   * Book, and `登记…`'s disclosure — everything the Enrollment would bind, read from the Book's own facts, before the editor
   * chooses where it starts. Reading writes nothing. A damaged record is said as damaged, and stops only this Book.
   *
   * Issue #864: the disclosure offers this Book alone, each Series it is in and every Book of the house, each scope's Books in the
   * order its ceiling is shared in, and the ceiling is the editor's to set — required. A Series or all-Books Enrollment names the
   * Books of its scope the dispatcher's latest look skipped, and why.
   */
  inspectBackgroundAnalysisEnrollment(bookId: string, runtime: BackgroundAnalysisRuntime, kind: string = BACKGROUND_ANALYSIS_KIND): BackgroundAnalysisEnrollmentProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId), 'BACKGROUND_ANALYSIS_ENROLLMENT_INVALID', '后台分析登记的参数无效。');
    const book = this.#authority.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId) as SqlRow | undefined;
    requireStore(book !== undefined, 'BACKGROUND_ANALYSIS_ENROLLMENT_INVALID', '这本书不存在。');
    const title = asString(book.title);
    const read = backgroundEnrollments.enrollmentRead(this.#backgroundEnrollmentHost, bookId, kind);
    const record = read === 'damaged' ? null : read;
    const state = read === 'damaged' ? 'damaged' : record === null ? 'none' : record.state === 'active' && record.paused ? 'paused' : record.state;
    const next = this.#analysisCall(() => kind === BACKGROUND_ANALYSIS_KIND ? this.#backgroundDecision(bookId, read, runtime) : { kind: 'none' as const,
      reason: kind === 'factual-recheck' ? '空闲时按最新的要求补充证据决定复核一条冻结断言；未决结果不会自动重新排队。'
        : kind === 'material-index' ? '空闲时在本机为这本书可参考的资料建立相似索引，从上次停下的段落接着建；你回来编辑时让开。'
        : '登记已保留；相应工序接入后台处理后，才会按登记开始。' });
    const binding = backgroundEnrollments.enrollmentBinding(this.#backgroundEnrollmentHost, bookId, kind);
    const nextOrdinal = record === null ? 1 : record.version.ordinal + 1;
    const reason = state === 'damaged'
      ? BACKGROUND_RECORD_DAMAGED
      : state === 'active' || state === 'paused'
        ? '这本书已经登记了这类后台处理；要改，请先撤销登记再重新登记。'
        : !backgroundEnrollments.backgroundKindEnrollable(this.#backgroundEnrollmentHost, kind)
          ? BACKGROUND_ENROLL_NO_RULE
          : !runtime.routeExecutable
            ? BACKGROUND_ENROLL_NO_ROUTE
            : executionBackgroundShare(this.#baselineAnalysis.launch.policy, runtime.capacity) < 1
              ? BACKGROUND_ENROLL_NO_SHARE
              : binding === null ? BACKGROUND_FACTS_UNREADABLE : null;
    const scope = backgroundScopeLabel('book', title, 1);
    const scopes = backgroundEnrollments.backgroundScopeOffers(this.#backgroundEnrollmentHost, bookId, title);
    const when = backgroundAnalysisWhen(runtime.quietMs);
    const notGranted = kind === BACKGROUND_ANALYSIS_KIND ? BACKGROUND_ANALYSIS_NOT_GRANTED : [
      '不改动稿件，不采纳或应用任何建议，不导出或发布',
      '不扩大登记的种类、范围、模型绑定或发送内容',
      '登记本身不启动尚未接入的工序，也不授权其他后台工作',
      '不超过登记的预算上限，每次派发前检查；达到上限后停止',
    ];
    const kinds = backgroundEnrollments.backgroundKindOffers(this.#backgroundEnrollmentHost);
    const kindLabel = kinds.find((entry) => entry.kind === kind)?.label ?? kind;
    const procedure = kind === BACKGROUND_ANALYSIS_KIND ? DEFAULT_EXECUTION_RULE_PROCEDURES['baseline-analysis'] : kindLabel;
    const what = kind === BACKGROUND_ANALYSIS_KIND ? BACKGROUND_ANALYSIS_WHAT : `${kindLabel}：只按这类工序的计划处理；每次派发仍需精确计划、模型绑定与运行授权。`;
    // The ceiling is the editor's to set at 登记, never the Book's own setting (Issue #864).
    const binds = binding === null ? [] : defaultRuleBindingRows(binding, procedure)
      .map((row) => (row.label === '预算上限' ? { label: row.label, value: BACKGROUND_CEILING_REQUIRED } : row));
    const startingPoints = (['prospective', 'backfill'] as const).map((value) => ({
      value, label: BACKGROUND_STARTING_POINT_LABELS[value], note: BACKGROUND_STARTING_POINT_NOTES[value],
    }));
    // The digest of exactly what the disclosure shows: a `登记` that names another is refused as stale.
    const disclosureDigest = reason !== null ? null : sha256(canonicalJson({
      schema: 'ai7.background-analysis-enrollment.disclosure/3', bookId, kind, ordinal: nextOrdinal, scope, scopes, what, when,
      binding: { ...binding, runBudgetCeiling: 'required' }, startingPoints, notGranted, ceilingRule: BACKGROUND_CEILING_RULE,
    }));
    // The ten newest Runs the Enrollment started, and how many there are (#713 review, P3-5).
    const startedRows = this.#authority.prepare(
      `SELECT a.task_intent_id, a.authorized_at, a.canonical_json, t.mode FROM analysis_run_authorizations a
       JOIN analysis_task_intents t ON t.task_intent_id = a.task_intent_id
       WHERE t.book_id = ? AND a.origin = 'background-analysis-enrollment' AND t.kind = ?
       ORDER BY a.authorized_at DESC, a.rowid DESC LIMIT ?`,
    ).all(bookId, kind === BACKGROUND_ANALYSIS_KIND ? BASELINE_ANALYSIS_KIND : kind, BACKGROUND_ANALYSIS_LISTED) as SqlRow[];
    const startedRunCount = asNumber((this.#authority.prepare(
      `SELECT count(*) n FROM analysis_run_authorizations a JOIN analysis_task_intents t ON t.task_intent_id = a.task_intent_id
       WHERE t.book_id = ? AND a.origin = 'background-analysis-enrollment' AND t.kind = ?`,
    ).get(bookId, kind === BACKGROUND_ANALYSIS_KIND ? BASELINE_ANALYSIS_KIND : kind) as SqlRow).n);
    const startedRuns = startedRows.map((row) => {
      const authorization = JSON.parse(asString(row.canonical_json)) as { enrollmentVersionId?: unknown };
      const versionId = typeof authorization.enrollmentVersionId === 'string' ? authorization.enrollmentVersionId : null;
      // A Book merged in from another house keeps naming a version this house never held: it reads without an ordinal.
      let ordinal: number | null = null;
      if (versionId !== null && read !== 'damaged') {
        const found = this.#enrollmentCall(() => this.#enrollments.version(versionId));
        ordinal = found !== null && found.enrollment.bookId === bookId ? found.version.ordinal : null;
      }
      const mode = asString(row.mode);
      return {
        taskIntentId: asString(row.task_intent_id),
        modeLabel: (BASELINE_ANALYSIS_MODE_LABELS as Readonly<Record<string, string>>)[mode] ?? mode,
        enrollmentOrdinal: ordinal,
        authorizedAt: asString(row.authorized_at),
      };
    });
    const history = read === 'damaged'
      ? { entries: [], count: 0 }
      : this.#enrollmentCall(() => this.#enrollments.history(bookId, BACKGROUND_ANALYSIS_LISTED, kind));
    const look = this.#backgroundLooks.get(bookId) ?? null;
    const notStarted = this.#backgroundNotStarted.get(bookId) ?? null;
    const enrolledScope = record === null ? null : backgroundEnrollments.enrollmentScopeOf(this.#backgroundEnrollmentHost, record.version.scope, bookId, title);
    return {
      bookId, kind, kinds,
      bookTitle: title,
      state,
      stateLabel: BACKGROUND_STATE_LABELS[state],
      statement: BACKGROUND_ANALYSIS_STATEMENT,
      enrollment: record === null || enrolledScope === null ? null : {
        enrollmentId: record.enrollmentId,
        enrollmentVersionId: record.version.enrollmentVersionId,
        ordinal: record.version.ordinal,
        name: backgroundEnrollmentName(record.version.ordinal),
        startingPoint: record.version.startingPoint,
        startingPointLabel: BACKGROUND_STARTING_POINT_LABELS[record.version.startingPoint],
        enrolledBy: '本机编辑',
        enrolledAt: record.version.createdAt,
        stateRecordedAt: record.stateRecordedAt,
        binds: defaultRuleBindingRows(record.version.binding, procedure),
        ceilingTokens: record.version.ceiling?.maxTotalTokens ?? null,
        shareTokens: record.version.share?.maxTotalTokens ?? null,
        scope: enrolledScope,
      },
      history: history.entries.map((entry) => {
        const shown = entry.state === 'active' && entry.paused ? 'paused' : entry.state;
        return { state: shown, stateLabel: BACKGROUND_STATE_LABELS[shown], ordinal: entry.ordinal, recordedAt: entry.recordedAt };
      }),
      historyCount: history.count,
      skipped: record === null || record.state !== 'active' || enrolledScope === null || record.version.scope.kind === 'book' ? [] : enrolledScope.books.flatMap((member) => {
        // The dispatcher's latest look found nothing to do there: the Book's working text has nothing new for its analysis.
        const memberLook = this.#backgroundLooks.get(member.bookId);
        return memberLook?.kind === 'none' ? [{ bookId: member.bookId, title: member.title, reason: memberLook.reason }] : [];
      }),
      next: { kind: next.kind, reason: next.reason },
      lastLook: look,
      lastNotStarted: notStarted,
      startedRuns,
      startedRunCount,
      offer: {
        canEnroll: reason === null,
        reason,
        disclosureDigest,
        scope,
        scopes,
        what,
        when,
        binds,
        startingPoints,
        notGranted,
        ceilingRule: BACKGROUND_CEILING_RULE,
      },
      hold: { canPause: state === 'active', canResume: state === 'paused' },
      revoke: { canRevoke: state === 'active' || state === 'paused' || state === 'suspended', consequences: BACKGROUND_REVOKE_CONSEQUENCES },
    };
  }

  /** What the 后台分析登记 operations in background-analysis-enrollments.ts reach of the store (Issue #1172), read live. */
  readonly #backgroundEnrollmentHost: backgroundEnrollments.BackgroundEnrollmentStoreHost = this.#backgroundEnrollmentHostOf();

  #backgroundEnrollmentHostOf(): backgroundEnrollments.BackgroundEnrollmentStoreHost {
    const store = this;
    return {
      analysisCall: this.#analysisCall.bind(this),
      assertAvailable: this.#assertAvailable.bind(this),
      get authority() { return store.#authority; },
      backgroundDecision: this.#backgroundDecision.bind(this),
      get backgroundLooks() { return store.#backgroundLooks; },
      get backgroundNotStarted() { return store.#backgroundNotStarted; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      baselineProgress: this.#baselineProgress.bind(this),
      enrollmentCall: this.#enrollmentCall.bind(this),
      get enrollments() { return store.#enrollments; },
      get inspectBackgroundAnalysisEnrollment() { return store.inspectBackgroundAnalysisEnrollment.bind(store); },
      get series() { return store.#series; },
      seriesCall: this.#seriesCall.bind(this),
      transaction: this.#transaction.bind(this),
    };
  }

  enrollBackgroundAnalysis(
    bookId: string,
    disclosureDigest: string,
    startingPoint: BackgroundAnalysisStartingPoint,
    scope: { kind: BackgroundAnalysisScopeKind; seriesId: string | null },
    ceilingTokens: number,
    runtime: BackgroundAnalysisRuntime,
    kind: string = BACKGROUND_ANALYSIS_KIND,): BackgroundAnalysisEnrollmentProjection {
    return backgroundEnrollments.enrollBackgroundAnalysis(this.#backgroundEnrollmentHost, bookId, disclosureDigest, startingPoint, scope, ceilingTokens, runtime, kind);
  }

  revokeBackgroundAnalysisEnrollment(bookId: string, enrollmentId: string, runtime: BackgroundAnalysisRuntime): BackgroundAnalysisEnrollmentProjection {
    return backgroundEnrollments.revokeBackgroundAnalysisEnrollment(this.#backgroundEnrollmentHost, bookId, enrollmentId, runtime);
  }

  holdBackgroundAnalysisEnrollment(bookId: string, enrollmentId: string, hold: 'pause' | 'resume', runtime: BackgroundAnalysisRuntime): BackgroundAnalysisEnrollmentProjection {
    return backgroundEnrollments.holdBackgroundAnalysisEnrollment(this.#backgroundEnrollmentHost, bookId, enrollmentId, hold, runtime);
  }

  backgroundIdleFacts(runtime: BackgroundAnalysisRuntime): { sinceLastEditMs: number | null; editorJobRunning: boolean; idle: boolean } {
    return backgroundEnrollments.backgroundIdleFacts(this.#backgroundEnrollmentHost, runtime);
  }

  backgroundAnalysisBooks(): ReadonlyArray<string> { return backgroundEnrollments.backgroundAnalysisBooks(this.#backgroundEnrollmentHost); }

  backgroundAnalysisDecisionFor(bookId: string, runtime: BackgroundAnalysisRuntime): { decision: BackgroundAnalysisDecision; enrollmentVersionId: string | null } {
    return backgroundEnrollments.backgroundAnalysisDecisionFor(this.#backgroundEnrollmentHost, bookId, runtime);
  }

  createBackgroundBaselineAnalysisPreparationWork(
    bookId: string,
    mode: 'first-baseline' | 'sync-current',
    enrollmentVersionId: string,
    launchPolicy: LaunchPolicyProjection,): AnalysisPreparationResult<BaselineAnalysisProjection> {
    return backgroundEnrollments.createBackgroundBaselineAnalysisPreparationWork(this.#backgroundEnrollmentHost, bookId, mode, enrollmentVersionId, launchPolicy);
  }

  /**
   * Whether the dispatcher's preparation may take its next step (#713 review, P2-2, P2-3): asked before every step, so the step
   * that freezes the plan and the start that follows it in the same turn are never taken once the Enrollment was revoked, paused
   * or changed, the local data is to be replaced, the editor began any work, the manuscript was edited, what the Enrollment binds
   * moved, this launch's policy no longer admits it, or no place is left for it. Answers why not, or `null`.
   */
  backgroundMayContinue(bookId: string, enrollmentVersionId: string, workId: string | null, runtime: BackgroundAnalysisRuntime): string | null {
    this.#assertAvailable();
    const read = backgroundEnrollments.enrollmentRead(this.#backgroundEnrollmentHost, bookId);
    if (read === 'damaged') return BACKGROUND_RECORD_DAMAGED;
    if (read === null || read.state !== 'active' || read.version.enrollmentVersionId !== enrollmentVersionId) return BACKGROUND_REVOKED;
    if (read.paused) return BACKGROUND_PAUSED;
    if (read.version.share === null) return BACKGROUND_NO_CEILING;
    if (!backgroundEnrollments.backgroundRuleAdmits(this.#backgroundEnrollmentHost)) return BACKGROUND_NO_RULE;
    if (!runtime.routeExecutable) return BACKGROUND_NO_ROUTE;
    if (this.replacementFrozen()) return BACKGROUND_REPLACEMENT_WAITING;
    if (this.#baselineAnalysis.preparationInFlightBesides(bookId, workId)) return BACKGROUND_PREPARATION_IN_FLIGHT;
    if (runtime.editorWorkBusy) return BACKGROUND_EDITOR_JOB;
    const point = this.#analysisCall(() => this.#baselineAnalysis.workingPointOf(bookId));
    if (this.#boundedCall(() => this.#boundedAuthority.branchUnderRecovery(point.branchId))) return BACKGROUND_RECOVERY_PENDING;
    if (!this.backgroundIdleFacts(runtime).idle) return backgroundQuietReason(runtime.quietMs);
    if (!runtime.placeFree) return BACKGROUND_PLACE_BUSY;
    const share = executionBackgroundShare(this.#baselineAnalysis.launch.policy, runtime.capacity);
    if (backgroundEnrollments.backgroundRunningCount(this.#backgroundEnrollmentHost) >= share) return backgroundShareFullReason(share);
    try {
      const drift = backgroundEnrollmentDrift(read.version.binding, this.#baselineAnalysis.currentRuleFacts(bookId, 'first-baseline'));
      if (drift.length > 0) return backgroundDriftReason(drift);
    } catch (error) {
      if (error instanceof AnalysisError) return BACKGROUND_FACTS_UNREADABLE;
      throw error;
    }
    return null;
  }

  startEnrolledBaselineAnalysis(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    enrollmentVersionId: string,
    mode: 'first-baseline' | 'sync-current',
    runtime: BackgroundAnalysisRuntime,): { dispatchRunRecordId: string | null; reason: string | null } {
    return backgroundEnrollments.startEnrolledBaselineAnalysis(this.#backgroundEnrollmentHost, bookId, taskIntentId, planEnvelopeDigest, enrollmentVersionId, mode, runtime);
  }

  noteBackgroundNotStarted(bookId: string, reason: string, now: number): void {
    return backgroundEnrollments.noteBackgroundNotStarted(this.#backgroundEnrollmentHost, bookId, reason, now);
  }

  /**
   * After the local data was replaced or rolled back (the Commander's ruling on #713, P3-1): every Enrollment the restored data
   * holds in force — paused or not — comes up suspended (待你确认), starting nothing until the editor confirms it again. A merge
   * brings none.
   */
  #suspendRestoredEnrollments(): void {
    this.#enrollmentCall(() => this.#enrollments.suspendActive());
  }

  /**
   * Every fact the decision weighs, read from the Book's records and this launch only when the decision reaches it
   * (`backgroundAnalysisDecisionOf`), each at most once: the dispatcher's look and ②A's answer are the same function, and a Book
   * with nothing to do costs no projection — none is ever built here (#713 re-review, P3-2, P3-3).
   */
  #backgroundDecision(bookId: string, read: BackgroundAnalysisEnrollmentRecord | null | 'damaged', runtime: BackgroundAnalysisRuntime): BackgroundAnalysisDecision {
    const once = <T>(fact: () => T): (() => T) => {
      let known: { value: T } | null = null;
      return () => (known ??= { value: fact() }).value;
    };
    const record = read === 'damaged' ? null : read;
    const point = once(() => this.#baselineAnalysis.workingPointOf(bookId));
    const latestTask = once(() => this.#baselineAnalysis.latestTaskFactsOf(bookId));
    return backgroundAnalysisDecisionOf({
      enrollment: () => (read === 'damaged' ? 'damaged' : read?.state ?? null),
      paused: () => record!.paused,
      ceiling: () => record!.version.share !== null,
      ruleAdmits: () => backgroundEnrollments.backgroundRuleAdmits(this.#backgroundEnrollmentHost),
      routeExecutable: () => runtime.routeExecutable,
      replacementWaiting: () => this.replacementFrozen(),
      share: () => executionBackgroundShare(this.#baselineAnalysis.launch.policy, runtime.capacity),
      recoveryPending: () => this.#boundedCall(() => this.#boundedAuthority.branchUnderRecovery(point().branchId)),
      drift: once(() => {
        try {
          return backgroundEnrollmentDrift(record!.version.binding, this.#baselineAnalysis.currentRuleFacts(bookId, 'first-baseline'));
        } catch (error) {
          if (error instanceof AnalysisError || error instanceof StoreError) return null;
          throw error;
        }
      }),
      preparationInFlight: () => this.#baselineAnalysis.preparationInFlight(bookId) ||
        this.#boundedCall(() => this.#boundedAuthority.checkpointWorkInFlight(point().branchId)),
      editorJobRunning: () => runtime.editorWorkBusy,
      analysis: once(() => this.#baselineAnalysis.analysisFreshnessOf(bookId)),
      taskUnfinished: () => {
        const task = latestTask();
        if (task === null) return null;
        if (runIsActive(task.runState)) return 'run';
        // A plan the dispatcher left unstarted is the Enrollment's, never waited on as the editor's.
        return task.planned && !task.authorized && !task.preparedByEnrollment ? 'prepared' : null;
      },
      changedSinceEditorTask: () => {
        const editorTask = this.#baselineAnalysis.latestEditorTaskOf(bookId);
        if (editorTask === null) return true;
        const at = point();
        return editorTask.checkpointDigest !== null
          ? editorTask.checkpointDigest !== at.workingDigest
          : at.lastEditAt !== null && at.lastEditAt > editorTask.createdAt;
      },
      startingPoint: () => record!.version.startingPoint,
      movedSinceEnrollment: () => point().workingDigest !== record!.version.enrolledAt.workingDigest,
      // Whoever's it was: the latest Task read exactly this text and the analysis is still not current with it (P2-4).
      // 结果待确认 (Issue #51, S16c): the latest revision holds ranges whose request was sent and whose result is unknown.
      unconfirmedPending: () => this.#baselineAnalysis.latestUnconfirmedRangesOf(bookId).length > 0,
      attemptedAtThisText: () => {
        const task = latestTask();
        return task !== null && task.checkpointDigest !== null && task.checkpointDigest === point().workingDigest;
      },
      sinceLastEditMs: () => {
        return this.backgroundIdleFacts(runtime).sinceLastEditMs;
      },
      quietMs: () => runtime.quietMs,
      placeFree: () => runtime.placeFree,
      backgroundRunning: () => backgroundEnrollments.backgroundRunningCount(this.#backgroundEnrollmentHost),
    });
  }

  #enrollmentCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof BackgroundAnalysisEnrollmentError) throw new StoreError(error.code, error.message);
      if (error instanceof AnalysisError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  #ruleCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof DefaultExecutionRuleError) throw new StoreError(error.code, error.message);
      if (error instanceof AnalysisError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  /** The append-only analysis ledger the execution owner writes through; service-internal. */
  get baselineAnalysisLedger(): BaselineAnalysisStore {
    this.#assertAvailable();
    return this.#baselineAnalysis;
  }

  close(): void {
    this.#checkpointWorker?.abort();
    // An index build under way stops at its next step and records nothing; the next open builds it again (Issue #428, S80a).
    this.#indexStopped = true;
    this.#indexQueue.length = 0;
    this.#indexController?.abort();
    // Vectors and 来源译文 asked for stop after the batch under way; what was recorded stays, the rest is asked for again (#892).
    this.#vectorQueue.length = 0;
    // A backup still under way stops at its next chunk rather than write on past the store (Issue #434 review).
    void this.#scheduledBackups.stop();
    // A database export still under way stops as 取消导出 stops it (Issue #434 review).
    void this.#databaseExports.stop();
    this.#taskAuthorization.prepare({ phase: 'cancel-all' });
    this.#reviewRuns.prepare({ phase: 'cancel-all' });
    this.#baselineAnalysis.prepare({ phase: 'cancel-all' });
    this.#factualReview.prepare({ phase: 'cancel-all' });
    this.#initialEvaluation.prepare({ phase: 'cancel-all' });
    for (const ledger of this.#initialEvaluationLedgers.values()) ledger.prepare({ phase: 'cancel-all' });
    this.#initialEvaluationWork.clear();
    for (const ledger of this.#reviewCategoryLedgers.values()) ledger.prepare({ phase: 'cancel-all' });
    for (const ledger of this.#readersReportLedgers.values()) ledger.prepare({ phase: 'cancel-all' });
    for (const ledger of this.#evaluationRewriteLedgers.values()) ledger.prepare({ phase: 'cancel-all' });
    this.#evaluationRewriteWork.clear();
    for (const ledger of this.#writingLedgers.values()) ledger.prepare({ phase: 'cancel-all' });
    this.#writingWork.clear();
    for (const workId of Array.from(this.#reimportPreparationWork.keys())) {
      this.cancelManuscriptReimportPreparationWork(workId);
    }
    for (const workId of Array.from(this.#reimportResolutionWork.keys())) {
      this.cancelReimportResolutionWork(workId);
    }
    for (const workId of Array.from(this.#reimportCommitWork.keys())) {
      this.cancelManuscriptReimportCommitWork(workId);
    }
    try {
      this.#ingest.close();
    } finally {
      try {
        this.#journal.close();
      } finally {
        this.#authority.close();
      }
    }
  }

  prepareBookCreation(titleInput: string, internalNumberInput: string | null): BookCreationReviewProjection {
    this.#assertAvailable();
    const title = safeTitle(titleInput);
    const internalNumber = safeInternalNumber(internalNumberInput);
    if (internalNumber !== null) {
      requireStore(
        this.#authority.prepare('SELECT 1 FROM books WHERE internal_number = ?').get(internalNumber) === undefined,
        'INTERNAL_NUMBER_CONFLICT',
        '内部编号已被另一图书使用。',
      );
    }
    const bookId = randomUUID();
    const proposed = { bookId, stableIdentity: `book:${bookId}`, title, internalNumber };
    const reviewDigest = sha256(canonicalJson({
      schema: 'ai7.empty-book-creation-review/1',
      proposed,
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
      recordsToCreate: ['图书与稳定标识', '图书编辑维度集（8 项）'],
      nonEffects: EMPTY_BOOK_NON_EFFECTS,
    }));
    return {
      reviewDigest,
      proposed,
      recordsToCreate: ['图书与稳定标识', '图书编辑维度集（8 项）'],
      nonEffects: EMPTY_BOOK_NON_EFFECTS,
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    };
  }

  commitBookCreation(input: {
    bookId: string;
    stableIdentity: string;
    title: string;
    internalNumber: string | null;
    reviewDigest: string;
  }): BookCreationCommitProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.bookId), 'BOOK_CREATION_INVALID', '拟创建图书标识无效。');
    requireStore(input.stableIdentity === `book:${input.bookId}`, 'BOOK_CREATION_INVALID', '拟创建图书稳定标识无效。');
    requireStore(DIGEST_PATTERN.test(input.reviewDigest), 'BOOK_CREATION_INVALID', '图书创建复核摘要无效。');
    const title = safeTitle(input.title);
    const internalNumber = safeInternalNumber(input.internalNumber);
    const expected = this.prepareBookCreationReviewForExactIdentity(
      input.bookId,
      input.stableIdentity,
      title,
      internalNumber,
    );
    requireStore(expected.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '图书创建复核已变化。');
    const now = new Date().toISOString();
    const dimensionSetId = randomUUID();
    let committedOverview: BookWorkOverviewProjection | undefined;
    this.#transaction(this.#authority, () => {
      const existing = this.#authority.prepare(
        `SELECT book_id, stable_identity, title, internal_number
         FROM books WHERE book_id = ? OR stable_identity = ? ORDER BY book_id`,
      ).all(input.bookId, input.stableIdentity) as SqlRow[];
      if (existing.length > 0) {
        const row = existing[0]!;
        const exactIdentity = existing.length === 1 && asString(row.book_id) === input.bookId &&
          asString(row.stable_identity) === input.stableIdentity && asString(row.title) === title &&
          (row.internal_number === null ? internalNumber === null : asString(row.internal_number) === internalNumber);
        requireStore(exactIdentity, 'BOOK_IDENTITY_CONFLICT', '拟创建图书身份或字段与已存在记录冲突。');
        const forbidden = one(
          this.#authority.prepare(
            `SELECT
               (SELECT count(*) FROM manuscripts WHERE book_id = ?) manuscripts,
               (SELECT count(*) FROM source_versions WHERE book_id = ?) sources,
               (SELECT count(*) FROM import_fidelity_reviews WHERE book_id = ?) fidelity_reviews,
               (SELECT count(*) FROM workflow_instances WHERE book_id = ?) workflows,
               (SELECT count(*) FROM manuscript_import_records WHERE book_id = ?) imports,
               (SELECT count(*) FROM source_import_records WHERE book_id = ?) source_imports,
               (SELECT count(*) FROM native_artifact_book_enablements WHERE book_id = ?) artifact_enablements,
               (SELECT count(*) FROM import_drafts WHERE reviewed_existing_book_id = ?) reviewed_drafts`,
          ).all(
            input.bookId, input.bookId, input.bookId, input.bookId,
            input.bookId, input.bookId, input.bookId, input.bookId,
          ) as SqlRow[],
          'BOOK_IDENTITY_CONFLICT',
          '无法核对已存在图书的空状态。',
        );
        requireStore(
          asNumber(forbidden.manuscripts) === 0 && asNumber(forbidden.sources) === 0 &&
            asNumber(forbidden.fidelity_reviews) === 0 && asNumber(forbidden.workflows) === 0 &&
            asNumber(forbidden.imports) === 0 && asNumber(forbidden.source_imports) === 0 &&
            asNumber(forbidden.artifact_enablements) === 0 &&
            asNumber(forbidden.reviewed_drafts) === 0,
          'BOOK_IDENTITY_CONFLICT',
          '已存在图书不再是创建响应丢失后的精确空图书。',
        );
        try {
          const overview = this.getBookOverview(input.bookId);
          requireStore(
            overview.manuscriptState.state === 'empty' && overview.records.length === 1 &&
              overview.records[0]?.kind === 'book',
            'BOOK_IDENTITY_CONFLICT',
            '已存在图书不再是创建响应丢失后的精确空图书。',
          );
          committedOverview = overview;
        } catch (error) {
          if (error instanceof StoreError && error.code === 'BOOK_IDENTITY_CONFLICT') throw error;
          throw new StoreError('BOOK_IDENTITY_CONFLICT', '已存在图书的编辑维度记录与已复核创建不一致。');
        }
        return;
      }
      if (internalNumber !== null) {
        requireStore(
          this.#authority.prepare('SELECT 1 FROM books WHERE internal_number = ?').get(internalNumber) === undefined,
          'INTERNAL_NUMBER_CONFLICT',
          '内部编号已被另一图书使用。',
        );
      }
      this.#authority.prepare(
        'INSERT INTO books(book_id, stable_identity, title, created_at, internal_number) VALUES (?, ?, ?, ?, ?)',
      ).run(input.bookId, input.stableIdentity, title, now, internalNumber);
      this.#insertBookDimensionSet(dimensionSetId, input.bookId, now);
      const forbidden = one(
        this.#authority.prepare(
          `SELECT
             (SELECT count(*) FROM manuscripts WHERE book_id = ?) manuscripts,
             (SELECT count(*) FROM source_versions WHERE book_id = ?) sources,
             (SELECT count(*) FROM workflow_instances WHERE book_id = ?) workflows,
             (SELECT count(*) FROM manuscript_import_records WHERE book_id = ?) imports,
             (SELECT count(*) FROM source_import_records WHERE book_id = ?) source_imports,
             (SELECT count(*) FROM native_artifact_book_enablements WHERE book_id = ?) artifact_enablements`,
        ).all(input.bookId, input.bookId, input.bookId, input.bookId, input.bookId, input.bookId) as SqlRow[],
        'BOOK_CREATION_FAILED',
        '无法核对空图书创建结果。',
      );
      requireStore(
        asNumber(forbidden.manuscripts) === 0 && asNumber(forbidden.sources) === 0 &&
          asNumber(forbidden.workflows) === 0 && asNumber(forbidden.imports) === 0 &&
          asNumber(forbidden.source_imports) === 0 && asNumber(forbidden.artifact_enablements) === 0,
        'BOOK_CREATION_FAILED',
        '空图书创建意外形成了稿件或导入记录。',
      );
      this.#assertForeignKeys(this.#authority);
    });
    return { completionLabel: '图书已创建', overview: committedOverview ?? this.getBookOverview(input.bookId) };
  }

  getBookOverview(bookId: string, historyCursor: BookHistoryCursor | null = null): BookWorkOverviewProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    const book = one(
      this.#authority.prepare(
        `SELECT b.book_id, b.stable_identity, b.title, b.internal_number, b.created_at,
                ds.dimension_set_id, ds.definition_digest, ds.profile_id, ds.profile_version,
                ds.weight_semantics
         FROM books b
         JOIN book_dimension_sets ds ON ds.book_id = b.book_id
         WHERE b.book_id = ?`,
      ).all(bookId) as SqlRow[],
      'BOOK_NOT_FOUND',
      '图书不存在或维度集不完整。',
    );
    const dimensions = (this.#authority.prepare(
      `SELECT dimension_id, display_label, weight
       FROM book_dimensions WHERE dimension_set_id = ? ORDER BY position`,
    ).all(asString(book.dimension_set_id)) as SqlRow[]).map((row) => ({
      id: asString(row.dimension_id),
      label: asString(row.display_label),
      weight: asNumber(row.weight),
    }));
    requireStore(
      asString(book.profile_id) === BASELINE_EDITORIAL_DIMENSION_SET.profileId &&
        asString(book.profile_version) === BASELINE_EDITORIAL_DIMENSION_SET.profileVersion &&
        asString(book.definition_digest) === BASELINE_EDITORIAL_DIMENSION_SET_DIGEST &&
        asString(book.weight_semantics) === BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics &&
        canonicalJson(dimensions) === canonicalJson(EDITORIAL_DIMENSIONS),
      'BOOK_DIMENSIONS_INVALID',
      '图书编辑维度集不完整或已漂移。',
    );
    const bookProjection = {
      bookId: asString(book.book_id),
      stableIdentity: asString(book.stable_identity),
      title: asString(book.title),
      internalNumber: book.internal_number === null ? null : asString(book.internal_number),
      createdAt: asString(book.created_at),
    };
    const bookRecord = {
      kind: 'book' as const,
      label: '图书' as const,
      ...bookProjection,
      dimensionSetId: asString(book.dimension_set_id),
      dimensionSetDigest: asString(book.definition_digest),
    };
    const history = this.#bookHistorySelection(bookId, historyCursor);
    const sourceImportRecords = this.#sourceImportRecordPresentations(bookId, history.sourceImportRecordIds);
    const reimportRecords = this.#reimportRecordPresentations(bookId, history.reimportRecordIds);
    const manuscripts = this.#authority.prepare(
      `SELECT m.manuscript_id, m.created_at, mb.branch_id, mr.revision_id, mr.revision_label,
              mr.revision_digest, mr.source_version_id, mr.created_at revision_created_at,
              sv.display_name, sv.format, sv.source_digest, sv.content_digest, sv.structure_digest, sv.parser_identity,
              sv.working_object_digest, sv.converter_identity,
              co.byte_length source_bytes,
              sp.provenance_id, sp.acquisition_path, sp.locality,
              wi.workflow_instance_id, wi.current_phase, wi.state, wi.profile_id, wi.profile_version,
              wi.profile_digest, wi.native_profile_id, wi.native_profile_version, wi.native_profile_digest,
              wp.projection_json,
              ir.import_record_id, ir.commit_id, ir.fidelity_review_id, ir.degradation_decision_id,
              ir.provenance_id import_provenance_id, ir.imported_at, fr.outcome fidelity_outcome,
              sp.parser_identity derivation_parser_identity
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN manuscript_revisions mr
         ON mr.manuscript_id = m.manuscript_id AND mr.branch_id = mb.branch_id AND mr.ordinal = 1
       JOIN source_versions sv ON sv.source_version_id = mr.source_version_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN workflow_instances wi ON wi.manuscript_id = m.manuscript_id AND wi.book_id = m.book_id
       JOIN workflow_profiles wp ON wp.profile_id = wi.profile_id AND wp.profile_version = wi.profile_version
       JOIN manuscript_import_records ir
         ON ir.manuscript_id = m.manuscript_id AND ir.book_id = m.book_id
        AND ir.source_version_id = sv.source_version_id AND ir.resulting_revision_id = mr.revision_id
       JOIN source_provenance sp
         ON sp.provenance_id = ir.provenance_id AND sp.source_version_id = sv.source_version_id
       JOIN import_fidelity_reviews fr
         ON fr.fidelity_review_id = ir.fidelity_review_id
        AND fr.book_id = m.book_id AND fr.source_version_id = sv.source_version_id
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY m.created_at, m.manuscript_id`,
    ).all(bookId) as SqlRow[];
    const manuscriptAuthority = one(
      this.#authority.prepare("SELECT count(*) manuscript_count FROM manuscripts WHERE book_id = ? AND role = 'primary'").all(bookId) as SqlRow[],
      'BOOK_MANUSCRIPT_STATE_INVALID',
      '无法核对图书主稿件关系。',
    );
    requireStore(
      asNumber(manuscriptAuthority.manuscript_count) === manuscripts.length && manuscripts.length <= 1,
      'BOOK_MANUSCRIPT_STATE_INVALID',
      '图书主稿件关系或记录图不完整。',
    );
    const people = this.#peopleCall(() => this.#bookPeople.current(bookId));
    if (manuscripts.length === 0) {
      return requireBoundedBookOverview({
        book: bookProjection,
        people,
        manuscriptState: { state: 'empty', label: '尚无稿件' },
        primaryAction: { kind: 'import-first-manuscript', label: '导入首份稿件', bookId },
        manuscriptAnchor: null,
        records: [bookRecord, ...sourceImportRecords],
        historyPage: history.page,
      });
    }
    const row = manuscripts[0]!;
    requireStore(
      asString(row.revision_label) === 'r1' && asString(row.state) === 'active' &&
        asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
        asString(row.provenance_id) === asString(row.import_provenance_id) &&
        asString(row.profile_id) === this.#workflowProfile.projection.id &&
        asString(row.profile_version) === this.#workflowProfile.projection.version &&
        asString(row.profile_digest) === this.#workflowProfile.projection.digest &&
        asString(row.projection_json) === workflowProjectionJson(this.#workflowProfile) &&
        asString(row.native_profile_id) === this.#workflowProfile.native.id &&
        asString(row.native_profile_version) === this.#workflowProfile.native.version &&
        asString(row.native_profile_digest) === this.#workflowProfile.native.digest,
      'BOOK_RECORD_GRAPH_INVALID',
      '图书稿件记录图不完整。',
    );
    const manuscriptId = asString(row.manuscript_id);
    const branchId = asString(row.branch_id);
    const revisionId = asString(row.revision_id);
    const sourceVersionId = asString(row.source_version_id);
    const fidelityReviewId = asString(row.fidelity_review_id);
    const sourceConversion = readConversionColumns(
      row,
      requireSourceFormat(asString(row.format)),
      '来源版本的转换记录不完整。',
    );
    const { categories: fidelityCategories, plan: fidelityPlan } = this.#persistedFidelityPlan(
      fidelityReviewId,
      asString(row.source_digest),
      asNumber(row.source_bytes),
      sourceConversion,
      this.#manuscriptImportParser(bookId, asString(row.commit_id), sourceVersionId, asString(row.parser_identity), asString(row.derivation_parser_identity)),
      'BOOK_RECORD_GRAPH_INVALID',
      '稿件导入记录的保真结果不完整。',
    );
    const fidelityOutcome = asString(row.fidelity_outcome);
    requireStore(
      fidelityPlan !== undefined && fidelityOutcome === fidelityPlan.outcome &&
        ((fidelityPlan.degradations.length === 0 && row.degradation_decision_id === null) ||
          (fidelityPlan.degradations.length > 0 && row.degradation_decision_id !== null)),
      'BOOK_RECORD_GRAPH_INVALID',
      '稿件导入记录的保真结果不完整。',
    );
    const revisionRecords = history.revisionIds.length === 0 ? [] : (this.#authority.prepare(
      `SELECT revision_id, revision_label, revision_digest, source_version_id, created_at
       FROM manuscript_revisions WHERE manuscript_id = ? AND branch_id = ?
         AND revision_id IN (${history.revisionIds.map(() => '?').join(', ')}) ORDER BY ordinal`,
    ).all(manuscriptId, branchId, ...history.revisionIds) as SqlRow[]).map((revision) => ({
      kind: 'revision' as const,
      label: `修订版 ${asString(revision.revision_label)}`,
      revisionId: asString(revision.revision_id),
      manuscriptId,
      branchId,
      revisionLabel: asString(revision.revision_label),
      revisionDigest: asString(revision.revision_digest),
      sourceVersionId: asString(revision.source_version_id),
      createdAt: asString(revision.created_at),
    }));
    const presentedSourceIds = new Set([sourceVersionId]);
    const additionalRecords = [...sourceImportRecords, ...reimportRecords].filter((record) => {
      if (record.kind !== 'source') return true;
      if (presentedSourceIds.has(record.sourceVersionId)) return false;
      presentedSourceIds.add(record.sourceVersionId);
      return true;
    });
    return requireBoundedBookOverview({
      book: bookProjection,
      people,
      manuscriptState: { state: 'populated', label: '已有主稿件', manuscriptId },
      primaryAction: { kind: 'open-manuscript', label: '打开稿件', manuscriptId, branchId },
      manuscriptAnchor: this.#manuscriptAnchor(manuscriptId, branchId),
      records: [
        bookRecord,
        { kind: 'manuscript', label: '主稿件', manuscriptId, bookId, role: 'primary', createdAt: asString(row.created_at) },
        ...revisionRecords,
        {
          kind: 'source', label: '来源版本与来源记录', sourceVersionId,
          provenanceId: asString(row.provenance_id), bookId, displayName: asString(row.display_name),
          format: requireSourceFormat(asString(row.format)),
          sourceDigest: asString(row.source_digest), contentDigest: asString(row.content_digest),
          structureDigest: asString(row.structure_digest), parserIdentity: asString(row.parser_identity),
          workingObjectDigest: sourceConversion === null ? null : asString(row.working_object_digest),
          converterIdentity: sourceConversion === null ? null : sourceConversion.converterIdentity,
          acquisitionPath: 'native-file-picker', locality: 'local-provider-free',
        },
        {
          kind: 'workflow', label: '工作流实例与精确 Profile 绑定',
          workflowInstanceId: asString(row.workflow_instance_id), bookId, manuscriptId,
          currentPhase: asString(row.current_phase), state: 'active',
          projection: {
            id: asString(row.profile_id), version: asString(row.profile_version), digest: asString(row.profile_digest),
          },
          nativeProfile: {
            id: asString(row.native_profile_id), version: asString(row.native_profile_version),
            digest: asString(row.native_profile_digest),
          },
        },
        {
          kind: 'import-record', label: '稿件导入记录', importRecordId: asString(row.import_record_id),
          commitId: asString(row.commit_id), bookId, manuscriptId, sourceVersionId,
          fidelityReviewId,
          fidelityOutcome: fidelityOutcome as 'clean-import-no-round-trip' | 'degraded-import-no-round-trip',
          fidelityCategories,
          degradationDecisionId: row.degradation_decision_id === null ? null : asString(row.degradation_decision_id),
          degradationDecision: row.degradation_decision_id === null
            ? null
            : { summaryLabel: '含已接受的降级', acceptedItems: fidelityPlan.degradations },
          resultingRevisionId: revisionId, provenanceId: asString(row.provenance_id), importedAt: asString(row.imported_at),
        },
        ...additionalRecords,
      ],
      historyPage: history.page,
    });
  }

  /**
   * The overview's Manuscript Visual Anchor (V2-UX-BOOK-001), and with it the position the Book route
   * enters the Manuscript at (V2-UX-RET-002). Both readings come from the same three facts, so they
   * are read once here rather than twice through two surfaces: the branch's own Revision and journal
   * state, and the remembered entry position Issue #467 resolves against the working state now.
   *
   * `readManuscriptEntryPosition` answers in block identity and grapheme offset; what an editor reads
   * is the block's place in the manuscript and the structure it sits under, so the ordinal, the total
   * and the nearest preceding outline entry are resolved here and the identity stays technical.
   */
  #manuscriptAnchor(manuscriptId: string, branchId: string): BookManuscriptAnchorProjection {
    const state = one(
      this.#authority.prepare(
        `SELECT bws.base_revision_id, bws.journal_sequence, bws.last_checkpoint_sequence, mr.revision_label
         FROM branch_working_state bws
         JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
         WHERE bws.manuscript_id = ? AND bws.branch_id = ?`,
      ).all(manuscriptId, branchId) as SqlRow[],
      'BOOK_RECORD_GRAPH_INVALID',
      '稿件工作状态不完整。',
    );
    const journalSequence = asNumber(state.journal_sequence);
    const anchor: BookManuscriptAnchorProjection = {
      manuscriptId,
      branchId,
      revisionId: asString(state.base_revision_id),
      revisionLabel: asString(state.revision_label),
      journalSequence,
      journalLabel: journalSequence > asNumber(state.last_checkpoint_sequence) ? '已写入修订日志' : '与当前修订版一致',
      entry: null,
    };
    // The authority connection, not the read one: `commitNewBookImport` builds the overview it
    // returns inside its own transaction, where the Book being described is not yet visible to any
    // other connection. Everything else this projection reads comes from the same connection.
    const position = this.#boundedCall(() => this.#boundedAuthority.readManuscriptEntryPosition(manuscriptId, branchId));
    if (position === null) return anchor;
    const block = this.#authority.prepare(
      'SELECT position FROM working_blocks WHERE branch_id = ? AND block_id = ?',
    ).get(branchId, position.blockId) as SqlRow | undefined;
    // The resolution already answered against the working state, so a block it named that is not in
    // the working state means the two disagree: the overview then leads with the Revision alone
    // rather than with a position no window could open.
    if (block === undefined) return anchor;
    const blockPosition = asNumber(block.position);
    // The last working position, the same total the window projection reports, so the anchor's reading
    // and the window the entry opens count the manuscript the same way.
    const totalBlocks = asNumber(one(
      this.#authority.prepare(
        'SELECT position FROM working_blocks WHERE branch_id = ? ORDER BY position DESC LIMIT 1',
      ).all(branchId) as SqlRow[],
      'BOOK_RECORD_GRAPH_INVALID',
      '稿件工作稿内容块不完整。',
    ).position);
    const structure = this.#authority.prepare(
      'SELECT text FROM manuscript_outline WHERE branch_id = ? AND position <= ? ORDER BY position DESC LIMIT 1',
    ).get(branchId, blockPosition) as SqlRow | undefined;
    const structureLabel = structure === undefined ? null : asString(structure.text);
    return {
      ...anchor,
      entry: {
        blockId: position.blockId,
        grapheme: position.grapheme,
        blockPosition,
        totalBlocks,
        structureLabel,
        label: `${structureLabel === null ? '' : `${structureLabel} · `}第 ${blockPosition} / ${totalBlocks} 个段落`,
        state: position.state,
      },
    };
  }

  #bookHistorySelection(bookId: string, cursor: BookHistoryCursor | null): {
    revisionIds: string[];
    sourceImportRecordIds: string[];
    reimportRecordIds: string[];
    page: BookWorkOverviewProjection['historyPage'];
  } {
    if (cursor !== null) {
      requireStore(
        cursor.occurredAt.isWellFormed() && cursor.occurredAt.length <= 64 &&
          Number.isSafeInteger(cursor.kindRank) && cursor.kindRank >= 1 && cursor.kindRank <= 3 &&
          UUID_PATTERN.test(cursor.stableId) && (cursor.direction === 'forward' || cursor.direction === 'backward'),
        'BOOK_HISTORY_CURSOR_INVALID',
        '图书历史分页位置无效。',
      );
    }
    const direction = cursor?.direction ?? 'backward';
    const comparator = direction === 'forward' ? '>' : '<';
    const order = direction === 'forward' ? 'ASC' : 'DESC';
    const boundary = cursor === null ? '' : `AND (
      occurred_at ${comparator} ? OR
      (occurred_at = ? AND kind_rank ${comparator} ?) OR
      (occurred_at = ? AND kind_rank = ? AND stable_id ${comparator} ?)
    )`;
    const sql = `SELECT occurred_at, kind_rank, stable_id, event_kind FROM (
      SELECT mr.created_at occurred_at, 1 kind_rank, mr.revision_id stable_id, 'revision' event_kind, m.book_id
      FROM manuscript_revisions mr JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id AND m.role = 'primary'
      UNION ALL
      SELECT sir.imported_at, 2, sir.source_import_record_id, 'source-import', sir.book_id
      FROM source_import_records sir
      UNION ALL
      SELECT rr.imported_at, 3, rr.reimport_record_id, 'reimport', rr.book_id
      FROM manuscript_reimport_records rr
    ) WHERE book_id = ? ${boundary}
    ORDER BY occurred_at ${order}, kind_rank ${order}, stable_id ${order}
    LIMIT ${BOOK_HISTORY_PAGE_SIZE + 1}`;
    const parameters: Array<string | number> = [bookId];
    if (cursor !== null) {
      parameters.push(
        cursor.occurredAt, cursor.occurredAt, cursor.kindRank,
        cursor.occurredAt, cursor.kindRank, cursor.stableId,
      );
    }
    const fetched = this.#authority.prepare(sql).all(...parameters) as SqlRow[];
    const hasMore = fetched.length > BOOK_HISTORY_PAGE_SIZE;
    const selected = fetched.slice(0, BOOK_HISTORY_PAGE_SIZE);
    if (direction === 'backward') selected.reverse();
    const first = selected[0];
    const last = selected.at(-1);
    const asCursor = (row: SqlRow, nextDirection: 'forward' | 'backward'): BookHistoryCursor => ({
      occurredAt: asString(row.occurred_at),
      kindRank: asNumber(row.kind_rank),
      stableId: asString(row.stable_id),
      direction: nextDirection,
    });
    const previousCursor = first === undefined || (cursor === null && direction === 'forward')
      ? null
      : direction === 'backward'
        ? hasMore ? asCursor(first, 'backward') : null
        : asCursor(first, 'backward');
    const nextCursor = last === undefined || (cursor === null && direction === 'backward')
      ? null
      : direction === 'forward'
        ? hasMore ? asCursor(last, 'forward') : null
        : asCursor(last, 'forward');
    return {
      revisionIds: selected.filter((row) => row.event_kind === 'revision').map((row) => asString(row.stable_id)),
      sourceImportRecordIds: selected.filter((row) => row.event_kind === 'source-import').map((row) => asString(row.stable_id)),
      reimportRecordIds: selected.filter((row) => row.event_kind === 'reimport').map((row) => asString(row.stable_id)),
      page: { previousCursor, nextCursor },
    };
  }

  #reimportRecordPresentations(
    bookId: string,
    recordIds: ReadonlyArray<string>,
  ): BookRecordPresentation[] { return importReviewOperations.reimportRecordPresentations(this.#importReviewRecordsHost, bookId, recordIds); }

  #sourceImportRecordPresentations(
    bookId: string,
    recordIds: ReadonlyArray<string>,
  ): BookRecordPresentation[] { return importReviewOperations.sourceImportRecordPresentations(this.#importReviewRecordsHost, bookId, recordIds); }

  listBooks(after: BookSummaryCursor | null, filter: BookSummaryFilter | null = null): BookSummaryPageProjection {
    this.#assertAvailable();
    if (after !== null) {
      requireStore(
        UUID_PATTERN.test(after.bookId) && after.title === safeTitle(after.title),
        'BOOK_SUMMARY_CURSOR_INVALID',
        '图书列表位置无效。',
      );
    }
    // 书库's search (Issue #431, S83): the Books whose 书名, 作者 or 责编 hold the words, paged the same way.
    const narrowing = filter === null ? null : this.#peopleCall(() => this.#bookPeople.filter(filter));
    const conditions = [
      ...(after === null ? [] : ['(b.title COLLATE BINARY > ? COLLATE BINARY OR (b.title = ? COLLATE BINARY AND b.book_id > ?))']),
      ...(narrowing === null ? [] : [narrowing.where]),
    ];
    const sql = `SELECT b.book_id, b.stable_identity, b.title, b.internal_number,
                        CASE WHEN EXISTS (SELECT 1 FROM manuscripts m WHERE m.book_id = b.book_id AND m.role = 'primary')
                          THEN 'populated' ELSE 'empty' END manuscript_state
                 FROM books b
                 ${conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`}
                 ORDER BY b.title COLLATE BINARY, b.book_id
                 LIMIT ${BOOK_SUMMARY_PAGE_SIZE + 1}`;
    const parameters = [...(after === null ? [] : [after.title, after.title, after.bookId]), ...(narrowing?.parameters ?? [])];
    const rows = this.#authority.prepare(sql).all(...parameters) as SqlRow[];
    const summaries = rows.map((row) => {
      const bookId = asString(row.book_id);
      const stableIdentity = asString(row.stable_identity);
      const title = asString(row.title);
      const internalNumber = row.internal_number === null ? null : asString(row.internal_number);
      const manuscriptState = asString(row.manuscript_state);
      requireStore(
        UUID_PATTERN.test(bookId) && stableIdentity === `book:${bookId}` && title === safeTitle(title) &&
          (internalNumber === null || internalNumber === safeInternalNumber(internalNumber)) &&
          (manuscriptState === 'empty' || manuscriptState === 'populated'),
        'BOOK_SUMMARY_INVALID',
        '图书列表记录无法安全呈现。',
      );
      const projectedManuscriptState: 'empty' | 'populated' =
        manuscriptState === 'empty' ? 'empty' : 'populated';
      const lineagePage = projectedManuscriptState === 'empty'
        ? { items: [] as string[], nextCursor: null }
        : this.#reimportLineageSourceVersionPage(bookId, null);
      return {
        bookId,
        stableIdentity,
        title,
        internalNumber,
        people: this.#peopleCall(() => this.#bookPeople.summary(bookId)),
        manuscriptState: projectedManuscriptState,
        manuscriptStateLabel: projectedManuscriptState === 'empty' ? '尚无稿件' as const : '已有主稿件' as const,
        reimportLineageSourceVersionIds: lineagePage.items,
        reimportLineageNextCursor: lineagePage.nextCursor,
      };
    });
    const items = summaries.slice(0, BOOK_SUMMARY_PAGE_SIZE);
    const last = items.at(-1);
    return {
      items,
      nextCursor: summaries.length > BOOK_SUMMARY_PAGE_SIZE && last
        ? { title: last.title, bookId: last.bookId }
        : null,
    };
  }

  /** 知识库 › 审阅规范文件 (Issue #427, S79a; KB-001 to KB-003): every guideline document with its versions and their use. */
  inspectReviewGuidelines(page?: ReviewGuidelinesPage): ReviewGuidelinesProjection {
    return this.#guidelineCall(() => this.#reviewGuidelines.projection(page));
  }

  readReviewGuidelinePreview(documentId: string, previewId: string, page?: number): ReviewGuidelinePreviewProjection {
    return this.#guidelineCall(() => this.#reviewGuidelines.readPreview(documentId, previewId, page));
  }

  /**
   * 知识库 › 范例 (Issue #427, S79b; KB-004, KB-006): one page of the published Books' delivered documents, each record read
   * through its owner — the designations and their 撤回 through 发稿版本's, the Delivery Records through the documents'.
   */
  inspectExemplars(after: ExemplarBookCursor | null, damaged?: Array<{ typeId: string; title: string }>): ExemplarsProjection {
    if (after !== null) {
      requireStore(UUID_PATTERN.test(after.bookId) && after.title === safeTitle(after.title), 'EXEMPLAR_CURSOR_INVALID', '范例列表位置无效。');
    }
    const sources = this.#exemplarSources();
    const archived = sources.books(after, MAX_EXEMPLAR_BOOKS_PAGE + 1);
    const imported = this.#importedCall(() => this.#importedExemplars.books(after, MAX_EXEMPLAR_BOOKS_PAGE + 1));
    const importedIds = new Set(imported.map((book) => book.bookId));
    // One collation for the cursor (Issue #778): both sources page in SQLite's BINARY order — UTF-8 bytes, which is code point
    // order — so the merge of their pages must order exactly as the queries that continue them do. JS's `<` compares UTF-16
    // code units and disagrees for a supplementary-plane character against a BMP character above U+DBFF (e.g. 𠀀 against Ａ).
    const compareTitles = (left: string, right: string): number => {
      let i = 0;
      let j = 0;
      while (i < left.length && j < right.length) {
        const a = left.codePointAt(i)!;
        const b = right.codePointAt(j)!;
        if (a !== b) return a < b ? -1 : 1;
        i += a > 0xffff ? 2 : 1;
        j += b > 0xffff ? 2 : 1;
      }
      return (left.length - i) - (right.length - j);
    };
    const page = [...archived, ...imported].sort((a, b) => compareTitles(a.title, b.title) || (a.bookId < b.bookId ? -1 : a.bookId > b.bookId ? 1 : 0));
    // An imported Book reads one type at a time (Issue #789, #800): a damaged version is named and skipped — in the `damaged`
    // sink for the 写作任务 scan, or on the Book as `skipped` for the 范例 view — while every other item stays listed.
    const books = page.slice(0, MAX_EXEMPLAR_BOOKS_PAGE).map((book) => {
      if (!importedIds.has(book.bookId)) return this.#documentCall(() => this.#publicationCall(() => readExemplarBook(sources, book)));
      const read = this.#importedCall(() => this.#importedExemplars.bookForWriting(book.bookId, book.title));
      damaged?.push(...read.damaged);
      return damaged === undefined && read.damaged.length > 0 ? { ...read.book, skipped: read.damaged.map((entry) => entry.title) } : read.book;
    });
    const last = books.at(-1);
    return { books, nextCursor: page.length > MAX_EXEMPLAR_BOOKS_PAGE && last !== undefined ? { title: last.bookTitle, bookId: last.bookId } : null };
  }

  async previewImportedExemplar(path: string): Promise<ImportedExemplarPreview> {
    this.#assertAvailable();
    return this.#importedCall(() => this.#importedExemplars.preview(path));
  }
  async importEarlierExemplar(input: ImportedExemplarInput): Promise<ExemplarBookProjection> {
    this.#assertAvailable();
    return this.#importedCall(() => this.#importedExemplars.import(input));
  }
  decideImportedExemplar(input: ImportedExemplarDecisionInput): ExemplarBookProjection {
    this.#assertAvailable();
    return this.#importedCall(() => this.#importedExemplars.decide(input));
  }

  /**
   * An earlier-Book 范例 record that no longer reads is a store refusal, so every reader of 范例 — 写作任务 and 审稿意见 among
   * them — says so as it says any other unreadable part, rather than failing whole (Issue #427 review).
   */
  #importedCall<T>(operation: () => T): T {
    const refuse = (error: unknown): never => {
      if (error instanceof ImportedExemplarError) throw new StoreError(error.code, error.message);
      throw error;
    };
    try {
      const result = operation();
      return (result instanceof Promise ? result.catch(refuse) : result) as T;
    } catch (error) { return refuse(error); }
  }

  #exemplarSources(): ExemplarSources {
    return {
      books: (cursor, limit) => this.#publicationVersions.designatedBooks(cursor, limit),
      archive: (bookId) => this.#publicationVersions.exemplarArchive(bookId),
      // Delivered versions, and since Issue #1405 the saved versions ticked into a frozen 图书交付包.
      documents: (bookId) => {
        const packaged = this.#packageCall(() => this.#bookDeliveryPackages.packagedDocumentVersions(bookId));
        return this.#productionDocuments.deliveryReadings(bookId).map((document) => withPackagedVersions(document, packaged.get(document.documentId) ?? []));
      },
      people: (bookId) => this.#peopleCall(() => this.#bookPeople.current(bookId)),
      readersReports: (bookId, designation) => this.#readersReportExemplarsOf(bookId, designation),
    };
  }

  // ---- 审稿意见 in 图书交付包 and 范例 (Issue #429, S81c remainder; BUNDLE-001, KB-006) --------------------------------------------

  /** Each template's 审稿意见 draft at the version 图书交付包 and 范例 pin (Issue #429); the reading is in readers-reports.ts. */
  #readersReportPins(bookId: string, designatedAt: string | null): PackageReadersReportReading[] {
    return readersReportOperations.readersReportPins(this.#readersReportHost, bookId, designatedAt);
  }

  /** The Book's 审稿意见 as 范例 offers them: each pinned against the designation given, with where the editor's admission stands. */
  #readersReportExemplarsOf(bookId: string, designation: { readonly createdAt: string; readonly withdrawnAt: string | null }): ReadersReportExemplarProjection[] {
    return readersReportOperations.readersReportExemplarsOf(this.#readersReportHost, bookId, designation);
  }

  /** 知识库 › 范例 › 归入范例 (Issue #429; KB-006): the editor admits one Book's 审稿意见, at exactly the version offered, under 仅本社. */
  admitReadersReportExemplar(input: AdmitReadersReportExemplarInput): ExemplarBookProjection {
    return readersReportOperations.admitReadersReportExemplar(this.#readersReportHost, input);
  }

  // ---- 可复用工序 (Issue #65, plan slice S30; ADR 0087; V2-UX-REUSE-001 to 020, 029 to 031, 038 to 054, 063 to 066) -----------

  /** What the 可复用工序 operations in captured-procedures.ts reach of the store (Issue #1172), read live. */
  readonly #capturedProcedureHost: capturedProcedureOperations.CapturedProcedureStoreHost = this.#capturedProcedureHostOf();

  #capturedProcedureHostOf(): capturedProcedureOperations.CapturedProcedureStoreHost {
    const store = this;
    return {
      analysisCall: this.#analysisCall.bind(this),
      artifactCall: this.#artifactCall.bind(this),
      assertAvailable: this.#assertAvailable.bind(this),
      get authority() { return store.#authority; },
      get bookDeliveryPackages() { return store.#bookDeliveryPackages; },
      get capturedProcedures() { return store.#capturedProcedures; },
      get editorialWorkspaceProfile() { return store.#editorialWorkspaceProfile; },
      evaluationBookTitle: this.#evaluationBookTitle.bind(this),
      guidelineCall: this.#guidelineCall.bind(this),
      reviewCall: this.#reviewCall.bind(this),
      get reviewGuidelines() { return store.#reviewGuidelines; },
      get reviewRuns() { return store.#reviewRuns; },
      get skillAcquisitions() { return store.#skillAcquisitions; },
      transaction: this.#transaction.bind(this),
    };
  }

  inspectCapturedProcedures(): CapturedProceduresProjection {
    return capturedProcedureOperations.inspectCapturedProcedures(this.#capturedProcedureHost);
  }

  importSkillPackage(input: { path: string | null; keep: string | null }): Promise<ImportedSkillImportProjection> {
    return capturedProcedureOperations.importSkillPackage(this.#capturedProcedureHost, input);
  }

  inspectImportedSkills(revisionId: string | null, before: string | null): ImportedSkillsProjection {
    return capturedProcedureOperations.inspectImportedSkills(this.#capturedProcedureHost, revisionId, before);
  }

  checkImportedSkillUpdate(input: { skillId: string; path: string | null; keep: string | null }): Promise<ImportedSkillUpdateCheckProjection> {
    return capturedProcedureOperations.checkImportedSkillUpdate(this.#capturedProcedureHost, input);
  }

  inspectImportedSkillUpdate(candidateId: string): ImportedSkillUpdateCandidateProjection {
    return capturedProcedureOperations.inspectImportedSkillUpdate(this.#capturedProcedureHost, candidateId);
  }

  adoptImportedSkillUpdate(input: { candidateId: string; reviewDigest: string; acceptItems: readonly string[]; upstreamPaths: readonly string[] }): ImportedSkillUpdateCandidateProjection {
    return capturedProcedureOperations.adoptImportedSkillUpdate(this.#capturedProcedureHost, input);
  }

  dismissImportedSkillUpdate(candidateId: string): ImportedSkillUpdateCandidateProjection {
    return capturedProcedureOperations.dismissImportedSkillUpdate(this.#capturedProcedureHost, candidateId);
  }

  createImportedSkillUpdateRule(skillId: string, confirmation: string): ImportedSkillUpdateRuleProjection {
    return capturedProcedureOperations.createImportedSkillUpdateRule(this.#capturedProcedureHost, skillId, confirmation);
  }

  revokeImportedSkillUpdateRule(skillId: string): ImportedSkillUpdateRuleProjection {
    return capturedProcedureOperations.revokeImportedSkillUpdateRule(this.#capturedProcedureHost, skillId);
  }

  rollbackImportedSkill(skillId: string, revisionId: string): ImportedSkillRevisionProjection {
    return capturedProcedureOperations.rollbackImportedSkill(this.#capturedProcedureHost, skillId, revisionId);
  }

  validateImportedSkill(revisionId: string): ImportedSkillRevisionProjection {
    return capturedProcedureOperations.validateImportedSkill(this.#capturedProcedureHost, revisionId);
  }

  installImportedSkill(revisionId: string, previewDigest: string): ImportedSkillRevisionProjection {
    return capturedProcedureOperations.installImportedSkill(this.#capturedProcedureHost, revisionId, previewDigest);
  }

  enableImportedSkill(revisionId: string, bookId: string, previewDigest: string): ImportedSkillRevisionProjection {
    return capturedProcedureOperations.enableImportedSkill(this.#capturedProcedureHost, revisionId, bookId, previewDigest);
  }

  recommendProcedures(input: ProcedureRecommendationInput): ProcedureRecommendationProjection {
    return capturedProcedureOperations.recommendProcedures(this.#capturedProcedureHost, input);
  }

  inspectCapturedProcedure(procedureId: string, before: number | null): CapturedProcedureProjection {
    return capturedProcedureOperations.inspectCapturedProcedure(this.#capturedProcedureHost, procedureId, before);
  }

  inspectDeveloperProposal(proposalId: string, before: number | null): DeveloperProposalProjection {
    return capturedProcedureOperations.inspectDeveloperProposal(this.#capturedProcedureHost, proposalId, before);
  }

  inspectDeveloperProposalVersion(proposalVersionId: string): DeveloperProposalVersionProjection {
    return capturedProcedureOperations.inspectDeveloperProposalVersion(this.#capturedProcedureHost, proposalVersionId);
  }

  inspectProcedureCapture(bookId: string, reviewRunId: string): ProcedureCaptureProjection {
    return capturedProcedureOperations.inspectProcedureCapture(this.#capturedProcedureHost, bookId, reviewRunId);
  }

  saveCapturedProcedure(input: SaveCapturedProcedureInput, now: Date = new Date()): CapturedProcedureProjection {
    return capturedProcedureOperations.saveCapturedProcedure(this.#capturedProcedureHost, input, now);
  }

  previewCapturedProcedureValidation(versionId: string): CapturedProcedureValidationProjection {
    return capturedProcedureOperations.previewCapturedProcedureValidation(this.#capturedProcedureHost, versionId);
  }

  enableCapturedProcedure(versionId: string, previewDigest: string, now: Date = new Date()): CapturedProcedureProjection {
    return capturedProcedureOperations.enableCapturedProcedure(this.#capturedProcedureHost, versionId, previewDigest, now);
  }

  previewCapturedProcedureStop(procedureId: string, versionId: string | null): CapturedProcedureStopPreviewProjection {
    return capturedProcedureOperations.previewCapturedProcedureStop(this.#capturedProcedureHost, procedureId, versionId);
  }

  stopCapturedProcedure(procedureId: string, versionId: string | null, previewDigest: string, now: Date = new Date()): CapturedProcedureProjection {
    return capturedProcedureOperations.stopCapturedProcedure(this.#capturedProcedureHost, procedureId, versionId, previewDigest, now);
  }

  inspectCapturedProcedureRun(bookId: string, procedureId: string, versionId: string | null = null, scope: CapturedProcedureScopeSlot | null = null): CapturedProcedureRunProjection {
    return capturedProcedureOperations.inspectCapturedProcedureRun(this.#capturedProcedureHost, bookId, procedureId, versionId, scope);
  }

  inspectCapturedProcedureApplicability(bookId: string, scope: CapturedProcedureScopeSlot | null = null): CapturedProcedureApplicabilityProjection {
    return capturedProcedureOperations.inspectCapturedProcedureApplicability(this.#capturedProcedureHost, bookId, scope);
  }

  saveDeveloperProposal(input: SaveDeveloperProposalInput, now: Date = new Date()): DeveloperProposalProjection {
    return capturedProcedureOperations.saveDeveloperProposal(this.#capturedProcedureHost, input, now);
  }

  writeDeveloperProposalFile(proposalVersionId: string, destination: string, now: Date = new Date()): Promise<DeveloperProposalProjection> {
    return capturedProcedureOperations.writeDeveloperProposalFile(this.#capturedProcedureHost, proposalVersionId, destination, now);
  }

  procedureLibrary(command: import('../shared/protocol/procedures.js').ProcedureLibraryCommand): import('../shared/protocol/procedures.js').ProcedureLibraryProjection {
    return capturedProcedureOperations.procedureLibrary(this.#capturedProcedureHost, command);
  }

  inspectKnowledgeProcedures(): Promise<KnowledgeProceduresProjection> {
    return capturedProcedureOperations.inspectKnowledgeProcedures(this.#capturedProcedureHost);
  }

  /** 导入新版本's first step: the picked file's clauses as the next version of one document would read them; nothing is recorded. */
  async previewReviewGuidelineVersion(documentId: string, path: string | undefined): Promise<ReviewGuidelinePreviewProjection> {
    this.#assertAvailable();
    if (typeof path !== 'string' || path.length === 0) throw new StoreError('REVIEW_GUIDELINE_FILE_UNREADABLE', '请重新选择文件。');
    let read: Awaited<ReturnType<typeof readGuidelineFile>>;
    try {
      read = await readGuidelineFile(path);
    } catch (error) {
      if (error instanceof ReviewGuidelineError) throw new StoreError(error.code, error.message);
      throw error;
    }
    return this.#guidelineCall(() => this.#reviewGuidelines.preview(documentId, read));
  }

  /** 确认导入: the previewed version recorded, and the page as it now reads. */
  importReviewGuidelineVersion(previewId: string): ReviewGuidelinesProjection {
    this.#guidelineCall(() => this.#transaction(this.#authority, () => this.#reviewGuidelines.commit(previewId)));
    return this.inspectReviewGuidelines();
  }

  /**
   * 知识库 › 资料库 (Issue #427, S79c; KB-007): one page of the items the editor collected — where each belongs, whether it may
   * teach, and whose Tasks may list it under 允许参考 — newest first, after the cursor.
   */
  inspectLibraryMaterials(after: LibraryMaterialCursor | null): LibraryMaterialsProjection {
    return this.#libraryCall(() => this.#libraryMaterials.page(after));
  }

  /** One 资料库 item as its card reads it. */
  inspectLibraryMaterial(materialId: string): LibraryMaterialProjection {
    return this.#libraryCall(() => this.#libraryMaterials.item(materialId));
  }

  readLibraryDecisionReason(input: ServiceOperationMap['readLibraryDecisionReason']['input']): ServiceOperationMap['readLibraryDecisionReason']['output'] {
    return this.#libraryCall(() => this.#libraryMaterials.reasonPage(input.materialId, input.ordinal, input.offset));
  }

  /** 放入资料…'s first step: the picked file identified, measured and digested as it would arrive; nothing is kept. */
  async previewLibraryMaterial(path: string): Promise<LibraryMaterialPreviewProjection> {
    this.#assertAvailable();
    try {
      return await this.#libraryMaterials.preview(path);
    } catch (error) {
      if (error instanceof LibraryMaterialError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  /**
   * 放入资料库: the previewed file kept whole in the Agent Data Root by its digest, then its arrival recorded with the title and
   * kind the editor gave it. A title that cannot stand is refused before anything is copied.
   */
  async addLibraryMaterial(input: { previewId: string; title: string; kind: LibraryMaterialKind; bookId?: string | null }): Promise<LibraryMaterialProjection> {
    this.#assertAvailable();
    let kept: Awaited<ReturnType<LibraryMaterialLedger['keep']>>;
    try {
      libraryMaterialTitle(input.title);
      kept = await this.#libraryMaterials.keep(input.previewId);
    } catch (error) {
      if (error instanceof LibraryMaterialError) throw new StoreError(error.code, error.message);
      throw error;
    }
    const materialId = this.#libraryCall(() => this.#transaction(this.#authority, () => {
      const id = this.#libraryMaterials.record(kept, input.title, input.kind);
      const bookId = input.bookId ?? null;
      this.#libraryMaterials.decide(id, 0, { kind: 'attribution', attribution: bookId === null ? { scope: 'house' } : { scope: 'book', bookId } });
      this.#libraryMaterials.decide(id, 1, { kind: 'eligibility', choice: bookId === null ? 'house' : 'book', reason: null });
      return id;
    }));
    // Indexed on arrival (KB-007, KB-009), on this machine and in the background: the card says it waits until it is built.
    this.#scheduleMaterialIndex([materialId]);
    // The one item it made: the page it joins is read again by the renderer's own paging, never re-sent whole.
    return this.inspectLibraryMaterial(materialId);
  }

  // ---- 来源与证据 (Issue #425, plan slice S70; V2-UX-SRC-013, EGR-003, KB-008, ATTN-009) ---------------------------------

  #evidenceCall<T>(operation: () => T): T {
    return this.#libraryCall(() => {
      try {
        return operation();
      } catch (error) {
        if (error instanceof ResearchEvidenceError) throw new StoreError(error.code, error.message);
        throw error;
      }
    });
  }

  /** Why 保存为来源材料 is not offered for a retained source now; `null` when it is (a full-text capture, not yet saved). */
  #evidenceSaveRefusal(source: { captureState: ResearchEvidenceCaptureState; savedMaterialId: string | null }): string | null {
    if (source.savedMaterialId !== null) return '已经保存为来源材料。';
    if (this.replacementFrozen()) return RESEARCH_EVIDENCE_READ_ONLY;
    if (source.captureState !== 'full-text') return RESEARCH_EVIDENCE_INCOMPLETE;
    return null;
  }

  /**
   * 来源与证据 (②; SRC-013, KB-008): a page of one Book's retained external sources, newest first, with each one's capture,
   * alignment, 来源译文 and staleness as of now, and every researched unit's outcome. Read-only: nothing is fetched, sent or
   * scheduled by it.
   */
  inspectResearchEvidence(input: ServiceOperationMap['inspectResearchEvidence']['input']): ResearchEvidenceBookProjection {
    return factualVerificationOperations.inspectResearchEvidence(this.#factualVerificationOperationsHost, input);
  }

  /**
   * One researched unit's retained evidence, kept for the execution owner the moment the unit settles (SRC-013: within the
   * authorizing Task). The Run's own Book only; the unit once.
   */
  recordResearchEvidence(input: Parameters<ResearchEvidenceLedger['record']>[0]): string[] {
    return factualVerificationOperations.recordResearchEvidence(this.#factualVerificationOperationsHost, input);
  }

  // ---- Factual verification (Issue #901; FACT, EVID, EASSURE, FREV, CORR) ---------------------------------------------------

  #factualRecheckCandidate(enrollment: BackgroundAnalysisEnrollmentRecord, decisionId: string): FactualRecheckCandidate | null {
    return factualVerificationOperations.internalFactualRecheckCandidate(this.#factualVerificationOperationsHost, enrollment, decisionId);
  }

  nextFactualRecheck(): FactualRecheckCandidate | null {
    return factualVerificationOperations.nextFactualRecheck(this.#factualVerificationOperationsHost);
  }

  startFactualRecheck(candidate: FactualRecheckCandidate): FactualRecheckRun {
    return factualVerificationOperations.startFactualRecheck(this.#factualVerificationOperationsHost, candidate);
  }

  factualRecheckCurrent(run: FactualRecheckRun): boolean {
    return factualVerificationOperations.factualRecheckCurrent(this.#factualVerificationOperationsHost, run);
  }

  publishFactualRecheck(run: FactualRecheckRun, round: import('./factual-verification.js').FactualClaimRound, usage: import('./provider/classification.js').UsageFacts | null): void {
    return factualVerificationOperations.publishFactualRecheck(this.#factualVerificationOperationsHost, run, round, usage);
  }

  #verificationCall<T>(operation: () => T): T {
    return factualVerificationOperations.internalVerificationCall(this.#factualVerificationOperationsHost, operation);
  }

  /** The edits one frozen plan version of a Task names, read from its execution plan. */
  #frozenPlanEdits(taskIntentId: string, ordinal: number): PlanEditsProjection {
    return factualVerificationOperations.internalFrozenPlanEdits(this.#factualVerificationOperationsHost, taskIntentId, ordinal);
  }

  /**
   * The level a 事实核查 Run executes under, recorded once as it starts (EASSURE-002, D9): the level its plan froze, lowered to
   * 快速整理 with its disclosure only when this device reads offline then. The execution owner calls it; nothing else lowers it.
   */
  recordFactualRunAssurance(input: { bookId: string; runRecordId: string; taskIntentId: string; offline: boolean }): FactualRunAssuranceProjection {
    return factualVerificationOperations.recordFactualRunAssurance(this.#factualVerificationOperationsHost, input);
  }

  /** The current working text of a Review Run's branch and its pinned revision's blocks, as the verification ledger reads them. */
  #manuscriptReader(branchId: string, manuscriptId: string): ManuscriptReader {
    return factualVerificationOperations.internalManuscriptReader(this.#factualVerificationOperationsHost, branchId, manuscriptId);
  }

  #reviewRunBranch(bookId: string, reviewRunId: string): { branchId: string; manuscriptId: string } {
    return factualVerificationOperations.internalReviewRunBranch(this.#factualVerificationOperationsHost, bookId, reviewRunId);
  }

  #bookManuscript(bookId: string): { branchId: string; manuscriptId: string } | null {
    return factualVerificationOperations.internalBookManuscript(this.#factualVerificationOperationsHost, bookId);
  }

  /**
   * The Versioned Verification Results of one Review Run's completed or eligible retained 事实核查 output (FREV-001), recorded once it has put its
   * findings on the manuscript: each finding with the relations and Correction Variants the Run's model stated for its
   * assertions, which the ledger checks against what the Run captured. Repeating it records nothing more.
   */
  #materializeFactualVerification(reviewRunId: string): void {
    return factualVerificationOperations.internalMaterializeFactualVerification(this.#factualVerificationOperationsHost, reviewRunId);
  }

  /** Record the results of a Review Run's 事实核查 category if it has formed them and they are not yet recorded. */
  materializeFactualVerification(reviewRunId: string): void {
    return factualVerificationOperations.materializeFactualVerification(this.#factualVerificationOperationsHost, reviewRunId);
  }

  /** The Fact-check Lens (FACT-004, FACT-005, FACT-007): one bounded page over the existing cursor paging; a read. */
  inspectFactualVerification(input: InspectFactualVerificationInput): FactualVerificationLensProjection {
    return factualVerificationOperations.inspectFactualVerification(this.#factualVerificationOperationsHost, input);
  }

  #resultBinding(bookId: string, resultId: string): { reader: ManuscriptReader } {
    return factualVerificationOperations.internalResultBinding(this.#factualVerificationOperationsHost, bookId, resultId);
  }

  /** The Evidence Workspace of one result (EVID-001 to EVID-013): a read; it creates no mutation of any kind (EVID-012). */
  inspectEvidenceWorkspace(input: InspectEvidenceWorkspaceInput): EvidenceWorkspaceProjection {
    return factualVerificationOperations.inspectEvidenceWorkspace(this.#factualVerificationOperationsHost, input);
  }

  /**
   * 记录核查审阅决定 (FREV-006): one immutable Review Decision bound to the result version the editor read. 要求补充证据 names the
   * range and level of the supplementary check it asks for; no Task is prepared until the factual update modes land (#905).
   */
  recordVerificationReviewDecision(input: RecordVerificationReviewDecisionInput): VerificationReviewDecisionRecordedProjection {
    return factualVerificationOperations.recordVerificationReviewDecision(this.#factualVerificationOperationsHost, input);
  }

  /** 准备更正提案 (CORR-001): the draft offer; a read. */
  prepareCorrectionProposal(input: PrepareCorrectionProposalInput): CorrectionProposalDraftProjection {
    return factualVerificationOperations.prepareCorrectionProposal(this.#factualVerificationOperationsHost, input);
  }

  /**
   * 保存为更正提案 (CORR-011, CORR-012): one ordinary 修改建议 per included range, made by the same producer every AI7 mark is
   * made by (the precedent is 转为修改建议 of a dialogue), and the factual lineage of each beside it in one transaction. No
   * Proposal Decision, Apply or manuscript change is made; the marks then go the ordinary decision → Apply → receipt way.
   */
  saveCorrectionProposal(input: SaveCorrectionProposalInput): CorrectionProposalSavedProjection {
    return factualVerificationOperations.saveCorrectionProposal(this.#factualVerificationOperationsHost, input);
  }

  /**
   * 保存为来源材料 (SRC-001's explicit retention; KB-007): the editor keeps one retained full-text source as a 资料库 item — its
   * captured text, a 网页 titled as the editor names it — with its provenance, and the item is indexed on arrival. Its
   * attribution and Learning Eligibility stay the editor's to decide, so no Task may list it yet. Refused while the house is
   * read-only, for a source that is only an excerpt or was not retrieved, and for one already saved. Nothing is sent,
   * published or exported, and no release authority is made.
   */
  async saveEvidenceAsMaterial(input: ServiceOperationMap['saveEvidenceAsMaterial']['input']): Promise<ServiceOperationMap['saveEvidenceAsMaterial']['output']> {
    this.#assertAvailable();
    const source = this.#evidenceCall(() => {
      requireStore(this.#authority.prepare('SELECT 1 FROM books WHERE book_id = ?').get(input.bookId) !== undefined, 'BOOK_NOT_FOUND', '所选图书不存在。');
      return this.#researchEvidence.source(input.bookId, input.evidenceId);
    });
    requireStore(!this.replacementFrozen(), 'RESEARCH_EVIDENCE_BOOK_READ_ONLY', RESEARCH_EVIDENCE_READ_ONLY);
    requireStore(source.savedMaterialId === null, 'RESEARCH_EVIDENCE_ALREADY_SAVED', '这条外部来源已经保存为来源材料。');
    requireStore(source.captureState === 'full-text' && source.content !== null && source.contentSha256 !== null,
      'RESEARCH_EVIDENCE_INCOMPLETE', RESEARCH_EVIDENCE_INCOMPLETE);
    let host = 'source';
    try { host = new URL(source.url).hostname; } catch { /* the CHECK keeps every address https */ }
    const title = input.title === null ? (source.sourceTitle ?? host) : input.title;
    let kept: Awaited<ReturnType<LibraryMaterialLedger['keep']>>;
    const staging = await ensureCanonicalDataDirectory(this.#dataRoot, 'research-evidence-staging');
    const staged = await inspectCanonicalDataFile(this.#dataRoot, staging, `${host}-${randomUUID()}.md`);
    try {
      libraryMaterialTitle([...title].slice(0, MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES).join(''));
      await writeFile(staged.path, source.content, { encoding: 'utf8', flag: 'wx' });
      const preview = await this.#libraryMaterials.preview(staged.path);
      kept = await this.#libraryMaterials.keep(preview.previewId);
    } catch (error) {
      if (error instanceof LibraryMaterialError) throw new StoreError(error.code, error.message);
      throw error;
    } finally {
      await rm(staged.path, { force: true });
    }
    const materialId = this.#evidenceCall(() => this.#transaction(this.#authority, () => {
      // The file preparation above yields; replacement may have frozen the Book in the meantime.
      requireStore(!this.replacementFrozen(), 'RESEARCH_EVIDENCE_BOOK_READ_ONLY', RESEARCH_EVIDENCE_READ_ONLY);
      const id = this.#libraryMaterials.record(kept, [...title].slice(0, MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES).join(''), 'web', {
        kind: 'research-evidence', evidenceId: source.evidenceId, bookId: source.bookId, runRecordId: source.runRecordId, url: source.url,
        capturedAt: source.capturedAt, contentSha256: source.contentSha256!, pageSha256: source.pageSha256, snapshotDigest: source.snapshotDigest,
      });
      this.#researchEvidence.linkMaterial(source.evidenceId, id);
      return id;
    }));
    this.#scheduleMaterialIndex([materialId]);
    return { evidenceId: source.evidenceId, material: this.inspectLibraryMaterial(materialId) };
  }

  // ---- 资料索引 (Issue #428, plan slice S80a; editor-surfaces §8.4, V2-UX-KB-009, ATTN-009) ---------------------------------

  /**
   * Every item still without a Material Index by the current indexer, queued in arrival order: called once the service
   * serves, so an item that arrived before this revision, came with a merged Book, or whose build a closing service stopped,
   * is built now, and every later arrival as it arrives. Nothing is asked: indexing is automatic (editor-surfaces §0.3 少打扰).
   */
  startMaterialIndexing(): void {
    return materialIndexOperations.startMaterialIndexing(this.#materialIndexOperationsHost);
  }

  /**
   * Whether the Material Index builder could still write (#729): a build under way or items waiting for one. A replacement
   * is not prepared meanwhile (`replacementBlockedBy`), as it is not while a Run or a 后台分析登记 pass is under way.
   */
  materialIndexing(): boolean {
    return materialIndexOperations.materialIndexing(this.#materialIndexOperationsHost);
  }

  /**
   * The builds a freeze held back, queued again once it lifts (#729): after 取消替换, or a preparation that did not end in a
   * replacement waiting. Only for a store that serves; never a reason for the call that lifted the freeze to fail.
   */
  #resumeMaterialIndexing(): void {
    return materialIndexOperations.internalResumeMaterialIndexing(this.#materialIndexOperationsHost);
  }

  /** Resolves once the queue is empty: for a caller that must see the index built. */
  async settleMaterialIndexing(): Promise<void> {
    return materialIndexOperations.settleMaterialIndexing(this.#materialIndexOperationsHost);
  }

  /** Resolves once no similarity vectors or 来源译文 are being made (Issue #892): for a caller that must see them recorded. */
  async settleMaterialLayers(): Promise<void> {
    return materialIndexOperations.settleMaterialLayers(this.#materialIndexOperationsHost);
  }

  #scheduleMaterialIndex(materialIds: ReadonlyArray<string>): void {
    return materialIndexOperations.internalScheduleMaterialIndex(this.#materialIndexOperationsHost, materialIds);
  }

  /**
   * One build after another: the original read outside any transaction, then the build and its segments written in one. An
   * item already built is passed over; a replacement being prepared or waiting holds every write back until the next open,
   * which builds what is still missing. A failure to read is itself a build — the card says why — and only a stop, or a
   * store that can no longer write, leaves an item for the next open.
   */
  async #pumpMaterialIndex(): Promise<void> {
    return materialIndexOperations.internalPumpMaterialIndex(this.#materialIndexOperationsHost);
  }

  #materialIndexCall<T>(operation: () => T): T {
    return materialIndexOperations.internalMaterialIndexCall(this.#materialIndexOperationsHost, operation);
  }

  /** 查看分段 (KB-009): one page of an item's indexed paragraphs and sentence anchors; read-only. */
  inspectLibraryMaterialSegments(input: ServiceOperationMap['inspectLibraryMaterialSegments']['input']): ServiceOperationMap['inspectLibraryMaterialSegments']['output'] {
    return materialIndexOperations.inspectLibraryMaterialSegments(this.#materialIndexOperationsHost, input);
  }

  /**
   * What a Task's plan freezes when it lists a 资料库 item under 允许参考 (KB-002, KB-007): the item and its exact index version,
   * only for an item this Book's Tasks may list and whose text was read. 写作任务 pins each item it lists (Issue #428).
   */
  pinMaterialReference(bookId: string, materialId: string): MaterialReferencePin {
    return materialIndexOperations.pinMaterialReference(this.#materialIndexOperationsHost, bookId, materialId);
  }

  /**
   * A Task's read of the Material Index (KB-009): read-only, within its plan boundary — the items its plan lists at the index
   * versions it pinned, which this Book's Tasks may still list. Nothing is written, sent or scheduled by it; what the Task
   * sends of what it read stays bounded by the plan's 发送 line. 写作任务 reads each item it lists through it (Issue #428).
   */
  readMaterialIndexForTask(boundary: MaterialReferenceBoundary, materialId: string, from: number): MaterialTaskReading {
    return materialIndexOperations.readMaterialIndexForTask(this.#materialIndexOperationsHost, boundary, materialId, from);
  }

  // ---- 相似段落检索 and 来源译文 (Issue #892; editor-surfaces §8.4, V2-UX-KB-009) ---------------------------------------------

  /** The store's similarity provider: the built-in one in every test, CI run and test guest, and until a model adapter is admitted. */
  embeddingProvider(): EmbeddingProvider {
    return materialIndexOperations.embeddingProvider(this.#materialIndexOperationsHost);
  }

  #embeddingFacts(): MaterialEmbeddingFacts {
    return materialIndexOperations.internalEmbeddingFacts(this.#materialIndexOperationsHost);
  }

  /** Who makes 来源译文 under this launch — the service sets it once it serves; `null` refuses every request. */
  useMaterialTranslator(translator: MaterialTranslator | null): void {
    return materialIndexOperations.useMaterialTranslator(this.#materialIndexOperationsHost, translator);
  }

  /** Whether 生成来源译文 may be asked for an item, by its original's SHA-256, now; in the editor's words when not. */
  #translationRequest(sha256: string): MaterialTranslationProjection['request'] {
    return materialIndexOperations.internalTranslationRequest(this.#materialIndexOperationsHost, sha256);
  }

  #layerActivity(materialId: string, sha256: string): MaterialLayerActivity {
    return materialIndexOperations.internalLayerActivity(this.#materialIndexOperationsHost, materialId, sha256);
  }

  /**
   * 构建相似索引 (Issue #892; KB-009): the item's current build gets its similarity vectors, made on this machine by the
   * store's provider, a batch at a time beside the service's other work — never on open, only when the editor asks. Refused
   * before its text was read, while the provider's model files are missing, or while a database replacement waits; asking
   * again for vectors already complete or under way changes nothing. Nothing is sent.
   */
  buildMaterialVectors(materialId: string): LibraryMaterialProjection {
    return materialIndexOperations.buildMaterialVectors(this.#materialIndexOperationsHost, materialId);
  }

  #startVectorPump(): void {
    return materialIndexOperations.internalStartVectorPump(this.#materialIndexOperationsHost);
  }

  /** The items the idle lane queued, which give way while the editor works; and whether the lane is idle now (Issue #1166). */
  readonly #idleVectorItems = new Set<string>();
  #vectorLaneIdle = true;

  /**
   * 资料索引 on the idle lane (Issue #1166; ADR 0095 §3): each pass of the background dispatcher says whether the editor is
   * quiet. While quiet, every Book with an active 资料索引 Background Processing Enrollment has the items it may refer to —
   * retained research sources saved as 来源材料 among them — queued for their similarity vectors, beside any the editor asked
   * for; once the editor is back, those items stop after the batch under way, and the next quiet pass goes on from the first
   * paragraph still without its vector. A provider that is not ready, or no enrollment in force, builds nothing, and retrieval
   * ranks those items lexically. Nothing is sent.
   */
  indexIdleMaterialVectors(idle: boolean): void {
    return materialIndexOperations.indexIdleMaterialVectors(this.#materialIndexOperationsHost, idle);
  }

  /**
   * One item's vectors after another, `MATERIAL_VECTOR_BATCH` paragraphs at a time: each batch embedded outside any
   * transaction, then written in one, the service taking its other work between two. A stop, a replacement waiting or a
   * store that can no longer write ends the item's run; what was recorded stays and the next request goes on from there.
   */
  async #pumpMaterialVectors(): Promise<void> {
    return materialIndexOperations.internalPumpMaterialVectors(this.#materialIndexOperationsHost);
  }

  /**
   * 相似段落检索 in an item's 查看索引 (Issue #892): its paragraphs nearest the editor's text, by the vectors the editor built;
   * read-only, on this machine. The ranking finds candidates; the words are read where each anchor points (ADR 0026).
   */
  async searchLibraryMaterialVectors(input: ServiceOperationMap['queryMaterialVectors']['input']): Promise<MaterialVectorSearchProjection> {
    return materialIndexOperations.searchLibraryMaterialVectors(this.#materialIndexOperationsHost, input);
  }

  /**
   * A Task's similarity search over the 资料库 items its plan lists (Issue #892; KB-009, ADR 0026, ADR 0047): read-only, within
   * its plan boundary exactly as `readMaterialIndexForTask` — every item searched is one its plan lists (`materialIds`, when
   * given, must each be one), at the build its plan pinned, which this Book's Tasks may still list. Each pinned build is
   * searched by its own vectors; one without them is listed as not searched, never built here. Candidates are pointers:
   * their words are read through `readMaterialIndexForTask` from the candidate's paragraph. Nothing is written, sent or
   * scheduled, and a built index grants no Run scope, egress or learning eligibility.
   */
  async queryMaterialVectors(boundary: MaterialReferenceBoundary, text: string, k: number, materialIds?: readonly string[]): Promise<MaterialVectorQuery> {
    return materialIndexOperations.queryMaterialVectors(this.#materialIndexOperationsHost, boundary, text, k, materialIds);
  }

  /**
   * 生成来源译文 (Issue #892; KB-009): a non-Chinese item's paragraphs translated by the Fast Interaction Role under the selected
   * policy's rule, a bounded batch per request, each translation recorded beside the paragraph it translates — labelled,
   * attributed, never in its place. Refused before anything is sent when no rule names it (「当前策略未开放来源译文」), when
   * the text is Chinese or not read, or while another item's is being made. The requests run beside the service's request
   * loop; the item is read again until it settles. A request that fails or whose answer does not align stops the run, says
   * why, and is never sent again on its own; asking again goes on from the first paragraph without one.
   */
  requestMaterialTranslation(materialId: string): LibraryMaterialProjection {
    return materialIndexOperations.requestMaterialTranslation(this.#materialIndexOperationsHost, materialId);
  }

  async #translateMaterial(materialId: string, translator: MaterialTranslator, originalSha256: string): Promise<void> {
    return materialIndexOperations.internalTranslateMaterial(this.#materialIndexOperationsHost, materialId, translator, originalSha256);
  }

  /** Pinned revision authority, shared by Run and foreground attempt retrieval; no working-head substitution. */
  manuscriptRetrievalSource(bookId: string, manuscriptId: string, revisionId: string): RetrievalSource {
    const revision = this.#authority.prepare('SELECT mr.revision_digest FROM manuscript_revisions mr JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id WHERE m.book_id = ? AND mr.manuscript_id = ? AND mr.revision_id = ?')
      .get(bookId, manuscriptId, revisionId) as SqlRow | undefined;
    if (revision === undefined) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    const digest = asString(revision.revision_digest);
    return { sourceKind: 'manuscript', sourceId: manuscriptId, digest, read: () => {
      const current = this.#authority.prepare('SELECT revision_digest FROM manuscript_revisions WHERE manuscript_id = ? AND revision_id = ?').get(manuscriptId, revisionId) as SqlRow | undefined;
      if (current === undefined || current.revision_digest !== digest) throw new RetrievalError('RETRIEVAL_SOURCE_MOVED');
      const blocks = this.#baselineAnalysis.readRevisionBlocks(manuscriptId, revisionId);
      if (blocks.length === 0 || blocks.some((block) => sha256(canonicalJson({ kind: block.kind, level: block.level, text: block.text })) !== block.digest)) throw new RetrievalError('RETRIEVAL_SOURCE_MOVED');
      return { digest, segments: blocks.map((block) => ({ blockId: block.blockId, text: block.text })) };
    } };
  }

  retrievalSourcesForRun(runRecordId: string, ledger: BaselineAnalysisStore): RetrievalSource[] {
    return this.#runRetrieval(runRecordId, ledger).sources;
  }

  /** A Run's disposable index over exactly its pinned sources, ranked lexically and by this store's local vectors (#892). */
  retrievalIndexForRun(runRecordId: string, ledger: BaselineAnalysisStore): RetrievalIndex {
    const { boundary, sources } = this.#runRetrieval(runRecordId, ledger);
    const facts = ledger.loadExecutionPlan(runRecordId);
    const submitted = facts.update === null ? null : new Set(facts.update.reusePlan.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => unit.unitOrdinal));
    const allowed = new Set(facts.manifest.units.filter((unit) => submitted === null || submitted.has(unit.ordinal)).flatMap((unit) => [...unit.blockIds, ...unit.overlapBlockIds]));
    const scoped = facts.compositionOptions?.version !== 2 ? sources : sources.map((source) => source.sourceKind !== 'manuscript' ? source : {
      ...source, read: () => { const reading = source.read(); return { ...reading, segments: reading.segments.filter((segment) => segment.blockId !== undefined && allowed.has(segment.blockId)) }; },
    });
    return new RetrievalIndex(scoped, this.#embedding, this.#materialVectorQuery(boundary), ledger.pinnedToolSourcesForRun(runRecordId));
  }

  #runRetrieval(runRecordId: string, ledger: BaselineAnalysisStore): { boundary: MaterialReferenceBoundary; sources: RetrievalSource[] } {
    const facts = ledger.loadExecutionPlan(runRecordId);
    const boundary = ledger.definition.kind === 'writing' ? this.#writingTasks.materialBoundary(facts.taskIntentId, ledger.definition.promptContractDigest)
      : { bookId: facts.bookId, references: ledger.definition.materialReferences?.sources ?? [] };
    return { boundary, sources: [this.manuscriptRetrievalSource(facts.bookId, facts.checkpoint.manuscriptId, facts.checkpoint.revisionId),
      ...materialRetrievalSources(boundary, (scope, id, from) => this.readMaterialIndexForTask(scope, id, from))] };
  }

  /** The pinned builds' own vectors through the Task seam; an item without them is ranked lexically only. */
  #materialVectorQuery(boundary: MaterialReferenceBoundary): RetrievalMaterialVectorQuery {
    return async (query, k) => (await this.queryMaterialVectors(boundary, query, k)).candidates
      .map(({ materialId, indexDigest, ordinal, score }) => ({ materialId, indexDigest, ordinal, score }));
  }

  dialogueRetrievalSources(dialogueId: string): RetrievalSource[] {
    const task = this.#dialogues.task(dialogueId);
    if (task === null) throw new RetrievalError('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    return [this.manuscriptRetrievalSource(task.bookId, task.manuscriptId, task.revisionId)];
  }

  dialogueRetrievalIndex(dialogueId: string): RetrievalIndex {
    return new RetrievalIndex(this.dialogueRetrievalSources(dialogueId), this.#embedding);
  }

  /** Editor-side discovery: no Run, no model, no persisted projection or implicit reference selection. */
  async searchReferableMaterials(input: ServiceOperationMap['searchReferableMaterials']['input']): Promise<ServiceOperationMap['searchReferableMaterials']['output']> {
    requireStore(UUID_PATTERN.test(input.bookId) && input.query.trim().length > 0 && input.query.length <= 1_000 && Number.isSafeInteger(input.k) && input.k >= 1 && input.k <= 8,
      'RETRIEVAL_ARGUMENTS_INVALID', '检索文字须在 1 至 1,000 字符之间，最多显示 8 项。');
    const references = this.#libraryMaterials.referable(input.bookId).flatMap((item) => {
      try { return [this.pinMaterialReference(input.bookId, item.materialId)]; } catch { return []; }
    });
    const boundary = { bookId: input.bookId, references };
    const index = new RetrievalIndex(materialRetrievalSources(boundary, (scope, id, from) => this.readMaterialIndexForTask(scope, id, from)),
      this.#embedding, this.#materialVectorQuery(boundary));
    try { return { candidates: await index.retrieve(input.query, input.k, ['material']) }; } finally { index.dispose(); }
  }

  /** 定归属 or 定学习准入 (KB-007, LEARN-007): one decision appended to the item's chain, and the item as it now reads. */
  decideLibraryMaterial(input: { materialId: string; expectedDecisions: number; decision: LibraryMaterialDecisionInput }): LibraryMaterialProjection {
    this.#libraryCall(() => this.#transaction(this.#authority, () =>
      this.#libraryMaterials.decide(input.materialId, input.expectedDecisions, input.decision)));
    return this.inspectLibraryMaterial(input.materialId);
  }

  /** 知识库 › 评估方案 (Issue #429, S81a; KB-001, EVAL-003): the profile a new 评估 version snapshots, and its use. */
  inspectEvaluationProfiles(before: number | null = null): EvaluationProfilesProjection {
    return initialEvaluationOperations.inspectEvaluationProfiles(this.#initialEvaluationOperationsHost, before);
  }

  saveEvaluationProfile(input: SaveEvaluationProfileInput): EvaluationProfilesProjection {
    return initialEvaluationOperations.saveEvaluationProfile(this.#initialEvaluationOperationsHost, input);
  }

  /** ②C 评估 of one Book (Issue #429, S81a; EVAL-001, EVAL-012): its versions, one on show, and whether one can begin. */
  inspectEvaluation(bookId: string, recordId: string | null, recordsBefore?: number | null): EvaluationWorkspaceProjection {
    return initialEvaluationOperations.inspectEvaluation(this.#initialEvaluationOperationsHost, bookId, recordId, recordsBefore);
  }

  /**
   * 开始评估 or 重新评估: a new version bound to the manuscript's current revision, and the page with it on show — begun from
   * AI7's latest 初评 when `fromInitial` (Issue #429, S81b1), and skipping a latest version that cannot be read only when
   * `skipDamaged` says the editor saw it skipped (Issue #726).
   */
  startEvaluation(bookId: string, fromInitial = false, skipDamaged = false): EvaluationWorkspaceProjection {
    return initialEvaluationOperations.startEvaluation(this.#initialEvaluationOperationsHost, bookId, fromInitial, skipDamaged);
  }

  // ---- AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-001, EVAL-005 to EVAL-007) ----------------------------------------

  #withEvaluationMaterials(page: EvaluationWorkspaceProjection): EvaluationWorkspaceProjection {
    return initialEvaluationOperations.internalWithEvaluationMaterials(this.#initialEvaluationOperationsHost, page);
  }

  #evaluationPlanMaterials(ledger: BaselineAnalysisStore, bookId: string, authorized: boolean): ReadonlyArray<TaskMaterialReading> {
    return initialEvaluationOperations.internalEvaluationPlanMaterials(this.#initialEvaluationOperationsHost, ledger, bookId, authorized);
  }

  #evaluationMaterialPlan(taskIntentId: string): { boundary: TaskMaterialBoundary; baseDigest: string; promptDigest: string } | null {
    return initialEvaluationOperations.internalEvaluationMaterialPlan(this.#initialEvaluationOperationsHost, taskIntentId);
  }

  /** The 初评 contract of one profile: the built-in ledger's own for AI7's default profile, else the house version's (Issue #427). */
  #initialBaseDefinition(profile: EvaluationProfileProjection): AnalysisKindDefinition {
    return initialEvaluationOperations.internalInitialBaseDefinition(this.#initialEvaluationOperationsHost, profile);
  }

  /**
   * The 初评 ledger of one profile and the 资料库 references a plan lists (Issue #427, #428): the built-in ledger for AI7's default
   * profile with none, else one kept per contract — made afresh when a reference no longer reads, as #428's always was.
   */
  #initialLedger(profile: EvaluationProfileProjection, materials?: TaskMaterialBoundary, frozenPromptDigest?: string, scopes?: ReadonlyArray<FrozenSeriesScope>): BaselineAnalysisStore {
    return initialEvaluationOperations.internalInitialLedger(this.#initialEvaluationOperationsHost, profile, materials, frozenPromptDigest, scopes);
  }

  /** The profile contract a ledger's Task snapshots its profile under: the base a plan's references wrap, or the contract itself. */
  #initialBaseDigest(ledger: BaselineAnalysisStore): string {
    return initialEvaluationOperations.internalInitialBaseDigest(this.#initialEvaluationOperationsHost, ledger);
  }

  /**
   * The profile a 初评 Task froze (Issue #427): its snapshot under the profile contract its plan names — the base its 资料库
   * references wrap (#428), or the plan's own contract — and AI7's built-in profile for a Task from before house versions.
   */
  #initialProfileForTask(taskIntentId: string): EvaluationProfileProjection {
    return initialEvaluationOperations.internalInitialProfileForTask(this.#initialEvaluationOperationsHost, taskIntentId);
  }

  /** One 初评 Task's ledger: its frozen profile and its frozen 资料库 references, both from its own plan (Issue #427, #428). */
  #initialLedgerForTask(taskIntentId: string): BaselineAnalysisStore {
    return initialEvaluationOperations.internalInitialLedgerForTask(this.#initialEvaluationOperationsHost, taskIntentId);
  }

  /**
   * The ledger of the Book's latest 初评 Task — or, with `materials`, the one a new preparation under the house's current profile
   * lists them on; with no Task yet, the current profile's.
   */
  initialEvaluationLedgerForBook(bookId: string, materials?: TaskMaterialBoundary): BaselineAnalysisStore {
    return initialEvaluationOperations.initialEvaluationLedgerForBook(this.#initialEvaluationOperationsHost, bookId, materials);
  }

  initialEvaluationLedgerForRun(runRecordId: string): BaselineAnalysisStore {
    return initialEvaluationOperations.initialEvaluationLedgerForRun(this.#initialEvaluationOperationsHost, runRecordId);
  }

  #snapshotInitialPreparation(result: AnalysisPreparationResult<AnalysisProjection>, profile: EvaluationProfileProjection, ledger: BaselineAnalysisStore): void {
    return initialEvaluationOperations.internalSnapshotInitialPreparation(this.#initialEvaluationOperationsHost, result, profile, ledger);
  }

  /**
   * The built-in profile's 初评 ledger, which the launch is bound through; service-internal. A house profile's or a plan's
   * references' ledger takes that binding when made, and a Run is admitted on its own Task's ledger, never on the last one used.
   */
  get initialEvaluationLedger(): BaselineAnalysisStore {
    this.#assertAvailable();
    return this.#initialEvaluation;
  }

  /** The Book's AI7 初评 Task, latest Result Set Revision and history, as the evaluation kind's ledger holds them. */
  inspectInitialEvaluation(bookId: string, progress?: ProgressReader, revisionId: string | null = null): InitialEvaluationProjection {
    return initialEvaluationOperations.inspectInitialEvaluation(this.#initialEvaluationOperationsHost, bookId, progress, revisionId);
  }

  /**
   * 准备 AI7 初评: the evaluation kind's Task in the mode that applies — the first 初评, or 重新初评 once one settled — whose
   * goal is the kind's own fixed text. The preparation is a cooperative job; its plan opens in the Task Drawer.
   */
  createInitialEvaluationPreparationWork(bookId: string, launchPolicy: LaunchPolicyProjection, materialIds: ReadonlyArray<string> = [], redoOf: string | null = null, seriesId: string | null = null): AnalysisPreparationResult<InitialEvaluationProjection> {
    return initialEvaluationOperations.createInitialEvaluationPreparationWork(this.#initialEvaluationOperationsHost, bookId, launchPolicy, materialIds, redoOf, seriesId);
  }

  advanceInitialEvaluationPreparationWork(workId: string): AnalysisPreparationResult<InitialEvaluationProjection> {
    return initialEvaluationOperations.advanceInitialEvaluationPreparationWork(this.#initialEvaluationOperationsHost, workId);
  }

  cancelInitialEvaluationPreparationWork(workId: string): boolean {
    return initialEvaluationOperations.cancelInitialEvaluationPreparationWork(this.#initialEvaluationOperationsHost, workId);
  }

  /** 开始任务 in the drawer's bar: the standard-direct Run Authorization and the Run; the caller hands the Run to the owner. */
  authorizeInitialEvaluation(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    start: 'now' | 'when-online' | 'idle' = 'now',
  ): { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore } {
    return initialEvaluationOperations.authorizeInitialEvaluation(this.#initialEvaluationOperationsHost, bookId, taskIntentId, planEnvelopeDigest, start);
  }

  /**
   * Material-bearing evaluation requires the same kind's selected rule to admit frozen material.
   */
  #requireEvaluationMaterialScope(hasReferences: boolean, kind: string): void {
    return initialEvaluationOperations.internalRequireEvaluationMaterialScope(this.#initialEvaluationOperationsHost, hasReferences, kind);
  }

  #requireEvaluationMaterialReadings(ledger: BaselineAnalysisStore, bookId: string): void {
    return initialEvaluationOperations.internalRequireEvaluationMaterialReadings(this.#initialEvaluationOperationsHost, ledger, bookId);
  }

  /**
   * 初评 runs only where it may be sent (Issue #429): under a live scope the selected policy must name the kind in one rule that
   * carries every category its contract sends; the ledger then admits its exact contract and binding. Without that rule nothing
   * is prepared or started there, and 评估 says why. The provider-free scope is unaffected.
   */
  #requireInitialEvaluationScope(): void {
    return initialEvaluationOperations.internalRequireInitialEvaluationScope(this.#initialEvaluationOperationsHost);
  }

  /** Whether the launch is live and its selected policy names no rule that admits this evaluation kind (Issue #429). */
  #evaluationLiveRefused(kind: typeof INITIAL_EVALUATION_KIND | typeof READERS_REPORT_KIND | typeof EVALUATION_REWRITE_KIND): boolean {
    return initialEvaluationOperations.internalEvaluationLiveRefused(this.#initialEvaluationOperationsHost, kind);
  }

  /** AI7's latest settled 初评 as 评估 snapshots it; `null` while there is none, or the Book cannot be evaluated by AI7 at all. */
  #initialEvaluationFacts(bookId: string): InitialEvaluationFacts | null {
    return initialEvaluationOperations.internalInitialEvaluationFacts(this.#initialEvaluationOperationsHost, bookId);
  }

  /**
   * The Book's 初评 Task as 评估 offers it: the latest Task the drawer opens, and whether one can be prepared now — not while a
   * Run of it is under way or waiting, and not for a Book AI7 cannot read, which says why.
   */
  #initialEvaluationTask(bookId: string): Pick<EvaluationInitialProjection, 'task' | 'prepare'> {
    return initialEvaluationOperations.internalInitialEvaluationTask(this.#initialEvaluationOperationsHost, bookId);
  }

  // ---- 审稿意见 (Issue #429, plan slice S81c; V2-UX-EVAL-013; editor-surfaces §5 ②C) -------------------------------------

  /** What the 审稿意见 operations in readers-reports.ts reach of the store (Issue #1172), read live. */
  readonly #readersReportHost: readersReportOperations.ReadersReportStoreHost = this.#readersReportHostOf();

  #readersReportHostOf(): readersReportOperations.ReadersReportStoreHost {
    const store = this;
    return {
      analysisCall: this.#analysisCall.bind(this),
      assertAvailable: this.#assertAvailable.bind(this),
      get authority() { return store.#authority; },
      get bookPeople() { return store.#bookPeople; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get boundedAuthority() { return store.#boundedAuthority; },
      boundedCall: this.#boundedCall.bind(this),
      get control() { return store.#control; },
      documentCall: this.#documentCall.bind(this),
      get documentWorkflow() { return store.#documentWorkflow; },
      evaluationCall: this.#evaluationCall.bind(this),
      evaluationBookTitle: this.#evaluationBookTitle.bind(this),
      evaluationLiveRefused: this.#evaluationLiveRefused.bind(this),
      evaluationMaterialPlan: this.#evaluationMaterialPlan.bind(this),
      evaluationRecordOrdinal: this.#evaluationRecordOrdinal.bind(this),
      get evaluations() { return store.#evaluations; },
      exemplarSources: this.#exemplarSources.bind(this),
      importedCall: this.#importedCall.bind(this),
      get importedExemplars() { return store.#importedExemplars; },
      learningCall: this.#learningCall.bind(this),
      get learningEligibility() { return store.#learningEligibility; },
      get inspectEvaluation() { return store.inspectEvaluation.bind(store); },
      ledgerTaskOf: this.#ledgerTaskOf.bind(this),
      prepareTaskMaterials: this.#prepareTaskMaterials.bind(this),
      get productionDocuments() { return store.#productionDocuments; },
      publicationCall: this.#publicationCall.bind(this),
      get publicationVersions() { return store.#publicationVersions; },
      readersReportCall: this.#readersReportCall.bind(this),
      readersReportExemplars: (bookId) => readersReportOperations.readersReportExemplars(this.#readersReportHost, bookId),
      get readersReportLedgers() { return store.#readersReportLedgers; },
      get readersReports() { return store.#readersReports; },
      requireEvaluationMaterialScope: this.#requireEvaluationMaterialScope.bind(this),
      requireLedgerKindScope: this.#requireLedgerKindScope.bind(this),
      taskMaterialReadings: this.#taskMaterialReadings.bind(this),
      transaction: this.#transaction.bind(this),
    };
  }

  readersReportLedger(input: ReadersReportContractInput, materials?: TaskMaterialBoundary, frozenPromptDigest?: string): BaselineAnalysisStore {
    return readersReportOperations.readersReportLedger(this.#readersReportHost, input, materials, frozenPromptDigest);
  }

  #readersReportCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof ReadersReportError || error instanceof AnalysisError || error instanceof EvaluationError) {
        throw new StoreError(error.code, error.message);
      }
      throw error;
    }
  }

  inspectReadersReport(bookId: string, progress?: ProgressReader): ReadersReportProjection | null {
    return readersReportOperations.inspectReadersReport(this.#readersReportHost, bookId, progress);
  }

  #evaluationRecordOrdinal(recordId: string): number {
    return readersReportOperations.evaluationRecordOrdinal(this.#readersReportHost, recordId);
  }

  createReadersReportPreparationWork(bookId: string, template: ReadersReportTemplate, launchPolicy: LaunchPolicyProjection, materialIds: ReadonlyArray<string> = [], redoOf: string | null = null): AnalysisPreparationResult<ReadersReportProjection> {
    return readersReportOperations.createReadersReportPreparationWork(this.#readersReportHost, bookId, template, launchPolicy, materialIds, redoOf);
  }

  advanceReadersReportPreparationWork(workId: string): AnalysisPreparationResult<ReadersReportProjection> {
    return readersReportOperations.advanceReadersReportPreparationWork(this.#readersReportHost, workId);
  }

  cancelReadersReportPreparationWork(workId: string): boolean {
    return readersReportOperations.cancelReadersReportPreparationWork(this.#readersReportHost, workId);
  }

  authorizeReadersReport(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    start: 'now' | 'when-online' | 'idle' = 'now',): { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore } {
    return readersReportOperations.authorizeReadersReport(this.#readersReportHost, bookId, taskIntentId, planEnvelopeDigest, start);
  }

  reconcileStoppedReadersReportRuns(): { settled: number } {
    return readersReportOperations.reconcileStoppedReadersReportRuns(this.#readersReportHost);
  }

  createReadersReportDraft(bookId: string, revisionId: string): EvaluationWorkspaceProjection {
    return readersReportOperations.createReadersReportDraft(this.#readersReportHost, bookId, revisionId);
  }

  // ---- 写作任务 (Issue #432, plan slice S84a; V2-UX-DELIV-007, KB-004; editor-surfaces §9 新建文档 · 写作任务) -----------------

  /**
   * The writing ledger of one frozen contract — a house type, the editor's words and one reference set — made when first asked
   * for and kept while it prepares, as 审稿意见's is. It takes the launch the baseline ledger was bound to.
   */
  #writingLedger(input: WritingContractInput, rules: WritingCopyRules = WRITING_COPY_RULES, sources?: ReadonlyArray<TaskMaterialSource>): BaselineAnalysisStore {
    return writingTaskOperations.internalWritingLedger(this.#writingTaskOperationsHost, input, rules, sources);
  }

  /**
   * The ledger one recorded Task reads on (#688 re-review): its contract's own, or — when an exemplar it referenced no longer
   * gives the text it pinned — one that reads what the Task recorded under the row's contract digest and refuses to build any
   * request, so its outcome and drafts stay readable and nothing of it is run again.
   */
  #writingLedgerOf(task: StoredWritingTask): BaselineAnalysisStore {
    return writingTaskOperations.internalWritingLedgerOf(this.#writingTaskOperationsHost, task);
  }

  #writingCall<T>(operation: () => T): T {
    return writingTaskOperations.internalWritingCall(this.#writingTaskOperationsHost, operation);
  }

  /** One Task's type and reference set — the one its frozen plan names when it froze one. */
  #writingTaskOf(taskIntentId: string): { task: StoredWritingTask; ledger: BaselineAnalysisStore } | null {
    return writingTaskOperations.internalWritingTaskOf(this.#writingTaskOperationsHost, taskIntentId);
  }

  /** The Book's latest writing Task with its ledger and projection; `null` before the first, or for one no record names. */
  #latestWriting(bookId: string, progress?: ProgressReader): { task: StoredWritingTask; ledger: BaselineAnalysisStore; projection: WritingProjection } | null {
    return writingTaskOperations.internalLatestWriting(this.#writingTaskOperationsHost, bookId, progress);
  }

  /** The Book's latest writing Task as its ledger reads it, or `null`; `progress` is the execution owner's reader. */
  inspectWriting(bookId: string, progress?: ProgressReader): WritingProjection | null {
    return writingTaskOperations.inspectWriting(this.#writingTaskOperationsHost, bookId, progress);
  }

  /**
   * 写作任务 runs only where the selected policy admits its exact binding. The provider-free scope is unaffected.
   */
  #requireWritingScope(): void {
    return writingTaskOperations.internalRequireWritingScope(this.#writingTaskOperationsHost);
  }

  /** Whether the launch is live and its selected policy admits no writing on the bound route; never under the provider-free scope. */
  #writingLiveUnavailable(): boolean {
    return writingTaskOperations.internalWritingLiveUnavailable(this.#writingTaskOperationsHost);
  }

  /**
   * Preserve the precise predecessor refusal unless the writing rule explicitly admits frozen material.
   */
  #requireWritingMaterialScope(listsMaterials: boolean): void {
    return writingTaskOperations.internalRequireWritingMaterialScope(this.#writingTaskOperationsHost, listsMaterials);
  }

  /**
   * One pinned 资料库 item read whole through the Material Index's Task seam (`readMaterialIndexForTask`, KB-009; Issue #428):
   * under a boundary of this Book that lists it at the build its plan pinned, a page at a time, each paragraph's text as the
   * index extracted it. Read-only: nothing is written, sent or scheduled by it. A refusal of the seam — the build gone, the item
   * no longer one this Book's Tasks may list, the item gone — is returned in its code, never read around.
   */
  #readWritingMaterial(bookId: string, source: Pick<WritingMaterialSource, 'materialId' | 'indexDigest'>): WritingMaterialReading {
    return writingTaskOperations.internalReadWritingMaterial(this.#writingTaskOperationsHost, bookId, source);
  }

  /**
   * 允许参考's 资料库 items of a writing Task being prepared (Issue #428; TASK-030, TASK-032, KB-007): each pinned at its current
   * build by `pinMaterialReference` — only an item this Book's Tasks may list whose text was read — then read whole through the
   * Task seam at that pin, within the bounds or refused with words: at most {@link MAX_WRITING_MATERIALS}, each within
   * {@link MAX_WRITING_MATERIAL_GRAPHEMES} characters as its index extracted them, all within
   * {@link MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES}. Nothing is cut.
   */
  #writingMaterials(bookId: string, materialIds: ReadonlyArray<string>): Array<{ input: WritingMaterialInput; source: WritingMaterialSource }> {
    return writingTaskOperations.internalWritingMaterials(this.#writingTaskOperationsHost, bookId, materialIds);
  }

  /**
   * 新建文档 · 写作任务's 资料库 row (Issue #428): every item this Book's Tasks may list under 允许参考 whose index extracted text,
   * the latest arrival first and at most {@link MAX_WRITING_MATERIAL_OFFERS} of them, each with whether it may be ticked — an
   * item longer than one may be is shown, disabled, with why. Live offers require the selected writing rule's material terms.
   */
  #writingMaterialOffer(bookId: string): WritingTaskProjection['references']['materials'] {
    return writingTaskOperations.internalWritingMaterialOffer(this.#writingTaskOperationsHost, bookId);
  }

  /** The Book's metadata as a draft may state it: its title, its people as they read now, and its 书系. */
  #writingBook(bookId: string): WritingBookInput {
    return writingTaskOperations.internalWritingBook(this.#writingTaskOperationsHost, bookId);
  }

  /**
   * 梗概与人物 (DELIV-007): the synopsis and the people of the Book's latest baseline analysis, by its words — its opening when
   * longer than the contract takes — or `null` while the Book has none that wrote a synopsis.
   */
  #writingSynopsis(bookId: string): { input: WritingSynopsisInput; revisionId: string; ordinal: number } | null {
    return writingTaskOperations.internalWritingSynopsis(this.#writingTaskOperationsHost, bookId);
  }

  /**
   * 评估结论与营销要点 (DELIV-007): the Book's latest 定稿 evaluation — the conclusion the editor chose, the strengths, and the
   * market section of the 初评 the version began from (S81b2) — or `null` while no version is 定稿.
   */
  #writingEvaluation(bookId: string): { input: WritingEvaluationInput; recordId: string; ordinal: number } | null {
    return writingTaskOperations.internalWritingEvaluation(this.#writingTaskOperationsHost, bookId);
  }

  /**
   * The house's 范例 of one type that a draft of this Book references (KB-004, KB-006; S79b): organized by Book, each the
   * version its latest delivery that came into 范例 named, from other Books only — the Book's own document of the type is the
   * one being drafted — at most two, the first Books in 范例's own order. Each is its words — the opening when longer than the
   * contract takes — and the version it is, never copied (the contract's bound refuses a copy).
   */
  #writingExemplars(bookId: string, typeId: string): Array<{ input: WritingExemplarInput; source: WritingExemplarSource }> {
    return writingTaskOperations.internalWritingExemplars(this.#writingTaskOperationsHost, bookId, typeId);
  }

  /** The same for several types in one pass over 范例's pages, which stops once every type holds its two. */
  #writingExemplarsByType(bookId: string, typeIds: ReadonlyArray<string>): WritingExemplarScan {
    return writingTaskOperations.internalWritingExemplarsByType(this.#writingTaskOperationsHost, bookId, typeIds);
  }

  /** The editor's own words for one field, as the contract freezes them, or why they cannot be taken. */
  #writingField(value: unknown, most: number, missing: string, field: string): string {
    return writingTaskOperations.internalWritingField(this.#writingTaskOperationsHost, value, most, missing, field);
  }

  /**
   * 先看计划 of a writing Task (DELIV-007): the writing kind's Task for one house type of the Book, from the editor's audience,
   * channel and requirements and the reference set as it stands now, in the mode that applies — the Book's first writing Task,
   * or another once one settled. Refused without live admission, without a manuscript, for a type the Book has a document of or
   * marks 本书不做, and while a writing Task is under way. Its plan opens in the Task Drawer.
   */
  createWritingPreparationWork(
    bookId: string,
    request: { typeId: string; audience: string; channel: string; requirements: string | null; materialIds?: ReadonlyArray<string> },
    launchPolicy: LaunchPolicyProjection,
    redoOf: string | null = null,
    // 准备计划 on a Task Intent Draft (Issue #423, slice 7a): a new Task Intent holding the draft's sentence, which is also the
    // Task's 其他要求.
    intentDraft: DraftPromotion | null = null,
  ): AnalysisPreparationResult<WritingProjection> {
    return writingTaskOperations.createWritingPreparationWork(this.#writingTaskOperationsHost, bookId, request, launchPolicy, redoOf, intentDraft);
  }

  advanceWritingPreparationWork(workId: string): AnalysisPreparationResult<WritingProjection> {
    return writingTaskOperations.advanceWritingPreparationWork(this.#writingTaskOperationsHost, workId);
  }

  cancelWritingPreparationWork(workId: string): boolean {
    return writingTaskOperations.cancelWritingPreparationWork(this.#writingTaskOperationsHost, workId);
  }

  /** 开始任务 in the drawer's bar: the Run Authorization and the Run on the ledger of the plan's contract, for the owner. */
  authorizeWriting(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    start: 'now' | 'when-online' | 'idle' = 'now',
  ): { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore } {
    return writingTaskOperations.authorizeWriting(this.#writingTaskOperationsHost, bookId, taskIntentId, planEnvelopeDigest, start);
  }

  /** Reconcile stranded Runs to their kept continuation points; queued starts still require an explicit new start. */
  reconcileStoppedWritingRuns(): { settled: number } {
    return writingTaskOperations.reconcileStoppedWritingRuns(this.#writingTaskOperationsHost);
  }

  /**
   * The newest drafted result of each type whose document is not made yet: what 打开草稿 can make into it. A newer attempt that
   * wrote no draft — a refused copy of an exemplar — does not hide an older draft that can still be opened (#688 review).
   */
  #writingDrafted(bookId: string): Map<string, { revisionId: string; createdAt: string }> {
    return writingTaskOperations.internalWritingDrafted(this.#writingTaskOperationsHost, bookId);
  }

  /** Why the Book's latest writing Task wrote no draft: its book-level synthesis's own reason, or `null` when it wrote one. */
  #writingRefusal(projection: WritingProjection): string | null {
    return writingTaskOperations.internalWritingRefusal(this.#writingTaskOperationsHost, projection);
  }

  /**
   * 新建文档 · 写作任务 on ⑥ 交付物 (DELIV-007): what every draft references — each part said as it stands, or that the Book has
   * none — the four consequence rows, each house type with whether a writing Task may draft it now and its 范例, the newest
   * drafted result not yet made a document, the Book's latest writing Task with the plan it froze, and for each type whether
   * 快速开始 starts one under that type's writing 默认执行规则 (S84b), or why not.
   */
  inspectWritingTask(bookId: string): WritingTaskProjection {
    return writingTaskOperations.inspectWritingTask(this.#writingTaskOperationsHost, bookId);
  }

  // ---- 快速开始 of a writing Task under its 默认执行规则 (Issue #432, plan slice S84b; S75 D1–D9) ------------------------------

  /**
   * The drawer's `设为快速开始默认…` on a writing plan (AUTH-009, TASK-019; S84b), and the rule its Task was started under. A
   * writing rule covers only the house type of the plan it is set from (Commander ruling on #701: TASK-026, no widened source),
   * so each type of a Book has its own; the editor's audience, channel and requirements are each Task's own, as a range is. A
   * plan may set its type's rule on the same terms as a baseline plan; live writing requires its selected admission. A Task whose
   * 范例 is no longer here cannot set one before starting.
   */
  #writingDefaultRule(projection: WritingProjection, task: StoredWritingTask): TaskPlanDefaultRuleProjection {
    return writingTaskOperations.internalWritingDefaultRule(this.#writingTaskOperationsHost, projection, task);
  }

  /**
   * `设为快速开始默认…` for the Book's writing plan on show (S84b): which must still be the Book's latest writing Task's, unchanged,
   * and one a rule may come from. It sets the rule of the plan's house type, or that rule's next version; the plan that set the
   * rule in force, set again, answers with the rule as it is. The standard authorization never sets one.
   */
  #setWritingDefaultRule(bookId: string, taskIntentId: string, planEnvelopeDigest: string): DefaultExecutionRuleProjection {
    return writingTaskOperations.internalSetWritingDefaultRule(this.#writingTaskOperationsHost, bookId, taskIntentId, planEnvelopeDigest);
  }

  /**
   * What every type's 快速开始 compares a rule with (S84b): the facts a rule binds as the Book's durable state reads them now, on
   * the latest writing Task's ledger — a rule comes only from a writing plan, so a Book with one has a Task — or why they cannot
   * be read. Read once per page, and only when some type has a rule.
   */
  #writingRuleFacts(bookId: string, latest: { ledger: BaselineAnalysisStore } | null): { facts: MaterialPlanInputsProjection } | { reason: string } {
    return writingTaskOperations.internalWritingRuleFacts(this.#writingTaskOperationsHost, bookId, latest);
  }

  /**
   * 新建文档's 快速开始 of one house type (TASK-017, TASK-019; S84b): offered only while that type's writing rule is in force, this
   * launch may use one, the type can be drafted now, and what the rule binds is what the Book's durable state reads now.
   * Anything else is shown, disabled, with its reason; a rule never widens what a Run may do.
   */
  #writingQuickStart(
    bookId: string,
    typeId: string,
    prepare: WritingTaskTypeProjection['prepare'],
    facts: () => { facts: MaterialPlanInputsProjection } | { reason: string },
  ): BaselineAnalysisQuickStartProjection {
    return writingTaskOperations.internalWritingQuickStart(this.#writingTaskOperationsHost, bookId, typeId, prepare, facts);
  }

  /**
   * 快速开始 of a writing Task (TASK-017, TASK-020, TASK-026; S84b): the Task the caller has just prepared exactly as 先看计划
   * prepares it is started exactly as 开始任务 would start it, on the ledger of its plan's contract, its authorization naming
   * the writing rule version the editor started under. Whatever would make the start differ from the rule — a rule of another
   * house type, the rule changed or was turned off, a refused live binding, a 范例 no longer here, the plan's key content or what the
   * rule binds moved, the model service not connected, no network, a busy slot — leaves the Task at its plan with the reason,
   * and nothing is recorded.
   */
  async quickStartWritingTask(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    ruleVersionId: string,
    runtime: { credentialReadiness: (binding?: ConfiguredProviderBinding | null) => Promise<'present' | 'missing' | null>; connectivity: TaskPlanConnectivity },
  ): Promise<{ outcome: 'started' | 'fell-back'; reasons: ReadonlyArray<string>; dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore | null }> {
    return writingTaskOperations.quickStartWritingTask(this.#writingTaskOperationsHost, bookId, taskIntentId, planEnvelopeDigest, ruleVersionId, runtime);
  }

  /**
   * 打开草稿 (DELIV-007): one drafted result made its type's document — an Editorial Artifact in the same block store as every
   * Production Document, edited on the manuscript surface with the same marks, saved as `版本 N`, delivered and exported as any
   * document is — with its 起草 phase started, in one transaction with the record of which result it was made from. The editor's
   * command starts the phase; no Run moves one. Once per type of a Book, and refused for a draft that copies an exemplar, checked
   * again here against the contract's bound. Nothing is delivered or sent.
   */
  createWritingDraft(bookId: string, revisionId: string, title?: string): WritingDraftCreatedProjection {
    return writingTaskOperations.createWritingDraft(this.#writingTaskOperationsHost, bookId, revisionId, title);
  }

  // ---- 市场 and 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008 to EVAL-010; editor-surfaces §5 ②C) ----------

  /** The market section's house data for one Book (EVAL-009, EVAL-010); the reading is in evaluation-market.ts. */
  #evaluationMarket(bookId: string): EvaluationMarketProjection {
    return evaluationMarket(this.#evaluationMarketHost, bookId);
  }

  readonly #evaluationMarketHost: EvaluationMarketHost = this.#evaluationMarketHostOf();

  #evaluationMarketHostOf(): EvaluationMarketHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      calibrationCall: this.#calibrationCall.bind(this),
      get evaluationCalibration() { return store.#evaluationCalibration; },
      get series() { return store.#series; },
      seriesCall: this.#seriesCall.bind(this),
    };
  }

  /** What the 按我的评分重写评语 operations in evaluation-rewrites.ts reach of the store (Issue #1172), read live. */
  readonly #evaluationRewriteHost: evaluationRewriteOperations.EvaluationRewriteStoreHost = this.#evaluationRewriteHostOf();

  #evaluationRewriteHostOf(): evaluationRewriteOperations.EvaluationRewriteStoreHost {
    const store = this;
    return {
      analysisCall: this.#analysisCall.bind(this),
      assertAvailable: this.#assertAvailable.bind(this),
      get authority() { return store.#authority; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get boundedAuthority() { return store.#boundedAuthority; },
      get control() { return store.#control; },
      evaluationCall: this.#evaluationCall.bind(this),
      evaluationLiveRefused: this.#evaluationLiveRefused.bind(this),
      evaluationRecordOrdinal: this.#evaluationRecordOrdinal.bind(this),
      evaluationRewriteCall: this.#evaluationRewriteCall.bind(this),
      get evaluationRewriteLedgers() { return store.#evaluationRewriteLedgers; },
      get evaluationRewrites() { return store.#evaluationRewrites; },
      get evaluationRewriteWork() { return store.#evaluationRewriteWork; },
      get evaluations() { return store.#evaluations; },
      get inspectEvaluation() { return store.inspectEvaluation.bind(store); },
      ledgerTaskOf: this.#ledgerTaskOf.bind(this),
      requireLedgerKindScope: this.#requireLedgerKindScope.bind(this),
      transaction: this.#transaction.bind(this),
    };
  }

  #evaluationRewriteCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof EvaluationRewriteError || error instanceof AnalysisError || error instanceof EvaluationError) {
        throw new StoreError(error.code, error.message);
      }
      throw error;
    }
  }

  inspectEvaluationRewrite(bookId: string, progress?: ProgressReader): EvaluationRewriteProjection | null {
    return evaluationRewriteOperations.inspectEvaluationRewrite(this.#evaluationRewriteHost, bookId, progress);
  }

  createEvaluationRewritePreparationWork(bookId: string, recordId: string, launchPolicy: LaunchPolicyProjection, redoOf: string | null = null): AnalysisPreparationResult<EvaluationRewriteProjection> {
    return evaluationRewriteOperations.createEvaluationRewritePreparationWork(this.#evaluationRewriteHost, bookId, recordId, launchPolicy, redoOf);
  }

  advanceEvaluationRewritePreparationWork(workId: string): AnalysisPreparationResult<EvaluationRewriteProjection> {
    return evaluationRewriteOperations.advanceEvaluationRewritePreparationWork(this.#evaluationRewriteHost, workId);
  }

  cancelEvaluationRewritePreparationWork(workId: string): boolean {
    return evaluationRewriteOperations.cancelEvaluationRewritePreparationWork(this.#evaluationRewriteHost, workId);
  }

  evaluationRewriteRecordOf(bookId: string): string | null {
    return evaluationRewriteOperations.evaluationRewriteRecordOf(this.#evaluationRewriteHost, bookId);
  }

  authorizeEvaluationRewrite(
    bookId: string,
    taskIntentId: string,
    planEnvelopeDigest: string,
    start: 'now' | 'when-online' | 'idle' = 'now',): { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore; recordId: string } {
    return evaluationRewriteOperations.authorizeEvaluationRewrite(this.#evaluationRewriteHost, bookId, taskIntentId, planEnvelopeDigest, start);
  }

  reconcileStoppedEvaluationRewriteRuns(): { settled: number } {
    return evaluationRewriteOperations.reconcileStoppedEvaluationRewriteRuns(this.#evaluationRewriteHost);
  }

  decideEvaluationRewrite(bookId: string, revisionId: string, decision: EvaluationRewriteDecision): EvaluationWorkspaceProjection {
    return evaluationRewriteOperations.decideEvaluationRewrite(this.#evaluationRewriteHost, bookId, revisionId, decision);
  }

  /** 保存评估 or 定稿: the editor's content appended to the version's chain, and the page as it now reads. */
  saveEvaluation(input: { bookId: string; recordId: string; expectedEntries: number; content: unknown; finalize: boolean }): EvaluationWorkspaceProjection {
    return initialEvaluationOperations.saveEvaluation(this.#initialEvaluationOperationsHost, input);
  }

  #evaluationBookTitle(bookId: string): string {
    requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    return asString(one(this.#authority.prepare('SELECT title FROM books WHERE book_id = ?').all(bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。').title);
  }

  /**
   * ②A 分析反馈 (Issue #94, S38; ANALYSIS-023, ANALYSIS-024): one Result Set Revision of the Book's baseline analysis — the
   * latest or an older one — with each item it holds, its latest judgment, and the Book's Analysis Quality Metric.
   */
  inspectAnalysisFeedback(bookId: string, revisionId: string): AnalysisFeedbackProjection {
    return this.#feedbackCall(() => {
      const revision = learningSupervision.feedbackRevision(this.#learningSupervisionHost, bookId, revisionId);
      return this.#analysisFeedback.projection(bookId, revision.bound, revision.items);
    });
  }

  /** 记录反馈: one explicit judgment appended as a Quality Signal, and the revision's feedback as it now reads. */
  recordAnalysisFeedback(input: RecordAnalysisFeedbackInput & { bookId: string }): AnalysisFeedbackProjection {
    return this.#feedbackCall(() => {
      const revision = learningSupervision.feedbackRevision(this.#learningSupervisionHost, input.bookId, input.revisionId);
      this.#transaction(this.#authority, () => this.#analysisFeedback.record(input.bookId, revision.bound, revision.items, input));
      return this.#analysisFeedback.projection(input.bookId, revision.bound, revision.items);
    });
  }

  /**
   * 质量与学习 › 学习准入 (Issue #61, plan slice S26b; LEARN-001 to LEARN-012, FDBK-013): one page of the Learning Material of
   * every Book that has any, or of the one Book named — Books by title, a Book's materials by kind and then by when — each with
   * its Review Card's excerpt and where it stands, at most `MAX_LEARNING_MATERIALS_PAGE` materials an answer (Issue #61
   * review). A read.
   */
  inspectLearningMaterials(bookId: string | null, after: LearningMaterialCursor | null = null): LearningMaterialsProjection {
    return learningSupervision.inspectLearningMaterials(this.#learningSupervisionHost, bookId, after);
  }

  /** What the 学习素材 and 学习整理 operations in house-review-preference.ts reach of the store (Issue #1172), read live. */
  readonly #editorialLearningHost: learningSupervision.EditorialLearningStoreHost = this.#editorialLearningHostOf();

  #editorialLearningHostOf(): learningSupervision.EditorialLearningStoreHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get bookPeople() { return store.#bookPeople; },
      learningCall: this.#learningCall.bind(this),
      get learningEligibility() { return store.#learningEligibility; },
      memoryFacade: this.#memoryFacade.bind(this),
      learningMaterialSource: this.#learningMaterialSource.bind(this),
      get learningSupervisionHost() { return store.#learningSupervisionHost; },
      get inspectEditorialLearning() { return store.inspectEditorialLearning.bind(store); },
      dialogueTask: (dialogueId) => this.#dialogues.task(dialogueId),
      get editorialMemory() { return store.editorialMemory.bind(store); },
      get replacementFrozen() { return store.replacementFrozen.bind(store); },
      transaction: this.#transaction.bind(this),
    };
  }

  inspectLearningMaterial(bookId: string, materialKey: string): LearningMaterialProjection {
    return learningSupervision.inspectLearningMaterial(this.#editorialLearningHost, bookId, materialKey);
  }

  decideLearningMaterial(input: DecideLearningMaterialInput): LearningMaterialProjection {
    return learningSupervision.decideLearningMaterial(this.#editorialLearningHost, input);
  }

  inspectEditQualitySignals(bookId: string | null, after: import('../shared/protocol/learning.js').PreferenceAdoptionCursor | null = null): EditQualitySignalsProjection {
    return learningSupervision.inspectEditQualitySignals(this.#editorialLearningHost, bookId, after);
  }

  inspectEditorialLearning(input: InspectEditorialLearningInput): EditorialLearningProjection {
    return learningSupervision.inspectEditorialLearning(this.#editorialLearningHost, input);
  }

  prepareLearningCuration(bookId: string, signalIds: readonly string[]): LearningCurationBundle {
    return learningSupervision.prepareLearningCuration(this.#editorialLearningHost, bookId, signalIds);
  }

  nextLearningCuration(): CurationRun | null { return learningSupervision.nextLearningCuration(this.#editorialLearningHost); }

  learningCurationCurrent(run: CurationRun): boolean { return learningSupervision.learningCurationCurrent(this.#editorialLearningHost, run); }

  publishLearningCuration(run: CurationRun, text: string, evidence: { usage: import('./provider/classification.js').UsageFacts | null; transmitted: boolean }): number {
    return learningSupervision.publishLearningCuration(this.#editorialLearningHost, run, text, evidence);
  }

  /** Explicit-Book source detail; historical inspection remains available while current learning is excluded. */
  async inspectWordTrackedEditSample(input: { bookId: string; sampleId: string; sampleDigest: string; after: unknown }): Promise<WordSampleDetailPage> {
    this.#assertAvailable();
    requireStore(isRecord(input) && hasExactKeys(input, ['bookId', 'sampleId', 'sampleDigest', 'after']) &&
      typeof input.bookId === 'string' && typeof input.sampleId === 'string' && typeof input.sampleDigest === 'string' &&
      UUID_PATTERN.test(input.bookId) && /^wts_[0-9a-f]{64}$/u.test(input.sampleId) && DIGEST_PATTERN.test(input.sampleDigest),
    'WORD_SAMPLE_INVALID', 'Word 修改样本的图书或固定标识无效。');
    const row = this.#authority.prepare(`SELECT source_version_id FROM word_tracked_edit_samples
      WHERE book_id = ? AND sample_id = ? AND sha256 = ?`).get(input.bookId, input.sampleId, input.sampleDigest);
    requireStore(row !== undefined, 'WORD_SAMPLE_INVALID', '这条 Word 修改样本不属于所选图书或摘要已经变化。');
    const sourceVersionId = asString(row.source_version_id);
    const parent = this.#retentionCall(() => readWordParentSourcePin(this.#authority, input.bookId, sourceVersionId));
    requireStore(parent.sourceBytes <= MAX_ARCHIVE_BYTES, 'WORD_SOURCE_INVALID', 'Word 原文件超过已支持的包大小。');
    const object = one(this.#authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?')
      .all(parent.objectDigest) as SqlRow[], 'WORD_SOURCE_UNAVAILABLE', 'Word 原文件对象记录缺失。');
    requireStore(object.byte_length === parent.sourceBytes, 'WORD_SOURCE_INVALID', 'Word 原文件长度固定记录不一致。');
    const path = this.#contentObjectPath(parent.objectDigest, asString(object.relative_key));
    let context = this.#wordSampleDetailContext;
    const reusable = context !== null && context.bookId === input.bookId && context.sourceVersionId === sourceVersionId &&
      context.parentPinDigest === wordParentSourcePinRecord(parent).digest && wordSampleDetailContextCurrent(this.#authority, context);
    try {
      const info = await lstat(path);
      requireStore(info.isFile() && !info.isSymbolicLink() && info.size === parent.sourceBytes,
        'WORD_SOURCE_UNAVAILABLE', 'Word 原文件不再是完整的留存文件。');
      if (reusable) {
        const hash = createHash('sha256');
        let bytes = 0;
        for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
          bytes += chunk.byteLength;
          requireStore(bytes <= parent.sourceBytes, 'WORD_SOURCE_UNAVAILABLE', 'Word 原文件在读取时已经变化。');
          hash.update(chunk);
        }
        requireStore(bytes === parent.sourceBytes && hash.digest('hex') === parent.sourceDigest,
          'WORD_SOURCE_UNAVAILABLE', 'Word 原文件字节与留存摘要不一致。');
        this.#assertAvailable();
        requireStore(context !== null && wordSampleDetailContextCurrent(this.#authority, context),
          'WORD_SOURCE_CHANGED', 'Word 详情读取期间记录已变化，请重新查看。');
      } else {
        const compiled = await compileWordTrackedDocx(path, { digest: parent.sourceDigest, bytes: parent.sourceBytes });
        this.#assertAvailable();
        requireStore(compiled.kind === 'ready', 'WORD_SOURCE_INVALID', 'Word 原文件不再符合留存的修订编译契约。');
        context = this.#retentionCall(() => createWordSampleDetailContext(this.#authority, input.bookId, sourceVersionId, compiled));
      }
    } catch (error) {
      if (error instanceof StoreError) throw error;
      if (error instanceof Error && error.message.startsWith('DOCX_REJECTED:')) throw new StoreError('WORD_SOURCE_INVALID', 'Word 原文件无法按留存的修订契约完整读取。');
      if (isRecord(error) && typeof error.code === 'string' && typeof error.syscall === 'string') {
        throw new StoreError('WORD_SOURCE_UNAVAILABLE', 'Word 原文件无法读取，无法查看完整修改详情。');
      }
      throw error;
    }
    requireStore(context !== null, 'WORD_SOURCE_INVALID', 'Word 详情缺少已验证的原始来源。');
    // Only this Word historical read reuses proofs across detail pages. The context binds the exact database generation,
    // and actual original bytes were verified again above; controls/current eligibility never come from this cache.
    if (this.#wordSampleDetailReads?.context !== context) this.#wordSampleDetailReads = { context, reads: new LearningReads() };
    const imports = this.#learningCall(() => new EditorialLearningLedger(this.#authority, this.#wordSampleDetailReads!.reads)
      .wordSampleImports(input.bookId, input.sampleId, input.sampleDigest));
    const source = this.#retentionCall(() => resolveWordSampleDetailSource(this.#authority, context, input.sampleId, input.sampleDigest, imports));
    const page = this.#retentionCall(() => pageWordSampleDetail(source, input.after));
    this.#wordSampleDetailContext = context;
    return page;
  }

  recordLearningReasonAsk(input: LearningReasonAskInput, frequency: import('../shared/protocol/learning.js').LearningReasonAskFrequency): LearningReasonAskProjection | null {
    return learningSupervision.recordLearningReasonAsk(this.#editorialLearningHost, input, frequency);
  }

  changeEditorialLearning(input: ChangeEditorialLearningInput): EditorialLearningProjection {
    return learningSupervision.changeEditorialLearning(this.#editorialLearningHost, input);
  }

  createEditorialMemory(input: CreateEditorialMemoryInput): EditorialLearningProjection {
    return learningSupervision.createEditorialMemory(this.#editorialLearningHost, input);
  }

  acceptEditorialMemory(input: import('../shared/protocol/learning.js').AcceptEditorialMemoryInput): EditorialLearningProjection {
    return learningSupervision.acceptEditorialMemory(this.#editorialLearningHost, input);
  }

  deactivateEditorialMemory(input: DeactivateEditorialMemoryInput): EditorialLearningProjection {
    return learningSupervision.deactivateEditorialMemory(this.#editorialLearningHost, input);
  }

  /**
   * A Book-less read (Issue #1083): entering creates neither a Task nor a Session/Run. `dialogueAdmitted` is the execution
   * owner's own decision for the selected policy; each item reads as a Run or the session would read it, without the house's names.
   */
  inspectGlobalAgent(live: (attemptId: string) => LiveAnswer | null = () => null, dialogueAdmitted = false, scopedAdmitted = false): GlobalAgentProjection {
    return globalAgentOperations.inspectGlobalAgent(this.#globalAgentOperationsHost, live, dialogueAdmitted, scopedAdmitted);
  }

  /** The Book-less dialogues of this launch's scope, newest first, by the same Harness join as a Book dialogue (Issue #1083). */
  #globalAgentHistory(live: (attemptId: string) => LiveAnswer | null): GlobalAgentDialogueProjection[] {
    return globalAgentOperations.internalGlobalAgentHistory(this.#globalAgentOperationsHost, live);
  }

  globalAgentSourcesCurrent(pins: ReadonlyArray<GlobalMemoryPin>): boolean {
    return globalAgentOperations.globalAgentSourcesCurrent(this.#globalAgentOperationsHost, pins);
  }

  /** The library's current enabled versions (#1171): what the Global Agent view inspects and an editor may list for one turn. */
  #globalAgentProcedures(): GlobalAgentProcedure[] {
    return globalAgentOperations.internalGlobalAgentProcedures(this.#globalAgentOperationsHost);
  }

  /** Pin an explicitly listed scope at ask (#1171): each Book at its primary manuscript's current revision, each procedure exactly. */
  #pinGlobalAgentScope(input: GlobalAgentScopeInput): GlobalAgentScope {
    return globalAgentOperations.internalPinGlobalAgentScope(this.#globalAgentOperationsHost, input);
  }

  /** Each pinned Book revision still exists and is not excluded from learning; each procedure version is unchanged and enabled. */
  globalAgentScopeCurrent(scope: GlobalAgentScope): boolean {
    return globalAgentOperations.globalAgentScopeCurrent(this.#globalAgentOperationsHost, scope);
  }

  globalAgentProcedureDocument(pin: GlobalAgentProcedurePin): ProcedureDefinitionDocument {
    return globalAgentOperations.globalAgentProcedureDocument(this.#globalAgentOperationsHost, pin);
  }

  /** The governed item a listed pin names: a preference shares its pin; a memory listing adds its source-state digest. */
  globalAgentGovernancePin(pin: GlobalMemoryPin): GlobalMemoryPin | null {
    return globalAgentOperations.globalAgentGovernancePin(this.#globalAgentOperationsHost, pin);
  }

  globalAgentScopedTools(message: DialogueTurnStart['message']): ReturnType<typeof globalAgentScopedTools> {
    return globalAgentScopedTools(this, message);
  }

  /** Internal fixture metadata for the actual local callers, derived from this Store's checked selected launch. */
  localFixtureRuntime(): LocalFixtureRuntimeContext | null {
    return globalAgentOperations.localFixtureRuntime(this.#globalAgentOperationsHost);
  }

  #globalOriginalFieldsSelected(): boolean {
    return globalAgentOperations.internalGlobalOriginalFieldsSelected(this.#globalAgentOperationsHost);
  }

  /** Safe existing connection metadata; same-reference credential rotation still changes this exact generation. */
  globalAgentModelConnection(): { binding: ConfiguredProviderBinding; credentialUpdatedAt: string; policy: LaunchPolicyProjection } {
    return globalAgentOperations.globalAgentModelConnection(this.#globalAgentOperationsHost);
  }

  /** Re-read a specific immutable predecessor prefix even after its new attempt has entered the governed queue. */
  globalAgentHistory(input: { dialogueId: string; attemptId: string }, kind: 'continue' | 'regenerate'): GlobalAgentTurnHistory {
    return globalAgentOperations.globalAgentHistory(this.#globalAgentOperationsHost, input, kind);
  }

  #requireGlobalQualification(qualification: QualifiedGlobalAttemptMetadata | undefined, message: DialogueTurnStart['message']): void {
    return globalAgentOperations.internalRequireGlobalQualification(this.#globalAgentOperationsHost, qualification, message);
  }

  /** Reuse the preference consumer's known-people filter. Notes, roles, examples and manuscript references are never assembled. */
  globalAgentRedact(text: string): string {
    return globalAgentOperations.globalAgentRedact(this.#globalAgentOperationsHost, text);
  }

  /** One name set for listing and the final-gate recheck: the base lines' attributed people and the house's people now. */
  #globalAgentNames(preference: HouseReviewPreferenceVersion | null): string[] {
    return globalAgentOperations.internalGlobalAgentNames(this.#globalAgentOperationsHost, preference);
  }

  /** A disclosure read creates no Task, attempt, log, credential release or transmission. */
  prepareGlobalAgentTurn(input: PrepareGlobalAgentTurnInput): DialogueTurnStart['message'] {
    return globalAgentOperations.prepareGlobalAgentTurn(this.#globalAgentOperationsHost, input);
  }

  /** Called only after the execution owner admits this exact Book-less policy binding. */
  askGlobalAgent(input: AskGlobalAgentInput, now = new Date(), qualification?: QualifiedGlobalAttemptMetadata): DialogueTurnStart {
    return globalAgentOperations.askGlobalAgent(this.#globalAgentOperationsHost, input, now, qualification);
  }

  inspectGlobalAgentDialogue(dialogueId: string, live: (attemptId: string) => LiveAnswer | null = () => null): GlobalAgentDialogueProjection {
    return globalAgentOperations.inspectGlobalAgentDialogue(this.#globalAgentOperationsHost, dialogueId, live);
  }

  globalAgentAttempt(input: GlobalAgentAttemptInput, kind: 'continue' | 'regenerate' | 'stop', now = new Date(), preview = false,
    qualification?: QualifiedGlobalAttemptMetadata): DialogueTurnStart | string {
    return globalAgentOperations.globalAgentAttempt(this.#globalAgentOperationsHost, input, kind, now, preview, qualification);
  }

  /** What the 学习监督 operations in house-review-preference.ts reach of the store (Issue #1172), read live. */
  readonly #learningSupervisionHost: learningSupervision.LearningSupervisionStoreHost = this.#learningSupervisionHostOf();

  #learningSupervisionHostOf(): learningSupervision.LearningSupervisionStoreHost {
    const store = this;
    return {
      get analysisFeedback() { return store.#analysisFeedback; },
      get authority() { return store.#authority; },
      get baselineAnalysis() { return store.#baselineAnalysis; },
      get bookPeople() { return store.#bookPeople; },
      evaluationBookTitle: this.#evaluationBookTitle.bind(this),
      get inspectBaselineAnalysis() { return store.inspectBaselineAnalysis.bind(store); },
      get inspectGlobalAgent() { return store.inspectGlobalAgent.bind(store); },
      get inspectLearningMaterial() { return store.inspectLearningMaterial.bind(store); },
      learningCall: this.#learningCall.bind(this),
      learningCandidates: this.#learningCandidates.bind(this),
      get learningEligibility() { return store.#learningEligibility; },
      memoryFacade: this.#memoryFacade.bind(this),
      learningMaterialSource: this.#learningMaterialSource.bind(this),
      get reviewRuns() { return store.#reviewRuns; },
      get series() { return store.#series; },
      safeTitle,
      requireSeries: (seriesId) => seriesOperations.requireStoredSeries(this.#seriesHost, seriesId),
      reviewCall: this.#reviewCall.bind(this),
      analysisItemLabel,
      transaction: this.#transaction.bind(this),
    };
  }

  recordLearningSupervision(input: RecordLearningSupervisionInput): GlobalAgentProjection {
    return learningSupervision.recordLearningSupervision(this.#learningSupervisionHost, input);
  }

  inspectHouseReviewPreference(): HouseReviewPreferenceProjection {
    return learningSupervision.inspectHouseReviewPreference(this.#learningSupervisionHost);
  }

  rebuildHouseReviewPreference(): HouseReviewPreferenceProjection {
    return learningSupervision.rebuildHouseReviewPreference(this.#learningSupervisionHost);
  }

  inspectFeedbackHistory(input: FeedbackHistoryInput = {}): FeedbackHistoryProjection {
    return learningSupervision.inspectFeedbackHistory(this.#learningSupervisionHost, input);
  }

  /**
   * 质量与学习 › 学习回溯 (Issue #62, plan slice S27a; LAUD-001, LAUD-002, LAUD-012): one page of the Learning Material that
   * matches the filters, Book by Book — Books by title, a Book's materials as 学习准入 orders them — each with where it
   * stands and what used it, at most `MAX_LEARNING_AUDIT_PAGE` an answer and half a frame. Every filter runs over every
   * material before the page is cut, and an unknown Book or Series is refused rather than answered with an empty page. With
   * every page come the filters' choices. A read: product history, granting nothing.
   */
  inspectLearningAudit(input: LearningAuditInput = {}): LearningAuditProjection {
    return learningSupervision.inspectLearningAudit(this.#learningSupervisionHost, input);
  }

  inspectLearningLineage(bookId: string, materialKey: string): LearningLineageProjection {
    return learningSupervision.inspectLearningLineage(this.#learningSupervisionHost, bookId, materialKey);
  }

  previewLearningRemediation(input: PreviewLearningRemediationInput): LearningRemediationPreviewProjection {
    return learningSupervision.previewLearningRemediation(this.#learningSupervisionHost, input);
  }

  recordLearningRemediation(input: RecordLearningRemediationInput): LearningRemediationOutcomeProjection {
    return learningSupervision.recordLearningRemediation(this.#learningSupervisionHost, input);
  }

  /** Resolve the exact source and its originating Task; neither display fact changes the material digest or eligibility. */
  #learningMaterialSource(bookId: string, candidate: LearningMaterialCandidate): Pick<LearningMaterialProjection, 'target' | 'sourceTask' | 'wordCurrentEligibility'> {
    return learningSupervision.learningMaterialSource(this.#learningSupervisionHost, bookId, candidate);
  }

  /**
   * One Book's Learning Material, identified from the records that own it (LEARN-001): each 修改建议's current decision that
   * carries the editor's reason or their own wording, each analysis item whose latest judgment says why, and each 审阅
   * finding the editor last ignored with a reason. Nothing is asked of the editor to find them.
   */
  *#learningCandidates(bookId: string, withExcerpt: boolean, includeWord = true): IterableIterator<LearningMaterialCandidate> {
    yield* learningSupervision.learningCandidates(this.#learningSupervisionHost, bookId, withExcerpt, includeWord);
  }

  #learningCall<T>(operation: () => T): T {
    this.#assertAvailable();
    this.#learningCallDepth += 1;
    try {
      return operation();
    } catch (error) {
      if (error instanceof LearningEligibilityError || error instanceof DecisionFeedbackError || error instanceof AnalysisFeedbackError) {
        throw new StoreError(error.code, error.message);
      }
      throw error;
    } finally { if (--this.#learningCallDepth === 0) this.#wordLearningRead = null; }
  }

  /** The facade reuses the current operation's proof reader and never owns its transaction. */
  #memoryFacade(): EditorialMemoryFacade {
    return new EditorialMemoryFacade(this.#authority, () => this.#learningLedger(),
      () => learningSupervision.housePreferencePeopleNames(this.#learningSupervisionHost));
  }

  /** C0's existing per-read proofs, invalidated by any database write; no cache survives the outer local operation. */
  #learningLedger(): EditorialLearningLedger {
    const word = this.#wordLearningProofs !== null && wordSampleDetailContextCurrent(this.#authority, this.#wordLearningProofs.context)
      ? this.#wordLearningProofs.facts : undefined;
    const generation = JSON.stringify({ data: this.#authority.prepare('PRAGMA data_version').get(),
      schema: this.#authority.prepare('PRAGMA schema_version').get(), changes: this.#authority.prepare('SELECT total_changes() changes').get() });
    if (this.#learningCallDepth > 0 && this.#wordLearningRead?.generation !== generation)
      this.#wordLearningRead = { generation, reads: new LearningReads(word) };
    const reads = this.#learningCallDepth === 0 ? new LearningReads(word) : this.#wordLearningRead!.reads;
    return new EditorialLearningLedger(this.#authority, reads, (source) => this.#requireWordLearningSource(source),
      (source, cursor, budget) => this.#boundedAuthority.readManualCommandSource(source, cursor, budget),
      (source) => {
        this.#requireWordLearningSource(source);
        const context = this.#wordSampleDetailContext!;
        const sample = context.samples.get(source.sampleId)!.sample;
        const side = (fragments: typeof sample.before): import('../shared/protocol/learning.js').LearningExampleText[] => fragments.map((fragment) => {
          const text = wordSourceFragmentText(context.graph, context.decodedAtoms, fragment);
          return fragment.kind === 'paragraph-boundary' ? { kind: 'paragraph-boundary' } : { kind: 'text', text: text! };
        });
        return { before: side(sample.before), after: side(sample.after) };
      });
  }

  /** Actual bounded original bytes and every saved sample meet the fresh compiler before current learning can use a pair. */
  #requireWordLearningSource(source: WordTrackedEditLearningSource): WordLearningProofs {
    const parent = this.#retentionCall(() => readWordParentSourcePin(this.#authority, source.bookId, source.sourceVersionId));
    requireStore(parent.sourceDigest === source.sourceDigest && parent.sourceBytes > 0 && parent.sourceBytes <= MAX_ARCHIVE_BYTES,
      'WORD_SOURCE_INVALID', 'Word 修改样本的原始来源固定记录无效。');
    const object = this.#authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').get(parent.objectDigest);
    requireStore(object && object.byte_length === parent.sourceBytes, 'WORD_SOURCE_UNAVAILABLE', 'Word 原文件对象记录不完整。');
    const path = this.#contentObjectPath(parent.objectDigest, asString(object.relative_key));
    let descriptor: number | null = null;
    try {
      const metadata = lstatSync(path);
      requireStore(relative(path, realpathSync(path)) === '' && metadata.isFile() && !metadata.isSymbolicLink() && metadata.size === parent.sourceBytes,
        'WORD_SOURCE_UNAVAILABLE', 'Word 原文件不再是完整的留存文件。');
      descriptor = openSync(path, constants.O_RDONLY);
      const opened = fstatSync(descriptor);
      requireStore(opened.isFile() && opened.size === parent.sourceBytes && opened.dev === metadata.dev && opened.ino === metadata.ino,
        'WORD_SOURCE_UNAVAILABLE', 'Word 原文件在打开时已变化。');
      const bytes = Buffer.allocUnsafe(parent.sourceBytes);
      for (let offset = 0; offset < bytes.byteLength;) {
        const count = readSync(descriptor, bytes, offset, Math.min(64 * 1024, bytes.byteLength - offset), offset);
        requireStore(count > 0, 'WORD_SOURCE_UNAVAILABLE', 'Word 原文件在读取时已不完整。'); offset += count;
      }
      requireStore(readSync(descriptor, Buffer.alloc(1), 0, 1, bytes.byteLength) === 0 && sha256(bytes) === parent.sourceDigest,
        'WORD_SOURCE_UNAVAILABLE', 'Word 原文件与留存摘要不一致。');
      let context = this.#wordSampleDetailContext;
      let fresh: Extract<WordTrackedCompilation, { kind: 'ready' }> | null = null;
      if (context === null || context.bookId !== source.bookId || context.sourceVersionId !== source.sourceVersionId ||
        context.parentPinDigest !== wordParentSourcePinRecord(parent).digest || !wordSampleDetailContextCurrent(this.#authority, context)) {
        const compiled = compileWordTrackedDocxBytes(bytes);
        requireStore(compiled.kind === 'ready', 'WORD_SOURCE_INVALID', 'Word 原文件不再符合留存编译契约。');
        fresh = compiled;
        context = this.#retentionCall(() => createWordSampleDetailContext(this.#authority, source.bookId, source.sourceVersionId, compiled));
      }
      requireStore(context.graphDigest === source.graphDigest, 'WORD_SOURCE_INVALID', 'Word 来源图与原文件不一致。');
      if (this.#wordLearningProofs?.context !== context) {
        if (fresh === null) {
          const compiled = compileWordTrackedDocxBytes(bytes);
          requireStore(compiled.kind === 'ready', 'WORD_SOURCE_INVALID', 'Word 原文件不再符合留存编译契约。');
          fresh = compiled;
        }
        const reads = new LearningReads();
        const ledger = new EditorialLearningLedger(this.#authority, reads);
        const imports = this.#authority.prepare('SELECT commit_id FROM word_revision_imports WHERE book_id = ? AND source_version_id = ?')
          .all(source.bookId, source.sourceVersionId);
        requireStore(imports.length > 0, 'WORD_SOURCE_INVALID', 'Word 修改来源没有完整的已提交导入。');
        for (const imported of imports) ledger.validateWordImportSamples(source.bookId, asString(imported.commit_id), fresh);
        const provedSamples = new Set([...reads.word.evidence.values()].map((evidence) => evidence.candidate.materialKey));
        for (const row of this.#authority.prepare('SELECT sample_id, sha256, canonical_json FROM word_tracked_edit_samples WHERE book_id = ? AND source_version_id = ?')
          .iterate(source.bookId, source.sourceVersionId)) {
          const found = context.samples.get(asString(row.sample_id));
          const expected = found === undefined ? null : wordTrackedSampleRecord(found.sample);
          requireStore(expected !== null && row.sha256 === expected.digest && row.canonical_json === expected.json &&
            provedSamples.has(`word-sample:${asString(row.sample_id)}`),
          'WORD_SAMPLE_INVALID', 'Word 修改样本与原文件完整清单不一致。');
        }
        for (const row of this.#authority.prepare(`SELECT signal_id FROM learning_signals WHERE book_id = ?
          AND json_extract(canonical_json, '$.source.sourceVersionId') = ? AND json_extract(canonical_json, '$.kind') = 'word-tracked-edit'`)
          .iterate(source.bookId, source.sourceVersionId)) {
          requireStore(reads.word.signals.has(asString(row.signal_id)), 'WORD_SAMPLE_INVALID', 'Word 修改信号不属于完整的历史准入清单。');
        }
        requireStore(wordSampleDetailContextCurrent(this.#authority, context), 'WORD_SOURCE_CHANGED', 'Word 学习来源在验证期间已经变化。');
        this.#wordLearningProofs = { context, facts: reads.word };
      }
      const sample = context.samples.get(source.sampleId);
      requireStore(sample !== undefined && wordTrackedSampleRecord(sample.sample).digest === source.sampleDigest,
        'WORD_SAMPLE_INVALID', 'Word 修改样本不属于原文件的完整清单。');
      this.#wordSampleDetailContext = context;
      return this.#wordLearningProofs.facts;
    } catch (error) {
      if (error instanceof StoreError) throw error;
      if (isRecord(error) && typeof error.code === 'string' && typeof error.syscall === 'string') {
        throw new StoreError('WORD_SOURCE_UNAVAILABLE', 'Word 原文件无法读取，当前学习不能使用这条修改对。');
      }
      throw error;
    } finally { if (descriptor !== null) closeSync(descriptor); }
  }

  #feedbackCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof AnalysisFeedbackError) throw new StoreError(error.code, error.message);
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  #evaluationCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof EvaluationError) throw new StoreError(error.code, error.message);
      // The house's calibration switch, read when a version begins from AI7's 初评 (EVAL-011a): its chain's own refusal.
      if (error instanceof EvaluationCalibrationError) throw new StoreError(error.code, error.message);
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  #libraryCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof LibraryMaterialError) throw new StoreError(error.code, error.message);
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  #guidelineCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof ReviewGuidelineError) throw new StoreError(error.code, error.message);
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  /** `保存人员` (Issue #431, S83; BOOK-006): the Book's next people version, or none when nothing changed. */
  updateBookPeople(input: UpdateBookPeopleInput): BookPeopleResultProjection {
    return this.#peopleCall(() => this.#transaction(this.#authority, () => {
      const result = this.#bookPeople.update(input);
      const scope = this.#baselineAnalysis.launch.operationalScope;
      // An editor's words reach a record by a directive or, from /2 on, by an accepted memory: either is refiltered by the house's names now.
      const preferences = this.#memoryFacade();
      if (this.#memoryFacade().directives(scope).length > 0 || preferences.history(scope).at(-1)?.schema === 'ai7.house-review-preference/2')
        preferences.refreshGovernance(scope, learningSupervision.housePreferencePeopleNames(this.#learningSupervisionHost));
      return result;
    }));
  }

  #peopleCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof BookPeopleError) throw new StoreError(error.code, error.message);
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  getReimportLineageSourceVersionPage(
    bookId: string,
    after: string | null,
  ): ReimportLineageSourceVersionPageProjection { return manuscriptReimportOperations.getReimportLineageSourceVersionPage(this.#manuscriptReimportOperationsHost, bookId, after); }

  #reimportLineageSourceVersionPage(bookId: string, after: string | null): {
    items: string[];
    previousCursor: string | null;
    nextCursor: string | null;
  } { return importReviewOperations.reimportLineageSourceVersionPage(this.#importReviewRecordsHost, bookId, after); }

  private prepareBookCreationReviewForExactIdentity(
    bookId: string,
    stableIdentity: string,
    title: string,
    internalNumber: string | null,
  ): BookCreationReviewProjection {
    const proposed = { bookId, stableIdentity, title, internalNumber };
    return {
      reviewDigest: sha256(canonicalJson({
        schema: 'ai7.empty-book-creation-review/1',
        proposed,
        editorialDimensionSet: {
          ...BASELINE_EDITORIAL_DIMENSION_SET,
          digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
        },
        recordsToCreate: ['图书与稳定标识', '图书编辑维度集（8 项）'],
        nonEffects: EMPTY_BOOK_NON_EFFECTS,
      })),
      proposed,
      recordsToCreate: ['图书与稳定标识', '图书编辑维度集（8 项）'],
      nonEffects: EMPTY_BOOK_NON_EFFECTS,
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    };
  }

  #insertBookDimensionSet(dimensionSetId: string, bookId: string, createdAt: string): void {
    this.#authority.prepare(
      `INSERT INTO book_dimension_sets(
         dimension_set_id, book_id, version, profile_id, profile_version, definition_digest,
         weight_semantics, created_at
       ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
    ).run(
      dimensionSetId,
      bookId,
      BASELINE_EDITORIAL_DIMENSION_SET.profileId,
      BASELINE_EDITORIAL_DIMENSION_SET.profileVersion,
      BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics,
      createdAt,
    );
    const insertDimension = this.#authority.prepare(
      'INSERT INTO book_dimensions(dimension_set_id, dimension_id, display_label, weight, position) VALUES (?, ?, ?, ?, ?)',
    );
    EDITORIAL_DIMENSIONS.forEach((dimension, index) =>
      insertDimension.run(dimensionSetId, dimension.id, dimension.label, dimension.weight, index + 1),
    );
  }

  async stageSelectedManuscript(selectionToken: string, selectedPathInput: string): Promise<StagedImportProjection> { return importIntakeOperations.stageSelectedManuscript(this.#importIntakeOperationsHost, selectionToken, selectedPathInput); }

  /**
   * Read at most the identification window and name the format from its bytes (ADR 0072 §1). The
   * parser's archive bound applies to every format before anything is retained, and nothing beyond
   * this window is read from a file the product will not parse (ADR 0072 §9).
   */
  async #identifySelectedManuscript(selectedPath: string, displayName: string): Promise<SourceFormat> {
    const handle = await open(selectedPath, 'r');
    try {
      const status = await handle.stat();
      requireStore(status.isFile(), 'SELECTION_INVALID', '文件选择结果无效。');
      requireStore(status.size > 0, 'SOURCE_EMPTY', '所选文件为空。');
      requireStore(status.size <= MAX_ARCHIVE_BYTES, 'SOURCE_TOO_LARGE', '所选文件超出本地导入的大小上限。');
      const head = new Uint8Array(Math.min(status.size, MANUSCRIPT_FORMAT_HEAD_BYTES));
      const { bytesRead } = await handle.read(head, 0, head.length, 0);
      return identifyManuscriptFormat(head.subarray(0, bytesRead), displayName);
    } finally {
      await handle.close();
    }
  }

  /**
   * Stage a file the product will not read as an editable Manuscript: the original is retained whole
   * with its exact identity and nothing is parsed, so the draft has no staged snapshot and the
   * editor is offered `作为来源材料导入` alone (ADR 0072 §2, V2-UX-IMP-006).
   */
  async #stageSourceOnlyDraft(
    draftId: string,
    selectionToken: string,
    selectedPath: string,
    displayName: string,
    format: SourceFormat,
  ): Promise<StagedImportProjection> {
    return this.#withContentObjectLifecycle(async () => {
      const retained = await this.#persistRetainedOriginal(selectedPath, format);
      const now = new Date().toISOString();
      this.#transaction(this.#authority, () => {
        this.#authority
          .prepare(
            `INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(object_digest) DO NOTHING`,
          )
          .run(retained.digest, retained.relativeKey, retained.byteLength, now);
        const object = one(
          this.#authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').all(retained.digest) as SqlRow[],
          'OBJECT_VERIFY_FAILED',
          '暂存对象记录缺失。',
        );
        requireStore(
          asString(object.relative_key) === retained.relativeKey && asNumber(object.byte_length) === retained.byteLength,
          'OBJECT_VERIFY_FAILED',
          '暂存对象记录冲突。',
        );
        this.#authority
          .prepare(
            `INSERT INTO import_drafts(
               draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
               staged_at, source_format
             ) VALUES (?, ?, 'staged', 1, ?, ?, ?, ?, ?)`,
          )
          .run(draftId, selectionToken, displayName, retained.digest, selectedPath, now, format);
        this.#assertForeignKeys(this.#authority);
      });
      return this.#stagedProjection(this.#loadDraftSnapshot(draftId));
    });
  }

  /**
   * Stage a file the product reads through a DOCX working representation (ADR 0072 §2). The
   * original is retained under its own extension and stays the digest of record; the converted DOCX
   * is a second content object, parsed exactly as a selected DOCX is, and linked from the draft so
   * that the commit can link it from the Source Version and an abandonment can remove it again.
   */
  async #stageConvertedManuscriptDraft(
    draftId: string,
    selectionToken: string,
    selectedPath: string,
    displayName: string,
    conversion: ManuscriptConversionProjection,
  ): Promise<StagedImportProjection> {
    const converted = await this.#convertSelectedManuscript(selectedPath, conversion.sourceFormat);
    // The identification window read only the file's head, so a file that turns out not to be the
    // text it looked like is retained whole and unparsed rather than refused (ADR 0072 §1).
    if (!converted) return this.#stageSourceOnlyDraft(draftId, selectionToken, selectedPath, displayName, 'UNKNOWN');
    const fidelity = conversionFidelityReport(conversion, converted.loss);
    return this.#withContentObjectLifecycle(async () => {
      // The original is persisted first, so a refusal that belongs to it — a pending abandonment
      // cleanup above all — is raised before any byte of a derived object is written.
      const retained = await this.#persistRetainedOriginal(selectedPath, conversion.sourceFormat);
      const working = await this.#persistWorkingObject(converted.docx);
      const ingested = await this.#parseIntoIngestedWorkingRepresentation(draftId, working.path, displayName);
      try {
        const { parsed } = ingested;
        // The converter emits no run property, table, image, section child, header, or footer, so
        // every count in the merged review is the conversion's — the invariant the review's
        // reconstruction rests on, checked here on the bytes actually produced.
        requireStore(isCleanTracerFidelity(parsed.fidelity), 'FIDELITY_OUTSIDE_TRACER', '工作表示带有解析器自身的保真信号。');
        requireStore(
          parsed.sourceDigest === working.digest && parsed.archiveBytes === working.byteLength,
          'OBJECT_VERIFY_FAILED',
          '工作表示对象与解析结果不一致。',
        );
        const now = new Date().toISOString();
        this.#transaction(this.#authority, () => {
          this.#insertContentObject(working.digest, working.relativeKey, working.byteLength, now);
          this.#insertContentObject(retained.digest, retained.relativeKey, retained.byteLength, now);
          this.#authority
            .prepare(
              `INSERT INTO import_drafts(
                 draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
                 staged_at, source_format, working_object_digest, converter_identity
               ) VALUES (?, ?, 'staged', 1, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              draftId, selectionToken, displayName, retained.digest, selectedPath, now,
              conversion.sourceFormat, working.digest, conversion.converterIdentity,
            );
          // The staged snapshot is keyed on the original's digest: the working representation is
          // what was read, never what the Source Version is (ADR 0072 §2).
          this.#promoteIngestSnapshot(draftId, ingested, now, { sourceDigest: retained.digest, fidelity });
          this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(draftId));
          this.#assertForeignKeys(this.#authority);
        });
        return this.#stagedProjection(this.#loadDraftSnapshot(draftId));
      } finally {
        this.#discardIngest(ingested.ingestId);
      }
    });
  }

  /**
   * Convert the selected file, or `null` when its bytes are not what its head window suggested.
   * The whole file is read at once because a conversion has no streaming boundary to stop at; the
   * archive bound was already applied to its size before anything was read.
   *
   * The format the conversion was routed by is what picks the converter, so staging, revalidation,
   * and reselection all reach the same one for the same file (ADR 0072 §5).
   */
  async #convertSelectedManuscript(
    selectedPath: string,
    format: ManuscriptConversionProjection['sourceFormat'],
    expected?: { digest: string; byteLength: number },
  ): Promise<{ docx: Uint8Array; loss: ConversionLoss } | null> {
    const bytes = await readFile(selectedPath);
    // A kept original is the digest of record (ADR 0072 §2): the bytes converted are the bytes the digest names, read
    // once, so a same-size change that converts to the same working representation is still refused (#606's review).
    if (expected !== undefined) {
      requireStore(
        bytes.byteLength === expected.byteLength && sha256(bytes) === expected.digest,
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存对象摘要无效。',
      );
    }
    try {
      return format === 'DOC' ? await convertDocManuscript(bytes) : convertTextManuscript(bytes, { format });
    } catch (error) {
      if (isTextConversionRefusal(error) || isDocConversionRefusal(error)) return null;
      throw error;
    }
  }

  /**
   * Parse a working representation the product itself wrote. Its bounds are the parser's, so text
   * past them is refused as the bound it crossed and never as a claim about the selected file.
   */
  async #parseIntoIngestedWorkingRepresentation(
    draftId: string,
    workingPath: string,
    displayName: string,
  ): Promise<IngestedDocx> {
    try {
      return await this.#parseIntoIngest(draftId, workingPath, displayName, { workingRepresentation: true });
    } catch (error) {
      if (error instanceof StoreError || error instanceof StoreFatalError) throw error;
      if (error instanceof Error && error.message.startsWith('DOCX_REJECTED:')) {
        throw new StoreError('DOCX_REJECTED', '转换得到的工作表示超出当前受限本地导入边界。');
      }
      throw error;
    }
  }

  /** The working representation is a content object of its own, under `.docx` and its own digest. */
  async #persistWorkingObject(
    docx: Uint8Array,
  ): Promise<{ digest: string; byteLength: number; relativeKey: string; path: string }> {
    const digest = sha256(docx);
    const relativeKey = await this.#persistContentObject(docx, digest, 'DOCX');
    return { digest, byteLength: docx.byteLength, relativeKey, path: this.#contentObjectPath(digest, relativeKey) };
  }

  #insertContentObject(objectDigest: string, relativeKey: string, byteLength: number, now: string): void {
    this.#authority
      .prepare(
        `INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(object_digest) DO NOTHING`,
      )
      .run(objectDigest, relativeKey, byteLength, now);
    const object = one(
      this.#authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').all(objectDigest) as SqlRow[],
      'OBJECT_VERIFY_FAILED',
      '暂存对象记录缺失。',
    );
    requireStore(
      asString(object.relative_key) === relativeKey && asNumber(object.byte_length) === byteLength,
      'OBJECT_VERIFY_FAILED',
      '暂存对象记录冲突。',
    );
  }

  async getImportStartup(): Promise<ImportStartupProjection> {
    this.#assertAvailable();
    const attempts = this.#authority
      .prepare(
        `SELECT attempt_id
         FROM import_commit_attempts
         WHERE state != 'committed' OR completion_acknowledged_at IS NULL
         ORDER BY CASE state WHEN 'uncertain' THEN 0 WHEN 'prepared' THEN 1 ELSE 2 END, prepared_at, attempt_id`,
      )
      .all() as SqlRow[];
    let committed: ImportCommitProjection | undefined;
    for (const row of attempts) {
      const attempt = this.#loadCommitAttempt(asString(row.attempt_id));
      const reconciliation = await this.#reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await this.#recoveryProjection(attempt.draftId, 'outcome-uncertain'),
        };
      }
      if (reconciliation.state === 'committed' && attempt.completionAcknowledgedAt === null && !committed) {
        committed = reconciliation.result;
      }
    }
    if (committed) return { state: 'committed-recovered', result: committed };

    const cleanupIntents = this.#authority
      .prepare('SELECT draft_id FROM import_abandonment_cleanup_intents ORDER BY requested_at, draft_id')
      .all() as SqlRow[];
    if (cleanupIntents.length > 0) {
      return {
        state: 'draft-recovery',
        recovery: await this.#recoveryProjection(
          asString(cleanupIntents[0]!.draft_id),
          'abandonment-cleanup',
        ),
      };
    }

    const drafts = this.#authority
      .prepare(
        `SELECT draft_id
         FROM import_drafts
         WHERE state IN ('staged', 'reviewed')
         ORDER BY staged_at, draft_id`,
      )
      .all() as SqlRow[];
    if (drafts.length === 0) return { state: 'none' };
    return {
      state: 'draft-recovery',
      recovery: await this.#recoveryProjection(asString(drafts[0]!.draft_id), 'ordinary-draft'),
    };
  }

  async getStartup(): Promise<StartupProjection> {
    this.#assertAvailable();
    const attentionId = this.#boundedCall(() => this.#boundedAuthority.firstRecoveryAttentionId());
    if (attentionId !== null) {
      return { state: 'manuscript-recovery', recovery: await this.getRecoveryComparison(attentionId) };
    }
    const startup = await this.getImportStartup();
    if (startup.state !== 'none') return { state: 'import', startup };
    return { state: 'prior-work', priorWork: this.listPriorWork() };
  }

  getRecoveryComparison(attentionId: string): Promise<RecoveryComparisonProjection> { return manuscriptOperations.getRecoveryComparison(this.#manuscriptOperationsHost, attentionId); }

  viewRecoveryCandidate(attentionId: string, expectedAttentionVersion: number, selection: RecoverySelection, target: RecoveryWindowTarget): Promise<RecoveryWindowProjection> {
    return manuscriptOperations.viewRecoveryCandidate(this.#manuscriptOperationsHost, attentionId, expectedAttentionVersion, selection, target);
  }

  async deferRecovery(attentionId: string, expectedAttentionVersion: number): Promise<RecoveryDeferralProjection> {
    this.#assertAvailable();
    const deferred = this.#boundedCall(() =>
      this.#boundedAuthority.deferRecovery(attentionId, expectedAttentionVersion));
    const startup = await this.getImportStartup();
    return {
      ...deferred,
      next: startup.state === 'none'
        ? { state: 'prior-work', priorWork: this.listPriorWork() }
        : { state: 'import', startup },
    };
  }

  restoreRecovery(restorationId: string, attentionId: string, expectedAttentionVersion: number, selection: RecoverySelection): Promise<RecoveryRestorationProjection> {
    return manuscriptOperations.restoreRecovery(this.#manuscriptOperationsHost, restorationId, attentionId, expectedAttentionVersion, selection);
  }

  async continueImportDraft(draftId: string, expectedDraftVersion: number): Promise<ContinueImportProjection> { return importIntakeOperations.continueImportDraft(this.#importIntakeOperationsHost, draftId, expectedDraftVersion); }

  async reselectImportDraft(
    draftId: string,
    expectedDraftVersion: number,
    selectionToken: string,
    selectedPathInput: string,
  ): Promise<ContinueImportProjection> { return importIntakeOperations.reselectImportDraft(this.#importIntakeOperationsHost, draftId, expectedDraftVersion, selectionToken, selectedPathInput); }

  /**
   * Reselect the exact original behind a converted draft (Issue #611). The original's own bytes are the identity check, as
   * a first staging's are; the working representation is then reproduced from them and restaged — persisted, parsed and
   * checked exactly as the first staging did — and the draft returns to `staged` with it, so a draft whose representation
   * could no longer be reproduced, after a converter change, is whole again. The review it had is invalidated.
   */
  async #reselectConvertedDraft(
    selection: { draftId: string; selectionToken: string; selectedPath: string; displayName: string },
    draft: { expectedDigest: string; expectedBytes: number; expectedDraftVersion: number; previousState: string; recovered: boolean },
    sourceFormat: ManuscriptConversionProjection['sourceFormat'],
  ): Promise<ContinueImportProjection> {
    const { draftId, selectionToken, selectedPath, displayName } = selection;
    // The conversion is today's route for the draft's own format, as a first staging's is (#615's review): the working
    // representation restaged below is this converter's output, so the draft, its review and a later Source Version
    // name this converter, never the one recorded at the first staging (ADR 0072 §2).
    const route = editableImport(sourceFormat);
    requireStore(route.available && route.conversion !== undefined, 'SNAPSHOT_RESELECTION_REQUIRED', '重选文件无法再次转换。');
    const conversion = route.conversion;
    let converted: { docx: Uint8Array; loss: ConversionLoss } | null;
    try {
      // The bytes converted are the bytes the draft's digest names, read once (#606's review): another file is refused
      // as the reselection's own mismatch.
      converted = await this.#convertSelectedManuscript(selectedPath, conversion.sourceFormat,
        { digest: draft.expectedDigest, byteLength: draft.expectedBytes });
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      if (error instanceof StoreError && error.code === 'SNAPSHOT_RESELECTION_REQUIRED') {
        throw new StoreError('RESELECTION_MISMATCH', '重选文件与原暂存来源身份不一致。');
      }
      if (error instanceof StoreError) throw error;
      throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '重选文件无法形成完整的本地暂存快照。');
    }
    requireStore(converted !== null, 'SNAPSHOT_RESELECTION_REQUIRED', '重选文件无法再次转换。');
    const fidelity = conversionFidelityReport(conversion, converted.loss);
    return this.#withContentObjectLifecycle(async () => {
      this.#requireNoAbandonmentCleanupIntent(draftId);
      const retained = await this.#persistRetainedOriginal(selectedPath, conversion.sourceFormat);
      requireStore(retained.digest === draft.expectedDigest, 'RESELECTION_MISMATCH', '重选文件与原暂存来源身份不一致。');
      const working = await this.#persistWorkingObject(converted.docx);
      const ingested = await this.#parseIntoIngestedWorkingRepresentation(draftId, working.path, displayName);
      try {
        const { parsed } = ingested;
        requireStore(isCleanTracerFidelity(parsed.fidelity), 'FIDELITY_OUTSIDE_TRACER', '工作表示带有解析器自身的保真信号。');
        requireStore(
          parsed.sourceDigest === working.digest && parsed.archiveBytes === working.byteLength,
          'OBJECT_VERIFY_FAILED',
          '工作表示对象与解析结果不一致。',
        );
        const nextVersion = draft.expectedDraftVersion + 1;
        const now = new Date().toISOString();
        this.#transaction(this.#authority, () => {
          const current = one(
            this.#authority
              .prepare('SELECT state, draft_version, object_digest FROM import_drafts WHERE draft_id = ?')
              .all(draftId) as SqlRow[],
            'DRAFT_NOT_FOUND',
            '导入草稿不存在。',
          );
          requireStore(
            (asString(current.state) === 'staged' || asString(current.state) === 'reviewed') &&
              asNumber(current.draft_version) === draft.expectedDraftVersion &&
              asString(current.object_digest) === draft.expectedDigest,
            'DRAFT_VERSION_CHANGED',
            '导入草稿在重选持久化前已变化。',
          );
          this.#insertContentObject(working.digest, working.relativeKey, working.byteLength, now);
          this.#insertContentObject(retained.digest, retained.relativeKey, retained.byteLength, now);
          this.#authority.prepare('DELETE FROM manuscript_reimport_comparisons WHERE draft_id = ?').run(draftId);
          this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(draftId);
          // As the first staging: the snapshot is keyed on the original's digest, the working representation is what was read.
          this.#promoteIngestSnapshot(draftId, ingested, now, { sourceDigest: retained.digest, fidelity });
          const draftUpdate = this.#authority
            .prepare(
              `UPDATE import_drafts
               SET selection_token = ?, state = 'staged', draft_version = ?, display_name = ?, selected_path = ?,
                   working_object_digest = ?, converter_identity = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
                   reviewed_target_kind = NULL, reviewed_existing_book_id = NULL,
                   reviewed_relationship = NULL, reviewed_book_state_digest = NULL,
                   reviewed_reuse_source_version_id = NULL,
                   reviewed_lineage_status = NULL, reviewed_lineage_source_version_id = NULL,
                   reviewed_checkpoint_revision_id = NULL, reviewed_manuscript_id = NULL, reviewed_branch_id = NULL,
                   review_digest = NULL, reviewed_at = NULL
               WHERE draft_id = ? AND draft_version = ? AND state IN ('staged', 'reviewed')`,
            )
            .run(selectionToken, nextVersion, displayName, selectedPath, working.digest, conversion.converterIdentity,
              draftId, draft.expectedDraftVersion);
          requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在重选时已变化。');
          this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(draftId);
          this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(draftId));
          this.#assertForeignKeys(this.#authority);
        });
        return {
          state: 'target-review-required',
          staged: this.#stagedProjection(this.#loadDraftSnapshot(draftId)),
          originalFileAccess: { state: 'available-exact', label: '原始所选文件仍可访问且身份一致' },
          reviewInvalidated: draft.previousState === 'reviewed' || draft.recovered,
          notice: '已通过原来源摘要精确匹配完成重选，并重新转换、形成完整暂存与预检；请重新确认全部决定。',
        };
      } finally {
        this.#discardIngest(ingested.ingestId);
      }
    });
  }

  /**
   * Reselect the exact original behind a source-only draft. There is nothing to parse, so the file's
   * own digest is the whole identity check, and the draft returns to `staged` with the same
   * source-only shape it had before.
   */
  async #reselectSourceOnlyDraft(
    selection: { draftId: string; selectionToken: string; selectedPath: string; displayName: string; format: SourceFormat },
    draft: { expectedDigest: string; expectedDraftVersion: number; previousState: string; recovered: boolean },
  ): Promise<ContinueImportProjection> {
    const { draftId, selectionToken, selectedPath, displayName, format } = selection;
    return this.#withContentObjectLifecycle(async () => {
      this.#requireNoAbandonmentCleanupIntent(draftId);
      const retained = await this.#persistRetainedOriginal(selectedPath, format);
      requireStore(retained.digest === draft.expectedDigest, 'RESELECTION_MISMATCH', '重选文件与原暂存来源身份不一致。');
      const nextVersion = draft.expectedDraftVersion + 1;
      const now = new Date().toISOString();
      this.#transaction(this.#authority, () => {
        const current = one(
          this.#authority
            .prepare('SELECT state, draft_version, object_digest FROM import_drafts WHERE draft_id = ?')
            .all(draftId) as SqlRow[],
          'DRAFT_NOT_FOUND',
          '导入草稿不存在。',
        );
        requireStore(
          (asString(current.state) === 'staged' || asString(current.state) === 'reviewed') &&
            asNumber(current.draft_version) === draft.expectedDraftVersion &&
            asString(current.object_digest) === draft.expectedDigest,
          'DRAFT_VERSION_CHANGED',
          '导入草稿在重选持久化前已变化。',
        );
        this.#authority
          .prepare(
            `INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(object_digest) DO UPDATE SET
               relative_key = excluded.relative_key,
               byte_length = excluded.byte_length,
               verified_at = excluded.verified_at`,
          )
          .run(retained.digest, retained.relativeKey, retained.byteLength, now);
        const draftUpdate = this.#authority
          .prepare(
            `UPDATE import_drafts
             SET selection_token = ?, state = 'staged', draft_version = ?, display_name = ?, object_digest = ?,
                 selected_path = ?, source_format = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
                 reviewed_target_kind = NULL, reviewed_existing_book_id = NULL,
                 reviewed_relationship = NULL, reviewed_book_state_digest = NULL,
                 reviewed_reuse_source_version_id = NULL,
                 reviewed_lineage_status = NULL, reviewed_lineage_source_version_id = NULL,
                 reviewed_checkpoint_revision_id = NULL, reviewed_manuscript_id = NULL, reviewed_branch_id = NULL,
                 review_digest = NULL, reviewed_at = NULL
             WHERE draft_id = ? AND draft_version = ? AND state IN ('staged', 'reviewed')`,
          )
          .run(selectionToken, nextVersion, displayName, retained.digest, selectedPath, format,
            draftId, draft.expectedDraftVersion);
        requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在重选时已变化。');
        this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(draftId);
        this.#assertForeignKeys(this.#authority);
      });
      return {
        state: 'target-review-required',
        staged: this.#stagedProjection(this.#loadDraftSnapshot(draftId)),
        originalFileAccess: { state: 'available-exact', label: '原始所选文件仍可访问且身份一致' },
        reviewInvalidated: draft.previousState === 'reviewed' || draft.recovered,
        notice: '已通过原来源摘要精确匹配完成重选；请重新确认全部决定。',
      };
    });
  }

  async abandonImportDraft(draftId: string, expectedDraftVersion: number): Promise<ImportStartupProjection> { return importIntakeOperations.abandonImportDraft(this.#importIntakeOperationsHost, draftId, expectedDraftVersion); }

  async acknowledgeImportCompletion(commitId: string): Promise<{ state: 'acknowledged' }> { return importIntakeOperations.acknowledgeImportCompletion(this.#importIntakeOperationsHost, commitId); }

  /**
   * `textBoxDisposition` is the review's choice for the file's text boxes (ADR 0086 §2): `retain`, the
   * default, keeps them with the Source Version; `merge` puts their paragraphs into the Manuscript right
   * after the paragraph that anchors each one. Only a file with a text box can merge.
   */
  prepareNewBookReview(
    draftId: string,
    expectedDraftVersion: number,
    targetSelection: ImportTargetSelection,
    acceptDegradation: boolean,
    textBoxDisposition: TextBoxDisposition = 'retain',
    trackedChanges?: WordTrackedChoiceInput,
    structure?: ImportStructureChoice,
  ): ReviewBeforeImportProjection { return importIntakeOperations.prepareNewBookReview(this.#importIntakeOperationsHost, draftId, expectedDraftVersion, targetSelection, acceptDegradation, textBoxDisposition, trackedChanges, structure); }

  prepareSourceImportReview(
    draftId: string,
    expectedDraftVersion: number,
    targetSelection: SourceImportTargetSelection,
  ): ReviewBeforeSourceImportProjection { return importIntakeOperations.prepareSourceImportReview(this.#importIntakeOperationsHost, draftId, expectedDraftVersion, targetSelection); }

  createManuscriptReimportPreparationWork(
    draftId: string,
    expectedDraftVersion: number,
    targetSelection: ManuscriptReimportTargetSelection,
  ): { workId: string; total: number } { return manuscriptReimportOperations.createManuscriptReimportPreparationWork(this.#manuscriptReimportOperationsHost, draftId, expectedDraftVersion, targetSelection); }

  advanceManuscriptReimportPreparationWork(workId: string): ReimportPreparationProgress { return manuscriptReimportOperations.advanceManuscriptReimportPreparationWork(this.#manuscriptReimportOperationsHost, workId); }

  cancelManuscriptReimportPreparationWork(workId: string): boolean { return manuscriptReimportOperations.cancelManuscriptReimportPreparationWork(this.#manuscriptReimportOperationsHost, workId); }

  /**
   * One page of the chapter-level comparison (Issue #412, plan slice S63; V2-UX-IMP-041, IMP-057): each row a run of
   * changed paragraphs between exact ones, its first paragraphs on each side, the verbs its shape admits and the one
   * chosen. Exact paragraphs never form a row.
   */
  getReimportMappingPage(
    draftId: string,
    expectedDraftVersion: number,
    after: number | null,
  ): ReimportMappingPageProjection { return manuscriptReimportOperations.getReimportMappingPage(this.#manuscriptReimportOperationsHost, draftId, expectedDraftVersion, after); }

  acceptReimportDegradation(
    draftId: string,
    expectedDraftVersion: number,
  ): ReviewBeforeManuscriptReimportProjection { return manuscriptReimportOperations.acceptReimportDegradation(this.#manuscriptReimportOperationsHost, draftId, expectedDraftVersion); }

  /**
   * Resolve one row of the chapter-level comparison by one verb (Issue #412, plan slice S63; V2-UX-IMP-057): the verb
   * must be one the row's shape admits, and it writes the identity of every mapping in the row — carried in order,
   * new or retired — as the per-mapping resolutions the commit reads. Nothing is preselected or inferred.
   */
  createReimportResolutionWork(
    draftId: string,
    expectedDraftVersion: number,
    groupId: string,
    verb: ReimportGroupVerb,
  ): { workId: string; total: number } { return manuscriptReimportOperations.createReimportResolutionWork(this.#manuscriptReimportOperationsHost, draftId, expectedDraftVersion, groupId, verb); }

  advanceReimportResolutionWork(workId: string): ReimportResolutionProgress { return manuscriptReimportOperations.advanceReimportResolutionWork(this.#manuscriptReimportOperationsHost, workId); }

  cancelReimportResolutionWork(workId: string): boolean { return manuscriptReimportOperations.cancelReimportResolutionWork(this.#manuscriptReimportOperationsHost, workId); }

  async commitNewBookImport(
    input: {
      draftId: string;
      expectedDraftVersion: number;
      reviewDigest: string;
      commitId: string;
    },
    options: { interruptAfterAttempt?: boolean } = {},
  ): Promise<ManuscriptImportCommitProjection> { return importIntakeOperations.commitNewBookImport(this.#importIntakeOperationsHost, input, options); }

  async commitSourceImport(
    input: {
      draftId: string;
      expectedDraftVersion: number;
      reviewDigest: string;
      commitId: string;
    },
    options: { interruptAfterAttempt?: boolean } = {},
  ): Promise<SourceImportCommitProjection> { return importIntakeOperations.commitSourceImport(this.#importIntakeOperationsHost, input, options); }

  resolveAcknowledgedManuscriptReimportReplay(
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
  ): { draftId: string; commitId: string; bookId: string } { return manuscriptReimportOperations.resolveAcknowledgedManuscriptReimportReplay(this.#manuscriptReimportOperationsHost, input); }

  async createManuscriptReimportCommitWork(
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
    options: {
      interruptAfterAttempt?: boolean;
      interruptAfterCommit?: boolean;
      legacyResultWithoutPresentation?: boolean;
    } = {},
  ): Promise<{ workId: string | null; total: number; result: ManuscriptReimportCommitProjection | null }> { return manuscriptReimportOperations.createManuscriptReimportCommitWork(this.#manuscriptReimportOperationsHost, input, options); }

  async advanceManuscriptReimportCommitWork(workId: string): Promise<ReimportCommitProgress> { return manuscriptReimportOperations.advanceManuscriptReimportCommitWork(this.#manuscriptReimportOperationsHost, workId); }

  cancelManuscriptReimportCommitWork(workId: string): boolean { return manuscriptReimportOperations.cancelManuscriptReimportCommitWork(this.#manuscriptReimportOperationsHost, workId); }

  rewriteCommittedResultWithoutPresentationForTest(commitId: string): void {
    requireStore(UUID_PATTERN.test(commitId), 'COMMIT_INVALID', '测试提交标识无效。');
    const row = one(this.#authority.prepare(
      'SELECT result_json FROM import_commits WHERE commit_id = ?',
    ).all(commitId) as SqlRow[], 'COMMIT_PROOF_INCONCLUSIVE', '测试提交结果不存在。');
    const parsed = JSON.parse(asString(row.result_json)) as Record<string, unknown>;
    delete parsed.receipt;
    delete parsed.overview;
    delete parsed.window;
    requireStore(this.#authority.prepare(
      'UPDATE import_commits SET result_json = ? WHERE commit_id = ?',
    ).run(canonicalJson(parsed), commitId).changes === 1,
    'COMMIT_PROOF_INCONCLUSIVE', '无法建立旧版无展示字段提交结果。');
  }

  /**
   * Where a reimport lands (V2-UX-IMP-056; Issue #412): the editor's remembered place as the reimport mapped it —
   * its paragraph where the identity carried, else the nearest one — or the start when none is remembered.
   */
  #reimportLandingWindow(overview: BookWorkOverviewProjection, manuscriptId: string, branchId: string): ManuscriptWindowProjection { return manuscriptReimportOperations.reimportLandingWindow(this.#manuscriptReimportOperationsHost, overview, manuscriptId, branchId); }

  #sourceImportAuthorityCounts(bookId: string): {
    manuscripts: number;
    revisions: number;
    workflows: number;
    fidelityReviews: number;
    manuscriptImports: number;
    sourceVersions: number;
    provenance: number;
    sourceImports: number;
  } { return manuscriptReimportOperations.sourceImportAuthorityCounts(this.#manuscriptReimportOperationsHost, bookId); }

  getManuscriptWindow(manuscriptId: string, branchId: string, cursor: string | null): ManuscriptWindowProjection { return manuscriptOperations.getManuscriptWindow(this.#manuscriptOperationsHost, manuscriptId, branchId, cursor); }

  /** What the Manuscript window and history operations in manuscript/operations.ts reach of the store (Issue #1536), read live. */
  readonly #manuscriptOperationsHost: manuscriptOperations.ManuscriptOperationsHost = this.#manuscriptOperationsHostOf();
  #manuscriptOperationsHostOf(): manuscriptOperations.ManuscriptOperationsHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      get bounded() { return store.#bounded; },
      get boundedAuthority() { return store.#boundedAuthority; },
      get recoveryObjects() { return store.#recoveryObjects; },
      get lifetimeId() { return store.#lifetimeId; },
      assertAvailable: this.#assertAvailable.bind(this),
      boundedCall: this.#boundedCall.bind(this),
      withRecoveryObjectLifecycle: this.#withRecoveryObjectLifecycle.bind(this),
      captureManual: (source) => new EditorialMemoryFacade(this.#journal).captureManual(source, this.#baselineAnalysis.launch.operationalScope),
      analysisResultSetRevision: (bookId) => this.#baselineAnalysis.inspect(bookId, undefined, null).resultSetRevision,
      cancelReplacement: (previewId) => this.cancelReplacement(previewId),
      admitJournalWrite: () => { if (this.#checkpointWorker) this.#checkpointWorker.admitJournalWrite(); else this.#checkpoint.admitJournalWrite(); },
      journalWritten: () => { this.#checkpointWorker?.journalWritten(); },
    };
  }

  readManuscriptImageChunk(input: import('../shared/protocol.js').ServiceOperationMap['readManuscriptImageChunk']['input']) { return manuscriptOperations.readManuscriptImageChunk(this.#manuscriptOperationsHost, input); }

  recordManuscriptEntryPosition(manuscriptId: string, branchId: string, blockId: string, grapheme: number): void { manuscriptOperations.recordManuscriptEntryPosition(this.#manuscriptOperationsHost, manuscriptId, branchId, blockId, grapheme); }

  readManuscriptEntryPosition(manuscriptId: string, branchId: string): ManuscriptEntryPositionProjection | null { return manuscriptOperations.readManuscriptEntryPosition(this.#manuscriptOperationsHost, manuscriptId, branchId); }

  async waitForJournalCheckpoint(): Promise<void> { await this.#checkpointWorker?.waitForJournalWrite(); }

  flushJournalEdit(input: JournalEditInput): JournalAcknowledgement { return manuscriptOperations.flushJournalEdit(this.#manuscriptOperationsHost, input); }

  inspectManualLearningSource(signalId: string, cursor: import('./bounded-manuscript.js').ManualCommandSourceCursor | null = null,
    budgetBytes = MAX_FRAME_BYTES): import('./bounded-manuscript.js').ManualCommandSourcePage {
    return this.#learningCall(() => this.#memoryFacade().manualSourcePage(signalId, cursor, budgetBytes));
  }

  /** What the Editorial Mark operations in editorial-mark-operations.ts reach of the store (Issue #1536), read live. */
  readonly #editorialMarkOperationsHost: editorialMarkOperations.EditorialMarkOperationsHost = this.#editorialMarkOperationsHostOf();
  #editorialMarkOperationsHostOf(): editorialMarkOperations.EditorialMarkOperationsHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      get boundedAuthority() { return store.#boundedAuthority; },
      get lifetimeId() { return store.#lifetimeId; },
      get editorialMarks() { return store.#editorialMarks; },
      get manuscriptApply() { return store.#manuscriptApply; },
      get proposalConflicts() { return store.#proposalConflicts; },
      markCall: this.#markCall.bind(this),
      conflictCall: this.#conflictCall.bind(this),
      boundedCall: this.#boundedCall.bind(this),
      transaction: this.#transaction.bind(this),
      factualLineageOfMark: (markId) => this.#verificationCall(() => this.#factualVerification.lineageOfMark(markId)),
    };
  }

  createEditorialMark(input: CreateEditorialMarkInput): EditorialMarkCommandProjection { return editorialMarkOperations.createEditorialMark(this.#editorialMarkOperationsHost, input); }

  getEditorialMarkCard(manuscriptId: string, branchId: string, markId: string): EditorialMarkCardProjection { return editorialMarkOperations.getEditorialMarkCard(this.#editorialMarkOperationsHost, manuscriptId, branchId, markId); }
  findPendingMark(input: FindPendingMarkInput): { mark: PendingMarkPlace | null } { return editorialMarkOperations.findPendingMark(this.#editorialMarkOperationsHost, input); }

  updateEditorialMark(input: UpdateEditorialMarkInput): EditorialMarkCommandProjection { return editorialMarkOperations.updateEditorialMark(this.#editorialMarkOperationsHost, input); }

  recordChangeSuggestionDecision(input: RecordChangeSuggestionDecisionInput): EditorialMarkCommandProjection { return editorialMarkOperations.recordChangeSuggestionDecision(this.#editorialMarkOperationsHost, input); }

  recordProposalDecisionReason(input: RecordProposalDecisionReasonInput): EditorialMarkCommandProjection { return editorialMarkOperations.recordProposalDecisionReason(this.#editorialMarkOperationsHost, input); }

  recordProposalDecisionFeedback(input: RecordProposalDecisionFeedbackInput): EditorialMarkCommandProjection { return editorialMarkOperations.recordProposalDecisionFeedback(this.#editorialMarkOperationsHost, input); }

  applyChangeSuggestion(input: ApplyChangeSuggestionInput): ManuscriptApplyCommandProjection { return editorialMarkOperations.applyChangeSuggestion(this.#editorialMarkOperationsHost, input); }

  applyChangeSuggestionBatch(input: ApplyChangeSuggestionBatchInput): ManuscriptApplyCommandProjection { return editorialMarkOperations.applyChangeSuggestionBatch(this.#editorialMarkOperationsHost, input); }

  commitReplacementRevisions(input: CommitReplacementRevisionsInput): ReplacementRevisionsProjection { return editorialMarkOperations.commitReplacementRevisions(this.#editorialMarkOperationsHost, input); }

  inspectAiEditLocks(input: InspectAiEditLocksInput): AiEditLocksProjection { return editorialMarkOperations.inspectAiEditLocks(this.#editorialMarkOperationsHost, input); }

  setAiEditLocks(input: SetAiEditLocksInput): AiEditLocksProjection { return editorialMarkOperations.setAiEditLocks(this.#editorialMarkOperationsHost, input); }

  scopedEditWorkingBlocks(manuscriptId: string, branchId: string, selector: Parameters<typeof editorialMarkOperations.scopedEditWorkingBlocks>[3]): ReturnType<typeof editorialMarkOperations.scopedEditWorkingBlocks> {
    return editorialMarkOperations.scopedEditWorkingBlocks(this.#editorialMarkOperationsHost, manuscriptId, branchId, selector);
  }

  reverseAppliedChangeSuggestion(input: ReverseAppliedChangeSuggestionInput): ManuscriptApplyCommandProjection { return editorialMarkOperations.reverseAppliedChangeSuggestion(this.#editorialMarkOperationsHost, input); }

  inspectProposalWorkspace(input: ProposalWorkspaceInput): ProposalWorkspaceProjection { return editorialMarkOperations.inspectProposalWorkspace(this.#editorialMarkOperationsHost, input); }
  saveProposalDecisionDraft(input: SaveProposalDecisionDraftInput): ProposalWorkspaceProjection { return editorialMarkOperations.saveProposalDecisionDraft(this.#editorialMarkOperationsHost, input); }
  batchProposalDecisionDraft(input: BatchProposalDecisionDraftInput): ProposalDraftBatchProjection { return editorialMarkOperations.batchProposalDecisionDraft(this.#editorialMarkOperationsHost, input); }
  recordProposalDecision(input: RecordProposalDecisionInput): ProposalWorkspaceProjection { return editorialMarkOperations.recordProposalDecision(this.#editorialMarkOperationsHost, input); }
  inspectApplyReceipt(input: InspectApplyReceiptInput): ApplyReceiptProjection { return editorialMarkOperations.inspectApplyReceipt(this.#editorialMarkOperationsHost, input); }
  prepareReverseApply(input: PrepareReverseApplyInput): ReverseApplyPreparationProjection { return editorialMarkOperations.prepareReverseApply(this.#editorialMarkOperationsHost, input); }
  getManuscriptApplyOutcome(manuscriptId: string, branchId: string, clientEffectId: string): ManuscriptApplyOutcomeProjection { return editorialMarkOperations.getManuscriptApplyOutcome(this.#editorialMarkOperationsHost, manuscriptId, branchId, clientEffectId); }

  getManuscriptRail(manuscriptId: string, branchId: string): ManuscriptRailProjection { return manuscriptOperations.getManuscriptRail(this.#manuscriptOperationsHost, manuscriptId, branchId); }

  createProducedEditorialMark(input: ProducedEditorialMarkInput): string { return editorialMarkOperations.createProducedEditorialMark(this.#editorialMarkOperationsHost, input); }

  createProducedEditorialMarks<T>(inputs: ReadonlyArray<ProducedEditorialMarkInput>, record: (markIds: ReadonlyArray<string | null>) => T): T {
    return editorialMarkOperations.createProducedEditorialMarks(this.#editorialMarkOperationsHost, inputs, record);
  }

  listPriorWork(): ReadonlyArray<PriorWorkItemProjection> {
    return this.#boundedCall(() => this.#bounded.listPriorWork());
  }

  resolveBookWorkbenchRoute(route: BookWorkbenchRoute): ResolvedBookWorkbenchRoute {
    return this.#boundedCall(() => {
      const resolved = this.#bounded.resolveBookWorkbenchRoute(route);
      if (route.kind !== 'book') return resolved;
      if (route.feedbackEntryId !== undefined) {
        const entry = learningSupervision.readFeedbackHistory(this.#learningSupervisionHost, { bookId: route.bookId }, route.feedbackEntryId).entries[0];
        requireStore(resolved.kind === 'book' && entry !== undefined, 'FEEDBACK_SOURCE_NOT_FOUND', '这条反馈的来源记录不存在。');
        requireStore(entry.target.kind !== 'mark' || !entry.target.detached,
          'FEEDBACK_SOURCE_DETACHED', '这条修改建议所在的段落已不在稿件中。');
        return { ...resolved, feedbackTarget: entry.target };
      }
      if (route.learningMaterialKey !== undefined) {
        const material = this.inspectLearningMaterial(route.bookId, route.learningMaterialKey);
        requireStore(resolved.kind === 'book', 'LEARNING_MATERIAL_NOT_FOUND', '无法打开学习材料的来源记录。');
        requireStore(material.target.kind !== 'mark' || !material.target.detached,
          'LEARNING_SOURCE_DETACHED', '来源修改建议所在的段落已不在稿件中。');
        return { ...resolved, learningMaterialTarget: material.target };
      }
      return resolved;
    });
  }

  getHistoricalRevision(revisionId: string, cursor: string | null): HistoricalRevisionProjection { return manuscriptOperations.getHistoricalRevision(this.#manuscriptOperationsHost, revisionId, cursor); }

  getSearchBackendSettings(): import('../shared/protocol.js').SearchBackendSettingsProjection {
    return modelSearchSettings.getSearchBackendSettings(this.#modelSearchSettingsHost);
  }

  getSearchBackendConnections(): import('../shared/protocol.js').SearchBackendConnectionProjection[] {
    return modelSearchSettings.getSearchBackendConnections(this.#modelSearchSettingsHost);
  }

  /** The default backend, or (#1226) with `role: 'fallback'` the one 备用来源 — `null` clears it; a new default never stays the fallback. */
  selectSearchBackend(backendId: string | null, role?: 'fallback', alwaysUseSelectedBackend?: boolean): void {
    return modelSearchSettings.selectSearchBackend(this.#modelSearchSettingsHost, backendId, role, alwaysUseSelectedBackend);
  }

  saveSearchBackendCredential(backendId: string, reference: string | null, state: import('../shared/protocol.js').ModelCredentialOperationState): import('../shared/protocol.js').SearchBackendConnectionProjection {
    return modelSearchSettings.saveSearchBackendCredential(this.#modelSearchSettingsHost, backendId, reference, state);
  }

  getModelServiceProxy(): Promise<import('../shared/protocol.js').ModelServiceProxySetting> {
    return modelSearchSettings.getModelServiceProxy(this.#modelSearchSettingsHost);
  }

  saveModelServiceProxy(input: import('../shared/protocol.js').ModelServiceProxySetting): Promise<import('../shared/protocol.js').ModelServiceProxySetting> {
    return modelSearchSettings.saveModelServiceProxy(this.#modelSearchSettingsHost, input);
  }

  /** The DeepSeek 开放平台（官方） connection, as Issue #712 has always read it. */
  getModelServiceConnection(): ModelServiceConnectionProjection | null {
    return modelSearchSettings.getModelServiceConnection(this.#modelSearchSettingsHost);
  }

  /** One production route's connection (Issue #811), or `null` when that route has none. */
  getModelServiceRouteConnection(route: ModelServiceRouteId): ModelServiceConnectionProjection | null {
    return modelSearchSettings.getModelServiceRouteConnection(this.#modelSearchSettingsHost, route);
  }

  /** Every route's connection, the default route first (Issue #811). */
  getModelServiceConnections(): ModelServiceConnectionProjection[] {
    return modelSearchSettings.getModelServiceConnections(this.#modelSearchSettingsHost);
  }

  /**
   * Save one route's connection (Issue #811). A route with no connection gets a fresh Credential Reference minted here, per
   * data root, never one a provider document fixes for development; an existing connection keeps its own. The first
   * connection saved is the route in use until the editor chooses another.
   */
  saveModelServiceConnection(
    connectionNameInput: string,
    credentialReferenceInput: string | null,
    credentialOperationState: 'ready' | 'needs-attention',
    route: ModelServiceRouteId = 'deepseek-open-platform',
  ): ModelServiceConnectionProjection {
    return modelSearchSettings.saveModelServiceConnection(this.#modelSearchSettingsHost, connectionNameInput, credentialReferenceInput, credentialOperationState, route);
  }

  /** One connection's credential state, by its Credential Reference, whichever route it is on. */
  setModelServiceCredentialState(
    credentialReference: string,
    credentialOperationState: ModelCredentialOperationState,
  ): ModelServiceConnectionProjection {
    return modelSearchSettings.setModelServiceCredentialState(this.#modelSearchSettingsHost, credentialReference, credentialOperationState);
  }

  /**
   * Choose the route new Tasks use (Issue #811): a settings change, never a fallback. The route must have a connection; a Run
   * already planned keeps the binding its plan froze.
   */
  selectModelServiceRoute(route: ModelServiceRouteId): ModelServiceConnectionProjection {
    return modelSearchSettings.selectModelServiceRoute(this.#modelSearchSettingsHost, route);
  }

  /** A role's binding under the cascade of Issue #1620; legacy ids read as aliases. A missing key never falls back to another channel. */
  getConfiguredModelRoleBinding(role: ModelRoleId | LegacyModelRoleId, override: RuntimeExecutionConfig = {}): ConfiguredProviderBinding | null {
    return modelSearchSettings.getConfiguredModelRoleBinding(this.#modelSearchSettingsHost, role, override);
  }
  /** The four roles with their effective model and its source (Issue #1620). */
  getModelRoles(): ModelRoleResolutionProjection[] { return modelSearchSettings.getModelRoles(this.#modelSearchSettingsHost); }
  clearFlashModel(): void { modelSearchSettings.clearFlashModel(this.#modelSearchSettingsHost); }
  selectFastRoleModel(route: ModelServiceRouteId, modelId: string, reasoningEffort?: string): void { this.selectRoleModel(route, modelId, 'fast', reasoningEffort); }
  selectMainRoleModel(route: ModelServiceRouteId, modelId: string, reasoningEffort?: string): void { this.selectRoleModel(route, modelId, 'main', reasoningEffort); }
  selectBothRoleModels(route: ModelServiceRouteId, modelId: string, reasoningEffort?: string, fastReasoningEffort?: string): void {
    this.selectRoleModel(route, modelId, 'both', reasoningEffort, fastReasoningEffort);
  }

  private selectRoleModel(route: ModelServiceRouteId, modelId: string, role: 'main' | 'fast' | 'both', reasoningEffort?: string, fastReasoningEffort?: string): void {
    return modelSearchSettings.selectRoleModel(this.#modelSearchSettingsHost, route, modelId, role, reasoningEffort, fastReasoningEffort);
  }

  private modelServiceBinding(route: ModelServiceRouteId, modelId: string): import('../shared/protocol.js').ModelServiceBindingProjection {
    return modelSearchSettings.modelServiceBinding(this.#modelSearchSettingsHost, route, modelId);
  }

  getModelServiceModels(route: ModelServiceRouteId): import('../shared/protocol.js').DiscoveredModel[] {
    return modelSearchSettings.getModelServiceModels(this.#modelSearchSettingsHost, route);
  }

  cacheModelServiceModels(connection: ModelServiceConnectionProjection, models: readonly import('../shared/protocol.js').DiscoveredModel[]): void {
    return modelSearchSettings.cacheModelServiceModels(this.#modelSearchSettingsHost, connection, models);
  }

  /** Retain only a closed, sanitized status for the exact credential generation tested. */
  recordModelConnectionTest(connection: ModelServiceConnectionProjection, result: ModelConnectionTestStatus): void {
    return modelSearchSettings.recordModelConnectionTest(this.#modelSearchSettingsHost, connection, result);
  }

  getManuscriptWindowAt(manuscriptId: string, branchId: string, target: ManuscriptWindowTarget, marks?: { afterOrdinal: number; digest: string }): ManuscriptWindowProjection { return manuscriptOperations.getManuscriptWindowAt(this.#manuscriptOperationsHost, manuscriptId, branchId, target, marks); }

  getOutline(manuscriptId: string, branchId: string, cursor: string | null): OutlineProjection { return manuscriptOperations.getOutline(this.#manuscriptOperationsHost, manuscriptId, branchId, cursor); }

  createSearch(manuscriptId: string, branchId: string, query: string): ReturnType<typeof manuscriptOperations.createSearch> { return manuscriptOperations.createSearch(this.#manuscriptOperationsHost, manuscriptId, branchId, query); }

  advanceSearch(searchId: string): ReturnType<typeof manuscriptOperations.advanceSearch> { return manuscriptOperations.advanceSearch(this.#manuscriptOperationsHost, searchId); }

  cancelSearch(searchId: string): void { manuscriptOperations.cancelSearch(this.#manuscriptOperationsHost, searchId); }

  getSearchResults(searchId: string, cursor: string | null): SearchResultsProjection { return manuscriptOperations.getSearchResults(this.#manuscriptOperationsHost, searchId, cursor); }

  prepareReplacement(searchId: string, replacement: string, excludedMatchIds: ReadonlyArray<string>): ReplacementPreviewProjection {
    return manuscriptOperations.prepareReplacement(this.#manuscriptOperationsHost, searchId, replacement, excludedMatchIds);
  }

  freezeReplacement(previewId: string, excludedMatchIds: ReadonlyArray<string>): ReplacementPreviewProjection { return manuscriptOperations.freezeReplacement(this.#manuscriptOperationsHost, previewId, excludedMatchIds); }

  advanceReplacementWork(previewId: string): ReturnType<typeof manuscriptOperations.advanceReplacementWork> { return manuscriptOperations.advanceReplacementWork(this.#manuscriptOperationsHost, previewId); }

  commitReplacement(previewId: string): ReplacementCommitProjection { return manuscriptOperations.commitReplacement(this.#manuscriptOperationsHost, previewId); }

  cancelReplacement(previewId: string): boolean { return manuscriptOperations.cancelReplacement(this.#manuscriptOperationsHost, previewId); }

  dismissReplacementPreview(previewId: string): ReplacementDismissalProjection { return manuscriptOperations.dismissReplacementPreview(this.#manuscriptOperationsHost, previewId); }

  saveMilestone(manuscriptId: string, branchId: string, label: string, purposeKind: MilestonePurposeKind, purpose: string | null, note: string): Promise<MilestoneProjection> {
    return manuscriptOperations.saveMilestone(this.#manuscriptOperationsHost, manuscriptId, branchId, label, purposeKind, purpose, note);
  }

  // ---- ⑥ 交付物 · 发稿 (Issue #414, plan slice S65) -------------------------------------------------

  /** The 交付物 of one Book: its Manuscript's milestones, its Publication Versions, and what followed them. */
  inspectDeliverables(bookId: string): DeliverablesProjection {
    return this.#publicationCall(() => this.#withActuals(this.#publicationVersions.deliverables(bookId)));
  }

  /** 交付物's 录入定价与首印 line with what was entered for its 发稿版本 (Issue #430, S82). */
  #withActuals(deliverables: DeliverablesProjection): DeliverablesProjection {
    return evaluationCalibrationOperations.withActuals(this.#evaluationCalibrationHost, deliverables);
  }

  /** 设置 › 评估校准与预测 (Issue #430, plan slice S82; EVAL-010, EVAL-011, EVAL-014). A read. */
  inspectEvaluationCalibration(input: InspectEvaluationCalibrationInput = { after: null, focusBookId: null }): EvaluationCalibrationProjection {
    return evaluationCalibrationOperations.inspectEvaluationCalibration(this.#evaluationCalibrationHost, input);
  }

  /** 录入定价与首印 for a Book's current 发稿版本 (EVAL-010). */
  recordPublicationActuals(input: RecordPublicationActualsInput): EvaluationCalibrationProjection {
    return evaluationCalibrationOperations.recordPublicationActuals(this.#evaluationCalibrationHost, input);
  }

  /** The house's calibration and prediction switches (EVAL-010, EVAL-011). */
  setEvaluationPreferences(input: SetEvaluationPreferencesInput): EvaluationCalibrationProjection {
    return evaluationCalibrationOperations.setEvaluationPreferences(this.#evaluationCalibrationHost, input);
  }

  /** What the calibration operations in evaluation-calibration-operations.ts reach of the store (Issue #1534), read live. */
  readonly #evaluationCalibrationHost: evaluationCalibrationOperations.EvaluationCalibrationOperationsHost = this.#evaluationCalibrationHostOf();

  #evaluationCalibrationHostOf(): evaluationCalibrationOperations.EvaluationCalibrationOperationsHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      calibrationCall: this.#calibrationCall.bind(this),
      get control() { return store.#control; },
      get evaluationCalibration() { return store.#evaluationCalibration; },
      get evaluations() { return store.#evaluations; },
      publicationCall: this.#publicationCall.bind(this),
      get publicationVersions() { return store.#publicationVersions; },
      safeTitle,
      transaction: this.#transaction.bind(this),
    };
  }

  #calibrationCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof EvaluationCalibrationError || error instanceof EvaluationError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  // ---- 书系 › 成员与共享范围 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012) --------------------------------------

  /** What the 书系 operations in series.ts reach of the store (Issue #1172): its authority, ledgers and guarded calls, read live. */
  readonly #seriesHost: seriesOperations.SeriesStoreHost = this.#seriesHostOf();

  #seriesHostOf(): seriesOperations.SeriesStoreHost {
    const store = this;
    return {
      get authority() { return store.#authority; },
      get editorialMarks() { return store.#editorialMarks; },
      evaluationBookTitle: this.#evaluationBookTitle.bind(this),
      learningCandidates: this.#learningCandidates.bind(this),
      get learningEligibility() { return store.#learningEligibility; },
      markCall: this.#markCall.bind(this),
      get reviewRuns() { return store.#reviewRuns; },
      get series() { return store.#series; },
      seriesCall: this.#seriesCall.bind(this),
      get seriesExclusions() { return store.#seriesExclusions; },
      get seriesKnowledge() { return store.#seriesKnowledge; },
      seriesMembersPage: this.#seriesMembersPage.bind(this),
      seriesScopedTaskReach: this.#seriesScopedTaskReach.bind(this),
      transaction: this.#transaction.bind(this),
    };
  }

  inspectSeriesList(after: SeriesListCursor | null = null): SeriesListProjection {
    return seriesOperations.inspectSeriesList(this.#seriesHost, after);
  }

  createSeries(input: CreateSeriesInput): SeriesCreationProjection { return seriesOperations.createSeries(this.#seriesHost, input); }

  inspectSeries(seriesId: string): SeriesProjection { return seriesOperations.inspectSeries(this.#seriesHost, seriesId); }

  inspectSeriesMembers(seriesId: string, after: SeriesMembersCursor | null): SeriesMembersPageProjection {
    return seriesOperations.inspectSeriesMembers(this.#seriesHost, seriesId, after);
  }

  inspectSeriesCandidates(seriesId: string, text: string, after: SeriesCandidatesCursor | null): SeriesCandidatesProjection {
    return seriesOperations.inspectSeriesCandidates(this.#seriesHost, seriesId, text, after);
  }

  inspectSeriesHistory(filter: { readonly seriesId: string | null; readonly bookId: string | null }, after: SeriesHistoryCursor | null): SeriesHistoryPageProjection {
    return seriesOperations.inspectSeriesHistory(this.#seriesHost, filter, after);
  }

  previewSeriesMembershipChange(input: PreviewSeriesMembershipChangeInput): SeriesMembershipPreviewProjection {
    return seriesOperations.previewSeriesMembershipChange(this.#seriesHost, input);
  }

  changeSeriesMembership(input: ChangeSeriesMembershipInput): SeriesMembershipChangeResultProjection {
    return seriesOperations.changeSeriesMembership(this.#seriesHost, input);
  }

  inspectBookSeries(bookId: string, after: SeriesListCursor | null = null): BookSeriesProjection {
    return seriesOperations.inspectBookSeries(this.#seriesHost, bookId, after);
  }

  /** One page of a Series' members after the one named, newest joined first, and how many it holds in all. */
  #seriesMembersPage(seriesId: string, after: SeriesMembersCursor | null): SeriesMembersPageProjection & { count: number } {
    const members: SeriesMemberProjection[] = [];
    let count = 0;
    // Each Series' knowledge is read once for the whole page, however many members share it (Issue #64 review).
    const readings = newSeriesKnowledgeReadings();
    for (const entry of this.#series.members(seriesId)) {
      count += 1;
      if (members.length >= MAX_SERIES_MEMBERS_PAGE + 1 || (after !== null &&
        (entry.joinedAt > after.joinedAt || (entry.joinedAt === after.joinedAt && entry.bookId >= after.bookId)))) continue;
      const people = this.#bookPeople.current(entry.bookId);
      const consistency = this.#reviewRuns.seriesConsistencyState(entry.bookId, readings);
      members.push({
        bookId: entry.bookId,
        title: this.#evaluationBookTitle(entry.bookId),
        authors: people.authors,
        editors: people.editors,
        joinedAt: entry.joinedAt,
        // 书系一致性 for this member (Issue #64, S29a): when its findings last reached the manuscript, and why not now.
        seriesConsistencyReview: consistency.reviewedAt === null ? null : { reviewedAt: consistency.reviewedAt },
        seriesConsistencyUnavailableReason: consistency.unavailableReason,
      });
    }
    const { page, more } = weighedPage(members, MAX_SERIES_MEMBERS_PAGE);
    const last = page.at(-1);
    return { members: page, nextCursor: more && last !== undefined ? { joinedAt: last.joinedAt, bookId: last.bookId } : null, count };
  }

  // ---- 书系检索排除 (Issue #64, plan slice S29b; V2-UX-SER-020 to SER-029; ADR 0037) -----------------------------------

  inspectSeriesExclusionTargets(input: InspectSeriesExclusionTargetsInput): SeriesExclusionTargetsProjection {
    return seriesOperations.inspectSeriesExclusionTargets(this.#seriesHost, input);
  }

  inspectSeriesExclusionHistory(input: InspectSeriesExclusionHistoryInput): SeriesExclusionHistoryPageProjection {
    return seriesOperations.inspectSeriesExclusionHistory(this.#seriesHost, input);
  }

  previewSeriesExclusion(input: PreviewSeriesExclusionInput): SeriesExclusionPreviewProjection {
    return seriesOperations.previewSeriesExclusion(this.#seriesHost, input);
  }

  recordSeriesExclusion(input: RecordSeriesExclusionInput): SeriesExclusionResultProjection {
    return seriesOperations.recordSeriesExclusion(this.#seriesHost, input);
  }

  /**
   * The current-read guard the execution owner asks before each reading range of a Run (Issue #64, S29b; SER-023): what an
   * exclusion in force reaches of the Series material the Run froze, or `null`. A record it cannot read stops the Run rather
   * than let it read past a restriction it could not check.
   */
  seriesScopeGuard(runRecordId: string): string | null {
    this.#assertAvailable();
    try {
      return this.#reviewRuns.seriesScopeGuard(runRecordId);
    } catch {
      return '无法读取的书系检索排除记录';
    }
  }

  /**
   * The current-read guard over 本社审阅偏好 (Issue #912; LAUD-008), asked by the execution owner before each reading range of a
   * Run: the pinned version a Learning Material behind what the Run reads was 停止今后使用 from, or `null`. A record it cannot
   * read stops the Run rather than let it read past a withdrawal it could not check.
   */
  learningInfluenceGuard(runRecordId: string): string | null {
    this.#assertAvailable();
    const row = this.#authority.prepare(`SELECT t.book_id, t.kind, p.canonical_json FROM analysis_run_records r
      JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id
      JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
      JOIN analysis_plan_records p ON p.sha256 = a.plan_envelope_sha256 AND p.component = 'plan-envelope'
      WHERE r.run_record_id = ?`).get(runRecordId);
    if (row !== undefined) {
      const plan = JSON.parse(String(row.canonical_json)) as { editorialMemory?: unknown; editorialMemorySourceKind?: string };
      const frozen = plan.editorialMemory;
      if (frozen !== undefined && canonicalJson(frozen) !== canonicalJson(this.editorialMemory(String(row.book_id), plan.editorialMemorySourceKind ?? String(row.kind))))
        return '本社与本书编辑偏好已变化，请重新准备任务。';
    }
    return this.#reviewRuns.learningReadGuard(runRecordId) ?? this.#preferenceGovernanceGuard(runRecordId);
  }

  /**
   * The same guard over explicit governance (Issue #1083): a 停用, 冻结, 修正 or 合并 — or a person the house names now — that
   * changes the lines a Run's pin carries stops it before its next range, as a withdrawal does; a change elsewhere does not.
   */
  #preferenceGovernanceGuard(runRecordId: string): string | null {
    return learningSupervision.preferenceGovernanceGuard(this.#learningSupervisionHost, runRecordId);
  }

  /** Verify the consuming ledger's frozen material boundary; no material paragraphs are paged or composed here. */
  materialGuard(runRecordId: string, ledger: BaselineAnalysisStore): MaterialGuardRefusal | null {
    this.#assertAvailable();
    const deliverable = this.#reviewRuns.deliverableGuard(runRecordId, ledger.launch.live !== null);
    if (deliverable !== null) return deliverable;
    const intent = this.#authority.prepare('SELECT t.task_intent_id, t.book_id, t.canonical_json FROM analysis_run_records r JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id WHERE r.run_record_id = ?').get(runRecordId) as SqlRow | undefined;
    requireStore(intent !== undefined, 'ANALYSIS_RUN_INVALID', '运行记录不存在。');
    const decision = (JSON.parse(asString(intent.canonical_json)) as { factualDecision?: import('./factual-verification.js').FactualRecheckSelection }).factualDecision;
    if (decision !== undefined) {
      try {
        const { reader } = this.#resultBinding(decision.bookId, decision.resultId);
        requireStore(canonicalJson(this.#factualVerification.recheckSelection(decision.bookId, decision.decisionId, reader)) === canonicalJson(decision),
          'FACTUAL_DECISION_DRIFT', '补充核查的决定、断言或来源已变化。');
      } catch { return { code: 'FACTUAL_DECISION_DRIFT', materialTitle: '核查决定', message: '补充核查的决定、断言或来源已变化；请重新准备并批准。' }; }
    }
    const boundary = ledger.definition.kind === 'writing'
      ? this.#writingCall(() => this.#writingTasks.materialBoundary(asString(intent.task_intent_id), ledger.definition.promptContractDigest))
      : { bookId: asString(intent.book_id), references: ledger.definition.materialReferences?.sources ?? [] };
    for (const source of boundary.references) {
      try {
        this.#materialIndexCall(() => this.#materialIndex.verifyForTask(boundary, source.materialId,
          (id, book) => this.#libraryMaterials.available(id, book)));
      } catch (error) {
        if (!(error instanceof StoreError) || !['MATERIAL_INDEX_MOVED', 'MATERIAL_REFERENCE_UNAVAILABLE', 'MATERIAL_INDEX_RECORD_INVALID', 'MATERIAL_INDEX_NO_TEXT', 'LIBRARY_MATERIAL_NOT_FOUND'].includes(error.code)) throw error;
        const code = error.code === 'MATERIAL_INDEX_NO_TEXT' ? 'MATERIAL_INDEX_RECORD_INVALID'
          : error.code === 'LIBRARY_MATERIAL_NOT_FOUND' ? 'MATERIAL_INDEX_MOVED' : error.code;
        const reading = taskMaterialRefusal(source, code, ledger.definition.kind === 'writing' ? '写作'
          : ledger.definition.kind === 'evaluation' || ledger.definition.kind === 'readers-report' ? '评估' : '审阅');
        return { code, materialTitle: source.title, message: reading.refusal!.message };
      }
    }
    return null;
  }

  /**
   * 取消任务 of a Review Run an exclusion stopped (SER-024): it then reads 已取消 and offers nothing more; what it put on the
   * manuscript stays as it is. The answer is the Book's 审阅 with the Run open.
   */
  cancelReviewRun(bookId: string, reviewRunId: string, progress?: ProgressReader): ReviewWorkspaceProjection {
    return reviewOperations.cancelReviewRun(this.#reviewOperationsHost, bookId, reviewRunId, progress);
  }

  /**
   * The Series-scoped Runs that are not a Review Run's (Issue #64, 7b; SER-022, SER-026): each whose frozen scope a target
   * reaches, as authorized, waiting or running, or as completed. A Review Run's are read from its own snapshot; a Task not yet
   * authorized is no Run, and its authorization re-reads the scope.
   */
  #seriesScopedTaskReach(seriesId: string, covers: (material: SeriesKnowledgeMaterial) => boolean): {
    readonly active: ReadonlyArray<{ readonly taskIntentId: string; readonly route: string }>;
    readonly completed: ReadonlyArray<{ readonly taskIntentId: string; readonly route: string }>;
  } {
    const active: Array<{ taskIntentId: string; route: string }> = [];
    const completed: Array<{ taskIntentId: string; route: string }> = [];
    for (const task of this.#series.tasks(seriesId)) {
      if (task.runRecordId === null || isReviewCategoryKindId(task.kind)) continue;
      const scopes = frozenSeriesScopes(this.#authority, task.taskIntentId);
      if (scopes === undefined || !seriesScopeMaterials(this.#authority, scopes).some(covers)) continue;
      const route = `《${task.bookTitle}》${task.kind === INITIAL_EVALUATION_KIND ? 'AI7 初评' : task.title}`;
      const state = asString((this.#authority.prepare('SELECT state FROM analysis_run_states WHERE run_record_id = ? ORDER BY sequence DESC LIMIT 1')
        .get(task.runRecordId) as SqlRow).state);
      if (state === 'completed' || state === 'completed-with-gaps') completed.push({ taskIntentId: task.taskIntentId, route });
      else if (!['failed', 'interrupted', 'cancelled', 'blocked-before-dispatch'].includes(state)) active.push({ taskIntentId: task.taskIntentId, route });
    }
    return { active, completed };
  }

  // ---- 书系知识 (Issue #63, plan slice S28b; V2-UX-SER-013 to SER-019; ADR 0036) ---------------------------------------

  proposeSeriesKnowledge(input: ProposeSeriesKnowledgeInput): SeriesKnowledgeProposalProjection {
    return seriesOperations.proposeSeriesKnowledge(this.#seriesHost, input);
  }

  inspectSeriesKnowledgeReview(input: InspectSeriesKnowledgeReviewInput): SeriesKnowledgeReviewProjection {
    return seriesOperations.inspectSeriesKnowledgeReview(this.#seriesHost, input);
  }

  editSeriesKnowledgeCandidate(input: EditSeriesKnowledgeCandidateInput): SeriesKnowledgeReviewProjection {
    return seriesOperations.editSeriesKnowledgeCandidate(this.#seriesHost, input);
  }

  promoteSeriesKnowledge(input: PromoteSeriesKnowledgeInput): SeriesKnowledgePromotionProjection {
    return seriesOperations.promoteSeriesKnowledge(this.#seriesHost, input);
  }

  inspectSeriesKnowledgeItems(seriesId: string, text: string, after: SeriesKnowledgeItemsCursor | null): SeriesKnowledgeItemsPageProjection {
    return seriesOperations.inspectSeriesKnowledgeItems(this.#seriesHost, seriesId, text, after);
  }

  inspectSeriesKnowledgeCandidates(seriesId: string, after: SeriesKnowledgeCandidatesCursor | null): SeriesKnowledgeCandidatesPageProjection {
    return seriesOperations.inspectSeriesKnowledgeCandidates(this.#seriesHost, seriesId, after);
  }

  inspectSeriesKnowledgeConflicts(input: { seriesId: string; itemId: string; revisionId: string; after: number }): SeriesKnowledgeConflictsProjection {
    return seriesOperations.inspectSeriesKnowledgeConflicts(this.#seriesHost, input);
  }

  inspectSeriesKnowledgeRevisions(seriesId: string, itemId: string, before: number | null): SeriesKnowledgeRevisionsProjection {
    return seriesOperations.inspectSeriesKnowledgeRevisions(this.#seriesHost, seriesId, itemId, before);
  }

  // ---- 设置 › 数据与存储 › 版本 (Issue #433, plan slice S85a; V2-UX-DSTO-016; ADR 0079 §1) --------------------------------

  /** The software version and the Data Version apart, the latest software update, and the store's version records. A read. */
  inspectDataVersion(): DataVersionProjection {
    return this.#dataVersionCall(() => {
      const { latest, recent, update, count, upgrades } = this.#dataVersions.standing();
      const location = backupLocationFor(this.#dataRoot);
      return {
        softwareVersion: this.#softwareVersion,
        dataVersion: this.#dataVersion,
        frozen: DATA_VERSION_FROZEN,
        schemaRevision: latest!.schemaRevision,
        update,
        // A record of an upgrade names the backup made before it, and whether it is still in the backup location (Issue #967).
        history: recent
          .map((entry) => ({ softwareVersion: entry.softwareVersion, dataVersion: entry.dataVersion, schemaRevision: entry.schemaRevision, recordedAt: entry.recordedAt,
            ...(entry.upgrade === null ? {} : { backup: { fileName: entry.upgrade.backup.fileName, present: existsSync(join(location, entry.upgrade.backup.fileName)) } }) })),
        historyTruncated: count > MAX_STORE_VERSIONS_LISTED,
        // Each upgrade to a later Data Version, newest first, with the backup made before it (Issue #433, S85b): the newest
        // twenty, kept as the ledger is read as a stream.
        upgrades: upgrades.map((entry) => ({
          fromDataVersion: entry.upgrade!.fromDataVersion,
          toDataVersion: entry.dataVersion,
          fromSoftwareVersion: entry.upgrade!.fromSoftwareVersion,
          ...(entry.upgrade!.rollback === undefined ? {} : { rollback: {
            softwareVersion: entry.upgrade!.rollback.softwareVersion, dataVersion: entry.upgrade!.rollback.dataVersion,
            backupFileName: entry.upgrade!.rollback.backup.fileName,
            backupPresent: existsSync(join(location, entry.upgrade!.rollback.backup.fileName)),
          } }),
          softwareVersion: entry.softwareVersion,
          changes: entry.upgrade!.changes,
          backupFileName: entry.upgrade!.backup.fileName,
          backupPresent: existsSync(join(location, entry.upgrade!.backup.fileName)),
          recordedAt: entry.recordedAt,
        })),
        backupLocation: location,
        // The data root's version marker as it stands now (Issue #967; ADR 0023): this open wrote it.
        marker: inspectDataVersionMarker(this.#dataRoot),
      };
    });
  }

  // ---- 设置 › 数据与存储 › 导出数据库 (Issue #434, plan slice S86a; V2-UX-DSTO-017; ADR 0079 §1.4, §1.6, §1.7) ----------------

  /**
   * The destination the Save dialog answered becomes one preparation of the database package — only under this launch's
   * verified External Export Policy (Issue #434, S86a review) — packed off the request: answers at once with the export's
   * activity, which 取消导出 stops (V2-UX-EXP-011).
   */
  startDatabaseExportPreparation(destination: string, available: boolean): DatabaseExportActivityProjection {
    return this.#databaseExportRead(() => this.#databaseExports.startPreparation(destination, available));
  }

  /** `按上述方式导出`: the one approval of one unchanged preparation, and the write it permits, under the same policy and the same way. */
  startDatabaseExportApproval(preparationId: string, available: boolean): DatabaseExportActivityProjection {
    return this.#databaseExportRead(() => this.#databaseExports.startApproval(preparationId, available));
  }

  /** 取消导出: the export under way stops until it begins putting the file in place. */
  cancelDatabaseExport(activityId: string): DatabaseExportActivityProjection {
    return this.#databaseExportRead(() => this.#databaseExports.cancel(activityId));
  }

  /** Prepare, and wait for the preparation: what a caller that follows no activity uses. */
  async prepareDatabaseExport(destination: string, available: boolean): Promise<DatabaseExportPreparationProjection> {
    return this.#databaseExportCall(() => this.#databaseExports.prepare(destination, available));
  }

  /** Approve, and wait for the receipt: what a caller that follows no activity uses. */
  async approveDatabaseExport(preparationId: string, available: boolean): Promise<DatabaseExportReceiptProjection> {
    return this.#databaseExportCall(() => this.#databaseExports.approve(preparationId, available));
  }

  /** Whether a database export runs now: packing or writing, until it ends. */
  databaseExportRunning(): boolean {
    return this.#databaseExports.activity()?.state === 'running';
  }

  /** Resolves once the database export under way, if any, has ended. */
  async databaseExportSettled(): Promise<void> {
    await this.#databaseExports.settled();
  }

  /** At shutdown: the database export under way stops, leaving no package it was writing, before the store closes. */
  stopDatabaseExports(): Promise<void> {
    return this.#databaseExports.stop();
  }

  /** The approved database exports, newest first, and the export under way. A read. */
  inspectDatabaseExports(): DatabaseExportsProjection {
    return this.#databaseExportRead(() => this.#databaseExports.history());
  }

  #databaseExportRead<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof DatabaseExportError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  async #databaseExportCall<T>(operation: () => Promise<T>): Promise<T> {
    this.#assertAvailable();
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DatabaseExportError || error instanceof ExportLedgerError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  // ---- 设置 › 服务 › 用量 (Issue #936, plan slice 11c; V2-UX-MSET-010) ------------------------------------------------------

  /** The Runs already recorded, summed by Book, Task kind or period. A read: it writes nothing and asks no Provider. */
  inspectUsage(input: { range: UsageRange; groupBy: UsageGrouping; runOffset?: number; runRecordId?: string; asOf?: string }, now: Date = new Date()): UsageProjection {
    this.#assertAvailable();
    return this.#usage.inspect(input.range, input.groupBy, input.asOf === undefined ? now : new Date(input.asOf), input.runOffset, input.runRecordId);
  }

  // ---- 设置 › 数据与存储 › 定期自动备份 (Issue #434, plan slice S86b; V2-UX-DSTO-018; ADR 0079 §1.4, §1.7) ----------------

  /** The switch, the fixed backup location and the backups kept. A read. */
  inspectScheduledBackups(now: Date = new Date()): ScheduledBackupsProjection {
    this.#assertAvailable();
    try {
      return this.#scheduledBackups.projection(now);
    } catch (error) {
      if (error instanceof ScheduledBackupError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  /**
   * Turn the switch from the state the editor saw, and answer at once (Issue #434 review): turned on, the backup it makes
   * due is written on the service's background check, as the hourly one is, so no request waits on the write. The answer
   * says whether one is being made, and the section reads again until it is done.
   */
  async setScheduledBackup(input: SetScheduledBackupInput, now: Date = new Date()): Promise<ScheduledBackupsProjection> {
    return this.#scheduledBackupCall(async () => {
      this.#scheduledBackups.setEnabled(input.enabled, input.expectedOrdinal);
      if (input.enabled) void this.#scheduledBackups.runIfDue(now).catch(() => undefined);
      return this.#scheduledBackups.projection(now);
    });
  }

  /**
   * The running service's check: a backup when one is due, and only fourteen days kept. Answers whether one was made; asked
   * while a check runs, it answers with that one.
   */
  async runScheduledBackupIfDue(now: Date = new Date()): Promise<boolean> {
    // Its record would be lost with the data a waiting replacement replaces, so none is made meanwhile (Issue #434 review).
    if (this.replacementWaiting()) return false;
    return this.#scheduledBackupCall(() => this.#scheduledBackups.runIfDue(now));
  }

  /** At shutdown, before the store closes (Issue #434 review): the check under way stops and removes what it wrote. */
  async stopScheduledBackups(): Promise<void> {
    await this.#scheduledBackups.stop();
  }

  async #scheduledBackupCall<T>(operation: () => Promise<T>): Promise<T> {
    this.#assertAvailable();
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ScheduledBackupError || error instanceof DatabaseExportError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  // ---- 设置 › 数据与存储 › 导入数据库 (Issue #434, plan slice S86c; V2-UX-DSTO-017; ADR 0079 §1.3, §1.4) ---------------------

  /** The file the Open dialog answered, read and verified whole for 导入数据库's preview; nothing is taken from it. */
  async inspectDatabaseImport(source: string): Promise<DatabaseImportPreviewProjection> {
    return this.#databaseReplacementCall(() => this.#databaseReplacements.preview(source));
  }

  /**
   * `替换本机全部数据`: the data as it is backed up, and the previewed package waiting to replace it at AI7's next start. The
   * backup writes alone in the backup location (Issue #434, S86c restack): after a 定期自动备份 check under way, and with none
   * starting until it is written.
   */
  async prepareDatabaseReplacement(previewId: string, now: Date = new Date()): Promise<DatabaseReplacementsProjection> {
    try {
      return await this.#databaseReplacementCall(() =>
        this.#databaseReplacements.freezing(() => this.#scheduledBackups.alone(() => this.#databaseReplacements.prepare(previewId, now))));
    } finally {
      this.#resumeMaterialIndexing();
    }
  }

  /**
   * Whether a replacement waits for AI7's next start (Issue #434 review): the service then takes no write, so nothing changed
   * meanwhile is lost with the data the replacement replaces.
   */
  replacementWaiting(): boolean {
    return this.#databaseReplacements.waiting;
  }

  /**
   * Whether a replacement is being prepared or waits (Issue #434 review): Reconnect Preflight admits nothing then, from the
   * moment the replacement is asked for, and a preflight under way checks again before it admits or blocks a Run.
   */
  replacementFrozen(): boolean {
    return this.#databaseReplacements.frozen;
  }

  /** `取消替换`: the replacement waiting is removed and the data stays as it is. */
  async cancelDatabaseReplacement(replacementId: string): Promise<DatabaseReplacementsProjection> {
    const cancelled = await this.#databaseReplacementCall(() => this.#databaseReplacements.cancel(replacementId));
    // What the replacement held back is built now, in this same lifetime, and every later arrival as it arrives (#729).
    this.#resumeMaterialIndexing();
    return cancelled;
  }

  /** The replacement waiting, if any, and the replacements this data records. A read. */
  async inspectDatabaseReplacements(): Promise<DatabaseReplacementsProjection> {
    return this.#databaseReplacementCall(() => this.#databaseReplacements.projection());
  }

  /** `回退到替换前的数据`: the latest replacement's backup waiting to replace the data, which is backed up first, alone too. */
  async rollBackDatabaseReplacement(replacementId: string, now: Date = new Date()): Promise<DatabaseReplacementsProjection> {
    try {
      return await this.#databaseReplacementCall(() =>
        this.#databaseReplacements.freezing(() => this.#scheduledBackups.alone(() => this.#databaseReplacements.rollBack(replacementId, now))));
    } finally {
      this.#resumeMaterialIndexing();
    }
  }

  /**
   * `只导入其中的图书，与本机合并（重名的另存）` (Issue #434, S86d; ADR 0079 §1.5): the data backed up, and the previewed package's
   * Books not already here merging, with every record they own, at AI7's next start. Its backup writes alone in the backup
   * location, as a replacement's does.
   */
  async prepareDatabaseMerge(previewId: string, now: Date = new Date()): Promise<DatabaseReplacementsProjection> {
    return this.#databaseReplacementCall(() => this.#scheduledBackups.alone(() => this.#databaseReplacements.prepareMerge(previewId, now)));
  }

  async #databaseReplacementCall<T>(operation: () => Promise<T>): Promise<T> {
    this.#assertAvailable();
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DatabaseReplacementError || error instanceof DatabasePackageError || error instanceof DatabaseExportError ||
        error instanceof ScheduledBackupError || error instanceof DatabaseMergeError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  #dataVersionCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof DataVersionError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  #seriesCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof SeriesError || error instanceof SeriesKnowledgeError || error instanceof LearningEligibilityError ||
          error instanceof DecisionFeedbackError || error instanceof AnalysisFeedbackError || error instanceof SeriesExclusionError ||
          error instanceof ReviewRunError) {
        throw new StoreError(error.code, error.message);
      }
      throw error;
    }
  }

  /**
   * 设为发稿版本 over one exact milestone of the Book's primary Manuscript: the designation, its internal
   * Public Release Permission and its two events in one transaction, or no change for an identical repeat.
   */
  designatePublicationVersion(input: DesignatePublicationVersionInput): PublicationDesignationProjection {
    return this.#publicationCall(() => {
      const designated = this.#publicationVersions.designate(input);
      return { ...designated, deliverables: this.#withActuals(designated.deliverables) };
    });
  }

  // ---- ⑥ 维护事项 (Issue #426, plan slice S68a; V2-UX-MAINT-001 to 011) -------------------------------------

  /** One 维护事项 of the Book in its workspace: its target, its timeline and what it offers next. */
  inspectMaintenanceCase(input: InspectMaintenanceCaseInput): MaintenanceCaseProjection {
    return this.#publicationCall(() => this.#maintenanceCases.inspect(input));
  }

  /** `更早的维护事项…`: a page of one designation's older cases, before the oldest one shown. */
  listMaintenanceCases(input: ListMaintenanceCasesInput): MaintenanceCasePageProjection {
    return this.#publicationCall(() => this.#maintenanceCases.page(input));
  }

  /** `记录维护事项`: one case and its first revision, bound to one exact designation, in one transaction. */
  recordMaintenanceCase(input: RecordMaintenanceCaseInput): MaintenanceCaseResultProjection {
    return this.#publicationCall(() => this.#transaction(this.#authority, () => this.#maintenanceCases.record(input)));
  }

  /** 关联修改建议, 关联发稿版本 or 记录维护事项结论: the case's next revision, against the one the editor read. */
  appendMaintenanceCaseRevision(input: AppendMaintenanceCaseRevisionInput): MaintenanceCaseResultProjection {
    return this.#publicationCall(() => this.#transaction(this.#authority, () => this.#maintenanceCases.append(input)));
  }

  /** `保存勘误版本`: the 勘误's next version and the revision that links it, in one transaction. */
  saveMaintenanceErrata(input: SaveMaintenanceErrataInput): MaintenanceCaseResultProjection {
    return this.#publicationCall(() => this.#transaction(this.#authority, () => this.#maintenanceCases.saveErrata(input)));
  }

  // ---- ⑥ 交付物 · 生产文档 (Issue #415, plan slice S66) -----------------------------------------------

  /** 从来源材料创建 (V2-UX-DELIV-001, WORK-013); the operation is in production-document-operations.ts. */
  async createProductionDocument(input: CreateProductionDocumentInput): Promise<ProductionDocumentResultProjection> {
    return productionDocumentOperations.createProductionDocument(this.#productionDocumentHost, input);
  }

  saveProductionDocumentType(input: SaveProductionDocumentTypeInput): ProductionDocumentTypesProjection {
    this.#assertAvailable();
    return saveProductionDocumentType(this.#authority, input);
  }

  deleteProductionDocumentType(input: DeleteProductionDocumentTypeInput): ProductionDocumentTypesProjection {
    this.#assertAvailable();
    return deleteProductionDocumentType(this.#authority, input.typeId);
  }

  reorderProductionDocumentTypes(input: ReorderProductionDocumentTypesInput): ProductionDocumentTypesProjection {
    this.#assertAvailable();
    return reorderProductionDocumentTypes(this.#authority, input.typeIds);
  }

  updateProductionDocumentMeta(input: UpdateProductionDocumentMetaInput): ProductionDocumentsProjection {
    return productionDocumentOperations.updateProductionDocumentMeta(this.#productionDocumentHost, input);
  }

  renameProductionDocument(input: RenameProductionDocumentInput): ProductionDocumentResultProjection {
    return productionDocumentOperations.renameProductionDocument(this.#productionDocumentHost, input);
  }

  /** `本书不做` or `恢复` for one house type of a Book (WORK-013): an appended decision, or no change. */
  decideProductionDocumentType(input: DecideProductionDocumentTypeInput): ProductionDocumentResultProjection {
    return productionDocumentOperations.decideProductionDocumentType(this.#productionDocumentHost, input);
  }

  /** 保存为版本 (DELIV-002): the document's working text becomes its next version. */
  async saveProductionDocumentVersion(input: SaveProductionDocumentVersionInput): Promise<ProductionDocumentResultProjection> {
    return productionDocumentOperations.saveProductionDocumentVersion(this.#productionDocumentHost, input);
  }

  /** 交付 (Issue #415, S66b; DELIV-003): one Delivery Record of one exact version of a document of this Book. */
  async recordProductionDocumentDelivery(input: RecordProductionDocumentDeliveryInput): Promise<ProductionDocumentResultProjection> {
    return productionDocumentOperations.recordProductionDocumentDelivery(this.#productionDocumentHost, input);
  }

  /** 交付 · 生产文档 of one Book (Issue #415): one card per house type and the materials a document can start from. */
  inspectProductionDocuments(bookId: string): ProductionDocumentsProjection {
    return productionDocumentOperations.inspectProductionDocuments(this.#productionDocumentHost, bookId);
  }

  /** 开始 / 完成 / 跳过 / 重新打开 one phase of a document of this Book (Issue #415, S66c; WORK-008, WORK-009). */
  transitionProductionDocumentPhase(input: TransitionProductionDocumentPhaseInput): ProductionDocumentResultProjection {
    return productionDocumentOperations.transitionProductionDocumentPhase(this.#productionDocumentHost, input);
  }

  /** What the 生产文档 operations in production-document-operations.ts reach of the store (Issue #1534), read live. */
  readonly #productionDocumentHost: productionDocumentOperations.ProductionDocumentOperationsHost = this.#productionDocumentHostOf();

  #productionDocumentHostOf(): productionDocumentOperations.ProductionDocumentOperationsHost {
    const store = this;
    return {
      assertAvailable: this.#assertAvailable.bind(this),
      get authority() { return store.#authority; },
      get boundedAuthority() { return store.#boundedAuthority; },
      boundedCall: this.#boundedCall.bind(this),
      contentObjectPath: this.#contentObjectPath.bind(this),
      documentCall: this.#documentCall.bind(this),
      get documentWorkflow() { return store.#documentWorkflow; },
      get productionDocuments() { return store.#productionDocuments; },
      transaction: this.#transaction.bind(this),
    };
  }

  #documentCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof ProductionDocumentError || error instanceof ProductionDocumentWorkflowError || error instanceof ProductionDocumentOriginError) {
        throw new StoreError(error.code, error.message);
      }
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  /** 图书交付包 of one Book (Issue #416, S67a): the condition table, the Manifest Preview and the frozen versions. */
  inspectBookDeliveryPackage(bookId: string, documents?: ReadonlyArray<BookDeliveryPackageDocumentChoice>): BookDeliveryPackageProjection {
    return this.#packageCall(() => this.#bookDeliveryPackages.inspect(bookId, documents));
  }

  /**
   * `准备图书交付包` (BUNDLE-003, BUNDLE-004): in one transaction, the content the editor saw — named by its digest — is
   * frozen with its purpose as the package's next version, or the newest version is that already. It chooses no
   * destination, writes no file and changes no other record.
   */
  prepareBookDeliveryPackage(input: PrepareBookDeliveryPackageInput): BookDeliveryPackageResultProjection {
    const outcome = this.#packageCall(() => this.#transaction(this.#authority, () => this.#bookDeliveryPackages.prepare(input)));
    return { bookId: input.bookId, outcome: outcome.outcome, version: outcome.version, package: this.inspectBookDeliveryPackage(input.bookId, input.documents) };
  }

  /** `导出…` of one package version (Issue #416, S67b): the files it writes, each reviewed as S64 reviews a file. */
  async reviewBookDeliveryPackageExport(input: ReviewBookDeliveryPackageExportInput, available: boolean): Promise<BookDeliveryPackageExportReviewProjection> {
    return this.#packageExportCall(() => this.#packageExports.review(input, available));
  }

  /** The folder the system dialog returned: one preparation per file there, and the export that links them. */
  async prepareBookDeliveryPackageExport(input: PrepareBookDeliveryPackageExportInput, available: boolean): Promise<BookDeliveryPackageExportProjection> {
    return this.#packageExportCall(() => this.#packageExports.prepare(input, available));
  }

  async prepareBookDeliveryPackageArchiveExport(input: PrepareBookDeliveryPackageArchiveInput, available: boolean): Promise<BookDeliveryPackageExportProjection> {
    return this.#packageExportCall(() => this.#packageExports.prepareArchive(input, available));
  }

  /** `按上述方式导出`: each file approved and written in turn with its receipt, and the package as it stands. */
  async approveBookDeliveryPackageExport(input: ApproveBookDeliveryPackageExportInput, available: boolean, beforeWrite?: (phase?: 'check' | 'commit') => void, route?: 'folder' | 'archive'): Promise<BookDeliveryPackageExportResultProjection> {
    const exported = await this.#packageExportCall(() => this.#packageExports.approve(input, available, beforeWrite, route));
    return { bookId: input.bookId, export: exported, package: this.inspectBookDeliveryPackage(input.bookId) };
  }

  async #packageExportCall<T>(operation: () => Promise<T>): Promise<T> {
    return this.#exportCall(async () => {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof BookDeliveryPackageExportError || error instanceof BookDeliveryPackageError) throw new StoreError(error.code, error.message);
        throw error;
      }
    });
  }

  #packageCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof BookDeliveryPackageError || error instanceof PublicationVersionError || error instanceof ProductionDocumentError ||
        error instanceof ReviewRunError || error instanceof BookDeliveryPackageExportError || error instanceof ExportLedgerError) {
        throw new StoreError(error.code, error.message);
      }
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  // ---- ④ 导出 · DOCX (Issue #413, plan slice S64) ------------------------------------------------------

  /**
   * The Export Fidelity Review of one exact version (V2-UX-EXP-007). `available` is the launch's verified
   * External Export Policy: without it nothing about an export proceeds. A current revision with unsaved edits
   * is saved as a revision for the export first.
   */
  async reviewManuscriptExport(input: ReviewManuscriptExportInput, available: boolean): Promise<ManuscriptExportReviewProjection> {
    return reviewOperations.reviewManuscriptExport(this.#reviewOperationsHost, input, available);
  }

  /** Freeze one Local Export Preparation for the destination the system dialog returned (V2-UX-EXP-010). */
  async prepareManuscriptExport(input: PrepareManuscriptExportInput, available: boolean): Promise<ManuscriptExportPreparationProjection> {
    return this.#exportCall(() => this.#manuscriptExport.prepare(input, available));
  }

  /** `按上述方式导出`: the approval, the atomic write and its receipt or classified outcome (V2-UX-EXP-012, EXP-017). */
  async approveManuscriptExport(input: ApproveManuscriptExportInput, available: boolean): Promise<ManuscriptExportReceiptProjection> {
    return this.#exportCall(() => this.#manuscriptExport.approve(input, available));
  }

  /** The main process's step before it approves a PDF: the page the preparation bound, staged to print (Issue #500, S64b). */
  async stageManuscriptExport(input: StageManuscriptExportInput, available: boolean): Promise<ManuscriptExportStageProjection> {
    return this.#exportCall(() => this.#manuscriptExport.stage(input, available));
  }

  /** What one approved export came to, read by the main process before it reveals the file. */
  inspectManuscriptExportReceipt(input: InspectManuscriptExportReceiptInput): ManuscriptExportReceiptProjection { return inspectExportReceipt({ assertAvailable: this.#assertAvailable.bind(this), manuscriptExport: this.#manuscriptExport, AnalysisError }, input); }

  // ---- 稿件冲突 of a single 修改建议 (Issue #57, plan slice S22) ----------------------------------------

  inspectProposalConflict(input: ProposalConflictBindingInput): ProposalConflictProjection { return editorialMarkOperations.inspectProposalConflict(this.#editorialMarkOperationsHost, input); }

  saveProposalConflictDraft(input: SaveProposalConflictDraftInput): ProposalConflictDraftSaveProjection { return editorialMarkOperations.saveProposalConflictDraft(this.#editorialMarkOperationsHost, input); }

  saveRegeneratedProposalConflictDraft(input: SaveProposalConflictDraftInput, lineage: ProposalConflictRegenerationLineage): ProposalConflictDraftSaveProjection {
    return editorialMarkOperations.saveRegeneratedProposalConflictDraft(this.#editorialMarkOperationsHost, input, lineage);
  }

  resolveProposalConflict(input: ResolveProposalConflictInput): ProposalConflictResolutionProjection { return editorialMarkOperations.resolveProposalConflict(this.#editorialMarkOperationsHost, input); }

  // ---- 待我处理 · Global Attention (Issue #424, plan slice S78) -----------------------------------------

  /**
   * 待我处理 across every Book (editor-surfaces §8.1, V2-UX-ATTN-001 to 009): the uncertain imports, the
   * pending abandonment cleanups and the Recovery Attention States read here, the unresolved Manuscript Conflicts
   * from their owner, each Book's latest baseline
   * analysis Task and its recent outcomes from the baseline ledger, and each Book's latest Review Run and
   * the recent completed ones from the Review Run ledger, composed into the four groups by
   * `global-attention.ts`. `progress` and `busy` are the one execution owner's, handed in by the service
   * entry exactly as the analysis inspections take them. J-03's recorded Run, Effect Receipts, designations,
   * imports that completed, the recovered-state review, ordinary unfinished drafts, credential state and a
   * Book's own findings are not read at all.
   *
   * A read (V2-UX-ATTN-008): nothing is written, claimed or terminalized, and every list is bounded so the
   * answer fits one frame.
   */
  /**
   * 索引完成 (Issue #428, S80a; ATTN-009): the Material Indexes built within the recent window, each named with its item and where
   * the item belongs now.
   */
  #materialIndexAttention(since: string, limit: number): MaterialIndexAttentionReading[] {
    return this.#materialIndex.completions(since, limit).map((completion) => {
      const place = this.#libraryMaterials.place(completion.materialId);
      return {
        materialId: completion.materialId, indexId: completion.indexId, title: place.title, kind: place.kind, scope: place.scope,
        book: place.book, outcome: completion.state, recordedAt: completion.recordedAt, indexSha256: completion.sha256,
      };
    });
  }

  // ---- 结果待确认 a completed Run left (Issue #757; ATTN-002, NOTIF-004, CTRL-007, CONT-011) -------------------------------

  #unconfirmedReadVersion: string | null = null;
  #unconfirmedPairs: SqlRow[] | null = null;
  readonly #unconfirmedLists = new Map<string, {
    resolved: string;
    listed: { ranges: UnconfirmedOutcomeRecord[]; steps: UnconfirmedOutcomeRecord[] };
  }>();

  /**
   * The read version of exactly the relations the derivation reads (Issue #773): one Result Set Revision or one
   * Task Outcome appended — by this handle or another, gap or no gap — moves it; an editor's edit, a Run's
   * progress row or any other write leaves it standing, so the 5 s 待我处理 poll reads on. A revision without a
   * gap still counts: a later revision that reads a range to a result closes it, which only a re-walk sees. The
   * editor's resolutions are read with the Book at every ask instead, so a resolution appended or damaged beyond
   * reading changes the reading itself. A database replace, merge or reopen builds a new store, whose readings
   * are derived from the data it opens.
   */
  #refreshUnconfirmedIndex(): void {
    const row = this.#authority.prepare(
      `SELECT (SELECT count(*) FROM analysis_result_set_revisions) AS revisions,
              (SELECT count(*) FROM analysis_task_outcomes) AS outcomes`,
    ).get() as SqlRow;
    const version = `${row.revisions}:${row.outcomes}`;
    if (this.#unconfirmedReadVersion === version) return;
    this.#unconfirmedReadVersion = version;
    this.#unconfirmedPairs = null;
    this.#unconfirmedLists.clear();
  }

  /**
   * Whether a derivation may be kept: never while this connection is inside a transaction (Issue #773). A
   * reading derived there may describe state a rollback removes; callers answer from it and store nothing, so
   * no rollback can leave the caches describing data that never was.
   */
  #unconfirmedMayKeep(): boolean {
    return !this.#authority.isTransaction;
  }

  /** The `(book, kind)` pairs the pairs query returns: revisions holding an `outcome-unknown` gap, and outcomes naming an unresent one. */
  #unconfirmedPairRows(): SqlRow[] {
    return this.#authority.prepare(
      `SELECT DISTINCT book_id, kind FROM (
         SELECT s.book_id, s.kind FROM analysis_result_set_revisions r JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id
         WHERE instr(r.canonical_json, '"outcome-unknown"') > 0
         UNION
         SELECT t.book_id, t.kind FROM analysis_task_outcomes o JOIN analysis_task_intents t ON t.task_intent_id = o.task_intent_id
         WHERE (o.classification IN ('completed', 'completed-with-gaps') AND instr(o.canonical_json, ?) > 0)
            OR (o.classification = 'failed' AND o.result_set_revision_id IS NULL AND instr(o.canonical_json, '"outcome-unknown"') > 0)
       ) ORDER BY book_id, kind`,
    ).all(OUTCOME_UNKNOWN_NOT_RESENT) as SqlRow[];
  }

  /**
   * The ranges and steps whose sent requests' results cannot be known that Runs of one Task kind left on a Book and that reached
   * their Task Outcome, whatever it was — completed (a kind that keeps no progress reads on past such a range, and any kind past
   * such a step), interrupted, failed or cancelled — which no later Run of the kind has read and the editor has not kept as gaps.
   * 取消任务 settles nothing here (CTRL-007: an ambiguous outcome stays distinct from a successful cancellation): only
   * 保留为缺口, the Manual Outcome Resolution, does. A Run stopped 结果待确认 that has no outcome yet is its own item. A Review
   * Run's categories are each their own kind, read together. A read.
   */
  #unconfirmedListed(bookId: string, surface: TaskPlanKind): { ranges: UnconfirmedOutcomeRecord[]; steps: UnconfirmedOutcomeRecord[] } {
    this.#refreshUnconfirmedIndex();
    const cacheKey = `${bookId}\n${surface}`;
    // The editor's resolutions are read whether or not the walk is re-run: a settled key and a damaged row both
    // move this digest, and the reading that answers is the reading as it is now.
    const resolved = this.#analysisCall(() => this.#outcomeResolutions.resolvedKeys(bookId));
    const resolvedDigest = sha256(canonicalJson([...resolved].sort()));
    const cached = this.#unconfirmedLists.get(cacheKey);
    if (cached !== undefined && cached.resolved === resolvedDigest) return cached.listed;
    const kinds = (this.#authority.prepare(
      `SELECT kind FROM analysis_result_sets WHERE book_id = ?
       UNION SELECT t.kind FROM analysis_task_intents t JOIN analysis_task_outcomes o ON o.task_intent_id = t.task_intent_id
       WHERE t.book_id = ? AND o.classification = 'failed' AND o.result_set_revision_id IS NULL ORDER BY kind`,
    ).all(bookId, bookId) as SqlRow[])
      .map((row) => asString(row.kind)).filter((kind) => unconfirmedSurfaceOf(kind) === surface);
    const ranges: UnconfirmedOutcomeRecord[] = [];
    const steps: UnconfirmedOutcomeRecord[] = [];
    for (const kind of kinds) {
      const found = this.#analysisCall(() => this.#baselineAnalysis.unconfirmedOutcomesOf(bookId, kind));
      ranges.push(...found.ranges.filter((range) => range.classification !== null && !resolved.has(range.key)));
      steps.push(...found.steps.filter((step) => !resolved.has(step.key)));
    }
    const listed = { ranges, steps };
    if (this.#unconfirmedMayKeep()) this.#unconfirmedLists.set(cacheKey, { resolved: resolvedDigest, listed });
    return listed;
  }

  /** The category a review kind names, in the house's built-in configuration's words; `null` for any other kind. */
  #unconfirmedCategory(kind: string): string | null {
    if (kind === 'editorial-review/run-synthesis') return RUN_SYNTHESIS_ENTRY.label;
    if (kind === FACTUAL_REVIEW_KIND) {
      return BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => entry.executor === 'factual-review-kind')?.label ?? kind;
    }
    if (!isReviewCategoryKindId(kind)) return null;
    const categoryId = kind.slice(kind.indexOf('/') + 1);
    return reviewCategoryDisplayLabel(categoryId, reviewCategoryEntry(categoryId)?.label);
  }

  /** The drawer's list of 结果待确认 a completed Run of this kind left on the Book (Issue #757); `null` when there is none. */
  #unconfirmedProjection(bookId: string, surface: TaskPlanKind): TaskPlanUnconfirmedProjection | null {
    const listed = this.#unconfirmedListed(bookId, surface);
    if (listed.ranges.length === 0 && listed.steps.length === 0) return null;
    // The text a range's ordinal counts in: the Book's manuscript as it is saved now, or an earlier one (Issue #757 review).
    const latest = this.#authority.prepare(
      `SELECT mr.revision_id FROM manuscript_revisions mr JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id AND m.role = 'primary'
       WHERE m.book_id = ? ORDER BY mr.ordinal DESC LIMIT 1`,
    ).get(bookId) as SqlRow | undefined;
    const current = latest === undefined ? null : asString(latest.revision_id);
    return {
      ranges: listed.ranges.map((range) => ({
        unitOrdinal: range.unitOrdinal!, category: this.#unconfirmedCategory(range.kind), recordedAt: range.recordedAt,
        earlierText: range.heldAtRevisionId !== null && range.heldAtRevisionId !== current,
        ...(range.rereadFailed ? { rereadFailed: true } : {}),
      })),
      steps: listed.steps.map((step) => ({ stage: step.stage!, category: this.#unconfirmedCategory(step.kind), recordedAt: step.recordedAt })),
      digest: unconfirmedDigest(listed),
    };
  }

  /**
   * 保留为缺口 (Issue #757; Manual Outcome Resolution): the editor determines that the requests the drawer listed for this kind
   * — exactly those, by digest — stay 结果待确认 and their ranges and steps stay gaps. It records that determination with its
   * manual evidence class and nothing else: no revision, no Task Outcome and no gap changes, nothing is sent, and a later Task
   * that sends such a range again still says so in its plan. A list that changed since it was read is refused.
   */
  resolveUnconfirmedOutcomes(bookId: string, surface: TaskPlanKind, digest: string, now: Date = new Date()): { resolved: number } {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId) && TASK_PLAN_KINDS.includes(surface) && surface !== 'fixed-task' && DIGEST_PATTERN.test(digest),
      'UNCONFIRMED_INVALID', '人工结果确认的参数无效。');
    requireStore(this.#authority.prepare('SELECT 1 FROM books WHERE book_id = ?').get(bookId) !== undefined, 'BOOK_NOT_FOUND', '图书不存在。');
    return this.#transaction(this.#authority, () => {
      const listed = this.#unconfirmedListed(bookId, surface);
      const keys = [...listed.ranges, ...listed.steps].map((entry) => entry.key);
      requireStore(keys.length > 0 && unconfirmedDigest(listed) === digest, 'UNCONFIRMED_CHANGED', UNCONFIRMED_CHANGED);
      this.#analysisCall(() => this.#outcomeResolutions.record(bookId, surface, keys, now));
      return { resolved: keys.length };
    });
  }

  /**
   * 待我处理's readings of 结果待确认 completed Runs left (Issue #757; ATTN-002, NOTIF-004): one per Book and Task kind, read only
   * where a revision holds an `outcome-unknown` gap or a completed Run's report names a step so — every list bounded.
   */
  #unconfirmedAttention(limit: number, bookId: string | null = null): UnconfirmedAttentionReading[] {
    this.#refreshUnconfirmedIndex();
    const pairs = this.#unconfirmedPairs ?? this.#unconfirmedPairRows();
    if (this.#unconfirmedPairs === null && this.#unconfirmedMayKeep()) this.#unconfirmedPairs = pairs;
    const surfaces = new Map<string, { bookId: string; surface: TaskPlanKind }>();
    for (const pair of pairs) {
      if (bookId !== null && asString(pair.book_id) !== bookId) continue;
      const surface = unconfirmedSurfaceOf(asString(pair.kind));
      if (surface !== null) surfaces.set(`${asString(pair.book_id)}\n${surface}`, { bookId: asString(pair.book_id), surface });
    }
    const readings: UnconfirmedAttentionReading[] = [];
    for (const { bookId: book, surface } of surfaces.values()) {
      const listed = this.#unconfirmedListed(book, surface);
      const entries = [...listed.ranges, ...listed.steps];
      if (entries.length === 0) continue;
      const title = this.#authority.prepare('SELECT title FROM books WHERE book_id = ?').get(book) as SqlRow | undefined;
      if (title === undefined) continue;
      const latestReview = surface === 'review-run'
        ? this.#authority.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(book) as SqlRow | undefined
        : undefined;
      // A review's plan is always named; a Book whose Review Runs are gone has nowhere to show the list.
      if (surface === 'review-run' && latestReview === undefined) continue;
      readings.push({
        bookId: book,
        bookTitle: asString(title.title),
        surface,
        ref: latestReview === undefined ? null : asString(latestReview.review_run_id),
        ranges: listed.ranges.length,
        steps: [...new Set(listed.steps.map((step) => step.stage!))],
        at: entries.map((entry) => entry.recordedAt).sort().at(-1)!,
        runRecordIds: [...new Set(entries.map((entry) => entry.runRecordId))],
      });
      // The bound applies to unresolved surfaces, after every resolved pair has been removed.
      if (readings.length >= limit) break;
    }
    return readings;
  }

  #customAnalysisAttention(progress: ProgressReader, since: string, limit: number, scope: { bookId: string; cancelled: boolean } | null) {
    const result: ReturnType<BaselineAnalysisStore['attentionReadings']> = { tasks: [], outcomes: [] };
    const rows = this.#authority.prepare(`SELECT t.task_intent_id, t.book_id FROM analysis_task_intents t
      WHERE t.kind GLOB 'custom-analysis/*' AND (? IS NULL OR t.book_id = ?)
      AND t.rowid = (SELECT max(latest.rowid) FROM analysis_task_intents latest WHERE latest.kind = t.kind AND latest.book_id = t.book_id)`)
      .all(scope?.bookId ?? null, scope?.bookId ?? null) as SqlRow[];
    for (const row of rows) {
      const version = customAnalysisOperations.customAnalysisVersionOfTask(this.#customAnalysisHost, asString(row.task_intent_id));
      if (version === null) continue;
      const ledger = this.customAnalysisLedger(customAnalysisOperations.customAnalysisDefinition(this.#customAnalysisHost, version));
      const reading = ledger.attentionReadings(progress, since, limit, { bookId: asString(row.book_id), cancelled: scope?.cancelled ?? false });
      result.tasks.push(...reading.tasks.map(task => ({ ...task, customTitle: version.document.title })));
      result.outcomes.push(...reading.outcomes.map(outcome => ({ ...outcome, customTitle: version.document.title })));
    }
    return result;
  }

  inspectGlobalAttention(progress: ProgressReader, busy: boolean, waitingFor: WaitingFor = 'admitting', now: Date = new Date()): GlobalAttentionProjection {
    return this.#reviewCall(() => {
      const since = recentWindowStart(now);
      const limit = GLOBAL_ATTENTION_READ_LIMIT;
      try {
        const baseline = this.#baselineAnalysis.attentionReadings(progress, since, limit);
        const custom = this.#customAnalysisAttention(progress, since, limit, null);
        const review = this.#reviewRuns.attentionReadings(progress, since, limit);
        return composeGlobalAttention({
          bookTasks: (this.#authority.prepare('SELECT book_id FROM books').all() as SqlRow[]).flatMap((book) =>
            this.inspectBookTasks(asString(book.book_id), progress, waitingFor, () => null, limit).groups.flatMap((group) => group.items)
              .map((entry) => entry.item).filter((item) => item.target.kind === 'dialogue' || item.group === 'recent' && item.target.kind === 'task-plan')),
          globalDialogues: this.#globalAgentHistory(() => null),
          applyOutcomes: readApplyOutcomeAttention(this.#authority, limit),
          imports: readImportAttention(this.#authority, limit),
          recoveries: readRecoveryAttention(this.#authority, limit),
          conflicts: readConflictAttention(this.#authority, limit),
          analysisTasks: [...baseline.tasks, ...custom.tasks],
          analysisOutcomes: [...baseline.outcomes, ...custom.outcomes],
          waitingTasks: this.#waitingTaskAttention(null, limit, progress),
          reviewRuns: review.latest,
          reviewCompletions: review.completed,
          maintenance: this.#maintenanceCases.attentionReadings(limit),
          libraryMaterials: this.#libraryMaterials.attentionReadings(limit),
          learningMaterials: learningSupervision.learningAttention(this.#learningSupervisionHost, limit),
          materialIndexes: this.#materialIndexAttention(since, limit),
          unconfirmed: this.#unconfirmedAttention(limit),
          // Every Book's unfinished Task Intent Drafts (Issue #423, slice 7a): in 待我处理 only as their own card.
          drafts: this.#draftCall(() => this.#draftAttention(null)),
          busy,
          waitingFor,
        }, now);
      } catch (error) {
        if (error instanceof GlobalAttentionError || error instanceof MaintenanceCaseError || error instanceof LibraryMaterialError ||
            error instanceof LearningEligibilityError || error instanceof DecisionFeedbackError || error instanceof AnalysisFeedbackError ||
            error instanceof MaterialIndexError) {
          throw new StoreError(error.code, error.message);
        }
        throw error;
      }
    });
  }

  inspectTaskOverview(progress: ProgressReader, capacity: number, queuePosition: (id: string) => number | null, queueFrozen: boolean,
    dialogueLive: (id: string) => LiveAnswer | null = () => null, waitingFor: WaitingFor = 'slot'): import('../shared/protocol.js').TaskOverviewProjection {
    const books = (this.#authority.prepare('SELECT book_id, title FROM books ORDER BY title').all() as SqlRow[])
      .map((row) => ({ bookId: asString(row.book_id), title: asString(row.title) }));
    const entries = books.flatMap((book) => this.inspectBookTasks(book.bookId, progress, waitingFor, dialogueLive, GLOBAL_ATTENTION_READ_LIMIT).groups.flatMap((group) => group.items));
    const attention: GlobalAttentionProjection = { groups: [], actionableCount: 0, running: false, processing: { state: 'local' } };
    const overview = composeTaskOverview(attention, capacity, queuePosition, entries, books, queueFrozen, (item) => {
      if (!['completed', 'cancelled', 'stopped'].includes(item.state)) return null;
      if (item.runRecordId !== null) return this.#usage.taskSummary({ runRecordId: item.runRecordId });
      if (item.target.kind === 'review' || item.target.kind === 'review-plan') {
        return this.#usage.taskSummary({ taskIntentIds: this.#reviewRuns.controlTasks(item.target.bookId, item.target.reviewRunId).map((task) => task.taskIntentId) });
      }
      if (item.target.kind === 'dialogue') {
        const dialogue = this.inspectDialogue(item.target.bookId, item.target.dialogueId, 0, () => null);
        return { calls: dialogue.attempts.length, elapsed: dialogue.attempts.reduce((sum, attempt) => sum + (attempt.settledAt === null ? 0 : Math.max(0, Date.parse(attempt.settledAt) - Date.parse(attempt.startedAt))), 0) };
      }
      return null;
    });
    const quickStarts = this.inspectDefaultExecutionRules().rules.filter((rule) => rule.state === 'active').map((rule) => ({ bookId: rule.bookId, procedureId: `rule:${rule.pattern}`, label: rule.name }));
    return estimateTaskStarts({ ...overview, quickStarts, groups: overview.groups.map((group) => ({ ...group, items: group.items.map((item) => {
      if (item.runRecordId === null || !['running', 'queued'].includes(item.state)) return item;
      const facts = this.executionLedgerForRun(item.runRecordId).loadExecutionPlan(item.runRecordId);
      const current = progress(item.runRecordId);
      const unit = facts.manifest.units.find((unit) => unit.ordinal === current?.currentUnitOrdinal);
      return { ...item, progress: { done: current?.unitsSettled ?? 0, total: facts.manifest.units.length,
        currentUnitLabel: unit?.headingText ?? null, elapsedMs: current === null ? null : Math.max(0, Date.now() - Date.parse(item.at)),
        modelWaiting: current?.attemptState === 'awaiting-response' } };
    }) })) });
  }

  /**
   * The Book's 任务 panel (Issue #423, plan slice S77a; editor-surfaces §1 任务面, V2-UX-TASK-044): 待我处理's readings of this
   * Book's Tasks alone — its latest baseline Task and Review Run, prepared ones included, and every finished one, the
   * cancelled included — composed into 等你处理, 进行中 and 最近完成 by `global-attention.ts`. A read: nothing is written,
   * claimed or terminalized.
   */
  inspectBookTasks(bookId: string, progress: ProgressReader, waitingFor: WaitingFor = 'admitting', dialogueLive: (attemptId: string) => LiveAnswer | null = () => null, recentLimit?: number): BookTasksProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    one(this.#authority.prepare('SELECT 1 FROM books WHERE book_id = ?').all(bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。');
    return this.#reviewCall(() => {
      const limit = GLOBAL_ATTENTION_READ_LIMIT;
      try {
        const baseline = this.#baselineAnalysis.attentionReadings(progress, '', limit, { bookId, cancelled: true });
        const custom = this.#customAnalysisAttention(progress, '', limit, { bookId, cancelled: true });
        const review = this.#reviewRuns.attentionReadings(progress, '', limit, { bookId, prepared: true });
        const otherOutcomes = (['initial-evaluation', 'readers-report', 'evaluation-rewrite', 'writing'] as const).flatMap((kind) => {
          const ledger = kind === 'initial-evaluation' ? this.#initialEvaluation : this.#anyLedgerOfKind(kind);
          return ledger === null ? [] : ledger.attentionReadings(progress, '', limit, { bookId, cancelled: true }).outcomes.map((outcome) => ({ kind, outcome }));
        });
        return composeBookTasks({
          bookId, otherOutcomes, ...(recentLimit === undefined ? {} : { recentLimit }),
          analysisTasks: [...baseline.tasks, ...custom.tasks],
          analysisOutcomes: [...baseline.outcomes, ...custom.outcomes],
          waitingTasks: this.#waitingTaskAttention(bookId, limit, progress),
          reviewRuns: review.latest,
          reviewCompletions: review.completed,
          waitingFor,
          // Its dialogue Tasks (Issue #52, S17a; TASK-044), each read through the Harness Session Ledger.
          dialogues: this.#dialogueCall(() => this.#dialogueTaskReadings(bookId, dialogueLive)),
          // Its unfinished Task Intent Drafts (Issue #423, slice 7a), in 等你处理.
          drafts: this.#draftCall(() => this.#draftAttention(bookId)),
        });
      } catch (error) {
        if (error instanceof GlobalAttentionError) throw new StoreError(error.code, error.message);
        throw error;
      }
    });
  }

  // ---- Task Intent Drafts (Issue #423, wave 10 slice 7a; #52 S17b; V2-UX-TASK-001 to 009, 042, 043, DIALOG-013, 016) ------

  /**
   * The Book's Task Intent Drafts — those not yet promoted, then the latest promoted ones — or, `draftId` set, that one draft with
   * the Task 准备计划 would make of it (TASK-004 to 007). A read: nothing is written, and no model is asked.
   */
  inspectTaskIntentDrafts(input: InspectTaskIntentDraftsInput): TaskIntentDraftsProjection {
    return this.#draftCall(() => {
      requireDraft(typeof input === 'object' && input !== null && (input.draftId === null || UUID_PATTERN.test(input.draftId)),
        'TASK_INTENT_DRAFT_INVALID', '任务意图草稿请求无效。');
      const bookTitle = this.#evaluationBookTitle(input.bookId);
      if (input.draftId !== null) {
        const draft = this.#drafts.draft(input.draftId);
        requireDraft(draft !== null && draft.bookId === input.bookId, 'TASK_INTENT_DRAFT_NOT_FOUND', '这份任务意图草稿不在这本书里。');
        return { bookId: input.bookId, bookTitle, manuscript: this.#draftManuscript(input.bookId), drafts: [this.#draftProjection(draft, bookTitle, true)] };
      }
      const drafts = [...this.#drafts.unpromoted(input.bookId, GLOBAL_ATTENTION_READ_LIMIT), ...this.#drafts.promoted(input.bookId, 10)];
      return { bookId: input.bookId, bookTitle, manuscript: this.#draftManuscript(input.bookId), drafts: drafts.map((draft) => this.#draftProjection(draft, bookTitle, false)) };
    });
  }

  /**
   * 准备任务 in the Context-bound Task Composer — a new draft — or 保存修改 on one (TASK-004, 005): the goal, the target with each
   * range pinned exactly where the editor selected it, and the intended outcome, as a new version. Only the Book's own manuscript
   * is read to verify the ranges; nothing is sent, and no Task Intent, plan, Run Record or authorization is made.
   */
  saveTaskIntentDraft(input: SaveTaskIntentDraftInput, now: Date = new Date()): TaskIntentDraftProjection {
    return this.#draftCall(() => {
      requireDraft(typeof input === 'object' && input !== null && typeof input.target === 'object' && input.target !== null &&
        (input.draftId === null ? input.expectedOrdinal === null : UUID_PATTERN.test(input.draftId) && Number.isSafeInteger(input.expectedOrdinal) && (input.expectedOrdinal as number) >= 1) &&
        (input.origin === 'composer-selection' || input.origin === 'composer-book' || input.origin === 'composer-deliverable'),
      'TASK_INTENT_DRAFT_INVALID', '任务意图草稿请求无效。');
      const bookTitle = this.#evaluationBookTitle(input.bookId);
      const goal = draftGoal(input.goal);
      const outcomeClass = draftOutcomeClass(input.outcomeClass);
      const previous = input.draftId === null ? null : this.#drafts.draft(input.draftId);
      requireDraft(input.draftId === null || (previous !== null && previous.bookId === input.bookId), 'TASK_INTENT_DRAFT_NOT_FOUND', '这份任务意图草稿不在这本书里。');
      let ranges: StoredDraftRange[] = [];
      if (input.target.kind === 'ranges') {
        const requested = input.target.ranges;
        requireDraft(Array.isArray(requested) && requested.length >= 1 && requested.length <= MAX_TASK_INTENT_DRAFT_RANGES,
          'TASK_INTENT_DRAFT_RANGE_INVALID', `一份草稿带 1–${MAX_TASK_INTENT_DRAFT_RANGES} 段所选文字。`);
        ranges = requested.map((range) => {
          requireDraft(typeof range === 'object' && range !== null && (range.kind === 'kept' || range.kind === 'new'), 'TASK_INTENT_DRAFT_RANGE_INVALID', '所选文字无效。');
          if (range.kind === 'new') return this.#pinDraftRange(input.bookId, range.span);
          // A range the draft already pinned keeps its original pin and provenance; it is never rebound in place (TASK-041).
          const kept = previous?.latest.ranges.find((candidate) => candidate.rangeId === range.rangeId);
          requireDraft(kept !== undefined, 'TASK_INTENT_DRAFT_RANGE_INVALID', '这段所选文字不在这份草稿里。');
          return kept;
        });
        requireDraft(new Set(ranges.map((range) => range.rangeId)).size === ranges.length, 'TASK_INTENT_DRAFT_RANGE_INVALID', '同一段所选文字只加入一次。');
      } else {
        requireDraft(input.target.kind === 'book' || input.target.kind === 'deliverable', 'TASK_INTENT_DRAFT_INVALID', '任务意图草稿请求无效。');
      }
      const procedurePin = input.procedurePin ?? null;
      requireDraft(procedurePin === null || isProcedurePin(procedurePin), 'TASK_INTENT_DRAFT_INVALID', '所选工序无效。');
      const deliverable = input.target.kind === 'deliverable' ? pinTaskDeliverable(this.#authority, input.bookId, input.target) : undefined;
      const content = { goal, target: input.target.kind, outcomeClass, ranges, ...(deliverable === undefined ? {} : { deliverable }), answer: previous?.latest.answer ?? null,
        procedurePin: procedurePin === null ? null : { procedureId: procedurePin.procedureId, versionId: procedurePin.versionId } };
      const stored = this.#transaction(this.#authority, () => input.draftId === null
        ? this.#drafts.create(input.bookId, input.origin, content, now)
        : this.#drafts.saveVersion(input.draftId, input.bookId, input.expectedOrdinal as number, content, now));
      return this.#draftProjection(stored, bookTitle, true);
    });
  }

  /**
   * 准备计划 on a draft (decision 1): its exact latest version checked — every range still holding its words (TASK-043) — and
   * resolved to the one existing preparation it names, which the caller starts as the same cooperative job 先看计划 starts. That
   * preparation records the promotion in the very write that makes the Task Intent (or, for a 审阅, the Review Run), so a draft
   * is promoted once; the Task still needs 开始任务 (AUTH-002). Nothing is sent.
   */
  taskIntentDraftPreparation(input: PromoteTaskIntentDraftInput, now: Date = new Date()): DraftPreparation {
    return this.#draftCall(() => {
      requireDraft(typeof input === 'object' && input !== null && typeof input.draftId === 'string' && UUID_PATTERN.test(input.draftId) &&
        typeof input.versionId === 'string' && UUID_PATTERN.test(input.versionId) && typeof input.choice === 'object' && input.choice !== null,
      'TASK_INTENT_DRAFT_INVALID', '任务意图草稿请求无效。');
      this.#evaluationBookTitle(input.bookId);
      const draft = this.#drafts.draft(input.draftId);
      requireDraft(draft !== null && draft.bookId === input.bookId, 'TASK_INTENT_DRAFT_NOT_FOUND', '这份任务意图草稿不在这本书里。');
      requireDraft(draft.promotion === null, 'TASK_INTENT_DRAFT_PROMOTED', '这份草稿已经准备成任务；请在任务计划里继续。');
      requireDraft(draft.latest.versionId === input.versionId, 'TASK_INTENT_DRAFT_STALE', '这份草稿在你准备计划之前已有新的版本；请看最新的版本。');
      requireDraft(draft.latest.deliverable === undefined || !taskDeliverableStale(this.#authority, input.bookId, draft.latest.deliverable), 'TASK_INTENT_DRAFT_DELIVERABLE_STALE', '交付物已有新版本；请重新选择任务目标。');
      const moved = this.#draftRanges(draft.latest.ranges).find((range) => range.state === 'reselect');
      requireDraft(moved === undefined, 'TASK_INTENT_DRAFT_RANGE_RESELECT', '任务范围需要重新选择：有一段所选文字已经改动或不在当前稿件中；请重新选择或移除它。');
      const resolution = resolveDraft(draft.latest, this.#draftFacts(draft.bookId));
      const offered = resolutionOffers(resolution, input.choice);
      requireDraft(offered !== null, 'TASK_INTENT_DRAFT_UNSUPPORTED',
        resolution.state === 'unsupported' ? resolution.reason : '这份草稿不能这样准备计划；请从草稿给出的选项中选择。');
      const promoted = (task: { readonly taskIntentId: string | null; readonly reviewRunId: string | null }): void => {
        try {
          requireDraft(this.#draftRanges(draft.latest.ranges).every((range) => range.state !== 'reselect'),
            'TASK_INTENT_DRAFT_RANGE_RESELECT', '任务范围需要重新选择：所选文字在准备期间已改动。');
          requireDraft(draft.latest.deliverable === undefined || !taskDeliverableStale(this.#authority, input.bookId, draft.latest.deliverable), 'TASK_INTENT_DRAFT_DELIVERABLE_STALE', '交付物已有新版本；请重新选择任务目标。');
          this.#drafts.promote(draft.draftId, draft.latest.versionId, { taskKind: offered.taskKind, ...task }, now);
        } catch (error) {
          if (error instanceof TaskIntentDraftError) throw new StoreError(error.code, error.message);
          throw error;
        }
      };
      const intentDraft: DraftPromotion = { versionId: draft.latest.versionId, goal: draft.latest.goal, promoted,
        ...(draft.latest.deliverable === undefined ? {} : { deliverable: draft.latest.deliverable }),
        ...(draft.latest.target === 'ranges' ? { paragraphs: draftParagraphs(draft.latest.ranges) } : {}) };
      const block = draftBlockBounds(draft.latest.ranges);
      const choice = offered.choice;
      switch (choice.kind) {
        case 'baseline':
          return {
            kind: 'baseline',
            goal: BASELINE_ANALYSIS_MODE_GOALS[choice.mode],
            update: choice.mode === 'first-baseline' ? null
              : choice.mode === 'reanalyze-range' && block !== null
                ? { mode: choice.mode, selectedRange: null, selectedBlocks: block }
                : { mode: choice.mode, selectedRange: null },
            intentDraft,
          };
        case 'review':
          return {
            kind: 'review',
            categoryId: choice.categoryId,
            scope: block === null
              ? { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }
              : { kind: 'selection', fromChapterBlockId: block.fromBlockId, toChapterBlockId: block.toBlockId },
            intentDraft,
          };
        case 'writing': {
          const writing = input.writing;
          requireDraft(typeof writing === 'object' && writing !== null && typeof writing.audience === 'string' && typeof writing.channel === 'string',
            'TASK_INTENT_DRAFT_WRITING_INVALID', '请写下这份文档的受众和渠道。');
          return {
            kind: 'writing',
            request: { typeId: choice.typeId, audience: writing.audience, channel: writing.channel, requirements: draft.latest.goal, materialIds: [] },
            intentDraft,
          };
        }
      }
    });
  }

  /**
   * 转为任务意图草稿 (DIALOG-016; #52 S17b): a new draft — or the one this answer already made, still unpromoted — from the
   * dialogue's latest attempt, which must be a completed answer (DIALOG-013) whose selected words still stand where they were
   * asked about. It carries the answer's complete fragments (bounded) and its rows, with the dialogue, the attempt and the
   * selection's digest as provenance; its goal starts as the editor's question, its one range is the selection. Nothing is sent,
   * the dialogue contract and its records are untouched, and the Live Reasoning Summary never enters it.
   */
  promoteAnswerToTaskIntentDraft(input: PromoteAnswerToTaskIntentDraftInput, now: Date = new Date()): TaskIntentDraftProjection {
    const bookId = input.bookId;
    const content = this.#dialogueCall(() => {
      const task = this.#requireDialogueTask(bookId, input.dialogueId);
      const resolved = resolveAttempts(this.#dialogues.attempts(task.dialogueId), this.#dialogueHistory, () => null);
      const latest = resolved.attempts.at(-1);
      requireStore(latest !== undefined && latest.attempt.attemptId === input.attemptId, 'DIALOGUE_STALE', '这段对话已有新的回答；请看最新的回答再操作。');
      requireStore(latest.state === 'completed' && latest.fragments.length > 0, 'DIALOGUE_INCOMPLETE', '内容不完整的回答不能转为任务意图草稿。');
      const first = resolved.first;
      requireStore(first !== null && sha256(first.selection) === task.selectionSha256, 'DIALOGUE_HISTORY_MISSING', '这个问题的记录不在本机，不能转为任务意图草稿。');
      const block = this.#authority.prepare('SELECT text, digest FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(task.branchId, task.blockId) as SqlRow | undefined;
      const held = task.span === undefined ? undefined : heldSpanPins(this.#authority, task.branchId, { ...task, span: task.span, text: first.selection });
      requireStore(block !== undefined && (held === undefined ? graphemesOf(asString(block.text)).slice(task.fromGrapheme, task.toGrapheme).join('') === first.selection : held !== null),
        'DIALOGUE_SELECTION_MOVED', '所选文字已经改动或不在当前稿件中；不能把这次回答转为任务意图草稿。');
      const state = this.#draftBranchState(task.branchId);
      const answer = draftAnswer(latest.fragments);
      const question = first.question.trim();
      return {
        goal: goalFromText(question),
        range: {
          rangeId: randomUUID(), manuscriptId: task.manuscriptId, branchId: task.branchId, blockId: task.blockId, blockDigest: asString(block.digest),
          fromGrapheme: task.fromGrapheme, toGrapheme: task.toGrapheme, revisionId: state.revisionId, revisionLabel: state.revisionLabel,
          journalSequence: state.journalSequence, pendingSave: state.pendingSave, text: first.selection, ...(held ? { span: held } : {}),
        } satisfies StoredDraftRange,
        answer: {
          dialogueId: task.dialogueId, attemptId: latest.attempt.attemptId, attemptOrdinal: latest.attempt.ordinal, selectionSha256: task.selectionSha256,
          text: answer.text, rows: answer.rows, truncated: answer.truncated,
        },
      };
    });
    return this.#draftCall(() => {
      const bookTitle = this.#evaluationBookTitle(bookId);
      // The same answer opens the draft it already made while that draft waits (TASK-004: 创建或打开).
      const existing = this.#drafts.unpromoted(bookId, GLOBAL_ATTENTION_READ_LIMIT).find((draft) => draft.origin === 'dialogue-answer' &&
        draft.latest.answer?.attemptId === content.answer.attemptId);
      if (existing !== undefined) return this.#draftProjection(existing, bookTitle, true);
      const stored = this.#transaction(this.#authority, () => this.#drafts.create(bookId, 'dialogue-answer',
        { goal: content.goal, target: 'ranges', outcomeClass: null, ranges: [content.range], answer: content.answer, procedurePin: null }, now));
      return this.#draftProjection(stored, bookTitle, true);
    });
  }

  /**
   * One range the composer pinned now: the exact words selected in the Book's primary manuscript, as its working text holds them at
   * that paragraph and those graphemes now. The pin names the branch's revision and journal position as they stand — a window the
   * editor has open may still name the revision a Task Input checkpoint has since moved past (the text being the same), which is no
   * reason to refuse words that are exactly there. Words that are not there are refused.
   */
  #pinDraftRange(bookId: string, span: DialogueSelectionInput): StoredDraftRange {
    requireDraft(typeof span === 'object' && span !== null && typeof span.manuscriptId === 'string' && UUID_PATTERN.test(span.manuscriptId) &&
      typeof span.branchId === 'string' && UUID_PATTERN.test(span.branchId) && typeof span.blockId === 'string' && /^blk_[0-9a-f]{24}$/u.test(span.blockId) &&
      Number.isSafeInteger(span.fromGrapheme) && Number.isSafeInteger(span.toGrapheme) && span.fromGrapheme >= 0 && span.toGrapheme > span.fromGrapheme &&
      typeof span.selectedText === 'string' && span.selectedText.length > 0,
    'TASK_INTENT_DRAFT_RANGE_INVALID', '所选文字无效。');
    requireDraft(spanGraphemes(span) <= MAX_DIALOGUE_SELECTION_GRAPHEMES,
      'TASK_INTENT_DRAFT_RANGE_INVALID', `所选文字最多 ${MAX_DIALOGUE_SELECTION_GRAPHEMES} 个字。`);
    const manuscript = this.#authority.prepare(
      `SELECT m.book_id, m.role FROM manuscripts m JOIN manuscript_branches b ON b.manuscript_id = m.manuscript_id
       WHERE m.manuscript_id = ? AND b.branch_id = ?`,
    ).get(span.manuscriptId, span.branchId) as SqlRow | undefined;
    requireDraft(manuscript !== undefined && manuscript.book_id === bookId && manuscript.role === 'primary', 'TASK_INTENT_DRAFT_RANGE_INVALID', '所选文字不在这本书的稿件中。');
    const block = this.#authority.prepare('SELECT text, digest FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(span.branchId, span.blockId) as SqlRow | undefined;
    const text = block === undefined ? null : span.span !== undefined ? verifyWorkingSpan(this.#authority, span.branchId, selectionSpanRange({ ...span, span: span.span })).map((entry) => entry.part).join(SELECTION_SPAN_SEPARATOR) : graphemesOf(asString(block.text)).slice(span.fromGrapheme, span.toGrapheme).join('');
    requireDraft(block !== undefined && text === span.selectedText, 'TASK_INTENT_DRAFT_RANGE_MOVED', '所选文字已经改动或不在当前稿件中；请重新选择。');
    const state = this.#draftBranchState(span.branchId);
    return {
      rangeId: randomUUID(), manuscriptId: span.manuscriptId, branchId: span.branchId, blockId: span.blockId, blockDigest: asString(block.digest),
      fromGrapheme: span.fromGrapheme, toGrapheme: span.toGrapheme, revisionId: state.revisionId, revisionLabel: state.revisionLabel,
      journalSequence: state.journalSequence, pendingSave: state.pendingSave, text: span.selectedText, ...(span.span === undefined ? {} : { span: span.span }),
    };
  }

  /** The Book's primary manuscript as it stands now, for the composer's context line (TASK-002); `null` before it has one. */
  #draftManuscript(bookId: string): TaskIntentDraftsProjection['manuscript'] {
    const row = this.#authority.prepare("SELECT b.branch_id FROM manuscripts m JOIN manuscript_branches b ON b.manuscript_id = m.manuscript_id WHERE m.book_id = ? AND m.role = 'primary' ORDER BY b.rowid LIMIT 1")
      .get(bookId) as SqlRow | undefined;
    if (row === undefined) return null;
    const state = this.#draftBranchState(asString(row.branch_id));
    return { revisionLabel: state.revisionLabel, journalSequence: state.journalSequence, pendingSave: state.pendingSave };
  }

  /** Where a branch stands: its revision, its journal, and whether the journal holds edits no revision holds yet (TASK-039). */
  #draftBranchState(branchId: string): { revisionId: string; revisionLabel: string; journalSequence: number; lastCheckpointSequence: number; pendingSave: boolean } {
    const row = this.#authority.prepare(
      `SELECT s.base_revision_id, s.journal_sequence, s.last_checkpoint_sequence, r.revision_label
       FROM branch_working_state s JOIN manuscript_revisions r ON r.revision_id = s.base_revision_id WHERE s.branch_id = ?`,
    ).get(branchId) as SqlRow | undefined;
    requireDraft(row !== undefined, 'TASK_INTENT_DRAFT_RANGE_INVALID', '稿件工作状态不存在。');
    const journalSequence = asNumber(row.journal_sequence);
    const lastCheckpointSequence = asNumber(row.last_checkpoint_sequence);
    return { revisionId: asString(row.base_revision_id), revisionLabel: asString(row.revision_label), journalSequence, lastCheckpointSequence, pendingSave: journalSequence > lastCheckpointSequence };
  }

  /**
   * How each pinned range stands now (TASK-002, 031, 043): its words gone or changed — 任务范围需要重新选择 — or pinned on edits
   * no revision holds yet — 待保存修订版 — or pinned on a revision the manuscript has moved past — 待核对到任务修订版 — or exact.
   */
  #draftRanges(ranges: ReadonlyArray<StoredDraftRange>): TaskIntentDraftRangeProjection[] {
    return ranges.map((range) => {
      const block = this.#authority.prepare('SELECT text, position FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(range.branchId, range.blockId) as SqlRow | undefined;
      const holds = block !== undefined && (range.span === undefined ? graphemesOf(asString(block.text)).slice(range.fromGrapheme, range.toGrapheme).join('') === range.text : heldSpanPins(this.#authority, range.branchId, { ...range, span: range.span }) !== null);
      const branch = this.#authority.prepare('SELECT base_revision_id, last_checkpoint_sequence FROM branch_working_state WHERE branch_id = ?').get(range.branchId) as SqlRow | undefined;
      const state: TaskIntentDraftRangeProjection['state'] = !holds || branch === undefined ? 'reselect'
        : range.pendingSave && asNumber(branch.last_checkpoint_sequence) < range.journalSequence ? 'pending-save'
          : range.pendingSave || asString(branch.base_revision_id) !== range.revisionId ? 'awaiting-resolution' : 'exact';
      return {
        rangeId: range.rangeId,
        manuscriptId: range.manuscriptId,
        blockId: range.blockId,
        fromGrapheme: range.fromGrapheme,
        toGrapheme: range.toGrapheme, ...(range.span === undefined ? {} : { span: range.span }),
        text: range.text,
        revisionLabel: range.revisionLabel,
        journalSequence: range.journalSequence,
        state,
        stateLabel: DRAFT_RANGE_STATE_LABELS[state],
        position: block === undefined ? null : asNumber(block.position),
      };
    });
  }

  #draftProjection(draft: StoredDraft, bookTitle: string, withResolution: boolean): TaskIntentDraftProjection {
    const latest = draft.latest;
    const promotion = draft.promotion;
    return {
      draftId: draft.draftId,
      bookId: draft.bookId,
      bookTitle,
      origin: draft.origin,
      createdAt: draft.createdAt,
      version: {
        versionId: latest.versionId,
        ordinal: latest.ordinal,
        goal: latest.goal,
        target: latest.target,
        ...(latest.deliverable === undefined ? {} : { deliverable: { ...latest.deliverable, stale: taskDeliverableStale(this.#authority, draft.bookId, latest.deliverable) } }),
        outcomeClass: latest.outcomeClass,
        ranges: this.#draftRanges(latest.ranges),
        answer: latest.answer,
        procedurePin: latest.procedurePin,
        createdAt: latest.createdAt,
      },
      promotion: promotion === null ? null : {
        taskKind: promotion.taskKind,
        taskIntentId: promotion.taskIntentId,
        planRef: promotion.taskKind === 'review-run' ? promotion.reviewRunId! : promotion.taskIntentId!,
        promotedAt: promotion.promotedAt,
      },
      resolution: withResolution && promotion === null ? latest.deliverable !== undefined && taskDeliverableStale(this.#authority, draft.bookId, latest.deliverable)
        ? { state: 'unsupported', reason: '交付物已有新版本；请重新选择任务目标。' } : resolveDraft(latest, this.#draftFacts(draft.bookId)) : null,
    };
  }

  /** What the Book's existing preparations offer now, read from their own projections; one that cannot be read offers nothing. */
  #draftFacts(bookId: string): DraftResolutionFacts {
    const read = <T>(body: () => T): T | null => {
      try { return body(); } catch (error) {
        if (error instanceof StoreFatalError) throw error;
        return null;
      }
    };
    const baseline = read(() => this.inspectBaselineAnalysis(bookId));
    const controls = baseline?.updateControls ?? null;
    const review = read(() => this.inspectReviewWorkspace(bookId, null));
    const writing = read(() => this.inspectWritingTask(bookId));
    return {
      analysis: baseline === null ? null : controls === null
        ? { first: true, firstAvailable: baseline.actions.canPrepare, firstReason: baseline.actions.canPrepare ? null : DRAFT_FIRST_BASELINE_UNAVAILABLE, modes: [] }
        : {
          first: false,
          firstAvailable: false,
          firstReason: null,
          modes: (['sync-current', 'reanalyze-book', 'reanalyze-range'] as const).map((mode) => {
            const action = controls.actions[mode];
            return {
              mode,
              label: action.label,
              available: action.available && !controls.blockedByActiveRun,
              reason: controls.blockedByActiveRun ? controls.blockedReason : action.unavailableReason,
            };
          }),
        },
      review: review === null ? null : {
        available: review.newReview.available,
        reason: review.newReview.unavailableReason,
        categories: review.categories.filter((category) => category.available && !category.modelFree)
          .map((category) => ({ categoryId: category.categoryId, label: category.label, book: category.scopes.whole.available, selection: category.scopes.selection.available })),
      },
      writing: writing === null ? null : writing.types.map((type) => ({
        typeId: type.typeId,
        label: type.label,
        available: writing.unavailable === null && type.prepare.allowed,
        reason: writing.unavailable ?? (type.prepare.allowed ? null : type.prepare.reason),
      })),
      writingRequirementsLimit: MAX_WRITING_REQUIREMENTS_GRAPHEMES,
    };
  }

  /** The unfinished drafts of a Book — or of every Book — as the 任务 panel and 待我处理 list them. */
  #draftAttention(bookId: string | null): TaskIntentDraftAttentionReading[] {
    return this.#drafts.unpromoted(bookId, GLOBAL_ATTENTION_READ_LIMIT).map((draft) => ({
      bookId: draft.bookId,
      bookTitle: this.#evaluationBookTitle(draft.bookId),
      draftId: draft.draftId,
      goal: draft.latest.goal,
      origin: draft.origin,
      ranges: draft.latest.ranges.length,
      ordinal: draft.latest.ordinal,
      at: draft.latest.createdAt,
    }));
  }

  #draftCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof TaskIntentDraftError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  // ---- 就这段提问… (Issue #52, plan slice S17a; UI ADR 0014; V2-UX-DIALOG-001 to 016, TASK-044) ---------------------------

  /** The Harness Session Ledger under the Agent Data Root: one JSONL file per technical Session (UI ADR 0014, ADR 0011). */
  get harnessSessionLogRoot(): string {
    return join(this.#dataRoot, HARNESS_SESSION_LOG_DIRECTORY);
  }

  /**
   * The source of the exact selected revision, or the frozen revision an existing dialogue sends again (Issue #52, S17c).
   * A later reimport or another manuscript in the Book cannot authorize these words. Read before anything is recorded.
   */
  dialogueSourceDigest(bookId: string, target: AskAboutSelectionInput['selection'] | Pick<DialogueAttemptInput, 'dialogueId'>): string | null {
    return this.#dialogueCall(() => {
      requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
      const source = 'dialogueId' in target ? this.#requireDialogueTask(bookId, target.dialogueId) : {
        manuscriptId: target.manuscriptId, branchId: target.branchId, revisionId: target.baseRevisionId,
      };
      const row = this.#authority.prepare(
        `SELECT sv.source_digest FROM manuscripts m
         JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
         JOIN manuscript_revisions mr ON mr.manuscript_id = m.manuscript_id AND mr.branch_id = mb.branch_id
         JOIN source_versions sv ON sv.source_version_id = mr.source_version_id AND sv.book_id = m.book_id
         WHERE m.book_id = ? AND m.manuscript_id = ? AND mb.branch_id = ? AND mr.revision_id = ?`,
      ).get(bookId, source.manuscriptId, source.branchId, source.revisionId) as SqlRow | undefined;
      return row === undefined ? null : asString(row.source_digest);
    });
  }

  /** The selected words checked against the working state: one block's range, or every block of a span (Issue #1176). */
  verifySelectionSpan(selection: DialogueSelectionInput): Omit<VerifiedSelection, 'blocks'> & Partial<Pick<VerifiedSelection, 'blocks'>> { return this.#markCall(() => selection.span === undefined ? this.#editorialMarks.verifySpan(selection) : verifySelectionSpan(this.#authority, (first) => this.#editorialMarks.verifySpan(first), { ...selection, span: selection.span })); }

  /**
   * 就这段提问… (the Owner, 2026-10-07: selecting words and asking is enough — no plan, no 开始任务): a dialogue Task on the
   * exact words selected in the Book's manuscript, verified as a mark's range is, and its first attempt. Nothing is sent here;
   * the execution owner sends the message this answers, which holds the selected words and the question and nothing else.
   */
  askAboutSelection(bookId: string, input: AskAboutSelectionInput, now: Date = new Date(), origin?: 'agent-workspace'): DialogueTurnStart {
    return this.#dialogueCall(() => {
      requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
      requireStore(typeof input === 'object' && input !== null && typeof input.selection === 'object' && input.selection !== null,
        'DIALOGUE_SELECTION_INVALID', '所选文字无效。');
      const question = dialogueQuestion(input.question);
      const verified = this.verifySelectionSpan(input.selection);
      requireStore(verified.bookId === bookId, 'DIALOGUE_SELECTION_INVALID', '所选文字不在这本书的稿件中。');
      requireStore(verified.text.length > 0 && (origin === 'agent-workspace' || spanGraphemes(input.selection) <= MAX_DIALOGUE_SELECTION_GRAPHEMES),
        'DIALOGUE_SELECTION_TOO_LONG', `所选文字最多 ${MAX_DIALOGUE_SELECTION_GRAPHEMES} 个字；请选短一些再提问。`);
      const { task, attemptId } = this.#transaction(this.#authority, () => this.#dialogues.ask({
        ...(origin === undefined ? {} : { origin }),
        bookId,
        manuscriptId: input.selection.manuscriptId,
        branchId: input.selection.branchId,
        revisionId: verified.revisionId,
        journalSequence: verified.journalSequence,
        blockId: input.selection.blockId,
        fromGrapheme: input.selection.fromGrapheme,
        toGrapheme: input.selection.toGrapheme,
        blockDigest: input.selection.baseBlockDigest, ...(input.selection.span === undefined ? {} : { span: input.selection.span }),
        selectionSha256: sha256(verified.text),
        questionSha256: sha256(question),
        now,
      }));
      return { dialogueId: task.dialogueId, attemptId, message: { kind: 'ask', selection: verified.text, question, kept: null } };
    });
  }

  /**
   * 继续回答 or 重新回答 (DIALOG-014): a new traceable attempt after the latest, which `attemptId` must name. Its message is read
   * back from the Harness Session Ledger — the words the dialogue's turns sent, under the digests its Task bound — so a new
   * attempt sends exactly what was asked, and 继续回答 adds the complete fragments the stopped answer kept.
   */
  nextDialogueAttempt(bookId: string, input: DialogueAttemptInput, kind: 'continue' | 'regenerate', now: Date = new Date()): DialogueTurnStart {
    return this.#dialogueCall(() => {
      const task = this.#requireDialogueTask(bookId, input.dialogueId);
      const resolved = resolveAttempts(this.#dialogues.attempts(task.dialogueId), this.#dialogueHistory, () => null);
      const latest = resolved.attempts.at(-1);
      requireStore(latest !== undefined && latest.attempt.attemptId === input.attemptId, 'DIALOGUE_STALE', '这段对话已有新的回答；请看最新的回答再操作。');
      // An answer in flight is stopped first, whatever its log holds yet (DIALOG-014).
      requireStore(latest.state !== 'answering', 'DIALOGUE_ANSWERING', '这个问题还在回答中；停止回答后才能继续或重新回答。');
      const first = resolved.first;
      requireStore(first !== null, 'DIALOGUE_HISTORY_MISSING', '这个问题的记录不在本机，不能继续或重新回答。');
      requireStore(sha256(first.selection) === task.selectionSha256 && sha256(first.question) === task.questionSha256,
        'DIALOGUE_RECORD_INVALID', '对话记录与它的问题不一致。');
      requireStore(task.origin !== 'agent-workspace', 'DIALOGUE_WORKSPACE', '请在 Agent 工作区继续提出修改要求。');
      const previousMessage = latest.message ?? first;
      const question = input.question === undefined ? previousMessage.question : dialogueQuestion(input.question);
      const following = input.question !== undefined;
      const conversation: Array<{ question: string; answer: string }> = [];
      for (const entry of resolved.attempts) {
        if (conversation.length === 0 || entry.attempt.kind === 'continue' && entry.message?.followUp === true) {
          conversation.push({ question: entry.message?.question ?? first.question, answer: keptText(entry) });
        } else conversation.at(-1)!.answer = keptText(entry);
      }
      const transcript = (turns: typeof conversation): string => turns.map((turn) => `编辑：${turn.question}\nAI7：${turn.answer}`).join('\n');
      const previousContext = transcript(conversation.slice(0, -1));
      const context = following ? transcript(conversation) : [previousContext, keptText(latest)].filter(Boolean).join('\n');
      const attemptId = this.#transaction(this.#authority, () => this.#dialogues.nextAttempt(task.dialogueId, kind, () => latest.fragments.length, now, undefined, following));
      return {
        dialogueId: task.dialogueId,
        attemptId,
        message: kind === 'continue'
          ? { kind: 'continue', selection: first.selection, question, kept: context, ...(following ? { followUp: true } : {}) }
          : { kind: 'ask', selection: first.selection, question, kept: conversation.length > 1 ? previousContext : null,
            ...(conversation.length > 1 ? { followUp: true } : {}) },
      };
    });
  }

  /** The answer in flight of a dialogue, which `attemptId` must name: what 停止回答 stops. */
  answeringDialogueAttempt(bookId: string, input: DialogueAttemptInput): string {
    return this.#dialogueCall(() => {
      const task = this.#requireDialogueTask(bookId, input.dialogueId);
      const latest = this.#dialogues.attempts(task.dialogueId).at(-1);
      requireStore(latest !== undefined && latest.attemptId === input.attemptId, 'DIALOGUE_STALE', '这段对话已有新的回答；请看最新的回答再操作。');
      requireStore(latest.outcome === null, 'DIALOGUE_NOT_ANSWERING', '这次回答已经结束。');
      return latest.attemptId;
    });
  }

  /** Automatic house context for Global Agent; book context for selection dialogue and workspace turns. */
  dialogueEditorialMemory(dialogueId: string): import('./learning/editorial-memory.js').EditorialMemorySnapshot | null {
    return learningSupervision.dialogueEditorialMemory(this.#editorialLearningHost, dialogueId);
  }

  editorialMemory(bookId: string | null, taskKind: string): import('./learning/editorial-memory.js').EditorialMemorySnapshot | null {
    return learningSupervision.editorialMemory(this.#editorialLearningHost, bookId, taskKind);
  }

  bindDialogueAttempt(attemptId: string, binding: StoredDialogueBinding): void {
    this.#dialogueCall(() => this.#transaction(this.#authority, () => this.#dialogues.bind(attemptId, binding.route === 'ai7-local-deterministic' || binding.reasoningEffort !== undefined ? binding :
      { ...binding, reasoningEffort: effectiveModelReasoningEffort(modelProfileFor(binding.route, binding.model)) })));
  }

  openDialogueSpan(attemptId: string, harnessSessionId: string, startSeq: number, now: Date = new Date()): void {
    this.#dialogueCall(() => this.#transaction(this.#authority, () => this.#dialogues.openSpan(attemptId, harnessSessionId, startSeq, now)));
  }

  settleDialogueAttempt(attemptId: string, outcome: DialogueOutcome, endSeq: number | null, causeCode: string | null, now: Date = new Date()): void {
    this.#dialogueCall(() => this.#transaction(this.#authority, () => this.#dialogues.settle(attemptId, outcome, endSeq, causeCode, now)));
  }

  /**
   * A dialogue as the editor reads it (DIALOG-009 to 016), joined again from its records to the Harness Session Ledger; the
   * attempt answering now is read from what it has streamed (`live`). A read: nothing is written.
   */
  inspectDialogue(bookId: string, dialogueId: string, afterFragment: number, live: (attemptId: string) => LiveAnswer | null): DialogueProjection {
    return this.#dialogueCall(() => {
      requireStore(Number.isSafeInteger(afterFragment) && afterFragment >= 0, 'DIALOGUE_CURSOR_INVALID', '对话位置无效。');
      const task = this.#requireDialogueTask(bookId, dialogueId);
      return dialogueProjection(task, resolveAttempts(this.#dialogues.attempts(task.dialogueId), this.#dialogueHistory, live), afterFragment);
    });
  }

  /**
   * 转为修改建议 (DIALOG-016): a separate governed object — an AI7-produced 修改建议 on the dialogue's selected words, its origin
   * the dialogue Task and its basis the completed answer — made by the editor's explicit action and never applied. An
   * Incomplete Dialogue Answer is refused (DIALOG-013), and so are words the manuscript no longer holds at the range.
   */
  convertDialogueToChangeSuggestion(bookId: string, input: ConvertDialogueToChangeSuggestionInput, now: Date = new Date()): DialogueConversionProjection {
    return this.#dialogueCall(() => {
      const task = this.#requireDialogueTask(bookId, input.dialogueId);
      const resolved = resolveAttempts(this.#dialogues.attempts(task.dialogueId), this.#dialogueHistory, () => null);
      const latest = resolved.attempts.at(-1);
      requireStore(latest !== undefined && latest.attempt.attemptId === input.attemptId, 'DIALOGUE_STALE', '这段对话已有新的回答；请看最新的回答再操作。');
      requireStore(latest.state === 'completed' && latest.fragments.length > 0, 'DIALOGUE_INCOMPLETE', '内容不完整的回答不能转为修改建议。');
      const first = resolved.first;
      requireStore(first !== null && sha256(first.selection) === task.selectionSha256, 'DIALOGUE_HISTORY_MISSING', '这个问题的记录不在本机，不能转为修改建议。');
      requireStore(typeof input.proposedText === 'string' && input.proposedText.trim().length > 0 && input.proposedText.length <= MAX_DIALOGUE_PROPOSAL_CHARACTERS,
        'DIALOGUE_PROPOSAL_INVALID', `建议改为的文字要 1–${MAX_DIALOGUE_PROPOSAL_CHARACTERS} 个字。`);
      requireStore(typeof input.rationale === 'string' && input.rationale.length <= MAX_DIALOGUE_PROPOSAL_CHARACTERS,
        'DIALOGUE_PROPOSAL_INVALID', `理由最多 ${MAX_DIALOGUE_PROPOSAL_CHARACTERS} 个字。`);
      const answer = keptText(latest);
      const quote = [...answer].length > DIALOGUE_BASIS_QUOTE_CHARACTERS ? `${[...answer].slice(0, DIALOGUE_BASIS_QUOTE_CHARACTERS).join('')}…` : answer;
      const markId = this.#markCall(() => this.#editorialMarks.createProducedMany([{
        manuscriptId: task.manuscriptId,
        branchId: task.branchId,
        blockId: task.blockId,
        fromGrapheme: task.fromGrapheme,
        toGrapheme: task.toGrapheme,
        pinnedText: first.selection,
        kind: 'change-suggestion',
        body: '',
        proposedText: input.proposedText,
        rationale: input.rationale,
        atomicGroupId: null,
        source: { kind: 'ai7', origin: 'task', label: DIALOGUE_MARK_SOURCE_LABEL, taskId: task.dialogueId },
        sourceAttemptId: input.attemptId,
        basis: [{ label: `${DIALOGUE_MARK_SOURCE_LABEL} · 第 ${latest.attempt.ordinal} 次`, blockId: task.blockId, fromGrapheme: task.fromGrapheme, toGrapheme: task.toGrapheme, quote }],
      }], ([created]) => {
        requireStore(created !== null && created !== undefined, 'MARK_ANCHOR_CHANGED', task.span === undefined ? '所选文字已不在当前稿件中；不能把这次回答转为修改建议。' : '跨段的提问不能直接转为修改建议；请转为任务意图草稿。');
        this.#dialogues.convert(latest.attempt.attemptId, created, now);
        return created;
      }));
      return {
        markId,
        completionLabel: '已新建修改建议：它不会自动应用，是否接受由你决定。',
        dialogue: dialogueProjection(task, resolveAttempts(this.#dialogues.attempts(task.dialogueId), this.#dialogueHistory, () => null), 0),
      };
    });
  }

  /**
   * Startup reconciliation (DIALOG-012): an attempt this service's predecessor left answering has nothing streaming it now. It
   * settles 回答中断 · 内容不完整 at once, its turn ending where the Harness Session Ledger's record of it ends, and nothing
   * is retried or sent (DIALOG-014).
   */
  reconcileDialogueAttempts(now: Date = new Date()): number {
    return this.#dialogueCall(() => {
      const unsettled = this.#dialogues.unsettled();
      for (const attempt of unsettled) {
        let endSeq: number | null = null;
        if (attempt.span !== null) {
          const log = (() => {
            try {
              return readHarnessSessionLog(this.harnessSessionLogRoot, attempt.span.harnessSessionId);
            } catch {
              return null;
            }
          })();
          if (log !== null && log.events.length > attempt.span.startSeq) endSeq = log.events.length - 1;
        }
        this.#transaction(this.#authority, () => this.#dialogues.settle(attempt.attemptId, 'interrupted', endSeq, 'SERVICE_STOPPED', now));
      }
      return unsettled.length;
    });
  }

  /** The Book's dialogue Tasks as the 任务 panel reads them (TASK-044): each latest answer's state, from the ledger. */
  #dialogueTaskReadings(bookId: string, live: (attemptId: string) => LiveAnswer | null): DialogueTaskReading[] {
    const bookTitle = this.#evaluationBookTitle(bookId);
    return this.#dialogues.tasksOf(bookId).flatMap((task) => {
      const attempts = this.#dialogues.attempts(task.dialogueId);
      // Also hide older workspace rounds identified by their existing execution binding.
      if (task.origin === 'agent-workspace' || attempts.some((attempt) => [AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST, AGENT_WORKSPACE_RETRIEVAL_PROMPT_CONTRACT_DIGEST].includes(attempt.binding?.promptContractSha256 ?? ''))) return [];
      const resolved = resolveAttempts(attempts, this.#dialogueHistory, live);
      const latest = resolved.attempts.at(-1)!;
      return [{
        bookId,
        bookTitle,
        dialogueId: task.dialogueId,
        question: resolved.first?.question ?? null,
        state: latest.state,
        cancelled: latest.attempt.outcome?.causeCode === 'TASK_CANCELLED',
        answered: latest.fragments.length > 0,
        attempts: resolved.attempts.length,
        at: latest.attempt.outcome?.settledAt ?? latest.attempt.createdAt,
      }];
    });
  }

  #requireDialogueTask(bookId: string, dialogueId: string): StoredDialogueTask {
    requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    requireStore(typeof dialogueId === 'string' && UUID_PATTERN.test(dialogueId), 'DIALOGUE_INVALID', '对话标识无效。');
    const task = this.#dialogues.task(dialogueId);
    requireStore(task !== null && task.bookId === bookId, 'DIALOGUE_NOT_FOUND', '这段对话不存在。');
    return task;
  }

  #dialogueCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof DialogueError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  undoManuscript(manuscriptId: string, branchId: string, expectedWorkingDigest: string): DurableHistoryProjection { return manuscriptOperations.undoManuscript(this.#manuscriptOperationsHost, manuscriptId, branchId, expectedWorkingDigest); }

  redoManuscript(manuscriptId: string, branchId: string, expectedWorkingDigest: string): DurableHistoryProjection { return manuscriptOperations.redoManuscript(this.#manuscriptOperationsHost, manuscriptId, branchId, expectedWorkingDigest); }

  #loadCommitAttempt(attemptId: string): CommitAttempt {
    const row = one(
      this.#authority
        .prepare(
          `SELECT attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
                  operation_kind, state, prepared_at, completion_acknowledged_at
           FROM import_commit_attempts WHERE attempt_id = ?`,
        )
        .all(attemptId) as SqlRow[],
      'COMMIT_ATTEMPT_NOT_FOUND',
      '导入提交尝试不存在。',
    );
    const state = asString(row.state);
    const operationKind = asString(row.operation_kind);
    requireStore(state === 'prepared' || state === 'uncertain' || state === 'committed', 'STORE_CORRUPT', '导入提交尝试状态无效。');
    requireStore(
      operationKind === 'manuscript-import' || operationKind === 'source-import' || operationKind === 'manuscript-reimport',
      'STORE_CORRUPT',
      '导入提交尝试类型无效。',
    );
    return {
      attemptId: asString(row.attempt_id),
      draftId: asString(row.draft_id),
      requestFingerprint: asString(row.request_fingerprint),
      expectedDraftVersion: asNumber(row.expected_draft_version),
      reviewDigest: asString(row.review_digest),
      operationKind,
      state,
      preparedAt: asString(row.prepared_at),
      completionAcknowledgedAt:
        row.completion_acknowledged_at === null ? null : asString(row.completion_acknowledged_at),
    };
  }

  #loadCommitAttemptForDraft(draftId: string): CommitAttempt | null {
    const rows = this.#authority
      .prepare('SELECT attempt_id FROM import_commit_attempts WHERE draft_id = ?')
      .all(draftId) as SqlRow[];
    requireStore(rows.length <= 1, 'STORE_CORRUPT', '导入草稿关联了多个提交尝试。');
    return rows.length === 0 ? null : this.#loadCommitAttempt(asString(rows[0]!.attempt_id));
  }

  async #reconcileCommitAttempt(
    attemptInput: CommitAttempt,
    options: { contentObjectAlreadyVerified?: boolean } = {},
  ): Promise<
    | { state: 'uncommitted' }
    | { state: 'uncertain' }
    | { state: 'committed'; result: ImportCommitProjection }
  > {
    const attempt = this.#loadCommitAttempt(attemptInput.attemptId);
    try {
      if (this.#control.induceUnprovableReconciliation && attempt.state !== 'committed') {
        throw new Error('E2E induced failure at the production reconciliation proof boundary.');
      }
      requireStore(
        attempt.requestFingerprint === commitRequestFingerprint(attempt.operationKind, {
          draftId: attempt.draftId,
          expectedDraftVersion: attempt.expectedDraftVersion,
          reviewDigest: attempt.reviewDigest,
          commitId: attempt.attemptId,
        }) || (
          attempt.operationKind === 'manuscript-import' &&
          attempt.requestFingerprint === sha256(canonicalJson({
            draftId: attempt.draftId,
            expectedDraftVersion: attempt.expectedDraftVersion,
            reviewDigest: attempt.reviewDigest,
            commitId: attempt.attemptId,
          }))
        ),
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交尝试绑定无法重建。',
      );
      const counts = one(
        this.#authority
          .prepare(
            `SELECT
               (SELECT count(*) FROM import_commits WHERE commit_id = ?) commits,
               (SELECT count(*) FROM manuscript_import_records WHERE commit_id = ?) manuscript_import_records,
               (SELECT count(*) FROM source_import_records WHERE commit_id = ?) source_import_records,
               (SELECT count(*) FROM manuscript_reimport_records WHERE commit_id = ?) reimport_records`,
          )
          .all(attempt.attemptId, attempt.attemptId, attempt.attemptId, attempt.attemptId) as SqlRow[],
        'STORE_CORRUPT',
        '无法读取导入提交证据。',
      );
      const commitCount = asNumber(counts.commits);
      const manuscriptImportRecordCount = asNumber(counts.manuscript_import_records);
      const sourceImportRecordCount = asNumber(counts.source_import_records);
      const reimportRecordCount = asNumber(counts.reimport_records);
      const importRecordCount = manuscriptImportRecordCount + sourceImportRecordCount + reimportRecordCount;
      const draft = one(
        this.#authority
          .prepare(
            'SELECT state, draft_version, review_digest, committed_commit_id FROM import_drafts WHERE draft_id = ?',
          )
          .all(attempt.draftId) as SqlRow[],
        'STORE_CORRUPT',
        '导入提交尝试缺少草稿。',
      );
      const draftState = asString(draft.state);
      const draftReviewDigest = draft.review_digest === null ? null : asString(draft.review_digest);
      const committedCommitId = draft.committed_commit_id === null ? null : asString(draft.committed_commit_id);
      requireStore(
        asNumber(draft.draft_version) === attempt.expectedDraftVersion && draftReviewDigest === attempt.reviewDigest,
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交尝试与当前复核版本不一致。',
      );
      if (commitCount === 0 && importRecordCount === 0) {
        requireStore(
          draftState === 'reviewed' && committedCommitId === null && attempt.state !== 'committed',
          'COMMIT_PROOF_INCONCLUSIVE',
          '无法证明导入尚未提交。',
        );
        if (attempt.state === 'uncertain') {
          this.#authority
            .prepare(
              `UPDATE import_commit_attempts
               SET state = 'prepared', uncertain_at = NULL, uncertainty_code = NULL
               WHERE attempt_id = ? AND state = 'uncertain'`,
            )
            .run(attempt.attemptId);
        }
        return { state: 'uncommitted' };
      }
      requireStore(commitCount === 1 && importRecordCount === 1, 'COMMIT_PROOF_INCONCLUSIVE', '导入提交证据不完整。');
      const commit = one(
        this.#authority
          .prepare(
            `SELECT draft_id, request_fingerprint, expected_draft_version, review_digest,
                    operation_kind, result_json, committed_at
             FROM import_commits WHERE commit_id = ?`,
          )
          .all(attempt.attemptId) as SqlRow[],
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交证据缺失。',
      );
      requireStore(
        asString(commit.draft_id) === attempt.draftId &&
          asString(commit.request_fingerprint) === attempt.requestFingerprint &&
          asString(commit.operation_kind) === attempt.operationKind &&
          asNumber(commit.expected_draft_version) === attempt.expectedDraftVersion &&
          asString(commit.review_digest) === attempt.reviewDigest &&
          draftState === 'committed' &&
          committedCommitId === attempt.attemptId,
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交证据无法与持久尝试精确对应。',
      );
      const stored = this.#loadStoredCommitResult(attempt.attemptId);
      requireStore(
        (attempt.operationKind === 'manuscript-import' && stored.completionLabel === '稿件已导入') ||
          (attempt.operationKind === 'source-import' && stored.completionLabel === '来源材料已导入') ||
          (attempt.operationKind === 'manuscript-reimport' &&
            (stored.completionLabel === '稿件已重新导入' || stored.completionLabel === '未发现稿件变化')),
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交类型与权威结果记录不一致。',
      );
      const legacyStored = immutableCommitResult(stored);
      const immutableResultJson = canonicalJson(legacyStored);
      const persistedResultJson = asString(commit.result_json);
      requireStore(
        persistedResultJson === canonicalJson(stored) || persistedResultJson === immutableResultJson,
        'COMMIT_PROOF_INCONCLUSIVE',
        '导入提交结果与权威记录图不一致。',
      );
      if (persistedResultJson !== immutableResultJson) {
        this.#authority.prepare(
          'UPDATE import_commits SET result_json = ? WHERE commit_id = ? AND result_json = ?',
        ).run(immutableResultJson, attempt.attemptId, persistedResultJson);
      }
      this.#assertRecoveredCommitGraph(stored);
      if (!options.contentObjectAlreadyVerified) {
        await this.#verifyCommittedContentObject(stored);
        this.#rememberVerifiedCommitObject(attempt.attemptId);
      }
      this.#authority
        .prepare(
          `UPDATE import_commit_attempts
           SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
           WHERE attempt_id = ?`,
        )
        .run(asString(commit.committed_at), attempt.attemptId);
      return {
        state: 'committed',
        result: stored.completionLabel === '稿件已导入'
          ? { ...stored, firstWindow: this.getManuscriptWindow(stored.manuscriptId, stored.branchId, null) }
          : stored,
      };
    } catch {
      const now = new Date().toISOString();
      this.#authority
        .prepare(
          `UPDATE import_commit_attempts
           SET state = 'uncertain', committed_at = NULL, uncertain_at = COALESCE(uncertain_at, ?),
                uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE', completion_acknowledged_at = NULL
           WHERE attempt_id = ?`,
        )
        .run(now, attempt.attemptId);
      return { state: 'uncertain' };
    }
  }

  #rememberVerifiedCommitObject(commitId: string): void {
    this.#verifiedCommitObjects.delete(commitId);
    this.#verifiedCommitObjects.add(commitId);
    while (this.#verifiedCommitObjects.size > 32) {
      const oldest = this.#verifiedCommitObjects.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#verifiedCommitObjects.delete(oldest);
    }
  }

  #markCommitAttemptUncertain(commitId: string): void {
    this.#verifiedCommitObjects.delete(commitId);
    this.#authority.prepare(
      `UPDATE import_commit_attempts
       SET state = 'uncertain', committed_at = NULL, uncertain_at = COALESCE(uncertain_at, ?),
           uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE', completion_acknowledged_at = NULL
       WHERE attempt_id = ? AND state IN ('committed', 'uncertain')`,
    ).run(new Date().toISOString(), commitId);
  }

  async #recoveryProjection(
    draftId: string,
    kind: ImportDraftRecoveryProjection['kind'],
  ): Promise<ImportDraftRecoveryProjection> {
    let snapshot: DraftSnapshot | null = null;
    let staged: StagedImportProjection | null = null;
    let originalFileAccess: OriginalFileAccessProjection = {
      state: 'unknown',
      label: '旧版草稿未保留原始路径，将从完整暂存快照继续',
    };
    try {
      snapshot = this.#loadDraftSnapshot(draftId);
      await this.#inspectSnapshotCompleteness(snapshot);
      originalFileAccess = await this.#originalFileAccess(snapshot);
      staged = this.#stagedProjection(snapshot);
    } catch {
      snapshot = null;
      staged = null;
    }
    const row = one(
      this.#authority
        .prepare(
          `SELECT d.draft_version, d.staged_at, d.display_name, d.state, d.reviewed_title,
                  d.reviewed_target_choice_id, d.reviewed_target_kind, d.reviewed_existing_book_id,
                  d.reviewed_relationship, a.attempt_id
           FROM import_drafts d
           LEFT JOIN import_commit_attempts a ON a.draft_id = d.draft_id
           WHERE d.draft_id = ?`,
        )
        .all(draftId) as SqlRow[],
      'DRAFT_NOT_FOUND',
      '导入草稿不存在。',
    );
    const reviewedTarget = row.reviewed_target_choice_id === null ? null : asString(row.reviewed_target_choice_id);
    requireStore(
      reviewedTarget === null || reviewedTarget === 'new-book' || reviewedTarget === 'new-book-distinct-intended-work',
      'STORE_CORRUPT',
      '导入复核目标无效。',
    );
    const reviewedTargetKind = row.reviewed_target_kind === null ? null : asString(row.reviewed_target_kind);
    const targetBookId = row.reviewed_existing_book_id === null ? null : asString(row.reviewed_existing_book_id);
    const relationship = row.reviewed_relationship === null ? null : asString(row.reviewed_relationship);
    let targetLabel: string | null = null;
    if (reviewedTargetKind === 'existing-book' && targetBookId !== null) {
      const target = this.#authority.prepare('SELECT title FROM books WHERE book_id = ?').get(targetBookId) as SqlRow | undefined;
      targetLabel = target === undefined ? null : asString(target.title);
    } else {
      targetLabel = reviewedTarget === 'new-book'
        ? '新建图书'
        : reviewedTarget === 'new-book-distinct-intended-work'
          ? '新建图书（作为不同作品）'
          : null;
    }
    const attemptId = row.attempt_id === null ? null : asString(row.attempt_id);
    const draftState = asString(row.state);
    return {
      kind,
      draftId,
      draftVersion: asNumber(row.draft_version),
      stagedAt: asString(row.staged_at),
      sourceDisplayName: asString(row.display_name),
      snapshotState: staged === null ? 'reselection-required' : 'complete',
      lastCompletedStep:
        kind === 'abandonment-cleanup'
          ? 'abandonment-cleanup'
          : kind === 'outcome-uncertain'
          ? 'commit-outcome-uncertain'
          : attemptId
            ? 'commit-attempt'
            : draftState === 'reviewed'
              ? 'review'
              : 'staging',
      reviewedTitle: row.reviewed_title === null ? null : asString(row.reviewed_title),
      targetLabel,
      targetBookId,
      relationshipLabel: relationship === 'first-manuscript' || relationship === 'new-book-first-manuscript'
        ? '作为首份稿件导入'
        : relationship === 'source-only'
          ? '作为来源材料导入'
          : relationship === 'reimport' ? '重新导入主稿件' : null,
      originalFileAccess,
      staged,
      commitAttemptId: attemptId,
      supportCode:
        kind === 'abandonment-cleanup'
          ? 'ABANDON_CLEANUP_PENDING'
          : kind === 'outcome-uncertain'
          ? 'COMMIT_PROOF_INCONCLUSIVE'
          : staged === null
            ? 'SNAPSHOT_RESELECTION_REQUIRED'
            : null,
    };
  }

  #assertRecoveredCommitGraph(result: StoredImportCommitProjection): void {
    if ('sourceImportRecordId' in result) {
      this.#assertRecoveredSourceImportGraph(result);
      return;
    }
    if ('reimportRecordId' in result) {
      this.#assertRecoveredReimportGraph(result);
      return;
    }
    this.#assertForeignKeys(this.#authority);
    const counts = one(
      this.#authority
        .prepare(
          `SELECT
             (SELECT count(*) FROM books WHERE book_id = ?) books,
             (SELECT count(*) FROM book_dimension_sets WHERE book_id = ?) dimension_sets,
             (SELECT count(*) FROM book_dimensions bd
                JOIN book_dimension_sets bds ON bds.dimension_set_id = bd.dimension_set_id
                WHERE bds.book_id = ?) dimensions,
             (SELECT count(*) FROM manuscripts WHERE manuscript_id = ? AND book_id = ? AND role = 'primary') manuscripts,
             (SELECT count(*) FROM manuscript_branches
                WHERE branch_id = ? AND manuscript_id = ? AND base_revision_id = ?) branches,
             (SELECT count(*) FROM manuscript_revisions
                WHERE revision_id = ? AND manuscript_id = ? AND branch_id = ?
                  AND ordinal = 1 AND revision_label = 'r1' AND parent_revision_id IS NULL) revisions,
             (SELECT count(*) FROM manuscript_block_versions WHERE revision_id = ?) revision_blocks,
             (SELECT count(*) FROM working_blocks WHERE branch_id = ?) working_blocks,
             (SELECT count(*) FROM workflow_instances
                WHERE book_id = ? AND manuscript_id = ? AND state = 'active'
                  AND profile_id = ? AND profile_version = ? AND profile_digest = ?
                  AND native_profile_id = ? AND native_profile_version = ? AND native_profile_digest = ?) workflows,
             (SELECT count(*) FROM manuscript_import_records
                WHERE import_record_id = ? AND commit_id = ? AND book_id = ? AND manuscript_id = ?
                  AND resulting_revision_id = ?) import_records,
             (SELECT count(*) FROM source_provenance sp
                JOIN manuscript_import_records ir
                  ON ir.source_version_id = sp.source_version_id AND ir.provenance_id = sp.provenance_id
                WHERE ir.import_record_id = ?) provenance`,
        )
        .all(
          result.bookId,
          result.bookId,
          result.bookId,
          result.manuscriptId,
          result.bookId,
          result.branchId,
          result.manuscriptId,
          result.revisionId,
          result.revisionId,
          result.manuscriptId,
          result.branchId,
          result.revisionId,
          result.branchId,
          result.bookId,
          result.manuscriptId,
          this.#workflowProfile.projection.id,
          this.#workflowProfile.projection.version,
          this.#workflowProfile.projection.digest,
          this.#workflowProfile.native.id,
          this.#workflowProfile.native.version,
          this.#workflowProfile.native.digest,
          result.importRecordId,
          result.commitId,
          result.bookId,
          result.manuscriptId,
          result.revisionId,
          result.importRecordId,
        ) as SqlRow[],
      'COMMIT_PROOF_INCONCLUSIVE',
      '无法核对完整导入记录图。',
    );
    const revisionBlocks = asNumber(counts.revision_blocks);
    requireStore(
      asNumber(counts.books) === 1 &&
        asNumber(counts.dimension_sets) === 1 &&
        asNumber(counts.dimensions) === 8 &&
        asNumber(counts.manuscripts) === 1 &&
        asNumber(counts.branches) === 1 &&
        asNumber(counts.revisions) === 1 &&
        revisionBlocks > 0 &&
        asNumber(counts.working_blocks) === revisionBlocks &&
        asNumber(counts.workflows) === 1 &&
        asNumber(counts.import_records) === 1 &&
        asNumber(counts.provenance) === 1,
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交未形成完整权威记录图。',
    );
  }

  #assertRecoveredReimportGraph(result: ManuscriptReimportCommitProjection): void {
    this.#assertForeignKeys(this.#authority);
    const row = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM manuscript_reimport_records
          WHERE reimport_record_id = ? AND commit_id = ? AND book_id = ? AND manuscript_id = ?
            AND branch_id = ? AND source_version_id = ? AND provenance_id = ?
            AND previous_revision_id = ? AND result_kind = ?
            AND resulting_revision_id IS ?) records,
         (SELECT count(*) FROM source_versions WHERE source_version_id = ? AND book_id = ?) sources,
         (SELECT count(*) FROM source_provenance WHERE provenance_id = ? AND source_version_id = ?) provenance`,
    ).all(
      result.reimportRecordId, result.commitId, result.bookId, result.manuscriptId, result.branchId,
      result.sourceVersionId, result.provenanceId, result.previousRevisionId, result.resultKind,
      result.resultingRevisionId, result.sourceVersionId, result.bookId, result.provenanceId, result.sourceVersionId,
    ) as SqlRow[], 'COMMIT_PROOF_INCONCLUSIVE', '无法核对稿件重新导入记录图。');
    requireStore(asNumber(row.records) === 1 && asNumber(row.sources) === 1 && asNumber(row.provenance) === 1,
      'COMMIT_PROOF_INCONCLUSIVE', '稿件重新导入提交未形成完整权威记录图。');
  }

  #assertRecoveredSourceImportGraph(result: SourceImportCommitProjection): void {
    this.#assertForeignKeys(this.#authority);
    const row = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM books WHERE book_id = ?) books,
         (SELECT count(*) FROM book_dimension_sets WHERE book_id = ?) dimension_sets,
         (SELECT count(*) FROM book_dimensions bd
            JOIN book_dimension_sets bds ON bds.dimension_set_id = bd.dimension_set_id
            WHERE bds.book_id = ?) dimensions,
         (SELECT count(*) FROM source_versions
            WHERE source_version_id = ? AND book_id = ?) source_versions,
         (SELECT count(*) FROM source_provenance
            WHERE provenance_id = ? AND source_version_id = ?) provenance,
         (SELECT count(*) FROM source_import_records
            WHERE source_import_record_id = ? AND commit_id = ? AND book_id = ?
              AND source_version_id = ? AND provenance_id = ?) source_import_records`,
    ).all(
      result.bookId,
      result.bookId,
      result.bookId,
      result.sourceVersionId,
      result.bookId,
      result.provenance.provenanceId,
      result.sourceVersionId,
      result.sourceImportRecordId,
      result.commitId,
      result.bookId,
      result.sourceVersionId,
      result.provenance.provenanceId,
    ) as SqlRow[], 'COMMIT_PROOF_INCONCLUSIVE', '无法核对完整来源导入记录图。');
    requireStore(
      asNumber(row.books) === 1 && asNumber(row.dimension_sets) === 1 && asNumber(row.dimensions) === 8 &&
        asNumber(row.source_versions) === 1 && asNumber(row.provenance) === 1 &&
        asNumber(row.source_import_records) === 1,
      'COMMIT_PROOF_INCONCLUSIVE',
      '来源导入提交未形成完整权威记录图。',
    );
  }

  async #verifyCommittedContentObject(result: StoredImportCommitProjection): Promise<void> {
    const recordQuery = result.completionLabel === '稿件已导入'
      ? {
          sql: `SELECT co.object_digest, co.relative_key, co.byte_length
                FROM manuscript_import_records ir
                JOIN source_versions sv ON sv.source_version_id = ir.source_version_id
                JOIN content_objects co ON co.object_digest = sv.object_digest
                WHERE ir.import_record_id = ? AND ir.commit_id = ?`,
          recordId: result.importRecordId,
        }
      : result.completionLabel === '来源材料已导入'
        ? {
            sql: `SELECT co.object_digest, co.relative_key, co.byte_length
                  FROM source_import_records sir
                  JOIN source_versions sv ON sv.source_version_id = sir.source_version_id
                  JOIN content_objects co ON co.object_digest = sv.object_digest
                  WHERE sir.source_import_record_id = ? AND sir.commit_id = ?`,
            recordId: result.sourceImportRecordId,
          }
        : {
            sql: `SELECT co.object_digest, co.relative_key, co.byte_length
                  FROM manuscript_reimport_records rr
                  JOIN source_versions sv ON sv.source_version_id = rr.source_version_id
                  JOIN content_objects co ON co.object_digest = sv.object_digest
                  WHERE rr.reimport_record_id = ? AND rr.commit_id = ?`,
            recordId: result.reimportRecordId,
          };
    const row = one(
      this.#authority
        .prepare(recordQuery.sql)
        .all(recordQuery.recordId, result.commitId) as SqlRow[],
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交来源对象记录缺失。',
    );
    const digest = asString(row.object_digest);
    requireStore(
      digest === result.source.sourceSha256 && asNumber(row.byte_length) === result.source.sourceBytes,
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交来源对象身份不一致。',
    );
    const path = this.#contentObjectPath(digest, asString(row.relative_key));
    const info = await lstat(path);
    requireStore(
      info.isFile() && !info.isSymbolicLink() && info.size === result.source.sourceBytes,
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交来源对象长度无效。',
    );
    requireStore(
      (await digestFile(path)) === digest,
      'COMMIT_PROOF_INCONCLUSIVE',
      '导入提交来源对象摘要无效。',
    );
    if (result.completionLabel === '稿件已导入') {
      const imported = this.#authority.prepare(`SELECT mir.source_version_id, sp.parser_identity,
        wi.commit_id word_commit_id FROM manuscript_import_records mir
        JOIN source_provenance sp ON sp.provenance_id = mir.provenance_id
        LEFT JOIN word_revision_imports wi ON wi.commit_id = mir.commit_id WHERE mir.commit_id = ?`).get(result.commitId);
      requireStore(imported !== undefined, 'COMMIT_PROOF_INCONCLUSIVE', '导入提交来源记录缺失。');
      if (imported.parser_identity === WORD_DOCX_PARSER_IDENTITY || imported.word_commit_id !== null) {
        const sourceVersionId = asString(imported.source_version_id);
        const original = await readRetainedWordOriginal(this.#authority, this.#dataRoot, this.#objectsRoot, result.bookId, sourceVersionId);
        const { compiled } = readWordManuscriptExportSource(this.#authority, result.bookId, result.revisionId, sourceVersionId, original);
        this.#importedMarkCall(() => validateWordImportedMarkSources(this.#authority, result.bookId, result.commitId, compiled));
        this.#learningCall(() => this.#memoryFacade().validateWordImportSamples(result.bookId, result.commitId, compiled));
      }
    }
  }

  async #originalFileAccess(snapshot: DraftSnapshot): Promise<OriginalFileAccessProjection> {
    if (snapshot.selectedPath === null) {
      return { state: 'unknown', label: '旧版草稿未保留原始路径，将从完整暂存快照继续' };
    }
    try {
      const info = await lstat(snapshot.selectedPath);
      if (!info.isFile() || info.isSymbolicLink() || info.size !== snapshot.sourceBytes) {
        return { state: 'changed', label: '原始所选路径的文件已变化，将从完整暂存快照继续' };
      }
      const currentPath = await realpath(snapshot.selectedPath);
      if (currentPath !== snapshot.selectedPath || (await digestFile(currentPath)) !== snapshot.sourceDigest) {
        return { state: 'changed', label: '原始所选路径的文件已变化，将从完整暂存快照继续' };
      }
      return { state: 'available-exact', label: '原始所选文件仍可访问且身份一致' };
    } catch {
      return { state: 'unavailable', label: '原始所选文件已无法访问，将从完整暂存快照继续' };
    }
  }

  async #inspectSnapshotCompleteness(snapshot: DraftSnapshot): Promise<void> {
    const object = one(
      this.#authority
        .prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?')
        .all(snapshot.objectDigest) as SqlRow[],
      'SNAPSHOT_RESELECTION_REQUIRED',
      '暂存对象记录缺失。',
    );
    requireStore(
      snapshot.objectDigest === snapshot.sourceDigest && asNumber(object.byte_length) === snapshot.sourceBytes,
      'SNAPSHOT_RESELECTION_REQUIRED',
      '暂存对象身份记录不一致。',
    );
    const path = this.#contentObjectPath(snapshot.objectDigest, asString(object.relative_key));
    const info = await lstat(path);
    requireStore(
      info.isFile() && !info.isSymbolicLink() && info.size === snapshot.sourceBytes,
      'SNAPSHOT_RESELECTION_REQUIRED',
      '暂存对象长度无效。',
    );
    requireStore(
      (await digestFile(path)) === snapshot.sourceDigest,
      'SNAPSHOT_RESELECTION_REQUIRED',
      '暂存对象摘要无效。',
    );
    // A retained original has no staged snapshot; its exact bytes, verified above, are the whole of
    // what completeness means for it (ADR 0072 §2).
    if (snapshot.parserIdentity !== null) {
      this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(snapshot.draftId));
    }
  }

  async #revalidateSnapshot(snapshot: DraftSnapshot): Promise<{ snapshot: DraftSnapshot; parserDrift: boolean }> {
    try {
      const object = one(
        this.#authority
          .prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?')
          .all(snapshot.objectDigest) as SqlRow[],
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存对象记录缺失。',
      );
      const relativeKey = asString(object.relative_key);
      const byteLength = asNumber(object.byte_length);
      requireStore(
        snapshot.objectDigest === snapshot.sourceDigest && byteLength === snapshot.sourceBytes,
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存对象身份记录不一致。',
      );
      const objectPath = this.#contentObjectPath(snapshot.objectDigest, relativeKey);
      const info = await lstat(objectPath);
      requireStore(
        info.isFile() && !info.isSymbolicLink() && info.size === snapshot.sourceBytes,
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存对象长度无效。',
      );
      requireStore(
        (await digestFile(objectPath)) === snapshot.sourceDigest,
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存对象摘要无效。',
      );
      // A retained original was never parsed, so its exact bytes — verified just above — are the
      // whole of what there is to revalidate, and no parser version can drift under it.
      if (snapshot.parserIdentity === null) return { snapshot, parserDrift: false };
      // A converted draft was read through its working representation, so that is what the parse is
      // revalidated against, after the conversion itself is reproduced from the retained original.
      const converted = snapshot.conversion === null ? null : await this.#revalidateConversion(snapshot, objectPath);
      const wordStaged = this.#authority.prepare('SELECT draft_id FROM staged_word_revision_intakes WHERE draft_id = ?').get(snapshot.draftId) !== undefined;
      const selection = wordStaged ? this.#retentionCall(() => wordPreparedSelection(this.#authority, snapshot.draftId)) : null;
      const ingested = await this.#parseIntoIngest(snapshot.draftId, converted?.path ?? objectPath, snapshot.displayName,
        converted !== null ? { workingRepresentation: true } : !wordStaged ? { historicalReader: true } :
          snapshot.reviewedRelationship === 'source-only' || snapshot.reviewedRelationship === 'reimport' ? { reading: 'legacy' } :
            selection === null ? {} : { reading: selection.choice.mode === 'suggestions' ? 'rejected' : 'accepted',
              textBoxDisposition: selection.textBoxDisposition });
      try {
        const { parsed } = ingested;
        requireStore(
          parsed.sourceDigest === (converted?.digest ?? snapshot.sourceDigest) &&
            parsed.archiveBytes === (converted?.byteLength ?? snapshot.sourceBytes),
          'SNAPSHOT_RESELECTION_REQUIRED',
          '暂存来源身份无法重建。',
        );
        if (parsed.parserIdentity !== snapshot.parserIdentity) {
          return { snapshot: this.#refreshSnapshotForParserDrift(snapshot, ingested, converted), parserDrift: true };
        }
        requireStore(
          parsed.contentDigest === snapshot.contentDigest &&
            parsed.structureDigest === snapshot.structureDigest &&
            parsed.blockCount === snapshot.blockCount &&
            parsed.characterCount === snapshot.characterCount &&
            canonicalJson(converted?.fidelity ?? parsed.fidelity) === canonicalJson(snapshot.fidelity) &&
            parsed.titleSuggestion.value === snapshot.titleSuggestion &&
            parsed.titleSuggestion.sourceLabel === snapshot.titleSource &&
            this.#ingestMatchesSnapshot(ingested, snapshot.draftId),
          'SNAPSHOT_RESELECTION_REQUIRED',
          '暂存解析或预检状态不完整。',
        );
        this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(snapshot.draftId));
        return { snapshot, parserDrift: false };
      } finally {
        this.#discardIngest(ingested.ingestId);
      }
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      if (error instanceof StoreError && error.code === 'DRAFT_VERSION_CHANGED') throw error;
      throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '暂存快照不完整或已损坏，需要精确重选原文件。');
    }
  }

  /**
   * Reproduce a converted draft's working representation from the retained original. The converter
   * is pure, so the same bytes must give the same object; a review the editor is about to commit is
   * the review that conversion produces, or the draft needs an exact reselection (ADR 0072 §2, §3).
   */
  async #revalidateConversion(
    snapshot: DraftSnapshot,
    originalPath: string,
  ): Promise<{ digest: string; byteLength: number; path: string; fidelity: FidelityCategoryProjection[] }> {
    const conversion = snapshot.conversion!;
    const converted = await this.#convertSelectedManuscript(originalPath, conversion.sourceFormat, {
      digest: snapshot.sourceDigest,
      byteLength: snapshot.sourceBytes,
    });
    requireStore(converted !== null, 'SNAPSHOT_RESELECTION_REQUIRED', '保留的原始文件无法再次转换。');
    const digest = sha256(converted.docx);
    requireStore(
      digest === snapshot.workingObjectDigest,
      'SNAPSHOT_RESELECTION_REQUIRED',
      '工作表示无法按相同字节重建。',
    );
    const object = one(
      this.#authority
        .prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?')
        .all(digest) as SqlRow[],
      'SNAPSHOT_RESELECTION_REQUIRED',
      '工作表示对象记录缺失。',
    );
    const path = this.#contentObjectPath(digest, asString(object.relative_key));
    requireStore((await digestFile(path)) === digest, 'SNAPSHOT_RESELECTION_REQUIRED', '工作表示对象摘要无效。');
    return {
      digest,
      byteLength: asNumber(object.byte_length),
      path,
      fidelity: conversionFidelityReport(conversion, converted.loss),
    };
  }

  #refreshSnapshotForParserDrift(
    snapshot: DraftSnapshot,
    ingested: IngestedDocx,
    converted: { digest: string; fidelity: FidelityCategoryProjection[] } | null = null,
  ): DraftSnapshot {
    const nextVersion = snapshot.version + 1;
    const now = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      this.#authority.prepare('DELETE FROM manuscript_reimport_comparisons WHERE draft_id = ?').run(snapshot.draftId);
      this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(snapshot.draftId);
      this.#promoteIngestSnapshot(
        snapshot.draftId,
        ingested,
        now,
        converted === null ? undefined : { sourceDigest: snapshot.sourceDigest, fidelity: converted.fidelity },
      );
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'staged', draft_version = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
               reviewed_target_kind = NULL, reviewed_existing_book_id = NULL,
               reviewed_relationship = NULL, reviewed_book_state_digest = NULL,
               reviewed_reuse_source_version_id = NULL,
               reviewed_lineage_status = NULL, reviewed_lineage_source_version_id = NULL,
               reviewed_checkpoint_revision_id = NULL, reviewed_manuscript_id = NULL, reviewed_branch_id = NULL,
               review_digest = NULL, reviewed_at = NULL
           WHERE draft_id = ? AND draft_version = ? AND state IN ('staged', 'reviewed')`,
        )
        .run(nextVersion, snapshot.draftId, snapshot.version);
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在重新预检时已变化。');
      this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(snapshot.draftId);
      this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(snapshot.draftId));
    });
    return this.#loadDraftSnapshot(snapshot.draftId);
  }

  /**
   * A reimport review prepared before the chapter-level comparison (Issue #412, S63; revision 36) has no rows to
   * resolve: its draft goes back to staged, as any invalidated review does, and is compared again when it is continued.
   */
  #invalidateUngroupedReimportReviews(): void {
    const drafts = this.#authority.prepare(
      `SELECT d.draft_id FROM import_drafts d
       JOIN manuscript_reimport_comparisons c ON c.draft_id = d.draft_id
       LEFT JOIN manuscript_reimport_group_sets gs ON gs.comparison_id = c.comparison_id
       LEFT JOIN manuscript_reimport_records r ON r.comparison_id = c.comparison_id
       WHERE d.state = 'reviewed' AND d.reviewed_relationship = 'reimport' AND gs.comparison_id IS NULL AND r.comparison_id IS NULL
         -- A commit left uncertain is its recovery's to settle first: invalidating its review would strand it.
         AND NOT EXISTS (SELECT 1 FROM import_commit_attempts a WHERE a.draft_id = d.draft_id AND a.state = 'uncertain')`,
    ).all() as SqlRow[];
    for (const draft of drafts) this.#invalidateReview(this.#loadDraftSnapshot(asString(draft.draft_id)));
  }

  #invalidateReview(snapshot: DraftSnapshot): DraftSnapshot {
    requireStore(snapshot.state === 'reviewed', 'DRAFT_STATE_CHANGED', '只有已复核草稿可以失效旧复核。');
    const nextVersion = snapshot.version + 1;
    this.#transaction(this.#authority, () => {
      this.#authority.prepare('DELETE FROM manuscript_reimport_comparisons WHERE draft_id = ?').run(snapshot.draftId);
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'staged', draft_version = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
               reviewed_target_kind = NULL, reviewed_existing_book_id = NULL,
               reviewed_relationship = NULL, reviewed_book_state_digest = NULL,
               reviewed_reuse_source_version_id = NULL,
               reviewed_lineage_status = NULL, reviewed_lineage_source_version_id = NULL,
               reviewed_checkpoint_revision_id = NULL, reviewed_manuscript_id = NULL, reviewed_branch_id = NULL,
               review_digest = NULL, reviewed_at = NULL
           WHERE draft_id = ? AND draft_version = ? AND state = 'reviewed'`,
        )
        .run(nextVersion, snapshot.draftId, snapshot.version);
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在复核失效时已变化。');
      this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(snapshot.draftId);
    });
    return this.#loadDraftSnapshot(snapshot.draftId);
  }

  /** The retained original keeps the extension of the format it was identified as (ADR 0072 §2). */
  async #persistRetainedOriginal(
    selectedPath: string,
    format: SourceFormat,
  ): Promise<{ digest: string; byteLength: number; relativeKey: string }> {
    const digest = await digestFile(selectedPath);
    const byteLength = (await lstat(selectedPath)).size;
    return { digest, byteLength, relativeKey: await this.#persistContentObject(selectedPath, digest, format) };
  }

  /** `source` is the selected file's path, or the bytes of a working representation the product wrote. */
  async #persistContentObject(source: string | Uint8Array, sourceDigest: string, format: SourceFormat): Promise<string> {
    this.#requireNoAbandonmentCleanupForObject(sourceDigest);
    const extension = manuscriptObjectExtension(format);
    const relativeKey = posix.join('sha256', sourceDigest.slice(0, 2), `${sourceDigest}${extension}`);
    const objectDirectory = await ensureCanonicalDataDirectory(
      this.#dataRoot,
      'objects',
      'sha256',
      sourceDigest.slice(0, 2),
    );
    const objectFileName = `${sourceDigest}${extension}`;
    const inspectedObject = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, objectFileName);
    const objectPath = inspectedObject.path;
    requireStore(isInside(this.#objectsRoot, objectPath), 'OBJECT_PATH_INVALID', '对象路径越界。');
    if (!inspectedObject.exists || (await digestFile(objectPath)) !== sourceDigest) {
      const temporary = `${objectPath}.${process.pid}.${randomUUID()}.partial`;
      const temporaryName = basename(temporary);
      requireStore(
        !(await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, temporaryName)).exists,
        'OBJECT_PATH_INVALID',
        '暂存对象路径已存在。',
      );
      try {
        if (typeof source === 'string') await copyFile(source, temporary, constants.COPYFILE_EXCL);
        else await writeFile(temporary, source, { flag: 'wx' });
        const inspectedTemporary = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, temporaryName);
        requireStore(
          inspectedTemporary.exists && inspectedTemporary.path === temporary,
          'OBJECT_PATH_INVALID',
          '暂存对象路径无效。',
        );
        const handle = await open(temporary, 'r+');
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
        requireStore((await digestFile(temporary)) === sourceDigest, 'OBJECT_VERIFY_FAILED', '暂存对象校验失败。');
        await rename(temporary, objectPath);
        const activated = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, objectFileName);
        requireStore(
          activated.exists && activated.path === objectPath && (await digestFile(objectPath)) === sourceDigest,
          'OBJECT_PATH_INVALID',
          '暂存对象激活无效。',
        );
      } catch (error) {
        const cleanup = await inspectCanonicalDataFile(this.#dataRoot, objectDirectory, temporaryName);
        if (cleanup.exists) await rm(cleanup.path, { force: true });
        throw error;
      }
    }
    return relativeKey;
  }

  async #parseIntoIngest(
    draftId: string,
    path: string,
    displayName: string,
    options: { signal?: AbortSignal; onArchiveProgress?: (bytes: number) => void;
      workingRepresentation?: true; historicalReader?: true; reading?: WordReadingKind | 'legacy'; textBoxDisposition?: TextBoxDisposition } = {},
  ): Promise<IngestedDocx> {
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    const ingestId = randomUUID();
    let inserted = 0;
    let startOffset = 0;
    const legacySources: LegacyBlockSources = legacyBlockSources([]);
    const batch: Array<{
      stagedBlockId: string;
      position: number;
      kind: ParsedDocxBlock['kind'];
      level: ParsedDocxBlock['level'];
      text: string;
      digest: string;
      startOffset: number;
      graphemeLength: number;
    }> = [];
    const insert = this.#ingest.prepare(
      `INSERT INTO import_ingest_blocks(
         ingest_id, draft_id, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const flushBatch = (): void => {
      if (batch.length === 0) return;
      this.#ingest.exec('BEGIN IMMEDIATE');
      try {
        for (const row of batch) {
          insert.run(
            ingestId,
            draftId,
            row.stagedBlockId,
            row.position,
            row.kind,
            row.level,
            row.text,
            row.digest,
            row.startOffset,
            row.graphemeLength,
          );
        }
        this.#ingest.exec('COMMIT');
        inserted += batch.length;
        batch.length = 0;
      } catch (error) {
        try {
          this.#ingest.exec('ROLLBACK');
        } catch (rollbackError) {
          this.#poisoned = true;
          throw new StoreFatalError(new AggregateError([error, rollbackError], 'SQLite ingest rollback failed.'));
        }
        throw error;
      }
    };
    try {
      const emit = (block: Pick<ParsedDocxBlock, 'position' | 'digest' | 'kind' | 'level' | 'text' | 'graphemeLength'>): void => {
        const stagedBlockId = `blk_${sha256(`${draftId}\u0000${block.position}\u0000${block.digest}`).slice(0, 24)}`;
        batch.push({
          stagedBlockId,
          position: block.position,
          kind: block.kind,
          level: block.level,
          text: block.text,
          digest: block.digest,
          startOffset,
          graphemeLength: block.graphemeLength,
        });
        startOffset += block.graphemeLength;
        if (batch.length === INGEST_BATCH_SIZE) flushBatch();
      };
      const emitLegacy = (block: ParsedDocxBlock): void => { routeBlockSource(block, legacySources); emit(block); };
      const parseOptions = { ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.onArchiveProgress === undefined ? {} : { onArchiveProgress: options.onArchiveProgress }), formatIdentified: true };
      // Converted working representations and native originals keep their existing, distinct routing.
      const native = options.workingRepresentation === true || options.historicalReader === true ? null : await parseNativeDocxIntake(path, displayName,
        { legacy: emitLegacy, wordPreview: () => undefined }, undefined, parseOptions);
      let parsed: ParsedDocx | ParsedWordDocx;
      let sources: StagedImportSources | null;
      if (native === null) {
        parsed = await parseDocx(path, displayName, emitLegacy, undefined, parseOptions);
        sources = { ...legacySources, textBoxes: parsed.textBoxes };
      } else if (native.kind === 'legacy') {
        parsed = native.parsed;
        sources = { ...legacySources, textBoxes: parsed.textBoxes };
      } else if (options.reading === 'legacy') {
        requireStore(native.legacy.kind === 'ready', 'DOCX_REJECTED', '该 DOCX 的历史读法无法形成现有来源导入或重新导入。');
        parsed = native.legacy.parsed;
        for (const block of native.legacy.blocks) { options.signal?.throwIfAborted(); emitLegacy(block); }
        sources = { ...legacySources, textBoxes: parsed.textBoxes };
      } else {
        const disposition = options.textBoxDisposition ?? 'retain';
        const compiled = disposition === 'retain' ? native.word : await compileWordTrackedDocx(path,
          { digest: native.word.sourceDigest, bytes: native.word.archiveBytes }, { ...parseOptions, textBoxDisposition: disposition });
        requireStore(compiled.kind === 'ready' && compiled.graphDigest === native.word.graphDigest &&
          compiled.templateManifestDigest === native.word.templateManifestDigest,
        'WORD_READING_UNAVAILABLE', 'Word 阅读与原始来源的完整编译结果不一致。');
        const reading = compiled.readings[options.reading ?? native.word.previewReading];
        requireStore(reading.usable && reading.blocks.length > 0, 'WORD_READING_UNAVAILABLE', '所选 Word 阅读没有可用的非空稿件。');
        let fidelity = native.parsed.fidelity;
        if (options.reading !== undefined) {
          const selected = wordImportFidelityReport(fidelity, options.reading === 'rejected' ? 'suggestions' : 'accepted-baseline', reading.marks.length, disposition);
          requireStore(selected !== undefined, 'WORD_READING_UNAVAILABLE', '所选 Word 阅读没有完整保真计划。');
          fidelity = selected;
        }
        parsed = { ...native.parsed, contentDigest: reading.contentDigest, structureDigest: reading.structureDigest,
          blockCount: reading.blocks.length, characterCount: reading.characterCount, fidelity };
        for (const block of reading.blocks) { options.signal?.throwIfAborted(); emit(block); }
        sources = null;
      }
      flushBatch();
      requireStore(
        parsed.blockCount === inserted && parsed.characterCount === startOffset && inserted > 0,
        'SNAPSHOT_INCOMPLETE',
        '暂存解析未形成完整有界摄入。',
      );
      return { ingestId, parsed, sources, native };
    } catch (error) {
      this.#discardIngest(ingestId);
      throw error;
    }
  }

  #discardIngest(ingestId: string): void {
    requireStore(UUID_PATTERN.test(ingestId), 'SNAPSHOT_INCOMPLETE', '暂存摄入标识无效。');
    try {
      this.#ingest.prepare('DELETE FROM import_ingest_blocks WHERE ingest_id = ?').run(ingestId);
      const remaining = this.#ingest
        .prepare('SELECT count(*) total FROM import_ingest_blocks WHERE ingest_id = ?')
        .get(ingestId) as SqlRow | undefined;
      requireStore(remaining !== undefined && asNumber(remaining.total) === 0, 'SNAPSHOT_INCOMPLETE', '暂存摄入清理无法确认。');
    } catch (error) {
      this.#poisoned = true;
      throw new StoreFatalError(error);
    }
  }

  /**
   * `converted` belongs to a draft the product read through a working representation: the snapshot
   * then keys on the original's digest and carries the merged review, while every derived digest
   * stays the one the parser produced from the object it actually read (ADR 0072 §2).
   */
  #promoteIngestSnapshot(
    draftId: string,
    ingested: IngestedDocx,
    createdAt: string,
    converted?: { sourceDigest: string; fidelity: FidelityCategoryProjection[] },
  ): void { return importRetentionOperations.promoteIngestSnapshot(this.#importRetentionOperationsHost, draftId, ingested, createdAt, converted); }

  /**
   * The block rows of a fresh parse against the staged ones, and its sources and imported marks against the
   * staged sources and marks.
   */
  #ingestMatchesSnapshot(ingested: IngestedDocx, draftId: string): boolean { return importRetentionOperations.ingestMatchesSnapshot(this.#importRetentionOperationsHost, ingested, draftId); }

  #contentObjectPath(objectDigest: string, relativeKey: string): string {
    return contentObjectPath(this.#objectsRoot, objectDigest, relativeKey);
  }

  #loadAbandonmentCleanupIntent(draftId: string): AbandonmentCleanupIntent | null {
    const rows = this.#authority
      .prepare(
        `SELECT draft_id, object_digest, expected_draft_version, relative_key, state, working_object_digest
         FROM import_abandonment_cleanup_intents
         WHERE draft_id = ?`,
      )
      .all(draftId) as SqlRow[];
    requireStore(rows.length <= 1, 'STORE_CORRUPT', '导入草稿关联了多个放弃清理意图。');
    if (rows.length === 0) return null;
    const row = rows[0]!;
    const state = asString(row.state);
    requireStore(state === 'prepared' || state === 'bytes-removed', 'STORE_CORRUPT', '放弃清理意图状态无效。');
    const workingObjectDigest = row.working_object_digest === null ? null : asString(row.working_object_digest);
    requireStore(
      workingObjectDigest === null || DIGEST_PATTERN.test(workingObjectDigest),
      'STORE_CORRUPT',
      '放弃清理意图的工作表示摘要无效。',
    );
    return {
      draftId: asString(row.draft_id),
      objectDigest: asString(row.object_digest),
      expectedDraftVersion: asNumber(row.expected_draft_version),
      relativeKey: asString(row.relative_key),
      state,
      workingObjectDigest,
    };
  }

  #requireNoAbandonmentCleanupIntent(draftId: string): void {
    requireStore(
      this.#loadAbandonmentCleanupIntent(draftId) === null,
      'ABANDON_CLEANUP_PENDING',
      '该导入已进入持久放弃清理；只能重试清理，不能继续、重选或提交。',
    );
  }

  #requireNoAbandonmentCleanupForObject(objectDigest: string): void {
    const pending = one(
      this.#authority
        .prepare('SELECT count(*) pending FROM import_abandonment_cleanup_intents WHERE object_digest = ?')
        .all(objectDigest) as SqlRow[],
      'STORE_CORRUPT',
      '无法核对暂存对象清理状态。',
    );
    requireStore(
      asNumber(pending.pending) === 0,
      'ABANDON_CLEANUP_PENDING',
      '该暂存对象已进入持久放弃清理；清理完成前不能重新持久化或创建权威引用。',
    );
  }

  #assertAbandonmentCleanupAuthority(intent: AbandonmentCleanupIntent): void {
    const proof = one(
      this.#authority
        .prepare(
          `SELECT
             (SELECT count(*)
                FROM import_abandonment_cleanup_intents i
                WHERE i.draft_id = ? AND i.object_digest = ? AND i.expected_draft_version = ?
                  AND i.relative_key = ?) intents,
             (SELECT count(*)
                FROM import_drafts d
                WHERE d.draft_id = ? AND d.state IN ('staged', 'reviewed')
                  AND d.draft_version = ? AND d.object_digest = ?) exact_drafts,
             (SELECT count(*) FROM import_drafts d WHERE d.object_digest = ?) draft_refs,
             (SELECT count(*) FROM source_versions sv WHERE sv.object_digest = ?) source_refs,
             (SELECT count(*) FROM import_commits c WHERE c.draft_id = ?) commits,
             (SELECT count(*) FROM import_commit_attempts a
                WHERE a.draft_id = ? AND a.state != 'prepared') unsafe_attempts,
             (SELECT count(*) FROM content_objects co
                WHERE co.object_digest = ? AND co.relative_key = ?) objects`,
        )
        .all(
          intent.draftId,
          intent.objectDigest,
          intent.expectedDraftVersion,
          intent.relativeKey,
          intent.draftId,
          intent.expectedDraftVersion,
          intent.objectDigest,
          intent.objectDigest,
          intent.objectDigest,
          intent.draftId,
          intent.draftId,
          intent.objectDigest,
          intent.relativeKey,
        ) as SqlRow[],
      'STORE_CORRUPT',
      '无法核对持久放弃清理意图。',
    );
    requireStore(
      asNumber(proof.intents) === 1 &&
        asNumber(proof.exact_drafts) === 1 &&
        asNumber(proof.draft_refs) === 1 &&
        asNumber(proof.source_refs) === 0 &&
        asNumber(proof.commits) === 0 &&
        asNumber(proof.unsafe_attempts) === 0 &&
        asNumber(proof.objects) === 1,
      'ABANDON_CLEANUP_INCONCLUSIVE',
      '持久放弃清理证据不再完整；已阻止删除、继续和新权威引用。',
    );
  }

  /** Every object a cleanup intent owns: the retained original, and a working representation. */
  #cleanupObjects(intent: AbandonmentCleanupIntent): Array<{ digest: string; relativeKey: string }> {
    return [
      { digest: intent.objectDigest, relativeKey: intent.relativeKey },
      ...(intent.workingObjectDigest === null
        ? []
        : [{ digest: intent.workingObjectDigest, relativeKey: workingObjectRelativeKey(intent.workingObjectDigest) }]),
    ];
  }

  async #contentObjectIsAbsent(intent: AbandonmentCleanupIntent): Promise<boolean> {
    for (const object of this.#cleanupObjects(intent)) {
      try {
        await lstat(this.#contentObjectPath(object.digest, object.relativeKey));
        return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new StoreError('ABANDON_CLEANUP_FAILED', '无法证明未共享暂存对象已经删除；放弃清理意图仍保留。');
        }
      }
    }
    return true;
  }

  #requireContentObjectAbsentForFinalization(intent: AbandonmentCleanupIntent): void {
    for (const object of this.#cleanupObjects(intent)) this.#requireObjectAbsentForFinalization(object);
  }

  #requireObjectAbsentForFinalization(object: { digest: string; relativeKey: string }): void {
    try {
      lstatSync(this.#contentObjectPath(object.digest, object.relativeKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new StoreError(
        'ABANDON_CLEANUP_INCONCLUSIVE',
        '无法在权威清理事务内证明暂存对象仍然缺失；持久放弃清理意图与导入草稿仍保留。',
      );
    }
    throw new StoreError(
      'ABANDON_CLEANUP_INCONCLUSIVE',
      '暂存对象在权威清理事务前再次出现；持久放弃清理意图与导入草稿仍保留。',
    );
  }

  async #resumeAbandonmentCleanupIntent(intentInput: AbandonmentCleanupIntent): Promise<void> {
    this.#assertAvailable();
    let intent = this.#loadAbandonmentCleanupIntent(intentInput.draftId);
    requireStore(intent !== null, 'ABANDON_CLEANUP_INCONCLUSIVE', '持久放弃清理意图缺失。');
    requireStore(
      intent.objectDigest === intentInput.objectDigest &&
        intent.expectedDraftVersion === intentInput.expectedDraftVersion &&
        intent.relativeKey === intentInput.relativeKey &&
        intent.workingObjectDigest === intentInput.workingObjectDigest,
      'ABANDON_CLEANUP_INCONCLUSIVE',
      '持久放弃清理意图绑定已变化。',
    );
    this.#assertAbandonmentCleanupAuthority(intent);
    try {
      if (this.#control.induceAbandonObjectRemovalFailure) {
        throw new Error('E2E induced failure at the production unshared-object removal boundary.');
      }
      for (const object of this.#cleanupObjects(intent)) {
        await rm(this.#contentObjectPath(object.digest, object.relativeKey), { force: true });
      }
      requireStore(
        await this.#contentObjectIsAbsent(intent),
        'ABANDON_CLEANUP_FAILED',
        '无法证明未共享暂存对象已经删除；放弃清理意图仍保留。',
      );
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('ABANDON_CLEANUP_FAILED', '无法安全删除未共享的暂存对象；持久放弃清理意图与导入草稿仍保留。');
    }
    if (this.#control.interruptAfterAbandonObjectRemoval) {
      throw new StoreFatalError(new Error('E2E interruption after object removal and before authority cleanup finalization.'));
    }
    const removedAt = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      const update = this.#authority
        .prepare(
          `UPDATE import_abandonment_cleanup_intents
           SET state = 'bytes-removed', bytes_removed_at = COALESCE(bytes_removed_at, ?)
           WHERE draft_id = ? AND object_digest = ? AND expected_draft_version = ?
             AND relative_key = ? AND state IN ('prepared', 'bytes-removed')`,
        )
        .run(
          removedAt,
          intent!.draftId,
          intent!.objectDigest,
          intent!.expectedDraftVersion,
          intent!.relativeKey,
        );
      requireStore(update.changes === 1, 'ABANDON_CLEANUP_INCONCLUSIVE', '无法持久确认暂存对象删除结果。');
      this.#assertForeignKeys(this.#authority);
    });
    intent = this.#loadAbandonmentCleanupIntent(intent.draftId);
    requireStore(intent?.state === 'bytes-removed', 'ABANDON_CLEANUP_INCONCLUSIVE', '暂存对象删除确认缺失。');
    requireStore(
      await this.#contentObjectIsAbsent(intent),
      'ABANDON_CLEANUP_INCONCLUSIVE',
      '暂存对象在权威清理前再次出现；已阻止最终清理。',
    );
    this.#transaction(this.#authority, () => {
      this.#assertAbandonmentCleanupAuthority(intent!);
      this.#requireContentObjectAbsentForFinalization(intent!);
      const intentDeletion = this.#authority
        .prepare(
          `DELETE FROM import_abandonment_cleanup_intents
           WHERE draft_id = ? AND object_digest = ? AND expected_draft_version = ?
             AND relative_key = ? AND state = 'bytes-removed'`,
        )
        .run(intent!.draftId, intent!.objectDigest, intent!.expectedDraftVersion, intent!.relativeKey);
      requireStore(intentDeletion.changes === 1, 'ABANDON_CLEANUP_INCONCLUSIVE', '放弃清理意图无法完成。');
      const draftDeletion = this.#authority
        .prepare(
          `DELETE FROM import_drafts
           WHERE draft_id = ? AND draft_version = ? AND object_digest = ?
             AND state IN ('staged', 'reviewed')`,
        )
        .run(intent!.draftId, intent!.expectedDraftVersion, intent!.objectDigest);
      requireStore(draftDeletion.changes === 1, 'ABANDON_CLEANUP_INCONCLUSIVE', '放弃清理草稿无法完成。');
      const references = one(
        this.#authority
          .prepare(
            `SELECT
               (SELECT count(*) FROM source_versions WHERE object_digest = ?) source_refs,
               (SELECT count(*) FROM import_drafts WHERE object_digest = ?) draft_refs`,
          )
          .all(intent!.objectDigest, intent!.objectDigest) as SqlRow[],
        'STORE_CORRUPT',
        '无法核对最终放弃清理引用。',
      );
      requireStore(
        asNumber(references.source_refs) === 0 && asNumber(references.draft_refs) === 0,
        'ABANDON_REFERENCE_CHANGED',
        '暂存对象在最终放弃清理时出现权威引用。',
      );
      const objectDeletion = this.#authority
        .prepare('DELETE FROM content_objects WHERE object_digest = ? AND relative_key = ?')
        .run(intent!.objectDigest, intent!.relativeKey);
      requireStore(objectDeletion.changes === 1, 'ABANDON_CLEANUP_INCONCLUSIVE', '暂存对象权威记录无法完成清理。');
      if (intent!.workingObjectDigest !== null) {
        const workingReferences = one(
          this.#authority
            .prepare(
              `SELECT
                 (SELECT count(*) FROM source_versions WHERE working_object_digest = ?) source_refs,
                 (SELECT count(*) FROM import_drafts WHERE working_object_digest = ?) draft_refs`,
            )
            .all(intent!.workingObjectDigest, intent!.workingObjectDigest) as SqlRow[],
          'STORE_CORRUPT',
          '无法核对工作表示的最终放弃清理引用。',
        );
        requireStore(
          asNumber(workingReferences.source_refs) === 0 && asNumber(workingReferences.draft_refs) === 0,
          'ABANDON_REFERENCE_CHANGED',
          '工作表示在最终放弃清理时出现权威引用。',
        );
        const workingDeletion = this.#authority
          .prepare('DELETE FROM content_objects WHERE object_digest = ? AND relative_key = ?')
          .run(intent!.workingObjectDigest, workingObjectRelativeKey(intent!.workingObjectDigest));
        requireStore(workingDeletion.changes === 1, 'ABANDON_CLEANUP_INCONCLUSIVE', '工作表示权威记录无法完成清理。');
      }
      this.#assertForeignKeys(this.#authority);
    });
  }

  async #resumeAbandonmentCleanupIntents(): Promise<void> {
    const rows = this.#authority
      .prepare('SELECT draft_id FROM import_abandonment_cleanup_intents ORDER BY requested_at, draft_id')
      .all() as SqlRow[];
    for (const row of rows) {
      const intent = this.#loadAbandonmentCleanupIntent(asString(row.draft_id));
      if (!intent) continue;
      try {
        await this.#resumeAbandonmentCleanupIntent(intent);
      } catch (error) {
        if (error instanceof StoreFatalError) throw error;
      }
    }
  }

  async #sweepUnreferencedContentObjects(): Promise<void> {
    const rows = this.#authority
      .prepare(
        // A converted file's working representation is referenced as such, never as a digest of
        // record, so the sweep counts that reference too or it would remove what a Manuscript was
        // read from (ADR 0072 §2).
        `SELECT co.object_digest, co.relative_key
         FROM content_objects co
         WHERE NOT EXISTS (SELECT 1 FROM source_versions sv WHERE sv.object_digest = co.object_digest)
           AND NOT EXISTS (SELECT 1 FROM import_drafts d WHERE d.object_digest = co.object_digest)
           AND NOT EXISTS (SELECT 1 FROM source_versions sv WHERE sv.working_object_digest = co.object_digest)
           AND NOT EXISTS (SELECT 1 FROM import_drafts d WHERE d.working_object_digest = co.object_digest)
         ORDER BY co.object_digest`,
      )
      .all() as SqlRow[];
    for (const row of rows) {
      const digest = asString(row.object_digest);
      try {
        await rm(this.#contentObjectPath(digest, asString(row.relative_key)), { force: true });
      } catch {
        continue;
      }
      this.#transaction(this.#authority, () => {
        this.#authority
          .prepare(
            `DELETE FROM content_objects
             WHERE object_digest = ?
               AND NOT EXISTS (SELECT 1 FROM source_versions sv WHERE sv.object_digest = content_objects.object_digest)
               AND NOT EXISTS (SELECT 1 FROM import_drafts d WHERE d.object_digest = content_objects.object_digest)
               AND NOT EXISTS (SELECT 1 FROM source_versions sv WHERE sv.working_object_digest = content_objects.object_digest)
               AND NOT EXISTS (SELECT 1 FROM import_drafts d WHERE d.working_object_digest = content_objects.object_digest)`,
          )
          .run(digest);
      });
    }
  }

  #normalizeMigratedReviewedTargets(): void {
    const rows = this.#authority
      .prepare(
        `SELECT draft_id
         FROM import_drafts
         WHERE state = 'reviewed' AND reviewed_target_choice_id IS NULL
           AND reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript')
           AND NOT EXISTS (
             SELECT 1 FROM import_abandonment_cleanup_intents i
             WHERE i.draft_id = import_drafts.draft_id
           )
         ORDER BY staged_at, draft_id`,
      )
      .all() as SqlRow[];
    for (const row of rows) {
      const draftId = asString(row.draft_id);
      let snapshot: DraftSnapshot;
      let confirmedTitle: string;
      let targetChoiceId: NewBookImportTargetChoiceId | null;
      try {
        snapshot = this.#loadDraftSnapshot(draftId);
        requireStore(snapshot.reviewedTitle !== null && snapshot.reviewDigest !== null, 'REVIEW_CHANGED', '旧版导入复核证据不完整。');
        confirmedTitle = safeTitle(snapshot.reviewedTitle);
        const plan = this.#requireFidelityPlan(snapshot);
        const identityFindings = this.#identityFindings(snapshot);
        targetChoiceId = reconstructReviewedTargetChoice(snapshot, confirmedTitle, plan, identityFindings);
      } catch {
        continue;
      }
      if (targetChoiceId === null) continue;
      this.#transaction(this.#authority, () => {
        this.#authority
          .prepare(
            `UPDATE import_drafts
             SET reviewed_target_choice_id = ?
             WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ?
               AND review_digest = ? AND reviewed_target_choice_id IS NULL`,
          )
          .run(targetChoiceId, draftId, snapshot.version, snapshot.reviewDigest);
      });
    }
  }

  #stagedProjection(snapshot: DraftSnapshot): StagedImportProjection { return importReviewOperations.stagedProjection(this.#importReviewRecordsHost, snapshot); }

  #emptyBookImportTarget(bookId: string): {
    bookId: string;
    stableIdentity: string;
    title: string;
    internalNumber: string | null;
    dimensionSetId: string;
    label: string;
    bookStateDigest: string;
  } { return importReviewOperations.emptyBookImportTarget(this.#importReviewRecordsHost, bookId); }

  #bookSourceImportTarget(bookId: string, sourceDigest: string): Omit<
    Extract<ResolvedSourceImportTarget, { kind: 'existing-book' }>,
    'choiceId' | 'sourceVersionDisposition' | 'reuseSourceVersionId'
  > & { exactSourceVersionId: string | null } { return importReviewOperations.bookSourceImportTarget(this.#importReviewRecordsHost, bookId, sourceDigest); }

  /**
   * The same file again onto the Source Version a Book already holds for it is a reuse, and a Source Version keeps the
   * reading its parser made (Issue #532). One an earlier parser read — a Book imported before this build's parser — cannot
   * take the file again under this one: the refusal names the parser change at the choice, not at the commit, and never
   * blames the file. Development stores before the first packaged release are disposable (ADR 0079 §1b).
   */
  #requireSameParser(sourceVersionId: string, snapshot: DraftSnapshot): void { return manuscriptReimportOperations.requireSameParser(this.#manuscriptReimportOperationsHost, sourceVersionId, snapshot); }

  #resolveSourceImportTarget(
    selection: SourceImportTargetSelection,
    snapshot: DraftSnapshot,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedSourceImportTarget { return importReviewOperations.resolveSourceImportTarget(this.#importReviewRecordsHost, selection, snapshot, identityFindings); }

  #reconstructReviewedSourceImportTarget(
    snapshot: DraftSnapshot,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedSourceImportTarget | null { return importReviewOperations.reconstructReviewedSourceImportTarget(this.#importReviewRecordsHost, snapshot, identityFindings); }

  #sourceImportReviewProjection(
    snapshot: DraftSnapshot,
    target: ResolvedSourceImportTarget,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
    commitAttemptId: string | null,
  ): ReviewBeforeSourceImportProjection { return importReviewOperations.sourceImportReviewProjection(this.#importReviewRecordsHost, snapshot, target, identityFindings, commitAttemptId); }

  #reconstructReviewedReimportTarget(snapshot: DraftSnapshot): ResolvedReimportTarget | null { return manuscriptReimportOperations.reconstructReviewedReimportTarget(this.#manuscriptReimportOperationsHost, snapshot); }

  #reimportReviewProjection(
    snapshot: DraftSnapshot,
    target: ResolvedReimportTarget,
    commitAttemptId: string | null,
  ): ReviewBeforeManuscriptReimportProjection { return manuscriptReimportOperations.reimportReviewProjection(this.#manuscriptReimportOperationsHost, snapshot, target, commitAttemptId); }

  #resolveImportTarget(
    selection: ImportTargetSelection,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedImportTarget { return importReviewOperations.resolveImportTarget(this.#importReviewRecordsHost, selection, identityFindings); }

  /**
   * The fidelity a review makes of the staged report with `disposition` for its text boxes. A choice the
   * report cannot state — merging a file that has no text box, or one a converter read — is refused.
   */
  /** A native Word row is always replayed from bounded original bytes before any reading is prepared. */
  #readWordIntake(snapshot: DraftSnapshot): { native: NativeDocxIntakeParse; original: Uint8Array } | null { return importRetentionOperations.readWordIntake(this.#importRetentionOperationsHost, snapshot); }

  #wordIntakePlan(snapshot: DraftSnapshot, target: ResolvedImportTarget, disposition: TextBoxDisposition,
    input: unknown, draftVersion: number): WordIntakePlan | null { return importRetentionOperations.wordIntakePlan(this.#importRetentionOperationsHost, snapshot, target, disposition, input, draftVersion); }

  /** Replace only the transient parse rows; the original compatibility/preview record remains independently pinned. */
  #replaceStagedReading(snapshot: DraftSnapshot, parsed: ParsedDocx | ParsedWordDocx,
    blocks: ReadonlyArray<Pick<ParsedDocxBlock, 'position' | 'kind' | 'level' | 'text' | 'digest' | 'graphemeLength' | 'note'>>,
    sources: StagedImportSources | null): void { return importRetentionOperations.replaceStagedReading(this.#importRetentionOperationsHost, snapshot, parsed, blocks, sources); }

  #requireWordStagedReading(snapshot: DraftSnapshot, word: WordIntakePlan): void { return importRetentionOperations.requireWordStagedReading(this.#importRetentionOperationsHost, snapshot, word); }

  /** Called after the real commit, fidelity, baseline and provenance parents exist in this transaction. */
  #commitWordEvidence(word: WordIntakePlan, input: { bookId: string; sourceVersionId: string; commitId: string;
    fidelityReviewId: string; revisionId: string; branchId: string; reviewDigest: string; createdAt: string }): number { return importRetentionOperations.commitWordEvidence(this.#importRetentionOperationsHost, word, input); }

  /** Derivation has its own provenance; a preserved /1–/3 Source Version keeps its original parser. */
  #manuscriptImportParser(bookId: string, commitId: string, sourceVersionId: string, parentParser: string, derivationParser: string): string { return importReviewOperations.manuscriptImportParser(this.#importReviewRecordsHost, bookId, commitId, sourceVersionId, parentParser, derivationParser); }

  /** Source-only/reimport consume the actual old reader, including its refusal, never Word preview rows. */
  #selectLegacyWordStaging(snapshot: DraftSnapshot): DraftSnapshot { return importRetentionOperations.selectLegacyWordStaging(this.#importRetentionOperationsHost, snapshot); }

  #reviewedFidelity(snapshot: DraftSnapshot, disposition: TextBoxDisposition, word?: WordIntakePlan): ReviewedFidelity { return importReviewOperations.reviewedFidelity(this.#importReviewRecordsHost, snapshot, disposition, word); }

  /**
   * The target and the fidelity a reviewed draft's digest was made from. The text-box choice is not
   * stored on the draft: the digest covers it, so the review is rebuilt under each choice the staged
   * report admits and only the one that reproduces the digest stands.
   */
  #reconstructReviewedImport(
    snapshot: DraftSnapshot,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): { target: ResolvedImportTarget; reviewed: ReviewedFidelity } | null { return importReviewOperations.reconstructReviewedImport(this.#importReviewRecordsHost, snapshot, identityFindings); }

  #reviewProjection(
    snapshot: DraftSnapshot,
    reviewDigest: string | null,
    reviewed: ReviewedFidelity,
    accepted: boolean,
    target: ResolvedImportTarget,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
    commitAttemptId: string | null,
  ): ReviewBeforeImportProjection { return importReviewOperations.reviewProjection(this.#importReviewRecordsHost, snapshot, reviewDigest, reviewed, accepted, target, identityFindings, commitAttemptId); }

  #identityFindings(snapshot: DraftSnapshot): ImportIdentityFindingProjection[] { return importReviewOperations.identityFindings(this.#importReviewRecordsHost, snapshot); }

  #loadDraftSnapshot(draftId: string): DraftSnapshot { return importReviewOperations.loadDraftSnapshot(this.#importReviewRecordsHost, draftId); }

  /**
   * Every path that would make an editable Manuscript refuses a format the product did not read as
   * one, whatever a client asks for, with the same reason the surface states (ADR 0072 §2).
   */
  #requireEditableFormat(snapshot: DraftSnapshot): void { return importReviewOperations.requireEditableFormat(this.#importReviewRecordsHost, snapshot); }

  #requireFidelityPlan(snapshot: DraftSnapshot): ImportFidelityPlan { return importReviewOperations.requireFidelityPlan(this.#importReviewRecordsHost, snapshot); }

  /**
   * The fidelity a reimport states of the staged report, and its plan. Since the chapter-level comparison (Issue #412,
   * plan slice S63; V2-UX-IMP-057) a reimport makes the file's comments and tracked changes 批注 and 修改建议 by their
   * author, as the first import does (MARK-009), so it states the report the file was staged with — the class
   * `完整保留` with the marks it makes as its count. The records made before it stated the class `不支持导入`
   * (`reimportFidelityReport`), and they still rebuild as they were.
   */
  #reimportFidelity(snapshot: DraftSnapshot): { fidelity: FidelityCategoryProjection[]; plan: ImportFidelityPlan } { return importReviewOperations.reimportFidelity(this.#importReviewRecordsHost, snapshot); }

  /**
   * A committed review read back and planned under the parser identity it was recorded with (ADR 0086),
   * with its recorded text-box choice required to be the disposition its classes state: a review with a
   * text box records exactly that choice, and any other records none.
   */
  #persistedFidelityPlan(
    fidelityReviewId: string,
    sourceDigest: string,
    sourceBytes: number,
    conversion: ManuscriptConversionProjection | null,
    parserIdentity: string,
    code: string,
    message: string,
  ): { categories: FidelityCategoryProjection[]; plan: ImportFidelityPlan } { return importReviewOperations.persistedFidelityPlan(this.#importReviewRecordsHost, fidelityReviewId, sourceDigest, sourceBytes, conversion, parserIdentity, code, message); }

  /** An imported-mark refusal (Issue #411), or a mark refusing to be pinned, is the caller's `StoreError`. */
  #importedMarkCall<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ImportedMarkError || error instanceof EditorialMarkError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  /** An import-retention refusal is the caller's `StoreError`, under its own code. */
  #retentionCall<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ImportRetentionError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  #loadStoredCommitResult(commitId: string): StoredImportCommitProjection { return importReviewOperations.loadStoredCommitResult(this.#importReviewRecordsHost, commitId); }

  #assertImportPostconditions(input: {
    bookId: string;
    dimensionSetId: string;
    manuscriptId: string;
    branchId: string;
    revisionId: string;
    sourceVersionId: string;
    fidelityReviewId: string;
    degradationDecisionId: string | null;
    workflowInstanceId: string;
    importRecordId: string;
    blockCount: number;
    characterCount: number;
    reviewDigest: string;
    fidelityPlan: ImportFidelityPlan;
    fidelityCategoryCount: number;
    /** Blocks of r1 no source paragraph maps: the later pieces of split paragraphs (Issue #1205). */
    unmappedBlocks: number;
    sourceDigest: string;
    sourceBytes: number;
    conversion: ManuscriptConversionProjection | null;
    parserIdentity: string;
    word?: { commitId: string; compiled: Extract<WordTrackedCompilation, { kind: 'ready' }>; noteCount: number };
  }): void { return importRetentionOperations.assertImportPostconditions(this.#importRetentionOperationsHost, input); }

  #assertForeignKeys(db: DatabaseSync): void {
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    requireStore(violations.length === 0, 'FOREIGN_KEY_FAILED', '持久化引用校验失败。');
  }

  async #withContentObjectLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#contentObjectLifecycleTail;
    let release = (): void => {};
    this.#contentObjectLifecycleTail = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    await previous;
    try {
      this.#assertAvailable();
      return await operation();
    } finally {
      release();
    }
  }

  async #withRecoveryObjectLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#recoveryObjectLifecycleTail;
    let release = (): void => {};
    this.#recoveryObjectLifecycleTail = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    await previous;
    try {
      this.#assertAvailable();
      return await operation();
    } finally {
      release();
    }
  }

  #markCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      // A card reads its mark's conflict records (Issue #57), which refuse to show a record that does not verify.
      // A card's decision reads its reason's entries (Issue #61, S26a), which refuse to show a record that does not verify.
      if (error instanceof EditorialMarkError || error instanceof ProposalConflictError || error instanceof DecisionFeedbackError) {
        throw new StoreError(error.code, error.message);
      }
      throw error;
    }
  }

  #boundedCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof BoundedStoreFatalError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      if (error instanceof BoundedStoreError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  /**
   * An export call (Issue #413) reaches the export ledger, the canonical form it records in and the bounded
   * manuscript's checkpoint: each refusal is the caller's `StoreError`, and a fatal bounded error or a failed
   * rollback poisons the store exactly as it does anywhere else.
   */
  async #exportCall<T>(operation: () => Promise<T>): Promise<T> {
    this.#assertAvailable();
    try {
      return await operation();
    } catch (error) {
      // A missing or changed Word source mapping is a refusal of this export, never a fallback.
      if (error instanceof ExportLedgerError || error instanceof AnalysisError || error instanceof ImportRetentionError) {
        throw new StoreError(error.code, error.message);
      }
      if (error instanceof BoundedStoreFatalError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      if (error instanceof BoundedStoreError) throw new StoreError(error.code, error.message);
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  /** A content object's exact bytes, verified against the digest it is stored under. */
  async #readContentObject(objectDigest: string): Promise<Uint8Array> {
    const object = one(
      this.#authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').all(objectDigest) as SqlRow[],
      'EXPORT_SOURCE_MISSING',
      '原文件对象记录缺失，无法导出。',
    );
    const path = this.#contentObjectPath(objectDigest, asString(object.relative_key));
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(path));
    } catch {
      throw new ExportLedgerError('EXPORT_SOURCE_MISSING', '原文件对象无法读取，无法导出。');
    }
    requireStore(bytes.byteLength === asNumber(object.byte_length) && sha256(bytes) === objectDigest,
      'EXPORT_SOURCE_MISSING', '原文件对象校验失败，无法导出。');
    return bytes;
  }

  async #artifactCall<T>(operation: () => Promise<T>): Promise<T> {
    this.#assertAvailable();
    try {
      return await operation();
    } catch (error) {
      if (error instanceof EditorialWorkspaceProfileFatalError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      if (error instanceof EditorialWorkspaceProfileError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  #taskCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof TaskAuthorizationError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  /**
   * A Review Run call reaches the category ledgers, the mark store and the bounded manuscript store in
   * one breath, so every refusal any of them raises is the caller's `StoreError`, and a fatal bounded
   * error poisons the store exactly as it does anywhere else.
   */
  #reviewCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      // A guideline version that no longer reads refuses the review's configuration in its own words (Issue #427 review).
      // So does a Series record that no longer reads (Issue #64 review), should one reach here past 书系一致性's own reading.
      if (error instanceof ReviewRunError || error instanceof AnalysisError || error instanceof EditorialMarkError || error instanceof ProposalConflictError ||
        error instanceof ReviewGuidelineError || error instanceof SeriesError || error instanceof SeriesKnowledgeError || error instanceof SeriesExclusionError) {
        throw new StoreError(error.code, error.message);
      }
      if (error instanceof BoundedStoreFatalError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      if (error instanceof BoundedStoreError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  /**
   * A 交付物 call: a refusal of the publication ledger (or of the canonical form it records in) is the
   * caller's `StoreError`; a rollback that itself failed leaves the connection in doubt and poisons the
   * store, exactly as `#transaction` does.
   */
  #publicationCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof PublicationVersionError || error instanceof AnalysisError || error instanceof MaintenanceCaseError) {
        throw new StoreError(error.code, error.message);
      }
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  /**
   * A 稿件冲突 call reaches the conflict ledger and the mark store: a refusal of either (or of the canonical
   * form the ledger records in) is the caller's `StoreError`; a rollback that itself failed leaves the
   * connection in doubt and poisons the store, exactly as `#publicationCall` does.
   */
  #conflictCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof ProposalConflictError || error instanceof EditorialMarkError || error instanceof AnalysisError) {
        throw new StoreError(error.code, error.message);
      }
      if (error instanceof AggregateError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      throw error;
    }
  }

  #analysisCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof AnalysisError) throw new StoreError(error.code, error.message);
      if (error instanceof BoundedStoreFatalError) {
        this.#poisoned = true;
        throw new StoreFatalError(error);
      }
      if (error instanceof BoundedStoreError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  #transaction<T>(db: DatabaseSync, operation: () => T): T {
    this.#assertAvailable();
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch (rollbackError) {
        this.#poisoned = true;
        throw new StoreFatalError(new AggregateError([error, rollbackError], 'SQLite rollback failed.'));
      }
      throw error;
    }
  }

  #assertAvailable(): void {
    if (this.#poisoned) throw new StoreFatalError(new Error('Authority store is poisoned.'));
  }

}
