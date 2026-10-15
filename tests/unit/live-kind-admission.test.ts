import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { liveKindAdmission, liveKindAdmitted, liveKindContractCategories, liveKindRule } from '../../src/service/analysis/live-kind-admission.js';
import { BASELINE_ANALYSIS_KIND } from '../../src/shared/protocol.js';
import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { readersReportKindDefinition } from '../../src/service/evaluation/readers-report-kind.js';
import { evaluationRewriteKindDefinition } from '../../src/service/evaluation/evaluation-rewrite-kind.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { liveReviewKindAdmitted } from '../../src/service/review/live-review-admission.js';
import { withRepeatedRuleFor, withRuleFor, withoutRuleFor } from '../support/policy-rules.js';

// #429: the generic admission every live non-baseline kind passes, over the real selected Provider Processing v11 projection
// and in-memory variants of it; no transport, credential or manuscript.
const selected = await resolveSourceCheckoutLaunchPolicy(fileURLToPath(new URL('../../', import.meta.url)), 'developer-live');
const policy = selected;
const binding = selected.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes(BASELINE_ANALYSIS_KIND))!;
const initial = initialEvaluationKindDefinition({ ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) });
const report = readersReportKindDefinition({ template: 'author', record: { profile: { title: '合成方案', version: '1' },
  items: [{ label: '合成评分项', fullMarks: 100, score: 80, notRated: null, comment: '合成评语', ai7: null }],
  total: { score: 80, fullMarks: 100 }, strengths: ['合成优点'], weaknesses: ['合成问题'],
  risks: [], readiness: [], verdict: '合成总评', conclusion: '修改后再议' }, exemplars: [{ title: '合成本社范例', text: '合成范例段落，只用于测试。' }] });
const rewrite = evaluationRewriteKindDefinition({ profile: { title: '合成方案', version: '1' },
  items: [{ itemId: 'literary-quality', label: '文学品质', fullMarks: 20, score: 13, notRated: null,
    comment: null, ai7: { score: 16.5, comment: '合成评语。' }, adjustment: { reasons: ['打分偏高'], note: null } }],
  strengths: [], weaknesses: [], verdict: null, conclusions: ['修改后再议'] });

