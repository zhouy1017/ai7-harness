import type { BackgroundAnalysisEnrollmentProjection, BackgroundAnalysisStartingPoint, RendererApi } from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import {
  BACKGROUND_BINDS_SUMMARY,
  BACKGROUND_CANCEL,
  BACKGROUND_CHOOSE_FIRST,
  BACKGROUND_CONFIRM,
  BACKGROUND_DISCLOSURE_HEADING,
  BACKGROUND_ENROLLED_STATUS,
  BACKGROUND_ENROLL_OPEN,
  BACKGROUND_HEADING,
  BACKGROUND_HISTORY_SUMMARY,
  BACKGROUND_LOADING,
  BACKGROUND_NOT_GRANTED_LABEL,
  BACKGROUND_REVOKED_STATUS,
  BACKGROUND_REVOKE_CONFIRM,
  BACKGROUND_REVOKE_HEADING,
  BACKGROUND_REVOKE_OPEN,
  BACKGROUND_SCOPE_LABEL,
  BACKGROUND_STARTED_HEADING,
  BACKGROUND_STARTING_POINT_LEGEND,
  BACKGROUND_UNAVAILABLE,
  BACKGROUND_WHAT_LABEL,
  BACKGROUND_WHEN_LABEL,
  backgroundEnrollmentLine,
  backgroundHistoryLine,
  backgroundNextLine,
  backgroundStartedLine,
  backgroundStartedMoreLine,
} from './background-analysis-labels.js';

/**
 * ②A's 后台分析 (Issue #95, plan slice S39; ADR 0048; V2-UX-ANALYSIS-016 to 021): the Book's Background Analysis Enrollment
 * beside its analysis — whether there is one, what it would do now and why, the Runs it started, and the two decisions it
 * offers. `登记后台分析…` opens the disclosure first, consequence before decision, with no starting point chosen for the editor;
 * `撤销登记…` says what revoking keeps. While an Enrollment is in force the block reads again every two seconds, never while the
 * editor is in one of its two forms, and tells the card beside it when a Run it started has begun.
 */
export interface MountBackgroundAnalysisOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectBackgroundAnalysisEnrollment' | 'enrollBackgroundAnalysis' | 'revokeBackgroundAnalysisEnrollment'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  /** A Run the Enrollment started has been recorded since the last read: the analysis card reads again. */
  readonly onRunStarted: () => void;
}

const FOLLOW_MS = 2_000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['backgroundAction'] = name;
  node.addEventListener('click', run);
  return node;
}

function rows(entries: ReadonlyArray<{ label: string; value: string }>): HTMLDListElement {
  const list = el('dl', 'background-analysis-rows');
  for (const entry of entries) list.append(el('dt', undefined, entry.label), el('dd', undefined, entry.value));
  return list;
}

/** Escape closes an open form unless an input method is composing (J-14). */
function onEscape(root: HTMLElement, cancel: () => void): void {
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    cancel();
  });
}

