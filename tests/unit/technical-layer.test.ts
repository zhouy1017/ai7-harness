import { recoveryIdentityRows } from '../../src/renderer/technical-layer-labels.js';
import { globalAttentionObjectLabel } from '../../src/renderer/global-attention-labels.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retainPollInteraction } from '../../src/renderer/poll-interaction.js';
import { collectTechnicalDisclosures, initializeTechnicalLayer, technicalWords, modelLabelWords, saveTechnicalLayerVisible, setTechnicalLayerVisible, technicalDisclosure, technicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { reviewBasisWords } from '../../src/renderer/review-basis.js';
import { modelConnectionTestDisclosure } from '../../src/renderer/model-service-roles.js';
import { installMiniDom } from '../support/mini-dom.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => { setTechnicalLayerVisible(true); restore(); });

describe('technical layer presentation (#1315)', () => {
  it('defaults to development only and remembers the explicit renderer preference', () => {
    let saved: string | null = null;
    const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
    for (const channel of ['windows-installer', 'windows-portable', 'packaged'] as const) {
      initializeTechnicalLayer(channel, storage); expect(technicalLayerVisible).toBe(false);
    }
    initializeTechnicalLayer('source-checkout', storage); expect(technicalLayerVisible).toBe(true);
    initializeTechnicalLayer('source-checkout', storage, 'ordinary-production'); expect(technicalLayerVisible).toBe(false);
    saveTechnicalLayerVisible(false, storage);
    initializeTechnicalLayer('source-checkout', storage); expect(technicalLayerVisible).toBe(false);
  });

  it('renders the structured basis by mode without altering its source fields', () => {
    const basis = { categoryId: 'review', executor: 'review-category-contract', searchEngine: false,
      guidelineDocuments: [{ documentId: 'rules', title: '本社规范.txt', issuer: '本社', version: '12' }],
      procedure: { title: '文字审阅', version: '2' } };
    setTechnicalLayerVisible(false);
    expect(reviewBasisWords(basis)).toBe('依据：本社规范.txt · 文字审阅（不联网）');
    expect(reviewBasisWords({ ...basis, searchEngine: true })).toBe('依据：本社规范.txt · 文字审阅（联网）');
    const nativeSearchBasis = { ...basis, searchEngine: true, modelChannelSearchLabel: '编辑选择的通道' };
    expect(reviewBasisWords(nativeSearchBasis)).toBe('依据：本社规范.txt · 文字审阅（联网）');
    expect(basis.procedure.version).toBe('2');
    setTechnicalLayerVisible(true);
    expect(reviewBasisWords(basis)).toContain('文字审阅（第 2 版）');
    expect(reviewBasisWords(nativeSearchBasis)).toContain('将使用 编辑选择的通道 自带的联网搜索');
  });

  it('omits the disclosure payload and formats only metadata in ordinary mode', () => {
    setTechnicalLayerVisible(false);
    const root = document.createElement('main');
    const disclosure = document.createElement('details');
    disclosure.textContent = '查看技术详情 · ordinary-production v33 · abcdef0123456789';
    root.append(technicalDisclosure(disclosure));
    const metadata = document.createElement('p');
    metadata.textContent = `稿件${technicalWords(' · 主分支 · Revision 18 · 版本8')} · 全稿 0%`;
    root.append(metadata);
    expectNoTechnicalText(root);
    expect(disclosure.textContent).toBe('');
    expect(metadata.textContent).toContain('全稿 0%');
    expect(metadata.textContent).not.toContain('版本8');
    expect(metadata.textContent).not.toContain('当前修订版');
    expect(modelLabelWords({ modelId: 'account/synthetic-model', modelLabel: 'account/synthetic-model' })).toBe('Account Synthetic Model');
  });

  it('scans recovery and attention identity metadata in ordinary mode', () => {
    setTechnicalLayerVisible(false);
    const root = document.createElement('section');
    for (const [term, value] of recoveryIdentityRows({ bookTitle: '合成图书', bookId: 'a'.repeat(32), manuscriptId: 'b'.repeat(32), branchName: '主分支', branchId: 'c'.repeat(32) })) {
      const row = document.createElement('p'); row.textContent = term + '：' + value; root.append(row);
    }
    expectNoTechnicalText(root);
    expect(globalAttentionObjectLabel({ kind: 'recovery', branchName: '自定义分支' } as Parameters<typeof globalAttentionObjectLabel>[0])).toBe('稿件');
  });

  it('offers one entry including later disclosures and removes records when their page leaves', () => {
    const root = document.createElement('main');
    const page = document.createElement('section'); root.append(page);
    const add = () => { const details = document.createElement('details'); const summary = document.createElement('summary');
      summary.textContent = '查看技术详情'; details.append(summary); page.append(technicalDisclosure(details)); };
    add(); add(); collectTechnicalDisclosures(root);
    page.append(...modelConnectionTestDisclosure({ modelId: 'synthetic-model', outcome: 'passed', code: null,
      testedAt: '2026-11-04T12:00:00.000Z', credentialUpdatedAt: '2026-11-04T11:00:00.000Z', verified: 'buffered-text-only' }));
    add(); collectTechnicalDisclosures(root);
    expect(root.textContent?.match(/查看技术详情/gu)).toHaveLength(1);
    page.remove(); collectTechnicalDisclosures(root);
    expect(root.querySelector('[data-technical-collection]')).toBeNull();
  });

  it('keeps the visible shared disclosure focused through two changed drawer projections (#1375 J10)', async () => {
    vi.useFakeTimers(); setTechnicalLayerVisible(true);
    const root = document.createElement('main'); document.body.append(root);
    const drawer = document.createElement('section'); root.append(drawer);
    const other = document.createElement('details'); other.append(document.createElement('summary')); root.append(technicalDisclosure(other));
    let settled = 3;
    const paint = () => {
      const restoreInteraction = retainPollInteraction(drawer);
      const more = document.createElement('details'); more.className = 'task-plan-technical';
      const summary = document.createElement('summary'); const progress = document.createElement('p'); progress.textContent = `${settled}/8`;
      more.append(summary, progress); drawer.replaceChildren(technicalDisclosure(more)); restoreInteraction(); collectTechnicalDisclosures(root);
    };
    try {
      paint();
      const control = root.querySelector<HTMLDetailsElement>('[data-technical-collection]')!;
      control.open = true; collectTechnicalDisclosures(root);
      const summary = control.querySelector<HTMLElement>('summary')!; summary.focus();
      const timer = setInterval(() => { settled++; paint(); }, 2000);
      for (const done of [4, 5]) {
        const previous = drawer.querySelector('details'); await vi.advanceTimersByTimeAsync(2000);
        const more = drawer.querySelector<HTMLDetailsElement>('details')!;
        expect(more).not.toBe(previous); expect(more.textContent).toContain(`${done}/8`);
        expect(more.open).toBe(true); expect(more.hidden).toBe(false);
        expect(more.querySelector<HTMLElement>('summary')!.hidden).toBe(true);
        expect(control.open).toBe(true); expect(summary.hidden).toBe(false); expect(document.activeElement).toBe(summary);
      }
      clearInterval(timer);
    } finally { vi.clearAllTimers(); vi.useRealTimers(); root.remove(); }
  });
});
