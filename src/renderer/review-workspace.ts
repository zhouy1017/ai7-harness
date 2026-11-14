import { createDispatchChooser } from './components/dispatch-chooser.js';
import type { RuntimeExecutionConfig } from '../shared/runtime-execution-config.js';
import { reviewFindingHasGuessedAnchor } from '../shared/review-basis.js';
import { reviewReportExportButton } from './review-report-export.js';
import { technicalWords, identityWords, technicalLayerVisible } from './technical-layer.js';
import { createSheet, sheetContent } from './components/sheet.js';
import { readActionDefaults, rememberActionDefaults } from './action-defaults.js';
import { showToast } from './components/toast.js';
import { filterChoices, menuPanel } from './components/controls.js';
import { recordedReviewBasisWords, reviewBasisWords } from './review-basis.js';
import { reviewExcludedHeading, estimateReviewCalls, reviewConsequenceEstimate } from './review-labels.js';
import { learningReasonAskCard } from './analysis-feedback.js';
import { taskMaterialSelection } from './task-material-selection.js';
import { appendTaskPlanPage, retainTaskPlanPages } from './analysis-paging.js';
import { TASK_PAGE_FAILED, TASK_SELECTED_CHAPTER_NOT_LOADED, taskPageMore } from './analysis-paging-labels.js';
import { LEARNING_AUDIT_KIND_LABELS } from './learning-audit-labels.js';
import {
  MAX_BATCH_APPLY_SUGGESTIONS,
  REVIEW_FINDING_SEVERITIES,
  REVIEW_FINDING_SEVERITY_LABELS,
  REVIEW_FINDING_STATUSES,
  REVIEW_FINDING_STATUS_LABELS,
  REVIEW_SCOPE_KINDS,
  REVIEW_SCOPE_LABELS,
  type ReviewChapterOptionProjection,
  type ReviewFindingPageRequest,
  type ReviewFindingProjection,
  type ReviewReportProjection,
  type ReviewRunCategoryProjection,
  type ReviewRunProjection,
  type ReviewRunScopeRequest,
  type ReviewScopeKind,
  type CapturedProcedureApplicabilityEntryProjection,
  type CapturedProcedureRunProjection,
  type ReviewWorkspaceCategoryProjection,
  type ReviewWorkspaceProjection,
  type RendererApi,
  type ResearchEvidenceBookProjection,
  type ReviewEvidenceSource,
  type ServiceWireJobProjection as ServiceJobProjection,
} from '../shared/protocol.js';
import { findingResearchLines, readFindingResearch, readFindingSources } from './research-evidence-labels.js';
import { findingEvidenceList } from './research-evidence.js';
import { mountEvidenceWorkspace, type EvidenceWorkspaceSurface } from './evidence-workspace.js';
import {
  FACT_CLOSE_WORKSPACE,
  FACT_LENS_EMPTY_FILTERED,
  FACT_LENS_FILTER_ALL,
  FACT_LENS_FILTER_LABELS,
  FACT_LENS_HEADING,
  FACT_LENS_MORE,
  FACT_LENS_NOTE,
  FACT_OPEN_WORKSPACE,
  FACT_SEVERITY_LABELS,
  factActionLine,
  factDecisionLine,
  factLensCountsLine,
  factLevelLine,
  factLocationLine,
  factStateLines,
  outcomeTone,
} from './evidence-workspace-labels.js';
import {
  FACTUAL_ACTION_NEED_LABELS,
  FACTUAL_SOURCE_CONDITION_LABELS,
  FACTUAL_VERIFICATION_OUTCOMES,
  type FactualActionNeed,
  type FactualSourceCondition,
  type FactualVerificationLensFilters,
  type FactualVerificationLensProjection,
  type FactualVerificationResultProjection,
} from '../shared/protocol.js';
import { reportExportLabel } from '../shared/report-wording.js';
import { applyOnce } from './manuscript-apply.js';
import { mountHouseWordList } from './house-word-list.js';
import { parseBookTerms, validBookTerms } from '../shared/protocol/deterministic.js';
import type { BookTermEntry } from '../shared/protocol/procedures.js';
import { openProcedureCapture } from './procedure-capture.js';
import {
  ProcedureChoiceRequests,
  procedureCategoryOpen,
  procedureChoiceSelection,
  procedureSheetCloseStatus,
  settleProcedureChoice,
  procedurePreparationPin,
  ProcedureRecommendationSelection,
  mountProcedureRecommendation,
  type ProcedureChoiceOutcome,
} from './procedure-choice.js';
import {
  CAPTURE_ACTION,
  SHEET_PROCEDURE_LABEL,
  SHEET_PROCEDURE_NONE,
  SHEET_PROCEDURE_NONE_ENABLED,
  SHEET_PROCEDURE_VERSION_LABEL,
  sheetProcedureOption,
  sheetProcedureVersionOption,
  runProcedureLeftOutView,
  runProcedureLine,
  sheetProcedureLines,
} from './captured-procedure-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { mountManuscriptExport } from './manuscript-export.js';
import { EXPORT_ACTION_LABELS, exportOpenAccessibleName } from './manuscript-export-labels.js';
import { TASK_PLAN_OPEN_START, taskPlanSummaryLine } from './task-drawer-labels.js';
import {
  REVIEW_ACTION_LABELS,
  REVIEW_ANCHOR_CHANGED,
  REVIEW_BATCH_ALL_OR_NONE,
  REVIEW_BATCH_NOTHING,
  REVIEW_BATCH_REFUSED,
  REVIEW_BLOCK_GONE,
  REVIEW_CANNOT_APPLY,
  REVIEW_CANNOT_CONVERT,
  REVIEW_CAPABILITY_REASON,
  REVIEW_CARD_HEADING,
  REVIEW_CATEGORY_LEGEND,
  REVIEW_CATEGORY_STATE_PILLS,
  REVIEW_CHAPTERS_REVERSED,
  REVIEW_CHAPTER_FROM,
  REVIEW_CHAPTER_PLACEHOLDER,
  REVIEW_CHAPTER_TO,
  REVIEW_CONSEQUENCE_TERMS,
  REVIEW_CONTINUE_NOTE,
  REVIEW_INFLUENCE_HEADING,
  REVIEW_INFLUENCE_STOP_NOTE,
  REVIEW_SCOPE_CANCEL_NOTE,
  REVIEW_SCOPE_STOP_NOTE,
  reviewInfluenceLine,
  reviewInfluenceMaterialLine,
  reviewInfluenceMore,
  reviewMarkerRemediationLine,
  REVIEW_CONVERT_NOTE,
  REVIEW_CONVERT_RATIONALE,
  REVIEW_CONVERT_TO,
  REVIEW_CONVERT_TO_HINT,
  REVIEW_COVERAGE_HEADING,
  REVIEW_COVERAGE_PILLS,
  REVIEW_EXPORT_NEEDS_REPORT,
  REVIEW_FILTER_ALL,
  REVIEW_FILTER_LABELS,
  REVIEW_IGNORE_LABEL,
  REVIEW_LEDE,
  REVIEW_NOT_DO,
  REVIEW_NO_FILTERED_FINDINGS,
  REVIEW_NO_FINDINGS,
  REVIEW_NO_RUNS,
  REVIEW_PICK_CATEGORY,
  REVIEW_PICK_CHAPTERS,
  REVIEW_PICK_SCOPE,
  REVIEW_PLAN_HEADING,
  REVIEW_PROGRESS_HEADING,
  REVIEW_REPORT_HEADING,
  REVIEW_REPORT_NO_MUST_ITEMS,
  REVIEW_REPORT_OVERVIEW_COLUMNS,
  REVIEW_REPORT_STATISTICS_CHAPTER,
  REVIEW_REPORT_TOTAL,
  REVIEW_REPORT_WAIT_RUNNING,
  REVIEW_RESULTS_HEADING,
  REVIEW_RISK_POINT,
  REVIEW_RUNS_HEADING,
  REVIEW_RUN_STATE_PILLS,
  REVIEW_SCOPE_LEGEND,
  REVIEW_SEVERITY_PILLS,
  REVIEW_SHEET_TITLE,
  REVIEW_STATUS_LINES,
  REVIEW_STATUS_PILLS,
  REVIEW_WORKSPACE_UNAVAILABLE,
  reviewAuthorizedLine,
  reviewBatchAppliedLine,
  reviewBatchUndoneLine,
  REVIEW_BATCH_UNDO_FAILED,
  REVIEW_IGNORE_DEFAULT_REASON,
  reviewBatchCappedLine,
  reviewBatchExcludedLine,
  reviewBatchItemLine,
  reviewBatchReadyLine,
  reviewBatchScopeLine,
  reviewCategoryProgressLine,
  reviewChapterOptionLabel,
  reviewClauseLine,
  reviewCountsLine,
  reviewChangedScopeNotes,
  reviewCoverageChanges,
  reviewCoverageLastReview,
  reviewCreatedLine,
  reviewFilteredLine,
  reviewFindingLocation,
  reviewGenerateReportLabel,
  reviewGroupCountLine,
  reviewIgnoreReasonLine,
  reviewIgnoreReasonProblem,
  reviewLiveLine,
  reviewManuscriptLine,
  reviewPlanCategoriesLine,
  reviewQuote,
  reviewReplacementLine,
  reviewReportAppendixLine,
  reviewReportConfigurationLine,
  reviewReportExcludedLine,
  reviewReportFindingHeading,
  reviewReportFindingLines,
  reviewReportGeneratedLine,
  reviewReportMustItemLine,
  reviewReportOmittedLine,
  reviewReportTotalsLine,
  reviewReportVersionLine,
  reviewResultsCountsLine,
  reviewRunHeading,
  reviewRunLine,
  reviewRunMetaLine,
  reviewRunReportLine,
  reviewRunsTruncatedLine,
  reviewShownLine,
  type ReviewAction,
  type ReviewPill,
} from './review-labels.js';

/**
 * ②B 审阅 (Issue #417; editor-surfaces §4, V2-UX-REV-001 to REV-013, MARK-010, FIND-002): the Book-level
 * review destination. One card holds the coverage matrix, the 审阅记录 and 新建审阅, and below them the
 * opened Review Run — each category's progress, its findings as
 * they become actionable (REV-008), and its versioned Report. 新建审阅 uses the shared non-modal sheet.
 *
 * Everything here reads the service's projection and asks the service again after every action: a
 * finding's status, a Run's state and every count come from the records, never from this surface. A
 * decision on a finding goes through the mark and Apply operations with the finding's mark, so the
 * manuscript and 审阅 are one record family; 忽略并说明 is the only review-owned disposition.
 */
export interface ReviewFocus {
  readonly reviewRunId: string;
  /** The finding to bring into view and focus once the Run is on screen; `null` for the Run alone. */
  readonly findingId: string | null;
}

export interface ReviewWorkspaceSurface {
  openNew(): void;
  /** Read the workspace for the first time; called once the destination is on screen. */
  start(): void;
  /** Read the workspace again: the Task Drawer's bar just approved the Run on show (Issue #420, S74a). */
  refresh(): void;
  /** Stop polling, close the sheet, and let nothing still in flight paint again: the screen is being replaced. */
  destroy(): void;
}

type ReviewApi = Partial<Pick<RendererApi, 'inspectBookSeries' | 'inspectHouseWordList' | 'saveHouseWordList'>> & Pick<
  RendererApi,
  'getModelServiceSettings' | 'launchReviewRun' | 'inspectReviewWorkspace' | 'prepareReviewRun' | 'continueReviewRun' | 'cancelReviewRun' | 'recordReviewFindingDisposition' | 'recordLearningReasonAsk' |
  'getTaskPlanPage' | 'searchReferableMaterials' |
  'generateReviewReport' | 'applyChangeSuggestion' | 'applyChangeSuggestionBatch' | 'getManuscriptApplyOutcome' | 'inspectApplyReceipt' |
  'updateEditorialMark' | 'getEditorialMarkCard' | 'reverseAppliedChangeSuggestion' |
  'reviewManuscriptExport' | 'chooseManuscriptExportDestination' | 'approveManuscriptExport' | 'revealManuscriptExport' |
  // 可复用工序 (Issue #65, S30; ADR 0087): capture from a finished Run, and 按已保存的工序 on 新建审阅.
  'inspectProcedureCapture' | 'saveCapturedProcedure' | 'saveDeveloperProposal' | 'inspectCapturedProcedureApplicability' | 'inspectCapturedProcedureRun' | 'recommendProcedures' | 'procedureLibrary' |
  // 事实核查's retained sources on its finding cards (Issue #425, S70).
  'inspectProposalWorkspace' | 'inspectResearchEvidence' |
  // The Fact-check Lens and the Evidence Workspace (Issue #901).
  'inspectFactualVerification' | 'inspectEvidenceWorkspace' | 'recordVerificationReviewDecision' | 'prepareCorrectionProposal' | 'saveCorrectionProposal'
>;

export interface MountReviewWorkspaceOptions {
  /** The destination's panel: the surface appends its heading and its host, and the caller its persistent actions after them. */
  root: HTMLElement;
  bookId: string;
  bookTitle: string;
  focus: ReviewFocus | null;
  /** 运行此工序… from 知识库 (Issue #65, S30): the Captured Procedure the 新建审阅 sheet opens filled from, once the Book is read. */
  procedureId?: string | null;
  api: ReviewApi;
  awaitServiceJob(initial: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void): Promise<ServiceJobProjection>;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  errorCode(error: unknown): string | null;
  /** 打开稿件 — the manuscript at the editor's last position, as the destination's own action opens it. */
  openManuscript(): Promise<void>;
  /** 回到原文: the manuscript at the finding's block, with the mark's card open when the mark still stands. */
  goToText(target: { manuscriptId: string; branchId: string; blockId: string; markId: string | null }): Promise<void>;
  /** 查看计划并开始 (S72 D4, S74a A5): a Review Run's plan opens in the Task Drawer, whose bar approves it. */
  openProposalWorkspace?(input: { manuscriptId: string; branchId: string; resultId: string | null }): void;
  openPlan(reviewRunId: string): void;
  openSearchSettings?(): void;
  openRules?(): void;
  /** The Run on show changed state: the drawer reads its plan again if it shows it. */
  planChanged(): void;
  /** 开始审阅 recorded this Run's authorization from the sheet, as the drawer's 开始任务 would (ADR 0096 §3). */
  recorded?(reviewRunId: string): void;
  /** 在来源与证据中查看 (Issue #901): the Book's 来源与证据 view, brought to one retained source. */
  openSource?(evidenceId: string): void;
  /** 查看学习来源链 (Issue #912; LAUD-004): 学习回溯 opened at one material's Learning Lineage Explorer. */
  openLearningLineage?(bookId: string, materialKey: string, reviewRunId: string): void;
}

type Filters = Omit<ReviewFindingPageRequest, 'findingsAfterOrdinal' | 'excludedAfterOrdinal'>;
type FilterName = 'category' | 'severity' | 'status' | 'chapter';

interface IgnoreForm {
  readonly findingId: string;
  reason: string;
  problem: string | null;
}

interface ConvertForm {
  readonly findingId: string;
  readonly markId: string;
  readonly blockId: string;
  proposedText: string;
  rationale: string;
  problem: string | null;
}

interface BatchItem {
  readonly findingId: string;
  readonly markId: string;
  readonly blockId: string;
  readonly quote: string;
  readonly replacement: string;
}

interface BatchStrip {
  readonly categoryId: string;
  readonly items: ReadonlyArray<BatchItem>;
  readonly excluded: number;
  readonly capped: boolean;
  problem: string | null;
  /** The Effect was refused or its outcome is unknown: only 重新准备应用 is offered, never the same 确认应用 again. */
  refused: boolean;
  capability: boolean;
  unknown: boolean;
}

/** The paragraphs a 当前选区 Run named (Issue #423 review, P2-4): 返回修改 asks for the same ones again. */
type SheetSelection = { readonly fromBlockId: string; readonly toBlockId: string };

interface SheetState {
  estimate?: string;
  launchInput?: string;
  executionConfig?: RuntimeExecutionConfig;
  chooser?: ReturnType<typeof createDispatchChooser>;
  choicePending?: boolean;
  choiceTicket?: number;
  launchPending?: boolean;
  clientCommandId?: string;
  dismissed: boolean;
  localOptions: import('../shared/protocol/procedures.js').LocalCheckOptions;
  houseWordListWanted: boolean;
  houseWordListRequest: number;
  houseWordListLoading: boolean;
  seriesId: string | null;
  readonly seriesChoices: ReadonlyArray<{ readonly seriesId: string; readonly title: string }>;
  readonly recommendation: ProcedureRecommendationSelection;
  readonly materialIds: Set<string>;
  readonly categories: Set<string>;
  /**
   * The selection the sheet holds: a 当前选区 Run's paragraphs, kept for 返回修改 and 修改计划并重新授权 (P2-4). The sheet holds no
   * selection of its own; without one, 当前选区 stays unavailable and is refused here, before anything is sent.
   */
  readonly selection: SheetSelection | null;
  scope: ReviewScopeKind | null;
  from: string | null;
  to: string | null;
  problem: string | null;
  /** Where focus returns when the sheet closes: the control that opened it. */
  readonly openerKey: string | null;
  /** The plan is on screen: focus goes to it instead of back to the opener. */
  launched: boolean;
  /** The enabled Captured Procedures 按已保存的工序 offers (Issue #65, S30), each as it applies to this Book (S31b), read when the sheet opens. */
  procedures: ReadonlyArray<CapturedProcedureApplicabilityEntryProjection>;
  /** The Captured Procedure the sheet was filled from, resolved for this Book; `null` for categories chosen by hand. */
  procedure: CapturedProcedureRunProjection | null;
  /** Its choices in flight (Issue #66, S31 review P2-1): only the newest answer fills the sheet, and 先看计划 waits for it. */
  readonly requests: ProcedureChoiceRequests;
  /** A composite Procedure Definition version opened by 运行此工序… (Issue #1173): its members are the categories, in its order. */
  definition: { readonly composite: boolean; readonly pin: import('../shared/protocol/procedures.js').ProcedureDefinitionPin; readonly title: string; readonly categoryIds: readonly string[] } | null;
}

function localOnly(state: SheetState): boolean {
  return state.definition === null && state.categories.has('local-text-check');
}

function categoryUnavailableReason(entry: ReviewWorkspaceCategoryProjection, state: SheetState): string | null {
  if (state.definition !== null && !state.definition.categoryIds.includes(entry.categoryId)) return '不在所选的固定成员工序里。';
  if (localOnly(state) && entry.categoryId !== 'local-text-check') return '本次仅运行本地文字检查；取消后恢复模型审阅类别。';
  const filled = state.procedure?.resolved ?? null;
  const step = filled?.steps.find((candidate) => candidate.categoryId === entry.categoryId) ?? null;
  const scope = state.scope === null ? null : entry.scopes[state.scope];
  return filled !== null && step === null ? '不在所选的可复用工序里。'
    : step !== null && !step.available ? step.unavailableReason
    : !entry.available ? entry.unavailableReason : scope !== null && !scope.available ? scope.unavailableReason : null;
}

/** Stored choices survive temporary conditions; only this effective set is estimated and submitted. */
function effectiveCategories(workspace: ReviewWorkspaceProjection, state: SheetState): string[] {
  // A definition is indivisible: the service requires its complete ordered membership, or no submission.
  if (state.definition !== null) return [...state.definition.categoryIds];
  const ordered = ['local-text-check', ...workspace.categories.filter((entry) => entry.categoryId !== 'local-text-check').map((entry) => entry.categoryId)];
  return ordered.filter((id) => {
    if (!state.categories.has(id)) return false;
    if (id === 'local-text-check') return workspace.manuscript !== null && state.scope !== 'changed';
    if (localOnly(state)) return false;
    const entry = workspace.categories.find((category) => category.categoryId === id);
    return entry !== undefined && (categoryUnavailableReason(entry, state) === null || entry.networkUnavailable === true);
  });
}

function sheetPreparationReason(workspace: ReviewWorkspaceProjection, state: SheetState): string | null {
  for (const id of state.definition?.categoryIds ?? []) {
    if (id === 'local-text-check') {
      if (workspace.manuscript === null) return '本地文字检查：导入稿件后即可检查。';
      if (state.scope === 'changed') return '本地文字检查请选择全书、选章或当前选区。';
      continue;
    }
    const entry = workspace.categories.find((category) => category.categoryId === id);
    if (entry === undefined) return '固定成员已不在审阅配置中，请重新打开此工序。';
    const why = categoryUnavailableReason(entry, state) ?? (entry.networkUnavailable === true ? '此类别需要联网检索。' : null);
    if (why !== null) return `${entry.label}：${why}`;
  }
  return state.categories.has('local-text-check') && state.houseWordListWanted && state.houseWordListLoading
    ? '正在更新本社词表版本，请稍候再开始审阅。' : null;
}

/** 运行此工序… names a Procedure Definition version as `id@version`; a Captured Procedure is named by its UUID alone. */
const PROCEDURE_DEFINITION_KEY = /^ai7-procedure\/[^@]+@[1-9][0-9]*$/u;

