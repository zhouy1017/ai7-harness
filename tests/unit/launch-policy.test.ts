import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy, verifyDeveloperLivePolicy } from '../../src/service/launch-policy.js';
import type { LaunchPolicyProjection, TrustedOperationalScope } from '../../src/shared/protocol.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v6.json';
const CARRIED_PATHS = [
  CARRIER_PATH,
  ACTIVE_SET_PATH,
  'docs/policies/active-policy-set.v5.json',
  'docs/policies/provider-processing-policy.v1.json',
  'docs/policies/provider-processing-policy.v2.json',
  'docs/policies/provider-processing-policy.v3.json',
  'docs/policies/provider-processing-policy.v4.json',
  'docs/policies/provider-processing-policy.v5.json',
  'docs/policies/provider-processing-policy.v6.json',
  'docs/policies/provider-processing-policy.v8.json',
  'docs/policies/external-export-policy.v1.json',
  'docs/policies/external-export-policy.v2.json',
] as const;
/** The exact pins active-set v6 records (Issue #473, S87-f3b); the resolver and the carrier must agree with the bytes. */
const EXPECTED_PINS = {
  'development-ci': ['v1', 'docs/policies/provider-processing-policy.v1.json', 'd9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a'],
  'fixture-recording': ['v2', 'docs/policies/provider-processing-policy.v2.json', 'd0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc'],
  'ordinary-production': ['v6', 'docs/policies/provider-processing-policy.v6.json', '10e69a5d7b027d077728ec1bc7393dc0583b99a05246b4e883098b9d96b221a4'],
  'developer-live': ['v8', 'docs/policies/provider-processing-policy.v8.json', '2465416a5d0a95ef61c3f6a8e628edc3cd3e2bf3f108d690627f299cb6239232'],
} as const;
/** ADR 0079 §3 decides External Export v2; active-set v6 keeps v5's exact pin of its bytes. */
const EXPECTED_EXTERNAL_PIN = ['v2', 'docs/policies/external-export-policy.v2.json', '162441cc3e5d30b0cafb00a0d04ca5ab32b64c5039baafc8952a9925bd7984b6'] as const;
const ACTIVE_SET_SHA256 = 'fbb0649bb533d993b595ce39ea7872397f88e05b21396b69a79ea8283b547d5a';
/** The v5 set every earlier row names, kept as immutable predecessor history and selected by nothing. */
const PREDECESSOR_SET_SHA256 = '8329eda368d4870c552bdc792a74f0035a2dc8da818c37617902fa0af7368f8a';
/** The platform tools the v8 analysis rule names, exactly as ADR 0080 §7.5 writes them. */
const V8_PLATFORM_TOOLS = {
  websearch: { service: 'parallel', host: 'search.parallel.ai', tool: 'web_search', anonymous: true },
  webfetch: { maxBytes: 5_242_880, timeoutSeconds: 30, boundedByCitations: true },
};

let sandbox: string;
let codeRoot: string;

async function placeBuiltFile(relativePath: string): Promise<void> {
  const target = join(codeRoot, ...relativePath.split('/'));
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(REPO_ROOT, ...relativePath.split('/')), target);
}

async function placeValidCheckout(): Promise<void> {
  for (const relativePath of CARRIED_PATHS) await placeBuiltFile(relativePath);
}

const V8_PATH = 'docs/policies/provider-processing-policy.v8.json';
const V5_PATH = 'docs/policies/provider-processing-policy.v5.json';
const V7_PATH = 'docs/policies/provider-processing-policy.v7.json';

type PolicyDocument = Record<string, unknown> & { decision: { providerAllowRules: Array<Record<string, unknown>> } };

async function policyOf(path: string): Promise<PolicyDocument> {
  return JSON.parse(await readFile(join(REPO_ROOT, ...path.split('/')), 'utf8')) as PolicyDocument;
}

/**
 * The exact v8 document with the given fields of one rule overridden. The digests the resolver checks are
 * constants of `launch-policy.ts`, so a policy revision could never be fed through
 * `resolveSourceCheckoutLaunchPolicy`; the reading of the rules' exact fields is therefore pinned against
 * the verification function itself, over the real bytes with one field varied.
 */
