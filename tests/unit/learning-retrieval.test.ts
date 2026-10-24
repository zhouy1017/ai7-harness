import { describe, expect, it } from 'vitest';
import { selectPreferenceLines, type PreferenceLineCandidate } from '../../src/service/learning/retrieval.js';
import { fileURLToPath } from 'node:url';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { liveKindAdmission } from '../../src/service/analysis/live-kind-admission.js';
import { LOCAL_TOOL_DECLARATION_NAMES, readLocalToolsRule } from '../../src/service/provider/local-tools.js';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition, pinnedReviewDefinition } from '../../src/service/review/review-category-kind.js';
import { houseReviewPreferenceKindDefinition } from '../../src/service/house-review-preference.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';

const TOOLS = readLocalToolsRule({ localTools: { declarations: LOCAL_TOOL_DECLARATION_NAMES.map((name) => ({ name, readOnly: true, concurrencySafe: true })),
  parallelCallsAllowed: true, targetedRetrieval: { allowed: true, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8,
    exactFetchRequiredBeforeCitation: true, scope: 'no-egress' }, breaker: { roundTrips: 128, end: '检索未完成' } } })!;
const LEGACY_USE = { versionId: 'e3c44e08-8d78-47cd-8b32-2118c3af7427', ordinal: 2, materialSetDigest: 'b'.repeat(64), sourceCount: 1,
  lines: ['错别字与规范用语：采纳1、未采纳0；保留倾向尚无应用依据。'] };
const unit = { bookId: 'book', categoryId: 'style' };
function line(lineIndex: number, overrides: Partial<PreferenceLineCandidate> = {}): PreferenceLineCandidate {
  return { versionId: 'version', ordinal: 1, lineIndex, text: `规则${lineIndex}`, bookId: null, categoryId: 'style',
    active: true, confidence: 0, recordedAt: '2026-10-01T00:00:00Z', ...overrides };
}
describe('Top-5 preference retrieval', () => {
  it('keeps pinned /1–/3 and their pre-2a preference pins byte-identical, admits the /4 selected identity, refuses an unknown digest', async () => {
    const policy = await resolveSourceCheckoutLaunchPolicy(fileURLToPath(new URL('../../', import.meta.url)), 'developer-live');
    const input = reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!);
    const numbered = reviewCategoryKindDefinition(input, 2);
    const current = reviewCategoryKindDefinition(input, 2, TOOLS);
    const binding = policy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes(numbered.kind))!;
    // [base, the same base wrapped by a pin made before Issue #1109 (no selection)], computed at a770eb1e and pinned here.
    const frozen = [
      [reviewCategoryKindDefinition(input, 1), '99b46482ce3af27256d940adaecdd4db7067b8f3eb12950bf748be1a2950f81a', '7cb5d20b792a28798f9e12a1e6b80d97917ac05134e275a809a852405cd8e8c3'],
      [numbered, '5660446214273b9996a9cd96f89830ef706ccdfb401230b6e713fd9e3e11cb93', '8537270b1c7a3c412647835ea049567328e93c2ba7ffcb27652a0de83f29c9ca'],
      [current, 'acac7d3b01926f8d4f8a3b45c7bbca59ae35ee7e2c5a9abdd9081d96c1920e6d', '42512e294f9d6333b1240af706889ce444586b4484c2701c841ef47a6a2604fc'],
    ] as const;
    for (const [historical, base, wrapped] of frozen) {
      expect(historical.promptContractDigest).toBe(base);
      expect(houseReviewPreferenceKindDefinition(historical, LEGACY_USE, true).promptContractDigest).toBe(wrapped);
      expect(pinnedReviewDefinition(current, base).promptContractDigest).toBe(base);
    }
    expect(current.promptContractDigest).not.toBe(numbered.promptContractDigest);
    for (const historical of [frozen[0][0], numbered]) expect(liveKindAdmission(policy, historical, binding)).not.toBeNull();
    expect(liveKindAdmission(policy, { ...numbered, promptContractDigest: 'a'.repeat(64) }, binding)).toBeNull();
    // A Top-5 selection takes the /4 identity over its unchanged base and names its record version; its proof is the owner's own.
    const use = { ...LEGACY_USE, selection: { lineIndexes: [3] } };
    const selected = houseReviewPreferenceKindDefinition(current, use, true);
    expect(selected.promptContractDigest).toBe(sha256Hex(canonicalJson({ schema: 'ai7.editorial-review.prompt-contract/4',
      basePromptContractDigest: current.promptContractDigest, preference: use, block: selected.systemPrompt.slice(current.systemPrompt.length + 1) })));
    expect(selected.systemPrompt).toContain(`记录版本：${use.versionId}`);
    expect(houseReviewPreferenceKindDefinition(current, LEGACY_USE, true).systemPrompt).not.toContain('记录版本：');
    const admittedSelection = houseReviewPreferenceKindDefinition(numbered, use, true);
    expect(liveKindAdmission(policy, admittedSelection, binding)).not.toBeNull();
    expect(liveKindAdmission(policy, { ...admittedSelection }, binding)).toBeNull();
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
    const attributed = { ...line(0), sources: [{ author: '本机人员' }] };
    expect(selectPreferenceLines([attributed], unit)[0]).not.toHaveProperty('sources');
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
