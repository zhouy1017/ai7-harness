import { taskMaterialKindDefinition, liveMaterialContract } from '../../src/service/task-material-references.js';
import { houseReviewPreferenceKindDefinition } from '../../src/service/house-review-preference.js';
import { withHouseReviewPreferenceFor } from '../support/policy-rules.js';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { kindLocalTools, kindResearchDeclaration, liveKindAdmission, liveKindAdmitted, liveKindContractCategories, liveKindRule } from '../../src/service/analysis/live-kind-admission.js';
import { BASELINE_ANALYSIS_KIND } from '../../src/shared/protocol.js';
import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { readersReportKindDefinition } from '../../src/service/evaluation/readers-report-kind.js';
import { evaluationRewriteKindDefinition } from '../../src/service/evaluation/evaluation-rewrite-kind.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { resolveSourceCheckoutLaunchPolicy, taskKindListed } from '../../src/service/launch-policy.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { liveReviewKindAdmitted } from '../../src/service/review/live-review-admission.js';
import { withRepeatedRuleFor, withRuleFor, withoutHouseReviewPreference, withoutRuleFor } from '../support/policy-rules.js';

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
  it('declares research only for the selected tool rule and exact-model live evidence (#744)', () => {
    const enabled = { webSearch: true, searchEngine: 'user-selected-backend' };
    const disabled = { webSearch: false, searchEngine: null };
    for (const kind of ['evaluation', 'writing', 'factual-review', 'editorial-review/factual-review', 'editorial-review/academic-integrity']) {
      expect(kindResearchDeclaration(policy, kind)).toEqual(enabled);
      expect(kindResearchDeclaration(withoutRuleFor(policy, kind), kind)).toEqual(disabled);
      expect(kindResearchDeclaration(withRuleFor(policy, kind, { webSearchToolAllowed: false }), kind)).toEqual(disabled);
      expect(kindResearchDeclaration(withRuleFor(policy, kind, { platformTools: null }), kind)).toEqual(disabled);
      // A historical model and the same id on a different route never inherit the V4.1 observation.
      expect(kindResearchDeclaration(withRuleFor(policy, kind, { model: 'deepseek-v4-flash' }), kind)).toEqual(disabled);
      expect(kindResearchDeclaration(withRuleFor(policy, kind, { route: 'deepseek-open-platform' }), kind)).toEqual(disabled);
      // Production DeepSeek declares the function loop from the vendor guide only, never a live-test item: no research.
      expect(kindResearchDeclaration(withRuleFor(policy, kind, { route: 'deepseek-open-platform', model: 'deepseek-flash' }), kind)).toEqual(disabled);
      expect(kindResearchDeclaration(policy, kind, disabled)).toEqual(disabled);
    }
    // 审稿意见 (row 16) and the score rewrite (row 14) carry no web even under a rule that names the tools.
    for (const kind of [BASELINE_ANALYSIS_KIND, 'readers-report', 'evaluation-rewrite', 'editorial-dialogue', 'editorial-review/publication-risk', 'editorial-review/typos-and-usage']) {
      expect(kindResearchDeclaration(policy, kind)).toEqual(disabled);
    }
    expect(kindResearchDeclaration(undefined, 'writing')).toEqual(disabled);
  });
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