export function mountBackgroundAnalysis(options: MountBackgroundAnalysisOptions): { load(): Promise<void> } {
  const { root, api } = options;
  root.classList.add('source-card', 'background-analysis');
  root.replaceChildren(el('h3', undefined, BACKGROUND_HEADING), el('p', 'field-note', BACKGROUND_LOADING));
  let last: BackgroundAnalysisEnrollmentProjection | null = null;
  let lastJson = '';
  let engaged = false;
  let timer: number | null = null;

  const follow = (): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (last === null || last.state !== 'active') return;
    timer = window.setTimeout(() => {
      timer = null;
      if (!root.isConnected) return;
      if (engaged) {
        follow();
        return;
      }
      void load();
    }, FOLLOW_MS);
  };

  const draw = (projection: BackgroundAnalysisEnrollmentProjection): void => {
    const startedBefore = last?.startedRunCount ?? null;
    last = projection;
    const json = JSON.stringify(projection);
    if (startedBefore !== null && projection.startedRunCount > startedBefore) options.onRunStarted();
    if (json !== lastJson) {
      lastJson = json;
      render(projection);
    }
    follow();
  };

  const load = async (): Promise<void> => {
    try {
      const projection = await api.inspectBackgroundAnalysisEnrollment();
      if (!root.isConnected || projection.bookId !== root.dataset['bookId']) return;
      draw(projection);
    } catch (error) {
      if (!root.isConnected) return;
      if (last === null) root.replaceChildren(el('h3', undefined, BACKGROUND_HEADING), el('p', 'attention-note', options.errorMessage(error, BACKGROUND_UNAVAILABLE)));
      follow();
    }
  };

  const render = (projection: BackgroundAnalysisEnrollmentProjection): void => {
    root.dataset['backgroundState'] = projection.state;
    root.dataset['backgroundNext'] = projection.next.kind;
    root.dataset['backgroundStarted'] = String(projection.startedRunCount);
    const heading = el('div', 'background-analysis-heading');
    const pill = el('span', `status-pill background-analysis-state background-analysis-state-${projection.state}`, projection.stateLabel);
    heading.append(el('h3', undefined, BACKGROUND_HEADING), pill);
    const nodes: HTMLElement[] = [heading, el('p', 'field-note background-analysis-statement', projection.statement)];
    if (projection.enrollment !== null) {
      const line = el('p', 'background-analysis-enrollment', backgroundEnrollmentLine(projection.enrollment, localInstantLabel));
      line.dataset['enrollmentVersionId'] = projection.enrollment.enrollmentVersionId;
      nodes.push(line);
      const binds = el('details', 'background-analysis-binds');
      binds.append(el('summary', undefined, BACKGROUND_BINDS_SUMMARY), rows(projection.enrollment.binds));
      nodes.push(binds);
    }
    if (projection.state !== 'none') {
      const next = el('p', 'background-analysis-next', backgroundNextLine(projection.next));
      next.setAttribute('aria-live', 'polite');
      nodes.push(next);
    }
    if (projection.startedRuns.length > 0) {
      const list = el('ol', 'background-analysis-started');
      for (const run of projection.startedRuns) {
        const item = el('li', undefined, backgroundStartedLine(run, localInstantLabel));
        item.dataset['taskIntentId'] = run.taskIntentId;
        list.append(item);
      }
      nodes.push(el('h4', undefined, BACKGROUND_STARTED_HEADING), list);
      if (projection.startedRunCount > projection.startedRuns.length) {
        nodes.push(el('p', 'field-note', backgroundStartedMoreLine(projection.startedRunCount - projection.startedRuns.length)));
      }
    }
    if (projection.history.length > 0) {
      const details = el('details', 'background-analysis-history');
      const list = el('ol');
      for (const entry of projection.history) list.append(el('li', undefined, backgroundHistoryLine(entry, localInstantLabel)));
      details.append(el('summary', undefined, `${BACKGROUND_HISTORY_SUMMARY}（${projection.history.length}）`), list);
      nodes.push(details);
    }
    const actions = el('div', 'button-row background-analysis-actions');
    const form = el('div', 'background-analysis-form');
    form.hidden = true;
    if (projection.state === 'active' && projection.enrollment !== null) {
      const enrollmentId = projection.enrollment.enrollmentId;
      const open = action(BACKGROUND_REVOKE_OPEN, 'secondary', 'revoke-open', () => {
        engaged = true;
        open.setAttribute('aria-expanded', 'true');
        form.replaceChildren(...revokeForm(projection, enrollmentId, () => close(open)));
        form.hidden = false;
        form.querySelector<HTMLElement>('h4')?.focus();
      });
      open.setAttribute('aria-expanded', 'false');
      actions.append(open);
    } else {
      const open = action(BACKGROUND_ENROLL_OPEN, 'secondary', 'enroll-open', () => {
        engaged = true;
        open.setAttribute('aria-expanded', 'true');
        form.replaceChildren(...disclosure(projection, () => close(open)));
        form.hidden = false;
        form.querySelector<HTMLElement>('h4')?.focus();
      });
      open.setAttribute('aria-expanded', 'false');
      open.disabled = !projection.offer.canEnroll;
      actions.append(open);
      if (!projection.offer.canEnroll && projection.offer.reason !== null) {
        const reason = el('p', 'field-note background-analysis-unavailable', projection.offer.reason);
        reason.id = 'background-analysis-unavailable';
        open.setAttribute('aria-describedby', reason.id);
        actions.append(reason);
      }
    }
    onEscape(form, () => {
      const open = actions.querySelector<HTMLButtonElement>('button[aria-expanded="true"]');
      if (open !== null) close(open);
    });
    nodes.push(actions, form);
    root.replaceChildren(...nodes);
  };

  const close = (open: HTMLButtonElement): void => {
    engaged = false;
    open.setAttribute('aria-expanded', 'false');
    const form = root.querySelector<HTMLElement>('.background-analysis-form');
    if (form !== null) {
      form.hidden = true;
      form.replaceChildren();
    }
    open.focus();
  };

  const disclosure = (projection: BackgroundAnalysisEnrollmentProjection, cancel: () => void): HTMLElement[] => {
    const offer = projection.offer;
    const title = el('h4', undefined, BACKGROUND_DISCLOSURE_HEADING);
    title.tabIndex = -1;
    title.id = 'background-analysis-disclosure-heading';
    const what = rows([
      { label: BACKGROUND_SCOPE_LABEL, value: offer.scope },
      { label: BACKGROUND_WHAT_LABEL, value: offer.what },
      { label: BACKGROUND_WHEN_LABEL, value: offer.when },
      ...offer.binds,
    ]);
    const notGranted = el('ul', 'analysis-list background-analysis-not-granted');
    for (const entry of offer.notGranted) notGranted.append(el('li', undefined, entry));
    const fieldset = el('fieldset', 'background-analysis-starting-points');
    fieldset.append(el('legend', undefined, BACKGROUND_STARTING_POINT_LEGEND));
    let chosen: BackgroundAnalysisStartingPoint | null = null;
    const hint = el('p', 'field-note background-analysis-choose', BACKGROUND_CHOOSE_FIRST);
    hint.id = 'background-analysis-choose';
    const confirm = action(BACKGROUND_CONFIRM, 'primary', 'enroll-confirm', () => void submit());
    confirm.disabled = true;
    confirm.setAttribute('aria-describedby', hint.id);
    for (const point of offer.startingPoints) {
      const label = el('label', 'background-analysis-starting-point');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'background-analysis-starting-point';
      radio.value = point.value;
      radio.dataset['startingPoint'] = point.value;
      radio.setAttribute('aria-label', point.label);
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        chosen = point.value;
        confirm.disabled = false;
        hint.hidden = true;
        confirm.removeAttribute('aria-describedby');
      });
      label.append(radio, el('span', undefined, point.label), el('span', 'field-note', point.note));
      fieldset.append(label);
    }
    const submit = async (): Promise<void> => {
      if (chosen === null || offer.disclosureDigest === null) return;
      confirm.disabled = true;
      options.setStatus('正在登记后台分析…', 'busy');
      try {
        const projectionAfter = await api.enrollBackgroundAnalysis({ disclosureDigest: offer.disclosureDigest, startingPoint: chosen });
        engaged = false;
        options.setStatus(BACKGROUND_ENROLLED_STATUS, 'success');
        if (!root.isConnected) return;
        draw(projectionAfter);
        root.querySelector<HTMLButtonElement>('[data-background-action="revoke-open"]')?.focus();
      } catch (error) {
        confirm.disabled = false;
        options.setStatus(options.errorMessage(error, '无法登记后台分析。'), 'error');
      }
    };
    const buttons = el('div', 'button-row');
    buttons.append(confirm, action(BACKGROUND_CANCEL, 'quiet', 'enroll-cancel', cancel));
    const section = el('section', 'background-analysis-disclosure');
    section.setAttribute('aria-labelledby', title.id);
    section.append(title, what, el('h5', undefined, BACKGROUND_NOT_GRANTED_LABEL), notGranted, fieldset, hint, buttons);
    return [section];
  };

  const revokeForm = (projection: BackgroundAnalysisEnrollmentProjection, enrollmentId: string, cancel: () => void): HTMLElement[] => {
    const title = el('h4', undefined, BACKGROUND_REVOKE_HEADING);
    title.tabIndex = -1;
    title.id = 'background-analysis-revoke-heading';
    const consequences = el('ul', 'analysis-list background-analysis-revoke-consequences');
    for (const entry of projection.revoke.consequences) consequences.append(el('li', undefined, entry));
    const confirm = action(BACKGROUND_REVOKE_CONFIRM, 'primary', 'revoke-confirm', () => void submit());
    const submit = async (): Promise<void> => {
      confirm.disabled = true;
      options.setStatus('正在撤销后台分析登记…', 'busy');
      try {
        const projectionAfter = await api.revokeBackgroundAnalysisEnrollment({ enrollmentId });
        engaged = false;
        options.setStatus(BACKGROUND_REVOKED_STATUS, 'success');
        if (!root.isConnected) return;
        draw(projectionAfter);
        root.querySelector<HTMLButtonElement>('[data-background-action="enroll-open"]')?.focus();
      } catch (error) {
        confirm.disabled = false;
        options.setStatus(options.errorMessage(error, '无法撤销后台分析登记。'), 'error');
      }
    };
    const buttons = el('div', 'button-row');
    buttons.append(confirm, action(BACKGROUND_CANCEL, 'quiet', 'revoke-cancel', cancel));
    const section = el('section', 'background-analysis-revoke');
    section.setAttribute('aria-labelledby', title.id);
    section.append(title, consequences, buttons);
    return [section];
  };

  void load();
  return { load };
}
