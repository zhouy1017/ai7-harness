import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findingReferencedRules } from '../../src/renderer/review-workspace.js';
import { learningReasonAskCard } from '../../src/renderer/analysis-feedback.js';
import { installMiniDom } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => { restore(); });

describe('the finding card’s referenced-rule disclosure', () => {
  it('offers a closed 已参考规则 chip with the recorded line and exact version inside its native disclosure', () => {
    const card = document.createElement('article');
    const versionId = 'e3c44e08-8d78-47cd-8b32-2118c3af7427';
    const disclosure = findingReferencedRules({ referencedRuleVersions: [
      { versionId, ordinal: 7, lineIndex: 2, text: '统一编辑用语。' },
    ] });
    expect(disclosure).not.toBeNull();
    card.append(disclosure!);
    const details = card.querySelector('[data-referenced-rules]')!;
    expect(details.tagName).toBe('DETAILS');
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('已参考规则');
    expect(details.querySelector('summary')?.className).toBe('status-pill');
    // Native details makes only the summary visible until the reader opens it.
    expect(details.querySelector('p')?.textContent).toBe(`统一编辑用语。（本社审阅偏好 v7 · ${versionId} · 行 3）`);
  });

  it('offers no chip for unreferenced or historical findings', () => {
    expect(findingReferencedRules({ referencedRuleVersions: [] })).toBeNull();
    expect(findingReferencedRules({})).toBeNull();
  });
});

describe('the local learning ask beside a decision (Issue #1109; ADR 0095 §7)', () => {
  const ask = { askId: '4f0f7a9e-3c2b-4d8e-9a51-1b2c3d4e5f60', decisionId: 'a3a0c1d2-5e6f-4a7b-8c9d-0e1f2a3b4c5d', question: '这次为什么不采用？',
    options: ['证据不足', '方向不合适', '保持作者风格'] };

  it('offers unselected options and optional text, records the answer with no model call, and never takes focus', async () => {
    const calls: unknown[] = [];
    const card = learningReasonAskCard(ask, { recordLearningReasonAsk: async (input) => { calls.push(input); return null; } });
    document.body.append(card);
    const radios = Array.from(card.querySelectorAll<HTMLInputElement>('input')).filter((input) => input.type === 'radio');
    const answer = card.querySelector<HTMLButtonElement>('[data-learning-ask-answer]')!;
    expect(radios.map((radio) => radio.value)).toEqual(ask.options);
    expect(radios.some((radio) => radio.checked)).toBe(false);
    expect(card.querySelector('textarea')!.value).toBe('');
    expect(answer.disabled).toBe(true);
    expect(card.contains(document.activeElement)).toBe(false);
    radios[1]!.checked = true;
    radios[1]!.dispatchEvent({ type: 'change' } as unknown as Event);
    expect(answer.disabled).toBe(false);
    answer.click();
    await Promise.resolve(); await Promise.resolve();
    expect(calls).toEqual([{ action: 'answer', askId: ask.askId, choice: '方向不合适', text: null }]);
    expect(card.dataset['learningAskState']).toBe('answered');
  });

  it('is dismissed in one step and records that it was', async () => {
    const calls: unknown[] = [];
    const card = learningReasonAskCard(ask, { recordLearningReasonAsk: async (input) => { calls.push(input); return null; } });
    document.body.append(card);
    card.querySelector<HTMLButtonElement>('[data-learning-ask-dismiss]')!.click();
    await Promise.resolve();
    expect(card.dataset['learningAskState']).toBe('dismissed');
    expect(card.isConnected).toBe(false);
    expect(calls).toEqual([{ action: 'dismiss', askId: ask.askId }]);
  });
});
