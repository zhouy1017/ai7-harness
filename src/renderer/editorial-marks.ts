import type { BoundedEditor } from './editor.js';
import type {
  EditorClipboardCommand,
  EditorialMarkAnchorProjection,
  EditorialMarkCardProjection,
  EditorialMarkCommandProjection,
  EditorialMarkKind,
  PersonalHighlightColor,
  RendererApi,
  UpdateEditorialMarkInput,
} from '../shared/protocol.js';
import {
  DECISION_REASON_CHIPS,
  HIGHLIGHT_COLOR_LABELS,
  MARK_KIND_LABELS,
  markSourceLine,
  markStateLabel,
  markTimeLabel,
  selectionMenuReason,
} from './editorial-mark-labels.js';

/**
 * The Editorial Mark surface of the manuscript (Issue #407; editor-surfaces.md §1 标记系统 and 右键菜单;
 * V2-UX-MARK-001 to 008, TASK-046). It owns three floating things over the text column — the
 * selection or mark menu, a composer, and the Mark Card — and nothing else: marks are drawn by the
 * editor as decorations, stored by the service, and every command answers with the window's marks.
 * Nothing here changes a character of the manuscript.
 */
export interface EditorialMarksSurface {
  /** Close whatever is floating: the blocks it was anchored to may be gone. */
  close(): void;
  /**
   * Whether the pane's position is this surface's doing: a composer or a Mark Card is open — bringing
   * one into view may rest the pane at its edge — or one just closed and the pane, shorter by the
   * card's height, was put back where it now ends. Neither is the reader asking for the next window.
   */
  ownsScroll(): boolean;
  destroy(): void;
}

interface MountOptions {
  scroll: HTMLElement;
  host: HTMLElement;
  editor: BoundedEditor;
  api: Pick<
    RendererApi,
    'createEditorialMark' | 'getEditorialMarkCard' | 'updateEditorialMark' | 'recordChangeSuggestionDecision' |
    'recordProposalDecisionReason' | 'runEditorClipboardCommand'
  >;
  busy(): boolean;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
}

interface FormField {
  name: 'body' | 'proposedText' | 'rationale' | 'reason';
  label: string;
  value: string;
  required: boolean;
  hint?: string;
}

interface FormConfig {
  id: string;
  title: string;
  quote: string | null;
  fields: ReadonlyArray<FormField>;
  submitLabel: string;
  note?: string;
  submit(values: Readonly<Record<FormField['name'], string>>): Promise<void>;
  cancel(): void;
}

interface MenuItem {
  action: string;
  label: string;
  hint?: string;
  disabledReason?: string;
  swatch?: PersonalHighlightColor;
  run?(): void;
}

interface MenuGroup {
  label: string;
  note?: string;
  items: ReadonlyArray<MenuItem>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const CONVERT_LABELS: Readonly<Record<EditorialMarkKind, string>> = {
  'change-suggestion': '提出修改建议',
  annotation: '转为批注',
  'editor-note': '转为备注',
  'personal-highlight': '加高亮',
};

export function mountEditorialMarks(options: MountOptions): EditorialMarksSurface {
  const { editor, api } = options;
  const layer = el('div', 'editorial-mark-layer');
  options.scroll.append(layer);
  // A composer and a Mark Card belong to their paragraph and scroll with it. A menu belongs to the
  // pointer: it floats over the window in a layer of its own, so opening one can never change the
  // text pane's scrollable area — a scrollbar the menu itself brought in used to resize the pane,
  // and the pane's resize closed the menu the moment it opened on a small window.
  const menuLayer = el('div', 'editorial-mark-menu-layer');
  document.body.append(menuLayer);
  let destroyed = false;
  let menu: HTMLElement | undefined;
  let floating: HTMLElement | undefined;
  let floatingBlockId: string | undefined;
  let openCardId: string | undefined;
  let collapsedBeforeContextClick = true;
  let working = false;
  let closedAt: { top: number } | undefined;

  const binding = (): { manuscriptId: string; branchId: string; windowStartBlockId: string } => {
    const current = editor.currentWindow();
    return { manuscriptId: current.manuscriptId, branchId: current.branchId, windowStartBlockId: current.blocks[0]!.blockId };
  };

  const blockElement = (blockId: string): HTMLElement | null =>
    options.host.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);

  /** Below the paragraph and aligned to the text column (V2-UX-MARK-003). */
  const placeBelowBlock = (node: HTMLElement, blockId: string): void => {
    const block = blockElement(blockId);
    const base = options.scroll.getBoundingClientRect();
    const rect = (block ?? options.host).getBoundingClientRect();
    node.style.top = `${rect.bottom - base.top + options.scroll.scrollTop + 6}px`;
    node.style.left = `${rect.left - base.left + options.scroll.scrollLeft}px`;
    node.style.width = `${rect.width}px`;
  };

  const closeMenu = (): void => {
    menu?.remove();
    menu = undefined;
  };

