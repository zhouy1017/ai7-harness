import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, createReadStream, existsSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { copyFile, lstat, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { J03_TASK_GOAL, LEARNING_MATERIAL_KEY_PATTERN, MAX_BLOCK_CODE_UNITS, MAX_FRAME_BYTES, MAX_LEARNING_MATERIALS_PAGE, MAX_PRODUCTION_DOCUMENT_BLOCKS, MAX_REIMPORT_EXCERPT_GRAPHEMES, MAX_REIMPORT_EXCERPTS_PER_SIDE, MAX_REIMPORT_RECORD_ITEMS, REIMPORT_GROUP_VERB_LABELS, TASK_PLAN_KINDS, fidelityStatusLabel, isReviewCategoryKindId, resolveMilestonePurpose } from '../shared/protocol.js';
import type {
  InspectTaskPlanInput,
  TaskPlanProjection,
  GlobalAttentionProjection,
  BookTasksProjection,
  ApproveManuscriptExportInput,
  InspectManuscriptExportReceiptInput,
  StageManuscriptExportInput,
  ManuscriptExportStageProjection,
  ManuscriptExportPreparationProjection,
  ManuscriptExportReceiptProjection,
  ManuscriptExportReviewProjection,
  PrepareManuscriptExportInput,
  ReviewManuscriptExportInput,
  DeliverablesProjection,
  ProposalConflictDraftSaveProjection,
  ProposalConflictProjection,
  ProposalConflictResolutionProjection,
  ProposalConflictBindingInput,
  ResolveProposalConflictInput,
  SaveProposalConflictDraftInput,
  DesignatePublicationVersionInput,
  CreateProductionDocumentInput,
  DecideProductionDocumentTypeInput,
  ProductionDocumentResultProjection,
  SaveProductionDocumentVersionInput,
  RecordProductionDocumentDeliveryInput,
  TransitionProductionDocumentPhaseInput,
  BookDeliveryPackageProjection,
  BookDeliveryPackageResultProjection,
  PrepareBookDeliveryPackageInput,
  ApproveBookDeliveryPackageExportInput,
  BookPeopleResultProjection,
  BookSummaryFilter,
  UpdateBookPeopleInput,
  ReviewGuidelinePreviewProjection,
  ReviewGuidelinesProjection,
  ExemplarBookCursor,
  LibraryMaterialCursor,
  LibraryMaterialDecisionInput,
  LibraryMaterialKind,
  LibraryMaterialPreviewProjection,
  LibraryMaterialProjection,
  LibraryMaterialsProjection,
  EvaluationProfilesProjection,
  EvaluationWorkspaceProjection,
  AnalysisFeedbackProjection,
  RecordAnalysisFeedbackInput,
  ExemplarsProjection,
  KnowledgeProceduresProjection,
  AppendMaintenanceCaseRevisionInput,
  InspectMaintenanceCaseInput,
  ListMaintenanceCasesInput,
  MaintenanceCasePageProjection,
  MaintenanceCaseProjection,
  MaintenanceCaseResultProjection,
  RecordMaintenanceCaseInput,
  SaveMaintenanceErrataInput,
  BookDeliveryPackageExportProjection,
  BookDeliveryPackageExportResultProjection,
  BookDeliveryPackageExportReviewProjection,
  PrepareBookDeliveryPackageExportInput,
  ReviewBookDeliveryPackageExportInput,
  ProductionDocumentsProjection,
  MilestonePurposeKind,
  PublicationDesignationProjection,
  BookCreationCommitProjection,
  BookCreationReviewProjection,
  BookHistoryCursor,
  BookSummaryCursor,
  BookSummaryPageProjection,
  BookManuscriptAnchorProjection,
  BookRecordPresentation,
  BookWorkOverviewProjection,
  EditorialWorkspaceProfileProjection,
  FidelityCategoryProjection,
  HistoricalRevisionProjection,
  ImportCommitProjection,
  ImportDegradationDecisionReviewProjection,
  ImportDraftRecoveryProjection,
  ImportIdentityFindingProjection,
  ImportStartupProjection,
  ImportTargetSelection,
  ManuscriptImportCommitProjection,
  ManuscriptBlockProjection,
  ManuscriptReimportCommitProjection,
  ManuscriptReimportTargetSelection,
  ApplyChangeSuggestionBatchInput,
  ApplyChangeSuggestionInput,
  CreateEditorialMarkInput,
  EditorialMarkCardProjection,
  EditorialMarkCommandProjection,
  JournalAcknowledgement,
  JournalEditInput,
  ManuscriptApplyCommandProjection,
  ManuscriptApplyOutcomeProjection,
  ManuscriptConversionProjection,
  ManuscriptRailProjection,
  ManuscriptEntryPositionProjection,
  ManuscriptWindowProjection,
  ModelCredentialOperationState,
  ModelServiceConnectionProjection,
  RecordChangeSuggestionDecisionInput,
  RecordProposalDecisionFeedbackInput,
  DecideLearningMaterialInput,
  FeedbackHistoryEntryProjection,
  EvaluationCalibrationBookProjection,
  BookSeriesProjection,
  ChangeSeriesMembershipInput,
  CreateSeriesInput,
  PreviewSeriesMembershipChangeInput,
  SeriesCandidatesCursor,
  SeriesCandidatesProjection,
  SeriesCreationProjection,
  SeriesHistoryCursor,
  SeriesHistoryPageProjection,
  SeriesListCursor,
  SeriesListProjection,
  SeriesMemberProjection,
  SeriesMembersCursor,
  SeriesMembersPageProjection,
  SeriesMembershipChangeProjection,
  SeriesMembershipChangeResultProjection,
  SeriesMembershipPreviewProjection,
  SeriesProjection,
  EditSeriesKnowledgeCandidateInput,
  PromoteSeriesKnowledgeInput,
  ProposeSeriesKnowledgeInput,
  SeriesKnowledgeCandidateProjection,
  SeriesKnowledgeCandidatesCursor,
  SeriesKnowledgeCandidatesPageProjection,
  SeriesKnowledgeItemProjection,
  SeriesKnowledgeItemsCursor,
  SeriesKnowledgeItemsPageProjection,
  SeriesKnowledgeRevisionsProjection,
  SeriesKnowledgePromotionProjection,
  SeriesKnowledgeProposalProjection,
  SeriesKnowledgeProvenanceProjection,
  SeriesKnowledgeReviewProjection,
  SeriesKnowledgeRevisionProjection,
  SeriesKnowledgeSpanInput,
  SeriesKnowledgeTarget,
  DataVersionProjection,
  DatabaseExportActivityProjection,
  DatabaseExportContentsProjection,
  DatabaseExportPreparationProjection,
  DatabaseExportReceiptProjection,
  DatabaseExportsProjection,
  ScheduledBackupsProjection,
  SetScheduledBackupInput,
  DatabaseImportPreviewProjection,
  DatabaseReplacementsProjection,
  EvaluationCalibrationProjection,
  RecordPublicationActualsInput,
  SetEvaluationPreferencesInput,
  FeedbackHistoryProjection,
  LearningMaterialCursor,
  LearningMaterialProjection,
  LearningMaterialsBookProjection,
  LearningMaterialsProjection,
  RecordProposalDecisionReasonInput,
  ReverseAppliedChangeSuggestionInput,
  UpdateEditorialMarkInput,
  NewBookImportTargetChoiceId,
  OriginalFileAccessProjection,
  ReviewBeforeImportProjection,
  ReviewBeforeSourceImportProjection,
  ReviewBeforeManuscriptReimportProjection,
  ReimportLineageSourceVersionPageProjection,
  EditorialMarkKind,
  ReimportGroupProjection,
  ReimportGroupVerb,
  ReimportMappingPageProjection,
  SourceFormat,
  SourceImportCommitProjection,
  SourceImportRetainedBoundaryLabel,
  SourceImportTargetSelection,
  StagedImportProjection,
  ContinueImportProjection,
  DurableHistoryProjection,
  ManuscriptWindowTarget,
  MilestoneProjection,
  OutlineProjection,
  PriorWorkItemProjection,
  ReplacementCommitProjection,
  ReplacementDismissalProjection,
  ReplacementPreviewProjection,
  RecoveryComparisonProjection,
  RecoveryDeferralProjection,
  RecoveryRestorationProjection,
  RecoverySelection,
  RecoveryWindowProjection,
  RecoveryWindowTarget,
  SearchResultsProjection,
  SearchSummaryProjection,
  StartupProjection,
  BookWorkbenchRoute,
  ResolvedBookWorkbenchRoute,
  ForegroundExecutionBoundaryProjection,
  LaunchPolicyProjection,
  TaskAuthorizationProjection,
  BaselineAnalysisGoal,
  BaselineAnalysisProjection,
  BaselineAnalysisResultSetRevisionProjection,
  BaselineAnalysisRunState,
  BaselineAnalysisQuickStartProjection,
  BaselineAnalysisUpdateActionProjection,
  BaselineAnalysisUpdateMode,
  BaselineAnalysisUpdateRequest,
  DefaultExecutionRulePattern,
  DefaultExecutionRuleProjection,
  DefaultExecutionRuleReference,
  DefaultExecutionRulesProjection,
  TaskPlanDefaultRuleProjection,
  FactualReviewGoal,
  FactualReviewProjection,
  ReviewCategoryGoal,
  ReviewCategoryProjection,
  ReviewCategoryTaskRequest,
  ReviewFindingPageRequest,
  ReviewRunScopeRequest,
  ReviewWorkspaceProjection,
} from '../shared/protocol.js';
import {
  AnalysisError,
  BaselineAnalysisStore,
  type AnalysisPreparationResult,
  type BaselineAnalysisPreparationResult,
  type BaselineAnalysisRouteFacts,
  type ProgressReader,
} from './analysis/baseline-analysis-store.js';
import { factualReviewKindDefinition, type AnalysisKindDefinition } from './analysis/kind-definition.js';
import { convertDocManuscript, isDocConversionRefusal } from './doc-manuscript.js';
import {
  buildFidelityReport,
  deriveImportFidelityPlan,
  DOCX_PARSER_IDENTITY,
  isCleanTracerFidelity,
  MAX_ARCHIVE_BYTES,
  parseDocx,
  withTextBoxDisposition,
  type FidelityConversionIdentity,
  type ImportFidelityPlan,
  type ParsedDocx,
  type ParsedDocxBlock,
  type TextBoxDisposition,
} from './docx.js';
import {
  MANUSCRIPT_FORMAT_HEAD_BYTES,
  editableImport,
  identifyManuscriptFormat,
  manuscriptObjectExtension,
} from './manuscript-format.js';
import {
  convertTextManuscript,
  isTextConversionRefusal,
  type ConversionLoss,
} from './text-manuscript.js';
import { initializeManuscriptEffectSchema, ManuscriptApplyStore } from './manuscript-apply.js';
import { initializeReviewRunSchema, ReviewRunError, ReviewRunStore, type ReviewRunPreparationProgress } from './review/review-runs.js';
import { initializePublicationVersionSchema, PublicationVersionError, PublicationVersionStore } from './publication-versions.js';
import {
  GLOBAL_ATTENTION_READ_LIMIT,
  GlobalAttentionError,
  composeBookTasks,
  composeGlobalAttention,
  readImportAttention,
  readRecoveryAttention,
  recentWindowStart,
  type LearningMaterialsAttentionReading,
} from './global-attention.js';
import { ALWAYS_ONLINE, type TaskPlanConnectivity } from './connectivity.js';
import {
  baselineAnalysisPlan,
  defaultRuleBindingRows,
  fixedTaskPlan,
  noDefaultRule,
  reviewRunPlan,
  TaskPlanError,
  withConnectionReadiness,
  withConnectivityReadiness,
  withAnswerBlockers,
  withResumeBlockers,
  RESUME_BLOCKED_BINDING,
  withWaitingReason,
  type WaitingFor,
  RESUME_BLOCKED_CONNECTION,
  RESUME_BLOCKED_OFFLINE,
  ANSWER_BLOCKED_CONNECTION,
  ANSWER_BLOCKED_OFFLINE,
  RESUME_BLOCKED_SLOT,
  type BaselineStoppedRunFacts,
} from './task-plan.js';
import { decisionResolvesConflict, initializeProposalConflictSchema, ProposalConflictError, ProposalConflictStore, readConflictAttention } from './proposal-conflicts.js';
import {
  ImportRetentionError,
  initializeImportRetentionSchema,
  recordTextBoxChoice,
  recordedTextBoxChoice,
  stageImportSources,
  stagedImportSourcesMatch,
  stagedTextBoxParagraphs,
  type StagedImportSources,
  type StagedTextBoxParagraph,
} from './import-retention.js';
import {
  ImportedMarkError,
  createImportedMarks,
  initializeImportedMarkSchema,
  stageImportedMarks,
  stagedImportedMarksMatch,
} from './imported-marks.js';
import { ExportLedgerError, ManuscriptExportStore, initializeExportLedgerSchema } from './manuscript-export.js';
import {
  DEFAULT_EXECUTION_RULES_STATEMENT,
  DefaultExecutionRuleError,
  DefaultExecutionRuleLedger,
  QUICK_START_DEVELOPER_LIVE,
  QUICK_START_MODE_UNAVAILABLE,
  QUICK_START_NEEDS_CONNECTION,
  QUICK_START_NOT_READY,
  QUICK_START_OFFLINE,
  QUICK_START_PLAN_CHANGED,
  QUICK_START_RANGE_REASON,
  QUICK_START_RULE_CHANGED,
  QUICK_START_SLOT_BUSY,
  RULE_STATE_LABELS,
  SET_RULE_BUDGET,
  SET_RULE_CHANGED,
  SET_RULE_DEVELOPER_LIVE,
  SET_RULE_EDITED,
  SET_RULE_FIRST_BASELINE,
  SET_RULE_RANGE,
  defaultExecutionRuleBindingOf,
  defaultExecutionRuleDoes,
  defaultExecutionRuleDrift,
  defaultExecutionRuleReference,
  initializeDefaultExecutionRuleSchema,
  isDefaultExecutionRulePattern,
  quickStartNoRuleReason,
  ruleDriftReason,
  setRuleAlreadyReason,
  type DefaultExecutionRuleRecord,
} from './default-execution-rules.js';
import { initializeRunCheckpointSchema } from './analysis/run-checkpoints.js';
import { initializeClarificationSchema } from './analysis/clarifications.js';
import { initializeReimportGroupSchema } from './reimport-group-ledger.js';
import { initializeProductionDocumentDeliverySchema, initializeProductionDocumentSchema } from './production-document-ledger.js';
import { BookDeliveryPackageError, BookDeliveryPackages, initializeBookDeliveryPackageSchema } from './book-delivery-packages.js';
import { MaintenanceCaseError, MaintenanceCases, initializeMaintenanceCaseSchema } from './maintenance-cases.js';
import { BookPeople, BookPeopleError, initializeBookPeopleSchema } from './book-people.js';
import { ReviewGuidelineError, ReviewGuidelineLedger, initializeReviewGuidelineSchema, readGuidelineFile } from './review-guidelines.js';
import { LibraryMaterialError, LibraryMaterialLedger, initializeLibraryMaterialSchema, libraryMaterialTitle } from './library-materials.js';
import { EvaluationError, EvaluationRecords, initializeEvaluationRecordSchema } from './evaluation-records.js';
import { AnalysisFeedbackError, AnalysisFeedbackLedger, analysisFeedbackItems, initializeAnalysisFeedbackSchema } from './analysis-feedback.js';
import { DecisionFeedbackError, DecisionFeedbackLedger, initializeDecisionFeedbackSchema } from './decision-feedback.js';
import {
  DIMENSION_LABELS,
  DISPOSITION_LABELS,
  JUDGMENT_LABELS,
  LEARNING_ELIGIBILITY_BASIS,
  LearningEligibilityError,
  analysisReasonLabel,
  LearningEligibilityLedger,
  analysisFeedbackCandidate,
  feedbackHistoryPage,
  feedbackReasonExcerpt,
  initializeLearningEligibilitySchema,
  learningMaterialDigest,
  learningMaterialOrder,
  proposalDecisionCandidate,
  reviewDispositionCandidate,
  type LearningMaterialCandidate,
} from './learning-eligibility.js';
import { reviewCategoryEntry } from './review/category-configuration.js';
import { EvaluationCalibrationError, EvaluationCalibrationLedger, initializeEvaluationCalibrationSchema } from './evaluation-calibration.js';
import {
  SeriesError,
  SeriesLedger,
  initializeSeriesSchema,
  seriesMemberAbsent,
  seriesMemberAlready,
  seriesLearningFacts,
  seriesMembershipImpact,
  seriesHistoryOrder,
  seriesPreviewDigest,
  weighedPage,
  type StoredMembershipChange,
  type StoredSeries,
} from './series.js';
import { CALIBRATION_MIN_ADJUSTMENTS, PREDICTION_MIN_BOOKS_WITH_ACTUALS, calibrationActive, predictionAvailable } from '../shared/evaluation-calibration.js';
import {
  MAX_FEEDBACK_HISTORY_ENTRIES,
  MAX_BOOK_SERIES_MEMBERSHIPS,
  MAX_SERIES_CANDIDATE_QUERY_CHARACTERS,
  MAX_SERIES_CANDIDATES_PAGE,
  MAX_SERIES_HISTORY_PAGE,
  MAX_SERIES_LIST_PAGE,
  MAX_SERIES_MEMBERS_PAGE,
  MAX_SERIES_TITLE_CHARACTERS,
  MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS,
  MAX_SERIES_KNOWLEDGE_CANDIDATES_PAGE,
  MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN,
  MAX_SERIES_KNOWLEDGE_ITEMS_PAGE,
  MAX_SERIES_KNOWLEDGE_QUERY_CHARACTERS,
  MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE,
  MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS,
  PUBLICATION_ACTUALS_RECORDED_STATE,
  SERIES_KNOWLEDGE_CLASS_LABELS,
  SERIES_KNOWLEDGE_CONFLICT_LABEL,
  SERIES_KNOWLEDGE_REUSE_LABELS,
  SERIES_KNOWLEDGE_REUSE_SCOPES,
} from '../shared/protocol.js';
import {
  type ClassifiedSchemaRevision,
  DATA_VERSION,
  DATA_VERSION_FROZEN,
  dataVersionAt,
  DataVersionError,
  DataVersionLedger,
  initializeDataVersionSchema,
  MAX_STORE_VERSIONS_LISTED,
  readSoftwareVersion,
  SCHEMA_REVISION_CLASSES,
} from './data-version.js';
import { DatabaseExportError, DatabaseExports, initializeDatabaseExportSchema } from './database-exports.js';
import { ScheduledBackupError, ScheduledBackups, backupLocationFor, initializeScheduledBackupSchema } from './scheduled-backups.js';
import { backUpBeforeUpgrade, completeUpgrade } from './upgrade-backup.js';
import { DatabasePackageError } from './database-package-reader.js';
import {
  DatabaseReplacementError,
  DatabaseReplacements,
  completeReplacement,
  initializeDatabaseReplacementSchema,
  openWithPendingReplacement,
} from './database-replacement.js';
import { DatabaseMergeError, initializeDatabaseMergeSchema } from './database-merge.js';
import {
  SeriesKnowledgeError,
  SeriesKnowledgeLedger,
  initializeSeriesKnowledgeSchema,
  isSeriesKnowledgeClass,
  isSeriesKnowledgeReuseScope,
  SERIES_KNOWLEDGE_PAGE_BYTES,
  knowledgeQuoteExcerpt,
  seriesKnowledgeConflicts,
  seriesKnowledgeContent,
  seriesKnowledgeReviewDigest,
  seriesKnowledgeSubject,
  type FoundConflict,
  type ResolvedTarget,
  type StoredCandidate,
  type StoredItem,
  type StoredProvenance,
  type StoredRevision,
} from './series-knowledge.js';
import { readExemplars } from './exemplars.js';
import { readKnowledgeProcedures } from './knowledge-procedures.js';
import {
  ProductionDocumentOriginError,
  initializeProductionDocumentOriginSchema,
  recordProductionDocumentOrigin,
} from './production-document-origins.js';
import {
  BookDeliveryPackageExportError,
  BookDeliveryPackageExports,
  initializeBookDeliveryPackageExportSchema,
} from './book-delivery-package-exports.js';
import {
  ProductionDocumentWorkflow, ProductionDocumentWorkflowError, initializeProductionDocumentWorkflowSchema, type WorkflowProfilePin,
} from './production-document-workflow.js';
import {
  PRODUCTION_DOCUMENTS_NEED_MANUSCRIPT, ProductionDocumentError, ProductionDocuments, productionDocumentMarksNotCarried,
} from './production-documents.js';
import type { WaitingRunBlockCause } from './reconnect-preflight.js';
import { productionDocumentType } from './production-document-types.js';
import { REIMPORT_GROUP_VERBS, groupReimportMappings, reimportGroupResolutions, reimportGroupVerbs } from './reimport-groups.js';
import type { ReviewRunDriveSteps } from './review/review-run-driver.js';
import { reviewCategoryContractInput, type ReviewCategoryConfigurationEntry } from './review/category-configuration.js';
import { reviewCategoryKindDefinition } from './review/review-category-kind.js';
import {
  EditorialMarkError,
  EditorialMarkStore,
  initializeEditorialMarkSchema,
  followReimportedMarks,
  resolveBranchMarksAfterRewrite,
  workingBlockDigests,
  type ReimportMarkOutcome,
  type ReimportMarkRow,
  type ProducedEditorialMarkInput,
} from './editorial-marks.js';
import {
  BoundedManuscriptStore,
  BoundedStoreError,
  BoundedStoreFatalError,
  initializeBoundedSchema,
  initializeManuscriptEntryPositionSchema,
  MODEL_SERVICE_CONNECTION_SCHEMA_SQL,
  validateManuscriptReimportSchemaTruth,
  validateSourceImportSchemaTruth,
  type RecoverySnapshotCursor,
  type RecoverySnapshotRecord,
  type ReimportCheckpointBinding,
  type VerifiedRecoverySnapshot,
} from './bounded-manuscript.js';
import { RecoveryObjectStore } from './recovery-objects.js';
import {
  createCanonicalExternalDataRoot,
  ensureCanonicalDataDirectory,
  inspectCanonicalDataFile,
} from '../shared/data-root.js';
import {
  loadBuiltInManuscriptProfile,
  type BuiltInWorkflowProfile,
} from './native-workflow-profile.js';
import {
  EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION,
  EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
  EditorialWorkspaceProfileError,
  EditorialWorkspaceProfileFatalError,
  EditorialWorkspaceProfileStore,
  initializeEditorialWorkspaceProfileSchema,
  validateEditorialWorkspaceProfileNativeSchema,
  validateEditorialWorkspaceProfileSchema,
} from './editorial-workspace-profile.js';
import {
  initializeTaskAuthorizationSchema,
  J03_TASK_AUTHORIZATION_SCHEMA_VERSION,
  EDITORIAL_MARK_SCHEMA_VERSION,
  EDITORIAL_REVIEW_SCHEMA_VERSION,
  MANUSCRIPT_EFFECT_SCHEMA_VERSION,
  J04_BASELINE_ANALYSIS_SCHEMA_VERSION,
  MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION,
  MANUSCRIPT_INTAKE_SCHEMA_VERSION,
  PUBLICATION_VERSION_SCHEMA_VERSION,
  PROPOSAL_CONFLICT_SCHEMA_VERSION,
  IMPORT_RETENTION_SCHEMA_VERSION,
  IMPORTED_MARK_SCHEMA_VERSION,
  EXPORT_LEDGER_SCHEMA_VERSION,
  CONNECTIVITY_WAIT_SCHEMA_VERSION,
  DEFAULT_EXECUTION_RULE_SCHEMA_VERSION,
  RUN_CANCELLATION_SCHEMA_VERSION,
  RUN_CONTINUATION_SCHEMA_VERSION,
  PLAN_EDIT_SCHEMA_VERSION,
  CLARIFICATION_SCHEMA_VERSION,
  REIMPORT_GROUP_SCHEMA_VERSION,
  PRODUCTION_DOCUMENT_SCHEMA_VERSION,
  PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION,
  BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION,
  PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION,
  BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION,
  PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION,
  MAINTENANCE_CASE_SCHEMA_VERSION,
  BOOK_PEOPLE_SCHEMA_VERSION,
  REVIEW_GUIDELINE_SCHEMA_VERSION,
  LIBRARY_MATERIAL_SCHEMA_VERSION,
  EVALUATION_RECORD_SCHEMA_VERSION,
  ANALYSIS_FEEDBACK_SCHEMA_VERSION,
  DECISION_FEEDBACK_SCHEMA_VERSION,
  LEARNING_ELIGIBILITY_SCHEMA_VERSION,
  EVALUATION_CALIBRATION_SCHEMA_VERSION,
  SERIES_SCHEMA_VERSION,
  SERIES_KNOWLEDGE_SCHEMA_VERSION,
  STORE_VERSION_SCHEMA_VERSION,
  DATABASE_EXPORT_SCHEMA_VERSION,
  SCHEDULED_BACKUP_SCHEMA_VERSION,
  DATABASE_REPLACEMENT_SCHEMA_VERSION,
  DATABASE_MERGE_SCHEMA_VERSION,
  SUCCESSIVE_TASK_SCHEMA_VERSION,
  TASK_AUTHORIZATION_SCHEMA_VERSION,
  TEXT_CONVERSION_SCHEMA_VERSION,
  FACTUAL_REVIEW_SCHEMA_VERSION,
  TaskAuthorizationError,
  TaskAuthorizationStore,
  validateTaskAuthorizationSchema,
  type TaskPreparationResult,
} from './task-authorization.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = UUID_PATTERN;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const CORE_SCHEMA_VERSION = 5;
const EDITOR_SCHEMA_VERSION = 6;
const RECOVERY_SCHEMA_VERSION = 7;
const SCHEMA_VERSION = 8;
const SOURCE_IMPORT_SCHEMA_VERSION = 9;
const MANUSCRIPT_REIMPORT_SCHEMA_VERSION = 10;
const MODEL_SERVICE_SCHEMA_VERSION = 11;
const BOOK_SUMMARY_PAGE_SIZE = 20;
const BOOK_HISTORY_PAGE_SIZE = 8;
const INGEST_BATCH_SIZE = 256;
const REIMPORT_MAPPING_BATCH_SIZE = 64;
const REIMPORT_COMMIT_FILE_BATCH_BYTES = 256 * 1024;
const REIMPORT_MAX_JSON_BLOCK_BYTES = MAX_BLOCK_CODE_UNITS * 6;
const REIMPORT_WIRE_HEADROOM_BYTES = 4_096;
const REIMPORT_MAPPING_PAGE_SIZE = 4;
/** Rows of the chapter-level comparison per page (Issue #412, S63): each shows at most three excerpts a side. */
const REIMPORT_GROUP_PAGE_SIZE = 10;
const REIMPORT_GROUPING = 'ai7.reimport-groups/1' as const;
const REIMPORT_IDENTITY_CANDIDATE_PAGE_SIZE = 16;
const REIMPORT_LINEAGE_CHOICE_LIMIT = 32;
const LEGACY_WORKFLOW_PROFILE = {
  id: 'ai7.manuscript.editorial.zh-CN',
  name: '基础书稿编辑流程',
  version: '1.0.0',
  phases: ['接收与准备', '来源建设', '起草', '审阅与核查', '定稿', '交付', '维护'],
} as const;
const BASELINE_EDITORIAL_DIMENSION_SET = {
  profileId: 'ai7.editorial.baseline',
  name: '基础图书编辑维度集',
  profileVersion: '1.0.0',
  weightSemantics: '中性起始权重；非穷尽评分量表',
  dimensions: [
    { id: 'literary-quality-voice', label: '文学质量与声音', weight: 1 },
    { id: 'theme-values-social-cultural-context', label: '主题、价值观与社会文化语境', weight: 1 },
    { id: 'structure-narrative-coherence', label: '结构与叙事连贯性', weight: 1 },
    { id: 'chinese-language-style', label: '中文语言与风格', weight: 1 },
    { id: 'factual-source-integrity', label: '事实与来源完整性', weight: 1 },
    { id: 'readership-market-positioning', label: '读者与市场定位', weight: 1 },
    { id: 'legal-rights-ethical-policy-risk', label: '法律、权利、伦理与出版政策风险', weight: 1 },
    { id: 'production-cross-deliverable-consistency', label: '制作与跨交付物一致性', weight: 1 },
  ],
} as const;
const BASE_RECORDS_TO_CREATE = [
  '图书与稳定标识',
  '图书编辑维度集（8 项）',
  '源材料版本与来源记录',
  '导入保真审阅',
  '主稿件',
  '稿件分支',
  '稿件修订版 r1 与有序稳定内容块',
  // ADR 0086 §3: which source paragraph each block of r1 came from, so an unedited block can be
  // restored from it on export.
  '来源段落对应',
  '工作流程实例与精确方案版本绑定',
  '稿件导入记录',
] as const;
const NON_EFFECTS = [
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本',
  '不创建公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
  // ADR 0086 §3: the original stays whole with the Source Version; import reads it and changes nothing.
  '不修改所选原文件',
] as const;
const CLEAN_IMPORT_NON_EFFECT = '符合当前范围的导入不创建导入降级决定';
const EMPTY_BOOK_NON_EFFECTS = [
  '不创建稿件、来源、修订版、工作流实例或导入记录',
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本',
  '不创建公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
] as const;
const DEGRADATION_DECISION_SCHEMA = 'ai7.import-degradation-decision/1';
const SOURCE_IMPORT_RECORD_SCHEMA = 'ai7.source-import-record/1';
const SOURCE_IMPORT_RETAINED_BOUNDARY_LABEL =
  '保留完整所选 DOCX 文件及本地解析出的完整内容与结构身份' as const;
/** An original kept whole with no local parse claims no content or structure identity (ADR 0072 §2). */
const SOURCE_IMPORT_RETAINED_ORIGINAL_BOUNDARY_LABEL =
  '保留完整所选原始文件及其精确身份；未进行本地解析' as const;

function retainedBoundaryLabel(parsed: boolean): SourceImportRetainedBoundaryLabel {
  return parsed ? SOURCE_IMPORT_RETAINED_BOUNDARY_LABEL : SOURCE_IMPORT_RETAINED_ORIGINAL_BOUNDARY_LABEL;
}
const SOURCE_IMPORT_NON_EFFECTS = [
  '不创建稿件',
  '不创建稿件修订版',
  '不创建工作流实例',
  '不创建运行来源范围',
  '不创建事实状态或事实核查结论',
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本、公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
] as const;
const MANUSCRIPT_REIMPORT_RECORD_SCHEMA = 'ai7.manuscript-reimport-record/1';
const MANUSCRIPT_REIMPORT_NON_EFFECTS = [
  '不创建第二份主稿件或并行稿件分支',
  '不把来源关系未确认解释为导入阻断、来源确认或血缘证明',
  '不执行模糊匹配或通用合并',
  '不创建里程碑、恢复快照、恢复决定或恢复注意事项',
  '不改变图书稳定标识、内部编号、编辑维度集或工作流程实例',
  '不创建运行来源范围、事实状态或事实核查结论',
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本、公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
] as const;

const SOURCE_IMPORT_SCHEMA_SQL = `CREATE TABLE source_import_records (
  source_import_record_id TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL UNIQUE,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('new-book', 'existing-book')),
  source_version_disposition TEXT NOT NULL CHECK(source_version_disposition IN ('created', 'reused-same-book')),
  retained_boundary_json TEXT NOT NULL,
  named_non_effects_json TEXT NOT NULL,
  record_digest TEXT NOT NULL UNIQUE CHECK(length(record_digest) = 64),
  imported_at TEXT NOT NULL
) STRICT`;
const SOURCE_PROVENANCE_V9_SCHEMA_SQL = `CREATE TABLE source_provenance (
  provenance_id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
  locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
  sanitized_identity TEXT NOT NULL,
  parser_identity TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT`;
/**
 * Revision 18's Source Version relations (ADR 0072 §2). A Source Version may now be an original the
 * product retained without ever parsing it, so `format` widens to what the intake router identified
 * and the three parse fields become nullable together: a Source Version carries a whole local parse
 * or none of it, never half of one.
 */
const SOURCE_VERSION_V18_SCHEMA_SQL = `CREATE TABLE source_versions (
  source_version_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
  content_digest TEXT CHECK(content_digest IS NULL OR length(content_digest) = 64),
  structure_digest TEXT CHECK(structure_digest IS NULL OR length(structure_digest) = 64),
  parser_identity TEXT,
  format TEXT NOT NULL CHECK(format IN ('DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN')),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK((content_digest IS NULL) = (structure_digest IS NULL) AND (structure_digest IS NULL) = (parser_identity IS NULL)),
  UNIQUE(book_id, source_digest)
) STRICT`;
const SOURCE_PROVENANCE_V18_SCHEMA_SQL = `CREATE TABLE source_provenance (
  provenance_id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
  acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
  locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
  sanitized_identity TEXT NOT NULL,
  parser_identity TEXT,
  recorded_at TEXT NOT NULL
) STRICT`;
/** Every draft records what its file was identified as; every row that predates revision 18 is a DOCX. */
const IMPORT_DRAFT_SOURCE_FORMAT_V18_COLUMN_SQL =
  "ALTER TABLE import_drafts ADD COLUMN source_format TEXT NOT NULL DEFAULT 'DOCX' " +
  "CHECK(source_format IN ('DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN'))";
/**
 * Revision 19's conversion columns, all nullable so every existing row keeps its exact identity: a
 * Source Version and its draft name the DOCX working representation the original was read through
 * and the converter that produced it, and an abandonment cleanup intent names the working object it
 * must remove beside the original (ADR 0072 §2).
 */
const SOURCE_VERSION_V19_COLUMNS_SQL = [
  'ALTER TABLE source_versions ADD COLUMN working_object_digest TEXT REFERENCES content_objects(object_digest)',
  'ALTER TABLE source_versions ADD COLUMN converter_identity TEXT',
];
const IMPORT_DRAFT_V19_COLUMNS_SQL = [
  'ALTER TABLE import_drafts ADD COLUMN working_object_digest TEXT',
  'ALTER TABLE import_drafts ADD COLUMN converter_identity TEXT',
];
const ABANDONMENT_CLEANUP_V19_COLUMN_SQL = [
  'ALTER TABLE import_abandonment_cleanup_intents ADD COLUMN working_object_digest TEXT',
];
/** The three `source_versions` guards, re-created verbatim after the table is rebuilt. */
const SOURCE_VERSION_REBUILT_TRIGGER_SQL = `
  CREATE TRIGGER abandonment_cleanup_block_source_insert
  BEFORE INSERT ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update
  BEFORE UPDATE OF object_digest ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update_v5
  BEFORE UPDATE ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
`;
const SOURCE_IMPORT_DRAFT_V9_SCHEMA_SQL = `CREATE TABLE import_drafts (
  draft_id TEXT PRIMARY KEY,
  selection_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
  draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
  display_name TEXT NOT NULL,
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  selected_path TEXT,
  reviewed_title TEXT,
  reviewed_target_choice_id TEXT
    CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
  review_digest TEXT UNIQUE,
  committed_commit_id TEXT UNIQUE,
  staged_at TEXT NOT NULL,
  reviewed_at TEXT,
  committed_at TEXT,
  reviewed_target_kind TEXT CHECK(reviewed_target_kind IS NULL OR reviewed_target_kind IN ('new-book', 'existing-book')),
  reviewed_existing_book_id TEXT REFERENCES books(book_id),
  reviewed_relationship TEXT
    CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript', 'source-only')),
  reviewed_book_state_digest TEXT
    CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64),
  reviewed_reuse_source_version_id TEXT REFERENCES source_versions(source_version_id)
) STRICT`;
const SOURCE_IMPORT_COMMIT_V9_SCHEMA_SQL = `CREATE TABLE import_commits (
  commit_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL,
  review_digest TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import')),
  result_json TEXT NOT NULL,
  committed_at TEXT NOT NULL
) STRICT`;
const SOURCE_IMPORT_ATTEMPT_V9_SCHEMA_SQL = `CREATE TABLE import_commit_attempts (
  attempt_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import')),
  state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
  prepared_at TEXT NOT NULL,
  committed_at TEXT,
  uncertain_at TEXT,
  uncertainty_code TEXT,
  completion_acknowledged_at TEXT,
  CHECK(
    (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
    OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
      AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
    OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL)
  )
) STRICT`;
const REIMPORT_DRAFT_V10_SCHEMA_SQL = `CREATE TABLE import_drafts (
  draft_id TEXT PRIMARY KEY,
  selection_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
  draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
  display_name TEXT NOT NULL,
  object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
  selected_path TEXT,
  reviewed_title TEXT,
  reviewed_target_choice_id TEXT
    CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
  review_digest TEXT UNIQUE,
  committed_commit_id TEXT UNIQUE,
  staged_at TEXT NOT NULL,
  reviewed_at TEXT,
  committed_at TEXT,
  reviewed_target_kind TEXT CHECK(reviewed_target_kind IS NULL OR reviewed_target_kind IN ('new-book', 'existing-book')),
  reviewed_existing_book_id TEXT REFERENCES books(book_id),
  reviewed_relationship TEXT
    CHECK(reviewed_relationship IS NULL OR reviewed_relationship IN ('new-book-first-manuscript', 'first-manuscript', 'source-only', 'reimport')),
  reviewed_book_state_digest TEXT
    CHECK(reviewed_book_state_digest IS NULL OR length(reviewed_book_state_digest) = 64),
  reviewed_reuse_source_version_id TEXT REFERENCES source_versions(source_version_id),
  reviewed_lineage_status TEXT CHECK(reviewed_lineage_status IS NULL OR reviewed_lineage_status IN ('verified', 'unconfirmed')),
  reviewed_lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
  reviewed_checkpoint_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
  reviewed_manuscript_id TEXT REFERENCES manuscripts(manuscript_id),
  reviewed_branch_id TEXT REFERENCES manuscript_branches(branch_id)
) STRICT`;
const REIMPORT_COMMIT_V10_SCHEMA_SQL = `CREATE TABLE import_commits (
  commit_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL,
  review_digest TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
  result_json TEXT NOT NULL,
  committed_at TEXT NOT NULL
) STRICT`;
const REIMPORT_ATTEMPT_V10_SCHEMA_SQL = `CREATE TABLE import_commit_attempts (
  attempt_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
  request_fingerprint TEXT NOT NULL,
  expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('manuscript-import', 'source-import', 'manuscript-reimport')),
  state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
  prepared_at TEXT NOT NULL,
  committed_at TEXT,
  uncertain_at TEXT,
  uncertainty_code TEXT,
  completion_acknowledged_at TEXT,
  CHECK(
    (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
    OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
      AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
    OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
      AND uncertainty_code IS NULL)
  )
) STRICT`;
const REIMPORT_FACT_SCHEMA_SQL = `
  CREATE TABLE manuscript_reimport_comparisons (
    comparison_id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    checkpoint_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    checkpoint_revision_label TEXT NOT NULL,
    checkpoint_revision_digest TEXT NOT NULL CHECK(length(checkpoint_revision_digest) = 64),
    checkpoint_journal_sequence INTEGER NOT NULL CHECK(checkpoint_journal_sequence >= 0),
    checkpoint_created_for_dirty_journal INTEGER NOT NULL CHECK(checkpoint_created_for_dirty_journal IN (0, 1)),
    lineage_status TEXT NOT NULL CHECK(lineage_status IN ('verified', 'unconfirmed')),
    lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
    lineage_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    lineage_revision_digest TEXT CHECK(lineage_revision_digest IS NULL OR length(lineage_revision_digest) = 64),
    comparison_kind TEXT NOT NULL CHECK(comparison_kind IN ('three-way', 'two-way')),
    staged_source_digest TEXT NOT NULL CHECK(length(staged_source_digest) = 64),
    staged_content_digest TEXT NOT NULL CHECK(length(staged_content_digest) = 64),
    staged_structure_digest TEXT NOT NULL CHECK(length(staged_structure_digest) = 64),
    staged_parser_identity TEXT NOT NULL,
    staged_block_count INTEGER NOT NULL CHECK(staged_block_count > 0),
    checkpoint_block_count INTEGER NOT NULL CHECK(checkpoint_block_count > 0),
    total_mappings INTEGER NOT NULL CHECK(total_mappings > 0),
    unresolved_mappings INTEGER NOT NULL CHECK(unresolved_mappings >= 0 AND unresolved_mappings <= total_mappings),
    changed_mappings INTEGER NOT NULL CHECK(changed_mappings >= 0 AND changed_mappings <= total_mappings),
    comparison_digest TEXT NOT NULL UNIQUE CHECK(length(comparison_digest) = 64),
    resolution_digest TEXT NOT NULL CHECK(length(resolution_digest) = 64),
    degradation_accepted INTEGER NOT NULL CHECK(degradation_accepted IN (0, 1)),
    created_at TEXT NOT NULL,
    CHECK(
      (lineage_status = 'verified' AND lineage_source_version_id IS NOT NULL
        AND lineage_revision_id IS NOT NULL AND comparison_kind = 'three-way')
      OR (lineage_status = 'unconfirmed' AND lineage_source_version_id IS NULL
        AND lineage_revision_id IS NULL AND comparison_kind = 'two-way')
    )
  ) STRICT;
  CREATE TABLE manuscript_reimport_mappings (
    mapping_id TEXT PRIMARY KEY,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position > 0),
    change_kind TEXT NOT NULL CHECK(change_kind IN ('unchanged', 'move', 'edit', 'insert', 'delete')),
    current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    current_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    current_position INTEGER CHECK(current_position IS NULL OR current_position > 0),
    lineage_block_id TEXT REFERENCES manuscript_blocks(block_id),
    lineage_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    lineage_position INTEGER CHECK(lineage_position IS NULL OR lineage_position > 0),
    staged_block_id TEXT,
    staged_draft_id TEXT,
    staged_position INTEGER CHECK(staged_position IS NULL OR staged_position > 0),
    identity_consequence TEXT CHECK(identity_consequence IS NULL OR identity_consequence IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    current_kind TEXT CHECK(current_kind IS NULL OR current_kind IN ('title', 'heading', 'paragraph')),
    current_level INTEGER,
    current_text TEXT,
    current_digest TEXT CHECK(current_digest IS NULL OR length(current_digest) = 64),
    lineage_kind TEXT CHECK(lineage_kind IS NULL OR lineage_kind IN ('title', 'heading', 'paragraph')),
    lineage_level INTEGER,
    lineage_text TEXT,
    lineage_digest TEXT CHECK(lineage_digest IS NULL OR length(lineage_digest) = 64),
    staged_kind TEXT CHECK(staged_kind IS NULL OR staged_kind IN ('title', 'heading', 'paragraph')),
    staged_level INTEGER,
    staged_text TEXT,
    staged_digest TEXT CHECK(staged_digest IS NULL OR length(staged_digest) = 64),
    resolved_changed INTEGER CHECK(resolved_changed IS NULL OR resolved_changed IN (0, 1)),
    UNIQUE(comparison_id, position),
    CHECK(current_block_id IS NOT NULL OR staged_block_id IS NOT NULL),
    CHECK((current_block_id IS NULL) = (current_kind IS NULL)),
    CHECK((current_block_id IS NULL) = (current_text IS NULL)),
    CHECK((current_block_id IS NULL) = (current_digest IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_kind IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_text IS NULL)),
    CHECK((lineage_block_id IS NULL) = (lineage_digest IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_kind IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_text IS NULL)),
    CHECK((staged_block_id IS NULL) = (staged_digest IS NULL)),
    CHECK(
      (change_kind = 'unchanged' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND current_position = staged_position AND identity_consequence = 'preserve-current-identity')
      OR (change_kind = 'move' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND current_position != staged_position AND identity_consequence = 'preserve-current-identity')
      OR (change_kind = 'edit' AND current_block_id IS NOT NULL AND staged_block_id IS NOT NULL
        AND identity_consequence IS NULL)
      OR (change_kind = 'insert' AND current_block_id IS NULL AND staged_block_id IS NOT NULL
        AND identity_consequence IS NULL)
      OR (change_kind = 'delete' AND current_block_id IS NOT NULL AND staged_block_id IS NULL
        AND identity_consequence IS NULL)
    )
  ) STRICT;
  CREATE TABLE manuscript_reimport_mapping_resolutions (
    mapping_id TEXT PRIMARY KEY REFERENCES manuscript_reimport_mappings(mapping_id) ON DELETE CASCADE,
    comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
    resolution TEXT NOT NULL CHECK(resolution IN
      ('preserve-current-identity', 'create-new-identity', 'retire-current-identity')),
    resolved_current_block_id TEXT REFERENCES manuscript_blocks(block_id),
    resolved_at TEXT NOT NULL,
    UNIQUE(comparison_id, resolved_current_block_id),
    CHECK((resolution = 'preserve-current-identity') = (resolved_current_block_id IS NOT NULL))
  ) STRICT;
  CREATE TABLE manuscript_reimport_records (
    reimport_record_id TEXT PRIMARY KEY,
    comparison_id TEXT NOT NULL UNIQUE REFERENCES manuscript_reimport_comparisons(comparison_id),
    commit_id TEXT NOT NULL UNIQUE,
    book_id TEXT NOT NULL REFERENCES books(book_id),
    manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
    provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
    previous_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
    resulting_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
    result_kind TEXT NOT NULL CHECK(result_kind IN ('changed', 'no-change')),
    result_label TEXT NOT NULL CHECK(result_label IN ('稿件已重新导入', '未发现稿件变化')),
    lineage_status TEXT NOT NULL CHECK(lineage_status IN ('verified', 'unconfirmed')),
    lineage_source_version_id TEXT REFERENCES source_versions(source_version_id),
    comparison_kind TEXT NOT NULL CHECK(comparison_kind IN ('three-way', 'two-way')),
    comparison_digest TEXT NOT NULL CHECK(length(comparison_digest) = 64),
    resolution_digest TEXT NOT NULL CHECK(length(resolution_digest) = 64),
    fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
    degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
    record_digest TEXT NOT NULL UNIQUE CHECK(length(record_digest) = 64),
    imported_at TEXT NOT NULL,
    CHECK(
      (result_kind = 'changed' AND result_label = '稿件已重新导入' AND resulting_revision_id IS NOT NULL)
      OR (result_kind = 'no-change' AND result_label = '未发现稿件变化' AND resulting_revision_id IS NULL)
    ),
    CHECK(
      (lineage_status = 'verified' AND lineage_source_version_id IS NOT NULL AND comparison_kind = 'three-way')
      OR (lineage_status = 'unconfirmed' AND lineage_source_version_id IS NULL AND comparison_kind = 'two-way')
    )
  ) STRICT;
`;
const SOURCE_IMPORT_REBUILT_TRIGGER_SQL = `
  CREATE TRIGGER abandonment_cleanup_block_draft_insert
  BEFORE INSERT ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_draft_update
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = OLD.draft_id)
    OR EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.object_digest = NEW.object_digest)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_draft_update_v5
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
      OR i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_commit_insert
  BEFORE INSERT ON import_commits
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = NEW.draft_id)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_commit_update_v5
  BEFORE UPDATE ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_attempt_insert
  BEFORE INSERT ON import_commit_attempts
  WHEN EXISTS (SELECT 1 FROM import_abandonment_cleanup_intents i WHERE i.draft_id = NEW.draft_id)
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER abandonment_cleanup_block_attempt_update_v5
  BEFORE UPDATE ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
  CREATE TRIGGER source_import_record_excludes_manuscript_result
  BEFORE INSERT ON source_import_records
  WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
  BEGIN
    SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
  END;
  CREATE TRIGGER manuscript_import_record_excludes_source_result
  BEFORE INSERT ON manuscript_import_records
  WHEN EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
  BEGIN
    SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
  END;
`;

type SqlRow = Record<string, SQLOutputValue>;
type StoredImportCommitProjection =
  | Omit<ManuscriptImportCommitProjection, 'firstWindow'>
  | SourceImportCommitProjection
  | ManuscriptReimportCommitProjection;

export class StoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

export class StoreFatalError extends Error {
  constructor(cause: unknown) {
    super('AI7 authority transaction boundary failed.', { cause });
    this.name = 'StoreFatalError';
  }
}

function requireStore(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new StoreError(code, message);
}

function requireBoundedBookOverview(projection: BookWorkOverviewProjection): BookWorkOverviewProjection {
  requireStore(
    Buffer.byteLength(JSON.stringify(projection), 'utf8') <= MAX_FRAME_BYTES - REIMPORT_WIRE_HEADROOM_BYTES,
    'BOOK_HISTORY_PAGE_INVALID',
    '图书概览历史页超出有界服务帧。',
  );
  return projection;
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'string') {
    requireStore(value.isWellFormed(), 'CANONICAL_VALUE_INVALID', '无法形成规范记录摘要。');
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new StoreError('CANONICAL_VALUE_INVALID', '无法形成规范记录摘要。');
  return encoded;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableUuid(value: string): string {
  const digest = sha256(value).slice(0, 32).split('');
  digest[12] = '5';
  digest[16] = '8';
  return `${digest.slice(0, 8).join('')}-${digest.slice(8, 12).join('')}-${digest.slice(12, 16).join('')}-${digest.slice(16, 20).join('')}-${digest.slice(20).join('')}`;
}

function commitRequestFingerprint(
  operationKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport',
  input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
): string {
  return sha256(canonicalJson({ schema: 'ai7.import-commit-request/1', operationKind, input }));
}

function immutableCommitResult(result: StoredImportCommitProjection): Record<string, unknown> {
  if ('reimportRecordId' in result) {
    const { overview: _freshOverview, window: _freshWindow, receipt: _freshReceipt, ...immutable } = result;
    return immutable;
  }
  if ('sourceImportRecordId' in result) {
    const { overview: _freshOverview, receipt: _freshReceipt, ...immutable } = result;
    return immutable;
  }
  const { overview: _freshProjection, ...immutable } = result;
  return immutable;
}

const LEGACY_WORKFLOW_PROFILE_DIGEST = sha256(canonicalJson(LEGACY_WORKFLOW_PROFILE));
const BASELINE_EDITORIAL_DIMENSION_SET_DIGEST = sha256(canonicalJson(BASELINE_EDITORIAL_DIMENSION_SET));
const EDITORIAL_DIMENSIONS = BASELINE_EDITORIAL_DIMENSION_SET.dimensions;

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

function one<T extends SqlRow>(rows: T[], code: string, message: string): T {
  requireStore(rows.length === 1, code, message);
  return rows[0]!;
}

function asString(value: SQLOutputValue | undefined, code = 'STORE_CORRUPT'): string {
  requireStore(typeof value === 'string' && value.isWellFormed(), code, '持久化记录类型无效。');
  return value;
}

function asNumber(value: SQLOutputValue | undefined, code = 'STORE_CORRUPT'): number {
  requireStore(typeof value === 'number' && Number.isSafeInteger(value), code, '持久化数字无效。');
  return value;
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

function safeDisplayName(input: string): string {
  requireStore(input.isWellFormed(), 'SOURCE_IDENTITY_INVALID', '来源标识无效。');
  const name = input.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  requireStore(name.length > 0 && name.length <= 180 && !/[\\/]/.test(name), 'SOURCE_IDENTITY_INVALID', '来源标识无效。');
  return name;
}

/**
 * The parser's two "this is not a WordprocessingML package" refusals. They say the file is not a
 * DOCX at all, which the router answers by classifying it as unrecognised and retaining it
 * source-only; every other `DOCX_REJECTED` is a bound a hostile archive crossed and stays a refusal.
 */
const NOT_A_WORDPROCESSING_PACKAGE = [
  'DOCX_REJECTED:not a WordprocessingML DOCX',
  'DOCX_REJECTED:package does not declare a WordprocessingML document',
] as const;

function isNotAWordprocessingPackage(error: unknown): boolean {
  return error instanceof Error && NOT_A_WORDPROCESSING_PACKAGE.some((message) => error.message === message);
}

const SOURCE_FORMATS: ReadonlyArray<SourceFormat> = ['DOCX', 'DOC', 'PDF', 'ODT', 'RTF', 'TXT', 'MD', 'UNKNOWN'];

function nullableString(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function requireSourceFormat(value: string): SourceFormat {
  const format = SOURCE_FORMATS.find((candidate) => candidate === value);
  requireStore(format !== undefined, 'STORE_CORRUPT', '来源格式无效。');
  return format!;
}

/**
 * A file the product did not parse has no title metadata, so the file name is the only suggestion
 * there is — the same fallback the DOCX parser uses when a package carries no title.
 */
function fileNameTitleSuggestion(displayName: string): string {
  const withoutExtension = displayName.slice(0, displayName.length - extname(displayName).length).trim();
  return withoutExtension.length > 0 ? withoutExtension : displayName;
}

async function digestFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * The Import Fidelity Review for a converted file (ADR 0072 §3). The parser found nothing of its
 * own in a working representation the product itself wrote, so every count in the review is the
 * conversion's loss and every non-zero class names the converter as its cause.
 */
function conversionFidelityReport(
  conversion: ManuscriptConversionProjection,
  loss: ConversionLoss,
): FidelityCategoryProjection[] {
  return buildFidelityReport(
    {
      inlineStyles: 0, commentsRevisions: 0, notes: 0, tables: 0, imagesCaptions: 0, sections: 0,
      textBoxes: 0, fields: 0,
    },
    0,
    { identity: conversion.converterIdentity, sourceFormat: conversion.sourceFormat, loss },
  );
}

/**
 * The conversion a row carries, with the invariant `ALTER TABLE ADD COLUMN` could not express as a
 * table `CHECK`: the working object and the converter's identity are null together or set together,
 * and set only where the format is one the product reads through a converter (ADR 0072 §2).
 */
function readConversionColumns(
  row: SqlRow,
  format: SourceFormat,
  message: string,
): ManuscriptConversionProjection | null {
  const workingObjectDigest = row.working_object_digest ?? null;
  const converterIdentity = row.converter_identity ?? null;
  requireStore((workingObjectDigest === null) === (converterIdentity === null), 'STORE_CORRUPT', message);
  if (workingObjectDigest === null) return null;
  requireStore(format === 'TXT' || format === 'MD' || format === 'DOC', 'STORE_CORRUPT', message);
  requireStore(DIGEST_PATTERN.test(asString(workingObjectDigest)), 'STORE_CORRUPT', message);
  return { converterIdentity: asString(converterIdentity), sourceFormat: format };
}

/**
 * The source surface of a stored commit result, read back from its Source Version row: the format
 * and digest of record are the original's, and a converted import also names what it was read
 * through (ADR 0072 §2).
 */
function storedSourceProjection(row: SqlRow): StagedImportProjection['source'] {
  const format = requireSourceFormat(asString(row.format));
  const conversion = readConversionColumns(row, format, '来源版本的转换记录不完整。');
  return {
    displayName: asString(row.display_name),
    format,
    sourceSha256: asString(row.source_digest),
    sourceBytes: asNumber(row.byte_length),
    provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
    conversion,
    workingObjectSha256: conversion === null ? null : asString(row.working_object_digest),
  };
}

/** What such a review is rebuilt from, or `undefined` for a file the product read natively. */
function fidelityConversion(conversion: ManuscriptConversionProjection | null): FidelityConversionIdentity | undefined {
  return conversion === null
    ? undefined
    : { identity: conversion.converterIdentity, sourceFormat: conversion.sourceFormat };
}

function isInside(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function configureDatabase(db: DatabaseSync, tempStore: 'MEMORY' | 'FILE' = 'MEMORY'): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA recursive_triggers = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    PRAGMA trusted_schema = OFF;
    PRAGMA secure_delete = ON;
    PRAGMA temp_store = ${tempStore};
  `);
  const recursiveTriggers = db.prepare('PRAGMA recursive_triggers').get() as SqlRow;
  requireStore(
    asNumber(recursiveTriggers.recursive_triggers) === 1,
    'SCHEMA_INVALID',
    'SQLite 递归触发器未启用，无法保护不可变记录。',
  );
}

const ABANDONMENT_CLEANUP_SCHEMA = `
  CREATE TABLE import_abandonment_cleanup_intents (
    draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id),
    object_digest TEXT NOT NULL UNIQUE REFERENCES content_objects(object_digest),
    expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
    relative_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('prepared', 'bytes-removed')),
    requested_at TEXT NOT NULL,
    bytes_removed_at TEXT,
    CHECK(
      (state = 'prepared' AND bytes_removed_at IS NULL)
      OR (state = 'bytes-removed' AND bytes_removed_at IS NOT NULL)
    )
  ) STRICT;

  CREATE TRIGGER abandonment_cleanup_validate_insert
  BEFORE INSERT ON import_abandonment_cleanup_intents
  WHEN NOT EXISTS (
      SELECT 1
      FROM import_drafts d
      JOIN content_objects co ON co.object_digest = d.object_digest
      WHERE d.draft_id = NEW.draft_id
        AND d.state IN ('staged', 'reviewed')
        AND d.draft_version = NEW.expected_draft_version
        AND d.object_digest = NEW.object_digest
        AND co.relative_key = NEW.relative_key
    )
    OR EXISTS (SELECT 1 FROM source_versions sv WHERE sv.object_digest = NEW.object_digest)
    OR (SELECT count(*) FROM import_drafts d WHERE d.object_digest = NEW.object_digest) != 1
    OR EXISTS (SELECT 1 FROM import_commits c WHERE c.draft_id = NEW.draft_id)
    OR EXISTS (
      SELECT 1 FROM import_commit_attempts a
      WHERE a.draft_id = NEW.draft_id AND a.state != 'prepared'
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_INVALID');
  END;

  CREATE TRIGGER abandonment_cleanup_block_content_object_update
  BEFORE UPDATE ON content_objects
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_draft_insert
  BEFORE INSERT ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_draft_update
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.draft_id = OLD.draft_id
    )
    OR EXISTS (
      SELECT 1 FROM import_abandonment_cleanup_intents i
      WHERE i.object_digest = NEW.object_digest
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_insert
  BEFORE INSERT ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update
  BEFORE UPDATE OF object_digest ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_commit_insert
  BEFORE INSERT ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_attempt_insert
  BEFORE INSERT ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
`;

const ABANDONMENT_CLEANUP_UPDATE_GUARDS_SCHEMA = `
  CREATE TRIGGER abandonment_cleanup_validate_intent_update_v5
  BEFORE UPDATE ON import_abandonment_cleanup_intents
  WHEN NEW.draft_id != OLD.draft_id
    OR NEW.object_digest != OLD.object_digest
    OR NEW.expected_draft_version != OLD.expected_draft_version
    OR NEW.relative_key != OLD.relative_key
    OR NEW.requested_at != OLD.requested_at
    OR NOT (
      (
        OLD.state = 'prepared' AND OLD.bytes_removed_at IS NULL
        AND NEW.state = 'bytes-removed' AND NEW.bytes_removed_at IS NOT NULL
      )
      OR (
        OLD.state = 'bytes-removed' AND NEW.state = 'bytes-removed'
        AND NEW.bytes_removed_at = OLD.bytes_removed_at
      )
    )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_INTENT_IMMUTABLE');
  END;

  CREATE TRIGGER abandonment_cleanup_block_content_object_update_v5
  BEFORE UPDATE ON content_objects
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_draft_update_v5
  BEFORE UPDATE ON import_drafts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
      OR i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_source_update_v5
  BEFORE UPDATE ON source_versions
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.object_digest = OLD.object_digest OR i.object_digest = NEW.object_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_commit_update_v5
  BEFORE UPDATE ON import_commits
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;

  CREATE TRIGGER abandonment_cleanup_block_attempt_update_v5
  BEFORE UPDATE ON import_commit_attempts
  WHEN EXISTS (
    SELECT 1 FROM import_abandonment_cleanup_intents i
    WHERE i.draft_id = OLD.draft_id OR i.draft_id = NEW.draft_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'ABANDONMENT_CLEANUP_PENDING');
  END;
`;

function migrateSchemaV1ToV2(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF');
  let migrationError: unknown;
  try {
    const foreignKeys = one(db.prepare('PRAGMA foreign_keys').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取引用校验状态。');
    requireStore(asNumber(foreignKeys.foreign_keys) === 0, 'SCHEMA_INVALID', '无法暂时停用引用校验以迁移数据库。');
    db.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE import_fidelity_reviews_v2 (
        fidelity_review_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(book_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        review_digest TEXT NOT NULL UNIQUE,
        outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
        round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
        created_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO import_fidelity_reviews_v2(
        fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at
      )
      SELECT fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at
      FROM import_fidelity_reviews;

      CREATE TABLE manuscript_import_records_v2 (
        import_record_id TEXT PRIMARY KEY,
        commit_id TEXT NOT NULL UNIQUE,
        book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
        manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews_v2(fidelity_review_id),
        degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
        resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
        provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
        imported_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO manuscript_import_records_v2(
        import_record_id, commit_id, book_id, manuscript_id, source_version_id, fidelity_review_id,
        degradation_decision_id, resulting_revision_id, provenance_id, imported_at
      )
      SELECT import_record_id, commit_id, book_id, manuscript_id, source_version_id, fidelity_review_id,
             degradation_decision_id, resulting_revision_id, provenance_id, imported_at
      FROM manuscript_import_records;

      DROP TABLE manuscript_import_records;
      DROP TABLE import_fidelity_reviews;
      ALTER TABLE import_fidelity_reviews_v2 RENAME TO import_fidelity_reviews;
      ALTER TABLE manuscript_import_records_v2 RENAME TO manuscript_import_records;
      PRAGMA user_version = 2;
    `);
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库迁移后的引用校验失败。');
    db.exec('COMMIT');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec('PRAGMA foreign_keys = ON');
      const foreignKeys = one(db.prepare('PRAGMA foreign_keys').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取引用校验状态。');
      requireStore(asNumber(foreignKeys.foreign_keys) === 1, 'SCHEMA_INVALID', '无法恢复引用校验。');
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite schema migration and foreign-key restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
}

function migrateSchemaV2ToV3(db: DatabaseSync): void {
  try {
    db.exec(`
      BEGIN IMMEDIATE;

      ALTER TABLE import_drafts ADD COLUMN selected_path TEXT;
      ALTER TABLE import_drafts ADD COLUMN reviewed_target_choice_id TEXT
        CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work'));

      CREATE TABLE import_commit_attempts (
        attempt_id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
        request_fingerprint TEXT NOT NULL,
        expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
        review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
        state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
        prepared_at TEXT NOT NULL,
        committed_at TEXT,
        uncertain_at TEXT,
        uncertainty_code TEXT,
        completion_acknowledged_at TEXT,
        CHECK(
          (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
            AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
          OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
            AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
          OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
            AND uncertainty_code IS NULL)
        )
      ) STRICT;

      INSERT INTO import_commit_attempts(
        attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        state, prepared_at, committed_at
      )
      SELECT commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             'committed', committed_at, committed_at
      FROM import_commits;

      CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);

      PRAGMA user_version = 3;
      COMMIT;
    `);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite schema v3 migration rollback failed.');
    }
    throw error;
  }
}

function migrateSchemaV3ToV4(db: DatabaseSync): void {
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${ABANDONMENT_CLEANUP_SCHEMA}
      PRAGMA user_version = 4;
      COMMIT;
    `);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite schema v4 migration rollback failed.');
    }
    throw error;
  }
}

function migrateSchemaV4ToV5(db: DatabaseSync): void {
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${ABANDONMENT_CLEANUP_UPDATE_GUARDS_SCHEMA}
      PRAGMA user_version = 5;
      COMMIT;
    `);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite schema v5 migration rollback failed.');
    }
    throw error;
  }
}

function initializeSchema(db: DatabaseSync): void {
  const versionRow = one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。');
  const currentVersion = asNumber(versionRow.user_version);
  requireStore(
    currentVersion === 0 ||
      currentVersion === 1 ||
      currentVersion === 2 ||
      currentVersion === 3 ||
      currentVersion === 4 ||
      currentVersion === CORE_SCHEMA_VERSION ||
      currentVersion === EDITOR_SCHEMA_VERSION ||
      currentVersion === RECOVERY_SCHEMA_VERSION ||
      currentVersion === SCHEMA_VERSION ||
      currentVersion === SOURCE_IMPORT_SCHEMA_VERSION ||
      currentVersion === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      currentVersion === MODEL_SERVICE_SCHEMA_VERSION ||
      currentVersion === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      currentVersion === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION ||
      currentVersion === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      currentVersion === J04_BASELINE_ANALYSIS_SCHEMA_VERSION ||
      currentVersion === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      currentVersion === TASK_AUTHORIZATION_SCHEMA_VERSION ||
      currentVersion === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      currentVersion === TEXT_CONVERSION_SCHEMA_VERSION ||
      currentVersion === FACTUAL_REVIEW_SCHEMA_VERSION ||
      currentVersion === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION ||
      currentVersion === EDITORIAL_MARK_SCHEMA_VERSION ||
      currentVersion === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      currentVersion === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      currentVersion === PUBLICATION_VERSION_SCHEMA_VERSION || currentVersion === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      currentVersion === IMPORT_RETENTION_SCHEMA_VERSION || currentVersion === IMPORTED_MARK_SCHEMA_VERSION ||
      currentVersion === EXPORT_LEDGER_SCHEMA_VERSION || currentVersion === CONNECTIVITY_WAIT_SCHEMA_VERSION || currentVersion === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      currentVersion === RUN_CANCELLATION_SCHEMA_VERSION ||
      currentVersion === RUN_CONTINUATION_SCHEMA_VERSION ||
      currentVersion === PLAN_EDIT_SCHEMA_VERSION ||
      currentVersion === CLARIFICATION_SCHEMA_VERSION ||
      currentVersion === REIMPORT_GROUP_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      currentVersion === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      currentVersion === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      currentVersion === MAINTENANCE_CASE_SCHEMA_VERSION ||
      currentVersion === BOOK_PEOPLE_SCHEMA_VERSION ||
      currentVersion === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      currentVersion === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      currentVersion === EVALUATION_RECORD_SCHEMA_VERSION ||
      currentVersion === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      currentVersion === DECISION_FEEDBACK_SCHEMA_VERSION ||
      currentVersion === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      currentVersion === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      currentVersion === SERIES_SCHEMA_VERSION ||
      currentVersion === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      currentVersion === STORE_VERSION_SCHEMA_VERSION ||
      currentVersion === DATABASE_EXPORT_SCHEMA_VERSION ||
      currentVersion === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      currentVersion === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      currentVersion === DATABASE_MERGE_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (
    currentVersion === CORE_SCHEMA_VERSION ||
    currentVersion === EDITOR_SCHEMA_VERSION ||
    currentVersion === RECOVERY_SCHEMA_VERSION ||
    currentVersion === SCHEMA_VERSION ||
    currentVersion === SOURCE_IMPORT_SCHEMA_VERSION ||
    currentVersion === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
    currentVersion === MODEL_SERVICE_SCHEMA_VERSION ||
    currentVersion === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
    currentVersion === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION ||
    currentVersion === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
    currentVersion === J04_BASELINE_ANALYSIS_SCHEMA_VERSION ||
    currentVersion === SUCCESSIVE_TASK_SCHEMA_VERSION ||
    currentVersion === TASK_AUTHORIZATION_SCHEMA_VERSION ||
    currentVersion === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
    currentVersion === TEXT_CONVERSION_SCHEMA_VERSION ||
    currentVersion === FACTUAL_REVIEW_SCHEMA_VERSION ||
    currentVersion === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION ||
    currentVersion === EDITORIAL_MARK_SCHEMA_VERSION ||
    currentVersion === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
    currentVersion === EDITORIAL_REVIEW_SCHEMA_VERSION ||
    currentVersion === PUBLICATION_VERSION_SCHEMA_VERSION || currentVersion === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      currentVersion === IMPORT_RETENTION_SCHEMA_VERSION || currentVersion === IMPORTED_MARK_SCHEMA_VERSION ||
      currentVersion === EXPORT_LEDGER_SCHEMA_VERSION || currentVersion === CONNECTIVITY_WAIT_SCHEMA_VERSION || currentVersion === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      currentVersion === RUN_CANCELLATION_SCHEMA_VERSION ||
      currentVersion === RUN_CONTINUATION_SCHEMA_VERSION ||
      currentVersion === PLAN_EDIT_SCHEMA_VERSION ||
      currentVersion === CLARIFICATION_SCHEMA_VERSION ||
      currentVersion === REIMPORT_GROUP_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      currentVersion === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      currentVersion === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      currentVersion === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      currentVersion === MAINTENANCE_CASE_SCHEMA_VERSION ||
      currentVersion === BOOK_PEOPLE_SCHEMA_VERSION ||
      currentVersion === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      currentVersion === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      currentVersion === EVALUATION_RECORD_SCHEMA_VERSION ||
      currentVersion === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      currentVersion === DECISION_FEEDBACK_SCHEMA_VERSION ||
      currentVersion === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      currentVersion === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      currentVersion === SERIES_SCHEMA_VERSION ||
      currentVersion === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      currentVersion === STORE_VERSION_SCHEMA_VERSION ||
      currentVersion === DATABASE_EXPORT_SCHEMA_VERSION ||
      currentVersion === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      currentVersion === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      currentVersion === DATABASE_MERGE_SCHEMA_VERSION
  ) return;
  if (currentVersion === 1) {
    migrateSchemaV1ToV2(db);
    migrateSchemaV2ToV3(db);
    migrateSchemaV3ToV4(db);
    migrateSchemaV4ToV5(db);
    return;
  }
  if (currentVersion === 2) {
    migrateSchemaV2ToV3(db);
    migrateSchemaV3ToV4(db);
    migrateSchemaV4ToV5(db);
    return;
  }
  if (currentVersion === 3) {
    migrateSchemaV3ToV4(db);
    migrateSchemaV4ToV5(db);
    return;
  }
  if (currentVersion === 4) {
    migrateSchemaV4ToV5(db);
    return;
  }

  db.exec(`
    BEGIN IMMEDIATE;

    CREATE TABLE content_objects (
      object_digest TEXT PRIMARY KEY CHECK(length(object_digest) = 64),
      relative_key TEXT NOT NULL UNIQUE,
      byte_length INTEGER NOT NULL CHECK(byte_length > 0),
      verified_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_drafts (
      draft_id TEXT PRIMARY KEY,
      selection_token TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK(state IN ('staged', 'reviewed', 'committed')),
      draft_version INTEGER NOT NULL CHECK(draft_version >= 1),
      display_name TEXT NOT NULL,
      object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
      selected_path TEXT,
      reviewed_title TEXT,
      reviewed_target_choice_id TEXT
        CHECK(reviewed_target_choice_id IS NULL OR reviewed_target_choice_id IN ('new-book', 'new-book-distinct-intended-work')),
      review_digest TEXT UNIQUE,
      committed_commit_id TEXT UNIQUE,
      staged_at TEXT NOT NULL,
      reviewed_at TEXT,
      committed_at TEXT
    ) STRICT;

    CREATE TABLE staged_import_snapshots (
      draft_id TEXT PRIMARY KEY REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
      parser_identity TEXT NOT NULL,
      source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
      content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
      structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
      block_count INTEGER NOT NULL CHECK(block_count > 0),
      fidelity_json TEXT NOT NULL,
      title_suggestion TEXT NOT NULL,
      title_source TEXT NOT NULL,
      snapshot_created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE staged_import_blocks (
      draft_id TEXT NOT NULL REFERENCES staged_import_snapshots(draft_id) ON DELETE CASCADE,
      staged_block_id TEXT NOT NULL,
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64),
      PRIMARY KEY(draft_id, position),
      UNIQUE(draft_id, staged_block_id)
    ) STRICT;

    CREATE TABLE books (
      book_id TEXT PRIMARY KEY,
      stable_identity TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE book_dimension_sets (
      dimension_set_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      version INTEGER NOT NULL CHECK(version = 1),
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      definition_digest TEXT NOT NULL CHECK(length(definition_digest) = 64),
      weight_semantics TEXT NOT NULL CHECK(weight_semantics = '中性起始权重；非穷尽评分量表'),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE book_dimensions (
      dimension_set_id TEXT NOT NULL REFERENCES book_dimension_sets(dimension_set_id),
      dimension_id TEXT NOT NULL,
      display_label TEXT NOT NULL,
      weight REAL NOT NULL CHECK(weight > 0),
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
      PRIMARY KEY(dimension_set_id, dimension_id),
      UNIQUE(dimension_set_id, position)
    ) STRICT;

    CREATE TABLE source_versions (
      source_version_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      object_digest TEXT NOT NULL REFERENCES content_objects(object_digest),
      source_digest TEXT NOT NULL CHECK(length(source_digest) = 64),
      content_digest TEXT NOT NULL CHECK(length(content_digest) = 64),
      structure_digest TEXT NOT NULL CHECK(length(structure_digest) = 64),
      parser_identity TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format = 'DOCX'),
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(book_id, source_digest)
    ) STRICT;

    CREATE TABLE source_provenance (
      provenance_id TEXT PRIMARY KEY,
      source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
      acquisition_path TEXT NOT NULL CHECK(acquisition_path = 'native-file-picker'),
      locality TEXT NOT NULL CHECK(locality = 'local-provider-free'),
      sanitized_identity TEXT NOT NULL,
      parser_identity TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_fidelity_reviews (
      fidelity_review_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
      review_digest TEXT NOT NULL UNIQUE,
      outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
      round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_fidelity_categories (
      fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
      category_key TEXT NOT NULL,
      display_label TEXT NOT NULL,
      item_count INTEGER NOT NULL CHECK(item_count >= 0),
      status TEXT NOT NULL CHECK(status IN ('preserved', 'degraded', 'unsupported')),
      detail TEXT NOT NULL,
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
      PRIMARY KEY(fidelity_review_id, category_key),
      UNIQUE(fidelity_review_id, position)
    ) STRICT;

    CREATE TABLE import_degradation_decisions (
      degradation_decision_id TEXT PRIMARY KEY,
      fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
      decision TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE manuscripts (
      manuscript_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      role TEXT NOT NULL CHECK(role = 'primary'),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE manuscript_branches (
      branch_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      name TEXT NOT NULL,
      base_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, name)
    ) STRICT;

    CREATE TABLE manuscript_revisions (
      revision_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      ordinal INTEGER NOT NULL CHECK(ordinal = 1),
      revision_label TEXT NOT NULL CHECK(revision_label = 'r1'),
      parent_revision_id TEXT REFERENCES manuscript_revisions(revision_id),
      source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
      revision_digest TEXT NOT NULL CHECK(length(revision_digest) = 64),
      created_at TEXT NOT NULL,
      UNIQUE(manuscript_id, ordinal),
      UNIQUE(manuscript_id, revision_label)
    ) STRICT;

    CREATE TABLE manuscript_blocks (
      block_id TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      created_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id)
    ) STRICT;

    CREATE TABLE manuscript_block_versions (
      revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64),
      PRIMARY KEY(revision_id, block_id),
      UNIQUE(revision_id, position)
    ) STRICT;

    CREATE TABLE workflow_profiles (
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      profile_digest TEXT NOT NULL CHECK(length(profile_digest) = 64),
      definition_json TEXT NOT NULL,
      PRIMARY KEY(profile_id, profile_version)
    ) STRICT;

    CREATE TABLE workflow_instances (
      workflow_instance_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(book_id),
      manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      current_phase TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state = 'active'),
      created_at TEXT NOT NULL,
      FOREIGN KEY(profile_id, profile_version) REFERENCES workflow_profiles(profile_id, profile_version)
    ) STRICT;

    CREATE TABLE manuscript_import_records (
      import_record_id TEXT PRIMARY KEY,
      commit_id TEXT NOT NULL UNIQUE,
      book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
      manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
      source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
      fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
      degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
      resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
      provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
      imported_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_commits (
      commit_id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id),
      request_fingerprint TEXT NOT NULL,
      expected_draft_version INTEGER NOT NULL,
      review_digest TEXT NOT NULL,
      result_json TEXT NOT NULL,
      committed_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE import_commit_attempts (
      attempt_id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL UNIQUE REFERENCES import_drafts(draft_id) ON DELETE CASCADE,
      request_fingerprint TEXT NOT NULL,
      expected_draft_version INTEGER NOT NULL CHECK(expected_draft_version >= 1),
      review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
      state TEXT NOT NULL CHECK(state IN ('prepared', 'uncertain', 'committed')),
      prepared_at TEXT NOT NULL,
      committed_at TEXT,
      uncertain_at TEXT,
      uncertainty_code TEXT,
      completion_acknowledged_at TEXT,
      CHECK(
        (state = 'prepared' AND committed_at IS NULL AND uncertain_at IS NULL
          AND uncertainty_code IS NULL AND completion_acknowledged_at IS NULL)
        OR (state = 'uncertain' AND committed_at IS NULL AND uncertain_at IS NOT NULL
          AND uncertainty_code = 'COMMIT_PROOF_INCONCLUSIVE' AND completion_acknowledged_at IS NULL)
        OR (state = 'committed' AND committed_at IS NOT NULL AND uncertain_at IS NULL
          AND uncertainty_code IS NULL)
      )
    ) STRICT;

    CREATE TABLE branch_working_state (
      branch_id TEXT PRIMARY KEY REFERENCES manuscript_branches(branch_id),
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      journal_sequence INTEGER NOT NULL CHECK(journal_sequence >= 0),
      working_digest TEXT NOT NULL CHECK(length(working_digest) = 64)
    ) STRICT;

    CREATE TABLE working_blocks (
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      position INTEGER NOT NULL CHECK(position > 0),
      kind TEXT NOT NULL CHECK(kind IN ('title', 'heading', 'paragraph')),
      level INTEGER,
      text TEXT NOT NULL,
      digest TEXT NOT NULL CHECK(length(digest) = 64),
      PRIMARY KEY(branch_id, block_id),
      UNIQUE(branch_id, position)
    ) STRICT;

    CREATE TABLE edit_journal_entries (
      journal_entry_id TEXT PRIMARY KEY,
      client_edit_id TEXT NOT NULL UNIQUE,
      request_fingerprint TEXT NOT NULL,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
      branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
      base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
      sequence INTEGER NOT NULL CHECK(sequence > 0),
      block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
      from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
      to_grapheme INTEGER NOT NULL CHECK(to_grapheme >= from_grapheme),
      insert_text TEXT NOT NULL,
      resulting_block_digest TEXT NOT NULL CHECK(length(resulting_block_digest) = 64),
      resulting_working_digest TEXT NOT NULL CHECK(length(resulting_working_digest) = 64),
      durable_at TEXT NOT NULL,
      UNIQUE(branch_id, sequence)
    ) STRICT;

    ${ABANDONMENT_CLEANUP_SCHEMA}
    ${ABANDONMENT_CLEANUP_UPDATE_GUARDS_SCHEMA}

    CREATE INDEX working_blocks_window ON working_blocks(branch_id, position);
    CREATE INDEX journal_branch_order ON edit_journal_entries(branch_id, sequence);
    CREATE INDEX import_attempts_recovery_order
      ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);

    PRAGMA user_version = 5;
    COMMIT;
  `);
}

function initializeSourceImportSchema(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  requireStore(
    version === SCHEMA_VERSION || version === SOURCE_IMPORT_SCHEMA_VERSION ||
      version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === SOURCE_IMPORT_SCHEMA_VERSION || version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION) return;
  const legacyAlterTable = asNumber(
    one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。').legacy_alter_table,
  );
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  let migrationError: unknown;
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      DROP TRIGGER abandonment_cleanup_block_draft_insert;
      DROP TRIGGER abandonment_cleanup_block_draft_update;
      DROP TRIGGER abandonment_cleanup_block_draft_update_v5;
      DROP TRIGGER abandonment_cleanup_block_commit_insert;
      DROP TRIGGER abandonment_cleanup_block_commit_update_v5;
      DROP TRIGGER abandonment_cleanup_block_attempt_insert;
      DROP TRIGGER abandonment_cleanup_block_attempt_update_v5;
      ALTER TABLE import_commit_attempts RENAME TO import_commit_attempts_v8;
      ALTER TABLE import_commits RENAME TO import_commits_v8;
      ALTER TABLE import_drafts RENAME TO import_drafts_v8;
      ALTER TABLE source_provenance RENAME TO source_provenance_v8;
      ${SOURCE_IMPORT_DRAFT_V9_SCHEMA_SQL};
      INSERT INTO import_drafts(
        draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
        reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
        reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
        reviewed_relationship, reviewed_book_state_digest, reviewed_reuse_source_version_id
      )
      SELECT draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
             reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
             reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
             reviewed_relationship, reviewed_book_state_digest, NULL
      FROM import_drafts_v8 ORDER BY draft_id;
      ${SOURCE_IMPORT_COMMIT_V9_SCHEMA_SQL};
      INSERT INTO import_commits(
        commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, result_json, committed_at
      )
      SELECT commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             'manuscript-import', result_json, committed_at
      FROM import_commits_v8 ORDER BY commit_id;
      ${SOURCE_IMPORT_ATTEMPT_V9_SCHEMA_SQL};
      INSERT INTO import_commit_attempts(
        attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, state, prepared_at, committed_at, uncertain_at, uncertainty_code,
        completion_acknowledged_at
      )
      SELECT attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             'manuscript-import', state, prepared_at, committed_at, uncertain_at, uncertainty_code,
             completion_acknowledged_at
      FROM import_commit_attempts_v8 ORDER BY attempt_id;
      ${SOURCE_PROVENANCE_V9_SCHEMA_SQL};
      INSERT INTO source_provenance(
        provenance_id, source_version_id, acquisition_path, locality,
        sanitized_identity, parser_identity, recorded_at
      )
      SELECT provenance_id, source_version_id, acquisition_path, locality,
             sanitized_identity, parser_identity, recorded_at
      FROM source_provenance_v8
      ORDER BY provenance_id;
      DROP TABLE import_commit_attempts_v8;
      DROP TABLE import_commits_v8;
      DROP TABLE import_drafts_v8;
      DROP TABLE source_provenance_v8;
      ${SOURCE_IMPORT_SCHEMA_SQL};
      CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);
      ${SOURCE_IMPORT_REBUILT_TRIGGER_SQL}
    `);
    validateSourceImportSchemaTruth(db, profile);
    db.exec(`PRAGMA user_version = ${SOURCE_IMPORT_SCHEMA_VERSION}; COMMIT;`);
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite source import schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}; PRAGMA foreign_keys = ON;`);
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite source import migration and pragma restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

function initializeManuscriptReimportSchema(db: DatabaseSync, profile: BuiltInWorkflowProfile): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  requireStore(
    version === SOURCE_IMPORT_SCHEMA_VERSION || version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION ||
      version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION) return;
  validateSourceImportSchemaTruth(db, profile);
  const legacyAlterTable = asNumber(
    one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。').legacy_alter_table,
  );
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  let migrationError: unknown;
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      DROP TRIGGER abandonment_cleanup_block_draft_insert;
      DROP TRIGGER abandonment_cleanup_block_draft_update;
      DROP TRIGGER abandonment_cleanup_block_draft_update_v5;
      DROP TRIGGER abandonment_cleanup_block_commit_insert;
      DROP TRIGGER abandonment_cleanup_block_commit_update_v5;
      DROP TRIGGER abandonment_cleanup_block_attempt_insert;
      DROP TRIGGER abandonment_cleanup_block_attempt_update_v5;
      DROP TRIGGER source_import_record_excludes_manuscript_result;
      DROP TRIGGER manuscript_import_record_excludes_source_result;
      ALTER TABLE import_commit_attempts RENAME TO import_commit_attempts_v9;
      ALTER TABLE import_commits RENAME TO import_commits_v9;
      ALTER TABLE import_drafts RENAME TO import_drafts_v9;
      ${REIMPORT_DRAFT_V10_SCHEMA_SQL};
      INSERT INTO import_drafts(
        draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
        reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
        reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
        reviewed_relationship, reviewed_book_state_digest, reviewed_reuse_source_version_id,
        reviewed_lineage_status, reviewed_lineage_source_version_id, reviewed_checkpoint_revision_id,
        reviewed_manuscript_id, reviewed_branch_id
      )
      SELECT draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path,
             reviewed_title, reviewed_target_choice_id, review_digest, committed_commit_id, staged_at,
             reviewed_at, committed_at, reviewed_target_kind, reviewed_existing_book_id,
             reviewed_relationship, reviewed_book_state_digest, reviewed_reuse_source_version_id,
             NULL, NULL, NULL, NULL, NULL
      FROM import_drafts_v9 ORDER BY draft_id;
      ${REIMPORT_COMMIT_V10_SCHEMA_SQL};
      INSERT INTO import_commits(
        commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, result_json, committed_at
      )
      SELECT commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, result_json, committed_at
      FROM import_commits_v9 ORDER BY commit_id;
      ${REIMPORT_ATTEMPT_V10_SCHEMA_SQL};
      INSERT INTO import_commit_attempts(
        attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
        operation_kind, state, prepared_at, committed_at, uncertain_at, uncertainty_code,
        completion_acknowledged_at
      )
      SELECT attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, state, prepared_at, committed_at, uncertain_at, uncertainty_code,
             completion_acknowledged_at
      FROM import_commit_attempts_v9 ORDER BY attempt_id;
      DROP TABLE import_commit_attempts_v9;
      DROP TABLE import_commits_v9;
      DROP TABLE import_drafts_v9;
      CREATE TABLE import_fidelity_reviews_v10 (
        fidelity_review_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(book_id),
        source_version_id TEXT NOT NULL REFERENCES source_versions(source_version_id),
        review_digest TEXT NOT NULL UNIQUE,
        outcome TEXT NOT NULL CHECK(outcome IN ('clean-import-no-round-trip', 'degraded-import-no-round-trip')),
        round_trip_guaranteed INTEGER NOT NULL CHECK(round_trip_guaranteed = 0),
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE import_fidelity_categories_v10 (
        fidelity_review_id TEXT NOT NULL REFERENCES import_fidelity_reviews(fidelity_review_id),
        category_key TEXT NOT NULL,
        display_label TEXT NOT NULL,
        item_count INTEGER NOT NULL CHECK(item_count >= 0),
        status TEXT NOT NULL CHECK(status IN ('preserved', 'degraded', 'unsupported')),
        detail TEXT NOT NULL,
        position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 8),
        PRIMARY KEY(fidelity_review_id, category_key),
        UNIQUE(fidelity_review_id, position)
      ) STRICT;
      CREATE TABLE import_degradation_decisions_v10 (
        degradation_decision_id TEXT PRIMARY KEY,
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE manuscript_import_records_v10 (
        import_record_id TEXT PRIMARY KEY,
        commit_id TEXT NOT NULL UNIQUE,
        book_id TEXT NOT NULL UNIQUE REFERENCES books(book_id),
        manuscript_id TEXT NOT NULL UNIQUE REFERENCES manuscripts(manuscript_id),
        source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(source_version_id),
        fidelity_review_id TEXT NOT NULL UNIQUE REFERENCES import_fidelity_reviews(fidelity_review_id),
        degradation_decision_id TEXT REFERENCES import_degradation_decisions(degradation_decision_id),
        resulting_revision_id TEXT NOT NULL UNIQUE REFERENCES manuscript_revisions(revision_id),
        provenance_id TEXT NOT NULL UNIQUE REFERENCES source_provenance(provenance_id),
        imported_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO import_fidelity_reviews_v10 SELECT * FROM import_fidelity_reviews ORDER BY fidelity_review_id;
      INSERT INTO import_fidelity_categories_v10 SELECT * FROM import_fidelity_categories
        ORDER BY fidelity_review_id, position;
      INSERT INTO import_degradation_decisions_v10 SELECT * FROM import_degradation_decisions
        ORDER BY degradation_decision_id;
      INSERT INTO manuscript_import_records_v10 SELECT * FROM manuscript_import_records ORDER BY import_record_id;
      DROP TABLE manuscript_import_records;
      DROP TABLE import_degradation_decisions;
      DROP TABLE import_fidelity_categories;
      DROP TABLE import_fidelity_reviews;
      ALTER TABLE import_fidelity_reviews_v10 RENAME TO import_fidelity_reviews;
      ALTER TABLE import_fidelity_categories_v10 RENAME TO import_fidelity_categories;
      ALTER TABLE import_degradation_decisions_v10 RENAME TO import_degradation_decisions;
      ALTER TABLE manuscript_import_records_v10 RENAME TO manuscript_import_records;
      ${REIMPORT_FACT_SCHEMA_SQL}
      CREATE INDEX import_attempts_recovery_order
        ON import_commit_attempts(state, completion_acknowledged_at, prepared_at);
      CREATE INDEX reimport_mappings_page
        ON manuscript_reimport_mappings(comparison_id, position);
      CREATE INDEX staged_reimport_identity
        ON staged_import_blocks(draft_id, digest, kind, level);
      CREATE INDEX revision_reimport_identity
        ON manuscript_block_versions(revision_id, digest, kind, level);
      ${SOURCE_IMPORT_REBUILT_TRIGGER_SQL}
      CREATE TRIGGER reimport_record_excludes_other_results
      BEFORE INSERT ON manuscript_reimport_records
      WHEN EXISTS (SELECT 1 FROM manuscript_import_records WHERE commit_id = NEW.commit_id)
        OR EXISTS (SELECT 1 FROM source_import_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END;
      CREATE TRIGGER manuscript_import_record_excludes_reimport_result
      BEFORE INSERT ON manuscript_import_records
      WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END;
      CREATE TRIGGER source_import_record_excludes_reimport_result
      BEFORE INSERT ON source_import_records
      WHEN EXISTS (SELECT 1 FROM manuscript_reimport_records WHERE commit_id = NEW.commit_id)
      BEGIN
        SELECT RAISE(ABORT, 'IMPORT_RESULT_KIND_CONFLICT');
      END;
      PRAGMA user_version = ${MANUSCRIPT_REIMPORT_SCHEMA_VERSION};
    `);
    validateManuscriptReimportSchemaTruth(db, profile);
    db.exec('COMMIT;');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite manuscript reimport migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}; PRAGMA foreign_keys = ON;`);
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite manuscript reimport migration and pragma restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

/** Whether a relation already carries the revision-18 shape, which decides the rebuild below. */
function columnIsNullable(db: DatabaseSync, table: string, column: string): boolean {
  const rows = (db.prepare(`PRAGMA table_info(${table})`).all() as SqlRow[])
    .filter((row) => asString(row.name) === column);
  requireStore(rows.length === 1, 'SCHEMA_INVALID', '无法读取来源版本结构。');
  return asNumber(rows[0]!.notnull) === 0;
}

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as SqlRow[])
    .some((row) => asString(row.name) === column);
}

/**
 * Revision 18's intake relations. `source_versions` and `source_provenance` are rebuilt so that a
 * retained original with no parse can be recorded (ADR 0072 §2), with every existing row copied
 * forward byte for byte — every one of them is a DOCX the product did parse, so none loses a digest
 * — and the three `source_versions` guards re-created verbatim. `import_drafts` gains the format its
 * file was identified as, defaulted so every row that predates this revision reads `DOCX`.
 *
 * The version itself moves in `task-authorization.ts`, where the terminal revision is declared. This
 * runs first and is shape-detected, so a store created fresh at revision 18 does no work here and an
 * interruption between the rebuild and the version bump simply repeats the bump on the next open.
 */
function initializeManuscriptIntakeSchema(db: DatabaseSync): void {
  const rebuildRelations = !columnIsNullable(db, 'source_versions', 'content_digest');
  const addDraftFormat = !columnExists(db, 'import_drafts', 'source_format');
  if (!rebuildRelations && !addDraftFormat) return;
  const legacyAlterTable = asNumber(
    one(db.prepare('PRAGMA legacy_alter_table').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取旧式改表状态。').legacy_alter_table,
  );
  db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  let migrationError: unknown;
  try {
    db.exec('BEGIN IMMEDIATE;');
    if (rebuildRelations) {
      db.exec(`
        DROP TRIGGER abandonment_cleanup_block_source_insert;
        DROP TRIGGER abandonment_cleanup_block_source_update;
        DROP TRIGGER abandonment_cleanup_block_source_update_v5;
        ALTER TABLE source_versions RENAME TO source_versions_v17;
        ALTER TABLE source_provenance RENAME TO source_provenance_v17;
        ${SOURCE_VERSION_V18_SCHEMA_SQL};
        INSERT INTO source_versions(
          source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
          parser_identity, format, display_name, created_at
        )
        SELECT source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
               parser_identity, format, display_name, created_at
        FROM source_versions_v17 ORDER BY rowid;
        ${SOURCE_PROVENANCE_V18_SCHEMA_SQL};
        INSERT INTO source_provenance(
          provenance_id, source_version_id, acquisition_path, locality,
          sanitized_identity, parser_identity, recorded_at
        )
        SELECT provenance_id, source_version_id, acquisition_path, locality,
               sanitized_identity, parser_identity, recorded_at
        FROM source_provenance_v17 ORDER BY rowid;
        DROP TABLE source_versions_v17;
        DROP TABLE source_provenance_v17;
        ${SOURCE_VERSION_REBUILT_TRIGGER_SQL}
      `);
    }
    if (addDraftFormat) db.exec(`${IMPORT_DRAFT_SOURCE_FORMAT_V18_COLUMN_SQL};`);
    db.exec('COMMIT;');
  } catch (error) {
    migrationError = error;
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      migrationError = new AggregateError([error, rollbackError], 'SQLite manuscript intake schema migration rollback failed.');
    }
  } finally {
    try {
      db.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}; PRAGMA foreign_keys = ON;`);
    } catch (restoreError) {
      migrationError = migrationError
        ? new AggregateError([migrationError, restoreError], 'SQLite manuscript intake migration and pragma restoration failed.')
        : restoreError;
    }
  }
  if (migrationError) throw migrationError;
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  requireStore(violations.length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

/**
 * Revision 19's conversion columns (ADR 0072 §2). Every one is added by `ALTER TABLE ADD COLUMN`
 * with a null default, so no relation is rebuilt, no row is copied, and no digest of record moves;
 * a store that predates the revision simply gains five empty columns.
 *
 * `ALTER` cannot add a table `CHECK`, so the invariant those columns carry — both null or both set,
 * and set only where the format is one the product converts — is enforced in this module's writes
 * and in its read-side validation instead. Like revision 18 this runs before the version moves in
 * `task-authorization.ts` and is shape-detected, so an interruption between the two repeats only
 * the version bump on the next open.
 */
function initializeTextConversionSchema(db: DatabaseSync): void {
  const statements = [
    ...(columnExists(db, 'source_versions', 'working_object_digest') ? [] : SOURCE_VERSION_V19_COLUMNS_SQL),
    ...(columnExists(db, 'import_drafts', 'working_object_digest') ? [] : IMPORT_DRAFT_V19_COLUMNS_SQL),
    ...(columnExists(db, 'import_abandonment_cleanup_intents', 'working_object_digest')
      ? []
      : ABANDONMENT_CLEANUP_V19_COLUMN_SQL),
  ];
  if (statements.length === 0) return;
  try {
    db.exec(`BEGIN IMMEDIATE;
      ${statements.join(';\n      ')};
      COMMIT;`);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite text conversion schema migration rollback failed.');
    }
    throw error;
  }
  requireStore(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

function validateModelServiceSchema(
  db: DatabaseSync,
  profile: BuiltInWorkflowProfile,
  validateStoreTruth = true,
): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  if (validateStoreTruth || version !== DATABASE_MERGE_SCHEMA_VERSION) {
    validateManuscriptReimportSchemaTruth(
      db,
      profile,
      true,
      version >= EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION,
      version >= EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
      version >= J03_TASK_AUTHORIZATION_SCHEMA_VERSION,
      version >= J04_BASELINE_ANALYSIS_SCHEMA_VERSION,
      version >= TASK_AUTHORIZATION_SCHEMA_VERSION,
      version >= MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION,
      version >= EDITORIAL_MARK_SCHEMA_VERSION,
      version >= MANUSCRIPT_EFFECT_SCHEMA_VERSION,
      version >= EDITORIAL_REVIEW_SCHEMA_VERSION,
      version >= PUBLICATION_VERSION_SCHEMA_VERSION,
      version >= PROPOSAL_CONFLICT_SCHEMA_VERSION,
      version >= IMPORT_RETENTION_SCHEMA_VERSION,
      version >= IMPORTED_MARK_SCHEMA_VERSION,
      version >= EXPORT_LEDGER_SCHEMA_VERSION,
      version >= DEFAULT_EXECUTION_RULE_SCHEMA_VERSION,
      version >= RUN_CONTINUATION_SCHEMA_VERSION,
      version >= CLARIFICATION_SCHEMA_VERSION,
      version >= REIMPORT_GROUP_SCHEMA_VERSION,
      version >= PRODUCTION_DOCUMENT_SCHEMA_VERSION,
      version >= PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION,
      version >= BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION,
      version >= PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION,
      version >= BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION,
      version >= PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION,
      version >= MAINTENANCE_CASE_SCHEMA_VERSION,
      version >= BOOK_PEOPLE_SCHEMA_VERSION,
      version >= REVIEW_GUIDELINE_SCHEMA_VERSION,
      version >= LIBRARY_MATERIAL_SCHEMA_VERSION,
      version >= EVALUATION_RECORD_SCHEMA_VERSION,
      version >= ANALYSIS_FEEDBACK_SCHEMA_VERSION,
      version >= DECISION_FEEDBACK_SCHEMA_VERSION,
      version >= LEARNING_ELIGIBILITY_SCHEMA_VERSION,
      version >= EVALUATION_CALIBRATION_SCHEMA_VERSION,
      version >= SERIES_SCHEMA_VERSION,
      version >= SERIES_KNOWLEDGE_SCHEMA_VERSION,
      version >= STORE_VERSION_SCHEMA_VERSION,
      version >= DATABASE_EXPORT_SCHEMA_VERSION,
      version >= SCHEDULED_BACKUP_SCHEMA_VERSION,
      version >= DATABASE_REPLACEMENT_SCHEMA_VERSION,
      version >= DATABASE_MERGE_SCHEMA_VERSION,
    );
  }
  const invalid = db.prepare(
    `SELECT 1 FROM model_service_connections
     WHERE connection_id != 'main-editorial-deepseek-v4-pro'
        OR role_id != 'main-editorial'
        OR provider_id != 'deepseek-open-platform'
        OR model_id != 'deepseek-v4-pro'
        OR adapter_revision != 1 OR configuration_revision != 1
        OR approved_fallback_chain != '[]'
        OR credential_slot != 'deepseek-api-key'
     LIMIT 1`,
  ).get();
  requireStore(invalid === undefined, 'SCHEMA_INVALID', '模型服务连接记录超出当前固定绑定。');
}

/**
 * `validateStoreTruth` follows the same rule as `initializeBoundedSchema`: only a caller that keeps
 * an earlier and a later terminal-version store-truth validation in the same `EditorialStore.open`
 * may suppress this intermediate one. The fixed model-service connection check always runs, and any
 * version below the terminal one validates exactly as it does when the flag is absent.
 */
function initializeModelServiceSchema(
  db: DatabaseSync,
  profile: BuiltInWorkflowProfile,
  validateStoreTruth = true,
): void {
  const version = asNumber(
    one(db.prepare('PRAGMA user_version').all() as SqlRow[], 'SCHEMA_INVALID', '无法读取数据库版本。').user_version,
  );
  requireStore(
    version === MANUSCRIPT_REIMPORT_SCHEMA_VERSION || version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === MODEL_SERVICE_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION ||
      version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION || version === J03_TASK_AUTHORIZATION_SCHEMA_VERSION ||
      version === J04_BASELINE_ANALYSIS_SCHEMA_VERSION || version === SUCCESSIVE_TASK_SCHEMA_VERSION ||
      version === TASK_AUTHORIZATION_SCHEMA_VERSION || version === MANUSCRIPT_INTAKE_SCHEMA_VERSION ||
      version === TEXT_CONVERSION_SCHEMA_VERSION || version === FACTUAL_REVIEW_SCHEMA_VERSION ||
      version === MANUSCRIPT_ENTRY_POSITION_SCHEMA_VERSION || version === EDITORIAL_MARK_SCHEMA_VERSION ||
      version === MANUSCRIPT_EFFECT_SCHEMA_VERSION ||
      version === EDITORIAL_REVIEW_SCHEMA_VERSION ||
      version === PUBLICATION_VERSION_SCHEMA_VERSION || version === PROPOSAL_CONFLICT_SCHEMA_VERSION ||
      version === IMPORT_RETENTION_SCHEMA_VERSION || version === IMPORTED_MARK_SCHEMA_VERSION ||
      version === EXPORT_LEDGER_SCHEMA_VERSION || version === CONNECTIVITY_WAIT_SCHEMA_VERSION || version === DEFAULT_EXECUTION_RULE_SCHEMA_VERSION ||
      version === RUN_CANCELLATION_SCHEMA_VERSION ||
      version === RUN_CONTINUATION_SCHEMA_VERSION ||
      version === PLAN_EDIT_SCHEMA_VERSION ||
      version === CLARIFICATION_SCHEMA_VERSION ||
      version === REIMPORT_GROUP_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION ||
      version === BOOK_DELIVERY_PACKAGE_EXPORT_SCHEMA_VERSION ||
      version === PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION ||
      version === MAINTENANCE_CASE_SCHEMA_VERSION ||
      version === BOOK_PEOPLE_SCHEMA_VERSION ||
      version === REVIEW_GUIDELINE_SCHEMA_VERSION ||
      version === LIBRARY_MATERIAL_SCHEMA_VERSION ||
      version === EVALUATION_RECORD_SCHEMA_VERSION ||
      version === ANALYSIS_FEEDBACK_SCHEMA_VERSION ||
      version === DECISION_FEEDBACK_SCHEMA_VERSION ||
      version === LEARNING_ELIGIBILITY_SCHEMA_VERSION ||
      version === EVALUATION_CALIBRATION_SCHEMA_VERSION ||
      version === SERIES_SCHEMA_VERSION ||
      version === SERIES_KNOWLEDGE_SCHEMA_VERSION ||
      version === STORE_VERSION_SCHEMA_VERSION ||
      version === DATABASE_EXPORT_SCHEMA_VERSION ||
      version === SCHEDULED_BACKUP_SCHEMA_VERSION ||
      version === DATABASE_REPLACEMENT_SCHEMA_VERSION ||
      version === DATABASE_MERGE_SCHEMA_VERSION) {
    validateModelServiceSchema(db, profile, validateStoreTruth);
    if (version === EDITORIAL_WORKSPACE_PROFILE_PREDECESSOR_SCHEMA_VERSION) {
      validateEditorialWorkspaceProfileNativeSchema(db);
    } else if (version >= EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION) {
      validateEditorialWorkspaceProfileSchema(db);
    }
    return;
  }
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${MODEL_SERVICE_CONNECTION_SCHEMA_SQL};
      PRAGMA user_version = ${MODEL_SERVICE_SCHEMA_VERSION};
    `);
    validateModelServiceSchema(db, profile);
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite model-service schema migration rollback failed.');
    }
    throw error;
  }
}

interface DraftSnapshot {
  draftId: string;
  state: string;
  version: number;
  displayName: string;
  objectDigest: string;
  selectedPath: string | null;
  reviewedTitle: string | null;
  reviewedTargetChoiceId: NewBookImportTargetChoiceId | null;
  reviewedTargetKind: 'new-book' | 'existing-book' | null;
  reviewedExistingBookId: string | null;
  reviewedRelationship: 'new-book-first-manuscript' | 'first-manuscript' | 'source-only' | 'reimport' | null;
  reviewedBookStateDigest: string | null;
  reviewedReuseSourceVersionId: string | null;
  reviewedLineageStatus: 'verified' | 'unconfirmed' | null;
  reviewedLineageSourceVersionId: string | null;
  reviewedCheckpointRevisionId: string | null;
  reviewedManuscriptId: string | null;
  reviewedBranchId: string | null;
  reviewDigest: string | null;
  stagedAt: string;
  /** What the intake router identified the selected file as (ADR 0072 §1). */
  sourceFormat: SourceFormat;
  /** The converter this draft was read through, or null for a file read natively or not at all. */
  conversion: ManuscriptConversionProjection | null;
  /** The working representation's digest, set exactly when `conversion` is (ADR 0072 §2). */
  workingObjectDigest: string | null;
  /** Null together, for a retained original the product never parsed (ADR 0072 §2). */
  parserIdentity: string | null;
  sourceDigest: string;
  sourceBytes: number;
  contentDigest: string | null;
  structureDigest: string | null;
  blockCount: number;
  characterCount: number;
  fidelity: FidelityCategoryProjection[];
  titleSuggestion: string;
  titleSource: StagedImportProjection['titleSuggestion']['sourceLabel'];
}

interface IngestedDocx {
  ingestId: string;
  parsed: ParsedDocx;
  /** Which source paragraph each ingested block and text-box paragraph came from (ADR 0086 §3). */
  sources: StagedImportSources;
}

interface CommitAttempt {
  attemptId: string;
  draftId: string;
  requestFingerprint: string;
  expectedDraftVersion: number;
  reviewDigest: string;
  operationKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport';
  state: 'prepared' | 'uncertain' | 'committed';
  preparedAt: string;
  completionAcknowledgedAt: string | null;
}

/**
 * The working representation is always stored under `.docx` and its own digest, so a cleanup intent
 * needs only the digest to find it again (ADR 0072 §2).
 */
function workingObjectRelativeKey(objectDigest: string): string {
  return posix.join('sha256', objectDigest.slice(0, 2), `${objectDigest}${manuscriptObjectExtension('DOCX')}`);
}

interface AbandonmentCleanupIntent {
  draftId: string;
  objectDigest: string;
  expectedDraftVersion: number;
  relativeKey: string;
  state: 'prepared' | 'bytes-removed';
  /** The converted working representation to remove beside the original, when there is one. */
  workingObjectDigest: string | null;
}

interface StoreControl {
  induceUnprovableReconciliation: boolean;
  persistLegacyReviewedDraft: boolean;
  induceReimportProofTamper: boolean;
  induceAbandonObjectRemovalFailure: boolean;
  interruptAfterAbandonObjectRemoval: boolean;
  /** The J-04-only local deterministic route resolved at service startup; `null` in every other launch. */
  baselineAnalysisRoute: BaselineAnalysisRouteFacts | null;
  /**
   * The software version the service entry read from the package the product ships in (Issue #433, S85a): the built
   * carrier holds no package manifest. Absent, the store reads the one at its code root — the source tree's, as the
   * service suites open it.
   */
  softwareVersion?: string;
  /**
   * The suites' own classification of schema revisions (Issue #433, S85b), so an upgrade to a later Data Version can be
   * opened before the first packaged release classifies one. The service entry never sets it.
   */
  schemaRevisionClasses?: ReadonlyArray<ClassifiedSchemaRevision>;
  /**
   * The suites stop an open here (Issue #433 review): after every migration and just before the versions that opened the store
   * are recorded, or just after, before the upgrade's note is cleared. The service entry never sets it.
   */
  interruptUpgradeAt?: 'before-record' | 'after-record';
}

function continuationNotice(access: OriginalFileAccessProjection): string {
  if (access.state === 'available-exact') return '已重新校验完整暂存快照；原始所选文件仍可访问且身份一致。';
  return `${access.label}。已重新校验完整暂存快照，不会从原路径读取或替换暂存内容。`;
}

/** What an import that converts a file's comments and tracked changes also creates (Issue #411, D4). */
export function importedMarksRecord(count: number): string {
  return `来自文件作者的批注与修改建议 ${count} 条`;
}

function recordsToCreate(
  plan: ImportFidelityPlan,
  targetKind: 'new-book' | 'existing-book' = 'new-book',
): ReadonlyArray<string> {
  const base = targetKind === 'existing-book' ? BASE_RECORDS_TO_CREATE.slice(2) : BASE_RECORDS_TO_CREATE;
  // The marks stand on r1's blocks, so they follow the block-source mapping.
  const sourcesIndex = base.indexOf('来源段落对应');
  const records = plan.importedMarks === 0
    ? base
    : [...base.slice(0, sourcesIndex + 1), importedMarksRecord(plan.importedMarks), ...base.slice(sourcesIndex + 1)];
  if (plan.degradations.length === 0) return records;
  const fidelityIndex = records.indexOf('导入保真审阅');
  return [...records.slice(0, fidelityIndex + 1), '导入降级决定', ...records.slice(fidelityIndex + 1)];
}

function nonEffects(plan: ImportFidelityPlan): ReadonlyArray<string> {
  return plan.degradations.length === 0 ? [...NON_EFFECTS, CLEAN_IMPORT_NON_EFFECT] : NON_EFFECTS;
}

function newBookTargetChoice(
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): Extract<StagedImportProjection['targetChoices'][number], { kind: 'new-book' }> {
  return identityFindings.length > 0
    ? { kind: 'new-book', id: 'new-book-distinct-intended-work', label: '新建图书（作为不同作品）', selected: false }
    : { kind: 'new-book', id: 'new-book', label: '新建图书', selected: false };
}

function degradationReview(
  plan: ImportFidelityPlan,
  accepted: boolean,
): ImportDegradationDecisionReviewProjection {
  if (plan.degradations.length === 0) return { state: 'not-required-clean-import', items: [] };
  return {
    state: accepted ? 'accepted-complete-set' : 'required-unselected',
    items: plan.degradations,
  };
}

function canonicalDegradationDecision(plan: ImportFidelityPlan): string | null {
  if (plan.degradations.length === 0) return null;
  return canonicalJson({
    schema: DEGRADATION_DECISION_SCHEMA,
    scope: 'this-import-only',
    state: 'accepted-complete-set',
    items: plan.degradations,
  });
}

function parseStoredJson(value: string, message: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new StoreError('STORE_CORRUPT', message);
  }
}

function createLegacyNewBookReviewDigestV2(
  snapshot: DraftSnapshot,
  confirmedTitle: string,
  draftVersion: number,
  plan: ImportFidelityPlan,
): string {
  return sha256(
    canonicalJson({
      schema: 'ai7.new-book-import-review/2',
      draftId: snapshot.draftId,
      draftVersion,
      target: 'new-book',
      confirmedTitle,
      source: {
        displayName: snapshot.displayName,
        provenance: 'native-file-picker/local-provider-free',
        objectDigest: snapshot.objectDigest,
        parserIdentity: snapshot.parserIdentity,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        contentDigest: snapshot.contentDigest,
        structureDigest: snapshot.structureDigest,
      },
      fidelity: snapshot.fidelity,
      degradationDecision:
        plan.degradations.length === 0
          ? null
          : {
              schema: DEGRADATION_DECISION_SCHEMA,
              scope: 'this-import-only',
              state: 'accepted-complete-set',
              items: plan.degradations,
            },
      recordsToCreate: recordsToCreate(plan),
      nonEffects: nonEffects(plan),
      workflowProfile: { ...LEGACY_WORKFLOW_PROFILE, digest: LEGACY_WORKFLOW_PROFILE_DIGEST },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    }),
  );
}

function createNewBookReviewDigestV4(
  snapshot: DraftSnapshot,
  confirmedTitle: string,
  draftVersion: number,
  plan: ImportFidelityPlan,
  targetChoiceId: NewBookImportTargetChoiceId,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): string {
  return sha256(
    canonicalJson({
      schema: 'ai7.new-book-import-review/4',
      draftId: snapshot.draftId,
      draftVersion,
      target:
        targetChoiceId === 'new-book-distinct-intended-work'
          ? { choiceId: targetChoiceId, kind: 'new-book', relationship: 'distinct-intended-work' }
          : { choiceId: targetChoiceId, kind: 'new-book' },
      confirmedTitle,
      source: {
        displayName: snapshot.displayName,
        provenance: 'native-file-picker/local-provider-free',
        objectDigest: snapshot.objectDigest,
        parserIdentity: snapshot.parserIdentity,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        contentDigest: snapshot.contentDigest,
        structureDigest: snapshot.structureDigest,
      },
      identityFindings,
      fidelity: snapshot.fidelity,
      degradationDecision:
        plan.degradations.length === 0
          ? null
          : {
              schema: DEGRADATION_DECISION_SCHEMA,
              scope: 'this-import-only',
              state: 'accepted-complete-set',
              items: plan.degradations,
            },
      recordsToCreate: recordsToCreate(plan),
      nonEffects: nonEffects(plan),
      workflowProfile: { ...LEGACY_WORKFLOW_PROFILE, digest: LEGACY_WORKFLOW_PROFILE_DIGEST },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    }),
  );
}

type ResolvedImportTarget =
  | {
      kind: 'new-book';
      choiceId: NewBookImportTargetChoiceId;
      confirmedTitle: string;
      label: '新建图书' | '新建图书（作为不同作品）';
    }
  | {
      kind: 'existing-book';
      choiceId: string;
      bookId: string;
      stableIdentity: string;
      title: string;
      internalNumber: string | null;
      dimensionSetId: string;
      label: string;
      relationship: 'first-manuscript';
      bookStateDigest: string;
    };

type ResolvedSourceImportTarget =
  | {
      kind: 'new-book';
      choiceId: NewBookImportTargetChoiceId;
      confirmedTitle: string;
      label: '新建图书' | '新建图书（作为不同作品）';
      bookId: string;
      stableIdentity: string;
      sourceVersionDisposition: 'created';
      reuseSourceVersionId: null;
    }
  | {
      kind: 'existing-book';
      choiceId: string;
      bookId: string;
      stableIdentity: string;
      title: string;
      internalNumber: string | null;
      dimensionSetId: string;
      label: string;
      bookStateDigest: string;
      sourceVersionDisposition: 'created' | 'reused-same-book';
      reuseSourceVersionId: string | null;
    };

type ResolvedReimportTarget = {
  kind: 'existing-book';
  choiceId: string;
  bookId: string;
  stableIdentity: string;
  title: string;
  internalNumber: string | null;
  label: string;
  manuscriptId: string;
  branchId: string;
  bookStateDigest: string;
  sourceVersionDisposition: 'created' | 'reused-same-book';
  reuseSourceVersionId: string | null;
  checkpoint: ReimportCheckpointBinding;
  lineage:
    | { status: 'verified'; sourceVersionId: string; revisionId: string; comparisonKind: 'three-way' }
    | { status: 'unconfirmed'; sourceVersionId: null; revisionId: null; comparisonKind: 'two-way' };
};

interface ReimportBlockFact {
  blockId: string;
  position: number;
  kind: ManuscriptBlockProjection['kind'];
  level: number | null;
  text: string;
  digest: string;
}

interface ReimportMappingFact {
  mappingId: string;
  position: number;
  changeKind: 'unchanged' | 'move' | 'edit' | 'insert' | 'delete';
  current: ReimportBlockFact | null;
  lineage: ReimportBlockFact | null;
  staged: ReimportBlockFact | null;
  identityConsequence: 'preserve-current-identity' | null;
}

interface ReimportMappingBatch {
  readonly mappings: ReadonlyArray<ReimportMappingFact>;
  readonly scanned: number;
}

interface ReimportPreparationWork {
  readonly workId: string;
  readonly draftId: string;
  readonly expectedDraftVersion: number;
  readonly targetSelection: ManuscriptReimportTargetSelection;
  readonly snapshot: DraftSnapshot;
  phase: 'checkpoint' | 'staged-occurrences' | 'current-occurrences' | 'lineage-occurrences' | 'mapping';
  checkpointWorkId: string | null;
  checkpointCompleted: number;
  target: ResolvedReimportTarget | null;
  comparisonId: string | null;
  comparisonHasher: ReturnType<typeof createReimportComparisonHasher> | null;
  batches: Generator<ReimportMappingBatch> | null;
  occurrenceCursor: number;
  checkpointBlockCount: number;
  totalUpperBound: number;
  completed: number;
  mappingCount: number;
  unresolvedMappings: number;
  changedMappings: number;
}

export interface ReimportPreparationProgress {
  done: boolean;
  completed: number;
  total: number;
  review: ReviewBeforeManuscriptReimportProjection | null;
}

/** One mapping's identity as a row's verb writes it (Issue #412, S63). */
interface ReimportPendingResolution {
  readonly mappingId: string;
  readonly resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity';
  readonly currentBlockId: string | null;
}

interface ReimportResolutionWork {
  readonly workId: string;
  readonly draftId: string;
  readonly expectedDraftVersion: number;
  readonly groupId: string;
  readonly verb: ReimportGroupVerb;
  /** The identities the verb writes, by mapping, in the order the row lists them. */
  readonly pending: ReadonlyMap<string, ReimportPendingResolution>;
  readonly snapshot: DraftSnapshot;
  readonly target: ResolvedReimportTarget;
  readonly comparisonId: string;
  readonly degradationAccepted: boolean;
  readonly totalMappings: number;
  readonly resolutionHasher: ReturnType<typeof createReimportResolutionHasher>;
  completed: number;
}

export interface ReimportResolutionProgress {
  done: boolean;
  completed: number;
  total: number;
  review: ReviewBeforeManuscriptReimportProjection | null;
}

interface ReimportCommitWork {
  readonly mode: 'commit';
  readonly workId: string;
  readonly input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
  readonly requestFingerprint: string;
  readonly snapshot: DraftSnapshot;
  readonly target: ResolvedReimportTarget;
  readonly evidence: {
    comparisonDigest: string;
    resolutionDigest: string;
    totalMappings: number;
    unresolvedMappings: number;
    changed: boolean;
  };
  readonly resultingRevisionId: string | null;
  readonly objectPath: string;
  readonly abortController: AbortController;
  readonly total: number;
  readonly attemptExists: boolean;
  readonly interruptAfterAttempt: boolean;
  readonly interruptAfterCommit: boolean;
  readonly legacyResultWithoutPresentation: boolean;
  phase: 'parse' | 'mappings';
  parseBytes: number;
  /** A converted source's working representation, reproduced from the kept original before the parse (Issue #597). */
  converted: { digest: string; byteLength: number; fidelity: FidelityCategoryProjection[] } | null;
  parsedIngest: IngestedDocx | null;
  parseFailure: unknown;
  mappingPosition: number;
  stagedBlocks: number;
  stagedCharacters: number;
  readonly offsetSegments: ReimportOffsetSegment[];
}

interface ReimportReplayWork {
  readonly mode: 'committed-replay';
  readonly workId: string;
  readonly input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
  readonly attempt: CommitAttempt;
  readonly result: ManuscriptReimportCommitProjection;
  readonly objectPath: string;
  objectFd: number | null;
  readonly objectHasher: ReturnType<typeof createHash>;
  readonly expectedDigest: string;
  readonly total: number;
  completed: number;
}

export interface ReimportCommitProgress {
  done: boolean;
  completed: number;
  total: number;
  result: ManuscriptReimportCommitProjection | null;
}

interface ReimportOffsetSegment {
  size: number;
  total: number;
}

function appendReimportOffsetSegment(
  stack: ReimportOffsetSegment[],
  position: number,
  length: number,
): number {
  requireStore(Number.isSafeInteger(length) && length >= 0,
    'REIMPORT_COMPARISON_INVALID', '重新导入偏移索引长度无效。');
  let segment: ReimportOffsetSegment = { size: 1, total: length };
  while (stack.at(-1)?.size === segment.size) {
    const previous = stack.pop()!;
    const total = previous.total + segment.total;
    requireStore(Number.isSafeInteger(total), 'REIMPORT_COMPARISON_INVALID', '重新导入偏移索引总量无效。');
    segment = { size: segment.size * 2, total };
  }
  let remainder = position;
  let expectedSize = 1;
  while (remainder % 2 === 0) {
    remainder /= 2;
    expectedSize *= 2;
  }
  requireStore(segment.size === expectedSize, 'REIMPORT_COMPARISON_INVALID', '重新导入偏移索引范围无效。');
  stack.push(segment);
  return segment.total;
}

function manuscriptBlockDigest(kind: ManuscriptBlockProjection['kind'], level: number | null, text: string): string {
  return sha256(canonicalJson({ kind, level, text }));
}

function createReimportComparisonHasher(draftId: string, target: ResolvedReimportTarget) {
  const hash = createHash('sha256');
  hash.update(canonicalJson({
    schema: 'ai7.manuscript-reimport-comparison/2',
    draftId,
    manuscriptId: target.manuscriptId,
    branchId: target.branchId,
    checkpoint: target.checkpoint,
    lineage: target.lineage,
  }));
  return {
    update: (mapping: ReimportMappingFact) => hash.update(`\n${canonicalJson(mapping)}`),
    digest: () => hash.digest('hex'),
  };
}

/**
 * The digest of a comparison's resolutions: every mapping's identity in position order, then — since the
 * chapter-level comparison (Issue #412, S63; schema `/3`) — every row's verb in ordinal order, so a commit reads
 * exactly the rows the editor resolved. A comparison prepared before it keeps its `/2` digest.
 */
function createReimportResolutionHasher() {
  const hash = createHash('sha256');
  hash.update(canonicalJson({ schema: 'ai7.manuscript-reimport-resolutions/3' }));
  return {
    update: (
      mappingId: string,
      resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity',
      resolvedCurrentBlockId: string | null,
    ) => hash.update(`\n${canonicalJson({ mappingId, resolution, resolvedCurrentBlockId })}`),
    group: (groupId: string, verb: ReimportGroupVerb) => hash.update(`\n${canonicalJson({ groupId, verb })}`),
    digest: () => hash.digest('hex'),
  };
}

function emptyReimportResolutionDigest(): string {
  return createReimportResolutionHasher().digest();
}

function createReimportReviewDigest(
  snapshot: DraftSnapshot,
  target: ResolvedReimportTarget,
  comparisonDigest: string,
  resolutionDigest: string,
  degradationDecisionState: ImportDegradationDecisionReviewProjection['state'],
): string {
  return sha256(canonicalJson({
    schema: 'ai7.manuscript-reimport-review/1',
    draftId: snapshot.draftId,
    draftVersion: snapshot.version,
    target: {
      bookId: target.bookId,
      stableIdentity: target.stableIdentity,
      manuscriptId: target.manuscriptId,
      branchId: target.branchId,
      relationship: 'reimport',
      bookStateDigest: target.bookStateDigest,
    },
    checkpoint: target.checkpoint,
    lineage: target.lineage,
    sourceVersionDisposition: target.sourceVersionDisposition,
    reuseSourceVersionId: target.reuseSourceVersionId,
    source: {
      objectDigest: snapshot.objectDigest,
      sourceDigest: snapshot.sourceDigest,
      contentDigest: snapshot.contentDigest,
      structureDigest: snapshot.structureDigest,
      parserIdentity: snapshot.parserIdentity,
    },
    comparisonDigest,
    resolutionDigest,
    degradationDecision: degradationDecisionState,
    namedNonEffects: MANUSCRIPT_REIMPORT_NON_EFFECTS,
  }));
}

function sourceImportRecordsToCreate(
  target: ResolvedSourceImportTarget,
): ReadonlyArray<string> {
  const bookRecords = target.kind === 'new-book' ? ['图书与稳定标识', '图书编辑维度集（8 项）'] : [];
  const sourceRecords = target.sourceVersionDisposition === 'created'
    ? ['图书拥有的来源版本', '来源记录']
    : ['复用已明确选择的同图书来源版本与来源记录'];
  return [...bookRecords, ...sourceRecords, '来源导入记录'];
}

function sourceImportRetainedBoundary(snapshot: DraftSnapshot): ReviewBeforeSourceImportProjection['retainedBoundary'] {
  return {
    kind: 'complete-local-file',
    label: retainedBoundaryLabel(snapshot.parserIdentity !== null),
    format: snapshot.sourceFormat,
    displayName: snapshot.displayName,
    sourceSha256: snapshot.sourceDigest,
    sourceBytes: snapshot.sourceBytes,
    contentDigest: snapshot.contentDigest,
    structureDigest: snapshot.structureDigest,
  };
}

function createSourceImportReviewDigest(
  snapshot: DraftSnapshot,
  target: ResolvedSourceImportTarget,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): string {
  return sha256(canonicalJson({
    // Revision 2: the retained boundary now carries the identified format and may carry no parse.
    schema: 'ai7.source-import-review/2',
    draftId: snapshot.draftId,
    draftVersion: snapshot.version,
    target: target.kind === 'new-book'
      ? {
          kind: target.kind,
          choiceId: target.choiceId,
          confirmedTitle: target.confirmedTitle,
          bookId: target.bookId,
          stableIdentity: target.stableIdentity,
          relationship: 'source-only',
        }
      : {
          kind: target.kind,
          bookId: target.bookId,
          stableIdentity: target.stableIdentity,
          title: target.title,
          internalNumber: target.internalNumber,
          relationship: 'source-only',
          bookStateDigest: target.bookStateDigest,
          sourceVersionDisposition: target.sourceVersionDisposition,
          reuseSourceVersionId: target.reuseSourceVersionId,
        },
    retainedBoundary: sourceImportRetainedBoundary(snapshot),
    provenance: {
      acquisitionPath: 'native-file-picker',
      locality: 'local-provider-free',
      acquiredAt: snapshot.stagedAt,
    },
    parserIdentity: snapshot.parserIdentity,
    objectDigest: snapshot.objectDigest,
    identityFindings,
    recordsToCreate: sourceImportRecordsToCreate(target),
    namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
    editorialDimensionSet: target.kind === 'new-book'
      ? { ...BASELINE_EDITORIAL_DIMENSION_SET, digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST }
      : { preservedBookStateDigest: target.bookStateDigest },
  }));
}

/**
 * The fidelity a review states: the staged report with the text-box choice the review made (ADR 0086
 * §2), and the plan it rebuilds to. The staged report itself always states the default, `retain`.
 */
interface ReviewedFidelity {
  fidelity: FidelityCategoryProjection[];
  plan: ImportFidelityPlan;
}

/**
 * Revision 6 of the review digest covers the text-box choice and the fidelity that states it (ADR 0086):
 * a review that merges its text boxes and one that keeps them are different reviews.
 */
function createImportReviewDigestV6(
  snapshot: DraftSnapshot,
  draftVersion: number,
  reviewed: ReviewedFidelity,
  target: ResolvedImportTarget,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  profile: BuiltInWorkflowProfile,
): string {
  const { plan } = reviewed;
  return sha256(canonicalJson({
    schema: 'ai7.manuscript-import-review/6',
    draftId: snapshot.draftId,
    draftVersion,
    target: target.kind === 'new-book'
      ? {
          kind: 'new-book',
          choiceId: target.choiceId,
          confirmedTitle: target.confirmedTitle,
        }
      : {
          kind: 'existing-book',
          bookId: target.bookId,
          stableIdentity: target.stableIdentity,
          title: target.title,
          internalNumber: target.internalNumber,
          relationship: target.relationship,
          bookStateDigest: target.bookStateDigest,
        },
    source: {
      displayName: snapshot.displayName,
      provenance: 'native-file-picker/local-provider-free',
      objectDigest: snapshot.objectDigest,
      parserIdentity: snapshot.parserIdentity,
      sourceDigest: snapshot.sourceDigest,
      sourceBytes: snapshot.sourceBytes,
      contentDigest: snapshot.contentDigest,
      structureDigest: snapshot.structureDigest,
    },
    identityFindings,
    fidelity: reviewed.fidelity,
    textBoxDisposition: plan.textBoxDisposition,
    degradationDecision: plan.degradations.length === 0
      ? null
      : {
          schema: DEGRADATION_DECISION_SCHEMA,
          scope: 'this-import-only',
          state: 'accepted-complete-set',
          items: plan.degradations,
        },
    recordsToCreate: recordsToCreate(plan, target.kind),
    nonEffects: nonEffects(plan),
    workflowProfile: {
      projection: profile.projection,
      native: profile.native,
    },
    editorialDimensionSet: target.kind === 'new-book'
      ? { ...BASELINE_EDITORIAL_DIMENSION_SET, digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST }
      : { preservedBookStateDigest: target.bookStateDigest },
  }));
}

function reconstructReviewedTargetChoice(
  snapshot: DraftSnapshot,
  confirmedTitle: string,
  plan: ImportFidelityPlan,
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
): NewBookImportTargetChoiceId | null {
  const targetChoice = newBookTargetChoice(identityFindings);
  if (
    createNewBookReviewDigestV4(
      snapshot,
      confirmedTitle,
      snapshot.version,
      plan,
      targetChoice.id,
      identityFindings,
    ) === snapshot.reviewDigest
  ) {
    return targetChoice.id;
  }
  return null;
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

/**
 * Why a Book's own Source Version cannot take the same file again (Issue #532): an earlier parser read it, and AI7 reads
 * files differently now. Said at the choice, in the editor's words; the way on is a new Book.
 */
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

export class EditorialStore {
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
  /** One ledger per review-category kind and frozen category contract, made when first asked for (Issue #417). */
  readonly #reviewCategoryLedgers = new Map<string, BaselineAnalysisStore>();
  /** The kind definition of each configured category a Review Run snapshotted, by its contract input. */
  readonly #reviewCategoryDefinitions = new Map<string, AnalysisKindDefinition>();
  readonly #editorialMarks: EditorialMarkStore;
  readonly #manuscriptApply: ManuscriptApplyStore;
  readonly #reviewRuns: ReviewRunStore;
  readonly #publicationVersions: PublicationVersionStore;
  readonly #maintenanceCases: MaintenanceCases;
  readonly #bookPeople: BookPeople;
  readonly #reviewGuidelines: ReviewGuidelineLedger;
  /** 知识库 › 资料库 (Issue #427, S79c): the items an editor collected and the decisions about them. */
  readonly #libraryMaterials: LibraryMaterialLedger;
  readonly #learningEligibility: LearningEligibilityLedger;
  readonly #evaluationCalibration: EvaluationCalibrationLedger;
  readonly #series: SeriesLedger;
  readonly #seriesKnowledge: SeriesKnowledgeLedger;
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
  /** ②C 评估 (Issue #429, S81a): each Book's versioned Evaluation Records. */
  readonly #evaluations: EvaluationRecords;
  /** ②A 分析反馈 (Issue #94, S38): the editor's judgments of analysis results. */
  readonly #analysisFeedback: AnalysisFeedbackLedger;
  readonly #productionDocuments: ProductionDocuments;
  /** Each Production Document's Deliverable Workflow (Issue #415, S66c). */
  readonly #documentWorkflow: ProductionDocumentWorkflow;
  readonly #bookDeliveryPackages: BookDeliveryPackages;
  readonly #packageExports: BookDeliveryPackageExports;
  readonly #manuscriptExport: ManuscriptExportStore;
  readonly #proposalConflicts: ProposalConflictStore;
  /** 默认执行规则 (Issue #421): the rules 快速开始 starts a Task under. */
  readonly #rules: DefaultExecutionRuleLedger;
  readonly #workflowProfile: BuiltInWorkflowProfile;
  readonly #lifetimeId: string;
  readonly #control: StoreControl;
  #contentObjectLifecycleTail: Promise<void> = Promise.resolve();
  #recoveryObjectLifecycleTail: Promise<void> = Promise.resolve();
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
    workflowProfile: BuiltInWorkflowProfile,
    lifetimeId: string,
    control: StoreControl,
  ) {
    this.#dataRoot = dataRoot;
    this.#objectsRoot = objectsRoot;
    this.#authority = authority;
    this.#journal = journal;
    this.#ingest = ingest;
    this.#boundedAuthority = boundedAuthority;
    this.#bounded = bounded;
    this.#recoveryObjects = recoveryObjects;
    this.#editorialWorkspaceProfile = editorialWorkspaceProfile;
    this.#taskAuthorization = taskAuthorization;
    this.#baselineAnalysis = baselineAnalysis;
    this.#factualReview = factualReview;
    this.#editorialMarks = new EditorialMarkStore(authority);
    this.#rules = new DefaultExecutionRuleLedger(authority);
    this.#manuscriptApply = new ManuscriptApplyStore(authority, boundedAuthority, this.#editorialMarks, lifetimeId);
    // 知识库 › 审阅规范文件 (Issue #427, S79a): a Review Run prepared now applies each guideline document at its latest version.
    this.#reviewGuidelines = new ReviewGuidelineLedger(authority);
    this.#libraryMaterials = new LibraryMaterialLedger(authority, dataRoot);
    this.#learningEligibility = new LearningEligibilityLedger(authority);
    this.#evaluationCalibration = new EvaluationCalibrationLedger(authority);
    this.#series = new SeriesLedger(authority);
    this.#seriesKnowledge = new SeriesKnowledgeLedger(authority);
    this.#dataVersions = new DataVersionLedger(authority);
    this.#databaseExports = new DatabaseExports(authority, dataRoot, {
      facts: () => ({ dataVersion: this.#dataVersion, softwareVersion: this.#softwareVersion, schemaRevision: DATABASE_MERGE_SCHEMA_VERSION }),
    });
    this.#scheduledBackups = new ScheduledBackups(authority, dataRoot, {
      facts: () => ({ dataVersion: this.#dataVersion, softwareVersion: this.#softwareVersion, schemaRevision: DATABASE_MERGE_SCHEMA_VERSION }),
    });
    this.#databaseReplacements = new DatabaseReplacements(authority, dataRoot, {
      facts: () => ({ dataVersion: this.#dataVersion, softwareVersion: this.#softwareVersion, schemaRevision: DATABASE_MERGE_SCHEMA_VERSION }),
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
    this.#evaluations = new EvaluationRecords(authority, { current: (bookId) => this.#evaluationManuscript(bookId) });
    this.#analysisFeedback = new AnalysisFeedbackLedger(authority);
    this.#reviewRuns = new ReviewRunStore(authority, this.#editorialMarks, {
      ledgerOf: (entry) => this.#reviewLedgerOf(entry),
      baseline: () => this.#baselineAnalysis,
    }, () => this.#reviewGuidelines.configuration());
    this.#manuscriptExport = new ManuscriptExportStore(authority, {
      readObject: (objectDigest) => this.#readContentObject(objectDigest),
      dataRoot,
      checkpointOwner: boundedAuthority,
      // A package export's 交付包清单 (Issue #416, S67b), written by the package's export from the version's own record.
      packageManifest: (bookId, packageVersionId) => this.#packageExports.manifest(bookId, packageVersionId),
      packageVersion: (bookId, packageVersionId) => this.#packageExports.version(bookId, packageVersionId),
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
    });
    // Its export (Issue #416, S67b) writes each file through the export ledger and links them to the exact version.
    this.#packageExports = new BookDeliveryPackageExports(authority, this.#manuscriptExport, {
      record: (bookId, packageVersionId) => this.#bookDeliveryPackages.record(bookId, packageVersionId),
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
    const workflowProfile = await loadBuiltInManuscriptProfile(codeRoot);
    // The software version the store records beside its Data Version (Issue #433, S85a).
    const softwareVersion = control.softwareVersion ?? await readSoftwareVersion(codeRoot).catch((error: unknown) => {
      if (error instanceof DataVersionError) throw new StoreError(error.code, error.message);
      throw error;
    });
    const dataRoot = await createCanonicalExternalDataRoot(dataRootInput, codeRoot);
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
      } catch (error) {
        store.close();
        if (error instanceof DatabaseReplacementError) throw new StoreError(error.code, error.message);
        throw error;
      }
    }
    await completeReplacement(dataRoot);
    return store;
  }

  /** Open the store of the data at `dataRoot`, as it is. */
  static async #openAt(
    dataRoot: string,
    codeRoot: string,
    control: StoreControl,
    workflowProfile: BuiltInWorkflowProfile,
    softwareVersion: string,
  ): Promise<EditorialStore> {
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
      configureDatabase(authority, 'FILE');
      // 升级前备份 (Issue #433, S85b; DSTO-016): a store this software must move to a later Data Version is written whole into
      // the backup location before anything migrates it, and a backup that cannot be made opens nothing.
      const classes = control.schemaRevisionClasses ?? SCHEMA_REVISION_CLASSES;
      const { upgrade, earlier } = await backUpBeforeUpgrade(authority, dataRoot, {
        terminalRevision: DATABASE_MERGE_SCHEMA_VERSION, classes, softwareVersion, now: new Date(),
      }).catch((error: unknown) => {
        if (error instanceof DataVersionError) throw new StoreError(error.code, error.message);
        throw error;
      });
      initializeSchema(authority);
      initializeBoundedSchema(authority, workflowProfile);
      initializeSourceImportSchema(authority, workflowProfile);
      if (control.induceReimportProofTamper) {
        requireStore(authority.prepare(REIMPORT_PROOF_TAMPER_SQL).run().changes === 1, 'E2E_CONTROL_INVALID', '没有可用于启动校验的重新导入证明。');
      }
      initializeManuscriptReimportSchema(authority, workflowProfile);
      // A store already at the terminal version is validated whole exactly twice per open: once above,
      // before any cleanup write, and once below, after the E2E control injection, the layered
      // initializers, and native-artifact partial recovery. The initializers between those two points
      // would otherwise repeat the same whole-store validation over an unchanged store.
      initializeModelServiceSchema(authority, workflowProfile, false);
      initializeEditorialWorkspaceProfileSchema(authority);
      initializeBoundedSchema(authority, workflowProfile, false);
      const editorialWorkspaceProfile = await EditorialWorkspaceProfileStore.open(authority, dataRoot, codeRoot);
      // The intake relations widen before the terminal version moves, so the version and the shape it
      // names change together for every store that reaches revision 18, and again for revision 19,
      // and again for the entry-position relation revision 21 adds, the editorial-mark relations
      // revision 22 adds and the manuscript-effect relations revision 23 adds. Revision 24 (Issue
      // #417) adds the Review Run relations here, and `initializeTaskAuthorizationSchema` rebuilds the
      // three kind-coupled analysis relations for the review-category kind family. Revision 25 (Issue
      // #414) adds the Publication Version relations here and revision 26 (Issue #57) the proposal-conflict
      // relations, and the version stamp is the only other move. Revision 27 (Issue #410) widens
      // `import_fidelity_categories` and adds the import-retention relations here, in one transaction.
      // Revision 28 (Issue #411) widens `proposal_change_items` to the `insert` kind and adds the staged
      // imported marks here, in one transaction. Revision 29 (Issue #413) adds the export ledger here, and
      // revision 31 (Issue #421) the default-execution-rule ledger; `initializeTaskAuthorizationSchema` widens
      // the Run Authorization origin for it and stamps the version.
      initializeManuscriptIntakeSchema(authority);
      initializeTextConversionSchema(authority);
      initializeManuscriptEntryPositionSchema(authority);
      initializeEditorialMarkSchema(authority);
      initializeManuscriptEffectSchema(authority);
      initializeReviewRunSchema(authority);
      initializePublicationVersionSchema(authority);
      initializeProposalConflictSchema(authority);
      initializeImportRetentionSchema(authority);
      initializeImportedMarkSchema(authority);
      initializeExportLedgerSchema(authority);
      initializeDefaultExecutionRuleSchema(authority);
      initializeRunCheckpointSchema(authority);
      initializeClarificationSchema(authority);
      // Revision 36 (Issue #412) adds the chapter-level Reimport Comparison's relations here, and revision 37
      // (Issue #415) rebuilds `manuscripts` for Production Documents beside their ledgers.
      initializeReimportGroupSchema(authority);
      initializeProductionDocumentSchema(authority);
      // Revision 38 (Issue #415, S66b) adds their Delivery Records, and revision 39 (Issue #416, S67a) the Book's
      // frozen 图书交付包 versions.
      initializeProductionDocumentDeliverySchema(authority);
      initializeBookDeliveryPackageSchema(authority);
      // Revision 40 (Issue #415, S66c) adds each document's workflow instance and phase moves, and revision 41 (Issue #416,
      // S67b) each package export and the files it links.
      initializeProductionDocumentWorkflowSchema(authority, workflowProfilePin(workflowProfile));
      initializeBookDeliveryPackageExportSchema(authority);
      // Revision 42 (Issue #547) adds how each document's origin material was read, and revision 43 (Issue #426, S68a) the
      // 维护事项 of each 发稿版本.
      initializeProductionDocumentOriginSchema(authority);
      initializeMaintenanceCaseSchema(authority);
      // Revision 44 (Issue #431, S83) adds each Book's people, revision 45 (Issue #427, S79a) the versions a house imports
      // of its review guideline documents, and revision 46 (Issue #427, S79c) the items put into 资料库 and their decisions;
      // revision 47 (Issue #429, S81a) each Book's Evaluation Records, revision 48 (Issue #94, S38) the editor's judgments
      // of analysis results, revision 49 (Issue #61, S26a) the 不说明 and later reasons of Proposal Decisions, and revision 50
      // (Issue #61, S26b) the editor's Learning Eligibility decisions, and revision 51 (Issue #430, S82) each Book's 定价与首印
      // and the house's evaluation preferences; revision 52 (Issue #63, S28a) the house's Series and their membership changes,
      // and revision 53 (Issue #63, S28b) Series Knowledge: candidates, items, revisions and promotion decisions; revision 54
      // (Issue #433, S85a) the versions that opened the store; revision 55 (Issue #434, S86a) the database exports; revision 56
      // (Issue #434, S86b) the scheduled backups; revision 57 (Issue #434, S86c) the replacements of the local data; and revision
      // 58 (Issue #434, S86d) the merges of a package's Books.
      initializeBookPeopleSchema(authority);
      initializeReviewGuidelineSchema(authority);
      initializeLibraryMaterialSchema(authority);
      initializeEvaluationRecordSchema(authority);
      initializeAnalysisFeedbackSchema(authority);
      initializeDecisionFeedbackSchema(authority);
      initializeLearningEligibilitySchema(authority);
      initializeEvaluationCalibrationSchema(authority);
      initializeSeriesSchema(authority);
      initializeSeriesKnowledgeSchema(authority);
      initializeDataVersionSchema(authority);
      initializeDatabaseExportSchema(authority);
      initializeScheduledBackupSchema(authority);
      initializeDatabaseReplacementSchema(authority);
      initializeDatabaseMergeSchema(authority);
      initializeTaskAuthorizationSchema(authority);
      initializeBoundedSchema(authority, workflowProfile);
      validateEditorialWorkspaceProfileSchema(authority);
      validateTaskAuthorizationSchema(authority);
      journal = new DatabaseSync(databasePath);
      configureDatabase(journal);
      ingest = new DatabaseSync(databasePath);
      configureDatabase(ingest);
      const lifetimeId = randomUUID();
      const boundedAuthority = new BoundedManuscriptStore(authority);
      const store = new EditorialStore(
        dataRoot,
        objectsRoot,
        authority,
        journal,
        ingest,
        boundedAuthority,
        new BoundedManuscriptStore(journal),
        recoveryObjects,
        editorialWorkspaceProfile,
        new TaskAuthorizationStore(authority, boundedAuthority),
        new BaselineAnalysisStore(authority, boundedAuthority, control.baselineAnalysisRoute),
        new BaselineAnalysisStore(authority, boundedAuthority, control.baselineAnalysisRoute, factualReviewKindDefinition()),
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
      // A database package staged and never approved, or cut off mid-write, is a whole copy of the data (Issue #434 review).
      await store.#databaseExports.sweep();
      store.#boundedCall(() => store.#boundedAuthority.startServiceLifetime(lifetimeId, new Date().toISOString()));
      // Every store records the versions that open it (Issue #433, S85a; DSTO-016): a new record only when one changed.
      store.#softwareVersion = softwareVersion;
      store.#codeRoot = codeRoot;
      store.#dataVersion = dataVersionAt(DATABASE_MERGE_SCHEMA_VERSION, classes);
      if (control.interruptUpgradeAt === 'before-record') throw new StoreError('E2E_CONTROL_INTERRUPTED', '打开在记录版本之前停止。');
      // The open that raised the Data Version records the upgrade it made with the backup (S85b), and only then clears the note
      // that let an open stopped before this record it (Issue #433 review).
      store.#dataVersionCall(() => store.#transaction(authority, () => {
        // Another software's upgrade whose migration committed before it was recorded goes first, as that open would have
        // recorded it (Issue #433 review).
        if (earlier !== null) store.#dataVersions.recordOpen(earlier);
        store.#dataVersions.recordOpen({ softwareVersion, dataVersion: store.#dataVersion, schemaRevision: DATABASE_MERGE_SCHEMA_VERSION, upgrade });
      }));
      if (control.interruptUpgradeAt === 'after-record') throw new StoreError('E2E_CONTROL_INTERRUPTED', '打开在清除升级记录之前停止。');
      await completeUpgrade(dataRoot).catch(() => undefined);
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

  markCleanShutdown(): void {
    this.#assertAvailable();
    requireStore(!this.#cleanShutdownMarked, 'LIFETIME_STATE_CHANGED', '本地服务生命周期无法重复结束。');
    this.#boundedCall(() => this.#boundedAuthority.markServiceLifetimeClean(this.#lifetimeId, new Date().toISOString()));
    this.#cleanShutdownMarked = true;
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
    return this.#withQuickStart(this.#analysisCall(() => this.#baselineAnalysis.inspect(bookId, progress, revisionId)) as BaselineAnalysisProjection);
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
   * whose clauses changed is a different contract that must not inherit them.
   *
   * The ledger takes the route and the launch the baseline ledger was bound to, so every plan it
   * freezes names the binding this launch actually bound — which the one execution owner then checks.
   */
  reviewCategoryLedger(definition: AnalysisKindDefinition): BaselineAnalysisStore {
    this.#assertAvailable();
    requireStore(isReviewCategoryKindId(definition.kind), 'REVIEW_CATEGORY_INVALID', '该分析种类不是审阅类别。');
    const key = `${definition.kind}\n${definition.promptContractDigest}`;
    let ledger = this.#reviewCategoryLedgers.get(key);
    if (ledger === undefined) {
      ledger = new BaselineAnalysisStore(this.#authority, this.#boundedAuthority, this.#control.baselineAnalysisRoute, definition);
      ledger.bindLaunch(this.#baselineAnalysis.launch);
      this.#reviewCategoryLedgers.set(key, ledger);
    }
    return ledger;
  }

  /** One category's Task, latest Result Set Revision, history and update controls; `revisionId` opens one exact revision read-only. */
  inspectReviewCategory(
    bookId: string,
    definition: AnalysisKindDefinition,
    progress?: ProgressReader,
    revisionId: string | null = null,
  ): ReviewCategoryProjection {
    const ledger = this.reviewCategoryLedger(definition);
    return this.#analysisCall(() => ledger.inspect(bookId, progress, revisionId)) as ReviewCategoryProjection;
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
    const ledger = this.reviewCategoryLedger(definition);
    const result = this.#analysisCall(() => ledger.prepare({
      phase: 'start',
      bookId,
      goal: definition.mode(request.mode).goal as ReviewCategoryGoal,
      update: request.mode === definition.initialMode ? null : { mode: request.mode, selectedRange: request.selectedRange },
      reconfirm,
      launchPolicy,
    }));
    return { ...result, projection: result.projection as ReviewCategoryProjection | null };
  }

  advanceReviewCategoryPreparationWork(definition: AnalysisKindDefinition, workId: string): AnalysisPreparationResult<ReviewCategoryProjection> {
    const ledger = this.reviewCategoryLedger(definition);
    const result = this.#analysisCall(() => ledger.prepare({ phase: 'advance', workId }));
    return { ...result, projection: result.projection as ReviewCategoryProjection | null };
  }

  cancelReviewCategoryPreparationWork(definition: AnalysisKindDefinition, workId: string): boolean {
    const ledger = this.reviewCategoryLedger(definition);
    this.#analysisCall(() => ledger.prepare({ phase: 'cancel', workId }));
    return true;
  }

  /** Records the standard-direct authorization and the Run; the caller hands the Run and this category's ledger to the execution owner. */
  authorizeReviewCategory(
    bookId: string,
    definition: AnalysisKindDefinition,
    taskIntentId: string,
    planEnvelopeDigest: string,
  ): { projection: ReviewCategoryProjection; dispatchRunRecordId: string | null } {
    const ledger = this.reviewCategoryLedger(definition);
    const authorized = this.#analysisCall(() => ledger.authorize(bookId, taskIntentId, planEnvelopeDigest));
    return { projection: authorized.projection as ReviewCategoryProjection, dispatchRunRecordId: authorized.dispatchRunRecordId };
  }

  // ---- 审阅 Review Runs (Issue #417, plan slice S69) ----------------------------------------------

  /**
   * The ledger a Task-backed category of a Review Run executes on: the factual kind's for 事实核查, and
   * otherwise the category's own, built from the configuration entry the Run snapshotted — so a Run keeps
   * finding the ledger of the exact contract it prepared under.
   */
  #reviewLedgerOf(entry: ReviewCategoryConfigurationEntry): BaselineAnalysisStore {
    if (entry.executor === 'factual-review-kind') return this.#factualReview;
    requireStore(entry.executor === 'review-category-contract', 'REVIEW_CATEGORY_NOT_TASK_BACKED', '这一类没有自己的任务账本。');
    const input = reviewCategoryContractInput(entry);
    const key = JSON.stringify(input);
    let definition = this.#reviewCategoryDefinitions.get(key);
    if (definition === undefined) {
      definition = this.#analysisCall(() => reviewCategoryKindDefinition(input));
      this.#reviewCategoryDefinitions.set(key, definition);
    }
    return this.reviewCategoryLedger(definition);
  }

  /**
   * The Book's 审阅 destination (Appendix 1 of the S69 design): the categories with their basis, the
   * coverage matrix, the scope options, the 审阅记录, and the opened Run — the latest when `reviewRunId`
   * is `null`. `progress` is the execution owner's reader, exactly as the analysis inspections take it.
   * `page` chooses which of the opened Run's findings the answer carries — a cursor and the four filters
   * of the results — and is the first page of every finding when it is left out.
   */
  inspectReviewWorkspace(bookId: string, reviewRunId: string | null, progress?: ProgressReader, page?: ReviewFindingPageRequest): ReviewWorkspaceProjection {
    return this.#reviewCall(() => this.#reviewRuns.workspace(bookId, reviewRunId, progress, page));
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
  ): AnalysisPreparationResult<ReviewWorkspaceProjection> {
    return this.#reviewPreparation(() => this.#reviewRuns.prepare({ phase: 'start', bookId, categoryIds, scope, launchPolicy }));
  }

  advanceReviewRunPreparationWork(workId: string): AnalysisPreparationResult<ReviewWorkspaceProjection> {
    return this.#reviewPreparation(() => this.#reviewRuns.prepare({ phase: 'advance', workId }));
  }

  cancelReviewRunPreparationWork(workId: string): boolean {
    this.#reviewCall(() => this.#reviewRuns.prepare({ phase: 'cancel', workId }));
    return true;
  }

  #reviewPreparation(body: () => ReviewRunPreparationProgress): AnalysisPreparationResult<ReviewWorkspaceProjection> {
    return this.#reviewCall(() => {
      const progress = body();
      return {
        done: progress.done,
        workId: progress.workId,
        completed: progress.completed,
        total: progress.total,
        projection: progress.reviewRunId === null || progress.bookId === null ? null : this.#reviewRuns.workspace(progress.bookId, progress.reviewRunId),
      };
    });
  }

  /**
   * The editor's one approval of a prepared Review Run, naming the exact plan digest of every
   * Task-backed category (B1). The caller then hands the Run to the drive loop. `slotBusy` is the
   * execution owner's word that other Runs hold every place of its governor: a new approval is refused with
   * `EXECUTION_BUSY` before anything is written (Issue #420, S74a A2; Issue #49, S14).
   */
  authorizeReviewRun(
    bookId: string,
    reviewRunId: string,
    approvedDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>,
    slotBusy = false,
  ): ReviewWorkspaceProjection {
    return this.#reviewCall(() => {
      this.#reviewRuns.recordAuthorization(bookId, reviewRunId, approvedDigests, slotBusy);
      return this.#reviewRuns.workspace(bookId, reviewRunId);
    });
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
    return this.#reviewCall(() => {
      this.#reviewRuns.ignoreFinding(bookId, reviewRunId, findingId, reason);
      return this.#reviewRuns.workspace(bookId, reviewRunId, progress);
    });
  }

  /** The next version of the Run's 审阅报告 (REV-009). */
  generateReviewReport(bookId: string, reviewRunId: string, progress?: ProgressReader): ReviewWorkspaceProjection {
    return this.#reviewCall(() => {
      this.#reviewRuns.generateReport(bookId, reviewRunId);
      return this.#reviewRuns.workspace(bookId, reviewRunId, progress);
    });
  }

  /** The Review Run and finding a produced mark belongs to, for the Mark Card's `查看任务`; `null` for any other mark. */
  reviewFindingOfMark(markId: string): { bookId: string; reviewRunId: string; findingId: string } | null {
    return this.#reviewCall(() => this.#reviewRuns.findingOfMark(markId));
  }

  /**
   * Refuses a Review Run that is not this Book's. The drive loop is service-internal and knows no Book,
   * so an operation that hands it a Run the renderer named — 继续审阅 — asks this first.
   */
  requireReviewRunOfBook(bookId: string, reviewRunId: string): void {
    this.#reviewCall(() => this.#reviewRuns.requireRunOfBook(bookId, reviewRunId));
  }

  /**
   * The drive loop's steps (B2); service-internal. Each is one call into the Review Run ledger with the
   * store's own error handling, so a fatal store error poisons the store exactly as any other call does.
   */
  get reviewRunDriveSteps(): ReviewRunDriveSteps {
    const runs = this.#reviewRuns;
    return {
      begin: (reviewRunId) => this.#reviewCall(() => runs.beginDrive(reviewRunId)),
      end: (reviewRunId) => runs.endDrive(reviewRunId),
      step: (reviewRunId, categoryId) => this.#reviewCall(() => runs.step(reviewRunId, categoryId)),
      start: (reviewRunId, categoryId) => this.#reviewCall(() => runs.start(reviewRunId, categoryId)),
      recordDispatch: (reviewRunId, categoryId, runRecordId) => this.#reviewCall(() => runs.recordDispatch(reviewRunId, categoryId, runRecordId)),
      refuseDispatch: (reviewRunId, categoryId, runRecordId, code, message) =>
        this.#reviewCall(() => runs.refuseDispatch(reviewRunId, categoryId, runRecordId, code, message)),
      settle: (reviewRunId, categoryId) => this.#reviewCall(() => runs.settle(reviewRunId, categoryId)),
      write: (reviewRunId, categoryId) => this.#reviewCall(() => runs.write(reviewRunId, categoryId)),
      fail: (reviewRunId, categoryId, code, message) => this.#reviewCall(() => runs.fail(reviewRunId, categoryId, code, message)),
    };
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

  /**
   * The plan and the kind of route it names: the baseline Task's frozen execution route, a Review Run's live route
   * when it sends to a model service, and none for J-03's fixed task, which never dispatches (ADR 0055).
   */
  #taskPlanWithRoute(
    input: InspectTaskPlanInput,
    progress?: ProgressReader,
    carriesStoppedRun: (runRecordId: string) => boolean = () => true,
  ): { plan: TaskPlanProjection; routeKind: string | null } {
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
      // The execution owner's progress feeds the activity card of a Run under way (Issue #422, AUTH-011).
      const projection = this.#analysisCall(() => this.#baselineAnalysis.inspect(input.bookId, progress)) as BaselineAnalysisProjection;
      const checkpoint = projection.checkpoint;
      requireStore(projection.taskIntent !== null && checkpoint !== null, 'TASK_PLAN_UNAVAILABLE', '这项分析还没有准备计划。');
      current(projection.taskIntent.taskIntentId);
      const blocks = this.#analysisCall(() => this.#baselineAnalysis.readRevisionBlocks(checkpoint.manuscriptId, checkpoint.revisionId));
      const defaultRule = this.#baselineDefaultRule(projection);
      const stopped = this.#baselineStoppedRun(projection, carriesStoppedRun);
      // What the Run asked the editor, and the answers (Issue #422, S76d).
      const clarifications = projection.run === null ? [] : this.#analysisCall(() => this.#baselineAnalysis.clarificationsOf(projection.run!.runRecordId));
      const plan = this.#taskPlanCall(() => baselineAnalysisPlan({ projection, bookTitle, blocks, defaultRule, clarifications, ...(stopped === null ? {} : { stopped }) }));
      return { plan, routeKind: projection.providerResolutionPlan?.executionRoute.kind ?? null };
    }
    const reviewRunId = input.ref;
    requireStore(reviewRunId !== null, 'TASK_PLAN_INVALID', '审阅的计划要指明是哪一次审阅。');
    const facts = this.#reviewCall(() => this.#reviewRuns.planFacts(input.bookId, reviewRunId));
    const blocks = this.#analysisCall(() => this.#baselineAnalysis.readRevisionBlocks(facts.manuscript.manuscriptId, facts.inputRevision.revisionId));
    const plan = this.#taskPlanCall(() => reviewRunPlan({ bookId: input.bookId, facts, bookTitle, blocks }));
    // The route the categories' frozen plans resolve, read from the first Task's Provider Resolution Plan as the
    // baseline reads its own: a review's Tasks share one launch, and a Run of the leads alone reaches no model.
    const frozenRoute = facts.categories
      .map((category) => category.task?.components['provider-resolution-plan'])
      .map((provider) => (provider !== null && typeof provider === 'object' ? (provider as { executionRoute?: { kind?: unknown } }).executionRoute?.kind : undefined))
      .find((kind): kind is string => typeof kind === 'string');
    return { plan, routeKind: plan.start.needsModelConnection ? frozenRoute ?? null : null };
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
    credentialReadiness: () => Promise<'present' | 'missing' | null>,
    connectivity: TaskPlanConnectivity = ALWAYS_ONLINE,
    progress?: ProgressReader,
  ): Promise<TaskPlanProjection> {
    const { plan: frozen, routeKind } = this.#taskPlanWithRoute(input, progress, (runRecordId) => connectivity.carriesStoppedRun?.(runRecordId) ?? true);
    let plan = frozen;
    if (plan.start.needsModelConnection && plan.start.readiness === 'ready') plan = withConnectionReadiness(plan, await credentialReadiness());
    // Connectivity (Issue #502): only a plan whose route reaches its model over the network can be offline,
    // and only once its credential is known to be there — 模型未连接 is decided first.
    const reaches = routeKind !== null && connectivity.reachesNetwork(routeKind);
    plan = withConnectivityReadiness(plan, reaches, reaches ? connectivity.reading() : 'online');
    // 续行 (Issue #422, S76b; CONT-015): a stopped Run goes on only once the service could run it now — the slot free,
    // the route's credential there when it sends to a model service — one that sends nothing asks for none here
    // either — and the device online when the route reaches its model over the network.
    if (plan.runControl?.resume != null) {
      const blockers: string[] = [];
      if (connectivity.slotBusy()) blockers.push(RESUME_BLOCKED_SLOT);
      if (plan.start.needsModelConnection && (await credentialReadiness()) === 'missing') blockers.push(RESUME_BLOCKED_CONNECTION);
      if (reaches && connectivity.reading() === 'offline') blockers.push(RESUME_BLOCKED_OFFLINE);
      plan = withResumeBlockers(plan, blockers);
    }
    // A Run waiting for the editor's answer goes on once answered (Issue #422, S76d; CLAR-006): it is answered only while
    // the service could take it on — the route's credential there, and the device online when the route reaches its
    // model over the network. A busy slot only queues it.
    if (plan.state.key === 'awaiting-clarification') {
      const blockers: string[] = [];
      if (plan.start.needsModelConnection && (await credentialReadiness()) === 'missing') blockers.push(ANSWER_BLOCKED_CONNECTION);
      if (reaches && connectivity.reading() === 'offline') blockers.push(ANSWER_BLOCKED_OFFLINE);
      plan = withAnswerBlockers(plan, blockers);
    }
    if (plan.state.key !== 'waiting') return plan;
    if (reaches && connectivity.reading() === 'offline') return withWaitingReason(plan, 'network');
    if ((await credentialReadiness()) === 'missing') return withWaitingReason(plan, 'connection');
    return withWaitingReason(plan, connectivity.slotBusy() ? 'slot' : 'admitting');
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
  ): AnalysisPreparationResult<BaselineAnalysisProjection> {
    return this.#baselineProgress(() => this.#baselineAnalysis.prepare({ phase: 'start', bookId, goal, update, reconfirm, launchPolicy, redoOf }));
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
  ): { projection: BaselineAnalysisProjection; dispatchRunRecordId: string | null } {
    const authorized = this.#analysisCall(() => this.#baselineAnalysis.authorize(bookId, taskIntentId, planEnvelopeDigest));
    return { projection: authorized.projection as BaselineAnalysisProjection, dispatchRunRecordId: authorized.dispatchRunRecordId };
  }

  /**
   * 联网后开始任务 (Issue #502; AUTH-004, OFF-005): the Book's baseline Task is authorized exactly as 开始任务 would
   * authorize it, and its Run waits in Connectivity Wait — nothing sent, no usage, nothing begun.
   */
  startBaselineAnalysisWhenOnline(bookId: string, taskIntentId: string, planEnvelopeDigest: string): BaselineAnalysisProjection {
    return this.#analysisCall(() => this.#baselineAnalysis.authorize(bookId, taskIntentId, planEnvelopeDigest, 'when-online')).projection as BaselineAnalysisProjection;
  }

  /** 取消 while the Book's baseline Run waits (OFF-010): terminal, before any dispatch, without provider work. */
  cancelWaitingBaselineAnalysis(bookId: string, taskIntentId: string): BaselineAnalysisProjection {
    return this.#analysisCall(() => this.#baselineAnalysis.cancelWaiting(bookId, taskIntentId)) as BaselineAnalysisProjection;
  }

  /**
   * 取消任务 on the Book's started baseline Run (Issue #422; CTRL-004 to CTRL-008): `cancelling` is recorded at once,
   * and the Run the execution owner must stop is named — `null` when the Run was already cancelled and nothing is left
   * to do. The owner stops it at the next unit boundary, or settles it at once when it holds no execution of it.
   */
  requestBaselineAnalysisCancel(bookId: string, taskIntentId: string): string | null {
    this.#assertAvailable();
    return this.#analysisCall(() => this.#baselineAnalysis.requestCancel(bookId, taskIntentId)).runRecordId;
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
    this.#analysisCall(() => this.#baselineAnalysis.editPlan(input.bookId, input));
    return this.inspectBaselineAnalysis(input.bookId, progress);
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
    const answered = this.#analysisCall(() => this.#baselineAnalysis.recordClarificationAnswer(input.bookId, input));
    return { runRecordId: answered.runRecordId, runState: answered.runState };
  }

  /**
   * 暂停 on the Book's baseline Run (Issue #422, S76b; CTRL-001): `pausing` is recorded at once and the Run the execution
   * owner must stop at the next unit boundary is named — `null` when it is already paused or left 可续行.
   */
  requestBaselineAnalysisPause(bookId: string, taskIntentId: string): string | null {
    this.#assertAvailable();
    return this.#analysisCall(() => this.#baselineAnalysis.requestPause(bookId, taskIntentId)).runRecordId;
  }

  /** The Book's paused or 可续行 baseline Run, which 续行 would continue (CONT-015). */
  continuableBaselineAnalysisRun(bookId: string, taskIntentId: string): string {
    this.#assertAvailable();
    return this.#analysisCall(() => this.#baselineAnalysis.continuableRun(bookId, taskIntentId));
  }

  /**
   * Startup reconciliation (CONT-014): the baseline Runs a stopped service left under way are settled `paused` or
   * `resumable`; the ones left cancelling are named for the execution owner to finish.
   */
  reconcileStoppedBaselineAnalysisRuns(): { settled: number; cancelling: ReadonlyArray<string>; answered: ReadonlyArray<string> } {
    this.#assertAvailable();
    return this.#analysisCall(() => this.#baselineAnalysis.reconcileStoppedRuns());
  }

  /**
   * What the drawer reads of the Task's Run when nothing executes it — paused, left 可续行, or left under way when AI7
   * closed: what it kept; for a stopped one, why 续行 cannot go on as authorized, if not; and — read by the execution
   * owner — whether this launch can still carry it under the binding it persisted.
   */
  #baselineStoppedRun(projection: BaselineAnalysisProjection, carriesStoppedRun: (runRecordId: string) => boolean): BaselineStoppedRunFacts | null {
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
        const checkpoints = this.#baselineAnalysis.unitCheckpoints(run.runRecordId);
        unitsSettled = checkpoints.length;
        unitsClosed = checkpoints.filter((checkpoint) => checkpoint.unit.closed.state === 'closed').length;
        // The units that asked the editor and have not settled since (Issue #422, S76d).
        const settled = new Set(checkpoints.map((checkpoint) => checkpoint.unit.unitOrdinal));
        waiting = this.#baselineAnalysis.clarificationsOf(run.runRecordId)
          .filter((request) => !settled.has(request.unitOrdinal))
          .map((request) => ({ unitOrdinal: request.unitOrdinal, answered: request.answer !== null }));
      } catch {
        // Its kept progress no longer reads back: 续行 names that, and a cancellation forms no revision from it.
        unitsSettled = null;
        unitsClosed = null;
      }
      const blockers = stopped ? [...this.#baselineAnalysis.continuationBlockers(run.runRecordId), ...(bindingHolds ? [] : [RESUME_BLOCKED_BINDING])] : [];
      // 模型服务账户限额 (Issue #51, S16b): the stop the provider's limit made, which 续行 takes on once it clears.
      const accountLimit = run.state === 'resumable' ? this.#baselineAnalysis.accountLimitOf(run.runRecordId) : null;
      return { unitsSettled, unitsClosed, unitsTotal, blockers, bindingHolds, waiting, accountLimit };
    });
  }

  /** The baseline Runs waiting in Connectivity Wait — the route Book's, or every Book's — oldest first. */
  waitingBaselineAnalysisRuns(bookId: string | null): Array<{ bookId: string; taskIntentId: string; runRecordId: string }> {
    this.#assertAvailable();
    return this.#analysisCall(() => this.#baselineAnalysis.waitingRuns()).filter((run) => bookId === null || run.bookId === bookId);
  }

  /** Reconnect Preflight's local half for one waiting Run: the labels of the material inputs that moved, or none. */
  baselineAnalysisPreflightDrift(runRecordId: string): ReadonlyArray<string> {
    this.#assertAvailable();
    return this.#analysisCall(() => this.#baselineAnalysis.preflightDrift(runRecordId));
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
    const authorization = projection.authorization;
    let startedBy: DefaultExecutionRuleReference | null = null;
    if (authorization !== null && authorization.origin === 'default-execution-rule' && authorization.ruleVersionId !== null) {
      const ruleVersionId = authorization.ruleVersionId;
      const found = this.#ruleCall(() => this.#rules.version(ruleVersionId));
      requireStore(found !== null && found.rule.bookId === projection.bookId, 'ANALYSIS_RECORD_INVALID', '运行授权指向的默认执行规则不存在。');
      startedBy = defaultExecutionRuleReference(found.rule, found.version);
    }
    const pattern = intent.mode;
    if (!isDefaultExecutionRulePattern(pattern)) {
      return { ...noDefaultRule(pattern === 'first-baseline' ? SET_RULE_FIRST_BASELINE : SET_RULE_RANGE), startedBy };
    }
    const rule = this.#ruleCall(() => this.#rules.forPattern(projection.bookId, pattern));
    const current = rule === null ? null : {
      ...defaultExecutionRuleReference(rule, rule.version),
      state: rule.state,
      fromThisPlan: rule.version.sourcePlanEnvelopeDigest === envelope.digest,
    };
    const reason = envelope.providerStatus === 'remote-eligible-developer-live'
      ? SET_RULE_DEVELOPER_LIVE
      : projection.planRevision !== null
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
      binds: defaultRuleBindingRows(defaultExecutionRuleBindingOf(version.materialInputs)),
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
    runtime: { credentialReadiness: () => Promise<'present' | 'missing' | null>; connectivity: TaskPlanConnectivity },
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
    if (envelope.dispatchAllowed && runtime.connectivity.slotBusy()) return fellBack(QUICK_START_SLOT_BUSY);
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
      binds: defaultRuleBindingRows(record.version.binding),
      setBy: '本机编辑',
      setAt: record.version.createdAt,
      stateRecordedAt: record.stateRecordedAt,
      sourceTaskIntentId: record.version.sourceTaskIntentId,
      sourcePlanEnvelopeDigest: record.version.sourcePlanEnvelopeDigest,
      binding: record.version.binding,
    };
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
    // A backup still under way stops at its next chunk rather than write on past the store (Issue #434 review).
    void this.#scheduledBackups.stop();
    // A database export still under way stops as 取消导出 stops it (Issue #434 review).
    void this.#databaseExports.stop();
    this.#taskAuthorization.prepare({ phase: 'cancel-all' });
    this.#reviewRuns.prepare({ phase: 'cancel-all' });
    this.#baselineAnalysis.prepare({ phase: 'cancel-all' });
    this.#factualReview.prepare({ phase: 'cancel-all' });
    for (const ledger of this.#reviewCategoryLedgers.values()) ledger.prepare({ phase: 'cancel-all' });
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
              ir.provenance_id import_provenance_id, ir.imported_at, fr.outcome fidelity_outcome
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
      asString(row.parser_identity),
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
        label: `${structureLabel === null ? '' : `${structureLabel} · `}第 ${blockPosition} / ${totalBlocks} 个内容块`,
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

  /**
   * The rows a Manuscript Reimport Record resolved and what its marks came to (Issue #412, plan slice S63): the first
   * `MAX_REIMPORT_RECORD_ITEMS` of each, the counts saying how many there were. A record made before the chapter-level
   * comparison has neither.
   */
  #reimportRecordResolutions(reimportRecordId: string): Pick<Extract<BookRecordPresentation, { kind: 'manuscript-reimport-record' }>, 'groups' | 'markOutcomes'> {
    const groupCount = one(this.#authority.prepare(
      `SELECT count(*) total FROM manuscript_reimport_groups g
       JOIN manuscript_reimport_records r ON r.comparison_id = g.comparison_id WHERE r.reimport_record_id = ?`,
    ).all(reimportRecordId) as SqlRow[], 'BOOK_RECORD_GRAPH_INVALID', '稿件重新导入记录的对应行无法读取。');
    const groups = (this.#authority.prepare(
      `SELECT g.ordinal, g.chapter_label, g.current_from, g.current_to, g.staged_from, g.staged_to, gr.verb
       FROM manuscript_reimport_groups g
       JOIN manuscript_reimport_records r ON r.comparison_id = g.comparison_id
       JOIN manuscript_reimport_group_resolutions gr ON gr.group_id = g.group_id
       WHERE r.reimport_record_id = ? ORDER BY g.ordinal LIMIT ${MAX_REIMPORT_RECORD_ITEMS}`,
    ).all(reimportRecordId) as SqlRow[]).map((row) => {
      const verb = asString(row.verb) as ReimportGroupVerb;
      return {
        ordinal: asNumber(row.ordinal),
        verb,
        verbLabel: REIMPORT_GROUP_VERB_LABELS[verb],
        chapterLabel: row.chapter_label === null ? null : asString(row.chapter_label),
        currentFrom: row.current_from === null ? null : asNumber(row.current_from),
        currentTo: row.current_to === null ? null : asNumber(row.current_to),
        stagedFrom: row.staged_from === null ? null : asNumber(row.staged_from),
        stagedTo: row.staged_to === null ? null : asNumber(row.staged_to),
      };
    });
    const counts = one(this.#authority.prepare(
      `SELECT count(CASE WHEN outcome = 'followed' THEN 1 END) followed, count(CASE WHEN outcome = 'unfollowed' THEN 1 END) unfollowed
       FROM manuscript_reimport_mark_outcomes WHERE reimport_record_id = ?`,
    ).all(reimportRecordId) as SqlRow[], 'BOOK_RECORD_GRAPH_INVALID', '稿件重新导入记录的标记结果无法读取。');
    const unfollowed = (this.#authority.prepare(
      `SELECT mark_id, kind, words, from_position FROM manuscript_reimport_mark_outcomes
       WHERE reimport_record_id = ? AND outcome = 'unfollowed' ORDER BY from_position, mark_id LIMIT ${MAX_REIMPORT_RECORD_ITEMS}`,
    ).all(reimportRecordId) as SqlRow[]).map((row) => ({
      markId: asString(row.mark_id),
      kind: asString(row.kind) as EditorialMarkKind,
      words: asString(row.words),
      fromPosition: asNumber(row.from_position),
    }));
    return {
      groups: { count: asNumber(groupCount.total), items: groups },
      markOutcomes: { followed: asNumber(counts.followed), unfollowed: asNumber(counts.unfollowed), items: unfollowed },
    };
  }

  #reimportRecordPresentations(
    bookId: string,
    recordIds: ReadonlyArray<string>,
  ): BookRecordPresentation[] {
    if (recordIds.length === 0) return [];
    const rows = this.#authority.prepare(
      `SELECT rr.*, sv.display_name, sv.format, sv.source_digest, sv.content_digest, sv.structure_digest,
              sv.parser_identity, sv.working_object_digest, sv.converter_identity,
              co.byte_length source_bytes, sp.acquisition_path, sp.locality,
              fr.outcome fidelity_outcome, fr.review_digest fidelity_review_digest,
              dd.decision degradation_decision
       FROM manuscript_reimport_records rr
       JOIN source_versions sv ON sv.source_version_id = rr.source_version_id AND sv.book_id = rr.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN source_provenance sp ON sp.provenance_id = rr.provenance_id AND sp.source_version_id = rr.source_version_id
       JOIN import_fidelity_reviews fr
         ON fr.fidelity_review_id = rr.fidelity_review_id AND fr.source_version_id = rr.source_version_id
       LEFT JOIN import_degradation_decisions dd
         ON dd.degradation_decision_id = rr.degradation_decision_id
        AND dd.fidelity_review_id = rr.fidelity_review_id
       WHERE rr.book_id = ? AND rr.reimport_record_id IN (${recordIds.map(() => '?').join(', ')})
       ORDER BY rr.imported_at, rr.reimport_record_id`,
    ).all(bookId, ...recordIds) as SqlRow[];
    const records: BookRecordPresentation[] = [];
    const presentedSources = new Set<string>();
    for (const row of rows) {
      const sourceVersionId = asString(row.source_version_id);
      const provenanceId = asString(row.provenance_id);
      const resultKind = asString(row.result_kind) as 'changed' | 'no-change';
      const resultLabel = asString(row.result_label) as '稿件已重新导入' | '未发现稿件变化';
      const lineageStatus = asString(row.lineage_status) as 'verified' | 'unconfirmed';
      const lineageSourceVersionId = row.lineage_source_version_id === null
        ? null
        : asString(row.lineage_source_version_id);
      const comparisonKind = asString(row.comparison_kind) as 'three-way' | 'two-way';
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
        asString(row.parser_identity),
        'BOOK_RECORD_GRAPH_INVALID',
        '稿件重新导入保真与降级证据不完整。',
      );
      requireStore(fidelityPlan !== undefined && fidelityPlan.outcome === asString(row.fidelity_outcome) &&
        ((fidelityPlan.degradations.length === 0 && row.degradation_decision_id === null && row.degradation_decision === null) ||
          (fidelityPlan.degradations.length > 0 && row.degradation_decision_id !== null &&
            row.degradation_decision === canonicalDegradationDecision(fidelityPlan))),
      'BOOK_RECORD_GRAPH_INVALID', '稿件重新导入保真与降级证据不完整。');
      const recordDigest = sha256(canonicalJson({
        schema: MANUSCRIPT_REIMPORT_RECORD_SCHEMA,
        reimportRecordId: asString(row.reimport_record_id),
        commitId: asString(row.commit_id),
        bookId: asString(row.book_id),
        manuscriptId: asString(row.manuscript_id),
        branchId: asString(row.branch_id),
        sourceVersionId,
        provenanceId,
        previousRevisionId: asString(row.previous_revision_id),
        resultingRevisionId: row.resulting_revision_id === null ? null : asString(row.resulting_revision_id),
        resultKind,
        resultLabel,
        lineageStatus,
        lineageSourceVersionId,
        comparisonKind,
        comparisonDigest: asString(row.comparison_digest),
        resolutionDigest: asString(row.resolution_digest),
        fidelityReviewId,
        degradationDecisionId: row.degradation_decision_id === null ? null : asString(row.degradation_decision_id),
        importedAt: asString(row.imported_at),
      }));
      requireStore(
        (resultKind === 'changed' || resultKind === 'no-change') &&
          (lineageStatus === 'verified' || lineageStatus === 'unconfirmed') &&
          (comparisonKind === 'three-way' || comparisonKind === 'two-way') &&
          asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
          recordDigest === asString(row.record_digest),
        'BOOK_RECORD_GRAPH_INVALID',
        '稿件重新导入记录图或摘要无效。',
      );
      if (!presentedSources.has(sourceVersionId)) {
        // A reimport compares parsed blocks, so its Source Version always carries a whole parse.
        requireStore(
          row.parser_identity !== null && row.content_digest !== null && row.structure_digest !== null,
          'BOOK_RECORD_GRAPH_INVALID',
          '稿件重新导入的来源版本缺少本地解析身份。',
        );
        records.push({
          kind: 'source',
          label: '来源版本与来源记录',
          sourceVersionId,
          provenanceId,
          bookId,
          displayName: asString(row.display_name),
          format: requireSourceFormat(asString(row.format)),
          sourceDigest: asString(row.source_digest),
          contentDigest: asString(row.content_digest),
          structureDigest: asString(row.structure_digest),
          parserIdentity: asString(row.parser_identity),
          workingObjectDigest: sourceConversion === null ? null : asString(row.working_object_digest),
          converterIdentity: sourceConversion === null ? null : sourceConversion.converterIdentity,
          acquisitionPath: 'native-file-picker',
          locality: 'local-provider-free',
        });
        presentedSources.add(sourceVersionId);
      }
      records.push({
        kind: 'manuscript-reimport-record',
        label: '稿件重新导入记录',
        reimportRecordId: asString(row.reimport_record_id),
        commitId: asString(row.commit_id),
        bookId,
        manuscriptId: asString(row.manuscript_id),
        sourceVersionId,
        provenanceId,
        previousRevisionId: asString(row.previous_revision_id),
        resultingRevisionId: row.resulting_revision_id === null ? null : asString(row.resulting_revision_id),
        resultKind,
        resultLabel,
        lineageStatus,
        lineageLabel: lineageStatus === 'verified' ? '来源关系已确认' : '来源关系未确认',
        lineageSourceVersionId,
        comparisonKind,
        comparisonDigest: asString(row.comparison_digest),
        resolutionDigest: asString(row.resolution_digest),
        fidelityReviewId,
        fidelityOutcome: fidelityPlan.outcome,
        fidelityCategories,
        degradationDecisionId: row.degradation_decision_id === null ? null : asString(row.degradation_decision_id),
        degradationDecision: row.degradation_decision_id === null
          ? null
          : { summaryLabel: '含已接受的降级', acceptedItems: fidelityPlan.degradations },
        ...this.#reimportRecordResolutions(asString(row.reimport_record_id)),
        recordDigest,
        importedAt: asString(row.imported_at),
      });
    }
    return records;
  }

  #sourceImportRecordPresentations(
    bookId: string,
    recordIds: ReadonlyArray<string>,
  ): BookRecordPresentation[] {
    if (recordIds.length === 0) return [];
    const rows = this.#authority.prepare(
      `SELECT sir.source_import_record_id, sir.commit_id, sir.book_id, sir.source_version_id,
              sir.provenance_id, sir.target_kind, sir.source_version_disposition, sir.retained_boundary_json,
              sir.named_non_effects_json, sir.record_digest, sir.imported_at,
              sv.display_name, sv.format, sv.source_digest, sv.content_digest, sv.structure_digest,
              sv.parser_identity, sv.working_object_digest, sv.converter_identity,
              co.byte_length, sp.acquisition_path, sp.locality,
              sp.sanitized_identity
       FROM source_import_records sir
       JOIN source_versions sv
         ON sv.source_version_id = sir.source_version_id AND sv.book_id = sir.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN source_provenance sp
         ON sp.provenance_id = sir.provenance_id AND sp.source_version_id = sir.source_version_id
       WHERE sir.book_id = ? AND sir.source_import_record_id IN (${recordIds.map(() => '?').join(', ')})
       ORDER BY sir.imported_at, sir.source_import_record_id`,
    ).all(bookId, ...recordIds) as SqlRow[];
    const records: BookRecordPresentation[] = [];
    const presentedSources = new Set<string>();
    for (const row of rows) {
      const sourceVersionId = asString(row.source_version_id);
      const provenanceId = asString(row.provenance_id);
      const disposition = asString(row.source_version_disposition);
      const targetKind = asString(row.target_kind);
      requireStore(
        (targetKind === 'new-book' || targetKind === 'existing-book') &&
          (disposition === 'created' || disposition === 'reused-same-book') &&
          asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free',
        'BOOK_RECORD_GRAPH_INVALID',
        '来源导入记录图不完整。',
      );
      const retained = parseStoredJson(asString(row.retained_boundary_json), '来源导入保留边界无效。');
      const namedNonEffects = parseStoredJson(asString(row.named_non_effects_json), '来源导入非影响记录无效。');
      requireStore(
        retained !== null && typeof retained === 'object' && !Array.isArray(retained) &&
          Array.isArray(namedNonEffects) && namedNonEffects.every((item) => typeof item === 'string') &&
          canonicalJson(namedNonEffects) === canonicalJson(SOURCE_IMPORT_NON_EFFECTS),
        'BOOK_RECORD_GRAPH_INVALID',
        '来源导入保留边界或非影响记录不完整。',
      );
      const boundary = retained as Record<string, unknown>;
      // A Source Version is either wholly parsed or wholly unparsed, and its record says which.
      const parserIdentity = row.parser_identity === null ? null : asString(row.parser_identity);
      const contentDigest = row.content_digest === null ? null : asString(row.content_digest);
      const structureDigest = row.structure_digest === null ? null : asString(row.structure_digest);
      const format = requireSourceFormat(asString(row.format));
      requireStore(
        boundary.kind === 'complete-local-file' && boundary.label === retainedBoundaryLabel(parserIdentity !== null) &&
          boundary.format === format && boundary.displayName === asString(row.sanitized_identity) &&
          boundary.sourceSha256 === asString(row.source_digest) &&
          (boundary.contentDigest ?? null) === contentDigest &&
          (boundary.structureDigest ?? null) === structureDigest &&
          typeof boundary.sourceBytes === 'number' && Number.isSafeInteger(boundary.sourceBytes) &&
          boundary.sourceBytes === asNumber(row.byte_length),
        'BOOK_RECORD_GRAPH_INVALID',
        '来源导入保留边界与来源版本不一致。',
      );
      const recordDigest = sha256(canonicalJson({
        schema: SOURCE_IMPORT_RECORD_SCHEMA,
        sourceImportRecordId: asString(row.source_import_record_id),
        commitId: asString(row.commit_id),
        bookId: asString(row.book_id),
        sourceVersionId,
        provenanceId,
        targetKind,
        sourceVersionDisposition: disposition,
        retainedBoundary: retained,
        namedNonEffects,
        importedAt: asString(row.imported_at),
      }));
      requireStore(recordDigest === asString(row.record_digest), 'BOOK_RECORD_GRAPH_INVALID', '来源导入记录摘要无效。');
      if (!presentedSources.has(sourceVersionId)) {
        const conversion = readConversionColumns(row, format, '来源版本的转换记录不完整。');
        records.push({
          kind: 'source',
          label: '来源版本与来源记录',
          sourceVersionId,
          provenanceId,
          bookId,
          displayName: asString(row.display_name),
          format,
          sourceDigest: asString(row.source_digest),
          contentDigest,
          structureDigest,
          parserIdentity,
          workingObjectDigest: conversion === null ? null : asString(row.working_object_digest),
          converterIdentity: conversion === null ? null : conversion.converterIdentity,
          acquisitionPath: 'native-file-picker',
          locality: 'local-provider-free',
        });
        presentedSources.add(sourceVersionId);
      }
      records.push({
        kind: 'source-import-record',
        label: '来源导入记录',
        sourceImportRecordId: asString(row.source_import_record_id),
        commitId: asString(row.commit_id),
        bookId,
        sourceVersionId,
        provenanceId,
        targetKind,
        sourceVersionDisposition: disposition,
        retainedBoundary: {
          kind: 'complete-local-file',
          format,
          displayName: asString(row.sanitized_identity),
          sourceSha256: asString(row.source_digest),
          sourceBytes: boundary.sourceBytes,
          contentDigest,
          structureDigest,
        },
        namedNonEffects: namedNonEffects as string[],
        recordDigest,
        importedAt: asString(row.imported_at),
      });
    }
    return records;
  }

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
  inspectReviewGuidelines(): ReviewGuidelinesProjection {
    return this.#guidelineCall(() => this.#reviewGuidelines.projection());
  }

  /**
   * 知识库 › 范例 (Issue #427, S79b; KB-004, KB-006): one page of the published Books' delivered documents, each record read
   * through its owner — the designations and their 撤回 through 发稿版本's, the Delivery Records through the documents'.
   */
  inspectExemplars(after: ExemplarBookCursor | null): ExemplarsProjection {
    if (after !== null) {
      requireStore(UUID_PATTERN.test(after.bookId) && after.title === safeTitle(after.title), 'EXEMPLAR_CURSOR_INVALID', '范例列表位置无效。');
    }
    return this.#publicationCall(() => readExemplars({
      books: (cursor, limit) => this.#publicationVersions.designatedBooks(cursor, limit),
      designations: (bookId) => this.#publicationVersions.history(bookId),
      documents: (bookId) => this.#documentCall(() => this.#productionDocuments.deliveryReadings(bookId)),
      people: (bookId) => this.#peopleCall(() => this.#bookPeople.current(bookId)),
    }, after));
  }

  /**
   * 知识库 › 工序与规则 (Issue #427, S79d; KB-010): the review categories' 工序 as they apply now, and the native artifact as
   * its owner reads it for the house.
   */
  async inspectKnowledgeProcedures(): Promise<KnowledgeProceduresProjection> {
    const profile = await this.#artifactCall(() => this.#editorialWorkspaceProfile.house());
    return this.#guidelineCall(() => readKnowledgeProcedures(this.#authority, this.#reviewGuidelines.configuration(), profile));
  }

  /** 导入新版本's first step: the picked file's clauses as the next version of one document would read them; nothing is recorded. */
  async previewReviewGuidelineVersion(documentId: string, path: string): Promise<ReviewGuidelinePreviewProjection> {
    this.#assertAvailable();
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
  async addLibraryMaterial(input: { previewId: string; title: string; kind: LibraryMaterialKind }): Promise<LibraryMaterialProjection> {
    this.#assertAvailable();
    let kept: Awaited<ReturnType<LibraryMaterialLedger['keep']>>;
    try {
      libraryMaterialTitle(input.title);
      kept = await this.#libraryMaterials.keep(input.previewId);
    } catch (error) {
      if (error instanceof LibraryMaterialError) throw new StoreError(error.code, error.message);
      throw error;
    }
    const materialId = this.#libraryCall(() => this.#transaction(this.#authority, () => this.#libraryMaterials.record(kept, input.title, input.kind)));
    // The one item it made: the page it joins is read again by the renderer's own paging, never re-sent whole.
    return this.inspectLibraryMaterial(materialId);
  }

  /** 定归属 or 定学习准入 (KB-007, LEARN-007): one decision appended to the item's chain, and the item as it now reads. */
  decideLibraryMaterial(input: { materialId: string; expectedDecisions: number; decision: LibraryMaterialDecisionInput }): LibraryMaterialProjection {
    this.#libraryCall(() => this.#transaction(this.#authority, () =>
      this.#libraryMaterials.decide(input.materialId, input.expectedDecisions, input.decision)));
    return this.inspectLibraryMaterial(input.materialId);
  }

  /** 知识库 › 评估方案 (Issue #429, S81a; KB-001, EVAL-003): the profile a new 评估 version snapshots, and its use. */
  inspectEvaluationProfiles(): EvaluationProfilesProjection {
    return this.#evaluationCall(() => this.#evaluations.profiles());
  }

  /** ②C 评估 of one Book (Issue #429, S81a; EVAL-001, EVAL-012): its versions, one on show, and whether one can begin. */
  inspectEvaluation(bookId: string, recordId: string | null): EvaluationWorkspaceProjection {
    return this.#evaluationCall(() => this.#evaluations.workspace(bookId, this.#evaluationBookTitle(bookId), recordId));
  }

  /** 开始评估 or 重新评估: a new version bound to the manuscript's current revision, and the page with it on show. */
  startEvaluation(bookId: string): EvaluationWorkspaceProjection {
    return this.#evaluationCall(() => {
      const title = this.#evaluationBookTitle(bookId);
      const recordId = this.#transaction(this.#authority, () => this.#evaluations.start(bookId));
      return this.#evaluations.workspace(bookId, title, recordId);
    });
  }

  /** 保存评估 or 定稿: the editor's content appended to the version's chain, and the page as it now reads. */
  saveEvaluation(input: { bookId: string; recordId: string; expectedEntries: number; content: unknown; finalize: boolean }): EvaluationWorkspaceProjection {
    return this.#evaluationCall(() => {
      const title = this.#evaluationBookTitle(input.bookId);
      this.#transaction(this.#authority, () => this.#evaluations.save(input.bookId, input.recordId, input.expectedEntries, input.content, input.finalize));
      return this.#evaluations.workspace(input.bookId, title, input.recordId);
    });
  }

  #evaluationBookTitle(bookId: string): string {
    requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    return asString(one(this.#authority.prepare('SELECT title FROM books WHERE book_id = ?').all(bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。').title);
  }

  /**
   * Where a new 评估 version binds (Issue #429, S81a; EVAL-001): the Book's primary manuscript at its branch's current revision,
   * and whether edits wait in its journal beyond it; `null` for a Book without a manuscript.
   */
  #evaluationManuscript(bookId: string): { manuscriptId: string; revisionId: string; revisionLabel: string; uncheckpointed: boolean } | null {
    const rows = this.#authority.prepare(
      `SELECT m.manuscript_id, bws.base_revision_id, mr.revision_label, bws.journal_sequence, bws.last_checkpoint_sequence
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       JOIN branch_working_state bws ON bws.manuscript_id = m.manuscript_id AND bws.branch_id = mb.branch_id
       JOIN manuscript_revisions mr ON mr.revision_id = bws.base_revision_id
       WHERE m.book_id = ? AND m.role = 'primary'`,
    ).all(bookId) as SqlRow[];
    requireStore(rows.length <= 1, 'BOOK_MANUSCRIPT_STATE_INVALID', '图书主稿件关系或记录图不完整。');
    const row = rows[0];
    if (row === undefined) return null;
    return {
      manuscriptId: asString(row.manuscript_id),
      revisionId: asString(row.base_revision_id),
      revisionLabel: asString(row.revision_label),
      uncheckpointed: asNumber(row.journal_sequence) > asNumber(row.last_checkpoint_sequence),
    };
  }

  /**
   * ②A 分析反馈 (Issue #94, S38; ANALYSIS-023, ANALYSIS-024): one Result Set Revision of the Book's baseline analysis — the
   * latest or an older one — with each item it holds, its latest judgment, and the Book's Analysis Quality Metric.
   */
  inspectAnalysisFeedback(bookId: string, revisionId: string): AnalysisFeedbackProjection {
    return this.#feedbackCall(() => {
      const revision = this.#feedbackRevision(bookId, revisionId);
      return this.#analysisFeedback.projection(bookId, revision.bound, revision.items);
    });
  }

  /** 记录反馈: one explicit judgment appended as a Quality Signal, and the revision's feedback as it now reads. */
  recordAnalysisFeedback(input: RecordAnalysisFeedbackInput & { bookId: string }): AnalysisFeedbackProjection {
    return this.#feedbackCall(() => {
      const revision = this.#feedbackRevision(input.bookId, input.revisionId);
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
    return this.#learningCall(() => {
      requireStore(bookId === null || UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
      requireStore(after === null || (UUID_PATTERN.test(after.bookId) && after.bookTitle === safeTitle(after.bookTitle) &&
        !Number.isNaN(Date.parse(after.orderedAt)) && LEARNING_MATERIAL_KEY_PATTERN.test(after.materialKey)),
      'LEARNING_CURSOR_INVALID', '学习准入列表位置无效。');
      const rows = (bookId === null
        ? after === null
          ? this.#authority.prepare('SELECT book_id, title FROM books ORDER BY title, book_id').all()
          : this.#authority.prepare('SELECT book_id, title FROM books WHERE title > ? OR (title = ? AND book_id >= ?) ORDER BY title, book_id')
            .all(after.bookTitle, after.bookTitle, after.bookId)
        : this.#authority.prepare('SELECT book_id, title FROM books WHERE book_id = ?').all(bookId)) as SqlRow[];
      // Up to one material beyond the page, so the page knows whether another follows.
      const collected: Array<{ bookId: string; title: string; material: LearningMaterialProjection; orderedAt: string }> = [];
      for (const row of rows) {
        const id = asString(row.book_id);
        const title = asString(row.title);
        const materials = this.#learningMaterialsOf(id, true)
          .filter((entry) => after === null || id !== after.bookId || learningMaterialOrder({ materialKey: entry.material.materialKey, orderedAt: entry.orderedAt }, after) > 0);
        for (const { material, orderedAt } of materials) {
          collected.push({ bookId: id, title, material, orderedAt });
          if (collected.length > MAX_LEARNING_MATERIALS_PAGE) break;
        }
        if (collected.length > MAX_LEARNING_MATERIALS_PAGE) break;
      }
      const shown = collected.slice(0, MAX_LEARNING_MATERIALS_PAGE);
      const books: LearningMaterialsBookProjection[] = [];
      for (const entry of shown) {
        const book = books.at(-1);
        if (book !== undefined && book.bookId === entry.bookId) (book.materials as LearningMaterialProjection[]).push(entry.material);
        else books.push({ ...this.#learningBookOf(entry.bookId, entry.title), materials: [entry.material] });
      }
      // A Book named by itself is shown even while it has no material.
      if (bookId !== null && after === null && books.length === 0 && rows.length === 1) books.push({ ...this.#learningBookOf(bookId, asString(rows[0]!.title)), materials: [] });
      const last = shown.at(-1);
      return {
        basis: LEARNING_ELIGIBILITY_BASIS,
        books,
        nextCursor: collected.length > MAX_LEARNING_MATERIALS_PAGE && last !== undefined
          ? { bookTitle: last.title, bookId: last.bookId, orderedAt: last.orderedAt, materialKey: last.material.materialKey }
          : null,
      };
    });
  }

  /** One Learning Material as its Review Card reads it: what a decision answers with, and what a refusal reads again. */
  inspectLearningMaterial(bookId: string, materialKey: string): LearningMaterialProjection {
    return this.#learningCall(() => {
      requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
      const found = this.#learningMaterialsOf(bookId, true).find((entry) => entry.material.materialKey === materialKey);
      requireStore(found !== undefined, 'LEARNING_MATERIAL_NOT_FOUND', '这条材料已经不在学习准入之列。');
      return found.material;
    });
  }

  /** 记录学习准入决定 for the exact version the editor read, attributed to the Book's people as they stand (FDBK-013). */
  decideLearningMaterial(input: DecideLearningMaterialInput): LearningMaterialProjection {
    this.#learningCall(() => {
      requireStore(UUID_PATTERN.test(input.bookId), 'BOOK_INVALID', '图书标识无效。');
      this.#transaction(this.#authority, () => {
        const candidate = this.#learningCandidates(input.bookId, false).find((entry) => entry.materialKey === input.materialKey);
        requireStore(candidate !== undefined, 'LEARNING_MATERIAL_NOT_FOUND', '这条材料已经不在学习准入之列。');
        requireStore(learningMaterialDigest(candidate) === input.materialDigest, 'LEARNING_MATERIAL_CHANGED', '这条材料在你打开后改过；请看过现在的内容再定。');
        const people = this.#bookPeople.current(input.bookId);
        this.#learningEligibility.decide({
          bookId: input.bookId,
          candidate,
          expectedDecisions: input.expectedDecisions,
          choice: input.choice,
          note: input.note,
          attribution: { peopleVersion: people.version, authors: people.authors, editors: people.editors },
        });
      });
    });
    // The one material it decided: the page it sits on is never re-sent whole.
    return this.inspectLearningMaterial(input.bookId, input.materialKey);
  }

  /**
   * 质量与学习 › 反馈历史 (Issue #61, plan slice S26c; FDBK-009, FDBK-010, FDBK-013): the editor's feedback, newest first — each
   * 修改建议's current decision with its reason as it stands, each analysis item's latest judgment, each 审阅 finding's latest
   * 忽略 — with where it opens and the Book's people it is attributed to: the version in force when it was given, or the first
   * saved after it (Issue #61 review). One answer holds what `feedbackHistoryPage` admits, each reason bounded. Passive
   * history: a read, asking nothing.
   */
  inspectFeedbackHistory(): FeedbackHistoryProjection {
    return this.#learningCall(() => {
      const entries: Array<Omit<FeedbackHistoryEntryProjection, 'peopleVersion'>> = [];
      const reasons = new DecisionFeedbackLedger(this.#authority);
      const decisions = this.#authority.prepare(
        `SELECT m.book_id, m.mark_id, m.manuscript_id, m.branch_id, m.block_id, m.anchor_state, m.source_origin, m.source_label,
                d.decision_id, d.disposition, d.recorded_at, r.reason, r.reason_source
         FROM editorial_marks m
         JOIN proposal_change_items i ON i.mark_id = m.mark_id
         JOIN proposal_item_decisions d ON d.item_id = i.item_id
         LEFT JOIN proposal_decision_reasons r ON r.decision_id = d.decision_id
         WHERE m.status IN ('open', 'resolved', 'applied') AND d.disposition <> 'withdrawn'
           AND d.ordinal = (SELECT max(latest.ordinal) FROM proposal_item_decisions latest WHERE latest.item_id = i.item_id)`,
      ).all() as SqlRow[];
      for (const row of decisions) {
        const decisionId = asString(row.decision_id);
        const first = row.reason === null || row.reason === undefined
          ? null
          : { reason: asString(row.reason), source: asString(row.reason_source) as 'reason-field' | 'suggested' | 'free-text' };
        const standing = reasons.standing(decisionId, first);
        const bookId = asString(row.book_id);
        entries.push({
          entryId: `proposal-decision:${decisionId}`,
          origin: 'proposal-decision',
          bookId,
          // A 修改建议 a 审阅 category made is about that category (Issue #61 review); one the editor or a Task made names none.
          dimension: row.source_origin === 'review-category' ? asString(row.source_label) : null,
          signal: DISPOSITION_LABELS[asString(row.disposition)] ?? asString(row.disposition),
          reason: feedbackReasonExcerpt(standing.reason),
          reasonState: standing.reasonState,
          recordedAt: asString(row.recorded_at),
          target: {
            kind: 'mark', bookId, manuscriptId: asString(row.manuscript_id), branchId: asString(row.branch_id), blockId: asString(row.block_id),
            markId: asString(row.mark_id), detached: row.anchor_state === 'detached',
          },
        });
      }
      for (const book of this.#authority.prepare('SELECT book_id FROM books').all() as SqlRow[]) {
        const bookId = asString(book.book_id);
        for (const signal of this.#analysisFeedback.latest(bookId)) {
          const reason = [analysisReasonLabel(signal), signal.correction === null ? null : `修正：${signal.correction}`].filter((part) => part !== null).join(' · ');
          entries.push({
            entryId: `analysis-feedback:${signal.revisionId}/${signal.itemKey}`,
            origin: 'analysis-feedback',
            bookId,
            dimension: DIMENSION_LABELS[signal.dimension],
            signal: JUDGMENT_LABELS[signal.judgment],
            reason: feedbackReasonExcerpt(reason.length === 0 ? null : reason),
            reasonState: reason.length === 0 ? 'none' : 'given',
            recordedAt: signal.recordedAt,
            target: { kind: 'analysis', bookId, revisionId: signal.revisionId, itemKey: signal.itemKey, dimension: signal.dimension },
          });
        }
      }
      const ignored = this.#authority.prepare(
        `SELECT book_id, review_run_id, finding_id, category_id, reason, recorded_at FROM quality_signals q
         WHERE kind = 'review-finding-ignored'
           AND recorded_at = (SELECT max(latest.recorded_at) FROM quality_signals latest
                              WHERE latest.review_run_id = q.review_run_id AND latest.finding_id = q.finding_id)`,
      ).all() as SqlRow[];
      for (const row of ignored) {
        const bookId = asString(row.book_id);
        const categoryId = asString(row.category_id);
        entries.push({
          entryId: `review-disposition:${asString(row.review_run_id)}/${asString(row.finding_id)}`,
          origin: 'review-disposition',
          bookId,
          dimension: reviewCategoryEntry(categoryId)?.label ?? categoryId,
          signal: '忽略',
          reason: feedbackReasonExcerpt(asString(row.reason)),
          reasonState: 'given',
          recordedAt: asString(row.recorded_at),
          target: { kind: 'review', bookId, reviewRunId: asString(row.review_run_id), findingId: asString(row.finding_id) },
        });
      }
      // Each entry is attributed to the Book's people as they stood when it was given, or as first saved after it.
      const versions = new Map<string, ReturnType<BookPeople['versions']>>();
      const versionsOf = (bookId: string): ReturnType<BookPeople['versions']> => {
        let found = versions.get(bookId);
        if (found === undefined) {
          found = this.#bookPeople.versions(bookId);
          versions.set(bookId, found);
        }
        return found;
      };
      const attributed: FeedbackHistoryEntryProjection[] = entries.map((entry) => {
        const all = versionsOf(entry.bookId);
        const inForce = all.filter((version) => version.recordedAt <= entry.recordedAt).at(-1) ?? all[0];
        return { ...entry, peopleVersion: inForce?.version ?? 0 };
      });
      attributed.sort((a, b) => (a.recordedAt > b.recordedAt ? -1 : a.recordedAt < b.recordedAt ? 1 : a.entryId < b.entryId ? -1 : 1));
      return feedbackHistoryPage(
        attributed,
        (bookId) => {
          const people = this.#bookPeople.current(bookId);
          return { bookId, title: this.#evaluationBookTitle(bookId), authors: people.authors, editors: people.editors };
        },
        (bookId, version) => {
          const found = versionsOf(bookId).find((entry) => entry.version === version);
          return found === undefined ? null : { version: found.version, authors: found.authors, editors: found.editors };
        },
      );
    });
  }

  /** A Book's heading on the page: its title, its people, and how many materials it has in all. */
  #learningBookOf(bookId: string, title: string): Omit<LearningMaterialsBookProjection, 'materials'> {
    const people = this.#bookPeople.current(bookId);
    return { bookId, title, authors: people.authors, editors: people.editors, materialCount: this.#learningCandidates(bookId, false).length };
  }

  /** A Book's Learning Material as the page orders it — by kind, then by when each came to be, then by place — with that time. */
  #learningMaterialsOf(bookId: string, withExcerpt: boolean): Array<{ material: LearningMaterialProjection; orderedAt: string }> {
    const candidates = this.#learningCandidates(bookId, withExcerpt).sort((a, b) => learningMaterialOrder(a, b));
    return this.#learningEligibility.project(bookId, candidates).map((material, index) => ({ material, orderedAt: candidates[index]!.orderedAt }));
  }

  /**
   * One Book's Learning Material, identified from the records that own it (LEARN-001): each 修改建议's current decision that
   * carries the editor's reason or their own wording, each analysis item whose latest judgment says why, and each 审阅
   * finding the editor last ignored with a reason. Nothing is asked of the editor to find them.
   */
  #learningCandidates(bookId: string, withExcerpt: boolean): LearningMaterialCandidate[] {
    const candidates: LearningMaterialCandidate[] = [];
    const reasons = new DecisionFeedbackLedger(this.#authority);
    const decisions = this.#authority.prepare(
      `SELECT i.current_text, i.proposed_text, d.decision_id, d.disposition, d.edited_text, d.recorded_at, r.reason, r.reason_source
       FROM editorial_marks m
       JOIN proposal_change_items i ON i.mark_id = m.mark_id
       JOIN proposal_item_decisions d ON d.item_id = i.item_id
       LEFT JOIN proposal_decision_reasons r ON r.decision_id = d.decision_id
       WHERE m.book_id = ? AND m.status IN ('open', 'resolved', 'applied') AND d.disposition <> 'withdrawn'
         AND d.ordinal = (SELECT max(latest.ordinal) FROM proposal_item_decisions latest WHERE latest.item_id = i.item_id)
       ORDER BY d.recorded_at, d.decision_id`,
    ).all(bookId) as SqlRow[];
    for (const row of decisions) {
      const decisionId = asString(row.decision_id);
      const first = row.reason === null || row.reason === undefined
        ? null
        : { reason: asString(row.reason), source: asString(row.reason_source) as 'reason-field' | 'suggested' | 'free-text' };
      const standing = reasons.standing(decisionId, first);
      const disposition = asString(row.disposition);
      if (standing.reasonState !== 'given' && disposition !== 'accepted-with-edit') continue;
      // 保留当前稿件 resolved a conflict with a rejection whose reason AI7 wrote (Issue #57): the editor judged no suggestion
      // by it, so it is material only once they give a reason of their own.
      if (standing.reasonRevisedAt === null && decisionResolvesConflict(this.#authority, decisionId)) continue;
      candidates.push(proposalDecisionCandidate({
        decisionId,
        disposition,
        currentText: asString(row.current_text),
        proposedText: asString(row.proposed_text),
        editedText: row.edited_text === null ? null : asString(row.edited_text),
        reason: standing.reason,
        reasonSource: standing.reasonSource,
        recordedAt: standing.reasonRevisedAt ?? asString(row.recorded_at),
        decidedAt: asString(row.recorded_at),
      }, withExcerpt));
    }
    const labels = new Map<string, BaselineAnalysisResultSetRevisionProjection | null>();
    for (const signal of this.#analysisFeedback.latestWithWords(bookId)) {
      let label: string | null = null;
      if (withExcerpt) {
        if (!labels.has(signal.revisionId)) {
          const inspected = this.inspectBaselineAnalysis(bookId, undefined, signal.revisionId);
          labels.set(signal.revisionId, inspected.inspectedRevision?.revision ?? inspected.resultSetRevision);
        }
        label = analysisItemLabel(labels.get(signal.revisionId) ?? null, signal.itemKey);
      }
      candidates.push(analysisFeedbackCandidate(signal, withExcerpt ? label ?? '' : null));
    }
    const ignored = this.#authority.prepare(
      `SELECT signal_id, review_run_id, finding_id, category_id, reason, recorded_at FROM quality_signals q
       WHERE book_id = ? AND kind = 'review-finding-ignored'
         AND recorded_at = (SELECT max(latest.recorded_at) FROM quality_signals latest
                            WHERE latest.review_run_id = q.review_run_id AND latest.finding_id = q.finding_id)
       ORDER BY recorded_at, signal_id`,
    ).all(bookId) as SqlRow[];
    for (const row of ignored) {
      const categoryId = asString(row.category_id);
      candidates.push(reviewDispositionCandidate({
        signalId: asString(row.signal_id),
        reviewRunId: asString(row.review_run_id),
        findingId: asString(row.finding_id),
        categoryLabel: reviewCategoryEntry(categoryId)?.label ?? categoryId,
        reason: asString(row.reason),
        recordedAt: asString(row.recorded_at),
      }, withExcerpt));
    }
    return candidates;
  }

  /** Each Book whose Learning Material waits: how many wait for a decision or changed since one, and how many were deferred. */
  #learningAttention(limit: number): LearningMaterialsAttentionReading[] {
    const readings: LearningMaterialsAttentionReading[] = [];
    for (const row of this.#authority.prepare('SELECT book_id, title FROM books ORDER BY title, book_id').all() as SqlRow[]) {
      const bookId = asString(row.book_id);
      const materials = this.#learningEligibility.project(bookId, this.#learningCandidates(bookId, false));
      const waiting = materials.filter((material) => material.state === 'pending' || material.state === 'changed');
      const deferred = materials.filter((material) => material.state === 'deferred');
      if (waiting.length === 0 && deferred.length === 0) continue;
      const at = [...waiting, ...deferred].map((material) => material.recordedAt).sort().at(-1)!;
      readings.push({ bookId, bookTitle: asString(row.title), pending: waiting.length, deferred: deferred.length, at });
      if (readings.length >= limit) break;
    }
    return readings;
  }

  #learningCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof LearningEligibilityError || error instanceof DecisionFeedbackError || error instanceof AnalysisFeedbackError) {
        throw new StoreError(error.code, error.message);
      }
      throw error;
    }
  }

  /** The revision feedback binds: one of this Book's baseline Result Set Revisions, as ②A shows it, and its items. */
  #feedbackRevision(bookId: string, revisionId: string) {
    requireStore(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(revisionId), 'ANALYSIS_FEEDBACK_REVISION_NOT_FOUND', '没有这个分析结果修订版。');
    const projection = this.inspectBaselineAnalysis(bookId, undefined, revisionId);
    const revision = projection.inspectedRevision?.revision ?? projection.resultSetRevision;
    requireStore(revision !== null && revision.revisionId === revisionId, 'ANALYSIS_FEEDBACK_REVISION_NOT_FOUND', '没有这个分析结果修订版。');
    return {
      bound: { revisionId: revision.revisionId, digest: revision.digest, ordinal: revision.ordinal },
      items: analysisFeedbackItems(revision),
    };
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
    return this.#peopleCall(() => this.#transaction(this.#authority, () => this.#bookPeople.update(input)));
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
  ): ReimportLineageSourceVersionPageProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId) && (after === null || UUID_PATTERN.test(after)),
      'REIMPORT_LINEAGE_INVALID', '来源关系版本分页位置无效。');
    const page = this.#reimportLineageSourceVersionPage(bookId, after);
    return { bookId, after, ...page };
  }

  #reimportLineageSourceVersionPage(bookId: string, after: string | null): {
    items: string[];
    previousCursor: string | null;
    nextCursor: string | null;
  } {
    const rows = (this.#authority.prepare(
      `SELECT source_version_id FROM (
         SELECT mir.source_version_id
         FROM manuscript_import_records mir
         WHERE mir.book_id = ?
         UNION
         SELECT rr.source_version_id
         FROM manuscript_reimport_records rr
         WHERE rr.book_id = ? AND
           ((rr.result_kind = 'changed' AND rr.resulting_revision_id IS NOT NULL) OR rr.result_kind = 'no-change')
       ) ${after === null ? '' : 'WHERE source_version_id < ?'}
       ORDER BY source_version_id DESC LIMIT ${REIMPORT_LINEAGE_CHOICE_LIMIT + 1}`,
    ).all(...(after === null ? [bookId, bookId] : [bookId, bookId, after])) as SqlRow[]);
    const items = rows.slice(0, REIMPORT_LINEAGE_CHOICE_LIMIT).map((row) => asString(row.source_version_id));
    const previousRows = after === null ? [] : this.#authority.prepare(
      `SELECT source_version_id FROM (
         SELECT mir.source_version_id FROM manuscript_import_records mir WHERE mir.book_id = ?
         UNION
         SELECT rr.source_version_id FROM manuscript_reimport_records rr
         WHERE rr.book_id = ? AND
           ((rr.result_kind = 'changed' AND rr.resulting_revision_id IS NOT NULL) OR rr.result_kind = 'no-change')
       ) WHERE source_version_id > ? ORDER BY source_version_id ASC LIMIT ${REIMPORT_LINEAGE_CHOICE_LIMIT}`,
    ).all(bookId, bookId, after) as SqlRow[];
    return {
      items,
      previousCursor: previousRows.length === REIMPORT_LINEAGE_CHOICE_LIMIT
        ? asString(previousRows.at(-1)!.source_version_id)
        : null,
      nextCursor: rows.length > REIMPORT_LINEAGE_CHOICE_LIMIT ? items.at(-1)! : null,
    };
  }

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

  async stageSelectedManuscript(selectionToken: string, selectedPathInput: string): Promise<StagedImportProjection> {
    this.#assertAvailable();
    requireStore(TOKEN_PATTERN.test(selectionToken), 'SELECTION_INVALID', '文件选择令牌无效。');
    requireStore(isAbsolute(selectedPathInput), 'SELECTION_INVALID', '文件选择结果无效。');

    const selectedPath = await realpath(selectedPathInput);
    const displayName = safeDisplayName(basename(selectedPath));
    const draftId = randomUUID();
    const format = await this.#identifySelectedManuscript(selectedPath, displayName);
    // The format table owns the routing (ADR 0072 §1): read natively, read through a converter, or
    // retained source-only with the reason the surface states.
    const route = editableImport(format);
    if (!route.available) return this.#stageSourceOnlyDraft(draftId, selectionToken, selectedPath, displayName, format);
    if (route.conversion) {
      return this.#stageConvertedManuscriptDraft(draftId, selectionToken, selectedPath, displayName, route.conversion);
    }

    try {
      const ingested = await this.#parseIntoIngest(draftId, selectedPath, displayName);
      try {
        return await this.#withContentObjectLifecycle(async () => {
          const { parsed } = ingested;
          const relativeKey = await this.#persistContentObject(selectedPath, parsed.sourceDigest, 'DOCX');
          const now = new Date().toISOString();
          this.#transaction(this.#authority, () => {
            this.#authority
              .prepare(
                `INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(object_digest) DO NOTHING`,
              )
              .run(parsed.sourceDigest, relativeKey, parsed.archiveBytes, now);
            const object = one(
              this.#authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').all(parsed.sourceDigest) as SqlRow[],
              'OBJECT_VERIFY_FAILED',
              '暂存对象记录缺失。',
            );
            requireStore(asString(object.relative_key) === relativeKey && asNumber(object.byte_length) === parsed.archiveBytes, 'OBJECT_VERIFY_FAILED', '暂存对象记录冲突。');
            this.#authority
              .prepare(
                `INSERT INTO import_drafts(
                   draft_id, selection_token, state, draft_version, display_name, object_digest, selected_path, staged_at
                 ) VALUES (?, ?, 'staged', 1, ?, ?, ?, ?)`,
              )
              .run(draftId, selectionToken, displayName, parsed.sourceDigest, selectedPath, now);
            this.#promoteIngestSnapshot(draftId, ingested, now);
            this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(draftId));
            this.#assertForeignKeys(this.#authority);
          });

          return this.#stagedProjection({
            draftId,
            state: 'staged',
            version: 1,
            displayName,
            objectDigest: parsed.sourceDigest,
            selectedPath,
            conversion: null,
            workingObjectDigest: null,
            reviewedTitle: null,
            reviewedTargetChoiceId: null,
            reviewedTargetKind: null,
            reviewedExistingBookId: null,
            reviewedRelationship: null,
            reviewedBookStateDigest: null,
            reviewedReuseSourceVersionId: null,
            reviewedLineageStatus: null,
            reviewedLineageSourceVersionId: null,
            reviewedCheckpointRevisionId: null,
            reviewedManuscriptId: null,
            reviewedBranchId: null,
            reviewDigest: null,
            stagedAt: now,
            sourceFormat: 'DOCX',
            parserIdentity: parsed.parserIdentity,
            sourceDigest: parsed.sourceDigest,
            sourceBytes: parsed.archiveBytes,
            contentDigest: parsed.contentDigest,
            structureDigest: parsed.structureDigest,
            blockCount: parsed.blockCount,
            characterCount: parsed.characterCount,
            fidelity: parsed.fidelity,
            titleSuggestion: parsed.titleSuggestion.value,
            titleSource: parsed.titleSuggestion.sourceLabel,
          });
        });
      } finally {
        this.#discardIngest(ingested.ingestId);
      }
    } catch (error) {
      if (error instanceof StoreError) throw error;
      // A ZIP that is not a WordprocessingML package is not a format the product recognises, so it
      // is retained source-only rather than refused; every other bound stays a refusal, because a
      // hostile archive is not something to keep (ADR 0072 §1).
      if (isNotAWordprocessingPackage(error)) {
        return this.#stageSourceOnlyDraft(draftId, selectionToken, selectedPath, displayName, 'UNKNOWN');
      }
      if (error instanceof Error && error.message.startsWith('DOCX_REJECTED:')) {
        throw new StoreError('DOCX_REJECTED', '该 DOCX 不符合当前受限本地导入边界。');
      }
      throw error;
    }
  }

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
      return await this.#parseIntoIngest(draftId, workingPath, displayName);
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

  async #preferredRecoverySnapshot(attentionId: string): Promise<{
    verified: VerifiedRecoverySnapshot;
    record: RecoverySnapshotRecord | null;
    comparisonSnapshotId: string | null;
  }> {
    let cursor: RecoverySnapshotCursor | null = null;
    let newestUnavailable: Extract<VerifiedRecoverySnapshot, { state: 'unavailable' }> | null = null;
    let newestSnapshotId: string | null = null;
    while (true) {
      const record = this.#boundedCall(() =>
        this.#boundedAuthority.nextRecoverySnapshotForAttention(attentionId, cursor));
      if (record === null) {
        return {
          verified: newestUnavailable ?? { state: 'none' },
          record: null,
          comparisonSnapshotId: newestSnapshotId,
        };
      }
      newestSnapshotId ??= record.snapshotId;
      const verified = await this.#recoveryObjects.verify(record);
      if (verified.state === 'eligible') {
        return { verified, record, comparisonSnapshotId: record.snapshotId };
      }
      if (verified.state === 'unavailable') {
        newestUnavailable ??= verified;
      }
      cursor = { createdAt: record.createdAt, snapshotId: record.snapshotId };
    }
  }

  async getRecoveryComparison(attentionId: string): Promise<RecoveryComparisonProjection> {
    this.#assertAvailable();
    const { verified } = await this.#preferredRecoverySnapshot(attentionId);
    return this.#boundedCall(() => this.#boundedAuthority.getRecoveryComparison(attentionId, verified));
  }

  async viewRecoveryCandidate(
    attentionId: string,
    expectedAttentionVersion: number,
    selection: RecoverySelection,
    target: RecoveryWindowTarget,
  ): Promise<RecoveryWindowProjection> {
    this.#assertAvailable();
    if (selection.kind !== 'snapshot') {
      const projection = this.#boundedCall(() =>
        this.#boundedAuthority.getRecoveryDatabaseWindow(attentionId, selection, target));
      this.#boundedCall(() =>
        this.#boundedAuthority.recordRecoveryView(attentionId, expectedAttentionVersion, selection));
      return projection;
    }
    const record = this.#boundedCall(() =>
      this.#boundedAuthority.recoverySnapshotByIdForAttention(attentionId, selection.snapshotId));
    let window: Awaited<ReturnType<RecoveryObjectStore['readWindow']>>;
    try {
      // readWindow performs the complete digest-bound scan while retaining only the requested bounded window.
      window = await this.#recoveryObjects.readWindow(record, target);
    } catch {
      throw new StoreError('RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照未通过独立校验。');
    }
    this.#boundedCall(() =>
      this.#boundedAuthority.recordRecoveryView(attentionId, expectedAttentionVersion, selection));
    return {
      attentionId, selection, title: '已验证恢复快照', revisionId: record.revisionId,
      revisionLabel: record.revisionLabel, readonly: true, blocks: window.blocks, nextTarget: window.nextTarget,
    };
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

  async restoreRecovery(
    restorationId: string,
    attentionId: string,
    expectedAttentionVersion: number,
    selection: RecoverySelection,
  ): Promise<RecoveryRestorationProjection> {
    this.#assertAvailable();
    const existing = this.#boundedCall(() => this.#boundedAuthority.existingRecoveryRestoration(
      restorationId, attentionId, expectedAttentionVersion, selection,
    ));
    if (existing !== null) return existing;
    let snapshotStageStarted = false;
    try {
      let comparisonSnapshotId: string | null;
      if (selection.kind === 'snapshot') {
        const record = this.#boundedCall(() =>
          this.#boundedAuthority.recoverySnapshotByIdForAttention(attentionId, selection.snapshotId));
        comparisonSnapshotId = record.snapshotId;
        this.#boundedCall(() =>
          this.#boundedAuthority.beginRecoverySnapshotStage(attentionId, expectedAttentionVersion, record.snapshotId));
        snapshotStageStarted = true;
        try {
          // forEachBatch verifies the complete object and leaves only bounded batches in process memory.
          await this.#recoveryObjects.forEachBatch(record, (blocks) => {
            this.#boundedCall(() => this.#boundedAuthority.stageRecoverySnapshotBlocks(attentionId, blocks));
          });
        } catch {
          throw new StoreError('RECOVERY_SNAPSHOT_INELIGIBLE', '恢复快照未通过独立校验。');
        }
      } else {
        ({ comparisonSnapshotId } = await this.#preferredRecoverySnapshot(attentionId));
      }
      return this.#boundedCall(() => this.#boundedAuthority.restoreRecovery(
        restorationId, attentionId, expectedAttentionVersion, selection, comparisonSnapshotId,
      ));
    } finally {
      if (snapshotStageStarted) {
        this.#boundedCall(() => this.#boundedAuthority.clearRecoveryStage(attentionId));
      }
    }
  }

  async continueImportDraft(draftId: string, expectedDraftVersion: number): Promise<ContinueImportProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    const attempt = this.#loadCommitAttemptForDraft(draftId);
    if (attempt) {
      const reconciliation = await this.#reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'committed') {
        return { state: 'committed-recovered', result: reconciliation.result };
      }
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await this.#recoveryProjection(draftId, 'outcome-uncertain'),
        };
      }
    }

    let snapshot: DraftSnapshot;
    try {
      snapshot = this.#loadDraftSnapshot(draftId);
      requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      const revalidated = await this.#revalidateSnapshot(snapshot);
      snapshot = revalidated.snapshot;
      if (revalidated.parserDrift) {
        const access = await this.#originalFileAccess(snapshot);
        return {
          state: 'target-review-required',
          staged: this.#stagedProjection(snapshot),
          originalFileAccess: access,
          reviewInvalidated: true,
          notice: '解析器版本已变化；已从精确暂存字节重新形成预检，旧复核已失效，请重新检查变化后的决定。',
        };
      }
    } catch (error) {
      if (error instanceof StoreError && error.code === 'DRAFT_VERSION_CHANGED') throw error;
      return {
        state: 'reselection-required',
        recovery: await this.#recoveryProjection(draftId, 'ordinary-draft'),
      };
    }

    const access = await this.#originalFileAccess(snapshot);
    if (snapshot.state === 'staged') {
      return {
        state: 'target-review-required',
        staged: this.#stagedProjection(snapshot),
        originalFileAccess: access,
        reviewInvalidated: false,
        notice: continuationNotice(access),
      };
    }

    requireStore(snapshot.state === 'reviewed', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    const identityFindings = this.#identityFindings(snapshot);
    if (snapshot.reviewedRelationship === 'reimport') {
      const reimportTarget = this.#reconstructReviewedReimportTarget(snapshot);
      if (reimportTarget === null) {
        snapshot = this.#invalidateReview(snapshot);
        return {
          state: 'target-review-required',
          staged: this.#stagedProjection(snapshot),
          originalFileAccess: access,
          reviewInvalidated: true,
          notice: '重新导入目标、固定点、来源关系、来源版本结果或逐块比较已变化；旧复核已失效。',
        };
      }
      return {
        state: 'review-ready',
        review: this.#reimportReviewProjection(snapshot, reimportTarget, attempt?.attemptId ?? null),
        originalFileAccess: access,
        notice: continuationNotice(access),
      };
    }
    if (snapshot.reviewedRelationship === 'source-only') {
      const sourceTarget = this.#reconstructReviewedSourceImportTarget(snapshot, identityFindings);
      if (sourceTarget === null) {
        snapshot = this.#invalidateReview(snapshot);
        return {
          state: 'target-review-required',
          staged: this.#stagedProjection(snapshot),
          originalFileAccess: access,
          reviewInvalidated: true,
          notice: '来源导入目标、关系、复用选择、保留边界或最终记录后果已变化；旧复核已失效。',
        };
      }
      return {
        state: 'review-ready',
        review: this.#sourceImportReviewProjection(snapshot, sourceTarget, identityFindings, attempt?.attemptId ?? null),
        originalFileAccess: access,
        notice: continuationNotice(access),
      };
    }
    const reconstructed = this.#reconstructReviewedImport(snapshot, identityFindings);
    if (reconstructed === null) {
      snapshot = this.#invalidateReview(snapshot);
      return {
        state: 'target-review-required',
        staged: this.#stagedProjection(snapshot),
        originalFileAccess: access,
        reviewInvalidated: true,
        notice: '导入目标、书名、保真状态或最终记录后果已变化；旧复核已失效，请从变化后的选择重新确认。',
      };
    }
    requireStore(snapshot.reviewDigest !== null, 'REVIEW_CHANGED', '导入前复核摘要已变化。');

    return {
      state: 'review-ready',
      review: this.#reviewProjection(
        snapshot,
        snapshot.reviewDigest,
        reconstructed.reviewed,
        reconstructed.reviewed.plan.degradations.length > 0,
        reconstructed.target,
        identityFindings,
        attempt?.attemptId ?? null,
      ),
      originalFileAccess: access,
      notice: continuationNotice(access),
    };
  }

  async reselectImportDraft(
    draftId: string,
    expectedDraftVersion: number,
    selectionToken: string,
    selectedPathInput: string,
  ): Promise<ContinueImportProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && TOKEN_PATTERN.test(selectionToken), 'SELECTION_INVALID', '文件重选参数无效。');
    requireStore(!Array.from(this.#reimportCommitWork.values()).some((work) => work.input.draftId === draftId),
      'SERVICE_BUSY', '稿件重新导入正在提交，不能重选来源文件。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    requireStore(isAbsolute(selectedPathInput), 'SELECTION_INVALID', '文件选择结果无效。');
    const attempt = this.#loadCommitAttemptForDraft(draftId);
    if (attempt) {
      const reconciliation = await this.#reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'committed') {
        return { state: 'committed-recovered', result: reconciliation.result };
      }
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await this.#recoveryProjection(draftId, 'outcome-uncertain'),
        };
      }
    }

    const draft = one(
      this.#authority
        .prepare(
          `SELECT state, draft_version, object_digest, source_format, working_object_digest, converter_identity
           FROM import_drafts WHERE draft_id = ?`,
        )
        .all(draftId) as SqlRow[],
      'DRAFT_NOT_FOUND',
      '导入草稿不存在。',
    );
    const previousState = asString(draft.state);
    requireStore(previousState === 'staged' || previousState === 'reviewed', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(asNumber(draft.draft_version) === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const expectedDigest = asString(draft.object_digest);

    let selectedPath: string;
    let displayName: string;
    let format: SourceFormat;
    try {
      selectedPath = await realpath(selectedPathInput);
      displayName = safeDisplayName(basename(selectedPath));
      format = await this.#identifySelectedManuscript(selectedPath, displayName);
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '重选文件无法形成完整的本地暂存快照。');
    }
    // A converted draft was read through its working representation, so reselecting its original reproduces that
    // representation and restages it (Issue #611): after a converter change the draft is whole again, never only 放弃.
    // It is routed on its own row, whatever the picked file is named or identified as: the original's digest of record,
    // checked before any conversion or write, is the whole identity proof, and a draft read through a working
    // representation never takes the source-only or the DOCX path (#615's review).
    const recordedConversion = readConversionColumns(
      draft,
      draft.source_format === null || draft.source_format === undefined ? 'DOCX' : requireSourceFormat(asString(draft.source_format)),
      '导入草稿的转换记录不完整。',
    );
    if (recordedConversion !== null) {
      const original = one(
        this.#authority.prepare('SELECT byte_length FROM content_objects WHERE object_digest = ?').all(expectedDigest) as SqlRow[],
        'STORE_CORRUPT',
        '导入草稿的原文件对象不存在。',
      );
      return this.#reselectConvertedDraft(
        { draftId, selectionToken, selectedPath, displayName },
        { expectedDigest, expectedBytes: asNumber(original.byte_length), expectedDraftVersion, previousState, recovered: attempt !== null },
        recordedConversion.sourceFormat,
      );
    }
    // Reselection identifies the file the same way staging does, so a format the product does not
    // read as a Manuscript comes back as the same source-only draft rather than a bare refusal.
    if (format !== 'DOCX') {
      return this.#reselectSourceOnlyDraft(
        { draftId, selectionToken, selectedPath, displayName, format },
        { expectedDigest, expectedDraftVersion, previousState, recovered: attempt !== null },
      );
    }
    let ingested: IngestedDocx;
    try {
      ingested = await this.#parseIntoIngest(draftId, selectedPath, displayName);
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '重选文件无法形成完整的本地暂存快照。');
    }
    try {
      const { parsed } = ingested;
      requireStore(parsed.sourceDigest === expectedDigest, 'RESELECTION_MISMATCH', '重选文件与原暂存来源身份不一致。');
      return await this.#withContentObjectLifecycle(async () => {
        this.#requireNoAbandonmentCleanupIntent(draftId);
        const currentDraft = one(
          this.#authority
            .prepare('SELECT state, draft_version, object_digest FROM import_drafts WHERE draft_id = ?')
            .all(draftId) as SqlRow[],
          'DRAFT_NOT_FOUND',
          '导入草稿不存在。',
        );
        requireStore(
          (asString(currentDraft.state) === 'staged' || asString(currentDraft.state) === 'reviewed') &&
            asNumber(currentDraft.draft_version) === expectedDraftVersion &&
            asString(currentDraft.object_digest) === expectedDigest,
          'DRAFT_VERSION_CHANGED',
          '导入草稿在重选持久化前已变化。',
        );
        const relativeKey = await this.#persistContentObject(selectedPath, parsed.sourceDigest, 'DOCX');
        const nextVersion = expectedDraftVersion + 1;
        const now = new Date().toISOString();
        this.#transaction(this.#authority, () => {
          this.#authority
            .prepare(
              `INSERT INTO content_objects(object_digest, relative_key, byte_length, verified_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(object_digest) DO UPDATE SET
                 relative_key = excluded.relative_key,
                 byte_length = excluded.byte_length,
                 verified_at = excluded.verified_at`,
            )
            .run(parsed.sourceDigest, relativeKey, parsed.archiveBytes, now);
          this.#authority.prepare('DELETE FROM manuscript_reimport_comparisons WHERE draft_id = ?').run(draftId);
          this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(draftId);
          this.#promoteIngestSnapshot(draftId, ingested, now);
          const draftUpdate = this.#authority
            .prepare(
              `UPDATE import_drafts
               SET selection_token = ?, state = 'staged', draft_version = ?, display_name = ?, object_digest = ?,
                   selected_path = ?, reviewed_title = NULL, reviewed_target_choice_id = NULL,
                   reviewed_target_kind = NULL, reviewed_existing_book_id = NULL,
                   reviewed_relationship = NULL, reviewed_book_state_digest = NULL,
                   reviewed_reuse_source_version_id = NULL,
                   reviewed_lineage_status = NULL, reviewed_lineage_source_version_id = NULL,
                   reviewed_checkpoint_revision_id = NULL, reviewed_manuscript_id = NULL, reviewed_branch_id = NULL,
                   review_digest = NULL, reviewed_at = NULL
               WHERE draft_id = ? AND draft_version = ? AND state IN ('staged', 'reviewed')`,
            )
            .run(selectionToken, nextVersion, displayName, parsed.sourceDigest, selectedPath, draftId, expectedDraftVersion);
          requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在重选时已变化。');
          this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(draftId);
          this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(draftId));
          this.#assertForeignKeys(this.#authority);
        });
        const snapshot = this.#loadDraftSnapshot(draftId);
        return {
          state: 'target-review-required',
          staged: this.#stagedProjection(snapshot),
          originalFileAccess: { state: 'available-exact', label: '原始所选文件仍可访问且身份一致' },
          reviewInvalidated: previousState === 'reviewed' || attempt !== null,
          notice: '已通过原来源摘要精确匹配完成重选，并重新形成完整暂存与预检；请重新确认全部决定。',
        };
      });
    } finally {
      this.#discardIngest(ingested.ingestId);
    }
  }

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

  async abandonImportDraft(draftId: string, expectedDraftVersion: number): Promise<ImportStartupProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    requireStore(!Array.from(this.#reimportCommitWork.values()).some((work) => work.input.draftId === draftId),
      'SERVICE_BUSY', '稿件重新导入正在提交，不能放弃草稿。');
    return this.#withContentObjectLifecycle(() =>
      this.#abandonImportDraftWithinContentObjectLifecycle(draftId, expectedDraftVersion),
    );
  }

  async #abandonImportDraftWithinContentObjectLifecycle(
    draftId: string,
    expectedDraftVersion: number,
  ): Promise<ImportStartupProjection> {
    const pendingCleanup = this.#loadAbandonmentCleanupIntent(draftId);
    if (pendingCleanup) {
      requireStore(
        pendingCleanup.expectedDraftVersion === expectedDraftVersion,
        'DRAFT_VERSION_CHANGED',
        '导入草稿版本已变化。',
      );
      await this.#resumeAbandonmentCleanupIntent(pendingCleanup);
      return this.getImportStartup();
    }
    const attempt = this.#loadCommitAttemptForDraft(draftId);
    if (attempt) {
      const reconciliation = await this.#reconcileCommitAttempt(attempt);
      if (reconciliation.state === 'committed') {
        return { state: 'committed-recovered', result: reconciliation.result };
      }
      if (reconciliation.state === 'uncertain') {
        return {
          state: 'outcome-uncertain',
          recovery: await this.#recoveryProjection(draftId, 'outcome-uncertain'),
        };
      }
    }
    const cleanupIntent = this.#transaction<AbandonmentCleanupIntent | null>(this.#authority, () => {
      const draft = one(
        this.#authority
          .prepare(
            `SELECT d.state, d.draft_version, d.object_digest, d.working_object_digest, co.relative_key
             FROM import_drafts d
             JOIN content_objects co ON co.object_digest = d.object_digest
             WHERE d.draft_id = ?`,
          )
          .all(draftId) as SqlRow[],
        'DRAFT_NOT_FOUND',
        '导入草稿不存在。',
      );
      const draftState = asString(draft.state);
      requireStore(
        draftState === 'staged' || draftState === 'reviewed',
        'DRAFT_STATE_CHANGED',
        '该导入已经提交，不能放弃。',
      );
      requireStore(
        asNumber(draft.draft_version) === expectedDraftVersion,
        'DRAFT_VERSION_CHANGED',
        '导入草稿版本已变化。',
      );
      const commitEvidence = one(
        this.#authority.prepare('SELECT count(*) commits FROM import_commits WHERE draft_id = ?').all(draftId) as SqlRow[],
        'STORE_CORRUPT',
        '无法核对导入提交证据。',
      );
      requireStore(
        asNumber(commitEvidence.commits) === 0,
        'COMMIT_EVIDENCE_PRESENT',
        '存在导入提交证据，不能放弃或清理。',
      );
      const objectDigest = asString(draft.object_digest);
      const relativeKey = asString(draft.relative_key);
      // A converted draft owns two objects, and abandoning it removes both: the original the editor
      // selected and the working representation the product wrote beside it (ADR 0072 §2).
      const workingObjectDigest = draft.working_object_digest === null
        ? null
        : asString(draft.working_object_digest);
      const referencesBefore = one(
        this.#authority
          .prepare(
            `SELECT
               (SELECT count(*) FROM source_versions WHERE object_digest = ?) source_refs,
               (SELECT count(*) FROM import_drafts WHERE object_digest = ?) draft_refs`,
          )
          .all(objectDigest, objectDigest) as SqlRow[],
        'STORE_CORRUPT',
        '无法核对放弃前的暂存对象引用。',
      );
      const sourceReferences = asNumber(referencesBefore.source_refs);
      const draftReferences = asNumber(referencesBefore.draft_refs);
      requireStore(draftReferences >= 1, 'STORE_CORRUPT', '导入草稿未引用其暂存对象。');
      if (sourceReferences === 0 && draftReferences === 1) {
        const requestedAt = new Date().toISOString();
        this.#authority
          .prepare(
            `INSERT INTO import_abandonment_cleanup_intents(
               draft_id, object_digest, expected_draft_version, relative_key, state, requested_at,
               working_object_digest
             ) VALUES (?, ?, ?, ?, 'prepared', ?, ?)`,
          )
          .run(draftId, objectDigest, expectedDraftVersion, relativeKey, requestedAt, workingObjectDigest);
        const intent: AbandonmentCleanupIntent = {
          draftId,
          objectDigest,
          expectedDraftVersion,
          relativeKey,
          state: 'prepared',
          workingObjectDigest,
        };
        this.#assertForeignKeys(this.#authority);
        return intent;
      }
      const deletion = this.#authority
        .prepare("DELETE FROM import_drafts WHERE draft_id = ? AND draft_version = ? AND state IN ('staged', 'reviewed')")
        .run(draftId, expectedDraftVersion);
      requireStore(deletion.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在放弃时已变化。');
      const references = one(
        this.#authority
          .prepare(
            `SELECT
               (SELECT count(*) FROM source_versions WHERE object_digest = ?) source_refs,
               (SELECT count(*) FROM import_drafts WHERE object_digest = ?) draft_refs`,
          )
          .all(objectDigest, objectDigest) as SqlRow[],
        'STORE_CORRUPT',
        '无法核对暂存对象引用。',
      );
      requireStore(
        asNumber(references.source_refs) + asNumber(references.draft_refs) > 0,
        'ABANDON_REFERENCE_CHANGED',
        '共享暂存对象在放弃时失去权威引用；已中止清理。',
      );
      this.#assertForeignKeys(this.#authority);
      return null;
    });
    if (cleanupIntent) await this.#resumeAbandonmentCleanupIntent(cleanupIntent);
    return this.getImportStartup();
  }

  async acknowledgeImportCompletion(commitId: string): Promise<{ state: 'acknowledged' }> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(commitId), 'COMMIT_INVALID', '导入提交标识无效。');
    const attempt = this.#loadCommitAttempt(commitId);
    const reconciliation = await this.#reconcileCommitAttempt(attempt);
    requireStore(reconciliation.state === 'committed', 'COMMIT_NOT_PROVEN', '导入提交尚未获得完整证明。');
    this.#authority
      .prepare(
        `UPDATE import_commit_attempts
         SET completion_acknowledged_at = COALESCE(completion_acknowledged_at, ?)
         WHERE attempt_id = ? AND state = 'committed'`,
      )
      .run(new Date().toISOString(), commitId);
    return { state: 'acknowledged' };
  }

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
  ): ReviewBeforeImportProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    requireStore(textBoxDisposition === 'retain' || textBoxDisposition === 'merge', 'TEXT_BOX_CHOICE_INVALID', '文本框处理方式无效。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const identityFindings = this.#identityFindings(snapshot);
    const target = this.#resolveImportTarget(targetSelection, identityFindings);
    const reviewed = this.#reviewedFidelity(snapshot, textBoxDisposition);
    const { plan } = reviewed;
    if (plan.degradations.length > 0 && !acceptDegradation) {
      return this.#reviewProjection(snapshot, null, reviewed, false, target, identityFindings, null);
    }
    requireStore(
      plan.degradations.length > 0 || !acceptDegradation,
      'DEGRADATION_ACCEPTANCE_INVALID',
      '本次导入不需要降级接受。',
    );
    const nextVersion = expectedDraftVersion + 1;
    requireStore(
      !this.#control.persistLegacyReviewedDraft ||
        (target.kind === 'new-book' && target.choiceId === 'new-book' && identityFindings.length === 0),
      'E2E_CONTROL_INVALID',
      '旧版复核边界仅适用于无身份提示的新建图书。',
    );
    const reviewSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = this.#control.persistLegacyReviewedDraft
      ? createLegacyNewBookReviewDigestV2(reviewSnapshot, target.kind === 'new-book' ? target.confirmedTitle : '', nextVersion, plan)
      : createImportReviewDigestV6(reviewSnapshot, nextVersion, reviewed, target, identityFindings, this.#workflowProfile);
    const persistedTargetChoiceId = this.#control.persistLegacyReviewedDraft
      ? null
      : target.kind === 'new-book' ? target.choiceId : null;
    const reviewedAt = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      const update = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'reviewed', draft_version = ?, reviewed_title = ?, reviewed_target_choice_id = ?,
               reviewed_target_kind = ?, reviewed_existing_book_id = ?, reviewed_relationship = ?,
               reviewed_book_state_digest = ?, reviewed_reuse_source_version_id = NULL,
               review_digest = ?, reviewed_at = ?
           WHERE draft_id = ? AND state = 'staged' AND draft_version = ?`,
        )
        .run(
          nextVersion,
          target.kind === 'new-book' ? target.confirmedTitle : null,
          persistedTargetChoiceId,
          target.kind,
          target.kind === 'existing-book' ? target.bookId : null,
          target.kind === 'existing-book' ? 'first-manuscript' : 'new-book-first-manuscript',
          target.kind === 'existing-book' ? target.bookStateDigest : null,
          reviewDigest,
          reviewedAt,
          draftId,
          expectedDraftVersion,
        );
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在复核时已变化。');
    });
    return this.#reviewProjection(
      {
        ...snapshot,
        state: 'reviewed',
        version: nextVersion,
        reviewedTitle: target.kind === 'new-book' ? target.confirmedTitle : null,
        reviewedTargetChoiceId: persistedTargetChoiceId,
        reviewedTargetKind: target.kind,
        reviewedExistingBookId: target.kind === 'existing-book' ? target.bookId : null,
        reviewedRelationship: target.kind === 'existing-book' ? 'first-manuscript' : 'new-book-first-manuscript',
        reviewedBookStateDigest: target.kind === 'existing-book' ? target.bookStateDigest : null,
        reviewDigest,
      },
      reviewDigest,
      reviewed,
      plan.degradations.length > 0,
      target,
      identityFindings,
      null,
    );
  }

  prepareSourceImportReview(
    draftId: string,
    expectedDraftVersion: number,
    targetSelection: SourceImportTargetSelection,
  ): ReviewBeforeSourceImportProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    const identityFindings = this.#identityFindings(snapshot);
    const target = this.#resolveSourceImportTarget(targetSelection, snapshot, identityFindings);
    const nextVersion = expectedDraftVersion + 1;
    const reviewedSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = createSourceImportReviewDigest(reviewedSnapshot, target, identityFindings);
    const reviewedAt = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      const update = this.#authority.prepare(
        `UPDATE import_drafts
         SET state = 'reviewed', draft_version = ?, reviewed_title = ?, reviewed_target_choice_id = ?,
             reviewed_target_kind = ?, reviewed_existing_book_id = ?, reviewed_relationship = 'source-only',
             reviewed_book_state_digest = ?, reviewed_reuse_source_version_id = ?,
             review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'staged' AND draft_version = ?`,
      ).run(
        nextVersion,
        target.kind === 'new-book' ? target.confirmedTitle : null,
        target.kind === 'new-book' ? target.choiceId : null,
        target.kind,
        target.kind === 'existing-book' ? target.bookId : null,
        target.kind === 'existing-book' ? target.bookStateDigest : null,
        target.reuseSourceVersionId,
        reviewDigest,
        reviewedAt,
        draftId,
        expectedDraftVersion,
      );
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在来源复核时已变化。');
    });
    return this.#sourceImportReviewProjection(
      {
        ...reviewedSnapshot,
        state: 'reviewed',
        reviewedTitle: target.kind === 'new-book' ? target.confirmedTitle : null,
        reviewedTargetChoiceId: target.kind === 'new-book' ? target.choiceId : null,
        reviewedTargetKind: target.kind,
        reviewedExistingBookId: target.kind === 'existing-book' ? target.bookId : null,
        reviewedRelationship: 'source-only',
        reviewedBookStateDigest: target.kind === 'existing-book' ? target.bookStateDigest : null,
        reviewedReuseSourceVersionId: target.reuseSourceVersionId,
        reviewDigest,
      },
      target,
      identityFindings,
      null,
    );
  }

  createManuscriptReimportPreparationWork(
    draftId: string,
    expectedDraftVersion: number,
    targetSelection: ManuscriptReimportTargetSelection,
  ): { workId: string; total: number } {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    this.#requireNoAbandonmentCleanupIntent(draftId);
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'staged', 'DRAFT_STATE_CHANGED', '导入草稿状态已变化。');
    requireStore(snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    // A reimport compares parsed blocks, so a format that was never parsed cannot begin one.
    this.#requireEditableFormat(snapshot);
    const binding = this.#reimportManuscriptBinding(targetSelection.bookId);
    requireStore(!Array.from(this.#reimportPreparationWork.values()).some((work) => work.draftId === draftId),
      'SERVICE_BUSY', '该重新导入草稿已有比较准备任务。');
    const checkpointStart = this.#boundedCall(() =>
      this.#boundedAuthority.createReimportCheckpointWork(binding.manuscriptId, binding.branchId));
    this.#authority.exec(
      `CREATE TEMP TABLE IF NOT EXISTS reimport_preparation_rows(
         work_id TEXT NOT NULL,
         mapping_id TEXT NOT NULL,
         position INTEGER NOT NULL,
         change_kind TEXT NOT NULL,
         current_block_id TEXT, current_revision_id TEXT, current_position INTEGER,
         lineage_block_id TEXT, lineage_revision_id TEXT, lineage_position INTEGER,
         staged_block_id TEXT, staged_draft_id TEXT, staged_position INTEGER,
         identity_consequence TEXT, resolved_changed INTEGER,
         current_kind TEXT, current_level INTEGER, current_text TEXT, current_digest TEXT,
         lineage_kind TEXT, lineage_level INTEGER, lineage_text TEXT, lineage_digest TEXT,
         staged_kind TEXT, staged_level INTEGER, staged_text TEXT, staged_digest TEXT,
         PRIMARY KEY(work_id, position)
       ) WITHOUT ROWID;
       CREATE TEMP TABLE IF NOT EXISTS reimport_preparation_occurrences(
         work_id TEXT NOT NULL,
         source_kind TEXT NOT NULL CHECK(source_kind IN ('staged', 'current', 'lineage')),
         kind TEXT NOT NULL,
         level_key INTEGER NOT NULL,
         digest TEXT NOT NULL,
         text TEXT NOT NULL,
         occurrences INTEGER NOT NULL CHECK(occurrences > 0),
         single_block_id TEXT NOT NULL,
         single_position INTEGER NOT NULL CHECK(single_position > 0),
         PRIMARY KEY(work_id, source_kind, kind, level_key, digest, text)
       ) WITHOUT ROWID;`,
    );
    if (checkpointStart.workId !== null) {
      this.#authority.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS temp.reimport_checkpoint_identity
           ON manuscript_checkpoint_rows(work_id, block_id)`,
      );
    }
    const workId = randomUUID();
    const work: ReimportPreparationWork = {
      workId,
      draftId,
      expectedDraftVersion,
      targetSelection: structuredClone(targetSelection),
      snapshot,
      phase: checkpointStart.checkpoint === null ? 'checkpoint' : 'staged-occurrences',
      checkpointWorkId: checkpointStart.workId,
      checkpointCompleted: 0,
      target: null,
      comparisonId: null,
      comparisonHasher: null,
      batches: null,
      occurrenceCursor: 0,
      checkpointBlockCount: 0,
      totalUpperBound: snapshot.blockCount + checkpointStart.total,
      completed: 0,
      mappingCount: 0,
      unresolvedMappings: 0,
      changedMappings: 0,
    };
    if (checkpointStart.checkpoint !== null) {
      const target = this.#resolveReimportTarget(
        targetSelection, snapshot, checkpointStart.checkpoint, this.#identityFindings(snapshot));
      const checkpointBlockCount = asNumber(one(this.#authority.prepare(
        'SELECT count(*) total FROM manuscript_block_versions WHERE revision_id = ?',
      ).all(target.checkpoint.revisionId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对当前固定点块数。').total);
      requireStore(checkpointBlockCount > 0, 'REIMPORT_COMPARISON_INVALID', '当前固定点没有稿件块。');
      this.#initializeReimportPreparationMapping(work, target, checkpointBlockCount);
    }
    this.#reimportPreparationWork.set(workId, work);
    return { workId, total: work.totalUpperBound };
  }

  #initializeReimportPreparationMapping(
    work: ReimportPreparationWork,
    target: ResolvedReimportTarget,
    checkpointBlockCount: number,
  ): void {
    const lineageBlockCount = target.lineage.status === 'verified'
      ? asNumber(one(this.#authority.prepare(
        `SELECT position FROM manuscript_block_versions
         WHERE revision_id = ? ORDER BY position DESC LIMIT 1`,
      ).all(target.lineage.revisionId) as SqlRow[], 'REIMPORT_LINEAGE_UNVERIFIED', '无法核对来源关系修订版块数。').position)
      : 0;
    work.phase = 'staged-occurrences';
    work.target = target;
    work.comparisonId = stableUuid(`ai7.reimport-comparison/1\u0000${work.draftId}`);
    work.comparisonHasher = createReimportComparisonHasher(work.draftId, target);
    work.batches = null;
    work.occurrenceCursor = 0;
    work.checkpointBlockCount = checkpointBlockCount;
    work.totalUpperBound = work.checkpointCompleted +
      (work.snapshot.blockCount * 2) + (checkpointBlockCount * 2) + lineageBlockCount;
  }

  #advanceReimportOccurrenceFacts(work: ReimportPreparationWork): number {
    requireStore(work.target !== null && work.phase !== 'checkpoint' && work.phase !== 'mapping',
      'REIMPORT_COMPARISON_INVALID', '重新导入唯一性准备状态无效。');
    const sourceKind = work.phase === 'staged-occurrences'
      ? 'staged'
      : work.phase === 'current-occurrences' ? 'current' : 'lineage';
    let rows: SqlRow[];
    if (sourceKind === 'staged') {
      rows = this.#authority.prepare(
        `SELECT staged_block_id block_id, position, kind, level, text, digest
         FROM staged_import_blocks
         WHERE draft_id = ? AND position > ? ORDER BY position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(work.draftId, work.occurrenceCursor) as SqlRow[];
    } else if (sourceKind === 'current' && work.checkpointWorkId !== null) {
      rows = this.#authority.prepare(
        `SELECT block_id, position, kind, level, text, digest
         FROM temp.manuscript_checkpoint_rows
         WHERE work_id = ? AND position > ? ORDER BY position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(work.checkpointWorkId, work.occurrenceCursor) as SqlRow[];
    } else {
      const revisionId = sourceKind === 'current'
        ? work.target.checkpoint.revisionId
        : work.target.lineage.revisionId;
      if (revisionId === null) rows = [];
      else {
        rows = this.#authority.prepare(
          `SELECT block_id, position, kind, level, text, digest
           FROM manuscript_block_versions
           WHERE revision_id = ? AND position > ? ORDER BY position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
        ).all(revisionId, work.occurrenceCursor) as SqlRow[];
      }
    }
    if (rows.length === 0) {
      work.occurrenceCursor = 0;
      if (work.phase === 'staged-occurrences') work.phase = 'current-occurrences';
      else if (work.phase === 'current-occurrences' && work.target.lineage.status === 'verified') {
        work.phase = 'lineage-occurrences';
      } else {
        work.phase = 'mapping';
        work.batches = this.#reimportMappingBatches(
          work.workId, work.draftId, work.target, work.checkpointWorkId);
      }
      return 0;
    }
    this.#transaction(this.#authority, () => {
      const upsert = this.#authority.prepare(
        `INSERT INTO temp.reimport_preparation_occurrences(
           work_id, source_kind, kind, level_key, digest, text,
           occurrences, single_block_id, single_position
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(work_id, source_kind, kind, level_key, digest, text)
         DO UPDATE SET occurrences = occurrences + 1`,
      );
      for (const row of rows) {
        upsert.run(
          work.workId,
          sourceKind,
          asString(row.kind),
          row.level === null ? -1 : asNumber(row.level),
          asString(row.digest),
          asString(row.text),
          asString(row.block_id),
          asNumber(row.position),
        );
      }
    });
    work.occurrenceCursor = asNumber(rows.at(-1)!.position);
    return rows.length;
  }

  advanceManuscriptReimportPreparationWork(workId: string): ReimportPreparationProgress {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入比较任务标识无效。');
    const work = this.#reimportPreparationWork.get(workId);
    requireStore(work !== undefined, 'JOB_NOT_FOUND', '重新导入比较任务不存在或已结束。');
    if (work.phase === 'checkpoint') {
      requireStore(work.checkpointWorkId !== null, 'REIMPORT_CHECKPOINT_INVALID', '重新导入固定点任务缺失。');
      const checkpoint = this.#boundedCall(() =>
        this.#boundedAuthority.advanceReimportCheckpointWork(work.checkpointWorkId!));
      work.checkpointCompleted = checkpoint.completed;
      if (!checkpoint.done) {
        return { done: false, completed: checkpoint.completed, total: work.totalUpperBound, review: null };
      }
      requireStore(checkpoint.checkpoint !== null, 'REIMPORT_CHECKPOINT_INVALID', '重新导入固定点未完成。');
      const target = this.#resolveReimportTarget(
        work.targetSelection, work.snapshot, checkpoint.checkpoint, this.#identityFindings(work.snapshot), true);
      const checkpointBlockCount = asNumber(one(this.#authority.prepare(
        'SELECT count(*) total FROM temp.manuscript_checkpoint_rows WHERE work_id = ?',
      ).all(work.checkpointWorkId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对当前固定点块数。').total);
      requireStore(checkpointBlockCount > 0, 'REIMPORT_COMPARISON_INVALID', '当前固定点没有稿件块。');
      this.#initializeReimportPreparationMapping(work, target, checkpointBlockCount);
      return { done: false, completed: checkpoint.total, total: work.totalUpperBound, review: null };
    }
    if (work.phase !== 'mapping') {
      work.completed += this.#advanceReimportOccurrenceFacts(work);
      return {
        done: false,
        completed: work.checkpointCompleted + work.completed,
        total: work.totalUpperBound,
        review: null,
      };
    }
    requireStore(work.batches !== null && work.target !== null && work.comparisonHasher !== null &&
      work.comparisonId !== null, 'REIMPORT_COMPARISON_INVALID', '重新导入比较任务状态不完整。');
    const step = work.batches.next();
    if (!step.done) {
      this.#transaction(this.#authority, () => {
        const insert = this.#authority.prepare(
          `INSERT INTO temp.reimport_preparation_rows(
             work_id, mapping_id, position, change_kind,
             current_block_id, current_revision_id, current_position,
             lineage_block_id, lineage_revision_id, lineage_position,
             staged_block_id, staged_draft_id, staged_position, identity_consequence, resolved_changed,
             current_kind, current_level, current_text, current_digest,
             lineage_kind, lineage_level, lineage_text, lineage_digest,
             staged_kind, staged_level, staged_text, staged_digest
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const mapping of step.value.mappings) {
          work.comparisonHasher!.update(mapping);
          const resolvedChanged = mapping.identityConsequence === 'preserve-current-identity'
            ? Number(mapping.current === null || mapping.staged === null ||
              mapping.current.position !== mapping.staged.position || mapping.current.kind !== mapping.staged.kind ||
              mapping.current.level !== mapping.staged.level || mapping.current.text !== mapping.staged.text ||
              mapping.current.digest !== mapping.staged.digest)
            : null;
          insert.run(
            workId, mapping.mappingId, mapping.position, mapping.changeKind,
            mapping.current?.blockId ?? null, mapping.current === null ? null : work.target!.checkpoint.revisionId,
            mapping.current?.position ?? null,
            mapping.lineage?.blockId ?? null, mapping.lineage === null ? null : work.target!.lineage.revisionId,
            mapping.lineage?.position ?? null,
            mapping.staged?.blockId ?? null, mapping.staged === null ? null : work.draftId,
            mapping.staged?.position ?? null, mapping.identityConsequence, resolvedChanged,
            mapping.current?.kind ?? null, mapping.current?.level ?? null, mapping.current?.text ?? null,
            mapping.current?.digest ?? null,
            mapping.lineage?.kind ?? null, mapping.lineage?.level ?? null, mapping.lineage?.text ?? null,
            mapping.lineage?.digest ?? null,
            mapping.staged?.kind ?? null, mapping.staged?.level ?? null, mapping.staged?.text ?? null,
            mapping.staged?.digest ?? null,
          );
          work.mappingCount += 1;
          if (mapping.identityConsequence === null) work.unresolvedMappings += 1;
          if (resolvedChanged === 1) work.changedMappings += 1;
        }
      });
      work.completed += step.value.scanned;
      return { done: false, completed: work.checkpointCompleted + work.completed, total: work.totalUpperBound, review: null };
    }

    requireStore(work.mappingCount > 0, 'REIMPORT_COMPARISON_INVALID', '重新导入比较没有内容块。');
    const snapshot = this.#loadDraftSnapshot(work.draftId);
    requireStore(snapshot.state === 'staged' && snapshot.version === work.expectedDraftVersion &&
      snapshot.sourceDigest === work.snapshot.sourceDigest && snapshot.contentDigest === work.snapshot.contentDigest &&
      snapshot.structureDigest === work.snapshot.structureDigest && snapshot.parserIdentity === work.snapshot.parserIdentity,
    'DRAFT_VERSION_CHANGED', '重新导入草稿在比较准备期间已变化。');
    const target = this.#resolveReimportTarget(
      work.targetSelection,
      snapshot,
      work.target.checkpoint,
      this.#identityFindings(snapshot),
      work.checkpointWorkId !== null,
    );
    requireStore(canonicalJson(target) === canonicalJson(work.target), 'REVIEW_CHANGED', '重新导入目标在比较准备期间已变化。');
    const comparisonDigest = work.comparisonHasher.digest();
    const nextVersion = work.expectedDraftVersion + 1;
    const resolutionDigest = emptyReimportResolutionDigest();
    const reviewDigest = createReimportReviewDigest(
      { ...snapshot, version: nextVersion }, target, comparisonDigest, resolutionDigest,
      degradationReview(this.#reimportFidelity(snapshot).plan, false).state,
    );
    const reviewedAt = new Date().toISOString();
    const persistComparison = (): void => {
      this.#authority.prepare(
        `INSERT INTO manuscript_reimport_comparisons(
           comparison_id, draft_id, manuscript_id, branch_id, checkpoint_revision_id,
           checkpoint_revision_label, checkpoint_revision_digest, checkpoint_journal_sequence,
           checkpoint_created_for_dirty_journal,
           lineage_status, lineage_source_version_id, lineage_revision_id, lineage_revision_digest,
           comparison_kind, staged_source_digest, staged_content_digest, staged_structure_digest,
           staged_parser_identity, staged_block_count, checkpoint_block_count, total_mappings,
           unresolved_mappings, changed_mappings, comparison_digest, resolution_digest,
           degradation_accepted, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        work.comparisonId, work.draftId, target.manuscriptId, target.branchId,
        target.checkpoint.revisionId, target.checkpoint.revisionLabel, target.checkpoint.revisionDigest,
        target.checkpoint.journalSequence, target.checkpoint.createdForDirtyJournal ? 1 : 0,
        target.lineage.status, target.lineage.sourceVersionId, target.lineage.revisionId,
        target.lineage.status === 'verified'
          ? asString(one(this.#authority.prepare('SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?')
            .all(target.lineage.revisionId) as SqlRow[], 'REIMPORT_LINEAGE_UNVERIFIED', '来源修订版不存在。').revision_digest)
          : null,
        target.lineage.comparisonKind, snapshot.sourceDigest, snapshot.contentDigest, snapshot.structureDigest,
        snapshot.parserIdentity, snapshot.blockCount, work.checkpointBlockCount, work.mappingCount,
        work.unresolvedMappings, work.changedMappings, comparisonDigest, resolutionDigest, 0, reviewedAt,
      );
      const copied = this.#authority.prepare(
        `INSERT INTO manuscript_reimport_mappings(
           mapping_id, comparison_id, position, change_kind,
           current_block_id, current_revision_id, current_position,
           lineage_block_id, lineage_revision_id, lineage_position,
           staged_block_id, staged_draft_id, staged_position, identity_consequence, resolved_changed,
           current_kind, current_level, current_text, current_digest,
           lineage_kind, lineage_level, lineage_text, lineage_digest,
           staged_kind, staged_level, staged_text, staged_digest
         ) SELECT mapping_id, ?, position, change_kind,
                  current_block_id, current_revision_id, current_position,
                  lineage_block_id, lineage_revision_id, lineage_position,
                  staged_block_id, staged_draft_id, staged_position, identity_consequence, resolved_changed,
                  current_kind, current_level, current_text, current_digest,
                  lineage_kind, lineage_level, lineage_text, lineage_digest,
                  staged_kind, staged_level, staged_text, staged_digest
           FROM temp.reimport_preparation_rows WHERE work_id = ? ORDER BY position`,
      ).run(work.comparisonId, workId);
      requireStore(copied.changes === work.mappingCount, 'REIMPORT_COMPARISON_INVALID',
        '重新导入映射在持久化期间发生变化。');
      this.#persistReimportGroups(work.comparisonId!, work.draftId, workId);
      const update = this.#authority.prepare(
        `UPDATE import_drafts
         SET state = 'reviewed', draft_version = ?, reviewed_title = NULL,
             reviewed_target_choice_id = NULL, reviewed_target_kind = 'existing-book',
             reviewed_existing_book_id = ?, reviewed_relationship = 'reimport',
             reviewed_book_state_digest = ?, reviewed_reuse_source_version_id = ?,
             reviewed_lineage_status = ?, reviewed_lineage_source_version_id = ?,
             reviewed_checkpoint_revision_id = ?, reviewed_manuscript_id = ?, reviewed_branch_id = ?,
             review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'staged' AND draft_version = ?`,
      ).run(
        nextVersion,
        target.bookId,
        target.bookStateDigest,
        target.reuseSourceVersionId,
        target.lineage.status,
        target.lineage.sourceVersionId,
        target.checkpoint.revisionId,
        target.manuscriptId,
        target.branchId,
        reviewDigest,
        reviewedAt,
        work.draftId,
        work.expectedDraftVersion,
      );
      requireStore(update.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在重新导入复核时已变化。');
      this.#authority.prepare('DELETE FROM temp.reimport_preparation_rows WHERE work_id = ?').run(workId);
      this.#authority.prepare('DELETE FROM temp.reimport_preparation_occurrences WHERE work_id = ?').run(workId);
      this.#assertForeignKeys(this.#authority);
    };
    if (work.checkpointWorkId === null) {
      this.#transaction(this.#authority, persistComparison);
    } else {
      this.#boundedCall(() =>
        this.#boundedAuthority.finalizeReimportCheckpointWork(work.checkpointWorkId!, persistComparison));
    }
    this.#reimportPreparationWork.delete(workId);
    const review = this.#reimportReviewProjection(this.#loadDraftSnapshot(work.draftId), target, null);
    return { done: true, completed: work.totalUpperBound, total: work.totalUpperBound, review };
  }

  cancelManuscriptReimportPreparationWork(workId: string): boolean {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '重新导入比较任务标识无效。');
    const work = this.#reimportPreparationWork.get(workId);
    if (work === undefined) return false;
    if (work.checkpointWorkId !== null) {
      this.#boundedCall(() => this.#boundedAuthority.cancelReimportCheckpointWork(work.checkpointWorkId!));
    }
    this.#reimportPreparationWork.delete(workId);
    this.#authority.prepare('DELETE FROM temp.reimport_preparation_rows WHERE work_id = ?').run(workId);
    this.#authority.prepare('DELETE FROM temp.reimport_preparation_occurrences WHERE work_id = ?').run(workId);
    return true;
  }

  /**
   * One page of the chapter-level comparison (Issue #412, plan slice S63; V2-UX-IMP-041, IMP-057): each row a run of
   * changed paragraphs between exact ones, its first paragraphs on each side, the verbs its shape admits and the one
   * chosen. Exact paragraphs never form a row.
   */
  getReimportMappingPage(
    draftId: string,
    expectedDraftVersion: number,
    after: number | null,
  ): ReimportMappingPageProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && (after === null || (Number.isSafeInteger(after) && after >= 0)),
      'REIMPORT_MAPPING_INVALID', '重新导入对应分页参数无效。');
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion && snapshot.reviewDigest !== null,
    'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const comparison = one(this.#authority.prepare(
      'SELECT comparison_id FROM manuscript_reimport_comparisons WHERE draft_id = ?',
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    const comparisonId = asString(comparison.comparison_id);
    const rows = this.#authority.prepare(
      `SELECT g.*, r.verb FROM manuscript_reimport_groups g
       LEFT JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
       WHERE g.comparison_id = ? AND g.ordinal > ? ORDER BY g.ordinal LIMIT ${REIMPORT_GROUP_PAGE_SIZE + 1}`,
    ).all(comparisonId, after ?? 0) as SqlRow[];
    const page = rows.slice(0, REIMPORT_GROUP_PAGE_SIZE);
    const excerpts = this.#authority.prepare(
      `SELECT CASE WHEN gm.side = 'current' THEN m.current_position ELSE m.staged_position END position,
              CASE WHEN gm.side = 'current' THEN m.current_text ELSE m.staged_text END text
       FROM manuscript_reimport_group_members gm
       JOIN manuscript_reimport_mappings m ON m.mapping_id = gm.mapping_id
       WHERE gm.group_id = ? AND gm.side = ? ORDER BY gm.member_order LIMIT ${MAX_REIMPORT_EXCERPTS_PER_SIDE}`,
    );
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
    const side = (row: SqlRow, name: 'current' | 'staged'): ReimportGroupProjection['current'] => ({
      count: asNumber(row[`${name}_count`]),
      from: row[`${name}_from`] === null ? null : asNumber(row[`${name}_from`]),
      to: row[`${name}_to`] === null ? null : asNumber(row[`${name}_to`]),
      excerpts: (excerpts.all(asString(row.group_id), name) as SqlRow[]).map((excerpt) => {
        const graphemes = Array.from(segmenter.segment(asString(excerpt.text)), ({ segment }) => segment);
        return {
          position: asNumber(excerpt.position),
          text: graphemes.slice(0, MAX_REIMPORT_EXCERPT_GRAPHEMES).join(''),
          truncated: graphemes.length > MAX_REIMPORT_EXCERPT_GRAPHEMES,
        };
      }),
    });
    const projection: ReimportMappingPageProjection = {
      draftId,
      draftVersion: snapshot.version,
      reviewDigest: snapshot.reviewDigest,
      items: page.map((row): ReimportGroupProjection => ({
        groupId: asString(row.group_id),
        ordinal: asNumber(row.ordinal),
        chapterLabel: row.chapter_label === null ? null : asString(row.chapter_label),
        current: side(row, 'current'),
        staged: side(row, 'staged'),
        verbs: reimportGroupVerbs(asNumber(row.current_count), asNumber(row.staged_count)),
        verb: row.verb === null ? null : asString(row.verb) as ReimportGroupVerb,
      })),
      previousCursor: after === null || after <= REIMPORT_GROUP_PAGE_SIZE ? null : after - REIMPORT_GROUP_PAGE_SIZE,
      nextCursor: rows.length > REIMPORT_GROUP_PAGE_SIZE ? asNumber(page.at(-1)!.ordinal) : null,
    };
    requireStore(Buffer.byteLength(JSON.stringify(projection), 'utf8') <= MAX_FRAME_BYTES - REIMPORT_WIRE_HEADROOM_BYTES,
      'REIMPORT_MAPPING_INVALID', '重新导入对应页超出有界服务帧。');
    return projection;
  }

  acceptReimportDegradation(
    draftId: string,
    expectedDraftVersion: number,
  ): ReviewBeforeManuscriptReimportProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const target = this.#reconstructReviewedReimportTarget(snapshot);
    requireStore(target !== null, 'REVIEW_CHANGED', '重新导入复核无法由当前权威状态重建。');
    const { plan } = this.#reimportFidelity(snapshot);
    requireStore(plan.degradations.length > 0, 'DEGRADATION_ACCEPTANCE_INVALID', '本次重新导入不需要降级接受。');
    const evidence = this.#reimportEvidence(draftId);
    const nextVersion = expectedDraftVersion + 1;
    const nextSnapshot = { ...snapshot, version: nextVersion };
    const reviewDigest = createReimportReviewDigest(
      nextSnapshot, target, evidence.comparisonDigest, evidence.resolutionDigest, 'accepted-complete-set',
    );
    this.#transaction(this.#authority, () => {
      requireStore(this.#authority.prepare(
        `UPDATE manuscript_reimport_comparisons SET degradation_accepted = 1
         WHERE draft_id = ? AND degradation_accepted = 0`,
      ).run(draftId).changes === 1, 'DEGRADATION_ACCEPTANCE_INVALID', '重新导入降级接受状态已变化。');
      requireStore(this.#authority.prepare(
        `UPDATE import_drafts SET draft_version = ?, review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND reviewed_relationship = 'reimport'
           AND draft_version = ?`,
      ).run(nextVersion, reviewDigest, new Date().toISOString(), draftId, expectedDraftVersion).changes === 1,
      'DRAFT_VERSION_CHANGED', '重新导入降级接受期间复核已变化。');
      this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(draftId);
    });
    const refreshed = this.#loadDraftSnapshot(draftId);
    const refreshedTarget = this.#reconstructReviewedReimportTarget(refreshed);
    requireStore(refreshedTarget !== null, 'REVIEW_CHANGED', '重新导入复核无法重建。');
    return this.#reimportReviewProjection(refreshed, refreshedTarget, null);
  }

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
  ): { workId: string; total: number } {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(draftId) && UUID_PATTERN.test(groupId) && REIMPORT_GROUP_VERBS.includes(verb),
      'REIMPORT_MAPPING_INVALID', '重新导入对应行的解决参数无效。');
    const snapshot = this.#loadDraftSnapshot(draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '重新导入复核已变化。');
    const target = this.#reconstructReviewedReimportTarget(snapshot);
    requireStore(target !== null, 'REVIEW_CHANGED', '重新导入复核无法由当前权威状态重建。');
    const group = one(this.#authority.prepare(
      `SELECT g.group_id, g.comparison_id, g.current_count, g.staged_count, c.degradation_accepted, c.total_mappings, r.verb
       FROM manuscript_reimport_groups g
       JOIN manuscript_reimport_comparisons c ON c.comparison_id = g.comparison_id
       LEFT JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
       WHERE c.draft_id = ? AND g.group_id = ?`,
    ).all(draftId, groupId) as SqlRow[], 'REIMPORT_MAPPING_INVALID', '重新导入对应行不存在。');
    requireStore(group.verb === null, 'REIMPORT_MAPPING_INVALID', '这一行已经解决。');
    requireStore(reimportGroupVerbs(asNumber(group.current_count), asNumber(group.staged_count)).includes(verb),
      'REIMPORT_MAPPING_INVALID', '所选动词与这一行的内容不相容。');
    requireStore(!Array.from(this.#reimportResolutionWork.values()).some((work) => work.draftId === draftId),
      'SERVICE_BUSY', '该重新导入复核已有对应行解决任务。');
    const comparisonId = asString(group.comparison_id);
    const pending = new Map<string, ReimportPendingResolution>();
    for (const resolution of reimportGroupResolutions(verb, this.#reimportGroupMembers(groupId, 'current'), this.#reimportGroupMembers(groupId, 'staged'))) {
      pending.set(resolution.mappingId, resolution);
    }
    this.#requireReimportPendingOpen(comparisonId, pending);
    const totalMappings = asNumber(group.total_mappings);
    const workId = randomUUID();
    this.#reimportResolutionWork.set(workId, {
      workId, draftId, expectedDraftVersion, groupId, verb, pending,
      snapshot, target, comparisonId,
      degradationAccepted: asNumber(group.degradation_accepted) === 1,
      totalMappings, resolutionHasher: createReimportResolutionHasher(), completed: 0,
    });
    return { workId, total: totalMappings };
  }

  /** The mappings on one side of a row, in the row's order, with what the commit needs of each. */
  #reimportGroupMembers(groupId: string, side: 'current' | 'staged'): Array<{ mappingId: string; changeKind: 'unchanged' | 'move' | 'edit' | 'insert' | 'delete'; currentBlockId: string | null }> {
    return (this.#authority.prepare(
      `SELECT m.mapping_id, m.change_kind, m.current_block_id
       FROM manuscript_reimport_group_members gm JOIN manuscript_reimport_mappings m ON m.mapping_id = gm.mapping_id
       WHERE gm.group_id = ? AND gm.side = ? ORDER BY gm.member_order`,
    ).all(groupId, side) as SqlRow[]).map((row) => ({
      mappingId: asString(row.mapping_id),
      changeKind: asString(row.change_kind) as 'unchanged' | 'move' | 'edit' | 'insert' | 'delete',
      currentBlockId: row.current_block_id === null ? null : asString(row.current_block_id),
    }));
  }

  /** Every identity a verb writes is still unwritten, and every current identity it carries still unclaimed. */
  #requireReimportPendingOpen(comparisonId: string, pending: ReadonlyMap<string, ReimportPendingResolution>): void {
    for (const resolution of pending.values()) {
      const written = this.#authority.prepare(
        'SELECT 1 FROM manuscript_reimport_mapping_resolutions WHERE mapping_id = ?',
      ).get(resolution.mappingId);
      requireStore(written === undefined, 'REIMPORT_MAPPING_INVALID', '这一行的结构身份已经写入。');
      if (resolution.resolution === 'preserve-current-identity') {
        const claimed = this.#authority.prepare(
          'SELECT 1 FROM manuscript_reimport_mapping_resolutions WHERE comparison_id = ? AND resolved_current_block_id = ?',
        ).get(comparisonId, resolution.currentBlockId);
        requireStore(claimed === undefined, 'REIMPORT_MAPPING_INVALID', '这一行要延续的当前结构身份已被占用。');
      }
    }
  }

  advanceReimportResolutionWork(workId: string): ReimportResolutionProgress {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '对应行解决任务标识无效。');
    const work = this.#reimportResolutionWork.get(workId);
    requireStore(work !== undefined, 'JOB_NOT_FOUND', '对应行解决任务不存在或已结束。');
    const rows = this.#authority.prepare(
      `SELECT m.mapping_id, m.position, r.resolution, r.resolved_current_block_id
       FROM manuscript_reimport_mappings m
       LEFT JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = m.mapping_id
       WHERE m.comparison_id = ? AND m.position > ? ORDER BY m.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
    ).all(work.comparisonId, work.completed) as SqlRow[];
    if (rows.length > 0) {
      for (const row of rows) {
        const mappingId = asString(row.mapping_id);
        const pending = work.pending.get(mappingId);
        if (pending !== undefined) {
          requireStore(row.resolution === null, 'REIMPORT_MAPPING_INVALID', '这一行的结构身份已经写入。');
          work.resolutionHasher.update(mappingId, pending.resolution, pending.currentBlockId);
        } else if (row.resolution !== null) {
          work.resolutionHasher.update(
            mappingId,
            asString(row.resolution) as ReimportPendingResolution['resolution'],
            row.resolved_current_block_id === null ? null : asString(row.resolved_current_block_id),
          );
        }
        work.completed = asNumber(row.position);
      }
      return { done: false, completed: work.completed, total: work.totalMappings, review: null };
    }
    requireStore(work.completed === work.totalMappings, 'REIMPORT_COMPARISON_INVALID',
      '对应行解决扫描未覆盖完整比较。');
    const snapshot = this.#loadDraftSnapshot(work.draftId);
    requireStore(snapshot.state === 'reviewed' && snapshot.reviewedRelationship === 'reimport' &&
      snapshot.version === work.expectedDraftVersion && snapshot.reviewDigest === work.snapshot.reviewDigest,
    'DRAFT_VERSION_CHANGED', '重新导入复核在对应行解决期间已变化。');
    const target = this.#reconstructReviewedReimportTarget(snapshot);
    requireStore(target !== null && canonicalJson(target) === canonicalJson(work.target),
      'REVIEW_CHANGED', '重新导入目标在对应行解决期间已变化。');
    requireStore(this.#authority.prepare('SELECT 1 FROM manuscript_reimport_group_resolutions WHERE group_id = ?').get(work.groupId) === undefined,
      'REIMPORT_MAPPING_INVALID', '这一行已经解决。');
    this.#requireReimportPendingOpen(work.comparisonId, work.pending);
    // The verbs of every resolved row, this one included, in the rows' order.
    const verbs = this.#authority.prepare(
      `SELECT g.group_id, r.verb FROM manuscript_reimport_groups g
       LEFT JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
       WHERE g.comparison_id = ? ORDER BY g.ordinal`,
    ).all(work.comparisonId) as SqlRow[];
    for (const row of verbs) {
      const groupId = asString(row.group_id);
      if (groupId === work.groupId) work.resolutionHasher.group(groupId, work.verb);
      else if (row.verb !== null) work.resolutionHasher.group(groupId, asString(row.verb) as ReimportGroupVerb);
    }
    const comparison = one(this.#authority.prepare(
      'SELECT comparison_digest FROM manuscript_reimport_comparisons WHERE comparison_id = ?',
    ).all(work.comparisonId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    // Whether each written identity changes the manuscript: a new or retired one always does; a carried one does
    // when the block it carries to differs from the one it came from in place, kind, level or words.
    const mappingRow = this.#authority.prepare('SELECT * FROM manuscript_reimport_mappings WHERE mapping_id = ?');
    const claimedRow = this.#authority.prepare(
      `SELECT mapping_id, current_position, current_kind, current_level, current_text, current_digest
       FROM manuscript_reimport_mappings WHERE comparison_id = ? AND change_kind = 'delete' AND current_block_id = ?`,
    );
    const writes: Array<{ resolution: ReimportPendingResolution; changed: number; claimedMappingId: string | null }> = [];
    for (const resolution of work.pending.values()) {
      const mapping = mappingRow.get(resolution.mappingId) as SqlRow | undefined;
      requireStore(mapping !== undefined, 'REIMPORT_MAPPING_INVALID', '对应行的映射已变化。');
      let claimed: SqlRow | undefined;
      if (resolution.resolution === 'preserve-current-identity' && asString(mapping.change_kind) === 'insert') {
        claimed = claimedRow.get(work.comparisonId, resolution.currentBlockId) as SqlRow | undefined;
        requireStore(claimed !== undefined, 'REIMPORT_MAPPING_INVALID', '要延续的当前结构身份不在这一行中。');
      }
      const identitySource = claimed ?? mapping;
      const changed = resolution.resolution !== 'preserve-current-identity'
        ? 1
        : Number(
            identitySource.current_position === null ||
            asNumber(identitySource.current_position) !== asNumber(mapping.staged_position) ||
            asString(identitySource.current_kind) !== asString(mapping.staged_kind) ||
            (identitySource.current_level === null ? null : asNumber(identitySource.current_level)) !==
              (mapping.staged_level === null ? null : asNumber(mapping.staged_level)) ||
            asString(identitySource.current_text) !== asString(mapping.staged_text) ||
            asString(identitySource.current_digest) !== asString(mapping.staged_digest),
          );
      writes.push({ resolution, changed, claimedMappingId: claimed === undefined ? null : asString(claimed.mapping_id) });
    }
    const resolved = writes.length + writes.filter((write) => write.claimedMappingId !== null).length;
    const changedCount = writes.reduce((total, write) => total + write.changed, 0);
    const resolutionDigest = work.resolutionHasher.digest();
    const nextVersion = work.expectedDraftVersion + 1;
    const reviewDigest = createReimportReviewDigest(
      { ...snapshot, version: nextVersion }, target, asString(comparison.comparison_digest), resolutionDigest,
      degradationReview(this.#reimportFidelity(snapshot).plan, work.degradationAccepted).state,
    );
    this.#transaction(this.#authority, () => {
      const resolvedAt = new Date().toISOString();
      this.#authority.prepare(
        'INSERT INTO manuscript_reimport_group_resolutions(group_id, comparison_id, verb, resolved_at) VALUES (?, ?, ?, ?)',
      ).run(work.groupId, work.comparisonId, work.verb, resolvedAt);
      const insert = this.#authority.prepare(
        `INSERT INTO manuscript_reimport_mapping_resolutions(
           mapping_id, comparison_id, resolution, resolved_current_block_id, resolved_at
         ) VALUES (?, ?, ?, ?, ?)`,
      );
      const markChanged = this.#authority.prepare(
        'UPDATE manuscript_reimport_mappings SET resolved_changed = ? WHERE mapping_id = ? AND resolved_changed IS NULL',
      );
      for (const write of writes) {
        requireStore(insert.run(write.resolution.mappingId, work.comparisonId, write.resolution.resolution,
          write.resolution.currentBlockId, resolvedAt).changes === 1, 'REIMPORT_MAPPING_INVALID', '结构身份解决无法持久化。');
        requireStore(markChanged.run(write.changed, write.resolution.mappingId).changes === 1,
          'REIMPORT_MAPPING_INVALID', '结构身份结果已变化。');
        if (write.claimedMappingId !== null) {
          requireStore(markChanged.run(0, write.claimedMappingId).changes === 1,
            'REIMPORT_MAPPING_INVALID', '当前结构身份候选已变化。');
        }
      }
      requireStore(this.#authority.prepare(
        `UPDATE manuscript_reimport_comparisons
         SET unresolved_mappings = unresolved_mappings - ?, changed_mappings = changed_mappings + ?,
             resolution_digest = ?
         WHERE comparison_id = ? AND unresolved_mappings >= ?`,
      ).run(resolved, changedCount, resolutionDigest, work.comparisonId, resolved).changes === 1,
      'REIMPORT_COMPARISON_INVALID', '重新导入比较聚合状态已变化。');
      requireStore(this.#authority.prepare(
        `UPDATE import_drafts SET draft_version = ?, review_digest = ?, reviewed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND reviewed_relationship = 'reimport' AND draft_version = ?`,
      ).run(nextVersion, reviewDigest, resolvedAt, work.draftId, work.expectedDraftVersion).changes === 1,
      'DRAFT_VERSION_CHANGED', '重新导入对应行解决期间复核已变化。');
      this.#authority.prepare("DELETE FROM import_commit_attempts WHERE draft_id = ? AND state = 'prepared'").run(work.draftId);
    });
    this.#reimportResolutionWork.delete(workId);
    const refreshed = this.#loadDraftSnapshot(work.draftId);
    const refreshedTarget = this.#reconstructReviewedReimportTarget(refreshed);
    requireStore(refreshedTarget !== null, 'REVIEW_CHANGED', '重新导入复核无法重建。');
    return {
      done: true,
      completed: work.totalMappings,
      total: work.totalMappings,
      review: this.#reimportReviewProjection(refreshed, refreshedTarget, null),
    };
  }

  /**
   * The resolved rows of a comparison as the marks see them (Issue #412, S63): each row's blocks in the revision the
   * reimport replaced, and the blocks the commit put in its place, read from the commit's own rows.
   */
  #reimportMarkRows(comparisonId: string, commitWorkId: string): ReimportMarkRow[] {
    const current = this.#authority.prepare(
      `SELECT m.current_block_id, m.current_position FROM manuscript_reimport_group_members gm
       JOIN manuscript_reimport_mappings m ON m.mapping_id = gm.mapping_id
       WHERE gm.group_id = ? AND gm.side = 'current' ORDER BY gm.member_order`,
    );
    const placed = this.#authority.prepare(
      `SELECT cr.block_id FROM manuscript_reimport_group_members gm
       JOIN manuscript_reimport_mappings m ON m.mapping_id = gm.mapping_id
       JOIN temp.reimport_commit_rows cr ON cr.work_id = ? AND cr.position = m.staged_position
       WHERE gm.group_id = ? AND gm.side = 'staged' ORDER BY gm.member_order`,
    );
    return (this.#authority.prepare(
      `SELECT g.group_id, g.ordinal, g.staged_count, r.verb FROM manuscript_reimport_groups g
       JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
       WHERE g.comparison_id = ? ORDER BY g.ordinal`,
    ).all(comparisonId) as SqlRow[]).map((group) => {
      const groupId = asString(group.group_id);
      const newBlockIds = (placed.all(commitWorkId, groupId) as SqlRow[]).map((row) => asString(row.block_id));
      requireStore(newBlockIds.length === asNumber(group.staged_count), 'REIMPORT_COMPARISON_INVALID', '重新导入对应行的新段落不完整。');
      return {
        ordinal: asNumber(group.ordinal),
        verb: asString(group.verb) as ReimportGroupVerb,
        current: (current.all(groupId) as SqlRow[]).map((row) => ({ blockId: asString(row.current_block_id), position: asNumber(row.current_position) })),
        newBlockIds,
      };
    });
  }

  /**
   * The chapter-level rows of one comparison (Issue #412, plan slice S63), from the mappings just recorded: runs of
   * changed blocks between exact ones, each with its members on either side, the heading it stands under, and the
   * set that marks the comparison as grouped. In the caller's transaction, before the preparation rows are dropped.
   */
  #persistReimportGroups(comparisonId: string, draftId: string, workId: string): void {
    const mappings = (this.#authority.prepare(
      `SELECT mapping_id, change_kind, current_position, staged_position
       FROM temp.reimport_preparation_rows WHERE work_id = ? ORDER BY position`,
    ).all(workId) as SqlRow[]).map((row) => ({
      mappingId: asString(row.mapping_id),
      changeKind: asString(row.change_kind) as 'unchanged' | 'move' | 'edit' | 'insert' | 'delete',
      currentPosition: row.current_position === null ? null : asNumber(row.current_position),
      stagedPosition: row.staged_position === null ? null : asNumber(row.staged_position),
    }));
    const headings = (this.#authority.prepare(
      `SELECT current_position, current_kind, current_level, current_text
       FROM temp.reimport_preparation_rows
       WHERE work_id = ? AND current_kind IN ('title', 'heading') ORDER BY current_position`,
    ).all(workId) as SqlRow[]).map((row) => ({
      position: asNumber(row.current_position),
      kind: asString(row.current_kind) as 'title' | 'heading',
      level: row.current_level === null ? null : asNumber(row.current_level),
      text: asString(row.current_text),
    }));
    const groups = groupReimportMappings(mappings, headings);
    const exact = mappings.filter((mapping) => mapping.changeKind === 'unchanged' || mapping.changeKind === 'move').length;
    this.#authority.prepare(
      'INSERT INTO manuscript_reimport_group_sets(comparison_id, grouping, group_count, anchor_count) VALUES (?, ?, ?, ?)',
    ).run(comparisonId, REIMPORT_GROUPING, groups.length, exact);
    const insertGroup = this.#authority.prepare(
      `INSERT INTO manuscript_reimport_groups(
         group_id, comparison_id, ordinal, current_count, staged_count, current_from, current_to, staged_from, staged_to, chapter_label
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertMember = this.#authority.prepare(
      'INSERT INTO manuscript_reimport_group_members(group_id, mapping_id, side, member_order) VALUES (?, ?, ?, ?)',
    );
    for (const group of groups) {
      const groupId = stableUuid(`ai7.reimport-group/1\u0000${draftId}\u0000${group.ordinal}`);
      const chapter = group.chapterLabel === null ? null : Array.from(group.chapterLabel.replace(/\s+/gu, ' ').trim()).slice(0, 200).join('');
      insertGroup.run(groupId, comparisonId, group.ordinal, group.currentMembers.length, group.stagedMembers.length,
        group.currentFrom, group.currentTo, group.stagedFrom, group.stagedTo, chapter === '' ? null : chapter);
      group.currentMembers.forEach((mappingId, index) => insertMember.run(groupId, mappingId, 'current', index + 1));
      group.stagedMembers.forEach((mappingId, index) => insertMember.run(groupId, mappingId, 'staged', index + 1));
    }
  }

  cancelReimportResolutionWork(workId: string): boolean {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '结构身份解决任务标识无效。');
    return this.#reimportResolutionWork.delete(workId);
  }

  async commitNewBookImport(
    input: {
      draftId: string;
      expectedDraftVersion: number;
      reviewDigest: string;
      commitId: string;
    },
    options: { interruptAfterAttempt?: boolean } = {},
  ): Promise<ManuscriptImportCommitProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId), 'COMMIT_INVALID', '导入提交标识无效。');
    requireStore(/^[0-9a-f]{64}$/.test(input.reviewDigest), 'COMMIT_INVALID', '导入复核摘要无效。');
    this.#requireNoAbandonmentCleanupIntent(input.draftId);
    const requestFingerprint = commitRequestFingerprint('manuscript-import', input);
    const existingAttempt = this.#loadCommitAttemptForDraft(input.draftId);
    if (existingAttempt) {
      requireStore(
        existingAttempt.attemptId === input.commitId &&
          existingAttempt.operationKind === 'manuscript-import' &&
          existingAttempt.requestFingerprint === requestFingerprint &&
          existingAttempt.expectedDraftVersion === input.expectedDraftVersion &&
          existingAttempt.reviewDigest === input.reviewDigest,
        'IDEMPOTENCY_CONFLICT',
        '该导入草稿已绑定另一项持久提交尝试。',
      );
      const reconciliation = await this.#reconcileCommitAttempt(existingAttempt);
      if (reconciliation.state === 'committed') {
        requireStore(reconciliation.result.completionLabel === '稿件已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与稿件导入不一致。');
        return reconciliation.result;
      }
      requireStore(reconciliation.state === 'uncommitted', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '导入提交结果待确认。');
    }

    const snapshotBeforeAttempt = this.#loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '导入前复核摘要已变化。');
    const revalidated = await this.#revalidateSnapshot(snapshotBeforeAttempt);
    requireStore(!revalidated.parserDrift, 'REVIEW_CHANGED', '解析器状态已变化，请重新复核导入。');
    const snapshotForAttempt = revalidated.snapshot;
    const identityFindingsForAttempt = this.#identityFindings(snapshotForAttempt);
    const reviewedForAttempt = this.#reconstructReviewedImport(snapshotForAttempt, identityFindingsForAttempt);
    requireStore(reviewedForAttempt !== null, 'REVIEW_CHANGED', '导入前复核摘要无法由当前权威状态重建。');
    if (!existingAttempt) {
      const preparedAt = new Date().toISOString();
      this.#transaction(this.#authority, () => {
        this.#authority
          .prepare(
            `INSERT INTO import_commit_attempts(
               attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
               operation_kind, state, prepared_at
             ) VALUES (?, ?, ?, ?, ?, 'manuscript-import', 'prepared', ?)`,
          )
          .run(
            input.commitId,
            input.draftId,
            requestFingerprint,
            input.expectedDraftVersion,
            input.reviewDigest,
            preparedAt,
          );
      });
    }
    if (options.interruptAfterAttempt) {
      throw new StoreFatalError(new Error('E2E interruption after durable import attempt preparation.'));
    }
    let result: Omit<ManuscriptImportCommitProjection, 'firstWindow'> | undefined;

    this.#transaction(this.#authority, () => {
      const existing = this.#authority.prepare(
        'SELECT request_fingerprint, operation_kind, result_json FROM import_commits WHERE commit_id = ?',
      ).all(input.commitId) as SqlRow[];
      if (existing.length === 1) {
        requireStore(
          asString(existing[0]!.request_fingerprint) === requestFingerprint &&
            asString(existing[0]!.operation_kind) === 'manuscript-import',
          'IDEMPOTENCY_CONFLICT',
          '提交标识已用于另一项导入。',
        );
        const storedResult = parseStoredJson(asString(existing[0]!.result_json), '导入提交结果记录无效。');
        requireStore(storedResult !== null && typeof storedResult === 'object' && !Array.isArray(storedResult), 'STORE_CORRUPT', '导入提交结果记录无效。');
        const stored = this.#loadStoredCommitResult(input.commitId);
        requireStore(stored.completionLabel === '稿件已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与稿件导入不一致。');
        result = stored;
        return;
      }

      const snapshot = this.#loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '导入草稿尚未完成复核。');
      requireStore(snapshot.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      requireStore(snapshot.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '导入前复核摘要已变化。');
      const identityFindings = this.#identityFindings(snapshot);
      const reconstructed = this.#reconstructReviewedImport(snapshot, identityFindings);
      requireStore(reconstructed !== null, 'REVIEW_CHANGED', '导入前复核摘要无法由当前权威状态重建。');
      const { target, reviewed } = reconstructed;
      const { plan, fidelity: reviewedFidelity } = reviewed;
      this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(input.draftId));
      // A merged review brings every text-box paragraph into r1 (ADR 0086 §2); any other review's r1 is
      // exactly the staged body.
      const merged = plan.textBoxDisposition === 'merge'
        ? this.#retentionCall(() => stagedTextBoxParagraphs(this.#authority, input.draftId))
        : null;
      const blockCount = snapshot.blockCount + (merged?.length ?? 0);
      const characterCount = snapshot.characterCount +
        (merged?.reduce((total, paragraph) => total + paragraph.graphemeLength, 0) ?? 0);

      const now = new Date().toISOString();
      const bookId = target.kind === 'existing-book' ? target.bookId : randomUUID();
      const dimensionSetId = target.kind === 'existing-book' ? target.dimensionSetId : randomUUID();
      const sourceVersionId = randomUUID();
      const provenanceId = randomUUID();
      const fidelityReviewId = randomUUID();
      const degradationDecisionId = plan.degradations.length > 0 ? randomUUID() : null;
      const manuscriptId = randomUUID();
      const branchId = randomUUID();
      const revisionId = randomUUID();
      const workflowInstanceId = randomUUID();
      const importRecordId = randomUUID();
      // A merged r1 is not the parse's body alone, so its digest names the paragraphs merged into it.
      const revisionDigest = sha256(canonicalJson(merged === null
        ? {
            schema: 'ai7.manuscript-revision/2',
            manuscriptId,
            parserIdentity: snapshot.parserIdentity,
            contentDigest: snapshot.contentDigest,
            structureDigest: snapshot.structureDigest,
            blockCount: snapshot.blockCount,
            characterCount: snapshot.characterCount,
          }
        : {
            schema: 'ai7.manuscript-revision/3',
            manuscriptId,
            parserIdentity: snapshot.parserIdentity,
            contentDigest: snapshot.contentDigest,
            structureDigest: snapshot.structureDigest,
            blockCount,
            characterCount,
            textBoxDisposition: 'merge',
            mergedTextBoxParagraphs: merged.map((paragraph) => ({
              boxOrdinal: paragraph.boxOrdinal,
              boxParagraphOrdinal: paragraph.boxParagraphOrdinal,
              sourceParagraphIndex: paragraph.sourceParagraphIndex,
              digest: paragraph.digest,
            })),
          }));
      const workingDigest = revisionDigest;

      if (target.kind === 'new-book') {
        this.#authority.prepare(
          'INSERT INTO books(book_id, stable_identity, title, created_at, internal_number) VALUES (?, ?, ?, ?, NULL)',
        ).run(bookId, `book:${bookId}`, target.confirmedTitle, now);
        this.#insertBookDimensionSet(dimensionSetId, bookId, now);
      } else {
        const revalidatedTarget = this.#emptyBookImportTarget(target.bookId);
        requireStore(
          revalidatedTarget.bookStateDigest === target.bookStateDigest &&
            revalidatedTarget.dimensionSetId === target.dimensionSetId,
          'REVIEW_CHANGED',
          '所选图书身份、维度集或稿件状态已变化。',
        );
      }
      this.#authority
        .prepare(
          `INSERT INTO source_versions(
             source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
             parser_identity, format, display_name, created_at, working_object_digest, converter_identity
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          sourceVersionId,
          bookId,
          snapshot.objectDigest,
          snapshot.sourceDigest,
          snapshot.contentDigest,
          snapshot.structureDigest,
          snapshot.parserIdentity,
          snapshot.sourceFormat,
          snapshot.displayName,
          now,
          snapshot.workingObjectDigest,
          snapshot.conversion?.converterIdentity ?? null,
        );
      this.#authority
        .prepare(
          `INSERT INTO source_provenance(
             provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at
           ) VALUES (?, ?, 'native-file-picker', 'local-provider-free', ?, ?, ?)`,
        )
        .run(provenanceId, sourceVersionId, snapshot.displayName, snapshot.parserIdentity, now);
      this.#authority
        .prepare(
          `INSERT INTO import_fidelity_reviews(
             fidelity_review_id, book_id, source_version_id, review_digest, outcome, round_trip_guaranteed, created_at
           ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(fidelityReviewId, bookId, sourceVersionId, input.reviewDigest, plan.outcome, now);
      const insertFidelity = this.#authority.prepare(
        `INSERT INTO import_fidelity_categories(
           fidelity_review_id, category_key, display_label, item_count, status, detail, position
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      reviewedFidelity.forEach((category, index) =>
        insertFidelity.run(
          fidelityReviewId,
          category.key,
          category.label,
          category.count,
          category.status,
          category.detail,
          index + 1,
        ),
      );
      if (plan.textBoxDisposition !== null) {
        this.#retentionCall(() => recordTextBoxChoice(this.#authority, fidelityReviewId, plan.textBoxDisposition!, now));
      }
      if (degradationDecisionId) {
        const decision = canonicalDegradationDecision(plan);
        requireStore(decision, 'FIDELITY_OUTSIDE_TRACER', '降级决定无法形成规范记录。');
        this.#authority
          .prepare(
            `INSERT INTO import_degradation_decisions(
               degradation_decision_id, fidelity_review_id, decision, created_at
             ) VALUES (?, ?, ?, ?)`,
          )
          .run(degradationDecisionId, fidelityReviewId, decision, now);
      }
      this.#authority.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'primary', ?)").run(manuscriptId, bookId, now);
      this.#authority.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, created_at) VALUES (?, ?, ?, ?)').run(branchId, manuscriptId, '主分支', now);
      this.#authority
        .prepare(
          `INSERT INTO manuscript_revisions(
             revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
             source_version_id, revision_digest, created_at
           ) VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`,
        )
        .run(revisionId, manuscriptId, branchId, sourceVersionId, revisionDigest, now);
      this.#authority.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(revisionId, branchId);
      if (merged === null) {
        this.#authority.prepare(
          `INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id)
           SELECT staged_block_id, ?, ? FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        ).run(manuscriptId, revisionId, input.draftId);
        this.#authority.prepare(
          `INSERT INTO manuscript_block_versions(
             revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           ) SELECT ?, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
             FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        ).run(revisionId, input.draftId);
        this.#authority.prepare(
          `INSERT INTO working_blocks(
             branch_id, block_id, position, kind, level, text, digest, grapheme_length
           ) SELECT ?, staged_block_id, position, kind, level, text, digest, grapheme_length
             FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        ).run(branchId, input.draftId);
        // ADR 0086 §3: every block of r1 is its staged body paragraph, which the staged sources name.
        const mapped = this.#authority.prepare(
          `INSERT INTO manuscript_block_sources(
             revision_id, block_id, source_version_id, source_part, source_paragraph_index,
             box_ordinal, box_paragraph_ordinal, source_paragraph_digest, created_at
           ) SELECT ?, b.staged_block_id, ?, 'body', s.source_paragraph_index, NULL, NULL, b.digest, ?
             FROM staged_import_blocks b
             JOIN staged_import_block_sources s ON s.draft_id = b.draft_id AND s.position = b.position
             WHERE b.draft_id = ? ORDER BY b.position`,
        ).run(revisionId, sourceVersionId, now, input.draftId);
        requireStore(mapped.changes === snapshot.blockCount, 'IMPORT_POSTCONDITION_FAILED', '稿件内容块的来源段落对应不完整。');
      } else {
        this.#insertMergedImportBlocks(input.draftId, manuscriptId, revisionId, branchId, sourceVersionId, merged, now);
      }
      this.#authority
        .prepare(
          `INSERT INTO workflow_profiles(
             profile_id, profile_version, profile_name, profile_digest, projection_schema, projection_json,
             native_profile_id, native_profile_version, native_profile_digest
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id, profile_version) DO NOTHING`,
        )
        .run(
          this.#workflowProfile.projection.id,
          this.#workflowProfile.projection.version,
          this.#workflowProfile.projection.name,
          this.#workflowProfile.projection.digest,
          this.#workflowProfile.projection.schema,
          workflowProjectionJson(this.#workflowProfile),
          this.#workflowProfile.native.id,
          this.#workflowProfile.native.version,
          this.#workflowProfile.native.digest,
        );
      const profile = one(
        this.#authority
          .prepare(
            `SELECT profile_name, profile_digest, projection_schema, projection_json,
                    native_profile_id, native_profile_version, native_profile_digest
             FROM workflow_profiles WHERE profile_id = ? AND profile_version = ?`,
          )
          .all(this.#workflowProfile.projection.id, this.#workflowProfile.projection.version) as SqlRow[],
        'PROFILE_CONFLICT',
        '工作流程方案版本缺失。',
      );
      requireStore(
        asString(profile.profile_name) === this.#workflowProfile.projection.name &&
          asString(profile.profile_digest) === this.#workflowProfile.projection.digest &&
          asString(profile.projection_schema) === this.#workflowProfile.projection.schema &&
          asString(profile.projection_json) === workflowProjectionJson(this.#workflowProfile) &&
          asString(profile.native_profile_id) === this.#workflowProfile.native.id &&
          asString(profile.native_profile_version) === this.#workflowProfile.native.version &&
          asString(profile.native_profile_digest) === this.#workflowProfile.native.digest,
        'PROFILE_CONFLICT',
        '工作流程方案版本冲突。',
      );
      this.#authority
        .prepare(
          `INSERT INTO workflow_instances(
             workflow_instance_id, book_id, manuscript_id, profile_id, profile_version, profile_digest,
             native_profile_id, native_profile_version, native_profile_digest, current_phase, state, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        )
        .run(
          workflowInstanceId,
          bookId,
          manuscriptId,
          this.#workflowProfile.projection.id,
          this.#workflowProfile.projection.version,
          this.#workflowProfile.projection.digest,
          this.#workflowProfile.native.id,
          this.#workflowProfile.native.version,
          this.#workflowProfile.native.digest,
          this.#workflowProfile.projection.phases[0].label,
          now,
        );
      this.#authority
        .prepare(
          `INSERT INTO manuscript_import_records(
             import_record_id, commit_id, book_id, manuscript_id, source_version_id, fidelity_review_id,
             degradation_decision_id, resulting_revision_id, provenance_id, imported_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          importRecordId,
          input.commitId,
          bookId,
          manuscriptId,
          sourceVersionId,
          fidelityReviewId,
          degradationDecisionId,
          revisionId,
          provenanceId,
          now,
        );
      this.#authority
        .prepare(
          `INSERT INTO branch_working_state(
             branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest,
             total_graphemes, history_sequence, last_checkpoint_sequence
           ) VALUES (?, ?, ?, 0, ?, ?, 0, 0)`,
        )
        .run(branchId, manuscriptId, revisionId, workingDigest, characterCount);
      requireStore(
        this.#boundedCall(() => this.#boundedAuthority.initializeImportedBranch(branchId)) === characterCount,
        'IMPORT_POSTCONDITION_FAILED',
        '稿件索引无法由暂存快照精确建立。',
      );
      // Issue #411 (D5): the file's comments and tracked changes become 批注 and 修改建议 on r1 in this same
      // transaction, whose source is the file's author — all of them, or no import. A staged body block keeps
      // its identity in r1 whether or not text boxes were merged.
      const stagedBlockId = this.#authority.prepare('SELECT staged_block_id FROM staged_import_blocks WHERE draft_id = ? AND position = ?');
      const importedMarks = this.#importedMarkCall(() => createImportedMarks(this.#authority, this.#editorialMarks, input.draftId, {
        manuscriptId,
        branchId,
        blockIdOf: (position) => asString(one(stagedBlockId.all(input.draftId, position) as SqlRow[],
          'IMPORT_MARK_ANCHOR_FAILED', '文件中的批注或修订无法准确落在稿件文字上，本次导入没有提交。').staged_block_id),
      }));
      requireStore(importedMarks === plan.importedMarks, 'IMPORT_POSTCONDITION_FAILED', '导入的批注与修改建议与保真审阅的数量不一致。');

      result = {
        commitId: input.commitId,
        importedAt: now,
        completionLabel: '稿件已导入',
        bookId,
        manuscriptId,
        branchId,
        revisionId,
        importRecordId,
        source: this.#stagedProjection(snapshot).source,
        fidelityReview: {
          fidelityReviewId,
          outcome: plan.outcome,
          categories: reviewedFidelity,
        },
        importRecord: {
          importRecordId,
          fidelityReviewId,
          degradationDecision: degradationDecisionId
            ? {
                degradationDecisionId,
                summaryLabel: '含已接受的降级',
                acceptedItems: plan.degradations,
              }
            : null,
        },
        overview: this.getBookOverview(bookId),
      };
      this.#authority
        .prepare(
          `INSERT INTO import_commits(
             commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, result_json, committed_at
           ) VALUES (?, ?, ?, ?, ?, 'manuscript-import', ?, ?)`,
        )
        .run(
          input.commitId,
          input.draftId,
          requestFingerprint,
          input.expectedDraftVersion,
          input.reviewDigest,
          canonicalJson(immutableCommitResult(result)),
          now,
        );
      const draftUpdate = this.#authority
        .prepare(
          `UPDATE import_drafts
           SET state = 'committed', committed_commit_id = ?, committed_at = ?
           WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ? AND review_digest = ?`,
        )
        .run(input.commitId, now, input.draftId, input.expectedDraftVersion, input.reviewDigest);
      requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '导入草稿在提交时已变化。');
      const attemptUpdate = this.#authority
        .prepare(
          `UPDATE import_commit_attempts
           SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
           WHERE attempt_id = ? AND draft_id = ? AND state = 'prepared'
             AND operation_kind = 'manuscript-import'
             AND request_fingerprint = ? AND expected_draft_version = ? AND review_digest = ?`,
        )
        .run(
          now,
          input.commitId,
          input.draftId,
          requestFingerprint,
          input.expectedDraftVersion,
          input.reviewDigest,
        );
      requireStore(attemptUpdate.changes === 1, 'COMMIT_ATTEMPT_CHANGED', '持久提交尝试状态已变化。');

      this.#assertImportPostconditions({
        bookId,
        dimensionSetId,
        manuscriptId,
        branchId,
        revisionId,
        sourceVersionId,
        fidelityReviewId,
        degradationDecisionId,
        workflowInstanceId,
        importRecordId,
        blockCount,
        characterCount,
        reviewDigest: input.reviewDigest,
        fidelityPlan: plan,
        fidelityCategoryCount: reviewedFidelity.length,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        conversion: snapshot.conversion,
        parserIdentity: snapshot.parserIdentity!,
      });
      this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(input.draftId);
      this.#assertForeignKeys(this.#authority);
    });

    requireStore(result, 'COMMIT_FAILED', '导入提交未产生结果。');
    const firstWindow = this.getManuscriptWindow(result.manuscriptId, result.branchId, null);
    return { ...result, firstWindow };
  }

  async commitSourceImport(
    input: {
      draftId: string;
      expectedDraftVersion: number;
      reviewDigest: string;
      commitId: string;
    },
    options: { interruptAfterAttempt?: boolean } = {},
  ): Promise<SourceImportCommitProjection> {
    this.#assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId) && DIGEST_PATTERN.test(input.reviewDigest),
      'COMMIT_INVALID',
      '来源导入提交参数无效。',
    );
    this.#requireNoAbandonmentCleanupIntent(input.draftId);
    const requestFingerprint = commitRequestFingerprint('source-import', input);
    const existingAttempt = this.#loadCommitAttemptForDraft(input.draftId);
    if (existingAttempt) {
      requireStore(
        existingAttempt.attemptId === input.commitId &&
          existingAttempt.operationKind === 'source-import' &&
          existingAttempt.requestFingerprint === requestFingerprint &&
          existingAttempt.expectedDraftVersion === input.expectedDraftVersion &&
          existingAttempt.reviewDigest === input.reviewDigest,
        'IDEMPOTENCY_CONFLICT',
        '该来源导入草稿已绑定另一项持久提交尝试。',
      );
      const reconciliation = await this.#reconcileCommitAttempt(existingAttempt);
      if (reconciliation.state === 'committed') {
        requireStore(reconciliation.result.completionLabel === '来源材料已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与来源导入不一致。');
        return reconciliation.result;
      }
      requireStore(reconciliation.state === 'uncommitted', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '来源导入提交结果待确认。');
    }

    const snapshotBeforeAttempt = this.#loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '来源导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '来源导入复核摘要已变化。');
    const revalidated = await this.#revalidateSnapshot(snapshotBeforeAttempt);
    requireStore(!revalidated.parserDrift, 'REVIEW_CHANGED', '解析器状态已变化，请重新复核来源导入。');
    const snapshotForAttempt = revalidated.snapshot;
    const identityFindingsForAttempt = this.#identityFindings(snapshotForAttempt);
    requireStore(
      this.#reconstructReviewedSourceImportTarget(snapshotForAttempt, identityFindingsForAttempt) !== null,
      'REVIEW_CHANGED',
      '来源导入复核无法由当前权威状态重建。',
    );
    if (!existingAttempt) {
      const preparedAt = new Date().toISOString();
      this.#transaction(this.#authority, () => {
        this.#authority.prepare(
          `INSERT INTO import_commit_attempts(
             attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, state, prepared_at
           ) VALUES (?, ?, ?, ?, ?, 'source-import', 'prepared', ?)`,
        ).run(
          input.commitId,
          input.draftId,
          requestFingerprint,
          input.expectedDraftVersion,
          input.reviewDigest,
          preparedAt,
        );
      });
    }
    if (options.interruptAfterAttempt) {
      throw new StoreFatalError(new Error('E2E interruption after durable source import attempt preparation.'));
    }

    let result: SourceImportCommitProjection | undefined;
    this.#transaction(this.#authority, () => {
      const existing = this.#authority.prepare(
        'SELECT request_fingerprint, operation_kind FROM import_commits WHERE commit_id = ?',
      ).all(input.commitId) as SqlRow[];
      if (existing.length === 1) {
        requireStore(
          asString(existing[0]!.request_fingerprint) === requestFingerprint &&
            asString(existing[0]!.operation_kind) === 'source-import',
          'IDEMPOTENCY_CONFLICT',
          '提交标识已用于另一项导入。',
        );
        const stored = this.#loadStoredCommitResult(input.commitId);
        requireStore(stored.completionLabel === '来源材料已导入', 'IDEMPOTENCY_CONFLICT', '提交类型与来源导入不一致。');
        result = stored;
        return;
      }
      requireStore(existing.length === 0, 'STORE_CORRUPT', '提交标识记录不唯一。');

      const snapshot = this.#loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed', 'DRAFT_NOT_REVIEWED', '来源导入草稿尚未完成复核。');
      requireStore(snapshot.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
      requireStore(snapshot.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '来源导入复核摘要已变化。');
      const identityFindings = this.#identityFindings(snapshot);
      const target = this.#reconstructReviewedSourceImportTarget(snapshot, identityFindings);
      requireStore(target !== null, 'REVIEW_CHANGED', '来源导入复核无法由当前权威状态重建。');
      // Only a parsed draft has a staged snapshot to assert integrity over; a retained original has
      // its exact bytes and nothing else (ADR 0072 §2).
      if (snapshot.parserIdentity !== null) {
        this.#boundedCall(() => this.#boundedAuthority.assertStagedDraftIntegrity(input.draftId));
      }

      const now = new Date().toISOString();
      const bookId = target.bookId;
      const dimensionSetId = target.kind === 'existing-book' ? target.dimensionSetId : randomUUID();
      const sourceVersionId = target.sourceVersionDisposition === 'reused-same-book'
        ? target.reuseSourceVersionId!
        : randomUUID();
      const provenanceId = randomUUID();
      const sourceImportRecordId = randomUUID();
      const before = target.kind === 'existing-book' ? this.#sourceImportAuthorityCounts(bookId) : null;

      if (target.kind === 'new-book') {
        this.#authority.prepare(
          'INSERT INTO books(book_id, stable_identity, title, created_at, internal_number) VALUES (?, ?, ?, ?, NULL)',
        ).run(bookId, target.stableIdentity, target.confirmedTitle, now);
        this.#insertBookDimensionSet(dimensionSetId, bookId, now);
      } else {
        const current = this.#bookSourceImportTarget(bookId, snapshot.sourceDigest);
        requireStore(
          current.bookStateDigest === target.bookStateDigest && current.dimensionSetId === target.dimensionSetId &&
            current.exactSourceVersionId === target.reuseSourceVersionId,
          'REVIEW_CHANGED',
          '所选图书、维度集、稿件状态或来源版本已变化。',
        );
      }

      if (target.sourceVersionDisposition === 'created') {
        this.#authority.prepare(
          `INSERT INTO source_versions(
             source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
             parser_identity, format, display_name, created_at, working_object_digest, converter_identity
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          sourceVersionId,
          bookId,
          snapshot.objectDigest,
          snapshot.sourceDigest,
          snapshot.contentDigest,
          snapshot.structureDigest,
          snapshot.parserIdentity,
          snapshot.sourceFormat,
          snapshot.displayName,
          now,
          snapshot.workingObjectDigest,
          snapshot.conversion?.converterIdentity ?? null,
        );
      } else {
        const source = one(this.#authority.prepare(
          `SELECT book_id, object_digest, source_digest, content_digest, structure_digest,
                  parser_identity, format
           FROM source_versions WHERE source_version_id = ?`,
        ).all(sourceVersionId) as SqlRow[], 'SOURCE_VERSION_REUSE_INVALID', '明确选择的来源版本不存在。');
        requireStore(
          asString(source.book_id) === bookId && asString(source.object_digest) === snapshot.objectDigest &&
            asString(source.source_digest) === snapshot.sourceDigest &&
            nullableString(source.content_digest) === snapshot.contentDigest &&
            nullableString(source.structure_digest) === snapshot.structureDigest &&
            nullableString(source.parser_identity) === snapshot.parserIdentity &&
            asString(source.format) === snapshot.sourceFormat,
          'SOURCE_VERSION_REUSE_INCOMPATIBLE',
          '明确选择的同图书来源版本与当前完整文件及解析身份不一致。',
        );
      }

      this.#authority.prepare(
        `INSERT INTO source_provenance(
           provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at
         ) VALUES (?, ?, 'native-file-picker', 'local-provider-free', ?, ?, ?)`,
      ).run(provenanceId, sourceVersionId, snapshot.displayName, snapshot.parserIdentity, snapshot.stagedAt);

      const retainedBoundary = sourceImportRetainedBoundary(snapshot);
      const importedAt = now;
      const recordDigest = sha256(canonicalJson({
        schema: SOURCE_IMPORT_RECORD_SCHEMA,
        sourceImportRecordId,
        commitId: input.commitId,
        bookId,
        sourceVersionId,
        provenanceId,
        targetKind: target.kind,
        sourceVersionDisposition: target.sourceVersionDisposition,
        retainedBoundary,
        namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
        importedAt,
      }));
      this.#authority.prepare(
        `INSERT INTO source_import_records(
           source_import_record_id, commit_id, book_id, source_version_id, provenance_id,
           target_kind, source_version_disposition, retained_boundary_json, named_non_effects_json,
           record_digest, imported_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        sourceImportRecordId,
        input.commitId,
        bookId,
        sourceVersionId,
        provenanceId,
        target.kind,
        target.sourceVersionDisposition,
        canonicalJson(retainedBoundary),
        canonicalJson(SOURCE_IMPORT_NON_EFFECTS),
        recordDigest,
        importedAt,
      );

      const receiptRecords = this.#sourceImportRecordPresentations(bookId, [sourceImportRecordId]);
      const receiptSource = receiptRecords.find((record) => record.kind === 'source');
      const receiptRecord = receiptRecords.find((record) => record.kind === 'source-import-record');
      requireStore(receiptSource?.kind === 'source' && receiptRecord?.kind === 'source-import-record',
        'SOURCE_IMPORT_POSTCONDITION_FAILED', '来源导入完成凭据不完整。');

      result = {
        commitId: input.commitId,
        importedAt,
        completionLabel: '来源材料已导入',
        targetKind: target.kind,
        createdBook: target.kind === 'new-book',
        bookId,
        sourceVersionId,
        sourceImportRecordId,
        sourceVersionDisposition: target.sourceVersionDisposition,
        source: this.#stagedProjection(snapshot).source,
        retainedBoundary,
        provenance: {
          acquisitionPath: 'native-file-picker',
          locality: 'local-provider-free',
          label: '本机文件选择器 · 本地解析 · 未联网',
          acquiredAt: snapshot.stagedAt,
          provenanceId,
        },
        namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
        receipt: { source: receiptSource, record: receiptRecord },
        overview: this.getBookOverview(bookId),
      };
      this.#authority.prepare(
        `INSERT INTO import_commits(
           commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
           operation_kind, result_json, committed_at
         ) VALUES (?, ?, ?, ?, ?, 'source-import', ?, ?)`,
      ).run(
        input.commitId,
        input.draftId,
        requestFingerprint,
        input.expectedDraftVersion,
        input.reviewDigest,
        canonicalJson(immutableCommitResult(result)),
        importedAt,
      );
      const draftUpdate = this.#authority.prepare(
        `UPDATE import_drafts
         SET state = 'committed', committed_commit_id = ?, committed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ? AND review_digest = ?`,
      ).run(input.commitId, importedAt, input.draftId, input.expectedDraftVersion, input.reviewDigest);
      requireStore(draftUpdate.changes === 1, 'DRAFT_VERSION_CHANGED', '来源导入草稿在提交时已变化。');
      const attemptUpdate = this.#authority.prepare(
        `UPDATE import_commit_attempts
         SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
         WHERE attempt_id = ? AND draft_id = ? AND state = 'prepared'
           AND operation_kind = 'source-import'
           AND request_fingerprint = ? AND expected_draft_version = ? AND review_digest = ?`,
      ).run(
        importedAt,
        input.commitId,
        input.draftId,
        requestFingerprint,
        input.expectedDraftVersion,
        input.reviewDigest,
      );
      requireStore(attemptUpdate.changes === 1, 'COMMIT_ATTEMPT_CHANGED', '来源导入持久提交尝试状态已变化。');

      const after = this.#sourceImportAuthorityCounts(bookId);
      const expectedBefore = before ?? {
        manuscripts: 0,
        revisions: 0,
        workflows: 0,
        fidelityReviews: 0,
        manuscriptImports: 0,
        sourceVersions: 0,
        provenance: 0,
        sourceImports: 0,
      };
      requireStore(
        after.manuscripts === expectedBefore.manuscripts && after.revisions === expectedBefore.revisions &&
          after.workflows === expectedBefore.workflows && after.fidelityReviews === expectedBefore.fidelityReviews &&
          after.manuscriptImports === expectedBefore.manuscriptImports &&
          after.sourceVersions === expectedBefore.sourceVersions + (target.sourceVersionDisposition === 'created' ? 1 : 0) &&
          after.provenance === expectedBefore.provenance + 1 && after.sourceImports === expectedBefore.sourceImports + 1,
        'IMPORT_POSTCONDITION_FAILED',
        '来源导入的记录图或具名非影响边界不成立。',
      );
      this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(input.draftId);
      this.#assertForeignKeys(this.#authority);
    });

    requireStore(result !== undefined, 'COMMIT_FAILED', '来源导入提交未产生结果。');
    return result;
  }

  resolveAcknowledgedManuscriptReimportReplay(
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
  ): { draftId: string; commitId: string; bookId: string } {
    this.#assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId) &&
        Number.isSafeInteger(input.expectedDraftVersion) && input.expectedDraftVersion >= 1 &&
        DIGEST_PATTERN.test(input.reviewDigest),
      'COMMIT_REPLAY_INVALID',
      '已确认的稿件重新导入提交重放证据不匹配。',
    );
    const requestFingerprint = commitRequestFingerprint('manuscript-reimport', input);
    const attempt = this.#loadCommitAttemptForDraft(input.draftId);
    requireStore(
      attempt !== null &&
        attempt.attemptId === input.commitId &&
        attempt.operationKind === 'manuscript-reimport' &&
        attempt.requestFingerprint === requestFingerprint &&
        attempt.expectedDraftVersion === input.expectedDraftVersion &&
        attempt.reviewDigest === input.reviewDigest &&
        attempt.state === 'committed' &&
        attempt.completionAcknowledgedAt !== null,
      'COMMIT_REPLAY_INVALID',
      '已确认的稿件重新导入提交重放证据不匹配。',
    );
    const record = one(
      this.#authority.prepare(
        `SELECT ic.draft_id, ic.request_fingerprint, ic.expected_draft_version, ic.review_digest,
                ic.operation_kind, rr.book_id
         FROM import_commits ic
         JOIN manuscript_reimport_records rr ON rr.commit_id = ic.commit_id
         WHERE ic.commit_id = ?`,
      ).all(input.commitId) as SqlRow[],
      'STORE_CORRUPT',
      '已确认的稿件重新导入提交记录图不完整。',
    );
    const bookId = asString(record.book_id);
    requireStore(
      asString(record.draft_id) === input.draftId &&
        asString(record.request_fingerprint) === requestFingerprint &&
        asNumber(record.expected_draft_version) === input.expectedDraftVersion &&
        asString(record.review_digest) === input.reviewDigest &&
        asString(record.operation_kind) === 'manuscript-reimport' &&
        UUID_PATTERN.test(bookId),
      'STORE_CORRUPT',
      '已确认的稿件重新导入提交记录图不一致。',
    );
    return { draftId: input.draftId, commitId: input.commitId, bookId };
  }

  async createManuscriptReimportCommitWork(
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
    options: {
      interruptAfterAttempt?: boolean;
      interruptAfterCommit?: boolean;
      legacyResultWithoutPresentation?: boolean;
    } = {},
  ): Promise<{ workId: string | null; total: number; result: ManuscriptReimportCommitProjection | null }> {
    this.#assertAvailable();
    requireStore(
      UUID_PATTERN.test(input.draftId) && UUID_PATTERN.test(input.commitId) && DIGEST_PATTERN.test(input.reviewDigest),
      'COMMIT_INVALID',
      '稿件重新导入提交参数无效。',
    );
    this.#requireNoAbandonmentCleanupIntent(input.draftId);
    const requestFingerprint = commitRequestFingerprint('manuscript-reimport', input);
    const existingAttempt = this.#loadCommitAttemptForDraft(input.draftId);
    if (existingAttempt) {
      requireStore(
        existingAttempt.attemptId === input.commitId && existingAttempt.operationKind === 'manuscript-reimport' &&
          existingAttempt.requestFingerprint === requestFingerprint &&
          existingAttempt.expectedDraftVersion === input.expectedDraftVersion &&
          existingAttempt.reviewDigest === input.reviewDigest,
        'IDEMPOTENCY_CONFLICT',
        '该重新导入草稿已绑定另一项持久提交尝试。',
      );
      requireStore(existingAttempt.state !== 'uncertain', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN',
        '稿件重新导入提交结果待启动恢复确认。');
      if (existingAttempt.state === 'committed' && !this.#verifiedCommitObjects.has(existingAttempt.attemptId)) {
        requireStore(!Array.from(this.#reimportCommitWork.values()).some((work) => work.input.draftId === input.draftId),
          'SERVICE_BUSY', '该重新导入复核已有提交任务。');
        return this.#createManuscriptReimportReplayWork(input, existingAttempt);
      }
      const reconciliation = await this.#reconcileCommitAttempt(existingAttempt, { contentObjectAlreadyVerified: true });
      if (reconciliation.state === 'committed') {
        requireStore(
          reconciliation.result.completionLabel === '稿件已重新导入' ||
            reconciliation.result.completionLabel === '未发现稿件变化',
          'IDEMPOTENCY_CONFLICT',
          '提交类型与稿件重新导入不一致。',
        );
        return { workId: null, total: 0, result: reconciliation.result };
      }
      requireStore(reconciliation.state === 'uncommitted', 'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '稿件重新导入提交结果待确认。');
    }
    const snapshotBeforeAttempt = this.#loadDraftSnapshot(input.draftId);
    requireStore(snapshotBeforeAttempt.state === 'reviewed' && snapshotBeforeAttempt.reviewedRelationship === 'reimport',
      'DRAFT_NOT_REVIEWED', '稿件重新导入草稿尚未完成复核。');
    requireStore(snapshotBeforeAttempt.version === input.expectedDraftVersion, 'DRAFT_VERSION_CHANGED', '导入草稿版本已变化。');
    requireStore(snapshotBeforeAttempt.reviewDigest === input.reviewDigest, 'REVIEW_CHANGED', '稿件重新导入复核摘要已变化。');
    requireStore(snapshotBeforeAttempt.parserIdentity === DOCX_PARSER_IDENTITY,
      'REVIEW_CHANGED', '解析器状态已变化，请重新复核稿件重新导入。');
    const targetBeforeAttempt = this.#reconstructReviewedReimportTarget(snapshotBeforeAttempt);
    requireStore(targetBeforeAttempt !== null, 'REVIEW_CHANGED', '稿件重新导入复核无法由当前权威状态重建。');
    requireStore(!Array.from(this.#reimportCommitWork.values()).some((work) => work.input.draftId === input.draftId),
      'SERVICE_BUSY', '该重新导入复核已有提交任务。');
    const evidence = this.#reimportEvidence(input.draftId);
    requireStore(evidence.unresolvedMappings === 0,
      'REIMPORT_MAPPING_UNRESOLVED', '仍有逐块映射未明确解决。');
    const object = one(this.#authority.prepare(
      'SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?',
    ).all(snapshotBeforeAttempt.objectDigest) as SqlRow[], 'SNAPSHOT_RESELECTION_REQUIRED', '暂存对象记录缺失。');
    requireStore(snapshotBeforeAttempt.objectDigest === snapshotBeforeAttempt.sourceDigest &&
      asNumber(object.byte_length) === snapshotBeforeAttempt.sourceBytes,
    'SNAPSHOT_RESELECTION_REQUIRED', '暂存对象身份记录不一致。');
    const objectPath = this.#contentObjectPath(snapshotBeforeAttempt.objectDigest, asString(object.relative_key));
    const pathInfo = lstatSync(objectPath);
    requireStore(pathInfo.isFile() && !pathInfo.isSymbolicLink() && pathInfo.size === snapshotBeforeAttempt.sourceBytes,
      'SNAPSHOT_RESELECTION_REQUIRED', '暂存对象长度无效。');
    this.#authority.exec(
      `CREATE TEMP TABLE IF NOT EXISTS reimport_commit_rows(
         work_id TEXT NOT NULL,
         position INTEGER NOT NULL,
         block_id TEXT NOT NULL,
         kind TEXT NOT NULL,
         level INTEGER,
         text TEXT NOT NULL,
         digest TEXT NOT NULL,
         start_offset INTEGER NOT NULL,
         grapheme_length INTEGER NOT NULL,
         offset_span INTEGER NOT NULL,
         creates_identity INTEGER NOT NULL CHECK(creates_identity IN (0, 1)),
         PRIMARY KEY(work_id, position),
         UNIQUE(work_id, block_id)
       ) WITHOUT ROWID`,
    );
    const workId = randomUUID();
    const abortController = new AbortController();
    const work: ReimportCommitWork = {
      mode: 'commit',
      workId,
      input,
      requestFingerprint,
      snapshot: snapshotBeforeAttempt,
      target: targetBeforeAttempt,
      evidence,
      resultingRevisionId: evidence.changed ? randomUUID() : null,
      objectPath,
      abortController,
      total: snapshotBeforeAttempt.sourceBytes + evidence.totalMappings,
      attemptExists: existingAttempt !== null,
      interruptAfterAttempt: options.interruptAfterAttempt === true,
      interruptAfterCommit: options.interruptAfterCommit === true,
      legacyResultWithoutPresentation: options.legacyResultWithoutPresentation === true,
      phase: 'parse',
      parseBytes: 0,
      converted: null,
      parsedIngest: null,
      parseFailure: null,
      mappingPosition: 0,
      stagedBlocks: 0,
      stagedCharacters: 0,
      offsetSegments: [],
    };
    this.#reimportCommitWork.set(workId, work);
    // A converted source was read through its working representation (ADR 0072 §2), and the kept original is not a Word
    // document: the commit re-reads the working representation, after reproducing the conversion from the original, as
    // revalidation does (Issue #597). Its parse progress still counts against the original's bytes.
    const parseSource = async (): Promise<IngestedDocx> => {
      const converted = snapshotBeforeAttempt.conversion === null
        ? null
        : await this.#revalidateConversion(snapshotBeforeAttempt, objectPath);
      work.converted = converted;
      return this.#parseIntoIngest(input.draftId, converted?.path ?? objectPath, snapshotBeforeAttempt.displayName, {
        signal: abortController.signal,
        onArchiveProgress: (bytes) => {
          if (this.#reimportCommitWork.get(workId) === work) {
            // The segment is sized by the original's bytes; a working representation's parse is scaled into it.
            const scaled = converted === null ? bytes : Math.round(bytes * snapshotBeforeAttempt.sourceBytes / converted.byteLength);
            work.parseBytes = Math.min(scaled, snapshotBeforeAttempt.sourceBytes);
          }
        },
      });
    };
    void parseSource().then((ingested) => {
      if (this.#reimportCommitWork.get(workId) === work) work.parsedIngest = ingested;
      else this.#discardIngest(ingested.ingestId);
    }).catch((error: unknown) => {
      if (this.#reimportCommitWork.get(workId) === work) work.parseFailure = error;
    });
    return { workId, total: work.total, result: null };
  }

  #createManuscriptReimportReplayWork(
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string },
    attempt: CommitAttempt,
  ): { workId: string; total: number; result: null } {
    let openedFd: number | null = null;
    try {
      const stored = this.#loadStoredCommitResult(attempt.attemptId);
      requireStore(stored.completionLabel === '稿件已重新导入' || stored.completionLabel === '未发现稿件变化',
        'IDEMPOTENCY_CONFLICT', '提交类型与稿件重新导入不一致。');
      const object = one(this.#authority.prepare(
        `SELECT co.object_digest, co.relative_key, co.byte_length
         FROM manuscript_reimport_records rr
         JOIN source_versions sv ON sv.source_version_id = rr.source_version_id
         JOIN content_objects co ON co.object_digest = sv.object_digest
         WHERE rr.commit_id = ? AND rr.reimport_record_id = ?`,
      ).all(attempt.attemptId, stored.reimportRecordId) as SqlRow[],
      'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象记录缺失。');
      const expectedDigest = asString(object.object_digest);
      const total = asNumber(object.byte_length);
      requireStore(total > 0 && expectedDigest === stored.source.sourceSha256 && total === stored.source.sourceBytes,
        'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象身份不一致。');
      const objectPath = this.#contentObjectPath(expectedDigest, asString(object.relative_key));
      const info = lstatSync(objectPath);
      requireStore(info.isFile() && !info.isSymbolicLink() && info.size === total,
        'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象长度无效。');
      const objectFd = openSync(objectPath, constants.O_RDONLY);
      openedFd = objectFd;
      const opened = fstatSync(objectFd);
      requireStore(opened.isFile() && opened.size === total,
        'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象打开后身份无效。');
      const workId = randomUUID();
      this.#reimportCommitWork.set(workId, {
        mode: 'committed-replay',
        workId,
        input,
        attempt,
        result: stored,
        objectPath,
        objectFd,
        objectHasher: createHash('sha256'),
        expectedDigest,
        total,
        completed: 0,
      });
      openedFd = null;
      return { workId, total, result: null };
    } catch (error) {
      if (openedFd !== null) closeSync(openedFd);
      this.#markCommitAttemptUncertain(attempt.attemptId);
      if (error instanceof StoreFatalError) throw error;
      throw new StoreError('IMPORT_COMMIT_OUTCOME_UNCERTAIN', '已提交重新导入的来源对象无法完成重放校验。');
    }
  }

  async advanceManuscriptReimportCommitWork(workId: string): Promise<ReimportCommitProgress> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '稿件重新导入提交任务标识无效。');
    const work = this.#reimportCommitWork.get(workId);
    requireStore(work !== undefined, 'JOB_NOT_FOUND', '稿件重新导入提交任务不存在或已结束。');
    if (work.mode === 'committed-replay') {
      try {
        requireStore(work.objectFd !== null, 'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象句柄已关闭。');
        const remaining = work.total - work.completed;
        const buffer = Buffer.allocUnsafe(Math.min(REIMPORT_COMMIT_FILE_BATCH_BYTES, remaining));
        const read = readSync(work.objectFd, buffer, 0, buffer.length, work.completed);
        requireStore(read > 0, 'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象提前结束。');
        work.objectHasher.update(buffer.subarray(0, read));
        work.completed += read;
        if (work.completed < work.total) {
          return { done: false, completed: work.completed, total: work.total, result: null };
        }
        closeSync(work.objectFd);
        work.objectFd = null;
        requireStore(work.objectHasher.digest('hex') === work.expectedDigest,
          'COMMIT_PROOF_INCONCLUSIVE', '重新导入重放来源对象摘要无效。');
        const reconciliation = await this.#reconcileCommitAttempt(work.attempt, { contentObjectAlreadyVerified: true });
        requireStore(reconciliation.state === 'committed' &&
          (reconciliation.result.completionLabel === '稿件已重新导入' ||
            reconciliation.result.completionLabel === '未发现稿件变化'),
        'IMPORT_COMMIT_OUTCOME_UNCERTAIN', '已提交重新导入无法由持久证据精确重放。');
        this.#rememberVerifiedCommitObject(work.input.commitId);
        this.#reimportCommitWork.delete(workId);
        return { done: true, completed: work.total, total: work.total, result: reconciliation.result };
      } catch (error) {
        if (work.objectFd !== null) closeSync(work.objectFd);
        work.objectFd = null;
        this.#reimportCommitWork.delete(workId);
        this.#markCommitAttemptUncertain(work.attempt.attemptId);
        if (error instanceof StoreFatalError) throw error;
        throw new StoreError('IMPORT_COMMIT_OUTCOME_UNCERTAIN', '已提交重新导入的重放校验无法证明结果。');
      }
    }
    if (work.phase === 'parse') {
      if (work.parseFailure !== null) {
        if (work.parseFailure instanceof StoreFatalError) throw work.parseFailure;
        throw new StoreError('SNAPSHOT_RESELECTION_REQUIRED', '暂存对象无法重新解析并核对。');
      }
      if (work.parsedIngest === null) {
        return { done: false, completed: work.parseBytes, total: work.total, result: null };
      }
      const parsed = work.parsedIngest.parsed;
      // A converted source is checked against its reproduced working representation, and its fidelity is the
      // conversion's, as revalidation checks it (Issue #597).
      const converted = work.snapshot.conversion === null ? null : work.converted;
      requireStore(
        parsed.sourceDigest === (converted?.digest ?? work.snapshot.sourceDigest) &&
          parsed.archiveBytes === (converted?.byteLength ?? work.snapshot.sourceBytes) &&
          parsed.parserIdentity === work.snapshot.parserIdentity &&
          parsed.contentDigest === work.snapshot.contentDigest &&
          parsed.structureDigest === work.snapshot.structureDigest &&
          parsed.blockCount === work.snapshot.blockCount &&
          parsed.characterCount === work.snapshot.characterCount &&
          canonicalJson(converted?.fidelity ?? parsed.fidelity) === canonicalJson(work.snapshot.fidelity) &&
          parsed.titleSuggestion.value === work.snapshot.titleSuggestion &&
          parsed.titleSuggestion.sourceLabel === work.snapshot.titleSource &&
          this.#retentionCall(() => stagedImportSourcesMatch(this.#authority, work.input.draftId, work.parsedIngest!.sources)),
        'SNAPSHOT_RESELECTION_REQUIRED',
        '暂存来源身份或解析证据无法精确重建。',
      );
      work.parseBytes = work.snapshot.sourceBytes;
      work.phase = 'mappings';
      return { done: false, completed: work.parseBytes, total: work.total, result: null };
    }
    requireStore(work.parsedIngest !== null, 'SNAPSHOT_RESELECTION_REQUIRED', '暂存解析计划缺失。');
    const rows = this.#authority.prepare(
      `SELECT m.*, r.resolution, r.resolved_current_block_id,
              claimed.mapping_id claimed_mapping_id,
              sib.staged_block_id actual_staged_block_id, sib.position actual_staged_position,
              sib.kind actual_staged_kind, sib.level actual_staged_level, sib.text actual_staged_text,
              sib.digest actual_staged_digest, sib.start_offset, sib.grapheme_length,
              iib.staged_block_id ingest_staged_block_id, iib.position ingest_position,
              iib.kind ingest_kind, iib.level ingest_level, iib.text ingest_text,
              iib.digest ingest_digest, iib.start_offset ingest_start_offset,
              iib.grapheme_length ingest_grapheme_length
       FROM manuscript_reimport_mappings m
       JOIN manuscript_reimport_comparisons c ON c.comparison_id = m.comparison_id
       LEFT JOIN manuscript_reimport_mapping_resolutions r ON r.mapping_id = m.mapping_id
       LEFT JOIN manuscript_reimport_mapping_resolutions claimed
         ON claimed.comparison_id = m.comparison_id
        AND claimed.resolved_current_block_id = m.current_block_id
        AND claimed.mapping_id <> m.mapping_id
       LEFT JOIN staged_import_blocks sib
         ON sib.draft_id = c.draft_id AND sib.staged_block_id = m.staged_block_id
       LEFT JOIN import_ingest_blocks iib
         ON iib.ingest_id = ? AND iib.draft_id = c.draft_id AND iib.staged_block_id = m.staged_block_id
       WHERE c.draft_id = ? AND m.position > ? ORDER BY m.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
    ).all(work.parsedIngest.ingestId, work.input.draftId, work.mappingPosition) as SqlRow[];
    if (rows.length > 0) {
      const insert = this.#authority.prepare(
        `INSERT INTO temp.reimport_commit_rows(
           work_id, position, block_id, kind, level, text, digest, start_offset, grapheme_length,
           offset_span, creates_identity
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const row of rows) {
        const mappingPosition = asNumber(row.position);
        requireStore(mappingPosition === work.mappingPosition + 1,
          'REIMPORT_COMPARISON_INVALID', '重新导入提交映射顺序不连续。');
        work.mappingPosition = mappingPosition;
        if (row.staged_block_id === null) {
          requireStore(row.current_block_id !== null &&
            (row.resolution === 'retire-current-identity' || row.claimed_mapping_id !== null),
          'REIMPORT_MAPPING_UNRESOLVED', '重新导入删除身份后果不完整。');
          continue;
        }
        requireStore(row.actual_staged_block_id !== null &&
          asString(row.staged_block_id) === asString(row.actual_staged_block_id) &&
          asNumber(row.staged_position) === asNumber(row.actual_staged_position) &&
          asString(row.staged_kind) === asString(row.actual_staged_kind) &&
          (row.staged_level === null ? null : asNumber(row.staged_level)) ===
            (row.actual_staged_level === null ? null : asNumber(row.actual_staged_level)) &&
          asString(row.staged_text) === asString(row.actual_staged_text) &&
          asString(row.staged_digest) === asString(row.actual_staged_digest) &&
          manuscriptBlockDigest(
            asString(row.staged_kind) as ManuscriptBlockProjection['kind'],
            row.staged_level === null ? null : asNumber(row.staged_level),
            asString(row.staged_text),
          ) === asString(row.staged_digest),
        'REIMPORT_COMPARISON_INVALID', '重新导入提交映射不再绑定精确暂存块。');
        requireStore(row.ingest_staged_block_id !== null &&
          asString(row.ingest_staged_block_id) === asString(row.actual_staged_block_id) &&
          asNumber(row.ingest_position) === asNumber(row.actual_staged_position) &&
          asString(row.ingest_kind) === asString(row.actual_staged_kind) &&
          (row.ingest_level === null ? null : asNumber(row.ingest_level)) ===
            (row.actual_staged_level === null ? null : asNumber(row.actual_staged_level)) &&
          asString(row.ingest_text) === asString(row.actual_staged_text) &&
          asString(row.ingest_digest) === asString(row.actual_staged_digest) &&
          asNumber(row.ingest_start_offset) === asNumber(row.start_offset) &&
          asNumber(row.ingest_grapheme_length) === asNumber(row.grapheme_length),
        'SNAPSHOT_RESELECTION_REQUIRED', '重新解析结果与暂存稿件块不一致。');
        const position = asNumber(row.staged_position);
        const graphemeLength = Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
          .segment(asString(row.staged_text))).length;
        requireStore(position === work.stagedBlocks + 1 && asNumber(row.start_offset) === work.stagedCharacters &&
          asNumber(row.grapheme_length) === graphemeLength,
        'REIMPORT_COMPARISON_INVALID', '重新导入提交暂存块偏移或字素长度无效。');
        const preservesExact = row.identity_consequence === 'preserve-current-identity';
        const preservesSelected = row.resolution === 'preserve-current-identity';
        const createsIdentity = row.resolution === 'create-new-identity';
        requireStore(preservesExact || preservesSelected || createsIdentity,
          'REIMPORT_MAPPING_UNRESOLVED', '重新导入结构身份后果不完整。');
        const blockId = preservesExact
          ? asString(row.current_block_id)
          : preservesSelected
            ? asString(row.resolved_current_block_id)
            : `blk_${sha256(`${work.resultingRevisionId}\u0000${position}\u0000${asString(row.staged_digest)}`).slice(0, 24)}`;
        requireStore(!createsIdentity || work.resultingRevisionId !== null,
          'REIMPORT_COMPARISON_INVALID', '无变化重新导入不能创建结构身份。');
        const offsetSpan = appendReimportOffsetSegment(work.offsetSegments, position, graphemeLength);
        insert.run(workId, position, blockId, asString(row.staged_kind),
          row.staged_level === null ? null : asNumber(row.staged_level), asString(row.staged_text),
          asString(row.staged_digest), asNumber(row.start_offset), graphemeLength, offsetSpan, createsIdentity ? 1 : 0);
        work.stagedBlocks += 1;
        work.stagedCharacters += graphemeLength;
      }
      return {
        done: false,
        completed: work.parseBytes + work.mappingPosition,
        total: work.total,
        result: null,
      };
    }
    requireStore(work.mappingPosition === work.evidence.totalMappings &&
      work.stagedBlocks === work.snapshot.blockCount && work.stagedCharacters === work.snapshot.characterCount,
    'REIMPORT_COMPARISON_INVALID', '重新导入提交有界证明未覆盖完整稿件。');
    this.#discardIngest(work.parsedIngest.ingestId);
    work.parsedIngest = null;
    const currentSnapshot = this.#loadDraftSnapshot(work.input.draftId);
    requireStore(currentSnapshot.state === 'reviewed' && currentSnapshot.reviewedRelationship === 'reimport' &&
      currentSnapshot.version === work.input.expectedDraftVersion &&
      currentSnapshot.reviewDigest === work.input.reviewDigest,
    'REVIEW_CHANGED', '稿件重新导入复核在提交计划期间已变化。');
    const currentTarget = this.#reconstructReviewedReimportTarget(currentSnapshot);
    requireStore(currentTarget !== null && canonicalJson(currentTarget) === canonicalJson(work.target),
      'REVIEW_CHANGED', '稿件重新导入目标在提交计划期间已变化。');
    const currentEvidence = this.#reimportEvidence(work.input.draftId);
    requireStore(currentEvidence.unresolvedMappings === 0 &&
      canonicalJson(currentEvidence) === canonicalJson(work.evidence),
    'REIMPORT_MAPPING_UNRESOLVED', '稿件重新导入证据在提交计划期间已变化。');
    if (!work.attemptExists) {
      this.#transaction(this.#authority, () => {
        this.#authority.prepare(
          `INSERT INTO import_commit_attempts(
             attempt_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
             operation_kind, state, prepared_at
           ) VALUES (?, ?, ?, ?, ?, 'manuscript-reimport', 'prepared', ?)`,
        ).run(work.input.commitId, work.input.draftId, work.requestFingerprint,
          work.input.expectedDraftVersion, work.input.reviewDigest, new Date().toISOString());
      });
    }
    if (work.interruptAfterAttempt) {
      throw new StoreFatalError(new Error('E2E interruption after durable manuscript reimport attempt preparation.'));
    }
    const result = this.#finalizeManuscriptReimportCommit(work);
    this.#rememberVerifiedCommitObject(work.input.commitId);
    this.#reimportCommitWork.delete(workId);
    this.#authority.prepare('DELETE FROM temp.reimport_commit_rows WHERE work_id = ?').run(workId);
    if (work.legacyResultWithoutPresentation) {
      this.rewriteCommittedResultWithoutPresentationForTest(work.input.commitId);
    }
    if (work.interruptAfterCommit || work.legacyResultWithoutPresentation) {
      throw new StoreFatalError(new Error('E2E interruption after committed manuscript reimport and before response.'));
    }
    return { done: true, completed: work.total, total: work.total, result };
  }

  cancelManuscriptReimportCommitWork(workId: string): boolean {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(workId), 'JOB_INVALID', '稿件重新导入提交任务标识无效。');
    const work = this.#reimportCommitWork.get(workId);
    if (work === undefined) return false;
    if (work.mode === 'committed-replay') {
      if (work.objectFd !== null) closeSync(work.objectFd);
      this.#reimportCommitWork.delete(workId);
      return true;
    }
    work.abortController.abort();
    if (work.parsedIngest !== null) this.#discardIngest(work.parsedIngest.ingestId);
    this.#reimportCommitWork.delete(workId);
    this.#authority.prepare('DELETE FROM temp.reimport_commit_rows WHERE work_id = ?').run(workId);
    return true;
  }

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

  #finalizeManuscriptReimportCommit(work: ReimportCommitWork): ManuscriptReimportCommitProjection {
    const input = work.input;
    const requestFingerprint = work.requestFingerprint;

    let result: ManuscriptReimportCommitProjection | undefined;
    let committedResult: Omit<ManuscriptReimportCommitProjection, 'receipt' | 'overview' | 'window'> | undefined;
    this.#transaction(this.#authority, () => {
      const existing = this.#authority.prepare(
        'SELECT request_fingerprint, operation_kind FROM import_commits WHERE commit_id = ?',
      ).all(input.commitId) as SqlRow[];
      if (existing.length === 1) {
        requireStore(asString(existing[0]!.request_fingerprint) === requestFingerprint &&
          asString(existing[0]!.operation_kind) === 'manuscript-reimport',
        'IDEMPOTENCY_CONFLICT', '提交标识已用于另一项导入。');
        const stored = this.#loadStoredCommitResult(input.commitId);
        requireStore(stored.completionLabel === '稿件已重新导入' || stored.completionLabel === '未发现稿件变化',
          'IDEMPOTENCY_CONFLICT', '提交类型与稿件重新导入不一致。');
        result = stored;
        return;
      }
      requireStore(existing.length === 0, 'STORE_CORRUPT', '提交标识记录不唯一。');

      const snapshot = this.#loadDraftSnapshot(input.draftId);
      requireStore(snapshot.state === 'reviewed' && snapshot.version === input.expectedDraftVersion &&
        snapshot.reviewDigest === input.reviewDigest && snapshot.reviewedRelationship === 'reimport',
      'REVIEW_CHANGED', '稿件重新导入复核已变化。');
      const target = this.#reconstructReviewedReimportTarget(snapshot);
      requireStore(target !== null && canonicalJson(target) === canonicalJson(work.target),
        'REVIEW_CHANGED', '稿件重新导入复核无法由当前权威状态重建。');
      const evidence = this.#reimportEvidence(input.draftId);
      requireStore(evidence.unresolvedMappings === 0 && canonicalJson(evidence) === canonicalJson(work.evidence),
        'REIMPORT_MAPPING_UNRESOLVED', '重新导入比较证据在提交期间已变化。');
      const { fidelity: reimportFidelity, plan: fidelityPlan } = this.#reimportFidelity(snapshot);
      const degradationAcceptance = one(this.#authority.prepare(
        'SELECT degradation_accepted FROM manuscript_reimport_comparisons WHERE draft_id = ?',
      ).all(input.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
      requireStore(fidelityPlan.degradations.length === 0 || asNumber(degradationAcceptance.degradation_accepted) === 1,
        'DEGRADATION_ACCEPTANCE_REQUIRED', '必须明确接受本次重新导入的完整降级集合。');

      const now = new Date().toISOString();
      const before = this.#reimportAuthorityCounts(target.bookId);
      const sourceVersionId = target.sourceVersionDisposition === 'reused-same-book'
        ? target.reuseSourceVersionId!
        : randomUUID();
      const provenanceId = randomUUID();
      const reimportRecordId = randomUUID();
      const fidelityReviewId = randomUUID();
      const comparisonId = asString(one(this.#authority.prepare(
        'SELECT comparison_id FROM manuscript_reimport_comparisons WHERE draft_id = ?',
      ).all(input.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。').comparison_id);
      // What each mark of a changed row came to (Issue #412, S63), recorded beside the record once it exists.
      let markOutcomes: ReimportMarkOutcome[] = [];
      const degradationDecisionId = fidelityPlan.degradations.length > 0 ? randomUUID() : null;
      if (target.sourceVersionDisposition === 'created') {
        this.#authority.prepare(
          `INSERT INTO source_versions(
             source_version_id, book_id, object_digest, source_digest, content_digest, structure_digest,
             parser_identity, format, display_name, created_at, working_object_digest, converter_identity
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(sourceVersionId, target.bookId, snapshot.objectDigest, snapshot.sourceDigest,
          snapshot.contentDigest, snapshot.structureDigest, snapshot.parserIdentity, snapshot.sourceFormat,
          snapshot.displayName, now, snapshot.workingObjectDigest,
          snapshot.conversion?.converterIdentity ?? null);
      } else {
        const source = one(this.#authority.prepare(
          `SELECT book_id, object_digest, source_digest, content_digest, structure_digest, parser_identity, format,
                  working_object_digest, converter_identity
           FROM source_versions WHERE source_version_id = ?`,
        ).all(sourceVersionId) as SqlRow[], 'SOURCE_VERSION_REUSE_INVALID', '明确选择的来源版本不存在。');
        requireStore(asString(source.book_id) === target.bookId && asString(source.object_digest) === snapshot.objectDigest &&
          asString(source.source_digest) === snapshot.sourceDigest && asString(source.content_digest) === snapshot.contentDigest &&
          asString(source.structure_digest) === snapshot.structureDigest && asString(source.parser_identity) === snapshot.parserIdentity &&
          asString(source.format) === snapshot.sourceFormat &&
          (source.working_object_digest ?? null) === snapshot.workingObjectDigest &&
          (source.converter_identity ?? null) === (snapshot.conversion?.converterIdentity ?? null),
        'SOURCE_VERSION_REUSE_INCOMPATIBLE', '明确选择的同图书来源版本与暂存快照不一致。');
      }
      this.#authority.prepare(
        `INSERT INTO source_provenance(
           provenance_id, source_version_id, acquisition_path, locality, sanitized_identity, parser_identity, recorded_at
         ) VALUES (?, ?, 'native-file-picker', 'local-provider-free', ?, ?, ?)`,
      ).run(provenanceId, sourceVersionId, snapshot.displayName, snapshot.parserIdentity, snapshot.stagedAt);
      const fidelityReviewDigest = sha256(canonicalJson({
        schema: 'ai7.manuscript-reimport-fidelity-review/1',
        reimportRecordId,
        sourceVersionId,
        sourceDigest: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        categories: reimportFidelity,
        outcome: fidelityPlan.outcome,
      }));
      this.#authority.prepare(
        `INSERT INTO import_fidelity_reviews(
           fidelity_review_id, book_id, source_version_id, review_digest, outcome,
           round_trip_guaranteed, created_at
         ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
      ).run(fidelityReviewId, target.bookId, sourceVersionId, fidelityReviewDigest, fidelityPlan.outcome, now);
      const insertFidelity = this.#authority.prepare(
        `INSERT INTO import_fidelity_categories(
           fidelity_review_id, category_key, display_label, item_count, status, detail, position
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      reimportFidelity.forEach((category, index) => insertFidelity.run(
        fidelityReviewId, category.key, category.label, category.count, category.status, category.detail, index + 1,
      ));
      // A reimport offers no text-box choice (ADR 0086 §2): the file's text boxes stay with it, and the
      // review records that it kept them.
      if (fidelityPlan.textBoxDisposition !== null) {
        requireStore(fidelityPlan.textBoxDisposition === 'retain', 'FIDELITY_OUTSIDE_TRACER', '重新导入只能保留文本框。');
        this.#retentionCall(() => recordTextBoxChoice(this.#authority, fidelityReviewId, 'retain', now));
      }
      if (degradationDecisionId !== null) {
        const decision = canonicalDegradationDecision(fidelityPlan);
        requireStore(decision !== null, 'FIDELITY_OUTSIDE_TRACER', '重新导入降级决定无法形成规范记录。');
        this.#authority.prepare(
          `INSERT INTO import_degradation_decisions(
             degradation_decision_id, fidelity_review_id, decision, created_at
           ) VALUES (?, ?, ?, ?)`,
        ).run(degradationDecisionId, fidelityReviewId, decision, now);
      }

      const resultKind = evidence.changed ? 'changed' as const : 'no-change' as const;
      const completionLabel = evidence.changed ? '稿件已重新导入' as const : '未发现稿件变化' as const;
      let resultingRevisionId: string | null = null;
      if (evidence.changed) {
        resultingRevisionId = work.resultingRevisionId;
        requireStore(resultingRevisionId !== null, 'REIMPORT_COMPARISON_INVALID', '重新导入结果修订版计划缺失。');
        const previous = one(this.#authority.prepare(
          'SELECT ordinal FROM manuscript_revisions WHERE revision_id = ?',
        ).all(target.checkpoint.revisionId) as SqlRow[], 'REIMPORT_CHECKPOINT_INVALID', '重新导入安全固定点缺失。');
        const ordinal = asNumber(previous.ordinal) + 1;
        const revisionDigest = sha256(canonicalJson({
          schema: 'ai7.manuscript-reimport-revision/1',
          manuscriptId: target.manuscriptId,
          parentRevisionId: target.checkpoint.revisionId,
          sourceVersionId,
          contentDigest: snapshot.contentDigest,
          structureDigest: snapshot.structureDigest,
          comparisonDigest: evidence.comparisonDigest,
          resolutionDigest: evidence.resolutionDigest,
        }));
        this.#authority.prepare(
          `INSERT INTO manuscript_revisions(
             revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
             source_version_id, revision_digest, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(resultingRevisionId, target.manuscriptId, target.branchId, ordinal, `r${ordinal}`,
          target.checkpoint.revisionId, sourceVersionId, revisionDigest, now);
        const createdIdentities = this.#authority.prepare(
          `INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id)
           SELECT block_id, ?, ? FROM temp.reimport_commit_rows
           WHERE work_id = ? AND creates_identity = 1 ORDER BY position`,
        ).run(target.manuscriptId, resultingRevisionId, work.workId);
        requireStore(createdIdentities.changes === asNumber(one(this.#authority.prepare(
          'SELECT count(*) total FROM temp.reimport_commit_rows WHERE work_id = ? AND creates_identity = 1',
        ).all(work.workId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对新结构身份计划。').total),
        'REIMPORT_COMPARISON_INVALID', '新结构身份计划无法完整提交。');
        const insertedVersions = this.#authority.prepare(
          `INSERT INTO manuscript_block_versions(
             revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           )
           SELECT ?, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM temp.reimport_commit_rows WHERE work_id = ? ORDER BY position`,
        ).run(resultingRevisionId, work.workId);
        requireStore(insertedVersions.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入结果修订版块无法完整提交。');
        // ADR 0086 §3: every block of the resulting revision stands at its staged position, and the staged
        // sources name the paragraph of the reimported file it came from.
        const mappedSources = this.#authority.prepare(
          `INSERT INTO manuscript_block_sources(
             revision_id, block_id, source_version_id, source_part, source_paragraph_index,
             box_ordinal, box_paragraph_ordinal, source_paragraph_digest, created_at
           ) SELECT ?, r.block_id, ?, 'body', s.source_paragraph_index, NULL, NULL, r.digest, ?
             FROM temp.reimport_commit_rows r
             JOIN staged_import_block_sources s ON s.draft_id = ? AND s.position = r.position
             WHERE r.work_id = ? ORDER BY r.position`,
        ).run(resultingRevisionId, sourceVersionId, now, input.draftId, work.workId);
        requireStore(mappedSources.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入结果修订版的来源段落对应无法完整提交。');
        this.#authority.prepare(
          `UPDATE manuscript_command_groups SET status = 'superseded'
           WHERE branch_id = ? AND status IN ('applied', 'undone')`,
        ).run(target.branchId);
        this.#authority.prepare('DELETE FROM manuscript_outline WHERE branch_id = ?').run(target.branchId);
        this.#authority.prepare('DELETE FROM working_block_search WHERE branch_id = ?').run(target.branchId);
        this.#authority.prepare('DELETE FROM working_offset_nodes WHERE branch_id = ?').run(target.branchId);
        // Which blocks the rewrite leaves as they were (Issue #533): a point in one stands where it stood.
        const blocksBefore = workingBlockDigests(this.#authority, target.branchId);
        this.#authority.prepare('DELETE FROM working_blocks WHERE branch_id = ?').run(target.branchId);
        const insertedWorking = this.#authority.prepare(
          `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
           SELECT ?, block_id, position, kind, level, text, digest, grapheme_length
           FROM temp.reimport_commit_rows WHERE work_id = ? ORDER BY position`,
        ).run(target.branchId, work.workId);
        requireStore(insertedWorking.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入工作稿块无法完整提交。');
        const insertedOutline = this.#authority.prepare(
          `INSERT INTO manuscript_outline(branch_id, block_id, position, kind, level, text, digest)
           SELECT ?, block_id, position, kind,
                  CASE WHEN kind = 'title' THEN 1 ELSE COALESCE(level, 1) END,
                  text, digest
           FROM temp.reimport_commit_rows
           WHERE work_id = ? AND kind IN ('title', 'heading') ORDER BY position`,
        ).run(target.branchId, work.workId);
        const plannedOutline = asNumber(one(this.#authority.prepare(
          `SELECT count(*) total FROM temp.reimport_commit_rows
           WHERE work_id = ? AND kind IN ('title', 'heading')`,
        ).all(work.workId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对重新导入大纲计划。').total);
        requireStore(insertedOutline.changes === plannedOutline,
          'REIMPORT_COMPARISON_INVALID', '重新导入大纲计划无法完整提交。');
        const insertedSearch = this.#authority.prepare(
          `INSERT INTO working_block_search(branch_id, block_id, text)
           SELECT ?, block_id, text FROM temp.reimport_commit_rows
           WHERE work_id = ? ORDER BY position`,
        ).run(target.branchId, work.workId);
        requireStore(insertedSearch.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入搜索投影无法完整提交。');
        const insertedOffsets = this.#authority.prepare(
          `INSERT INTO working_offset_nodes(branch_id, position, span_graphemes)
           SELECT ?, position, offset_span FROM temp.reimport_commit_rows
           WHERE work_id = ? ORDER BY position`,
        ).run(target.branchId, work.workId);
        requireStore(insertedOffsets.changes === snapshot.blockCount,
          'REIMPORT_COMPARISON_INVALID', '重新导入偏移投影无法完整提交。');
        const stateUpdate = this.#authority.prepare(
          `UPDATE branch_working_state
           SET base_revision_id = ?, working_digest = ?, total_graphemes = ?, last_checkpoint_sequence = journal_sequence,
               history_boundary_sequence = history_sequence
           WHERE manuscript_id = ? AND branch_id = ? AND base_revision_id = ? AND working_digest = ?`,
        ).run(resultingRevisionId, revisionDigest, snapshot.characterCount, target.manuscriptId, target.branchId,
          target.checkpoint.revisionId, target.checkpoint.revisionDigest);
        requireStore(stateUpdate.changes === 1, 'REIMPORT_TARGET_CHANGED', '重新导入提交时主稿件已变化。');
        requireStore(this.#authority.prepare(
          'UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ? AND base_revision_id = ?',
        ).run(resultingRevisionId, target.branchId, target.checkpoint.revisionId).changes === 1,
        'REIMPORT_TARGET_CHANGED', '重新导入提交时分支已变化。');
        // Issue #407: the working state was replaced whole. A mark whose block kept its identity is
        // resolved against the text that block holds now; one whose block was retired stays readable
        // as detached instead of pointing into a block that is no longer there.
        resolveBranchMarksAfterRewrite(this.#authority, target.branchId, blocksBefore);
        // Issue #412 (S63): the marks of every changed row follow the new file to their words, or are set aside and
        // listed — never moved onto words they were not on.
        markOutcomes = followReimportedMarks(this.#authority, target.branchId, this.#reimportMarkRows(comparisonId, work.workId));
      }
      // Issue #412 (S63; MARK-009): the new file's comments and tracked changes become 批注 and 修改建议 by their author
      // on the manuscript in this same transaction — all of them, or no reimport — after the editor's own marks have
      // followed. One that already stands there as it is, exactly on its words — the file's comment still in the file — is
      // not made twice; one that drifted or was set aside no longer shows the file's comment, so the new file's makes it.
      // A point — a pending insertion — is never found by its words, so the rewrite leaves it drifted where it stood: the
      // file's insertion at that same place is that one, set exact again rather than made twice.
      // A 修改建议's words are only where it stands: what it proposes lives in its Proposal Change Item, so a tracked
      // change stands as it is only while it proposes the same words — an insertion as an insertion. One the author
      // rewrote is a new one, made beside the old, which stays the editor's to settle. Each standing mark is at most one
      // file mark: two changes alike at one place are two marks, each set again as itself.
      if (fidelityPlan.importedMarks > 0) {
        const placedAt = this.#authority.prepare('SELECT block_id FROM temp.reimport_commit_rows WHERE work_id = ? AND position = ?');
        const standing = this.#authority.prepare(
          `SELECT em.mark_id, em.anchor_state FROM editorial_marks em
           WHERE em.branch_id = ? AND em.block_id = ? AND em.source_kind = 'imported-author' AND em.source_label = ? AND em.kind = ?
             AND em.pinned_text = ? AND em.body = ? AND em.from_grapheme = ? AND em.to_grapheme = ?
             AND em.status IN ('open', 'resolved', 'applied')
             AND (em.anchor_state = 'exact' OR (em.anchor_state = 'drifted' AND em.pinned_text = ''))
             AND (em.kind <> 'change-suggestion' OR EXISTS (
               SELECT 1 FROM proposal_change_items i
               WHERE i.mark_id = em.mark_id AND i.proposed_text = ? AND (em.pinned_text <> '' OR i.change_type = 'insert')))
           ORDER BY em.rowid`,
        );
        const answered = new Set<string>();
        const followedAt = asNumber(one(
          this.#authority.prepare('SELECT journal_sequence FROM branch_working_state WHERE branch_id = ?').all(target.branchId) as SqlRow[],
          'REIMPORT_TARGET_CHANGED', '重新导入提交时分支已变化。',
        ).journal_sequence);
        const repin = this.#authority.prepare(
          "UPDATE editorial_marks SET anchor_state = 'exact', followed_journal_sequence = ? WHERE mark_id = ? AND anchor_state = 'drifted'",
        );
        let alreadyStanding = 0;
        const created = this.#importedMarkCall(() => createImportedMarks(this.#authority, this.#editorialMarks, input.draftId, {
          manuscriptId: target.manuscriptId,
          branchId: target.branchId,
          blockIdOf: (position) => asString(one(placedAt.all(work.workId, position) as SqlRow[],
            'IMPORT_MARK_ANCHOR_FAILED', '文件中的批注或修订无法准确落在稿件文字上，本次重新导入没有提交。').block_id),
          alreadyStanding: (mark, blockId) => {
            const found = (standing.all(target.branchId, blockId, mark.authorLabel, mark.kind, mark.pinnedText, mark.body,
              mark.fromGrapheme, mark.toGrapheme, mark.proposedText ?? '') as SqlRow[])
              .find((row) => !answered.has(asString(row.mark_id)));
            if (found === undefined) return false;
            const markId = asString(found.mark_id);
            answered.add(markId);
            if (asString(found.anchor_state) === 'drifted') repin.run(followedAt, markId);
            alreadyStanding += 1;
            return true;
          },
        }));
        requireStore(created + alreadyStanding === fidelityPlan.importedMarks, 'IMPORT_POSTCONDITION_FAILED',
          '重新导入的批注与修改建议与保真审阅的数量不一致。');
      }

      const recordDigest = sha256(canonicalJson({
        schema: MANUSCRIPT_REIMPORT_RECORD_SCHEMA,
        reimportRecordId,
        commitId: input.commitId,
        bookId: target.bookId,
        manuscriptId: target.manuscriptId,
        branchId: target.branchId,
        sourceVersionId,
        provenanceId,
        previousRevisionId: target.checkpoint.revisionId,
        resultingRevisionId,
        resultKind,
        resultLabel: completionLabel,
        lineageStatus: target.lineage.status,
        lineageSourceVersionId: target.lineage.sourceVersionId,
        comparisonKind: target.lineage.comparisonKind,
        comparisonDigest: evidence.comparisonDigest,
        resolutionDigest: evidence.resolutionDigest,
        fidelityReviewId,
        degradationDecisionId,
        importedAt: now,
      }));
      this.#authority.prepare(
        `INSERT INTO manuscript_reimport_records(
           reimport_record_id, comparison_id, commit_id, book_id, manuscript_id, branch_id, source_version_id,
           provenance_id, previous_revision_id, resulting_revision_id, result_kind, result_label,
           lineage_status, lineage_source_version_id, comparison_kind, comparison_digest,
           resolution_digest, fidelity_review_id, degradation_decision_id, record_digest, imported_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(reimportRecordId, comparisonId,
        input.commitId, target.bookId, target.manuscriptId, target.branchId,
        sourceVersionId, provenanceId, target.checkpoint.revisionId, resultingRevisionId, resultKind,
        completionLabel, target.lineage.status, target.lineage.sourceVersionId, target.lineage.comparisonKind,
        evidence.comparisonDigest, evidence.resolutionDigest, fidelityReviewId, degradationDecisionId, recordDigest, now);
      const insertOutcome = this.#authority.prepare(
        `INSERT INTO manuscript_reimport_mark_outcomes(
           reimport_record_id, mark_id, group_ordinal, outcome, kind, words, from_position, to_block_id, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const outcome of markOutcomes) {
        insertOutcome.run(reimportRecordId, outcome.markId, outcome.ordinal, outcome.outcome, outcome.kind, outcome.words,
          outcome.fromPosition, outcome.toBlockId, now);
      }

      committedResult = {
        commitId: input.commitId,
        importedAt: now,
        completionLabel,
        resultKind,
        bookId: target.bookId,
        manuscriptId: target.manuscriptId,
        branchId: target.branchId,
        previousRevisionId: target.checkpoint.revisionId,
        resultingRevisionId,
        reimportRecordId,
        sourceVersionId,
        sourceVersionDisposition: target.sourceVersionDisposition,
        provenanceId,
        lineageStatus: target.lineage.status,
        lineageLabel: target.lineage.status === 'verified' ? '来源关系已确认' : '来源关系未确认',
        comparisonKind: target.lineage.comparisonKind,
        comparisonDigest: evidence.comparisonDigest,
        resolutionDigest: evidence.resolutionDigest,
        source: this.#stagedProjection(snapshot).source,
      };
      this.#authority.prepare(
        `INSERT INTO import_commits(
           commit_id, draft_id, request_fingerprint, expected_draft_version, review_digest,
           operation_kind, result_json, committed_at
         ) VALUES (?, ?, ?, ?, ?, 'manuscript-reimport', ?, ?)`,
      ).run(input.commitId, input.draftId, requestFingerprint, input.expectedDraftVersion,
        input.reviewDigest, canonicalJson(committedResult), now);
      requireStore(this.#authority.prepare(
        `UPDATE import_drafts SET state = 'committed', committed_commit_id = ?, committed_at = ?
         WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ? AND review_digest = ?`,
      ).run(input.commitId, now, input.draftId, input.expectedDraftVersion, input.reviewDigest).changes === 1,
      'DRAFT_VERSION_CHANGED', '重新导入草稿在提交时已变化。');
      requireStore(this.#authority.prepare(
        `UPDATE import_commit_attempts
         SET state = 'committed', committed_at = ?, uncertain_at = NULL, uncertainty_code = NULL
         WHERE attempt_id = ? AND draft_id = ? AND state = 'prepared'
           AND operation_kind = 'manuscript-reimport' AND request_fingerprint = ?
           AND expected_draft_version = ? AND review_digest = ?`,
      ).run(now, input.commitId, input.draftId, requestFingerprint,
        input.expectedDraftVersion, input.reviewDigest).changes === 1,
      'COMMIT_ATTEMPT_CHANGED', '稿件重新导入持久提交尝试状态已变化。');
      const after = this.#reimportAuthorityCounts(target.bookId);
      requireStore(
        after.manuscripts === before.manuscripts &&
          after.revisions === before.revisions + (evidence.changed ? 1 : 0) &&
          after.sourceVersions === before.sourceVersions + (target.sourceVersionDisposition === 'created' ? 1 : 0) &&
          after.provenance === before.provenance + 1 && after.reimports === before.reimports + 1,
        'IMPORT_POSTCONDITION_FAILED',
        '稿件重新导入的原子记录图或无变化边界不成立。',
      );
      this.#authority.prepare('DELETE FROM staged_import_snapshots WHERE draft_id = ?').run(input.draftId);
    });
    if (result !== undefined) return result;
    requireStore(committedResult !== undefined, 'COMMIT_FAILED', '稿件重新导入提交未产生结果。');
    const reimportReceipt = this.#reimportRecordPresentations(committedResult.bookId, [committedResult.reimportRecordId])
      .find((record) => record.kind === 'manuscript-reimport-record');
    requireStore(reimportReceipt?.kind === 'manuscript-reimport-record',
      'IMPORT_POSTCONDITION_FAILED', '稿件重新导入完成凭据不完整。');
    const overview = this.getBookOverview(committedResult.bookId);
    return {
      ...committedResult,
      receipt: reimportReceipt,
      overview,
      window: this.#reimportLandingWindow(overview, committedResult.manuscriptId, committedResult.branchId),
    };
  }

  /**
   * Where a reimport lands (V2-UX-IMP-056; Issue #412): the editor's remembered place as the reimport mapped it —
   * its paragraph where the identity carried, else the nearest one — or the start when none is remembered.
   */
  #reimportLandingWindow(overview: BookWorkOverviewProjection, manuscriptId: string, branchId: string): ManuscriptWindowProjection {
    const entry = overview.manuscriptAnchor?.entry ?? null;
    return this.getManuscriptWindowAt(manuscriptId, branchId,
      entry === null ? { kind: 'start' } : { kind: 'block', blockId: entry.blockId });
  }

  /**
   * Revision r1's blocks when the review merged its text boxes (ADR 0086 §2): the staged body blocks and
   * every staged text-box paragraph in document order — which puts each box's paragraphs right after the
   * paragraph that anchors it — with positions and offsets counted afresh, and the source of every block
   * recorded beside it. A body block keeps its staged identity; a merged paragraph takes one derived from
   * its draft, its box and its place in the box. Runs in the commit's transaction.
   */
  #insertMergedImportBlocks(
    draftId: string,
    manuscriptId: string,
    revisionId: string,
    branchId: string,
    sourceVersionId: string,
    merged: ReadonlyArray<StagedTextBoxParagraph>,
    now: string,
  ): void {
    const insertBlock = this.#authority.prepare(
      'INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)',
    );
    const insertVersion = this.#authority.prepare(
      `INSERT INTO manuscript_block_versions(
         revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertWorking = this.#authority.prepare(
      `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSource = this.#authority.prepare(
      `INSERT INTO manuscript_block_sources(
         revision_id, block_id, source_version_id, source_part, source_paragraph_index,
         box_ordinal, box_paragraph_ordinal, source_paragraph_digest, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let position = 0;
    let offset = 0;
    const write = (block: {
      blockId: string; kind: ManuscriptBlockProjection['kind']; level: number | null; text: string; digest: string;
      graphemeLength: number; sourceParagraphIndex: number; box: { ordinal: number; paragraph: number } | null;
    }): void => {
      position += 1;
      insertBlock.run(block.blockId, manuscriptId, revisionId);
      insertVersion.run(revisionId, block.blockId, position, block.kind, block.level, block.text, block.digest, offset, block.graphemeLength);
      insertWorking.run(branchId, block.blockId, position, block.kind, block.level, block.text, block.digest, block.graphemeLength);
      insertSource.run(
        revisionId, block.blockId, sourceVersionId, block.box === null ? 'body' : 'text-box', block.sourceParagraphIndex,
        block.box?.ordinal ?? null, block.box?.paragraph ?? null, block.digest, now,
      );
      offset += block.graphemeLength;
    };
    const writeBoxParagraphsBefore = (limit: number): void => {
      while (next < merged.length && merged[next]!.sourceParagraphIndex < limit) {
        const paragraph = merged[next]!;
        write({
          blockId: `blk_${sha256(`${draftId}\u0000text-box\u0000${paragraph.boxOrdinal}\u0000${paragraph.boxParagraphOrdinal}\u0000${paragraph.digest}`).slice(0, 24)}`,
          kind: paragraph.kind,
          level: paragraph.level,
          text: paragraph.text,
          digest: paragraph.digest,
          graphemeLength: paragraph.graphemeLength,
          sourceParagraphIndex: paragraph.sourceParagraphIndex,
          box: { ordinal: paragraph.boxOrdinal, paragraph: paragraph.boxParagraphOrdinal },
        });
        next += 1;
      }
    };
    let next = 0;
    let cursor = 0;
    while (true) {
      const rows = this.#authority.prepare(
        `SELECT b.staged_block_id, b.position, b.kind, b.level, b.text, b.digest, b.grapheme_length, s.source_paragraph_index
         FROM staged_import_blocks b
         JOIN staged_import_block_sources s ON s.draft_id = b.draft_id AND s.position = b.position
         WHERE b.draft_id = ? AND b.position > ? ORDER BY b.position LIMIT ?`,
      ).all(draftId, cursor, INGEST_BATCH_SIZE) as SqlRow[];
      if (rows.length === 0) break;
      for (const row of rows) {
        cursor = asNumber(row.position);
        const sourceParagraphIndex = asNumber(row.source_paragraph_index);
        writeBoxParagraphsBefore(sourceParagraphIndex);
        write({
          blockId: asString(row.staged_block_id),
          kind: asString(row.kind) as ManuscriptBlockProjection['kind'],
          level: row.level === null ? null : asNumber(row.level),
          text: asString(row.text),
          digest: asString(row.digest),
          graphemeLength: asNumber(row.grapheme_length),
          sourceParagraphIndex,
          box: null,
        });
      }
    }
    writeBoxParagraphsBefore(Number.POSITIVE_INFINITY);
  }

  #reimportAuthorityCounts(bookId: string): {
    manuscripts: number;
    revisions: number;
    sourceVersions: number;
    provenance: number;
    reimports: number;
  } {
    const row = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM manuscripts WHERE book_id = ?) manuscripts,
         (SELECT count(*) FROM manuscript_revisions mr JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id
          WHERE m.book_id = ?) revisions,
         (SELECT count(*) FROM source_versions WHERE book_id = ?) source_versions,
         (SELECT count(*) FROM source_provenance sp JOIN source_versions sv ON sv.source_version_id = sp.source_version_id
          WHERE sv.book_id = ?) provenance,
         (SELECT count(*) FROM manuscript_reimport_records WHERE book_id = ?) reimports`,
    ).all(bookId, bookId, bookId, bookId, bookId) as SqlRow[],
    'STORE_CORRUPT', '无法核对稿件重新导入权威记录。');
    return {
      manuscripts: asNumber(row.manuscripts),
      revisions: asNumber(row.revisions),
      sourceVersions: asNumber(row.source_versions),
      provenance: asNumber(row.provenance),
      reimports: asNumber(row.reimports),
    };
  }

  #sourceImportAuthorityCounts(bookId: string): {
    manuscripts: number;
    revisions: number;
    workflows: number;
    fidelityReviews: number;
    manuscriptImports: number;
    sourceVersions: number;
    provenance: number;
    sourceImports: number;
  } {
    const row = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM manuscripts WHERE book_id = ?) manuscripts,
         (SELECT count(*) FROM manuscript_revisions mr
            JOIN manuscripts m ON m.manuscript_id = mr.manuscript_id WHERE m.book_id = ?) revisions,
         (SELECT count(*) FROM workflow_instances WHERE book_id = ?) workflows,
         (SELECT count(*) FROM import_fidelity_reviews WHERE book_id = ?) fidelity_reviews,
         (SELECT count(*) FROM manuscript_import_records WHERE book_id = ?) manuscript_imports,
         (SELECT count(*) FROM source_versions WHERE book_id = ?) source_versions,
         (SELECT count(*) FROM source_provenance sp
            JOIN source_versions sv ON sv.source_version_id = sp.source_version_id WHERE sv.book_id = ?) provenance,
         (SELECT count(*) FROM source_import_records WHERE book_id = ?) source_imports`,
    ).all(bookId, bookId, bookId, bookId, bookId, bookId, bookId, bookId) as SqlRow[],
    'STORE_CORRUPT', '无法核对来源导入权威记录。');
    return {
      manuscripts: asNumber(row.manuscripts),
      revisions: asNumber(row.revisions),
      workflows: asNumber(row.workflows),
      fidelityReviews: asNumber(row.fidelity_reviews),
      manuscriptImports: asNumber(row.manuscript_imports),
      sourceVersions: asNumber(row.source_versions),
      provenance: asNumber(row.provenance),
      sourceImports: asNumber(row.source_imports),
    };
  }

  getManuscriptWindow(manuscriptId: string, branchId: string, cursor: string | null): ManuscriptWindowProjection {
    return this.#boundedCall(() =>
      this.#bounded.getWindow(
        manuscriptId,
        branchId,
        cursor === null ? { kind: 'start' } : { kind: 'cursor', cursor },
      ),
    );
  }

  /**
   * Remember where the editor is in this Manuscript, against the Revision the branch works on now.
   * The position is durable editor state, not a record of the work: it is written on the authority
   * connection and rewritten in place for the same Book and Revision.
   */
  recordManuscriptEntryPosition(manuscriptId: string, branchId: string, blockId: string, grapheme: number): void {
    this.#boundedCall(() => this.#boundedAuthority.recordManuscriptEntryPosition(
      manuscriptId,
      branchId,
      blockId,
      this.#addressableGrapheme(branchId, blockId, grapheme),
      new Date().toISOString(),
    ));
  }

  /**
   * A caret resting after a block's last grapheme is a real place to leave from, but a block addresses
   * `[0, length)`, so the last addressable offset answers for it and the editor is remembered at the
   * end of that block rather than not remembered at all. A block the working state does not hold is
   * left untouched for the bounded store to refuse, which is where `稿件位置不存在` belongs.
   */
  #addressableGrapheme(branchId: string, blockId: string, grapheme: number): number {
    if (!Number.isSafeInteger(grapheme) || grapheme < 0) return grapheme;
    const block = this.#authority.prepare(
      'SELECT grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?',
    ).get(branchId, blockId) as SqlRow | undefined;
    return block === undefined ? grapheme : Math.min(grapheme, Math.max(0, asNumber(block.grapheme_length) - 1));
  }

  /** Where the editor last was, resolved against the working state now, or `null` if never recorded. */
  readManuscriptEntryPosition(manuscriptId: string, branchId: string): ManuscriptEntryPositionProjection | null {
    return this.#boundedCall(() => this.#bounded.readManuscriptEntryPosition(manuscriptId, branchId));
  }

  flushJournalEdit(input: JournalEditInput): JournalAcknowledgement {
    return this.#boundedCall(() => this.#bounded.flushJournalEdit(input, this.#lifetimeId));
  }

  /**
   * Editorial Marks (Issue #407). They are records of the work, written on the authority connection;
   * none of these changes a character of the manuscript, and a Proposal Decision is recorded apart
   * from the item it decides.
   */
  createEditorialMark(input: CreateEditorialMarkInput): EditorialMarkCommandProjection {
    return this.#markCall(() => this.#editorialMarks.create(input));
  }

  getEditorialMarkCard(manuscriptId: string, branchId: string, markId: string): EditorialMarkCardProjection {
    return this.#markCall(() => this.#editorialMarks.card(manuscriptId, branchId, markId));
  }

  updateEditorialMark(input: UpdateEditorialMarkInput): EditorialMarkCommandProjection {
    return this.#markCall(() => this.#editorialMarks.update(input));
  }

  recordChangeSuggestionDecision(input: RecordChangeSuggestionDecisionInput): EditorialMarkCommandProjection {
    return this.#markCall(() => this.#editorialMarks.decide(input));
  }

  recordProposalDecisionReason(input: RecordProposalDecisionReasonInput): EditorialMarkCommandProjection {
    return this.#markCall(() => this.#editorialMarks.recordDecisionReason(input));
  }

  /** `不说明` or `改原因` after a Proposal Decision (Issue #61, S26a). */
  recordProposalDecisionFeedback(input: RecordProposalDecisionFeedbackInput): EditorialMarkCommandProjection {
    return this.#markCall(() => this.#editorialMarks.recordDecisionFeedback(input));
  }

  /**
   * AI7 Apply for Change Suggestions (Issue #408): the one path by which a suggestion's text reaches
   * the manuscript, each commit written with its Effect Receipt in one transaction on the authority
   * connection.
   */
  applyChangeSuggestion(input: ApplyChangeSuggestionInput): ManuscriptApplyCommandProjection {
    return this.#markCall(() => this.#boundedCall(() => this.#manuscriptApply.apply(input)));
  }

  applyChangeSuggestionBatch(input: ApplyChangeSuggestionBatchInput): ManuscriptApplyCommandProjection {
    return this.#markCall(() => this.#boundedCall(() => this.#manuscriptApply.applyBatch(input)));
  }

  reverseAppliedChangeSuggestion(input: ReverseAppliedChangeSuggestionInput): ManuscriptApplyCommandProjection {
    return this.#markCall(() => this.#boundedCall(() => this.#manuscriptApply.reverse(input)));
  }

  getManuscriptApplyOutcome(manuscriptId: string, branchId: string, clientEffectId: string): ManuscriptApplyOutcomeProjection {
    return this.#markCall(() => this.#manuscriptApply.outcome(manuscriptId, branchId, clientEffectId));
  }

  /**
   * The position rail's places (Issue #409). The ranges the analysis left unread come from the latest
   * Result Set Revision's gaps; a Book never analysed has none to show, which is `null`, not empty.
   */
  getManuscriptRail(manuscriptId: string, branchId: string): ManuscriptRailProjection {
    const bookId = this.#boundedCall(() => this.#bounded.bookIdOf(manuscriptId, branchId));
    let unread: Array<{ blockIds: ReadonlyArray<string>; reason: string }> | null = null;
    // The Book's analysis reads its Manuscript: a Production Document's rail has no unread ranges to show (Issue #415).
    const primary = this.#authority.prepare("SELECT 1 FROM manuscripts WHERE manuscript_id = ? AND role = 'primary'").get(manuscriptId) !== undefined;
    try {
      const revision = primary ? this.#baselineAnalysis.inspect(bookId, undefined, null).resultSetRevision : null;
      if (revision !== null) unread = revision.gaps.map((gap) => ({ blockIds: gap.blockIds, reason: gap.reason }));
    } catch {
      // A Book whose analysis cannot be read has no unread ranges the rail can stand behind.
      unread = null;
    }
    return this.#boundedCall(() => this.#bounded.getRail(manuscriptId, branchId, unread));
  }

  /** A mark AI7 or an import produces; the manuscript surface is never its caller. */
  createProducedEditorialMark(input: ProducedEditorialMarkInput): string {
    return this.#markCall(() => this.#editorialMarks.createProduced(input));
  }

  listPriorWork(): ReadonlyArray<PriorWorkItemProjection> {
    return this.#boundedCall(() => this.#bounded.listPriorWork());
  }

  resolveBookWorkbenchRoute(route: BookWorkbenchRoute): ResolvedBookWorkbenchRoute {
    return this.#boundedCall(() => this.#bounded.resolveBookWorkbenchRoute(route));
  }

  getHistoricalRevision(revisionId: string, cursor: string | null): HistoricalRevisionProjection {
    return this.#boundedCall(() => this.#bounded.getHistoricalRevision(revisionId, cursor));
  }

  getModelServiceConnection(): ModelServiceConnectionProjection | null {
    this.#assertAvailable();
    const row = this.#authority.prepare(
      `SELECT connection_id, role_id, connection_name, provider_id, model_id,
              adapter_revision, configuration_revision, approved_fallback_chain,
              credential_slot, credential_reference, credential_operation_state,
              created_at, updated_at, credential_updated_at
       FROM model_service_connections
       WHERE connection_id = 'main-editorial-deepseek-v4-pro'`,
    ).get() as SqlRow | undefined;
    if (row === undefined) return null;
    const state = asString(row.credential_operation_state);
    requireStore(
      state === 'ready' || state === 'missing' || state === 'needs-attention',
      'STORE_CORRUPT',
      '模型服务凭据状态无效。',
    );
    const credentialReference = asString(row.credential_reference);
    requireStore(
      UUID_PATTERN.test(credentialReference),
      'STORE_CORRUPT',
      '模型服务凭据引用无效。',
    );
    return {
      connectionId: 'main-editorial-deepseek-v4-pro',
      roleId: 'main-editorial',
      connectionName: asString(row.connection_name),
      binding: {
        providerId: 'deepseek-open-platform',
        providerLabel: 'DeepSeek 开放平台（官方）',
        modelId: 'deepseek-v4-pro',
        modelLabel: 'DeepSeek V4 Pro High',
        adapterRevision: 1,
        configurationRevision: 1,
        approvedFallbackChain: [],
        credentialSlot: 'deepseek-api-key',
      },
      credentialReference,
      credentialOperationState: state,
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
      credentialUpdatedAt: asString(row.credential_updated_at),
    };
  }

  saveModelServiceConnection(
    connectionNameInput: string,
    credentialReference: string,
    credentialOperationState: 'ready' | 'needs-attention',
  ): ModelServiceConnectionProjection {
    this.#assertAvailable();
    const connectionName = connectionNameInput.trim();
    requireStore(
      connectionName.length > 0 && connectionName.length <= 80 && connectionName.isWellFormed(),
      'MODEL_SERVICE_CONNECTION_INVALID',
      '连接名称必须为 1 至 80 个有效字符。',
    );
    requireStore(UUID_PATTERN.test(credentialReference), 'MODEL_SERVICE_CONNECTION_INVALID', '凭据引用无效。');
    const current = this.getModelServiceConnection();
    requireStore(
      current === null || current.credentialReference === credentialReference,
      'MODEL_SERVICE_CONNECTION_CONFLICT',
      '已存连接的凭据引用不可替换。',
    );
    const now = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      if (current === null) {
        this.#authority.prepare(
          `INSERT INTO model_service_connections(
             connection_id, role_id, connection_name, provider_id, model_id,
             adapter_revision, configuration_revision, approved_fallback_chain,
             credential_slot, credential_reference, credential_operation_state,
             created_at, updated_at, credential_updated_at
           ) VALUES (
             'main-editorial-deepseek-v4-pro', 'main-editorial', ?, 'deepseek-open-platform', 'deepseek-v4-pro',
             1, 1, '[]', 'deepseek-api-key', ?, ?, ?, ?, ?
           )`,
        ).run(connectionName, credentialReference, credentialOperationState, now, now, now);
      } else {
        requireStore(
          this.#authority.prepare(
            `UPDATE model_service_connections
             SET connection_name = ?, credential_operation_state = ?, updated_at = ?, credential_updated_at = ?
             WHERE connection_id = 'main-editorial-deepseek-v4-pro' AND credential_reference = ?`,
          ).run(connectionName, credentialOperationState, now, now, credentialReference).changes === 1,
          'MODEL_SERVICE_CONNECTION_CONFLICT',
          '模型服务连接状态已变化。',
        );
      }
    });
    return this.getModelServiceConnection()!;
  }

  setModelServiceCredentialState(
    credentialReference: string,
    credentialOperationState: ModelCredentialOperationState,
  ): ModelServiceConnectionProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(credentialReference), 'MODEL_SERVICE_CONNECTION_INVALID', '凭据引用无效。');
    const now = new Date().toISOString();
    this.#transaction(this.#authority, () => {
      requireStore(
        this.#authority.prepare(
          `UPDATE model_service_connections
           SET credential_operation_state = ?, updated_at = ?, credential_updated_at = ?
           WHERE connection_id = 'main-editorial-deepseek-v4-pro' AND credential_reference = ?`,
        ).run(credentialOperationState, now, now, credentialReference).changes === 1,
        'MODEL_SERVICE_CONNECTION_CONFLICT',
        '模型服务连接状态已变化。',
      );
    });
    return this.getModelServiceConnection()!;
  }

  getManuscriptWindowAt(
    manuscriptId: string,
    branchId: string,
    target: ManuscriptWindowTarget,
  ): ManuscriptWindowProjection {
    return this.#boundedCall(() => this.#bounded.getWindow(manuscriptId, branchId, target));
  }

  getOutline(manuscriptId: string, branchId: string, cursor: string | null): OutlineProjection {
    return this.#boundedCall(() => this.#bounded.getOutline(manuscriptId, branchId, cursor));
  }

  createSearch(manuscriptId: string, branchId: string, query: string): SearchSummaryProjection & {
    scannedPosition: number;
    totalBlocks: number;
  } {
    return this.#boundedCall(() => this.#bounded.createSearch(manuscriptId, branchId, query));
  }

  advanceSearch(searchId: string): {
    done: boolean;
    summary: SearchSummaryProjection;
    scannedPosition: number;
    totalBlocks: number;
  } {
    return this.#boundedCall(() => this.#bounded.advanceSearch(searchId));
  }

  cancelSearch(searchId: string): void {
    this.#boundedCall(() => this.#bounded.cancelSearch(searchId));
  }

  getSearchResults(searchId: string, cursor: string | null): SearchResultsProjection {
    return this.#boundedCall(() => this.#bounded.getSearchResults(searchId, cursor));
  }

  prepareReplacement(
    searchId: string,
    replacement: string,
    excludedMatchIds: ReadonlyArray<string>,
  ): ReplacementPreviewProjection {
    return this.#boundedCall(() => this.#bounded.prepareReplacement(searchId, replacement, excludedMatchIds));
  }

  freezeReplacement(
    previewId: string,
    excludedMatchIds: ReadonlyArray<string>,
  ): ReplacementPreviewProjection {
    return this.#boundedCall(() => this.#bounded.freezeReplacement(previewId, excludedMatchIds));
  }

  advanceReplacementWork(previewId: string): {
    phase: 'preparing' | 'validating';
    done: boolean;
    completed: number;
    total: number;
    preview: ReplacementPreviewProjection | null;
  } {
    return this.#boundedCall(() => this.#bounded.advanceReplacementWork(previewId));
  }

  commitReplacement(previewId: string): ReplacementCommitProjection {
    return this.#boundedCall(() => this.#bounded.commitReplacement(previewId, this.#lifetimeId));
  }

  cancelReplacement(previewId: string): boolean {
    return this.#boundedCall(() => this.#bounded.cancelReplacement(previewId));
  }

  dismissReplacementPreview(previewId: string): ReplacementDismissalProjection {
    const cancelled = this.cancelReplacement(previewId);
    requireStore(cancelled, 'REPLACEMENT_STATE_CHANGED', '替换预览已提交、失败或不再可取消。');
    return { previewId, state: 'cancelled' };
  }

  /**
   * 保存里程碑版本. The purpose is one of the four frozen purposes or the editor's own words (Issue
   * #414); either way it is stored as words — a frozen purpose as its own label — so the bounded store
   * keeps its one purpose rule and every milestone reads its kind back from what it holds.
   */
  async saveMilestone(
    manuscriptId: string,
    branchId: string,
    label: string,
    purposeKind: MilestonePurposeKind,
    purpose: string | null,
    note: string,
  ): Promise<MilestoneProjection> {
    this.#assertAvailable();
    const resolved = resolveMilestonePurpose(purposeKind, purpose);
    requireStore(resolved !== null, 'MILESTONE_INVALID', '请选择里程碑用途，或自行输入 1–120 个字符。');
    let result: MilestoneProjection | undefined;
    await this.#withRecoveryObjectLifecycle(async () => {
      const plan = this.#boundedCall(() =>
        this.#boundedAuthority.prepareMilestoneRecoverySnapshot(manuscriptId, branchId, label, resolved.purpose, note));
      const object = await this.#recoveryObjects.form(
        plan,
        (afterPosition) => this.#boundedCall(() =>
          this.#boundedAuthority.getRecoverySnapshotBlocks(plan, afterPosition)),
      );
      try {
        result = this.#boundedCall(() => this.#boundedAuthority.saveMilestone(plan, object));
      } catch (error) {
        const referenced = this.#boundedCall(() =>
          this.#boundedAuthority.isRecoveryObjectReferenced(object.objectRelativeKey));
        await this.#recoveryObjects.removeUnreferenced(object, referenced);
        throw error;
      }
    });
    requireStore(result !== undefined, 'MILESTONE_INVALID', '里程碑与恢复快照未产生结果。');
    return result;
  }

  // ---- ⑥ 交付物 · 发稿 (Issue #414, plan slice S65) -------------------------------------------------

  /** The 交付物 of one Book: its Manuscript's milestones, its Publication Versions, and what followed them. */
  inspectDeliverables(bookId: string): DeliverablesProjection {
    return this.#publicationCall(() => this.#withActuals(this.#publicationVersions.deliverables(bookId)));
  }

  /** 交付物's 录入定价与首印 line with what was entered for its 发稿版本 (Issue #430, S82). */
  #withActuals(deliverables: DeliverablesProjection): DeliverablesProjection {
    const prompt = deliverables.publication.actualsPrompt;
    if (prompt === null) return deliverables;
    const latest = this.#calibrationCall(() => this.#evaluationCalibration.actuals(deliverables.bookId).at(-1) ?? null);
    if (latest === null || latest.publicationVersionId !== prompt.publicationVersionId) return deliverables;
    return {
      ...deliverables,
      publication: {
        ...deliverables.publication,
        actualsPrompt: {
          ...prompt,
          stateLabel: PUBLICATION_ACTUALS_RECORDED_STATE,
          actuals: { priceFen: latest.priceFen, firstPrint: latest.firstPrint, publicationOrdinal: latest.publicationOrdinal, recordedAt: latest.recordedAt },
        },
      },
    };
  }

  /**
   * 设置 › 评估校准与预测 (Issue #430, plan slice S82; EVAL-010, EVAL-011, EVAL-014): calibration's progress and switch, the
   * prediction switch and the published Books it waits on, and every Book with a 发稿版本 with its 定价与首印. A read.
   */
  inspectEvaluationCalibration(): EvaluationCalibrationProjection {
    return this.#calibrationCall(() => this.#evaluationCalibrationProjection());
  }

  /**
   * 录入定价与首印 for a Book's current 发稿版本 (EVAL-010) — the one the page listed: a 发稿版本 designated since refuses the
   * save (Issue #430 review), so an open form never puts its numbers on a version the editor did not see.
   */
  recordPublicationActuals(input: RecordPublicationActualsInput): EvaluationCalibrationProjection {
    return this.#calibrationCall(() => {
      requireStore(UUID_PATTERN.test(input.bookId), 'BOOK_INVALID', '图书标识无效。');
      this.#transaction(this.#authority, () => {
        one(this.#authority.prepare('SELECT 1 FROM books WHERE book_id = ?').all(input.bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。');
        const current = this.#publicationCall(() => this.#publicationVersions.current(input.bookId));
        requireStore(current !== null, 'PUBLICATION_REQUIRED', '这本书还没有发稿版本；设为发稿版本后才能录入定价与首印。');
        requireStore(current.projection.publicationVersionId === input.publicationVersionId, 'ACTUALS_MOVED',
          '这本书刚设了新的发稿版本；请看过现在的发稿版本再录入。');
        this.#evaluationCalibration.recordActuals({
          bookId: input.bookId,
          publicationVersionId: current.projection.publicationVersionId,
          publicationOrdinal: current.projection.ordinal,
          expectedEntries: input.expectedEntries,
          priceFen: input.priceFen,
          firstPrint: input.firstPrint,
        });
      });
      return this.#evaluationCalibrationProjection();
    });
  }

  /** The house's calibration and prediction switches (EVAL-010, EVAL-011). */
  setEvaluationPreferences(input: SetEvaluationPreferencesInput): EvaluationCalibrationProjection {
    return this.#calibrationCall(() => {
      this.#transaction(this.#authority, () => this.#evaluationCalibration.setPreferences(input));
      return this.#evaluationCalibrationProjection();
    });
  }

  #evaluationCalibrationProjection(): EvaluationCalibrationProjection {
    const preferences = this.#evaluationCalibration.preferences();
    const booksWithActuals = this.#evaluationCalibration.booksWithActuals();
    // AI7's 初评 arrives with S81b (Issue #429): until then the editor has no AI7 score to adjust, so none is counted.
    const adjustments = 0;
    const books: EvaluationCalibrationBookProjection[] = [];
    for (const row of this.#authority.prepare('SELECT book_id, title FROM books ORDER BY title, book_id').all() as SqlRow[]) {
      const bookId = asString(row.book_id);
      const current = this.#publicationCall(() => this.#publicationVersions.current(bookId));
      if (current === null) continue;
      const chain = this.#evaluationCalibration.actuals(bookId);
      const latest = chain.at(-1) ?? null;
      books.push({
        bookId,
        title: asString(row.title),
        publicationVersionId: current.projection.publicationVersionId,
        publicationOrdinal: current.projection.ordinal,
        designatedAt: current.projection.createdAt,
        actuals: latest === null ? null : {
          priceFen: latest.priceFen,
          firstPrint: latest.firstPrint,
          publicationOrdinal: latest.publicationOrdinal,
          recordedAt: latest.recordedAt,
          current: latest.publicationVersionId === current.projection.publicationVersionId,
        },
        entries: chain.length,
      });
    }
    return {
      calibration: {
        adjustments,
        initialScoresConnected: false,
        threshold: CALIBRATION_MIN_ADJUSTMENTS,
        enabled: preferences.calibrationEnabled,
        active: calibrationActive(adjustments, preferences.calibrationEnabled),
      },
      prediction: {
        booksWithActuals,
        threshold: PREDICTION_MIN_BOOKS_WITH_ACTUALS,
        enabled: preferences.predictionEnabled,
        available: predictionAvailable(booksWithActuals),
      },
      preferenceEntries: preferences.entries,
      books,
    };
  }

  #calibrationCall<T>(operation: () => T): T {
    this.#assertAvailable();
    try {
      return operation();
    } catch (error) {
      if (error instanceof EvaluationCalibrationError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  // ---- 书系 › 成员与共享范围 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012) --------------------------------------

  /** 书系: one page of the house's Series, by name, with how many Books each holds now (Issue #63 review). A read. */
  inspectSeriesList(after: SeriesListCursor | null = null): SeriesListProjection {
    return this.#seriesCall(() => {
      requireStore(after === null || (UUID_PATTERN.test(after.seriesId) && typeof after.title === 'string' && after.title.length >= 1 &&
        after.title.length <= 2 * MAX_SERIES_TITLE_CHARACTERS), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
      const counts = this.#series.memberCounts();
      const rows = this.#series.listAfter(after, MAX_SERIES_LIST_PAGE + 1).map((entry) => ({ ...entry, memberCount: counts.get(entry.seriesId) ?? 0 }));
      const { page, more } = weighedPage(rows, MAX_SERIES_LIST_PAGE);
      const last = page.at(-1);
      return { series: page, nextCursor: more && last !== undefined ? { title: last.title, seriesId: last.seriesId } : null };
    });
  }

  /** 新建书系: a name the house has not used, and an optional 说明. It holds no Book until one is added; the answer is it alone. */
  createSeries(input: CreateSeriesInput): SeriesCreationProjection {
    return this.#seriesCall(() => {
      const created = this.#transaction(this.#authority, () => this.#series.create(input));
      return { seriesId: created.seriesId, completionLabel: `已新建书系「${created.title}」`, series: { ...created, memberCount: 0 } };
    });
  }

  /**
   * One Series' 成员与共享范围 (SER-001): the first page of its members and of its membership changes, and how many Books it
   * and the house hold. A read.
   */
  inspectSeries(seriesId: string): SeriesProjection {
    return this.#seriesCall(() => this.#seriesProjection(this.#requireSeries(seriesId)));
  }

  /** `更多成员…`: the next page of a Series' members, newest joined first (Issue #63 review). A read. */
  inspectSeriesMembers(seriesId: string, after: SeriesMembersCursor | null): SeriesMembersPageProjection {
    return this.#seriesCall(() => {
      const series = this.#requireSeries(seriesId);
      requireStore(after === null || (UUID_PATTERN.test(after.bookId) && typeof after.joinedAt === 'string' && !Number.isNaN(Date.parse(after.joinedAt))),
        'SERIES_CURSOR_INVALID', '书系列表位置无效。');
      const { members, nextCursor } = this.#seriesMembersPage(series.seriesId, after);
      return { members, nextCursor };
    });
  }

  /**
   * 加入书系…'s Books (Issue #63 review): a page of every Book the Series does not hold, by title, narrowed to titles holding
   * the editor's words when they give any — so every Book can be found and added, however many the house holds. A read.
   */
  inspectSeriesCandidates(seriesId: string, text: string, after: SeriesCandidatesCursor | null): SeriesCandidatesProjection {
    return this.#seriesCall(() => {
      const series = this.#requireSeries(seriesId);
      const words = typeof text === 'string' && text.isWellFormed() ? text.normalize('NFC').trim() : null;
      requireStore(words !== null && [...words].length <= MAX_SERIES_CANDIDATE_QUERY_CHARACTERS && !/[\r\n]/u.test(words), 'SERIES_QUERY_INVALID',
        `查找的书名字词最多 ${MAX_SERIES_CANDIDATE_QUERY_CHARACTERS} 个字，写在一行里。`);
      requireStore(after === null || (UUID_PATTERN.test(after.bookId) && typeof after.title === 'string' && after.title.length >= 1 && after.title.length <= 180),
        'SERIES_CURSOR_INVALID', '书系列表位置无效。');
      const rows = this.#authority.prepare(
        `SELECT b.book_id, b.title FROM books b
         WHERE NOT EXISTS (
             SELECT 1 FROM series_membership_changes c WHERE c.series_id = ? AND c.book_id = b.book_id AND c.kind = 'add'
               AND c.ordinal = (SELECT max(d.ordinal) FROM series_membership_changes d WHERE d.series_id = c.series_id AND d.book_id = c.book_id))
           AND (? = '' OR instr(lower(b.title), lower(?)) > 0)
           AND (? IS NULL OR b.title > ? OR (b.title = ? AND b.book_id > ?))
         ORDER BY b.title, b.book_id LIMIT ?`,
      ).all(series.seriesId, words, words, after?.title ?? null, after?.title ?? null, after?.title ?? null, after?.bookId ?? null,
        MAX_SERIES_CANDIDATES_PAGE + 1) as SqlRow[];
      const { page, more } = weighedPage(rows.map((row) => ({ bookId: asString(row.book_id), title: asString(row.title) })), MAX_SERIES_CANDIDATES_PAGE);
      const last = page.at(-1);
      return { candidates: page, nextCursor: more && last !== undefined ? { title: last.title, bookId: last.bookId } : null };
    });
  }

  /** `更早的记录…`: the next page of one Series' or one Book's membership change records, newest first (Issue #63 review). A read. */
  inspectSeriesHistory(filter: { readonly seriesId: string | null; readonly bookId: string | null }, after: SeriesHistoryCursor | null): SeriesHistoryPageProjection {
    return this.#seriesCall(() => {
      requireStore((filter.seriesId === null) !== (filter.bookId === null), 'SERIES_HISTORY_INVALID', '成员变更记录要按一个书系或一本书读取。');
      requireStore(after === null || (typeof after.recordedAt === 'string' && !Number.isNaN(Date.parse(after.recordedAt)) && UUID_PATTERN.test(after.seriesId) &&
        UUID_PATTERN.test(after.bookId) && Number.isSafeInteger(after.ordinal) && after.ordinal >= 1), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
      const read = filter.seriesId !== null
        ? this.#seriesHistoryPage({ seriesId: this.#requireSeries(filter.seriesId).seriesId }, after)
        : this.#seriesHistoryPage({ bookId: filter.bookId! }, after);
      return { history: read.history, nextCursor: read.nextCursor };
    });
  }

  /**
   * The Series Membership Impact Preview (SER-003 to SER-007) for 加入书系 or 移出书系 of one exact Book and Series. A read:
   * nothing is recorded until the editor commits the change against this preview's digest.
   */
  previewSeriesMembershipChange(input: PreviewSeriesMembershipChangeInput): SeriesMembershipPreviewProjection {
    return this.#seriesCall(() => this.#seriesPreview(input));
  }

  /**
   * 加入书系 or 移出书系 (SER-008 to SER-010): the preview is recomputed inside the transaction, and a preview the membership
   * or a governing record has moved past is refused rather than applied; the change record keeps what the preview showed.
   * The answer is that record alone (Issue #63 review): the page reads the Series again, each list a page at a time.
   */
  changeSeriesMembership(input: ChangeSeriesMembershipInput): SeriesMembershipChangeResultProjection {
    return this.#seriesCall(() => {
      const recorded = this.#transaction(this.#authority, () => {
        const preview = this.#seriesPreview(input);
        requireStore(preview.previewDigest === input.previewDigest, 'SERIES_PREVIEW_STALE',
          '预览之后，书系成员或相关记录有了变化；请重新查看影响，再决定。');
        const change = this.#series.record({
          seriesId: preview.seriesId,
          bookId: preview.bookId,
          kind: preview.kind,
          previewDigest: preview.previewDigest,
          impact: preview.groups,
          names: { book: preview.bookTitle, series: preview.seriesTitle },
        });
        return { change, preview };
      });
      const { change, preview } = recorded;
      return {
        changeId: change.changeId,
        completionLabel: `${change.kind === 'add' ? '已加入' : '已移出'}书系「${preview.seriesTitle}」：《${preview.bookTitle}》`,
        change: this.#seriesChange(change, preview.seriesTitle, preview.bookTitle),
      };
    });
  }

  /**
   * A Book's side of 书系 (SER-009): the Series it is in now — at most `MAX_BOOK_SERIES_MEMBERSHIPS`, with how many in all —
   * and the first page of its membership changes, newest first. A read.
   */
  inspectBookSeries(bookId: string): BookSeriesProjection {
    return this.#seriesCall(() => {
      this.#evaluationBookTitle(bookId);
      const memberships = this.#series.seriesOf(bookId);
      const history = this.#seriesHistoryPage({ bookId }, null);
      return {
        bookId,
        memberships: memberships.slice(0, MAX_BOOK_SERIES_MEMBERSHIPS),
        membershipCount: memberships.length,
        history: history.history,
        historyCount: history.count,
        historyNext: history.nextCursor,
      };
    });
  }

  #requireSeries(seriesId: string): StoredSeries {
    requireStore(typeof seriesId === 'string' && UUID_PATTERN.test(seriesId), 'SERIES_INVALID', '书系标识无效。');
    const found = this.#series.find(seriesId);
    requireStore(found !== null, 'SERIES_NOT_FOUND', '书系不存在。');
    return found;
  }

  #seriesPreview(input: PreviewSeriesMembershipChangeInput): SeriesMembershipPreviewProjection {
    const series = this.#requireSeries(input.seriesId);
    const bookTitle = this.#evaluationBookTitle(input.bookId);
    requireStore(input.kind === 'add' || input.kind === 'remove', 'SERIES_CHANGE_INVALID', '书系成员变更只有加入书系和移出书系。');
    const chain = this.#series.chain(series.seriesId, input.bookId);
    const member = chain.at(-1)?.kind === 'add';
    requireStore(input.kind !== 'add' || !member, 'SERIES_MEMBER_ALREADY', seriesMemberAlready(bookTitle, series.title));
    requireStore(input.kind !== 'remove' || member, 'SERIES_MEMBER_ABSENT', seriesMemberAbsent(bookTitle, series.title));
    const materials = this.#learningEligibility.project(input.bookId, this.#learningCandidates(input.bookId, false));
    const groups = seriesMembershipImpact(input.kind, {
      seriesTitle: series.title,
      bookTitle,
      // No Task kind can name a Series in its scope before Series-scope pins (Issue #64, S29): none is authorized or running.
      seriesScopedRuns: 0,
      ...seriesLearningFacts(materials),
      knowledgeFromBook: this.#seriesKnowledge.itemsFromBook(series.seriesId, input.bookId),
      knowledgeCandidatesFromBook: this.#seriesKnowledge.openFromBook(series.seriesId, input.bookId),
    });
    return {
      seriesId: series.seriesId,
      seriesTitle: series.title,
      bookId: input.bookId,
      bookTitle,
      kind: input.kind,
      actionLabel: input.kind === 'add' ? '加入书系' : '移出书系',
      groups,
      previewDigest: seriesPreviewDigest({ seriesId: series.seriesId, bookId: input.bookId, kind: input.kind, chainHead: chain.at(-1)?.changeId ?? null, groups }),
    };
  }

  #seriesProjection(series: StoredSeries): SeriesProjection {
    const members = this.#seriesMembersPage(series.seriesId, null);
    const history = this.#seriesHistoryPage({ seriesId: series.seriesId }, null);
    return {
      ...series,
      memberCount: members.count,
      bookCount: Number((this.#authority.prepare('SELECT count(*) count FROM books').get() as SqlRow).count),
      members: members.members,
      membersNext: members.nextCursor,
      history: history.history,
      historyCount: history.count,
      historyNext: history.nextCursor,
      knowledge: this.#seriesKnowledgeProjection(series.seriesId),
    };
  }

  /** One page of a Series' members after the one named, newest joined first, and how many it holds in all. */
  #seriesMembersPage(seriesId: string, after: SeriesMembersCursor | null): SeriesMembersPageProjection & { count: number } {
    const joined = this.#series.members(seriesId);
    const rest = after === null ? joined
      : joined.filter((entry) => entry.joinedAt < after.joinedAt || (entry.joinedAt === after.joinedAt && entry.bookId < after.bookId));
    const members: SeriesMemberProjection[] = rest.slice(0, MAX_SERIES_MEMBERS_PAGE + 1).map((entry) => {
      const people = this.#bookPeople.current(entry.bookId);
      return {
        bookId: entry.bookId,
        title: this.#evaluationBookTitle(entry.bookId),
        authors: people.authors,
        editors: people.editors,
        joinedAt: entry.joinedAt,
        // 书系一致性 stays unavailable until Series Knowledge reaches review (Issue #64, S29), so no member has had one.
        seriesConsistencyReview: null,
      };
    });
    const { page, more } = weighedPage(members, MAX_SERIES_MEMBERS_PAGE);
    const last = page.at(-1);
    return { members: page, nextCursor: more && last !== undefined ? { joinedAt: last.joinedAt, bookId: last.bookId } : null, count: joined.length };
  }

  /** One page of one Series' or one Book's membership change records after the one named, newest first, and how many in all. */
  #seriesHistoryPage(filter: { readonly seriesId: string } | { readonly bookId: string }, after: SeriesHistoryCursor | null):
  SeriesHistoryPageProjection & { count: number } {
    const all = this.#series.history(filter);
    const rest = (after === null ? all : all.filter((change) => seriesHistoryOrder(change, after) > 0)).slice(0, MAX_SERIES_HISTORY_PAGE + 1);
    const seriesTitles = new Map<string, string>();
    const bookTitles = new Map<string, string>();
    const titleOf = (titles: Map<string, string>, key: string, read: () => string): string => {
      if (!titles.has(key)) titles.set(key, read());
      return titles.get(key)!;
    };
    const projected = rest.map((change) => this.#seriesChange(
      change,
      titleOf(seriesTitles, change.seriesId, () => this.#requireSeries(change.seriesId).title),
      titleOf(bookTitles, change.bookId, () => this.#evaluationBookTitle(change.bookId)),
    ));
    const { page, more } = weighedPage(projected, MAX_SERIES_HISTORY_PAGE);
    const last = rest[page.length - 1];
    return {
      history: page,
      nextCursor: more && last !== undefined ? { recordedAt: last.recordedAt, seriesId: last.seriesId, bookId: last.bookId, ordinal: last.ordinal } : null,
      count: all.length,
    };
  }

  #seriesChange(change: StoredMembershipChange, seriesTitle: string, bookTitle: string): SeriesMembershipChangeProjection {
    return {
      changeId: change.changeId,
      seriesId: change.seriesId,
      seriesTitle,
      bookId: change.bookId,
      bookTitle,
      kind: change.kind,
      label: change.kind === 'add' ? '加入书系' : '移出书系',
      priorMember: change.kind === 'remove',
      newMember: change.kind === 'add',
      actor: '本机编辑',
      recordedAt: change.recordedAt,
      impact: change.impact,
    };
  }

  // ---- 书系知识 (Issue #63, plan slice S28b; V2-UX-SER-013 to SER-019; ADR 0036) ---------------------------------------

  /**
   * 提议为书系知识 (SER-013, SER-014): the editor's own words, or the exact span of a member Book's manuscript, becomes a
   * non-authoritative candidate for a new or an exact existing item. Nothing reads it until it is taken in.
   */
  proposeSeriesKnowledge(input: ProposeSeriesKnowledgeInput): SeriesKnowledgeProposalProjection {
    return this.#seriesCall(() => {
      const created = this.#transaction(this.#authority, () => {
        const series = this.#requireSeries(input.seriesId);
        const target = this.#knowledgeTarget(series.seriesId, input.target);
        const content = seriesKnowledgeContent(input.content);
        requireStore(content !== null, 'SERIES_KNOWLEDGE_CONTENT_INVALID', `内容要 1–${MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS} 个字。`);
        const provenance = input.span === null ? null : this.#knowledgeSpan(series, input.span);
        return this.#seriesKnowledge.propose({ seriesId: series.seriesId, target, content, provenance });
      });
      const series = this.#requireSeries(input.seriesId);
      // The answer is the candidate alone (Issue #63 review): the page reads its lists again, each a page at a time.
      const items = this.#seriesKnowledge.items(series.seriesId);
      const open = this.#seriesKnowledge.open(series.seriesId);
      return {
        candidateId: created.candidateId,
        completionLabel: `已提议为书系「${series.title}」的知识候选项`,
        candidate: this.#knowledgeCandidateProjection(created, items, seriesKnowledgeConflicts(created, items, open).length, this.#bookTitles()),
      };
    });
  }

  /** 书系知识纳入审阅 (SER-015, SER-016, SER-019) of one open candidate as it stands now. A read. */
  inspectSeriesKnowledgeReview(input: { seriesId: string; candidateId: string }): SeriesKnowledgeReviewProjection {
    return this.#seriesCall(() => this.#seriesKnowledgeReview(input.seriesId, input.candidateId).projection);
  }

  /** 编辑候选项 (SER-015): the candidate's next version, read again in review against the item as it stands now. */
  editSeriesKnowledgeCandidate(input: EditSeriesKnowledgeCandidateInput): SeriesKnowledgeReviewProjection {
    return this.#seriesCall(() => {
      this.#transaction(this.#authority, () => {
        const series = this.#requireSeries(input.seriesId);
        requireStore(typeof input.candidateId === 'string' && UUID_PATTERN.test(input.candidateId), 'SERIES_KNOWLEDGE_CANDIDATE_INVALID', '候选项标识无效。');
        const candidate = this.#seriesKnowledge.candidate(input.candidateId);
        requireStore(candidate !== null && candidate.seriesId === series.seriesId, 'SERIES_KNOWLEDGE_CANDIDATE_NOT_FOUND', '这个候选项不存在。');
        const target = this.#knowledgeTarget(series.seriesId, input.target);
        const content = seriesKnowledgeContent(input.content);
        requireStore(content !== null, 'SERIES_KNOWLEDGE_CONTENT_INVALID', `内容要 1–${MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS} 个字。`);
        this.#seriesKnowledge.edit(input.candidateId, input.expectedVersion, target, content);
      });
      return this.#seriesKnowledgeReview(input.seriesId, input.candidateId).projection;
    });
  }

  /**
   * 纳入书系知识 (SER-017 to SER-019): against the exact review the editor read — a moved candidate, item, conflict or
   * membership refuses it — a conflict kept only by 保留已披露冲突, and where it may later be used chosen by the editor.
   */
  promoteSeriesKnowledge(input: PromoteSeriesKnowledgeInput): SeriesKnowledgePromotionProjection {
    return this.#seriesCall(() => {
      const promoted = this.#transaction(this.#authority, () => {
        const review = this.#seriesKnowledgeReview(input.seriesId, input.candidateId);
        requireStore(review.candidate.version === input.candidateVersion && review.projection.reviewDigest === input.reviewDigest,
          'SERIES_KNOWLEDGE_REVIEW_STALE', '候选项、条目或冲突在审阅之后有了变化；请重新审阅。');
        requireStore(review.projection.blocked === null, 'SERIES_KNOWLEDGE_BLOCKED', review.projection.blocked ?? '');
        requireStore(isSeriesKnowledgeReuseScope(input.reuseScope), 'SERIES_KNOWLEDGE_REUSE_INVALID', '请选择以后的用途。');
        if (review.conflicts.length > 0) {
          requireStore(input.conflictDisposition === 'preserved', 'SERIES_KNOWLEDGE_CONFLICT_UNRESOLVED',
            `${SERIES_KNOWLEDGE_CONFLICT_LABEL}：请编辑候选项，或选择保留已披露冲突。`);
        } else {
          requireStore(input.conflictDisposition === 'none', 'SERIES_KNOWLEDGE_DISPOSITION_INVALID', '没有已披露的冲突可以保留。');
        }
        return this.#seriesKnowledge.promote({ candidate: review.candidate, conflicts: review.conflicts, reuseScope: input.reuseScope, reviewDigest: input.reviewDigest });
      });
      return {
        itemId: promoted.itemId,
        revisionId: promoted.revisionId,
        completionLabel: promoted.outcome === 'created' ? '书系知识已纳入' as const : '书系知识已更新' as const,
        item: this.#knowledgeItemProjection(this.#seriesKnowledge.item(promoted.itemId)!, this.#bookTitles()),
      };
    });
  }

  /** `查找条目` and `更多条目…`: a page of a Series' knowledge items by name, narrowed to names holding the words (Issue #63 review). A read. */
  inspectSeriesKnowledgeItems(seriesId: string, text: string, after: SeriesKnowledgeItemsCursor | null): SeriesKnowledgeItemsPageProjection {
    return this.#seriesCall(() => {
      const series = this.#requireSeries(seriesId);
      const words = typeof text === 'string' && text.isWellFormed() ? text.normalize('NFC').trim() : null;
      requireStore(words !== null && [...words].length <= MAX_SERIES_KNOWLEDGE_QUERY_CHARACTERS && !/[\r\n]/u.test(words), 'SERIES_KNOWLEDGE_QUERY_INVALID',
        `查找的条目字词最多 ${MAX_SERIES_KNOWLEDGE_QUERY_CHARACTERS} 个字，写在一行里。`);
      requireStore(after === null || (typeof after.itemId === 'string' && UUID_PATTERN.test(after.itemId) && typeof after.subject === 'string' &&
        after.subject.length >= 1 && after.subject.length <= 2 * MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
      return this.#knowledgeItemsPage(series.seriesId, words, after);
    });
  }

  /** `更多候选项…`: the next page of a Series' open candidates, oldest proposed first (Issue #63 review). A read. */
  inspectSeriesKnowledgeCandidates(seriesId: string, after: SeriesKnowledgeCandidatesCursor | null): SeriesKnowledgeCandidatesPageProjection {
    return this.#seriesCall(() => {
      const series = this.#requireSeries(seriesId);
      requireStore(after === null || (typeof after.candidateId === 'string' && UUID_PATTERN.test(after.candidateId) && typeof after.firstAt === 'string' &&
        !Number.isNaN(Date.parse(after.firstAt))), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
      const { candidates, nextCursor } = this.#knowledgeCandidatesPage(series.seriesId, after);
      return { candidates, nextCursor };
    });
  }

  /** 历次版本: a page of one item's revisions, newest first, below the ordinal named (Issue #63 review). A read. */
  inspectSeriesKnowledgeRevisions(seriesId: string, itemId: string, before: number | null): SeriesKnowledgeRevisionsProjection {
    return this.#seriesCall(() => {
      const series = this.#requireSeries(seriesId);
      requireStore(typeof itemId === 'string' && UUID_PATTERN.test(itemId), 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识条目不存在。');
      const item = this.#seriesKnowledge.item(itemId);
      requireStore(item !== null && item.seriesId === series.seriesId, 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识条目不存在。');
      requireStore(before === null || (Number.isSafeInteger(before) && before >= 1), 'SERIES_CURSOR_INVALID', '书系列表位置无效。');
      const titles = this.#bookTitles();
      const rest = [...item.revisions].reverse().filter((revision) => before === null || revision.ordinal < before);
      const { page, more } = weighedPage(rest.slice(0, MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE + 1).map((revision) => this.#knowledgeRevisionProjection(revision, titles)),
        MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE, SERIES_KNOWLEDGE_PAGE_BYTES);
      return { itemId: item.itemId, revisions: page, nextBefore: more ? page.at(-1)!.ordinal : null };
    });
  }

  /** One page of a Series' knowledge items after the one named, each with its current revision only. */
  #knowledgeItemsPage(seriesId: string, words: string, after: SeriesKnowledgeItemsCursor | null): SeriesKnowledgeItemsPageProjection {
    const titles = this.#bookTitles();
    const items = this.#seriesKnowledge.itemsPage(seriesId, words, after, MAX_SERIES_KNOWLEDGE_ITEMS_PAGE + 1).map((item) => this.#knowledgeItemProjection(item, titles));
    const { page, more } = weighedPage(items, MAX_SERIES_KNOWLEDGE_ITEMS_PAGE, SERIES_KNOWLEDGE_PAGE_BYTES);
    const last = page.at(-1);
    return { items: page, nextCursor: more && last !== undefined ? { subject: last.subject, itemId: last.itemId } : null };
  }

  /** One page of a Series' open candidates after the one named, oldest proposed first, each with how many conflicts it discloses. */
  #knowledgeCandidatesPage(seriesId: string, after: SeriesKnowledgeCandidatesCursor | null): SeriesKnowledgeCandidatesPageProjection {
    const titles = this.#bookTitles();
    const items = this.#seriesKnowledge.items(seriesId);
    const open = this.#seriesKnowledge.open(seriesId);
    const read = this.#seriesKnowledge.openPage(seriesId, after, MAX_SERIES_KNOWLEDGE_CANDIDATES_PAGE + 1);
    const projected = read.map(({ candidate }) => this.#knowledgeCandidateProjection(candidate, items, seriesKnowledgeConflicts(candidate, items, open).length, titles));
    const { page, more } = weighedPage(projected, MAX_SERIES_KNOWLEDGE_CANDIDATES_PAGE, SERIES_KNOWLEDGE_PAGE_BYTES);
    const last = read[page.length - 1];
    return { candidates: page, nextCursor: more && last !== undefined ? { firstAt: last.firstAt, candidateId: last.candidate.candidateId } : null };
  }

  /** The item a candidate proposes, resolved against the Series as it stands: a new name and class, or the exact item now. */
  #knowledgeTarget(seriesId: string, target: SeriesKnowledgeTarget): ResolvedTarget {
    requireStore(typeof target === 'object' && target !== null && (target.kind === 'new' || target.kind === 'existing'), 'SERIES_KNOWLEDGE_TARGET_INVALID', '候选项要写明是新条目还是已有条目。');
    if (target.kind === 'new') {
      const subject = seriesKnowledgeSubject(target.subject);
      requireStore(subject !== null, 'SERIES_KNOWLEDGE_SUBJECT_INVALID', `条目名称要 1–${MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS} 个字，写在一行里。`);
      requireStore(isSeriesKnowledgeClass(target.knowledgeClass), 'SERIES_KNOWLEDGE_CLASS_INVALID', '请选择条目类别。');
      return { kind: 'new', subject, knowledgeClass: target.knowledgeClass };
    }
    requireStore(typeof target.itemId === 'string' && UUID_PATTERN.test(target.itemId), 'SERIES_KNOWLEDGE_TARGET_INVALID', '候选项要写明是新条目还是已有条目。');
    const item = this.#seriesKnowledge.item(target.itemId);
    requireStore(item !== null && item.seriesId === seriesId, 'SERIES_KNOWLEDGE_ITEM_NOT_FOUND', '这个书系知识条目不存在。');
    return { kind: 'existing', itemId: item.itemId, subject: item.subject, knowledgeClass: item.knowledgeClass, baseRevisionId: item.revisions.at(-1)!.revisionId };
  }

  /** The exact span a provenance-bound candidate cites (SER-013): verified as a mark's is, in a Book the Series holds now. */
  #knowledgeSpan(series: StoredSeries, span: SeriesKnowledgeSpanInput): StoredProvenance {
    requireStore(typeof span === 'object' && span !== null, 'SERIES_KNOWLEDGE_SPAN_INVALID', '所选文字无效。');
    const verified = this.#markCall(() => this.#editorialMarks.verifySpan(span));
    const bookTitle = this.#evaluationBookTitle(verified.bookId);
    requireStore(this.#series.seriesOf(verified.bookId).some((entry) => entry.seriesId === series.seriesId), 'SERIES_KNOWLEDGE_NOT_MEMBER',
      `《${bookTitle}》不在书系「${series.title}」中；只有成员图书的稿件可以提议为书系知识。`);
    return {
      kind: 'manuscript-revision',
      bookId: verified.bookId,
      manuscriptId: span.manuscriptId,
      branchId: span.branchId,
      revisionId: verified.revisionId,
      revisionLabel: verified.revisionLabel,
      journalSequence: verified.journalSequence,
      blockId: span.blockId,
      fromGrapheme: span.fromGrapheme,
      toGrapheme: span.toGrapheme,
      quote: verified.text,
    };
  }

  #seriesKnowledgeReview(seriesId: string, candidateId: string): {
    readonly projection: SeriesKnowledgeReviewProjection;
    readonly candidate: StoredCandidate;
    readonly conflicts: FoundConflict[];
  } {
    const series = this.#requireSeries(seriesId);
    requireStore(typeof candidateId === 'string' && UUID_PATTERN.test(candidateId), 'SERIES_KNOWLEDGE_CANDIDATE_INVALID', '候选项标识无效。');
    const candidate = this.#seriesKnowledge.candidate(candidateId);
    requireStore(candidate !== null && candidate.seriesId === series.seriesId, 'SERIES_KNOWLEDGE_CANDIDATE_NOT_FOUND', '这个候选项不存在。');
    requireStore(!candidate.promoted, 'SERIES_KNOWLEDGE_ALREADY_PROMOTED', '这个候选项已经纳入书系知识。');
    const items = this.#seriesKnowledge.items(series.seriesId);
    const conflicts = seriesKnowledgeConflicts(candidate, items, this.#seriesKnowledge.open(series.seriesId));
    const target = candidate.target;
    const current = target.kind === 'existing' ? items.find((item) => item.itemId === target.itemId)?.revisions.at(-1) ?? null : null;
    const titles = this.#bookTitles();
    // A provenance-bound candidate cites a member Book's manuscript: once the Book has left the Series it cannot be taken in.
    const blocked = candidate.provenance !== null && !this.#series.seriesOf(candidate.provenance.bookId).some((entry) => entry.seriesId === series.seriesId)
      ? `《${titles.get(candidate.provenance.bookId) ?? ''}》已不在书系「${series.title}」中；来自它的候选项不能纳入。`
      : null;
    return {
      candidate,
      conflicts,
      projection: {
        seriesId: series.seriesId,
        seriesTitle: series.title,
        candidate: this.#knowledgeCandidateProjection(candidate, items, conflicts.length, titles),
        current: current === null ? null : this.#knowledgeRevisionProjection(current, titles),
        conflicts: conflicts.slice(0, MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN).map((entry) => ({ kind: entry.kind, line: entry.line })),
        conflictCount: conflicts.length,
        conflictLabel: conflicts.length === 0 ? null : SERIES_KNOWLEDGE_CONFLICT_LABEL,
        reuseScopes: SERIES_KNOWLEDGE_REUSE_SCOPES.map((scope) => ({ scope, label: SERIES_KNOWLEDGE_REUSE_LABELS[scope] })),
        blocked,
        reviewDigest: seriesKnowledgeReviewDigest({ seriesId: series.seriesId, candidateVersionId: candidate.versionId, currentRevisionId: current?.revisionId ?? null, conflicts, blocked }),
        actionLabel: '纳入书系知识',
      },
    };
  }

  /** A Series' knowledge as its page first shows it (Issue #63 review): the first page of items and of open candidates, and the counts. */
  #seriesKnowledgeProjection(seriesId: string): SeriesProjection['knowledge'] {
    const items = this.#knowledgeItemsPage(seriesId, '', null);
    const candidates = this.#knowledgeCandidatesPage(seriesId, null);
    return {
      items: items.items,
      itemCount: this.#seriesKnowledge.itemCount(seriesId),
      itemsNext: items.nextCursor,
      candidates: candidates.candidates,
      candidateCount: this.#seriesKnowledge.openCount(seriesId),
      candidatesNext: candidates.nextCursor,
    };
  }

  #bookTitles(): Map<string, string> {
    return new Map((this.#authority.prepare('SELECT book_id, title FROM books').all() as SqlRow[]).map((row) => [asString(row.book_id), asString(row.title)]));
  }

  #knowledgeProvenance(provenance: StoredProvenance | null, titles: ReadonlyMap<string, string>): SeriesKnowledgeProvenanceProjection | null {
    if (provenance === null) return null;
    return {
      kind: provenance.kind,
      bookId: provenance.bookId,
      bookTitle: titles.get(provenance.bookId) ?? '',
      manuscriptId: provenance.manuscriptId,
      revisionId: provenance.revisionId,
      revisionLabel: provenance.revisionLabel,
      journalSequence: provenance.journalSequence,
      blockId: provenance.blockId,
      fromGrapheme: provenance.fromGrapheme,
      toGrapheme: provenance.toGrapheme,
      quote: knowledgeQuoteExcerpt(provenance.quote),
      // Changes waited in the journal beyond the revision when the words were cited (Issue #63 review).
      uncheckpointed: provenance.journalSequence > 0,
    };
  }

  #knowledgeCandidateProjection(
    candidate: StoredCandidate,
    items: ReadonlyArray<StoredItem>,
    conflicts: number,
    titles: ReadonlyMap<string, string>,
  ): SeriesKnowledgeCandidateProjection {
    const target = candidate.target;
    const base = target.kind === 'existing'
      ? items.find((item) => item.itemId === target.itemId)?.revisions.find((revision) => revision.revisionId === target.baseRevisionId) ?? null
      : null;
    return {
      candidateId: candidate.candidateId,
      version: candidate.version,
      target: {
        kind: target.kind,
        itemId: target.kind === 'existing' ? target.itemId : null,
        subject: target.subject,
        knowledgeClass: target.knowledgeClass,
        classLabel: SERIES_KNOWLEDGE_CLASS_LABELS[target.knowledgeClass],
        baseRevisionOrdinal: base?.ordinal ?? null,
      },
      content: candidate.content,
      authoring: candidate.authoring,
      provenance: this.#knowledgeProvenance(candidate.provenance, titles),
      recordedAt: candidate.recordedAt,
      conflicts,
    };
  }

  #knowledgeRevisionProjection(revision: StoredRevision, titles: ReadonlyMap<string, string>): SeriesKnowledgeRevisionProjection {
    return {
      revisionId: revision.revisionId,
      ordinal: revision.ordinal,
      content: revision.content,
      authoring: revision.authoring,
      provenance: this.#knowledgeProvenance(revision.provenance, titles),
      conflicts: revision.conflicts,
      reuseScope: revision.reuseScope,
      reuseLabel: SERIES_KNOWLEDGE_REUSE_LABELS[revision.reuseScope],
      decisionId: revision.decisionId,
      outcome: revision.outcome,
      recordedAt: revision.recordedAt,
    };
  }

  #knowledgeItemProjection(item: StoredItem, titles: ReadonlyMap<string, string>): SeriesKnowledgeItemProjection {
    return {
      itemId: item.itemId,
      subject: item.subject,
      knowledgeClass: item.knowledgeClass,
      classLabel: SERIES_KNOWLEDGE_CLASS_LABELS[item.knowledgeClass],
      createdAt: item.createdAt,
      current: this.#knowledgeRevisionProjection(item.revisions.at(-1)!, titles),
      revisionCount: item.revisions.length,
    };
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
        history: recent
          .map((entry) => ({ softwareVersion: entry.softwareVersion, dataVersion: entry.dataVersion, schemaRevision: entry.schemaRevision, recordedAt: entry.recordedAt })),
        historyTruncated: count > MAX_STORE_VERSIONS_LISTED,
        // Each upgrade to a later Data Version, newest first, with the backup made before it (Issue #433, S85b): the newest
        // twenty, kept as the ledger is read as a stream.
        upgrades: upgrades.map((entry) => ({
          fromDataVersion: entry.upgrade!.fromDataVersion,
          toDataVersion: entry.dataVersion,
          fromSoftwareVersion: entry.upgrade!.fromSoftwareVersion,
          softwareVersion: entry.softwareVersion,
          changes: entry.upgrade!.changes,
          backupFileName: entry.upgrade!.backup.fileName,
          backupPresent: existsSync(join(location, entry.upgrade!.backup.fileName)),
          recordedAt: entry.recordedAt,
        })),
        backupLocation: location,
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
    return this.#databaseReplacementCall(() =>
      this.#databaseReplacements.freezing(() => this.#scheduledBackups.alone(() => this.#databaseReplacements.prepare(previewId, now))));
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
    return this.#databaseReplacementCall(() => this.#databaseReplacements.cancel(replacementId));
  }

  /** The replacement waiting, if any, and the replacements this data records. A read. */
  async inspectDatabaseReplacements(): Promise<DatabaseReplacementsProjection> {
    return this.#databaseReplacementCall(() => this.#databaseReplacements.projection());
  }

  /** `回退到替换前的数据`: the latest replacement's backup waiting to replace the data, which is backed up first, alone too. */
  async rollBackDatabaseReplacement(replacementId: string, now: Date = new Date()): Promise<DatabaseReplacementsProjection> {
    return this.#databaseReplacementCall(() =>
      this.#databaseReplacements.freezing(() => this.#scheduledBackups.alone(() => this.#databaseReplacements.rollBack(replacementId, now))));
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
          error instanceof DecisionFeedbackError || error instanceof AnalysisFeedbackError) {
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

  /**
   * 从来源材料创建 (V2-UX-DELIV-001, WORK-013): one Production Document of a house type, made from one of the Book's
   * source-only materials. The retained file is read again by the current parser — outside any transaction, since it
   * is a file read — and one transaction writes the document's row in the block store, its branch, its first
   * revision (which carries the material's Source Version) with every block under a newly minted identity, its
   * working state and indexes, the document's ledger row and its `版本 1`. The Book's Manuscript and every record of
   * it are untouched.
   */
  async createProductionDocument(input: CreateProductionDocumentInput): Promise<ProductionDocumentResultProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.sourceVersionId),
      'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
    const type = productionDocumentType(input.typeId);
    requireStore(type !== undefined, 'PRODUCTION_DOCUMENT_TYPE_INVALID', '这个文档类型不在本社的类型配置中。');
    const plan = this.#documentCall(() => this.#productionDocumentPlan(input));
    const object = one(
      this.#authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').all(plan.objectDigest) as SqlRow[],
      'PRODUCTION_DOCUMENT_SOURCE_INVALID', '来源材料的文件对象记录缺失。',
    );
    const blocks: ParsedDocxBlock[] = [];
    let parsed: ParsedDocx;
    try {
      parsed = await parseDocx(
        this.#contentObjectPath(plan.objectDigest, asString(object.relative_key)),
        plan.displayName,
        (block) => {
          requireStore(blocks.length < MAX_PRODUCTION_DOCUMENT_BLOCKS, 'PRODUCTION_DOCUMENT_SOURCE_TOO_LARGE',
            `一份文档最多从 ${MAX_PRODUCTION_DOCUMENT_BLOCKS.toLocaleString('zh-CN')} 段文字开始。`);
          blocks.push(block);
        },
        { digest: plan.objectDigest, bytes: asNumber(object.byte_length) },
        { formatIdentified: true },
      );
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError('PRODUCTION_DOCUMENT_SOURCE_INVALID', '来源材料无法读出可编辑的文字。');
    }
    requireStore(blocks.length > 0 && blocks.length === parsed.blockCount, 'PRODUCTION_DOCUMENT_SOURCE_INVALID',
      '来源材料没有可作为文档的文字。');
    const now = new Date().toISOString();
    const documentId = randomUUID();
    const branchId = randomUUID();
    const revisionId = randomUUID();
    const characterCount = blocks.reduce((total, block) => total + block.graphemeLength, 0);
    const revisionDigest = sha256(canonicalJson({
      schema: 'ai7.production-document-revision/1',
      documentId,
      sourceVersionId: plan.sourceVersionId,
      parserIdentity: parsed.parserIdentity,
      contentDigest: parsed.contentDigest,
      structureDigest: parsed.structureDigest,
      blockCount: blocks.length,
      characterCount,
    }));
    this.#documentCall(() => this.#transaction(this.#authority, () => {
      // The checks again, inside the transaction that writes: a second 创建 of the type, or a 本书不做 recorded while
      // the file was read, refuses this one.
      this.#productionDocumentPlan(input);
      this.#authority.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'production-document', ?)")
        .run(documentId, input.bookId, now);
      this.#authority.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, created_at) VALUES (?, ?, ?, ?)')
        .run(branchId, documentId, type.label, now);
      this.#authority.prepare(
        `INSERT INTO manuscript_revisions(
           revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
           source_version_id, revision_digest, created_at
         ) VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`,
      ).run(revisionId, documentId, branchId, plan.sourceVersionId, revisionDigest, now);
      this.#authority.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(revisionId, branchId);
      const insertBlock = this.#authority.prepare('INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)');
      const insertVersion = this.#authority.prepare(
        `INSERT INTO manuscript_block_versions(
           revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertWorking = this.#authority.prepare(
        `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      let offset = 0;
      blocks.forEach((block, index) => {
        const position = index + 1;
        // A document's blocks are its own: a material imported for the Manuscript too keeps its identities there.
        const blockId = `blk_${sha256(`${revisionId}\u0000${position}\u0000${block.digest}`).slice(0, 24)}`;
        insertBlock.run(blockId, documentId, revisionId);
        insertVersion.run(revisionId, blockId, position, block.kind, block.level, block.text, block.digest, offset, block.graphemeLength);
        insertWorking.run(branchId, blockId, position, block.kind, block.level, block.text, block.digest, block.graphemeLength);
        offset += block.graphemeLength;
      });
      this.#authority.prepare(
        `INSERT INTO branch_working_state(
           branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest,
           total_graphemes, history_sequence, last_checkpoint_sequence
         ) VALUES (?, ?, ?, 0, ?, ?, 0, 0)`,
      ).run(branchId, documentId, revisionId, revisionDigest, characterCount);
      requireStore(
        this.#boundedCall(() => this.#boundedAuthority.initializeImportedBranch(branchId)) === characterCount,
        'PRODUCTION_DOCUMENT_INVALID', '文档索引无法由来源材料精确建立。',
      );
      this.#productionDocuments.record({
        documentId, bookId: input.bookId, typeId: input.typeId, originSourceVersionId: plan.sourceVersionId,
        parserIdentity: parsed.parserIdentity, createdAt: now,
      });
      // The document begins following the Book's workflow profile now (Issue #415, S66c; WORK-002).
      this.#documentWorkflow.recordInstance(documentId, now);
      // How its material was read, kept for as long as the document exists (Issue #547): every tracked change rejected,
      // the comments left out, and how many 批注与修订 that left behind.
      recordProductionDocumentOrigin(this.#authority, {
        documentId, sourceVersionId: plan.sourceVersionId, marksNotCarried: parsed.importedMarks.length, recordedAt: now,
      });
      this.#productionDocuments.recordVersion(documentId, revisionId, revisionDigest, 'created');
    }));
    // The material's comments and tracked changes stay with the material: the document says so where it opens.
    const notCarried = parsed.importedMarks.length;
    return this.#productionDocumentResult(input.bookId, input.typeId, notCarried === 0 ? null : productionDocumentMarksNotCarried(notCarried));
  }

  /** `本书不做` or `恢复` for one house type of a Book (WORK-013): an appended decision, or no change. */
  decideProductionDocumentType(input: DecideProductionDocumentTypeInput): ProductionDocumentResultProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.bookId), 'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
    this.#documentCall(() => this.#transaction(this.#authority, () => {
      one(this.#authority.prepare('SELECT 1 FROM books WHERE book_id = ?').all(input.bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。');
      this.#productionDocuments.decide(input.bookId, input.typeId, input.notForThisBook);
    }));
    return this.#productionDocumentResult(input.bookId, input.typeId);
  }

  /**
   * 保存为版本 (DELIV-002): the document's working text becomes its next version, through the block store's own
   * checkpoint, and the version is recorded in the transaction that makes the revision. A document whose working text
   * is its latest version already saves nothing and says so.
   */
  async saveProductionDocumentVersion(input: SaveProductionDocumentVersionInput): Promise<ProductionDocumentResultProjection> {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.documentId) && UUID_PATTERN.test(input.branchId),
      'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
    const row = this.#documentCall(() => this.#productionDocuments.documentById(input.bookId, input.documentId));
    requireStore(row !== undefined && row.branchId === input.branchId, 'PRODUCTION_DOCUMENT_NOT_FOUND', '这本书没有这份生产文档。');
    const owner = this.#boundedAuthority;
    const work = this.#boundedCall(() => owner.createManuscriptCheckpointWork(input.documentId, input.branchId, 'Document Version / 文档版本'));
    // Nothing to check point — the working state is its revision, as after a journal recovery made one — still saves
    // that revision as a version when no version holds it yet; one already the latest records nothing more.
    if (work.workId === null && work.checkpoint !== null) {
      const checkpoint = work.checkpoint;
      this.#documentCall(() => this.#productionDocuments.recordVersion(input.documentId, checkpoint.revisionId, checkpoint.revisionDigest, 'saved'));
    }
    if (work.workId !== null) {
      const workId = work.workId;
      try {
        for (;;) {
          const progress = this.#boundedCall(() => owner.advanceManuscriptCheckpointWork(workId));
          if (progress.done) break;
          await new Promise<void>((resolveYield) => setImmediate(resolveYield));
        }
        this.#boundedCall(() => owner.finalizeManuscriptCheckpointWork(workId, (checkpoint, purpose) => {
          requireStore(purpose === 'Document Version / 文档版本', 'PRODUCTION_DOCUMENT_INVALID', '文档版本的用途无效。');
          this.#documentCall(() => this.#productionDocuments.recordVersion(input.documentId, checkpoint.revisionId, checkpoint.revisionDigest, 'saved'));
        }));
      } catch (error) {
        this.#boundedCall(() => owner.cancelManuscriptCheckpointWork(workId));
        throw error;
      }
    }
    return this.#productionDocumentResult(input.bookId, row.typeId);
  }

  /**
   * 交付 (Issue #415, S66b; DELIV-003): one Delivery Record of one exact version of a document of this Book — a version
   * it saved, or its current text, saved as the next version first (origin `delivery`) in the transaction that records
   * the delivery. The export of that version follows on the export card, as the manuscript's does; nothing is sent.
   */
  async recordProductionDocumentDelivery(input: RecordProductionDocumentDeliveryInput): Promise<ProductionDocumentResultProjection> {
    this.#assertAvailable();
    const version = input.version;
    requireStore(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.documentId) &&
      (version.kind === 'saved' ? UUID_PATTERN.test(version.revisionId) : version.kind === 'current' && DIGEST_PATTERN.test(version.workingDigest)),
    'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
    const row = this.#documentCall(() => this.#productionDocuments.documentById(input.bookId, input.documentId));
    requireStore(row !== undefined, 'PRODUCTION_DOCUMENT_NOT_FOUND', '这本书没有这份生产文档。');
    // Who and the note are checked first: a refused delivery saves no version either.
    const party = this.#documentCall(() => this.#productionDocuments.deliveryParty(input.recipient, input.note));
    if (version.kind === 'saved') {
      this.#documentCall(() => this.#transaction(this.#authority, () => this.#productionDocuments.recordDelivery(row, version.revisionId, party)));
      return this.#productionDocumentResult(input.bookId, row.typeId);
    }
    requireStore(this.#documentCall(() => this.#productionDocuments.workingDigest(row)) === version.workingDigest,
      'PRODUCTION_DOCUMENT_DELIVERY_CHANGED', '文档在打开交付后又有修改；请重新选择要交付的版本。');
    // The current text as the next version — or the latest version already, when nothing moved since — and its delivery.
    const deliver = (revisionId: string, revisionDigest: string): void => {
      this.#productionDocuments.recordVersion(row.documentId, revisionId, revisionDigest, 'delivery');
      this.#productionDocuments.recordDelivery(row, revisionId, party);
    };
    const owner = this.#boundedAuthority;
    const work = this.#boundedCall(() => owner.createManuscriptCheckpointWork(row.documentId, row.branchId, 'Document Version / 文档版本'));
    if (work.workId === null) {
      const checkpoint = work.checkpoint!;
      this.#documentCall(() => this.#transaction(this.#authority, () => deliver(checkpoint.revisionId, checkpoint.revisionDigest)));
      return this.#productionDocumentResult(input.bookId, row.typeId);
    }
    const workId = work.workId;
    try {
      for (;;) {
        const progress = this.#boundedCall(() => owner.advanceManuscriptCheckpointWork(workId));
        if (progress.done) break;
        await new Promise<void>((resolveYield) => setImmediate(resolveYield));
      }
      this.#boundedCall(() => owner.finalizeManuscriptCheckpointWork(workId, (checkpoint, purpose) => {
        requireStore(purpose === 'Document Version / 文档版本', 'PRODUCTION_DOCUMENT_INVALID', '文档版本的用途无效。');
        this.#documentCall(() => deliver(checkpoint.revisionId, checkpoint.revisionDigest));
      }));
    } catch (error) {
      this.#boundedCall(() => owner.cancelManuscriptCheckpointWork(workId));
      throw error;
    }
    return this.#productionDocumentResult(input.bookId, row.typeId);
  }

  /** What 从来源材料创建 may do for this input, or the reason it may not: a Manuscript, a free type, a material of the Book's. */
  #productionDocumentPlan(input: CreateProductionDocumentInput): {
    sourceVersionId: string;
    displayName: string;
    objectDigest: string;
  } {
    const primary = this.#authority.prepare("SELECT 1 FROM manuscripts WHERE book_id = ? AND role = 'primary'").get(input.bookId);
    requireStore(primary !== undefined, 'PRODUCTION_DOCUMENT_NEEDS_MANUSCRIPT', PRODUCTION_DOCUMENTS_NEED_MANUSCRIPT);
    requireStore(this.#productionDocuments.documentOfType(input.bookId, input.typeId) === undefined,
      'PRODUCTION_DOCUMENT_EXISTS', '这本书已经有这一类文档。');
    requireStore(!this.#productionDocuments.notForThisBook(input.bookId, input.typeId),
      'PRODUCTION_DOCUMENT_NOT_FOR_THIS_BOOK', '这一类文档已标为本书不做；先恢复。');
    const source = this.#productionDocuments.source(input.bookId, input.sourceVersionId);
    requireStore(source !== undefined, 'PRODUCTION_DOCUMENT_SOURCE_INVALID', '只能从这本书作为来源材料导入的文件创建文档。');
    return {
      sourceVersionId: source.sourceVersionId,
      displayName: source.displayName,
      objectDigest: source.workingObjectDigest ?? source.objectDigest,
    };
  }

  /** 交付 · 生产文档 of one Book (Issue #415): one card per house type and the materials a document can start from. */
  inspectProductionDocuments(bookId: string): ProductionDocumentsProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    one(this.#authority.prepare('SELECT 1 FROM books WHERE book_id = ?').all(bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。');
    const primary = this.#authority.prepare("SELECT 1 FROM manuscripts WHERE book_id = ? AND role = 'primary'").get(bookId) !== undefined;
    return this.#documentCall(() => this.#productionDocuments.documents(bookId, primary));
  }

  #productionDocumentResult(bookId: string, typeId: string, notice: string | null = null): ProductionDocumentResultProjection {
    const documents = this.inspectProductionDocuments(bookId);
    const card = documents.types.find((type) => type.typeId === typeId);
    return { bookId, documents, typeId, document: card?.document ?? null, notice };
  }

  /**
   * 开始 / 完成 / 跳过 / 重新打开 one phase of a document of this Book (Issue #415, S66c; WORK-008, WORK-009): one deterministic
   * move recorded in one transaction, or refused — a move the phase's state does not allow, one without the reason a skip
   * or a reopen needs, or one made after the phases moved since the editor looked. It grants nothing else (WORK-011).
   */
  transitionProductionDocumentPhase(input: TransitionProductionDocumentPhaseInput): ProductionDocumentResultProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.documentId), 'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
    const row = this.#documentCall(() => this.#productionDocuments.documentById(input.bookId, input.documentId));
    requireStore(row !== undefined, 'PRODUCTION_DOCUMENT_NOT_FOUND', '这本书没有这份生产文档。');
    const recordedAt = new Date().toISOString();
    this.#documentCall(() => this.#transaction(this.#authority, () => this.#documentWorkflow.transition(input, recordedAt)));
    return this.#productionDocumentResult(input.bookId, row.typeId);
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
  inspectBookDeliveryPackage(bookId: string): BookDeliveryPackageProjection {
    return this.#packageCall(() => this.#bookDeliveryPackages.inspect(bookId));
  }

  /**
   * `准备图书交付包` (BUNDLE-003, BUNDLE-004): in one transaction, the content the editor saw — named by its digest — is
   * frozen with its purpose as the package's next version, or the newest version is that already. It chooses no
   * destination, writes no file and changes no other record.
   */
  prepareBookDeliveryPackage(input: PrepareBookDeliveryPackageInput): BookDeliveryPackageResultProjection {
    const outcome = this.#packageCall(() => this.#transaction(this.#authority, () => this.#bookDeliveryPackages.prepare(input)));
    return { bookId: input.bookId, outcome: outcome.outcome, version: outcome.version, package: this.inspectBookDeliveryPackage(input.bookId) };
  }

  /** `导出…` of one package version (Issue #416, S67b): the files it writes, each reviewed as S64 reviews a file. */
  async reviewBookDeliveryPackageExport(input: ReviewBookDeliveryPackageExportInput, available: boolean): Promise<BookDeliveryPackageExportReviewProjection> {
    return this.#packageExportCall(() => this.#packageExports.review(input, available));
  }

  /** The folder the system dialog returned: one preparation per file there, and the export that links them. */
  async prepareBookDeliveryPackageExport(input: PrepareBookDeliveryPackageExportInput, available: boolean): Promise<BookDeliveryPackageExportProjection> {
    return this.#packageExportCall(() => this.#packageExports.prepare(input, available));
  }

  /** `按上述方式导出`: each file approved and written in turn with its receipt, and the package as it stands. */
  async approveBookDeliveryPackageExport(input: ApproveBookDeliveryPackageExportInput, available: boolean): Promise<BookDeliveryPackageExportResultProjection> {
    const exported = await this.#packageExportCall(() => this.#packageExports.approve(input, available));
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
    return this.#exportCall(() => this.#manuscriptExport.review(input, available));
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
  inspectManuscriptExportReceipt(input: InspectManuscriptExportReceiptInput): ManuscriptExportReceiptProjection {
    this.#assertAvailable();
    try {
      return this.#manuscriptExport.receipt(input);
    } catch (error) {
      if (error instanceof ExportLedgerError || error instanceof AnalysisError) throw new StoreError(error.code, error.message);
      throw error;
    }
  }

  // ---- 稿件冲突 of a single 修改建议 (Issue #57, plan slice S22) ----------------------------------------

  /** The Three-way Proposal Conflict of one 修改建议, read against the working state as it is now. */
  inspectProposalConflict(input: ProposalConflictBindingInput): ProposalConflictProjection {
    return this.#conflictCall(() => this.#proposalConflicts.inspect(input));
  }

  /** Save the Resolution Draft on exactly the basis the editor saw; the manuscript is untouched. */
  saveProposalConflictDraft(input: SaveProposalConflictDraftInput): ProposalConflictDraftSaveProjection {
    return this.#conflictCall(() => this.#proposalConflicts.saveDraft(input));
  }

  /** 保留当前稿件, 暂不处理, or 保存为新提案版本 — none of which writes the manuscript. */
  resolveProposalConflict(input: ResolveProposalConflictInput): ProposalConflictResolutionProjection {
    return this.#conflictCall(() => this.#proposalConflicts.resolve(input));
  }

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
  inspectGlobalAttention(progress: ProgressReader, busy: boolean, waitingFor: WaitingFor = 'admitting', now: Date = new Date()): GlobalAttentionProjection {
    return this.#reviewCall(() => {
      const since = recentWindowStart(now);
      const limit = GLOBAL_ATTENTION_READ_LIMIT;
      try {
        const baseline = this.#baselineAnalysis.attentionReadings(progress, since, limit);
        const review = this.#reviewRuns.attentionReadings(progress, since, limit);
        return composeGlobalAttention({
          imports: readImportAttention(this.#authority, limit),
          recoveries: readRecoveryAttention(this.#authority, limit),
          conflicts: readConflictAttention(this.#authority, limit),
          analysisTasks: baseline.tasks,
          analysisOutcomes: baseline.outcomes,
          reviewRuns: review.latest,
          reviewCompletions: review.completed,
          maintenance: this.#maintenanceCases.attentionReadings(limit),
          libraryMaterials: this.#libraryMaterials.attentionReadings(limit),
          learningMaterials: this.#learningAttention(limit),
          busy,
          waitingFor,
        }, now);
      } catch (error) {
        if (error instanceof GlobalAttentionError || error instanceof MaintenanceCaseError || error instanceof LibraryMaterialError ||
            error instanceof LearningEligibilityError || error instanceof DecisionFeedbackError || error instanceof AnalysisFeedbackError) {
          throw new StoreError(error.code, error.message);
        }
        throw error;
      }
    });
  }

  /**
   * The Book's 任务 panel (Issue #423, plan slice S77a; editor-surfaces §1 任务面, V2-UX-TASK-044): 待我处理's readings of this
   * Book's Tasks alone — its latest baseline Task and Review Run, prepared ones included, and every finished one, the
   * cancelled included — composed into 等你处理, 进行中 and 最近完成 by `global-attention.ts`. A read: nothing is written,
   * claimed or terminalized.
   */
  inspectBookTasks(bookId: string, progress: ProgressReader, waitingFor: WaitingFor = 'admitting'): BookTasksProjection {
    this.#assertAvailable();
    requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    one(this.#authority.prepare('SELECT 1 FROM books WHERE book_id = ?').all(bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。');
    return this.#reviewCall(() => {
      const limit = GLOBAL_ATTENTION_READ_LIMIT;
      try {
        const baseline = this.#baselineAnalysis.attentionReadings(progress, '', limit, { bookId, cancelled: true });
        const review = this.#reviewRuns.attentionReadings(progress, '', limit, { bookId, prepared: true });
        return composeBookTasks({
          bookId,
          analysisTasks: baseline.tasks,
          analysisOutcomes: baseline.outcomes,
          reviewRuns: review.latest,
          reviewCompletions: review.completed,
          waitingFor,
        });
      } catch (error) {
        if (error instanceof GlobalAttentionError) throw new StoreError(error.code, error.message);
        throw error;
      }
    });
  }

  undoManuscript(manuscriptId: string, branchId: string, expectedWorkingDigest: string): DurableHistoryProjection {
    return this.#boundedCall(() => this.#bounded.undo(manuscriptId, branchId, expectedWorkingDigest, this.#lifetimeId));
  }

  redoManuscript(manuscriptId: string, branchId: string, expectedWorkingDigest: string): DurableHistoryProjection {
    return this.#boundedCall(() => this.#bounded.redo(manuscriptId, branchId, expectedWorkingDigest, this.#lifetimeId));
  }

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
      const ingested = await this.#parseIntoIngest(snapshot.draftId, converted?.path ?? objectPath, snapshot.displayName);
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
    options: { signal?: AbortSignal; onArchiveProgress?: (bytes: number) => void } = {},
  ): Promise<IngestedDocx> {
    requireStore(UUID_PATTERN.test(draftId), 'DRAFT_INVALID', '导入草稿标识无效。');
    const ingestId = randomUUID();
    let inserted = 0;
    let startOffset = 0;
    const blockSourceIndexes: number[] = [];
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
      const parsed = await parseDocx(path, displayName, (block: ParsedDocxBlock) => {
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
        blockSourceIndexes.push(block.sourceParagraphIndex);
        if (batch.length === INGEST_BATCH_SIZE) flushBatch();
      // The router already identified the file as a DOCX from its content, so the display name is
      // not asked to prove it: a DOCX under any other name is still a DOCX (ADR 0072 §1).
      }, undefined, { ...options, formatIdentified: true });
      flushBatch();
      requireStore(
        parsed.blockCount === inserted && parsed.characterCount === startOffset && inserted > 0,
        'SNAPSHOT_INCOMPLETE',
        '暂存解析未形成完整有界摄入。',
      );
      return { ingestId, parsed, sources: { blockSourceIndexes, textBoxes: parsed.textBoxes } };
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
  ): void {
    const { parsed } = ingested;
    this.#authority
      .prepare(
        `INSERT INTO staged_import_snapshots(
           draft_id, parser_identity, source_digest, content_digest, structure_digest, block_count,
           fidelity_json, title_suggestion, title_source, snapshot_created_at, character_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        draftId,
        parsed.parserIdentity,
        converted?.sourceDigest ?? parsed.sourceDigest,
        parsed.contentDigest,
        parsed.structureDigest,
        parsed.blockCount,
        canonicalJson(converted?.fidelity ?? parsed.fidelity),
        parsed.titleSuggestion.value,
        parsed.titleSuggestion.sourceLabel,
        createdAt,
        parsed.characterCount,
      );
    const inserted = this.#authority.prepare(
      `INSERT INTO staged_import_blocks(
         draft_id, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
       ) SELECT ?, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
         FROM import_ingest_blocks WHERE ingest_id = ? AND draft_id = ? ORDER BY position`,
    ).run(draftId, ingested.ingestId, draftId);
    requireStore(inserted.changes === parsed.blockCount, 'SNAPSHOT_INCOMPLETE', '暂存摄入无法完整提升为权威快照。');
    requireStore(ingested.sources.blockSourceIndexes.length === parsed.blockCount, 'SNAPSHOT_INCOMPLETE', '暂存摄入的来源段落不完整。');
    this.#retentionCall(() => stageImportSources(this.#authority, draftId, ingested.sources));
    // The file's comments and tracked changes, pinned in the blocks just staged (Issue #411).
    this.#importedMarkCall(() => stageImportedMarks(this.#authority, draftId, parsed.importedMarks));
    const removed = this.#authority
      .prepare('DELETE FROM import_ingest_blocks WHERE ingest_id = ? AND draft_id = ?')
      .run(ingested.ingestId, draftId);
    requireStore(removed.changes === parsed.blockCount, 'SNAPSHOT_INCOMPLETE', '暂存摄入无法完成原子清理。');
  }

  /**
   * The block rows of a fresh parse against the staged ones, and its sources and imported marks against the
   * staged sources and marks.
   */
  #ingestMatchesSnapshot(ingested: IngestedDocx, draftId: string): boolean {
    return this.#ingestBlocksMatchSnapshot(ingested.ingestId, draftId) &&
      this.#retentionCall(() => stagedImportSourcesMatch(this.#authority, draftId, ingested.sources)) &&
      this.#importedMarkCall(() => stagedImportedMarksMatch(this.#authority, draftId, ingested.parsed.importedMarks));
  }

  #ingestBlocksMatchSnapshot(ingestId: string, draftId: string): boolean {
    const difference = this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM (
           SELECT staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM import_ingest_blocks WHERE ingest_id = ? AND draft_id = ?
           EXCEPT
           SELECT staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM staged_import_blocks WHERE draft_id = ?
         )) +
         (SELECT count(*) FROM (
           SELECT staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM staged_import_blocks WHERE draft_id = ?
           EXCEPT
           SELECT staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
           FROM import_ingest_blocks WHERE ingest_id = ? AND draft_id = ?
         )) total`,
    ).get(ingestId, draftId, draftId, draftId, ingestId, draftId) as SqlRow | undefined;
    return difference !== undefined && asNumber(difference.total) === 0;
  }

  #contentObjectPath(objectDigest: string, relativeKey: string): string {
    requireStore(/^[0-9a-f]{64}$/.test(objectDigest), 'OBJECT_PATH_INVALID', '对象摘要无效。');
    // The retained original keeps the extension of the format it was identified as, so the key is
    // checked against every admitted one rather than against DOCX alone (ADR 0072 §2).
    const expectedKeys = SOURCE_FORMATS.map((format) =>
      posix.join('sha256', objectDigest.slice(0, 2), `${objectDigest}${manuscriptObjectExtension(format)}`));
    requireStore(expectedKeys.includes(relativeKey), 'OBJECT_PATH_INVALID', '对象相对路径无效。');
    const path = resolve(this.#objectsRoot, ...relativeKey.split('/'));
    requireStore(isInside(this.#objectsRoot, path), 'OBJECT_PATH_INVALID', '对象路径越界。');
    return path;
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

  #stagedProjection(snapshot: DraftSnapshot): StagedImportProjection {
    const identityFindings = this.#identityFindings(snapshot);
    const targetChoice = newBookTargetChoice(identityFindings);
    const bookPage = this.listBooks(null);
    const existingBooks = bookPage.items.map((book) => {
      return {
        kind: 'existing-book' as const,
        id: `existing-book:${book.bookId}`,
        bookId: book.bookId,
        label: exactBookChoiceLabel(book.title, book.bookId, book.internalNumber),
        internalNumber: book.internalNumber,
        manuscriptState: book.manuscriptState,
        reimportLineageSourceVersionIds: book.reimportLineageSourceVersionIds,
        reimportLineagePageAfter: null,
        reimportLineagePreviousCursor: null,
        reimportLineageNextCursor: book.reimportLineageNextCursor,
        selected: false as const,
      };
    });
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      source: {
        displayName: snapshot.displayName,
        format: snapshot.sourceFormat,
        sourceSha256: snapshot.sourceDigest,
        sourceBytes: snapshot.sourceBytes,
        provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
        conversion: snapshot.conversion,
        workingObjectSha256: snapshot.workingObjectDigest,
      },
      editableImport: editableImport(snapshot.sourceFormat),
      titleSuggestion: { value: snapshot.titleSuggestion, sourceLabel: snapshot.titleSource },
      identityFindings,
      targetChoices: [targetChoice, ...existingBooks],
      nextBookCursor: bookPage.nextCursor,
      fidelity: snapshot.fidelity,
      detectedBlockCount: snapshot.blockCount,
    };
  }

  #emptyBookImportTarget(bookId: string): {
    bookId: string;
    stableIdentity: string;
    title: string;
    internalNumber: string | null;
    dimensionSetId: string;
    label: string;
    bookStateDigest: string;
  } {
    const overview = this.getBookOverview(bookId);
    requireStore(overview.manuscriptState.state === 'empty', 'BOOK_ALREADY_POPULATED', '所选图书已有稿件，不能导入首份稿件。');
    const bookRecord = overview.records[0];
    requireStore(bookRecord?.kind === 'book', 'BOOK_RECORD_GRAPH_INVALID', '所选图书记录不完整。');
    const bookStateDigest = sha256(canonicalJson({
      schema: 'ai7.empty-book-import-target/1',
      book: overview.book,
      dimensionSet: {
        dimensionSetId: bookRecord.dimensionSetId,
        definitionDigest: bookRecord.dimensionSetDigest,
        profileId: BASELINE_EDITORIAL_DIMENSION_SET.profileId,
        profileVersion: BASELINE_EDITORIAL_DIMENSION_SET.profileVersion,
        weightSemantics: BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics,
        dimensions: EDITORIAL_DIMENSIONS,
      },
      manuscriptState: 'empty',
    }));
    return {
      bookId,
      stableIdentity: overview.book.stableIdentity,
      title: overview.book.title,
      internalNumber: overview.book.internalNumber,
      dimensionSetId: bookRecord.dimensionSetId,
      label: exactBookChoiceLabel(overview.book.title, bookId, overview.book.internalNumber),
      bookStateDigest,
    };
  }

  #bookSourceImportTarget(bookId: string, sourceDigest: string): Omit<
    Extract<ResolvedSourceImportTarget, { kind: 'existing-book' }>,
    'choiceId' | 'sourceVersionDisposition' | 'reuseSourceVersionId'
  > & { exactSourceVersionId: string | null } {
    const overview = this.getBookOverview(bookId);
    const bookRecord = overview.records[0];
    requireStore(bookRecord?.kind === 'book', 'BOOK_RECORD_GRAPH_INVALID', '所选图书记录不完整。');
    const matches = this.#authority.prepare(
      `SELECT source_version_id
       FROM source_versions
       WHERE book_id = ? AND source_digest = ?
       ORDER BY source_version_id`,
    ).all(bookId, sourceDigest) as SqlRow[];
    requireStore(matches.length <= 1, 'BOOK_RECORD_GRAPH_INVALID', '所选图书的来源版本身份不唯一。');
    const bookStateDigest = sha256(canonicalJson({
      schema: 'ai7.source-import-target-book-state/1',
      overview,
      dimensionSet: {
        dimensionSetId: bookRecord.dimensionSetId,
        definitionDigest: bookRecord.dimensionSetDigest,
        profileId: BASELINE_EDITORIAL_DIMENSION_SET.profileId,
        profileVersion: BASELINE_EDITORIAL_DIMENSION_SET.profileVersion,
        weightSemantics: BASELINE_EDITORIAL_DIMENSION_SET.weightSemantics,
        dimensions: EDITORIAL_DIMENSIONS,
      },
    }));
    return {
      kind: 'existing-book',
      bookId,
      stableIdentity: overview.book.stableIdentity,
      title: overview.book.title,
      internalNumber: overview.book.internalNumber,
      dimensionSetId: bookRecord.dimensionSetId,
      label: exactBookChoiceLabel(overview.book.title, bookId, overview.book.internalNumber),
      bookStateDigest,
      exactSourceVersionId: matches.length === 0 ? null : asString(matches[0]!.source_version_id),
    };
  }

  #reimportManuscriptBinding(bookId: string): { manuscriptId: string; branchId: string } {
    requireStore(UUID_PATTERN.test(bookId), 'TARGET_CHOICE_INVALID', '稿件重新导入目标无效。');
    const rows = this.#authority.prepare(
      `SELECT m.manuscript_id, mb.branch_id
       FROM manuscripts m
       JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
       WHERE m.book_id = ? AND m.role = 'primary'
       ORDER BY m.manuscript_id, mb.branch_id`,
    ).all(bookId) as SqlRow[];
    requireStore(rows.length === 1, 'REIMPORT_TARGET_INVALID', '所选图书必须有且仅有一份主稿件及其现行分支。');
    return { manuscriptId: asString(rows[0]!.manuscript_id), branchId: asString(rows[0]!.branch_id) };
  }

  #populatedBookReimportTarget(
    bookId: string,
    sourceDigest: string,
    checkpoint: ReimportCheckpointBinding,
    preparedCheckpoint = false,
  ): Omit<ResolvedReimportTarget, 'sourceVersionDisposition' | 'reuseSourceVersionId' | 'lineage'> & {
    exactSourceVersionId: string | null;
  } {
    const overview = this.getBookOverview(bookId);
    requireStore(overview.manuscriptState.state === 'populated', 'REIMPORT_TARGET_INVALID', '所选图书尚无可重新导入的主稿件。');
    const binding = this.#reimportManuscriptBinding(bookId);
    requireStore(
      binding.manuscriptId === checkpoint.manuscriptId && binding.branchId === checkpoint.branchId &&
        checkpoint.bookId === bookId,
      'REIMPORT_TARGET_CHANGED',
      '所选图书的主稿件或分支已变化。',
    );
    const current = one(this.#authority.prepare(
      `SELECT base_revision_id, journal_sequence, working_digest
       FROM branch_working_state WHERE manuscript_id = ? AND branch_id = ?`,
    ).all(binding.manuscriptId, binding.branchId) as SqlRow[], 'REIMPORT_TARGET_INVALID', '主稿件工作状态缺失。');
    requireStore(
      (preparedCheckpoint || asString(current.base_revision_id) === checkpoint.revisionId) &&
        asNumber(current.journal_sequence) === checkpoint.journalSequence &&
        asString(current.working_digest) === checkpoint.revisionDigest,
      'REIMPORT_TARGET_CHANGED',
      '主稿件在重新导入复核期间已变化。',
    );
    const matches = this.#authority.prepare(
      'SELECT source_version_id FROM source_versions WHERE book_id = ? AND source_digest = ? ORDER BY source_version_id',
    ).all(bookId, sourceDigest) as SqlRow[];
    requireStore(matches.length <= 1, 'BOOK_RECORD_GRAPH_INVALID', '所选图书的精确来源版本身份不唯一。');
    const bookStateDigest = sha256(canonicalJson({
      schema: 'ai7.manuscript-reimport-target/1',
      book: overview.book,
      manuscriptId: binding.manuscriptId,
      branchId: binding.branchId,
      checkpoint,
    }));
    return {
      kind: 'existing-book',
      choiceId: `existing-book:${bookId}`,
      bookId,
      stableIdentity: overview.book.stableIdentity,
      title: overview.book.title,
      internalNumber: overview.book.internalNumber,
      label: exactBookChoiceLabel(overview.book.title, bookId, overview.book.internalNumber),
      manuscriptId: binding.manuscriptId,
      branchId: binding.branchId,
      bookStateDigest,
      checkpoint,
      exactSourceVersionId: matches.length === 0 ? null : asString(matches[0]!.source_version_id),
    };
  }

  /**
   * The same file again onto the Source Version a Book already holds for it is a reuse, and a Source Version keeps the
   * reading its parser made (Issue #532). One an earlier parser read — a Book imported before this build's parser — cannot
   * take the file again under this one: the refusal names the parser change at the choice, not at the commit, and never
   * blames the file. Development stores before the first packaged release are disposable (ADR 0079 §1b).
   */
  #requireSameParser(sourceVersionId: string, snapshot: DraftSnapshot): void {
    const row = one(
      this.#authority.prepare('SELECT parser_identity FROM source_versions WHERE source_version_id = ?').all(sourceVersionId) as SqlRow[],
      'SOURCE_VERSION_REUSE_INVALID',
      '明确选择的来源版本不存在。',
    );
    requireStore(nullableString(row.parser_identity) === snapshot.parserIdentity, 'SOURCE_VERSION_PARSER_CHANGED', SOURCE_VERSION_PARSER_CHANGED_MESSAGE);
  }

  #resolveReimportTarget(
    selection: ManuscriptReimportTargetSelection,
    snapshot: DraftSnapshot,
    checkpoint: ReimportCheckpointBinding,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
    preparedCheckpoint = false,
  ): ResolvedReimportTarget {
    requireStore(
      selection.kind === 'existing-book' && UUID_PATTERN.test(selection.bookId) && selection.relationship === 'reimport' &&
        (selection.reuseSourceVersionId === null || UUID_PATTERN.test(selection.reuseSourceVersionId)),
      'TARGET_CHOICE_INVALID',
      '稿件重新导入目标、关系或来源版本选择无效。',
    );
    const current = this.#populatedBookReimportTarget(
      selection.bookId, snapshot.sourceDigest, checkpoint, preparedCheckpoint);
    if (current.exactSourceVersionId === null) {
      requireStore(selection.reuseSourceVersionId === null, 'SOURCE_VERSION_REUSE_INVALID', '所选来源版本不能在该图书中复用。');
    } else {
      requireStore(
        selection.reuseSourceVersionId === current.exactSourceVersionId && identityFindings.some((finding) =>
          finding.bookId === current.bookId && finding.sourceVersionId === current.exactSourceVersionId &&
          finding.identityClass.kind === 'immutable-original'),
        'SOURCE_VERSION_REUSE_REQUIRED',
        '同图书已有精确来源版本；必须明确选择后才能复用。',
      );
      this.#requireSameParser(current.exactSourceVersionId, snapshot);
    }
    let lineage: ResolvedReimportTarget['lineage'];
    if (selection.lineage.kind === 'unconfirmed') {
      lineage = { status: 'unconfirmed', sourceVersionId: null, revisionId: null, comparisonKind: 'two-way' };
    } else {
      const lineageSourceVersionId = selection.lineage.sourceVersionId;
      requireStore(UUID_PATTERN.test(lineageSourceVersionId), 'REIMPORT_LINEAGE_INVALID', '来源关系选择无效。');
      const revisionId = this.#verifiedReimportLineageRevision(
        current.bookId, current.manuscriptId, lineageSourceVersionId,
      );
      requireStore(revisionId !== null,
        'REIMPORT_LINEAGE_UNVERIFIED', '所选来源版本没有主稿件修订版血缘证明。');
      lineage = {
        status: 'verified',
        sourceVersionId: lineageSourceVersionId,
        revisionId,
        comparisonKind: 'three-way',
      };
    }
    const { exactSourceVersionId, ...target } = current;
    return {
      ...target,
      sourceVersionDisposition: exactSourceVersionId === null ? 'created' : 'reused-same-book',
      reuseSourceVersionId: exactSourceVersionId,
      lineage,
    };
  }

  #verifiedReimportLineageRevision(bookId: string, manuscriptId: string, sourceVersionId: string): string | null {
    const revision = this.#authority.prepare(
      `SELECT revision_id
       FROM (
         SELECT mir.resulting_revision_id revision_id, mir.imported_at, mir.import_record_id record_id
         FROM manuscript_import_records mir
         WHERE mir.book_id = ? AND mir.manuscript_id = ? AND mir.source_version_id = ?
         UNION ALL
         SELECT CASE rr.result_kind WHEN 'changed' THEN rr.resulting_revision_id ELSE rr.previous_revision_id END revision_id,
                rr.imported_at, rr.reimport_record_id record_id
         FROM manuscript_reimport_records rr
         WHERE rr.book_id = ? AND rr.manuscript_id = ? AND rr.source_version_id = ?
           AND ((rr.result_kind = 'changed' AND rr.resulting_revision_id IS NOT NULL) OR rr.result_kind = 'no-change')
       ) ORDER BY imported_at DESC, record_id DESC LIMIT 1`,
    ).get(bookId, manuscriptId, sourceVersionId, bookId, manuscriptId, sourceVersionId) as SqlRow | undefined;
    return revision === undefined || revision.revision_id === null ? null : asString(revision.revision_id);
  }

  #reimportBlockFact(row: SqlRow, prefix: 'current' | 'lineage' | 'staged'): ReimportBlockFact | null {
    const blockId = row[`${prefix}_block_id`];
    if (blockId === null) return null;
    return {
      blockId: asString(blockId),
      position: asNumber(row[`${prefix}_position`]),
      kind: asString(row[`${prefix}_kind`]) as ManuscriptBlockProjection['kind'],
      level: row[`${prefix}_level`] === null ? null : asNumber(row[`${prefix}_level`]),
      text: asString(row[`${prefix}_text`]),
      digest: asString(row[`${prefix}_digest`]),
    };
  }

  *#reimportMappingBatches(
    workId: string,
    draftId: string,
    target: ResolvedReimportTarget,
    checkpointWorkId: string | null = null,
  ): Generator<ReimportMappingBatch> {
    const checkpointTable = checkpointWorkId === null
      ? 'manuscript_block_versions'
      : 'temp.manuscript_checkpoint_rows';
    const checkpointScopeColumn = checkpointWorkId === null ? 'revision_id' : 'work_id';
    const checkpointScopeId = checkpointWorkId ?? target.checkpoint.revisionId;
    const stagedCount = asNumber(one(this.#authority.prepare(
      'SELECT block_count FROM staged_import_snapshots WHERE draft_id = ?',
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '无法核对暂存块数量。').block_count);
    let after = 0;
    for (;;) {
      const rows = this.#authority.prepare(
        `SELECT sb.staged_block_id, sb.position staged_position, sb.kind staged_kind,
                sb.level staged_level, sb.text staged_text, sb.digest staged_digest,
                COALESCE(co.single_block_id, lc.block_id) current_block_id,
                COALESCE(co.single_position, lc.position) current_position,
                COALESCE(co.kind, lc.kind) current_kind,
                CASE WHEN co.source_kind IS NULL THEN lc.level
                     WHEN co.level_key = -1 THEN NULL ELSE co.level_key END current_level,
                COALESCE(co.text, lc.text) current_text,
                COALESCE(co.digest, lc.digest) current_digest,
                COALESCE(lo.single_block_id, li.block_id) lineage_block_id,
                COALESCE(lo.single_position, li.position) lineage_position,
                COALESCE(lo.kind, li.kind) lineage_kind,
                CASE WHEN lo.source_kind IS NULL THEN li.level
                     WHEN lo.level_key = -1 THEN NULL ELSE lo.level_key END lineage_level,
                COALESCE(lo.text, li.text) lineage_text,
                COALESCE(lo.digest, li.digest) lineage_digest,
                co.single_block_id exact_current_block_id,
                lo.single_block_id exact_lineage_block_id
         FROM staged_import_blocks sb
         LEFT JOIN temp.reimport_preparation_occurrences so
           ON so.work_id = ? AND so.source_kind = 'staged' AND so.occurrences = 1
          AND so.kind = sb.kind AND so.level_key = COALESCE(sb.level, -1)
          AND so.digest = sb.digest AND so.text = sb.text
         LEFT JOIN temp.reimport_preparation_occurrences co
           ON so.work_id IS NOT NULL AND co.work_id = ? AND co.source_kind = 'current' AND co.occurrences = 1
          AND co.kind = sb.kind AND co.level_key = COALESCE(sb.level, -1)
          AND co.digest = sb.digest AND co.text = sb.text
         LEFT JOIN temp.reimport_preparation_occurrences lo
           ON so.work_id IS NOT NULL AND lo.work_id = ? AND lo.source_kind = 'lineage' AND lo.occurrences = 1
          AND lo.kind = sb.kind AND lo.level_key = COALESCE(sb.level, -1)
          AND lo.digest = sb.digest AND lo.text = sb.text
         LEFT JOIN ${checkpointTable} lc
           ON lc.${checkpointScopeColumn} = ? AND lc.block_id = lo.single_block_id
         LEFT JOIN manuscript_block_versions li
           ON li.revision_id = ? AND li.block_id = co.single_block_id
         WHERE sb.draft_id = ? AND sb.position > ?
         ORDER BY sb.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(
        workId,
        workId,
        workId,
        checkpointScopeId,
        target.lineage.revisionId,
        draftId,
        after,
      ) as SqlRow[];
      if (rows.length === 0) break;
      const batch: ReimportMappingFact[] = [];
      for (const row of rows) {
        const current = this.#reimportBlockFact(row, 'current');
        const staged = this.#reimportBlockFact(row, 'staged')!;
        const lineage = this.#reimportBlockFact(row, 'lineage');
        const position = staged.position;
        const exactCurrentId = row.exact_current_block_id === null ? null : asString(row.exact_current_block_id);
        const exactLineageId = row.exact_lineage_block_id === null ? null : asString(row.exact_lineage_block_id);
        const autoPreserve = exactCurrentId !== null &&
          (exactLineageId === null || exactLineageId === exactCurrentId);
        batch.push({
          mappingId: stableUuid(`ai7.reimport-mapping/2\u0000${draftId}\u0000${position}`),
          position,
          changeKind: autoPreserve
            ? current!.position === staged.position ? 'unchanged' : 'move'
            : current === null ? 'insert' : 'edit',
          current,
          lineage,
          staged,
          identityConsequence: autoPreserve ? 'preserve-current-identity' : null,
        });
        after = staged.position;
      }
      yield { mappings: batch, scanned: rows.length };
    }

    after = 0;
    let deleted = 0;
    for (;;) {
      const rows = this.#authority.prepare(
        `SELECT cb.block_id current_block_id, cb.position current_position, cb.kind current_kind,
                cb.level current_level, cb.text current_text, cb.digest current_digest,
                lb.block_id lineage_block_id, lb.position lineage_position, lb.kind lineage_kind,
                lb.level lineage_level, lb.text lineage_text, lb.digest lineage_digest,
                NULL staged_block_id,
                CASE WHEN cu.occurrences = 1 AND su.occurrences = 1 THEN 1
                     WHEN lu.occurrences = 1 AND sl.occurrences = 1 THEN 1
                     ELSE 0 END matched
         FROM ${checkpointTable} cb
         LEFT JOIN manuscript_block_versions lb
           ON lb.revision_id = ? AND lb.block_id = cb.block_id
         LEFT JOIN temp.reimport_preparation_occurrences cu
           ON cu.work_id = ? AND cu.source_kind = 'current'
          AND cu.kind = cb.kind AND cu.level_key = COALESCE(cb.level, -1)
          AND cu.digest = cb.digest AND cu.text = cb.text
         LEFT JOIN temp.reimport_preparation_occurrences su
           ON su.work_id = ? AND su.source_kind = 'staged'
          AND su.kind = cb.kind AND su.level_key = COALESCE(cb.level, -1)
          AND su.digest = cb.digest AND su.text = cb.text
         LEFT JOIN temp.reimport_preparation_occurrences lu
           ON lu.work_id = ? AND lu.source_kind = 'lineage'
          AND lu.kind = lb.kind AND lu.level_key = COALESCE(lb.level, -1)
          AND lu.digest = lb.digest AND lu.text = lb.text
         LEFT JOIN temp.reimport_preparation_occurrences sl
           ON sl.work_id = ? AND sl.source_kind = 'staged'
          AND sl.kind = lb.kind AND sl.level_key = COALESCE(lb.level, -1)
          AND sl.digest = lb.digest AND sl.text = lb.text
         WHERE cb.${checkpointScopeColumn} = ? AND cb.position > ?
         ORDER BY cb.position LIMIT ${REIMPORT_MAPPING_BATCH_SIZE}`,
      ).all(
        target.lineage.revisionId,
        workId,
        workId,
        workId,
        workId,
        checkpointScopeId,
        after,
      ) as SqlRow[];
      if (rows.length === 0) break;
      const batch: ReimportMappingFact[] = [];
      for (const row of rows) {
        const current = this.#reimportBlockFact(row, 'current')!;
        after = current.position;
        if (asNumber(row.matched) === 1) continue;
        const position = stagedCount + (++deleted);
        batch.push({
          mappingId: stableUuid(`ai7.reimport-mapping/2\u0000${draftId}\u0000${position}`),
          position,
          changeKind: 'delete',
          current,
          lineage: this.#reimportBlockFact(row, 'lineage'),
          staged: null,
          identityConsequence: null,
        });
      }
      yield { mappings: batch, scanned: rows.length };
    }
  }

  #resolveSourceImportTarget(
    selection: SourceImportTargetSelection,
    snapshot: DraftSnapshot,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedSourceImportTarget {
    if (selection.kind === 'new-book') {
      requireStore(selection.relationship === 'source-only', 'TARGET_CHOICE_INVALID', '来源导入关系选择无效。');
      const targetChoice = newBookTargetChoice(identityFindings);
      requireStore(selection.choiceId === targetChoice.id, 'TARGET_CHOICE_CHANGED', '导入目标选择已变化，请重新选择。');
      const bookId = stableUuid(`ai7.source-bound-book/1\u0000${snapshot.draftId}`);
      return {
        kind: 'new-book',
        choiceId: selection.choiceId,
        confirmedTitle: safeTitle(selection.confirmedTitle),
        label: targetChoice.label,
        bookId,
        stableIdentity: `book:${bookId}`,
        sourceVersionDisposition: 'created',
        reuseSourceVersionId: null,
      };
    }
    requireStore(
      UUID_PATTERN.test(selection.bookId) && selection.relationship === 'source-only' &&
        (selection.reuseSourceVersionId === null || UUID_PATTERN.test(selection.reuseSourceVersionId)),
      'TARGET_CHOICE_INVALID',
      '来源导入目标、关系或来源版本选择无效。',
    );
    const target = this.#bookSourceImportTarget(selection.bookId, snapshot.sourceDigest);
    if (target.exactSourceVersionId !== null) {
      requireStore(
        selection.reuseSourceVersionId === target.exactSourceVersionId && identityFindings.some((finding) =>
          finding.bookId === target.bookId && finding.sourceVersionId === target.exactSourceVersionId &&
          finding.identityClass.kind === 'immutable-original'),
        'SOURCE_VERSION_REUSE_REQUIRED',
        '同图书已有精确来源版本；必须明确选择后才能复用。',
      );
      this.#requireSameParser(target.exactSourceVersionId, snapshot);
    } else {
      requireStore(selection.reuseSourceVersionId === null, 'SOURCE_VERSION_REUSE_INVALID', '所选来源版本不能在该图书中复用。');
    }
    const { exactSourceVersionId, ...resolved } = target;
    return {
      ...resolved,
      choiceId: `existing-book:${target.bookId}`,
      sourceVersionDisposition: exactSourceVersionId === null ? 'created' : 'reused-same-book',
      reuseSourceVersionId: exactSourceVersionId,
    };
  }

  #reconstructReviewedSourceImportTarget(
    snapshot: DraftSnapshot,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedSourceImportTarget | null {
    if (snapshot.reviewDigest === null || snapshot.reviewedRelationship !== 'source-only') return null;
    let target: ResolvedSourceImportTarget;
    try {
      if (snapshot.reviewedTargetKind === 'new-book') {
        if (snapshot.reviewedTitle === null || snapshot.reviewedTargetChoiceId === null) return null;
        target = this.#resolveSourceImportTarget({
          kind: 'new-book',
          choiceId: snapshot.reviewedTargetChoiceId,
          confirmedTitle: snapshot.reviewedTitle,
          relationship: 'source-only',
        }, snapshot, identityFindings);
      } else if (snapshot.reviewedTargetKind === 'existing-book') {
        if (snapshot.reviewedExistingBookId === null || snapshot.reviewedBookStateDigest === null) return null;
        target = this.#resolveSourceImportTarget({
          kind: 'existing-book',
          bookId: snapshot.reviewedExistingBookId,
          relationship: 'source-only',
          reuseSourceVersionId: snapshot.reviewedReuseSourceVersionId,
        }, snapshot, identityFindings);
        if (target.kind !== 'existing-book' || target.bookStateDigest !== snapshot.reviewedBookStateDigest) return null;
      } else {
        return null;
      }
    } catch {
      return null;
    }
    return createSourceImportReviewDigest(snapshot, target, identityFindings) === snapshot.reviewDigest ? target : null;
  }

  #sourceImportReviewProjection(
    snapshot: DraftSnapshot,
    target: ResolvedSourceImportTarget,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
    commitAttemptId: string | null,
  ): ReviewBeforeSourceImportProjection {
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest: snapshot.reviewDigest ?? createSourceImportReviewDigest(snapshot, target, identityFindings),
      commitAttemptId,
      target: target.kind === 'new-book'
        ? {
            choiceId: target.choiceId,
            kind: 'new-book',
            label: target.label,
            confirmedTitle: target.confirmedTitle,
            bookId: target.bookId,
            stableIdentity: target.stableIdentity,
            relationship: 'source-only',
            relationshipLabel: '作为来源材料导入',
          }
        : {
            choiceId: target.choiceId,
            kind: 'existing-book',
            label: target.label,
            bookId: target.bookId,
            stableIdentity: target.stableIdentity,
            internalNumber: target.internalNumber,
            relationship: 'source-only',
            relationshipLabel: '作为来源材料导入',
            bookStateDigest: target.bookStateDigest,
          },
      source: this.#stagedProjection(snapshot).source,
      identityFindings,
      retainedBoundary: sourceImportRetainedBoundary(snapshot),
      provenance: {
        acquisitionPath: 'native-file-picker',
        locality: 'local-provider-free',
        label: '本机文件选择器 · 本地解析 · 未联网',
        acquiredAt: snapshot.stagedAt,
      },
      sourceVersionResult: target.sourceVersionDisposition === 'created'
        ? { disposition: 'created', label: '创建所选图书拥有的新来源版本', sourceVersionId: null }
        : {
            disposition: 'reused-same-book',
            label: '复用已明确选择的同图书来源版本',
            sourceVersionId: target.reuseSourceVersionId!,
          },
      recordsToCreate: sourceImportRecordsToCreate(target),
      namedNonEffects: SOURCE_IMPORT_NON_EFFECTS,
      editorialDimensionSet: {
        createdWithBook: target.kind === 'new-book',
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
    };
  }

  #reimportEvidence(draftId: string): {
    comparisonDigest: string;
    resolutionDigest: string;
    totalMappings: number;
    unresolvedMappings: number;
    changed: boolean;
    groups: number;
    unresolvedGroups: number;
    exactBlocks: number;
  } {
    const comparison = one(this.#authority.prepare(
      `SELECT comparison_digest, resolution_digest, total_mappings, unresolved_mappings,
              changed_mappings, staged_block_count, checkpoint_block_count
       FROM manuscript_reimport_comparisons WHERE draft_id = ?`,
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    const totalMappings = asNumber(comparison.total_mappings);
    const unresolvedMappings = asNumber(comparison.unresolved_mappings);
    requireStore(totalMappings > 0 && unresolvedMappings <= totalMappings,
      'REIMPORT_COMPARISON_INVALID', '重新导入比较聚合状态无效。');
    return {
      comparisonDigest: asString(comparison.comparison_digest),
      resolutionDigest: asString(comparison.resolution_digest),
      totalMappings,
      unresolvedMappings,
      changed: asNumber(comparison.changed_mappings) > 0 ||
        asNumber(comparison.staged_block_count) !== asNumber(comparison.checkpoint_block_count),
      ...this.#reimportGroupCounts(draftId),
    };
  }

  /** The chapter-level rows of a comparison: how many, how many are unresolved, and how many blocks matched exactly. */
  #reimportGroupCounts(draftId: string): { groups: number; unresolvedGroups: number; exactBlocks: number } {
    const counts = one(this.#authority.prepare(
      `SELECT gs.group_count, gs.anchor_count,
              (SELECT count(*) FROM manuscript_reimport_groups g
               LEFT JOIN manuscript_reimport_group_resolutions r ON r.group_id = g.group_id
               WHERE g.comparison_id = c.comparison_id AND r.group_id IS NULL) unresolved
       FROM manuscript_reimport_comparisons c
       JOIN manuscript_reimport_group_sets gs ON gs.comparison_id = c.comparison_id
       WHERE c.draft_id = ?`,
    ).all(draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较没有章节对应。');
    return { groups: asNumber(counts.group_count), unresolvedGroups: asNumber(counts.unresolved), exactBlocks: asNumber(counts.anchor_count) };
  }

  #reconstructReviewedReimportTarget(snapshot: DraftSnapshot): ResolvedReimportTarget | null {
    if (snapshot.reviewDigest === null || snapshot.reviewedRelationship !== 'reimport' ||
      snapshot.reviewedExistingBookId === null || snapshot.reviewedBookStateDigest === null ||
      snapshot.reviewedLineageStatus === null || snapshot.reviewedCheckpointRevisionId === null ||
      snapshot.reviewedManuscriptId === null || snapshot.reviewedBranchId === null) return null;
    try {
      const comparison = one(this.#authority.prepare(
        `SELECT lineage_status, lineage_source_version_id, lineage_revision_id, lineage_revision_digest,
                comparison_kind, checkpoint_revision_digest, checkpoint_created_for_dirty_journal,
                staged_source_digest, staged_content_digest, staged_structure_digest,
                staged_parser_identity, staged_block_count, degradation_accepted
         FROM manuscript_reimport_comparisons WHERE draft_id = ?`,
      ).all(snapshot.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
      const revision = one(this.#authority.prepare(
        `SELECT revision_label, revision_digest
         FROM manuscript_revisions WHERE revision_id = ? AND manuscript_id = ? AND branch_id = ?`,
      ).all(
        snapshot.reviewedCheckpointRevisionId,
        snapshot.reviewedManuscriptId,
        snapshot.reviewedBranchId,
      ) as SqlRow[], 'REIMPORT_CHECKPOINT_INVALID', '重新导入安全固定点不存在。');
      const state = one(this.#authority.prepare(
        `SELECT journal_sequence, working_digest, base_revision_id
         FROM branch_working_state WHERE manuscript_id = ? AND branch_id = ?`,
      ).all(snapshot.reviewedManuscriptId, snapshot.reviewedBranchId) as SqlRow[],
      'REIMPORT_CHECKPOINT_INVALID', '重新导入主稿件状态不存在。');
      if (asString(state.base_revision_id) !== snapshot.reviewedCheckpointRevisionId ||
        asString(state.working_digest) !== asString(revision.revision_digest) ||
        asString(comparison.checkpoint_revision_digest) !== asString(revision.revision_digest) ||
        asString(comparison.staged_source_digest) !== snapshot.sourceDigest ||
        asString(comparison.staged_content_digest) !== snapshot.contentDigest ||
        asString(comparison.staged_structure_digest) !== snapshot.structureDigest ||
        asString(comparison.staged_parser_identity) !== snapshot.parserIdentity ||
        asNumber(comparison.staged_block_count) !== snapshot.blockCount) return null;
      const checkpoint: ReimportCheckpointBinding = {
        bookId: snapshot.reviewedExistingBookId,
        manuscriptId: snapshot.reviewedManuscriptId,
        branchId: snapshot.reviewedBranchId,
        revisionId: snapshot.reviewedCheckpointRevisionId,
        revisionLabel: asString(revision.revision_label),
        revisionDigest: asString(revision.revision_digest),
        journalSequence: asNumber(state.journal_sequence),
        createdForDirtyJournal: asNumber(comparison.checkpoint_created_for_dirty_journal) === 1,
      };
      const current = this.#populatedBookReimportTarget(snapshot.reviewedExistingBookId, snapshot.sourceDigest, checkpoint);
      if (current.bookStateDigest !== snapshot.reviewedBookStateDigest ||
        current.manuscriptId !== snapshot.reviewedManuscriptId || current.branchId !== snapshot.reviewedBranchId ||
        current.exactSourceVersionId !== snapshot.reviewedReuseSourceVersionId) return null;
      // The Source Version it reuses must have been read the way this draft is (Issue #532). A review made before an update
      // that changed the parser is caught earlier, by `#revalidateSnapshot`'s parser drift; this catches a review an earlier
      // build prepared under this same parser over a Source Version an earlier parser read. It does not come back ready, and
      // preparing it again says why.
      if (current.exactSourceVersionId !== null) this.#requireSameParser(current.exactSourceVersionId, snapshot);
      const lineage = comparison.lineage_status === 'verified'
        ? {
            status: 'verified' as const,
            sourceVersionId: asString(comparison.lineage_source_version_id),
            revisionId: asString(comparison.lineage_revision_id),
            comparisonKind: 'three-way' as const,
          }
        : {
            status: 'unconfirmed' as const,
            sourceVersionId: null,
            revisionId: null,
            comparisonKind: 'two-way' as const,
          };
      if (lineage.status !== snapshot.reviewedLineageStatus ||
        lineage.sourceVersionId !== snapshot.reviewedLineageSourceVersionId ||
        comparison.comparison_kind !== lineage.comparisonKind) return null;
      if (lineage.status === 'verified') {
        if (this.#verifiedReimportLineageRevision(
          snapshot.reviewedExistingBookId,
          snapshot.reviewedManuscriptId,
          lineage.sourceVersionId,
        ) !== lineage.revisionId) return null;
        const lineageRevision = this.#authority.prepare(
          'SELECT revision_digest FROM manuscript_revisions WHERE revision_id = ?',
        ).get(lineage.revisionId) as SqlRow | undefined;
        if (lineageRevision === undefined || comparison.lineage_revision_digest === null ||
          asString(lineageRevision.revision_digest) !== asString(comparison.lineage_revision_digest)) return null;
      } else if (comparison.lineage_revision_digest !== null) return null;
      const { exactSourceVersionId, ...base } = current;
      const target: ResolvedReimportTarget = {
        ...base,
        sourceVersionDisposition: exactSourceVersionId === null ? 'created' : 'reused-same-book',
        reuseSourceVersionId: exactSourceVersionId,
        lineage,
      };
      const evidence = this.#reimportEvidence(snapshot.draftId);
      return createReimportReviewDigest(
        snapshot,
        target,
        evidence.comparisonDigest,
        evidence.resolutionDigest,
        degradationReview(
          this.#reimportFidelity(snapshot).plan,
          asNumber(comparison.degradation_accepted) === 1,
        ).state,
      ) === snapshot.reviewDigest
        ? target
        : null;
    } catch {
      return null;
    }
  }

  #reimportReviewProjection(
    snapshot: DraftSnapshot,
    target: ResolvedReimportTarget,
    commitAttemptId: string | null,
  ): ReviewBeforeManuscriptReimportProjection {
    const evidence = this.#reimportEvidence(snapshot.draftId);
    const comparison = one(this.#authority.prepare(
      'SELECT degradation_accepted FROM manuscript_reimport_comparisons WHERE draft_id = ?',
    ).all(snapshot.draftId) as SqlRow[], 'REIMPORT_COMPARISON_INVALID', '重新导入比较不存在。');
    const { fidelity, plan } = this.#reimportFidelity(snapshot);
    const degradationAccepted = asNumber(comparison.degradation_accepted) === 1;
    requireStore(snapshot.reviewDigest !== null, 'REVIEW_CHANGED', '重新导入复核摘要缺失。');
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest: snapshot.reviewDigest,
      commitAttemptId,
      target: {
        kind: 'existing-book',
        bookId: target.bookId,
        stableIdentity: target.stableIdentity,
        label: target.label,
        internalNumber: target.internalNumber,
        manuscriptId: target.manuscriptId,
        branchId: target.branchId,
        relationship: 'reimport',
        relationshipLabel: '重新导入主稿件',
        bookStateDigest: target.bookStateDigest,
      },
      checkpoint: target.checkpoint,
      lineage: target.lineage.status === 'verified'
        ? {
            status: 'verified',
            label: '来源关系已确认',
            comparisonKind: 'three-way',
            sourceVersionId: target.lineage.sourceVersionId,
            revisionId: target.lineage.revisionId,
          }
        : {
            status: 'unconfirmed',
            label: '来源关系未确认',
            comparisonKind: 'two-way',
            sourceVersionId: null,
            revisionId: null,
          },
      source: this.#stagedProjection(snapshot).source,
      sourceVersionResult: target.sourceVersionDisposition === 'created'
        ? { disposition: 'created', label: '创建所选图书拥有的新来源版本', sourceVersionId: null }
        : {
            disposition: 'reused-same-book',
            label: '复用已明确选择的同图书来源版本',
            sourceVersionId: target.reuseSourceVersionId!,
          },
      comparison: {
        comparisonDigest: evidence.comparisonDigest,
        totalMappings: evidence.totalMappings,
        unresolvedMappings: evidence.unresolvedMappings,
        changed: evidence.changed,
        resultPreviewLabel: evidence.changed ? '稿件将重新导入' : '未发现稿件变化',
        groups: evidence.groups,
        unresolvedGroups: evidence.unresolvedGroups,
        exactBlocks: evidence.exactBlocks,
      },
      fidelity,
      degradationDecision: degradationReview(plan, degradationAccepted),
      commitReady: evidence.unresolvedMappings === 0 &&
        (plan.degradations.length === 0 || degradationAccepted),
      recordsToCreate: [
        ...(target.sourceVersionDisposition === 'created' ? ['图书拥有的来源版本'] : ['复用已明确选择的同图书来源版本']),
        '来源记录',
        '稿件重新导入记录',
        ...(evidence.changed ? ['一份后代稿件修订版'] : ['未发现稿件变化证据；不创建空修订版']),
      ],
      namedNonEffects: MANUSCRIPT_REIMPORT_NON_EFFECTS,
    };
  }

  #resolveImportTarget(
    selection: ImportTargetSelection,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedImportTarget {
    if (selection.kind === 'new-book') {
      const targetChoice = newBookTargetChoice(identityFindings);
      requireStore(selection.choiceId === targetChoice.id, 'TARGET_CHOICE_CHANGED', '导入目标选择已变化，请重新选择。');
      return {
        kind: 'new-book',
        choiceId: selection.choiceId,
        confirmedTitle: safeTitle(selection.confirmedTitle),
        label: targetChoice.label,
      };
    }
    requireStore(
      UUID_PATTERN.test(selection.bookId) && selection.relationship === 'first-manuscript',
      'TARGET_CHOICE_INVALID',
      '导入目标或稿件关系选择无效。',
    );
    const target = this.#emptyBookImportTarget(selection.bookId);
    return {
      kind: 'existing-book',
      choiceId: `existing-book:${target.bookId}`,
      ...target,
      relationship: 'first-manuscript',
    };
  }

  /**
   * The fidelity a review makes of the staged report with `disposition` for its text boxes. A choice the
   * report cannot state — merging a file that has no text box, or one a converter read — is refused.
   */
  #reviewedFidelity(snapshot: DraftSnapshot, disposition: TextBoxDisposition): ReviewedFidelity {
    this.#requireFidelityPlan(snapshot);
    const conversion = fidelityConversion(snapshot.conversion);
    const fidelity = withTextBoxDisposition(snapshot.fidelity, disposition, conversion, snapshot.parserIdentity!);
    requireStore(fidelity, 'TEXT_BOX_CHOICE_INVALID', '本次导入没有可并入正文的文本框。');
    const plan = deriveImportFidelityPlan(fidelity, snapshot.sourceDigest, snapshot.sourceBytes, conversion, snapshot.parserIdentity!);
    requireStore(plan, 'FIDELITY_OUTSIDE_TRACER', '当前导入的保真计划不符合受限边界。');
    return { fidelity, plan };
  }

  /**
   * The target and the fidelity a reviewed draft's digest was made from. The text-box choice is not
   * stored on the draft: the digest covers it, so the review is rebuilt under each choice the staged
   * report admits and only the one that reproduces the digest stands.
   */
  #reconstructReviewedImport(
    snapshot: DraftSnapshot,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): { target: ResolvedImportTarget; reviewed: ReviewedFidelity } | null {
    const staged = this.#requireFidelityPlan(snapshot);
    const dispositions: ReadonlyArray<TextBoxDisposition> = staged.textBoxDisposition === null ? ['retain'] : ['retain', 'merge'];
    for (const disposition of dispositions) {
      const reviewed = this.#reviewedFidelity(snapshot, disposition);
      const target = this.#reconstructReviewedImportTarget(snapshot, reviewed, identityFindings);
      if (target !== null) return { target, reviewed };
    }
    return null;
  }

  #reconstructReviewedImportTarget(
    snapshot: DraftSnapshot,
    reviewed: ReviewedFidelity,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
  ): ResolvedImportTarget | null {
    const { plan } = reviewed;
    if (snapshot.reviewDigest === null) return null;
    if (snapshot.reviewedTargetKind === 'existing-book') {
      if (
        snapshot.reviewedExistingBookId === null ||
        snapshot.reviewedRelationship !== 'first-manuscript' ||
        snapshot.reviewedBookStateDigest === null
      ) return null;
      let target: ResolvedImportTarget;
      try {
        target = this.#resolveImportTarget(
          { kind: 'existing-book', bookId: snapshot.reviewedExistingBookId, relationship: 'first-manuscript' },
          identityFindings,
        );
      } catch {
        return null;
      }
      if (target.kind !== 'existing-book' || target.bookStateDigest !== snapshot.reviewedBookStateDigest) return null;
      return createImportReviewDigestV6(
        snapshot,
        snapshot.version,
        reviewed,
        target,
        identityFindings,
        this.#workflowProfile,
      ) === snapshot.reviewDigest ? target : null;
    }
    if (snapshot.reviewedTargetKind !== 'new-book' || snapshot.reviewedTitle === null) return null;
    let confirmedTitle: string;
    try {
      confirmedTitle = safeTitle(snapshot.reviewedTitle);
    } catch {
      return null;
    }
    const currentChoice = newBookTargetChoice(identityFindings);
    if (snapshot.reviewedTargetChoiceId !== currentChoice.id) return null;
    const target: ResolvedImportTarget = {
      kind: 'new-book',
      choiceId: currentChoice.id,
      confirmedTitle,
      label: currentChoice.label,
    };
    if (createImportReviewDigestV6(
      snapshot,
      snapshot.version,
      reviewed,
      target,
      identityFindings,
      this.#workflowProfile,
    ) === snapshot.reviewDigest) return target;
    return reconstructReviewedTargetChoice(snapshot, confirmedTitle, plan, identityFindings) === currentChoice.id
      ? target
      : null;
  }

  #reviewProjection(
    snapshot: DraftSnapshot,
    reviewDigest: string | null,
    reviewed: ReviewedFidelity,
    accepted: boolean,
    target: ResolvedImportTarget,
    identityFindings: ReadonlyArray<ImportIdentityFindingProjection>,
    commitAttemptId: string | null,
  ): ReviewBeforeImportProjection {
    const { plan } = reviewed;
    return {
      draftId: snapshot.draftId,
      draftVersion: snapshot.version,
      reviewDigest,
      commitAttemptId,
      target: target.kind === 'new-book'
        ? {
            choiceId: target.choiceId,
            kind: 'new-book',
            label: target.label,
            confirmedTitle: target.confirmedTitle,
          }
        : {
            choiceId: target.choiceId,
            kind: 'existing-book',
            label: target.label,
            bookId: target.bookId,
            stableIdentity: target.stableIdentity,
            internalNumber: target.internalNumber,
            relationship: target.relationship,
            relationshipLabel: '作为首份稿件导入',
            bookStateDigest: target.bookStateDigest,
          },
      source: this.#stagedProjection(snapshot).source,
      identityFindings,
      fidelity: reviewed.fidelity,
      textBoxDisposition: plan.textBoxDisposition,
      recordsToCreate: recordsToCreate(plan, target.kind),
      nonEffects: nonEffects(plan),
      workflowProfile: {
        id: this.#workflowProfile.projection.id,
        name: this.#workflowProfile.projection.name,
        version: this.#workflowProfile.projection.version,
        digest: this.#workflowProfile.projection.digest,
        nativeProfile: {
          id: this.#workflowProfile.native.id,
          version: this.#workflowProfile.native.version,
          digest: this.#workflowProfile.native.digest,
        },
      },
      editorialDimensionSet: {
        ...BASELINE_EDITORIAL_DIMENSION_SET,
        digest: BASELINE_EDITORIAL_DIMENSION_SET_DIGEST,
      },
      degradationDecision: degradationReview(plan, accepted),
    };
  }

  #identityFindings(snapshot: DraftSnapshot): ImportIdentityFindingProjection[] {
    const rows = this.#authority
      .prepare(
        `SELECT b.book_id, b.title, sv.source_version_id, sv.source_digest, sv.content_digest,
                sv.structure_digest, sv.parser_identity, sv.display_name,
                records.import_record_id, records.record_kind
         FROM source_versions sv
         JOIN books b ON b.book_id = sv.book_id
         JOIN (
           SELECT book_id, source_version_id, import_record_id, 'manuscript-import' record_kind
           FROM manuscript_import_records
           UNION ALL
           SELECT book_id, source_version_id, source_import_record_id, 'source-import' record_kind
           FROM source_import_records
           UNION ALL
           SELECT book_id, source_version_id, reimport_record_id, 'manuscript-reimport' record_kind
           FROM manuscript_reimport_records
         ) records
           ON records.book_id = sv.book_id
          AND records.source_version_id = sv.source_version_id
         ORDER BY b.title COLLATE BINARY, b.book_id, sv.source_version_id,
                  records.record_kind, records.import_record_id`,
      )
      .all() as SqlRow[];
    const findings = new Map<string, ImportIdentityFindingProjection>();
    for (const row of rows) {
      const sourceDigest = asString(row.source_digest);
      // A Source Version the product never parsed has no content or structure identity, and neither
      // has an unparsed draft, so only the original's digest can classify either of them: the
      // content-digest findings need a parse on both sides (ADR 0072 §2).
      const contentDigest = nullableString(row.content_digest);
      const structureDigest = nullableString(row.structure_digest);
      const parserIdentity = nullableString(row.parser_identity);
      const displayName = asString(row.display_name);
      // Content and structure digests that agree are the same content whichever parser read each side (Issue #532): a Book
      // an earlier parser read is still found by it.
      const comparableParse = parserIdentity !== null && snapshot.parserIdentity !== null;
      const identityClass =
        sourceDigest === snapshot.sourceDigest
          ? ({ kind: 'immutable-original', label: '精确原始文件身份' } as const)
          : comparableParse &&
              contentDigest === snapshot.contentDigest &&
              structureDigest === snapshot.structureDigest
            ? ({ kind: 'parsed-content-structure', label: '发现相同内容' } as const)
            : displayName === snapshot.displayName
              ? ({ kind: 'filename-collision', label: '名称相同，内容不同' } as const)
              : undefined;
      if (!identityClass) continue;
      const finding = {
        bookId: asString(row.book_id),
        bookTitle: asString(row.title),
        sourceVersionId: asString(row.source_version_id),
        importRecordId: asString(row.import_record_id),
        recordKind: asString(row.record_kind) as ImportIdentityFindingProjection['recordKind'],
        recordLabel: asString(row.record_kind) === 'manuscript-import'
          ? '稿件导入记录'
          : asString(row.record_kind) === 'source-import'
            ? '来源导入记录'
            : '稿件重新导入记录',
        identityClass,
      } satisfies ImportIdentityFindingProjection;
      const key = `${finding.bookId}\u0000${finding.sourceVersionId}\u0000${finding.importRecordId}`;
      if (!findings.has(key)) findings.set(key, finding);
    }
    return [...findings.values()];
  }

  #loadDraftSnapshot(draftId: string): DraftSnapshot {
    const row = one(
      this.#authority
        .prepare(
          `SELECT d.draft_id, d.state, d.draft_version, d.display_name, d.object_digest,
                  d.selected_path, d.reviewed_title, d.reviewed_target_choice_id, d.review_digest,
                  d.reviewed_target_kind, d.reviewed_existing_book_id, d.reviewed_relationship,
                  d.reviewed_book_state_digest, d.reviewed_reuse_source_version_id,
                  d.reviewed_lineage_status, d.reviewed_lineage_source_version_id,
                  d.reviewed_checkpoint_revision_id, d.reviewed_manuscript_id, d.reviewed_branch_id,
                  d.staged_at, d.source_format, d.working_object_digest, d.converter_identity,
                  s.parser_identity, s.source_digest,
                  s.content_digest, s.structure_digest, s.block_count, s.character_count, s.fidelity_json,
                  s.title_suggestion, s.title_source, co.byte_length
           FROM import_drafts d
           LEFT JOIN staged_import_snapshots s ON s.draft_id = d.draft_id
           JOIN content_objects co ON co.object_digest = d.object_digest
           WHERE d.draft_id = ?`,
        )
        .all(draftId) as SqlRow[],
      'DRAFT_NOT_FOUND',
      '导入草稿不存在或已完成。',
    );
    const sourceFormat = requireSourceFormat(asString(row.source_format));
    // The two conversion columns are set together and only where the format is one the product
    // converts; `ALTER TABLE` could not add that as a table `CHECK`, so it is required here on
    // every read (ADR 0072 §2).
    const conversion = readConversionColumns(row, sourceFormat, '导入草稿的转换记录不完整。');
    // A DOCX was parsed natively and a converted file through its working representation; every
    // other draft is source-only and carries the original's identity alone (ADR 0072 §2).
    const parsed = sourceFormat === 'DOCX' || conversion !== null;
    requireStore(parsed === (row.parser_identity !== null), 'STORE_CORRUPT', '暂存解析结果与来源格式不一致。');
    const sourceDigest = parsed ? asString(row.source_digest) : asString(row.object_digest);
    const sourceBytes = asNumber(row.byte_length);
    requireStore(asString(row.object_digest) === sourceDigest, 'STORE_CORRUPT', '暂存对象与来源摘要不一致。');
    const fidelityValue = parsed ? parseStoredJson(asString(row.fidelity_json), '导入保真快照无效。') : [];
    if (parsed) {
      const plan = deriveImportFidelityPlan(
        fidelityValue, sourceDigest, sourceBytes, fidelityConversion(conversion), asString(row.parser_identity),
      );
      requireStore(plan, 'FIDELITY_OUTSIDE_TRACER', '持久化导入保真快照不符合当前受限边界。');
    }
    const titleSource = parsed ? asString(row.title_source) : '文件名';
    requireStore(titleSource === 'DOCX 标题元数据' || titleSource === '文件名', 'STORE_CORRUPT', '书名建议来源无效。');
    const reviewedTargetChoiceId =
      row.reviewed_target_choice_id === null ? null : asString(row.reviewed_target_choice_id);
    requireStore(
      reviewedTargetChoiceId === null ||
        reviewedTargetChoiceId === 'new-book' ||
        reviewedTargetChoiceId === 'new-book-distinct-intended-work',
      'STORE_CORRUPT',
      '导入复核目标无效。',
    );
    const selectedPath = row.selected_path === null ? null : asString(row.selected_path);
    requireStore(selectedPath === null || isAbsolute(selectedPath), 'STORE_CORRUPT', '原始所选路径无效。');
    const reviewedTargetKind = row.reviewed_target_kind === null ? null : asString(row.reviewed_target_kind);
    const reviewedExistingBookId = row.reviewed_existing_book_id === null ? null : asString(row.reviewed_existing_book_id);
    const reviewedRelationship = row.reviewed_relationship === null ? null : asString(row.reviewed_relationship);
    const reviewedBookStateDigest = row.reviewed_book_state_digest === null ? null : asString(row.reviewed_book_state_digest);
    const reviewedReuseSourceVersionId = row.reviewed_reuse_source_version_id === null
      ? null
      : asString(row.reviewed_reuse_source_version_id);
    const reviewedLineageStatus = row.reviewed_lineage_status === null ? null : asString(row.reviewed_lineage_status);
    const reviewedLineageSourceVersionId = row.reviewed_lineage_source_version_id === null
      ? null
      : asString(row.reviewed_lineage_source_version_id);
    const reviewedCheckpointRevisionId = row.reviewed_checkpoint_revision_id === null
      ? null
      : asString(row.reviewed_checkpoint_revision_id);
    const reviewedManuscriptId = row.reviewed_manuscript_id === null ? null : asString(row.reviewed_manuscript_id);
    const reviewedBranchId = row.reviewed_branch_id === null ? null : asString(row.reviewed_branch_id);
    requireStore(
      (reviewedTargetKind === null || reviewedTargetKind === 'new-book' || reviewedTargetKind === 'existing-book') &&
        (reviewedExistingBookId === null || UUID_PATTERN.test(reviewedExistingBookId)) &&
        (reviewedRelationship === null || reviewedRelationship === 'new-book-first-manuscript' ||
          reviewedRelationship === 'first-manuscript' || reviewedRelationship === 'source-only' ||
          reviewedRelationship === 'reimport') &&
        (reviewedBookStateDigest === null || DIGEST_PATTERN.test(reviewedBookStateDigest)) &&
        (reviewedReuseSourceVersionId === null || UUID_PATTERN.test(reviewedReuseSourceVersionId)) &&
        (reviewedLineageStatus === null || reviewedLineageStatus === 'verified' || reviewedLineageStatus === 'unconfirmed') &&
        (reviewedLineageSourceVersionId === null || UUID_PATTERN.test(reviewedLineageSourceVersionId)) &&
        (reviewedCheckpointRevisionId === null || UUID_PATTERN.test(reviewedCheckpointRevisionId)) &&
        (reviewedManuscriptId === null || UUID_PATTERN.test(reviewedManuscriptId)) &&
        (reviewedBranchId === null || UUID_PATTERN.test(reviewedBranchId)),
      'STORE_CORRUPT',
      '导入复核目标记录无效。',
    );
    return {
      draftId: asString(row.draft_id),
      state: asString(row.state),
      version: asNumber(row.draft_version),
      displayName: asString(row.display_name),
      objectDigest: asString(row.object_digest),
      selectedPath,
      reviewedTitle: row.reviewed_title === null ? null : asString(row.reviewed_title),
      reviewedTargetChoiceId,
      reviewedTargetKind: reviewedTargetKind as DraftSnapshot['reviewedTargetKind'],
      reviewedExistingBookId,
      reviewedRelationship: reviewedRelationship as DraftSnapshot['reviewedRelationship'],
      reviewedBookStateDigest,
      reviewedReuseSourceVersionId,
      reviewedLineageStatus: reviewedLineageStatus as DraftSnapshot['reviewedLineageStatus'],
      reviewedLineageSourceVersionId,
      reviewedCheckpointRevisionId,
      reviewedManuscriptId,
      reviewedBranchId,
      reviewDigest: row.review_digest === null ? null : asString(row.review_digest),
      stagedAt: asString(row.staged_at),
      sourceFormat,
      conversion,
      workingObjectDigest: conversion === null ? null : asString(row.working_object_digest),
      parserIdentity: parsed ? asString(row.parser_identity) : null,
      sourceDigest,
      sourceBytes,
      contentDigest: parsed ? asString(row.content_digest) : null,
      structureDigest: parsed ? asString(row.structure_digest) : null,
      blockCount: parsed ? asNumber(row.block_count) : 0,
      characterCount: parsed ? asNumber(row.character_count) : 0,
      fidelity: fidelityValue as FidelityCategoryProjection[],
      titleSuggestion: parsed ? asString(row.title_suggestion) : fileNameTitleSuggestion(asString(row.display_name)),
      titleSource,
    };
  }

  /**
   * Every path that would make an editable Manuscript refuses a format the product did not read as
   * one, whatever a client asks for, with the same reason the surface states (ADR 0072 §2).
   */
  #requireEditableFormat(snapshot: DraftSnapshot): void {
    const refusal = editableImport(snapshot.sourceFormat);
    requireStore(refusal.available, 'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT',
      refusal.available ? '' : refusal.reason);
  }

  #requireFidelityPlan(snapshot: DraftSnapshot): ImportFidelityPlan {
    this.#requireEditableFormat(snapshot);
    requireStore(snapshot.parserIdentity !== null, 'FIDELITY_OUTSIDE_TRACER', '当前导入没有本地解析结果。');
    const plan = deriveImportFidelityPlan(
      snapshot.fidelity,
      snapshot.sourceDigest,
      snapshot.sourceBytes,
      fidelityConversion(snapshot.conversion),
      snapshot.parserIdentity,
    );
    requireStore(plan, 'FIDELITY_OUTSIDE_TRACER', '当前导入的保真计划不符合受限边界。');
    return plan;
  }

  /**
   * The fidelity a reimport states of the staged report, and its plan. Since the chapter-level comparison (Issue #412,
   * plan slice S63; V2-UX-IMP-057) a reimport makes the file's comments and tracked changes 批注 and 修改建议 by their
   * author, as the first import does (MARK-009), so it states the report the file was staged with — the class
   * `完整保留` with the marks it makes as its count. The records made before it stated the class `不支持导入`
   * (`reimportFidelityReport`), and they still rebuild as they were.
   */
  #reimportFidelity(snapshot: DraftSnapshot): { fidelity: FidelityCategoryProjection[]; plan: ImportFidelityPlan } {
    const plan = this.#requireFidelityPlan(snapshot);
    return { fidelity: snapshot.fidelity, plan };
  }

  #loadPersistedFidelity(fidelityReviewId: string): FidelityCategoryProjection[] {
    return (
      this.#authority
        .prepare(
          `SELECT category_key, display_label, item_count, status, detail
           FROM import_fidelity_categories WHERE fidelity_review_id = ? ORDER BY position`,
        )
        .all(fidelityReviewId) as SqlRow[]
    ).map((row) => {
      const status = asString(row.status);
      requireStore(
        status === 'preserved' || status === 'retained' || status === 'degraded' || status === 'unsupported',
        'STORE_CORRUPT',
        '保真状态无效。',
      );
      return {
        key: asString(row.category_key) as FidelityCategoryProjection['key'],
        label: asString(row.display_label),
        count: asNumber(row.item_count),
        status,
        statusLabel: fidelityStatusLabel(status),
        detail: asString(row.detail),
      };
    });
  }

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
  ): { categories: FidelityCategoryProjection[]; plan: ImportFidelityPlan } {
    const categories = this.#loadPersistedFidelity(fidelityReviewId);
    const plan = deriveImportFidelityPlan(categories, sourceDigest, sourceBytes, fidelityConversion(conversion), parserIdentity);
    requireStore(plan, code, message);
    requireStore(
      this.#retentionCall(() => recordedTextBoxChoice(this.#authority, fidelityReviewId)) === plan.textBoxDisposition,
      code,
      message,
    );
    return { categories, plan };
  }

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

  #loadStoredCommitResult(commitId: string): StoredImportCommitProjection {
    const counts = one(this.#authority.prepare(
      `SELECT
         (SELECT count(*) FROM manuscript_import_records WHERE commit_id = ?) manuscript_imports,
         (SELECT count(*) FROM source_import_records WHERE commit_id = ?) source_imports,
         (SELECT count(*) FROM manuscript_reimport_records WHERE commit_id = ?) reimports`,
    ).all(commitId, commitId, commitId) as SqlRow[], 'STORE_CORRUPT', '无法判定导入提交记录类型。');
    const manuscriptImports = asNumber(counts.manuscript_imports);
    const sourceImports = asNumber(counts.source_imports);
    const reimports = asNumber(counts.reimports);
    requireStore(manuscriptImports + sourceImports + reimports === 1, 'STORE_CORRUPT', '导入提交记录类型不唯一。');
    return reimports === 1
      ? this.#loadStoredReimportResult(commitId)
      : sourceImports === 1
      ? this.#loadStoredSourceImportResult(commitId)
      : this.#loadStoredManuscriptImportResult(commitId);
  }

  #loadStoredReimportResult(commitId: string): ManuscriptReimportCommitProjection {
    const row = one(this.#authority.prepare(
      `SELECT ic.commit_id, ic.committed_at, rr.*, sv.display_name, sv.source_digest, sv.format,
              sv.working_object_digest, sv.converter_identity,
              co.byte_length, d.reviewed_reuse_source_version_id
       FROM import_commits ic
       JOIN manuscript_reimport_records rr ON rr.commit_id = ic.commit_id
       JOIN source_versions sv ON sv.source_version_id = rr.source_version_id AND sv.book_id = rr.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN import_drafts d ON d.draft_id = ic.draft_id
       WHERE ic.commit_id = ? AND ic.operation_kind = 'manuscript-reimport'`,
    ).all(commitId) as SqlRow[], 'STORE_CORRUPT', '稿件重新导入提交记录图不完整。');
    const resultKind = asString(row.result_kind) as 'changed' | 'no-change';
    const completionLabel = asString(row.result_label) as '稿件已重新导入' | '未发现稿件变化';
    const lineageStatus = asString(row.lineage_status) as 'verified' | 'unconfirmed';
    const comparisonKind = asString(row.comparison_kind) as 'three-way' | 'two-way';
    const manuscriptId = asString(row.manuscript_id);
    const branchId = asString(row.branch_id);
    const bookId = asString(row.book_id);
    const reimportRecordId = asString(row.reimport_record_id);
    const receipt = this.#reimportRecordPresentations(bookId, [reimportRecordId])
      .find((record) => record.kind === 'manuscript-reimport-record');
    requireStore(receipt?.kind === 'manuscript-reimport-record', 'STORE_CORRUPT', '稿件重新导入完成凭据不完整。');
    const overview = this.getBookOverview(bookId);
    return {
      commitId: asString(row.commit_id),
      importedAt: asString(row.committed_at),
      completionLabel,
      resultKind,
      bookId,
      manuscriptId,
      branchId,
      previousRevisionId: asString(row.previous_revision_id),
      resultingRevisionId: row.resulting_revision_id === null ? null : asString(row.resulting_revision_id),
      reimportRecordId,
      sourceVersionId: asString(row.source_version_id),
      sourceVersionDisposition: row.reviewed_reuse_source_version_id === null ? 'created' : 'reused-same-book',
      provenanceId: asString(row.provenance_id),
      lineageStatus,
      lineageLabel: lineageStatus === 'verified' ? '来源关系已确认' : '来源关系未确认',
      comparisonKind,
      comparisonDigest: asString(row.comparison_digest),
      resolutionDigest: asString(row.resolution_digest),
      source: storedSourceProjection(row),
      receipt,
      overview,
      window: this.#reimportLandingWindow(overview, manuscriptId, branchId),
    };
  }

  #loadStoredManuscriptImportResult(commitId: string): Omit<ManuscriptImportCommitProjection, 'firstWindow'> {
    const row = one(
      this.#authority
        .prepare(
          `SELECT ic.commit_id, ic.committed_at, ir.import_record_id, ir.book_id, ir.manuscript_id,
                  ir.fidelity_review_id, ir.degradation_decision_id, ir.resulting_revision_id,
                  mr.branch_id, sv.display_name, sv.object_digest, sv.source_digest, sv.format,
                  sv.working_object_digest, sv.converter_identity, sv.parser_identity, co.byte_length,
                  fr.outcome, fr.round_trip_guaranteed, dd.fidelity_review_id decision_fidelity_review_id,
                  dd.decision
           FROM import_commits ic
           JOIN manuscript_import_records ir ON ir.commit_id = ic.commit_id
           JOIN manuscript_revisions mr
             ON mr.revision_id = ir.resulting_revision_id
            AND mr.manuscript_id = ir.manuscript_id
            AND mr.source_version_id = ir.source_version_id
           JOIN source_versions sv
             ON sv.source_version_id = ir.source_version_id
            AND sv.book_id = ir.book_id
           JOIN content_objects co ON co.object_digest = sv.object_digest
           JOIN import_fidelity_reviews fr
             ON fr.fidelity_review_id = ir.fidelity_review_id
            AND fr.book_id = ir.book_id
            AND fr.source_version_id = ir.source_version_id
           LEFT JOIN import_degradation_decisions dd
             ON dd.degradation_decision_id = ir.degradation_decision_id
            AND dd.fidelity_review_id = ir.fidelity_review_id
           WHERE ic.commit_id = ?`,
        )
        .all(commitId) as SqlRow[],
      'STORE_CORRUPT',
      '导入提交记录图不完整。',
    );
    const fidelityReviewId = asString(row.fidelity_review_id);
    const sourceDigest = asString(row.source_digest);
    const sourceBytes = asNumber(row.byte_length);
    requireStore(asString(row.object_digest) === sourceDigest, 'STORE_CORRUPT', '提交来源对象与来源摘要不一致。');
    const conversion = readConversionColumns(row, requireSourceFormat(asString(row.format)), '来源版本的转换记录不完整。');
    const { categories, plan } = this.#persistedFidelityPlan(
      fidelityReviewId, sourceDigest, sourceBytes, conversion, asString(row.parser_identity),
      'STORE_CORRUPT', '导入提交保真记录无效。',
    );
    requireStore(asString(row.outcome) === plan.outcome && asNumber(row.round_trip_guaranteed) === 0, 'STORE_CORRUPT', '导入保真结论无效。');
    // Issue #411 (D5): the committed graph still holds every mark its review counted. A mark is never deleted —
    // it is applied, resolved, removed or converted, and an Apply re-pins it — so the manuscript's marks from
    // the file's author can only have grown in number since the commit wrote exactly these.
    const importedMarks = one(this.#authority.prepare(
      "SELECT count(*) total FROM editorial_marks WHERE manuscript_id = ? AND source_kind = 'imported-author'",
    ).all(asString(row.manuscript_id)) as SqlRow[], 'STORE_CORRUPT', '导入的批注与修改建议无法计数。');
    requireStore(asNumber(importedMarks.total) >= plan.importedMarks, 'STORE_CORRUPT', '导入提交记录图缺少导入的批注与修改建议。');
    const degradationDecisionId = row.degradation_decision_id === null ? null : asString(row.degradation_decision_id);
    if (plan.degradations.length === 0) {
      requireStore(degradationDecisionId === null && row.decision === null, 'STORE_CORRUPT', '洁净导入意外关联了降级决定。');
    } else {
      requireStore(
        degradationDecisionId !== null &&
          asString(row.decision_fidelity_review_id) === fidelityReviewId &&
          asString(row.decision) === canonicalDegradationDecision(plan),
        'STORE_CORRUPT',
        '导入降级决定无效。',
      );
    }
    const importRecordId = asString(row.import_record_id);
    return {
      commitId: asString(row.commit_id),
      importedAt: asString(row.committed_at),
      completionLabel: '稿件已导入',
      bookId: asString(row.book_id),
      manuscriptId: asString(row.manuscript_id),
      branchId: asString(row.branch_id),
      revisionId: asString(row.resulting_revision_id),
      importRecordId,
      source: storedSourceProjection(row),
      fidelityReview: { fidelityReviewId, outcome: plan.outcome, categories },
      importRecord: {
        importRecordId,
        fidelityReviewId,
        degradationDecision: degradationDecisionId
          ? {
              degradationDecisionId,
              summaryLabel: '含已接受的降级',
              acceptedItems: plan.degradations,
            }
          : null,
      },
      overview: this.getBookOverview(asString(row.book_id)),
    };
  }

  #loadStoredSourceImportResult(commitId: string): SourceImportCommitProjection {
    const row = one(this.#authority.prepare(
      `SELECT ic.commit_id, ic.committed_at, sir.source_import_record_id, sir.book_id,
              sir.source_version_id, sir.provenance_id, sir.target_kind,
              sir.source_version_disposition, sir.retained_boundary_json,
              sir.named_non_effects_json, sir.record_digest, sir.imported_at,
              sv.display_name, sv.format, sv.object_digest, sv.source_digest, sv.content_digest,
              sv.structure_digest, sv.parser_identity, sv.working_object_digest, sv.converter_identity,
              co.byte_length, sp.acquisition_path, sp.locality, sp.sanitized_identity, sp.recorded_at
       FROM import_commits ic
       JOIN source_import_records sir ON sir.commit_id = ic.commit_id
       JOIN source_versions sv
         ON sv.source_version_id = sir.source_version_id AND sv.book_id = sir.book_id
       JOIN content_objects co ON co.object_digest = sv.object_digest
       JOIN source_provenance sp
         ON sp.provenance_id = sir.provenance_id AND sp.source_version_id = sir.source_version_id
       WHERE ic.commit_id = ?`,
    ).all(commitId) as SqlRow[], 'STORE_CORRUPT', '来源导入提交记录图不完整。');
    const targetKind = asString(row.target_kind);
    const disposition = asString(row.source_version_disposition);
    requireStore(
      (targetKind === 'new-book' || targetKind === 'existing-book') &&
        (disposition === 'created' || disposition === 'reused-same-book') &&
        asString(row.object_digest) === asString(row.source_digest) &&
        asString(row.acquisition_path) === 'native-file-picker' && asString(row.locality) === 'local-provider-free' &&
        asString(row.imported_at) === asString(row.committed_at),
      'STORE_CORRUPT',
      '来源导入提交身份或来源记录无效。',
    );
    const retained = parseStoredJson(asString(row.retained_boundary_json), '来源导入保留边界无效。');
    const namedNonEffects = parseStoredJson(asString(row.named_non_effects_json), '来源导入非影响记录无效。');
    requireStore(
      retained !== null && typeof retained === 'object' && !Array.isArray(retained) &&
        Array.isArray(namedNonEffects) && canonicalJson(namedNonEffects) === canonicalJson(SOURCE_IMPORT_NON_EFFECTS),
      'STORE_CORRUPT',
      '来源导入保留边界或非影响记录无效。',
    );
    const boundary = retained as ReviewBeforeSourceImportProjection['retainedBoundary'];
    requireStore(
      boundary.kind === 'complete-local-file' &&
        boundary.label === retainedBoundaryLabel(row.parser_identity !== null) &&
        boundary.format === asString(row.format) && boundary.displayName === asString(row.sanitized_identity) &&
        boundary.sourceSha256 === asString(row.source_digest) &&
        boundary.sourceBytes === asNumber(row.byte_length) &&
        boundary.contentDigest === nullableString(row.content_digest) &&
        boundary.structureDigest === nullableString(row.structure_digest),
      'STORE_CORRUPT',
      '来源导入保留边界与来源版本不一致。',
    );
    const sourceImportRecordId = asString(row.source_import_record_id);
    const bookId = asString(row.book_id);
    const sourceVersionId = asString(row.source_version_id);
    const provenanceId = asString(row.provenance_id);
    const importedAt = asString(row.imported_at);
    const recordDigest = sha256(canonicalJson({
      schema: SOURCE_IMPORT_RECORD_SCHEMA,
      sourceImportRecordId,
      commitId: asString(row.commit_id),
      bookId,
      sourceVersionId,
      provenanceId,
      targetKind,
      sourceVersionDisposition: disposition,
      retainedBoundary: retained,
      namedNonEffects,
      importedAt,
    }));
    requireStore(recordDigest === asString(row.record_digest), 'STORE_CORRUPT', '来源导入记录摘要无效。');
    const conversion = readConversionColumns(row, requireSourceFormat(asString(row.format)), '来源版本的转换记录不完整。');
    const receiptRecords = this.#sourceImportRecordPresentations(bookId, [sourceImportRecordId]);
    const receiptSource = receiptRecords.find((record) => record.kind === 'source');
    const receiptRecord = receiptRecords.find((record) => record.kind === 'source-import-record');
    requireStore(receiptSource?.kind === 'source' && receiptRecord?.kind === 'source-import-record',
      'STORE_CORRUPT', '来源导入完成凭据不完整。');
    return {
      commitId: asString(row.commit_id),
      importedAt,
      completionLabel: '来源材料已导入',
      targetKind,
      createdBook: targetKind === 'new-book',
      bookId,
      sourceVersionId,
      sourceImportRecordId,
      sourceVersionDisposition: disposition,
      source: {
        displayName: boundary.displayName,
        format: boundary.format,
        sourceSha256: boundary.sourceSha256,
        sourceBytes: boundary.sourceBytes,
        provenanceLabel: '本机文件选择器 · 本地解析 · 未联网',
        // A TXT, Markdown or legacy .doc kept as source material was read through its converter, and the
        // commit recorded that working representation on the Source Version (ADR 0072 §2, #552).
        conversion,
        workingObjectSha256: conversion === null ? null : asString(row.working_object_digest),
      },
      retainedBoundary: boundary,
      provenance: {
        acquisitionPath: 'native-file-picker',
        locality: 'local-provider-free',
        label: '本机文件选择器 · 本地解析 · 未联网',
        acquiredAt: asString(row.recorded_at),
        provenanceId,
      },
      namedNonEffects: namedNonEffects as string[],
      receipt: { source: receiptSource, record: receiptRecord },
      overview: this.getBookOverview(bookId),
    };
  }

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
    sourceDigest: string;
    sourceBytes: number;
    conversion: ManuscriptConversionProjection | null;
    parserIdentity: string;
  }): void {
    const counts = one(
      this.#authority
        .prepare(
          `SELECT
             (SELECT count(*) FROM books WHERE book_id = ?) books,
             (SELECT count(*) FROM book_dimensions WHERE dimension_set_id = ?) dimensions,
             (SELECT count(*) FROM manuscripts WHERE manuscript_id = ? AND role = 'primary') manuscripts,
             (SELECT count(*) FROM manuscript_branches WHERE branch_id = ? AND base_revision_id = ?) branches,
             (SELECT count(*) FROM manuscript_revisions WHERE revision_id = ? AND revision_label = 'r1' AND parent_revision_id IS NULL) revisions,
             (SELECT count(*) FROM manuscript_block_versions WHERE revision_id = ?) blocks,
             (SELECT count(*) FROM working_blocks WHERE branch_id = ?) working_blocks,
             (SELECT count(*) FROM working_offset_nodes WHERE branch_id = ?) offset_nodes,
             (SELECT count(*) FROM branch_working_state
                WHERE branch_id = ? AND total_graphemes = ?) working_state,
             (SELECT count(*) FROM source_versions
                WHERE source_version_id = ? AND object_digest = ? AND source_digest = ?) sources,
             (SELECT count(*) FROM import_fidelity_reviews
                WHERE fidelity_review_id = ? AND book_id = ? AND source_version_id = ?
                  AND outcome = ? AND review_digest = ?
                  AND round_trip_guaranteed = 0) fidelity_reviews,
             (SELECT count(*) FROM import_fidelity_categories WHERE fidelity_review_id = ?) fidelity_categories,
             (SELECT count(*) FROM import_degradation_decisions WHERE fidelity_review_id = ?) degradation_decisions,
             (SELECT count(*) FROM workflow_instances
                WHERE workflow_instance_id = ?
                  AND profile_id = ? AND profile_version = ? AND profile_digest = ?
                  AND native_profile_id = ? AND native_profile_version = ? AND native_profile_digest = ?) workflows,
             (SELECT count(*) FROM manuscript_import_records
                WHERE import_record_id = ? AND book_id = ? AND manuscript_id = ?
                  AND source_version_id = ? AND fidelity_review_id = ? AND resulting_revision_id = ?
                  AND degradation_decision_id IS ?) imports,
             (SELECT count(*) FROM manuscript_block_sources
                WHERE revision_id = ? AND source_version_id = ?) block_sources,
             (SELECT count(*) FROM editorial_marks
                WHERE manuscript_id = ? AND source_kind = 'imported-author' AND pinned_revision_id = ?) imported_marks`,
        )
        .all(
          input.bookId,
          input.dimensionSetId,
          input.manuscriptId,
          input.branchId,
          input.revisionId,
          input.revisionId,
          input.revisionId,
          input.branchId,
          input.branchId,
          input.branchId,
          input.characterCount,
          input.sourceVersionId,
          input.sourceDigest,
          input.sourceDigest,
          input.fidelityReviewId,
          input.bookId,
          input.sourceVersionId,
          input.fidelityPlan.outcome,
          input.reviewDigest,
          input.fidelityReviewId,
          input.fidelityReviewId,
          input.workflowInstanceId,
          this.#workflowProfile.projection.id,
          this.#workflowProfile.projection.version,
          this.#workflowProfile.projection.digest,
          this.#workflowProfile.native.id,
          this.#workflowProfile.native.version,
          this.#workflowProfile.native.digest,
          input.importRecordId,
          input.bookId,
          input.manuscriptId,
          input.sourceVersionId,
          input.fidelityReviewId,
          input.revisionId,
          input.degradationDecisionId,
          input.revisionId,
          input.sourceVersionId,
          input.manuscriptId,
          input.revisionId,
        ) as SqlRow[],
      'IMPORT_POSTCONDITION_FAILED',
      '导入提交后置条件缺失。',
    );
    requireStore(
      asNumber(counts.books) === 1 &&
        asNumber(counts.dimensions) === 8 &&
        asNumber(counts.manuscripts) === 1 &&
        asNumber(counts.branches) === 1 &&
        asNumber(counts.revisions) === 1 &&
        asNumber(counts.blocks) === input.blockCount &&
        asNumber(counts.working_blocks) === input.blockCount &&
        asNumber(counts.offset_nodes) === input.blockCount &&
        asNumber(counts.working_state) === 1 &&
        asNumber(counts.sources) === 1 &&
        asNumber(counts.fidelity_reviews) === 1 &&
        asNumber(counts.fidelity_categories) === input.fidelityCategoryCount &&
        asNumber(counts.degradation_decisions) === (input.degradationDecisionId === null ? 0 : 1) &&
        asNumber(counts.workflows) === 1 &&
        asNumber(counts.imports) === 1 &&
        asNumber(counts.block_sources) === input.blockCount &&
        // Issue #411: exactly the marks the review counted, every one pinned on r1.
        asNumber(counts.imported_marks) === input.fidelityPlan.importedMarks,
      'IMPORT_POSTCONDITION_FAILED',
      '导入提交未形成完整记录图。',
    );
    const { plan: persistedPlan } = this.#persistedFidelityPlan(
      input.fidelityReviewId,
      input.sourceDigest,
      input.sourceBytes,
      input.conversion,
      input.parserIdentity,
      'IMPORT_POSTCONDITION_FAILED',
      '导入提交未形成精确保真分类。',
    );
    requireStore(
      canonicalJson(persistedPlan) === canonicalJson(input.fidelityPlan),
      'IMPORT_POSTCONDITION_FAILED',
      '导入提交未形成精确保真分类。',
    );
    const decisions = this.#authority
      .prepare(
        `SELECT degradation_decision_id, decision
         FROM import_degradation_decisions WHERE fidelity_review_id = ?`,
      )
      .all(input.fidelityReviewId) as SqlRow[];
    if (input.degradationDecisionId === null) {
      requireStore(decisions.length === 0, 'IMPORT_POSTCONDITION_FAILED', '洁净导入意外创建了降级决定。');
    } else {
      const decision = one(decisions, 'IMPORT_POSTCONDITION_FAILED', '降级导入未形成唯一决定。');
      requireStore(
        asString(decision.degradation_decision_id) === input.degradationDecisionId &&
          asString(decision.decision) === canonicalDegradationDecision(input.fidelityPlan),
        'IMPORT_POSTCONDITION_FAILED',
        '降级导入决定与保真审阅不匹配。',
      );
    }
  }

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
      if (error instanceof ExportLedgerError || error instanceof AnalysisError) throw new StoreError(error.code, error.message);
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
      if (error instanceof ReviewRunError || error instanceof AnalysisError || error instanceof EditorialMarkError || error instanceof ProposalConflictError ||
        error instanceof ReviewGuidelineError) {
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
