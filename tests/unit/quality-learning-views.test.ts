import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { localInstantLabel } from '../../src/renderer/plan-preview-labels.js';
import { mountEditorialMemory } from '../../src/renderer/knowledge-base-memory.js';
import { mountFeedbackHistory } from '../../src/renderer/feedback-history.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { EditorialLearningProjection, FeedbackHistoryProjection, RendererApi } from '../../src/shared/protocol.js';
import type { EditorialMemoryVersion } from '../../src/shared/protocol/learning.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };
function host(): HTMLElement { const root = document.createElement('main'); miniDocument.body.append(root as unknown as MiniElement); return root; }
function click(root: Element, label: string): void { Array.from(root.querySelectorAll('button')).find((button) => button.textContent === label)!.click(); }
const ID = '10000000-0000-4000-8000-000000000001';
const AT = '2026-11-06T12:00:00.000Z';
const memory = (itemId: string, state: EditorialMemoryVersion['state']): EditorialMemoryVersion => ({
  schema: 'ai7.global-editorial-memory/2', itemId, versionId: `${itemId}-version`, ordinal: 1, supersedes: null,
  recordedAt: AT, operationalScope: 'development-ci', applicability: { kind: 'house' }, editorialDimension: 'typos-and-usage',
  title: state === 'proposed' ? '保留作者的短句' : '统一术语', confidence: .8, state, actor: 'AI7', actionId: ID,
  action: 'create', signalIds: [], positiveExamples: [], negativeExamples: [], sources: [], parentVersions: [], supervisionDirectiveRefs: [],
});
function learning() {
  let page: EditorialLearningProjection = {
    basis: '工程依据 SHA ' + 'a'.repeat(64), enabled: true, controlEntries: 2, excludedBooks: [], excludedMaterials: [], signals: [],
    items: [memory('active', 'active'), memory('candidate', 'proposed')].map((current) => ({ current, usable: current.state === 'active', history: [current],
      row: { group: current.state === 'active' ? 'enabled' as const : 'pending' as const, changedAt: AT, origin: 'ai' as const, reenable: null, pin: current.versionId, pausedInUse: false } })),
    nextSignalOffset: null, nextItemOffset: null, nextExclusionOffset: null,
    curation: { available: true, offerDigest: 'a'.repeat(64), disclosure: '整理预算', envelope: null, passesUsed: 0, reservedTokens: 0, recentRuns: [] },
  };
  const change = (itemId: string, state: EditorialMemoryVersion['state']) => {
    page = { ...page, items: page.items.map((item) => item.current.itemId === itemId
      ? { ...item, current: { ...item.current, state } as EditorialMemoryVersion, usable: state === 'active', row: { ...item.row, group: state === 'active' ? 'enabled' : state === 'proposed' ? 'pending' : 'disabled', reenable: state === 'inactive' ? { standing: 'allowed', sentence: '可以重新启用，恢复到停用前的样子。' } : null } } : item) }; return page;
  };
  let global = { categories: [{ categoryId: 'typos-and-usage', label: '错别字与规范用语' }], books: [], directives: [], items: [
    { kind: 'preference', itemId: 'legacy', revisionId: 'legacy-version', categoryId: 'typos-and-usage', bookId: null, text: '沿用本社用语', state: 'active', lineage: [], row: { group: 'enabled', origin: 'editor', changedAt: AT, pausedInUse: false, pin: 'legacy-version', reenable: null as import('../../src/shared/protocol/learning.js').ReviewPreferenceRow['reenable'] } },
  ] };
  const api = {
    inspectEditorialLearning: vi.fn(async () => page), inspectGlobalAgent: vi.fn(async () => global),
    inspectHouseReviewPreference: vi.fn(async () => ({ current: null, history: [] })),
    acceptEditorialMemory: vi.fn(async (input: Parameters<RendererApi['acceptEditorialMemory']>[0]) => change(input.itemId, 'active')),
    deactivateEditorialMemory: vi.fn(async (input: Parameters<RendererApi['deactivateEditorialMemory']>[0]) => change(input.itemId, 'inactive')),
    reenableReviewPreference: vi.fn(async (input: Parameters<RendererApi['reenableReviewPreference']>[0]) => change(input.itemId, 'active')),
    deleteReviewPreference: vi.fn(async (input: Parameters<RendererApi['deleteReviewPreference']>[0]) => { page = { ...page, items: page.items.filter((item) => item.current.itemId !== input.itemId) }; return page; }),
    changeEditorialLearning: vi.fn(async (input: Parameters<RendererApi['changeEditorialLearning']>[0]) => { page = { ...page, enabled: input.kind === 'switch' ? input.enabled : page.enabled, controlEntries: 3 }; return page; }),
    recordLearningSupervision: vi.fn(async () => (global = { ...global, items: global.items.map((item) => ({ ...item, state: 'inactive', row: { ...item.row, group: 'disabled', reenable: { standing: 'allowed' as const, sentence: '可以重新启用，恢复到停用前的样子。' } } })) })),
  } satisfies Partial<Record<keyof RendererApi, unknown>>;
  return { api, renderer: api as unknown as RendererApi, setPage: (next: EditorialLearningProjection) => { page = next; }, getPage: () => page };
}

