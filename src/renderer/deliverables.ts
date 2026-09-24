import {
  MAX_PUBLICATION_BASIS_CHARACTERS,
  MAX_PUBLICATION_SCOPE_CHARACTERS,
  type DeliverablesProjection,
  type MilestoneListItemProjection,
  type PublicationVersionProjection,
  type RendererApi,
} from '../shared/protocol.js';
import {
  DELIVERABLES_LEDE,
  DELIVERABLES_PUBLICATION_HEADING,
  DELIVERABLES_SECTION_LABEL,
  DELIVERABLES_STATUS_LINES,
  DELIVERABLES_TECHNICAL_TERMS,
  DELIVERABLES_UNAVAILABLE,
  MILESTONE_LIST_EMPTY,
  MILESTONE_LIST_HEADING,
  PUBLICATION_ACTION_LABELS,
  PUBLICATION_ACTOR,
  PUBLICATION_BASIS_HINT,
  PUBLICATION_BASIS_LABEL,
  PUBLICATION_CURRENT_MARK,
  PUBLICATION_FORM_HEADING,
  PUBLICATION_HISTORY_EMPTY,
  PUBLICATION_HISTORY_HEADING,
  PUBLICATION_MILESTONE_LEGEND,
  PUBLICATION_SCOPE_HINT,
  PUBLICATION_SCOPE_LABEL,
  PUBLICATION_SUMMARY_TERMS,
  PUBLICATION_SUMMARY_TIME,
  PUBLICATION_SUMMARY_UNCHOSEN,
  deliverablesManuscriptLine,
  milestoneLabelText,
  milestoneMetaLine,
  milestoneNoteLine,
  milestoneRelationLine,
  milestonesTruncatedLine,
  publicationActualsPromptLine,
  publicationBasisLine,
  publicationChangeNoticeDetail,
  publicationCountLine,
  publicationDesignateBlockers,
  publicationDesignateReason,
  publicationEventsLine,
  publicationFieldProblem,
  publicationMilestoneOptionLine,
  publicationRecordedLine,
  publicationScopeLine,
  publicationStateOf,
  publicationSummaryManuscript,
  publicationSummaryMilestone,
  publicationVersionHeading,
  publicationsTruncatedLine,
} from './deliverables-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { EXPORT_ACTION_LABELS, EXPORT_RECORDS_HEADING, EXPORT_TECHNICAL_TERMS, exportOpenAccessibleName, exportRecordLine } from './manuscript-export-labels.js';
import { mountManuscriptExport } from './manuscript-export.js';

/**
 * ⑥ 交付物 as far as plan slice S65 reaches (Issue #414; editor-surfaces §9, V2-UX-MILE-008, PUB-002 to
 * PUB-009): the 发稿 · 稿件 block. It lists the primary Manuscript's Milestone Versions — none final and
 * none preselected — the Book's designations newest first, the Publication Version Change Notice and the
 * pending 录入定价与首印 line, and offers 设为发稿版本… as an inline form that states, before the editor
 * confirms, exactly what will be recorded and the fixed sentence 「仅表示此版本可用于上述发稿范围；AI7 不会
 * 发布或发送」. Production Documents and the 图书交付包 are later slices' and are not shown here.
 *
 * Everything reads the service's projection: a mark, a notice and every count come from the records, and
 * the answer of 设为发稿版本 carries the 交付物 as they stand after it. Nothing here exports, sends or
 * publishes anything.
 */
export interface DeliverablesSurface {
  /** Read 交付物 for the first time; called once the destination is on screen. */
  start(): void;
  /** Let nothing still in flight paint again: the screen is being replaced. */
  destroy(): void;
}

type DeliverablesApi = Pick<RendererApi, 'inspectDeliverables' | 'designatePublicationVersion' | 'reviewManuscriptExport' |
  'chooseManuscriptExportDestination' | 'approveManuscriptExport' | 'revealManuscriptExport'>;

