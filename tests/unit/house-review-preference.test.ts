import { describe, expect, it } from 'vitest';
import { houseReviewPreferenceKindDefinition } from '../../src/service/house-review-preference.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { describeComposition } from '../../src/service/harness/primary-agent-harness.js';
import { editCategoryWeight, graphemeEditVolume } from '../../src/service/edit-quality-signals.js';
import type { HouseReviewPreferenceUse } from '../../src/shared/protocol.js';

const preference: HouseReviewPreferenceUse = { versionId: '10000000-0000-4000-8000-000000000001', ordinal: 1, materialSetDigest: 'a'.repeat(64), sourceCount: 1, lines: ['格式：倾向保留原有写法。'] };

describe('review preference opt-in', () => {
  it('keeps every existing category contract, fixture request key and composition byte-identical without an admitted record', () => {
    for (const entry of BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.filter((category) => category.executor === 'review-category-contract')) {
      const base = reviewCategoryKindDefinition(reviewCategoryContractInput(entry));
      const composition = describeComposition('ai7-local-deterministic', 'fixture', base.promptContractDigest);
      for (const wrapped of [houseReviewPreferenceKindDefinition(base, null, true), houseReviewPreferenceKindDefinition(base, preference, false)]) {
        expect(wrapped === base).toBe(true);
        expect(wrapped.systemPrompt === base.systemPrompt).toBe(true);
        expect(wrapped.requestDigest(1, 'b'.repeat(64)) === base.requestDigest(1, 'b'.repeat(64))).toBe(true);
        expect(JSON.stringify(describeComposition('ai7-local-deterministic', 'fixture', wrapped.promptContractDigest)) === JSON.stringify(composition)).toBe(true);
      }
    }
  });

  it('adds a bounded advisory block and deterministically changes the contract, composition and request digest', () => {
    const entry = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((category) => category.categoryId === 'style-and-format')!;
    const base = reviewCategoryKindDefinition(reviewCategoryContractInput(entry));
    const wrapped = houseReviewPreferenceKindDefinition(base, preference, true);
    expect(wrapped.systemPrompt.startsWith(base.systemPrompt)).toBe(true);
    expect(wrapped.systemPrompt.includes('本社审阅偏好 v1（来源：1 条已判定反馈）')).toBe(true);
    expect(wrapped.systemPrompt.includes('不是规则或事实证据')).toBe(true);
    expect(wrapped.promptContractDigest).toBe(houseReviewPreferenceKindDefinition(base, preference, true).promptContractDigest);
    expect(wrapped.promptContractDigest).not.toBe(base.promptContractDigest);
    expect(describeComposition('ai7-local-deterministic', 'fixture', wrapped.promptContractDigest).digest).not.toBe(describeComposition('ai7-local-deterministic', 'fixture', base.promptContractDigest).digest);
    expect(wrapped.requestDigest(1, 'b'.repeat(64))).not.toBe(base.requestDigest(1, 'b'.repeat(64)));
    expect(wrapped.parseUnitResult).toBe(base.parseUnitResult);
    expect(wrapped.reduce).toBe(base.reduce);
    expect(wrapped.contractIdentity!.categoryConfiguration).not.toEqual(base.contractIdentity!.categoryConfiguration);
    const changed = houseReviewPreferenceKindDefinition(base, { ...preference, ordinal: 2, lines: ['另一条合成审阅偏好。'] }, true);
    expect(changed.contractIdentity!.categoryConfiguration).not.toEqual(wrapped.contractIdentity!.categoryConfiguration);
  });

  it('counts grapheme edits and stable category effort weights without time tracking', () => {
    expect(graphemeEditVolume('前👨‍👩‍👧后', '前字后')).toBe(1);
    expect(graphemeEditVolume('相同', '相同')).toBe(0);
    expect(graphemeEditVolume('甲乙', '甲丙乙')).toBe(1);
    expect(editCategoryWeight('literary-expression')).toBe(3);
    expect(editCategoryWeight('style-and-format')).toBe(2);
    expect(editCategoryWeight('typos-and-usage')).toBe(1);
  });
});
