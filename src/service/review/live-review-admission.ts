import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../shared/protocol.js';
import { reviewCategoryKindId } from '../../shared/protocol.js';
import { liveKindAdmission, liveKindRule } from '../analysis/live-kind-admission.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, type ReviewCategoryConfigurationEntry } from './category-configuration.js';

/** The verified policy projection supplied by the policy-selection owner (#831). */
export type ReviewProviderRule = AdmittedProviderRule;

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
  policy: LaunchPolicyProjection,
  entry: ReviewCategoryConfigurationEntry,
): ReviewProviderRule | null {
  if (entry.executor !== 'review-category-contract' || entry.searchEngine || entry.seriesKnowledge !== undefined) return null;
  if (entry.categoryId === 'cross-deliverable-consistency') {
    if (entry.deliverables?.unavailableReason !== null || entry.deliverables.participants.length === 0) return null;
    const rule = liveKindRule(policy, reviewCategoryKindId(entry.categoryId), ['public-or-synthetic', 'editorial-deliverable-excerpt']);
    return rule !== null && 'editorialDeliverablesAllowed' in rule && rule.editorialDeliverablesAllowed === true ? rule : null;
  }
  const implemented = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((category) => category.categoryId === entry.categoryId);
  if (implemented?.executor !== 'review-category-contract' || implemented.searchEngine) return null;
  return liveKindRule(policy, reviewCategoryKindId(entry.categoryId), ['public-or-synthetic']);
}

/** The shared execution owner admits only the exact reference-free built-in contract and binding. */
export function liveReviewKindAdmitted(
  policy: LaunchPolicyProjection | undefined,
  definition: { readonly kind: string; readonly promptContractDigest: string; readonly materialReferences?: unknown },
  binding: { readonly route: string; readonly endpoint: string; readonly model: string; readonly credentialSlot: string },
): boolean {
  const entry = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((category) => reviewCategoryKindId(category.categoryId) === definition.kind);
  if (entry === undefined) return false;
  // The shared admission (#429) re-derives the contract from the built-in configuration: a material-reference or
  // house-guideline wrapper changes the digest, and the live rule admits neither, even for a direct caller that bypasses
  // the Review Run's material-refusal checks.
  return liveKindAdmission(policy, definition, binding)?.modelRole === 'Main Editorial Role';
}
