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
  type ReviewWorkspaceCategoryProjection,
  type ReviewWorkspaceProjection,
  type RendererApi,
  type ServiceJobProjection,
} from '../shared/protocol.js';
import { applyOnce } from './manuscript-apply.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { taskPlanSummaryLine } from './task-drawer-labels.js';
import {
  REVIEW_ACTION_LABELS,
  REVIEW_ANCHOR_CHANGED,
  REVIEW_AUTHORIZE_NOTE,
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
  REVIEW_CONVERT_NOTE,
  REVIEW_CONVERT_RATIONALE,
  REVIEW_CONVERT_TO,
  REVIEW_CONVERT_TO_HINT,
  REVIEW_COST_BEFORE_PLAN,
  REVIEW_COVERAGE_COLUMNS,
  REVIEW_COVERAGE_HEADING,
  REVIEW_COVERAGE_NOTE,
  REVIEW_COVERAGE_PILLS,
  REVIEW_EXPORT_REASON,
  REVIEW_FILTER_ALL,
  REVIEW_FILTER_LABELS,
  REVIEW_FILTER_NOTE,
  REVIEW_IGNORE_LABEL,
  REVIEW_IGNORE_NOTE,
  REVIEW_LEDE,
  REVIEW_NOT_DO,
  REVIEW_NO_FILTERED_FINDINGS,
  REVIEW_NO_FINDINGS,
  REVIEW_NO_RUNS,
  REVIEW_PICK_CATEGORY,
  REVIEW_PICK_CHAPTERS,
  REVIEW_PICK_SCOPE,
  REVIEW_PLAN_HEADING,
  REVIEW_PREPARING_ESCAPE,
  REVIEW_PROGRESS_HEADING,
  REVIEW_QUICK_START_REASON,
  REVIEW_REPORT_HEADING,
  REVIEW_REPORT_NONE,
  REVIEW_REPORT_NOTE,
  REVIEW_REPORT_NO_MUST_ITEMS,
  REVIEW_REPORT_OVERVIEW_COLUMNS,
  REVIEW_REPORT_WAIT_RUNNING,
  REVIEW_RESULTS_HEADING,
  REVIEW_RISK_POINT,
  REVIEW_RUNS_HEADING,
  REVIEW_RUN_STATE_PILLS,
  REVIEW_SCOPE_LEGEND,
  REVIEW_SECTION_LABEL,
  REVIEW_SEVERITY_PILLS,
  REVIEW_SHEET_NOTE,
  REVIEW_SHEET_TITLE,
  REVIEW_STATUS_LINES,
  REVIEW_STATUS_PILLS,
  REVIEW_WORKSPACE_UNAVAILABLE,
  reviewAuthorizedLine,
  reviewBatchAppliedLine,
  reviewBatchCappedLine,
  reviewBatchExcludedLine,
  reviewBatchItemLine,
  reviewBatchReadyLine,
  reviewBatchScopeLine,
  reviewCategoryProgressLine,
  reviewChapterOptionLabel,
  reviewClauseLine,
  reviewCountsLine,
  reviewCoverageChanges,
  reviewCoverageLastReview,
  reviewCreatedLine,
  reviewFilteredLine,
  reviewFindingLocation,
  reviewGenerateReportLabel,
  reviewGroupCountLine,
  reviewIgnoreReasonCount,
  reviewIgnoreReasonLine,
  reviewIgnoreReasonProblem,
  reviewLiveLine,
  reviewManuscriptLine,
  reviewPlanCategoriesLine,
  reviewPreparationLine,
  reviewQuote,
  reviewReadConsequence,
  reviewReplacementLine,
  reviewReportAppendixLine,
  reviewReportConfigurationLine,
  reviewReportExcludedLine,
  reviewReportGeneratedLine,
  reviewReportMustItemLine,
  reviewReportVersionLine,
  reviewResultsCountsLine,
  reviewRunHeading,
  reviewRunLine,
  reviewRunMetaLine,
  reviewRunReportLine,
  reviewRunsTruncatedLine,
  reviewSendConsequence,
  reviewShownLine,
  type ReviewAction,
  type ReviewPill,
} from './review-labels.js';

/**
 * ②B 审阅 (Issue #417; editor-surfaces §4, V2-UX-REV-001 to REV-013, MARK-010, FIND-002): the Book-level
 * review destination. One card holds the coverage matrix, the 审阅记录 and 新建审阅, and below them the
 * opened Review Run — its plan before the one approval, then each category's progress, its findings as
 * they become actionable (REV-008), and its versioned Report. 新建审阅 is a native modal sheet.
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
  /** Read the workspace for the first time; called once the destination is on screen. */
  start(): void;
  /** Stop polling, close the sheet, and let nothing still in flight paint again: the screen is being replaced. */
  destroy(): void;
}

type ReviewApi = Pick<
  RendererApi,
  'inspectReviewWorkspace' | 'prepareReviewRun' | 'authorizeReviewRun' | 'continueReviewRun' | 'recordReviewFindingDisposition' |
  'generateReviewReport' | 'cancelServiceJob' | 'applyChangeSuggestion' | 'applyChangeSuggestionBatch' | 'getManuscriptApplyOutcome' |
  'updateEditorialMark' | 'getEditorialMarkCard'
>;

export interface MountReviewWorkspaceOptions {
  /** The destination's panel: the surface appends its heading and its host, and the caller its persistent actions after them. */
  root: HTMLElement;
  bookId: string;
  bookTitle: string;
  focus: ReviewFocus | null;
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
  /** 查看计划 (S72 D4): a Review Run's plan opens in the Task Drawer beside the destination. */
  openPlan(reviewRunId: string): void;
  /** The Run on show was approved: the drawer reads its plan again if it shows it. */
  planChanged(): void;
}

type Filters = Omit<ReviewFindingPageRequest, 'findingsAfterOrdinal'>;
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
}

