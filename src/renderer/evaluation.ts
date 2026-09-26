import type {
  EvaluationConclusion,
  EvaluationContent,
  EvaluationRecordProjection,
  EvaluationWorkspaceProjection,
  RendererApi,
} from '../shared/protocol.js';
import { evaluationTotal, recommendationBlocked, type EvaluationRiskLevel } from '../shared/evaluation-scoring.js';
import {
  EVALUATION_AI7_PENDING,
  EVALUATION_COMMENT,
  EVALUATION_CONCLUSION_LEGEND,
  EVALUATION_EMPTY,
  EVALUATION_FINALIZE,
  EVALUATION_NOT_RATED,
  EVALUATION_NOT_RATED_REASON,
  EVALUATION_READINESS,
  EVALUATION_RECOMMEND_BLOCKED,
  EVALUATION_RISK_LEVELS,
  EVALUATION_RISK_REVIEWED,
  EVALUATION_RISK_STATEMENT,
  EVALUATION_RISKS_HEADING,
  EVALUATION_SAVE,
  EVALUATION_SCORE,
  EVALUATION_START,
  EVALUATION_STATUS,
  EVALUATION_STRENGTHS,
  EVALUATION_VERDICT,
  EVALUATION_VERSIONS_HEADING,
  EVALUATION_WEAKNESSES,
  evaluationBandLabel,
  evaluationComparisonLines,
  evaluationFinalized,
  evaluationFinalizedLine,
  evaluationHeading,
  evaluationItemLegend,
  evaluationRevisionLine,
  evaluationStarted,
  evaluationTotalLine,
  evaluationVersionLine,
} from './evaluation-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012): the Book's
 * versions, and the one on show as a form the editor fills in — each item's 得分 out of its 满分 or `不评` with a reason, with
 * its band and 评语; the two risk items at 低 / 中 / 高 with a statement, and a person's review of a 高 one; what is still
 * missing, the strengths, the weaknesses and 总评; and the conclusion, chosen by the editor, `推荐出版` waiting on every
 * unreviewed 高. The total follows as the editor types. `保存评估` records the form; `定稿` closes the version, which then reads
 * as it was; `重新评估` begins the next, compared with it item by item.
 */
export interface MountEvaluationOptions {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'inspectEvaluation' | 'startEvaluation' | 'saveEvaluation'>;
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
  node.dataset['evaluationAction'] = name;
  node.addEventListener('click', run);
  return node;
}

function field<T extends HTMLInputElement | HTMLTextAreaElement>(label: string, control: T): HTMLLabelElement {
  const wrapper = el('label', 'evaluation-field');
  wrapper.append(el('span', undefined, label), control);
  return wrapper;
}

function textarea(value: string, name: string, rows = 2): HTMLTextAreaElement {
  const node = el('textarea');
  node.rows = rows;
  node.value = value;
  node.dataset['evaluationField'] = name;
  return node;
}

