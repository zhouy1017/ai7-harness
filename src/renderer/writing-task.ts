import type {
  DefaultExecutionRuleReference,
  ProductionDocumentProjection,
  RendererApi,
  ServiceJobProjection,
  WritingTaskProjection,
  WritingTaskTypeProjection,
} from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { taskPlanQuickStartFellBack } from './task-drawer-labels.js';
import {
  WRITING_ACTIONS,
  WRITING_CONSEQUENCE_TERMS,
  WRITING_EXEMPLAR_PICK_TYPE,
  WRITING_FIELD_HINTS,
  WRITING_FIELD_LABELS,
  WRITING_FIELD_MOST,
  WRITING_HEADING,
  WRITING_LEDE,
  WRITING_PICK_TYPE,
  WRITING_REFERENCE_HEADING,
  WRITING_REFERENCE_TERMS,
  WRITING_STATUS,
  WRITING_TYPE_LEGEND,
  writingDraftedLine,
  writingFieldTooLong,
  writingQuickNote,
  writingQuickStarted,
  writingQuickStarting,
  writingTaskLine,
} from './writing-task-labels.js';

const GRAPHEMES = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

/**
 * 新建文档 · 写作任务 on ⑥ 交付物 (Issue #432, plan slice S84a; editor-surfaces §9; V2-UX-DELIV-007, KB-004): `新建文档…` opens a
 * sheet in place — the house types to pick one of (none preselected; a type with a document or marked 本书不做 says why it
 * cannot be drafted), what AI7 will reference, the editor's audience, channel and requirements, and the four consequence rows —
 * with `先看计划`, which prepares the writing Task and opens its plan in the Task Drawer, whose bar starts it, and `快速开始`
 * (S84b): offered only under the Book's writing 默认执行规则, it prepares the Task the same way and starts it under the rule — or
 * stops at the plan, open in the drawer with the reason — and without a rule in force that matches it is shown, disabled, with
 * why. A drafted result is opened with `打开草稿`: the service makes it the type's document in its 起草 phase, and the document
 * opens on the manuscript surface.
 *
 * Everything shown is the service's projection; nothing here drafts, delivers or sends anything.
 */
export interface WritingTaskSurface {
  /** Read 新建文档 · 写作任务 again and paint it; a Run under way is followed until it settles. */
  refresh(): void;
  destroy(): void;
}

type WritingApi = Pick<RendererApi, 'inspectWritingTask' | 'prepareWritingTask' | 'quickStartWritingTask' | 'createWritingDraft'>;

export interface MountWritingTaskOptions {
  root: HTMLElement;
  api: WritingApi;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  awaitServiceJob(job: ServiceJobProjection, onProgress: (job: ServiceJobProjection) => void): Promise<ServiceJobProjection>;
  /** The writing Task's plan in the Task Drawer, whose bar starts it; `note` says why a quick start stopped there. */
  openPlan(taskIntentId: string, note?: string): void;
  /** 打开草稿's document on its own surface, as 交付物's 打开 opens one. */
  openDocument(document: ProductionDocumentProjection, type: { typeId: string; label: string }): Promise<void>;
  /** A document was made: 交付 · 生产文档 and 图书交付包 read again. */
  documentsChanged(): void;
}

/** A Run of the writing kind still going on: the page reads again until it settles. */
const UNDER_WAY: ReadonlySet<string> = new Set(['waiting', 'admitted', 'executing', 'cancelling', 'pausing', 'queued']);
const POLL_MS = 400;

/** The sheet while it is open: what the editor has chosen and written so far, and the service's last refusal. */
interface Sheet {
  typeId: string | null;
  audience: string;
  channel: string;
  requirements: string;
  problem: string | null;
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
  node.dataset['writingAction'] = name;
  node.addEventListener('click', run);
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `writing-${prefix}-${identities}`;
}

