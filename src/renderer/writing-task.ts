import { createSheet, sheetContent } from './components/sheet.js';
import { startPreparedTask } from './one-action-start.js';
import type {
  DefaultExecutionRuleReference,
  ProductionDocumentProjection,
  RendererApi,
  ServiceWireJobProjection as ServiceJobProjection,
  WritingTaskProjection,
  WritingTaskTypeProjection,
} from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { taskPlanQuickStartFellBack } from './task-drawer-labels.js';
import { acknowledgeTaskMaterialRemovals, reconcileTaskMaterialSelection, similarMaterialsField } from './task-material-selection.js';
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
  writingMaterialLabel,
  writingMaterialsMore,
  writingMaterialsOverTotalNote,
  WRITING_MATERIALS_AT_LIMIT,
  writingQuickFailed,
  writingQuickStarted,
  writingQuickStarting,
  writingOpenTaskTone,
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
  /** The sheet for one type, its 稿件题目 already written when the editor wrote it first (Issue #1404). */
  open(typeId: string, title?: string): void;
  destroy(): void;
}

/**
 * The 稿件题目 an editor wrote before AI 写作 began (Issue #1404), by Book and type, for as long as the window lives: the draft is
 * made under it, and opened by itself, once the Task has written it.
 */
const rememberedTitles = new Map<string, string>();
const titleKey = (bookId: string, typeId: string): string => `${bookId}:${typeId}`;
const MAX_DOCUMENT_TITLE = 80;

type WritingApi = Partial<Pick<RendererApi, 'inspectTaskPlan' | 'authorizeWritingTask'>> & Pick<RendererApi, 'inspectWritingTask' | 'prepareWritingTask' | 'quickStartWritingTask' | 'createWritingDraft'> & Partial<Pick<RendererApi, 'searchReferableMaterials'>>;

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
  /** The 稿件题目 offered for a type until the editor writes their own (Issue #1404). */
  suggestTitle?(typeId: string): string;
  /** 稿件 hosts the sheet (Issue #1403): no opener of its own, since 新建 / 导入衍生稿件 opens it with its title and type. */
  embedded?: boolean;
  /** Whether a Task is under way or a draft waits to be opened, for the host's own line. */
  onState?(state: { underWay: boolean; drafted: number }): void;
}

/** A Run of the writing kind still going on: the page reads again until it settles. */
const UNDER_WAY: ReadonlySet<string> = new Set(['waiting', 'admitted', 'executing', 'cancelling', 'pausing', 'queued']);
const POLL_MS = 400;