it('moves the same entry through stop, re-enable and stop with one request and restored focus', async () => {
  const root = host(); const { api, renderer } = learning(); await mountEditorialMemory(root, renderer, vi.fn());
  const row = () => root.querySelector('[data-memory-item="active"]')!;
  click(row(), '停用'); await settle();
  expect(root.querySelector('[role="status"]')!.textContent).toBe('已停用这条审阅偏好。');
  expect(root.querySelector('[data-disabled-preferences]')!.textContent).toContain('统一术语');
  const reenable = Array.from(row().querySelectorAll('button')).find((button) => button.textContent === '重新启用')!;
  reenable.click(); reenable.click(); await settle();
  expect(api.reenableReviewPreference).toHaveBeenCalledOnce();
  expect(api.reenableReviewPreference).toHaveBeenCalledWith({ itemId: 'active', expectedRevisionId: 'active-version', actionId: expect.any(String) });
  expect(document.activeElement?.textContent).toBe('停用');
  expect(root.querySelector('[role="status"]')!.textContent).toBe('已重新启用这条审阅偏好。');
  expect((document.activeElement as unknown as MiniElement).dispatchEvent({ type: 'keydown', key: 'Enter', repeat: true })).toBe(false);
  click(row(), '停用'); await settle();
  expect(document.activeElement?.textContent).toBe('重新启用');
});

it('confirms deletion inside the row, cancels without sending and submits a repeated press once', async () => {
  const nativeConfirm = vi.fn(); vi.stubGlobal('confirm', nativeConfirm);
  const root = host(); const { api, renderer } = learning(); await mountEditorialMemory(root, renderer, vi.fn());
  const row = () => root.querySelector('[data-memory-item="active"]')!;
  click(row(), '停用'); await settle(); click(row(), '删除…');
  expect(row().textContent).toContain('删除审阅偏好「统一术语」？删除后它不再使用，也不再列在这里；学习回溯里的记录保留。删除后不能恢复。');
  expect(document.activeElement?.textContent).toBe('取消');
  click(row(), '取消'); expect(api.deleteReviewPreference).not.toHaveBeenCalled();
  expect(document.activeElement?.textContent).toBe('删除…');
  click(row(), '删除…');
  (root.querySelector('.review-preference-confirm') as unknown as MiniElement).dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {}, stopPropagation() {} });
  expect(root.querySelector('.review-preference-confirm')).toBeNull();
  expect(document.activeElement?.textContent).toBe('删除…');
  click(row(), '删除…');
  const confirm = Array.from(row().querySelectorAll('button')).find((button) => button.textContent === '确认删除')!;
  confirm.click(); confirm.click(); await settle();
  expect(api.deleteReviewPreference).toHaveBeenCalledOnce(); expect(row()).toBeNull();
  expect(api.deleteReviewPreference).toHaveBeenCalledWith({ itemId: 'active', expectedRevisionId: 'active-version', actionId: expect.any(String) });
  expect(root.querySelector('[role="status"]')!.textContent).toBe('已删除这条审阅偏好。');
  expect(nativeConfirm).not.toHaveBeenCalled();
});

