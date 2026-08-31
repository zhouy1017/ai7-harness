import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { LaunchPolicyProjection } from '../shared/protocol.js';

const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v3.json';
const ACTIVE_SET_SHA256 = 'fe6d9f169b8afb4d7b08daca99ee666f41e406d18916980e57106189a33e7dcc';
const PROVIDER_PINS = {
  'development-ci': {
    version: 'v1',
    canonicalPath: 'docs/policies/provider-processing-policy.v1.json',
    sha256: 'd9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a',
  },
  'fixture-recording': {
    version: 'v2',
    canonicalPath: 'docs/policies/provider-processing-policy.v2.json',
    sha256: 'd0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc',
  },
  'ordinary-production': {
    version: 'v3',
    canonicalPath: 'docs/policies/provider-processing-policy.v3.json',
    sha256: 'e8d05a669519a6c4018c96783919fcb944559d9dd8e9245e9e69fb992919d706',
  },
} as const;
const EXTERNAL_PIN = {
  version: 'v1',
  canonicalPath: 'docs/policies/external-export-policy.v1.json',
  sha256: 'b66fa0f2ad7d721f879c91e3cbb8e84f6a7bb08b107424d87871ab07937242de',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const selected = [...expected].sort();
  return actual.length === selected.length && actual.every((key, index) => key === selected[index]);
}