const NO_FILTERS: Filters = { categoryId: null, severity: null, status: null, chapterBlockId: null };
const FILTER_KEYS: Readonly<Record<FilterName, keyof Filters>> = {
  category: 'categoryId',
  severity: 'severity',
  status: 'status',
  chapter: 'chapterBlockId',
};
/** The 章节 choices a long Book's workspace carries in part (Issue #996), read on by the sheet's range and the findings filter. */
const CHAPTER_PAGE_PATH = 'scopeOptions.chapters.chapters';
/** A finding's mark that 回到原文 can open a card on: it still stands on the manuscript. */
const LIVE_MARK_STATUSES: ReadonlySet<string> = new Set(['open', 'resolved', 'applied']);
const CAPABILITY_CODE = 'AI7_EDITOR_CAPABILITY_INVALID';
/** How many pages 查看任务 reads to bring its finding into view, and the batch strip reads to list its category. */
const MAX_FOLLOW_PAGES = 40;
/** ②A's refresh interval while a Run executes. */
const POLL_MS = 250;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = identityWords(text, className);
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

/** The finding card discloses the recorded rules on demand through native details/summary. */
export function findingReferencedRules(finding: Pick<ReviewFindingProjection, 'referencedRuleVersions'>): HTMLDetailsElement | null {
  if ((finding.referencedRuleVersions?.length ?? 0) === 0) return null;
  const disclosure = el('details', 'review-referenced-rules');
  disclosure.dataset['referencedRules'] = '';
  disclosure.append(el('summary', 'status-pill', '已参考规则'));
  const rules = el('ul');
  for (const rule of finding.referencedRuleVersions ?? []) rules.append(el('li', undefined,
    `${rule.text}${technicalWords(` · 本社审阅偏好 v${rule.ordinal} · ${rule.versionId} · 行 ${rule.lineIndex + 1}`)}`));
  disclosure.append(rules);
  return disclosure;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `review-${prefix}-${identities}`;
}

function pillElement(text: string, pill: ReviewPill): HTMLElement {
  const node = el('span', `state-term status-pill review-pill review-pill-${pill.tone}`, text);
  node.dataset['pillTone'] = pill.tone;
  node.dataset['pillShape'] = pill.shape;
  return node;
}

/** What a projection is apart from the running category's measured progress, which changes with every poll. */
function stableKeyOf(projection: ReviewWorkspaceProjection): string {
  const run = projection.run;
  return JSON.stringify(run === null ? projection : { ...projection, run: { ...run, categories: run.categories.map((category) => ({ ...category, progress: null })) } });
}

/** A control's identity across a re-render: what it does, and the finding, category, Run or field it belongs to. */
function focusKeyOf(node: HTMLElement): string {
  return [
    node.tagName,
    node.dataset['reviewAction'] ?? '',
    node.dataset['reviewFilter'] ?? '',
    node.dataset['reviewField'] ?? '',
    node.closest<HTMLElement>('[data-finding-id]')?.dataset['findingId'] ?? '',
    node.closest<HTMLElement>('[data-review-category]')?.dataset['reviewCategory'] ?? '',
    node.closest<HTMLElement>('[data-review-run-id]')?.dataset['reviewRunId'] ?? '',
  ].join('|');
}

