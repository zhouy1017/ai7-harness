import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reviewSynthesisNode } from '../../src/renderer/review-synthesis.js';
import { installMiniDom } from '../support/mini-dom.js';
import { SAMPLE1_SYNTHESIS } from '../support/review-synthesis-projection.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => restore());

it('keeps the compact summary native and makes every cited index an actionable evidence control', () => {
  const jump = vi.fn();
  const node = reviewSynthesisNode(SAMPLE1_SYNTHESIS, '编辑选择的模型@high', jump);
  expect(node.tagName).toBe('DETAILS');
  expect(node.hasAttribute('open')).toBe(false);
  expect(node.querySelector('summary')?.textContent).toContain('1 组共性问题');
  expect(node.textContent).not.toContain('rvf_');
  expect(node.textContent).not.toContain('blk_');
  const evidence = node.querySelector<HTMLButtonElement>('[data-synthesis-evidence="e1"]')!;
  expect(evidence.textContent).toContain('第一章');
  evidence.click();
  expect(jump).toHaveBeenCalledWith(SAMPLE1_SYNTHESIS.evidence[0]);
});

it('retains a removed finding quotation without exposing a broken jump', () => {
  const node = reviewSynthesisNode({ ...SAMPLE1_SYNTHESIS,
    evidence: SAMPLE1_SYNTHESIS.evidence.map((entry) => ({ ...entry, status: 'absent', blockId: null })) }, undefined, vi.fn());
  expect(node.querySelector('button')).toBeNull();
  expect(node.textContent).toContain('已不在当前稿件中');
  expect(node.textContent).toContain(SAMPLE1_SYNTHESIS.evidence[0]!.quote);
});

it('shows the missing or budget reason before expanding the summary', () => {
  const node = reviewSynthesisNode({ ...SAMPLE1_SYNTHESIS, state: 'budget', summary: null,
    detail: '本次审阅已用完预算，逐条发现仍可处理。' }, undefined, vi.fn());
  expect(node.querySelector('summary')?.textContent).toContain('已用完预算');
});