describe('house preference live admission (#911)', () => {
  it('admits only owner-wrapped review definitions under the exact selected category, and preserves the base admission path', () => {
    const entry = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((category) => category.categoryId === 'typos-and-usage')!;
    const base = reviewCategoryKindDefinition(reviewCategoryContractInput(entry));
    const preference = { versionId: '10000000-0000-4000-8000-000000000001', ordinal: 1, sourceCount: 1, materialSetDigest: 'a'.repeat(64), lines: ['用语：保留原有写法。'] };
    const wrapped = houseReviewPreferenceKindDefinition(base, preference, true);
    // Provider Processing v20's own review rule names the category (#910); the same rule without it is closed.
    const admitted = policy;
    expect(liveKindAdmission(withoutHouseReviewPreference(policy), wrapped, binding)).toBeNull();
    expect(liveKindAdmission(admitted, wrapped, binding)).not.toBeNull();
    expect(liveKindAdmission(withHouseReviewPreferenceFor(policy, base.kind), wrapped, binding)).not.toBeNull();
    expect(liveKindAdmission(admitted, { ...wrapped }, binding)).toBeNull();
    expect(liveKindAdmission(admitted, { ...wrapped, systemPrompt: wrapped.systemPrompt + '伪造' }, binding)).toBeNull();
    expect(liveKindAdmission(withRepeatedRuleFor(admitted, base.kind), wrapped, binding)).toBeNull();
    expect(liveKindAdmission(policy, houseReviewPreferenceKindDefinition(base, null, true), binding)).toEqual(liveKindAdmission(policy, base, binding));
    expect(liveKindContractCategories(base.kind, base)).not.toContain('house-review-preference-excerpt');
    expect(liveKindContractCategories(wrapped.kind, wrapped)).toEqual(['house-review-preference-excerpt']);
    const source = { materialId: '20000000-0000-4000-8000-000000000001', indexDigest: 'c'.repeat(64), title: '合成参考资料', characters: 2, sha256: 'd'.repeat(64) };
    const materials = taskMaterialKindDefinition(base, { bookId: '30000000-0000-4000-8000-000000000001', references: [source] }, [{ source, paragraphs: ['合成参考段落。'], refusal: null }]);
    const combined = houseReviewPreferenceKindDefinition(materials, preference, true);
    expect(liveKindAdmission(admitted, combined, binding)).not.toBeNull();
    expect(liveKindContractCategories(combined.kind, combined)).toEqual(['frozen-material-reference-excerpt', 'house-review-preference-excerpt']);
    expect(liveMaterialContract(combined)?.materials).toEqual(liveMaterialContract(materials)?.materials);
    const forgedBase = { ...base, promptContractDigest: 'b'.repeat(64) };
    expect(liveKindAdmission(admitted, houseReviewPreferenceKindDefinition(forgedBase, preference, true), binding)).toBeNull();
  });
});

