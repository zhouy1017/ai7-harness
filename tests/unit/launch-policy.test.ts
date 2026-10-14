import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_SET_VERSION,
  DEVELOPER_LIVE_POLICY_BINDING,
  DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION,
  resolveSourceCheckoutLaunchPolicy,
  verifyDeveloperLivePolicy,
} from '../../src/service/launch-policy.js';
import type { AdmittedProviderRule, LaunchPolicyProjection, TrustedOperationalScope } from '../../src/shared/protocol.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v9.json';
const CARRIED_PATHS = [
  CARRIER_PATH,
  ACTIVE_SET_PATH,
  'docs/policies/provider-processing-policy.v1.json',
  'docs/policies/provider-processing-policy.v2.json',
  'docs/policies/provider-processing-policy.v3.json',
  'docs/policies/provider-processing-policy.v4.json',
  'docs/policies/provider-processing-policy.v11.json',
  'docs/policies/provider-processing-policy.v6.json',
  'docs/policies/external-export-policy.v1.json',
  'docs/policies/external-export-policy.v2.json',
] as const;
/** The exact pins active-set v9 records; the resolver and the carrier must agree with the bytes. */
const EXPECTED_PINS = {
  'development-ci': ['v1', 'docs/policies/provider-processing-policy.v1.json', 'd9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a'],
  'fixture-recording': ['v2', 'docs/policies/provider-processing-policy.v2.json', 'd0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc'],
  'ordinary-production': ['v6', 'docs/policies/provider-processing-policy.v6.json', '10e69a5d7b027d077728ec1bc7393dc0583b99a05246b4e883098b9d96b221a4'],
  'developer-live': ['v11', 'docs/policies/provider-processing-policy.v11.json', '38cc8044f10517bd3c152237256cd0cd7fe6cf8a4ef7ad340099a087ac8a8634'],
} as const;
/** ADR 0079 §3 decides External Export v2; active-set v9 pins its exact bytes, unchanged since v7. */
const EXPECTED_EXTERNAL_PIN = ['v2', 'docs/policies/external-export-policy.v2.json', '162441cc3e5d30b0cafb00a0d04ca5ab32b64c5039baafc8952a9925bd7984b6'] as const;
const ACTIVE_SET_SHA256 = 'b13013bbd0b9b1cb0fdd7b88d0d349d9c010d3043e867c547a81f37ed3d5cb0b';

const GO_BINDING = {
  route: 'opencode-go',
  endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
  model: 'deepseek-v4.1-flash',
  credentialSlot: 'opencode-go',
} as const;
/** The three allow rules v11 carries from v10, in policy order, as the projection must state them (posted on Issue #831). */
const V10_ADMITTED_RULES: AdmittedProviderRule[] = [
  {
    ruleId: 'developer-live-public-samplebook-analysis',
    taskKinds: ['baseline-manuscript-analysis'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic'],
    crossUnitSynthesisAllowed: false,
  },
  {
    ruleId: 'developer-live-public-samplebook-editorial-dialogue',
    taskKinds: ['editorial-dialogue'],
    modelRole: 'Fast Interaction Role',
    ...GO_BINDING,
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
  },
  {
    ruleId: 'developer-live-public-samplebook-reference-free-review',
    taskKinds: ['editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic'],
    crossUnitSynthesisAllowed: false,
  },
];
/** The four rules v11 adds (posted on Issue #841): kind ids, roles, categories and the synthesis flag. */
const V11_NEW_ADMITTED_RULES: AdmittedProviderRule[] = [
  {
    ruleId: 'developer-live-public-samplebook-writing',
    taskKinds: ['writing'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt'],
    crossUnitSynthesisAllowed: true,
  },
  {
    ruleId: 'developer-live-public-samplebook-evaluation',
    taskKinds: ['evaluation', 'readers-report', 'evaluation-rewrite'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt'],
    crossUnitSynthesisAllowed: true,
  },
  {
    ruleId: 'developer-live-public-samplebook-editorial-polish',
    taskKinds: ['editorial-polish'],
    modelRole: 'Fast Interaction Role',
    ...GO_BINDING,
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
  },
  {
    ruleId: 'developer-live-public-samplebook-conflict-regenerate',
    taskKinds: ['conflict-regenerate'],
    modelRole: 'Fast Interaction Role',
    ...GO_BINDING,
    outboundDataCategories: ['manuscript-conflict-region-excerpt'],
    crossUnitSynthesisAllowed: false,
  },
];
const V11_ADMITTED_RULES: AdmittedProviderRule[] = [...V10_ADMITTED_RULES, ...V11_NEW_ADMITTED_RULES];

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

const V9_PATH = 'docs/policies/provider-processing-policy.v9.json';
const V10_PATH = 'docs/policies/provider-processing-policy.v10.json';
const V11_PATH = 'docs/policies/provider-processing-policy.v11.json';
const BASELINE = 0;
const DIALOGUE = 1;
const REVIEW = 2;
const WRITING = 3;
const EVALUATION = 4;
const POLISH = 5;
const CONFLICT = 6;

async function readPolicy(path: string = V11_PATH): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(REPO_ROOT, ...path.split('/')), 'utf8')) as Record<string, unknown>;
}

