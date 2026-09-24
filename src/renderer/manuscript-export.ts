import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  type ExportFidelityRowProjection,
  type ManuscriptExportFormat,
  type ManuscriptExportOptions,
  type ManuscriptExportPreparationProjection,
  type ManuscriptExportReceiptProjection,
  type ManuscriptExportReviewProjection,
  type ManuscriptExportTargetInput,
  type RendererApi,
} from '../shared/protocol.js';
import {
  EXPORT_ACTION_LABELS,
  EXPORT_APPROVE_REASON,
  EXPORT_DEGRADED_NOTE,
  EXPORT_DESTINATION_HEADING,
  EXPORT_DESTINATION_UNCHOSEN,
  EXPORT_FIDELITY_HEADING,
  EXPORT_FALLBACK_FORMATS,
  EXPORT_FORMAT_LEGEND,
  EXPORT_LOCAL_LINE,
  EXPORT_OPTION_LABELS,
  exportOptionNote,
  EXPORT_OPTION_ORDER,
  EXPORT_OPTIONS_LEGEND,
  EXPORT_OPTIONS_NOTE,
  EXPORT_STATUS_LINES,
  EXPORT_TECHNICAL_TERMS,
  exportAbsentLine,
  exportCardHeading,
  exportCountText,
  exportDestinationLine,
  exportPillText,
  exportPositionsLine,
  exportReceiptMeta,
  exportSavedRevisionLine,
  exportShownRows,
  type ExportAction,
  type ExportPendingLabel,
} from './manuscript-export-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * ④ 导出 as far as plan slice S64 reaches (Issue #413; editor-surfaces §7 导出, V2-UX-EXP-001 to EXP-024): one
 * card on 交付物 for one exact version — the current revision or a milestone — with the format (DOCX; PDF and
 * the Markdown 备用格式 shown and not yet offered), 含批注 and 含修改建议（作为修订） on and 含备注 off, the Export
 * Fidelity Review, `选择保存位置…` through the system's own Save dialog, and `按上述方式导出` — never preselected
 * and available only once the destination is bound — ending at `已导出到所选位置` with its receipt and
 * 在文件夹中显示, or at the outcome the service classified.
 *
 * Everything the card says of the file is the service's: the review rows, the destination as the dialog
 * returned it, and what the write came to. The renderer never names a path.
 */
export interface ManuscriptExportSurface {
  /** Open the card for one version; `opener` gets focus back when the card closes. */
  open(target: ManuscriptExportTargetInput, label: string | null, opener: HTMLElement | null): void;
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
  bookId: string;
  api: ExportApi;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** 交付物 changed under the card — a revision saved for the export, or an approved export: read it again. */
  onChanged(): void;
  /** The 导出… of a version as 交付物 draws it now, for focus to return to once the one that opened the card was redrawn. */
  openerOf(target: ManuscriptExportTargetInput): HTMLElement | null;
}

type Phase = 'reviewing' | 'ready' | 'choosing' | 'prepared' | 'writing' | 'done';

interface CardState {
  target: ManuscriptExportTargetInput;
  pendingLabel: ExportPendingLabel;
  /** The format the card reviews (Issue #500, S64b): DOCX until the editor chooses another. */
  format: ManuscriptExportFormat;
  options: ManuscriptExportOptions;
  review: ManuscriptExportReviewProjection | null;
  preparation: ManuscriptExportPreparationProjection | null;
  receipt: ManuscriptExportReceiptProjection | null;
  phase: Phase;
  problem: string | null;
  opener: HTMLElement | null;
}

/** Where focus goes once the card is drawn: nowhere new, the card's first choice, the approval, or the result. */
type FocusTarget = 'keep' | 'first' | 'approve' | 'result' | 'choose';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `manuscript-export-${prefix}-${identities}`;
}

function fact(term: string, value: string): HTMLElement[] {
  return [el('dt', undefined, term), el('dd', 'technical-identity', value)];
}