it.each([
  ['REVIEW_PREFERENCE_CHANGED', '这条审阅偏好刚在别处改过，已重新读取。'],
  ['REVIEW_PREFERENCE_ALREADY_REENABLED', '这条审阅偏好已经重新启用了。'],
  ['REVIEW_PREFERENCE_DELETED', '这条审阅偏好已经删除了。'],
  ['REVIEW_PREFERENCE_MERGED', '这条审阅偏好已并入另一条，不能单独重新启用。'],
  ['REVIEW_PREFERENCE_MATERIAL_STOPPED', '这条审阅偏好依据的学习材料已停止今后使用，不能重新启用。'],
])('keeps refusal %s inside deletion confirmation and reads both owners again', async (code, message) => {
  const root = host(); const { api, renderer } = learning(); await mountEditorialMemory(root, renderer, vi.fn());
  click(root.querySelector('[data-memory-item="active"]')!, '停用'); await settle();
  const before = api.inspectGlobalAgent.mock.calls.length;
  api.deleteReviewPreference.mockRejectedValueOnce({ code, message });
  click(root.querySelector('[data-memory-item="active"]')!, '删除…'); click(root, '确认删除'); await settle();
  expect(root.querySelector('.review-preference-confirm')!.textContent).toContain(message);
  expect(document.activeElement?.textContent).toBe('取消');
  expect(api.inspectGlobalAgent.mock.calls.length).toBe(before + 1);
  expect(api.inspectEditorialLearning).toHaveBeenCalledTimes(2);
});

