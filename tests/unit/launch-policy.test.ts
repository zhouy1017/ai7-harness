import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import type { LaunchPolicyProjection, TrustedOperationalScope } from '../../src/shared/protocol.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v4.json';
const CARRIED_PATHS = [
  CARRIER_PATH,
  ACTIVE_SET_PATH,
  'docs/policies/provider-processing-policy.v1.json',
  'docs/policies/provider-processing-policy.v2.json',
  'docs/policies/provider-processing-policy.v3.json',
  'docs/policies/provider-processing-policy.v4.json',
  'docs/policies/external-export-policy.v1.json',
] as const;
/** The exact pins active-set v4 records (Issue #272 step 1); the resolver and the carrier must agree with the bytes. */
const EXPECTED_PINS = {
  'development-ci': ['v1', 'docs/policies/provider-processing-policy.v1.json', 'd9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a'],
  'fixture-recording': ['v2', 'docs/policies/provider-processing-policy.v2.json', 'd0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc'],
  'ordinary-production': ['v3', 'docs/policies/provider-processing-policy.v3.json', '7ee954e6a9afdd7941839668a0020a5b03f463f68b998e03dc0c333bc35e767b'],
  'developer-live': ['v4', 'docs/policies/provider-processing-policy.v4.json', '41e1da732c52ee299ad51c8c718e43640387d9dbcb28f20b05632669257e413a'],
} as const;
const ACTIVE_SET_SHA256 = '5f738a97c5057abd7d20f06167be274aadeeb3e91f3e14f9cdc1ce4b044966eb';

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

function expectZeroTransmission(projection: LaunchPolicyProjection): void {
  expect(projection.providerProcessing.decision).toBe('deny');
  expect(projection.providerProcessing.liveTransmissionAllowed).toBe(false);
  expect(projection.providerProcessing.authorizedLiveTransmissionCount).toBe(0);
  expect(projection.externalExport.policyEligibilityIsEffectApproval).toBe(false);
  expect(projection.externalExport.currentExportEffectAvailable).toBe(false);
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

describe('active policy set v4', () => {
  it('is the sole active set: the carrier pins it, it maps all four scopes, and every pin matches the exact bytes', async () => {
    const carrier = JSON.parse(await readFile(join(REPO_ROOT, ...CARRIER_PATH.split('/')), 'utf8')) as Record<string, unknown>;
    expect(carrier).toEqual({
      manifestType: 'ai7-source-checkout-launch-authority',
      version: 2,
      runtimeForm: 'source-checkout',
      trustedOperationalScope: 'development-ci',
      launchSelectableScopes: ['development-ci', 'developer-live'],
      activePolicySet: { version: 'v4', canonicalPath: ACTIVE_SET_PATH, sha256: ACTIVE_SET_SHA256 },
    });
    expect(await sha256Of(ACTIVE_SET_PATH)).toBe(ACTIVE_SET_SHA256);
    const activeSet = JSON.parse(await readFile(join(REPO_ROOT, ...ACTIVE_SET_PATH.split('/')), 'utf8')) as {
      version: string;
      activePolicies: { 'provider-processing-policy': { scopePins: Record<string, { version: string; canonicalPath: string; sha256: string }> } };
    };
    expect(activeSet.version).toBe('v4');
    const pins = activeSet.activePolicies['provider-processing-policy'].scopePins;
    expect(Object.keys(pins)).toEqual(Object.keys(EXPECTED_PINS));
    for (const [scope, [version, canonicalPath, sha256]] of Object.entries(EXPECTED_PINS)) {
      expect(pins[scope]).toMatchObject({ version, canonicalPath, sha256 });
      expect(await sha256Of(canonicalPath)).toBe(sha256);
    }
  });

  it('declares the exact developer-live binding the v4 policy bytes carry', () => {
    expect(DEVELOPER_LIVE_POLICY_BINDING.route).toBe('opencode-go');
    expect(DEVELOPER_LIVE_POLICY_BINDING.model).toBe('deepseek-v4-flash');
    expect(DEVELOPER_LIVE_POLICY_BINDING.endpoint).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    expect(DEVELOPER_LIVE_POLICY_BINDING.credentialSlot).toBe('opencode-go');
    expect(DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTotalTokens).toBe(500_000);
  });
});

describe('resolveSourceCheckoutLaunchPolicy', () => {
  it('verifies a complete source-checkout carrier and pins the development-ci scope by default', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('development-ci');
    expect(projection.activePolicySetVersion).toBe('v4');
    expect(projection.providerProcessing.version).toBe('v1');
    expect(projection.providerProcessing.label).toBe('开发与持续集成：零次实时传输');
    expect(projection.externalExport.version).toBe('v1');
    expectZeroTransmission(projection);
    expect(await resolveSourceCheckoutLaunchPolicy(codeRoot, 'development-ci')).toEqual(projection);
  });

  it('binds the developer-live scope to Provider Processing v4 as eligible-only with the bounded-by-run token', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('developer-live');
    expect(projection.activePolicySetVersion).toBe('v4');
    expect(projection.providerProcessing).toEqual({
      version: 'v4',
      decision: 'eligible-only',
      authorizedLiveTransmissionCount: 'bounded-by-run',
      liveTransmissionAllowed: true,
      // Issue #274: v4 authorizes one transmission per Analysis Unit and names no cross-unit
      // reduction, so the reduction does not dispatch under this scope. A v5 that names it is the
      // Owner's decision; until then the exact policy bytes this pin verifies say `false`.
      crossUnitReductionAllowed: false,
      label: '开发者实时：实时传输受运行边界约束',
    });
    expect(projection.externalExport.version).toBe('v1');
    expect(projection.externalExport.currentExportEffectAvailable).toBe(false);
    expect(projection.publicReleasePermission.present).toBe(false);
  });

  it('reads no cross-unit reduction transmission under either selectable scope', async () => {
    await placeValidCheckout();
    for (const scope of ['development-ci', 'developer-live'] as const) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope);
      expect(projection.integrityState).toBe('verified');
      expect(projection.providerProcessing.crossUnitReductionAllowed).toBe(false);
    }
    // The denial carries the same reading, so no unreadable launch can turn the step on.
    const denied = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production');
    expect(denied.integrityState).toBe('denied');
    expect(denied.providerProcessing.crossUnitReductionAllowed).toBe(false);
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

  it('denies a carrier that declares the wrong manifestType or still pins active-set v3', async () => {
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

  it('denies a developer-live launch whose v4 policy bytes drifted, while development-ci still verifies', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, 'docs', 'policies', 'provider-processing-policy.v4.json');
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);

    const live = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');
    expect(live.integrityState).toBe('denied');
    expectZeroTransmission(live);
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).integrityState).toBe('verified');
  });

  it('denies a checkout whose pinned policy document is missing', async () => {
    await placeValidCheckout();
    await rm(join(codeRoot, 'docs', 'policies', 'external-export-policy.v1.json'));

    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);
    expect(projection.integrityState).toBe('denied');
    expectZeroTransmission(projection);
  });
});
