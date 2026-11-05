import { afterEach, expect, it, vi } from 'vitest';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { knowledgeItemLine, knowledgeProvenanceLine, knowledgeRevisionLine, knowledgeSupersededLine } from '../../src/renderer/series-knowledge-labels.js';
import { guidelinePreviewHeading } from '../../src/renderer/knowledge-base-labels.js';
import { importedSkillUpdateSourceFileLine } from '../../src/renderer/imported-skill-labels.js';
import { reviewBasisWords } from '../../src/renderer/review-basis.js';
import { retryLine } from '../../src/renderer/editor-protection-labels.js';
import { taskPageMore } from '../../src/renderer/analysis-paging-labels.js';
import { dialogueIncompleteLine } from '../../src/renderer/dialogue-labels.js';

afterEach(() => setTechnicalLayerVisible(true));

it('keeps retry, paging and incomplete-answer facts without parenthetical asides in production', () => {
  setTechnicalLayerVisible(false);
  expect(retryLine('journal-unavailable', true, 2, null)).toBe('自动重试：正在重试写入 · 已重试 2 次');
  expect(taskPageMore('计划变化', 1, 3)).toBe('继续读取计划变化 · 已显示 1 / 3');
  expect(dialogueIncompleteLine({ state: 'failed', causeCode: null, fragmentTotal: 0 })).toBe('回答未完成；没有收到可保留的文字。');
});

it('starts closed before channel and preference initialization', async () => {
  vi.resetModules();
  const layer = await import('../../src/renderer/technical-layer.js');
  expect(layer.technicalLayerVisible).toBe(false);
  expect(layer.technicalLayerReady).toBe(false);
  layer.setTechnicalLayerVisible(true);
  expect(() => layer.initializeTechnicalLayer('source-checkout', { getItem: () => { throw new Error('preference read failed'); } })).toThrow('preference read failed');
  expect(layer.technicalLayerVisible).toBe(false);
  expect(layer.technicalLayerReady).toBe(false);
});

it('keeps editor-named guideline files and procedures exact in the ordinary basis', () => {
  setTechnicalLayerVisible(false);
  expect(reviewBasisWords({ categoryId: 'review', executor: 'review-category-contract', searchEngine: false,
    guidelineDocuments: [{ documentId: 'rules', title: '文字规范20251104.txt', issuer: '本社', version: '2' }],
    procedure: { title: '体例审阅 v2', version: '3' } })).toBe('依据：文字规范20251104.txt · 体例审阅 v2（不联网）');
});

it.each(['第 2 版印数占比 12.5%', '比例 0.121%', '文字规范20251104.txt', 'v12 ordinary-production deepseek-test abcdef0123456789'])('preserves editor text exactly: %s', (text) => {
  setTechnicalLayerVisible(false);
  const provenance = { kind: 'manuscript-revision' as const, bookId: 'book', bookTitle: text, manuscriptId: 'm', revisionId: 'r', revisionLabel: 'r3', journalSequence: 0,
    blockId: 'b', fromGrapheme: 0, toGrapheme: 4, quote: text, uncheckpointed: false };
  expect(knowledgeProvenanceLine(provenance)).toContain(`「${text}」`);
  expect(knowledgeProvenanceLine({ ...provenance, uncheckpointed: true })).toContain(`《${text}》`);
  expect(knowledgeItemLine({ subject: text, classLabel: '人物', current: { ordinal: 3 } })).toContain(`「${text}」`);
  expect(knowledgeRevisionLine({ ordinal: 2, outcome: 'updated', content: text })).toContain(`更新：${text}`);
  expect(knowledgeSupersededLine({ ordinal: 2, content: text })).toContain(text);
  expect(guidelinePreviewHeading({ title: text, ordinal: 2 })).toContain(`《${text}》`);
  expect(importedSkillUpdateSourceFileLine({ path: text, bytes: 1234, sha256: 'a'.repeat(64) })).toBe(text);
});