it('uses the row projection for groups, provenance, pauses, local time and denied re-enable', async () => {
  const root = host(); const setup = learning(); const page = setup.getPage();
  setup.setPage({ ...page, items: page.items.map((item, index) => ({ ...item, history: [], row: { ...item.row,
    group: index === 0 ? 'disabled' : 'enabled', origin: index === 0 ? 'editor' : 'ai', pausedInUse: index === 1,
    reenable: index === 0 ? { standing: 'merged', sentence: '已并入另一条，不能单独重新启用。' } : null } })) });
  await mountEditorialMemory(root, setup.renderer, vi.fn());
  expect(root.querySelector('[data-disabled-preferences]')!.textContent).toContain(`${localInstantLabel(AT)}停用`);
  expect(root.querySelector('[data-disabled-preferences]')!.textContent).not.toContain('AI 归纳');
  expect(root.querySelector('[data-disabled-preferences]')!.textContent).toContain('已并入另一条');
  expect(Array.from(root.querySelector('[data-disabled-preferences]')!.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['删除…']);
  expect(root.querySelector('[data-memory-preferences]')!.textContent).toContain('AI 归纳 · 来源受限，暂停使用');
  expect(root.textContent).not.toMatch(/记忆|2026-11-06T|active-version|candidate-version/u);
});

it('leaves a detached page and its status untouched when an action finishes', async () => {
  const root = host(); const { api, renderer, getPage } = learning();
  let finish!: (page: EditorialLearningProjection) => void;
  api.deactivateEditorialMemory.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await mountEditorialMemory(root, renderer, vi.fn()); click(root.querySelector('[data-memory-item="active"]')!, '停用');
  const section = root.querySelector('section')!; const text = section.textContent; root.replaceChildren();
  finish(getPage()); await settle(); expect(section.textContent).toBe(text);
});

it.each([1, 2, 3])('focuses the next first action or remaining group heading after delete (%s stopped rows)', async (count) => {
  const setup = learning(); const root = host(); const page = setup.getPage(); const base = page.items[0]!;
  setup.setPage({ ...page, items: Array.from({ length: count }, (_, index) => ({ ...base,
    current: { ...base.current, itemId: `row-${index}` }, row: { ...base.row, group: 'disabled',
      reenable: index === 2 ? null : { standing: 'allowed', sentence: '可以重新启用。' } } })) });
  await mountEditorialMemory(root, setup.renderer, vi.fn());
  const remove = async (id: string) => { click(root.querySelector(`[data-memory-item="${id}"]`)!, '删除…'); click(root, '确认删除'); await settle(); };
  await remove('row-0');
  expect(document.activeElement?.textContent).toBe(count === 1 ? '已启用的审阅偏好' : '重新启用');
  if (count === 3) { await remove('row-2'); expect(document.activeElement?.textContent).toBe('已停用的审阅偏好'); }
});

it('keeps another action refusal out of an open delete strip and retains re-enable focus', async () => {
  const root = host(); const setup = learning(); await mountEditorialMemory(root, setup.renderer, vi.fn());
  click(root.querySelector('[data-memory-item="active"]')!, '停用'); await settle();
  click(root.querySelector('[data-review-preference="legacy"]')!, '停用'); await settle();
  click(root.querySelector('[data-review-preference="legacy"]')!, '删除…');
  setup.api.reenableReviewPreference.mockRejectedValueOnce({ code: 'REVIEW_PREFERENCE_MERGED', message: '这条审阅偏好已并入另一条，不能单独重新启用。' });
  click(root.querySelector('[data-memory-item="active"]')!, '重新启用'); await settle();
  expect(root.querySelector('.review-preference-confirm')!.textContent).not.toContain('已并入');
  expect(root.querySelector('[role="status"]')!.textContent).toContain('已并入');
  expect(document.activeElement?.textContent).toBe('重新启用');
});

it.each([false, true])('says an action succeeded when its projection refresh failed (developer=%s)', async (developer) => {
  setTechnicalLayerVisible(developer); const root = host(); const { api, renderer } = learning();
  await mountEditorialMemory(root, renderer, vi.fn());
  api.inspectGlobalAgent.mockRejectedValue(new Error('read failed'));
  click(root.querySelector('[data-memory-item="active"]')!, '停用'); await settle();
  expect(root.querySelector('[role="status"]')!.textContent).toBe('记录已更新，请重新打开此页以读取最新状态。');
  expect(root.querySelector<HTMLInputElement>('[data-learning-enabled]')!.disabled).toBe(!developer);
  expect(root.querySelector('.review-preference-confirm')).toBeNull();
});

it.each(['memory', 'preference'])('omits a %s without lifecycle metadata and leaves the page usable', async (kind) => {
  const setup = learning(); const root = host();
  if (kind === 'memory') setup.setPage({ ...setup.getPage(), items: [{ ...setup.getPage().items[0]!, row: undefined }] } as unknown as EditorialLearningProjection);
  else setup.api.inspectGlobalAgent.mockImplementation(async () => ({ categories: [], books: [], directives: [], items: [{ kind: 'preference', itemId: 'missing', text: '缺少信息' }] }) as never);
  await mountEditorialMemory(root, setup.renderer, vi.fn());
  expect(root.textContent).toContain('无法读取更多审阅偏好。');
  expect(root.querySelector(`[data-${kind === 'memory' ? 'memory-item="active"' : 'review-preference="missing"'}]`)).toBeNull();
  expect(root.querySelector<HTMLInputElement>('[data-learning-enabled]')!.disabled).toBe(false);
  expect(root.querySelector('[data-preference-editor="new"]')).not.toBeNull();
});

// 0.7.9 review BUG-19: 编辑偏好 replaced the rule's controls with a form that had no way out but saving.
it.each(['取消', 'Escape'])('leaves 编辑偏好 by %s without saving, the controls back and 编辑偏好 in focus', async (way) => {
  const setup = learning(); const root = host(); await mountEditorialMemory(root, setup.renderer, vi.fn());
  for (const selector of ['[data-memory-item="active"]', '[data-review-preference="legacy"]']) {
    const controls = root.querySelector(`${selector} .preference-actions`)!;
    const before = Array.from(controls.children);
    click(controls, '编辑偏好');
    const form = controls.querySelector('form.preference-editor')!;
    const text = form.querySelector('textarea')!;
    expect([controls.children.length, document.activeElement === text, text.value.length > 0]).toEqual([1, true, true]);
    text.value = '改到一半的句子';
    if (way === '取消') click(form, '取消');
    else (text as unknown as MiniElement).dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true });
    expect(Array.from(controls.children)).toEqual(before);
    expect(document.activeElement?.textContent).toBe('编辑偏好');
  }
  await settle();
  expect(setup.api.recordLearningSupervision).not.toHaveBeenCalled();
  // The form that adds a rule is always on the page and has nothing to go back to: it offers no 取消.
  expect(Array.from(root.querySelectorAll('[data-preference-editor="new"] button'), (button) => button.textContent)).toEqual(['新增并启用偏好']);
});

