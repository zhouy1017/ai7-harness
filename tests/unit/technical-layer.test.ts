import { recoveryIdentityRows } from '../../src/renderer/technical-layer-labels.js';
import { globalAttentionObjectLabel } from '../../src/renderer/global-attention-labels.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectTechnicalDisclosures, initializeTechnicalLayer, metadataWords, modelLabelWords, saveTechnicalLayerVisible, setTechnicalLayerVisible, technicalDisclosure, technicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { reviewBasisWords } from '../../src/renderer/review-basis.js';
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
    metadata.textContent = metadataWords('主分支 · Revision 18 · 版本8 · 全稿 0.121%');
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
    add(); collectTechnicalDisclosures(root);
    expect(root.textContent?.match(/查看技术详情/gu)).toHaveLength(1);
    page.remove(); collectTechnicalDisclosures(root);
    expect(root.querySelector('[data-technical-collection]')).toBeNull();
  });
});
