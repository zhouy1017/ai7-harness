import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { LAUNCH_SELECTABLE_SCOPES, isTrustedOperationalScope, type AdmittedLocalTools, type AdmittedPlatformTools, type AdmittedProviderRule, type DeveloperLiveCeiling, type OutboundDataCategoryId, type DevelopmentValidationIntent, type LaunchPolicyProjection, type TrustedLaunchForm, type TrustedOperationalScope } from '../shared/protocol.js';
import { CREDENTIAL_REFERENCE_PATTERN, DEVELOPMENT_CREDENTIAL_REFERENCES } from '../shared/protected-secret-identity.js';
import { CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES, CONFIGURED_RUNTIME_MODEL_TABLE } from '../shared/provider-configuration.generated.js';
import {
  PLATFORM_TOOL_BREAKER_END, PLATFORM_TOOL_ROUND_TRIP_BREAKER, WEBFETCH_MAX_BYTES, WEBFETCH_TIMEOUT_SECONDS, isConfiguredPlatformTools, readPlatformToolsRule,
} from './provider/platform-tools.js';
import {
  LOCAL_TOOL_BREAKER_END, LOCAL_TOOL_CALLS_PER_UNIT, LOCAL_TOOL_CANDIDATES_PER_CALL, LOCAL_TOOL_DECLARATION_NAMES, LOCAL_TOOL_ROUND_TRIP_BREAKER, readLocalToolsRule,
} from './provider/local-tools.js';
import { modelProfileFor } from './provider/model-profile.js';
import type { RemoteExecutionRoute } from './provider/egress-gate.js';
import { SEARCH_BACKENDS } from './provider/search-backends.js';
import { CURRENT_PRODUCTION_POLICY_SHA256, CURRENT_ACTIVE_SET_SHA256, DEVELOPMENT_CI_POLICY_SHA256, ORIGINAL_FIELDS_ACTIVE_SET_SHA256, ORIGINAL_FIELDS_POLICY_SHA256, LOCAL_FIXTURE_POLICY_SHA256, LOCAL_FIXTURE_MANIFEST_SHA256,
  selectedPolicyIdentityOf, localFixtureProfileOf } from '../shared/protocol.js';
export { ORIGINAL_FIELDS_ACTIVE_SET_SHA256, ORIGINAL_FIELDS_POLICY_SHA256, LOCAL_FIXTURE_POLICY_SHA256, LOCAL_FIXTURE_MANIFEST_SHA256,
  isSupportedProviderProcessingVersion, selectedPolicyIdentityOf, localFixtureProfileOf, LOCAL_FIXTURE_RULE_IDS } from '../shared/protocol.js';
import { canonicalJson } from './analysis/canonical.js';

/**
 * The source-checkout launch authority (ADR 0046, ADR 0065): the build-embedded carrier pins active
 * policy set v22, the sole active set for all four Provider Processing scopes, and names the three
 * scopes the built entry may bind from its launch form. `development-ci` is the default and binds
 * Provider Processing v1 (zero live transmissions); `developer-live` is bound only by the launch
 * argument `--trusted-operational-scope developer-live` on a developer host and binds the immutable
 * Provider Processing v24; `ordinary-production` is bound only by `--trusted-operational-scope ordinary-production`
 * and binds v31, whose rules are filled from the editor's own configured provider binding. `fixture-recording`
 * is pinned by the active set but is not selectable from the source checkout. No environment variable or product
 * setting selects a scope; every invalid state resolves to the zero-transmission denial.
 */
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const CARRIER_VERSION = 2;
export const ACTIVE_SET_VERSION = 'v22' as const;
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v22.json';
const ACTIVE_SET_SHA256 = CURRENT_ACTIVE_SET_SHA256;
const PROVIDER_PINS = {
  'development-ci': {
    version: 'v1',
    canonicalPath: 'docs/policies/provider-processing-policy.v1.json',
    sha256: DEVELOPMENT_CI_POLICY_SHA256,
  },
  'fixture-recording': {
    version: 'v2',
    canonicalPath: 'docs/policies/provider-processing-policy.v2.json',
    sha256: 'd0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc',
  },
  'ordinary-production': {
    version: 'v31',
    canonicalPath: 'docs/policies/provider-processing-policy.v31.json',
    sha256: CURRENT_PRODUCTION_POLICY_SHA256,
  },
  'developer-live': {
    version: 'v24',
    canonicalPath: 'docs/policies/provider-processing-policy.v24.json',
    sha256: '1522e203f3ead6a259f93494e25c34526a024f93a757b1c7d22568e219f4a6b6',
  },
} as const;
/**
 * The Provider Processing version the active set pins for `developer-live`. Code that records or checks the developer-live
 * pin compares against this, and against `ACTIVE_SET_VERSION`, rather than a literal, so a successor set edits only this module.
 */
export const DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION = PROVIDER_PINS['developer-live'].version;
/** The Provider Processing version the active set pins for `ordinary-production`: local production over the editor's own configured provider. */
export const ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION = PROVIDER_PINS['ordinary-production'].version;
const EXTERNAL_PIN = {
  version: 'v2',
  canonicalPath: 'docs/policies/external-export-policy.v2.json',
  sha256: '162441cc3e5d30b0cafb00a0d04ca5ab32b64c5039baafc8952a9925bd7984b6',
} as const;

/**
 * The exact developer-live binding every rule of Provider Processing v16 declares, and the one rule v9 declared; the resolver
 * verifies the policy bytes say the same. `ruleId` is the baseline analysis rule, whose reading the projection's suboperation
 * flags come from.
 */
export const DEVELOPER_LIVE_POLICY_BINDING = {
  ruleId: 'developer-live-public-samplebook-analysis',
  launchArgument: '--trusted-operational-scope developer-live',
  ...CONFIGURED_RUNTIME_MODEL_TABLE.developerLive,
  defaultRunBudgetCeilingTokensPerFrozenUnit: 30_000,
  providerAccountLimitClassification: 'quota-exhausted',
} as const;

/** The sibling directory of the checkout that holds the Provider Result Cache when no root is named. */
export const DEFAULT_PROVIDER_CACHE_DIRECTORY = 'ai7-harness-provider-cache';

/**
 * Reviewed v26 runtime choices, default first (ADR 0095 §6). The store lists these routes and the service arms their
 * declared hosts. The verifier separately checks the immutable policy baseline; a choice is never a fallback chain.
 */
export const ORDINARY_PRODUCTION_ALLOWED_BINDINGS = CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction.main;
export type OrdinaryProductionAllowedBinding = (typeof ORDINARY_PRODUCTION_ALLOWED_BINDINGS)[number];
export const ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS = CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction.fast;
export type OrdinaryProductionFastAllowedBinding = (typeof ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS)[number];

export const CONNECTION_TEST_KIND = 'model-connection-test' as const;
export const CONNECTION_TEST_POLICY = {
  purpose: 'explicit-synthetic-model-connection-test', taskKind: CONNECTION_TEST_KIND,
  ruleId: 'ordinary-production-model-connection-test', modelRole: 'Fast Interaction Role',
  explicitEditorActionRequired: true, source: 'fixed-public-synthetic-only', bookMaterialAllowed: false,
  message: 'AI7 public connection test. Reply with AI7_OK only.',
  systemPrompt: 'This is a public synthetic AI7 text connection test. Do not call tools.',
  maxInputCharacters: 256, maxOutputTokens: 512, requestsPerAction: 1,
  responseBodiesRetained: false, automaticRetryAllowed: false, toolsVerified: false, streamingVerified: false,
  allowedBindings: ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS,
} as const;

/**
 * The allowed binding a configured one names exactly, on a well-formed production Credential Reference (Issue #811); `null` for any
 * other binding and for a reference a provider document fixes for development, which a production connection never holds.
 */
export function allowedProductionBindingOf(binding: ConfiguredProviderBinding | null): OrdinaryProductionAllowedBinding | null;
export function allowedProductionBindingOf(binding: ConfiguredProviderBinding | null, role: 'fast-interaction'): OrdinaryProductionFastAllowedBinding | null;
export function allowedProductionBindingOf(binding: ConfiguredProviderBinding | null, role?: 'fast-interaction'): OrdinaryProductionFastAllowedBinding | null {
  if (binding === null || !CREDENTIAL_REFERENCE_PATTERN.test(binding.credentialReference) ||
      DEVELOPMENT_CREDENTIAL_REFERENCES.has(binding.credentialReference.toLowerCase())) return null;
  const allowedBindings = role === 'fast-interaction' ? ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS : ORDINARY_PRODUCTION_ALLOWED_BINDINGS;
  return allowedBindings.find((allowed) => allowed.route === binding.route && allowed.endpoint === binding.endpoint &&
    allowed.model === binding.model && allowed.credentialSlot === binding.credentialSlot) ?? null;
}

/**
 * The developer-live launch facts derived from the form: the required ceiling, the cache root outside the checkout, and the
 * development validation the launch performs.
 */
