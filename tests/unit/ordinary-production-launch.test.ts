import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ORDINARY_PRODUCTION_ALLOWED_BINDINGS, ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS,
  allowedProductionBindingOf,
  resolveSourceCheckoutLaunchPolicy,
  type ConfiguredProviderBinding,
} from '../../src/service/launch-policy.js';
import { CredentialBroker, type SecretResolver } from '../../src/service/provider/credential-broker.js';
import {
  DEEPSEEK_ROUTE,
  OPENCODE_GO_MODEL,
  OPENCODE_GO_ROUTE,
  evaluateEgress,
  type EgressBindingFacts,
} from '../../src/service/provider/egress-gate.js';
import type { AssembledModelPayload } from '../../src/service/provider/payload.js';
import { createCanonicalProductionDataRoot, DEVELOPMENT_CACHE_SIBLING_DIRECTORIES } from '../../src/shared/data-root.js';
import { DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../src/shared/protected-secret-identity.js';
import { MODEL_SERVICE_ROUTE_BINDINGS, MODEL_SERVICE_ROUTES, parseTrustedLaunchForm } from '../../src/shared/protocol.js';
import { CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES, CONFIGURED_DEVELOPMENT_SLOTS } from '../../src/shared/provider-configuration.generated.js';

// Issue #811: the local ordinary-production launch. Everything here is provider-free: no credential, no store write, no network.

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ABSOLUTE = process.platform === 'win32' ? 'C:\\ai7\\production' : '/ai7/production';
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function sandbox(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ai7-production-launch-')));
  roots.push(root);
  return root;
}

type BuiltLaunch = { parseBuiltLaunchArguments: (args: string[]) => { trustedOperationalScope: string; forwarded: string[] } };
type ProductionLaunch = {
  DEVELOPMENT_ONLY_ARGUMENTS: string[];
  defaultProductionDataRoot: (input?: { platform?: string; env?: Record<string, string | undefined>; home?: string }) => string;
  parseProductionLaunchArguments: (args: string[], defaults?: { platform?: string; env?: Record<string, string | undefined>; home?: string }) => { dataRoot: string | null; defaulted: boolean };
  startBuiltArguments: (dataRoot: string | null) => string[];
};

describe('the ordinary-production launch form', () => {
  it('is selected only by its launch argument, with none of the four development arguments', () => {
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production' }))
      .toEqual({ trustedOperationalScope: 'ordinary-production', runBudgetCeiling: null, providerCacheRoot: null, validation: null });
    expect(parseTrustedLaunchForm({})?.trustedOperationalScope).toBe('development-ci');
    for (const extra of [{ runBudgetCeiling: '1000' }, { providerCacheRoot: ABSOLUTE }, { validationCase: 'baseline-analysis/sample1-whole-book' },
      { validationDelta: 'input:edited-chapter-dialogue' }]) {
      expect(parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production', ...extra }), JSON.stringify(extra)).toBeNull();
    }
    for (const scope of ['', 'production', 'ordinary_production', 'Ordinary-Production']) {
      expect(parseTrustedLaunchForm({ trustedOperationalScope: scope }), scope).toBeNull();
    }
  });

  it('start-built forwards the scope and refuses every development argument under it', async () => {
    // @ts-expect-error tools/*.mjs carry no declarations; the launcher's parser is exercised as the plain module it is.
    const { parseBuiltLaunchArguments } = (await import('../../tools/start-built.mjs')) as BuiltLaunch;
    expect(parseBuiltLaunchArguments(['--data-root', ABSOLUTE, '--trusted-operational-scope', 'ordinary-production']))
      .toMatchObject({ trustedOperationalScope: 'ordinary-production', forwarded: ['--trusted-operational-scope', 'ordinary-production'] });
    expect(parseBuiltLaunchArguments(['--data-root', ABSOLUTE]).trustedOperationalScope).toBe('development-ci');
    for (const [key, value] of [['--run-budget-ceiling', '1000'], ['--provider-cache-root', ABSOLUTE],
      ['--validation-case', 'baseline-analysis/sample1-whole-book'], ['--validation-delta', 'input:edited-chapter-dialogue']] as const) {
      expect(() => parseBuiltLaunchArguments(['--data-root', ABSOLUTE, '--trusted-operational-scope', 'ordinary-production', key, value]), key)
        .toThrowError(/AI7_BUILT_LAUNCH_INVALID/u);
    }
  });

  it('start:production resolves the default data location, forwards the scope, and refuses development arguments', async () => {
    // @ts-expect-error tools/*.mjs carry no declarations; the wrapper is exercised as the plain module it is.
    const wrapper = (await import('../../tools/start-production.mjs')) as ProductionLaunch;
    const windows = { platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\editor\\AppData\\Local' } };
    expect(wrapper.defaultProductionDataRoot(windows)).toBe(resolve('C:\\Users\\editor\\AppData\\Local', 'ai7', 'production'));
    expect(wrapper.defaultProductionDataRoot({ platform: 'darwin', env: {}, home: '/Users/editor' }))
      .toBe(resolve('/Users/editor', 'Library', 'Application Support', 'ai7', 'production'));
    expect(() => wrapper.defaultProductionDataRoot({ platform: 'linux', env: {}, home: '/home/editor' })).toThrowError(/AI7_PRODUCTION_LAUNCH_INVALID/u);
    expect(() => wrapper.defaultProductionDataRoot({ platform: 'win32', env: {} })).toThrowError(/AI7_PRODUCTION_LAUNCH_INVALID/u);
    expect(wrapper.parseProductionLaunchArguments([], windows)).toEqual({ dataRoot: null, defaulted: true });
    expect(wrapper.parseProductionLaunchArguments(['--', '--data-root', ABSOLUTE])).toEqual({ dataRoot: resolve(ABSOLUTE), defaulted: false });
    expect(wrapper.startBuiltArguments(ABSOLUTE)).toEqual(['--data-root', ABSOLUTE, '--trusted-operational-scope', 'ordinary-production']);
    expect(wrapper.DEVELOPMENT_ONLY_ARGUMENTS).toEqual(['--run-budget-ceiling', '--provider-cache-root', '--validation-case', '--validation-delta']);
    for (const args of [
      ['--data-root', 'relative'],
      ['--data-root'],
      ['--data-root', ABSOLUTE, '--data-root', ABSOLUTE],
      ['--data-root', ABSOLUTE, '--trusted-operational-scope', 'developer-live'],
      ['--trusted-operational-scope', 'ordinary-production'],
      ['--data-root', ABSOLUTE, '--run-budget-ceiling', '1000'],
      ['--provider-cache-root', ABSOLUTE],
      ['--validation-case', 'baseline-analysis/sample1-whole-book'],
      ['--validation-delta', 'input:edited-chapter-dialogue'],
    ]) {
      expect(() => wrapper.parseProductionLaunchArguments(args, windows), args.join(' ')).toThrowError(/AI7_PRODUCTION_LAUNCH_INVALID/u);
    }
  });
});

describe('the production data root', () => {
  it('stays outside the checkout and its .cache, and apart from the developer cache siblings', async () => {
    const root = await sandbox();
    const checkout = resolve(root, 'checkout');
    await mkdir(resolve(checkout, '.cache'), { recursive: true });
    expect(DEVELOPMENT_CACHE_SIBLING_DIRECTORIES).toEqual(['ai7-harness-provider-cache', 'ai7-provider-cache']);
    const refused = [
      checkout,
      resolve(checkout, 'data'),
      resolve(checkout, '.cache', 'production'),
      root,
      ...DEVELOPMENT_CACHE_SIBLING_DIRECTORIES.flatMap((name) => [resolve(root, name), resolve(root, name, 'production')]),
    ];
    for (const candidate of refused) {
      await expect(createCanonicalProductionDataRoot(candidate, checkout), candidate).rejects.toThrowError(/AI7_DATA_ROOT_BOUNDARY_INVALID/u);
    }
    const accepted = await createCanonicalProductionDataRoot(resolve(root, 'elsewhere', 'production'), checkout);
    expect(accepted).toBe(resolve(root, 'elsewhere', 'production'));
  });
});

const GO = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0];
const OFFICIAL = ORDINARY_PRODUCTION_ALLOWED_BINDINGS[1];

describe('the configured binding the resolver reads (#853 v13, carried by #863 v15, #473 v17, #891 v19, #910 v21 and #920 v23)', () => {
  const CARRIED = [
    'config/source-checkout-launch-authority.json',
    'docs/policies/active-policy-set.v17.json',
    'docs/policies/provider-processing-policy.v1.json',
    'docs/policies/provider-processing-policy.v2.json',
    'docs/policies/provider-processing-policy.v24.json',
    'docs/policies/provider-processing-policy.v25.json',
    'docs/policies/external-export-policy.v2.json',
  ];

  async function checkout(): Promise<string> {
    const root = await sandbox();
    for (const relativePath of CARRIED) {
      const target = join(root, ...relativePath.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(REPO_ROOT, ...relativePath.split('/')), target);
    }
    return root;
  }

  it('mirrors exactly the bindings v23 allows both bound roles, Go first, as 设置 › 模型服务 offers them', async () => {
    const policy = JSON.parse(await readFile(join(REPO_ROOT, 'docs', 'policies', 'provider-processing-policy.v25.json'), 'utf8')) as {
      roleBindings: Record<string, { defaultBinding?: string; allowedBindings: unknown[] }>;
    };
    for (const role of ['Main Editorial Role', 'Fast Interaction Role']) {
      expect(policy.roleBindings[role]!.allowedBindings).toEqual(ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS);
      expect(policy.roleBindings[role]!.defaultBinding).toBe('opencode-go');
    }
    expect(MODEL_SERVICE_ROUTES).toEqual([...new Set(ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS.map((binding) => binding.route))]);
    for (const binding of ORDINARY_PRODUCTION_ALLOWED_BINDINGS) {
      expect(MODEL_SERVICE_ROUTE_BINDINGS[binding.route]).toMatchObject({ providerId: binding.route, modelId: binding.model, credentialSlot: binding.credentialSlot, approvedFallbackChain: [] });
    }
  });

  it('reports 需设置 with no admitted rule until a route is configured, and transmits nothing', async () => {
    const projection = await resolveSourceCheckoutLaunchPolicy(await checkout(), 'ordinary-production', null);
    expect(projection).toMatchObject({ integrityState: 'verified', denialReason: null, operationalScope: 'ordinary-production', activePolicySetVersion: 'v17' });
    expect(projection.providerProcessing).toMatchObject({
      version: 'v25', decision: 'eligible-only', liveTransmissionAllowed: false, bindingState: 'setup-required', admittedRules: [],
    });
  });

  it('fills every rule — both Model Roles — from the one configured binding', async () => {
    const root = await checkout();
    for (const allowed of ORDINARY_PRODUCTION_ALLOWED_BINDINGS) {
      const configured: ConfiguredProviderBinding = { ...allowed, credentialReference: randomUUID() };
      expect(allowedProductionBindingOf(configured)).toEqual(allowed);
      const projection = await resolveSourceCheckoutLaunchPolicy(root, 'ordinary-production', configured);
      const rules = projection.providerProcessing.admittedRules;
      expect(projection.providerProcessing.bindingState).toBe('configured');
      expect(projection.providerProcessing.liveTransmissionAllowed).toBe(true);
      expect(rules.map((rule) => rule.taskKinds).flat()).toEqual(expect.arrayContaining([
        'baseline-manuscript-analysis', 'editorial-dialogue', 'editorial-review/typos-and-usage', 'writing', 'evaluation', 'editorial-polish', 'conflict-regenerate',
      ]));
      expect(new Set(rules.map((rule) => rule.modelRole))).toEqual(new Set(['Main Editorial Role', 'Fast Interaction Role']));
      for (const rule of rules) {
        expect(rule).toMatchObject({ route: allowed.route, endpoint: allowed.endpoint, model: allowed.model, credentialSlot: allowed.credentialSlot });
      }
    }
  });

  it('never passes a binding outside the two, or a development Credential Reference, to the resolver', async () => {
    const root = await checkout();
    const reference = randomUUID();
    const outside = [
      { ...GO, endpoint: 'https://opencode.ai/zen/v1/chat/completions', credentialReference: reference },
      { ...OFFICIAL, model: 'deepseek-v4-pro', credentialReference: reference },
      { ...GO, credentialSlot: 'deepseek-api-key', credentialReference: reference },
      { route: 'openai-platform', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-5', credentialSlot: 'openai-platform', credentialReference: reference },
    ];
    for (const configured of [
      ...outside,
      { ...GO, credentialReference: CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES['opencode-go'] },
      { ...GO, credentialReference: CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES['opencode-go'].toUpperCase() },
      { ...OFFICIAL, credentialReference: 'not-a-reference' },
    ]) {
      expect(allowedProductionBindingOf(configured), JSON.stringify(configured)).toBeNull();
    }
    // And the resolver itself admits none of the four bindings outside the policy: it denies.
    for (const configured of outside) {
      const projection = await resolveSourceCheckoutLaunchPolicy(root, 'ordinary-production', configured);
      expect(projection.integrityState).toBe('denied');
      expect(projection.providerProcessing.admittedRules).toEqual([]);
    }
  });
});

describe('the Credential Broker under ordinary production', () => {
  function resolver(): SecretResolver & { reads: string[] } {
    const reads: string[] = [];
    return { reads, resolve: async (reference) => { reads.push(reference); return 'placeholder-not-a-credential'; } };
  }

  it('refuses every development reference before the store is read, and reads a production one', async () => {
    const store = resolver();
    const broker = new CredentialBroker(store, { developmentReferences: 'refused' });
    const ticket = (bindingDigest: string) => ({ decision: 'transmit-remote' as const, bindingDigest, payloadDigest: 'b'.repeat(64) });
    for (const [slot, reference] of Object.entries(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES)) {
      const binding = { bindingDigest: 'a'.repeat(64), modelRole: 'Main Editorial Role' as const, slot: slot as 'opencode-go', credentialReference: reference };
      await expect(broker.checkReadiness(binding), slot).rejects.toMatchObject({ code: 'CREDENTIAL_DEVELOPMENT_REFERENCE_REFUSED' });
      await expect(broker.checkPlanReadiness(binding.slot, reference.toUpperCase())).rejects.toMatchObject({ code: 'CREDENTIAL_DEVELOPMENT_REFERENCE_REFUSED' });
      await expect(broker.releaseTo(binding, ticket(binding.bindingDigest), async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_DEVELOPMENT_REFERENCE_REFUSED' });
    }
    expect(store.reads).toEqual([]);
    expect(broker.releaseCount).toBe(0);
    const production = { bindingDigest: 'a'.repeat(64), modelRole: 'Fast Interaction Role' as const, slot: 'deepseek-api-key' as const, credentialReference: randomUUID() };
    await expect(broker.checkReadiness(production)).resolves.toBe('present');
    expect(store.reads).toEqual([production.credentialReference]);
  });

  it('still reads the development reference under the development scopes', async () => {
    const store = resolver();
    const broker = new CredentialBroker(store);
    await expect(broker.checkPlanReadiness('opencode-go', CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES['opencode-go'])).resolves.toBe('present');
  });

  it('keeps the production slots apart from every development reference', () => {
    expect(DEVELOPMENT_CREDENTIAL_REFERENCES.size).toBe(CONFIGURED_DEVELOPMENT_SLOTS.length);
    for (const reference of Object.values(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES)) expect(DEVELOPMENT_CREDENTIAL_REFERENCES.has(reference.toLowerCase())).toBe(true);
    expect(CONFIGURED_DEVELOPMENT_SLOTS).not.toContain('deepseek-api-key');
  });
});

describe('the Egress Gate under ordinary production (Issue #811)', () => {
  const SYSTEM = '合成系统提示。';
  const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
  const DIGEST = 'c'.repeat(64);
  const payload = (route: string, model: string): AssembledModelPayload => ({
    provider: route, model, system: SYSTEM, tools: [], messages: [{ role: 'user', content: [{ type: 'text', text: UNIT }], source: { kind: 'user' } }],
  });
  const production = (overrides: Partial<EgressBindingFacts> = {}): EgressBindingFacts => ({
    bindingDigest: DIGEST,
    route: DEEPSEEK_ROUTE,
    model: 'deepseek-flash',
    systemPrompt: SYSTEM,
    outboundDataCategory: 'unpublished-excerpts',
    policy: { operationalScope: 'ordinary-production', providerProcessingVersion: 'v23', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
    admittedUserMessages: new Set([UNIT]),
    ruleOutboundCategories: new Set(['public-or-synthetic', 'unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content']),
    ...overrides,
  });
  const attempt = (ceiling: 'unset' | 'within' | 'reached') => ({ currentBindingDigest: () => DIGEST, acceptedOutputDigests: new Set<string>(), ceilingState: () => ceiling });

  it('sends the editor\'s unpublished words under a rule naming them, with or without a Run ceiling', () => {
    for (const ceiling of ['unset', 'within'] as const) {
      expect(evaluateEgress(payload(DEEPSEEK_ROUTE, 'deepseek-flash'), production(), attempt(ceiling)), ceiling).toMatchObject({ decision: 'transmit-remote' });
    }
    expect(evaluateEgress(payload(DEEPSEEK_ROUTE, 'deepseek-flash'), production(), attempt('reached'))).toMatchObject({ decision: 'refuse', reason: 'run-budget-ceiling-reached' });
    const synthesis = production({ outboundDataCategory: 'unpublished-full-content' });
    expect(evaluateEgress(payload(DEEPSEEK_ROUTE, 'deepseek-flash'), synthesis, attempt('unset'))).toMatchObject({ decision: 'transmit-remote' });
  });

  it('refuses a category the rule does not name, and the same words under developer-live', () => {
    const unnamed = production({ ruleOutboundCategories: new Set(['public-or-synthetic', 'unpublished-excerpts']), outboundDataCategory: 'unpublished-full-content' });
    expect(evaluateEgress(payload(DEEPSEEK_ROUTE, 'deepseek-flash'), unnamed, attempt('unset'))).toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    const developerLive = production({
      route: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL,
      policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v11', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
    });
    expect(evaluateEgress(payload(OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL), developerLive, attempt('within'))).toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    // An unset ceiling stays a refusal under developer-live (v9 onward), exactly as before.
    const publicLive = { ...developerLive, outboundDataCategory: 'public-or-synthetic' as const };
    expect(evaluateEgress(payload(OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL), publicLive, attempt('unset'))).toMatchObject({ decision: 'refuse', reason: 'run-budget-ceiling-unset' });
  });

  it('refuses a payload on any route but the frozen one', () => {
    expect(evaluateEgress(payload(OPENCODE_GO_ROUTE, 'deepseek-flash'), production(), attempt('unset'))).toMatchObject({ decision: 'refuse', reason: 'route-mismatch' });
    expect(evaluateEgress(payload(DEEPSEEK_ROUTE, 'deepseek-v4-pro'), production(), attempt('unset'))).toMatchObject({ decision: 'refuse', reason: 'model-mismatch' });
  });

  it('requires the production rule to name every category, including public-or-synthetic', () => {
    for (const outboundDataCategory of ['public-or-synthetic', 'unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content',
      'editor-selected-manuscript-excerpt', 'manuscript-conflict-region-excerpt'] as const) {
      const admitted = production({ outboundDataCategory });
      const { ruleOutboundCategories: omitted, ...withoutRule } = admitted;
      expect(omitted).toBeDefined();
      for (const binding of [withoutRule, { ...admitted, ruleOutboundCategories: new Set<'public-or-synthetic'>() }]) {
        expect(evaluateEgress(payload(DEEPSEEK_ROUTE, 'deepseek-flash'), binding, attempt('unset')).decision).toBe('refuse');
      }
    }
  });
});

describe('the enrollment helper\'s named-reference form (Issue #811 item 5)', () => {
  type Helper = {
    parseEnrollmentArguments: (argv: string[]) => { mode: string; slot: string; credentialReference: string; fromFile: string | null };
    PRODUCTION_CONNECTION_SLOTS: readonly string[];
  };
  const KEY_PATH = process.platform === 'win32' ? 'C:\\keys\\official.key.txt' : '/keys/official.key.txt';

  it('takes exactly a production slot, a production reference and a file', async () => {
    // @ts-expect-error tools/*.mjs carry no declarations; the helper is exercised as the plain module it is.
    const helper = (await import('../../tools/enroll-dev-credential.mjs')) as Helper;
    expect(helper.PRODUCTION_CONNECTION_SLOTS).toEqual(ORDINARY_PRODUCTION_ALLOWED_BINDINGS.map((binding) => binding.credentialSlot));
    const reference = randomUUID();
    for (const slot of helper.PRODUCTION_CONNECTION_SLOTS) {
      expect(helper.parseEnrollmentArguments(['--slot', slot, '--credential-reference', reference, '--from-file', KEY_PATH]))
        .toEqual({ mode: 'store-named', slot, credentialReference: reference, fromFile: resolve(KEY_PATH) });
    }
    expect(helper.parseEnrollmentArguments(['--from-file', KEY_PATH, '--credential-reference', reference.toUpperCase(), '--slot', 'deepseek-api-key']).credentialReference)
      .toBe(reference);
  });

  it('refuses a development reference, any other slot, a check, and every malformed shape', async () => {
    // @ts-expect-error tools/*.mjs carry no declarations; the helper is exercised as the plain module it is.
    const helper = (await import('../../tools/enroll-dev-credential.mjs')) as Helper;
    const reference = randomUUID();
    for (const argv of [
      ...Object.values(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES).map((development) => ['--slot', 'opencode-go', '--credential-reference', development, '--from-file', KEY_PATH]),
      ['--slot', 'opencode-go', '--credential-reference', CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES['opencode-go'].toUpperCase(), '--from-file', KEY_PATH],
      ['--slot', 'openai-platform', '--credential-reference', reference, '--from-file', KEY_PATH],
      ['--slot', 'unconfigured', '--credential-reference', reference, '--from-file', KEY_PATH],
      ['--slot', 'deepseek-api-key', '--credential-reference', reference, '--check'],
      ['--slot', 'deepseek-api-key', '--credential-reference', reference, '--from-file', KEY_PATH, '--check'],
      ['--slot', 'deepseek-api-key', '--credential-reference', reference],
      ['--slot', 'deepseek-api-key', '--credential-reference', 'not-a-reference', '--from-file', KEY_PATH],
      ['--slot', 'deepseek-api-key', '--credential-reference', '', '--from-file', KEY_PATH],
      ['--credential-reference', reference, '--from-file', KEY_PATH],
      ['--slot', 'deepseek-api-key', '--credential-reference', reference, '--credential-reference', reference, '--from-file', KEY_PATH],
    ]) {
      expect(() => helper.parseEnrollmentArguments(argv), argv.join(' ')).toThrowError(/AI7_ENROLLMENT_INVALID/u);
    }
  });

  it('keeps the slot list it duplicates and refuses CI and a native-carrier override as the store form does', async () => {
    const source = await (await import('node:fs/promises')).readFile(fileURLToPath(new URL('../../tools/enroll-dev-credential.mjs', import.meta.url)), 'utf8');
    expect(source).toContain("export const PRODUCTION_CONNECTION_SLOTS = Object.freeze(['opencode-go', 'deepseek-api-key']);");
    // The named form reaches the store only past the same two refusals as the development store form.
    expect(source).toMatch(/requireEnrollment\(request\.mode !== 'check' && !continuousIntegrationPresent\(deps\.env\)\);\s*const entry = await openEntry\(request\.credentialReference, deps\);/u);
  });
});
