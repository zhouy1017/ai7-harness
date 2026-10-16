import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../src/shared/protocol.js';

// Variants of the selected developer-live projection for refusal paths: one kind's rule changed, repeated or removed. The
// policy bytes are never touched; only the in-memory projection a test hands the owners.

function withRules(policy: LaunchPolicyProjection, admittedRules: AdmittedProviderRule[]): LaunchPolicyProjection {
  return { ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules } };
}

/** The selected rule that names `kind`. */
export function ruleFor(policy: LaunchPolicyProjection, kind: string): AdmittedProviderRule {
  return policy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes(kind))!;
}

/** The projection with the rule naming `kind` changed by `overrides`. */
export function withRuleFor(policy: LaunchPolicyProjection, kind: string, overrides: Partial<AdmittedProviderRule>): LaunchPolicyProjection {
  return withRules(policy, policy.providerProcessing.admittedRules.map((rule) => (rule.taskKinds.includes(kind) ? { ...rule, ...overrides } : rule)));
}

/** The projection without the rule naming `kind`, as a policy before it was admitted reads. */
export function withoutRuleFor(policy: LaunchPolicyProjection, kind: string): LaunchPolicyProjection {
  return withRules(policy, policy.providerProcessing.admittedRules.filter((rule) => !rule.taskKinds.includes(kind)));
}

/**
 * The projection with a 生成来源译文 rule added (Issue #892) as #891 adds it to v18/v19: the Fast Interaction Role's binding of
 * the polish rule, naming only `material-translation`, under developer-live's public-or-synthetic category or ordinary
 * production's frozen material excerpt. A stand-in until the policy that names it is selected; the policy bytes are untouched.
 */
export function withMaterialTranslationRule(policy: LaunchPolicyProjection): LaunchPolicyProjection {
  const production = policy.operationalScope === 'ordinary-production';
  return withRules(policy, [...policy.providerProcessing.admittedRules, {
    ...ruleFor(policy, 'editorial-polish'),
    ruleId: production ? 'ordinary-production-material-translation' : 'developer-live-public-samplebook-material-translation',
    taskKinds: ['material-translation'],
    outboundDataCategories: production ? ['frozen-material-reference-excerpt'] : ['public-or-synthetic'],
    materialReferencesAllowed: true,
  }]);
}

/** The projection with the rule naming `kind` listed twice: an ambiguous admission. */
export function withRepeatedRuleFor(policy: LaunchPolicyProjection, kind: string): LaunchPolicyProjection {
  return withRules(policy, [...policy.providerProcessing.admittedRules, ruleFor(policy, kind)]);
}