export function mountWritingTask(options: MountWritingTaskOptions): WritingTaskSurface {
  const { api, root } = options;
  let destroyed = false;
  let generation = 0;
  let projection: WritingTaskProjection | null = null;
  let sheet: Sheet | null = null;
  let busy = false;
  let poll: number | null = null;
  const section = el('section', 'writing-task');
  root.append(section);

  const follow = (): void => {
    if (poll !== null || destroyed || projection === null || !UNDER_WAY.has(projection.task?.state ?? '')) return;
    poll = window.setTimeout(() => {
      poll = null;
      if (!destroyed && !busy) refresh();
    }, POLL_MS);
  };

  function refresh(): void {
    if (destroyed) return;
    const ticket = ++generation;
    void api.inspectWritingTask().then(
      (next) => {
        if (destroyed || ticket !== generation) return;
        projection = next;
        paint(null);
        follow();
      },
      (error: unknown) => {
        if (destroyed || ticket !== generation) return;
        options.setStatus(options.errorMessage(error, WRITING_STATUS.unavailable), 'error');
      },
    );
  }

  /** Draw the section again from the projection and the sheet; focus goes to `focus` when one is named. */
  function paint(focus: string | null): void {
    if (destroyed || projection === null) return;
    const page = projection;
    // A read while the editor writes in the sheet keeps their place: the control they were in is focused again.
    const active = document.activeElement instanceof HTMLElement && section.contains(document.activeElement) ? document.activeElement : null;
    const keep = focus ?? (active === null ? null
      : active.dataset['writingField'] !== undefined ? `[data-writing-field="${active.dataset['writingField']}"]`
      : active.dataset['writingAction'] !== undefined ? `[data-writing-action="${active.dataset['writingAction']}"]`
      : active instanceof HTMLInputElement && active.name === 'writing-type' ? `input[name="writing-type"][value="${CSS.escape(active.value)}"]`
      : null);
    section.replaceChildren();
    section.dataset['writingState'] = page.task?.state ?? 'none';
    const heading = el('h3', undefined, WRITING_HEADING);
    heading.tabIndex = -1;
    section.append(heading, el('p', 'field-note', WRITING_LEDE));
    if (page.unavailable !== null) section.append(el('p', 'field-note writing-unavailable', page.unavailable));
    const task = page.task;
    if (task !== null) {
      const line = el('p', 'writing-task-line', writingTaskLine(task));
      line.dataset['writingTypeId'] = task.typeId;
      // Why the Task wrote no draft — a copy of an exemplar refused — said beside its line, with nothing offered to open.
      const refusal = task.refusal === null ? null : el('p', 'field-note writing-task-refusal', task.refusal);
      const row = el('div', 'button-row');
      const open = action(WRITING_ACTIONS.openTask, task.state === 'prepared' ? 'primary' : 'quiet', 'open-task', () => options.openPlan(task.taskIntentId));
      open.setAttribute('aria-controls', 'task-drawer');
      open.disabled = busy;
      row.append(open);
      section.append(line, ...(refusal === null ? [] : [refusal]), row);
    }
    // Each drafted result not yet made its type's document.
    const drafted = page.types.filter((type): type is WritingTaskTypeProjection & { drafted: NonNullable<WritingTaskTypeProjection['drafted']> } => type.drafted !== null);
    if (drafted.length > 0) {
      const list = el('ul', 'writing-drafted');
      for (const type of drafted) {
        const item = el('li');
        item.dataset['writingTypeId'] = type.typeId;
        item.dataset['revisionId'] = type.drafted.revisionId;
        item.append(el('p', 'writing-drafted-line', writingDraftedLine(type.label, localInstantLabel(type.drafted.createdAt))));
        const open = action(WRITING_ACTIONS.openDraft, 'primary', 'open-draft', () => void openDraft(type));
        open.disabled = busy;
        item.append(open);
        list.append(item);
      }
      section.append(list);
    }
    if (sheet === null) {
      const opener = action(WRITING_ACTIONS.open, 'secondary', 'new', () => {
        sheet = { typeId: null, audience: '', channel: '', requirements: '', problem: null };
        paint('legend');
      });
      opener.disabled = busy || page.unavailable !== null;
      opener.setAttribute('aria-expanded', 'false');
      section.append(opener);
    } else {
      section.append(sheetNode(page, sheet));
    }
    if (keep !== null) section.querySelector<HTMLElement>(keep)?.focus();
  }

  /** The sheet: types, references, the editor's words, the four rows, and 先看计划 / 快速开始 / 取消. */
  function sheetNode(page: WritingTaskProjection, state: Sheet): HTMLElement {
    const form = el('form', 'writing-sheet');
    form.noValidate = true;
    form.addEventListener('submit', (event) => event.preventDefault());
    const types = el('fieldset', 'writing-types');
    const legend = el('legend', undefined, WRITING_TYPE_LEGEND);
    legend.tabIndex = -1;
    types.append(legend);
    for (const type of page.types) {
      const id = uid('type');
      const wrapper = el('div', 'writing-type');
      wrapper.dataset['writingTypeId'] = type.typeId;
      const input = el('input');
      input.type = 'radio';
      input.name = 'writing-type';
      input.value = type.typeId;
      input.id = id;
      input.checked = state.typeId === type.typeId;
      input.disabled = busy || !type.prepare.allowed;
      input.addEventListener('change', () => {
        state.typeId = type.typeId;
        state.problem = null;
        paint(`input[name="writing-type"][value="${CSS.escape(type.typeId)}"]`);
      });
      const label = el('label', undefined, type.label);
      label.htmlFor = id;
      wrapper.append(input, label);
      if (!type.prepare.allowed) {
        const reason = el('span', 'field-note writing-type-reason', type.prepare.reason);
        reason.id = uid('reason');
        input.setAttribute('aria-describedby', reason.id);
        wrapper.append(reason);
      }
      types.append(wrapper);
    }
    form.append(types);
    const chosen = page.types.find((type) => type.typeId === state.typeId) ?? null;
    const references = el('dl', 'writing-references');
    const [synopsisTerm, evaluationTerm, exemplarTerm, bookTerm] = WRITING_REFERENCE_TERMS;
    references.append(
      el('dt', undefined, synopsisTerm), el('dd', undefined, page.references.synopsis),
      el('dt', undefined, evaluationTerm), el('dd', undefined, page.references.evaluation),
      el('dt', undefined, exemplarTerm), el('dd', 'writing-exemplars', chosen === null ? WRITING_EXEMPLAR_PICK_TYPE : chosen.exemplars.statement),
      el('dt', undefined, bookTerm), el('dd', undefined, page.references.book),
    );
    form.append(el('h4', undefined, WRITING_REFERENCE_HEADING), references);
    const field = (key: 'audience' | 'channel' | 'requirements'): HTMLElement => {
      const id = uid(key);
      const wrapper = el('div', 'writing-field');
      const label = el('label', undefined, WRITING_FIELD_LABELS[key]);
      label.htmlFor = id;
      // Every field is one line, as the service takes it (#688 review): 其他要求 too.
      const control = el('input');
      control.type = 'text';
      control.id = id;
      control.dataset['writingField'] = key;
      control.placeholder = WRITING_FIELD_HINTS[key];
      // A hard cap on what a paste holds; the exact bound, in characters as the service counts them, is checked on 先看计划.
      control.maxLength = WRITING_FIELD_MOST[key] * 2;
      control.value = state[key];
      control.disabled = busy;
      control.addEventListener('input', () => {
        state[key] = control.value;
        state.problem = null;
      });
      wrapper.append(label, control);
      return wrapper;
    };
    form.append(field('audience'), field('channel'), field('requirements'));
    const consequences = el('dl', 'writing-consequences');
    const [read, send, notDo, cost] = WRITING_CONSEQUENCE_TERMS;
    consequences.append(
      el('dt', undefined, read), el('dd', undefined, page.consequences.read),
      el('dt', undefined, send), el('dd', undefined, page.consequences.send),
      el('dt', undefined, notDo), el('dd', undefined, page.consequences.notDo),
      el('dt', undefined, cost), el('dd', undefined, page.consequences.cost),
    );
    form.append(consequences);
    if (state.problem !== null) {
      const problem = el('p', 'field-note writing-problem', state.problem);
      problem.setAttribute('role', 'alert');
      form.append(problem);
    }
    const row = el('div', 'button-row');
    const plan = action(WRITING_ACTIONS.plan, 'primary', 'plan', () => void prepare(null));
    plan.disabled = busy || page.unavailable !== null;
    plan.setAttribute('aria-controls', 'task-drawer');
    // 快速开始 is the Book's writing 默认执行规则's to give (S84b): with one in force that matches, it prepares and starts under it.
    const rule = page.quickStart.available ? page.quickStart.rule : null;
    const quick = action(WRITING_ACTIONS.quick, 'secondary', 'quick', () => {
      if (rule !== null) void prepare(rule);
    });
    quick.disabled = busy || rule === null || page.unavailable !== null;
    quick.setAttribute('aria-controls', 'task-drawer');
    if (page.quickStart.rule !== null) quick.dataset['ruleVersionId'] = page.quickStart.rule.ruleVersionId;
    const quickReason = el('p', 'field-note writing-quick-reason', rule !== null ? writingQuickNote(rule.name) : page.quickStart.reason ?? '');
    quickReason.dataset['quickStart'] = rule !== null ? 'available' : 'unavailable';
    quickReason.id = uid('quick');
    quick.setAttribute('aria-describedby', quickReason.id);
    const cancel = action(WRITING_ACTIONS.cancel, 'quiet', 'cancel', () => {
      sheet = null;
      paint('[data-writing-action="new"]');
    });
    cancel.disabled = busy;
    row.append(plan, quick, cancel);
    form.append(row, quickReason);
    return form;
  }

  /**
   * 先看计划: the Task prepared as one cooperative job, then its plan opened in the Task Drawer, whose bar starts it. 快速开始 (S84b;
   * TASK-017, TASK-020, TASK-026) prepares it the same way and then starts the plan just frozen under `rule`, exactly as 开始任务
   * would start it; whatever would make the start differ from the rule leaves the Task at its plan, open in the drawer with the
   * reason beside the bar, and nothing recorded.
   */
  async function prepare(rule: DefaultExecutionRuleReference | null): Promise<void> {
    if (busy || sheet === null || projection === null) return;
    const state = sheet;
    if (state.typeId === null) {
      state.problem = WRITING_PICK_TYPE;
      paint('legend');
      return;
    }
    const tooLong = (['audience', 'channel', 'requirements'] as const)
      .find((key) => [...GRAPHEMES.segment(state[key].trim())].length > WRITING_FIELD_MOST[key]);
    if (tooLong !== undefined) {
      state.problem = writingFieldTooLong(tooLong);
      paint(`[data-writing-field="${tooLong}"]`);
      return;
    }
    busy = true;
    options.setStatus(WRITING_STATUS.preparing, 'busy');
    paint(null);
    try {
      const job = await api.prepareWritingTask({
        typeId: state.typeId,
        audience: state.audience,
        channel: state.channel,
        requirements: state.requirements.trim().length === 0 ? null : state.requirements,
      });
      const completed = await options.awaitServiceJob(job, (next) => options.setStatus(next.progress.label, 'busy'));
      busy = false;
      if (destroyed) return;
      if (completed.state === 'cancelled') {
        options.setStatus(WRITING_STATUS.cancelled, 'success');
        paint('[data-writing-action="plan"]');
        return;
      }
      const result = completed.result;
      if (completed.kind !== 'writing-preparation' || result === null || !('quickStart' in result) || result.bookId !== projection?.bookId) {
        throw new Error(WRITING_STATUS.failed);
      }
      projection = result;
      sheet = null;
      const ref = result.task?.taskIntentId ?? null;
      const planEnvelopeDigest = result.task?.planEnvelopeDigest ?? null;
      if (rule === null || ref === null || planEnvelopeDigest === null) {
        options.setStatus(WRITING_STATUS.prepared, 'success');
        paint(null);
        if (ref !== null) options.openPlan(ref);
        return;
      }
      await quickStart(ref, planEnvelopeDigest, rule);
    } catch (error) {
      busy = false;
      if (destroyed) return;
      state.problem = options.errorMessage(error, WRITING_STATUS.failed);
      options.setStatus(state.problem, 'error');
      paint('.writing-problem');
    }
  }

  /** 快速开始's start of the plan just prepared, under the rule the editor clicked; its own failure leaves the plan prepared. */
  async function quickStart(ref: string, planEnvelopeDigest: string, rule: DefaultExecutionRuleReference): Promise<void> {
    busy = true;
    options.setStatus(writingQuickStarting(rule.name), 'busy');
    paint(null);
    let result: Awaited<ReturnType<WritingApi['quickStartWritingTask']>>;
    try {
      result = await api.quickStartWritingTask({ taskIntentId: ref, planEnvelopeDigest, ruleVersionId: rule.ruleVersionId });
    } catch (error) {
      busy = false;
      if (destroyed) return;
      // The plan stands prepared: the bar starts it as usual.
      options.setStatus(options.errorMessage(error, WRITING_STATUS.quickFailed), 'error');
      paint(null);
      options.openPlan(ref);
      return;
    }
    busy = false;
    if (destroyed || result.projection.bookId !== projection?.bookId) return;
    projection = result.projection;
    paint(null);
    if (result.outcome === 'started') {
      options.setStatus(writingQuickStarted(rule.name, result.projection.task?.state === 'authorized-blocked'), 'success');
      options.openPlan(ref);
      follow();
      return;
    }
    const note = taskPlanQuickStartFellBack(result.reasons);
    options.setStatus(note);
    options.openPlan(ref, note);
  }

  /** 打开草稿: the drafted result made the type's document in its 起草 phase, then opened on the manuscript surface. */
  async function openDraft(type: WritingTaskTypeProjection & { drafted: NonNullable<WritingTaskTypeProjection['drafted']> }): Promise<void> {
    if (busy) return;
    busy = true;
    options.setStatus(WRITING_STATUS.creating, 'busy');
    paint(null);
    try {
      const created = await api.createWritingDraft({ revisionId: type.drafted.revisionId });
      busy = false;
      if (destroyed) return;
      projection = created.writing;
      options.documentsChanged();
      paint(null);
      await options.openDocument(created.document, { typeId: created.typeId, label: created.typeLabel });
    } catch (error) {
      busy = false;
      if (destroyed) return;
      options.setStatus(options.errorMessage(error, WRITING_STATUS.openFailed), 'error');
      paint('.writing-task h3');
    }
  }

  return {
    refresh,
    destroy: () => {
      destroyed = true;
      generation += 1;
      if (poll !== null) window.clearTimeout(poll);
      poll = null;
    },
  };
}
