import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { LAUNCH_SELECTABLE_SCOPES, isTrustedOperationalScope, type AdmittedProviderRule, type DeveloperLiveCeiling, type OutboundDataCategoryId, type DevelopmentValidationIntent, type LaunchPolicyProjection, type TrustedLaunchForm, type TrustedOperationalScope } from '../shared/protocol.js';

/**
 * The source-checkout launch authority (ADR 0046, ADR 0065): the build-embedded carrier pins active
 * policy set v9, the sole active set for all four Provider Processing scopes, and names the two
 * scopes the built entry may bind from its launch form. `development-ci` is the default and binds
 * Provider Processing v1 (zero live transmissions); `developer-live` is bound only by the launch
 * argument `--trusted-operational-scope developer-live` on a developer host and binds the immutable
 * Provider Processing v11. `fixture-recording` and `ordinary-production` are pinned by the active set
 * but are not selectable from the source checkout. No environment variable or product setting
 * selects a scope; every invalid state resolves to the zero-transmission denial.
 */
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const CARRIER_VERSION = 2;
export const ACTIVE_SET_VERSION = 'v9' as const;
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v9.json';
const ACTIVE_SET_SHA256 = 'c3c6069d9b476a311c424343a3321fe7efbcbbb116f878dc51bb2236662b7c10';
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
    version: 'v11',
    canonicalPath: 'docs/policies/provider-processing-policy.v11.json',
    sha256: '64178786e62473e043afd4c699380c5e71ee95e2d7c42c2630a697072c36ac14',
  },
} as const;
/**
 * The Provider Processing version the active set pins for `developer-live`. Code that records or checks the developer-live
 * pin compares against this, and against `ACTIVE_SET_VERSION`, rather than a literal, so a successor set edits only this module.
 */
export const DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION = PROVIDER_PINS['developer-live'].version;
const EXTERNAL_PIN = {
  version: 'v2',
  canonicalPath: 'docs/policies/external-export-policy.v2.json',
  sha256: '162441cc3e5d30b0cafb00a0d04ca5ab32b64c5039baafc8952a9925bd7984b6',
} as const;

/**
 * The exact developer-live binding every rule of Provider Processing v11 declares, and the one rule v9 declared; the resolver
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

function exactStrings(value: unknown, expected: readonly string[]): value is string[] {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

/**
 * What every developer-live allow rule shares, whatever it admits: eligibility only, the developer host and no hosted, CI,
 * scheduled or background execution, admitted sample sources only, the house-people redaction rule of ADR 0079 §4.4, no web
 * tool, the protected local capture, and no extra privacy prompt.
 */