function actionButton(action: ExportAction, className: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', className, EXPORT_ACTION_LABELS[action]);
  button.type = 'button';
  button.dataset['exportAction'] = action;
  button.addEventListener('click', onClick);
  return button;
}

export function mountManuscriptExport(options: MountManuscriptExportOptions): ManuscriptExportSurface {
  const { api } = options;
  let destroyed = false;
  let state: CardState | null = null;
  let ticket = 0;
  let card: HTMLElement | null = null;

  const working = (): boolean => state !== null && (state.phase === 'reviewing' || state.phase === 'choosing' || state.phase === 'writing');

  function close(announce: boolean): void {
    if (state === null || working()) return;
    // 交付物 redraws its 导出… whenever it reads again, so the opener is found anew when the first one is gone.
    const opener = state.opener?.isConnected === true ? state.opener : options.openerOf(state.target);
    state = null;
    ticket += 1;
    card = null;
    options.root.replaceChildren();
    if (announce) options.setStatus(EXPORT_STATUS_LINES.closed);
    if (opener?.isConnected === true) opener.focus();
  }

  /** Read the review of the card's version under its options; a newer request or a closed card never paints. */
  function review(focus: FocusTarget): void {
    if (state === null) return;
    const current = state;
    const request = ++ticket;
    current.phase = 'reviewing';
    current.preparation = null;
    current.receipt = null;
    current.problem = null;
    render(focus === 'first' ? 'keep' : focus);
    options.setStatus(EXPORT_STATUS_LINES.reviewing, 'busy');
    void api.reviewManuscriptExport({ target: current.target, options: { ...current.options }, format: current.format }).then(
      (next) => {
        if (destroyed || state !== current || request !== ticket) return;
        if (next.bookId !== options.bookId) {
          current.phase = 'ready';
          current.problem = EXPORT_STATUS_LINES.reviewFailed;
          render('keep');
          return;
        }
        current.review = next;
        current.phase = 'ready';
        render(focus);
        options.setStatus(EXPORT_STATUS_LINES.reviewed, 'success');
        // The unsaved edits became a revision: 交付物's manuscript line reads it.
        if (next.savedForExport) options.onChanged();
      },
      (error) => {
        if (destroyed || state !== current || request !== ticket) return;
        current.phase = 'ready';
        current.review = null;
        current.problem = options.errorMessage(error, EXPORT_STATUS_LINES.reviewFailed);
        render('keep');
        options.setStatus(current.problem, 'error');
      },
    );
  }

  async function choose(): Promise<void> {
    const current = state;
    if (current === null || working() || current.review === null) return;
    const reviewed = current.review;
    const request = ++ticket;
    current.phase = 'choosing';
    current.problem = null;
    render('keep');
    options.setStatus(EXPORT_STATUS_LINES.choosing, 'busy');
    try {
      const result = await api.chooseManuscriptExportDestination({
        revisionId: reviewed.target.revisionId,
        target: current.target,
        options: { ...current.options },
        reviewDigest: reviewed.reviewDigest,
        suggestedFileName: reviewed.suggestedFileName,
        format: reviewed.format,
      });
      if (destroyed || state !== current || request !== ticket) return;
      if (result.outcome === 'cancelled') {
        current.phase = current.preparation === null ? 'ready' : 'prepared';
        render('choose');
        options.setStatus(EXPORT_STATUS_LINES.cancelled);
        return;
      }
      if (result.preparation.bookId !== options.bookId) throw new Error(EXPORT_STATUS_LINES.chooseFailed);
      current.preparation = result.preparation;
      current.phase = 'prepared';
      render('approve');
      options.setStatus(EXPORT_STATUS_LINES.prepared, 'success');
    } catch (error) {
      if (destroyed || state !== current || request !== ticket) return;
      current.phase = current.preparation === null ? 'ready' : 'prepared';
      current.problem = options.errorMessage(error, EXPORT_STATUS_LINES.chooseFailed);
      render('choose');
      options.setStatus(current.problem, 'error');
    }
  }

  async function approve(): Promise<void> {
    const current = state;
    if (current === null || working() || current.preparation === null) return;
    const preparation = current.preparation;
    const request = ++ticket;
    current.phase = 'writing';
    current.problem = null;
    render('keep');
    options.setStatus(EXPORT_STATUS_LINES.writing, 'busy');
    try {
      const receipt = await api.approveManuscriptExport({ preparationId: preparation.preparationId });
      if (destroyed || state !== current || request !== ticket) return;
      if (receipt.bookId !== options.bookId || receipt.preparationId !== preparation.preparationId) throw new Error(EXPORT_STATUS_LINES.approveFailed);
      current.receipt = receipt;
      current.phase = 'done';
      render('result');
      const exported = receipt.outcome === 'created' || receipt.outcome === 'replaced';
      options.setStatus(receipt.outcomeLabel, exported ? 'success' : 'error');
      options.onChanged();
    } catch (error) {
      if (destroyed || state !== current || request !== ticket) return;
      current.phase = 'prepared';
      current.problem = options.errorMessage(error, EXPORT_STATUS_LINES.approveFailed);
      render('approve');
      options.setStatus(current.problem, 'error');
    }
  }

  async function reveal(): Promise<void> {
    const receipt = state?.receipt;
    if (receipt === null || receipt === undefined || !receipt.revealAvailable) return;
    try {
      await api.revealManuscriptExport({ preparationId: receipt.preparationId });
      options.setStatus(EXPORT_STATUS_LINES.revealed, 'success');
    } catch (error) {
      options.setStatus(options.errorMessage(error, EXPORT_STATUS_LINES.revealFailed), 'error');
    }
  }

  // ---- drawing ------------------------------------------------------------------------------------------

  function render(focus: FocusTarget): void {
    const current = state;
    if (current === null || destroyed) return;
    const active = document.activeElement;
    const restore = focus === 'keep' && active instanceof HTMLElement && card?.contains(active) === true
      ? [active.dataset['exportAction'] ?? '', active.dataset['exportOption'] ?? '', active instanceof HTMLInputElement ? active.value : ''].join('|')
      : null;
    const busy = working();
    const section = el('section', 'manuscript-export');
    section.dataset['exportPhase'] = current.phase;
    section.dataset['exportTarget'] = current.target.kind;
    if (current.target.kind === 'milestone') section.dataset['milestoneId'] = current.target.milestoneId;
    if (current.target.kind === 'report') section.dataset['reportId'] = current.target.reportId;
    section.setAttribute('aria-busy', busy ? 'true' : 'false');
    const headingId = uid('heading');
    const heading = el('h4', undefined, exportCardHeading(current.review?.target ?? null, current.pendingLabel));
    heading.id = headingId;
    heading.tabIndex = -1;
    section.setAttribute('aria-labelledby', headingId);
    section.append(heading);
    if (current.review?.savedForExport === true) section.append(el('p', 'field-note export-saved-line', exportSavedRevisionLine(current.review.target.revisionLabel)));
    section.append(el('p', 'export-local-line', EXPORT_LOCAL_LINE));
    // A report carries no mark, so it has no 含批注, 含修改建议 or 含备注 to choose (Issue #500, S64b part 2).
    section.append(renderFormats(current, busy));
    if (current.target.kind !== 'report') section.append(renderOptions(current, busy));
    if (current.review !== null) section.append(renderFidelity(current.review));
    section.append(renderDestination(current, busy));
    const problem = el('p', 'export-problem', current.problem ?? '');
    problem.setAttribute('role', 'alert');
    problem.hidden = current.problem === null;
    section.append(problem);
    if (current.receipt !== null) section.append(renderReceipt(current.receipt));
    else section.append(renderActions(current, busy));
    if (current.review !== null) section.append(renderTechnical(current));
    section.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || working()) return;
      event.preventDefault();
      close(true);
    });
    if (card?.isConnected === true) card.replaceWith(section);
    else options.root.replaceChildren(section);
    card = section;

    const first = (): HTMLElement | null => section.querySelector<HTMLElement>('input[name="export-format"]:checked') ?? heading;
    if (focus === 'first') first()?.focus();
    else if (focus === 'approve') {
      const approveButton = section.querySelector<HTMLButtonElement>('[data-export-action="approve"]');
      (approveButton !== null && !approveButton.disabled ? approveButton : section.querySelector<HTMLElement>('[data-export-action="choose"]'))?.focus();
    } else if (focus === 'result') {
      section.querySelector<HTMLElement>('.export-receipt [data-export-action]')?.focus();
    } else if (focus === 'choose') {
      section.querySelector<HTMLElement>('[data-export-action="choose"]')?.focus();
    } else if (restore !== null) {
      const match = Array.from(section.querySelectorAll<HTMLElement>('button, input'))
        .find((candidate) => [candidate.dataset['exportAction'] ?? '', candidate.dataset['exportOption'] ?? '',
          candidate instanceof HTMLInputElement ? candidate.value : ''].join('|') === restore);
      if (match !== undefined && !((match instanceof HTMLButtonElement || match instanceof HTMLInputElement) && match.disabled)) match.focus({ preventScroll: true });
      else if (card.contains(document.activeElement) === false && busy) heading.focus({ preventScroll: true });
    }
  }

  /**
   * DOCX first and chosen, PDF optional, Markdown as the 备用格式 (EXP-001, EXP-005, EXP-006; Issue #500, S64b) — under a
   * secondary disclosure of its own, open only once the editor opens it or chose it. Choosing another reviews again —
   * each format has its own review (EXP-007) — and a review in flight never locks the choice.
   */
  function renderFormats(current: CardState, busy: boolean): HTMLElement {
    const formats = el('fieldset', 'export-formats');
    formats.append(el('legend', undefined, EXPORT_FORMAT_LEGEND));
    const offered = current.review?.formats ?? [];
    const fallback = el('details', 'export-fallback-formats');
    fallback.append(el('summary', undefined, EXPORT_FALLBACK_FORMATS));
    fallback.open = offered.some((format) => format.fallback && format.format === current.format);
    for (const format of offered) {
      const option = el('label', 'export-format-option');
      option.dataset['exportFormat'] = format.format;
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'export-format';
      radio.value = format.format;
      radio.checked = format.format === current.format;
      radio.disabled = !format.available || (busy && current.phase !== 'reviewing') || current.receipt !== null;
      radio.addEventListener('change', () => {
        if (state !== current || working() || !radio.checked) return;
        current.format = format.format;
        review('keep');
      });
      const words = el('span', 'export-format-text');
      words.append(el('strong', undefined, format.label), el('small', 'field-note', format.note));
      option.append(radio, words);
      (format.fallback ? fallback : formats).append(option);
    }
    if (fallback.children.length > 1) formats.append(fallback);
    if (current.review !== null) formats.append(el('p', 'field-note export-format-line', current.review.formatLine));
    return formats;
  }

  /** 含批注 and 含修改建议（作为修订） on, 含备注 off (EXP-023, EXP-024); changing one reviews again. */
  function renderOptions(current: CardState, busy: boolean): HTMLElement {
    const fieldset = el('fieldset', 'export-options');
    fieldset.append(el('legend', undefined, EXPORT_OPTIONS_LEGEND));
    for (const key of EXPORT_OPTION_ORDER) {
      const option = el('label', 'export-option');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = current.options[key];
      // A review in flight never locks the switches: a newer choice supersedes it, and focus stays where it was.
      box.disabled = (busy && current.phase !== 'reviewing') || current.receipt !== null;
      box.dataset['exportOption'] = key;
      const note = el('small', 'field-note', exportOptionNote(key, current.format));
      note.id = uid(`${key}-note`);
      box.setAttribute('aria-describedby', note.id);
      box.addEventListener('change', () => {
        if (state !== current || working()) return;
        current.options = { ...current.options, [key]: box.checked };
        review('keep');
      });
      const words = el('span', 'export-option-text');
      words.append(el('strong', undefined, EXPORT_OPTION_LABELS[key]), note);
      option.append(box, words);
      fieldset.append(option);
    }
    fieldset.append(el('p', 'field-note', EXPORT_OPTIONS_NOTE));
    return fieldset;
  }

  function renderFidelityRow(row: ExportFidelityRowProjection): HTMLElement {
    const item = el('li', 'export-fidelity-row');
    item.dataset['exportFidelity'] = row.key;
    item.dataset['exportStatus'] = row.status;
    item.dataset['exportCount'] = String(row.count);
    const name = el('span', 'export-fidelity-name', row.label);
    name.append(el('span', 'count', exportCountText(row.count)));
    const pill = el('span', `status-pill export-status-${row.status}`, exportPillText(row));
    const detail = el('p', 'export-fidelity-detail', row.detail);
    const positions = exportPositionsLine(row);
    if (positions !== null) detail.append(el('span', 'export-fidelity-positions', positions));
    item.append(name, pill, detail);
    return item;
  }

  /** V2-UX-EXP-007: every applicable class; one kept and found nowhere is summarized on one line. */
  function renderFidelity(reviewed: ManuscriptExportReviewProjection): HTMLElement {
    const section = el('section', 'export-fidelity');
    section.dataset['exportDegraded'] = reviewed.degraded ? 'true' : 'false';
    section.dataset['exportRestoration'] = reviewed.restoration;
    section.append(el('h5', undefined, EXPORT_FIDELITY_HEADING), el('p', 'export-restoration-line', reviewed.restorationLine));
    const list = el('ol', 'export-fidelity-list');
    for (const row of exportShownRows(reviewed.fidelity)) list.append(renderFidelityRow(row));
    section.append(list);
    const absent = exportAbsentLine(reviewed.fidelity);
    if (absent !== null) section.append(el('p', 'field-note export-absent-line', absent));
    if (reviewed.degraded) section.append(el('p', 'export-degraded-note attention-note', EXPORT_DEGRADED_NOTE));
    return section;
  }

  /** The destination is chosen only through the system dialog; a name already there is the dialog's to ask about. */
  function renderDestination(current: CardState, busy: boolean): HTMLElement {
    const section = el('section', 'export-destination');
    section.append(el('h5', undefined, EXPORT_DESTINATION_HEADING));
    const line = el('p', 'export-destination-line', current.preparation === null ? EXPORT_DESTINATION_UNCHOSEN : exportDestinationLine(current.preparation));
    section.dataset['exportDestination'] = current.preparation === null ? 'unchosen' : current.preparation.disposition;
    section.append(line);
    if (current.receipt === null) {
      const chooseButton = actionButton(current.preparation === null ? 'choose' : 'chooseAgain', 'secondary', () => void choose());
      chooseButton.dataset['exportAction'] = 'choose';
      chooseButton.disabled = busy || current.review === null;
      section.append(chooseButton);
    }
    return section;
  }

  /** `按上述方式导出` is never preselected and waits for the destination, with its reason in words (EXP-010). */
  function renderActions(current: CardState, busy: boolean): HTMLElement {
    const row = el('div', 'button-row export-actions');
    const approveButton = actionButton('approve', 'primary', () => void approve());
    const reason = el('p', 'field-note export-approve-reason', EXPORT_APPROVE_REASON);
    reason.id = uid('approve-reason');
    reason.hidden = current.preparation !== null;
    approveButton.disabled = busy || current.preparation === null || current.review === null;
    approveButton.setAttribute('aria-describedby', reason.id);
    const cancel = actionButton('cancel', 'quiet', () => close(true));
    cancel.disabled = busy;
    row.append(approveButton, cancel, reason);
    if (current.review?.degraded === true && current.preparation !== null) row.dataset['exportAcceptsDegradation'] = 'true';
    return row;
  }

  /** `已导出到所选位置` with its receipt, or the outcome the service classified — never retried from here. */
  function renderReceipt(receipt: ManuscriptExportReceiptProjection): HTMLElement {
    const result = el('div', 'export-receipt');
    result.dataset['exportOutcome'] = receipt.outcome;
    result.setAttribute('role', 'status');
    result.append(
      el('strong', 'export-outcome', receipt.outcomeLabel),
      el('p', 'export-outcome-detail', receipt.detail),
      el('p', 'export-receipt-meta', exportReceiptMeta(receipt, receipt.recordedAt === null ? null : localInstantLabel(receipt.recordedAt))),
    );
    const row = el('div', 'button-row');
    if (receipt.revealAvailable) row.append(actionButton('reveal', 'secondary', () => void reveal()));
    row.append(actionButton('close', 'quiet', () => close(false)));
    result.append(row);
    return result;
  }

  function renderTechnical(current: CardState): HTMLElement {
    const reviewed = current.review!;
    const report = reviewed.target.report;
    const rows: HTMLElement[] = [
      ...(report === null
        ? [
          ...fact(EXPORT_TECHNICAL_TERMS.revision, `${reviewed.target.revisionLabel} · ${reviewed.target.revisionId}`),
          ...fact(EXPORT_TECHNICAL_TERMS.revisionDigest, reviewed.technical.revisionDigest),
          ...fact(EXPORT_TECHNICAL_TERMS.sourceVersion, reviewed.technical.sourceVersionId ?? '—'),
        ]
        : [
          ...fact(EXPORT_TECHNICAL_TERMS.report, `第 ${report.version} 版 · ${report.reportId}`),
          ...fact(EXPORT_TECHNICAL_TERMS.reportDigest, reviewed.technical.revisionDigest),
          ...fact(EXPORT_TECHNICAL_TERMS.revision, `${reviewed.target.revisionLabel} · ${reviewed.target.revisionId}`),
        ]),
      ...fact(EXPORT_TECHNICAL_TERMS.writer, reviewed.technical.writerIdentity),
      ...fact(EXPORT_TECHNICAL_TERMS.input, reviewed.technical.inputDigest),
      ...fact(EXPORT_TECHNICAL_TERMS.review, reviewed.reviewDigest),
    ];
    const preparation = current.preparation;
    if (preparation !== null) {
      rows.push(
        ...fact(EXPORT_TECHNICAL_TERMS.preparation, preparation.preparationId),
        ...fact(EXPORT_TECHNICAL_TERMS.intent, preparation.technical.effectIntentId),
        ...fact(EXPORT_TECHNICAL_TERMS.payload, preparation.technical.payloadDigest),
        ...fact(EXPORT_TECHNICAL_TERMS.policy, preparation.technical.policy),
        ...fact(EXPORT_TECHNICAL_TERMS.record, preparation.technical.recordDigest),
      );
    }
    const receipt = current.receipt;
    if (receipt !== null) {
      rows.push(
        ...fact(EXPORT_TECHNICAL_TERMS.approval, receipt.technical.approvalId),
        ...fact(EXPORT_TECHNICAL_TERMS.receipt, receipt.technical.receiptId ?? '—'),
        ...fact(EXPORT_TECHNICAL_TERMS.receiptDigest, receipt.technical.receiptDigest ?? '—'),
        ...fact(EXPORT_TECHNICAL_TERMS.fileSha256, receipt.technical.fileSha256 ?? '—'),
        ...fact(EXPORT_TECHNICAL_TERMS.failure, receipt.technical.failureCode ?? '—'),
      );
    }
    return options.technicalDetails('deliverables-facts', ...rows);
  }

  return {
    open(target, label, opener) {
      if (destroyed || working()) return;
      state = {
        target,
        pendingLabel: target.kind === 'current' ? { kind: 'current' } : { kind: target.kind, label: label ?? '' },
        format: 'docx',
        options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
        review: null,
        preparation: null,
        receipt: null,
        phase: 'reviewing',
        problem: null,
        opener,
      };
      review('first');
    },
    busy: () => working(),
    close() {
      if (state === null || working()) return;
      state = null;
      ticket += 1;
      card = null;
      options.root.replaceChildren();
    },
    destroy() {
      destroyed = true;
      ticket += 1;
    },
  };
}