function requirePolicy(condition: unknown): asserts condition {
  if (!condition) throw new Error('LAUNCH_POLICY_INVALID');
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readBuiltFile(codeRoot: string, canonicalPath: string): Promise<Buffer> {
  requirePolicy(!isAbsolute(canonicalPath) && canonicalPath.split('/').every((part) => part !== '..' && part !== ''));
  const target = resolve(codeRoot, ...canonicalPath.split('/'));
  const relation = relative(codeRoot, target);
  requirePolicy(relation !== '' && !relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
  return readFile(target);
}

function parseJson(bytes: Uint8Array): Record<string, unknown> {
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  requirePolicy(isRecord(value));
  return value;
}

function deny(reason: string): LaunchPolicyProjection {
  return {
    integrityState: 'denied',
    denialReason: reason,
    operationalScope: null,
    activePolicySetVersion: null,
    providerProcessing: {
      version: null,
      decision: 'deny',
      authorizedLiveTransmissionCount: 0,
      liveTransmissionAllowed: false,
      label: '开发与持续集成：零次实时传输',
    },
    externalExport: {
      version: null,
      policyEligibilityIsEffectApproval: false,
      currentExportEffectAvailable: false,
      label: '对外导出策略独立；当前未提供导出受控动作',
    },
    publicReleasePermission: { present: false, label: '公开发布许可：不存在' },
  };
}

function verifyProviderPolicy(policy: Record<string, unknown>, version: 'v1' | 'v2' | 'v3', canonicalPath: string): void {
  requirePolicy(
    policy['documentType'] === 'ai7-policy-document' &&
      policy['policyId'] === 'provider-processing-policy' &&
      policy['policyType'] === 'provider-processing' &&
      policy['version'] === version &&
      policy['canonicalPath'] === canonicalPath,
  );
}

function verifyPin(
  pin: unknown,
  expected: { readonly version: 'v1' | 'v2' | 'v3'; readonly canonicalPath: string; readonly sha256: string },
): asserts pin is Record<string, unknown> {
  requirePolicy(
    isRecord(pin) &&
      exactKeys(pin, ['policyId', 'policyType', 'version', 'canonicalPath', 'sha256']) &&
      pin['policyId'] === 'provider-processing-policy' &&
      pin['policyType'] === 'provider-processing' &&
      pin['version'] === expected.version &&
      pin['canonicalPath'] === expected.canonicalPath &&
      pin['sha256'] === expected.sha256,
  );
}

/** Resolve only the build-embedded source-checkout selection; every invalid state remains zero-transmission. */
export async function resolveSourceCheckoutLaunchPolicy(codeRoot: string): Promise<LaunchPolicyProjection> {
  try {
    const carrier = parseJson(await readBuiltFile(codeRoot, CARRIER_PATH));
    requirePolicy(
      exactKeys(carrier, ['manifestType', 'version', 'runtimeForm', 'trustedOperationalScope', 'activePolicySet']) &&
        carrier['manifestType'] === 'ai7-source-checkout-launch-authority' &&
        carrier['version'] === 1 &&
        carrier['runtimeForm'] === 'source-checkout' &&
        carrier['trustedOperationalScope'] === 'development-ci' &&
        isRecord(carrier['activePolicySet']),
    );
    const carrierPin = carrier['activePolicySet'];
    requirePolicy(
      exactKeys(carrierPin, ['version', 'canonicalPath', 'sha256']) &&
        carrierPin['version'] === 'v3' &&
        carrierPin['canonicalPath'] === ACTIVE_SET_PATH &&
        carrierPin['sha256'] === ACTIVE_SET_SHA256,
    );

    const activeSetBytes = await readBuiltFile(codeRoot, ACTIVE_SET_PATH);
    requirePolicy(digest(activeSetBytes) === ACTIVE_SET_SHA256);
    const activeSet = parseJson(activeSetBytes);
    requirePolicy(
      activeSet['manifestType'] === 'ai7-active-policy-set' &&
        activeSet['version'] === 'v3' &&
        activeSet['digestAlgorithm'] === 'sha256' &&
        isRecord(activeSet['trustedOperationalScopeSelection']) &&
        isRecord(activeSet['activePolicies']),
    );
    const selection = activeSet['trustedOperationalScopeSelection'];
    requirePolicy(
      exactKeys(selection, [
        'exactlyOneProviderProcessingScopeBoundPerLaunch',
        'selectionAuthorityClass',
        'ordinaryProductSettingAllowed',
        'environmentVariableSelectorAllowed',
        'providerSelectorAllowed',
        'artifactOrPluginSelectorAllowed',
        'crossScopeFallbackAllowed',
        'missingOrUnknownScopeResult',
      ]) &&
        selection['exactlyOneProviderProcessingScopeBoundPerLaunch'] === true &&
        selection['selectionAuthorityClass'] === 'trusted-build-or-launch-authority' &&
        selection['ordinaryProductSettingAllowed'] === false &&
        selection['environmentVariableSelectorAllowed'] === false &&
        selection['providerSelectorAllowed'] === false &&
        selection['artifactOrPluginSelectorAllowed'] === false &&
        selection['crossScopeFallbackAllowed'] === false &&
        selection['missingOrUnknownScopeResult'] === 'deny-provider-processing',
    );

    const activePolicies = activeSet['activePolicies'];
    requirePolicy(
      exactKeys(activePolicies, ['provider-processing-policy', 'external-export-policy']) &&
        isRecord(activePolicies['provider-processing-policy']) &&
        isRecord(activePolicies['external-export-policy']),
    );
    const providerSelection = activePolicies['provider-processing-policy'];
    requirePolicy(
      exactKeys(providerSelection, ['selectionType', 'scopePins']) &&
        providerSelection['selectionType'] === 'trusted-operational-scope-map' &&
        isRecord(providerSelection['scopePins']),
    );
    const scopePins = providerSelection['scopePins'];
    requirePolicy(exactKeys(scopePins, Object.keys(PROVIDER_PINS)));
    for (const scope of Object.keys(PROVIDER_PINS) as Array<keyof typeof PROVIDER_PINS>) {
      const expected = PROVIDER_PINS[scope];
      const pin = scopePins[scope];
      verifyPin(pin, expected);
    }
    const selectedProviderPin = PROVIDER_PINS['development-ci'];
    const selectedProviderBytes = await readBuiltFile(codeRoot, selectedProviderPin.canonicalPath);
    requirePolicy(digest(selectedProviderBytes) === selectedProviderPin.sha256);
    verifyProviderPolicy(
      parseJson(selectedProviderBytes),
      selectedProviderPin.version,
      selectedProviderPin.canonicalPath,
    );

    const externalPin = activePolicies['external-export-policy'];
    requirePolicy(
      exactKeys(externalPin, ['policyId', 'policyType', 'version', 'canonicalPath', 'sha256']) &&
        externalPin['policyId'] === 'external-export-policy' &&
        externalPin['policyType'] === 'external-export' &&
        externalPin['version'] === EXTERNAL_PIN.version &&
        externalPin['canonicalPath'] === EXTERNAL_PIN.canonicalPath &&
        externalPin['sha256'] === EXTERNAL_PIN.sha256,
    );
    const externalBytes = await readBuiltFile(codeRoot, EXTERNAL_PIN.canonicalPath);
    requirePolicy(digest(externalBytes) === EXTERNAL_PIN.sha256);
    const externalPolicy = parseJson(externalBytes);
    requirePolicy(
      externalPolicy['documentType'] === 'ai7-policy-document' &&
        externalPolicy['policyId'] === 'external-export-policy' &&
        externalPolicy['policyType'] === 'external-export' &&
        externalPolicy['version'] === 'v1' &&
        externalPolicy['canonicalPath'] === EXTERNAL_PIN.canonicalPath &&
        isRecord(externalPolicy['authoritySeparations']) &&
        externalPolicy['authoritySeparations']['policyEligibilityIsEffectApproval'] === false,
    );

    const selectedPolicy = parseJson(selectedProviderBytes);
    requirePolicy(
      isRecord(selectedPolicy['decision']) &&
        selectedPolicy['decision']['default'] === 'deny' &&
        Array.isArray(selectedPolicy['decision']['providerAllowRules']) &&
        selectedPolicy['decision']['providerAllowRules'].length === 0 &&
        selectedPolicy['decision']['authorizedLiveTransmissionCount'] === 0,
    );

    return {
      integrityState: 'verified',
      denialReason: null,
      operationalScope: 'development-ci',
      activePolicySetVersion: 'v3',
      providerProcessing: {
        version: 'v1',
        decision: 'deny',
        authorizedLiveTransmissionCount: 0,
        liveTransmissionAllowed: false,
        label: '开发与持续集成：零次实时传输',
      },
      externalExport: {
        version: 'v1',
        policyEligibilityIsEffectApproval: false,
        currentExportEffectAvailable: false,
        label: '对外导出策略独立；当前未提供导出受控动作',
      },
      publicReleasePermission: { present: false, label: '公开发布许可：不存在' },
    };
  } catch {
    return deny('launch-policy-integrity-denied');
  }
}
