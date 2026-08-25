export const SERVICE_PROTOCOL_VERSION = 1 as const;
export const MAX_FRAME_BYTES = 512 * 1024;
export const MAX_WINDOW_BLOCKS = 32;
export const MAX_BLOCK_GRAPHEMES = 8_192;
export const MAX_EDIT_GRAPHEMES = 256;

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

export interface StagedImportProjection {
  draftId: string;
  draftVersion: number;
  source: {
    displayName: string;
    format: 'DOCX';
    sourceSha256: string;
    provenanceLabel: '本机文件选择器 · 本地解析 · 未联网';
  };
  titleSuggestion: {
    value: string;
    sourceLabel: 'DOCX 标题元数据' | '文档首个标题' | '文件名';
  };
  targetChoices: ReadonlyArray<{
    id: 'new-book';
    label: '新建图书';
    selected: false;
  }>;
  fidelity: ReadonlyArray<FidelityCategoryProjection>;
  detectedBlockCount: number;
}

export interface ReviewBeforeImportProjection {
  draftId: string;
  draftVersion: number;
  reviewDigest: string;
  target: {
    kind: 'new-book';
    label: '新建图书';
    confirmedTitle: string;
  };
  source: StagedImportProjection['source'];
  fidelity: ReadonlyArray<FidelityCategoryProjection>;
  recordsToCreate: ReadonlyArray<string>;
  nonEffects: ReadonlyArray<string>;
  workflowProfile: {
    id: string;
    name: string;
    version: string;
    digest: string;
  };
  editorialDimensionSet: {
    profileId: string;
    profileVersion: string;
    digest: string;
    weightSemantics: '中性起始权重；非穷尽评分量表';
    dimensions: ReadonlyArray<{
      id: string;
      label: string;
      weight: number;
    }>;
  };
  degradationDecision: 'not-created-clean-import';
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
  revisionLabel: 'r1';
  journalSequence: number;
  previousCursor: string | null;
  nextCursor: string | null;
  position: {
    startBlock: number;
    endBlock: number;
    totalBlocks: number;
    label: string;
  };
  blocks: ReadonlyArray<ManuscriptBlockProjection>;
}

export interface ImportCommitProjection {
  commitId: string;
  importedAt: string;
  completionLabel: '稿件已导入';
  bookId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  importRecordId: string;
  firstWindow: ManuscriptWindowProjection;
}

export interface JournalEditInput {
  clientEditId: string;
  manuscriptId: string;
  branchId: string;
  baseRevisionId: string;
  blockId: string;
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
}

export interface ServiceReadiness {
  protocolVersion: typeof SERVICE_PROTOCOL_VERSION;
  state: 'ready';
  harness: {
    state: 'mounted-dormant';
    executionReady: false;
    providerFree: true;
    agents: 0;
    sessions: 0;
    providers: 0;
    configurableProviders: 0;
    tools: 0;
    renderedPrompt: '';
  };
}

export interface ServiceOperationMap {
  ready: { input: Record<string, never>; output: ServiceReadiness };
  stageSelectedDocx: {
    input: { selectionToken: string; selectedPath: string };
    output: StagedImportProjection;
  };
  prepareNewBookReview: {
    input: { draftId: string; expectedDraftVersion: number; confirmedTitle: string };
    output: ReviewBeforeImportProjection;
  };
  commitNewBookImport: {
    input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string };
    output: ImportCommitProjection;
  };
  getManuscriptWindow: {
    input: { manuscriptId: string; branchId: string; cursor: string | null };
    output: ManuscriptWindowProjection;
  };
  flushJournalEdit: { input: JournalEditInput; output: JournalAcknowledgement };
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

export interface RendererApi {
  readonly platform: 'win32' | 'darwin';
  selectAndStageDocx(): Promise<PickerStageResult>;
  prepareNewBookReview(input: ServiceOperationMap['prepareNewBookReview']['input']): Promise<ReviewBeforeImportProjection>;
  commitNewBookImport(input: ServiceOperationMap['commitNewBookImport']['input']): Promise<ImportCommitProjection>;
  getManuscriptWindow(input: ServiceOperationMap['getManuscriptWindow']['input']): Promise<ManuscriptWindowProjection>;
  flushJournalEdit(input: JournalEditInput): Promise<JournalAcknowledgement>;
}
