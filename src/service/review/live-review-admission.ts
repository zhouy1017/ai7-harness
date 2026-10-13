import type { LaunchPolicyProjection } from '../../shared/protocol.js';
import { reviewCategoryKindId } from '../../shared/protocol.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput, type ReviewCategoryConfigurationEntry } from './category-configuration.js';
import { reviewCategoryKindDefinition } from './review-category-kind.js';

/** The verified policy projection supplied by the policy-selection owner (#831). */
export interface ReviewProviderRule {
  readonly ruleId: string;
  readonly taskKinds: ReadonlyArray<string>;
  readonly modelRole: string;
  readonly route: string;
  readonly endpoint: string;
  readonly model: string;
  readonly credentialSlot: string;
  readonly outboundDataCategories: ReadonlyArray<string>;
}

type ReviewLaunchPolicy = Omit<LaunchPolicyProjection, 'providerProcessing'> & {
  readonly providerProcessing: LaunchPolicyProjection['providerProcessing'] & {
    readonly admittedRules?: ReadonlyArray<ReviewProviderRule>;
  };
};

export const LIVE_REVIEW_UNAVAILABLE = '当前处理策略尚未允许这一审阅类别实时执行。';

export function liveReviewUnavailableReason(entry: ReviewCategoryConfigurationEntry): string {
  // The selected rule, rather than a capability inferred from the category's current flag, denies
  // publication-risk. #744 owns its future web declaration together with an admitted web path.
  return entry.searchEngine || entry.categoryId === 'publication-risk'
    ? '当前处理策略未允许这一涉及联网核查的类别实时执行；联网审阅接入前暂不可用。'
    : LIVE_REVIEW_UNAVAILABLE;
}

/**
 * Reference-free, non-web model review (#809). Configuration describes the implemented executor;
 * the selected, verified policy alone admits its exact kind. Missing or ambiguous rules fail closed.
 * Model-free leads keep their existing path and never acquire a Provider rule here.
 */
export function liveReviewRule(
  policy: ReviewLaunchPolicy,
  entry: ReviewCategoryConfigurationEntry,
): ReviewProviderRule | null {
  if (policy.integrityState !== 'verified' || policy.denialReason !== null ||
      policy.operationalScope !== 'developer-live' || !policy.providerProcessing.liveTransmissionAllowed ||
      policy.providerProcessing.decision !== 'eligible-only' ||
      policy.providerProcessing.authorizedLiveTransmissionCount !== 'bounded-by-run' ||
      entry.executor !== 'review-category-contract' || entry.searchEngine ||
      entry.seriesKnowledge !== undefined) return null;
  const implemented = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((category) => category.categoryId === entry.categoryId);
  if (implemented?.executor !== 'review-category-contract' || implemented.searchEngine) return null;
  const rules = (policy.providerProcessing.admittedRules ?? []).filter((rule) =>
    rule.taskKinds.includes(reviewCategoryKindId(entry.categoryId)) && rule.outboundDataCategories.includes('public-or-synthetic'));
  return rules.length === 1 ? rules[0]! : null;
}

/** The shared execution owner admits only the exact reference-free built-in contract and binding. */
export function liveReviewKindAdmitted(
  policy: ReviewLaunchPolicy | undefined,
  definition: { readonly kind: string; readonly promptContractDigest: string; readonly materialReferences?: unknown },
  binding: { readonly route: string; readonly endpoint: string; readonly model: string; readonly credentialSlot: string },
): boolean {
  if (policy === undefined || definition.materialReferences !== undefined) return false;
  const entry = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((category) => reviewCategoryKindId(category.categoryId) === definition.kind);
  if (entry === undefined) return false;
  const rule = liveReviewRule(policy, entry);
  if (rule === null || rule.modelRole !== 'Main Editorial Role' || rule.route !== binding.route ||
      rule.endpoint !== binding.endpoint || rule.model !== binding.model || rule.credentialSlot !== binding.credentialSlot) return false;
  // A material-reference or house-guideline wrapper changes the contract digest. The live rule
  // admits neither, even when a direct caller bypasses the Review Run's material-refusal checks.
  return reviewCategoryKindDefinition(reviewCategoryContractInput(entry)).promptContractDigest === definition.promptContractDigest;
}
