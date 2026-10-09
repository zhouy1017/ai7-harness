import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { LAUNCH_SELECTABLE_SCOPES, isTrustedOperationalScope, type DeveloperLiveCeiling, type LaunchPolicyProjection, type PlatformToolsProjection, type TrustedLaunchForm, type TrustedOperationalScope } from '../shared/protocol.js';
import { readPlatformToolsRule } from './provider/platform-tools.js';

/**
 * The source-checkout launch authority (ADR 0046, ADR 0065): the build-embedded carrier pins active
 * policy set v6, the sole active set for all four Provider Processing scopes, and names the two
 * scopes the built entry may bind from its launch form. `development-ci` is the default and binds
 * Provider Processing v1 (zero live transmissions); `developer-live` is bound only by the launch
 * argument `--trusted-operational-scope developer-live` on a developer host and binds the immutable
 * Provider Processing v8 (Issue #473, S87-f3b: v7's platform-tools analysis rule beside the dialogue
 * rule of ADR 0088). `fixture-recording` and `ordinary-production` are pinned by the active set but
 * are not selectable from the source checkout. No environment variable or product setting selects a
 * scope; every invalid state resolves to the zero-transmission denial.
 */
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const CARRIER_VERSION = 2;
export const ACTIVE_SET_VERSION = 'v6' as const;
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v6.json';
const ACTIVE_SET_SHA256 = 'fbb0649bb533d993b595ce39ea7872397f88e05b21396b69a79ea8283b547d5a';
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
    version: 'v8',
    canonicalPath: 'docs/policies/provider-processing-policy.v8.json',
    sha256: '2465416a5d0a95ef61c3f6a8e628edc3cd3e2bf3f108d690627f299cb6239232',
  },
} as const;
const EXTERNAL_PIN = {
  version: 'v2',
  canonicalPath: 'docs/policies/external-export-policy.v2.json',
  sha256: '162441cc3e5d30b0cafb00a0d04ca5ab32b64c5039baafc8952a9925bd7984b6',
} as const;

/**
 * The exact developer-live binding Provider Processing v8 declares; the resolver verifies the policy bytes say the same.
 * Every value here is a pin the launch refuses to run without matching in the selected document — the policy is the
 * record, this is its checksum — which is why the service entry may arm the allowance set from `websearchHost` before the
 * document is read (arming must precede the network denial), and why a document that names another host is unreadable.
 */
export const DEVELOPER_LIVE_POLICY_BINDING = {
  ruleId: 'developer-live-public-samplebook-analysis',
  /** The second rule of v8 (ADR 0088 §1): one Interactive Editorial Dialogue attempt, no plan, no Run, no web search. */
  dialogueRuleId: 'developer-live-editor-selected-excerpt-dialogue',
  launchArgument: '--trusted-operational-scope developer-live',
  route: 'opencode-go',
  endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
  model: 'deepseek-v4-flash',
  credentialSlot: 'opencode-go',
  /** 90,000 under v8 (ADR 0080 §7.4, the Owner's byte of 2026-09-12), three times v5's 30,000 (ADR 0070). */
  defaultRunBudgetCeilingTokensPerFrozenUnit: 90_000,
  providerAccountLimitClassification: 'quota-exhausted',
  /** The one host the analysis rule's `platformTools.websearch` names (ADR 0080 §7.5); the allowance set's second member. */
  websearchHost: 'search.parallel.ai',
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
 * form leaves it unset, the policy's default is bound per frozen Coverage Manifest unit (ADR 0070;
 * 90,000 tokens under v8, ADR 0080 §7.4), computed once the manifest freezes. Whatever is bound, the
 * ceiling is never `unset`; the cache root defaults to the checkout's sibling directory and must lie
 * outside the checkout so raw Provider material never enters a working tree.
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
 * Provider Processing v8: default deny with exactly two developer-live eligible-only rules. The first is the analysis
 * rule — its exact binding, the three declared suboperations of ADR 0066, the per-frozen-unit Run Budget Ceiling default
 * of ADR 0070 as ADR 0080 §7.4 sizes it, the house-people redaction rule of ADR 0079 §4.4, the web-search switch on and
 * the `platformTools` block of ADR 0080 §7.5 naming the pinned search host. The second is the Interactive Editorial
 * Dialogue rule of ADR 0088 §1: the same binding, redaction and account-limit terms, the excerpt category, no plan and no
 * Run Authorization, one transmission over one Session per attempt, and the web-search switch off. The projection reads
 * exactly those bytes, and a field that does not match is a policy the launch cannot read — the zero-transmission denial.
 * A one-rule document (v5, v7) is such a policy.
 *
 * Exported so the reading of the rules' exact fields can be pinned against the real v8 bytes with one field varied. The
 * document digests this resolver checks are constants of this module, so a policy revision could not be fed through
 * `resolveSourceCheckoutLaunchPolicy` at all — which is the point of the pins, and why the reading is tested here instead.
 */
