import { isAbsolute, relative, resolve, sep } from 'node:path';
import defaults from '../../config/runtime-execution-defaults.json' with { type: 'json' };
import { MODEL_SERVICE_CHANNELS, MODEL_SERVICE_ROUTES, MODEL_SERVICE_ROUTE_BINDINGS, modelServiceRuntimeBinding, isTrustedOperationalScope, type ModelServiceChannelProjection, type ModelServiceModelDisposition, type ModelServiceRouteId, type AdmittedPlatformTools, type AdmittedProviderRule, type DeveloperLiveCeiling, type OutboundDataCategoryId, type DevelopmentValidationIntent, type LaunchPolicyProjection, type TrustedLaunchForm, type TrustedOperationalScope, type SearchConnectionTestPolicy } from '../shared/protocol.js';
import { CREDENTIAL_REFERENCE_PATTERN, DEVELOPMENT_CREDENTIAL_REFERENCES } from '../shared/protected-secret-identity.js';
import { CONFIGURED_PROVIDER_LABELS, CONFIGURED_RUNTIME_MODEL_TABLE } from '../shared/provider-configuration.generated.js';
import { modelDisposition, providerPreflight, type ProviderPreflightRefusal } from './provider/family-dispositions.js';
import { modelProfileFor, validModelId, type ProviderModelProfile } from './provider/model-profile.js';
import { GENERATED_MODEL_PROFILES } from './provider/provider-profiles.generated.js';
import type { RemoteExecutionRoute } from './provider/egress-gate.js';
export { ORIGINAL_FIELDS_ACTIVE_SET_SHA256, ORIGINAL_FIELDS_POLICY_SHA256, LOCAL_FIXTURE_POLICY_SHA256, LOCAL_FIXTURE_MANIFEST_SHA256,
  isSupportedProviderProcessingVersion, selectedPolicyIdentityOf, localFixtureProfileOf, LOCAL_FIXTURE_RULE_IDS } from '../shared/protocol.js';

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
 * Configured protocol channels, default first. The service arms their declared hosts; any valid model ID uses its
 * channel encoder. These records do not select or verify a policy.
 */
export const ORDINARY_PRODUCTION_ALLOWED_BINDINGS = CONFIGURED_RUNTIME_MODEL_TABLE.policyBaseline.main;
export type OrdinaryProductionAllowedBinding = Omit<(typeof ORDINARY_PRODUCTION_ALLOWED_BINDINGS)[number], 'model'> & { readonly model: string };
export const ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS = CONFIGURED_RUNTIME_MODEL_TABLE.policyBaseline.fast;
export type OrdinaryProductionFastAllowedBinding = Omit<(typeof ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS)[number], 'model'> & { readonly model: string };

/**
 * The endpoint hosts the ordinary-production service arms before the network denial (Issue #1274): every admitted Main and
 * Fast binding's host once, in binding order, with its port. v32 binds several models per channel, and `armHostAllowanceSet`
 * fails closed on a duplicated host.
 */
export function ordinaryProductionHostAllowances(): ReadonlyArray<{ host: string; port: number }> {
  const targets = new Map<string, { host: string; port: number }>();
  for (const { endpoint } of [...ORDINARY_PRODUCTION_ALLOWED_BINDINGS, ...ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS]) {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    if (!targets.has(host)) targets.set(host, { host, port: url.port === '' ? 443 : Number(url.port) });
  }
  return [...targets.values()];
}

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
  if (binding === null || !validModelId(binding.model) || !CREDENTIAL_REFERENCE_PATTERN.test(binding.credentialReference) ||
      DEVELOPMENT_CREDENTIAL_REFERENCES.has(binding.credentialReference.toLowerCase())) return null;
  const allowedBindings = role === 'fast-interaction' ? ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS : ORDINARY_PRODUCTION_ALLOWED_BINDINGS;
  const channel = allowedBindings.find((allowed) => allowed.route === binding.route && allowed.endpoint === binding.endpoint &&
    allowed.credentialSlot === binding.credentialSlot);
  return channel === undefined || modelProfileFor(channel.route, binding.model) === null ? null : { ...channel, model: binding.model };
}

/** The selected channel encoder must support a buffered text request. */
export function productionBindingRefusal(model: ProviderModelProfile, role: 'main' | 'fast'): ProviderPreflightRefusal | null {
  return providerPreflight(model, { stream: false, functionTools: false });
}

