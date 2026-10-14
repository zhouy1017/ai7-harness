import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../src/shared/protocol.js';

// TEMPORARY stand-in for Provider Processing v11 (#841 revision 2, slice 2d) until the wave carries it: the one place the
// evaluation rule's literals live. When the wave's policy selects v11, the tests read the real projection and this file goes.
export const V11_EVALUATION_RULE_ID = 'developer-live-public-samplebook-evaluation';
export const V11_EVALUATION_TASK_KINDS = ['evaluation', 'readers-report', 'evaluation-rewrite'] as const;
export const V11_EVALUATION_CATEGORIES = ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt'] as const;
export const V11_WRITING_RULE = {
  ruleId: 'developer-live-public-samplebook-writing',
  taskKinds: ['writing'],
  outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt'],
} as const;

/** The selected developer-live projection with the v11 evaluation rule added beside its existing rules. */
export function withV11EvaluationRule(policy: LaunchPolicyProjection, overrides: Partial<AdmittedProviderRule & { crossUnitSynthesisAllowed: boolean }> = {}): LaunchPolicyProjection {
  const baseline = policy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes('baseline-manuscript-analysis'))!;
  const rule = {
    ...baseline,
    ruleId: V11_EVALUATION_RULE_ID,
    taskKinds: [...V11_EVALUATION_TASK_KINDS],
    modelRole: 'Main Editorial Role',
    outboundDataCategories: [...V11_EVALUATION_CATEGORIES],
    crossUnitSynthesisAllowed: true,
    ...overrides,
  } as AdmittedProviderRule;
  return { ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: [...policy.providerProcessing.admittedRules, rule] } };
}