export function verifyDeveloperLivePolicy(policy: Record<string, unknown>): {
  crossUnitReductionAllowed: boolean;
  assuranceSamplingAllowed: boolean;
  runReportReflectionAllowed: boolean;
  webSearchToolAllowed: true;
  platformTools: PlatformToolsProjection;
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
  // Exactly the two rules of v8 (ADR 0088 §3): the analysis rule first, the dialogue rule second. A one-rule document —
  // v5, or the never-selected v7 — is not the pinned document, whatever its other bytes say.
  requirePolicy(isRecord(decision) && decision['default'] === 'deny' && Array.isArray(decision['providerAllowRules']) && decision['providerAllowRules'].length === 2);
  const rule: unknown = decision['providerAllowRules'][0];
  requirePolicy(isRecord(rule) && rule['ruleId'] === DEVELOPER_LIVE_POLICY_BINDING.ruleId && rule['policyResult'] === 'eligible-only');
  const dialogueRule: unknown = decision['providerAllowRules'][1];
  requirePolicy(isRecord(dialogueRule) && dialogueRule['ruleId'] === DEVELOPER_LIVE_POLICY_BINDING.dialogueRuleId && dialogueRule['policyResult'] === 'eligible-only');
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
      // The web-search switch is on for the analysis rule (ADR 0080 §7.5; v8 carries v7's bytes here), and what it
      // admits is the `platformTools` block read below — a document with the switch off is v5's reading, not v8's.
      transmissions['webSearchToolAllowed'] === true,
  );
  // The platform tools the rule names, exactly as ADR 0080 §7.5 writes them, read by the one reader every consumer of the
  // block shares; a malformed block throws there, and a block naming another search host is not the pinned document.
  const platformTools = readPlatformToolsRule(rule);
  requirePolicy(platformTools !== null && platformTools.websearch.host === DEVELOPER_LIVE_POLICY_BINDING.websearchHost);
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
  verifyDialogueRule(dialogueRule, { binding, redaction, limit });
  return {
    crossUnitReductionAllowed: true,
    assuranceSamplingAllowed: true,
    runReportReflectionAllowed: true,
    webSearchToolAllowed: true,
    platformTools,
  };
}

/**
 * The dialogue rule of ADR 0088 §1, term by term: carried unchanged from the analysis rule — the exact binding, the
 * house-people redaction, the Provider Account Limit (§1.5) — and its own terms: the excerpt category (§1.4), one
 * foreground attempt as the authority with no Plan Envelope and no Run Authorization (§1.1), one transmission over one
 * Session per attempt (§1.2), no Run Budget Ceiling because one bounded payload is the bound (§1.6), the Harness Session
 * Ledger as the only persistence (§1.7), and no web search (§1.5). Nothing here authorizes a dialogue transmission: the
 * dialogue owner's gate branch is S17c's, and until it lands asking under `developer-live` stays refused as S17a built it.
 */
