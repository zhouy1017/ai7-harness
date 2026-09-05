import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const CARRIED_PATHS = [
  CARRIER_PATH,
  'docs/policies/active-policy-set.v3.json',
  'docs/policies/provider-processing-policy.v1.json',
  'docs/policies/external-export-policy.v1.json',
] as const;

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

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-launch-policy-test-'));
  codeRoot = join(sandbox, 'checkout');
  await mkdir(codeRoot);
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('resolveSourceCheckoutLaunchPolicy', () => {
  it('verifies a complete source-checkout carrier and pins the development-ci scope', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('development-ci');
    expect(projection.activePolicySetVersion).toBe('v3');
    expect(projection.providerProcessing.version).toBe('v1');
    expect(projection.externalExport.version).toBe('v1');
    expectZeroTransmission(projection);
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

  it('denies a carrier that declares the wrong manifestType', async () => {
    await placeValidCheckout();
    const carrierTarget = join(codeRoot, ...CARRIER_PATH.split('/'));
    const carrier = JSON.parse(await readFile(carrierTarget, 'utf8')) as Record<string, unknown>;
    carrier['manifestType'] = 'ai7-some-other-launch-authority';
    await writeFile(carrierTarget, JSON.stringify(carrier));

    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);
    expect(projection.integrityState).toBe('denied');
    expect(projection.denialReason).toBe('launch-policy-integrity-denied');
    expectZeroTransmission(projection);
  });

  it('denies a tampered active policy set whose digest no longer matches its pin', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, 'docs', 'policies', 'active-policy-set.v3.json');
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);

    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);
    expect(projection.integrityState).toBe('denied');
    expect(projection.denialReason).toBe('launch-policy-integrity-denied');
    expectZeroTransmission(projection);
  });

  it('denies a checkout whose pinned policy document is missing', async () => {
    await placeValidCheckout();
    await rm(join(codeRoot, 'docs', 'policies', 'external-export-policy.v1.json'));

    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);
    expect(projection.integrityState).toBe('denied');
    expectZeroTransmission(projection);
  });
});