export interface DeveloperLiveLaunch {
  /** The explicit form ceiling, or the policy's per-frozen-unit default when the form left it unset. */
  readonly runBudgetCeiling: DeveloperLiveCeiling;
  readonly providerCacheRoot: string;
  /**
   * The development validation every model call of this launch belongs to (Issue #808): the Provider Test Ledger and Result
   * Cache answer, refuse or record a call by it. A resolved launch always names one. `null` is the business boundary — no
   * launch selects it while ordinary production stays unselectable (#811) — under which a model call reaches the transport
   * itself and nothing reads or writes the developer cache or ledger.
   */
  readonly validation: DevelopmentValidationIntent | null;
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

/**
 * Everything an ordinary-production launch carries past the network denial (Issue #811): the native `fetch` the service entry
 * captured, and nothing of development — no launch ceiling, no Provider Result Cache root, no development validation. Which
 * route a Run takes is its frozen plan's, from the editor's configured binding; the runtime exists only when the launch policy
 * actually bound `ordinary-production`.
 */
export interface OrdinaryProductionRuntime {
  readonly scope: 'ordinary-production';
  /** The native `fetch`, captured before `installNodeNetworkDenial()`; only the two production routes' transports receive it. */
  readonly nativeFetch: typeof fetch;
}

/** The runtime a live launch carries: developer-live's, or ordinary production's. */
export type LiveRuntime = DeveloperLiveRuntime | OrdinaryProductionRuntime;

/** Whether a live runtime is ordinary production's. */
export function isOrdinaryProductionRuntime(runtime: LiveRuntime | null | undefined): runtime is OrdinaryProductionRuntime {
  return runtime !== null && runtime !== undefined && 'scope' in runtime && runtime.scope === 'ordinary-production';
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
  // developer-live is a developer-test scope: a launch that names no development validation fails closed here, before any
  // Run could dispatch, rather than sending outside the ledger.
  if (form.validation === null) throw new Error('LAUNCH_VALIDATION_INTENT_REQUIRED');
  return { runBudgetCeiling, providerCacheRoot, validation: form.validation };
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

function policyFilePath(codeRoot: string, canonicalPath: string): string {
  requirePolicy(!isAbsolute(canonicalPath) && canonicalPath.split('/').every((part) => part !== '..' && part !== ''));
  const target = resolve(codeRoot, ...canonicalPath.split('/'));
  const relation = relative(codeRoot, target);
  requirePolicy(relation !== '' && !relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
  return target;
}

async function readBuiltFile(codeRoot: string, canonicalPath: string): Promise<Buffer> {
  return readFile(policyFilePath(codeRoot, canonicalPath));
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
      admittedRules: [],
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
  if (policy['version'] === 'v29') requirePolicy(
    digest(Buffer.from(canonicalJson(policy))) === 'e8e6c8804d80bbd4805cbcd71e8c23c45f31b4b3c9aa0e260aaf55da4712f213' &&
    isRecord(policy['legacyLocalFixtureCompatibility']) && policy['legacyLocalFixtureCompatibility']['manifestSha256'] === LOCAL_FIXTURE_MANIFEST_SHA256);
  requirePolicy(
    isRecord(policy['decision']) &&
      policy['decision']['default'] === 'deny' &&
      Array.isArray(policy['decision']['providerAllowRules']) &&
      policy['decision']['providerAllowRules'].length === 0 &&
      policy['decision']['authorizedLiveTransmissionCount'] === 0,
  );
}

/** Every outbound key a Provider Processing allow rule's binding must state exactly: one route, no fallback, no second model. */
function verifyRuleBinding(rule: Record<string, unknown>, modelRole: string): void {
  const binding = rule['providerBinding'];
  requirePolicy(
    isRecord(binding) &&
      binding['modelRole'] === modelRole &&
      binding['route'] === DEVELOPER_LIVE_POLICY_BINDING.route &&
      binding['endpoint'] === DEVELOPER_LIVE_POLICY_BINDING.endpoint &&
      binding['model'] === DEVELOPER_LIVE_POLICY_BINDING.model &&
      binding['credentialSlot'] === DEVELOPER_LIVE_POLICY_BINDING.credentialSlot &&
      binding['fallbackAllowed'] === false &&
      binding['secondModelAllowed'] === false &&
      binding['productionDefaultsChanged'] === false,
  );
}

/** One boolean of a rule's `source` block as the projection carries it: `true` only when the block states it `true`; absent is `false`. */
function sourceFlag(rule: Record<string, unknown>, key: 'materialReferencesAllowed' | 'editorialDeliverablesAllowed' | 'seriesKnowledgeAllowed'): boolean {
  const source = rule['source'];
  return isRecord(source) && source[key] === true;
}

function exactStrings(value: unknown, expected: readonly string[]): value is string[] {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

/**
 * What every developer-live allow rule shares, whatever it admits: eligibility only, the developer host and no hosted, CI,
 * scheduled or background execution, admitted sample sources only, the house-people redaction rule of ADR 0079 §4.4, the
 * protected local capture, and no extra privacy prompt. The web switch is the rule's own (`verifyPlatformTools`). Only the
 * enrolled-background rule (`background`) is scheduled and background; every other rule states both `false`.
 */
function verifyRuleCommon(rule: Record<string, unknown>, background = false): void {
  requirePolicy(rule['policyResult'] === 'eligible-only');
  const mode = rule['executionMode'];
  requirePolicy(isRecord(mode) && mode['humanAttended'] === false && mode['developerHostOnly'] === true &&
    mode['ciAllowed'] === false && mode['hostedAllowed'] === false && mode['scheduledAllowed'] === background && mode['backgroundAllowed'] === background);
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
  const source = rule['source'];
  requirePolicy(isRecord(source) && source['privateManuscriptAllowed'] === false && source['otherBookRefusedBeforeDispatch'] === true);
  const transmissions = rule['transmissions'];
  requirePolicy(isRecord(transmissions) &&
    transmissions['identicalRequestReplaysFromProviderResultCache'] === true && transmissions['repeatedTestItemIdentifierAllowed'] === false);
  const capture = rule['capture'];
  requirePolicy(isRecord(capture) && capture['fixtureEmissionAllowed'] === false && capture['uploadAllowed'] === false && capture['providerResultCacheAllowed'] === true);
  const limit = rule['providerAccountLimit'];
  requirePolicy(
    isRecord(limit) &&
      limit['classification'] === DEVELOPER_LIVE_POLICY_BINDING.providerAccountLimitClassification &&
      limit['retryAllowed'] === false &&
      limit['fallbackAllowed'] === false &&
      limit['secondModelAllowed'] === false,
  );
}

/**
 * A planned Run's origin: a newly user-initiated Task, authorized directly or, for writing quick start only, by its matching
 * active Default Execution Rule. Enrollment and scheduled origins stay refused.
 * `assuranceAnchors` is whether the kind samples a result for assurance (baseline analysis and review do; writing and the
 * evaluation contracts declare no sample), which the rule's transmission bound must state either way.
 */
function verifyPlannedRunOrigin(rule: Record<string, unknown>, assuranceAnchors = true, defaultExecutionRuleAllowed = false): void {
  const origin = rule['authorityOrigin'];
  requirePolicy(isRecord(origin) && origin['newlyUserInitiatedTaskRequired'] === true &&
    origin['directRunAuthorizationAllowed'] === true && origin['matchingActiveDefaultExecutionRuleAllowed'] === defaultExecutionRuleAllowed &&
    origin['backgroundAnalysisEnrollmentAllowed'] === false && origin['idleScheduledImportTriggeredOrCrossRunDispatchAllowed'] === false);
  const preconditions = rule['authorizationPreconditions'];
  requirePolicy(
    isRecord(preconditions) &&
      preconditions['unsetRunBudgetCeilingAllowed'] === false &&
      preconditions['defaultRunBudgetCeilingTokensPerFrozenUnit'] === DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit &&
      preconditions['defaultRunBudgetCeilingComputedAfterCoverageManifestFreeze'] === true &&
      preconditions['ceilingEvaluatedBeforeEveryDispatch'] === true &&
      preconditions['finalProviderPayloadEgressGateRequired'] === true,
  );
  const limit = rule['providerAccountLimit'] as Record<string, unknown>;
  requirePolicy(limit['endsRunAsProviderAccountLimit'] === true);
  verifyPlannedBound(rule, assuranceAnchors);
}

/** The transmission bound of ADR 0079 §2.2, term by term, shared by every planned kind and by the enrolled background Run. */
function verifyPlannedBound(rule: Record<string, unknown>, assuranceAnchors: boolean): void {
  const transmissions = rule['transmissions'] as Record<string, unknown>;
  requirePolicy(
    transmissions['boundedByCoverageManifestUnitCount'] === true &&
      transmissions['plusDeclaredSafeRetryAdaptations'] === true &&
      transmissions['plusAssuranceSampleAnchorUnits'] === assuranceAnchors &&
      transmissions['plusOneRunReportReflectionTurn'] === true &&
      transmissions['oneTechnicalSessionPerAnalysisUnit'] === true &&
      transmissions['accumulatingSingleSessionAllowed'] === false,
  );
}

/** The outbound categories a research rule adds (Provider Processing v16 and v17): the model's own query and a cited public page. */
const WEB_TOOL_CATEGORIES = ['web-search-query', 'public-source-fetch'] as const satisfies readonly OutboundDataCategoryId[];
/** The review categories that research the web (事实核查, 学术道德与引用), admitted kinds of the review rule since v16;
 * `factual-review` is the factual category's executor id. 出版政策与风险 stays outside every rule until its web declaration (#744). */
const WEB_REVIEW_KINDS = ['editorial-review/factual-review', 'editorial-review/academic-integrity', 'factual-review'] as const;

/** Whether `actual` is exactly `expected`, recursively: the same keys at every level, the same primitives, lists in the same order. */
function sameValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => sameValue(actual[index], item));
  }
  if (isRecord(expected)) {
    return isRecord(actual) && exactKeys(actual, Object.keys(expected)) && Object.entries(expected).every(([key, value]) => sameValue(actual[key], value));
  }
  return actual === expected;
}

/**
 * The `platformTools` block a research rule of Provider Processing v16 (developer-live) or v17 (ordinary-production) must state,
 * built at verification time from the search backend registry (Issue #883): every shipped backend, in the recorded ranking order,
 * with the host and endpoint its provider document declares and its broker slot — under developer-live with the development
 * Credential Reference its document fixes, under production with the editor's own key required to select it; the webfetch bounds
 * and the breaker are this build's constants. A registry with no shipped backend, a keyless one or one without an endpoint makes
 * every research rule unreadable: the launch denies rather than guess.
 */
function expectedPlatformTools(scope: 'developer-live' | 'ordinary-production'): Record<string, unknown> {
  const shipped = SEARCH_BACKENDS.filter((entry) => entry.shipped);
  requirePolicy(shipped.length > 0 && shipped.every((entry) => entry.keyRequired && entry.endpoint !== null && entry.host !== null));
  return {
    websearch: {
      selection: 'user-configured',
      backends: shipped.map((entry) => ({
        id: entry.id,
        host: entry.host,
        endpoint: entry.endpoint,
        credentialSlot: entry.credentialSlot,
        anonymous: false,
        ...(scope === 'developer-live' ? { developmentCredentialReference: CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES[entry.credentialSlot] } : {}),
      })),
      ...(scope === 'ordinary-production' ? { selectionRequiresCredential: true, userConfiguredBackendAuthorizesTransmission: false } : {}),
    },
    webfetch: { maxBytes: WEBFETCH_MAX_BYTES, timeoutSeconds: WEBFETCH_TIMEOUT_SECONDS, boundedByCitations: true },
    breaker: { roundTrips: PLATFORM_TOOL_ROUND_TRIP_BREAKER, end: PLATFORM_TOOL_BREAKER_END },
    oneQueryPerRunUnit: true,
    toolResultCategory: 'public-or-synthetic',
  };
}

/**
 * A rule's web switch and platform tools (Provider Processing v16 and v17), read whole: a rule that may research states
 * `webSearchToolAllowed: true` and exactly the expected block; every other rule states `false` and names no block. A missing,
 * malformed or tampered term, a backend outside the registry's shipped set, or the switch on without the block is a policy this
 * launch cannot read. Returns the projection of the verified block, or `null` for a rule without web.
 */
function verifyPlatformTools(rule: Record<string, unknown>, scope: 'developer-live' | 'ordinary-production', research: boolean): AdmittedPlatformTools | null {
  const transmissions = rule['transmissions'];
  requirePolicy(isRecord(transmissions));
  if (!research) {
    requirePolicy(transmissions['webSearchToolAllowed'] === false && !Object.hasOwn(rule, 'platformTools'));
    return null;
  }
  requirePolicy(transmissions['webSearchToolAllowed'] === true && sameValue(rule['platformTools'], expectedPlatformTools(scope)));
  let reading: ReturnType<typeof readPlatformToolsRule>;
  try {
    reading = readPlatformToolsRule(rule);
  } catch {
    reading = null;
  }
  requirePolicy(reading !== null && isConfiguredPlatformTools(reading));
  return {
    websearch: {
      selection: reading.websearch.selection,
      backends: reading.websearch.backends.map((backend) => ({ id: backend.id, host: backend.host, credentialSlot: backend.credentialSlot })),
      selectionRequiresCredential: reading.websearch.selectionRequiresCredential,
    },
    webfetch: { ...reading.webfetch },
    breaker: { ...reading.breaker },
    oneQueryPerRunUnit: reading.oneQueryPerRunUnit,
    toolResultCategory: reading.toolResultCategory,
  };
}

/**
 * The `localTools` block every rule of Provider Processing v18 (developer-live) and v19 (ordinary-production) must state (Issue
 * #891; ADR 0026, ADR 0047): targeted retrieval over the Run's authorized pinned sources, no egress, an Exact Fetch before any
 * citation, at most 5 calls of 8 candidates per unit, and a 128-round-trip breaker ending 检索未完成. Enrolled background analysis
 * and 来源译文 state the same block with retrieval not allowed. The bounds are this build's constants.
 */
function expectedLocalTools(allowed: boolean): AdmittedLocalTools {
  return {
    targetedRetrieval: {
      allowed,
      source: 'authorized-pinned-sources-only',
      callsPerUnit: LOCAL_TOOL_CALLS_PER_UNIT,
      candidatesPerCall: LOCAL_TOOL_CANDIDATES_PER_CALL,
      exactFetchRequiredBeforeCitation: true,
      scope: 'no-egress',
    },
    breaker: { roundTrips: LOCAL_TOOL_ROUND_TRIP_BREAKER, end: LOCAL_TOOL_BREAKER_END },
  };
}

/**
 * A rule's local tools (Provider Processing v18 and v19), read whole: every rule states exactly the expected block, with
 * `targetedRetrieval.allowed` false for the enrolled background rule and the 来源译文 rule (a bounded translation of one excerpt
 * has nothing to search) and true for every other. A missing, malformed or tampered
 * term, a changed bound, or retrieval allowed in the background is a policy this launch cannot read. Returns the projection of
 * the verified block.
 */
function verifyLocalTools(rule: Record<string, unknown>, noRetrieval: boolean): AdmittedLocalTools {
  requirePolicy(sameValue(rule['localTools'], expectedLocalTools(!noRetrieval)));
  let reading: ReturnType<typeof readLocalToolsRule>;
  try {
    reading = readLocalToolsRule(rule);
  } catch {
    reading = null;
  }
  requirePolicy(reading !== null);
  return { targetedRetrieval: { ...reading.targetedRetrieval }, breaker: { ...reading.breaker } };
}

/** The task kind of 来源译文 of a 资料库 material (Provider Processing v18 and v19, Issue #891): one foreground attempt on the Fast Interaction Role. */
export const MATERIAL_TRANSLATION_KIND = 'material-translation';

/**
 * A rule's `sourceTranslationAllowed` (Provider Processing v18 and v19): the research review rule states `true` so a retained external
 * source's passage may be translated into Chinese by the Run's own model; every other rule names no such term. A missing,
 * non-`true` or unexpected term is a policy this launch cannot read.
 */
function verifySourceTranslation(rule: Record<string, unknown>, allowed: boolean): boolean {
  requirePolicy(allowed ? rule['sourceTranslationAllowed'] === true : !Object.hasOwn(rule, 'sourceTranslationAllowed'));
  return allowed;
}

/** The outbound data category of the house's review-preference block (Provider Processing v20 and v21, Issue #910): the review rule alone names it. */
export const HOUSE_REVIEW_PREFERENCE_CATEGORY = 'house-review-preference-excerpt' as const satisfies OutboundDataCategoryId;
/** The most lines, and the most graphemes in total, one request's house review-preference block may carry. The bounds are this build's constants. */
export const HOUSE_REVIEW_PREFERENCE_MAX_LINES = 12;
export const HOUSE_REVIEW_PREFERENCE_MAX_GRAPHEMES = 200;

/** The Chinese-first statement of the category's declaration, with the exact bounds, as the policy writes it. */
function houseReviewPreferenceDescriptionZh(scope: 'developer-live' | 'ordinary-production'): string {
  const source = scope === 'developer-live'
    ? '开发直连下只取自已获准的公开或合成图书（Owner 指定的公开样书）'
    : '普通生产下只取自普通生产来源（编辑自己的稿件所属的本社判断记录）';
  return `本社审阅偏好摘录：由本社编辑自己对审阅发现已作出的判断（采纳、改后采纳、忽略并说明理由）归纳出的类别偏好行与理由短语，随审阅请求一并发出。每次请求至多 ${HOUSE_REVIEW_PREFERENCE_MAX_LINES} 行、合计至多 ${HOUSE_REVIEW_PREFERENCE_MAX_GRAPHEMES} 个字素；必须标明所依据的偏好记录版本；绝不含稿件正文，绝不含作者或编辑姓名；${source}。`;
}

/**
 * A rule's `houseReviewPreference` declaration (Provider Processing v20 and v21), read whole: the review rule alone states it, with the
 * exact bounds, derived only from the same house's judged review decisions, attributed to a record version, never manuscript text and never
 * author or editor names, and from admitted public-or-synthetic Books under developer-live or ordinary-production sources under production.
 * Every other rule names neither the declaration nor the category. A missing, changed or unexpected term is a policy this launch cannot read.
 */
function verifyHouseReviewPreference(rule: Record<string, unknown>, scope: 'developer-live' | 'ordinary-production', declared: boolean): void {
  const categories = rule['allowedOutboundDataCategories'];
  requirePolicy(Array.isArray(categories) && categories.includes(HOUSE_REVIEW_PREFERENCE_CATEGORY) === declared);
  if (!declared) {
    requirePolicy(!Object.hasOwn(rule, 'houseReviewPreference'));
    return;
  }
  const declaration = rule['houseReviewPreference'];
  requirePolicy(sameValue(declaration, {
    category: HOUSE_REVIEW_PREFERENCE_CATEGORY,
    derivedFrom: 'judged-review-decisions-of-the-same-house',
    maxLines: HOUSE_REVIEW_PREFERENCE_MAX_LINES,
    maxGraphemesTotal: HOUSE_REVIEW_PREFERENCE_MAX_GRAPHEMES,
    attributedToRecordVersion: true,
    manuscriptTextAllowed: false,
    housePeopleNamesAndRolesStripped: true,
    authorOrEditorNamesAllowed: false,
    sourceScope: scope === 'developer-live' ? 'admitted-public-or-synthetic-books-only' : 'ordinary-production-sources-only',
    descriptionZh: houseReviewPreferenceDescriptionZh(scope),
  }));
}

/** The outbound data category of an editor-authored per-unit question template (Provider Processing v22 and v23, Issue #920): the custom analysis rule alone names it. */
export const EDITOR_AUTHORED_QUESTION_TEMPLATE_CATEGORY = 'editor-authored-question-template' as const satisfies OutboundDataCategoryId;
/** The most graphemes one editor-authored question template may carry. The bound is this build's constant. */
export const EDITOR_AUTHORED_QUESTION_TEMPLATE_MAX_GRAPHEMES = 400;
/** The outbound data category of Series Knowledge excerpts (Provider Processing v22 and v23, Issue #920): the review rule alone names it. */
export const SERIES_KNOWLEDGE_EXCERPT_CATEGORY = 'series-knowledge-excerpt' as const satisfies OutboundDataCategoryId;
/** The bounds of one request's Series Knowledge excerpts: the clause bounds 书系一致性 already keeps (`review/series-consistency.ts`). */
export const SERIES_KNOWLEDGE_EXCERPT_MAX_CLAUSES = 40;
export const SERIES_KNOWLEDGE_EXCERPT_MAX_GRAPHEMES_PER_CLAUSE = 300;
/** The review kind of the Series consistency category (`reviewCategoryKindId('series-consistency')`), the last kind of the review rule since v22 and v23. */
const SERIES_CONSISTENCY_REVIEW_KIND = 'editorial-review/series-consistency';
/** The analysis kind family of a custom analysis dimension, and the one literal entry that lists all of it (Provider Processing v22 and v23). */
export const CUSTOM_ANALYSIS_KIND_PREFIX = 'custom-analysis/';
export const CUSTOM_ANALYSIS_KIND_FAMILY = `${CUSTOM_ANALYSIS_KIND_PREFIX}*` as const;

/**
 * Whether a rule's `allowedTaskKinds` list admits `kind`: an exact entry, or a family entry `<segment>/*` that covers the kind
 * `<segment>/<id>` (one non-empty segment after the prefix). The prefix must be a whole path segment and the entry no other glob;
 * a `*` in the kind itself is never admitted. Only the custom analysis rule lists a family entry.
 */
export function taskKindListed(taskKinds: readonly string[], kind: string): boolean {
  if (kind.includes('*')) return false;
  return taskKinds.some((entry) => {
    if (entry === kind) return true;
    const family = /^([a-z][a-z0-9-]*)\/\*$/u.exec(entry);
    if (family === null) return false;
    const prefix = `${family[1]}/`;
    return kind.startsWith(prefix) && kind.length > prefix.length && !kind.slice(prefix.length).includes('/');
  });
}

/** The Chinese-first statement of the question-template declaration, as the policy writes it (the same in both scopes). */
const EDITOR_AUTHORED_QUESTION_TEMPLATE_DESCRIPTION_ZH =
  `编辑自拟的单元提问模板：编辑在知识库「工序与规则」里为一个自定义分析维度写下的、对每个单元提出的问题模板，随该维度每个单元的请求一并发出。每个模板至多 ${EDITOR_AUTHORED_QUESTION_TEMPLATE_MAX_GRAPHEMES} 个字素；必须标明所依据的分析维度版本；绝不含稿件正文，绝不含作者或编辑姓名；它只是 AI7 固定的分析合同里一个有边界的数据参数，绝不改写或覆盖 AI7 的合同框架。`;

/**
 * A rule's `editorAuthoredQuestionTemplate` declaration (Provider Processing v22 and v23), read whole: the custom analysis rule alone
 * states it, with the exact bound, attributed to the dimension version, from a 工序与规则 document, never manuscript text, never
 * author or editor names and never an override of AI7's contract framing. Every other rule names neither the declaration nor the
 * category. A missing, changed or unexpected term is a policy this launch cannot read.
 */
function verifyEditorAuthoredQuestionTemplate(rule: Record<string, unknown>, declared: boolean): void {
  const categories = rule['allowedOutboundDataCategories'];
  requirePolicy(Array.isArray(categories) && categories.includes(EDITOR_AUTHORED_QUESTION_TEMPLATE_CATEGORY) === declared);
  if (!declared) {
    requirePolicy(!Object.hasOwn(rule, 'editorAuthoredQuestionTemplate'));
    return;
  }
  requirePolicy(sameValue(rule['editorAuthoredQuestionTemplate'], {
    category: EDITOR_AUTHORED_QUESTION_TEMPLATE_CATEGORY,
    descriptionZh: EDITOR_AUTHORED_QUESTION_TEMPLATE_DESCRIPTION_ZH,
    sourceDocument: 'process-and-rules-document',
    maxGraphemes: EDITOR_AUTHORED_QUESTION_TEMPLATE_MAX_GRAPHEMES,
    attributedToDimensionVersion: true,
    manuscriptTextAllowed: false,
    housePeopleNamesAndRolesStripped: true,
    authorOrEditorNamesAllowed: false,
    contractFramingOverrideAllowed: false,
  }));
}

/** The Chinese-first statement of the Series Knowledge declaration, with the exact bounds, as the policy writes it. */
function seriesKnowledgeExcerptDescriptionZh(scope: 'developer-live' | 'ordinary-production'): string {
  const source = scope === 'developer-live'
    ? '开发直连下只取自已获准的公开或合成图书所在的书系（Owner 指定的公开样书）'
    : '普通生产下只取自普通生产来源（编辑自己的书系）';
  return `书系知识摘录：本次审阅冻结的书系范围所固定的书系知识条目版本，按书系一致性审阅已有的条款边界切成条款，随审阅请求一并发出。每次请求至多 ${SERIES_KNOWLEDGE_EXCERPT_MAX_CLAUSES} 条、每条至多 ${SERIES_KNOWLEDGE_EXCERPT_MAX_GRAPHEMES_PER_CLAUSE} 个字素；只取自本次审阅固定的那些书系的条目；已生效的书系检索排除一律遵守，被排除的条目不发出；必须标明所依据的条目版本；${source}。`;
}

/**
 * A rule's Series Knowledge terms (Provider Processing v22 and v23), read whole: the review rule alone states
 * `source.seriesKnowledgeAllowed: true`, names `series-knowledge-excerpt` and states its `seriesKnowledgeExcerpt` declaration with the
 * exact bounds (at most 40 clauses of 300 graphemes, only items of the Run's pinned Series, every frozen Series Retrieval Exclusion
 * honoured, attributed to the item revisions). Every other rule states `seriesKnowledgeAllowed: false` (or names no such term), names
 * neither the category nor the declaration. A missing, changed or unexpected term is a policy this launch cannot read.
 */
function verifySeriesKnowledgeExcerpt(rule: Record<string, unknown>, scope: 'developer-live' | 'ordinary-production', declared: boolean): void {
  const source = rule['source'];
  requirePolicy(isRecord(source) && (declared ? source['seriesKnowledgeAllowed'] === true : source['seriesKnowledgeAllowed'] !== true));
  const categories = rule['allowedOutboundDataCategories'];
  requirePolicy(Array.isArray(categories) && categories.includes(SERIES_KNOWLEDGE_EXCERPT_CATEGORY) === declared);
  if (!declared) {
    requirePolicy(!Object.hasOwn(rule, 'seriesKnowledgeExcerpt'));
    return;
  }
  requirePolicy(sameValue(rule['seriesKnowledgeExcerpt'], {
    category: SERIES_KNOWLEDGE_EXCERPT_CATEGORY,
    descriptionZh: seriesKnowledgeExcerptDescriptionZh(scope),
    derivedFrom: 'series-knowledge-item-revisions-pinned-by-the-run-frozen-series-scope',
    maxClauses: SERIES_KNOWLEDGE_EXCERPT_MAX_CLAUSES,
    maxGraphemesPerClause: SERIES_KNOWLEDGE_EXCERPT_MAX_GRAPHEMES_PER_CLAUSE,
    onlyPinnedSeriesItems: true,
    retrievalExclusionsHonoured: true,
    attributedToItemRevisions: true,
    sourceScope: scope === 'developer-live' ? 'admitted-public-or-synthetic-books-only' : 'ordinary-production-sources-only',
  }));
}

/** The rule id of the enrolled background analysis rule, the same in Provider Processing v14 to v23 (the one rule with a background origin). */
export const BACKGROUND_ANALYSIS_RULE_ID = 'enrolled-background-manuscript-analysis-processing';
/** A Run-based rule's model-initiated clarification (v14 to v17): one question per unit, the unit waits, an unanswered question times out at 24 hours. */
const CLARIFICATION_ASKS = {
  modelQuestionAllowed: true,
  maxQuestionsPerUnit: 1,
  unitWaitsOthersContinue: true,
  timeoutHours: 24,
  timeoutContinuesAs: 'unanswered-with-run-report-disclosure',
} as const;
/** The dialogue and the two fast-role rules: a foreground answer is never interrupted by a model question. */
const CLARIFICATION_NONE = { modelQuestionAllowed: false } as const;
/** The background origin: an active matching enrollment, one exact Run per dispatch, no Task, no default rule, no other trigger. */
const BACKGROUND_ORIGIN = {
  activeMatchingBackgroundAnalysisEnrollmentRequired: true,
  newUserInitiatedTaskRequired: false,
  providerSetupCreatesEnrollment: false,
  manuscriptImportCreatesEnrollment: false,
  artifactInstallOrEnablementCreatesEnrollment: false,
  eachDispatchCreatesExactRun: true,
  matchingActiveDefaultExecutionRuleAllowed: false,
  importTriggeredOrUnenrolledCrossRunDispatchAllowed: false,
} as const;
const BACKGROUND_SCOPE_LIMITS = {
  manuscriptAnalysisOnly: true,
  formalManuscriptMutationAllowed: false,
  externalEffectAllowed: false,
  generalBackgroundLearningAllowed: false,
  backgroundPolicyWorkAllowed: false,
} as const;
/** The mandatory enrollment ceiling: never unset, split equally across Books (remainder to the first), at most capacity minus one slots. */
const BACKGROUND_PRECONDITIONS = {
  eligibleConfiguredProviderRequired: true,
  providerPreflightRequired: true,
  exactProviderBindingRequired: true,
  planEnvelopeRequired: true,
  runAuthorizationRequired: true,
  runSourceScopeRequired: true,
  declaredOperationClassesRequired: true,
  exactRunBudgetCeilingStateRequired: true,
  unsetRunBudgetCeilingAllowed: false,
  enrollmentCeilingRequired: true,
  ceilingSplitAcrossBooks: 'equal-remainder-to-first',
  backgroundSlotShare: 'capacity-minus-one',
  ceilingEvaluatedBeforeEveryDispatch: true,
  finalProviderPayloadEgressGateRequired: true,
  frozenBeforeTransmission: true,
} as const;

/** The clarification block a rule must state, and the matching answer-turn term of its transmission bound. */
function verifyClarification(rule: Record<string, unknown>, asks: boolean): void {
  requirePolicy(sameBlock(rule['clarification'], asks ? CLARIFICATION_ASKS : CLARIFICATION_NONE));
  const transmissions = rule['transmissions'];
  requirePolicy(isRecord(transmissions) && (asks ? transmissions['plusClarificationAnswerTurns'] === true : transmissions['plusClarificationAnswerTurns'] === undefined));
}

/**
 * The enrolled background analysis rule (v14): baseline analysis dispatched by an active matching enrollment as an exact Run, inside the
 * enrollment's mandatory ceiling; baseline analysis' own transmission bound and suboperations.
 */
function verifyBackgroundRule(rule: Record<string, unknown>): void {
  requirePolicy(sameBlock(rule['authorityOrigin'], BACKGROUND_ORIGIN) && sameBlock(rule['scopeLimits'], BACKGROUND_SCOPE_LIMITS) &&
    sameBlock(rule['authorizationPreconditions'], BACKGROUND_PRECONDITIONS) &&
    sameBlock(rule['executionMode'], { humanAttended: false, developerHostOnly: true, ciAllowed: false, hostedAllowed: false, scheduledAllowed: true, backgroundAllowed: true }));
  const limit = rule['providerAccountLimit'] as Record<string, unknown>;
  requirePolicy(limit['endsRunAsProviderAccountLimit'] === true);
  verifyPlannedBound(rule, true);
  const transmissions = rule['transmissions'] as Record<string, unknown>;
  requirePolicy(transmissions['plusCrossUnitReductionTopicSections'] === true && transmissions['crossUnitReductionAllowed'] === true &&
    transmissions['assuranceSamplingAllowed'] === true && transmissions['runReportReflectionAllowed'] === true);
}

/**
 * One developer-live allow rule this launch can read, by its rule id: the Model Role it binds, the exact task kinds and
 * outbound categories it admits, and the reading of everything particular to it. A rule id outside this table is a policy
 * the launch cannot read — the zero-transmission denial.
 */
interface DeveloperLiveRuleReading {
  readonly modelRole: string;
  readonly taskKinds: readonly string[];
  readonly outboundDataCategories: readonly OutboundDataCategoryId[];
  /** Whether the rule names the kind's one book-level synthesis turn (Provider Processing v11 and after); `verify` reads the policy's own say. */
  readonly crossUnitSynthesisAllowed: boolean;
  /** Whether the rule lets the model ask a clarification question (Provider Processing v14); the rule's own `clarification` block must say the same. */
  readonly clarification: boolean;
  /** Whether this is the enrolled-background rule, the only one scheduled and background. */
  readonly background?: true;
  /** Whether the rule may research (Provider Processing v16): its web switch is on and it names the platform tools block. */
  readonly platformTools: boolean;
  /** Whether the rule states `sourceTranslationAllowed: true` (Provider Processing v18): the research review rule alone; every other rule names no such term. */
  readonly sourceTranslation?: true;
  /** Whether the rule names `house-review-preference-excerpt` and its declaration (Provider Processing v20): the review rule alone. */
  readonly houseReviewPreference?: true;
  /** Whether the rule states `source.seriesKnowledgeAllowed: true`, names `series-knowledge-excerpt` and its declaration (Provider Processing v22): the review rule alone. */
  readonly seriesKnowledge?: true;
  /** Whether the rule names `editor-authored-question-template` and its declaration (Provider Processing v22): the custom analysis rule alone. */
  readonly questionTemplate?: true;
  /** Whether the rule admits no model-initiated retrieval (the enrolled background rule, 来源译文 and, since v22, custom analysis). */
  readonly noRetrieval?: true;
  readonly verify: (rule: Record<string, unknown>) => void;
}

/**
 * A planned Run over the Book's units that ends in the kind's one book-level synthesis turn — writing and the three evaluation
 * contracts (Provider Processing v11). The planned-Run origin and bound of baseline analysis, with the synthesis turn named,
 * no assurance sample, no reduction topic sections, no Series Knowledge or editorial deliverables; since v12 the kind may also
 * carry frozen Material Reference excerpts (the consumer re-checks each reference before it is sent).
 */
function verifySynthesisRule(rule: Record<string, unknown>, defaultExecutionRuleAllowed = false): void {
  verifyPlannedRunOrigin(rule, false, defaultExecutionRuleAllowed);
  const source = rule['source'];
  requirePolicy(isRecord(source) && source['materialReferencesAllowed'] === true && source['materialReferenceConsumptionRecheckRequired'] === undefined &&
    source['seriesKnowledgeAllowed'] === false && source['editorialDeliverablesAllowed'] === false);
  const transmissions = rule['transmissions'] as Record<string, unknown>;
  requirePolicy(
    transmissions['plusOneCrossUnitSynthesisTurn'] === true &&
      transmissions['crossUnitSynthesisAllowed'] === true &&
      transmissions['crossUnitReductionAllowed'] === false &&
      transmissions['plusCrossUnitReductionTopicSections'] === undefined &&
      transmissions['assuranceSamplingAllowed'] === false &&
      transmissions['runReportReflectionAllowed'] === true,
  );
}

/** One foreground manuscript Suggestion request, with no synthesis, reflection, assurance sample or Run ceiling. */
function verifySuggestionRule(rule: Record<string, unknown>, sourceKey: 'editorSelectedPassageOnly' | 'singleManuscriptConflictRegionOnly'): void {
  const origin = rule['authorityOrigin'];
  requirePolicy(isRecord(origin) && origin['foregroundEditorActionRequired'] === true &&
    origin['matchingActiveDefaultExecutionRuleAllowed'] === false && origin['backgroundAnalysisEnrollmentAllowed'] === false &&
    origin['idleScheduledImportTriggeredOrCrossRunDispatchAllowed'] === false);
  const source = rule['source'] as Record<string, unknown>;
  requirePolicy(source[sourceKey] === true && source['materialReferencesAllowed'] === false &&
    source['seriesKnowledgeAllowed'] === false && source['editorialDeliverablesAllowed'] === false);
  const transmissions = rule['transmissions'] as Record<string, unknown>;
  requirePolicy(
    transmissions['oneTechnicalSessionPerAttempt'] === true &&
      transmissions['oneBoundedPayloadPerAttempt'] === true &&
      transmissions['payloadLimitedToFrozenContractAndEditorManuscriptExcerpts'] === true &&
      transmissions['crossUnitSynthesisAllowed'] === false &&
      transmissions['crossUnitReductionAllowed'] === false &&
      transmissions['assuranceSamplingAllowed'] === false &&
      transmissions['runReportReflectionAllowed'] === false &&
      transmissions['automaticResendInsideStoppedSessionAllowed'] === false,
  );
  const preconditions = rule['authorizationPreconditions'];
  requirePolicy(isRecord(preconditions) && preconditions['exactProviderBindingRequired'] === true &&
    preconditions['finalProviderPayloadEgressGateRequired'] === true && preconditions['frozenBeforeTransmission'] === true && preconditions['runBudgetCeilingApplies'] === false);
  const limit = rule['providerAccountLimit'] as Record<string, unknown>;
  requirePolicy(limit['endsAttemptAsProviderAccountLimit'] === true);
  // The output is a Suggestion the editor decides on, never a manuscript change.
  const output = rule['output'];
  requirePolicy(isRecord(output) && output['suggestionsOnly'] === true && output['appliesManuscriptChange'] === false);
}

/**
 * 来源译文 of one frozen 资料库 excerpt (Provider Processing v18): one foreground editor action, one session and one bounded payload on the
 * Fast Interaction Role, no Run and so no Run ceiling, no synthesis, reflection or assurance sample, no web, no Series Knowledge.
 */
function verifyMaterialTranslationRule(rule: Record<string, unknown>): void {
  const origin = rule['authorityOrigin'];
  requirePolicy(isRecord(origin) && origin['foregroundEditorActionRequired'] === true &&
    origin['matchingActiveDefaultExecutionRuleAllowed'] === false && origin['backgroundAnalysisEnrollmentAllowed'] === false &&
    origin['idleScheduledImportTriggeredOrCrossRunDispatchAllowed'] === false);
  const source = rule['source'] as Record<string, unknown>;
  requirePolicy(source['frozenMaterialExcerptOnly'] === true && source['materialReferencesAllowed'] === true &&
    source['seriesKnowledgeAllowed'] === false && source['editorialDeliverablesAllowed'] === false);
  const transmissions = rule['transmissions'] as Record<string, unknown>;
  requirePolicy(
    transmissions['oneTechnicalSessionPerAttempt'] === true &&
      transmissions['oneBoundedPayloadPerAttempt'] === true &&
      transmissions['payloadLimitedToFrozenContractAndMaterialExcerpt'] === true &&
      transmissions['crossUnitSynthesisAllowed'] === false &&
      transmissions['crossUnitReductionAllowed'] === false &&
      transmissions['assuranceSamplingAllowed'] === false &&
      transmissions['runReportReflectionAllowed'] === false &&
      transmissions['automaticResendInsideStoppedSessionAllowed'] === false,
  );
  const preconditions = rule['authorizationPreconditions'];
  requirePolicy(isRecord(preconditions) && preconditions['exactProviderBindingRequired'] === true &&
    preconditions['finalProviderPayloadEgressGateRequired'] === true && preconditions['frozenBeforeTransmission'] === true && preconditions['runBudgetCeilingApplies'] === false);
  const limit = rule['providerAccountLimit'] as Record<string, unknown>;
  requirePolicy(limit['endsAttemptAsProviderAccountLimit'] === true);
  // A translation is a transmission that adds nothing to the manuscript: no output block, nothing to apply.
  requirePolicy(!Object.hasOwn(rule, 'output'));
}

/** The rule id of the custom analysis rule of Provider Processing v22 (developer-live). */
export const DEVELOPER_LIVE_CUSTOM_ANALYSIS_RULE_ID = 'developer-live-public-samplebook-custom-analysis';

/**
 * A custom analysis dimension (Provider Processing v22): planned like the baseline from a newly user-initiated Task with a plan envelope and a
 * Run Authorization, one session per unit, no cross-unit reduction or synthesis, no web; `source` names no Material Reference, Series Knowledge
 * or editorial deliverable, and the review-style assurance sample and Run Report reflection turn the planned bound already states.
 */
function verifyCustomAnalysisRule(rule: Record<string, unknown>): void {
  verifyPlannedRunOrigin(rule);
  const source = rule['source'] as Record<string, unknown>;
  requirePolicy(source['materialReferencesAllowed'] === false && source['seriesKnowledgeAllowed'] === false && source['editorialDeliverablesAllowed'] === false);
  const transmissions = rule['transmissions'] as Record<string, unknown>;
  requirePolicy(transmissions['crossUnitReductionAllowed'] === false && transmissions['plusCrossUnitReductionTopicSections'] === undefined &&
    transmissions['plusOneCrossUnitSynthesisTurn'] === undefined && transmissions['crossUnitSynthesisAllowed'] === undefined &&
    transmissions['assuranceSamplingAllowed'] === true && transmissions['runReportReflectionAllowed'] === true);
}

const DEVELOPER_LIVE_RULES: Readonly<Record<string, DeveloperLiveRuleReading>> = {
  // Baseline manuscript analysis, unchanged since v9, including its three ADR 0066 suboperations.
  [DEVELOPER_LIVE_POLICY_BINDING.ruleId]: {
    modelRole: 'Main Editorial Role',
    taskKinds: ['baseline-manuscript-analysis'],
    outboundDataCategories: ['public-or-synthetic'],
    crossUnitSynthesisAllowed: false,
    clarification: true,
    platformTools: false,
    verify: (rule) => {
      verifyPlannedRunOrigin(rule);
      const transmissions = rule['transmissions'] as Record<string, unknown>;
      // The three suboperations ADR 0066 declares, which v9 and v10 name `true`. An absent or non-`true` key is
      // not the pinned document; reading anything but the exact bytes is the zero-transmission denial.
      requirePolicy(
        transmissions['plusCrossUnitReductionTopicSections'] === true &&
          transmissions['crossUnitReductionAllowed'] === true &&
          transmissions['assuranceSamplingAllowed'] === true &&
          transmissions['runReportReflectionAllowed'] === true,
      );
    },
  },
  // The Interactive Editorial Dialogue of ADR 0088: one foreground attempt from an exact selection and question, one session
  // and one bounded payload, no Run and so no Run ceiling; the account limit still ends the attempt.
  'developer-live-public-samplebook-editorial-dialogue': {
    modelRole: 'Fast Interaction Role',
    taskKinds: ['editorial-dialogue'],
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
    clarification: false,
    platformTools: false,
    verify: (rule) => {
      const origin = rule['authorityOrigin'];
      requirePolicy(isRecord(origin) && origin['foregroundEditorSelectionAndQuestionRequired'] === true &&
        exactStrings(origin['admittedAttemptActions'], ['ask', 'continue', 'regenerate']) &&
        origin['planEnvelopeOrRunAuthorizationRequired'] === false && origin['matchingActiveDefaultExecutionRuleAllowed'] === false &&
        origin['backgroundAnalysisEnrollmentAllowed'] === false && origin['idleScheduledImportTriggeredOrCrossRunDispatchAllowed'] === false);
      const source = rule['source'] as Record<string, unknown>;
      requirePolicy(source['editorSelectedPassageOnly'] === true);
      const transmissions = rule['transmissions'] as Record<string, unknown>;
      requirePolicy(
        transmissions['oneTechnicalSessionPerAttempt'] === true &&
          transmissions['oneBoundedPayloadPerAttempt'] === true &&
          transmissions['payloadLimitedToFrozenContractSelectionQuestionAndRetainedFragments'] === true &&
          transmissions['continueAndRegenerateAreNewAttempts'] === true &&
          transmissions['automaticResendInsideStoppedSessionAllowed'] === false,
      );
      const preconditions = rule['authorizationPreconditions'];
      requirePolicy(isRecord(preconditions) && preconditions['exactProviderBindingRequired'] === true &&
        preconditions['runBudgetCeilingApplies'] === false && preconditions['finalProviderPayloadEgressGateRequired'] === true &&
        preconditions['frozenBeforeTransmission'] === true);
      const limit = rule['providerAccountLimit'] as Record<string, unknown>;
      requirePolicy(limit['endsAttemptAsProviderAccountLimit'] === true);
    },
  },
  // The review categories, cross-deliverable consistency included and, since v16, the two that research the web (事实核查,
  // 学术道德与引用; 出版政策与风险 stays out until #744): planned Runs like the baseline, without a cross-unit reduction, over frozen Material References
  // and the Book's editorial deliverables and, since v22, the Series consistency category over the Run's pinned Series Knowledge. The rule id keeps
  // its v11 name (the policy's rule ids are stable across versions) though the rule is no longer reference-free.
  'developer-live-public-samplebook-reference-free-review': {
    modelRole: 'Main Editorial Role',
    taskKinds: ['editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression', 'editorial-review/cross-deliverable-consistency', ...WEB_REVIEW_KINDS, SERIES_CONSISTENCY_REVIEW_KIND],
    outboundDataCategories: ['public-or-synthetic', 'frozen-material-reference-excerpt', 'editorial-deliverable-excerpt', HOUSE_REVIEW_PREFERENCE_CATEGORY, SERIES_KNOWLEDGE_EXCERPT_CATEGORY, ...WEB_TOOL_CATEGORIES],
    crossUnitSynthesisAllowed: false,
    clarification: true,
    platformTools: true,
    sourceTranslation: true,
    houseReviewPreference: true,
    seriesKnowledge: true,
    verify: (rule) => {
      // Since v14 the review kind also admits its matching active Default Execution Rule (审阅 快速开始), as writing does.
      verifyPlannedRunOrigin(rule, true, true);
      const source = rule['source'] as Record<string, unknown>;
      // Since v22 the review kind also admits Series Knowledge (the Series consistency category); `verifySeriesKnowledgeExcerpt` reads the term and its declaration.
      requirePolicy(source['materialReferencesAllowed'] === true && source['seriesKnowledgeAllowed'] === true &&
        source['editorialDeliverablesAllowed'] === true);
      const transmissions = rule['transmissions'] as Record<string, unknown>;
      requirePolicy(transmissions['crossUnitReductionAllowed'] === false && transmissions['plusCrossUnitReductionTopicSections'] === undefined);
    },
  },
  // 写作任务 (S84): the `writing` kind, drafted over the Book's units and one book-level synthesis turn from the frozen metadata and
  // synopsis, the house's 范例, frozen Material Reference excerpts (v12) and the editor's own brief.
  'developer-live-public-samplebook-writing': {
    modelRole: 'Main Editorial Role',
    taskKinds: ['writing'],
    outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt', ...WEB_TOOL_CATEGORIES],
    crossUnitSynthesisAllowed: true,
    clarification: true,
    platformTools: true,
    verify: (rule) => verifySynthesisRule(rule, true),
  },
  // The three implemented evaluation contracts (S81): AI7 初评 scores, 审稿意见 and 按我的评分重写评语, with frozen Material
  // Reference excerpts since v12 and the platform tools since v16 (评估 · 市场 needs the web).
  'developer-live-public-samplebook-evaluation': {
    modelRole: 'Main Editorial Role',
    taskKinds: ['evaluation', 'readers-report', 'evaluation-rewrite'],
    outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt', ...WEB_TOOL_CATEGORIES],
    crossUnitSynthesisAllowed: true,
    clarification: true,
    platformTools: true,
    verify: verifySynthesisRule,
  },
  // Each Fast kind has its own rule and excerpt category (Issue #841 revision 5); outputs remain Suggestions only.
  'developer-live-public-samplebook-editorial-polish': {
    modelRole: 'Fast Interaction Role',
    taskKinds: ['editorial-polish'],
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
    clarification: false,
    platformTools: false,
    verify: (rule) => verifySuggestionRule(rule, 'editorSelectedPassageOnly'),
  },
  'developer-live-public-samplebook-conflict-regenerate': {
    modelRole: 'Fast Interaction Role',
    taskKinds: ['conflict-regenerate'],
    outboundDataCategories: ['manuscript-conflict-region-excerpt'],
    crossUnitSynthesisAllowed: false,
    clarification: false,
    platformTools: false,
    verify: (rule) => verifySuggestionRule(rule, 'singleManuscriptConflictRegionOnly'),
  },
  // Enrolled background analysis (v14): the only scheduled and background rule, within the enrollment's mandatory ceiling.
  [BACKGROUND_ANALYSIS_RULE_ID]: {
    modelRole: 'Main Editorial Role',
    taskKinds: ['baseline-manuscript-analysis'],
    outboundDataCategories: ['public-or-synthetic'],
    crossUnitSynthesisAllowed: false,
    clarification: true,
    background: true,
    platformTools: false,
    verify: verifyBackgroundRule,
  },
  // 来源译文 of 资料库 materials (Provider Processing v18, Issue #891): the Fast Interaction Role translates one frozen excerpt of an admitted public text.
  'developer-live-public-samplebook-material-translation': {
    modelRole: 'Fast Interaction Role',
    taskKinds: [MATERIAL_TRANSLATION_KIND],
    outboundDataCategories: ['public-or-synthetic'],
    crossUnitSynthesisAllowed: false,
    clarification: false,
    platformTools: false,
    verify: verifyMaterialTranslationRule,
  },
  // Custom analysis dimensions (Provider Processing v22, Issue #920, ADR 0090 §4): the family `custom-analysis/*` planned like the baseline
  // over an editor-authored per-unit question template; no tool, no cross-unit reduction, no Material Reference or Series Knowledge.
  [DEVELOPER_LIVE_CUSTOM_ANALYSIS_RULE_ID]: {
    modelRole: 'Main Editorial Role',
    taskKinds: [CUSTOM_ANALYSIS_KIND_FAMILY],
    outboundDataCategories: ['public-or-synthetic', EDITOR_AUTHORED_QUESTION_TEMPLATE_CATEGORY],
    crossUnitSynthesisAllowed: false,
    clarification: true,
    platformTools: false,
    questionTemplate: true,
    noRetrieval: true,
    verify: verifyCustomAnalysisRule,
  },
};

/**
 * Provider Processing v24 (and v22, v20, v18, v16, v14, v12, v11, v10, v9 before it): default deny with developer-live eligible-only allow rules, each one
 * this launch can read and each bound exactly to the one Go route. All ten rules of v24 (as of v22) must be present, the three that may research
 * (review, writing, evaluation) each with the platform tools block the search backend registry implies. The baseline analysis rule must be among them; its three
 * declared suboperations of ADR 0066, the per-frozen-unit Run Budget Ceiling default of ADR 0070, and the house-people
 * redaction rule of ADR 0079 §4.4 are read as v9 read them. Every other rule is read from its own entry of
 * `DEVELOPER_LIVE_RULES`; a rule id outside it, a repeated id, or any field that does not match is a policy the launch
 * cannot read — the zero-transmission denial. A Model Role a rule binds other than the Main Editorial Role must be bound to
 * the same route in the policy's `roleBindings`.
 *
 * Exported so the reading of the rules' exact fields can be pinned against the real policy bytes with one field varied.
 * The document digests this resolver checks are constants of this module, so a policy revision could not be fed through
 * `resolveSourceCheckoutLaunchPolicy` at all — which is the point of the pins, and why the reading is tested here instead.
 */
export function verifyDeveloperLivePolicy(policy: Record<string, unknown>): {
  crossUnitReductionAllowed: boolean;
  assuranceSamplingAllowed: boolean;
  runReportReflectionAllowed: boolean;
  admittedRules: AdmittedProviderRule[];
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
  requirePolicy(isRecord(decision) && decision['default'] === 'deny' && Array.isArray(decision['providerAllowRules']) && decision['providerAllowRules'].length > 0);
  const roleBindings = policy['roleBindings'];
  requirePolicy(roleBindings === undefined || isRecord(roleBindings));
  const seen = new Set<string>();
  const admittedRules: AdmittedProviderRule[] = [];
  for (const rule of decision['providerAllowRules'] as unknown[]) {
    requirePolicy(isRecord(rule) && typeof rule['ruleId'] === 'string' && !seen.has(rule['ruleId']) && Object.hasOwn(DEVELOPER_LIVE_RULES, rule['ruleId']));
    const ruleId = rule['ruleId'] as string;
    seen.add(ruleId);
    const reading = DEVELOPER_LIVE_RULES[ruleId]!;
    requirePolicy(exactStrings(rule['allowedTaskKinds'], reading.taskKinds) &&
      exactStrings(rule['allowedOutboundDataCategories'], reading.outboundDataCategories));
    verifyRuleCommon(rule, reading.background === true);
    verifyRuleBinding(rule, reading.modelRole);
    if (roleBindings === undefined) {
      requirePolicy(reading.modelRole === 'Main Editorial Role');
    } else {
      const role = roleBindings[reading.modelRole];
      requirePolicy(isRecord(role) && role['bindingState'] === 'bound' &&
        role['route'] === DEVELOPER_LIVE_POLICY_BINDING.route && role['endpoint'] === DEVELOPER_LIVE_POLICY_BINDING.endpoint &&
        role['model'] === DEVELOPER_LIVE_POLICY_BINDING.model && role['credentialSlot'] === DEVELOPER_LIVE_POLICY_BINDING.credentialSlot);
    }
    reading.verify(rule);
    verifyClarification(rule, reading.clarification);
    const platformTools = verifyPlatformTools(rule, 'developer-live', reading.platformTools);
    const localTools = verifyLocalTools(rule, reading.background === true || reading.noRetrieval === true || reading.taskKinds.includes(MATERIAL_TRANSLATION_KIND));
    const sourceTranslationAllowed = verifySourceTranslation(rule, reading.sourceTranslation === true);
    verifyHouseReviewPreference(rule, 'developer-live', reading.houseReviewPreference === true);
    verifySeriesKnowledgeExcerpt(rule, 'developer-live', reading.seriesKnowledge === true);
    verifyEditorAuthoredQuestionTemplate(rule, reading.questionTemplate === true);
    admittedRules.push({
      ruleId,
      taskKinds: [...reading.taskKinds],
      modelRole: reading.modelRole,
      route: DEVELOPER_LIVE_POLICY_BINDING.route,
      endpoint: DEVELOPER_LIVE_POLICY_BINDING.endpoint,
      model: DEVELOPER_LIVE_POLICY_BINDING.model,
      credentialSlot: DEVELOPER_LIVE_POLICY_BINDING.credentialSlot,
      outboundDataCategories: [...reading.outboundDataCategories],
      crossUnitSynthesisAllowed: reading.crossUnitSynthesisAllowed,
      ...((rule['transmissions'] as Record<string, unknown>)['plusDeclaredContractRetryAdaptations'] === true ? { plusDeclaredContractRetryAdaptations: true } : {}),
      materialReferencesAllowed: sourceFlag(rule, 'materialReferencesAllowed'),
      editorialDeliverablesAllowed: sourceFlag(rule, 'editorialDeliverablesAllowed'),
      // The flag verified above (v22's review rule alone), projected for its consumer (Issue #64, 7b); absent on every other rule.
      ...(sourceFlag(rule, 'seriesKnowledgeAllowed') ? { seriesKnowledgeAllowed: true } : {}),
      clarificationQuestionAllowed: reading.clarification,
      clarificationTimeoutHours: reading.clarification ? CLARIFICATION_ASKS.timeoutHours : null,
      backgroundOrigin: reading.background === true,
      matchingActiveDefaultExecutionRuleAllowed: (rule['authorityOrigin'] as Record<string, unknown>)['matchingActiveDefaultExecutionRuleAllowed'] === true,
      webSearchToolAllowed: platformTools !== null,
      platformTools,
      localTools,
      sourceTranslationAllowed,
    });
  }
  requirePolicy(seen.has(DEVELOPER_LIVE_POLICY_BINDING.ruleId) && seen.size === Object.keys(DEVELOPER_LIVE_RULES).length);
  return {
    crossUnitReductionAllowed: true,
    assuranceSamplingAllowed: true,
    runReportReflectionAllowed: true,
    admittedRules,
  };
}

/**
 * The editor's own model-service binding a launch supplies to `ordinary-production` (Provider Processing v17): one route,
 * endpoint, model and credential slot, with the opaque Credential Broker reference of the editor's own credential. One binding
 * per role serves either Main Editorial or Fast Interaction; revision 84 keeps their selections independently. The resolver
 * checks each against that role's allowed bindings and copies its routing facts into eligible rules; the credential reference never
 * enters the projection, and no value here selects or configures a provider.
 */
export interface ConfiguredProviderBinding {
  readonly route: string;
  readonly endpoint: string;
  readonly model: string;
  readonly credentialSlot: string;
  readonly credentialReference: string;
}

/** One binding Provider Processing v17 (and v15, v13) allows a user-configurable role: the routing facts, read from the pinned bytes. */
interface AllowedRoleBinding {
  readonly route: string;
  readonly endpoint: string;
  readonly model: string;
  readonly credentialSlot: string;
}

const HOUSE_PEOPLE_REDACTION = {
  housePeopleNamesAndRolesStripped: true,
  remarksAndInternalNotesStripped: true,
  authorInformationAllowed: true,
  houseNameAllowed: true,
} as const;
const NO_EXTRA_PRIVACY_PROMPTS = { perBookRequired: false, firstUseRequired: false, perCallRequired: false, perChunkRequired: false } as const;
const PRODUCTION_EXECUTION_MODE = {
  humanAttended: true,
  developerHostOnly: false,
  ciAllowed: false,
  hostedAllowed: false,
  scheduledAllowed: false,
  backgroundAllowed: false,
} as const;
/** The enrolled background rule runs in idle or quiet time while the editor's application is open on their own computer: scheduled and background, never hosted or CI. */
const PRODUCTION_BACKGROUND_EXECUTION_MODE = {
  humanAttended: false,
  developerHostOnly: false,
  ciAllowed: false,
  hostedAllowed: false,
  scheduledAllowed: true,
  backgroundAllowed: true,
} as const;
/** No cache, no fixture, no upload, no raw bytes outside the product, and nothing of the development credential, cache or ledger. */
const PRODUCTION_CAPTURE = {
  fixtureEmissionAllowed: false,
  uploadAllowed: false,
  providerResultCacheAllowed: false,
  rawBytesInLogsDiagnosticsOrRepositoryAllowed: false,
  developmentCredentialCacheAndLedgerConsulted: false,
} as const;
const PRODUCTION_RUN_ORIGIN = {
  newlyUserInitiatedTaskRequired: true,
  directRunAuthorizationAllowed: true,
  matchingActiveDefaultExecutionRuleAllowed: false,
  backgroundAnalysisEnrollmentAllowed: false,
  idleScheduledImportTriggeredOrCrossRunDispatchAllowed: false,
} as const;
/** Review alone also admits its matching active Default Execution Rule (审阅 快速开始, v15); the Task must still be newly user-initiated. */
const PRODUCTION_REVIEW_ORIGIN = { ...PRODUCTION_RUN_ORIGIN, matchingActiveDefaultExecutionRuleAllowed: true } as const;
const PRODUCTION_FOREGROUND_ORIGIN = {
  foregroundEditorActionRequired: true,
  matchingActiveDefaultExecutionRuleAllowed: false,
  backgroundAnalysisEnrollmentAllowed: false,
  idleScheduledImportTriggeredOrCrossRunDispatchAllowed: false,
} as const;
const PRODUCTION_DIALOGUE_ORIGIN = {
  foregroundEditorSelectionAndQuestionRequired: true,
  admittedAttemptActions: ['ask', 'continue', 'regenerate'],
  planEnvelopeOrRunAuthorizationRequired: false,
  matchingActiveDefaultExecutionRuleAllowed: false,
  backgroundAnalysisEnrollmentAllowed: false,
  idleScheduledImportTriggeredOrCrossRunDispatchAllowed: false,
} as const;
/** A planned Run's preconditions under production: the ceiling may be unset; when applied the default is 30,000 tokens per frozen unit (v6 semantics). */
const PRODUCTION_RUN_PRECONDITIONS = {
  eligibleConfiguredProviderRequired: true,
  providerPreflightRequired: true,
  exactProviderBindingRequired: true,
  planEnvelopeRequired: true,
  runAuthorizationRequired: true,
  runSourceScopeRequired: true,
  declaredOperationClassesRequired: true,
  exactRunBudgetCeilingStateRequired: true,
  unsetRunBudgetCeilingAllowed: true,
  defaultRunBudgetCeilingTokensPerFrozenUnit: 30_000,
  defaultRunBudgetCeilingComputedAfterCoverageManifestFreeze: true,
  ceilingEvaluatedBeforeEveryDispatch: true,
  finalProviderPayloadEgressGateRequired: true,
  frozenBeforeTransmission: true,
} as const;
const PRODUCTION_FOREGROUND_PRECONDITIONS = {
  eligibleConfiguredProviderRequired: true,
  providerPreflightRequired: true,
  exactProviderBindingRequired: true,
  runBudgetCeilingApplies: false,
  finalProviderPayloadEgressGateRequired: true,
  frozenBeforeTransmission: true,
} as const;
const PRODUCTION_RUN_ACCOUNT_LIMIT = {
  classification: 'quota-exhausted',
  endsRunAsProviderAccountLimit: true,
  retryAllowed: false,
  fallbackAllowed: false,
  secondModelAllowed: false,
} as const;
const PRODUCTION_ATTEMPT_ACCOUNT_LIMIT = {
  classification: 'quota-exhausted',
  endsAttemptAsProviderAccountLimit: true,
  retryAllowed: false,
  fallbackAllowed: false,
  secondModelAllowed: false,
} as const;
const PRODUCTION_BASELINE_TRANSMISSIONS = {
  boundedByCoverageManifestUnitCount: true,
  plusDeclaredSafeRetryAdaptations: true,
  plusCrossUnitReductionTopicSections: true,
  plusAssuranceSampleAnchorUnits: true,
  plusOneRunReportReflectionTurn: true,
  plusClarificationAnswerTurns: true,
  oneTechnicalSessionPerAnalysisUnit: true,
  accumulatingSingleSessionAllowed: false,
  identicalRequestReplaysFromProviderResultCache: false,
  crossUnitReductionAllowed: true,
  assuranceSamplingAllowed: true,
  runReportReflectionAllowed: true,
  webSearchToolAllowed: false,
} as const;
const PRODUCTION_REVIEW_TRANSMISSIONS = {
  boundedByCoverageManifestUnitCount: true,
  plusDeclaredSafeRetryAdaptations: true,
  plusAssuranceSampleAnchorUnits: true,
  plusOneRunReportReflectionTurn: true,
  plusClarificationAnswerTurns: true,
  oneTechnicalSessionPerAnalysisUnit: true,
  accumulatingSingleSessionAllowed: false,
  identicalRequestReplaysFromProviderResultCache: false,
  crossUnitReductionAllowed: false,
  assuranceSamplingAllowed: true,
  runReportReflectionAllowed: true,
  webSearchToolAllowed: false,
} as const;
const PRODUCTION_SYNTHESIS_TRANSMISSIONS = {
  boundedByCoverageManifestUnitCount: true,
  plusDeclaredSafeRetryAdaptations: true,
  plusOneCrossUnitSynthesisTurn: true,
  plusAssuranceSampleAnchorUnits: false,
  plusOneRunReportReflectionTurn: true,
  plusClarificationAnswerTurns: true,
  oneTechnicalSessionPerAnalysisUnit: true,
  accumulatingSingleSessionAllowed: false,
  identicalRequestReplaysFromProviderResultCache: false,
  crossUnitReductionAllowed: false,
  crossUnitSynthesisAllowed: true,
  assuranceSamplingAllowed: false,
  runReportReflectionAllowed: true,
  webSearchToolAllowed: false,
} as const;
const PRODUCTION_DIALOGUE_TRANSMISSIONS = {
  oneTechnicalSessionPerAttempt: true,
  oneBoundedPayloadPerAttempt: true,
  payloadLimitedToFrozenContractSelectionQuestionAndRetainedFragments: true,
  continueAndRegenerateAreNewAttempts: true,
  automaticResendInsideStoppedSessionAllowed: false,
  identicalRequestReplaysFromProviderResultCache: false,
  webSearchToolAllowed: false,
} as const;
const PRODUCTION_SUGGESTION_TRANSMISSIONS = {
  oneTechnicalSessionPerAttempt: true,
  oneBoundedPayloadPerAttempt: true,
  payloadLimitedToFrozenContractAndEditorManuscriptExcerpts: true,
  crossUnitSynthesisAllowed: false,
  automaticResendInsideStoppedSessionAllowed: false,
  identicalRequestReplaysFromProviderResultCache: false,
  webSearchToolAllowed: false,
  crossUnitReductionAllowed: false,
  assuranceSamplingAllowed: false,
  runReportReflectionAllowed: false,
} as const;
const PRODUCTION_SUGGESTION_OUTPUT = { suggestionsOnly: true, appliesManuscriptChange: false } as const;
const PRODUCTION_TRANSLATION_TRANSMISSIONS = {
  oneTechnicalSessionPerAttempt: true,
  oneBoundedPayloadPerAttempt: true,
  payloadLimitedToFrozenContractAndMaterialExcerpt: true,
  crossUnitSynthesisAllowed: false,
  automaticResendInsideStoppedSessionAllowed: false,
  identicalRequestReplaysFromProviderResultCache: false,
  webSearchToolAllowed: false,
  crossUnitReductionAllowed: false,
  assuranceSamplingAllowed: false,
  runReportReflectionAllowed: false,
} as const;
const PRODUCTION_ADMITTED_INPUTS = 'user-owned-manuscripts-and-house-knowledge';
/** The identifiers Provider Processing v6 introduced for the editor's own unpublished material. */
const PRODUCTION_UNPUBLISHED_CLASSES = ['unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content'] as const;

/** Whether `actual` is exactly `expected`: the same keys and, key by key, the same primitive or equal string list. */
function sameBlock(actual: unknown, expected: Readonly<Record<string, unknown>>): boolean {
  if (!isRecord(actual) || !exactKeys(actual, Object.keys(expected))) return false;
  return Object.entries(expected).every(([key, value]) =>
    Array.isArray(value) ? exactStrings(actual[key], value as readonly string[]) : actual[key] === value);
}

/** The shape of a production `source` block: the user's own sources, Series Knowledge only for the review rule (since v23), plus the kind's own term. */
function productionSource(
  materialReferences: boolean,
  editorialDeliverables: boolean,
  kindTerm?: 'editorSelectedPassageOnly' | 'singleManuscriptConflictRegionOnly' | 'frozenMaterialExcerptOnly',
  seriesKnowledge = false,
): Readonly<Record<string, unknown>> {
  return {
    admittedInputs: PRODUCTION_ADMITTED_INPUTS,
    privateManuscriptAllowed: true,
    materialReferencesAllowed: materialReferences,
    seriesKnowledgeAllowed: seriesKnowledge,
    editorialDeliverablesAllowed: editorialDeliverables,
    ...(kindTerm === undefined ? {} : { [kindTerm]: true }),
  };
}

/** One ordinary-production allow rule this launch can read; every block of the rule is compared whole, so a missing or unknown term denies. */
interface OrdinaryProductionRuleReading {
  readonly modelRole: 'Main Editorial Role' | 'Fast Interaction Role';
  readonly taskKinds: readonly string[];
  /** Every category the rule names, as the policy writes them. */
  readonly policyCategories: readonly string[];
  /** All policy categories, including the unpublished classes, carried to the production Egress Gate. */
  readonly outboundDataCategories: readonly OutboundDataCategoryId[];
  readonly crossUnitSynthesisAllowed: boolean;
  /** Whether the rule lets the model ask a clarification question (v15); its `clarification` block is compared whole either way. */
  readonly clarification: boolean;
  /** Whether this is the enrolled-background rule, the only one scheduled and background. */
  readonly background: boolean;
  /** Whether the rule may research (v17): its web switch is on and it names the platform tools block, compared whole. */
  readonly platformTools: boolean;
  /** Whether the rule states `sourceTranslationAllowed: true` (v19): the research review rule alone. */
  readonly sourceTranslation: boolean;
  /** Whether the rule names `house-review-preference-excerpt` and its declaration (v21): the review rule alone. */
  readonly houseReviewPreference: boolean;
  /** Whether the rule states `source.seriesKnowledgeAllowed: true`, names `series-knowledge-excerpt` and its declaration (v23): the review rule alone. */
  readonly seriesKnowledge: boolean;
  /** Whether the rule names `editor-authored-question-template` and its declaration (v23): the custom analysis rule alone. */
  readonly questionTemplate: boolean;
  /** Whether this rule admits no model-initiated retrieval (v19): enrolled background analysis and 来源译文; since v23 also custom analysis. */
  readonly noRetrieval: boolean;
  readonly blocks: {
    readonly authorityOrigin: Readonly<Record<string, unknown>>;
    readonly executionMode: Readonly<Record<string, unknown>>;
    readonly scopeLimits: Readonly<Record<string, unknown>> | null;
    readonly clarification: Readonly<Record<string, unknown>>;
    readonly source: Readonly<Record<string, unknown>>;
    readonly transmissions: Readonly<Record<string, unknown>>;
    readonly authorizationPreconditions: Readonly<Record<string, unknown>>;
    readonly providerAccountLimit: Readonly<Record<string, unknown>>;
    readonly output: Readonly<Record<string, unknown>> | null;
  };
}

function productionReading(
  modelRole: OrdinaryProductionRuleReading['modelRole'],
  taskKinds: readonly string[],
  gateCategories: readonly OutboundDataCategoryId[],
  blocks: OrdinaryProductionRuleReading['blocks'],
  crossUnitSynthesisAllowed = false,
  background = false,
): OrdinaryProductionRuleReading {
  const policyCategories = [...gateCategories, ...PRODUCTION_UNPUBLISHED_CLASSES];
  return { modelRole, taskKinds, policyCategories, outboundDataCategories: policyCategories, crossUnitSynthesisAllowed,
    clarification: blocks.clarification === CLARIFICATION_ASKS, background, platformTools: false, sourceTranslation: false, houseReviewPreference: false, seriesKnowledge: false, questionTemplate: false, noRetrieval: background, blocks };
}

/**
 * A production rule that may research (v17): its kinds and gate categories plus the two web categories (before the unpublished
 * classes), its transmission constants with the web switch on, and the platform tools block.
 */
function researchReading(reading: OrdinaryProductionRuleReading, extraKinds: readonly string[] = []): OrdinaryProductionRuleReading {
  const gate = reading.policyCategories.filter((category) => !(PRODUCTION_UNPUBLISHED_CLASSES as readonly string[]).includes(category));
  const policyCategories = [...gate, ...WEB_TOOL_CATEGORIES, ...PRODUCTION_UNPUBLISHED_CLASSES] as OutboundDataCategoryId[];
  return {
    ...reading,
    taskKinds: [...reading.taskKinds, ...extraKinds],
    policyCategories,
    outboundDataCategories: policyCategories,
    platformTools: true,
    blocks: { ...reading.blocks, transmissions: { ...reading.blocks.transmissions, webSearchToolAllowed: true } },
  };
}

const RUN_BLOCKS = {
  authorityOrigin: PRODUCTION_RUN_ORIGIN, executionMode: PRODUCTION_EXECUTION_MODE, scopeLimits: null, clarification: CLARIFICATION_ASKS,
  authorizationPreconditions: PRODUCTION_RUN_PRECONDITIONS, providerAccountLimit: PRODUCTION_RUN_ACCOUNT_LIMIT, output: null,
} as const;
const FOREGROUND_BLOCKS = {
  executionMode: PRODUCTION_EXECUTION_MODE, scopeLimits: null, clarification: CLARIFICATION_NONE,
  authorizationPreconditions: PRODUCTION_FOREGROUND_PRECONDITIONS, providerAccountLimit: PRODUCTION_ATTEMPT_ACCOUNT_LIMIT,
} as const;

/**
 * The ten ordinary-production rules of Provider Processing v23, by rule id: the same kinds as developer-live v22, each
 * `eligible-only`, bound to the editor's own configured role binding rather than to one fixed route, and each read whole. Review,
 * writing and evaluation may research through the backend the editor configures with their own key.
 */
/** The rule id of the custom analysis rule of Provider Processing v23 (ordinary-production). */
export const PRODUCTION_CUSTOM_ANALYSIS_RULE_ID = 'ordinary-production-custom-analysis';

const ORDINARY_PRODUCTION_RULES: Readonly<Record<string, OrdinaryProductionRuleReading>> = {
  'ordinary-production-baseline-analysis': productionReading('Main Editorial Role', ['baseline-manuscript-analysis'], ['public-or-synthetic'],
    { ...RUN_BLOCKS, source: productionSource(false, false), transmissions: PRODUCTION_BASELINE_TRANSMISSIONS }),
  'ordinary-production-editorial-dialogue': productionReading('Fast Interaction Role', ['editorial-dialogue'], ['editor-selected-manuscript-excerpt'],
    { ...FOREGROUND_BLOCKS, authorityOrigin: PRODUCTION_DIALOGUE_ORIGIN, source: productionSource(false, false, 'editorSelectedPassageOnly'), transmissions: PRODUCTION_DIALOGUE_TRANSMISSIONS, output: null }),
  'ordinary-production-review': { ...researchReading(productionReading('Main Editorial Role',
    ['editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression', 'editorial-review/cross-deliverable-consistency'],
    ['public-or-synthetic', 'frozen-material-reference-excerpt', 'editorial-deliverable-excerpt', HOUSE_REVIEW_PREFERENCE_CATEGORY, SERIES_KNOWLEDGE_EXCERPT_CATEGORY],
    { ...RUN_BLOCKS, authorityOrigin: PRODUCTION_REVIEW_ORIGIN, source: productionSource(true, true, undefined, true), transmissions: PRODUCTION_REVIEW_TRANSMISSIONS }),
    [...WEB_REVIEW_KINDS, SERIES_CONSISTENCY_REVIEW_KIND]), sourceTranslation: true, houseReviewPreference: true, seriesKnowledge: true },
  'ordinary-production-writing': researchReading(productionReading('Main Editorial Role', ['writing'],
    ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt'],
    { ...RUN_BLOCKS, source: productionSource(true, false), transmissions: PRODUCTION_SYNTHESIS_TRANSMISSIONS }, true)),
  'ordinary-production-evaluation': researchReading(productionReading('Main Editorial Role', ['evaluation', 'readers-report', 'evaluation-rewrite'],
    ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt'],
    { ...RUN_BLOCKS, source: productionSource(true, false), transmissions: PRODUCTION_SYNTHESIS_TRANSMISSIONS }, true)),
  'ordinary-production-editorial-polish': productionReading('Fast Interaction Role', ['editorial-polish'], ['editor-selected-manuscript-excerpt'],
    { ...FOREGROUND_BLOCKS, authorityOrigin: PRODUCTION_FOREGROUND_ORIGIN, source: productionSource(false, false, 'editorSelectedPassageOnly'), transmissions: PRODUCTION_SUGGESTION_TRANSMISSIONS, output: PRODUCTION_SUGGESTION_OUTPUT }),
  'ordinary-production-conflict-regenerate': productionReading('Fast Interaction Role', ['conflict-regenerate'], ['manuscript-conflict-region-excerpt'],
    { ...FOREGROUND_BLOCKS, authorityOrigin: PRODUCTION_FOREGROUND_ORIGIN, source: productionSource(false, false, 'singleManuscriptConflictRegionOnly'), transmissions: PRODUCTION_SUGGESTION_TRANSMISSIONS, output: PRODUCTION_SUGGESTION_OUTPUT }),
  // Enrolled background analysis (v15, unchanged in v17, no web): baseline analysis dispatched by an active matching enrollment, within its mandatory ceiling.
  [BACKGROUND_ANALYSIS_RULE_ID]: productionReading('Main Editorial Role', ['baseline-manuscript-analysis'], ['public-or-synthetic'],
    { ...RUN_BLOCKS, authorityOrigin: BACKGROUND_ORIGIN, executionMode: PRODUCTION_BACKGROUND_EXECUTION_MODE, scopeLimits: BACKGROUND_SCOPE_LIMITS,
      authorizationPreconditions: BACKGROUND_PRECONDITIONS, source: productionSource(false, false), transmissions: PRODUCTION_BASELINE_TRANSMISSIONS }, false, true),
  // 来源译文 of 资料库 materials (v19, Issue #891): one foreground attempt on the Fast Interaction Role over one frozen excerpt.
  'ordinary-production-material-translation': { ...productionReading('Fast Interaction Role', [MATERIAL_TRANSLATION_KIND], ['frozen-material-reference-excerpt'],
    { ...FOREGROUND_BLOCKS, authorityOrigin: PRODUCTION_FOREGROUND_ORIGIN, source: productionSource(true, false, 'frozenMaterialExcerptOnly'), transmissions: PRODUCTION_TRANSLATION_TRANSMISSIONS, output: null }), noRetrieval: true },
  // Custom analysis dimensions (v23, Issue #920, ADR 0090 §4): the family `custom-analysis/*` planned like the baseline over an editor-authored
  // per-unit question template; no tool, no cross-unit reduction, no Material Reference or Series Knowledge.
  [PRODUCTION_CUSTOM_ANALYSIS_RULE_ID]: { ...productionReading('Main Editorial Role', [CUSTOM_ANALYSIS_KIND_FAMILY], ['public-or-synthetic', EDITOR_AUTHORED_QUESTION_TEMPLATE_CATEGORY],
    { ...RUN_BLOCKS, source: productionSource(false, false), transmissions: PRODUCTION_REVIEW_TRANSMISSIONS }), questionTemplate: true, noRetrieval: true },
};
/** The rule every ordinary-production policy must carry, whose reading the projection's suboperation flags come from. */
const ORDINARY_PRODUCTION_BASELINE_RULE_ID = 'ordinary-production-baseline-analysis';

/** The terms of a Provider Processing v13, v15 or v17 document, root level: a document with any other root term is one this launch cannot read. */
const PRODUCTION_POLICY_TERMS = [
  'schemaDialect', 'schemaPath', 'documentType', 'policyId', 'policyType', 'version', 'lifecycleStatus', 'predecessorVersion',
  'predecessorCanonicalPath', 'canonicalPath', 'humanProjectionPath', 'operationalScope', 'authorityBasis', 'trustedSelection',
  'decision', 'roleBindings', 'outboundDataCategories', 'credentialBoundary', 'authoritySeparations',
] as const;
/** The outbound data category vocabulary of Provider Processing v23 (v21's plus the question-template and Series Knowledge categories): the Egress Gate's identifiers (the two web categories since v17) and the three unpublished classes. */
const PRODUCTION_CATEGORY_VOCABULARY = [
  'public-or-synthetic', 'unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content', 'editor-selected-manuscript-excerpt',
  'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'book-metadata-and-synopsis', 'manuscript-conflict-region-excerpt',
  'frozen-material-reference-excerpt', 'editorial-deliverable-excerpt', HOUSE_REVIEW_PREFERENCE_CATEGORY, EDITOR_AUTHORED_QUESTION_TEMPLATE_CATEGORY,
  SERIES_KNOWLEDGE_EXCERPT_CATEGORY, ...WEB_TOOL_CATEGORIES,
] as const;
/** Every separation of authority Provider Processing v13 names; each is `false`, and a document naming fewer or more is unreadable. */
const PRODUCTION_AUTHORITY_SEPARATIONS = [
  'policyEligibilityDispatchesProviderCall', 'policyEligibilityCreatesProviderImplementation', 'runSourceScopeAloneAuthorizesTransmission',
  'runAuthorizationAloneOverridesThisPolicy', 'configuredProviderAloneAuthorizesTransmission', 'providerSetupAloneAuthorizesTransmission',
  'configuredCredentialAloneAuthorizesTransmission', 'artifactInstallOrEnablementAuthorizesTransmission',
  'dshSessionOrPluginMembershipAuthorizesTransmission', 'defaultExecutionRuleWithoutUserInitiatedTaskAuthorizesTransmission',
  'backgroundAnalysisEnrollmentAuthorizesTransmission', 'externalExportPolicyAuthorizesProviderTransmission',
  'effectApprovalAuthorizesProviderTransmission', 'providerResultCacheIsRecordedDeterministicModelFixture',
  'providerResultCacheProvesProviderConformance', 'providerProcessingAuthorizesManuscriptApply', 'providerProcessingAuthorizesLearning',
  'providerProcessingAuthorizesPublication', 'providerProcessingGrantsPublicReleasePermission',
] as const;

/** What a verified ordinary-production policy says, before any configured binding is applied. */
export interface OrdinaryProductionPolicyReading {
  readonly originalFieldQualificationId?: 'ordinary-production-original-fields-adr0099';
  /** Accepted declarations include future consumers; this list is not a list of executable recipes. */
  readonly declaredRuleIds?: readonly string[];
  readonly backgroundProcessingEnrollment?: LaunchPolicyProjection['providerProcessing']['backgroundProcessingEnrollment'];
  readonly subAgents?: LaunchPolicyProjection['providerProcessing']['subAgents'];
  readonly execution?: LaunchPolicyProjection['providerProcessing']['execution'];
  readonly transport?: LaunchPolicyProjection['providerProcessing']['transport'];
  readonly research?: LaunchPolicyProjection['providerProcessing']['research'];
  readonly crossUnitReductionAllowed: boolean;
  readonly assuranceSamplingAllowed: boolean;
  readonly runReportReflectionAllowed: boolean;
  /** Main's bindings; before v25 they also apply to Fast. */
  readonly allowedBindings: readonly AllowedRoleBinding[];
  readonly fastAllowedBindings?: readonly AllowedRoleBinding[];
  readonly connectionTestAllowed?: boolean;
  /** The rules in policy order, each with the routes the policy lets its role bind and its verified platform tools (`null` without web). */
  readonly rules: ReadonlyArray<{
    readonly ruleId: string;
    readonly reading: OrdinaryProductionRuleReading;
    readonly allowedRoutes: readonly string[];
    readonly platformTools: AdmittedPlatformTools | null;
    /** The rule's verified local tools: retrieval allowed on every rule but enrolled background analysis, material translation and custom analysis. */
    readonly localTools: AdmittedLocalTools;
    readonly projection?: Partial<Pick<AdmittedProviderRule, 'taskKinds' | 'outboundDataCategories' | 'crossUnitSynthesisAllowed' |
      'plusDeclaredContractRetryAdaptations' | 'plusOneCrossUnitSynthesisTurn' | 'globalAgentDialogue' |
      'taskKindOverrides' | 'editorTaskInstruction' | 'houseReviewGuidelineClause' | 'enabledLearningEnvelope' | 'claimScopedFactualStages' | 'factualRecheck'>>;
  }>;
}

function allowedBindingsOf(role: unknown): AllowedRoleBinding[] {
  requirePolicy(isRecord(role) && Array.isArray(role['allowedBindings']) && role['allowedBindings'].length > 0);
  const bindings: AllowedRoleBinding[] = [];
  for (const entry of role['allowedBindings'] as unknown[]) {
    requirePolicy(isRecord(entry) && exactKeys(entry, ['route', 'endpoint', 'model', 'credentialSlot']));
    for (const key of ['route', 'endpoint', 'model', 'credentialSlot']) requirePolicy(typeof entry[key] === 'string' && (entry[key] as string).length > 0);
    requirePolicy(!bindings.some((known) => known.route === entry['route'] && known.model === entry['model']));
    bindings.push({ route: entry['route'] as string, endpoint: entry['endpoint'] as string, model: entry['model'] as string, credentialSlot: entry['credentialSlot'] as string });
  }
  return bindings;
}

/**
 * Verify v26's additions exactly before verifying its inherited terms with the v25 reader.
 * Projection happens only after both checks pass. Missing, extra or differently shaped terms fail closed.
 * The governor terms state configurable defaults only; their effective numbers are runtime configuration (ADR 0095 §2, §6).
 */
function readWave20Eligibility(policy: Record<string, unknown>): Record<string, unknown> {
  requirePolicy(sameValue(policy['execution'], {
    maxInFlightRequests: { configurable: true, default: 4 }, perRunUnitParallelism: { configurable: true, default: 3 },
    backgroundShare: { configurable: true, default: 1 },
  }) && sameValue(policy['transport'], {
    requestDeadlineSeconds: 180, rateLimitRetry: { honourRetryAfter: true, maxRetries: 1 },
  }) && sameValue(policy['research'], { searchesPerClaim: 3 }));
  const categories = policy['outboundDataCategories'];
  requirePolicy(isRecord(categories) && sameValue(categories['editor-task-instruction'], { labelZh: '编辑任务说明' }) &&
    sameValue(categories['house-review-guideline-clause'], { labelZh: '本社审阅规范条款' }));
  const legacyCategories = { ...categories };
  delete legacyCategories['editor-task-instruction'];
  delete legacyCategories['house-review-guideline-clause'];
  const decision = policy['decision'];
  requirePolicy(isRecord(decision) && Array.isArray(decision['providerAllowRules']));
  const declarations = LOCAL_TOOL_DECLARATION_NAMES
    .map((name) => ({ name, readOnly: true, concurrencySafe: true }));
  const rules = decision['providerAllowRules'].map((rule: unknown) => {
    requirePolicy(isRecord(rule) && typeof rule['ruleId'] === 'string' && Object.hasOwn(ORDINARY_PRODUCTION_RULES, rule['ruleId']));
    const reading = ORDINARY_PRODUCTION_RULES[rule['ruleId']]!;
    const legacyTools = expectedLocalTools(!reading.noRetrieval);
    requirePolicy(sameValue(rule['localTools'], {
      ...legacyTools, ...(!reading.noRetrieval ? { declarations, parallelCallsAllowed: true } : {}),
    }));
    const legacy: Record<string, unknown> = { ...rule, localTools: legacyTools };
    if (rule['ruleId'] === BACKGROUND_ANALYSIS_RULE_ID) {
      const preconditions = rule['authorizationPreconditions'];
      requirePolicy(isRecord(preconditions) && preconditions['backgroundShare'] === 'execution.backgroundShare' &&
        !Object.hasOwn(preconditions, 'backgroundSlotShare'));
      const legacyPreconditions = { ...preconditions };
      delete legacyPreconditions['backgroundShare'];
      legacy['authorizationPreconditions'] = { ...legacyPreconditions, backgroundSlotShare: 'capacity-minus-one' };
    }
    if (rule['ruleId'] === 'ordinary-production-review') {
      requirePolicy(exactStrings(rule['allowedTaskKinds'], [...reading.taskKinds, 'editorial-review/publication-risk']) &&
        exactStrings(rule['allowedOutboundDataCategories'], [...reading.policyCategories, 'editor-task-instruction', 'house-review-guideline-clause']));
      requirePolicy(sameValue(rule['taskKindOverrides'], { 'editorial-review/publication-risk': { webSearch: false } }) &&
        sameValue(rule['editorTaskInstruction'], {
          category: 'editor-task-instruction', maxGraphemes: 1200, attributedToProcedureVersion: true,
          personNamesAllowed: false, contractFramingOverrideAllowed: false,
        }) && sameValue(rule['houseReviewGuidelineClause'], {
          category: 'house-review-guideline-clause', maxClauses: 40, maxGraphemesPerClause: 300,
          attributedToImportedDocumentVersion: true, personNamesAllowed: false,
        }));
      const transmissions = rule['transmissions'];
      requirePolicy(isRecord(transmissions) && transmissions['crossUnitSynthesisAllowed'] === true &&
        transmissions['plusDeclaredContractRetryAdaptations'] === true);
      const legacyTransmissions = { ...transmissions };
      delete legacyTransmissions['crossUnitSynthesisAllowed'];
      delete legacyTransmissions['plusDeclaredContractRetryAdaptations'];
      legacy['transmissions'] = legacyTransmissions;
      legacy['allowedTaskKinds'] = [...reading.taskKinds];
      legacy['allowedOutboundDataCategories'] = [...reading.policyCategories];
      delete legacy['taskKindOverrides'];
      delete legacy['editorTaskInstruction'];
      delete legacy['houseReviewGuidelineClause'];
    }
    return legacy;
  });
  const legacy: Record<string, unknown> = { ...policy, outboundDataCategories: legacyCategories, decision: { ...decision, providerAllowRules: rules } };
  delete legacy['execution'];
  delete legacy['transport'];
  delete legacy['research'];
  return legacy;
}

const GLOBAL_AGENT_RULE_ID = 'ordinary-production-global-agent-dialogue';
const GLOBAL_AGENT_SOURCE = {
  bookRequired: false, explicitlyListedEligibleMemoryAndPreferenceRevisionsOnly: true,
  eligibleRevisionPinsRequired: true, editorOwnWordsAllowed: true, unlistedSourcesAllowed: false,
} as const;
const GLOBAL_AGENT_READING: OrdinaryProductionRuleReading = {
  ...productionReading('Fast Interaction Role', ['global-agent-dialogue'], [], {
    ...FOREGROUND_BLOCKS,
    authorityOrigin: {
      foregroundEditorQuestionRequired: true, admittedAttemptActions: ['ask', 'continue', 'regenerate'],
      planEnvelopeOrRunAuthorizationRequired: false, matchingActiveDefaultExecutionRuleAllowed: false,
      backgroundAnalysisEnrollmentAllowed: false, idleScheduledImportTriggeredOrCrossRunDispatchAllowed: false,
    },
    source: GLOBAL_AGENT_SOURCE,
    transmissions: {
      oneTechnicalSessionPerAttempt: true, oneBoundedPayloadPerAttempt: true,
      payloadLimitedToFrozenContractListedRevisionsEditorWordsAndRetainedFragments: true,
      continueAndRegenerateAreNewAttempts: true, automaticResendInsideStoppedSessionAllowed: false,
      identicalRequestReplaysFromProviderResultCache: false, webSearchToolAllowed: false,
    },
    authorizationPreconditions: {
      ...PRODUCTION_FOREGROUND_PRECONDITIONS, listedSourceRevisionsRecheckedBeforeTransmission: true,
      outboundDataDisclosureRequired: true,
    },
    output: null,
  }),
  policyCategories: [...PRODUCTION_CATEGORY_VOCABULARY, 'editor-task-instruction', 'house-review-guideline-clause'],
  outboundDataCategories: [...PRODUCTION_CATEGORY_VOCABULARY, 'editor-task-instruction', 'house-review-guideline-clause'],
  noRetrieval: true,
};
const BACKGROUND_PROCESSING_RULE_ID = 'enrolled-background-processing';
const BACKGROUND_PROCESSING_KINDS = ['learning-curation', 'material-index', 'review-reduction', 'factual-recheck'] as const;
const BACKGROUND_PROCESSING_READING = productionReading('Main Editorial Role', BACKGROUND_PROCESSING_KINDS, ['public-or-synthetic'], {
  ...RUN_BLOCKS,
  authorityOrigin: {
    activeMatchingBackgroundProcessingEnrollmentRequired: true, newUserInitiatedTaskRequired: false,
    providerSetupCreatesEnrollment: false, manuscriptImportCreatesEnrollment: false, artifactInstallOrEnablementCreatesEnrollment: false,
    eachDispatchCreatesExactRun: true, matchingActiveDefaultExecutionRuleAllowed: false, importTriggeredOrUnenrolledCrossRunDispatchAllowed: false,
  },
  executionMode: PRODUCTION_BACKGROUND_EXECUTION_MODE,
  scopeLimits: { declaredEnrolledKindOnly: true, formalManuscriptMutationAllowed: false, externalEffectAllowed: false, backgroundPolicyWorkAllowed: false },
  source: { admittedInputs: 'authorized-pinned-sources-only', runSourceScopeRequired: true, unlistedSourcesAllowed: false },
  transmissions: PRODUCTION_BASELINE_TRANSMISSIONS,
  authorizationPreconditions: {
    ...BACKGROUND_PRECONDITIONS,
    backgroundShare: 'execution.backgroundShare',
  },
}, false, true);

/** Verify the Owner's Wave 21 additions before reading the unchanged v26 declarations. */
function readWave21Eligibility(policy: Record<string, unknown>): Record<string, unknown> {
  // Both new rules name the Main bindings' routes, read from the document as every inherited rule's are, never source constants.
  const roles = policy['roleBindings'];
  requirePolicy(isRecord(roles));
  const routes = [...new Set(allowedBindingsOf(roles['Main Editorial Role']).map((binding) => binding.route))];
  const declaredDecision = policy['decision'];
  requirePolicy(isRecord(declaredDecision) && Array.isArray(declaredDecision['providerAllowRules']));
  const backgroundRules = declaredDecision['providerAllowRules'].filter((rule: unknown) => isRecord(rule) && rule['ruleId'] === BACKGROUND_PROCESSING_RULE_ID);
  requirePolicy(backgroundRules.length === 1 && isRecord(backgroundRules[0]));
  const enrollment = backgroundRules[0]['backgroundProcessingEnrollment'];
  requirePolicy(sameValue(enrollment, {
    enrollableKinds: BACKGROUND_PROCESSING_KINDS
      .map((kind) => ({ kind, mandatoryCeiling: true })),
    activeMatchingEnrollmentRequired: true, revocable: true, planEnvelopeRequired: true,
    exactProviderBindingRequired: true, runAuthorizationRequired: true, runSourceScopeRequired: true,
    ceilingEvaluatedBeforeEveryDispatch: true, finalProviderPayloadEgressGateRequired: true,
    openingPageOrImportCreatesEnrollment: false,
  }));
  requirePolicy(sameValue(policy['subAgents'], {
    declaredInPlanEnvelopeRequired: true, inheritsParentScopeBindingPolicyAndCeiling: true,
    countsInsideParentAttemptTransmissionBound: true, finalProviderPayloadEgressGateRequired: true,
    createsTaskRunOrDecisionRecordAllowed: false,
  }));
  const legacy = structuredClone(policy);
  delete legacy['subAgents'];
  const decision = legacy['decision'];
  requirePolicy(isRecord(decision) && Array.isArray(decision['providerAllowRules']));
  const globalRules = decision['providerAllowRules'].filter((rule: unknown) => isRecord(rule) && rule['ruleId'] === GLOBAL_AGENT_RULE_ID);
  const blocks = GLOBAL_AGENT_READING.blocks;
  requirePolicy(globalRules.length === 1 && sameValue(globalRules[0], {
    ruleId: GLOBAL_AGENT_RULE_ID, policyResult: 'eligible-only', purpose: 'ordinary-production-model-processing',
    authorityOrigin: blocks.authorityOrigin, executionMode: blocks.executionMode, source: blocks.source,
    allowedOutboundDataCategories: GLOBAL_AGENT_READING.policyCategories, outboundCategoryRestriction: 'none',
    // ADR 0079 §4.4 binds this rule too: no ADR amendment lifts house-people redaction (#1071, #1104).
    redaction: HOUSE_PEOPLE_REDACTION,
    providerBinding: {
      modelRole: 'Fast Interaction Role', bindingSource: 'user-configured-role-binding',
      allowedRoutes: routes, exactProviderBindingRequired: true,
      fallbackAllowed: false, approvedFallbackChainMaximumItems: 0, secondModelAllowed: false, productionDefaultsChanged: false,
    },
    transmissions: blocks.transmissions, localTools: expectedLocalTools(false), clarification: blocks.clarification,
    authorizationPreconditions: blocks.authorizationPreconditions, providerAccountLimit: blocks.providerAccountLimit,
    capture: PRODUCTION_CAPTURE, additionalPrivacyPrompts: NO_EXTRA_PRIVACY_PROMPTS,
    allowedTaskKinds: GLOBAL_AGENT_READING.taskKinds,
  }));
  const backgroundBlocks = BACKGROUND_PROCESSING_READING.blocks;
  const backgroundPreconditions = { ...backgroundBlocks.authorizationPreconditions };
  delete backgroundPreconditions['backgroundSlotShare'];
  requirePolicy(sameValue(backgroundRules[0], {
    ruleId: BACKGROUND_PROCESSING_RULE_ID, policyResult: 'eligible-only', purpose: 'ordinary-production-model-processing',
    authorityOrigin: backgroundBlocks.authorityOrigin, scopeLimits: backgroundBlocks.scopeLimits,
    executionMode: backgroundBlocks.executionMode, source: backgroundBlocks.source,
    allowedOutboundDataCategories: BACKGROUND_PROCESSING_READING.policyCategories, redaction: HOUSE_PEOPLE_REDACTION,
    providerBinding: {
      modelRole: 'Main Editorial Role', bindingSource: 'user-configured-role-binding',
      allowedRoutes: routes, exactProviderBindingRequired: true,
      fallbackAllowed: false, approvedFallbackChainMaximumItems: 0, secondModelAllowed: false, productionDefaultsChanged: false,
    },
    transmissions: backgroundBlocks.transmissions, localTools: expectedLocalTools(false), clarification: backgroundBlocks.clarification,
    authorizationPreconditions: backgroundPreconditions, providerAccountLimit: backgroundBlocks.providerAccountLimit,
    capture: PRODUCTION_CAPTURE, additionalPrivacyPrompts: NO_EXTRA_PRIVACY_PROMPTS,
    allowedTaskKinds: BACKGROUND_PROCESSING_KINDS, backgroundProcessingEnrollment: enrollment,
  }));
  const inheritedRules = decision['providerAllowRules'].filter((rule: unknown) => !isRecord(rule) ||
    (rule['ruleId'] !== BACKGROUND_PROCESSING_RULE_ID && rule['ruleId'] !== GLOBAL_AGENT_RULE_ID));
  decision['providerAllowRules'] = inheritedRules;
  const review = inheritedRules.find((rule: unknown) => isRecord(rule) && rule['ruleId'] === 'ordinary-production-review');
  requirePolicy(isRecord(review) && isRecord(review['transmissions']) && review['transmissions']['plusOneCrossUnitSynthesisTurn'] === true);
  delete review['transmissions']['plusOneCrossUnitSynthesisTurn'];
  legacy['version'] = 'v26';
  return legacy;
}

/** Read the pinned successor directly; no predecessor document is synthesized or restamped. */
function projectOriginalFieldPolicy(policy: Record<string, unknown>): OrdinaryProductionPolicyReading {
  requirePolicy(digest(Buffer.from(canonicalJson(policy))) === (policy['version'] === 'v30'
    ? '146677f260a885ea5b6f1f5839b3574683d45d1224ebaa0ecd50509876fa47f3'
    : 'ffe7a210dfe52c22810f8bcd07db8dc4335a770dde098ebc77f6755ed0c86e3d'));
  const declared = (policy['decision'] as { providerAllowRules: Array<Record<string, unknown>> }).providerAllowRules;
  const rules: OrdinaryProductionPolicyReading['rules'][number][] = [];
  for (const rule of declared) {
    const ruleId = String(rule['ruleId']);
    const curation = ruleId === 'ordinary-production-learning-curation' && policy['version'] === 'v31';
    const factualRecheck = ruleId === 'enrolled-background-factual-recheck';
    const curationBlocks = Object.fromEntries(['authorityOrigin', 'executionMode', 'scopeLimits', 'clarification', 'source', 'transmissions',
      'authorizationPreconditions', 'providerAccountLimit'].map((key) => [key, rule[key]]));
    const base = factualRecheck ? researchReading(productionReading('Main Editorial Role', ['factual-recheck'], ['public-or-synthetic'],
      { ...curationBlocks, output: null } as OrdinaryProductionRuleReading['blocks'], false, true))
      : curation ? productionReading('Main Editorial Role', ['learning-curation'], ['editorial-learning-example'],
      { ...curationBlocks, output: null } as OrdinaryProductionRuleReading['blocks'], false, true) : ruleId === GLOBAL_AGENT_RULE_ID ? GLOBAL_AGENT_READING
      : ruleId === BACKGROUND_PROCESSING_RULE_ID ? BACKGROUND_PROCESSING_READING : ORDINARY_PRODUCTION_RULES[ruleId];
    // These declarations await their separately admitted typed consumers; no generic background fallback.
    if (base === undefined) continue;
    const reading: OrdinaryProductionRuleReading = { ...base,
      taskKinds: rule['allowedTaskKinds'] as string[], outboundDataCategories: rule['allowedOutboundDataCategories'] as OutboundDataCategoryId[],
      blocks: { ...base.blocks, source: rule['source'] as Record<string, unknown>, transmissions: rule['transmissions'] as Record<string, unknown> } };
    const projection: NonNullable<OrdinaryProductionPolicyReading['rules'][number]['projection']> = {
      taskKinds: reading.taskKinds, outboundDataCategories: reading.outboundDataCategories,
      ...(curation ? { enabledLearningEnvelope: rule['enabledLearningEnvelope'] as NonNullable<AdmittedProviderRule['enabledLearningEnvelope']> } : {}),
      ...(factualRecheck ? { factualRecheck: rule['factualRecheck'] as NonNullable<AdmittedProviderRule['factualRecheck']> } : {}),
      ...(ruleId === 'ordinary-production-review' ? {
        claimScopedFactualStages: rule['claimScopedFactualStages'] as NonNullable<AdmittedProviderRule['claimScopedFactualStages']>,
        crossUnitSynthesisAllowed: true, plusDeclaredContractRetryAdaptations: true,
        taskKindOverrides: rule['taskKindOverrides'] as NonNullable<AdmittedProviderRule['taskKindOverrides']>,
        editorTaskInstruction: rule['editorTaskInstruction'] as NonNullable<AdmittedProviderRule['editorTaskInstruction']>,
        houseReviewGuidelineClause: rule['houseReviewGuidelineClause'] as NonNullable<AdmittedProviderRule['houseReviewGuidelineClause']>,
      } : {}),
      ...(reading.blocks.transmissions['plusOneCrossUnitSynthesisTurn'] === true ? { plusOneCrossUnitSynthesisTurn: true } : {}),
      ...(ruleId === GLOBAL_AGENT_RULE_ID ? { globalAgentDialogue: {
        source: GLOBAL_AGENT_SOURCE, redaction: HOUSE_PEOPLE_REDACTION,
        outboundCategoryRestriction: 'none', outboundDataDisclosureRequired: true,
      } } : {}),
    };
    rules.push({ ruleId, reading, projection,
      allowedRoutes: [...new Set((base.modelRole === 'Fast Interaction Role' ? ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS : ORDINARY_PRODUCTION_ALLOWED_BINDINGS).map((binding) => binding.route))],
      platformTools: verifyPlatformTools(factualRecheck ? declared.find((candidate) => candidate['ruleId'] === 'ordinary-production-review')! : rule, 'ordinary-production', base.platformTools),
      localTools: rule['localTools'] as AdmittedLocalTools });
  }
  return { originalFieldQualificationId: 'ordinary-production-original-fields-adr0099', declaredRuleIds: declared.map((rule) => String(rule['ruleId'])),
    crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true,
    allowedBindings: ORDINARY_PRODUCTION_ALLOWED_BINDINGS, fastAllowedBindings: ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS, connectionTestAllowed: true,
    execution: policy['execution'] as NonNullable<OrdinaryProductionPolicyReading['execution']>,
    transport: policy['transport'] as NonNullable<OrdinaryProductionPolicyReading['transport']>,
    research: policy['research'] as NonNullable<OrdinaryProductionPolicyReading['research']>,
    subAgents: policy['subAgents'] as NonNullable<OrdinaryProductionPolicyReading['subAgents']>,
    backgroundProcessingEnrollment: declared.find((rule) => rule['ruleId'] === BACKGROUND_PROCESSING_RULE_ID)!['backgroundProcessingEnrollment'] as NonNullable<OrdinaryProductionPolicyReading['backgroundProcessingEnrollment']>, rules };
}

/**
 * Provider Processing v23 (ordinary-production): default deny with ten eligible-only rules this launch can read, each bound to
 * a user-configured role binding, the three that may research each with the platform tools block the search backend registry implies. Everything is read whole and fails closed: a missing term, an unknown term, a rule id outside
 * `ORDINARY_PRODUCTION_RULES`, a repeated id, or any value that differs from the reading is a policy the launch cannot read.
 * The routing values themselves (route, endpoint, model, credential slot) are never source constants here: they are read from
 * the document's `allowedBindings`, which the SHA-256 pin fixes, and checked for consistency across the roles and rules.
 */
export function verifyOrdinaryProductionPolicy(policy: Record<string, unknown>): OrdinaryProductionPolicyReading {
  if (policy['version'] === 'v30' || policy['version'] === 'v31') return projectOriginalFieldPolicy(policy);
  const wave21 = policy['version'] === 'v27' ? policy : null;
  if (policy['version'] === 'v27') policy = readWave21Eligibility(policy);
  const wave20 = policy['version'] === 'v26' ? policy : null;
  if (policy['version'] === 'v26') policy = readWave20Eligibility(policy);
  const selectedBindingPolicy = policy['version'] === 'v25' || policy['version'] === 'v26';
  requirePolicy(exactKeys(policy, [...PRODUCTION_POLICY_TERMS, ...(selectedBindingPolicy ? ['connectionTest'] : [])]) && policy['operationalScope'] === 'ordinary-production' && policy['lifecycleStatus'] === 'active');
  requirePolicy(sameBlock(policy['trustedSelection'], {
    selectionAuthorityClass: 'trusted-build-or-launch-authority',
    launchArgument: '--trusted-operational-scope ordinary-production',
    developerHostOnly: false,
    hostedOrCiSelectionAllowed: false,
    ordinaryProductSettingAllowed: false,
    environmentVariableSelectorAllowed: false,
    providerSelectorAllowed: false,
    artifactOrPluginSelectorAllowed: false,
    crossScopeFallbackAllowed: false,
    selectionConfiguresProvider: false,
    selectionDispatchesRun: false,
  }));
  requirePolicy(sameBlock(policy['credentialBoundary'], {
    isOutboundDataCategory: false,
    permittedInModelVisibleMaterial: false,
    permittedInGeneralOutboundMaterial: false,
    opaqueReferenceOnlyOutsideFinalConsumer: true,
    credentialBrokerResolutionRequired: true,
    finalAdapterOnly: true,
    protectedSecretStoreOnly: true,
    credentialOwnedByTheEditor: true,
    developmentCredentialFileReadAllowed: false,
    policyEligibilityConfiguresCredential: false,
  }));
  // No separation of authority may be granted: every one of the named separations is `false`, and no other is named.
  const separations = policy['authoritySeparations'];
  requirePolicy(isRecord(separations) && exactKeys(separations, PRODUCTION_AUTHORITY_SEPARATIONS) && Object.values(separations).every((value) => value === false));
  const vocabulary = policy['outboundDataCategories'];
  requirePolicy(isRecord(vocabulary) && exactKeys(vocabulary, PRODUCTION_CATEGORY_VOCABULARY) &&
    Object.values(vocabulary).every((entry) => isRecord(entry) && exactKeys(entry, ['labelZh']) && typeof entry['labelZh'] === 'string' && entry['labelZh'].length > 0));

  // The four roles. Main Editorial and Fast Interaction are user-configurable with a default; Difficult Escalation and Frontier
  // are unbound by default and named by no rule. Only v25's Fast role gains the reviewed text bindings.
  const roles = policy['roleBindings'];
  requirePolicy(isRecord(roles) && exactKeys(roles, ['Main Editorial Role', 'Fast Interaction Role', 'Difficult Escalation Role', 'Frontier Model Role']));
  if (selectedBindingPolicy) requirePolicy(sameValue(policy['connectionTest'], {
    ...CONNECTION_TEST_POLICY, allowedBindings: CONFIGURED_RUNTIME_MODEL_TABLE.policyBaseline.fast,
  }));
  const mainBindings = allowedBindingsOf(roles['Main Editorial Role']);
  const fastBindings = allowedBindingsOf(roles['Fast Interaction Role']);
  if (selectedBindingPolicy) {
    requirePolicy(sameValue(mainBindings, CONFIGURED_RUNTIME_MODEL_TABLE.policyBaseline.main) &&
      sameValue(fastBindings, CONFIGURED_RUNTIME_MODEL_TABLE.policyBaseline.fast));
  }
  const routes = [...new Set(mainBindings.map((binding) => binding.route))];
  for (const roleName of ['Main Editorial Role', 'Fast Interaction Role']) {
    const role = roles[roleName];
    requirePolicy(isRecord(role) && exactKeys(role, ['bindingState', 'userConfigurable', 'defaultBinding', 'allowedBindings', 'userConfiguredBindingAuthorizesTransmission', 'fallbackAllowed']) &&
      role['bindingState'] === 'user-configurable' && role['userConfigurable'] === true &&
      typeof role['defaultBinding'] === 'string' && routes.includes(role['defaultBinding']) &&
      role['userConfiguredBindingAuthorizesTransmission'] === false && role['fallbackAllowed'] === false &&
      sameValue(allowedBindingsOf(role), selectedBindingPolicy && roleName === 'Fast Interaction Role' ? fastBindings : mainBindings));
  }
  for (const roleName of ['Difficult Escalation Role', 'Frontier Model Role']) {
    const role = roles[roleName];
    requirePolicy(isRecord(role) && exactKeys(role, ['bindingState', 'userConfigurable', 'namedByAnyAllowRule', 'allowedBindings', 'userConfiguredBindingAuthorizesTransmission', 'fallbackAllowed']) &&
      role['bindingState'] === 'unbound-by-default' && role['userConfigurable'] === true && role['namedByAnyAllowRule'] === false &&
      role['userConfiguredBindingAuthorizesTransmission'] === false && role['fallbackAllowed'] === false &&
      JSON.stringify(allowedBindingsOf(role)) === JSON.stringify(mainBindings));
  }

  const decision = policy['decision'];
  requirePolicy(isRecord(decision) && exactKeys(decision, ['default', 'providerAllowRules']) && decision['default'] === 'deny' &&
    Array.isArray(decision['providerAllowRules']) && decision['providerAllowRules'].length === Object.keys(ORDINARY_PRODUCTION_RULES).length);
  const seen = new Set<string>();
  const rules: Array<{ ruleId: string; reading: OrdinaryProductionRuleReading; allowedRoutes: readonly string[]; platformTools: AdmittedPlatformTools | null; localTools: AdmittedLocalTools }> = [];
  for (const rule of decision['providerAllowRules'] as unknown[]) {
    requirePolicy(isRecord(rule) && typeof rule['ruleId'] === 'string' && !seen.has(rule['ruleId']) && Object.hasOwn(ORDINARY_PRODUCTION_RULES, rule['ruleId']));
    const ruleId = rule['ruleId'] as string;
    seen.add(ruleId);
    const reading = ORDINARY_PRODUCTION_RULES[ruleId]!;
    const allowedRoutes = selectedBindingPolicy && reading.taskKinds.includes(MATERIAL_TRANSLATION_KIND)
      ? [...new Set(fastBindings.map((binding) => binding.route))] : routes;
    const blocks = reading.blocks;
    requirePolicy(exactKeys(rule, [
      'ruleId', 'policyResult', 'purpose', 'authorityOrigin', 'executionMode', 'source', 'allowedOutboundDataCategories', 'redaction', 'providerBinding',
      'transmissions', 'clarification', 'authorizationPreconditions', 'providerAccountLimit', 'capture', 'additionalPrivacyPrompts', 'allowedTaskKinds', 'localTools',
      ...(reading.sourceTranslation ? ['sourceTranslationAllowed'] : []),
      ...(reading.houseReviewPreference ? ['houseReviewPreference'] : []),
      ...(reading.seriesKnowledge ? ['seriesKnowledgeExcerpt'] : []),
      ...(reading.questionTemplate ? ['editorAuthoredQuestionTemplate'] : []),
      ...(blocks.output === null ? [] : ['output']),
      ...(blocks.scopeLimits === null ? [] : ['scopeLimits']),
      ...(reading.platformTools ? ['platformTools'] : []),
    ]));
    requirePolicy(rule['policyResult'] === 'eligible-only' && rule['purpose'] === 'ordinary-production-model-processing');
    requirePolicy(exactStrings(rule['allowedTaskKinds'], reading.taskKinds) && exactStrings(rule['allowedOutboundDataCategories'], reading.policyCategories));
    requirePolicy(sameBlock(rule['authorityOrigin'], blocks.authorityOrigin) && sameBlock(rule['executionMode'], blocks.executionMode) &&
      sameBlock(rule['clarification'], blocks.clarification) &&
      sameBlock(rule['source'], blocks.source) && sameBlock(rule['redaction'], HOUSE_PEOPLE_REDACTION) &&
      sameBlock(rule['transmissions'], blocks.transmissions) && sameBlock(rule['authorizationPreconditions'], blocks.authorizationPreconditions) &&
      sameBlock(rule['providerAccountLimit'], blocks.providerAccountLimit) && sameBlock(rule['capture'], PRODUCTION_CAPTURE) &&
      sameBlock(rule['additionalPrivacyPrompts'], NO_EXTRA_PRIVACY_PROMPTS));
    if (blocks.output !== null) requirePolicy(sameBlock(rule['output'], blocks.output));
    if (blocks.scopeLimits !== null) requirePolicy(sameBlock(rule['scopeLimits'], blocks.scopeLimits));
    // The rule names a role and the routes it may be configured with, not one route: the binding is the editor's.
    requirePolicy(sameBlock(rule['providerBinding'], {
      modelRole: reading.modelRole,
      bindingSource: 'user-configured-role-binding',
      allowedRoutes,
      exactProviderBindingRequired: true,
      fallbackAllowed: false,
      approvedFallbackChainMaximumItems: 0,
      secondModelAllowed: false,
      productionDefaultsChanged: false,
    }));
    const platformTools = verifyPlatformTools(rule, 'ordinary-production', reading.platformTools);
    const localTools = verifyLocalTools(rule, reading.noRetrieval);
    verifySourceTranslation(rule, reading.sourceTranslation);
    verifyHouseReviewPreference(rule, 'ordinary-production', reading.houseReviewPreference);
    verifySeriesKnowledgeExcerpt(rule, 'ordinary-production', reading.seriesKnowledge);
    verifyEditorAuthoredQuestionTemplate(rule, reading.questionTemplate);
    rules.push({ ruleId, reading, allowedRoutes, platformTools, localTools });
  }
  requirePolicy(seen.has(ORDINARY_PRODUCTION_BASELINE_RULE_ID));
  const verified: OrdinaryProductionPolicyReading = {
    crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true, allowedBindings: mainBindings, rules,
    ...(selectedBindingPolicy ? { fastAllowedBindings: fastBindings, connectionTestAllowed: true } : {}),
  };
  if (wave20 === null) return verified;
  // Every value below has passed both the v26 exact checks and the inherited rule checks above.
  const declaredRules = (wave20['decision'] as { providerAllowRules: Array<Record<string, unknown>> }).providerAllowRules;
  return {
    ...verified,
    ...(wave21 === null ? {} : {
      backgroundProcessingEnrollment: structuredClone((wave21['decision'] as { providerAllowRules: Array<Record<string, unknown>> })
        .providerAllowRules.find((rule) => rule['ruleId'] === BACKGROUND_PROCESSING_RULE_ID)!['backgroundProcessingEnrollment']) as NonNullable<OrdinaryProductionPolicyReading['backgroundProcessingEnrollment']>,
      subAgents: structuredClone(wave21['subAgents']) as NonNullable<OrdinaryProductionPolicyReading['subAgents']>,
    }),
    allowedBindings: ORDINARY_PRODUCTION_ALLOWED_BINDINGS,
    fastAllowedBindings: ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS,
    execution: structuredClone(wave20['execution']) as NonNullable<OrdinaryProductionPolicyReading['execution']>,
    transport: structuredClone(wave20['transport']) as NonNullable<OrdinaryProductionPolicyReading['transport']>,
    research: structuredClone(wave20['research']) as NonNullable<OrdinaryProductionPolicyReading['research']>,
    rules: rules.map<OrdinaryProductionPolicyReading['rules'][number]>((entry) => {
      const declared = declaredRules.find((rule) => rule['ruleId'] === entry.ruleId)!;
      const localTools = structuredClone(declared['localTools']) as AdmittedLocalTools;
      const configuredRoutes = [...new Set((entry.reading.modelRole === 'Fast Interaction Role' && entry.reading.taskKinds.includes(MATERIAL_TRANSLATION_KIND)
        ? ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS : ORDINARY_PRODUCTION_ALLOWED_BINDINGS).map((binding) => binding.route))];
      if (entry.ruleId !== 'ordinary-production-review') return { ...entry, localTools, allowedRoutes: configuredRoutes,
        ...(wave21 !== null && declared['transmissions'] !== undefined &&
          (declared['transmissions'] as Record<string, unknown>)['plusOneCrossUnitSynthesisTurn'] === true
          ? { projection: { plusOneCrossUnitSynthesisTurn: true } } : {}),
      };
      return { ...entry, localTools, allowedRoutes: configuredRoutes, projection: {
        taskKinds: [...declared['allowedTaskKinds'] as string[]],
        outboundDataCategories: [...declared['allowedOutboundDataCategories'] as OutboundDataCategoryId[]],
        crossUnitSynthesisAllowed: true,
        ...(wave21 === null ? {} : { plusOneCrossUnitSynthesisTurn: true }),
        plusDeclaredContractRetryAdaptations: true,
        taskKindOverrides: structuredClone(declared['taskKindOverrides']) as NonNullable<AdmittedProviderRule['taskKindOverrides']>,
        editorTaskInstruction: structuredClone(declared['editorTaskInstruction']) as NonNullable<AdmittedProviderRule['editorTaskInstruction']>,
        houseReviewGuidelineClause: structuredClone(declared['houseReviewGuidelineClause']) as NonNullable<AdmittedProviderRule['houseReviewGuidelineClause']>,
      } };
    }).concat(wave21 === null ? [] : [{
      ruleId: GLOBAL_AGENT_RULE_ID, reading: GLOBAL_AGENT_READING,
      allowedRoutes: [...new Set(ORDINARY_PRODUCTION_ALLOWED_BINDINGS.map((binding) => binding.route))],
      platformTools: null, localTools: expectedLocalTools(false),
      projection: { globalAgentDialogue: {
        source: GLOBAL_AGENT_SOURCE, redaction: HOUSE_PEOPLE_REDACTION,
        outboundCategoryRestriction: 'none', outboundDataDisclosureRequired: true,
      } },
    }, {
      ruleId: BACKGROUND_PROCESSING_RULE_ID, reading: BACKGROUND_PROCESSING_READING,
      allowedRoutes: [...new Set(ORDINARY_PRODUCTION_ALLOWED_BINDINGS.map((binding) => binding.route))],
      platformTools: null, localTools: expectedLocalTools(false),
    }]),
  };
}

/**
 * Apply the editor's configured binding to a verified ordinary-production reading: every rule's route, endpoint, model and
 * credential slot are filled from the one binding, which must be exactly one of the bindings the policy allows (and a route the
 * rule names). `null` when it is not, or when the binding is malformed — the caller denies with `binding-not-allowed`.
 */
export function bindOrdinaryProductionRules(reading: OrdinaryProductionPolicyReading, binding: ConfiguredProviderBinding | null, fastBinding: ConfiguredProviderBinding | null = binding): AdmittedProviderRule[] | null {
  for (const [selected, permitted] of [[binding, reading.allowedBindings], [fastBinding, reading.fastAllowedBindings ?? reading.allowedBindings]] as const) {
    if (selected === null) continue;
    if (!isRecord(selected) || !exactKeys(selected, ['route', 'endpoint', 'model', 'credentialSlot', 'credentialReference']) ||
        allowedProductionBindingOf(selected, 'fast-interaction') === null || !permitted.some((candidate) =>
          candidate.route === selected.route && candidate.model === selected.model && candidate.endpoint === selected.endpoint && candidate.credentialSlot === selected.credentialSlot)) return null;
  }
  const admitted: AdmittedProviderRule[] = [];
  for (const { ruleId, reading: kind, allowedRoutes, platformTools, localTools, projection } of reading.rules) {
    const selected = kind.modelRole === 'Fast Interaction Role' ? fastBinding : binding;
    if (selected === null) continue;
    const allowed = kind.modelRole === 'Fast Interaction Role' ? allowedProductionBindingOf(selected, 'fast-interaction') : allowedProductionBindingOf(selected);
    if (allowed === null) return null;
    if (!allowedRoutes.includes(allowed.route)) continue;
    const profile = modelProfileFor(allowed.route as RemoteExecutionRoute, allowed.model);
    if (profile === null || profile.capabilities.answerChannel === 'none') continue;
    // This admission proves buffered, tool-free 来源译文 only. Other contracts keep their existing capability requirements.
    if (allowed.route === 'openai-platform' && (kind.modelRole !== 'Fast Interaction Role' || !kind.taskKinds.includes(MATERIAL_TRANSLATION_KIND))) continue;
    admitted.push({
      ruleId,
      taskKinds: [...kind.taskKinds],
      modelRole: kind.modelRole,
      route: allowed.route,
      endpoint: allowed.endpoint,
      model: allowed.model,
      credentialSlot: allowed.credentialSlot,
      outboundDataCategories: [...kind.outboundDataCategories],
      crossUnitSynthesisAllowed: kind.crossUnitSynthesisAllowed,
      ...(kind.blocks.transmissions['plusDeclaredContractRetryAdaptations'] === true ? { plusDeclaredContractRetryAdaptations: true } : {}),
      materialReferencesAllowed: kind.blocks.source['materialReferencesAllowed'] === true,
      editorialDeliverablesAllowed: kind.blocks.source['editorialDeliverablesAllowed'] === true,
      // The flag verified at reading (v23's review rule alone), projected for its consumer (Issue #64, 7b); absent on every other rule.
      ...(kind.blocks.source['seriesKnowledgeAllowed'] === true ? { seriesKnowledgeAllowed: true } : {}),
      clarificationQuestionAllowed: kind.clarification,
      clarificationTimeoutHours: kind.clarification ? CLARIFICATION_ASKS.timeoutHours : null,
      backgroundOrigin: kind.background,
      matchingActiveDefaultExecutionRuleAllowed: kind.blocks.authorityOrigin['matchingActiveDefaultExecutionRuleAllowed'] === true,
      webSearchToolAllowed: platformTools !== null,
      platformTools,
      localTools: structuredClone(localTools),
      sourceTranslationAllowed: kind.sourceTranslation,
      ...(projection === undefined ? {} : structuredClone(projection)),
    });
  }
  if (fastBinding !== null && reading.connectionTestAllowed === true) {
    const profile = modelProfileFor(fastBinding.route as RemoteExecutionRoute, fastBinding.model);
    if (profile !== null && profile.capabilities.answerChannel !== 'none') admitted.push({
      ruleId: CONNECTION_TEST_POLICY.ruleId, taskKinds: [CONNECTION_TEST_KIND], modelRole: 'Fast Interaction Role',
      route: fastBinding.route, endpoint: fastBinding.endpoint, model: fastBinding.model, credentialSlot: fastBinding.credentialSlot,
      outboundDataCategories: ['public-or-synthetic'], crossUnitSynthesisAllowed: false, materialReferencesAllowed: false,
      editorialDeliverablesAllowed: false, clarificationQuestionAllowed: false, clarificationTimeoutHours: null,
      backgroundOrigin: false, matchingActiveDefaultExecutionRuleAllowed: false, webSearchToolAllowed: false,
      platformTools: null, localTools: { targetedRetrieval: { allowed: false, source: 'authorized-pinned-sources-only', callsPerUnit: LOCAL_TOOL_CALLS_PER_UNIT, candidatesPerCall: LOCAL_TOOL_CANDIDATES_PER_CALL, exactFetchRequiredBeforeCitation: true, scope: 'no-egress' }, breaker: { roundTrips: LOCAL_TOOL_ROUND_TRIP_BREAKER, end: LOCAL_TOOL_BREAKER_END } }, sourceTranslationAllowed: false,
    });
  }
  return admitted;
}

/**
 * Resolve the build-embedded source-checkout selection for the requested scope. Only the launch-selectable scopes can
 * verify; every invalid state, including an unselectable or unknown scope, remains the zero-transmission denial.
 *
 * `configuredBinding` is read only under `ordinary-production` (Provider Processing v17) and is ignored under every other
 * scope. With `null` the policy still verifies but no rule is admitted: the projection reports `bindingState: 'setup-required'`.
 * With a binding that is exactly one the policy allows, every admitted rule's route, endpoint, model and credential slot are
 * filled from it; any other binding is the denial `binding-not-allowed`.
 */
export async function resolveSourceCheckoutLaunchPolicy(
  codeRoot: string,
  requestedScope: TrustedOperationalScope = 'development-ci',
  configuredBinding: ConfiguredProviderBinding | null = null,
  configuredFastBinding: ConfiguredProviderBinding | null = configuredBinding,
): Promise<LaunchPolicyProjection> {
  const verification = verifyLaunchPolicyInputs(requestedScope, configuredBinding, configuredFastBinding);
  let step = verification.next();
  while (!step.done) {
    try { step = verification.next(await readBuiltFile(codeRoot, step.value)); }
    catch (error) { step = verification.throw(error); }
  }
  return step.value;
}

/** Run admission reads the same complete verified inputs synchronously, without caching a prior projection. */
export function resolveSourceCheckoutLaunchPolicySync(
  codeRoot: string,
  requestedScope: TrustedOperationalScope = 'development-ci',
  configuredBinding: ConfiguredProviderBinding | null = null,
  configuredFastBinding: ConfiguredProviderBinding | null = configuredBinding,
): LaunchPolicyProjection {
  const verification = verifyLaunchPolicyInputs(requestedScope, configuredBinding, configuredFastBinding);
  let step = verification.next();
  while (!step.done) {
    try { step = verification.next(readFileSync(policyFilePath(codeRoot, step.value))); }
    catch (error) { step = verification.throw(error); }
  }
  return step.value;
}

/** Exact predecessor interpretation for an already bound v27/19 Run. This is never a launch selector or a current identity. */
export function readRetainedBoundAnalysisPolicySync(codeRoot: string, pin: import('../shared/protocol.js').ResultSetPolicyPin,
  binding: ConfiguredProviderBinding): LaunchPolicyProjection | null {
  if (pin.operationalScope !== 'ordinary-production' || pin.providerProcessingVersion !== 'v27' || pin.activePolicySetVersion !== 'v19' ||
      pin.liveTransmissions !== 'bounded-by-run') return null;
  try {
    const read = (path: string, sha256: string): Record<string, unknown> => {
      const bytes = readFileSync(policyFilePath(codeRoot, path)); requirePolicy(digest(bytes) === sha256); return parseJson(bytes);
    };
    const active = read('docs/policies/active-policy-set.v19.json', '5b551888903b629c700fea7d358e57e1474b1f7984fe73f6605cd85619726f3e');
    const policy = read('docs/policies/provider-processing-policy.v27.json', '8d0eaedb28454c9f923501991e0b4130d7ed5f9b267905cd30d3f7a434db1a12');
    read(EXTERNAL_PIN.canonicalPath, EXTERNAL_PIN.sha256);
    requirePolicy(active['version'] === 'v19' && policy['version'] === 'v27');
    const reading = verifyOrdinaryProductionPolicy(policy);
    const rules = bindOrdinaryProductionRules(reading, binding, binding);
    requirePolicy(rules !== null && rules.length > 0);
    return { integrityState: 'verified', denialReason: null, operationalScope: 'ordinary-production', activePolicySetVersion: 'v19',
      providerProcessing: { version: 'v27', decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run', liveTransmissionAllowed: true,
        crossUnitReductionAllowed: reading.crossUnitReductionAllowed, assuranceSamplingAllowed: reading.assuranceSamplingAllowed,
        runReportReflectionAllowed: reading.runReportReflectionAllowed, admittedRules: rules, bindingState: 'configured',
        ...(reading.execution === undefined ? {} : { execution: reading.execution }), ...(reading.transport === undefined ? {} : { transport: reading.transport }),
        ...(reading.research === undefined ? {} : { research: reading.research }), ...(reading.subAgents === undefined ? {} : { subAgents: reading.subAgents }),
        ...(reading.backgroundProcessingEnrollment === undefined ? {} : { backgroundProcessingEnrollment: reading.backgroundProcessingEnrollment }),
        label: '本机生产：实时传输受运行边界约束' },
      externalExport: { version: 'v2', policyEligibilityIsEffectApproval: false, currentExportEffectAvailable: true,
        label: '对外导出策略 v2 已校验：只导出到本机所选位置，每个文件单独批准' }, publicReleasePermission: { present: false, label: '公开发布许可：不存在' } };
  } catch { return null; }
}

/** One verification/projection body reads the complete pinned set and schemas for both sync and async callers. */
function* verifyLaunchPolicyInputs(
  requestedScope: TrustedOperationalScope,
  configuredBinding: ConfiguredProviderBinding | null,
  configuredFastBinding: ConfiguredProviderBinding | null,
): Generator<string, LaunchPolicyProjection, Buffer> {
  try {
    const carrier = parseJson(yield CARRIER_PATH);
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

    const activeSetBytes = yield ACTIVE_SET_PATH;
    requirePolicy(digest(activeSetBytes) === ACTIVE_SET_SHA256);
    for (const [path, sha256] of [
      ['docs/policies/active-policy-set.v22.schema.json', 'ae6001084568789658fe4916b7c6b401810ab407b11fbc4e03cd2e152d67a520'],
      ['docs/policies/provider-processing-policy.v31.schema.json', '03f53cd094efb913b3014896a3de386f244721d1fde6f9de990036d5f6e8a8ae'],
    ] as const) requirePolicy(digest(yield path) === sha256);
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
    const selectedProviderBytes = yield selectedProviderPin.canonicalPath;
    requirePolicy(digest(selectedProviderBytes) === selectedProviderPin.sha256);
    const selectedPolicy = parseJson(selectedProviderBytes);
    verifyProviderPolicy(selectedPolicy, selectedProviderPin.version, selectedProviderPin.canonicalPath);
    // Verify the complete selected set, including the retained local member; a hash string alone supplies no identity.
    for (const scope of Object.keys(PROVIDER_PINS) as Array<keyof typeof PROVIDER_PINS>) {
      if (scope === requestedScope) continue;
      const pin = PROVIDER_PINS[scope];
      const bytes = yield pin.canonicalPath;
      requirePolicy(digest(bytes) === pin.sha256);
      const member = parseJson(bytes);
      verifyProviderPolicy(member, pin.version, pin.canonicalPath);
      if (scope === 'ordinary-production') verifyOrdinaryProductionPolicy(member);
      if (scope === 'development-ci') verifyDevelopmentCiPolicy(member);
    }

    const externalPin = activePolicies['external-export-policy'];
    requirePolicy(
      exactKeys(externalPin, ['policyId', 'policyType', 'version', 'canonicalPath', 'sha256']) &&
        externalPin['policyId'] === 'external-export-policy' &&
        externalPin['policyType'] === 'external-export' &&
        externalPin['version'] === EXTERNAL_PIN.version &&
        externalPin['canonicalPath'] === EXTERNAL_PIN.canonicalPath &&
        externalPin['sha256'] === EXTERNAL_PIN.sha256,
    );
    const externalBytes = yield EXTERNAL_PIN.canonicalPath;
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
    const selectedPolicyIdentity = selectedPolicyIdentityOf({
      providerProcessingVersion: selectedProviderPin.version, providerProcessingSha256: selectedProviderPin.sha256,
      activePolicySetVersion: ACTIVE_SET_VERSION, activePolicySetSha256: ACTIVE_SET_SHA256,
    });
    requirePolicy(selectedPolicyIdentity !== null);
    if (requestedScope === 'developer-live') {
      const reading = verifyDeveloperLivePolicy(selectedPolicy);
      return {
        integrityState: 'verified',
        denialReason: null,
        operationalScope: 'developer-live',
        activePolicySetVersion: ACTIVE_SET_VERSION,
        selectedPolicyIdentity,
        providerProcessing: {
          version: DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION,
          decision: 'eligible-only',
          authorizedLiveTransmissionCount: 'bounded-by-run',
          liveTransmissionAllowed: true,
          crossUnitReductionAllowed: reading.crossUnitReductionAllowed,
          assuranceSamplingAllowed: reading.assuranceSamplingAllowed,
          runReportReflectionAllowed: reading.runReportReflectionAllowed,
          admittedRules: reading.admittedRules,
          label: '开发者实时：实时传输受运行边界约束',
        },
        externalExport,
        publicReleasePermission,
      };
    }
    if (requestedScope === 'ordinary-production') {
      const reading = verifyOrdinaryProductionPolicy(selectedPolicy);
      const admittedRules = bindOrdinaryProductionRules(reading, configuredBinding, configuredFastBinding);
      if (admittedRules === null) return deny('binding-not-allowed');
      const configured = admittedRules.length > 0;
      return {
        integrityState: 'verified',
        denialReason: null,
        operationalScope: 'ordinary-production',
        activePolicySetVersion: ACTIVE_SET_VERSION,
        selectedPolicyIdentity,
        providerProcessing: {
          version: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION,
          ...(reading.execution === undefined ? {} : { execution: reading.execution }),
          ...(reading.transport === undefined ? {} : { transport: reading.transport }),
          ...(reading.research === undefined ? {} : { research: reading.research }),
          ...(reading.backgroundProcessingEnrollment === undefined ? {} : { backgroundProcessingEnrollment: reading.backgroundProcessingEnrollment }),
          ...(reading.subAgents === undefined ? {} : { subAgents: reading.subAgents }),
          decision: 'eligible-only',
          authorizedLiveTransmissionCount: 'bounded-by-run',
          // Nothing can transmit until the editor's own model service is configured: no rule is admitted before then.
          liveTransmissionAllowed: configured,
          crossUnitReductionAllowed: reading.crossUnitReductionAllowed,
          assuranceSamplingAllowed: reading.assuranceSamplingAllowed,
          runReportReflectionAllowed: reading.runReportReflectionAllowed,
          admittedRules,
          bindingState: configured ? 'configured' : 'setup-required',
          label: configured ? '本机生产：实时传输受运行边界约束' : '本机生产：需先设置模型服务，当前不会传输',
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
      selectedPolicyIdentity,
      providerProcessing: {
        version: 'v1',
        decision: 'deny',
        authorizedLiveTransmissionCount: 0,
        liveTransmissionAllowed: false,
        // v1 authorizes zero live transmissions; replay stays with the existing fixture owner.
        crossUnitReductionAllowed: false,
        assuranceSamplingAllowed: false,
        runReportReflectionAllowed: false,
        // Local fixture declarations are not remote Provider allow rules.
        admittedRules: [],
        label: '开发与持续集成：零次实时传输',
      },
      externalExport,
      publicReleasePermission,
    };
  } catch {
    return deny('launch-policy-integrity-denied');
  }
}
