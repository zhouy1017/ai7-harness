import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../src/shared/protocol.js';
import type { LocalToolsRule } from '../../src/service/retrieval/local-rule.js';

/** #891's settled additive projection, supplied only by provider-free tests until the policy slice integrates. */
export function localRetrievalRule(allowed = true): LocalToolsRule {
  return { targetedRetrieval: { allowed, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8,
    exactFetchRequiredBeforeCitation: true, scope: 'no-egress' }, breaker: { roundTrips: 128, end: '检索未完成' } };
}
export function withLocalRetrievalFor(policy: LaunchPolicyProjection, kind: string, allowed = true): LaunchPolicyProjection {
  return withRuleFor(policy, kind, { ...ruleFor(policy, kind), localTools: localRetrievalRule(allowed) } as Partial<AdmittedProviderRule>);
}

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

/** The projection with the rule naming `kind` listed twice: an ambiguous admission. */
export function withRepeatedRuleFor(policy: LaunchPolicyProjection, kind: string): LaunchPolicyProjection {
  return withRules(policy, [...policy.providerProcessing.admittedRules, ruleFor(policy, kind)]);
}
