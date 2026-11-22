import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountLearningAudit } from '../../src/renderer/learning-audit.js';
import { localInstantLabel } from '../../src/renderer/plan-preview-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { LearningAuditMaterialProjection, LearningAuditProjection, LearningLineageProjection, RendererApi } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Unit suite (L1) for 学习回溯 in ordinary mode (Issue #1549): the page an editor reads, and the two choices on a row nobody
// has decided. Provider-free; the one request is the existing decision request.

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };

const BOOK = '10000000-0000-4000-8000-000000000001';
const AT = '2026-11-06T12:00:00.000Z';
const material = (materialKey: string, standing: LearningAuditMaterialProjection['standing'], extra: Partial<LearningAuditMaterialProjection> = {}): LearningAuditMaterialProjection => ({
  materialKey, kind: 'proposal-decision', digest: `digest-${materialKey}`, originLabel: '修改建议 · 拒绝', recordedAt: AT, excerpt: ['你的原因：篇幅'],
  standing, decisions: standing === 'pending' ? 0 : 1, decidedAt: null, downstreamTasks: 0, ...extra,
});
const lineageOf = (row: LearningAuditMaterialProjection): LearningLineageProjection => ({
  bookId: BOOK, bookTitle: '回溯之书', standing: row.standing, material: { ...row, target: { kind: 'proposal-decision' }, sourceTask: null, rationale: '', state: 'pending', decision: null } as never,
  decisions: [{ decisionId: 'd1', ordinal: 1, choice: 'book', note: null, recordedAt: AT, superseded: false, currentVersion: true, via: 'learning-eligibility', attribution: null,
    audit: { materialDigest: 'x', supersedes: null, recordDigest: 'y', basis: 'z', remediationPreview: null } }],
  earlierDecisions: 0, downstream: { signals: 1, memoryCandidates: 1, activeMemories: 2, tasks: 1 },
  signals: [{ versionId: 'v3', ordinal: 3, recordedAt: AT, current: true, lines: 2 }],
  tasks: [{ bookId: BOOK, reviewRunId: 'run', label: '《回溯之书》第 2 次审阅 · 错别字与规范用语', versionOrdinal: 1, use: 'completed', marked: true }], earlierTasks: 0,
});

function mounted(rows: LearningAuditMaterialProjection[], decide: (input: Parameters<RendererApi['decideLearningMaterial']>[0]) => Promise<unknown>) {
  const root = document.createElement('div') as unknown as HTMLElement;
  miniDocument.body.append(root as unknown as MiniElement);
  let current = rows;
  const page = (): LearningAuditProjection => ({
    books: [{ bookId: BOOK, title: '回溯之书', authors: [], editors: [], materialCount: current.length, materials: current }], nextCursor: null,
    choices: { books: [{ bookId: BOOK, title: '回溯之书' }], booksListed: 1, booksTruncated: false, series: [], seriesTruncated: false, seriesUnavailable: false },
  });
  const api = {
    inspectLearningAudit: vi.fn(async () => page()),
    inspectLearningLineage: vi.fn(async (input: { materialKey: string }) => lineageOf(current.find((row) => row.materialKey === input.materialKey)!)),
    previewLearningRemediation: vi.fn(), recordLearningRemediation: vi.fn(), inspectWordTrackedEditSample: vi.fn(),
    decideLearningMaterial: vi.fn(async (input: Parameters<RendererApi['decideLearningMaterial']>[0]) => {
      await decide(input);
      current = current.map((row) => row.materialKey === input.materialKey ? { ...row, standing: input.choice === 'excluded' ? 'excluded' : 'book', decisions: row.decisions + 1 } : row);
    }),
  };
  const setStatus = vi.fn();
  const view = mountLearningAudit({ root, api: api as never, openSourceVersion: vi.fn(), setStatus, errorMessage: (error, fallback) => error instanceof Error ? error.message : fallback });
  return { root, api, setStatus, view, setRows: (rows: LearningAuditMaterialProjection[]) => { current = rows; }, rows: () => Array.from(root.querySelectorAll<HTMLElement>('li.learning-audit-material')) };
}

it('drops a selected material whose standing changed during a decision re-read', async () => {
  const setup = mounted([material('a', 'pending'), material('b', 'house')], vi.fn());
  await setup.view.load(); await settle();
  const box = setup.root.querySelector<HTMLInputElement>('[data-material-key="b"] .learning-audit-select')!;
  box.checked = true; (box as unknown as MiniElement).dispatchEvent({ type: 'change' }); await settle();
  setup.setRows([material('a', 'pending'), material('b', 'excluded')]);
  setup.rows()[0]!.querySelector<HTMLElement>('[data-learning-audit-action="decide-book"]')!.click(); await settle();
  expect(setup.root.querySelector('[data-material-key="b"] .learning-audit-select')).toBeNull();
  expect(setup.root.querySelector('.learning-audit-selected')?.textContent ?? '').not.toContain('已选 1 条');
});