it('applies the refusal refresh and issues a fresh action id for each distinct press', async () => {
  const setup = learning(); const root = host(); await mountEditorialMemory(root, setup.renderer, vi.fn());
  const row = () => root.querySelector('[data-memory-item="active"]')!;
  click(row(), '停用'); await settle(); click(row(), '重新启用'); await settle();
  click(row(), '停用'); await settle(); click(row(), '重新启用'); await settle();
  expect(setup.api.reenableReviewPreference.mock.calls[0]![0].actionId).not.toBe(setup.api.reenableReviewPreference.mock.calls[1]![0].actionId);
  setup.api.deactivateEditorialMemory.mockImplementationOnce(async () => { setup.setPage({ ...setup.getPage(), items: [] }); throw { code: 'REVIEW_PREFERENCE_DELETED', message: '这条审阅偏好已经删除了。' }; });
  click(row(), '停用'); await settle(); expect(row()).toBeNull();
  expect(root.querySelector('[data-disabled-preferences]')).toBeNull();
});

it('ignores a late refusal after leaving the preference page', async () => {
  const setup = learning(); const root = host(); let reject!: (error: unknown) => void;
  setup.api.deactivateEditorialMemory.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await mountEditorialMemory(root, setup.renderer, vi.fn()); click(root.querySelector('[data-memory-item="active"]')!, '停用');
  const section = root.querySelector('section')!; const text = section.textContent; root.replaceChildren();
  reject({ code: 'REVIEW_PREFERENCE_DELETED', message: '这条审阅偏好已经删除了。' }); await settle();
  expect(section.textContent).toBe(text); expect(setup.api.inspectGlobalAgent).toHaveBeenCalledOnce();
});

it.each([
  ['reenable', 'GLOBAL_AGENT_MEMORY_LIMIT', '本社审阅偏好最多 64 条，合计最多 6,000 字；请先合并或停用已有条目。', '审阅偏好最多 64 条，合计最多 6,000 字；请先合并或停用已有条目。'],
  ['stop', 'LEARNING_SUPERVISION_STALE', '这条审阅偏好刚在别处改过，请重新查看后再操作。', '这条审阅偏好刚在别处改过，请重新查看后再操作。'],
])('shows a %s refusal and reads both owners', async (operation, code, message, displayed) => {
  const setup = learning(); const root = host(); await mountEditorialMemory(root, setup.renderer, vi.fn());
  const row = () => root.querySelector('[data-memory-item="active"]')!;
  if (operation === 'reenable') { click(row(), '停用'); await settle(); setup.api.reenableReviewPreference.mockRejectedValueOnce({ code, message }); }
  else setup.api.deactivateEditorialMemory.mockRejectedValueOnce({ code, message });
  const reads = setup.api.inspectGlobalAgent.mock.calls.length;
  click(row(), operation === 'reenable' ? '重新启用' : '停用'); await settle();
  expect(root.querySelector('[role="status"]')!.textContent).toBe(displayed);
  expect(setup.api.inspectGlobalAgent.mock.calls.length).toBe(reads + 1);
  expect(setup.api.inspectEditorialLearning).toHaveBeenCalledTimes(2);
});

it('offers ordinary preference pagination and names a developer reactivation history step', async () => {
  const setup = learning(); const root = host(); setup.setPage({ ...setup.getPage(), nextItemOffset: 2 });
  await mountEditorialMemory(root, setup.renderer, vi.fn()); click(root, '更多审阅偏好'); await settle();
  expect(setup.api.inspectEditorialLearning).toHaveBeenLastCalledWith(expect.objectContaining({ itemOffset: 2 }));
  setTechnicalLayerVisible(true); const developer = host(); const page = setup.getPage();
  setup.setPage({ ...page, items: [{ ...page.items[0]!, history: [{ ...memory('active', 'active'), action: 'reactivate' as const }] }] });
  await mountEditorialMemory(developer, setup.renderer, vi.fn());
  expect(developer.querySelector('[data-memory-item="active"] details')!.textContent).toContain('重新启用');
});

