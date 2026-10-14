import { describe, expect, it } from 'vitest';
import { admittedDialogueRoute, admittedFastRoleRoute } from '../../src/service/dialogue/dialogue-route.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_MODEL } from '../../src/service/provider/egress-gate.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { resolveCodeRoot } from '../support/temp-data-root.js';

// The Fast Interaction Role's route for one kind (Issue #842): read from the verified projection's admitted rules as the
// dialogue's is (Issue #52, S17c), the dialogue reading unchanged, under the selected Provider Processing v11 (Issue #841).

async function livePolicy(): Promise<LaunchPolicyProjection> {
  const policy = await resolveSourceCheckoutLaunchPolicy(await resolveCodeRoot(), 'developer-live');
  expect(policy.integrityState).toBe('verified');
  return policy;
}

function withRules(policy: LaunchPolicyProjection, rules: ReadonlyArray<unknown>): LaunchPolicyProjection {
  return { ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: rules } as LaunchPolicyProjection['providerProcessing'] };
}

describe('admittedFastRoleRoute', () => {
  it('takes the one rule the selected policy names for each fast-role kind with its own category', async () => {
    const policy = await livePolicy();
    const polish = admittedFastRoleRoute(policy, 'editorial-polish', 'editor-selected-manuscript-excerpt')!;
    expect(polish.ruleId).toBe('developer-live-public-samplebook-editorial-polish');
    expect(polish.providerProcessingVersion).toBe(policy.providerProcessing.version);
    expect(polish.modelRole).toBe('Fast Interaction Role');
    expect(polish.profile).toBe(OPENCODE_GO_ROUTE_PROFILE);
    expect(polish.modelProfile.model).toBe(OPENCODE_GO_MODEL);
    expect([...polish.outboundDataCategories]).toEqual(['editor-selected-manuscript-excerpt']);
    const regenerate = admittedFastRoleRoute(policy, 'conflict-regenerate', 'manuscript-conflict-region-excerpt')!;
    expect(regenerate.ruleId).toBe('developer-live-public-samplebook-conflict-regenerate');
    expect([...regenerate.outboundDataCategories]).toEqual(['manuscript-conflict-region-excerpt']);
    // A kind is never admitted under another kind's category, nor the dialogue under the conflict region's.
    expect(admittedFastRoleRoute(policy, 'conflict-regenerate', 'editor-selected-manuscript-excerpt')).toBeNull();
    expect(admittedFastRoleRoute(policy, 'editorial-polish', 'manuscript-conflict-region-excerpt')).toBeNull();
    expect(admittedFastRoleRoute(policy, 'editorial-dialogue', 'manuscript-conflict-region-excerpt')).toBeNull();
  });

  it('refuses a policy that names no such rule, a duplicate, a foreign binding, and any scope but a verified developer-live', async () => {
    const policy = await livePolicy();
    const rules = policy.providerProcessing.admittedRules;
    const polishRule = rules.find((rule) => rule.taskKinds.includes('editorial-polish'))!;
    expect(admittedFastRoleRoute(withRules(policy, rules.filter((rule) => rule !== polishRule)), 'editorial-polish', 'editor-selected-manuscript-excerpt')).toBeNull();
    for (const variant of [
      [polishRule, { ...polishRule, ruleId: 'second' }],
      [{ ...polishRule, modelRole: 'Frontier Model Role' }],
      [{ ...polishRule, endpoint: 'https://example.invalid/v1/chat/completions' }],
      [{ ...polishRule, model: 'undeclared-model' }],
      [{ ...polishRule, route: 'deepseek-open-platform' }],
    ]) {
      expect(admittedFastRoleRoute(withRules(policy, variant), 'editorial-polish', 'editor-selected-manuscript-excerpt')).toBeNull();
    }
    expect(admittedFastRoleRoute({ ...policy, integrityState: 'denied' }, 'editorial-polish', 'editor-selected-manuscript-excerpt')).toBeNull();
    expect(admittedFastRoleRoute({ ...policy, operationalScope: 'development-ci' }, 'editorial-polish', 'editor-selected-manuscript-excerpt')).toBeNull();
  });

  it('reads the dialogue route exactly as before', async () => {
    const policy = await livePolicy();
    const dialogue = admittedDialogueRoute(policy)!;
    expect(dialogue).toEqual(admittedFastRoleRoute(policy, 'editorial-dialogue', 'editor-selected-manuscript-excerpt'));
    expect(dialogue.ruleId).toBe('developer-live-public-samplebook-editorial-dialogue');
    expect([...dialogue.outboundDataCategories]).toEqual(['editor-selected-manuscript-excerpt']);
  });
});
