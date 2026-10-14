import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { liveKindAdmission, liveKindAdmitted, liveKindContractCategories, liveKindRule } from '../../src/service/analysis/live-kind-admission.js';
import { BASELINE_ANALYSIS_KIND } from '../../src/shared/protocol.js';
import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { readersReportKindDefinition } from '../../src/service/evaluation/readers-report-kind.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { liveReviewKindAdmitted } from '../../src/service/review/live-review-admission.js';
import { V11_EVALUATION_RULE_ID, withV11EvaluationRule } from '../support/policy-v11-stand-in.js';

// #429: the generic admission every live non-baseline kind passes. The real selected projection, with the v11 evaluation
// rule added by the test stand-in until the wave carries Provider Processing v11; no transport, credential or manuscript.
const selected = await resolveSourceCheckoutLaunchPolicy(fileURLToPath(new URL('../../', import.meta.url)), 'developer-live');
const policy = withV11EvaluationRule(selected);
const binding = selected.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes(BASELINE_ANALYSIS_KIND))!;
const initial = initialEvaluationKindDefinition({ ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) });
const report = readersReportKindDefinition({ template: 'author', record: { profile: { title: '合成方案', version: '1' },
  items: [{ label: '合成评分项', fullMarks: 100, score: 80, notRated: null, comment: '合成评语', ai7: null }],
  total: { score: 80, fullMarks: 100 }, strengths: ['合成优点'], weaknesses: ['合成问题'],
  risks: [], readiness: [], verdict: '合成总评', conclusion: '修改后再议' }, exemplars: [{ title: '合成本社范例', text: '合成范例段落，只用于测试。' }] });

describe('live kind admission (#429)', () => {
  it('admits an evaluation contract under its one rule, returning the rule facts the execution owner reads', () => {
    expect(liveKindAdmission(policy, initial, binding)).toEqual({
      ruleId: V11_EVALUATION_RULE_ID,
      modelRole: 'Main Editorial Role',
      outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt'],
      crossUnitSynthesisAllowed: true,
    });
    expect(liveKindAdmission(policy, report, binding)?.ruleId).toBe(V11_EVALUATION_RULE_ID);
    // A rule that does not name the synthesis term admits the kind's units but never its synthesis.
    const silent = withV11EvaluationRule(selected, { crossUnitSynthesisAllowed: undefined as unknown as boolean });
    expect(liveKindAdmission(silent, initial, binding)?.crossUnitSynthesisAllowed).toBe(false);
  });

  it('refuses under the wave-1 projection, a missing category, an ambiguous rule, another binding or a wrapped contract', () => {
    expect(liveKindAdmission(selected, initial, binding)).toBeNull();
    expect(liveKindAdmission(undefined, initial, binding)).toBeNull();
    expect(liveKindAdmission({ ...policy, operationalScope: 'development-ci' }, initial, binding)).toBeNull();
    expect(liveKindAdmission({ ...policy, integrityState: 'denied' }, initial, binding)).toBeNull();
    // The report carries the editor's record and house exemplars: a rule without them admits it nowhere.
    expect(liveKindAdmission(withV11EvaluationRule(selected, { outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text'] }), report, binding)).toBeNull();
    expect(liveKindAdmission(withV11EvaluationRule(withV11EvaluationRule(selected)), initial, binding)).toBeNull();
    expect(liveKindAdmission(policy, initial, { ...binding, model: 'another-model' })).toBeNull();
    expect(liveKindAdmission(policy, initial, { ...binding, endpoint: 'https://other.example.test/' })).toBeNull();
    expect(liveKindAdmission(policy, { ...initial, materialReferences: {} }, binding)).toBeNull();
    expect(liveKindAdmitted(policy, 'evaluation', initial, binding, { promptContractDigest: 'a'.repeat(64), payloadCategories: ['public-or-synthetic'] })).toBeNull();
    expect(liveKindAdmitted(policy, 'evaluation', initial, binding, { promptContractDigest: null, payloadCategories: ['public-or-synthetic'] })).toBeNull();
    // A kind with no row (the baseline is admitted by the policy-level terms, writing by #810) is never admitted here.
    expect(liveKindAdmission(withV11EvaluationRule(selected, { taskKinds: ['writing'] }), { ...initial, kind: 'writing' }, binding)).toBeNull();
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

  it('names the categories an evaluation contract carries beside the SampleBook', () => {
    expect(liveKindContractCategories('evaluation')).toEqual([]);
    expect(liveKindContractCategories('readers-report')).toEqual(['editor-authored-evaluation-text', 'house-exemplar-excerpt']);
    expect(liveKindContractCategories('evaluation-rewrite')).toEqual(['editor-authored-evaluation-text']);
    expect(liveKindContractCategories('editorial-review/typos-and-usage')).toEqual([]);
  });
});