// #920: the custom analysis family is listed by one literal `custom-analysis/*` entry. Slice 7f owns the kind definition; this stub states only
// what admission reads, so the expectation row is exercised without it.
describe('custom analysis kind family live admission (#920)', () => {
  const FAMILY_DIGEST = 'e'.repeat(64);
  const stubDefinition = (kind = 'custom-analysis/synthetic-dimension') => ({ kind, promptContractDigest: FAMILY_DIGEST, livePromptContractDigest: () => FAMILY_DIGEST });
  const customRuleId = 'developer-live-public-samplebook-custom-analysis';
  const GO_PRODUCTION_BINDING = { route: 'opencode-go', endpoint: 'https://opencode.ai/zen/go/v1/chat/completions', model: 'deepseek-v4.1-flash', credentialSlot: 'opencode-go', credentialReference: '33333333-3333-4333-8333-333333333333' };

  it('lists a kind by an exact entry or by a whole-segment family entry, and nothing wider', () => {
    expect(taskKindListed(['custom-analysis/*'], 'custom-analysis/dimension-1')).toBe(true);
    expect(taskKindListed(['custom-analysis/*'], 'custom-analysis/a1-b2')).toBe(true);
    // The prefix is a whole path segment: no kind without an id, no other prefix, no nested path, no literal glob.
    for (const kind of ['custom-analysis/', 'custom-analysis', 'custom-analysisx/foo', 'xcustom-analysis/foo', 'custom-analysis/a/b', 'custom-analysis/*', 'editorial-review/typos-and-usage', '']) {
      expect(taskKindListed(['custom-analysis/*'], kind), kind).toBe(false);
    }
    // Exact entries behave as before, and an exact entry never widens into a family.
    expect(taskKindListed(['editorial-review/typos-and-usage', 'writing'], 'writing')).toBe(true);
    expect(taskKindListed(['editorial-review/typos-and-usage', 'writing'], 'editorial-review/style-and-format')).toBe(false);
    expect(taskKindListed(['custom-analysis/typos'], 'custom-analysis/other')).toBe(false);
    // Only a trailing `/*` after a lower-case segment is a family; any other glob shape is an exact string no kind equals.
    for (const entry of ['custom-analysis*', 'custom-analysis/**', '*/*', '*', '/*', 'custom-analysis/*/x', 'Custom-Analysis/*', 'editorial-review/[a-z]*']) {
      expect(taskKindListed([entry], 'custom-analysis/dimension-1'), entry).toBe(false);
      expect(taskKindListed([entry], 'editorial-review/typos-and-usage'), entry).toBe(false);
    }
    expect(taskKindListed([], 'writing')).toBe(false);
  });

  it('selects the custom rule for every member of the family under developer-live, and for no other kind', () => {
    const rule = liveKindRule(policy, 'custom-analysis/synthetic-dimension', ['editor-authored-question-template']);
    expect(rule?.ruleId).toBe(customRuleId);
    expect(liveKindRule(policy, 'custom-analysis/another-dimension')?.ruleId).toBe(customRuleId);
    for (const kind of ['custom-analysis/', 'custom-analysisx/foo', 'custom-analysis/a/b', 'custom-analysis/*']) expect(liveKindRule(policy, kind), kind).toBeNull();
    // The Series consistency category is a kind of the review rule since v22; the kind alone never makes it live (its expectation stays closed).
    expect(liveKindRule(policy, 'editorial-review/series-consistency', ['series-knowledge-excerpt'])?.ruleId).toBe('developer-live-public-samplebook-reference-free-review');
    expect(liveKindRule(policy, 'editorial-review/series-consistency', ['editor-authored-question-template'])).toBeNull();
  });

  it('admits a family member under its one rule on the exact binding, for the exact digest its definition re-derives', () => {
    expect(liveKindAdmission(policy, stubDefinition(), binding)).toEqual({
      ruleId: customRuleId,
      modelRole: 'Main Editorial Role',
      outboundDataCategories: ['public-or-synthetic', 'editor-authored-question-template'],
      crossUnitSynthesisAllowed: false,
    });
    expect(liveKindContractCategories('custom-analysis/synthetic-dimension')).toEqual(['editor-authored-question-template']);
    // A replaced digest, a definition that cannot re-derive its own, or a payload kind outside the family is refused.
    expect(liveKindAdmission(policy, { ...stubDefinition(), promptContractDigest: 'f'.repeat(64) }, binding)).toBeNull();
    const { livePromptContractDigest: _derive, ...withoutDerivation } = stubDefinition();
    expect(liveKindAdmission(policy, withoutDerivation, binding)).toBeNull();
    expect(liveKindAdmission(policy, stubDefinition('custom-analysis/'), binding)).toBeNull();
    expect(liveKindAdmission(policy, stubDefinition('custom-analysis/a/b'), binding)).toBeNull();
    expect(liveKindAdmission(policy, stubDefinition('custom-analysisx/foo'), binding)).toBeNull();
    for (const field of ['route', 'endpoint', 'model', 'credentialSlot'] as const) {
      expect(liveKindAdmission(policy, stubDefinition(), { ...binding, [field]: 'different' }), field).toBeNull();
    }
    // The rule must name the template category, be the one rule, and exist.
    const closed = { ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: policy.providerProcessing.admittedRules.map((rule) =>
      (rule.ruleId === customRuleId ? { ...rule, outboundDataCategories: rule.outboundDataCategories.filter((category) => category !== 'editor-authored-question-template') } : rule)) } };
    expect(liveKindAdmission(closed, stubDefinition(), binding)).toBeNull();
    expect(liveKindAdmission(withRepeatedRuleFor(policy, 'custom-analysis/synthetic-dimension'), stubDefinition(), binding)).toBeNull();
    expect(liveKindAdmission(withoutRuleFor(policy, 'custom-analysis/synthetic-dimension'), stubDefinition(), binding)).toBeNull();
    // development-ci (v1) admits no rule at all.
    expect(liveKindAdmission(undefined, stubDefinition(), binding)).toBeNull();
  });

  it('registers no local tool and no research for a family member', () => {
    expect(kindLocalTools(policy, 'custom-analysis/synthetic-dimension')).toBeNull();
    expect(kindResearchDeclaration(policy, 'custom-analysis/synthetic-dimension')).toEqual({ webSearch: false, searchEngine: null });
  });

  it('selects the ordinary-production custom rule on the editor\'s configured binding', async () => {
    const production = await resolveSourceCheckoutLaunchPolicy(fileURLToPath(new URL('../../', import.meta.url)), 'ordinary-production', GO_PRODUCTION_BINDING);
    expect(production.providerProcessing.version).toBe('v25');
    expect(liveKindRule(production, 'custom-analysis/synthetic-dimension', ['editor-authored-question-template'])?.ruleId).toBe('ordinary-production-custom-analysis');
    const productionBinding = production.providerProcessing.admittedRules.find((rule) => rule.ruleId === 'ordinary-production-custom-analysis')!;
    expect(liveKindAdmission(production, stubDefinition(), productionBinding)?.outboundDataCategories).toEqual(expect.arrayContaining(['public-or-synthetic', 'editor-authored-question-template']));
    expect(liveKindRule(production, 'editorial-review/series-consistency', ['series-knowledge-excerpt'])?.ruleId).toBe('ordinary-production-review');
  });
});
