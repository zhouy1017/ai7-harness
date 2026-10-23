import { GLOBAL_AGENT_TITLE, type GlobalAgentDialogueProjection, type GlobalAgentProjection, type GlobalAgentRendererApi, type GlobalMemoryItem, type RecordLearningSupervisionInput } from '../shared/protocol.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function field(label: string, input: HTMLElement): HTMLLabelElement {
  const node = el('label', label);
  node.append(input);
  return node;
}

/** The global destination has no Book route, selection capability, conversion or Apply action. */
export function mountGlobalAgent(options: {
  readonly api: GlobalAgentRendererApi;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly openAudit: () => void;
  readonly dialogueId?: string;
}): HTMLElement {
  const root = el('section');
  root.className = 'panel global-agent';
  root.dataset['globalAgent'] = 'destination';
  root.append(el('h2', GLOBAL_AGENT_TITLE), el('p', '指导学习方向、管理记忆。进入此处不发起任务，不读取稿件，也不授予修改权限。'));
  const state = el('p');
  state.setAttribute('role', 'status');
  state.dataset['globalAgentPolicy'] = 'state';
  const items = el('fieldset');
  items.append(el('legend', '本社审阅偏好与记忆'));
  const list = el('div');
  items.append(list);
  const form = el('form');
  form.dataset['globalAgentGovernance'] = 'form';
  const operation = el('select');
  operation.dataset['globalAgentOperation'] = 'select';
  for (const [value, label] of [['create', '新建记忆'], ['merge', '合并'], ['correct', '修正'], ['deactivate', '停用'], ['supervise', '记录学习监督指令']]) {
    const option = el('option', label); option.value = value!; operation.append(option);
  }
  const scope = el('select');
  for (const [value, label] of [['house', '本社'], ['category', '本审阅类别'], ['book', '指定图书']]) {
    const option = el('option', label); option.value = value!; scope.append(option);
  }
  const category = el('select');
  const book = el('select');
  const effect = el('select');
  effect.dataset['globalAgentEffect'] = 'select';
  for (const [value, label] of [['guide', '指导后续学习'], ['freeze', '冻结所选记忆'], ['correct', '用指令修正所选记忆']]) {
    const option = el('option', label); option.value = value!; effect.append(option);
  }
  const text = el('textarea');
  text.maxLength = 400;
  text.rows = 3;
  text.dataset['globalAgentText'] = 'input';
  const save = el('button', '新建记忆');
  save.type = 'submit';
  save.dataset['globalAgentSave'] = 'submit';
  const effectField = field('监督作用', effect);
  const bookField = field('图书', book);
  form.append(field('操作', operation), field('作用范围', scope), field('审阅类别', category), bookField,
    field('记忆内容 / 监督指令（最多 200 字）', text), effectField,
    el('p', '请选择要合并、修正、停用或冻结的精确版本。每次操作单独记录；对话文字不会自动成为指令。'), save);
  const directives = el('section');
  const history = el('section');
  history.append(el('h3', '全域对话历史'), el('p', '可在这里或「质量与学习」查看已记录的问题与回答。'));
  const historyList = el('div');
  const answer = el('section');
  answer.setAttribute('aria-label', '全域对话回答');
  history.append(historyList, answer);
  let foreground = options.dialogueId ?? null;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const answerQuestion = el('p');
  const answerStatus = el('p');
  const prose = el('div');
  const answerActions = el('div');
  answer.append(answerQuestion, answerStatus, prose, answerActions,
    el('p', '回答仅供参考；治理必须单独操作。修改稿件请返回相应图书。'));
  let displayedAttempt: string | null = null;
  let displayedFragments = 0;
  let latestDialogue: GlobalAgentDialogueProjection | null = null;
  let reading = 0;
  const answerButtons = new Map<'stop' | 'continue' | 'regenerate', HTMLButtonElement>();
  for (const [operation, label] of [['stop', '停止回答'], ['continue', '继续回答'], ['regenerate', '重新回答']] as const) {
    const button = el('button', label); button.type = 'button'; button.disabled = true;
    button.addEventListener('click', () => {
      const last = latestDialogue?.attempts.at(-1);
      if (last === undefined || latestDialogue === null) return;
      const input = { dialogueId: latestDialogue.dialogueId, attemptId: last.attemptId };
      const action = operation === 'stop' ? options.api.stopGlobalAgentAnswer(input)
        : operation === 'continue' ? options.api.continueGlobalAgentAnswer(input) : options.api.regenerateGlobalAgentAnswer(input);
      button.disabled = true;
      void action.then(() => showDialogue()).catch((error: unknown) => options.setStatus(options.errorMessage(error, '对话操作未能完成。'), 'error'));
    });
    answerButtons.set(operation, button); answerActions.append(button);
  }
  const isForeground = (): boolean => root.isConnected && document.visibilityState !== 'hidden';
  const showDialogue = async (): Promise<void> => {
    if (foreground === null || !isForeground()) return;
    if (poll !== undefined) clearTimeout(poll);
    const generation = ++reading;
    const id = foreground;
    try {
      const dialogue = await options.api.inspectGlobalAgentDialogue({ dialogueId: id });
      if (foreground !== id || !isForeground() || generation !== reading) return;
      latestDialogue = dialogue;
      const last = dialogue.attempts.at(-1);
      answerQuestion.textContent = dialogue.question ?? '问题记录暂不可读';
      answerStatus.textContent = last?.state === 'answering' ? '正在回答 · 内容尚未完成' : last?.state === 'completed' ? '回答已完成' : '回答不完整';
      if (displayedAttempt !== (last?.attemptId ?? null)) {
        displayedAttempt = last?.attemptId ?? null; displayedFragments = 0; prose.replaceChildren();
      }
      for (const fragment of (last?.fragments ?? []).slice(displayedFragments)) prose.append(el('p', fragment.text));
      displayedFragments = last?.fragments.length ?? 0;
      for (const [operation, button] of answerButtons) button.disabled = last === undefined || !dialogue.actions[operation] ||
        operation !== 'stop' && current?.dialogueState !== 'available';
      if (last?.state === 'answering') poll = setTimeout(() => void showDialogue(), 250);
    } catch (error) {
      if (root.isConnected) options.setStatus(options.errorMessage(error, '无法读取全域对话。'), 'error');
    }
  };
  const questionForm = el('form');
  const question = el('textarea'); question.maxLength = 500; question.rows = 3;
  const ask = el('button', '提问'); ask.type = 'submit'; ask.disabled = true; question.disabled = true;
  questionForm.append(field('关于记忆与学习方向的问题', question), el('p', '只使用明确勾选的已启用记忆版本；不发送稿件。'), ask);
  questionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (current?.dialogueState !== 'available') return;
    void options.api.askGlobalAgent({ question: question.value,
      sources: [...selected.values()].filter((item) => item.state === 'active').map(({ itemId, revisionId }) => ({ itemId, revisionId })) })
      .then((dialogue) => { foreground = dialogue.dialogueId; return showDialogue(); })
      .catch((error: unknown) => options.setStatus(options.errorMessage(error, '对话未能开始。'), 'error'));
  });
  const audit = el('button', '学习回溯 · 停止今后使用');
  audit.type = 'button';
  audit.addEventListener('click', options.openAudit);
  root.append(state, items, questionForm, form, directives, history, audit);
  let current: GlobalAgentProjection | null = null;
  let busy = false;
  const selected = new Map<string, GlobalMemoryItem>();
  const controls = [operation, scope, category, book, effect, text, save];
  const update = (): void => {
    save.textContent = operation.selectedOptions[0]?.textContent ?? '记录';
    effectField.hidden = operation.value !== 'supervise';
    bookField.hidden = scope.value !== 'book';
  };
  operation.addEventListener('change', update);
  scope.addEventListener('change', update);
  const render = (projection: GlobalAgentProjection): void => {
    current = projection;
    ask.disabled = projection.dialogueState !== 'available'; question.disabled = ask.disabled;
    selected.clear();
    state.textContent = `${projection.dialogueState} · ${projection.explanation}`;
    list.replaceChildren();
    if (projection.items.length === 0) list.append(el('p', '还没有记忆。可以明确新建一条本社审阅偏好。'));
    for (const item of projection.items) {
      const checkbox = el('input'); checkbox.type = 'checkbox';
      checkbox.dataset['globalAgentItem'] = item.itemId;
      checkbox.addEventListener('change', () => { if (checkbox.checked) selected.set(item.itemId, item); else selected.delete(item.itemId); });
      const row = field(`${item.text} · ${item.state === 'active' ? '已启用' : item.state === 'frozen' ? '已冻结' : '已停用'}`, checkbox);
      list.append(row);
    }
    category.replaceChildren(...projection.categories.map((entry) => { const option = el('option', entry.label); option.value = entry.categoryId; return option; }));
    book.replaceChildren(...projection.books.map((entry) => { const option = el('option', entry.title); option.value = entry.bookId; return option; }));
    directives.replaceChildren(el('h3', '学习监督与治理记录'));
    for (const directive of projection.directives) directives.append(el('p', `${directive.ordinal} · ${directive.text || '停用所选记忆'} · ${directive.recordedAt}`));
    historyList.replaceChildren();
    for (const dialogue of projection.history) {
      const open = el('button', dialogue.question ?? '查看全域对话'); open.type = 'button';
      open.addEventListener('click', () => {
        if (poll !== undefined) clearTimeout(poll);
        foreground = dialogue.dialogueId; void showDialogue();
      });
      historyList.append(open);
    }
    if (foreground !== null) void showDialogue();
    update();
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy || current === null || !root.isConnected) return;
    const input: RecordLearningSupervisionInput = {
      operation: operation.value as RecordLearningSupervisionInput['operation'],
      targets: [...selected.values()].map(({ itemId, revisionId }) => ({ itemId, revisionId })),
      scope: scope.value === 'book' ? { kind: 'book', bookId: book.value } : scope.value === 'category'
        ? { kind: 'category', categoryId: category.value } : { kind: 'house' },
      categoryId: category.value, text: text.value,
      effect: effect.value as RecordLearningSupervisionInput['effect'],
    };
    busy = true;
    for (const control of controls) control.disabled = true;
    void options.api.recordLearningSupervision(input).then((projection) => {
      if (!root.isConnected) return;
      render(projection); text.value = '';
      options.setStatus('已在本机记录，后续使用遵守新的监督与记忆状态。', 'success');
    }).catch((error: unknown) => {
      if (root.isConnected) options.setStatus(options.errorMessage(error, '记忆治理未能记录。'), 'error');
    }).finally(() => { busy = false; for (const control of controls) control.disabled = false; });
  });
  update();
  void options.api.inspectGlobalAgent().then((projection) => { if (root.isConnected) render(projection); }).catch((error: unknown) => {
    if (root.isConnected) options.setStatus(options.errorMessage(error, '无法读取全域智能体。'), 'error');
  });
  const foregroundChanged = (): void => { if (document.visibilityState === 'visible') void showDialogue(); };
  document.addEventListener('visibilitychange', foregroundChanged);
  const detached = new MutationObserver(() => {
    if (root.isConnected) return;
    if (poll !== undefined) clearTimeout(poll);
    document.removeEventListener('visibilitychange', foregroundChanged);
    detached.disconnect();
  });
  detached.observe(document.body, { childList: true, subtree: true });
  return root;
}
