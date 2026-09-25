import type { AnalysisFeedbackItemProjection, AnalysisFeedbackProjection, RendererApi } from '../shared/protocol.js';
import { ANALYSIS_FEEDBACK_JUDGMENTS, ANALYSIS_FEEDBACK_OTHER, type AnalysisFeedbackJudgment } from '../shared/analysis-feedback.js';
import {
  ANALYSIS_FEEDBACK_CANCEL,
  ANALYSIS_FEEDBACK_CHANGE,
  ANALYSIS_FEEDBACK_CORRECTION,
  ANALYSIS_FEEDBACK_HEADING,
  ANALYSIS_FEEDBACK_JUDGMENT_LABELS,
  ANALYSIS_FEEDBACK_JUDGMENT_LEGEND,
  ANALYSIS_FEEDBACK_METRIC_NOTE,
  ANALYSIS_FEEDBACK_OPEN,
  ANALYSIS_FEEDBACK_OTHER_TEXT,
  ANALYSIS_FEEDBACK_REASON_LEGEND,
  ANALYSIS_FEEDBACK_RECORD,
  ANALYSIS_FEEDBACK_STATUS,
  analysisFeedbackItemName,
  analysisFeedbackLine,
  analysisFeedbackReasonChoices,
  analysisFeedbackRevisionLine,
  analysisFeedbackToggleName,
  analysisQualityMetricLines,
} from './analysis-feedback-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * ②A 分析反馈 (Issue #94, plan slice S38; V2-UX-ANALYSIS-023, ANALYSIS-024, FDBK-005 to FDBK-008): beside the synopsis and
 * each entry of the four lists, `反馈…` opens the Analysis Feedback Card — 准确, 不准确 or 不完整, none chosen; for either
 * fault two or three reasons fitted to what is judged, none chosen, `其他 / 自行输入` beside them; an optional correction in
 * the editor's own words; `记录反馈`. What was recorded then reads under the item, and `改反馈…` records a successor. The
 * Book's Analysis Quality Metric reads under the synopsis with what it is not. Nothing asks again, counts what is unjudged,
 * or holds up the analysis: the card is there when the editor wants it.
 */
export interface MountAnalysisFeedbackOptions {
  /** ②A's card, each item it offers marked `data-analysis-item-key`. */
  readonly card: HTMLElement;
  /** Where the Book's metric reads. */
  readonly metric: HTMLElement;
  readonly revisionId: string;
  readonly api: Pick<RendererApi, 'inspectAnalysisFeedback' | 'recordAnalysisFeedback'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly technicalDetails: (key: string, ...rows: HTMLElement[]) => HTMLElement;
}

interface Draft {
  judgment: AnalysisFeedbackJudgment | null;
  choice: string | null;
  other: string;
  correction: string;
}

/**
 * The one card open, by revision and item, with what the editor chose and typed so far: ②A is drawn again whenever its
 * Book's analysis changes, and the card and its words outlive that.
 */
let open: { readonly key: string; readonly draft: Draft } | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['analysisFeedbackAction'] = name;
  node.addEventListener('click', run);
  return node;
}

