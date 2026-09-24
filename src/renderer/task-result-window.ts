import type {
  BaselineAnalysisResultSetRevisionProjection,
  BookTaskItemProjection,
  GlobalAttentionTarget,
  RendererApi,
  ReviewRunProjection,
} from '../shared/protocol.js';
import { GLOBAL_ATTENTION_STATE_LABELS, GLOBAL_ATTENTION_STATE_PILLS, globalAttentionObjectLabel } from './global-attention-labels.js';
import {
  ANALYSIS_RESULT_NOT_DONE,
  REVIEW_RESULT_NONE,
  REVIEW_RESULT_NOT_DONE,
  TASK_RESULT_CLOSE,
  TASK_RESULT_COLUMNS,
  TASK_RESULT_FOOT_NOTE,
  TASK_RESULT_JUMP,
  TASK_RESULT_KIND,
  TASK_RESULT_LOADING,
  TASK_RESULT_OPEN,
  TASK_RESULT_ROWS,
  TASK_RESULT_UNAVAILABLE,
  analysisResultReadLine,
  analysisResultUnitLine,
  reviewResultFindingLine,
  reviewResultMoreLine,
  reviewResultPlaceLine,
  reviewResultReadLine,
  taskResultRangeTitle,
  taskResultTaskLine,
} from './task-panel-labels.js';

/**
 * 查看结果 (Issue #423, plan slice S77a; V2-UX-TASK-045): a finished Task's result in a floating window over the manuscript,
 * as wide as the text column and level with it, so the reading position stays where it is. Its rows jump to where the
 * result stands — an analysis's reading ranges, a 审阅's findings — and every jump leaves 回到<位置> in the manuscript's
 * header. It reads the result as its own screen reads it and changes nothing.
 */
export interface TaskResultWindowOptions {
  /** The finished Task, as the 任务 panel lists it. */
  readonly entry: BookTaskItemProjection;
  readonly api: Pick<RendererApi, 'inspectBaselineAnalysis' | 'inspectReviewWorkspace'>;
  /**
   * While the manuscript is on screen, its text column and the pane it scrolls in: the window takes the column's width and
   * stands at the top of the pane. `null` elsewhere, where the window stands in the middle of the screen.
   */
  column(): { readonly text: HTMLElement; readonly pane: HTMLElement } | null;
  /** 跳到: that paragraph of the manuscript the result was read from — and that mark's card, for a finding — leaving 回到<位置>. */
  jump(target: { manuscriptId: string | null; blockId: string; markId: string | null }): void;
  /** 在分析中打开 / 在审阅中打开: the Task's own screen. */
  openSurface(target: GlobalAttentionTarget): void;
  /** The window closed; `backToPanel` when the editor closed it, so the panel it came from opens again. */
  onClose(backToPanel: boolean): void;
  errorMessage(error: unknown, fallback: string): string;
}

export interface TaskResultWindow {
  readonly element: HTMLElement;
  close(backToPanel: boolean): void;
}

/** How many of a 审阅's findings the window lists; the rest are in 审阅. */
export const TASK_RESULT_FINDING_LIMIT = 20;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `task-result-${prefix}-${identities}`;
}

/** Where a reading range's result stands: its first cited place, or where an unread range begins. */
function unitBlockOf(unit: BaselineAnalysisResultSetRevisionProjection['units'][number]): string | null {
  if (unit.state === 'gap') return unit.gap.blockIds[0] ?? null;
  return unit.entities.flatMap((entity) => entity.sourceRanges)[0]?.blockId
    ?? unit.events.flatMap((event) => event.sourceRanges)[0]?.blockId
    ?? unit.settingClaims.flatMap((claim) => claim.sourceRanges)[0]?.blockId
    ?? null;
}

