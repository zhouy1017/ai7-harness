import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../shared/protocol.js';
import { EVALUATION_REWRITE_KIND, INITIAL_EVALUATION_KIND, READERS_REPORT_KIND, WRITING_KIND, reviewCategoryKindId } from '../../shared/protocol.js';
import type { OutboundDataCategory } from '../provider/egress-gate.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../review/review-category-kind.js';

/** The rule facts a live step reads from the one selected rule that admitted its kind. */
export interface LiveKindRule {
  readonly ruleId: string;
  readonly modelRole: string;
  readonly outboundDataCategories: readonly OutboundDataCategory[];
  /** Whether the kind's own book-level synthesis turn may be sent; `false` when the rule does not say so. */
  readonly crossUnitSynthesisAllowed: boolean;
}

/** The launch's live binding facts the rule must name exactly; `LaunchBinding['live']` satisfies it. */
export interface LiveKindBinding {
  readonly route: string;
  readonly endpoint: string;
  readonly model: string;
  readonly credentialSlot: string;
}

/** The parts of an analysis kind definition admission reads. */
export interface LiveKindDefinition {
  readonly kind: string;
  readonly promptContractDigest: string;
  readonly livePromptContractDigest?: () => string;
  readonly materialReferences?: unknown;
}

/** What the kind's own owner says its live contract must be. */
export interface LiveKindExpectation {
  /** The prompt-contract digest re-derived from the kind's own frozen inputs or configuration; `null` refuses. */
  readonly promptContractDigest: string | null;
  /** Every outbound category the contract's payload carries; the rule must name each. */
  readonly payloadCategories: readonly OutboundDataCategory[];
}

/**
 * The selected rule that admits `kind` live, or `null` (Issue #429, generalising #809): the verified developer-live
 * projection, and exactly one of its admitted rules listing the kind and naming every required category. A missing or
 * ambiguous rule fails closed.
 */
export function liveKindRule(
  policy: LaunchPolicyProjection | undefined,
  kind: string,
  requiredCategories: readonly OutboundDataCategory[] = [],
): AdmittedProviderRule | null {
  if (policy === undefined || policy.integrityState !== 'verified' || policy.denialReason !== null ||
      policy.operationalScope !== 'developer-live' || !policy.providerProcessing.liveTransmissionAllowed ||
      policy.providerProcessing.decision !== 'eligible-only' ||
      policy.providerProcessing.authorizedLiveTransmissionCount !== 'bounded-by-run') return null;
  const rules = (policy.providerProcessing.admittedRules ?? []).filter((rule) =>
    rule.taskKinds.includes(kind) && requiredCategories.every((category) => rule.outboundDataCategories.includes(category)));
  return rules.length === 1 ? rules[0]! : null;
}

/**
 * The shared execution owner admits a kind live only under its one rule, on that rule's exact Provider binding, for the
 * exact contract the kind's owner re-derives, and never with Material References: a material wrapper changes the
 * contract and no rule of this wave names frozen material.
 */
export function liveKindAdmitted(
  policy: LaunchPolicyProjection | undefined,
  kind: string,
  definition: LiveKindDefinition,
  binding: LiveKindBinding,
  expectation: LiveKindExpectation,
): LiveKindRule | null {
  if (definition.kind !== kind || definition.materialReferences !== undefined || expectation.promptContractDigest === null ||
      expectation.promptContractDigest !== definition.promptContractDigest) return null;
  const rule = liveKindRule(policy, kind, expectation.payloadCategories);
  if (kind === reviewCategoryKindId('cross-deliverable-consistency') &&
      rule?.editorialDeliverablesAllowed !== true) return null;
  if (rule === null || rule.route !== binding.route || rule.endpoint !== binding.endpoint || rule.model !== binding.model ||
      rule.credentialSlot !== binding.credentialSlot) return null;
  return {
    ruleId: rule.ruleId,
    modelRole: rule.modelRole,
    outboundDataCategories: rule.outboundDataCategories,
    // Provider Processing v11's synthesis term (#841); a rule that does not name it never admits a kind's synthesis.
    crossUnitSynthesisAllowed: rule.crossUnitSynthesisAllowed === true,
  };
}