export function mountReviewWorkspace(options: MountReviewWorkspaceOptions): ReviewWorkspaceSurface {
  let pendingNew = false;
  const { api, bookId } = options;
  let destroyed = false;
  let generation = 0;
  let pollTimer: number | undefined;
  let projection: ReviewWorkspaceProjection | null = null;
  let stableKey = '';
  let working = false;
  let card: HTMLElement | undefined;
  let focusFindingId: string | null = options.focus?.findingId ?? null;
  let focusPages = 0;
  let focusRunHeading = false;
  let pendingProcedureId: string | null = options.procedureId ?? null;
  const query: { reviewRunId: string | null; filters: Filters; pages: number } = {
    reviewRunId: options.focus?.reviewRunId ?? null,
    filters: { ...NO_FILTERS },
    pages: 1,
  };
  /** Whether 切换历史记录 / 查看覆盖矩阵 is open; kept across redraws (Issue #1413 cluster 6). */
  let historyOpen = false;
  const ui: { ignore: IgnoreForm | null; convert: ConvertForm | null; batch: BatchStrip | null; capabilityFindingId: string | null;
    applied?: { categoryId: string; markIds: string[]; blockIds: string[]; skipped: number } | null; } = {
    ignore: null,
    convert: null,
    batch: null,
    capabilityFindingId: null,
  };
  let sheetState: SheetState | null = null;
  /** The Run whose 取消任务 waits for its confirmation (Issue #64, S29b); `null` while none does. */
  let scopeCancel: string | null = null;
  let sheetOpening = false;
  /** Redraws what follows from the sheet's choices in place; set while the sheet is open. */
  let sheetUpdate: () => void = () => undefined;
  /** A control a re-render has only just created and focus belongs on: a form's field once it opens, the strip once it is listed. */
  let pendingFocus: { findingId: string | null; field: string } | null = null;

  const host = el('div', 'review-host');
  host.dataset['reviewBookId'] = bookId;
  // The running progress is announced from one element that outlives every re-render; a live region that
  // is itself replaced is never heard.
  const live = el('p', 'review-live');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const sheet = createSheet('review-sheet');
  const sheetTitleId = uid('sheet-title');
  sheet.setAttribute('aria-labelledby', sheetTitleId);
  host.append(live, sheet);
  options.root.append(host);

  // The 审阅报告's export (Issue #500, S64b part 2; ADR 0079 §3.4): ④ 导出's own card, drawn into one slot that every
  // render of the report section takes back under its actions, so a card open across a redraw keeps its state. It
  // belongs to the Run whose report it exports and closes when another Run is opened; an export changes nothing here.
  const exportSlot = el('div', 'review-report-export-slot');
  let exportRunId: string | null = null;
  const exporter = mountManuscriptExport({
    root: exportSlot,
    bookId,
    api,
    technicalDetails: options.technicalDetails,
    setStatus: options.setStatus,
    errorMessage: options.errorMessage,
    onChanged: () => undefined,
    openerOf: () => host.querySelector<HTMLElement>('section.review-report [data-review-action="export"]'),
  });

  // ---- reading --------------------------------------------------------------------------------------

  const filtersInput = (): Filters => ({ ...query.filters });

  /**
   * The Book's retained external sources, read beside a Run that has 事实核查 (Issue #425, S70): each of its finding cards
   * lists the sources retained for it, or why there is none. A read that fails leaves the cards as they were.
   */
  let research = new Map<string, ResearchEvidenceBookProjection>();
  // Each factual finding's sources as its card lists them (Issue #1174): the result's, less the excluded, joined to 来源与证据.
  let evidence = new Map<string, ReviewEvidenceSource[]>();
  const reasonAsks = new Map<string, HTMLElement>();
  const offerReasonAsk = (findingId: string, decisionId: string | null | undefined): void => {
    if (!decisionId) return;
    void api.recordLearningReasonAsk({ action: 'offer', decisionId }).then((ask) => {
      if (ask === null || destroyed) return;
      reasonAsks.set(findingId, learningReasonAskCard(ask, api));
      refresh(true);
    }).catch(() => {});
  };
  /**
   * The Fact-check Lens (Issue #901; FACT-004/005/007): the 事实核查 category's Versioned Verification Results, a bounded page at a
   * time over the service's cursor, with its own filters; and the Evidence Workspace each open row holds, kept across repaints.
   */
  const NO_FACT_FILTERS: FactualVerificationLensFilters = { chapterBlockId: null, outcome: null, severity: null, sourceCondition: null, actionNeed: null };
  const fact: { reviewRunId: string | null; lens: FactualVerificationLensProjection | null; results: FactualVerificationResultProjection[]; next: number | null; pages: number;
    filters: FactualVerificationLensFilters; open: Map<string, EvidenceWorkspaceSurface> } = { reviewRunId: null, lens: null, results: [], next: null, pages: 1, filters: { ...NO_FACT_FILTERS }, open: new Map() };
  const clearFactual = (reset: boolean): void => {
    for (const surface of fact.open.values()) surface.destroy();
    fact.open.clear();
    fact.lens = null;
    fact.results = [];
    fact.next = null;
    // A Lens painted for the cleared identity goes with it, even when no repaint follows: a pending or rejected read keeps the card.
    for (const section of Array.from(host.querySelectorAll<HTMLElement>('.fact-lens'))) section.remove();
    if (reset) {
      fact.reviewRunId = null;
      fact.pages = 1;
      fact.filters = { ...NO_FACT_FILTERS };
    }
  };
  const loadFactual = async (run: ReviewWorkspaceProjection['run'], ticket: number): Promise<void> => {
    const current = (): boolean => !destroyed && ticket === generation && host.isConnected;
    if (!current()) return;
    const factual = run?.categories.find((category) => category.categoryId === 'factual-review');
    if (run === null || factual === undefined || !(factual.state === 'settled' ||
      ((factual.state === 'failed' || factual.state === 'interrupted') && factual.findingsCount > 0))) {
      clearFactual(true);
      return;
    }
    if (fact.reviewRunId !== run.reviewRunId) clearFactual(true);
    fact.reviewRunId = run.reviewRunId;
    const filters = { ...fact.filters };
    const pages = fact.pages;
    try {
      let page = await api.inspectFactualVerification({ bookId, reviewRunId: run.reviewRunId, after: null, ...filters });
      if (!current()) return;
      if (page.bookId !== bookId || page.reviewRunId !== run.reviewRunId) { clearFactual(false); return; }
      const results = [...page.results];
      for (let count = 1; count < pages && page.nextCursor !== null; count += 1) {
        page = await api.inspectFactualVerification({ bookId, reviewRunId: run.reviewRunId, after: page.nextCursor, ...filters });
        if (!current()) return;
        if (page.bookId !== bookId || page.reviewRunId !== run.reviewRunId) { clearFactual(false); return; }
        results.push(...page.results);
      }
      fact.lens = page;
      fact.results = results.filter((result) => result.reviewRunId === run.reviewRunId);
      fact.next = page.nextCursor;
      const identities = new Set(fact.results.map((result) => result.resultId));
      for (const [id, surface] of fact.open) {
        if (identities.has(id)) continue;
        surface.destroy();
        fact.open.delete(id);
      }
    } catch {
      if (current()) clearFactual(false);
    }
  };
  const loadResearch = async (run: ReviewWorkspaceProjection['run']): Promise<void> => {
    const next = new Map<string, ResearchEvidenceBookProjection>();
    const task = run?.categories.find((category) => category.categoryId === 'factual-review')?.taskIntentId;
    if (run !== null && task != null) {
      for (const finding of run.findings.filter((entry) => entry.categoryId === 'factual-review')) {
        try { next.set(finding.findingId, await readFindingResearch(api, bookId, task, finding.findingId)); } catch { /* The read failure grants no source. */ }
      }
    }
    research = next;
    evidence = run === null || task == null ? new Map() : await readFindingSources(api, bookId, run.reviewRunId, next);
  };

  /** The workspace with as many pages of findings as the editor has asked to see, read one after another. */
  let excludedPages = 1;
  let excludedOpen = false;
  const load = async (ticket: number): Promise<ReviewWorkspaceProjection> => {
    let first = await api.inspectReviewWorkspace({ reviewRunId: query.reviewRunId, ...filtersInput(), ...(sheetState?.executionConfig === undefined ? {} : { executionConfig: sheetState.executionConfig }) });
    if (first.bookId !== bookId) {
      if (!destroyed && ticket === generation) clearFactual(true);
      return first;
    }
    if (first.run != null && excludedPages > 1) {
      const excluded = [...(first.run.excluded ?? [])];
      let nextOrdinal = first.run.excludedNextOrdinal;
      for (let page = 2; page <= excludedPages && nextOrdinal != null; page += 1) {
        const next = await api.inspectReviewWorkspace({ reviewRunId: first.run.reviewRunId, excludedAfterOrdinal: nextOrdinal });
        if (next.run?.reviewRunId !== first.run.reviewRunId) break;
        excluded.push(...(next.run.excluded ?? []));
        nextOrdinal = next.run.excludedNextOrdinal;
      }
      first = { ...first, run: { ...first.run, excluded, excludedNextOrdinal: nextOrdinal ?? null, excludedTruncated: nextOrdinal != null } };
    }
    const run = first.run;
    if (run === null || query.pages <= 1 || !run.findingsTruncated) { await loadResearch(run); await loadFactual(run, ticket); return first; }
    const findings = [...run.findings];
    let truncated: boolean = run.findingsTruncated;
    for (let page = 2; page <= query.pages && truncated && findings.length > 0; page += 1) {
      const next = await api.inspectReviewWorkspace({ reviewRunId: run.reviewRunId, findingsAfterOrdinal: findings.at(-1)!.ordinal, ...filtersInput() });
      if (next.run?.reviewRunId !== run.reviewRunId) break;
      findings.push(...next.run.findings);
      truncated = next.run.findingsTruncated;
    }
    const result = { ...first, run: { ...run, findings, findingsTruncated: truncated } };
    await loadResearch(result.run);
    await loadFactual(result.run, ticket);
    return result;
  };

  const clearPoll = (): void => {
    if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    pollTimer = undefined;
  };

  const schedulePoll = (): void => {
    clearPoll();
    pollTimer = window.setTimeout(() => {
      pollTimer = undefined;
      refresh();
    }, POLL_MS);
  };

  /**
   * Read the workspace again and paint it. Every read has a ticket: an answer that comes back after a
   * newer read began, after the destination was left, or for another Book never paints over the screen.
   */
  function refresh(force = false): void {
    if (destroyed) return;
    clearPoll();
    if (force) stableKey = '';
    const ticket = ++generation;
    if (fact.reviewRunId !== null && query.reviewRunId !== fact.reviewRunId) clearFactual(true);
    void load(ticket).then(
      (next) => {
        if (destroyed || ticket !== generation || !host.isConnected || next.bookId !== host.dataset['reviewBookId']) return;
        show(next);
      },
      (error) => {
        if (destroyed || ticket !== generation || !host.isConnected) return;
        if (projection === null) {
          renderUnavailable(error);
          return;
        }
        options.setStatus(options.errorMessage(error, REVIEW_STATUS_LINES.refreshFailed), 'error');
        if (projection.run?.state === 'running' || projection.run?.state === 'waiting') schedulePoll();
      },
    );
  }

  /** The next 章节 choices of the same snapshot (Issue #996), appended exactly once; a changed snapshot is refused. */
  async function readChapterPage(workspace: ReviewWorkspaceProjection): Promise<ReviewWorkspaceProjection> {
    const meta = workspace.listPages?.[CHAPTER_PAGE_PATH];
    if (meta === undefined || meta.nextOrdinal === null) throw new Error(TASK_PAGE_FAILED);
    const page = await api.getTaskPlanPage({ kind: 'review-run', ref: workspace.run?.reviewRunId ?? null, path: CHAPTER_PAGE_PATH,
      afterOrdinal: meta.nextOrdinal, digest: meta.digest });
    if (page.path !== CHAPTER_PAGE_PATH) throw new Error(TASK_PAGE_FAILED);
    return appendTaskPlanPage(workspace, page);
  }

  function show(next: ReviewWorkspaceProjection): void {
    const previous = projection;
    next = retainTaskPlanPages(next, previous);
    projection = next;
    // The drawer beside 审阅 states where the Run stands; it reads the plan again when that changes.
    if (previous?.run !== null && previous?.run !== undefined && previous.run.reviewRunId === next.run?.reviewRunId &&
        previous.run.state !== next.run.state) options.planChanged();
    if (query.reviewRunId === null && next.run !== null) query.reviewRunId = next.run.reviewRunId;
    const key = stableKeyOf(next);
    if (previous !== null && key === stableKey && card?.isConnected === true) {
      updateProgress(next);
    } else {
      stableKey = key;
      renderCard(next);
    }
    updateLive(previous, next);
    if (sheet.open) sheetUpdate();
    // A Run waiting to start once online is read again too (Issue #760, S74c), so 审阅 follows it into running.
    if (next.run?.state === 'running' || next.run?.state === 'waiting') schedulePoll();
    followFocus(next);
    if (pendingNew && card !== undefined) { pendingNew = false; const opener = card.querySelector<HTMLElement>('[data-review-action="new-review"]'); if (opener && next.newReview.available) void openSheet(null, opener); }
    // 运行此工序… from 知识库: the sheet opens filled from the procedure once this Book's workspace is on screen.
    if (pendingProcedureId !== null && card !== undefined) {
      const procedureId = pendingProcedureId;
      pendingProcedureId = null;
      const opener = card.querySelector<HTMLElement>('[data-review-action="new-review"]');
      if (opener !== null && next.newReview.available) void openSheet(null, opener, procedureId);
    }
  }

  function renderUnavailable(error: unknown): void {
    const unavailable = el('section', 'review-workspace-card attention-note');
    unavailable.dataset['reviewState'] = 'unavailable';
    unavailable.append(el('h3', undefined, REVIEW_CARD_HEADING), el('p', undefined, options.errorMessage(error, REVIEW_WORKSPACE_UNAVAILABLE)));
    swapCard(unavailable);
  }

  function swapCard(next: HTMLElement): void {
    if (card?.isConnected === true) card.replaceWith(next);
    else host.prepend(next);
    card = next;
  }

  /** Bring 查看任务's finding into view once it is on screen, reading further pages until it is. */
  function followFocus(next: ReviewWorkspaceProjection): void {
    if (focusRunHeading) {
      focusRunHeading = false;
      card?.querySelector<HTMLElement>('.review-run h4')?.focus();
    }
    if (focusFindingId === null || next.run === null) return;
    const article = card?.querySelector<HTMLElement>(`article.review-finding[data-finding-id="${focusFindingId}"]`);
    if (article) {
      focusFindingId = null;
      article.dataset['reviewFocused'] = 'true';
      article.scrollIntoView({ block: 'center' });
      article.focus({ preventScroll: true });
      return;
    }
    if (next.run.findingsTruncated && focusPages < MAX_FOLLOW_PAGES) {
      focusPages += 1;
      query.pages += 1;
      refresh();
      return;
    }
    focusFindingId = null;
  }

  function updateLive(previous: ReviewWorkspaceProjection | null, next: ReviewWorkspaceProjection): void {
    const run = next.run;
    let text = '';
    if (run !== null && run.state === 'running') {
      const current = run.categories.find((category) => category.state === 'running') ?? run.categories.find((category) => category.state === 'waiting') ?? null;
      text = reviewLiveLine(run.label, current);
    } else if (run !== null && previous?.run?.reviewRunId === run.reviewRunId && previous.run.state === 'running') {
      text = `${reviewRunHeading(run.label)} · ${run.stateLabel}`;
    } else {
      return;
    }
    if (live.textContent !== text) live.textContent = text;
  }

  // ---- the card ---------------------------------------------------------------------------------------

  /** Paint the whole card, keep the control that had focus focused, and focus what an action just opened. */
  /** Whether the opened Run has findings on show, so they lead the page (Issue #1413 cluster 6). */
  function runHasResults(run: ReviewRunProjection): boolean {
    return run.state !== 'prepared' && run.findings.length > 0;
  }

  function renderCard(next: ReviewWorkspaceProjection): void {
    paintCard(next);
    if (pendingFocus !== null && !working) applyPendingFocus();
  }

  function applyPendingFocus(): void {
    const target = pendingFocus;
    if (target === null || card === undefined) return;
    pendingFocus = null;
    if (target.field === 'batch') {
      card.querySelector<HTMLElement>('.review-batch-strip button:not(:disabled)')?.focus();
      return;
    }
    card.querySelector<HTMLElement>(`article[data-finding-id="${target.findingId}"] [data-review-field="${target.field}"]`)?.focus();
  }

  function paintCard(next: ReviewWorkspaceProjection): void {
    const active = document.activeElement;
    const restore = active instanceof HTMLElement && card?.contains(active) === true
      ? {
          key: focusKeyOf(active),
          selection: active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] as const : null,
        }
      : null;
    const node = el('section', 'review-workspace-card');
    const run = next.run;
    node.dataset['reviewState'] = run === null ? 'empty' : run.state;
    if (run !== null) {
      node.dataset['reviewRunId'] = run.reviewRunId;
      node.dataset['reviewRunOrdinal'] = String(run.ordinal);
    }
    node.setAttribute('aria-busy', run?.state === 'running' ? 'true' : 'false');
    const heading = el('div', 'review-workspace-heading');
    heading.append(el('h2', undefined, REVIEW_CARD_HEADING));
    if (run !== null && !runHasResults(run)) heading.append(pillElement(run.stateLabel, REVIEW_RUN_STATE_PILLS[run.state]));
    const hasReviews = next.runs.length > 0 || next.coverage.some((row) => row.lastRunOrdinal !== null);
    if (!hasReviews) {
      node.classList.add('surface-empty');
      heading.append(pillElement('尚未审阅', { tone: 'neutral', shape: 'circle' }));
      node.append(heading, el('p', 'lede', REVIEW_LEDE));
    } else node.append(heading);
    const newReviewReasonId = uid('new-review-reason');
    const actions = renderNewReview(next, newReviewReasonId);
    if (!hasReviews) node.append(actions);
    else if (run === null || !runHasResults(run)) heading.append(actions);
    // 导出审阅报告（DOCX） (Issue #1430): the Book's findings in one file, once any Run has found something.
    const hasFindings = next.runs.some((summary) => summary.findingCounts.must + summary.findingCounts.should + summary.findingCounts.note > 0);
    if (hasReviews) heading.append(reviewReportExportButton({ api, bookId, enabled: () => hasFindings, setStatus: options.setStatus, errorMessage: options.errorMessage }));
    if (hasReviews) {
      const changed = next.coverage.filter((row) => row.state === 'needs-review').length;
      if (changed > 0) node.append(el('p', 'attention-note review-coverage-warning', `稿件有改动，${changed} 类审阅需要复审。`));
      const history: HTMLElement[] = [];
      if (next.coverage.some((row) => row.lastRunOrdinal !== null) || next.runs.some((summary) => ['running', 'settled', 'partial', 'failed'].includes(summary.state))) {
        history.push(renderCoverage(next, newReviewReasonId));
      }
      history.push(renderRuns(next));
      if (run !== null && runHasResults(run)) {
        // With results on show the findings lead (Issue #1413 cluster 6): one compact line names the Run and how many
        // categories it reviewed; the coverage and the earlier Runs stay one keyboard-reachable disclosure away.
        const bar = el('div', 'review-summary-bar');
        const status = el('span', 'review-summary-status');
        status.append(pillElement(run.stateLabel, REVIEW_RUN_STATE_PILLS[run.state]), ` ${reviewRunHeading(run.label)} · 已审 ${run.categories.length} 类`);
        const fold = el('details', 'review-history-fold');
        fold.open = historyOpen;
        fold.addEventListener('toggle', () => { historyOpen = fold.open; });
        fold.append(el('summary', undefined, '切换历史记录 / 查看覆盖矩阵'), ...history);
        bar.append(status, fold, actions);
        node.append(bar);
      } else node.append(...history);
    }
    if (run !== null) node.append(renderRun(next, run));
    swapCard(node);
    if (restore !== null) {
      const match = Array.from(node.querySelectorAll<HTMLElement>('button, select, textarea, input, [tabindex]'))
        .find((candidate) => focusKeyOf(candidate) === restore.key);
      if (match !== undefined && !(match instanceof HTMLButtonElement && match.disabled)) {
        match.focus({ preventScroll: true });
        if (match instanceof HTMLTextAreaElement && restore.selection !== null) match.setSelectionRange(restore.selection[0], restore.selection[1]);
      }
    }
  }

  const actionButton = (action: ReviewAction, tone: 'primary' | 'secondary' | 'quiet', run: () => void, label: string = REVIEW_ACTION_LABELS[action]): HTMLButtonElement => {
    const control = el('button', tone, label);
    control.type = 'button';
    control.dataset['reviewAction'] = action;
    control.addEventListener('click', run);
    return control;
  };

  /** An action shown disabled with its reason beside it, in words and not only in a tooltip. */
  const unavailableAction = (action: ReviewAction, reason: string, label: string = REVIEW_ACTION_LABELS[action]): HTMLElement => {
    const wrap = el('span', 'review-unavailable');
    const control = el('button', 'secondary', label);
    control.type = 'button';
    control.disabled = true;
    control.dataset['reviewAction'] = action;
    const why = el('span', undefined, reason);
    why.id = uid(`${action}-reason`);
    control.setAttribute('aria-label', label);
    control.setAttribute('aria-describedby', why.id);
    control.append(' · ', why);
    wrap.append(control);
    return wrap;
  };

  function renderCoverage(next: ReviewWorkspaceProjection, newReviewReasonId: string): HTMLElement {
    const section = el('section', 'review-coverage-section');
    const headingId = uid('coverage');
    const heading = el('h4', undefined, REVIEW_COVERAGE_HEADING);
    heading.id = headingId;
    const grid = el('ul', 'review-coverage');
    grid.setAttribute('aria-labelledby', headingId);
    for (const row of next.coverage) {
      const category = next.categories.find((candidate) => candidate.categoryId === row.categoryId);
      const item = el('li', 'review-coverage-card');
      item.dataset['reviewCategory'] = row.categoryId;
      item.dataset['coverage'] = row.state;
      const title = el('div', 'review-coverage-title');
      title.append(el('h5', undefined, row.label), pillElement(row.stateLabel, REVIEW_COVERAGE_PILLS[row.state]));
      const counts = row.lastRunOrdinal === null ? '尚无审阅记录' : [reviewCoverageLastReview(row), reviewCoverageChanges(row)].filter((text) => text !== '—').join(' · ');
      const act = el('p', 'review-coverage-hint');
      if (row.state === 'needs-review') {
        const changed = category?.scopes.changed;
        if (changed !== undefined && !changed.available) {
          act.append(document.createTextNode(changed.unavailableReason ?? ''));
        } else {
          const rereview = actionButton('rereview-changed', 'secondary', () => void openSheet({ categories: [row.categoryId], scope: 'changed', from: null, to: null }, rereview));
          rereview.dataset['reviewCategory'] = row.categoryId;
          if (!next.newReview.available || working) {
            rereview.disabled = true;
            rereview.setAttribute('aria-describedby', newReviewReasonId);
          }
          act.append(rereview);
        }
      } else if (row.state === 'unavailable' && row.unavailableReason !== null) {
        act.append(document.createTextNode(row.unavailableReason));
      }
      // A reviewed category whose earlier records could not all be checked says so (Issue #709).
      if (row.state !== 'unavailable' && row.unavailableReason !== null) act.append(document.createTextNode(row.unavailableReason));
      item.append(title, el('p', 'review-coverage-counts', counts));
      if (act.hasChildNodes()) item.append(act);
      grid.append(item);
    }
    section.append(heading, grid);
    return section;
  }

  function renderRuns(next: ReviewWorkspaceProjection): HTMLElement {
    const section = el('section', 'review-runs-section');
    const heading = el('h4', undefined, `${REVIEW_RUNS_HEADING}${next.runsTruncated ? ` · ${reviewRunsTruncatedLine(next.runs.length)}` : ''}`);
    section.append(heading);
    if (next.runs.length === 0) {
      heading.append(` · ${REVIEW_NO_RUNS}`);
      return section;
    }
    const list = el('ol', 'review-runs');
    for (const summary of next.runs) {
      const item = el('li');
      item.dataset['reviewRun'] = String(summary.ordinal);
      item.dataset['reviewRunId'] = summary.reviewRunId;
      item.dataset['reviewRunState'] = summary.state;
      const opened = next.run?.reviewRunId === summary.reviewRunId;
      if (opened) item.setAttribute('aria-current', 'true');
      const created = el('span', 'review-run-created', reviewCreatedLine(localInstantLabel(summary.createdAt)));
      created.append(el('span', 'technical-identity', summary.createdAt));
      const details = el('span', 'review-run-details');
      details.append(el('span', 'review-run-counts', `${reviewCountsLine(summary.findingCounts)} · ${reviewRunReportLine(summary.reportVersion)}`), ' · ', created);
      const line = el('p', 'review-run-line', reviewRunLine(summary));
      if (summary.modelLabel) line.append(' · ', el('span', 'review-run-model', summary.modelLabel));
      line.append(' · ', details);
      item.append(line);
      // 此结果使用的材料后来被排除 (Issue #64, S29b; SER-026), beside the Run in the list too.
      if (summary.historicalMarker !== null) item.append(el('span', 'review-historical-marker-label review-run-marker', summary.historicalMarker));
      const open = actionButton('open-run', 'quiet', () => openRun(summary.reviewRunId));
      if (opened) open.disabled = true;
      item.append(open);
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function renderNewReview(next: ReviewWorkspaceProjection, reasonId: string): HTMLElement {
    const row = el('div', 'button-row review-new-actions');
    const start = actionButton('new-review', 'primary', () => void openSheet(null, start));
    const local = actionButton('new-local-check', 'secondary', () => void openSheet({ categories: ['local-text-check'], scope: 'whole', from: null, to: null }, local));
    local.disabled = !next.newReview.available || working;
    const repeat = el('button', 'secondary', '按上次设置再审一次');
    repeat.type = 'button'; repeat.dataset['reviewRepeat'] = '';
    repeat.disabled = !next.newReview.available || working;
    repeat.addEventListener('click', () => void openSheet(null, repeat, null, true));
    const more = el('details', 'review-more');
    more.append(el('summary', undefined, '更多 ▾'), menuPanel(repeat, local));
    row.append(start, more);
    if (!next.newReview.available) {
      start.disabled = true;
      const why = el('span', 'review-unavailable-reason', next.newReview.unavailableReason ?? '');
      why.id = reasonId;
      start.setAttribute('aria-label', start.textContent ?? '');
      start.setAttribute('aria-describedby', reasonId);
      start.append(' · ', why);
    } else if (working) {
      start.disabled = true;
    }
    return row;
  }

  function openRun(reviewRunId: string): void {
    if (exportRunId !== null && exportRunId !== reviewRunId) {
      exporter.close();
      exportRunId = null;
    }
    query.reviewRunId = reviewRunId;
    query.filters = { ...NO_FILTERS };
    query.pages = 1;
    ui.ignore = null;
    ui.convert = null;
    ui.batch = null;
    ui.capabilityFindingId = null;
    focusRunHeading = true;
    refresh(true);
  }

  // ---- the opened Run ---------------------------------------------------------------------------------

  function renderRun(next: ReviewWorkspaceProjection, run: ReviewRunProjection): HTMLElement {
    const section = el('section', 'review-run');
    section.dataset['reviewRunId'] = run.reviewRunId;
    section.dataset['reviewRunState'] = run.state;
    const heading = el('div', 'review-run-heading');
    const title = el('h4', undefined, reviewRunHeading(run.label));
    title.tabIndex = -1;
    heading.append(title, pillElement(run.stateLabel, REVIEW_RUN_STATE_PILLS[run.state]));
    appendProposalOffer(heading, run);
    const meta = el('span', 'review-run-meta', `${reviewRunMetaLine(run.scope.label, run.manuscript.revisionLabel)} · ${reviewCreatedLine(localInstantLabel(run.createdAt))}`);
    meta.append(el('span', 'technical-identity', run.createdAt));
    if (run.authorization !== null) {
      const authorized = el('span', 'review-run-authorized', reviewAuthorizedLine(localInstantLabel(run.authorization.authorizedAt)));
      authorized.append(el('span', 'technical-identity', run.authorization.authorizedAt));
      meta.append(authorized);
    }
    heading.append(meta);
    section.append(heading);
    const leading = runHasResults(run);
    if (leading) section.append(renderResults(next, run));
    if (run.localCheck !== undefined) {
      const local = el('section', 'review-local-check');
      local.dataset['localCheck'] = run.localCheck.state;
      const localBoundary = run.localCheck.options.tables === undefined
        ? '本地文字检查按五项有限规则提示可能问题；无发现不表示整部标准合规'
        : '本机检查结果仅供复核，机械修正经你采纳后才会写入稿件并可撤销';
      // The boundary sentence is the technical layer's alone (Issue #1413 cluster 4); the basis used stays in ordinary mode.
      local.append(el('p', 'field-note', `${technicalLayerVisible ? `${localBoundary}；` : ''}本次数字依据：${run.localCheck.options.numerals === 'editor-convention' ? '编辑约定' : run.localCheck.options.numerals === 'off' ? '未启用' : run.localCheck.options.publication === 'within-scope' ? '编辑明确声明在适用范围内' : '不在适用范围内，未检查'}。`));
      if (technicalLayerVisible && Object.keys(run.localCheck.counts ?? {}).length > 0) {
        const counts = el('ul');
        for (const [rule, count] of Object.entries(run.localCheck.counts ?? {})) counts.append(el('li', undefined, `${rule}/v1：检查 ${count.checked} 段，排除上下文 ${count.exempt}，跳过 ${count.skipped}，未识别 ${count.notRecognized}，已检查无发现 ${count.noFinding}，发现 ${count.findings}，错误 ${count.error}，未启用 ${count.disabled}，不适用 ${count.outOfApplicability}。`));
        local.append(counts);
      }
      if (run.localCheck.excluded.length > 0) {
        const exclusions = el('ul');
        exclusions.setAttribute('aria-label', '未生成批注');
        for (const exclusion of run.localCheck.excluded) exclusions.append(el('li', undefined, `${exclusion.reason}${technicalWords(` · ${exclusion.candidateId}`)}`));
        local.append(el('strong', undefined, '未生成批注'), exclusions);
      }
      section.append(local);
      if (run.authorization !== null && (run.state === 'running' || run.canContinue)) {
        local.append(actionButton('scope-cancel', 'secondary', () => void cancelRun(run)));
      }
    }
    // The Captured Procedure version the Run was prepared from (ADR 0087 §4), and the steps it left out for this Book.
    if (run.procedure !== null) {
      const pin = el('div', 'review-procedure-pin');
      pin.dataset['procedureVersionId'] = run.procedure.versionId;
      pin.dataset['procedureVersion'] = String(run.procedure.version);
      pin.dataset['procedureStopped'] = String(run.procedure.stopped);
      pin.dataset['procedureMissing'] = String(run.procedure.missing);
      pin.append(el('p', 'field-note review-procedure-line', runProcedureLine(run.procedure)));
      if (run.procedure.leftOut.length > 0) {
        const leftOut = el('ul');
        for (const entry of run.procedure.leftOut) {
          // A Series step the editor did not choose (S31b; REUSE-050), told apart from one the Book could not take.
          const view = runProcedureLeftOutView(entry);
          const line = el('li', 'review-procedure-left-out', view.text);
          Object.assign(line.dataset, view.data);
          leftOut.append(line);
        }
        pin.append(leftOut);
      }
      section.append(pin);
    }
    if (run.state === 'prepared') {
      section.append(renderPlan(run));
    } else {
      section.append(renderProgress(run));
      if (run.canContinue) {
        const resume = el('div', 'review-continue');
        resume.append(el('p', 'attention-note', REVIEW_CONTINUE_NOTE), actionButton('continue', 'primary', () => void continueRun(run)));
        section.append(resume);
      }
      if (run.state === 'scope-changed') section.append(renderScopeStop(run));
      if (run.historicalMarker !== null) section.append(historicalMarker(run.historicalMarker, run));
      if (run.influence.length > 0) section.append(renderInfluence(run));
      if (!leading) section.append(renderResults(next, run));
      section.append(renderReport(run));
    }
    section.append(options.technicalDetails(
      'review-facts',
      el('dt', undefined, '审阅记录'), el('dd', 'technical-identity', `${run.reviewRunId} · ${run.label}`),
      el('dt', undefined, '稿件 pin'), el('dd', 'technical-identity', `${technicalWords(run.manuscript.revisionLabel, '修订版')} · ${run.manuscript.revisionId} · 修订日志序号 ${run.manuscript.journalSequence} · ${run.manuscript.workingDigest}`),
      el('dt', undefined, '审阅配置摘要'), el('dd', 'technical-identity', run.configurationDigest),
      ...(run.procedure === null ? [] : [
        el('dt', undefined, '可复用工序'), el('dd', 'technical-identity', `${run.procedure.procedureId} · ${run.procedure.versionId} · ${run.procedure.documentSha256}`),
      ]),
      el('dt', undefined, '各类别的任务与计划'),
      el('dd', 'technical-identity', run.categories.map((category) => `${category.label} · ${category.taskIntentId ?? '无任务'} · ${category.planEnvelopeDigest ?? '无计划'}`).join('；')),
    ));
    return section;
  }

  /**
   * A prepared Run's plan (S72 D4): one line naming it and 查看计划并开始, which opens every category's plan
   * in the Task Drawer, whose authorization bar holds the Run's one approval (S74a A5). 返回修改 stays here:
   * it prepares the Run again from the choices it was made from.
   */
  function renderPlan(run: ReviewRunProjection): HTMLElement {
    const section = el('section', 'review-plans task-plan-summary');
    section.dataset['reviewCategories'] = run.categories.map((category) => category.categoryId).join(',');
    section.append(
      el('h5', undefined, REVIEW_PLAN_HEADING),
      el('p', 'task-plan-summary-line', taskPlanSummaryLine([reviewPlanCategoriesLine(run.categories.length), run.scope.label, technicalWords(`任务输入修订版 ${run.manuscript.revisionLabel}`, '基于当前稿件')])),
    );
    // A category that cannot go ahead says so here too: it is what the one approval would be refused for.
    for (const category of run.categories) {
      if (category.detail !== null) section.append(el('p', 'attention-note', `${category.label}：${category.detail}`));
    }
    const actions = el('div', 'button-row review-plan-actions');
    const open = actionButton('view-plan', 'primary', () => options.openPlan(run.reviewRunId), TASK_PLAN_OPEN_START);
    open.dataset['taskPlanOpen'] = 'review-run';
    open.setAttribute('aria-controls', 'task-drawer');
    const revise = actionButton('revise', 'secondary', () => void openSheet(prefillOf(run), revise));
    if (working) {
      open.disabled = true;
      revise.disabled = true;
    }
    actions.append(open, revise);
    section.append(actions);
    return section;
  }

  /**
   * A Run a Series Retrieval Exclusion stopped (Issue #64, S29b; SER-024): why, and exactly 修改计划并重新授权 — the new-review
   * sheet with the Run's own choices, whose plan leaves the excluded material out and is approved in the drawer as any other —
   * and 取消任务, confirmed inline. Never 继续审阅.
   */
  function renderScopeStop(run: ReviewRunProjection): HTMLElement {
    const box = el('div', 'review-scope-stop');
    const influence = run.scopeStop === 'house-review-preference';
    if (influence) box.dataset['scopeStop'] = 'house-review-preference';
    box.append(el('p', 'attention-note', influence ? REVIEW_INFLUENCE_STOP_NOTE : REVIEW_SCOPE_STOP_NOTE));
    const actions = el('div', 'button-row');
    if (scopeCancel === run.reviewRunId) {
      box.append(el('p', 'field-note review-scope-cancel-note', REVIEW_SCOPE_CANCEL_NOTE));
      const confirm = actionButton('scope-cancel-confirm', 'primary', () => void cancelRun(run));
      const keep = actionButton('scope-cancel-keep', 'secondary', () => {
        scopeCancel = null;
        if (projection !== null) renderCard(projection);
        card?.querySelector<HTMLElement>('[data-review-action="scope-cancel"]')?.focus();
      });
      actions.append(confirm, keep);
    } else {
      // 重新执行（不含该影响）(Issue #912): the same sheet, whose new Run reads only the 本社审阅偏好 version current now.
      const redo = actionButton(influence ? 'influence-redo' : 'scope-redo', 'primary', () => openSheet(scopeRedoPrefill(run), redo));
      const cancel = actionButton('scope-cancel', 'secondary', () => {
        if (working) return;
        scopeCancel = run.reviewRunId;
        if (projection !== null) renderCard(projection);
        card?.querySelector<HTMLElement>('[data-review-action="scope-cancel-confirm"]')?.focus();
      });
      actions.append(redo, cancel);
    }
    if (working) for (const button of actions.querySelectorAll('button')) button.disabled = true;
    box.append(actions);
    // Escape keeps the Run while its 取消任务 waits for a confirmation, focus back on 取消任务 (J-14).
    box.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented || scopeCancel !== run.reviewRunId) return;
      event.preventDefault();
      box.querySelector<HTMLButtonElement>('[data-review-action="scope-cancel-keep"]')?.click();
    });
    return box;
  }

  /** The Run's own choices for 修改计划并重新授权: its categories that can be chosen now, and its scope. */
  function scopeRedoPrefill(run: ReviewRunProjection): ReviewRunPrefill {
    const prefill = prefillOf(run);
    const available = new Set((projection?.categories ?? []).filter((category) => category.available).map((category) => category.categoryId));
    return { ...prefill, categories: prefill.categories.filter((categoryId) => available.has(categoryId)) };
  }

  /** The Historically Affected Result Marker (SER-026): beside the Run, its report and its findings, never in place of them. */
  function historicalMarker(marker: NonNullable<ReviewRunProjection['historicalMarker']>, run: ReviewRunProjection): HTMLElement {
    const box = el('div', 'review-historical-marker');
    const markerLine = el('p');
    markerLine.append(el('span', 'review-historical-marker-label', `${marker.label} · ${marker.detail}`));
    box.append(markerLine);
    // The marker links to the later remediation (Issue #912; LAUD-008): when, the material in 学习回溯, and the way on without it.
    const remediation = marker.remediation;
    if (remediation !== undefined) {
      box.dataset['remediationMaterial'] = remediation.materialKey;
      markerLine.append(' · ', el('span', 'review-marker-remediation', reviewMarkerRemediationLine(remediation.recordedAt, localInstantLabel)));
      const actions = el('div', 'button-row');
      if (options.openLearningLineage !== undefined) {
        actions.append(actionButton('influence-lineage', 'quiet', () => options.openLearningLineage!(remediation.bookId, remediation.materialKey, run.reviewRunId)));
      }
      if (run.state !== 'scope-changed') {
        const redo = actionButton('influence-redo', 'secondary', () => openSheet(scopeRedoPrefill(run), redo));
        actions.append(redo);
      }
      if (working) for (const button of actions.querySelectorAll('button')) button.disabled = true;
      box.append(actions);
    }
    return box;
  }

  /** 为什么会影响这个结果 (Issue #912; LAUD-004): each category's 本社审阅偏好 version and the materials behind it, closed until asked. */
  function renderInfluence(run: ReviewRunProjection): HTMLElement {
    const details = el('details', 'review-influence');
    details.append(el('summary', undefined, `${REVIEW_INFLUENCE_HEADING} · 本社审阅偏好仅供参考`));
    for (const entry of run.influence) {
      const group = el('div', 'review-influence-category');
      group.dataset['categoryId'] = entry.categoryId;
      group.dataset['versionOrdinal'] = String(entry.ordinal);
      const summary = el('p', 'review-influence-line', reviewInfluenceLine(entry));
      if (entry.moreMaterials > 0) summary.append(' · ', reviewInfluenceMore(entry.moreMaterials));
      group.append(summary);
      const list = el('ul', 'review-influence-materials');
      for (const material of entry.materials) {
        const item = el('li', undefined, reviewInfluenceMaterialLine(material, material.kind === null ? '学习材料' : LEARNING_AUDIT_KIND_LABELS[material.kind], localInstantLabel));
        if (material.withdrawnAt !== null) item.dataset['withdrawn'] = 'true';
        if (material.materialKey !== null && options.openLearningLineage !== undefined) {
          const key = material.materialKey;
          item.append(' ', actionButton('influence-lineage', 'quiet', () => options.openLearningLineage!(material.bookId, key, run.reviewRunId)));
        }
        list.append(item);
      }
      group.append(list);
      details.append(group);
    }
    return details;
  }

  /** The choices a prepared Run was made from, for 返回修改. */
  function prefillOf(run: ReviewRunProjection): ReviewRunPrefill {
    return reviewRunPrefill(run, projection?.scopeOptions.chapters.chapters ?? []);
  }

  function progressList(run: ReviewRunProjection): HTMLElement {
    const list = el('ol', 'review-progress');
    const now = Date.now();
    for (const category of run.categories) {
      const item = el('li');
      item.dataset['reviewCategory'] = category.categoryId;
      item.dataset['categoryState'] = category.state;
      if (category.progress !== null) item.dataset['reviewProgress'] = `${category.progress.unitsSettled}/${category.progress.unitsTotal}`;
      item.append(
        el('span', 'review-progress-label', category.label),
        pillElement(category.stateLabel, REVIEW_CATEGORY_STATE_PILLS[category.state]),
        el('span', 'review-progress-detail', reviewCategoryProgressLine(category, now)),
      );
      list.append(item);
    }
    return list;
  }

  function renderProgress(run: ReviewRunProjection): HTMLElement {
    const section = el('section', 'review-progress-section');
    section.append(el('h5', undefined, REVIEW_PROGRESS_HEADING), progressList(run));
    return section;
  }

  /** Between re-renders only the measured progress moves; it is redrawn in place, and nothing focusable lives in it. */
  function updateProgress(next: ReviewWorkspaceProjection): void {
    const current = card?.querySelector('ol.review-progress');
    if (current && next.run !== null) current.replaceWith(progressList(next.run));
  }

  // ---- results ----------------------------------------------------------------------------------------

  function renderResults(next: ReviewWorkspaceProjection, run: ReviewRunProjection): HTMLElement {
    const section = el('section', 'review-results review-findings-first');
    const headingId = uid('results');
    const heading = el('h5', undefined, REVIEW_RESULTS_HEADING);
    heading.id = headingId;
    section.setAttribute('aria-labelledby', headingId);
    section.append(heading, el('p', 'review-results-counts', reviewResultsCountsLine(run.findingCounts)));
    const filters = el('div', 'review-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', '筛选发现');
    const filterSelect = (name: FilterName, choices: ReadonlyArray<readonly [string, string]>): HTMLElement => {
      const label = el('div', 'review-filter');
      label.append(el('span', undefined, REVIEW_FILTER_LABELS[name]));
      const select = filterChoices({ label: REVIEW_FILTER_LABELS[name], choices: [['', REVIEW_FILTER_ALL], ...choices],
        value: query.filters[FILTER_KEYS[name]] ?? '', disabled: working,
        change: (value) => {
          query.filters = { ...query.filters, [FILTER_KEYS[name]]: value === '' ? null : value } as Filters;
          query.pages = 1;
          refresh(true);
        },
      });
      select.dataset['reviewFilter'] = name;
      label.append(select);
      return label;
    };
    const chapterPage = next.listPages?.[CHAPTER_PAGE_PATH];
    const chapterChoices: Array<readonly [string, string]> = next.scopeOptions.chapters.chapters.map((chapter) => [chapter.blockId, chapter.title] as const);
    // A chapter chosen from a later page stays chosen while the choices here are read only in part (Issue #996).
    const chosenChapter = query.filters.chapterBlockId;
    if (chapterPage?.nextOrdinal != null && chosenChapter !== null && !chapterChoices.some(([blockId]) => blockId === chosenChapter)) {
      chapterChoices.push([chosenChapter, TASK_SELECTED_CHAPTER_NOT_LOADED]);
    }
    filters.append(
      filterSelect('category', run.categories.map((category) => [category.categoryId, category.label] as const)),
      filterSelect('severity', REVIEW_FINDING_SEVERITIES.map((severity) => [severity, REVIEW_FINDING_SEVERITY_LABELS[severity]] as const)),
      filterSelect('status', REVIEW_FINDING_STATUSES.map((status) => [status, REVIEW_FINDING_STATUS_LABELS[status]] as const)),
      filterSelect('chapter', chapterChoices),
    );
    if (chapterPage !== undefined && chapterPage.nextOrdinal !== null) {
      const more = el('button', 'secondary', taskPageMore('章节', chapterPage.shown, chapterPage.total));
      more.type = 'button';
      more.dataset['reviewFilter'] = 'chapter-page';
      more.disabled = working;
      more.addEventListener('click', () => {
        const current = projection;
        if (current === null) return;
        more.disabled = true;
        void readChapterPage(current).then((loaded) => {
          if (destroyed || projection !== current) return;
          projection = loaded;
          stableKey = stableKeyOf(loaded);
          renderCard(loaded);
          if (card?.contains(document.activeElement) !== true) card?.querySelector<HTMLElement>('[data-review-filter="chapter"]')?.focus();
        }).catch((error: unknown) => {
          if (destroyed || projection !== current) return;
          more.disabled = false;
          options.setStatus(options.errorMessage(error, TASK_PAGE_FAILED), 'error');
        });
      });
      filters.append(more);
    }
    section.append(filters);
    if ((run.excludedTotal ?? 0) > 0) {
      const details = el('details', 'review-excluded');
      details.open = excludedOpen;
      details.addEventListener('toggle', () => { excludedOpen = details.open; });
      details.append(el('summary', '', reviewExcludedHeading(run.excludedTotal ?? 0)));
      for (const finding of run.excluded ?? []) {
        const item = el('div', 'review-excluded-entry');
        item.setAttribute('style', 'overflow-wrap: anywhere');
        item.append(el('strong', undefined, `${finding.categoryLabel} · ${finding.reasonLabel}${technicalWords(` · 单元 ${finding.unitOrdinal}${finding.textPart === undefined ? '' : ` · 原文 ${finding.textPart.index}/${finding.textPart.total}`} · ${finding.reasonCode}`)}`),
          el('blockquote', undefined, finding.text));
        details.append(item);
      }
      if (run.excludedTruncated) {
        const more = el('button', 'secondary', '显示更多未列为发现的条目');
        more.type = 'button';
        more.addEventListener('click', () => { excludedPages += 1; refresh(true); });
        details.append(more);
      }
      section.append(details);
    }
    const filtered = Object.values(query.filters).some((value) => value !== null);
    if (filtered || run.findings.length === 0) {
      const empty = run.findings.length === 0 ? (filtered ? REVIEW_NO_FILTERED_FINDINGS : REVIEW_NO_FINDINGS) : null;
      const filter = filtered ? reviewFilteredLine(run.findingsTotal) : null;
      const status = [filter, empty].filter((line): line is string => line !== null).map((line) => line.replace(/。$/u, '')).join('；');
      heading.append(' · ', el('span', `${filtered ? 'review-filtered' : ''}${empty === null ? '' : ' review-no-findings'}`.trim(), `${status}。`));
    }
    for (const category of run.categories) {
      const findings = run.findings.filter((finding) => finding.categoryId === category.categoryId);
      if (findings.length === 0 && ui.batch?.categoryId !== category.categoryId) continue;
      section.append(renderGroup(run, category, findings));
    }
    if (run.findingsTruncated) {
      const more = el('div', 'button-row review-more');
      const button = actionButton('more-findings', 'secondary', () => {
        query.pages += 1;
        refresh(true);
      });
      button.disabled = working;
      button.append(` · ${reviewShownLine(run.findings.length, run.findingsTotal)}`);
      more.append(button);
      section.append(more);
    }
    return section;
  }

  // ---- the Fact-check Lens (Issue #901; V2-UX-FACT-004, FACT-005, FACT-007, FACT-008) ------------------------------------

  /** A lens control: its own action key beside the review's, so a repaint finds it again. */
  function factButton(action: 'fact-more' | 'fact-workspace' | 'fact-go-to-text', tone: 'secondary' | 'quiet', run: () => void): HTMLButtonElement {
    const control = el('button', tone);
    control.type = 'button';
    control.dataset['factAction'] = action;
    control.addEventListener('click', run);
    return control;
  }

  function renderFactLens(run: ReviewRunProjection): HTMLElement {
    const lens = fact.lens!;
    const section = el('section', 'fact-lens');
    section.dataset['factLensTotal'] = String(lens.total);
    const headingId = uid('fact-lens');
    const heading = el('h6', undefined, FACT_LENS_HEADING);
    heading.id = headingId;
    section.setAttribute('aria-labelledby', headingId);
    const counts = el('p', 'fact-lens-counts', `${factLensCountsLine(lens)} · ${fact.results.length === 0 ? FACT_LENS_NOTE.replace(/。$/u, '') : FACT_LENS_NOTE}`);
    if (fact.results.length === 0) counts.append(`；${FACT_LENS_EMPTY_FILTERED}`);
    section.append(heading, counts);
    if (lens.run?.disclosure != null) section.append(el('p', 'fact-lens-disclosure', lens.run.disclosure));
    const filters = el('div', 'review-filters fact-lens-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', '筛选核查结果');
    const select = (name: keyof FactualVerificationLensFilters, choices: ReadonlyArray<readonly [string, string]>): HTMLElement => {
      const label = el('div', 'review-filter');
      label.append(el('span', undefined, FACT_LENS_FILTER_LABELS[name === 'chapterBlockId' ? 'chapter' : name]));
      const control = filterChoices({ label: FACT_LENS_FILTER_LABELS[name === 'chapterBlockId' ? 'chapter' : name],
        choices: [['', REVIEW_FILTER_ALL], ...choices], value: fact.filters[name] ?? '', disabled: working,
        change: (value) => {
          fact.filters = { ...fact.filters, [name]: value || null } as FactualVerificationLensFilters;
          fact.pages = 1;
          refresh(true);
        },
      });
      control.dataset['factFilter'] = name;
      label.append(control);
      return label;
    };
    filters.append(
      select('chapterBlockId', lens.chapters.map((chapter) => [chapter.blockId, chapter.heading] as const)),
      select('outcome', FACTUAL_VERIFICATION_OUTCOMES.map((outcome) => [outcome, outcome] as const)),
      select('severity', (['A', 'B', 'C'] as const).map((severity) => [severity, FACT_SEVERITY_LABELS[severity]] as const)),
      select('sourceCondition', (Object.keys(FACTUAL_SOURCE_CONDITION_LABELS) as FactualSourceCondition[]).map((value) => [value, FACTUAL_SOURCE_CONDITION_LABELS[value]] as const)),
      select('actionNeed', (Object.keys(FACTUAL_ACTION_NEED_LABELS) as FactualActionNeed[]).map((value) => [value, FACTUAL_ACTION_NEED_LABELS[value]] as const)),
    );
    section.append(filters);
    const list = el('ol', 'fact-lens-rows');
    for (const result of fact.results) list.append(renderFactRow(run, result));
    section.append(list);
    if (fact.next !== null) {
      const more = factButton('fact-more', 'secondary', () => {
        fact.pages += 1;
        refresh(true);
      });
      more.textContent = FACT_LENS_MORE;
      more.disabled = working;
      section.append(more);
    }
    return section;
  }

  function renderFactRow(run: ReviewRunProjection, result: FactualVerificationResultProjection): HTMLElement {
    const row = el('li', 'fact-lens-row');
    row.dataset['factResultId'] = result.resultId;
    row.dataset['outcome'] = result.states.factualVerification;
    row.dataset['anchor'] = result.anchor.state;
    row.dataset['version'] = String(result.version);
    const open = fact.open.get(result.resultId);
    const finding = run.findings.find((entry) => entry.findingId === result.reviewFindingId);
    const category = run.categories.find((entry) => entry.categoryId === 'factual-review')!;
    const card = finding === undefined ? el('article', 'review-finding') : renderFinding(run, category, finding, open === undefined, true);
    if (finding === undefined) {
      const head = el('div', 'fact-lens-row-heading');
      head.append(el('span', 'review-finding-location', factLocationLine(result)), el('blockquote', 'review-finding-quote', reviewQuote(result.quote)));
      card.append(head);
    }
    row.append(card);
    // The three states in their own columns: never one traffic light (FACT-007).
    const states = el('div', 'fact-lens-states');
    for (const [term, value] of factStateLines(result)) {
      const cell = el('span', 'fact-lens-state');
      cell.dataset['stateTerm'] = term;
      cell.append(el('span', 'evidence-term', term), el('span', `state-term status-pill evidence-pill evidence-pill-${term === '事实核查' ? outcomeTone(result.states.factualVerification) : 'neutral'}`, value));
      states.append(cell);
    }
    card.append(states, el('p', 'fact-lens-level', factLevelLine(result)), el('p', 'fact-lens-decision', `${factDecisionLine(result.decision)} · ${factActionLine(result)}`));
    if (result.anchor.label !== null) card.append(el('p', 'fact-lens-anchor', result.anchor.label));
    const actions = el('div', 'button-row');
    const toggle = factButton('fact-workspace', 'quiet', () => {
      const current = fact.open.get(result.resultId);
      if (current !== undefined) {
        current.destroy();
        fact.open.delete(result.resultId);
        refresh(true);
        return;
      }
      const surface = mountEvidenceWorkspace({
        bookId, resultId: result.resultId, api, setStatus: options.setStatus, errorMessage: options.errorMessage, instant: localInstantLabel,
        openSource: (evidenceId) => options.openSource?.(evidenceId),
        goToText: (target) => options.goToText({ manuscriptId: run.manuscript.manuscriptId, branchId: run.manuscript.branchId, blockId: target.blockId, markId: target.markId }),
        changed: () => refresh(true),
        prepareSupplementary: async (decisionId) => {
          const initial = await api.prepareReviewRun({ categoryIds: ['factual-review'], decisionId,
            scope: { kind: 'selection', fromChapterBlockId: result.blockId, toChapterBlockId: result.blockId } });
          const completed = await options.awaitServiceJob(initial, () => {});
          const prepared = completed.result;
          if (completed.kind !== 'review-run-preparation' || prepared === null || !('scopeOptions' in prepared) || prepared.run === null) throw new Error('补充核查计划没有准备完成。');
          query.reviewRunId = prepared.run.reviewRunId;
          refresh(true); options.openPlan(prepared.run.reviewRunId);
        },
      });
      fact.open.set(result.resultId, surface);
      void surface.load().then(() => {
        if (!destroyed && fact.reviewRunId === run.reviewRunId && fact.open.get(result.resultId) === surface) refresh(true);
      }, (error: unknown) => {
        if (!destroyed && fact.reviewRunId === run.reviewRunId && fact.open.get(result.resultId) === surface)
          options.setStatus(options.errorMessage(error, '无法读取证据工作区。'), 'error');
      });
    });
    toggle.textContent = open === undefined ? FACT_OPEN_WORKSPACE : FACT_CLOSE_WORKSPACE;
    toggle.setAttribute('aria-expanded', open === undefined ? 'false' : 'true');
    toggle.disabled = working;
    actions.append(toggle);
    const locate = factButton('fact-go-to-text', 'quiet', () => void options.goToText({
      manuscriptId: run.manuscript.manuscriptId, branchId: run.manuscript.branchId, blockId: result.blockId, markId: result.markId,
    }));
    locate.textContent = '在稿件中查看';
    locate.disabled = working || result.anchor.state === 'stale';
    actions.append(locate);
    card.append(actions);
    // The open workspace is the same element across repaints, so what the editor pinned, chose or typed stays.
    if (open !== undefined) card.append(open.element);
    return row;
  }

  function renderGroup(run: ReviewRunProjection, category: ReviewRunCategoryProjection, findings: ReadonlyArray<ReviewFindingProjection>): HTMLElement {
    const group = el('section', 'review-group');
    group.dataset['reviewCategory'] = category.categoryId;
    const heading = el('div', 'review-group-heading');
    heading.append(el('h6', undefined, `${category.label} · ${reviewGroupCountLine(category.findingsCount)}`));
    // V2-UX-REV-006: the batch belongs to a category configured for it (错别字与规范用语); 文学性与表达改进's
    // suggestions are accepted one by one.
    if (category.batchApply && category.output === 'change-suggestion' && category.state === 'settled') {
      const batch = actionButton('batch-prepare', 'secondary', () => void prepareBatch(run, category));
      if (category.categoryId === 'local-text-check') batch.textContent = '批量采纳机械修正';
      batch.setAttribute('aria-expanded', ui.batch?.categoryId === category.categoryId ? 'true' : 'false');
      batch.disabled = working;
      heading.append(batch);
    }
    group.append(heading);
    const filteredLens = Object.values(fact.filters).some((value) => value !== null);
    const hasLens = category.categoryId === 'factual-review' && fact.lens !== null && (fact.results.length > 0 || filteredLens);
    if (hasLens) group.append(renderFactLens(run));
    if (ui.batch?.categoryId === category.categoryId) group.append(renderBatchStrip(run, ui.batch));
    else if (ui.applied?.categoryId === category.categoryId) group.append(renderAppliedBatch(run, ui.applied));
    const lensFindings = new Set(fact.results.map((result) => result.reviewFindingId));
    for (const finding of findings) {
      // A partial run can retain findings for which no evidence result was produced. Keep their actions available.
      if (!hasLens || !filteredLens && fact.next === null && !lensFindings.has(finding.findingId)) group.append(renderFinding(run, category, finding));
    }
    return group;
  }

  function renderFinding(run: ReviewRunProjection, category: ReviewRunCategoryProjection, finding: ReviewFindingProjection, showEvidence = true, hasVerification = false): HTMLElement {
    const article = el('article', 'review-finding');
    article.dataset['findingId'] = finding.findingId;
    article.dataset['severity'] = finding.severity;
    article.dataset['status'] = finding.status;
    article.dataset['markId'] = finding.markId ?? '';
    article.dataset['output'] = finding.output;
    article.tabIndex = -1;
    const locationId = uid('finding');
    article.setAttribute('aria-labelledby', locationId);
    const heading = el('div', 'review-finding-heading');
    heading.append(
      pillElement(finding.severityLabel, REVIEW_SEVERITY_PILLS[finding.severity]),
      pillElement(finding.statusLabel, REVIEW_STATUS_PILLS[finding.status]),
    );
    if (finding.riskPoint) heading.append(el('span', 'review-risk-point', REVIEW_RISK_POINT));
    const location = el('span', 'review-finding-location', reviewFindingLocation(finding));
    location.id = locationId;
    heading.append(location);
    // A compact two-column card (Issue #1413 cluster 6): the words, the suggestion, why and where it stands on the left; the
    // one-line actions on the right.
    article.classList.add('is-split');
    const main = el('div', 'review-finding-main');
    main.append(heading, el('blockquote', 'review-finding-quote', reviewQuote(finding.quote)));
    if (finding.replacement !== null) main.append(el('p', 'review-finding-replacement', reviewReplacementLine(finding.replacement)));
    main.append(el('p', 'review-finding-note', finding.note));
    const referencedRules = findingReferencedRules(finding);
    if (referencedRules !== null) main.append(referencedRules);
    if (finding.clauseRefs.length === 0) main.append(el('p', 'review-finding-basis', reviewBasisWords(category.basis)));
    for (const clause of finding.clauseRefs) main.append(el('p', 'review-finding-basis', reviewClauseLine(clause)));
    // Extraction's original non-verdict remains historical; this card's verified result owns the current three states.
    const stateLine = hasVerification && finding.stateLine === '未外部复核' ? null : finding.stateLine;
    const lines = [stateLine, finding.anchorState === 'anchor-changed' ? REVIEW_ANCHOR_CHANGED : null]
      .filter((line, index, all): line is string => line !== null && all.indexOf(line) === index);
    for (const line of lines) main.append(el('p', 'review-finding-state', line));
    const retained = research.get(finding.findingId);
    const attached = category.categoryId === 'factual-review' ? evidence.get(finding.findingId) ?? [] : [];
    const sources = attached.length > 0 || category.categoryId !== 'factual-review' || retained === undefined ? null : findingResearchLines(retained, finding, localInstantLabel);
    if (showEvidence && attached.length > 0) main.append(findingEvidenceList(attached, options.openSource === undefined ? undefined : (evidenceId) => options.openSource?.(evidenceId)));
    if (showEvidence) for (const line of sources ?? []) main.append(el('p', 'review-finding-source', line));
    if (finding.status !== 'pending') main.append(el('p', 'review-finding-status-detail', finding.statusDetail));
    if (finding.ignoreReason !== null) main.append(el('p', 'review-finding-ignore-reason', reviewIgnoreReasonLine(finding.ignoreReason)));
    if (finding.historicalMarker !== null) main.append(el('p', 'review-historical-marker-label review-finding-marker', finding.historicalMarker));
    article.append(main, renderFindingActions(run, finding));
    const reasonAsk = reasonAsks.get(finding.findingId);
    if (reasonAsk !== undefined && reasonAsk.dataset['learningAskState'] !== 'dismissed') article.append(reasonAsk);
    if (ui.capabilityFindingId === finding.findingId) article.append(capabilityNote());
    if (ui.ignore?.findingId === finding.findingId) article.append(renderIgnoreForm(run, finding, ui.ignore));
    if (ui.convert?.findingId === finding.findingId) article.append(renderConvertForm(run, finding, ui.convert));
    article.append(options.technicalDetails(
      'review-facts',
      el('dt', undefined, '发现'), el('dd', 'technical-identity', `${finding.findingId} · 第 ${finding.ordinal} 条`),
      el('dt', undefined, '标记'), el('dd', 'technical-identity', finding.markId === null ? '无（原文已变）' : `${finding.markId} · ${finding.markStatus ?? '—'} · ${finding.anchorState}`),
      el('dt', undefined, '段落'), el('dd', 'technical-identity', `${finding.blockId} · 字素 ${finding.fromGrapheme}–${finding.toGrapheme}`),
    ));
    return article;
  }

  function renderFindingActions(run: ReviewRunProjection, finding: ReviewFindingProjection): HTMLElement {
    const actions = el('div', 'button-row review-finding-actions');
    const add = (control: HTMLElement): void => {
      if (working) for (const button of control instanceof HTMLButtonElement ? [control] : Array.from(control.querySelectorAll('button'))) button.disabled = true;
      actions.append(control);
    };
    add(finding.blockPosition === null
      ? unavailableAction('go-to-text', REVIEW_BLOCK_GONE)
      : actionButton('go-to-text', 'quiet', () => void goToText(run, finding)));
    if (finding.status === 'pending') {
      const standing = finding.markId !== null && finding.markStatus === 'open';
      if (finding.output === 'change-suggestion') {
        add(standing && finding.anchorState === 'exact'
          ? actionButton('accept-apply', 'primary', () => void acceptApply(run, finding))
          : unavailableAction('accept-apply', REVIEW_CANNOT_APPLY));
      } else if (standing) {
        add(actionButton('mark-handled', 'secondary', () => void markHandled(run, finding)));
        add(finding.anchorState === 'exact'
          ? actionButton('convert-to-suggestion', 'secondary', () => void openConvert(run, finding))
          : unavailableAction('convert-to-suggestion', REVIEW_CANNOT_CONVERT));
      }
      // 忽略并说明 is 批注's (editor-surfaces §4); a finding with nothing left on the manuscript to decide
      // on — its words changed before it could be marked — can be closed the same way.
      if (finding.output === 'annotation' || finding.markId === null) {
        // 忽略 is one click with the routine reason (Issue #1410 item 6); 忽略并备注… opens the note for one of the editor's own.
        add(actionButton('ignore-now', 'quiet', () => void ignoreNow(run, finding)));
        const ignore = actionButton('ignore', 'quiet', () => openIgnore(finding));
        ignore.setAttribute('aria-expanded', ui.ignore?.findingId === finding.findingId ? 'true' : 'false');
        add(ignore);
      }
    }
    return actions;
  }

  function capabilityNote(): HTMLElement {
    const note = el('div', 'attention-note review-capability');
    note.setAttribute('role', 'alert');
    note.append(el('p', undefined, REVIEW_CAPABILITY_REASON), actionButton('open-manuscript', 'secondary', () => void options.openManuscript()));
    return note;
  }

  function renderIgnoreForm(run: ReviewRunProjection, finding: ReviewFindingProjection, form: IgnoreForm): HTMLElement {
    const wrap = el('div', 'review-inline-form review-ignore-form');
    const field = el('label', 'review-field');
    field.append(el('span', undefined, REVIEW_IGNORE_LABEL));
    const reason = el('textarea');
    reason.rows = 3;
    reason.value = form.reason;
    reason.placeholder = REVIEW_IGNORE_DEFAULT_REASON;
    reason.dataset['reviewField'] = 'ignore-reason';
    const problem = el('p', 'review-problem');
    problem.setAttribute('role', 'alert');
    problem.id = uid('ignore-problem');
    problem.hidden = form.problem === null;
    problem.textContent = form.problem ?? '';
    reason.setAttribute('aria-describedby', problem.id);
    reason.setAttribute('aria-invalid', form.problem === null ? 'false' : 'true');
    reason.addEventListener('input', () => {
      form.reason = reason.value;
    });
    field.append(reason);
    const confirm = actionButton('ignore-confirm', 'primary', () => void confirmIgnore(run, finding, form, reason, problem), '忽略并记录原因');
    const cancel = actionButton('ignore-cancel', 'quiet', () => closeInline('ignore', finding.findingId));
    if (working) {
      confirm.disabled = true;
      cancel.disabled = true;
    }
    const row = el('div', 'button-row');
    row.append(confirm, cancel);
    wrap.append(field, problem, row);
    wrap.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeInline('ignore', finding.findingId);
    });
    return wrap;
  }

  function renderConvertForm(run: ReviewRunProjection, finding: ReviewFindingProjection, form: ConvertForm): HTMLElement {
    const wrap = el('div', 'review-inline-form review-convert-form');
    const field = (label: string, value: string, name: 'convert-to' | 'convert-rationale', hint: string | null, update: (text: string) => void): HTMLElement => {
      const node = el('label', 'review-field');
      node.append(el('span', undefined, label));
      const input = el('textarea');
      input.rows = name === 'convert-to' ? 2 : 3;
      input.value = value;
      input.dataset['reviewField'] = name;
      input.addEventListener('input', () => update(input.value));
      node.append(input);
      if (hint !== null) input.placeholder = hint;
      return node;
    };
    const problem = el('p', 'review-problem');
    problem.setAttribute('role', 'alert');
    problem.hidden = form.problem === null;
    problem.textContent = form.problem ?? '';
    const confirm = actionButton('convert-confirm', 'primary', () => void confirmConvert(run, finding, form));
    const cancel = actionButton('convert-cancel', 'quiet', () => closeInline('convert', finding.findingId));
    if (working) {
      confirm.disabled = true;
      cancel.disabled = true;
    }
    const row = el('div', 'button-row');
    const consequence = el('span', 'review-convert-consequence', technicalWords(REVIEW_CONVERT_NOTE, ''));
    consequence.id = uid('convert-consequence');
    confirm.setAttribute('aria-describedby', consequence.id);
    row.append(consequence, confirm, cancel);
    wrap.append(
      field(REVIEW_CONVERT_TO, form.proposedText, 'convert-to', REVIEW_CONVERT_TO_HINT, (text) => { form.proposedText = text; }),
      field(REVIEW_CONVERT_RATIONALE, form.rationale, 'convert-rationale', null, (text) => { form.rationale = text; }),
      problem,
      row,
    );
    wrap.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeInline('convert', finding.findingId);
    });
    return wrap;
  }

  function appendProposalOffer(host: HTMLElement, run: ReviewRunProjection): void {
    if (!options.openProposalWorkspace) return;
    const input = { manuscriptId: run.manuscript.manuscriptId, branchId: run.manuscript.branchId, resultId: run.reviewRunId };
    void api.inspectProposalWorkspace(input).then((answer) => {
      if (!host.isConnected || !answer.offerWorkspace) return;
      const offer = el('button', 'secondary', '在专用工作区审阅'); offer.type = 'button'; offer.dataset['proposalWorkspaceOffer'] = 'true';
      offer.addEventListener('click', () => options.openProposalWorkspace?.(input)); host.append(offer);
    }).catch(() => {});
  }

  /** The batch just applied: how many were written and left out, and 撤销本批应用. */
  function renderAppliedBatch(run: ReviewRunProjection, applied: NonNullable<typeof ui.applied>): HTMLElement {
    const node = el('section', 'review-batch-strip review-batch-applied');
    node.dataset['reviewCategory'] = applied.categoryId;
    node.dataset['reviewBatchState'] = 'applied';
    node.setAttribute('role', 'status');
    node.append(el('p', 'review-batch-scope', `${reviewBatchAppliedLine(applied.markIds.length, false)}${applied.skipped > 0 ? reviewBatchExcludedLine(applied.skipped) : ''}`));
    const row = el('div', 'button-row');
    const undo = actionButton('batch-undo', 'secondary', () => void undoBatch(run));
    const close = actionButton('batch-cancel', 'quiet', () => { ui.applied = null; if (projection !== null) renderCard(projection); });
    if (working) { undo.disabled = true; close.disabled = true; }
    row.append(undo, close);
    node.append(row);
    return node;
  }

  function renderBatchStrip(run: ReviewRunProjection, strip: BatchStrip): HTMLElement {
    const node = el('section', 'review-batch-strip');
    node.dataset['reviewCategory'] = strip.categoryId;
    node.dataset['reviewBatchCount'] = String(strip.items.length);
    node.dataset['reviewBatchState'] = strip.refused ? 'refused' : strip.items.length === 0 ? 'empty' : 'ready';
    node.setAttribute('role', 'group');
    appendProposalOffer(node, run);
    const scopeId = uid('batch-scope');
    node.setAttribute('aria-labelledby', scopeId);
    const row = el('div', 'button-row');
    const cancel = actionButton('batch-cancel', 'quiet', () => closeBatch(strip.categoryId));
    if (strip.items.length === 0) {
      const nothing = el('p', 'review-batch-scope', REVIEW_BATCH_NOTHING);
      nothing.id = scopeId;
      node.append(nothing);
    } else {
      const scopeParts = [reviewBatchScopeLine(strip.items.length), REVIEW_BATCH_ALL_OR_NONE];
      if (strip.excluded > 0) scopeParts.push(reviewBatchExcludedLine(strip.excluded));
      if (strip.capped) scopeParts.push(reviewBatchCappedLine(MAX_BATCH_APPLY_SUGGESTIONS));
      const scope = el('p', 'review-batch-scope', `${scopeParts.map((line) => line.replace(/。$/u, '')).join('；')}。`);
      scope.id = scopeId;
      const items = el('ol', 'review-batch-items');
      for (const item of strip.items) {
        const line = el('li', undefined, reviewBatchItemLine(item.quote, item.replacement));
        line.dataset['findingId'] = item.findingId;
        line.dataset['markId'] = item.markId;
        items.append(line);
      }
      node.append(scope, items);
      if (strip.unknown) {
        node.append(el('p', 'review-problem', technicalWords('结果待确认；确认权威记录之前不能再次应用。', '正在确认上次修改的结果，请稍后再试。')));
        row.append(actionButton('open-manuscript', 'secondary', () => void options.openManuscript()));
      } else if (strip.refused || strip.capability) {
        const category = run.categories.find((candidate) => candidate.categoryId === strip.categoryId);
        row.append(actionButton('batch-reprepare', 'primary', () => {
          if (category !== undefined) void prepareBatch(run, category);
        }));
      } else {
        row.append(actionButton('batch-confirm', 'primary', () => void confirmBatch(run, strip)));
      }
    }
    if (strip.problem !== null) {
      const problem = el('p', 'review-problem', strip.problem);
      problem.setAttribute('role', 'alert');
      node.append(problem);
      if (strip.capability) node.append(actionButton('open-manuscript', 'secondary', () => void options.openManuscript()));
    }
    row.append(cancel);
    if (working) for (const button of row.querySelectorAll('button')) button.disabled = true;
    node.append(row);
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeBatch(strip.categoryId);
    });
    return node;
  }

  // ---- the 审阅报告 ----------------------------------------------------------------------------------

  function renderReport(run: ReviewRunProjection): HTMLElement {
    const section = el('section', 'review-report');
    const modelLabel = run.report?.record.run.modelLabel ?? run.modelLabel;
    if (modelLabel) section.append(el('p', 'review-report-model', modelLabel));
    section.dataset['reportVersion'] = run.report === null ? '' : String(run.report.version);
    section.append(el('h5', undefined, `${REVIEW_REPORT_HEADING} · 旧版保留`));
    // The report is never rewritten: the marker stands beside it (Issue #64, S29b; SER-026).
    if (run.historicalMarker !== null) section.append(el('p', 'review-historical-marker-label review-report-marker', run.historicalMarker.label));
    if (run.reportVersions.length > 0) {
      const versions = el('ol', 'review-report-versions');
      for (const version of run.reportVersions) {
        const item = el('li', undefined, reviewReportVersionLine(version.version, localInstantLabel(version.generatedAt)));
        item.dataset['reportVersionItem'] = String(version.version);
        item.append(el('span', 'technical-identity', version.generatedAt));
        versions.append(item);
      }
      section.append(versions);
    }
    const actions = el('div', 'button-row review-report-actions');
    const label = reviewGenerateReportLabel(run.report?.version ?? null);
    const report = run.report;
    actions.append(
      run.state === 'running'
        ? unavailableAction('generate-report', REVIEW_REPORT_WAIT_RUNNING, label)
        : actionButton('generate-report', 'secondary', () => void generateReport(run), label),
      report === null ? unavailableAction('export', REVIEW_EXPORT_NEEDS_REPORT, EXPORT_ACTION_LABELS.open) : exportReportAction(run, report),
      // 将以上工序保存为可复用工序 (Issue #65, S30; ADR 0087 §2): on a finished Run only, and why not otherwise.
      run.capture.available
        ? captureAction(run)
        : unavailableAction('capture', run.capture.unavailableReason ?? '', CAPTURE_ACTION),
    );
    if (working) for (const button of actions.querySelectorAll('button')) button.disabled = true;
    section.append(actions);
    if (report !== null) section.append(exportSlot);
    if (run.report !== null) section.append(renderReportRecord(run.report, run.categories));
    return section;
  }

  function captureAction(run: ReviewRunProjection): HTMLButtonElement {
    const control = actionButton('capture', 'secondary', () => {
      if (destroyed || working) return;
      void openProcedureCapture({
        host,
        api,
        reviewRunId: run.reviewRunId,
        opener: control,
        setStatus: options.setStatus,
        errorMessage: options.errorMessage,
      });
    }, CAPTURE_ACTION);
    return control;
  }

  /** 导出… of the report version on show, named for a screen reader by that version. */
  function exportReportAction(run: ReviewRunProjection, report: ReviewReportProjection): HTMLElement {
    const reportLabel = reportExportLabel(run.label, report.version);
    const menu = exporter.menu({ kind: 'report', reportId: report.reportId }, reportLabel);
    const control = menu.querySelector<HTMLElement>('summary')!;
    control.dataset['reviewAction'] = 'export';
    menu.addEventListener('click', () => { exportRunId = run.reviewRunId; });
    control.dataset['reportVersion'] = String(report.version);
    control.setAttribute('aria-label', exportOpenAccessibleName({ kind: 'report', label: reportLabel }));
    return menu;
  }

  function renderReportRecord(report: ReviewReportProjection, categories: ReviewRunProjection['categories']): HTMLElement {
    const record = report.record;
    const body = el('div', 'review-report-record');
    const part = (name: string, title: string, ...children: HTMLElement[]): HTMLElement => {
      const node = el('section', 'review-report-part');
      node.dataset['reportPart'] = name;
      node.append(el('h6', undefined, title), ...children);
      return node;
    };
    const table = el('table', 'review-report-table');
    const head = el('tr');
    for (const column of REVIEW_REPORT_OVERVIEW_COLUMNS) {
      const cell = el('th', undefined, column);
      cell.scope = 'col';
      head.append(cell);
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const row of record.overview.rows) {
      const tr = el('tr');
      tr.dataset['reviewCategory'] = row.categoryId;
      const name = el('th', undefined, row.label);
      name.scope = 'row';
      const state = el('td', undefined, row.stateLabel);
      state.dataset['label'] = REVIEW_REPORT_OVERVIEW_COLUMNS[1];
      const counts = el('td', undefined, reviewCountsLine(row.counts));
      counts.dataset['label'] = REVIEW_REPORT_OVERVIEW_COLUMNS[2];
      tr.append(name, state, counts);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const must = el('ol', 'review-report-list');
    if (record.mustItems.items.length === 0) must.append(el('li', undefined, REVIEW_REPORT_NO_MUST_ITEMS));
    for (const item of record.mustItems.items) {
      const line = el('li', undefined, reviewReportMustItemLine({ ...item, locationLabel: item.locationLabel.replaceAll('内容块', '段落') }));
      line.dataset['findingId'] = item.findingId;
      must.append(line);
    }
    const summaries = el('div', 'review-report-summaries');
    for (const entry of record.categorySummaries.entries) {
      const block = el('div', 'review-report-summary');
      block.dataset['reviewCategory'] = entry.categoryId;
      block.append(
        el('p', 'review-report-summary-title', `${entry.label} · ${entry.stateLine}`),
        el('p', undefined, `${reviewCountsLine(entry.counts)} · ${recordedReviewBasisWords(entry, categories)} · ${reviewReportExcludedLine(entry.excludedCount)}`),
      );
      summaries.append(block);
    }
    // Version /2's derived parts (Issue #1174): the totals, the chapter × category table and the 发现详单; a /1 record has none.
    const derived: HTMLElement[] = [];
    if (record.statistics !== undefined) {
      const stats = el('table', 'review-report-table review-report-statistics');
      const header = el('tr');
      for (const column of [REVIEW_REPORT_STATISTICS_CHAPTER, ...record.statistics.categories.map((category) => category.label), REVIEW_REPORT_TOTAL]) {
        const cell = el('th', undefined, column);
        cell.scope = 'col';
        header.append(cell);
      }
      const statsHead = el('thead');
      statsHead.append(header);
      const statsBody = el('tbody');
      for (const row of [...record.statistics.rows, { label: REVIEW_REPORT_TOTAL, counts: record.statistics.totals, total: record.statistics.total }]) {
        const tr = el('tr');
        const name = el('th', undefined, row.label.replaceAll('内容块', '段落'));
        name.scope = 'row';
        tr.append(name, ...row.counts.map((count) => el('td', undefined, String(count))), el('td', undefined, String(row.total)));
        statsBody.append(tr);
      }
      stats.append(statsHead, statsBody);
      derived.push(part('statistics', record.statistics.title, stats));
    }
    if (record.findings !== undefined) {
      const list = el('ol', 'review-report-list review-report-findings');
      for (const [index, entry] of record.findings.entries.entries()) {
        const item = el('li');
        item.dataset['findingIds'] = entry.findingIds.join(' ');
        item.append(el('p', 'review-report-summary-title', reviewReportFindingHeading(index + 1, entry)), ...reviewReportFindingLines({ ...entry, chapterLabel: entry.chapterLabel.replaceAll('内容块', '段落'), locationLabel: entry.locationLabel.replaceAll('内容块', '段落') }).map((line) => el('p', undefined, line)));
        if (entry.sources.length > 0) item.append(findingEvidenceList(entry.sources, options.openSource === undefined ? undefined : (evidenceId) => options.openSource?.(evidenceId)));
        list.append(item);
      }
      const omitted = reviewReportOmittedLine(record.findings.omitted);
      const findings = part('findings', record.findings.title, list);
      if (omitted !== null) findings.querySelector('h6')?.append(' · ', el('span', undefined, omitted));
      derived.push(findings);
    }
    const appendix = el('ul', 'review-report-list');
    appendix.append(el('li', undefined, reviewReportConfigurationLine(record.appendix.configuration.version)));
    for (const category of record.appendix.categories) appendix.append(el('li', undefined, reviewReportAppendixLine(category)));
    const overview = part('overview', record.overview.title, table);
    if (record.totals !== undefined) overview.querySelector('h6')?.append(' · ', el('span', 'review-report-totals', reviewReportTotalsLine(record.totals)));
    body.append(
      overview,
      part('must-items', record.mustItems.title, must),
      ...derived,
      part('category-summaries', record.categorySummaries.title, summaries),
      part('appendix', record.appendix.title, appendix, options.technicalDetails(
        'review-facts',
        el('dt', undefined, '报告'), el('dd', 'technical-identity', `${report.reportId} · ${technicalWords(`第 ${report.version} 版`, '版本')} · ${report.digest}`),
        el('dt', undefined, '生成时刻'), el('dd', 'technical-identity', report.generatedAt),
        el('dt', undefined, '审阅配置'), el('dd', 'technical-identity', `${record.appendix.configuration.schema} · ${record.appendix.configuration.version} · ${record.appendix.configuration.digest}`),
        ...record.appendix.categories.flatMap((category) => [
          el('dt', undefined, category.label),
          el('dd', 'technical-identity', [
            `计划 ${category.planEnvelopeDigest ?? '无'}`,
            `结果集修订版 ${category.resultSetRevisionId ?? '无'}`,
            category.adapterPin === null ? '无适配器' : `${category.adapterPin.route} · ${category.adapterPin.model} · ${category.adapterPin.fixtureIdentity ?? '—'} · ${category.adapterPin.fixtureSha256 ?? '—'}`,
          ].join(' · ')),
        ]),
      )),
    );
    return body;
  }

  // ---- actions ------------------------------------------------------------------------------------------

  /** One action at a time: every action control is disabled while one runs, and the surface is read again after. */
  async function act(busy: string, failure: string, run: () => Promise<void>, onError?: (error: unknown) => boolean): Promise<void> {
    if (destroyed || working) return;
    working = true;
    for (const control of card?.querySelectorAll<HTMLButtonElement>('button[data-review-action], [data-review-filter] button, [data-fact-filter] button') ?? []) control.disabled = true;
    options.setStatus(busy, 'busy');
    try {
      await run();
    } catch (error) {
      if (!(onError?.(error) ?? false)) options.setStatus(options.errorMessage(error, failure), 'error');
    } finally {
      working = false;
      refresh(true);
    }
  }

  const isCapabilityRefusal = (error: unknown): boolean => options.errorCode(error) === CAPABILITY_CODE;

  /** A manuscript action refused for the window's manuscript capability says so on the finding, with the way to it. */
  const capabilityRefusal = (finding: ReviewFindingProjection) => (error: unknown): boolean => {
    if (!isCapabilityRefusal(error)) return false;
    ui.capabilityFindingId = finding.findingId;
    options.setStatus(REVIEW_CAPABILITY_REASON, 'error');
    return true;
  };

  const binding = (run: ReviewRunProjection, finding: { blockId: string }): { manuscriptId: string; branchId: string; windowStartBlockId: string } => ({
    manuscriptId: run.manuscript.manuscriptId,
    branchId: run.manuscript.branchId,
    windowStartBlockId: finding.blockId,
  });

  async function goToText(run: ReviewRunProjection, finding: ReviewFindingProjection): Promise<void> {
    if (destroyed || working) return;
    options.setStatus(REVIEW_STATUS_LINES.openingText, 'busy');
    try {
      await options.goToText({
        manuscriptId: run.manuscript.manuscriptId,
        branchId: run.manuscript.branchId,
        blockId: finding.blockId,
        markId: finding.markId !== null && finding.markStatus !== null && LIVE_MARK_STATUSES.has(finding.markStatus) ? finding.markId : null,
      });
    } catch (error) {
      options.setStatus(options.errorMessage(error, REVIEW_STATUS_LINES.openTextFailed), 'error');
    }
  }

  async function acceptApply(run: ReviewRunProjection, finding: ReviewFindingProjection): Promise<void> {
    const markId = finding.markId;
    if (markId === null) return;
    ui.capabilityFindingId = null;
    await act(REVIEW_STATUS_LINES.applying, REVIEW_STATUS_LINES.applyUnknown, async () => {
      const applied = await applyOnce(
        run.manuscript,
        (clientEffectId) => api.applyChangeSuggestion({
          ...binding(run, finding), markId, clientEffectId, interaction: 'accept-and-apply', editedText: null, reason: null,
        }),
        (input) => api.getManuscriptApplyOutcome(input),
        undefined,
        async (clientEffectId, recovery) => { options.setStatus(recovery === 'confirming' ? '正在确认应用结果' : '结果待确认', 'busy'); await api.inspectApplyReceipt({ manuscriptId: run.manuscript.manuscriptId, branchId: run.manuscript.branchId, clientEffectId, recovery }); },
      );
      if (applied.acknowledged) {
        options.setStatus(REVIEW_STATUS_LINES.applied, 'success');
        showToast(REVIEW_STATUS_LINES.applied, { action: { label: '撤销', run: () => void act('正在撤销应用…', '未能撤销应用。', async () => {
          const result = await applyOnce(run.manuscript, (clientEffectId) => api.reverseAppliedChangeSuggestion({ ...binding(run, finding), markId, clientEffectId }),
            (input) => api.getManuscriptApplyOutcome(input));
          if (!result.acknowledged && result.outcome?.state !== 'committed') throw result.failure;
          options.setStatus('已撤销本次应用。', 'success');
        }) } });
        offerReasonAsk(finding.findingId, applied.result.card?.suggestion?.decision?.decisionId);
      } else if (isCapabilityRefusal(applied.failure)) {
        throw applied.failure;
      } else if (applied.outcome?.state === 'committed') {
        options.setStatus(REVIEW_STATUS_LINES.appliedRecovered, 'success');
      } else if (applied.outcome?.state === 'not-committed') {
        options.setStatus(options.errorMessage(applied.failure, REVIEW_STATUS_LINES.notApplied), 'error');
      } else {
        options.setStatus(REVIEW_STATUS_LINES.applyUnknown, 'error');
      }
    }, capabilityRefusal(finding));
  }

  async function markHandled(run: ReviewRunProjection, finding: ReviewFindingProjection): Promise<void> {
    const markId = finding.markId;
    if (markId === null) return;
    ui.capabilityFindingId = null;
    await act(REVIEW_STATUS_LINES.markingHandled, REVIEW_STATUS_LINES.markFailed, async () => {
      await api.updateEditorialMark({
        ...binding(run, finding), markId, action: 'set-status', body: null, highlightColor: null, status: 'resolved',
        targetKind: null, proposedText: null, rationale: null,
      });
      options.setStatus(REVIEW_STATUS_LINES.markedHandled, 'success');
    }, capabilityRefusal(finding));
  }

  async function openConvert(run: ReviewRunProjection, finding: ReviewFindingProjection): Promise<void> {
    const markId = finding.markId;
    if (markId === null) return;
    ui.capabilityFindingId = null;
    // The form starts from the mark's own words, exactly as the Mark Card's does: the text it stands on
    // and the 批注 it says.
    await act(REVIEW_STATUS_LINES.openingConvert, REVIEW_STATUS_LINES.convertFailed, async () => {
      const markCard = await api.getEditorialMarkCard({ manuscriptId: run.manuscript.manuscriptId, branchId: run.manuscript.branchId, markId });
      ui.ignore = null;
      ui.convert = { findingId: finding.findingId, markId, blockId: finding.blockId, proposedText: markCard.pinnedText, rationale: markCard.body, problem: null };
      options.setStatus(REVIEW_STATUS_LINES.convertOpened);
      pendingFocus = { findingId: finding.findingId, field: 'convert-to' };
    }, capabilityRefusal(finding));
  }

  async function confirmConvert(run: ReviewRunProjection, finding: ReviewFindingProjection, form: ConvertForm): Promise<void> {
    await act(REVIEW_STATUS_LINES.converting, REVIEW_STATUS_LINES.convertFailed, async () => {
      await api.updateEditorialMark({
        ...binding(run, finding), markId: form.markId, action: 'convert', body: null, highlightColor: null, status: null,
        targetKind: 'change-suggestion', proposedText: form.proposedText, rationale: form.rationale.trim().length > 0 ? form.rationale : null,
      });
      ui.convert = null;
      options.setStatus(REVIEW_STATUS_LINES.converted, 'success');
    }, (error) => {
      if (capabilityRefusal(finding)(error)) return true;
      announceReasonOnce(form, options.errorMessage(error, REVIEW_STATUS_LINES.convertFailed), options.setStatus);
      pendingFocus = { findingId: finding.findingId, field: 'convert-to' };
      return true;
    });
  }

  function openIgnore(finding: ReviewFindingProjection): void {
    if (working) return;
    ui.convert = null;
    ui.ignore = ui.ignore?.findingId === finding.findingId ? ui.ignore : { findingId: finding.findingId, reason: '', problem: null };
    pendingFocus = { findingId: finding.findingId, field: 'ignore-reason' };
    if (projection !== null) renderCard(projection);
    applyPendingFocus();
  }

  async function ignoreNow(run: ReviewRunProjection, finding: ReviewFindingProjection): Promise<void> {
    await act(REVIEW_STATUS_LINES.ignoring, REVIEW_STATUS_LINES.ignoreFailed, async () => {
      const updated = await api.recordReviewFindingDisposition({ reviewRunId: run.reviewRunId, findingId: finding.findingId, disposition: 'ignored', reason: REVIEW_IGNORE_DEFAULT_REASON });
      offerReasonAsk(finding.findingId, updated.run?.findings.find((entry) => entry.findingId === finding.findingId)?.learningDecisionId);
      ui.ignore = null;
      options.setStatus(REVIEW_STATUS_LINES.ignored, 'success');
    });
  }

  async function confirmIgnore(run: ReviewRunProjection, finding: ReviewFindingProjection, form: IgnoreForm, field: HTMLTextAreaElement, problemLine: HTMLElement): Promise<void> {
    form.reason = field.value.trim().length === 0 ? REVIEW_IGNORE_DEFAULT_REASON : field.value;
    const problem = reviewIgnoreReasonProblem(form.reason);
    if (problem !== null) {
      form.problem = problem;
      problemLine.textContent = problem;
      problemLine.hidden = false;
      field.setAttribute('aria-invalid', 'true');
      field.focus();
      return;
    }
    await act(REVIEW_STATUS_LINES.ignoring, REVIEW_STATUS_LINES.ignoreFailed, async () => {
      const updated = await api.recordReviewFindingDisposition({ reviewRunId: run.reviewRunId, findingId: finding.findingId, disposition: 'ignored', reason: form.reason.trim() });
      offerReasonAsk(finding.findingId, updated.run?.findings.find((entry) => entry.findingId === finding.findingId)?.learningDecisionId);
      ui.ignore = null;
      options.setStatus(REVIEW_STATUS_LINES.ignored, 'success');
    }, (error) => {
      announceReasonOnce(form, options.errorMessage(error, REVIEW_STATUS_LINES.ignoreFailed), options.setStatus);
      pendingFocus = { findingId: finding.findingId, field: 'ignore-reason' };
      return true;
    });
  }

  function closeInline(kind: 'ignore' | 'convert', findingId: string): void {
    if (kind === 'ignore') ui.ignore = null;
    else ui.convert = null;
    if (projection !== null) renderCard(projection);
    card?.querySelector<HTMLElement>(`article[data-finding-id="${findingId}"] [data-review-action="${kind === 'ignore' ? 'ignore' : 'convert-to-suggestion'}"]`)?.focus();
  }

  /**
   * 接受并应用全部 prepares the strip: every pending 修改建议 of the category, read through the service's own
   * filter so nothing on another page is missed, and of those the ones that still stand where they were
   * found. The strip lists exactly what 确认应用 will send.
   */
  async function prepareBatch(run: ReviewRunProjection, category: ReviewRunCategoryProjection): Promise<void> {
    await act(REVIEW_STATUS_LINES.batchPreparing, REVIEW_STATUS_LINES.batchPrepareFailed, async () => {
      const pending: ReviewFindingProjection[] = [];
      let after: number | null = null;
      for (let page = 0; page < MAX_FOLLOW_PAGES; page += 1) {
        const answer: ReviewWorkspaceProjection = await api.inspectReviewWorkspace({
          reviewRunId: run.reviewRunId, findingsAfterOrdinal: after, categoryId: category.categoryId, severity: null, status: 'pending', chapterBlockId: null,
        });
        const opened: ReviewRunProjection | null = answer.run;
        if (opened === null || opened.reviewRunId !== run.reviewRunId) break;
        pending.push(...opened.findings);
        if (!opened.findingsTruncated || opened.findings.length === 0) break;
        after = opened.findings.at(-1)!.ordinal;
      }
      const suggestions = pending.filter((finding) => finding.output === 'change-suggestion');
      const exact = suggestions.filter((finding) => !reviewFindingHasGuessedAnchor(finding.note) && finding.markId !== null && finding.markStatus === 'open' && finding.anchorState === 'exact' && finding.replacement !== null);
      // One batch cannot decide conflicting ranges; leave every overlapping suggestion for individual review.
      const standing = category.categoryId === 'local-text-check' ? exact.filter((finding) => !exact.some((other) => other !== finding && other.blockId === finding.blockId &&
        other.fromGrapheme < finding.toGrapheme && finding.fromGrapheme < other.toGrapheme)) : exact;
      const listed = standing.slice(0, MAX_BATCH_APPLY_SUGGESTIONS);
      ui.batch = {
        categoryId: category.categoryId,
        items: listed.map((finding) => ({ findingId: finding.findingId, markId: finding.markId!, blockId: finding.blockId, quote: finding.quote, replacement: finding.replacement! })),
        excluded: suggestions.length - standing.length,
        capped: standing.length > listed.length,
        problem: null,
        refused: false,
        capability: false,
        unknown: false,
      };
      options.setStatus(listed.length === 0 ? REVIEW_BATCH_NOTHING : reviewBatchReadyLine(listed.length));
      pendingFocus = { findingId: null, field: 'batch' };
    });
    // 接受并应用全部 applies in the same step (Issue #1410 item 5): what was left out is counted in the result, and
    // 撤销本批应用 takes the batch back.
    const strip = ui.batch;
    if (strip !== null && strip.categoryId === category.categoryId && strip.items.length > 0 && !strip.refused) await confirmBatch(run, strip);
  }

  /** 撤销本批应用: each applied 修改建议 of the batch reversed, newest first; the first that cannot be stops the rest and says so. */
  async function undoBatch(run: ReviewRunProjection): Promise<void> {
    const last = ui.applied;
    if (last === null || last === undefined) return;
    await act(REVIEW_STATUS_LINES.applying, REVIEW_BATCH_UNDO_FAILED, async () => {
      let undone = 0;
      for (let index = last.markIds.length - 1; index >= 0; index -= 1) {
        const markId = last.markIds[index]!;
        const target = { manuscriptId: run.manuscript.manuscriptId, branchId: run.manuscript.branchId, windowStartBlockId: last.blockIds[index]! };
        const reversed = await applyOnce(run.manuscript,
          (clientEffectId) => api.reverseAppliedChangeSuggestion({ ...target, markId, clientEffectId }),
          (input) => api.getManuscriptApplyOutcome(input));
        if (!reversed.acknowledged && reversed.outcome?.state !== 'committed') {
          ui.applied = null;
          options.setStatus(reviewBatchUndoneLine(undone, last.markIds.length), 'error');
          return;
        }
        undone += 1;
      }
      ui.applied = null;
      options.setStatus(reviewBatchUndoneLine(undone, last.markIds.length), 'success');
    });
  }

  async function confirmBatch(run: ReviewRunProjection, strip: BatchStrip): Promise<void> {
    const first = strip.items[0];
    if (first === undefined) return;
    await act(REVIEW_STATUS_LINES.applying, REVIEW_STATUS_LINES.applyUnknown, async () => {
      const applied = await applyOnce(
        run.manuscript,
        (clientEffectId) => api.applyChangeSuggestionBatch({ ...binding(run, first), markIds: strip.items.map((item) => item.markId), clientEffectId }),
        (input) => api.getManuscriptApplyOutcome(input),
        undefined,
        async (clientEffectId, recovery) => { options.setStatus(recovery === 'confirming' ? '正在确认应用结果' : '结果待确认', 'busy'); await api.inspectApplyReceipt({ manuscriptId: run.manuscript.manuscriptId, branchId: run.manuscript.branchId, clientEffectId, recovery }); },
      );
      if (applied.acknowledged || applied.outcome?.state === 'committed') {
        ui.batch = null;
        ui.applied = { categoryId: strip.categoryId, markIds: strip.items.map((item) => item.markId), blockIds: strip.items.map((item) => item.blockId), skipped: strip.excluded };
        options.setStatus(`${reviewBatchAppliedLine(strip.items.length, !applied.acknowledged)}${strip.excluded > 0 ? reviewBatchExcludedLine(strip.excluded) : ''}`, 'success');
        // The Apply is finished. Read its decisions in bounded pages; optional asks never hold the batch or its next action.
        void (async () => {
          const remaining = new Set(strip.items.map((item) => item.markId));
          let after: number | null = null;
          while (remaining.size > 0 && !destroyed) {
            const page = await api.inspectReviewWorkspace({ reviewRunId: run.reviewRunId, findingsAfterOrdinal: after });
            const settled = page.run;
            if (settled === null) return;
            for (const finding of settled.findings) {
              if (finding.markId !== null && remaining.delete(finding.markId)) offerReasonAsk(finding.findingId, finding.learningDecisionId);
            }
            if (!settled.findingsTruncated || settled.findings.length === 0) return;
            after = settled.findings.at(-1)!.ordinal;
          }
        })().catch(() => {});
        return;
      }
      // Refused — a suggestion drifted, or was decided meanwhile — or its outcome is unknown: the same
      // 确认应用 is never offered again; 重新准备应用 reads what stands now (V2-UX-EAPP-008).
      strip.refused = true;
      strip.unknown = applied.outcome === null;
      if (!applied.acknowledged && isCapabilityRefusal(applied.failure)) {
        strip.capability = true;
        strip.problem = REVIEW_CAPABILITY_REASON;
      } else {
        strip.problem = applied.outcome === null
          ? REVIEW_STATUS_LINES.applyUnknown
          : `${options.errorMessage(applied.failure, REVIEW_STATUS_LINES.notApplied)}${REVIEW_BATCH_REFUSED}`;
      }
      options.setStatus(strip.problem, 'error');
      pendingFocus = { findingId: null, field: 'batch' };
    });
  }

  function closeBatch(categoryId: string): void {
    ui.batch = null;
    if (projection !== null) renderCard(projection);
    card?.querySelector<HTMLElement>(`section.review-group[data-review-category="${categoryId}"] [data-review-action="batch-prepare"]`)?.focus();
  }

  async function continueRun(run: ReviewRunProjection): Promise<void> {
    await act(REVIEW_STATUS_LINES.continuing, REVIEW_STATUS_LINES.continueFailed, async () => {
      await api.continueReviewRun({ reviewRunId: run.reviewRunId });
      options.setStatus(REVIEW_STATUS_LINES.continued, 'success');
    });
  }

  /** 取消任务 of a Run a Series Retrieval Exclusion stopped, once confirmed (Issue #64, S29b). */
  async function cancelRun(run: ReviewRunProjection): Promise<void> {
    await act(REVIEW_STATUS_LINES.cancelling, REVIEW_STATUS_LINES.cancelFailed, async () => {
      await api.cancelReviewRun({ reviewRunId: run.reviewRunId });
      scopeCancel = null;
      options.setStatus(REVIEW_STATUS_LINES.cancelled, 'success');
    });
  }

  async function generateReport(run: ReviewRunProjection): Promise<void> {
    await act(REVIEW_STATUS_LINES.reporting, REVIEW_STATUS_LINES.reportFailed, async () => {
      const answer = await api.generateReviewReport({ reviewRunId: run.reviewRunId });
      options.setStatus(reviewReportGeneratedLine(answer.run?.report?.version ?? run.reportVersions.length + 1), 'success');
    });
  }

  // ---- 新建审阅 ------------------------------------------------------------------------------------

  async function openSheet(
    prefill: { categories: string[]; scope: ReviewScopeKind | null; from: string | null; to: string | null; selection?: SheetSelection | null } | null,
    opener: HTMLElement,
    procedureId: string | null = null,
    immediate = false,
  ): Promise<void> {
    if (destroyed || projection === null || sheet.open || working || sheetOpening) return;
    sheetOpening = true;
    // Native close clears `open` before its queued close event cleans up the old form.
    // Preserve a quick reopen instead of letting that event clear the new form.
    if (sheetState !== null) await new Promise<void>((resolve) => sheet.addEventListener('close', () => resolve(), { once: true }));
    if (destroyed || projection === null) { sheetOpening = false; return; }
    const defaults = await readActionDefaults();
    // 按已保存的工序 (Issue #65, S30): the house's enabled Captured Procedures, each as it applies to this Book (Issue #66,
    // S31b), read as the sheet opens. A sheet that cannot read them still opens, offering none.
    let procedures: ReadonlyArray<CapturedProcedureApplicabilityEntryProjection> = [];
    try {
      procedures = (await api.inspectCapturedProcedureApplicability()).procedures;
    } catch {
      procedures = [];
    }
    let seriesChoices: SheetState['seriesChoices'] = [];
    try { seriesChoices = (await api.inspectBookSeries?.({ bookId: options.bookId, membershipsAfter: null }))?.memberships ?? []; } catch { /* no selection is offered without a reading */ }
    sheetOpening = false;
    if (destroyed || projection === null || sheet.open) return;
    sheetState = {
      dismissed: false,
      houseWordListWanted: false,
      houseWordListRequest: 0,
      houseWordListLoading: false,
      localOptions: { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false, excludedRanges: [], doubledEllipsisBlockIds: [],
        tables: { characters: true, variantWords: true, bookTerms: projection.localBookTerms ?? [], houseWordList: null } },
      seriesId: null,
      seriesChoices,
      recommendation: new ProcedureRecommendationSelection(),
      categories: new Set(prefill?.categories ?? defaults.reviewCategories.filter((id) => projection!.categories.some((entry) => entry.categoryId === id && entry.available))),
      materialIds: new Set(),
      selection: prefill?.selection ?? null,
      scope: prefill?.scope ?? (projection.scopeOptions[defaults.reviewScope].available && defaults.reviewScope !== 'selection' ? defaults.reviewScope : 'whole'),
      from: prefill?.from ?? defaults.reviewFrom ?? projection.scopeOptions.chapters.chapters[0]?.blockId ?? null,
      to: prefill?.to ?? defaults.reviewTo ?? projection.scopeOptions.chapters.chapters.at(-1)?.blockId ?? null,
      problem: null,
      openerKey: focusKeyOf(opener),
      launched: false,
      procedures,
      procedure: null,
      requests: new ProcedureChoiceRequests(),
      definition: null,
    };
    renderSheet(projection, sheetState);
    sheet.show();
    if (immediate) { await startOrEstimateRun(sheetState, 'start'); return; }
    if (procedureId !== null && PROCEDURE_DEFINITION_KEY.test(procedureId)) {
      await chooseDefinition(sheetState, procedureId);
      return;
    }
    if (procedureId !== null) {
      await chooseProcedure(sheetState, procedureId);
      return;
    }
    sheet.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus();
  }

  /**
   * Fill the sheet from one Captured Procedure (ADR 0087 §4): the newest enabled version that validates — or, with `versionId`,
   * the exact eligible version the editor chose instead (Issue #66, S31; REUSE-054) — its steps this Book can take ticked and
   * every other category closed, the scope its slot. `''` returns the sheet to categories chosen by hand.
   */
  async function chooseProcedure(state: SheetState, procedureId: string, versionId: string | null = null): Promise<void> {
    if (projection === null || sheetState !== state) return;
    const ticket = state.requests.ask();
    let outcome: ProcedureChoiceOutcome;
    if (procedureId === '') {
      outcome = { kind: 'cleared' };
    } else {
      options.setStatus('正在读取所选的可复用工序…', 'busy');
      // Loading: 先看计划 and both selects wait, so nothing is prepared from the choice on screen before its answer.
      sheetUpdate();
      try {
        const run = await api.inspectCapturedProcedureRun({ procedureId, versionId });
        // A later choice superseded this one: its answer, not this, fills the sheet.
        if (sheetState !== state || destroyed || !state.requests.current(ticket)) return;
        outcome = { kind: 'answered', run };
      } catch (error) {
        if (sheetState !== state || destroyed || !state.requests.current(ticket)) return;
        // The choice the sheet held stays, its version and categories with it, and the reason is shown (Issue #684).
        outcome = { kind: 'failed', reason: options.errorMessage(error, '无法读取所选的可复用工序。') };
      }
    }
    // The choice settles into the sheet in one composed step (Issue #705 item 3): a reason is announced once, on the sheet's alert
    // line, and the status bar never repeats it (Issue #691).
    const settled = settleProcedureChoice(state, ticket, outcome, versionId !== null);
    if (state.procedure !== null && state.procedure.resolved?.runSourceScope !== 'series') state.seriesId = null;
    if (settled.status !== null) options.setStatus(settled.status);
    renderSheet(projection, state);
    // Back on the selector the editor used, while the sheet still shows it.
    sheet.querySelector<HTMLElement>(`[data-review-field="${settled.focus}"]`)?.focus();
  }

  /** Fill the sheet from a composite version (Issue #1173): every member ticked, 确定性检查 first; the plan is still read before 开始. */
  async function chooseDefinition(state: SheetState, key: string): Promise<void> {
    if (projection === null || sheetState !== state || destroyed) return;
    const ticket = state.requests.ask();
    sheetUpdate();
    const at = key.lastIndexOf('@');
    try {
      const entry = (await api.procedureLibrary({ action: 'inspect' })).procedures.find((procedure) => procedure.procedureId === key.slice(0, at));
      const pin = entry?.versions.find((version) => version.version === Number(key.slice(at + 1)));
      const document = entry?.documents.find((candidate) => candidate.version === pin?.version);
      if (pin === undefined || document === undefined || entry === undefined) throw new Error('PROCEDURE_DEFINITION_UNAVAILABLE');
      if (projection === null || sheetState !== state || destroyed || !state.requests.current(ticket)) return;
      state.definition = { composite: document.members !== undefined, pin, title: document.title, categoryIds: document.members?.map((member) => member.categoryId) ?? [entry.executorKind.replace(/^editorial-review\//u, '')] };
      state.categories.clear();
      for (const categoryId of state.definition.categoryIds) state.categories.add(categoryId);
      state.scope ??= 'whole';
    } catch (error) {
      if (projection === null || sheetState !== state || destroyed || !state.requests.current(ticket)) return;
      state.problem = options.errorMessage(error, '无法读取所选工序版本；请在「知识库 › 工序与规则」重新运行此工序。');
    }
    state.requests.settle(ticket);
    renderSheet(projection, state);
  }

  function renderSheet(workspace: ReviewWorkspaceProjection, state: SheetState): void {
    const form = el('form', 'review-sheet-form');
    form.noValidate = true;
    const title = el('h3', undefined, REVIEW_SHEET_TITLE);
    title.id = sheetTitleId;
    form.append(title);

    // 按已保存的工序 (Issue #65, S30; ADR 0087 §4): fills the categories and the scope; the plan is still read before 开始审阅.
    const procedureField = el('div', 'review-sheet-procedure');
    const procedureLabel = el('label', 'review-field');
    const procedureSelect = el('select');
    const versionSelect = el('select');
    procedureSelect.dataset['reviewField'] = 'procedure';
    procedureSelect.append(new Option(state.procedures.length === 0 ? SHEET_PROCEDURE_NONE_ENABLED : SHEET_PROCEDURE_NONE, ''));
    // Each with the one version a new use takes and how much of it this Book can take (S31b; REUSE-053): said, never ruled out.
    for (const procedure of state.procedures) {
      const option = new Option(sheetProcedureOption(procedure), procedure.procedureId);
      option.dataset['procedureFit'] = procedure.fit;
      procedureSelect.append(option);
    }
    // The values the selectors show come from the procedure the sheet holds, so a failed choice puts back the editor's own (Issue #691).
    const selection = procedureChoiceSelection(state.procedure);
    procedureSelect.value = selection.procedureId;
    procedureSelect.disabled = state.procedures.length === 0;
    procedureSelect.addEventListener('change', () => void chooseProcedure(state, procedureSelect.value));
    procedureLabel.append(el('span', undefined, SHEET_PROCEDURE_LABEL), procedureSelect);
    procedureField.append(procedureLabel);
    if (state.procedure !== null) {
      procedureField.dataset['procedureId'] = state.procedure.procedureId;
      if (state.procedure.resolved !== null) {
        procedureField.dataset['procedureVersionId'] = state.procedure.resolved.versionId;
        procedureField.dataset['procedureVersion'] = String(state.procedure.resolved.version);
        procedureField.dataset['procedureLatestEligible'] = String(state.procedure.resolved.latestEligible);
        // The exact version (Issue #66, S31; REUSE-054): the latest eligible by default, any other eligible one by choice.
        const versionLabel = el('label', 'review-field');
        versionSelect.dataset['reviewField'] = 'procedure-version';
        const procedureId = state.procedure.procedureId;
        state.procedure.eligibleVersions.forEach((version, index) => versionSelect.append(new Option(sheetProcedureVersionOption(version.version, index === 0), version.versionId)));
        versionSelect.value = selection.versionId ?? '';
        versionSelect.addEventListener('change', () => void chooseProcedure(state, procedureId, versionSelect.value));
        versionLabel.append(el('span', undefined, SHEET_PROCEDURE_VERSION_LABEL), versionSelect);
        procedureField.append(versionLabel);
      }
      const procedureLines = sheetProcedureLines(state.procedure);
      if (procedureLines.length > 0) {
        const list = el('ul');
        for (const line of procedureLines) list.append(el('li', 'review-sheet-procedure-line', line));
        procedureField.append(list);
      }
    }

    const categories = el('fieldset', 'review-category-options');
    const categoryLegend = el('legend', undefined, REVIEW_CATEGORY_LEGEND);
    if (state.definition !== null) {
      const labels = state.definition.categoryIds.map((categoryId) => workspace.categories.find((entry) => entry.categoryId === categoryId)?.label ?? categoryId);
      const line = el('span', 'review-sheet-definition', `按工序《${state.definition.title}》${technicalWords(`第 ${state.definition.pin.version} 版`, '版本')}依次审阅：${labels.join(' → ')}；成员不能单独增减。`);
      line.dataset['procedureDefinition'] = `${state.definition.pin.procedureId}@${state.definition.pin.version}`;
      form.append(line);
    }
    procedureField.hidden = state.definition !== null;
    categories.append(categoryLegend);
    const categoryInputs = new Map<string, { input: HTMLInputElement; label: HTMLLabelElement; reason: HTMLElement; calls: HTMLElement; entry: ReviewWorkspaceCategoryProjection }>();
    const localCategory: ReviewWorkspaceCategoryProjection = {
      categoryId: 'local-text-check', label: '本地文字检查', description: '单独在本机检查标点、规范字形与异形词；数字检查可选。',
      output: 'change-suggestion', riskPointsOnly: false, batchApply: true, searchEngine: false, modelFree: true,
      materialReferencesAllowed: false, basis: { categoryId: 'local-text-check', executor: 'local-text-check', searchEngine: false, guidelineDocuments: [], procedure: { title: '确定性检查', version: '3' } }, guidelineDocuments: [],
      procedure: { title: '确定性检查', version: '3' }, available: workspace.manuscript !== null,
      unavailableReason: workspace.manuscript === null ? '导入稿件后即可检查。' : null,
      scopes: { whole: workspace.scopeOptions.whole, chapters: workspace.scopeOptions.chapters,
        changed: { available: false, unavailableReason: '本地文字检查请选择全书、选章或当前选区。' }, selection: { available: true, unavailableReason: null } },
    };
    const offeredCategories = [localCategory, ...workspace.categories.filter((entry) => entry.categoryId !== localCategory.categoryId)];
    for (const entry of offeredCategories) {
      const label = el('label', 'review-category-option');
      label.dataset['reviewCategoryOption'] = entry.categoryId;
      const input = el('input');
      input.type = 'checkbox';
      input.name = 'review-category';
      input.value = entry.categoryId;
      input.checked = state.categories.has(entry.categoryId);
      const text = el('span', 'review-category-text');
      const basis = el('a', 'review-category-basis', [...entry.guidelineDocuments.map((document) => document.title), entry.procedure.title].join(' · '));
      basis.href = '#'; basis.title = basis.textContent ?? '';
      basis.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); sheet.close(); options.openRules?.(); });
      basis.id = uid('category-basis');
      const reason = el('span', 'review-category-reason');
      reason.id = uid('category-reason');
      input.setAttribute('aria-describedby', `${basis.id} ${reason.id}`);
      text.append(el('strong', undefined, entry.label), el('span', 'review-category-description', entry.description.split(/[；。]/u)[0] + '。'), reason);
      const calls = el('span', 'review-category-calls');
      label.append(input, text, basis, calls);
      input.addEventListener('change', () => {
        if (input.checked) state.categories.add(entry.categoryId);
        else state.categories.delete(entry.categoryId);
        state.problem = null;
        renderSheet(workspace, state);
      });
      categories.append(label);
      categoryInputs.set(entry.categoryId, { input, label, reason, calls, entry });
    }
    const localOptions = el('fieldset', 'review-local-options');
    localOptions.dataset['localCheckOptions'] = '';
    localOptions.append(el('legend', undefined, '本次本地检查选项'));
    const proseLabel = el('label', 'review-field');
    const prose = el('input'); prose.type = 'checkbox'; prose.dataset['localCheckProse'] = '';
    prose.checked = state.localOptions.punctuation === 'chinese-prose';
    prose.addEventListener('change', () => { state.localOptions = { ...state.localOptions, punctuation: prose.checked ? 'chinese-prose' : 'off' }; updateSheet(); });
    proseLabel.append(prose, el('span', undefined, `我确认所选范围为中文正文，启用${technicalWords(' P01–P03 ', '')}标点检查`));
    const numeralLabel = el('label', 'review-field');
    const numerals = el('select'); numerals.dataset['localCheckNumerals'] = '';
    // Internal rule codes are the developer layer's (Issue #1431 item 55); the national standard and its scope stay.
    for (const [value, label] of [['off', '数字检查关闭'], ['national-standard', `按国标有限条款检查${technicalWords(' N01、N02')}`], ['editor-convention', `按编辑约定检查${technicalWords(' N01、N02')}`]]) numerals.append(new Option(label, value));
    numerals.value = state.localOptions.numerals;
    numerals.addEventListener('change', () => {
      const value = numerals.value as typeof state.localOptions.numerals;
      // Choosing a basis is the choice of it and of N01、N02 (Issue #1410 item 16): no box to tick besides.
      state.localOptions = { ...state.localOptions, numerals: value, numeralRules: value === 'off' ? [] : ['N01', 'N02'], numeralsConfirmed: value !== 'off' }; updateSheet();
    });
    numeralLabel.append(el('span', undefined, '数字依据'), numerals);
    const publicationLabel = el('label', 'review-field');
    const publication = el('select'); publication.dataset['localCheckPublication'] = '';
    for (const [value, label] of [['unknown', '适用范围未确认'], ['within-scope', '我声明本次出版物/范围在 GB/T 15835 §1 适用范围内'], ['literary', '文艺类出版物（不适用国标数字选项）'], ['reprinted-classic', '重印古籍（不适用国标数字选项）']]) publication.append(new Option(label, value));
    publication.value = state.localOptions.publication;
    publication.addEventListener('change', () => { state.localOptions = { ...state.localOptions, publication: publication.value as typeof state.localOptions.publication }; updateSheet(); });
    publicationLabel.append(el('span', undefined, '出版物适用范围'), publication);
    const confirmationLabel = el('p', 'field-note', technicalWords('选择数字依据即按 N01、N02 检查；编辑约定不表示国标适用。', '编辑约定不表示国标适用。'));
    confirmationLabel.dataset['localCheckNumeralsNote'] = '';
    localOptions.append(proseLabel, numeralLabel, publicationLabel, confirmationLabel,
      el('p', 'field-note', '单省略号、缺零百分数、括号序号冗余标点和无附加条件的异形词可生成机械修正，其余为批注；排除代码、网址和邮件等。'));
    const tables = state.localOptions.tables!;
    for (const [key, label] of [['characters', '通用规范汉字表（2013）及字形对照参考'], ['variantWords', '第一批异形词整理表（GF 1001-2001；附录仅供复核）']] as const) {
      const row = el('label', 'review-field'); const input = el('input'); input.type = 'checkbox'; input.checked = tables[key]; input.dataset['localTable'] = key;
      input.addEventListener('change', () => { state.localOptions = { ...state.localOptions, tables: { ...state.localOptions.tables!, [key]: input.checked } }; updateSheet(); });
      row.append(input, el('span', undefined, label)); localOptions.append(row);
    }
    // 本书词表 as a table (Issue #1431 item 56): a type, the adopted form and its variants per row; the entries the checker takes
    // are built here, and a pasted tab-separated list stays an optional import.
    const termsField = el('fieldset', 'review-field review-book-terms'); termsField.dataset['localBookTerms'] = '';
    termsField.append(el('legend', undefined, '本书术语、人名与地名表'), el('p', 'field-note', '列出的异写可机械替换为采用写法，并随本次审阅保存。'));
    const termRows = el('div', 'review-book-term-rows');
    const termProblem = el('span'); termProblem.setAttribute('role', 'alert'); let invalidTerms = false;
    const kindWords: ReadonlyArray<readonly [BookTermEntry['kind'], string]> = [['term', '术语'], ['person', '人名'], ['place', '地名']];
    const readTerms = (): void => {
      const entries = [...termRows.querySelectorAll<HTMLElement>('[data-book-term-row]')].map((row) => ({
        kind: row.querySelector<HTMLSelectElement>('select')!.value as BookTermEntry['kind'],
        preferred: row.querySelector<HTMLInputElement>('[data-book-term-field="preferred"]')!.value.trim(),
        variants: row.querySelector<HTMLInputElement>('[data-book-term-field="variants"]')!.value.split(/[、，,|]/u).map((variant) => variant.trim()).filter((variant) => variant !== ''),
      })).filter((entry) => entry.preferred !== '' || entry.variants.length > 0);
      invalidTerms = !validBookTerms(entries);
      termProblem.textContent = invalidTerms ? '请核对本书词表：每行需有采用写法和至少一种异写，写法不重复，每条最多 16 种异写，最多 500 条。' : '';
      if (!invalidTerms) state.localOptions = { ...state.localOptions, tables: { ...state.localOptions.tables!, bookTerms: entries } };
      updateSheet();
    };
    const addTermRow = (entry: BookTermEntry | null): void => {
      const row = el('div', 'review-book-term-row'); row.dataset['bookTermRow'] = '';
      const kind = el('select'); kind.setAttribute('aria-label', '类型');
      for (const [value, label] of kindWords) kind.append(new Option(label, value));
      kind.value = entry?.kind ?? 'term';
      const preferred = el('input'); preferred.dataset['bookTermField'] = 'preferred'; preferred.setAttribute('aria-label', '采用写法'); preferred.placeholder = '采用写法'; preferred.value = entry?.preferred ?? '';
      const variants = el('input'); variants.dataset['bookTermField'] = 'variants'; variants.setAttribute('aria-label', '异写'); variants.placeholder = '异写，多个用顿号分隔'; variants.value = entry?.variants.join('、') ?? '';
      const remove = el('button', 'quiet', '删除'); remove.type = 'button';
      remove.addEventListener('click', () => { row.remove(); readTerms(); });
      kind.addEventListener('change', readTerms); preferred.addEventListener('input', readTerms); variants.addEventListener('input', readTerms);
      row.append(kind, preferred, variants, remove); termRows.append(row);
    };
    for (const entry of tables.bookTerms) addTermRow(entry);
    const addTerm = el('button', 'secondary', '添加一行'); addTerm.type = 'button';
    addTerm.addEventListener('click', () => { addTermRow(null); termRows.lastElementChild?.querySelector<HTMLInputElement>('[data-book-term-field="preferred"]')?.focus(); });
    const paste = el('details'); paste.append(el('summary', undefined, '从文本导入'));
    const pasted = el('textarea'); pasted.setAttribute('aria-label', '粘贴的词表'); pasted.placeholder = '每行：类型、采用写法、异写，用制表符分隔';
    const importTerms = el('button', 'secondary', '导入'); importTerms.type = 'button';
    importTerms.addEventListener('click', () => {
      try { for (const entry of parseBookTerms(pasted.value)) addTermRow(entry); pasted.value = ''; paste.open = false; readTerms(); }
      catch (error) { termProblem.textContent = error instanceof Error ? error.message : '请核对粘贴的词表。'; }
    });
    paste.append(pasted, importTerms);
    termsField.append(termRows, addTerm, paste, termProblem);
    localOptions.append(termsField);
    let refreshHouse: (() => Promise<void>) | null = null;
    if (api.inspectHouseWordList !== undefined && api.saveHouseWordList !== undefined) {
      const houseChoice = el('label', 'review-field'); const house = el('input'); house.type = 'checkbox'; house.disabled = true; house.dataset['localHouseWordList'] = '';
      const houseStatus = el('span', undefined, '本社自用词表：正在读取');
      refreshHouse = async (): Promise<void> => {
        const request = ++state.houseWordListRequest;
        state.houseWordListLoading = true;
        house.disabled = true;
        updateSheet();
        try {
          const page = await api.inspectHouseWordList!({ versionId: null, entryOffset: 0, historyOffset: 0 });
          if (sheetState !== state || state.dismissed || destroyed || request !== state.houseWordListRequest) return;
          house.disabled = page.selected === null || page.selected.enabledCount === 0;
          house.checked = state.houseWordListWanted;
          state.localOptions = { ...state.localOptions, tables: { ...state.localOptions.tables!, houseWordList: state.houseWordListWanted && !house.disabled ? page.current : null } };
          houseStatus.textContent = page.selected === null ? '本社自用词表：尚无词条，可在下方编辑' : `本社自用词表 ${technicalWords(`第${page.selected.ordinal}版`, '版本')} · ${page.selected.enabledCount} 条启用；选中后仅生成批注`;
          house.onchange = () => { state.houseWordListWanted = house.checked; state.localOptions = { ...state.localOptions, tables: { ...state.localOptions.tables!, houseWordList: house.checked ? page.current : null } }; updateSheet(); };
        } catch {
          if (sheetState !== state || state.dismissed || destroyed || request !== state.houseWordListRequest) return;
          house.disabled = true; houseStatus.textContent = '本社词表读取失败，保留此前选用的版本；请重新打开检查选项。';
        } finally {
          if (sheetState === state && !state.dismissed && !destroyed && request === state.houseWordListRequest) {
            state.houseWordListLoading = false;
            updateSheet();
          }
        }
      };
      houseChoice.append(house, houseStatus); localOptions.append(houseChoice);
      const details = el('details'); details.append(el('summary', undefined, '编辑本社自用词表')); const host = el('div'); details.append(host); localOptions.append(details);
      const editor = mountHouseWordList({ root: host, api: { inspectHouseWordList: api.inspectHouseWordList, saveHouseWordList: api.saveHouseWordList }, setStatus: options.setStatus, onSaved: () => void refreshHouse?.() });
      details.addEventListener('toggle', () => { if (details.open) void editor.load(); });
      sheet.addEventListener('close', () => editor.destroy(), { once: true });
    }

    const scopes = el('fieldset', 'review-scope-options');
    scopes.append(el('legend', undefined, REVIEW_SCOPE_LEGEND));
    const scopeInputs = new Map<ReviewScopeKind, HTMLInputElement>();
    // What could not be checked for 只审改动过的章, said beside it as well as on the coverage row (Issue #716).
    const changedNote = el('small', 'field-note review-changed-scope-note');
    changedNote.dataset['reviewChangedScopeNote'] = '';
    changedNote.id = uid('changed-scope-note');
    for (const kind of REVIEW_SCOPE_KINDS) {
      const availability = scopeAvailability(workspace, state, kind);
      const label = el('label', 'review-scope-option');
      label.dataset['reviewScopeOption'] = kind;
      const input = el('input');
      input.type = 'radio';
      input.name = 'review-scope';
      input.value = kind;
      input.checked = state.scope === kind;
      input.disabled = !availability.available;
      const name = el('span', undefined, REVIEW_SCOPE_LABELS[kind]);
      label.append(input, name);
      if (!availability.available) {
        label.dataset['unavailableReason'] = availability.unavailableReason ?? '';
        input.dataset['unavailableReason'] = availability.unavailableReason ?? '';
        const why = el('span', undefined, ` · ${availability.unavailableReason ?? ''}`);
        why.id = uid('scope-reason');
        input.setAttribute('aria-describedby', why.id);
        why.className = 'visually-hidden'; label.title = availability.unavailableReason ?? '';
        name.append(why);
      }
      if (kind === 'changed') {
        input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), changedNote.id].filter((id) => id !== null).join(' '));
      }
      input.addEventListener('change', () => {
        if (!input.checked) return;
        state.scope = kind;
        state.problem = null;
        updateSheet();
      });
      scopes.append(label);
      scopeInputs.set(kind, input);
    }
    scopes.append(changedNote);
    const chapterOptions = workspace.scopeOptions.chapters.chapters;
    const range = el('div', 'review-chapter-range');
    const chapterSelect = (which: 'from' | 'to'): HTMLSelectElement => {
      const label = el('label', 'review-field');
      label.append(el('span', undefined, which === 'from' ? REVIEW_CHAPTER_FROM : REVIEW_CHAPTER_TO));
      const select = el('select');
      select.dataset['reviewChapter'] = which;
      select.append(new Option(REVIEW_CHAPTER_PLACEHOLDER, ''));
      for (const chapter of chapterOptions) select.append(new Option(reviewChapterOptionLabel(chapter), chapter.blockId));
      const selected = which === 'from' ? state.from : state.to;
      if (workspace.listPages?.[CHAPTER_PAGE_PATH]?.nextOrdinal != null && selected !== null && !chapterOptions.some((chapter) => chapter.blockId === selected)) {
        select.append(new Option(TASK_SELECTED_CHAPTER_NOT_LOADED, selected));
      }
      select.value = (which === 'from' ? state.from : state.to) ?? '';
      select.addEventListener('change', () => {
        const value = select.value === '' ? null : select.value;
        if (which === 'from') state.from = value;
        else state.to = value;
        state.problem = null;
        updateSheet();
      });
      label.append(select);
      range.append(label);
      return select;
    };
    const fromSelect = chapterSelect('from');
    const toSelect = chapterSelect('to');
    const chapterPage = workspace.listPages?.[CHAPTER_PAGE_PATH];
    if (chapterPage !== undefined && chapterPage.nextOrdinal !== null) {
      const more = el('button', 'secondary', taskPageMore('章节', chapterPage.shown, chapterPage.total));
      more.type = 'button';
      more.dataset['reviewChapterPage'] = '';
      more.addEventListener('click', () => {
        more.disabled = true;
        void readChapterPage(workspace).then((loaded) => {
          if (destroyed || sheetState !== state || projection !== workspace) return;
          projection = loaded;
          renderSheet(projection, state);
          // Once the last choices are read the control is gone, so focus stays in the range it extended.
          (sheet.querySelector<HTMLElement>('[data-review-chapter-page]') ?? sheet.querySelector<HTMLElement>('[data-review-chapter="from"]'))?.focus();
        }).catch((error: unknown) => {
          if (destroyed || sheetState !== state) return;
          more.disabled = false;
          options.setStatus(options.errorMessage(error, TASK_PAGE_FAILED), 'error');
        });
      });
      range.append(more);
    }
    scopes.append(range);

    const networkNotice = el('p', 'review-network-notice');
    networkNotice.setAttribute('role', 'status');
    const networkSettings = actionButton('open-search-settings', 'quiet', () => { sheet.close(); options.openSearchSettings?.(); });
    const consequences = el('dl', 'review-consequences');
    const consequenceValues = REVIEW_CONSEQUENCE_TERMS.map((term, index) => {
      const value = el('dd');
      // 不会做 is the technical layer's alone (Issue #1413 cluster 4); the value is kept off the page in ordinary mode.
      if (index !== 2 || technicalLayerVisible) consequences.append(el('dt', undefined, term), value);
      return value;
    });
    const [readValue, sendValue, notDoValue, costValue] = consequenceValues as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    readValue.dataset['consequence'] = 'read';
    sendValue.dataset['consequence'] = 'send';
    notDoValue.dataset['consequence'] = 'not-do';
    notDoValue.textContent = REVIEW_NOT_DO;
    costValue.dataset['consequence'] = 'cost';

    const problem = el('p', 'review-problem review-sheet-problem');
    problem.id = uid('sheet-problem');
    problem.setAttribute('role', 'alert');
    const estimateNotice = el('p', 'review-estimate'); estimateNotice.setAttribute('role', 'status');
    const progress = el('p', 'review-preparation-progress');
    progress.setAttribute('aria-live', 'polite');
    const start = actionButton('start', 'primary', () => void startOrEstimateRun(state, 'start'));
    const prepare = actionButton('prepare', 'quiet', () => void startOrEstimateRun(state));
    prepare.classList.add('text-link');
    const close = actionButton('close-sheet', 'quiet', () => sheet.close());
    const actions = el('div', 'button-row review-sheet-actions');
    const newChooser = state.chooser === undefined;
    const chooser = state.chooser ??= createDispatchChooser({ role: 'main-editorial', changed: config => { void updateExecutionChoice(state, config); } });
    if (newChooser) void (async () => {
      const [settings, preferences] = await Promise.all([api.getModelServiceSettings(), window.ai7.getPreferences()]);
      if (!state.dismissed) chooser.render(settings, preferences.values['model.favourites'], state.executionConfig);
    })().catch(() => { chooser.unavailable(); });
    const primaryActions = el('div', 'button-row'); primaryActions.append(chooser.element, start, prepare);
    actions.append(procedureField, primaryActions, el('small', 'review-management-note', '规范文件与工序在知识库里管理；这里只选用'));
    const bar = el('div', 'review-sheet-bar'); bar.append(title, close);
    form.append(categories, localOptions, scopes, consequences, networkNotice, networkSettings, problem, estimateNotice, progress, actions);
    form.addEventListener('submit', (event) => event.preventDefault());
    for (const event of ['input', 'change']) form.addEventListener(event, () => { delete state.clientCommandId; delete state.estimate; sheetUpdate(); });

    // Everything that follows from the choices, redrawn in place so a choice never moves the focus.
    function updateSheet(): void {
      estimateNotice.textContent = state.estimate ?? '';
      estimateNotice.hidden = state.estimate === undefined;
      const preparing = state.launchPending === true || state.choicePending === true;
      const filled = state.procedure?.resolved ?? null;
      const loading = state.requests.loading;
      const effective = effectiveCategories(workspace, state);
      const blocked = sheetPreparationReason(workspace, state);
      procedureField.dataset['procedureLoading'] = String(loading);
      for (const { input, label, reason, calls, entry } of categoryInputs.values()) {
        input.checked = effective.includes(entry.categoryId);
        const step = filled?.steps.find((candidate) => candidate.categoryId === entry.categoryId) ?? null;
        const why = categoryUnavailableReason(entry, state);
        const networkUnavailable = entry.networkUnavailable === true && !localOnly(state);
        // A filled sheet's categories are the procedure's: neither added to nor dropped here (ADR 0087 §4) — but a Series step
        // is the editor's to choose at each run (S31b; REUSE-050).
        input.disabled = state.definition !== null || (why !== null && !networkUnavailable) || preparing || !procedureCategoryOpen(filled !== null, step);
        if (step !== null && step.available && step.chosenApart) label.dataset['procedureChosenApart'] = 'true';
        else delete label.dataset['procedureChosenApart'];
        reason.textContent = networkUnavailable ? '此类别需要联网检索。' : (why ?? '').split(/[；。]/u)[0] + (why === null ? '' : '。');
        const from = chapterOptions.find((chapter) => chapter.blockId === state.from);
        const to = chapterOptions.find((chapter) => chapter.blockId === state.to);
        const count = estimateReviewCalls(entry, state.scope, workspace.scopeUnitCounts, from && to ? { startPosition: from.position, endPosition: to.endPosition } : null);
        calls.textContent = count === null ? '选好范围后估计' : `约 ${count} 次调用`;
        reason.hidden = why === null;
        const description = label.querySelector<HTMLElement>('.review-category-description');
        if (description) description.hidden = why !== null;
        if (why === null) {
          delete label.dataset['unavailableReason'];
          delete input.dataset['unavailableReason'];
        } else {
          label.dataset['unavailableReason'] = why;
          input.dataset['unavailableReason'] = why;
        }
      }
      const local = state.categories.has('local-text-check');
      localOptions.hidden = !local;
      confirmationLabel.hidden = state.localOptions.numerals === 'off';
      for (const [kind, input] of scopeInputs) input.disabled = !scopeAvailability(workspace, state, kind).available || preparing || (filled !== null && kind !== filled.scopeSlot);

      const notes = reviewChangedScopeNotes(workspace.coverage, state.categories);
      changedNote.textContent = notes.join(' ');
      changedNote.hidden = notes.length === 0;
      procedureSelect.disabled = preparing || loading || state.procedures.length === 0;
      versionSelect.disabled = preparing || loading || versionSelect.options.length < 2;
      range.hidden = state.scope !== 'chapters';
      fromSelect.disabled = state.scope !== 'chapters' || preparing;
      toSelect.disabled = state.scope !== 'chapters' || preparing;
      const from = chapterOptions.find((chapter) => chapter.blockId === state.from) ?? null;
      const to = chapterOptions.find((chapter) => chapter.blockId === state.to) ?? null;
      const selected = offeredCategories.filter((entry) => effective.includes(entry.categoryId));
      const estimate = reviewConsequenceEstimate(selected, state.scope, workspace, { from, to });
      readValue.textContent = estimate.read; sendValue.textContent = estimate.send;
      notDoValue.textContent = estimate.notDo; costValue.textContent = estimate.cost;
      const networkBlocked = selected.some((entry) => entry.networkUnavailable === true);
      networkNotice.hidden = !networkBlocked;
      networkSettings.hidden = !selected.some((entry) => entry.searchEngine) || options.openSearchSettings === undefined;
      networkNotice.textContent = networkBlocked ? '联网检索尚未就绪，请到设置中配置后再开始。' : '';
      problem.textContent = blocked ?? state.problem ?? '';
      problem.hidden = state.problem === null && blocked === null;
      progress.hidden = !preparing;
      progress.textContent = state.launchPending ? '正在启动审阅…' : state.choicePending ? '正在更新可用的审阅范围…' : '';
      prepare.disabled = preparing || loading || networkBlocked || blocked !== null || effective.length === 0 || state.scope === null;
      for (const control of [prepare, start]) {
        if (blocked !== null) control.setAttribute('aria-describedby', problem.id);
        else control.removeAttribute('aria-describedby');
      }
      if (local && (invalidTerms || (state.localOptions.punctuation === 'off' && state.localOptions.numerals === 'off' && !state.localOptions.tables?.characters && !state.localOptions.tables?.variantWords && state.localOptions.tables?.bookTerms.length === 0 && state.localOptions.tables?.houseWordList === null) || (state.localOptions.numerals !== 'off' && !state.localOptions.numeralsConfirmed))) prepare.disabled = true;
      start.disabled = prepare.disabled || state.launchPending === true;
      close.disabled = state.launchPending === true;

    }
    sheetUpdate = updateSheet;
    sheetContent(sheet, bar, Array.from(form.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== actions), actions, form);
    updateSheet();
    void refreshHouse?.();
  }

  /** A scope as the sheet offers it: 当前选区 once it holds a Run's selection, every other as the workspace says (P2-4). */
  function scopeAvailability(workspace: ReviewWorkspaceProjection, state: SheetState, kind: ReviewScopeKind): { available: boolean; unavailableReason: string | null } {
    if (state.categories.has('local-text-check') && kind === 'changed') return { available: false, unavailableReason: '本地文字检查请选择全书、选章或当前选区。' };
    if (kind === 'selection' && state.selection !== null) return { available: true, unavailableReason: null };
    return workspace.scopeOptions[kind];
  }

  function chaptersOf(state: SheetState): { from: ReviewChapterOptionProjection | null; to: ReviewChapterOptionProjection | null } {
    const chapters = projection?.scopeOptions.chapters.chapters ?? [];
    return {
      from: chapters.find((chapter) => chapter.blockId === state.from) ?? null,
      to: chapters.find((chapter) => chapter.blockId === state.to) ?? null,
    };
  }

  async function updateExecutionChoice(state: SheetState, config: RuntimeExecutionConfig): Promise<void> {
    state.executionConfig = config;
    delete state.clientCommandId;
    const ticket = state.choiceTicket = (state.choiceTicket ?? 0) + 1;
    state.choicePending = true;
    sheetUpdate();
    try {
      const next = await api.inspectReviewWorkspace({ reviewRunId: query.reviewRunId, executionConfig: config });
      if (destroyed || sheetState !== state || state.choiceTicket !== ticket) return;
      const focused = state.chooser?.element.contains(document.activeElement) ? document.activeElement : null;
      state.choicePending = false;
      projection = next;
      renderSheet(next, state);
      if (focused instanceof HTMLElement) focused.focus();
    } catch (error) {
      if (destroyed || sheetState !== state || state.choiceTicket !== ticket) return;
      state.choicePending = false;
      state.problem = options.errorMessage(error, '无法读取本次模型可用的审阅范围。');
      sheetUpdate();
    }
  }

  async function startOrEstimateRun(state: SheetState, mode: 'preview' | 'start' = 'preview'): Promise<void> {
    if (destroyed || state.launchPending || state.choicePending || projection === null) return;
    // The version on show is the version pinned, and never while a choice is still loading (S31 review P2-1; REUSE-054).
    const resolved = state.procedure?.resolved ?? null;
    const shown = resolved === null ? null : sheet.querySelector<HTMLSelectElement>('[data-review-field="procedure-version"]')?.value ?? null;
    const choice = procedurePreparationPin(resolved, shown, state.requests.loading);
    if (choice.refusal !== null) {
      state.problem = choice.refusal;
      sheetUpdate();
      return;
    }
    const blocked = sheetPreparationReason(projection, state);
    if (blocked !== null) {
      state.problem = blocked;
      sheetUpdate();
      return;
    }
    const categoryIds = effectiveCategories(projection, state);
    const { from, to } = chaptersOf(state);
    const asked = reviewSheetScope({
      scope: state.scope,
      from,
      to,
      selection: state.selection,
      selectionReason: projection.scopeOptions.selection.unavailableReason,
    });
    state.problem = categoryIds.length === 0 ? REVIEW_PICK_CATEGORY : 'problem' in asked ? asked.problem : null;
    if (state.problem !== null || !('request' in asked)) {
      // The problem line is an alert, so it is heard where the editor stands; focus stays on 先看计划.
      sheetUpdate();
      return;
    }
    const scope = asked.request;
    void rememberActionDefaults({ reviewCategories: categoryIds, reviewScope: scope.kind,
      reviewFrom: state.from, reviewTo: state.to }).catch(() => options.setStatus('未能记住本次审阅设置。', 'error'));
    try {
      const preparationInput: Parameters<ReviewApi['prepareReviewRun']>[0] = {
        ...(categoryIds.includes('local-text-check') ? { localCheck: { ...state.localOptions, numeralsConfirmed: state.localOptions.numerals !== 'off' && state.localOptions.numeralsConfirmed } } : {}),
        ...(state.seriesId === null ? {} : { seriesId: state.seriesId }),
        categoryIds,
        scope,
        ...(state.materialIds.size === 0 ? {} : { materialIds: taskMaterialSelection(projection.materials?.items ?? [], state.materialIds) }),
        ...(choice.pin === null ? {} : { capturedProcedure: choice.pin }),
        ...(state.definition?.composite !== true ? {} : { procedureDefinition: state.definition.pin }),
      };
      if (mode === 'preview') {
        const bounds = chaptersOf(state);
        const from = bounds.from;
        const to = bounds.to;
        const workspace = projection;
        const estimates = workspace.categories.filter(category => categoryIds.includes(category.categoryId)).map(category => {
          const count = estimateReviewCalls(category, state.scope, workspace.scopeUnitCounts, from && to ? { startPosition: from.position, endPosition: to.endPosition } : null);
          return `${category.label}：${count === null ? '按所选范围估计' : `约 ${count} 次调用`}`;
        });
        state.estimate = estimates.join('；');
        state.problem = null;
        sheetUpdate();
        options.setStatus('已显示审阅估计。', 'success');
        return;
      }
      options.setStatus(REVIEW_STATUS_LINES.launching, 'busy');
      state.launchPending = true;
      const launchInput = JSON.stringify({ preparationInput, executionConfig: state.executionConfig ?? {} });
      if (state.launchInput !== launchInput) delete state.clientCommandId;
      state.launchInput = launchInput;
      state.clientCommandId ??= crypto.randomUUID();
      sheetUpdate();
      const result = await api.launchReviewRun({ ...preparationInput, clientCommandId: state.clientCommandId,
        ...(state.executionConfig === undefined ? {} : { executionConfig: state.executionConfig }) });
      state.launchPending = false;
      if (result.run !== null) options.recorded?.(result.run.reviewRunId);
      if (result.run === null) throw new Error(REVIEW_STATUS_LINES.launchFailed);
      query.reviewRunId = result.run.reviewRunId;
      query.filters = { ...NO_FILTERS };
      query.pages = 1;
      ui.ignore = null;
      ui.convert = null;
      ui.batch = null;
      ui.capabilityFindingId = null;
      state.launched = true;
      if (sheet.open) sheet.close();
      generation += 1;
      clearFactual(true);
      stableKey = '';
      if (host.isConnected) show(result);
      options.setStatus(REVIEW_STATUS_LINES.started, 'success');

    } catch (error) {
      state.launchPending = false;
      if (destroyed) return;
      if (state.dismissed) {
        options.setStatus(options.errorMessage(error, REVIEW_STATUS_LINES.launchFailed), 'error');
        return;
      }
      announceReasonOnce(state, options.errorMessage(error, REVIEW_STATUS_LINES.launchFailed), options.setStatus);
      sheetUpdate();
    }
  }

  const escapeFromPage = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.isComposing && sheet.open && !sheet.contains(event.target as Node)) {
      event.preventDefault(); sheet.close();
    }
  };
  document.addEventListener('keydown', escapeFromPage);
  sheet.addEventListener('close', () => {
    const state = sheetState;
    sheetState = null;
    if (state) {
      state.dismissed = true;
    }
    sheet.replaceChildren();
    sheetUpdate = () => undefined;
    if (destroyed || state === null) return;
    // A choice still loading as the sheet closes would leave 「正在读取…」 on the status bar (Issue #705 item 2).
    const closing = procedureSheetCloseStatus(state.requests);
    if (closing !== null) options.setStatus(closing);
    if (state.launched) return;
    const opener = card === undefined ? undefined : Array.from(card.querySelectorAll<HTMLElement>('button'))
      .find((candidate) => focusKeyOf(candidate) === state.openerKey && !(candidate as HTMLButtonElement).disabled);
    (opener ?? card?.querySelector<HTMLElement>('[data-review-action="new-review"]:not(:disabled)'))?.focus();
  });

  return {
    openNew: () => { pendingNew = true; if (projection) show(projection); },
    start: () => refresh(true),
    refresh: () => refresh(true),
    destroy: () => {
      destroyed = true;
      document.removeEventListener('keydown', escapeFromPage);
      generation += 1;
      clearFactual(true);
      clearPoll();
      if (sheet.open) sheet.close();
      exporter.destroy();
    },
  };
}

