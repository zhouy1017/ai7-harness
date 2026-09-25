import type { AnalysisFeedbackDimension, AnalysisFeedbackJudgment } from './analysis-feedback.js';
import type { ConflictUnit, ConflictUnitResolution } from './conflict-units.js';

export const SERVICE_PROTOCOL_VERSION = 81 as const;
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
  inspectForegroundExecutionBoundary: 'ai7:j03:inspect-foreground-execution-boundary',
  prepareTaskAuthorization: 'ai7:j03:prepare-task-authorization',
  authorizeTaskAuthorization: 'ai7:j03:authorize-task-authorization',
  inspectBaselineAnalysis: 'ai7:j04:inspect-baseline-analysis',
  prepareBaselineAnalysis: 'ai7:j04:prepare-baseline-analysis',
  authorizeBaselineAnalysis: 'ai7:j04:authorize-baseline-analysis',
  startBaselineAnalysisWhenOnline: 'ai7:j04:start-baseline-analysis-when-online',
  cancelWaitingBaselineAnalysis: 'ai7:j04:cancel-waiting-baseline-analysis',
  cancelBaselineAnalysisRun: 'ai7:j04:cancel-baseline-analysis-run',
  pauseBaselineAnalysisRun: 'ai7:j04:pause-baseline-analysis-run',
  resumeBaselineAnalysisRun: 'ai7:j04:resume-baseline-analysis-run',
  editBaselineAnalysisPlan: 'ai7:j04:edit-baseline-analysis-plan',
  answerBaselineAnalysisClarification: 'ai7:j04:answer-baseline-analysis-clarification',
  runReconnectPreflight: 'ai7:j04:run-reconnect-preflight',
  quickStartBaselineAnalysis: 'ai7:j04:quick-start-baseline-analysis',
  setDefaultExecutionRule: 'ai7:j04:set-default-execution-rule',
  inspectDefaultExecutionRules: 'ai7:j04:inspect-default-execution-rules',
  deactivateDefaultExecutionRule: 'ai7:j04:deactivate-default-execution-rule',
  inspectReviewGuidelines: 'ai7:j15:inspect-review-guidelines',
  previewReviewGuidelineVersion: 'ai7:j15:preview-review-guideline-version',
  importReviewGuidelineVersion: 'ai7:j15:import-review-guideline-version',
  inspectExemplars: 'ai7:j07:inspect-exemplars',
  inspectKnowledgeProcedures: 'ai7:j15:inspect-knowledge-procedures',
  inspectLibraryMaterials: 'ai7:j15:inspect-library-materials',
  previewLibraryMaterial: 'ai7:j15:preview-library-material',
  addLibraryMaterial: 'ai7:j15:add-library-material',
  decideLibraryMaterial: 'ai7:j15:decide-library-material',
  inspectEvaluationProfiles: 'ai7:j11:inspect-evaluation-profiles',
  inspectEvaluation: 'ai7:j11:inspect-evaluation',
  startEvaluation: 'ai7:j11:start-evaluation',
  saveEvaluation: 'ai7:j11:save-evaluation',
  inspectAnalysisFeedback: 'ai7:j11:inspect-analysis-feedback',
  recordAnalysisFeedback: 'ai7:j11:record-analysis-feedback',
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
  recordManuscriptEntryPosition: 'ai7:j12:record-manuscript-entry-position',
  createEditorialMark: 'ai7:j05:create-editorial-mark',
  getEditorialMarkCard: 'ai7:j05:get-editorial-mark-card',
  updateEditorialMark: 'ai7:j05:update-editorial-mark',
  recordChangeSuggestionDecision: 'ai7:j05:record-change-suggestion-decision',
  recordProposalDecisionReason: 'ai7:j05:record-proposal-decision-reason',
  recordProposalDecisionFeedback: 'ai7:j11:record-proposal-decision-feedback',
  inspectLearningMaterials: 'ai7:j11:inspect-learning-materials',
  decideLearningMaterial: 'ai7:j11:decide-learning-material',
  inspectFeedbackHistory: 'ai7:j11:inspect-feedback-history',
  inspectEvaluationCalibration: 'ai7:j12:inspect-evaluation-calibration',
  recordPublicationActuals: 'ai7:j12:record-publication-actuals',
  setEvaluationPreferences: 'ai7:j12:set-evaluation-preferences',
  inspectSeriesList: 'ai7:j13:inspect-series-list',
  createSeries: 'ai7:j13:create-series',
  inspectSeries: 'ai7:j13:inspect-series',
  previewSeriesMembershipChange: 'ai7:j13:preview-series-membership-change',
  changeSeriesMembership: 'ai7:j13:change-series-membership',
  inspectBookSeries: 'ai7:j13:inspect-book-series',
  proposeSeriesKnowledge: 'ai7:j13:propose-series-knowledge',
  inspectSeriesKnowledgeReview: 'ai7:j13:inspect-series-knowledge-review',
  editSeriesKnowledgeCandidate: 'ai7:j13:edit-series-knowledge-candidate',
  promoteSeriesKnowledge: 'ai7:j13:promote-series-knowledge',
  inspectDataVersion: 'ai7:j12:inspect-data-version',
  chooseDatabaseExportDestination: 'ai7:j12:choose-database-export-destination',
  approveDatabaseExport: 'ai7:j12:approve-database-export',
  inspectDatabaseExports: 'ai7:j12:inspect-database-exports',
  applyChangeSuggestion: 'ai7:j05:apply-change-suggestion',
  applyChangeSuggestionBatch: 'ai7:j05:apply-change-suggestion-batch',
  reverseAppliedChangeSuggestion: 'ai7:j05:reverse-applied-change-suggestion',
  getManuscriptApplyOutcome: 'ai7:j05:get-manuscript-apply-outcome',
  inspectProposalConflict: 'ai7:j06:inspect-proposal-conflict',
  saveProposalConflictDraft: 'ai7:j06:save-proposal-conflict-draft',
  resolveProposalConflict: 'ai7:j06:resolve-proposal-conflict',
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
  approveBookDeliveryPackageExport: 'ai7:j07:approve-book-delivery-package-export',
  inspectMaintenanceCase: 'ai7:j07:inspect-maintenance-case',
  recordMaintenanceCase: 'ai7:j07:record-maintenance-case',
  appendMaintenanceCaseRevision: 'ai7:j07:append-maintenance-case-revision',
  saveMaintenanceErrata: 'ai7:j07:save-maintenance-errata',
  createProductionDocument: 'ai7:j07:create-production-document',
  decideProductionDocumentType: 'ai7:j07:decide-production-document-type',
  saveProductionDocumentVersion: 'ai7:j07:save-production-document-version',
  recordProductionDocumentDelivery: 'ai7:j07:record-production-document-delivery',
  transitionProductionDocumentPhase: 'ai7:j07:transition-production-document-phase',
  inspectGlobalAttention: 'ai7:j09:inspect-global-attention',
  inspectBookTasks: 'ai7:j16:inspect-book-tasks',
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
 * What a source-only import retained. The second label belongs to an original the product kept
 * whole without parsing, so it claims no content or structure identity it did not derive.
 */
export type SourceImportRetainedBoundaryLabel =
  | '保留完整所选 DOCX 文件及本地解析出的完整内容与结构身份'
  | '保留完整所选原始文件及其精确身份；未进行本地解析';

/**
 * The converter a format is read through, and the format it was read from. A format with no
 * conversion is read natively; nothing else in the product may present a conversion as a native
 * read (ADR 0072 §2, §3).
 */
export interface ManuscriptConversionProjection {
  converterIdentity: string;
  sourceFormat: 'TXT' | 'MD' | 'DOC';
}

/**
 * Whether the staged file can become an editable Manuscript, why not when it cannot, and through
 * which converter when it can only be read through one.
 */
export type EditableImportProjection =
  | { available: true; conversion?: ManuscriptConversionProjection }
  | { available: false; code: 'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT'; reason: string };

export interface ImportIdentityFindingProjection {
  bookId: string;
  bookTitle: string;
  sourceVersionId: string;
  importRecordId: string;
  recordKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport';
  recordLabel: '稿件导入记录' | '来源导入记录' | '稿件重新导入记录';
  identityClass: {
    kind: 'immutable-original' | 'parsed-content-structure' | 'filename-collision';
    label: '精确原始文件身份' | '发现相同内容' | '名称相同，内容不同';
  };
}

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