export interface MountDeliverablesOptions {
  /** The destination's panel: the surface appends its heading and its host, and the caller its persistent actions after them. */
  root: HTMLElement;
  bookId: string;
  bookTitle: string;
  api: DeliverablesApi;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
}

/** 设为发稿版本's inline form while it is open: what the editor has chosen and written so far. */
interface DesignateForm {
  milestoneId: string | null;
  scope: string;
  basis: string;
  /** The service's refusal of the last attempt, until the editor changes something. */
  problem: string | null;
}

/** Where focus goes once the block is drawn again: nowhere new, the opener, the form, or its confirm. */
type FocusTarget = 'keep' | 'designate' | 'form' | 'confirm';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `deliverables-${prefix}-${identities}`;
}

/** One row of a technical layer: a label and an exact value, never shortened. */
function fact(term: string, value: string): HTMLElement[] {
  return [el('dt', undefined, term), el('dd', 'technical-identity', value)];
}

/** A control's identity across a redraw: what it does, the field or choice it is, and the record it belongs to. */
function focusKeyOf(node: HTMLElement): string {
  return [
    node.tagName,
    node.dataset['publicationAction'] ?? '',
    node.dataset['publicationField'] ?? '',
    node.dataset['exportAction'] ?? '',
    node instanceof HTMLInputElement && node.type === 'radio' ? node.value : '',
    node.closest<HTMLElement>('ol.milestone-list > li')?.dataset['milestoneId'] ?? '',
    node.closest<HTMLElement>('ol.publication-versions > li')?.dataset['publicationVersionId'] ?? '',
  ].join('|');
}

