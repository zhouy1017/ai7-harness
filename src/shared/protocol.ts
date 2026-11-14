import type { EditorialMarkCategoryKey } from './editorial-mark-category.js';
import type { GlobalAgentOperations, GlobalAgentRendererApi } from './protocol/global-agent.js';
import type { HouseWordListOperations, HouseWordListApi } from './protocol/house-word-list.js';
import type { JournalEditInput } from './protocol/manuscript-structure.js';
import type { SelectionSpanBlockPin, SelectionSpanField } from './protocol/selection-span.js';
import type { AiEditLocksProjection, InspectAiEditLocksInput, InspectScopedAiEditInput, ScopedAiEditProjection, SetAiEditLocksInput, StartScopedAiEditInput } from './protocol/scoped-edit.js';
import type { GlobalAttentionProjection } from './protocol/global-attention.js';
import type {
  ModelServiceBindingProjection,
  ModelServiceChannelProjection,
  ModelServiceConnectionId,
  ModelDiscoveryResult,
  ModelServiceRouteId,
  OrdinaryProductionRouteId,
} from './protocol/model-service.js';
import type {
  SearchBackendConnectionProjection,
  SearchBackendProbeProjection,
  SearchBackendSelectionInput,
  SearchBackendSettingsProjection,
  SearchCandidateId,
  SearchConnectionTestPolicy,
} from './protocol/search-backends.js';
import type { ManuscriptBlockProjection } from './protocol/manuscript-notes.js';
import type { ImportStructureChoice, ImportStructureProjection } from './protocol/import-structure.js';
import type {
  EditableImportProjection,
  ImportIdentityFindingProjection,
  ManuscriptConversionProjection,
} from './protocol/import-intake.js';
import type {
  ReviewExcludedFindingProjection,
  ReviewContractRejectionReason,
  ReviewReportSchema,
  ReviewReportDerivedSections,
} from './protocol/review.js';
import type {
  QuickStartBaselineAnalysisResult,
  SeriesKnowledgeSpanInput,
  SearchSummaryProjection,
  ReplacementPreviewProjection,
  StartupProjection,
  RecoveryComparisonProjection,
  RecoverySelection,
  RecoveryWindowTarget,
  RecoveryWindowProjection,
  RecoveryDeferralProjection,
  RecoveryRestorationProjection,
  LibraryDecisionReasonPage,
  SeriesListCursor,
  SeriesListProjection,
  CreateSeriesInput,
  SeriesCreationProjection,
  SeriesProjection,
  InspectBookSeriesInput,
  BookSeriesProjection,
  SeriesMembersCursor,
  SeriesMembersPageProjection,
  SeriesCandidatesCursor,
  SeriesCandidatesProjection,
  SeriesHistoryCursor,
  SeriesHistoryPageProjection,
  ProposeSeriesKnowledgeInput,
  SeriesKnowledgeProposalProjection,
  InspectSeriesKnowledgeReviewInput,
  SeriesKnowledgeReviewProjection,
  EditSeriesKnowledgeCandidateInput,
  PromoteSeriesKnowledgeInput,
  SeriesKnowledgeItemsCursor,
  SeriesKnowledgeItemsPageProjection,
  SeriesKnowledgeCandidatesCursor,
  SeriesKnowledgeCandidatesPageProjection,
  SeriesKnowledgeConflictsProjection,
  SeriesKnowledgeRevisionsProjection,
  InspectSeriesExclusionTargetsInput,
  SeriesExclusionTargetsProjection,
  InspectSeriesExclusionHistoryInput,
  SeriesExclusionHistoryPageProjection,
  PreviewSeriesExclusionInput,
  SeriesExclusionPreviewProjection,
  RecordSeriesExclusionInput,
  SeriesExclusionResultProjection,
  PriorWorkItemProjection,
  ManuscriptWindowTarget,
  OutlineProjection,
  SearchResultsProjection,
  ReplacementDismissalProjection,
  ReplacementCommitProjection,
  CommitReplacementRevisionsInput,
  ReplacementRevisionsProjection,
  SaveMilestoneInput,
  MilestoneProjection,
  HistoricalRevisionProjection,
} from './protocol/series.js';
import type {
  MaintenanceClassification,
  BookDeliveryPackageExportResultProjection,
  InspectDeliverablesInput,
  DeliverablesProjection,
  DesignatePublicationVersionInput,
  PublicationDesignationProjection,
  InspectProductionDocumentsInput,
  ProductionDocumentsProjection,
  InspectBookDeliveryPackageInput,
  BookDeliveryPackageProjection,
  PrepareBookDeliveryPackageInput,
  BookDeliveryPackageResultProjection,
  ReviewBookDeliveryPackageExportInput,
  BookDeliveryPackageExportReviewProjection,
  PrepareBookDeliveryPackageArchiveInput,
  BookDeliveryPackageExportProjection,
  ApproveBookDeliveryPackageExportInput,
  PrepareBookDeliveryPackageExportInput,
  InspectMaintenanceCaseInput,
  MaintenanceCaseProjection,
  ListMaintenanceCasesInput,
  MaintenanceCasePageProjection,
  RecordMaintenanceCaseInput,
  MaintenanceCaseResultProjection,
  AppendMaintenanceCaseRevisionInput,
  SaveMaintenanceErrataInput,
  CreateProductionDocumentInput,
  RenameProductionDocumentInput,
  ProductionDocumentTypesProjection,
  SaveProductionDocumentTypeInput,
  DeleteProductionDocumentTypeInput,
  ReorderProductionDocumentTypesInput,
  UpdateProductionDocumentMetaInput,
  ProductionDocumentResultProjection,
  DecideProductionDocumentTypeInput,
  SaveProductionDocumentVersionInput,
  RecordProductionDocumentDeliveryInput,
  TransitionProductionDocumentPhaseInput,
  ChooseBookDeliveryPackageExportFolderResult,
} from './protocol/deliverables.js';
import type {
  PreviewSeriesMembershipChangeInput,
  SeriesMembershipPreviewProjection,
  ChangeSeriesMembershipInput,
  SeriesMembershipChangeResultProjection,
  SeriesKnowledgePromotionProjection,
  DataVersionProjection,
  DatabaseExportActivityProjection,
  DatabaseExportsProjection,
  ScheduledBackupsProjection,
  SetScheduledBackupInput,
  DatabaseImportPreviewProjection,
  DatabaseReplacementsProjection,
} from './protocol/data-storage.js';
import type {
  ChangeEditorialLearningInput,
  CreateEditorialMemoryInput,
  DeactivateEditorialMemoryInput,
  EditorialLearningProjection,
  InspectEditorialLearningInput,
  LearningReasonAskInput,
  LearningReasonAskProjection,
  PreferenceAdoptionCursor,
} from './protocol/learning.js';
import type { AnalysisFeedbackDimension, AnalysisFeedbackJudgment } from './analysis-feedback.js';
import type { ConflictUnit, ConflictUnitResolution } from './conflict-units.js';
import type { ConfiguredCredentialSlot, ConfiguredRouteId } from './provider-configuration.generated.js';
import type { PublicSampleBookSourceDigest } from './public-samplebooks.js';
import { USAGE_EMPTY_LABEL } from './usage-labels.js';
import type {
  AnalysisFreshnessAxis,
  BaselineAnalysisWireProjection,
  BaselineAnalysisWireUnitProjection,
  CoverageManifestUnitProjection,
  RunReportProjection,
  RunReportUsageStageId,
  ServiceWireOutput,
} from './protocol/analysis.js';
import type {
  CorrectionProposalDraftProjection,
  CorrectionProposalSavedProjection,
  EvidenceAssuranceLevel,
  EvidenceWorkspaceProjection,
  FactualCorrectionLineageProjection,
  FactualVerificationLensProjection,
  InspectEvidenceWorkspaceInput,
  InspectFactualVerificationInput,
  PrepareCorrectionProposalInput,
  RecordVerificationReviewDecisionInput,
  ResearchEvidenceBookProjection,
  SaveCorrectionProposalInput,
  VerificationReviewDecisionRecordedProjection,
} from './protocol/factual-verification.js';
import type {
  AuthorizeReviewRunInput,
  CancelReviewRunInput,
  ContinueReviewRunInput,
  EditQualitySignalsProjection,
  FrozenSeriesScope,
  GenerateReviewReportInput,
  HouseReviewPreferenceProjection,
  InspectReviewFindingOfMarkInput,
  InspectReviewFindingOfMarkRendererInput,
  InspectReviewWorkspaceInput,
  PrepareReviewRunInput,
  RecordReviewFindingDispositionInput,
  ReviewFindingOfMarkProjection,
  ReviewRunCategoryState,
  ReviewWorkspaceProjection,
} from './protocol/review-runs.js';
import type {
  LearningEligibilityChoice,
  LibraryMaterialCursor,
  LibraryMaterialDecisionInput,
  LibraryMaterialKind,
  LibraryMaterialPreviewProjection,
  LibraryMaterialProjection,
  LibraryMaterialsProjection,
  MaterialSegmentsPageProjection,
  MaterialVectorSearchProjection,
} from './protocol/library-materials.js';
import type {
  BackgroundAnalysisEnrollmentProjection,
  BackgroundAnalysisScopeKind,
  BackgroundAnalysisStartingPoint,
  CancelWaitingTaskInput,
  ClarificationOptionId,
  ControlTaskRunInput,
  DefaultExecutionRuleProjection,
  DefaultExecutionRulesProjection,
  EditTaskPlanInput,
  InspectTaskPlanInput,
  ReconnectPreflightProjection,
  StartTaskWhenOnlineInput,
  StartWhenOnlineTaskKind,
  TaskPlanKind,
  TaskPlanProjection,
  UnconfirmedStageId,
} from './protocol/task-plan.js';
import type {
  BaselineAnalysisGoal,
  BaselineAnalysisTaskMode,
  CustomAnalysisDimensionsProjection,
  PrepareCustomAnalysisInput,
  ReadersReportTemplate,
  SaveCustomAnalysisDimensionInput,
} from './protocol/task-kinds.js';
import type {
  AnalysisReusePlanCounts,
  BaselineAnalysisProjection,
  BaselineAnalysisSelectedRange,
  BaselineAnalysisUpdateRequest,
} from './protocol/analysis-plan.js';
import type {
  EvaluationContent,
  EvaluationProfilesProjection,
  EvaluationRewriteDecision,
  EvaluationWorkspaceProjection,
  SaveEvaluationProfileInput,
  StartEvaluationInput,
} from './protocol/evaluation.js';
import type {
  QuickStartWritingTaskResult,
  WritingDraftCreatedProjection,
  WritingTaskProjection,
} from './protocol/writing.js';
import type {
  AdmitReadersReportExemplarInput,
  ExemplarBookCursor,
  ExemplarBookProjection,
  ExemplarsProjection,
  ImportedExemplarDecisionInput,
  ImportedExemplarInput,
  ImportedExemplarPreview,
  ImportedSkillImportProjection,
  ImportedSkillRevisionProjection,
  ImportedSkillUpdateCandidateProjection,
  ImportedSkillUpdateCheckProjection,
  ImportedSkillUpdateRuleProjection,
  ImportedSkillsProjection,
  KnowledgeProceduresProjection,
  ProcedureRecommendationInput,
  ProcedureRecommendationProjection,
  ReviewGuidelinePreviewProjection,
  ReviewGuidelinesPage,
  ReviewGuidelinesProjection,
} from './protocol/knowledge-base.js';
import type {
  CapturedProcedureApplicabilityProjection,
  CapturedProcedureProjection,
  CapturedProcedureRunProjection,
  CapturedProcedureScopeSlot,
  CapturedProcedureStopPreviewProjection,
  CapturedProcedureValidationProjection,
  CapturedProceduresProjection,
  DeveloperProposalProjection,
  DeveloperProposalVersionProjection,
  ProcedureCaptureProjection,
  SaveCapturedProcedureInput,
  SaveDeveloperProposalFileOutcome,
  SaveDeveloperProposalInput,
} from './protocol/captured-procedures.js';

export type { JournalEditInput, JournalStructuralEdit } from './protocol/manuscript-structure.js';
export type { ManuscriptBlockKind, ManuscriptBlockProjection, ManuscriptNoteProjection } from './protocol/manuscript-notes.js';
export type * from './protocol/import-intake.js';
export type * from './protocol/import-structure.js';
export * from './protocol/custom-analysis-redo.js';
export type * from './protocol/selection-span.js';
export type * from './protocol/global-attention.js';
export * from './protocol/model-service.js';
export * from './protocol/search-backends.js';
export { validStructureChoice } from './protocol/import-structure.js';
export * from './protocol/global-agent.js';
export type { ReviewContractIdentity, ReviewExcludedFindingProjection, ReviewContractRejectionReason, ReviewEvidenceSource, ReviewReportSchema, ReviewReportDerivedSections, ReviewReportFindingEntry } from './protocol/review.js';
export { USAGE_EMPTY_LABEL } from './usage-labels.js';
export type { ConflictResolution, ConflictUnit, ConflictUnitKind, ConflictUnitResolution } from './conflict-units.js';
export * from './protocol/series.js';
export * from './protocol/data-storage.js';
export * from './protocol/deliverables.js';
export * from './protocol/procedures.js';
export * from './protocol/learning.js';

export * from './protocol/analysis.js';
export * from './protocol/task-kinds.js';
export * from './protocol/analysis-plan.js';
export * from './protocol/factual-verification.js';
export * from './protocol/review-runs.js';
export * from './protocol/evaluation.js';
export * from './protocol/writing.js';
export * from './protocol/task-plan.js';
export * from './protocol/knowledge-base.js';
export * from './protocol/captured-procedures.js';
export * from './protocol/library-materials.js';

export * from './protocol/scoped-edit.js';

/**
 * Protocol 200 (Issue #1400 Batch 3): 局部 AI 修改与 🔒 锁定 (#1412) — setAiEditLocks, inspectAiEditLocks, startScopedAiEdit,
 * inspectScopedAiEdit and the window's optional `aiLockedBlockIds`/`aiLocksDigest` — and 全部替换 as per-occurrence revision
 * cards (#1411) — commitReplacementRevisions.
 *
 * Protocol 201 (#1426 after-wave-24c closure, 0.6.3): editable derivative categories and document management (#1427) —
 * saveProductionDocumentType, deleteProductionDocumentType, reorderProductionDocumentTypes, updateProductionDocumentMeta;
 * mark category/source fields on mark projections (#1429); inline editor revisions with apply/revert card actions (#1428);
 * the one-click `book-review-report` DOCX export target and its report sections (#1430).
 *
 * Protocol 202 (#1459 R1 closure, 0.7.0): PR #1462 (#1435) adds `guessed-anchor` to
 * ProposalDraftBatchProjection.excluded.reason. No other R1 change alters IPC.
 */
export const SERVICE_PROTOCOL_VERSION = 202 as const;

export const BOOK_FINDINGS_PAGE_SIZE = 40;

export interface BookFindingProjection {
  /** Exact open suggestion offered by the owning review; Apply still revalidates this binding. */
  suggestion?: { manuscriptId: string; branchId: string; markId: string; blockId: string; batchAllowed: boolean; quote: string; replacement: string };
  id: string;
  category: string;
  categoryLabel: string;
  severity: string;
  status: string;
  summary: string;
  target:
    | { kind: 'gap'; revisionId: string; unitOrdinal: number; blockId: string | null }
    | { kind: 'review'; reviewRunId: string; findingId: string; blockId: string }
    | { kind: 'risk'; recordId: string; riskId: string; revisionId: string };
}

export interface BookFindingsProjection {
  bookId: string;
  total: number;
  offset: number;
  next: number | null;
  pageSize: typeof BOOK_FINDINGS_PAGE_SIZE;
  groups: ReadonlyArray<{ category: string; label: string; count: number; bySeverity: Readonly<Record<string, number>>; byStatus: Readonly<Record<string, number>> }>;
  items: ReadonlyArray<BookFindingProjection>;
}

export interface ParagraphAnalysisProjection {
  bookId: string;
  manuscriptId: string;
  blockId: string;
  revision: null | { revisionId: string; ordinal: number; freshness: AnalysisFreshnessAxis };
  total: number;
  items: ReadonlyArray<{ kind: 'entities' | 'events' | 'settingClaims' | 'relationships'; label: string; blockId: string }>;
}

/** Disposable local search results: UTF-16 offsets in the exact pinned source, previews are never quotations. */
export interface LocalRetrievalCandidateProjection {
  readonly candidateId: string;
  readonly sourceKind: 'manuscript' | 'material' | 'retained-source' | 'memory';
  readonly sourceId: string;
  readonly revisionOrIndexDigest: string;
  readonly anchor: { readonly blockId?: string; readonly segmentOrdinal?: number; readonly start: number; readonly end: number };
  readonly score: number;
  readonly preview: string;
}

export const MAX_FRAME_BYTES = 512 * 1024;

export const MAX_WINDOW_BLOCKS = 32;

export const MAX_BLOCK_GRAPHEMES = 2_048;

export const MAX_BLOCK_CODE_UNITS = 4_096;

export const MAX_EDIT_GRAPHEMES = 256;

export const MAX_EDIT_CODE_UNITS = 1_024;

export const MAX_SEARCH_QUERY_GRAPHEMES = 64;

export const MAX_REPLACEMENT_GRAPHEMES = 256;

export const MAX_SEARCH_RESULTS = 24;

export const MAX_OUTLINE_RESULTS = 64;

export const MAX_OUTLINE_DISPLAY_UTF8_BYTES = 2 * 1024;

export const MAX_REPLACEMENT_EXCLUSIONS = 1_000;

export type J01ImportControl =
  | 'before-commit'
  | 'after-commit-before-response'
  | 'uncertain-reconciliation'
  | 'legacy-result-json-without-receipt'
  | 'legacy-reviewed-v2'
  | 'tamper-reimport-proof-before-validation'
  | 'abandon-object-delete-failure'
  | 'after-abandon-object-delete-before-finalize';

export type J03ForegroundExecutionControl = 'interrupt-before-foreground-boundary-response';

export type J08RecoveryControl = 'interrupt-after-journal-ack';

/**
 * The Edit Journal write-failure injection (Issue #951, wave 12 slice 12a; T0-1): the one way a Journey makes the journal
 * acknowledgement unavailable, so Editing Protection Mode and its Protective Read-only State can be shown end to end. It is
 * armed only by this launch argument with the value `armed`, only under `AI7_E2E_JOURNEY=J-02` and the `development-ci`
 * scope — main and the service each decide it with `editJournalFaultControlAdmitted` — and every other launch refuses
 * `setEditJournalFault`. It writes nothing and changes no journal semantics: while a mode is in force a journal write is
 * refused before it starts, exactly as an unavailable acknowledgement would leave it.
 */
export const EDIT_JOURNAL_FAULT_CONTROL_ARGUMENT = '--j02-journal-fault-control';

export type EditJournalFaultMode = 'off' | 'fail-next' | 'fail-all';

export const EDIT_JOURNAL_FAULT_MODES: ReadonlyArray<EditJournalFaultMode> = ['off', 'fail-next', 'fail-all'];

/** The code a journal write refused by the injection answers with; the renderer reads it as an unavailable acknowledgement. */
export const EDIT_JOURNAL_FAULT_CODE = 'JOURNAL_WRITE_UNAVAILABLE';

/** The code `setEditJournalFault` answers with outside the armed launch. */
export const EDIT_JOURNAL_FAULT_REFUSED_CODE = 'EDIT_JOURNAL_FAULT_REFUSED';

export function isEditJournalFaultMode(value: unknown): value is EditJournalFaultMode {
  return value === 'off' || value === 'fail-next' || value === 'fail-all';
}

/**
 * Whether a launch may arm the injection: absent stays unarmed and is always admitted; present must be exactly `armed`, under
 * J-02, in the `development-ci` scope. `null` is a launch to refuse outright (a present control anywhere else).
 */
export function editJournalFaultControlAdmitted(
  value: string | undefined,
  journey: string | undefined,
  scope: TrustedOperationalScope,
): boolean | null {
  if (value === undefined) return false;
  return value === 'armed' && journey === 'J-02' && scope === 'development-ci' ? true : null;
}

/** What `setEditJournalFault` answers: the mode now in force. */
export interface EditJournalFaultProjection {
  readonly mode: EditJournalFaultMode;
}

/**
 * The J-04 launch control: the identity of a hand-written synthetic deterministic fixture under
 * `tests/fixtures/model/`. Admitted only with `AI7_E2E_JOURNEY=J-04`, or `J-09` whose 待我处理 needs Runs
 * that execute (Issue #424), mutually exclusive with every other control, and the only way the
 * `ai7-local-deterministic` route can be bound.
 */
export type J04ModelAdapterControl = string;

export const J04_MODEL_ADAPTER_CONTROL_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const IPC_CHANNELS = {
  getStartup: 'ai7:j08:get-startup',
  getRecoveryComparison: 'ai7:j08:get-recovery-comparison',
  viewRecoveryCandidate: 'ai7:j08:view-recovery-candidate',
  deferRecovery: 'ai7:j08:defer-recovery',
  restoreRecovery: 'ai7:j08:restore-recovery',
  getImportStartup: 'ai7:j01:get-import-startup',
  selectAndStageManuscript: 'ai7:j01:select-and-stage-manuscript',
  importBundledSampleBook: 'ai7:onboarding:import-bundled-sample-book',
  continueImportDraft: 'ai7:j01:continue-import-draft',
  reselectImportDraft: 'ai7:j01:reselect-import-draft',
  abandonImportDraft: 'ai7:j01:abandon-import-draft',
  prepareBookCreation: 'ai7:j01:prepare-book-creation',
  commitBookCreation: 'ai7:j01:commit-book-creation',
  getBookOverview: 'ai7:j01:get-book-overview',
  inspectEditorialWorkspaceProfile: 'ai7:j15:inspect-editorial-workspace-profile',
  installEditorialWorkspaceProfile: 'ai7:j15:install-editorial-workspace-profile',
  enableEditorialWorkspaceProfile: 'ai7:j15:enable-editorial-workspace-profile',
  inspectTaskAuthorization: 'ai7:j03:inspect-task-authorization',
  inspectTaskPlan: 'ai7:j03:inspect-task-plan',
  getTaskPlanPage: 'ai7:tasks:get-task-plan-page',
  resolveUnconfirmedOutcomes: 'ai7:j10:resolve-unconfirmed-outcomes',
  inspectForegroundExecutionBoundary: 'ai7:j03:inspect-foreground-execution-boundary',
  prepareTaskAuthorization: 'ai7:j03:prepare-task-authorization',
  authorizeTaskAuthorization: 'ai7:j03:authorize-task-authorization',
  getBaselineAnalysisPage: 'ai7:analysis:get-baseline-analysis-page',
  getCoverageManifestUnits: 'ai7:analysis:get-coverage-manifest-units',
  getAnalysisRevisionUnits: 'ai7:analysis:get-analysis-revision-units',
  getAnalysisRevisionOverview: 'ai7:analysis:get-analysis-revision-overview',
  getAnalysisRunReportRows: 'ai7:analysis:get-analysis-run-report-rows',
  getBaselineAnalysisRangePlan: 'ai7:analysis:get-baseline-analysis-range-plan',
  inspectBaselineAnalysis: 'ai7:j04:inspect-baseline-analysis',
  inspectBookFindings: 'ai7:inspect-book-findings',
  inspectParagraphAnalysis: 'ai7:inspect-paragraph-analysis',
  prepareBaselineAnalysis: 'ai7:j04:prepare-baseline-analysis',
  authorizeBaselineAnalysis: 'ai7:j04:authorize-baseline-analysis',
  startBaselineAnalysisWhenOnline: 'ai7:j04:start-baseline-analysis-when-online',
  cancelWaitingBaselineAnalysis: 'ai7:j04:cancel-waiting-baseline-analysis',
  // 空闲时处理 for every kind that dispatches (Issue #1089, F-17a; ADR 0095 §3), keyed by kind.
  startTaskWhenIdle: 'ai7:j09:start-task-when-idle',
  // 联网后开始任务 and its 取消 for every other kind that has a plan (Issue #760, S74c): one pair, keyed by kind.
  startTaskWhenOnline: 'ai7:j04:start-task-when-online',
  cancelWaitingTask: 'ai7:j04:cancel-waiting-task',
  cancelBaselineAnalysisRun: 'ai7:j04:cancel-baseline-analysis-run',
  pauseBaselineAnalysisRun: 'ai7:j04:pause-baseline-analysis-run',
  controlTaskRun: 'ai7:tasks:control-run',
  editTaskPlan: 'ai7:tasks:edit-plan',
  redoTaskPlan: 'ai7:tasks:redo-plan',
  quickStartReviewRun: 'ai7:review:quick-start',
  resumeBaselineAnalysisRun: 'ai7:j04:resume-baseline-analysis-run',
  editBaselineAnalysisPlan: 'ai7:j04:edit-baseline-analysis-plan',
  answerBaselineAnalysisClarification: 'ai7:j04:answer-baseline-analysis-clarification',
  runReconnectPreflight: 'ai7:j04:run-reconnect-preflight',
  quickStartBaselineAnalysis: 'ai7:j04:quick-start-baseline-analysis',
  setDefaultExecutionRule: 'ai7:j04:set-default-execution-rule',
  inspectDefaultExecutionRules: 'ai7:j04:inspect-default-execution-rules',
  deactivateDefaultExecutionRule: 'ai7:j04:deactivate-default-execution-rule',
  inspectBackgroundAnalysisEnrollment: 'ai7:j09:inspect-background-analysis-enrollment',
  enrollBackgroundAnalysis: 'ai7:j09:enroll-background-analysis',
  revokeBackgroundAnalysisEnrollment: 'ai7:j09:revoke-background-analysis-enrollment',
  holdBackgroundAnalysisEnrollment: 'ai7:j09:hold-background-analysis-enrollment',
  inspectReviewGuidelines: 'ai7:j15:inspect-review-guidelines',
  previewReviewGuidelineVersion: 'ai7:j15:preview-review-guideline-version',
  importReviewGuidelineVersion: 'ai7:j15:import-review-guideline-version',
  previewImportedExemplar: 'ai7:kb:preview-imported-exemplar',
  importEarlierExemplar: 'ai7:kb:import-earlier-exemplar',
  decideImportedExemplar: 'ai7:kb:decide-imported-exemplar',
  inspectExemplars: 'ai7:j07:inspect-exemplars',
  admitReadersReportExemplar: 'ai7:j07:admit-readers-report-exemplar',
  procedureLibrary: 'ai7:procedures:library',
  inspectKnowledgeProcedures: 'ai7:j15:inspect-knowledge-procedures',
  inspectCapturedProcedures: 'ai7:j15:inspect-captured-procedures',
  importSkillPackage: 'ai7:kb:import-skill-package',
  validateImportedSkill: 'ai7:kb:validate-imported-skill',
  installImportedSkill: 'ai7:kb:install-imported-skill',
  enableImportedSkill: 'ai7:kb:enable-imported-skill',
  inspectImportedSkills: 'ai7:kb:inspect-imported-skills',
  checkImportedSkillUpdate: 'ai7:kb:check-imported-skill-update',
  inspectImportedSkillUpdate: 'ai7:kb:inspect-imported-skill-update',
  adoptImportedSkillUpdate: 'ai7:kb:adopt-imported-skill-update',
  dismissImportedSkillUpdate: 'ai7:kb:dismiss-imported-skill-update',
  createImportedSkillUpdateRule: 'ai7:kb:create-imported-skill-update-rule',
  revokeImportedSkillUpdateRule: 'ai7:kb:revoke-imported-skill-update-rule',
  rollbackImportedSkill: 'ai7:kb:rollback-imported-skill',
  recommendProcedures: 'ai7:task:recommend-procedures',
  inspectCapturedProcedure: 'ai7:j15:inspect-captured-procedure',
  inspectDeveloperProposal: 'ai7:j15:inspect-developer-proposal',
  inspectProcedureCapture: 'ai7:j15:inspect-procedure-capture',
  saveCapturedProcedure: 'ai7:j15:save-captured-procedure',
  previewCapturedProcedureValidation: 'ai7:j15:preview-captured-procedure-validation',
  enableCapturedProcedure: 'ai7:j15:enable-captured-procedure',
  previewCapturedProcedureStop: 'ai7:j15:preview-captured-procedure-stop',
  stopCapturedProcedure: 'ai7:j15:stop-captured-procedure',
  inspectCapturedProcedureRun: 'ai7:j15:inspect-captured-procedure-run',
  inspectCapturedProcedureApplicability: 'ai7:j15:inspect-captured-procedure-applicability',
  // 自定义分析维度 (Issue #922, slice 7f): the house's dimensions in 知识库 › 工序与规则, and ②A's 自定义 tab over one Book.
  inspectCustomAnalysisDimensions: 'ai7:kb:inspect-custom-analysis-dimensions',
  saveCustomAnalysisDimension: 'ai7:kb:save-custom-analysis-dimension',
  enableCustomAnalysisDimension: 'ai7:kb:enable-custom-analysis-dimension',
  stopCustomAnalysisDimension: 'ai7:kb:stop-custom-analysis-dimension',
  prepareCustomAnalysis: 'ai7:j04:prepare-custom-analysis',
  saveDeveloperProposal: 'ai7:j15:save-developer-proposal',
  saveDeveloperProposalFile: 'ai7:j15:save-developer-proposal-file',
  inspectLibraryMaterials: 'ai7:j15:inspect-library-materials',
  previewLibraryMaterial: 'ai7:j15:preview-library-material',
  addLibraryMaterial: 'ai7:j15:add-library-material',
  decideLibraryMaterial: 'ai7:j15:decide-library-material',
  inspectLibraryMaterial: 'ai7:j15:inspect-library-material',
  inspectResearchEvidence: 'ai7:j04:inspect-research-evidence',
  saveEvidenceAsMaterial: 'ai7:j04:save-evidence-as-material',
  inspectFactualVerification: 'ai7:j04:inspect-factual-verification',
  inspectEvidenceWorkspace: 'ai7:j04:inspect-evidence-workspace',
  recordVerificationReviewDecision: 'ai7:j04:record-verification-review-decision',
  prepareCorrectionProposal: 'ai7:j04:prepare-correction-proposal',
  saveCorrectionProposal: 'ai7:j04:save-correction-proposal',
  inspectEvaluationProfiles: 'ai7:j11:inspect-evaluation-profiles',
  saveEvaluationProfile: 'ai7:kb:save-evaluation-profile',
  inspectEvaluation: 'ai7:j11:inspect-evaluation',
  startEvaluation: 'ai7:j11:start-evaluation',
  saveEvaluation: 'ai7:j11:save-evaluation',
  prepareInitialEvaluation: 'ai7:j11:prepare-initial-evaluation',
  authorizeInitialEvaluation: 'ai7:j11:authorize-initial-evaluation',
  prepareReadersReport: 'ai7:j11:prepare-readers-report',
  authorizeReadersReport: 'ai7:j11:authorize-readers-report',
  createReadersReportDraft: 'ai7:j11:create-readers-report-draft',
  prepareEvaluationRewrite: 'ai7:j11:prepare-evaluation-rewrite',
  authorizeEvaluationRewrite: 'ai7:j11:authorize-evaluation-rewrite',
  decideEvaluationRewrite: 'ai7:j11:decide-evaluation-rewrite',
  inspectWritingTask: 'ai7:j07:inspect-writing-task',
  prepareWritingTask: 'ai7:j07:prepare-writing-task',
  authorizeWritingTask: 'ai7:j07:authorize-writing-task',
  quickStartWritingTask: 'ai7:j07:quick-start-writing-task',
  createWritingDraft: 'ai7:j07:create-writing-draft',
  inspectAnalysisFeedback: 'ai7:j11:inspect-analysis-feedback',
  recordAnalysisFeedback: 'ai7:j11:record-analysis-feedback',
  readLibraryDecisionReason: 'ai7:j15:read-library-decision-reason',
  inspectLibraryMaterialSegments: 'ai7:j15:inspect-library-material-segments',
  buildMaterialVectors: 'ai7:j15:build-material-vectors',
  queryMaterialVectors: 'ai7:j15:query-material-vectors',
  requestMaterialTranslation: 'ai7:j15:request-material-translation',
  searchReferableMaterials: 'ai7:search-referable-materials',
  inspectHouseWordList: 'ai7:inspect-house-word-list',
  saveHouseWordList: 'ai7:save-house-word-list',
  inspectReviewWorkspace: 'ai7:j04:inspect-review-workspace',
  prepareReviewRun: 'ai7:j04:prepare-review-run',
  authorizeReviewRun: 'ai7:j04:authorize-review-run',
  continueReviewRun: 'ai7:j04:continue-review-run',
  recordReviewFindingDisposition: 'ai7:j04:record-review-finding-disposition',
  generateReviewReport: 'ai7:j04:generate-review-report',
  inspectReviewFindingOfMark: 'ai7:j04:inspect-review-finding-of-mark',
  listBooks: 'ai7:j01:list-books',
  updateBookPeople: 'ai7:j11:update-book-people',
  prepareNewBookReview: 'ai7:j01:prepare-new-book-review',
  commitNewBookImport: 'ai7:j01:commit-new-book-import',
  prepareSourceImportReview: 'ai7:j01:prepare-source-import-review',
  commitSourceImport: 'ai7:j01:commit-source-import',
  prepareManuscriptReimport: 'ai7:j01:prepare-manuscript-reimport',
  getReimportMappingPage: 'ai7:j01:get-reimport-mapping-page',
  getReimportLineageSourceVersionPage: 'ai7:j01:get-reimport-lineage-source-version-page',
  acceptReimportDegradation: 'ai7:j01:accept-reimport-degradation',
  resolveReimportMapping: 'ai7:j01:resolve-reimport-mapping',
  commitManuscriptReimport: 'ai7:j01:commit-manuscript-reimport',
  acknowledgeImportCompletion: 'ai7:j01:acknowledge-import-completion',
  getManuscriptWindow: 'ai7:j01:get-manuscript-window',
  readManuscriptImageChunk: 'ai7:manuscript:read-image-chunk',
  flushJournalEdit: 'ai7:j01:flush-journal-edit',
  // J-02 only (Issue #951, T0-1): the preload exposes it as a J-02 global, never as a `window.ai7` member.
  setEditJournalFault: 'ai7:j02:set-edit-journal-fault',
  recordManuscriptEntryPosition: 'ai7:j12:record-manuscript-entry-position',
  createEditorialMark: 'ai7:j05:create-editorial-mark',
  getEditorialMarkCard: 'ai7:j05:get-editorial-mark-card',
  updateEditorialMark: 'ai7:j05:update-editorial-mark',
  recordChangeSuggestionDecision: 'ai7:j05:record-change-suggestion-decision',
  recordProposalDecisionReason: 'ai7:j05:record-proposal-decision-reason',
  recordProposalDecisionFeedback: 'ai7:j11:record-proposal-decision-feedback',
  inspectEditorialLearning: 'ai7:learning:inspect-editorial-learning',
  inspectWordTrackedEditSample: 'ai7:j11:inspect-word-tracked-edit-sample',
  recordLearningReasonAsk: 'ai7:learning:record-reason-ask',
  changeEditorialLearning: 'ai7:learning:change-editorial-learning',
  createEditorialMemory: 'ai7:learning:create-editorial-memory',
  acceptEditorialMemory: 'ai7:learning:accept-editorial-memory',
  deactivateEditorialMemory: 'ai7:learning:deactivate-editorial-memory',
  inspectHouseReviewPreference: 'ai7:j11:inspect-house-review-preference',
  rebuildHouseReviewPreference: 'ai7:j11:rebuild-house-review-preference',
  inspectEditQualitySignals: 'ai7:j11:inspect-edit-quality-signals',
  inspectLearningMaterials: 'ai7:j11:inspect-learning-materials',
  decideLearningMaterial: 'ai7:j11:decide-learning-material',
  inspectLearningMaterial: 'ai7:j11:inspect-learning-material',
  inspectFeedbackHistory: 'ai7:j11:inspect-feedback-history',
  inspectLearningAudit: 'ai7:j11:inspect-learning-audit',
  inspectLearningLineage: 'ai7:j11:inspect-learning-lineage',
  previewLearningRemediation: 'ai7:j11:preview-learning-remediation',
  recordLearningRemediation: 'ai7:j11:record-learning-remediation',
  inspectEvaluationCalibration: 'ai7:j12:inspect-evaluation-calibration',
  recordPublicationActuals: 'ai7:j12:record-publication-actuals',
  setEvaluationPreferences: 'ai7:j12:set-evaluation-preferences',
  inspectSeriesList: 'ai7:j13:inspect-series-list',
  createSeries: 'ai7:j13:create-series',
  inspectSeries: 'ai7:j13:inspect-series',
  previewSeriesMembershipChange: 'ai7:j13:preview-series-membership-change',
  changeSeriesMembership: 'ai7:j13:change-series-membership',
  inspectBookSeries: 'ai7:j13:inspect-book-series',
  inspectSeriesMembers: 'ai7:j13:inspect-series-members',
  inspectSeriesCandidates: 'ai7:j13:inspect-series-candidates',
  inspectSeriesHistory: 'ai7:j13:inspect-series-history',
  proposeSeriesKnowledge: 'ai7:j13:propose-series-knowledge',
  inspectSeriesKnowledgeReview: 'ai7:j13:inspect-series-knowledge-review',
  editSeriesKnowledgeCandidate: 'ai7:j13:edit-series-knowledge-candidate',
  promoteSeriesKnowledge: 'ai7:j13:promote-series-knowledge',
  inspectSeriesKnowledgeItems: 'ai7:j13:inspect-series-knowledge-items',
  inspectSeriesKnowledgeCandidates: 'ai7:j13:inspect-series-knowledge-candidates',
  inspectSeriesKnowledgeRevisions: 'ai7:j13:inspect-series-knowledge-revisions',
  inspectSeriesExclusionTargets: 'ai7:j13:inspect-series-exclusion-targets',
  inspectSeriesExclusionHistory: 'ai7:j13:inspect-series-exclusion-history',
  previewSeriesExclusion: 'ai7:j13:preview-series-exclusion',
  recordSeriesExclusion: 'ai7:j13:record-series-exclusion',
  cancelReviewRun: 'ai7:j13:cancel-review-run',
  inspectDataVersion: 'ai7:j12:inspect-data-version',
  chooseDatabaseExportDestination: 'ai7:j12:choose-database-export-destination',
  approveDatabaseExport: 'ai7:j12:approve-database-export',
  inspectDatabaseExports: 'ai7:j12:inspect-database-exports',
  inspectScheduledBackups: 'ai7:j12:inspect-scheduled-backups',
  inspectUsage: 'ai7:w11:inspect-usage',
  exportUsageCsv: 'ai7:w11:export-usage-csv',
  setScheduledBackup: 'ai7:j12:set-scheduled-backup',
  chooseDatabaseImportFile: 'ai7:j12:choose-database-import-file',
  prepareDatabaseReplacement: 'ai7:j12:prepare-database-replacement',
  cancelDatabaseReplacement: 'ai7:j12:cancel-database-replacement',
  inspectDatabaseReplacements: 'ai7:j12:inspect-database-replacements',
  rollBackDatabaseReplacement: 'ai7:j12:roll-back-database-replacement',
  prepareDatabaseMerge: 'ai7:j12:prepare-database-merge',
  quitApplication: 'ai7:j12:quit-application',
  cancelDatabaseExport: 'ai7:j12:cancel-database-export',
  inspectSeriesKnowledgeConflicts: 'ai7:j13:inspect-series-knowledge-conflicts',
  applyChangeSuggestion: 'ai7:j05:apply-change-suggestion',
  applyChangeSuggestionBatch: 'ai7:j05:apply-change-suggestion-batch',
  reverseAppliedChangeSuggestion: 'ai7:j05:reverse-applied-change-suggestion',
  getManuscriptApplyOutcome: 'ai7:j05:get-manuscript-apply-outcome',
  inspectProposalWorkspace: 'ai7:j05:inspect-proposal-workspace',
  saveProposalDecisionDraft: 'ai7:j05:save-proposal-decision-draft',
  batchProposalDecisionDraft: 'ai7:j05:batch-proposal-decision-draft',
  recordProposalDecision: 'ai7:j05:record-proposal-decision',
  inspectApplyReceipt: 'ai7:j05:inspect-apply-receipt',
  prepareReverseApply: 'ai7:j05:prepare-reverse-apply',
  inspectProposalConflict: 'ai7:j06:inspect-proposal-conflict',
  saveProposalConflictDraft: 'ai7:j06:save-proposal-conflict-draft',
  resolveProposalConflict: 'ai7:j06:resolve-proposal-conflict',
  regenerateProposalConflictUnit: 'ai7:j06:regenerate-proposal-conflict-unit',
  getManuscriptRail: 'ai7:j02:get-manuscript-rail',
  runEditorClipboardCommand: 'ai7:j05:run-editor-clipboard-command',
  listPriorWork: 'ai7:j02:list-prior-work',
  getManuscriptWindowAt: 'ai7:j02:get-manuscript-window-at',
  getOutline: 'ai7:j02:get-outline',
  startSearch: 'ai7:j02:start-search',
  pollServiceJob: 'ai7:j02:poll-service-job',
  cancelServiceJob: 'ai7:j02:cancel-service-job',
  getSearchResults: 'ai7:j02:get-search-results',
  prepareReplacement: 'ai7:j02:prepare-replacement',
  freezeReplacement: 'ai7:j02:freeze-replacement',
  dismissReplacementPreview: 'ai7:j02:dismiss-replacement-preview',
  startReplacementCommit: 'ai7:j02:start-replacement-commit',
  commitReplacement: 'ai7:j02:commit-replacement',
  saveMilestone: 'ai7:j02:save-milestone',
  inspectDeliverables: 'ai7:j07:inspect-deliverables',
  designatePublicationVersion: 'ai7:j07:designate-publication-version',
  inspectProductionDocuments: 'ai7:j07:inspect-production-documents',
  inspectBookDeliveryPackage: 'ai7:j07:inspect-book-delivery-package',
  prepareBookDeliveryPackage: 'ai7:j07:prepare-book-delivery-package',
  reviewBookDeliveryPackageExport: 'ai7:j07:review-book-delivery-package-export',
  chooseBookDeliveryPackageExportFolder: 'ai7:j07:choose-book-delivery-package-export-folder',
  chooseBookDeliveryPackageArchiveDestination: 'ai7:j07:choose-book-delivery-package-archive-destination',
  approveBookDeliveryPackageArchiveExport: 'ai7:j07:approve-book-delivery-package-archive-export',
  cancelBookDeliveryPackageArchiveExport: 'ai7:j07:cancel-book-delivery-package-archive-export',
  approveBookDeliveryPackageExport: 'ai7:j07:approve-book-delivery-package-export',
  inspectMaintenanceCase: 'ai7:j07:inspect-maintenance-case',
  listMaintenanceCases: 'ai7:j07:list-maintenance-cases',
  recordMaintenanceCase: 'ai7:j07:record-maintenance-case',
  appendMaintenanceCaseRevision: 'ai7:j07:append-maintenance-case-revision',
  saveMaintenanceErrata: 'ai7:j07:save-maintenance-errata',
  cancelBookDeliveryPackageExport: 'ai7:j07:cancel-book-delivery-package-export',
  createProductionDocument: 'ai7:j07:create-production-document',
  renameProductionDocument: 'ai7:j07:rename-production-document',
  saveProductionDocumentType: 'ai7:derivatives:saveProductionDocumentType',
  deleteProductionDocumentType: 'ai7:derivatives:deleteProductionDocumentType',
  reorderProductionDocumentTypes: 'ai7:derivatives:reorderProductionDocumentTypes',
  updateProductionDocumentMeta: 'ai7:derivatives:updateProductionDocumentMeta',
  decideProductionDocumentType: 'ai7:j07:decide-production-document-type',
  saveProductionDocumentVersion: 'ai7:j07:save-production-document-version',
  recordProductionDocumentDelivery: 'ai7:j07:record-production-document-delivery',
  transitionProductionDocumentPhase: 'ai7:j07:transition-production-document-phase',
  inspectGlobalAgentDialogue: 'ai7:global-agent:dialogue',
  stopGlobalAgentAnswer: 'ai7:global-agent:stop',
  continueGlobalAgentAnswer: 'ai7:global-agent:continue',
  regenerateGlobalAgentAnswer: 'ai7:global-agent:regenerate',
  inspectGlobalAgent: 'ai7:global-agent:inspect',
  recordLearningSupervision: 'ai7:global-agent:supervise',
  askGlobalAgent: 'ai7:global-agent:ask',
  prepareGlobalAgentTurn: 'ai7:global-agent:prepare',
  inspectGlobalAttention: 'ai7:j09:inspect-global-attention',
  inspectTaskOverview: 'ai7:tasks:inspect-overview',
  reorderQueuedRun: 'ai7:tasks:reorder-queued-run',
  startQuickTasks: 'ai7:tasks:start-quick-tasks',
  taskOverviewCall: 'ai7:tasks:call',
  controlAllTasks: 'ai7:tasks:control-all',
  inspectBookTasks: 'ai7:j16:inspect-book-tasks',
  askAboutSelection: 'ai7:j16:ask-about-selection',
  inspectDialogue: 'ai7:j16:inspect-dialogue',
  stopDialogueAnswer: 'ai7:j16:stop-dialogue-answer',
  continueDialogueAnswer: 'ai7:j16:continue-dialogue-answer',
  regenerateDialogueAnswer: 'ai7:j16:regenerate-dialogue-answer',
  convertDialogueToChangeSuggestion: 'ai7:j16:convert-dialogue-to-change-suggestion',
  // Task Intent Drafts (Issue #423, wave 10 slice 7a; #52 S17b).
  inspectTaskIntentDrafts: 'ai7:j16:inspect-task-intent-drafts',
  saveTaskIntentDraft: 'ai7:j16:save-task-intent-draft',
  promoteTaskIntentDraft: 'ai7:j16:promote-task-intent-draft',
  promoteAnswerToTaskIntentDraft: 'ai7:j16:promote-answer-to-task-intent-draft',
  // Agent 工作区 (Issue #90, wave 13 slice 13a).
  inspectAgentWorkspace: 'ai7:j16:inspect-agent-workspace',
  proposeAgentWorkspaceChangeSet: 'ai7:j16:propose-agent-workspace-change-set',
  promoteAgentWorkspaceProposals: 'ai7:j16:promote-agent-workspace-proposals',
  discardAgentWorkspaceProposals: 'ai7:j16:discard-agent-workspace-proposals',
  inspectFastInteractionRoutes: 'ai7:j05:inspect-fast-interaction-routes',
  polishSelection: 'ai7:j05:polish-selection',
  inspectFastInteractionRequest: 'ai7:j05:inspect-fast-interaction-request',
  inspectAiEditLocks: 'ai7:j05:inspect-ai-edit-locks',
  setAiEditLocks: 'ai7:j05:set-ai-edit-locks',
  startScopedAiEdit: 'ai7:j05:start-scoped-ai-edit',
  inspectScopedAiEdit: 'ai7:j05:inspect-scoped-ai-edit',
  commitReplacementRevisions: 'ai7:j02:commit-replacement-revisions',
  reviewManuscriptExport: 'ai7:j07:review-manuscript-export',
  chooseManuscriptExportDestination: 'ai7:j07:choose-manuscript-export-destination',
  approveManuscriptExport: 'ai7:j07:approve-manuscript-export',
  revealManuscriptExport: 'ai7:j07:reveal-manuscript-export',
  undoManuscript: 'ai7:j02:undo-manuscript',
  redoManuscript: 'ai7:j02:redo-manuscript',
  openBookWorkbench: 'ai7:j12:open-book-workbench',
  getBookWorkbenchRoute: 'ai7:j12:get-book-workbench-route',
  leaveBookWorkbench: 'ai7:j12:leave-book-workbench',
  getHistoricalRevision: 'ai7:j12:get-historical-revision',
  getProductDataLocation: 'ai7:j12:get-product-data-location',
  revealProductDataLocation: 'ai7:j12:reveal-product-data-location',
  getModelServiceSettings: 'ai7:j12:get-model-service-settings',
  selectFastRoleModel: 'ai7:model-service:select-fast-model',
  selectMainRoleModel: 'ai7:model-service:select-main-model',
  selectBothRoleModels: 'ai7:model-service:select-both-models',
  refreshModelServiceModels: 'ai7:model-service:refresh-models',
  testModelServiceConnection: 'ai7:model-service:test-connection',
  selectSearchBackend: 'ai7:j12:select-search-backend',
  probeSearchBackend: 'ai7:j12:probe-search-backend',
  saveSearchBackendCredential: 'ai7:j12:save-search-backend-credential',
  removeSearchBackendCredential: 'ai7:j12:remove-search-backend-credential',
  saveModelServiceProxy: 'ai7:j12:save-model-service-proxy',
  saveModelServiceCredential: 'ai7:j12:save-model-service-credential',
  removeModelServiceCredential: 'ai7:j12:remove-model-service-credential',
} as const;

export const MAIN_EVENTS = {
  closeBlocked: 'ai7:j01:close-blocked',
  closeRiskChanged: 'ai7:j01:close-risk-changed',
  productReady: 'ai7:j01:product-ready',
  serviceInterrupted: 'ai7:j01:service-interrupted',
  bookWorkbenchRouteChanged: 'ai7:j12:book-workbench-route-changed',
} as const;

export type RendererCallResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * The Import Fidelity Review's content classes (ADR 0086 §1). A review parsed under
 * `ai7-docx-fflate-saxes/2` or `/3` carries all ten, in this order; one recorded under `/1` carries the
 * eight it had, without `text-boxes` and `fields`. `round-trip-export` is the closing 预计往返 card.
 */
export type FidelityCategoryKey =
  | 'inline-styles'
  | 'comments-revisions'
  | 'notes'
  | 'tables'
  | 'images-captions'
  | 'sections'
  | 'headers-footers'
  | 'text-boxes'
  | 'fields'
  | 'round-trip-export';

/** `retained`: present in the file and kept with the Source Version, restored on export (ADR 0086 §2). */
export type FidelityStatus = 'preserved' | 'retained' | 'degraded' | 'unsupported';

export interface FidelityCategoryProjection {
  key: FidelityCategoryKey;
  label: string;
  count: number;
  status: FidelityStatus;
  statusLabel: '完整保留' | '完整保留（随文件保留）' | '降级导入' | '不支持导入';
  detail: string;
}

/** How a text box enters the Manuscript: kept as a text box with the file (the default), or merged. */
export type TextBoxDisposition = 'retain' | 'merge';

/** The label every status reads as, the one mapping a persisted row's status is read back through. */
export function fidelityStatusLabel(status: FidelityStatus): FidelityCategoryProjection['statusLabel'] {
  if (status === 'preserved') return '完整保留';
  if (status === 'retained') return '完整保留（随文件保留）';
  if (status === 'degraded') return '降级导入';
  return '不支持导入';
}

export interface ImportDegradationItemProjection {
  categoryKey: FidelityCategoryKey;
  label: string;
  count: number;
}

export type ImportDegradationDecisionReviewProjection =
  | { state: 'not-required-clean-import'; items: ReadonlyArray<never> }
  | { state: 'required-unselected'; items: ReadonlyArray<ImportDegradationItemProjection> }
  | { state: 'accepted-complete-set'; items: ReadonlyArray<ImportDegradationItemProjection> };

export type ImportFidelityOutcome = 'clean-import-no-round-trip' | 'degraded-import-no-round-trip';

export type NewBookImportTargetChoiceId = 'new-book' | 'new-book-distinct-intended-work';

export type ImportTargetSelection =
  | {
      kind: 'new-book';
      choiceId: NewBookImportTargetChoiceId;
      confirmedTitle: string;
    }
  | {
      kind: 'existing-book';
      bookId: string;
      relationship: 'first-manuscript';
    };

export type SourceImportTargetSelection =
  | {
      kind: 'new-book';
      choiceId: NewBookImportTargetChoiceId;
      confirmedTitle: string;
      relationship: 'source-only';
    }
  | {
      kind: 'existing-book';
      bookId: string;
      relationship: 'source-only';
      reuseSourceVersionId: string | null;
    };

export type ReimportLineageSelection =
  | { kind: 'verified-source-version'; sourceVersionId: string }
  | { kind: 'unconfirmed' };

export interface ManuscriptReimportTargetSelection {
  kind: 'existing-book';
  bookId: string;
  relationship: 'reimport';
  lineage: ReimportLineageSelection;
  reuseSourceVersionId: string | null;
}

export interface BookCreationReviewProjection {
  reviewDigest: string;
  proposed: {
    bookId: string;
    stableIdentity: string;
    title: string;
    internalNumber: string | null;
  };
  recordsToCreate: readonly ['图书与稳定标识', '图书编辑维度集（8 项）'];
  nonEffects: readonly [
    '不创建稿件、来源、修订版、工作流实例或导入记录',
    '不创建书系或书系成员关系',
    '不创建编辑学习准入决定',
    '不授予或执行模型提供方传输',
    '不创建发稿版本',
    '不创建公开发布许可或公开发布事实',
    '不导出、不发送、不交付、不发布',
  ];
  editorialDimensionSet: {
    profileId: string;
    name: string;
    profileVersion: string;
    digest: string;
    weightSemantics: '中性起始权重；非穷尽评分量表';
    dimensions: ReadonlyArray<{ id: string; label: string; weight: number }>;
  };
}

export type BookRecordPresentation =
  | {
      kind: 'book';
      label: '图书';
      bookId: string;
      stableIdentity: string;
      title: string;
      internalNumber: string | null;
      createdAt: string;
      dimensionSetId: string;
      dimensionSetDigest: string;
    }
  | {
      kind: 'manuscript';
      label: '主稿件';
      manuscriptId: string;
      bookId: string;
      role: 'primary';
      createdAt: string;
    }
  | {
      kind: 'revision';
      label: string;
      revisionId: string;
      manuscriptId: string;
      branchId: string;
      revisionLabel: string;
      revisionDigest: string;
      sourceVersionId: string;
      createdAt: string;
    }
  | {
      kind: 'source';
      label: '来源版本与来源记录';
      sourceVersionId: string;
      provenanceId: string;
      bookId: string;
      displayName: string;
      format: SourceFormat;
      sourceDigest: string;
      /** Null together, for a retained original the product never parsed (ADR 0072 §2). */
      contentDigest: string | null;
      structureDigest: string | null;
      parserIdentity: string | null;
      /**
       * Null together, and set only for an original the product read through a converted DOCX
       * working representation: the object the Manuscript was read from, and who converted it. The
       * digest of record above stays the original file's (ADR 0072 §2).
       */
      workingObjectDigest: string | null;
      converterIdentity: string | null;
      acquisitionPath: 'native-file-picker';
      locality: 'local-provider-free';
    }
  | {
      kind: 'workflow';
      label: '工作流实例与精确 Profile 绑定';
      workflowInstanceId: string;
      bookId: string;
      manuscriptId: string;
      currentPhase: string;
      state: 'active';
      projection: { id: string; version: string; digest: string };
      nativeProfile: { id: string; version: string; digest: string };
    }
  | {
      kind: 'import-record';
      label: '稿件导入记录';
      importRecordId: string;
      commitId: string;
      bookId: string;
      manuscriptId: string;
      sourceVersionId: string;
      fidelityReviewId: string;
      fidelityOutcome: ImportFidelityOutcome;
      fidelityCategories: ReadonlyArray<FidelityCategoryProjection>;
      degradationDecisionId: string | null;
      degradationDecision:
        | {
            summaryLabel: '含已接受的降级';
            acceptedItems: ReadonlyArray<ImportDegradationItemProjection>;
          }
        | null;
      resultingRevisionId: string;
      provenanceId: string;
      importedAt: string;
    }
  | {
      kind: 'source-import-record';
      label: '来源导入记录';
      sourceImportRecordId: string;
      commitId: string;
      bookId: string;
      sourceVersionId: string;
      provenanceId: string;
      targetKind: 'new-book' | 'existing-book';
      sourceVersionDisposition: 'created' | 'reused-same-book';
      retainedBoundary: {
        kind: 'complete-local-file';
        label: SourceImportRetainedBoundaryLabel;
        format: SourceFormat;
        displayName: string;
        sourceSha256: string;
        sourceBytes: number;
        contentDigest: string | null;
        structureDigest: string | null;
      };
      namedNonEffects: ReadonlyArray<string>;
      recordDigest: string;
      importedAt: string;
    }
  | {
      kind: 'manuscript-reimport-record';
      label: '稿件重新导入记录';
      reimportRecordId: string;
      commitId: string;
      bookId: string;
      manuscriptId: string;
      sourceVersionId: string;
      provenanceId: string;
      previousRevisionId: string;
      resultingRevisionId: string | null;
      resultKind: 'changed' | 'no-change';
      resultLabel: '稿件已重新导入' | '未发现稿件变化';
      lineageStatus: 'verified' | 'unconfirmed';
      lineageLabel: '来源关系已确认' | '来源关系未确认';
      lineageSourceVersionId: string | null;
      comparisonKind: 'three-way' | 'two-way';
      comparisonDigest: string;
      resolutionDigest: string;
      fidelityReviewId: string;
      fidelityOutcome: ImportFidelityOutcome;
      fidelityCategories: ReadonlyArray<FidelityCategoryProjection>;
      degradationDecisionId: string | null;
      degradationDecision:
        | { summaryLabel: '含已接受的降级'; acceptedItems: ReadonlyArray<ImportDegradationItemProjection> }
        | null;
      /**
       * The chapter-level rows the editor resolved, in order, each with its verb (Issue #412, S63): at most
       * `MAX_REIMPORT_RECORD_ITEMS`, the count saying how many there were. None for a record before them.
       */
      groups: { count: number; items: ReadonlyArray<ReimportRecordGroupProjection> };
      /** What each editorial mark of a changed row came to: followed to its words, or listed as unable to follow. */
      markOutcomes: { followed: number; unfollowed: number; items: ReadonlyArray<ReimportUnfollowedMarkProjection> };
      recordDigest: string;
      importedAt: string;
    };

/** At most this many rows and unfollowed marks a Manuscript Reimport Record lists; its counts say how many there were. */
export const MAX_REIMPORT_RECORD_ITEMS = 50;

/** The verb that resolved one row of a chapter-level Reimport Comparison (Issue #412, S63; V2-UX-IMP-057). */
export type ReimportGroupVerb = 'split' | 'rewrite' | 'delete' | 'merge';

export const REIMPORT_GROUP_VERB_LABELS: Readonly<Record<ReimportGroupVerb, '拆分' | '改写与新增' | '删除' | '并入'>> = Object.freeze({
  split: '拆分',
  rewrite: '改写与新增',
  delete: '删除',
  merge: '并入',
});

export interface ReimportRecordGroupProjection {
  ordinal: number;
  verb: ReimportGroupVerb;
  verbLabel: string;
  chapterLabel: string | null;
  currentFrom: number | null;
  currentTo: number | null;
  stagedFrom: number | null;
  stagedTo: number | null;
}

/** One editorial mark that could not follow the new file: set aside from the text, kept, and listed for the editor. */
export interface ReimportUnfollowedMarkProjection {
  markId: string;
  kind: EditorialMarkKind;
  /** The words the mark was on, as it recorded them. */
  words: string;
  /** Where it stood in the revision the reimport replaced, 1-based. */
  fromPosition: number;
}

export interface BookHistoryCursor {
  occurredAt: string;
  kindRank: number;
  stableId: string;
  direction: 'forward' | 'backward';
}

/**
 * The Manuscript Visual Anchor a Book Work Overview leads with (V2-UX-BOOK-001): the Revision the
 * branch works on, where the editor last was, and whether the local edits are already in the journal
 * — the three readings that belong above every record the overview carries, with `打开稿件` as their
 * continuation action.
 *
 * `entry` is the same value the Book route enters the Manuscript at (V2-UX-RET-002), which is why it
 * rides here rather than behind a surface member of its own: the entry route already reads this
 * projection, so it needs nothing else to know where to go. `null` means the Book has no remembered
 * position and the Manuscript opens at its start. Everything in it speaks the window projection's own
 * vocabulary, so `blockId` goes straight into a `block` window target with no translation.
 */
export interface BookManuscriptAnchorProjection {
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  journalLabel: '已写入修订日志' | '与当前修订版一致';
  entry: null | {
    blockId: string;
    grapheme: number;
    blockPosition: number;
    totalBlocks: number;
    structureLabel: string | null;
    /** How an editor reads that position. The block identity is never the reading (V2-UX-LAYER-001). */
    label: string;
    /**
     * `exact` when the recorded Revision is still the branch's own and the block it named is still
     * there; `nearest-anchor` when the position was superseded and the nearest surviving block
     * answered for it (Issue #467). A surface says which it was rather than presenting the second
     * as the first.
     */
    state: 'exact' | 'nearest-anchor';
  };
}

export interface BookWorkOverviewProjection {
  book: {
    bookId: string;
    stableIdentity: string;
    title: string;
    internalNumber: string | null;
    createdAt: string;
  };
  /** 作者, 责编 and 相关人 (Issue #431, S83; BOOK-006). */
  people: BookPeopleProjection;
  manuscriptState:
    | { state: 'empty'; label: '尚无稿件' }
    | { state: 'populated'; label: '已有主稿件'; manuscriptId: string };
  primaryAction:
    | { kind: 'import-first-manuscript'; label: '导入首份稿件'; bookId: string }
    | { kind: 'open-manuscript'; label: '打开稿件'; manuscriptId: string; branchId: string };
  /** `null` for a Book with no primary Manuscript, which states 尚无稿件 and offers the first import. */
  manuscriptAnchor: BookManuscriptAnchorProjection | null;
  records: ReadonlyArray<BookRecordPresentation>;
  historyPage: {
    previousCursor: BookHistoryCursor | null;
    nextCursor: BookHistoryCursor | null;
  };
}

export interface EditorialWorkspaceProfileProjection {
  bookId: string;
  identity: '@ai7/editorial-workspace-profile';
  kind: 'DSH Profile';
  version: '1.0.0';
  provenance: '仓库内置';
  license: 'AI7 root license';
  source: 'config/native-artifact-sources/editorial-workspace-profile/package.json';
  byteLength: 263;
  sha256: 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d';
  compatibility: '声明式 · Provider-free · 兼容';
  sidecar: {
    identity: 'ai7.editorial-workspace-profile.authority';
    revisions: readonly [
      {
        revision: 1;
        byteLength: 588;
        sha256: '887067fc716261fc5f41772a295faa326f6bf2818573daae29ffdb7388e9e48d';
        compatibility: 'compatible-declarative-provider-free';
        authorityCeiling: {
          modelRoles: readonly ['Main Editorial Role'];
          capabilities: readonly [];
          readableScopeKinds: readonly [];
          providerBindings: readonly [];
          credentialAccess: false;
          networkAccess: false;
          effectClasses: readonly [];
          backgroundAnalysisEnrollment: false;
          applyAuthority: false;
        };
      },
      {
        revision: 2;
        byteLength: 660;
        sha256: '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff';
        compatibility: 'compatible-declarative-provider-free';
        authorityCeiling: {
          modelRoles: readonly ['Main Editorial Role'];
          capabilities: readonly [];
          readableScopeKinds: readonly [
            'current-book-primary-manuscript-revision',
            'current-book-source-version',
          ];
          providerBindings: readonly [];
          credentialAccess: false;
          networkAccess: false;
          effectClasses: readonly [];
          backgroundAnalysisEnrollment: false;
          applyAuthority: false;
        };
      },
    ];
    pinHistory: ReadonlyArray<
      | {
          revision: 1;
          sha256: '887067fc716261fc5f41772a295faa326f6bf2818573daae29ffdb7388e9e48d';
          pinnedAt: string;
        }
      | {
          revision: 2;
          sha256: '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff';
          pinnedAt: string;
        }
    >;
    activeRevision: 1 | 2 | null;
    offeredRevision: 2 | null;
  };
  lifecycle: {
    state: 'available-to-install' | 'installed-disabled' | 'enabled-for-book' | 'unavailable-needs-attention';
    label: '可获取 · 尚未安装' | '已安装 · 本图书停用' | '已安装 · 已为本图书启用' | '不可用 · 需要处理';
    installed: boolean;
    enabledForCurrentBook: boolean;
  };
  actions: {
    canInstall: boolean;
    canEnable: boolean;
  };
  namedNonEffects: readonly [
    '不创建 Task、Plan、Run 或 Session',
    '不读取图书、稿件或来源内容',
    'Revision 2 仅扩大可请求范围，不创建实际读取或运行权限',
    '不授予 Provider、凭据、网络、Effect、Enrollment 或 Apply 权限',
  ];
}

export interface BookSummaryProjection {
  bookId: string;
  stableIdentity: string;
  title: string;
  internalNumber: string | null;
  /** 作者, 责编 and 相关人 for the card (Issue #431, S83). */
  people: { authors: ReadonlyArray<string>; editors: ReadonlyArray<string>; related: ReadonlyArray<{ roleLabel: string; name: string }> };
  manuscriptState: 'empty' | 'populated';
  manuscriptStateLabel: '尚无稿件' | '已有主稿件';
  reimportLineageSourceVersionIds: ReadonlyArray<string>;
  reimportLineageNextCursor: string | null;
}

export interface BookSummaryCursor {
  title: string;
  bookId: string;
}

// ---- 作者 · 责编 · 相关人 (Issue #431, plan slice S83; V2-UX-BOOK-006, FDBK-013) -------------------------------------------

/** One name, in characters (code points) once NFC-normalized and trimmed. */
export const MAX_BOOK_PERSON_NAME_CHARACTERS = 40;

export const MAX_BOOK_AUTHORS = 10;

export const MAX_BOOK_EDITORS = 10;

export const MAX_BOOK_RELATED_PEOPLE = 30;

/** Separates several names in one field: 「张三、李四」. A name never holds one. */
export const BOOK_PEOPLE_NAME_SEPARATOR = '、';

/** One 相关人: a role of the house list, and a name. */
export interface BookRelatedPersonProjection {
  roleId: string;
  roleLabel: string;
  name: string;
}

/** A Book's 作者, 责编 and 相关人 as its newest version records them; attribution dimensions, never accounts. */
export interface BookPeopleProjection {
  /** 0 before the first save. */
  version: number;
  authors: ReadonlyArray<string>;
  editors: ReadonlyArray<string>;
  related: ReadonlyArray<BookRelatedPersonProjection>;
  /** The house's role list the form offers, in its order. */
  roles: ReadonlyArray<{ roleId: string; label: string }>;
  recordedAt: string | null;
}

/** `保存人员`: the whole set, against the version the editor read. */
export interface UpdateBookPeopleInput {
  bookId: string;
  expectedVersion: number;
  authors: ReadonlyArray<string>;
  editors: ReadonlyArray<string>;
  related: ReadonlyArray<{ roleId: string; name: string }>;
}

export interface BookPeopleResultProjection {
  bookId: string;
  outcome: 'recorded' | 'unchanged';
  completionLabel: '人员已保存' | '人员没有变化';
  people: BookPeopleProjection;
}

/** 书库's search (IA-008, BOOK-006): one field — or all of 书名, 作者, 责编 and 书系 — holding the words. */
export interface BookSummaryFilter {
  /** `series` (Issue #63, S28a): the Book is now in a Series whose name holds the words. */
  field: 'all' | 'title' | 'author' | 'editor' | 'series';
  text: string;
}

export const MAX_BOOK_SUMMARY_FILTER_CHARACTERS = 40;

export interface BookSummaryPageProjection {
  items: ReadonlyArray<BookSummaryProjection>;
  nextCursor: BookSummaryCursor | null;
}

export interface BookCreationCommitProjection {
  completionLabel: '图书已创建';
  overview: BookWorkOverviewProjection;
}

/**
 * What the intake router identified the selected file as, from its content (ADR 0072 §1). Only
 * `DOCX` is read natively; every other member is retained source-only, with no parse.
 */
export type SourceFormat = 'DOCX' | 'DOC' | 'PDF' | 'ODT' | 'RTF' | 'TXT' | 'MD' | 'UNKNOWN';

/**
 * What a source-only import retained. The first label belongs to a DOCX the product parsed itself. The next three
 * belong to a TXT, Markdown or `.doc` file it read through a converter: each names the original format and says it was
 * converted (Issue #583). The last belongs to an original the product kept whole without parsing, so it claims no
 * content or structure identity it did not derive.
 */
export type SourceImportRetainedBoundaryLabel =
  | '保留完整所选 DOCX 文件及本地解析出的完整内容与结构身份'
  | '保留完整所选 TXT 文件及本地转换出的完整内容与结构身份（已转换）'
  | '保留完整所选 MD 文件及本地转换出的完整内容与结构身份（已转换）'
  | '保留完整所选 DOC 文件及本地转换出的完整内容与结构身份（已转换）'
  | '保留完整所选原始文件及其精确身份；未进行本地解析';

/** The label a new Source Import Record carries for a file of this format, parsed or kept whole (Issue #583). */
export function sourceImportRetainedBoundaryLabel(
  format: SourceFormat,
  parsed: boolean,
): SourceImportRetainedBoundaryLabel {
  if (!parsed) return '保留完整所选原始文件及其精确身份；未进行本地解析';
  switch (format) {
    case 'TXT':
    case 'MD':
    case 'DOC':
      return `保留完整所选 ${format} 文件及本地转换出的完整内容与结构身份（已转换）`;
    default:
      return '保留完整所选 DOCX 文件及本地解析出的完整内容与结构身份';
  }
}

/**
 * The labels a stored Source Import Record of this format may carry. A record written before Issue #583 labelled a
 * converted TXT, Markdown or `.doc` file with the DOCX label, and the label is part of the record digest, so both
 * stay valid on those formats; nothing else is accepted.
 */
export function acceptedSourceImportRetainedBoundaryLabels(
  format: SourceFormat,
  parsed: boolean,
): ReadonlyArray<SourceImportRetainedBoundaryLabel> {
  const current = sourceImportRetainedBoundaryLabel(format, parsed);
  return parsed && (format === 'TXT' || format === 'MD' || format === 'DOC')
    ? [current, sourceImportRetainedBoundaryLabel('DOCX', true)]
    : [current];
}

/** An explicit choice for supported native tracked Word intake; accepted mode requires its own confirmation. */
export interface WordTrackedChangesChoice {
  mode: 'suggestions' | 'accepted-baseline';
  learnFromEdits: boolean;
  acceptedBaselineConfirmed: boolean;
}

export type WordSampleDetailSection = 'before' | 'after' | 'events' | 'imports';

export type WordSampleDetailField = 'text' | 'rawId' | 'rawAuthor' | 'rawDate' | 'rangeName' | 'record';

export interface WordSampleCursorProjection {
  schema: 'ai7.word-sample-cursor/1'; sampleDigest: string; detailDigest: string; section: WordSampleDetailSection;
  entryOrdinal: number; field: WordSampleDetailField; codeUnitOffset: number;
}

export interface InspectWordTrackedEditSampleInput {
  bookId: string; sampleId: string; sampleDigest: string; after: WordSampleCursorProjection | null;
}

export type WordSourceFragmentProjection =
  | { kind: 'text'; part: string; paragraphIndex: number; atomOrdinal: number; fromCodeUnit: number; toCodeUnit: number; codeUnits: number; sha256: string }
  | { kind: 'paragraph-boundary'; part: string; paragraphIndex: number; atomOrdinal: number; sha256: string };

/** A transport projection of the existing policy basis, whose value remains owned by local learning. */
export interface WordLocalLearningBasisProjection {
  policy: 'ai7.learning-eligibility-policy'; mode: 'opt-out-local'; version: 2; authority: 'ADR 0094 §3'; rules: readonly [2, 5]; text: string;
}

export type WordControlReferenceProjection = { kind: 'entry'; entryId: string; sha256: string } |
  { kind: 'default'; basis: WordLocalLearningBasisProjection };

export interface WordLocalImportAdmissionProjection {
  schema: 'ai7.word-local-import-admission/1'; sampleId: string; sampleDigest: string; importChoiceDigest: string;
  basis: WordLocalLearningBasisProjection; reviewedLearnFromEdits: true;
  global: { enabled: true; reference: WordControlReferenceProjection };
  book: { excluded: false; reference: WordControlReferenceProjection };
  standing: { choice: 'book' | 'house'; decisionId: string | null; decisionDigest: string | null; basisVersion: number };
}

export type WordSampleDetailRecordProjection =
  | { type: 'fragment'; fragment: WordSourceFragmentProjection }
  | { type: 'event'; eventId: string;
      kind: 'ins' | 'del' | 'moveFrom' | 'moveTo' | 'moveFromRangeStart' | 'moveFromRangeEnd' | 'moveToRangeStart' | 'moveToRangeEnd' |
        'commentRangeStart' | 'commentRangeEnd' | 'commentReference';
      context: 'run' | 'paragraph-boundary' | 'range' | 'comment'; part: string; elementOrdinal: number;
      location: { part: string; paragraphIndex: number; atomOrdinal: number; codeUnitOffset: number };
      disposition: 'visible-transition' | 'no-visible-transition' | 'range' | 'comment'; parentCount: number; rangeLinkCount: number }
  | { type: 'event-link'; eventId: string; relation: 'parent' | 'range'; linkedEventId: string; ordinal: number }
  | { type: 'import'; commitId: string; mode: WordTrackedChangesChoice['mode']; sourceVersionId: string; sourceDigest: string;
      parentSourcePinDigest: string; importReviewId: string; fidelityReviewId: string; revisionId: string; choiceDigest: string; admissionDigest: string;
      workingObjectDigest: string | null; compilerIdentity: string; extractorIdentity: 'ai7-word-tracked-extractor/1'; graphDigest: string;
      readings: Record<'rejected' | 'accepted', { digest: string; blockCount: number; usable: boolean }>;
      mappingDigest: string; templateManifestDigest: string; learnFromEdits: boolean; acceptedBaselineConfirmed: boolean }
  | { type: 'import-admission'; commitId: string; basis: WordLocalImportAdmissionProjection };

export type WordSampleDetailItemProjection = {
  section: WordSampleDetailSection; entryOrdinal: number; sourceOrdinal: number; childOrdinal: number | null;
} & (
  | { kind: 'text'; field: Exclude<WordSampleDetailField, 'record'>; text: string | null; sha256: string | null; fragment: WordSourceFragmentProjection | null;
      startCodeUnit: number; endCodeUnit: number; totalCodeUnits: number; complete: boolean }
  | { kind: 'record'; field: 'record'; record: WordSampleDetailRecordProjection; complete: true }
);

export interface WordTrackedEditSampleDetailProjection {
  bookId: string; sampleId: string; sampleDigest: string; detailDigest: string; sourceVersionId: string; sourceDigest: string;
  operationKind: 'insert' | 'delete' | 'replace' | 'move' | 'paragraph-boundary'; sectionCounts: Record<WordSampleDetailSection, number>;
  items: WordSampleDetailItemProjection[]; nextCursor: WordSampleCursorProjection | null;
}

export type WordIntakeRefusalCode = 'table-revision' | 'custom-xml-or-math-revision' | 'story-or-text-box-revision' |
  'incompatible-paragraph-join' | 'invalid-move-graph' | 'unrepresentable-comment' | 'unusable-reading' | 'resource-limit';

export type WordTrackedChangesIntakeProjection =
  | { compatibility: 'ready'; previewReading: 'rejected' | 'accepted';
      readings: Record<'rejected' | 'accepted', { usable: boolean; blockCount: number }>;
      savedChoice: WordTrackedChangesChoice | null }
  | { compatibility: 'unsupported'; reasonCodes: ReadonlyArray<WordIntakeRefusalCode>; locationCount: number };

export interface StagedImportProjection {
  draftId: string;
  draftVersion: number;
  source: {
    displayName: string;
    format: SourceFormat;
    sourceSha256: string;
    sourceBytes: number;
    provenanceLabel: '本机文件选择器 · 本地解析 · 未联网';
    /** What this draft was actually read through, or null when the file was read natively. */
    conversion: ManuscriptConversionProjection | null;
    /** The working representation's own digest, never the digest of record (ADR 0072 §2). */
    workingObjectSha256: string | null;
  };
  editableImport: EditableImportProjection;
  titleSuggestion: {
    value: string;
    sourceLabel: 'DOCX 标题元数据' | '文件名';
  };
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>;
  targetChoices: ReadonlyArray<
    | {
        kind: 'new-book';
        id: NewBookImportTargetChoiceId;
        label: '新建图书' | '新建图书（作为不同作品）';
        selected: false;
      }
    | {
        kind: 'existing-book';
        id: string;
        bookId: string;
        label: string;
        internalNumber: string | null;
        manuscriptState: 'empty' | 'populated';
        reimportLineageSourceVersionIds: ReadonlyArray<string>;
        reimportLineagePageAfter: string | null;
        reimportLineagePreviousCursor: string | null;
        reimportLineageNextCursor: string | null;
        selected: false;
      }
  >;
  nextBookCursor: BookSummaryCursor | null;
  fidelity: ReadonlyArray<FidelityCategoryProjection>;
  detectedBlockCount: number;
  wordTrackedChanges?: WordTrackedChangesIntakeProjection;
  /** Candidate headings and split paragraphs (Issue #1205); absent when the reading offers neither. */
  structure?: ImportStructureProjection;
}

export interface ReviewBeforeImportProjection {
  draftId: string;
  draftVersion: number;
  reviewDigest: string | null;
  commitAttemptId: string | null;
  target:
    | {
        choiceId: NewBookImportTargetChoiceId;
        kind: 'new-book';
        label: '新建图书' | '新建图书（作为不同作品）';
        confirmedTitle: string;
      }
    | {
        choiceId: string;
        kind: 'existing-book';
        label: string;
        bookId: string;
        stableIdentity: string;
        internalNumber: string | null;
        relationship: 'first-manuscript';
        relationshipLabel: '作为首份稿件导入';
        bookStateDigest: string;
      };
  source: StagedImportProjection['source'];
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>;
  fidelity: ReadonlyArray<FidelityCategoryProjection>;
  /**
   * The review's choice for the file's text boxes (ADR 0086 §2), which its `text-boxes` row states:
   * `retain` (保留为文本框, the default) or `merge` (并入正文); null when the file has none it can choose for.
   */
  textBoxDisposition: TextBoxDisposition | null;
  /** The staged structure and the choice the review was formed with (Issue #1205), when the staged draft offered one. */
  structure?: { projection: ImportStructureProjection; choice: ImportStructureChoice };
  trackedChanges?: WordTrackedChangesChoice;
  wordLearning?: { globalEnabled: boolean; bookExcluded: boolean; sourceTemplateCount: number; eligibleSampleCount: number };
  recordsToCreate: ReadonlyArray<string>;
  nonEffects: ReadonlyArray<string>;
  workflowProfile: {
    id: string;
    name: string;
    version: string;
    digest: string;
    nativeProfile: { id: string; version: string; digest: string };
  };
  editorialDimensionSet: {
    profileId: string;
    name: string;
    profileVersion: string;
    digest: string;
    weightSemantics: '中性起始权重；非穷尽评分量表';
    dimensions: ReadonlyArray<{
      id: string;
      label: string;
      weight: number;
    }>;
  };
  degradationDecision: ImportDegradationDecisionReviewProjection;
}

export interface ReviewBeforeSourceImportProjection {
  draftId: string;
  draftVersion: number;
  reviewDigest: string;
  commitAttemptId: string | null;
  target:
    | {
        choiceId: NewBookImportTargetChoiceId;
        kind: 'new-book';
        label: '新建图书' | '新建图书（作为不同作品）';
        confirmedTitle: string;
        bookId: string;
        stableIdentity: string;
        relationship: 'source-only';
        relationshipLabel: '作为来源材料导入';
      }
    | {
        choiceId: string;
        kind: 'existing-book';
        label: string;
        bookId: string;
        stableIdentity: string;
        internalNumber: string | null;
        relationship: 'source-only';
        relationshipLabel: '作为来源材料导入';
        bookStateDigest: string;
      };
  source: StagedImportProjection['source'];
  identityFindings: ReadonlyArray<ImportIdentityFindingProjection>;
  retainedBoundary: {
    kind: 'complete-local-file';
    label: SourceImportRetainedBoundaryLabel;
    format: SourceFormat;
    displayName: string;
    sourceSha256: string;
    sourceBytes: number;
    contentDigest: string | null;
    structureDigest: string | null;
  };
  provenance: {
    acquisitionPath: 'native-file-picker';
    locality: 'local-provider-free';
    label: '本机文件选择器 · 本地解析 · 未联网';
    acquiredAt: string;
  };
  sourceVersionResult:
    | { disposition: 'created'; label: '创建所选图书拥有的新来源版本'; sourceVersionId: null }
    | {
        disposition: 'reused-same-book';
        label: '复用已明确选择的同图书来源版本';
        sourceVersionId: string;
      };
  recordsToCreate: ReadonlyArray<string>;
  namedNonEffects: ReadonlyArray<string>;
  editorialDimensionSet: {
    createdWithBook: boolean;
    profileId: string;
    name: string;
    profileVersion: string;
    digest: string;
    weightSemantics: '中性起始权重；非穷尽评分量表';
    dimensions: ReadonlyArray<{ id: string; label: string; weight: number }>;
  };
}

export interface ReimportMappingProjection {
  mappingId: string;
  position: number;
  changeKind: 'unchanged' | 'move' | 'edit' | 'insert' | 'delete';
  currentBlockId: string | null;
  lineageBlockId: string | null;
  stagedBlockId: string | null;
  currentText: string | null;
  lineageText: string | null;
  stagedText: string | null;
  state: 'resolved' | 'unresolved';
  identityConsequence: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity' | null;
  resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity' | null;
  resolvedCurrentBlockId: string | null;
}

export interface ReviewBeforeManuscriptReimportProjection {
  draftId: string;
  draftVersion: number;
  reviewDigest: string;
  commitAttemptId: string | null;
  target: {
    kind: 'existing-book';
    bookId: string;
    stableIdentity: string;
    label: string;
    internalNumber: string | null;
    manuscriptId: string;
    branchId: string;
    relationship: 'reimport';
    relationshipLabel: '重新导入主稿件';
    bookStateDigest: string;
  };
  checkpoint: {
    revisionId: string;
    revisionLabel: string;
    revisionDigest: string;
    journalSequence: number;
    createdForDirtyJournal: boolean;
  };
  lineage:
    | {
        status: 'verified';
        label: '来源关系已确认';
        comparisonKind: 'three-way';
        sourceVersionId: string;
        revisionId: string;
      }
    | {
        status: 'unconfirmed';
        label: '来源关系未确认';
        comparisonKind: 'two-way';
        sourceVersionId: null;
        revisionId: null;
      };
  source: StagedImportProjection['source'];
  sourceVersionResult:
    | { disposition: 'created'; label: '创建所选图书拥有的新来源版本'; sourceVersionId: null }
    | { disposition: 'reused-same-book'; label: '复用已明确选择的同图书来源版本'; sourceVersionId: string };
  comparison: {
    comparisonDigest: string;
    totalMappings: number;
    unresolvedMappings: number;
    changed: boolean;
    resultPreviewLabel: '稿件将重新导入' | '未发现稿件变化';
    /** The chapter-level rows (Issue #412, S63): how many, how many the editor has still to resolve, and how many paragraphs matched exactly. */
    groups: number;
    unresolvedGroups: number;
    exactBlocks: number;
  };
  fidelity: ReadonlyArray<FidelityCategoryProjection>;
  degradationDecision: ImportDegradationDecisionReviewProjection;
  commitReady: boolean;
  recordsToCreate: ReadonlyArray<string>;
  namedNonEffects: ReadonlyArray<string>;
}

/**
 * One row of the chapter-level Reimport Comparison (Issue #412, plan slice S63; V2-UX-IMP-041, IMP-057): a run of
 * changed paragraphs between two that match exactly — what the current revision has there and what the new file has —
 * with the verbs its shape admits and the one chosen, or none yet. A side shows its first paragraphs, each cut to
 * `MAX_REIMPORT_EXCERPT_GRAPHEMES`, and says how many more there are.
 */
export interface ReimportGroupProjection {
  groupId: string;
  ordinal: number;
  /** The heading the row stands under; `null` in a manuscript without headings. */
  chapterLabel: string | null;
  current: ReimportGroupSideProjection;
  staged: ReimportGroupSideProjection;
  verbs: ReadonlyArray<ReimportGroupVerb>;
  verb: ReimportGroupVerb | null;
}

export interface ReimportGroupSideProjection {
  count: number;
  from: number | null;
  to: number | null;
  excerpts: ReadonlyArray<{ position: number; text: string; truncated: boolean }>;
}

/** At most this many paragraphs a row shows on each side, each cut to this many graphemes. */
export const MAX_REIMPORT_EXCERPTS_PER_SIDE = 3;

export const MAX_REIMPORT_EXCERPT_GRAPHEMES = 400;

export interface ReimportMappingPageProjection {
  draftId: string;
  draftVersion: number;
  reviewDigest: string;
  items: ReadonlyArray<ReimportGroupProjection>;
  /** The group ordinal before the page, and after it. */
  previousCursor: number | null;
  nextCursor: number | null;
}

export interface ReimportLineageSourceVersionPageProjection {
  bookId: string;
  after: string | null;
  items: ReadonlyArray<string>;
  previousCursor: string | null;
  nextCursor: string | null;
}

export interface ManuscriptWindowProjection {
  bookId: string;
  /**
   * 🔒 锁定 (Issue #1412): the blocks of this window AI7 may not change — locked one by one or inside a locked section — and
   * the digest of the branch's lock set, which a scoped AI edit or a lock change names. Absent from a store without locks.
   */
  aiLockedBlockIds?: ReadonlyArray<string>;
  aiLocksDigest?: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  workingDigest: string;
  recoveredStateReview: null | {
    restorationId: string;
    recoveredRevisionId: string;
    label: '当前为恢复的工作状态';
  };
  focusBlockId: string | null;
  focusGrapheme: number | null;
  previousCursor: string | null;
  nextCursor: string | null;
  position: {
    startBlock: number;
    endBlock: number;
    totalBlocks: number;
    startCharacter: number;
    endCharacter: number;
    totalCharacters: number;
    proportion: number;
    structureLabel: string | null;
    label: string;
  };
  blocks: ReadonlyArray<ManuscriptBlockProjection>;
  /**
   * The Editorial Marks that stand in this window's blocks, as the working state holds them at
   * `journalSequence` — so the ranges are consistent with `blocks` by construction. At most
   * `MAX_WINDOW_MARKS`; `marksTruncated` says the window holds more than that.
   */
  marks: ReadonlyArray<EditorialMarkAnchorProjection>;
  marksTruncated: boolean;
  /**
   * `production-document` when the window holds a Production Document (Issue #415, S66), however it was reached — 交付物's
   * 打开, 解决冲突 → 返回, recovery, 待我处理 or 最近稿件 — so it is always drawn as the document it is. Absent for the Book's
   * Manuscript.
   */
  deliverable?: 'production-document';
}

/** The most chapters and marks the Whole-manuscript Position Rail draws; beyond them it says it is sparse. */
export const MAX_RAIL_CHAPTERS = 400;

export const MAX_RAIL_MARKS = 2_000;

/**
 * What the Whole-manuscript Position Rail draws beside its track (Issue #409; V2-UX-ED-015, ED-020):
 * chapter ticks on one side, and on the other the open 修改建议, 批注 and 备注 with the ranges the
 * analysis left unread. Every place is a proportion of the whole manuscript's characters, so the rail
 * never needs the manuscript's text; nothing here is a durable record.
 */
export interface ManuscriptRailProjection {
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  totalCharacters: number;
  chapters: ReadonlyArray<{
    blockId: string;
    title: string;
    level: number;
    proportion: number;
    suggestions: number;
    annotations: number;
    notes: number;
  }>;
  chaptersTruncated: boolean;
  marks: ReadonlyArray<{ kind: 'change-suggestion' | 'annotation' | 'editor-note'; blockId: string; proportion: number }>;
  marksTruncated: boolean;
  /** `null` while the Book has no analysis to have gaps; otherwise the ranges its latest analysis left unread. */
  uncovered: ReadonlyArray<{ fromProportion: number; toProportion: number; reason: string }> | null;
}

/** The most marks one window projection carries; the rest stay reachable once the window moves. */
export const MAX_WINDOW_MARKS = 400;

export const MAX_MARK_BODY_CODE_UNITS = 4_000;

export const MAX_MARK_REPLIES = 100;

/**
 * The Editorial Mark family of `docs/ui-ux-v2/CONTEXT.md` (V2-UX-MARK-001): a Change Suggestion is
 * the editor-facing form of a Proposal Change Item, an Annotation is an exportable comment, an Editor
 * Note is private to the editor, and a Personal Highlight carries no product meaning.
 */
export type EditorialMarkKind = 'change-suggestion' | 'annotation' | 'editor-note' | 'personal-highlight';

export type PersonalHighlightColor = 1 | 2 | 3;

/** `applied`: a Change Suggestion whose replacement an AI7 Apply wrote; the mark now stands on the applied text. */
export type EditorialMarkStatus = 'open' | 'resolved' | 'applied';

export type ProposalItemDisposition = 'accepted' | 'rejected' | 'accepted-with-edit' | 'deferred';

/** A Proposal Change Item's kind (V2-UX-PROP-014): `insert` since schema revision 28 (Issue #411). */
export type ProposalChangeType = 'replace' | 'delete' | 'insert';

/**
 * Who a mark comes from (V2-UX-MARK-002): the editor, AI7 with what produced it — a Task, a review
 * category or the analysis — or the author an imported file carried in.
 */
export interface EditorialMarkSourceProjection {
  kind: 'editor' | 'ai7' | 'imported-author';
  origin: 'task' | 'review-category' | 'analysis' | null;
  /** The Task's title, the review category's name, or the imported author's name. */
  label: string | null;
  taskId: string | null;
  /** Registered Book editors, or the frozen producing model's human/technical labels (#1379). */
  editorName?: string | null;
  modelLabel?: string | null;
  modelTechnicalLabel?: string | null;
}

/** One mark as the manuscript surface draws it; the card's content is read on demand. */
export interface EditorialMarkAnchorProjection {
  inlineRevision?: { beforeText: string; afterText: string; sessionId: string };
  markId: string;
  kind: EditorialMarkKind;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  /** `drifted` when the text the mark was made on no longer stands at its range (原文已变). */
  anchorState: 'exact' | 'drifted';
  status: EditorialMarkStatus;
  highlightColor: PersonalHighlightColor | null;
  sourceKind: EditorialMarkSourceProjection['kind'];
  sourceOrigin: EditorialMarkSourceProjection['origin'];
  sourceLabel: string | null;
  categoryKey: EditorialMarkCategoryKey;
  categoryLabel: string;
  /** The current Proposal Decision of a Change Suggestion, which the surface shows without a card. */
  disposition: ProposalItemDisposition | null;
  /**
   * The words an applied 修改建议 deleted, where the mark is the point they left (pinned on no text);
   * `null` for every other mark. The surface names them on the point it draws there.
   */
  deletedText: string | null;
  /**
   * The words a 修改建议 that inserts (Issue #411) would write at the point it stands on, while it is not
   * applied; `null` for every other mark. The surface names them on the point it draws there.
   */
  insertedText: string | null;
  /** Where a 修改建议's Three-way Proposal Conflict stands (Issue #57); `null` for a mark that has none. */
  conflict: ProposalConflictState | null;
}

/** One basis a mark or a suggestion rests on: a labelled place in the manuscript, quoted exactly. */
export interface EditorialMarkBasisProjection {
  label: string;
  blockId: string | null;
  fromGrapheme: number | null;
  toGrapheme: number | null;
  quote: string | null;
}

export interface ProposalItemDecisionProjection {
  decisionId: string;
  disposition: ProposalItemDisposition;
  /** The text the editor accepted instead of AI7's or their own first wording. */
  editedText: string | null;
  /** The editor's Non-blocking Decision Reason as it now stands, and how it was given (V2-UX-PDEC-010). */
  reason: string | null;
  reasonSource: 'reason-field' | 'suggested' | 'free-text' | null;
  /**
   * Whether the editor gave a reason, said `不说明`, or neither (Issue #61, S26a; FDBK-006, FDBK-007). A dismissal records
   * only that no reason was given: never agreement, satisfaction or a judgment of any kind.
   */
  reasonState: 'none' | 'given' | 'dismissed';
  /** How many `不说明` and `改原因` entries follow the decision: the count the next one names. */
  feedbackEntries: number;
  /** When the editor last changed the reason after first giving it; `null` when it is the first. */
  reasonRevisedAt: string | null;
  recordedAt: string;
}

/**
 * Everything a Mark Card shows (V2-UX-MARK-003, MARK-004). A Change Suggestion carries its Proposal
 * Change Item in the content-first hierarchy of V2-UX-PROP-022: proposed then current wording,
 * rationale, author, collapsed evidence and the editor's decision, a record apart from the item and
 * from any change to the manuscript.
 */
export interface EditorialMarkCardProjection {
  inlineRevision?: boolean;
  markId: string;
  categoryKey: EditorialMarkCategoryKey;
  categoryLabel: string;
  kind: EditorialMarkKind;
  status: EditorialMarkStatus;
  anchorState: 'exact' | 'drifted' | 'detached';
  highlightColor: PersonalHighlightColor | null;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  /**
   * The exact text the mark stands on: what it was made on, or what an Apply wrote there. Empty where
   * an applied 修改建议 deleted its words: the mark is then the point between two graphemes where they were.
   */
  pinnedText: string;
  source: EditorialMarkSourceProjection;
  body: string;
  replies: ReadonlyArray<{ replyId: string; body: string; createdAt: string }>;
  basis: ReadonlyArray<EditorialMarkBasisProjection>;
  suggestion: null | {
    itemId: string;
    /**
     * What the item asks: replace its current text, delete it, or — for an insertion a file's author
     * proposed (Issue #411) — write its proposal at a point, where its current text is empty.
     */
    changeType: ProposalChangeType;
    currentText: string;
    proposedText: string;
    rationale: string;
    atomicGroupId: string | null;
    decision: ProposalItemDecisionProjection | null;
    /** The committed Apply that wrote this item, as its Effect Receipt states it; `null` until one has. */
    application: ManuscriptApplyProjection | null;
  };
  convertedFrom: null | { markId: string; kind: EditorialMarkKind; sourceKind: EditorialMarkSourceProjection['kind'] };
  /**
   * ADR 0085 §2: the paragraph of this 修改建议 changed elsewhere after its base while its own words stayed
   * exact — a Safe Non-interacting Merge. A label only; it records and decides nothing.
   */
  changedElsewhere: boolean;
  /** The mark's Three-way Proposal Conflict (Issue #57), or `null` when it has none. */
  conflict: EditorialMarkConflictProjection | null;
  /** The conflict this 修改建议 was saved from as a new Proposal version, or `null`. */
  resolvedFrom: null | { markId: string; conflictKind: ProposalConflictKind };
  /** What an export does with this mark unless the editor says otherwise (V2-UX-MARK-006, MARK-007). */
  exportDisposition: 'exported-by-default' | 'only-when-included' | 'never-exported';
  createdAt: string;
  updatedAt: string;
  /** The pin itself, for the Technical Identity Layer. */
  pin: { revisionId: string; revisionLabel: string; journalSequence: number; blockDigest: string };
  /** A Correction Proposal's factual lineage (Issue #901), shown in 依据与核查; absent on every other mark. */
  factualCorrection?: FactualCorrectionLineageProjection;
}

/** Binds a mark command to the manuscript state the editor saw, and asks for the window's marks back. */
export interface EditorialMarkBindingInput {
  manuscriptId: string;
  branchId: string;
  windowStartBlockId: string;
}

export interface CreateEditorialMarkInput extends EditorialMarkBindingInput {
  clientMarkId: string;
  baseRevisionId: string;
  expectedJournalSequence: number;
  blockId: string;
  baseBlockDigest: string;
  fromGrapheme: number;
  toGrapheme: number;
  /** The text the editor selected; the service refuses a mark whose range does not hold it. */
  selectedText: string;
  kind: EditorialMarkKind;
  highlightColor: PersonalHighlightColor | null;
  body: string;
  proposedText: string | null;
  rationale: string | null;
}

/**
 * One change to a mark. Every field is always present so the frame is exact; a field an action does
 * not use is `null`. `convert` makes a new mark on the same pinned text and retires this one, so a
 * mark's kind never changes under a record that points at it.
 */
export interface UpdateEditorialMarkInput extends EditorialMarkBindingInput {
  markId: string;
  action: 'edit-body' | 'recolor' | 'set-status' | 'reply' | 'remove' | 'convert' | 'apply-inline-revision' | 'revert-inline-revision';
  body: string | null;
  highlightColor: PersonalHighlightColor | null;
  status: EditorialMarkStatus | null;
  targetKind: EditorialMarkKind | null;
  proposedText: string | null;
  rationale: string | null;
}

/**
 * The editor's decision on one Change Suggestion (V2-UX-MARK-004, MARK-005). It records a Proposal
 * Decision and changes no manuscript text: `withdrawn` supersedes the current decision and returns
 * the item to undecided (V2-UX-PDEC-008).
 */
export interface RecordChangeSuggestionDecisionInput extends EditorialMarkBindingInput {
  markId: string;
  clientDecisionId: string;
  disposition: ProposalItemDisposition | 'withdrawn';
  editedText: string | null;
  reason: string | null;
}

/**
 * The optional reason chips that follow a decision recorded without one (V2-UX-PDEC-009, PDEC-010):
 * a suggested reason the editor picked, or their own words. One reason per decision; a decision that
 * already carries one — from the 为什么这样改 field or an earlier chip — is never asked again.
 */
export interface RecordProposalDecisionReasonInput extends EditorialMarkBindingInput {
  markId: string;
  decisionId: string;
  reason: string;
  reasonSource: 'suggested' | 'free-text';
}

/**
 * After a decision (Issue #61, S26a; FDBK-006, FDBK-007, interaction-spec's feedback rules): `不说明`, which records only that
 * no reason was given and ends the prompt, or `改原因`, a successor to the reason that keeps the one it replaced. Either names
 * how many entries the editor saw after the decision.
 */
export interface RecordProposalDecisionFeedbackInput extends EditorialMarkBindingInput {
  markId: string;
  decisionId: string;
  expectedFeedback: number;
  action: 'dismiss' | 'revise';
  reason: string | null;
  reasonSource: 'suggested' | 'free-text' | null;
}

export interface EditorialMarkCommandProjection {
  window?: ManuscriptWindowProjection;
  markId: string;
  marks: ReadonlyArray<EditorialMarkAnchorProjection>;
  marksTruncated: boolean;
  card: EditorialMarkCardProjection | null;
}

/** One exact state of a manuscript: the Revision it rests on, the journal position, and the working digest. */
export interface ManuscriptStateProjection {
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
}

/**
 * One committed AI7 Apply as its Effect Receipt states it (V2-UX-EREC-002). Identities, digests, times
 * and the two manuscript states only: a receipt holds no manuscript text. The Effect Approval and the
 * dispatch are records of their own, named here by identity; the Proposal Decision is the item's.
 */
export interface ManuscriptApplyProjection {
  effectId: string;
  kind: 'apply' | 'reverse-apply';
  interaction: 'accept-and-apply' | 'accept-edited-and-apply' | 'apply-recorded-decision' | 'confirm-batch-apply' | 'confirm-reverse-apply';
  approvalId: string;
  dispatchId: string;
  receiptId: string;
  changeCount: number;
  payloadDigest: string;
  receiptDigest: string;
  before: ManuscriptStateProjection;
  after: ManuscriptStateProjection;
  committedAt: string;
  reversesEffectId: string | null;
  reversedByEffectId: string | null;
}

/**
 * 接受并应用 for one inline 修改建议 (V2-UX-PDEC-012, EAPP-003 to 006): one interaction records the
 * Proposal Decision, records the Effect Approval and dispatches the Apply. `clientEffectId` is the
 * Effect's idempotency key: the same key never writes twice, and asking again with it answers with
 * the receipt it already has.
 */
export interface ApplyChangeSuggestionInput extends EditorialMarkBindingInput {
  markId: string;
  clientEffectId: string;
  interaction: 'accept-and-apply' | 'accept-edited-and-apply' | 'apply-recorded-decision';
  editedText: string | null;
  reason: string | null;
}

/** 确认应用 on the batch confirmation strip: one Effect over the exact suggestions the strip named, all or none. */
export interface ApplyChangeSuggestionBatchInput extends EditorialMarkBindingInput {
  markIds: ReadonlyArray<string>;
  clientEffectId: string;
}

/** 确认撤销本次应用: a Reverse Apply is a new Effect with its own approval and receipt (UI ADR 0003). */
export interface ReverseAppliedChangeSuggestionInput extends EditorialMarkBindingInput {
  markId: string;
  clientEffectId: string;
}

export interface ManuscriptApplyCommandProjection extends EditorialMarkCommandProjection {
  application: ManuscriptApplyProjection;
  /** The window the command was issued from, as the working state holds it now. */
  window: ManuscriptWindowProjection;
}

/**
 * Apply Outcome Recovery (V2-UX-EREC-004): what the store holds for one Effect identity. The text and
 * its receipt are written in one transaction, so there is no third answer: `committed` with the
 * receipt, or `not-committed` and the manuscript unchanged by that Effect.
 */
export interface ManuscriptApplyOutcomeProjection {
  state: 'committed' | 'not-committed';
  application: ManuscriptApplyProjection | null;
}

/** Issue #902: settled legacy outcomes retain their exact wire shape. */
export interface ApplyReceiptProjection {
  state: 'applied' | 'not-applied' | 'confirming' | 'unresolved';
  application: ManuscriptApplyProjection | null;
  clientEffectId: string;
  manuscriptId: string;
  branchId: string;
  bookId: string;
  actor: 'editor';
  approvedAt: string | null;
  replayPolicy: 'idempotency-keyed';
  safeRetry: boolean;
  reason: string;
  decisionIds: ReadonlyArray<string>;
}

/** Rev 2 compatibility: transient recovery states can never masquerade as settled evidence. */
export function applyReceiptState(outcome: ManuscriptApplyOutcomeProjection): 'applied' | 'not-applied' {
  return outcome.state === 'committed' ? 'applied' : 'not-applied';
}

export function legacyApplyOutcome(receipt: Pick<ApplyReceiptProjection, 'state' | 'application'>): ManuscriptApplyOutcomeProjection | null {
  if (receipt.state === 'confirming' || receipt.state === 'unresolved') return null;
  return { state: receipt.state === 'applied' ? 'committed' : 'not-committed', application: receipt.application };
}

export type ProposalDraftDisposition = 'accepted' | 'rejected' | 'deferred';

export interface ProposalWorkspaceInput {
  /** Bounded metadata page; scope digests always bind the full result. */
  offset?: number;
  manuscriptId: string;
  branchId: string;
  /** Exact Review Run or producing Task; null is the editor's branch-local proposals. */
  resultId: string | null;
  returnPosition?: ProposalReviewReturnPosition | null;
}

export interface ProposalReviewReturnPosition {
  blockId: string | null;
  activeMarkId: string | null;
  comparison: 'inline' | 'side-by-side';
  review: 'all' | 'unreviewed' | 'reviewed' | 'stale' | 'conflicting';
  chapterBlockId: string | null;
  changeType: ProposalChangeType | null;
  expanded: boolean;
}

export interface ProposalNavigatorItem {
  markId: string;
  itemId: string;
  blockId: string;
  position: number;
  fromGrapheme: number;
  toGrapheme: number;
  chapterBlockId: string | null;
  chapter: string;
  changeType: ProposalChangeType;
  baseRevisionId: string;
  stale: boolean;
  /** `drifted` is a classified Three-way Proposal Conflict (原文已变, ADR 0085); `detached` is not yet classified. */
  anchorState: 'exact' | 'drifted' | 'detached';
  conflict: boolean;
  loaded: boolean;
  otherVersion: boolean;
  atomicGroupId: string | null;
  atomicReason: string | null;
  draft: ProposalDraftDisposition | null;
  draftOrdinal: number;
  decisionId: string | null;
  disposition: ProposalItemDisposition | null;
  appliedRevisionId: string | null;
}

export interface ProposalDecisionProjection {
  decisionId: string;
  supersedes: string | null;
  baseRevisionIds: ReadonlyArray<string>;
  currentRevisionId: string;
  journalSequence: number;
  actor: 'editor';
  recordedAt: string;
  items: ReadonlyArray<{ markId: string; itemId: string; disposition: ProposalDraftDisposition; decisionId: string }>;
  unresolved: ReadonlyArray<string>;
}

export interface ProposalWorkspaceProjection {
  totalItems: number;
  nextOffset: number | null;
  bookId: string;
  manuscriptId: string;
  branchId: string;
  resultId: string | null;
  revisionId: string;
  journalSequence: number;
  items: ReadonlyArray<ProposalNavigatorItem>;
  offerWorkspace: boolean;
  truncated: boolean;
  scopeDigest: string;
  decision: ProposalDecisionProjection | null;
  returnPosition: ProposalReviewReturnPosition | null;
}

export interface SaveProposalDecisionDraftInput extends ProposalWorkspaceInput {
  markIds: ReadonlyArray<string>;
  disposition: ProposalDraftDisposition | null;
  atomicGroupId: string | null;
  expectedScopeDigest: string;
}

export interface BatchProposalDecisionDraftInput extends ProposalWorkspaceInput {
  scope: 'selection' | 'chapter' | 'change-type' | 'filter';
  markIds: ReadonlyArray<string>;
  chapterBlockId: string | null;
  changeType: ProposalChangeType | null;
  review: ProposalReviewReturnPosition['review'];
  disposition: ProposalDraftDisposition;
  /** null previews the exact frozen scope and every exclusion, without recording anything. */
  confirmDigest: string | null;
}

export interface ProposalDraftBatchProjection {
  nextOffset: number | null;
  scopeDigest: string;
  included: ReadonlyArray<string>;
  excluded: ReadonlyArray<{ markId: string; reason: 'conflict' | 'unclassified-stale' | 'unloaded' | 'other-version' | 'atomic-group' | 'applied' | 'guessed-anchor' }>;
  saved: boolean;
  workspace: ProposalWorkspaceProjection;
}

export interface RecordProposalDecisionInput extends ProposalWorkspaceInput {
  expectedScopeDigest: string;
  clientDecisionId: string;
}

export interface InspectApplyReceiptInput {
  manuscriptId: string;
  branchId: string;
  clientEffectId: string;
  /**
   * `settled` reads; `confirming` and `unresolved` are what a surface that lost its acknowledgement, or its recovery
   * read too, reports; `recheck` is the editor's explicit re-check of a 结果待确认 against the authoritative records.
   * None of them dispatches.
   */
  recovery: 'settled' | 'confirming' | 'unresolved' | 'recheck';
}

export interface PrepareReverseApplyInput {
  manuscriptId: string;
  branchId: string;
  markId: string;
}

export interface ReverseApplyPreparationProjection {
  ranges: ReadonlyArray<{ markId: string; position: number; fromGrapheme: number; toGrapheme: number }>;
  originalEffectId: string;
  bookId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  markId: string;
  blockId: string;
  ready: boolean;
  reason: string;
}

/**
 * 稿件冲突 (Issue #57, plan slice S22; ADR 0085; V2-UX-CONFLICT-001 to 013). A 修改建议 is in a Three-way
 * Proposal Conflict when the words it replaces changed after its base — its anchor drifted, 原文已变 —
 * while it is undecided or accepted and not yet applied (`suggestion`), or when the words its Apply wrote
 * were edited afterwards, so that reversing the Apply meets them (`reversal`, V2-UX-EREC-012). A change
 * elsewhere in its paragraph is not a conflict (ADR 0085 §1). A conflict is `deferred` once 暂不处理 was
 * recorded and stays unresolved; it is `resolved` by its one outcome, 保留当前稿件 or 保存为新提案版本.
 */
export type ProposalConflictKind = 'suggestion' | 'reversal';

export type ProposalConflictState = 'unresolved' | 'deferred' | 'resolved';

export type ProposalConflictOutcome = 'keep-current' | 'new-version';

/** The most unresolved conflicts the navigator of 稿件冲突 lists across one manuscript. */
export const MAX_PROPOSAL_CONFLICT_NAVIGATOR = 200;

/** How many graphemes of the current paragraph stand on each side of the conflicting words. */
export const PROPOSAL_CONFLICT_CONTEXT_GRAPHEMES = 30;

/** The Resolution Drafts one conflict keeps; a draft is appended per save and never rewritten. */
export const MAX_PROPOSAL_CONFLICT_DRAFTS = 5_000;

/** The 暂不处理 records one conflict keeps. */
export const MAX_PROPOSAL_CONFLICT_DEFERRALS = 1_000;

/** The most units one conflict's texts can be cut into, which bounds a draft's request frame. */
export const MAX_PROPOSAL_CONFLICT_UNITS = 8_192;

/** What a Mark Card says of its mark's conflict, and whether 解决冲突… is offered for it. */
export interface EditorialMarkConflictProjection {
  kind: ProposalConflictKind;
  state: ProposalConflictState;
  /** The latest 暂不处理, while the conflict is unresolved. */
  deferredAt: string | null;
  outcome: ProposalConflictOutcome | null;
  /** The 修改建议 保存为新提案版本 created. */
  newMarkId: string | null;
  resolvedAt: string | null;
}

export interface ProposalConflictBindingInput {
  manuscriptId: string;
  branchId: string;
  markId: string;
}

/** A Resolution Draft as saved: one entry per unit of the comparison, index for index. */
export interface ProposalConflictDraftProjection {
  draftId: string;
  ordinal: number;
  resolutions: ReadonlyArray<ConflictUnitResolution>;
  text: string;
  /** Every changed unit has a resolution; only then can it be saved as a new Proposal version. */
  complete: boolean;
  savedAt: string;
  /**
   * 基于当前稿件重新生成建议 saved this draft (Issue #842): the conflict unit whose words AI7 regenerated, and when. `null` for a
   * draft the editor saved; a later save of the editor's own carries none, and the regenerated draft stays as it was saved.
   */
  regeneration: { unitIndex: number; regeneratedAt: string } | null;
}

/**
 * 稿件冲突 for one 修改建议 (V2-UX-CONFLICT-004): the three texts, persistently distinct — 提案基准 (`base`),
 * 当前权威稿件 (`current`) and 提议内容 (`proposed`) — the bounded context around them, which is the current
 * paragraph's, the units they compare in, the latest Resolution Draft saved on exactly this basis, and
 * the other unresolved conflicts of the manuscript. `basisDigest` binds every command to these texts: a
 * later change of the paragraph makes it stale, and nothing is ever retargeted.
 */
export interface ProposalConflictProjection {
  markId: string;
  manuscriptId: string;
  branchId: string;
  bookId: string;
  conflictKind: ProposalConflictKind;
  deferral: { deferralId: string; deferredAt: string } | null;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  basisDigest: string;
  base: string;
  current: string;
  proposed: string;
  context: { before: string; after: string };
  units: ReadonlyArray<ConflictUnit>;
  draft: ProposalConflictDraftProjection | null;
  /** A Resolution Draft was saved against an earlier state of the paragraph; it is kept and not loaded. */
  draftOnEarlierBasis: boolean;
  /** 保存为新提案版本 needs words to stand on: where they were deleted, only the other paths are open. */
  newVersion: { available: boolean; blocker: 'target-deleted' | null };
  suggestion: { itemId: string; rationale: string; source: EditorialMarkSourceProjection };
  /** The manuscript's unresolved conflicts in reading order, this one included; at most `MAX_PROPOSAL_CONFLICT_NAVIGATOR`. */
  navigator: {
    entries: ReadonlyArray<{ markId: string; blockId: string; conflictKind: ProposalConflictKind; deferred: boolean }>;
    truncated: boolean;
  };
}

export interface SaveProposalConflictDraftInput extends ProposalConflictBindingInput {
  basisDigest: string;
  units: ReadonlyArray<ConflictUnitResolution>;
}

export interface ProposalConflictDraftSaveProjection {
  markId: string;
  basisDigest: string;
  draft: ProposalConflictDraftProjection;
}

/**
 * 确认保留当前稿件, 暂不处理, or 保存为新提案版本 from the saved draft `draftOrdinal` (V2-UX-CONFLICT-005,
 * CONFLICT-011, CONFLICT-013). None of them writes the manuscript.
 */
export interface ResolveProposalConflictInput extends ProposalConflictBindingInput {
  basisDigest: string;
  outcome: 'keep-current' | 'defer' | 'new-version';
  draftOrdinal: number | null;
}

export interface ProposalConflictResolutionProjection {
  markId: string;
  outcome: ResolveProposalConflictInput['outcome'];
  /** The new 修改建议 a new version created, not accepted and not applied; `null` for the other two. */
  newMarkId: string | null;
  blockId: string;
  recordedAt: string;
}

// ---- 润色这段 and 稿件冲突 › 基于当前稿件重新生成建议 on the Fast Interaction Role (Issue #842) ----------------------------

/** Whether one fast-role action can be asked under this launch for this Book, and why not, in the editor's words. */
export interface FastInteractionRouteProjection {
  readonly available: boolean;
  /** `null` exactly when it is available. */
  readonly reason: string | null;
}

/** The two fast-role actions of the Book this window shows: a read; it sends nothing. */
export interface FastInteractionRoutesProjection {
  readonly bookId: string;
  readonly editorialPolish: FastInteractionRouteProjection;
  readonly conflictRegenerate: FastInteractionRouteProjection;
}

/** 润色这段: the exact words the editor selected in one block of the Book's manuscript, or across contiguous paragraphs (#1176). */
export interface PolishSelectionInput {
  readonly selection: DialogueSelectionInput;
}

/**
 * What 润色这段 came to: `requesting` while its one request is in flight, then the 修改建议 it placed on the selected words —
 * AI7-produced, attributed to this polish task, open and never accepted or applied — and each suggestion of the answer it did
 * not place, with why. `failed` and `withheld` placed nothing; `outcomeUnknown` is a request that may have been sent and whose
 * answer never came back whole. `taskId` is also the request the surface reads again until it settles.
 */
export interface EditorialPolishProjection {
  readonly bookId: string;
  readonly taskId: string;
  readonly state: 'requesting' | 'suggested' | 'nothing-to-suggest' | 'withheld' | 'failed';
  readonly markIds: ReadonlyArray<string>;
  readonly withheld: ReadonlyArray<{ readonly ordinal: number; readonly reason: string }>;
  readonly outcomeUnknown: boolean;
  /** What happened, in the editor's words. */
  readonly label: string;
}

/** 基于当前稿件重新生成建议 for one `conflict` unit of the comparison the editor sees, on exactly its basis. */
export interface RegenerateProposalConflictUnitInput extends ProposalConflictBindingInput {
  readonly basisDigest: string;
  readonly unitIndex: number;
}

/**
 * What a regeneration came to: `requesting` while its one request is in flight; then `drafted` saved the regenerated words as
 * the unit's resolution in a new Resolution Draft, which the editor resolves through the existing paths; `same-as-current` and
 * `same-as-proposed` saved nothing, the words being the current manuscript's or the old proposal's; `withheld` and `failed`
 * saved nothing. The surface reads the conflict again once it settles.
 */
export interface ProposalConflictRegenerationProjection {
  readonly requestId: string;
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly markId: string;
  readonly unitIndex: number;
  readonly outcome: 'requesting' | 'drafted' | 'same-as-current' | 'same-as-proposed' | 'withheld' | 'failed';
  readonly outcomeUnknown: boolean;
  readonly label: string;
}

/** One fast-role request of this service's lifetime, read again until it settles: a read; it sends nothing. */
export interface InspectFastInteractionRequestInput {
  readonly requestId: string;
}

export type FastInteractionRequestProjection =
  | { readonly kind: 'editorial-polish'; readonly polish: EditorialPolishProjection }
  | { readonly kind: 'conflict-regenerate'; readonly regeneration: ProposalConflictRegenerationProjection };

/** The text-processing commands of the selection menu, run by the window that owns the clipboard. */
export type EditorClipboardCommand = 'cut' | 'copy' | 'paste' | 'paste-plain-text';

/**
 * Where an editor last entered a Book's primary Manuscript, already resolved against the working
 * state the branch holds now. It speaks the window projection's own vocabulary — a block identity
 * and a grapheme offset inside it — so a caller passes `blockId` straight to a `block` window target.
 * `state` says which of the two the resolution was: `exact` when the recorded Revision is still the
 * branch's base Revision and the block it names is still there, `nearest-anchor` when the recorded
 * position was superseded and the nearest surviving block answered for it.
 */
export interface ManuscriptEntryPositionProjection {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  blockId: string;
  grapheme: number;
  /** The Manuscript Revision the stored position was recorded against. */
  recordedRevisionId: string;
  state: 'exact' | 'nearest-anchor';
}

export type BookWorkbenchRoute =
  | { kind: 'book'; bookId: string; feedbackEntryId?: string; learningMaterialKey?: string }
  | { kind: 'revision'; revisionId: string };

export type ResolvedBookWorkbenchRoute =
  | {
      kind: 'book';
      feedbackTarget?: FeedbackHistoryTarget;
      learningMaterialTarget?: LearningMaterialTarget;
      bookId: string;
      bookTitle: string;
    }
  | {
      kind: 'revision';
      bookId: string;
      bookTitle: string;
      manuscriptId: string;
      branchId: string;
      revisionId: string;
      revisionLabel: string;
    };

export interface BookWorkbenchOpenProjection {
  route: ResolvedBookWorkbenchRoute;
  target: 'requesting-window' | 'existing-window' | 'new-window';
}

export type DistributionChannel = 'source-checkout' | 'windows-installer' | 'windows-portable' | 'macos-dmg' | 'packaged';

export interface ProductDataLocationProjection {
  platform: 'windows' | 'macos';
  platformLabel: 'Windows' | 'macOS';
  runtimeForm: 'source-checkout' | 'packaged';
  runtimeFormLabel: '源码检出运行' | '打包运行';
  channel: DistributionChannel;
  channelLabel: '源码检出' | '安装版' | '便携版' | 'macOS 磁盘映像' | '未知渠道';
  channelDescription: string;
  dataLocationException: 'portable-unwritable' | null;
  syncWarning: string | null;
  locationLabel: '本机产品数据位置';
  canonicalRoot: string;
  footprint: {
    kind: 'bounded-measurement';
    measuredBytes: number;
    measuredEntries: number;
    maximumEntries: 128;
    complete: boolean;
    label: string;
  };
  protectedSecretStore: 'windows-credential-manager' | 'macos-keychain';
  protectedSecretStoreLabel: 'Windows 凭据管理器' | 'macOS 钥匙串';
  separationLabel: '模型服务凭据由操作系统单独保护，不在产品数据中，也不随产品数据复制。';
}

export interface ProductDataLocationRevealProjection {
  state: 'requested';
  nativeRevealSuppressedForE2e: boolean;
}

export type ModelRoleId =
  | 'fast-interaction'
  | 'main-editorial'
  | 'difficult-escalation'
  | 'frontier';

export type ModelRoleStatus = 'available' | 'setup-required' | 'needs-attention' | 'unavailable';

export type ModelRoleStatusLabel = '可用' | '需设置' | '需处理' | '不可用';

export type ModelCredentialOperationState = 'ready' | 'missing' | 'needs-attention';

export interface ModelServiceConnectionProjection {
  connectionId: ModelServiceConnectionId;
  roleId: 'main-editorial';
  connectionName: string;
  binding: ModelServiceBindingProjection;
  fastBinding?: ModelServiceBindingProjection;
  credentialReference: string;
  credentialOperationState: ModelCredentialOperationState;
  createdAt: string;
  updatedAt: string;
  credentialUpdatedAt: string;
  /** Whether the editor chose this route for the Tasks they start from now on (Issue #811). */
  selected: boolean;
  /** Independent Fast choice; Main's legacy selected column keeps its meaning. */
  fastSelected?: boolean;
  connectionTest?: ModelConnectionTestStatus | null;
}

/** Exact-binding public text-probe result; only its bounded reply and provenance are retained. */
export interface ModelConnectionTestStatus {
  responseText?: string;
  modelId: string;
  credentialUpdatedAt: string;
  testedAt: string;
  outcome: 'passed' | 'failed' | 'outcome-unknown' | 'cancelled';
  code: string | null;
  verified: 'buffered-text-only';
  provenance?: ModelTextAttemptProvenance;
}

export interface ModelTextAttemptProvenance {
  readonly role: 'Fast Interaction Role';
  readonly route: string;
  readonly model: string;
  readonly endpoint: string;
  readonly credentialSlot: string;
  readonly credentialReference: string;
  readonly policyVersion: string;
  readonly bindingDigest: string;
  readonly credentialUpdatedAt?: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens?: number; readonly reasoningTokens?: number } | null;
  readonly failureCode: string | null;
}

export interface FastModelSelectionInput {
  route: ModelServiceRouteId;
  modelId: string;
}

/**
 * The trusted operational scopes the source checkout can bind from its launch form (ADR 0065, ADR 0046):
 * `development-ci` by default; `developer-live` and `ordinary-production` only through
 * `--trusted-operational-scope`. `fixture-recording` stays unselectable from the source checkout.
 */
export type TrustedOperationalScope = 'development-ci' | 'developer-live' | 'ordinary-production';

/**
 * Historical v5, v9, v10, v11, v12, v14, v16, v18, v20, v22 and the superseded web reservation v8 remain readable identities; selected v24 admits
 * baseline analysis, enrolled background analysis within a mandatory ceiling, editorial dialogue, review (with cross-deliverable
 * consistency and frozen Material References), writing and the three evaluation contracts (with frozen Material References), and
 * 润色 and conflict regeneration Suggestions on V4.1, with one model question per unit on the Run-based rules, and AI7's platform
 * tools (websearch through the user-selected backend, webfetch) on review, writing and evaluation, and AI7's local targeted-retrieval
 * tool on every rule but enrolled background analysis, material translation and custom analysis; v22 adds the custom analysis rule (the family
 * `custom-analysis/*` over an editor-authored question template) and Series Knowledge on the review rule; v24 admits the four ADR 0091
 * Public SampleBooks beside exact sample1 and changes nothing else. A type member does not select or activate a policy.
 */
export type DeveloperLiveProviderProcessingVersion = 'v5' | 'v8' | 'v9' | 'v10' | 'v11' | 'v12' | 'v14' | 'v16' | 'v18' | 'v20' | 'v22' | 'v24';

/** The ordinary-production version the active set selects: local production over the editor's own configured provider. */
export type OrdinaryProductionProviderProcessingVersion = 'v13' | 'v15' | 'v17' | 'v19' | 'v21' | 'v23' | 'v25' | 'v26' | 'v27' | 'v30' | 'v31' | 'v32' | 'v33' | 'v34' | 'v35';

/** Historical v5, v7, v8, v9, v10, v11 and v12, the superseded web reservation v6, historical v13, v14 and v15, and selected v16. */
export type ActivePolicySetVersion = 'no-policy-lock' | 'v5' | 'v6' | 'v7' | 'v8' | 'v9' | 'v10' | 'v11' | 'v12' | 'v13' | 'v14' | 'v15' | 'v16' | 'v17' | 'v18' | 'v19' | 'v21' | 'v22' | 'v23' | 'v24' | 'v25' | 'v26';

export type ProviderProcessingVersion = 'v1' | 'v29' | DeveloperLiveProviderProcessingVersion | OrdinaryProductionProviderProcessingVersion;

/** Accepted identities shared by readers and gates; these constants do not select a policy or authorize a send. */
export const ORIGINAL_FIELDS_ACTIVE_SET_SHA256 = '4b845e924df777f440b07d53ba6e31447e0fe0b004e86efa89bf76554fb05392';

export const RECORDED_V26_ACTIVE_SET_SHA256 = '20ce6301a65f5a661117d66d1c5f9d185d8211c65c65c660f5ad3d2976809eaa';

export const RECORDED_V35_PRODUCTION_POLICY_SHA256 = 'ca506c18c7d84308be2cb69f08400187a6ae49d595d32211356ea987dfbe3bcb';

export const DEVELOPMENT_CI_POLICY_SHA256 = 'd9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a';

export const ORIGINAL_FIELDS_POLICY_SHA256 = 'f12df1d43cfc9f52b999c2cc8a6e9bac419177d42210d3bbe8c5008ba8d6a59e';

export const LOCAL_FIXTURE_POLICY_SHA256 = 'c9545a5f461a7791115c1f4664bbd731757775951f814d39c28b12c85af88c9d';

export const LOCAL_FIXTURE_MANIFEST_SHA256 = '2572c1b5aa05d6ccc9a60a2a8a03ba2cefc10d5f48c1a85377d53797360bc0d2';

/** Retained known interpretations, never an arbitrary-v-number reader or a selection mechanism. */
export function isSupportedProviderProcessingVersion(scope: unknown, version: unknown): boolean {
  if (scope === 'development-ci') return version === 'v1' || version === 'v29';
  if (scope === 'developer-live') return ['v5', 'v8', 'v9', 'v10', 'v11', 'v12', 'v14', 'v16', 'v18', 'v20', 'v22', 'v24'].some((entry) => entry === version);
  if (scope === 'ordinary-production') return ['v13', 'v15', 'v17', 'v19', 'v21', 'v23', 'v25', 'v26', 'v27', 'v30', 'v31', 'v32', 'v33', 'v34', 'v35'].some((entry) => entry === version);
  return false;
}

/** Identity of the actual verified selected documents; this metadata grants no execution authority. */
export interface SelectedPolicyIdentity {
  readonly providerProcessingVersion: 'v1' | 'v24' | 'v29' | 'v30' | 'v31' | 'v32' | 'v33' | 'v34' | 'v35';
  readonly providerProcessingSha256: string;
  readonly activePolicySetVersion: 'no-policy-lock' | 'v21' | 'v22' | 'v23' | 'v24' | 'v25' | 'v26';
  readonly activePolicySetSha256: string;
}

export type LocalFixtureRegisteredProfile = 'baseline' | 'conflict' | 'custom' | 'dialogue' | 'evaluation' | 'factual' |
  'polish' | 'readers' | 'review' | 'rewrite' | 'series' | 'workspace' | 'writing';

export type LocalFixtureRuleId = 'development-ci-fixture-review' | 'development-ci-fixture-global-agent-dialogue' |
  'development-ci-fixture-learning-curation' | 'development-ci-fixture-editorial-polish' |
  'development-ci-fixture-factual-claim-stages' | 'development-ci-fixture-factual-recheck';

interface LocalFixtureProfileIdentity {
  readonly schema: 'ai7.local-fixture-profile/1';
  readonly policyVersion: 'v29';
  readonly policySha256: string;
  readonly activePolicySetVersion: 'v21';
  readonly activePolicySetSha256: string;
}

export type LocalFixtureProfile = LocalFixtureProfileIdentity & (
  | { readonly kind: 'legacy'; readonly profileId: 'development-ci-legacy-local-fixture-809c96f2';
      readonly manifestSha256: string; readonly registeredProfile: LocalFixtureRegisteredProfile }
  | { readonly kind: 'rule'; readonly ruleId: LocalFixtureRuleId }
);

function isPolicyIdentityRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasPolicyIdentityKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

const SELECTED_PROVIDER_DIGESTS = {
  v1: DEVELOPMENT_CI_POLICY_SHA256,
  v24: '1522e203f3ead6a259f93494e25c34526a024f93a757b1c7d22568e219f4a6b6',
  v29: LOCAL_FIXTURE_POLICY_SHA256,
  v30: ORIGINAL_FIELDS_POLICY_SHA256,
  v31: '1cf19c82e46adf7a731e4f0c625cc1dd1f8e07e5b744eb06a872cbaa01849bd5', v32: '2a217d7e2404208d1b14c26628758a3471a92566b66a124456da14b17ecc36ad', v33: '2e7bb2d6f771c3e7bf280355b5248c0e60a9b3d8d60bd7e10463c383d6ae8184', v34: '5e773f9c23b32bdff427796c07abdfa64f506550a2ae62774f6708059db7bfc5', v35: RECORDED_V35_PRODUCTION_POLICY_SHA256,
} as const;

const LOCAL_FIXTURE_REGISTERED_PROFILES: readonly LocalFixtureRegisteredProfile[] = [
  'baseline', 'conflict', 'custom', 'dialogue', 'evaluation', 'factual', 'polish', 'readers', 'review', 'rewrite', 'series', 'workspace', 'writing',
];

export const LOCAL_FIXTURE_RULE_IDS: readonly LocalFixtureRuleId[] = [
  'development-ci-fixture-review', 'development-ci-fixture-global-agent-dialogue', 'development-ci-fixture-learning-curation',
  'development-ci-fixture-editorial-polish', 'development-ci-fixture-factual-claim-stages', 'development-ci-fixture-factual-recheck',
];

/** A closed persisted interpretation, without substituting today's selection for an absent historical field. */
export function selectedPolicyIdentityOf(value: unknown): SelectedPolicyIdentity | null {
  if (!isPolicyIdentityRecord(value) || !hasPolicyIdentityKeys(value, ['providerProcessingVersion', 'providerProcessingSha256', 'activePolicySetVersion', 'activePolicySetSha256'])) return null;
  if (value['activePolicySetVersion'] === 'no-policy-lock' && ['v1', 'v24', 'v35'].includes(String(value['providerProcessingVersion'])) &&
      value['providerProcessingSha256'] === '0'.repeat(64) && value['activePolicySetSha256'] === '0'.repeat(64))
    return value as unknown as SelectedPolicyIdentity;
  const version = value['providerProcessingVersion'];
  const set = value['activePolicySetVersion'];
  const setSha256 = set === 'v21' ? ORIGINAL_FIELDS_ACTIVE_SET_SHA256 : set === 'v22' ? '68125ebd3e1266f02fc1cf02c0a548fa652c4cad3ee052bbfaebc68922758ebb' : set === 'v23' ? 'fe666f4a92b7a82503d69b345233cbec7a93846f97e10027524d7e3d3a76f2ab' : set === 'v24' ? '092a858cac7e0eb03b2a978d3df60a9801185f9825c9ce7d4f24004537b64641' : set === 'v25' ? '2bc2f4d506d12596fd4b100793c31e423336269450def6cb97d892a5f358835d' : set === 'v26' ? RECORDED_V26_ACTIVE_SET_SHA256 : null;
  if ((version !== 'v1' && version !== 'v24' && version !== 'v29' && version !== 'v30' && version !== 'v31' && (version !== 'v32' && version !== 'v33' && version !== 'v34' && version !== 'v35')) ||
      value['providerProcessingSha256'] !== SELECTED_PROVIDER_DIGESTS[version] || setSha256 === null || value['activePolicySetSha256'] !== setSha256 ||
      !((set === 'v21' && ['v24', 'v29', 'v30'].includes(version)) || (set === 'v22' && ['v1', 'v24', 'v31'].includes(version)) || (set === 'v23' && ['v1', 'v24', 'v32'].includes(version)) || (set === 'v24' && ['v1', 'v24', 'v33'].includes(version)) || (set === 'v25' && ['v1', 'v24', 'v34'].includes(version)) || (set === 'v26' && ['v1', 'v24', 'v35'].includes(version)))) return null;
  return { providerProcessingVersion: version, providerProcessingSha256: SELECTED_PROVIDER_DIGESTS[version],
    activePolicySetVersion: set as 'v21' | 'v22' | 'v23' | 'v24' | 'v25' | 'v26', activePolicySetSha256: setSha256 };
}

/** Shape and document equality only; the actual fixture/caller/message conjunction is checked by the fixture owner. */
export function localFixtureProfileOf(value: unknown, selected: SelectedPolicyIdentity): LocalFixtureProfile | null {
  if (!isPolicyIdentityRecord(value) || selected.providerProcessingVersion !== 'v29' || selected.activePolicySetVersion !== 'v21' || selectedPolicyIdentityOf(selected) === null ||
      value['schema'] !== 'ai7.local-fixture-profile/1' || value['policyVersion'] !== 'v29' ||
      value['policySha256'] !== selected.providerProcessingSha256 || value['activePolicySetVersion'] !== selected.activePolicySetVersion ||
      value['activePolicySetSha256'] !== selected.activePolicySetSha256) return null;
  const common = { schema: 'ai7.local-fixture-profile/1', policyVersion: 'v29', policySha256: selected.providerProcessingSha256,
    activePolicySetVersion: selected.activePolicySetVersion, activePolicySetSha256: selected.activePolicySetSha256 } as const;
  const keys = ['schema', 'policyVersion', 'policySha256', 'activePolicySetVersion', 'activePolicySetSha256', 'kind'];
  if (value['kind'] === 'legacy' && hasPolicyIdentityKeys(value, [...keys, 'profileId', 'manifestSha256', 'registeredProfile']) &&
      value['profileId'] === 'development-ci-legacy-local-fixture-809c96f2' && value['manifestSha256'] === LOCAL_FIXTURE_MANIFEST_SHA256) {
    const registeredProfile = LOCAL_FIXTURE_REGISTERED_PROFILES.find((profile) => profile === value['registeredProfile']);
    return registeredProfile === undefined ? null : { ...common, kind: 'legacy', profileId: 'development-ci-legacy-local-fixture-809c96f2',
      manifestSha256: LOCAL_FIXTURE_MANIFEST_SHA256, registeredProfile };
  }
  if (value['kind'] === 'rule' && hasPolicyIdentityKeys(value, [...keys, 'ruleId'])) {
    const ruleId = LOCAL_FIXTURE_RULE_IDS.find((id) => id === value['ruleId']);
    return ruleId === undefined ? null : { ...common, kind: 'rule', ruleId };
  }
  return null;
}

/** Exact Run Budget Ceiling state: `unset` under development-ci, an explicit total-token ceiling under developer-live. */
export type RunBudgetCeilingState = 'unset' | { kind: 'tokens'; maxTotalTokens: number };

/** ADR 0095 / #1160: a technical leaf inside the parent attempt, never another Task or Run. */
export interface ParentAttemptSubagentDeclaration {
  readonly profileId: 'ai7-stock-typos-leaf/1' | 'ai7-stock-typos-fanout/1';
  readonly provider: 'spawn';
  readonly transport: 'same-process';
  readonly lifetime: 'one-shot';
  readonly stage: 'units';
  readonly maxDepth: 1;
  readonly maxActiveChildren: 1 | 3;
  readonly unitWidth: 1;
  readonly awaitDisposal: true;
}

/**
 * The Run Budget Ceiling a developer-live launch binds: an explicit form ceiling as a total, or the
 * Provider Processing v18 default (unchanged since v9) of 30,000 tokens per frozen Coverage Manifest unit (ADR 0070),
 * resolved once the manifest freezes and before the plan does.
 */
export type DeveloperLiveCeiling =
  | { readonly kind: 'tokens'; readonly maxTotalTokens: number }
  | { readonly kind: 'tokens-per-frozen-unit'; readonly tokensPerFrozenUnit: number };

/**
 * The execution route an analysis Run binds: the in-process deterministic adapter, the developer-live OpenCode Go route, or —
 * under ordinary-production (Issues #811, #1225) — a route the runtime model table records for a production role.
 */
export type ExecutionRouteId = 'ai7-local-deterministic' | OrdinaryProductionRouteId;

/** A remote Provider route a Provider Resolution Plan may name: a route a provider document declares (ADR 0073 §2). */
export type RemoteProviderId = ConfiguredRouteId;

/** A logical credential slot of the Main Editorial Role: one per configured provider (ADR 0073 §4). */
export type CredentialSlotId = ConfiguredCredentialSlot;

/** The Provider Processing pin a Provider Resolution Plan carries for its trusted scope. */
export type ProviderProcessingPin =
  | { operationalScope: 'development-ci'; version: 'v1' | 'v29'; decision: 'deny'; authorizedLiveTransmissionCount: 0 }
  | { operationalScope: 'developer-live'; version: DeveloperLiveProviderProcessingVersion; decision: 'eligible-only'; authorizedLiveTransmissionCount: 'bounded-by-run' }
  | { operationalScope: 'ordinary-production'; version: OrdinaryProductionProviderProcessingVersion; decision: 'eligible-only'; authorizedLiveTransmissionCount: 'bounded-by-run' };

/** The policy pin a Result Set Revision records; `liveTransmissions` is the policy's bound, never a usage count. */
export type ResultSetPolicyPin =
  | { operationalScope: 'development-ci'; providerProcessingVersion: 'v1' | 'v29'; activePolicySetVersion: ActivePolicySetVersion; liveTransmissions: 0 }
  | { operationalScope: 'developer-live'; providerProcessingVersion: DeveloperLiveProviderProcessingVersion; activePolicySetVersion: ActivePolicySetVersion; liveTransmissions: 'bounded-by-run' }
  | { operationalScope: 'ordinary-production'; providerProcessingVersion: OrdinaryProductionProviderProcessingVersion; activePolicySetVersion: ActivePolicySetVersion; liveTransmissions: 'bounded-by-run' };

/**
 * Every (scope, Provider Processing, active set) a launch actually pinned: each runtime-selected set's own scope pins, 41
 * historical tuples plus the three set-v21 tuples this selection introduces. Set v3 predates carrier v2; developer-live v4
 * (set v4, before #440) is outside today's version type yet authentic. On the accepted lineage sets v6 and v20 and
 * developer-live v8 were never selected, and ordinary production was not launchable before set v10.
 */
const RECORDED_POLICY_PINS: Readonly<Record<TrustedOperationalScope, ReadonlyArray<readonly [string, string]>>> = {
  'development-ci': [...['v3', 'v4', 'v5', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']
    .map((set) => ['v1', set] as const), ['v29', 'v21'], ['v1', 'v22'], ['v1', 'v23'], ['v1', 'v24'], ['v1', 'v25'], ['v1', 'v26']],
  'developer-live': [['v4', 'v4'], ['v5', 'v5'], ['v9', 'v7'], ['v10', 'v8'], ['v11', 'v9'], ['v12', 'v10'], ['v14', 'v11'], ['v16', 'v12'],
    ['v18', 'v13'], ['v20', 'v14'], ['v22', 'v15'], ...['v16', 'v17', 'v18', 'v19', 'v21', 'v22', 'v23', 'v24', 'v25', 'v26'].map((set) => ['v24', set] as const)],
  'ordinary-production': [['v13', 'v10'], ['v15', 'v11'], ['v17', 'v12'], ['v19', 'v13'], ['v21', 'v14'], ['v23', 'v15'], ['v23', 'v16'],
    ['v25', 'v17'], ['v26', 'v18'], ['v27', 'v19'], ['v30', 'v21'], ['v31', 'v22'], ['v32', 'v23'], ['v33', 'v24'], ['v34', 'v25'], ['v35', 'v26']],
};

/** A Provider Processing version some launch of this scope actually pinned (a frozen Plan names no set). */
export function isRecordedProviderProcessingVersion(scope: unknown, version: unknown): boolean {
  return (scope === 'development-ci' || scope === 'developer-live' || scope === 'ordinary-production') &&
    RECORDED_POLICY_PINS[scope].some(([recorded]) => recorded === version);
}

/** A recorded pin, read exactly against the tuples above, never as a cross-product of versions and sets. */
export function isResultSetPolicyPin(value: unknown): value is ResultSetPolicyPin {
  if (!isPolicyIdentityRecord(value) || !hasPolicyIdentityKeys(value, ['operationalScope', 'providerProcessingVersion', 'activePolicySetVersion', 'liveTransmissions'])) return false;
  const scope = value.operationalScope;
  return (scope === 'development-ci' || scope === 'developer-live' || scope === 'ordinary-production') &&
    (RECORDED_POLICY_PINS[scope].some(([version, set]) => version === value.providerProcessingVersion && set === value.activePolicySetVersion) ||
      value.activePolicySetVersion === 'no-policy-lock' && value.providerProcessingVersion === (scope === 'development-ci' ? 'v1' : scope === 'developer-live' ? 'v24' : 'v35')) &&
    value.liveTransmissions === (scope === 'development-ci' ? 0 : 'bounded-by-run');
}

/** The three launch-form arguments the built entry accepts beside `--data-root`; carried by argv only, never by an environment variable or setting. */
export const TRUSTED_SCOPE_ARGUMENT = '--trusted-operational-scope';

export const RUN_BUDGET_CEILING_ARGUMENT = '--run-budget-ceiling';

/**
 * J-09's 后台分析登记 pace (Issue #95, S39; #713 review, P2-7): the quiet period in milliseconds a development-ci J-09 launch sets
 * beside the model adapter, so the Journey waits on the dispatcher's progress rather than a clock. Never in any other launch.
 */
export const BACKGROUND_QUIET_ARGUMENT = '--j09-background-quiet-ms';

/** A J-09 quiet period: whole milliseconds from 1 s to 30 s, the product's own; anything else is refused. */
export function parseBackgroundQuietMs(value: string): number | null {
  if (!/^[1-9][0-9]{3,4}$/u.test(value)) return null;
  const ms = Number(value);
  return ms >= 1_000 && ms <= 30_000 ? ms : null;
}

/**
 * J-11's calibration gate (Issue #429, EVAL-011a; the Commander's ruling of 2026-10-10): the number of adjusted Books the
 * house offset waits on, lowered for a development-ci J-11 launch beside the model adapter so the Journey proves the gate with
 * two Books instead of ten. `CALIBRATION_MIN_ADJUSTMENTS` stays the product's in every other launch. Never in any other launch.
 */
export const CALIBRATION_MIN_BOOKS_ARGUMENT = '--j11-calibration-min-books';

/** A J-11 calibration gate: a whole number of Books from 2 to 10; anything else is refused. */
export function parseCalibrationMinBooks(value: string): number | null {
  if (!/^(?:[2-9]|10)$/u.test(value)) return null;
  return Number(value);
}

/**
 * Whether a launch may carry `--j11-calibration-min-books`, and what it sets: `undefined` when the argument is absent, `null`
 * when it must be refused — any Journey but J-11 (no Journey included), or a value outside 2–10 — else the gate. Main and the
 * service both decide by this one rule.
 */
export function calibrationMinBooksForLaunch(value: string | undefined, journey: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (journey !== 'J-11') return null;
  return parseCalibrationMinBooks(value);
}

export const PROVIDER_CACHE_ROOT_ARGUMENT = '--provider-cache-root';

/** The development validation a developer-live launch performs (Issue #808, ADR 0089): `<family>/<case>`, required under that scope. */
export const VALIDATION_CASE_ARGUMENT = '--validation-case';

/** The substantive delta a developer-live launch declares beside its validation case: `<kind>:<rationale>`, optional. */
export const VALIDATION_DELTA_ARGUMENT = '--validation-delta';

export const LAUNCH_SELECTABLE_SCOPES: ReadonlyArray<TrustedOperationalScope> = ['development-ci', 'developer-live', 'ordinary-production'];

/** A positive decimal token count without sign, separators, or leading zeros; twelve digits stay well inside the safe-integer range. */
export const RUN_BUDGET_CEILING_PATTERN = /^[1-9][0-9]{0,11}$/u;

/** Windows drive-rooted, UNC, or POSIX-rooted; every process on the launch path re-checks with its own path owner. */
const ABSOLUTE_PATH_SHAPE = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/u;

export interface TrustedLaunchForm {
  readonly trustedOperationalScope: TrustedOperationalScope;
  /** The explicit ceiling in total tokens, or `null` for the scope default. */
  readonly runBudgetCeiling: number | null;
  /** The explicit absolute Provider Result Cache root, or `null` for the scope default. */
  readonly providerCacheRoot: string | null;
  /** The development validation a developer-live launch performs; `null` under every other scope, ordinary production included. */
  readonly validation: DevelopmentValidationIntent | null;
}

export interface RawTrustedLaunchForm {
  readonly trustedOperationalScope?: string | undefined;
  readonly runBudgetCeiling?: string | undefined;
  readonly providerCacheRoot?: string | undefined;
  readonly validationCase?: string | undefined;
  readonly validationDelta?: string | undefined;
}

/**
 * What a developer-live launch validates (Issue #808, ADR 0089): a stable family — the capability under test — and a case —
 * the scenario — that name the purpose independently of any Issue, plan slice, Run or attempt number. The Provider Test Ledger
 * reuses evidence by this purpose; renaming it changes no request, so it can never by itself make an answered request new.
 */
export interface DevelopmentValidationIntent {
  readonly family: string;
  readonly case: string;
  readonly delta: DevelopmentValidationDelta | null;
}

/**
 * The substantive difference a launch declares that existing evidence cannot answer. `input`: the same purpose and step over an
 * input whose content actually differs from what was captured. `retry-unknown`: sending once more a request whose earlier result
 * is unknown and possibly billed. Each is verified against the ledger before anything is sent; a route, endpoint, request shape,
 * model or prompt contract that changed needs no declaration, because the ledger detects and records it itself.
 */
export interface DevelopmentValidationDelta {
  readonly kind: 'input' | 'retry-unknown';
  readonly rationale: string;
}

export const DEVELOPMENT_VALIDATION_DELTA_KINDS: ReadonlyArray<DevelopmentValidationDelta['kind']> = ['input', 'retry-unknown'];

/** Lower-case words joined by single hyphens, at most 48 characters. */
const VALIDATION_SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/**
 * Words that are numbering rather than purpose: an Issue, a pull request, a plan slice (`s40`, `s87f3`), a Run, an attempt, a
 * test item, a retry, or a bare number. A family or case naming one would make the same question look new when it is renumbered.
 */
const NUMBERING_WORD = /^(?:(?:issue|pr|run|attempt|item|retry)[0-9]+|s[0-9]+[a-z0-9]*|[0-9]+)$/u;

function purposeSlug(value: string, minimumWords: number): boolean {
  if (value.length > 48 || !VALIDATION_SLUG.test(value)) return false;
  const words = value.split('-');
  return words.length >= minimumWords && !words.some((word) => NUMBERING_WORD.test(word));
}

/** `<family>/<case>`, each a purpose slug free of numbering words; `null` for anything else. */
export function parseValidationCase(value: string): Pick<DevelopmentValidationIntent, 'family' | 'case'> | null {
  const parts = value.split('/');
  if (parts.length !== 2 || !purposeSlug(parts[0]!, 1) || !purposeSlug(parts[1]!, 1)) return null;
  return { family: parts[0]!, case: parts[1]! };
}

/** `<kind>:<rationale>`: a closed kind and a rationale of at least two words free of numbering words; `null` for anything else. */
export function parseValidationDelta(value: string): DevelopmentValidationDelta | null {
  const separator = value.indexOf(':');
  if (separator === -1) return null;
  const kind = value.slice(0, separator);
  const rationale = value.slice(separator + 1);
  if (!(DEVELOPMENT_VALIDATION_DELTA_KINDS as ReadonlyArray<string>).includes(kind) || !purposeSlug(rationale, 2)) return null;
  return { kind: kind as DevelopmentValidationDelta['kind'], rationale };
}

export function isTrustedOperationalScope(value: string): value is TrustedOperationalScope {
  return (LAUNCH_SELECTABLE_SCOPES as ReadonlyArray<string>).includes(value);
}

/**
 * Parse the launch form exactly as every process on the launch path does: an unknown scope, a
 * malformed ceiling, a relative cache root, or a ceiling, cache root or validation argument without
 * the developer-live scope yields `null`, and the caller fails closed. Absent arguments select
 * `development-ci`. A developer-live launch must name the development validation it performs
 * (Issue #808): that scope is a developer-test scope, and an unnamed purpose fails closed before
 * anything could be dispatched rather than sending outside the Provider Test Ledger. An
 * `ordinary-production` launch (Issue #811) takes none of the four development arguments: its
 * ceiling is the editor's per Run, and it has no cache, ledger or validation at all.
 */
export function parseTrustedLaunchForm(raw: RawTrustedLaunchForm): TrustedLaunchForm | null {
  const scope = raw.trustedOperationalScope ?? 'development-ci';
  if (!isTrustedOperationalScope(scope)) return null;
  if (scope !== 'developer-live' && (raw.runBudgetCeiling !== undefined || raw.providerCacheRoot !== undefined ||
    raw.validationCase !== undefined || raw.validationDelta !== undefined)) return null;
  let validation: DevelopmentValidationIntent | null = null;
  if (scope === 'developer-live') {
    const named = raw.validationCase === undefined ? null : parseValidationCase(raw.validationCase);
    if (named === null) return null;
    const delta = raw.validationDelta === undefined ? null : parseValidationDelta(raw.validationDelta);
    if (raw.validationDelta !== undefined && delta === null) return null;
    validation = { ...named, delta };
  }
  let runBudgetCeiling: number | null = null;
  if (raw.runBudgetCeiling !== undefined) {
    if (!RUN_BUDGET_CEILING_PATTERN.test(raw.runBudgetCeiling)) return null;
    runBudgetCeiling = Number(raw.runBudgetCeiling);
    if (!Number.isSafeInteger(runBudgetCeiling) || runBudgetCeiling <= 0) return null;
  }
  let providerCacheRoot: string | null = null;
  if (raw.providerCacheRoot !== undefined) {
    if (!ABSOLUTE_PATH_SHAPE.test(raw.providerCacheRoot)) return null;
    providerCacheRoot = raw.providerCacheRoot;
  }
  return { trustedOperationalScope: scope, runBudgetCeiling, providerCacheRoot, validation };
}

/**
 * The outbound data categories a Provider Processing rule may name (Issue #841). The Egress Gate recognises these identifiers;
 * naming one in a rule declares what the gate must accept, and the consuming slices decide when a binding carries it.
 * `public-or-synthetic` and `editor-selected-manuscript-excerpt` are the original two; the other four arrive with Provider
 * Processing v11 for writing, evaluation and conflict regeneration (frozen inputs and manuscript excerpts); the last two,
 * `frozen-material-reference-excerpt` and `editorial-deliverable-excerpt`, arrive with v12 for Material-Reference-bearing
 * review, writing and evaluation and for cross-deliverable consistency. A declaration only: the gate's logic is the consuming
 * slices' to change. Ordinary production v13 also carries the three unpublished classes from its policy rules.
 * `web-search-query` (the model's own search query, sent to the selected search backend's host) and `public-source-fetch` (a
 * public page address the model cited, fetched by AI7's webfetch) arrive with Provider Processing v16 and v17 on the rules that may
 * research.
 */
export type OutboundDataCategoryId =
  | 'editorial-learning-example'
  | 'editor-task-instruction'
  | 'house-review-guideline-clause'
  | 'public-or-synthetic'
  | 'editor-selected-manuscript-excerpt'
  | 'editor-authored-evaluation-text'
  | 'house-exemplar-excerpt'
  | 'book-metadata-and-synopsis'
  | 'manuscript-conflict-region-excerpt'
  | 'frozen-material-reference-excerpt'
  | 'editorial-deliverable-excerpt'
  | 'house-review-preference-excerpt'
  | 'editor-authored-question-template'
  | 'series-knowledge-excerpt'
  | 'unpublished-metadata'
  | 'unpublished-excerpts'
  | 'unpublished-full-content'
  | 'web-search-query'
  | 'public-source-fetch';

/**
 * One allow rule of the selected Provider Processing policy, as the launch verified it from the pinned bytes: the task kinds it
 * admits, the Model Role it binds, that role's exact route, endpoint, model and credential slot, and the outbound data categories
 * it permits. Eligibility only — a rule authorizes no Run, dispatch or Apply on its own.
 */
export interface AdmittedFactualVerificationStage {
  readonly contractId: 'ai7.factual-claim-verification/1';
  readonly stageId: 'web-verification';
  readonly maximumInitialSessionsPerEligibleClaim: number;
  readonly maximumModelRequestsPerSession: number;
  readonly maximumPlatformToolRoundsPerSession: number;
  readonly maximumSearchSubmissionsPerClaim: number;
  readonly maximumMetadataUtf8Bytes: number;
  readonly tools: readonly string[];
  readonly automaticTransportRetryAllowed: false;
  readonly contractRetryAllowed: false;
  readonly counterResetOnResumeAllowed: false;
}

export interface AdmittedFactualClaimStages {
  readonly taskKind: 'factual-review';
  readonly taskMode: 'whole-manuscript';
  readonly evidenceAssuranceLevels: readonly EvidenceAssuranceLevel[];
  readonly procedureId: string;
  readonly procedureVersion: number;
  readonly claimArtifactSchema: 'ai7.factual-claim-ledger/1';
  readonly claimExtraction: {
    readonly contractId: 'ai7.factual-claim-extraction/1';
    readonly stageId: 'claim-extraction';
    readonly maximumInitialSessionsPerCoverageUnit: number;
    readonly maximumModelRequestsPerSession: number;
    readonly maximumAssertionsPerCoverageUnit: number;
    readonly tools: readonly string[];
    readonly automaticTransportRetryAllowed: false;
    readonly contractRetryAllowed: false;
  };
  readonly claimVerification: AdmittedFactualVerificationStage;
}

export interface AdmittedFactualRecheck {
  readonly maximumClaims: number;
  readonly maximumAutomaticRunsPerOnceKey: number;
  readonly requestedLevels: readonly EvidenceAssuranceLevel[];
  readonly onlyContractId: 'ai7.factual-claim-verification/1';
  readonly onlyStageId: 'web-verification';
  readonly verificationContract: AdmittedFactualVerificationStage;
  readonly onceKeyPersistedBeforeDispatch: true;
  readonly latestStillCurrentEditorDecisionRequired: true;
  readonly sameBookActiveMatchingEnrollmentRequired: true;
}

export interface AdmittedProviderRule {
  readonly claimScopedFactualStages?: AdmittedFactualClaimStages;
  readonly factualRecheck?: AdmittedFactualRecheck;
  readonly enabledLearningEnvelope?: { readonly pins: readonly string[]; readonly missingStaleRevokedOrExceededResult: 'refuse';
    readonly extraPerPassClickRequired: false; readonly disableStopsLaterDispatchAndUse: true };
  /** v27 review names the same bounded synthesis turn as writing/evaluation; eligibility only. */
  readonly plusOneCrossUnitSynthesisTurn?: boolean;
  /** Book-less dialogue: category labels record what is sent and do not restrict transmission; ADR 0079 §4.4 redaction still applies. */
  readonly globalAgentDialogue?: {
    readonly source: {
      readonly bookRequired: false;
      readonly explicitlyListedEligibleMemoryAndPreferenceRevisionsOnly: true;
      readonly eligibleRevisionPinsRequired: true;
      readonly editorOwnWordsAllowed: true;
      readonly unlistedSourcesAllowed: false;
    };
    readonly outboundCategoryRestriction: 'none';
    readonly outboundDataDisclosureRequired: true;
    readonly redaction: {
      readonly housePeopleNamesAndRolesStripped: true;
      readonly remarksAndInternalNotesStripped: true;
      readonly authorInformationAllowed: true;
      readonly houseNameAllowed: true;
    };
  };
  /** v31's scoped Global dialogue (#1171): the declared source and tool blocks, exactly as the policy states them. */
  readonly globalAgentScopedDialogue?: {
    readonly source: Readonly<Record<string, boolean>>;
    readonly scopedTools: {
      readonly names: readonly string[];
      readonly callsPerAttempt: number;
      readonly candidatesPerRetrieval: number;
      readonly maxResultBytes: number;
      readonly roundTripBreaker: number;
      readonly [term: string]: unknown;
    };
    readonly outboundCategoryRestriction: 'none';
    readonly outboundDataDisclosureRequired: true;
    readonly redaction: NonNullable<AdmittedProviderRule['globalAgentDialogue']>['redaction'];
  };
  readonly taskKindOverrides?: Readonly<Record<string, { readonly webSearch: boolean }>>;
  readonly editorTaskInstruction?: {
    readonly category: 'editor-task-instruction';
    readonly maxGraphemes: number;
    readonly attributedToProcedureVersion: true;
    readonly personNamesAllowed?: false;
    readonly textProcessing?: { readonly mode: 'qualified-original-field-processing'; readonly qualificationRef: 'ordinary-production-original-fields-adr0099';
      readonly unqualified: { readonly personNamesAllowed: false }; readonly qualifiedOriginalWords: 'preserve-within-existing-field-contract' };
    readonly contractFramingOverrideAllowed: false;
  };
  readonly houseReviewGuidelineClause?: {
    readonly category: 'house-review-guideline-clause';
    readonly maxClauses: number;
    readonly maxGraphemesPerClause: number;
    readonly attributedToImportedDocumentVersion: true;
    readonly personNamesAllowed?: false;
    readonly textProcessing?: { readonly mode: 'qualified-original-field-processing'; readonly qualificationRef: 'ordinary-production-original-fields-adr0099';
      readonly unqualified: { readonly personNamesAllowed: false }; readonly qualifiedOriginalWords: 'preserve-within-existing-field-contract' };
  };
  readonly plusDeclaredContractRetryAdaptations?: boolean;
  /** `true` on the v22/v23 review rule alone (`source.seriesKnowledgeAllowed`); absent on every other rule and policy, which refuses Series knowledge. */
  readonly seriesKnowledgeAllowed?: boolean;
  readonly ruleId: string;
  readonly taskKinds: readonly string[];
  readonly modelRole: string;
  readonly route: string;
  readonly endpoint: string;
  readonly model: string;
  readonly credentialSlot: string;
  readonly outboundDataCategories: readonly OutboundDataCategoryId[];
  /**
   * Whether the rule names the kind's one book-level synthesis turn (全书综合 / 综合) as a transmission (Provider Processing
   * v11). Writing and evaluation name it; v26 also declares review eligibility. Review's bounded synthesis consumer
   * arrives with F-19b and its successor transmission bound. A rule that does not name the turn carries `false`.
   */
  readonly crossUnitSynthesisAllowed: boolean;
  /**
   * Whether the rule's `source` block admits frozen Material Reference excerpts (`source.materialReferencesAllowed`; `false` when the
   * rule's source does not name the term). A consuming kind admits a material-bearing contract only under a rule that states this
   * and also lists `frozen-material-reference-excerpt` among its outbound categories (Provider Processing v12 to v15).
   */
  readonly materialReferencesAllowed: boolean;
  /**
   * Whether the rule's `source` block admits the Book's finalized editorial deliverables (`source.editorialDeliverablesAllowed`; `false`
   * when the term is absent). A deliverable-bearing kind (cross-deliverable consistency) needs this together with
   * `editorial-deliverable-excerpt` among the rule's outbound categories.
   */
  readonly editorialDeliverablesAllowed: boolean;
  /**
   * Whether the rule lets the model ask the editor a clarification question while it works on a unit (`clarification.modelQuestionAllowed`,
   * Provider Processing v14 and v15): `true` for every Run-based rule (baseline analysis, review, writing, the three evaluation contracts and
   * enrolled background analysis), `false` for editorial dialogue, 润色 and conflict regeneration. One question per unit; the unit waits.
   */
  readonly clarificationQuestionAllowed: boolean;
  /**
   * Hours an unanswered question waits before it counts as unanswered and the Run continues with the Run Report disclosing it
   * (`clarification.timeoutHours`); `null` when the rule allows no question.
   */
  readonly clarificationTimeoutHours: number | null;
  /**
   * Whether this is the enrolled-background rule (`enrolled-background-manuscript-analysis-processing`, Provider Processing v14 and v15):
   * the one rule whose origin is an active matching Background Analysis Enrollment. `true` only for that rule, which lists its task
   * kind (baseline analysis) truthfully; a foreground lookup skips it and a background lookup selects only it.
   */
  readonly backgroundOrigin: boolean;
  /**
   * Whether the rule's `authorityOrigin` admits the Task's matching active Default Execution Rule (快速开始) as its origin
   * (`authorityOrigin.matchingActiveDefaultExecutionRuleAllowed`, Provider Processing v14 and v15): `true` for review in both scopes
   * and writing in developer-live only; `false` for every other rule. A newly user-initiated Task is still required, so a default rule never starts work alone.
   */
  readonly matchingActiveDefaultExecutionRuleAllowed: boolean;
  /**
   * The rule's web switch (`transmissions.webSearchToolAllowed`, Provider Processing v16 and v17): `true` exactly for the rules that may
   * research — review (事实核查 and 学术道德与引用 among its kinds), writing, the three evaluation contracts — and `false` for editorial
   * dialogue, baseline analysis, 润色, conflict regeneration and enrolled background analysis.
   */
  readonly webSearchToolAllowed: boolean;
  /** The rule's platform tools as the launch verified them, or `null` exactly when `webSearchToolAllowed` is `false`. */
  readonly platformTools: AdmittedPlatformTools | null;
  /**
   * The rule's local tools as the launch verified them (Provider Processing v18 and v19): present on every admitted rule, with
   * `targetedRetrieval.allowed` `false` for enrolled background analysis and material translation.
   */
  readonly localTools: AdmittedLocalTools;
  /**
   * Whether the rule lets a retained external source's passage be translated into Chinese by the Run's own model (来源译文;
   * `sourceTranslationAllowed`, Provider Processing v18 and v19): `true` for the research review rule alone, `false` for every other rule.
   */
  readonly sourceTranslationAllowed: boolean;
}

/**
 * AI7's platform tools one admitted rule names (Provider Processing v16 and v17), as the launch verified them against the search
 * backend registry: eligibility only. Which backend a Run uses, its freeze, the tickets and the host allowance belong to the
 * consuming slice; a backend listed here is selectable, never selected.
 */
export interface AdmittedPlatformTools {
  readonly websearch: {
    readonly selection: 'user-configured';
    /** The shipped backends in the recorded ranking order; the first is the default selection. */
    readonly backends: ReadonlyArray<AdmittedSearchBackend>;
    /** `true` under ordinary-production: a backend without the editor's own configured key cannot be selected for a Run. */
    readonly selectionRequiresCredential: boolean;
  };
  /** AI7's webfetch: at most `maxBytes` and `timeoutSeconds` per page, only for addresses the model cited. */
  readonly webfetch: { readonly maxBytes: number; readonly timeoutSeconds: number; readonly boundedByCitations: true };
  /** The per-unit circuit breaker: after `roundTrips` consecutive tool round trips the unit ends, disclosed as `end` (联网核查未完成). */
  readonly breaker: { readonly roundTrips: number; readonly end: string };
  readonly oneQueryPerRunUnit: true;
  /** The category tool results return to the model as. */
  readonly toolResultCategory: 'public-or-synthetic';
}

/** One selectable search backend of an admitted rule: its id, the one host its search calls may address, and its broker slot. */
export interface AdmittedSearchBackend {
  readonly id: string;
  readonly host: string;
  readonly credentialSlot: string;
}

/**
 * AI7's local tools one admitted rule names (Provider Processing v18 and v19, Issue #891; ADR 0026, ADR 0047), as the launch verified
 * them against the bounds of this build: eligibility only. Targeted retrieval reads only the sources the Run's authorization pinned,
 * returns ranked candidates with anchors, sends nothing outside the process and counts its calls and tokens into the Run ceiling; a
 * citation needs an Exact Fetch of the pinned revision. Executing the tool belongs to the retrieval slice.
 */
export interface AdmittedLocalTools {
  /** Eligibility only; registration belongs to the consuming composition. */
  readonly declarations?: ReadonlyArray<{ readonly name: string; readonly readOnly: true; readonly concurrencySafe: true }>;
  readonly parallelCallsAllowed?: boolean;
  readonly targetedRetrieval: {
    /** `false` exactly for enrolled background analysis and material translation: neither may initiate retrieval. */
    readonly allowed: boolean;
    /** The tool reads only what the Run was authorized to read: the manuscript revision, 允许参考 items at their frozen index version, retained sources. */
    readonly source: 'authorized-pinned-sources-only';
    /** At most this many retrieval calls per Run unit. */
    readonly callsPerUnit: number;
    /** Each call returns at most this many ranked candidates. */
    readonly candidatesPerCall: number;
    /** A citation without an Exact Fetch of the pinned revision is refused by the result validator. */
    readonly exactFetchRequiredBeforeCitation: true;
    /** Nothing leaves the process: no Egress Gate ticket, no host. */
    readonly scope: 'no-egress';
  };
  /** The per-unit circuit breaker: after `roundTrips` consecutive tool round trips the unit ends, disclosed as `end` (检索未完成). */
  readonly breaker: { readonly roundTrips: number; readonly end: string };
}

export interface LaunchPolicyProjection {
  /** Historical document identity, or the fixed no-policy-lock compatibility marker. */
  selectedPolicyIdentity?: SelectedPolicyIdentity;
  integrityState: 'verified' | 'denied';
  denialReason: string | null;
  operationalScope: TrustedOperationalScope | null;
  activePolicySetVersion: ActivePolicySetVersion | null;
  providerProcessing: {
    /** Per-kind enrollment eligibility only; baseline Background Analysis Enrollment is independent. */
    readonly backgroundProcessingEnrollment?: {
      readonly enrollableKinds: ReadonlyArray<{
        readonly kind: 'learning-curation' | 'material-index' | 'review-reduction' | 'factual-recheck';
        readonly mandatoryCeiling: true;
      }>;
      readonly activeMatchingEnrollmentRequired: true;
      readonly revocable: true;
      readonly planEnvelopeRequired: true;
      readonly exactProviderBindingRequired: true;
      readonly runAuthorizationRequired: true;
      readonly runSourceScopeRequired: true;
      readonly ceilingEvaluatedBeforeEveryDispatch: true;
      readonly finalProviderPayloadEgressGateRequired: true;
      readonly openingPageOrImportCreatesEnrollment: false;
    };
    readonly subAgents?: {
      readonly declaredInPlanEnvelopeRequired: true;
      readonly inheritsParentScopeBindingPolicyAndCeiling: true;
      readonly countsInsideParentAttemptTransmissionBound: true;
      readonly finalProviderPayloadEgressGateRequired: true;
      readonly createsTaskRunOrDecisionRecordAllowed: false;
    };
    /** Configurable defaults, not immutable numeric execution caps (ADR 0095 §2). */
    readonly execution?: {
      readonly maxInFlightRequests: { readonly configurable: true; readonly default: number };
      readonly perRunUnitParallelism: { readonly configurable: true; readonly default: number };
      readonly backgroundShare: { readonly configurable: true; readonly default: number };
    };
    readonly transport?: {
      readonly requestDeadlineSeconds: number;
      readonly rateLimitRetry: { readonly honourRetryAfter: boolean; readonly maxRetries: number };
    };
    readonly research?: { readonly searchesPerClaim: number }; readonly searchConnectionTest?: SearchConnectionTestPolicy;
    /** Fixed-public settings probes use verified search terms independently of model setup. */
    readonly settingsSearchTools?: AdmittedProviderRule['platformTools'];
    version: ProviderProcessingVersion | null;
    decision: 'deny' | 'eligible-only';
    /** `0` under development-ci; the verbatim token `bounded-by-run` under developer-live. */
    authorizedLiveTransmissionCount: 0 | 'bounded-by-run';
    liveTransmissionAllowed: boolean;
    /**
     * Whether the active Provider Processing policy names the cross-unit reduction's transmission
     * (ADR 0066). Optional so a denial can carry the same reading; under the verified v18 document it
     * is `true`, and anything else — absent included — means the reduction does not dispatch.
     */
    crossUnitReductionAllowed?: boolean;
    /**
     * Whether the active Provider Processing policy names the assurance sampling suboperation's
     * transmissions (ADR 0066). Read exactly as `crossUnitReductionAllowed` is: under the verified v18
     * document it is `true`; anything else — absent included — means the suboperation does not
     * dispatch at all.
     */
    assuranceSamplingAllowed?: boolean;
    /**
     * Whether the active Provider Processing policy names the Run Report's reflection turn (ADR
     * 0066 §Run Report). Read exactly as the two keys above are: under the verified v18 document it is
     * `true`; anything else — absent included — means the turn does not dispatch and the report
     * records `policy-bounded` with its reason.
     */
    runReportReflectionAllowed?: boolean;
    /**
     * One entry per allow rule of the verified policy, in policy order; empty under development-ci, every denial and an
     * ordinary-production launch whose configured binding is still missing.
     */
    readonly admittedRules: readonly AdmittedProviderRule[];
    /**
     * Only under `ordinary-production` (Provider Processing v19): `setup-required` while the editor's own model service is not
     * configured, so no rule is admitted; `configured` once the launch supplied a binding the policy allows, which fills every
     * admitted rule's route, endpoint, model and credential slot. Absent under every other scope.
     */
    bindingState?: 'setup-required' | 'configured';
    label:
      | '开发与持续集成：零次实时传输'
      | '开发者实时：实时传输受运行边界约束'
      | '本机生产：需先设置模型服务，当前不会传输'
      | '本机生产：实时传输受运行边界约束';
  };
  externalExport: {
    version: 'v2' | null;
    policyEligibilityIsEffectApproval: false;
    /**
     * Whether the existing local export capability can be offered. Preparation, approval and receipt authority
     * remain with the export owner; no policy fingerprint participates.
     */
    currentExportEffectAvailable: boolean;
    label: '对外导出策略独立；当前未提供导出受控动作' | '对外导出：只导出到本机所选位置，每个文件单独批准';
  };
  publicReleasePermission: {
    present: false;
    label: '公开发布许可：不存在';
  };
}

export interface ModelServiceStoredStateProjection {
  proxy: ModelServiceProxySetting;
  lastProxyProbe?: ProxyProbeResult | null;
  /** The DeepSeek 开放平台（官方） connection, as Issue #712 has always read it; `connections` holds every route's. */
  connection: ModelServiceConnectionProjection | null;
  /** Every route's connection (Issue #811), Go first; at most one is `selected`. */
  connections: readonly ModelServiceConnectionProjection[];
  launchPolicy: LaunchPolicyProjection; channels: readonly ModelServiceChannelProjection[];
}

/** One route the Main Editorial Role may be configured to, as 设置 › 模型服务 offers it (Issue #811). */
export interface ModelServiceRouteOptionProjection {
  route: ModelServiceRouteId;
  binding: ModelServiceBindingProjection;
  /** The Go route: the binding new Tasks use when the editor has chosen none and its credential is there. */
  isDefault: boolean;
  /** Whether new Tasks use this route: the editor's choice, else the default once its credential is ready. */
  inUse: boolean;
  status: ModelRoleStatus;
  statusLabel: ModelRoleStatusLabel;
  connection: ModelServiceConnectionProjection | null;
  models?: readonly ModelServiceBindingProjection[];
}

/** A configured provider no Model Role can bind yet: named, never selectable. */
export interface ModelServiceUnsupportedProviderProjection {
  providerId: string;
  providerLabel: string;
  statusLabel: '尚未支持';
}

/**
 * Why a model-calling action refuses under ordinary-production while no route is configured (Issue #811): it names both routes
 * and where to set one, and says nothing was sent.
 */
export const MODEL_SERVICE_SETUP_REQUIRED_REASON =
  '模型服务需设置：请先在设置 › 模型服务中配置模型凭据；这次没有发送任何内容。' as const;

/** What 设置 › 模型服务 says about choosing the route (Issue #811). */
export const MODEL_SERVICE_ROUTE_EFFECT_LABEL = '切换路线只影响之后开始的任务；已在进行的任务保持原有绑定。没有自动备用路线。' as const;

export interface ModelRoleCardProjection {
  roleId: ModelRoleId;
  roleLabel: '快速交互角色' | '主编辑角色' | '疑难升级角色' | '前沿模型角色';
  purposeLabel: string;
  status: ModelRoleStatus;
  statusLabel: ModelRoleStatusLabel;
  statusDetail: string;
  binding: ModelServiceBindingProjection | null;
  connection: ModelServiceConnectionProjection | null;
}

export type ModelServiceProxySetting = { mode: 'direct' } | { mode: 'proxy'; protocol: 'http' | 'https'; hostPort: string };
export interface ProxyProbeResult {
  status: 'available' | 'https-rejected' | 'connection-refused' | 'authentication-required' | 'unreachable';
  checkedAt: string;
}
export type SaveModelServiceProxyInput = ModelServiceProxySetting & { probeRoute?: ModelServiceRouteId };

export interface ModelServiceSettingsProjection {
  /** Present on a save-and-discover or explicit refresh response; discovery failures never invalidate stored models. */
  modelDiscovery?: ModelDiscoveryResult;
  searchBackends: SearchBackendSettingsProjection;
  proxy: ModelServiceProxySetting;
  lastProxyProbe?: ProxyProbeResult | null;
  roles: readonly ModelRoleCardProjection[];
  /** The two routes and the providers not yet supported (Issue #811). */
  routeChoice: {
    routes: readonly ModelServiceRouteOptionProjection[];
    unsupportedProviders: readonly ModelServiceUnsupportedProviderProjection[];
    effectLabel: typeof MODEL_SERVICE_ROUTE_EFFECT_LABEL;
  };
  protectedSecretStore: {
    backend: 'windows-credential-manager' | 'macos-keychain';
    label: 'Windows 凭据管理器' | 'macOS 钥匙串';
    availability: 'available' | 'unavailable';
  };
  launchPolicy: LaunchPolicyProjection; channels: ModelServiceStoredStateProjection['channels'];
  authorityStatement: '凭据就绪不授予模型处理、对外导出、运行、受控动作或公开发布权限。';
}

/** A Run's exact web backend, part of its Plan Envelope digest. */
export interface FrozenWebToolsBackend {
  backendId: string;
  host: string;
  configurationDigest: string;
  selectedAt: string;
  /** The Main channel's own provider search, when a measured native adapter is selected. */
  selectionSource?: 'model-channel' | 'configured-backend';
  sourceLabel?: string;
}

/** What the renderer sends to save or choose a route (Issue #811); the value of `secret` never comes back. */
export type ModelServiceCredentialInput =
  | { connectionName: string; secret: string }
  | { route: ModelServiceRouteId; connectionName: string; secret: string }
  | { route: ModelServiceRouteId; select: true };

export const J03_TASK_GOAL = '分析当前书稿的结构与叙事连贯性，列出供编辑复核的重点。' as const;

export interface TaskAuthorizationProjection {
  bookId: string;
  state: 'available' | 'prepared' | 'authorized';
  taskIntent: null | {
    taskIntentId: string;
    goal: typeof J03_TASK_GOAL;
    expectedOutcome: '供编辑复核的结构与叙事连贯性重点清单';
    createdAt: string;
  };
  checkpoint: null | {
    manuscriptId: string;
    branchId: string;
    revisionId: string;
    revisionLabel: string;
    revisionDigest: string;
    journalSequence: number;
    purpose: 'Task Input / 任务输入';
    createdForDirtyJournal: boolean;
  };
  manuscriptPin: null | {
    bookId: string;
    manuscriptId: string;
    revisionId: string;
    revisionDigest: string;
    sourceVersionId: string;
    /** One of the five Public SampleBooks' source digests (Issue #990); this development-ci authorization surface still pins exact sample1. */
    sourceDigest: PublicSampleBookSourceDigest;
  };
  runSourceScope: null | {
    bookId: string;
    manuscriptId: string;
    taskInputRevision: { revisionId: string; revisionDigest: string };
    readableScopeKinds: ReadonlyArray<'current-book-primary-manuscript-revision' | 'series'>;
    seriesScopes?: ReadonlyArray<FrozenSeriesScope>;
    sourceVersionEvidence: { sourceVersionId: string; readable: false };
  };
  artifactPin: null | {
    identity: '@ai7/editorial-workspace-profile';
    version: '1.0.0';
    nativeCarrierSha256: 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d';
    sidecarIdentity: 'ai7.editorial-workspace-profile.authority';
    sidecarRevision: 2;
    sidecarSha256: '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff';
  };
  providerResolutionPlan: null | {
    selectedPolicyIdentity?: SelectedPolicyIdentity;
    localFixtureProfile?: LocalFixtureProfile;
    role: 'Main Editorial Role';
    capabilities: readonly [];
    providerId: 'deepseek-open-platform';
    modelId: 'deepseek-v4-pro';
    adapterRevision: 1;
    configurationRevision: 1;
    approvedFallbackChain: readonly [];
    credentialReference: string;
    credentialReadiness: 'missing';
    outboundDataCategory: 'public-or-synthetic';
    runBudgetCeiling: RunBudgetCeilingState;
    providerProcessing: ProviderProcessingPin;
  };
  executionPlan: null | {
    steps: readonly ['分析结构', '分析叙事连贯性', '形成编辑复核重点'];
    effects: readonly [];
    /** Derived from the Provider Processing pin the plan froze; `Provider Processing v1 denies dispatch` under `development-ci`. */
    stopCondition: string;
  };
  planEnvelope: null | {
    digest: string;
    providerStatus: 'denied';
    dispatchAllowed: false;
    /** Derived from the same pin; `计划已冻结；Provider Processing v1 拒绝派发` under `development-ci`. */
    summary: string;
  };
  authorization: null | {
    authorizationId: string;
    planEnvelopeDigest: string;
    origin: 'standard-direct';
    authorizedAt: string;
  };
  runRecord: null | {
    runRecordId: string;
    state: 'recorded-not-dispatched';
    dispatched: false;
    terminalLabel: '已记录授权 · 未派发';
    recordedAt: string;
  };
  actions: { canPrepare: boolean; canAuthorize: boolean };
  namedNonEffects: readonly [
    '不派发调度器任务',
    '不创建 DSH Session',
    '不读取或解析凭据',
    '不构造 Provider payload',
    '不访问网络或调用 Provider',
    '不创建或执行 Effect'
  ];
}

export interface ForegroundExecutionBoundaryProjection {
  bookId: string;
  taskIntentId: string;
  planEnvelopeDigest: string;
  authorizationId: string;
  runRecordId: string;
  state: 'blocked-before-dispatch';
  terminalLabel: '前台执行已拒绝 · 未启动';
  runAuthority: 'record-only-no-dispatch';
  launchPolicy: LaunchPolicyProjection;
  requiresNewPlanEnvelope: true;
  requiresRenewedRunAuthorization: true;
  /** Exactly three reasons; only the middle one is derived from the launch's own Provider Processing pin. */
  reasons: readonly [string, string, string];
}

// ---- ②A 分析反馈 (Issue #94, plan slice S38; V2-UX-ANALYSIS-023, ANALYSIS-024, FDBK-005 to FDBK-008) -------------------

export const MAX_ANALYSIS_FEEDBACK_TEXT_GRAPHEMES = 300;

/** One explicit judgment the editor recorded on one item: never inferred, and a later one supersedes it on record. */
export interface AnalysisFeedbackSignalProjection {
  readonly signalId: string;
  readonly judgment: AnalysisFeedbackJudgment;
  /** The optional reason: one of the alternatives offered, or `other` with the editor's own words; `null` when none was given. */
  readonly reason: null | { readonly choice: string; readonly text: string | null };
  /** The editor's own correction, when they wrote one. */
  readonly correction: string | null;
  readonly recordedAt: string;
  /** The signal it succeeded, when the editor changed an earlier judgment. */
  readonly supersedes: string | null;
}

/** One item of a Result Set Revision as feedback names it: its place, the digest of exactly what it says, and its latest judgment. */
export interface AnalysisFeedbackItemProjection {
  /** `synopsis`, or `<dimension>/<index>` within the revision's synthesis. */
  readonly itemKey: string;
  readonly dimension: AnalysisFeedbackDimension;
  readonly index: number;
  readonly digest: string;
  readonly latest: AnalysisFeedbackSignalProjection | null;
  /** How many signals the item holds, the superseded included. */
  readonly signals: number;
}

/**
 * The Analysis Quality Metric of one Book (ANALYSIS-024): only explicit judgments count — an item nobody judged is neither
 * approved nor faulted — each item's latest judgment once, over every Result Set Revision of the Book, by dimension. It is
 * a measure, never a proof, a policy, an eligibility or leave to change anything; no other Book's judgments enter it.
 */
export interface AnalysisQualityMetricProjection {
  readonly definition: 'ai7.analysis-quality-metric/1';
  readonly scope: 'book';
  readonly judged: number;
  readonly accurate: number;
  readonly inaccurate: number;
  readonly incomplete: number;
  readonly byDimension: ReadonlyArray<{
    readonly dimension: AnalysisFeedbackDimension;
    readonly judged: number;
    readonly accurate: number;
    readonly inaccurate: number;
    readonly incomplete: number;
  }>;
  /** The digest of the ordered signals the metric counted: its exact input lineage. */
  readonly lineageDigest: string;
}

/** ②A's feedback on one Result Set Revision, and the Book's metric. */
export interface AnalysisFeedbackProjection {
  readonly bookId: string;
  readonly revisionId: string;
  readonly revisionOrdinal: number;
  readonly items: ReadonlyArray<AnalysisFeedbackItemProjection>;
  readonly metric: AnalysisQualityMetricProjection;
}

export interface RecordAnalysisFeedbackInput {
  readonly revisionId: string;
  readonly itemKey: string;
  /** The item's digest as the editor saw it: refused when the revision no longer says exactly that there. */
  readonly itemDigest: string;
  /** The latest signal the editor saw on the item, or `null` for its first judgment. */
  readonly expectedLatestSignalId: string | null;
  readonly judgment: AnalysisFeedbackJudgment;
  readonly reason: null | { readonly choice: string; readonly text: string | null };
  readonly correction: string | null;
}

// ---- 质量与学习 › 学习准入 (Issue #61, plan slice S26b; V2-UX-LEARN-001 to LEARN-012, ATTN-009, FDBK-013) ----------------

/**
 * Where a Learning Material came from: a 修改建议 decided with the editor's reason or their own wording, a judgment of an
 * analysis result that says why, or a 审阅 finding the editor ignored and said why.
 */
export type LearningMaterialKind = 'proposal-decision' | 'analysis-feedback' | 'review-disposition' | 'word-tracked-edit';

export const LEARNING_MATERIAL_KINDS: readonly LearningMaterialKind[] = ['proposal-decision', 'analysis-feedback', 'review-disposition', 'word-tracked-edit'];

/**
 * What the Learning Eligibility ledger decides about: the three kinds 学习准入 shows a card for, and `readers-report-exemplar`
 * (Issue #429) — 范例's admission of one 审稿意见 at one exact version, decided from 范例 and listed by no card.
 */
export type LearningLedgerMaterialKind = LearningMaterialKind | 'readers-report-exemplar' | 'manual-edit-journal';

const LEARNING_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/**
 * A material's place, by its kind (Issue #61 review): a 修改建议's decision, an analysis item of a Result Set Revision, or a
 * 审阅 finding of a Review Run — each exactly as the store names it, a finding's `rvf_` identity included.
 */
export const LEARNING_MATERIAL_KEY_PATTERN = new RegExp(
  `^(?:proposal-decision:${LEARNING_UUID}|analysis-feedback:${LEARNING_UUID}/(?:synopsis|(?:entities|events|relationships|settings)/\\d{1,6})` +
  `|review-disposition:${LEARNING_UUID}/rvf_[0-9a-f]{24}|word-sample:wts_[0-9a-f]{64})$`,
  'u',
);

/** The materials one answer of 学习准入 carries, Book by Book; `更多学习材料…` reads the next (Issue #61 review). */
export const MAX_LEARNING_MATERIALS_PAGE = 40;

/**
 * Where the next page of 学习准入 starts: after this material of this Book — Books by title, a Book's materials by kind, then
 * by when each came to be (a later reason never moves one), then by place.
 */
export interface LearningMaterialCursor {
  readonly bookTitle: string;
  readonly bookId: string;
  readonly orderedAt: string;
  readonly materialKey: string;
}

/**
 * Where a material stands (LEARN-006, LEARN-007): waiting for a decision; changed since the decision it had, which no longer
 * binds it; left for later; or decided.
 */
export type LearningMaterialState = 'pending' | 'changed' | 'deferred' | 'decided';

/** The exact source record reached from a Learning Material review (LEARN-003). */
export type LearningMaterialTarget =
  | {
    readonly kind: 'mark';
    readonly bookId: string;
    readonly manuscriptId: string;
    readonly branchId: string;
    readonly blockId: string;
    readonly markId: string;
    /** Whether the paragraph it was made on is gone from the manuscript, so there is nowhere to open it (Issue #61 review). */
    readonly detached: boolean;
  }
  | {
    readonly kind: 'analysis';
    readonly bookId: string;
    readonly revisionId: string;
    /** The item judged, and the tab of ②A it sits on (Issue #61 review). */
    readonly itemKey: string;
    readonly dimension: AnalysisFeedbackDimension;
  }
  | { readonly kind: 'review'; readonly bookId: string; readonly reviewRunId: string; readonly findingId: string }
  | { readonly kind: 'word-tracked-edit'; readonly bookId: string; readonly sampleId: string; readonly sampleDigest: string };

/** One Learning Material as its Review Card shows it (LEARN-003). */
export interface LearningMaterialProjection {
  readonly target: LearningMaterialTarget;
  /** Word's actual current local controls/standing, separate from its historical capture and any human decision. */
  readonly wordCurrentEligibility?: LearningEligibilityChoice;
  /** The exact originating Task, when the source record has one (LEARN-003); editor-authored material has none. */
  readonly sourceTask: null | { readonly taskIntentId: string; readonly label: string };
  /** The material's place: its kind and the record it comes from. */
  readonly materialKey: string;
  readonly kind: LearningLedgerMaterialKind;
  /** The exact version a decision binds: the digest of what the material says now. */
  readonly digest: string;
  /** Where it came from, in the editor's words: `修改建议 · 拒绝`, `分析反馈 · 人物与名称`, `审阅 · 错别字与规范用语`. */
  readonly originLabel: string;
  /** When its record was made or last changed. */
  readonly recordedAt: string;
  /** A bounded excerpt of what it is, a few lines kept on this device. */
  readonly excerpt: ReadonlyArray<string>;
  /** Why it is a candidate, in plain words. */
  readonly rationale: string;
  readonly state: LearningMaterialState;
  /** The decision that stands — or, when the material changed, the one it had — or `null` while none was made. */
  readonly decision: null | { readonly choice: LearningEligibilityChoice; readonly note: string | null; readonly decidedAt: string };
  /** How many decisions the material holds: the count the next one names. */
  readonly decisions: number;
}

/** One Book's Learning Materials, with the Book's 作者 and 责编 every decision is attributed to (FDBK-013). */
export interface LearningMaterialsBookProjection {
  readonly bookId: string;
  readonly title: string;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  /** How many materials the Book has in all, whichever page shows them. */
  readonly materialCount: number;
  /** Those this page shows. */
  readonly materials: ReadonlyArray<LearningMaterialProjection>;
}

/**
 * 质量与学习 › 学习准入: one page of the Books with Learning Material, one Book when a Book is named — at most
 * `MAX_LEARNING_MATERIALS_PAGE` materials, a Book whose materials run on repeated at the top of the next page.
 */
export interface LearningMaterialsProjection {
  /** The governing basis every decision here records, in plain words (LEARN-003, LEARN-008). */
  readonly basis: string;
  readonly books: ReadonlyArray<LearningMaterialsBookProjection>;
  /** Where the next page starts; `null` when this is the last. */
  readonly nextCursor: LearningMaterialCursor | null;
}

/**
 * 记录学习准入决定 (LEARN-007): one choice for the exact version the editor read — `仅纳入当前图书`, `纳入出版社经验`,
 * `明确排除` or `稍后决定` — with an optional note, naming how many decisions the material held.
 */
export interface DecideLearningMaterialInput {
  readonly bookId: string;
  readonly materialKey: string;
  readonly materialDigest: string;
  readonly expectedDecisions: number;
  readonly choice: LearningEligibilityChoice;
  readonly note: string | null;
}

// ---- 质量与学习 › 反馈历史 (Issue #61, plan slice S26c; V2-UX-FDBK-009, FDBK-010, FDBK-013) ---------------------------------

export const MAX_FEEDBACK_HISTORY_ENTRIES = 300;

/** A reason stands in the history whole up to this many graphemes, and beyond them as its opening; 打开… shows all of it. */
export const MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES = 200;

/** Where one entry opens: the exact record it came from (FDBK-009), in its own Book. */
export type FeedbackHistoryTarget =
  | {
    readonly kind: 'mark';
    readonly bookId: string;
    readonly manuscriptId: string;
    readonly branchId: string;
    readonly blockId: string;
    readonly markId: string;
    /** Whether the paragraph it was made on is gone from the manuscript, so there is nowhere to open it (Issue #61 review). */
    readonly detached: boolean;
  }
  | {
    readonly kind: 'analysis';
    readonly bookId: string;
    readonly revisionId: string;
    /** The item judged, and the tab of ②A it sits on (Issue #61 review). */
    readonly itemKey: string;
    readonly dimension: AnalysisFeedbackDimension;
  }
  | { readonly kind: 'review'; readonly bookId: string; readonly reviewRunId: string; readonly findingId: string };

/** Service-side filters and an exclusive newest-first page cursor. Omitted fields mean all. */
export const FEEDBACK_HISTORY_SIGNALS = ['接受', '修改后接受', '拒绝', '准确', '不准确', '不完整', '忽略'] as const;

export interface FeedbackHistoryInput {
  readonly bookId?: string | null;
  readonly origin?: Exclude<LearningMaterialKind, 'word-tracked-edit'> | null;
  readonly author?: string | null;
  readonly editor?: string | null;
  /** Exact projected disposition or judgment; omitted or null means all. */
  readonly signal?: string | null;
  /** Inclusive lower and exclusive upper UTC instants; calendar days are resolved in the editor's local time. */
  readonly recordedFrom?: string | null;
  readonly recordedBefore?: string | null;
  /** Omitted means every dimension; null selects only feedback without an Editorial Dimension. */
  readonly dimension?: string | null;
  readonly after?: { readonly recordedAt: string; readonly entryId: string } | null;
}

/** One piece of the editor's feedback as the history lists it. */
export interface FeedbackHistoryEntryProjection {
  readonly entryId: string;
  readonly origin: Exclude<LearningMaterialKind, 'word-tracked-edit'>;
  readonly bookId: string;
  /**
   * The Editorial Dimension it is about, in the editor's words: an analysis dimension, a 审阅 category — a 修改建议 a 审阅
   * category made names its category — or `null` for a 修改建议 that names none.
   */
  readonly dimension: string | null;
  /** What the editor decided or judged: 拒绝, 修改后接受, 接受, 准确, 不准确, 不完整 or 忽略. */
  readonly signal: string;
  /**
   * The optional reason as it stands — the alternative chosen, the editor's own words, a correction; `null` when none — whole
   * up to `MAX_FEEDBACK_HISTORY_REASON_GRAPHEMES`, beyond that its opening and `…`.
   */
  readonly reason: string | null;
  /** Whether a reason was given, `不说明` was said, or neither: none of them a judgment in itself (FDBK-007). */
  readonly reasonState: 'given' | 'dismissed' | 'none';
  readonly recordedAt: string;
  /**
   * The version of the Book's people it is attributed to (FDBK-013, Issue #61 review): the one in force when it was recorded,
   * or the first saved after it when none was yet; `0` while the Book has never had its people saved.
   */
  readonly peopleVersion: number;
  readonly target: FeedbackHistoryTarget;
}

/** One version of a Book's 作者 and 责编, as the entries attributed to it name them. */
export interface FeedbackHistoryPeopleVersion {
  readonly version: number;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
}

/** A Book of the history: its title, its people as they stand now, and each version of them an entry here is attributed to. */
export interface FeedbackHistoryBookProjection {
  readonly bookId: string;
  readonly title: string;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  readonly peopleVersions: ReadonlyArray<FeedbackHistoryPeopleVersion>;
}

/**
 * 质量与学习 › 反馈历史: every Book's feedback, newest first, with the people each entry is attributed to, to filter by
 * (FDBK-013). A read that asks nothing: no entry is pending, counted or reminded (FDBK-010).
 */
export interface FeedbackHistoryProjection {
  readonly books: ReadonlyArray<FeedbackHistoryBookProjection>;
  readonly entries: ReadonlyArray<FeedbackHistoryEntryProjection>;
  /** Whether older entries were left out of this read, by count or by weight. */
  readonly truncated: boolean;
}

// ---- 质量与学习 › 学习回溯 (Issue #62, plan slice S27a; V2-UX-LAUD-001 to LAUD-012) -----------------------------------------

/**
 * Where a material stands for learning now, as 学习回溯 lists and filters it (LAUD-001, LAUD-002): waiting for a decision,
 * changed since the one it had, left for later, included for its Book or for the house, or excluded.
 */
export type LearningAuditStanding = 'pending' | 'changed' | 'deferred' | 'book' | 'house' | 'excluded';

export const LEARNING_AUDIT_STANDINGS: readonly LearningAuditStanding[] = ['pending', 'changed', 'deferred', 'book', 'house', 'excluded'];

/** The materials one answer of 学习回溯 carries, Book by Book; `更多学习材料…` reads the next. */
export const MAX_LEARNING_AUDIT_PAGE = 40;

/**
 * The most Books 学习回溯's 图书 filter offers, by title (Issue #677); fewer when their titles fill the filter's share of the
 * frame. A house with more says so in the filter.
 */
export const MAX_LEARNING_AUDIT_BOOK_CHOICES = 1_000;

/** The most Series its 书系 filter offers, by name, on the same terms. */
export const MAX_LEARNING_AUDIT_SERIES_CHOICES = 200;

/** The longest search a 学习回溯 filter carries, in UTF-16 units. */
export const MAX_LEARNING_AUDIT_QUERY = 100;

/** The newest decisions a Learning Lineage Explorer shows of one chain; earlier ones are counted. */
export const MAX_LEARNING_LINEAGE_DECISIONS = 50;

/** The most materials one 停止今后使用 names. */
export const MAX_LEARNING_REMEDIATION_ITEMS = 40;

/**
 * 学习回溯's filters (LAUD-002), each applied before the page is cut; omitted or `null` means all. A Series names the Books
 * it holds now. Candidate, memory, downstream-use and historical-impact filters wait for the records they would filter.
 */
export interface LearningAuditInput {
  readonly bookId?: string | null;
  readonly seriesId?: string | null;
  readonly kind?: LearningMaterialKind | null;
  readonly standing?: LearningAuditStanding | null;
  /** Inclusive lower and exclusive upper UTC instants of when each material was recorded or last changed. */
  readonly recordedFrom?: string | null;
  readonly recordedBefore?: string | null;
  /** Words found in a material's origin or bounded excerpt, case folded. */
  readonly query?: string | null;
  readonly after?: LearningMaterialCursor | null;
}

/** One material as 学习回溯 lists it: what it is, where it stands, and what used it (LAUD-001). */
export interface LearningAuditMaterialProjection {
  readonly wordCurrentEligibility?: LearningEligibilityChoice;
  readonly materialKey: string;
  readonly kind: LearningLedgerMaterialKind;
  readonly digest: string;
  readonly originLabel: string;
  readonly recordedAt: string;
  readonly excerpt: ReadonlyArray<string>;
  readonly standing: LearningAuditStanding;
  readonly automaticAdmission?: { readonly choice: 'house'; readonly sourceKeys: ReadonlyArray<string> } | null;
  /** How many decisions it holds: the count the next one names. */
  readonly decisions: number;
  /** When the decision that stands — or, when it changed, the one it had — was made. */
  readonly decidedAt: string | null;
  /**
   * How many Tasks used it (Issue #912): the Review Runs whose category sent a 本社审阅偏好 version with a line it supports. No
   * Memory Candidate or memory is made of it yet.
   */
  readonly downstreamTasks: number;
}

export interface LearningAuditBookProjection {
  readonly bookId: string;
  readonly title: string;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  /** How many of its materials match the filters, whichever page shows them. */
  readonly materialCount: number;
  readonly materials: ReadonlyArray<LearningAuditMaterialProjection>;
}

/**
 * 学习回溯's filter choices (LAUD-002; Issue #677): the house's Books and Series by title, answered with every page so opening
 * the audit reads no Book list of its own. Each list holds at most its count bound and its share of the frame, and says
 * whether the house holds more.
 */
export interface LearningAuditChoicesProjection {
  /** The first `booksListed` Books by title, then the Book the filter names when it lies beyond them. */
  readonly books: ReadonlyArray<{ readonly bookId: string; readonly title: string }>;
  readonly booksListed: number;
  readonly booksTruncated: boolean;
  readonly series: ReadonlyArray<{ readonly seriesId: string; readonly title: string }>;
  readonly seriesTruncated: boolean;
  /** The Series could not be read (a damaged record): the audit still answers, with no Series to choose. */
  readonly seriesUnavailable: boolean;
}

/** 质量与学习 › 学习回溯: one page of the Books whose material matches, Book by Book (LAUD-001), and the filters' choices. A read. */
export interface LearningAuditProjection {
  readonly books: ReadonlyArray<LearningAuditBookProjection>;
  readonly nextCursor: LearningMaterialCursor | null;
  readonly choices: LearningAuditChoicesProjection;
}

/** One decision of a material's chain (LAUD-003, LAUD-005, LAUD-009): none rewritten, a later one superseding. */
export interface LearningLineageDecisionProjection {
  readonly decisionId: string;
  readonly ordinal: number;
  readonly choice: LearningEligibilityChoice;
  readonly note: string | null;
  readonly recordedAt: string;
  /** Whether a later decision superseded it. */
  readonly superseded: boolean;
  /** Whether it was made on the material as it reads now; one made on an earlier version binds it no longer. */
  readonly currentVersion: boolean;
  /**
   * Whether it is a 停止今后使用 recorded in 学习回溯 against a preview (`learning-audit`) or any other decision
   * (`learning-eligibility`) — a 重新纳入 made in 学习回溯 included, since it is an ordinary decision and records no origin.
   */
  readonly via: 'learning-eligibility' | 'learning-audit';
  /** The Book's 作者 and 责编 it was attributed to; `null` for none recorded. */
  readonly attribution: null | { readonly peopleVersion: number; readonly authors: ReadonlyArray<string>; readonly editors: ReadonlyArray<string> };
  /** 审计详情 (LAUD-005): the exact version it bound, the decision it superseded, its record and governing basis. */
  readonly audit: {
    readonly materialDigest: string;
    readonly supersedes: string | null;
    readonly recordDigest: string;
    readonly basis: string;
    readonly remediationPreview: string | null;
  };
}

/** The most Tasks one Learning Lineage Explorer lists; earlier ones are counted. */
export const MAX_LEARNING_LINEAGE_TASKS = 50;

/** A 学习信号 (Issue #912): one 本社审阅偏好 version with a line the material supports. */
export interface LearningLineageSignalProjection {
  readonly versionId: string;
  readonly ordinal: number;
  readonly recordedAt: string;
  /** Whether it is the version new Runs read now. */
  readonly current: boolean;
  /** How many of its lines the material supports. */
  readonly lines: number;
}

/** A Task that used the material (Issue #912): a Review Run category that sent a version with a line it supports. */
export interface LearningLineageTaskProjection {
  readonly bookId: string;
  readonly reviewRunId: string;
  /** 《书名》第 N 次审阅 · 类别 */
  readonly label: string;
  readonly versionOrdinal: number;
  readonly use: 'running' | 'completed' | 'stopped';
  /** It completed, and the material was 停止今后使用 afterwards: its result carries the Historically Affected Result Marker. */
  readonly marked: boolean;
}

/**
 * One material's Learning Lineage Explorer (LAUD-003 to LAUD-005): 学习材料 → 准入决定 → 学习信号 → 记忆候选 → 已启用记忆 →
 * 使用过的任务. 学习信号 are the 本社审阅偏好 versions it supports and 使用过的任务 the Review Runs that sent them (Issue #912); no
 * Memory Candidate or memory is made yet, so those two count none.
 */
export interface LearningLineageProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly material: LearningMaterialProjection;
  readonly standing: LearningAuditStanding;
  readonly automaticAdmission?: { readonly choice: 'house'; readonly sourceKeys: ReadonlyArray<string> } | null;
  /** The newest `MAX_LEARNING_LINEAGE_DECISIONS` decisions, oldest first, the last the one that stands. */
  readonly decisions: ReadonlyArray<LearningLineageDecisionProjection>;
  /** How many earlier decisions the chain holds beyond those. */
  readonly earlierDecisions: number;
  readonly downstream: { readonly signals: number; readonly memoryCandidates: number; readonly activeMemories: number; readonly tasks: number };
  /** Its 学习信号, oldest first. */
  readonly signals: ReadonlyArray<LearningLineageSignalProjection>;
  /** The newest `MAX_LEARNING_LINEAGE_TASKS` Tasks that used it, oldest first. */
  readonly tasks: ReadonlyArray<LearningLineageTaskProjection>;
  readonly earlierTasks: number;
}

/** One material a 停止今后使用 names, at the version and decision count the editor read. */
export interface LearningRemediationItemInput {
  readonly materialKey: string;
  readonly materialDigest: string;
  readonly expectedDecisions: number;
}

/** 停止今后使用 (LAUD-006, LAUD-010): one Book's selected materials, one or many. */
export interface PreviewLearningRemediationInput {
  readonly bookId: string;
  readonly items: ReadonlyArray<LearningRemediationItemInput>;
}

/** Why a material named is left out of the batch, named rather than coerced (LAUD-011). */
export type LearningRemediationLeftOut = 'not-found' | 'changed' | 'not-included' | 'different-scope' | 'different-kind' | 'duplicate';

/**
 * 学习补救影响预览 (LAUD-006): what stopping future use of the included materials changes, in the four groups — 未来使用,
 * 正在运行, 候选或已启用记忆 and 已完成历史 — with what was left out and why. A read; `previewDigest` binds the record.
 */
export interface LearningRemediationPreviewProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  /** The one scope and kind every included material shares; `null` when none is included. */
  readonly scope: 'book' | 'house' | null;
  readonly kind: LearningLedgerMaterialKind | null;
  readonly included: ReadonlyArray<{ readonly materialKey: string; readonly originLabel: string }>;
  readonly leftOut: ReadonlyArray<{ readonly materialKey: string; readonly originLabel: string | null; readonly reason: LearningRemediationLeftOut }>;
  readonly groups: {
    /** The included materials stop being eligible for any later learning. */
    readonly future: number;
    /**
     * The current 本社审阅偏好 version's ordinal and how many of its lines the materials support (Issue #912): recording builds a
     * new version without them. `null` and 0 when there is no version.
     */
    readonly currentVersion: number | null;
    readonly linesAffected: number;
    /** Approved Review Runs whose pinned version reads them and that have not finished: each stops before its next read. */
    readonly running: number;
    /** Prepared, not approved Review Runs whose pinned version reads them: their approval is refused. */
    readonly prepared: number;
    /** Explicitly created active memory referencing these materials. */
    readonly memory: number;
    /** Completed Review Runs whose result read them: each keeps its result and gains the marker. */
    readonly completed: number;
    /** The first few of each, by name. */
    readonly runningNamed: ReadonlyArray<string>;
    readonly completedNamed: ReadonlyArray<string>;
    readonly decisionsKept: number;
  };
  readonly previewDigest: string;
}

export interface RecordLearningRemediationInput extends PreviewLearningRemediationInput {
  readonly previewDigest: string;
}

/** Each material's own outcome (LAUD-011): those excluded now, and those left out with why. */
export interface LearningRemediationOutcomeProjection {
  readonly bookId: string;
  readonly recorded: ReadonlyArray<{ readonly materialKey: string; readonly originLabel: string }>;
  readonly leftOut: LearningRemediationPreviewProjection['leftOut'];
}

// ---- 设置 › 评估校准与预测 (Issue #430, plan slice S82; V2-UX-EVAL-010, EVAL-011, EVAL-014) --------------------------------------

/** One published Book's 定价与首印 as the editor entered them for one 发稿版本. */
export interface PublicationActualsProjection {
  readonly priceFen: number;
  readonly firstPrint: number;
  /** The 发稿版本 they were entered for: 第 N 次. */
  readonly publicationOrdinal: number;
  readonly recordedAt: string;
}

/** One Book with a 发稿版本, as the central entry lists it. */
export interface EvaluationCalibrationBookProjection {
  readonly bookId: string;
  readonly title: string;
  readonly publicationVersionId: string;
  readonly publicationOrdinal: number;
  readonly designatedAt: string;
  /** The newest actuals, and whether they are for the current 发稿版本; `null` while none were entered. */
  readonly actuals: (PublicationActualsProjection & { readonly current: boolean }) | null;
  /** How many entries the Book holds: the count the next one names. */
  readonly entries: number;
}

/**
 * 设置 › 评估校准与预测 (EVAL-014): calibration's progress toward its threshold and whether it applies, the prediction switch
 * and what it waits for, and every Book with a 发稿版本 with its actuals.
 */
export const MAX_EVALUATION_CALIBRATION_BOOKS = 20;

export interface EvaluationCalibrationCursor { readonly title: string; readonly bookId: string }

export interface InspectEvaluationCalibrationInput {
  readonly after: EvaluationCalibrationCursor | null;
  readonly focusBookId: string | null;
}

export interface EvaluationCalibrationProjection {
  readonly calibration: {
    /**
     * The editor's adjustments of AI7's starting scores, counted per Book (§8.6 「10 本调分记录」; Issue #429, S81b1): a Book counts
     * once when one of its 定稿 versions began from AI7's 初评 and changed at least one of its scores.
     */
    readonly adjustments: number;
    /** The Books left out of `adjustments` because a version of theirs begun from AI7's 初评 cannot be read (Issue #702 review). */
    readonly unreadableBooks: number;
    /**
     * Whether AI7 gives 初评 scores the editor can adjust at all (Issue #430 review): since S81b1 it does. Before then the page
     * said so, whatever the count.
     */
    readonly initialScoresConnected: boolean;
    readonly threshold: number;
    readonly enabled: boolean;
    /** Whether the house offset applies to AI7's starting scores now: past the gate, with calibration not turned off. */
    readonly active: boolean;
    /**
     * The house offset as computed now (EVAL-011; Issue #429, EVAL-011a), recomputed at every read and never stored: `null`
     * below the gate. Past it, the Books whose latest 定稿 version begun from AI7's 初评 gives the basis — one value per
     * Book — and each profile item's offset to the half point, `null` for an item no Book scored both ways. The offset is
     * computed while the switch is off too, so turning it back on applies what the house's evaluations say now.
     */
    readonly offset: null | {
      readonly basisBooks: number;
      /**
       * Of `adjustments`, the Books that give the basis nothing: a version of theirs begun from AI7's 初评 cannot be read, so
       * which of their 定稿 is the latest is unknown. Said on the page beside the basis, so the two counts never disagree unexplained.
       */
      readonly booksWithoutBasis: number;
      readonly items: ReadonlyArray<{ readonly itemId: string; readonly label: string; readonly fullMarks: number; readonly offset: number | null; readonly books: number }>;
    };
  };
  readonly prediction: {
    readonly booksWithActuals: number;
    readonly threshold: number;
    readonly enabled: boolean;
    readonly available: boolean;
  };
  /** How many changes of the two switches the house holds: the count the next one names. */
  readonly preferenceEntries: number;
  readonly books: ReadonlyArray<EvaluationCalibrationBookProjection>;
  readonly nextCursor: EvaluationCalibrationCursor | null;
  /** One exact Book opened from Deliverables or still being edited, independent of the bounded list page. */
  readonly focusedBook: EvaluationCalibrationBookProjection | null;
}

export interface RecordPublicationActualsInput {
  readonly bookId: string;
  /** The 发稿版本 the page listed: one designated since refuses the save, so numbers never land on a version nobody saw. */
  readonly publicationVersionId: string;
  readonly expectedEntries: number;
  readonly priceFen: number;
  readonly firstPrint: number;
}

export interface SetEvaluationPreferencesInput {
  readonly expectedEntries: number;
  readonly predictionEnabled: boolean;
  readonly calibrationEnabled: boolean;
}

// ---- 待我处理 · Global Attention (Issue #424, plan slice S78; editor-surfaces §8.1) ------------------------

/**
 * The four groups of 待我处理, in their one fixed order (V2-UX-ATTN-001): 异常与结果待确认 · 等待你的决定 ·
 * 运行中与已暂停 · 最近完成. No fifth group exists (V2-UX-ATTN-009).
 */
export type GlobalAttentionGroupKey = 'exceptions' | 'decisions' | 'active' | 'recent';

/** Why a resumable Run stopped, as shown to editors (Issue #1309). */
export type ResumableStopReason = 'proxy-unreachable' | 'model-service-unreachable' | 'outcome-unknown' | 'shutdown';

export const GLOBAL_ATTENTION_GROUP_KEYS: readonly GlobalAttentionGroupKey[] = ['exceptions', 'decisions', 'active', 'recent'];

/** Only these two count toward the entry's number (V2-UX-ATTN-006); the other two stay visible without an alert. */
export const GLOBAL_ATTENTION_COUNTED_GROUPS: readonly GlobalAttentionGroupKey[] = ['exceptions', 'decisions'];

/** How far back 最近完成 reaches, and how many completions it lists at most. */
export const GLOBAL_ATTENTION_RECENT_DAYS = 7;

export const GLOBAL_ATTENTION_RECENT_LIMIT = 20;

/** The most items any other group lists in one answer, so the whole view always fits one frame. */
export const GLOBAL_ATTENTION_GROUP_LIMIT = 50;

/**
 * The exact state or named decision of one item (V2-UX-ATTN-007), each read from its own record:
 * - an import commit whose outcome local evidence cannot prove, and an abandonment whose safe cleanup is
 *   still pending;
 * - a Recovery Attention State, pending or deferred (稍后处理);
 * - a 修改建议 in conflict with the manuscript and not yet resolved — before 暂不处理 or after it (V2-UX-ATTN-002);
 * - the Book's latest baseline analysis Task whose Run failed, was interrupted, was blocked before dispatch,
 *   or was left admitted or executing with no Run in flight (`analysis-orphaned`);
 * - the Book's latest Review Run that ended without reaching the manuscript in every category;
 * - a prepared baseline Task whose plan has a pending Plan Revision that 重新确认计划 can settle;
 * - the one Run in flight — 正在取消 while it stops at the editor's cancellation (Issue #422) — and a Review Run a
 *   stopped service left to 继续审阅;
 * - a completion of the last days: a baseline Task Outcome or a Review Run that reached the manuscript.
 */
export type GlobalAttentionStateKey =
  | 'apply-outcome-unresolved'
  | 'import-outcome-uncertain'
  | 'import-cleanup-pending'
  | 'recovery-pending'
  | 'recovery-deferred'
  | 'manuscript-conflict'
  | 'manuscript-conflict-deferred'
  | 'analysis-failed'
  | 'analysis-interrupted'
  | 'analysis-budget-reached'
  | 'analysis-account-limit'
  | 'analysis-outcome-unknown'
  // 结果待确认 a completed Run left (Issue #757; ATTN-002, NOTIF-004): its Task Outcome stands, and its unconfirmed requests wait.
  | 'analysis-outcome-unconfirmed'
  | 'analysis-blocked'
  | 'analysis-orphaned'
  | 'review-failed'
  | 'review-stopped'
  | 'analysis-plan-revision'
  // A waiting Run whose plan moved before it could start (Issue #536; OFF-008): a plan decision, never an exception.
  | 'analysis-plan-moved'
  | 'analysis-clarification'
  | 'analysis-queued'
  | 'analysis-running'
  // A Run in Connectivity Wait (Issue #502; ATTN-004), in the words of what it waits for now; one the next Reconnect
  // Preflight will admit is `analysis-waiting-admission` (below), never `analysis-queued`.
  | 'analysis-waiting-network'
  | 'analysis-waiting-connection'
  | 'analysis-waiting-slot'
  // Online with nothing in its way, the next Reconnect Preflight admits it; it is not in the scheduler yet (Issue #539).
  | 'analysis-waiting-admission'
  // 等待运行名额 on the governor (Issue #49, S14; CONC-007): a start waiting for a place, never a ceiling or a limit.
  | 'analysis-waiting-capacity'
  | 'analysis-waiting-idle'
  | 'analysis-yielded'
  | 'analysis-cancelling'
  | 'analysis-pausing'
  | 'analysis-paused'
  | 'analysis-resumable'
  | 'review-running'
  | 'review-continuable'
  | 'analysis-completed'
  | 'analysis-completed-with-gaps'
  | 'review-completed'
  // The Book's 任务 panel alone (Issue #423, S77a; TASK-044): a Task whose plan is prepared and not started, a Review Run
  // prepared and not started, and a Task the editor cancelled. 待我处理 lists none of them.
  | 'analysis-prepared'
  | 'review-prepared'
  | 'analysis-cancelled'
  // 维护事项待处理 (Issue #426, S68b; MAINT-012): a case with a named next step, or one waiting for a later designation.
  | 'maintenance-pending'
  | 'maintenance-waiting'
  // A 资料库 item waiting for the editor (Issue #427, S79c; ATTN-009, KB-007): no attribution yet, no Learning Eligibility
  // decided under the one it has, or eligibility left for later (LEARN-006).
  | 'library-attribution-pending'
  | 'learning-eligibility-pending'
  | 'learning-eligibility-deferred'
  // A Book's Learning Material waiting for the editor (Issue #61, S26b; LEARN-002, ATTN-009): one item per Book, while any
  // material waits for a decision or changed since it had one, or else while any was left for later.
  | 'learning-materials-pending'
  | 'learning-materials-deferred'
  // 索引完成 (Issue #428, S80a; ATTN-009): a 资料库 item's Material Index built on this machine, in 最近完成.
  | 'indexing-completed'
  // A dialogue Task of the Book (Issue #52, S17a; TASK-044, DIALOG-010, 012): only the 任务 panel lists it. Away from the
  // foreground dialogue an answer in flight reads `等待回答` and nothing more; settled, it is answered or incomplete.
  | 'dialogue-answering'
  | 'dialogue-answered'
  | 'dialogue-stopped'
  | 'dialogue-interrupted'
  | 'dialogue-failed'
  // An unfinished Task Intent Draft (Issue #423, slice 7a; TASK-004 to 006): in the Book's 等你处理, and in 待我处理 only as this.
  | 'draft-unfinished';

/**
 * The closed map of safe next steps (V2-UX-ATTN-007): each is an action the item's own record offers, in
 * words the product already uses there. An item whose record offers none of them is not listed at all.
 */
export type GlobalAttentionNextStep =
  | 'view-apply-receipt'
  | 'view-run'
  | 'view-review'
  | 'reconfirm-plan'
  | 'continue-review'
  | 'return-to-recovery'
  | 'retry-abandon-cleanup'
  | 'await-local-check'
  | 'resolve-conflict'
  | 'answer-clarification'
  | 'adjust-budget-redo'
  | 'resolve-model-service'
  | 'open-network-proxy'
  // 结果待确认's 查看未确认的部分 (Issue #51, S16c): which reading ranges are unconfirmed, in the drawer.
  | 'view-unconfirmed'
  | 'reprepare'
  // 改计划重做 for a Run the launch's ceiling stopped under developer-live (Issue #541): the plan cannot raise it.
  | 'redo'
  // A prepared plan the editor has not started (Issue #423, S77a): the drawer's 查看计划并开始.
  | 'view-plan'
  // A 维护事项's own next step (Issue #426, S68b), in the case's own words.
  | 'maintenance-link-proposal'
  | 'maintenance-link-publication'
  | 'maintenance-write-errata'
  | 'maintenance-conclude'
  // A 资料库 item's own two decisions (Issue #427, S79c), in its card's words.
  | 'set-library-attribution'
  | 'set-learning-eligibility'
  // A Book's Learning Material in 质量与学习 (Issue #61, S26b).
  | 'decide-learning-materials'
  // 查看索引: the item's card in 资料库, its index layers and 查看分段 (Issue #428, S80a).
  | 'view-material-index'
  // A dialogue Task's 打开对话 (Issue #52, S17a; TASK-044).
  | 'open-dialogue'
  // 继续编辑草稿: a Task Intent Draft in the Task Drawer, on its own Book (Issue #423, slice 7a; TASK-006).
  | 'continue-draft';

export const GLOBAL_ATTENTION_NEXT_STEPS: readonly GlobalAttentionNextStep[] = [
  'view-run', 'view-review', 'reconfirm-plan', 'continue-review', 'return-to-recovery', 'retry-abandon-cleanup', 'await-local-check',
  'resolve-conflict', 'answer-clarification', 'adjust-budget-redo', 'resolve-model-service', 'open-network-proxy', 'reprepare', 'redo', 'view-plan',
  'maintenance-link-proposal', 'maintenance-link-publication', 'maintenance-write-errata', 'maintenance-conclude',
  'set-library-attribution', 'set-learning-eligibility', 'decide-learning-materials', 'open-dialogue', 'view-material-index',
  'view-unconfirmed', 'view-apply-receipt', 'continue-draft',
];

/**
 * Where an item opens: its exact authoritative record, in the requesting window (V2-UX-ATTN-007, D-006).
 * Opening grants nothing; every decision is still made at the record.
 */
export type GlobalAttentionTarget =
  | { kind: 'apply-receipt'; bookId: string; manuscriptId: string; branchId: string; clientEffectId: string }
  | { kind: 'import-recovery'; draftId: string }
  | { kind: 'manuscript-recovery'; attentionId: string }
  | { kind: 'manuscript-conflict'; bookId: string; manuscriptId: string; branchId: string; markId: string }
  | { kind: 'analysis'; bookId: string; taskIntentId: string }
  | { kind: 'analysis-plan'; bookId: string; taskIntentId: string }
  | { kind: 'review'; bookId: string; reviewRunId: string }
  // A prepared Review Run's plan in the Task Drawer (Issue #423, S77a).
  | { kind: 'review-plan'; bookId: string; reviewRunId: string }
  // 交付物 with the case open on its 发稿版本 (Issue #426, S68b).
  | { kind: 'maintenance'; bookId: string; publicationVersionId: string; caseId: string }
  // 知识库 › 资料库 with the item's card (Issue #427, S79c).
  | { kind: 'library-material'; materialId: string }
  // 质量与学习 › 学习准入 with the Book's materials (Issue #61, S26b).
  | { kind: 'learning-materials'; bookId: string }
  // The dialogue in the side slot, in the foreground (Issue #52, S17a).
  | { kind: 'dialogue'; bookId: string; dialogueId: string }
  | { kind: 'global-agent-dialogue'; dialogueId: string }
  // A Task kind's plan in the Task Drawer, on the surface that owns it — ②A, 审阅, 评估 for AI7 初评, 审稿意见 and 按我的评分重写评语,
  // 交付物 for a 写作任务: a waiting ledger Task of another kind, named by its Task (Issue #760, S74c), and 结果待确认 a Run left,
  // on the Book's current Task of the kind or, for a review, its latest Review Run (Issue #757).
  | { kind: 'task-plan'; bookId: string; taskKind: TaskPlanKind; ref: string | null }
  // A Task Intent Draft in the Task Drawer beside its own Book's manuscript (Issue #423, slice 7a).
  | { kind: 'task-intent-draft'; bookId: string; draftId: string };

/** The Active Work Object of one item, in its record's own terms (V2-UX-ATTN-007). */
export type GlobalAttentionObjectProjection =
  | { kind: 'apply-receipt' }
  | { kind: 'import'; sourceDisplayName: string; relationship: 'first-manuscript' | 'source-only' | 'reimport' | null }
  | { kind: 'recovery'; branchName: string }
  | { kind: 'manuscript-conflict'; conflictKind: ProposalConflictKind }
  | { kind: 'analysis'; mode: BaselineAnalysisTaskMode }
  // A ledger Task of another kind whose Run waits to start once online, or whose plan moved meanwhile (Issue #760, S74c).
  | { kind: 'task'; taskKind: Exclude<StartWhenOnlineTaskKind, 'review-run'> }
  // A Review Run; `onSelection` for one that reads only the selection 就这段发起任务… handed over (Issue #423, S77b).
  | { kind: 'review'; ordinal: number; onSelection?: true }
  | { kind: 'maintenance'; classification: MaintenanceClassification; ordinal: number; publicationOrdinal: number }
  // A 资料库 item (Issue #427, S79c): its title and kind, and where it belongs so far — a Book, the house, or not yet decided.
  | { kind: 'library-material'; title: string; materialKind: LibraryMaterialKind; scope: 'none' | 'book' | 'house' }
  // A 资料库 item whose Material Index was built (Issue #428, S80a): its title and kind, where it belongs, and how the build went.
  | { kind: 'library-index'; title: string; materialKind: LibraryMaterialKind; scope: 'none' | 'book' | 'house'; outcome: 'complete' | 'unsupported' | 'failed' }
  // A Book's Learning Material (Issue #61, S26b): how many wait for a decision, and how many were left for later.
  | { kind: 'learning-materials'; pending: number; deferred: number }
  // A dialogue Task (Issue #52, S17a): the editor's own question, as the Harness Session Ledger holds it — `null` when it
  // holds no turn of it here.
  | { kind: 'dialogue'; question: string | null }
  // 结果待确认 that completed Runs of one Task kind left on the Book (Issue #757): how many ranges, and which steps.
  | { kind: 'unconfirmed'; taskKind: TaskPlanKind; ranges: number; steps: ReadonlyArray<UnconfirmedStageId> }
  // A Task Intent Draft (Issue #423, slice 7a): the editor's own sentence, where the draft began, and how many ranges it pins.
  | { kind: 'draft'; goal: string; origin: TaskIntentDraftOrigin; ranges: number };

/** The record facts an item's reason is told from: identities, counts and states, never manuscript text. */
export interface GlobalAttentionFactsProjection {
  dialogueCancelled?: boolean;
  resumeFailure?: string;
  clarificationOrigin?: 'model';
  stopReason?: ResumableStopReason;
  /** The Run in flight: its declared step and its Measured Run Progress (V2-UX-ATTN-004). */
  progress: null | { stage: RunReportUsageStageId; unitsSettled: number; unitsTotal: number };
  /**
   * The Review Run's categories the reason names — the ones that did not reach the manuscript, the one under
   * way, the first one left, or the ones completed — each with its state in 审阅's own words and, while the
   * Run can be continued, the line 审阅 derives for it.
   */
  categories: ReadonlyArray<{ label: string; state: ReviewRunCategoryState; stateLabel: string; detail: string | null }>;
  /** The ordinal of the Result Set Revision a completed analysis formed. */
  revisionOrdinal: number | null;
  completion?: { gaps: number; total: number; reason: string | null };
}

/** One Attention Projection Item (V2-UX-ATTN-007): a pointer to its record, never an authority of its own. */
export interface GlobalAttentionItemProjection {
  /** Stable across reads: the record's kind and identity. */
  itemId: string;
  group: GlobalAttentionGroupKey;
  state: GlobalAttentionStateKey;
  /** The record stops other work until the editor acts on it; blocked items come first in their group. */
  blocked: boolean;
  /** When the state began — or, in 最近完成, when the work completed — as an exact instant. */
  at: string;
  /** The Book. An import names the new Book by its reviewed title with no identity yet, and `null` when none was reviewed. */
  book: { bookId: string | null; title: string | null };
  object: GlobalAttentionObjectProjection;
  facts: GlobalAttentionFactsProjection;
  nextStep: GlobalAttentionNextStep;
  target: GlobalAttentionTarget;
  /** Every exact identity (LAYER-001), one step below the item's words. */
  technical: ReadonlyArray<{ key: string; label: string; value: string }>;
}

export interface GlobalAttentionGroupProjection {
  key: GlobalAttentionGroupKey;
  items: ReadonlyArray<GlobalAttentionItemProjection>;
  /** How many items the group holds; more than `items` when the group is longer than one answer lists. */
  total: number;
}

// ---- ① 任务面 (Issue #423, plan slice S77a; editor-surfaces §1 任务面, V2-UX-TASK-044, TASK-045) --------------------

/**
 * The three groups of a Book's 任务 panel, in their one fixed order (V2-UX-TASK-044): 等你处理 · 进行中 · 最近完成. They are
 * 待我处理's groups for this Book's Tasks: 等你处理 holds its 异常与结果待确认 and 等待你的决定, 进行中 its 运行中与已暂停.
 */
export type BookTaskGroupKey = 'waiting' | 'running' | 'recent';

export const BOOK_TASK_GROUP_KEYS: readonly BookTaskGroupKey[] = ['waiting', 'running', 'recent'];

/** How many finished Tasks 最近完成 lists, newest first; the panel has no age limit. */
export const BOOK_TASK_RECENT_LIMIT = 10;

/** What a finished Task's `查看结果` opens (V2-UX-TASK-045): the result it formed, read as its own screen reads it. */
export type BookTaskResultRef =
  | { kind: 'analysis-revision'; revisionId: string }
  | { kind: 'review-run'; reviewRunId: string }
  // A dialogue Task's `回答` (Issue #52, S17a; TASK-044): its latest answer, read from the Harness Session Ledger.
  | { kind: 'dialogue'; dialogueId: string };

/** One Task of the Book as the panel shows it: 待我处理's item for it, and the result `查看结果` opens. */
export interface BookTaskItemProjection {
  item: GlobalAttentionItemProjection;
  /** `null` for a Task that formed no result — a Run that stopped before it read anything. */
  result: BookTaskResultRef | null;
  /**
   * The paragraphs a selection Task was started on, by block identity — the first and the last — in the manuscript named
   * (Issue #423, S77 deferred item d): the card's `跳到所选文字` moves the caret there, or says the paragraph is gone. Absent for
   * every other Task.
   */
  selection?: { manuscriptId: string; fromBlockId: string; toBlockId: string };
}

export interface BookTaskGroupProjection {
  key: BookTaskGroupKey;
  items: ReadonlyArray<BookTaskItemProjection>;
  /** How many Tasks the group holds; more than `items` when the group is longer than one answer lists. */
  total: number;
}

/**
 * The Book's 任务 panel (editor-surfaces §1 任务面; V2-UX-TASK-044): its Tasks — baseline analysis and 审阅 — in the three
 * groups. A read: it records, claims and terminalizes nothing, as 待我处理 does not. The panel lists only this Book's Tasks;
 * work across Books stays in 待我处理.
 */
export interface BookTasksProjection {
  bookId: string;
  /** Always the three groups, in the fixed order. */
  groups: ReadonlyArray<BookTaskGroupProjection>;
  /** A Run of this Book is in flight, a Review Run is being driven, or a Run waits to start: the panel follows it. */
  running: boolean;
  /** Snapshot-pinned pages retain every card field when a group exceeds the reply budget. */
  readonly listPages?: TaskPlanProjection['listPages'];
}

// ---- 任务总览 (Issue #1328, T1 rev 2) ---------------------------------------------------------------

export type TaskOverviewGroupKey = 'running' | 'queued' | 'waiting' | 'paused' | 'recent';

export interface TaskOverviewProgressProjection {
  readonly done: number;
  readonly total: number;
  readonly currentUnitLabel: string | null;
  readonly elapsedMs: number | null;
  readonly modelWaiting: boolean;
}

export interface TaskOverviewItemProjection {
  readonly itemId: string;
  readonly bookId: string | null;
  readonly bookTitle: string | null;
  readonly taskKind: string;
  readonly label: string;
  readonly at: string;
  readonly detail: string | null;
  readonly attention: GlobalAttentionItemProjection;
  readonly selection: BookTaskItemProjection['selection'] | null;
  readonly plan: { readonly kind: TaskPlanKind; readonly ref: string | null } | null;
  readonly result: BookTaskResultRef | null;
  readonly state: 'running' | 'queued' | 'waiting' | 'paused' | 'completed' | 'cancelled' | 'stopped';
  readonly progress: TaskOverviewProgressProjection | null;
  readonly queuePosition: number | null;
  /** An estimate is deliberately absent until an owner can provide authoritative timing data. */
  readonly eta: number | null;
  readonly usage: { readonly calls: number; readonly elapsed: number } | null;
  readonly nextAction: GlobalAttentionNextStep;
  readonly runRecordId: string | null;
  readonly target: GlobalAttentionTarget;
}

export interface TaskOverviewGroupProjection {
  readonly key: TaskOverviewGroupKey;
  readonly items: ReadonlyArray<TaskOverviewItemProjection>;
  readonly total: number;
}

export interface TaskOverviewProjection {
  readonly quickStarts?: ReadonlyArray<{ readonly bookId: string; readonly procedureId: string; readonly label: string }>;
  readonly groups: ReadonlyArray<TaskOverviewGroupProjection>;
  readonly capacity: number;
  readonly queueFrozen: boolean;
  readonly books: ReadonlyArray<{ readonly bookId: string; readonly title: string }>;
  readonly runningCount: number;
  readonly queuedCount: number;
  readonly actionableCount: number;
}

/** Existing Book-owned drawer commands reachable from the cross-Book task page. */
export const TASK_OVERVIEW_OPERATIONS = ['inspectTaskPlan', 'getTaskPlanPage', 'controlTaskRun', 'redoTaskPlan',
  'cancelWaitingTask', 'cancelWaitingBaselineAnalysis', 'answerBaselineAnalysisClarification',
  'inspectDialogue', 'stopDialogueAnswer', 'continueDialogueAnswer', 'regenerateDialogueAnswer',
  'convertDialogueToChangeSuggestion', 'authorizeBaselineAnalysis', 'authorizeReviewRun', 'authorizeInitialEvaluation',
  'authorizeReadersReport', 'authorizeEvaluationRewrite', 'authorizeWritingTask', 'authorizeTaskAuthorization',
  'editTaskPlan', 'editBaselineAnalysisPlan', 'resolveUnconfirmedOutcomes', 'startTaskWhenOnline', 'startTaskWhenIdle',
  'startBaselineAnalysisWhenOnline', 'setDefaultExecutionRule', 'inspectBookTasks', 'inspectBaselineAnalysis',
  'pauseBaselineAnalysisRun', 'resumeBaselineAnalysisRun', 'cancelBaselineAnalysisRun',
  'getAnalysisRevisionUnits', 'getAnalysisRevisionOverview', 'inspectReviewWorkspace', 'prepareBaselineAnalysis', 'prepareCustomAnalysis',
  'inspectTaskIntentDrafts', 'saveTaskIntentDraft', 'promoteTaskIntentDraft', 'promoteAnswerToTaskIntentDraft',
  'prepareReviewRun', 'searchReferableMaterials', 'inspectBookSeries'] as const;
export type TaskOverviewOperation = (typeof TASK_OVERVIEW_OPERATIONS)[number];
export type TaskOverviewCall = { [K in TaskOverviewOperation]: { operation: K; bookId: string; input: Omit<ServiceOperationMap[K]['input'], 'bookId'> } }[TaskOverviewOperation];
export type TaskOverviewCallResult = ServiceOperationMap[TaskOverviewOperation]['output'];

export interface StartQuickTasksInput {
  readonly tasks: ReadonlyArray<{ readonly bookId: string; readonly procedureId: string;
    readonly repeat?: { readonly kind: Exclude<TaskPlanKind, 'fixed-task'>; readonly ref: string } }>;
}

export interface StartQuickTasksResult {
  readonly started: number;
  readonly queued: number;
  readonly results: ReadonlyArray<{ readonly bookId: string; readonly procedureId: string; readonly state: 'started' | 'queued' | 'prepared' }>;
}

// ---- 就这段提问… (Issue #52, plan slice S17a; UI ADR 0014; V2-UX-DIALOG-001 to 016, TASK-044, TASK-046) ---------------

/** The longest question the editor may ask, in characters. */
export const MAX_DIALOGUE_QUESTION_CHARACTERS = 500;

/** The longest 建议改为 or 理由 a 转为修改建议 takes, in characters. */
export const MAX_DIALOGUE_PROPOSAL_CHARACTERS = 4_000;

/** The longest selection a dialogue may be asked about, in graphemes. */
export const MAX_DIALOGUE_SELECTION_GRAPHEMES = 2_000;

/** The exact words of that Book's manuscript the question is about, as the editor selected them: in one block, or a span (#1176). */
export type DialogueSelectionInput = SeriesKnowledgeSpanInput & SelectionSpanField;

export interface AskAboutSelectionInput {
  readonly selection: DialogueSelectionInput;
  readonly question: string;
}

export interface InspectDialogueInput {
  readonly dialogueId: string;
  /** How many of the latest answer's fragments the reader has already shown. */
  readonly afterFragment: number;
}

/** One action on a dialogue's latest answer: the attempt the editor sees, so an action on a stale one is refused. */
export interface DialogueAttemptInput {
  readonly dialogueId: string;
  readonly attemptId: string;
  /** On continueDialogueAnswer, ask a new question with the conversation so far. */
  readonly question?: string;
}

export interface ConvertDialogueToChangeSuggestionInput extends DialogueAttemptInput {
  /** What the selected words would become, taken from the answer by the editor. */
  readonly proposedText: string;
  /** Why, in the editor's words; the dialogue is the basis either way. */
  readonly rationale: string;
}

export type DialogueAttemptKind = 'ask' | 'continue' | 'regenerate';

/** An answer in flight, settled whole, or — stopped, interrupted or failed — an Incomplete Dialogue Answer (DIALOG-012). */
export type DialogueAnswerState = 'answering' | 'completed' | 'stopped' | 'interrupted' | 'failed';

/** One complete semantic fragment of an answer (DIALOG-006): a whole sentence, list item or row, never a broken tail. */
export interface DialogueFragmentProjection {
  readonly text: string;
  readonly incomplete?: boolean;
  /** A line break follows it: the next fragment starts a new paragraph, item or row. */
  readonly breakAfter: boolean;
}

export interface DialogueAttemptProjection {
  /** A new question in this conversation, absent on legacy continue/regenerate attempts. */
  readonly question?: string;
  /** Still waiting behind another answer; no request or new business state has been recorded. */
  readonly queued?: boolean;
  readonly attemptId: string;
  readonly ordinal: number;
  readonly kind: DialogueAttemptKind;
  readonly state: DialogueAnswerState;
  /**
   * The answer's complete fragments from `fragmentsFrom` on — every one, for an attempt that is not the latest. A 继续回答
   * carries what the answer it went on from kept, then its own.
   */
  readonly fragments: ReadonlyArray<DialogueFragmentProjection>;
  readonly fragmentsFrom: number;
  readonly fragmentTotal: number;
  /**
   * Where the answer was read: `live` while it streams, `ledger` from the Harness Session Ledger, `missing` when that ledger
   * holds no record of it here, `damaged` when it holds one that does not read.
   */
  readonly source: 'live' | 'ledger' | 'missing' | 'damaged';
  /** The known cause of an interruption or a failure, as a code; `null` otherwise. */
  readonly causeCode: string | null;
  readonly startedAt: string;
  readonly settledAt: string | null;
  /** The 修改建议 made from this answer with 转为修改建议. */
  readonly convertedMarkIds: ReadonlyArray<string>;
}

/**
 * One Interactive Editorial Dialogue (DIALOG-001, 015): bound to one exact Book, manuscript branch and selected range. Its
 * question, the selected words as they were sent and every answer are read from the Harness Session Ledger each time; AI7's
 * own records hold only identities, digests, spans and states. Nothing it says is manuscript text, a factual conclusion or
 * a Proposal (DIALOG-016).
 */
export interface DialogueProjection {
  readonly origin?: 'agent-workspace';
  readonly anchors?: ReadonlyArray<LocalRetrievalCandidateProjection>;
  readonly retrievalWarning?: '未经精确取文' | null;
  readonly dialogueId: string;
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  /** `null` when the Harness Session Ledger holds no turn of this dialogue here. */
  readonly question: string | null;
  readonly selection: string | null;
  readonly range: { readonly blockId: string; readonly fromGrapheme: number; readonly toGrapheme: number; readonly span?: ReadonlyArray<SelectionSpanBlockPin> };
  readonly askedAt: string;
  readonly attempts: ReadonlyArray<DialogueAttemptProjection>;
  readonly actions: { readonly stop: boolean; readonly continue: boolean; readonly regenerate: boolean; readonly convert: boolean };
}

export interface DialogueConversionProjection {
  readonly markId: string;
  readonly completionLabel: string;
  readonly dialogue: DialogueProjection;
}

// ---- Agent 工作区 (Issue #90, wave 13 slice 13a; ADR 0045, UI ADR 0015; V2-UX-AGENT-001 to 004, APREP-001) ----------------

/**
 * What the Book-bound Agent 工作区 may do, as its capability declaration states it: no filesystem, no shell, no network of
 * its own and no Apply. Model streaming and local Book retrieval use the admitted dialogue execution owner. `safetyLabel` is the visible safety state the screen shows.
 */
export interface AgentWorkspaceCapabilityProjection {
  readonly filesystem: false;
  readonly shell: false;
  readonly network: false;
  readonly apply: false;
  readonly scopes: readonly ['current-book-primary-manuscript-revision', 'current-book-source-version'];
  readonly safetyLabel: '可检索本书 · 修改由你逐条决定';
}

/** One proposed change of a change set, anchored on exact words of the selected range; a candidate, not a mark. */
export interface AgentWorkspaceCandidateProjection {
  /** 1-based position in the model's answer. */
  readonly ordinal: number;
  /** The words it would replace, where they stand in the manuscript: inside the selected range, on whole graphemes. */
  readonly anchor: { readonly blockId: string; readonly fromGrapheme: number; readonly toGrapheme: number; readonly text: string };
  readonly proposedText: string;
  readonly rationale: string;
}

/** An item of the answer that is not offered, with why in the editor's words. */
export interface AgentWorkspaceDroppedProjection {
  readonly ordinal: number;
  readonly reason: string;
}

/**
 * The one proposal round the workspace holds for a Book: the dialogue turn that asked for it and, once it settles, its
 * candidates. It lives in the service's memory only; 提交为修改建议 turns it into 修改建议 marks, 放弃 forgets it.
 */
export interface AgentWorkspaceProposalProjection {
  readonly proposalSetId: string;
  /** The dialogue Task of the turn: the one record the round writes. */
  readonly dialogueId: string;
  readonly state: 'proposing' | 'ready' | 'failed';
  readonly instruction: string;
  readonly selection: {
    readonly manuscriptId: string;
    readonly branchId: string;
    readonly blockId: string;
    readonly fromGrapheme: number;
    readonly toGrapheme: number;
    readonly text: string;
    readonly span?: ReadonlyArray<SelectionSpanBlockPin>;
  };
  readonly candidates: ReadonlyArray<AgentWorkspaceCandidateProjection>;
  readonly dropped: ReadonlyArray<AgentWorkspaceDroppedProjection>;
  /** What the round says now, in the editor's words. */
  readonly label: string;
  readonly startedAt: string;
  /** Progress only; internal change-set JSON is never sent to the renderer. */
  readonly streamedCharacters?: number;
}

export interface AgentWorkspaceProjection {
  readonly bookId: string;
  /** Whether the current Book is readable. */
  readonly available: boolean;
  /** The one-sentence prerequisite when it is not; `null` when it is. */
  readonly unavailableReason: string | null;
  readonly capabilities: AgentWorkspaceCapabilityProjection;
  readonly proposal: AgentWorkspaceProposalProjection | null;
}

export interface ProposeAgentWorkspaceChangeSetInput {
  /** The exact words of the Book's primary manuscript the change set is about (one paragraph or a contiguous span), as the editor selected them. */
  readonly selection: DialogueSelectionInput;
  /** The editor's instruction, sent as a dialogue question is. */
  readonly instruction: string;
}

export interface AgentWorkspaceProposalSetInput {
  readonly proposalSetId: string;
}

/** 提交为修改建议: the independently decidable 修改建议 marks the change set became, never applied. */
export interface AgentWorkspacePromotionProjection {
  readonly bookId: string;
  readonly markIds: ReadonlyArray<string>;
  readonly atomicGroupId: string | null;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly label: string;
  readonly workspace: AgentWorkspaceProjection;
}

// ---- Task Intent Drafts (Issue #423, wave 10 slice 7a; #52 S17b; V2-UX-TASK-001 to 009, 042, 043, DIALOG-013, 016) ----------

/**
 * Where a Task Intent Draft began: the Context-bound Task Composer on a selection (就这段发起任务…) or on the whole Book
 * (发起全书任务), or a completed dialogue answer (转为任务意图草稿).
 */
export type TaskIntentDraftOrigin = 'composer-selection' | 'composer-book' | 'composer-deliverable' | 'dialogue-answer';

/** The intended outcome a draft names (TASK-005): what kind of Task it should become once promoted. */
export type TaskIntentOutcomeClass = 'analysis' | 'review' | 'factual' | 'writing';

export const TASK_INTENT_OUTCOME_CLASSES: readonly TaskIntentOutcomeClass[] = ['analysis', 'review', 'factual', 'writing'];

/** The most Pinned Manuscript Ranges one draft carries (再选一段加入, TASK-046). */
export const MAX_TASK_INTENT_DRAFT_RANGES = 8;

/** The most characters of a completed dialogue answer a draft keeps (DIALOG-016), cut at a fragment. */
export const MAX_TASK_INTENT_DRAFT_ANSWER_CHARACTERS = 2_000;

/** A range the draft carries: one its version already pinned, by identity, or the exact words selected now. */
export type TaskIntentDraftRangeInput =
  | { readonly kind: 'kept'; readonly rangeId: string }
  | { readonly kind: 'new'; readonly span: DialogueSelectionInput };

/** What the draft is about (TASK-005, 007): the whole Book's manuscript, or only the Pinned Manuscript Ranges it carries. */
export interface TaskIntentDeliverablePin {
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly revisionId: string;
  readonly revisionDigest: string;
  readonly journalSequence: number;
  readonly version: number;
  readonly typeId: string;
  readonly label: string;
}

export type TaskIntentDraftTargetInput =
  | { readonly kind: 'deliverable'; readonly manuscriptId: string; readonly branchId: string; readonly revisionId: string }
  | { readonly kind: 'book' }
  | { readonly kind: 'ranges'; readonly ranges: ReadonlyArray<TaskIntentDraftRangeInput> };

/**
 * 准备任务 in the composer, or 保存修改 on a draft (TASK-004, 005): a new draft — its first version — or a new version of the draft
 * whose `expectedOrdinal` version the editor edited. Nothing is sent, no Run Record or authorization is made, and the
 * manuscript is not touched.
 */
export interface SaveTaskIntentDraftInput {
  readonly bookId: string;
  readonly draftId: string | null;
  readonly expectedOrdinal: number | null;
  /** Where a new draft began; a new version keeps its draft's. */
  readonly origin: 'composer-selection' | 'composer-book' | 'composer-deliverable';
  readonly goal: string;
  readonly target: TaskIntentDraftTargetInput;
  readonly outcomeClass: TaskIntentOutcomeClass | null;
  /**
   * The 工序 the editor picked from the composer's recommendation slot (slice 7c fills it; #423 rev 6): kept by identity in the
   * version, never resolved, validated or enabled here. Absent or `null` when none is picked.
   */
  readonly procedurePin?: TaskIntentDraftProcedurePin | null;
}

/** A 工序 picked for a draft, by identity (#423 rev 6): selection is never acquisition, enablement or authorization (TASK-013). */
export interface TaskIntentDraftProcedurePin {
  readonly procedureId: string;
  readonly versionId: string;
}

/** The Book's drafts, or — `draftId` set — one draft with how it would be promoted. */
export interface InspectTaskIntentDraftsInput {
  readonly bookId: string;
  readonly draftId: string | null;
}

/**
 * One Pinned Manuscript Range of a draft (TASK-002, 031, 043): the words as pinned, where, and how they stand now — exact on the
 * revision they were pinned at, `待保存修订版` (pinned on edits newer than that revision), `待核对到任务修订版` (the manuscript has
 * a newer revision; checked exactly when the Task's own revision is saved), or `任务范围需要重新选择` (the words are no longer
 * there).
 */
export interface TaskIntentDraftRangeProjection extends SelectionSpanField {
  readonly rangeId: string;
  readonly manuscriptId: string;
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly text: string;
  readonly revisionLabel: string;
  readonly journalSequence: number;
  readonly state: 'exact' | 'pending-save' | 'awaiting-resolution' | 'reselect';
  readonly stateLabel: string | null;
  /** The paragraph's position in the working manuscript, `null` once it is gone. */
  readonly position: number | null;
}

/** What a draft promoted from a dialogue answer keeps of it (DIALOG-016): generated content, with its provenance. */
export interface TaskIntentDraftAnswerProjection {
  readonly dialogueId: string;
  readonly attemptId: string;
  readonly attemptOrdinal: number;
  readonly selectionSha256: string;
  readonly text: string;
  /** The answer's lines when it has more than one — the structured rows its format yields — and none otherwise. */
  readonly rows: ReadonlyArray<string>;
  readonly truncated: boolean;
}

/** How 准备计划 would make a Task of the draft: one exact preparation of an existing kind, with the choice it takes. */
export type TaskIntentDraftChoice =
  | { readonly kind: 'baseline'; readonly mode: BaselineAnalysisTaskMode }
  | { readonly kind: 'review'; readonly categoryId: string }
  | { readonly kind: 'writing'; readonly typeId: string };

export interface TaskIntentDraftOption {
  readonly choice: TaskIntentDraftChoice;
  readonly taskKind: 'baseline-analysis' | 'review-run' | 'writing';
  readonly label: string;
  readonly available: boolean;
  readonly reason: string | null;
}

/**
 * The Task a draft becomes, chosen from its target and intended outcome alone — no model is asked: one option when exactly one
 * fits, the options to choose from when several do, or why none does, the draft staying editable.
 */
export type TaskIntentDraftResolution =
  | { readonly state: 'ready'; readonly option: TaskIntentDraftOption }
  | { readonly state: 'choose'; readonly options: ReadonlyArray<TaskIntentDraftOption> }
  | { readonly state: 'unsupported'; readonly reason: string };

export interface TaskIntentDraftProjection {
  readonly draftId: string;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly origin: TaskIntentDraftOrigin;
  readonly createdAt: string;
  readonly version: {
    readonly versionId: string;
    readonly ordinal: number;
    readonly goal: string;
    readonly target: 'book' | 'ranges' | 'deliverable';
    readonly deliverable?: TaskIntentDeliverablePin & { readonly stale: boolean };
    readonly outcomeClass: TaskIntentOutcomeClass | null;
    readonly ranges: ReadonlyArray<TaskIntentDraftRangeProjection>;
    readonly answer: TaskIntentDraftAnswerProjection | null;
    readonly procedurePin: TaskIntentDraftProcedurePin | null;
    readonly createdAt: string;
  };
  /** The Task the draft became with 准备计划 — a normal prepared Task that still needs 开始任务 — or `null`. */
  readonly promotion: null | {
    readonly taskKind: 'baseline-analysis' | 'review-run' | 'writing';
    /** Every draft promotion creates exactly one Task Intent; model-free baseline leads are excluded. */
    readonly taskIntentId: string;
    /** What the Task Drawer opens: the Task Intent, or the Review Run. */
    readonly planRef: string;
    readonly promotedAt: string;
  };
  /** Only on a read of the one draft, while it is not promoted. */
  readonly resolution: TaskIntentDraftResolution | null;
}

export interface TaskIntentDraftsProjection {
  readonly listPages?: TaskPlanProjection['listPages'];
  readonly bookId: string;
  readonly bookTitle: string;
  /**
   * The Book's manuscript as it stands now (TASK-002): its revision, its journal position, and whether the journal holds edits
   * no revision holds yet — words pinned now are `待保存修订版` until a revision holds them. `null` before it has one.
   */
  readonly manuscript: null | { readonly revisionLabel: string; readonly journalSequence: number; readonly pendingSave: boolean };
  /** The Book's drafts not yet promoted, newest first, then up to ten promoted ones. */
  readonly drafts: ReadonlyArray<TaskIntentDraftProjection>;
}

/**
 * 准备计划 on a draft (decision 1): the draft's exact version made into a prepared Task through the existing preparation of its
 * kind — the same cooperative job 先看计划 starts — with the draft's sentence as the Task Intent's goal. The plan opens in the Task
 * Drawer and still needs 开始任务 (AUTH-002); nothing is sent.
 */
export interface PromoteTaskIntentDraftInput {
  readonly bookId: string;
  readonly draftId: string;
  readonly versionId: string;
  readonly choice: TaskIntentDraftChoice;
  /** A writing Task's audience and channel, which the editor writes when the choice is a writing type. */
  readonly writing?: { readonly audience: string; readonly channel: string };
}

/** 转为任务意图草稿 (DIALOG-016): a new draft from a completed answer, which `attemptId` must name as the dialogue's latest. */
export interface PromoteAnswerToTaskIntentDraftInput {
  readonly bookId: string;
  readonly dialogueId: string;
  readonly attemptId: string;
}

// ---- ④ 导出 · DOCX (Issue #413, plan slice S64; editor-surfaces §7 导出, V2-UX-EXP-001 to EXP-024) ------

/**
 * What one Manuscript export carries beyond its text (V2-UX-EXP-023, EXP-024, MARK-006; ADR 0079 §3):
 * 含批注 and 含修改建议（作为修订） are on by default, 含备注 is off by default. An option changes the exported
 * file only, never the manuscript or its marks. Highlights and AI7's basis never leave (hard exclusions).
 */
export interface ManuscriptExportOptions {
  includeAnnotations: boolean;
  includeSuggestions: boolean;
  includeEditorNotes: boolean;
}

export const DEFAULT_MANUSCRIPT_EXPORT_OPTIONS: Readonly<ManuscriptExportOptions> = Object.freeze({
  includeAnnotations: true,
  includeSuggestions: true,
  includeEditorNotes: false,
});

/** DOCX, the primary editable format; PDF, optional and fixed; Markdown, the 备用格式 (Issue #500, S64b). */
export type ManuscriptExportFormat = 'docx' | 'pdf' | 'markdown';

/**
 * What is exported: the current revision (a dirty working state is saved first), one milestone, or one version of
 * a Review Run's 审阅报告 (Issue #500, S64b part 2; ADR 0079 §3.4), which exports in the manuscript's formats.
 */
export type ManuscriptExportTargetInput =
  | { kind: 'current' }
  | { kind: 'milestone'; milestoneId: string }
  | { kind: 'report'; reportId: string }
  // Issue #415 (S66b): one exact version of a Production Document of the route's Book (EXP-024, DELIV-003).
  | { kind: 'document'; documentId: string; revisionId: string };

/**
 * The classes of the Export Fidelity Review (V2-UX-EXP-007): the content classes ADR 0086 retains with the
 * Source Version, the three marks an export may carry, and the file's own revision markup that did not become
 * a mark.
 */
export type ExportFidelityKey =
  | 'inline-styles'
  | 'annotations'
  | 'change-suggestions'
  | 'editor-notes'
  | 'notes'
  | 'tables'
  | 'images-captions'
  | 'sections'
  | 'headers-footers'
  | 'text-boxes'
  | 'fields'
  | 'file-revisions'
  // The four parts of a 审阅报告 (V2-UX-REV-009; Issue #500, S64b part 2).
  | 'report-overview'
  | 'report-must-items'
  | 'report-summaries' | 'report-statistics' | 'report-findings'
  | 'report-appendix'
  // The published DOCX's 审阅说明 and 重点问题 (Issue #1430).
  | 'report-explanation' | 'report-priorities';

/** `excluded`: a mark kind the editor left out of this export — a choice, not a loss. */
export type ExportFidelityStatus = 'preserved' | 'degraded' | 'unavailable' | 'excluded';

export const EXPORT_FIDELITY_STATUS_LABELS = Object.freeze({
  preserved: '完整保留',
  degraded: '降级导出',
  unavailable: '无法导出',
  excluded: '本次不含',
} as const);

export type ExportFidelityStatusLabel = (typeof EXPORT_FIDELITY_STATUS_LABELS)[ExportFidelityStatus];

/** At most this many manuscript positions are named on one row; the count always says how many there are. */
export const MAX_EXPORT_FIDELITY_POSITIONS = 20;

/** One row of the Export Fidelity Review, in the service's own words. */
export interface ExportFidelityRowProjection {
  key: ExportFidelityKey;
  label: string;
  /** How many items of the class the export concerns. */
  count: number;
  status: ExportFidelityStatus;
  statusLabel: ExportFidelityStatusLabel;
  detail: string;
  /** The 1-based manuscript positions where the class is not written as it was, in order. */
  positions: ReadonlyArray<number>;
  positionsTruncated: boolean;
  /**
   * Actual DOCX writer facts, frozen in the existing fidelity record; absent on older exports. The first row also
   * freezes the export's summary line, so a receipt reads the words the review showed.
   */
  retention?: ExportRetentionProjection & { summary?: string };
}

export interface ExportRetentionProjection {
  preserved: ReadonlyArray<string>;
  rebuilt: ReadonlyArray<string>;
  excluded: ReadonlyArray<string>;
}

export interface ExportRetentionDisclosure {
  /** Null for other formats and for historical preparations without writer facts. */
  retention: ExportRetentionProjection | null;
  retentionSummary: string | null;
}

/**
 * The exact version one export is of: the current revision, one Milestone Version and the revision it froze, or one
 * version of a 审阅报告 and the revision its Review Run read.
 */
export interface ManuscriptExportTargetProjection {
  /** `package-manifest` is the service's own target (Issue #416, S67b): a package export's 交付包清单, never the renderer's. */
  kind: 'current' | 'milestone' | 'report' | 'document' | 'package-manifest';
  milestoneId: string | null;
  milestoneLabel: string | null;
  revisionId: string;
  revisionLabel: string;
  /** The report version exported, and the Review Run it reports on; `null` for a manuscript version. */
  report: { reportId: string; version: number; reviewRunId: string; runLabel: string } | null;
  /** The Production Document version exported (Issue #415, S66b): its type and `版本 N`; `null` for any other target. */
  document: { documentId: string; typeId: string; typeLabel: string; versionLabel: string } | null;
  /** The package version whose 交付包清单 is exported (Issue #416, S67b); `null` for any other target. */
  packageVersion: { packageVersionId: string; versionLabel: string } | null;
}

/** One format as the export card offers it: DOCX, the optional PDF, and the Markdown 备用格式 (Issue #500, S64b). */
export interface ManuscriptExportFormatProjection {
  format: ManuscriptExportFormat;
  label: string;
  available: boolean;
  note: string;
  /** Offered only under the secondary `备用格式` disclosure, never beside the recommended format (V2-UX-EXP-005). */
  fallback: boolean;
}

/**
 * The Export Fidelity Review of one exact version under one set of options (V2-UX-EXP-007 to EXP-009), before
 * any destination is chosen. Nothing is recorded by reading it; a current revision whose working state held
 * unsaved edits was first saved as a revision for the export (`savedForExport`).
 */
export interface ManuscriptExportReviewProjection extends ExportRetentionDisclosure {
  bookId: string;
  bookTitle: string;
  target: ManuscriptExportTargetProjection;
  savedForExport: boolean;
  /** The format this review is of (Issue #500, S64b): each format has its own review (EXP-007). */
  format: ManuscriptExportFormat;
  formats: ReadonlyArray<ManuscriptExportFormatProjection>;
  options: ManuscriptExportOptions;
  /** Whether retained content is restored from the original file, or the file is written fresh from the text. */
  restoration: 'from-original' | 'regenerated';
  /** One sentence on how the file is written, in the editor's words. */
  restorationLine: string;
  /** What the format promises, in the editor's words (V2-UX-EXP-009). */
  formatLine: string;
  fidelity: ReadonlyArray<ExportFidelityRowProjection>;
  /** Some class is `降级导出` or `无法导出`: `按上述方式导出` then accepts them for this export (EXP-008). */
  degraded: boolean;
  suggestedFileName: string;
  /** Binds a later preparation to exactly this review. */
  reviewDigest: string;
  technical: { revisionDigest: string; sourceVersionId: string | null; writerIdentity: string; inputDigest: string };
}

/** Whether the chosen file is created or replaces the one the platform's dialog confirmed replacing (EXP-019). */
export type ManuscriptExportDisposition = 'create' | 'replace';

/**
 * One frozen Local Export Preparation (External Export Policy v2 per-file requirements): the exact version,
 * format, options, fidelity, file name, final local path as the system dialog returned it, create-or-replace
 * disposition and payload digest, recorded after the destination was chosen and before any approval.
 */
export interface ManuscriptExportPreparationProjection extends ExportRetentionDisclosure {
  bookId: string;
  preparationId: string;
  target: ManuscriptExportTargetProjection;
  format: ManuscriptExportFormat;
  options: ManuscriptExportOptions;
  fidelity: ReadonlyArray<ExportFidelityRowProjection>;
  degraded: boolean;
  fileName: string;
  /** The path exactly as the system dialog returned it; never a path inside AI7's own data. */
  destination: string;
  disposition: ManuscriptExportDisposition;
  dispositionLabel: string;
  payloadBytes: number;
  preparedAt: string;
  technical: { effectIntentId: string; payloadDigest: string; recordDigest: string; policy: string };
}

/**
 * What one approved export came to (V2-UX-EXP-012, EXP-017, EXP-021): a verified created or replaced file with
 * its Effect Receipt — `已导出到所选位置` — or a classified outcome: `未能导出` when nothing at the destination
 * changed, `结果待确认` when AI7 cannot tell, which never retries by itself.
 */
export interface ManuscriptExportReceiptProjection extends ExportRetentionDisclosure {
  bookId: string;
  preparationId: string;
  target: ManuscriptExportTargetProjection;
  /** The format the receipt binds (V2-UX-EXP-013). */
  format: ManuscriptExportFormat;
  outcome: 'created' | 'replaced' | 'ambiguous' | 'failed';
  outcomeLabel: string;
  detail: string;
  fileName: string;
  destination: string;
  byteLength: number | null;
  recordedAt: string | null;
  /** Whether 在文件夹中显示 can be offered: only for a verified file. */
  revealAvailable: boolean;
  technical: { approvalId: string; receiptId: string | null; receiptDigest: string | null; fileSha256: string | null; failureCode: string | null };
}

/** At most this many exports are listed on 交付物, newest first. */
export const MAX_EXPORT_RECORDS_LISTED = 10;

/**
 * The longest local path an export binds, in UTF-16 code units: above macOS's PATH_MAX and the Windows path
 * the system dialogs return, and small enough that the most 交付物 lists stays within one service frame.
 */
export const MAX_EXPORT_DESTINATION_CODE_UNITS = 1024;

export interface ReviewManuscriptExportInput {
  bookId: string;
  target: ManuscriptExportTargetInput | { kind: 'book-review-report'; reviewRunId?: string };
  options: ManuscriptExportOptions;
  /** Absent reads as DOCX, so a request made before S64b (Issue #500) still means what it meant. */
  format?: ManuscriptExportFormat;
}

/** Freeze one preparation: the main process adds the destination the system dialog returned. */
export interface PrepareManuscriptExportInput {
  bookId: string;
  revisionId: string;
  target: ManuscriptExportTargetInput;
  options: ManuscriptExportOptions;
  reviewDigest: string;
  destination: string;
  format?: ManuscriptExportFormat;
}

/**
 * The main process's step before it approves a PDF (Issue #500, S64b): the service lays out the page the preparation
 * bound, checks it is still exactly that page, and stages it inside AI7's own data for the main process to print — a
 * print needs a Chromium the service does not have. `print` names the page and where the printed file goes; `null`
 * for a format the service writes itself.
 */
export interface StageManuscriptExportInput {
  bookId: string;
  preparationId: string;
}

export interface ManuscriptExportStageProjection {
  format: ManuscriptExportFormat;
  print: null | { pagePath: string; pdfPath: string };
}

export interface ApproveManuscriptExportInput {
  bookId: string;
  preparationId: string;
}

/** The main process's own read of a receipt, to reveal the verified file in the system file manager. */
export interface InspectManuscriptExportReceiptInput {
  bookId: string;
  preparationId: string;
}

/** 选择保存位置… as the renderer asks for it: the exact review it read, and no path. */
export interface ChooseManuscriptExportDestinationInput {
  revisionId: string;
  target: ManuscriptExportTargetInput;
  options: ManuscriptExportOptions;
  reviewDigest: string;
  /** The file name the dialog offers first; the editor may change it there. */
  suggestedFileName: string;
  /** The format the review was of (Issue #500, S64b); absent reads as DOCX. */
  format?: ManuscriptExportFormat;
}

/** The system dialog was cancelled — nothing is recorded (V2-UX-EXP-020) — or a preparation was frozen. */
export type ManuscriptExportDestinationResult =
  | { outcome: 'cancelled' }
  | { outcome: 'prepared'; preparation: ManuscriptExportPreparationProjection };

export interface DurableHistoryProjection {
  action: 'undo' | 'redo';
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  workingDigest: string;
  commandGroupId: string;
  completionLabel: string;
  canUndo: boolean;
  canRedo: boolean;
}

export interface ServiceJobProjection {
  jobId: string;
  /**
   * `review-run-preparation` prepares a Review Run: each selected Task-backed category's plan, one per
   * step, then the Run itself; `progress` counts the categories' plans plus the Run, and the completed
   * job's result is the 审阅 workspace with the prepared Run open.
   */
  kind: 'search' | 'replacement' | 'reimport-preparation' | 'reimport-resolution' | 'reimport-commit' |
    'task-authorization-preparation' | 'baseline-analysis-preparation' | 'review-run-preparation' | 'package-export' |
    'initial-evaluation-preparation' | 'readers-report-preparation' | 'evaluation-rewrite-preparation' | 'writing-preparation';
  state: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  progress: { completed: number; total: number; label: string };
  result: SearchSummaryProjection | ReplacementPreviewProjection | ReviewBeforeManuscriptReimportProjection |
    ManuscriptReimportCommitProjection | TaskAuthorizationProjection | BaselineAnalysisProjection | ReviewWorkspaceProjection | BookDeliveryPackageExportResultProjection |
    EvaluationWorkspaceProjection | WritingTaskProjection | null;
  failure: null | { code: string; message: string };
}

export interface ManuscriptImportCommitProjection {
  commitId: string;
  importedAt: string;
  completionLabel: '稿件已导入';
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  importRecordId: string;
  source: StagedImportProjection['source'];
  fidelityReview: {
    fidelityReviewId: string;
    outcome: ImportFidelityOutcome;
    categories: ReadonlyArray<FidelityCategoryProjection>;
  };
  importRecord: {
    importRecordId: string;
    fidelityReviewId: string;
    degradationDecision:
      | null
      | {
          degradationDecisionId: string;
          summaryLabel: '含已接受的降级';
          acceptedItems: ReadonlyArray<ImportDegradationItemProjection>;
        };
  };
  overview: BookWorkOverviewProjection;
  firstWindow: ManuscriptWindowProjection;
}

export interface SourceImportCommitProjection {
  commitId: string;
  importedAt: string;
  completionLabel: '来源材料已导入';
  targetKind: 'new-book' | 'existing-book';
  createdBook: boolean;
  bookId: string;
  sourceVersionId: string;
  sourceImportRecordId: string;
  sourceVersionDisposition: 'created' | 'reused-same-book';
  source: StagedImportProjection['source'];
  retainedBoundary: ReviewBeforeSourceImportProjection['retainedBoundary'];
  provenance: ReviewBeforeSourceImportProjection['provenance'] & { provenanceId: string };
  namedNonEffects: ReadonlyArray<string>;
  receipt: {
    source: Extract<BookRecordPresentation, { kind: 'source' }>;
    record: Extract<BookRecordPresentation, { kind: 'source-import-record' }>;
  };
  overview: BookWorkOverviewProjection;
}

export interface ManuscriptReimportCommitProjection {
  commitId: string;
  importedAt: string;
  completionLabel: '稿件已重新导入' | '未发现稿件变化';
  resultKind: 'changed' | 'no-change';
  bookId: string;
  manuscriptId: string;
  branchId: string;
  previousRevisionId: string;
  resultingRevisionId: string | null;
  reimportRecordId: string;
  sourceVersionId: string;
  sourceVersionDisposition: 'created' | 'reused-same-book';
  provenanceId: string;
  lineageStatus: 'verified' | 'unconfirmed';
  lineageLabel: '来源关系已确认' | '来源关系未确认';
  comparisonKind: 'three-way' | 'two-way';
  comparisonDigest: string;
  resolutionDigest: string;
  source: StagedImportProjection['source'];
  receipt: Extract<BookRecordPresentation, { kind: 'manuscript-reimport-record' }>;
  overview: BookWorkOverviewProjection;
  window: ManuscriptWindowProjection;
}

export type ImportCommitProjection =
  | ManuscriptImportCommitProjection
  | SourceImportCommitProjection
  | ManuscriptReimportCommitProjection;

export type OriginalFileAccessProjection =
  | { state: 'available-exact'; label: '原始所选文件仍可访问且身份一致' }
  | { state: 'unavailable'; label: '原始所选文件已无法访问，将从完整暂存快照继续' }
  | { state: 'changed'; label: '原始所选路径的文件已变化，将从完整暂存快照继续' }
  | { state: 'unknown'; label: '旧版草稿未保留原始路径，将从完整暂存快照继续' };

export interface ImportDraftRecoveryProjection {
  kind: 'ordinary-draft' | 'outcome-uncertain' | 'abandonment-cleanup';
  draftId: string;
  draftVersion: number;
  stagedAt: string;
  sourceDisplayName: string;
  snapshotState: 'complete' | 'reselection-required';
  lastCompletedStep: 'staging' | 'review' | 'commit-attempt' | 'commit-outcome-uncertain' | 'abandonment-cleanup';
  reviewedTitle: string | null;
  targetLabel: string | null;
  targetBookId: string | null;
  relationshipLabel: '作为首份稿件导入' | '作为来源材料导入' | '重新导入主稿件' | null;
  originalFileAccess: OriginalFileAccessProjection;
  staged: StagedImportProjection | null;
  commitAttemptId: string | null;
  supportCode: 'SNAPSHOT_RESELECTION_REQUIRED' | 'COMMIT_PROOF_INCONCLUSIVE' | 'ABANDON_CLEANUP_PENDING' | null;
}

export type ImportStartupProjection =
  | { state: 'none' }
  | { state: 'draft-recovery'; recovery: ImportDraftRecoveryProjection }
  | { state: 'outcome-uncertain'; recovery: ImportDraftRecoveryProjection }
  | { state: 'committed-recovered'; result: ImportCommitProjection };

export type ContinueImportProjection =
  | {
      state: 'target-review-required';
      staged: StagedImportProjection;
      originalFileAccess: OriginalFileAccessProjection;
      reviewInvalidated: boolean;
      notice: string;
    }
  | {
      state: 'review-ready';
      review: ReviewBeforeImportProjection | ReviewBeforeSourceImportProjection | ReviewBeforeManuscriptReimportProjection;
      originalFileAccess: OriginalFileAccessProjection;
      notice: string;
    }
  | { state: 'reselection-required'; recovery: ImportDraftRecoveryProjection }
  | { state: 'outcome-uncertain'; recovery: ImportDraftRecoveryProjection }
  | { state: 'committed-recovered'; result: ImportCommitProjection };

export interface JournalAcknowledgement {
  clientEditId: string;
  branchId: string;
  baseRevisionId: string;
  blockId: string;
  sequence: number;
  resultingBlockDigest: string;
  resultingWorkingDigest: string;
  durableAt: string;
  completionLabel: '已写入修订日志';
  window: ManuscriptWindowProjection;
}

export type CommitNewBookRendererInput = Omit<ServiceOperationMap['commitNewBookImport']['input'], 'commitId'> & {
  commitAttemptId: string | null;
};

export type CommitSourceImportRendererInput = Omit<ServiceOperationMap['commitSourceImport']['input'], 'commitId'> & {
  commitAttemptId: string | null;
};

export type CommitManuscriptReimportRendererInput = Omit<ServiceOperationMap['commitManuscriptReimport']['input'], 'commitId'> & {
  commitAttemptId: string | null;
};

export interface ServiceReadiness {
  protocolVersion: typeof SERVICE_PROTOCOL_VERSION;
  state: 'ready';
  runtime: {
    electron: '43.4.1';
    node: '24.18.1';
    modules: '148';
  };
  harness: {
    state: 'mounted-dormant';
    executionReady: false;
    providerFree: true;
    services: 6;
    serviceSet: readonly ['agents', 'sessions', 'llm', 'systemPrompt', 'tools', 'agentLoop'];
    configuredAgents: 0;
    agents: 0;
    sessions: 0;
    providers: 0;
    configurableProviders: 0;
    tools: 0;
    assembledTools: 0;
    renderedPrompt: '';
    renderedRuntimeContext: '';
  };
}

/**
 * 用量 (Issue #936, plan slice 11c; V2-UX-MSET-010): the Runs already recorded, summed — never a new account. A Run's tokens are
 * the Run Report's `usagePerStage` read from its Task Outcome; the route it ran on is the Execution Binding's. A Run settled
 * before the Run Report existed has no usage record and is counted apart, not as zero.
 */
export const USAGE_RANGES = ['day', 'week', 'month', 'all'] as const;

export type UsageRange = (typeof USAGE_RANGES)[number];

export const USAGE_GROUPINGS = ['book', 'taskKind', 'time'] as const;

export type UsageGrouping = (typeof USAGE_GROUPINGS)[number];

/** Run links per page; `runCount` is always whole. */
export const USAGE_ROW_RUN_LINKS = 50;

export interface InspectUsageInput {
  range: UsageRange;
  groupBy: UsageGrouping;
  /** Offset into each row's newest-first Run links; totals always cover the full range. */
  runOffset?: number;
  /** Resolve one exact Run report on demand, keeping aggregate replies within the existing frame bound. */
  runRecordId?: string;
  /** Keep a paged read pinned to the original aggregate's time boundary. */
  asOf?: string;
}

/** One Run of a row: the exact record the editor can open. */
export interface UsageRunLinkProjection {
  runRecordId: string;
  taskIntentId: string;
  bookId: string;
  bookTitle: string;
  /** The ledger Task kind, exactly as recorded. */
  taskKind: string;
  /** The Review Run this Run is one category of; `null` for every other kind. */
  reviewRunId: string | null;
  /** The route the Run's Execution Binding names; `null` when it was never bound. */
  route: string | null;
  recordedAt: string;
  inputTokens: number;
  outputTokens: number;
  /** The persisted report for this exact Run, independent of the Book's current plan. */
  report: RunReportProjection | null;
}

export interface UsageRouteTokensProjection {
  route: string | null;
  runCount: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageRowProjection {
  /** The Book id, the ledger Task kind, or the start of the period (`YYYY-MM-DD`, `YYYY-MM-DDTHH` or `YYYY-MM`). */
  key: string;
  /** A Book's title or the kind's / period's own name; the renderer words kinds and periods. */
  label: string;
  runCount: number;
  inputTokens: number;
  outputTokens: number;
  byRoute: ReadonlyArray<UsageRouteTokensProjection>;
  /** Newest first, one page of `USAGE_ROW_RUN_LINKS`; `runCount` discloses the full total. */
  runs: ReadonlyArray<UsageRunLinkProjection>;
}

export interface UsageProjection {
  range: UsageRange;
  groupBy: UsageGrouping;
  asOf: string;
  /** The earliest instant counted; `null` for 全部. */
  since: string | null;
  rows: ReadonlyArray<UsageRowProjection>;
  totals: { runCount: number; inputTokens: number; outputTokens: number; byRoute: ReadonlyArray<UsageRouteTokensProjection> };
  /** Runs in range that settled without a usage record: named, never counted as zero. */
  unrecordedRuns: number;
  /** `尚无用量` when no row exists. */
  emptyLabel: typeof USAGE_EMPTY_LABEL | null;
  /** Present only when one exact report was requested; no current-plan lookup. */
  detail?: UsageRunLinkProjection | null;
}

/** The result of 导出为 CSV…: a file of numbers and ids, written where the editor chose. */
export type UsageCsvExportResult = { outcome: 'cancelled' } | { outcome: 'written'; rows: number };

export interface ServiceOperationMap extends GlobalAgentOperations, HouseWordListOperations {
  getSearchBackendSettings: { input: Record<string, never>; output: SearchBackendSettingsProjection };
  selectSearchBackend: { input: SearchBackendSelectionInput; output: SearchBackendSettingsProjection };
  probeSearchBackend: { input: { backendId: string; candidateId?: SearchCandidateId }; output: SearchBackendProbeProjection };
  saveSearchBackendCredential: {
    input: { backendId: string; credentialReference: string | null; credentialOperationState: ModelCredentialOperationState };
    output: SearchBackendConnectionProjection;
  };
  removeSearchBackendCredential: { input: { backendId: string }; output: SearchBackendConnectionProjection };
  ready: { input: Record<string, never>; output: ServiceReadiness };
  getStartup: { input: Record<string, never>; output: StartupProjection };
  getRecoveryComparison: {
    input: { attentionId: string };
    output: RecoveryComparisonProjection;
  };
  viewRecoveryCandidate: {
    input: {
      attentionId: string;
      expectedAttentionVersion: number;
      selection: RecoverySelection;
      target: RecoveryWindowTarget;
    };
    output: RecoveryWindowProjection;
  };
  deferRecovery: {
    input: { attentionId: string; expectedAttentionVersion: number };
    output: RecoveryDeferralProjection;
  };
  restoreRecovery: {
    input: {
      restorationId: string;
      attentionId: string;
      expectedAttentionVersion: number;
      selection: RecoverySelection;
    };
    output: RecoveryRestorationProjection;
  };
  getImportStartup: { input: Record<string, never>; output: ImportStartupProjection };
  importBundledSampleBook: {
    input: { selectionToken: string; selectedPath: string };
    output: StagedImportProjection;
  };
  stageSelectedManuscript: {
    input: { selectionToken: string; selectedPath: string };
    output: StagedImportProjection;
  };
  continueImportDraft: {
    input: { draftId: string; expectedDraftVersion: number };
    output: ContinueImportProjection;
  };
  reselectImportDraft: {
    input: { draftId: string; expectedDraftVersion: number; selectionToken: string; selectedPath: string };
    output: ContinueImportProjection;
  };
  abandonImportDraft: {
    input: { draftId: string; expectedDraftVersion: number };
    output: ImportStartupProjection;
  };
  prepareBookCreation: {
    input: { title: string; internalNumber: string | null };
    output: BookCreationReviewProjection;
  };
  commitBookCreation: {
    input: {
      bookId: string;
      stableIdentity: string;
      title: string;
      internalNumber: string | null;
      reviewDigest: string;
    };
    output: BookCreationCommitProjection;
  };
  getBookOverview: {
    input: { bookId: string; historyCursor: BookHistoryCursor | null };
    output: BookWorkOverviewProjection;
  };
  inspectEditorialWorkspaceProfile: {
    input: { bookId: string };
    output: EditorialWorkspaceProfileProjection;
  };
  installEditorialWorkspaceProfile: {
    input: { bookId: string };
    output: EditorialWorkspaceProfileProjection;
  };
  enableEditorialWorkspaceProfile: {
    input: { bookId: string };
    output: EditorialWorkspaceProfileProjection;
  };
  inspectTaskAuthorization: {
    input: { bookId: string };
    output: TaskAuthorizationProjection;
  };
  /**
   * The Task Drawer (Issue #418, plan slice S72): the plan of one Task of the Book — J-03's fixed task,
   * the baseline analysis, or a Review Run — in the editor's words. A read; it records nothing.
   */
  inspectTaskPlan: { input: InspectTaskPlanInput; output: TaskPlanProjection };
  getTaskPlanPage: {
    input: Omit<InspectTaskPlanInput, 'kind'> & { kind: TaskPlanKind | 'task-intent-drafts' | 'book-tasks'; path: string; afterOrdinal: number; digest: string };
    output: { path: string; items: ReadonlyArray<unknown> | string; nextOrdinal: number | null; digest: string };
  };
  /**
   * 保留为缺口 (Issue #757; Manual Outcome Resolution): the editor keeps as gaps exactly the 结果待确认 the plan of this kind
   * listed, by its digest; the answer is that plan read again.
   */
  resolveUnconfirmedOutcomes: { input: InspectTaskPlanInput & { digest: string }; output: TaskPlanProjection };
  inspectForegroundExecutionBoundary: {
    input: { bookId: string; runRecordId: string };
    output: ForegroundExecutionBoundaryProjection;
  };
  prepareTaskAuthorization: {
    input: { bookId: string; goal: typeof J03_TASK_GOAL };
    output: ServiceJobProjection;
  };
  authorizeTaskAuthorization: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string };
    output: TaskAuthorizationProjection;
  };
  getBaselineAnalysisPage: {
    input: { bookId: string; taskIntentId: string; revisionId: string | null; path: string; afterOrdinal: number };
    output: { path: string; items: ReadonlyArray<unknown>; nextOrdinal: number | null; listPages: BaselineAnalysisWireProjection['listPages'] };
  };
  getCoverageManifestUnits: {
    input: { bookId: string; taskIntentId: string; afterOrdinal: number };
    output: { manifestDigest: string; units: ReadonlyArray<CoverageManifestUnitProjection>; next: number | null };
  };
  getAnalysisRevisionUnits: {
    input: { bookId: string; revisionId: string; afterOrdinal: number };
    output: { revisionId: string; units: ReadonlyArray<BaselineAnalysisWireUnitProjection>; next: number | null };
  };
  getAnalysisRevisionOverview: {
    input: { bookId: string; revisionId: string; afterIndex: number };
    output: { revisionId: string; text: string; next: number | null };
  };
  getAnalysisRunReportRows: {
    input: { bookId: string; taskIntentId: string; afterOrdinal: number };
    output: { reportDigest: string; rows: RunReportProjection['unitRows']; next: number | null };
  };
  getBaselineAnalysisRangePlan: {
    input: { bookId: string; unitOrdinal: number };
    output: { selectedRange: BaselineAnalysisSelectedRange; expected: AnalysisReusePlanCounts };
  };
  inspectBaselineAnalysis: {
    input: { bookId: string; revisionId: string | null };
    output: BaselineAnalysisProjection;
  };
  inspectBookFindings: { input: { bookId: string; offset: number }; output: BookFindingsProjection };
  inspectParagraphAnalysis: { input: { bookId: string; manuscriptId: string; blockId: string; radius: number }; output: ParagraphAnalysisProjection };
  prepareBaselineAnalysis: {
    /**
     * `reconfirm` is `重新确认计划`: resolve the pending Plan Revision of the prepared Task into its next plan version instead
     * of preparing anew. `redoOf` is `改计划重做` (Issue #422, S76c; AUTH-010, CONT-013): the cancelled Run of the Book's
     * latest Task this new Task redoes, carrying what it read; absent or `null` otherwise.
     */
    input: { bookId: string; goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; reconfirm: boolean; redoOf?: string | null };
    output: ServiceJobProjection;
  };
  authorizeBaselineAnalysis: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string };
    output: BaselineAnalysisProjection;
  };
  /**
   * 联网后开始任务 (Issue #502; AUTH-004, OFF-005): records the exact Run Authorization and Run Record, and the Run
   * waits in Connectivity Wait — nothing is sent, no usage arises, and nothing implies it began. Reconnect
   * Preflight then admits it once the model service can be reached and nothing material moved.
   */
  startBaselineAnalysisWhenOnline: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string };
    output: BaselineAnalysisProjection;
  };
  /** 取消 while a Run waits (OFF-010): the terminal cancellation, before any dispatch and without provider work. */
  cancelWaitingBaselineAnalysis: {
    input: { bookId: string; taskIntentId: string };
    output: BaselineAnalysisProjection;
  };
  /**
   * 取消任务 on a Run that started (Issue #422; CTRL-004 to CTRL-008), once the editor confirmed the Cancellation
   * Impact Summary: `cancelling` is recorded at once, the Run stops at the next unit boundary — the unit in flight
   * finishes and nothing after it is sent — and ends `cancelled` with what it completed kept. Cancelling twice
   * answers as the first did.
   */
  cancelBaselineAnalysisRun: {
    input: { bookId: string; taskIntentId: string };
    output: BaselineAnalysisProjection;
  };
  /**
   * 暂停 (Issue #422, S76b; CTRL-001, CTRL-002): `pausing` is recorded at once, the Run stops at the next unit boundary —
   * the unit in flight finishes — and reads `paused` once what it read is kept; the slot is free while it waits.
   */
  pauseBaselineAnalysisRun: {
    input: { bookId: string; taskIntentId: string };
    output: BaselineAnalysisProjection;
  };
  controlTaskRun: { input: ControlTaskRunInput; output: TaskPlanProjection };
  editTaskPlan: { input: EditTaskPlanInput; output: TaskPlanProjection };
  redoTaskPlan: { input: Pick<ControlTaskRunInput, 'bookId' | 'kind' | 'ref'>; output: ServiceJobProjection };
  quickStartReviewRun: {
    input: { bookId: string; reviewRunId: string; planEnvelopeDigest: string; ruleVersionId: string };
    output: { outcome: 'started' | 'fell-back'; reasons: ReadonlyArray<string>; projection: ReviewWorkspaceProjection };
  };
  /**
   * 续行 (CONT-015, CONT-016): after lightweight revalidation, the same Run goes on in a new Harness Execution Span from
   * its continuation point, under its own authorization; material drift refuses it, and nothing is recorded.
   */
  resumeBaselineAnalysisRun: {
    input: { bookId: string; taskIntentId: string };
    output: BaselineAnalysisProjection;
  };
  /**
   * 更新计划 (Issue #419, plan slice S73; V2-UX-PLAN-009, PLAN-011): the plan the editor sees, as they left it — the full
   * set of what it leaves out, against the version they were reading — becomes the next plan version, with its Plan
   * Revision recording the edit. Nothing is recorded when the plan moved, a key-content change is pending, or nothing
   * changed.
   */
  editBaselineAnalysisPlan: {
    input: {
      bookId: string;
      taskIntentId: string;
      planEnvelopeDigest: string;
      removedSteps: ReadonlyArray<string>;
      disallowedAdaptations: ReadonlyArray<string>;
      /** 先问你 (Issue #422, S76d): absent reads as none, so an S73 request still means what it meant. */
      askFirstAdaptations?: ReadonlyArray<string>;
      /** 设置上限… (Issue #51, S16a): the editor's ceiling in total tokens; absent or `null` sets none. */
      runBudgetCeiling?: { kind: 'tokens'; maxTotalTokens: number } | null;
    };
    output: BaselineAnalysisProjection;
  };
  /**
   * 提交回答 (Issue #422, S76d; CLAR-005, CLAR-006, INPUT-004): the editor's one answer to a question the Book's current
   * Task's Run asked — the option chosen and the note that qualifies it — recorded with who and when; a Run that waits
   * for it goes on inside its unchanged envelope. It grants no authority, and a question already answered, or one whose
   * Run has ended, is refused.
   */
  answerBaselineAnalysisClarification: {
    input: { bookId: string; taskIntentId: string; requestId: string; optionId: ClarificationOptionId; note: string | null };
    output: BaselineAnalysisProjection;
  };
  /**
   * Reconnect Preflight now, over every waiting Run (OFF-007, OFF-008): what it admitted, blocked, or left waiting.
   * It names no Book because it only ever admits Runs the editor already authorized to start when online.
   */
  runReconnectPreflight: {
    input: Record<string, never>;
    output: ReconnectPreflightProjection;
  };
  /**
   * 空闲时处理 (Issue #1089, F-17a; ADR 0095 §3): the kind's own exact Run Authorization, recorded to start when AI7 is idle;
   * it holds no place and sends nothing until then. A fixed Task only records an authorization, so it is not a kind here.
   */
  startTaskWhenIdle: { input: Omit<StartTaskWhenOnlineInput, 'kind'> & { kind: Exclude<TaskPlanKind, 'fixed-task'> }; output: TaskPlanProjection };
  /**
   * 联网后开始任务 for every kind but the baseline's (Issue #760, S74c; AUTH-004, OFF-005): the kind's own exact Run Authorization
   * — a ledger Task's Run Record, or a Review Run's one approval — and the Run waits in Connectivity Wait; nothing is sent, no
   * usage arises, and nothing implies it began. Reconnect Preflight then starts it as 开始任务 would. The answer is the plan.
   */
  startTaskWhenOnline: { input: StartTaskWhenOnlineInput; output: TaskPlanProjection };
  /** 取消 while that Run waits (OFF-010), or while it waits on the governor for a place: terminal, before any dispatch. */
  cancelWaitingTask: { input: CancelWaitingTaskInput; output: TaskPlanProjection };
  /**
   * 快速开始 (Issue #421; TASK-017, TASK-020, TASK-026): the Task the caller just prepared exactly as 先看计划
   * prepares it is started exactly as 开始任务 would start it, its authorization naming the rule version — or,
   * when anything would make the start differ from the rule, left at its plan with the reasons.
   */
  quickStartBaselineAnalysis: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string; ruleVersionId: string };
    output: QuickStartBaselineAnalysisResult;
  };
  /** `设为快速开始默认…` (AUTH-009, TASK-019): a new rule, or the rule's next version, from the plan on show. */
  setDefaultExecutionRule: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string };
    output: DefaultExecutionRuleProjection;
  };
  /** 知识库 › 工序与规则: every rule of every Book. */
  inspectDefaultExecutionRules: {
    input: Record<string, never>;
    output: DefaultExecutionRulesProjection;
  };
  /** 停用: the rule stays on record and quick start stops using it. */
  deactivateDefaultExecutionRule: {
    input: { ruleId: string };
    output: DefaultExecutionRuleProjection;
  };
  /** 后台分析登记 of one Book (Issue #95, S39): its state, what it would do now, and its disclosure. */
  inspectBackgroundAnalysisEnrollment: {
    input: { bookId: string; kind?: string };
    output: BackgroundAnalysisEnrollmentProjection;
  };
  /**
   * `登记`: the Enrollment, from the disclosure the editor confirmed, the starting point they chose, the scope it covers and the
   * tokens ceiling they set — required (Issue #864).
   */
  enrollBackgroundAnalysis: {
    input: {
      bookId: string;
      kind?: string;
      disclosureDigest: string;
      startingPoint: BackgroundAnalysisStartingPoint;
      scope: { kind: BackgroundAnalysisScopeKind; seriesId: string | null };
      ceilingTokens: number;
    };
    output: BackgroundAnalysisEnrollmentProjection;
  };
  /** `撤销登记`: no new Run starts under it; everything already recorded stays. */
  revokeBackgroundAnalysisEnrollment: {
    input: { bookId: string; enrollmentId: string };
    output: BackgroundAnalysisEnrollmentProjection;
  };
  /** `暂停` / `续行` of an Enrollment in force (Issue #864): holds or releases what it would start; Runs already started go on. */
  holdBackgroundAnalysisEnrollment: {
    input: { bookId: string; enrollmentId: string; hold: 'pause' | 'resume' };
    output: BackgroundAnalysisEnrollmentProjection;
  };
  /** 知识库 › 审阅规范文件 (Issue #427, S79a): every guideline document the review categories apply, with its versions. */
  inspectReviewGuidelines: {
    input: { page?: ReviewGuidelinesPage };
    output: ReviewGuidelinesProjection;
  };
  /** 导入新版本's reading of the file main's picker returned: nothing is recorded until it is confirmed. */
  previewReviewGuidelineVersion: {
    input: { documentId: string; path?: string; previewId?: string; clausePage?: number };
    output: ReviewGuidelinePreviewProjection;
  };
  /** 确认导入: the previewed clauses become the document's next version, issued by the house. */
  importReviewGuidelineVersion: {
    input: { previewId: string };
    output: ReviewGuidelinesProjection;
  };
  /** 知识库 › 范例 › 导入以前图书的范例 (Issue #427): preview a file, import it under an earlier Book, decide its eligibility. */
  previewImportedExemplar: {
    input: { path: string };
    output: ImportedExemplarPreview;
  };
  importEarlierExemplar: {
    input: ImportedExemplarInput;
    output: ExemplarBookProjection;
  };
  decideImportedExemplar: {
    input: ImportedExemplarDecisionInput;
    output: ExemplarBookProjection;
  };
  /** 知识库 › 范例 (Issue #427, S79b): the published Books' delivered documents, by Book and type, a page at a time. */
  inspectExemplars: {
    input: { after: ExemplarBookCursor | null };
    output: ExemplarsProjection;
  };
  /** 知识库 › 范例 › 归入范例 (Issue #429): the editor admits one Book's 审稿意见, at the version 图书交付包 pins, under 仅本社. */
  admitReadersReportExemplar: {
    input: AdmitReadersReportExemplarInput;
    output: ExemplarBookProjection;
  };
  /** 知识库 › 工序与规则 (Issue #427, S79d): the review categories' 工序 and the native artifact, with their use. */
  procedureLibrary: { input: import('./protocol/procedures.js').ProcedureLibraryCommand; output: import('./protocol/procedures.js').ProcedureLibraryProjection };
  inspectKnowledgeProcedures: {
    input: Record<string, never>;
    output: KnowledgeProceduresProjection;
  };
  /** 知识库 › 工序与规则's 可复用工序 and 开发建议 (Issue #65, S30; ADR 0087 §5, §6): names no Book. */
  inspectCapturedProcedures: { input: Record<string, never>; output: CapturedProceduresProjection };
  /**
   * 外部 Skill (ADR 0045, ADR 0090 §2): acquisition from the path the platform picker gave main discloses and keeps nothing
   * (`path`); keeping the disclosed package is a second, separate call (`keep`, its acquisition id). Exactly one is given.
   */
  importSkillPackage: { input: { path: string | null; keep: string | null }; output: ImportedSkillImportProjection };
  /** A provider-free validation stage over the exact working files; it never installs or enables (REUSE-023, REUSE-024). */
  validateImportedSkill: { input: { revisionId: string }; output: ImportedSkillRevisionProjection };
  /** Installation, finished disabled, of a validated revision whose preview the editor confirmed (REUSE-026). */
  installImportedSkill: { input: { revisionId: string; previewDigest: string }; output: ImportedSkillRevisionProjection };
  /** Scoped enablement for one Book after the ceiling was shown: no executor, Run scope, Provider or Effect follows (REUSE-028). */
  enableImportedSkill: { input: { revisionId: string; bookId: string; previewDigest: string }; output: ImportedSkillRevisionProjection };
  /** The house's imported Skills, newest revision each, a page at a time, and one exact revision when asked. A read. */
  inspectImportedSkills: { input: { revisionId: string | null; before: string | null }; output: ImportedSkillsProjection };
  /**
   * 检查更新（从文件）… (ADR 0090 §3; REUSE-032): the package of the picked path is disclosed against the Skill it would update (`path`),
   * or the disclosed one is kept (`keep`, its acquisition id) as a new Source Skill Snapshot and one inert update candidate. Exactly one is given.
   */
  checkImportedSkillUpdate: { input: { skillId: string; path: string | null; keep: string | null }; output: ImportedSkillUpdateCheckProjection };
  /** One update candidate with its three-way report. A read. */
  inspectImportedSkillUpdate: { input: { candidateId: string }; output: ImportedSkillUpdateCandidateProjection };
  /**
   * 采纳 (REUSE-033): a new working revision, first at 待验证 and never enabled. `acceptItems` names every item of a candidate that
   * is not clean; `upstreamPaths` are the conflicting files the editor takes from upstream (the rest keep the local derivation).
   */
  adoptImportedSkillUpdate: { input: { candidateId: string; reviewDigest: string; acceptItems: readonly string[]; upstreamPaths: readonly string[] }; output: ImportedSkillUpdateCandidateProjection };
  /** 忽略: the candidate is marked dismissed; nothing is deleted. */
  dismissImportedSkillUpdate: { input: { candidateId: string }; output: ImportedSkillUpdateCandidateProjection };
  /** The Artifact Update Rule of one imported Skill (REUSE-034), created with its confirmation line and revoked by appending a revocation. */
  createImportedSkillUpdateRule: { input: { skillId: string; confirmation: string }; output: ImportedSkillUpdateRuleProjection };
  revokeImportedSkillUpdateRule: { input: { skillId: string }; output: ImportedSkillUpdateRuleProjection };
  /** 回到此版本 (REUSE-035): a new current selection; history is not rewritten and enablement is not restored. */
  rollbackImportedSkill: { input: { skillId: string; revisionId: string }; output: ImportedSkillRevisionProjection };
  /** 工序推荐 (ADR 0090 §1; TASK-010 to 016): a deterministic read; it selects, acquires, enables or authorizes nothing. */
  recommendProcedures: { input: ProcedureRecommendationInput; output: ProcedureRecommendationProjection };
  /** One Captured Procedure with a page of its versions, newest first, below `before` when it is given. */
  inspectCapturedProcedure: { input: { procedureId: string; before: number | null }; output: CapturedProcedureProjection };
  /** One 开发建议 with a page of its versions, newest first, below `before` when it is given. */
  inspectDeveloperProposal: { input: { proposalId: string; before: number | null }; output: DeveloperProposalProjection };
  /** One 开发建议 version alone: what 导出为文件… names and writes. Main reads it; the renderer never does. */
  inspectDeveloperProposalVersion: { input: { proposalVersionId: string }; output: DeveloperProposalVersionProjection };
  /** The capture's source set, extraction and classification for one finished Review Run of the Book (ADR 0087 §2). */
  inspectProcedureCapture: { input: { bookId: string; reviewRunId: string }; output: ProcedureCaptureProjection };
  /** 保存为可复用工序: version 1 `待验证`, or a next version of an existing Captured Procedure (ADR 0087 §2). */
  saveCapturedProcedure: { input: SaveCapturedProcedureInput; output: CapturedProcedureProjection };
  /** `验证并启用…`'s deterministic preview (ADR 0087 §3). */
  previewCapturedProcedureValidation: { input: { versionId: string }; output: CapturedProcedureValidationProjection };
  /** Confirms the preview by its digest: `已启用` when it passes, its reasons recorded when it does not (ADR 0087 §3). */
  enableCapturedProcedure: { input: { versionId: string; previewDigest: string }; output: CapturedProcedureProjection };
  /** `停用…`'s preview (Issue #66, S31; REUSE-038, REUSE-040, REUSE-041): what stopping one version, or all of them, changes. */
  previewCapturedProcedureStop: { input: { procedureId: string; versionId: string | null }; output: CapturedProcedureStopPreviewProjection };
  /** `停用`: one version or all of them, final for each (ADR 0087 §5), confirming exactly the preview the editor read (S31). */
  stopCapturedProcedure: { input: { procedureId: string; versionId: string | null; previewDigest: string }; output: CapturedProcedureProjection };
  /**
   * For the Book's 新建审阅 sheet (ADR 0087 §4): the newest 已启用 version that still validates, or — `versionId` — the exact
   * eligible version the editor chose instead (Issue #66, S31; REUSE-043 to REUSE-045, REUSE-054).
   */
  // `scope` (Issue #423, S77 deferred item a): the steps resolved for a 当前选区 instead of the version's own slot; left out or `null` for the slot.
  inspectCapturedProcedureRun: { input: { bookId: string; procedureId: string; versionId: string | null; scope?: CapturedProcedureScopeSlot | null }; output: CapturedProcedureRunProjection };
  /** The house's enabled Captured Procedures as each applies to one Book: its latest eligible version and its steps there (S31b). */
  inspectCapturedProcedureApplicability: { input: { bookId: string; scope?: CapturedProcedureScopeSlot | null }; output: CapturedProcedureApplicabilityProjection };
  /** 知识库 › 工序与规则 › 自定义分析维度 (`bookId: null`), or ②A's 自定义 tab over one Book (Issue #922, slice 7f). */
  inspectCustomAnalysisDimensions: { input: { bookId: string | null }; output: CustomAnalysisDimensionsProjection };
  /** Version 1 of a new dimension, or the next version of one superseding its latest; always `待验证` (ADR 0090 item 4). */
  saveCustomAnalysisDimension: { input: SaveCustomAnalysisDimensionInput; output: CustomAnalysisDimensionsProjection };
  /** `验证并启用`: the version's document is validated again, deterministically, and recorded `已启用` — or refused with its reason. */
  enableCustomAnalysisDimension: { input: { versionId: string }; output: CustomAnalysisDimensionsProjection };
  /** `停用`: final for the version; Runs prepared under it keep naming it. */
  stopCustomAnalysisDimension: { input: { versionId: string }; output: CustomAnalysisDimensionsProjection };
  /** ②A 自定义 › 运行: the dimension's enabled version prepared as a Task on the Book; its plan opens in the Task Drawer. */
  prepareCustomAnalysis: { input: PrepareCustomAnalysisInput; output: { taskIntentId: string; dimensions: CustomAnalysisDimensionsProjection } };
  /** 保存开发建议: a new Developer Capability Proposal, or its next version (ADR 0087 §6). */
  saveDeveloperProposal: { input: SaveDeveloperProposalInput; output: DeveloperProposalProjection };
  /** 导出为文件…: the proposal version written to the file the editor chose through the Save dialog (ADR 0087 §6). */
  writeDeveloperProposalFile: { input: { proposalVersionId: string; destination: string }; output: DeveloperProposalProjection };
  /** 知识库 › 资料库 (Issue #427, S79c): the items the editor collected, a page at a time, with their attribution and eligibility. */
  inspectLibraryMaterials: {
    input: { after: LibraryMaterialCursor | null };
    output: LibraryMaterialsProjection;
  };
  /** One 资料库 item as its card reads it: the one 待我处理 opens, beyond the first page too. */
  inspectLibraryMaterial: {
    input: { materialId: string };
    output: LibraryMaterialProjection;
  };
  /** 来源与证据 (Issue #425, S70): a page of a Book's retained external sources and its research units' outcomes; read-only. */
  inspectResearchEvidence: {
    input: { bookId: string; after: number | null; staleAfterDays: number | null; taskIntentId?: string; reviewFindingId?: string };
    output: ResearchEvidenceBookProjection;
  };
  /** 保存为来源材料 (Issue #425, S70): one retained full-text source made a 资料库 item with its provenance; nothing is sent. */
  saveEvidenceAsMaterial: {
    input: { bookId: string; evidenceId: string; title: string | null };
    output: { evidenceId: string; material: LibraryMaterialProjection };
  };
  /** The Fact-check Lens (Issue #901; FACT-004/005/007): one page of a Book's latest Versioned Verification Results; read-only. */
  inspectFactualVerification: {
    input: InspectFactualVerificationInput;
    output: FactualVerificationLensProjection;
  };
  /** The Evidence Workspace of one result (Issue #901; EVID-001 to 013): source cards, conflicts, summary, decision card; read-only. */
  inspectEvidenceWorkspace: {
    input: InspectEvidenceWorkspaceInput;
    output: EvidenceWorkspaceProjection;
  };
  /** 记录核查审阅决定 (Issue #901; FREV-006): one immutable Review Decision bound to one result version. */
  recordVerificationReviewDecision: {
    input: RecordVerificationReviewDecisionInput;
    output: VerificationReviewDecisionRecordedProjection;
  };
  /** 准备更正提案 (Issue #901; CORR-001): the Correction Proposal Draft offer; read-only. */
  prepareCorrectionProposal: {
    input: PrepareCorrectionProposalInput;
    output: CorrectionProposalDraftProjection;
  };
  /** 保存为更正提案 (Issue #901; CORR-011): ordinary 修改建议 marks with their factual lineage; no decision, no Apply. */
  saveCorrectionProposal: {
    input: SaveCorrectionProposalInput;
    output: CorrectionProposalSavedProjection;
  };
  readLibraryDecisionReason: {
    input: { materialId: string; ordinal: number; offset: number };
    output: LibraryDecisionReasonPage;
  };
  /** 查看分段 (Issue #428, S80a): one page of an item's indexed paragraphs and sentence anchors, from the paragraph named. */
  inspectLibraryMaterialSegments: {
    input: { materialId: string; from: number };
    output: MaterialSegmentsPageProjection;
  };
  /** 构建相似索引 (Issue #892): the current build's similarity vectors made on this machine, on request; the item as it now reads. */
  buildMaterialVectors: {
    input: { materialId: string };
    output: LibraryMaterialProjection;
  };
  /** 相似段落检索 (Issue #892): an item's paragraphs nearest the editor's text, by its built vectors; read-only. */
  queryMaterialVectors: {
    input: { materialId: string; text: string; k: number };
    output: MaterialVectorSearchProjection;
  };
  /** 生成来源译文 (Issue #892): a non-Chinese item's 来源译文 asked for, under the selected policy's rule; the item as it now reads. */
  requestMaterialTranslation: {
    input: { materialId: string };
    output: LibraryMaterialProjection;
  };
  searchReferableMaterials: {
    input: { bookId: string; query: string; k: number };
    output: { candidates: ReadonlyArray<LocalRetrievalCandidateProjection> };
  };
  /** 放入资料…: the absolute path main's picker returned, read as it would arrive; nothing is kept. */
  previewLibraryMaterial: {
    input: { path: string };
    output: LibraryMaterialPreviewProjection;
  };
  /** 放入资料库: the previewed file kept whole in the Agent Data Root, with the title and kind the editor gave it; the new item. */
  addLibraryMaterial: {
    input: { previewId: string; title: string; kind: LibraryMaterialKind; bookId?: string | null };
    output: LibraryMaterialProjection;
  };
  /** 定归属 or 定学习准入: one decision appended to the item's chain, refused when the chain moved since it was read; the item. */
  decideLibraryMaterial: {
    input: { materialId: string; expectedDecisions: number; decision: LibraryMaterialDecisionInput };
    output: LibraryMaterialProjection;
  };
  /** 知识库 › 评估方案 (Issue #429, S81a): the house Evaluation Profile and its use. */
  saveEvaluationProfile: { input: SaveEvaluationProfileInput; output: EvaluationProfilesProjection };
  inspectEvaluationProfiles: {
    input: { before?: number | null };
    output: EvaluationProfilesProjection;
  };
  /** ②C 评估 of the route's Book (Issue #429, S81a): one version by its identity, or the latest when `null`. */
  inspectEvaluation: {
    input: { bookId: string; recordId: string | null; recordsBefore?: number | null };
    output: EvaluationWorkspaceProjection;
  };
  /** 开始评估 or 重新评估: a new version bound to the manuscript's current revision, alone or from AI7's latest 初评. */
  startEvaluation: {
    input: { bookId: string } & StartEvaluationInput;
    output: EvaluationWorkspaceProjection;
  };
  /** 保存评估 or 定稿: the editor's content appended to the version's chain, refused when the chain moved since it was read. */
  saveEvaluation: {
    input: { bookId: string; recordId: string; expectedEntries: number; content: EvaluationContent; finalize: boolean };
    output: EvaluationWorkspaceProjection;
  };
  /**
   * 准备 AI7 初评 (Issue #429, S81b1): the evaluation kind's Task prepared as one cooperative job — the first 初评, or 重新初评
   * once one settled. The completed job's result is 评估 with the prepared Task named, whose plan the Task Drawer opens.
   */
  prepareInitialEvaluation: {
    input: { bookId: string; materialIds?: ReadonlyArray<string>; seriesId?: string | null };
    output: ServiceJobProjection;
  };
  /** 开始任务 in the drawer's bar: the Run Authorization and the Run, admitted at once or waiting for a place. */
  authorizeInitialEvaluation: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string };
    output: EvaluationWorkspaceProjection;
  };
  /**
   * 起草审稿意见 (Issue #429, S81c): the reader's report kind's Task, drafted from the Book's latest 定稿 version under one
   * template, prepared as one cooperative job. The completed job's result is 评估 with the prepared Task named.
   */
  prepareReadersReport: {
    input: { bookId: string; template: ReadersReportTemplate; materialIds?: ReadonlyArray<string> };
    output: ServiceJobProjection;
  };
  /** 开始任务 in the drawer's bar for 审稿意见. */
  authorizeReadersReport: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string };
    output: EvaluationWorkspaceProjection;
  };
  /** 打开草稿: one drafted 审稿意见 result made the template's draft document, once; 评估 then names it. */
  createReadersReportDraft: {
    input: { bookId: string; revisionId: string };
    output: EvaluationWorkspaceProjection;
  };
  /**
   * 按我的评分重写评语 (Issue #429, S81b2; EVAL-008): the evaluation rewrite kind's Task over one version's latest saved entry,
   * prepared as one cooperative job. The completed job's result is 评估 with that version on show and the prepared Task named.
   */
  prepareEvaluationRewrite: {
    input: { bookId: string; recordId: string };
    output: ServiceJobProjection;
  };
  /** 开始任务 in the drawer's bar for 按我的评分重写评语. */
  authorizeEvaluationRewrite: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string };
    output: EvaluationWorkspaceProjection;
  };
  /**
   * 采用 or 放弃 one rewrite: 采用 appends the rewritten 评语 and 总评 to the version as a new entry, every score as it stands;
   * 放弃 records that the editor set it aside. Either is recorded once.
   */
  decideEvaluationRewrite: {
    input: { bookId: string; revisionId: string; decision: EvaluationRewriteDecision };
    output: EvaluationWorkspaceProjection;
  };
  /** 新建文档 · 写作任务 (Issue #432, S84a; DELIV-007): the house types, what a draft references, and the Book's latest writing Task. */
  inspectWritingTask: {
    input: { bookId: string };
    output: WritingTaskProjection;
  };
  /**
   * 先看计划 of a writing Task: one house type and the editor's audience, channel and requirements, prepared as one cooperative
   * job. The completed job's result is 新建文档 · 写作任务 with the prepared Task named, whose plan the Task Drawer opens.
   */
  prepareWritingTask: {
    /** `materialIds` (Issue #428): the 资料库 items the editor ticked under 允许参考, in the order offered; none when absent. */
    input: { bookId: string; typeId: string; audience: string; channel: string; requirements: string | null; materialIds?: ReadonlyArray<string> };
    output: ServiceJobProjection;
  };
  /** 开始任务 in the drawer's bar for a writing Task. */
  authorizeWritingTask: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string };
    output: WritingTaskProjection;
  };
  /**
   * 快速开始 of a writing Task (Issue #432, S84b; TASK-017, TASK-020, TASK-026): the Task the caller just prepared exactly as
   * 先看计划 prepares it is started exactly as 开始任务 would start it, its authorization naming the writing rule version — or,
   * when anything would make the start differ from the rule, left at its plan with the reasons.
   */
  quickStartWritingTask: {
    input: { bookId: string; taskIntentId: string; planEnvelopeDigest: string; ruleVersionId: string };
    output: QuickStartWritingTaskResult;
  };
  /** 打开草稿: one drafted result made the type's document, its 起草 phase started; once per writing result. */
  createWritingDraft: {
    input: { bookId: string; revisionId: string; title?: string };
    output: WritingDraftCreatedProjection;
  };
  /** ②A 分析反馈 (Issue #94, S38): one Result Set Revision's items with their latest judgments, and the Book's metric. */
  inspectAnalysisFeedback: {
    input: { bookId: string; revisionId: string };
    output: AnalysisFeedbackProjection;
  };
  /** 记录反馈: one explicit judgment appended as a Quality Signal, refused when the item or its latest judgment moved. */
  recordAnalysisFeedback: {
    input: RecordAnalysisFeedbackInput & { bookId: string };
    output: AnalysisFeedbackProjection;
  };
  /**
   * 审阅 (Issue #417, plan slice S69). The workspace is one read; preparing a Review Run is a
   * cooperative job; the one approval records the Run's authorization and starts its drive loop at once,
   * so the answer already reads the Run `running`; 继续审阅 drives a stopped Run again. A finding's
   * decisions other than 忽略并说明 go through the mark and Apply operations with the finding's `markId`.
   */
  inspectReviewWorkspace: { input: InspectReviewWorkspaceInput; output: ReviewWorkspaceProjection };
  prepareReviewRun: { input: PrepareReviewRunInput; output: ServiceJobProjection };
  authorizeReviewRun: { input: AuthorizeReviewRunInput; output: ReviewWorkspaceProjection };
  continueReviewRun: { input: ContinueReviewRunInput; output: ReviewWorkspaceProjection };
  recordReviewFindingDisposition: { input: RecordReviewFindingDispositionInput; output: ReviewWorkspaceProjection };
  generateReviewReport: { input: GenerateReviewReportInput; output: ReviewWorkspaceProjection };
  inspectReviewFindingOfMark: { input: InspectReviewFindingOfMarkInput; output: ReviewFindingOfMarkProjection | null };
  listBooks: {
    /** `filter` narrows the list to the Books whose 书名, 作者 or 责编 hold the words (Issue #431, S83). */
    input: { after: BookSummaryCursor | null; filter?: BookSummaryFilter };
    output: BookSummaryPageProjection;
  };
  updateBookPeople: { input: UpdateBookPeopleInput; output: BookPeopleResultProjection };
  prepareNewBookReview: {
    input: {
      draftId: string;
      expectedDraftVersion: number;
      target: ImportTargetSelection;
      acceptDegradation: boolean;
      /**
       * The review's choice for the file's text boxes (ADR 0086 §2): `retain` — the default the review
       * preselects — or `merge`. A file without a text box can only be reviewed with `retain`.
       */
      textBoxDisposition: TextBoxDisposition;
      trackedChanges?: WordTrackedChangesChoice;
      /** Required when the staged draft lists long paragraphs; otherwise optional (Issue #1205). */
      structure?: ImportStructureChoice;
    };
    output: ReviewBeforeImportProjection;
  };
  commitNewBookImport: {
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
    output: ManuscriptImportCommitProjection;
  };
  prepareSourceImportReview: {
    input: {
      draftId: string;
      expectedDraftVersion: number;
      target: SourceImportTargetSelection;
    };
    output: ReviewBeforeSourceImportProjection;
  };
  commitSourceImport: {
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
    output: SourceImportCommitProjection;
  };
  prepareManuscriptReimport: {
    input: {
      draftId: string;
      expectedDraftVersion: number;
      target: ManuscriptReimportTargetSelection;
    };
    output: ServiceJobProjection;
  };
  getReimportMappingPage: {
    input: { draftId: string; expectedDraftVersion: number; after: number | null };
    output: ReimportMappingPageProjection;
  };
  getReimportLineageSourceVersionPage: {
    input: { bookId: string; after: string | null };
    output: ReimportLineageSourceVersionPageProjection;
  };
  acceptReimportDegradation: {
    input: { draftId: string; expectedDraftVersion: number };
    output: ReviewBeforeManuscriptReimportProjection;
  };
  /** One row of the chapter-level comparison resolved by one verb (Issue #412, S63): never preselected, never guessed. */
  resolveReimportMapping: {
    input: {
      draftId: string;
      expectedDraftVersion: number;
      groupId: string;
      verb: ReimportGroupVerb;
    };
    output: ServiceJobProjection;
  };
  resolveAcknowledgedManuscriptReimportReplay: {
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
    output: { draftId: string; commitId: string; bookId: string };
  };
  commitManuscriptReimport: {
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
    output: ServiceJobProjection;
  };
  acknowledgeImportCompletion: {
    input: { commitId: string };
    output: { state: 'acknowledged' };
  };
  getManuscriptWindow: {
    input: { manuscriptId: string; branchId: string; cursor: string | null };
    output: ManuscriptWindowProjection;
  };
  flushJournalEdit: { input: JournalEditInput; output: JournalAcknowledgement };
  readManuscriptImageChunk: {
    input: { manuscriptId: string; branchId: string; sourceVersionId: string; ordinal: number; offset: number };
    output: { base64: string; totalBytes: number; mime: string };
  };
  /** Test-only (Issue #951, T0-1): refused unless the launch armed it; see `EDIT_JOURNAL_FAULT_CONTROL_ARGUMENT`. */
  setEditJournalFault: { input: { mode: EditJournalFaultMode }; output: EditJournalFaultProjection };
  /**
   * Editorial Marks (Issue #407). A mark is made on text the working state holds now, bound to the
   * Revision, journal position and block digest the editor saw; every command answers with the marks
   * of the window it was issued from, so the surface redraws from what the service holds.
   */
  createEditorialMark: { input: CreateEditorialMarkInput; output: EditorialMarkCommandProjection };
  getEditorialMarkCard: {
    input: { manuscriptId: string; branchId: string; markId: string };
    output: EditorialMarkCardProjection;
  };
  updateEditorialMark: { input: UpdateEditorialMarkInput; output: EditorialMarkCommandProjection };
  recordChangeSuggestionDecision: { input: RecordChangeSuggestionDecisionInput; output: EditorialMarkCommandProjection };
  recordProposalDecisionReason: { input: RecordProposalDecisionReasonInput; output: EditorialMarkCommandProjection };
  recordProposalDecisionFeedback: { input: RecordProposalDecisionFeedbackInput; output: EditorialMarkCommandProjection };
  inspectEditorialLearning: { input: InspectEditorialLearningInput; output: EditorialLearningProjection };
  inspectWordTrackedEditSample: { input: InspectWordTrackedEditSampleInput; output: WordTrackedEditSampleDetailProjection };
  recordLearningReasonAsk: { input: LearningReasonAskInput & { frequency: import('./preferences.js').LearningAskFrequency }; output: LearningReasonAskProjection | null };
  changeEditorialLearning: { input: ChangeEditorialLearningInput; output: EditorialLearningProjection };
  createEditorialMemory: { input: CreateEditorialMemoryInput; output: EditorialLearningProjection };
  acceptEditorialMemory: { input: import('./protocol/learning.js').AcceptEditorialMemoryInput; output: EditorialLearningProjection };
  deactivateEditorialMemory: { input: DeactivateEditorialMemoryInput; output: EditorialLearningProjection };
  inspectHouseReviewPreference: { input: Record<string, never>; output: HouseReviewPreferenceProjection };
  rebuildHouseReviewPreference: { input: Record<string, never>; output: HouseReviewPreferenceProjection };
  inspectEditQualitySignals: { input: { bookId: string | null; preferenceAfter?: PreferenceAdoptionCursor | null }; output: EditQualitySignalsProjection };
  inspectLearningMaterials: { input: { bookId: string | null; after: LearningMaterialCursor | null }; output: LearningMaterialsProjection };
  /** One material as its Review Card reads it, by its Book and place. */
  inspectLearningMaterial: { input: { bookId: string; materialKey: string }; output: LearningMaterialProjection };
  /** 记录学习准入决定, answered with the one material it decided. */
  decideLearningMaterial: { input: DecideLearningMaterialInput; output: LearningMaterialProjection };
  inspectFeedbackHistory: { input: FeedbackHistoryInput; output: FeedbackHistoryProjection };
  inspectLearningAudit: { input: LearningAuditInput; output: LearningAuditProjection };
  inspectLearningLineage: { input: { bookId: string; materialKey: string }; output: LearningLineageProjection };
  previewLearningRemediation: { input: PreviewLearningRemediationInput; output: LearningRemediationPreviewProjection };
  recordLearningRemediation: { input: RecordLearningRemediationInput; output: LearningRemediationOutcomeProjection };
  inspectEvaluationCalibration: { input: InspectEvaluationCalibrationInput; output: EvaluationCalibrationProjection };
  recordPublicationActuals: { input: RecordPublicationActualsInput; output: EvaluationCalibrationProjection };
  setEvaluationPreferences: { input: SetEvaluationPreferencesInput; output: EvaluationCalibrationProjection };
  inspectSeriesList: { input: { after: SeriesListCursor | null }; output: SeriesListProjection };
  createSeries: { input: CreateSeriesInput; output: SeriesCreationProjection };
  inspectSeries: { input: { seriesId: string }; output: SeriesProjection };
  previewSeriesMembershipChange: { input: PreviewSeriesMembershipChangeInput; output: SeriesMembershipPreviewProjection };
  changeSeriesMembership: { input: ChangeSeriesMembershipInput; output: SeriesMembershipChangeResultProjection };
  inspectBookSeries: { input: InspectBookSeriesInput; output: BookSeriesProjection };
  inspectSeriesMembers: { input: { seriesId: string; after: SeriesMembersCursor | null }; output: SeriesMembersPageProjection };
  inspectSeriesCandidates: { input: { seriesId: string; text: string; after: SeriesCandidatesCursor | null }; output: SeriesCandidatesProjection };
  /** Exactly one of a Series and a Book. */
  inspectSeriesHistory: { input: { seriesId: string | null; bookId: string | null; after: SeriesHistoryCursor | null }; output: SeriesHistoryPageProjection };
  proposeSeriesKnowledge: { input: ProposeSeriesKnowledgeInput; output: SeriesKnowledgeProposalProjection };
  inspectSeriesKnowledgeReview: { input: InspectSeriesKnowledgeReviewInput; output: SeriesKnowledgeReviewProjection };
  editSeriesKnowledgeCandidate: { input: EditSeriesKnowledgeCandidateInput; output: SeriesKnowledgeReviewProjection };
  promoteSeriesKnowledge: { input: PromoteSeriesKnowledgeInput; output: SeriesKnowledgePromotionProjection };
  inspectSeriesKnowledgeItems: { input: { seriesId: string; text: string; after: SeriesKnowledgeItemsCursor | null }; output: SeriesKnowledgeItemsPageProjection };
  inspectSeriesKnowledgeCandidates: { input: { seriesId: string; after: SeriesKnowledgeCandidatesCursor | null }; output: SeriesKnowledgeCandidatesPageProjection };
  inspectSeriesKnowledgeConflicts: { input: { seriesId: string; itemId: string; revisionId: string; after: number }; output: SeriesKnowledgeConflictsProjection };
  inspectSeriesKnowledgeRevisions: { input: { seriesId: string; itemId: string; before: number | null }; output: SeriesKnowledgeRevisionsProjection };
  // 书系检索排除 (Issue #64, S29b): the targets a Series may exclude, its revisions' further pages, the impact preview and the
  // commit of one revision; and 取消任务 of a Review Run an exclusion stopped.
  inspectSeriesExclusionTargets: { input: InspectSeriesExclusionTargetsInput; output: SeriesExclusionTargetsProjection };
  inspectSeriesExclusionHistory: { input: InspectSeriesExclusionHistoryInput; output: SeriesExclusionHistoryPageProjection };
  previewSeriesExclusion: { input: PreviewSeriesExclusionInput; output: SeriesExclusionPreviewProjection };
  recordSeriesExclusion: { input: RecordSeriesExclusionInput; output: SeriesExclusionResultProjection };
  cancelReviewRun: { input: CancelReviewRunInput; output: ReviewWorkspaceProjection };
  inspectDataVersion: { input: Record<string, never>; output: DataVersionProjection };
  /**
   * 导出数据库 (Issue #434, S86a): the destination the Save dialog answered becomes one preparation of the package, packed off
   * the request; answers at once with the export's activity (V2-UX-EXP-011).
   */
  prepareDatabaseExport: { input: { destination: string }; output: DatabaseExportActivityProjection };
  /** `按上述方式导出`: the one approval of one unchanged preparation, and the write it permits, carried out the same way. */
  approveDatabaseExport: { input: { preparationId: string }; output: DatabaseExportActivityProjection };
  inspectDatabaseExports: { input: Record<string, never>; output: DatabaseExportsProjection };
  /** 定期自动备份 (Issue #434, S86b): the switch and the backups kept. */
  inspectScheduledBackups: { input: Record<string, never>; output: ScheduledBackupsProjection };
  /** 用量 (Issue #936, S11c): read-only aggregate of the Runs already recorded; writes nothing and calls no Provider. */
  inspectUsage: { input: InspectUsageInput; output: UsageProjection };
  /** Turn the switch from the state the editor saw; turning it on backs up at once when none was made in the day before. */
  setScheduledBackup: { input: SetScheduledBackupInput; output: ScheduledBackupsProjection };
  /** 导入数据库 (Issue #434, S86c): the file the Open dialog answered, read and verified whole; nothing is taken from it. */
  inspectDatabaseImport: { input: { source: string }; output: DatabaseImportPreviewProjection };
  /** `替换本机全部数据`: the local data backed up, and the previewed package prepared to replace it at AI7's next start. */
  prepareDatabaseReplacement: { input: { previewId: string }; output: DatabaseReplacementsProjection };
  cancelDatabaseReplacement: { input: { replacementId: string }; output: DatabaseReplacementsProjection };
  inspectDatabaseReplacements: { input: Record<string, never>; output: DatabaseReplacementsProjection };
  /** `回退到替换前的数据`: the latest replacement's backup prepared to replace the local data, itself backed up first. */
  rollBackDatabaseReplacement: { input: { replacementId: string }; output: DatabaseReplacementsProjection };
  /** `只导入其中的图书` (Issue #434, S86d): the local data backed up, and the previewed package's new Books merging at the next start. */
  prepareDatabaseMerge: { input: { previewId: string }; output: DatabaseReplacementsProjection };
  /** 取消导出: stops the export under way until it begins putting the file in place. */
  cancelDatabaseExport: { input: { activityId: string }; output: DatabaseExportActivityProjection };
  /**
   * AI7 Apply for Change Suggestions (Issue #408). The batch form is 确认应用 on 审阅's confirmation
   * strip (Issue #417): one Effect over exactly the suggestions the strip named, all or none.
   */
  applyChangeSuggestion: { input: ApplyChangeSuggestionInput; output: ManuscriptApplyCommandProjection };
  applyChangeSuggestionBatch: { input: ApplyChangeSuggestionBatchInput; output: ManuscriptApplyCommandProjection };
  reverseAppliedChangeSuggestion: { input: ReverseAppliedChangeSuggestionInput; output: ManuscriptApplyCommandProjection };
  getManuscriptApplyOutcome: {
    input: { manuscriptId: string; branchId: string; clientEffectId: string };
    output: ManuscriptApplyOutcomeProjection;
  };
  /**
   * The dedicated Proposal review workspace (Issue #902): metadata pages, durable decision drafts, frozen batch drafts
   * and 记录提案决定 write no manuscript text; the four-state receipt and the reverse preparation dispatch nothing.
   */
  inspectProposalWorkspace: { input: ProposalWorkspaceInput; output: ProposalWorkspaceProjection };
  saveProposalDecisionDraft: { input: SaveProposalDecisionDraftInput; output: ProposalWorkspaceProjection };
  batchProposalDecisionDraft: { input: BatchProposalDecisionDraftInput; output: ProposalDraftBatchProjection };
  recordProposalDecision: { input: RecordProposalDecisionInput; output: ProposalWorkspaceProjection };
  inspectApplyReceipt: { input: InspectApplyReceiptInput; output: ApplyReceiptProjection };
  prepareReverseApply: { input: PrepareReverseApplyInput; output: ReverseApplyPreparationProjection };
  /**
   * 稿件冲突 of one 修改建议 (Issue #57, plan slice S22; ADR 0085). The read compares the three texts; the
   * Resolution Draft is saved on exactly the basis the editor saw; the conflict is left by 保留当前稿件,
   * 暂不处理 or 保存为新提案版本. None of them writes the manuscript.
   */
  inspectProposalConflict: { input: ProposalConflictBindingInput; output: ProposalConflictProjection };
  saveProposalConflictDraft: { input: SaveProposalConflictDraftInput; output: ProposalConflictDraftSaveProjection };
  resolveProposalConflict: { input: ResolveProposalConflictInput; output: ProposalConflictResolutionProjection };
  /**
   * 基于当前稿件重新生成建议 (Issue #842): one `conflict` unit's words to the Fast Interaction Role; the answer becomes the unit's
   * resolution in a new Resolution Draft, or is reported when it is the current or the old words. Nothing is applied.
   */
  regenerateProposalConflictUnit: { input: RegenerateProposalConflictUnitInput; output: ProposalConflictRegenerationProjection };
  getManuscriptRail: { input: { manuscriptId: string; branchId: string }; output: ManuscriptRailProjection };
  /**
   * Remember where the editor is, so the next entry into this Book returns there (V2-UX-RET-002).
   * The pair is the editor's own caret, in the window projection's vocabulary; what it answers is
   * only that the position was taken, because a remembered position settles nothing and a surface
   * has nothing to decide on it.
   */
  recordManuscriptEntryPosition: {
    input: { manuscriptId: string; branchId: string; blockId: string; grapheme: number };
    output: { state: 'recorded' };
  };
  listPriorWork: { input: Record<string, never>; output: ReadonlyArray<PriorWorkItemProjection> };
  getManuscriptWindowAt: {
    input: { manuscriptId: string; branchId: string; target: ManuscriptWindowTarget };
    output: ManuscriptWindowProjection;
  };
  getOutline: {
    input: { manuscriptId: string; branchId: string; cursor: string | null };
    output: OutlineProjection;
  };
  startSearch: {
    input: { manuscriptId: string; branchId: string; query: string };
    output: ServiceJobProjection;
  };
  pollServiceJob: { input: { jobId: string }; output: ServiceJobProjection };
  cancelServiceJob: { input: { jobId: string }; output: ServiceJobProjection };
  getSearchResults: {
    input: { searchId: string; cursor: string | null };
    output: SearchResultsProjection;
  };
  prepareReplacement: {
    input: { searchId: string; replacement: string; excludedMatchIds: ReadonlyArray<string> };
    output: ReplacementPreviewProjection;
  };
  freezeReplacement: {
    input: { previewId: string; excludedMatchIds: ReadonlyArray<string> };
    output: ReplacementPreviewProjection;
  };
  dismissReplacementPreview: {
    input: { previewId: string };
    output: ReplacementDismissalProjection;
  };
  startReplacementCommit: { input: { previewId: string }; output: ServiceJobProjection };
  commitReplacement: { input: { previewId: string }; output: ReplacementCommitProjection };
  saveMilestone: {
    input: SaveMilestoneInput;
    output: MilestoneProjection;
  };
  /**
   * ⑥ 交付物 · 发稿 (Issue #414, plan slice S65), Book-scoped. The read lists the Manuscript's milestones and
   * designations; 设为发稿版本 is one deterministic local command that answers with the 交付物 as they stand.
   */
  inspectDeliverables: { input: InspectDeliverablesInput; output: DeliverablesProjection };
  designatePublicationVersion: { input: DesignatePublicationVersionInput; output: PublicationDesignationProjection };
  /**
   * 交付 · 生产文档 (Issue #415, plan slice S66), Book-scoped. 从来源材料创建 makes a document of one house type
   * from one source-only material; 本书不做 / 恢复 records a decision about a type; 保存为版本 makes the
   * document's working text its next version. Each answers with the 交付物 as they stand.
   */
  inspectProductionDocuments: { input: InspectProductionDocumentsInput; output: ProductionDocumentsProjection };
  /** 图书交付包 (Issue #416, S67a): the condition table, the Manifest Preview and the frozen versions. A read. */
  inspectBookDeliveryPackage: { input: InspectBookDeliveryPackageInput; output: BookDeliveryPackageProjection };
  /** `准备图书交付包`: freeze the content the editor saw as the package's next version, or say it is unchanged. */
  prepareBookDeliveryPackage: { input: PrepareBookDeliveryPackageInput; output: BookDeliveryPackageResultProjection };
  /** `导出…` of one package version (Issue #416, S67b): the files it writes. A read. */
  reviewBookDeliveryPackageExport: { input: ReviewBookDeliveryPackageExportInput; output: BookDeliveryPackageExportReviewProjection };
  prepareBookDeliveryPackageArchiveExport: { input: PrepareBookDeliveryPackageArchiveInput; output: BookDeliveryPackageExportProjection };
  approveBookDeliveryPackageArchiveExport: { input: ApproveBookDeliveryPackageExportInput; output: ServiceJobProjection };
  cancelBookDeliveryPackageArchiveExport: { input: { jobId: string }; output: boolean };
  /** The folder the main process's dialog returned: one preparation per file, recorded together; nothing is written. */
  prepareBookDeliveryPackageExport: { input: PrepareBookDeliveryPackageExportInput; output: BookDeliveryPackageExportProjection };
  /** `按上述方式导出`: each file approved and written in turn, with its receipt; a file that stops it stops the rest. */
  approveBookDeliveryPackageExport: { input: ApproveBookDeliveryPackageExportInput; output: ServiceJobProjection };
  cancelBookDeliveryPackageExport: { input: { jobId: string }; output: boolean };
  inspectMaintenanceCase: { input: InspectMaintenanceCaseInput; output: MaintenanceCaseProjection };
  listMaintenanceCases: { input: ListMaintenanceCasesInput; output: MaintenanceCasePageProjection };
  recordMaintenanceCase: { input: RecordMaintenanceCaseInput; output: MaintenanceCaseResultProjection };
  appendMaintenanceCaseRevision: { input: AppendMaintenanceCaseRevisionInput; output: MaintenanceCaseResultProjection };
  saveMaintenanceErrata: { input: SaveMaintenanceErrataInput; output: MaintenanceCaseResultProjection };
  renameProductionDocument: { input: RenameProductionDocumentInput; output: ProductionDocumentResultProjection };
  saveProductionDocumentType: { input: SaveProductionDocumentTypeInput; output: ProductionDocumentTypesProjection };
  deleteProductionDocumentType: { input: DeleteProductionDocumentTypeInput; output: ProductionDocumentTypesProjection };
  reorderProductionDocumentTypes: { input: ReorderProductionDocumentTypesInput; output: ProductionDocumentTypesProjection };
  updateProductionDocumentMeta: { input: UpdateProductionDocumentMetaInput; output: ProductionDocumentsProjection };
  createProductionDocument: { input: CreateProductionDocumentInput; output: ProductionDocumentResultProjection };
  decideProductionDocumentType: { input: DecideProductionDocumentTypeInput; output: ProductionDocumentResultProjection };
  saveProductionDocumentVersion: { input: SaveProductionDocumentVersionInput; output: ProductionDocumentResultProjection };
  /**
   * 交付 (Issue #415, S66b): one Delivery Record of one exact version — the current text saved as the next version first
   * when it is none yet; the export follows on the export card.
   */
  recordProductionDocumentDelivery: { input: RecordProductionDocumentDeliveryInput; output: ProductionDocumentResultProjection };
  transitionProductionDocumentPhase: { input: TransitionProductionDocumentPhaseInput; output: ProductionDocumentResultProjection };
  /**
   * 待我处理 (Issue #424, plan slice S78): every Book's items in the four groups. It takes no input and names
   * no Book, because it reads across them; it is a read and records nothing.
   */
  inspectGlobalAttention: { input: Record<string, never>; output: GlobalAttentionProjection };
  controlAllTasks: { input: { action: 'pause' | 'resume' }; output: TaskOverviewProjection };
  inspectTaskOverview: { input: Record<string, never>; output: TaskOverviewProjection };
  reorderQueuedRun: { input: { runRecordId: string; position: number }; output: TaskOverviewProjection };
  startQuickTasks: { input: StartQuickTasksInput; output: { kind: TaskPlanKind; job: ServiceJobProjection; ruleVersionId: string | null } };
  /** The Book's 任务 panel (Issue #423, plan slice S77a): a read of that Book's Tasks in the three groups. */
  inspectBookTasks: { input: { bookId: string }; output: BookTasksProjection };
  /**
   * 就这段提问… (Issue #52, S17a): a dialogue Task on the exact selected words of that Book's manuscript and the editor's
   * question, its first answer started at once — only the selected words and the question are sent, and nothing changes.
   */
  askAboutSelection: { input: AskAboutSelectionInput & { bookId: string }; output: DialogueProjection };
  /** The dialogue as it stands: a read, the latest answer's fragments from `afterFragment` on. */
  inspectDialogue: { input: InspectDialogueInput & { bookId: string }; output: DialogueProjection };
  /** 停止回答: the answer in flight keeps only its complete fragments, labelled incomplete. */
  stopDialogueAnswer: { input: DialogueAttemptInput & { bookId: string; cancel?: boolean }; output: DialogueProjection };
  /** 继续回答: a new attempt going on from what a stopped or interrupted answer kept. */
  continueDialogueAnswer: { input: DialogueAttemptInput & { bookId: string }; output: DialogueProjection };
  /** 重新回答: a new attempt asking the same question about the same words again. */
  regenerateDialogueAnswer: { input: DialogueAttemptInput & { bookId: string }; output: DialogueProjection };
  /** 转为修改建议: an AI7-produced 修改建议 on the dialogue's selected words, from a completed answer; never applied. */
  convertDialogueToChangeSuggestion: { input: ConvertDialogueToChangeSuggestionInput & { bookId: string }; output: DialogueConversionProjection };
  /** The Book's Task Intent Drafts, or one with the Task 准备计划 would make of it (Issue #423, slice 7a): a read. */
  inspectTaskIntentDrafts: { input: InspectTaskIntentDraftsInput; output: TaskIntentDraftsProjection };
  /** 准备任务 in the composer, or 保存修改 on a draft: a new version; nothing is sent and no Task is made. */
  saveTaskIntentDraft: { input: SaveTaskIntentDraftInput; output: TaskIntentDraftProjection };
  /** 准备计划 on a draft: the existing preparation of the kind it resolves to, as one cooperative job; still needs 开始任务. */
  promoteTaskIntentDraft: { input: PromoteTaskIntentDraftInput; output: ServiceJobProjection };
  /** 转为任务意图草稿 (DIALOG-016): a draft from a completed dialogue answer, with its provenance; nothing is sent. */
  promoteAnswerToTaskIntentDraft: { input: PromoteAnswerToTaskIntentDraftInput; output: TaskIntentDraftProjection };
  /** The Agent 工作区 of a Book (Issue #90, slice 13a): whether it opens, what it may do, and the round it holds; a read. */
  inspectAgentWorkspace: { input: { bookId: string }; output: AgentWorkspaceProjection };
  /** One proposal round: a dialogue turn under the workspace fragment on the selected words; nothing changes. */
  proposeAgentWorkspaceChangeSet: { input: ProposeAgentWorkspaceChangeSetInput & { bookId: string }; output: AgentWorkspaceProjection };
  /** 提交为修改建议: the held change set becomes 修改建议 marks through the produced-mark path; never applied. */
  promoteAgentWorkspaceProposals: { input: AgentWorkspaceProposalSetInput & { bookId: string }; output: AgentWorkspacePromotionProjection };
  /** 放弃这组提议: the held round is forgotten; nothing is recorded. */
  discardAgentWorkspaceProposals: { input: AgentWorkspaceProposalSetInput & { bookId: string }; output: AgentWorkspaceProjection };
  /** Whether 润色这段 and 基于当前稿件重新生成建议 can be asked for the Book under this launch (Issue #842): a read. */
  inspectFastInteractionRoutes: { input: { bookId: string }; output: FastInteractionRoutesProjection };
  /** 润色这段 (Issue #842): the selected words to the Fast Interaction Role; its answer becomes open 修改建议, never applied. */
  polishSelection: { input: PolishSelectionInput & { bookId: string }; output: EditorialPolishProjection };
  /** A 润色这段 or 基于当前稿件重新生成建议 request of the Book, read again until it settles (Issue #842): a read. */
  inspectFastInteractionRequest: { input: InspectFastInteractionRequestInput & { bookId: string }; output: FastInteractionRequestProjection };
  /** 🔒 锁定 (Issue #1412): a manuscript branch's AI edit locks, a read. */
  inspectAiEditLocks: { input: InspectAiEditLocksInput; output: AiEditLocksProjection };
  /** Lock or unlock blocks or sections against the lock set the editor saw (Issue #1412). */
  setAiEditLocks: { input: SetAiEditLocksInput; output: AiEditLocksProjection };
  /** 就选中部分让 AI 修改 (Issue #1412): checked at once, answered beside the loop, applied only inside its frozen scope. */
  startScopedAiEdit: { input: StartScopedAiEditInput & { bookId: string }; output: ScopedAiEditProjection };
  /** A scoped AI edit of the Book, read again until it settles (Issue #1412): a read. */
  inspectScopedAiEdit: { input: InspectScopedAiEditInput & { bookId: string }; output: ScopedAiEditProjection };
  /** 全部替换 as durable per-occurrence revision cards (Issue #1411): each occurrence an applied 修改建议. */
  commitReplacementRevisions: { input: CommitReplacementRevisionsInput; output: ReplacementRevisionsProjection };
  reviewManuscriptExport: { input: ReviewManuscriptExportInput; output: ManuscriptExportReviewProjection };
  prepareManuscriptExport: { input: PrepareManuscriptExportInput; output: ManuscriptExportPreparationProjection };
  approveManuscriptExport: { input: ApproveManuscriptExportInput; output: ManuscriptExportReceiptProjection };
  inspectManuscriptExportReceipt: { input: InspectManuscriptExportReceiptInput; output: ManuscriptExportReceiptProjection };
  /** Main-only (Issue #500, S64b): stage a prepared PDF's page for the main process to print before it approves. */
  stageManuscriptExport: { input: StageManuscriptExportInput; output: ManuscriptExportStageProjection };
  undoManuscript: {
    input: { manuscriptId: string; branchId: string; expectedWorkingDigest: string };
    output: DurableHistoryProjection;
  };
  redoManuscript: {
    input: { manuscriptId: string; branchId: string; expectedWorkingDigest: string };
    output: DurableHistoryProjection;
  };
  resolveBookWorkbenchRoute: {
    input: BookWorkbenchRoute;
    output: ResolvedBookWorkbenchRoute;
  };
  getHistoricalRevision: {
    input: { revisionId: string; cursor: string | null };
    output: HistoricalRevisionProjection;
  };
  selectFastRoleModel: { input: FastModelSelectionInput; output: void };
  selectMainRoleModel: { input: FastModelSelectionInput; output: void };
  selectBothRoleModels: { input: FastModelSelectionInput; output: void };
  refreshModelServiceModels: { input: { route: ModelServiceRouteId }; output: ModelDiscoveryResult };
  testModelServiceConnection: { input: FastModelSelectionInput; output: ModelConnectionTestStatus };
  getModelServiceStoredState: {
    input: Record<string, never>;
    output: ModelServiceStoredStateProjection;
  };
  saveModelServiceProxy: {
    input: SaveModelServiceProxyInput;
    output: ModelServiceProxySetting;
  };
  /**
   * Save one route's connection (Issue #811): `credentialReference` is `null` for a route that has none yet, and the store
   * mints a fresh one; an existing connection keeps its own. The first connection saved becomes the route in use.
   */
  saveModelServiceConnection: {
    input: {
      route: ModelServiceRouteId;
      connectionName: string;
      credentialReference: string | null;
      credentialOperationState: 'ready' | 'needs-attention';
    };
    output: ModelServiceConnectionProjection;
  };
  /** Choose the route new Tasks use (Issue #811); Runs under way keep the binding their plan froze. */
  selectModelServiceRoute: {
    input: { route: ModelServiceRouteId };
    output: ModelServiceStoredStateProjection;
  };
  setModelServiceCredentialState: {
    input: {
      credentialReference: string;
      credentialOperationState: ModelCredentialOperationState;
    };
    output: ModelServiceConnectionProjection;
  };
  shutdown: { input: Record<string, never>; output: { state: 'stopping' } };
}

export type ServiceOperation = keyof ServiceOperationMap;

export type ServiceRequest = {
  [Operation in ServiceOperation]: {
    id: string;
    op: Operation;
    input: ServiceOperationMap[Operation]['input'];
  };
}[ServiceOperation];

export type ServiceSuccessResponse = {
  [Operation in ServiceOperation]: {
    id: string;
    ok: true;
    op: Operation;
    result: ServiceOperationMap[Operation]['output'];
  };
}[ServiceOperation];

export interface ServiceFailureResponse {
  id: string;
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ServiceResponse = ServiceSuccessResponse | ServiceFailureResponse;

export type PickerStageResult =
  | { status: 'cancelled' }
  | { status: 'staged'; staged: StagedImportProjection };

export type PickerReselectResult =
  | { status: 'cancelled' }
  | { status: 'reselected'; continuation: ContinueImportProjection };

export interface RendererApi extends GlobalAgentRendererApi, HouseWordListApi {
  selectSearchBackend(input: SearchBackendSelectionInput): Promise<ModelServiceSettingsProjection>;
  probeSearchBackend(input: { backendId: string; candidateId?: SearchCandidateId }): Promise<SearchBackendProbeProjection>;
  saveSearchBackendCredential(input: { backendId: string; secret: string } | { backendId: string; reuseModelCredential: true }): Promise<ModelServiceSettingsProjection>;
  removeSearchBackendCredential(input: { backendId: string }): Promise<ModelServiceSettingsProjection>;
  readonly platform: 'win32' | 'darwin';
  getStartup(): Promise<StartupProjection>;
  getRecoveryComparison(input: ServiceOperationMap['getRecoveryComparison']['input']): Promise<RecoveryComparisonProjection>;
  viewRecoveryCandidate(input: ServiceOperationMap['viewRecoveryCandidate']['input']): Promise<RecoveryWindowProjection>;
  deferRecovery(input: ServiceOperationMap['deferRecovery']['input']): Promise<RecoveryDeferralProjection>;
  restoreRecovery(input: Omit<ServiceOperationMap['restoreRecovery']['input'], 'restorationId'>): Promise<RecoveryRestorationProjection>;
  getImportStartup(): Promise<ImportStartupProjection>;
  selectAndStageManuscript(): Promise<PickerStageResult>;
  stageDroppedManuscript(file: File): Promise<PickerStageResult>;
  importBundledSampleBook(): Promise<PickerStageResult>;
  continueImportDraft(input: ServiceOperationMap['continueImportDraft']['input']): Promise<ContinueImportProjection>;
  reselectImportDraft(input: {
    draftId: string;
    expectedDraftVersion: number;
  }): Promise<PickerReselectResult>;
  abandonImportDraft(input: ServiceOperationMap['abandonImportDraft']['input'] & { preserveBookRoute?: true }): Promise<ImportStartupProjection>;
  prepareBookCreation(input: ServiceOperationMap['prepareBookCreation']['input']): Promise<BookCreationReviewProjection>;
  commitBookCreation(input: ServiceOperationMap['commitBookCreation']['input']): Promise<BookCreationCommitProjection>;
  getBookOverview(input: ServiceOperationMap['getBookOverview']['input']): Promise<BookWorkOverviewProjection>;
  inspectEditorialWorkspaceProfile(): Promise<EditorialWorkspaceProfileProjection>;
  installEditorialWorkspaceProfile(): Promise<EditorialWorkspaceProfileProjection>;
  enableEditorialWorkspaceProfile(): Promise<EditorialWorkspaceProfileProjection>;
  inspectTaskAuthorization(): Promise<TaskAuthorizationProjection>;
  /** The Task Drawer's plan of one Task of the Book the window is showing (Issue #418). */
  inspectTaskPlan(input: Omit<InspectTaskPlanInput, 'bookId'>): Promise<TaskPlanProjection>;
  getTaskPlanPage(input: Omit<ServiceOperationMap['getTaskPlanPage']['input'], 'bookId'>): Promise<ServiceOperationMap['getTaskPlanPage']['output']>;
  resolveUnconfirmedOutcomes(input: Omit<InspectTaskPlanInput, 'bookId'> & { digest: string }): Promise<TaskPlanProjection>;
  inspectForegroundExecutionBoundary(input: Omit<
    ServiceOperationMap['inspectForegroundExecutionBoundary']['input'],
    'bookId'
  >): Promise<ForegroundExecutionBoundaryProjection>;
  prepareTaskAuthorization(input: { goal: typeof J03_TASK_GOAL }): Promise<ServiceWireOutput<ServiceJobProjection>>;
  authorizeTaskAuthorization(input: {
    taskIntentId: string;
    planEnvelopeDigest: string;
  }): Promise<TaskAuthorizationProjection>;
  getBaselineAnalysisPage(input: Omit<ServiceOperationMap['getBaselineAnalysisPage']['input'], 'bookId'>): Promise<ServiceOperationMap['getBaselineAnalysisPage']['output']>;
  getCoverageManifestUnits(input: Omit<ServiceOperationMap['getCoverageManifestUnits']['input'], 'bookId'>): Promise<ServiceOperationMap['getCoverageManifestUnits']['output']>;
  getAnalysisRevisionUnits(input: Omit<ServiceOperationMap['getAnalysisRevisionUnits']['input'], 'bookId'>): Promise<ServiceOperationMap['getAnalysisRevisionUnits']['output']>;
  getAnalysisRevisionOverview(input: Omit<ServiceOperationMap['getAnalysisRevisionOverview']['input'], 'bookId'>): Promise<ServiceOperationMap['getAnalysisRevisionOverview']['output']>;
  getAnalysisRunReportRows(input: Omit<ServiceOperationMap['getAnalysisRunReportRows']['input'], 'bookId'>): Promise<ServiceOperationMap['getAnalysisRunReportRows']['output']>;
  getBaselineAnalysisRangePlan(input: Omit<ServiceOperationMap['getBaselineAnalysisRangePlan']['input'], 'bookId'>): Promise<ServiceOperationMap['getBaselineAnalysisRangePlan']['output']>;
  inspectBaselineAnalysis(input?: { revisionId: string | null }): Promise<BaselineAnalysisWireProjection>;
  inspectBookFindings(input?: { offset: number }): Promise<BookFindingsProjection>;
  inspectParagraphAnalysis(input: { manuscriptId: string; blockId: string; radius: number }): Promise<ParagraphAnalysisProjection>;
  prepareBaselineAnalysis(input: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; reconfirm: boolean; redoOf?: string | null }): Promise<ServiceWireOutput<ServiceJobProjection>>;
  /**
   * The Task Drawer bar's 开始任务 for the analysis (Issue #420, S74a): records the Run Authorization and the
   * Run Record and hands the Run to the execution owner's governor, which admits it at once while a place is
   * free, or has it wait for one — `queued`, 等待运行名额 — and admits it in its turn (Issue #49, S14).
   */
  authorizeBaselineAnalysis(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<BaselineAnalysisWireProjection>;
  startBaselineAnalysisWhenOnline(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<BaselineAnalysisWireProjection>;
  cancelWaitingBaselineAnalysis(input: { taskIntentId: string }): Promise<BaselineAnalysisWireProjection>;
  /** 空闲时处理 for every kind that dispatches (Issue #1089), within the route's Book. */
  startTaskWhenIdle(input: Omit<ServiceOperationMap['startTaskWhenIdle']['input'], 'bookId'>): Promise<TaskPlanProjection>;
  /** 联网后开始任务 and its 取消 for every other kind with a plan (Issue #760, S74c), within the route's Book. */
  startTaskWhenOnline(input: Omit<StartTaskWhenOnlineInput, 'bookId'>): Promise<TaskPlanProjection>;
  cancelWaitingTask(input: Omit<CancelWaitingTaskInput, 'bookId'>): Promise<TaskPlanProjection>;
  cancelBaselineAnalysisRun(input: { taskIntentId: string }): Promise<BaselineAnalysisWireProjection>;
  pauseBaselineAnalysisRun(input: { taskIntentId: string }): Promise<BaselineAnalysisWireProjection>;
  controlTaskRun(input: Omit<ControlTaskRunInput, 'bookId'>): Promise<TaskPlanProjection>;
  editTaskPlan(input: Omit<EditTaskPlanInput, 'bookId'>): Promise<TaskPlanProjection>;
  redoTaskPlan(input: Pick<ControlTaskRunInput, 'kind' | 'ref'>): Promise<ServiceWireOutput<ServiceJobProjection>>;
  quickStartReviewRun(input: Omit<ServiceOperationMap['quickStartReviewRun']['input'], 'bookId'>): Promise<ServiceOperationMap['quickStartReviewRun']['output']>;
  resumeBaselineAnalysisRun(input: { taskIntentId: string }): Promise<BaselineAnalysisWireProjection>;
  /** 更新计划 (Issue #419): the next plan version of the Book's baseline analysis Task, as the editor left it. */
  editBaselineAnalysisPlan(input: {
    taskIntentId: string;
    planEnvelopeDigest: string;
    removedSteps: ReadonlyArray<string>;
    disallowedAdaptations: ReadonlyArray<string>;
    askFirstAdaptations?: ReadonlyArray<string>;
    runBudgetCeiling?: { kind: 'tokens'; maxTotalTokens: number } | null;
  }): Promise<BaselineAnalysisWireProjection>;
  /** 提交回答 (Issue #422, S76d): the editor's answer to a question the Book's baseline analysis Run asked. */
  answerBaselineAnalysisClarification(input: {
    taskIntentId: string;
    requestId: string;
    optionId: ClarificationOptionId;
    note: string | null;
  }): Promise<BaselineAnalysisWireProjection>;
  runReconnectPreflight(): Promise<ReconnectPreflightProjection>;
  /** 快速开始 of the Book the window is showing, after 先看计划's preparation (Issue #421). */
  quickStartBaselineAnalysis(input: { taskIntentId: string; planEnvelopeDigest: string; ruleVersionId: string }): Promise<ServiceWireOutput<QuickStartBaselineAnalysisResult>>;
  setDefaultExecutionRule(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<DefaultExecutionRuleProjection>;
  inspectDefaultExecutionRules(): Promise<DefaultExecutionRulesProjection>;
  deactivateDefaultExecutionRule(input: { ruleId: string }): Promise<DefaultExecutionRuleProjection>;
  /** 后台分析登记 of the Book the window is showing (Issue #95, S39). */
  inspectBackgroundAnalysisEnrollment(input?: { kind?: string }): Promise<BackgroundAnalysisEnrollmentProjection>;
  enrollBackgroundAnalysis(input: Omit<ServiceOperationMap['enrollBackgroundAnalysis']['input'], 'bookId'>): Promise<BackgroundAnalysisEnrollmentProjection>;
  revokeBackgroundAnalysisEnrollment(input: { enrollmentId: string }): Promise<BackgroundAnalysisEnrollmentProjection>;
  holdBackgroundAnalysisEnrollment(input: { enrollmentId: string; hold: 'pause' | 'resume' }): Promise<BackgroundAnalysisEnrollmentProjection>;
  /** 知识库 › 审阅规范文件 (Issue #427, S79a): names no Book; it reads every Book's Review Runs to say who used which version. */
  inspectReviewGuidelines(input?: { page?: ReviewGuidelinesPage }): Promise<ReviewGuidelinesProjection>;
  /** 导入新版本: the native picker, then the file's clauses as the next version would read them; `null` when the picker was cancelled. */
  previewReviewGuidelineVersion(input: { documentId: string; previewId?: string; clausePage?: number }): Promise<ReviewGuidelinePreviewProjection | null>;
  importReviewGuidelineVersion(input: { previewId: string }): Promise<ReviewGuidelinesProjection>;
  /** 知识库 › 范例 (Issue #427, S79b): names no Book; it reads the published Books' delivered documents, a page at a time. */
  previewImportedExemplar(): Promise<ImportedExemplarPreview | null>;
  importEarlierExemplar(input: ImportedExemplarInput): Promise<ExemplarBookProjection>;
  decideImportedExemplar(input: ImportedExemplarDecisionInput): Promise<ExemplarBookProjection>;
  inspectExemplars(input?: { after: ExemplarBookCursor | null }): Promise<ExemplarsProjection>;
  /** 知识库 › 范例 › 归入范例 (Issue #429): names its Book; the window's route is not involved. */
  admitReadersReportExemplar(input: AdmitReadersReportExemplarInput): Promise<ExemplarBookProjection>;
  /** 知识库 › 工序与规则's expert 工序 (Issue #427, S79d): names no Book. */
  procedureLibrary(input: import('./protocol/procedures.js').ProcedureLibraryCommand): Promise<import('./protocol/procedures.js').ProcedureLibraryProjection>;
  inspectKnowledgeProcedures(): Promise<KnowledgeProceduresProjection>;
  /** 知识库 › 工序与规则's 可复用工序 and 开发建议 (Issue #65, S30; ADR 0087): names no Book. */
  inspectCapturedProcedures(): Promise<CapturedProceduresProjection>;
  /** `{ kind }` opens the platform picker and discloses what it chose, keeping nothing; `{ keep }` keeps that disclosure. */
  importSkillPackage(input?: { kind: 'zip' | 'directory' } | { keep: string }): Promise<ImportedSkillImportProjection | null>;
  validateImportedSkill(input: { revisionId: string }): Promise<ImportedSkillRevisionProjection>;
  installImportedSkill(input: { revisionId: string; previewDigest: string }): Promise<ImportedSkillRevisionProjection>;
  enableImportedSkill(input: { revisionId: string; bookId: string; previewDigest: string }): Promise<ImportedSkillRevisionProjection>;
  inspectImportedSkills(input: { revisionId: string | null; before: string | null }): Promise<ImportedSkillsProjection>;
  /** 检查更新（从文件）…: the picker opens in main, for the Skill named; `keep` keeps the disclosed package as a candidate. */
  checkImportedSkillUpdate(input: { skillId: string; kind: 'zip' | 'directory' } | { skillId: string; keep: string }): Promise<ImportedSkillUpdateCheckProjection | null>;
  inspectImportedSkillUpdate(input: { candidateId: string }): Promise<ImportedSkillUpdateCandidateProjection>;
  adoptImportedSkillUpdate(input: { candidateId: string; reviewDigest: string; acceptItems: readonly string[]; upstreamPaths: readonly string[] }): Promise<ImportedSkillUpdateCandidateProjection>;
  dismissImportedSkillUpdate(input: { candidateId: string }): Promise<ImportedSkillUpdateCandidateProjection>;
  createImportedSkillUpdateRule(input: { skillId: string; confirmation: string }): Promise<ImportedSkillUpdateRuleProjection>;
  revokeImportedSkillUpdateRule(input: { skillId: string }): Promise<ImportedSkillUpdateRuleProjection>;
  rollbackImportedSkill(input: { skillId: string; revisionId: string }): Promise<ImportedSkillRevisionProjection>;
  recommendProcedures(input: Omit<ProcedureRecommendationInput, 'bookId'>): Promise<ProcedureRecommendationProjection>;
  inspectCapturedProcedure(input: { procedureId: string; before: number | null }): Promise<CapturedProcedureProjection>;
  inspectDeveloperProposal(input: { proposalId: string; before: number | null }): Promise<DeveloperProposalProjection>;
  /** The current Book's finished Review Run as a capture's source (ADR 0087 §2). */
  inspectProcedureCapture(input: { reviewRunId: string }): Promise<ProcedureCaptureProjection>;
  saveCapturedProcedure(input: Omit<SaveCapturedProcedureInput, 'bookId'>): Promise<CapturedProcedureProjection>;
  previewCapturedProcedureValidation(input: { versionId: string }): Promise<CapturedProcedureValidationProjection>;
  enableCapturedProcedure(input: { versionId: string; previewDigest: string }): Promise<CapturedProcedureProjection>;
  previewCapturedProcedureStop(input: { procedureId: string; versionId: string | null }): Promise<CapturedProcedureStopPreviewProjection>;
  stopCapturedProcedure(input: { procedureId: string; versionId: string | null; previewDigest: string }): Promise<CapturedProcedureProjection>;
  /**
   * For the current Book's 新建审阅 sheet: the latest eligible version, or the exact eligible one chosen (`versionId`). With
   * `scope: 'selection'` (Issue #423, S77 deferred item a) its steps are resolved for the paragraphs 就这段发起任务… hands over.
   */
  inspectCapturedProcedureRun(input: { procedureId: string; versionId?: string | null; scope?: CapturedProcedureScopeSlot | null }): Promise<CapturedProcedureRunProjection>;
  /**
   * The house's enabled Captured Procedures as each applies to the route's Book (Issue #66, S31b): the sheet's 按已保存的工序 —
   * or, with `scope: 'selection'`, as each applies to a 当前选区 of it, for the selection menu (Issue #423, S77 deferred item a).
   */
  inspectCapturedProcedureApplicability(input?: { scope?: CapturedProcedureScopeSlot | null }): Promise<CapturedProcedureApplicabilityProjection>;
  /** 知识库's dimensions (`forBook: false`), or the current Book's 自定义 tab (`forBook: true`) (Issue #922). */
  inspectCustomAnalysisDimensions(input: { forBook: boolean }): Promise<CustomAnalysisDimensionsProjection>;
  saveCustomAnalysisDimension(input: SaveCustomAnalysisDimensionInput): Promise<CustomAnalysisDimensionsProjection>;
  enableCustomAnalysisDimension(input: { versionId: string }): Promise<CustomAnalysisDimensionsProjection>;
  stopCustomAnalysisDimension(input: { versionId: string }): Promise<CustomAnalysisDimensionsProjection>;
  /** The current Book's Task of one dimension; the window's route names the Book. */
  prepareCustomAnalysis(input: Omit<PrepareCustomAnalysisInput, 'bookId'>): Promise<{ taskIntentId: string; dimensions: CustomAnalysisDimensionsProjection }>;
  saveDeveloperProposal(input: SaveDeveloperProposalInput): Promise<DeveloperProposalProjection>;
  /** 导出为文件…: the platform Save dialog, then the file; nothing is written or recorded when the dialog is cancelled. */
  saveDeveloperProposalFile(input: { proposalVersionId: string }): Promise<SaveDeveloperProposalFileOutcome>;
  /** 知识库 › 资料库 (Issue #427, S79c): names no Book; an item names the Book it was attributed to. A page at a time. */
  inspectLibraryMaterials(input?: { after: LibraryMaterialCursor | null }): Promise<LibraryMaterialsProjection>;
  /** One 资料库 item, by its identity. */
  inspectLibraryMaterial(input: { materialId: string }): Promise<LibraryMaterialProjection>;
  /** 来源与证据: a page of the Book's retained external sources, newest first; read-only. */
  inspectResearchEvidence(input: { bookId: string; after?: number | null; staleAfterDays?: number | null; taskIntentId?: string; reviewFindingId?: string }): Promise<ResearchEvidenceBookProjection>;
  /** 保存为来源材料: the editor's explicit keep of one retained source as a 资料库 item; publishes and exports nothing. */
  saveEvidenceAsMaterial(input: { bookId: string; evidenceId: string; title?: string | null }): Promise<ServiceOperationMap['saveEvidenceAsMaterial']['output']>;
  inspectFactualVerification(input: InspectFactualVerificationInput): Promise<FactualVerificationLensProjection>;
  inspectEvidenceWorkspace(input: InspectEvidenceWorkspaceInput): Promise<EvidenceWorkspaceProjection>;
  recordVerificationReviewDecision(input: RecordVerificationReviewDecisionInput): Promise<VerificationReviewDecisionRecordedProjection>;
  prepareCorrectionProposal(input: PrepareCorrectionProposalInput): Promise<CorrectionProposalDraftProjection>;
  saveCorrectionProposal(input: SaveCorrectionProposalInput): Promise<CorrectionProposalSavedProjection>;
  readLibraryDecisionReason(input: ServiceOperationMap['readLibraryDecisionReason']['input']): Promise<LibraryDecisionReasonPage>;
  /** 查看分段: one page of the item's segments, read-only. */
  inspectLibraryMaterialSegments(input: ServiceOperationMap['inspectLibraryMaterialSegments']['input']): Promise<MaterialSegmentsPageProjection>;
  /** 构建相似索引: made on this machine; nothing is sent. */
  buildMaterialVectors(input: ServiceOperationMap['buildMaterialVectors']['input']): Promise<LibraryMaterialProjection>;
  /** 相似段落检索 in 查看索引: read-only. */
  queryMaterialVectors(input: ServiceOperationMap['queryMaterialVectors']['input']): Promise<MaterialVectorSearchProjection>;
  /** 生成来源译文: refused unless the selected policy's rule names it. */
  requestMaterialTranslation(input: ServiceOperationMap['requestMaterialTranslation']['input']): Promise<LibraryMaterialProjection>;
  searchReferableMaterials(input: ServiceOperationMap['searchReferableMaterials']['input']): Promise<ServiceOperationMap['searchReferableMaterials']['output']>;
  /** 放入资料…: the native picker, then the file as it would arrive; `null` when the picker was cancelled. */
  previewLibraryMaterial(): Promise<LibraryMaterialPreviewProjection | null>;
  addLibraryMaterial(input: { previewId: string; title: string; kind: LibraryMaterialKind }): Promise<LibraryMaterialProjection>;
  decideLibraryMaterial(input: { materialId: string; expectedDecisions: number; decision: LibraryMaterialDecisionInput }): Promise<LibraryMaterialProjection>;
  /** 知识库 › 评估方案 (Issue #429, S81a): names no Book. */
  inspectEvaluationProfiles(input?: { before: number | null }): Promise<EvaluationProfilesProjection>;
  saveEvaluationProfile(input: SaveEvaluationProfileInput): Promise<EvaluationProfilesProjection>;
  /** ②C 评估 of the Book the window is showing (Issue #429, S81a); the renderer never names the Book. */
  inspectEvaluation(input: { recordId: string | null; recordsBefore?: number | null }): Promise<EvaluationWorkspaceProjection>;
  /** Begins the next version — from AI7's latest 初评 when `fromInitial` (Issue #429, S81b1). */
  startEvaluation(input?: StartEvaluationInput): Promise<EvaluationWorkspaceProjection>;
  saveEvaluation(input: { recordId: string; expectedEntries: number; content: EvaluationContent; finalize: boolean }): Promise<EvaluationWorkspaceProjection>;
  /** 准备 AI7 初评: an `initial-evaluation-preparation` job, followed with `pollServiceJob`; its plan opens in the Task Drawer. */
  prepareInitialEvaluation(input?: { materialIds?: ReadonlyArray<string>; seriesId?: string | null }): Promise<ServiceWireOutput<ServiceJobProjection>>;
  /** The Task Drawer bar's 开始任务 for AI7's 初评. */
  authorizeInitialEvaluation(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<EvaluationWorkspaceProjection>;
  /** 起草审稿意见 (Issue #429, S81c): a `readers-report-preparation` job; its plan opens in the Task Drawer. */
  prepareReadersReport(input: { template: ReadersReportTemplate; materialIds?: ReadonlyArray<string> }): Promise<ServiceWireOutput<ServiceJobProjection>>;
  /** The Task Drawer bar's 开始任务 for 审稿意见. */
  authorizeReadersReport(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<EvaluationWorkspaceProjection>;
  /** 打开草稿: the drafted result made the template's draft document; the renderer then opens it on the editing surface. */
  createReadersReportDraft(input: { revisionId: string }): Promise<EvaluationWorkspaceProjection>;
  /** 按我的评分重写评语 (Issue #429, S81b2): an `evaluation-rewrite-preparation` job over one version; its plan opens in the Task Drawer. */
  prepareEvaluationRewrite(input: { recordId: string }): Promise<ServiceWireOutput<ServiceJobProjection>>;
  /** The Task Drawer bar's 开始任务 for 按我的评分重写评语. */
  authorizeEvaluationRewrite(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<EvaluationWorkspaceProjection>;
  /** 采用 or 放弃 one rewrite of the version on show. */
  decideEvaluationRewrite(input: { revisionId: string; decision: EvaluationRewriteDecision }): Promise<EvaluationWorkspaceProjection>;
  /** 新建文档 · 写作任务 of the Book the window is showing (Issue #432, S84a); the renderer never names the Book. */
  inspectWritingTask(): Promise<WritingTaskProjection>;
  /** 先看计划 of a writing Task: a `writing-preparation` job; its plan opens in the Task Drawer. */
  prepareWritingTask(input: { typeId: string; audience: string; channel: string; requirements: string | null; materialIds?: ReadonlyArray<string> }): Promise<ServiceWireOutput<ServiceJobProjection>>;
  /** The Task Drawer bar's 开始任务 for a writing Task. */
  authorizeWritingTask(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<WritingTaskProjection>;
  quickStartWritingTask(input: { taskIntentId: string; planEnvelopeDigest: string; ruleVersionId: string }): Promise<QuickStartWritingTaskResult>;
  /** 打开草稿: the drafted result made the type's document in its 起草 phase; the renderer then opens it on the editing surface. */
  createWritingDraft(input: { revisionId: string; title?: string }): Promise<WritingDraftCreatedProjection>;
  /** ②A 分析反馈 of the Book the window is showing (Issue #94, S38); the renderer never names the Book. */
  inspectAnalysisFeedback(input: { revisionId: string }): Promise<AnalysisFeedbackProjection>;
  recordAnalysisFeedback(input: RecordAnalysisFeedbackInput): Promise<AnalysisFeedbackProjection>;
  /**
   * 审阅 of the Book the window is showing (Issue #417). Inspecting without a Run opens the latest; a
   * running Run is followed by inspecting it again, and its executing category carries its progress.
   */
  inspectReviewWorkspace(input?: Omit<InspectReviewWorkspaceInput, 'bookId'>): Promise<ReviewWorkspaceProjection>;
  /** 先看计划: a `review-run-preparation` job, followed with `pollServiceJob` and stopped with `cancelServiceJob`. */
  prepareReviewRun(input: Omit<PrepareReviewRunInput, 'bookId'>): Promise<ServiceWireOutput<ServiceJobProjection>>;
  /**
   * The one approval — the Task Drawer bar's 开始任务 since Issue #420 (S74a); the Run is already being driven
   * when the answer arrives. Refused with `EXECUTION_BUSY`, before anything is written, while other Runs hold
   * every place of the governor (Issue #49, S14).
   */
  authorizeReviewRun(input: Omit<AuthorizeReviewRunInput, 'bookId'>): Promise<ReviewWorkspaceProjection>;
  continueReviewRun(input: Omit<ContinueReviewRunInput, 'bookId'>): Promise<ReviewWorkspaceProjection>;
  /** 忽略并说明; every other decision on a finding is the mark and Apply operations' with its `markId`. */
  recordReviewFindingDisposition(input: Omit<RecordReviewFindingDispositionInput, 'bookId'>): Promise<ReviewWorkspaceProjection>;
  generateReviewReport(input: Omit<GenerateReviewReportInput, 'bookId'>): Promise<ReviewWorkspaceProjection>;
  /** 查看任务 on a Mark Card: the Run a `review-category` mark came from, `null` for any other mark. */
  inspectReviewFindingOfMark(input: InspectReviewFindingOfMarkRendererInput): Promise<ReviewFindingOfMarkProjection | null>;
  listBooks(input: ServiceOperationMap['listBooks']['input']): Promise<BookSummaryPageProjection>;
  /** `保存人员` on a Book's 工作概览 (Issue #431, S83): the Book the window shows or is about to. */
  updateBookPeople(input: UpdateBookPeopleInput): Promise<BookPeopleResultProjection>;
  prepareNewBookReview(input: ServiceOperationMap['prepareNewBookReview']['input']): Promise<ReviewBeforeImportProjection>;
  commitNewBookImport(input: CommitNewBookRendererInput): Promise<ManuscriptImportCommitProjection>;
  prepareSourceImportReview(input: ServiceOperationMap['prepareSourceImportReview']['input']): Promise<ReviewBeforeSourceImportProjection>;
  commitSourceImport(input: CommitSourceImportRendererInput): Promise<SourceImportCommitProjection>;
  prepareManuscriptReimport(input: ServiceOperationMap['prepareManuscriptReimport']['input']): Promise<ServiceWireOutput<ServiceJobProjection>>;
  getReimportMappingPage(input: ServiceOperationMap['getReimportMappingPage']['input']): Promise<ReimportMappingPageProjection>;
  getReimportLineageSourceVersionPage(input: ServiceOperationMap['getReimportLineageSourceVersionPage']['input']): Promise<ReimportLineageSourceVersionPageProjection>;
  acceptReimportDegradation(input: ServiceOperationMap['acceptReimportDegradation']['input']): Promise<ReviewBeforeManuscriptReimportProjection>;
  resolveReimportMapping(input: ServiceOperationMap['resolveReimportMapping']['input']): Promise<ServiceWireOutput<ServiceJobProjection>>;
  commitManuscriptReimport(input: CommitManuscriptReimportRendererInput): Promise<ServiceWireOutput<ServiceJobProjection>>;
  acknowledgeImportCompletion(input: ServiceOperationMap['acknowledgeImportCompletion']['input']): Promise<{ state: 'acknowledged' }>;
  getManuscriptWindow(input: ServiceOperationMap['getManuscriptWindow']['input']): Promise<ManuscriptWindowProjection>;
  readManuscriptImageChunk(input: ServiceOperationMap['readManuscriptImageChunk']['input']): Promise<ServiceOperationMap['readManuscriptImageChunk']['output']>;
  flushJournalEdit(input: JournalEditInput): Promise<JournalAcknowledgement>;
  createEditorialMark(input: CreateEditorialMarkInput): Promise<EditorialMarkCommandProjection>;
  getEditorialMarkCard(input: ServiceOperationMap['getEditorialMarkCard']['input']): Promise<EditorialMarkCardProjection>;
  updateEditorialMark(input: UpdateEditorialMarkInput): Promise<EditorialMarkCommandProjection>;
  recordChangeSuggestionDecision(input: RecordChangeSuggestionDecisionInput): Promise<EditorialMarkCommandProjection>;
  recordProposalDecisionReason(input: RecordProposalDecisionReasonInput): Promise<EditorialMarkCommandProjection>;
  recordProposalDecisionFeedback(input: RecordProposalDecisionFeedbackInput): Promise<EditorialMarkCommandProjection>;
  inspectEditorialLearning(input: InspectEditorialLearningInput): Promise<EditorialLearningProjection>;
  recordLearningReasonAsk(input: LearningReasonAskInput): Promise<LearningReasonAskProjection | null>;
  changeEditorialLearning(input: ChangeEditorialLearningInput): Promise<EditorialLearningProjection>;
  createEditorialMemory(input: CreateEditorialMemoryInput): Promise<EditorialLearningProjection>;
  acceptEditorialMemory(input: import('./protocol/learning.js').AcceptEditorialMemoryInput): Promise<EditorialLearningProjection>;
  deactivateEditorialMemory(input: DeactivateEditorialMemoryInput): Promise<EditorialLearningProjection>;
  inspectHouseReviewPreference(): Promise<HouseReviewPreferenceProjection>;
  rebuildHouseReviewPreference(): Promise<HouseReviewPreferenceProjection>;
  inspectEditQualitySignals(input: { bookId: string | null; preferenceAfter?: PreferenceAdoptionCursor | null }): Promise<EditQualitySignalsProjection>;
  inspectLearningMaterials(input: { bookId: string | null; after?: LearningMaterialCursor | null }): Promise<LearningMaterialsProjection>;
  inspectWordTrackedEditSample(input: InspectWordTrackedEditSampleInput): Promise<WordTrackedEditSampleDetailProjection>;
  inspectLearningMaterial(input: { bookId: string; materialKey: string }): Promise<LearningMaterialProjection>;
  decideLearningMaterial(input: DecideLearningMaterialInput): Promise<LearningMaterialProjection>;
  inspectFeedbackHistory(input?: FeedbackHistoryInput): Promise<FeedbackHistoryProjection>;
  inspectLearningAudit(input?: LearningAuditInput): Promise<LearningAuditProjection>;
  inspectLearningLineage(input: { bookId: string; materialKey: string }): Promise<LearningLineageProjection>;
  previewLearningRemediation(input: PreviewLearningRemediationInput): Promise<LearningRemediationPreviewProjection>;
  recordLearningRemediation(input: RecordLearningRemediationInput): Promise<LearningRemediationOutcomeProjection>;
  inspectEvaluationCalibration(input?: InspectEvaluationCalibrationInput): Promise<EvaluationCalibrationProjection>;
  recordPublicationActuals(input: RecordPublicationActualsInput): Promise<EvaluationCalibrationProjection>;
  setEvaluationPreferences(input: SetEvaluationPreferencesInput): Promise<EvaluationCalibrationProjection>;
  inspectSeriesList(input?: { after?: SeriesListCursor | null }): Promise<SeriesListProjection>;
  createSeries(input: CreateSeriesInput): Promise<SeriesCreationProjection>;
  inspectSeries(input: { seriesId: string }): Promise<SeriesProjection>;
  previewSeriesMembershipChange(input: PreviewSeriesMembershipChangeInput): Promise<SeriesMembershipPreviewProjection>;
  changeSeriesMembership(input: ChangeSeriesMembershipInput): Promise<SeriesMembershipChangeResultProjection>;
  inspectBookSeries(input: InspectBookSeriesInput): Promise<BookSeriesProjection>;
  inspectSeriesMembers(input: { seriesId: string; after: SeriesMembersCursor | null }): Promise<SeriesMembersPageProjection>;
  inspectSeriesCandidates(input: { seriesId: string; text: string; after: SeriesCandidatesCursor | null }): Promise<SeriesCandidatesProjection>;
  inspectSeriesHistory(input: { seriesId: string | null; bookId: string | null; after: SeriesHistoryCursor | null }): Promise<SeriesHistoryPageProjection>;
  proposeSeriesKnowledge(input: ProposeSeriesKnowledgeInput): Promise<SeriesKnowledgeProposalProjection>;
  inspectSeriesKnowledgeReview(input: InspectSeriesKnowledgeReviewInput): Promise<SeriesKnowledgeReviewProjection>;
  editSeriesKnowledgeCandidate(input: EditSeriesKnowledgeCandidateInput): Promise<SeriesKnowledgeReviewProjection>;
  promoteSeriesKnowledge(input: PromoteSeriesKnowledgeInput): Promise<SeriesKnowledgePromotionProjection>;
  inspectSeriesKnowledgeItems(input: { seriesId: string; text: string; after: SeriesKnowledgeItemsCursor | null }): Promise<SeriesKnowledgeItemsPageProjection>;
  inspectSeriesKnowledgeCandidates(input: { seriesId: string; after: SeriesKnowledgeCandidatesCursor | null }): Promise<SeriesKnowledgeCandidatesPageProjection>;
  inspectSeriesKnowledgeConflicts(input: { seriesId: string; itemId: string; revisionId: string; after: number }): Promise<SeriesKnowledgeConflictsProjection>;
  inspectSeriesKnowledgeRevisions(input: { seriesId: string; itemId: string; before: number | null }): Promise<SeriesKnowledgeRevisionsProjection>;
  inspectSeriesExclusionTargets(input: InspectSeriesExclusionTargetsInput): Promise<SeriesExclusionTargetsProjection>;
  inspectSeriesExclusionHistory(input: InspectSeriesExclusionHistoryInput): Promise<SeriesExclusionHistoryPageProjection>;
  previewSeriesExclusion(input: PreviewSeriesExclusionInput): Promise<SeriesExclusionPreviewProjection>;
  recordSeriesExclusion(input: RecordSeriesExclusionInput): Promise<SeriesExclusionResultProjection>;
  /** 取消任务 of the current Book's Review Run a Series Retrieval Exclusion stopped (Issue #64, S29b). */
  cancelReviewRun(input: Omit<CancelReviewRunInput, 'bookId'>): Promise<ReviewWorkspaceProjection>;
  inspectDataVersion(): Promise<DataVersionProjection>;
  /**
   * 导出数据库… (Issue #434, S86a): the platform's Save dialog, then the preparation of the package for the chosen file — begun,
   * and followed through `inspectDatabaseExports` (V2-UX-EXP-011).
   */
  chooseDatabaseExportDestination(): Promise<{ outcome: 'cancelled' } | { outcome: 'preparing'; activity: DatabaseExportActivityProjection }>;
  approveDatabaseExport(input: { preparationId: string }): Promise<DatabaseExportActivityProjection>;
  inspectDatabaseExports(): Promise<DatabaseExportsProjection>;
  inspectScheduledBackups(): Promise<ScheduledBackupsProjection>;
  /** 用量 (Issue #936): the Runs already recorded, summed by Book, Task kind or period. */
  inspectUsage(input: InspectUsageInput): Promise<UsageProjection>;
  /** 导出为 CSV… (Issue #936): the platform's Save dialog, then the table as numbers and ids only. */
  exportUsageCsv(input: { range: UsageRange; groupBy: UsageGrouping }): Promise<UsageCsvExportResult>;
  setScheduledBackup(input: SetScheduledBackupInput): Promise<ScheduledBackupsProjection>;
  /** 导入数据库… (Issue #434, S86c): the platform's Open dialog, then the chosen package read and verified for its preview. */
  chooseDatabaseImportFile(): Promise<{ outcome: 'cancelled' } | { outcome: 'previewed'; preview: DatabaseImportPreviewProjection }>;
  prepareDatabaseReplacement(input: { previewId: string }): Promise<DatabaseReplacementsProjection>;
  cancelDatabaseReplacement(input: { replacementId: string }): Promise<DatabaseReplacementsProjection>;
  inspectDatabaseReplacements(): Promise<DatabaseReplacementsProjection>;
  rollBackDatabaseReplacement(input: { replacementId: string }): Promise<DatabaseReplacementsProjection>;
  prepareDatabaseMerge(input: { previewId: string }): Promise<DatabaseReplacementsProjection>;
  /** `现在关闭 AI7`: AI7 closes, unless a window holds changes not yet saved; a prepared replacement completes at the next start. */
  quitApplication(): Promise<{ outcome: 'quitting' } | { outcome: 'blocked' }>;
  cancelDatabaseExport(input: { activityId: string }): Promise<DatabaseExportActivityProjection>;
  applyChangeSuggestion(input: ApplyChangeSuggestionInput): Promise<ManuscriptApplyCommandProjection>;
  inspectProposalWorkspace(input: ProposalWorkspaceInput): Promise<ProposalWorkspaceProjection>;
  saveProposalDecisionDraft(input: SaveProposalDecisionDraftInput): Promise<ProposalWorkspaceProjection>;
  batchProposalDecisionDraft(input: BatchProposalDecisionDraftInput): Promise<ProposalDraftBatchProjection>;
  recordProposalDecision(input: RecordProposalDecisionInput): Promise<ProposalWorkspaceProjection>;
  inspectApplyReceipt(input: InspectApplyReceiptInput): Promise<ApplyReceiptProjection>;
  prepareReverseApply(input: PrepareReverseApplyInput): Promise<ReverseApplyPreparationProjection>;
  /** 确认应用 on 审阅's batch confirmation strip: one Effect over exactly the suggestions the strip listed. */
  applyChangeSuggestionBatch(input: ApplyChangeSuggestionBatchInput): Promise<ManuscriptApplyCommandProjection>;
  reverseAppliedChangeSuggestion(input: ReverseAppliedChangeSuggestionInput): Promise<ManuscriptApplyCommandProjection>;
  getManuscriptApplyOutcome(input: ServiceOperationMap['getManuscriptApplyOutcome']['input']): Promise<ManuscriptApplyOutcomeProjection>;
  /** 稿件冲突 of one 修改建议 of the manuscript the window is showing (Issue #57). */
  inspectProposalConflict(input: ProposalConflictBindingInput): Promise<ProposalConflictProjection>;
  /** Save the Resolution Draft; it never writes the manuscript. */
  saveProposalConflictDraft(input: SaveProposalConflictDraftInput): Promise<ProposalConflictDraftSaveProjection>;
  /** 确认保留当前稿件, 暂不处理, or 保存为新提案版本; none of them writes the manuscript. */
  resolveProposalConflict(input: ResolveProposalConflictInput): Promise<ProposalConflictResolutionProjection>;
  /** 基于当前稿件重新生成建议 for one conflict unit (Issue #842); it saves a Resolution Draft at most and writes no manuscript. */
  regenerateProposalConflictUnit(input: RegenerateProposalConflictUnitInput): Promise<ProposalConflictRegenerationProjection>;
  getManuscriptRail(input: ServiceOperationMap['getManuscriptRail']['input']): Promise<ManuscriptRailProjection>;
  /** Cut, copy or paste in the focused editor through the window itself; the page has no clipboard permission. */
  runEditorClipboardCommand(input: { command: EditorClipboardCommand }): Promise<{ state: 'done' }>;
  recordManuscriptEntryPosition(
    input: ServiceOperationMap['recordManuscriptEntryPosition']['input'],
  ): Promise<{ state: 'recorded' }>;
  listPriorWork(): Promise<ReadonlyArray<PriorWorkItemProjection>>;
  getManuscriptWindowAt(input: ServiceOperationMap['getManuscriptWindowAt']['input']): Promise<ManuscriptWindowProjection>;
  getOutline(input: ServiceOperationMap['getOutline']['input']): Promise<OutlineProjection>;
  startSearch(input: ServiceOperationMap['startSearch']['input']): Promise<ServiceWireOutput<ServiceJobProjection>>;
  pollServiceJob(input: ServiceOperationMap['pollServiceJob']['input']): Promise<ServiceWireOutput<ServiceJobProjection>>;
  cancelServiceJob(input: ServiceOperationMap['cancelServiceJob']['input']): Promise<ServiceWireOutput<ServiceJobProjection>>;
  getSearchResults(input: ServiceOperationMap['getSearchResults']['input']): Promise<SearchResultsProjection>;
  prepareReplacement(input: ServiceOperationMap['prepareReplacement']['input']): Promise<ReplacementPreviewProjection>;
  freezeReplacement(input: ServiceOperationMap['freezeReplacement']['input']): Promise<ReplacementPreviewProjection>;
  dismissReplacementPreview(input: ServiceOperationMap['dismissReplacementPreview']['input']): Promise<ReplacementDismissalProjection>;
  startReplacementCommit(input: ServiceOperationMap['startReplacementCommit']['input']): Promise<ServiceWireOutput<ServiceJobProjection>>;
  commitReplacement(input: ServiceOperationMap['commitReplacement']['input']): Promise<ReplacementCommitProjection>;
  saveMilestone(input: ServiceOperationMap['saveMilestone']['input']): Promise<MilestoneProjection>;
  /** 交付物 of the Book the window is showing (Issue #414): its Manuscript's milestones and Publication Versions. */
  inspectDeliverables(): Promise<DeliverablesProjection>;
  /** 设为发稿版本 over one exact milestone of that Book; an identical repeat of the current one is no change. */
  designatePublicationVersion(input: Omit<DesignatePublicationVersionInput, 'bookId'>): Promise<PublicationDesignationProjection>;
  /** 交付 · 生产文档 of that Book (Issue #415): one card per house type and the materials a document can start from. */
  inspectProductionDocuments(): Promise<ProductionDocumentsProjection>;
  /** 图书交付包 of that Book (Issue #416): its conditions, what a package would hold, and its versions. */
  inspectBookDeliveryPackage(input?: Omit<InspectBookDeliveryPackageInput, 'bookId'>): Promise<BookDeliveryPackageProjection>;
  /** `准备图书交付包`: freeze exactly the content read, with its purpose; it creates no file and sends nothing. */
  prepareBookDeliveryPackage(input: Omit<PrepareBookDeliveryPackageInput, 'bookId'>): Promise<BookDeliveryPackageResultProjection>;
  /** `导出…` of one version of that Book's package (Issue #416, S67b): the files it would write. */
  reviewBookDeliveryPackageExport(input: Omit<ReviewBookDeliveryPackageExportInput, 'bookId'>): Promise<BookDeliveryPackageExportReviewProjection>;
  /** `选择位置…`: the system's own folder dialog, then the export prepared there; a cancelled dialog records nothing. */
  chooseBookDeliveryPackageExportFolder(input: Omit<PrepareBookDeliveryPackageExportInput, 'bookId' | 'folder'>): Promise<ChooseBookDeliveryPackageExportFolderResult>;
  chooseBookDeliveryPackageArchiveDestination(input: Omit<PrepareBookDeliveryPackageArchiveInput, 'bookId' | 'destination'>): Promise<ChooseBookDeliveryPackageExportFolderResult>;
  approveBookDeliveryPackageArchiveExport(input: Omit<ApproveBookDeliveryPackageExportInput, 'bookId'>): Promise<BookDeliveryPackageExportResultProjection>;
  cancelBookDeliveryPackageArchiveExport(input: Omit<ApproveBookDeliveryPackageExportInput, 'bookId'>): Promise<boolean>;
  /** `按上述方式导出` of a prepared package export: its files written, each with its receipt. */
  approveBookDeliveryPackageExport(input: Omit<ApproveBookDeliveryPackageExportInput, 'bookId'>): Promise<BookDeliveryPackageExportResultProjection>;
  /** 维护事项 (Issue #426, S68a): one case of that Book in its workspace. */
  inspectMaintenanceCase(input: Omit<InspectMaintenanceCaseInput, 'bookId'>): Promise<MaintenanceCaseProjection>;
  /** `更早的维护事项…`: a page of one designation's older cases. */
  listMaintenanceCases(input: Omit<ListMaintenanceCasesInput, 'bookId'>): Promise<MaintenanceCasePageProjection>;
  /** `记录维护事项` on one of that Book's designations. */
  recordMaintenanceCase(input: Omit<RecordMaintenanceCaseInput, 'bookId'>): Promise<MaintenanceCaseResultProjection>;
  /** 关联修改建议, 关联发稿版本 or 记录维护事项结论: the case's next revision. */
  appendMaintenanceCaseRevision(input: Omit<AppendMaintenanceCaseRevisionInput, 'bookId'>): Promise<MaintenanceCaseResultProjection>;
  /** `保存勘误版本`. */
  saveMaintenanceErrata(input: Omit<SaveMaintenanceErrataInput, 'bookId'>): Promise<MaintenanceCaseResultProjection>;
  cancelBookDeliveryPackageExport(input: Omit<ApproveBookDeliveryPackageExportInput, 'bookId'>): Promise<boolean>;
  /** 从来源材料创建 (Issue #415): a document of one house type of that Book, from one of its source-only materials. */
  renameProductionDocument(input: Omit<RenameProductionDocumentInput, 'bookId'>): Promise<ProductionDocumentResultProjection>;
  saveProductionDocumentType(input: SaveProductionDocumentTypeInput): Promise<ProductionDocumentTypesProjection>;
  deleteProductionDocumentType(input: DeleteProductionDocumentTypeInput): Promise<ProductionDocumentTypesProjection>;
  reorderProductionDocumentTypes(input: ReorderProductionDocumentTypesInput): Promise<ProductionDocumentTypesProjection>;
  updateProductionDocumentMeta(input: Omit<UpdateProductionDocumentMetaInput, 'bookId'>): Promise<ProductionDocumentsProjection>;
  createProductionDocument(input: Omit<CreateProductionDocumentInput, 'bookId'>): Promise<ProductionDocumentResultProjection>;
  /** 本书不做 or 恢复 for one house type of that Book. */
  decideProductionDocumentType(input: Omit<DecideProductionDocumentTypeInput, 'bookId'>): Promise<ProductionDocumentResultProjection>;
  /** 保存为版本: one document of that Book gets its working text as its next version. */
  saveProductionDocumentVersion(input: Omit<SaveProductionDocumentVersionInput, 'bookId'>): Promise<ProductionDocumentResultProjection>;
  /** 交付: a Delivery Record of one exact version of a document of that Book; nothing is sent. */
  recordProductionDocumentDelivery(input: Omit<RecordProductionDocumentDeliveryInput, 'bookId'>): Promise<ProductionDocumentResultProjection>;
  transitionProductionDocumentPhase(input: Omit<TransitionProductionDocumentPhaseInput, 'bookId'>): Promise<ProductionDocumentResultProjection>;
  /** 待我处理 across every Book (Issue #424): a read in any window, whatever it shows; it holds and grants nothing. */
  inspectGlobalAttention(): Promise<GlobalAttentionProjection>;
  taskOverviewCall(input: TaskOverviewCall): Promise<ServiceWireOutput<TaskOverviewCallResult>>;
  controlAllTasks(input: { action: 'pause' | 'resume' }): Promise<TaskOverviewProjection>;
  inspectTaskOverview(): Promise<TaskOverviewProjection>;
  reorderQueuedRun(input: { runRecordId: string; position: number }): Promise<TaskOverviewProjection>;
  startQuickTasks(input: StartQuickTasksInput): Promise<StartQuickTasksResult>;
  /** The 任务 panel of the Book this window shows (Issue #423, S77a): a read; it holds and grants nothing. */
  inspectBookTasks(): Promise<BookTasksProjection>;
  /** 就这段提问… on the Book this window shows (Issue #52, S17a): only the selected words and the question are sent. */
  askAboutSelection(input: AskAboutSelectionInput): Promise<DialogueProjection>;
  inspectDialogue(input: InspectDialogueInput): Promise<DialogueProjection>;
  stopDialogueAnswer(input: DialogueAttemptInput): Promise<DialogueProjection>;
  continueDialogueAnswer(input: DialogueAttemptInput): Promise<DialogueProjection>;
  regenerateDialogueAnswer(input: DialogueAttemptInput): Promise<DialogueProjection>;
  convertDialogueToChangeSuggestion(input: ConvertDialogueToChangeSuggestionInput): Promise<DialogueConversionProjection>;
  /** The Task Intent Drafts of the Book this window shows (Issue #423, slice 7a): a read. */
  inspectTaskIntentDrafts(input: Omit<InspectTaskIntentDraftsInput, 'bookId'>): Promise<TaskIntentDraftsProjection>;
  saveTaskIntentDraft(input: Omit<SaveTaskIntentDraftInput, 'bookId'>): Promise<TaskIntentDraftProjection>;
  promoteTaskIntentDraft(input: Omit<PromoteTaskIntentDraftInput, 'bookId'>): Promise<ServiceWireOutput<ServiceJobProjection>>;
  promoteAnswerToTaskIntentDraft(input: Omit<PromoteAnswerToTaskIntentDraftInput, 'bookId'>): Promise<TaskIntentDraftProjection>;
  /** The Agent 工作区 of the Book this window shows (Issue #90, slice 13a): a read. */
  inspectAgentWorkspace(): Promise<AgentWorkspaceProjection>;
  /** One proposal round on the Book this window shows: only the selected words and the instruction are sent. */
  proposeAgentWorkspaceChangeSet(input: ProposeAgentWorkspaceChangeSetInput): Promise<AgentWorkspaceProjection>;
  promoteAgentWorkspaceProposals(input: AgentWorkspaceProposalSetInput): Promise<AgentWorkspacePromotionProjection>;
  discardAgentWorkspaceProposals(input: AgentWorkspaceProposalSetInput): Promise<AgentWorkspaceProjection>;
  /** Whether 润色这段 and 基于当前稿件重新生成建议 can be asked for the Book this window shows (Issue #842): a read. */
  inspectFastInteractionRoutes(): Promise<FastInteractionRoutesProjection>;
  /** 润色这段 on the Book this window shows (Issue #842): only the selected words and their paragraph's context are sent. */
  polishSelection(input: PolishSelectionInput): Promise<EditorialPolishProjection>;
  /** A 润色这段 or 基于当前稿件重新生成建议 request of the Book this window shows, read again until it settles: a read. */
  inspectFastInteractionRequest(input: InspectFastInteractionRequestInput): Promise<FastInteractionRequestProjection>;
  /** 🔒 锁定 (Issue #1412): the AI edit locks of a manuscript this window holds. */
  inspectAiEditLocks(input: InspectAiEditLocksInput): Promise<AiEditLocksProjection>;
  setAiEditLocks(input: SetAiEditLocksInput): Promise<AiEditLocksProjection>;
  /** 就选中部分让 AI 修改 on the Book this window shows (Issue #1412). */
  startScopedAiEdit(input: StartScopedAiEditInput): Promise<ScopedAiEditProjection>;
  inspectScopedAiEdit(input: InspectScopedAiEditInput): Promise<ScopedAiEditProjection>;
  /** 全部替换 with per-occurrence revision cards (Issue #1411). */
  commitReplacementRevisions(input: CommitReplacementRevisionsInput): Promise<ReplacementRevisionsProjection>;
  /**
   * ④ 导出 (Issue #413): the Export Fidelity Review of one exact version of that Book's Manuscript. A current
   * revision with unsaved edits is saved as a revision first.
   */
  reviewManuscriptExport(input: Omit<ReviewManuscriptExportInput, 'bookId'>): Promise<ManuscriptExportReviewProjection>;
  /**
   * 选择保存位置…: the system's own Save dialog, owned by the main process; a destination it returns freezes one
   * Local Export Preparation. The renderer never names a path.
   */
  chooseManuscriptExportDestination(input: ChooseManuscriptExportDestinationInput): Promise<ManuscriptExportDestinationResult>;
  /** 按上述方式导出: the approval of one unchanged preparation, the atomic write and what it came to. */
  approveManuscriptExport(input: Omit<ApproveManuscriptExportInput, 'bookId'>): Promise<ManuscriptExportReceiptProjection>;
  /** 在文件夹中显示: the system file manager at one verified exported file. */
  revealManuscriptExport(input: Omit<InspectManuscriptExportReceiptInput, 'bookId'>): Promise<{ state: 'revealed' }>;
  undoManuscript(input: ServiceOperationMap['undoManuscript']['input']): Promise<DurableHistoryProjection>;
  redoManuscript(input: ServiceOperationMap['redoManuscript']['input']): Promise<DurableHistoryProjection>;
  openBookWorkbench(input: BookWorkbenchRoute): Promise<BookWorkbenchOpenProjection>;
  getBookWorkbenchRoute(): Promise<ResolvedBookWorkbenchRoute | null>;
  leaveBookWorkbench(): Promise<{ state: 'library' }>;
  getHistoricalRevision(
    input: ServiceOperationMap['getHistoricalRevision']['input'],
  ): Promise<HistoricalRevisionProjection>;
  getProductDataLocation(): Promise<ProductDataLocationProjection>;
  revealProductDataLocation(): Promise<ProductDataLocationRevealProjection>;
  selectFastRoleModel(input: FastModelSelectionInput): Promise<ModelServiceSettingsProjection>;
  selectMainRoleModel(input: FastModelSelectionInput): Promise<ModelServiceSettingsProjection>;
  selectBothRoleModels(input: FastModelSelectionInput): Promise<ModelServiceSettingsProjection>;
  refreshModelServiceModels(input: { route: ModelServiceRouteId }): Promise<ModelServiceSettingsProjection>;
  testModelServiceConnection(input: FastModelSelectionInput): Promise<ModelServiceSettingsProjection>;
  getModelServiceSettings(): Promise<ModelServiceSettingsProjection>;
  saveModelServiceProxy(input: SaveModelServiceProxyInput): Promise<ModelServiceSettingsProjection>;
  /**
   * Save a route's connection name and credential — the DeepSeek 开放平台（官方） route when `route` is absent, as Issue #712 has
   * always saved it — or, given only `{ route, select: true }`, make that saved route the one new Tasks use (Issue #811).
   */
  saveModelServiceCredential(input: ModelServiceCredentialInput): Promise<ModelServiceSettingsProjection>;
  /** Remove a route's credential; the DeepSeek 开放平台（官方） route's when no route is named. */
  removeModelServiceCredential(input?: { route: ModelServiceRouteId }): Promise<ModelServiceSettingsProjection>;
}
