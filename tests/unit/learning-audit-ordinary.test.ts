import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountLearningAudit } from '../../src/renderer/learning-audit.js';
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
  decisions: [], earlierDecisions: 0, downstream: { signals: 0, memoryCandidates: 0, activeMemories: 0, tasks: 0 }, signals: [], tasks: [], earlierTasks: 0,
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
  return { root, api, setStatus, view, rows: () => Array.from(root.querySelectorAll<HTMLElement>('li.learning-audit-material')) };
}

it('reads in an editor\'s words: no empty value, version label, time string or 审计详情, filters as dropdowns', async () => {
  const { root, view, rows } = mounted([material('a', 'pending'), material('b', 'pending', { automaticAdmission: { choice: 'house', sourceKeys: [] } }), material('c', 'house')], vi.fn());
  await view.load(); await settle();
  expect(root.querySelector('.learning-audit-note')!.textContent).not.toContain('授予');
  expect(root.querySelectorAll('select').length).toBe(4);
  expect(root.querySelectorAll('.filter-choices').length).toBe(0);
  expect(rows().map((row) => row.querySelector('.learning-audit-standing')!.textContent)).toEqual(['还没决定', '默认用于学习', '用于学习 · 本社']);
  // Only the row nobody has decided offers the two choices.
  expect(rows().map((row) => Array.from(row.querySelectorAll('.learning-audit-decide button'), (node) => node.textContent))).toEqual([['用于学习', '不用'], [], []]);
  rows()[0]!.querySelector<HTMLElement>('[data-learning-audit-action="open"]')!.click(); await settle();
  const text = root.textContent ?? '';
  expect(text).not.toMatch(/审计详情|\bv\d+|\d{4}-\d{2}-\d{2}T|技术/u);
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
