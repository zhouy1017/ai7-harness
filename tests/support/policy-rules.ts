import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../src/shared/protocol.js';
import type { LocalToolsRule } from '../../src/service/provider/local-tools.js';
import { taskKindListed } from '../../src/service/launch-policy.js';

/** The `localTools` terms Provider Processing v18/v19 state on every rule (#891), for bindings built without a launch projection. */
export function localRetrievalRule(allowed = true): LocalToolsRule {
  return { targetedRetrieval: { allowed, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8,
    exactFetchRequiredBeforeCitation: true, scope: 'no-egress' }, breaker: { roundTrips: 128, end: '检索未完成' } };
}
/** One kind's rule with its targeted retrieval set as given; `false` reads like a rule that admits no local tools. */
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
  return policy.providerProcessing.admittedRules.find((rule) => taskKindListed(rule.taskKinds, kind))!;
}

/** The projection with the rule naming `kind` changed by `overrides`. */
export function withRuleFor(policy: LaunchPolicyProjection, kind: string, overrides: Partial<AdmittedProviderRule>): LaunchPolicyProjection {
  return withRules(policy, policy.providerProcessing.admittedRules.map((rule) => (taskKindListed(rule.taskKinds, kind) ? { ...rule, ...overrides } : rule)));
}

/** The projection without the rule naming `kind`, as a policy before it was admitted reads. */
export function withoutRuleFor(policy: LaunchPolicyProjection, kind: string): LaunchPolicyProjection {
  return withRules(policy, policy.providerProcessing.admittedRules.filter((rule) => !taskKindListed(rule.taskKinds, kind)));
}

/** The projection with the rule naming `kind` listed twice: an ambiguous admission. */
export function withRepeatedRuleFor(policy: LaunchPolicyProjection, kind: string): LaunchPolicyProjection {
  return withRules(policy, [...policy.providerProcessing.admittedRules, ruleFor(policy, kind)]);
}

/** The projection with no rule naming `house-review-preference-excerpt`: a rule closed to the 本社审阅偏好 block (#911). */
export function withoutHouseReviewPreference(policy: LaunchPolicyProjection): LaunchPolicyProjection {
  return withRules(policy, policy.providerProcessing.admittedRules.map((rule) => ({ ...rule,
    outboundDataCategories: rule.outboundDataCategories.filter((category) => category !== 'house-review-preference-excerpt') })));
}

/**
 * A rule naming `house-review-preference-excerpt` for `kind` (#911): development-ci's v1 admits no rule, so fixture-route tests of the
 * consumer read this in-memory one; under developer-live, Provider Processing v22's review rule names the category itself.
 */
export function withHouseReviewPreferenceFor(policy: LaunchPolicyProjection, kind: string): LaunchPolicyProjection {
  const previous = ruleFor(policy, kind);
  const category = 'house-review-preference-excerpt' as const;
  const stub: AdmittedProviderRule = previous === undefined ? {
    ruleId: 'test-review-preference', taskKinds: [kind], modelRole: 'Main Editorial Role', route: 'opencode-go', endpoint: 'https://api.opencode.ai/v1',
    model: 'deepseek-v4.1-flash', credentialSlot: 'opencode-go', outboundDataCategories: ['public-or-synthetic', category],
    crossUnitSynthesisAllowed: false, materialReferencesAllowed: false, editorialDeliverablesAllowed: false,
    clarificationQuestionAllowed: false, clarificationTimeoutHours: null, backgroundOrigin: false,
    matchingActiveDefaultExecutionRuleAllowed: false, webSearchToolAllowed: false, platformTools: null,
    localTools: localRetrievalRule(), sourceTranslationAllowed: false,
  } : { ...previous, outboundDataCategories: [...previous.outboundDataCategories, category] };
  return withRules(policy, [...policy.providerProcessing.admittedRules.filter((rule) => !taskKindListed(rule.taskKinds, kind)), stub]);
}

/** Successor admission without altering any policy asset; fixture transport remains local. */
export function withSeriesKnowledgeFor(policy: LaunchPolicyProjection, kind: string): LaunchPolicyProjection {
  const seeded = withHouseReviewPreferenceFor(policy, kind);
  const prior = ruleFor(seeded, kind);
  return withRuleFor(seeded, kind, { seriesKnowledgeAllowed: true,
    outboundDataCategories: [...prior.outboundDataCategories.filter((category) => category !== 'house-review-preference-excerpt'), 'series-knowledge-excerpt'] });
}
