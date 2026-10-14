import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { DEVELOPER_LIVE_POLICY_BINDING } from '../../src/service/launch-policy.js';
import { vi } from 'vitest';
import { liveWritingKindAdmitted } from '../../src/service/writing/live-writing-admission.js';
import { BaselineAnalysisStore, resolveDeveloperLiveCeiling } from '../../src/service/analysis/baseline-analysis-store.js';

// Phase 1 stands in only for #429's shared admission. The writing-side admission stays real.
// Once #429 lands its generic helper is called by the shared owners and this branch is unused.
vi.mock('../../src/service/review/live-review-admission.js', async (original) => {
  const actual = await original<typeof import('../../src/service/review/live-review-admission.js')>();
  return { ...actual, liveReviewKindAdmitted: (policy: LaunchPolicyProjection | undefined,
    definition: Parameters<typeof actual.liveReviewKindAdmitted>[1], binding: Parameters<typeof actual.liveReviewKindAdmitted>[2]) =>
    definition.kind === 'writing' ? liveWritingKindAdmitted(policy, definition, binding) !== null : actual.liveReviewKindAdmitted(policy, definition, binding) };
});

/** #841 revision 4: reference-free writing only; remove this stand-in after the policy lands. */
export const LIVE_WRITING_RULE: AdmittedProviderRule & { readonly crossUnitSynthesisAllowed: true } = {
  ...DEVELOPER_LIVE_POLICY_BINDING,
  ruleId: 'developer-live-public-samplebook-writing', taskKinds: ['writing'], modelRole: 'Main Editorial Role',
  outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt'],
  crossUnitSynthesisAllowed: true,
};

export function withLiveWritingRule(policy: LaunchPolicyProjection): LaunchPolicyProjection {
  return { ...policy, providerProcessing: { ...policy.providerProcessing,
    admittedRules: [...policy.providerProcessing.admittedRules.filter((rule) => !rule.taskKinds.includes('writing')), LIVE_WRITING_RULE],
  } };
}

/** #429 currentRuleFacts guard stand-in: retain the real current-fact derivation and restore the live binding/ceiling. */
export function stub429WritingCurrentRuleFactsGuard(): void {
  const currentRuleFacts = BaselineAnalysisStore.prototype.currentRuleFacts;
  vi.spyOn(BaselineAnalysisStore.prototype, 'currentRuleFacts').mockImplementation(function (this: BaselineAnalysisStore, bookId, mode) {
    const launch = this.launch;
    if (launch.live === null || liveWritingKindAdmitted(launch.policy, this.definition, launch.live) === null) {
      return currentRuleFacts.call(this, bookId, mode);
    }
    const unitCount = this.inspect(bookId).coverageManifest?.units.length ?? 0;
    this.bindLaunch({ operationalScope: 'development-ci', live: null });
    try {
      const facts = currentRuleFacts.call(this, bookId, mode);
      return { ...facts, providerBinding: { providerId: launch.live.route, modelId: launch.live.model,
        adapterRevision: 1, configurationRevision: 1, credentialReference: launch.live.credentialReference },
      runBudgetCeiling: resolveDeveloperLiveCeiling(launch.live.runBudgetCeiling, unitCount) };
    } finally { this.bindLaunch(launch); }
  });
}

export function restore429WritingCurrentRuleFactsGuard(): void { vi.restoreAllMocks(); }