/** The sheet while it is open: what the editor has chosen and written so far, and the service's last refusal. */
interface Sheet {
  /** 稿件题目, the sheet's first field (Issue #1404), and whether the editor wrote it rather than took the suggestion. */
  title: string;
  titleEdited: boolean;
  typeId: string | null;
  audience: string;
  channel: string;
  requirements: string;
  /** The 资料库 items ticked under 允许参考 (Issue #428), by identity. */
  materialIds: string[];
  problem: string | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === 'button') node.className = `${node.className} btn`.trim();
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
  const draftTitles = new Map<string, string>();
  // The types whose draft this surface opens by itself once written (Issue #1403): the editor began their AI 写作 here. Each
  // remembers the draft already waiting when it began, so only the new one opens.
  const autoOpen = new Map<string, string | null>();
  const awaitDraft = (typeId: string): void => {
    autoOpen.set(typeId, projection?.types.find((type) => type.typeId === typeId)?.drafted?.revisionId ?? null);
  };
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
      : active.dataset['writingMaterial'] !== undefined ? `[data-writing-material="${CSS.escape(active.dataset['writingMaterial'])}"]`
      : null);
    section.replaceChildren();
    section.dataset['writingState'] = page.task?.state ?? 'none';
    const draftedCount = page.types.filter((type) => type.drafted !== null).length;
    options.onState?.({ underWay: UNDER_WAY.has(page.task?.state ?? ''), drafted: draftedCount });
    // An embedded surface with nothing under way and nothing written says nothing (Issue #1403): its sheet opens from 新建.
    section.hidden = options.embedded === true && page.task === null && draftedCount === 0 && sheet === null;
    const heading = el('h3', undefined, options.embedded === true ? 'AI 写作' : WRITING_HEADING);
    heading.tabIndex = -1;
    section.append(heading);
    if (page.unavailable !== null) heading.append(' · ', el('span', 'writing-unavailable', page.unavailable));
    else section.append(el('p', 'field-note', WRITING_LEDE));
    const task = page.task;
    if (task !== null) {
      const line = el('p', 'writing-task-line', writingTaskLine(task));
      line.dataset['writingTypeId'] = task.typeId;
      // Why the Task wrote no draft — a copy of an exemplar refused — said beside its line, with nothing offered to open.
      if (task.refusal !== null) line.append(' · ', el('span', 'writing-task-refusal', task.refusal));
      const row = el('div', 'button-row');
      // The next step only for a Task that can start: one whose 范例 is gone, or that wrote no draft, is looked at, not started (#698).
      const open = action(WRITING_ACTIONS.openTask, writingOpenTaskTone(task), 'open-task', () => options.openPlan(task.taskIntentId));
      open.setAttribute('aria-controls', 'task-drawer');
      open.disabled = busy;
      row.append(open);
      section.append(line, row);
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
        const title = el('input');
        title.setAttribute('aria-label', '草稿题目');
        title.dataset['writingField'] = `draft-title-${type.drafted.revisionId}`;
        title.placeholder = '稿件题目（可选）';
        title.maxLength = MAX_DOCUMENT_TITLE;
        title.value = draftTitles.get(type.drafted.revisionId) ?? rememberedTitles.get(titleKey(page.bookId, type.typeId)) ?? '';
        title.addEventListener('input', () => draftTitles.set(type.drafted!.revisionId, title.value));
        item.append(title);
        const open = action(WRITING_ACTIONS.openDraft, 'primary', 'open-draft', () => void openDraft(type, title.value));
        open.disabled = busy;
        item.append(open);
        list.append(item);
      }
      section.append(list);
    }
    if (sheet === null && options.embedded === true) {
      // Nothing to open here: 新建 / 导入衍生稿件 opens the sheet.
    } else if (sheet === null) {
      const opener = action(WRITING_ACTIONS.open, 'secondary', 'new', () => {
        sheet = newSheet(null);
        paint('legend');
      });
      opener.disabled = busy || page.unavailable !== null;
      opener.setAttribute('aria-expanded', 'false');
      section.append(opener);
    } else {
      section.append(sheetNode(page, sheet));
    }
    if (keep !== null) section.querySelector<HTMLElement>(keep)?.focus();
    // 创建后直接打开 (Issue #1403): a draft the editor began here is made a document under its title and opened.
    if (!busy) {
      const ready = drafted.find((type) => autoOpen.has(type.typeId) && autoOpen.get(type.typeId) !== type.drafted.revisionId);
      if (ready !== undefined) {
        autoOpen.delete(ready.typeId);
        void openDraft(ready, draftTitles.get(ready.drafted.revisionId) ?? rememberedTitles.get(titleKey(page.bookId, ready.typeId)) ?? '');
      }
    }
  }

  function newSheet(typeId: string | null, title?: string): Sheet {
    const written = title !== undefined && title.trim() !== '';
    return {
      title: written ? title : typeId === null ? '' : options.suggestTitle?.(typeId) ?? '',
      titleEdited: written,
      typeId, audience: '', channel: '', requirements: '', materialIds: [], problem: null,
    };
  }

  /** The sheet: types, references, the editor's words, the four rows, and 先看计划 / 快速开始 / 取消. */
  function sheetNode(page: WritingTaskProjection, state: Sheet): HTMLElement {
    const form = el('form', 'writing-sheet');
    form.noValidate = true;
    form.addEventListener('submit', (event) => event.preventDefault());
    // 稿件题目 first (Issue #1404): the name the draft is made under, offered for the type until the editor writes their own.
    const titleWrapper = el('div', 'writing-field writing-title-field');
    const titleId = uid('title');
    const titleLabel = el('label', undefined, '稿件题目');
    titleLabel.htmlFor = titleId;
    const titleInput = el('input');
    titleInput.type = 'text';
    titleInput.id = titleId;
    titleInput.dataset['documentField'] = 'title';
    titleInput.dataset['writingField'] = 'title';
    titleInput.maxLength = MAX_DOCUMENT_TITLE;
    titleInput.value = state.title;
    titleInput.disabled = busy;
    titleInput.addEventListener('input', () => {
      state.title = titleInput.value;
      state.titleEdited = titleInput.value.trim() !== '';
      state.problem = null;
    });
    titleWrapper.append(titleLabel, titleInput);
    form.append(titleWrapper);
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
        if (!state.titleEdited) state.title = options.suggestTitle?.(type.typeId) ?? state.title;
        state.problem = null;
        paint(`input[name="writing-type"][value="${CSS.escape(type.typeId)}"]`);
      });
      const label = el('label', undefined, type.label + (type.prepare.allowed ? '' : ' · '));
      label.htmlFor = id;
      wrapper.append(input, label);
      if (!type.prepare.allowed) {
        const reason = el('span', 'writing-type-reason', type.prepare.reason);
        reason.id = uid('reason');
        input.setAttribute('aria-describedby', reason.id);
        label.append(reason);
      }
      types.append(wrapper);
    }
    form.append(types);
    const chosen = page.types.find((type) => type.typeId === state.typeId) ?? null;
    const references = el('dl', 'writing-references');
    const [synopsisTerm, evaluationTerm, exemplarTerm, materialTerm, bookTerm] = WRITING_REFERENCE_TERMS;
    references.append(
      el('dt', undefined, synopsisTerm), el('dd', undefined, page.references.synopsis),
      el('dt', undefined, evaluationTerm), el('dd', undefined, page.references.evaluation),
      el('dt', undefined, exemplarTerm), el('dd', 'writing-exemplars', chosen === null ? WRITING_EXEMPLAR_PICK_TYPE : chosen.exemplars.statement),
      el('dt', undefined, materialTerm), materialsNode(page, state),
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
    const plan = action('查看计划', 'secondary', 'plan', () => void prepare(null, true));
    const start = action('开始写作', 'primary', 'start', () => void prepare(null));
    plan.disabled = busy || page.unavailable !== null;
    start.disabled = plan.disabled;
    plan.setAttribute('aria-controls', 'task-drawer');
    const cancel = action(WRITING_ACTIONS.cancel, 'quiet', 'cancel', () => {
      sheet = null;
      paint('[data-writing-action="new"]');
    });
    cancel.disabled = busy;
    row.append(start, plan, cancel);
    form.append(row);
    const surface = createSheet('writing-task-sheet');
    const title = el('h3', undefined, '写作任务');
    title.id = uid('sheet-title');
    surface.setAttribute('aria-labelledby', title.id);
    sheetContent(surface, title, Array.from(form.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== row), row, form);
    surface.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
    surface.addEventListener('close', () => { if (!busy) { sheet = null; paint('[data-writing-action="new"]'); } });
    surface.open = true;
    return surface;
  }

  /**
   * 资料库 under 允许参考 (Issue #428; TASK-030, TASK-032): the service's statement, then one box per item this Book's Tasks may list
   * whose index extracted text — none ticked for the editor — an item that may not be ticked disabled with why, and how many
   * more there are. A ticked item is pinned in the plan at its current index build by 先看计划; nothing is read or sent here.
   */
  function materialsNode(page: WritingTaskProjection, state: Sheet): HTMLElement {
    const node = el('dd', 'writing-materials');
    const offer = page.references.materials;
    if (!busy && api.searchReferableMaterials !== undefined) node.append(similarMaterialsField({ searchReferableMaterials: api.searchReferableMaterials }, page.bookId, offer.items, new Set(state.materialIds), (id) => {
      state.materialIds.push(id); state.problem = null; paint(null);
    }));
    const statement = el('p', 'writing-materials-statement', offer.statement.replace(/。$/u, offer.more > 0 ? '' : '。'));
    if (offer.more > 0) statement.append(el('span', 'writing-materials-more', `；${writingMaterialsMore(offer.more)}`));
    node.append(statement);
    // An item no longer offered, or no longer one that may be ticked, leaves the selection with its reason (Issue #759).
    const reconciled = reconcileTaskMaterialSelection(state, offer.items, new Set(state.materialIds));
    state.materialIds = reconciled.kept;
    if (reconciled.removals.length > 0) {
      const removed = el('ul');
      for (const note of reconciled.removals) removed.append(el('li', 'writing-material-removed', note));
      node.append(removed);
    }
    const selectedCharacters = offer.items.filter((item) => state.materialIds.includes(item.materialId))
      .reduce((total, item) => total + item.characters, 0);
    if (offer.items.length > 0) {
      const list = el('ul', 'writing-material-list');
      for (const item of offer.items) {
        const id = uid('material');
        const row = el('li', 'writing-material');
        row.dataset['materialId'] = item.materialId;
        const box = el('input');
        box.type = 'checkbox';
        box.id = id;
        box.value = item.materialId;
        box.dataset['writingMaterial'] = item.materialId;
        box.checked = state.materialIds.includes(item.materialId);
        const reasonText = item.reason ?? (box.checked ? null : state.materialIds.length >= 4
          ? WRITING_MATERIALS_AT_LIMIT
          : selectedCharacters + item.characters > 6_000 ? writingMaterialsOverTotalNote(selectedCharacters + item.characters) : null);
        box.disabled = busy || !item.selectable || reasonText !== null;
        box.addEventListener('change', () => {
          acknowledgeTaskMaterialRemovals(state);
          state.materialIds = box.checked
            ? offer.items.filter((entry) => entry.materialId === item.materialId || state.materialIds.includes(entry.materialId)).map((entry) => entry.materialId)
            : state.materialIds.filter((entry) => entry !== item.materialId);
          state.problem = null;
          paint(`[data-writing-material="${CSS.escape(item.materialId)}"]`);
        });
        const label = el('label', undefined, writingMaterialLabel(item) + (reasonText === null ? '' : ' · '));
        label.htmlFor = id;
        row.append(box, label);
        if (reasonText !== null) {
          const reason = el('span', 'writing-material-reason', reasonText);
          reason.id = uid('material-reason');
          box.setAttribute('aria-describedby', reason.id);
          label.append(reason);
        }
        list.append(row);
      }
      node.append(list);
    }
    return node;
  }

  /**
   * 先看计划: the Task prepared as one cooperative job, then its plan opened in the Task Drawer, whose bar starts it. 快速开始 (S84b;
   * TASK-017, TASK-020, TASK-026) prepares it the same way and then starts the plan just frozen under `rule`, exactly as 开始任务
   * would start it; whatever would make the start differ from the rule leaves the Task at its plan, open in the drawer with the
   * reason beside the bar, and nothing recorded.
   */
  async function prepare(rule: DefaultExecutionRuleReference | null, preview = false): Promise<void> {
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
    const title = state.title.trim();
    if (title !== '') rememberedTitles.set(titleKey(projection.bookId, state.typeId), title);
    else rememberedTitles.delete(titleKey(projection.bookId, state.typeId));
    busy = true;
    options.setStatus(WRITING_STATUS.preparing, 'busy');
    paint(null);
    try {
      const job = await api.prepareWritingTask({
        typeId: state.typeId,
        audience: state.audience,
        channel: state.channel,
        requirements: state.requirements.trim().length === 0 ? null : state.requirements,
        // In the order the row offers them, so the same ticks always make the same plan (Issue #428).
        materialIds: [...state.materialIds],
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
      if (completed.kind !== 'writing-preparation' || result === null || !('consequences' in result && 'types' in result) || result.bookId !== projection?.bookId) {
        throw new Error(WRITING_STATUS.failed);
      }
      projection = result;
      sheet = null;
      const ref = result.task?.taskIntentId ?? null;
      const planEnvelopeDigest = result.task?.planEnvelopeDigest ?? null;
      if (rule === null || ref === null) {
        options.setStatus(WRITING_STATUS.prepared, 'success');
        paint(null);
        if (ref !== null) {
          if (preview) options.openPlan(ref);
          else {
            awaitDraft(state.typeId);
            await startPreparedTask(api, 'writing', ref);
            projection = await api.inspectWritingTask();
            paint(null);
            follow();
          }
        }
        return;
      }
      if (planEnvelopeDigest === null) {
        // A quick start whose preparation froze no plan stops at it, and says so (#701 review P3-5).
        const note = taskPlanQuickStartFellBack([WRITING_STATUS.quickNoPlan]);
        options.setStatus(note);
        paint(null);
        options.openPlan(ref, note);
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
    const typeId = projection?.task?.typeId ?? null;
    if (typeId !== null) awaitDraft(typeId);
    try {
      result = await api.quickStartWritingTask({ taskIntentId: ref, planEnvelopeDigest, ruleVersionId: rule.ruleVersionId });
    } catch (error) {
      busy = false;
      if (destroyed) return;
      // The plan stands prepared: the bar starts it as usual.
      // The service's own words, then where the plan stands (#701 review P3-5).
      options.setStatus(writingQuickFailed(options.errorMessage(error, '')), 'error');
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
  async function openDraft(type: WritingTaskTypeProjection & { drafted: NonNullable<WritingTaskTypeProjection['drafted']> }, title: string): Promise<void> {
    if (busy) return;
    busy = true;
    options.setStatus(WRITING_STATUS.creating, 'busy');
    paint(null);
    try {
      const created = await api.createWritingDraft({ revisionId: type.drafted.revisionId, ...(title.trim() === '' ? {} : { title }) });
      busy = false;
      rememberedTitles.delete(titleKey(created.writing.bookId, type.typeId));
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
    open: (typeId, title) => {
      sheet = newSheet(typeId, title);
      if (projection !== null) paint('legend');
      else refresh();
    },
    destroy: () => {
      destroyed = true;
      generation += 1;
      if (poll !== null) window.clearTimeout(poll);
      poll = null;
    },
  };
}