describe('live kind admission (#429)', () => {
  it.each([initial, report, rewrite])('re-derives $kind admission from its frozen contract instead of trusting a replaced digest', (definition) => {
    expect(liveKindAdmission(policy, definition, binding)).not.toBeNull();
    expect(liveKindAdmission(policy, { ...definition, promptContractDigest: 'a'.repeat(64) }, binding)).toBeNull();
    const { livePromptContractDigest: _derive, ...withoutDerivation } = definition;
    expect(liveKindAdmission(policy, withoutDerivation, binding)).toBeNull();
    expect(liveKindAdmission(policy, { ...definition, materialReferences: {} }, binding)).toBeNull();
    for (const field of ['route', 'endpoint', 'model', 'credentialSlot'] as const) {
      expect(liveKindAdmission(policy, definition, { ...binding, [field]: 'different' })).toBeNull();
    }
  });

  it('admits an evaluation contract under its one rule, returning the rule facts the execution owner reads', () => {
    expect(liveKindAdmission(policy, initial, binding)).toEqual({
      ruleId: 'developer-live-public-samplebook-evaluation',
      modelRole: 'Main Editorial Role',
      outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt', 'web-search-query', 'public-source-fetch'],
      crossUnitSynthesisAllowed: true,
    });
    expect(liveKindAdmission(policy, report, binding)?.ruleId).toBe('developer-live-public-samplebook-evaluation');
    // A rule that does not name the synthesis term admits the kind's units but never its synthesis.
    const silent = withRuleFor(selected, 'evaluation', { crossUnitSynthesisAllowed: false });
    expect(liveKindAdmission(silent, initial, binding)?.crossUnitSynthesisAllowed).toBe(false);
  });

  it('refuses under the wave-1 projection, a missing category, an ambiguous rule, another binding or a wrapped contract', () => {
    expect(liveKindAdmission(withoutRuleFor(selected, 'evaluation'), initial, binding)).toBeNull();
    expect(liveKindAdmission(undefined, initial, binding)).toBeNull();
    expect(liveKindAdmission({ ...policy, operationalScope: 'development-ci' }, initial, binding)).toBeNull();
    expect(liveKindAdmission({ ...policy, integrityState: 'denied' }, initial, binding)).toBeNull();
    // The report carries the editor's record and house exemplars: a rule without them admits it nowhere.
    expect(liveKindAdmission(withRuleFor(selected, 'evaluation', { outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text'] }), report, binding)).toBeNull();
    expect(liveKindAdmission(withRepeatedRuleFor(selected, 'evaluation'), initial, binding)).toBeNull();
    expect(liveKindAdmission(policy, initial, { ...binding, model: 'another-model' })).toBeNull();
    expect(liveKindAdmission(policy, initial, { ...binding, endpoint: 'https://other.example.test/' })).toBeNull();
    expect(liveKindAdmission(policy, { ...initial, materialReferences: {} }, binding)).toBeNull();
    expect(liveKindAdmitted(policy, 'evaluation', initial, binding, { promptContractDigest: 'a'.repeat(64), payloadCategories: ['public-or-synthetic'] })).toBeNull();
    expect(liveKindAdmitted(policy, 'evaluation', initial, binding, { promptContractDigest: null, payloadCategories: ['public-or-synthetic'] })).toBeNull();
    // A kind with no row (the baseline is admitted by the policy-level terms) is never admitted here; writing's row is #810's
    // (tests/service/live-writing.test.ts).
    expect(liveKindAdmission(selected, { ...initial, kind: BASELINE_ANALYSIS_KIND }, binding)).toBeNull();
  });

  it('keeps review admission exactly as #809 admitted it', () => {
    for (const entry of BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.filter((category) => category.executor === 'review-category-contract' && !category.searchEngine)) {
      const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(entry));
      const generic = liveKindAdmission(policy, definition, binding);
      expect(liveReviewKindAdmitted(policy, definition, binding)).toBe(generic !== null);
      expect(generic?.crossUnitSynthesisAllowed ?? false).toBe(false);
    }
    expect(liveKindRule(policy, 'editorial-review/typos-and-usage', ['public-or-synthetic'])?.ruleId).toBe('developer-live-public-samplebook-reference-free-review');
  });

  it('selects the enrolled-background rule only for the background origin and skips it for the foreground one (#863)', () => {
    const categories = ['public-or-synthetic'] as const;
    const rules = policy.providerProcessing.admittedRules;
    const foregroundRule = rules.find((rule) => rule.ruleId === 'developer-live-public-samplebook-analysis')!;
    const backgroundRule = rules.find((rule) => rule.ruleId === 'enrolled-background-manuscript-analysis-processing')!;
    // Both rules list the baseline kind truthfully; the origin decides which one a lookup selects.
    expect(foregroundRule.taskKinds).toEqual(backgroundRule.taskKinds);
    expect(foregroundRule.backgroundOrigin).toBe(false);
    expect(backgroundRule.backgroundOrigin).toBe(true);
    expect(liveKindRule(policy, BASELINE_ANALYSIS_KIND, categories)).toEqual(foregroundRule);
    expect(liveKindRule(policy, BASELINE_ANALYSIS_KIND, categories, 'foreground')).toEqual(foregroundRule);
    expect(liveKindRule(policy, BASELINE_ANALYSIS_KIND, categories, 'background')).toEqual(backgroundRule);
    // Still exactly one match or nothing, in either branch.
    const withRules = (admittedRules: typeof rules): typeof policy => ({ ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules } });
    const twiceForeground = withRules([...rules, foregroundRule]);
    expect(liveKindRule(twiceForeground, BASELINE_ANALYSIS_KIND, categories)).toBeNull();
    expect(liveKindRule(twiceForeground, BASELINE_ANALYSIS_KIND, categories, 'background')).toEqual(backgroundRule);
    const twiceBackground = withRules([...rules, backgroundRule]);
    expect(liveKindRule(twiceBackground, BASELINE_ANALYSIS_KIND, categories, 'background')).toBeNull();
    expect(liveKindRule(twiceBackground, BASELINE_ANALYSIS_KIND, categories)).toEqual(foregroundRule);
    const withoutBackground = withRules(rules.filter((rule) => !rule.backgroundOrigin));
    expect(liveKindRule(withoutBackground, BASELINE_ANALYSIS_KIND, categories, 'background')).toBeNull();
    expect(liveKindRule(withoutBackground, BASELINE_ANALYSIS_KIND, categories)).toEqual(foregroundRule);
    // A projection that lacks the field (a predecessor's) is foreground; no foreground kind has a background rule.
    const unflagged = withRules(rules.map((rule) => { const { backgroundOrigin: _origin, ...rest } = rule; return rest as typeof rule; }));
    expect(liveKindRule(unflagged, BASELINE_ANALYSIS_KIND, categories)).toBeNull();
    expect(liveKindRule(unflagged, BASELINE_ANALYSIS_KIND, categories, 'background')).toBeNull();
    expect(liveKindRule(policy, 'editorial-review/typos-and-usage', [], 'background')).toBeNull();
    expect(liveKindRule(policy, 'writing', [], 'background')).toBeNull();
  });

  it('names the categories an evaluation contract carries beside the SampleBook', () => {
    expect(liveKindContractCategories('evaluation')).toEqual([]);
    expect(liveKindContractCategories('readers-report')).toEqual(['editor-authored-evaluation-text', 'house-exemplar-excerpt']);
    expect(liveKindContractCategories('evaluation-rewrite')).toEqual(['editor-authored-evaluation-text']);
    expect(liveKindContractCategories('editorial-review/typos-and-usage')).toEqual([]);
  });
});
