import type { RendererApi, ReviewGuidelineDocumentProjection, ReviewGuidelinePreviewProjection, ReviewGuidelinesProjection } from '../shared/protocol.js';
import {
  GUIDELINE_CANCEL,
  GUIDELINE_CONFIRM,
  GUIDELINE_IMPORT,
  GUIDELINE_STATUS,
  guidelineAppliedBy,
  guidelineCitations,
  guidelineClausesSummary,
  guidelineFixedStatement,
  guidelineImported,
  guidelineOlderBooks,
  guidelinePreviewChanges,
  guidelinePreviewHeading,
  guidelineVersionLine,
  guidelineVersionPill,
  guidelineVersionsSummary,
} from './knowledge-base-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * 知识库 › 审阅规范文件 (Issue #427, plan slice S79a; V2-UX-KB-001 to KB-003): each guideline document the review categories
 * apply — the version that applies now and who issued it, the categories that apply it, the Books still on an older
 * version, its numbered clauses with how often findings cite them, and every version with the reviews that used it.
 * `导入新版本…` opens the picker, shows the file's clauses as the next version would read them, and `确认导入` records it.
 */
export interface MountReviewGuidelinesOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectReviewGuidelines' | 'previewReviewGuidelineVersion' | 'importReviewGuidelineVersion'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly technicalDetails: (key: string, ...rows: HTMLElement[]) => HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['guidelineAction'] = name;
  node.addEventListener('click', run);
  return node;
}