export interface ManuscriptBlockProjection {
  blockId: string;
  position: number;
  kind: 'title' | 'heading' | 'paragraph';
  level: number | null;
  text: string;
  digest: string;
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
export type ProposalItemDisposition = 'accepted' | 'rejected' | 'accepted-with-edit';
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
  | { kind: 'book'; bookId: string }
  | { kind: 'revision'; revisionId: string };

export type ResolvedBookWorkbenchRoute =
  | {
      kind: 'book';
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

export interface ProductDataLocationProjection {
  platform: 'windows' | 'macos';
  platformLabel: 'Windows' | 'macOS';
  runtimeForm: 'source-checkout';
  runtimeFormLabel: '源码检出运行';
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

export interface ModelServiceBindingProjection {
  providerId: 'deepseek-open-platform';
  providerLabel: 'DeepSeek 开放平台（官方）';
  modelId: 'deepseek-v4-pro';
  modelLabel: 'DeepSeek V4 Pro High';
  adapterRevision: 1;
  configurationRevision: 1;
  approvedFallbackChain: readonly [];
  credentialSlot: 'deepseek-api-key';
}

export interface ModelServiceConnectionProjection {
  connectionId: 'main-editorial-deepseek-v4-pro';
  roleId: 'main-editorial';
  connectionName: string;
  binding: ModelServiceBindingProjection;
  credentialReference: string;
  credentialOperationState: ModelCredentialOperationState;
  createdAt: string;
  updatedAt: string;
  credentialUpdatedAt: string;
}

/**
 * The trusted operational scopes the source checkout can bind from its launch form (ADR 0065):
 * `development-ci` by default, `developer-live` only through `--trusted-operational-scope`.
 * `fixture-recording` and `ordinary-production` stay unselectable from the source checkout.
 */
export type TrustedOperationalScope = 'development-ci' | 'developer-live';
export type ProviderProcessingVersion = 'v1' | 'v5';
/** Exact Run Budget Ceiling state: `unset` under development-ci, an explicit total-token ceiling under developer-live. */
export type RunBudgetCeilingState = 'unset' | { kind: 'tokens'; maxTotalTokens: number };
/**
 * The Run Budget Ceiling a developer-live launch binds: an explicit form ceiling as a total, or the
 * Provider Processing v5 default of 30,000 tokens per frozen Coverage Manifest unit (ADR 0070),
 * resolved once the manifest freezes and before the plan does.
 */
export type DeveloperLiveCeiling =
  | { readonly kind: 'tokens'; readonly maxTotalTokens: number }
  | { readonly kind: 'tokens-per-frozen-unit'; readonly tokensPerFrozenUnit: number };
/** The execution route an analysis Run binds: the in-process deterministic adapter or the developer-live OpenCode Go route. */
export type ExecutionRouteId = 'ai7-local-deterministic' | 'opencode-go';
/** A remote Provider route a Provider Resolution Plan may name. */
export type RemoteProviderId = 'deepseek-open-platform' | 'opencode-go' | 'opencode-go-messages' | 'opencode-go-responses';
/** A logical credential slot of the Main Editorial Role. */
export type CredentialSlotId = 'deepseek-api-key' | 'opencode-go';
/** The Provider Processing pin a Provider Resolution Plan carries for its trusted scope. */
export type ProviderProcessingPin =
  | { operationalScope: 'development-ci'; version: 'v1'; decision: 'deny'; authorizedLiveTransmissionCount: 0 }
  | { operationalScope: 'developer-live'; version: 'v5'; decision: 'eligible-only'; authorizedLiveTransmissionCount: 'bounded-by-run' };
/** The policy pin a Result Set Revision records; `liveTransmissions` is the policy's bound, never a usage count. */
export type ResultSetPolicyPin =
  | { operationalScope: 'development-ci'; providerProcessingVersion: 'v1'; activePolicySetVersion: 'v5'; liveTransmissions: 0 }
  | { operationalScope: 'developer-live'; providerProcessingVersion: 'v5'; activePolicySetVersion: 'v5'; liveTransmissions: 'bounded-by-run' };

/** The three launch-form arguments the built entry accepts beside `--data-root`; carried by argv only, never by an environment variable or setting. */
export const TRUSTED_SCOPE_ARGUMENT = '--trusted-operational-scope';
export const RUN_BUDGET_CEILING_ARGUMENT = '--run-budget-ceiling';
export const PROVIDER_CACHE_ROOT_ARGUMENT = '--provider-cache-root';
export const LAUNCH_SELECTABLE_SCOPES: ReadonlyArray<TrustedOperationalScope> = ['development-ci', 'developer-live'];
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
}

export interface RawTrustedLaunchForm {
  readonly trustedOperationalScope?: string | undefined;
  readonly runBudgetCeiling?: string | undefined;
  readonly providerCacheRoot?: string | undefined;
}

export function isTrustedOperationalScope(value: string): value is TrustedOperationalScope {
  return (LAUNCH_SELECTABLE_SCOPES as ReadonlyArray<string>).includes(value);
}

/**
 * Parse the launch form exactly as every process on the launch path does: an unknown scope, a
 * malformed ceiling, a relative cache root, or a ceiling or cache root without the developer-live
 * scope yields `null`, and the caller fails closed. Absent arguments select `development-ci`.
 */
export function parseTrustedLaunchForm(raw: RawTrustedLaunchForm): TrustedLaunchForm | null {
  const scope = raw.trustedOperationalScope ?? 'development-ci';
  if (!isTrustedOperationalScope(scope)) return null;
  if (scope !== 'developer-live' && (raw.runBudgetCeiling !== undefined || raw.providerCacheRoot !== undefined)) return null;
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
  return { trustedOperationalScope: scope, runBudgetCeiling, providerCacheRoot };
}

export interface LaunchPolicyProjection {
  integrityState: 'verified' | 'denied';
  denialReason: string | null;
  operationalScope: TrustedOperationalScope | null;
  activePolicySetVersion: 'v5' | null;
  providerProcessing: {
    version: ProviderProcessingVersion | null;
    decision: 'deny' | 'eligible-only';
    /** `0` under development-ci; the verbatim token `bounded-by-run` under developer-live. */
    authorizedLiveTransmissionCount: 0 | 'bounded-by-run';
    liveTransmissionAllowed: boolean;
    /**
     * Whether the active Provider Processing policy names the cross-unit reduction's transmission
     * (ADR 0066). Optional so a denial can carry the same reading; under the verified v5 document it
     * is `true`, and anything else — absent included — means the reduction does not dispatch.
     */
    crossUnitReductionAllowed?: boolean;
    /**
     * Whether the active Provider Processing policy names the assurance sampling suboperation's
     * transmissions (ADR 0066). Read exactly as `crossUnitReductionAllowed` is: under the verified v5
     * document it is `true`; anything else — absent included — means the suboperation does not
     * dispatch at all.
     */
    assuranceSamplingAllowed?: boolean;
    /**
     * Whether the active Provider Processing policy names the Run Report's reflection turn (ADR
     * 0066 §Run Report). Read exactly as the two keys above are: under the verified v5 document it is
     * `true`; anything else — absent included — means the turn does not dispatch and the report
     * records `policy-bounded` with its reason.
     */
    runReportReflectionAllowed?: boolean;
    label: '开发与持续集成：零次实时传输' | '开发者实时：实时传输受运行边界约束';
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
  connection: ModelServiceConnectionProjection | null;
  launchPolicy: LaunchPolicyProjection;
}

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

export interface ModelServiceSettingsProjection {
  roles: readonly ModelRoleCardProjection[];
  protectedSecretStore: {
    backend: 'windows-credential-manager' | 'macos-keychain';
    label: 'Windows 凭据管理器' | 'macOS 钥匙串';
    availability: 'available' | 'unavailable';
  };
  launchPolicy: LaunchPolicyProjection;
  authorityStatement: '凭据就绪不授予模型处理、对外导出、运行、受控动作或公开发布权限。';
}

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
    sourceDigest: 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
  };
  runSourceScope: null | {
    bookId: string;
    manuscriptId: string;
    taskInputRevision: { revisionId: string; revisionDigest: string };
    readableScopeKinds: readonly ['current-book-primary-manuscript-revision'];
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
export const RUN_REPORT_USAGE_STAGES = ['units', 'cross-unit-reduction', 'assurance-sampling', 'run-report-reflection'] as const;
export type RunReportUsageStageId = (typeof RUN_REPORT_USAGE_STAGES)[number];

export interface RunReportUsageProjection {
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
  code: 'adapter-failure' | 'contract-invalid' | 'interrupted' | 'egress-refused' | 'not-attempted' | 'out-of-scope';
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
export type AnalysisAssuranceStatement =
  | typeof BASELINE_ANALYSIS_ASSURANCE_STATEMENT
  | typeof FACTUAL_REVIEW_ASSURANCE_STATEMENT
  | typeof REVIEW_CATEGORY_ASSURANCE_STATEMENT;

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
 * The review-category kind family (Issue #417, plan slice S69): one analysis kind per Review Category,
 * `editorial-review/<categoryId>`, all read under the one exact-versioned contract
 * `ai7.editorial-review/1`. The categories themselves are configuration (V2-UX-REV-002: a house may
 * add one), so nothing here — and no durable CHECK — names a category: the family is admitted by the
 * shape of its kind identity, and the category's identity, label, guideline clauses and procedure are
 * frozen into each Task's prompt contract instead.
 */
export const EDITORIAL_REVIEW_KIND_PREFIX = 'editorial-review/' as const;
export const EDITORIAL_REVIEW_CONTRACT_VERSION = 'ai7.editorial-review/1' as const;
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

/** Every analysis kind a Book may hold, and every Task mode any of them declares. */
export type AnalysisKindId = typeof BASELINE_ANALYSIS_KIND | typeof FACTUAL_REVIEW_KIND | ReviewCategoryKindId;
export type AnalysisTaskMode = BaselineAnalysisTaskMode | FactualReviewTaskMode | ReviewCategoryTaskMode;
export type AnalysisGoal = BaselineAnalysisGoal | FactualReviewGoal | ReviewCategoryGoal;

/** An explicit editor choice over exact block positions of the Task Input revision (inclusive). */
export interface BaselineAnalysisSelectedRange {
  startPosition: number;
  endPosition: number;
}

/** The update request carried by `prepareBaselineAnalysis` beside the fixed goal; `null` for the first baseline. */
export interface BaselineAnalysisUpdateRequest {
  mode: BaselineAnalysisUpdateMode;
  selectedRange: BaselineAnalysisSelectedRange | null;
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
  | 'expectedOutcome';

/** The material inputs one frozen plan version carries, re-derived from durable state for drift detection. */
export interface MaterialPlanInputsProjection {
  providerBinding: { providerId: string; modelId: string; adapterRevision: number; configurationRevision: number; credentialReference: string };
  artifactPin: { identity: string; version: string; nativeCarrierSha256: string; sidecarRevision: number; sidecarSha256: string };
  selectedRange: BaselineAnalysisSelectedRange | null;
  predecessorRevision: { revisionId: string; ordinal: number; digest: string } | null;
  runBudgetCeiling: RunBudgetCeilingState;
  outboundDataCategory: 'public-or-synthetic';
  expectedOutcome: string;
}

export type PlanRevisionDiffValue =
  | string
  | number
  | null
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
}

/** The field a Plan Revision diff names for one edited item. */
export type PlanEditField = 'steps.assurance-sampling' | 'adaptations.safe-retry';

/** The Plan Boundary Split inside the canonical envelope: declared in-envelope adaptations, material fields, and expected editor participation. */
export interface PlanBoundarySplitProjection {
  adaptable: ReadonlyArray<{ adaptationClass: 'safe-retry'; label: string; statement: string }>;
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
  adaptationClass: 'safe-retry';
  attemptIndex: number;
  classifiedReason: string;
  failureCode: string;
  failureClass: string;
  failureStatus: number | null;
  requestDigest: string;
  firstPayloadDigest: string | null;
  planEnvelopeDigest: string;
  bindingDigest: string;
  recordedAt: string;
  label: string;
}

export interface BaselineAnalysisExecutionBindingProjection {
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
  expected: AnalysisReusePlanCounts;
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

export interface BaselineAnalysisProjection {
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
    role: 'Main Editorial Role';
    capabilities: readonly [];
    remoteBinding: {
      providerId: RemoteProviderId;
      modelId: 'deepseek-v4-pro' | 'deepseek-v4-flash';
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
      | { kind: 'opencode-go'; model: 'deepseek-v4-flash'; endpoint: string }
      | { kind: 'none'; reason: 'j04-model-adapter-control-absent' };
    outboundDataCategory: 'public-or-synthetic';
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
    digest: string;
    dispatchAllowed: boolean;
    providerStatus: 'remote-denied-local-deterministic' | 'remote-denied-no-route' | 'remote-eligible-developer-live';
    summary: string;
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
    /** `default-execution-rule` when 快速开始 started the Task under a 默认执行规则 (Issue #421). */
    origin: 'standard-direct' | 'default-execution-rule';
    /** The rule version the authorization names; `null` for a standard-direct start. */
    ruleVersionId: string | null;
    authority: 'standard-direct-dispatch' | 'record-only-no-dispatch';
    authorizedAt: string;
  };
  run: null | {
    runRecordId: string;
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
      spans: ReadonlyArray<{ ordinal: number; harnessSessionId: string; startSeq: number; endSeq: number; unitOrdinal: number | null; attemptIndex: number; payloadDigest: string | null }>;
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
export type FactualExclusionReason = 'quote-not-found' | 'quote-ambiguous';

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
}

/**
 * Why a listed finding never became one. The first two are Reference Integrity's — the quotation is
 * not in the block it named, or is there more than once — and the third is a 修改建议 whose replacement
 * is exactly the text already there, which proposes nothing.
 */
export type ReviewFindingExclusionReason = 'quote-not-found' | 'quote-ambiguous' | 'replacement-identical';

/** The excluded appendix: what the model listed that the service could not anchor; never a mark. */
export interface ReviewCategoryExcludedProjection {
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
  /** New units the plan leaves out of scope: never dispatched, settled as `out-of-scope` gaps. */
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
   * `out-of-scope` is every `unreviewed` unit. The other six read exactly as the baseline plan's do.
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
  resultSetId: string;
  revisionId: string;
  ordinal: number;
  createdAt: string;
  digest: string;
  contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION;
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
  contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION;
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
  contractVersion: typeof EDITORIAL_REVIEW_CONTRACT_VERSION;
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
 * run by the block identity of each chapter's first block; every other scope names neither.
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
 */
export type ReviewRunState = 'prepared' | 'running' | 'settled' | 'partial' | 'failed';

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
  /** What a 修改建议 proposes in place of the quotation (empty proposes deleting it); `null` for a 批注. */
  replacement: string | null;
  clauseRefs: ReadonlyArray<{ documentTitle: string; clauseId: string; text: string }>;
  /** The finding's own state line, such as 事实核查's `未外部复核`; `null` when it has none. */
  stateLine: string | null;
  markId: string | null;
  markStatus: 'open' | 'resolved' | 'applied' | 'removed' | 'converted' | null;
  anchorState: 'exact' | 'drifted' | 'detached' | 'anchor-changed';
  ignoreReason: string | null;
}

/** The versioned 审阅报告 (REV-009) exactly as recorded, read back with the digest of its canonical JSON. */
export interface ReviewReportProjection {
  reportId: string;
  version: number;
  generatedAt: string;
  digest: string;
  record: ReviewReportRecord;
}

export interface ReviewReportRecord {
  schema: 'ai7.review.report/1';
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
  reviewRunId: string;
  ordinal: number;
  label: string;
  createdAt: string;
  state: ReviewRunState;
  stateLabel: string;
  /** 继续审阅 is offered exactly when an authorized Run stopped with categories never finished. */
  canContinue: boolean;
  scope: { kind: ReviewScopeKind; label: string; selectedRange: BaselineAnalysisSelectedRange | null };
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
  findings: ReadonlyArray<ReviewFindingProjection>;
  /** How many findings pass the filters, before any page is taken; unfiltered, every finding of the Run. */
  findingsTotal: number;
  /** Whether findings that pass the filters remain after this page. */
  findingsTruncated: boolean;
  /** Every finding of the Run by severity and status, whatever the filters and the page: a filter is a view (FIND-003). */
  findingCounts: ReviewFindingCountsProjection;
  report: ReviewReportProjection | null;
  reportVersions: ReadonlyArray<{ reportId: string; version: number; generatedAt: string; digest: string }>;
}

/**
 * The 审阅 destination of one Book (V2-UX-REV-001 to REV-013): the configured categories with their
 * basis, the coverage matrix, the scope options, the 审阅记录, and the opened Run.
 */
export interface ReviewWorkspaceProjection {
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
  /** The last ordinal the previous page ended at; `null` starts at the first finding. */
  findingsAfterOrdinal: number | null;
  categoryId: string | null;
  severity: ReviewFindingSeverity | null;
  status: ReviewFindingStatus | null;
  /** The chapter option (`ReviewChapterOptionProjection.blockId`) a finding falls in. */
  chapterBlockId: string | null;
}
/** The optional keys an inspection of the 审阅 workspace may carry beside the Book and the Run. */
export const REVIEW_FINDING_PAGE_KEYS = ['findingsAfterOrdinal', 'categoryId', 'severity', 'status', 'chapterBlockId'] as const satisfies
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

export interface PrepareReviewRunInput {
  bookId: string;
  categoryIds: ReadonlyArray<string>;
  scope: ReviewRunScopeRequest;
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
 * slice that brings its ledger; nothing here is an authority record of its own.
 */
export type TaskPlanKind = 'fixed-task' | 'baseline-analysis' | 'review-run';
export const TASK_PLAN_KINDS: readonly TaskPlanKind[] = ['fixed-task', 'baseline-analysis', 'review-run'];

/** Which plan the drawer reads. The Book is always the route's; the renderer never names it. */
export interface InspectTaskPlanInput {
  bookId: string;
  kind: TaskPlanKind;
  /**
   * The Task: its Task Intent for the fixed task and the baseline analysis, its Review Run for a review.
   * `null` reads the Book's current Task of the kind; a review is always named.
   */
  ref: string | null;
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
   * when that progress no longer reads back — and `null` while it runs.
   */
  continuation: { unitsSettled: number | null; unitsTotal: number } | null;
  /**
   * 模型服务账户限额 (Issue #51, S16b; V2-UX-MODEL-018): the provider's account limit stopped the Run — at the reading range it
   * refused, or `null` for the reduction or the sample after them — with the refusal as AI7 classified it; `续行` goes on
   * in the same Run once the condition clears. `null` for every other Run.
   */
  accountLimit: null | { unitOrdinal: number | null; condition: string };
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
export type TaskPlanStartReadiness = 'ready' | 'record-only' | 'no-route' | 'needs-connection' | 'changed' | 'offline' | 'started';

/**
 * What one Reconnect Preflight did (Issue #502; OFF-007, OFF-008, OFF-009): each waiting Run is admitted to the
 * one execution slot when the model service can be reached and nothing material moved, blocked with its reason
 * when something material did, or left waiting — for the network, for the model connection, or for the slot.
 */
export interface ReconnectPreflightProjection {
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
  bookId: string;
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
  /** 重新准备 for a waiting Run whose plan moved before it could start (Issue #536); else `null`. */
  reprepare: TaskPlanReprepareProjection | null;
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
export type ClarificationOptionId = 'retry' | 'record-gap';

/**
 * One Clarification Request of the Task's Run as the drawer's card shows it (Issue #422, S76d; V2-UX-CLAR-001 to
 * CLAR-007, INPUT-001 to INPUT-004): the question and why it is asked, what waits and what goes on, what happens after an
 * answer, the choices — none chosen, one 推荐 with its reason — and the note that may qualify one; once answered, the
 * answer as it was recorded. `unanswered` is a question whose Run ended before an answer came.
 */
export interface TaskPlanClarificationProjection {
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
  prepare: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; redoOf: string };
}

/**
 * 默认执行规则 (Issue #421, plan slice S75; V2-UX-TASK-017, TASK-019, TASK-020, TASK-028, AUTH-009): the task
 * patterns a rule may cover — the baseline analysis's two updates of the whole Book, which ask for no range.
 */
export type DefaultExecutionRulePattern = 'sync-current' | 'reanalyze-book';
export const DEFAULT_EXECUTION_RULE_PATTERNS: readonly DefaultExecutionRulePattern[] = ['sync-current', 'reanalyze-book'];

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
  taskKind: 'baseline-analysis';
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

export interface DefaultExecutionRulesProjection {
  /** Every rule of every Book, the Book's rules together, active before turned off. */
  rules: ReadonlyArray<DefaultExecutionRuleProjection>;
  /** The page's statement: a rule starts nothing by itself. */
  statement: string;
}

// ---- 知识库 › 审阅规范文件 (Issue #427, plan slice S79a; V2-UX-KB-001 to KB-003, REV-012) ----------------------------

/** The largest guideline file 导入新版本 reads: a Word document or plain text of numbered clauses. */
export const MAX_REVIEW_GUIDELINE_FILE_BYTES = 2 * 1024 * 1024;

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
  /** The Review Runs that applied exactly this version, oldest first. */
  readonly usedBy: ReadonlyArray<{ readonly bookId: string; readonly bookTitle: string; readonly reviewRunId: string; readonly reviewOrdinal: number; readonly createdAt: string }>;
}

export interface ReviewGuidelineDocumentProjection {
  readonly documentId: string;
  readonly title: string;
  /** Who issued the version that applies now: `AI7 内置默认`, or `本社` once the house imported its own. */
  readonly issuer: string;
  readonly currentOrdinal: number;
  /** The review categories that apply this document. */
  readonly appliedBy: ReadonlyArray<{ readonly categoryId: string; readonly label: string }>;
  /** The clauses of the version that applies now. */
  readonly clauses: ReadonlyArray<ReviewGuidelineClauseProjection>;
  /** Every version, newest first. */
  readonly versions: ReadonlyArray<ReviewGuidelineVersionProjection>;
  /** The Books whose latest Review Run applying this document used an older version than the current one. */
  readonly olderVersionBooks: ReadonlyArray<{ readonly bookId: string; readonly bookTitle: string; readonly ordinal: number }>;
}

export interface ReviewGuidelinesProjection {
  readonly documents: ReadonlyArray<ReviewGuidelineDocumentProjection>;
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
  /** How the clauses differ from the current version's, by number. */
  readonly changes: { readonly changed: number; readonly added: number; readonly removed: number };
}

// ---- 知识库 › 范例 (Issue #427, plan slice S79b; V2-UX-KB-004, KB-006) --------------------------------------------------

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
  /** When it came into 范例: the designation for a document delivered before it, else its delivery. */
  readonly archivedAt: string;
  /** Other versions of the document delivered before, oldest first. */
  readonly earlierVersions: ReadonlyArray<number>;
  /** The Learning Eligibility it came in with: `仅本社`, the default, asked of no one. */
  readonly eligibility: 'house-only';
}

/** A published Book in 范例: who it is attributed to, its latest 发稿版本, and its exemplars by document type. */
export interface ExemplarBookProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  readonly publicationOrdinal: number;
  readonly designatedAt: string;
  readonly exemplars: ReadonlyArray<ExemplarProjection>;
}

export interface ExemplarsProjection {
  readonly books: ReadonlyArray<ExemplarBookProjection>;
}

// ---- 知识库 › 工序与规则's expert 工序 (Issue #427, plan slice S79d; V2-UX-KB-010, REUSE-029, REUSE-030) ---------------

/** One 工序 a review category runs, named by what it does. */
export interface KnowledgeProcedureProjection {
  readonly procedureId: string;
  readonly title: string;
  readonly version: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  /** `enabled` when its category can run; `unavailable` when the category's basis does not exist yet. */
  readonly state: 'enabled' | 'unavailable';
  readonly unavailableReason: string | null;
  /** How many Review Runs applied it. */
  readonly reviewRuns: number;
}

/** A native artifact AI7 carries, in its own lifecycle words (REUSE-030). */
export interface KnowledgeArtifactProjection {
  readonly artifactId: string;
  readonly title: string;
  readonly version: string | null;
  readonly state: 'not-installed' | 'installed';
  readonly enabledBooks: number;
}

export interface KnowledgeProceduresProjection {
  readonly procedures: ReadonlyArray<KnowledgeProcedureProjection>;
  readonly artifacts: ReadonlyArray<KnowledgeArtifactProjection>;
}

// ---- 知识库 › 资料库 (Issue #427, plan slice S79c; V2-UX-KB-007, KB-002, ATTN-009, LEARN-004 to LEARN-010) --------------

/** The largest file 资料库 takes in, and the bounds of what the editor writes about one. */
export const MAX_LIBRARY_MATERIAL_BYTES = 1024 * 1024 * 1024;
export const MAX_LIBRARY_MATERIAL_TITLE_GRAPHEMES = 200;
export const MAX_LEARNING_ELIGIBILITY_REASON_GRAPHEMES = 500;

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
    | { readonly kind: 'eligibility'; readonly choice: LearningEligibilityChoice; readonly bookTitle: string | null; readonly reason: string | null };
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
    readonly decidedAt: string;
  };
  /** A decision made under an earlier attribution, which changing the attribution set aside: it is decided again. */
  readonly eligibilityReset: boolean;
  /** Whether a Task may list it under 允许参考 (KB-007): once both are decided, and eligibility not left for later. */
  readonly reference:
    | { readonly state: 'available'; readonly scope: 'book'; readonly bookTitle: string }
    | { readonly state: 'available'; readonly scope: 'house' }
    | { readonly state: 'pending' };
  /** Every decision, oldest first. */
  readonly decisions: ReadonlyArray<LibraryMaterialDecisionProjection>;
}

export interface LibraryMaterialsProjection {
  /** Newest arrival first. */
  readonly materials: ReadonlyArray<LibraryMaterialProjection>;
  /** The Books an attribution can name, by title. */
  readonly books: ReadonlyArray<{ readonly bookId: string; readonly title: string }>;
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
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly label: string; readonly fullMarks: number }>;
  readonly bands: ReadonlyArray<{ readonly band: 'excellent' | 'good' | 'adequate' | 'weak' | 'unsuitable'; readonly label: EvaluationBandLabel; readonly floor: number; readonly anchor: string }>;
  readonly risks: ReadonlyArray<{ readonly riskId: string; readonly label: string }>;
  readonly conclusions: ReadonlyArray<{ readonly conclusion: EvaluationConclusion; readonly label: string }>;
  readonly sha256: string;
}

/** 知识库 › 评估方案: each profile, and how many Evaluation Records of how many Books used it. */
export interface EvaluationProfilesProjection {
  readonly profiles: ReadonlyArray<EvaluationProfileProjection & { readonly records: number; readonly books: number }>;
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

/** The total out of the 满分 still rated, and how many items are left `不评` or unscored. */
export interface EvaluationTotalProjection {
  readonly score: number;
  readonly fullMarks: number;
  readonly notRated: number;
  readonly unscored: number;
}

export interface EvaluationRecordSummaryProjection {
  readonly recordId: string;
  readonly ordinal: number;
  /** `editing` is the editor's calibration; `finalized` is 定稿 (EVAL-001). AI7's draft state arrives with its 初评. */
  readonly state: 'editing' | 'finalized';
  readonly revisionLabel: string;
  readonly total: EvaluationTotalProjection;
  readonly conclusion: EvaluationConclusion | null;
  readonly createdAt: string;
  readonly finalizedAt: string | null;
}

/** One version compared item by item with the version it re-evaluated (EVAL-012). */
export interface EvaluationComparisonProjection {
  readonly previousOrdinal: number;
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly previous: number | 'not-rated' | null; readonly current: number | 'not-rated' | null }>;
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
}

/** ②C 评估 of one Book: its versions newest first, the one on show, and whether a version can begin. */
export interface EvaluationWorkspaceProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  /** The Book's manuscript as a new version would bind it, or `null` when the Book has none. */
  readonly manuscript: null | { readonly revisionId: string; readonly revisionLabel: string; readonly uncheckpointed: boolean };
  /** The profile a new version would snapshot. */
  readonly profile: EvaluationProfileProjection;
  readonly records: ReadonlyArray<EvaluationRecordSummaryProjection>;
  readonly record: EvaluationRecordProjection | null;
  /** `开始评估` or `重新评估`, or why neither can begin now. */
  readonly start: { readonly allowed: true; readonly kind: 'first' | 'again' } | { readonly allowed: false; readonly reason: string };
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
export type LearningMaterialKind = 'proposal-decision' | 'analysis-feedback' | 'review-disposition';
export const LEARNING_MATERIAL_KINDS: readonly LearningMaterialKind[] = ['proposal-decision', 'analysis-feedback', 'review-disposition'];

/**
 * Where a material stands (LEARN-006, LEARN-007): waiting for a decision; changed since the decision it had, which no longer
 * binds it; left for later; or decided.
 */
export type LearningMaterialState = 'pending' | 'changed' | 'deferred' | 'decided';

/** One Learning Material as its Review Card shows it (LEARN-003). */
export interface LearningMaterialProjection {
  /** The material's place: its kind and the record it comes from. */
  readonly materialKey: string;
  readonly kind: LearningMaterialKind;
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
  readonly materials: ReadonlyArray<LearningMaterialProjection>;
}

/** 质量与学习 › 学习准入: the Books with Learning Material, one Book at a time when a Book is named. */
export interface LearningMaterialsProjection {
  /** The governing basis every decision here records, in plain words (LEARN-003, LEARN-008). */
  readonly basis: string;
  readonly books: ReadonlyArray<LearningMaterialsBookProjection>;
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

// ---- 质量与学习 › 反馈记录 (Issue #61, plan slice S26c; V2-UX-FDBK-009, FDBK-010, FDBK-013) ---------------------------------

export const MAX_FEEDBACK_HISTORY_ENTRIES = 300;

/** Where one entry opens: the exact record it came from (FDBK-009), in its own Book. */
export type FeedbackHistoryTarget =
  | { readonly kind: 'mark'; readonly bookId: string; readonly manuscriptId: string; readonly branchId: string; readonly blockId: string; readonly markId: string }
  | { readonly kind: 'analysis'; readonly bookId: string; readonly revisionId: string }
  | { readonly kind: 'review'; readonly bookId: string; readonly reviewRunId: string; readonly findingId: string };

/** One piece of the editor's feedback as the history lists it. */
export interface FeedbackHistoryEntryProjection {
  readonly entryId: string;
  readonly origin: LearningMaterialKind;
  readonly bookId: string;
  /** The Editorial Dimension it is about, in the editor's words; `null` for a 修改建议, which names none. */
  readonly dimension: string | null;
  /** What the editor decided or judged: 拒绝, 修改后接受, 接受, 准确, 不准确, 不完整 or 忽略. */
  readonly signal: string;
  /** The optional reason as it stands — the alternative chosen, the editor's own words, a correction; `null` when none. */
  readonly reason: string | null;
  /** Whether a reason was given, `不说明` was said, or neither: none of them a judgment in itself (FDBK-007). */
  readonly reasonState: 'given' | 'dismissed' | 'none';
  readonly recordedAt: string;
  readonly target: FeedbackHistoryTarget;
}

/**
 * 质量与学习 › 反馈记录: every Book's feedback, newest first, with each Book's 作者 and 责编 to filter by (FDBK-013). A read that
 * asks nothing: no entry is pending, counted or reminded (FDBK-010).
 */
export interface FeedbackHistoryProjection {
  readonly books: ReadonlyArray<{ readonly bookId: string; readonly title: string; readonly authors: ReadonlyArray<string>; readonly editors: ReadonlyArray<string> }>;
  readonly entries: ReadonlyArray<FeedbackHistoryEntryProjection>;
  /** Whether older entries were left out of this read. */
  readonly truncated: boolean;
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
export interface EvaluationCalibrationProjection {
  readonly calibration: {
    /** The editor's adjustments of AI7's starting scores; AI7's 初评 arrives with S81b, so there are none yet. */
    readonly adjustments: number;
    readonly threshold: number;
    readonly enabled: boolean;
    readonly active: boolean;
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
}

export interface RecordPublicationActualsInput {
  readonly bookId: string;
  readonly expectedEntries: number;
  readonly priceFen: number;
  readonly firstPrint: number;
}

export interface SetEvaluationPreferencesInput {
  readonly expectedEntries: number;
  readonly predictionEnabled: boolean;
  readonly calibrationEnabled: boolean;
}

// ---- 书系 › 成员与共享范围 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012; ADR 0002, ADR 0036) ----------------------

/** A Series name, in characters (code points) once NFC-normalized and trimmed; its 说明 likewise. */
export const MAX_SERIES_TITLE_CHARACTERS = 40;
export const MAX_SERIES_NOTE_CHARACTERS = 500;
/** How many members, Books offered for 加入书系, and changes one Series answer lists at most. */
export const MAX_SERIES_MEMBERS_LISTED = 500;
export const MAX_SERIES_CANDIDATES_LISTED = 200;
export const MAX_SERIES_HISTORY_LISTED = 100;

export type SeriesMembershipChangeKind = 'add' | 'remove';

/** One Series as 书系 lists it. */
export interface SeriesSummaryProjection {
  readonly seriesId: string;
  readonly title: string;
  readonly note: string;
  readonly memberCount: number;
  readonly createdAt: string;
}

export interface SeriesListProjection {
  readonly series: ReadonlyArray<SeriesSummaryProjection>;
}

export interface CreateSeriesInput {
  readonly title: string;
  readonly note: string;
}

export interface SeriesCreationProjection {
  readonly seriesId: string;
  /** `已新建书系「…」`. */
  readonly completionLabel: string;
  readonly list: SeriesListProjection;
}

/** One of the preview's four consequence groups (SER-003): what changes, and what stays as it is. */
export interface SeriesImpactGroupProjection {
  readonly key: 'future-tasks' | 'runs' | 'knowledge-learning' | 'history';
  readonly title: '未来任务' | '已授权或正在运行' | '书系知识与学习' | '历史记录';
  readonly changes: ReadonlyArray<string>;
  readonly unchanged: ReadonlyArray<string>;
}

/** A Series Membership Change Record (SER-009): the Book, the Series, the change, who, when, and the impact it showed. */
export interface SeriesMembershipChangeProjection {
  readonly changeId: string;
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly kind: SeriesMembershipChangeKind;
  readonly label: '加入书系' | '移出书系';
  readonly priorMember: boolean;
  readonly newMember: boolean;
  readonly actor: '本机编辑';
  readonly recordedAt: string;
  readonly impact: ReadonlyArray<SeriesImpactGroupProjection>;
}

/** One member Book as 成员与共享范围 lists it. */
export interface SeriesMemberProjection {
  readonly bookId: string;
  readonly title: string;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  readonly joinedAt: string;
  /** The Book's latest 书系一致性审阅; `null` while it had none — and none can run before Series Knowledge reaches review. */
  readonly seriesConsistencyReview: { readonly reviewedAt: string } | null;
}

// ---- 书系知识 (Issue #63, plan slice S28b; V2-UX-SER-013 to SER-019; ADR 0036) -------------------------------------------

/** The stable knowledge classes a Series Knowledge Item belongs to (CONTEXT: Series Knowledge). */
export const SERIES_KNOWLEDGE_CLASSES = ['canon', 'characters', 'places', 'chronology', 'terminology', 'continuity', 'style', 'positioning'] as const;
export type SeriesKnowledgeClass = (typeof SERIES_KNOWLEDGE_CLASSES)[number];
export const SERIES_KNOWLEDGE_CLASS_LABELS: Readonly<Record<SeriesKnowledgeClass, string>> = {
  canon: '正典设定',
  characters: '人物',
  places: '地点',
  chronology: '时间线',
  terminology: '术语',
  continuity: '连续性规则',
  style: '共同文风',
  positioning: '定位',
};
/** Where a promoted revision may later be chosen (SER-014, SER-015): named at review, none preselected. */
export const SERIES_KNOWLEDGE_REUSE_SCOPES = ['series-tasks', 'consistency-review'] as const;
export type SeriesKnowledgeReuseScope = (typeof SERIES_KNOWLEDGE_REUSE_SCOPES)[number];
export const SERIES_KNOWLEDGE_REUSE_LABELS: Readonly<Record<SeriesKnowledgeReuseScope, string>> = {
  'series-tasks': '以后的书系范围任务都可以选用',
  'consistency-review': '只用于书系一致性审阅',
};
export const MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS = 40;
export const MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS = 2_000;
/** How many items and open candidates one Series answer lists at most. */
export const MAX_SERIES_KNOWLEDGE_LISTED = 200;
export const SERIES_KNOWLEDGE_CONFLICT_LABEL = '存在书系知识冲突 · 需要处理' as const;

/** The Series Knowledge Item a candidate proposes: a new one, named and classed, or one exact existing item. */
export type SeriesKnowledgeTarget =
  | { readonly kind: 'new'; readonly subject: string; readonly knowledgeClass: SeriesKnowledgeClass }
  | { readonly kind: 'existing'; readonly itemId: string };

/** The exact span of a member Book's working manuscript a candidate cites, as the editor selected it (SER-013). */
export interface SeriesKnowledgeSpanInput {
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly windowStartBlockId: string;
  readonly baseRevisionId: string;
  readonly expectedJournalSequence: number;
  readonly blockId: string;
  readonly baseBlockDigest: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly selectedText: string;
}

export interface ProposeSeriesKnowledgeInput {
  readonly seriesId: string;
  readonly target: SeriesKnowledgeTarget;
  readonly content: string;
  /** `null` for the editor's own words; the exact span of a member Book's manuscript otherwise. */
  readonly span: SeriesKnowledgeSpanInput | null;
}

/** Where a provenance-bound candidate came from: one member Book's manuscript, at an exact revision and journal position. */
export interface SeriesKnowledgeProvenanceProjection {
  readonly kind: 'manuscript-revision';
  readonly bookId: string;
  readonly bookTitle: string;
  readonly manuscriptId: string;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly journalSequence: number;
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly quote: string;
}

/** A disclosed conflict (SER-016), found by identity: the same item or name, never by meaning. */
export interface SeriesKnowledgeConflictProjection {
  readonly kind: 'existing-item' | 'competing-candidate' | 'item-updated';
  readonly line: string;
}

export interface SeriesKnowledgeTargetProjection {
  readonly kind: 'new' | 'existing';
  readonly itemId: string | null;
  readonly subject: string;
  readonly knowledgeClass: SeriesKnowledgeClass;
  readonly classLabel: string;
  /** For an existing item: the revision the candidate was written against. */
  readonly baseRevisionOrdinal: number | null;
}

/** A Series Knowledge Candidate as it stands: non-authoritative, read by no Task (SER-014). */
export interface SeriesKnowledgeCandidateProjection {
  readonly candidateId: string;
  readonly version: number;
  readonly target: SeriesKnowledgeTargetProjection;
  readonly content: string;
  readonly authoring: 'editor' | 'manuscript-revision';
  readonly provenance: SeriesKnowledgeProvenanceProjection | null;
  readonly recordedAt: string;
  readonly conflicts: number;
}

/** One immutable Series Knowledge Revision with the decision that made it (SER-017). */
export interface SeriesKnowledgeRevisionProjection {
  readonly revisionId: string;
  readonly ordinal: number;
  readonly content: string;
  readonly authoring: 'editor' | 'manuscript-revision';
  readonly provenance: SeriesKnowledgeProvenanceProjection | null;
  /** The conflicts the editor chose to keep with this revision; never a verification. */
  readonly conflicts: ReadonlyArray<SeriesKnowledgeConflictProjection>;
  readonly reuseScope: SeriesKnowledgeReuseScope;
  readonly reuseLabel: string;
  readonly decisionId: string;
  readonly outcome: 'created' | 'updated';
  readonly recordedAt: string;
}

/** A stable Series Knowledge Item and its revisions, newest first. */
export interface SeriesKnowledgeItemProjection {
  readonly itemId: string;
  readonly subject: string;
  readonly knowledgeClass: SeriesKnowledgeClass;
  readonly classLabel: string;
  readonly createdAt: string;
  readonly revisions: ReadonlyArray<SeriesKnowledgeRevisionProjection>;
}

export interface SeriesKnowledgeProjection {
  readonly items: ReadonlyArray<SeriesKnowledgeItemProjection>;
  readonly itemsTruncated: boolean;
  readonly candidates: ReadonlyArray<SeriesKnowledgeCandidateProjection>;
  readonly candidatesTruncated: boolean;
}

/**
 * 书系 › one Series › 成员与共享范围 (SER-001): its member Books, the Books that may be added, and every membership change,
 * newest first, and its Series Knowledge (Issue #63, S28b). It is not a reader of the member manuscripts.
 */
export interface SeriesProjection {
  readonly seriesId: string;
  readonly title: string;
  readonly note: string;
  readonly createdAt: string;
  readonly members: ReadonlyArray<SeriesMemberProjection>;
  readonly membersTruncated: boolean;
  readonly candidates: ReadonlyArray<{ readonly bookId: string; readonly title: string }>;
  readonly candidatesTruncated: boolean;
  readonly history: ReadonlyArray<SeriesMembershipChangeProjection>;
  readonly historyTruncated: boolean;
  readonly knowledge: SeriesKnowledgeProjection;
}

export interface SeriesKnowledgeProposalProjection {
  readonly candidateId: string;
  /** `已提议为书系「…」的知识候选项`. */
  readonly completionLabel: string;
  readonly series: SeriesProjection;
}

/**
 * 书系知识纳入审阅 (SER-015 to SER-019): the exact Series and item, the candidate's content and provenance, the item's current
 * revision when it would be superseded, the disclosed conflicts, and where it may later be used — none preselected.
 */
export interface SeriesKnowledgeReviewProjection {
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly candidate: SeriesKnowledgeCandidateProjection;
  readonly current: SeriesKnowledgeRevisionProjection | null;
  readonly conflicts: ReadonlyArray<SeriesKnowledgeConflictProjection>;
  readonly conflictLabel: typeof SERIES_KNOWLEDGE_CONFLICT_LABEL | null;
  readonly reuseScopes: ReadonlyArray<{ readonly scope: SeriesKnowledgeReuseScope; readonly label: string }>;
  /** Why the candidate cannot be taken in at all now, or `null`. */
  readonly blocked: string | null;
  readonly reviewDigest: string;
  readonly actionLabel: '纳入书系知识';
}

export interface EditSeriesKnowledgeCandidateInput {
  readonly seriesId: string;
  readonly candidateId: string;
  readonly expectedVersion: number;
  readonly target: SeriesKnowledgeTarget;
  readonly content: string;
}

export interface PromoteSeriesKnowledgeInput {
  readonly seriesId: string;
  readonly candidateId: string;
  readonly candidateVersion: number;
  readonly reviewDigest: string;
  readonly reuseScope: SeriesKnowledgeReuseScope;
  /** `preserved` only when the review disclosed a conflict and the editor chose 保留已披露冲突. */
  readonly conflictDisposition: 'none' | 'preserved';
}

// ---- 设置 › 数据与存储 › 版本 (Issue #433, plan slice S85a; V2-UX-DSTO-016; ADR 0079 §1) ---------------------------------

/** One record of the versions that opened the store. */
export interface StoreVersionProjection {
  readonly softwareVersion: string;
  readonly dataVersion: number;
  readonly schemaRevision: number;
  readonly recordedAt: string;
}

/**
 * 设置 › 数据与存储's 版本 (DSTO-016): the software version and the Data Version apart, whether the Data Version is frozen yet,
 * the latest software update and whether it kept the Data Version, and the records of the versions that opened the store.
 */
export interface DataVersionProjection {
  readonly softwareVersion: string;
  readonly dataVersion: number;
  readonly frozen: boolean;
  readonly schemaRevision: number;
  readonly update: {
    readonly from: string;
    readonly to: string;
    readonly fromDataVersion: number;
    readonly toDataVersion: number;
    readonly recordedAt: string;
  } | null;
  readonly history: ReadonlyArray<StoreVersionProjection>;
  readonly historyTruncated: boolean;
}

// ---- 设置 › 数据与存储 › 导出数据库 (Issue #434, plan slice S86a; V2-UX-DSTO-017; ADR 0079 §1.4, §1.6, §1.7) -------------

/** At most this many database exports are listed, newest first. */
export const MAX_DATABASE_EXPORTS_LISTED = 20;

/** What a database package holds, counted when it is made. */
export interface DatabaseExportContentsProjection {
  readonly books: number;
  readonly sourceVersions: number;
  readonly libraryMaterials: number;
  readonly series: number;
}

/**
 * One prepared database export (DSTO-017; EXP-012 to EXP-021): the package with its size, Data Version and contents, the file
 * it would create or replace, and — once approved — what the write came to.
 */
export interface DatabaseExportPreparationProjection {
  readonly preparationId: string;
  readonly fileName: string;
  readonly destination: string;
  readonly disposition: ManuscriptExportDisposition;
  readonly dispositionLabel: string;
  readonly payloadBytes: number;
  readonly dataVersion: number;
  readonly softwareVersion: string;
  readonly contents: DatabaseExportContentsProjection;
  readonly preparedAt: string;
  readonly receipt: DatabaseExportReceiptProjection | null;
}

/**
 * What one approved database export came to: a verified created or replaced file — `已导出到所选位置` — or `未能导出` when
 * nothing at the destination changed, or `结果待确认` when AI7 cannot tell, which never retries by itself.
 */
export interface DatabaseExportReceiptProjection {
  readonly preparationId: string;
  readonly fileName: string;
  readonly destination: string;
  readonly approvedAt: string;
  readonly outcome: 'created' | 'replaced' | 'ambiguous' | 'failed';
  readonly outcomeLabel: string;
  readonly detail: string;
  readonly byteLength: number | null;
  readonly recordedAt: string | null;
}

/** The approved database exports, newest first, and how many there are. */
export interface DatabaseExportsProjection {
  readonly exports: ReadonlyArray<DatabaseExportReceiptProjection>;
  readonly total: number;
}

export interface SeriesKnowledgePromotionProjection {
  readonly itemId: string;
  readonly revisionId: string;
  readonly completionLabel: '书系知识已纳入' | '书系知识已更新';
  readonly series: SeriesProjection;
}

export interface PreviewSeriesMembershipChangeInput {
  readonly seriesId: string;
  readonly bookId: string;
  readonly kind: SeriesMembershipChangeKind;
}

/** The Series Membership Impact Preview (SER-003 to SER-008): exact identities first, then the four groups, then the one action. */
export interface SeriesMembershipPreviewProjection {
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly kind: SeriesMembershipChangeKind;
  readonly actionLabel: '加入书系' | '移出书系';
  readonly groups: ReadonlyArray<SeriesImpactGroupProjection>;
  /** What the commit names so a changed membership or governing record refuses it (SER-010). */
  readonly previewDigest: string;
}

export interface ChangeSeriesMembershipInput {
  readonly seriesId: string;
  readonly bookId: string;
  readonly kind: SeriesMembershipChangeKind;
  readonly previewDigest: string;
}

export interface SeriesMembershipChangeResultProjection {
  readonly changeId: string;
  /** `已加入书系「…」：《…》` or `已移出书系「…」：《…》`. */
  readonly completionLabel: string;
  readonly series: SeriesProjection;
}

/** A Book's side of 书系 (SER-009): the Series it is in now and every change of its membership, newest first. */
export interface BookSeriesProjection {
  readonly bookId: string;
  readonly memberships: ReadonlyArray<{ readonly seriesId: string; readonly title: string; readonly joinedAt: string }>;
  readonly history: ReadonlyArray<SeriesMembershipChangeProjection>;
  readonly historyTruncated: boolean;
}

/** The drawer's `设为快速开始默认…` for one plan, and the rule that started its Task, when one did. */
export interface TaskPlanDefaultRuleProjection {
  canSet: boolean;
  /** Why the plan cannot be set as the quick-start default, in the editor's words; `null` when it can. */
  reason: string | null;
  /** The exact Plan Envelope a set binds — the plan on show; `null` when it cannot be set. */
  planEnvelopeDigest: string | null;
  /** The Book's rule for this plan's pattern — in force or turned off — and whether this plan set it; `null` when none was set. */
  current: null | (DefaultExecutionRuleReference & { state: 'active' | 'deactivated'; fromThisPlan: boolean });
  /** What a rule set from this plan binds, in the editor's words: the confirmation lists exactly these. */
  binds: ReadonlyArray<{ label: string; value: string }>;
  /** The rule version 快速开始 started this Task under; `null` for a Task started from its plan. */
  startedBy: null | DefaultExecutionRuleReference;
}

/** What one quick start did: started the Task under the rule, or stopped at the plan with the reasons. */
export interface QuickStartBaselineAnalysisResult {
  outcome: 'started' | 'fell-back';
  /** Why the Task was not started, in the editor's words; empty once it started. */
  reasons: ReadonlyArray<string>;
  projection: BaselineAnalysisProjection;
}

/** Every analysis projection, discriminated on `kind`. */
export type AnalysisProjection = BaselineAnalysisProjection | FactualReviewProjection | ReviewCategoryProjection;

export interface HistoricalRevisionProjection {
  mode: 'historical-revision';
  readOnly: true;
  bookId: string;
  bookTitle: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  parentRevisionId: string | null;
  sourceVersionId: string;
  createdAt: string;
  previousCursor: string | null;
  nextCursor: string | null;
  position: {
    startBlock: number;
    endBlock: number;
    totalBlocks: number;
    startCharacter: number;
    endCharacter: number;
    totalCharacters: number;
    structureLabel: string | null;
    label: string;
  };
  blocks: ReadonlyArray<ManuscriptBlockProjection>;
}

export type ManuscriptWindowTarget =
  | { kind: 'start' }
  | { kind: 'cursor'; cursor: string }
  | { kind: 'block'; blockId: string }
  | { kind: 'window-start'; blockId: string }
  | { kind: 'character'; character: number }
  | { kind: 'proportion'; proportion: number };

export interface OutlineEntryProjection {
  outlineId: string;
  blockId: string;
  kind: 'title' | 'heading';
  level: number;
  text: string;
  displayTextTruncated: boolean;
  character: number;
  proportion: number;
}

export interface OutlineProjection {
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  workingDigest: string;
  entries: ReadonlyArray<OutlineEntryProjection>;
  previousCursor: string | null;
  nextCursor: string | null;
}

export interface PriorWorkItemProjection {
  bookId: string;
  bookTitle: string;
  manuscriptId: string;
  branchId: string;
  branchName: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  workingDigest: string;
  totalCharacters: number;
  latestMilestone: null | { milestoneId: string; label: string; purpose: string; revisionLabel: string };
  recoveryAttention: null | {
    attentionId: string;
    attentionVersion: number;
    status: 'pending' | 'deferred';
    label: '恢复待确认状态';
  };
}

export type RecoverySelection =
  | { kind: 'journal' }
  | { kind: 'checkpoint' }
  | { kind: 'snapshot'; snapshotId: string };

export interface RecoveryCandidateProjection {
  kind: 'journal' | 'checkpoint' | 'snapshot';
  candidateId: string;
  title: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  journalSequence: number;
  durableAt: string;
  coveredChangeExtent: string;
  verification:
    | '已由 SQLite 权威记录核对'
    | '已从检查点有界重放并与 SQLite 持久工作状态核对'
    | '已独立校验快照对象';
  limitation: string;
  snapshotId: string | null;
}

export type RecoverySnapshotComparisonProjection =
  | { state: 'eligible'; candidate: RecoveryCandidateProjection & { kind: 'snapshot'; snapshotId: string } }
  | {
      state: 'unavailable';
      snapshotId: string;
      verification: '对象缺失' | '摘要不匹配' | '对象不完整';
      limitation: string;
    }
  | { state: 'none'; limitation: '没有适用的恢复快照' };

export interface RecoveryComparisonProjection {
  attentionId: string;
  attentionVersion: number;
  status: 'pending' | 'deferred';
  unresolvedCount: number;
  bookId: string;
  bookTitle: string;
  manuscriptId: string;
  branchId: string;
  branchName: string;
  lastDurableEditBoundary: {
    journalSequence: number;
    durableAt: string;
    coveredChangeExtent: string;
    uncertainty: string;
  };
  journal: RecoveryCandidateProjection & { kind: 'journal'; snapshotId: null };
  checkpoint: RecoveryCandidateProjection & { kind: 'checkpoint'; snapshotId: null };
  snapshot: RecoverySnapshotComparisonProjection;
  otherPriorWork: ReadonlyArray<PriorWorkItemProjection>;
}

export type RecoveryWindowTarget = { kind: 'start' } | { kind: 'after'; position: number };

export interface RecoveryWindowProjection {
  attentionId: string;
  selection: RecoverySelection;
  title: string;
  revisionId: string;
  revisionLabel: string;
  readonly: true;
  blocks: ReadonlyArray<ManuscriptBlockProjection>;
  nextTarget: RecoveryWindowTarget | null;
}

export interface RecoveryDeferralProjection {
  attentionId: string;
  attentionVersion: number;
  status: 'deferred';
  completionLabel: '已保留恢复待确认状态';
  next:
    | { state: 'import'; startup: ImportStartupProjection }
    | { state: 'prior-work'; priorWork: ReadonlyArray<PriorWorkItemProjection> };
}

export interface RecoveryRestorationProjection {
  restorationId: string;
  attentionId: string;
  selected: RecoverySelection;
  sourceRevisionId: string;
  descendantRevisionId: string;
  descendantRevisionLabel: string;
  reviewStatus: '当前为恢复的工作状态';
  preservedHistoryLabel: string;
  window: ManuscriptWindowProjection;
}

export type StartupProjection =
  | { state: 'manuscript-recovery'; recovery: RecoveryComparisonProjection }
  | { state: 'import'; startup: ImportStartupProjection }
  | { state: 'prior-work'; priorWork: ReadonlyArray<PriorWorkItemProjection> };

export interface SearchMatchProjection {
  matchId: string;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  globalCharacter: number;
  headingLabel: string;
  context: string;
  rangeDigest: string;
}

export interface SearchSummaryProjection {
  searchId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
  query: string;
  scopeLabel: '全稿';
  totalMatches: number;
}

export interface SearchResultsProjection extends SearchSummaryProjection {
  results: ReadonlyArray<SearchMatchProjection>;
  previousCursor: string | null;
  nextCursor: string | null;
}

export interface ReplacementPreviewProjection {
  previewId: string;
  searchId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
  query: string;
  replacement: string;
  scopeLabel: '全稿';
  matchingRule: '精确字素匹配；从左向右；重叠时保留最早匹配';
  inclusionRule: '仅提交冻结时明确纳入的非重叠精确匹配';
  revisionLabel: string;
  totalMatches: number;
  includedMatches: number;
  excludedMatches: number;
  state: 'reviewing' | 'frozen';
  excludedMatchIds: ReadonlyArray<string>;
  representativeContexts: ReadonlyArray<SearchMatchProjection>;
}

export interface ReplacementDismissalProjection {
  previewId: string;
  state: 'cancelled';
}

export interface ReplacementCommitProjection {
  previewId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
  committedCount: number;
  completionLabel: string;
}

/**
 * The purpose of a Milestone Version (IA › Milestone Versions; V2-UX-MILE-003, MILE-009): one of the four
 * frozen purposes — 阶段留档 / 送审候选 / 交付候选 / 其他 — or the editor's own words through 自行输入. A purpose
 * states the intended next use only and grants nothing.
 *
 * The kind is not stored beside the words: a frozen purpose is stored as its own label, so every
 * milestone ever saved — the free-text purposes of rows saved before the kinds existed included — reads
 * its kind back from the words it holds (`milestonePurposeKindOf`), and a purpose typed through 自行输入
 * that is exactly a frozen label is that purpose.
 */
export type MilestonePurposeKind = 'stage-archive' | 'review-candidate' | 'delivery-candidate' | 'other' | 'custom';
export const MILESTONE_PURPOSE_KINDS: readonly MilestonePurposeKind[] = [
  'stage-archive',
  'review-candidate',
  'delivery-candidate',
  'other',
  'custom',
];
/** Each purpose's own label: the four frozen purposes, and 自行输入 for the editor's own words. */
export const MILESTONE_PURPOSE_LABELS: Readonly<Record<MilestonePurposeKind, string>> = {
  'stage-archive': '阶段留档',
  'review-candidate': '送审候选',
  'delivery-candidate': '交付候选',
  other: '其他',
  custom: '自行输入',
};
/** A purpose's words once trimmed, in UTF-16 code units: the bound the store has always kept. */
export const MAX_MILESTONE_PURPOSE_CODE_UNITS = 120;

/** The kind a stored purpose reads as: a frozen purpose by its exact label, and anything else the editor's own words. */
export function milestonePurposeKindOf(purpose: string): MilestonePurposeKind {
  return MILESTONE_PURPOSE_KINDS.find((kind) => kind !== 'custom' && MILESTONE_PURPOSE_LABELS[kind] === purpose) ?? 'custom';
}

/**
 * What a save request's purpose comes to, or `null` when it names none: a frozen purpose carries no words
 * of its own and is stored as its label; 自行输入 carries 1–120 code units once NFC-normalized and trimmed,
 * and words that are exactly a frozen label are that frozen purpose.
 */
export function resolveMilestonePurpose(kind: unknown, purpose: unknown): { kind: MilestonePurposeKind; purpose: string } | null {
  if (typeof kind !== 'string' || !MILESTONE_PURPOSE_KINDS.includes(kind as MilestonePurposeKind)) return null;
  const purposeKind = kind as MilestonePurposeKind;
  if (purposeKind !== 'custom') return purpose === null ? { kind: purposeKind, purpose: MILESTONE_PURPOSE_LABELS[purposeKind] } : null;
  if (typeof purpose !== 'string' || !purpose.isWellFormed()) return null;
  const words = purpose.normalize('NFC').trim();
  if (words.length === 0 || words.length > MAX_MILESTONE_PURPOSE_CODE_UNITS) return null;
  return { kind: milestonePurposeKindOf(words), purpose: words };
}

/** 保存里程碑版本 (V2-UX-MILE-003): a label, a purpose, and an optional note. */
export interface SaveMilestoneInput {
  manuscriptId: string;
  branchId: string;
  label: string;
  /** One of the four frozen purposes, or `custom` for 自行输入. */
  purposeKind: MilestonePurposeKind;
  /** The editor's own words for `custom`; `null` for a frozen purpose, whose label is the purpose. */
  purpose: string | null;
  note: string;
}

export interface MilestoneProjection {
  milestoneId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  label: string;
  /** The purpose as stored: a frozen purpose's label, or the editor's own words. */
  purpose: string;
  purposeKind: MilestonePurposeKind;
  note: string | null;
  createdAt: string;
  journalSequence: number;
  workingDigest: string;
  signoffRecordId: string;
  workflowEvidenceDigest: string;
  actor: '本机编辑';
  signedAt: string;
  statedNextUse: string;
  completionLabel: string;
  recoverySnapshot: {
    snapshotId: string;
    blockCount: number;
    verification: '已独立校验快照对象';
  };
}

// ---- ⑥ 交付物 · 发稿 (Issue #414, plan slice S65) --------------------------------------------------------
//
// Milestone Versions and the Publication Version belong to the primary Manuscript only (V2-UX-MILE-014).
// 设为发稿版本 is one deterministic, local interaction over one exact milestone; it publishes, sends and
// delivers nothing (V2-UX-PUB-008, PUB-009). The words below are the service's, so the surface shows
// exactly what the records mean.

/** The fixed sentence beside 设为发稿版本 (V2-UX-PUB-004): what a designation means, and what AI7 will not do. */
export const PUBLICATION_VERSION_STATEMENT = '仅表示此版本可用于上述发稿范围；AI7 不会发布或发送' as const;
/** How the milestone the current 发稿版本 designates is marked in the list (interaction spec › Publication Version). */
export const PUBLICATION_VERSION_LABEL = '发稿版本' as const;
/** The Publication Version Change Notice: the manuscript changed after the current designation (V2-UX-PUB-006). */
export const PUBLICATION_CHANGE_NOTICE = '自发稿版本后有修改' as const;
/** Why 设为发稿版本 cannot be offered yet: it designates an existing milestone, never the current text (PUB-002). */
export const PUBLICATION_NEEDS_MILESTONE = '先保存里程碑版本' as const;
export const PUBLICATION_NEEDS_MANUSCRIPT = '先导入稿件，再保存里程碑版本' as const;
/**
 * The pending line a designation leaves in the 发稿 block: the reminder to enter the 定价与首印 actuals
 * (V2-UX-EVAL-010). It is recorded now and offers no action until the evaluation features take it up.
 */
export const PUBLICATION_ACTUALS_PROMPT_LABEL = '录入定价与首印' as const;
export const PUBLICATION_ACTUALS_PROMPT_STATE = '尚未录入' as const;
/** The line once the editor entered the 发稿版本's actuals (Issue #430, S82). */
export const PUBLICATION_ACTUALS_RECORDED_STATE = '已录入' as const;
/** Words AI7 never uses for a Publication Version (V2-UX-PUB-009): no projection of 交付物 contains them. */
export const PUBLICATION_FORBIDDEN_WORDS = ['已发布', '已发送', '已交付', '已确认送达'] as const;
/** 发稿范围 and 依据, in characters (code points) once NFC-normalized and trimmed. */
export const MAX_PUBLICATION_SCOPE_CHARACTERS = 80;
export const MAX_PUBLICATION_BASIS_CHARACTERS = 500;
/**
 * The most milestones and designations one 交付物 answer lists, newest first. At its widest a listed
 * milestone weighs about 2.8 KB on the wire and a designation about 3.3 KB, so both lists together stay
 * under 400 KB of the frame; an older milestone stays designatable by its identity.
 */
export const MAX_DELIVERABLE_MILESTONES = 100;
export const MAX_PUBLICATION_VERSIONS_LISTED = 30;

/**
 * What a designation leaves for later slices, recorded in the same interaction: the prompt to enter the
 * 定价与首印 actuals (V2-UX-EVAL-010) and the archiving of the Book's 审稿意见 into 范例 (V2-UX-KB-006).
 */
export type PublicationEventKind = 'actuals-prompt' | 'exemplar-archive';
export const PUBLICATION_EVENT_KINDS: readonly PublicationEventKind[] = ['actuals-prompt', 'exemplar-archive'];

/** `自「标签」后有修改` (V2-UX-MILE-007): the manuscript changed after this milestone. */
export function milestoneChangedSinceLabel(label: string): string {
  return `自「${label}」后有修改`;
}

/** The completion of 设为发稿版本 (interaction spec › Publication-version rules): the exact version and scope. */
export function publicationDesignatedLabel(milestoneLabel: string, revisionLabel: string, scope: string): string {
  return `已设为发稿版本 · 「${milestoneLabel}」 · ${revisionLabel} · ${scope}`;
}

/** An identical repeat of the current designation records nothing and says so. */
export function publicationUnchangedLabel(milestoneLabel: string, revisionLabel: string, scope: string): string {
  return `已是当前发稿版本 · 「${milestoneLabel}」 · ${revisionLabel} · ${scope}`;
}

/**
 * 发稿范围 or 依据 as it is recorded, or `null` when it cannot be: well formed, NFC-normalized and trimmed,
 * and 1 to `maximum` characters counted as code points — as SQLite's `length()` counts them.
 */
export function publicationText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' || !value.isWellFormed()) return null;
  const text = value.normalize('NFC').trim();
  const characters = [...text].length;
  return characters >= 1 && characters <= maximum ? text : null;
}

/** One Milestone Version of the Book's primary Manuscript as 交付物 lists it (V2-UX-MILE-008). */
export interface MilestoneListItemProjection {
  milestoneId: string;
  label: string;
  purposeKind: MilestonePurposeKind;
  /** What the purpose reads as: a frozen purpose's own label, or the editor's own words. */
  purposeLabel: string;
  revisionId: string;
  /** The exact revision the milestone designates, `rN`. */
  revisionLabel: string;
  actor: '本机编辑';
  createdAt: string;
  note: string | null;
  /** Whether the manuscript changed after this milestone (V2-UX-MILE-007). Nothing here marks a milestone final (MILE-006). */
  changedSince: boolean;
  /** `自「标签」后有修改` exactly when `changedSince`. */
  changedSinceLabel: string | null;
  /** `发稿版本` on the milestone the current Publication Version designates; `null` on every other. */
  designation: null | { publicationVersionId: string; label: typeof PUBLICATION_VERSION_LABEL };
  /** 查看技术详情 only: the internal Signoff Record saved with the milestone (MILE-005). */
  technical: { signoffRecordId: string };
}

/** One 设为发稿版本 as recorded (V2-UX-PUB-003, PUB-007): append-only, and never retargeted. */
export interface PublicationVersionProjection {
  publicationVersionId: string;
  /** 第 N 次 设为发稿版本 of this Book. */
  ordinal: number;
  /** The newest designation of the Book is its current 发稿版本. */
  current: boolean;
  milestoneId: string;
  milestoneLabel: string;
  revisionId: string;
  revisionLabel: string;
  scope: string;
  basis: string;
  actor: '本机编辑';
  createdAt: string;
  /** 查看技术详情 only: the exact identities behind the designation, never ordinary editorial wording. */
  technical: {
    revisionDigest: string;
    digest: string;
    /** The separately identified internal Public Release Permission recorded with the designation. */
    permissionId: string;
    events: ReadonlyArray<{ eventId: string; kind: PublicationEventKind }>;
  };
  /** Its 维护事项 (Issue #426, S68a; MAINT-001): the cases bound to this exact designation, and the internal states they set. */
  maintenance: PublicationMaintenanceProjection;
}

// ---- 维护事项 (Issue #426, plan slice S68a; V2-UX-MAINT-001 to 011, ADR 0040) ----------------------------------------

/** The six classifications (MAINT-002), in the order the form shows them, none preselected. */
export type MaintenanceClassification = 'correction' | 'errata' | 'supersession' | 'withdrawal' | 'reissue' | 'archive';
export const MAINTENANCE_CLASSIFICATIONS: readonly MaintenanceClassification[] = [
  'correction', 'errata', 'supersession', 'withdrawal', 'reissue', 'archive',
];
/** A case's status as its newest revision records it (MAINT-007, MAINT-011). */
export type MaintenanceCaseStatus = 'unresolved' | 'waiting' | 'complete';
/** What one revision of a case recorded (MAINT-003): the case itself, a link, a 勘误 version, or a conclusion. */
export type MaintenanceCaseStep = 'recorded' | 'proposal-linked' | 'publication-linked' | 'errata-saved' | 'concluded';
/** The step a case offers next, named by the action the case shows for it. */
export type MaintenanceNextStep = 'link-proposal' | 'link-publication' | 'write-errata' | 'conclude';

/** 原因, 依据 and a conclusion's 结论说明, in characters (code points) once NFC-normalized and trimmed. */
export const MAX_MAINTENANCE_REASON_CHARACTERS = 500;
export const MAX_MAINTENANCE_EVIDENCE_CHARACTERS = 500;
/** One 勘误 version's words. */
export const MAX_MAINTENANCE_ERRATA_CHARACTERS = 4000;
/** At most this many cases of one designation are listed on 交付物, newest first; the count says how many there are. */
export const MAX_MAINTENANCE_CASES_LISTED = 5;
/** At most this many revisions of one case are read; the count says how many there are. */
export const MAX_MAINTENANCE_REVISIONS_LISTED = 60;
/** At most this many 修改建议 are offered to 关联. */
export const MAX_MAINTENANCE_PROPOSALS_OFFERED = 20;

/** One case as its designation lists it: what it is, where it stands and what it asks next. */
export interface MaintenanceCaseSummaryProjection {
  caseId: string;
  /** 第 N 项维护事项 of the Book. */
  ordinal: number;
  classification: MaintenanceClassification;
  classificationLabel: string;
  status: MaintenanceCaseStatus;
  statusLabel: string;
  nextStep: MaintenanceNextStep | null;
  revisions: number;
  recordedAt: string;
  latestAt: string;
}

/** A designation's 维护事项, as far as 交付物's one read carries them. */
export interface PublicationMaintenanceProjection {
  cases: ReadonlyArray<MaintenanceCaseSummaryProjection>;
  total: number;
  /** A 撤回 case holds it: in AI7 it is no longer used for 发稿 (ADR 0040), and it stays readable. */
  withdrawn: boolean;
  /** An 归档 case holds it: its maintenance is closed; its use and its history are unchanged. */
  archived: boolean;
}

/** What one revision links (MAINT-010), in the linked record's own words; linking grants the case nothing. */
export type MaintenanceCaseLinkProjection =
  | { kind: 'proposal'; markId: string; label: string; stateLabel: string }
  | { kind: 'publication-version'; publicationVersionId: string; label: string }
  | { kind: 'errata'; errataVersionId: string; version: number; body: string };

/** One immutable revision of a case, on its timeline (MAINT-003, MAINT-010). */
export interface MaintenanceCaseRevisionProjection {
  revision: number;
  step: MaintenanceCaseStep;
  stepLabel: string;
  status: MaintenanceCaseStatus;
  statusLabel: string;
  reason: string | null;
  evidence: string | null;
  link: MaintenanceCaseLinkProjection | null;
  actor: '本机编辑';
  recordedAt: string;
  /** 查看技术详情 only. */
  digest: string;
}

/** One 维护事项 in its workspace: its target, its timeline oldest first, and what it offers next. */
export interface MaintenanceCaseProjection {
  bookId: string;
  caseId: string;
  ordinal: number;
  classification: MaintenanceClassification;
  classificationLabel: string;
  /** What the classification does, in the editor's words (ADR 0040). */
  consequence: string;
  /** 撤回 and 归档 only: MAINT-008's sentence, standing with the case. */
  internalOnly: string | null;
  /** The exact designation it is bound to, never retargeted. */
  target: { publicationVersionId: string; ordinal: number; label: string; revisionId: string; revisionLabel: string };
  status: MaintenanceCaseStatus;
  statusLabel: string;
  nextStep: MaintenanceNextStep | null;
  revisions: ReadonlyArray<MaintenanceCaseRevisionProjection>;
  revisionsTotal: number;
  /** The newest 勘误 version, with how many there are; `null` before the first. */
  errata: null | { errataVersionId: string; version: number; body: string; recordedAt: string };
  /** What 关联… offers: the manuscript's 修改建议 made after the designation, and the designations after it. */
  choices: {
    proposals: ReadonlyArray<{ markId: string; label: string; stateLabel: string; createdAt: string }>;
    publications: ReadonlyArray<{ publicationVersionId: string; label: string }>;
  };
  /** The revision the editor read: the next step names it, and a step against another is refused. */
  expectedRevision: number;
  technical: { caseDigest: string };
}

/** `记录维护事项` (MAINT-002, MAINT-003): one case and its first revision, bound to one exact designation. */
export interface RecordMaintenanceCaseInput {
  bookId: string;
  publicationVersionId: string;
  classification: MaintenanceClassification;
  reason: string;
  evidence: string | null;
}

export interface InspectMaintenanceCaseInput {
  bookId: string;
  caseId: string;
}

/** One later step of a case, appended as its next revision against the one the editor read. */
export type MaintenanceCaseStepInput =
  | { kind: 'link-proposal'; markId: string }
  | { kind: 'link-publication'; publicationVersionId: string }
  | { kind: 'conclude'; status: 'unresolved' | 'complete'; outcome: string };

export interface AppendMaintenanceCaseRevisionInput {
  bookId: string;
  caseId: string;
  expectedRevision: number;
  step: MaintenanceCaseStepInput;
}

/** `保存勘误版本` (MAINT-005): the 勘误's next version, linked by the case's next revision. */
export interface SaveMaintenanceErrataInput {
  bookId: string;
  caseId: string;
  expectedRevision: number;
  body: string;
}

/** What a step came to: the case as it stands and the completion words (`维护事项已记录` or `维护事项结论已记录`). */
export interface MaintenanceCaseResultProjection {
  bookId: string;
  maintenanceCase: MaintenanceCaseProjection;
  completion: string;
}

/**
 * The 录入定价与首印 line the current designation leaves (EVAL-010): `尚未录入` until the editor enters the actuals for this
 * 发稿版本 in 设置 › 评估校准与预测 (Issue #430, S82), then `已录入` with them.
 */
export interface PublicationActualsPromptProjection {
  eventId: string;
  publicationVersionId: string;
  label: typeof PUBLICATION_ACTUALS_PROMPT_LABEL;
  stateLabel: typeof PUBLICATION_ACTUALS_PROMPT_STATE | typeof PUBLICATION_ACTUALS_RECORDED_STATE;
  recordedAt: string;
  /** The actuals entered for this 发稿版本; `null` while none were. */
  actuals: PublicationActualsProjection | null;
}

/**
 * The 交付物 destination of one Book, as far as S65 reaches: the 发稿 · 稿件 block (⑥) — the Manuscript's
 * milestones, 设为发稿版本 and what followed it. Production Documents and the 图书交付包 are later slices'.
 */
export interface DeliverablesProjection {
  bookId: string;
  bookTitle: string;
  /** The Book's primary Manuscript as it stands now; `null` for a Book without one. */
  manuscript: null | { manuscriptId: string; branchId: string; revisionId: string; revisionLabel: string; journalSequence: number; workingDigest: string };
  publication: {
    /** The milestones newest first, at most `MAX_DELIVERABLE_MILESTONES`; none is preselected or final. */
    milestones: ReadonlyArray<MilestoneListItemProjection>;
    milestonesTruncated: boolean;
    /** Every designation newest first, at most `MAX_PUBLICATION_VERSIONS_LISTED`; the first is the current 发稿版本. */
    designations: ReadonlyArray<PublicationVersionProjection>;
    designationsTruncated: boolean;
    /** `自发稿版本后有修改` once the manuscript changed after the current designation's exact revision. */
    changeNotice: null | { label: typeof PUBLICATION_CHANGE_NOTICE; publicationVersionId: string; revisionLabel: string };
    /** Whether 设为发稿版本 can be offered, and why not. */
    designate: { available: boolean; unavailableReason: string | null };
    statement: typeof PUBLICATION_VERSION_STATEMENT;
    actualsPrompt: PublicationActualsPromptProjection | null;
  };
  /**
   * The Book's approved exports newest first, at most `MAX_EXPORT_RECORDS_LISTED` (Issue #413): each with what it
   * came to — a receipt, a failure that changed nothing, or `结果待确认`.
   */
  exports: ReadonlyArray<ManuscriptExportReceiptProjection>;
}

// ---- ⑥ 交付物 · 生产文档 (Issue #415, plan slice S66; V2-UX-DELIV-001, DELIV-002, WORK-013) ----------------

/** The most versions one document's card lists, newest first; an older version stays in the document's history. */
export const MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED = 20;
/** The most source materials 从来源材料创建 offers, newest first. */
export const MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED = 20;
/** The most paragraphs a document may start with; a longer material is not offered as one. */
export const MAX_PRODUCTION_DOCUMENT_BLOCKS = 2_000;

/** One saved version of a Production Document: `版本 N`, never a milestone (V2-UX-MILE-014). */
export interface ProductionDocumentVersionProjection {
  revisionId: string;
  /** `版本 N`. */
  label: string;
  ordinal: number;
  createdAt: string;
  revisionDigest: string;
}

/** A Production Document as it stands: its versions and whether its working text moved past the latest one. */
export interface ProductionDocumentProjection {
  documentId: string;
  branchId: string;
  createdAt: string;
  /**
   * The Book's source material it was made from, and how many of its 批注与修订 the document did not carry (Issue #547):
   * its text was read with every tracked change rejected and its comments left out. `null` for a document made before
   * the count was recorded.
   */
  origin: { sourceVersionId: string; displayName: string; marksNotCarried: number | null };
  /** Newest first, at most `MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED`. */
  versions: ReadonlyArray<ProductionDocumentVersionProjection>;
  versionsTruncated: boolean;
  /** The working text differs from the latest version: `保存为版本` would make a new one. */
  changedSinceVersion: boolean;
  journalSequence: number;
  workingDigest: string;
  /** Every Delivery Record newest first, at most `MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED` (Issue #415, S66b). */
  deliveries: ReadonlyArray<ProductionDocumentDeliveryProjection>;
  deliveriesTruncated: boolean;
  /** `交付后有修改` (DELIV-004): an edit after a delivery — the document was delivered, and its text is no version it was delivered at. */
  changedSinceDelivery: boolean;
  /** Its Deliverable Workflow Lens (Issue #415, S66c; V2-UX-WORK-001 to 009): the pinned profile and its seven phases. */
  workflow: ProductionDocumentWorkflowProjection;
}

/** The seven shared phases of a Deliverable Workflow (V2-UX-WORK-003), in the profile's order. */
export type ProductionDocumentPhaseId =
  | 'intake'
  | 'source-development'
  | 'drafting'
  | 'review-verification'
  | 'finalization'
  | 'delivery'
  | 'maintenance';
export const PRODUCTION_DOCUMENT_PHASE_IDS: readonly ProductionDocumentPhaseId[] = [
  'intake', 'source-development', 'drafting', 'review-verification', 'finalization', 'delivery', 'maintenance',
];
export const PRODUCTION_DOCUMENT_PHASE_LABELS: Readonly<Record<ProductionDocumentPhaseId, string>> = {
  intake: '接收与准备',
  'source-development': '来源建设',
  drafting: '起草',
  'review-verification': '审阅与核查',
  finalization: '定稿',
  delivery: '交付',
  maintenance: '维护',
};

/**
 * A phase's recorded state (WORK-004): only the editor's deterministic commands move it (WORK-008). `等待你处理` is read
 * beside it from the document's own facts, never recorded.
 */
export type ProductionDocumentPhaseState = 'not-started' | 'in-progress' | 'completed' | 'skipped' | 'reopened';
export const PRODUCTION_DOCUMENT_PHASE_STATE_LABELS: Readonly<Record<ProductionDocumentPhaseState, string>> = {
  'not-started': '未开始',
  'in-progress': '进行中',
  completed: '已完成',
  skipped: '已跳过',
  reopened: '已重新打开',
};
/** The pill of a phase that is open and has something the editor must handle (WORK-004). */
export const PRODUCTION_DOCUMENT_PHASE_WAITING_LABEL = '等待你处理';

export type ProductionDocumentPhaseAction = 'start' | 'complete' | 'skip' | 'reopen';
export const PRODUCTION_DOCUMENT_PHASE_ACTIONS: readonly ProductionDocumentPhaseAction[] = ['start', 'complete', 'skip', 'reopen'];

/** Why a phase is skipped (WORK-009): choices shown unselected, and 自行输入, which needs the editor's words. */
export type ProductionDocumentSkipReason = 'not-needed' | 'done-elsewhere' | 'later' | 'custom';
export const PRODUCTION_DOCUMENT_SKIP_REASONS: Readonly<Record<ProductionDocumentSkipReason, string>> = {
  'not-needed': '这份文档不需要这一阶段',
  'done-elsewhere': '这一阶段已在别处完成',
  later: '暂时跳过，之后再补',
  custom: '自行输入',
};
/** Why a completed or skipped phase is reopened (WORK-009), the same way. */
export type ProductionDocumentReopenReason = 'needs-change' | 'sources-changed' | 'redo-after-delivery' | 'custom';
export const PRODUCTION_DOCUMENT_REOPEN_REASONS: Readonly<Record<ProductionDocumentReopenReason, string>> = {
  'needs-change': '发现需要再改的地方',
  'sources-changed': '来源或事实有变化',
  'redo-after-delivery': '交付后需要重做',
  custom: '自行输入',
};
/** The editor's own words beside a reason, in characters once NFC-normalized and trimmed. */
export const MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS = 200;

/** One recorded move of a phase (WORK-009): what it did, from which state to which, why, and when. */
export interface ProductionDocumentPhaseTransitionProjection {
  action: ProductionDocumentPhaseAction;
  fromState: ProductionDocumentPhaseState;
  toState: ProductionDocumentPhaseState;
  /** A skip's or a reopen's reason: the choice, its words, and the editor's own; `null` for 开始 and 完成. */
  reason: null | { choice: string; label: string; text: string | null };
  recordedAt: string;
}

export interface ProductionDocumentPhaseProjection {
  phaseId: ProductionDocumentPhaseId;
  label: string;
  state: ProductionDocumentPhaseState;
  /** The state's words, or `等待你处理` for an open phase with something to handle. */
  stateLabel: string;
  /** What the open phase waits for the editor on, read from the document now; `null` when nothing. */
  waiting: string | null;
  /** What the editor may do to it now, in the order the lens offers them. */
  actions: ReadonlyArray<ProductionDocumentPhaseAction>;
  /**
   * The move that brought the phase to its state — a skip's or a reopen's with its reason — or `null` before any. Every
   * earlier move stays recorded (WORK-009); 交付物's one read carries only this one for each phase, to stay one frame.
   */
  latest: ProductionDocumentPhaseTransitionProjection | null;
  /** How many moves the phase has had. */
  moves: number;
}

/**
 * A Production Document's Deliverable Workflow Lens (Issue #415, S66c; V2-UX-WORK-001 to 009): the profile it follows,
 * pinned when the document began (WORK-002), a factual summary with no percentage (WORK-007), 下一项需要处理
 * (WORK-005), and its seven phases, several of which may be open at once (WORK-004).
 */
export interface ProductionDocumentWorkflowProjection {
  profile: { id: string; name: string; version: string; activatedAt: string };
  summary: string;
  /** Waiting items first, then the open phases, in phase order; empty when nothing needs the editor. */
  next: ReadonlyArray<{ phaseId: ProductionDocumentPhaseId; text: string }>;
  phases: ReadonlyArray<ProductionDocumentPhaseProjection>;
  /** How many moves the document's phases have had: a move names it, so one made since the editor looked is refused. */
  transitions: number;
}

/**
 * One deterministic move of one phase of a document of the route's Book (WORK-008, WORK-009): 开始, 完成, 跳过 or 重新打开,
 * the last two with a reason. `expectedTransitions` is the count the editor saw.
 */
export interface TransitionProductionDocumentPhaseInput {
  bookId: string;
  documentId: string;
  phaseId: ProductionDocumentPhaseId;
  action: ProductionDocumentPhaseAction;
  expectedTransitions: number;
  reason: null | { choice: string; text: string | null };
}

/** Who a delivery is for: the house's list, or the editor's own words (DELIV-003). */
export type ProductionDocumentRecipientKind = 'publicity' | 'editorial' | 'external-media' | 'other' | 'custom';
export const PRODUCTION_DOCUMENT_RECIPIENT_KINDS: readonly ProductionDocumentRecipientKind[] = ['publicity', 'editorial', 'external-media', 'other', 'custom'];
/** The house's recipients in their order; `custom` is the editor's own words. */
export const PRODUCTION_DOCUMENT_RECIPIENT_LABELS: Readonly<Record<Exclude<ProductionDocumentRecipientKind, 'custom'>, string>> = {
  publicity: '宣传部',
  editorial: '编辑部',
  'external-media': '外部媒体',
  other: '其他',
};
/** A recipient in the editor's own words, and a delivery's note, in characters once NFC-normalized and trimmed. */
export const MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS = 40;
export const MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS = 500;
export const MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED = 20;

/**
 * One Delivery Record (DELIV-003): which version went to whom, with the editor's note, and what its export came to —
 * the file written to the chosen place, or nothing yet. A delivery never sends, designates or publishes anything.
 */
export interface ProductionDocumentDeliveryProjection {
  deliveryId: string;
  /** 第 N 次交付 of the document. */
  ordinal: number;
  revisionId: string;
  versionLabel: string;
  recipient: { kind: ProductionDocumentRecipientKind; label: string };
  note: string | null;
  recordedAt: string;
  /**
   * The delivered version's export recorded after this delivery and before the next: the newest that wrote its file, else the
   * newest attempt; `null` when none.
   */
  export: null | { preparationId: string; outcome: 'created' | 'replaced' | 'ambiguous' | 'failed'; outcomeLabel: string; fileName: string };
}

/** One house type's card in 交付物. */
export interface ProductionDocumentTypeProjection {
  typeId: string;
  label: string;
  /** `本书不做` for this Book, as its latest decision records it. */
  notForThisBook: boolean;
  document: ProductionDocumentProjection | null;
}

/** A source-only material of the Book a document can be made from. */
export interface ProductionDocumentSourceProjection {
  sourceVersionId: string;
  displayName: string;
  format: SourceFormat;
  createdAt: string;
}

/**
 * 交付 · 生产文档 of one Book (Issue #415, S66), read on its own beside the 发稿 block: one card per house type and the
 * materials a document can start from. A read of its own, since a document's versions and Delivery Records would not
 * fit one service frame beside the Manuscript's milestones and designations.
 */
export interface ProductionDocumentsProjection {
  bookId: string;
  /** The house type configuration in force: its schema, version and digest. */
  configuration: { schema: string; version: string; digest: string };
  /** Why no document can be made yet, or `null`. */
  unavailableReason: string | null;
  types: ReadonlyArray<ProductionDocumentTypeProjection>;
  sources: ReadonlyArray<ProductionDocumentSourceProjection>;
  sourcesTruncated: boolean;
}

/** 从来源材料创建: a document of one type, made from one source-only material of the route's Book. */
export interface CreateProductionDocumentInput {
  bookId: string;
  typeId: string;
  sourceVersionId: string;
}

/** `本书不做` or `恢复` for one type of the route's Book. */
export interface DecideProductionDocumentTypeInput {
  bookId: string;
  typeId: string;
  notForThisBook: boolean;
}

/**
 * The version `交付` hands over (DELIV-003): one the document saved, or its current text — saved as the next version
 * first when it moved past the latest — bound to the working digest the form read, so an edit made since is never
 * delivered unseen.
 */
export type ProductionDocumentDeliveryVersionInput =
  | { kind: 'saved'; revisionId: string }
  | { kind: 'current'; workingDigest: string };

/** `交付`: one exact version of a document of the route's Book, to one recipient, with an optional note (DELIV-003). */
export interface RecordProductionDocumentDeliveryInput {
  bookId: string;
  documentId: string;
  version: ProductionDocumentDeliveryVersionInput;
  recipient: { kind: ProductionDocumentRecipientKind; custom: string | null };
  note: string | null;
}

/** `保存为版本`: the document's working text becomes its next version. */
export interface SaveProductionDocumentVersionInput {
  bookId: string;
  documentId: string;
  branchId: string;
}

/** The read of 交付 · 生产文档: the route's Book, supplied by the main process. */
export interface InspectProductionDocumentsInput {
  bookId: string;
}

/** What a document operation came to: 交付 · 生产文档 as they stand after it, and the document it was about. */
export interface ProductionDocumentResultProjection {
  bookId: string;
  documents: ProductionDocumentsProjection;
  document: ProductionDocumentProjection | null;
  typeId: string;
  /** What 从来源材料创建 did not carry into the document, said where the document opens; `null` when it carried everything. */
  notice: string | null;
}

// ---- 图书交付包 (Issue #416, plan slice S67a; V2-UX-BUNDLE-001 to 005, DPKG-001 to 015) -------------------------------

/** 交付包用途, in characters (code points) once NFC-normalized and trimmed. */
export const MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS = 80;
/**
 * The most package versions, review reports and review limitation lines one answer lists, newest first; the rest stay
 * in the records and in the content a package freezes.
 */
export const MAX_BOOK_DELIVERY_PACKAGE_VERSIONS_LISTED = 20;
export const MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED = 20;

/**
 * One row of the condition table (BUNDLE-002): the Publication Version, one per house type, and the work records —
 * whether it holds, in words, and where to go when it does not. A notice is a change the editor may act on without
 * the condition failing: the manuscript changed after 发稿, or a document after its delivery.
 */
export interface BookDeliveryPackageConditionProjection {
  key: 'publication' | 'document' | 'work-records';
  /** The house type a `document` row is about; `null` for the other two. */
  typeId: string | null;
  label: string;
  met: boolean;
  stateLabel: string;
  notice: string | null;
  /** Where the row's route leads, when it is unmet or carries a notice; `null` when there is nothing to do. */
  route: 'publication' | 'document' | 'review' | null;
  routeLabel: string | null;
}

/** One line of the Manifest Preview (DPKG-004, DPKG-006): what it is, and a detail in words. */
export interface BookDeliveryPackageItemProjection {
  kind: 'publication' | 'document' | 'review-report' | 'not-for-this-book' | 'exclusion';
  label: string;
  detail: string | null;
}

/**
 * What a package prepared now would hold (the Manifest Preview), without its purpose. `digest` names exactly this
 * content: `准备图书交付包` freezes it or refuses, so the editor never prepares a package they did not see.
 */
export interface BookDeliveryPackageContentProjection {
  digest: string;
  included: ReadonlyArray<BookDeliveryPackageItemProjection>;
  /** More review reports are included than the answer lists. */
  includedTruncated: boolean;
  excluded: ReadonlyArray<BookDeliveryPackageItemProjection>;
  limitations: ReadonlyArray<string>;
  /** More review Runs carry a limitation than the answer lists. */
  limitationsTruncated: boolean;
}

/** One frozen version of the Book's package (DPKG-007, DPKG-011): immutable, and never itself an export or a delivery. */
export interface BookDeliveryPackageVersionProjection {
  packageVersionId: string;
  /** The package's stable identity, the same for every version of a Book's package. */
  packageId: string;
  version: number;
  /** `v1`, `v2` … */
  label: string;
  purpose: string;
  preparedAt: string;
  /** The newest version is the current one. */
  current: boolean;
  /** What the version holds, in one line. */
  summary: string;
  /** The derived Package Export History (DPKG-011): `暂无导出记录`, or how many exports wrote files and when the latest did. */
  exportHistoryLabel: string;
  /** The version's exports newest first (Issue #416, S67b), at most `MAX_BOOK_DELIVERY_PACKAGE_EXPORTS_LISTED`, each in one line. */
  exports: ReadonlyArray<BookDeliveryPackageExportSummaryProjection>;
  exportsTruncated: boolean;
  /** 查看技术详情 only. */
  technical: { contentDigest: string; digest: string; priorVersionId: string | null };
}

/** 图书交付包 of one Book, read on its own beside 发稿 and 交付 · 生产文档. */
export interface BookDeliveryPackageProjection {
  bookId: string;
  /** BUNDLE-005's sentence: the package is neither 发稿 nor 交付, and preparing it changes no record. */
  statement: string;
  conditions: ReadonlyArray<BookDeliveryPackageConditionProjection>;
  ready: boolean;
  /** The unmet conditions' labels in the table's order, named beside `准备图书交付包` while it is unavailable. */
  unmet: ReadonlyArray<string>;
  content: BookDeliveryPackageContentProjection;
  versions: ReadonlyArray<BookDeliveryPackageVersionProjection>;
  versionsTruncated: boolean;
  /** The content differs from the newest version's, so preparing again makes the next version (BUNDLE-004). */
  changedSinceLatest: boolean;
}

/** The read of 图书交付包: the route's Book, supplied by the main process. */
export interface InspectBookDeliveryPackageInput {
  bookId: string;
}

/** `准备图书交付包`: the content the editor saw, by its digest, and the purpose they wrote. */
export interface PrepareBookDeliveryPackageInput {
  bookId: string;
  purpose: string;
  expectedContentDigest: string;
}

/** What `准备图书交付包` came to: a new version, or the newest one unchanged, and the package as it stands. */
export interface BookDeliveryPackageResultProjection {
  bookId: string;
  outcome: 'prepared' | 'unchanged';
  version: number;
  package: BookDeliveryPackageProjection;
}

// ---- 图书交付包's export (Issue #416, plan slice S67b; BUNDLE-004, DPKG-011, DPKG-013, DPKG-014, EXP-010 to EXP-022) --------

/** At most this many exports of one package version are listed, newest first; the count says how many there were. */
export const MAX_BOOK_DELIVERY_PACKAGE_EXPORTS_LISTED = 2;
/** At most this many files of one export are listed; an export of more says how many it wrote. */
export const MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED = 40;

/** One file a package export writes: what it holds, its file name and its format. */
export interface BookDeliveryPackageExportFileProjection {
  /** `publication`, `document:<typeId>`, `report:<reportId>` or `manifest`. */
  key: string;
  /** What the file holds, in the editor's words: `稿件 · 发稿版本「一审稿」 · r1`. */
  label: string;
  fileName: string;
  format: ManuscriptExportFormat;
}

/** `导出…` of one package version: the files it writes, and the review they bind (EXP-010). */
export interface BookDeliveryPackageExportReviewProjection {
  bookId: string;
  packageVersionId: string;
  /** `v2`. */
  versionLabel: string;
  files: ReadonlyArray<BookDeliveryPackageExportFileProjection>;
  /** EXP-014 and EXP-015: the files go to a folder the editor chooses, and nothing is sent anywhere. */
  statement: string;
  /** Binds the folder's preparation to exactly this review. */
  reviewDigest: string;
}

/** What one file of a package export came to (EXP-013, EXP-021). */
export interface BookDeliveryPackageExportFileOutcomeProjection extends BookDeliveryPackageExportFileProjection {
  preparationId: string;
  /** `prepared` until `按上述方式导出`; then the receipt's own outcome, or `not-written` for a file after one that stopped. */
  outcome: 'prepared' | 'created' | 'failed' | 'ambiguous' | 'not-written';
  outcomeLabel: string;
  /** Whether 在文件夹中显示 can be offered: only for a verified file. */
  revealAvailable: boolean;
}

/** One export of one package version (DPKG-014): its folder, its files and what each came to. It never changes the package. */
export interface BookDeliveryPackageExportProjection {
  exportId: string;
  packageVersionId: string;
  versionLabel: string;
  /** The folder as the system dialog returned it. */
  folder: string;
  /** `prepared` before `按上述方式导出`; `exported` once every file was written; `incomplete` when a file stopped it. */
  state: 'prepared' | 'exported' | 'incomplete';
  /** `已导出到所选位置 · 4 个文件`, `已准备，尚未导出 · 4 个文件`, or how many files were written and how many were not. */
  summary: string;
  createdAt: string;
  files: ReadonlyArray<BookDeliveryPackageExportFileOutcomeProjection>;
  /** More files than the answer lists. */
  filesTruncated: boolean;
  /** In `按上述方式导出`'s own answer: the file that stopped the rest, and why; `null` otherwise. */
  stopped: { fileName: string; reason: string } | null;
}

/**
 * One export of a version as its history lists it (DPKG-011): what it came to, where and when, in one line. What each
 * file came to is the export's own answer; 交付物's one read of every version stays one frame. A folder chosen and never
 * approved is no export, and the history never lists one.
 */
export interface BookDeliveryPackageExportSummaryProjection {
  exportId: string;
  folder: string;
  state: Exclude<BookDeliveryPackageExportProjection['state'], 'prepared'>;
  summary: string;
  /** When its last file's outcome was recorded. */
  exportedAt: string;
  fileCount: number;
  /** A file it wrote and verified, for 在文件夹中显示 to show the folder by; `null` when it wrote none. */
  revealPreparationId: string | null;
}

/** `导出…` of one version of the route's Book's package. */
export interface ReviewBookDeliveryPackageExportInput {
  bookId: string;
  packageVersionId: string;
}

/** `选择位置…`: the folder the system dialog returned, bound to the review the editor read. */
export interface PrepareBookDeliveryPackageExportInput {
  bookId: string;
  packageVersionId: string;
  reviewDigest: string;
  folder: string;
}

/** `按上述方式导出` of one prepared package export. */
export interface ApproveBookDeliveryPackageExportInput {
  bookId: string;
  exportId: string;
}

/** What the folder dialog came to: nothing is recorded when it was cancelled (EXP-020), else the prepared export. */
export type ChooseBookDeliveryPackageExportFolderResult =
  | { outcome: 'cancelled' }
  | { outcome: 'prepared'; export: BookDeliveryPackageExportProjection };

/** What `按上述方式导出` came to, and the package as it stands, its export history included. */
export interface BookDeliveryPackageExportResultProjection {
  bookId: string;
  export: BookDeliveryPackageExportProjection;
  package: BookDeliveryPackageProjection;
}

/**
 * The inputs of the 交付物 operations. The Book is always the route's, never the renderer's: every
 * renderer member takes the input without `bookId`, and the main process supplies the Book its window
 * is showing.
 */
export interface InspectDeliverablesInput {
  bookId: string;
}

/** 设为发稿版本: one exact milestone of the Book's primary Manuscript, a 发稿范围 and a 依据 (PUB-002, PUB-004). */
export interface DesignatePublicationVersionInput {
  bookId: string;
  milestoneId: string;
  scope: string;
  basis: string;
}

/** What 设为发稿版本 came to: a separate append, or — for an identical repeat of the current one — no change. */
export interface PublicationDesignationProjection {
  bookId: string;
  outcome: 'designated' | 'unchanged';
  completionLabel: string;
  /** The designation the answer is about: the one appended, or the current one an identical repeat named. */
  publicationVersionId: string;
  deliverables: DeliverablesProjection;
}

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
  | 'learning-materials-deferred';

/**
 * The closed map of safe next steps (V2-UX-ATTN-007): each is an action the item's own record offers, in
 * words the product already uses there. An item whose record offers none of them is not listed at all.
 */
export type GlobalAttentionNextStep =
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
  | 'decide-learning-materials';
export const GLOBAL_ATTENTION_NEXT_STEPS: readonly GlobalAttentionNextStep[] = [
  'view-run', 'view-review', 'reconfirm-plan', 'continue-review', 'return-to-recovery', 'retry-abandon-cleanup', 'await-local-check',
  'resolve-conflict', 'answer-clarification', 'adjust-budget-redo', 'resolve-model-service', 'reprepare', 'redo', 'view-plan',
  'maintenance-link-proposal', 'maintenance-link-publication', 'maintenance-write-errata', 'maintenance-conclude',
  'set-library-attribution', 'set-learning-eligibility', 'decide-learning-materials',
];

/**
 * Where an item opens: its exact authoritative record, in the requesting window (V2-UX-ATTN-007, D-006).
 * Opening grants nothing; every decision is still made at the record.
 */
export type GlobalAttentionTarget =
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
  | { kind: 'learning-materials'; bookId: string };

/** The Active Work Object of one item, in its record's own terms (V2-UX-ATTN-007). */
export type GlobalAttentionObjectProjection =
  | { kind: 'import'; sourceDisplayName: string; relationship: 'first-manuscript' | 'source-only' | 'reimport' | null }
  | { kind: 'recovery'; branchName: string }
  | { kind: 'manuscript-conflict'; conflictKind: ProposalConflictKind }
  | { kind: 'analysis'; mode: BaselineAnalysisTaskMode }
  | { kind: 'review'; ordinal: number }
  | { kind: 'maintenance'; classification: MaintenanceClassification; ordinal: number; publicationOrdinal: number }
  // A 资料库 item (Issue #427, S79c): its title and kind, and where it belongs so far — a Book, the house, or not yet decided.
  | { kind: 'library-material'; title: string; materialKind: LibraryMaterialKind; scope: 'none' | 'book' | 'house' }
  // A Book's Learning Material (Issue #61, S26b): how many wait for a decision, and how many were left for later.
  | { kind: 'learning-materials'; pending: number; deferred: number };

/** The record facts an item's reason is told from: identities, counts and states, never manuscript text. */
export interface GlobalAttentionFactsProjection {
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

/**
 * 待我处理 across every Book (editor-surfaces §8.1, V2-UX-ATTN-001 to 009, IA-007). A read: composing it
 * terminalizes, claims and writes nothing (V2-UX-ATTN-008). An item resolves by itself when the record
 * moves on — a newer Task of the same kind for its Book, a decision made, a completion aging out.
 */
export interface GlobalAttentionProjection {
  /** Always the four groups, in the fixed order. */
  groups: ReadonlyArray<GlobalAttentionGroupProjection>;
  /** The Actionable Attention Count: the items of the first two groups, and no others (V2-UX-ATTN-006). */
  actionableCount: number;
  /** A Run is in flight now, or a Review Run is being driven: a reader follows it slowly until it ends. */
  running: boolean;
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
  | { kind: 'review-run'; reviewRunId: string };

/** One Task of the Book as the panel shows it: 待我处理's item for it, and the result `查看结果` opens. */
export interface BookTaskItemProjection {
  item: GlobalAttentionItemProjection;
  /** `null` for a Task that formed no result — a Run that stopped before it read anything. */
  result: BookTaskResultRef | null;
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
  | 'report-summaries'
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
export interface ManuscriptExportReviewProjection {
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
export interface ManuscriptExportPreparationProjection {
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
export interface ManuscriptExportReceiptProjection {
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
    'task-authorization-preparation' | 'baseline-analysis-preparation' | 'review-run-preparation';
  state: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  progress: { completed: number; total: number; label: string };
  result: SearchSummaryProjection | ReplacementPreviewProjection | ReviewBeforeManuscriptReimportProjection |
    ManuscriptReimportCommitProjection | TaskAuthorizationProjection | BaselineAnalysisProjection | ReviewWorkspaceProjection | null;
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

export interface JournalEditInput {
  clientEditId: string;
  manuscriptId: string;
  branchId: string;
  baseRevisionId: string;
  blockId: string;
  windowStartBlockId: string;
  baseBlockDigest: string;
  expectedJournalSequence: number;
  fromGrapheme: number;
  toGrapheme: number;
  insertText: string;
}

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

export interface ServiceOperationMap {
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
  inspectBaselineAnalysis: {
    input: { bookId: string; revisionId: string | null };
    output: BaselineAnalysisProjection;
  };
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
  /** 知识库 › 审阅规范文件 (Issue #427, S79a): every guideline document the review categories apply, with its versions. */
  inspectReviewGuidelines: {
    input: Record<string, never>;
    output: ReviewGuidelinesProjection;
  };
  /** 导入新版本's reading of the file main's picker returned: nothing is recorded until it is confirmed. */
  previewReviewGuidelineVersion: {
    input: { documentId: string; path: string };
    output: ReviewGuidelinePreviewProjection;
  };
  /** 确认导入: the previewed clauses become the document's next version, issued by the house. */
  importReviewGuidelineVersion: {
    input: { previewId: string };
    output: ReviewGuidelinesProjection;
  };
  /** 知识库 › 范例 (Issue #427, S79b): every published Book's delivered documents, by Book and type. */
  inspectExemplars: {
    input: Record<string, never>;
    output: ExemplarsProjection;
  };
  /** 知识库 › 工序与规则 (Issue #427, S79d): the review categories' 工序 and the native artifact, with their use. */
  inspectKnowledgeProcedures: {
    input: Record<string, never>;
    output: KnowledgeProceduresProjection;
  };
  /** 知识库 › 资料库 (Issue #427, S79c): every item the editor collected, with its attribution and eligibility. */
  inspectLibraryMaterials: {
    input: Record<string, never>;
    output: LibraryMaterialsProjection;
  };
  /** 放入资料…: the absolute path main's picker returned, read as it would arrive; nothing is kept. */
  previewLibraryMaterial: {
    input: { path: string };
    output: LibraryMaterialPreviewProjection;
  };
  /** 放入资料库: the previewed file kept whole in the Agent Data Root, with the title and kind the editor gave it. */
  addLibraryMaterial: {
    input: { previewId: string; title: string; kind: LibraryMaterialKind };
    output: LibraryMaterialsProjection;
  };
  /** 定归属 or 定学习准入: one decision appended to the item's chain, refused when the chain moved since it was read. */
  decideLibraryMaterial: {
    input: { materialId: string; expectedDecisions: number; decision: LibraryMaterialDecisionInput };
    output: LibraryMaterialsProjection;
  };
  /** 知识库 › 评估方案 (Issue #429, S81a): the house Evaluation Profile and its use. */
  inspectEvaluationProfiles: {
    input: Record<string, never>;
    output: EvaluationProfilesProjection;
  };
  /** ②C 评估 of the route's Book (Issue #429, S81a): one version by its identity, or the latest when `null`. */
  inspectEvaluation: {
    input: { bookId: string; recordId: string | null };
    output: EvaluationWorkspaceProjection;
  };
  /** 开始评估 or 重新评估: a new version bound to the manuscript's current revision. */
  startEvaluation: {
    input: { bookId: string };
    output: EvaluationWorkspaceProjection;
  };
  /** 保存评估 or 定稿: the editor's content appended to the version's chain, refused when the chain moved since it was read. */
  saveEvaluation: {
    input: { bookId: string; recordId: string; expectedEntries: number; content: EvaluationContent; finalize: boolean };
    output: EvaluationWorkspaceProjection;
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
  inspectLearningMaterials: { input: { bookId: string | null }; output: LearningMaterialsProjection };
  decideLearningMaterial: { input: DecideLearningMaterialInput; output: LearningMaterialsProjection };
  inspectFeedbackHistory: { input: Record<string, never>; output: FeedbackHistoryProjection };
  inspectEvaluationCalibration: { input: Record<string, never>; output: EvaluationCalibrationProjection };
  recordPublicationActuals: { input: RecordPublicationActualsInput; output: EvaluationCalibrationProjection };
  setEvaluationPreferences: { input: SetEvaluationPreferencesInput; output: EvaluationCalibrationProjection };
  inspectSeriesList: { input: Record<string, never>; output: SeriesListProjection };
  createSeries: { input: CreateSeriesInput; output: SeriesCreationProjection };
  inspectSeries: { input: { seriesId: string }; output: SeriesProjection };
  previewSeriesMembershipChange: { input: PreviewSeriesMembershipChangeInput; output: SeriesMembershipPreviewProjection };
  changeSeriesMembership: { input: ChangeSeriesMembershipInput; output: SeriesMembershipChangeResultProjection };
  inspectBookSeries: { input: { bookId: string }; output: BookSeriesProjection };
  proposeSeriesKnowledge: { input: ProposeSeriesKnowledgeInput; output: SeriesKnowledgeProposalProjection };
  inspectSeriesKnowledgeReview: { input: { seriesId: string; candidateId: string }; output: SeriesKnowledgeReviewProjection };
  editSeriesKnowledgeCandidate: { input: EditSeriesKnowledgeCandidateInput; output: SeriesKnowledgeReviewProjection };
  promoteSeriesKnowledge: { input: PromoteSeriesKnowledgeInput; output: SeriesKnowledgePromotionProjection };
  inspectDataVersion: { input: Record<string, never>; output: DataVersionProjection };
  /** 导出数据库 (Issue #434, S86a): the destination the Save dialog answered becomes one preparation of the package. */
  prepareDatabaseExport: { input: { destination: string }; output: DatabaseExportPreparationProjection };
  /** `按上述方式导出`: the one approval of one unchanged preparation, and the write it permits. */
  approveDatabaseExport: { input: { preparationId: string }; output: DatabaseExportReceiptProjection };
  inspectDatabaseExports: { input: Record<string, never>; output: DatabaseExportsProjection };
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
   * 稿件冲突 of one 修改建议 (Issue #57, plan slice S22; ADR 0085). The read compares the three texts; the
   * Resolution Draft is saved on exactly the basis the editor saw; the conflict is left by 保留当前稿件,
   * 暂不处理 or 保存为新提案版本. None of them writes the manuscript.
   */
  inspectProposalConflict: { input: ProposalConflictBindingInput; output: ProposalConflictProjection };
  saveProposalConflictDraft: { input: SaveProposalConflictDraftInput; output: ProposalConflictDraftSaveProjection };
  resolveProposalConflict: { input: ResolveProposalConflictInput; output: ProposalConflictResolutionProjection };
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
  /** The folder the main process's dialog returned: one preparation per file, recorded together; nothing is written. */
  prepareBookDeliveryPackageExport: { input: PrepareBookDeliveryPackageExportInput; output: BookDeliveryPackageExportProjection };
  /** `按上述方式导出`: each file approved and written in turn, with its receipt; a file that stops it stops the rest. */
  approveBookDeliveryPackageExport: { input: ApproveBookDeliveryPackageExportInput; output: BookDeliveryPackageExportResultProjection };
  inspectMaintenanceCase: { input: InspectMaintenanceCaseInput; output: MaintenanceCaseProjection };
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
  getModelServiceStoredState: {
    input: Record<string, never>;
    output: ModelServiceStoredStateProjection;
  };
  saveModelServiceConnection: {
    input: {
      connectionName: string;
      credentialReference: string;
      credentialOperationState: 'ready' | 'needs-attention';
    };
    output: ModelServiceConnectionProjection;
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

export interface RendererApi {
  readonly platform: 'win32' | 'darwin';
  getStartup(): Promise<StartupProjection>;
  getRecoveryComparison(input: ServiceOperationMap['getRecoveryComparison']['input']): Promise<RecoveryComparisonProjection>;
  viewRecoveryCandidate(input: ServiceOperationMap['viewRecoveryCandidate']['input']): Promise<RecoveryWindowProjection>;
  deferRecovery(input: ServiceOperationMap['deferRecovery']['input']): Promise<RecoveryDeferralProjection>;
  restoreRecovery(input: Omit<ServiceOperationMap['restoreRecovery']['input'], 'restorationId'>): Promise<RecoveryRestorationProjection>;
  getImportStartup(): Promise<ImportStartupProjection>;
  selectAndStageManuscript(): Promise<PickerStageResult>;
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
  inspectForegroundExecutionBoundary(input: Omit<
    ServiceOperationMap['inspectForegroundExecutionBoundary']['input'],
    'bookId'
  >): Promise<ForegroundExecutionBoundaryProjection>;
  prepareTaskAuthorization(input: { goal: typeof J03_TASK_GOAL }): Promise<ServiceJobProjection>;
  authorizeTaskAuthorization(input: {
    taskIntentId: string;
    planEnvelopeDigest: string;
  }): Promise<TaskAuthorizationProjection>;
  inspectBaselineAnalysis(input?: { revisionId: string | null }): Promise<BaselineAnalysisProjection>;
  prepareBaselineAnalysis(input: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; reconfirm: boolean; redoOf?: string | null }): Promise<ServiceJobProjection>;
  /**
   * The Task Drawer bar's 开始任务 for the analysis (Issue #420, S74a): records the Run Authorization and the
   * Run Record and hands the Run to the execution owner's governor, which admits it at once while a place is
   * free, or has it wait for one — `queued`, 等待运行名额 — and admits it in its turn (Issue #49, S14).
   */
  authorizeBaselineAnalysis(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<BaselineAnalysisProjection>;
  startBaselineAnalysisWhenOnline(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<BaselineAnalysisProjection>;
  cancelWaitingBaselineAnalysis(input: { taskIntentId: string }): Promise<BaselineAnalysisProjection>;
  cancelBaselineAnalysisRun(input: { taskIntentId: string }): Promise<BaselineAnalysisProjection>;
  pauseBaselineAnalysisRun(input: { taskIntentId: string }): Promise<BaselineAnalysisProjection>;
  resumeBaselineAnalysisRun(input: { taskIntentId: string }): Promise<BaselineAnalysisProjection>;
  /** 更新计划 (Issue #419): the next plan version of the Book's baseline analysis Task, as the editor left it. */
  editBaselineAnalysisPlan(input: {
    taskIntentId: string;
    planEnvelopeDigest: string;
    removedSteps: ReadonlyArray<string>;
    disallowedAdaptations: ReadonlyArray<string>;
    askFirstAdaptations?: ReadonlyArray<string>;
    runBudgetCeiling?: { kind: 'tokens'; maxTotalTokens: number } | null;
  }): Promise<BaselineAnalysisProjection>;
  /** 提交回答 (Issue #422, S76d): the editor's answer to a question the Book's baseline analysis Run asked. */
  answerBaselineAnalysisClarification(input: {
    taskIntentId: string;
    requestId: string;
    optionId: ClarificationOptionId;
    note: string | null;
  }): Promise<BaselineAnalysisProjection>;
  runReconnectPreflight(): Promise<ReconnectPreflightProjection>;
  /** 快速开始 of the Book the window is showing, after 先看计划's preparation (Issue #421). */
  quickStartBaselineAnalysis(input: { taskIntentId: string; planEnvelopeDigest: string; ruleVersionId: string }): Promise<QuickStartBaselineAnalysisResult>;
  setDefaultExecutionRule(input: { taskIntentId: string; planEnvelopeDigest: string }): Promise<DefaultExecutionRuleProjection>;
  inspectDefaultExecutionRules(): Promise<DefaultExecutionRulesProjection>;
  deactivateDefaultExecutionRule(input: { ruleId: string }): Promise<DefaultExecutionRuleProjection>;
  /** 知识库 › 审阅规范文件 (Issue #427, S79a): names no Book; it reads every Book's Review Runs to say who used which version. */
  inspectReviewGuidelines(): Promise<ReviewGuidelinesProjection>;
  /** 导入新版本: the native picker, then the file's clauses as the next version would read them; `null` when the picker was cancelled. */
  previewReviewGuidelineVersion(input: { documentId: string }): Promise<ReviewGuidelinePreviewProjection | null>;
  importReviewGuidelineVersion(input: { previewId: string }): Promise<ReviewGuidelinesProjection>;
  /** 知识库 › 范例 (Issue #427, S79b): names no Book; it reads every published Book's delivered documents. */
  inspectExemplars(): Promise<ExemplarsProjection>;
  /** 知识库 › 工序与规则's expert 工序 (Issue #427, S79d): names no Book. */
  inspectKnowledgeProcedures(): Promise<KnowledgeProceduresProjection>;
  /** 知识库 › 资料库 (Issue #427, S79c): names no Book; an item names the Book it was attributed to. */
  inspectLibraryMaterials(): Promise<LibraryMaterialsProjection>;
  /** 放入资料…: the native picker, then the file as it would arrive; `null` when the picker was cancelled. */
  previewLibraryMaterial(): Promise<LibraryMaterialPreviewProjection | null>;
  addLibraryMaterial(input: { previewId: string; title: string; kind: LibraryMaterialKind }): Promise<LibraryMaterialsProjection>;
  decideLibraryMaterial(input: { materialId: string; expectedDecisions: number; decision: LibraryMaterialDecisionInput }): Promise<LibraryMaterialsProjection>;
  /** 知识库 › 评估方案 (Issue #429, S81a): names no Book. */
  inspectEvaluationProfiles(): Promise<EvaluationProfilesProjection>;
  /** ②C 评估 of the Book the window is showing (Issue #429, S81a); the renderer never names the Book. */
  inspectEvaluation(input: { recordId: string | null }): Promise<EvaluationWorkspaceProjection>;
  startEvaluation(): Promise<EvaluationWorkspaceProjection>;
  saveEvaluation(input: { recordId: string; expectedEntries: number; content: EvaluationContent; finalize: boolean }): Promise<EvaluationWorkspaceProjection>;
  /** ②A 分析反馈 of the Book the window is showing (Issue #94, S38); the renderer never names the Book. */
  inspectAnalysisFeedback(input: { revisionId: string }): Promise<AnalysisFeedbackProjection>;
  recordAnalysisFeedback(input: RecordAnalysisFeedbackInput): Promise<AnalysisFeedbackProjection>;
  /**
   * 审阅 of the Book the window is showing (Issue #417). Inspecting without a Run opens the latest; a
   * running Run is followed by inspecting it again, and its executing category carries its progress.
   */
  inspectReviewWorkspace(input?: Omit<InspectReviewWorkspaceInput, 'bookId'>): Promise<ReviewWorkspaceProjection>;
  /** 先看计划: a `review-run-preparation` job, followed with `pollServiceJob` and stopped with `cancelServiceJob`. */
  prepareReviewRun(input: Omit<PrepareReviewRunInput, 'bookId'>): Promise<ServiceJobProjection>;
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
  prepareManuscriptReimport(input: ServiceOperationMap['prepareManuscriptReimport']['input']): Promise<ServiceJobProjection>;
  getReimportMappingPage(input: ServiceOperationMap['getReimportMappingPage']['input']): Promise<ReimportMappingPageProjection>;
  getReimportLineageSourceVersionPage(input: ServiceOperationMap['getReimportLineageSourceVersionPage']['input']): Promise<ReimportLineageSourceVersionPageProjection>;
  acceptReimportDegradation(input: ServiceOperationMap['acceptReimportDegradation']['input']): Promise<ReviewBeforeManuscriptReimportProjection>;
  resolveReimportMapping(input: ServiceOperationMap['resolveReimportMapping']['input']): Promise<ServiceJobProjection>;
  commitManuscriptReimport(input: CommitManuscriptReimportRendererInput): Promise<ServiceJobProjection>;
  acknowledgeImportCompletion(input: ServiceOperationMap['acknowledgeImportCompletion']['input']): Promise<{ state: 'acknowledged' }>;
  getManuscriptWindow(input: ServiceOperationMap['getManuscriptWindow']['input']): Promise<ManuscriptWindowProjection>;
  flushJournalEdit(input: JournalEditInput): Promise<JournalAcknowledgement>;
  createEditorialMark(input: CreateEditorialMarkInput): Promise<EditorialMarkCommandProjection>;
  getEditorialMarkCard(input: ServiceOperationMap['getEditorialMarkCard']['input']): Promise<EditorialMarkCardProjection>;
  updateEditorialMark(input: UpdateEditorialMarkInput): Promise<EditorialMarkCommandProjection>;
  recordChangeSuggestionDecision(input: RecordChangeSuggestionDecisionInput): Promise<EditorialMarkCommandProjection>;
  recordProposalDecisionReason(input: RecordProposalDecisionReasonInput): Promise<EditorialMarkCommandProjection>;
  recordProposalDecisionFeedback(input: RecordProposalDecisionFeedbackInput): Promise<EditorialMarkCommandProjection>;
  inspectLearningMaterials(input: { bookId: string | null }): Promise<LearningMaterialsProjection>;
  decideLearningMaterial(input: DecideLearningMaterialInput): Promise<LearningMaterialsProjection>;
  inspectFeedbackHistory(): Promise<FeedbackHistoryProjection>;
  inspectEvaluationCalibration(): Promise<EvaluationCalibrationProjection>;
  recordPublicationActuals(input: RecordPublicationActualsInput): Promise<EvaluationCalibrationProjection>;
  setEvaluationPreferences(input: SetEvaluationPreferencesInput): Promise<EvaluationCalibrationProjection>;
  inspectSeriesList(): Promise<SeriesListProjection>;
  createSeries(input: CreateSeriesInput): Promise<SeriesCreationProjection>;
  inspectSeries(input: { seriesId: string }): Promise<SeriesProjection>;
  previewSeriesMembershipChange(input: PreviewSeriesMembershipChangeInput): Promise<SeriesMembershipPreviewProjection>;
  changeSeriesMembership(input: ChangeSeriesMembershipInput): Promise<SeriesMembershipChangeResultProjection>;
  inspectBookSeries(input: { bookId: string }): Promise<BookSeriesProjection>;
  proposeSeriesKnowledge(input: ProposeSeriesKnowledgeInput): Promise<SeriesKnowledgeProposalProjection>;
  inspectSeriesKnowledgeReview(input: { seriesId: string; candidateId: string }): Promise<SeriesKnowledgeReviewProjection>;
  editSeriesKnowledgeCandidate(input: EditSeriesKnowledgeCandidateInput): Promise<SeriesKnowledgeReviewProjection>;
  promoteSeriesKnowledge(input: PromoteSeriesKnowledgeInput): Promise<SeriesKnowledgePromotionProjection>;
  inspectDataVersion(): Promise<DataVersionProjection>;
  /** 导出数据库… (Issue #434, S86a): the platform's Save dialog, then the preparation of the package for the chosen file. */
  chooseDatabaseExportDestination(): Promise<{ outcome: 'cancelled' } | { outcome: 'prepared'; preparation: DatabaseExportPreparationProjection }>;
  approveDatabaseExport(input: { preparationId: string }): Promise<DatabaseExportReceiptProjection>;
  inspectDatabaseExports(): Promise<DatabaseExportsProjection>;
  applyChangeSuggestion(input: ApplyChangeSuggestionInput): Promise<ManuscriptApplyCommandProjection>;
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
  getManuscriptRail(input: ServiceOperationMap['getManuscriptRail']['input']): Promise<ManuscriptRailProjection>;
  /** Cut, copy or paste in the focused editor through the window itself; the page has no clipboard permission. */
  runEditorClipboardCommand(input: { command: EditorClipboardCommand }): Promise<{ state: 'done' }>;
  recordManuscriptEntryPosition(
    input: ServiceOperationMap['recordManuscriptEntryPosition']['input'],
  ): Promise<{ state: 'recorded' }>;
  listPriorWork(): Promise<ReadonlyArray<PriorWorkItemProjection>>;
  getManuscriptWindowAt(input: ServiceOperationMap['getManuscriptWindowAt']['input']): Promise<ManuscriptWindowProjection>;
  getOutline(input: ServiceOperationMap['getOutline']['input']): Promise<OutlineProjection>;
  startSearch(input: ServiceOperationMap['startSearch']['input']): Promise<ServiceJobProjection>;
  pollServiceJob(input: ServiceOperationMap['pollServiceJob']['input']): Promise<ServiceJobProjection>;
  cancelServiceJob(input: ServiceOperationMap['cancelServiceJob']['input']): Promise<ServiceJobProjection>;
  getSearchResults(input: ServiceOperationMap['getSearchResults']['input']): Promise<SearchResultsProjection>;
  prepareReplacement(input: ServiceOperationMap['prepareReplacement']['input']): Promise<ReplacementPreviewProjection>;
  freezeReplacement(input: ServiceOperationMap['freezeReplacement']['input']): Promise<ReplacementPreviewProjection>;
  dismissReplacementPreview(input: ServiceOperationMap['dismissReplacementPreview']['input']): Promise<ReplacementDismissalProjection>;
  startReplacementCommit(input: ServiceOperationMap['startReplacementCommit']['input']): Promise<ServiceJobProjection>;
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
  /** `按上述方式导出` of a prepared package export: its files written, each with its receipt. */
  approveBookDeliveryPackageExport(input: Omit<ApproveBookDeliveryPackageExportInput, 'bookId'>): Promise<BookDeliveryPackageExportResultProjection>;
  /** 维护事项 (Issue #426, S68a): one case of that Book in its workspace. */
  inspectMaintenanceCase(input: Omit<InspectMaintenanceCaseInput, 'bookId'>): Promise<MaintenanceCaseProjection>;
  /** `记录维护事项` on one of that Book's designations. */
  recordMaintenanceCase(input: Omit<RecordMaintenanceCaseInput, 'bookId'>): Promise<MaintenanceCaseResultProjection>;
  /** 关联修改建议, 关联发稿版本 or 记录维护事项结论: the case's next revision. */
  appendMaintenanceCaseRevision(input: Omit<AppendMaintenanceCaseRevisionInput, 'bookId'>): Promise<MaintenanceCaseResultProjection>;
  /** `保存勘误版本`. */
  saveMaintenanceErrata(input: Omit<SaveMaintenanceErrataInput, 'bookId'>): Promise<MaintenanceCaseResultProjection>;
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
  getModelServiceSettings(): Promise<ModelServiceSettingsProjection>;
  saveModelServiceCredential(input: { connectionName: string; secret: string }): Promise<ModelServiceSettingsProjection>;
  removeModelServiceCredential(): Promise<ModelServiceSettingsProjection>;
}
