import type {
  EvaluationAdjustment,
  EvaluationAdjustmentReasonId,
  EvaluationConclusion,
  EvaluationContent,
  EvaluationRecordProjection,
  EvaluationWorkspaceProjection,
  RendererApi,
  ServiceJobProjection,
} from '../shared/protocol.js';
import {
  EVALUATION_ADJUSTMENT_REASONS,
  evaluationItemAdjusted,
  evaluationTotal,
  recommendationBlocked,
  type EvaluationRiskLevel,
} from '../shared/evaluation-scoring.js';
import {
  EVALUATION_ADJUSTMENT_LEGEND,
  EVALUATION_ADJUSTMENT_NOTE,
  EVALUATION_ADJUSTMENT_REASON_LABELS,
  EVALUATION_AI7_HEADING,
  EVALUATION_AI7_LEDE,
  EVALUATION_AI7_NONE,
  EVALUATION_AI7_OPEN_PLAN,
  EVALUATION_AI7_OPEN_TASK,
  EVALUATION_AI7_PREPARE,
  EVALUATION_AI7_STATUS,
  EVALUATION_AI7_SUGGESTED,
  EVALUATION_START_FROM_INITIAL,
  evaluationAi7ConclusionLine,
  evaluationAi7ItemLine,
  evaluationAi7LatestLine,
  evaluationAi7RecordLine,
  evaluationAi7TaskLine,
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
  readonly api: Pick<RendererApi, 'inspectEvaluation' | 'startEvaluation' | 'saveEvaluation' | 'prepareInitialEvaluation'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly technicalDetails: (key: string, ...rows: HTMLElement[]) => HTMLElement;
  /** The shell's own follow of a cooperative job: AI7 初评's preparation (Issue #429, S81b1). */
  readonly awaitServiceJob: (initial: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void) => Promise<ServiceJobProjection>;
  /** Open AI7 初评's plan in the Task Drawer, whose bar starts it. */
  readonly openPlan: (taskIntentId: string) => void;
}

/** The states in which AI7's 初评 is still under way or waiting: 评估 reads it again until it settles. */
const INITIAL_UNDER_WAY: ReadonlySet<string> = new Set(['waiting', 'admitted', 'executing', 'cancelling', 'pausing', 'queued']);
/** How often 评估 reads a 初评 under way again. */
const INITIAL_POLL_MS = 1000;

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

