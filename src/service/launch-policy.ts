import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { LAUNCH_SELECTABLE_SCOPES, isTrustedOperationalScope, type AdmittedProviderRule, type DeveloperLiveCeiling, type OutboundDataCategoryId, type DevelopmentValidationIntent, type LaunchPolicyProjection, type TrustedLaunchForm, type TrustedOperationalScope } from '../shared/protocol.js';
import { CREDENTIAL_REFERENCE_PATTERN, DEVELOPMENT_CREDENTIAL_REFERENCES } from '../shared/protected-secret-identity.js';

/**
 * The source-checkout launch authority (ADR 0046, ADR 0065): the build-embedded carrier pins active
 * policy set v11, the sole active set for all four Provider Processing scopes, and names the three
 * scopes the built entry may bind from its launch form. `development-ci` is the default and binds
 * Provider Processing v1 (zero live transmissions); `developer-live` is bound only by the launch
 * argument `--trusted-operational-scope developer-live` on a developer host and binds the immutable
 * Provider Processing v14; `ordinary-production` is bound only by `--trusted-operational-scope ordinary-production`
 * and binds v15, whose rules are filled from the editor's own configured provider binding. `fixture-recording`
 * is pinned by the active set but is not selectable from the source checkout. No environment variable or product
 * setting selects a scope; every invalid state resolves to the zero-transmission denial.
 */
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const CARRIER_VERSION = 2;
export const ACTIVE_SET_VERSION = 'v11' as const;
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v11.json';
const ACTIVE_SET_SHA256 = 'fba12d9b8da7b826b620ac33c0b34eadd92da86d6da88f610e480af9aee5328c';
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
    version: 'v15',
    canonicalPath: 'docs/policies/provider-processing-policy.v15.json',
    sha256: '1f398f923d57a442fe6c410b5831c25f45c6983973ccfcf619472db8a8666b46',
  },
  'developer-live': {
    version: 'v14',
    canonicalPath: 'docs/policies/provider-processing-policy.v14.json',
    sha256: '98ec1f93f26e896d1a6a37b3829eacffb7deb9b52f8966252aa3f7115717bb6d',
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
 * The exact developer-live binding every rule of Provider Processing v14 declares, and the one rule v9 declared; the resolver
 * verifies the policy bytes say the same. `ruleId` is the baseline analysis rule, whose reading the projection's suboperation
 * flags come from.
 */
export const DEVELOPER_LIVE_POLICY_BINDING = {
  ruleId: 'developer-live-public-samplebook-analysis',
  launchArgument: '--trusted-operational-scope developer-live',
  route: 'opencode-go',
  endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
  model: 'deepseek-v4.1-flash',
  credentialSlot: 'opencode-go',
  defaultRunBudgetCeilingTokensPerFrozenUnit: 30_000,
  providerAccountLimitClassification: 'quota-exhausted',
} as const;

/** The sibling directory of the checkout that holds the Provider Result Cache when no root is named. */
export const DEFAULT_PROVIDER_CACHE_DIRECTORY = 'ai7-harness-provider-cache';

/**
 * The two bindings an ordinary-production Model Role may be configured to (Issue #811, Owner decision 23 of 2026-10-13): OpenCode
 * Go DeepSeek V4.1 Flash, the default, and DeepSeek 开放平台（官方） V4.1 Flash, an independent choice — exactly v13's
 * `allowedBindings`, which `tests/unit/ordinary-production-launch.test.ts` pins against the bytes. The store lists these routes,
 * the service arms their hosts, and the resolver checks a configured binding against the policy itself. Never a fallback chain.
 */
export const ORDINARY_PRODUCTION_ALLOWED_BINDINGS = [
  { route: 'opencode-go', endpoint: 'https://opencode.ai/zen/go/v1/chat/completions', model: 'deepseek-v4.1-flash', credentialSlot: 'opencode-go' },
  { route: 'deepseek-open-platform', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', credentialSlot: 'deepseek-api-key' },
] as const;
export type OrdinaryProductionAllowedBinding = (typeof ORDINARY_PRODUCTION_ALLOWED_BINDINGS)[number];

/**
 * The allowed binding a configured one names exactly, on a well-formed production Credential Reference (Issue #811); `null` for any
 * other binding and for a reference a provider document fixes for development, which a production connection never holds.
 */
export function allowedProductionBindingOf(binding: ConfiguredProviderBinding | null): OrdinaryProductionAllowedBinding | null {
  if (binding === null || !CREDENTIAL_REFERENCE_PATTERN.test(binding.credentialReference) ||
      DEVELOPMENT_CREDENTIAL_REFERENCES.has(binding.credentialReference.toLowerCase())) return null;
  return ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((allowed) => allowed.route === binding.route && allowed.endpoint === binding.endpoint &&
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
function sourceFlag(rule: Record<string, unknown>, key: 'materialReferencesAllowed' | 'editorialDeliverablesAllowed'): boolean {
  const source = rule['source'];
  return isRecord(source) && source[key] === true;
}

function exactStrings(value: unknown, expected: readonly string[]): value is string[] {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

/**
 * What every developer-live allow rule shares, whatever it admits: eligibility only, the developer host and no hosted, CI,
 * scheduled or background execution, admitted sample sources only, the house-people redaction rule of ADR 0079 §4.4, no web
 * tool, the protected local capture, and no extra privacy prompt. Only the enrolled-background rule (`background`) is scheduled and
 * background; every other rule states both `false`.
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
  // No web-search allowance (ADR 0079 §4.2, §6): a document that enabled it would be one this launch cannot read.
  const transmissions = rule['transmissions'];
  requirePolicy(isRecord(transmissions) && transmissions['webSearchToolAllowed'] === false &&
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

/** The rule id of the enrolled background analysis rule, the same in Provider Processing v14 and v15 (the one rule with a background origin). */
export const BACKGROUND_ANALYSIS_RULE_ID = 'enrolled-background-manuscript-analysis-processing';
/** A Run-based rule's model-initiated clarification (v14 and v15): one question per unit, the unit waits, an unanswered question times out at 24 hours. */
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

const DEVELOPER_LIVE_RULES: Readonly<Record<string, DeveloperLiveRuleReading>> = {
  // Baseline manuscript analysis, unchanged since v9, including its three ADR 0066 suboperations.
  [DEVELOPER_LIVE_POLICY_BINDING.ruleId]: {
    modelRole: 'Main Editorial Role',
    taskKinds: ['baseline-manuscript-analysis'],
    outboundDataCategories: ['public-or-synthetic'],
    crossUnitSynthesisAllowed: false,
    clarification: true,
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
  // The non-web review categories, cross-deliverable consistency included: planned Runs like the baseline, without a
  // cross-unit reduction, over frozen Material References and the Book's editorial deliverables, never Series Knowledge. The rule
  // id keeps its v11 name (the policy's rule ids are stable across versions) though the rule is no longer reference-free.
  'developer-live-public-samplebook-reference-free-review': {
    modelRole: 'Main Editorial Role',
    taskKinds: ['editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression', 'editorial-review/cross-deliverable-consistency'],
    outboundDataCategories: ['public-or-synthetic', 'frozen-material-reference-excerpt', 'editorial-deliverable-excerpt'],
    crossUnitSynthesisAllowed: false,
    clarification: true,
    verify: (rule) => {
      // Since v14 the review kind also admits its matching active Default Execution Rule (审阅 快速开始), as writing does.
      verifyPlannedRunOrigin(rule, true, true);
      const source = rule['source'] as Record<string, unknown>;
      requirePolicy(source['materialReferencesAllowed'] === true && source['seriesKnowledgeAllowed'] === false &&
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
    outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt'],
    crossUnitSynthesisAllowed: true,
    clarification: true,
    verify: (rule) => verifySynthesisRule(rule, true),
  },
  // The three implemented evaluation contracts (S81): AI7 初评 scores, 审稿意见 and 按我的评分重写评语, non-web, with frozen
  // Material Reference excerpts since v12.
  'developer-live-public-samplebook-evaluation': {
    modelRole: 'Main Editorial Role',
    taskKinds: ['evaluation', 'readers-report', 'evaluation-rewrite'],
    outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt'],
    crossUnitSynthesisAllowed: true,
    clarification: true,
    verify: verifySynthesisRule,
  },
  // Each Fast kind has its own rule and excerpt category (Issue #841 revision 5); outputs remain Suggestions only.
  'developer-live-public-samplebook-editorial-polish': {
    modelRole: 'Fast Interaction Role',
    taskKinds: ['editorial-polish'],
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
    clarification: false,
    verify: (rule) => verifySuggestionRule(rule, 'editorSelectedPassageOnly'),
  },
  'developer-live-public-samplebook-conflict-regenerate': {
    modelRole: 'Fast Interaction Role',
    taskKinds: ['conflict-regenerate'],
    outboundDataCategories: ['manuscript-conflict-region-excerpt'],
    crossUnitSynthesisAllowed: false,
    clarification: false,
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
    verify: verifyBackgroundRule,
  },
};

/**
 * Provider Processing v14 (and v12, v11, v10, v9 before it): default deny with developer-live eligible-only allow rules, each one this
 * launch can read and each bound exactly to the one Go route. All eight rules of v14 must be present. The baseline analysis rule must be among them; its three
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
      materialReferencesAllowed: sourceFlag(rule, 'materialReferencesAllowed'),
      editorialDeliverablesAllowed: sourceFlag(rule, 'editorialDeliverablesAllowed'),
      clarificationQuestionAllowed: reading.clarification,
      clarificationTimeoutHours: reading.clarification ? CLARIFICATION_ASKS.timeoutHours : null,
      backgroundOrigin: reading.background === true,
      matchingActiveDefaultExecutionRuleAllowed: (rule['authorityOrigin'] as Record<string, unknown>)['matchingActiveDefaultExecutionRuleAllowed'] === true,
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
 * The editor's own model-service binding a launch supplies to `ordinary-production` (Provider Processing v15): one route,
 * endpoint, model and credential slot, with the opaque Credential Broker reference of the editor's own credential. One binding
 * per instance serves both bound roles (the Main Editorial and the Fast Interaction Role). The resolver only checks it against
 * the policy's allowed bindings and copies the four routing facts into every admitted rule; the credential reference never
 * enters the projection, and no value here selects or configures a provider.
 */
export interface ConfiguredProviderBinding {
  readonly route: string;
  readonly endpoint: string;
  readonly model: string;
  readonly credentialSlot: string;
  readonly credentialReference: string;
}

/** One binding Provider Processing v15 (and v13) allows a user-configurable role: the routing facts, read from the pinned bytes. */
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
const PRODUCTION_ADMITTED_INPUTS = 'user-owned-manuscripts-and-house-knowledge';
/** The identifiers Provider Processing v6 introduced for the editor's own unpublished material. */
const PRODUCTION_UNPUBLISHED_CLASSES = ['unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content'] as const;

/** Whether `actual` is exactly `expected`: the same keys and, key by key, the same primitive or equal string list. */
function sameBlock(actual: unknown, expected: Readonly<Record<string, unknown>>): boolean {
  if (!isRecord(actual) || !exactKeys(actual, Object.keys(expected))) return false;
  return Object.entries(expected).every(([key, value]) =>
    Array.isArray(value) ? exactStrings(actual[key], value as readonly string[]) : actual[key] === value);
}

/** The shape of a production `source` block: the user's own sources, never Series Knowledge, plus the kind's own term. */
function productionSource(
  materialReferences: boolean,
  editorialDeliverables: boolean,
  kindTerm?: 'editorSelectedPassageOnly' | 'singleManuscriptConflictRegionOnly',
): Readonly<Record<string, unknown>> {
  return {
    admittedInputs: PRODUCTION_ADMITTED_INPUTS,
    privateManuscriptAllowed: true,
    materialReferencesAllowed: materialReferences,
    seriesKnowledgeAllowed: false,
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
    clarification: blocks.clarification === CLARIFICATION_ASKS, background, blocks };
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
 * The eight ordinary-production rules of Provider Processing v15, by rule id: the same kinds as developer-live v14, each
 * `eligible-only`, bound to the editor's own configured role binding rather than to one fixed route, and each read whole.
 */
const ORDINARY_PRODUCTION_RULES: Readonly<Record<string, OrdinaryProductionRuleReading>> = {
  'ordinary-production-baseline-analysis': productionReading('Main Editorial Role', ['baseline-manuscript-analysis'], ['public-or-synthetic'],
    { ...RUN_BLOCKS, source: productionSource(false, false), transmissions: PRODUCTION_BASELINE_TRANSMISSIONS }),
  'ordinary-production-editorial-dialogue': productionReading('Fast Interaction Role', ['editorial-dialogue'], ['editor-selected-manuscript-excerpt'],
    { ...FOREGROUND_BLOCKS, authorityOrigin: PRODUCTION_DIALOGUE_ORIGIN, source: productionSource(false, false, 'editorSelectedPassageOnly'), transmissions: PRODUCTION_DIALOGUE_TRANSMISSIONS, output: null }),
  'ordinary-production-review': productionReading('Main Editorial Role',
    ['editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression', 'editorial-review/cross-deliverable-consistency'],
    ['public-or-synthetic', 'frozen-material-reference-excerpt', 'editorial-deliverable-excerpt'],
    { ...RUN_BLOCKS, authorityOrigin: PRODUCTION_REVIEW_ORIGIN, source: productionSource(true, true), transmissions: PRODUCTION_REVIEW_TRANSMISSIONS }),
  'ordinary-production-writing': productionReading('Main Editorial Role', ['writing'],
    ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt'],
    { ...RUN_BLOCKS, source: productionSource(true, false), transmissions: PRODUCTION_SYNTHESIS_TRANSMISSIONS }, true),
  'ordinary-production-evaluation': productionReading('Main Editorial Role', ['evaluation', 'readers-report', 'evaluation-rewrite'],
    ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt'],
    { ...RUN_BLOCKS, source: productionSource(true, false), transmissions: PRODUCTION_SYNTHESIS_TRANSMISSIONS }, true),
  'ordinary-production-editorial-polish': productionReading('Fast Interaction Role', ['editorial-polish'], ['editor-selected-manuscript-excerpt'],
    { ...FOREGROUND_BLOCKS, authorityOrigin: PRODUCTION_FOREGROUND_ORIGIN, source: productionSource(false, false, 'editorSelectedPassageOnly'), transmissions: PRODUCTION_SUGGESTION_TRANSMISSIONS, output: PRODUCTION_SUGGESTION_OUTPUT }),
  'ordinary-production-conflict-regenerate': productionReading('Fast Interaction Role', ['conflict-regenerate'], ['manuscript-conflict-region-excerpt'],
    { ...FOREGROUND_BLOCKS, authorityOrigin: PRODUCTION_FOREGROUND_ORIGIN, source: productionSource(false, false, 'singleManuscriptConflictRegionOnly'), transmissions: PRODUCTION_SUGGESTION_TRANSMISSIONS, output: PRODUCTION_SUGGESTION_OUTPUT }),
  // Enrolled background analysis (v15): baseline analysis dispatched by an active matching enrollment, within its mandatory ceiling.
  [BACKGROUND_ANALYSIS_RULE_ID]: productionReading('Main Editorial Role', ['baseline-manuscript-analysis'], ['public-or-synthetic'],
    { ...RUN_BLOCKS, authorityOrigin: BACKGROUND_ORIGIN, executionMode: PRODUCTION_BACKGROUND_EXECUTION_MODE, scopeLimits: BACKGROUND_SCOPE_LIMITS,
      authorizationPreconditions: BACKGROUND_PRECONDITIONS, source: productionSource(false, false), transmissions: PRODUCTION_BASELINE_TRANSMISSIONS }, false, true),
};
/** The rule every ordinary-production policy must carry, whose reading the projection's suboperation flags come from. */
const ORDINARY_PRODUCTION_BASELINE_RULE_ID = 'ordinary-production-baseline-analysis';

/** The terms of a Provider Processing v13 or v15 document, root level: a document with any other root term is one this launch cannot read. */
const PRODUCTION_POLICY_TERMS = [
  'schemaDialect', 'schemaPath', 'documentType', 'policyId', 'policyType', 'version', 'lifecycleStatus', 'predecessorVersion',
  'predecessorCanonicalPath', 'canonicalPath', 'humanProjectionPath', 'operationalScope', 'authorityBasis', 'trustedSelection',
  'decision', 'roleBindings', 'outboundDataCategories', 'credentialBoundary', 'authoritySeparations',
] as const;
/** The outbound data category vocabulary of Provider Processing v13: the Egress Gate's identifiers and the three unpublished classes. */
const PRODUCTION_CATEGORY_VOCABULARY = [
  'public-or-synthetic', 'unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content', 'editor-selected-manuscript-excerpt',
  'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'book-metadata-and-synopsis', 'manuscript-conflict-region-excerpt',
  'frozen-material-reference-excerpt', 'editorial-deliverable-excerpt',
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
  readonly crossUnitReductionAllowed: boolean;
  readonly assuranceSamplingAllowed: boolean;
  readonly runReportReflectionAllowed: boolean;
  /** The bindings the user-configurable Main Editorial and Fast Interaction Roles may be configured with, as the bytes state them. */
  readonly allowedBindings: readonly AllowedRoleBinding[];
  /** The rules in policy order, each with the routes the policy lets its role bind. */
  readonly rules: ReadonlyArray<{
    readonly ruleId: string;
    readonly reading: OrdinaryProductionRuleReading;
    readonly allowedRoutes: readonly string[];
  }>;
}

function allowedBindingsOf(role: unknown): AllowedRoleBinding[] {
  requirePolicy(isRecord(role) && Array.isArray(role['allowedBindings']) && role['allowedBindings'].length > 0);
  const bindings: AllowedRoleBinding[] = [];
  for (const entry of role['allowedBindings'] as unknown[]) {
    requirePolicy(isRecord(entry) && exactKeys(entry, ['route', 'endpoint', 'model', 'credentialSlot']));
    for (const key of ['route', 'endpoint', 'model', 'credentialSlot']) requirePolicy(typeof entry[key] === 'string' && (entry[key] as string).length > 0);
    requirePolicy(!bindings.some((known) => known.route === entry['route']));
    bindings.push({ route: entry['route'] as string, endpoint: entry['endpoint'] as string, model: entry['model'] as string, credentialSlot: entry['credentialSlot'] as string });
  }
  return bindings;
}

/**
 * Provider Processing v15 (ordinary-production): default deny with eight eligible-only rules this launch can read, each bound to
 * a user-configured role binding. Everything is read whole and fails closed: a missing term, an unknown term, a rule id outside
 * `ORDINARY_PRODUCTION_RULES`, a repeated id, or any value that differs from the reading is a policy the launch cannot read.
 * The routing values themselves (route, endpoint, model, credential slot) are never source constants here: they are read from
 * the document's `allowedBindings`, which the SHA-256 pin fixes, and checked for consistency across the roles and rules.
 */
export function verifyOrdinaryProductionPolicy(policy: Record<string, unknown>): OrdinaryProductionPolicyReading {
  requirePolicy(exactKeys(policy, PRODUCTION_POLICY_TERMS) && policy['operationalScope'] === 'ordinary-production' && policy['lifecycleStatus'] === 'active');
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
  // are unbound by default and named by no rule; all four choose among the same bindings, none of which authorizes transmission.
  const roles = policy['roleBindings'];
  requirePolicy(isRecord(roles) && exactKeys(roles, ['Main Editorial Role', 'Fast Interaction Role', 'Difficult Escalation Role', 'Frontier Model Role']));
  const mainBindings = allowedBindingsOf(roles['Main Editorial Role']);
  const routes = mainBindings.map((binding) => binding.route);
  for (const roleName of ['Main Editorial Role', 'Fast Interaction Role']) {
    const role = roles[roleName];
    requirePolicy(isRecord(role) && exactKeys(role, ['bindingState', 'userConfigurable', 'defaultBinding', 'allowedBindings', 'userConfiguredBindingAuthorizesTransmission', 'fallbackAllowed']) &&
      role['bindingState'] === 'user-configurable' && role['userConfigurable'] === true &&
      typeof role['defaultBinding'] === 'string' && routes.includes(role['defaultBinding']) &&
      role['userConfiguredBindingAuthorizesTransmission'] === false && role['fallbackAllowed'] === false &&
      JSON.stringify(allowedBindingsOf(role)) === JSON.stringify(mainBindings));
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
  const rules: Array<{ ruleId: string; reading: OrdinaryProductionRuleReading; allowedRoutes: readonly string[] }> = [];
  for (const rule of decision['providerAllowRules'] as unknown[]) {
    requirePolicy(isRecord(rule) && typeof rule['ruleId'] === 'string' && !seen.has(rule['ruleId']) && Object.hasOwn(ORDINARY_PRODUCTION_RULES, rule['ruleId']));
    const ruleId = rule['ruleId'] as string;
    seen.add(ruleId);
    const reading = ORDINARY_PRODUCTION_RULES[ruleId]!;
    const blocks = reading.blocks;
    requirePolicy(exactKeys(rule, [
      'ruleId', 'policyResult', 'purpose', 'authorityOrigin', 'executionMode', 'source', 'allowedOutboundDataCategories', 'redaction', 'providerBinding',
      'transmissions', 'clarification', 'authorizationPreconditions', 'providerAccountLimit', 'capture', 'additionalPrivacyPrompts', 'allowedTaskKinds',
      ...(blocks.output === null ? [] : ['output']),
      ...(blocks.scopeLimits === null ? [] : ['scopeLimits']),
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
      allowedRoutes: routes,
      exactProviderBindingRequired: true,
      fallbackAllowed: false,
      approvedFallbackChainMaximumItems: 0,
      secondModelAllowed: false,
      productionDefaultsChanged: false,
    }));
    rules.push({ ruleId, reading, allowedRoutes: routes });
  }
  requirePolicy(seen.has(ORDINARY_PRODUCTION_BASELINE_RULE_ID));
  return { crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true, allowedBindings: mainBindings, rules };
}

/**
 * Apply the editor's configured binding to a verified ordinary-production reading: every rule's route, endpoint, model and
 * credential slot are filled from the one binding, which must be exactly one of the bindings the policy allows (and a route the
 * rule names). `null` when it is not, or when the binding is malformed — the caller denies with `binding-not-allowed`.
 */
export function bindOrdinaryProductionRules(reading: OrdinaryProductionPolicyReading, binding: ConfiguredProviderBinding): AdmittedProviderRule[] | null {
  if (!isRecord(binding) || !exactKeys(binding, ['route', 'endpoint', 'model', 'credentialSlot', 'credentialReference'])) return null;
  for (const key of ['route', 'endpoint', 'model', 'credentialSlot', 'credentialReference'] as const) {
    if (typeof binding[key] !== 'string' || binding[key].length === 0) return null;
  }
  const allowed = reading.allowedBindings.find((candidate) =>
    candidate.route === binding.route && candidate.endpoint === binding.endpoint && candidate.model === binding.model && candidate.credentialSlot === binding.credentialSlot);
  if (allowed === undefined) return null;
  const admitted: AdmittedProviderRule[] = [];
  for (const { ruleId, reading: kind, allowedRoutes } of reading.rules) {
    if (!allowedRoutes.includes(allowed.route)) return null;
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
      materialReferencesAllowed: kind.blocks.source['materialReferencesAllowed'] === true,
      editorialDeliverablesAllowed: kind.blocks.source['editorialDeliverablesAllowed'] === true,
      clarificationQuestionAllowed: kind.clarification,
      clarificationTimeoutHours: kind.clarification ? CLARIFICATION_ASKS.timeoutHours : null,
      backgroundOrigin: kind.background,
      matchingActiveDefaultExecutionRuleAllowed: kind.blocks.authorityOrigin['matchingActiveDefaultExecutionRuleAllowed'] === true,
    });
  }
  return admitted;
}

/**
 * Resolve the build-embedded source-checkout selection for the requested scope. Only the launch-selectable scopes can
 * verify; every invalid state, including an unselectable or unknown scope, remains the zero-transmission denial.
 *
 * `configuredBinding` is read only under `ordinary-production` (Provider Processing v15) and is ignored under every other
 * scope. With `null` the policy still verifies but no rule is admitted: the projection reports `bindingState: 'setup-required'`.
 * With a binding that is exactly one the policy allows, every admitted rule's route, endpoint, model and credential slot are
 * filled from it; any other binding is the denial `binding-not-allowed`.
 */
export async function resolveSourceCheckoutLaunchPolicy(
  codeRoot: string,
  requestedScope: TrustedOperationalScope = 'development-ci',
  configuredBinding: ConfiguredProviderBinding | null = null,
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
      const reading = verifyDeveloperLivePolicy(selectedPolicy);
      return {
        integrityState: 'verified',
        denialReason: null,
        operationalScope: 'developer-live',
        activePolicySetVersion: ACTIVE_SET_VERSION,
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
      const admittedRules = configuredBinding === null ? [] : bindOrdinaryProductionRules(reading, configuredBinding);
      if (admittedRules === null) return deny('binding-not-allowed');
      const configured = configuredBinding !== null;
      return {
        integrityState: 'verified',
        denialReason: null,
        operationalScope: 'ordinary-production',
        activePolicySetVersion: ACTIVE_SET_VERSION,
        providerProcessing: {
          version: ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION,
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
      providerProcessing: {
        version: 'v1',
        decision: 'deny',
        authorizedLiveTransmissionCount: 0,
        liveTransmissionAllowed: false,
        // v1 authorizes zero transmissions, so no step of a Run may transmit, these three included.
        crossUnitReductionAllowed: false,
        assuranceSamplingAllowed: false,
        runReportReflectionAllowed: false,
        // v1 names no allow rule.
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