  const closeFloating = (): void => {
    if (floating !== undefined) {
      floating.remove();
      // Where the pane rests once the card's height is gone. The mark lapses two frames on, past the
      // frame that dispatches the `scroll` event of that adjustment, exactly as the editor's own does.
      const mark = { top: options.scroll.scrollTop };
      closedAt = mark;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (closedAt === mark) closedAt = undefined;
      }));
    }
    floating = undefined;
    floatingBlockId = undefined;
    if (openCardId !== undefined) {
      openCardId = undefined;
      editor.setActiveMark(null);
    }
  };

  const close = (): void => {
    closeMenu();
    closeFloating();
  };

  const refuseWhileBusy = (): boolean => {
    if (!options.busy() && !working) return false;
    options.setStatus('稿件正在处理另一项操作，请稍候再试。', 'busy');
    return true;
  };

  const applyCommand = (result: EditorialMarkCommandProjection): void => {
    editor.setMarks(result.marks, result.marksTruncated);
  };

  /** Run one mark command: refused while another is in flight, and every failure is said in words. */
  const command = async (run: () => Promise<void>, failure: string): Promise<boolean> => {
    if (destroyed || refuseWhileBusy()) return false;
    working = true;
    try {
      await run();
      return true;
    } catch (error) {
      options.setStatus(options.errorMessage(error, failure), 'error');
      return false;
    } finally {
      working = false;
    }
  };

  const buildForm = (config: FormConfig): HTMLFormElement => {
    const form = el('form', 'editorial-mark-form');
    form.dataset['markForm'] = config.id;
    form.noValidate = true;
    form.append(el('h4', undefined, config.title));
    if (config.quote !== null) {
      const quote = el('blockquote', 'editorial-mark-quote', config.quote);
      quote.dataset['markQuote'] = 'pinned';
      form.append(quote);
    }
    const inputs = new Map<FormField['name'], HTMLTextAreaElement>();
    for (const field of config.fields) {
      const label = el('label', 'editorial-mark-field');
      label.append(el('span', undefined, field.label));
      const input = el('textarea');
      input.name = field.name;
      input.rows = field.name === 'rationale' || field.name === 'reason' ? 2 : 3;
      input.value = field.value;
      input.required = field.required;
      input.dataset['markField'] = field.name;
      label.append(input);
      if (field.hint) label.append(el('small', 'muted', field.hint));
      inputs.set(field.name, input);
      form.append(label);
    }
    const problem = el('p', 'editorial-mark-problem');
    problem.setAttribute('role', 'alert');
    problem.hidden = true;
    const submit = el('button', 'primary', config.submitLabel);
    submit.type = 'submit';
    submit.dataset['markAction'] = 'submit';
    const cancel = el('button', 'quiet', '取消');
    cancel.type = 'button';
    cancel.dataset['markAction'] = 'cancel';
    cancel.addEventListener('click', () => config.cancel());
    const row = el('div', 'button-row');
    row.append(submit, cancel);
    form.append(problem, row);
    if (config.note) form.append(el('p', 'muted', config.note));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = { body: '', proposedText: '', rationale: '', reason: '' };
      for (const [name, input] of inputs) values[name] = input.value;
      const missing = config.fields.find((field) => field.required && values[field.name].trim().length === 0);
      if (missing) {
        problem.textContent = `请填写「${missing.label}」。`;
        problem.hidden = false;
        inputs.get(missing.name)?.focus();
        return;
      }
      problem.hidden = true;
      submit.disabled = true;
      void config.submit(values).finally(() => {
        submit.disabled = false;
      });
    });
    queueMicrotask(() => inputs.values().next().value?.focus());
    return form;
  };

  const openComposer = (blockId: string, config: FormConfig): void => {
    close();
    const composer = el('section', 'editorial-mark-composer');
    composer.setAttribute('role', 'dialog');
    composer.setAttribute('aria-label', config.title);
    composer.dataset['markComposer'] = config.id;
    composer.append(buildForm(config));
    placeBelowBlock(composer, blockId);
    layer.append(composer);
    floating = composer;
    floatingBlockId = blockId;
    composer.scrollIntoView({ block: 'nearest' });
  };

  /** Make a mark on what is selected now; the journal is settled first so the range is durable text. */
  const createFromSelection = async (
    kind: EditorialMarkKind,
    content: { highlightColor: PersonalHighlightColor | null; body: string; proposedText: string | null; rationale: string | null },
    range: Extract<ReturnType<BoundedEditor['selectedRange']>, { kind: 'range' }>,
    done: string,
  ): Promise<boolean> => command(async () => {
    await editor.flush();
    const current = editor.currentWindow();
    const result = await api.createEditorialMark({
      ...binding(),
      clientMarkId: crypto.randomUUID(),
      baseRevisionId: current.revisionId,
      expectedJournalSequence: current.journalSequence,
      blockId: range.blockId,
      baseBlockDigest: range.blockDigest,
      fromGrapheme: range.fromGrapheme,
      toGrapheme: range.toGrapheme,
      selectedText: range.text,
      kind,
      ...content,
    });
    applyCommand(result);
    options.setStatus(done, 'success');
  }, '标记未能添加。');

  const settledRange = async (): Promise<Extract<ReturnType<BoundedEditor['selectedRange']>, { kind: 'range' }> | null> => {
    await editor.flush();
    const range = editor.selectedRange();
    if (range.kind === 'range') return range;
    options.setStatus(selectionMenuReason(range.kind), 'error');
    return null;
  };

  const composeNewMark = async (kind: 'annotation' | 'editor-note' | 'change-suggestion'): Promise<void> => {
    if (refuseWhileBusy()) return;
    const range = await settledRange();
    if (range === null) return;
    const suggestion = kind === 'change-suggestion';
    openComposer(range.blockId, {
      id: `create-${kind}`,
      title: suggestion ? '提出修改建议' : kind === 'annotation' ? '添加批注' : '添加备注',
      quote: range.text,
      fields: suggestion
        ? [
            { name: 'proposedText', label: '改为', value: range.text, required: false, hint: '留空表示删去这段文字。' },
            { name: 'rationale', label: '修改理由（可选）', value: '', required: false },
          ]
        : [{ name: 'body', label: kind === 'annotation' ? '批注内容' : '备注内容', value: '', required: true }],
      submitLabel: suggestion ? '提出修改建议' : kind === 'annotation' ? '添加批注' : '添加备注',
      note: suggestion
        ? '修改建议替换原文，待接受；提出后稿件本身不变。'
        : kind === 'annotation' ? '批注随稿件导出（导出时可选不含批注）。' : '备注仅自己可见：不随稿件导出，也不会发送给模型。',
      submit: async (values) => {
        const made = await createFromSelection(
          kind,
          suggestion
            ? { highlightColor: null, body: '', proposedText: values.proposedText, rationale: values.rationale.trim().length > 0 ? values.rationale : null }
            : { highlightColor: null, body: values.body, proposedText: null, rationale: null },
          range,
          suggestion ? '已提出修改建议；稿件本身未改动。' : kind === 'annotation' ? '已添加批注。' : '已添加备注。',
        );
        if (made) {
          closeFloating();
          editor.focus();
        }
      },
      cancel: () => {
        closeFloating();
        editor.focus();
      },
    });
  };

  const update = (
    markId: string,
    action: UpdateEditorialMarkInput['action'],
    extra: Partial<Pick<UpdateEditorialMarkInput, 'body' | 'highlightColor' | 'status' | 'targetKind' | 'proposedText' | 'rationale'>>,
  ): Promise<EditorialMarkCommandProjection> => api.updateEditorialMark({
    ...binding(),
    markId,
    action,
    body: null,
    highlightColor: null,
    status: null,
    targetKind: null,
    proposedText: null,
    rationale: null,
    ...extra,
  });

  /** Apply one change to a mark and show what it became: its card, or nothing when it has none now. */
  const change = (
    markId: string,
    action: UpdateEditorialMarkInput['action'],
    extra: Parameters<typeof update>[2],
    done: string,
  ): Promise<boolean> => command(async () => {
    const result = await update(markId, action, extra);
    applyCommand(result);
    options.setStatus(done, 'success');
    if (result.card !== null && result.card.kind !== 'personal-highlight') showCard(result.card);
    else closeFloating();
  }, '标记未能更新。');

  const convertForm = (
    source: { markId: string; kind: EditorialMarkKind; blockId: string; pinnedText: string; body: string },
    target: EditorialMarkKind,
    cancel: () => void,
  ): FormConfig => {
    const suggestion = target === 'change-suggestion';
    return {
      id: `convert-${target}`,
      title: CONVERT_LABELS[target],
      quote: source.pinnedText,
      fields: suggestion
        ? [
            { name: 'proposedText', label: '改为', value: source.pinnedText, required: false, hint: '留空表示删去这段文字。' },
            { name: 'rationale', label: '修改理由（可选）', value: source.kind === 'annotation' || source.kind === 'editor-note' ? source.body : '', required: false },
          ]
        : [{ name: 'body', label: target === 'annotation' ? '批注内容' : '备注内容', value: source.body, required: true }],
      submitLabel: CONVERT_LABELS[target],
      submit: async (values) => {
        await change(source.markId, 'convert', suggestion
          ? { targetKind: target, proposedText: values.proposedText, rationale: values.rationale.trim().length > 0 ? values.rationale : null }
          : { targetKind: target, body: values.body },
        `已${CONVERT_LABELS[target].replace('提出', '转为')}。`);
      },
      cancel,
    };
  };

  const copyMarkedText = (mark: Pick<EditorialMarkAnchorProjection, 'blockId' | 'fromGrapheme' | 'toGrapheme'>): void => {
    close();
    if (!editor.selectRange(mark.blockId, mark.fromGrapheme, mark.toGrapheme)) {
      options.setStatus('请先等待当前写入完成，再复制这段文字。', 'error');
      return;
    }
    void runClipboard('copy');
  };

  const runClipboard = async (clipboardCommand: EditorClipboardCommand): Promise<void> => {
    closeMenu();
    editor.focus();
    try {
      await api.runEditorClipboardCommand({ command: clipboardCommand });
    } catch (error) {
      options.setStatus(options.errorMessage(error, '文字处理未完成。'), 'error');
    }
  };

  const region = (name: string, title: string, ...children: Array<Node | string>): HTMLElement => {
    const section = el('section', 'editorial-mark-region');
    section.dataset['markRegion'] = name;
    section.append(el('h4', undefined, title), ...children);
    return section;
  };

  const actionButton = (action: string, label: string, tone: 'primary' | 'secondary' | 'quiet', run: () => void): HTMLButtonElement => {
    const control = el('button', tone, label);
    control.type = 'button';
    control.dataset['markAction'] = action;
    control.addEventListener('click', run);
    return control;
  };

  const disabledAction = (action: string, label: string, reason: string): HTMLElement => {
    const wrap = el('span', 'editorial-mark-unavailable');
    const control = el('button', 'secondary', label);
    control.type = 'button';
    control.disabled = true;
    control.dataset['markAction'] = action;
    const why = el('small', 'muted', reason);
    why.id = `mark-reason-${action}-${crypto.randomUUID()}`;
    control.setAttribute('aria-describedby', why.id);
    wrap.append(control, why);
    return wrap;
  };

  const basisList = (card: EditorialMarkCardProjection): HTMLElement => {
    if (card.basis.length === 0) return el('p', 'muted', '这条标记没有附带依据与核查记录。');
    const list = el('ul', 'editorial-mark-basis');
    for (const basis of card.basis) {
      const item = el('li');
      item.append(el('strong', undefined, basis.label));
      if (basis.quote !== null) item.append(el('span', 'editorial-mark-basis-quote', `「${basis.quote}」`));
      list.append(item);
    }
    return list;
  };

  function showCard(card: EditorialMarkCardProjection, form?: (cancel: () => void) => FormConfig): void {
    closeMenu();
    floating?.remove();
    const panel = el('section', 'editorial-mark-card');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `${MARK_KIND_LABELS[card.kind]}浮卡`);
    panel.dataset['markCard'] = card.markId;
    panel.dataset['markKind'] = card.kind;
    panel.dataset['markAnchor'] = card.anchorState;

    const header = el('header', 'editorial-mark-card-header');
    const kindLabel = el('span', `editorial-mark-kind editorial-mark-kind-${card.kind}`, MARK_KIND_LABELS[card.kind]);
    const source = el('span', 'editorial-mark-source', `${markSourceLine(card)} · ${markTimeLabel(card.createdAt)}`);
    source.dataset['markSource'] = card.source.kind;
    const state = el('span', 'status-pill', markStateLabel(card));
    state.dataset['markState'] = card.suggestion?.decision?.disposition ?? card.status;
    const dismiss = actionButton('close', '关闭', 'quiet', () => {
      closeFloating();
      editor.focus();
    });
    header.append(kindLabel, source, state, dismiss);
    panel.append(header);

    if (card.anchorState !== 'exact') {
      const drifted = el('p', 'editorial-mark-drifted', `原文已变：标记时的文字是「${card.pinnedText}」，这段文字后来改过，标记仍留在原处。`);
      drifted.dataset['markDrifted'] = 'true';
      panel.append(drifted);
    }

    const reopen = (): void => showCard(card);
    const exact = card.anchorState === 'exact';
    const disposition = el('div', 'button-row');
    const convertOrExplain = (target: EditorialMarkKind): HTMLElement => exact
      ? actionButton(`convert-${target}`, CONVERT_LABELS[target], 'secondary', () => {
          if (card.kind === 'editor-note' && target === 'annotation') {
            void change(card.markId, 'convert', { targetKind: 'annotation' }, '已转为批注；它会随稿件导出。');
          } else if (card.kind === 'change-suggestion') {
            void change(card.markId, 'convert', { targetKind: 'annotation' }, '已转为批注。');
          } else {
            showCard(card, (cancel) => convertForm(card, target, cancel));
          }
        })
      : disabledAction(`convert-${target}`, CONVERT_LABELS[target], '原文已变，无法在这段文字上转换。');

    if (card.kind === 'change-suggestion' && card.suggestion !== null) {
      const suggestion = card.suggestion;
      const decision = suggestion.decision;
      const shown = decision?.editedText ?? suggestion.proposedText;
      const content = el('p', 'editorial-mark-change');
      const from = el('del', undefined, suggestion.currentText);
      const to = el('ins', undefined, shown.length === 0 ? '（删去）' : shown);
      content.append(from, ' → ', to);
      panel.append(
        region('content', '修改内容', content, el('p', 'muted', exact && decision?.disposition !== 'rejected'
          ? '正文里显示的是替换后的样子（预览 · 未应用）；稿件本身仍是原文。'
          : '稿件本身仍是原文。')),
        region('rationale', '修改理由', el('p', undefined, suggestion.rationale.length > 0 ? suggestion.rationale : '没有填写修改理由。')),
        region('basis', '依据与核查', basisList(card)),
      );
      const yours = region('disposition', '你的处理');
      if (decision === null) {
        disposition.append(
          disabledAction('accept-and-apply', '接受并应用', '一键写入稿件尚未接通；现在可以拒绝，或先记录「修改后接受」。'),
          actionButton('reject', '拒绝', 'secondary', () => void decide(card, 'rejected', null, null)),
          exact
            ? actionButton('accept-with-edit', '修改后接受', 'secondary', () => showCard(card, (cancel) => ({
                id: 'accept-with-edit',
                title: '修改后接受',
                quote: suggestion.currentText,
                fields: [
                  { name: 'proposedText', label: '编辑建议文本', value: suggestion.proposedText, required: false, hint: '留空表示删去这段文字。' },
                  { name: 'reason', label: '为什么这样改？（可选 · 帮助 AI7 学习你的判断）', value: '', required: false },
                ],
                submitLabel: '记录修改后接受',
                note: '这一步只记录你的处理；写入稿件随「接受并应用」接通后进行。',
                submit: (values) => decide(card, 'accepted-with-edit', values.proposedText, values.reason.trim().length > 0 ? values.reason : null),
                cancel,
              })))
            : disabledAction('accept-with-edit', '修改后接受', '原文已变，无法接受这条修改建议。'),
          convertOrExplain('annotation'),
        );
        yours.append(disposition, el('p', 'muted', '都不预选。'));
      } else {
        const recorded = el('p', 'editorial-mark-recorded', decision.disposition === 'rejected'
          ? '已拒绝 · 原文保留'
          : '已记录 · 修改后接受（尚未写入稿件）');
        recorded.dataset['markDecision'] = decision.disposition;
        disposition.append(actionButton('withdraw', '撤回', 'quiet', () => void decide(card, 'withdrawn', null, null)));
        yours.append(recorded, disposition);
        if (decision.reason !== null) {
          const reason = el('p', 'muted', `你的原因：${decision.reason}`);
          reason.dataset['markReason'] = decision.reasonSource ?? '';
          yours.append(reason);
        } else {
          yours.append(reasonChips(card, decision.decisionId, decision.disposition));
        }
      }
      if (card.source.kind === 'ai7') yours.append(disabledAction('view-task', '查看任务', '任务面接通后可以从这里打开。'));
      if (form) yours.append(buildForm(form(reopen)));
      panel.append(yours);
    } else {
      const body = el('p', 'editorial-mark-body', card.body);
      body.dataset['markBody'] = card.kind;
      panel.append(region('content', card.kind === 'annotation' ? '批注内容' : '备注内容', body));
      if (card.replies.length > 0) {
        const replies = el('ol', 'editorial-mark-replies');
        for (const reply of card.replies) {
          const item = el('li');
          item.append(el('span', undefined, reply.body), el('small', 'muted', ` · 你 · ${markTimeLabel(reply.createdAt)}`));
          replies.append(item);
        }
        panel.append(region('replies', '回复', replies));
      }
      if (card.kind === 'annotation' && (card.basis.length > 0 || card.source.kind === 'ai7')) panel.append(region('basis', '依据', basisList(card)));
      const yours = region('disposition', '你的处理');
      if (card.kind === 'annotation') {
        disposition.append(
          actionButton('reply', '回复', 'secondary', () => showCard(card, (cancel) => ({
            id: 'reply',
            title: '回复',
            quote: null,
            fields: [{ name: 'body', label: '回复内容', value: '', required: true }],
            submitLabel: '发送回复',
            submit: async (values) => { await change(card.markId, 'reply', { body: values.body }, '已回复。'); },
            cancel,
          }))),
          card.status === 'open'
            ? actionButton('resolve', '标记为已处理', 'secondary', () => void change(card.markId, 'set-status', { status: 'resolved' }, '已标记为已处理。'))
            : actionButton('reopen', '重新打开', 'secondary', () => void change(card.markId, 'set-status', { status: 'open' }, '已重新打开。')),
          convertOrExplain('change-suggestion'),
        );
        if (card.source.kind === 'ai7') disposition.append(disabledAction('view-task', '查看任务', '任务面接通后可以从这里打开。'));
      } else {
        disposition.append(convertOrExplain('annotation'), convertOrExplain('change-suggestion'));
      }
      if (card.source.kind === 'editor') {
        disposition.prepend(actionButton('edit', '编辑', 'secondary', () => showCard(card, (cancel) => ({
          id: 'edit',
          title: card.kind === 'annotation' ? '编辑批注' : '编辑备注',
          quote: null,
          fields: [{ name: 'body', label: card.kind === 'annotation' ? '批注内容' : '备注内容', value: card.body, required: true }],
          submitLabel: '保存',
          submit: async (values) => { await change(card.markId, 'edit-body', { body: values.body }, '已保存。'); },
          cancel,
        }))));
      }
      disposition.append(actionButton('remove', '删除', 'quiet', () => void change(card.markId, 'remove', {}, card.kind === 'annotation' ? '已删除批注。' : '已删除备注。')));
      yours.append(disposition);
      if (form) yours.append(buildForm(form(reopen)));
      panel.append(yours, el('p', 'muted', card.kind === 'annotation'
        ? '批注随稿件导出（导出时可选不含批注）。'
        : '不随稿件导出，也不会发送给模型。'));
    }

    const technical = el('details', 'technical-details');
    technical.append(el('summary', undefined, '查看技术详情'));
    const identities = el('dl');
    const identityRows: Array<readonly [string, string]> = [
      ['标记标识', card.markId],
      ['标记时的修订版', `${card.pin.revisionLabel} · ${card.pin.revisionId}`],
      ['标记时的修订日志序号', String(card.pin.journalSequence)],
      ['标记时的内容块摘要', card.pin.blockDigest],
      ['内容块', `${card.blockId} · 字素 ${card.fromGrapheme}–${card.toGrapheme}`],
    ];
    if (card.suggestion) identityRows.push(['提案修改项', card.suggestion.itemId]);
    if (card.suggestion?.decision) identityRows.push(['提案决定', card.suggestion.decision.decisionId]);
    for (const [term, value] of identityRows) {
      identities.append(el('dt', undefined, term), el('dd', undefined, value));
    }
    technical.append(identities);
    panel.append(technical);

    placeBelowBlock(panel, card.blockId);
    layer.append(panel);
    floating = panel;
    floatingBlockId = card.blockId;
    openCardId = card.markId;
    panel.scrollIntoView({ block: 'nearest' });
    const previews = card.suggestion !== null && card.anchorState === 'exact' && card.suggestion.decision?.disposition !== 'rejected';
    editor.setActiveMark({
      markId: card.markId,
      previewText: previews ? card.suggestion!.decision?.editedText ?? card.suggestion!.proposedText : null,
    });
    if (!form) dismiss.focus({ preventScroll: true });
  }

  function reasonChips(card: EditorialMarkCardProjection, decisionId: string, disposition: 'rejected' | 'accepted-with-edit'): HTMLElement {
    const wrap = el('div', 'editorial-mark-reasons');
    wrap.dataset['markReasons'] = disposition;
    wrap.append(el('p', 'muted', disposition === 'rejected' ? '为什么拒绝？（可选）' : '为什么这样改？（可选）'));
    const row = el('div', 'button-row');
    const record = (reason: string, reasonSource: 'suggested' | 'free-text'): void => void command(async () => {
      const result = await api.recordProposalDecisionReason({ ...binding(), markId: card.markId, decisionId, reason, reasonSource });
      applyCommand(result);
      options.setStatus('已记下你的原因。', 'success');
      if (result.card) showCard(result.card);
    }, '原因未能记录。');
    for (const chip of DECISION_REASON_CHIPS[disposition]) {
      const control = actionButton('reason-chip', chip, 'quiet', () => record(chip, 'suggested'));
      control.dataset['markReasonChip'] = chip;
      row.append(control);
    }
    row.append(actionButton('reason-own', '自行输入', 'quiet', () => showCard(card, (cancel) => ({
      id: 'decision-reason',
      title: '你的原因',
      quote: null,
      fields: [{ name: 'reason', label: '原因', value: '', required: true }],
      submitLabel: '记下原因',
      submit: async (values) => record(values.reason, 'free-text'),
      cancel,
    }))));
    wrap.append(row);
    return wrap;
  }

  async function decide(
    card: EditorialMarkCardProjection,
    disposition: 'rejected' | 'accepted-with-edit' | 'withdrawn',
    editedText: string | null,
    reason: string | null,
  ): Promise<void> {
    await command(async () => {
      const result = await api.recordChangeSuggestionDecision({
        ...binding(),
        markId: card.markId,
        clientDecisionId: crypto.randomUUID(),
        disposition,
        editedText,
        reason,
      });
      applyCommand(result);
      options.setStatus(
        disposition === 'rejected' ? '已拒绝这条修改建议；原文保留。'
          : disposition === 'withdrawn' ? '已撤回你的处理。'
            : '已记录「修改后接受」；稿件尚未改动。',
        'success',
      );
      if (result.card) showCard(result.card);
    }, '你的处理未能记录。');
  }

  const openCard = async (markId: string, form?: (card: EditorialMarkCardProjection, cancel: () => void) => FormConfig): Promise<void> => {
    if (destroyed) return;
    try {
      const current = editor.currentWindow();
      const card = await api.getEditorialMarkCard({ manuscriptId: current.manuscriptId, branchId: current.branchId, markId });
      if (destroyed) return;
      showCard(card, form ? (cancel) => form(card, cancel) : undefined);
    } catch (error) {
      options.setStatus(options.errorMessage(error, '无法打开这条标记。'), 'error');
    }
  };

  const showMenu = (kind: 'selection' | 'mark', title: string, groups: ReadonlyArray<MenuGroup>, at: { x: number; y: number }): void => {
    close();
    const panel = el('div', 'editorial-mark-menu');
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', title);
    panel.dataset['markMenu'] = kind;
    const controls: HTMLButtonElement[] = [];
    for (const group of groups) {
      const section = el('div', 'editorial-mark-menu-group');
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', group.label);
      section.append(el('p', 'section-label', group.label));
      for (const item of group.items) {
        const control = el('button', 'editorial-mark-menu-item');
        control.type = 'button';
        control.setAttribute('role', 'menuitem');
        control.dataset['markAction'] = item.action;
        if (item.swatch !== undefined) {
          control.dataset['markColor'] = String(item.swatch);
          control.append(el('span', 'editorial-mark-swatch'));
        }
        control.append(el('span', undefined, item.label));
        if (item.hint) control.append(el('small', 'muted', item.hint));
        if (item.disabledReason !== undefined || item.run === undefined) {
          control.disabled = true;
          control.setAttribute('aria-disabled', 'true');
          if (item.disabledReason) control.title = item.disabledReason;
        } else {
          const run = item.run;
          control.addEventListener('click', () => {
            closeMenu();
            run();
          });
        }
        controls.push(control);
        section.append(control);
      }
      if (group.note) section.append(el('small', 'muted', group.note));
      panel.append(section);
    }
    panel.addEventListener('keydown', (event) => {
      const enabled = controls.filter((control) => !control.disabled);
      const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
      let next: HTMLButtonElement | undefined;
      if (event.key === 'ArrowDown') next = enabled[(index + 1) % enabled.length];
      else if (event.key === 'ArrowUp') next = enabled[(index - 1 + enabled.length) % enabled.length];
      else if (event.key === 'Home') next = enabled[0];
      else if (event.key === 'End') next = enabled.at(-1);
      else if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        closeMenu();
        editor.focus();
        return;
      } else return;
      event.preventDefault();
      next?.focus();
    });
    panel.style.left = `${at.x}px`;
    panel.style.top = `${at.y}px`;
    menuLayer.append(panel);
    menu = panel;
    // Keep the menu inside the window.
    const rect = panel.getBoundingClientRect();
    const overflowX = rect.right - (window.innerWidth - 8);
    const overflowY = rect.bottom - (window.innerHeight - 8);
    if (overflowX > 0) panel.style.left = `${Math.max(8, at.x - overflowX)}px`;
    if (overflowY > 0) panel.style.top = `${Math.max(8, at.y - overflowY)}px`;
    controls.find((control) => !control.disabled)?.focus({ preventScroll: true });
  };

  const AI7_TASK_REASON = '任务面接通后可用';
  const aiTaskGroup = (): MenuGroup => ({
    label: 'AI7 任务',
    note: AI7_TASK_REASON,
    items: [
      { action: 'task-on-selection', label: '就这段发起任务…', disabledReason: AI7_TASK_REASON },
      { action: 'ask-on-selection', label: '就这段提问…', hint: '对话，不改稿件', disabledReason: AI7_TASK_REASON },
      { action: 'preset-polish', label: '润色这段', hint: '常用工序 · 生成修改建议', disabledReason: AI7_TASK_REASON },
      { action: 'preset-names', label: '核查人名与称谓一致', hint: '常用工序 · 生成批注 / 建议', disabledReason: AI7_TASK_REASON },
      { action: 'preset-continuity', label: '检查与前文的连贯', hint: '常用工序 · 生成批注', disabledReason: AI7_TASK_REASON },
    ],
  });

  const showSelectionMenu = (at: { x: number; y: number }): void => {
    const range = editor.selectedRange();
    const markable = range.kind === 'range' || range.kind === 'unsettled';
    const why = markable ? undefined : selectionMenuReason(range.kind);
    const selected = range.kind === 'range' ? `已选 ${range.toGrapheme - range.fromGrapheme} 字` : range.kind === 'none' ? '未选中文字' : '已选中文字';
    const needsSelection = range.kind === 'none' ? '先选中文字' : undefined;
    showMenu('selection', '稿件右键菜单', [
      {
        label: `文字处理 · ${selected}`,
        items: [
          { action: 'cut', label: '剪切', ...(needsSelection ? { disabledReason: needsSelection } : { run: () => void runClipboard('cut') }) },
          { action: 'copy', label: '复制', ...(needsSelection ? { disabledReason: needsSelection } : { run: () => void runClipboard('copy') }) },
          { action: 'paste', label: '粘贴', run: () => void runClipboard('paste') },
          { action: 'paste-plain-text', label: '粘贴为纯文本', run: () => void runClipboard('paste-plain-text') },
        ],
      },
      {
        label: '编辑标记',
        ...(why ? { note: why } : {}),
        items: [
          { action: 'add-change-suggestion', label: '提出修改建议', hint: '替换原文，待接受', ...(why ? { disabledReason: why } : { run: () => void composeNewMark('change-suggestion') }) },
          { action: 'add-annotation', label: '添加批注', hint: '可导出', ...(why ? { disabledReason: why } : { run: () => void composeNewMark('annotation') }) },
          { action: 'add-editor-note', label: '添加备注', hint: '仅自己可见', ...(why ? { disabledReason: why } : { run: () => void composeNewMark('editor-note') }) },
          ...([1, 2, 3] as const).map((color): MenuItem => ({
            action: `add-highlight-${color}`,
            label: `加高亮 · ${HIGHLIGHT_COLOR_LABELS[color]}`,
            swatch: color,
            ...(why ? { disabledReason: why } : {
              run: () => void (async () => {
                if (refuseWhileBusy()) return;
                const settled = await settledRange();
                if (settled === null) return;
                await createFromSelection('personal-highlight', { highlightColor: color, body: '', proposedText: null, rationale: null }, settled, '已加高亮。');
                editor.focus();
              })(),
            }),
          })),
        ],
      },
      aiTaskGroup(),
    ], at);
  };

  const showMarkMenu = (mark: EditorialMarkAnchorProjection, at: { x: number; y: number }): void => {
    const exact = mark.anchorState === 'exact';
    const drifted = '原文已变，无法在这段文字上转换。';
    const convert = (target: EditorialMarkKind): MenuItem => ({
      action: `convert-${target}`,
      label: CONVERT_LABELS[target],
      ...(exact ? {
        run: () => {
          if (mark.kind === 'personal-highlight') {
            void (async () => {
              const current = editor.currentWindow();
              const card = await api.getEditorialMarkCard({ manuscriptId: current.manuscriptId, branchId: current.branchId, markId: mark.markId });
              openComposer(mark.blockId, convertForm(card, target, () => {
                closeFloating();
                editor.focus();
              }));
            })().catch((error: unknown) => options.setStatus(options.errorMessage(error, '无法打开这条标记。'), 'error'));
          } else if ((mark.kind === 'editor-note' && target === 'annotation') || mark.kind === 'change-suggestion') {
            void change(mark.markId, 'convert', { targetKind: target }, '已转为批注。');
          } else {
            void openCard(mark.markId, (card, cancel) => convertForm(card, target, cancel));
          }
        },
      } : { disabledReason: drifted }),
    });
    const common: MenuGroup = {
      label: '这段文字',
      items: [
        { action: 'copy-marked-text', label: '复制这段', run: () => copyMarkedText(mark) },
        { action: 'task-on-selection', label: '就这段发起任务…', disabledReason: AI7_TASK_REASON },
      ],
    };
    const title = `${MARK_KIND_LABELS[mark.kind]}${mark.sourceKind === 'ai7' ? ' · AI7' : mark.sourceKind === 'imported-author' ? ' · 导入文件的作者' : ' · 你'}`;
    let items: MenuItem[];
    if (mark.kind === 'personal-highlight') {
      items = [
        ...([1, 2, 3] as const).filter((color) => color !== mark.highlightColor).map((color): MenuItem => ({
          action: `recolor-${color}`,
          label: `换颜色 · ${HIGHLIGHT_COLOR_LABELS[color]}`,
          swatch: color,
          run: () => void change(mark.markId, 'recolor', { highlightColor: color }, '已换颜色。'),
        })),
        { action: 'remove', label: '取消高亮', run: () => void change(mark.markId, 'remove', {}, '已取消高亮。') },
        convert('editor-note'),
        convert('annotation'),
        convert('change-suggestion'),
      ];
    } else if (mark.kind === 'annotation') {
      items = [
        { action: 'open-card', label: '打开批注', run: () => void openCard(mark.markId) },
        mark.status === 'open'
          ? { action: 'resolve', label: '标记为已处理', run: () => void change(mark.markId, 'set-status', { status: 'resolved' }, '已标记为已处理。') }
          : { action: 'reopen', label: '重新打开', run: () => void change(mark.markId, 'set-status', { status: 'open' }, '已重新打开。') },
        convert('change-suggestion'),
        ...(mark.sourceKind === 'ai7' ? [
          { action: 'view-task', label: '查看任务', disabledReason: AI7_TASK_REASON },
          { action: 'view-basis', label: '看依据', run: () => void openCard(mark.markId) },
        ] : []),
        { action: 'remove', label: '删除', run: () => void change(mark.markId, 'remove', {}, '已删除批注。') },
      ];
    } else if (mark.kind === 'editor-note') {
      items = [
        { action: 'open-card', label: '打开备注', run: () => void openCard(mark.markId) },
        convert('annotation'),
        convert('change-suggestion'),
        { action: 'remove', label: '删除', run: () => void change(mark.markId, 'remove', {}, '已删除备注。') },
      ];
    } else {
      items = [
        { action: 'open-card', label: '打开修改建议', run: () => void openCard(mark.markId) },
        { action: 'accept-and-apply', label: '接受并应用', disabledReason: '一键写入稿件尚未接通' },
        ...(mark.disposition === null ? [convert('annotation')] : []),
        ...(mark.sourceKind === 'ai7' ? [
          { action: 'view-task', label: '查看任务', disabledReason: AI7_TASK_REASON },
          { action: 'view-basis', label: '看依据', run: () => void openCard(mark.markId) },
        ] : []),
      ];
    }
    showMenu('mark', title, [{ label: title, items }, common], at);
  };

  /** The mark a pointer event landed on: the innermost one that has something to open. */
  const markAt = (target: EventTarget | null, includeHighlights: boolean): EditorialMarkAnchorProjection | undefined => {
    const marks = editor.currentWindow().marks;
    let node = target instanceof Element ? target.closest<HTMLElement>('[data-mark-id]') : null;
    while (node !== null) {
      const mark = marks.find((candidate) => candidate.markId === node!.dataset['markId']);
      if (mark !== undefined && (includeHighlights || mark.kind !== 'personal-highlight')) return mark;
      node = node.parentElement?.closest<HTMLElement>('[data-mark-id]') ?? null;
    }
    return undefined;
  };

  const onMouseDown = (event: MouseEvent): void => {
    // Some platforms select the word under a context click before the menu opens; what decides the
    // menu is what was selected before that.
    if (event.button === 2) collapsedBeforeContextClick = editor.selectedRange().kind === 'none';
  };
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    const mark = collapsedBeforeContextClick ? markAt(event.target, true) : undefined;
    collapsedBeforeContextClick = true;
    if (mark) showMarkMenu(mark, { x: event.clientX, y: event.clientY });
    else showSelectionMenu({ x: event.clientX, y: event.clientY });
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    const selection = window.getSelection();
    const rects = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0).getClientRects() : undefined;
    const rect = rects && rects.length > 0 ? rects[rects.length - 1]! : options.host.getBoundingClientRect();
    const at = { x: rect.right, y: rect.bottom };
    const mark = editor.selectedRange().kind === 'none' ? markAt(selection?.anchorNode?.parentElement ?? null, true) : undefined;
    if (mark) showMarkMenu(mark, at);
    else showSelectionMenu(at);
  };
  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || editor.selectedRange().kind !== 'none') return;
    const mark = markAt(event.target, false);
    if (mark !== undefined && mark.markId !== openCardId) void openCard(mark.markId);
  };
  const onDocumentMouseDown = (event: MouseEvent): void => {
    if (event.target instanceof Node && (layer.contains(event.target) || menuLayer.contains(event.target))) return;
    closeMenu();
    if (floating !== undefined && !(event.target instanceof Element && event.target.closest('[data-mark-id]'))) closeFloating();
  };
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || (menu === undefined && floating === undefined)) return;
    event.preventDefault();
    close();
    editor.focus();
  };

  // The text column moves when the pane reflows and grows when its text does; what floats below a
  // paragraph follows it, and a menu opened at a pointer position that no longer means anything goes.
  const reflow = new ResizeObserver(() => {
    if (floating !== undefined && floatingBlockId !== undefined) placeBelowBlock(floating, floatingBlockId);
  });
  // A menu points at a place on screen; once the text under it moves, it points at nothing.
  const onPaneScroll = (): void => closeMenu();
  const onWindowResize = (): void => closeMenu();
  options.scroll.addEventListener('scroll', onPaneScroll, { passive: true });
  window.addEventListener('resize', onWindowResize);
  reflow.observe(options.scroll);
  reflow.observe(options.host);

  options.host.addEventListener('mousedown', onMouseDown);
  options.host.addEventListener('contextmenu', onContextMenu);
  options.host.addEventListener('keydown', onKeyDown);
  options.host.addEventListener('click', onClick);
  document.addEventListener('mousedown', onDocumentMouseDown);
  document.addEventListener('keydown', onDocumentKeyDown);

  return {
    close,
    ownsScroll: () => floating !== undefined || (closedAt !== undefined && options.scroll.scrollTop === closedAt.top),
    destroy: () => {
      destroyed = true;
      reflow.disconnect();
      options.scroll.removeEventListener('scroll', onPaneScroll);
      window.removeEventListener('resize', onWindowResize);
      close();
      options.host.removeEventListener('mousedown', onMouseDown);
      options.host.removeEventListener('contextmenu', onContextMenu);
      options.host.removeEventListener('keydown', onKeyDown);
      options.host.removeEventListener('click', onClick);
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
      layer.remove();
      menuLayer.remove();
    },
  };
}
