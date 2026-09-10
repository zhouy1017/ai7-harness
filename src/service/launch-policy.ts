import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { LAUNCH_SELECTABLE_SCOPES, isTrustedOperationalScope, type DeveloperLiveCeiling, type LaunchPolicyProjection, type TrustedLaunchForm, type TrustedOperationalScope } from '../shared/protocol.js';

/**
 * The source-checkout launch authority (ADR 0046, ADR 0065): the build-embedded carrier pins active
 * policy set v5, the sole active set for all four Provider Processing scopes, and names the two
 * scopes the built entry may bind from its launch form. `development-ci` is the default and binds
 * Provider Processing v1 (zero live transmissions); `developer-live` is bound only by the launch
 * argument `--trusted-operational-scope developer-live` on a developer host and binds the immutable
 * Provider Processing v5. `fixture-recording` and `ordinary-production` are pinned by the active set
 * but are not selectable from the source checkout. No environment variable or product setting
 * selects a scope; every invalid state resolves to the zero-transmission denial.
 */
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const CARRIER_VERSION = 2;
export const ACTIVE_SET_VERSION = 'v5' as const;
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v5.json';
const ACTIVE_SET_SHA256 = '33edf6c0581eea859af77bd2aaba3068df36a875b268cf0ab2e5ec27994e4620';
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
    version: 'v6',
    canonicalPath: 'docs/policies/provider-processing-policy.v6.json',
    sha256: '10e69a5d7b027d077728ec1bc7393dc0583b99a05246b4e883098b9d96b221a4',
  },
  'developer-live': {
    version: 'v5',
    canonicalPath: 'docs/policies/provider-processing-policy.v5.json',
    sha256: '4b7356aaa36a75b3085d6eecb593fb3bd765682073e37fa21b5abf7bc78ea0bb',
  },
} as const;
const EXTERNAL_PIN = {
  version: 'v2',
  canonicalPath: 'docs/policies/external-export-policy.v2.json',
  sha256: '2eae5a473010afb0999a89a6bf202ca83430b26f4ba2b93a362d9a23d7e18b3e',
} as const;

/** The exact developer-live binding Provider Processing v5 declares; the resolver verifies the policy bytes say the same. */
export const DEVELOPER_LIVE_POLICY_BINDING = {
  ruleId: 'developer-live-public-samplebook-analysis',
  launchArgument: '--trusted-operational-scope developer-live',
  route: 'opencode-go',
  endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
  model: 'deepseek-v4-flash',
  credentialSlot: 'opencode-go',
  defaultRunBudgetCeilingTokensPerFrozenUnit: 30_000,
  providerAccountLimitClassification: 'quota-exhausted',
} as const;

/** The sibling directory of the checkout that holds the Provider Result Cache when no root is named. */
export const DEFAULT_PROVIDER_CACHE_DIRECTORY = 'ai7-harness-provider-cache';

/** The developer-live launch facts derived from the form: the required ceiling and the cache root outside the checkout. */
export interface DeveloperLiveLaunch {
  /** The explicit form ceiling, or the policy's per-frozen-unit default when the form left it unset. */
  readonly runBudgetCeiling: DeveloperLiveCeiling;
  readonly providerCacheRoot: string;
}

/**
 * Everything a developer-live launch carries past the network denial: the verified launch facts and
 * the `fetch` the service entry captured before the denial replaced the global. The runtime exists
 * only when the launch policy actually bound `developer-live`; under every other scope it is `null`
 * and no module holds a usable transport.
 */
export interface DeveloperLiveRuntime {
  readonly launch: DeveloperLiveLaunch;
  /** The native `fetch`, captured before `installNodeNetworkDenial()`; only the `opencode-go` transport receives it. */
  readonly nativeFetch: typeof fetch;
}

