import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { liveKindAdmission, liveKindRule } from '../../src/service/analysis/live-kind-admission.js';
import { factualReviewKindDefinition, withFactualResearch } from '../../src/service/analysis/kind-definition.js';
import { reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import { liveReviewRule } from '../../src/service/review/live-review-admission.js';
import { platformToolModelProfile } from '../../src/service/provider/platform-tool-session.js';
import { OPENCODE_GO_V41_FLASH_PROFILE } from '../../src/service/provider/model-profile.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('platform tool registration admission', () => {
  it('requires a declaring research rule and the exact factual research contract', async () => {
    const policy = await resolveSourceCheckoutLaunchPolicy(root, 'developer-live');
    expect(policy.providerProcessing.version).toBe('v16');
    const researchRule = policy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes('factual-review'))!;
    const template = researchRule;
    const base = factualReviewKindDefinition();
    const research = withFactualResearch(base);
    const binding = { route: template.route, model: template.model, endpoint: template.endpoint, credentialSlot: template.credentialSlot };
    expect(liveKindRule(policy, 'factual-review')).toBe(researchRule);
    expect(liveKindAdmission(policy, base, binding)).toBeNull();
    expect(liveKindAdmission(policy, research, binding)?.ruleId).toBe(template.ruleId);
    const refused = { ...policy, providerProcessing: { ...policy.providerProcessing, admittedRules: [{ ...researchRule, webSearchToolAllowed: false }] } };
    expect(liveKindAdmission(refused, research, binding)).toBeNull();
    expect(liveReviewRule(policy, reviewCategoryEntry('factual-review')!)).not.toBeNull();
    expect(liveReviewRule(policy, reviewCategoryEntry('academic-integrity')!)).not.toBeNull();
    expect(liveReviewRule(policy, reviewCategoryEntry('publication-risk')!)).toBeNull();
    expect(liveKindAdmission(policy, { ...research, promptContractDigest: '0'.repeat(64) }, binding)).toBeNull();
  });

  it('bootstraps only the exact named developer-live item and refuses once the capability is declared', () => {
    const profile = { ...OPENCODE_GO_V41_FLASH_PROFILE, capabilities: { ...OPENCODE_GO_V41_FLASH_PROFILE.capabilities, toolCalling: 'none' as const } };
    const item = { family: 'policy-selection', case: 'wave6-tool-evidence-bootstrap', delta: null };
    expect(() => platformToolModelProfile(profile, 'ordinary-production', item)).toThrow(/证据/u);
    expect(() => platformToolModelProfile(profile, 'developer-live', { ...item, case: 'another-case' })).toThrow(/证据/u);
    const admitted = platformToolModelProfile(profile, 'developer-live', item);
    expect(admitted.capabilities.toolCalling).toBe('function');
    expect(() => platformToolModelProfile(admitted, 'developer-live', item)).toThrow(/不重复/u);
    expect(platformToolModelProfile(admitted, 'ordinary-production', null)).toBe(admitted);
  });
});
