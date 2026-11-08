import { technicalWords, technicalDisclosure, technicalLayerVisible } from './technical-layer.js';
import { GLOBAL_AGENT_TITLE, type GlobalAgentDialogueProjection, type GlobalAgentProcedure, type GlobalAgentProjection, type GlobalAgentRendererApi, type GlobalAgentScopeInput, type GlobalMemoryItem, type GlobalAgentSourceCandidate, type PrepareGlobalAgentTurnInput, type RecordLearningSupervisionInput } from '../shared/protocol.js';
import { globalAgentAnswerStatus } from './shell-labels.js';
import { CONFIGURED_RUNTIME_MODEL_LABELS } from '../shared/provider-configuration.generated.js';
import { MODEL_SERVICE_ROUTE_BINDINGS, modelServiceChannelOf } from '../shared/protocol/model-service.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}
function field(label: string, input: HTMLElement): HTMLLabelElement {
  const node = el('label');
  node.className = input instanceof HTMLInputElement && input.type === 'checkbox' ? 'global-agent-choice' : 'global-agent-field';
  if (input instanceof HTMLInputElement && input.type === 'checkbox') node.append(input, el('span', label));
  else node.append(el('span', label), input);
  return node;
}
function technical(...lines: string[]): HTMLDetailsElement {
  const details = el('details'); details.className = 'global-agent-technical';
  details.append(el('summary', '查看技术详情'), ...lines.map((line) => el('pre', line)));
  return technicalDisclosure(details);
}
function providerLabel(provider: { route: string; model: string }): string {
  const channel = modelServiceChannelOf(provider.route);
  const model = (CONFIGURED_RUNTIME_MODEL_LABELS as Readonly<Record<string, string>>)[`${provider.route}/${provider.model}`]
    ?? provider.model.split(/[-_/]/u).map((word) => /^(gpt|glm)$/iu.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  return `${channel === null ? '模型服务' : MODEL_SERVICE_ROUTE_BINDINGS[channel].providerLabel} · ${model}`;
}
const TOOL_LABELS: Readonly<Record<string, string>> = {
  retrieve: '检索跨书与记忆', exact_fetch: '读取精确原文', read_procedure: '读取工序定义', propose_learning_supervision: '提出学习监督建议',
};
const EFFECT_LABELS = { guide: '引导方向', freeze: '冻结规则', correct: '纠正偏好' } as const;
function toolResultSummary(tool: string, result: string | null): string {
  if (result === null) return '等待返回结果';
  try {
    const value = JSON.parse(result) as Record<string, unknown>;
    if (Array.isArray(value)) return `返回 ${value.length} 条结果`;
    const rows = value['candidates'] ?? value['results'];
    if (Array.isArray(rows)) return `返回 ${rows.length} 条结果`;
  } catch { /* The raw response remains available in technical details. */ }
  return tool === 'propose_learning_supervision' ? '返回 1 条学习监督建议' : '返回 1 项结果';
}
/** The 审阅习惯总结 question (#1171): an ordinary scoped ask over the listed memory, so it is disclosed and sent like any other. */
const HABITS_QUESTION = '请总结本社的审阅习惯：每条习惯用一句话说明，并注明它依据的记忆或偏好版本；只依据本次列出的来源。';

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
  const heading = el('header'); heading.className = 'global-agent-heading';
  heading.append(el('h2', GLOBAL_AGENT_TITLE), el('p', '讨论审阅习惯、参考选入的图书与工序，或管理本社记忆。'));
  root.append(heading);
  const state = el('p');
  state.className = 'global-agent-status';
  state.setAttribute('role', 'status');
  state.dataset['globalAgentPolicy'] = 'state';
  const items = el('fieldset');
  items.className = 'global-agent-sources';
  items.append(el('legend', '本社审阅偏好与记忆'), el('p', '勾选后用于提问或管理。'));
  const list = el('div');
  list.className = 'global-agent-choice-list';
  items.append(list);
  const form = el('form');
  form.className = 'global-agent-governance';
  form.dataset['globalAgentGovernance'] = 'form';
  const operation = el('select');
  operation.dataset['globalAgentOperation'] = 'select';
  for (const [value, label] of [['create', '新建偏好'], ['merge', '合并'], ['correct', '修正'], ['deactivate', '停用'], ['supervise', '记录学习监督指令']]) {
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
  save.className = 'btn ' + ('secondary');
  save.dataset['globalAgentSave'] = 'submit';
  const effectField = field('监督作用', effect);
  const bookField = field('图书', book);
  form.append(el('h3', '管理所选记忆'), field('操作', operation), field('作用范围', scope), field('审阅类别', category), bookField,
    field('记忆内容 / 监督指令 · 最多 200 字', text), effectField,
    el('p', '勾选「引用范围」里的记忆后管理。'), save);
  const directives = el('section');
  directives.className = 'global-agent-directives';
  const history = el('section');
  history.className = 'global-agent-history';
  history.append(el('h3', '全域对话历史'));
  const historyList = el('div');
  historyList.className = 'global-agent-history-list';
  const answer = el('section');
  answer.className = 'global-agent-answer'; answer.hidden = true;
  answer.setAttribute('aria-label', '全域对话回答');
  history.append(historyList);
  const conversation = el('section'); conversation.className = 'global-agent-conversation';
  const previousTurns = el('div'); previousTurns.className = 'global-agent-previous-turns';
  conversation.append(previousTurns, answer);
  let foreground = options.dialogueId ?? null;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const answerQuestion = el('p');
  answerQuestion.className = 'global-agent-question-bubble';
  const answerStatus = el('p');
  const prose = el('div');
  prose.className = 'global-agent-answer-bubble'; prose.setAttribute('aria-live', 'polite');
  const answerActions = el('div');
  answerActions.className = 'global-agent-actions';
  const tools = el('section'); tools.dataset['globalAgentToolCalls'] = 'list';
  const proposals = el('section'); proposals.dataset['globalAgentProposals'] = 'list';
  const confirmed = new Set<string>();
  const submitted = el('details'); submitted.append(el('summary', '本次提交内容'));
  const submittedContent = el('div'); submitted.append(submittedContent);
  answer.append(answerQuestion, answerStatus, prose, answerActions, tools, proposals, submitted);
  let displayedAttempt: string | null = null;
  let displayedFragments = 0;
  let latestDialogue: GlobalAgentDialogueProjection | null = null;
  let reading = 0;
  const answerButtons = new Map<'stop' | 'continue' | 'regenerate', HTMLButtonElement>();
  for (const [operation, label] of [['stop', '停止回答'], ['continue', '继续回答'], ['regenerate', '重新回答']] as const) {
    const button = el('button', label); button.type = 'button'; button.disabled = true;
    button.className = 'btn ' + ('quiet');
    button.addEventListener('click', () => {
      const last = latestDialogue?.attempts.at(-1);
      if (last === undefined || latestDialogue === null) return;
      const input = { dialogueId: latestDialogue.dialogueId, attemptId: last.attemptId };
      if (operation === 'stop') {
        button.disabled = true;
        void options.api.stopGlobalAgentAnswer(input).then(() => showDialogue())
          .catch((error: unknown) => options.setStatus(options.errorMessage(error, '对话操作未能完成。'), 'error'));
      } else void sendTurn({ ...input, kind: operation });
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
      answer.hidden = false;
      const last = dialogue.attempts.at(-1);
      answerQuestion.textContent = dialogue.question ?? '问题记录暂不可读';
      answerStatus.textContent = globalAgentAnswerStatus(last);
      submittedContent.replaceChildren();
      for (const [index, submission] of (dialogue.submissions ?? []).entries()) {
        submittedContent.append(el('h4', `第 ${index + 1} 次回答`),
          el('p', submission.provider === null ? '尚无模型服务绑定记录' : providerLabel(submission.provider)),
          el('p', submission.question), ...submission.sources.map((entry) => {
            const candidate = current?.sourceCandidates?.find((source) => source.itemId === entry.itemId && source.revisionId === entry.revisionId);
            const row = el('div'); row.className = 'global-agent-source-card';
            row.append(el('h4', candidate?.title ?? '已选记忆'), el('p', entry.text), technical(`条目：${entry.itemId}`, `版本：${entry.revisionId}`));
            return row;
          }), technical(`回答：${submission.attemptId}`));
        if (submission.kept !== null) submittedContent.append(el('p', `接着回答时保留的内容：${submission.kept}`));
      }
      if (displayedAttempt !== (last?.attemptId ?? null)) {
        displayedAttempt = last?.attemptId ?? null; displayedFragments = 0; prose.replaceChildren();
      }
      for (const fragment of (last?.fragments ?? []).slice(displayedFragments)) prose.append(el('p', fragment.text));
      tools.replaceChildren(...(dialogue.toolCalls?.length ? [el('h3', '本次对话的工具调用')] : []),
        ...(dialogue.toolCalls ?? []).map((call) => {
          const card = el('article'); card.className = 'global-agent-tool-card';
          card.append(el('h4', TOOL_LABELS[call.tool] ?? '本机工具'),
            el('p', call.tool === 'retrieve' ? '在所选图书与记忆中查找相关内容。' : call.tool === 'exact_fetch' ? '读取检索结果对应的原文。' : call.tool === 'read_procedure' ? '读取选入工序的说明与阶段。' : '整理可由你确认的学习监督建议。'),
            el('p', call.outcome === 'returned' ? toolResultSummary(call.tool, call.result) : call.outcome === 'refused' ? '未能读取，请检查所选范围。' : '正在读取所选范围…'),
            technical(`工具：${call.tool}`, `参数：${call.arguments}`, `结果：${call.result ?? '等待返回'}`, `回答：${call.attemptId}`, `调用：${call.callId}`));
          return card;
        }));
      proposals.replaceChildren();
      for (const proposal of dialogue.supervisionProposals ?? []) {
        const key = `${proposal.attemptId}/${proposal.callId}`;
        const confirm = el('button', confirmed.has(key) ? '已记录' : '确认并记录为学习监督指令'); confirm.type = 'button'; confirm.disabled = confirmed.has(key);
        confirm.className = 'btn ' + ('secondary');
        confirm.dataset['globalAgentConfirmProposal'] = key;
        confirm.addEventListener('click', () => {
          confirm.disabled = true;
          const memory = proposal.input.targets.some((pin) => current?.items.find((item) => item.itemId === pin.itemId)?.kind === 'memory');
          void options.api.recordLearningSupervision({ ...(memory ? { actionId: crypto.randomUUID() } : {}), ...proposal.input }).then((projection) => {
            confirmed.add(key);
            if (root.isConnected) { render(projection); options.setStatus('已按你的确认记录学习监督指令。', 'success'); }
          }).catch((error: unknown) => { confirm.disabled = false; options.setStatus(options.errorMessage(error, '学习监督指令未能记录。'), 'error'); });
        });
        const card = el('article'); card.className = 'global-agent-proposal-card';
        card.append(el('h4', `学习监督建议 · ${EFFECT_LABELS[proposal.input.effect]}`), el('p', proposal.input.text), confirm);
        proposals.append(card);
      }
      displayedFragments = last?.fragments.length ?? 0;
      updateSendControls();
      for (const [operation, button] of answerButtons) button.disabled = last === undefined || !dialogue.actions[operation] ||
        operation !== 'stop' && current?.dialogueState !== 'available';
      if (last?.state === 'answering') poll = setTimeout(() => void showDialogue(), 250);
    } catch (error) {
      if (root.isConnected) options.setStatus(options.errorMessage(error, '无法读取全域对话。'), 'error');
    }
  };
  const questionForm = el('form'); questionForm.className = 'global-agent-composer';
  questionForm.dataset['globalAgentQuestionForm'] = '';
  const question = el('textarea'); question.maxLength = 500; question.rows = 3;
  question.placeholder = '向全域智能体提问…'; question.dataset['globalAgentQuestion'] = '';
  const ask = el('button', '发送问题'); ask.type = 'submit'; ask.className = 'btn ' + ('primary'); ask.disabled = true; question.disabled = true;
  const previewButton = el('button', '查看将发送的内容'); previewButton.type = 'button'; previewButton.className = 'btn ' + ('secondary'); previewButton.disabled = true;
  const scopeList = el('fieldset'); scopeList.className = 'global-agent-scope';
  scopeList.append(el('legend', '参考图书与工序'), el('p', '勾选后可检索与读取这些图书和工序；未选时只讨论问题与所选记忆。'));
  const scopeBooks = el('div'); scopeBooks.className = 'global-agent-choice-list';
  const scopeProcedures = el('div'); scopeProcedures.className = 'global-agent-choice-list'; scopeList.append(scopeBooks, scopeProcedures);
  const scopedBooks = new Set<string>();
  const scopedProcedures = new Map<string, GlobalAgentProcedure>();
  const selectedSources = new Map<string, GlobalAgentSourceCandidate>();
  const habits = el('button', '生成审阅习惯总结'); habits.type = 'button'; habits.className = 'btn ' + ('quiet'); habits.disabled = true; habits.dataset['globalAgentHabits'] = 'summary';
  const disclosure = el('section'); disclosure.className = 'global-agent-preview'; disclosure.hidden = true; disclosure.setAttribute('aria-label', '将发送的内容');
  let previewGeneration = 0;
  let sending = false;
  const invalidatePreview = (): void => { previewGeneration += 1; disclosure.replaceChildren(); disclosure.hidden = true; };
  question.addEventListener('input', invalidatePreview);
  const scopeInput = (): GlobalAgentScopeInput => ({ bookIds: [...scopedBooks],
    procedures: [...scopedProcedures.values()].map(({ procedureId, version, digest }) => ({ procedureId, version, digest })) });
  const askInput = (): PrepareGlobalAgentTurnInput => ({ kind: 'ask', question: question.value,
    sources: [...selectedSources.values()].map(({ itemId, revisionId }) => ({ itemId, revisionId })),
    ...(scopedBooks.size > 0 || scopedProcedures.size > 0 ? { scope: scopeInput() } : {}) });
  const updateSendControls = (): void => {
    const available = current?.dialogueState === 'available';
    ask.disabled = !available || sending || latestDialogue?.attempts.at(-1)?.state === 'answering';
    previewButton.disabled = !available || sending;
    habits.disabled = ask.disabled;
    question.disabled = !available;
  };
  const sendTurn = async (input: PrepareGlobalAgentTurnInput): Promise<void> => {
    if (sending || !root.isConnected) return;
    sending = true; updateSendControls(); invalidatePreview();
    options.setStatus('正在发送问题…', 'busy');
    try {
      // Preparation and the existing final payload check happen in this one user action.
      const prepared = await options.api.prepareGlobalAgentTurn(input);
      if (!root.isConnected) return;
      const pins = prepared.sources.map(({ itemId, revisionId }) => ({ itemId, revisionId }));
      const dialogue = input.kind === 'ask'
        ? await options.api.askGlobalAgent({ question: input.question, sources: input.sources,
          ...(input.scope === undefined ? {} : { scope: input.scope }), disclosureSha256: prepared.sha256 })
        : input.kind === 'continue'
          ? await options.api.continueGlobalAgentAnswer({ dialogueId: input.dialogueId, attemptId: input.attemptId, sources: pins, disclosureSha256: prepared.sha256 })
          : await options.api.regenerateGlobalAgentAnswer({ dialogueId: input.dialogueId, attemptId: input.attemptId, sources: pins, disclosureSha256: prepared.sha256 });
      if (!root.isConnected) return;
      if (input.kind === 'ask') {
        if (latestDialogue !== null) {
          const turn = el('article'); turn.className = 'global-agent-turn';
          const prompt = el('p', latestDialogue.question ?? '问题记录暂不可读'); prompt.className = 'global-agent-question-bubble';
          const response = el('div'); response.className = 'global-agent-answer-bubble';
          response.append(...(latestDialogue.attempts.at(-1)?.fragments ?? []).map((fragment) => el('p', fragment.text)));
          turn.append(prompt, response); previousTurns.append(turn);
        }
        if (question.value === input.question) question.value = '';
      }
      foreground = dialogue.dialogueId; latestDialogue = dialogue;
      render(await options.api.inspectGlobalAgent());
      await showDialogue();
      options.setStatus('问题已发送。', 'success'); question.focus();
    } catch (error) {
      if (root.isConnected) options.setStatus(options.errorMessage(error, '对话未能开始。'), 'error');
    } finally { sending = false; updateSendControls(); }
  };
  const preview = async (): Promise<void> => {
    const generation = ++previewGeneration;
    disclosure.hidden = false; disclosure.replaceChildren(el('p', '正在核对发送内容…'));
    try {
      const prepared = await options.api.prepareGlobalAgentTurn(askInput());
      if (!root.isConnected || generation !== previewGeneration) return;
      disclosure.replaceChildren(el('h3', '将发送的内容'), el('p', providerLabel(prepared.provider)), el('p', prepared.question),
        el('p', prepared.textProcessing === 'qualified-original-fields' ? '发送问题和已选记忆的正文；不读取备注或记忆的原文例证。' : '已过滤本社人员姓名；不发送备注、内部记录或记忆的原文例证。'));
      if (prepared.scope !== undefined) disclosure.append(
        el('p', `可用工具：${prepared.scope.tools.map((tool) => TOOL_LABELS[tool] ?? '本机工具').join('、')}`),
        el('p', `图书：${prepared.scope.books.map((entry) => entry.title).join('、') || '未选'}`),
        el('p', `工序：${prepared.scope.procedures.map((entry) => `${entry.title} ${technicalWords(`第 ${entry.version} 版`, '版本')}`).join('、') || '未选'}`));
      if (prepared.sources.length === 0) disclosure.append(el('p', '本次没有选用记忆。'));
      for (const entry of prepared.sources) {
        const row = el('article'); row.className = 'global-agent-source-card';
        const remove = el('button', '本次移除'); remove.type = 'button'; remove.className = 'btn ' + ('quiet');
        remove.addEventListener('click', () => {
          selectedSources.delete(entry.itemId); selected.delete(entry.itemId);
          for (const checkbox of list.querySelectorAll<HTMLInputElement>('input')) if (checkbox.dataset['sourceItem'] === entry.itemId) checkbox.checked = false;
          void preview();
        });
        row.append(el('h4', entry.title), el('p', entry.text), remove, technical(`条目：${entry.itemId}`, `版本：${entry.revisionId}`)); disclosure.append(row);
      }
      disclosure.append(technical(`渠道：${prepared.provider.route}`, `模型：${prepared.provider.model}`));
    } catch (error) {
      if (generation === previewGeneration) disclosure.replaceChildren(el('p', options.errorMessage(error, '无法核对发送内容。')));
    }
  };
  previewButton.addEventListener('click', () => void preview());
  habits.addEventListener('click', () => {
    if (current?.dialogueState !== 'available') return;
    question.value = HABITS_QUESTION;
    for (const checkbox of list.querySelectorAll<HTMLInputElement>('input')) {
      const entry = current.sourceCandidates?.find((candidate) => candidate.itemId === checkbox.dataset['sourceItem']);
      if (entry !== undefined && entry.kind !== 'supervision' && selectedSources.size < 12) {
        checkbox.checked = true; selectedSources.set(entry.itemId, entry);
        const item = current.items.find((item) => item.itemId === entry.itemId); if (item !== undefined) selected.set(item.itemId, item);
      }
    }
    void sendTurn(askInput());
  });
  const questionActions = el('div'); questionActions.className = 'global-agent-actions'; questionActions.append(ask, previewButton, habits);
  questionForm.append(field('关于记忆与学习方向的问题', question), questionActions, disclosure);
  questionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!ask.disabled) void sendTurn(askInput());
  });
  const audit = el('button', '学习回溯 · 停止今后使用');
  audit.type = 'button';
  audit.addEventListener('click', options.openAudit);
  audit.className = 'btn ' + ('quiet');
  // Issue #1413 cluster 7: the dialogue and the composer are the page. 引用范围, 记忆与治理 and 全局指令 are compact pills
  // above the composer that open as popovers; the dialogue history is a short list beside the conversation.
  const pills = el('div'); pills.className = 'global-agent-pills';
  pills.setAttribute('role', 'group'); pills.setAttribute('aria-label', '提问设置');
  const pill = (label: string, key: string, ...content: HTMLElement[]): HTMLDetailsElement => {
    const details = el('details'); details.className = 'global-agent-pill'; details.dataset['globalAgentPill'] = key;
    const summary = el('summary', label);
    const pop = el('div'); pop.className = 'global-agent-pop'; pop.append(...content);
    details.append(summary, pop);
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      for (const other of pills.querySelectorAll<HTMLDetailsElement>('details.global-agent-pill')) if (other !== details) other.open = false;
    });
    details.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !details.open) return;
      event.preventDefault(); event.stopPropagation(); details.open = false; summary.focus();
    });
    return details;
  };
  pills.append(pill('引用范围', 'scope', items, scopeList), pill('记忆与治理', 'governance', form), pill('全局指令', 'directives', directives));
  root.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Node) || pills.contains(event.target)) return;
    for (const details of pills.querySelectorAll<HTMLDetailsElement>('details.global-agent-pill[open]')) details.open = false;
  });
  const main = el('div'); main.className = 'global-agent-main';
  main.append(state, conversation, pills, questionForm);
  const side = el('aside'); side.className = 'global-agent-side';
  side.append(history, audit);
  root.append(main, side);
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
    updateSendControls();
    scopeList.hidden = projection.scopedDialogueState !== 'available' && (projection.procedures ?? []).length === 0;
    for (const id of scopedBooks) if (!projection.books.some((entry) => entry.bookId === id)) scopedBooks.delete(id);
    for (const [id, pin] of scopedProcedures) if (!(projection.procedures ?? []).some((entry) => entry.procedureId === id && entry.version === pin.version && entry.digest === pin.digest)) scopedProcedures.delete(id);
    scopeBooks.replaceChildren(...(projection.scopedDialogueState === 'available' ? projection.books : []).map((entry) => {
      const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.dataset['globalAgentScopeBook'] = entry.bookId;
      checkbox.checked = scopedBooks.has(entry.bookId);
      checkbox.addEventListener('change', () => { if (checkbox.checked) scopedBooks.add(entry.bookId); else scopedBooks.delete(entry.bookId); invalidatePreview(); });
      return field(`图书 · ${entry.title}`, checkbox);
    }));
    // 工序与规则 inspected here; a version enters the turn only when explicitly checked.
    scopeProcedures.replaceChildren(...(projection.procedures ?? []).map((entry) => {
      const row = el('details'); row.className = 'global-agent-procedure'; row.dataset['globalAgentProcedure'] = entry.procedureId;
      row.append(el('summary', `工序 · ${entry.title} · ${technicalWords(`第 ${entry.version} 版`, '版本')}`), el('p', entry.editorInstruction || '没有编辑说明。'),
        el('p', `阶段：${entry.stages.map((stage) => stage.label).join(' → ')}`));
      if (projection.scopedDialogueState === 'available') {
        const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.dataset['globalAgentScopeProcedure'] = entry.procedureId;
        checkbox.checked = scopedProcedures.has(entry.procedureId);
        checkbox.addEventListener('change', () => { if (checkbox.checked) scopedProcedures.set(entry.procedureId, entry); else scopedProcedures.delete(entry.procedureId); invalidatePreview(); });
        row.append(field('在本次对话中讨论这个版本', checkbox));
      }
      return row;
    }));
    // A choice follows its stable item through correction or freezing. Only still-available
    // source candidates are sent; governance can continue to target a frozen item.
    for (const id of selected.keys()) {
      const next = projection.items.find((item) => item.itemId === id);
      if (next === undefined) selected.delete(id); else selected.set(id, next);
    }
    for (const id of selectedSources.keys()) {
      const next = projection.sourceCandidates?.find((item) => item.itemId === id);
      if (next === undefined) selectedSources.delete(id); else selectedSources.set(id, next);
    }
    invalidatePreview();
    state.textContent = projection.dialogueState === 'available' ? '可以提问 · 只参考你选入的来源；记忆管理在本机单独记录。' : `暂时无法提问 · ${projection.explanation}`;
    list.replaceChildren();
    const candidates = projection.sourceCandidates ?? [];
    const ids = new Set([...projection.items.map((item) => item.itemId), ...candidates.map((item) => item.itemId)]);
    if (ids.size === 0) list.append(el('p', '还没有记忆。可以新建一条本社审阅偏好。'));
    for (const id of ids) {
      const item = projection.items.find((item) => item.itemId === id);
      const source = candidates.find((entry) => entry.itemId === id);
      const checkbox = el('input'); checkbox.type = 'checkbox';
      if (item !== undefined) checkbox.dataset['globalAgentItem'] = id;
      if (source !== undefined) checkbox.dataset['sourceItem'] = id;
      checkbox.checked = selected.has(id) || selectedSources.has(id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (item !== undefined) selected.set(id, item);
          if (source !== undefined) selectedSources.set(id, source);
        } else { selected.delete(id); selectedSources.delete(id); }
        invalidatePreview();
      });
      const title = source?.title ?? (item?.kind === 'memory' ? '编辑记忆' : '审阅偏好');
      const categoryLabel = projection.categories.find((entry) => entry.categoryId === item?.categoryId)?.label;
      const stateLabel = item === undefined ? '学习监督' : { proposed: '待接受', active: '已启用', frozen: '已冻结', inactive: '已停用' }[item.state];
      const row = el('article'); row.className = 'global-agent-source-card';
      row.append(field([title, categoryLabel, stateLabel].filter(Boolean).join(' · '), checkbox), el('p', source?.text ?? item?.text ?? ''),
        technical(`条目：${id}`, `版本：${source?.revisionId ?? item?.revisionId ?? ''}`));
      list.append(row);
    }
    const previousCategory = category.value; const previousBook = book.value;
    category.replaceChildren(...projection.categories.map((entry) => { const option = el('option', entry.label); option.value = entry.categoryId; return option; }));
    book.replaceChildren(...projection.books.map((entry) => { const option = el('option', entry.title); option.value = entry.bookId; return option; }));
    if (projection.categories.some((entry) => entry.categoryId === previousCategory)) category.value = previousCategory;
    if (projection.books.some((entry) => entry.bookId === previousBook)) book.value = previousBook;
    directives.replaceChildren(el('h3', '学习监督与治理记录'));
    for (const directive of projection.directives) directives.append(el('p', `${directive.ordinal} · ${directive.text || '停用所选记忆'} · ${directive.recordedAt}`));
    historyList.replaceChildren();
    for (const dialogue of projection.history) {
      const open = el('button', dialogue.question ?? '查看全域对话'); open.type = 'button'; open.className = 'btn ' + ('quiet global-agent-history-entry');
      open.addEventListener('click', () => {
        if (poll !== undefined) clearTimeout(poll);
        previousTurns.replaceChildren(); foreground = dialogue.dialogueId; void showDialogue();
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
      ...([...selected.values()].some((item) => item.kind === 'memory') ? { actionId: crypto.randomUUID() } : {}),
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