interface SheetState {
  readonly categories: Set<string>;
  scope: ReviewScopeKind | null;
  from: string | null;
  to: string | null;
  job: ServiceJobProjection | null;
  problem: string | null;
  /** Where focus returns when the sheet closes: the control that opened it. */
  readonly openerKey: string | null;
  /** The plan is on screen: focus goes to it instead of back to the opener. */
  prepared: boolean;
}

const NO_FILTERS: Filters = { categoryId: null, severity: null, status: null, chapterBlockId: null };
const FILTER_KEYS: Readonly<Record<FilterName, keyof Filters>> = {
  category: 'categoryId',
  severity: 'severity',
  status: 'status',
  chapter: 'chapterBlockId',
};
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
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `review-${prefix}-${identities}`;
}

function pillElement(text: string, pill: ReviewPill): HTMLElement {
  const node = el('span', `status-pill review-pill review-pill-${pill.tone}`, text);
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
  const query: { reviewRunId: string | null; filters: Filters; pages: number } = {
    reviewRunId: options.focus?.reviewRunId ?? null,
    filters: { ...NO_FILTERS },
    pages: 1,
  };
  const ui: { ignore: IgnoreForm | null; convert: ConvertForm | null; batch: BatchStrip | null; capabilityFindingId: string | null } = {
    ignore: null,
    convert: null,
    batch: null,
    capabilityFindingId: null,
  };
  let sheetState: SheetState | null = null;
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
  const sheet = el('dialog', 'review-sheet');
  const sheetTitleId = uid('sheet-title');
  sheet.setAttribute('aria-labelledby', sheetTitleId);
  host.append(live, sheet);
  options.root.append(
    el('p', 'section-label', REVIEW_SECTION_LABEL),
    el('h2', undefined, options.bookTitle),
    el('p', 'lede', REVIEW_LEDE),
    host,
  );

  // ---- reading --------------------------------------------------------------------------------------

  const filtersInput = (): Filters => ({ ...query.filters });

  /** The workspace with as many pages of findings as the editor has asked to see, read one after another. */
  const load = async (): Promise<ReviewWorkspaceProjection> => {
    const first = await api.inspectReviewWorkspace({ reviewRunId: query.reviewRunId, ...filtersInput() });
    const run = first.run;
    if (run === null || query.pages <= 1 || !run.findingsTruncated) return first;
    const findings = [...run.findings];
    let truncated: boolean = run.findingsTruncated;
    for (let page = 2; page <= query.pages && truncated && findings.length > 0; page += 1) {
      const next = await api.inspectReviewWorkspace({ reviewRunId: run.reviewRunId, findingsAfterOrdinal: findings.at(-1)!.ordinal, ...filtersInput() });
      if (next.run?.reviewRunId !== run.reviewRunId) break;
      findings.push(...next.run.findings);
      truncated = next.run.findingsTruncated;
    }
    return { ...first, run: { ...run, findings, findingsTruncated: truncated } };
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
    void load().then(
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
        if (projection.run?.state === 'running') schedulePoll();
      },
    );
  }

  function show(next: ReviewWorkspaceProjection): void {
    const previous = projection;
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
    if (next.run?.state === 'running') schedulePoll();
    followFocus(next);
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
    heading.append(el('h3', undefined, REVIEW_CARD_HEADING));
    if (run !== null) heading.append(pillElement(run.stateLabel, REVIEW_RUN_STATE_PILLS[run.state]));
    node.append(heading, el('p', 'field-note review-manuscript-line', reviewManuscriptLine(next.manuscript)));
    const newReviewReasonId = uid('new-review-reason');
    node.append(renderCoverage(next, newReviewReasonId), renderRuns(next), renderNewReview(next, newReviewReasonId));
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
    const why = el('small', 'field-note', reason);
    why.id = uid(`${action}-reason`);
    control.setAttribute('aria-describedby', why.id);
    wrap.append(control, why);
    return wrap;
  };

  function renderCoverage(next: ReviewWorkspaceProjection, newReviewReasonId: string): HTMLElement {
    const section = el('section', 'review-coverage-section');
    const headingId = uid('coverage');
    const heading = el('h4', undefined, REVIEW_COVERAGE_HEADING);
    heading.id = headingId;
    const table = el('table', 'review-coverage');
    table.setAttribute('aria-labelledby', headingId);
    const head = el('thead');
    const headRow = el('tr');
    for (const column of REVIEW_COVERAGE_COLUMNS) {
      const cell = el('th', undefined, column);
      cell.scope = 'col';
      headRow.append(cell);
    }
    head.append(headRow);
    const body = el('tbody');
    for (const row of next.coverage) {
      const category = next.categories.find((candidate) => candidate.categoryId === row.categoryId);
      const tr = el('tr');
      tr.dataset['reviewCategory'] = row.categoryId;
      tr.dataset['coverage'] = row.state;
      const name = el('th', undefined, row.label);
      name.scope = 'row';
      const state = el('td');
      state.dataset['label'] = REVIEW_COVERAGE_COLUMNS[1];
      state.append(pillElement(row.stateLabel, REVIEW_COVERAGE_PILLS[row.state]));
      const last = el('td', undefined, reviewCoverageLastReview(row));
      last.dataset['label'] = REVIEW_COVERAGE_COLUMNS[2];
      const changes = el('td', undefined, reviewCoverageChanges(row));
      changes.dataset['label'] = REVIEW_COVERAGE_COLUMNS[3];
      const act = el('td');
      act.dataset['label'] = REVIEW_COVERAGE_COLUMNS[4];
      if (row.state === 'needs-review') {
        const changed = category?.scopes.changed;
        if (changed !== undefined && !changed.available) {
          act.append(el('span', 'field-note', changed.unavailableReason ?? ''));
        } else {
          const rereview = actionButton('rereview-changed', 'secondary', () => openSheet({ categories: [row.categoryId], scope: 'changed', from: null, to: null }, rereview));
          rereview.dataset['reviewCategory'] = row.categoryId;
          if (!next.newReview.available || working) {
            rereview.disabled = true;
            rereview.setAttribute('aria-describedby', newReviewReasonId);
          }
          act.append(rereview);
        }
      } else if (row.state === 'unavailable' && row.unavailableReason !== null) {
        act.append(el('span', 'field-note', row.unavailableReason));
      }
      tr.append(name, state, last, changes, act);
      body.append(tr);
    }
    table.append(head, body);
    section.append(heading, el('p', 'field-note', REVIEW_COVERAGE_NOTE), table);
    return section;
  }

  function renderRuns(next: ReviewWorkspaceProjection): HTMLElement {
    const section = el('section', 'review-runs-section');
    section.append(el('h4', undefined, REVIEW_RUNS_HEADING));
    if (next.runs.length === 0) {
      section.append(el('p', 'field-note', REVIEW_NO_RUNS));
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
      const created = el('span', 'field-note review-run-created', reviewCreatedLine(localInstantLabel(summary.createdAt)));
      created.append(el('span', 'technical-identity', summary.createdAt));
      item.append(
        el('span', 'review-run-line', reviewRunLine(summary)),
        el('span', 'field-note review-run-counts', `${reviewCountsLine(summary.findingCounts)} · ${reviewRunReportLine(summary.reportVersion)}`),
        created,
      );
      const open = actionButton('open-run', 'quiet', () => openRun(summary.reviewRunId));
      if (opened) open.disabled = true;
      item.append(open);
      list.append(item);
    }
    section.append(list);
    if (next.runsTruncated) section.append(el('p', 'field-note', reviewRunsTruncatedLine(next.runs.length)));
    return section;
  }

  function renderNewReview(next: ReviewWorkspaceProjection, reasonId: string): HTMLElement {
    const row = el('div', 'button-row review-new-actions');
    const start = actionButton('new-review', 'primary', () => openSheet(null, start));
    row.append(start);
    if (!next.newReview.available) {
      start.disabled = true;
      const why = el('p', 'field-note review-unavailable-reason', next.newReview.unavailableReason ?? '');
      why.id = reasonId;
      start.setAttribute('aria-describedby', reasonId);
      row.append(why);
    } else if (working) {
      start.disabled = true;
    }
    return row;
  }

  function openRun(reviewRunId: string): void {
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
    const meta = el('p', 'field-note review-run-meta', `${reviewRunMetaLine(run.scope.label, run.manuscript.revisionLabel)} · ${reviewCreatedLine(localInstantLabel(run.createdAt))}`);
    meta.append(el('span', 'technical-identity', run.createdAt));
    if (run.authorization !== null) {
      const authorized = el('span', 'review-run-authorized', reviewAuthorizedLine(localInstantLabel(run.authorization.authorizedAt)));
      authorized.append(el('span', 'technical-identity', run.authorization.authorizedAt));
      meta.append(authorized);
    }
    section.append(heading, meta);
    if (run.state === 'prepared') {
      section.append(renderPlan(run));
    } else {
      section.append(renderProgress(run));
      if (run.canContinue) {
        const resume = el('div', 'review-continue');
        resume.append(el('p', 'attention-note', REVIEW_CONTINUE_NOTE), actionButton('continue', 'primary', () => void continueRun(run)));
        section.append(resume);
      }
      section.append(renderResults(next, run), renderReport(run));
    }
    section.append(options.technicalDetails(
      'review-facts',
      el('dt', undefined, '审阅记录'), el('dd', 'technical-identity', `${run.reviewRunId} · ${run.label}`),
      el('dt', undefined, '稿件 pin'), el('dd', 'technical-identity', `${run.manuscript.revisionLabel} · ${run.manuscript.revisionId} · 修订日志序号 ${run.manuscript.journalSequence} · ${run.manuscript.workingDigest}`),
      el('dt', undefined, '审阅配置摘要'), el('dd', 'technical-identity', run.configurationDigest),
      el('dt', undefined, '各类别的任务与计划'),
      el('dd', 'technical-identity', run.categories.map((category) => `${category.label} · ${category.taskIntentId ?? '无任务'} · ${category.planEnvelopeDigest ?? '无计划'}`).join('；')),
    ));
    return section;
  }

  /**
   * A prepared Run's plan (S72 D4): one line naming it and 查看计划, which opens every category's plan in
   * the Task Drawer. The one approval stays here until S74 brings the authorization bar into the drawer.
   */
  function renderPlan(run: ReviewRunProjection): HTMLElement {
    const section = el('section', 'review-plans task-plan-summary');
    section.dataset['reviewCategories'] = run.categories.map((category) => category.categoryId).join(',');
    const open = actionButton('view-plan', 'secondary', () => options.openPlan(run.reviewRunId));
    open.dataset['taskPlanOpen'] = 'review-run';
    open.setAttribute('aria-controls', 'task-drawer');
    section.append(
      el('h5', undefined, REVIEW_PLAN_HEADING),
      el('p', 'task-plan-summary-line', taskPlanSummaryLine([reviewPlanCategoriesLine(run.categories.length), run.scope.label, `任务输入修订版 ${run.manuscript.revisionLabel}`])),
      open,
    );
    // A category that cannot go ahead says so here too: it is what the one approval would be refused for.
    for (const category of run.categories) {
      if (category.detail !== null) section.append(el('p', 'attention-note', `${category.label}：${category.detail}`));
    }
    section.append(el('p', 'review-authorize-note', REVIEW_AUTHORIZE_NOTE));
    const actions = el('div', 'button-row review-plan-actions');
    const authorize = actionButton('authorize', 'primary', () => void authorizeRun(run));
    const revise = actionButton('revise', 'secondary', () => openSheet(prefillOf(run), revise));
    if (working) {
      authorize.disabled = true;
      revise.disabled = true;
    }
    actions.append(authorize, revise);
    section.append(actions);
    return section;
  }

  /** The choices a prepared Run was made from, for 返回修改. */
  function prefillOf(run: ReviewRunProjection): { categories: string[]; scope: ReviewScopeKind; from: string | null; to: string | null } {
    const chapters = projection?.scopeOptions.chapters.chapters ?? [];
    const range = run.scope.selectedRange;
    return {
      categories: run.categories.map((category) => category.categoryId),
      scope: run.scope.kind,
      from: run.scope.kind === 'chapters' && range !== null ? chapters.find((chapter) => chapter.position === range.startPosition)?.blockId ?? null : null,
      to: run.scope.kind === 'chapters' && range !== null ? chapters.find((chapter) => chapter.endPosition === range.endPosition)?.blockId ?? null : null,
    };
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
    const section = el('section', 'review-results');
    const headingId = uid('results');
    const heading = el('h5', undefined, REVIEW_RESULTS_HEADING);
    heading.id = headingId;
    section.setAttribute('aria-labelledby', headingId);
    section.append(heading, el('p', 'review-results-counts', reviewResultsCountsLine(run.findingCounts)));
    const filters = el('div', 'review-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', '筛选发现');
    const filterSelect = (name: FilterName, choices: ReadonlyArray<readonly [string, string]>): HTMLElement => {
      const label = el('label', 'review-filter');
      label.append(el('span', undefined, REVIEW_FILTER_LABELS[name]));
      const select = el('select');
      select.dataset['reviewFilter'] = name;
      select.append(new Option(REVIEW_FILTER_ALL, ''));
      for (const [value, text] of choices) select.append(new Option(text, value));
      select.value = query.filters[FILTER_KEYS[name]] ?? '';
      select.disabled = working;
      select.addEventListener('change', () => {
        // The options are the projection's own values, so the filter names only what a finding can be.
        query.filters = { ...query.filters, [FILTER_KEYS[name]]: select.value === '' ? null : select.value } as Filters;
        query.pages = 1;
        refresh(true);
      });
      label.append(select);
      return label;
    };
    filters.append(
      filterSelect('category', run.categories.map((category) => [category.categoryId, category.label] as const)),
      filterSelect('severity', REVIEW_FINDING_SEVERITIES.map((severity) => [severity, REVIEW_FINDING_SEVERITY_LABELS[severity]] as const)),
      filterSelect('status', REVIEW_FINDING_STATUSES.map((status) => [status, REVIEW_FINDING_STATUS_LABELS[status]] as const)),
      filterSelect('chapter', next.scopeOptions.chapters.chapters.map((chapter) => [chapter.blockId, chapter.title] as const)),
    );
    section.append(filters, el('p', 'field-note', REVIEW_FILTER_NOTE));
    const filtered = Object.values(query.filters).some((value) => value !== null);
    if (filtered) section.append(el('p', 'field-note review-filtered', reviewFilteredLine(run.findingsTotal)));
    if (run.findings.length === 0) {
      section.append(el('p', 'field-note review-no-findings', filtered ? REVIEW_NO_FILTERED_FINDINGS : REVIEW_NO_FINDINGS));
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
      more.append(button, el('span', 'field-note', reviewShownLine(run.findings.length, run.findingsTotal)));
      section.append(more);
    }
    return section;
  }

  function renderGroup(run: ReviewRunProjection, category: ReviewRunCategoryProjection, findings: ReadonlyArray<ReviewFindingProjection>): HTMLElement {
    const group = el('section', 'review-group');
    group.dataset['reviewCategory'] = category.categoryId;
    const heading = el('div', 'review-group-heading');
    heading.append(el('h6', undefined, category.label), el('span', 'field-note', reviewGroupCountLine(category.findingsCount)));
    // V2-UX-REV-006: the batch belongs to a category configured for it (错别字与规范用语); 文学性与表达改进's
    // suggestions are accepted one by one.
    if (category.batchApply && category.output === 'change-suggestion' && category.state === 'settled') {
      const batch = actionButton('batch-prepare', 'secondary', () => void prepareBatch(run, category));
      batch.setAttribute('aria-expanded', ui.batch?.categoryId === category.categoryId ? 'true' : 'false');
      batch.disabled = working;
      heading.append(batch);
    }
    group.append(heading);
    if (ui.batch?.categoryId === category.categoryId) group.append(renderBatchStrip(run, ui.batch));
    for (const finding of findings) group.append(renderFinding(run, category, finding));
    return group;
  }

  function renderFinding(run: ReviewRunProjection, category: ReviewRunCategoryProjection, finding: ReviewFindingProjection): HTMLElement {
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
    article.append(heading, el('blockquote', 'review-finding-quote', reviewQuote(finding.quote)));
    if (finding.replacement !== null) article.append(el('p', 'review-finding-replacement', reviewReplacementLine(finding.replacement)));
    article.append(el('p', 'review-finding-note', finding.note));
    if (finding.clauseRefs.length === 0) article.append(el('p', 'review-finding-basis', category.basisStatement));
    for (const clause of finding.clauseRefs) article.append(el('p', 'review-finding-basis', reviewClauseLine(clause)));
    const lines = [finding.stateLine, finding.anchorState === 'anchor-changed' ? REVIEW_ANCHOR_CHANGED : null]
      .filter((line, index, all): line is string => line !== null && all.indexOf(line) === index);
    for (const line of lines) article.append(el('p', 'review-finding-state', line));
    if (finding.status !== 'pending') article.append(el('p', 'review-finding-status-detail', finding.statusDetail));
    if (finding.ignoreReason !== null) article.append(el('p', 'review-finding-ignore-reason', reviewIgnoreReasonLine(finding.ignoreReason)));
    article.append(renderFindingActions(run, finding));
    if (ui.capabilityFindingId === finding.findingId) article.append(capabilityNote());
    if (ui.ignore?.findingId === finding.findingId) article.append(renderIgnoreForm(run, finding, ui.ignore));
    if (ui.convert?.findingId === finding.findingId) article.append(renderConvertForm(run, finding, ui.convert));
    article.append(options.technicalDetails(
      'review-facts',
      el('dt', undefined, '发现'), el('dd', 'technical-identity', `${finding.findingId} · 第 ${finding.ordinal} 条`),
      el('dt', undefined, '标记'), el('dd', 'technical-identity', finding.markId === null ? '无（原文已变）' : `${finding.markId} · ${finding.markStatus ?? '—'} · ${finding.anchorState}`),
      el('dt', undefined, '内容块'), el('dd', 'technical-identity', `${finding.blockId} · 字素 ${finding.fromGrapheme}–${finding.toGrapheme}`),
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
    reason.required = true;
    reason.dataset['reviewField'] = 'ignore-reason';
    const count = el('small', 'field-note review-reason-count', reviewIgnoreReasonCount(form.reason));
    count.id = uid('ignore-count');
    const problem = el('p', 'review-problem');
    problem.setAttribute('role', 'alert');
    problem.id = uid('ignore-problem');
    problem.hidden = form.problem === null;
    problem.textContent = form.problem ?? '';
    reason.setAttribute('aria-describedby', `${count.id} ${problem.id}`);
    reason.setAttribute('aria-invalid', form.problem === null ? 'false' : 'true');
    reason.addEventListener('input', () => {
      form.reason = reason.value;
      count.textContent = reviewIgnoreReasonCount(reason.value);
    });
    field.append(reason, count);
    const confirm = actionButton('ignore-confirm', 'primary', () => void confirmIgnore(run, finding, form, reason, problem));
    const cancel = actionButton('ignore-cancel', 'quiet', () => closeInline('ignore', finding.findingId));
    if (working) {
      confirm.disabled = true;
      cancel.disabled = true;
    }
    const row = el('div', 'button-row');
    row.append(confirm, cancel);
    wrap.append(field, el('p', 'field-note', REVIEW_IGNORE_NOTE), problem, row);
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
      if (hint !== null) node.append(el('small', 'field-note', hint));
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
    row.append(confirm, cancel);
    wrap.append(
      field(REVIEW_CONVERT_TO, form.proposedText, 'convert-to', REVIEW_CONVERT_TO_HINT, (text) => { form.proposedText = text; }),
      field(REVIEW_CONVERT_RATIONALE, form.rationale, 'convert-rationale', null, (text) => { form.rationale = text; }),
      el('p', 'field-note', REVIEW_CONVERT_NOTE),
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

  function renderBatchStrip(run: ReviewRunProjection, strip: BatchStrip): HTMLElement {
    const node = el('section', 'review-batch-strip');
    node.dataset['reviewCategory'] = strip.categoryId;
    node.dataset['reviewBatchCount'] = String(strip.items.length);
    node.dataset['reviewBatchState'] = strip.refused ? 'refused' : strip.items.length === 0 ? 'empty' : 'ready';
    node.setAttribute('role', 'group');
    const scopeId = uid('batch-scope');
    node.setAttribute('aria-labelledby', scopeId);
    const row = el('div', 'button-row');
    const cancel = actionButton('batch-cancel', 'quiet', () => closeBatch(strip.categoryId));
    if (strip.items.length === 0) {
      const nothing = el('p', 'review-batch-scope', REVIEW_BATCH_NOTHING);
      nothing.id = scopeId;
      node.append(nothing);
    } else {
      const scope = el('p', 'review-batch-scope', reviewBatchScopeLine(strip.items.length));
      scope.id = scopeId;
      const items = el('ol', 'review-batch-items');
      for (const item of strip.items) {
        const line = el('li', undefined, reviewBatchItemLine(item.quote, item.replacement));
        line.dataset['findingId'] = item.findingId;
        line.dataset['markId'] = item.markId;
        items.append(line);
      }
      node.append(scope, items);
      if (strip.excluded > 0) node.append(el('p', 'field-note', reviewBatchExcludedLine(strip.excluded)));
      if (strip.capped) node.append(el('p', 'field-note', reviewBatchCappedLine(MAX_BATCH_APPLY_SUGGESTIONS)));
      node.append(el('p', 'field-note', REVIEW_BATCH_ALL_OR_NONE));
      if (strip.refused || strip.capability) {
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
    section.dataset['reportVersion'] = run.report === null ? '' : String(run.report.version);
    section.append(el('h5', undefined, REVIEW_REPORT_HEADING), el('p', 'field-note', REVIEW_REPORT_NOTE));
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
    actions.append(
      run.state === 'running'
        ? unavailableAction('generate-report', REVIEW_REPORT_WAIT_RUNNING, label)
        : actionButton('generate-report', 'secondary', () => void generateReport(run), label),
      unavailableAction('export', REVIEW_EXPORT_REASON),
    );
    if (working) for (const button of actions.querySelectorAll('button')) button.disabled = true;
    section.append(actions);
    if (run.report === null) section.append(el('p', 'field-note', REVIEW_REPORT_NONE));
    else section.append(renderReportRecord(run.report));
    return section;
  }

  function renderReportRecord(report: ReviewReportProjection): HTMLElement {
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
      const line = el('li', undefined, reviewReportMustItemLine(item));
      line.dataset['findingId'] = item.findingId;
      must.append(line);
    }
    const summaries = el('div', 'review-report-summaries');
    for (const entry of record.categorySummaries.entries) {
      const block = el('div', 'review-report-summary');
      block.dataset['reviewCategory'] = entry.categoryId;
      block.append(
        el('p', 'review-report-summary-title', `${entry.label} · ${entry.stateLine}`),
        el('p', undefined, reviewCountsLine(entry.counts)),
        el('p', 'field-note', entry.basisStatement),
        el('p', 'field-note', reviewReportExcludedLine(entry.excludedCount)),
      );
      summaries.append(block);
    }
    const appendix = el('ul', 'review-report-list');
    appendix.append(el('li', undefined, reviewReportConfigurationLine(record.appendix.configuration.version)));
    for (const category of record.appendix.categories) appendix.append(el('li', undefined, reviewReportAppendixLine(category)));
    body.append(
      part('overview', record.overview.title, table),
      part('must-items', record.mustItems.title, must),
      part('category-summaries', record.categorySummaries.title, summaries),
      part('appendix', record.appendix.title, appendix, options.technicalDetails(
        'review-facts',
        el('dt', undefined, '报告'), el('dd', 'technical-identity', `${report.reportId} · 第 ${report.version} 版 · ${report.digest}`),
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
    for (const control of card?.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button[data-review-action], select[data-review-filter]') ?? []) control.disabled = true;
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
      );
      if (applied.acknowledged) {
        options.setStatus(REVIEW_STATUS_LINES.applied, 'success');
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
      form.problem = options.errorMessage(error, REVIEW_STATUS_LINES.convertFailed);
      pendingFocus = { findingId: finding.findingId, field: 'convert-to' };
      options.setStatus(form.problem, 'error');
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

  async function confirmIgnore(run: ReviewRunProjection, finding: ReviewFindingProjection, form: IgnoreForm, field: HTMLTextAreaElement, problemLine: HTMLElement): Promise<void> {
    form.reason = field.value;
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
      await api.recordReviewFindingDisposition({ reviewRunId: run.reviewRunId, findingId: finding.findingId, disposition: 'ignored', reason: form.reason.trim() });
      ui.ignore = null;
      options.setStatus(REVIEW_STATUS_LINES.ignored, 'success');
    }, (error) => {
      form.problem = options.errorMessage(error, REVIEW_STATUS_LINES.ignoreFailed);
      pendingFocus = { findingId: finding.findingId, field: 'ignore-reason' };
      options.setStatus(form.problem, 'error');
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
      const standing = suggestions.filter((finding) => finding.markId !== null && finding.markStatus === 'open' && finding.anchorState === 'exact' && finding.replacement !== null);
      const listed = standing.slice(0, MAX_BATCH_APPLY_SUGGESTIONS);
      ui.batch = {
        categoryId: category.categoryId,
        items: listed.map((finding) => ({ findingId: finding.findingId, markId: finding.markId!, blockId: finding.blockId, quote: finding.quote, replacement: finding.replacement! })),
        excluded: suggestions.length - standing.length,
        capped: standing.length > listed.length,
        problem: null,
        refused: false,
        capability: false,
      };
      options.setStatus(listed.length === 0 ? REVIEW_BATCH_NOTHING : reviewBatchReadyLine(listed.length));
      pendingFocus = { findingId: null, field: 'batch' };
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
      );
      if (applied.acknowledged || applied.outcome?.state === 'committed') {
        ui.batch = null;
        options.setStatus(reviewBatchAppliedLine(strip.items.length, !applied.acknowledged), 'success');
        return;
      }
      // Refused — a suggestion drifted, or was decided meanwhile — or its outcome is unknown: the same
      // 确认应用 is never offered again; 重新准备应用 reads what stands now (V2-UX-EAPP-008).
      strip.refused = true;
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

  async function authorizeRun(run: ReviewRunProjection): Promise<void> {
    const planDigests = run.categories
      .filter((category) => category.planEnvelopeDigest !== null)
      .map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! }));
    await act(REVIEW_STATUS_LINES.authorizing, REVIEW_STATUS_LINES.authorizeFailed, async () => {
      await api.authorizeReviewRun({ reviewRunId: run.reviewRunId, planDigests });
      options.setStatus(REVIEW_STATUS_LINES.authorized, 'success');
      focusRunHeading = true;
      options.planChanged();
    });
  }

  async function continueRun(run: ReviewRunProjection): Promise<void> {
    await act(REVIEW_STATUS_LINES.continuing, REVIEW_STATUS_LINES.continueFailed, async () => {
      await api.continueReviewRun({ reviewRunId: run.reviewRunId });
      options.setStatus(REVIEW_STATUS_LINES.continued, 'success');
    });
  }

  async function generateReport(run: ReviewRunProjection): Promise<void> {
    await act(REVIEW_STATUS_LINES.reporting, REVIEW_STATUS_LINES.reportFailed, async () => {
      const answer = await api.generateReviewReport({ reviewRunId: run.reviewRunId });
      options.setStatus(reviewReportGeneratedLine(answer.run?.report?.version ?? run.reportVersions.length + 1), 'success');
    });
  }

  // ---- 新建审阅 ------------------------------------------------------------------------------------

  function openSheet(prefill: { categories: string[]; scope: ReviewScopeKind | null; from: string | null; to: string | null } | null, opener: HTMLElement): void {
    if (destroyed || projection === null || sheet.open || working) return;
    sheetState = {
      categories: new Set(prefill?.categories ?? []),
      scope: prefill?.scope ?? null,
      from: prefill?.from ?? null,
      to: prefill?.to ?? null,
      job: null,
      problem: null,
      openerKey: focusKeyOf(opener),
      prepared: false,
    };
    renderSheet(projection, sheetState);
    sheet.showModal();
    sheet.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus();
  }

  function renderSheet(workspace: ReviewWorkspaceProjection, state: SheetState): void {
    const form = el('form', 'review-sheet-form');
    form.noValidate = true;
    const title = el('h3', undefined, REVIEW_SHEET_TITLE);
    title.id = sheetTitleId;
    form.append(title, el('p', 'field-note', REVIEW_SHEET_NOTE));

    const categories = el('fieldset', 'review-category-options');
    categories.append(el('legend', undefined, REVIEW_CATEGORY_LEGEND));
    const categoryInputs = new Map<string, { input: HTMLInputElement; label: HTMLLabelElement; reason: HTMLElement; entry: ReviewWorkspaceCategoryProjection }>();
    for (const entry of workspace.categories) {
      const label = el('label', 'review-category-option');
      label.dataset['reviewCategoryOption'] = entry.categoryId;
      const input = el('input');
      input.type = 'checkbox';
      input.name = 'review-category';
      input.value = entry.categoryId;
      input.checked = state.categories.has(entry.categoryId);
      const text = el('span', 'review-category-text');
      const description = el('span', 'review-category-description', entry.description);
      description.id = uid('category-description');
      const basis = el('span', 'review-category-basis', entry.basisStatement);
      basis.id = uid('category-basis');
      const reason = el('span', 'review-category-reason');
      reason.id = uid('category-reason');
      input.setAttribute('aria-describedby', `${description.id} ${basis.id} ${reason.id}`);
      text.append(el('strong', undefined, entry.label), description, basis, reason);
      label.append(input, text);
      input.addEventListener('change', () => {
        if (input.checked) state.categories.add(entry.categoryId);
        else state.categories.delete(entry.categoryId);
        state.problem = null;
        updateSheet();
      });
      categories.append(label);
      categoryInputs.set(entry.categoryId, { input, label, reason, entry });
    }

    const scopes = el('fieldset', 'review-scope-options');
    scopes.append(el('legend', undefined, REVIEW_SCOPE_LEGEND));
    const scopeInputs = new Map<ReviewScopeKind, HTMLInputElement>();
    for (const kind of REVIEW_SCOPE_KINDS) {
      const availability = workspace.scopeOptions[kind];
      const label = el('label', 'review-scope-option');
      label.dataset['reviewScopeOption'] = kind;
      const input = el('input');
      input.type = 'radio';
      input.name = 'review-scope';
      input.value = kind;
      input.checked = state.scope === kind;
      input.disabled = !availability.available;
      label.append(input, el('span', undefined, REVIEW_SCOPE_LABELS[kind]));
      if (!availability.available) {
        label.dataset['unavailableReason'] = availability.unavailableReason ?? '';
        input.dataset['unavailableReason'] = availability.unavailableReason ?? '';
        const why = el('small', 'field-note', availability.unavailableReason ?? '');
        why.id = uid('scope-reason');
        input.setAttribute('aria-describedby', why.id);
        label.append(why);
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
    const chapterOptions = workspace.scopeOptions.chapters.chapters;
    const range = el('div', 'review-chapter-range');
    const chapterSelect = (which: 'from' | 'to'): HTMLSelectElement => {
      const label = el('label', 'review-field');
      label.append(el('span', undefined, which === 'from' ? REVIEW_CHAPTER_FROM : REVIEW_CHAPTER_TO));
      const select = el('select');
      select.dataset['reviewChapter'] = which;
      select.append(new Option(REVIEW_CHAPTER_PLACEHOLDER, ''));
      for (const chapter of chapterOptions) select.append(new Option(reviewChapterOptionLabel(chapter), chapter.blockId));
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
    scopes.append(range);

    const consequences = el('dl', 'review-consequences');
    const consequenceValues = REVIEW_CONSEQUENCE_TERMS.map((term) => {
      const value = el('dd');
      consequences.append(el('dt', undefined, term), value);
      return value;
    });
    const [readValue, sendValue, notDoValue, costValue] = consequenceValues as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    readValue.dataset['consequence'] = 'read';
    sendValue.dataset['consequence'] = 'send';
    notDoValue.dataset['consequence'] = 'not-do';
    notDoValue.textContent = REVIEW_NOT_DO;
    costValue.dataset['consequence'] = 'cost';
    costValue.textContent = REVIEW_COST_BEFORE_PLAN;

    const problem = el('p', 'review-problem review-sheet-problem');
    problem.setAttribute('role', 'alert');
    const progress = el('p', 'review-preparation-progress');
    progress.setAttribute('aria-live', 'polite');
    const quickReason = el('p', 'field-note review-quick-start-reason', REVIEW_QUICK_START_REASON);
    quickReason.id = uid('quick-start-reason');
    const prepare = actionButton('prepare', 'primary', () => void prepareRun(state));
    const quick = actionButton('quick-start', 'secondary', () => undefined);
    quick.disabled = true;
    quick.setAttribute('aria-describedby', quickReason.id);
    const cancelPreparation = actionButton('cancel-preparation', 'quiet', () => void cancelJob(state, cancelPreparation));
    const close = actionButton('close-sheet', 'quiet', () => sheet.close());
    const actions = el('div', 'button-row review-sheet-actions');
    actions.append(prepare, quick, cancelPreparation, close);
    form.append(categories, scopes, consequences, problem, progress, actions, quickReason);
    form.addEventListener('submit', (event) => event.preventDefault());

    // Everything that follows from the choices, redrawn in place so a choice never moves the focus.
    function updateSheet(): void {
      const preparing = state.job !== null;
      for (const { input, label, reason, entry } of categoryInputs.values()) {
        const scopeAvailability = state.scope === null ? null : entry.scopes[state.scope];
        const why = !entry.available ? entry.unavailableReason : scopeAvailability !== null && !scopeAvailability.available ? scopeAvailability.unavailableReason : null;
        if (why !== null && input.checked) {
          input.checked = false;
          state.categories.delete(entry.categoryId);
        }
        input.disabled = why !== null || preparing;
        reason.textContent = why ?? '';
        reason.hidden = why === null;
        if (why === null) {
          delete label.dataset['unavailableReason'];
          delete input.dataset['unavailableReason'];
        } else {
          label.dataset['unavailableReason'] = why;
          input.dataset['unavailableReason'] = why;
        }
      }
      for (const [kind, input] of scopeInputs) input.disabled = !workspace.scopeOptions[kind].available || preparing;
      range.hidden = state.scope !== 'chapters';
      fromSelect.disabled = state.scope !== 'chapters' || preparing;
      toSelect.disabled = state.scope !== 'chapters' || preparing;
      const from = chapterOptions.find((chapter) => chapter.blockId === state.from) ?? null;
      const to = chapterOptions.find((chapter) => chapter.blockId === state.to) ?? null;
      readValue.textContent = reviewReadConsequence(state.scope, workspace.manuscript, { from, to });
      sendValue.textContent = reviewSendConsequence(workspace.categories.filter((entry) => state.categories.has(entry.categoryId)));
      problem.textContent = state.problem ?? '';
      problem.hidden = state.problem === null;
      progress.hidden = state.job === null;
      progress.textContent = state.job === null ? '' : reviewPreparationLine(state.job.progress);
      prepare.disabled = preparing;
      close.disabled = preparing;
      cancelPreparation.hidden = !preparing;
      cancelPreparation.disabled = !preparing;
      if (state.job !== null) cancelPreparation.dataset['serviceJobId'] = state.job.jobId;
      else delete cancelPreparation.dataset['serviceJobId'];
    }
    sheetUpdate = updateSheet;
    sheet.replaceChildren(form);
    updateSheet();
  }

  function chaptersOf(state: SheetState): { from: ReviewChapterOptionProjection | null; to: ReviewChapterOptionProjection | null } {
    const chapters = projection?.scopeOptions.chapters.chapters ?? [];
    return {
      from: chapters.find((chapter) => chapter.blockId === state.from) ?? null,
      to: chapters.find((chapter) => chapter.blockId === state.to) ?? null,
    };
  }

  async function prepareRun(state: SheetState): Promise<void> {
    if (destroyed || state.job !== null || projection === null) return;
    const categoryIds = projection.categories.filter((entry) => state.categories.has(entry.categoryId)).map((entry) => entry.categoryId);
    const { from, to } = chaptersOf(state);
    state.problem = categoryIds.length === 0 ? REVIEW_PICK_CATEGORY
      : state.scope === null ? REVIEW_PICK_SCOPE
        : state.scope === 'chapters' && (from === null || to === null) ? REVIEW_PICK_CHAPTERS
          : state.scope === 'chapters' && from !== null && to !== null && to.position < from.position ? REVIEW_CHAPTERS_REVERSED
            : null;
    if (state.problem !== null || state.scope === null) {
      // The problem line is an alert, so it is heard where the editor stands; focus stays on 先看计划.
      sheetUpdate();
      return;
    }
    const scope: ReviewRunScopeRequest = {
      kind: state.scope,
      fromChapterBlockId: state.scope === 'chapters' ? from!.blockId : null,
      toChapterBlockId: state.scope === 'chapters' ? to!.blockId : null,
    };
    options.setStatus(REVIEW_STATUS_LINES.preparing, 'busy');
    try {
      const initial = await api.prepareReviewRun({ categoryIds, scope });
      state.job = initial;
      sheetUpdate();
      const completed = await options.awaitServiceJob(initial, (job) => {
        if (destroyed || sheetState !== state) return;
        state.job = job;
        sheetUpdate();
      });
      if (destroyed) return;
      state.job = null;
      if (completed.state === 'cancelled') {
        sheetUpdate();
        options.setStatus(REVIEW_STATUS_LINES.preparationCancelled, 'success');
        return;
      }
      const result = completed.result;
      if (completed.kind !== 'review-run-preparation' || result === null || !('scopeOptions' in result) || result.bookId !== bookId || result.run === null) {
        throw new Error(REVIEW_STATUS_LINES.preparationFailed);
      }
      query.reviewRunId = result.run.reviewRunId;
      query.filters = { ...NO_FILTERS };
      query.pages = 1;
      ui.ignore = null;
      ui.convert = null;
      ui.batch = null;
      ui.capabilityFindingId = null;
      state.prepared = true;
      if (sheet.open) sheet.close();
      generation += 1;
      stableKey = '';
      if (host.isConnected) show(result);
      options.setStatus(REVIEW_STATUS_LINES.prepared, 'success');
      // S72 D4: 先看计划 opens the plan the preparation froze in the Task Drawer, which takes focus; closing
      // it brings focus back to this Run's 查看计划.
      options.openPlan(result.run.reviewRunId);
    } catch (error) {
      if (destroyed) return;
      state.job = null;
      state.problem = options.errorMessage(error, REVIEW_STATUS_LINES.preparationFailed);
      sheetUpdate();
      options.setStatus(state.problem, 'error');
    }
  }

  async function cancelJob(state: SheetState, control: HTMLButtonElement): Promise<void> {
    const jobId = state.job?.jobId;
    if (jobId === undefined) return;
    control.disabled = true;
    try {
      await api.cancelServiceJob({ jobId });
    } catch (error) {
      control.disabled = false;
      options.setStatus(options.errorMessage(error, REVIEW_STATUS_LINES.preparationFailed), 'error');
    }
  }

  // Escape closes the sheet as a native dialog does — except while a plan is being prepared, when the way
  // out is 取消准备, so a preparation never runs on with nobody watching it.
  sheet.addEventListener('cancel', (event) => {
    if (sheetState !== null && sheetState.job !== null) {
      event.preventDefault();
      options.setStatus(REVIEW_PREPARING_ESCAPE, 'busy');
    }
  });
  sheet.addEventListener('close', () => {
    const state = sheetState;
    sheetState = null;
    sheet.replaceChildren();
    sheetUpdate = () => undefined;
    if (destroyed || state === null || state.prepared) return;
    const opener = card === undefined ? undefined : Array.from(card.querySelectorAll<HTMLElement>('button'))
      .find((candidate) => focusKeyOf(candidate) === state.openerKey && !(candidate as HTMLButtonElement).disabled);
    (opener ?? card?.querySelector<HTMLElement>('[data-review-action="new-review"]:not(:disabled)'))?.focus();
  });

  return {
    start: () => refresh(true),
    destroy: () => {
      destroyed = true;
      generation += 1;
      clearPoll();
      if (sheet.open) sheet.close();
    },
  };
}