function radio(name: string, value: string, label: string, checked: boolean, disabled: boolean): HTMLLabelElement {
  const wrapper = el('label', 'evaluation-choice');
  const input = el('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.disabled = disabled;
  wrapper.append(input, el('span', undefined, label));
  return wrapper;
}

export function mountEvaluation(options: MountEvaluationOptions): { load(): Promise<void> } {
  const { root, api, setStatus, errorMessage, technicalDetails } = options;
  root.classList.add('evaluation');
  let busy = false;
  let workspace: EvaluationWorkspaceProjection | null = null;
  let refusal: string | null = null;

  const paint = (focus: string | null, preserveForm = false): void => {
    if (workspace === null) return;
    const keptForm = preserveForm ? root.querySelector<HTMLElement>('.evaluation-record') : null;
    root.dataset['evaluationRecords'] = String(workspace.recordCount);
    const parts: HTMLElement[] = [];
    // The versions, newest first; each opens as it was recorded.
    if (workspace.records.length > 0) {
      const versions = el('section', 'evaluation-versions');
      const heading = el('h3', undefined, EVALUATION_VERSIONS_HEADING);
      heading.tabIndex = -1;
      versions.append(heading);
      const list = el('ol', 'evaluation-version-list');
      for (const summary of workspace.records) {
        const item = el('li');
        item.dataset['recordId'] = summary.recordId;
        item.dataset['evaluationState'] = summary.state;
        const open = action(evaluationVersionLine(workspace.profile, summary), 'quiet', 'open-version', () => void show(summary.recordId));
        open.disabled = busy;
        open.setAttribute('aria-current', String(workspace.record?.recordId === summary.recordId));
        item.append(open);
        list.append(item);
      }
      versions.append(list);
      if (workspace.recordCount > workspace.records.length) {
        const controls = el('div', 'button-row');
        const latest = action('最新版本', 'quiet', 'versions-latest', () => void turn(null));
        const older = action('更早版本', 'secondary', 'versions-older', () => void turn(workspace?.recordsNext ?? null));
        latest.disabled = busy || workspace.recordsBefore === null;
        older.disabled = busy || workspace.recordsNext === null;
        controls.append(latest, older);
        versions.append(controls);
      }
      parts.push(versions);
    } else {
      parts.push(el('p', 'field-note evaluation-empty', EVALUATION_EMPTY));
    }
    const start = el('div', 'button-row evaluation-start');
    if (workspace.start.allowed) {
      const begin = action(EVALUATION_START[workspace.start.kind], workspace.start.kind === 'first' ? 'primary' : 'secondary', 'start', () => void begin_());
      begin.disabled = busy;
      start.append(begin);
    } else {
      start.append(el('p', 'field-note evaluation-start-reason', workspace.start.reason));
    }
    parts.push(start);
    if (refusal !== null) {
      const note = el('p', 'attention-note evaluation-refusal', refusal);
      note.setAttribute('role', 'alert');
      parts.push(note);
    }
    if (workspace.record !== null) parts.push(keptForm ?? recordNode(workspace.record));
    root.replaceChildren(...parts);
    if (keptForm !== null && workspace.record !== null) refresh(keptForm, workspace.record);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const turn = async (recordsBefore: number | null): Promise<void> => {
    if (busy || workspace === null) return;
    busy = true;
    try {
      const page = await api.inspectEvaluation({ recordId: workspace.record?.recordId ?? null, recordsBefore });
      if (!root.isConnected) return;
      // Browsing version summaries must not replace unsaved input or advance its optimistic save version.
      workspace = { ...page, record: workspace.record };
      refusal = null;
    } catch (error) {
      if (!root.isConnected) return;
      refusal = errorMessage(error, EVALUATION_STATUS.unavailable);
      setStatus(refusal, 'error');
    } finally {
      busy = false;
      if (root.isConnected) paint('.evaluation-versions h3', true);
    }
  };

  const recordNode = (record: EvaluationRecordProjection): HTMLElement => {
    const profile = record.profile;
    const readOnly = record.state === 'finalized' || busy;
    const node = el('article', 'evaluation-record');
    node.dataset['recordId'] = record.recordId;
    node.dataset['evaluationState'] = record.state;
    node.dataset['entries'] = String(record.entries);
    const heading = el('h3', undefined, evaluationHeading(record));
    heading.tabIndex = -1;
    node.append(heading, el('p', 'field-note evaluation-revision', evaluationRevisionLine(record)));
    const finalized = evaluationFinalizedLine(record, localInstantLabel);
    if (finalized !== null) node.append(el('p', 'evaluation-finalized', finalized));
    node.append(el('p', 'field-note evaluation-ai7', EVALUATION_AI7_PENDING));
    const total = el('p', 'evaluation-total', evaluationTotalLine(profile, record.total));
    total.setAttribute('aria-live', 'polite');
    node.append(total);
    if (record.comparison !== null) {
      const { heading: compareHeading, lines } = evaluationComparisonLines(profile, record.comparison);
      const section = el('section', 'evaluation-comparison');
      const list = el('ul');
      for (const line of lines) list.append(el('li', undefined, line));
      section.append(el('h4', undefined, compareHeading), list);
      node.append(section);
    }
    // Each scored item: 得分 out of 满分, or 不评 with its reason; its band; its 评语.
    const items = el('div', 'evaluation-items');
    record.profile.items.forEach((item, index) => {
      const content = record.content.items[index]!;
      const set = el('fieldset', 'evaluation-item');
      set.dataset['itemId'] = item.itemId;
      set.append(el('legend', undefined, evaluationItemLegend(item)));
      const score = el('input');
      score.type = 'number';
      score.min = '0';
      score.max = String(item.fullMarks);
      score.step = '0.5';
      score.inputMode = 'decimal';
      score.value = content.score === null ? '' : String(content.score);
      score.disabled = readOnly || content.notRated !== null;
      score.dataset['evaluationField'] = 'score';
      const band = el('span', 'status-pill evaluation-band', content.score === null ? '' : evaluationBandLabel(profile, content.score, item.fullMarks));
      band.hidden = content.score === null;
      const notRated = el('input');
      notRated.type = 'checkbox';
      notRated.checked = content.notRated !== null;
      notRated.disabled = readOnly;
      notRated.dataset['evaluationField'] = 'not-rated';
      const reason = el('input');
      reason.type = 'text';
      reason.value = content.notRated ?? '';
      reason.disabled = readOnly || content.notRated === null;
      reason.dataset['evaluationField'] = 'not-rated-reason';
      const scoreRow = el('div', 'evaluation-score-row');
      const notRatedLabel = el('label', 'evaluation-choice');
      notRatedLabel.append(notRated, el('span', undefined, EVALUATION_NOT_RATED));
      scoreRow.append(field(`${EVALUATION_SCORE}（0 – ${item.fullMarks}）`, score), band, notRatedLabel);
      const reasonField = field(EVALUATION_NOT_RATED_REASON, reason);
      reasonField.hidden = content.notRated === null;
      set.append(scoreRow, reasonField, field(EVALUATION_COMMENT, textarea(content.comment ?? '', 'comment')));
      set.querySelector<HTMLTextAreaElement>('[data-evaluation-field="comment"]')!.disabled = readOnly;
      score.addEventListener('input', () => {
        const value = score.value === '' ? null : Number(score.value);
        band.hidden = value === null || !Number.isFinite(value);
        band.textContent = value === null || !Number.isFinite(value) ? '' : evaluationBandLabel(profile, value, item.fullMarks);
        refresh(node, record);
      });
      notRated.addEventListener('change', () => {
        score.disabled = notRated.checked;
        reason.disabled = !notRated.checked;
        reasonField.hidden = !notRated.checked;
        if (notRated.checked) {
          score.value = '';
          band.hidden = true;
          reason.focus();
        }
        refresh(node, record);
      });
      items.append(set);
    });
    node.append(items);
    // The risk items: 低 / 中 / 高 with a statement; a 高 one waits on a person's review before 推荐出版.
    const risks = el('section', 'evaluation-risks');
    risks.append(el('h4', undefined, EVALUATION_RISKS_HEADING));
    record.profile.risks.forEach((risk, index) => {
      const content = record.content.risks[index]!;
      const set = el('fieldset', 'evaluation-risk');
      set.dataset['riskId'] = risk.riskId;
      set.append(el('legend', undefined, risk.label));
      const levels = el('div', 'evaluation-levels');
      for (const level of ['low', 'medium', 'high'] as const) {
        levels.append(radio(`evaluation-risk-${record.recordId}-${risk.riskId}`, level, EVALUATION_RISK_LEVELS[level], content.level === level, readOnly));
      }
      const reviewed = el('input');
      reviewed.type = 'checkbox';
      reviewed.checked = content.reviewed;
      reviewed.disabled = readOnly || content.level !== 'high';
      reviewed.dataset['evaluationField'] = 'reviewed';
      const reviewedLabel = el('label', 'evaluation-choice');
      reviewedLabel.append(reviewed, el('span', undefined, EVALUATION_RISK_REVIEWED));
      const statement = textarea(content.statement ?? '', 'statement');
      statement.disabled = readOnly;
      set.append(levels, field(EVALUATION_RISK_STATEMENT, statement), reviewedLabel);
      levels.addEventListener('change', () => {
        const level = levels.querySelector<HTMLInputElement>('input:checked')?.value;
        reviewed.disabled = level !== 'high';
        if (level !== 'high') reviewed.checked = false;
        refresh(node, record);
      });
      reviewed.addEventListener('change', () => refresh(node, record));
      risks.append(set);
    });
    node.append(risks);
    const lists = el('div', 'evaluation-lists');
    for (const [label, name, lines] of [
      [EVALUATION_READINESS, 'readiness', record.content.readiness],
      [EVALUATION_STRENGTHS, 'strengths', record.content.strengths],
      [EVALUATION_WEAKNESSES, 'weaknesses', record.content.weaknesses],
    ] as const) {
      const control = textarea(lines.join('\n'), name, 3);
      control.disabled = readOnly;
      lists.append(field(label, control));
    }
    const verdict = textarea(record.content.verdict ?? '', 'verdict', 3);
    verdict.disabled = readOnly;
    lists.append(field(EVALUATION_VERDICT, verdict));
    node.append(lists);
    // The conclusion: none chosen until the editor chooses (EVAL-007).
    const conclusion = el('fieldset', 'evaluation-conclusion');
    conclusion.append(el('legend', undefined, EVALUATION_CONCLUSION_LEGEND));
    for (const option of record.profile.conclusions) {
      const choice = radio(`evaluation-conclusion-${record.recordId}`, option.conclusion, option.label, record.content.conclusion === option.conclusion, readOnly);
      choice.dataset['conclusion'] = option.conclusion;
      conclusion.append(choice);
    }
    const blocked = el('p', 'field-note evaluation-recommend-blocked', EVALUATION_RECOMMEND_BLOCKED);
    blocked.id = `evaluation-blocked-${record.recordId}`;
    conclusion.append(blocked);
    node.append(conclusion);
    if (record.state === 'editing') {
      const row = el('div', 'button-row evaluation-actions');
      const saveButton = action(EVALUATION_SAVE, 'secondary', 'save', () => void save(record, false));
      const finalize = action(EVALUATION_FINALIZE, 'primary', 'finalize', () => void save(record, true));
      saveButton.disabled = busy;
      finalize.disabled = busy;
      row.append(saveButton, finalize);
      node.append(row);
    }
    node.append(technicalDetails('evaluation-facts',
      el('dt', undefined, '评估版本'), el('dd', 'technical-identity', record.recordId),
      el('dt', undefined, '修订版'), el('dd', 'technical-identity', record.revisionId),
      el('dt', undefined, '评估方案摘要'), el('dd', 'technical-identity', record.profile.sha256)));
    refresh(node, record);
    return node;
  };

  /** What the form holds now, in the record's shape. */
  const collect = (node: HTMLElement, record: EvaluationRecordProjection): EvaluationContent => {
    const lines = (name: string): string[] =>
      (node.querySelector<HTMLTextAreaElement>(`.evaluation-lists [data-evaluation-field="${name}"]`)?.value ?? '').split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    const optional = (value: string | undefined): string | null => (value === undefined || value.trim().length === 0 ? null : value);
    return {
      items: record.profile.items.map((item) => {
        const set = node.querySelector<HTMLElement>(`.evaluation-item[data-item-id="${item.itemId}"]`)!;
        const notRated = set.querySelector<HTMLInputElement>('[data-evaluation-field="not-rated"]')!.checked;
        const raw = set.querySelector<HTMLInputElement>('[data-evaluation-field="score"]')!.value;
        return {
          itemId: item.itemId,
          score: notRated || raw === '' ? null : Number(raw),
          notRated: notRated ? set.querySelector<HTMLInputElement>('[data-evaluation-field="not-rated-reason"]')!.value : null,
          comment: optional(set.querySelector<HTMLTextAreaElement>('[data-evaluation-field="comment"]')!.value),
        };
      }),
      risks: record.profile.risks.map((risk) => {
        const set = node.querySelector<HTMLElement>(`.evaluation-risk[data-risk-id="${risk.riskId}"]`)!;
        const level = (set.querySelector<HTMLInputElement>('.evaluation-levels input:checked')?.value ?? null) as EvaluationRiskLevel | null;
        return {
          riskId: risk.riskId,
          level,
          statement: optional(set.querySelector<HTMLTextAreaElement>('[data-evaluation-field="statement"]')!.value),
          reviewed: level === 'high' && set.querySelector<HTMLInputElement>('[data-evaluation-field="reviewed"]')!.checked,
        };
      }),
      readiness: lines('readiness'),
      strengths: lines('strengths'),
      weaknesses: lines('weaknesses'),
      verdict: optional(node.querySelector<HTMLTextAreaElement>('.evaluation-lists [data-evaluation-field="verdict"]')?.value),
      conclusion: (node.querySelector<HTMLInputElement>('.evaluation-conclusion input:checked')?.value ?? null) as EvaluationConclusion | null,
    };
  };

  /** The total as the editor types, and 推荐出版 open only while no 高 risk waits for a person's review. */
  const refresh = (node: HTMLElement, record: EvaluationRecordProjection): void => {
    const content = collect(node, record);
    const total = evaluationTotal(record.profile.items.map((item, index) => ({
      fullMarks: item.fullMarks,
      score: content.items[index]!.score !== null && Number.isFinite(content.items[index]!.score) ? content.items[index]!.score : null,
      notRated: content.items[index]!.notRated !== null,
    })));
    node.querySelector('.evaluation-total')!.textContent = evaluationTotalLine(record.profile, total);
    const blocked = recommendationBlocked(content.risks);
    const recommend = node.querySelector<HTMLInputElement>('.evaluation-conclusion [data-conclusion="recommend"] input');
    const note = node.querySelector<HTMLElement>('.evaluation-recommend-blocked');
    if (recommend !== null && note !== null) {
      recommend.disabled = record.state === 'finalized' || busy || blocked;
      if (blocked && recommend.checked) recommend.checked = false;
      note.hidden = !blocked;
      if (blocked) recommend.setAttribute('aria-describedby', note.id);
      else recommend.removeAttribute('aria-describedby');
    }
  };

  const show = async (recordId: string): Promise<void> => {
    if (busy) return;
    busy = true;
    refusal = null;
    setStatus(EVALUATION_STATUS.loading, 'busy');
    try {
      workspace = await api.inspectEvaluation({ recordId });
      busy = false;
      setStatus(EVALUATION_STATUS.opened);
      paint('.evaluation-record h3');
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, EVALUATION_STATUS.unavailable);
      setStatus(refusal, 'error');
      paint(null);
    }
  };

  const begin_ = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    refusal = null;
    setStatus(EVALUATION_STATUS.starting, 'busy');
    paint(null);
    try {
      workspace = await api.startEvaluation();
      busy = false;
      setStatus(evaluationStarted(workspace.record?.ordinal ?? 1), 'success');
      paint('.evaluation-record h3');
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, EVALUATION_STATUS.failed);
      setStatus(refusal, 'error');
      paint('[data-evaluation-action="start"]');
    }
  };

  const save = async (record: EvaluationRecordProjection, finalize: boolean): Promise<void> => {
    if (busy) return;
    const node = root.querySelector<HTMLElement>(`.evaluation-record[data-record-id="${record.recordId}"]`);
    if (node === null) return;
    const content = collect(node, record);
    busy = true;
    refusal = null;
    setStatus(finalize ? EVALUATION_STATUS.finalizing : EVALUATION_STATUS.saving, 'busy');
    for (const button of node.querySelectorAll<HTMLButtonElement>('[data-evaluation-action]')) button.disabled = true;
    try {
      workspace = await api.saveEvaluation({ recordId: record.recordId, expectedEntries: record.entries, content, finalize });
      busy = false;
      setStatus(finalize ? evaluationFinalized(record.ordinal) : EVALUATION_STATUS.saved, 'success');
      paint(finalize ? '.evaluation-record h3' : '[data-evaluation-action="save"]');
    } catch (error) {
      // The form keeps what the editor wrote, so a refused save can be corrected where it stands.
      busy = false;
      refusal = errorMessage(error, EVALUATION_STATUS.failed);
      setStatus(refusal, 'error');
      for (const button of node.querySelectorAll<HTMLButtonElement>('[data-evaluation-action]')) button.disabled = false;
      const note = el('p', 'attention-note evaluation-refusal', refusal);
      note.setAttribute('role', 'alert');
      root.querySelector('.evaluation-refusal')?.remove();
      node.before(note);
    }
  };

  return {
    async load(): Promise<void> {
      root.dataset['evaluation'] = 'loading';
      try {
        workspace = await api.inspectEvaluation({ recordId: null });
        root.dataset['evaluation'] = 'ready';
        paint(null);
      } catch (error) {
        root.dataset['evaluation'] = 'failed';
        root.replaceChildren(el('p', 'attention-note', errorMessage(error, EVALUATION_STATUS.unavailable)));
        throw error;
      }
    },
  };
}
