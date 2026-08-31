export const SERVICE_PROTOCOL_VERSION = 13 as const;
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

export type J08RecoveryControl = 'interrupt-after-journal-ack';

export const IPC_CHANNELS = {
  getStartup: 'ai7:j08:get-startup',
  getRecoveryComparison: 'ai7:j08:get-recovery-comparison',
  viewRecoveryCandidate: 'ai7:j08:view-recovery-candidate',
  deferRecovery: 'ai7:j08:defer-recovery',
  restoreRecovery: 'ai7:j08:restore-recovery',
  getImportStartup: 'ai7:j01:get-import-startup',
  selectAndStageDocx: 'ai7:j01:select-and-stage-docx',
  continueImportDraft: 'ai7:j01:continue-import-draft',
  reselectImportDraft: 'ai7:j01:reselect-import-draft',
  abandonImportDraft: 'ai7:j01:abandon-import-draft',
  prepareBookCreation: 'ai7:j01:prepare-book-creation',
  commitBookCreation: 'ai7:j01:commit-book-creation',
  getBookOverview: 'ai7:j01:get-book-overview',
  inspectEditorialWorkspaceProfile: 'ai7:j15:inspect-editorial-workspace-profile',
  installEditorialWorkspaceProfile: 'ai7:j15:install-editorial-workspace-profile',
  enableEditorialWorkspaceProfile: 'ai7:j15:enable-editorial-workspace-profile',
  listBooks: 'ai7:j01:list-books',
  prepareNewBookReview: 'ai7:j01:prepare-new-book-review',
  commitNewBookImport: 'ai7:j01:commit-new-book-import',
  prepareSourceImportReview: 'ai7:j01:prepare-source-import-review',
  commitSourceImport: 'ai7:j01:commit-source-import',
  prepareManuscriptReimport: 'ai7:j01:prepare-manuscript-reimport',
  getReimportMappingPage: 'ai7:j01:get-reimport-mapping-page',
  getReimportIdentityCandidatePage: 'ai7:j01:get-reimport-identity-candidate-page',
  getReimportLineageSourceVersionPage: 'ai7:j01:get-reimport-lineage-source-version-page',
  acceptReimportDegradation: 'ai7:j01:accept-reimport-degradation',
  resolveReimportMapping: 'ai7:j01:resolve-reimport-mapping',
  commitManuscriptReimport: 'ai7:j01:commit-manuscript-reimport',
  acknowledgeImportCompletion: 'ai7:j01:acknowledge-import-completion',
  getManuscriptWindow: 'ai7:j01:get-manuscript-window',
  flushJournalEdit: 'ai7:j01:flush-journal-edit',
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

export type FidelityCategoryKey =
  | 'inline-styles'
  | 'comments-revisions'
  | 'notes'
  | 'tables'
  | 'images-captions'
  | 'sections'
  | 'headers-footers'
  | 'round-trip-export';

export type FidelityStatus = 'preserved' | 'degraded' | 'unsupported';

export interface FidelityCategoryProjection {
  key: FidelityCategoryKey;
  label: string;
  count: number;
  status: FidelityStatus;
  statusLabel: '完整保留' | '降级导入' | '不支持导入';
  detail: string;
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
      sourceDigest: string;
      contentDigest: string;
      structureDigest: string;
      parserIdentity: string;
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
        format: 'DOCX';
        displayName: string;
        sourceSha256: string;
        sourceBytes: number;
        contentDigest: string;
        structureDigest: string;
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
      recordDigest: string;
      importedAt: string;
    };

export interface BookHistoryCursor {
  occurredAt: string;
  kindRank: number;
  stableId: string;
  direction: 'forward' | 'backward';
}

export interface BookWorkOverviewProjection {
  book: {
    bookId: string;
    stableIdentity: string;
    title: string;
    internalNumber: string | null;
    createdAt: string;
  };
  manuscriptState:
    | { state: 'empty'; label: '尚无稿件' }
    | { state: 'populated'; label: '已有主稿件'; manuscriptId: string };
  primaryAction:
    | { kind: 'import-first-manuscript'; label: '导入首份稿件'; bookId: string }
    | { kind: 'open-manuscript'; label: '打开稿件'; manuscriptId: string; branchId: string };
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
    '不授予 Provider、凭据、网络、Effect、Enrollment 或 Apply 权限',
  ];
}

export interface BookSummaryProjection {
  bookId: string;
  stableIdentity: string;
  title: string;
  internalNumber: string | null;
  manuscriptState: 'empty' | 'populated';
  manuscriptStateLabel: '尚无稿件' | '已有主稿件';
  reimportLineageSourceVersionIds: ReadonlyArray<string>;
  reimportLineageNextCursor: string | null;
}

export interface BookSummaryCursor {
  title: string;
  bookId: string;
}

export interface BookSummaryPageProjection {
  items: ReadonlyArray<BookSummaryProjection>;
  nextCursor: BookSummaryCursor | null;
}

export interface BookCreationCommitProjection {
  completionLabel: '图书已创建';
  overview: BookWorkOverviewProjection;
}

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
    format: 'DOCX';
    sourceSha256: string;
    sourceBytes: number;
    provenanceLabel: '本机文件选择器 · 本地解析 · 未联网';
  };
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
    label: '保留完整所选 DOCX 文件及本地解析出的完整内容与结构身份';
    format: 'DOCX';
    displayName: string;
    sourceSha256: string;
    sourceBytes: number;
    contentDigest: string;
    structureDigest: string;
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
  };
  fidelity: ReadonlyArray<FidelityCategoryProjection>;
  degradationDecision: ImportDegradationDecisionReviewProjection;
  commitReady: boolean;
  recordsToCreate: ReadonlyArray<string>;
  namedNonEffects: ReadonlyArray<string>;
}

