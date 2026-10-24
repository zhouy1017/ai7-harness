import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findingReferencedRules } from '../../src/renderer/review-workspace.js';
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
