import type { GlobalAgentOperations, GlobalAgentRendererApi } from './protocol/global-agent.js';
import type { HouseWordListOperations, HouseWordListApi } from './protocol/house-word-list.js'; import type { CustomAnalysisPreparationFrom, TaskPlanCustomDimension } from './protocol/custom-analysis-redo.js';
import type { JournalEditInput } from './protocol/manuscript-structure.js'; import type { SelectionSpanBlockPin, SelectionSpanField } from './protocol/selection-span.js'; import type { GlobalAttentionProjection } from './protocol/global-attention.js'; import type { ModelServiceBindingProjection, ModelServiceChannelProjection, ModelServiceConnectionId, ModelServiceRouteId, OrdinaryProductionRouteId } from './protocol/model-service.js'; import type { SearchBackendConnectionProjection, SearchBackendProbeProjection, SearchBackendSettingsProjection, SearchCandidateId, SearchConnectionTestPolicy } from './protocol/search-backends.js';
export type { JournalEditInput, JournalStructuralEdit } from './protocol/manuscript-structure.js';
import type { ManuscriptBlockProjection } from './protocol/manuscript-notes.js';
export type { ManuscriptBlockKind, ManuscriptBlockProjection, ManuscriptNoteProjection } from './protocol/manuscript-notes.js';
import type { ImportStructureChoice, ImportStructureProjection } from './protocol/import-structure.js';
import type { EditableImportProjection, ImportIdentityFindingProjection, ManuscriptConversionProjection } from './protocol/import-intake.js';
export type * from './protocol/import-intake.js'; export type * from './protocol/import-structure.js'; export * from './protocol/custom-analysis-redo.js'; export type * from './protocol/selection-span.js'; export type * from './protocol/global-attention.js'; export * from './protocol/model-service.js'; export * from './protocol/search-backends.js'; export { validStructureChoice } from './protocol/import-structure.js';
export * from './protocol/global-agent.js';
export type { ReviewContractIdentity, ReviewExcludedFindingProjection, ReviewContractRejectionReason, ReviewEvidenceSource, ReviewReportSchema, ReviewReportDerivedSections, ReviewReportFindingEntry } from './protocol/review.js';
import type { ReviewExcludedFindingProjection, ReviewContractRejectionReason, ReviewReportSchema, ReviewReportDerivedSections } from './protocol/review.js';
import type {
  QuickStartBaselineAnalysisResult,
  HISTORICALLY_AFFECTED_RESULT_MARKER,
  HISTORICAL_MARKER_UNVERIFIABLE,
  LEARNING_INFLUENCE_RESULT_MARKER,
  TaskPlanDefaultRuleProjection,
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
  SaveMilestoneInput,
  MilestoneProjection,
  HistoricalRevisionProjection,
} from './protocol/series.js';
import type {
  ProductionDocumentProjection,
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
import type { CompositeReviewRunRequest, ProcedureDefinitionPin, PreinstalledProcedureProjection } from './protocol/procedures.js';
import type {
  ChangeEditorialLearningInput,
  CreateEditorialMemoryInput,
  DeactivateEditorialMemoryInput,
  EditorialLearningProjection,
  InspectEditorialLearningInput,
  LearningReasonAskInput, LearningReasonAskProjection, PreferenceAdoptionProjection, PreferenceAdoptionCursor, ReferencedRuleVersion,
} from './protocol/learning.js';
import type { AnalysisFeedbackDimension, AnalysisFeedbackJudgment } from './analysis-feedback.js';
import type { ConflictUnit, ConflictUnitResolution } from './conflict-units.js';
import type { ConfiguredCredentialSlot, ConfiguredRouteId } from './provider-configuration.generated.js';
import type { PublicSampleBookSourceDigest } from './public-samplebooks.js';
import { USAGE_EMPTY_LABEL } from './usage-labels.js';
export { USAGE_EMPTY_LABEL } from './usage-labels.js';

export const SERVICE_PROTOCOL_VERSION = 190 as const;

export const BOOK_FINDINGS_PAGE_SIZE = 40;
export interface BookFindingProjection {
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
}

/** One mark as the manuscript surface draws it; the card's content is read on demand. */
export interface EditorialMarkAnchorProjection {
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
 * Change Item in the four regions of V2-UX-PROP-022: the exact current and proposed wording, the
 * rationale, the basis, and the editor's own decision, which is a record apart from the item and
 * from any change to the manuscript.
 */
export interface EditorialMarkCardProjection {
  markId: string;
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
  action: 'edit-body' | 'recolor' | 'set-status' | 'reply' | 'remove' | 'convert';
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
  excluded: ReadonlyArray<{ markId: string; reason: 'conflict' | 'unclassified-stale' | 'unloaded' | 'other-version' | 'atomic-group' | 'applied' }>;
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
export type { ConflictResolution, ConflictUnit, ConflictUnitKind, ConflictUnitResolution } from './conflict-units.js';

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

/** Sanitized exact-binding text-probe result. No response, error body or credential value. */
export interface ModelConnectionTestStatus {
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
export type OrdinaryProductionProviderProcessingVersion = 'v13' | 'v15' | 'v17' | 'v19' | 'v21' | 'v23' | 'v25' | 'v26' | 'v27' | 'v30' | 'v31' | 'v32';
/** Historical v5, v7, v8, v9, v10, v11 and v12, the superseded web reservation v6, historical v13, v14 and v15, and selected v16. */
export type ActivePolicySetVersion = 'v5' | 'v6' | 'v7' | 'v8' | 'v9' | 'v10' | 'v11' | 'v12' | 'v13' | 'v14' | 'v15' | 'v16' | 'v17' | 'v18' | 'v19' | 'v21' | 'v22' | 'v23';
export type ProviderProcessingVersion = 'v1' | 'v29' | DeveloperLiveProviderProcessingVersion | OrdinaryProductionProviderProcessingVersion;

/** Accepted identities shared by readers and gates; these constants do not select a policy or authorize a send. */
export const ORIGINAL_FIELDS_ACTIVE_SET_SHA256 = '4b845e924df777f440b07d53ba6e31447e0fe0b004e86efa89bf76554fb05392';
export const CURRENT_ACTIVE_SET_SHA256 = 'fe666f4a92b7a82503d69b345233cbec7a93846f97e10027524d7e3d3a76f2ab';
export const CURRENT_PRODUCTION_POLICY_SHA256 = '2a217d7e2404208d1b14c26628758a3471a92566b66a124456da14b17ecc36ad';
export const DEVELOPMENT_CI_POLICY_SHA256 = 'd9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a';
export const ORIGINAL_FIELDS_POLICY_SHA256 = 'f12df1d43cfc9f52b999c2cc8a6e9bac419177d42210d3bbe8c5008ba8d6a59e';
export const LOCAL_FIXTURE_POLICY_SHA256 = 'c9545a5f461a7791115c1f4664bbd731757775951f814d39c28b12c85af88c9d';
export const LOCAL_FIXTURE_MANIFEST_SHA256 = '2572c1b5aa05d6ccc9a60a2a8a03ba2cefc10d5f48c1a85377d53797360bc0d2';

/** Retained known interpretations, never an arbitrary-v-number reader or a selection mechanism. */
export function isSupportedProviderProcessingVersion(scope: unknown, version: unknown): boolean {
  if (scope === 'development-ci') return version === 'v1' || version === 'v29';
  if (scope === 'developer-live') return ['v5', 'v8', 'v9', 'v10', 'v11', 'v12', 'v14', 'v16', 'v18', 'v20', 'v22', 'v24'].some((entry) => entry === version);
  if (scope === 'ordinary-production') return ['v13', 'v15', 'v17', 'v19', 'v21', 'v23', 'v25', 'v26', 'v27', 'v30', 'v31', 'v32'].some((entry) => entry === version);
  return false;
}

/** Identity of the actual verified selected documents; this metadata grants no execution authority. */
export interface SelectedPolicyIdentity {
  readonly providerProcessingVersion: 'v1' | 'v24' | 'v29' | 'v30' | 'v31' | 'v32';
  readonly providerProcessingSha256: string;
  readonly activePolicySetVersion: 'v21' | 'v22' | 'v23';
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
  v31: '1cf19c82e46adf7a731e4f0c625cc1dd1f8e07e5b744eb06a872cbaa01849bd5', v32: CURRENT_PRODUCTION_POLICY_SHA256,
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
  const version = value['providerProcessingVersion'];
  const set = value['activePolicySetVersion'];
  const setSha256 = set === 'v21' ? ORIGINAL_FIELDS_ACTIVE_SET_SHA256 : set === 'v22' ? '68125ebd3e1266f02fc1cf02c0a548fa652c4cad3ee052bbfaebc68922758ebb' : set === 'v23' ? CURRENT_ACTIVE_SET_SHA256 : null;
  if ((version !== 'v1' && version !== 'v24' && version !== 'v29' && version !== 'v30' && version !== 'v31' && version !== 'v32') ||
      value['providerProcessingSha256'] !== SELECTED_PROVIDER_DIGESTS[version] || setSha256 === null || value['activePolicySetSha256'] !== setSha256 ||
      !((set === 'v21' && ['v24', 'v29', 'v30'].includes(version)) || (set === 'v22' && ['v1', 'v24', 'v31'].includes(version)) || (set === 'v23' && ['v1', 'v24', 'v32'].includes(version)))) return null;
  return { providerProcessingVersion: version, providerProcessingSha256: SELECTED_PROVIDER_DIGESTS[version],
    activePolicySetVersion: set as 'v21' | 'v22' | 'v23', activePolicySetSha256: setSha256 };
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
    .map((set) => ['v1', set] as const), ['v29', 'v21'], ['v1', 'v22'], ['v1', 'v23']],
  'developer-live': [['v4', 'v4'], ['v5', 'v5'], ['v9', 'v7'], ['v10', 'v8'], ['v11', 'v9'], ['v12', 'v10'], ['v14', 'v11'], ['v16', 'v12'],
    ['v18', 'v13'], ['v20', 'v14'], ['v22', 'v15'], ...['v16', 'v17', 'v18', 'v19', 'v21', 'v22', 'v23'].map((set) => ['v24', set] as const)],
  'ordinary-production': [['v13', 'v10'], ['v15', 'v11'], ['v17', 'v12'], ['v19', 'v13'], ['v21', 'v14'], ['v23', 'v15'], ['v23', 'v16'],
    ['v25', 'v17'], ['v26', 'v18'], ['v27', 'v19'], ['v30', 'v21'], ['v31', 'v22'], ['v32', 'v23']],
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
    RECORDED_POLICY_PINS[scope].some(([version, set]) => version === value.providerProcessingVersion && set === value.activePolicySetVersion) &&
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
  /** Present only after the resolver verified the exact selected document bytes. */
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
     * Whether a local export Effect can be offered (Issue #413): only once External Export Policy v2 verified at
     * this launch; policy eligibility is still no approval.
     */
    currentExportEffectAvailable: boolean;
    label: '对外导出策略独立；当前未提供导出受控动作' | '对外导出策略 v2 已校验：只导出到本机所选位置，每个文件单独批准';
  };
  publicReleasePermission: {
    present: false;
    label: '公开发布许可：不存在';
  };
}

export interface ModelServiceStoredStateProjection {
  proxy: ModelServiceProxySetting;
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
  '模型服务需设置：请先在 设置 › 模型服务 为 OpenCode Go（默认）或 DeepSeek 开放平台（官方）保存连接名称与凭据；这次没有发送任何内容。' as const;

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

export interface ModelServiceSettingsProjection {
  searchBackends: SearchBackendSettingsProjection;
  proxy: ModelServiceProxySetting;
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

// ---- J-04 covered baseline manuscript analysis (Issue #92) ----------------------------------------

/** One completely enumerated Analysis Unit of a Coverage Manifest: own block range plus bounded overlap context. */
export interface CoverageManifestUnitProjection {
  ordinal: number;
  sectionOrdinal: number;
  subUnitIndex: number;
  subUnitCount: number;
  headingBlockId: string | null;
  headingText: string | null;
  headingLevel: number | null;
  startPosition: number;
  endPosition: number;
  blockIds: ReadonlyArray<string>;
  blockDigests: ReadonlyArray<string>;
  overlapBlockIds: ReadonlyArray<string>;
  graphemes: number;
  digest: string;
}

/** Deterministic, versioned coverage plan for one exact Manuscript Pin; gaps never live here. */
export interface CoverageManifestProjection {
  schema: 'ai7.coverage-manifest/1';
  manuscript: {
    bookId: string;
    manuscriptId: string;
    branchId: string;
    revisionId: string;
    revisionLabel: string;
    revisionDigest: string;
  };
  parameters: { unitBudgetGraphemes: number; overlapBlocks: number };
  totalBlocks: number;
  totalGraphemes: number;
  sectionCount: number;
  units: ReadonlyArray<CoverageManifestUnitProjection>;
  digest: string;
}

/** Transport summaries never replace the complete, digested manifest kept by the ledger. */
export type CoverageManifestSummaryProjection = Omit<CoverageManifestProjection, 'units'> & {
  units: ReadonlyArray<Omit<CoverageManifestUnitProjection, 'blockIds' | 'blockDigests' | 'overlapBlockIds'> & {
    blockCount: number; firstBlockId: string; lastBlockId: string;
  }>;
};
export interface AnalysisUnitPage { shown: number; total: number; nextOrdinal: number | null }
export type AnalysisGapSummaryProjection = Omit<AnalysisGapProjection, 'blockIds'> & {
  blockCount: number; firstBlockId: string | null; lastBlockId: string | null;
};
export type BaselineAnalysisWireUnitProjection = Exclude<BaselineAnalysisUnitProjection, { state: 'gap' }> |
  (Omit<Extract<BaselineAnalysisUnitProjection, { state: 'gap' }>, 'gap'> & { gap: AnalysisGapSummaryProjection });
export type AnalysisRevisionWireProjection = Omit<BaselineAnalysisResultSetRevisionProjection, 'units' | 'gaps' | 'sections' | 'synthesis'> & {
  units: ReadonlyArray<BaselineAnalysisWireUnitProjection>;
  gaps: ReadonlyArray<AnalysisGapSummaryProjection>;
  unitPage: AnalysisUnitPage;
  /** Present inline for short books. D3a pages the exact canonical JSON for larger overviews. */
  sections?: BaselineAnalysisResultSetRevisionProjection['sections'];
  synthesis?: BaselineAnalysisResultSetRevisionProjection['synthesis'];
  overviewPage?: { totalLength: number; sha256: string; chunkCount: number };
};
export type AnalysisRunReportSummaryProjection = Omit<RunReportProjection, 'unitRows'> & {
  unitRows?: RunReportProjection['unitRows']; unitPage?: AnalysisUnitPage;
};
export type AnalysisReusePlanSummaryProjection = Omit<AnalysisReusePlanProjection, 'units'> & {
  units: ReadonlyArray<Pick<AnalysisReusePlanUnitProjection, 'unitOrdinal' | 'disposition' | 'reason' | 'reusedFrom'>>;
};
export type BaselineAnalysisWireProjection = Omit<BaselineAnalysisProjection,
  'coverageManifest' | 'resultSetRevision' | 'inspectedRevision' | 'update' | 'run' | 'history' | 'taskOutcome' | 'updateControls'> & {
  listPages: Readonly<Record<string, AnalysisUnitPage & { descending?: boolean }>>;
  coverageManifest: CoverageManifestSummaryProjection | null;
  resultSetRevision: AnalysisRevisionWireProjection | null;
  inspectedRevision: null | { revision: AnalysisRevisionWireProjection; current: boolean; readOnly: true };
  update: null | (Omit<BaselineAnalysisUpdateProjection, 'reusePlan'> & { reusePlan: AnalysisReusePlanSummaryProjection | null });
  run: null | (Omit<NonNullable<BaselineAnalysisProjection['run']>, 'attempt'> & {
    attempt: null | (NonNullable<NonNullable<BaselineAnalysisProjection['run']>['attempt']> & { spanCount: number });
  });
  history: null | (Omit<BaselineAnalysisHistoryProjection, 'entries'> & { entries: ReadonlyArray<
    Omit<BaselineAnalysisHistoryEntryProjection, 'report'> & { report: AnalysisRunReportSummaryProjection | null }> });
  taskOutcome: null | (Omit<NonNullable<BaselineAnalysisProjection['taskOutcome']>, 'report'> & { report: AnalysisRunReportSummaryProjection | null });
  updateControls: null | (Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> & { actions:
    Omit<BaselineAnalysisUpdateControlsProjection['actions'], 'reanalyze-range'> & {
      'reanalyze-range': BaselineAnalysisUpdateActionProjection & { options: ReadonlyArray<
        Pick<BaselineAnalysisRangeOptionProjection, 'unitOrdinal' | 'sectionOrdinal' | 'label' | 'startPosition' | 'endPosition'>> };
    } });
};

/** In-process operations retain full records; main/preload consume the explicitly mapped wire output. */
export type ServiceWireOutput<T> = T extends BaselineAnalysisProjection ? BaselineAnalysisWireProjection
  : T extends ServiceJobProjection ? Omit<ServiceJobProjection, 'result'> & { result: ServiceWireOutput<ServiceJobProjection['result']> }
  : T extends QuickStartBaselineAnalysisResult ? Omit<T, 'projection'> & { projection: BaselineAnalysisWireProjection }
  : T;
export type QuickStartBaselineAnalysisWireResult = ServiceWireOutput<QuickStartBaselineAnalysisResult>;
export type HydratedAnalysisRevisionProjection = AnalysisRevisionWireProjection & Required<Pick<AnalysisRevisionWireProjection, 'sections' | 'synthesis'>>;
export type ServiceWireJobProjection = ServiceWireOutput<ServiceJobProjection>;
export type WireServiceOperationMap = { [K in keyof ServiceOperationMap]: {
  input: ServiceOperationMap[K]['input']; output: ServiceWireOutput<ServiceOperationMap[K]['output']>;
} };

export type AnalysisEntityKind = 'person' | 'place' | 'organization' | 'object' | 'term' | 'other';

export interface AnalysisSourceRangeProjection {
  blockId: string;
  fromGrapheme: number | null;
  toGrapheme: number | null;
}

export interface AnalysisEntityProjection {
  name: string;
  kind: AnalysisEntityKind;
  aliases: ReadonlyArray<string>;
  note: string | null;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
  unitOrdinals: ReadonlyArray<number>;
}

export interface AnalysisEventProjection {
  unitOrdinal: number;
  ordinal: number;
  summary: string;
  chronology: string | null;
  participants: ReadonlyArray<string>;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface AnalysisRelationshipProjection {
  subject: string;
  object: string;
  relation: string;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
  unitOrdinals: ReadonlyArray<number>;
}

export interface AnalysisSettingClaimProjection {
  unitOrdinal: number;
  subject: string;
  claim: string;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface AnalysisConflictProjection {
  kind: 'unit-reported' | 'alias-collision' | 'entity-kind-divergence' | 'setting-claim-divergence';
  description: string;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
  unitOrdinals: ReadonlyArray<number>;
}

/**
 * One model-driven cross-unit finding (ADR 0066): a divergence the deterministic pre-filter cannot
 * reach, stated with the source ranges on every side and a confidence. `unitOrdinals` is the lineage
 * the Result Set is read by — every unit the finding cites, sorted and deduplicated from its sides.
 * A finding is evidence for the editor, never a verdict: no side is marked right.
 */
export interface AnalysisCrossUnitFindingProjection {
  kind: 'contradiction' | 'continuity-break' | 'alias-identity-divergence' | 'chronology-conflict';
  description: string;
  sides: ReadonlyArray<{ unitOrdinal: number; sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection> }>;
  unitOrdinals: ReadonlyArray<number>;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * What the cross-unit reduction did in the Run that produced this revision, including why it did not
 * run. The reduction forms no execution-span row of its own — the span table is unit-only — so this
 * is where its one attempt is recorded, transport facts included.
 */
export interface AnalysisCrossUnitReductionProjection {
  state: 'closed' | 'gap' | 'not-run';
  /** The exact reason for a gap or for not running; `null` when the reduction closed. */
  reason: string | null;
  /** The reduction's request digest; `null` when it never formed a request. */
  requestDigest: string | null;
  /** What the reduction's one turn cost; `null` when it never dispatched or reported no usage. */
  usage: { inputTokens: number; outputTokens: number } | null;
  findingCount: number;
}

/** The closed disposition set of the assurance sampling suboperation (ADR 0066); never a boolean. */
export type AnalysisAssuranceDisposition = '成立' | '需降级' | '应删除';

export interface AnalysisAssuranceSampleStratumProjection {
  sectionOrdinal: number;
  /** Candidates the section held, and how many of them the allocation drew. */
  candidates: number;
  sampled: number;
}

/**
 * One sampled finding's disposition. It names the finding by `ref` and lives only here: no finding is
 * edited, deleted, reordered, or re-ranked by a disposition, which is evidence for the editor and for
 * the Run Report and never a verdict.
 */
export interface AnalysisAssuranceSampleDispositionProjection {
  ref: string;
  unitOrdinal: number;
  /** The finding's own tier: the baseline kind's confidence, the factual kind's severity. */
  tier: string;
  disposition: AnalysisAssuranceDisposition;
  reason: string;
}

/** Estimated precision of one tier of the sampled set: upheld over sampled, rounded to two decimals. */
export interface AnalysisAssuranceSamplePrecisionProjection {
  tier: string;
  sampled: number;
  upheld: number;
  estimate: number;
}

/**
 * What the assurance sampling suboperation did in the Run that produced this revision, including why
 * it did not run. Like the cross-unit reduction it forms no execution-span row of its own, so this is
 * where its turns are recorded. The seed is disclosed so the sample can be redrawn from the manifest
 * and the revision's own findings and checked.
 */
export interface AnalysisAssuranceSampleProjection {
  state: 'closed' | 'closed-with-gaps' | 'gap' | 'not-run';
  /** The recorded seed the draw is reproducible from; `null` when no sample was drawn. */
  seed: string | null;
  size: number;
  candidateCount: number;
  strata: ReadonlyArray<AnalysisAssuranceSampleStratumProjection>;
  dispositions: ReadonlyArray<AnalysisAssuranceSampleDispositionProjection>;
  precision: ReadonlyArray<AnalysisAssuranceSamplePrecisionProjection>;
  /** What the sampling turns cost; `null` when none dispatched or none reported usage. */
  usage: { inputTokens: number; outputTokens: number } | null;
  /** The exact reason for a gap or for not running; `null` when every turn closed. */
  reason: string | null;
}

/**
 * The Run Report (ADR 0066 §Run Report): one durable record of what a Run did, written once into the
 * Run's Task Outcome and never rewritten. It is the first learning loop — the document the Owner
 * reads at the end of Phase 1 and the accounting a future Run of the same manuscript reads first.
 *
 * The report counts and never restates. No finding, entity, quotation, synopsis, or block text
 * appears anywhere in it: every value is a count, a closed code, an enum, an instant, a token figure,
 * or a digest. That is what lets its stable part travel to a model as the reflection turn's whole
 * input with no manuscript content going with it.
 */
export const RUN_REPORT_STAGES = ['units', 'cross-unit-reduction', 'assurance-sampling', 'reduction'] as const;
export type RunReportStageId = (typeof RUN_REPORT_STAGES)[number];

/**
 * The stages usage is accounted under. `reduction` is deterministic and never transmits, so it has
 * wall time and no usage; the reflection turn dispatches after the revision is already immutable, so
 * it has usage and no stage row. The first three therefore sum to the revision's own recorded usage
 * field by field, which is the reconciliation the Run Report promises.
 */
export const RUN_REPORT_USAGE_STAGES = ['units', 'cross-unit-reduction', 'assurance-sampling', 'run-report-reflection', 'platform-tools'] as const;
export type RunReportUsageStageId = (typeof RUN_REPORT_USAGE_STAGES)[number];

export interface RunReportUsageProjection {
  localToolCalls?: Readonly<Record<string, number>>;
  retrievalCalls?: number;
  exactFetchCalls?: number;
  refusedRetrievalCalls?: number;
  searchCalls?: Readonly<Record<string, number>>;
  refusedSearchCalls?: number; searchFailures?: Readonly<Record<string, number>>;
  fetchCount?: number;
  fetchBytes?: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * One stage's row. The three time fields are present exactly when the owner entered the stage, so a
 * stage that never ran carries `not-run` and no instants rather than a zero that would read as work
 * done in no time. `wallMs` is the sum of the stage's own disjoint segments: for `reduction`, whose
 * two segments sit either side of the sampling await, that is deliberately less than the distance
 * between `startedAt` and `settledAt`, so the four stage totals partition the Run's work.
 */
export interface RunReportStageProjection {
  stage: RunReportStageId;
  state: 'closed' | 'closed-with-gaps' | 'gap' | 'not-run';
  startedAt: string | null;
  settledAt: string | null;
  wallMs: number | null;
}

export interface RunReportUnitAccountingProjection {
  submitted: number;
  reused: number;
  recomputed: number;
  gaps: number;
  retried: number;
  /**
   * Units the Run planned not to read (Issue #417). Present only when there is at least one, so the
   * accounting — and the digest taken over it — of every Run that has none is exactly what it was.
   */
  unreviewed?: number;
}

export interface RunReportUnitRowProjection {
  unitOrdinal: number;
  state: 'closed' | 'gap';
  /** `unreviewed` is a unit the Run's plan left out of scope: neither recomputed nor reused, and never dispatched. */
  lineage: 'recomputed' | 'reused' | 'unreviewed';
  /** Model turns this unit cost: `0` for a reused unit and for one an interrupted loop never reached. */
  attempts: number;
  wallMs: number | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  gapCode: AnalysisGapProjection['code'] | null;
}

export interface RunReportAdaptationProjection {
  unitOrdinal: number;
  classifiedReason: string;
  recordedAt: string;
}

/** One failure the Run carries, named by the stage that produced it and its classified code. */
export interface RunReportFailureProjection {
  stage: RunReportStageId;
  code: string;
  reason: string;
}

/** The assurance sample as the report copies it; never a second draw and never a recomputation. */
export interface RunReportAssuranceProjection {
  state: AnalysisAssuranceSampleProjection['state'];
  seed: string | null;
  size: number;
  candidateCount: number;
  precision: ReadonlyArray<AnalysisAssuranceSamplePrecisionProjection>;
  /** Sampled findings the model upheld as `成立`; the numerator every per-tier estimate is built from. */
  upheld: number;
}

/** One class of finding the Run produced, as the kind that owns it names its own classes. */
export interface RunReportFindingCountProjection {
  kind: string;
  count: number;
}

export interface RunReportSuggestionProjection {
  suggestion: string;
  basis: string;
}

/**
 * The `if redone` list: what the model would do differently on the next Run of this manuscript. It
 * closes only when the reflection turn dispatched and parsed; every other outcome states its reason
 * in the reader's own language, exactly as the two other suboperations state theirs. No item
 * restates a finding, quotes the manuscript, or proposes an edit — the contract forbids all three.
 */
export type RunReportIfRedoneProjection =
  | { state: 'closed'; items: ReadonlyArray<RunReportSuggestionProjection>; reason: null }
  | { state: 'not-run' | 'policy-bounded' | 'gap'; items: readonly []; reason: string };

/** The Run Report as it is recorded inside the Task Outcome, before its own digest is taken. */
export interface RunReportRecordProjection {
  /** The factual Run's frozen level and its disclosed offline-at-start downgrade, absent on predecessor reports. */
  factualAssurance?: FactualRunAssuranceProjection;
  webToolsBackend?: FrozenWebToolsBackend;
  /** Editorial choices only; no question or answer content enters the Run Report. */
  modelClarifications?: ReadonlyArray<{ unitOrdinal: number; outcome: 'answered' | 'no-answer' | 'timed-out' | 'unanswered'; line: string }>;
  schema: 'ai7.analysis.run-report/1';
  runRecordId: string;
  taskIntentId: string;
  /** The Run's one execution attempt; `null` for a Run that failed before its attempt was persisted. */
  attemptId: string | null;
  resultSetRevisionId: string | null;
  classification: 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted' | 'cancelled';
  recordedAt: string;
  stages: ReadonlyArray<RunReportStageProjection>;
  units: RunReportUnitAccountingProjection;
  unitRows: ReadonlyArray<RunReportUnitRowProjection>;
  adaptations: ReadonlyArray<RunReportAdaptationProjection>;
  failures: ReadonlyArray<RunReportFailureProjection>;
  usagePerStage: Readonly<Record<RunReportUsageStageId, RunReportUsageProjection>>;
  findingCounts: ReadonlyArray<RunReportFindingCountProjection>;
  assurance: RunReportAssuranceProjection;
  ifRedone: RunReportIfRedoneProjection;
  /**
   * SHA-256 over the canonical JSON of the report's stable accounting — stage states but not their
   * wall times, unit counts but not their instants, and neither the seed nor the reflection's own
   * result. Two deterministic replays of one fixture over one manuscript therefore mint the same
   * digest even though their clocks differ, which is what lets a fixture pin the reflection turn.
   */
  accountingDigest: string;
}

/** The report as a reader receives it: the recorded record with the digest of its own canonical JSON. */
export interface RunReportProjection extends RunReportRecordProjection {
  reportDigest: string;
  /**
   * A Run a 后台分析登记 started (Issue #864): which Enrollment version started it, the share of its ceiling the Run was held to,
   * and how the Run ended against that ceiling, in the reader's words. Read beside the recorded report, never part of its digest;
   * absent for every Run the editor started.
   */
  background?: ReadonlyArray<string>;
}

export interface AnalysisUnresolvedProjection {
  unitOrdinal: number;
  description: string;
  sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface AnalysisGapProjection {
  unitOrdinal: number;
  /**
   * Why the unit carries no result. The first five are things that went wrong or never happened in a
   * Run that meant to read the unit. `out-of-scope` (Issue #417) is the one that is not a failure: a
   * kind that leaves out-of-scope units unreviewed planned not to read this unit, never dispatched it,
   * and says so — `不在本次审阅范围内`. No baseline or factual Run produces it.
   */
  code: 'adapter-failure' | 'contract-invalid' | 'interrupted' | 'egress-refused' | 'not-attempted' | 'out-of-scope' | 'outcome-unknown';
  reason: string;
  startPosition: number;
  endPosition: number;
  blockIds: ReadonlyArray<string>;
}

export interface AnalysisReducerStageProjection {
  /**
   * The declared reducer stages of every analysis kind. The first five are the baseline kind's; the
   * factual-review kind (S18a) reports `unit-validation`, then `reference-integrity` — the
   * deterministic location of each quotation in the block it names — and `finding-reduction`.
   * `assurance-sampling` (S43) closes both kinds: it is the one stage every kind that declares a
   * sampling binding reports, and it sits after that kind's last stage.
   */
  stage:
    | 'unit-validation'
    | 'section-reduction'
    | 'contradiction-continuity'
    | 'cross-unit-reduction'
    | 'cross-chapter-consistency'
    | 'book-synthesis'
    | 'reference-integrity'
    | 'finding-reduction'
    | 'assurance-sampling';
  state: 'closed' | 'closed-with-gaps' | 'not-run';
  inputCount: number;
}

export interface AnalysisSectionProjection {
  sectionOrdinal: number;
  headingText: string | null;
  headingLevel: number | null;
  unitOrdinals: ReadonlyArray<number>;
  closedUnitOrdinals: ReadonlyArray<number>;
  gapUnitOrdinals: ReadonlyArray<number>;
  synopsis: string;
  entities: ReadonlyArray<AnalysisEntityProjection>;
  events: ReadonlyArray<AnalysisEventProjection>;
  relationships: ReadonlyArray<AnalysisRelationshipProjection>;
  settingClaims: ReadonlyArray<AnalysisSettingClaimProjection>;
  conflicts: ReadonlyArray<AnalysisConflictProjection>;
  unresolved: ReadonlyArray<AnalysisUnresolvedProjection>;
}

export interface AnalysisSynthesisProjection {
  synopsis: string;
  entities: ReadonlyArray<AnalysisEntityProjection>;
  events: ReadonlyArray<AnalysisEventProjection>;
  relationships: ReadonlyArray<AnalysisRelationshipProjection>;
  settingClaims: ReadonlyArray<AnalysisSettingClaimProjection>;
  conflicts: ReadonlyArray<AnalysisConflictProjection>;
  unresolved: ReadonlyArray<AnalysisUnresolvedProjection>;
}

/** Four independently labeled state axes; no aggregate flag, colour, or score collapses them. */
export interface AnalysisCoverageAxis {
  axis: 'coverage';
  state: 'complete' | 'partial';
  label: string;
  unitsTotal: number;
  unitsClosed: number;
  /** Closed units whose result was reused from the predecessor revision by lineage; disclosed, never hidden. */
  unitsReused: number;
  gapCount: number;
  /**
   * How many of `gapCount` are units the Run planned not to read (`out-of-scope`), so a reader can
   * tell a range review that did everything it was asked from a Run that lost units. Present only on
   * a revision of a kind that leaves out-of-scope units unreviewed (Issue #417).
   */
  unitsOutOfScope?: number;
}

export interface AnalysisReducerClosureAxis {
  axis: 'reducer-closure';
  state: 'closed' | 'closed-with-gaps' | 'open';
  label: string;
  stages: ReadonlyArray<AnalysisReducerStageProjection>;
}

/**
 * Exact-revision freshness. Only the latest revision of a Result Set can be `current`; an older
 * revision is `superseded` and stays labeled by its original pin, never as deleted or current truth.
 */
export interface AnalysisFreshnessAxis {
  axis: 'freshness';
  state: 'current' | 'stale' | 'superseded';
  label: string;
  boundRevisionId: string;
  boundRevisionDigest: string;
  currentRevisionId: string;
  currentWorkingDigest: string;
  currentJournalSequence: number;
  comparison: 'local-deterministic';
}

export interface AnalysisAssuranceAxis {
  axis: 'assurance';
  state: 'qualified' | 'qualified-with-open-conflicts' | 'limited';
  label: string;
  /** Unresolved conflicts from the deterministic pass and the units themselves; the reading it has always been. */
  unresolvedConflictCount: number;
  unresolvedItemCount: number;
  lowConfidenceUnitCount: number;
  /** Model-driven cross-unit findings, disclosed beside the deterministic count and never folded into it. */
  crossUnitFindingCount: number;
  /**
   * What the assurance sample found, when one closed: how many findings were judged, how many were
   * upheld, and the estimated precision. `null` when no sample closed. The axis *state* never moves on
   * a disposition — a sample is evidence about the findings, not a re-reading of the Run.
   */
  sampledPrecision: { size: number; upheld: number; estimate: number } | null;
  /** The kind's own statement of what its result is and is not; one exact text per analysis kind. */
  statement: AnalysisAssuranceStatement;
}

/**
 * The assurance statement of each analysis kind, exact and fixed. The baseline kind's says its result
 * is a structured summary; the factual-review kind's says its result is a list of checkable assertions
 * with their exact quotation positions and that no external evidence has checked any of them.
 */
export const BASELINE_ANALYSIS_ASSURANCE_STATEMENT = '仅为模型输出的结构化归纳；不构成事实判定、编辑评审或稿件变更。' as const;
export const FACTUAL_REVIEW_ASSURANCE_STATEMENT =
  '仅为模型列出的可核查断言与其精确引文位置；未经外部证据核查，不构成事实判定、编辑评审或稿件变更。' as const;
/** A review category's: findings are located, never decided — the editor disposes of each (V2-UX-REV-003). */
export const REVIEW_CATEGORY_ASSURANCE_STATEMENT =
  '仅为模型按审阅依据列出的发现与其精确引文位置；是否采纳由编辑逐条决定，不构成事实判定、合规结论或稿件变更。' as const;
/** 审稿意见 (Issue #429, S81c): a draft from the record and what was read, never a delivery (V2-UX-EVAL-013). */
export const READERS_REPORT_ASSURANCE_STATEMENT =
  '审稿意见是模型依据定稿的评估记录与所读稿件写成的草稿，由编辑在稿件编辑面上修改；它不会交付或发送，也不改变评估记录。' as const;
/** AI7's 初评 (Issue #429, S81b1): scores to score against, never the editor's — the record keeps theirs (V2-UX-EVAL-006). */
export const INITIAL_EVALUATION_ASSURANCE_STATEMENT =
  'AI7 初评是模型据所读稿件给出的初步分数与评语，只作编辑打分的参考；记录保存的是编辑的评分，结论由编辑选定。' as const;
/** 按我的评分重写评语 (Issue #429, S81b2): words to the editor's scores, never a number — 采用 is the editor's (V2-UX-EVAL-008). */
export const EVALUATION_REWRITE_ASSURANCE_STATEMENT =
  '重写的评语是模型按编辑的评分与所读稿件写成的建议文字，只在编辑采用后才记入评估；它不改任何分数，也不选定结论。' as const;
/** 写作任务 (Issue #432, S84a): a document draft the editor edits, with an exemplar only referenced (V2-UX-DELIV-007, KB-004). */
export const WRITING_ASSURANCE_STATEMENT =
  '写作草稿是模型依据本书的稿件与所列参考材料写成的文档草稿，由编辑在稿件编辑面上修改；范例只作参照，不照抄；草稿不会交付或发送。' as const;
/** 自定义分析维度 (Issue #922, slice 7f): per-unit answers to the editor's own question, located and never concluded across units. */
export const CUSTOM_ANALYSIS_ASSURANCE_STATEMENT =
  '仅为模型就编辑自拟的提问逐单元给出的回答与其精确引文位置；不跨单元归纳，不打分，不构成事实判定、编辑评审或稿件变更。' as const;
export type AnalysisAssuranceStatement =
  | typeof WRITING_ASSURANCE_STATEMENT
  | typeof CUSTOM_ANALYSIS_ASSURANCE_STATEMENT
  | typeof BASELINE_ANALYSIS_ASSURANCE_STATEMENT
  | typeof FACTUAL_REVIEW_ASSURANCE_STATEMENT
  | typeof REVIEW_CATEGORY_ASSURANCE_STATEMENT
  | typeof INITIAL_EVALUATION_ASSURANCE_STATEMENT
  | typeof READERS_REPORT_ASSURANCE_STATEMENT
  | typeof EVALUATION_REWRITE_ASSURANCE_STATEMENT;

export const BASELINE_ANALYSIS_KIND = 'baseline-manuscript-analysis' as const;
export const BASELINE_ANALYSIS_CONTRACT_VERSION = 'ai7.baseline-manuscript-analysis/1' as const;
export const BASELINE_ANALYSIS_TASK_GOAL = '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。' as const;

/**
 * The three exact update meanings (ADR 0047; editorial CONTEXT) beside the first baseline. Each mode
 * has one fixed Task goal text and one exact action label; a Task carries exactly one mode.
 */
export type BaselineAnalysisUpdateMode = 'sync-current' | 'reanalyze-range' | 'reanalyze-book';
export type BaselineAnalysisTaskMode = 'first-baseline' | BaselineAnalysisUpdateMode;
export const BASELINE_ANALYSIS_UPDATE_MODES: readonly BaselineAnalysisUpdateMode[] = ['sync-current', 'reanalyze-range', 'reanalyze-book'];
export const BASELINE_ANALYSIS_MODE_GOALS = {
  'first-baseline': BASELINE_ANALYSIS_TASK_GOAL,
  'sync-current': '将基线稿件分析同步到当前稿件：复用内容一致的兼容单元，仅重算失效闭包，追加一个结果集修订版。',
  'reanalyze-range': '重新分析所选范围：绕过所选内容块范围及其重叠闭包的既有模型结果，复用其余兼容单元，追加一个结果集修订版。',
  'reanalyze-book': '重新分析全书：绕过全部既有模型结果，按当前覆盖清单重算每个分析单元，追加一个结果集修订版。',
} as const satisfies Record<BaselineAnalysisTaskMode, string>;
export type BaselineAnalysisGoal = (typeof BASELINE_ANALYSIS_MODE_GOALS)[BaselineAnalysisTaskMode];
export const BASELINE_ANALYSIS_MODE_LABELS = {
  'first-baseline': '首次基线分析',
  'sync-current': '同步到当前稿件',
  'reanalyze-range': '重新分析所选范围',
  'reanalyze-book': '重新分析全书',
} as const satisfies Record<BaselineAnalysisTaskMode, string>;
export const BASELINE_ANALYSIS_MODE_MEANINGS = {
  'first-baseline': '对固定的任务输入修订版派生覆盖清单并逐单元执行基线稿件分析契约 v1，形成首个结果集修订版。',
  'sync-current': '复用与前一修订版内容一致（自身内容块与重叠内容块摘要逐一相同）的已闭合单元，仅重算确定性失效/依赖闭包，并针对当前稿件 pin 重新归约四个状态轴。',
  'reanalyze-range': '绕过所选内容块范围内的单元及其重叠上下文来自这些单元的单元的既有模型结果，其余兼容单元按血缘复用，并针对当前稿件 pin 重新归约四个状态轴。',
  'reanalyze-book': '绕过全部既有模型结果，按当前覆盖清单重算每个分析单元，即使清单与前一修订版完全相同也不复用任何单元。',
} as const satisfies Record<BaselineAnalysisTaskMode, string>;

/**
 * The second analysis kind (plan slice S18a): a **factual review** of the same Book, on the same real
 * path, with its own exact-versioned contract, Result Set identity, and Task modes. It lists the
 * Manuscript Assertions of each Analysis Unit and anchors each to the exact quotation position it
 * claims; it fetches no evidence, so nothing it records is a factual judgement (ADR 0066, ADR 0074).
 */
export const FACTUAL_REVIEW_KIND = 'factual-review' as const;
export const FACTUAL_REVIEW_CONTRACT_VERSION = 'ai7.factual-review/1' as const;
export const FACTUAL_REVIEW_TASK_GOAL = '对当前书稿执行事实核查，逐单元列出可核查断言并精确定位其引文，形成结果集修订版。' as const;
export const FACTUAL_REVIEW_EXPECTED_OUTCOME = '事实核查结果集修订版（事实核查契约 v1）' as const;

/**
 * The factual kind's two Task modes: the whole manuscript, or one explicitly selected block range.
 * `range` is admitted by the durable schema (revision 20) and carries its fixed goal; the Task surface
 * that offers it arrives with S18b, so this slice prepares only `whole-manuscript`.
 */
export type FactualReviewTaskMode = 'whole-manuscript' | 'range';
export const FACTUAL_REVIEW_TASK_MODES: readonly FactualReviewTaskMode[] = ['whole-manuscript', 'range'];
export const FACTUAL_REVIEW_MODE_GOALS = {
  'whole-manuscript': FACTUAL_REVIEW_TASK_GOAL,
  range: '对所选内容块范围执行事实核查，逐单元列出可核查断言并精确定位其引文，形成结果集修订版。',
} as const satisfies Record<FactualReviewTaskMode, string>;
export type FactualReviewGoal = (typeof FACTUAL_REVIEW_MODE_GOALS)[FactualReviewTaskMode];
export const FACTUAL_REVIEW_MODE_LABELS = {
  'whole-manuscript': '全书事实核查',
  range: '所选范围事实核查',
} as const satisfies Record<FactualReviewTaskMode, string>;
export const FACTUAL_REVIEW_MODE_MEANINGS = {
  'whole-manuscript': '对固定的任务输入修订版派生覆盖清单并逐单元执行事实核查契约 v1，列出可核查断言并按内容块文本确定性校验每条引文。',
  range: '仅对所选内容块范围内的分析单元执行事实核查契约 v1，其余单元不进入本次运行。',
} as const satisfies Record<FactualReviewTaskMode, string>;

/**
 * AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-001, EVAL-005 to EVAL-007): the evaluation kind, on the same real path
 * as the others, read under its own exact-versioned contract `ai7.evaluation/1`. Each Analysis Unit is read for what bears on
 * each scored item of the house Evaluation Profile, every observation citing the blocks it rests on; one book-level synthesis
 * then scores each item in half points within its 满分, with a comment, and states the strengths, the weaknesses, a next step
 * and the conclusion it would suggest. The scores are AI7's draft beside the editor's; the record keeps the editor's.
 */
export const INITIAL_EVALUATION_KIND = 'evaluation' as const;
export const INITIAL_EVALUATION_CONTRACT_VERSION = 'ai7.evaluation/1' as const;
export const INITIAL_EVALUATION_EXPECTED_OUTCOME = 'AI7 初评结果集修订版（评估契约 v1）' as const;
/** The first 初评 of a Book, and every later one: the whole manuscript read again, nothing carried over. */
export type InitialEvaluationTaskMode = 'evaluation-first' | 'evaluation-again';
export const INITIAL_EVALUATION_TASK_MODES: readonly InitialEvaluationTaskMode[] = ['evaluation-first', 'evaluation-again'];
export const INITIAL_EVALUATION_UPDATE_MODES: readonly InitialEvaluationTaskMode[] = ['evaluation-again'];
export const INITIAL_EVALUATION_MODE_GOALS = {
  'evaluation-first': '按本社评估方案对当前书稿做 AI7 初评：逐单元记下各评分项的依据并引用内容块，再就全书给出各项初评分数与评语，形成结果集修订版。',
  'evaluation-again': '重新做 AI7 初评：按当前覆盖清单重读每个分析单元，不沿用以前的结果，就全书重新给出各项初评分数与评语，追加一个结果集修订版。',
} as const satisfies Record<InitialEvaluationTaskMode, string>;
export type InitialEvaluationGoal = (typeof INITIAL_EVALUATION_MODE_GOALS)[InitialEvaluationTaskMode];
export const INITIAL_EVALUATION_MODE_LABELS = {
  'evaluation-first': 'AI7 初评',
  'evaluation-again': '重新初评',
} as const satisfies Record<InitialEvaluationTaskMode, string>;
export const INITIAL_EVALUATION_MODE_MEANINGS = {
  'evaluation-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行评估契约 v1，再做一次全书综合，形成首个结果集修订版。',
  'evaluation-again': '绕过全部既有单元结果，按当前覆盖清单重读每个分析单元并重新做全书综合，追加一个结果集修订版。',
} as const satisfies Record<InitialEvaluationTaskMode, string>;

/**
 * 审稿意见 (Issue #429, plan slice S81c; V2-UX-EVAL-013; editor-surfaces §5): the reader's report kind, on the same real path
 * as the others, read under its own exact-versioned contract `ai7.readers-report/1`. It is drafted from one finalized
 * Evaluation Record under one of the two V1 templates: each Analysis Unit is read for the passages the report can point to —
 * what bears out a strength, shows a problem, or where a revision applies — each citing its blocks; one book-level synthesis
 * then writes the five sections from the record and those passages. The draft is an Editorial Artifact the editor edits;
 * nothing of it is delivered or sent.
 */
export const READERS_REPORT_KIND = 'readers-report' as const;
export const READERS_REPORT_CONTRACT_VERSION = 'ai7.readers-report/1' as const;
export const READERS_REPORT_EXPECTED_OUTCOME = '审稿意见草稿结果集修订版（审稿意见契约 v1）' as const;
/** The first draft of a Book's 审稿意见, and every later one: the whole manuscript read again, nothing carried over. */
export type ReadersReportTaskMode = 'readers-report-first' | 'readers-report-again';
export const READERS_REPORT_TASK_MODES: readonly ReadersReportTaskMode[] = ['readers-report-first', 'readers-report-again'];
export const READERS_REPORT_UPDATE_MODES: readonly ReadersReportTaskMode[] = ['readers-report-again'];
export const READERS_REPORT_MODE_GOALS = {
  'readers-report-first': '从定稿的评估记录起草审稿意见：逐单元找出可以引用的段落并引用内容块，再按所选模板写出总体评价、主要优点、主要问题、修改建议与结论，形成结果集修订版。',
  'readers-report-again': '重新起草审稿意见：按当前覆盖清单重读每个分析单元，不沿用以前的结果，按所选模板重新写出五个部分，追加一个结果集修订版。',
} as const satisfies Record<ReadersReportTaskMode, string>;
export type ReadersReportGoal = (typeof READERS_REPORT_MODE_GOALS)[ReadersReportTaskMode];
export const READERS_REPORT_MODE_LABELS = {
  'readers-report-first': '起草审稿意见',
  'readers-report-again': '重新起草审稿意见',
} as const satisfies Record<ReadersReportTaskMode, string>;
export const READERS_REPORT_MODE_MEANINGS = {
  'readers-report-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行审稿意见契约 v1，再做一次全书综合，形成首个结果集修订版。',
  'readers-report-again': '绕过全部既有单元结果，按当前覆盖清单重读每个分析单元并重新做全书综合，追加一个结果集修订版。',
} as const satisfies Record<ReadersReportTaskMode, string>;
/** The two V1 templates (EVAL-013): for the author, or for the editorial board and its topic meeting. */
export type ReadersReportTemplate = 'author' | 'editorial';
export const READERS_REPORT_TEMPLATES: readonly ReadersReportTemplate[] = ['author', 'editorial'];
export const READERS_REPORT_TEMPLATE_LABELS: Readonly<Record<ReadersReportTemplate, string>> = {
  author: '给作者的修改意见',
  editorial: '给编辑部 / 选题会的审读报告',
};
/** The five sections every 审稿意见 is structured in (EVAL-013), in their order. */
export type ReadersReportSectionId = 'overall' | 'strengths' | 'problems' | 'suggestions' | 'conclusion';
export const READERS_REPORT_SECTIONS: readonly ReadersReportSectionId[] = ['overall', 'strengths', 'problems', 'suggestions', 'conclusion'];
export const READERS_REPORT_SECTION_LABELS: Readonly<Record<ReadersReportSectionId, string>> = {
  overall: '总体评价',
  strengths: '主要优点',
  problems: '主要问题',
  suggestions: '修改建议',
  conclusion: '结论',
};
/**
 * What the plan says when the house holds no 审稿意见 among its 范例 (the Owner's answer of 2026-10-07): the draft is written
 * without one, and the plan says so.
 */
export const READERS_REPORT_NO_EXEMPLAR = '本社暂无审稿意见范例，本次不参考范例' as const;
/** Under a live scope no Provider Processing policy names 审稿意见 yet: nothing is prepared or started there. */
export const READERS_REPORT_LIVE_UNAVAILABLE =
  '审稿意见暂不可用：当前的模型处理策略没有写明审稿意见可以发送给模型，在这个运行范围下不能准备或开始起草。' as const;

/**
 * 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008): the evaluation rewrite kind, on the same real path as the
 * others, read under its own exact-versioned contract `ai7.evaluation-rewrite/1`. It is asked of one version begun from AI7's
 * 初评 at one saved entry, once the editor's scores depart from AI7's: each Analysis Unit is read for what bears out the
 * editor's score of each item, citing its blocks; one book-level synthesis then rewrites each scored item's 评语 and the 总评
 * to the editor's scores, reasons and comments. It never writes a number: the result is a proposal the editor 采用 or 放弃,
 * and only 采用 records it — as a new entry of the version, every score as the editor left it.
 */
export const EVALUATION_REWRITE_KIND = 'evaluation-rewrite' as const;
export const EVALUATION_REWRITE_CONTRACT_VERSION = 'ai7.evaluation-rewrite/1' as const;
export const EVALUATION_REWRITE_EXPECTED_OUTCOME = '按编辑评分重写的评语结果集修订版（评语重写契约 v1）' as const;
/** The first rewrite of a Book's 评语, and every later one: the whole manuscript read again, nothing carried over. */
export type EvaluationRewriteTaskMode = 'evaluation-rewrite-first' | 'evaluation-rewrite-again';
export const EVALUATION_REWRITE_TASK_MODES: readonly EvaluationRewriteTaskMode[] = ['evaluation-rewrite-first', 'evaluation-rewrite-again'];
export const EVALUATION_REWRITE_UPDATE_MODES: readonly EvaluationRewriteTaskMode[] = ['evaluation-rewrite-again'];
export const EVALUATION_REWRITE_MODE_GOALS = {
  'evaluation-rewrite-first': '按编辑的评分重写评语：逐单元找出能说明编辑所给分数的依据并引用内容块，再把各评分项的评语与总评改写得与编辑的分数一致，不改任何分数，形成结果集修订版。',
  'evaluation-rewrite-again': '再次按编辑的评分重写评语：按当前覆盖清单重读每个分析单元，不沿用以前的结果，重新改写各评分项的评语与总评，不改任何分数，追加一个结果集修订版。',
} as const satisfies Record<EvaluationRewriteTaskMode, string>;
export type EvaluationRewriteGoal = (typeof EVALUATION_REWRITE_MODE_GOALS)[EvaluationRewriteTaskMode];
export const EVALUATION_REWRITE_MODE_LABELS = {
  'evaluation-rewrite-first': '按我的评分重写评语',
  'evaluation-rewrite-again': '再次按我的评分重写评语',
} as const satisfies Record<EvaluationRewriteTaskMode, string>;
export const EVALUATION_REWRITE_MODE_MEANINGS = {
  'evaluation-rewrite-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行评语重写契约 v1，再做一次全书综合，形成首个结果集修订版。',
  'evaluation-rewrite-again': '绕过全部既有单元结果，按当前覆盖清单重读每个分析单元并重新做全书综合，追加一个结果集修订版。',
} as const satisfies Record<EvaluationRewriteTaskMode, string>;
/** Under a live scope no Provider Processing policy names the rewrite yet: nothing is prepared or started there. */
export const EVALUATION_REWRITE_LIVE_UNAVAILABLE =
  '按我的评分重写评语暂不可用：当前的模型处理策略没有写明评语重写可以发送给模型，在这个运行范围下不能准备或开始。' as const;

/**
 * 写作任务 (Issue #432, plan slice S84a; V2-UX-DELIV-007, KB-004; editor-surfaces §9 新建文档 · 写作任务): the writing kind, on
 * the same real path as the others, read under its own exact-versioned contract `ai7.writing/1`. It drafts one Production
 * Document of a house type: each Analysis Unit is read for the passages the document can draw on — a highlight, a character,
 * a theme or background — each citing its blocks; one book-level synthesis then writes the document's title and sections from
 * those passages, the Book's metadata, its synopsis and characters, its 定稿 evaluation's conclusion and marketing points, the
 * house's 范例 of the type — referenced, never copied — and the audience, channel and requirements the editor wrote. The draft
 * is an Editorial Artifact in the document's 起草 phase; nothing of it is delivered or sent.
 */
export const WRITING_KIND = 'writing' as const;
export const WRITING_CONTRACT_VERSION = 'ai7.writing/1' as const;
export const WRITING_EXPECTED_OUTCOME = '生产文档草稿结果集修订版（写作契约 v1）' as const;
/** The first writing Task of a Book, and every later one, of whatever type: the whole manuscript read again, nothing carried over. */
export type WritingTaskMode = 'writing-first' | 'writing-again';
export const WRITING_TASK_MODES: readonly WritingTaskMode[] = ['writing-first', 'writing-again'];
export const WRITING_UPDATE_MODES: readonly WritingTaskMode[] = ['writing-again'];
export const WRITING_MODE_GOALS = {
  'writing-first': '起草生产文档：逐单元找出文档可以取用的看点、人物与主题并引用内容块，再依据所列参考材料与编辑写的受众、渠道和要求写出文档的标题与各部分，范例只作参照，形成结果集修订版。',
  'writing-again': '再次起草生产文档：按当前覆盖清单重读每个分析单元，不沿用以前的结果，依据所列参考材料重新写出文档的标题与各部分，范例只作参照，追加一个结果集修订版。',
} as const satisfies Record<WritingTaskMode, string>;
export type WritingGoal = (typeof WRITING_MODE_GOALS)[WritingTaskMode];
export const WRITING_MODE_LABELS = {
  'writing-first': '起草文档',
  'writing-again': '再次起草文档',
} as const satisfies Record<WritingTaskMode, string>;
export const WRITING_MODE_MEANINGS = {
  'writing-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行写作契约 v1，再做一次全书综合，形成首个结果集修订版。',
  'writing-again': '绕过全部既有单元结果，按当前覆盖清单重读每个分析单元并重新做全书综合，追加一个结果集修订版。',
} as const satisfies Record<WritingTaskMode, string>;
/** Under a live scope no Provider Processing policy names the writing kind yet: nothing is prepared or started there. */
export const WRITING_LIVE_UNAVAILABLE =
  '写作任务暂不可用：当前的模型处理策略没有写明写作任务可以发送给模型，在这个运行范围下不能准备或开始起草。' as const;
/** The editor's own words for the draft: who reads it, where it appears, and anything else it must do. */
export const MAX_WRITING_AUDIENCE_GRAPHEMES = 60;
export const MAX_WRITING_CHANNEL_GRAPHEMES = 60;
export const MAX_WRITING_REQUIREMENTS_GRAPHEMES = 300;
/**
 * 资料库 under a writing Task's 允许参考 (Issue #428; V2-UX-TASK-030, TASK-032, KB-007, KB-009): at most this many items, each at
 * most this many characters as its Material Index extracted them (the card's 「已提取 N 字」), and all of them together at most
 * this many. An item longer than one may be is offered disabled and refused with words, never cut: a plan references an item
 * whole or not at all.
 */
export const MAX_WRITING_MATERIALS = 4;
export const MAX_WRITING_MATERIAL_GRAPHEMES = 3_000;
export const MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES = 6_000;
/** At most this many 资料库 items are offered in 新建文档 · 写作任务, the latest arrivals first; the rest are counted. */
export const MAX_WRITING_MATERIAL_OFFERS = 50;
/**
 * Under a live scope no Provider Processing policy admits a 资料库 item: an item is the editor's own material, and developer-live
 * transmits only the Owner-designated Public SampleBooks (provider-processing-policy v7, ADR 0065; since v24 the five of ADR 0043 and ADR 0091). A plan that lists one is
 * never prepared or started there.
 */
export const WRITING_MATERIAL_LIVE_UNAVAILABLE =
  '资料库资料不能列进这个运行范围的写作计划：资料是编辑自己收集的材料，当前的模型处理策略只允许发送本社指定的公开样书，不能把资料库的文字发送给模型。' as const;

/**
 * The review-category kind family (Issue #417, plan slice S69): one analysis kind per Review Category,
 * `editorial-review/<categoryId>`, all read under the one exact-versioned contract
 * `ai7.editorial-review/1`. The categories themselves are configuration (V2-UX-REV-002: a house may
 * add one), so nothing here — and no durable CHECK — names a category: the family is admitted by the
 * shape of its kind identity, and the category's identity, label, guideline clauses and procedure are
 * frozen into each Task's prompt contract instead.
 */
export const EDITORIAL_REVIEW_KIND_PREFIX = 'editorial-review/' as const;
export const EDITORIAL_REVIEW_CONTRACT_VERSION = 'ai7.editorial-review/2' as const;
export type ReviewCategoryKindId = `${typeof EDITORIAL_REVIEW_KIND_PREFIX}${string}`;
/** A category identity: lower-case words joined by single hyphens, as the built-in nine are spelled. */
export const REVIEW_CATEGORY_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
export const MAX_REVIEW_CATEGORY_ID_LENGTH = 48;

export function isReviewCategoryId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_REVIEW_CATEGORY_ID_LENGTH && REVIEW_CATEGORY_ID_PATTERN.test(value);
}

export function reviewCategoryKindId(categoryId: string): ReviewCategoryKindId {
  if (!isReviewCategoryId(categoryId)) throw new Error('REVIEW_CATEGORY_ID_INVALID');
  return `${EDITORIAL_REVIEW_KIND_PREFIX}${categoryId}`;
}

/** The category a kind identity of the family names; `null` for every other kind and for a malformed one. */
export function reviewCategoryIdOfKind(kind: unknown): string | null {
  if (typeof kind !== 'string' || !kind.startsWith(EDITORIAL_REVIEW_KIND_PREFIX)) return null;
  const categoryId = kind.slice(EDITORIAL_REVIEW_KIND_PREFIX.length);
  return isReviewCategoryId(categoryId) ? categoryId : null;
}

export function isReviewCategoryKindId(kind: unknown): kind is ReviewCategoryKindId {
  return reviewCategoryIdOfKind(kind) !== null;
}

/**
 * The family's five Task modes. Two start a category's Result Set — the whole manuscript, or one
 * explicitly selected block range with every other unit left unreviewed — and three append to it:
 * again over the whole manuscript, only what changed since the predecessor, or one selected range.
 * A range review never reads a unit outside its range: chapter-by-chapter work must not need a
 * whole-book Run first, and 选章 must not silently send other chapters.
 */
export type ReviewCategoryInitialMode = 'review-first' | 'review-first-range';
export type ReviewCategoryUpdateMode = 'review-sync' | 'review-range' | 'review-again';
export type ReviewCategoryTaskMode = ReviewCategoryInitialMode | ReviewCategoryUpdateMode;
export const REVIEW_CATEGORY_TASK_MODES: readonly ReviewCategoryTaskMode[] =
  ['review-first', 'review-first-range', 'review-again', 'review-sync', 'review-range'];
export const REVIEW_CATEGORY_UPDATE_MODES: readonly ReviewCategoryUpdateMode[] = ['review-sync', 'review-range', 'review-again'];
export const REVIEW_CATEGORY_MODE_LABELS = {
  'review-first': '全书审阅',
  'review-first-range': '所选范围审阅',
  'review-again': '全书重新审阅',
  'review-sync': '只审改动过的章',
  'review-range': '所选范围重新审阅',
} as const satisfies Record<ReviewCategoryTaskMode, string>;
export const REVIEW_CATEGORY_MODE_MEANINGS = {
  'review-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行编辑审阅契约 v1，列出该类别的发现并按内容块文本确定性定位每条引文，形成首个结果集修订版。',
  'review-first-range': '仅对所选内容块范围及其重叠闭包内的分析单元执行编辑审阅契约 v1；其余单元不进入本次运行，在结果集修订版中记为“不在本次审阅范围内”。',
  'review-again': '绕过全部既有单元结果，按当前覆盖清单重审每个分析单元，即使清单与前一修订版完全相同也不复用任何单元。',
  'review-sync': '复用与前一修订版内容一致的已审单元，仅重审内容改动过的单元；此前未审且内容未变的单元保持未审。',
  'review-range': '重审所选内容块范围及其重叠闭包内的单元，其余内容一致的已审单元按血缘复用；范围外没有可复用结果的单元不进入本次运行，记为“不在本次审阅范围内”。',
} as const satisfies Record<ReviewCategoryTaskMode, string>;

/**
 * The fixed goal text of one mode of one category. It is derived from the category's label and the
 * mode alone, so the same category and mode always carry the same goal; the durable schema bounds
 * its length and the ledger checks the text itself (`ANALYSIS_GOAL_INVALID`).
 */
export type ReviewCategoryGoal = `${string}「${string}」${string}`;
export const MAX_REVIEW_CATEGORY_GOAL_LENGTH = 400;
/**
 * The longest goal any Task Intent holds, in characters (Issue #423, slice 7a): a Task Intent Draft's sentence — which a promoted
 * Task keeps as its goal — and every kind's own goal. Counted in code points, so it never holds more than as many graphemes.
 */
export const MAX_TASK_INTENT_GOAL_LENGTH = 400;
export function reviewCategoryModeGoal(label: string, mode: ReviewCategoryTaskMode): ReviewCategoryGoal {
  switch (mode) {
    case 'review-first':
      return `对当前书稿执行「${label}」审阅，逐单元列出发现并精确定位其引文，形成结果集修订版。`;
    case 'review-first-range':
      return `对所选内容块范围执行「${label}」审阅，逐单元列出发现并精确定位其引文，其余单元保持未审，形成结果集修订版。`;
    case 'review-again':
      return `重新执行「${label}」全书审阅：绕过全部既有单元结果，按当前覆盖清单重审每个分析单元，追加一个结果集修订版。`;
    case 'review-sync':
      return `将「${label}」审阅同步到当前稿件：复用内容一致的已审单元，仅重审改动过的单元，追加一个结果集修订版。`;
    case 'review-range':
      return `重新审阅所选范围的「${label}」：重审所选内容块范围及其重叠闭包，复用其余已审单元，追加一个结果集修订版。`;
  }
}
export function reviewCategoryExpectedOutcome(label: string): string {
  return `「${label}」审阅结果集修订版（编辑审阅契约 v1）`;
}

/**
 * 自定义分析维度 (Issue #922, wave 10 slice 7f; ADR 0090 item 4): an AI7-owned document the editor writes in 知识库 › 工序与规则 —
 * a title that is only a label, one bounded per-unit question template, and the answer schema and Authority Ceiling AI7 fixes — run
 * as the analysis kind family `custom-analysis/<dimension-id>` under the one contract `ai7.custom-analysis/1`. It is not a DSH
 * Skill and carries no prompt of its own beyond the template: AI7's framing around it is fixed. Each dimension is its own kind,
 * so each keeps its own Result Set (ANALYSIS-009), and its Tasks take the baseline's four modes.
 */
export const CUSTOM_ANALYSIS_KIND_PREFIX = 'custom-analysis/' as const;
export const CUSTOM_ANALYSIS_CONTRACT_VERSION = 'ai7.custom-analysis/1' as const;
export const CUSTOM_ANALYSIS_DIMENSION_SCHEMA = 'ai7.custom-analysis-dimension/1' as const;
export type CustomAnalysisKindId = `${typeof CUSTOM_ANALYSIS_KIND_PREFIX}${string}`;
/** A dimension identity is a lower-case UUID, which the durable kind GLOB `custom-analysis/[a-z0-9-]*` admits. */
export const CUSTOM_ANALYSIS_DIMENSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const MAX_CUSTOM_ANALYSIS_TITLE_GRAPHEMES = 40;
/** The template bound is the Provider Processing v22/v23 term `EDITOR_AUTHORED_QUESTION_TEMPLATE_MAX_GRAPHEMES` states. */
export const MAX_CUSTOM_ANALYSIS_TEMPLATE_GRAPHEMES = 400;
export const MAX_CUSTOM_ANALYSIS_ANSWER_GRAPHEMES = 300;
export const MAX_CUSTOM_ANALYSIS_QUOTE_GRAPHEMES = 80;
export const MAX_CUSTOM_ANALYSIS_CONFIDENCE_NOTE_GRAPHEMES = 120;
/** At most this many answer rows one unit may return; more is a refused unit result, never a cut. */
export const MAX_CUSTOM_ANALYSIS_ROWS_PER_UNIT = 12;
/** The one placeholder a template may carry: where the unit's text stands in the question. */
export const CUSTOM_ANALYSIS_UNIT_PLACEHOLDER = '{本单元}' as const;
/** At most this many dimensions, versions of one dimension, and answer rows of one revision a projection lists. */
export const MAX_CUSTOM_ANALYSIS_DIMENSIONS_SHOWN = 40;
export const MAX_CUSTOM_ANALYSIS_VERSIONS_SHOWN = 12;
export const MAX_CUSTOM_ANALYSIS_ROWS_SHOWN = 120;

export function isCustomAnalysisDimensionId(value: unknown): value is string {
  return typeof value === 'string' && CUSTOM_ANALYSIS_DIMENSION_ID_PATTERN.test(value);
}

export function customAnalysisKindId(dimensionId: string): CustomAnalysisKindId {
  if (!isCustomAnalysisDimensionId(dimensionId)) throw new Error('CUSTOM_ANALYSIS_DIMENSION_ID_INVALID');
  return `${CUSTOM_ANALYSIS_KIND_PREFIX}${dimensionId}`;
}

/** The dimension a kind identity of the family names; `null` for every other kind and for a malformed one. */
export function customAnalysisDimensionIdOfKind(kind: unknown): string | null {
  if (typeof kind !== 'string' || !kind.startsWith(CUSTOM_ANALYSIS_KIND_PREFIX)) return null;
  const dimensionId = kind.slice(CUSTOM_ANALYSIS_KIND_PREFIX.length);
  return isCustomAnalysisDimensionId(dimensionId) ? dimensionId : null;
}

export function isCustomAnalysisKindId(kind: unknown): kind is CustomAnalysisKindId {
  return customAnalysisDimensionIdOfKind(kind) !== null;
}

/** A kind's mode goal stays stable across document versions; the plan separately names its exact dimension version and title. */
export type CustomAnalysisGoal = `自定义分析：${string}`;
export function customAnalysisModeGoal(mode: BaselineAnalysisTaskMode): CustomAnalysisGoal {
  switch (mode) {
    case 'first-baseline':
      return '自定义分析：逐单元回答该维度的提问并定位所依据的原文，形成结果集修订版。';
    case 'sync-current':
      return '自定义分析：同步到当前稿件，复用内容一致的单元，仅重新回答改动过的单元，追加一个结果集修订版。';
    case 'reanalyze-range':
      return '自定义分析：重新回答所选范围及其重叠闭包，复用其余单元，追加一个结果集修订版。';
    case 'reanalyze-book':
      return '自定义分析：绕过全部既有单元结果，逐单元重新回答全书，追加一个结果集修订版。';
  }
}
export function customAnalysisExpectedOutcome(title: string): string {
  return `自定义分析「${title}」结果集修订版（自定义分析契约 v1）`;
}

/** The AI7-owned dimension document, exactly as one version freezes it and its digest covers it. */
export interface CustomAnalysisDimensionDocument {
  schema: typeof CUSTOM_ANALYSIS_DIMENSION_SCHEMA;
  /** The editor's label for the dimension; shown in AI7 and never sent to a model service. */
  title: string;
  /** The editor's per-unit question, bounded, carrying no manuscript text; `{本单元}` at most marks where the unit stands. */
  questionTemplate: string;
  /** The answer every unit returns, fixed by AI7 (ADR 0090 item 4): the editor cannot change it. */
  answerSchema: {
    unitResultSchema: 'ai7.custom-analysis.unit-result/1';
    row: { answerMaxGraphemes: 300; anchor: 'block-ordinal-and-verbatim-quote'; quoteMaxGraphemes: 80; confidenceNoteMaxGraphemes: 120; score: 'never' };
    maxRowsPerUnit: 12;
  };
  /** What a Run of the dimension may do, fixed by AI7: read the current Book's run source, change nothing, call no tool, synthesize nothing across units. */
  authorityCeiling: { runSourceScope: 'current-book'; mutation: 'none'; platformTools: 'none'; localTools: 'none'; crossUnitSynthesis: 'none' };
}

export type CustomAnalysisDimensionState = 'pending-validation' | 'enabled' | 'stopped';
export const CUSTOM_ANALYSIS_DIMENSION_STATE_LABELS = {
  'pending-validation': '待验证',
  enabled: '已启用',
  stopped: '已停用',
} as const satisfies Record<CustomAnalysisDimensionState, string>;

export interface CustomAnalysisDimensionVersionProjection {
  versionId: string;
  version: number;
  title: string;
  questionTemplate: string;
  documentDigest: string;
  /** The version this one supersedes; `null` for version 1. */
  supersedes: null | { versionId: string; version: number };
  state: CustomAnalysisDimensionState;
  stateLabel: string;
  createdAt: string;
  stateRecordedAt: string;
  /** How many Tasks of any Book were prepared under this exact version; historical Runs keep naming it after 停用. */
  taskCount: number;
}

/** One answer row of one unit as the reducer kept it: the model's answer and the anchor the service itself located. */
export interface CustomAnalysisRowProjection {
  rowId: string;
  unitOrdinal: number;
  answer: string;
  confidenceNote: string;
  /** The block the model named, by its position in the unit message, and the quotation it gave. */
  blockOrdinal: number;
  quote: string;
  /** Where the quotation stands, located deterministically in that block; `null` when it was not found exactly once. */
  sourceRange: null | FactualSourceRangeProjection;
  anchorState: 'located' | 'not-found' | 'ambiguous';
}

/** The latest Result Set Revision of one dimension on one Book, as ②A's 自定义 tab reads it (ANALYSIS-001, ANALYSIS-009). */
export interface CustomAnalysisRevisionSummaryProjection {
  revisionId: string;
  ordinal: number;
  createdAt: string;
  /** The dimension version the revision was read under. */
  dimensionVersion: { versionId: string; version: number; documentDigest: string };
  manuscriptRevisionLabel: string;
  coverage: AnalysisCoverageAxis;
  freshness: AnalysisFreshnessAxis;
  gaps: ReadonlyArray<{ unitOrdinal: number; code: AnalysisGapProjection['code']; reason: string }>;
  rowCounts: { units: number; rows: number; located: number; unlocated: number };
  rows: ReadonlyArray<CustomAnalysisRowProjection>;
  rowsTruncated: boolean;
}

export interface CustomAnalysisDimensionProjection {
  dimensionId: string;
  kind: CustomAnalysisKindId;
  /** The latest version's title. */
  title: string;
  /** The newest version in 已启用: what 运行 prepares under; `null` while none is. */
  enabledVersion: null | { versionId: string; version: number };
  versions: ReadonlyArray<CustomAnalysisDimensionVersionProjection>;
  versionsTruncated: boolean;
  /** Present when the projection was read for a Book: that Book's Task and latest revision of the dimension. */
  book: null | {
    taskState: null | { taskIntentId: string; state: BaselineAnalysisProjection['state']; stateLabel: string };
    latest: null | CustomAnalysisRevisionSummaryProjection;
    /** Why 运行 is unavailable here; `null` when it can prepare. */
    unavailableReason: string | null;
  };
}

export interface CustomAnalysisDimensionsProjection {
  bookId: string | null;
  dimensions: ReadonlyArray<CustomAnalysisDimensionProjection>;
  truncated: boolean;
  /** What AI7 fixes for every dimension, as the editor reads it beside the template. */
  fixed: { answerSchema: CustomAnalysisDimensionDocument['answerSchema']; authorityCeiling: CustomAnalysisDimensionDocument['authorityCeiling'] };
}

export interface SaveCustomAnalysisDimensionInput {
  /** `null` saves version 1 of a new dimension; otherwise the next version of that dimension, superseding its latest. */
  dimensionId: string | null;
  title: string;
  questionTemplate: string;
}

export interface PrepareCustomAnalysisInput {
  bookId: string;
  dimensionId: string;
  update: BaselineAnalysisUpdateRequest | null; /** 同类型重做 / 重新准备 / 重新确认 (Issue #931): on the version that Task froze. */ from?: CustomAnalysisPreparationFrom | null;
}

/** Every analysis kind a Book may hold, and every Task mode any of them declares. */
export type AnalysisKindId = typeof BASELINE_ANALYSIS_KIND | typeof FACTUAL_REVIEW_KIND | ReviewCategoryKindId | typeof INITIAL_EVALUATION_KIND |
  typeof READERS_REPORT_KIND | typeof EVALUATION_REWRITE_KIND | typeof WRITING_KIND | CustomAnalysisKindId;
export type AnalysisTaskMode = BaselineAnalysisTaskMode | FactualReviewTaskMode | ReviewCategoryTaskMode | InitialEvaluationTaskMode | ReadersReportTaskMode |
  EvaluationRewriteTaskMode | WritingTaskMode;
export type AnalysisGoal = BaselineAnalysisGoal | FactualReviewGoal | ReviewCategoryGoal | InitialEvaluationGoal | ReadersReportGoal | EvaluationRewriteGoal |
  WritingGoal | CustomAnalysisGoal;

/** An explicit editor choice over exact block positions of the Task Input revision (inclusive). */
export interface BaselineAnalysisSelectedRange {
  startPosition: number;
  endPosition: number;
}

/** The update request carried by `prepareBaselineAnalysis` beside the fixed goal; `null` for the first baseline. */
export interface BaselineAnalysisUpdateRequest {
  mode: BaselineAnalysisUpdateMode;
  selectedRange: BaselineAnalysisSelectedRange | null;
  /**
   * 重新分析这段 (Issue #423 review, P3-3): the selection's first and last paragraph by block identity, which the service resolves
   * to `selectedRange` against the working manuscript as the Task is prepared — as 审阅这段 names its paragraphs. Only with
   * `reanalyze-range` and a `null` `selectedRange`; absent everywhere else.
   */
  selectedBlocks?: { fromBlockId: string; toBlockId: string } | null;
}

export interface AnalysisReusePlanCounts {
  reused: number;
  recomputed: number;
  invalidated: number;
  bypassed: number;
}

export interface AnalysisReusePlanUnitProjection {
  unitOrdinal: number;
  startPosition: number;
  endPosition: number;
  /** The content-exact, position-independent compatibility key of the new unit. */
  contentKey: string;
  disposition: 'reused' | 'recomputed';
  reason: 'compatible' | 'no-compatible-predecessor' | 'predecessor-gap' | 'contract-version-mismatch' | 'bypassed-selected-range' | 'bypassed-whole-book';
  reusedFrom: null | { revisionId: string; revisionOrdinal: number; unitOrdinal: number };
}

export interface AnalysisReusePlanPredecessorUnitProjection {
  unitOrdinal: number;
  state: 'closed' | 'gap';
  disposition: 'reused' | 'bypassed' | 'invalidated';
  successorUnitOrdinal: number | null;
}

/** The canonical, digested reuse plan: a plan component recorded at preparation and re-derived at execution. */
export interface AnalysisReusePlanProjection {
  schema: 'ai7.baseline-manuscript-analysis.reuse-plan/1';
  mode: BaselineAnalysisUpdateMode;
  contractVersion: typeof BASELINE_ANALYSIS_CONTRACT_VERSION;
  predecessor: { revisionId: string; ordinal: number; digest: string; contractVersion: string; coverageManifestDigest: string; unitCount: number };
  coverageManifestDigest: string;
  selectedRange: BaselineAnalysisSelectedRange | null;
  /** Unit ordinals `重新分析所选范围` recomputes: the intersecting units plus their overlap dependants. */
  recomputeClosure: ReadonlyArray<number>;
  units: ReadonlyArray<AnalysisReusePlanUnitProjection>;
  predecessorUnits: ReadonlyArray<AnalysisReusePlanPredecessorUnitProjection>;
  counts: AnalysisReusePlanCounts;
}

/** Per-unit lineage of a Result Set Revision: recomputed by this Run, or reused from an exact predecessor unit. */
export type AnalysisUnitLineage =
  | { kind: 'recomputed' }
  | { kind: 'reused'; revisionId: string; revisionOrdinal: number; unitOrdinal: number };

export type BaselineAnalysisRunState =
  | 'authorized'
  | 'blocked-before-dispatch'
  | 'admitted'
  | 'executing'
  | 'completed'
  | 'completed-with-gaps'
  | 'failed'
  | 'interrupted'
  // Connectivity Wait (Issue #502): authorized by 联网后开始任务 and waiting for Reconnect Preflight to admit it,
  // or cancelled by the editor while it waited — before it ever dispatched (OFF-005, OFF-010).
  | 'awaiting-connectivity'
  // `cancelled` is also where 取消任务 ends a Run that started (Issue #422, CTRL-005): after `cancelling`, 正在取消,
  // while the Run stops at the next unit boundary, and once what it did is classified and recorded.
  | 'cancelled'
  | 'cancelling'
  // 暂停 and 续行 (Issue #422, S76b; CTRL-001, CONT-014): 正在暂停 until the Run reaches a unit boundary, 已暂停 once what
  // it read is kept, and 任务已中断 · 可续行 for a Run AI7 stopped under, its authorization kept for 续行.
  | 'pausing'
  | 'paused'
  | 'resumable'
  // 任务等待你的说明 (Issue #422, S76d; CLAR-004): every unit the Run could read is read, and it waits — holding nothing —
  // for the editor's answer to what it asked before the rest can go on.
  | 'awaiting-clarification';

export type BaselineAnalysisUnitProjection =
  | {
      unitOrdinal: number;
      state: 'closed';
      /** The request digest of the model request that produced this result (the predecessor's for a reused unit). */
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: AnalysisUnitLineage;
      confidence: 'high' | 'medium' | 'low';
      synopsis: string;
      entities: ReadonlyArray<Omit<AnalysisEntityProjection, 'unitOrdinals'>>;
      events: ReadonlyArray<Omit<AnalysisEventProjection, 'unitOrdinal'>>;
      relationships: ReadonlyArray<Omit<AnalysisRelationshipProjection, 'unitOrdinals'>>;
      settingClaims: ReadonlyArray<Omit<AnalysisSettingClaimProjection, 'unitOrdinal'>>;
      conflicts: ReadonlyArray<{ description: string; sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection> }>;
      unresolved: ReadonlyArray<{ description: string; sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection> }>;
    }
  | {
      unitOrdinal: number;
      state: 'gap';
      requestDigest: string;
      lineage: AnalysisUnitLineage;
      gap: AnalysisGapProjection;
    };

/**
 * How a Result Set Revision came to be: its kind's initial mode, or one exact update of a predecessor
 * revision. The mode is any analysis kind's mode, because every kind records how its revision arose.
 */
export interface BaselineAnalysisRevisionUpdateProjection {
  mode: AnalysisTaskMode;
  modeLabel: string;
  predecessor: null | { revisionId: string; ordinal: number; digest: string };
  reusePlanDigest: string | null;
  selectedRange: BaselineAnalysisSelectedRange | null;
  counts: AnalysisReusePlanCounts;
}

/** The material plan fields whose drift between Plan Preview and Run Authorization requires a Plan Revision (Issue #48). */
export type MaterialPlanField =
  | 'providerBinding.providerId'
  | 'providerBinding.modelId'
  | 'providerBinding.adapterRevision'
  | 'providerBinding.configurationRevision'
  | 'providerBinding.credentialReference'
  | 'artifactPin.identity'
  | 'artifactPin.version'
  | 'artifactPin.nativeCarrierSha256'
  | 'artifactPin.sidecarRevision'
  | 'artifactPin.sidecarSha256'
  | 'selectedRange'
  | 'predecessorRevision'
  | 'runBudgetCeiling'
  | 'outboundDataCategory'
  | 'expectedOutcome'
  | 'selectedPolicyIdentity'
  | 'localFixtureProfile';

/** The material inputs one frozen plan version carries, re-derived from durable state for drift detection. */
export interface MaterialPlanInputsProjection {
  selectedPolicyIdentity?: SelectedPolicyIdentity;
  localFixtureProfile?: LocalFixtureProfile;
  providerBinding: { providerId: string; modelId: string; adapterRevision: number; configurationRevision: number; credentialReference: string };
  artifactPin: { identity: string; version: string; nativeCarrierSha256: string; sidecarRevision: number; sidecarSha256: string };
  selectedRange: BaselineAnalysisSelectedRange | null;
  predecessorRevision: { revisionId: string; ordinal: number; digest: string } | null;
  runBudgetCeiling: RunBudgetCeilingState;
  outboundDataCategory: 'public-or-synthetic' | 'unpublished-excerpts';
  expectedOutcome: string;
}

export type PlanRevisionDiffValue =
  | string
  | number
  | null
  | SelectedPolicyIdentity
  | LocalFixtureProfile
  | BaselineAnalysisSelectedRange
  | { revisionId: string; ordinal: number; digest: string }
  | AnalysisReusePlanCounts
  /** The ceiling is a material field, so an explicit token ceiling is a diffable value too. */
  | Extract<RunBudgetCeilingState, { kind: 'tokens' }>;

/** One line of a concise Plan Revision diff: the field, its prior and proposed values, and whether it is material or a derived consequence. */
export interface PlanRevisionDiffEntryProjection {
  field: MaterialPlanField | 'reusePlan.counts' | PlanEditField;
  label: string;
  prior: PlanRevisionDiffValue;
  proposed: PlanRevisionDiffValue;
  /** `edited` for the editor's own change to the plan (Issue #419, V2-UX-PLAN-011). */
  materiality: 'material' | 'derived' | 'edited';
}

/**
 * The editable plan (Issue #419, plan slice S73; V2-UX-PLAN-011): what the editor left out of a baseline analysis
 * plan — only what its Run honours. The plan AI7 proposed leaves out nothing.
 */
export interface PlanEditsProjection {
  /** 核对与抽检: the Run draws no assurance sample. */
  removedSteps: ReadonlyArray<'assurance-sampling'>;
  /** 不允许 the safe retry: a retry-safe failure settles as a gap. */
  disallowedAdaptations: ReadonlyArray<'safe-retry'>;
  /**
   * 先问你 (Issue #422, S76d; PLAN-011): the Run asks the editor before it makes the safe retry — a Clarification
   * Request — and makes it only once the editor answered 再试一次. Named only when it holds something.
   */
  askFirstAdaptations?: ReadonlyArray<'safe-retry'>;
  /**
   * 设置上限… (Issue #51, S16a; V2-UX-MODEL-015): the editor's Run Budget Ceiling, in total tokens, which the plan version
   * freezes into its Provider Resolution Plan. Named only when set; a plan without it states `未设置任务预算上限`.
   */
  runBudgetCeiling?: Extract<RunBudgetCeilingState, { kind: 'tokens' }>;
  /**
   * The Evidence Assurance Level of a factual-review Task (Issue #901; EASSURE-001): named only when it is not the default
   * 标准核查, so every plan written before it and every plan left at the default reads back byte for byte.
   */
  evidenceAssuranceLevel?: Exclude<EvidenceAssuranceLevel, 'standard'>;
}

/** The field a Plan Revision diff names for one edited item. */
export type PlanEditField = 'steps.assurance-sampling' | 'adaptations.safe-retry' | 'evidenceAssuranceLevel';

/** The Plan Boundary Split inside the canonical envelope: declared in-envelope adaptations, material fields, and expected editor participation. */
export interface PlanBoundarySplitProjection {
  adaptable: ReadonlyArray<{ adaptationClass: 'safe-retry' | 'contract-retry'; label: string; statement: string }>;
  /** The adaptations the editor moved into 先问你 (Issue #422, S76d); named only when there is one. */
  askFirst?: ReadonlyArray<{ adaptationClass: 'safe-retry'; label: string; statement: string }>;
  material: ReadonlyArray<{ field: MaterialPlanField; label: string }>;
  /** Whether the editor may be asked mid-Run, and where (PLAN-005). */
  participation: { expected: boolean; statement: string };
}

/** One immutable plan version of a Task Intent; only the latest can be `current` or `bound`. */
export interface BaselineAnalysisPlanVersionProjection {
  planVersionId: string;
  ordinal: number;
  planEnvelopeDigest: string;
  /** The Plan Revision this version resolved; `null` for the first version. */
  planRevisionId: string | null;
  createdAt: string;
  state: 'current' | 'superseded' | 'bound';
  /** What this version leaves out at the editor's word (Issue #419); nothing for a plan AI7 proposed. */
  edits: PlanEditsProjection;
}

/**
 * One Plan Revision: the immutable field-level diff between a prior plan version and the inputs
 * proposed for the next one. A stored pending revision (`planRevisionId` set, `state` `pending`)
 * awaits `重新确认计划`; a live entry (`planRevisionId` null) reports durable-state drift the store
 * detected on inspect and records at reconfirmation.
 *
 * A revision leaves `pending` in exactly three durable ways (Issue #281): `resolved` when a later
 * plan version links back to it, `superseded` when a later revision on the same prior version names
 * it in `supersedes`, and `reverted` when the revision is itself the way back — the plan returned to
 * the inputs its prior version froze, so that version stands and no new one is written. Nothing is
 * ever rewritten to say so: the later row carries the fact and every state here is derived from it.
 */
export interface BaselineAnalysisPlanRevisionProjection {
  planRevisionId: string | null;
  priorPlanVersionId: string;
  priorOrdinal: number;
  /** The version this revision yielded: the next one for `resolved`, the restored prior one for `reverted`, else `null`. */
  nextOrdinal: number | null;
  /** `plan-edit` for the editor's own 更新计划 (Issue #419). */
  trigger: 'prepare' | 'inspect' | 'reconfirm' | 'plan-edit';
  /** The record time of a stored revision; `null` for a live entry derived on inspect. */
  detectedAt: string | null;
  changedFields: ReadonlyArray<string>;
  diff: ReadonlyArray<PlanRevisionDiffEntryProjection>;
  proposed: MaterialPlanInputsProjection;
  /** How this revision was settled, or that it still awaits the editor. */
  state: PlanRevisionState;
  /** The earlier pending revisions on the same prior version this one settled; empty for every other row. */
  supersedes: ReadonlyArray<string>;
  /** Settled in any of the three ways — `state !== 'pending'`; a settled revision asks the editor for nothing. */
  resolved: boolean;
  label: string;
}

/** How a Plan Revision stands: awaiting the editor, or settled by a later version, a later revision, or the way back. */
export type PlanRevisionState = 'pending' | 'resolved' | 'superseded' | 'reverted';

/** One durable `safe-retry` Plan Adaptation of a Run: written before the retry is dispatched, inside the unchanged envelope and binding. */
export interface BaselineAnalysisPlanAdaptationProjection {
  adaptationId: string;
  attemptId: string;
  runRecordId: string;
  taskIntentId: string;
  ordinal: number;
  unitOrdinal: number;
  adaptationClass: 'safe-retry' | 'contract-retry';
  attemptIndex: number;
  classifiedReason: string;
  failureCode: string;
  failureClass: string;
  failureStatus: number | null;
  requestDigest: string;
  firstPayloadDigest: string | null;
  /**
   * The digest of the unit message the first attempt submitted — the range's manuscript text as the model reads it —
   * which the retry must repeat byte for byte (Issue #286). `null` on an adaptation recorded before it was kept.
   */
  firstUnitMessageDigest: string | null;
  planEnvelopeDigest: string;
  bindingDigest: string;
  recordedAt: string;
  /**
   * The retry's own turn, found by the span that names this adaptation (Issue #286): the digest of the unit message it
   * submitted, and the gate's digest of its whole payload — which on a single-Session route also holds the turns before
   * it, so it differs from the first attempt's by construction. For older records, the one legacy adaptation and the
   * one legacy second attempt of the same unit and execution attempt may supply the payload digest without a unit-message
   * digest. `null` until the retry's turn is recorded or when no unambiguous association can be made.
   */
  retry: null | { spanOrdinal: number; unitMessageDigest: string | null; payloadDigest: string | null };
  /**
   * Whether the retry repeated the first attempt's unit message byte for byte, the one property `safe-retry` promises
   * (Issue #286): `byte-identical`; `differs`, a violation the label names; or `unrecorded` when either digest was not
   * kept — an adaptation recorded before them, or a retry not yet recorded.
   */
  repetition: SafeRetryRepetition;
  label: string;
}

/** How a safe retry's unit message compares with its first attempt's (Issue #286). */
export type SafeRetryRepetition = 'byte-identical' | 'differs' | 'unrecorded';

export interface BaselineAnalysisExecutionBindingProjection {
  compositionVersion?: 2 | 3 | 4;
  attemptId: string;
  bindingDigest: string;
  harnessSessionId: string;
  behaviorCompositionDigest: string;
  promptContractDigest: string;
  planEnvelopeDigest: string;
  runSourceScopeDigest: string;
  providerResolutionPlanDigest: string;
  coverageManifestDigest: string;
  route: ExecutionRouteId;
  model: string;
  /** The deterministic fixture pin; `null` on the developer-live route, which replays no fixture. */
  fixtureIdentity: string | null;
  fixtureSha256: string | null;
  nativeCarrierSha256: string;
  sidecarRevision: 2;
  boundAt: string;
}

export interface BaselineAnalysisResultSetRevisionProjection {
  resultSetId: string;
  revisionId: string;
  ordinal: number;
  createdAt: string;
  digest: string;
  contractVersion: typeof BASELINE_ANALYSIS_CONTRACT_VERSION;
  manuscriptPin: { bookId: string; manuscriptId: string; revisionId: string; revisionLabel: string; revisionDigest: string };
  coverageManifestDigest: string;
  schemaDigest: string;
  reducerDigest: string;
  adapterPin: { route: ExecutionRouteId; model: string; fixtureIdentity: string | null; fixtureSha256: string | null };
  bindingPin: { attemptId: string; bindingDigest: string; harnessSessionId: string; behaviorCompositionDigest: string; promptContractDigest: string };
  policyPin: ResultSetPolicyPin;
  /** The producing Run; from Issue #48 also the bound plan version and the in-envelope adaptations the Run recorded. */
  provenance: { taskIntentId: string; runRecordId: string; attemptId: string; planVersion?: number; adaptations?: { count: number; unitOrdinals: ReadonlyArray<number> } };
  /** Model usage of this Run: counted for recomputed units only, every attempt included; reused units cost nothing. */
  usage: { inputTokens: number; outputTokens: number; requests: number };
  update: BaselineAnalysisRevisionUpdateProjection;
  /** Per-unit lineage in unit order; every entry of `units` carries the same fact. */
  lineage: ReadonlyArray<{ unitOrdinal: number } & AnalysisUnitLineage>;
  coverage: AnalysisCoverageAxis;
  reducerClosure: AnalysisReducerClosureAxis;
  freshness: AnalysisFreshnessAxis;
  assurance: AnalysisAssuranceAxis;
  gaps: ReadonlyArray<AnalysisGapProjection>;
  conflicts: ReadonlyArray<AnalysisConflictProjection>;
  /** Model-driven cross-unit findings beside the deterministic conflicts; empty when the reduction did not close. */
  crossUnitFindings: ReadonlyArray<AnalysisCrossUnitFindingProjection>;
  crossUnitReduction: AnalysisCrossUnitReductionProjection;
  /** The adversarial sample drawn over `crossUnitFindings` after the reduction; it edits none of them. */
  assuranceSample: AnalysisAssuranceSampleProjection;
  sections: ReadonlyArray<AnalysisSectionProjection>;
  synthesis: AnalysisSynthesisProjection;
  units: ReadonlyArray<BaselineAnalysisUnitProjection>;
}

/** The latest Task's update facts when it is one of the three update modes. */
export interface BaselineAnalysisUpdateProjection {
  mode: BaselineAnalysisUpdateMode;
  modeLabel: string;
  meaning: string;
  predecessor: {
    revisionId: string;
    ordinal: number;
    digest: string;
    manuscriptPin: { revisionLabel: string; revisionId: string; revisionDigest: string };
  };
  /** Whether the predecessor is still the latest revision of the Book's Result Set; authorization re-verifies it. */
  predecessorCurrent: boolean;
  selectedRange: BaselineAnalysisSelectedRange | null;
  /** The recorded plan component once preparation froze the plan; `null` before that. */
  reusePlan: AnalysisReusePlanProjection | null;
  reusePlanDigest: string | null;
}

/** One selectable contiguous range for `重新分析所选范围`: a structural unit the current manifest derives. */
export interface BaselineAnalysisRangeOptionProjection {
  unitOrdinal: number;
  sectionOrdinal: number;
  headingText: string | null;
  subUnitIndex: number;
  subUnitCount: number;
  startPosition: number;
  endPosition: number;
  graphemes: number;
  label: string;
  /** The reuse-versus-recompute counts this choice would produce against the latest revision. */
  expected: AnalysisReusePlanCounts | null;
}

export interface BaselineAnalysisUpdateActionProjection {
  mode: BaselineAnalysisUpdateMode;
  label: string;
  goal: string;
  meaning: string;
  available: boolean;
  unavailableReason: string | null;
  /** The expected reuse-versus-recompute counts against the latest revision; `null` when the choice decides them. */
  expected: AnalysisReusePlanCounts | null;
  /**
   * 快速开始 of this mode (Issue #421, plan slice S75; V2-UX-TASK-017, TASK-019): offered only while the Book
   * has a 默认执行规则 for the mode in force that still matches the Book's facts. Absent for a kind whose
   * modes never take a rule.
   */
  quickStart?: BaselineAnalysisQuickStartProjection;
}

/**
 * Whether one mode of ②A can start at once under the Book's 默认执行规则 (Issue #421), and why not. One
 * activation prepares the Task exactly as 先看计划 does and then starts it exactly as 开始任务 would, its
 * authorization naming the rule version; whatever would make the start differ from the rule stops at the plan.
 */
export interface BaselineAnalysisQuickStartProjection {
  available: boolean;
  /** Why the quick start is not offered, in the editor's words; `null` while it is. */
  reason: string | null;
  /** The rule in force for this mode; `null` when none is. */
  rule: null | DefaultExecutionRuleReference;
}

/**
 * The Analysis Update Controls: present once a Result Set Revision exists. Everything an editor
 * needs before any Task is issued: the selected meaning, the exact target revision, the expected
 * reuse-versus-recompute counts derived over the current working manuscript, the Provider /
 * outbound-category / budget consequence, and that a successor revision will be appended.
 */
export interface BaselineAnalysisUpdateControlsProjection {
  target: {
    revisionId: string;
    ordinal: number;
    digest: string;
    manuscriptPin: { revisionLabel: string; revisionId: string; revisionDigest: string };
    freshness: 'current' | 'stale';
  };
  /** The current working manuscript the next Task Input checkpoint would pin, as the manifest would derive it. */
  working: { branchId: string; revisionLabel: string; journalSequence: number; workingDigest: string; totalBlocks: number; unitCount: number; sectionCount: number };
  /** True while a Task is authorized for dispatch, waiting in Connectivity Wait, admitted, or executing: no new update Task may be prepared. */
  blockedByActiveRun: boolean;
  /** Why, in the words of that Task's state — a Run waiting to start once online reads so (OFF-005, OFF-006); `null` when nothing blocks. */
  blockedReason: string | null;
  actions: {
    'sync-current': BaselineAnalysisUpdateActionProjection;
    'reanalyze-range': BaselineAnalysisUpdateActionProjection & { options: ReadonlyArray<BaselineAnalysisRangeOptionProjection> };
    'reanalyze-book': BaselineAnalysisUpdateActionProjection;
  };
  providerConsequence: string;
  successorBehavior: string;
}

export interface BaselineAnalysisHistoryEntryProjection {
  revisionId: string;
  ordinal: number;
  digest: string;
  createdAt: string;
  mode: BaselineAnalysisTaskMode;
  modeLabel: string;
  manuscriptPin: { revisionLabel: string; revisionId: string; revisionDigest: string };
  coverageManifestDigest: string;
  contractVersion: typeof BASELINE_ANALYSIS_CONTRACT_VERSION;
  counts: AnalysisReusePlanCounts;
  predecessor: null | { revisionId: string; ordinal: number; digest: string };
  reusePlanDigest: string | null;
  producingRun: { taskIntentId: string; runRecordId: string; attemptId: string; classification: 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted' | 'cancelled' | null };
  /**
   * The Run Report of the Run that produced this revision (ADR 0066 §Run Report), read from that Run's
   * own Task Outcome, so 历史与更新 opens the report of every Run and not only the latest Task's. `null`
   * for a revision whose outcome was recorded before the report existed, or whose Run recorded none.
   */
  report: RunReportProjection | null;
  /** Why there is no report to read; `null` exactly when there is one. */
  reportAbsentReason: string | null;
  usage: { inputTokens: number; outputTokens: number; requests: number };
  unitsTotal: number;
  unitsClosed: number;
  gapCount: number;
  conflictCount: number;
  /** Only the latest revision can be current; older ones keep their original pin and are superseded. */
  current: boolean;
  freshness: 'current' | 'stale' | 'superseded';
  freshnessLabel: string;
}

/** The immutable chronological projection of one Result Set's revisions, in ordinal order. */
export interface BaselineAnalysisHistoryProjection {
  resultSetId: string;
  kind: typeof BASELINE_ANALYSIS_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<BaselineAnalysisHistoryEntryProjection>;
}

/**
 * What the Provider attempt of the unit in flight is doing, as an identity and nothing more
 * (V2-UX-LIVE-001, V2-UX-LIVE-006). `dispatched` is the attempt the execution owner has handed to the
 * harness, `awaiting-response` one whose request has entered the transport, and `retrying` the second
 * attempt of a `safe-retry` Plan Adaptation. No model content, prompt text, or payload rides here.
 */
export type RunAttemptState = 'dispatched' | 'awaiting-response' | 'retrying';

/** Bounded activity for an isolated unit; queued time is never reported as model response time. */
export interface AnalysisInFlightUnitProjection {
  unitOrdinal: number;
  attemptState: RunAttemptState;
  requestState: 'waiting-for-capacity' | 'admitted' | 'between-requests';
  admittedRequestStartedAt: string | null;
}

export interface BaselineAnalysisProjection {
  readonly historicalMarker?: string;
  bookId: string;
  kind: typeof BASELINE_ANALYSIS_KIND;
  contractVersion: typeof BASELINE_ANALYSIS_CONTRACT_VERSION;
  state: 'available' | 'prepared' | 'authorized-blocked' | 'waiting' | 'admitted' | 'executing' | 'settled' | 'failed' | 'interrupted' | 'cancelled' | 'cancelling'
    | 'pausing' | 'paused' | 'resumable' | 'awaiting-clarification'
    // Authorized and waiting on the instance's concurrency governor for a place (Issue #49, S14; CONC-007).
    | 'queued';
  stateLabel: string;
  taskIntent: null | {
    taskIntentId: string;
    goal: BaselineAnalysisGoal;
    expectedOutcome: '稿件分析结果集修订版（基线稿件分析契约 v1）';
    createdAt: string;
    mode: BaselineAnalysisTaskMode;
    modeLabel: string;
    /** 改计划重做 (Issue #422, S76c; CONT-013): the cancelled Run this Task redoes, and its Task; `null` for any other Task. */
    redoOf: null | { runRecordId: string; taskIntentId: string };
    /**
     * The 后台分析登记 version whose dispatcher prepared this Task (Issue #95, S39); absent for every Task the editor asked for, so
     * a plan AI7 prepared is never shown as the editor's.
     */
    preparedByEnrollmentVersionId?: string;
  };
  checkpoint: null | TaskAuthorizationProjection['checkpoint'];
  manuscriptPin: null | {
    bookId: string;
    manuscriptId: string;
    revisionId: string;
    revisionLabel: string;
    revisionDigest: string;
    sourceVersionId: string;
    sourceDigest: string;
  };
  artifactPin: null | TaskAuthorizationProjection['artifactPin'];
  runSourceScope: null | TaskAuthorizationProjection['runSourceScope'];
  coverageManifest: null | CoverageManifestProjection;
  providerResolutionPlan: null | {
    webToolsBackend?: FrozenWebToolsBackend;
    selectedPolicyIdentity?: SelectedPolicyIdentity;
    localFixtureProfile?: LocalFixtureProfile;
    searchCredentialReference?: string;
    role: 'Main Editorial Role';
    capabilities: readonly [];
    remoteBinding: {
      providerId: RemoteProviderId;
      modelId: 'deepseek-v4-pro' | 'deepseek-v4-flash' | 'deepseek-v4.1-flash' | 'deepseek-flash';
      adapterRevision: 1;
      configurationRevision: 1;
      approvedFallbackChain: readonly [];
      credentialSlot: CredentialSlotId;
      credentialReference: string;
      credentialReadiness: ModelCredentialOperationState;
      providerProcessing: ProviderProcessingPin;
    };
    executionRoute:
      | { kind: 'ai7-local-deterministic'; model: 'ai7-deterministic-fixture'; fixtureIdentity: string; fixtureSha256: string; fixtureLineage: ReadonlyArray<{ identity: string; sha256: string }> }
      /** The developer-live route replays no fixture: its identity is the endpoint it transmits to. */
      | { kind: 'opencode-go'; model: 'deepseek-v4-flash' | 'deepseek-v4.1-flash'; endpoint: string }
      /** The editor's DeepSeek 开放平台（官方） route under ordinary-production (Issue #811). */
      | { kind: 'deepseek-open-platform'; model: 'deepseek-flash'; endpoint: string }
      | { kind: 'none'; reason: 'j04-model-adapter-control-absent' };
    /** `unpublished-excerpts` under ordinary-production (Issue #811): the editor's own manuscript, never called public. */
    outboundDataCategory: 'public-or-synthetic' | 'unpublished-excerpts';
    runBudgetCeiling: RunBudgetCeilingState;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    reducerStages: readonly ['unit-validation', 'section-reduction', 'contradiction-continuity', 'book-synthesis'];
    /** Present only on an edited plan (Issue #419). */
    editorEdits?: PlanEditsProjection;
    stopCondition: string;
  };
  planEnvelope: null | {
    compositionVersion?: 2 | 3 | 4;
    digest: string;
    dispatchAllowed: boolean;
    providerStatus: 'remote-denied-local-deterministic' | 'remote-denied-no-route' | 'remote-eligible-developer-live' | 'remote-eligible-ordinary-production';
    summary: string;
    /** Append-only sibling pin; the canonical envelope and its legacy digest stay unchanged. */
    procedure?: ProcedureDefinitionPin | null;
    promptContractDigest: string;
    behaviorCompositionDigest: string;
    /** The plan version this envelope freezes; `null` for an envelope recorded before plan versions existed. */
    planVersion: number | null;
    /** The Plan Boundary Split the envelope carries; `null` for an envelope recorded before it existed. */
    boundary: PlanBoundarySplitProjection | null;
  };
  /** The latest plan version of the latest Task with its frozen material inputs; `null` before preparation. */
  planVersion: null | (BaselineAnalysisPlanVersionProjection & { materialInputs: MaterialPlanInputsProjection });
  /** Every plan version of the latest Task in ordinal order. */
  planVersions: ReadonlyArray<BaselineAnalysisPlanVersionProjection>;
  /** Every recorded Plan Revision of the latest Task in detection order. */
  planRevisions: ReadonlyArray<BaselineAnalysisPlanRevisionProjection>;
  /** The Plan Revision `查看计划修订` shows while the current version is superseded; `null` when the plan is current or bound. */
  planRevision: null | BaselineAnalysisPlanRevisionProjection;
  authorization: null | {
    authorizationId: string;
    planEnvelopeDigest: string;
    /** The plan version the authorization bound, resolved from the envelope digest. */
    planVersionOrdinal: number | null;
    /**
     * `default-execution-rule` when 快速开始 started the Task under a 默认执行规则 (Issue #421); `background-analysis-enrollment`
     * when AI7 started it by itself under the Book's 后台分析登记 (Issue #95, S39).
     */
    startWhen?: 'now' | 'idle';
    origin: 'standard-direct' | 'default-execution-rule' | 'background-analysis-enrollment';
    /** The rule version the authorization names; `null` for a standard-direct start. */
    ruleVersionId: string | null;
    /** The enrollment version the authorization names; `null` unless the Enrollment started it. */
    enrollmentVersionId: string | null;
    authority: 'standard-direct-dispatch' | 'record-only-no-dispatch';
    authorizedAt: string;
  };
  run: null | {
    runRecordId: string;
    procedure?: ProcedureDefinitionPin | null;
    state: BaselineAnalysisRunState;
    stateLabel: string;
    recordedAt: string;
    transitions: ReadonlyArray<{ sequence: number; state: BaselineAnalysisRunState; recordedAt: string; detail: string | null }>;
    /** The Run's durable Plan Adaptations in record order; each sits in the timeline beside the transitions. */
    adaptations: ReadonlyArray<BaselineAnalysisPlanAdaptationProjection>;
    blockedReasons: ReadonlyArray<string> | null;
    /**
     * Why a Run blocked before dispatch never ran (Issue #536; V2-UX-OFF-008): `plan-moved` when Reconnect Preflight found
     * the plan its authorization bound had moved while it waited, `launch` when this launch cannot carry it. `null` for
     * a Run not blocked.
     */
    blockedBy: null | 'plan-moved' | 'launch';
    /**
     * The Run Liveness Signal's facts while the Run is `admitted` or `executing` (ADR 0071 §3): what
     * is in flight, since when, what the attempt is doing, and when the Run last changed state. Every
     * field is a count or an instant; elapsed time is the reader's to compute, never the product's to
     * estimate.
     */
    progress: {
      unitsTotal: number;
      unitsSettled: number;
      currentUnitOrdinal: number | null;
      /** The instant the current unit's attempt started; `null` between units. */
      currentUnitStartedAt: string | null;
      attemptState: RunAttemptState | null;
      /** Present on governed live execution; at most three entries in manifest order. */
      inFlightUnits?: ReadonlyArray<AnalysisInFlightUnitProjection>;
      /** Model turns this Run has completed, live, replayed, or deterministic alike. */
      completedAttempts: number;
      /** The longest step this Run has actually settled, which the stale case is measured against. */
      longestSettledUnitMs: number | null;
      /**
       * Which declared step is in flight: the unit loop, the cross-unit reduction, the sample, or
       * the Run Report's reflection turn — which runs last, after the revision is already persisted.
       */
      stage: 'units' | 'cross-unit-reduction' | 'assurance-sampling' | 'run-report-reflection';
      /** The `recordedAt` of the Run Record's latest transition, composed by the store. */
      lastTransitionAt: string;
    } | null;
    attempt: null | {
      attemptId: string;
      ordinal: 1;
      startedAt: string;
      credentialReadinessCheck: { slot: CredentialSlotId; readiness: 'present' | 'missing'; valueReleased: false };
      executionBinding: BaselineAnalysisExecutionBindingProjection | null;
      /**
       * Each technical turn by reference. `unitMessageDigest` is the digest of the unit message the turn submitted (Issue
       * #286), `null` on a turn recorded before it was kept.
       */
      spans: ReadonlyArray<{
        ordinal: number;
        harnessSessionId: string;
        startSeq: number;
        endSeq: number;
        unitOrdinal: number | null;
        attemptIndex: number;
        payloadDigest: string | null;
        unitMessageDigest: string | null;
      }>;
    };
  };
  /** The latest revision of the Book's Result Set; the current truth candidate, never an older one. */
  resultSetRevision: null | BaselineAnalysisResultSetRevisionProjection;
  taskOutcome: null | {
    outcomeId: string;
    classification: 'completed' | 'completed-with-gaps' | 'failed' | 'interrupted' | 'cancelled';
    label: string;
    recordedAt: string;
    resultSetRevisionId: string | null;
    safeNextAction: string;
    /**
     * Why the Run stopped before it finished, when a limit stopped it (Issue #51, S16a; V2-UX-MODEL-016): the explicit
     * Run Budget Ceiling — the ceiling, what the Run had used, and how many of the ranges it submits it read. The
     * outcome stays `interrupted`, with its partial revision; `null` for every other outcome.
     */
    stop: null | { reason: 'run-budget-ceiling-reached'; maxTotalTokens: number; usedTokens: number; unitsSettled: number; unitsTotal: number };
    /**
     * The Run Report of the Run this outcome settled (ADR 0066 §Run Report): an immutable record
     * inside the outcome, read back with the digest of its own canonical JSON. `null` for a Task
     * Outcome recorded before the report existed, which is history and is never rewritten.
     */
    report: RunReportProjection | null;
    /** Why there is no report to read; `null` exactly when there is one. */
    reportAbsentReason: string | null;
  };
  /** The latest Task's update facts; `null` while the latest Task is the first baseline. */
  update: null | BaselineAnalysisUpdateProjection;
  /** The Analysis Update Controls; `null` until the Book holds a Result Set Revision. */
  updateControls: null | BaselineAnalysisUpdateControlsProjection;
  /** The Analysis Result Revision History; `null` until the Book holds a Result Set Revision. */
  history: null | BaselineAnalysisHistoryProjection;
  /** One exact revision opened read-only by `revisionId`; `null` when inspecting the latest. */
  inspectedRevision: null | { revision: BaselineAnalysisResultSetRevisionProjection; current: boolean; readOnly: true };
  /** `canAuthorize` is false while a Plan Revision is pending; `canReconfirmPlan` is true exactly then. */
  actions: { canPrepare: boolean; canAuthorize: boolean; canReconfirmPlan: boolean };
  namedNonEffects: ReadonlyArray<string>;
}

/**
 * The assertion classes of kick-in 17's two-axis evidence model. Only `real-world-fact` and
 * `quotation` become findings; the other three are listed and counted so that an editor can see what
 * the model declined to treat as a checkable fact rather than having it silently dropped.
 */
export type FactualAssertionClass = 'real-world-fact' | 'quotation' | 'report-about-manuscript' | 'fictional-canon' | 'judgment';
export const FACTUAL_ASSERTION_CLASSES: readonly FactualAssertionClass[] =
  ['real-world-fact', 'quotation', 'report-about-manuscript', 'fictional-canon', 'judgment'];
/** The classes an assertion must carry to become a finding; the rest are counted only. */
export const FACTUAL_FINDING_CLASSES: readonly FactualAssertionClass[] = ['real-world-fact', 'quotation'];

/** The closed category set of the Factual Review Contract v1. */
export type FactualAssertionCategory = '时间' | '地点' | '人物' | '机构' | '器物' | '数字' | '引文' | '史实' | '技术' | '其他';
export const FACTUAL_ASSERTION_CATEGORIES: readonly FactualAssertionCategory[] =
  ['时间', '地点', '人物', '机构', '器物', '数字', '引文', '史实', '技术', '其他'];

/** ADR 0066's severity tiers: `A` confirmed, `B` probable, `C` advisory. */
export type FactualSeverityTier = 'A' | 'B' | 'C';
export const FACTUAL_SEVERITY_TIERS: readonly FactualSeverityTier[] = ['A', 'B', 'C'];

/**
 * ADR 0066's six verdicts. Until a research egress is accepted and its slice integrates (ADR 0074,
 * proposed), every model-judged finding is `未外部复核`: the model raised a question that no
 * admissible evidence has answered.
 */
export type FactualVerdict = '确证' | '部分成立' | '存疑' | '无法核实' | '未外部复核' | '误报';
export const FACTUAL_VERDICTS: readonly FactualVerdict[] = ['确证', '部分成立', '存疑', '无法核实', '未外部复核', '误报'];
export const FACTUAL_UNREVIEWED_VERDICT = '未外部复核' as const;

/**
 * The three checks of kick-in 17 rule 5, reported independently and never collapsed into one badge.
 * Reference Integrity is deterministic; Claim Support and Factual Verification are model-judged over
 * captured evidence, and with no evidence fetched they read `未核查`.
 */
export type FactualReferenceIntegrityState = 'verified' | 'failed';
export type FactualEvidenceState = '未核查' | '成立' | '不成立' | '冲突' | '不适用';
export const FACTUAL_UNCHECKED_STATE = '未核查' as const;

/** The research capability's disclosed state; `外部研究未获准` is the only one this slice can produce. */
export type FactualResearchState = '外部研究未获准' | '研究预算已用尽' | '已检索';
export const FACTUAL_RESEARCH_NOT_AUTHORIZED = '外部研究未获准' as const;

/**
 * The exact grapheme range Reference Integrity located. Unlike a model-supplied source range it is
 * never open-ended: a finding exists only because the service found its quotation at these offsets.
 */
export interface FactualSourceRangeProjection {
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
}

/** The identity of one listed assertion inside its unit: the block it named and its position in the list. */
export interface FactualAssertionIdentityProjection {
  unitOrdinal: number;
  blockOrdinal: number;
  assertionOrdinal: number;
}

/**
 * One factual finding in ADR 0066's record shape. `sourceRange` is the exact grapheme range the
 * service located in the committed block, never an offset the model supplied; a finding exists only
 * because Reference Integrity verified its quotation there.
 */
export interface FactualReviewFindingProjection {
  findingId: string;
  unitOrdinal: number;
  blockId: string;
  sourceRange: FactualSourceRangeProjection;
  quote: string;
  assertionClass: FactualAssertionClass;
  category: FactualAssertionCategory;
  severity: FactualSeverityTier;
  question: string;
  basis: string;
  verdict: FactualVerdict;
  states: {
    referenceIntegrity: FactualReferenceIntegrityState;
    claimSupport: FactualEvidenceState;
    factualVerification: FactualEvidenceState;
  };
  /** Captured evidence records; empty under every scope until ADR 0074's slice admits a lookup. */
  evidence: readonly [];
  research: { state: FactualResearchState; budget: null };
  /** The identities of the duplicate assertions merged into this record; empty when none were. */
  mergedFrom: ReadonlyArray<FactualAssertionIdentityProjection>;
}

/** Why an assertion never became a finding: its quotation could not be anchored in the block it named. */
export type FactualExclusionReason = 'quote-not-found' | 'quote-ambiguous' | 'not-exact-fetched';

/**
 * The excluded appendix (ADR 0066): an assertion the model listed whose quotation Reference Integrity
 * could not verify. It keeps its identity and its reason and never carries a source range — the
 * service does not rewrite a quotation to make it match.
 */
export interface FactualReviewExcludedProjection {
  findingId: string;
  unitOrdinal: number;
  /** The block the model named, when its ordinal resolved to one of the unit's blocks. */
  blockId: string;
  blockOrdinal: number;
  quote: string;
  assertionClass: FactualAssertionClass;
  category: FactualAssertionCategory;
  severity: FactualSeverityTier;
  question: string;
  basis: string;
  states: {
    referenceIntegrity: 'failed';
    claimSupport: FactualEvidenceState;
    factualVerification: FactualEvidenceState;
  };
  reason: FactualExclusionReason;
  reasonLabel: string;
}

/**
 * What the model listed, by class, category, and tier, before any of it became a finding.
 *
 * Each breakdown is an ordered list rather than a keyed map, in its closed set's own order. A durable
 * record is canonicalized by more than one owner, and two canonicalizers need not agree on how to
 * order non-ASCII object keys; a list depends on no collation at all.
 */
export interface FactualReviewAssertionCountsProjection {
  listed: number;
  byClass: ReadonlyArray<{ assertionClass: FactualAssertionClass; count: number }>;
  byCategory: ReadonlyArray<{ category: FactualAssertionCategory; count: number }>;
  bySeverity: ReadonlyArray<{ severity: FactualSeverityTier; count: number }>;
  /** Assertions of a finding class whose quotation verified, before duplicates merged. */
  verified: number;
  excluded: number;
  merged: number;
}

/** The research capability's disclosed outcome for the whole Run: what it was allowed to do, and what it did. */
export interface FactualReviewResearchProjection {
  state: FactualResearchState;
  fetched: 0;
  statement: string;
}

// ---- Evidence Assurance, verification review and Correction Proposals (Issue #901; FACT/EVID/EASSURE/FREV/CORR) ------------

/**
 * The three Evidence Assurance Levels of a factual-review Task (ui-ux-v2 ADR 0004; V2-UX-EASSURE-001 to 013). A level is a
 * term of the Task's Plan Envelope, not a model role, a provider choice or an authority: it decides how much assurance work the
 * Run does and the formal outcome it may record. `standard` is the default and is never named in a plan edit.
 */
export type EvidenceAssuranceLevel = 'quick' | 'standard' | 'strict';
export const EVIDENCE_ASSURANCE_LEVELS: readonly EvidenceAssuranceLevel[] = ['quick', 'standard', 'strict'];
export const EVIDENCE_ASSURANCE_DEFAULT_LEVEL = 'standard' as const;
export const EVIDENCE_ASSURANCE_LEVEL_LABELS: Readonly<Record<EvidenceAssuranceLevel, string>> = {
  quick: '快速整理',
  standard: '标准核查',
  strict: '严格核查',
};
/** The one-line consequence each level states beside the selector (EASSURE-001); never `更正确` or a quality ladder. */
export const EVIDENCE_ASSURANCE_LEVEL_CONSEQUENCES: Readonly<Record<EvidenceAssuranceLevel, string>> = {
  quick: '只列出断言与候选方向，不联网、不检索；结果一律为待核查，不能记录支持或反驳的正式结论。',
  standard: '联网检索并在书内精确取文；只有精确取文的来源计入，结论按证据关系确定。',
  strict: '在标准核查之上，支持或反驳须有两个以上相互独立的已核对来源，否则为证据不足；复用已留存的有效证据。',
};
/** The disclosure a Run carries when an offline verdict at its start lowered its effective level (EASSURE-002; D9). */
export const EVIDENCE_ASSURANCE_OFFLINE_DEGRADE = '已自动降为快速整理：未联网' as const;

/** The user-facing Factual Verification sub-states (V2-UX-FACT-006), mapped from evidence relations, never from a score. */
export type FactualVerificationOutcome = '待核查' | '证据支持' | '疑似错误' | '证据不足' | '证据冲突' | '无法核实';
export const FACTUAL_VERIFICATION_OUTCOMES: readonly FactualVerificationOutcome[] = ['待核查', '证据支持', '疑似错误', '证据不足', '证据冲突', '无法核实'];
/** Each sub-state's policy outcome (Factual Verification Policy §Outcomes and conflicts). */
export const FACTUAL_VERIFICATION_POLICY_OUTCOMES: Readonly<Record<FactualVerificationOutcome, 'supported' | 'contradicted' | 'conflicting' | 'unresolved'>> = {
  待核查: 'unresolved',
  证据支持: 'supported',
  疑似错误: 'contradicted',
  证据不足: 'unresolved',
  证据冲突: 'conflicting',
  无法核实: 'unresolved',
};

/** How one source relates to one assertion (V2-UX-EVID-007); relations are never counted into a verdict. */
export type EvidenceRelation = '支持' | '部分支持' | '反驳' | '仅提供背景' | '关系待判断';
export const EVIDENCE_RELATIONS: readonly EvidenceRelation[] = ['支持', '部分支持', '反驳', '仅提供背景', '关系待判断'];
/** Evidence Source Lineage (V2-UX-EVID-008): only `original` material can count as independent corroboration. */
export type EvidenceLineageClass = 'original' | 'quoted' | 'syndicated' | 'translated' | 'summarized';
export const EVIDENCE_LINEAGE_CLASSES: readonly EvidenceLineageClass[] = ['original', 'quoted', 'syndicated', 'translated', 'summarized'];
export const EVIDENCE_LINEAGE_LABELS: Readonly<Record<EvidenceLineageClass, string>> = {
  original: '原始来源', quoted: '转引', syndicated: '转载', translated: '译介', summarized: '摘述',
};
/** Whether a source's exact excerpt was obtained (EVID-004, EVID-005). */
export type EvidenceCheckState = 'candidate' | 'exact';
export const EVIDENCE_CHECK_LABELS: Readonly<Record<EvidenceCheckState, string>> = {
  candidate: '候选来源 · 尚未核对',
  exact: '已精确取文',
};

/** What the Fact-check Lens filters a result by besides chapter, status and risk (V2-UX-FACT-005). */
export type FactualSourceCondition = 'no-source' | 'candidates-only' | 'checked' | 'conflicting';
export const FACTUAL_SOURCE_CONDITION_LABELS: Readonly<Record<FactualSourceCondition, string>> = {
  'no-source': '没有来源',
  'candidates-only': '只有候选来源',
  checked: '有已核对来源',
  conflicting: '来源相互冲突',
};
export type FactualActionNeed = 'review' | 'correction' | 'none';
export const FACTUAL_ACTION_NEED_LABELS: Readonly<Record<FactualActionNeed, string>> = {
  review: '待你审阅',
  correction: '可准备更正',
  none: '无需处理',
};

/** The Verification Review Dispositions of the Factual Review Decision Card (V2-UX-FREV-005), never preselected. */
export type VerificationReviewDisposition = 'accept' | 'request-evidence' | 'keep-pending' | 'decline' | 'own-words';
export const VERIFICATION_REVIEW_DISPOSITIONS: readonly VerificationReviewDisposition[] = ['accept', 'request-evidence', 'keep-pending', 'decline', 'own-words'];
export const VERIFICATION_REVIEW_DISPOSITION_LABELS: Readonly<Record<VerificationReviewDisposition, string>> = {
  accept: '接受当前核查结论',
  'request-evidence': '要求补充证据',
  'keep-pending': '维持未决',
  decline: '不采纳该核查判断',
  'own-words': '自行输入',
};
/** How the editor treated an optional reason suggestion (FREV-009): picked it as is, corrected it, or wrote their own. */
export type VerificationReasonState = 'selected' | 'corrected' | 'replaced';
export const MAX_VERIFICATION_REASON_CHARACTERS = 500;
export const MAX_VERIFICATION_OWN_WORDS_CHARACTERS = 500;
export const MAX_CORRECTION_TEXT_GRAPHEMES = 200;
export const MAX_CORRECTION_RATIONALE_GRAPHEMES = 120;
/** One Fact-check Lens page and one source page of the workspace, bounded so a read always fits a frame. */
export const MAX_FACTUAL_VERIFICATION_PAGE = 50;
export const MAX_EVIDENCE_SOURCE_PAGE = 12;
/** The Evidence Comparison Matrix holds two to four pinned cards (V2-UX-EVID-006). */
export const EVIDENCE_MATRIX_MIN_PINNED = 2;
export const EVIDENCE_MATRIX_MAX_PINNED = 4;

/** The exact Factual Verification Policy Document version a result binds (V2-UX-FACT-002): its path and the digest of its bytes. */
export interface FactualVerificationPolicyPinProjection {
  document: string;
  sha256: string;
  /** The minimum Evidence Assurance Level the document requires; `null` while it names none (EASSURE-008). */
  minimumLevel: EvidenceAssuranceLevel | null;
}

/** The level a Run executed under, decided once at its start (EASSURE-002). */
export interface FactualRunAssuranceProjection {
  runRecordId: string;
  plannedLevel: EvidenceAssuranceLevel;
  effectiveLevel: EvidenceAssuranceLevel;
  /** `EVIDENCE_ASSURANCE_OFFLINE_DEGRADE` when an offline verdict at Run start lowered it; `null` otherwise. */
  disclosure: string | null;
  recordedAt: string;
}

/** One Evidence Source Card (V2-UX-EVID-003): every check a discrete state, a candidate never quoted (EVID-004). */
export interface EvidenceSourceCardProjection {
  excluded?: boolean;
  /** The relation's own identity within the result: stable across pages and pinning. */
  cardId: string;
  sourceRef: string;
  sourceKind: 'web' | 'in-book';
  title: string | null;
  checkState: EvidenceCheckState;
  checkLabel: string;
  relation: EvidenceRelation;
  /** The exact excerpt, only when `exact`; a candidate is never quoted or summarized as checked evidence. */
  excerpt: string | null;
  /** The retained Source Version: the content digest of what AI7 captured; `null` when nothing was captured. */
  sourceVersion: string | null;
  publisher: string | null;
  registrableDomain: string | null;
  capturedAt: string | null;
  freshness: 'current' | 'possibly-stale' | 'unknown';
  freshnessLabel: string;
  /** 引文完整性: whether the excerpt stands verbatim in the captured text. */
  integrity: 'located' | 'not-located' | 'not-captured';
  integrityLabel: string;
  lineage: EvidenceLineageClass | null;
  lineageLabel: string;
  /** The independence group the source counts in under strict assurance; dependent material shares no group. */
  independenceGroup: string | null;
  /** The retained evidence row the 来源与证据 view opens on; `null` for an in-Book or uncaptured source. */
  evidenceId: string | null;
  /** Reused from an earlier Run's retained evidence rather than captured by this Run (EASSURE-009). */
  reused: boolean;
}

/** The AI7 Evidence Comparison Summary (V2-UX-EVID-010): non-evidentiary, every statement linked to cards. */
export interface EvidenceComparisonSummaryProjection {
  label: '非证据';
  statements: ReadonlyArray<{ text: string; cardIds: ReadonlyArray<string> }>;
}

/** One Factual Review Decision (V2-UX-FREV-006): immutable, bound to one result version. */
export interface FactualReviewDecisionProjection {
  decisionId: string;
  resultId: string;
  boundVersion: number;
  disposition: VerificationReviewDisposition;
  dispositionLabel: string;
  ownWords: string | null;
  reason: null | { state: VerificationReasonState; text: string; suggestion: string | null };
  /** A later result version exists, so this decision binds an older version (FREV-007). */
  superseded: boolean;
  /** The level 要求补充证据 asked the supplementary range Task to run at: the same or higher than this result's (FREV-008). */
  requestedLevel: EvidenceAssuranceLevel | null;
  recordedAt: string;
}

/** One Versioned Verification Result (V2-UX-FREV-001) as the Fact-check Lens and the workspace read it. */
export interface FactualVerificationResultProjection {
  resultId: string;
  version: number;
  assertionKey: string;
  reviewRunId: string;
  reviewFindingId: string;
  findingId: string;
  runRecordId: string;
  taskIntentId: string;
  markId: string | null;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  /** The exact manuscript wording, the Textual Source of Record (EVID-002). */
  quote: string;
  /** AI7's normalized statement of what is checked, kept apart from the wording. */
  normalizedStatement: string;
  heading: string | null;
  category: FactualAssertionCategory;
  severity: FactualSeverityTier;
  plannedLevel: EvidenceAssuranceLevel;
  level: EvidenceAssuranceLevel;
  levelLabel: string;
  disclosure: string | null;
  states: {
    referenceIntegrity: FactualReferenceIntegrityState;
    claimSupport: FactualEvidenceState;
    factualVerification: FactualVerificationOutcome;
  };
  sourceCondition: FactualSourceCondition;
  actionNeed: FactualActionNeed;
  sourceCounts: { checked: number; candidates: number; independent: number; reused: number };
  limitations: ReadonlyArray<string>;
  policyPin: FactualVerificationPolicyPinProjection;
  producer: string;
  recordedAt: string;
  /** 锚点已失效 when the manuscript changed inside the range since (FACT-010); the result stays historical. */
  anchor: { state: 'current' | 'stale'; label: string | null };
  decision: FactualReviewDecisionProjection | null;
  /** No decision binds this version yet. */
  pendingReview: boolean;
  /** `准备更正提案` is offered (FREV-008, EASSURE-004). */
  correctionAvailable: boolean;
}

export interface FactualChapterOptionProjection {
  blockId: string;
  heading: string;
}

/** The Fact-check Lens (V2-UX-FACT-004/005/007): one bounded page of the latest results with the three states apart. */
export interface FactualVerificationLensProjection {
  bookId: string;
  reviewRunId: string | null;
  results: ReadonlyArray<FactualVerificationResultProjection>;
  /** The cursor of the next page; `null` at the end. */
  nextCursor: number | null;
  total: number;
  counts: ReadonlyArray<{ outcome: FactualVerificationOutcome; count: number }>;
  chapters: ReadonlyArray<FactualChapterOptionProjection>;
  run: FactualRunAssuranceProjection | null;
  policyPin: FactualVerificationPolicyPinProjection;
  statement: string;
}

export interface FactualVerificationLensFilters {
  chapterBlockId: string | null;
  outcome: FactualVerificationOutcome | null;
  severity: FactualSeverityTier | null;
  sourceCondition: FactualSourceCondition | null;
  actionNeed: FactualActionNeed | null;
}

/** The decision card's offer (FREV-004/005/011): five unselected choices, or why recording is refused now. */
export interface FactualDecisionCardProjection {
  choices: ReadonlyArray<{ disposition: VerificationReviewDisposition; label: string }>;
  /** AI7 may recommend one with a rationale, never preselect it. */
  recommendation: null | { disposition: VerificationReviewDisposition; rationale: string };
  reasonSuggestions: ReadonlyArray<string>;
  /** Why 记录核查审阅决定 cannot record now: the exact changed dependency (FREV-011); `null` when it can. */
  drift: string | null;
}

/** The Assertion-centered Evidence Workspace (V2-UX-EVID-001 to 013): a read, it mutates nothing (EVID-012). */
export interface EvidenceWorkspaceProjection {
  claimRecheckAvailable?: boolean;
  bookId: string;
  result: FactualVerificationResultProjection;
  sources: ReadonlyArray<EvidenceSourceCardProjection>;
  /** The cursor of the next source page; `null` at the end. */
  nextSourceCursor: number | null;
  totalSources: number;
  conflicts: ReadonlyArray<{ supportingCardId: string; refutingCardId: string; point: string }>;
  summary: EvidenceComparisonSummaryProjection;
  history: ReadonlyArray<{ resultId: string; version: number; outcome: FactualVerificationOutcome; level: EvidenceAssuranceLevel; recordedAt: string }>;
  decisions: ReadonlyArray<FactualReviewDecisionProjection>;
  decisionCard: FactualDecisionCardProjection;
  matrix: { minPinned: number; maxPinned: number };
}

/** One occurrence in a Linked Correction Range Set (V2-UX-CORR-007): exact-equal text only, each include/exclude visible. */
export interface CorrectionRangeProjection {
  rangeId: string;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  text: string;
  heading: string | null;
  /** The finding's own range: included by default. */
  primary: boolean;
  /** The current manuscript still holds these words here, so a mark can stand on them. */
  current: boolean;
}

/** One Correction Variant (V2-UX-CORR-002/003): resulting text, rationale, evidence links, unresolved evidence, limitations. */
export interface CorrectionVariantProjection {
  variantId: string;
  text: string;
  rationale: string;
  evidenceCardIds: ReadonlyArray<string>;
  unresolved: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
}

/** 准备更正提案 (V2-UX-CORR-001): the Correction Proposal Draft offer; a read, nothing is written. */
export interface CorrectionProposalDraftProjection {
  bookId: string;
  result: FactualVerificationResultProjection;
  decisionId: string | null;
  variants: ReadonlyArray<CorrectionVariantProjection>;
  ownEditAllowed: true;
  scope: 'minimal';
  scopeStatement: string;
  ranges: ReadonlyArray<CorrectionRangeProjection>;
  assuranceIncomplete: boolean;
  missingChecks: ReadonlyArray<string>;
  label: string | null;
}

/** 保存为更正提案 (V2-UX-CORR-011): what one save created. */
export interface CorrectionProposalSavedProjection {
  proposalId: string;
  markIds: ReadonlyArray<string>;
  assuranceIncomplete: boolean;
  label: string | null;
  completionLabel: string;
}

/** The lineage the 依据与核查 region of a Correction Proposal's 修改建议 card shows (V2-UX-CORR-012, EASSURE-012). */
export interface FactualCorrectionLineageProjection {
  proposalId: string;
  resultId: string;
  resultVersion: number;
  decisionId: string | null;
  level: EvidenceAssuranceLevel;
  levelLabel: string;
  states: FactualVerificationResultProjection['states'];
  checkedSources: number;
  candidateSources: number;
  policyPin: FactualVerificationPolicyPinProjection;
  /** `证据核查未完成` while the level was quick or the gate was not met; kept through review, Apply and reversal. */
  assuranceLabel: string | null;
  missingChecks: ReadonlyArray<string>;
}
/** The inputs of the five factual-verification operations (Issue #901). The Book is the route's, as for 来源与证据. */
export interface InspectFactualVerificationInput extends FactualVerificationLensFilters {
  bookId: string;
  /** The Review Run whose results to read; `null` reads the Book's latest result of every assertion. */
  reviewRunId: string | null;
  after: number | null;
}
export interface InspectEvidenceWorkspaceInput {
  bookId: string;
  resultId: string;
  sourcesAfter: number | null;
}
export interface RecordVerificationReviewDecisionInput {
  excludedSourceRefs?: readonly string[];
  bookId: string;
  resultId: string;
  /** The result version the editor read; a later version refuses the decision (FREV-011). */
  resultVersion: number;
  disposition: VerificationReviewDisposition;
  ownWords: string | null;
  reason: null | { state: VerificationReasonState; text: string; suggestion: string | null };
}
/**
 * What 记录核查审阅决定 answers: the workspace as it now reads, and — for 要求补充证据 — the supplementary check it recorded: the
 * result's own block and the level, the same or higher, it must run at (FREV-008). A Book holds one 事实核查 Run until the
 * factual update modes land (#905), so no Task is prepared now and the statement says so.
 */
export interface VerificationReviewDecisionRecordedProjection {
  workspace: EvidenceWorkspaceProjection;
  supplementary: null | { blockId: string; level: EvidenceAssuranceLevel; statement: string; decisionId?: string };
}
/** Why 要求补充证据 prepares no Task yet (Issue #901 rev 4; follow-up #905). */
export const SUPPLEMENTARY_CHECK_DEFERRED = '已记录补充核查的要求（同一段文字、同级或更高级别）。这本书的事实核查目前只能运行一次；补充核查任务将在事实核查的更新方式接入后开放（#905）。' as const;
export interface PrepareCorrectionProposalInput {
  bookId: string;
  resultId: string;
}
export interface SaveCorrectionProposalInput {
  bookId: string;
  resultId: string;
  resultVersion: number;
  /** The Run's variant chosen, or `null` for 自行编辑. */
  variantId: string | null;
  text: string;
  rationale: string;
  rangeIds: ReadonlyArray<string>;
}

export const CORRECTION_ASSURANCE_INCOMPLETE_LABEL = '证据核查未完成' as const;
export const STALE_VERIFICATION_ANCHOR_LABEL = '锚点已失效' as const;

// ---- External Evidence Retention (Issue #425, plan slice S70; V2-UX-SRC-013, EGR-003, KB-008/009, FACT-009) -------------

/** How a retained source was captured: AI7's own fetch of the page, the excerpt the search returned, or nothing (EGR-003). */
export type ResearchEvidenceCaptureState = 'full-text' | 'snippet-only' | 'failed';
export const RESEARCH_EVIDENCE_CAPTURE_STATES: readonly ResearchEvidenceCaptureState[] = ['full-text', 'snippet-only', 'failed'];
export const RESEARCH_EVIDENCE_CAPTURE_LABELS: Readonly<Record<ResearchEvidenceCaptureState, string>> = {
  'full-text': '来源全文',
  'snippet-only': '来源仅片段',
  failed: '未能取回',
};
/** Whether the words a citation names are in the captured text: all of them, some of them, or none (sentence alignment). */
export type ResearchEvidenceAlignment = 'aligned' | 'partial' | 'unaligned';
export const RESEARCH_EVIDENCE_ALIGNMENTS: readonly ResearchEvidenceAlignment[] = ['aligned', 'partial', 'unaligned'];
export const RESEARCH_EVIDENCE_ALIGNMENT_LABELS: Readonly<Record<ResearchEvidenceAlignment, string>> = {
  aligned: '对应',
  partial: '部分对应',
  unaligned: '未能对应',
};
/** The age after which a retained source reads 可能已过期 unless the caller names another. */
export const RESEARCH_EVIDENCE_STALE_AFTER_DAYS = 90;
export const RESEARCH_EVIDENCE_STALE_LABEL = '可能已过期';
/** The label every model-produced translation of a retained passage carries; it never replaces the original. */
export const SOURCE_TRANSLATION_LABEL = '来源译文';
/** Query class: the assertion category of the finding a source was retained for, or `uncited` for a page no finding named. */
export type ResearchEvidenceQueryClass = FactualAssertionCategory | 'uncited';
/** How a unit's search ended (ADR 0080 §7.4): its one search answered, cut short (联网核查未完成), or never made. */
export type ResearchEvidenceUnitState = 'completed' | 'incomplete' | 'not-searched';
export const RESEARCH_EVIDENCE_UNIT_LABELS: Readonly<Record<ResearchEvidenceUnitState, string>> = {
  completed: '联网核查已完成',
  incomplete: '联网核查未完成',
  'not-searched': '本单元未联网检索',
};
/** A finding's research outcome: a retained source names it, its unit's search ended without one, or the search was cut short. */
export type ResearchEvidenceFindingState = 'sourced' | 'unsupported' | 'incomplete';
export const RESEARCH_EVIDENCE_FINDING_LABELS: Readonly<Record<ResearchEvidenceFindingState, string>> = {
  sourced: '已留存外部来源',
  unsupported: '没有找到可留存的外部来源',
  incomplete: '联网核查未完成',
};
export const MAX_RESEARCH_EVIDENCE_PAGE = 32;

/** One range of the captured text the citation's words occupy (UTF-16 offsets), and the 1-based sentence it starts in. */
export interface ResearchEvidenceAnchor {
  from: number;
  to: number;
  sentence: number;
}

/** 来源译文: produced only under a rule that admits it, labelled as machine translation and attributed to the original. */
export type ResearchEvidenceTranslation =
  | {
    state: 'translated';
    label: typeof SOURCE_TRANSLATION_LABEL;
    machine: true;
    targetLanguage: 'zh-Hans';
    text: string;
    route: string;
    model: string;
    attribution: { url: string; contentSha256: string; from: number; to: number };
  }
  | { state: 'refused'; reason: string };

export interface ResearchEvidenceProjection {
  evidenceId: string;
  bookId: string;
  runRecordId: string;
  unitOrdinal: number;
  /** The finding the source was retained for; `null` for a page the model fetched that no finding named. */
  findingId: string | null;
  backendId: string | null;
  queryClass: ResearchEvidenceQueryClass;
  url: string;
  sourceTitle: string | null;
  capturedAt: string;
  captureState: ResearchEvidenceCaptureState;
  captureLabel: string;
  contentSha256: string | null;
  pageSha256: string | null;
  /** The Research Snapshot the capture was read from: the fetched page's, or the search answer's for an excerpt. */
  snapshotDigest: string | null;
  /** The words the alignment looked for: the model's quotation in its basis, else the finding's own quotation. */
  claim: { text: string; origin: 'basis-quotation' | 'finding-quote' } | null;
  alignment: ResearchEvidenceAlignment;
  alignmentLabel: string;
  anchors: ReadonlyArray<ResearchEvidenceAnchor>;
  /** Bounded captured passage; when unaligned, the source's beginning. A translation shows its exact attributed original. */
  passage: string | null;
  translation: ResearchEvidenceTranslation | null;
  staleness: { state: 'current' | 'possibly-stale'; reasons: ReadonlyArray<'age' | 'hash-changed'>; label: string | null };
  savedMaterialId: string | null;
  /** Why 保存为来源材料 is not offered; `null` when it is. */
  saveRefusal: string | null;
}

export interface ResearchEvidenceUnitProjection {
  retentionFailure?: 'capture-processing' | 'storage';
  runRecordId: string;
  unitOrdinal: number;
  backendId: string | null;
  state: ResearchEvidenceUnitState;
  label: string;
  searchCalls: number;
  retentionFetches: number;
  failedRetrievals: number;
  unsupportedFindings: number;
}

export interface ResearchEvidenceFindingProjection {
  findingId: string;
  runRecordId: string;
  unitOrdinal: number;
  blockId: string;
  quote: string;
  state: ResearchEvidenceFindingState;
  label: string;
  sources: number;
}

/** 来源与证据 (②): a Book's retained external sources, newest first, a page at a time, with each research unit's outcome. */
export interface ResearchEvidenceBookProjection {
  bookId: string;
  staleAfterDays: number;
  records: ReadonlyArray<ResearchEvidenceProjection>;
  /** The rowid cursor of the next page, or `null` when this page is the last. */
  next: number | null;
  units: ReadonlyArray<ResearchEvidenceUnitProjection>;
  findings: ReadonlyArray<ResearchEvidenceFindingProjection>;
  statement: string;
}

/**
 * The factual kind's Result Set Revision: the findings, the excluded appendix, the assertion counts,
 * and the research disclosure in place of the baseline kind's entities, events, relationships, and
 * settings. Every shared component — coverage, gaps, usage, lineage, freshness, assurance — is the
 * same reading the baseline kind carries, computed by the same reducers.
 */
export interface FactualReviewResultSetRevisionProjection {
  resultSetId: string;
  revisionId: string;
  ordinal: number;
  createdAt: string;
  digest: string;
  contractVersion: typeof FACTUAL_REVIEW_CONTRACT_VERSION;
  manuscriptPin: { bookId: string; manuscriptId: string; revisionId: string; revisionLabel: string; revisionDigest: string };
  coverageManifestDigest: string;
  schemaDigest: string;
  reducerDigest: string;
  adapterPin: { route: ExecutionRouteId; model: string; fixtureIdentity: string | null; fixtureSha256: string | null };
  bindingPin: { attemptId: string; bindingDigest: string; harnessSessionId: string; behaviorCompositionDigest: string; promptContractDigest: string };
  policyPin: ResultSetPolicyPin;
  provenance: { taskIntentId: string; runRecordId: string; attemptId: string; planVersion?: number; adaptations?: { count: number; unitOrdinals: ReadonlyArray<number> } };
  usage: { inputTokens: number; outputTokens: number; requests: number };
  /** Which mode produced this revision and with what unit counts; the same fact every kind records. */
  update: BaselineAnalysisRevisionUpdateProjection;
  lineage: ReadonlyArray<{ unitOrdinal: number } & AnalysisUnitLineage>;
  coverage: AnalysisCoverageAxis;
  reducerClosure: AnalysisReducerClosureAxis;
  freshness: AnalysisFreshnessAxis;
  assurance: AnalysisAssuranceAxis;
  gaps: ReadonlyArray<AnalysisGapProjection>;
  findings: ReadonlyArray<FactualReviewFindingProjection>;
  excluded: ReadonlyArray<FactualReviewExcludedProjection>;
  assertionCounts: FactualReviewAssertionCountsProjection;
  research: FactualReviewResearchProjection;
  /** The adversarial sample drawn over `findings` after the reduction; it edits none of them. */
  assuranceSample: AnalysisAssuranceSampleProjection;
  units: ReadonlyArray<FactualReviewUnitProjection>;
}

export type FactualReviewUnitProjection =
  | {
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: AnalysisUnitLineage;
      assertions: ReadonlyArray<{
        blockOrdinal: number;
        quote: string;
        assertionClass: FactualAssertionClass;
        category: FactualAssertionCategory;
        severity: FactualSeverityTier;
        question: string;
        basis: string;
      }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: AnalysisUnitLineage; gap: AnalysisGapProjection };

export interface FactualReviewHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion'> {
  mode: FactualReviewTaskMode;
  contractVersion: typeof FACTUAL_REVIEW_CONTRACT_VERSION;
}

export interface FactualReviewHistoryProjection {
  resultSetId: string;
  kind: typeof FACTUAL_REVIEW_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<FactualReviewHistoryEntryProjection>;
}

/**
 * The factual kind's Task projection. Every member the two kinds share is the member the baseline
 * projection declares; only the kind discriminator, the contract version, the Task mode, the declared
 * reducer stages, and the Result Set Revision differ. The baseline shape is therefore unchanged, and
 * a reader discriminates on `kind` (protocol 26).
 */
export interface FactualReviewProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof FACTUAL_REVIEW_KIND;
  contractVersion: typeof FACTUAL_REVIEW_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: FactualReviewGoal;
    expectedOutcome: typeof FACTUAL_REVIEW_EXPECTED_OUTCOME;
    createdAt: string;
    mode: FactualReviewTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    reducerStages: readonly ['unit-validation', 'reference-integrity', 'finding-reduction'];
    stopCondition: string;
  };
  resultSetRevision: null | FactualReviewResultSetRevisionProjection;
  /** The factual kind declares no update mode yet; its update surfaces arrive with S18b and S19. */
  update: null;
  updateControls: null;
  history: null | FactualReviewHistoryProjection;
  inspectedRevision: null | { revision: FactualReviewResultSetRevisionProjection; current: boolean; readOnly: true };
}

// ---- 审阅 review categories (Issue #417, plan slice S69) --------------------------------------------

/** V2-UX-REV-004's three severities, as the contract spells them and as an editor reads them. */
export type ReviewFindingSeverity = 'must' | 'should' | 'note';
export const REVIEW_FINDING_SEVERITIES: readonly ReviewFindingSeverity[] = ['must', 'should', 'note'];
export const REVIEW_FINDING_SEVERITY_LABELS = {
  must: '必须处理',
  should: '建议处理',
  note: '提示',
} as const satisfies Record<ReviewFindingSeverity, string>;

/** What a category's findings become on the manuscript: a 修改建议 with its replacement, or a 批注. */
export type ReviewCategoryOutputKind = 'change-suggestion' | 'annotation';

/** The category facts a revision states about itself, so a finding never has to repeat them. */
export interface ReviewCategoryIdentityProjection {
  categoryId: string;
  label: string;
  output: ReviewCategoryOutputKind;
  /** Findings of this category are only `需人工复核的风险点`: AI7 states no compliance, plagiarism or policy verdict. */
  riskPointsOnly: boolean;
}

/** The identity of one listed finding inside its unit: the block it named and its position in the list. */
export interface ReviewFindingIdentityProjection {
  unitOrdinal: number;
  blockOrdinal: number;
  findingOrdinal: number;
}

/** Exact unit evidence retained when overlapping review units name the same occurrence. */
export interface ReviewUnitFindingReference extends ReviewFindingIdentityProjection {
  unitDigest: string;
  resultDigest: string;
}

/** A baseline is frozen with the category Run; it is a lead, never a replacement for manuscript evidence. */
export interface ReviewBaselineSource {
  resultSetId: string;
  revisionId: string;
  digest: string;
  manuscriptPin: BaselineAnalysisResultSetRevisionProjection['manuscriptPin'];
  leads: ReadonlyArray<{ ref: string; kind: string; text: string; ranges: ReadonlyArray<AnalysisSourceRangeProjection> }>;
  omitted: number;
}

export interface ReviewSynthesisEvidence {
  ref: string;
  blockPosition: number;
  sourceRange: FactualSourceRangeProjection;
  quote: string;
  unitOrdinal: number;
  unitFindingRefs: ReadonlyArray<ReviewUnitFindingReference>;
  baselineLeadRefs: ReadonlyArray<string>;
}

export interface ReviewCrossChapterInput {
  schema: 'ai7.editorial-review.cross-chapter-input/1';
  categoryId: string;
  categoryContractDigest: string;
  closedUnitSetDigest: string;
  units: ReadonlyArray<{ unitOrdinal: number; unitDigest: string; resultDigest: string }>;
  manuscriptPin: CoverageManifestProjection['manuscript'];
  baseline: ReviewBaselineSource | null;
  findings: ReadonlyArray<ReviewCategoryFindingProjection>;
  evidence: ReadonlyArray<ReviewSynthesisEvidence>;
  omitted: { units: number; findings: number; evidence: number; baselineLeads: number };
}

export interface ReviewCrossChapterResult {
  readonly schema: 'ai7.editorial-review.cross-chapter-result/1';
  readonly findings: ReadonlyArray<{ readonly anchor: ReviewSynthesisEvidence; readonly evidence: ReadonlyArray<ReviewSynthesisEvidence>;
    readonly severity: ReviewFindingSeverity; readonly note: string; readonly clauseId: string }>;
  readonly rejected: ReadonlyArray<{ readonly index: number; readonly text: string; readonly reason: 'schema-invalid' | 'evidence-unknown' }>;
  readonly input: ReviewCrossChapterInput;
}

/**
 * One located review finding. `sourceRange` is the exact grapheme range the service found the
 * quotation at in the committed block — never an offset the model supplied — which is the anchor an
 * Editorial Mark is made from. `replacement` is the text a 修改建议 proposes in place of that range
 * (an empty string proposes deleting it) and is `null` for a 批注.
 */
export interface ReviewCategoryFindingProjection {
  findingId: string;
  unitOrdinal: number;
  blockId: string;
  sourceRange: FactualSourceRangeProjection;
  quote: string;
  severity: ReviewFindingSeverity;
  note: string;
  replacement: string | null;
  /** The guideline clause the model named as its basis, when it named one the category lists. */
  clauseId: string | null;
  /** The identities of the duplicate findings merged into this record; empty when none were. */
  mergedFrom: ReadonlyArray<ReviewFindingIdentityProjection>;
  /** Includes the first unit finding as well as every duplicate; historical records may omit it. */
  unitFindingRefs?: ReadonlyArray<ReviewUnitFindingReference>;
  crossChapter?: {
    contractDigest: string;
    requestDigest: string;
    evidence: ReadonlyArray<ReviewSynthesisEvidence>;
    baseline: Omit<ReviewBaselineSource, 'leads' | 'omitted'> | null;
  };
}

/**
 * Why a listed finding never became one. The first two are Reference Integrity's — the quotation is
 * not in the block it named, or is there more than once — and the third is a 修改建议 whose replacement
 * is exactly the text already there, which proposes nothing.
 */
export type ReviewFindingExclusionReason = 'quote-not-found' | 'quote-ambiguous' | 'replacement-identical' | 'not-exact-fetched' | ReviewContractRejectionReason;

/** The excluded appendix: what the model listed that the service could not anchor; never a mark. */
export interface ReviewCategoryExcludedProjection {
  rawText?: string;
  findingIndex?: number;
  findingId: string;
  unitOrdinal: number;
  /** The block the model named, when its ordinal resolved to one of the unit's blocks. */
  blockId: string;
  blockOrdinal: number;
  quote: string;
  severity: ReviewFindingSeverity;
  note: string;
  replacement: string | null;
  clauseId: string | null;
  reason: ReviewFindingExclusionReason;
  reasonLabel: string;
}

/** What the model listed, by severity, before any of it was located; a list, for the reason the factual counts are. */
export interface ReviewCategoryFindingCountsProjection {
  listed: number;
  bySeverity: ReadonlyArray<{ severity: ReviewFindingSeverity; count: number }>;
  /** Listed findings whose quotation verified, before duplicates merged. */
  located: number;
  excluded: number;
  merged: number;
}

/** Per-unit lineage of a review-category revision: beside the two every kind has, a unit the plan left unreviewed. */
export type ReviewCategoryUnitLineage = AnalysisUnitLineage | { kind: 'unreviewed' };

export interface ReviewScopePlanCounts extends AnalysisReusePlanCounts {
  /**
   * New units the plan does not read: never dispatched, settled as `out-of-scope` gaps — or, for one whose last read failed,
   * carried as the lost gap it is (Issue #716).
   */
  unreviewed: number;
}

export interface ReviewScopePlanUnitProjection {
  unitOrdinal: number;
  startPosition: number;
  endPosition: number;
  contentKey: string;
  disposition: 'reused' | 'recomputed' | 'unreviewed';
  /**
   * `selected-range` is an in-range unit of a first range review, where there is nothing to bypass;
   * `out-of-scope` is every `unreviewed` unit but one whose last read failed, which is `unreviewed` with
   * `predecessor-gap`: carried as a lost gap, never as out of scope (Issue #716). The other six read
   * exactly as the baseline plan's do.
   */
  reason:
    | 'compatible'
    | 'no-compatible-predecessor'
    | 'predecessor-gap'
    | 'contract-version-mismatch'
    | 'bypassed-selected-range'
    | 'bypassed-whole-book'
    | 'selected-range'
    | 'out-of-scope';
  reusedFrom: null | { revisionId: string; revisionOrdinal: number; unitOrdinal: number };
}

/**
 * The scope plan of a kind that leaves out-of-scope units unreviewed: the reuse plan's second record
 * version. It differs from `/1` in exactly what such a kind needs — a predecessor that may be absent
 * (a first range review has none), the `unreviewed` disposition with its count, and the kind it was
 * derived for — and is never written for the baseline or the factual kind, whose `/1` records keep
 * their bytes.
 */
export interface ReviewScopePlanProjection {
  schema: 'ai7.analysis.reuse-plan/2';
  /** The kind the plan was derived for; the record is kind-generic, and only review categories write it today. */
  kind: AnalysisKindId;
  mode: AnalysisTaskMode;
  contractVersion: string;
  predecessor: null | { revisionId: string; ordinal: number; digest: string; contractVersion: string; coverageManifestDigest: string; unitCount: number };
  coverageManifestDigest: string;
  selectedRange: BaselineAnalysisSelectedRange | null;
  recomputeClosure: ReadonlyArray<number>;
  units: ReadonlyArray<ReviewScopePlanUnitProjection>;
  predecessorUnits: ReadonlyArray<AnalysisReusePlanPredecessorUnitProjection>;
  counts: ReviewScopePlanCounts;
}

/** How a review-category revision came to be; a first range review has a plan and no predecessor. */
export interface ReviewCategoryRevisionUpdateProjection {
  mode: ReviewCategoryTaskMode;
  modeLabel: string;
  predecessor: null | { revisionId: string; ordinal: number; digest: string };
  reusePlanDigest: string | null;
  selectedRange: BaselineAnalysisSelectedRange | null;
  counts: ReviewScopePlanCounts;
}

export type ReviewCategoryUnitProjection =
  | {
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      findings: ReadonlyArray<{
        blockOrdinal: number;
        quote: string;
        severity: ReviewFindingSeverity;
        note: string;
        replacement?: string;
        clauseId?: string;
      }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

/**
 * A review category's Result Set Revision: the located findings, the excluded appendix and the counts,
 * beside every shared component the other kinds carry, computed by the same reducers.
 */
export interface ReviewCategoryResultSetRevisionProjection {
  crossChapterSynthesis?:
    | { state: 'closed'; requestDigest: string; usage: { inputTokens: number; outputTokens: number } | null; result: ReviewCrossChapterResult }
    | { state: 'gap'; requestDigest: string; code: string; reason: string }
    | { state: 'not-run'; reason: string };
  resultSetId: string;
  revisionId: string;
  ordinal: number;
  createdAt: string;
  digest: string;
  contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION | 'ai7.editorial-review/1';
  manuscriptPin: { bookId: string; manuscriptId: string; revisionId: string; revisionLabel: string; revisionDigest: string };
  coverageManifestDigest: string;
  schemaDigest: string;
  reducerDigest: string;
  adapterPin: { route: ExecutionRouteId; model: string; fixtureIdentity: string | null; fixtureSha256: string | null };
  bindingPin: { attemptId: string; bindingDigest: string; harnessSessionId: string; behaviorCompositionDigest: string; promptContractDigest: string };
  policyPin: ResultSetPolicyPin;
  provenance: { taskIntentId: string; runRecordId: string; attemptId: string; planVersion?: number; adaptations?: { count: number; unitOrdinals: ReadonlyArray<number> } };
  usage: { inputTokens: number; outputTokens: number; requests: number };
  update: ReviewCategoryRevisionUpdateProjection;
  lineage: ReadonlyArray<{ unitOrdinal: number } & ReviewCategoryUnitLineage>;
  coverage: AnalysisCoverageAxis;
  reducerClosure: AnalysisReducerClosureAxis;
  freshness: AnalysisFreshnessAxis;
  assurance: AnalysisAssuranceAxis;
  gaps: ReadonlyArray<AnalysisGapProjection>;
  category: ReviewCategoryIdentityProjection;
  findings: ReadonlyArray<ReviewCategoryFindingProjection>;
  excluded: ReadonlyArray<ReviewCategoryExcludedProjection>;
  findingCounts: ReviewCategoryFindingCountsProjection;
  /** The adversarial sample drawn over `findings` after the reduction; it edits none of them. */
  assuranceSample: AnalysisAssuranceSampleProjection;
  units: ReadonlyArray<ReviewCategoryUnitProjection>;
}

/** The latest Task's plan facts when it is any mode but the whole first review. */
export interface ReviewCategoryUpdateProjection {
  mode: Exclude<ReviewCategoryTaskMode, 'review-first'>;
  modeLabel: string;
  meaning: string;
  /** `null` for a first range review, which starts the Result Set it would otherwise name. */
  predecessor: null | {
    revisionId: string;
    ordinal: number;
    digest: string;
    manuscriptPin: { revisionLabel: string; revisionId: string; revisionDigest: string };
  };
  /** Whether the Result Set still stands where the Task found it; authorization re-verifies it. */
  predecessorCurrent: boolean;
  selectedRange: BaselineAnalysisSelectedRange | null;
  reusePlan: ReviewScopePlanProjection | null;
  reusePlanDigest: string | null;
}

export interface ReviewCategoryUpdateActionProjection extends Omit<BaselineAnalysisUpdateActionProjection, 'mode' | 'expected'> {
  mode: ReviewCategoryUpdateMode;
  expected: ReviewScopePlanCounts | null;
}

export interface ReviewCategoryRangeOptionProjection extends Omit<BaselineAnalysisRangeOptionProjection, 'expected'> {
  expected: ReviewScopePlanCounts;
}

/** The update controls of one category, keyed by its own three update modes. */
export interface ReviewCategoryUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: {
    'review-sync': ReviewCategoryUpdateActionProjection;
    'review-range': ReviewCategoryUpdateActionProjection & { options: ReadonlyArray<ReviewCategoryRangeOptionProjection> };
    'review-again': ReviewCategoryUpdateActionProjection;
  };
}

export interface ReviewCategoryHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: ReviewCategoryTaskMode;
  contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION | 'ai7.editorial-review/1';
  counts: ReviewScopePlanCounts;
}

export interface ReviewCategoryHistoryProjection {
  resultSetId: string;
  kind: ReviewCategoryKindId;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<ReviewCategoryHistoryEntryProjection>;
}

/**
 * One review category's Task projection: the third member of the analysis projection union, on the
 * same real path as the other two and discriminated on `kind` (`isReviewCategoryKindId`).
 */
export interface ReviewCategoryProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: ReviewCategoryKindId;
  contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION | 'ai7.editorial-review/1';
  taskIntent: null | {
    taskIntentId: string;
    goal: ReviewCategoryGoal;
    expectedOutcome: string;
    createdAt: string;
    mode: ReviewCategoryTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'reference-integrity', 'finding-reduction'];
    stopCondition: string;
  };
  resultSetRevision: null | ReviewCategoryResultSetRevisionProjection;
  update: null | ReviewCategoryUpdateProjection;
  updateControls: null | ReviewCategoryUpdateControlsProjection;
  history: null | ReviewCategoryHistoryProjection;
  inspectedRevision: null | { revision: ReviewCategoryResultSetRevisionProjection; current: boolean; readOnly: true };
}

/** What a caller asks a category's ledger to prepare: the mode, and the block range a range mode needs. */
export interface ReviewCategoryTaskRequest {
  mode: ReviewCategoryTaskMode;
  selectedRange: BaselineAnalysisSelectedRange | null;
}

// ---- AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-001, EVAL-005 to EVAL-007) -------------------------------------

/** 依据充分度 of one item (EVAL-005), derived from what AI7 cited for it: `充分`, `一般` or `不足`. */
export type InitialEvaluationSufficiency = 'sufficient' | 'fair' | 'insufficient';

/** One thing AI7 noted about one scored item in one reading range, with the blocks it rests on. */
export interface InitialEvaluationObservationProjection {
  itemId: string;
  unitOrdinal: number;
  note: string;
  blockIds: ReadonlyArray<string>;
}

/** AI7's 初评 of one scored item: its score in half points within the item's 满分, its comment, and what it rests on. */
export interface InitialEvaluationItemProjection {
  itemId: string;
  /** `null` when the book-level synthesis did not close: AI7 then scores nothing. */
  score: number | null;
  comment: string | null;
  sufficiency: InitialEvaluationSufficiency;
  /** Distinct blocks cited for the item across the Book, and the reading ranges they fall in. */
  citedBlocks: number;
  unitsCited: number;
  observations: ReadonlyArray<InitialEvaluationObservationProjection>;
}

/** The evaluation kind's own component of a Result Set Revision. */
export interface InitialEvaluationResultProjection {
  /** The house Evaluation Profile the contract was frozen under. */
  profile: { profileId: string; version: string; sha256: string };
  items: ReadonlyArray<InitialEvaluationItemProjection>;
  strengths: ReadonlyArray<string>;
  weaknesses: ReadonlyArray<string>;
  nextStep: string | null;
  /** The conclusion AI7 would suggest; shown as AI7's, never chosen for the editor (EVAL-007). */
  suggestedConclusion: EvaluationConclusion | null;
  /** Whether the one book-level synthesis closed, and why not. */
  synthesis: { state: 'closed' | 'gap' | 'not-run'; reason: string | null };
  /**
   * AI7's market section (Issue #429, S81b2; EVAL-009), written by the same synthesis from what it read in the Book alone;
   * `null` when the synthesis did not close, and for a 初评 settled before the market section existed.
   */
  market: InitialEvaluationMarketProjection | null;
}

/**
 * One of the two predictions the market section's `预测 · 低确定性` block makes (EVAL-009): what AI7 would say, and what it
 * rests on — never a promise, and always low certainty.
 */
export interface InitialEvaluationPredictionProjection {
  readonly statement: string;
  readonly basis: string;
}

/**
 * AI7's market section of a 初评 (Issue #429, plan slice S81b2; V2-UX-EVAL-009): 目标读者, 差异化卖点 and 渠道与策略 as the
 * synthesis read them in the Book, and the `预测 · 低确定性` block for 市场回报 and 评奖可能性 — each a statement with its basis,
 * or `null` for `暂无法预测`. Web search is not connected, so nothing here rests on 外网检索 (ADR 0080 §7, 未联网核查).
 */
export interface InitialEvaluationMarketProjection {
  readonly readers: ReadonlyArray<string>;
  readonly sellingPoints: ReadonlyArray<string>;
  readonly channels: ReadonlyArray<string>;
  readonly marketReturn: InitialEvaluationPredictionProjection | null;
  readonly awards: InitialEvaluationPredictionProjection | null;
  /**
   * What AI7 wrote but the page does not show, one reason a part: a line or prediction that stated a quantity, or a part out
   * of shape. Empty when everything AI7 wrote is shown.
   */
  readonly withheld: ReadonlyArray<string>;
}

export interface InitialEvaluationRevisionUpdateProjection extends Omit<ReviewCategoryRevisionUpdateProjection, 'mode'> {
  mode: InitialEvaluationTaskMode;
}

export type InitialEvaluationUnitProjection =
  | {
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      observations: ReadonlyArray<{ itemId: string; note: string; blockOrdinals: ReadonlyArray<number> }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

export interface InitialEvaluationResultSetRevisionProjection extends Omit<
  ReviewCategoryResultSetRevisionProjection,
  'contractVersion' | 'update' | 'category' | 'findings' | 'excluded' | 'findingCounts' | 'units'
> {
  contractVersion: typeof INITIAL_EVALUATION_CONTRACT_VERSION;
  update: InitialEvaluationRevisionUpdateProjection;
  evaluation: InitialEvaluationResultProjection;
  units: ReadonlyArray<InitialEvaluationUnitProjection>;
}

export interface InitialEvaluationUpdateProjection extends Omit<ReviewCategoryUpdateProjection, 'mode'> {
  mode: 'evaluation-again';
}

export interface InitialEvaluationUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: { 'evaluation-again': Omit<ReviewCategoryUpdateActionProjection, 'mode'> & { mode: 'evaluation-again' } };
}

export interface InitialEvaluationHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: InitialEvaluationTaskMode;
  contractVersion: typeof INITIAL_EVALUATION_CONTRACT_VERSION;
  counts: ReviewScopePlanCounts;
}

export interface InitialEvaluationHistoryProjection {
  resultSetId: string;
  kind: typeof INITIAL_EVALUATION_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<InitialEvaluationHistoryEntryProjection>;
}

/** The evaluation kind's Task projection: a member of the analysis projection union, discriminated on `kind`. */
export interface InitialEvaluationProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof INITIAL_EVALUATION_KIND;
  contractVersion: typeof INITIAL_EVALUATION_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: InitialEvaluationGoal;
    expectedOutcome: typeof INITIAL_EVALUATION_EXPECTED_OUTCOME;
    createdAt: string;
    mode: InitialEvaluationTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'cross-unit-reduction', 'book-synthesis'];
    stopCondition: string;
  };
  resultSetRevision: null | InitialEvaluationResultSetRevisionProjection;
  update: null | InitialEvaluationUpdateProjection;
  updateControls: null | InitialEvaluationUpdateControlsProjection;
  history: null | InitialEvaluationHistoryProjection;
  inspectedRevision: null | { revision: InitialEvaluationResultSetRevisionProjection; current: boolean; readOnly: true };
}

// ---- 审稿意见 (Issue #429, plan slice S81c; V2-UX-EVAL-013) ------------------------------------------------------------

/** What a passage the report can point to bears out: a strength, a problem, or where a revision applies. */
export type ReadersReportPassageKind = 'strength' | 'problem' | 'suggestion';
export const READERS_REPORT_PASSAGE_KINDS: readonly ReadersReportPassageKind[] = ['strength', 'problem', 'suggestion'];

/** One passage AI7 noted in one reading range for the report, with the blocks it rests on. */
export interface ReadersReportPassageProjection {
  unitOrdinal: number;
  kind: ReadersReportPassageKind;
  note: string;
  blockIds: ReadonlyArray<string>;
}

/** The five sections as the book-level synthesis wrote them: two paragraphs and three lists. */
export interface ReadersReportSectionsProjection {
  overall: string;
  strengths: ReadonlyArray<string>;
  problems: ReadonlyArray<string>;
  suggestions: ReadonlyArray<string>;
  conclusion: string;
}

/** The reader's report kind's own component of a Result Set Revision. */
export interface ReadersReportResultProjection {
  template: ReadersReportTemplate;
  /** The house's 审稿意见 the draft was seeded with, and what the plan said of them. */
  exemplars: { count: number; statement: string };
  passages: ReadonlyArray<ReadersReportPassageProjection>;
  /** `null` when the book-level synthesis did not close: AI7 then wrote no draft. */
  sections: ReadersReportSectionsProjection | null;
  synthesis: { state: 'closed' | 'gap' | 'not-run'; reason: string | null };
}

export interface ReadersReportRevisionUpdateProjection extends Omit<ReviewCategoryRevisionUpdateProjection, 'mode'> {
  mode: ReadersReportTaskMode;
}

export type ReadersReportUnitProjection =
  | {
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      passages: ReadonlyArray<{ kind: ReadersReportPassageKind; note: string; blockOrdinals: ReadonlyArray<number> }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

export interface ReadersReportResultSetRevisionProjection extends Omit<
  ReviewCategoryResultSetRevisionProjection,
  'contractVersion' | 'update' | 'category' | 'findings' | 'excluded' | 'findingCounts' | 'units'
> {
  contractVersion: typeof READERS_REPORT_CONTRACT_VERSION;
  update: ReadersReportRevisionUpdateProjection;
  readersReport: ReadersReportResultProjection;
  units: ReadonlyArray<ReadersReportUnitProjection>;
}

export interface ReadersReportUpdateProjection extends Omit<ReviewCategoryUpdateProjection, 'mode'> {
  mode: 'readers-report-again';
}

export interface ReadersReportUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: { 'readers-report-again': Omit<ReviewCategoryUpdateActionProjection, 'mode'> & { mode: 'readers-report-again' } };
}

export interface ReadersReportHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: ReadersReportTaskMode;
  contractVersion: typeof READERS_REPORT_CONTRACT_VERSION;
  counts: ReviewScopePlanCounts;
}

export interface ReadersReportHistoryProjection {
  resultSetId: string;
  kind: typeof READERS_REPORT_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<ReadersReportHistoryEntryProjection>;
}

/** The reader's report kind's Task projection: a member of the analysis projection union, discriminated on `kind`. */
export interface ReadersReportProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof READERS_REPORT_KIND;
  contractVersion: typeof READERS_REPORT_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: ReadersReportGoal;
    expectedOutcome: typeof READERS_REPORT_EXPECTED_OUTCOME;
    createdAt: string;
    mode: ReadersReportTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'cross-unit-reduction', 'book-synthesis'];
    stopCondition: string;
  };
  resultSetRevision: null | ReadersReportResultSetRevisionProjection;
  update: null | ReadersReportUpdateProjection;
  updateControls: null | ReadersReportUpdateControlsProjection;
  history: null | ReadersReportHistoryProjection;
  inspectedRevision: null | { revision: ReadersReportResultSetRevisionProjection; current: boolean; readOnly: true };
}

// ---- 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008) ---------------------------------------------------

/** One thing AI7 noted in one reading range that bears out the editor's score of one item, with the blocks it rests on. */
export interface EvaluationRewriteObservationProjection {
  itemId: string;
  unitOrdinal: number;
  note: string;
  blockIds: ReadonlyArray<string>;
}

/** The rewritten words as the book-level synthesis wrote them: each scored item's 评语, and the 总评. Never a number. */
export interface EvaluationRewriteWordsProjection {
  /** The 评语 offered: every scored item's but those set aside. */
  items: ReadonlyArray<{ itemId: string; comment: string }>;
  /** The 总评 offered, or `null` when it was set aside. */
  verdict: string | null;
  /** What was written but is not offered — a 评语 (`itemId`) or the 总评 (`null`) that stated a score or a conclusion — and why. */
  withheld: ReadonlyArray<{ itemId: string | null; reason: string }>;
}

/** The evaluation rewrite kind's own component of a Result Set Revision. */
export interface EvaluationRewriteResultProjection {
  observations: ReadonlyArray<EvaluationRewriteObservationProjection>;
  /** `null` when the book-level synthesis did not close: AI7 then rewrote nothing. */
  words: EvaluationRewriteWordsProjection | null;
  synthesis: { state: 'closed' | 'gap' | 'not-run'; reason: string | null };
}

export interface EvaluationRewriteRevisionUpdateProjection extends Omit<ReviewCategoryRevisionUpdateProjection, 'mode'> {
  mode: EvaluationRewriteTaskMode;
}

export type EvaluationRewriteUnitProjection =
  | {
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      observations: ReadonlyArray<{ itemId: string; note: string; blockOrdinals: ReadonlyArray<number> }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

export interface EvaluationRewriteResultSetRevisionProjection extends Omit<
  ReviewCategoryResultSetRevisionProjection,
  'contractVersion' | 'update' | 'category' | 'findings' | 'excluded' | 'findingCounts' | 'units'
> {
  contractVersion: typeof EVALUATION_REWRITE_CONTRACT_VERSION;
  update: EvaluationRewriteRevisionUpdateProjection;
  rewrite: EvaluationRewriteResultProjection;
  units: ReadonlyArray<EvaluationRewriteUnitProjection>;
}

export interface EvaluationRewriteUpdateProjection extends Omit<ReviewCategoryUpdateProjection, 'mode'> {
  mode: 'evaluation-rewrite-again';
}

export interface EvaluationRewriteUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: { 'evaluation-rewrite-again': Omit<ReviewCategoryUpdateActionProjection, 'mode'> & { mode: 'evaluation-rewrite-again' } };
}

export interface EvaluationRewriteHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: EvaluationRewriteTaskMode;
  contractVersion: typeof EVALUATION_REWRITE_CONTRACT_VERSION;
  counts: ReviewScopePlanCounts;
}

export interface EvaluationRewriteHistoryProjection {
  resultSetId: string;
  kind: typeof EVALUATION_REWRITE_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<EvaluationRewriteHistoryEntryProjection>;
}

/** The evaluation rewrite kind's Task projection: a member of the analysis projection union, discriminated on `kind`. */
export interface EvaluationRewriteProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof EVALUATION_REWRITE_KIND;
  contractVersion: typeof EVALUATION_REWRITE_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: EvaluationRewriteGoal;
    expectedOutcome: typeof EVALUATION_REWRITE_EXPECTED_OUTCOME;
    createdAt: string;
    mode: EvaluationRewriteTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'cross-unit-reduction', 'book-synthesis'];
    stopCondition: string;
  };
  resultSetRevision: null | EvaluationRewriteResultSetRevisionProjection;
  update: null | EvaluationRewriteUpdateProjection;
  updateControls: null | EvaluationRewriteUpdateControlsProjection;
  history: null | EvaluationRewriteHistoryProjection;
  inspectedRevision: null | { revision: EvaluationRewriteResultSetRevisionProjection; current: boolean; readOnly: true };
}

// ---- 写作任务 (Issue #432, plan slice S84a; V2-UX-DELIV-007) ------------------------------------------------------------

/** What a passage the document can draw on is: a highlight to lead with, a character, or a theme or background. */
export type WritingPassageKind = 'highlight' | 'character' | 'theme';
export const WRITING_PASSAGE_KINDS: readonly WritingPassageKind[] = ['highlight', 'character', 'theme'];

/** One passage AI7 noted in one reading range for the document, with the blocks it rests on. */
export interface WritingPassageProjection {
  unitOrdinal: number;
  kind: WritingPassageKind;
  note: string;
  blockIds: ReadonlyArray<string>;
}

/** The document as the book-level synthesis wrote it: a title, then each section's heading and paragraphs. */
export interface WritingDraftWordsProjection {
  title: string;
  sections: ReadonlyArray<{ heading: string; paragraphs: ReadonlyArray<string> }>;
}

/** The writing kind's own component of a Result Set Revision. */
export interface WritingResultProjection {
  /** The house type the draft is of, by its identity and its label. */
  typeId: string;
  typeLabel: string;
  /** The house's 范例 of the type the draft referenced, and what the plan said of them. */
  exemplars: { count: number; statement: string };
  passages: ReadonlyArray<WritingPassageProjection>;
  /** `null` when the book-level synthesis did not close — a refused copy of an exemplar included: AI7 then wrote no draft. */
  draft: WritingDraftWordsProjection | null;
  synthesis: { state: 'closed' | 'gap' | 'not-run'; reason: string | null };
}

export interface WritingRevisionUpdateProjection extends Omit<ReviewCategoryRevisionUpdateProjection, 'mode'> {
  mode: WritingTaskMode;
}

export type WritingUnitProjection =
  | {
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      passages: ReadonlyArray<{ kind: WritingPassageKind; note: string; blockOrdinals: ReadonlyArray<number> }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

export interface WritingResultSetRevisionProjection extends Omit<
  ReviewCategoryResultSetRevisionProjection,
  'contractVersion' | 'update' | 'category' | 'findings' | 'excluded' | 'findingCounts' | 'units'
> {
  contractVersion: typeof WRITING_CONTRACT_VERSION;
  update: WritingRevisionUpdateProjection;
  writing: WritingResultProjection;
  units: ReadonlyArray<WritingUnitProjection>;
}

export interface WritingUpdateProjection extends Omit<ReviewCategoryUpdateProjection, 'mode'> {
  mode: 'writing-again';
}

export interface WritingUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: { 'writing-again': Omit<ReviewCategoryUpdateActionProjection, 'mode'> & { mode: 'writing-again' } };
}

export interface WritingHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: WritingTaskMode;
  contractVersion: typeof WRITING_CONTRACT_VERSION;
  counts: ReviewScopePlanCounts;
}

export interface WritingHistoryProjection {
  resultSetId: string;
  kind: typeof WRITING_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<WritingHistoryEntryProjection>;
}

/** The writing kind's Task projection: a member of the analysis projection union, discriminated on `kind`. */
export interface WritingProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof WRITING_KIND;
  contractVersion: typeof WRITING_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: WritingGoal;
    expectedOutcome: typeof WRITING_EXPECTED_OUTCOME;
    createdAt: string;
    mode: WritingTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'cross-unit-reduction', 'book-synthesis'];
    stopCondition: string;
  };
  resultSetRevision: null | WritingResultSetRevisionProjection;
  update: null | WritingUpdateProjection;
  updateControls: null | WritingUpdateControlsProjection;
  history: null | WritingHistoryProjection;
  inspectedRevision: null | { revision: WritingResultSetRevisionProjection; current: boolean; readOnly: true };
}

/** One house type in 新建文档 · 写作任务 (DELIV-007): whether a writing Task may draft it now, and what it would reference. */
export interface WritingTaskTypeProjection {
  readonly typeId: string;
  readonly label: string;
  /** 先看计划, or why this type cannot be drafted now — it has a document, it is 本书不做, or a Task is under way. */
  readonly prepare: { readonly allowed: true; readonly mode: WritingTaskMode } | { readonly allowed: false; readonly reason: string };
  /** The house's 范例 of this type from other Books a draft would reference — never copy — and the plan's line for them. */
  readonly exemplars: { readonly count: number; readonly statement: string };
  /** The newest drafted result of this type whose document has not been made yet: 打开草稿 makes it the document. */
  readonly drafted: null | { readonly revisionId: string; readonly createdAt: string };
  /**
   * 快速开始 of this type (Issue #432, S84b; S75 D5, D6): offered only while the Book has this type's writing 默认执行规则 in
   * force that still matches the Book's facts, this launch may use one, and the type can be drafted now. A rule covers only the
   * type of the plan it was set from (Commander ruling on #701: TASK-026, no widened source). One activation prepares the Task
   * exactly as 先看计划 does and starts it exactly as 开始任务 would, its authorization naming the rule version; whatever would
   * make the start differ from the rule stops at the plan with the reason. Without a rule it is shown, disabled, with why.
   */
  readonly quickStart: BaselineAnalysisQuickStartProjection;
}

/** One 资料库 item a writing Task may list under 允许参考 (Issue #428; TASK-030, TASK-032): the product record, never a path. */
export interface WritingTaskMaterialProjection {
  readonly materialId: string;
  readonly title: string;
  /** 已提取的字数, as the item's card states it: what the bound is counted in. */
  readonly characters: number;
  /** Whose the item is: this Book's, or the house's. */
  readonly scope: 'book' | 'house';
  /** Whether a plan may list it now; when not, why — it is longer than one item may be. */
  readonly selectable: boolean;
  readonly reason: string | null;
}

/**
 * 新建文档 · 写作任务 on ⑥ 交付物 (Issue #432, S84a; V2-UX-DELIV-007): the house types, what every draft references — each
 * line saying what is there or that there is none — the four consequence rows, the Book's latest writing Task, and for each
 * type whether 快速开始 starts one under that type's writing 默认执行规则 (S84b), or why not.
 */
export interface WritingTaskProjection {
  readonly bookId: string;
  /** Why no writing Task can be prepared at all — no manuscript, a live scope, or a damaged record — or `null`. */
  readonly unavailable: string | null;
  readonly references: {
    /** 梗概与人物: the Book's latest baseline analysis, or that it has none. */
    readonly synopsis: string;
    /** 评估结论与营销要点: the latest 定稿 version, or that there is none. */
    readonly evaluation: string;
    /** 图书信息: title, authors, editors and 书系 as they stand. */
    readonly book: string;
    /**
     * 资料库 (Issue #428): the items this Book's Tasks may list under 允许参考 whose Material Index extracted text — the editor
     * ticks the ones the draft references — each with whether it may be ticked or why not, and how many more were not listed.
     */
    readonly materials: {
      readonly statement: string;
      readonly items: ReadonlyArray<WritingTaskMaterialProjection>;
      readonly more: number;
    };
  };
  /** The four rows (editor-surfaces §9: 四行后果): 会读取 · 会发送 · 不会做 · 费用. */
  readonly consequences: { readonly read: string; readonly send: string; readonly notDo: string; readonly cost: string };
  readonly types: ReadonlyArray<WritingTaskTypeProjection>;
  /** The Book's latest writing Task, which the Task Drawer opens; `null` before the first is prepared. */
  readonly task: null | {
    readonly taskIntentId: string;
    readonly typeId: string;
    readonly typeLabel: string;
    readonly state: BaselineAnalysisProjection['state'];
    readonly label: string;
    /** Why the Task's settled Run wrote no draft — a copy of an exemplar refused, or a synthesis that did not close — or `null`. */
    readonly refusal: string | null;
    /** The Plan Envelope the Task froze — the exact plan a 快速开始 starts (S84b) — or `null` while none is frozen. */
    readonly planEnvelopeDigest: string | null;
  };
}

/** What one 快速开始 of a writing Task did: started it under the rule, or stopped at its plan with the reasons (S84b). */
export interface QuickStartWritingTaskResult {
  outcome: 'started' | 'fell-back';
  reasons: ReadonlyArray<string>;
  /** 新建文档 · 写作任务 as it stands after it. */
  projection: WritingTaskProjection;
}

/** 打开草稿's answer: the document the draft became, of its type, and 新建文档 · 写作任务 as it stands after it. */
export interface WritingDraftCreatedProjection {
  readonly writing: WritingTaskProjection;
  readonly typeId: string;
  readonly typeLabel: string;
  readonly document: ProductionDocumentProjection;
}

// ---- 审阅记录 Review Runs (Issue #417, plan slice S69) ---------------------------------------------

/**
 * The editor's words for the analysis's own lead tokens (V2-UX-LAYER-003). The deterministic conflict
 * kinds are ②A's; the four cross-unit kinds read as the 情节逻辑与前后一致 leads they become (REV-011).
 * `Record`s over the closed unions, so a new kind fails to compile instead of reaching a mark as a token.
 */
export const ANALYSIS_CONFLICT_KIND_LABELS: Record<AnalysisConflictProjection['kind'], string> = {
  'unit-reported': '单元内报告',
  'alias-collision': '别名冲突',
  'entity-kind-divergence': '实体类别分歧',
  'setting-claim-divergence': '设定声明分歧',
};
export const ANALYSIS_CROSS_UNIT_FINDING_KIND_LABELS: Record<AnalysisCrossUnitFindingProjection['kind'], string> = {
  contradiction: '前后矛盾',
  'continuity-break': '连续性断裂',
  'alias-identity-divergence': '同名异指',
  'chronology-conflict': '时间线冲突',
};

/** V2-UX-REV-001's four scopes: 全书, selected chapters, chapters changed since the last review, the current selection. */
export type ReviewScopeKind = 'whole' | 'chapters' | 'changed' | 'selection';
export const REVIEW_SCOPE_KINDS: readonly ReviewScopeKind[] = ['whole', 'chapters', 'changed', 'selection'];
export const REVIEW_SCOPE_LABELS = {
  whole: '全书',
  chapters: '选章',
  changed: '只审改动过的章',
  selection: '当前选区',
} as const satisfies Record<ReviewScopeKind, string>;

/**
 * What an editor asks a Review Run to read. 选章 names the first and the last chapter of one contiguous
 * run by the block identity of each chapter's first block; 当前选区 (Issue #423, S77b) names the first and
 * the last block of the selection 就这段发起任务… hands over, in the same two fields; every other scope
 * names neither.
 */
export interface ReviewRunScopeRequest {
  kind: ReviewScopeKind;
  fromChapterBlockId: string | null;
  toChapterBlockId: string | null;
}

/** V2-UX-REV-004's status, derived from the finding's mark and never stored beside it (MARK-010). */
export type ReviewFindingStatus = 'pending' | 'handled' | 'ignored';
export const REVIEW_FINDING_STATUS_LABELS = {
  pending: '待处理',
  handled: '已处理',
  ignored: '已忽略',
} as const satisfies Record<ReviewFindingStatus, string>;

/** Each category against the current manuscript (V2-UX-REV-007). */
export type ReviewCoverageState = 'never' | 'current' | 'needs-review' | 'unavailable';
export const REVIEW_COVERAGE_STATE_LABELS = {
  never: '未审阅',
  current: '已审阅 · 当前稿件',
  'needs-review': '需复审',
  unavailable: '不可用',
} as const satisfies Record<ReviewCoverageState, string>;

/**
 * A Review Run as a whole. `partial` is a Run that stopped with some categories finished and others not
 * — after a restart, `canContinue` says whether 继续审阅 would pick up the categories never finished.
 * `scope-changed` is a Run a Series Retrieval Exclusion stopped before a further read (Issue #64, S29b; SER-024): its only ways
 * on are 修改计划并重新授权 and 取消任务; `cancelled` is such a Run the editor then cancelled.
 * `waiting` is a Run the editor started with 联网后开始任务 (Issue #760, S74c; OFF-005): approved, and waiting in Connectivity
 * Wait — nothing of it has begun. `plan-moved` is such a Run whose plan moved before it could start (OFF-008): Reconnect Preflight
 * stopped it before anything was sent, and the way on is a new 审阅.
 */
export type ReviewRunState = 'prepared' | 'waiting' | 'running' | 'settled' | 'partial' | 'failed' | 'scope-changed' | 'plan-moved' | 'cancelled';

/**
 * One category inside a Review Run. `settled` means its findings are on the manuscript and actionable
 * (V2-UX-REV-008); `refused` is a category that could not start — its plan changed, its basis is gone,
 * or the launch cannot execute it — with the reason in `detail`.
 */
export type ReviewRunCategoryState = 'prepared' | 'waiting' | 'running' | 'settled' | 'failed' | 'interrupted' | 'refused';

export interface ReviewAvailabilityProjection {
  available: boolean;
  unavailableReason: string | null;
}

/** One category of the configuration as the 新建审阅 sheet shows it, its basis stated once (REV-010). */
export interface ReviewWorkspaceCategoryProjection {
  /** Only model-calling review contracts consume 资料库 references; factual review does not. */
  materialReferencesAllowed?: boolean;
  categoryId: string;
  label: string;
  description: string;
  output: ReviewCategoryOutputKind;
  riskPointsOnly: boolean;
  batchApply: boolean;
  searchEngine: boolean;
  /** Whether the category reads without a model and sends nothing: the leads read the baseline analysis. */
  modelFree: boolean;
  basisStatement: string;
  guidelineDocuments: ReadonlyArray<{ documentId: string; title: string; issuer: string; version: string; clauseCount: number }>;
  procedure: { title: string; version: string };
  available: boolean;
  unavailableReason: string | null;
  /** Which scopes this category can read now; 事实核查 and the leads read fewer than the rest. */
  scopes: Readonly<Record<ReviewScopeKind, ReviewAvailabilityProjection>>;
}

/** One row of the coverage matrix: a category against the manuscript as it stands now (REV-007). */
export interface ReviewCoverageRowProjection {
  categoryId: string;
  label: string;
  state: ReviewCoverageState;
  stateLabel: string;
  /** The 第 N 次 whose findings this row stands on; `null` before any. */
  lastRunOrdinal: number | null;
  /** The Manuscript Revision that review read; `null` before any. */
  lastReviewedRevisionLabel: string | null;
  /** Blocks added, removed or changed since that review; `null` before any. */
  changedBlocks: number | null;
  /**
   * Why the category cannot run, on an `unavailable` row; on a reviewed one (Issue #709), what could not be checked: an
   * earlier review record the walk for unread changes could not read. `null` otherwise.
   */
  unavailableReason: string | null;
}

/**
 * A chapter an editor can start or end 选章 at. From the outline when the manuscript has headings; a
 * manuscript without any offers its analysis units instead, which is the structure a review reads.
 */
export interface ReviewChapterOptionProjection {
  blockId: string;
  title: string;
  level: number;
  position: number;
  /** The chapter's last block: the block before the next chapter of the same or a higher level, or the manuscript's last. */
  endPosition: number;
}

export interface ReviewScopeOptionsProjection {
  whole: ReviewAvailabilityProjection;
  chapters: ReviewAvailabilityProjection & { basis: 'outline' | 'analysis-units'; chapters: ReadonlyArray<ReviewChapterOptionProjection> };
  changed: ReviewAvailabilityProjection;
  selection: ReviewAvailabilityProjection;
}

/** Findings by severity and by derived status; a finding counts once in each. */
export interface ReviewFindingCountsProjection {
  must: number;
  should: number;
  note: number;
  pending: number;
  handled: number;
  ignored: number;
}

/** One entry of the 审阅记录 list, newest first: 第 N 次 with its categories, scope and outcome. */
export interface ReviewRunSummaryProjection {
  reviewRunId: string;
  ordinal: number;
  label: string;
  createdAt: string;
  scopeLabel: string;
  categoryLabels: ReadonlyArray<string>;
  state: ReviewRunState;
  stateLabel: string;
  findingCounts: ReviewFindingCountsProjection;
  /** The latest 审阅报告 version; `null` before one is generated. */
  reportVersion: number | null;
  /** `此结果使用的材料后来被排除` when a result of the Run used Series material later excluded (Issue #64, S29b; SER-026). */
  historicalMarker: string | null;
}

/** What a category's Task plan freezes, as the plan screen states it before the one approval. */
export interface ReviewRunCategoryPlanProjection {
  units: number;
  recomputed: number;
  reused: number;
  unreviewed: number;
  taskInputRevisionLabel: string;
  routeLabel: string;
  providerStatusLabel: string;
  budgetCeilingLabel: string;
}

export interface ReviewRunCategoryProjection {
  categoryId: string;
  label: string;
  position: number;
  output: ReviewCategoryOutputKind;
  riskPointsOnly: boolean;
  batchApply: boolean;
  basisStatement: string;
  state: ReviewRunCategoryState;
  stateLabel: string;
  detail: string | null;
  /** The category's Task; `null` for the model-free leads, which have none. */
  taskIntentId: string | null;
  planEnvelopeDigest: string | null;
  modeLabel: string | null;
  plan: ReviewRunCategoryPlanProjection | null;
  /** Measured Run Progress while this category's Run executes; `null` otherwise. */
  progress: NonNullable<BaselineAnalysisProjection['run']>['progress'];
  findingsCount: number;
  /** What the category listed that could not be anchored: the excluded appendix, never a mark. */
  excludedCount: number;
}

/** One finding of a Review Run: one record with the Editorial Mark it became (MARK-010, FIND-002). */
export interface ReviewFindingProjection {
  findingId: string;
  categoryId: string;
  categoryLabel: string;
  ordinal: number;
  severity: ReviewFindingSeverity;
  severityLabel: string;
  output: ReviewCategoryOutputKind;
  /** Only `需人工复核的风险点`: AI7 states no compliance, plagiarism or policy verdict (REV-003). */
  riskPoint: boolean;
  status: ReviewFindingStatus;
  statusLabel: string;
  statusDetail: string;
  blockId: string;
  /** Where the words stand now: the mark's live range, or the range the review found them at. */
  fromGrapheme: number;
  toGrapheme: number;
  /** The block's position in the working manuscript; `null` once the block is no longer part of it. */
  blockPosition: number | null;
  /** The chapter option the block falls in, for the 章 filter; `null` outside every chapter. */
  chapterBlockId: string | null;
  chapterTitle: string | null;
  quote: string;
  note: string;
  referencedRuleVersions?: ReadonlyArray<ReferencedRuleVersion>;
  /** The latest local decision's identity, for its optional learning ask. */
  learningDecisionId?: string | null;
  /** What a 修改建议 proposes in place of the quotation (empty proposes deleting it); `null` for a 批注. */
  replacement: string | null;
  clauseRefs: ReadonlyArray<{ documentTitle: string; clauseId: string; text: string }>;
  /** The finding's own state line, such as 事实核查's `未外部复核`; `null` when it has none. */
  stateLine: string | null;
  markId: string | null;
  markStatus: 'open' | 'resolved' | 'applied' | 'removed' | 'converted' | null;
  anchorState: 'exact' | 'drifted' | 'detached' | 'anchor-changed';
  ignoreReason: string | null;
  /**
   * `此结果使用的材料后来被排除` when the finding's category read Series material later excluded (Issue #64, S29b; SER-026):
   * history, never a verdict on the finding, which stays exactly as it was.
   */
  historicalMarker: string | null;
}

/** The versioned 审阅报告 (REV-009) exactly as recorded, read back with the digest of its canonical JSON. */
export interface ReviewReportProjection {
  reportId: string;
  version: number;
  generatedAt: string;
  digest: string;
  record: ReviewReportRecord;
}

/** The most Learning Materials 为什么会影响这个结果 names for one category; the rest are counted. */
export const MAX_REVIEW_RUN_INFLUENCE_MATERIALS = 20;
/** One category's 本社审阅偏好 version and the materials behind the lines its Run read (Issue #912). */
export interface ReviewRunInfluenceProjection {
  categoryId: string;
  categoryLabel: string;
  versionId: string;
  ordinal: number;
  sourceCount: number;
  materials: ReadonlyArray<{
    bookId: string;
    bookTitle: string;
    /** `null` where the decision behind it is no longer in this house's records. */
    materialKey: string | null;
    kind: LearningLedgerMaterialKind | null;
    /** Local historical provenance only; absent on legacy /1 sources. */
    provenanceAvailability?: 'available' | 'unavailable';
    /** When its 停止今后使用 was recorded after it was admitted; `null` while it stands. */
    withdrawnAt: string | null;
  }>;
  moreMaterials: number;
}

/** Local, versioned editorial preferences; attribution never enters the prompt block. */
export interface HouseReviewPreferenceUse {
  versionId: string;
  ordinal: number;
  materialSetDigest: string;
  sourceCount: number;
  lines: ReadonlyArray<string>;
  /** Absent on /1–/3 pins. Indices identify whole lines of the exact version, in retrieval rank order. */
  selection?: { lineIndexes: ReadonlyArray<number> };
}
export interface HouseReviewPreferenceVersion {
  schema: 'ai7.house-review-preference/1' | 'ai7.house-review-preference/2';
  governance?: { baseLines: HouseReviewPreferenceVersion['lines']; baseMaterialSetDigest: string; headDirectiveId: string };
  legacyBasis?: { lines: HouseReviewPreferenceVersion['lines']; materialSetDigest: string };
  versionId: string;
  ordinal: number;
  supersedes: string | null;
  operationalScope: TrustedOperationalScope;
  materialSetDigest: string;
  recordedAt: string;
  sourceCount: number;
  lines: ReadonlyArray<{
    text: string; categoryId: string; bookId: string | null;
    lineId?: string;
    owner?: { kind: 'legacy-preference'; itemId: string } | { kind: 'editorial-memory'; itemId: string; versionId: string };
    sources: ReadonlyArray<HouseReviewPreferenceSource>;
  }>;
}
export type HouseReviewPreferenceSource = {
  kind?: 'review-decision'; bookId: string; bookTitle: string; materialDigest: string; decisionId: string;
  eligibilityDecisionId: string; qualityLineageDigest: string; feedbackKey?: string;
  attribution: { peopleVersion: number; authors: ReadonlyArray<string>; editors: ReadonlyArray<string> };
} | {
  kind: 'editorial-memory'; bookId: string; bookTitle: string; materialDigest: string; decisionId: string | null;
  /** Automatic admission has no human decision identity. */
  eligibilityDecisionId?: never;
  itemId: string; versionId: string; actionId: string; sourceKey: string; feedbackKey: string;
  captured: import('./protocol/learning.js').EditorialMemorySourceSnapshot;
  currentAdmission: import('./protocol/learning.js').EditorialMemoryAdmission;
  currentEligibility: 'book' | 'house';
  attribution: { peopleVersion: number; authors: ReadonlyArray<string>; editors: ReadonlyArray<string> };
};
export interface HouseReviewPreferenceProjection {
  operationalScope: TrustedOperationalScope;
  current: HouseReviewPreferenceVersion | null;
  history: ReadonlyArray<{ versionId: string; ordinal: number; recordedAt: string; sourceCount: number }>;
  basis: string;
}
export interface EditQualitySignalsProjection {
  bookId: string | null;
  applied: number;
  surviving: number;
  editVolume: number;
  lineageDigest: string;
  preferenceAdoption?: ReadonlyArray<PreferenceAdoptionProjection>;
  preferenceAdoptionNext?: PreferenceAdoptionCursor | null;
  categories: ReadonlyArray<{ categoryId: string; applied: number; surviving: number; editVolume: number; lineageDigest: string }>;
}

export interface ReviewReportRecord extends ReviewReportDerivedSections {
  schema: ReviewReportSchema;
  reviewRunId: string;
  version: number;
  generatedAt: string;
  run: {
    ordinal: number;
    label: string;
    createdAt: string;
    scopeLabel: string;
    manuscript: { revisionId: string; revisionLabel: string; journalSequence: number };
  };
  overview: {
    title: '概览表';
    rows: ReadonlyArray<{ categoryId: string; label: string; state: ReviewRunCategoryState; stateLabel: string; counts: ReviewFindingCountsProjection }>;
  };
  mustItems: {
    title: '必须处理的事项';
    items: ReadonlyArray<{
      findingId: string;
      categoryId: string;
      categoryLabel: string;
      locationLabel: string;
      quote: string;
      note: string;
      status: ReviewFindingStatus;
      statusLabel: string;
    }>;
  };
  categorySummaries: {
    title: '各类别摘要';
    entries: ReadonlyArray<{
      categoryId: string;
      label: string;
      output: ReviewCategoryOutputKind;
      counts: ReviewFindingCountsProjection;
      basisStatement: string;
      excludedCount: number;
      stateLine: string;
    }>;
  };
  appendix: {
    title: '附录';
    referencedRules?: ReadonlyArray<{ findingId: string; categoryLabel: string; locationLabel: string; rules: ReadonlyArray<ReferencedRuleVersion> }>;
    configuration: { schema: string; version: string; digest: string };
    categories: ReadonlyArray<{
      categoryId: string;
      label: string;
      guidelineDocuments: ReadonlyArray<{ documentId: string; title: string; issuer: string; version: string }>;
      procedure: { procedureId: string; title: string; version: string };
      planEnvelopeDigest: string | null;
      resultSetRevisionId: string | null;
      adapterPin: { route: string; model: string; fixtureIdentity: string | null; fixtureSha256: string | null } | null;
    }>;
  };
}

/** The opened Review Run (the latest when none is named) with its categories, findings and Report. */
export interface ReviewRunProjection {
  localCheck?: {
    planDigest: string;
    options: import('./protocol/procedures.js').LocalCheckOptions;
    state: string;
    paragraphs: number;
    counts: Readonly<Record<string, { checked: number; exempt: number; skipped: number; error: number; findings: number; disabled: number; outOfApplicability: number; notRecognized: number; noFinding: number }>> | null;
    excluded: readonly { candidateId: string; reason: string }[];
  };
  reviewRunId: string;
  ordinal: number;
  label: string;
  createdAt: string;
  state: ReviewRunState;
  stateLabel: string;
  /** 继续审阅 is offered exactly when an authorized Run stopped with categories never finished. */
  canContinue: boolean;
  /**
   * `selection` names a 当前选区 Run's first and last paragraph by block identity (Issue #423 review, P2-4), so 返回修改 asks for
   * the same paragraphs again; `null` for every other scope.
   */
  scope: { kind: ReviewScopeKind; label: string; selectedRange: BaselineAnalysisSelectedRange | null; selection: null | { fromBlockId: string; toBlockId: string } };
  manuscript: { manuscriptId: string; branchId: string; revisionId: string; revisionLabel: string; journalSequence: number; workingDigest: string };
  configurationDigest: string;
  authorization: null | { authorizedAt: string };
  categories: ReadonlyArray<ReviewRunCategoryProjection>;
  /**
   * One page of the findings that pass the asked filters, in ordinal order from the asked cursor on: at
   * most `MAX_REVIEW_FINDINGS_PER_PAGE`, and fewer when their words weigh more, so the workspace always
   * crosses the service boundary in one frame. The next page is read with `findingsAfterOrdinal` set to
   * the last ordinal here and the same filters.
   */
  excluded?: ReadonlyArray<ReviewExcludedFindingProjection>;
  excludedTotal?: number;
  excludedTruncated?: boolean;
  excludedNextOrdinal?: number | null;
  findings: ReadonlyArray<ReviewFindingProjection>;
  /** How many findings pass the filters, before any page is taken; unfiltered, every finding of the Run. */
  findingsTotal: number;
  /** Whether findings that pass the filters remain after this page. */
  findingsTruncated: boolean;
  /** Every finding of the Run by severity and status, whatever the filters and the page: a filter is a view (FIND-003). */
  findingCounts: ReviewFindingCountsProjection;
  report: ReviewReportProjection | null;
  reportVersions: ReadonlyArray<{ reportId: string; version: number; generatedAt: string; digest: string }>;
  /**
   * The Historically Affected Result Marker (Issue #64, S29b; SER-026): the result the Run formed used Series material that was
   * excluded afterwards. The Run, its findings and its reports are never rewritten; this says so beside them.
   */
  historicalMarker: null | {
    label: typeof HISTORICALLY_AFFECTED_RESULT_MARKER | typeof HISTORICAL_MARKER_UNVERIFIABLE | typeof LEARNING_INFLUENCE_RESULT_MARKER;
    detail: string;
    /** For a result that read a 本社审阅偏好 version since remediated (Issue #912; LAUD-008): the material, which opens in 学习回溯. */
    remediation?: { bookId: string; materialKey: string; recordedAt: string };
  };
  /**
   * 为什么会影响这个结果 (Issue #912; LAUD-004): each category's pinned 本社审阅偏好 version and the Learning Materials behind the
   * lines it read; empty when no category read one.
   */
  influence: ReadonlyArray<ReviewRunInfluenceProjection>;
  /** What a `scope-changed` Run stopped for: Series material excluded, or a 本社审阅偏好 version whose material was withdrawn. */
  scopeStop: null | 'series-knowledge' | 'house-review-preference';
  /** The Captured Procedure version the Run was prepared from, pinned (Issue #65, S30; ADR 0087 §4); `null` for one chosen by hand. */
  procedure: ReviewRunProcedureProjection | null;
  /** The pre-installed procedure version each category ran (Issue #1081, F-26a); empty for a Run recorded before revision 85. */
  preinstalledProcedures?: ReadonlyArray<{ categoryId: string; procedure: ProcedureDefinitionPin }>;
  /** Whether `将以上工序保存为可复用工序` is offered on this Run, and why not (ADR 0087 §2). */
  capture: ReviewAvailabilityProjection;
}

export interface TaskMaterialOffersProjection {
  readonly statement: string;
  readonly items: ReadonlyArray<WritingTaskMaterialProjection>;
  readonly more: number;
}

/**
 * The 审阅 destination of one Book (V2-UX-REV-001 to REV-013): the configured categories with their
 * basis, the coverage matrix, the scope options, the 审阅记录, and the opened Run.
 */
export interface ReviewWorkspaceProjection {
  /** Latest editor-declared Book table, carried by its existing local ReviewRun. */
  localBookTerms?: readonly import('./protocol/procedures.js').BookTermEntry[];
  listPages?: TaskPlanProjection['listPages'];
  /** Eligible local references offered separately from manuscript scope (Issue #428). */
  materials?: TaskMaterialOffersProjection;
  bookId: string;
  /** The Book's primary Manuscript as it stands now; `null` for a Book without one. */
  manuscript: null | { manuscriptId: string; branchId: string; revisionId: string; revisionLabel: string; journalSequence: number; workingDigest: string; totalBlocks: number };
  configuration: { schema: string; version: string; digest: string };
  categories: ReadonlyArray<ReviewWorkspaceCategoryProjection>;
  coverage: ReadonlyArray<ReviewCoverageRowProjection>;
  scopeOptions: ReviewScopeOptionsProjection;
  /** Whether 新建审阅 can prepare a Run now: not while one of this Book's runs is under way. */
  newReview: ReviewAvailabilityProjection;
  /** The 审阅记录 newest first, at most `MAX_REVIEW_RUN_SUMMARIES` of them. */
  runs: ReadonlyArray<ReviewRunSummaryProjection>;
  /** Whether older Review Runs exist beyond `runs`; each stays openable by its identity. */
  runsTruncated: boolean;
  run: ReviewRunProjection | null;
}

/**
 * The most categories one Review Run request names: the built-in configuration's nine. It bounds a
 * request frame only — which categories exist is configuration — so a house configuration with more
 * categories raises it together with its own.
 */
export const MAX_REVIEW_RUN_CATEGORIES = 9;
/** 忽略并说明's reason, in characters once trimmed; a blank one is no reason (V2-UX-REV-004). */
export const MAX_REVIEW_FINDING_REASON_CHARACTERS = 500;
/** A finding of a Review Run: `rvf_` and 24 hex digits, content-derived from the Run, the category and the kind-level finding. */
export const REVIEW_FINDING_ID_PATTERN = /^rvf_[0-9a-f]{24}$/u;
/** The most findings one workspace answer carries; a finding weighs about a kilobyte on the wire. */
export const MAX_REVIEW_FINDINGS_PER_PAGE = 300;
/** The most 审阅记录 entries one workspace answer lists, newest first. */
export const MAX_REVIEW_RUN_SUMMARIES = 50;
/** The most 修改建议 one 确认应用 writes: the batch Apply's own bound (Issue #408). */
export const MAX_BATCH_APPLY_SUGGESTIONS = 500;
export const REVIEW_FINDING_STATUSES: readonly ReviewFindingStatus[] = ['pending', 'handled', 'ignored'];

/**
 * Which of the opened Run's findings one workspace answer carries (V2-UX-REV-005, FIND-003): a cursor
 * and the four filters of the results, each `null` for 全部. Filtering happens in the service so a page
 * stays small; it is a view only and changes no finding, disposition or mark.
 */
export interface ReviewFindingPageRequest {
  excludedAfterOrdinal?: number | null;
  /** The last ordinal the previous page ended at; `null` starts at the first finding. */
  findingsAfterOrdinal: number | null;
  categoryId: string | null;
  severity: ReviewFindingSeverity | null;
  status: ReviewFindingStatus | null;
  /** The chapter option (`ReviewChapterOptionProjection.blockId`) a finding falls in. */
  chapterBlockId: string | null;
}
/** The optional keys an inspection of the 审阅 workspace may carry beside the Book and the Run. */
export const REVIEW_FINDING_PAGE_KEYS = ['findingsAfterOrdinal', 'categoryId', 'severity', 'status', 'chapterBlockId', 'excludedAfterOrdinal'] as const satisfies
  ReadonlyArray<keyof ReviewFindingPageRequest>;

/**
 * The inputs of the 审阅 operations (Issue #417, plan slice S69, Stage C). The Book is always the
 * route's, never the renderer's: every renderer member takes the input without `bookId`, and the main
 * process supplies the Book its window is showing.
 */
export interface InspectReviewWorkspaceInput extends Partial<ReviewFindingPageRequest> {
  bookId: string;
  /** The Review Run to open; `null` opens the latest. */
  reviewRunId: string | null;
}

/** Exact authorization-time Series records; membership is prospective, exclusions remain current-read restrictions. */
export interface FrozenSeriesScope {
  readonly seriesId: string;
  readonly title: string;
  readonly members: ReadonlyArray<{
    readonly bookId: string;
    readonly manuscriptId: string | null;
    readonly revisionId: string | null;
    readonly revisionDigest: string | null;
    readonly sourceVersionId: string | null;
  }>;
  readonly knowledge: ReadonlyArray<{ readonly itemId: string; readonly revisionId: string; readonly ordinal: number; readonly digest: string }>;
  readonly exclusions: ReadonlyArray<{ readonly exclusionId: string; readonly revisionId: string; readonly version: number }>;
}

export interface PrepareReviewRunInput extends CompositeReviewRunRequest {
  decisionId?: string;
  localCheck?: import('./protocol/procedures.js').LocalCheckOptions;
  seriesId?: string | null;
  materialIds?: ReadonlyArray<string>;
  bookId: string;
  categoryIds: ReadonlyArray<string>;
  scope: ReviewRunScopeRequest;
  /**
   * The Captured Procedure version the sheet was pre-filled from (Issue #65, S30; ADR 0087 §4): exactly the version and digest
   * `inspectCapturedProcedureRun` resolved. Left out, or `null`, for categories chosen by hand.
   */
  capturedProcedure?: { versionId: string; documentSha256: string } | null;
}

export interface AuthorizeReviewRunInput {
  bookId: string;
  reviewRunId: string;
  /** The exact plan digest of every Task-backed category of the Run; none for a Run of the leads alone. */
  planDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>;
}

/** 继续审阅: drive again a Run that stopped with categories never finished (after a restart). */
export interface ContinueReviewRunInput {
  bookId: string;
  reviewRunId: string;
}

export interface RecordReviewFindingDispositionInput {
  bookId: string;
  reviewRunId: string;
  findingId: string;
  disposition: 'ignored';
  reason: string;
}

export interface GenerateReviewReportInput {
  bookId: string;
  reviewRunId: string;
}

/** 取消任务 of a Review Run a Series Retrieval Exclusion stopped (Issue #64, S29b; SER-024). */
export interface CancelReviewRunInput {
  bookId: string;
  reviewRunId: string;
}

/** 查看任务 on a Mark Card: which Review Run a produced mark came from, asked within the route's Book. */
export interface InspectReviewFindingOfMarkInput {
  bookId: string;
  markId: string;
}

/**
 * The renderer's form of the mark lookup: the manuscript and branch the Mark Card was opened on are the
 * capability its window holds, and the main process asks within that capability's Book.
 */
export interface InspectReviewFindingOfMarkRendererInput {
  manuscriptId: string;
  branchId: string;
  markId: string;
}

/**
 * The Review Run and finding a `review-category` mark belongs to — the latest Run naming it — so 查看任务
 * opens that Run with `inspectReviewWorkspace`. The lookup answers `null` for any other mark, and for a
 * mark of another Book.
 */
export interface ReviewFindingOfMarkProjection {
  bookId: string;
  reviewRunId: string;
  findingId: string;
}

// ---- The Task Drawer (Issue #418, plan slice S72; editor-surfaces §6 ③) ----------------------------------

/**
 * The Task kinds the Task Drawer shows a plan for: the three that hold a plan today (S72 D1) — J-03's
 * fixed task, the baseline analysis, and a Review Run. A kind with no ledger of its own arrives with the
 * slice that brings its ledger; nothing here is an authority record of its own. AI7's 初评 (Issue #429, S81b1) joins them
 * with its own ledger.
 */
export type TaskPlanKind = 'fixed-task' | 'baseline-analysis' | 'review-run' | 'initial-evaluation' | 'readers-report' | 'evaluation-rewrite' | 'writing';
export const TASK_PLAN_KINDS: readonly TaskPlanKind[] = [
  'fixed-task', 'baseline-analysis', 'review-run', 'initial-evaluation', 'readers-report', 'evaluation-rewrite', 'writing',
];

/** A step after the ranges whose sent request's result cannot be known (Issue #757): the reduction, a sample, the reflection. */
export type UnconfirmedStageId = 'cross-unit-reduction' | 'assurance-sampling' | 'run-report-reflection';

/**
 * 结果待确认 left by Runs that reached their Task Outcome (Issue #757): a kind that keeps no progress reads on past a range whose
 * request was sent and whose answer never came back whole, and any kind reads on past such a step. Each is listed until a later
 * Run of the kind reads it or the editor determines it — 保留为缺口, a Manual Outcome Resolution retained with its manual
 * evidence class, which sends nothing and leaves every gap as it is.
 */
export interface TaskPlanUnconfirmedProjection {
  /**
   * Each range by its ordinal in the latest revision that holds it, and, in a Review Run, its category; `earlierText` when that
   * revision read a manuscript revision other than the Book's latest, so the ordinal counts in the text as it was then.
   */
  ranges: ReadonlyArray<{ unitOrdinal: number; category: string | null; recordedAt: string; earlierText: boolean }>;
  /** Each step of the latest Run that reached its Task Outcome, and, in a Review Run, its category. */
  steps: ReadonlyArray<{ stage: UnconfirmedStageId; category: string | null; recordedAt: string }>;
  /** What 保留为缺口 settles: the service records exactly these, and refuses a list that changed since (`UNCONFIRMED_CHANGED`). */
  digest: string;
}

/** Which plan the drawer reads. The Book is always the route's; the renderer never names it. */
/**
 * The kinds whose 联网后开始任务 goes through `startTaskWhenOnline` (Issue #760, S74c): every kind with a plan and 开始任务 but the
 * baseline analysis, which keeps its own `startBaselineAnalysisWhenOnline` (Issue #502), and J-03's fixed Task, which only ever
 * records and never reaches a model service, so it is never offline (ADR 0055).
 */
export type StartWhenOnlineTaskKind = 'review-run' | 'initial-evaluation' | 'readers-report' | 'evaluation-rewrite' | 'writing';
export const START_WHEN_ONLINE_TASK_KINDS: readonly StartWhenOnlineTaskKind[] = ['review-run', 'initial-evaluation', 'readers-report', 'evaluation-rewrite', 'writing'];
export function isStartWhenOnlineTaskKind(kind: TaskPlanKind): kind is StartWhenOnlineTaskKind {
  return (START_WHEN_ONLINE_TASK_KINDS as readonly TaskPlanKind[]).includes(kind);
}

/**
 * 联网后开始任务 for one Task (Issue #760, S74c; AUTH-004, OFF-005): exactly the digests 开始任务 would bind — the plan envelope's
 * for a ledger Task (`planDigests` empty), every Task-backed category's for a Review Run (`planEnvelopeDigest` `null`).
 */
export interface StartTaskWhenOnlineInput {
  bookId: string;
  kind: StartWhenOnlineTaskKind;
  /** The Task Intent of a ledger Task; the Review Run of a review. */
  ref: string;
  planEnvelopeDigest: string | null;
  planDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>;
}

/** 取消 while a Task's Run waits to start (Issue #760; OFF-010): terminal, before anything is sent. */
export interface CancelWaitingTaskInput {
  bookId: string;
  kind: StartWhenOnlineTaskKind;
  ref: string;
}

export interface InspectTaskPlanInput {
  bookId: string;
  kind: TaskPlanKind;
  /**
   * The Task: its Task Intent for the fixed task and the baseline analysis, its Review Run for a review.
   * `null` reads the Book's current Task of the kind; a review is always named.
   */
  ref: string | null;
}

/** Controls use the same ledger Run and authorization for every planned task kind. */
export interface ControlTaskRunInput {
  bookId: string;
  kind: StartWhenOnlineTaskKind;
  ref: string;
  action: 'pause' | 'resume' | 'cancel';
}

export interface EditTaskPlanInput {
  bookId: string;
  kind: StartWhenOnlineTaskKind;
  ref: string;
  planEnvelopeDigest: string;
  removedSteps: ReadonlyArray<string>;
  disallowedAdaptations: ReadonlyArray<string>;
  askFirstAdaptations?: ReadonlyArray<string>;
  runBudgetCeiling?: { kind: 'tokens'; maxTotalTokens: number } | null;
  /** The factual-review Task's Evidence Assurance Level (Issue #901); left out keeps the version's own. */
  evidenceAssuranceLevel?: EvidenceAssuranceLevel;
}

/**
 * Where a plan stands, as the drawer's state pill says it (editor-surfaces §6 状态). `unconnected` is 模型未连接:
 * the plan's route sends to a model service whose credential is not ready (Issue #420, S74a). `offline` is 离线,
 * before authorization: the route reaches its model service over a network this device does not have now.
 * `waiting` is a Run in Connectivity Wait, whose label says what it waits for — 等待网络, 需要处理模型连接 or
 * 等待运行名额 (OFF-006) — and `cancelled` one the editor cancelled before it read anything (Issue #502).
 * `cancelling` is 正在取消: the editor cancelled a Run under way, which stops at the next unit boundary, and
 * `cancelled-after-start` the 已取消 of a Run cancelled after it began reading (Issue #422, CTRL-005). `pausing`,
 * `paused` and `resumable` are 正在暂停, 已暂停 and 任务已中断 · 可续行 (S76b; CTRL-001, CONT-014), and
 * `awaiting-clarification` 任务等待你的说明: the Run read what it could and waits for the editor's answer (S76d; CLAR-004).
 */
export type TaskPlanStateKey =
  | 'ready' | 'changed' | 'unconnected' | 'offline' | 'recorded' | 'blocked' | 'waiting' | 'running' | 'settled' | 'stopped'
  | 'cancelled' | 'cancelling' | 'cancelled-after-start' | 'pausing' | 'paused' | 'resumable' | 'awaiting-clarification' | 'budget-reached'
  | 'account-limit' | 'plan-moved'
  // 结果待确认 (Issue #51, S16c): the Run stopped on sent requests whose results cannot be known.
  | 'outcome-unknown'
  // 等待运行名额 (Issue #49, S14; CONC-007): authorized, and waiting on the governor for a place; nothing has begun.
  | 'queued';

/**
 * A started Run's controls in the drawer's bar and its activity above the plan (Issue #422, plan slice S76a;
 * V2-UX-AUTH-010, AUTH-011, CTRL-001 to CTRL-009, CONT-014, CONT-015). `取消任务` opens one inline Cancellation Impact
 * Summary, and only its confirmation records anything; `暂停` is one click (CTRL-001); a paused Run, or one AI7 stopped
 * under, offers `续行` once its revalidation holds. `改计划重做` is offered on a stopped Run (S76c) and waits, with its
 * reason, on one under way.
 */
export interface TaskPlanRunControlProjection {
  /** The one Run every control names (CTRL-009). */
  runRecordId: string;
  /** 正在取消: the editor's cancellation is recorded and the Run is stopping; nothing more is offered. */
  cancelling: boolean;
  /** 正在暂停: the editor's pause is recorded and the Run stops at the next unit boundary; nothing more is offered. */
  pausing: boolean;
  /** `reason` is `null` while 取消任务 is offered; `impact` is the Cancellation Impact Summary, one line each. */
  cancel: { reason: string | null; impact: ReadonlyArray<string> };
  /** `reason` is `null` while 暂停 is offered: a Run executing its units. */
  pause: { reason: string | null };
  /**
   * 续行 for a paused Run or one left 可续行: `reason` is `null` while its revalidation holds, else why it cannot go on
   * as it was authorized (CONT-016). `null` for a Run that is not stopped.
   */
  resume: { reason: string | null } | null;
  /** `reason` is `null` while 改计划重做 is offered — the plan's `redo` then says what it does. */
  redo: { reason: string | null };
  /**
   * The activity card's facts (AUTH-011; RUN-001 to 004, LIVE-001 to 003): the Run Liveness Signal the execution
   * owner reports, as ②A reads it. `null` when this service holds no execution of the Run.
   */
  activity: NonNullable<NonNullable<BaselineAnalysisProjection['run']>['progress']> | null;
  /** When the Run began executing its units; `null` before it did. */
  executingSince: string | null;
  /**
   * An update Run's counts (CTRL-004): the manuscript's reading ranges and how many of them the Run reuses from its
   * predecessor, so the activity card names a range among the whole manuscript and the Cancellation Impact Summary
   * keeps the reused ranges in view. `null` for a first baseline, which reads every range.
   */
  update: null | { manuscriptUnits: number; reusedUnits: number };
  /**
   * A stopped Run's continuation point (S76b): how many of the units it submits it has kept — `unitsSettled` is `null`
   * when that progress no longer reads back — and `null` while it runs. `pendingAnswerUnits` are the reading ranges whose
   * Clarification answer is recorded and not yet carried out (Issue #784): 续行 handles those first, then continues the unfinished work.
   */
  continuation: { unitsSettled: number | null; unitsTotal: number; pendingAnswerUnits: ReadonlyArray<number> } | null;
  /**
   * 模型服务账户限额 (Issue #51, S16b; V2-UX-MODEL-018): the provider's account limit stopped the Run — at the reading range it
   * refused, or `null` for the reduction or the sample after them — with the refusal as AI7 classified it; `续行` goes on
   * in the same Run once the condition clears. `null` for every other Run.
   */
  accountLimit: null | { unitOrdinal: number | null; condition: string };
  /**
   * 结果待确认 (Issue #51, S16c; V2-UX-CTRL-007, COPY-009, CONT-011, CONT-016): the stopped Run holds reading ranges whose requests
   * were sent and whose results cannot be known — each may have been processed and billed — kept as their own gaps that
   * nothing in this Run sends again. `stopped` is a Run that stopped 结果待确认 itself, which has no `续行`. `null` for every
   * Run that holds none, and while a Run executes.
   */
  outcomeUnknown: null | { units: ReadonlyArray<{ unitOrdinal: number; attempts: number }>; stopped: boolean };
}

/**
 * What the Task Drawer's authorization bar offers for one plan now (Issue #420, plan slice S74a;
 * editor-surfaces §6 常驻授权条, V2-UX-AUTH-001 to 007, MODEL-008, OFF-009):
 * - `ready`: one activation of 开始任务 records the exact Run Authorization and Run Record and hands the Run
 *   to the one execution slot (AUTH-004);
 * - `record-only`: J-03's fixed task — one activation records the Run, which never enters the scheduler
 *   (ADR 0055);
 * - `no-route`: no executable route is bound — one activation records the Run, which is blocked before
 *   dispatch;
 * - `needs-connection`: the plan's route sends to a model service and the credential it resolves is not
 *   ready — 开始任务 is disabled with that reason; this is never plan drift (OFF-009);
 * - `changed`: the plan's key content changed — 开始任务 is removed (AUTH-006); 重新确认计划 when `reconfirm`
 *   is set;
 * - `offline`: the plan's route reaches its model service over the network and this device has none now —
 *   联网后开始任务 records the exact Run Authorization and a Run that waits in Connectivity Wait until
 *   Reconnect Preflight admits it (AUTH-002, AUTH-004, OFF-004, OFF-005, Issue #502); a Review Run cannot wait
 *   yet, so its start is disabled with that reason;
 * - `started`: an authorization exists — the bar is the Run's state (AUTH-007).
 */
export type TaskPlanStartReadiness = 'ready' | 'record-only' | 'no-route' | 'needs-connection' | 'changed' | 'offline' | 'started' | 'unavailable';

/**
 * What one Reconnect Preflight did (Issue #502; OFF-007, OFF-008, OFF-009): each waiting Run is admitted to the
 * one execution slot when the model service can be reached and nothing material moved, blocked with its reason
 * when something material did, or left waiting — for the network, for the model connection, or for the slot.
 */
export interface ReconnectPreflightProjection {
  connectivity?: { classification: 'offline' | 'proxy-unreachable' | 'model-service-unreachable'; label: '离线' | '代理不可达' | '模型服务不可达' };
  admitted: number;
  blocked: number;
  waiting: number;
}

/** The authorization bar's facts, derived from the records the plan already reads: nothing here is written. */
export interface TaskPlanStartProjection {
  readiness: TaskPlanStartReadiness;
  /** Whether the plan's route sends to a model service, so starting it needs the credential that route resolves. */
  needsModelConnection: boolean;
  /**
   * The exact Plan Envelope digest one activation binds (ADR 0009, AUTH-005); `null` for a Review Run, which
   * binds one per category, and whenever 开始任务 is not offered.
   */
  planEnvelopeDigest: string | null;
  /** A Review Run's one approval: each Task-backed category's exact digest; empty for every other kind. */
  categoryDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>;
  /**
   * 重新确认计划: the preparation that yields the next plan version of the same Task Intent (V2-UX-PLAN-009);
   * `null` unless the plan changed and can be reconfirmed.
   */
  reconfirm: null | { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null };
  /**
   * Why this plan can never be started, with readiness `unavailable` (Issue #432 re-review): a writing Task whose 范例 is no
   * longer here. Absent or `null` for every other plan.
   */
  unavailableReason?: string | null;
}

/** One editorial business step and what it leaves behind (V2-UX-PLAN-003). */
export interface TaskPlanStepProjection {
  /** The step's identity in this plan, stable across versions, so an edit can name it (Issue #419). */
  id: string;
  label: string;
  result: string;
  /** Whether the editor may leave this step out (PLAN-011): only a step the Run can do without. */
  removable: boolean;
  /** Left out of this plan version at the editor's word. */
  removed: boolean;
}

/** One adaptation AI7 may make on its own during the Run (PLAN-004, PLAN-011), with whether the editor withdrew it. */
export interface TaskPlanAdaptationProjection {
  id: string;
  label: string;
  /** Whether the editor may withdraw it (= 不允许). */
  removable: boolean;
  /** Withdrawn from this plan version at the editor's word. */
  removed: boolean;
  /** Whether the editor may move it into 先问你 (Issue #422, S76d; PLAN-011). */
  movable: boolean;
  /** Moved into 先问你 in this plan version: the Run asks the editor before it makes it. */
  askFirst: boolean;
}

/**
 * The editable plan (Issue #419, plan slice S73; V2-UX-PLAN-011): whether the editor can change this plan now, and
 * the last change they made to it.
 */
export interface TaskPlanEditProjection {
  /** The plan takes edits now: a baseline analysis Task prepared and not yet started, with no key-content change pending. */
  editable: boolean;
  /** Why it does not, when it is a kind that could; `null` when editable, or for a kind that keeps no plan versions. */
  reason: string | null;
  /** The editor's last edit, which made the version shown: its version, time, and each change. */
  lastEdit: null | { ordinal: number; recordedAt: string; entries: ReadonlyArray<TaskPlanDriftEntryProjection> };
  /**
   * The envelope digest of the version shown, which 更新计划 edits; `null` when the plan takes no edit. It is the
   * edit's own: 模型未连接 or 离线 withholds 开始任务's digest, never this one.
   */
  planEnvelopeDigest: string | null;
  /**
   * 设置上限… (Issue #51, S16a; §6 ⑤, V2-UX-MODEL-013, MODEL-015): the Run Budget Ceiling this version freezes, and whether
   * the editor can set it here — `reason` says why not, on a plan that is not editable or whose launch sets the ceiling.
   * `null` for a kind whose plan takes no ceiling.
   */
  budget: null | { ceiling: RunBudgetCeilingState; settable: boolean; reason: string | null };
  /**
   * The Evidence Assurance Level selector of a factual-review Task (Issue #901; EASSURE-001, EASSURE-008): the level this
   * version freezes, each option with its consequence and, below a policy minimum, disabled with the concrete requirement.
   * Absent for every other kind.
   */
  assurance?: {
    level: EvidenceAssuranceLevel;
    settable: boolean;
    reason: string | null;
    options: ReadonlyArray<{ level: EvidenceAssuranceLevel; label: string; consequence: string; disabled: boolean; requirement: string | null }>;
  };
}

/**
 * One line of the concise diff of a plan whose key content changed (V2-UX-PLAN-009, PLAN-012). The words
 * are the drawer's own, derived from the field key the stored diff names — never the stored label, whose
 * bytes are part of an immutable record.
 */
export interface TaskPlanDriftEntryProjection {
  field: string;
  label: string;
  prior: string;
  proposed: string;
  /** `edited` for a line of the editor's own edit (Issue #419). */
  materiality: 'material' | 'derived' | 'edited';
}

/**
 * The plan of one Task as the Task Drawer shows it (V2-UX-PLAN-001 to 012, TASK-030, TASK-039/040,
 * LAYER-002, MODEL-013/014). It is a read of records that already exist, in the editor's words: no
 * envelope, row or digest is written or changed to produce it, and every exact identity it names is in
 * `technical`, unabridged. It states the plan and grants nothing (PLAN-007); `start` states what the
 * drawer's authorization bar offers, and only the bar's own activation records anything (Issue #420).
 */
export interface TaskPlanProjection {
  /** Transport-only pages; derivation and authority records remain complete. String cursors count Unicode code points. */
  listPages?: Readonly<Record<string, { shown: number; total: number; nextOrdinal: number | null; digest: string }>>;
  readonly seriesScopes?: ReadonlyArray<FrozenSeriesScope>;
  bookId: string; /** A 自定义分析维度 Task's dimension (Issue #931): its redo, 重新准备 and 重新确认 prepare on it, never the baseline. */ custom?: TaskPlanCustomDimension;
  kind: TaskPlanKind;
  /** The Task Intent or the Review Run this plan belongs to. */
  ref: string;
  state: { key: TaskPlanStateKey; label: string };
  /** The plan version shown; `null` for a kind that keeps no plan versions. */
  planVersion: number | null;
  goal: {
    sentence: string;
    chips: {
      book: string;
      /** The chapter headings the range holds, `第 a–b 段` when it holds none, `全书`, or the scope's own words. */
      position: string;
      /** Graphemes of the current plan version's range of the Task Input revision; `null` when the scope names no one range. */
      selectedGraphemes: number | null;
      /** The Task Input revision's label (`r2`). */
      taskInputRevision: string;
      procedure: string;
    };
    /** Preparing the Task saved its Task Input revision for acknowledged edits (TASK-039/040). */
    savedForEdits: boolean;
    /**
     * The Task Intent Draft this Task was prepared from with 准备计划 (Issue #423, slice 7a): its sentence, which the 目标块 shows
     * with 修改 back to the composer. Absent for every Task prepared otherwise.
     */
    draft?: { draftId: string; sentence: string };
  };
  /** 要处理 · 允许参考 · 可能发送 · 不会读, each stated apart (TASK-030). */
  scope: { process: string; reference: ReadonlyArray<string>; send: string; notRead: string };
  steps: ReadonlyArray<TaskPlanStepProjection>;
  /** Where the editor takes part (PLAN-005): during the Run, and afterwards. */
  participation: { during: string; after: string | null };
  service: {
    role: string;
    provider: string;
    /** The Provider decision (LAYER-002). */
    decision: string;
    send: string;
    /** The Outbound Data Category in the editor's words (LAYER-002). */
    sendCategory: string;
    /** 用量上限: what the Run may use at most, or that it uses nothing. */
    usage: string;
    /** Whether `usage` is a ceiling, which is labelled a ceiling and never a prediction. */
    usageIsCeiling: boolean;
    duration: string;
    /** The exact Run Budget Ceiling state (MODEL-013): `未设置任务预算上限` by default. */
    budgetCeiling: string;
    /** The Provider Account Limit, never a fabricated value (MODEL-014). */
    accountLimit: string;
  };
  outcomes: ReadonlyArray<string>;
  /** 不会做, split (editor-surfaces §10): what the editor cares about, and the technical statements. */
  notDo: { editorial: ReadonlyArray<string>; technical: ReadonlyArray<string> };
  /** The Plan Boundary Split in the editor's words (PLAN-004, PLAN-012). */
  boundary: { adaptable: ReadonlyArray<TaskPlanAdaptationProjection>; askFirst: ReadonlyArray<string> };
  /** Whether and how the editor can edit this plan (Issue #419). */
  edit: TaskPlanEditProjection;
  /** The plan's key content changed since it froze, and how that is settled; `null` while it stands. */
  drift: null | {
    reasons: ReadonlyArray<string>;
    entries: ReadonlyArray<TaskPlanDriftEntryProjection>;
    resolution: string;
  };
  /** Every exact identity of the plan (LAYER-001, LAYER-007), one step below the decision content. */
  technical: ReadonlyArray<{ key: string; label: string; value: string }>;
  /** The authorization bar: what 开始任务 does for this plan now, and exactly what it binds (Issue #420). */
  start: TaskPlanStartProjection;
  /** `设为快速开始默认…` and the rule that started the Task, when one did (Issue #421). */
  defaultRule: TaskPlanDefaultRuleProjection;
  /** A started Run's controls and activity (Issue #422); `null` while no Run of this Task is under way. */
  runControl: TaskPlanRunControlProjection | null;
  /** 改计划重做 while it can be made (Issue #422, S76c): on a stopped Run, or one cancelled after it began; else `null`. */
  redo: TaskPlanRedoProjection | null;
  /**
   * 结果待确认 after the Run that left it ended (Issue #51, S16c; CONT-011): the ranges this Task sends again whose earlier
   * request's result could not be known, and the Plan Preview's statement of it; `null` when there are none.
   */
  resend: null | { units: ReadonlyArray<number>; statement: string };
  /**
   * 结果待确认 a Run of this Task's kind left on this Book that reached its Task Outcome (Issue #757; ATTN-002, NOTIF-004,
   * CTRL-007): the ranges and steps whose sent requests' results cannot be known, which no later Run of the kind has read and
   * the editor has not kept as gaps (保留为缺口, 人工结果确认); `null` when there are none.
   */
  unconfirmed: TaskPlanUnconfirmedProjection | null;
  /** 重新准备 for a waiting Run whose plan moved before it could start (Issue #536); else `null`. */
  reprepare: TaskPlanReprepareProjection | null;
  /**
   * Why a waiting Run of a kind with no 重新准备 in the drawer never started (Issue #760, S74c; OFF-008): what moved, in
   * 需要重新确认计划's words. The kind's own surface prepares it again. Absent for every other plan.
   */
  planMovedReason?: string;
  /** What the Task's Run asked the editor (Issue #422, S76d; CLAR-001 to CLAR-007): open questions first; empty when none. */
  clarifications: ReadonlyArray<TaskPlanClarificationProjection>;
  /**
   * 已停止 · 预算已达上限 (Issue #51, S16a; V2-UX-MODEL-016, MODEL-017): the ceiling, what the Run used, and what it read
   * before the ceiling stopped it; `redo` is then 调整预算并重做. `null` for every other plan.
   */
  budgetStop: null | {
    maxTotalTokens: number;
    usedTokens: number;
    unitsSettled: number;
    unitsTotal: number;
    /** The launch set the ceiling (developer-live): only a launch with a higher one raises it, never the plan. */
    launchSetsCeiling: boolean;
  };
}

/** The answers a question about a safe retry can have (Issue #422, S76d; CLAR-006, INPUT-002). */
export type ClarificationOptionId = 'retry' | 'record-gap' | `model-option-${0 | 1 | 2 | 3}` | 'free-text' | 'no-answer';

/**
 * One Clarification Request of the Task's Run as the drawer's card shows it (Issue #422, S76d; V2-UX-CLAR-001 to
 * CLAR-007, INPUT-001 to INPUT-004): the question and why it is asked, what waits and what goes on, what happens after an
 * answer, the choices — none chosen, one 推荐 with its reason — and the note that may qualify one; once answered, the
 * answer as it was recorded. `unanswered` is a question whose Run ended before an answer came.
 */
export interface TaskPlanClarificationProjection {
  origin?: 'product' | 'model';
  freeTextAllowed?: boolean;
  taskIntentId?: string;
  requestId: string;
  unitOrdinal: number;
  planVersion: number;
  raisedAt: string;
  question: string;
  why: string;
  /** What the model service reported, in the Run's own words. */
  detail: string;
  /** 「该步骤等待说明 · 其他步骤仍在继续」 while other units go on; 「任务等待你的说明」 once nothing else can. */
  scope: string;
  after: string;
  options: ReadonlyArray<{ id: ClarificationOptionId; label: string; consequence: string; recommended: string | null }>;
  note: { label: string; hint: string; maxLength: number };
  state: 'open' | 'answered' | 'unanswered';
  answer: null | { optionId: ClarificationOptionId; label: string; note: string | null; answeredAt: string; line: string };
  /** Why the editor cannot answer now; `null` when they can. */
  answerable: { reason: string | null };
}

/**
 * 改计划重做 (Issue #422, plan slice S76c; V2-UX-AUTH-010, CONT-013): a new Task under a plan the editor may change first,
 * carrying what the Run read. A Run still stopped is cancelled first — `summary` says, before anything is recorded, what
 * stops, what is kept and what the new Task does — and a Run already cancelled is redone at once (`summary` empty).
 * `prepare` is the exact preparation the new Task takes once the Run reads 已取消.
 */
/**
 * 需要重新确认计划 (Issue #536; V2-UX-OFF-008): a Run that waited in Connectivity Wait and was blocked because the plan its
 * authorization bound moved meanwhile. A Task Intent holds one Run, so the Plan Revision and the renewed Run Authorization
 * OFF-008 routes through are a new preparation of the same goal and range: `prepare` is that exact request, and nothing
 * starts until the editor reads the new plan and starts it. `reason` names what moved.
 */
export interface TaskPlanReprepareProjection {
  reason: string;
  prepare: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null };
}

export interface TaskPlanRedoProjection {
  summary: ReadonlyArray<string>;
  prepare: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; redoOf: string }
    | { kind: StartWhenOnlineTaskKind; ref: string; redoOf: string };
}

/**
 * 默认执行规则 (Issue #421, plan slice S75; V2-UX-TASK-017, TASK-019, TASK-020, TASK-028, AUTH-009): the task
 * patterns a rule may cover — the baseline analysis's two updates of the whole Book, which ask for no range, and
 * (Issue #432, S84b) the writing Task of 新建文档 of one house type, `writing:<typeId>`: a rule covers only the type of the
 * plan it was set from (Commander ruling on #701: TASK-026, no widened source), while the editor's audience, channel and
 * requirements are each Task's own, as a range is.
 */
export type BaselineDefaultExecutionRulePattern = 'sync-current' | 'reanalyze-book';
export type WritingDefaultExecutionRulePattern = `writing:${string}`;
export type ReviewDefaultExecutionRulePattern = `review:${string}`;
export type DefaultExecutionRulePattern = BaselineDefaultExecutionRulePattern | WritingDefaultExecutionRulePattern | ReviewDefaultExecutionRulePattern;
/** The baseline's two patterns; a writing pattern is one per house type. */
export const DEFAULT_EXECUTION_RULE_PATTERNS: readonly BaselineDefaultExecutionRulePattern[] = ['sync-current', 'reanalyze-book'];
/** The analysis kind each pattern's Tasks are of, as the analysis ledger names it. */
export type DefaultExecutionRuleKind = 'baseline-analysis' | 'writing' | 'review-run';

/**
 * What a rule version binds: the material inputs of the plan the editor viewed when setting it that stay the same
 * from one Run to the next — the model service binding, the procedure pin, the Run Budget Ceiling, the outbound
 * data category and the outcome class. The range and the predecessor revision are each Run's own, never a rule's.
 */
export interface DefaultExecutionRuleBinding {
  providerBinding: MaterialPlanInputsProjection['providerBinding'];
  artifactPin: MaterialPlanInputsProjection['artifactPin'];
  runBudgetCeiling: RunBudgetCeilingState;
  outboundDataCategory: MaterialPlanInputsProjection['outboundDataCategory'];
  expectedOutcome: string;
}

/** One rule version, as a quick start or a started Task names it. */
export interface DefaultExecutionRuleReference {
  ruleId: string;
  ruleVersionId: string;
  ordinal: number;
  /** `开始同步 · 第 2 版`: the quick start the rule gives and the version in force. */
  name: string;
}

/** One 默认执行规则 as 知识库 › 工序与规则 lists it. */
export interface DefaultExecutionRuleProjection extends DefaultExecutionRuleReference {
  bookId: string;
  bookTitle: string;
  taskKind: DefaultExecutionRuleKind;
  pattern: DefaultExecutionRulePattern;
  state: 'active' | 'deactivated';
  stateLabel: string;
  /** What 快速开始 does under the rule, in one sentence. */
  does: string;
  /** What the rule binds, in the editor's words — the same rows the confirmation listed. */
  binds: ReadonlyArray<{ label: string; value: string }>;
  setBy: '本机编辑';
  /** When this version was set, from the plan it names. */
  setAt: string;
  /** When the rule was last set or turned off. */
  stateRecordedAt: string;
  sourceTaskIntentId: string;
  sourcePlanEnvelopeDigest: string;
  binding: DefaultExecutionRuleBinding;
}

// ---- 后台分析登记 (Issue #95, plan slice S39; ADR 0048; V2-UX-ANALYSIS-016 to 021) ------------------------------------

/** Where an Enrollment starts: only what changes after it is made, or the text as it stands too. */
export type BackgroundAnalysisStartingPoint = 'prospective' | 'backfill';

/**
 * What an Enrollment covers (Issue #864): this one Book, every Book of one Series it is in, or every Book of the house. A Series or
 * all-Books Enrollment is scheduled per Book in the scope's Book order, each Book's Runs held to its equal share of the ceiling.
 */
export type BackgroundAnalysisScopeKind = 'book' | 'series' | 'all-books';

/** The largest tokens ceiling 登记 takes, the same bound as a plan's own 设置上限 (Issue #51). */
export const BACKGROUND_ANALYSIS_CEILING_MAX = 999_999_999_999;

/** One scope `登记…` offers: its words and its Books in the scope's order, the first of which takes the ceiling's remainder. */
export interface BackgroundAnalysisScopeOffer {
  kind: BackgroundAnalysisScopeKind;
  /** The Series, for a `series` scope; `null` otherwise. */
  seriesId: string | null;
  /** `《甲》这一本书`, `书系《乙》的 3 本书`, `全部 5 本图书`. */
  label: string;
  books: ReadonlyArray<{ bookId: string; title: string }>;
}

/** One Book's 后台分析登记 on ②A: what it is, its state, what it would do now and why, and the decisions it offers. */
export interface BackgroundAnalysisEnrollmentProjection {
  kind?: string;
  kinds?: readonly { kind: string; label: string; enabled: boolean; reason: string | null }[];
  bookId: string;
  bookTitle: string;
  /**
   * `paused`: the editor paused it, and it starts nothing until they resume it (Issue #864); `suspended`: AI7 suspended it when the
   * local data was replaced or rolled back, and it starts nothing until the editor confirms it again (待你确认); `damaged`: its
   * record does not read back, and only this Book's background analysis stops.
   */
  state: 'none' | 'active' | 'paused' | 'suspended' | 'revoked' | 'damaged';
  stateLabel: string;
  statement: string;
  /** The version in force — or the last one, once revoked; `null` before the Book was ever enrolled. */
  enrollment: null | {
    enrollmentId: string;
    enrollmentVersionId: string;
    ordinal: number;
    /** `后台分析登记 · 第 1 版`. */
    name: string;
    startingPoint: BackgroundAnalysisStartingPoint;
    startingPointLabel: string;
    enrolledBy: '本机编辑';
    enrolledAt: string;
    stateRecordedAt: string;
    /** What the version binds, in the words its disclosure listed. */
    binds: ReadonlyArray<{ label: string; value: string }>;
    /** The tokens ceiling set at 登记 for the whole scope; `null` for a version made before a ceiling was required. */
    ceilingTokens: number | null;
    /** This Book's share of it, which each of its background Runs is held to; `null` with the ceiling. */
    shareTokens: number | null;
    /** What the version covers, its Books in order, and where this Book stands among them (1 is the first). */
    scope: { kind: BackgroundAnalysisScopeKind; label: string; books: ReadonlyArray<{ bookId: string; title: string }>; position: number };
  };
  /** The Enrollment's newest states, newest first (at most 10); revoking never shortens it. */
  history: ReadonlyArray<{ state: 'active' | 'paused' | 'suspended' | 'revoked'; stateLabel: string; ordinal: number; recordedAt: string }>;
  historyCount: number;
  /**
   * A Series or all-Books Enrollment's Books the dispatcher's latest look skipped, in the scope's order, each with why: their
   * working text has nothing new to analyse. Empty for a Book scope and before the dispatcher has looked.
   */
  skipped: ReadonlyArray<{ bookId: string; title: string; reason: string }>;
  /** What the Enrollment would do now, and why — `start` only while every condition holds. */
  next: { kind: 'start' | 'none' | 'wait' | 'stopped'; reason: string };
  /** The dispatcher's latest look at the Book in this service's lifetime, and what it found; `null` before its first. */
  lastLook: null | { at: string; kind: 'start' | 'none' | 'wait' | 'stopped'; reason: string };
  /** Why the dispatcher's latest pass that began preparing did not start, until it next starts or the Book is enrolled again. */
  lastNotStarted: null | { at: string; reason: string };
  /** The Runs the Enrollment started on this Book, newest first (at most 10), and how many there are. */
  startedRuns: ReadonlyArray<{ taskIntentId: string; modeLabel: string; enrollmentOrdinal: number | null; authorizedAt: string }>;
  startedRunCount: number;
  /** `登记…`'s disclosure: everything the Enrollment would bind, before the editor chooses where it starts. */
  offer: {
    canEnroll: boolean;
    reason: string | null;
    /** The digest `enrollBackgroundAnalysis` must name; `null` while it cannot be enrolled. */
    disclosureDigest: string | null;
    /** This Book's own scope, in words: what `范围` reads when only the Book is offered. */
    scope: string;
    /** Every scope 登记 may cover, this Book's first, then each Series it is in, then every Book of the house. */
    scopes: ReadonlyArray<BackgroundAnalysisScopeOffer>;
    what: string;
    when: string;
    binds: ReadonlyArray<{ label: string; value: string }>;
    startingPoints: ReadonlyArray<{ value: BackgroundAnalysisStartingPoint; label: string; note: string }>;
    notGranted: ReadonlyArray<string>;
    /** How a Series or all-Books ceiling is shared among its Books, in words. */
    ceilingRule: string;
  };
  /** `暂停` and `续行` of the Enrollment: they hold and release what it would start, and change nothing else. */
  hold: { canPause: boolean; canResume: boolean };
  revoke: { canRevoke: boolean; consequences: ReadonlyArray<string> };
}

export interface DefaultExecutionRulesProjection {
  /** Every rule of every Book, the Book's rules together, active before turned off. */
  rules: ReadonlyArray<DefaultExecutionRuleProjection>;
  /** The page's statement: a rule starts nothing by itself. */
  statement: string;
}

// ---- 知识库 › 审阅规范文件 (Issue #427, plan slice S79a; V2-UX-KB-001 to KB-003, REV-012) ----------------------------

/** The largest guideline file 导入新版本 reads: a Word document or plain text of numbered clauses. */
export const MAX_REVIEW_GUIDELINE_FILE_BYTES = 2 * 1024 * 1024;
/** The Review Runs a guideline version names, the latest first; the page counts the rest (Issue #427 review). */
export const MAX_GUIDELINE_VERSION_RUNS_SHOWN = 5;
/** The Books 还在用旧版 names, by title; the page counts the rest (Issue #427 review). */
export const MAX_GUIDELINE_OLDER_BOOKS_SHOWN = 10;
/** At most this many versions a document's merged Books were reviewed under and this data never had are named; the rest are counted. */
export const MAX_GUIDELINE_MERGED_VERSIONS_SHOWN = 10;

/** The file one imported version was read from: its name as picked, how it was read, and its exact bytes. */
export interface ReviewGuidelineSourceProjection {
  readonly displayName: string;
  readonly format: 'docx' | 'text';
  readonly sha256: string;
  readonly bytes: number;
}

export interface ReviewGuidelineClauseProjection {
  readonly clauseId: string;
  readonly number: number;
  readonly text: string;
  /** How many findings of the Review Runs that applied this version cite this clause, each finding once. */
  readonly citations: number;
}

export interface ReviewGuidelineVersionProjection {
  readonly ordinal: number;
  readonly issuer: string;
  /** `null` for AI7's built-in first version, which is configuration and never stored. */
  readonly versionId: string | null;
  readonly recordedAt: string | null;
  readonly source: ReviewGuidelineSourceProjection | null;
  readonly clauseCount: number;
  readonly digest: string;
  /**
   * How many Review Runs used exactly this version: a category of the Run that applies the document formed its findings
   * under it. A Run only prepared, refused or failed has used nothing yet.
   */
  readonly usedByCount: number;
  /** The latest of those Runs, newest first, at most `MAX_GUIDELINE_VERSION_RUNS_SHOWN`. */
  readonly usedBy: ReadonlyArray<{ readonly bookId: string; readonly bookTitle: string; readonly reviewRunId: string; readonly reviewOrdinal: number; readonly createdAt: string }>;
}

/**
 * How the review categories that apply a guideline document read it (Issue #427 review). `clauses`: the Editorial Review
 * Contract hands its numbered clauses to the model, so the house may import its own next version. `leads`: the category
 * turns the baseline analysis's leads into annotations and reads no clause. `factual-kind`: the category runs AI7's own
 * fixed factual-review contract. The last two are AI7's fixed statements of what the category does, never imported.
 */
export type ReviewGuidelineDocumentUse = 'clauses' | 'leads' | 'factual-kind';

/**
 * A version of a guideline document that Books merged here were reviewed under, and this data never had (Issue #434 review;
 * ADR 0079 §1.5): another house's, or another AI7's wording of one. It is the read-only snapshot those Books' Review Runs hold,
 * as they applied it, and never taken for this data's version of the same number.
 */
export interface ReviewGuidelineMergedVersionProjection {
  readonly ordinal: number;
  readonly issuer: string;
  readonly title: string;
  /** Its numbered clauses, as the Runs applied them. */
  readonly clauses: ReadonlyArray<{ readonly number: number; readonly text: string }>;
  readonly clauseCount: number;
  readonly clausePage: number;
  readonly clausePages: number;
  /** What tells it apart: the digest of the document as the Runs hold it. */
  readonly digest: string;
  readonly usedByCount: number;
  /** The latest of the Runs that used it, newest first, at most `MAX_GUIDELINE_VERSION_RUNS_SHOWN`. */
  readonly usedBy: ReadonlyArray<{ readonly bookId: string; readonly bookTitle: string; readonly reviewRunId: string; readonly reviewOrdinal: number; readonly createdAt: string }>;
}

export interface ReviewGuidelineDocumentProjection {
  readonly documentId: string;
  readonly title: string;
  /** Who issued the version that applies now: `AI7 内置默认`, or `本社` once the house imported its own. */
  readonly issuer: string;
  readonly currentOrdinal: number;
  readonly use: ReviewGuidelineDocumentUse;
  /** The review categories that apply this document. */
  readonly appliedBy: ReadonlyArray<{ readonly categoryId: string; readonly label: string }>;
  /** The clauses of the version that applies now. */
  readonly clauses: ReadonlyArray<ReviewGuidelineClauseProjection>;
  readonly clauseCount: number;
  readonly clausePage: number;
  readonly clausePages: number;
  /** Every version, newest first. */
  readonly versions: ReadonlyArray<ReviewGuidelineVersionProjection>;
  readonly versionCount: number;
  readonly versionsBefore: number | null;
  readonly versionsNext: number | null;
  /** How many Books' latest Review Run that used this document used an older version than the current one. */
  /**
   * The versions merged Books were reviewed under that this data never had, highest number first, at most
   * `MAX_GUIDELINE_MERGED_VERSIONS_SHOWN` (Issue #434 review).
   */
  readonly mergedVersions: ReadonlyArray<ReviewGuidelineMergedVersionProjection>;
  readonly mergedVersionCount: number;
  readonly mergedVersionsBefore: ReviewGuidelineMergedCursor | null;
  readonly mergedVersionsNext: ReviewGuidelineMergedCursor | null;
  /**
   * How many Books' latest Review Run that used this document used an older version than the current one, or a version that
   * came with the Book when it was merged here.
   */
  readonly olderVersionBookCount: number;
  /** Those Books by title, at most `MAX_GUIDELINE_OLDER_BOOKS_SHOWN`; `merged` when the version came with the Book. */
  readonly olderVersionBooks: ReadonlyArray<{ readonly bookId: string; readonly bookTitle: string; readonly ordinal: number; readonly merged: boolean }>;
}

export interface ReviewGuidelinesProjection {
  readonly documents: ReadonlyArray<ReviewGuidelineDocumentProjection>;
}

export interface ReviewGuidelinesPage {
  readonly documentId: string;
  readonly versionsBefore?: number | null;
  readonly clausePage?: number;
  readonly mergedVersionsBefore?: ReviewGuidelineMergedCursor | null;
  readonly mergedClause?: { readonly digest: string; readonly page: number };
}

export interface ReviewGuidelineMergedCursor {
  readonly ordinal: number;
  readonly digest: string;
}

/** 导入新版本 before it is confirmed: the clauses the file holds, as the document's next version would read them. */
export interface ReviewGuidelinePreviewProjection {
  readonly previewId: string;
  readonly documentId: string;
  readonly title: string;
  /** The version the file would become. */
  readonly ordinal: number;
  readonly currentOrdinal: number;
  readonly source: ReviewGuidelineSourceProjection;
  readonly clauses: ReadonlyArray<{ readonly clauseId: string; readonly number: number; readonly text: string }>;
  readonly clauseCount: number;
  readonly clausePage: number;
  readonly clausePages: number;
  /** How the clauses differ from the current version's, by number. */
  readonly changes: { readonly changed: number; readonly added: number; readonly removed: number };
}

// ---- 知识库 › 范例 (Issue #427, plan slice S79b; V2-UX-KB-004, KB-006) --------------------------------------------------

/** The published Books one answer of 范例 carries, by title; `更多已出版的书…` reads the next (Issue #427 review). */
export const MAX_EXEMPLAR_BOOKS_PAGE = 20;
/** The earlier delivered versions an exemplar names, the latest of them; the rest are counted. */
export const MAX_EXEMPLAR_EARLIER_VERSIONS = 10;

/** Where the next page of 范例 starts: after this Book, in title order as 书库 pages. */
export interface ExemplarBookCursor {
  readonly title: string;
  readonly bookId: string;
}

/** 导入以前图书的范例 (Issue #427): the chosen file as it will arrive, read and kept nowhere yet. */
export interface ImportedExemplarPreview {
  readonly previewId: string;
  readonly displayName: string;
  readonly format: 'DOCX' | 'TXT' | 'MD';
  readonly sha256: string;
  readonly bytes: number;
  readonly excerpt: string;
  readonly types: ReadonlyArray<{ readonly typeId: string; readonly label: string }>;
}
export interface ImportedExemplarInput {
  readonly previewId: string;
  readonly bookId: string | null;
  readonly bookTitle: string;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  readonly typeId: string;
  readonly expectedVersion: number;
}
export interface ImportedExemplarDecisionInput {
  readonly revisionId: string;
  readonly revisionDigest: string;
  readonly expectedDecisions: number;
  readonly choice: 'house' | 'excluded' | 'deferred';
}

/** One exemplar: the version of one delivered document of a published Book that stands in 范例. */
export interface ExemplarProjection {
  readonly documentId: string;
  readonly typeId: string;
  readonly typeLabel: string;
  /** The document version its latest Delivery Record named. */
  readonly version: number;
  readonly revisionId: string;
  readonly revisionDigest: string;
  readonly deliveredTo: string;
  readonly deliveredAt: string;
  /**
   * When it came into 范例: its delivery, made while a 发稿版本 stood in AI7; or, for one delivered before the first
   * designation or after a 撤回, the next designation.
   */
  readonly archivedAt: string;
  /** How many other versions of the document came into 范例 before this one. */
  readonly earlierVersionCount: number;
  /** The latest of them, oldest first, at most `MAX_EXEMPLAR_EARLIER_VERSIONS`. */
  readonly earlierVersions: ReadonlyArray<number>;
  /** The Learning Eligibility it came in with: `仅本社`, the default, asked of no one. */
  readonly eligibility: 'house-only' | 'excluded' | 'deferred';
  readonly imported?: { readonly decisions: number; readonly sourceName: string };
}

/** A published Book in 范例: who it is attributed to, its latest 发稿版本, and its exemplars by document type. */
export interface ExemplarBookProjection {
  readonly imported?: true;
  readonly bookId: string;
  readonly bookTitle: string;
  /** As the Book's 人员 read now. */
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  /** Its latest designation: which one, and when. */
  readonly publicationOrdinal: number;
  readonly designatedAt: string;
  /**
   * Whether a 撤回 holds that designation (ADR 0040): in AI7 it is no longer used for 发稿, so what the Book delivers
   * after it comes in only once another 发稿版本 is set. What came in before stays.
   */
  readonly withdrawn: boolean;
  readonly exemplars: ReadonlyArray<ExemplarProjection>;
  /**
   * The (imported) 范例 of this Book whose records no longer read, each named by Book and document type as 写作任务 names them
   * (Issue #799, #800): they are skipped while the rest of the Book stays listed. Absent when nothing was skipped.
   */
  readonly skipped?: ReadonlyArray<string>;
  /** The Book's 审稿意见 as 范例 offers them (Issue #429; KB-006): one per template with a draft, the version 图书交付包 pins. */
  readonly readersReports: ReadonlyArray<ReadersReportExemplarProjection>;
}

/**
 * One 审稿意见 of a Book with a 发稿版本 (Issue #429, S81c remainder; KB-006): the version pinned exactly as 图书交付包 pins it —
 * the latest saved when the 发稿版本 was designated, or, for a draft that came after it, the latest saved now — offered into
 * 范例 under 仅本社, and admitted only by the editor (`admitReadersReportExemplar`).
 */
export interface ReadersReportExemplarProjection {
  readonly template: ReadersReportTemplate;
  readonly typeId: string;
  readonly typeLabel: string;
  readonly documentId: string;
  readonly version: number;
  readonly revisionId: string;
  readonly revisionDigest: string;
  readonly savedAt: string;
  /** `designation`: the latest version saved by the designation; `later`: the draft came after it, so its latest version. */
  readonly pin: 'designation' | 'later';
  readonly eligibility: 'house-only';
  /**
   * Where the editor's admission stands: `offered` while none was made, `admitted` when this exact version was, `superseded`
   * when an earlier version of this 审稿意见 was admitted and this one is offered anew. `decisions` counts the admissions made.
   */
  readonly admission: { readonly state: 'offered' | 'admitted' | 'superseded'; readonly admittedAt: string | null; readonly decisions: number };
}

/** 归入范例 of one 审稿意见 (Issue #429): the Book, the template, the exact version seen, and how many admissions the editor saw. */
export interface AdmitReadersReportExemplarInput {
  readonly bookId: string;
  readonly template: ReadersReportTemplate;
  readonly revisionDigest: string;
  readonly expectedDecisions: number;
}

export interface ExemplarsProjection {
  readonly books: ReadonlyArray<ExemplarBookProjection>;
  /** Where the next page starts; `null` when this is the last. */
  readonly nextCursor: ExemplarBookCursor | null;
}

// ---- 知识库 › 工序与规则's expert 工序 (Issue #427, plan slice S79d; V2-UX-KB-010, REUSE-029, REUSE-030) ---------------

/**
 * A native artifact AI7 carries, in the house's words (editor-surfaces §10; REUSE-030): the 编辑工作区方案 with its AI7 权限侧车
 * reads 本社方案 vN, in its lifecycle as the Book card reads it. Its identities are the Technical Identity Layer's (ADR 0071
 * §1, LAYER-001), for 查看技术详情 only.
 */
export interface KnowledgeArtifactProjection {
  /** The house's word for it: 本社方案. */
  readonly title: string;
  /** The newest AI7 权限侧车 revision the installed 方案 offers — the N of 本社方案 vN; `null` before it is installed. */
  readonly revision: number | null;
  readonly state: 'available-to-install' | 'installed' | 'unavailable-needs-attention';
  readonly enabledBooks: number;
  readonly technical: {
    readonly artifactId: string;
    readonly version: string;
    readonly sha256: string;
    readonly sidecarId: string;
    readonly sidecarSha256: string | null;
  };
}

export interface KnowledgeProceduresProjection {
  /** The pre-installed procedure library (Issue #1081, F-26a; ADR 0095 §1), in the configuration's order, baseline last. */
  readonly preinstalled: ReadonlyArray<PreinstalledProcedureProjection>;
  readonly artifacts: ReadonlyArray<KnowledgeArtifactProjection>;
}

// ADR 0045 / ADR 0090: foreign Skills are retained as inert, inspectable documents, never executors.
export type ImportedSkillState = 'pending-validation' | 'validated' | 'restricted' | 'rejected' | 'installed-disabled' | 'enabled';
export interface ImportedSkillFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly base64: string;
}
export interface SkillConversionReport {
  readonly preserved: readonly string[];
  readonly mapped: readonly string[];
  readonly reviewRequired: readonly string[];
  readonly unsupported: readonly string[];
}
export interface ImportedSkillCeiling {
  readonly requestedCapabilities: readonly string[];
  readonly executor: false;
  readonly runSourceScope: 'none';
  readonly provider: false;
  readonly effect: false;
  readonly credentials: false;
  readonly network: false;
  readonly backgroundAnalysis: false;
  readonly apply: false;
}
export interface ImportedSkillSummary {
  readonly skillId: string;
  readonly revisionId: string;
  readonly ordinal: number;
  readonly name: string;
  readonly sourceRevision: string;
  readonly kind: 'DSH Skill';
  readonly state: ImportedSkillState;
  readonly stateLabel: string;
}
export type ImportedSkillSelectionReason = 'import' | 'adopt' | 'rule' | 'rollback';
export interface ImportedSkillRevisionProjection extends ImportedSkillSummary {
  readonly snapshotId: string;
  readonly previousRevisionId: string | null;
  readonly sourcePath: string;
  readonly snapshotSha256: string;
  readonly workingSha256: string;
  readonly files: readonly ImportedSkillFile[];
  readonly workingFiles: readonly ImportedSkillFile[];
  readonly license: string | null;
  readonly notices: readonly string[];
  readonly conversion: SkillConversionReport;
  readonly reasons: readonly string[];
  readonly enabledBooks: readonly string[];
  readonly ceiling: ImportedSkillCeiling;
  /** Exact revision + conversion + ceiling + state, shown before separate explicit installation/enablement. */
  readonly previewDigest: string;
  readonly createdAt: string;
}
/** One revision in a Skill's history: newest first, the current one marked, and how each came about. */
export interface ImportedSkillHistoryEntry {
  readonly revisionId: string;
  readonly ordinal: number;
  readonly state: ImportedSkillState;
  readonly stateLabel: string;
  readonly sourceRevision: string;
  readonly previousRevisionId: string | null;
  readonly createdAt: string;
  readonly current: boolean;
  readonly origin: 'import' | 'adopt' | 'rule';
  /** Why the current revision is current; `null` on every other entry. */
  readonly selectedReason: ImportedSkillSelectionReason | null;
}
export type ImportedSkillUpdateDisposition = 'clean' | 'conflict' | 'validator-failed' | 'authority-change';
export type ImportedSkillUpdateFileChange = 'unchanged' | 'upstream' | 'local' | 'conflict';
export interface ImportedSkillUpdateFileReport {
  readonly path: string;
  readonly change: ImportedSkillUpdateFileChange;
  readonly priorSha256: string | null;
  readonly workingSha256: string | null;
  readonly incomingSha256: string | null;
}
/** One update candidate in the Skill's list: inert until the editor adopts it, or the rule does a clean one (REUSE-032, REUSE-034). */
export interface ImportedSkillUpdateCandidateSummary {
  readonly candidateId: string;
  readonly skillId: string;
  readonly disposition: ImportedSkillUpdateDisposition;
  readonly status: 'open' | 'adopted' | 'dismissed';
  /** An open candidate whose base is no longer the Skill's current revision cannot be adopted; the update is checked again. */
  readonly stale: boolean;
  readonly adoptedBy: 'editor' | 'rule' | null;
  readonly adoptedRevisionId: string | null;
  readonly incomingName: string;
  readonly incomingSourceRevision: string;
  readonly createdAt: string;
}
/** The three-way reconciliation behind a candidate: the prior Source Skill Snapshot, the working revision and the incoming snapshot. */
export interface ImportedSkillUpdateCandidateProjection extends ImportedSkillUpdateCandidateSummary {
  readonly prior: { readonly snapshotId: string; readonly sha256: string; readonly sourceRevision: string };
  readonly working: { readonly revisionId: string; readonly ordinal: number; readonly sha256: string };
  readonly incoming: { readonly snapshotId: string; readonly sha256: string; readonly sourcePath: string };
  readonly files: readonly ImportedSkillUpdateFileReport[];
  readonly validator: { readonly state: 'validated' | 'restricted' | 'rejected'; readonly reasons: readonly string[] };
  readonly authorityChanges: readonly string[];
  readonly conflicts: readonly string[];
  /** Every item an explicit adoption of a candidate that is not clean names: validator reasons, authority changes and conflicting files. */
  readonly acceptItems: readonly string[];
  readonly reviewDigest: string;
}
export interface ImportedSkillUpdateRuleProjection {
  readonly active: boolean;
  readonly ruleId: string | null;
  /** The sentence the editor confirms to create the rule. */
  readonly confirmation: string;
  readonly since: string | null;
  readonly history: ReadonlyArray<{ readonly action: 'create' | 'revoke'; readonly recordedAt: string }>;
}
export interface ImportedSkillsProjection {
  readonly skills: readonly ImportedSkillSummary[];
  readonly nextBefore: string | null;
  readonly revision: ImportedSkillRevisionProjection | null;
  /** Of the Skill `revision` belongs to (empty/`null` when none is selected): its revisions, update candidates and update rule. */
  readonly history: readonly ImportedSkillHistoryEntry[];
  readonly candidates: readonly ImportedSkillUpdateCandidateSummary[];
  readonly rule: ImportedSkillUpdateRuleProjection | null;
}
/**
 * What acquisition discloses before anything is kept (ADR 0090 §2; REUSE-021): exact identity, kind, source revision, provenance,
 * license and notices, content digest and the conversion it would keep. Nothing of it is written until the editor keeps it.
 */
export interface ImportedSkillAcquisitionProjection {
  /** The disclosed package, held in the service's memory only until it is kept or dropped. */
  readonly acquisitionId: string;
  readonly name: string;
  readonly sourceRevision: string;
  readonly kind: 'DSH Skill';
  readonly sourcePath: string;
  readonly contentSha256: string;
  readonly license: string | null;
  readonly notices: readonly string[];
  readonly files: readonly Omit<ImportedSkillFile, 'base64'>[];
  readonly conversion: SkillConversionReport;
  readonly ceiling: ImportedSkillCeiling;
  readonly problems: readonly string[];
  /** A package without a SKILL.md is not a Skill: it is disclosed and never kept. */
  readonly keepable: boolean;
  /** The working revision already holding exactly this content, when it was kept before: keeping it again adds nothing. */
  readonly keptRevisionId: string | null;
}
/** 导入 Skill…: the disclosure, and the kept working revision once the editor keeps it (`null` until then). */
export interface ImportedSkillImportProjection {
  readonly acquisition: ImportedSkillAcquisitionProjection;
  readonly revision: ImportedSkillRevisionProjection | null;
}
/**
 * 检查更新（从文件）…: the disclosure of one local package for a Skill already kept, and — once the editor keeps it — the inert
 * candidate it became. The package is the same kind 导入 Skill… takes; nothing is read from any Book and nothing is fetched.
 */
export interface ImportedSkillUpdateCheckProjection {
  readonly skillId: string;
  readonly acquisition: ImportedSkillAcquisitionProjection;
  /** Newer than what the Skill is on, the very version it was kept from, or one already in its history (which 回到此版本 returns to). */
  readonly relation: 'newer' | 'same-as-current' | 'already-kept';
  readonly candidate: ImportedSkillUpdateCandidateProjection | null;
}
export interface ProcedureRecommendationInput {
  readonly bookId: string;
  readonly goal: string;
  readonly taskKind: 'review-run' | 'baseline-analysis' | 'writing' | 'unclassified';
  readonly scope: CapturedProcedureScopeSlot;
  readonly categoryIds: readonly string[];
}
export interface ProcedureRecommendationCandidate {
  readonly procedureId: string;
  readonly versionId: string;
  readonly version: number;
  readonly documentSha256: string;
  readonly purpose: string;
  readonly kind: '可复用工序' | '预装工序' | '本社工序';
  readonly fit: 'all' | 'partial';
  readonly rationale: readonly string[];
  readonly requiredInputs: readonly string[];
  readonly expectedOutcome: string;
  readonly proposalClasses: readonly string[];
  readonly effectClasses: readonly string[];
}
export interface ProcedureRecommendationProjection {
  readonly intentDigest: string;
  readonly status: 'clear' | 'ambiguous' | 'none';
  readonly candidates: readonly ProcedureRecommendationCandidate[];
  readonly selectedVersionId: null;
  readonly note: string;
  readonly excludedSkillReason: string;
}

// ---- 可复用工序 (Issue #65, plan slice S30; ADR 0087; V2-UX-REUSE-001 to 020, 029 to 031, 038 to 054, 063 to 066, KB-010) --

/** The one schema a Captured Procedure version's document is written in (ADR 0087 §1). */
export const CAPTURED_PROCEDURE_SCHEMA = 'ai7.captured-procedure/1' as const;
/** ADR 0090: additive successor; existing /1 documents and their exact digests never move. */
export const CAPTURED_PROCEDURE_SCHEMA_V2 = 'ai7.captured-procedure/2' as const;
/**
 * The one parameter slot a Captured Procedure carries: the review scope kind. The chapters are chosen at each run. `selection`
 * (Issue #423, S77 deferred item a) is the scope a Run pins when the house's procedure runs on the paragraphs 就这段发起任务… handed
 * over, and the scope a selection menu asks the house's procedures to be resolved for: it lives on the pin and that read only. A
 * document names a capture slot — 全书 or 选定章节 (`CAPTURED_PROCEDURE_CAPTURE_SLOTS`) — and never `selection`, so no existing
 * document or digest moves and none can be made that promises a scope 新建审阅 cannot supply.
 */
export type CapturedProcedureScopeSlot = 'whole' | 'chapters' | 'selection';
export const CAPTURED_PROCEDURE_SCOPE_SLOTS: readonly CapturedProcedureScopeSlot[] = ['whole', 'chapters', 'selection'];
/** The slots a document may carry and a capture may set: a selection is handed over at each run from the manuscript, never saved. */
export const CAPTURED_PROCEDURE_CAPTURE_SLOTS: readonly CapturedProcedureScopeSlot[] = ['whole', 'chapters'];
export const CAPTURED_PROCEDURE_SCOPE_LABELS = {
  whole: '全书',
  chapters: '选定章节',
  selection: '所选段落',
} as const satisfies Record<CapturedProcedureScopeSlot, string>;
/** The editor's title of a Captured Procedure: a label, never given to a model — in graphemes, and in UTF-16 code units. */
export const MAX_CAPTURED_PROCEDURE_TITLE_GRAPHEMES = 60;
export const MAX_CAPTURED_PROCEDURE_TITLE_CHARACTERS = 240;
/**
 * What one answer of 工序与规则 carries (Issue #65 review): the newest procedures and proposals as summaries; one procedure's or
 * proposal's versions a page at a time, newest first, each page also held to a byte budget so it always fits one frame; each
 * version naming its newest Runs or files and how many there are.
 */
export const MAX_CAPTURED_PROCEDURES_SHOWN = 50;
export const MAX_CAPTURED_PROCEDURE_VERSIONS_PAGE = 5;
export const MAX_DEVELOPER_PROPOSAL_VERSIONS_PAGE = 3;
export const MAX_CAPTURED_PROCEDURE_RUNS_SHOWN = 10;
/** The 图书交付包 versions one version row links, newest first (Issue #66, S31b; REUSE-031). */
export const MAX_CAPTURED_PROCEDURE_PACKAGES_SHOWN = 10;
export const MAX_DEVELOPER_PROPOSAL_FILES_SHOWN = 10;

/** A version's state (KB-010): 待验证 until `验证并启用…` succeeds, 已启用 after, 已停用 for good once stopped (ADR 0087 §3, §5). */
export type CapturedProcedureState = 'pending-validation' | 'enabled' | 'stopped';
export const CAPTURED_PROCEDURE_STATE_LABELS = {
  'pending-validation': '待验证',
  enabled: '已启用',
  stopped: '已停用',
} as const satisfies Record<CapturedProcedureState, string>;

/** One step of a Captured Procedure: a review category AI7 already executes, at the 工序 version the source Run used. */
export interface CapturedProcedureStepDocument {
  readonly categoryId: string;
  readonly procedure: { readonly procedureId: string; readonly version: string };
  readonly output: ReviewCategoryOutputKind;
  readonly model: boolean;
  readonly searchEngine: boolean;
}

/**
 * One Captured Procedure version's document, exactly its keys (ADR 0087 §1): the editor's title, `runAs`, the ordered steps,
 * the scope slot and the Authority Ceiling. It names no Book, chapter, Series, manuscript text, finding, decision,
 * authorization, receipt, plan digest, Provider, route or model, and no guideline clause or version.
 */
export interface CapturedProcedureDocument {
  readonly schema: typeof CAPTURED_PROCEDURE_SCHEMA | typeof CAPTURED_PROCEDURE_SCHEMA_V2;
  readonly title: string;
  readonly runAs: 'review-run';
  readonly steps: ReadonlyArray<CapturedProcedureStepDocument>;
  readonly parameters: { readonly scope: CapturedProcedureScopeSlot };
  /**
   * The most a Run prepared from it may do (ADR 0087 §4): its steps with their executors, the output kinds, whether any step
   * calls a model or a search engine, and the current-Book Run Source Scope.
   */
  readonly authorityCeiling: {
    readonly runSourceScope: 'current-book' | 'series';
    readonly steps: ReadonlyArray<{ readonly categoryId: string; readonly executor: string }>;
    readonly outputs: ReadonlyArray<ReviewCategoryOutputKind>;
    readonly model: boolean;
    readonly searchEngine: boolean;
  };
}

/** One category of a finished Review Run as the capture's source set offers it (REUSE-011, REUSE-012, REUSE-019). */
export interface ProcedureCaptureStepProjection {
  readonly categoryId: string;
  readonly label: string;
  readonly procedureTitle: string;
  readonly procedureVersion: string;
  readonly output: ReviewCategoryOutputKind;
  readonly model: boolean;
  readonly searchEngine: boolean;
  /** Whether the step may be kept: the source Run settled it, and its 工序 is still the current, available one. */
  readonly eligible: boolean;
  /** Why it is left out when it may not be kept; `null` when it may. */
  readonly excludedReason: string | null;
}

/** The kinds a capture could create; in this version only a Captured Procedure or a Developer Capability Proposal is open. */
export type ProcedureCaptureResultKind = 'captured-procedure' | 'developer-proposal' | 'skill-draft' | 'workflow-draft' | 'default-rule';

/**
 * `将以上工序保存为可复用工序` on one finished Review Run (ADR 0087 §2): its source set, what extraction would keep, and the
 * deterministic classification. A read: nothing is created.
 */
export interface ProcedureCaptureProjection {
  readonly bookId: string;
  readonly reviewRunId: string;
  readonly runLabel: string;
  readonly available: boolean;
  readonly unavailableReason: string | null;
  /** Every category of the source Run, in the configuration's order, which a Captured Procedure keeps. */
  readonly steps: ReadonlyArray<ProcedureCaptureStepProjection>;
  /** The scope slot the source Run suggests: 全书 for a whole-book review, otherwise 选定章节. */
  readonly scopeSlot: CapturedProcedureScopeSlot;
  readonly sourceScopeLabel: string;
  /** The deterministic, provider-free classification (REUSE-002 to REUSE-009): the recommended type, and the others with why. */
  readonly classification: {
    readonly recommended: 'captured-procedure';
    readonly alternatives: ReadonlyArray<{ readonly kind: Exclude<ProcedureCaptureResultKind, 'captured-procedure'>; readonly available: boolean }>;
  };
  /** The Captured Procedures a capture may add its next version to, newest first, by their latest title. */
  readonly procedures: ReadonlyArray<{ readonly procedureId: string; readonly title: string; readonly latestVersion: number }>;
}

/**
 * What a Book must have for one step to run there (Issue #66, plan slice S31b; REUSE-048's declared abstract requirements):
 * `series` — the Book is in a Series, and its Series material is chosen apart at each run (REUSE-050); `baseline-analysis` —
 * the Book has a baseline analysis whose leads the step turns into 批注. A step with neither runs on any Book with a manuscript.
 */
export type CapturedProcedureStepRequirement = 'series' | 'baseline-analysis';

/** One step of a saved version, in the editor's words and with the facts the document holds. */
export interface CapturedProcedureStepProjection {
  readonly categoryId: string;
  readonly label: string;
  readonly procedureTitle: string;
  readonly procedureVersion: string;
  readonly output: ReviewCategoryOutputKind;
  readonly model: boolean;
  readonly searchEngine: boolean;
  /** What a Book must have for this step to run there, from the executor the document names (S31b); `null` for none. */
  readonly requirement: CapturedProcedureStepRequirement | null;
}

/**
 * A 图书交付包 version that holds the report of a Review Run pinned to one Captured Procedure version (Issue #66, S31b;
 * REUSE-031): an exact link through the Run, never a copy of what the package holds.
 */
export interface CapturedProcedurePackageLinkProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly packageVersionId: string;
  readonly version: number;
  readonly preparedAt: string;
}

/** A Review Run that pinned one version (REUSE-031): an exact link, never a copy of what it found. */
export interface CapturedProcedureRunLinkProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly reviewRunId: string;
  readonly label: string;
  readonly createdAt: string;
  /** Where the Run stands now, in the Review Run's own words (Issue #66, S31): 已完成, 计划已冻结 · 待授权 … */
  readonly stateLabel: string;
}

export interface CapturedProcedureVersionProjection {
  readonly versionId: string;
  readonly procedureId: string;
  readonly version: number;
  readonly title: string;
  readonly state: CapturedProcedureState;
  readonly stateLabel: string;
  readonly createdAt: string;
  /** When it was enabled or stopped; `null` while it waits for validation. */
  readonly stateRecordedAt: string | null;
  readonly steps: ReadonlyArray<CapturedProcedureStepProjection>;
  readonly scopeSlot: CapturedProcedureScopeSlot;
  /** Why the last `验证并启用…` failed, while the version still waits; empty otherwise (REUSE-025). */
  readonly validationProblems: ReadonlyArray<string>;
  /** The local provenance outside the digest (REUSE-015): the Review Run it was captured from. */
  readonly source: { readonly bookId: string; readonly bookTitle: string; readonly reviewRunId: string; readonly runLabel: string };
  /** The Review Runs approved under it — ran, or began to (Issue #66, S31 review P3-3). */
  readonly runCount: number;
  /** The Review Runs prepared from it and never approved; each is linked with its state like the others. */
  readonly preparedRunCount: number;
  readonly runs: ReadonlyArray<CapturedProcedureRunLinkProjection>;
  /**
   * The 图书交付包 versions that hold a report of a Review Run pinned to it, newest first, at most
   * `MAX_CAPTURED_PROCEDURE_PACKAGES_SHOWN` (Issue #66, S31b; REUSE-031); `packageCount` counts them all. The service reads
   * exactly the newest `min(packageCount, MAX_CAPTURED_PROCEDURE_PACKAGES_SHOWN)` rows and lists those whose digests hold, and
   * the renderer derives how many of the read rows could not be read as that minimum less `packages.length` (Issue #697; #705
   * item 5): a service that reads fewer or pages the links changes this contract, not only its own call.
   */
  readonly packages: ReadonlyArray<CapturedProcedurePackageLinkProjection>;
  readonly packageCount: number;
  readonly technical: { readonly documentSha256: string; readonly previousDocumentSha256: string | null };
}

/** A Captured Procedure as 工序与规则's list names it: its newest title and state, how many versions it has, whether it runs. */
export interface CapturedProcedureSummaryProjection {
  readonly procedureId: string;
  /** Its newest version's title. */
  readonly title: string;
  readonly versionCount: number;
  readonly latestVersion: number;
  readonly latestState: CapturedProcedureState;
  readonly latestStateLabel: string;
  /** Whether `运行此工序…` is offered: one of its versions is 已启用. */
  readonly runnable: boolean;
}

/** One Captured Procedure with one page of its versions, newest first; `versionsBefore` reads the next older page. */
export interface CapturedProcedureProjection extends CapturedProcedureSummaryProjection {
  /**
   * The version a new use resolves to now — the newest 已启用 one that still validates (Issue #66, S31; REUSE-043, REUSE-044) —
   * marked 最新可用 on its row; `null` when none is.
   */
  readonly latestEligibleVersionId: string | null;
  readonly versions: ReadonlyArray<CapturedProcedureVersionProjection>;
  /** The version number the next older page starts below; `null` when this page reaches version 1. */
  readonly versionsBefore: number | null;
}

/** One version of a Developer Capability Proposal (REUSE-063, REUSE-064): no Book material, sent nowhere. */
export interface DeveloperProposalVersionProjection {
  readonly proposalVersionId: string;
  readonly proposalId: string;
  readonly version: number;
  readonly title: string;
  readonly missingCapability: string;
  readonly affectedProcedure: string;
  readonly direction: string;
  readonly pluginCandidate: string;
  readonly createdAt: string;
  /** The newest files it was written to through the Save dialog, at most `MAX_DEVELOPER_PROPOSAL_FILES_SHOWN`: the name only, never where. */
  readonly files: ReadonlyArray<{ readonly fileName: string; readonly writtenAt: string }>;
  readonly fileCount: number;
  readonly technical: { readonly sha256: string };
}

export interface DeveloperProposalSummaryProjection {
  readonly proposalId: string;
  /** Its newest version's title. */
  readonly title: string;
  readonly versionCount: number;
  readonly latestVersion: number;
  readonly latestCreatedAt: string;
}

/** One proposal with one page of its versions, newest first; `versionsBefore` reads the next older page. */
export interface DeveloperProposalProjection extends DeveloperProposalSummaryProjection {
  readonly versions: ReadonlyArray<DeveloperProposalVersionProjection>;
  readonly versionsBefore: number | null;
}

/**
 * 知识库 › 工序与规则's 可复用工序 and 开发建议, apart from the built-in 工序 (ADR 0087 §5, REUSE-029, REUSE-030): summaries only,
 * so the list always fits one frame; each one's versions are read a page at a time.
 */
export interface CapturedProceduresProjection {
  readonly procedures: ReadonlyArray<CapturedProcedureSummaryProjection>;
  readonly proceduresTruncated: boolean;
  readonly proposals: ReadonlyArray<DeveloperProposalSummaryProjection>;
  readonly proposalsTruncated: boolean;
}

/** A guideline document one step applies, today against the source Run (ADR 0087 §3): a run applies today's. */
export interface CapturedProcedureGuidelineProjection {
  readonly title: string;
  readonly issuer: string;
  readonly version: string;
  /** The version the source Run applied; `null` when it applied none of this document. */
  readonly sourceVersion: string | null;
}

export interface CapturedProcedureCheckStepProjection extends CapturedProcedureStepProjection {
  readonly guidelines: ReadonlyArray<CapturedProcedureGuidelineProjection>;
  /** Why this step no longer resolves; `null` when it does. */
  readonly problem: string | null;
}

/**
 * `验证并启用…`'s preview (ADR 0087 §3): deterministic and provider-free. It creates no Task, Plan, Run, Provider call or
 * Session; `enableCapturedProcedure` confirms exactly this preview by its digest.
 */
export interface CapturedProcedureValidationProjection {
  readonly versionId: string;
  readonly procedureId: string;
  readonly version: number;
  readonly title: string;
  readonly state: CapturedProcedureState;
  readonly steps: ReadonlyArray<CapturedProcedureCheckStepProjection>;
  readonly scopeSlot: CapturedProcedureScopeSlot;
  readonly ceiling: CapturedProcedureDocument['authorityCeiling'];
  readonly problems: ReadonlyArray<string>;
  readonly passes: boolean;
  readonly previewDigest: string;
}

/** A step of the resolved version as the current Book can take it, or why it is left out (ADR 0087 §4). */
export interface CapturedProcedureRunStepProjection {
  readonly categoryId: string;
  readonly label: string;
  readonly available: boolean;
  readonly unavailableReason: string | null;
  /**
   * The step reads Series material (Issue #66, S31b; REUSE-049, REUSE-050): the sheet never ticks it for the editor, who
   * chooses it at each run; left unticked, the Run records it as left out by choice.
   */
  readonly chosenApart: boolean;
}

/**
 * `运行此工序…` or `按已保存的工序` for the current Book (ADR 0087 §4; UI ADR 0013, REUSE-043 to REUSE-045, REUSE-054): the newest
 * 已启用 version that still validates, its steps for this Book, and where today's guideline versions differ from the source
 * Run's. A read: it prepares nothing.
 */
export interface CapturedProcedureRunProjection {
  readonly bookId: string;
  readonly procedureId: string;
  readonly title: string;
  readonly resolved: null | {
    readonly runSourceScope?: 'series';
    readonly versionId: string;
    readonly version: number;
    /** Whether it is the latest eligible version — `false` when the editor chose an older eligible one (REUSE-054). */
    readonly latestEligible: boolean;
    readonly documentSha256: string;
    readonly scopeSlot: CapturedProcedureScopeSlot;
    readonly steps: ReadonlyArray<CapturedProcedureRunStepProjection>;
    readonly guidelineChanges: ReadonlyArray<{ readonly categoryId: string; readonly label: string; readonly title: string; readonly sourceVersion: string | null; readonly version: string }>;
  };
  /**
   * Every version newer than the latest eligible one, passed over with why — stopped, still waiting for validation, or no longer
   * validating (REUSE-043, REUSE-044: disclosed, never silent; Issue #66, S31).
   */
  readonly passedOver: ReadonlyArray<{ readonly version: number; readonly reason: string }>;
  /**
   * The versions the editor may choose instead, newest first: each 已启用 and still validating (Issue #66, S31; REUSE-054's manual
   * selector). The first is the latest eligible, which a new use takes unless the editor chooses another.
   */
  readonly eligibleVersions: ReadonlyArray<{ readonly versionId: string; readonly version: number }>;
  /** Why it cannot run now; `null` when `resolved` is set. */
  readonly unavailableReason: string | null;
}

/** A Review Run one version's 停用 touches (Issue #66, S31; REUSE-038, REUSE-041): an exact link and where it stands. */
export interface CapturedProcedureStopRunProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly reviewRunId: string;
  readonly label: string;
  readonly stateLabel: string;
}

/** One version as `停用…`'s preview names it. */
export interface CapturedProcedureStopVersionProjection {
  readonly versionId: string;
  readonly version: number;
  readonly stateLabel: string;
  /** The Review Runs approved under it — ran, or began to: each keeps naming it after the 停用 (REUSE-040). */
  readonly runCount: number;
  /** Prepared from it and not yet approved, still the newest of their Book: they cannot be approved after it and are prepared again. */
  readonly prepared: ReadonlyArray<CapturedProcedureStopRunProjection>;
  readonly preparedCount: number;
  /** Approved and not yet finished: they go on under the version they were approved with; the 停用 does not move them. */
  readonly active: ReadonlyArray<CapturedProcedureStopRunProjection>;
  readonly activeCount: number;
}

/**
 * `停用…`'s preview (Issue #66, S31): the Version Removal Preview (REUSE-038, REUSE-040, REUSE-041) for a 停用, which removes
 * nothing (ADR 0087 §5). It names the Runs it touches, what a new use resolves to afterwards, and what stays; `stopCapturedProcedure`
 * confirms exactly this preview by its digest. A read.
 */
export interface CapturedProcedureStopPreviewProjection {
  readonly procedureId: string;
  readonly title: string;
  /** `null` for 全部停用. */
  readonly versionId: string | null;
  /** The newest versions it takes, as many as one frame holds (S31 review P2-2); `versionCount` counts them all. */
  readonly versions: ReadonlyArray<CapturedProcedureStopVersionProjection>;
  readonly versionCount: number;
  /** The version a new use resolves to afterwards; `null` when none will be runnable. */
  readonly afterVersion: number | null;
  readonly previewDigest: string;
}

/** The pin a Review Run prepared from a Captured Procedure records (ADR 0087 §4): never moved by a later version or a 停用. */
export interface ReviewRunProcedureProjection {
  readonly procedureId: string;
  readonly versionId: string;
  readonly version: number;
  readonly title: string;
  readonly documentSha256: string;
  /** The version was stopped since: a Run not yet authorized cannot be (ADR 0087 §5). */
  readonly stopped: boolean;
  /**
   * This house has no such version — the Book was merged in from another (Issue #65 review): the Run keeps naming what it was
   * prepared from, and one not yet authorized cannot be, as with a stopped version.
   */
  readonly missing: boolean;
  /** The steps the Run left out, with why; `byChoice` for a step the Book could take that the editor did not choose (S31b). */
  readonly leftOut: ReadonlyArray<{ readonly categoryId: string; readonly label: string; readonly reason: string; readonly byChoice: boolean }>;
}

/** How much of one procedure's latest eligible version one Book can take now (Issue #66, S31b). */
export type CapturedProcedureFit = 'all' | 'partial' | 'none' | 'no-version';

/**
 * One enabled Captured Procedure as it applies to one Book (Issue #66, plan slice S31b; REUSE-046, REUSE-053, REUSE-054): the
 * one version a new use takes — the latest eligible — and how many of its steps this Book can take now, with why each other is
 * left out. Deterministic and provider-free. It names no procedure as a recommendation (ADR 0087 §4): every enabled procedure
 * stays open to manual selection, and a mismatch is said, never a prohibition.
 */
export interface CapturedProcedureApplicabilityEntryProjection {
  readonly procedureId: string;
  readonly title: string;
  /** The version a new use takes now; `null` when none of its enabled versions still validates. */
  readonly latestEligible: null | { readonly versionId: string; readonly version: number };
  readonly fit: CapturedProcedureFit;
  readonly stepCount: number;
  /** Steps this Book can take now, the Series steps the editor chooses apart among them. */
  readonly availableCount: number;
  /** The labels of the steps this Book can take that the editor chooses apart at each run (REUSE-050). */
  readonly chosenApart: ReadonlyArray<string>;
  /** The same steps by category and label (Issue #423, S77 deferred item a): the selection composer's boxes carry the category. */
  readonly chosenApartSteps: ReadonlyArray<{ readonly categoryId: string; readonly label: string }>;
  /** The steps this Book cannot take now, with why. */
  readonly leftOut: ReadonlyArray<{ readonly label: string; readonly reason: string }>;
}

/** 按已保存的工序 on one Book's 新建审阅 (Issue #66, S31b): the house's enabled Captured Procedures, as each applies to it. */
export interface CapturedProcedureApplicabilityProjection {
  readonly bookId: string;
  readonly procedures: ReadonlyArray<CapturedProcedureApplicabilityEntryProjection>;
  readonly truncated: boolean;
}

export const MAX_DEVELOPER_PROPOSAL_TITLE_GRAPHEMES = 60;
/** Each field of a 开发建议, in graphemes and in UTF-16 code units: a page of versions then always fits one frame. */
export const MAX_DEVELOPER_PROPOSAL_FIELD_GRAPHEMES = 2000;
export const MAX_DEVELOPER_PROPOSAL_FIELD_CHARACTERS = 4000;

export interface SaveCapturedProcedureInput {
  bookId: string;
  reviewRunId: string;
  /** The steps kept, each a category the source Run settled; their order is the configuration's (ADR 0087 §2). */
  categoryIds: ReadonlyArray<string>;
  scopeSlot: CapturedProcedureScopeSlot;
  title: string;
  /** The Captured Procedure this capture is the next version of; `null` for a new one. */
  procedureId: string | null;
}

export interface SaveDeveloperProposalInput {
  /** The proposal this is the next version of; `null` for a new one. */
  proposalId: string | null;
  title: string;
  missingCapability: string;
  affectedProcedure: string;
  direction: string;
  pluginCandidate: string;
}

export type SaveDeveloperProposalFileOutcome =
  | { readonly outcome: 'cancelled' }
  | { readonly outcome: 'saved'; readonly fileName: string; readonly proposal: DeveloperProposalProjection };

// ---- 知识库 › 资料库 (Issue #427, plan slice S79c; V2-UX-KB-007, KB-002, ATTN-009, LEARN-004 to LEARN-010) --------------

/** The largest file 资料库 takes in, and the bounds of what the editor writes about one. */
export const MAX_LIBRARY_MATERIAL_BYTES = 1024 * 1024 * 1024;
export const MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES = 200;
export const MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES = 500;
/** The items one answer of 资料库 carries, newest first; `更多资料…` reads the next (Issue #427 review). */
export const MAX_LIBRARY_MATERIALS_PAGE = 20;
/** The decisions an item's card names, the latest of them; the rest are counted. */
export const MAX_LIBRARY_MATERIAL_DECISIONS_SHOWN = 10;

/** Where the next page of 资料库 starts: after this item, newest first. */
export interface LibraryMaterialCursor {
  readonly recordedAt: string;
  readonly materialId: string;
}

/** What an editor collected (KB-007): a book, a paper, a document or a web capture. */
export type LibraryMaterialKind = 'book' | 'paper' | 'document' | 'web';
export const LIBRARY_MATERIAL_KINDS: readonly LibraryMaterialKind[] = ['book', 'paper', 'document', 'web'];

/** What a material's content was identified as. The original is kept whole whatever it is; nothing is read from it yet. */
export type LibraryMaterialFormat = 'DOCX' | 'DOC' | 'PDF' | 'ODT' | 'RTF' | 'TXT' | 'MD' | 'HTML' | 'EPUB' | 'UNKNOWN';

export interface LibraryMaterialSourceProjection {
  readonly displayName: string;
  readonly format: LibraryMaterialFormat;
  readonly bytes: number;
  readonly sha256: string;
}

/** 放入资料…'s first step: the chosen file as it will arrive. Nothing is kept until 放入资料库. */
export interface LibraryMaterialPreviewProjection {
  readonly previewId: string;
  readonly source: LibraryMaterialSourceProjection;
  /** The title it carries unless the editor changes it: the file's name without its extension. */
  readonly suggestedTitle: string;
  /** The kind its format names — a web page for HTML, a book for EPUB — or `null` when only the editor can say. */
  readonly suggestedKind: LibraryMaterialKind | null;
}

/** Where a material belongs (KB-007): one Book or the house. A Series is named once Series exist (Issue #63, S28). */
export type LibraryAttribution = { readonly scope: 'book'; readonly bookId: string } | { readonly scope: 'house' };

/**
 * A Learning Eligibility choice (LEARN-004 to LEARN-006): the one Book it may teach in, the house, excluded, or left for
 * later. `纳入当前书系` waits for Series as the attribution does.
 */
export type LearningEligibilityChoice = 'book' | 'house' | 'excluded' | 'deferred';

/** One decision the editor made, as the chain holds it: a later one supersedes, none is rewritten (LEARN-007). */
export type LibraryMaterialDecisionInput =
  | { readonly kind: 'attribution'; readonly attribution: LibraryAttribution }
  | { readonly kind: 'eligibility'; readonly choice: LearningEligibilityChoice; readonly reason: string | null };

export interface LibraryMaterialDecisionProjection {
  readonly ordinal: number;
  readonly recordedAt: string;
  readonly decision:
    | { readonly kind: 'attribution'; readonly scope: 'book'; readonly bookId: string; readonly bookTitle: string }
    | { readonly kind: 'attribution'; readonly scope: 'house' }
    | { readonly kind: 'eligibility'; readonly choice: LearningEligibilityChoice; readonly bookTitle: string | null; readonly reason: string | null; readonly reasonHasMore: boolean };
}

/** One 资料库 item: what arrived, where it belongs, whether it may teach, and whose Tasks may list it under 允许参考. */
export interface LibraryMaterialProjection {
  readonly materialId: string;
  readonly title: string;
  readonly kind: LibraryMaterialKind;
  readonly source: LibraryMaterialSourceProjection;
  readonly recordedAt: string;
  /** The arrival record's digest: the version a Task that lists it would name (KB-002). */
  readonly digest: string;
  /** The attribution that stands; `null` while the editor has not decided one. */
  readonly attribution:
    | null
    | { readonly scope: 'book'; readonly bookId: string; readonly bookTitle: string; readonly decidedAt: string }
    | { readonly scope: 'house'; readonly decidedAt: string };
  /** The Learning Eligibility decided under that attribution; `null` while none was. */
  readonly eligibility: null | {
    readonly choice: LearningEligibilityChoice;
    readonly bookTitle: string | null;
    readonly reason: string | null;
    readonly reasonHasMore: boolean;
    readonly ordinal: number;
    readonly decidedAt: string;
  };
  /** A decision made under an earlier attribution, which changing the attribution set aside: it is decided again. */
  readonly eligibilityReset: boolean;
  /** Whether a Task may list it under 允许参考 (KB-007): once both are decided, and eligibility not left for later. */
  readonly reference:
    | { readonly state: 'available'; readonly scope: 'book'; readonly bookTitle: string }
    | { readonly state: 'available'; readonly scope: 'house' }
    | { readonly state: 'pending' };
  /** How many decisions the item's chain holds. */
  readonly decisionCount: number;
  /** The latest of them, oldest first, at most `MAX_LIBRARY_MATERIAL_DECISIONS_SHOWN`. */
  readonly decisions: ReadonlyArray<LibraryMaterialDecisionProjection>;
  /** Its Material Index, layer by layer, as it stands on this machine (Issue #428, S80a; KB-009). */
  readonly index: MaterialIndexProjection;
  /** Where it came from when 保存为来源材料 made it of a retained external source (Issue #425, S70); absent otherwise. */
  readonly provenance?: LibraryMaterialProvenance;
}

/** A 来源材料's provenance: the retained source, the Run that retained it and the capture's identities (Issue #425, S70). */
export interface LibraryMaterialProvenance {
  readonly kind: 'research-evidence';
  readonly evidenceId: string;
  readonly bookId: string;
  readonly runRecordId: string;
  readonly url: string;
  readonly capturedAt: string;
  readonly contentSha256: string;
  readonly pageSha256: string | null;
  readonly snapshotDigest: string | null;
}

// ---- ⑤ 资料库 · 资料索引 (Issue #428, plan slice S80a; editor-surfaces §8.4, V2-UX-KB-009, ATTN-009) -------------------

/**
 * Where an item's Material Index stands: waiting for its turn or being built on this machine, or built — every layer
 * read, or some layers not readable for its format, or not readable at all for the reason given.
 */
export type MaterialIndexState = 'queued' | 'indexing' | 'complete' | 'unsupported' | 'failed';

/**
 * Why a layer could not be read (S80a): the format needs a local dependency the Owner has not admitted (PDF text and
 * recognition), AI7 reads no text of this format yet, the text crossed the local reading bounds, the file could not be
 * read, the kept original no longer matches its record, or the file holds no text. Since protocol 121 (Issue #428): the file
 * is encrypted or carries DRM (an EPUB's, an ODT saved with a password), or it declares entities or an internal DTD subset,
 * which AI7 never expands or fetches. Since protocol 140 (Issue #892): a PDF whose pages carry no text layer to speak of — a
 * scan — needs recognition (需要识别), which this build does not provide.
 */
export type MaterialIndexReason =
  | 'needs-local-dependency'
  | 'format-unsupported'
  | 'over-bound'
  | 'unreadable'
  | 'original-changed'
  | 'empty'
  | 'encrypted'
  | 'external-entity'
  | 'needs-recognition';

/**
 * One layer's state, in the five layers of KB-009 and the two parts its text layer names (recognition, Source
 * Translation). `deferred` is a layer this build of AI7 does not provide: recognition (OCR) needs a local dependency the
 * Owner has not admitted. Since protocol 140 (Issue #892) the two layers made on request say where they stand: `not-built`
 * before the editor asks (构建相似索引, 生成来源译文), `building` while they are made, `partial` when 来源译文 stopped part way,
 * and `needs-model` when the similarity provider's model files are missing or do not match (需要模型文件).
 */
export type MaterialIndexLayerState = 'complete' | 'pending' | 'unsupported' | 'failed' | 'deferred' | 'not-needed' | 'not-built' | 'building' | 'partial' | 'needs-model';

/** The language the extracted text is mostly in: Chinese, another language, or no letters at all. */
export type MaterialIndexLanguage = 'zh' | 'other' | 'none';

export interface MaterialIndexProjection {
  readonly state: MaterialIndexState;
  /** Why the text could not be read; `null` while it is waiting, or once it was read. */
  readonly reason: MaterialIndexReason | null;
  /** When the index was built; `null` before. */
  readonly builtAt: string | null;
  /** The index record's digest: the version a Task that lists the item pins (KB-002); `null` before it is built. */
  readonly digest: string | null;
  readonly layers: {
    readonly original: MaterialIndexLayerState;
    readonly metadata: MaterialIndexLayerState;
    readonly text: MaterialIndexLayerState;
    readonly recognition: MaterialIndexLayerState;
    readonly translation: MaterialIndexLayerState;
    readonly segments: MaterialIndexLayerState;
    readonly vectors: MaterialIndexLayerState;
  };
  /** What the metadata layer read of the file: its own title when it names one, the language, and the counts. */
  readonly metadata: null | {
    readonly documentTitle: string | null;
    readonly language: MaterialIndexLanguage | null;
    readonly paragraphs: number;
    readonly headings: number;
    readonly sentences: number;
    readonly characters: number;
    /** A PDF's page count (Issue #892); `null` for every format without pages. */
    readonly pages: number | null;
  };
  /**
   * 相似段落检索 (Issue #892): the similarity vectors of the current build, made only when the editor asks, never on open;
   * `null` until the text was read.
   */
  readonly vectors: null | MaterialVectorsProjection;
  /** 来源译文 (Issue #892): the machine translation of a non-Chinese item's text, a separate layer; `null` when none is needed. */
  readonly translation: null | MaterialTranslationProjection;
}

/** Where the current build's similarity vectors stand, and what makes them (Issue #892). */
export interface MaterialVectorsProjection {
  readonly state: 'not-built' | 'building' | 'complete' | 'needs-model';
  /** The provider's identity, e.g. `ai7-embedding/stub-1`: what the vectors are made by. */
  readonly embedding: string;
  readonly dimensions: number;
  /** How many of the build's paragraphs have their vector, of `total`. */
  readonly built: number;
  readonly total: number;
  /** When the last vector was recorded; `null` before any. */
  readonly builtAt: string | null;
  /** The model digest the provider expects when its model files are missing or do not match; `null` otherwise. */
  readonly expectedDigest: string | null;
}

/** Where the current build's 来源译文 stands, and whether the editor may ask for it now (Issue #892). */
export interface MaterialTranslationProjection {
  readonly state: 'not-built' | 'building' | 'complete' | 'partial';
  /** How many of the build's paragraphs have their 来源译文, of `total`. */
  readonly translated: number;
  readonly total: number;
  /** The model that made the translations on record; `null` before any. */
  readonly model: string | null;
  /** Whether 生成来源译文 may be asked now; `reason` says why not (「当前策略未开放来源译文」 when no rule names it). */
  readonly request: { readonly available: boolean; readonly reason: string | null };
  /** Why the last request stopped part way, in the editor's words; `null` when it did not. */
  readonly lastFailure: string | null;
  /** Last actual model attempt, retained independently of whether it produced any translation. */
  readonly lastAttempt?: MaterialTranslationAttemptProjection | null;
}

export interface MaterialTranslationAttemptProjection {
  readonly attemptId: string;
  readonly indexId: string;
  readonly indexSha256: string;
  readonly sourceSha256: string;
  readonly batch: ReadonlyArray<{ readonly ordinal: number; readonly sha256: string }>;
  readonly recordedAt: string;
  readonly outcome: 'translated' | 'failed' | 'outcome-unknown';
  readonly provenance: ModelTextAttemptProvenance;
}

/** What a 来源译文 is labelled wherever it is shown or read: it is the machine's, never the original. */
export const MATERIAL_TRANSLATION_LABEL = '来源译文';

/** The candidates one 相似段落检索 answers at most, and the longest text it compares. */
export const MAX_MATERIAL_VECTOR_CANDIDATES = 32;
export const MAX_MATERIAL_VECTOR_QUERY_CODE_UNITS = 2_000;

/**
 * 相似段落检索 in an item's 查看索引 (Issue #892): its paragraphs nearest the editor's text, each with its anchor and a short
 * preview. The ranking finds candidates; the words are read where the anchor points (ADR 0026).
 */
export interface MaterialVectorSearchProjection {
  readonly materialId: string;
  readonly indexDigest: string;
  readonly embedding: string;
  readonly candidates: ReadonlyArray<{
    readonly ordinal: number;
    readonly page: number | null;
    readonly pageParagraph: number | null;
    readonly score: number;
    readonly preview: string;
  }>;
}

/** The paragraphs one answer of 查看分段 carries at most: one frame holds them at the paragraph bound. */
export const MAX_MATERIAL_SEGMENTS_PAGE = 16;

/**
 * One page of an item's segments (KB-009): each paragraph with its kind and its sentences as ranges of its text, so every
 * sentence is citable by its position anchor — 第 n 段第 m 句. These formats carry no page numbers, and the anchors say so by
 * being positions.
 */
export interface MaterialSegmentsPageProjection {
  readonly materialId: string;
  readonly title: string;
  /** The index record the page was read from. */
  readonly indexDigest: string;
  /** How many paragraphs the index holds. */
  readonly total: number;
  /** The first paragraph's ordinal on this page, 1-based. */
  readonly from: number;
  readonly segments: ReadonlyArray<{
    readonly ordinal: number;
    readonly kind: 'title' | 'heading' | 'paragraph';
    readonly text: string;
    /** Each sentence as `[start, end)` in UTF-16 code units of `text`, in order. */
    readonly sentences: ReadonlyArray<readonly [number, number]>;
    /** A PDF paragraph's page and its place on that page (Issue #892); `null` for every format without pages. */
    readonly page: number | null;
    readonly pageParagraph: number | null;
    /** Its 来源译文 when one was made (Issue #892): labelled, attributed to this paragraph, never in place of it. */
    readonly translation: null | { readonly text: string; readonly model: string };
  }>;
  readonly next: number | null;
  readonly previous: number | null;
}

/** One page of 资料库. An attribution names its Book from 书库's own pages (`listBooks`), never from this answer. */
export interface LibraryMaterialsProjection {
  /** Newest arrival first. */
  readonly materials: ReadonlyArray<LibraryMaterialProjection>;
  /** Where the next page starts; `null` when this is the last. */
  readonly nextCursor: LibraryMaterialCursor | null;
}

// ---- ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012) ----------

/** What the editor writes about one Evaluation Record at most. */
export const MAX_EVALUATION_COMMENT_GRAPHEMES = 1000;
export const MAX_EVALUATION_VERDICT_GRAPHEMES = 2000;
export const MAX_EVALUATION_LINE_GRAPHEMES = 200;
export const MAX_EVALUATION_LINES = 20;
export const MAX_EVALUATION_RISK_STATEMENT_GRAPHEMES = 500;

export type EvaluationBandLabel = '卓越' | '优秀' | '合格' | '薄弱' | '不宜';
export type EvaluationConclusion = 'recommend' | 'revise' | 'defer' | 'reject';
export const EVALUATION_CONCLUSIONS: readonly EvaluationConclusion[] = ['recommend', 'revise', 'defer', 'reject'];

/**
 * The house Evaluation Profile (EVAL-002, EVAL-003, EVAL-005; root ADR 0001): the scored items with their 满分 out of 100,
 * the bands with their anchor wording, the risk items and the conclusions. Every Evaluation Record snapshots the one it used.
 */
export interface EvaluationProfileProjection {
  readonly profileId: string;
  readonly title: string;
  readonly version: string;
  readonly issuer: string;
  readonly total: number;
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly label: string; readonly fullMarks: number; readonly description?: string }>;
  readonly readiness?: ReadonlyArray<string>;
  readonly bands: ReadonlyArray<{ readonly band: 'excellent' | 'good' | 'adequate' | 'weak' | 'unsuitable'; readonly label: EvaluationBandLabel; readonly floor: number; readonly anchor: string }>;
  readonly risks: ReadonlyArray<{ readonly riskId: string; readonly label: string }>;
  readonly conclusions: ReadonlyArray<{ readonly conclusion: EvaluationConclusion; readonly label: string }>;
  readonly sha256: string;
}

/** 知识库 › 评估方案: each profile, and how many Evaluation Records of how many Books used it. */
export interface EvaluationProfilesProjection {
  readonly activeSha256?: string;
  readonly nextBefore?: number | null;
  readonly profiles: ReadonlyArray<EvaluationProfileProjection & { readonly records: number; readonly books: number }>;
}

/** A new immutable house version; null item identities are assigned by the service. */
export interface SaveEvaluationProfileInput {
  readonly expectedSha256: string;
  readonly items: ReadonlyArray<{ readonly itemId: string | null; readonly label: string; readonly description: string }>;
  readonly readiness: ReadonlyArray<string>;
}

/** What the editor wrote about one version of an evaluation: every item, every risk, and the rest of the record. */
export interface EvaluationContent {
  readonly items: ReadonlyArray<{
    readonly itemId: string;
    /** A whole or half point from 0 to the item's 满分, or `null` while unscored or `不评`. */
    readonly score: number | null;
    /** `不评`, with its reason (EVAL-005). */
    readonly notRated: string | null;
    readonly comment: string | null;
    /**
     * Why the editor's score departs from AI7's 初评 (EVAL-006), when the version began from it and the two differ; `null`
     * otherwise. Absent from a version saved before AI7's 初评 existed, which reads as `null`.
     */
    readonly adjustment?: EvaluationAdjustment | null;
  }>;
  readonly risks: ReadonlyArray<{
    readonly riskId: string;
    readonly level: 'low' | 'medium' | 'high' | null;
    readonly statement: string | null;
    /** A person reviewed a `高` risk: only then may the conclusion be `推荐出版` (EVAL-004). */
    readonly reviewed: boolean;
  }>;
  /** 距离可出版还差什么, one line each. */
  readonly readiness: ReadonlyArray<string>;
  readonly strengths: ReadonlyArray<string>;
  readonly weaknesses: ReadonlyArray<string>;
  /** 总评. */
  readonly verdict: string | null;
  /** Chosen by the editor, never preselected (EVAL-007). */
  readonly conclusion: EvaluationConclusion | null;
}

/** The reasons the editor picked for departing from AI7's score, none preselected; `own` with the editor's words in `note`. */
export type EvaluationAdjustmentReasonId = 'too-high' | 'too-low' | 'insufficient-basis' | 'missed-aspect' | 'own';
export const MAX_EVALUATION_ADJUSTMENT_NOTE_GRAPHEMES = 200;
export interface EvaluationAdjustment {
  readonly reasons: ReadonlyArray<EvaluationAdjustmentReasonId>;
  readonly note: string | null;
}

/** The total out of the 满分 still rated, and how many items are left `不评` or unscored. */
export interface EvaluationTotalProjection {
  readonly score: number;
  readonly fullMarks: number;
  readonly notRated: number;
  readonly unscored: number;
}

/**
 * The most of AI7's notes 评估 carries of one 初评 or one rewrite, shared among its items (Issue #689 and its review): a long
 * Book's notes, every range's, would outgrow the frame. The budget is per evidence set, not per item, so the page stays within
 * the frame for any profile the contracts admit (up to 16 items), with three such sets on it. An item with fewer notes than
 * its share keeps them all; beyond its share the notes shown are spread over the ranges read — each range's first, then its
 * second — and the item says how many there are in all.
 */
export const MAX_EVALUATION_EVIDENCE_NOTES = 60;

/** One thing AI7 noted toward an item while it read one range (EVAL-006): its words, and the blocks it cited there. */
export interface EvaluationInitialEvidenceProjection {
  readonly unitOrdinal: number;
  readonly note: string;
  readonly blockIds: ReadonlyArray<string>;
}

/**
 * AI7's 初评 as one version of the record keeps it (EVAL-001, EVAL-005 to EVAL-007): what the version began from, snapshotted
 * when it began, so AI7's score stands beside the editor's for as long as the version does.
 */
export interface EvaluationInitialDraftProjection {
  /** The Result Set Revision of AI7's 初评, its number, and the manuscript revision it read. */
  readonly revisionId: string;
  readonly ordinal: number;
  readonly revisionLabel: string;
  readonly createdAt: string;
  readonly items: ReadonlyArray<{
    readonly itemId: string;
    readonly score: number | null;
    readonly comment: string | null;
    readonly sufficiency: InitialEvaluationSufficiency;
    readonly citedBlocks: number;
    readonly unitsCited: number;
    /**
     * What AI7 noted toward the item, range by range: the evidence its score rests on (EVAL-006) — its share of
     * `MAX_EVALUATION_EVIDENCE_NOTES`, spread over the ranges (Issue #689).
     */
    readonly evidence: ReadonlyArray<EvaluationInitialEvidenceProjection>;
    /** How many notes AI7 made toward the item in all; more than `evidence` holds when it was cut. */
    readonly evidenceCount: number;
  }>;
  /** How many ranges the 初评 meant to read, and the ones it did not — a 初评 that completed with gaps says which. */
  readonly unitsTotal: number;
  readonly unreadUnits: ReadonlyArray<number>;
  readonly total: EvaluationTotalProjection;
  readonly strengths: ReadonlyArray<string>;
  readonly weaknesses: ReadonlyArray<string>;
  readonly nextStep: string | null;
  readonly suggestedConclusion: EvaluationConclusion | null;
  /** Every item scored: the book-level synthesis closed. */
  readonly complete: boolean;
  /**
   * AI7's market section (Issue #429, S81b2; EVAL-009): from what the 初评 read in the Book alone; `null` for a 初评 that wrote
   * none — one whose synthesis did not close, or one a version began from before the market section existed.
   */
  readonly market: InitialEvaluationMarketProjection | null;
}

/** AI7's 初评 on ②C: its Task, whether one can be prepared now, and the latest that settled. */
export interface EvaluationInitialProjection {
  /** The Book's latest 初评 Task, which the Task Drawer opens; `null` before the first is prepared. */
  readonly task: null | {
    readonly historicalMarker?: string;
    readonly taskIntentId: string;
    readonly state: BaselineAnalysisProjection['state'];
    /** The Task's state in the editor's words. */
    readonly label: string;
  };
  /** 准备 AI7 初评, or why it cannot be prepared now. */
  readonly prepare: { readonly allowed: true; readonly mode: InitialEvaluationTaskMode } | { readonly allowed: false; readonly reason: string };
  /** The latest 初评 that settled, and whether it read the manuscript as it stands now. */
  readonly latest: null | (EvaluationInitialDraftProjection & { readonly current: boolean; readonly profile?: EvaluationProfileProjection });
}

export interface EvaluationRecordSummaryProjection {
  readonly recordId: string;
  readonly ordinal: number;
  /**
   * The three states of EVAL-001: `draft` is a version begun from AI7's 初评 that the editor has not saved yet, `editing` the
   * editor's calibration, `finalized` 定稿.
   */
  readonly state: 'draft' | 'editing' | 'finalized';
  readonly revisionLabel: string;
  readonly total: EvaluationTotalProjection;
  readonly conclusion: EvaluationConclusion | null;
  readonly createdAt: string;
  readonly finalizedAt: string | null;
}

/** One version compared item by item with the version it re-evaluated (EVAL-012). */
export interface EvaluationComparisonProjection {
  readonly previousOrdinal: number;
  readonly items: ReadonlyArray<{ readonly itemId: string;
    readonly label?: string;
    readonly change?: 'added' | 'removed' | null; readonly previous: number | 'not-rated' | null; readonly current: number | 'not-rated' | null }>;
  readonly risks: ReadonlyArray<{ readonly riskId: string; readonly previous: 'low' | 'medium' | 'high' | null; readonly current: 'low' | 'medium' | 'high' | null }>;
  readonly total: { readonly previous: EvaluationTotalProjection; readonly current: EvaluationTotalProjection };
  readonly conclusion: { readonly previous: EvaluationConclusion | null; readonly current: EvaluationConclusion | null };
}

export interface EvaluationRecordProjection extends EvaluationRecordSummaryProjection {
  readonly revisionId: string;
  /** The manuscript had edits in its journal not yet saved as a revision when this version began. */
  readonly uncheckpointed: boolean;
  /** The profile this version snapshotted. */
  readonly profile: EvaluationProfileProjection;
  readonly content: EvaluationContent;
  /** How many entries its chain holds: a save names it, and is refused when another window saved first. */
  readonly entries: number;
  readonly savedAt: string;
  readonly finalized: null | { readonly actor: string; readonly at: string };
  /** `推荐出版` waits for a person's review of every `高` risk (EVAL-004). */
  readonly recommendationBlocked: boolean;
  readonly comparison: EvaluationComparisonProjection | null;
  /** AI7's 初评 this version began from, beside the editor's scores (EVAL-006); `null` for a version the editor began alone. */
  readonly initial: EvaluationInitialDraftProjection | null;
  /**
   * The house calibration applied to AI7's starting scores when this version began from its 初评 (EVAL-011; Issue #429,
   * EVAL-011a): recorded with the version, as it was then. `null` for a version begun alone, or from the raw 初评 — below the
   * gate, or with calibration turned off. `initial.items[].score` keeps AI7's raw score either way.
   */
  readonly calibration: EvaluationInitialCalibrationProjection | null;
  /**
   * Why which of this version's words are AI7's could not all be checked (Issue #702 review): the version before could not be
   * read, or the 采用 records cannot be read now. The words the version marks stay AI7's. `null` when every mark was checked.
   */
  readonly ai7WordsNotice: string | null;
  /**
   * The versions this one skipped when it began (Issue #726): the ordinals of the Book's versions after the one it was seeded
   * from that could not be read then, oldest first. Empty for a version that followed the one before it.
   */
  readonly skippedRecords: ReadonlyArray<number>;
  /** The ordinal of the version this one was seeded from — the one it compares with — or `null` when it began empty. */
  readonly seededFrom: number | null;
}

/**
 * The house calibration a version begun from AI7's 初评 recorded (EVAL-011; Issue #429, EVAL-011a): how many Books' 定稿
 * evaluations the offsets rested on, and each item whose starting score it moved — AI7's raw score, the offset, and the
 * starting score after it, clamped to [0, 满分]. An item whose offset was 0, or which AI7 did not score, is not listed.
 */
export interface EvaluationInitialCalibrationProjection {
  readonly basisBooks: number;
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly raw: number; readonly offset: number; readonly adjusted: number }>;
}

/** ②C 评估 of one Book: its versions newest first, the one on show, and whether a version can begin. */
export interface EvaluationWorkspaceProjection {
  /** Locally indexed 资料库 choices, separate from the manuscript and house exemplars (#428). */
  readonly materials?: TaskMaterialOffersProjection;
  /**
   * The latest Tasks' frozen reference rows, never their extracted words; `blocked` names a prepared plan that can no longer
   * start because a frozen reference went away, which 评估 then lets the editor prepare again.
   */
  readonly materialReferences?: {
    readonly initial: ReadonlyArray<string>;
    readonly readersReport: ReadonlyArray<string>;
    readonly blocked: { readonly initial: boolean; readonly readersReport: boolean };
  };
  readonly bookId: string;
  readonly bookTitle: string;
  /** The Book's manuscript as a new version would bind it, or `null` when the Book has none. */
  readonly manuscript: null | { readonly revisionId: string; readonly revisionLabel: string; readonly uncheckpointed: boolean };
  /** The profile a new version would snapshot. */
  readonly profile: EvaluationProfileProjection;
  readonly records: ReadonlyArray<EvaluationRecordSummaryProjection>;
  readonly recordCount: number;
  readonly recordsBefore: number | null;
  readonly recordsNext: number | null;
  /** The ordinals of the Book's versions that cannot be read, oldest first (Issue #702 review): named, never shown. */
  readonly unreadableRecords: ReadonlyArray<number>;
  readonly record: EvaluationRecordProjection | null;
  /**
   * `开始评估` or `重新评估`, or why neither can begin now; `fromInitial` names AI7's latest 初评 when a version can begin from it
   * — the 初评 settled and read the manuscript as it stands now. `skipDamaged` is set while the Book's latest version cannot
   * be read (Issue #726): the next version then skips every version after `seedOrdinal` — the latest readable 定稿, or `null`
   * when none reads and the version begins empty — and `startEvaluation` must say so (`StartEvaluationInput.skipDamaged`).
   */
  readonly start:
    | {
        readonly allowed: true;
        readonly kind: 'first' | 'again';
        readonly fromInitial: null | { readonly revisionId: string; readonly ordinal: number };
        readonly skipDamaged: null | { readonly skipped: ReadonlyArray<number>; readonly seedOrdinal: number | null };
      }
    | { readonly allowed: false; readonly reason: string };
  /** AI7's 初评 of the Book (Issue #429, S81b1). */
  readonly initial: EvaluationInitialProjection;
  /** 审稿意见 of the Book (Issue #429, S81c). */
  readonly readersReport: EvaluationReadersReportProjection;
  /** The market section's house data for the version on show (Issue #429, S81b2): 书系 comparables and 定价与首印. */
  readonly market: EvaluationMarketProjection;
  /** 按我的评分重写评语 of the version on show (Issue #429, S81b2). */
  readonly rewrite: EvaluationRewriteWorkspaceProjection;
}

// ---- 市场 and 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008 to EVAL-010) --------------------------------

/** The most 书系 comparables the market section lists; the count says how many more there are. */
export const MAX_EVALUATION_COMPARABLES = 10;
/**
 * The fewest other published Books of the Book's own 书系 with actuals that 定价与首印 gives a 书系 range over (S81b2): fewer,
 * and the quartiles would be one or two Books' own figures shown as a prediction. Below it only the house range shows.
 */
export const MIN_SERIES_PREDICTION_BOOKS = 5;

/**
 * A 定价与首印 range over published Books' actuals (EVAL-010; the Owner's answer of 2026-10-07: 「按本社已出版同类书的实际数据
 * 统计」): the middle half of the Books — from the lower to the upper quartile — and the median, with how many Books it rests
 * on. Prices in 分. Statistics over the house's own entries, never a model's and never the web's.
 */
export interface EvaluationPredictionRangeProjection {
  readonly books: number;
  readonly priceFen: { readonly low: number; readonly median: number; readonly high: number };
  readonly firstPrint: { readonly low: number; readonly median: number; readonly high: number };
}

/**
 * 定价与首印 in the market section (EVAL-010, EVAL-014): shown only once 设置 › 评估校准与预测's switch is on and enough
 * other published Books carry actuals; otherwise what it waits for. The ranges never count the Book itself, and neither does
 * the gate they wait on.
 */
export interface EvaluationPricingProjection {
  /** Every published Book with actuals: what the switch in 设置 waits on. */
  readonly booksWithActuals: number;
  /** The published Books with actuals other than this one: what the ranges rest on, and what they wait on. */
  readonly otherBooksWithActuals: number;
  readonly threshold: number;
  readonly enabled: boolean;
  /** The switch may be on: `booksWithActuals` reached the threshold. */
  readonly available: boolean;
  /** The house data could not be read this time (a damaged entry): nothing is predicted, and 评估 stays readable. */
  readonly unreadable: boolean;
  /** The house's other published Books with actuals, when the prediction shows; `null` otherwise. */
  readonly house: EvaluationPredictionRangeProjection | null;
  /** The other published Books with actuals of the Book's own 书系, when the prediction shows and they reach `MIN_SERIES_PREDICTION_BOOKS`; `null` otherwise. */
  readonly series: EvaluationPredictionRangeProjection | null;
  /** How many of those the Book's 书系 holds, when the prediction shows and the Book is in one; `null` otherwise. */
  readonly seriesBooksWithActuals: number | null;
  readonly seriesMinimum: number;
}

/** One comparable Book from house data (EVAL-009): another member of a 书系 this Book is in, tagged `书系`. */
export interface EvaluationComparableProjection {
  readonly bookId: string;
  readonly title: string;
  readonly seriesTitle: string;
  /** It has a 发稿版本. */
  readonly published: boolean;
  readonly source: 'series';
}

/** The market section's house data (EVAL-009, EVAL-010): the Book's 书系, their other Books, and 定价与首印. */
export interface EvaluationMarketProjection {
  readonly series: ReadonlyArray<{ readonly seriesId: string; readonly title: string }>;
  readonly comparables: ReadonlyArray<EvaluationComparableProjection>;
  /** How many comparables there are in all; the list holds at most `MAX_EVALUATION_COMPARABLES`. */
  readonly comparableCount: number;
  /** The 书系 data could not be read this time (a damaged entry): no 书系 and no comparables are listed, and 评估 stays readable. */
  readonly seriesUnreadable: boolean;
  readonly pricing: EvaluationPricingProjection;
}

/** 采用 records the rewrite as a new entry of the version; 放弃 sets it aside. */
export type EvaluationRewriteDecision = 'accept' | 'discard';

/**
 * 按我的评分重写评语 of the version on show (EVAL-008): whether it can be asked now, the Book's latest rewrite Task, the rewrite
 * waiting for the editor's decision with its words beside the version's, and the version's last decision.
 */
export interface EvaluationRewriteWorkspaceProjection {
  readonly prepare: { readonly allowed: true; readonly mode: EvaluationRewriteTaskMode } | { readonly allowed: false; readonly reason: string };
  /** The Book's latest rewrite Task, which the Task Drawer opens, and the version and entry it rewrites. */
  readonly task: null | {
    readonly taskIntentId: string;
    readonly recordId: string;
    readonly recordOrdinal: number;
    readonly entryOrdinal: number;
    readonly state: BaselineAnalysisProjection['state'];
    readonly label: string;
  };
  /** The newest rewrite of the version on show that the editor has not decided; `null` when none waits. */
  readonly proposal: null | {
    readonly revisionId: string;
    readonly createdAt: string;
    /** The saved entry it rewrote, and whether that is still the version's latest — only then can it be 采用. */
    readonly entryOrdinal: number;
    readonly current: boolean;
    /** How much of the Book the rewrite read: its notes, and so its words, rest on the ranges read and never on the rest. */
    readonly reading: { readonly unitsTotal: number; readonly unitsRead: number };
    /** Each 评语 offered beside the version's own, with the notes AI7 rests it on (EVAL-006): the range and the blocks cited. */
    readonly items: ReadonlyArray<{
      readonly itemId: string;
      readonly before: string | null;
      readonly after: string;
      /** Its share of `MAX_EVALUATION_EVIDENCE_NOTES`, spread over the ranges (Issue #689); `evidenceCount` says how many in all. */
      readonly evidence: ReadonlyArray<{ readonly unitOrdinal: number; readonly note: string; readonly blockIds: ReadonlyArray<string> }>;
      readonly evidenceCount: number;
    }>;
    /** The 总评 offered beside the version's own; `null` when it was set aside. */
    readonly verdict: null | { readonly before: string | null; readonly after: string };
    /** What AI7 wrote but does not offer — a 评语 or the 总评 that stated a score or a conclusion — each with why. */
    readonly withheld: ReadonlyArray<string>;
  };
  /** The version's latest decision on a rewrite; `null` before the first. */
  readonly decided: null | { readonly decision: 'accepted' | 'discarded'; readonly entryOrdinal: number | null; readonly decidedAt: string };
}

/** One template's 审稿意见 on ②C (Issue #429, S81c; EVAL-013): whether it can be drafted, its result, and its draft. */
export interface EvaluationReadersReportTemplateProjection {
  readonly template: ReadersReportTemplate;
  readonly label: string;
  /** 起草, or why it cannot be drafted now. */
  readonly prepare: { readonly allowed: true; readonly mode: ReadersReportTaskMode } | { readonly allowed: false; readonly reason: string };
  /** The latest result of this template whose draft has not been opened yet: 打开草稿 makes it the draft document. */
  readonly drafted: null | { readonly revisionId: string; readonly recordOrdinal: number; readonly createdAt: string };
  /** The template's draft, once made: an Editorial Artifact edited on the manuscript surface, a draft and never a delivery. */
  readonly draft: null | {
    readonly typeId: string;
    readonly typeLabel: string;
    /** The 定稿 version it was drafted from. */
    readonly recordOrdinal: number;
    readonly document: ProductionDocumentProjection;
  };
}

/** 审稿意见 on ②C (Issue #429, S81c; EVAL-013): drafted from the Book's latest 定稿 version, under one of two templates. */
export interface EvaluationReadersReportProjection {
  /** The 定稿 version a new 审稿意见 drafts from: the latest; `null` while there is none. */
  readonly basis: null | { readonly recordId: string; readonly ordinal: number; readonly revisionLabel: string; readonly finalizedAt: string };
  /** The house's 审稿意见 among its 范例, and what a plan says of them. */
  readonly exemplars: { readonly count: number; readonly statement: string };
  /** The Book's latest 审稿意见 Task, which the Task Drawer opens; `null` before the first is prepared. */
  readonly task: null | {
    readonly taskIntentId: string;
    readonly template: ReadersReportTemplate;
    readonly state: BaselineAnalysisProjection['state'];
    readonly label: string;
  };
  readonly templates: ReadonlyArray<EvaluationReadersReportTemplateProjection>;
}

/**
 * 开始评估 or 重新评估: alone, or from AI7's latest 初评 (Issue #429, S81b1). `skipDamaged` says the editor saw that the latest
 * version cannot be read and chose to skip it (Issue #726): without it a damaged latest still refuses, and with it a latest
 * that reads after all refuses too, so no version is skipped that the editor did not see skipped.
 */
export interface StartEvaluationInput {
  readonly fromInitial: boolean;
  readonly skipDamaged: boolean;
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

export * from './protocol/series.js';

export * from './protocol/data-storage.js';

export * from './protocol/deliverables.js';

export * from './protocol/procedures.js';

export * from './protocol/learning.js';

// ---- 待我处理 · Global Attention (Issue #424, plan slice S78; editor-surfaces §8.1) ------------------------

/**
 * The four groups of 待我处理, in their one fixed order (V2-UX-ATTN-001): 异常与结果待确认 · 等待你的决定 ·
 * 运行中与已暂停 · 最近完成. No fifth group exists (V2-UX-ATTN-009).
 */
export type GlobalAttentionGroupKey = 'exceptions' | 'decisions' | 'active' | 'recent';
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
  'resolve-conflict', 'answer-clarification', 'adjust-budget-redo', 'resolve-model-service', 'reprepare', 'redo', 'view-plan',
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
  clarificationOrigin?: 'model';
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
  /** A line break follows it: the next fragment starts a new paragraph, item or row. */
  readonly breakAfter: boolean;
}

export interface DialogueAttemptProjection {
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
 * its own and no Apply; it may name only the two current-Book scope kinds Revision 2 of the editorial workspace profile's
 * authority sidecar makes eligible. `safetyLabel` is the visible safety state the screen shows.
 */
export interface AgentWorkspaceCapabilityProjection {
  readonly filesystem: false;
  readonly shell: false;
  readonly network: false;
  readonly apply: false;
  readonly scopes: readonly ['current-book-primary-manuscript-revision', 'current-book-source-version'];
  readonly safetyLabel: '未联网 · 无文件系统 · 无 shell · 不能应用修改';
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
  };
  readonly candidates: ReadonlyArray<AgentWorkspaceCandidateProjection>;
  readonly dropped: ReadonlyArray<AgentWorkspaceDroppedProjection>;
  /** What the round says now, in the editor's words. */
  readonly label: string;
  readonly startedAt: string;
}

export interface AgentWorkspaceProjection {
  readonly bookId: string;
  /** Whether this Book's editorial workspace profile is enabled at Revision 2, which opens the workspace. */
  readonly available: boolean;
  /** The one-sentence prerequisite when it is not; `null` when it is. */
  readonly unavailableReason: string | null;
  readonly capabilities: AgentWorkspaceCapabilityProjection;
  readonly proposal: AgentWorkspaceProposalProjection | null;
}

export interface ProposeAgentWorkspaceChangeSetInput {
  /** The exact words of the Book's primary manuscript the change set is about (one block), as the editor selected them. */
  readonly selection: DialogueSelectionInput;
  /** The editor's instruction, sent as a dialogue question is. */
  readonly instruction: string;
}

export interface AgentWorkspaceProposalSetInput {
  readonly proposalSetId: string;
}

/** 提交为修改建议: the 修改建议 marks the change set became — one atomic group when there are two or more — never applied. */
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
export type TaskIntentDraftOrigin = 'composer-selection' | 'composer-book' | 'dialogue-answer';
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
export type TaskIntentDraftTargetInput =
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
  readonly origin: 'composer-selection' | 'composer-book';
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
    readonly target: 'book' | 'ranges';
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
  | 'report-appendix';

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
  target: ManuscriptExportTargetInput;
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
  selectSearchBackend: { input: { backendId: string }; output: SearchBackendSettingsProjection };
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
    input: Omit<InspectTaskPlanInput, 'kind'> & { kind: TaskPlanKind | 'task-intent-drafts'; path: string; afterOrdinal: number; digest: string };
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
    input: { previewId: string; title: string; kind: LibraryMaterialKind };
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
  /** 打开草稿: one drafted result made the type's document, its 起草 phase started; once per type of a Book. */
  createWritingDraft: {
    input: { bookId: string; revisionId: string };
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
  stopDialogueAnswer: { input: DialogueAttemptInput & { bookId: string }; output: DialogueProjection };
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
  testModelServiceConnection: { input: FastModelSelectionInput; output: ModelConnectionTestStatus };
  getModelServiceStoredState: {
    input: Record<string, never>;
    output: ModelServiceStoredStateProjection;
  };
  saveModelServiceProxy: {
    input: ModelServiceProxySetting;
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
  selectSearchBackend(input: { backendId: string }): Promise<ModelServiceSettingsProjection>;
  probeSearchBackend(input: { backendId: string; candidateId?: SearchCandidateId }): Promise<SearchBackendProbeProjection>;
  saveSearchBackendCredential(input: { backendId: string; secret: string }): Promise<ModelServiceSettingsProjection>;
  removeSearchBackendCredential(input: { backendId: string }): Promise<ModelServiceSettingsProjection>;
  readonly platform: 'win32' | 'darwin';
  getStartup(): Promise<StartupProjection>;
  getRecoveryComparison(input: ServiceOperationMap['getRecoveryComparison']['input']): Promise<RecoveryComparisonProjection>;
  viewRecoveryCandidate(input: ServiceOperationMap['viewRecoveryCandidate']['input']): Promise<RecoveryWindowProjection>;
  deferRecovery(input: ServiceOperationMap['deferRecovery']['input']): Promise<RecoveryDeferralProjection>;
  restoreRecovery(input: Omit<ServiceOperationMap['restoreRecovery']['input'], 'restorationId'>): Promise<RecoveryRestorationProjection>;
  getImportStartup(): Promise<ImportStartupProjection>;
  selectAndStageManuscript(): Promise<PickerStageResult>;
  importBundledSampleBook(): Promise<PickerStageResult>;
  continueImportDraft(input: ServiceOperationMap['continueImportDraft']['input']): Promise<ContinueImportProjection>;
  reselectImportDraft(input: {
    draftId: string;
    expectedDraftVersion: number;
  }): Promise<PickerReselectResult>;
  abandonImportDraft(input: ServiceOperationMap['abandonImportDraft']['input']): Promise<ImportStartupProjection>;
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
  createWritingDraft(input: { revisionId: string }): Promise<WritingDraftCreatedProjection>;
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
  inspectBookDeliveryPackage(): Promise<BookDeliveryPackageProjection>;
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
  testModelServiceConnection(input: FastModelSelectionInput): Promise<ModelServiceSettingsProjection>;
  getModelServiceSettings(): Promise<ModelServiceSettingsProjection>;
  saveModelServiceProxy(input: ModelServiceProxySetting): Promise<ModelServiceSettingsProjection>;
  /**
   * Save a route's connection name and credential — the DeepSeek 开放平台（官方） route when `route` is absent, as Issue #712 has
   * always saved it — or, given only `{ route, select: true }`, make that saved route the one new Tasks use (Issue #811).
   */
  saveModelServiceCredential(input: ModelServiceCredentialInput): Promise<ModelServiceSettingsProjection>;
  /** Remove a route's credential; the DeepSeek 开放平台（官方） route's when no route is named. */
  removeModelServiceCredential(input?: { route: ModelServiceRouteId }): Promise<ModelServiceSettingsProjection>;
}