async function v8PolicyWithRule(index: 0 | 1, overrides: Readonly<Record<string, unknown>>): Promise<PolicyDocument> {
  const v8 = await policyOf(V8_PATH);
  Object.assign(v8.decision.providerAllowRules[index]!, overrides);
  return v8;
}

/** The exact v8 document with the given `transmissions` keys of one rule overridden. */
async function v8PolicyWithTransmissions(index: 0 | 1, overrides: Readonly<Record<string, unknown>>): Promise<PolicyDocument> {
  const v8 = await policyOf(V8_PATH);
  const rule = v8.decision.providerAllowRules[index]!;
  rule.transmissions = { ...(rule.transmissions as Record<string, unknown>), ...overrides };
  return v8;
}

function expectZeroTransmission(projection: LaunchPolicyProjection): void {
  expect(projection.providerProcessing.decision).toBe('deny');
  expect(projection.providerProcessing.liveTransmissionAllowed).toBe(false);
  expect(projection.providerProcessing.authorizedLiveTransmissionCount).toBe(0);
  expect(projection.providerProcessing.platformTools ?? null).toBeNull();
  expect(projection.providerProcessing.webSearchToolAllowed ?? false).toBe(false);
  expect(projection.externalExport.policyEligibilityIsEffectApproval).toBe(false);
  // Issue #413: a local export Effect is offered exactly when External Export Policy v2 verified at this launch;
  // eligibility is still never an approval, and every denial offers none.
  expect(projection.externalExport.currentExportEffectAvailable).toBe(projection.integrityState === 'verified');
  expect(projection.externalExport.label).toBe(projection.integrityState === 'verified'
    ? '对外导出策略 v2 已校验：只导出到本机所选位置，每个文件单独批准'
    : '对外导出策略独立；当前未提供导出受控动作');
  expect(projection.publicReleasePermission.present).toBe(false);
}