it('puts candidates first, accepts and excludes them, disables memory and keeps ordinary metadata private', async () => {
  const root = host(); const { api, renderer } = learning();
  await mountEditorialMemory(root, renderer, vi.fn());
  expect(Array.from(root.querySelectorAll<HTMLElement>('[data-memory-item]'), (item) => item.dataset['memoryItem'])).toEqual(['candidate', 'active']);
  expect(root.textContent).toContain('错别字与规范用语');
  expect(root.querySelector('[data-memory-candidates] h4')!.textContent).toBe('待你确认的审阅偏好');
  expect(root.querySelector('[data-disabled-preferences]')).toBeNull();
  expect(root.querySelector('[data-preference-editor="new"]') !== null).toBe(true);
  expect(root.querySelector('[data-memory-candidate-form]')).toBeNull();
  expect(root.textContent).not.toMatch(/token|1–10|SHA|日志|candidate-version|active-version/iu);
  // Issue #1531: no raw time in ordinary mode; the history reads the local time.
  expect(root.querySelector('details')!.textContent).toContain(localInstantLabel(AT));
  expect(root.querySelector('details')!.textContent).not.toContain(AT);
  click(root.querySelector('[data-memory-item="candidate"]')!, '接受'); await settle();
  expect(api.acceptEditorialMemory).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'candidate', expectedVersionId: 'candidate-version' }));
  click(root.querySelector('[data-memory-item="candidate"]')!, '停用'); await settle();
  expect(root.querySelector('[data-disabled-preferences] [data-memory-item="candidate"]')!.textContent).toContain(`${localInstantLabel(AT)}停用`);
  const second = learning(); await mountEditorialMemory(host(), second.renderer, vi.fn());
  const candidate = document.body.querySelectorAll<HTMLElement>('[data-memory-item="candidate"]')[1]!;
  click(candidate, '排除'); await settle();
  expect(second.api.deactivateEditorialMemory).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'candidate' }));
  expect(document.body.querySelectorAll('[role="status"]')[1]!.textContent).toBe('已排除这条待确认的审阅偏好。');
});

it('keeps the local switch and legacy preference disable connected to their existing owners', async () => {
  const root = host(); const { api, renderer } = learning(); await mountEditorialMemory(root, renderer, vi.fn());
  const toggle = root.querySelector<HTMLInputElement>('[data-learning-enabled]')!;
  toggle.checked = false; (toggle as unknown as MiniElement).dispatchEvent({ type: 'change' }); await settle();
  expect(api.changeEditorialLearning).toHaveBeenCalledWith({ kind: 'switch', enabled: false, expectedEntries: 2 });
  expect(root.querySelector<HTMLInputElement>('[data-learning-enabled]')!.checked).toBe(false);
  click(root.querySelector('[data-review-preference="legacy"]')!, '停用'); await settle();
  expect(api.recordLearningSupervision).toHaveBeenCalledWith(expect.objectContaining({ operation: 'deactivate', targets: [{ itemId: 'legacy', revisionId: 'legacy-version' }] }));
  expect(root.querySelector('[data-disabled-preferences] [data-review-preference="legacy"]')!.textContent).toContain(`${localInstantLabel(AT)}停用`);
});

it('preserves the developer budget, signal synthesis and full memory lineage', async () => {
  setTechnicalLayerVisible(true); const root = host(); const { api, renderer } = learning();
  await mountEditorialMemory(root, renderer, vi.fn());
  expect(root.textContent).toContain('空闲时整理学习记录');
  expect(root.querySelector('[data-memory-candidate-form]')).not.toBeNull();
  expect(root.textContent).toContain('来源与版本历史');
  expect(root.textContent).toContain('信心 80%');
  expect(api.inspectGlobalAgent).toHaveBeenCalledOnce();
});

