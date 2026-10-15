import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_SET_VERSION,
  DEVELOPER_LIVE_POLICY_BINDING,
  DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION,
  ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION,
  bindOrdinaryProductionRules,
  resolveSourceCheckoutLaunchPolicy,
  verifyDeveloperLivePolicy,
  verifyOrdinaryProductionPolicy,
  type ConfiguredProviderBinding,
} from '../../src/service/launch-policy.js';
import { LAUNCH_SELECTABLE_SCOPES, parseTrustedLaunchForm } from '../../src/shared/protocol.js';
import type { AdmittedProviderRule, LaunchPolicyProjection, TrustedOperationalScope } from '../../src/shared/protocol.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v10.json';
const CARRIED_PATHS = [
  CARRIER_PATH,
  ACTIVE_SET_PATH,
  'docs/policies/provider-processing-policy.v1.json',
  'docs/policies/provider-processing-policy.v2.json',
  'docs/policies/provider-processing-policy.v3.json',
  'docs/policies/provider-processing-policy.v4.json',
  'docs/policies/provider-processing-policy.v12.json',
  'docs/policies/provider-processing-policy.v13.json',
  'docs/policies/external-export-policy.v1.json',
  'docs/policies/external-export-policy.v2.json',
] as const;
/** The exact pins active-set v10 records; the resolver and the carrier must agree with the bytes. */
const EXPECTED_PINS = {
  'development-ci': ['v1', 'docs/policies/provider-processing-policy.v1.json', 'd9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a'],
  'fixture-recording': ['v2', 'docs/policies/provider-processing-policy.v2.json', 'd0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc'],
  'ordinary-production': ['v13', 'docs/policies/provider-processing-policy.v13.json', '465f6bb3b43d522c2464f0589e6302600799192ee46ba17df23269f08f94ea3e'],
  'developer-live': ['v12', 'docs/policies/provider-processing-policy.v12.json', '9bc27046af27c2967482c51ec4850668df13154a8c8e3ad94bdcb6fae3b47b2c'],
} as const;
/** Every immutable predecessor asset keeps its exact bytes: v6 (the old ordinary-production), v11 (the old developer-live) and set v9. */
const RETAINED_PREDECESSOR_DIGESTS = {
  'docs/policies/provider-processing-policy.v6.json': '10e69a5d7b027d077728ec1bc7393dc0583b99a05246b4e883098b9d96b221a4',
  'docs/policies/provider-processing-policy.v11.json': '38cc8044f10517bd3c152237256cd0cd7fe6cf8a4ef7ad340099a087ac8a8634',
  'docs/policies/active-policy-set.v9.json': 'b13013bbd0b9b1cb0fdd7b88d0d349d9c010d3043e867c547a81f37ed3d5cb0b',
} as const;
/** ADR 0079 §3 decides External Export v2; active-set v10 pins its exact bytes, unchanged since v7. */
const EXPECTED_EXTERNAL_PIN = ['v2', 'docs/policies/external-export-policy.v2.json', '162441cc3e5d30b0cafb00a0d04ca5ab32b64c5039baafc8952a9925bd7984b6'] as const;
const ACTIVE_SET_SHA256 = 'e1bb81956a46fc9dad3f761943d94f1b68802549ed6838fde7efa7e711584487';