export function mountEvaluation(options: MountEvaluationOptions): { load(): Promise<void>; refresh(): void } {
  const { root, api, setStatus, errorMessage, technicalDetails } = options;
  root.classList.add('evaluation');
  let busy = false;
  let workspace: EvaluationWorkspaceProjection | null = null;
  let refusal: string | null = null;
  let poll: number | null = null;

  /**
   * AI7's 初评 (Issue #429, S81b1): its Task and what it can do now, and the latest that settled — each item's score with its
   * 依据充分度, the strengths, the weaknesses, the next step and the conclusion it would suggest, said as AI7's.
   */
  const initialNode = (page: EvaluationWorkspaceProjection): HTMLElement => {
    const initial = page.initial;
    const section = el('section', 'evaluation-initial');
    section.dataset['initialState'] = initial.task?.state ?? 'none';
    const heading = el('h3', undefined, EVALUATION_AI7_HEADING);
    heading.tabIndex = -1;
    section.append(heading, el('p', 'field-note', EVALUATION_AI7_LEDE));
    if (initial.task !== null) section.append(el('p', 'evaluation-initial-task', evaluationAi7TaskLine(initial.task)));
    const latest = initial.latest;
    if (latest === null) {
      section.append(el('p', 'field-note evaluation-initial-none', EVALUATION_AI7_NONE));
    } else {
      section.dataset['initialRevision'] = latest.revisionId;
      section.dataset['initialCurrent'] = String(latest.current);
      section.append(el('p', 'evaluation-initial-latest', evaluationAi7LatestLine(page.profile, latest)));
      const items = el('ul', 'evaluation-initial-items');
      for (const item of page.profile.items) {
        const ai7 = latest.items.find((entry) => entry.itemId === item.itemId);
        if (ai7 === undefined) continue;
        const line = el('li', undefined, `${item.label}：${evaluationAi7ItemLine(ai7, item.fullMarks)}`);
        line.dataset['itemId'] = item.itemId;
        line.dataset['sufficiency'] = ai7.sufficiency;
        items.append(line);
      }
      section.append(items);
      const lists = el('dl', 'evaluation-initial-lists');
      for (const [label, value] of [
        ['主要优点', latest.strengths.join('；')],
        ['主要问题', latest.weaknesses.join('；')],
        ['下一步建议', latest.nextStep ?? ''],
      ] as const) {
        if (value.length === 0) continue;
        lists.append(el('dt', undefined, label), el('dd', undefined, value));
      }
      section.append(lists, el('p', 'field-note evaluation-initial-conclusion', evaluationAi7ConclusionLine(page.profile, latest.suggestedConclusion)));
    }
    const row = el('div', 'button-row evaluation-initial-actions');
    const task = initial.task;
    if (task !== null && task.state === 'prepared') {
      const open = action(EVALUATION_AI7_OPEN_PLAN, 'primary', 'open-initial-plan', () => options.openPlan(task.taskIntentId));
      open.disabled = busy;
      open.setAttribute('aria-controls', 'task-drawer');
      row.append(open);
    } else {
      if (initial.prepare.allowed) {
        const prepare = action(EVALUATION_AI7_PREPARE[initial.prepare.mode], latest === null ? 'primary' : 'secondary', 'prepare-initial', () => void prepareInitial());
        prepare.disabled = busy;
        row.append(prepare);
      } else {
        row.append(el('p', 'field-note evaluation-initial-reason', initial.prepare.reason));
      }
      if (task !== null) {
        const open = action(EVALUATION_AI7_OPEN_TASK, 'quiet', 'open-initial-task', () => options.openPlan(task.taskIntentId));
        open.disabled = busy;
        open.setAttribute('aria-controls', 'task-drawer');
        row.append(open);
      }
    }
    section.append(row);
    return section;
  };

  /** While AI7's 初评 is under way, 评估 reads it again — and keeps the form the editor is filling in as it is. */
  const follow = (): void => {
    if (poll !== null || workspace === null || !INITIAL_UNDER_WAY.has(workspace.initial.task?.state ?? '')) return;
    poll = window.setTimeout(() => {
      poll = null;
      if (!root.isConnected || busy || workspace === null) return;
      void api.inspectEvaluation({ recordId: workspace.record?.recordId ?? null, recordsBefore: workspace.recordsBefore }).then((page) => {
        if (!root.isConnected || workspace === null || busy) return;
        workspace = { ...page, record: workspace.record };
        paint(null, true);
      }).catch(() => undefined).finally(() => follow());
    }, INITIAL_POLL_MS);
  };

  const paint = (focus: string | null, preserveForm = false): void => {
    if (workspace === null) return;
    const keptForm = preserveForm ? root.querySelector<HTMLElement>('.evaluation-record') : null;
    root.dataset['evaluationRecords'] = String(workspace.recordCount);
    const parts: HTMLElement[] = [initialNode(workspace)];
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
      // 从 AI7 初评开始 leads once AI7's latest 初评 read the text as it stands (EVAL-001, EVAL-006); the editor may still begin alone.
      const fromInitial = workspace.start.fromInitial;
      if (fromInitial !== null) {
        const seeded = action(EVALUATION_START_FROM_INITIAL, 'primary', 'start-from-initial', () => void begin_(true));
        seeded.disabled = busy;
        start.append(seeded);
      }
      const begin = action(EVALUATION_START[workspace.start.kind], workspace.start.kind === 'first' && fromInitial === null ? 'primary' : 'secondary', 'start', () => void begin_(false));
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
    if (keptForm !== null && workspace.record !== null && keptForm.parentElement === root) {
      // The form the editor is filling in never leaves the page — a 初评 read again while they type keeps their focus and
      // their place — and everything around it is drawn anew.
      for (const child of Array.from(root.children)) if (child !== keptForm) child.remove();
      keptForm.before(...parts);
    } else {
      if (workspace.record !== null) parts.push(keptForm ?? recordNode(workspace.record));
      root.replaceChildren(...parts);
    }
    if (keptForm !== null && workspace.record !== null) refresh(keptForm, workspace.record);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
    follow();
  };

  /** 准备 AI7 初评: the Task's plan prepared as one cooperative job, then opened in the Task Drawer, whose bar starts it. */
  const prepareInitial = async (): Promise<void> => {
    if (busy || workspace === null) return;
    busy = true;
    refusal = null;
    setStatus(EVALUATION_AI7_STATUS.preparing, 'busy');
    paint(null, true);
    try {
      const job = await api.prepareInitialEvaluation();
      const completed = await options.awaitServiceJob(job, (next) => setStatus(next.progress.label, 'busy'));
      busy = false;
      if (completed.state === 'cancelled') {
        setStatus(EVALUATION_AI7_STATUS.cancelled, 'success');
        paint('[data-evaluation-action="prepare-initial"]', true);
        return;
      }
      const result = completed.result;
      if (completed.kind !== 'initial-evaluation-preparation' || result === null || !('initial' in result) || result.bookId !== workspace?.bookId) {
        throw new Error(EVALUATION_AI7_STATUS.failed);
      }
      workspace = { ...result, record: workspace.record };
      setStatus(EVALUATION_AI7_STATUS.prepared, 'success');
      paint(null, true);
      const ref = result.initial.task?.taskIntentId ?? null;
      if (ref !== null) options.openPlan(ref);
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, EVALUATION_AI7_STATUS.failed);
      setStatus(refusal, 'error');
      paint('.evaluation-initial h3', true);
    }
  };

  const turn = async (recordsBefore: number | null): Promise<void> => {
    if (busy || workspace === null) return;
    busy = true;
    // The completion owns only the summary page; the current form and its save version remain pinned.
    await api.inspectEvaluation({ recordId: workspace.record?.recordId ?? null, recordsBefore }).then((page) => {
      if (!root.isConnected || workspace === null) return;
      workspace = { ...page, record: workspace.record };
      refusal = null;
    }).catch((error: unknown) => {
      if (!root.isConnected) return;
      refusal = errorMessage(error, EVALUATION_STATUS.unavailable);
      setStatus(refusal, 'error');
    }).finally(() => {
      busy = false;
      if (root.isConnected) paint('.evaluation-versions h3', true);
    });
  };

  /** 调分原因 of one item (EVAL-006): the five, none ticked until the editor ticks one, `自行输入` with their own words. */
  const adjustmentNode = (record: EvaluationRecordProjection, itemId: string, adjustment: EvaluationAdjustment | null, readOnly: boolean): HTMLElement => {
    const set = el('fieldset', 'evaluation-adjustment');
    set.dataset['itemId'] = itemId;
    set.append(el('legend', undefined, EVALUATION_ADJUSTMENT_LEGEND));
    const choices = el('div', 'evaluation-adjustment-reasons');
    for (const reason of EVALUATION_ADJUSTMENT_REASONS) {
      const wrapper = el('label', 'evaluation-choice');
      const input = el('input');
      input.type = 'checkbox';
      input.value = reason;
      input.checked = adjustment?.reasons.includes(reason) ?? false;
      input.disabled = readOnly;
      input.dataset['evaluationField'] = 'adjustment-reason';
      wrapper.append(input, el('span', undefined, EVALUATION_ADJUSTMENT_REASON_LABELS[reason]));
      choices.append(wrapper);
    }
    const note = el('input');
    note.type = 'text';
    note.value = adjustment?.note ?? '';
    note.disabled = readOnly;
    note.dataset['evaluationField'] = 'adjustment-note';
    note.id = `evaluation-adjustment-note-${record.recordId}-${itemId}`;
    const noteField = field(EVALUATION_ADJUSTMENT_NOTE, note);
    noteField.hidden = !(adjustment?.reasons.includes('own') ?? false);
    choices.addEventListener('change', () => {
      const own = choices.querySelector<HTMLInputElement>('input[value="own"]')!.checked;
      noteField.hidden = !own;
      if (own) note.focus();
    });
    set.append(choices, noteField);
    return set;
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
    const initial = record.initial;
    node.dataset['initial'] = String(initial !== null);
    node.append(el('p', 'field-note evaluation-ai7', initial === null ? EVALUATION_AI7_PENDING : evaluationAi7RecordLine(initial)));
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
      // AI7's score beside the editor's (EVAL-006): the record keeps the editor's, and where they differ the editor may say why.
      const ai7 = initial?.items.find((entry) => entry.itemId === item.itemId) ?? null;
      const beside: HTMLElement[] = [];
      if (ai7 !== null) {
        const line = el('p', 'evaluation-item-ai7', evaluationAi7ItemLine(ai7, item.fullMarks));
        line.dataset['sufficiency'] = ai7.sufficiency;
        beside.push(line);
        if (ai7.comment !== null) beside.push(el('p', 'field-note evaluation-item-ai7-comment', `AI7 评语：${ai7.comment}`));
        beside.push(adjustmentNode(record, item.itemId, content.adjustment ?? null, readOnly));
      }
      set.append(scoreRow, ...beside, reasonField, field(EVALUATION_COMMENT, textarea(content.comment ?? '', 'comment')));
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
      // AI7's suggestion is marked as AI7's and never chosen for the editor (EVAL-007).
      if (initial?.suggestedConclusion === option.conclusion) choice.append(el('span', 'status-pill evaluation-ai7-suggested', EVALUATION_AI7_SUGGESTED));
      conclusion.append(choice);
    }
    if (initial !== null) conclusion.append(el('p', 'field-note evaluation-ai7-conclusion', evaluationAi7ConclusionLine(record.profile, initial.suggestedConclusion)));
    const blocked = el('p', 'field-note evaluation-recommend-blocked', EVALUATION_RECOMMEND_BLOCKED);
    blocked.id = `evaluation-blocked-${record.recordId}`;
    conclusion.append(blocked);
    node.append(conclusion);
    if (record.state !== 'finalized') {
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

  /** AI7's score of one item in the version on show; `null` when the version began without AI7's 初评 or AI7 gave none. */
  const ai7ScoreOf = (record: EvaluationRecordProjection, itemId: string): number | null =>
    record.initial?.items.find((entry) => entry.itemId === itemId)?.score ?? null;

  /** The reasons ticked for one item, kept only while the editor's score departs from AI7's. */
  const adjustmentOf = (set: HTMLElement, record: EvaluationRecordProjection, itemId: string, score: number | null, notRated: boolean): EvaluationAdjustment | null => {
    const group = set.querySelector<HTMLElement>('.evaluation-adjustment');
    if (group === null || !evaluationItemAdjusted({ score: score !== null && Number.isFinite(score) ? score : null, notRated }, ai7ScoreOf(record, itemId))) return null;
    const reasons = Array.from(group.querySelectorAll<HTMLInputElement>('[data-evaluation-field="adjustment-reason"]:checked'), (input) => input.value as EvaluationAdjustmentReasonId);
    if (reasons.length === 0) return null;
    const note = group.querySelector<HTMLInputElement>('[data-evaluation-field="adjustment-note"]')!.value.trim();
    return { reasons, note: reasons.includes('own') && note.length > 0 ? note : null };
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
        const score = notRated || raw === '' ? null : Number(raw);
        return {
          itemId: item.itemId,
          score,
          notRated: notRated ? set.querySelector<HTMLInputElement>('[data-evaluation-field="not-rated-reason"]')!.value : null,
          comment: optional(set.querySelector<HTMLTextAreaElement>('[data-evaluation-field="comment"]')!.value),
          adjustment: adjustmentOf(set, record, item.itemId, score, notRated),
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
    // 调分原因 is offered only while the editor's score departs from AI7's (EVAL-006).
    record.profile.items.forEach((item, index) => {
      const group = node.querySelector<HTMLElement>(`.evaluation-item[data-item-id="${item.itemId}"] .evaluation-adjustment`);
      if (group === null) return;
      const entry = content.items[index]!;
      const score = entry.score !== null && Number.isFinite(entry.score) ? entry.score : null;
      group.hidden = !evaluationItemAdjusted({ score, notRated: entry.notRated !== null }, ai7ScoreOf(record, item.itemId));
    });
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

  const begin_ = async (fromInitial: boolean): Promise<void> => {
    if (busy) return;
    busy = true;
    refusal = null;
    setStatus(fromInitial ? EVALUATION_AI7_STATUS.startingFromInitial : EVALUATION_STATUS.starting, 'busy');
    paint(null);
    try {
      workspace = await api.startEvaluation({ fromInitial });
      busy = false;
      setStatus(evaluationStarted(workspace.record?.ordinal ?? 1), 'success');
      paint('.evaluation-record h3');
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, EVALUATION_STATUS.failed);
      setStatus(refusal, 'error');
      paint(fromInitial ? '[data-evaluation-action="start-from-initial"]' : '[data-evaluation-action="start"]');
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
    // The submitted content is now fixed. Keep later typing out of the pending save, and retain each control's own
    // disabled state so a refusal restores the draft without enabling a score marked 不评 or another closed choice.
    const controls = Array.from(node.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('input, select, textarea, button'),
      (control) => ({ control, disabled: control.disabled }));
    for (const { control } of controls) control.disabled = true;
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
      for (const { control, disabled } of controls) control.disabled = disabled;
      const note = el('p', 'attention-note evaluation-refusal', refusal);
      note.setAttribute('role', 'alert');
      root.querySelector('.evaluation-refusal')?.remove();
      node.before(note);
    }
  };

  return {
    /** The drawer's bar started AI7's 初评: read it again now, keeping the form the editor is filling in. */
    refresh(): void {
      if (busy || workspace === null || !root.isConnected) return;
      const current = workspace;
      void api.inspectEvaluation({ recordId: current.record?.recordId ?? null, recordsBefore: current.recordsBefore }).then((page) => {
        if (!root.isConnected || workspace === null || busy) return;
        workspace = { ...page, record: workspace.record };
        paint(null, true);
      }).catch(() => undefined);
    },
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
