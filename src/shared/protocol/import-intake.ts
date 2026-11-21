import type { ServiceJobProjection, ReimportGroupVerb, ReimportMappingPageProjection, ReimportLineageSourceVersionPageProjection } from '../protocol.js';
import type { BookRecordPresentation, BookSummaryCursor, BookWorkOverviewProjection, ImportStructureChoice, ImportStructureProjection, ManuscriptWindowProjection, ReviewBeforeManuscriptReimportProjection, ServiceOperationMap } from '../protocol.js';
/**
 * What a staged import says about how its file was read and what it resembles (ADR 0072 §2, §3), moved out of `protocol.ts`
 * (Issue #1205, F-25) unchanged.
 */

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


export type CommitNewBookRendererInput = Omit<ServiceOperationMap['commitNewBookImport']['input'], 'commitId'> & {
  commitAttemptId: string | null;
};


export type CommitSourceImportRendererInput = Omit<ServiceOperationMap['commitSourceImport']['input'], 'commitId'> & {
  commitAttemptId: string | null;
};


export type CommitManuscriptReimportRendererInput = Omit<ServiceOperationMap['commitManuscriptReimport']['input'], 'commitId'> & {
  commitAttemptId: string | null;
};

/** The page to reopen after returning from import details. */
export type ReturnImportToEditingProjection =
  | { state: 'staged'; draftVersion: number; staged: StagedImportProjection }
  | { state: 'reimport'; draftVersion: number; review: ReviewBeforeManuscriptReimportProjection };

export interface ImportReviewServiceOperations {
  returnImportToEditing: {
    input: { draftId: string; expectedDraftVersion: number };
    output: ReturnImportToEditingProjection;
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
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string; acceptDegradation?: boolean };
    output: { draftId: string; commitId: string; bookId: string };
  };
  commitManuscriptReimport: {
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string; acceptDegradation?: boolean };
    output: ServiceJobProjection;
  };
  acknowledgeImportCompletion: {
    input: { commitId: string };
    output: { state: 'acknowledged' };
  };
}