/**
 * A failure whose reason the surface shows on an alert line where the editor stands — the 新建审阅 sheet's, or an inline form's — is
 * announced there, once (Issue #691; #705 item 1): the reason goes on that line, and the status bar only drops its busy line,
 * never repeating the reason. The caller draws the line.
 */
export function announceReasonOnce(line: { problem: string | null }, reason: string, setStatus: (message: string) => void): void {
  line.problem = reason;
  setStatus('');
}

/**
 * What 先看计划 asks a Review Run to read, or why it asks nothing (Issue #423 review, P2-4): 选章 names its two chapters, 当前选区
 * the paragraphs the sheet holds from a Run — and with none held it is refused here, never sent as a frame the boundary rejects.
 */
export function reviewSheetScope(input: {
  readonly scope: ReviewScopeKind | null;
  readonly from: Pick<ReviewChapterOptionProjection, 'blockId' | 'position'> | null;
  readonly to: Pick<ReviewChapterOptionProjection, 'blockId' | 'position'> | null;
  readonly selection: { readonly fromBlockId: string; readonly toBlockId: string } | null;
  readonly selectionReason: string | null;
}): { readonly problem: string } | { readonly request: ReviewRunScopeRequest } {
  const { scope, from, to, selection } = input;
  if (scope === null) return { problem: REVIEW_PICK_SCOPE };
  if (scope === 'chapters') {
    if (from === null || to === null) return { problem: REVIEW_PICK_CHAPTERS };
    if (to.position < from.position) return { problem: REVIEW_CHAPTERS_REVERSED };
    return { request: { kind: 'chapters', fromChapterBlockId: from.blockId, toChapterBlockId: to.blockId } };
  }
  if (scope === 'selection') {
    if (selection === null) return { problem: input.selectionReason ?? REVIEW_PICK_SCOPE };
    return { request: { kind: 'selection', fromChapterBlockId: selection.fromBlockId, toChapterBlockId: selection.toBlockId } };
  }
  return { request: { kind: scope, fromChapterBlockId: null, toChapterBlockId: null } };
}