export interface ReimportMappingPageProjection {
  draftId: string;
  draftVersion: number;
  reviewDigest: string;
  items: ReadonlyArray<ReimportMappingProjection>;
  previousCursor: number | null;
  nextCursor: number | null;
}

export interface ReimportIdentityCandidatePageProjection {
  draftId: string;
  draftVersion: number;
  mappingId: string;
  items: ReadonlyArray<{
    currentBlockId: string;
    position: number;
    kind: 'title' | 'heading' | 'paragraph';
    level: number | null;
    text: string;
    digest: string;
  }>;
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

export interface LaunchPolicyProjection {
  integrityState: 'verified' | 'denied';
  denialReason: string | null;
  operationalScope: 'development-ci' | null;
  activePolicySetVersion: 'v3' | null;
  providerProcessing: {
    version: 'v1' | null;
    decision: 'deny';
    authorizedLiveTransmissionCount: 0;
    liveTransmissionAllowed: false;
    label: '开发与持续集成：零次实时传输';
  };
  externalExport: {
    version: 'v1' | null;
    policyEligibilityIsEffectApproval: false;
    currentExportEffectAvailable: false;
    label: '对外导出策略独立；当前未提供导出受控动作';
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

export interface MilestoneProjection {
  milestoneId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  label: string;
  purpose: string;
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
  kind: 'search' | 'replacement' | 'reimport-preparation' | 'reimport-resolution' | 'reimport-commit';
  state: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  progress: { completed: number; total: number; label: string };
  result: SearchSummaryProjection | ReplacementPreviewProjection | ReviewBeforeManuscriptReimportProjection |
    ManuscriptReimportCommitProjection | null;
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
  stageSelectedDocx: {
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
  listBooks: {
    input: { after: BookSummaryCursor | null };
    output: BookSummaryPageProjection;
  };
  prepareNewBookReview: {
    input: {
      draftId: string;
      expectedDraftVersion: number;
      target: ImportTargetSelection;
      acceptDegradation: boolean;
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
  getReimportIdentityCandidatePage: {
    input: { draftId: string; expectedDraftVersion: number; mappingId: string; after: number | null };
    output: ReimportIdentityCandidatePageProjection;
  };
  getReimportLineageSourceVersionPage: {
    input: { bookId: string; after: string | null };
    output: ReimportLineageSourceVersionPageProjection;
  };
  acceptReimportDegradation: {
    input: { draftId: string; expectedDraftVersion: number };
    output: ReviewBeforeManuscriptReimportProjection;
  };
  resolveReimportMapping: {
    input: {
      draftId: string;
      expectedDraftVersion: number;
      mappingId: string;
      resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity';
      currentBlockId: string | null;
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
    input: { manuscriptId: string; branchId: string; label: string; purpose: string; note: string };
    output: MilestoneProjection;
  };
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
  selectAndStageDocx(): Promise<PickerStageResult>;
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
  listBooks(input: ServiceOperationMap['listBooks']['input']): Promise<BookSummaryPageProjection>;
  prepareNewBookReview(input: ServiceOperationMap['prepareNewBookReview']['input']): Promise<ReviewBeforeImportProjection>;
  commitNewBookImport(input: CommitNewBookRendererInput): Promise<ManuscriptImportCommitProjection>;
  prepareSourceImportReview(input: ServiceOperationMap['prepareSourceImportReview']['input']): Promise<ReviewBeforeSourceImportProjection>;
  commitSourceImport(input: CommitSourceImportRendererInput): Promise<SourceImportCommitProjection>;
  prepareManuscriptReimport(input: ServiceOperationMap['prepareManuscriptReimport']['input']): Promise<ServiceJobProjection>;
  getReimportMappingPage(input: ServiceOperationMap['getReimportMappingPage']['input']): Promise<ReimportMappingPageProjection>;
  getReimportIdentityCandidatePage(input: ServiceOperationMap['getReimportIdentityCandidatePage']['input']): Promise<ReimportIdentityCandidatePageProjection>;
  getReimportLineageSourceVersionPage(input: ServiceOperationMap['getReimportLineageSourceVersionPage']['input']): Promise<ReimportLineageSourceVersionPageProjection>;
  acceptReimportDegradation(input: ServiceOperationMap['acceptReimportDegradation']['input']): Promise<ReviewBeforeManuscriptReimportProjection>;
  resolveReimportMapping(input: ServiceOperationMap['resolveReimportMapping']['input']): Promise<ServiceJobProjection>;
  commitManuscriptReimport(input: CommitManuscriptReimportRendererInput): Promise<ServiceJobProjection>;
  acknowledgeImportCompletion(input: ServiceOperationMap['acknowledgeImportCompletion']['input']): Promise<{ state: 'acknowledged' }>;
  getManuscriptWindow(input: ServiceOperationMap['getManuscriptWindow']['input']): Promise<ManuscriptWindowProjection>;
  flushJournalEdit(input: JournalEditInput): Promise<JournalAcknowledgement>;
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
