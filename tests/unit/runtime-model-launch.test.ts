import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIGURED_RUNTIME_MODEL_TABLE } from '../../src/shared/provider-configuration.generated.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS } from '../../src/service/launch-policy.js';
import { kindResearchDeclaration, liveKindAdmission } from '../../src/service/analysis/live-kind-admission.js';
import { bindOrdinaryProductionRules, resolveSourceCheckoutLaunchPolicy, verifyOrdinaryProductionPolicy } from '../../src/service/launch-policy.js';
import { readFileSync } from 'node:fs';
import { reviewCategoryEntry, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { liveReviewRule } from '../../src/service/review/live-review-admission.js';
import { localToolsFromProjection } from '../../src/service/retrieval/local-rule.js';

type Reference = { route: string; model: string };
type Input = { runtimeBindings: { data: { ordinaryProduction: { main: Reference[]; fast: Reference[] } } }; documents: unknown[] };
type Resolved = { runtimeModelTable: { ordinaryProduction: { main: Reference[]; fast: Reference[] } } };
// @ts-expect-error tools/*.mjs have no declarations; exercise the actual generator.
const generator = await import('../../tools/generate-provider-configuration.mjs') as {
  readProviderDocuments: () => Input;
  resolveProviderConfiguration: (input: Input) => Resolved;
  renderProviderConfiguration: (input: Resolved) => Record<string, string>;
};

describe('reviewed runtime model table', () => {
  it('supplies the existing role choices and lets reviewed in-family configuration change without policy bytes', () => {
    expect(ORDINARY_PRODUCTION_ALLOWED_BINDINGS).toEqual(CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction.main);
    expect(ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS).toEqual(CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction.fast);
    const input = structuredClone(generator.readProviderDocuments());
    input.runtimeBindings.data.ordinaryProduction.main = [{ route: 'deepseek-open-platform', model: 'deepseek-v4-pro' }];
    const resolved = generator.resolveProviderConfiguration(input);
    expect(resolved.runtimeModelTable.ordinaryProduction.main[0]).toMatchObject({
      model: 'deepseek-v4-pro', endpoint: 'https://api.deepseek.com/chat/completions', credentialSlot: 'deepseek-api-key',
    });
    expect(generator.renderProviderConfiguration(resolved)['src/shared/provider-configuration.generated.ts']).toContain('CONFIGURED_RUNTIME_MODEL_TABLE');
  });

  it.each([
    { route: 'unknown', model: 'unknown' },
    { route: 'opencode-go', model: 'unknown' },
    { route: 'openai-platform', model: 'gpt-5.6-luna' },
  ])('refuses an unreadable or out-of-family configuration row ($route/$model)', (binding) => {
    const input = structuredClone(generator.readProviderDocuments());
    input.runtimeBindings.data.ordinaryProduction.main = [binding];
    expect(() => generator.resolveProviderConfiguration(input)).toThrow();
  });
});

describe('publication-risk policy admission', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const binding = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0], credentialReference: '12345678-1234-4234-8234-123456789abc' };
  const entry = reviewCategoryEntry('publication-risk')!;
  const definition = reviewCategoryKindDefinition(reviewCategoryContractInput(entry));

  it('admits production v26 without web and keeps v25, v24 and v1 refused', async () => {
    const policy = await resolveSourceCheckoutLaunchPolicy(root, 'ordinary-production', binding);
    expect(liveReviewRule(policy, entry)).not.toBeNull();
    const retrieval = localToolsFromProjection(liveReviewRule(policy, entry));
    expect(retrieval?.targetedRetrieval.allowed).toBe(true);
    expect(retrieval?.declarations).toHaveLength(7);
    expect(liveKindAdmission(policy, definition, binding)).not.toBeNull();
    expect(kindResearchDeclaration(policy, definition.kind, { webSearch: true, searchEngine: 'user-selected-backend' }))
      .toEqual({ webSearch: false, searchEngine: null });
    const predecessor = JSON.parse(readFileSync(new URL('../../docs/policies/provider-processing-policy.v25.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    const v25 = { ...policy, providerProcessing: { ...policy.providerProcessing, version: 'v25' as const,
      admittedRules: bindOrdinaryProductionRules(verifyOrdinaryProductionPolicy(predecessor), binding)! } };
    for (const denied of [v25, await resolveSourceCheckoutLaunchPolicy(root, 'developer-live'), await resolveSourceCheckoutLaunchPolicy(root)]) {
      expect(liveReviewRule(denied, entry)).toBeNull();
      expect(liveKindAdmission(denied, definition, binding)).toBeNull();
    }
  });
});
