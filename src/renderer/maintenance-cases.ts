import {
  MAINTENANCE_CLASSIFICATIONS,
  MAX_MAINTENANCE_ERRATA_CHARACTERS,
  MAX_MAINTENANCE_EVIDENCE_CHARACTERS,
  MAX_MAINTENANCE_REASON_CHARACTERS,
  publicationText,
  type MaintenanceCaseProjection,
  type MaintenanceCaseResultProjection,
  type MaintenanceCaseSummaryProjection,
  type MaintenanceClassification,
  type PublicationVersionProjection,
  type RendererApi,
} from '../shared/protocol.js';
import {
  MAINTENANCE_ARCHIVED,
  MAINTENANCE_CLASSIFICATION_LABELS,
  MAINTENANCE_CONSEQUENCES,
  MAINTENANCE_INTERNAL_ONLY,
  MAINTENANCE_WITHDRAWN,
} from '../shared/maintenance-wording.js';
import {
  MAINTENANCE_ACTION_LABELS,
  MAINTENANCE_BLOCKERS,
  MAINTENANCE_CASES_TRUNCATED,
  MAINTENANCE_CLASSIFICATION_LEGEND,
  MAINTENANCE_CONCLUSION_CHOICES,
  MAINTENANCE_CONCLUSION_LEGEND,
  MAINTENANCE_ERRATA_LABEL,
  MAINTENANCE_EVIDENCE_HINT,
  MAINTENANCE_EVIDENCE_LABEL,
  MAINTENANCE_HEADING,
  MAINTENANCE_NO_PROPOSALS,
  MAINTENANCE_NO_PUBLICATIONS,
  MAINTENANCE_OUTCOME_LABEL,
  MAINTENANCE_PROPOSALS_LEGEND,
  MAINTENANCE_PUBLICATIONS_LEGEND,
  MAINTENANCE_REASON_LABEL,
  MAINTENANCE_REVISIONS_TRUNCATED,
  MAINTENANCE_STATUS_LINES,
  MAINTENANCE_TECHNICAL_TERMS,
  MAINTENANCE_TIMELINE_LABEL,
  maintenanceCaseAccessibleName,
  maintenanceCaseHeading,
  maintenanceCaseLine,
  maintenanceDraftTargetLine,
  maintenanceErrataHeading,
  maintenanceEvidenceLine,
  maintenanceLinkLine,
  maintenanceReasonLine,
  maintenanceRecordAccessibleName,
  maintenanceRevisionLine,
  maintenanceStatusLine,
  maintenanceTargetLine,
  type MaintenanceAction,
} from './maintenance-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * 维护事项 on 交付物 (Issue #426, plan slice S68a; V2-UX-MAINT-001 to 011, ADR 0040): drawn inside each Publication Version
 * item of the 发稿 block. `记录维护事项…` opens a draft bound to that exact designation — the six classifications unselected,
 * each with its consequence, 原因 and 依据 — and `记录维护事项` records the case, or `取消` records nothing. A case opens in
 * place: its target, status, next step and timeline, and the steps its classification offers — 关联修改建议…,
 * 关联发稿版本…, 编写勘误… and 记录维护事项结论… — each appending one revision. 撤回 and 归档 say at every turn that they are
 * recorded inside AI7 only.
 *
 * 交付物 draws the block again on every read, so the surface keeps its own state — the draft, the open case and its step —
 * and draws from it each time; a read of the case or a step never repaints a surface that moved on.
 */
export interface MaintenanceSurface {
  /** The 维护事项 part of one designation item, from its summaries and the surface's own state. */
  render(designation: PublicationVersionProjection): HTMLElement;
  busy(): boolean;
  destroy(): void;
}

export interface MountMaintenanceOptions {
  bookId: string;
  api: Pick<RendererApi, 'inspectMaintenanceCase' | 'recordMaintenanceCase' | 'appendMaintenanceCaseRevision' | 'saveMaintenanceErrata'>;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** Read 交付物 again: a case was recorded or moved. The surface's own state survives the redraw. */
  refresh(): void;
  /** Draw 交付物 again from its last read: only the surface's own state moved. */
  redraw(): void;
}

type Panel = 'link-proposal' | 'link-publication' | 'errata' | 'conclude';

