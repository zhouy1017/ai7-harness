import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountGlobalAgent } from '../../src/renderer/global-agent.js';
import { MODEL_SERVICE_SETUP_REQUIRED_REASON, type GlobalAgentDialogueProjection, type GlobalAgentProjection, type GlobalAgentRendererApi } from '../../src/shared/protocol.js';
import { localInstantLabel } from '../../src/shared/report-wording.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

const ITEM = 'b0000000-0000-4000-8000-000000000001';
const BOOK = 'b0000000-0000-4000-8000-000000000002';
const PIN = { itemId: ITEM, revisionId: 'a'.repeat(64) + '@base' };
const SOURCE = { ...PIN, kind: 'preference' as const, title: '本社审阅偏好', text: '保留有意使用的短句。' };
const SUPERVISION = { itemId: 'supervision:dir-1', revisionId: 'dir-1@base', kind: 'supervision' as const, title: '学习监督 1', text: '优先保留作者有意使用的短句。' };
const DIRECTIVE: GlobalAgentProjection['directives'][number] = {
  schema: 'ai7.learning-supervision-directive/1', actor: 'editor', directiveId: 'd0000000-0000-4000-8000-000000000001', ordinal: 1,
  supersedes: null, operationalScope: 'development-ci', recordedAt: '2026-11-02T03:04:05Z', operation: 'supervise', targets: [PIN],
  scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '保留有意使用的短句。', effect: 'guide',
};
const PROVIDER = { route: 'opencode-go', model: 'deepseek-v4.1-flash', policyRuleId: 'ordinary-production-global-agent-dialogue' };
const PROCEDURE = { procedureId: 'review', version: 1, digest: 'd'.repeat(64), title: '审阅工序', editorInstruction: '按本社偏好审阅。', stages: [] };
const projection: GlobalAgentProjection = {
  operationalScope: 'ordinary-production', dialogueState: 'available', scopedDialogueState: 'available', explanation: '可以提问。',
  categories: [{ categoryId: 'typos-and-usage', label: '文字与用法' }], books: [{ bookId: BOOK, title: '春江' }],
  items: [{ ...PIN, kind: 'preference', text: SOURCE.text, categoryId: 'typos-and-usage', bookId: null, state: 'active', lineage: [] }],
  sourceCandidates: [SOURCE], procedures: [PROCEDURE], directives: [], history: [],
};
const adopted: GlobalAgentProjection = { ...projection, sourceCandidates: [SOURCE, SUPERVISION] };
function dialogue(question = '问题', id = 'dialogue-1'): GlobalAgentDialogueProjection {
  return { dialogueId: id, bookId: null, question, sources: [PIN], askedAt: '2026-11-02T00:00:00Z',
    submissions: [{ attemptId: 'internal-attempt-id', question, sources: [SOURCE], kept: null, provider: PROVIDER }],
    attempts: [{ attemptId: 'internal-attempt-id', ordinal: 1, kind: 'ask', state: 'completed', fragments: [{ text: '回答内容。', breakAfter: false }],
      fragmentsFrom: 0, fragmentTotal: 1, source: 'ledger', causeCode: null, startedAt: '2026-11-02T00:00:00Z', settledAt: '2026-11-02T00:00:01Z', convertedMarkIds: [] }],
    actions: { stop: false, continue: false, regenerate: true } };
}
let uninstall: () => void;
beforeEach(() => {
  uninstall = installMiniDom();
  // The developer surface is the default under test; the ordinary-mode tests switch the layer off themselves.
  setTechnicalLayerVisible(true);
  Object.defineProperty(MiniElement.prototype, 'selectedOptions', { configurable: true, get(this: MiniElement) { return this.children.filter((child) => child.value === this.value); } });
  Object.assign(miniDocument, { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { delete (MiniElement.prototype as unknown as Record<string, unknown>)['selectedOptions']; vi.unstubAllGlobals(); uninstall(); });
const settle = async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); };
function harness(initial = dialogue(), open = false, initialProjection = projection) {
  const openModelService = vi.fn();
  let active = initial;
  let state = initialProjection;
  const api: GlobalAgentRendererApi = {
    inspectGlobalAgent: vi.fn(async () => state),
    prepareGlobalAgentTurn: vi.fn(async (input) => ({ question: input.kind === 'ask' ? input.question : active.question!, sources: [SOURCE], kept: null, provider: PROVIDER, sha256: 'prepared' })),
    askGlobalAgent: vi.fn(async (input) => { active = dialogue(input.question, `dialogue-${input.question}`); return active; }),
    inspectGlobalAgentDialogue: vi.fn(async () => active),
    continueGlobalAgentAnswer: vi.fn(async () => active), regenerateGlobalAgentAnswer: vi.fn(async () => active), stopGlobalAgentAnswer: vi.fn(async () => active),
    recordLearningSupervision: vi.fn(async () => state),
  };
  const root = mountGlobalAgent({ ...(open ? { dialogueId: initial.dialogueId } : {}), api, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, openAudit: vi.fn(), openModelService }) as unknown as MiniElement;
  miniDocument.body.append(root);
  const find = (selector: string) => root.querySelector(selector)! as unknown as MiniElement;
  const choose = (selector: string) => { const input = find(selector); input.checked = !input.checked; input.dispatchEvent({ type: 'change' }); };
  const submit = (value: string) => { find('[data-global-agent-question]').value = value; find('[data-global-agent-question-form]').dispatchEvent({ type: 'submit' }); };
  return { root, api, find, choose, submit, openModelService, setProjection: (next: GlobalAgentProjection) => { state = next; } };
}

it('sends directly once, omits empty tool scope, and leaves the composer ready for another question', async () => {
  const { api, find, submit } = harness(); await settle();
  submit('第一个问题'); submit('重复点击'); await settle();
  expect(api.askGlobalAgent).toHaveBeenCalledTimes(1);
  expect(api.askGlobalAgent).toHaveBeenCalledWith({ question: '第一个问题', sources: [], disclosureSha256: 'prepared' });
  expect(find('[data-global-agent-question-form] button').textContent).toBe('发送问题');
  expect(find('[data-global-agent-question-form] button').disabled).toBe(false);
  submit('第二个问题'); await settle();
  expect(api.askGlobalAgent).toHaveBeenCalledTimes(2);
  expect(find('.global-agent-previous-turns').textContent).toContain('第一个问题');
  expect(find('.global-agent-answer').textContent).toContain('第二个问题');
});

it('uses one memory checkbox and retains memory, book and procedure choices after send and confirmation', async () => {
  const { root, api, choose, find, submit } = harness(); await settle();
  expect(root.querySelectorAll(`[data-source-item="${ITEM}"]`)).toHaveLength(1);
  choose('[data-global-agent-item]'); choose('[data-global-agent-scope-book]'); choose('[data-global-agent-scope-procedure]');
  const checkbox = find('[data-global-agent-item]');
  expect(checkbox.parentElement?.children[0]).toBe(checkbox);
  submit('范围问题'); await settle();
  expect(api.askGlobalAgent).toHaveBeenCalledWith(expect.objectContaining({ sources: [PIN], scope: {
    bookIds: [BOOK], procedures: [{ procedureId: 'review', version: 1, digest: PROCEDURE.digest }],
  } }));
  // A local governance refresh is the same projection update used by proposal confirmation.
  find('[data-global-agent-governance]').dispatchEvent({ type: 'submit' }); await settle();
  for (const selector of ['[data-global-agent-item]', '[data-global-agent-scope-book]', '[data-global-agent-scope-procedure]']) expect(find(selector).checked).toBe(true);
});

it('keeps preview optional and contains IDs, hashes, raw tool arguments and raw instants in closed details', async () => {
  const { root, find, submit } = harness(dialogue(), false, { ...projection, directives: [DIRECTIVE] }); await settle();
  find('[data-global-agent-question]').value = '可选预览';
  root.querySelectorAll('button').find((button) => button.textContent === '查看将发送的内容')!.click(); await settle();
  expect(find('.global-agent-preview').hidden).toBe(false);
  expect(find('.global-agent-preview').textContent).toContain('OpenCode Go · DeepSeek V4.1 Flash');
  submit('直接发送'); await settle();
  // The memory list sits in the 引用范围 pill (#1413): opened, it reads; closed technical details still show only their summary.
  for (const pill of root.querySelectorAll('.global-agent-pill')) pill.setAttribute('open', '');
  const visible = (node: MiniElement): string => node.tagName === 'DETAILS' && !node.hasAttribute('open') ? node.children[0]?.textContent ?? '' : node.children.length ? node.children.map(visible).join(' ') : node.textContent;
  const text = visible(root as unknown as MiniElement);
  expect(root.querySelectorAll('.global-agent-pill').map((pill) => pill.dataset['globalAgentPill'])).toEqual(['scope', 'governance', 'directives']);
  expect(text).toContain('文字与用法');
  // A directive's time is the app's local instant label, never the stored ISO string (#1553 review).
  expect(text).toContain(localInstantLabel(DIRECTIVE.recordedAt));
  expect(text).not.toContain(DIRECTIVE.recordedAt);
  expect(text).not.toContain(ITEM); expect(text).not.toContain(PIN.revisionId); expect(text).not.toContain('internal-attempt-id');
  expect(root.querySelectorAll('.global-agent-technical').every((details) => !details.hasAttribute('open'))).toBe(true);
});

it('localizes tool results and supervision effects and preserves selections on proposal confirmation', async () => {
  const turn = { ...dialogue(), toolCalls: [{ attemptId: 'internal-attempt-id', callId: 'call', tool: 'retrieve', arguments: '{"query":"原始参数"}', outcome: 'returned' as const, result: '[{},{}]' }],
    supervisionProposals: [{ attemptId: 'internal-attempt-id', callId: 'proposal', input: { operation: 'supervise' as const, targets: [PIN], scope: { kind: 'house' as const }, categoryId: 'typos-and-usage', text: '谨慎归纳。', effect: 'freeze' as const } }] };
  const { root, find, choose, api, submit, setProjection } = harness(turn, true); await settle();
  expect(find('[data-global-agent-tool-calls]').textContent).toContain('检索图书与审阅偏好');
  expect(find('[data-global-agent-tool-calls]').textContent).toContain('返回 2 条结果');
  expect(find('[data-global-agent-proposals]').textContent).toContain('冻结规则');
  expect(find('[data-global-agent-tool-calls] pre').closest('details')?.hasAttribute('open')).toBe(false);
  choose('[data-global-agent-item]'); choose('[data-global-agent-scope-book]'); choose('[data-global-agent-scope-procedure]');
  setProjection({ ...projection, items: [{ ...projection.items[0]!, revisionId: 'frozen-version', text: '修正后的偏好。', state: 'frozen' }], sourceCandidates: [] });
  find('[data-global-agent-confirm-proposal]').click(); await settle();
  expect(find('[data-global-agent-item]').checked).toBe(true);
  expect(find('[data-global-agent-scope-book]').checked).toBe(true);
  expect(find('[data-global-agent-scope-procedure]').checked).toBe(true);
  expect(root.textContent).toContain('已记录');
  expect(root.textContent).toContain('修正后的偏好。');
  find('[data-global-agent-governance]').dispatchEvent({ type: 'submit' }); await settle();
  expect(api.recordLearningSupervision).toHaveBeenLastCalledWith(expect.objectContaining({ targets: [{ itemId: ITEM, revisionId: 'frozen-version' }] }));
  submit('冻结后提问'); await settle();
  expect(api.askGlobalAgent).toHaveBeenLastCalledWith(expect.objectContaining({ sources: [] }));
});

it('keeps a corrected source selected at its new revision and uses readable unavailable status', async () => {
  const { api, choose, find, submit, setProjection } = harness(); await settle();
  choose('[data-global-agent-item]');
  const corrected = { ...SOURCE, revisionId: 'corrected-version', text: '尊重原作者的短句。' };
  setProjection({ ...projection, sourceCandidates: [corrected], items: [{ ...projection.items[0]!, revisionId: corrected.revisionId, text: corrected.text }] });
  find('[data-global-agent-governance]').dispatchEvent({ type: 'submit' }); await settle();
  expect(find('[data-global-agent-item]').checked).toBe(true);
  submit('修正后提问'); await settle();
  expect(api.askGlobalAgent).toHaveBeenLastCalledWith(expect.objectContaining({ sources: [{ itemId: ITEM, revisionId: corrected.revisionId }] }));
  setProjection({ ...projection, dialogueState: '当前处理策略未允许', explanation: '请先设置可用的模型服务。' });
  find('[data-global-agent-governance]').dispatchEvent({ type: 'submit' }); await settle();
  expect(find('[data-global-agent-policy]').textContent).toBe('暂时无法提问 · 请先设置可用的模型服务。');
});

it('regenerates in one action without opening the optional preview', async () => {
  const { root, api, find } = harness(dialogue(), true); await settle();
  root.querySelectorAll('button').find((button) => button.textContent === '重新回答')!.click(); await settle();
  expect(api.prepareGlobalAgentTurn).toHaveBeenCalledWith({ kind: 'regenerate', dialogueId: 'dialogue-1', attemptId: 'internal-attempt-id' });
  expect(api.regenerateGlobalAgentAnswer).toHaveBeenCalledWith({ dialogueId: 'dialogue-1', attemptId: 'internal-attempt-id', sources: [PIN], disclosureSha256: 'prepared' });
  expect(find('.global-agent-preview').hidden).toBe(true);
});

it('shows one 参考哪些书和偏好 fold in ordinary mode and sends the same ask as developer mode', async () => {
  const ask = async (developer: boolean) => {
    setTechnicalLayerVisible(developer);
    const view = harness(dialogue(), false, adopted); await settle();
    // The choices sit in a fold that is closed until opened: hidden controls still submit the values they hold.
    view.choose('[data-global-agent-item]'); view.choose('[data-source-item="supervision:dir-1"]');
    view.choose('[data-global-agent-scope-book]'); view.choose('[data-global-agent-scope-procedure]');
    view.submit('同一个问题'); await settle();
    return view;
  };
  const ordinary = await ask(false);
  const fold = ordinary.find('[data-global-agent-fold="references"]');
  expect(fold.tagName).toBe('DETAILS');
  expect(fold.open).toBe(false);
  // The closed fold counts what the question carries (#1553 review).
  expect(fold.children[0]?.textContent).toBe('参考哪些书和偏好 · 已选 1 本书、2 条偏好、1 个工序');
  expect(ordinary.root.querySelectorAll('.global-agent-pill')).toHaveLength(0);
  expect(ordinary.root.querySelector('[data-global-agent-governance]')).toBeNull();
  expect(ordinary.root.textContent).not.toMatch(/治理|监督/u);
  const labels = (view: typeof ordinary) => view.root.querySelectorAll('button').map((button) => button.textContent);
  expect(labels(ordinary)).not.toContain('查看将发送的内容');
  expect(labels(ordinary)).not.toContain('生成审阅习惯总结');
  // 学习回溯 opens only where its page can be opened; #1549 opens it in ordinary mode too.
  expect(labels(ordinary).some((text) => text?.includes('学习回溯'))).toBe(true);
  // An adopted 学习监督 direction is a preference the editor carries, listed under ordinary words, not a governance record.
  const adoptedRow = ordinary.find('[data-source-item="supervision:dir-1"]');
  expect(adoptedRow.parentElement?.textContent).toBe('审阅偏好 · 已启用');
  const ordinaryAsk = vi.mocked(ordinary.api.askGlobalAgent).mock.calls.at(-1)![0];

  const developer = await ask(true);
  expect(developer.root.querySelectorAll('.global-agent-pill').map((pill) => pill.dataset['globalAgentPill']))
    .toEqual(['scope', 'governance', 'directives']);
  expect(developer.root.querySelector('[data-global-agent-governance]')).not.toBeNull();
  expect(labels(developer)).toContain('查看将发送的内容');
  expect(labels(developer)).toContain('生成审阅习惯总结');
  expect(labels(developer).some((text) => text?.includes('学习回溯'))).toBe(true);
  const developerAsk = vi.mocked(developer.api.askGlobalAgent).mock.calls.at(-1)![0];

  expect(ordinaryAsk).toEqual(developerAsk);
  expect(ordinaryAsk).toEqual({ question: '同一个问题', sources: [PIN, { itemId: 'supervision:dir-1', revisionId: 'dir-1@base' }], scope: {
    bookIds: [BOOK], procedures: [{ procedureId: 'review', version: 1, digest: PROCEDURE.digest }],
  }, disclosureSha256: 'prepared' });
});

it('writes its own ordinary blocked sentence instead of the service explanation', async () => {
  setTechnicalLayerVisible(false);
  const blocked = harness(dialogue(), false, { ...projection, dialogueState: MODEL_SERVICE_SETUP_REQUIRED_REASON,
    explanation: '此处暂不能调用模型。记忆与学习监督操作仅在本机记录，不读取稿件。' }); await settle();
  // The state means no model is bound — a saved key with no model chosen is the same — so the sentence names both, and the
  // page offers the action that opens 设置 › 模型服务.
  expect(blocked.find('[data-global-agent-policy]').textContent).toBe('暂时无法提问 · 请先在「设置 › 模型服务」里设置好模型密钥和模型。');
  expect(blocked.root.textContent).not.toMatch(/治理|监督/u);
  const setup = blocked.find('[data-global-agent-setup]');
  expect(setup.hidden).toBe(false);
  expect(setup.textContent).toBe('去设置 › 模型服务');
  setup.click();
  expect(blocked.openModelService).toHaveBeenCalledTimes(1);
  const refused = harness(dialogue(), false, { ...projection, dialogueState: '当前处理策略未允许',
    explanation: '此处暂不能调用模型。记忆与学习监督操作仅在本机记录，不读取稿件。' }); await settle();
  expect(refused.find('[data-global-agent-policy]').textContent).toBe('暂时无法提问 · 此处暂不能调用模型。');
  expect(refused.root.textContent).not.toMatch(/治理|监督/u);
  expect(refused.find('[data-global-agent-setup]').hidden).toBe(true);
});

it('keeps one send, retained selections and regenerate in ordinary mode', async () => {
  setTechnicalLayerVisible(false);
  const turn = { ...dialogue(), toolCalls: [],
    supervisionProposals: [{ attemptId: 'internal-attempt-id', callId: 'proposal',
      input: { operation: 'supervise' as const, targets: [PIN], scope: { kind: 'house' as const }, categoryId: 'typos-and-usage', text: '谨慎归纳。', effect: 'freeze' as const } }] };
  const view = harness(turn, true, adopted); await settle();
  view.choose('[data-global-agent-item]');
  // Adopting a suggestion repaints from the projection; the closed fold keeps its choice across it.
  view.find('[data-global-agent-confirm-proposal]').click(); await settle();
  expect(view.find('[data-global-agent-item]').checked).toBe(true);
  view.submit('普通问题'); view.submit('重复点击'); await settle();
  expect(view.api.askGlobalAgent).toHaveBeenCalledTimes(1);
  expect(view.api.askGlobalAgent).toHaveBeenCalledWith(expect.objectContaining({ question: '普通问题', sources: [PIN] }));
  // The send repaints from the projection again; the choice still stands.
  expect(view.find('[data-global-agent-item]').checked).toBe(true);
  // Regenerate stays one action without the preview, which ordinary mode does not show.
  view.root.querySelectorAll('button').find((button) => button.textContent === '重新回答')!.click(); await settle();
  expect(view.api.prepareGlobalAgentTurn).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'regenerate', attemptId: 'internal-attempt-id' }));
});

