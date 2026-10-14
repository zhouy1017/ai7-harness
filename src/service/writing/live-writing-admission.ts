import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../shared/protocol.js';

interface WritingLiveBinding { readonly route: string; readonly endpoint: string; readonly model: string; readonly credentialSlot: string }
interface WritingLiveDefinition { readonly kind: string; readonly promptContractDigest: string; readonly materialReferences?: unknown }
interface WritingLiveRule {
  readonly ruleId: string;
  readonly modelRole: string;
  readonly outboundDataCategories: readonly string[];
  readonly crossUnitSynthesisAllowed: boolean;
}

export const WRITING_PAYLOAD_CATEGORIES = ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt'] as const;

/** Phase 1 of #810: the writing-side seam delegates to #429's generic admission after its merge. */
export function liveWritingRule(
  policy: LaunchPolicyProjection | undefined,
  binding: WritingLiveBinding | null,
): AdmittedProviderRule | null {
  if (binding === null || policy === undefined || policy.integrityState !== 'verified' || policy.denialReason !== null ||
      policy.operationalScope !== 'developer-live' || !policy.providerProcessing.liveTransmissionAllowed ||
      policy.providerProcessing.decision !== 'eligible-only' ||
      policy.providerProcessing.authorizedLiveTransmissionCount !== 'bounded-by-run') return null;
  const rules = (policy.providerProcessing.admittedRules ?? []).filter((rule) => rule.taskKinds.includes('writing'));
  if (rules.length !== 1) return null;
  const rule = rules[0]!;
  const synthesis = rule as AdmittedProviderRule & { readonly crossUnitSynthesisAllowed?: boolean };
  if (rule.modelRole !== 'Main Editorial Role' || rule.route !== binding.route || rule.endpoint !== binding.endpoint ||
      rule.model !== binding.model || rule.credentialSlot !== binding.credentialSlot || synthesis.crossUnitSynthesisAllowed !== true ||
      !WRITING_PAYLOAD_CATEGORIES.every((category) => rule.outboundDataCategories.includes(category))) return null;
  return rule;
}

/** #429's published LiveKindDefinition/LiveKindBinding seam; Phase 2 replaces this return with liveKindAdmitted. */
export function liveWritingKindAdmitted(policy: LaunchPolicyProjection | undefined, definition: WritingLiveDefinition, binding: WritingLiveBinding): WritingLiveRule | null {
  if (definition.kind !== 'writing' || definition.materialReferences !== undefined) return null;
  const rule = liveWritingRule(policy, binding);
  return rule === null ? null : { ruleId: rule.ruleId, modelRole: rule.modelRole,
    outboundDataCategories: rule.outboundDataCategories, crossUnitSynthesisAllowed: true };
}