export function openTaskResultWindow(options: TaskResultWindowOptions): TaskResultWindow {
  const { entry } = options;
  const isReview = entry.item.object.kind === 'review';
  const section = el('section', 'task-result-window');
  section.setAttribute('role', 'dialog');
  section.dataset['taskResult'] = 'loading';
  section.dataset['taskResultKind'] = isReview ? 'review' : 'analysis';
  const bar = el('header', 'task-result-bar');
  const kind = el('span', 'task-result-kind', TASK_RESULT_KIND);
  const title = el('h3', 'task-result-title', globalAttentionObjectLabel(entry.item.object));
  title.id = uid('title');
  title.tabIndex = -1;
  section.setAttribute('aria-labelledby', title.id);
  const pillTone = GLOBAL_ATTENTION_STATE_PILLS[entry.item.state];
  const pill = el('span', `status-pill review-pill review-pill-${pillTone.tone}`, GLOBAL_ATTENTION_STATE_LABELS[entry.item.state]);
  pill.dataset['pillTone'] = pillTone.tone;
  pill.dataset['pillShape'] = pillTone.shape;
  const close = el('button', 'quiet task-result-close', TASK_RESULT_CLOSE);
  close.type = 'button';
  close.dataset['taskResultAction'] = 'close';
  bar.append(kind, title, pill, close);
  const body = el('div', 'task-result-body');
  body.append(el('p', 'field-note', TASK_RESULT_LOADING));
  const foot = el('footer', 'task-result-foot');
  const open = el('button', 'secondary', isReview ? TASK_RESULT_OPEN.review : TASK_RESULT_OPEN.analysis);
  open.type = 'button';
  open.dataset['taskResultAction'] = 'open';
  foot.append(open, el('span', 'field-note task-result-note', TASK_RESULT_FOOT_NOTE));
  section.append(bar, body, foot);

  let closed = false;
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place());

  /** As wide as the text column and at the top of its pane; in the middle of the screen when no manuscript is on it. */
  function place(): void {
    if (closed) return;
    const anchor = options.column();
    if (anchor === null || !anchor.text.isConnected || !anchor.pane.isConnected) {
      section.dataset['taskResultAligned'] = 'window';
      for (const property of ['left', 'width', 'top', 'max-height']) section.style.removeProperty(property);
      return;
    }
    const text = anchor.text.getBoundingClientRect();
    const pane = anchor.pane.getBoundingClientRect();
    const width = Math.max(240, Math.min(text.width, window.innerWidth - 16));
    section.dataset['taskResultAligned'] = 'column';
    section.style.left = `${Math.min(Math.max(8, text.left), Math.max(8, window.innerWidth - width - 8))}px`;
    section.style.width = `${width}px`;
    section.style.top = `${Math.max(8, pane.top + 8)}px`;
    section.style.maxHeight = `${Math.max(240, Math.min(pane.bottom, window.innerHeight) - Math.max(8, pane.top + 8) - 8)}px`;
  }

  const surface: TaskResultWindow = {
    element: section,
    close(backToPanel) {
      if (closed) return;
      closed = true;
      observer?.disconnect();
      window.removeEventListener('resize', place);
      section.remove();
      options.onClose(backToPanel);
    },
  };

  close.addEventListener('click', () => surface.close(true));
  section.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    surface.close(true);
  });
  open.addEventListener('click', () => {
    const target: GlobalAttentionTarget = entry.item.target;
    surface.close(false);
    options.openSurface(target);
  });

  /** The manuscript the result was read from: its jumps land there. */
  let manuscriptId: string | null = null;

  function jumpButton(blockId: string | null, markId: string | null): HTMLElement {
    if (blockId === null) return el('span', 'field-note', '—');
    const button = el('button', 'quiet task-result-jump', TASK_RESULT_JUMP);
    button.type = 'button';
    button.dataset['taskResultJump'] = blockId;
    button.addEventListener('click', () => {
      surface.close(false);
      options.jump({ manuscriptId, blockId, markId });
    });
    return button;
  }

  function meta(read: string, notDone: string): HTMLElement {
    const list = el('dl', 'task-result-meta');
    list.append(
      el('dt', undefined, TASK_RESULT_ROWS.task), el('dd', undefined, taskResultTaskLine(entry)),
      el('dt', undefined, TASK_RESULT_ROWS.read), el('dd', undefined, read),
      el('dt', undefined, TASK_RESULT_ROWS.notDone), el('dd', undefined, notDone),
    );
    return list;
  }

  function table(columns: ReadonlyArray<string>, rows: ReadonlyArray<HTMLTableRowElement>): HTMLTableElement {
    const node = el('table', 'task-result-table');
    const head = el('thead');
    const headRow = el('tr');
    for (const column of columns) headRow.append(el('th', undefined, column));
    head.append(headRow);
    const bodyRows = el('tbody');
    bodyRows.append(...rows);
    node.append(head, bodyRows);
    return node;
  }

  function showAnalysis(revision: BaselineAnalysisResultSetRevisionProjection): void {
    const rows = revision.units.map((unit) => {
      const heading = revision.sections.find((candidate) => candidate.unitOrdinals.includes(unit.unitOrdinal))?.headingText ?? null;
      const row = el('tr');
      row.dataset['taskResultUnit'] = String(unit.unitOrdinal);
      const place = el('td', 'task-result-place');
      place.append(jumpButton(unitBlockOf(unit), null));
      row.append(
        el('td', undefined, String(unit.unitOrdinal)),
        el('td', undefined, taskResultRangeTitle(unit.unitOrdinal, heading)),
        el('td', undefined, analysisResultUnitLine(unit.state === 'gap' ? unit.gap : null)),
        place,
      );
      return row;
    });
    body.replaceChildren(meta(analysisResultReadLine(revision), ANALYSIS_RESULT_NOT_DONE), table(TASK_RESULT_COLUMNS.analysis, rows));
  }

  function showReview(run: ReviewRunProjection): void {
    const findings = run.findings.slice(0, TASK_RESULT_FINDING_LIMIT);
    const read = `${run.scope.label} · ${reviewResultReadLine(run.categories.map((category) => category.label))}`;
    const parts: HTMLElement[] = [meta(read, REVIEW_RESULT_NOT_DONE)];
    if (findings.length === 0) {
      parts.push(el('p', 'field-note', REVIEW_RESULT_NONE));
    } else {
      parts.push(table(TASK_RESULT_COLUMNS.review, findings.map((finding) => {
        const row = el('tr');
        row.dataset['taskResultFinding'] = finding.findingId;
        const place = el('td', 'task-result-place');
        place.append(el('span', 'field-note', reviewResultPlaceLine(finding)), ' ', jumpButton(finding.blockPosition === null ? null : finding.blockId, finding.markId));
        row.append(el('td', undefined, String(finding.ordinal)), el('td', undefined, finding.categoryLabel), el('td', undefined, reviewResultFindingLine(finding)), place);
        return row;
      })));
      const more = reviewResultMoreLine(findings.length, run.findingsTotal);
      if (more !== null) parts.push(el('p', 'field-note', more));
    }
    body.replaceChildren(...parts);
  }

  async function load(): Promise<void> {
    const result = entry.result;
    try {
      if (result === null) throw new Error(TASK_RESULT_UNAVAILABLE);
      if (result.kind === 'analysis-revision') {
        const projection = await options.api.inspectBaselineAnalysis({ revisionId: result.revisionId });
        const revision = projection.inspectedRevision?.revision ?? projection.resultSetRevision;
        if (closed) return;
        if (revision === null || revision.revisionId !== result.revisionId) throw new Error(TASK_RESULT_UNAVAILABLE);
        manuscriptId = revision.manuscriptPin.manuscriptId;
        showAnalysis(revision);
      } else {
        const workspace = await options.api.inspectReviewWorkspace({ reviewRunId: result.reviewRunId });
        if (closed) return;
        if (workspace.run === null || workspace.run.reviewRunId !== result.reviewRunId) throw new Error(TASK_RESULT_UNAVAILABLE);
        manuscriptId = workspace.manuscript?.manuscriptId ?? null;
        showReview(workspace.run);
      }
      section.dataset['taskResult'] = 'ready';
    } catch (error) {
      if (closed) return;
      section.dataset['taskResult'] = 'unavailable';
      body.replaceChildren(el('p', 'attention-note', options.errorMessage(error, TASK_RESULT_UNAVAILABLE)));
    }
    place();
  }

  document.body.append(section);
  const anchor = options.column();
  if (anchor !== null) {
    observer?.observe(anchor.text);
    observer?.observe(anchor.pane);
  }
  window.addEventListener('resize', place);
  place();
  title.focus();
  void load();
  return surface;
}
