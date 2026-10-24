import { describe, expect, it } from 'vitest';
import { selectPreferenceLines, type PreferenceLineCandidate } from '../../src/service/learning/retrieval.js';
import { fileURLToPath } from 'node:url';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { liveKindAdmission, kindLocalTools } from '../../src/service/analysis/live-kind-admission.js';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition, pinnedReviewDefinition } from '../../src/service/review/review-category-kind.js';

const unit = { bookId: 'book', categoryId: 'style' };
function line(lineIndex: number, overrides: Partial<PreferenceLineCandidate> = {}): PreferenceLineCandidate {
  return { versionId: 'version', ordinal: 1, lineIndex, text: `规则${lineIndex}`, bookId: null, categoryId: 'style',
    active: true, confidence: 0, recordedAt: '2026-10-01T00:00:00Z', ...overrides };
}
describe('Top-5 preference retrieval', () => {
  it('reconstructs and admits pinned /1–/3 beside /4 while refusing an unknown digest', async () => {
    const policy = await resolveSourceCheckoutLaunchPolicy(fileURLToPath(new URL('../../', import.meta.url)), 'developer-live');
    const input = reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!);
    const tools = kindLocalTools(policy, 'editorial-review/typos-and-usage')!;
    const current = reviewCategoryKindDefinition(input, 2, tools);
    const binding = policy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes(current.kind))!;
    for (const historical of [reviewCategoryKindDefinition(input, 1), reviewCategoryKindDefinition(input, 2, undefined, 2), reviewCategoryKindDefinition(input, 2, tools, 3)]) {
      expect(pinnedReviewDefinition(current, historical.promptContractDigest).promptContractDigest).toBe(historical.promptContractDigest);
      expect(liveKindAdmission(policy, historical, binding)).not.toBeNull();
    }
    expect(liveKindAdmission(policy, current, binding)).not.toBeNull();
    expect(liveKindAdmission(policy, { ...current, promptContractDigest: 'a'.repeat(64) }, binding)).toBeNull();
  });
  it('ranks exact Book scope, then confidence and recency, with stable ties and exact identities', () => {
    const candidates = [line(0, { confidence: 1 }), line(1, { bookId: 'book' }),
      line(2, { confidence: .9, recordedAt: '2026-10-02T00:00:00Z' }), line(3, { confidence: .9 }),
      ...Array.from({ length: 5 }, (_, i) => line(i + 4))];
    expect(selectPreferenceLines(candidates.reverse(), unit).map((entry) => entry.lineIndex)).toEqual([1, 0, 2, 3, 4]);
    expect(selectPreferenceLines(candidates, unit)[0]).toMatchObject({ versionId: 'version', ordinal: 1, lineIndex: 1 });
  });
  it('excludes other Books/categories, inactive lines and missing attribution without mutating inputs', () => {
    const candidates = [line(0), line(1, { bookId: 'other' }), line(2, { categoryId: 'other' }),
      line(3, { active: false }), line(4, { versionId: '' }), line(5, { text: '一行\n二行' })];
    const snapshot = structuredClone(candidates);
    expect(selectPreferenceLines(candidates, unit)).toEqual([line(0)]);
    expect(candidates).toEqual(snapshot);
  });
  it('keeps complete grapheme-bounded lines, skips an oversized line, and never drops its identity', () => {
    const emoji = '👨‍👩‍👦';
    const selected = selectPreferenceLines([line(0, { text: '字'.repeat(201) }),
      line(1, { text: emoji.repeat(199) }), line(2, { text: '好' }), line(3)], unit);
    expect(selected.map((entry) => entry.lineIndex)).toEqual([1, 2]);
    expect(selected[0]!.text).toBe(emoji.repeat(199));
    expect(selectPreferenceLines([], unit)).toEqual([]);
  });
});