it('lists only what a question can carry in ordinary mode: a frozen item has no checkbox, developer mode lists it', async () => {
  const FROZEN = 'b0000000-0000-4000-8000-000000000009';
  const withFrozen: GlobalAgentProjection = { ...projection, items: [...projection.items,
    { ...PIN, itemId: FROZEN, revisionId: 'frozen@base', kind: 'preference', text: '已冻结的偏好。', categoryId: 'typos-and-usage', bookId: null, state: 'frozen', lineage: [] }] };
  setTechnicalLayerVisible(false);
  const ordinary = harness(dialogue(), false, withFrozen); await settle();
  expect(ordinary.root.querySelectorAll('[data-global-agent-item]').map((input) => input.dataset['globalAgentItem'])).toEqual([ITEM]);
  expect(ordinary.root.textContent).not.toContain('已冻结的偏好。');
  setTechnicalLayerVisible(true);
  const developer = harness(dialogue(), false, withFrozen); await settle();
  expect(developer.root.querySelectorAll('[data-global-agent-item]').map((input) => input.dataset['globalAgentItem'])).toEqual([ITEM, FROZEN]);
});

it('scans an ordinary dialogue with a tool call, a proposal, a directive and an adopted direction (#1315, #1553)', async () => {
  setTechnicalLayerVisible(false);
  const turn = { ...dialogue(),
    toolCalls: [{ attemptId: 'internal-attempt-id', callId: 'call', tool: 'retrieve', arguments: '{"query":"原始参数"}', outcome: 'returned' as const, result: '[{},{}]' },
      { attemptId: 'internal-attempt-id', callId: 'propose', tool: 'propose_learning_supervision', arguments: '{"text":"谨慎归纳。"}', outcome: 'returned' as const, result: null }],
    supervisionProposals: [{ attemptId: 'internal-attempt-id', callId: 'proposal',
      input: { operation: 'supervise' as const, targets: [PIN], scope: { kind: 'house' as const }, categoryId: 'typos-and-usage', text: '谨慎归纳。', effect: 'freeze' as const } }] };
  try {
    const view = harness(turn, true, { ...adopted, directives: [{ ...DIRECTIVE, text: '指令专用文字。' }] }); await settle();
    expectNoTechnicalText(view.root);
    // The page's own sentences — status, lede, legend, composer label, retrieve card — hold no developer word, so reverting any
    // of them to the developer wording fails here. 记忆 is the developer word for 审阅偏好.
    expect(view.root.textContent).not.toMatch(/治理|监督|记忆/u);
    // The directives list is developer-only: neither its heading, its text nor its time is on an ordinary page.
    expect(view.root.textContent).not.toContain('指令专用文字');
    expect(view.root.querySelector('.global-agent-directives')).toBeNull();
  } finally { setTechnicalLayerVisible(true); }
});
