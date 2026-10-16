import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { liveKindAdmission, liveKindRule, modelAdmitsPlatformTools, kindLocalTools } from '../../src/service/analysis/live-kind-admission.js';
import { withLocalRetrievalFor } from '../support/policy-rules.js';
import { admittedFastRoleRoute } from '../../src/service/dialogue/dialogue-route.js';
import { factualReviewKindDefinition, withFactualResearch } from '../../src/service/analysis/kind-definition.js';
import { reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import { liveReviewRule } from '../../src/service/review/live-review-admission.js';
import { platformToolModelProfile } from '../../src/service/provider/platform-tool-session.js';
import { OPENCODE_GO_V41_FLASH_PROFILE } from '../../src/service/provider/model-profile.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('platform tool registration admission', () => {
  it('admits local retrieval by rule for every foreground model kind, preserving baseline/background exclusions', async () => {
    const policy = await resolveSourceCheckoutLaunchPolicy(root, 'developer-live');
    for (const rule of policy.providerProcessing.admittedRules.filter((entry) => !entry.backgroundOrigin)) {
      for (const kind of rule.taskKinds) {
        expect(kindLocalTools(policy, kind)).toBeNull();
        const projected = withLocalRetrievalFor(policy, kind);
        expect(kindLocalTools(projected, kind) !== null).toBe(kind !== 'baseline-manuscript-analysis');
        expect(kindLocalTools(projected, kind, 'background')).toBeNull();
        expect(kindLocalTools(withLocalRetrievalFor(policy, kind, false), kind)).toBeNull();
      }
    }
    for (const kind of ['editorial-dialogue', 'editorial-polish', 'proposal-conflict-regenerate']) {
      const rule = policy.providerProcessing.admittedRules.find((entry) => entry.taskKinds.includes(kind));
      if (rule === undefined) continue;
      const category = rule.outboundDataCategories[0]!;
      expect(admittedFastRoleRoute(withLocalRetrievalFor(policy, kind), kind, category)?.localTools?.targetedRetrieval.allowed).toBe(true);
    }
  });
  it('requires a declaring research rule and the exact factual research contract', async () => {
    const policy = await resolveSourceCheckoutLaunchPolicy(root, 'developer-live');
    expect(policy.providerProcessing.version).toBe('v18');
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

  it('admits web-bearing review only on a model whose profile records the tool loop, under both production routes', async () => {
    expect(modelAdmitsPlatformTools('opencode-go', 'deepseek-v4.1-flash')).toBe(true);
    expect(modelAdmitsPlatformTools('deepseek-open-platform', 'deepseek-flash')).toBe(false);
    expect(modelAdmitsPlatformTools('opencode-go', 'deepseek-v4-flash')).toBe(false);
    for (const allowed of ORDINARY_PRODUCTION_ALLOWED_BINDINGS) {
      const policy = await resolveSourceCheckoutLaunchPolicy(root, 'ordinary-production', { ...allowed, credentialReference: randomUUID() });
      expect(policy.providerProcessing.version).toBe('v19');
      const rule = liveKindRule(policy, 'factual-review')!;
      // The rule names the tools on both routes; only the model with recorded evidence may be handed them.
      expect(rule.platformTools).not.toBeNull();
      const tools = modelAdmitsPlatformTools(allowed.route, allowed.model);
      expect(tools).toBe(allowed.route === 'opencode-go');
      for (const categoryId of ['factual-review', 'academic-integrity']) expect(liveReviewRule(policy, reviewCategoryEntry(categoryId)!) !== null).toBe(tools);
      expect(liveKindAdmission(policy, withFactualResearch(factualReviewKindDefinition()), allowed) !== null).toBe(tools);
    }
  });

  it('bootstraps only the exact named developer-live item and refuses once the capability is declared', () => {
    const profile = { ...OPENCODE_GO_V41_FLASH_PROFILE, capabilities: { ...OPENCODE_GO_V41_FLASH_PROFILE.capabilities, toolCalling: 'none' as const } };
    const item = { family: 'policy-selection', case: 'wave6-tool-evidence-bootstrap', delta: null };
    expect(() => platformToolModelProfile(OPENCODE_GO_V41_FLASH_PROFILE, 'developer-live', item)).toThrow(/不重复/u);
    expect(() => platformToolModelProfile(profile, 'ordinary-production', item)).toThrow(/证据/u);
    expect(() => platformToolModelProfile(profile, 'developer-live', { ...item, case: 'another-case' })).toThrow(/证据/u);
    const admitted = platformToolModelProfile(profile, 'developer-live', item);
    expect(admitted.capabilities.toolCalling).toBe('function');
    expect(() => platformToolModelProfile(admitted, 'developer-live', item)).toThrow(/不重复/u);
    expect(platformToolModelProfile(admitted, 'ordinary-production', null)).toBe(admitted);
  });
});