it('records an ordinary re-inclusion through 确定', async () => {
  const { root, api, view, rows } = mounted([material('a', 'excluded')], vi.fn());
  await view.load(); await settle(); rows()[0]!.querySelector<HTMLElement>('[data-learning-audit-action="open"]')!.click(); await settle();
  root.querySelector<HTMLElement>('[data-learning-audit-action="reinclude"]')!.click(); await settle();
  const choice = Array.from(root.querySelectorAll<HTMLInputElement>('.learning-reinclude input')).find((input) => input.value === 'book')!;
  choice.checked = true; (choice as unknown as MiniElement).dispatchEvent({ type: 'change' });
  const confirm = root.querySelector<HTMLButtonElement>('[data-learning-audit-action="reinclude-record"]')!;
  expect(confirm.textContent).toBe('确定'); confirm.click(); await settle();
  expect(api.decideLearningMaterial).toHaveBeenCalledWith(expect.objectContaining({ materialKey: 'a', choice: 'book' }));
});

it('reads in an editor\'s words: no empty value, version label, time string or 审计详情, filters as dropdowns', async () => {
  const { root, view, rows } = mounted([material('a', 'pending'), material('b', 'pending', { automaticAdmission: { choice: 'house', sourceKeys: [] } }), material('c', 'house')], vi.fn());
  await view.load(); await settle();
  expect(root.querySelector('.learning-audit-note')!.textContent).not.toContain('授予');
  expect(root.querySelectorAll('select').length).toBe(4);
  expect(root.querySelectorAll('.filter-choices').length).toBe(0);
  expect(rows().map((row) => row.querySelector('.learning-audit-standing')!.textContent)).toEqual(['还没决定', '默认用于学习', '用于学习 · 本社']);
  // Only the row nobody has decided offers the two choices.
  expect(rows().map((row) => Array.from(row.querySelectorAll('.learning-audit-decide button'), (node) => node.textContent))).toEqual([['用于学习', '不用'], [], []]);
  rows()[2]!.querySelector<HTMLElement>('[data-learning-audit-action="open"]')!.click(); await settle();
  const text = root.textContent ?? '';
  expect(text).not.toMatch(/审计详情|\bv\d+|\d{4}-\d{2}-\d{2}T|技术|学习准入|记忆/u);
  // The one decision, signal, task and counts, in the exact ordinary lines: no version label, no hole where one used to be.
  const lines = (selector: string) => Array.from(root.querySelectorAll(selector), (node) => node.textContent);
  expect(lines('.learning-lineage-decision-line')).toEqual([`用于学习 · 仅本书 · ${localInstantLabel(AT)} · 现在的决定`]);
  expect(lines('.learning-lineage-signals li')).toEqual([`审阅偏好 · ${localInstantLabel(AT)} · 其中 2 行出自这条材料 · 现在在用`]);
  expect(lines('.learning-lineage-tasks li')).toEqual(['《回溯之书》第 2 次审阅 · 错别字与规范用语 · 已完成 · 已标上「此结果参考的学习材料后来停止今后使用」']);
  expect(lines('[data-lineage-part="used"] .field-note')).toEqual([
    '1 条待接受的审阅偏好引用了它，接受后才会使用。', '2 条你新建的审阅偏好引用了它；停止今后使用后，这些偏好会暂停使用，记录原样保留。']);
  expect(lines('.learning-lineage-empty')).toEqual([]);
  expect(lines('.learning-lineage li, .learning-lineage p').some((line) => / {2}/u.test(line ?? ''))).toBe(false);
  expect(Array.from(root.querySelectorAll<HTMLElement>('[data-lineage-part]'), (node) => node.dataset['lineagePart'])).toEqual(['from', 'used']);
  expect(root.querySelector('.learning-audit-details')).toBeNull();
  expect(Array.from(root.querySelectorAll('dd')).filter((node) => (node.textContent ?? '') === '').length).toBe(0);
});

it('decides a row in place with the digest and decision count it was read at, then reads the page again', async () => {
  const { root, api, setStatus, view, rows } = mounted([material('a', 'pending'), material('b', 'changed', { decisions: 2 })], vi.fn());
  await view.load(); await settle();
  rows()[1]!.querySelector<HTMLElement>('[data-learning-audit-action="decide-excluded"]')!.click(); await settle();
  expect(api.decideLearningMaterial).toHaveBeenCalledWith({ bookId: BOOK, materialKey: 'b', materialDigest: 'digest-b', expectedDecisions: 2, choice: 'excluded', note: null });
  expect(api.inspectLearningAudit).toHaveBeenCalledTimes(2);
  rows()[0]!.querySelector<HTMLElement>('[data-learning-audit-action="decide-book"]')!.click(); await settle();
  expect(api.decideLearningMaterial).toHaveBeenLastCalledWith({ bookId: BOOK, materialKey: 'a', materialDigest: 'digest-a', expectedDecisions: 0, choice: 'book', note: null });
  expect(rows().map((row) => row.querySelector('.learning-audit-standing')!.textContent)).toEqual(['用于学习 · 仅本书', '不用于学习']);
  expect(setStatus).toHaveBeenLastCalledWith('已用于学习。', 'success');
  expect(root.querySelector('.learning-audit-refusal')).toBeNull();
});

