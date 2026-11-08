import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountGlobalAgent } from '../../src/renderer/global-agent.js';
import type { GlobalAgentDialogueProjection, GlobalAgentProjection, GlobalAgentRendererApi } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

const ITEM = 'b0000000-0000-4000-8000-000000000001';
const BOOK = 'b0000000-0000-4000-8000-000000000002';
const PIN = { itemId: ITEM, revisionId: 'a'.repeat(64) + '@base' };
const SOURCE = { ...PIN, kind: 'preference' as const, title: '本社审阅偏好', text: '保留有意使用的短句。' };
const PROVIDER = { route: 'opencode-go', model: 'deepseek-v4.1-flash', policyRuleId: 'ordinary-production-global-agent-dialogue' };
const PROCEDURE = { procedureId: 'review', version: 1, digest: 'd'.repeat(64), title: '审阅工序', editorInstruction: '按本社偏好审阅。', stages: [] };
const projection: GlobalAgentProjection = {
  operationalScope: 'ordinary-production', dialogueState: 'available', scopedDialogueState: 'available', explanation: '可以提问。',
  categories: [{ categoryId: 'typos-and-usage', label: '文字与用法' }], books: [{ bookId: BOOK, title: '春江' }],
  items: [{ ...PIN, kind: 'preference', text: SOURCE.text, categoryId: 'typos-and-usage', bookId: null, state: 'active', lineage: [] }],
  sourceCandidates: [SOURCE], procedures: [PROCEDURE], directives: [], history: [],
};
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
  Object.defineProperty(MiniElement.prototype, 'selectedOptions', { configurable: true, get(this: MiniElement) { return this.children.filter((child) => child.value === this.value); } });
  Object.assign(miniDocument, { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { delete (MiniElement.prototype as unknown as Record<string, unknown>)['selectedOptions']; vi.unstubAllGlobals(); uninstall(); });
const settle = async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); };
function harness(initial = dialogue(), open = false) {
  let active = initial;
  let state = projection;
  const api: GlobalAgentRendererApi = {
    inspectGlobalAgent: vi.fn(async () => state),
    prepareGlobalAgentTurn: vi.fn(async (input) => ({ question: input.kind === 'ask' ? input.question : active.question!, sources: [SOURCE], kept: null, provider: PROVIDER, sha256: 'prepared' })),
    askGlobalAgent: vi.fn(async (input) => { active = dialogue(input.question, `dialogue-${input.question}`); return active; }),
    inspectGlobalAgentDialogue: vi.fn(async () => active),
    continueGlobalAgentAnswer: vi.fn(async () => active), regenerateGlobalAgentAnswer: vi.fn(async () => active), stopGlobalAgentAnswer: vi.fn(async () => active),
    recordLearningSupervision: vi.fn(async () => state),
  };
  const root = mountGlobalAgent({ ...(open ? { dialogueId: initial.dialogueId } : {}), api, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, openAudit: vi.fn() }) as unknown as MiniElement;
  miniDocument.body.append(root);
  const find = (selector: string) => root.querySelector(selector)! as unknown as MiniElement;
  const choose = (selector: string) => { const input = find(selector); input.checked = !input.checked; input.dispatchEvent({ type: 'change' }); };
  const submit = (value: string) => { find('[data-global-agent-question]').value = value; find('[data-global-agent-question-form]').dispatchEvent({ type: 'submit' }); };
  return { root, api, find, choose, submit, setProjection: (next: GlobalAgentProjection) => { state = next; } };
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

it('keeps preview optional and contains IDs, hashes and raw tool arguments in closed details', async () => {
  const { root, find, submit } = harness(); await settle();
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
  expect(text).not.toContain(ITEM); expect(text).not.toContain(PIN.revisionId); expect(text).not.toContain('internal-attempt-id');
  expect(root.querySelectorAll('.global-agent-technical').every((details) => !details.hasAttribute('open'))).toBe(true);
});

it('localizes tool results and supervision effects and preserves selections on proposal confirmation', async () => {
  const turn = { ...dialogue(), toolCalls: [{ attemptId: 'internal-attempt-id', callId: 'call', tool: 'retrieve', arguments: '{"query":"原始参数"}', outcome: 'returned' as const, result: '[{},{}]' }],
    supervisionProposals: [{ attemptId: 'internal-attempt-id', callId: 'proposal', input: { operation: 'supervise' as const, targets: [PIN], scope: { kind: 'house' as const }, categoryId: 'typos-and-usage', text: '谨慎归纳。', effect: 'freeze' as const } }] };
  const { root, find, choose, api, submit, setProjection } = harness(turn, true); await settle();
  expect(find('[data-global-agent-tool-calls]').textContent).toContain('检索跨书与记忆');
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

it('scans the Global Agent dialogue in ordinary mode (#1315)', async () => {
  setTechnicalLayerVisible(false);
  try { const view = harness(dialogue(), true); await settle(); expectNoTechnicalText(view.root); }
  finally { setTechnicalLayerVisible(true); }
});
