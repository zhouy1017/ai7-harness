import { describe, expect, it } from 'vitest';
import { admittedDialogueRoute, admittedFastRoleRoute } from '../../src/service/dialogue/dialogue-route.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_MODEL } from '../../src/service/provider/egress-gate.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { resolveCodeRoot } from '../support/temp-data-root.js';
import { V11_FAST_ROLE_RULES, withV11FastRoleRules } from '../support/policy-v11-stand-in.js';

// The Fast Interaction Role's route for one kind (Issue #842): read from the verified projection's admitted rules as the
// dialogue's is (Issue #52, S17c), the dialogue reading unchanged. The two fast-role rules come from the v11 stand-in.

async function livePolicy(): Promise<LaunchPolicyProjection> {
  const policy = await resolveSourceCheckoutLaunchPolicy(await resolveCodeRoot(), 'developer-live');
  expect(policy.integrityState).toBe('verified');
  return policy;
}

function withRules(policy: LaunchPolicyProjection, rules: ReadonlyArray<unknown>): LaunchPolicyProjection {
  return { ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: rules } as LaunchPolicyProjection['providerProcessing'] };
}

describe('admittedFastRoleRoute', () => {
  it('takes the one rule naming the kind with its own category, for each fast-role kind', async () => {
    const policy = withV11FastRoleRules(await livePolicy());
    const polish = admittedFastRoleRoute(policy, 'editorial-polish', 'editor-selected-manuscript-excerpt')!;
    expect(polish.ruleId).toBe('developer-live-public-samplebook-editorial-polish');
    expect(polish.modelRole).toBe('Fast Interaction Role');
    expect(polish.profile).toBe(OPENCODE_GO_ROUTE_PROFILE);
    expect(polish.modelProfile.model).toBe(OPENCODE_GO_MODEL);
    expect([...polish.outboundDataCategories]).toEqual(['editor-selected-manuscript-excerpt']);
    const regenerate = admittedFastRoleRoute(policy, 'conflict-regenerate', 'manuscript-conflict-region-excerpt')!;
    expect(regenerate.ruleId).toBe('developer-live-public-samplebook-conflict-regenerate');
    expect([...regenerate.outboundDataCategories]).toEqual(['manuscript-conflict-region-excerpt']);
    // A kind is never admitted under another kind's category, nor under the dialogue's rule.
    expect(admittedFastRoleRoute(policy, 'conflict-regenerate', 'editor-selected-manuscript-excerpt')).toBeNull();
    expect(admittedFastRoleRoute(policy, 'editorial-polish', 'manuscript-conflict-region-excerpt')).toBeNull();
    expect(admittedFastRoleRoute(policy, 'editorial-dialogue', 'manuscript-conflict-region-excerpt')).toBeNull();
  });

  it('admits neither fast-role kind under the selected v10 policy, which names neither', async () => {
    const policy = await livePolicy();
    expect(admittedFastRoleRoute(policy, 'editorial-polish', 'editor-selected-manuscript-excerpt')).toBeNull();
    expect(admittedFastRoleRoute(policy, 'conflict-regenerate', 'manuscript-conflict-region-excerpt')).toBeNull();
  });

  it('refuses a duplicate, a foreign binding, and any scope but a verified developer-live', async () => {
    const policy = await livePolicy();
    const [polishRule] = V11_FAST_ROLE_RULES;
    for (const rules of [
      [polishRule, { ...polishRule, ruleId: 'second' }],
      [{ ...polishRule, modelRole: 'Frontier Model Role' }],
      [{ ...polishRule, endpoint: 'https://example.invalid/v1/chat/completions' }],
      [{ ...polishRule, model: 'undeclared-model' }],
      [{ ...polishRule, route: 'deepseek-open-platform' }],
    ]) {
      expect(admittedFastRoleRoute(withRules(policy, rules), 'editorial-polish', 'editor-selected-manuscript-excerpt')).toBeNull();
    }
    const admitted = withV11FastRoleRules(policy);
    expect(admittedFastRoleRoute({ ...admitted, integrityState: 'denied' }, 'editorial-polish', 'editor-selected-manuscript-excerpt')).toBeNull();
    expect(admittedFastRoleRoute({ ...admitted, operationalScope: 'development-ci' }, 'editorial-polish', 'editor-selected-manuscript-excerpt')).toBeNull();
  });

  it('reads the dialogue route exactly as before', async () => {
    const policy = withV11FastRoleRules(await livePolicy());
    const dialogue = admittedDialogueRoute(policy)!;
    expect(dialogue).toEqual(admittedFastRoleRoute(policy, 'editorial-dialogue', 'editor-selected-manuscript-excerpt'));
    expect(dialogue.ruleId).toBe('developer-live-public-samplebook-editorial-dialogue');
    expect([...dialogue.outboundDataCategories]).toEqual(['editor-selected-manuscript-excerpt']);
  });
});