export function mountDeliverables(options: MountDeliverablesOptions): DeliverablesSurface {
  const { api, bookId } = options;
  let destroyed = false;
  let generation = 0;
  let projection: DeliverablesProjection | null = null;
  let working = false;
  let form: DesignateForm | null = null;
  let block: HTMLElement | undefined;

  const host = el('div', 'deliverables-host');
  host.dataset['deliverablesBookId'] = bookId;
  // The 发稿 block is drawn again on every read; the export card (Issue #413) keeps its own slot beside it, so an
  // export in progress is never redrawn away.
  const blockSlot = el('div', 'deliverables-block-slot');
  const exportSlot = el('div', 'deliverables-export-slot');
  host.append(blockSlot, exportSlot);
  options.root.append(
    el('p', 'section-label', DELIVERABLES_SECTION_LABEL),
    el('h2', undefined, options.bookTitle),
    el('p', 'lede', DELIVERABLES_LEDE),
    host,
  );
  const exporter = mountManuscriptExport({
    root: exportSlot,
    bookId,
    api,
    technicalDetails: options.technicalDetails,
    setStatus: options.setStatus,
    errorMessage: options.errorMessage,
    onChanged: () => refresh(),
    openerOf: (target) => block?.querySelector<HTMLElement>(target.kind === 'current'
      ? '[data-export-action="open"][data-export-target="current"]'
      : `ol.milestone-list > li[data-milestone-id="${CSS.escape(target.milestoneId)}"] [data-export-action="open"]`) ?? null,
  });

  // ---- reading --------------------------------------------------------------------------------------

  /**
   * Read 交付物 again and paint it. Every read has a ticket: an answer that comes back after a newer read
   * or a designation began, after the destination was left, or for another Book never paints.
   */
  function refresh(): void {
    if (destroyed) return;
    const ticket = ++generation;
    void api.inspectDeliverables().then(
      (next) => {
        if (destroyed || ticket !== generation || !host.isConnected || next.bookId !== bookId) return;
        projection = next;
        render('keep');
      },
      (error) => {
        if (destroyed || ticket !== generation || !host.isConnected) return;
        if (projection === null) renderUnavailable(error);
        else options.setStatus(options.errorMessage(error, DELIVERABLES_STATUS_LINES.refreshFailed), 'error');
      },
    );
  }

  function swap(next: HTMLElement): void {
    if (block?.isConnected === true) block.replaceWith(next);
    else blockSlot.replaceChildren(next);
    block = next;
  }

  function renderUnavailable(error: unknown): void {
    const unavailable = el('section', 'deliverables-publication attention-note');
    unavailable.dataset['publicationState'] = 'unavailable';
    unavailable.append(el('h3', undefined, DELIVERABLES_PUBLICATION_HEADING), el('p', undefined, options.errorMessage(error, DELIVERABLES_UNAVAILABLE)));
    swap(unavailable);
  }

  // ---- the block ----------------------------------------------------------------------------------------

  function render(focus: FocusTarget): void {
    const next = projection;
    if (next === null || destroyed) return;
    const publication = next.publication;
    // The form never outlives what it offers: without 设为发稿版本 it closes, and a milestone no longer
    // listed is chosen again rather than carried forward unseen.
    if (form !== null && !publication.designate.available) form = null;
    if (form !== null && form.milestoneId !== null && !publication.milestones.some((item) => item.milestoneId === form!.milestoneId)) {
      form.milestoneId = null;
    }
    const active = document.activeElement;
    const restore = focus === 'keep' && active instanceof HTMLElement && block?.contains(active) === true
      ? {
          key: focusKeyOf(active),
          selection: active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
            ? [active.selectionStart, active.selectionEnd] as const
            : null,
        }
      : null;

    const section = el('section', 'deliverables-publication');
    section.dataset['publicationState'] = publicationStateOf(next);
    section.dataset['milestoneCount'] = String(publication.milestones.length);
    section.dataset['designationCount'] = String(publication.designations.length);
    section.dataset['changeNotice'] = publication.changeNotice === null ? 'false' : 'true';
    const headingId = uid('heading');
    const heading = el('h3', undefined, DELIVERABLES_PUBLICATION_HEADING);
    heading.id = headingId;
    section.setAttribute('aria-labelledby', headingId);
    section.append(heading, el('p', 'field-note deliverables-manuscript-line', deliverablesManuscriptLine(next.manuscript)));
    // 导出… of the current revision (Issue #413): a dirty working state is saved as a revision for it first.
    if (next.manuscript !== null) {
      const row = el('div', 'button-row export-open-row');
      row.append(exportOpenButton({ kind: 'current' }, null));
      section.append(row);
    }
    if (publication.changeNotice !== null) {
      const notice = el('p', 'publication-change-notice attention-note');
      notice.dataset['publicationVersionId'] = publication.changeNotice.publicationVersionId;
      notice.append(el('strong', undefined, publication.changeNotice.label), ` · ${publicationChangeNoticeDetail(publication.changeNotice)}`);
      section.append(notice);
    }
    section.append(renderMilestones(next), renderDesignate(next), renderHistory(next), renderExports(next));
    if (publication.actualsPrompt !== null) {
      // Recorded with the designation and pending until the evaluation features take it up: no action yet.
      const prompt = el('p', 'publication-actuals-prompt', publicationActualsPromptLine(publication.actualsPrompt));
      prompt.dataset['publicationVersionId'] = publication.actualsPrompt.publicationVersionId;
      section.append(prompt);
    }
    if (next.manuscript !== null) {
      const manuscript = next.manuscript;
      section.append(options.technicalDetails(
        'deliverables-facts',
        ...fact(DELIVERABLES_TECHNICAL_TERMS.book, next.bookId),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.manuscript, manuscript.manuscriptId),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.branch, manuscript.branchId),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.revision, `${manuscript.revisionLabel} · ${manuscript.revisionId}`),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.journal, String(manuscript.journalSequence)),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.workingDigest, manuscript.workingDigest),
      ));
    }
    swap(section);

    // The form's first stop is the milestone already chosen, or the first choice when none is.
    const firstChoice = (): HTMLElement | null =>
      section.querySelector<HTMLElement>('form.publication-designate input[name="publication-milestone"]:checked') ??
      section.querySelector<HTMLElement>('form.publication-designate input[name="publication-milestone"]');
    if (focus === 'designate') {
      section.querySelector<HTMLElement>('[data-publication-action="designate"]')?.focus();
    } else if (focus === 'form') {
      firstChoice()?.focus();
    } else if (focus === 'confirm') {
      const confirm = section.querySelector<HTMLButtonElement>('[data-publication-action="confirm"]');
      (confirm !== null && !confirm.disabled ? confirm : firstChoice())?.focus();
    } else if (restore !== null) {
      const match = Array.from(section.querySelectorAll<HTMLElement>('button, input, textarea, summary'))
        .find((candidate) => focusKeyOf(candidate) === restore.key);
      if (match !== undefined && !((match instanceof HTMLButtonElement || match instanceof HTMLInputElement || match instanceof HTMLTextAreaElement) && match.disabled)) {
        match.focus({ preventScroll: true });
        if ((match instanceof HTMLInputElement || match instanceof HTMLTextAreaElement) && restore.selection !== null && match.type !== 'radio') {
          match.setSelectionRange(restore.selection[0], restore.selection[1]);
        }
      }
    }
  }

  /** V2-UX-MILE-008: label, purpose, exact version, author and time, note, and whether the manuscript changed since. */
  function renderMilestones(next: DeliverablesProjection): HTMLElement {
    const section = el('section', 'milestone-list-section');
    section.append(el('h4', undefined, MILESTONE_LIST_HEADING));
    const milestones = next.publication.milestones;
    if (milestones.length === 0) {
      section.append(el('p', 'field-note milestone-list-empty', MILESTONE_LIST_EMPTY));
      return section;
    }
    const list = el('ol', 'milestone-list');
    for (const milestone of milestones) list.append(renderMilestone(milestone));
    section.append(list);
    if (next.publication.milestonesTruncated) section.append(el('p', 'field-note', milestonesTruncatedLine(milestones.length)));
    return section;
  }

  function renderMilestone(milestone: MilestoneListItemProjection): HTMLElement {
    const item = el('li');
    item.dataset['milestoneId'] = milestone.milestoneId;
    item.dataset['purposeKind'] = milestone.purposeKind;
    item.dataset['revisionLabel'] = milestone.revisionLabel;
    item.dataset['changedSince'] = String(milestone.changedSince);
    // Only the milestone the current 发稿版本 designates is marked; nothing marks one final or latest (MILE-006).
    item.dataset['publicationCurrent'] = String(milestone.designation !== null);
    const heading = el('div', 'milestone-heading');
    heading.append(el('strong', 'milestone-label', milestoneLabelText(milestone.label)));
    if (milestone.designation !== null) heading.append(el('span', 'publication-version-mark', milestone.designation.label));
    item.append(heading, el('p', 'milestone-meta', milestoneMetaLine(milestone, localInstantLabel(milestone.createdAt))));
    if (milestone.note !== null) item.append(el('p', 'milestone-note', milestoneNoteLine(milestone.note)));
    if (milestone.changedSinceLabel !== null) item.append(el('p', 'milestone-changed-since', milestone.changedSinceLabel));
    const exportRow = el('div', 'button-row export-open-row');
    exportRow.append(exportOpenButton({ kind: 'milestone', milestoneId: milestone.milestoneId }, milestone.label));
    item.append(exportRow);
    item.append(options.technicalDetails(
      'deliverables-facts',
      ...fact(DELIVERABLES_TECHNICAL_TERMS.milestone, milestone.milestoneId),
      ...fact(DELIVERABLES_TECHNICAL_TERMS.revision, `${milestone.revisionLabel} · ${milestone.revisionId}`),
      ...fact(DELIVERABLES_TECHNICAL_TERMS.milestoneRecord, milestone.technical.signoffRecordId),
      ...fact(DELIVERABLES_TECHNICAL_TERMS.savedAt, milestone.createdAt),
    ));
    return item;
  }

  /** Every designation newest first (PUB-003, PUB-007): append-only, the newest current, the older ones as they were. */
  function renderHistory(next: DeliverablesProjection): HTMLElement {
    const section = el('section', 'publication-versions-section');
    section.append(el('h4', undefined, PUBLICATION_HISTORY_HEADING));
    const designations = next.publication.designations;
    if (designations.length === 0) {
      section.append(el('p', 'field-note publication-versions-empty', PUBLICATION_HISTORY_EMPTY));
      return section;
    }
    const list = el('ol', 'publication-versions');
    for (const designation of designations) list.append(renderDesignation(designation));
    section.append(list);
    if (next.publication.designationsTruncated) section.append(el('p', 'field-note', publicationsTruncatedLine(designations.length)));
    return section;
  }

  function renderDesignation(designation: PublicationVersionProjection): HTMLElement {
    const item = el('li');
    item.dataset['publicationVersionId'] = designation.publicationVersionId;
    item.dataset['publicationOrdinal'] = String(designation.ordinal);
    item.dataset['publicationCurrent'] = String(designation.current);
    item.dataset['designatedMilestoneId'] = designation.milestoneId;
    const heading = el('div', 'publication-version-heading');
    heading.append(el('strong', 'publication-version-title', publicationVersionHeading(designation)));
    if (designation.current) heading.append(el('span', 'publication-current-mark', PUBLICATION_CURRENT_MARK));
    item.append(
      heading,
      el('p', 'publication-scope', publicationScopeLine(designation.scope)),
      el('p', 'publication-basis', publicationBasisLine(designation.basis)),
      el('p', 'publication-recorded', publicationRecordedLine(designation.actor, localInstantLabel(designation.createdAt))),
      options.technicalDetails(
        'deliverables-facts',
        ...fact(DELIVERABLES_TECHNICAL_TERMS.publicationVersion, designation.publicationVersionId),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.milestone, designation.milestoneId),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.revision, `${designation.revisionLabel} · ${designation.revisionId}`),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.revisionDigest, designation.technical.revisionDigest),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.recordDigest, designation.technical.digest),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.permission, designation.technical.permissionId),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.events, publicationEventsLine(designation.technical.events)),
        ...fact(DELIVERABLES_TECHNICAL_TERMS.recordedAt, designation.createdAt),
      ),
    );
    return item;
  }

  // ---- 设为发稿版本 ---------------------------------------------------------------------------------------

  /** The action, disabled with its reason in words when there is nothing to designate (PUB-002), and its form. */
  function renderDesignate(next: DeliverablesProjection): HTMLElement {
    const area = el('div', 'publication-designate-area');
    const row = el('div', 'button-row publication-designate-row');
    const open = el('button', 'secondary', PUBLICATION_ACTION_LABELS.designate);
    open.type = 'button';
    open.dataset['publicationAction'] = 'designate';
    row.append(open);
    area.append(row);
    const availability = next.publication.designate;
    if (!availability.available) {
      open.disabled = true;
      const why = el('p', 'field-note publication-unavailable-reason', availability.unavailableReason ?? '');
      why.id = uid('designate-reason');
      open.setAttribute('aria-describedby', why.id);
      row.append(why);
      return area;
    }
    open.disabled = working;
    open.setAttribute('aria-expanded', form === null ? 'false' : 'true');
    open.addEventListener('click', () => openForm());
    if (form !== null) {
      const node = renderForm(next, form);
      node.id = uid('form');
      open.setAttribute('aria-controls', node.id);
      area.append(node);
    }
    return area;
  }

  /**
   * The compact form (PUB-002, PUB-004): the milestones as choices with none preselected, what will be
   * recorded — Book, Deliverable, milestone and version, its relation to the current manuscript, actor and
   * time — 发稿范围 and 依据, and the fixed sentence beside the action. Confirm stays unavailable, with its
   * reason in words, until a milestone is chosen and both fields hold what the service will record: their
   * bounds count characters as the service does, never the UTF-16 units an HTML `maxLength` would.
   */
  function renderForm(next: DeliverablesProjection, state: DesignateForm): HTMLFormElement {
    const node = el('form', 'publication-designate');
    node.noValidate = true;
    const titleId = uid('form-title');
    const title = el('h4', undefined, PUBLICATION_FORM_HEADING);
    title.id = titleId;
    node.setAttribute('aria-labelledby', titleId);

    const choices = el('fieldset', 'publication-milestone-options');
    choices.append(el('legend', undefined, PUBLICATION_MILESTONE_LEGEND));
    for (const milestone of next.publication.milestones) {
      const option = el('label', 'publication-milestone-option');
      option.dataset['milestoneId'] = milestone.milestoneId;
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'publication-milestone';
      radio.value = milestone.milestoneId;
      radio.checked = state.milestoneId === milestone.milestoneId;
      radio.disabled = working;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        state.milestoneId = milestone.milestoneId;
        state.problem = null;
        sync();
      });
      const text = el('span', 'publication-milestone-option-text');
      text.append(
        el('strong', undefined, milestoneLabelText(milestone.label)),
        el('span', 'publication-milestone-option-meta', publicationMilestoneOptionLine(milestone, localInstantLabel(milestone.createdAt))),
      );
      if (milestone.changedSinceLabel !== null) text.append(el('span', 'milestone-changed-since', milestone.changedSinceLabel));
      option.append(radio, text);
      choices.append(option);
    }

    const summary = el('dl', 'publication-designate-summary');
    const milestoneValue = el('dd');
    const relationValue = el('dd');
    summary.append(
      el('dt', undefined, PUBLICATION_SUMMARY_TERMS[0]), el('dd', undefined, next.bookTitle),
      el('dt', undefined, PUBLICATION_SUMMARY_TERMS[1]), el('dd', undefined, next.manuscript === null ? '—' : publicationSummaryManuscript(next.manuscript)),
      el('dt', undefined, PUBLICATION_SUMMARY_TERMS[2]), milestoneValue,
      el('dt', undefined, PUBLICATION_SUMMARY_TERMS[3]), relationValue,
      el('dt', undefined, PUBLICATION_SUMMARY_TERMS[4]), el('dd', undefined, PUBLICATION_ACTOR),
      el('dt', undefined, PUBLICATION_SUMMARY_TERMS[5]), el('dd', undefined, PUBLICATION_SUMMARY_TIME),
    );

    const field = (name: 'scope' | 'basis', label: '发稿范围' | '依据', hint: string, value: string, update: (text: string) => void) => {
      const wrap = el('label', 'publication-field');
      wrap.append(el('span', 'publication-field-label', label));
      const input = name === 'scope' ? el('input') : el('textarea');
      if (input instanceof HTMLInputElement) {
        input.type = 'text';
        input.autocomplete = 'off';
      } else {
        input.rows = 3;
      }
      input.value = value;
      input.required = true;
      input.disabled = working;
      input.dataset['publicationField'] = name;
      const note = el('small', 'field-note', hint);
      note.id = uid(`${name}-hint`);
      const count = el('small', 'field-note publication-field-count');
      count.id = uid(`${name}-count`);
      const problem = el('p', 'publication-field-problem');
      problem.id = uid(`${name}-problem`);
      input.setAttribute('aria-describedby', `${note.id} ${count.id} ${problem.id}`);
      input.addEventListener('input', () => {
        update(input.value);
        state.problem = null;
        sync();
      });
      wrap.append(input, note, count, problem);
      return { wrap, input, count, problem };
    };
    const scope = field('scope', PUBLICATION_SCOPE_LABEL, PUBLICATION_SCOPE_HINT, state.scope, (text) => { state.scope = text; });
    const basis = field('basis', PUBLICATION_BASIS_LABEL, PUBLICATION_BASIS_HINT, state.basis, (text) => { state.basis = text; });

    // The fixed sentence stands beside the exact action and is on screen whenever the form is (PUB-004).
    const statement = el('p', 'publication-statement', next.publication.statement);
    statement.id = uid('statement');
    const problem = el('p', 'publication-problem');
    problem.setAttribute('role', 'alert');
    const reason = el('p', 'field-note publication-confirm-reason');
    reason.id = uid('confirm-reason');
    const confirm = el('button', 'primary', PUBLICATION_ACTION_LABELS.confirm);
    confirm.type = 'button';
    confirm.dataset['publicationAction'] = 'confirm';
    confirm.setAttribute('aria-describedby', `${statement.id} ${reason.id}`);
    confirm.addEventListener('click', () => void confirmDesignation(state));
    const cancel = el('button', 'quiet', PUBLICATION_ACTION_LABELS.cancel);
    cancel.type = 'button';
    cancel.dataset['publicationAction'] = 'cancel';
    cancel.disabled = working;
    cancel.addEventListener('click', () => closeForm());
    const actions = el('div', 'button-row publication-designate-actions');
    actions.append(confirm, cancel, reason);
    node.append(title, choices, summary, scope.wrap, basis.wrap, statement, problem, actions);

    const sync = (): void => {
      const chosen = next.publication.milestones.find((milestone) => milestone.milestoneId === state.milestoneId) ?? null;
      milestoneValue.textContent = chosen === null ? PUBLICATION_SUMMARY_UNCHOSEN : publicationSummaryMilestone(chosen, localInstantLabel(chosen.createdAt));
      relationValue.textContent = chosen === null ? '—' : milestoneRelationLine(chosen);
      const fields = [
        [scope, PUBLICATION_SCOPE_LABEL, state.scope, MAX_PUBLICATION_SCOPE_CHARACTERS],
        [basis, PUBLICATION_BASIS_LABEL, state.basis, MAX_PUBLICATION_BASIS_CHARACTERS],
      ] as const;
      for (const [control, label, value, maximum] of fields) {
        control.count.textContent = publicationCountLine(value, maximum);
        const fieldProblem = publicationFieldProblem(label, value, maximum);
        control.problem.textContent = fieldProblem ?? '';
        control.problem.hidden = fieldProblem === null;
        control.input.setAttribute('aria-invalid', fieldProblem === null ? 'false' : 'true');
      }
      problem.textContent = state.problem ?? '';
      problem.hidden = state.problem === null;
      const why = publicationDesignateReason(publicationDesignateBlockers({ milestoneChosen: chosen !== null, scope: state.scope, basis: state.basis }));
      reason.textContent = why ?? '';
      reason.hidden = why === null;
      confirm.disabled = working || why !== null;
      node.dataset['publicationReady'] = why === null ? 'true' : 'false';
    };
    sync();
    // Nothing is designated by pressing Enter in a field: 设为发稿版本 is an authority-bearing action and is
    // taken only by its own button (V2-UX-KEY-004). The form never navigates.
    node.addEventListener('submit', (event) => event.preventDefault());
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || working) return;
      event.preventDefault();
      closeForm();
    });
    return node;
  }

  function openForm(): void {
    if (destroyed || working || projection === null || !projection.publication.designate.available) return;
    form ??= { milestoneId: null, scope: '', basis: '', problem: null };
    render('form');
  }

  function closeForm(): void {
    if (destroyed || working) return;
    form = null;
    render('designate');
  }

  /**
   * One deterministic local interaction: the service appends the designation with its linked records, or
   * — for an identical repeat of the current one — records nothing and says so. Either way its words are
   * the status line's, and the block is drawn from the 交付物 the answer carries.
   */
  async function confirmDesignation(state: DesignateForm): Promise<void> {
    if (destroyed || working || projection === null || form !== state) return;
    const milestoneId = state.milestoneId;
    const chosen = milestoneId !== null && projection.publication.milestones.some((milestone) => milestone.milestoneId === milestoneId);
    if (milestoneId === null || publicationDesignateBlockers({ milestoneChosen: chosen, scope: state.scope, basis: state.basis }).length > 0) return;
    working = true;
    // Any read still in flight is older than the answer this action will carry.
    generation += 1;
    block?.setAttribute('aria-busy', 'true');
    for (const control of block?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button, input, textarea') ?? []) {
      control.disabled = true;
    }
    options.setStatus(DELIVERABLES_STATUS_LINES.designating, 'busy');
    try {
      const result = await api.designatePublicationVersion({ milestoneId, scope: state.scope, basis: state.basis });
      if (destroyed) return;
      if (result.bookId !== bookId || result.deliverables.bookId !== bookId) throw new Error(DELIVERABLES_STATUS_LINES.designateFailed);
      working = false;
      form = null;
      projection = result.deliverables;
      render('designate');
      options.setStatus(result.completionLabel, 'success');
    } catch (error) {
      working = false;
      if (destroyed) return;
      state.problem = options.errorMessage(error, DELIVERABLES_STATUS_LINES.designateFailed);
      render('confirm');
      options.setStatus(state.problem, 'error');
    }
  }

  // ---- 导出 (Issue #413) ----------------------------------------------------------------------------------

  /** 导出… for one version: the card opens beside the block, and focus comes back here when it closes. */
  function exportOpenButton(target: { kind: 'current' } | { kind: 'milestone'; milestoneId: string }, label: string | null): HTMLButtonElement {
    const button = el('button', 'secondary', EXPORT_ACTION_LABELS.open);
    button.type = 'button';
    button.dataset['exportAction'] = 'open';
    button.dataset['exportTarget'] = target.kind;
    button.setAttribute('aria-label', exportOpenAccessibleName(target.kind === 'current' ? { kind: 'current' } : { kind: 'milestone', label: label ?? '' }));
    button.disabled = working || exporter.busy();
    button.addEventListener('click', () => {
      if (working || exporter.busy()) return;
      exporter.open(target, label, button);
    });
    return button;
  }

  /** Every approved export newest first, with what it came to (EXP-017, EXP-021); none of them is sending. */
  function renderExports(next: DeliverablesProjection): HTMLElement {
    const section = el('section', 'export-records-section');
    section.dataset['exportRecords'] = String(next.exports.length);
    section.append(el('h4', undefined, EXPORT_RECORDS_HEADING));
    if (next.exports.length === 0) return section;
    const list = el('ol', 'export-records');
    for (const record of next.exports) {
      const item = el('li');
      item.dataset['preparationId'] = record.preparationId;
      item.dataset['exportOutcome'] = record.outcome;
      item.append(
        el('p', 'export-record-line', exportRecordLine(record, record.recordedAt === null ? null : localInstantLabel(record.recordedAt))),
        el('p', 'export-record-detail', record.detail),
        options.technicalDetails(
          'deliverables-facts',
          ...fact(EXPORT_TECHNICAL_TERMS.preparation, record.preparationId),
          ...fact(EXPORT_TECHNICAL_TERMS.approval, record.technical.approvalId),
          ...fact(EXPORT_TECHNICAL_TERMS.receipt, record.technical.receiptId ?? '—'),
          ...fact(EXPORT_TECHNICAL_TERMS.fileSha256, record.technical.fileSha256 ?? '—'),
          ...fact(EXPORT_TECHNICAL_TERMS.failure, record.technical.failureCode ?? '—'),
        ),
      );
      list.append(item);
    }
    section.append(list);
    return section;
  }

  return {
    start: () => refresh(),
    destroy: () => {
      destroyed = true;
      generation += 1;
      exporter.destroy();
    },
  };
}
