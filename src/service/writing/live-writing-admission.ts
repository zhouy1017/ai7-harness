import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../shared/protocol.js';
import { WRITING_KIND } from '../../shared/protocol.js';
import { liveKindRule, WRITING_PAYLOAD_CATEGORIES, type LiveKindBinding } from '../analysis/live-kind-admission.js';

/**
 * Whether a writing Task may be prepared and started live (#810): the selected policy's one rule naming `writing` with every
 * category its contract carries, through the shared lookup (#429), on the launch's exact binding and the Main Editorial Role,
 * with its book-level synthesis — the turn that writes the draft. Each frozen contract is then admitted by the shared ledger
 * and execution owner through `liveKindAdmission`'s writing row; `null` refuses.
 */
export function liveWritingRule(policy: LaunchPolicyProjection | undefined, binding: LiveKindBinding | null): AdmittedProviderRule | null {
  const rule = binding === null ? null : liveKindRule(policy, WRITING_KIND, WRITING_PAYLOAD_CATEGORIES);
  if (rule === null || binding === null || rule.modelRole !== 'Main Editorial Role' || !rule.crossUnitSynthesisAllowed ||
      rule.route !== binding.route || rule.endpoint !== binding.endpoint || rule.model !== binding.model ||
      rule.credentialSlot !== binding.credentialSlot) return null;
  return rule;
}
