import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  type ExportFidelityRowProjection,
  type ManuscriptExportFormat,
  type ManuscriptExportOptions,
  type ManuscriptExportReceiptProjection,
  type ManuscriptExportReviewProjection,
  type ManuscriptExportTargetInput,
  type RendererApi,
} from '../shared/protocol.js';
import {
  EXPORT_ACTION_LABELS, EXPORT_DEGRADED_NOTE, EXPORT_FIDELITY_HEADING,
  EXPORT_OPTION_LABELS, EXPORT_OPTION_ORDER, EXPORT_STATUS_LINES,
  exportAbsentLine, exportCardHeading, exportCountText, exportPillText, exportPositionsLine,
  exportReceiptMeta, exportSavedRevisionLine, exportShownRows, type ExportAction,
} from './manuscript-export-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { readActionDefaults, rememberActionDefaults } from './action-defaults.js';

/** Inline export choices followed by one native Save dialog and the recorded result. */
export interface ManuscriptExportSurface {
  /** Open the card for one version; `opener` gets focus back when the card closes. */
  open(target: ManuscriptExportTargetInput, label: string | null, opener: HTMLElement | null): void;
  menu(target: ManuscriptExportTargetInput | (() => ManuscriptExportTargetInput), label: string | null): HTMLElement;
  /** Whether a call of the card is in flight, so the destination does not redraw under it. */
  busy(): boolean;
  /** Close the card without a word, unless a call of it is in flight: what it exports is no longer on show. */
  close(): void;
  destroy(): void;
}

type ExportApi = Pick<RendererApi, 'reviewManuscriptExport' | 'chooseManuscriptExportDestination' | 'approveManuscriptExport' | 'revealManuscriptExport'>;