function isInsideOrEqual(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

/**
 * Resolve the developer-live launch facts. An explicit form ceiling is bound as the total; when the
 * form leaves it unset, the policy's default is bound as 30,000 tokens per frozen Coverage Manifest
 * unit (ADR 0070), computed once the manifest freezes. Whatever is bound, the ceiling is never
 * `unset`; the cache root defaults to the checkout's sibling directory and must lie outside the
 * checkout so raw Provider material never enters a working tree.
 */
export function resolveDeveloperLiveLaunch(form: TrustedLaunchForm, checkoutRoot: string): DeveloperLiveLaunch {
  if (form.trustedOperationalScope !== 'developer-live' || !isAbsolute(checkoutRoot)) throw new Error('LAUNCH_FORM_INVALID');
  const explicit = form.runBudgetCeiling;
  if (explicit !== null && (!Number.isSafeInteger(explicit) || explicit <= 0)) throw new Error('LAUNCH_FORM_INVALID');
  const runBudgetCeiling: DeveloperLiveCeiling = explicit === null
    ? { kind: 'tokens-per-frozen-unit', tokensPerFrozenUnit: DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit }
    : { kind: 'tokens', maxTotalTokens: explicit };
  if (form.providerCacheRoot !== null && !isAbsolute(form.providerCacheRoot)) throw new Error('LAUNCH_FORM_INVALID');
  const providerCacheRoot = resolve(form.providerCacheRoot ?? resolve(checkoutRoot, '..', DEFAULT_PROVIDER_CACHE_DIRECTORY));
  if (isInsideOrEqual(resolve(checkoutRoot), providerCacheRoot)) throw new Error('PROVIDER_CACHE_ROOT_INSIDE_CHECKOUT');
  return { runBudgetCeiling, providerCacheRoot };
}

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
      crossUnitReductionAllowed: false,
      assuranceSamplingAllowed: false,
      runReportReflectionAllowed: false,
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

type PinVersion = (typeof PROVIDER_PINS)[keyof typeof PROVIDER_PINS]['version'];

function verifyProviderPolicy(policy: Record<string, unknown>, version: PinVersion, canonicalPath: string): void {
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
  expected: { readonly version: PinVersion; readonly canonicalPath: string; readonly sha256: string },
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

/** Provider Processing v1: default deny, no allow rule, zero authorized live transmissions. */
function verifyDevelopmentCiPolicy(policy: Record<string, unknown>): void {
  requirePolicy(
    isRecord(policy['decision']) &&
      policy['decision']['default'] === 'deny' &&
      Array.isArray(policy['decision']['providerAllowRules']) &&
      policy['decision']['providerAllowRules'].length === 0 &&
      policy['decision']['authorizedLiveTransmissionCount'] === 0,
  );
}

/**
 * Provider Processing v5: default deny with exactly the one developer-live eligible-only rule and its
 * exact binding, the three declared suboperations of ADR 0066, the per-frozen-unit Run Budget Ceiling
 * default of ADR 0070, and the house-people redaction rule of ADR 0079 §4.4. v5 names all three
 * suboperations `true` and the web-search flag `false`; the projection reads exactly those bytes, and
 * a field that does not match is a policy the launch cannot read — the zero-transmission denial.
 *
 * Exported so the reading of the rule's exact fields can be pinned against the real v5 bytes with one
 * field varied. The document digests this resolver checks are constants of this module, so a policy
 * revision could not be fed through `resolveSourceCheckoutLaunchPolicy` at all — which is the point
 * of the pins, and why the reading is tested here instead.
 */
export function verifyDeveloperLivePolicy(policy: Record<string, unknown>): {
  crossUnitReductionAllowed: boolean;
  assuranceSamplingAllowed: boolean;
  runReportReflectionAllowed: boolean;
} {
  requirePolicy(policy['operationalScope'] === 'developer-live' && policy['lifecycleStatus'] === 'active');
  const selection = policy['trustedSelection'];
  requirePolicy(
    isRecord(selection) &&
      selection['selectionAuthorityClass'] === 'trusted-build-or-launch-authority' &&
      selection['launchArgument'] === DEVELOPER_LIVE_POLICY_BINDING.launchArgument &&
      selection['developerHostOnly'] === true &&
      selection['hostedOrCiSelectionAllowed'] === false &&
      selection['ordinaryProductSettingAllowed'] === false &&
      selection['environmentVariableSelectorAllowed'] === false &&
      selection['crossScopeFallbackAllowed'] === false,
  );
  const decision = policy['decision'];
  requirePolicy(isRecord(decision) && decision['default'] === 'deny' && Array.isArray(decision['providerAllowRules']) && decision['providerAllowRules'].length === 1);
  const rule: unknown = decision['providerAllowRules'][0];
  requirePolicy(isRecord(rule) && rule['ruleId'] === DEVELOPER_LIVE_POLICY_BINDING.ruleId && rule['policyResult'] === 'eligible-only');
  // The house-people redaction rule (ADR 0079 §4.4): the identity of the house's people never leaves,
  // while the author's information and the house name may.
  const redaction = rule['redaction'];
  requirePolicy(
    isRecord(redaction) &&
      redaction['housePeopleNamesAndRolesStripped'] === true &&
      redaction['remarksAndInternalNotesStripped'] === true &&
      redaction['authorInformationAllowed'] === true &&
      redaction['houseNameAllowed'] === true,
  );
  const binding = rule['providerBinding'];
  requirePolicy(
    isRecord(binding) &&
      binding['modelRole'] === 'Main Editorial Role' &&
      binding['route'] === DEVELOPER_LIVE_POLICY_BINDING.route &&
      binding['endpoint'] === DEVELOPER_LIVE_POLICY_BINDING.endpoint &&
      binding['model'] === DEVELOPER_LIVE_POLICY_BINDING.model &&
      binding['credentialSlot'] === DEVELOPER_LIVE_POLICY_BINDING.credentialSlot &&
      binding['fallbackAllowed'] === false &&
      binding['secondModelAllowed'] === false &&
      binding['productionDefaultsChanged'] === false,
  );
  const transmissions = rule['transmissions'];
  requirePolicy(
    isRecord(transmissions) &&
      // The transmission bound of ADR 0079 §2.2, term by term.
      transmissions['boundedByCoverageManifestUnitCount'] === true &&
      transmissions['plusDeclaredSafeRetryAdaptations'] === true &&
      transmissions['plusCrossUnitReductionTopicSections'] === true &&
      transmissions['plusAssuranceSampleAnchorUnits'] === true &&
      transmissions['plusOneRunReportReflectionTurn'] === true &&
      transmissions['oneTechnicalSessionPerAnalysisUnit'] === true &&
      transmissions['accumulatingSingleSessionAllowed'] === false &&
      transmissions['identicalRequestReplaysFromProviderResultCache'] === true &&
      transmissions['repeatedTestItemIdentifierAllowed'] === false &&
      // No web-search allowance yet (ADR 0079 §4.2, §6): the model-tool path waits for the provider
      // assignment design, so a document that enabled it would be one this launch cannot read.
      transmissions['webSearchToolAllowed'] === false,
  );
  // The three suboperations ADR 0066 declares, which v5 names `true`. An absent or non-`true` key is
  // not the pinned document; reading anything but the exact bytes is the zero-transmission denial.
  requirePolicy(
    transmissions['crossUnitReductionAllowed'] === true &&
      transmissions['assuranceSamplingAllowed'] === true &&
      transmissions['runReportReflectionAllowed'] === true,
  );
  const preconditions = rule['authorizationPreconditions'];
  requirePolicy(
    isRecord(preconditions) &&
      preconditions['unsetRunBudgetCeilingAllowed'] === false &&
      preconditions['defaultRunBudgetCeilingTokensPerFrozenUnit'] === DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit &&
      preconditions['defaultRunBudgetCeilingComputedAfterCoverageManifestFreeze'] === true &&
      preconditions['ceilingEvaluatedBeforeEveryDispatch'] === true &&
      preconditions['finalProviderPayloadEgressGateRequired'] === true,
  );
  const limit = rule['providerAccountLimit'];
  requirePolicy(
    isRecord(limit) &&
      limit['classification'] === DEVELOPER_LIVE_POLICY_BINDING.providerAccountLimitClassification &&
      limit['endsRunAsProviderAccountLimit'] === true &&
      limit['retryAllowed'] === false &&
      limit['fallbackAllowed'] === false &&
      limit['secondModelAllowed'] === false,
  );
  const source = rule['source'];
  requirePolicy(isRecord(source) && source['privateManuscriptAllowed'] === false && source['otherBookRefusedBeforeDispatch'] === true);
  const capture = rule['capture'];
  requirePolicy(isRecord(capture) && capture['fixtureEmissionAllowed'] === false && capture['uploadAllowed'] === false && capture['providerResultCacheAllowed'] === true);
  return {
    crossUnitReductionAllowed: true,
    assuranceSamplingAllowed: true,
    runReportReflectionAllowed: true,
  };
}

/**
 * Resolve the build-embedded source-checkout selection for the requested scope. Only the two
 * launch-selectable scopes can verify; every invalid state, including an unselectable or unknown
 * scope, remains the zero-transmission denial.
 */
export async function resolveSourceCheckoutLaunchPolicy(
  codeRoot: string,
  requestedScope: TrustedOperationalScope = 'development-ci',
): Promise<LaunchPolicyProjection> {
  try {
    const carrier = parseJson(await readBuiltFile(codeRoot, CARRIER_PATH));
    requirePolicy(
      exactKeys(carrier, ['manifestType', 'version', 'runtimeForm', 'trustedOperationalScope', 'launchSelectableScopes', 'activePolicySet']) &&
        carrier['manifestType'] === 'ai7-source-checkout-launch-authority' &&
        carrier['version'] === CARRIER_VERSION &&
        carrier['runtimeForm'] === 'source-checkout' &&
        carrier['trustedOperationalScope'] === 'development-ci' &&
        Array.isArray(carrier['launchSelectableScopes']) &&
        carrier['launchSelectableScopes'].length === LAUNCH_SELECTABLE_SCOPES.length &&
        carrier['launchSelectableScopes'].every((scope, index) => scope === LAUNCH_SELECTABLE_SCOPES[index]) &&
        isRecord(carrier['activePolicySet']),
    );
    if (!isTrustedOperationalScope(requestedScope) || !(carrier['launchSelectableScopes'] as unknown[]).includes(requestedScope)) {
      return deny('launch-scope-not-selectable');
    }
    const carrierPin = carrier['activePolicySet'];
    requirePolicy(
      exactKeys(carrierPin, ['version', 'canonicalPath', 'sha256']) &&
        carrierPin['version'] === ACTIVE_SET_VERSION &&
        carrierPin['canonicalPath'] === ACTIVE_SET_PATH &&
        carrierPin['sha256'] === ACTIVE_SET_SHA256,
    );

    const activeSetBytes = await readBuiltFile(codeRoot, ACTIVE_SET_PATH);
    requirePolicy(digest(activeSetBytes) === ACTIVE_SET_SHA256);
    const activeSet = parseJson(activeSetBytes);
    requirePolicy(
      activeSet['manifestType'] === 'ai7-active-policy-set' &&
        activeSet['version'] === ACTIVE_SET_VERSION &&
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
      verifyPin(scopePins[scope], PROVIDER_PINS[scope]);
    }
    const selectedProviderPin = PROVIDER_PINS[requestedScope];
    const selectedProviderBytes = await readBuiltFile(codeRoot, selectedProviderPin.canonicalPath);
    requirePolicy(digest(selectedProviderBytes) === selectedProviderPin.sha256);
    const selectedPolicy = parseJson(selectedProviderBytes);
    verifyProviderPolicy(selectedPolicy, selectedProviderPin.version, selectedProviderPin.canonicalPath);

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
        externalPolicy['version'] === EXTERNAL_PIN.version &&
        externalPolicy['canonicalPath'] === EXTERNAL_PIN.canonicalPath &&
        isRecord(externalPolicy['authoritySeparations']) &&
        externalPolicy['authoritySeparations']['policyEligibilityIsEffectApproval'] === false,
    );

    const externalExport = {
      version: 'v2' as const,
      policyEligibilityIsEffectApproval: false as const,
      currentExportEffectAvailable: false as const,
      label: '对外导出策略独立；当前未提供导出受控动作' as const,
    };
    const publicReleasePermission = { present: false as const, label: '公开发布许可：不存在' as const };
    if (requestedScope === 'developer-live') {
      const suboperations = verifyDeveloperLivePolicy(selectedPolicy);
      return {
        integrityState: 'verified',
        denialReason: null,
        operationalScope: 'developer-live',
        activePolicySetVersion: ACTIVE_SET_VERSION,
        providerProcessing: {
          version: 'v5',
          decision: 'eligible-only',
          authorizedLiveTransmissionCount: 'bounded-by-run',
          liveTransmissionAllowed: true,
          crossUnitReductionAllowed: suboperations.crossUnitReductionAllowed,
          assuranceSamplingAllowed: suboperations.assuranceSamplingAllowed,
          runReportReflectionAllowed: suboperations.runReportReflectionAllowed,
          label: '开发者实时：实时传输受运行边界约束',
        },
        externalExport,
        publicReleasePermission,
      };
    }
    verifyDevelopmentCiPolicy(selectedPolicy);
    return {
      integrityState: 'verified',
      denialReason: null,
      operationalScope: 'development-ci',
      activePolicySetVersion: ACTIVE_SET_VERSION,
      providerProcessing: {
        version: 'v1',
        decision: 'deny',
        authorizedLiveTransmissionCount: 0,
        liveTransmissionAllowed: false,
        // v1 authorizes zero transmissions, so no step of a Run may transmit, these three included.
        crossUnitReductionAllowed: false,
        assuranceSamplingAllowed: false,
        runReportReflectionAllowed: false,
        label: '开发与持续集成：零次实时传输',
      },
      externalExport,
      publicReleasePermission,
    };
  } catch {
    return deny('launch-policy-integrity-denied');
  }
}