function verifyRuleCommon(rule: Record<string, unknown>): void {
  requirePolicy(rule['policyResult'] === 'eligible-only');
  const mode = rule['executionMode'];
  requirePolicy(isRecord(mode) && mode['humanAttended'] === false && mode['developerHostOnly'] === true &&
    mode['ciAllowed'] === false && mode['hostedAllowed'] === false && mode['scheduledAllowed'] === false && mode['backgroundAllowed'] === false);
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
 * A planned Run's origin: a newly user-initiated Task under direct Run Authorization, never a rule, enrollment or schedule.
 * `assuranceAnchors` is whether the kind samples a result for assurance (baseline analysis and review do; writing and the
 * evaluation contracts declare no sample), which the rule's transmission bound must state either way.
 */
function verifyPlannedRunOrigin(rule: Record<string, unknown>, assuranceAnchors = true): void {
  const origin = rule['authorityOrigin'];
  requirePolicy(isRecord(origin) && origin['newlyUserInitiatedTaskRequired'] === true &&
    origin['directRunAuthorizationAllowed'] === true && origin['matchingActiveDefaultExecutionRuleAllowed'] === false &&
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
  const transmissions = rule['transmissions'] as Record<string, unknown>;
  // The transmission bound of ADR 0079 §2.2, term by term, shared by every planned kind.
  requirePolicy(
    transmissions['boundedByCoverageManifestUnitCount'] === true &&
      transmissions['plusDeclaredSafeRetryAdaptations'] === true &&
      transmissions['plusAssuranceSampleAnchorUnits'] === assuranceAnchors &&
      transmissions['plusOneRunReportReflectionTurn'] === true &&
      transmissions['oneTechnicalSessionPerAnalysisUnit'] === true &&
      transmissions['accumulatingSingleSessionAllowed'] === false,
  );
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
  /** Whether the rule names the kind's one book-level synthesis turn (Provider Processing v11); `verify` reads the policy's own say. */
  readonly crossUnitSynthesisAllowed: boolean;
  readonly verify: (rule: Record<string, unknown>) => void;
}

/**
 * A planned Run over the Book's units that ends in the kind's one book-level synthesis turn — writing and the three evaluation
 * contracts (Provider Processing v11). The planned-Run origin and bound of baseline analysis, with the synthesis turn named,
 * no assurance sample, no reduction topic sections, and no Material References, Series Knowledge or editorial deliverables.
 */
function verifySynthesisRule(rule: Record<string, unknown>): void {
  verifyPlannedRunOrigin(rule, false);
  const source = rule['source'];
  requirePolicy(isRecord(source) && source['materialReferencesAllowed'] === false && source['materialReferenceConsumptionRecheckRequired'] === undefined &&
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
  // The reference-free, non-web review categories: planned Runs like the baseline, without a cross-unit reduction, and
  // never with Material References, Series Knowledge or editorial deliverables.
  'developer-live-public-samplebook-reference-free-review': {
    modelRole: 'Main Editorial Role',
    taskKinds: ['editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression'],
    outboundDataCategories: ['public-or-synthetic'],
    crossUnitSynthesisAllowed: false,
    verify: (rule) => {
      verifyPlannedRunOrigin(rule);
      const source = rule['source'] as Record<string, unknown>;
      requirePolicy(source['materialReferencesAllowed'] === false && source['seriesKnowledgeAllowed'] === false &&
        source['editorialDeliverablesAllowed'] === false);
      const transmissions = rule['transmissions'] as Record<string, unknown>;
      requirePolicy(transmissions['crossUnitReductionAllowed'] === false && transmissions['plusCrossUnitReductionTopicSections'] === undefined);
    },
  },
  // 写作任务 (S84): the `writing` kind, drafted over the Book's units and one book-level synthesis turn from the frozen metadata and
  // synopsis, the house's 范例 and the editor's own brief. Material-bearing writing remains refused this wave.
  'developer-live-public-samplebook-writing': {
    modelRole: 'Main Editorial Role',
    taskKinds: ['writing'],
    outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt'],
    crossUnitSynthesisAllowed: true,
    verify: verifySynthesisRule,
  },
  // The three implemented evaluation contracts (S81): AI7 初评 scores, 审稿意见 and 按我的评分重写评语, non-web.
  'developer-live-public-samplebook-evaluation': {
    modelRole: 'Main Editorial Role',
    taskKinds: ['evaluation', 'readers-report', 'evaluation-rewrite'],
    outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt'],
    crossUnitSynthesisAllowed: true,
    verify: verifySynthesisRule,
  },
  // Each Fast kind has its own rule and excerpt category (Issue #841 revision 5); outputs remain Suggestions only.
  'developer-live-public-samplebook-editorial-polish': {
    modelRole: 'Fast Interaction Role',
    taskKinds: ['editorial-polish'],
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
    verify: (rule) => verifySuggestionRule(rule, 'editorSelectedPassageOnly'),
  },
  'developer-live-public-samplebook-conflict-regenerate': {
    modelRole: 'Fast Interaction Role',
    taskKinds: ['conflict-regenerate'],
    outboundDataCategories: ['manuscript-conflict-region-excerpt'],
    crossUnitSynthesisAllowed: false,
    verify: (rule) => verifySuggestionRule(rule, 'singleManuscriptConflictRegionOnly'),
  },
};

/**
 * Provider Processing v11 (and v10, v9 before it): default deny with developer-live eligible-only allow rules, each one this
 * launch can read and each bound exactly to the one Go route. The baseline analysis rule must be among them; its three
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
    verifyRuleCommon(rule);
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
    });
  }
  requirePolicy(seen.has(DEVELOPER_LIVE_POLICY_BINDING.ruleId));
  return {
    crossUnitReductionAllowed: true,
    assuranceSamplingAllowed: true,
    runReportReflectionAllowed: true,
    admittedRules,
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