export interface MountManuscriptExportOptions {
  /** The card's slot on 交付物: the surface draws into it and clears it when the card closes. */
  root: HTMLElement;
  beforeExport?(): Promise<boolean>;
  bookId: string;
  api: ExportApi;
  technicalDetails?(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** 交付物 changed under the card — a revision saved for the export, or an approved export: read it again. */
  onChanged(): void;
  /** The 导出… of a version as 交付物 draws it now, for focus to return to once the one that opened the card was redrawn. */
  openerOf(target: ManuscriptExportTargetInput): HTMLElement | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

/** One class of the Export Fidelity Review: its name and count, its status in text and shape, what happens to it, where. */
function renderExportFidelityRow(row: ExportFidelityRowProjection): HTMLElement {
  const item = el('li', 'export-fidelity-row');
  item.dataset['exportFidelity'] = row.key;
  item.dataset['exportStatus'] = row.status;
  item.dataset['exportCount'] = String(row.count);
  const name = el('span', 'export-fidelity-name', row.label);
  name.append(el('span', 'count', exportCountText(row.count)));
  const pill = el('span', `state-term status-pill export-status-${row.status}`, exportPillText(row));
  const detail = el('p', 'export-fidelity-detail', row.detail);
  const positions = exportPositionsLine(row);
  if (positions !== null) detail.append(el('span', 'export-fidelity-positions', positions));
  item.append(name, pill, detail);
  return item;
}

/**
 * V2-UX-EXP-007: every applicable class of one file; one kept and found nowhere is summarized on one line. A package's
 * export (Issue #416, S67b) draws each file's under a disclosure of its own, with the note said once for all of them.
 */
export function renderExportFidelity(
  reviewed: Pick<ManuscriptExportReviewProjection, 'fidelity' | 'degraded' | 'restoration' | 'restorationLine' | 'retentionSummary'>,
  parts: { heading: boolean; degradedNote: boolean } = { heading: true, degradedNote: true },
): HTMLElement {
  const section = el('section', 'export-fidelity');
  section.dataset['exportDegraded'] = reviewed.degraded ? 'true' : 'false';
  section.dataset['exportRestoration'] = reviewed.restoration;
  if (parts.heading) section.append(el('h5', undefined, EXPORT_FIDELITY_HEADING));
  section.append(el('p', 'export-restoration-line', reviewed.restorationLine.replace('直接并入正文（作为定稿基线）', '直接并入正文 · 定稿基线')));
  if (reviewed.retentionSummary !== null) section.append(el('p', 'export-retention-summary', reviewed.retentionSummary));
  const list = el('ol', 'export-fidelity-list');
  for (const row of exportShownRows(reviewed.fidelity)) list.append(renderExportFidelityRow(row));
  section.append(list);
  const absent = exportAbsentLine(reviewed.fidelity);
  if (absent !== null) section.append(el('p', 'field-note export-absent-line', absent));
  if (parts.degradedNote && reviewed.degraded) section.append(el('p', 'export-degraded-note attention-note', EXPORT_DEGRADED_NOTE));
  return section;
}

function actionButton(action: ExportAction, className: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', className, EXPORT_ACTION_LABELS[action]);
  button.type = 'button';
  button.dataset['exportAction'] = action;
  button.addEventListener('click', onClick);
  return button;
}

export function mountManuscriptExport(options: MountManuscriptExportOptions): ManuscriptExportSurface {
  const { api, root } = options;
  let destroyed = false;
  let busy = false;
  let format: ManuscriptExportFormat = 'docx';
  let switches: ManuscriptExportOptions = { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS };
  let receipt: ManuscriptExportReceiptProjection | null = null;
  let reviewed: ManuscriptExportReviewProjection | null = null;
  let problem: string | null = null;
  let phase = 'idle';
  let activeTarget: ManuscriptExportTargetInput | null = null;
  let opener: HTMLElement | null = null;

  function render(): void {
    if (destroyed) return;
    root.hidden = phase === 'idle';
    const section = el('section', phase === 'idle' ? 'export-preferences' : 'manuscript-export');
    if (activeTarget !== null) {
      section.dataset['exportTarget'] = activeTarget.kind;
      if (activeTarget.kind === 'milestone') section.dataset['milestoneId'] = activeTarget.milestoneId;
      if (activeTarget.kind === 'document') { section.dataset['documentId'] = activeTarget.documentId; section.dataset['revisionId'] = activeTarget.revisionId; }
    }
    if (reviewed !== null) {
      section.append(el('h4', undefined, exportCardHeading(reviewed.target, { kind: 'current' })));
      if (reviewed.savedForExport) section.append(el('p', 'export-saved-line', exportSavedRevisionLine(reviewed.target.revisionLabel)));
    }
    section.dataset['exportPhase'] = phase;
    section.setAttribute('aria-busy', String(busy));
    const inline = el('div', 'export-options');
    const formats = el('fieldset', 'export-formats');
    formats.append(el('legend', undefined, '导出格式'));
    for (const [value, label] of [['docx', 'DOCX'], ['pdf', 'PDF'], ['markdown', 'Markdown']] as const) {
      const choice = el('label', 'export-format-option'); const radio = el('input');
      radio.type = 'radio'; radio.name = 'export-format'; radio.value = value; radio.checked = format === value; radio.disabled = busy || receipt !== null;
      choice.dataset['exportFormat'] = value;
      radio.addEventListener('change', () => { if (radio.checked) format = value; });
      choice.append(radio, el('span', undefined, label)); formats.append(choice);
    }
    inline.append(formats);
    for (const key of EXPORT_OPTION_ORDER) {
      const label = el('label', 'export-option');
      const box = el('input');
      box.type = 'checkbox'; box.checked = switches[key]; box.disabled = busy || receipt !== null;
      box.dataset['exportOption'] = key;
      box.addEventListener('change', () => { switches = { ...switches, [key]: box.checked }; });
      label.append(box, el('span', undefined, EXPORT_OPTION_LABELS[key]));
      inline.append(label);
    }
    section.append(inline);
    if (problem !== null) {
      const alert = el('p', 'export-problem', problem); alert.setAttribute('role', 'alert'); section.append(alert);
    }
    if (receipt !== null) {
      const result = el('div', 'export-receipt');
      result.dataset['exportOutcome'] = receipt.outcome; result.setAttribute('role', 'status');
      result.append(el('strong', 'export-outcome', receipt.outcomeLabel), el('p', 'export-outcome-detail', receipt.detail),
        el('p', 'export-receipt-meta', exportReceiptMeta(receipt, receipt.recordedAt === null ? null : localInstantLabel(receipt.recordedAt))));
      if (receipt.retentionSummary !== null) result.append(el('p', 'export-retention-summary', receipt.retentionSummary));
      if (receipt.revealAvailable) result.append(actionButton('reveal', 'secondary', () => {
        if (receipt === null) return;
        void api.revealManuscriptExport({ preparationId: receipt.preparationId }).catch((error: unknown) => options.setStatus(options.errorMessage(error, EXPORT_STATUS_LINES.revealFailed), 'error'));
      }));
      result.append(actionButton('close', 'quiet', () => reset()));
      section.append(result);
    }
    if (reviewed !== null) {
      const details = el('details', 'export-fidelity-details');
      details.append(el('summary', undefined, '查看导出详情'), renderExportFidelity(reviewed)); section.append(details);
      section.append(el('p', 'export-format-line', reviewed.formatLine));
    }
    root.replaceChildren(section);
  }

  function reset(): void {
    if (busy) return;
    const focus = activeTarget === null ? opener : options.openerOf(activeTarget) ?? opener;
    receipt = null; reviewed = null; problem = null; activeTarget = null; phase = 'idle'; render(); focus?.focus();
  }

  async function exportFile(target: ManuscriptExportTargetInput): Promise<void> {
    if (destroyed || busy) return;
    if (options.beforeExport && !await options.beforeExport()) return;
    if (destroyed || busy) return;
    busy = true; activeTarget = target; receipt = null; reviewed = null; problem = null; phase = 'reviewing'; render();
    const selected = { ...switches };
    try {
      await rememberActionDefaults({ exportFormat: format, ...selected }).catch(() => options.setStatus('未能记住导出选项，本次仍会继续导出。', 'error'));
      options.setStatus(EXPORT_STATUS_LINES.choosing, 'busy');
      const review = await api.reviewManuscriptExport({ target, options: selected, format });
      if (destroyed) return;
      if (review.bookId !== options.bookId) throw new Error(EXPORT_STATUS_LINES.reviewFailed);
      reviewed = review; phase = 'choosing'; render();
      const chosen = await api.chooseManuscriptExportDestination({ revisionId: review.target.revisionId, target,
        options: selected, reviewDigest: review.reviewDigest, suggestedFileName: review.suggestedFileName, format: review.format });
      if (destroyed) return;
      if (chosen.outcome === 'cancelled') { phase = 'idle'; activeTarget = null; options.setStatus(EXPORT_STATUS_LINES.cancelled); return; }
      if (chosen.preparation.bookId !== options.bookId) throw new Error(EXPORT_STATUS_LINES.chooseFailed);
      phase = 'writing'; render(); options.setStatus(EXPORT_STATUS_LINES.writing, 'busy');
      const result = await api.approveManuscriptExport({ preparationId: chosen.preparation.preparationId });
      if (destroyed) return;
      if (result.bookId !== options.bookId || result.preparationId !== chosen.preparation.preparationId) throw new Error(EXPORT_STATUS_LINES.approveFailed);
      receipt = result; phase = 'done';
      options.setStatus(result.outcomeLabel, result.outcome === 'created' || result.outcome === 'replaced' ? 'success' : 'error');
      options.onChanged();
    } catch (error) {
      if (destroyed) return;
      problem = options.errorMessage(error, EXPORT_STATUS_LINES.approveFailed); phase = 'ready'; options.setStatus(problem, 'error');
    } finally {
      busy = false; render();
      if (receipt !== null) root.querySelector<HTMLElement>('[data-export-action="reveal"], [data-export-action="close"]')?.focus();
      else if (phase === 'idle') opener?.focus();
    }
  }

  void readActionDefaults().then((defaults) => {
    if (busy || destroyed) return;
    format = defaults.exportFormat;
    switches = { includeAnnotations: defaults.includeAnnotations, includeSuggestions: defaults.includeSuggestions, includeEditorNotes: defaults.includeEditorNotes };
    render();
  });
  render();
  return {
    open(target, _label, source) { opener = source; void exportFile(target); },
    menu(targetOrRead, label) {
      const target = (): ManuscriptExportTargetInput => typeof targetOrRead === 'function' ? targetOrRead() : targetOrRead;
      const menu = el('details', 'export-menu'); menu.dataset['exportMenu'] = target().kind;
      const summary = el('summary', undefined, '导出 ▾'); menu.append(summary);
      const body = el('div', 'export-menu-body'); menu.append(body);
      for (const [value, name] of [['docx', 'DOCX'], ['pdf', 'PDF'], ['markdown', 'Markdown']] as const) {
        const button = el('button', 'quiet', name); button.type = 'button'; button.dataset['exportAction'] = 'open';
        button.dataset['exportTarget'] = target().kind; button.dataset['exportFormatAction'] = value;
        button.setAttribute('aria-label', `导出 ${label ?? '稿件'} · ${name}`);
        button.addEventListener('click', () => { if (busy) return; format = value; opener = summary; menu.open = false; void exportFile(target()); }); body.append(button);
      }
      const settings = el('details', 'export-menu-options'); settings.append(el('summary', undefined, '导出选项'));
      for (const key of EXPORT_OPTION_ORDER) { const label = el('label', 'export-option'); const box = el('input'); box.type = 'checkbox'; box.checked = switches[key];
        box.addEventListener('change', () => { switches = { ...switches, [key]: box.checked }; void rememberActionDefaults({ [key]: box.checked }).catch(() => options.setStatus('未能记住导出选项。', 'error')); });
        menu.addEventListener('toggle', () => { box.checked = switches[key]; }); label.append(box, el('span', undefined, EXPORT_OPTION_LABELS[key])); settings.append(label); }
      body.append(settings);
      return menu;
    },
    busy: () => busy,
    close: reset,
    destroy() { destroyed = true; },
  };
}
