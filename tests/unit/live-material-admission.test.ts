import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { liveKindAdmission, liveKindContractCategories, liveMaterialRule } from '../../src/service/analysis/live-kind-admission.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { readersReportKindDefinition } from '../../src/service/evaluation/readers-report-kind.js';
import { taskMaterialKindDefinition, taskMaterialWords, liveMaterialContract, type TaskMaterialSource } from '../../src/service/task-material-references.js';
import { writingKindDefinition } from '../../src/service/writing/writing-kind.js';
import { writingMaterialDigest } from '../../src/service/writing-tasks.js';
import { withRepeatedRuleFor, withRuleFor } from '../support/policy-rules.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';

const selected = await resolveSourceCheckoutLaunchPolicy(fileURLToPath(new URL('../../', import.meta.url)), 'developer-live');
const binding = DEVELOPER_LIVE_POLICY_BINDING;
const material = { title: '合成背景资料', paragraphs: ['合成资料只提供背景。'], collector: '合成收集人', owner: '合成负责人', remarks: '合成内部备注' };
const source: TaskMaterialSource = { materialId: '11111111-1111-4111-8111-111111111111', indexDigest: 'a'.repeat(64),
  title: material.title, characters: 11, sha256: writingMaterialDigest(material.paragraphs) };
const review = reviewCategoryKindDefinition(reviewCategoryContractInput(BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => entry.categoryId === 'typos-and-usage')!));
const initial = initialEvaluationKindDefinition({ ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) });
const report = readersReportKindDefinition({ template: 'author', record: { profile: { title: '合成方案', version: '1' },
  items: [{ label: '合成评分项', fullMarks: 100, score: 80, notRated: null, comment: '合成评语', ai7: null }],
  total: { score: 80, fullMarks: 100 }, strengths: [], weaknesses: [], risks: [], readiness: [], verdict: '合成总评', conclusion: '修改后再议' }, exemplars: [] });
const writing = () => writingKindDefinition({ type: { typeId: 'promotion-article', label: '宣传文章' },
  book: { title: '合成图书', authors: [], editors: [], series: [] }, audience: '读者', channel: '纸面', requirements: null,
  synopsis: null, evaluation: null, exemplars: [], materials: [material] }, 2, [source]);
const wrap = (base: typeof review) => {
  const reading = { ...taskMaterialWords(source, material.paragraphs), collector: material.collector, owner: material.owner, remarks: material.remarks };
  return taskMaterialKindDefinition(base, { bookId: '22222222-2222-4222-8222-222222222222', references: [source] }, [reading]);
};

function admitting(kind: string): LaunchPolicyProjection {
  const rule = selected.providerProcessing.admittedRules.find((candidate) => candidate.taskKinds.includes(kind))!;
  return withRuleFor(selected, kind, { materialReferencesAllowed: true,
    outboundDataCategories: [...rule.outboundDataCategories.filter((category) => category !== 'frozen-material-reference-excerpt'), 'frozen-material-reference-excerpt'] });
}

describe('material-bearing live kind admission (#809)', () => {
  it.each([() => wrap(review), () => wrap(initial), () => wrap(report), writing])('is admitted by the selected Provider Processing v12 rule exactly as projected', (make) => {
    const definition = make();
    expect(selected.providerProcessing.version).toBe('v12');
    expect(liveMaterialRule(selected, definition.kind)).not.toBeNull();
    expect(liveKindAdmission(selected, definition, binding)).not.toBeNull();
  });

  it.each([() => wrap(review), () => wrap(initial), () => wrap(report), writing])('requires both policy terms and one rule, and re-derives the wrapper digest', (make) => {
    const definition = make();
    const policy = admitting(definition.kind);
    expect(liveKindAdmission(policy, definition, binding)).not.toBeNull();
    expect(liveKindAdmission(withRuleFor(policy, definition.kind, { materialReferencesAllowed: false }), definition, binding)).toBeNull();
    const rule = policy.providerProcessing.admittedRules.find((candidate) => candidate.taskKinds.includes(definition.kind))!;
    const absentCategory = withRuleFor(policy, definition.kind, { outboundDataCategories: rule.outboundDataCategories.filter((category) => category !== 'frozen-material-reference-excerpt') });
    expect(liveMaterialRule(absentCategory, definition.kind)).toBeNull();
    expect(liveKindAdmission(absentCategory, definition, binding)).toBeNull();
    expect(liveKindAdmission(withRepeatedRuleFor(policy, definition.kind), definition, binding)).toBeNull();
    // An extra rule lacking the category is still ambiguous; required categories cannot select away a second kind rule.
    const ambiguous = withRepeatedRuleFor(policy, definition.kind);
    Object.assign(ambiguous.providerProcessing.admittedRules.at(-1)!, { outboundDataCategories: ['public-or-synthetic'] });
    expect(liveKindAdmission(ambiguous, definition, binding)).toBeNull();
    const digest = definition.promptContractDigest;
    Object.assign(definition, { promptContractDigest: 'f'.repeat(64) });
    expect(liveKindAdmission(policy, definition, binding)).toBeNull();
    Object.assign(definition, { promptContractDigest: digest, systemPrompt: `${definition.systemPrompt}\nchanged` });
    expect(liveKindAdmission(policy, definition, binding)).toBeNull();
  });

  it.each([() => wrap(review), () => wrap(initial), () => wrap(report), writing])('keeps title and words while excluding material house metadata', (make) => {
    const definition = make();
    const frozen = liveMaterialContract(definition)!;
    expect(frozen.materials).toEqual([{ title: material.title, paragraphs: material.paragraphs }]);
    const prompt = definition.kind === 'writing' ? definition.crossUnit!.step!.buildMessage([], 1) : definition.systemPrompt;
    expect(prompt.includes(material.title)).toBe(true);
    expect(prompt.includes(material.paragraphs[0]!)).toBe(true);
    for (const privateValue of [material.collector, material.owner, material.remarks]) {
      expect(JSON.stringify(frozen).includes(privateValue)).toBe(false);
      expect(prompt.includes(privateValue)).toBe(false);
    }
    expect(liveKindContractCategories(definition.kind, definition)).toContain('frozen-material-reference-excerpt');
  });

  it('does not admit a writing material contract without the Task pins', () => {
    const definition = writing();
    expect(liveKindAdmission(admitting(definition.kind), { ...definition }, binding)).toBeNull();
    expect(() => writingKindDefinition({ type: { typeId: 'promotion-article', label: '宣传文章' }, book: { title: '合成图书', authors: [], editors: [], series: [] },
      audience: '读者', channel: '纸面', requirements: null, synopsis: null, evaluation: null, exemplars: [], materials: [material] }, 2, [{ ...source, sha256: 'f'.repeat(64) }])).toThrowError();
  });

  it('does not turn the material-free score rewrite into a material wrapper through a direct caller', () => {
    expect(liveKindAdmission(admitting('evaluation-rewrite'), wrap({ ...initial, kind: 'evaluation-rewrite' }), binding)).toBeNull();
  });
});
