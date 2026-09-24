import type { RendererApi, ReviewGuidelineDocumentProjection, ReviewGuidelinePreviewProjection, ReviewGuidelinesProjection } from '../shared/protocol.js';
import {
  GUIDELINE_CANCEL,
  GUIDELINE_CONFIRM,
  GUIDELINE_IMPORT,
  GUIDELINE_STATUS,
  guidelineAppliedBy,
  guidelineCitations,
  guidelineClausesSummary,
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

  const paint = (focus: string | null): void => {
    const list = el('div', 'guideline-list');
    for (const document of projection?.documents ?? []) list.append(card(document));
    root.replaceChildren(list);
    root.dataset['guidelineCount'] = String(projection?.documents.length ?? 0);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const card = (document: ReviewGuidelineDocumentProjection): HTMLElement => {
    const node = el('article', 'guideline-card');
    node.dataset['guidelineDocument'] = document.documentId;
    node.dataset['guidelineVersion'] = String(document.currentOrdinal);
    const heading = el('div', 'guideline-heading');
    const title = el('h3', undefined, document.title);
    title.tabIndex = -1;
    heading.append(title, el('span', 'status-pill guideline-version-pill', guidelineVersionPill(document)));
    node.append(heading, el('p', 'field-note guideline-applied', guidelineAppliedBy(document)));
    const older = guidelineOlderBooks(document);
    if (older !== null) {
      const note = el('p', 'attention-note guideline-older', older);
      note.dataset['guidelineOlder'] = String(document.olderVersionBooks.length);
      node.append(note);
    }
    // The clauses of the version that applies now, each with how often findings cite it.
    const clauses = el('details', 'guideline-clauses');
    clauses.append(el('summary', undefined, guidelineClausesSummary(document.clauses.length)));
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
    // Every version, newest first, with the reviews that used it.
    const versions = el('details', 'guideline-versions');
    versions.append(el('summary', undefined, guidelineVersionsSummary(document.versions.length)));
    const rows = el('ul', 'guideline-version-list');
    for (const version of document.versions) {
      const row = el('li', undefined, guidelineVersionLine(version, localInstantLabel));
      row.dataset['guidelineVersionRow'] = String(version.ordinal);
      row.dataset['guidelineUsedBy'] = String(version.usedBy.length);
      rows.append(row);
    }
    versions.append(rows, technicalDetails('guideline-facts',
      el('dt', undefined, '文件'), el('dd', 'technical-identity', document.documentId),
      el('dt', undefined, '各版本摘要'), el('dd', 'technical-identity', document.versions.map((version) => `第 ${version.ordinal} 版 ${version.digest}`).join('；'))));
    node.append(clauses, versions);
    if (refusal?.documentId === document.documentId) {
      const note = el('p', 'attention-note guideline-refusal', refusal.message);
      note.setAttribute('role', 'alert');
      node.append(note);
    }
    if (preview?.documentId === document.documentId) node.append(previewSection(preview));
    else {
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
    return section;
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