/** Catalogue choices inherit protocol capabilities and are eligible on admitted channels, independent of model evidence. */
export function modelServiceChannels(catalogue?: (route: ModelServiceRouteId) => readonly import('../shared/protocol.js').DiscoveredModel[]): ModelServiceChannelProjection[] {
  const disposition = (model: ProviderModelProfile, role: 'main' | 'fast'): ModelServiceModelDisposition => {
    const refused = productionBindingRefusal(model, role);
    if (refused !== null) return refused.reason as Exclude<ModelServiceModelDisposition, 'eligible' | 'channel-not-admitted-by-selected-policy'>;
    return 'eligible';
  };
  return MODEL_SERVICE_CHANNELS.map((channelId) => {
    const route = MODEL_SERVICE_ROUTES.includes(channelId as ModelServiceRouteId) ? channelId as ModelServiceRouteId : null;
    const entries = catalogue?.(channelId) ?? GENERATED_MODEL_PROFILES
      .filter((model) => model.route === channelId || model.route.startsWith(`${channelId}-`))
      .map((model) => ({ modelId: model.model, modelLabel: model.displayName }));
    return {
      channelId,
      channelLabel: route === null ? CONFIGURED_PROVIDER_LABELS[channelId] : MODEL_SERVICE_ROUTE_BINDINGS[route].providerLabel,
      route,
      models: entries.map((entry) => {
        const runtime = modelServiceRuntimeBinding(channelId, entry.modelId, 'main');
        const model = modelProfileFor(runtime?.route ?? channelId, entry.modelId)!;
        return {
          modelId: model.model,
          modelLabel: entry.modelLabel,
          family: model.capabilities.requestShape,
          capabilities: { text: modelDisposition(model, 'text'), stream: modelDisposition(model, 'stream'), functionTools: modelDisposition(model, 'functionTools') },
          main: disposition(model, 'main'),
          fast: disposition(model, 'fast'),
        };
      }).sort((a, b) => Number(b.modelId === MODEL_SERVICE_ROUTE_BINDINGS[channelId].modelId) - Number(a.modelId === MODEL_SERVICE_ROUTE_BINDINGS[channelId].modelId)),
    };
  });
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

export const MATERIAL_TRANSLATION_KIND = 'material-translation';
export const HOUSE_REVIEW_PREFERENCE_CATEGORY = 'house-review-preference-excerpt' as const satisfies OutboundDataCategoryId;
/** The most lines, and the most graphemes in total, one request's house review-preference block may carry. The bounds are this build's constants. */
export const HOUSE_REVIEW_PREFERENCE_MAX_LINES = 15;
export const HOUSE_REVIEW_PREFERENCE_MAX_GRAPHEMES = 1_200;
export const EDITOR_AUTHORED_QUESTION_TEMPLATE_CATEGORY = 'editor-authored-question-template' as const satisfies OutboundDataCategoryId;
/** The most graphemes one editor-authored question template may carry. The bound is this build's constant. */
export const EDITOR_AUTHORED_QUESTION_TEMPLATE_MAX_GRAPHEMES = 400;
/** The outbound data category of Series Knowledge excerpts (Provider Processing v22 and v23, Issue #920): the review rule alone names it. */
export const SERIES_KNOWLEDGE_EXCERPT_CATEGORY = 'series-knowledge-excerpt' as const satisfies OutboundDataCategoryId;
/** The bounds of one request's Series Knowledge excerpts: the clause bounds 书系一致性 already keeps (`review/series-consistency.ts`). */
export const SERIES_KNOWLEDGE_EXCERPT_MAX_CLAUSES = 40;
export const SERIES_KNOWLEDGE_EXCERPT_MAX_GRAPHEMES_PER_CLAUSE = 300;
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

export const BACKGROUND_ANALYSIS_RULE_ID = 'enrolled-background-manuscript-analysis-processing';
export interface ConfiguredProviderBinding {
  readonly route: string;
  readonly endpoint: string;
  readonly model: string;
  readonly credentialSlot: string;
  readonly credentialReference: string;
}

export interface SearchFallbackTerms {
  /** At most one fallback item, chosen among these measured and shipped backends, never the primary itself. */
  readonly maximumChainItems: 1;
  readonly eligibleBackendIds: readonly string[];
  readonly frozenInPlan: readonly ['backendId', 'host', 'configurationDigest', 'credentialReference'];
  readonly ledgerAttribution: 'fallback-from';
  /** Primary-channel retries only: at most one, for these classes; an accepted/possibly billed submission is never retried. */
  readonly maximumResendsPerFailedSubmission: 1;
  readonly resendableFailureClasses: readonly ['transport-failure-before-any-response-byte', 'http-5xx', 'http-429'];
  readonly http429RetryAfterHonoured: true;
  /** The per-claim budget of distinct canonical queries; a resend repeats the same query and is not counted again. */
  readonly maximumDistinctCanonicalQuerySubmissions: number;
}



/** Compatibility version fields describe the existing record format, never a selected policy. */
export const ACTIVE_SET_VERSION = 'no-policy-lock' as const;
export const DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION = 'v24' as const;
export const ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION = 'v35' as const;

export function searchFallbackTermsOf(projection: LaunchPolicyProjection | null | undefined): SearchFallbackTerms | null {
  return projection?.operationalScope === 'ordinary-production' ? structuredClone(defaults.searchFallback) as unknown as SearchFallbackTerms : null;
}

function recipes(scope: TrustedOperationalScope, binding: ConfiguredProviderBinding | null,
  fastBinding: ConfiguredProviderBinding | null): AdmittedProviderRule[] {
  const templates = scope === 'developer-live' ? defaults.developer : defaults.ordinary;
  return templates.flatMap((template) => {
    const selected = scope === 'developer-live' ? DEVELOPER_LIVE_POLICY_BINDING
      : template.modelRole === 'Fast Interaction Role' ? fastBinding : binding;
    if (selected === null) return [];
    const localTools = typeof template.localTools === 'number' ? defaults.localTools[template.localTools] : template.localTools;
    const platformTools = typeof template.platformTools === 'number' ? defaults.platformTools[template.platformTools] : template.platformTools;
    return [{ ...structuredClone(template), route: selected.route, endpoint: selected.endpoint, model: selected.model,
      credentialSlot: selected.credentialSlot, localTools: structuredClone(localTools), platformTools: structuredClone(platformTools) } as unknown as AdmittedProviderRule];
  });
}

/** Scope selects the transport boundary. No document, fingerprint or policy selection participates. */
export function resolveSourceCheckoutLaunchPolicySync(_codeRoot: string,
  requestedScope: TrustedOperationalScope = 'development-ci', configuredBinding: ConfiguredProviderBinding | null = null,
  configuredFastBinding: ConfiguredProviderBinding | null = configuredBinding): LaunchPolicyProjection {
  if (!isTrustedOperationalScope(requestedScope)) return deny('launch-scope-not-selectable');
  if (requestedScope === 'ordinary-production' && [configuredBinding, configuredFastBinding].some((binding) =>
    binding !== null && allowedProductionBindingOf(binding, 'fast-interaction') === null)) return deny('binding-not-allowed');
  const ci = requestedScope === 'development-ci';
  const ordinary = requestedScope === 'ordinary-production';
  const admittedRules = ci ? [] : recipes(requestedScope, configuredBinding, configuredFastBinding);
  const configured = !ci && admittedRules.length > 0;
  return {
    integrityState: 'verified', denialReason: null, operationalScope: requestedScope, activePolicySetVersion: ACTIVE_SET_VERSION,
    selectedPolicyIdentity: { providerProcessingVersion: ci ? 'v1' : ordinary ? 'v35' : 'v24',
      providerProcessingSha256: '0'.repeat(64), activePolicySetVersion: ACTIVE_SET_VERSION, activePolicySetSha256: '0'.repeat(64) },
    providerProcessing: {
      version: ci ? 'v1' : ordinary ? 'v35' : 'v24', decision: ci ? 'deny' : 'eligible-only',
      authorizedLiveTransmissionCount: ci ? 0 : 'bounded-by-run', liveTransmissionAllowed: configured,
      crossUnitReductionAllowed: !ci, assuranceSamplingAllowed: !ci, runReportReflectionAllowed: !ci, admittedRules,
      ...(ordinary ? { bindingState: configured ? 'configured' : 'setup-required',
        execution: structuredClone(defaults.execution), transport: structuredClone(defaults.transport), research: structuredClone(defaults.research),
        searchConnectionTest: structuredClone(defaults.searchConnectionTest) as SearchConnectionTestPolicy,
        settingsSearchTools: structuredClone(defaults.platformTools[0]) as unknown as AdmittedPlatformTools,
        subAgents: structuredClone(defaults.subAgents), backgroundProcessingEnrollment: structuredClone(defaults.backgroundProcessingEnrollment) } : {}),
      label: ci ? '开发与持续集成：零次实时传输' : ordinary
        ? configured ? '本机生产：实时传输受运行边界约束' : '本机生产：需先设置模型服务，当前不会传输'
        : '开发者实时：实时传输受运行边界约束',
    },
    // Availability is a product capability. The export owners still require preparation, approval and receipts.
    externalExport: { version: 'v2', policyEligibilityIsEffectApproval: false, currentExportEffectAvailable: true,
      label: '对外导出：只导出到本机所选位置，每个文件单独批准' },
    publicReleasePermission: { present: false, label: '公开发布许可：不存在' },
  } as LaunchPolicyProjection;
}

export async function resolveSourceCheckoutLaunchPolicy(codeRoot: string,
  scope: TrustedOperationalScope = 'development-ci', binding: ConfiguredProviderBinding | null = null,
  fastBinding: ConfiguredProviderBinding | null = binding): Promise<LaunchPolicyProjection> {
  return resolveSourceCheckoutLaunchPolicySync(codeRoot, scope, binding, fastBinding);
}

/** Historical records keep their frozen identity; resumption no longer reads or verifies policy documents. */
export function readRetainedBoundAnalysisPolicySync(codeRoot: string, pin: import('../shared/protocol.js').ResultSetPolicyPin,
  binding: ConfiguredProviderBinding): LaunchPolicyProjection | null {
  if (pin.operationalScope !== 'ordinary-production') return null;
  const projection = resolveSourceCheckoutLaunchPolicySync(codeRoot, 'ordinary-production', binding);
  delete projection.selectedPolicyIdentity;
  projection.activePolicySetVersion = pin.activePolicySetVersion;
  projection.providerProcessing.version = pin.providerProcessingVersion;
  return projection;
}