interface Draft {
  publicationVersionId: string;
  classification: MaintenanceClassification | null;
  reason: string;
  evidence: string;
  problem: string | null;
}

interface OpenCase {
  caseId: string;
  /** The designation whose item holds the case. */
  publicationVersionId: string;
  projection: MaintenanceCaseProjection | null;
  panel: Panel | null;
  choice: string | null;
  text: string;
  conclusion: 'unresolved' | 'complete' | null;
  problem: string | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `maintenance-${prefix}-${identities}`;
}

function fact(term: string, value: string): HTMLElement[] {
  return [el('dt', undefined, term), el('dd', 'technical-identity', value)];
}

/** How a designation names itself on a case: the same words the service's target line uses. */
function designationLabel(designation: PublicationVersionProjection): string {
  return `第 ${designation.ordinal} 次 · 「${designation.milestoneLabel}」 · ${designation.revisionLabel} · ${designation.scope}`;
}

export function mountMaintenance(options: MountMaintenanceOptions): MaintenanceSurface {
  const { api, bookId } = options;
  let destroyed = false;
  let working = false;
  let ticket = 0;
  let draft: Draft | null = null;
  let open: OpenCase | null = null;
  /** Where focus goes once 交付物 has drawn the surface again: a selector inside one designation's section. */
  let pendingFocus: { publicationVersionId: string; selector: string } | null = null;

  function actionButton(action: MaintenanceAction, className: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', className, MAINTENANCE_ACTION_LABELS[action]);
    button.type = 'button';
    button.dataset['maintenanceAction'] = action;
    button.addEventListener('click', onClick);
    return button;
  }

  function focusAfterDraw(section: HTMLElement, publicationVersionId: string): void {
    const pending = pendingFocus;
    if (pending === null || pending.publicationVersionId !== publicationVersionId) return;
    queueMicrotask(() => {
      if (destroyed || !section.isConnected || pendingFocus !== pending) return;
      const target = section.querySelector<HTMLElement>(pending.selector);
      if (target === null) return;
      pendingFocus = null;
      target.focus();
    });
  }

  // ---- drawing -----------------------------------------------------------------------------------------------

  function render(designation: PublicationVersionProjection): HTMLElement {
    const maintenance = designation.maintenance;
    const section = el('section', 'maintenance');
    section.dataset['publicationVersionId'] = designation.publicationVersionId;
    section.dataset['maintenanceWithdrawn'] = String(maintenance.withdrawn);
    section.dataset['maintenanceArchived'] = String(maintenance.archived);
    const heading = el('h5', undefined, MAINTENANCE_HEADING);
    heading.id = uid('heading');
    section.setAttribute('aria-labelledby', heading.id);
    section.append(heading);
    if (maintenance.withdrawn) section.append(el('p', 'attention-note maintenance-withdrawn', `${MAINTENANCE_WITHDRAWN}：${MAINTENANCE_INTERNAL_ONLY}`));
    if (maintenance.archived) section.append(el('p', 'field-note maintenance-archived', MAINTENANCE_ARCHIVED));
    if (maintenance.cases.length > 0) {
      const list = el('ol', 'maintenance-cases');
      for (const summary of maintenance.cases) list.append(renderSummary(summary, designation.publicationVersionId));
      section.append(list);
    }
    if (maintenance.total > maintenance.cases.length) section.append(el('p', 'field-note', MAINTENANCE_CASES_TRUNCATED));
    const drafting = draft !== null && draft.publicationVersionId === designation.publicationVersionId;
    const row = el('div', 'button-row compact-actions');
    const record = actionButton('record', 'secondary', () => openDraft(designation));
    record.setAttribute('aria-label', maintenanceRecordAccessibleName(designation.ordinal));
    record.setAttribute('aria-expanded', String(drafting));
    record.disabled = working;
    row.append(record);
    section.append(row);
    if (drafting) section.append(renderDraft(draft!, designation));
    focusAfterDraw(section, designation.publicationVersionId);
    return section;
  }

  function renderSummary(summary: MaintenanceCaseSummaryProjection, publicationVersionId: string): HTMLElement {
    const item = el('li');
    item.dataset['caseId'] = summary.caseId;
    item.dataset['maintenanceStatus'] = summary.status;
    item.dataset['maintenanceClassification'] = summary.classification;
    const expanded = open !== null && open.caseId === summary.caseId;
    const line = el('p', 'maintenance-case-line', maintenanceCaseLine(summary));
    const toggle = actionButton(expanded ? 'closeCase' : 'openCase', 'quiet', () => void toggleCase(summary, publicationVersionId));
    toggle.dataset['maintenanceAction'] = 'toggle-case';
    toggle.setAttribute('aria-label', maintenanceCaseAccessibleName(summary));
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.disabled = working;
    item.append(line, toggle);
    if (expanded) item.append(renderCase(open!));
    return item;
  }

  function draftBlocker(current: Draft): string | null {
    if (current.classification === null) return MAINTENANCE_BLOCKERS.classification;
    if (publicationText(current.reason, MAX_MAINTENANCE_REASON_CHARACTERS) === null) return MAINTENANCE_BLOCKERS.reason;
    if (current.evidence.trim() !== '' && publicationText(current.evidence, MAX_MAINTENANCE_EVIDENCE_CHARACTERS) === null) return MAINTENANCE_BLOCKERS.evidence;
    return null;
  }

  /** MAINT-002: the exact designation, the six classifications unselected, 原因 and 依据. */
  function renderDraft(current: Draft, designation: PublicationVersionProjection): HTMLElement {
    const form = el('form', 'maintenance-draft');
    form.noValidate = true;
    form.addEventListener('submit', (event) => event.preventDefault());
    form.append(el('p', 'field-note maintenance-draft-target', maintenanceDraftTargetLine(designationLabel(designation))));
    const choices = el('fieldset', 'maintenance-classifications');
    choices.append(el('legend', undefined, MAINTENANCE_CLASSIFICATION_LEGEND));
    const name = uid('classification');
    for (const classification of MAINTENANCE_CLASSIFICATIONS) {
      const option = el('label', 'maintenance-classification-option');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = classification;
      radio.checked = current.classification === classification;
      radio.disabled = working;
      radio.dataset['maintenanceField'] = 'classification';
      radio.addEventListener('change', () => {
        if (!radio.checked || draft !== current) return;
        current.classification = classification;
        current.problem = null;
        options.redraw();
      });
      const words = el('span', 'maintenance-classification-text');
      words.append(el('strong', undefined, MAINTENANCE_CLASSIFICATION_LABELS[classification]), el('small', 'field-note', MAINTENANCE_CONSEQUENCES[classification]));
      option.append(radio, words);
      choices.append(option);
    }
    form.append(choices);
    if (current.classification === 'withdrawal' || current.classification === 'archive') {
      form.append(el('p', 'attention-note maintenance-internal-only', MAINTENANCE_INTERNAL_ONLY));
    }
    const reason = el('textarea');
    reason.dataset['maintenanceField'] = 'reason';
    reason.value = current.reason;
    reason.rows = 2;
    reason.disabled = working;
    const evidence = el('textarea');
    evidence.dataset['maintenanceField'] = 'evidence';
    evidence.value = current.evidence;
    evidence.rows = 2;
    evidence.disabled = working;
    const hint = el('small', 'field-note', MAINTENANCE_EVIDENCE_HINT);
    hint.id = uid('evidence-hint');
    evidence.setAttribute('aria-describedby', hint.id);
    const reasonLabel = el('label', 'maintenance-field');
    reasonLabel.append(el('span', undefined, MAINTENANCE_REASON_LABEL), reason);
    const evidenceLabel = el('label', 'maintenance-field');
    evidenceLabel.append(el('span', undefined, MAINTENANCE_EVIDENCE_LABEL), evidence, hint);
    form.append(reasonLabel, evidenceLabel);
    if (current.problem !== null) {
      const alert = el('p', 'export-problem', current.problem);
      alert.setAttribute('role', 'alert');
      form.append(alert);
    }
    const row = el('div', 'button-row maintenance-actions');
    const confirm = actionButton('confirmRecord', 'primary', () => void recordCase(designation));
    const why = el('p', 'field-note maintenance-reason');
    why.id = uid('record-reason');
    confirm.setAttribute('aria-describedby', why.id);
    const cancel = actionButton('cancel', 'quiet', () => closeDraft(true));
    cancel.disabled = working;
    const sync = (): void => {
      const blocker = draftBlocker(current);
      why.textContent = blocker ?? '';
      why.hidden = blocker === null;
      confirm.disabled = working || blocker !== null;
    };
    reason.addEventListener('input', () => { current.reason = reason.value; current.problem = null; sync(); });
    evidence.addEventListener('input', () => { current.evidence = evidence.value; current.problem = null; sync(); });
    row.append(confirm, cancel, why);
    form.append(row);
    form.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || working) return;
      event.preventDefault();
      closeDraft(true);
    });
    sync();
    return form;
  }

  /** One case in place: its target, status, timeline, 勘误 and the steps it offers (MAINT-003, MAINT-010). */
  function renderCase(current: OpenCase): HTMLElement {
    const panel = el('section', 'maintenance-case');
    panel.dataset['caseId'] = current.caseId;
    const projection = current.projection;
    if (projection === null) {
      panel.setAttribute('aria-busy', 'true');
      panel.append(el('p', 'field-note', current.problem ?? MAINTENANCE_STATUS_LINES.reading));
      return panel;
    }
    panel.dataset['maintenanceStatus'] = projection.status;
    panel.dataset['expectedRevision'] = String(projection.expectedRevision);
    panel.setAttribute('aria-busy', working ? 'true' : 'false');
    const heading = el('p', 'maintenance-case-heading');
    heading.append(el('strong', undefined, maintenanceCaseHeading(projection.ordinal, projection.classificationLabel)));
    heading.tabIndex = -1;
    heading.id = uid('case-heading');
    panel.setAttribute('aria-labelledby', heading.id);
    panel.append(heading, el('p', 'field-note maintenance-consequence', projection.consequence));
    if (projection.internalOnly !== null) panel.append(el('p', 'attention-note maintenance-internal-only', projection.internalOnly));
    panel.append(
      el('p', 'maintenance-target', maintenanceTargetLine(projection.target.label)),
      el('p', 'maintenance-status-line', maintenanceStatusLine(projection.statusLabel, projection.nextStep)),
    );
    const timeline = el('ol', 'maintenance-timeline');
    timeline.setAttribute('aria-label', MAINTENANCE_TIMELINE_LABEL);
    for (const revision of projection.revisions) {
      const item = el('li');
      item.dataset['revision'] = String(revision.revision);
      item.dataset['step'] = revision.step;
      const line = el('span', 'maintenance-revision-line', maintenanceRevisionLine(revision, localInstantLabel(revision.recordedAt)));
      line.tabIndex = -1;
      item.append(line);
      if (revision.reason !== null) item.append(el('span', 'maintenance-revision-reason', maintenanceReasonLine(revision.step, revision.reason)));
      if (revision.evidence !== null) item.append(el('span', 'field-note maintenance-revision-evidence', maintenanceEvidenceLine(revision.evidence)));
      if (revision.link !== null) item.append(el('span', 'field-note maintenance-revision-link', maintenanceLinkLine(revision.link)));
      timeline.append(item);
    }
    panel.append(timeline);
    if (projection.revisionsTotal > projection.revisions.length) panel.append(el('p', 'field-note', MAINTENANCE_REVISIONS_TRUNCATED));
    if (projection.errata !== null) {
      const errata = el('div', 'maintenance-errata');
      errata.append(el('p', 'maintenance-errata-heading', maintenanceErrataHeading(projection.errata.version)), el('p', 'maintenance-errata-body', projection.errata.body));
      panel.append(errata);
    }
    if (projection.status !== 'complete') panel.append(renderSteps(current, projection));
    if (current.problem !== null) {
      const alert = el('p', 'export-problem', current.problem);
      alert.setAttribute('role', 'alert');
      panel.append(alert);
    }
    panel.append(options.technicalDetails(
      'deliverables-facts',
      ...fact(MAINTENANCE_TECHNICAL_TERMS.caseId, projection.caseId),
      ...fact(MAINTENANCE_TECHNICAL_TERMS.caseDigest, projection.technical.caseDigest),
      ...projection.revisions.flatMap((revision) => fact(`${MAINTENANCE_TECHNICAL_TERMS.revisionDigest} · 第 ${revision.revision} 条`, revision.digest)),
    ));
    panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || working || current.panel === null) return;
      event.preventDefault();
      event.stopPropagation();
      closePanel(current);
    });
    return panel;
  }

  /** The steps the classification offers, and the one being taken. */
  function renderSteps(current: OpenCase, projection: MaintenanceCaseProjection): HTMLElement {
    const area = el('div', 'maintenance-steps');
    const row = el('div', 'button-row compact-actions');
    const offer = (action: MaintenanceAction, panel: Panel): void => {
      const button = actionButton(action, current.panel === panel ? 'secondary is-active' : 'secondary', () => openPanel(current, panel));
      button.disabled = working;
      button.setAttribute('aria-expanded', String(current.panel === panel));
      row.append(button);
    };
    if (projection.classification === 'correction') offer('linkProposal', 'link-proposal');
    if (projection.classification === 'correction' || projection.classification === 'supersession' || projection.classification === 'reissue') {
      offer('linkPublication', 'link-publication');
    }
    if (projection.classification === 'errata') offer('writeErrata', 'errata');
    offer('conclude', 'conclude');
    area.append(row);
    if (current.panel !== null) area.append(renderPanel(current, projection, current.panel));
    return area;
  }

  function panelBlocker(current: OpenCase, panel: Panel): string | null {
    if (panel === 'link-proposal' || panel === 'link-publication') return current.choice === null ? MAINTENANCE_BLOCKERS.choice : null;
    if (panel === 'errata') return publicationText(current.text, MAX_MAINTENANCE_ERRATA_CHARACTERS) === null ? MAINTENANCE_BLOCKERS.errata : null;
    if (current.conclusion === null) return MAINTENANCE_BLOCKERS.conclusion;
    return publicationText(current.text, MAX_MAINTENANCE_REASON_CHARACTERS) === null ? MAINTENANCE_BLOCKERS.outcome : null;
  }

  function renderPanel(current: OpenCase, projection: MaintenanceCaseProjection, panel: Panel): HTMLElement {
    const form = el('form', 'maintenance-step');
    form.dataset['maintenanceStep'] = panel;
    form.noValidate = true;
    form.addEventListener('submit', (event) => event.preventDefault());
    const confirm = actionButton(panel === 'errata' ? 'saveErrata' : panel === 'conclude' ? 'confirmConclude' : 'confirmLink', 'primary', () => void takeStep(current, panel));
    const why = el('p', 'field-note maintenance-reason');
    why.id = uid('step-reason');
    confirm.setAttribute('aria-describedby', why.id);
    const sync = (): void => {
      const blocker = panelBlocker(current, panel);
      why.textContent = blocker ?? '';
      why.hidden = blocker === null;
      confirm.disabled = working || blocker !== null;
    };
    const radios = (legend: string, entries: ReadonlyArray<{ value: string; label: string; detail: string | null }>, chosen: string | null, pick: (value: string) => void): HTMLElement => {
      const fieldset = el('fieldset', 'maintenance-choices');
      fieldset.append(el('legend', undefined, legend));
      const name = uid('choice');
      for (const entry of entries) {
        const option = el('label', 'maintenance-choice-option');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = name;
        radio.value = entry.value;
        radio.checked = chosen === entry.value;
        radio.disabled = working;
        radio.dataset['maintenanceField'] = panel;
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          pick(entry.value);
          current.problem = null;
          sync();
        });
        const words = el('span', 'maintenance-choice-text');
        words.append(el('span', undefined, entry.label));
        if (entry.detail !== null) words.append(el('small', 'field-note', entry.detail));
        option.append(radio, words);
        fieldset.append(option);
      }
      return fieldset;
    };
    if (panel === 'link-proposal') {
      if (projection.choices.proposals.length === 0) form.append(el('p', 'field-note maintenance-no-choice', MAINTENANCE_NO_PROPOSALS));
      else form.append(radios(MAINTENANCE_PROPOSALS_LEGEND, projection.choices.proposals.map((proposal) => ({ value: proposal.markId, label: proposal.label, detail: proposal.stateLabel })),
        current.choice, (value) => { current.choice = value; }));
    } else if (panel === 'link-publication') {
      if (projection.choices.publications.length === 0) form.append(el('p', 'field-note maintenance-no-choice', MAINTENANCE_NO_PUBLICATIONS));
      else form.append(radios(MAINTENANCE_PUBLICATIONS_LEGEND, projection.choices.publications.map((publication) => ({ value: publication.publicationVersionId, label: publication.label, detail: null })),
        current.choice, (value) => { current.choice = value; }));
    } else {
      if (panel === 'conclude') {
        form.append(radios(MAINTENANCE_CONCLUSION_LEGEND, (['unresolved', 'complete'] as const).map((value) => ({ value, label: MAINTENANCE_CONCLUSION_CHOICES[value], detail: null })),
          current.conclusion, (value) => { current.conclusion = value === 'complete' ? 'complete' : 'unresolved'; }));
      }
      const area = el('textarea');
      area.dataset['maintenanceField'] = panel === 'errata' ? 'errata' : 'outcome';
      area.value = current.text;
      area.rows = panel === 'errata' ? 5 : 2;
      area.disabled = working;
      area.addEventListener('input', () => { current.text = area.value; current.problem = null; sync(); });
      const label = el('label', 'maintenance-field');
      label.append(el('span', undefined, panel === 'errata' ? MAINTENANCE_ERRATA_LABEL : MAINTENANCE_OUTCOME_LABEL), area);
      form.append(label);
    }
    const row = el('div', 'button-row maintenance-actions');
    const cancel = actionButton('cancel', 'quiet', () => closePanel(current));
    cancel.disabled = working;
    row.append(confirm, cancel, why);
    form.append(row);
    sync();
    return form;
  }

  // ---- acting -----------------------------------------------------------------------------------------------

  const caseSelector = (caseId: string, inner: string): string => `li[data-case-id="${CSS.escape(caseId)}"] ${inner}`;

  function openDraft(designation: PublicationVersionProjection): void {
    if (destroyed || working) return;
    if (draft === null || draft.publicationVersionId !== designation.publicationVersionId) {
      draft = { publicationVersionId: designation.publicationVersionId, classification: null, reason: '', evidence: '', problem: null };
    }
    pendingFocus = { publicationVersionId: designation.publicationVersionId, selector: '.maintenance-draft input[type="radio"]' };
    options.redraw();
  }

  function closeDraft(announce: boolean): void {
    if (draft === null || working) return;
    pendingFocus = { publicationVersionId: draft.publicationVersionId, selector: '[data-maintenance-action="record"]' };
    draft = null;
    options.redraw();
    if (announce) options.setStatus(MAINTENANCE_STATUS_LINES.cancelled);
  }

  async function toggleCase(summary: MaintenanceCaseSummaryProjection, publicationVersionId: string): Promise<void> {
    if (destroyed || working) return;
    if (open !== null && open.caseId === summary.caseId) {
      open = null;
      ticket += 1;
      pendingFocus = { publicationVersionId, selector: caseSelector(summary.caseId, '[data-maintenance-action="toggle-case"]') };
      options.redraw();
      return;
    }
    const current: OpenCase = { caseId: summary.caseId, publicationVersionId, projection: null, panel: null, choice: null, text: '', conclusion: null, problem: null };
    open = current;
    await read(current, caseSelector(summary.caseId, '.maintenance-case-heading'));
  }

  /** Read one case again and draw it; an answer the editor moved past never paints. */
  async function read(current: OpenCase, focus: string | null): Promise<void> {
    const request = ++ticket;
    options.redraw();
    options.setStatus(MAINTENANCE_STATUS_LINES.reading, 'busy');
    try {
      const projection = await api.inspectMaintenanceCase({ caseId: current.caseId });
      if (destroyed || open !== current || request !== ticket) return;
      if (projection.bookId !== bookId || projection.caseId !== current.caseId) throw new Error(MAINTENANCE_STATUS_LINES.readFailed);
      current.projection = projection;
      pendingFocus = focus === null ? null : { publicationVersionId: current.publicationVersionId, selector: focus };
      options.redraw();
      options.setStatus(maintenanceCaseHeading(projection.ordinal, projection.classificationLabel));
    } catch (error) {
      if (destroyed || open !== current || request !== ticket) return;
      current.problem = options.errorMessage(error, MAINTENANCE_STATUS_LINES.readFailed);
      options.redraw();
      options.setStatus(current.problem, 'error');
    }
  }

  function openPanel(current: OpenCase, panel: Panel): void {
    if (destroyed || working || open !== current || current.projection === null) return;
    current.panel = panel;
    current.choice = null;
    current.conclusion = null;
    current.problem = null;
    current.text = panel === 'errata' ? current.projection.errata?.body ?? '' : '';
    pendingFocus = {
      publicationVersionId: current.publicationVersionId,
      selector: caseSelector(current.caseId, `form[data-maintenance-step="${panel}"] input, form[data-maintenance-step="${panel}"] textarea`),
    };
    options.redraw();
  }

  function closePanel(current: OpenCase): void {
    if (working || open !== current || current.panel === null) return;
    const panel = current.panel;
    current.panel = null;
    current.problem = null;
    const action = panel === 'link-proposal' ? 'linkProposal' : panel === 'link-publication' ? 'linkPublication' : panel === 'errata' ? 'writeErrata' : 'conclude';
    pendingFocus = { publicationVersionId: current.publicationVersionId, selector: caseSelector(current.caseId, `[data-maintenance-action="${action}"]`) };
    options.redraw();
  }

  async function recordCase(designation: PublicationVersionProjection): Promise<void> {
    const current = draft;
    if (destroyed || working || current === null || current.publicationVersionId !== designation.publicationVersionId || draftBlocker(current) !== null) return;
    working = true;
    current.problem = null;
    options.redraw();
    options.setStatus(MAINTENANCE_STATUS_LINES.recording, 'busy');
    try {
      const result = await api.recordMaintenanceCase({
        publicationVersionId: current.publicationVersionId,
        classification: current.classification!,
        reason: current.reason,
        evidence: current.evidence.trim() === '' ? null : current.evidence,
      });
      if (destroyed) return;
      working = false;
      if (result.bookId !== bookId || result.maintenanceCase.target.publicationVersionId !== current.publicationVersionId) throw new Error(MAINTENANCE_STATUS_LINES.recordFailed);
      draft = null;
      settle(result);
    } catch (error) {
      working = false;
      if (destroyed) return;
      current.problem = options.errorMessage(error, MAINTENANCE_STATUS_LINES.recordFailed);
      options.redraw();
      options.setStatus(current.problem, 'error');
    }
  }

  async function takeStep(current: OpenCase, panel: Panel): Promise<void> {
    const projection = current.projection;
    if (destroyed || working || open !== current || projection === null || current.panel !== panel || panelBlocker(current, panel) !== null) return;
    working = true;
    current.problem = null;
    options.redraw();
    options.setStatus(MAINTENANCE_STATUS_LINES.stepping, 'busy');
    try {
      const result = panel === 'errata'
        ? await api.saveMaintenanceErrata({ caseId: current.caseId, expectedRevision: projection.expectedRevision, body: current.text })
        : await api.appendMaintenanceCaseRevision({
          caseId: current.caseId,
          expectedRevision: projection.expectedRevision,
          step: panel === 'link-proposal' ? { kind: 'link-proposal', markId: current.choice! }
            : panel === 'link-publication' ? { kind: 'link-publication', publicationVersionId: current.choice! }
              : { kind: 'conclude', status: current.conclusion!, outcome: current.text },
        });
      if (destroyed) return;
      working = false;
      if (result.bookId !== bookId || result.maintenanceCase.caseId !== current.caseId) throw new Error(MAINTENANCE_STATUS_LINES.stepFailed);
      settle(result);
    } catch (error) {
      working = false;
      if (destroyed || open !== current) return;
      current.problem = options.errorMessage(error, MAINTENANCE_STATUS_LINES.stepFailed);
      options.redraw();
      options.setStatus(current.problem, 'error');
    }
  }

  /** A step answered: the case stays open at its newest revision, and 交付物 is read again. */
  function settle(result: MaintenanceCaseResultProjection): void {
    const projection = result.maintenanceCase;
    const publicationVersionId = projection.target.publicationVersionId;
    open = { caseId: projection.caseId, publicationVersionId, projection, panel: null, choice: null, text: '', conclusion: null, problem: null };
    ticket += 1;
    pendingFocus = {
      publicationVersionId,
      selector: caseSelector(projection.caseId, `.maintenance-timeline > li[data-revision="${projection.expectedRevision}"] .maintenance-revision-line`),
    };
    options.setStatus(result.completion, 'success');
    options.refresh();
  }

  return {
    render,
    busy: () => working,
    destroy() {
      destroyed = true;
      ticket += 1;
    },
  };
}
