import { describe, expect, it } from 'vitest';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { liveReviewRule, liveReviewKindAdmitted } from '../../src/service/review/live-review-admission.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { reviewCategoryKindId } from '../../src/shared/protocol.js';
import { fileURLToPath } from 'node:url';

// #809: consume the real selected policy projection. Damaged projections exercise refusals;
// no transport, credential, manuscript or policy byte is involved.
const selected = await resolveSourceCheckoutLaunchPolicy(fileURLToPath(new URL('../../', import.meta.url)), 'developer-live');
const rule = selected.providerProcessing.admittedRules.find((candidate) => candidate.taskKinds.includes(reviewCategoryKindId('typos-and-usage')))!;
const policy = selected;
const entries = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories;

describe('reference-free live review admission (#809)', () => {
  it('requires an exact implemented non-web kind in the selected rule', () => {
    expect(entries.filter((entry) => liveReviewRule(policy, entry) !== null).map((entry) => entry.categoryId)).toEqual([
      'typos-and-usage', 'style-and-format', 'literary-expression',
    ]);
    expect(liveReviewRule(policy, entries[0]!)).toBe(rule);
  });

  it('rechecks the exact contract and Provider binding before direct category dispatch', () => {
    const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(entries[0]!));
    expect(liveReviewKindAdmitted(policy, definition, rule)).toBe(true);
    expect(liveReviewKindAdmitted(undefined, definition, rule)).toBe(false);
    expect(liveReviewKindAdmitted(policy, { ...definition, promptContractDigest: 'a'.repeat(64) }, rule)).toBe(false);
    expect(liveReviewKindAdmitted(policy, { ...definition, materialReferences: {} }, rule)).toBe(false);
    expect(liveReviewKindAdmitted(policy, definition, { ...rule, model: 'another-model' })).toBe(false);
    expect(liveReviewKindAdmitted(policy, definition, { ...rule, endpoint: 'https://other.example.test/' })).toBe(false);
  });

  it('fails closed without a selected rule, under a denied launch, or with ambiguous admission', () => {
    const category = entries[0]!;
    expect(liveReviewRule({ ...selected, providerProcessing: { ...selected.providerProcessing, admittedRules: [] } }, category)).toBeNull();
    expect(liveReviewRule({ ...policy, integrityState: 'denied' }, category)).toBeNull();
    expect(liveReviewRule({ ...policy, operationalScope: 'development-ci' }, category)).toBeNull();
    expect(liveReviewRule({ ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: [rule, rule] } }, category)).toBeNull();
    expect(liveReviewRule({ ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: [{ ...rule, taskKinds: [] }] } }, category)).toBeNull();
    expect(liveReviewRule({ ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: [{ ...rule, outboundDataCategories: [] }] } }, category)).toBeNull();
  });

  it('keeps leads, web, unavailable and Series Knowledge executors outside model admission', () => {
    const wide = { ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: [{ ...rule, taskKinds: entries.map((entry) => reviewCategoryKindId(entry.categoryId)) }] } };
    for (const entry of entries.filter((entry) => entry.executor !== 'review-category-contract' || entry.searchEngine)) {
      expect(liveReviewRule(wide, entry)).toBeNull();
    }
    expect(liveReviewRule(policy, { ...entries[0]!, seriesKnowledge: { series: [], revisions: [] } })).toBeNull();
    expect(liveReviewRule(policy, { ...entries[0]!, searchEngine: true })).toBeNull();
  });
});