it('shows the service\'s sentence when the material moved, and reads again', async () => {
  const { root, api, setStatus, view, rows } = mounted([material('a', 'pending')], async () => { throw new Error('这条材料在你打开后改过；请看过现在的内容再定。'); });
  await view.load(); await settle();
  rows()[0]!.querySelector<HTMLElement>('[data-learning-audit-action="decide-book"]')!.click(); await settle();
  expect(root.querySelector('.learning-audit-refusal')!.textContent).toBe('这条材料在你打开后改过；请看过现在的内容再定。');
  expect(api.inspectLearningAudit).toHaveBeenCalledTimes(2);
  expect(setStatus).toHaveBeenLastCalledWith('这条材料在你打开后改过；请看过现在的内容再定。', 'error');
  expect(rows()[0]!.querySelector('.learning-audit-standing')!.textContent).toBe('还没决定');
});

it('sends one decision on a double click, keeps the ticks on other rows, and puts focus on the decided row', async () => {
  const { root, api, view, rows } = mounted([material('a', 'pending'), material('b', 'house'), material('c', 'book')], vi.fn());
  await view.load(); await settle();
  for (const key of ['b', 'c']) {
    const box = root.querySelector<HTMLInputElement>(`[data-material-key="${key}"] .learning-audit-select`)!;
    box.checked = true; (box as unknown as MiniElement).dispatchEvent({ type: 'change' });
  }
  await settle();
  expect(root.querySelector('.learning-audit-selected')!.textContent).toBe('已选 2 条');
  const decide = rows()[0]!.querySelector<HTMLElement>('[data-learning-audit-action="decide-book"]')!;
  decide.click(); decide.click(); await settle();
  expect(api.decideLearningMaterial).toHaveBeenCalledTimes(1);
  expect(root.querySelector('.learning-audit-selected')!.textContent).toBe('已选 2 条');
  expect(document.activeElement).toBe(root.querySelector('[data-material-key="a"] [data-learning-audit-action="open"]'));
});

it('draws nothing when the answer comes after the page was left', async () => {
  let answer: () => void = () => {};
  const { root, api, setStatus, view, rows } = mounted([material('a', 'pending')], () => new Promise<void>((resolve) => { answer = resolve; }));
  await view.load(); await settle();
  const before = setStatus.mock.calls.length;
  rows()[0]!.querySelector<HTMLElement>('[data-learning-audit-action="decide-excluded"]')!.click(); await settle();
  root.remove();
  answer(); await settle();
  expect(api.decideLearningMaterial).toHaveBeenCalledTimes(1);
  expect(api.inspectLearningAudit).toHaveBeenCalledTimes(1);
  expect(setStatus.mock.calls.length).toBe(before + 1);
});

it('draws no 影响预览 while a stop is recorded or after a refused record whose re-read failed, and stop stays usable', async () => {
  const { root, api, view, rows } = mounted([material('b', 'house')], vi.fn());
  const preview = { bookId: BOOK, bookTitle: '回溯之书', previewDigest: 'p', scope: 'book', included: [{ materialKey: 'b', originLabel: '修改建议 · 拒绝' }], leftOut: [],
    groups: { future: 1, running: 0, prepared: 0, runningNamed: [], memory: 0, completed: 0, completedNamed: [], decisionsKept: 1, currentVersion: 3, linesAffected: 2 } };
  api.previewLearningRemediation.mockResolvedValue(preview as never);
  let refuse: (error: Error) => void = () => {};
  api.recordLearningRemediation.mockImplementation(() => new Promise((_, reject) => { refuse = reject; }));
  await view.load(); await settle();
  rows()[0]!.querySelector<HTMLElement>('[data-learning-audit-action="open"]')!.click(); await settle();
  api.inspectLearningLineage.mockRejectedValueOnce(new Error('读取失败'));
  root.querySelector<HTMLElement>('[data-learning-audit-action="stop"]')!.click(); await settle();
  expect(root.querySelector('.learning-remediation-preview')).toBeNull();
  expect(root.textContent).not.toMatch(/补救|影响预览|v3|候选或已启用记忆|显示为明确排除/u);
  refuse(new Error('预览之后，这些学习材料有了变化；请重新查看影响，再决定。')); await settle();
  expect(root.querySelector('.learning-remediation-preview')).toBeNull();
  expect(root.textContent).not.toMatch(/补救|影响预览|v3/u);
  expect(root.querySelector<HTMLButtonElement>('[data-learning-audit-action="stop"]')!.disabled).toBe(false);
});