async function sha256Of(relativePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(join(REPO_ROOT, ...relativePath.split('/')))).digest('hex');
}

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-launch-policy-test-'));
  codeRoot = join(sandbox, 'checkout');
  await mkdir(codeRoot);
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('active policy set v6', () => {
  it('is the sole active set: the carrier pins it, it maps all four scopes, and every pin matches the exact bytes', async () => {
    const carrier = JSON.parse(await readFile(join(REPO_ROOT, ...CARRIER_PATH.split('/')), 'utf8')) as Record<string, unknown>;
    expect(carrier).toEqual({
      manifestType: 'ai7-source-checkout-launch-authority',
      version: 2,
      runtimeForm: 'source-checkout',
      trustedOperationalScope: 'development-ci',
      launchSelectableScopes: ['development-ci', 'developer-live'],
      activePolicySet: { version: 'v6', canonicalPath: ACTIVE_SET_PATH, sha256: ACTIVE_SET_SHA256 },
    });
    expect(await sha256Of(ACTIVE_SET_PATH)).toBe(ACTIVE_SET_SHA256);
    const activeSet = JSON.parse(await readFile(join(REPO_ROOT, ...ACTIVE_SET_PATH.split('/')), 'utf8')) as {
      version: string;
      predecessorVersion: string;
      predecessorCanonicalPath: string;
      activePolicies: {
        'provider-processing-policy': { scopePins: Record<string, { version: string; canonicalPath: string; sha256: string }> };
        'external-export-policy': { version: string; canonicalPath: string; sha256: string };
      };
    };
    expect(activeSet.version).toBe('v6');
    // v5 is the predecessor, byte-preserved and selected by nothing.
    expect(activeSet.predecessorVersion).toBe('v5');
    expect(activeSet.predecessorCanonicalPath).toBe('docs/policies/active-policy-set.v5.json');
    expect(await sha256Of('docs/policies/active-policy-set.v5.json')).toBe(PREDECESSOR_SET_SHA256);
    const pins = activeSet.activePolicies['provider-processing-policy'].scopePins;
    expect(Object.keys(pins)).toEqual(Object.keys(EXPECTED_PINS));
    for (const [scope, [version, canonicalPath, sha256]] of Object.entries(EXPECTED_PINS)) {
      expect(pins[scope]).toMatchObject({ version, canonicalPath, sha256 });
      expect(await sha256Of(canonicalPath)).toBe(sha256);
    }
    const [externalVersion, externalPath, externalSha256] = EXPECTED_EXTERNAL_PIN;
    expect(activeSet.activePolicies['external-export-policy']).toMatchObject({
      version: externalVersion,
      canonicalPath: externalPath,
      sha256: externalSha256,
    });
    expect(await sha256Of(externalPath)).toBe(externalSha256);
  });

  it('selects v8, whose analysis rule is v7 byte for byte and whose second rule is the dialogue rule of ADR 0088', async () => {
    const [v7, v8] = await Promise.all([policyOf(V7_PATH), policyOf(V8_PATH)]);
    expect(v8.version).toBe('v8');
    expect(v8.predecessorVersion).toBe('v7');
    expect(v8.decision.providerAllowRules).toHaveLength(2);
    expect(v8.decision.providerAllowRules[0]).toEqual(v7.decision.providerAllowRules[0]);
    expect(v8.decision.providerAllowRules[1]!.ruleId).toBe(DEVELOPER_LIVE_POLICY_BINDING.dialogueRuleId);
    // Every other field is v7's except the identity fields, the authority basis (plus ADR 0088) and the one new category.
    const movedKeys = new Set(['schemaPath', 'version', 'predecessorVersion', 'predecessorCanonicalPath', 'canonicalPath', 'humanProjectionPath', 'authorityBasis', 'decision', 'outboundDataCategories']);
    for (const key of Object.keys(v7)) {
      if (!movedKeys.has(key)) expect(v8[key], key).toEqual(v7[key]);
    }
    expect(v8.authorityBasis).toEqual([...(v7.authorityBasis as string[]).slice(0, -1), 'docs/adr/0088-carry-the-editorial-dialogue-under-developer-live.md', 'docs/architecture-v2/HARNESS-INTEGRATION.md']);
    expect(v8.outboundDataCategories).toEqual({ ...(v7.outboundDataCategories as object), 'editor-selected-manuscript-excerpt': { labelZh: '编辑所选稿件选段' } });
  });

  it('declares the exact developer-live binding the v8 policy bytes carry', () => {
    expect(DEVELOPER_LIVE_POLICY_BINDING.route).toBe('opencode-go');
    expect(DEVELOPER_LIVE_POLICY_BINDING.model).toBe('deepseek-v4-flash');
    expect(DEVELOPER_LIVE_POLICY_BINDING.endpoint).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    expect(DEVELOPER_LIVE_POLICY_BINDING.credentialSlot).toBe('opencode-go');
    // ADR 0070 as ADR 0080 §7.4 sizes it: 90,000 tokens per frozen unit under v8, three times v5's 30,000.
    expect(DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit).toBe(90_000);
    expect(DEVELOPER_LIVE_POLICY_BINDING.websearchHost).toBe('search.parallel.ai');
    expect(DEVELOPER_LIVE_POLICY_BINDING.dialogueRuleId).toBe('developer-live-editor-selected-excerpt-dialogue');
  });
});