const feedback = (): FeedbackHistoryProjection => ({ books: [
  { bookId: 'a', title: '甲书', authors: [], editors: [], peopleVersions: [] },
  { bookId: 'b', title: '乙书', authors: [], editors: [], peopleVersions: [] },
], entries: [0, 1, 2].map((index) => ({ entryId: `entry-${index}`, bookId: index === 1 ? 'b' : 'a', origin: 'proposal-decision', dimension: null,
  signal: '拒绝', reason: '保留作者表达', reasonState: 'given', recordedAt: new Date(Date.parse(AT) - index * 1000).toISOString(), peopleVersion: 0,
  target: { kind: 'mark', bookId: 'a', manuscriptId: ID, branchId: ID, blockId: 'blk_' + 'a'.repeat(24), markId: ID, detached: false },
})), truncated: false });
it.each([false, true])('shows the ordinary two-filter rows and preserves all developer filters (developer=%s)', async (developer) => {
  setTechnicalLayerVisible(developer); const root = host(); const page = feedback();
  const api = { inspectFeedbackHistory: vi.fn(async () => page) }; const open = vi.fn(async () => {});
  await mountFeedbackHistory({ root, api, open, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback }).load();
  const controls = Array.from(root.querySelectorAll<HTMLElement>('[data-feedback-filter]'), (control) => control.dataset['feedbackFilter']);
  expect(controls).toEqual(developer ? ['book', 'origin', 'signal', 'author', 'editor'] : ['book', 'origin']);
  expect(root.querySelector('[id="feedback-group-by"]') === null).toBe(!developer);
  expect(root.querySelector('[id="feedback-filter-dimension"]') === null).toBe(!developer);
  expect(root.querySelector('[id="feedback-filter-from"]') === null).toBe(!developer);
  expect(root.querySelector('[id="feedback-filter-to"]') === null).toBe(!developer);
  if (!developer) {
    expect(Array.from(root.querySelectorAll('[id="feedback-filter-origin"] option'), (option) => option.textContent)).toEqual(['全部', '修改建议决定', '审阅处理', '分析反馈']);
    expect(Array.from(root.querySelectorAll<HTMLElement>('[data-entry-id]'), (item) => item.dataset['entryId'])).toEqual(['entry-0', 'entry-1', 'entry-2']);
    expect(root.querySelector('.feedback-entry-line')!.textContent).toContain('《甲书》 · 修改建议 · 拒绝');
    expect(root.querySelector('.feedback-entry-reason')!.textContent).toBe('你的原因：保留作者表达');
    click(root, '查看原处'); await settle(); expect(open).toHaveBeenCalledWith(page.entries[0]!.target, 'entry-0');
  }
  const book = root.querySelector<HTMLSelectElement>('[id="feedback-filter-book"]')!;
  if (developer) book.querySelector<HTMLButtonElement>('[data-filter-value="b"]')!.click();
  else { book.value = 'b'; (book as unknown as MiniElement).dispatchEvent({ type: 'change' }); }
  await settle();
  expect(api.inspectFeedbackHistory).toHaveBeenLastCalledWith(expect.objectContaining({ bookId: 'b', after: null, signal: null, author: null, editor: null }));
});

// Issue #1410 item 28: a new rule or memory starts on the narrowest scope that is really known — never a guessed Book.
const BOOK_A = '20000000-0000-4000-8000-00000000000a';
const BOOK_B = '20000000-0000-4000-8000-00000000000b';
const signal = (signalId: string, bookId: string) => ({
  signalId, kind: 'rejected', bookTitle: bookId === BOOK_A ? '甲书' : '乙书', recordedAt: AT, attribution: { authors: [], editors: [] },
  source: { bookId, decisionId: `${signalId}-decision`, revisionId: `${signalId}-revision`, journalSequence: 1 },
  memoryCandidate: { editorialDimension: 'typos-and-usage' }, currentEligibility: 'book', eligibility: { decisionId: null }, rewriteDistance: null,
}) as unknown as EditorialLearningProjection['signals'][number];
function scoped(books: Array<{ bookId: string; title: string }>, route: { bookId: string } | null, signals: EditorialLearningProjection['signals'] = []) {
  const { api, renderer } = learning();
  const base = (): EditorialLearningProjection => ({ basis: '', enabled: true, controlEntries: 2, excludedBooks: [], excludedMaterials: [], signals, items: [],
    nextSignalOffset: null, nextItemOffset: null, nextExclusionOffset: null, curation: { available: false, disclosure: '', envelope: null, passesUsed: 0, reservedTokens: 0, recentRuns: [] } } as unknown as EditorialLearningProjection);
  const create = vi.fn(async () => base());
  Object.assign(api, {
    inspectGlobalAgent: vi.fn(async () => ({ categories: [{ categoryId: 'typos-and-usage', label: '错别字与规范用语' }], books, directives: [], items: [] })),
    getBookWorkbenchRoute: vi.fn(async () => route), createEditorialMemory: create,
  });
  if (signals.length > 0) api.inspectEditorialLearning.mockImplementation(async () => base());
  return { api, renderer, create };
}
const scopeOf = (root: HTMLElement) => root.querySelector<HTMLSelectElement>('[data-preference-editor="new"] select[aria-label="适用范围"]')!;