/** The outbound categories each evaluation contract's payload carries (#841 revision 2; no frozen material this wave). */
export const EVALUATION_PAYLOAD_CATEGORIES: Readonly<Record<string, readonly OutboundDataCategory[]>> = {
  // The house Evaluation Profile and the manuscript.
  [INITIAL_EVALUATION_KIND]: ['public-or-synthetic'],
  // The editor's finalized record, and the house's own 审稿意见 exemplars inside the synthesis.
  [READERS_REPORT_KIND]: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt'],
  // The editor's saved scores, comments and conclusion.
  [EVALUATION_REWRITE_KIND]: ['public-or-synthetic', 'editor-authored-evaluation-text'],
};

/**
 * The outbound categories the writing contract's payload carries (#810, the v11 writing rule): the manuscript, the Book's frozen
 * metadata and synopsis with the editor's audience, channel and requirements, and the house's 范例 of the type. No frozen
 * material this wave.
 */
export const WRITING_PAYLOAD_CATEGORIES: readonly OutboundDataCategory[] = ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt'];

/** Every outbound category a planned kind's payload carries; `undefined` for a kind with no row. */
function plannedPayloadCategories(kind: string): readonly OutboundDataCategory[] | undefined {
  if (kind === reviewCategoryKindId('cross-deliverable-consistency')) return ['public-or-synthetic', 'editorial-deliverable-excerpt'];
  return kind === WRITING_KIND ? WRITING_PAYLOAD_CATEGORIES : EVALUATION_PAYLOAD_CATEGORIES[kind];
}

/**
 * What a kind's live contract must be, by kind. A review category is re-derived from the built-in configuration, exactly as
 * #809 admitted it. An evaluation or writing owner re-derives its contract from the Task's frozen inputs (profile, record,
 * metadata, words and exemplars); a missing owner derivation or a changed declared digest refuses admission. Any other
 * kind has no row and is not admitted.
 */
function liveKindExpectation(definition: LiveKindDefinition): LiveKindExpectation | null {
  if (definition.kind === reviewCategoryKindId('cross-deliverable-consistency')) return {
    promptContractDigest: definition.livePromptContractDigest?.() ?? null,
    payloadCategories: plannedPayloadCategories(definition.kind)!,
  };
  const review = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((category) => reviewCategoryKindId(category.categoryId) === definition.kind);
  if (review !== undefined) {
    if (review.executor !== 'review-category-contract' || review.searchEngine || review.seriesKnowledge !== undefined) return null;
    return {
      promptContractDigest: reviewCategoryKindDefinition(reviewCategoryContractInput(review)).promptContractDigest,
      payloadCategories: ['public-or-synthetic'],
    };
  }
  const planned = plannedPayloadCategories(definition.kind);
  if (planned !== undefined) return { promptContractDigest: definition.livePromptContractDigest?.() ?? null, payloadCategories: planned };
  return null;
}

/** The one admission the shared execution owner and the analysis ledger ask for a non-baseline kind under developer-live. */
export function liveKindAdmission(
  policy: LaunchPolicyProjection | undefined,
  definition: LiveKindDefinition,
  binding: LiveKindBinding,
): LiveKindRule | null {
  const expectation = liveKindExpectation(definition);
  return expectation === null ? null : liveKindAdmitted(policy, definition.kind, definition, binding, expectation);
}

/** The categories a kind's payload carries besides the binding's own public or synthetic material. */
export function liveKindContractCategories(kind: string): readonly OutboundDataCategory[] {
  return (plannedPayloadCategories(kind) ?? []).filter((category) => category !== 'public-or-synthetic');
}