function rulesOf(policy: Record<string, unknown>): Array<Record<string, unknown>> {
  return (policy.decision as { providerAllowRules: Array<Record<string, unknown>> }).providerAllowRules;
}

/**
 * The exact v11 document with the given fields of one rule overridden. The digests the resolver checks are
 * constants of `launch-policy.ts`, so a policy revision could never be fed through
 * `resolveSourceCheckoutLaunchPolicy`; the reading of the rules' exact fields is therefore pinned
 * against the verification function itself, over the real bytes with one field varied.
 */
async function v11PolicyWithRule(index: number, overrides: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const policy = await readPolicy();
  Object.assign(rulesOf(policy)[index]!, overrides);
  return policy;
}

/** The exact v11 document with the given keys of one rule's named block overridden. */
async function v11PolicyWithBlock(index: number, block: string, overrides: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
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

describe('active policy set v9', () => {
  it('is the sole active set: the carrier pins it, it maps all four scopes, and every pin matches the exact bytes', async () => {
    expect(ACTIVE_SET_VERSION).toBe('v9');
    expect(DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION).toBe('v11');
    const carrier = JSON.parse(await readFile(join(REPO_ROOT, ...CARRIER_PATH.split('/')), 'utf8')) as Record<string, unknown>;
    expect(carrier).toEqual({
      manifestType: 'ai7-source-checkout-launch-authority',
      version: 2,
      runtimeForm: 'source-checkout',
      trustedOperationalScope: 'development-ci',
      launchSelectableScopes: ['development-ci', 'developer-live'],
      activePolicySet: { version: 'v9', canonicalPath: ACTIVE_SET_PATH, sha256: ACTIVE_SET_SHA256 },
    });
    expect(await sha256Of(ACTIVE_SET_PATH)).toBe(ACTIVE_SET_SHA256);
    const activeSet = JSON.parse(await readFile(join(REPO_ROOT, ...ACTIVE_SET_PATH.split('/')), 'utf8')) as {
      version: string;
      predecessorVersion: string;
      activePolicies: {
        'provider-processing-policy': { scopePins: Record<string, { version: string; canonicalPath: string; sha256: string }> };
        'external-export-policy': { version: string; canonicalPath: string; sha256: string };
      };
    };
    expect(activeSet.version).toBe('v9');
    expect(activeSet.predecessorVersion).toBe('v8');
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

  it('keeps every predecessor pin of active-set v8 except developer-live byte-identical', async () => {
    const v8 = JSON.parse(await readFile(join(REPO_ROOT, 'docs', 'policies', 'active-policy-set.v8.json'), 'utf8')) as {
      activePolicies: { 'provider-processing-policy': { scopePins: Record<string, unknown> }; 'external-export-policy': unknown };
    };
    const v9 = JSON.parse(await readFile(join(REPO_ROOT, ...ACTIVE_SET_PATH.split('/')), 'utf8')) as typeof v8;
    for (const scope of ['development-ci', 'fixture-recording', 'ordinary-production']) {
      expect(v9.activePolicies['provider-processing-policy'].scopePins[scope]).toEqual(v8.activePolicies['provider-processing-policy'].scopePins[scope]);
    }
    expect(v9.activePolicies['external-export-policy']).toEqual(v8.activePolicies['external-export-policy']);
  });

  it('carries the v9 baseline rule through v10 into v11 unchanged', async () => {
    const v9 = await readPolicy(V9_PATH);
    const v10 = await readPolicy(V10_PATH);
    const v11 = await readPolicy();
    expect(rulesOf(v10)[BASELINE]).toEqual(rulesOf(v9)[0]);
    expect(v10.predecessorVersion).toBe('v9');
    expect(v11.predecessorVersion).toBe('v10');
    expect(v11.predecessorCanonicalPath).toBe(V10_PATH);
  });

  it('carries every v10 rule, role binding and v10 outbound category into v11 unchanged', async () => {
    const v10 = await readPolicy(V10_PATH);
    const v11 = await readPolicy();
    expect(rulesOf(v11).slice(0, 3)).toEqual(rulesOf(v10));
    expect(v11.roleBindings).toEqual(v10.roleBindings);
    expect(v11.authoritySeparations).toEqual(v10.authoritySeparations);
    expect(v11.credentialBoundary).toEqual(v10.credentialBoundary);
    expect(v11.trustedSelection).toEqual(v10.trustedSelection);
    expect(v11.outboundDataCategories).toMatchObject(v10.outboundDataCategories as Record<string, unknown>);
    expect(Object.keys(v11.outboundDataCategories as Record<string, unknown>).slice(Object.keys(v10.outboundDataCategories as Record<string, unknown>).length)).toEqual([
      'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'book-metadata-and-synopsis', 'manuscript-conflict-region-excerpt',
    ]);
    expect(rulesOf(v11).map((rule) => rule.ruleId)).toEqual(V11_ADMITTED_RULES.map((rule) => rule.ruleId));
  });

  it('declares the exact developer-live binding the v11 policy bytes carry', () => {
    expect(DEVELOPER_LIVE_POLICY_BINDING.route).toBe('opencode-go');
    expect(DEVELOPER_LIVE_POLICY_BINDING.model).toBe('deepseek-v4.1-flash');
    expect(DEVELOPER_LIVE_POLICY_BINDING.endpoint).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    expect(DEVELOPER_LIVE_POLICY_BINDING.credentialSlot).toBe('opencode-go');
    // ADR 0070 as ADR 0079 §2.3 lands it: 30,000 tokens per frozen unit, never the flat 500,000.
    expect(DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit).toBe(30_000);
  });
});

describe('resolveSourceCheckoutLaunchPolicy', () => {
  it('refuses widening any v11 rule\'s task, origin, material or attendance matrix', async () => {
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT]) {
      for (const override of [
        { allowedTaskKinds: [...(rulesOf(await readPolicy())[index]!.allowedTaskKinds as string[]), 'fact-check'] },
        { allowedOutboundDataCategories: ['public-or-synthetic', 'unpublished-excerpts'] },
        { authorityOrigin: { newlyUserInitiatedTaskRequired: false } },
        { executionMode: { humanAttended: true } },
      ]) {
        await expect(v11PolicyWithRule(index, override).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
    }
    // The web-bearing and reference-bearing review categories stay outside the review rule.
    for (const kind of ['editorial-review/factual-review', 'editorial-review/academic-integrity', 'editorial-review/publication-risk',
      'editorial-review/series-consistency', 'editorial-review/cross-deliverable-consistency']) {
      await expect(v11PolicyWithRule(REVIEW, { allowedTaskKinds: [...V10_ADMITTED_RULES[REVIEW]!.taskKinds, kind] }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('verifies a complete source-checkout carrier and pins the development-ci scope by default', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('development-ci');
    // One active set per launch: development-ci reports v9 while its Provider Processing pin stays v1.
    expect(projection.activePolicySetVersion).toBe('v9');
    expect(projection.providerProcessing.version).toBe('v1');
    expect(projection.providerProcessing.label).toBe('开发与持续集成：零次实时传输');
    expect(projection.externalExport.version).toBe('v2');
    expectZeroTransmission(projection);
    expect(await resolveSourceCheckoutLaunchPolicy(codeRoot, 'development-ci')).toEqual(projection);
  });

  it('binds the developer-live scope to Provider Processing v11 as eligible-only with its seven admitted rules', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('developer-live');
    expect(projection.activePolicySetVersion).toBe('v9');
    expect(projection.providerProcessing).toEqual({
      version: 'v11',
      decision: 'eligible-only',
      authorizedLiveTransmissionCount: 'bounded-by-run',
      liveTransmissionAllowed: true,
      // The baseline rule names all three declared suboperations (ADR 0066) `true`, as ADR 0079 §2.1 settled for v5; the
      // reduction, the assurance sample and the reflection turn each dispatch inside the bound of §2.2.
      crossUnitReductionAllowed: true,
      assuranceSamplingAllowed: true,
      runReportReflectionAllowed: true,
      admittedRules: V11_ADMITTED_RULES,
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
      // v1 authorizes zero transmissions; the v11 baseline rule names all three.
      const named = scope === 'developer-live';
      expect(projection.providerProcessing.crossUnitReductionAllowed).toBe(named);
      expect(projection.providerProcessing.assuranceSamplingAllowed).toBe(named);
      expect(projection.providerProcessing.runReportReflectionAllowed).toBe(named);
    }
    // The denial carries the same reading, so no unreadable launch can turn any step on.
    const denied = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production' as TrustedOperationalScope);
    expect(denied.integrityState).toBe('denied');
    expect(denied.providerProcessing.crossUnitReductionAllowed).toBe(false);
    expect(denied.providerProcessing.assuranceSamplingAllowed).toBe(false);
    expect(denied.providerProcessing.runReportReflectionAllowed).toBe(false);
    expect(denied.providerProcessing.admittedRules).toEqual([]);
  });

  it('reads N allow rules: the exact v11 bytes yield seven, v10 three, the immutable v9 bytes the baseline rule alone', async () => {
    expect(verifyDeveloperLivePolicy(await readPolicy())).toEqual({
      crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true,
      admittedRules: V11_ADMITTED_RULES,
    });
    expect(verifyDeveloperLivePolicy(await readPolicy(V10_PATH))).toEqual({
      crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true,
      admittedRules: V10_ADMITTED_RULES,
    });
    expect(verifyDeveloperLivePolicy(await readPolicy(V9_PATH))).toEqual({
      crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true,
      admittedRules: [V10_ADMITTED_RULES[BASELINE]],
    });
  });

  it('refuses an unknown, repeated or missing rule, and a role the policy does not bind', async () => {
    const unknown = await v11PolicyWithRule(REVIEW, { ruleId: 'developer-live-public-samplebook-fact-check' });
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

  it('refuses a dialogue or review reading that is not the pinned v11 bytes', async () => {
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
      [REVIEW, 'source', { materialReferencesAllowed: true }],
      [REVIEW, 'source', { seriesKnowledgeAllowed: true }],
      [REVIEW, 'source', { editorialDeliverablesAllowed: true }],
      [REVIEW, 'authorizationPreconditions', { unsetRunBudgetCeilingAllowed: true }],
      [REVIEW, 'providerBinding', { model: 'deepseek-v4-pro' }],
      [REVIEW, 'redaction', { housePeopleNamesAndRolesStripped: false }],
    ] as const) {
      await expect(v11PolicyWithBlock(index, block, overrides).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('refuses any baseline reading whose named fields are not the pinned bytes', async () => {
    // Every one of the three, falsified or made unreadable, is a policy the launch cannot read: the
    // reading is the exact bytes, never a permissive default.
    for (const key of ['crossUnitReductionAllowed', 'assuranceSamplingAllowed', 'runReportReflectionAllowed'] as const) {
      for (const value of [false, undefined, 'true', 1, null, {}, []]) {
        await expect(v11PolicyWithBlock(BASELINE, 'transmissions', { [key]: value }).then(verifyDeveloperLivePolicy))
          .rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
    }
    // The web-search allowance is `false` in v11, as in v5 and v9 (ADR 0079 §4.2, §6); an enabled flag is unreadable.
    await expect(v11PolicyWithBlock(BASELINE, 'transmissions', { webSearchToolAllowed: true }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
    // The house-people redaction rule is part of the pinned document too.
    await expect(v11PolicyWithRule(BASELINE, { redaction: undefined }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    await expect(v11PolicyWithRule(BASELINE, { redaction: { housePeopleNamesAndRolesStripped: false, remarksAndInternalNotesStripped: true, authorInformationAllowed: true, houseNameAllowed: true } }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
    // And the per-frozen-unit default is the one ADR 0070 derives, not the replaced flat 500,000.
    await expect(v11PolicyWithBlock(BASELINE, 'authorizationPreconditions', { defaultRunBudgetCeilingTokensPerFrozenUnit: 500_000 }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
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

    // The immediate predecessor v8 is no longer the selection either.
    await placeBuiltFile('docs/policies/active-policy-set.v8.json');
    await writeFile(carrierTarget, JSON.stringify({
      ...carrier,
      activePolicySet: { version: 'v8', canonicalPath: 'docs/policies/active-policy-set.v8.json', sha256: await sha256Of('docs/policies/active-policy-set.v8.json') },
    }));
    for (const scope of ['development-ci', 'developer-live'] as const) {
      const previous = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope);
      expect(previous.integrityState).toBe('denied');
      expectZeroTransmission(previous);
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

  it('denies a developer-live launch whose v11 policy bytes drifted, while development-ci still verifies', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, ...V11_PATH.split('/'));
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

describe('the four rules Provider Processing v11 adds (Issue #841)', () => {
  it('admits matching Default Execution Rules only for writing quick start, with no background origin', async () => {
    const rules = rulesOf(await readPolicy());
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT]) {
      const expected = index === WRITING;
      expect((rules[index]!.authorityOrigin as Record<string, unknown>).matchingActiveDefaultExecutionRuleAllowed).toBe(expected);
      await expect(v11PolicyWithBlock(index, 'authorityOrigin', { matchingActiveDefaultExecutionRuleAllowed: !expected }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v11PolicyWithBlock(index, 'authorityOrigin', { backgroundAnalysisEnrollmentAllowed: true }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('names each new rule\'s kinds, role, categories and book-level synthesis flag exactly', async () => {
    const reading = verifyDeveloperLivePolicy(await readPolicy());
    expect(reading.admittedRules.slice(3)).toEqual(V11_NEW_ADMITTED_RULES);
    expect(reading.admittedRules.filter((rule) => rule.crossUnitSynthesisAllowed).map((rule) => rule.taskKinds).flat())
      .toEqual(['writing', 'evaluation', 'readers-report', 'evaluation-rewrite']);
  });

  it('refuses material-bearing writing and evaluation this wave', async () => {
    for (const index of [WRITING, EVALUATION]) {
      await expect(v11PolicyWithBlock(index, 'source', { materialReferencesAllowed: true }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v11PolicyWithBlock(index, 'source', { materialReferenceConsumptionRecheckRequired: true }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
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
        await expect(v11PolicyWithBlock(index, block, overrides).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
      // Any category beyond the declared ones, or one of another rule's, is a policy the launch cannot read.
      for (const category of ['unpublished-full-content', 'editor-selected-manuscript-excerpt']) {
        const categories = [...(rulesOf(await readPolicy())[index]!.allowedOutboundDataCategories as string[]), category];
        await expect(v11PolicyWithRule(index, { allowedOutboundDataCategories: categories }).then(verifyDeveloperLivePolicy))
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
        await expect(v11PolicyWithBlock(index, block, overrides).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
      await expect(v11PolicyWithRule(index, { output: undefined }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v11PolicyWithRule(index, { allowedTaskKinds: [index === POLISH ? 'conflict-regenerate' : 'editorial-polish'] }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('keeps the carried review rule free of the four new categories and of any synthesis turn', async () => {
    const categories = [...(rulesOf(await readPolicy())[REVIEW]!.allowedOutboundDataCategories as string[]), 'house-exemplar-excerpt'];
    await expect(v11PolicyWithRule(REVIEW, { allowedOutboundDataCategories: categories }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    expect(V10_ADMITTED_RULES.every((rule) => !rule.crossUnitSynthesisAllowed)).toBe(true);
  });
});