const GO_BINDING = {
  route: 'opencode-go',
  endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
  model: 'deepseek-v4.1-flash',
  credentialSlot: 'opencode-go',
} as const;
/** The rules v12 carries from v11 unchanged (baseline analysis, editorial dialogue, 润色, conflict regeneration), as the projection states them. */
const V12_UNCHANGED_RULES: Record<string, AdmittedProviderRule> = {
  baseline: {
    ruleId: 'developer-live-public-samplebook-analysis',
    taskKinds: ['baseline-manuscript-analysis'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: false,
    editorialDeliverablesAllowed: false,
  },
  dialogue: {
    ruleId: 'developer-live-public-samplebook-editorial-dialogue',
    taskKinds: ['editorial-dialogue'],
    modelRole: 'Fast Interaction Role',
    ...GO_BINDING,
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: false,
    editorialDeliverablesAllowed: false,
  },
  polish: {
    ruleId: 'developer-live-public-samplebook-editorial-polish',
    taskKinds: ['editorial-polish'],
    modelRole: 'Fast Interaction Role',
    ...GO_BINDING,
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: false,
    editorialDeliverablesAllowed: false,
  },
  conflict: {
    ruleId: 'developer-live-public-samplebook-conflict-regenerate',
    taskKinds: ['conflict-regenerate'],
    modelRole: 'Fast Interaction Role',
    ...GO_BINDING,
    outboundDataCategories: ['manuscript-conflict-region-excerpt'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: false,
    editorialDeliverablesAllowed: false,
  },
};
/** The three rules v12 changes (Issue #853): the review rule gains cross-deliverable consistency and two categories; writing and evaluation gain frozen Material Reference excerpts. */
const V12_CHANGED_RULES: Record<string, AdmittedProviderRule> = {
  review: {
    ruleId: 'developer-live-public-samplebook-reference-free-review',
    taskKinds: ['editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression', 'editorial-review/cross-deliverable-consistency'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic', 'frozen-material-reference-excerpt', 'editorial-deliverable-excerpt'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: true,
    editorialDeliverablesAllowed: true,
  },
  writing: {
    ruleId: 'developer-live-public-samplebook-writing',
    taskKinds: ['writing'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt'],
    crossUnitSynthesisAllowed: true,
    materialReferencesAllowed: true,
    editorialDeliverablesAllowed: false,
  },
  evaluation: {
    ruleId: 'developer-live-public-samplebook-evaluation',
    taskKinds: ['evaluation', 'readers-report', 'evaluation-rewrite'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt'],
    crossUnitSynthesisAllowed: true,
    materialReferencesAllowed: true,
    editorialDeliverablesAllowed: false,
  },
};
const V12_ADMITTED_RULES: AdmittedProviderRule[] = [
  V12_UNCHANGED_RULES.baseline!,
  V12_UNCHANGED_RULES.dialogue!,
  V12_CHANGED_RULES.review!,
  V12_CHANGED_RULES.writing!,
  V12_CHANGED_RULES.evaluation!,
  V12_UNCHANGED_RULES.polish!,
  V12_UNCHANGED_RULES.conflict!,
];

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

const V11_PATH = 'docs/policies/provider-processing-policy.v11.json';
const V12_PATH = 'docs/policies/provider-processing-policy.v12.json';
const V13_PATH = 'docs/policies/provider-processing-policy.v13.json';
const BASELINE = 0;
const DIALOGUE = 1;
const REVIEW = 2;
const WRITING = 3;
const EVALUATION = 4;
const POLISH = 5;
const CONFLICT = 6;

async function readPolicy(path: string = V12_PATH): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(REPO_ROOT, ...path.split('/')), 'utf8')) as Record<string, unknown>;
}

function rulesOf(policy: Record<string, unknown>): Array<Record<string, unknown>> {
  return (policy.decision as { providerAllowRules: Array<Record<string, unknown>> }).providerAllowRules;
}

/**
 * The exact v12 document with the given fields of one rule overridden. The digests the resolver checks are
 * constants of `launch-policy.ts`, so a policy revision could never be fed through
 * `resolveSourceCheckoutLaunchPolicy`; the reading of the rules' exact fields is therefore pinned
 * against the verification function itself, over the real bytes with one field varied.
 */
async function v12PolicyWithRule(index: number, overrides: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const policy = await readPolicy();
  Object.assign(rulesOf(policy)[index]!, overrides);
  return policy;
}

/** The exact v12 document with the given keys of one rule's named block overridden. */
async function v12PolicyWithBlock(index: number, block: string, overrides: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const policy = await readPolicy();
  const rule = rulesOf(policy)[index]!;
  rule[block] = { ...(rule[block] as Record<string, unknown>), ...overrides };
  return policy;
}

function expectZeroTransmission(projection: LaunchPolicyProjection): void {
  expect(projection.providerProcessing.decision).toBe('deny');
  expect(projection.providerProcessing.liveTransmissionAllowed).toBe(false);
  expect(projection.providerProcessing.authorizedLiveTransmissionCount).toBe(0);
  expect(projection.providerProcessing.admittedRules).toEqual([]);
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

describe('active policy set v10', () => {
  it('is the sole active set: the carrier pins it, it maps all four scopes, and every pin matches the exact bytes', async () => {
    expect(ACTIVE_SET_VERSION).toBe('v10');
    expect(DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION).toBe('v12');
    expect(ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION).toBe('v13');
    const carrier = JSON.parse(await readFile(join(REPO_ROOT, ...CARRIER_PATH.split('/')), 'utf8')) as Record<string, unknown>;
    expect(carrier).toEqual({
      manifestType: 'ai7-source-checkout-launch-authority',
      version: 2,
      runtimeForm: 'source-checkout',
      trustedOperationalScope: 'development-ci',
      launchSelectableScopes: ['development-ci', 'developer-live', 'ordinary-production'],
      activePolicySet: { version: 'v10', canonicalPath: ACTIVE_SET_PATH, sha256: ACTIVE_SET_SHA256 },
    });
    expect(LAUNCH_SELECTABLE_SCOPES).toEqual(carrier.launchSelectableScopes);
    expect(await sha256Of(ACTIVE_SET_PATH)).toBe(ACTIVE_SET_SHA256);
    const activeSet = JSON.parse(await readFile(join(REPO_ROOT, ...ACTIVE_SET_PATH.split('/')), 'utf8')) as {
      version: string;
      predecessorVersion: string;
      activePolicies: {
        'provider-processing-policy': { scopePins: Record<string, { version: string; canonicalPath: string; sha256: string }> };
        'external-export-policy': { version: string; canonicalPath: string; sha256: string };
      };
    };
    expect(activeSet.version).toBe('v10');
    expect(activeSet.predecessorVersion).toBe('v9');
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

  it('keeps every predecessor pin of active-set v9 except ordinary-production and developer-live byte-identical', async () => {
    const v9 = JSON.parse(await readFile(join(REPO_ROOT, 'docs', 'policies', 'active-policy-set.v9.json'), 'utf8')) as {
      activePolicies: { 'provider-processing-policy': { scopePins: Record<string, unknown> }; 'external-export-policy': unknown };
    };
    const v10 = JSON.parse(await readFile(join(REPO_ROOT, ...ACTIVE_SET_PATH.split('/')), 'utf8')) as typeof v9;
    for (const scope of ['development-ci', 'fixture-recording']) {
      expect(v10.activePolicies['provider-processing-policy'].scopePins[scope]).toEqual(v9.activePolicies['provider-processing-policy'].scopePins[scope]);
    }
    expect(v10.activePolicies['external-export-policy']).toEqual(v9.activePolicies['external-export-policy']);
    // The two moved pins are exactly the successors of the retained v6 and v11 pins.
    expect(v9.activePolicies['provider-processing-policy'].scopePins['ordinary-production']).toMatchObject({ version: 'v6' });
    expect(v9.activePolicies['provider-processing-policy'].scopePins['developer-live']).toMatchObject({ version: 'v11' });
  });

  it('leaves every retained predecessor asset this successor replaces byte-identical', async () => {
    for (const [path, digest] of Object.entries(RETAINED_PREDECESSOR_DIGESTS)) {
      expect(await sha256Of(path), path).toBe(digest);
    }
  });

  it('carries every v11 rule, role binding and category into v12 unchanged except the three widened rules and two new categories', async () => {
    const v11 = await readPolicy(V11_PATH);
    const v12 = await readPolicy();
    expect(v12.predecessorVersion).toBe('v11');
    expect(v12.predecessorCanonicalPath).toBe(V11_PATH);
    expect(v12.operationalScope).toBe('developer-live');
    for (const index of [BASELINE, DIALOGUE, POLISH, CONFLICT]) expect(rulesOf(v12)[index]).toEqual(rulesOf(v11)[index]);
    expect(v12.roleBindings).toEqual(v11.roleBindings);
    expect(v12.authoritySeparations).toEqual(v11.authoritySeparations);
    expect(v12.credentialBoundary).toEqual(v11.credentialBoundary);
    expect(v12.trustedSelection).toEqual(v11.trustedSelection);
    expect(v12.outboundDataCategories).toMatchObject(v11.outboundDataCategories as Record<string, unknown>);
    expect(Object.keys(v12.outboundDataCategories as Record<string, unknown>).slice(Object.keys(v11.outboundDataCategories as Record<string, unknown>).length))
      .toEqual(['frozen-material-reference-excerpt', 'editorial-deliverable-excerpt']);
    expect((v12.outboundDataCategories as Record<string, unknown>)['frozen-material-reference-excerpt']).toEqual({ labelZh: '资料库资料选段' });
    expect((v12.outboundDataCategories as Record<string, unknown>)['editorial-deliverable-excerpt']).toEqual({ labelZh: '编辑交付物选段' });
    expect(rulesOf(v12).map((rule) => rule.ruleId)).toEqual(V12_ADMITTED_RULES.map((rule) => rule.ruleId));

    // Each widened rule is its v11 self plus exactly the documented delta.
    const review = structuredClone(rulesOf(v11)[REVIEW]!);
    (review.source as Record<string, unknown>).materialReferencesAllowed = true;
    (review.source as Record<string, unknown>).editorialDeliverablesAllowed = true;
    (review.allowedOutboundDataCategories as string[]).push('frozen-material-reference-excerpt', 'editorial-deliverable-excerpt');
    (review.allowedTaskKinds as string[]).push('editorial-review/cross-deliverable-consistency');
    expect(rulesOf(v12)[REVIEW]).toEqual(review);
    for (const index of [WRITING, EVALUATION]) {
      const widened = structuredClone(rulesOf(v11)[index]!);
      (widened.source as Record<string, unknown>).materialReferencesAllowed = true;
      (widened.allowedOutboundDataCategories as string[]).push('frozen-material-reference-excerpt');
      expect(rulesOf(v12)[index]).toEqual(widened);
    }
  });

  it('declares the exact developer-live binding the v12 policy bytes carry', () => {
    expect(DEVELOPER_LIVE_POLICY_BINDING.route).toBe('opencode-go');
    expect(DEVELOPER_LIVE_POLICY_BINDING.model).toBe('deepseek-v4.1-flash');
    expect(DEVELOPER_LIVE_POLICY_BINDING.endpoint).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    expect(DEVELOPER_LIVE_POLICY_BINDING.credentialSlot).toBe('opencode-go');
    // ADR 0070 as ADR 0079 §2.3 lands it: 30,000 tokens per frozen unit, never the flat 500,000.
    expect(DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit).toBe(30_000);
  });
});

describe('resolveSourceCheckoutLaunchPolicy', () => {
  it('refuses widening any v12 rule\'s task, origin, material or attendance matrix', async () => {
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT]) {
      for (const override of [
        { allowedTaskKinds: [...(rulesOf(await readPolicy())[index]!.allowedTaskKinds as string[]), 'fact-check'] },
        { allowedOutboundDataCategories: ['public-or-synthetic', 'unpublished-excerpts'] },
        { authorityOrigin: { newlyUserInitiatedTaskRequired: false } },
        { executionMode: { humanAttended: true } },
      ]) {
        await expect(v12PolicyWithRule(index, override).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
    }
    // The web-bearing review categories and 书系一致性 stay outside the review rule; cross-deliverable consistency is inside it.
    for (const kind of ['editorial-review/factual-review', 'editorial-review/academic-integrity', 'editorial-review/publication-risk',
      'editorial-review/series-consistency']) {
      await expect(v12PolicyWithRule(REVIEW, { allowedTaskKinds: [...V12_CHANGED_RULES.review!.taskKinds, kind] }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
    await expect(v12PolicyWithRule(REVIEW, { allowedTaskKinds: V12_CHANGED_RULES.review!.taskKinds.slice(0, 3) }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
  });

  it('verifies a complete source-checkout carrier and pins the development-ci scope by default', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('development-ci');
    // One active set per launch: development-ci reports v10 while its Provider Processing pin stays v1.
    expect(projection.activePolicySetVersion).toBe('v10');
    expect(projection.providerProcessing.version).toBe('v1');
    expect(projection.providerProcessing.label).toBe('开发与持续集成：零次实时传输');
    expect(projection.providerProcessing.bindingState).toBeUndefined();
    expect(projection.externalExport.version).toBe('v2');
    expectZeroTransmission(projection);
    expect(await resolveSourceCheckoutLaunchPolicy(codeRoot, 'development-ci')).toEqual(projection);
  });

  it('binds the developer-live scope to Provider Processing v12 as eligible-only with its seven admitted rules', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('developer-live');
    expect(projection.activePolicySetVersion).toBe('v10');
    expect(projection.providerProcessing).toEqual({
      version: 'v12',
      decision: 'eligible-only',
      authorizedLiveTransmissionCount: 'bounded-by-run',
      liveTransmissionAllowed: true,
      // The baseline rule names all three declared suboperations (ADR 0066) `true`, as ADR 0079 §2.1 settled for v5; the
      // reduction, the assurance sample and the reflection turn each dispatch inside the bound of §2.2.
      crossUnitReductionAllowed: true,
      assuranceSamplingAllowed: true,
      runReportReflectionAllowed: true,
      admittedRules: V12_ADMITTED_RULES,
      label: '开发者实时：实时传输受运行边界约束',
    });
    expect(projection.providerProcessing.admittedRules).toHaveLength(7);
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
      // v1 authorizes zero transmissions; the v12 baseline rule names all three.
      const named = scope === 'developer-live';
      expect(projection.providerProcessing.crossUnitReductionAllowed).toBe(named);
      expect(projection.providerProcessing.assuranceSamplingAllowed).toBe(named);
      expect(projection.providerProcessing.runReportReflectionAllowed).toBe(named);
    }
    // The denial carries the same reading, so no unreadable launch can turn any step on.
    const denied = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'fixture-recording' as TrustedOperationalScope);
    expect(denied.integrityState).toBe('denied');
    expect(denied.providerProcessing.crossUnitReductionAllowed).toBe(false);
    expect(denied.providerProcessing.assuranceSamplingAllowed).toBe(false);
    expect(denied.providerProcessing.runReportReflectionAllowed).toBe(false);
    expect(denied.providerProcessing.admittedRules).toEqual([]);
  });

  it('reads N allow rules: the exact v12 bytes yield seven, and the immutable v11 bytes are no longer the pinned reading', async () => {
    expect(verifyDeveloperLivePolicy(await readPolicy())).toEqual({
      crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true,
      admittedRules: V12_ADMITTED_RULES,
    });
    // v11 stays an immutable predecessor but this launch reads v12 alone: its review, writing and evaluation rules differ.
    expect(() => verifyDeveloperLivePolicy(structuredClone(readPolicySync(V11_PATH)))).toThrow('LAUNCH_POLICY_INVALID');
  });

  it('refuses an unknown, repeated or missing rule, and a role the policy does not bind', async () => {
    const unknown = await v12PolicyWithRule(REVIEW, { ruleId: 'developer-live-public-samplebook-fact-check' });
    expect(() => verifyDeveloperLivePolicy(unknown)).toThrow('LAUNCH_POLICY_INVALID');
    const repeated = await readPolicy();
    rulesOf(repeated).push(structuredClone(rulesOf(repeated)[DIALOGUE]!));
    expect(() => verifyDeveloperLivePolicy(repeated)).toThrow('LAUNCH_POLICY_INVALID');
    const withoutBaseline = await readPolicy();
    rulesOf(withoutBaseline).splice(BASELINE, 1);
    expect(() => verifyDeveloperLivePolicy(withoutBaseline)).toThrow('LAUNCH_POLICY_INVALID');
    const empty = await readPolicy();
    rulesOf(empty).splice(0);
    expect(() => verifyDeveloperLivePolicy(empty)).toThrow('LAUNCH_POLICY_INVALID');
    // The dialogue's Fast Interaction Role must be bound to the same route in roleBindings.
    const unbound = await readPolicy();
    (unbound.roleBindings as Record<string, unknown>)['Fast Interaction Role'] = { bindingState: 'unbound-by-default', userConfigurable: true };
    expect(() => verifyDeveloperLivePolicy(unbound)).toThrow('LAUNCH_POLICY_INVALID');
    const noRoles = await readPolicy();
    delete noRoles.roleBindings;
    expect(() => verifyDeveloperLivePolicy(noRoles)).toThrow('LAUNCH_POLICY_INVALID');
    // No rule may name the unbound escalation or frontier role.
    for (const modelRole of ['Difficult Escalation Role', 'Frontier Model Role']) {
      const escalated = await readPolicy();
      const rule = rulesOf(escalated)[DIALOGUE]!;
      rule.providerBinding = { ...(rule.providerBinding as Record<string, unknown>), modelRole };
      expect(() => verifyDeveloperLivePolicy(escalated)).toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('refuses a dialogue or review reading that is not the pinned v12 bytes', async () => {
    for (const [index, block, overrides] of [
      [DIALOGUE, 'transmissions', { webSearchToolAllowed: true }],
      [DIALOGUE, 'transmissions', { automaticResendInsideStoppedSessionAllowed: true }],
      [DIALOGUE, 'transmissions', { oneBoundedPayloadPerAttempt: false }],
      [DIALOGUE, 'authorizationPreconditions', { finalProviderPayloadEgressGateRequired: false }],
      [DIALOGUE, 'authorityOrigin', { backgroundAnalysisEnrollmentAllowed: true }],
      [DIALOGUE, 'authorityOrigin', { admittedAttemptActions: ['ask', 'continue', 'regenerate', 'schedule'] }],
      [DIALOGUE, 'source', { privateManuscriptAllowed: true }],
      [DIALOGUE, 'providerBinding', { fallbackAllowed: true }],
      [REVIEW, 'transmissions', { webSearchToolAllowed: true }],
      [REVIEW, 'transmissions', { crossUnitReductionAllowed: true }],
      [REVIEW, 'source', { materialReferencesAllowed: false }],
      [REVIEW, 'source', { seriesKnowledgeAllowed: true }],
      [REVIEW, 'source', { editorialDeliverablesAllowed: false }],
      [REVIEW, 'source', { privateManuscriptAllowed: true }],
      [REVIEW, 'authorizationPreconditions', { unsetRunBudgetCeilingAllowed: true }],
      [REVIEW, 'providerBinding', { model: 'deepseek-v4-pro' }],
      [REVIEW, 'redaction', { housePeopleNamesAndRolesStripped: false }],
    ] as const) {
      await expect(v12PolicyWithBlock(index, block, overrides).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('refuses any baseline reading whose named fields are not the pinned bytes', async () => {
    // Every one of the three, falsified or made unreadable, is a policy the launch cannot read: the
    // reading is the exact bytes, never a permissive default.
    for (const key of ['crossUnitReductionAllowed', 'assuranceSamplingAllowed', 'runReportReflectionAllowed'] as const) {
      for (const value of [false, undefined, 'true', 1, null, {}, []]) {
        await expect(v12PolicyWithBlock(BASELINE, 'transmissions', { [key]: value }).then(verifyDeveloperLivePolicy))
          .rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
    }
    // The web-search allowance is `false` in v12, as in v5 and v9 (ADR 0079 §4.2, §6); an enabled flag is unreadable.
    await expect(v12PolicyWithBlock(BASELINE, 'transmissions', { webSearchToolAllowed: true }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
    // The house-people redaction rule is part of the pinned document too.
    await expect(v12PolicyWithRule(BASELINE, { redaction: undefined }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    await expect(v12PolicyWithRule(BASELINE, { redaction: { housePeopleNamesAndRolesStripped: false, remarksAndInternalNotesStripped: true, authorInformationAllowed: true, houseNameAllowed: true } }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
    // And the per-frozen-unit default is the one ADR 0070 derives, not the replaced flat 500,000.
    await expect(v12PolicyWithBlock(BASELINE, 'authorizationPreconditions', { defaultRunBudgetCeilingTokensPerFrozenUnit: 500_000 }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
  });

  it('denies the scopes the source checkout cannot select and any unknown scope', async () => {
    await placeValidCheckout();
    for (const scope of ['fixture-recording', 'production', 'DEVELOPER-LIVE', 'ORDINARY-PRODUCTION', '']) {
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

  it('denies a carrier that declares the wrong manifestType or still pins a predecessor active set', async () => {
    await placeValidCheckout();
    const carrierTarget = join(codeRoot, ...CARRIER_PATH.split('/'));
    const carrier = JSON.parse(await readFile(carrierTarget, 'utf8')) as Record<string, unknown>;
    await writeFile(carrierTarget, JSON.stringify({ ...carrier, manifestType: 'ai7-some-other-launch-authority' }));
    expect(await resolveSourceCheckoutLaunchPolicy(codeRoot)).toMatchObject({ integrityState: 'denied', denialReason: 'launch-policy-integrity-denied' });

    await writeFile(carrierTarget, JSON.stringify({
      ...carrier,
      version: 1,
      activePolicySet: { version: 'v3', canonicalPath: 'docs/policies/active-policy-set.v3.json', sha256: 'fe6d9f169b8afb4d7b08daca99ee666f41e406d18916980e57106189a33e7dcc' },
    }));
    const stale = await resolveSourceCheckoutLaunchPolicy(codeRoot);
    expect(stale.integrityState).toBe('denied');
    expectZeroTransmission(stale);

    // The immediate predecessor v9 is no longer the selection either.
    await placeBuiltFile('docs/policies/active-policy-set.v9.json');
    await writeFile(carrierTarget, JSON.stringify({
      ...carrier,
      activePolicySet: { version: 'v9', canonicalPath: 'docs/policies/active-policy-set.v9.json', sha256: await sha256Of('docs/policies/active-policy-set.v9.json') },
    }));
    for (const scope of ['development-ci', 'developer-live', 'ordinary-production'] as const) {
      const previous = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope);
      expect(previous.integrityState).toBe('denied');
      expectZeroTransmission(previous);
    }
  });

  it('denies a tampered active policy set whose digest no longer matches its pin, under every selectable scope', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, ...ACTIVE_SET_PATH.split('/'));
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);

    for (const scope of ['development-ci', 'developer-live', 'ordinary-production'] as const) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope);
      expect(projection.integrityState).toBe('denied');
      expect(projection.denialReason).toBe('launch-policy-integrity-denied');
      expectZeroTransmission(projection);
    }
  });

  it('denies a developer-live launch whose v12 policy bytes drifted, while development-ci still verifies', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, ...V12_PATH.split('/'));
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);

    const live = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');
    expect(live.integrityState).toBe('denied');
    expectZeroTransmission(live);
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).integrityState).toBe('verified');
  });

  it('denies a checkout whose pinned policy document is missing', async () => {
    await placeValidCheckout();
    await rm(join(codeRoot, 'docs', 'policies', 'external-export-policy.v2.json'));

    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);
    expect(projection.integrityState).toBe('denied');
    expectZeroTransmission(projection);
  });
});

describe('the rules Provider Processing v12 carries from v11 and widens (Issues #841, #853)', () => {
  it('admits matching Default Execution Rules only for writing quick start, with no background origin', async () => {
    const rules = rulesOf(await readPolicy());
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT]) {
      const expected = index === WRITING;
      expect((rules[index]!.authorityOrigin as Record<string, unknown>).matchingActiveDefaultExecutionRuleAllowed).toBe(expected);
      await expect(v12PolicyWithBlock(index, 'authorityOrigin', { matchingActiveDefaultExecutionRuleAllowed: !expected }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v12PolicyWithBlock(index, 'authorityOrigin', { backgroundAnalysisEnrollmentAllowed: true }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('names each rule\'s kinds, role, categories and book-level synthesis flag exactly', async () => {
    const reading = verifyDeveloperLivePolicy(await readPolicy());
    expect(reading.admittedRules.slice(3, 5)).toEqual([V12_CHANGED_RULES.writing, V12_CHANGED_RULES.evaluation]);
    expect(reading.admittedRules.filter((rule) => rule.crossUnitSynthesisAllowed).map((rule) => rule.taskKinds).flat())
      .toEqual(['writing', 'evaluation', 'readers-report', 'evaluation-rewrite']);
  });

  it('admits frozen Material Reference excerpts in review, writing and evaluation only, and editorial deliverables in review alone', async () => {
    const reading = verifyDeveloperLivePolicy(await readPolicy());
    const withMaterial = reading.admittedRules.filter((rule) => rule.outboundDataCategories.includes('frozen-material-reference-excerpt')).map((rule) => rule.ruleId);
    expect(withMaterial).toEqual([
      'developer-live-public-samplebook-reference-free-review',
      'developer-live-public-samplebook-writing',
      'developer-live-public-samplebook-evaluation',
    ]);
    expect(reading.admittedRules.filter((rule) => rule.outboundDataCategories.includes('editorial-deliverable-excerpt')).map((rule) => rule.ruleId))
      .toEqual(['developer-live-public-samplebook-reference-free-review']);
    // The projection carries the two source terms beside the categories (Issue #853, brief revision 2): a consumer admits a
    // material- or deliverable-bearing kind only under a rule stating the flag and listing the matching category, and the two
    // never disagree in the pinned bytes.
    const flagged = reading.admittedRules.filter((rule) => rule.materialReferencesAllowed).map((rule) => rule.ruleId);
    expect(flagged).toEqual(withMaterial);
    expect(reading.admittedRules.filter((rule) => rule.editorialDeliverablesAllowed).map((rule) => rule.ruleId))
      .toEqual(['developer-live-public-samplebook-reference-free-review']);
    for (const rule of reading.admittedRules) {
      expect(rule.materialReferencesAllowed, rule.ruleId).toBe(rule.outboundDataCategories.includes('frozen-material-reference-excerpt'));
      expect(rule.editorialDeliverablesAllowed, rule.ruleId).toBe(rule.outboundDataCategories.includes('editorial-deliverable-excerpt'));
    }
    for (const index of [REVIEW, WRITING, EVALUATION]) {
      // Each of the three needs its material term true; Series Knowledge stays refused everywhere.
      await expect(v12PolicyWithBlock(index, 'source', { materialReferencesAllowed: false }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v12PolicyWithBlock(index, 'source', { seriesKnowledgeAllowed: true }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
    for (const index of [WRITING, EVALUATION]) {
      await expect(v12PolicyWithBlock(index, 'source', { materialReferenceConsumptionRecheckRequired: true }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v12PolicyWithBlock(index, 'source', { editorialDeliverablesAllowed: true }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
    // Neither 润色 nor conflict regeneration nor the dialogue ever carries a Material Reference.
    for (const index of [POLISH, CONFLICT]) {
      await expect(v12PolicyWithBlock(index, 'source', { materialReferencesAllowed: true }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('refuses a writing or evaluation reading that drops or widens the synthesis, web, assurance, series or deliverable terms', async () => {
    for (const index of [WRITING, EVALUATION]) {
      for (const [block, overrides] of [
        ['transmissions', { crossUnitSynthesisAllowed: false }],
        ['transmissions', { plusOneCrossUnitSynthesisTurn: false }],
        ['transmissions', { crossUnitReductionAllowed: true }],
        ['transmissions', { assuranceSamplingAllowed: true }],
        ['transmissions', { plusAssuranceSampleAnchorUnits: true }],
        ['transmissions', { runReportReflectionAllowed: false }],
        ['transmissions', { webSearchToolAllowed: true }],
        ['source', { seriesKnowledgeAllowed: true }],
        ['source', { editorialDeliverablesAllowed: true }],
        ['source', { privateManuscriptAllowed: true }],
        ['authorizationPreconditions', { unsetRunBudgetCeilingAllowed: true }],
        ['providerBinding', { modelRole: 'Fast Interaction Role' }],
        ['providerBinding', { fallbackAllowed: true }],
      ] as const) {
        await expect(v12PolicyWithBlock(index, block, overrides).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
      // Any category beyond the declared ones, or one of another rule's, is a policy the launch cannot read.
      for (const category of ['unpublished-full-content', 'editor-selected-manuscript-excerpt', 'editorial-deliverable-excerpt']) {
        const categories = [...(rulesOf(await readPolicy())[index]!.allowedOutboundDataCategories as string[]), category];
        await expect(v12PolicyWithRule(index, { allowedOutboundDataCategories: categories }).then(verifyDeveloperLivePolicy))
          .rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
    }
  });

  it('keeps 润色 and conflict regeneration to Suggestions on the Fast Interaction Role over the editor\'s own words', async () => {
    for (const index of [POLISH, CONFLICT]) {
      for (const [block, overrides] of [
        ['output', { suggestionsOnly: false }],
        ['output', { appliesManuscriptChange: true }],
        ['transmissions', { crossUnitSynthesisAllowed: true }],
        ['transmissions', { crossUnitReductionAllowed: true }],
        ['transmissions', { assuranceSamplingAllowed: true }],
        ['transmissions', { runReportReflectionAllowed: true }],
        ['authorizationPreconditions', { runBudgetCeilingApplies: true }],
        ['transmissions', { oneBoundedPayloadPerAttempt: false }],
        ['transmissions', { automaticResendInsideStoppedSessionAllowed: true }],
        ['transmissions', { webSearchToolAllowed: true }],
        ['source', { [index === POLISH ? 'editorSelectedPassageOnly' : 'singleManuscriptConflictRegionOnly']: false }],
        ['source', { materialReferencesAllowed: true }],
        ['source', { seriesKnowledgeAllowed: true }],
        ['source', { editorialDeliverablesAllowed: true }],
        ['authorityOrigin', { foregroundEditorActionRequired: false }],
        ['authorityOrigin', { backgroundAnalysisEnrollmentAllowed: true }],
        ['authorizationPreconditions', { finalProviderPayloadEgressGateRequired: false }],
        ['providerBinding', { modelRole: 'Main Editorial Role' }],
      ] as const) {
        await expect(v12PolicyWithBlock(index, block, overrides).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
      await expect(v12PolicyWithRule(index, { output: undefined }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v12PolicyWithRule(index, { allowedTaskKinds: [index === POLISH ? 'conflict-regenerate' : 'editorial-polish'] }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('keeps the review rule free of any synthesis turn and of the house exemplar category', async () => {
    const categories = [...(rulesOf(await readPolicy())[REVIEW]!.allowedOutboundDataCategories as string[]), 'house-exemplar-excerpt'];
    await expect(v12PolicyWithRule(REVIEW, { allowedOutboundDataCategories: categories }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    expect(V12_CHANGED_RULES.review!.crossUnitSynthesisAllowed).toBe(false);
  });
});

/** Provider Processing v13's two selectable bindings, as the document states them (the configuration the editor chooses from). */
const GO_PRODUCTION_BINDING: ConfiguredProviderBinding = { ...GO_BINDING, credentialReference: 'credential-ref-go-0001' };
const DEEPSEEK_PRODUCTION_BINDING: ConfiguredProviderBinding = {
  route: 'deepseek-open-platform',
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-flash',
  credentialSlot: 'deepseek-api-key',
  credentialReference: 'credential-ref-deepseek-0002',
};
const PRODUCTION_RULE_ID_ORDER = [
  'ordinary-production-baseline-analysis',
  'ordinary-production-editorial-dialogue',
  'ordinary-production-review',
  'ordinary-production-writing',
  'ordinary-production-evaluation',
  'ordinary-production-editorial-polish',
  'ordinary-production-conflict-regenerate',
];

/** The seven admitted rules the projection must state for one configured binding: v12's kinds, roles, gate categories and synthesis flags. */
function productionAdmittedRules(binding: ConfiguredProviderBinding): AdmittedProviderRule[] {
  const routing = { route: binding.route, endpoint: binding.endpoint, model: binding.model, credentialSlot: binding.credentialSlot };
  const sourceRules = V12_ADMITTED_RULES;
  return sourceRules.map((rule, index) => ({
    ruleId: PRODUCTION_RULE_ID_ORDER[index]!,
    taskKinds: rule.taskKinds,
    modelRole: rule.modelRole,
    ...routing,
    outboundDataCategories: [...rule.outboundDataCategories, 'unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content'],
    crossUnitSynthesisAllowed: rule.crossUnitSynthesisAllowed,
    materialReferencesAllowed: rule.materialReferencesAllowed,
    editorialDeliverablesAllowed: rule.editorialDeliverablesAllowed,
  }));
}

function readPolicySync(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, ...path.split('/')), 'utf8')) as Record<string, unknown>;
}

type Mutation = { readonly path: readonly (string | number)[]; readonly kind: string; readonly apply: (policy: Record<string, unknown>) => void };

/** Every single-term tampering of the sections the v13 reading owns: a primitive changed, a key dropped or added, a list shortened. */
function productionTamperings(policy: Record<string, unknown>): Mutation[] {
  const mutations: Mutation[] = [];
  const at = (root: Record<string, unknown>, path: readonly (string | number)[]): unknown => path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root);
  const walk = (value: unknown, path: (string | number)[]): void => {
    if (Array.isArray(value)) {
      mutations.push({ path, kind: 'drop-last-item', apply: (doc) => { (at(doc, path) as unknown[]).pop(); } });
      value.forEach((item, index) => walk(item, [...path, index]));
    } else if (value !== null && typeof value === 'object') {
      mutations.push({ path, kind: 'add-unknown-term', apply: (doc) => { (at(doc, path) as Record<string, unknown>).unknownTerm = true; } });
      for (const key of Object.keys(value)) {
        mutations.push({ path: [...path, key], kind: 'drop-term', apply: (doc) => { delete (at(doc, path) as Record<string, unknown>)[key]; } });
        walk((value as Record<string, unknown>)[key], [...path, key]);
      }
    } else {
      const parent = path.slice(0, -1);
      const key = path[path.length - 1]!;
      const change = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : `${String(value)}-tampered`;
      mutations.push({ path, kind: 'change-value', apply: (doc) => { (at(doc, parent) as Record<string | number, unknown>)[key] = change; } });
    }
  };
  for (const section of ['decision', 'roleBindings', 'trustedSelection', 'credentialBoundary', 'authoritySeparations', 'outboundDataCategories']) walk(policy[section], [section]);
  // A category's Chinese label is display text, pinned by the digest rather than read: changing it is not a tampering the reading owns.
  for (let index = mutations.length - 1; index >= 0; index -= 1) {
    if (mutations[index]!.kind === 'change-value' && mutations[index]!.path[0] === 'outboundDataCategories') mutations.splice(index, 1);
  }
  // The root: no term may be dropped and none added.
  mutations.push({ path: [], kind: 'add-unknown-term', apply: (doc) => { doc.unknownTerm = true; } });
  for (const key of Object.keys(policy)) mutations.push({ path: [key], kind: 'drop-term', apply: (doc) => { delete doc[key]; } });
  for (const term of ['operationalScope', 'lifecycleStatus']) {
    mutations.push({ path: [term], kind: 'change-value', apply: (doc) => { doc[term] = `${String(doc[term])}-tampered`; } });
  }
  return mutations;
}

describe('Provider Processing v13 (ordinary-production, Issue #853)', () => {
  it('is the direct successor of v6: same scope, local production, default deny and no background rule', async () => {
    const v13 = await readPolicy(V13_PATH);
    const v6 = await readPolicy('docs/policies/provider-processing-policy.v6.json');
    expect(v13.predecessorVersion).toBe('v6');
    expect(v13.predecessorCanonicalPath).toBe('docs/policies/provider-processing-policy.v6.json');
    expect(v13.operationalScope).toBe(v6.operationalScope);
    expect(v13.operationalScope).toBe('ordinary-production');
    expect((v13.decision as { default: string }).default).toBe('deny');
    expect(rulesOf(v13).map((rule) => rule.ruleId)).toEqual(PRODUCTION_RULE_ID_ORDER);
    expect(rulesOf(v13).some((rule) => JSON.stringify(rule).includes('enrolled-background') || rule.purpose === 'background-manuscript-analysis')).toBe(false);
    expect(v13.outboundDataCategories).toEqual((await readPolicy()).outboundDataCategories);
  });

  it('states the production terms rule by rule: human attended, the editor\'s own sources, no cache, no web, no default rule', async () => {
    const v13 = await readPolicy(V13_PATH);
    for (const rule of rulesOf(v13)) {
      const id = rule.ruleId as string;
      expect(rule.policyResult, id).toBe('eligible-only');
      expect(rule.purpose, id).toBe('ordinary-production-model-processing');
      expect(rule.executionMode, id).toEqual({ humanAttended: true, developerHostOnly: false, ciAllowed: false, hostedAllowed: false, scheduledAllowed: false, backgroundAllowed: false });
      const source = rule.source as Record<string, unknown>;
      expect(source.admittedInputs, id).toBe('user-owned-manuscripts-and-house-knowledge');
      expect(source.privateManuscriptAllowed, id).toBe(true);
      expect(source.seriesKnowledgeAllowed, id).toBe(false);
      expect(source.editorialDeliverablesAllowed, id).toBe(id === 'ordinary-production-review');
      expect(source.materialReferencesAllowed, id).toBe(['ordinary-production-review', 'ordinary-production-writing', 'ordinary-production-evaluation'].includes(id));
      const origin = rule.authorityOrigin as Record<string, unknown>;
      expect(origin.matchingActiveDefaultExecutionRuleAllowed, id).toBe(false);
      expect(origin.backgroundAnalysisEnrollmentAllowed, id).toBe(false);
      expect(origin.idleScheduledImportTriggeredOrCrossRunDispatchAllowed, id).toBe(false);
      const transmissions = rule.transmissions as Record<string, unknown>;
      expect(transmissions.webSearchToolAllowed, id).toBe(false);
      expect(transmissions.identicalRequestReplaysFromProviderResultCache, id).toBe(false);
      expect(transmissions.repeatedTestItemIdentifierAllowed, id).toBeUndefined();
      expect(rule.capture, id).toEqual({ fixtureEmissionAllowed: false, uploadAllowed: false, providerResultCacheAllowed: false, rawBytesInLogsDiagnosticsOrRepositoryAllowed: false, developmentCredentialCacheAndLedgerConsulted: false });
      expect(rule.providerAccountLimit, id).toMatchObject({ classification: 'quota-exhausted', retryAllowed: false, fallbackAllowed: false, secondModelAllowed: false });
      expect(rule.redaction, id).toEqual({ housePeopleNamesAndRolesStripped: true, remarksAndInternalNotesStripped: true, authorInformationAllowed: true, houseNameAllowed: true });
      expect(rule.allowedOutboundDataCategories as string[], id).toEqual(expect.arrayContaining(['unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content']));
      expect(rule.providerBinding, id).toMatchObject({
        bindingSource: 'user-configured-role-binding',
        allowedRoutes: ['opencode-go', 'deepseek-open-platform'],
        exactProviderBindingRequired: true,
        fallbackAllowed: false,
        secondModelAllowed: false,
      });
      expect((rule.providerBinding as Record<string, unknown>).route).toBeUndefined();
      expect((rule.providerBinding as Record<string, unknown>).model).toBeUndefined();
    }
    // A planned Run may leave its ceiling unset; when applied the default is 30,000 tokens per frozen unit (v6 semantics).
    for (const index of [BASELINE, REVIEW, WRITING, EVALUATION]) {
      expect(rulesOf(v13)[index]!.authorizationPreconditions).toMatchObject({ unsetRunBudgetCeilingAllowed: true, defaultRunBudgetCeilingTokensPerFrozenUnit: 30_000 });
    }
    // 书系一致性 and the web categories are named by no v13 rule; cross-deliverable consistency is the review rule's fourth kind.
    const kinds = rulesOf(v13).flatMap((rule) => rule.allowedTaskKinds as string[]);
    expect(kinds).toContain('editorial-review/cross-deliverable-consistency');
    for (const refused of ['editorial-review/series-consistency', 'editorial-review/factual-review', 'editorial-review/academic-integrity', 'editorial-review/publication-risk', 'fact-check']) {
      expect(kinds).not.toContain(refused);
    }
  });

  it('binds the four roles as the Owner decided: Main Editorial and Fast Interaction configurable among two routes, the rest unbound', async () => {
    const roles = (await readPolicy(V13_PATH)).roleBindings as Record<string, Record<string, unknown>>;
    const allowedBindings = [
      { route: 'opencode-go', endpoint: 'https://opencode.ai/zen/go/v1/chat/completions', model: 'deepseek-v4.1-flash', credentialSlot: 'opencode-go' },
      { route: 'deepseek-open-platform', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', credentialSlot: 'deepseek-api-key' },
    ];
    for (const role of ['Main Editorial Role', 'Fast Interaction Role']) {
      expect(roles[role]).toEqual({
        bindingState: 'user-configurable', userConfigurable: true, defaultBinding: 'opencode-go', allowedBindings,
        userConfiguredBindingAuthorizesTransmission: false, fallbackAllowed: false,
      });
    }
    for (const role of ['Difficult Escalation Role', 'Frontier Model Role']) {
      expect(roles[role]).toEqual({
        bindingState: 'unbound-by-default', userConfigurable: true, namedByAnyAllowRule: false, allowedBindings,
        userConfiguredBindingAuthorizesTransmission: false, fallbackAllowed: false,
      });
    }
  });

  it('reads the exact v13 bytes without a binding: seven rules, the policy\'s two bindings, nothing filled in', async () => {
    const reading = verifyOrdinaryProductionPolicy(await readPolicy(V13_PATH));
    expect(reading.rules.map((rule) => rule.ruleId)).toEqual(PRODUCTION_RULE_ID_ORDER);
    expect(reading.allowedBindings.map((binding) => binding.route)).toEqual(['opencode-go', 'deepseek-open-platform']);
    expect(reading).toMatchObject({ crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true });
  });

  it('fails closed on any single tampered, missing or unknown term (a changed value, a dropped term, an added term, a shorter list)', async () => {
    const pristine = await readPolicy(V13_PATH);
    const mutations = productionTamperings(pristine);
    expect(mutations.length).toBeGreaterThan(500);
    const survivors: string[] = [];
    for (const mutation of mutations) {
      const tampered = structuredClone(pristine);
      mutation.apply(tampered);
      try {
        verifyOrdinaryProductionPolicy(tampered);
        survivors.push(`${mutation.kind} ${mutation.path.join('.')}`);
      } catch (error) {
        expect((error as Error).message).toBe('LAUNCH_POLICY_INVALID');
      }
    }
    expect(survivors).toEqual([]);
  });

  it('refuses an unknown, repeated or missing rule and a rule that names a role the policy leaves unbound', async () => {
    const unknown = await readPolicy(V13_PATH);
    rulesOf(unknown)[REVIEW]!.ruleId = 'ordinary-production-fact-check';
    expect(() => verifyOrdinaryProductionPolicy(unknown)).toThrow('LAUNCH_POLICY_INVALID');
    const repeated = await readPolicy(V13_PATH);
    rulesOf(repeated).push(structuredClone(rulesOf(repeated)[DIALOGUE]!));
    expect(() => verifyOrdinaryProductionPolicy(repeated)).toThrow('LAUNCH_POLICY_INVALID');
    const missing = await readPolicy(V13_PATH);
    rulesOf(missing).splice(WRITING, 1);
    expect(() => verifyOrdinaryProductionPolicy(missing)).toThrow('LAUNCH_POLICY_INVALID');
    const background = await readPolicy(V13_PATH);
    rulesOf(background).push({ ...structuredClone(rulesOf(background)[BASELINE]!), ruleId: 'enrolled-background-manuscript-analysis-processing' });
    expect(() => verifyOrdinaryProductionPolicy(background)).toThrow('LAUNCH_POLICY_INVALID');
    for (const modelRole of ['Difficult Escalation Role', 'Frontier Model Role']) {
      const escalated = await readPolicy(V13_PATH);
      const binding = rulesOf(escalated)[DIALOGUE]!.providerBinding as Record<string, unknown>;
      binding.modelRole = modelRole;
      expect(() => verifyOrdinaryProductionPolicy(escalated)).toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('does not read the developer-live document as ordinary production, nor this document as developer-live', async () => {
    expect(() => verifyOrdinaryProductionPolicy(readPolicySync(V12_PATH))).toThrow('LAUNCH_POLICY_INVALID');
    expect(() => verifyDeveloperLivePolicy(readPolicySync(V13_PATH))).toThrow('LAUNCH_POLICY_INVALID');
  });

  it('reports setup-required with no admitted rule while no binding is configured', async () => {
    await placeValidCheckout();
    for (const absent of [undefined, null] as const) {
      const projection = absent === undefined
        ? await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production')
        : await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', absent);
      expect(projection.integrityState).toBe('verified');
      expect(projection.denialReason).toBeNull();
      expect(projection.operationalScope).toBe('ordinary-production');
      expect(projection.activePolicySetVersion).toBe('v10');
      expect(projection.providerProcessing).toEqual({
        version: 'v13',
        decision: 'eligible-only',
        authorizedLiveTransmissionCount: 'bounded-by-run',
        liveTransmissionAllowed: false,
        crossUnitReductionAllowed: true,
        assuranceSamplingAllowed: true,
        runReportReflectionAllowed: true,
        admittedRules: [],
        bindingState: 'setup-required',
        label: '本机生产：需先设置模型服务，当前不会传输',
      });
      expect(projection.externalExport.version).toBe('v2');
      expect(projection.publicReleasePermission.present).toBe(false);
    }
  });

  it.each([
    ['the Go route', GO_PRODUCTION_BINDING],
    ['the official DeepSeek route', DEEPSEEK_PRODUCTION_BINDING],
  ])('fills every admitted rule from the configured binding on %s, for both bound roles', async (_name, binding) => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', binding);
    expect(projection.integrityState).toBe('verified');
    expect(projection.operationalScope).toBe('ordinary-production');
    expect(projection.providerProcessing).toEqual({
      version: 'v13',
      decision: 'eligible-only',
      authorizedLiveTransmissionCount: 'bounded-by-run',
      liveTransmissionAllowed: true,
      crossUnitReductionAllowed: true,
      assuranceSamplingAllowed: true,
      runReportReflectionAllowed: true,
      admittedRules: productionAdmittedRules(binding),
      bindingState: 'configured',
      label: '本机生产：实时传输受运行边界约束',
    });
    expect(projection.providerProcessing.admittedRules).toHaveLength(7);
    // The two source flags agree with the categories here too: material in review, writing and evaluation; deliverables in review.
    expect(projection.providerProcessing.admittedRules.filter((rule) => rule.materialReferencesAllowed).map((rule) => rule.ruleId))
      .toEqual(['ordinary-production-review', 'ordinary-production-writing', 'ordinary-production-evaluation']);
    expect(projection.providerProcessing.admittedRules.filter((rule) => rule.editorialDeliverablesAllowed).map((rule) => rule.ruleId))
      .toEqual(['ordinary-production-review']);
    for (const rule of projection.providerProcessing.admittedRules) {
      expect(rule.materialReferencesAllowed, rule.ruleId).toBe(rule.outboundDataCategories.includes('frozen-material-reference-excerpt'));
      expect(rule.editorialDeliverablesAllowed, rule.ruleId).toBe(rule.outboundDataCategories.includes('editorial-deliverable-excerpt'));
    }
    // One binding serves the Main Editorial and the Fast Interaction rules alike; the credential reference never enters the projection.
    expect(new Set(projection.providerProcessing.admittedRules.map((rule) => `${rule.route}|${rule.endpoint}|${rule.model}|${rule.credentialSlot}`)).size).toBe(1);
    expect(JSON.stringify(projection)).not.toContain(binding.credentialReference);
    // Production admission must retain every policy category, including all three unpublished classes.
    const policyRules = rulesOf(await readPolicy(V13_PATH));
    for (const rule of projection.providerProcessing.admittedRules) {
      expect(rule.outboundDataCategories, rule.ruleId).toEqual(policyRules.find((candidate) => candidate.ruleId === rule.ruleId)!.allowedOutboundDataCategories);
    }
  });

  it('denies a binding the policy does not allow, a malformed one, or one with another route\'s slot, as binding-not-allowed', async () => {
    await placeValidCheckout();
    const other = [
      { ...GO_PRODUCTION_BINDING, model: 'deepseek-v4-pro' },
      { ...GO_PRODUCTION_BINDING, endpoint: 'https://example.invalid/v1/chat/completions' },
      { ...GO_PRODUCTION_BINDING, route: 'some-other-route' },
      { ...GO_PRODUCTION_BINDING, credentialSlot: 'deepseek-api-key' },
      { ...DEEPSEEK_PRODUCTION_BINDING, credentialSlot: 'opencode-go' },
      { ...GO_PRODUCTION_BINDING, credentialReference: '' },
      { ...GO_PRODUCTION_BINDING, extra: 'term' },
      { route: GO_BINDING.route, endpoint: GO_BINDING.endpoint, model: GO_BINDING.model, credentialSlot: GO_BINDING.credentialSlot },
    ] as unknown as ConfiguredProviderBinding[];
    for (const binding of other) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', binding);
      expect(projection.integrityState, JSON.stringify(binding)).toBe('denied');
      expect(projection.denialReason).toBe('binding-not-allowed');
      expect(projection.operationalScope).toBeNull();
      expectZeroTransmission(projection);
    }
    const reading = verifyOrdinaryProductionPolicy(await readPolicy(V13_PATH));
    expect(bindOrdinaryProductionRules(reading, { ...GO_PRODUCTION_BINDING, model: 'x' })).toBeNull();
    expect(bindOrdinaryProductionRules(reading, GO_PRODUCTION_BINDING)).toEqual(productionAdmittedRules(GO_PRODUCTION_BINDING));
  });

  it('reads a configured binding under ordinary-production only: developer-live and development-ci ignore it', async () => {
    await placeValidCheckout();
    for (const scope of ['development-ci', 'developer-live'] as const) {
      expect(await resolveSourceCheckoutLaunchPolicy(codeRoot, scope, DEEPSEEK_PRODUCTION_BINDING)).toEqual(await resolveSourceCheckoutLaunchPolicy(codeRoot, scope));
    }
  });

  it('denies an ordinary-production launch whose v13 bytes drifted, under any binding, while the other scopes still verify', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, ...V13_PATH.split('/'));
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);
    for (const binding of [null, GO_PRODUCTION_BINDING]) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', binding);
      expect(projection.integrityState).toBe('denied');
      expect(projection.denialReason).toBe('launch-policy-integrity-denied');
      expectZeroTransmission(projection);
    }
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).integrityState).toBe('verified');
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live')).integrityState).toBe('verified');
  });

  it('selects ordinary-production only through the launch argument: nothing reaches it by default, and a carrier that does not list it denies', async () => {
    await placeValidCheckout();
    // No argument: the launch form and the resolver both default to development-ci.
    expect(parseTrustedLaunchForm({})?.trustedOperationalScope).toBe('development-ci');
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).operationalScope).toBe('development-ci');
    // The explicit argument is the only selector, and it carries none of the developer-live launch facts.
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production' })).toEqual({
      trustedOperationalScope: 'ordinary-production', runBudgetCeiling: null, providerCacheRoot: null, validation: null,
    });
    for (const extra of [{ runBudgetCeiling: '500000' }, { providerCacheRoot: '/tmp/cache' }, { validationCase: 'baseline-analysis/sample1' }, { validationDelta: 'input:edited-chapter-dialogue' }]) {
      expect(parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production', ...extra })).toBeNull();
    }
    // A carrier that stops listing the scope makes it unselectable again (and a carrier whose list differs from the source is unreadable).
    const carrierTarget = join(codeRoot, ...CARRIER_PATH.split('/'));
    const carrier = JSON.parse(await readFile(carrierTarget, 'utf8')) as Record<string, unknown>;
    await writeFile(carrierTarget, JSON.stringify({ ...carrier, launchSelectableScopes: ['development-ci', 'developer-live'] }));
    const unlisted = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', GO_PRODUCTION_BINDING);
    expect(unlisted.integrityState).toBe('denied');
    expectZeroTransmission(unlisted);
  });
});