function verifyDialogueRule(
  rule: Record<string, unknown>,
  analysis: { readonly binding: Record<string, unknown>; readonly redaction: Record<string, unknown>; readonly limit: Record<string, unknown> },
): void {
  requirePolicy(rule['purpose'] === 'developer-live-interactive-editorial-dialogue');
  const origin = rule['authorityOrigin'];
  requirePolicy(
    isRecord(origin) &&
      origin['editorStartedForegroundAttemptRequired'] === true &&
      origin['exactSelectionAndQuestionAreTheAuthority'] === true &&
      origin['newlyUserInitiatedTaskRequired'] === false &&
      origin['directRunAuthorizationRequired'] === false &&
      origin['matchingActiveDefaultExecutionRuleAllowed'] === false &&
      origin['backgroundAnalysisEnrollmentAllowed'] === false &&
      origin['idleScheduledImportTriggeredOrCrossRunDispatchAllowed'] === false,
  );
  const mode = rule['executionMode'];
  requirePolicy(isRecord(mode) && mode['humanAttended'] === true && mode['developerHostOnly'] === true && mode['ciAllowed'] === false && mode['hostedAllowed'] === false && mode['backgroundAllowed'] === false);
  const categories = rule['allowedOutboundDataCategories'];
  requirePolicy(Array.isArray(categories) && categories.length === 1 && categories[0] === 'editor-selected-manuscript-excerpt');
  // Carried unchanged from the analysis rule (§1.5): the same bytes, compared field by field rather than by trust.
  for (const [key, expected] of [['providerBinding', analysis.binding], ['redaction', analysis.redaction]] as const) {
    const actual = rule[key];
    requirePolicy(isRecord(actual) && exactKeys(actual, Object.keys(expected)) && Object.keys(expected).every((field) => actual[field] === expected[field]));
  }
  // The Provider Account Limit ends the attempt as the analysis rule's ends the Run: same classification, no retry, no
  // fallback, no second model.
  const limit = rule['providerAccountLimit'];
  requirePolicy(
    isRecord(limit) &&
      limit['classification'] === analysis.limit['classification'] &&
      limit['endsAttemptAsProviderAccountLimit'] === true &&
      limit['retryAllowed'] === false &&
      limit['fallbackAllowed'] === false &&
      limit['secondModelAllowed'] === false,
  );
  const transmissions = rule['transmissions'];
  requirePolicy(
    isRecord(transmissions) &&
      transmissions['oneTransmissionPerAttempt'] === true &&
      transmissions['oneTechnicalSessionPerAttempt'] === true &&
      transmissions['retryResendOrContinuationWithinSessionAllowed'] === false &&
      transmissions['continueAndRegenerateAreNewAttempts'] === true &&
      transmissions['identicalRequestReplaysFromProviderResultCache'] === true &&
      transmissions['repeatedTestItemIdentifierAllowed'] === false &&
      // Row 18's permission to use the web is not taken up here (ADR 0088 §1.5): a dialogue rule with the switch on would
      // be a document this launch cannot read.
      transmissions['webSearchToolAllowed'] === false,
  );
  const preconditions = rule['authorizationPreconditions'];
  requirePolicy(
    isRecord(preconditions) &&
      preconditions['planEnvelopeRequired'] === false &&
      preconditions['runAuthorizationRequired'] === false &&
      preconditions['runBudgetCeilingApplies'] === false &&
      preconditions['costBound'] === 'one-bounded-payload-per-attempt' &&
      preconditions['finalProviderPayloadEgressGateRequired'] === true &&
      preconditions['frozenBeforeTransmission'] === true,
  );
  const source = rule['source'];
  requirePolicy(isRecord(source) && source['privateManuscriptAllowed'] === false && source['otherBookRefusedBeforeDispatch'] === true && source['editedRevisionsOfAdmittedBookAllowed'] === true);
  const capture = rule['capture'];
  requirePolicy(
    isRecord(capture) &&
      capture['fixtureEmissionAllowed'] === false &&
      capture['uploadAllowed'] === false &&
      capture['providerResultCacheAllowed'] === true &&
      capture['harnessSessionLedgerUnderAgentDataRootIsTheOnlyPersistence'] === true &&
      capture['ai7RelationLogOrDiagnosticHoldsQuestionOrAnswer'] === false,
  );
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

    // External Export Policy v2 verified: a local export Effect can be offered (Issue #413), each file still
    // needing its own preparation and approval.
    const externalExport = {
      version: 'v2' as const,
      policyEligibilityIsEffectApproval: false as const,
      currentExportEffectAvailable: true,
      label: '对外导出策略 v2 已校验：只导出到本机所选位置，每个文件单独批准' as const,
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
          version: 'v8',
          decision: 'eligible-only',
          authorizedLiveTransmissionCount: 'bounded-by-run',
          liveTransmissionAllowed: true,
          crossUnitReductionAllowed: suboperations.crossUnitReductionAllowed,
          assuranceSamplingAllowed: suboperations.assuranceSamplingAllowed,
          runReportReflectionAllowed: suboperations.runReportReflectionAllowed,
          // The analysis rule's switch and block, read from the v8 bytes (ADR 0080 §7.5): what the service entry armed
          // and what the execution owner may register for a Run whose kind declares web search.
          webSearchToolAllowed: suboperations.webSearchToolAllowed,
          platformTools: suboperations.platformTools,
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