function radio(name: string, value: string, label: string, checked: boolean, choose: () => void): HTMLLabelElement {
  const wrapper = el('label', 'analysis-feedback-choice');
  const input = el('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.addEventListener('change', () => { if (input.checked) choose(); });
  wrapper.append(input, el('span', undefined, label));
  return wrapper;
}

function itemSelector(itemKey: string): string {
  return `[data-analysis-item-key="${itemKey}"]`;
}

export function mountAnalysisFeedback(options: MountAnalysisFeedbackOptions): { load(): Promise<void> } {
  const { card, metric, revisionId, api, setStatus, errorMessage, technicalDetails } = options;
  metric.classList.add('analysis-feedback-metric');
  let projection: AnalysisFeedbackProjection | null = null;
  let busy = false;
  let refusal: { readonly itemKey: string; readonly message: string } | null = null;
  const draftKey = (itemKey: string): string => `${revisionId}\n${itemKey}`;

  const paint = (focus: string | null): void => {
    if (projection === null) return;
    for (const item of projection.items) {
      const host = card.querySelector<HTMLElement>(itemSelector(item.itemKey));
      if (host === null) continue;
      host.dataset['analysisFeedbackJudgment'] = item.latest?.judgment ?? 'none';
      host.dataset['analysisFeedbackSignals'] = String(item.signals);
      host.querySelector(':scope > .analysis-feedback')?.remove();
      host.append(itemNode(item));
    }
    paintMetric(projection);
    if (focus !== null && card.isConnected) card.querySelector<HTMLElement>(focus)?.focus();
  };

  const itemNode = (item: AnalysisFeedbackItemProjection): HTMLElement => {
    const node = el('div', 'analysis-feedback');
    const name = analysisFeedbackItemName(item.dimension, item.index);
    if (item.latest !== null) {
      const line = el('p', 'analysis-feedback-line', analysisFeedbackLine(item.dimension, item.latest, localInstantLabel));
      line.dataset['signalId'] = item.latest.signalId;
      node.append(line);
    }
    if (open?.key === draftKey(item.itemKey)) {
      node.append(cardNode(item, open.draft, name));
      return node;
    }
    const label = item.latest === null ? ANALYSIS_FEEDBACK_OPEN : ANALYSIS_FEEDBACK_CHANGE;
    const toggle = action(label, 'quiet', 'open', () => {
      if (busy) return;
      open = { key: draftKey(item.itemKey), draft: { judgment: null, choice: null, other: '', correction: '' } };
      refusal = null;
      paint(`${itemSelector(item.itemKey)} input[type="radio"]`);
    });
    toggle.setAttribute('aria-label', analysisFeedbackToggleName(item.latest !== null, name));
    toggle.disabled = busy;
    node.append(toggle);
    return node;
  };

  // The card is drawn once while it is open and changes in place, so a choice never moves the editor's focus and text
  // being composed in an input method is never redrawn under them.
  const cardNode = (item: AnalysisFeedbackItemProjection, draft: Draft, name: string): HTMLElement => {
    const box = el('div', 'analysis-feedback-card');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', `${ANALYSIS_FEEDBACK_HEADING}：${name}`);
    const judgments = el('fieldset', 'analysis-feedback-judgments');
    judgments.append(el('legend', undefined, ANALYSIS_FEEDBACK_JUDGMENT_LEGEND));
    for (const judgment of ANALYSIS_FEEDBACK_JUDGMENTS) {
      judgments.append(radio(`analysis-feedback-judgment-${item.itemKey}`, judgment, ANALYSIS_FEEDBACK_JUDGMENT_LABELS[judgment], draft.judgment === judgment, () => {
        if (draft.judgment === judgment) return;
        draft.judgment = judgment;
        draft.choice = null;
        draft.other = '';
        drawReasons();
      }));
    }
    const reasons = el('fieldset', 'analysis-feedback-reasons');
    const correction = el('label', 'analysis-feedback-field analysis-feedback-correction');
    const correctionText = el('textarea');
    correctionText.rows = 2;
    correctionText.value = draft.correction;
    correctionText.dataset['analysisFeedbackField'] = 'correction';
    correctionText.addEventListener('input', () => { draft.correction = correctionText.value; });
    correction.append(el('span', undefined, ANALYSIS_FEEDBACK_CORRECTION), correctionText);
    const record = action(ANALYSIS_FEEDBACK_RECORD, 'primary', 'record', () => void save(item, draft));
    const cancel = action(ANALYSIS_FEEDBACK_CANCEL, 'secondary', 'cancel', () => {
      if (busy) return;
      open = null;
      refusal = null;
      paint(`${itemSelector(item.itemKey)} [data-analysis-feedback-action="open"]`);
    });
    const drawReasons = (): void => {
      const choices = draft.judgment === null ? [] : analysisFeedbackReasonChoices(item.dimension, draft.judgment);
      reasons.hidden = choices.length === 0;
      correction.hidden = draft.judgment === null || draft.judgment === 'accurate';
      record.disabled = busy || draft.judgment === null;
      const other = el('input', 'analysis-feedback-other');
      other.type = 'text';
      other.value = draft.other;
      other.dataset['analysisFeedbackField'] = 'other';
      other.setAttribute('aria-label', ANALYSIS_FEEDBACK_OTHER_TEXT);
      other.placeholder = ANALYSIS_FEEDBACK_OTHER_TEXT;
      other.hidden = draft.choice !== ANALYSIS_FEEDBACK_OTHER;
      other.addEventListener('input', () => { draft.other = other.value; });
      reasons.replaceChildren(el('legend', undefined, ANALYSIS_FEEDBACK_REASON_LEGEND), ...choices.map((entry) =>
        radio(`analysis-feedback-reason-${item.itemKey}`, entry.choice, entry.label, draft.choice === entry.choice, () => {
          draft.choice = entry.choice;
          other.hidden = entry.choice !== ANALYSIS_FEEDBACK_OTHER;
          if (!other.hidden) other.focus();
        })), other);
    };
    drawReasons();
    const buttons = el('div', 'button-row analysis-feedback-actions');
    buttons.append(record, cancel);
    box.append(judgments, reasons, correction, buttons);
    // Escape closes the card as 取消 does — but never while an input method is composing, where Escape is the IME's.
    box.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      cancel.click();
    });
    if (refusal?.itemKey === item.itemKey) {
      const note = el('p', 'attention-note analysis-feedback-refusal', refusal.message);
      note.setAttribute('role', 'alert');
      box.append(note);
    }
    if (busy) for (const control of box.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input, textarea, button')) control.disabled = true;
    return box;
  };

  const save = async (item: AnalysisFeedbackItemProjection, draft: Draft): Promise<void> => {
    if (busy || draft.judgment === null) return;
    const judgment = draft.judgment;
    busy = true;
    refusal = null;
    paint(null);
    setStatus(ANALYSIS_FEEDBACK_STATUS.recording, 'busy');
    try {
      projection = await api.recordAnalysisFeedback({
        revisionId,
        itemKey: item.itemKey,
        itemDigest: item.digest,
        expectedLatestSignalId: item.latest?.signalId ?? null,
        judgment,
        reason: judgment === 'accurate' || draft.choice === null ? null : { choice: draft.choice, text: draft.choice === ANALYSIS_FEEDBACK_OTHER ? draft.other : null },
        correction: judgment === 'accurate' || draft.correction.trim().length === 0 ? null : draft.correction,
      });
      busy = false;
      if (open?.key === draftKey(item.itemKey)) open = null;
      paint(`${itemSelector(item.itemKey)} [data-analysis-feedback-action="open"]`);
      setStatus(ANALYSIS_FEEDBACK_STATUS.recorded, 'success');
    } catch (error) {
      busy = false;
      const message = errorMessage(error, ANALYSIS_FEEDBACK_STATUS.failed);
      refusal = { itemKey: item.itemKey, message };
      // What moved since the card opened is read again, so the next 记录反馈 answers what is there now.
      try { projection = await api.inspectAnalysisFeedback({ revisionId }); } catch { /* the card keeps what it had */ }
      paint(`${itemSelector(item.itemKey)} [data-analysis-feedback-action="record"]`);
      setStatus(message, 'error');
    }
  };

  const paintMetric = (current: AnalysisFeedbackProjection): void => {
    const quality = current.metric;
    metric.dataset['metricDefinition'] = quality.definition;
    metric.dataset['metricJudged'] = String(quality.judged);
    metric.dataset['metricAccurate'] = String(quality.accurate);
    metric.dataset['metricInaccurate'] = String(quality.inaccurate);
    metric.dataset['metricIncomplete'] = String(quality.incomplete);
    metric.dataset['metricLineage'] = quality.lineageDigest;
    const { total, dimensions } = analysisQualityMetricLines(quality);
    const lines = el('ul', 'analysis-list analysis-feedback-dimensions');
    for (const line of dimensions) lines.append(el('li', undefined, line));
    metric.replaceChildren(
      el('h5', undefined, ANALYSIS_FEEDBACK_HEADING),
      el('p', 'analysis-feedback-total', total),
      ...(dimensions.length === 0 ? [] : [lines]),
      el('p', 'field-note analysis-feedback-note', ANALYSIS_FEEDBACK_METRIC_NOTE),
      technicalDetails(
        'analysis-facts',
        el('dt', undefined, '分析质量指标'),
        el('dd', 'technical-identity', `${quality.definition} · 范围：本书 · 输入血缘 ${quality.lineageDigest}`),
        el('dt', undefined, '本修订版'),
        el('dd', 'technical-identity', analysisFeedbackRevisionLine(current)),
      ),
    );
  };

  return {
    async load(): Promise<void> {
      metric.replaceChildren(el('p', 'field-note', ANALYSIS_FEEDBACK_STATUS.loading));
      try {
        projection = await api.inspectAnalysisFeedback({ revisionId });
        paint(null);
      } catch (error) {
        const note = el('p', 'field-note analysis-feedback-unavailable', errorMessage(error, ANALYSIS_FEEDBACK_STATUS.unavailable));
        note.setAttribute('role', 'status');
        metric.replaceChildren(note);
      }
    },
  };
}