export function mountReviewGuidelines(options: MountReviewGuidelinesOptions): { load(): Promise<void> } {
  const { root, api, setStatus, errorMessage, technicalDetails } = options;
  root.classList.add('review-guidelines');
  let busy = false;
  /** The preview on show, and the document it belongs to. */
  let preview: ReviewGuidelinePreviewProjection | null = null;
  let refusal: { documentId: string; message: string } | null = null;
  let projection: ReviewGuidelinesProjection | null = null;
  let request = 0;

  const paint = (focus: string | null): void => {
    const opened = new Set(Array.from(root.querySelectorAll<HTMLDetailsElement>('details[open]'), (node) =>
      `${node.closest<HTMLElement>('[data-guideline-document]')?.dataset['guidelineDocument']}/${node.className}`));
    const list = el('div', 'guideline-list');
    for (const document of projection?.documents ?? []) list.append(card(document));
    for (const node of list.querySelectorAll<HTMLDetailsElement>('details')) {
      node.open = opened.has(`${node.closest<HTMLElement>('[data-guideline-document]')?.dataset['guidelineDocument']}/${node.className}`);
    }
    root.replaceChildren(list);
    root.dataset['guidelineCount'] = String(projection?.documents.length ?? 0);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const card = (document: ReviewGuidelineDocumentProjection): HTMLElement => {
    const node = el('article', 'guideline-card');
    node.dataset['guidelineDocument'] = document.documentId;
    node.dataset['guidelineVersion'] = String(document.currentOrdinal);
    node.dataset['guidelineUse'] = document.use;
    const heading = el('div', 'guideline-heading');
    const title = el('h3', undefined, document.title);
    title.tabIndex = -1;
    heading.append(title, el('span', 'status-pill guideline-version-pill', guidelineVersionPill(document)));
    node.append(heading, el('p', 'field-note guideline-applied', guidelineAppliedBy(document)));
    const older = guidelineOlderBooks(document);
    if (older !== null) {
      const note = el('p', 'attention-note guideline-older', older);
      note.dataset['guidelineOlder'] = String(document.olderVersionBookCount);
      node.append(note);
    }
    // A document AI7 fixes says why it takes no house version, where the others offer 导入新版本.
    const fixed = guidelineFixedStatement(document);
    if (fixed !== null) node.append(el('p', 'field-note guideline-fixed', fixed));
    // The clauses of the version that applies now, each with how often findings cite it.
    const clauses = el('details', 'guideline-clauses');
    clauses.append(el('summary', undefined, guidelineClausesSummary(document.clauseCount)));
    const list = el('ol', 'guideline-clause-list');
    for (const clause of document.clauses) {
      const item = el('li');
      item.dataset['clauseId'] = clause.clauseId;
      item.dataset['clauseCitations'] = String(clause.citations);
      item.value = clause.number;
      item.append(el('span', 'guideline-clause-text', clause.text), el('span', 'guideline-citations', guidelineCitations(clause.citations)));
      list.append(item);
    }
    clauses.append(list);
    if (document.clausePages > 1) clauses.append(clauseControls(document, false));
    // Every version, newest first, with the reviews that used it.
    const versions = el('details', 'guideline-versions');
    versions.append(el('summary', undefined, guidelineVersionsSummary(document.versionCount)));
    const rows = el('ul', 'guideline-version-list');
    for (const version of document.versions) {
      const row = el('li', undefined, guidelineVersionLine(version, localInstantLabel));
      row.dataset['guidelineVersionRow'] = String(version.ordinal);
      row.dataset['guidelineUsedBy'] = String(version.usedByCount);
      rows.append(row);
    }
    versions.append(rows, technicalDetails('guideline-facts',
      el('dt', undefined, '文件'), el('dd', 'technical-identity', document.documentId),
      el('dt', undefined, '各版本摘要'), el('dd', 'technical-identity', document.versions.map((version) => `第 ${version.ordinal} 版 ${version.digest}`).join('；'))));
    if (document.versionCount > document.versions.length) {
      const controls = el('div', 'button-row');
      const latest = action('最新版本', 'quiet', 'versions-latest', () => void turn(document, null, document.clausePage, 'versions-latest'));
      const older = action('更早版本', 'secondary', 'versions-older', () => void turn(document, document.versionsNext, document.clausePage, 'versions-older'));
      latest.disabled = busy || preview !== null || document.versionsBefore === null;
      older.disabled = busy || preview !== null || document.versionsNext === null;
      controls.append(latest, older);
      versions.append(controls);
    }
    node.append(clauses, versions);
    if (refusal?.documentId === document.documentId) {
      const note = el('p', 'attention-note guideline-refusal', refusal.message);
      note.setAttribute('role', 'alert');
      node.append(note);
    }
    if (preview?.documentId === document.documentId) node.append(previewSection(preview));
    else if (fixed === null) {
      const actions = el('div', 'button-row');
      const start = action(GUIDELINE_IMPORT, 'secondary', 'import', () => void choose(document.documentId));
      start.disabled = busy || preview !== null;
      actions.append(start);
      node.append(actions);
    }
    return node;
  };

  const previewSection = (shown: ReviewGuidelinePreviewProjection): HTMLElement => {
    const section = el('section', 'guideline-preview');
    section.dataset['guidelinePreview'] = String(shown.ordinal);
    const heading = el('h4', undefined, guidelinePreviewHeading(shown));
    heading.tabIndex = -1;
    const list = el('ol', 'guideline-clause-list');
    for (const clause of shown.clauses) {
      const item = el('li', undefined, clause.text);
      item.value = clause.number;
      item.dataset['clauseId'] = clause.clauseId;
      list.append(item);
    }
    const actions = el('div', 'button-row');
    const confirm = action(GUIDELINE_CONFIRM, 'primary', 'confirm', () => void commit(shown));
    const cancel = action(GUIDELINE_CANCEL, 'quiet', 'cancel-import', () => {
      preview = null;
      paint(`[data-guideline-document="${shown.documentId}"] [data-guideline-action="import"]`);
    });
    confirm.disabled = busy;
    cancel.disabled = busy;
    actions.append(confirm, cancel);
    section.append(heading, el('p', 'field-note guideline-preview-changes', guidelinePreviewChanges(shown)), list, actions);
    if (shown.clausePages > 1) section.insertBefore(clauseControls(shown, true), actions);
    return section;
  };

  const clauseControls = (shown: ReviewGuidelineDocumentProjection | ReviewGuidelinePreviewProjection, isPreview: boolean): HTMLElement => {
    const row = el('div', 'button-row');
    row.append(el('span', 'field-note', `第 ${shown.clausePage + 1} / ${shown.clausePages} 页；较长条款分段显示。`));
    for (const [step, label, name] of [[-1, '上一页', 'clauses-previous'], [1, '下一页', 'clauses-next']] as const) {
      const button = action(label, 'secondary', name, () => {
        if (isPreview && 'previewId' in shown) void turnPreview(shown, shown.clausePage + step, name);
        else if ('versionsBefore' in shown) void turn(shown, shown.versionsBefore, shown.clausePage + step, name);
      });
      button.disabled = busy || (!isPreview && preview !== null) || shown.clausePage + step < 0 || shown.clausePage + step >= shown.clausePages;
      row.append(button);
    }
    return row;
  };

  const turn = async (shown: ReviewGuidelineDocumentProjection, versionsBefore: number | null, clausePage: number, focus: string): Promise<void> => {
    if (busy || preview !== null) return;
    const ticket = ++request;
    busy = true;
    paint(null);
    try {
      const next = await api.inspectReviewGuidelines({ page: { documentId: shown.documentId, versionsBefore, clausePage } });
      if (!root.isConnected || ticket !== request) return;
      projection = next;
      refusal = null;
    } catch (error) {
      if (!root.isConnected || ticket !== request) return;
      refusal = { documentId: shown.documentId, message: errorMessage(error, GUIDELINE_STATUS.failed) };
    } finally {
      if (root.isConnected && ticket === request) {
        busy = false;
        paint(`[data-guideline-document="${shown.documentId}"] [data-guideline-action="${focus}"]`);
      }
    }
  };

  const turnPreview = async (shown: ReviewGuidelinePreviewProjection, clausePage: number, focus: string): Promise<void> => {
    if (busy) return;
    const ticket = ++request;
    busy = true;
    paint(null);
    try {
      const next = await api.previewReviewGuidelineVersion({ documentId: shown.documentId, previewId: shown.previewId, clausePage });
      if (!root.isConnected || ticket !== request) return;
      preview = next;
    } catch (error) {
      if (!root.isConnected || ticket !== request) return;
      refusal = { documentId: shown.documentId, message: errorMessage(error, GUIDELINE_STATUS.failed) };
    } finally {
      if (root.isConnected && ticket === request) {
        busy = false;
        paint(`[data-guideline-document="${shown.documentId}"] .guideline-preview [data-guideline-action="${focus}"]`);
      }
    }
  };

  const choose = async (documentId: string): Promise<void> => {
    if (busy) return;
    busy = true;
    refusal = null;
    setStatus(GUIDELINE_STATUS.choosing, 'busy');
    try {
      const read = await api.previewReviewGuidelineVersion({ documentId });
      if (read === null) {
        setStatus(GUIDELINE_STATUS.cancelled);
        busy = false;
        paint(`[data-guideline-document="${documentId}"] [data-guideline-action="import"]`);
        return;
      }
      preview = read;
      busy = false;
      setStatus(guidelinePreviewHeading(read));
      paint(`[data-guideline-document="${documentId}"] .guideline-preview h4`);
    } catch (error) {
      busy = false;
      const message = errorMessage(error, GUIDELINE_STATUS.failed);
      refusal = { documentId, message };
      setStatus(message, 'error');
      paint(`[data-guideline-document="${documentId}"] [data-guideline-action="import"]`);
    }
  };

  const commit = async (shown: ReviewGuidelinePreviewProjection): Promise<void> => {
    if (busy) return;
    busy = true;
    setStatus(GUIDELINE_STATUS.importing, 'busy');
    paint(null);
    try {
      projection = await api.importReviewGuidelineVersion({ previewId: shown.previewId });
      preview = null;
      busy = false;
      setStatus(guidelineImported(shown.title, shown.ordinal), 'success');
      paint(`[data-guideline-document="${shown.documentId}"] h3`);
    } catch (error) {
      busy = false;
      preview = null;
      const message = errorMessage(error, GUIDELINE_STATUS.failed);
      refusal = { documentId: shown.documentId, message };
      setStatus(message, 'error');
      paint(`[data-guideline-document="${shown.documentId}"] [data-guideline-action="import"]`);
    }
  };

  return {
    async load(): Promise<void> {
      root.dataset['guidelines'] = 'loading';
      try {
        projection = await api.inspectReviewGuidelines();
        root.dataset['guidelines'] = 'ready';
        paint(null);
      } catch (error) {
        root.dataset['guidelines'] = 'failed';
        root.replaceChildren(el('p', 'attention-note', errorMessage(error, GUIDELINE_STATUS.unavailable)));
        throw error;
      }
    },
  };
}