export type ReviewRunPrefill = {
  categories: string[];
  scope: ReviewScopeKind;
  from: string | null;
  to: string | null;
  selection: { readonly fromBlockId: string; readonly toBlockId: string } | null;
};

/**
 * The choices a Run was made from, for 返回修改 and 修改计划并重新授权: its categories and scope — 选章 by its two chapters, and
 * 当前选区 by the paragraphs the Run kept (Issue #423 review, P2-4), which the sheet then holds.
 */
export function reviewRunPrefill(
  run: Pick<ReviewRunProjection, 'categories' | 'scope'>,
  chapters: ReadonlyArray<Pick<ReviewChapterOptionProjection, 'blockId' | 'position' | 'endPosition'>>,
): ReviewRunPrefill {
  const range = run.scope.selectedRange;
  return {
    categories: run.categories.map((category) => category.categoryId),
    scope: run.scope.kind,
    from: run.scope.kind === 'chapters' && range !== null ? chapters.find((chapter) => chapter.position === range.startPosition)?.blockId ?? null : null,
    to: run.scope.kind === 'chapters' && range !== null ? chapters.find((chapter) => chapter.endPosition === range.endPosition)?.blockId ?? null : null,
    selection: run.scope.kind === 'selection' ? run.scope.selection : null,
  };
}