describe('resolveSourceCheckoutLaunchPolicy', () => {
  it('verifies a complete source-checkout carrier and pins the development-ci scope by default', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('development-ci');
    expect(projection.activePolicySetVersion).toBe('v6');
    expect(projection.providerProcessing.version).toBe('v1');
    expect(projection.providerProcessing.label).toBe('开发与持续集成：零次实时传输');
    expect(projection.externalExport.version).toBe('v2');
    expectZeroTransmission(projection);
    expect(await resolveSourceCheckoutLaunchPolicy(codeRoot, 'development-ci')).toEqual(projection);
  });

  it('binds the developer-live scope to Provider Processing v8 as eligible-only with the three named suboperations and the platform tools', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('developer-live');
    expect(projection.activePolicySetVersion).toBe('v6');
    expect(projection.providerProcessing).toEqual({
      version: 'v8',
      decision: 'eligible-only',
      authorizedLiveTransmissionCount: 'bounded-by-run',
      liveTransmissionAllowed: true,
      // ADR 0079 §2.1: the analysis rule names all three declared suboperations (ADR 0066) `true`; the reduction,
      // the assurance sample and the reflection turn each dispatch inside the bound of §2.2.
      crossUnitReductionAllowed: true,
      assuranceSamplingAllowed: true,
      runReportReflectionAllowed: true,
      // ADR 0080 §7.5 (Issue #473): the switch is on and the block is read from the bytes — the service entry arms
      // `websearch.host` and the execution owner may register the tools for a declaring kind.
      webSearchToolAllowed: true,
      platformTools: V8_PLATFORM_TOOLS,
      label: '开发者实时：实时传输受运行边界约束',
    });
    expect(projection.externalExport.version).toBe('v2');
    expect(projection.externalExport.currentExportEffectAvailable).toBe(true);
    expect(projection.externalExport.policyEligibilityIsEffectApproval).toBe(false);
    expect(projection.publicReleasePermission.present).toBe(false);
  });

  it('reads the three named suboperations under developer-live and none under development-ci', async () => {
    await placeValidCheckout();
    for (const scope of ['development-ci', 'developer-live'] as const) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope);
      expect(projection.integrityState).toBe('verified');
      // v1 authorizes zero transmissions; the v8 bytes name all three.
      const named = scope === 'developer-live';
      expect(projection.providerProcessing.crossUnitReductionAllowed).toBe(named);
      expect(projection.providerProcessing.assuranceSamplingAllowed).toBe(named);
      expect(projection.providerProcessing.runReportReflectionAllowed).toBe(named);
      // The platform tools exist only in the developer-live reading; development-ci names none and switches nothing on.
      expect(projection.providerProcessing.platformTools ?? null).toEqual(named ? V8_PLATFORM_TOOLS : null);
      expect(projection.providerProcessing.webSearchToolAllowed ?? false).toBe(named);
    }
    // The denial carries the same reading, so no unreadable launch can turn any step on.
    const denied = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production' as TrustedOperationalScope);
    expect(denied.integrityState).toBe('denied');
    expect(denied.providerProcessing.crossUnitReductionAllowed).toBe(false);
    expect(denied.providerProcessing.assuranceSamplingAllowed).toBe(false);
    expect(denied.providerProcessing.runReportReflectionAllowed).toBe(false);
    expectZeroTransmission(denied);
  });

  it('refuses any v8 reading whose named fields are not the pinned bytes', async () => {
    // The exact document names all three suboperations, switches web search on for the analysis rule and names the tools.
    const asIs = await policyOf(V8_PATH);
    expect(verifyDeveloperLivePolicy(asIs)).toEqual({
      crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true,
      webSearchToolAllowed: true, platformTools: V8_PLATFORM_TOOLS,
    });

    // Every one of the three, falsified or made unreadable, is a policy the launch cannot read: the
    // reading is the exact v8 bytes, never a permissive default.
    for (const key of ['crossUnitReductionAllowed', 'assuranceSamplingAllowed', 'runReportReflectionAllowed'] as const) {
      for (const value of [false, undefined, 'true', 1, null, {}, []]) {
        await expect(v8PolicyWithTransmissions(0, { [key]: value }).then(verifyDeveloperLivePolicy))
          .rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
    }
    // The analysis rule's web-search switch is `true` in v8 (ADR 0080 §7.5); a document with it off is v5's reading.
    await expect(v8PolicyWithTransmissions(0, { webSearchToolAllowed: false }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
    // The block must name the pinned search host; another host, or no block at all, is unreadable.
    await expect(v8PolicyWithRule(0, { platformTools: undefined }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    await expect(v8PolicyWithRule(0, { platformTools: { ...V8_PLATFORM_TOOLS, websearch: { ...V8_PLATFORM_TOOLS.websearch, host: 'mcp.exa.ai' } } }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
    // The house-people redaction rule is part of the pinned document too.
    await expect(v8PolicyWithRule(0, { redaction: undefined }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    await expect(v8PolicyWithRule(0, { redaction: { housePeopleNamesAndRolesStripped: false, remarksAndInternalNotesStripped: true, authorInformationAllowed: true, houseNameAllowed: true } }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
    // And the per-frozen-unit default is the one ADR 0080 §7.4 sizes, not v5's 30,000 and not the replaced flat 500,000.
    for (const perUnit of [30_000, 500_000]) {
      const moved = await policyOf(V8_PATH);
      (moved.decision.providerAllowRules[0]!.authorizationPreconditions as Record<string, unknown>)['defaultRunBudgetCeilingTokensPerFrozenUnit'] = perUnit;
      expect(() => verifyDeveloperLivePolicy(moved)).toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('refuses a one-rule document — v5 and the never-selected v7 — and any v8 whose dialogue rule is not the ADR 0088 terms', async () => {
    // Exactly two rules (ADR 0088 §3): the one-rule documents are not the pinned document whatever their other bytes say.
    for (const path of [V5_PATH, V7_PATH]) {
      const oneRuleDocument = await policyOf(path);
      expect(() => verifyDeveloperLivePolicy(oneRuleDocument)).toThrow('LAUNCH_POLICY_INVALID');
    }
    const oneRule = await policyOf(V8_PATH);
    oneRule.decision.providerAllowRules = [oneRule.decision.providerAllowRules[0]!];
    expect(() => verifyDeveloperLivePolicy(oneRule)).toThrow('LAUNCH_POLICY_INVALID');
    const threeRules = await policyOf(V8_PATH);
    threeRules.decision.providerAllowRules = [...threeRules.decision.providerAllowRules, threeRules.decision.providerAllowRules[1]!];
    expect(() => verifyDeveloperLivePolicy(threeRules)).toThrow('LAUNCH_POLICY_INVALID');
    // The dialogue rule's web-search switch is `false` (ADR 0088 §1.5): row 18's permission is not taken up here.
    await expect(v8PolicyWithTransmissions(1, { webSearchToolAllowed: true }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    // One transmission over one Session per attempt (§1.2).
    await expect(v8PolicyWithTransmissions(1, { oneTransmissionPerAttempt: false }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    await expect(v8PolicyWithTransmissions(1, { oneTechnicalSessionPerAttempt: false }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    // No plan and no Run Authorization (§1.1): a dialogue rule that required either is not this rule.
    for (const key of ['planEnvelopeRequired', 'runAuthorizationRequired', 'runBudgetCeilingApplies']) {
      const moved = await policyOf(V8_PATH);
      (moved.decision.providerAllowRules[1]!.authorizationPreconditions as Record<string, unknown>)[key] = true;
      expect(() => verifyDeveloperLivePolicy(moved)).toThrow('LAUNCH_POLICY_INVALID');
    }
    // The excerpt category, and only it (§1.4).
    await expect(v8PolicyWithRule(1, { allowedOutboundDataCategories: ['public-or-synthetic'] }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    await expect(v8PolicyWithRule(1, { allowedOutboundDataCategories: ['editor-selected-manuscript-excerpt', 'public-or-synthetic'] }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    // The binding carried unchanged from the analysis rule (§1.5): a second model or another route is unreadable.
    const otherBinding = await policyOf(V8_PATH);
    (otherBinding.decision.providerAllowRules[1]!.providerBinding as Record<string, unknown>)['model'] = 'deepseek-v4-pro';
    expect(() => verifyDeveloperLivePolicy(otherBinding)).toThrow('LAUNCH_POLICY_INVALID');
    // The rule id itself.
    await expect(v8PolicyWithRule(1, { ruleId: 'developer-live-dialogue' }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
  });

  it('reads the execution mode of both rules and the dialogue rule\'s cap byte exactly (#742 review, P3-4)', async () => {
    // Human-attended on a developer host, never CI, hosted, scheduled or background — for the analysis rule and the
    // dialogue rule alike: a document admitting a scheduled or background dispatch under either is unreadable.
    for (const index of [0, 1] as const) {
      for (const key of ['scheduledAllowed', 'backgroundAllowed', 'ciAllowed', 'hostedAllowed']) {
        const moved = await policyOf(V8_PATH);
        (moved.decision.providerAllowRules[index]!.executionMode as Record<string, unknown>)[key] = true;
        expect(() => verifyDeveloperLivePolicy(moved), `${index}/${key}`).toThrow('LAUNCH_POLICY_INVALID');
      }
      for (const key of ['humanAttended', 'developerHostOnly']) {
        const moved = await policyOf(V8_PATH);
        (moved.decision.providerAllowRules[index]!.executionMode as Record<string, unknown>)[key] = false;
        expect(() => verifyDeveloperLivePolicy(moved), `${index}/${key}`).toThrow('LAUNCH_POLICY_INVALID');
      }
    }
    // The per-attempt output cap (ADR 0088 §1.6) is `null` or a positive whole token count — the Owner's byte, read as such.
    for (const cap of [4_000, 1, 200_000]) {
      const capped = await policyOf(V8_PATH);
      (capped.decision.providerAllowRules[1]!.authorizationPreconditions as Record<string, unknown>)['perAttemptOutputCapTokens'] = cap;
      expect(verifyDeveloperLivePolicy(capped).webSearchToolAllowed).toBe(true);
    }
    for (const cap of [0, -1, 1.5, '4000', true, undefined, {}, Number.MAX_SAFE_INTEGER + 1]) {
      const moved = await policyOf(V8_PATH);
      (moved.decision.providerAllowRules[1]!.authorizationPreconditions as Record<string, unknown>)['perAttemptOutputCapTokens'] = cap;
      expect(() => verifyDeveloperLivePolicy(moved), String(cap)).toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('denies the scopes the source checkout cannot select and any unknown scope', async () => {
    await placeValidCheckout();
    for (const scope of ['fixture-recording', 'ordinary-production', 'production', 'DEVELOPER-LIVE', '']) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope as TrustedOperationalScope);
      expect(projection.integrityState).toBe('denied');
      expect(projection.denialReason).toBe('launch-scope-not-selectable');
      expect(projection.operationalScope).toBeNull();
      expectZeroTransmission(projection);
    }
  });

  it('denies a checkout with no carrier', async () => {
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);

    expect(projection.integrityState).toBe('denied');
    expect(projection.denialReason).toBe('launch-policy-integrity-denied');
    expect(projection.operationalScope).toBeNull();
    expect(projection.activePolicySetVersion).toBeNull();
    expect(projection.providerProcessing.version).toBeNull();
    expectZeroTransmission(projection);
  });

  it('denies a carrier that declares the wrong manifestType or still pins active-set v5', async () => {
    await placeValidCheckout();
    const carrierTarget = join(codeRoot, ...CARRIER_PATH.split('/'));
    const carrier = JSON.parse(await readFile(carrierTarget, 'utf8')) as Record<string, unknown>;
    await writeFile(carrierTarget, JSON.stringify({ ...carrier, manifestType: 'ai7-some-other-launch-authority' }));
    expect(await resolveSourceCheckoutLaunchPolicy(codeRoot)).toMatchObject({ integrityState: 'denied', denialReason: 'launch-policy-integrity-denied' });

    // The predecessor set is byte-preserved in the checkout and still not a selection: a carrier that names it is stale.
    await writeFile(carrierTarget, JSON.stringify({
      ...carrier,
      activePolicySet: { version: 'v5', canonicalPath: 'docs/policies/active-policy-set.v5.json', sha256: PREDECESSOR_SET_SHA256 },
    }));
    for (const scope of ['development-ci', 'developer-live'] as const) {
      const stale = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope);
      expect(stale.integrityState).toBe('denied');
      expectZeroTransmission(stale);
    }
  });

  it('denies a tampered active policy set whose digest no longer matches its pin, under both scopes', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, ...ACTIVE_SET_PATH.split('/'));
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);

    for (const scope of ['development-ci', 'developer-live'] as const) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope);
      expect(projection.integrityState).toBe('denied');
      expect(projection.denialReason).toBe('launch-policy-integrity-denied');
      expectZeroTransmission(projection);
    }
  });

  it('denies a developer-live launch whose v8 policy bytes drifted, while development-ci still verifies', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, 'docs', 'policies', 'provider-processing-policy.v8.json');
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);

    const live = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');
    expect(live.integrityState).toBe('denied');
    expectZeroTransmission(live);
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).integrityState).toBe('verified');
  });

  it('denies a developer-live launch whose checkout still carries v5 where v8 is pinned', async () => {
    await placeValidCheckout();
    // v5's exact bytes placed at v8's path: the digest pin refuses before a byte of the decision is read.
    await copyFile(join(REPO_ROOT, ...V5_PATH.split('/')), join(codeRoot, 'docs', 'policies', 'provider-processing-policy.v8.json'));
    const live = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');
    expect(live.integrityState).toBe('denied');
    expectZeroTransmission(live);
  });

  it('denies a checkout whose pinned policy document is missing', async () => {
    await placeValidCheckout();
    await rm(join(codeRoot, 'docs', 'policies', 'external-export-policy.v2.json'));

    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);
    expect(projection.integrityState).toBe('denied');
    expectZeroTransmission(projection);
  });
});
