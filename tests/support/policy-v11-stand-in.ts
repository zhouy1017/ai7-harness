import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_MODEL } from '../../src/service/provider/egress-gate.js';

/**
 * A test-local stand-in for the two Fast Interaction Role rules Provider Processing v11 adds (Issue #841 brief revision 6;
 * slice 2d, PR #844): `editorial-polish` under `editor-selected-manuscript-excerpt` and `conflict-regenerate` under
 * `manuscript-conflict-region-excerpt`, one rule per kind, each bound to the one Go route. Slice 2f (Issue #842) develops
 * against these until the wave selects v11/v9; then this file is dropped and the suites read the selected policy itself.
 */
export const V11_FAST_ROLE_RULES = [
  {
    ruleId: 'developer-live-public-samplebook-editorial-polish',
    taskKinds: ['editorial-polish'],
    modelRole: 'Fast Interaction Role',
    route: 'opencode-go',
    endpoint: OPENCODE_GO_ROUTE_PROFILE.endpoint,
    model: OPENCODE_GO_MODEL,
    credentialSlot: OPENCODE_GO_ROUTE_PROFILE.credentialSlot,
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
  },
  {
    ruleId: 'developer-live-public-samplebook-conflict-regenerate',
    taskKinds: ['conflict-regenerate'],
    modelRole: 'Fast Interaction Role',
    route: 'opencode-go',
    endpoint: OPENCODE_GO_ROUTE_PROFILE.endpoint,
    model: OPENCODE_GO_MODEL,
    credentialSlot: OPENCODE_GO_ROUTE_PROFILE.credentialSlot,
    outboundDataCategories: ['manuscript-conflict-region-excerpt'],
    crossUnitSynthesisAllowed: false,
  },
] as const;

/** The verified developer-live projection with the stand-in rules beside the ones the selected policy lists. */
export function withV11FastRoleRules(policy: LaunchPolicyProjection): LaunchPolicyProjection {
  const processing = policy.providerProcessing;
  const rules = [...(processing.admittedRules ?? []), ...V11_FAST_ROLE_RULES] as unknown as LaunchPolicyProjection['providerProcessing']['admittedRules'];
  return { ...policy, providerProcessing: { ...processing, admittedRules: rules } as LaunchPolicyProjection['providerProcessing'] };
}