it('starts a new ordinary rule on the Book being worked on, saving it for that Book', async () => {
  const root = host(); const { api, renderer } = scoped([{ bookId: BOOK_A, title: '甲书' }, { bookId: BOOK_B, title: '乙书' }], { bookId: BOOK_B });
  await mountEditorialMemory(root, renderer, vi.fn());
  expect(scopeOf(root).value).toBe(BOOK_B);
  const text = root.querySelector<HTMLTextAreaElement>('[data-preference-editor="new"] textarea')!; text.value = '保留作者的短句';
  (root.querySelector('[data-preference-editor="new"]') as unknown as MiniElement).dispatchEvent({ type: 'submit' }); await settle();
  expect(api.recordLearningSupervision).toHaveBeenCalledWith(expect.objectContaining({ operation: 'create', scope: { kind: 'book', bookId: BOOK_B } }));
});

it('keeps 全社 when no Book can be told: no working Book among several, or a working Book not listed', async () => {
  for (const route of [null, { bookId: '20000000-0000-4000-8000-0000000000ff' }]) {
    const root = host(); const { renderer } = scoped([{ bookId: BOOK_A, title: '甲书' }, { bookId: BOOK_B, title: '乙书' }], route);
    await mountEditorialMemory(root, renderer, vi.fn());
    expect(scopeOf(root).value).toBe('');
  }
  const only = host(); const single = scoped([{ bookId: BOOK_A, title: '甲书' }], null);
  await mountEditorialMemory(only, single.renderer, vi.fn());
  expect(scopeOf(only).value).toBe(BOOK_A);
});

it('scopes a developer memory candidate to its sources\' Book, and refuses sources from two Books under it', async () => {
  setTechnicalLayerVisible(true);
  const root = host(); const { create, renderer } = scoped([], null, [signal('s1', BOOK_A), signal('s2', BOOK_A), signal('s3', BOOK_B)]);
  await mountEditorialMemory(root, renderer, vi.fn());
  const form = root.querySelector('[data-memory-candidate-form]') as unknown as MiniElement;
  // The mini DOM has no constraint validation; the title is filled below, so the form is valid.
  Object.assign(form, { reportValidity: () => true });
  expect(root.querySelector<HTMLSelectElement>('[data-memory-candidate-form] select')!.value).toBe('book');
  const tick = (id: string) => { const box = root.querySelector<HTMLInputElement>(`[data-memory-source="${id}"]`)!; box.checked = true; (box as unknown as MiniElement).dispatchEvent({ type: 'change' }); };
  root.querySelector<HTMLInputElement>('[data-memory-candidate-form] input')!.value = '保留作者的短句';
  tick('s1'); tick('s3');
  form.dispatchEvent({ type: 'submit' }); await settle();
  expect(create).not.toHaveBeenCalled();
  expect(root.querySelector('[role="status"]')!.textContent).toContain('不止一本书');
  const untick = root.querySelector<HTMLInputElement>('[data-memory-source="s3"]')!; untick.checked = false; (untick as unknown as MiniElement).dispatchEvent({ type: 'change' });
  tick('s2');
  form.dispatchEvent({ type: 'submit' }); await settle();
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ signalIds: ['s1', 's2'], applicability: { kind: 'book', bookId: BOOK_A } }));
});
