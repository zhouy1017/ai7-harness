import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_SET_VERSION,
  DEVELOPER_LIVE_POLICY_BINDING,
  DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION,
  ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION,
  bindOrdinaryProductionRules,
  resolveSourceCheckoutLaunchPolicy,
  verifyDeveloperLivePolicy,
  verifyOrdinaryProductionPolicy,
  type ConfiguredProviderBinding,
} from '../../src/service/launch-policy.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { FACTUAL_REVIEW_KIND, LAUNCH_SELECTABLE_SCOPES, parseTrustedLaunchForm } from '../../src/shared/protocol.js';
import { liveKindRule } from '../../src/service/analysis/live-kind-admission.js';
import type { AdmittedLocalTools, AdmittedPlatformTools, AdmittedProviderRule, LaunchPolicyProjection, TrustedOperationalScope } from '../../src/shared/protocol.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CARRIER_PATH = 'config/source-checkout-launch-authority.json';
const ACTIVE_SET_PATH = 'docs/policies/active-policy-set.v15.json';
const CARRIED_PATHS = [
  CARRIER_PATH,
  ACTIVE_SET_PATH,
  'docs/policies/provider-processing-policy.v1.json',
  'docs/policies/provider-processing-policy.v2.json',
  'docs/policies/provider-processing-policy.v3.json',
  'docs/policies/provider-processing-policy.v4.json',
  'docs/policies/provider-processing-policy.v22.json',
  'docs/policies/provider-processing-policy.v23.json',
  'docs/policies/external-export-policy.v1.json',
  'docs/policies/external-export-policy.v2.json',
] as const;
/** The exact pins active-set v15 records; the resolver and the carrier must agree with the bytes. */
const EXPECTED_PINS = {
  'development-ci': ['v1', 'docs/policies/provider-processing-policy.v1.json', 'd9dfe8c13a58649d8d9f607364030468ae71832b94c9436291d29000795d725a'],
  'fixture-recording': ['v2', 'docs/policies/provider-processing-policy.v2.json', 'd0e3996ce7ba091200d83178b48fb578090bf73b509406182a2d5403ab2a4ebc'],
  'ordinary-production': ['v23', 'docs/policies/provider-processing-policy.v23.json', '311f60232c6e3424e64e0a0f760402c2fe07f4bca71a0299b37d295a7baa6dcb'],
  'developer-live': ['v22', 'docs/policies/provider-processing-policy.v22.json', 'dc78f4517ec8135edb4fdcc759d1c230fc4db5ef7f5c42f217c12aac4173c90b'],
} as const;
/** Every immutable predecessor asset keeps its exact bytes: v6, v13, v15, v17, v19 and v21 (the old ordinary-production), v11, v12, v14, v16, v18 and v20 (the old developer-live), and sets v9 to v14. */
const RETAINED_PREDECESSOR_DIGESTS = {
  'docs/policies/provider-processing-policy.v6.json': '10e69a5d7b027d077728ec1bc7393dc0583b99a05246b4e883098b9d96b221a4',
  'docs/policies/provider-processing-policy.v11.json': '38cc8044f10517bd3c152237256cd0cd7fe6cf8a4ef7ad340099a087ac8a8634',
  'docs/policies/provider-processing-policy.v12.json': '9bc27046af27c2967482c51ec4850668df13154a8c8e3ad94bdcb6fae3b47b2c',
  'docs/policies/provider-processing-policy.v13.json': '465f6bb3b43d522c2464f0589e6302600799192ee46ba17df23269f08f94ea3e',
  'docs/policies/provider-processing-policy.v14.json': '98ec1f93f26e896d1a6a37b3829eacffb7deb9b52f8966252aa3f7115717bb6d',
  'docs/policies/provider-processing-policy.v15.json': '1f398f923d57a442fe6c410b5831c25f45c6983973ccfcf619472db8a8666b46',
  'docs/policies/provider-processing-policy.v16.json': 'c6c3b51c346d4ab4011f03835f8650c503dd87dfa02617bde4b3a0707cd8701d',
  'docs/policies/provider-processing-policy.v17.json': 'e5dba26a71704016b9af9864c56aa508aa2bcebe75225a8e4e7af1c1fa67236b',
  'docs/policies/provider-processing-policy.v18.json': '4c0d56cbb3fca6af392ea6d3757a55b93251a345900620564d39373889a09dba',
  'docs/policies/provider-processing-policy.v19.json': 'f13c6f412adebf863f63b14640799fb7ffcbafcf05d6ace5437b806a0d4ccf16',
  'docs/policies/provider-processing-policy.v20.json': 'd9cd34ed6e945760657345ed7e7bf4eae4489e5367ac7eb2400af413cc28f757',
  'docs/policies/provider-processing-policy.v21.json': 'd1199f4c110d0c6598e6910c1784e5c612c18866387abdfe6e45b1c7593c6263',
  'docs/policies/active-policy-set.v9.json': 'b13013bbd0b9b1cb0fdd7b88d0d349d9c010d3043e867c547a81f37ed3d5cb0b',
  'docs/policies/active-policy-set.v10.json': 'e1bb81956a46fc9dad3f761943d94f1b68802549ed6838fde7efa7e711584487',
  'docs/policies/active-policy-set.v11.json': 'fba12d9b8da7b826b620ac33c0b34eadd92da86d6da88f610e480af9aee5328c',
  'docs/policies/active-policy-set.v12.json': 'e841b438da109d866d990cc788ffd7c45edcb38a5121d8b18c41a0345e75693e',
  'docs/policies/active-policy-set.v13.json': '8d3536cf67989693a395c3699d60db3a508acaa3b7f7db6ab147bfb04e15338d',
  'docs/policies/active-policy-set.v14.json': '1e9f3c4736a0f7b0ac8066978637e3dc813aee6f51d1f98673fe1fba3564a6e9',
} as const;
/** ADR 0079 §3 decides External Export v2; active-set v15 pins its exact bytes, unchanged since v7. */
const EXPECTED_EXTERNAL_PIN = ['v2', 'docs/policies/external-export-policy.v2.json', '162441cc3e5d30b0cafb00a0d04ca5ab32b64c5039baafc8952a9925bd7984b6'] as const;
const ACTIVE_SET_SHA256 = '99fd7156d98b12e7cad81d0ac6e81d3481380f5b25c096dafa9b1ec6ffdc8865';

const GO_BINDING = {
  route: 'opencode-go',
  endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
  model: 'deepseek-v4.1-flash',
  credentialSlot: 'opencode-go',
} as const;
/** The shipped search backends in the recorded ranking order (#883, decision 24⁵), as the projection lists them. */
const SHIPPED_BACKENDS = [
  { id: 'search-tinyfish', host: 'api.search.tinyfish.ai', credentialSlot: 'search-tinyfish' },
  { id: 'search-deepseek', host: 'api.deepseek.com', credentialSlot: 'search-deepseek' },
  { id: 'search-brave', host: 'api.search.brave.com', credentialSlot: 'search-brave' },
  { id: 'search-parallel', host: 'api.parallel.ai', credentialSlot: 'search-parallel' },
  { id: 'search-bochaai', host: 'api.bochaai.com', credentialSlot: 'search-bochaai' },
];
/** The platform tools a v16 research rule projects; v17's differ only by requiring the editor's own key to select a backend. */
function platformToolsProjection(production: boolean): AdmittedPlatformTools {
  return {
    websearch: { selection: 'user-configured', backends: SHIPPED_BACKENDS, selectionRequiresCredential: production },
    webfetch: { maxBytes: 5_242_880, timeoutSeconds: 30, boundedByCitations: true },
    breaker: { roundTrips: 128, end: '联网核查未完成' },
    oneQueryPerRunUnit: true,
    toolResultCategory: 'public-or-synthetic',
  };
}
const NO_WEB = { webSearchToolAllowed: false, platformTools: null } as const;
const WEB = { webSearchToolAllowed: true, platformTools: platformToolsProjection(false) } as const;
/** The local tools every v18/v19 rule projects (Issue #891): targeted retrieval over the Run's pinned sources, no egress; not allowed for background analysis. */
function localToolsProjection(allowed: boolean): AdmittedLocalTools {
  return {
    targetedRetrieval: { allowed, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8, exactFetchRequiredBeforeCitation: true, scope: 'no-egress' },
    breaker: { roundTrips: 128, end: '检索未完成' },
  };
}
/** Both v18/v19 projection terms every rule carries (Issue #891): its local tools and `sourceTranslationAllowed` (true on the research review rule alone). */
const LOCAL = { localTools: localToolsProjection(true), sourceTranslationAllowed: false } as const;
const LOCAL_BACKGROUND = { localTools: localToolsProjection(false), sourceTranslationAllowed: false } as const;
const LOCAL_NO_RETRIEVAL = LOCAL_BACKGROUND;
const WEB_CATEGORIES = ['web-search-query', 'public-source-fetch'] as const;
const WEB_REVIEW_KINDS = ['editorial-review/factual-review', 'editorial-review/academic-integrity', 'factual-review'];
/** The Series consistency kind, the review rule's last kind since v22 and v23 (Issue #920 rev 3). */
const SERIES_REVIEW_KIND = 'editorial-review/series-consistency';
/** The four rules v16 carries from v14 unchanged (baseline analysis, dialogue, 润色, conflict regeneration), as the projection states them. */
const V16_UNCHANGED_RULES: Record<string, AdmittedProviderRule> = {
  baseline: {
    ruleId: 'developer-live-public-samplebook-analysis',
    taskKinds: ['baseline-manuscript-analysis'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: false,
    editorialDeliverablesAllowed: false,
    clarificationQuestionAllowed: true,
    clarificationTimeoutHours: 24,
    backgroundOrigin: false,
    matchingActiveDefaultExecutionRuleAllowed: false,
    ...NO_WEB,
    ...LOCAL,
  },
  dialogue: {
    ruleId: 'developer-live-public-samplebook-editorial-dialogue',
    taskKinds: ['editorial-dialogue'],
    modelRole: 'Fast Interaction Role',
    ...GO_BINDING,
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: false,
    editorialDeliverablesAllowed: false,
    clarificationQuestionAllowed: false,
    clarificationTimeoutHours: null,
    backgroundOrigin: false,
    matchingActiveDefaultExecutionRuleAllowed: false,
    ...NO_WEB,
    ...LOCAL,
  },
  polish: {
    ruleId: 'developer-live-public-samplebook-editorial-polish',
    taskKinds: ['editorial-polish'],
    modelRole: 'Fast Interaction Role',
    ...GO_BINDING,
    outboundDataCategories: ['editor-selected-manuscript-excerpt'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: false,
    editorialDeliverablesAllowed: false,
    clarificationQuestionAllowed: false,
    clarificationTimeoutHours: null,
    backgroundOrigin: false,
    matchingActiveDefaultExecutionRuleAllowed: false,
    ...NO_WEB,
    ...LOCAL,
  },
  conflict: {
    ruleId: 'developer-live-public-samplebook-conflict-regenerate',
    taskKinds: ['conflict-regenerate'],
    modelRole: 'Fast Interaction Role',
    ...GO_BINDING,
    outboundDataCategories: ['manuscript-conflict-region-excerpt'],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: false,
    editorialDeliverablesAllowed: false,
    clarificationQuestionAllowed: false,
    clarificationTimeoutHours: null,
    backgroundOrigin: false,
    matchingActiveDefaultExecutionRuleAllowed: false,
    ...NO_WEB,
    ...LOCAL,
  },
};
/**
 * The three rules that may research under v16 (Issue #473, slice 6d): review (with 事实核查 and 学术道德与引用 as
 * kinds), writing and evaluation, each with the two web categories and the platform tools; otherwise as v14 projected them.
 */
const V16_CHANGED_RULES: Record<string, AdmittedProviderRule> = {
  review: {
    ruleId: 'developer-live-public-samplebook-reference-free-review',
    taskKinds: ['editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression', 'editorial-review/cross-deliverable-consistency', ...WEB_REVIEW_KINDS, SERIES_REVIEW_KIND],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic', 'frozen-material-reference-excerpt', 'editorial-deliverable-excerpt', 'house-review-preference-excerpt', 'series-knowledge-excerpt', ...WEB_CATEGORIES],
    crossUnitSynthesisAllowed: false,
    materialReferencesAllowed: true,
    editorialDeliverablesAllowed: true,
    clarificationQuestionAllowed: true,
    clarificationTimeoutHours: 24,
    backgroundOrigin: false,
    matchingActiveDefaultExecutionRuleAllowed: true,
    ...WEB,
    ...LOCAL,
    sourceTranslationAllowed: true,
  },
  writing: {
    ruleId: 'developer-live-public-samplebook-writing',
    taskKinds: ['writing'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt', ...WEB_CATEGORIES],
    crossUnitSynthesisAllowed: true,
    materialReferencesAllowed: true,
    editorialDeliverablesAllowed: false,
    clarificationQuestionAllowed: true,
    clarificationTimeoutHours: 24,
    backgroundOrigin: false,
    matchingActiveDefaultExecutionRuleAllowed: true,
    ...WEB,
    ...LOCAL,
  },
  evaluation: {
    ruleId: 'developer-live-public-samplebook-evaluation',
    taskKinds: ['evaluation', 'readers-report', 'evaluation-rewrite'],
    modelRole: 'Main Editorial Role',
    ...GO_BINDING,
    outboundDataCategories: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt', 'frozen-material-reference-excerpt', ...WEB_CATEGORIES],
    crossUnitSynthesisAllowed: true,
    materialReferencesAllowed: true,
    editorialDeliverablesAllowed: false,
    clarificationQuestionAllowed: true,
    clarificationTimeoutHours: 24,
    backgroundOrigin: false,
    matchingActiveDefaultExecutionRuleAllowed: false,
    ...WEB,
    ...LOCAL,
  },
};
/** The enrolled-background rule (v14, unchanged in v16, no web): baseline analysis dispatched by an active matching enrollment; the only rule with a background origin. */
const BACKGROUND_RULE_ID = 'enrolled-background-manuscript-analysis-processing';
const V16_BACKGROUND_RULE: AdmittedProviderRule = {
  ruleId: BACKGROUND_RULE_ID,
  taskKinds: ['baseline-manuscript-analysis'],
  modelRole: 'Main Editorial Role',
  ...GO_BINDING,
  outboundDataCategories: ['public-or-synthetic'],
  crossUnitSynthesisAllowed: false,
  materialReferencesAllowed: false,
  editorialDeliverablesAllowed: false,
  clarificationQuestionAllowed: true,
  clarificationTimeoutHours: 24,
  backgroundOrigin: true,
  matchingActiveDefaultExecutionRuleAllowed: false,
  ...NO_WEB,
  ...LOCAL_BACKGROUND,
};
/** The 来源译文 rule (v18, Issue #891 revision 3): the Fast Interaction Role translating one frozen 资料库 excerpt of an admitted public text; no web, no retrieval, no question. */
const TRANSLATION_RULE_ID = 'developer-live-public-samplebook-material-translation';
const V18_TRANSLATION_RULE: AdmittedProviderRule = {
  ruleId: TRANSLATION_RULE_ID,
  taskKinds: ['material-translation'],
  modelRole: 'Fast Interaction Role',
  ...GO_BINDING,
  outboundDataCategories: ['public-or-synthetic'],
  crossUnitSynthesisAllowed: false,
  materialReferencesAllowed: true,
  editorialDeliverablesAllowed: false,
  clarificationQuestionAllowed: false,
  clarificationTimeoutHours: null,
  backgroundOrigin: false,
  matchingActiveDefaultExecutionRuleAllowed: false,
  ...NO_WEB,
  ...LOCAL_NO_RETRIEVAL,
};
/** The custom analysis rule (v22, Issue #920): the family `custom-analysis/*` over an editor-authored question template; no web, no retrieval, no Material Reference, Series or deliverable. */
const CUSTOM_RULE_ID = 'developer-live-public-samplebook-custom-analysis';
const V22_CUSTOM_RULE: AdmittedProviderRule = {
  ruleId: CUSTOM_RULE_ID,
  taskKinds: ['custom-analysis/*'],
  modelRole: 'Main Editorial Role',
  ...GO_BINDING,
  outboundDataCategories: ['public-or-synthetic', 'editor-authored-question-template'],
  crossUnitSynthesisAllowed: false,
  materialReferencesAllowed: false,
  editorialDeliverablesAllowed: false,
  clarificationQuestionAllowed: true,
  clarificationTimeoutHours: 24,
  backgroundOrigin: false,
  matchingActiveDefaultExecutionRuleAllowed: false,
  ...NO_WEB,
  ...LOCAL_NO_RETRIEVAL,
};
const V16_ADMITTED_RULES: AdmittedProviderRule[] = [
  V16_UNCHANGED_RULES.baseline!,
  V16_UNCHANGED_RULES.dialogue!,
  V16_CHANGED_RULES.review!,
  V16_CHANGED_RULES.writing!,
  V16_CHANGED_RULES.evaluation!,
  V16_UNCHANGED_RULES.polish!,
  V16_UNCHANGED_RULES.conflict!,
  V16_BACKGROUND_RULE,
  V18_TRANSLATION_RULE,
  V22_CUSTOM_RULE,
];

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

const V11_PATH = 'docs/policies/provider-processing-policy.v11.json';
const V12_PATH = 'docs/policies/provider-processing-policy.v12.json';
const V13_PATH = 'docs/policies/provider-processing-policy.v13.json';
const V14_PATH = 'docs/policies/provider-processing-policy.v14.json';
const V15_PATH = 'docs/policies/provider-processing-policy.v15.json';
const V16_PATH = 'docs/policies/provider-processing-policy.v16.json';
const V17_PATH = 'docs/policies/provider-processing-policy.v17.json';
const V18_PATH = 'docs/policies/provider-processing-policy.v18.json';
const V19_PATH = 'docs/policies/provider-processing-policy.v19.json';
const V20_PATH = 'docs/policies/provider-processing-policy.v20.json';
const V21_PATH = 'docs/policies/provider-processing-policy.v21.json';
const V22_PATH = 'docs/policies/provider-processing-policy.v22.json';
const V23_PATH = 'docs/policies/provider-processing-policy.v23.json';
const BASELINE = 0;
const DIALOGUE = 1;
const REVIEW = 2;
const WRITING = 3;
const EVALUATION = 4;
const POLISH = 5;
const CONFLICT = 6;
const BACKGROUND = 7;
const TRANSLATION = 8;
const CUSTOM = 9;

async function readPolicy(path: string = V22_PATH): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(REPO_ROOT, ...path.split('/')), 'utf8')) as Record<string, unknown>;
}

function rulesOf(policy: Record<string, unknown>): Array<Record<string, unknown>> {
  return (policy.decision as { providerAllowRules: Array<Record<string, unknown>> }).providerAllowRules;
}

const ADR_0026 = 'docs/adr/0026-manuscript-retrieval-returns-candidates.md';
const ADR_0047 = 'docs/adr/0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md';
const ADR_0074 = 'docs/adr/0074-admit-a-bounded-research-egress-and-a-runtime-factual-verification-policy.md';
const WEB_CATEGORY_LABELS = { 'web-search-query': { labelZh: '模型自拟的联网检索词' }, 'public-source-fetch': { labelZh: '公开来源网页地址' } };
const RESEARCH = [REVIEW, WRITING, EVALUATION];
const PRODUCTION_RESEARCH_IDS = ['ordinary-production-review', 'ordinary-production-writing', 'ordinary-production-evaluation'];
const UNPUBLISHED = ['unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content'];

/**
 * A predecessor rule (v14 or v15) with exactly the v16 / v17 delta: a research rule gains the web switch, the two web categories
 * (before the unpublished classes), the given platform tools block and — review alone — the two web-bearing kinds; every other
 * rule is unchanged.
 */
function withResearch(rule: Record<string, unknown>, index: number, platformTools: unknown): Record<string, unknown> {
  const expected = structuredClone(rule);
  if (!RESEARCH.includes(index)) return expected;
  const categories = expected.allowedOutboundDataCategories as string[];
  expected.allowedOutboundDataCategories = [...categories.filter((category) => !UNPUBLISHED.includes(category)), 'web-search-query', 'public-source-fetch',
    ...categories.filter((category) => UNPUBLISHED.includes(category))];
  expected.transmissions = { ...(expected.transmissions as Record<string, unknown>), webSearchToolAllowed: true };
  expected.platformTools = platformTools;
  if (index === REVIEW) expected.allowedTaskKinds = [...(expected.allowedTaskKinds as string[]), ...WEB_REVIEW_KINDS];
  return expected;
}

/** A v16 / v17 rule with exactly the v18 / v19 delta: the `localTools` block, retrieval not allowed for the background rule; everything else unchanged. */
function withLocalTools(rule: Record<string, unknown>, index: number): Record<string, unknown> {
  return { ...structuredClone(rule), localTools: localToolsProjection(index !== BACKGROUND), ...(index === REVIEW ? { sourceTranslationAllowed: true } : {}) };
}

/**
 * The exact v16 document with the given fields of one rule overridden. The digests the resolver checks are
 * constants of `launch-policy.ts`, so a policy revision could never be fed through
 * `resolveSourceCheckoutLaunchPolicy`; the reading of the rules' exact fields is therefore pinned
 * against the verification function itself, over the real bytes with one field varied.
 */
async function v16PolicyWithRule(index: number, overrides: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const policy = await readPolicy();
  Object.assign(rulesOf(policy)[index]!, overrides);
  return policy;
}

/** The exact v16 document with the given keys of one rule's named block overridden. */
async function v16PolicyWithBlock(index: number, block: string, overrides: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
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

describe('active policy set v15', () => {
  it('is the sole active set: the carrier pins it, it maps all four scopes, and every pin matches the exact bytes', async () => {
    expect(ACTIVE_SET_VERSION).toBe('v15');
    expect(DEVELOPER_LIVE_PROVIDER_PROCESSING_VERSION).toBe('v22');
    expect(ORDINARY_PRODUCTION_PROVIDER_PROCESSING_VERSION).toBe('v23');
    const carrier = JSON.parse(await readFile(join(REPO_ROOT, ...CARRIER_PATH.split('/')), 'utf8')) as Record<string, unknown>;
    expect(carrier).toEqual({
      manifestType: 'ai7-source-checkout-launch-authority',
      version: 2,
      runtimeForm: 'source-checkout',
      trustedOperationalScope: 'development-ci',
      launchSelectableScopes: ['development-ci', 'developer-live', 'ordinary-production'],
      activePolicySet: { version: 'v15', canonicalPath: ACTIVE_SET_PATH, sha256: ACTIVE_SET_SHA256 },
    });
    expect(LAUNCH_SELECTABLE_SCOPES).toEqual(carrier.launchSelectableScopes);
    expect(await sha256Of(ACTIVE_SET_PATH)).toBe(ACTIVE_SET_SHA256);
    const activeSet = JSON.parse(await readFile(join(REPO_ROOT, ...ACTIVE_SET_PATH.split('/')), 'utf8')) as {
      version: string;
      predecessorVersion: string;
      activePolicies: {
        'provider-processing-policy': { scopePins: Record<string, { version: string; canonicalPath: string; sha256: string }> };
        'external-export-policy': { version: string; canonicalPath: string; sha256: string };
      };
    };
    expect(activeSet.version).toBe('v15');
    expect(activeSet.predecessorVersion).toBe('v14');
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

  it('keeps every predecessor pin of active-set v12 except ordinary-production and developer-live byte-identical', async () => {
    const v12 = JSON.parse(await readFile(join(REPO_ROOT, 'docs', 'policies', 'active-policy-set.v12.json'), 'utf8')) as {
      activePolicies: { 'provider-processing-policy': { scopePins: Record<string, unknown> }; 'external-export-policy': unknown };
    };
    const v13 = JSON.parse(await readFile(join(REPO_ROOT, ...ACTIVE_SET_PATH.split('/')), 'utf8')) as typeof v12;
    for (const scope of ['development-ci', 'fixture-recording']) {
      expect(v13.activePolicies['provider-processing-policy'].scopePins[scope]).toEqual(v12.activePolicies['provider-processing-policy'].scopePins[scope]);
    }
    expect(v13.activePolicies['external-export-policy']).toEqual(v12.activePolicies['external-export-policy']);
    // The two moved pins are exactly the successors of the retained v17 and v16 pins.
    expect(v12.activePolicies['provider-processing-policy'].scopePins['ordinary-production']).toMatchObject({ version: 'v17' });
    expect(v12.activePolicies['provider-processing-policy'].scopePins['developer-live']).toMatchObject({ version: 'v16' });
  });

  it('leaves every retained predecessor asset this successor replaces byte-identical', async () => {
    for (const [path, digest] of Object.entries(RETAINED_PREDECESSOR_DIGESTS)) {
      expect(await sha256Of(path), path).toBe(digest);
    }
  });

  it('carries every v16 rule, role binding and category into v18 unchanged except the local tools on every rule', async () => {
    const v16 = await readPolicy(V16_PATH);
    const v18 = await readPolicy(V18_PATH);
    expect(v18.predecessorVersion).toBe('v16');
    expect(v18.predecessorCanonicalPath).toBe(V16_PATH);
    expect(v18.operationalScope).toBe('developer-live');
    expect(v18.roleBindings).toEqual(v16.roleBindings);
    expect(v18.authoritySeparations).toEqual(v16.authoritySeparations);
    expect(v18.credentialBoundary).toEqual(v16.credentialBoundary);
    expect(v18.trustedSelection).toEqual(v16.trustedSelection);
    expect(v18.outboundDataCategories).toEqual(v16.outboundDataCategories);
    expect(v18.authorityBasis).toEqual([...(v16.authorityBasis as string[]), ADR_0026, ADR_0047]);
    expect(rulesOf(v18).map((rule) => rule.ruleId)).toEqual(V16_ADMITTED_RULES.slice(0, 9).map((rule) => rule.ruleId));
    // Nine rules: the eight of v16 and, appended, the 来源译文 rule (Issue #891 revision 2 and 3).
    expect(rulesOf(v18)).toHaveLength(rulesOf(v16).length + 1);
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT, BACKGROUND]) {
      expect(rulesOf(v18)[index], String(rulesOf(v16)[index]!.ruleId)).toEqual(withLocalTools(rulesOf(v16)[index]!, index));
    }
    // The appended rule is the dialogue rule's Fast Interaction Role binding with 来源译文's own origin, source and payload terms.
    const translation = rulesOf(v18)[TRANSLATION]!;
    expect(translation.ruleId).toBe(TRANSLATION_RULE_ID);
    expect(translation.allowedTaskKinds).toEqual(['material-translation']);
    expect(translation.allowedOutboundDataCategories).toEqual(['public-or-synthetic']);
    expect(translation.providerBinding).toEqual(rulesOf(v16)[DIALOGUE]!.providerBinding);
    for (const block of ['executionMode', 'redaction', 'authorizationPreconditions', 'providerAccountLimit', 'capture', 'additionalPrivacyPrompts', 'clarification'] as const) {
      expect(translation[block], block).toEqual(rulesOf(v16)[DIALOGUE]![block]);
    }
    expect((translation.transmissions as Record<string, unknown>).webSearchToolAllowed).toBe(false);
    expect(translation.platformTools).toBeUndefined();
    expect((translation.localTools as { targetedRetrieval: { allowed: boolean } }).targetedRetrieval.allowed).toBe(false);
    expect((translation.source as Record<string, unknown>).materialReferencesAllowed).toBe(true);
    // sourceTranslationAllowed is stated on the research review rule alone.
    rulesOf(v18).forEach((rule, index) => { expect(rule.sourceTranslationAllowed, String(index)).toBe(index === REVIEW ? true : undefined); });
    // v16's own bytes are immutable and no longer the reading: no rule states the local tools.
    expect(() => verifyDeveloperLivePolicy(structuredClone(v16))).toThrow('LAUNCH_POLICY_INVALID');
  });

  it('declares the exact developer-live binding the v16 policy bytes carry', () => {
    expect(DEVELOPER_LIVE_POLICY_BINDING.route).toBe('opencode-go');
    expect(DEVELOPER_LIVE_POLICY_BINDING.model).toBe('deepseek-v4.1-flash');
    expect(DEVELOPER_LIVE_POLICY_BINDING.endpoint).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    expect(DEVELOPER_LIVE_POLICY_BINDING.credentialSlot).toBe('opencode-go');
    // ADR 0070 as ADR 0079 §2.3 lands it: 30,000 tokens per frozen unit, never the flat 500,000.
    expect(DEVELOPER_LIVE_POLICY_BINDING.defaultRunBudgetCeilingTokensPerFrozenUnit).toBe(30_000);
  });
});

describe('resolveSourceCheckoutLaunchPolicy', () => {
  it('refuses widening any v16 rule\'s task, origin, material or attendance matrix', async () => {
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT, BACKGROUND, CUSTOM]) {
      for (const override of [
        { allowedTaskKinds: [...(rulesOf(await readPolicy())[index]!.allowedTaskKinds as string[]), 'fact-check'] },
        { allowedOutboundDataCategories: ['public-or-synthetic', 'unpublished-excerpts'] },
        { authorityOrigin: { newlyUserInitiatedTaskRequired: false } },
        { executionMode: { humanAttended: true } },
      ]) {
        await expect(v16PolicyWithRule(index, override).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
    }
    // 出版政策与风险 stays outside the review rule; cross-deliverable consistency, since v16 事实核查 and 学术道德与引用, and since v22 书系一致性 are inside it.
    for (const kind of ['editorial-review/publication-risk', 'fact-check']) {
      await expect(v16PolicyWithRule(REVIEW, { allowedTaskKinds: [...V16_CHANGED_RULES.review!.taskKinds, kind] }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
    for (const kinds of [V16_CHANGED_RULES.review!.taskKinds.slice(0, 4), V16_CHANGED_RULES.review!.taskKinds.slice(0, 5)]) {
      await expect(v16PolicyWithRule(REVIEW, { allowedTaskKinds: kinds }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('verifies a complete source-checkout carrier and pins the development-ci scope by default', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot);

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('development-ci');
    // One active set per launch: development-ci reports v15 while its Provider Processing pin stays v1.
    expect(projection.activePolicySetVersion).toBe('v15');
    expect(projection.providerProcessing.version).toBe('v1');
    expect(projection.providerProcessing.label).toBe('开发与持续集成：零次实时传输');
    expect(projection.providerProcessing.bindingState).toBeUndefined();
    expect(projection.externalExport.version).toBe('v2');
    expectZeroTransmission(projection);
    expect(await resolveSourceCheckoutLaunchPolicy(codeRoot, 'development-ci')).toEqual(projection);
  });

  it('binds the developer-live scope to Provider Processing v22 as eligible-only with its ten admitted rules', async () => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');

    expect(projection.integrityState).toBe('verified');
    expect(projection.denialReason).toBeNull();
    expect(projection.operationalScope).toBe('developer-live');
    expect(projection.activePolicySetVersion).toBe('v15');
    expect(projection.providerProcessing).toEqual({
      version: 'v22',
      decision: 'eligible-only',
      authorizedLiveTransmissionCount: 'bounded-by-run',
      liveTransmissionAllowed: true,
      // The baseline rule names all three declared suboperations (ADR 0066) `true`, as ADR 0079 §2.1 settled for v5; the
      // reduction, the assurance sample and the reflection turn each dispatch inside the bound of §2.2.
      crossUnitReductionAllowed: true,
      assuranceSamplingAllowed: true,
      runReportReflectionAllowed: true,
      admittedRules: V16_ADMITTED_RULES,
      label: '开发者实时：实时传输受运行边界约束',
    });
    expect(projection.providerProcessing.admittedRules).toHaveLength(10);
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
      // v1 authorizes zero transmissions; the v16 baseline rule names all three.
      const named = scope === 'developer-live';
      expect(projection.providerProcessing.crossUnitReductionAllowed).toBe(named);
      expect(projection.providerProcessing.assuranceSamplingAllowed).toBe(named);
      expect(projection.providerProcessing.runReportReflectionAllowed).toBe(named);
    }
    // The denial carries the same reading, so no unreadable launch can turn any step on.
    const denied = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'fixture-recording' as TrustedOperationalScope);
    expect(denied.integrityState).toBe('denied');
    expect(denied.providerProcessing.crossUnitReductionAllowed).toBe(false);
    expect(denied.providerProcessing.assuranceSamplingAllowed).toBe(false);
    expect(denied.providerProcessing.runReportReflectionAllowed).toBe(false);
    expect(denied.providerProcessing.admittedRules).toEqual([]);
  });

  it('reads N allow rules: the exact v22 bytes yield ten, and the immutable v20, v16, v14, v12 and v11 bytes are no longer the pinned reading', async () => {
    expect(verifyDeveloperLivePolicy(await readPolicy())).toEqual({
      crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true,
      admittedRules: V16_ADMITTED_RULES,
    });
    // v20, v16, v14, v12 and v11 stay immutable predecessors but this launch reads v22 alone.
    expect(() => verifyDeveloperLivePolicy(structuredClone(readPolicySync(V20_PATH)))).toThrow('LAUNCH_POLICY_INVALID');
    expect(() => verifyDeveloperLivePolicy(structuredClone(readPolicySync(V16_PATH)))).toThrow('LAUNCH_POLICY_INVALID');
    expect(() => verifyDeveloperLivePolicy(structuredClone(readPolicySync(V14_PATH)))).toThrow('LAUNCH_POLICY_INVALID');
    expect(() => verifyDeveloperLivePolicy(structuredClone(readPolicySync(V12_PATH)))).toThrow('LAUNCH_POLICY_INVALID');
    expect(() => verifyDeveloperLivePolicy(structuredClone(readPolicySync(V11_PATH)))).toThrow('LAUNCH_POLICY_INVALID');
  });

  it('refuses an unknown, repeated or missing rule, and a role the policy does not bind', async () => {
    const unknown = await v16PolicyWithRule(REVIEW, { ruleId: 'developer-live-public-samplebook-fact-check' });
    expect(() => verifyDeveloperLivePolicy(unknown)).toThrow('LAUNCH_POLICY_INVALID');
    const repeated = await readPolicy();
    rulesOf(repeated).push(structuredClone(rulesOf(repeated)[DIALOGUE]!));
    expect(() => verifyDeveloperLivePolicy(repeated)).toThrow('LAUNCH_POLICY_INVALID');
    const withoutBaseline = await readPolicy();
    rulesOf(withoutBaseline).splice(BASELINE, 1);
    expect(() => verifyDeveloperLivePolicy(withoutBaseline)).toThrow('LAUNCH_POLICY_INVALID');
    const withoutBackground = await readPolicy();
    rulesOf(withoutBackground).splice(BACKGROUND, 1);
    expect(() => verifyDeveloperLivePolicy(withoutBackground)).toThrow('LAUNCH_POLICY_INVALID');
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

  it('refuses a dialogue or review reading that is not the pinned v22 bytes', async () => {
    for (const [index, block, overrides] of [
      [DIALOGUE, 'transmissions', { webSearchToolAllowed: true }],
      [DIALOGUE, 'transmissions', { automaticResendInsideStoppedSessionAllowed: true }],
      [DIALOGUE, 'transmissions', { oneBoundedPayloadPerAttempt: false }],
      [DIALOGUE, 'authorizationPreconditions', { finalProviderPayloadEgressGateRequired: false }],
      [DIALOGUE, 'authorityOrigin', { backgroundAnalysisEnrollmentAllowed: true }],
      [DIALOGUE, 'authorityOrigin', { admittedAttemptActions: ['ask', 'continue', 'regenerate', 'schedule'] }],
      [DIALOGUE, 'source', { privateManuscriptAllowed: true }],
      [DIALOGUE, 'providerBinding', { fallbackAllowed: true }],
      [REVIEW, 'transmissions', { webSearchToolAllowed: false }],
      [REVIEW, 'transmissions', { crossUnitReductionAllowed: true }],
      [REVIEW, 'source', { materialReferencesAllowed: false }],
      [REVIEW, 'source', { seriesKnowledgeAllowed: false }],
      [REVIEW, 'source', { editorialDeliverablesAllowed: false }],
      [REVIEW, 'source', { privateManuscriptAllowed: true }],
      [REVIEW, 'authorizationPreconditions', { unsetRunBudgetCeilingAllowed: true }],
      [REVIEW, 'providerBinding', { model: 'deepseek-v4-pro' }],
      [REVIEW, 'redaction', { housePeopleNamesAndRolesStripped: false }],
      [REVIEW, 'authorityOrigin', { matchingActiveDefaultExecutionRuleAllowed: false }],
      [REVIEW, 'authorityOrigin', { backgroundAnalysisEnrollmentAllowed: true }],
    ] as const) {
      await expect(v16PolicyWithBlock(index, block, overrides).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('refuses any baseline reading whose named fields are not the pinned bytes', async () => {
    // Every one of the three, falsified or made unreadable, is a policy the launch cannot read: the
    // reading is the exact bytes, never a permissive default.
    for (const key of ['crossUnitReductionAllowed', 'assuranceSamplingAllowed', 'runReportReflectionAllowed'] as const) {
      for (const value of [false, undefined, 'true', 1, null, {}, []]) {
        await expect(v16PolicyWithBlock(BASELINE, 'transmissions', { [key]: value }).then(verifyDeveloperLivePolicy))
          .rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
    }
    // Baseline analysis does not research: its web-search allowance stays `false` in v16, as in v5 to v14; an enabled flag is unreadable.
    await expect(v16PolicyWithBlock(BASELINE, 'transmissions', { webSearchToolAllowed: true }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
    // The house-people redaction rule is part of the pinned document too.
    await expect(v16PolicyWithRule(BASELINE, { redaction: undefined }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    await expect(v16PolicyWithRule(BASELINE, { redaction: { housePeopleNamesAndRolesStripped: false, remarksAndInternalNotesStripped: true, authorInformationAllowed: true, houseNameAllowed: true } }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
    // And the per-frozen-unit default is the one ADR 0070 derives, not the replaced flat 500,000.
    await expect(v16PolicyWithBlock(BASELINE, 'authorizationPreconditions', { defaultRunBudgetCeilingTokensPerFrozenUnit: 500_000 }).then(verifyDeveloperLivePolicy))
      .rejects.toThrow('LAUNCH_POLICY_INVALID');
  });

  it('denies the scopes the source checkout cannot select and any unknown scope', async () => {
    await placeValidCheckout();
    for (const scope of ['fixture-recording', 'production', 'DEVELOPER-LIVE', 'ORDINARY-PRODUCTION', '']) {
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

    // The immediate predecessor v9 is no longer the selection either.
    await placeBuiltFile('docs/policies/active-policy-set.v9.json');
    await writeFile(carrierTarget, JSON.stringify({
      ...carrier,
      activePolicySet: { version: 'v9', canonicalPath: 'docs/policies/active-policy-set.v9.json', sha256: await sha256Of('docs/policies/active-policy-set.v9.json') },
    }));
    for (const scope of ['development-ci', 'developer-live', 'ordinary-production'] as const) {
      const previous = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope);
      expect(previous.integrityState).toBe('denied');
      expectZeroTransmission(previous);
    }
  });

  it('denies a tampered active policy set whose digest no longer matches its pin, under every selectable scope', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, ...ACTIVE_SET_PATH.split('/'));
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);

    for (const scope of ['development-ci', 'developer-live', 'ordinary-production'] as const) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope);
      expect(projection.integrityState).toBe('denied');
      expect(projection.denialReason).toBe('launch-policy-integrity-denied');
      expectZeroTransmission(projection);
    }
  });

  it('denies a developer-live launch whose v22 policy bytes drifted, while development-ci still verifies', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, ...V22_PATH.split('/'));
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

describe('the rules Provider Processing v16 carries from v14 (Issues #841, #853, #863, #473)', () => {
  it('admits matching Default Execution Rules only for writing and review quick start, with no background origin on any foreground rule', async () => {
    const rules = rulesOf(await readPolicy());
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT, BACKGROUND]) {
      const expected = index === WRITING || index === REVIEW;
      expect((rules[index]!.authorityOrigin as Record<string, unknown>).matchingActiveDefaultExecutionRuleAllowed).toBe(expected);
      await expect(v16PolicyWithBlock(index, 'authorityOrigin', { matchingActiveDefaultExecutionRuleAllowed: !expected }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v16PolicyWithBlock(index, 'authorityOrigin', { backgroundAnalysisEnrollmentAllowed: true }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('names each rule\'s kinds, role, categories and book-level synthesis flag exactly', async () => {
    const reading = verifyDeveloperLivePolicy(await readPolicy());
    expect(reading.admittedRules.slice(3, 5)).toEqual([V16_CHANGED_RULES.writing, V16_CHANGED_RULES.evaluation]);
    expect(reading.admittedRules.filter((rule) => rule.crossUnitSynthesisAllowed).map((rule) => rule.taskKinds).flat())
      .toEqual(['writing', 'evaluation', 'readers-report', 'evaluation-rewrite']);
  });

  it('admits frozen Material Reference excerpts in review, writing and evaluation only, and editorial deliverables in review alone', async () => {
    const reading = verifyDeveloperLivePolicy(await readPolicy());
    const withMaterial = reading.admittedRules.filter((rule) => rule.outboundDataCategories.includes('frozen-material-reference-excerpt')).map((rule) => rule.ruleId);
    expect(withMaterial).toEqual([
      'developer-live-public-samplebook-reference-free-review',
      'developer-live-public-samplebook-writing',
      'developer-live-public-samplebook-evaluation',
    ]);
    expect(reading.admittedRules.filter((rule) => rule.outboundDataCategories.includes('editorial-deliverable-excerpt')).map((rule) => rule.ruleId))
      .toEqual(['developer-live-public-samplebook-reference-free-review']);
    // The projection carries the two source terms beside the categories (Issue #853, brief revision 2): a consumer admits a
    // material- or deliverable-bearing kind only under a rule stating the flag and listing the matching category, and the two
    // never disagree in the pinned bytes.
    // The developer-live 来源译文 rule states the flag too (it translates a frozen 资料库 excerpt of an admitted public text) but lists the
    // public category alone, so no material-bearing kind is admitted under it.
    const flagged = reading.admittedRules.filter((rule) => rule.materialReferencesAllowed).map((rule) => rule.ruleId);
    expect(flagged).toEqual([...withMaterial, TRANSLATION_RULE_ID]);
    expect(reading.admittedRules.filter((rule) => rule.editorialDeliverablesAllowed).map((rule) => rule.ruleId))
      .toEqual(['developer-live-public-samplebook-reference-free-review']);
    for (const rule of reading.admittedRules) {
      expect(rule.materialReferencesAllowed, rule.ruleId).toBe(rule.outboundDataCategories.includes('frozen-material-reference-excerpt') || rule.ruleId === TRANSLATION_RULE_ID);
      expect(rule.editorialDeliverablesAllowed, rule.ruleId).toBe(rule.outboundDataCategories.includes('editorial-deliverable-excerpt'));
    }
    for (const index of [REVIEW, WRITING, EVALUATION]) {
      // Each of the three needs its material term true; Series Knowledge is the review rule's alone (v22), refused on the other two.
      await expect(v16PolicyWithBlock(index, 'source', { materialReferencesAllowed: false }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v16PolicyWithBlock(index, 'source', { seriesKnowledgeAllowed: index === REVIEW ? false : true }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
    for (const index of [WRITING, EVALUATION]) {
      await expect(v16PolicyWithBlock(index, 'source', { materialReferenceConsumptionRecheckRequired: true }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v16PolicyWithBlock(index, 'source', { editorialDeliverablesAllowed: true }).then(verifyDeveloperLivePolicy))
        .rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
    // Neither 润色 nor conflict regeneration nor the dialogue ever carries a Material Reference.
    for (const index of [POLISH, CONFLICT]) {
      await expect(v16PolicyWithBlock(index, 'source', { materialReferencesAllowed: true }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
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
        ['transmissions', { webSearchToolAllowed: false }],
        ['source', { seriesKnowledgeAllowed: true }],
        ['source', { editorialDeliverablesAllowed: true }],
        ['source', { privateManuscriptAllowed: true }],
        ['authorizationPreconditions', { unsetRunBudgetCeilingAllowed: true }],
        ['providerBinding', { modelRole: 'Fast Interaction Role' }],
        ['providerBinding', { fallbackAllowed: true }],
      ] as const) {
        await expect(v16PolicyWithBlock(index, block, overrides).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
      // Any category beyond the declared ones, or one of another rule's, is a policy the launch cannot read.
      for (const category of ['unpublished-full-content', 'editor-selected-manuscript-excerpt', 'editorial-deliverable-excerpt']) {
        const categories = [...(rulesOf(await readPolicy())[index]!.allowedOutboundDataCategories as string[]), category];
        await expect(v16PolicyWithRule(index, { allowedOutboundDataCategories: categories }).then(verifyDeveloperLivePolicy))
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
        await expect(v16PolicyWithBlock(index, block, overrides).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      }
      await expect(v16PolicyWithRule(index, { output: undefined }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
      await expect(v16PolicyWithRule(index, { allowedTaskKinds: [index === POLISH ? 'conflict-regenerate' : 'editorial-polish'] }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('keeps the review rule free of any synthesis turn and of the house exemplar category', async () => {
    const categories = [...(rulesOf(await readPolicy())[REVIEW]!.allowedOutboundDataCategories as string[]), 'house-exemplar-excerpt'];
    await expect(v16PolicyWithRule(REVIEW, { allowedOutboundDataCategories: categories }).then(verifyDeveloperLivePolicy)).rejects.toThrow('LAUNCH_POLICY_INVALID');
    expect(V16_CHANGED_RULES.review!.crossUnitSynthesisAllowed).toBe(false);
  });
});

/** Provider Processing v19's two selectable bindings (unchanged since v13), as the document states them (the configuration the editor chooses from). */
const GO_PRODUCTION_BINDING: ConfiguredProviderBinding = { ...GO_BINDING, credentialReference: 'credential-ref-go-0001' };
const DEEPSEEK_PRODUCTION_BINDING: ConfiguredProviderBinding = {
  route: 'deepseek-open-platform',
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-flash',
  credentialSlot: 'deepseek-api-key',
  credentialReference: 'credential-ref-deepseek-0002',
};
const PRODUCTION_RULE_ID_ORDER = [
  'ordinary-production-baseline-analysis',
  'ordinary-production-editorial-dialogue',
  'ordinary-production-review',
  'ordinary-production-writing',
  'ordinary-production-evaluation',
  'ordinary-production-editorial-polish',
  'ordinary-production-conflict-regenerate',
  BACKGROUND_RULE_ID,
  'ordinary-production-material-translation',
  'ordinary-production-custom-analysis',
];

/** The eight admitted rules the projection must state for one configured binding: v18's kinds, roles, gate categories, synthesis, clarification and web flags. */
function productionAdmittedRules(binding: ConfiguredProviderBinding): AdmittedProviderRule[] {
  const routing = { route: binding.route, endpoint: binding.endpoint, model: binding.model, credentialSlot: binding.credentialSlot };
  const sourceRules = V16_ADMITTED_RULES;
  return sourceRules.map((rule, index) => ({
    ruleId: PRODUCTION_RULE_ID_ORDER[index]!,
    taskKinds: rule.taskKinds,
    modelRole: rule.modelRole,
    ...routing,
    // The 来源译文 rule carries the frozen excerpt category under production (developer-live admits public texts only).
    outboundDataCategories: [...(index === TRANSLATION ? ['frozen-material-reference-excerpt'] as const : rule.outboundDataCategories), 'unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content'],
    crossUnitSynthesisAllowed: rule.crossUnitSynthesisAllowed,
    materialReferencesAllowed: rule.materialReferencesAllowed,
    editorialDeliverablesAllowed: rule.editorialDeliverablesAllowed,
    clarificationQuestionAllowed: rule.clarificationQuestionAllowed,
    clarificationTimeoutHours: rule.clarificationTimeoutHours,
    backgroundOrigin: rule.backgroundOrigin,
    // Production admits the matching Default Execution Rule for review (审阅 快速开始) alone; writing quick start is developer-live's.
    matchingActiveDefaultExecutionRuleAllowed: index === REVIEW,
    webSearchToolAllowed: rule.webSearchToolAllowed,
    // The same backends, but under production a backend can be selected only with the editor's own key.
    platformTools: rule.platformTools === null ? null : platformToolsProjection(true),
    localTools: rule.localTools,
    sourceTranslationAllowed: rule.sourceTranslationAllowed,
  }));
}

function readPolicySync(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, ...path.split('/')), 'utf8')) as Record<string, unknown>;
}

type Mutation = { readonly path: readonly (string | number)[]; readonly kind: string; readonly apply: (policy: Record<string, unknown>) => void };

/** Every single-term tampering of the sections the v19 reading owns: a primitive changed, a key dropped or added, a list shortened. */
function productionTamperings(policy: Record<string, unknown>): Mutation[] {
  const mutations: Mutation[] = [];
  const at = (root: Record<string, unknown>, path: readonly (string | number)[]): unknown => path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root);
  const walk = (value: unknown, path: (string | number)[]): void => {
    if (Array.isArray(value)) {
      mutations.push({ path, kind: 'drop-last-item', apply: (doc) => { (at(doc, path) as unknown[]).pop(); } });
      value.forEach((item, index) => walk(item, [...path, index]));
    } else if (value !== null && typeof value === 'object') {
      mutations.push({ path, kind: 'add-unknown-term', apply: (doc) => { (at(doc, path) as Record<string, unknown>).unknownTerm = true; } });
      for (const key of Object.keys(value)) {
        mutations.push({ path: [...path, key], kind: 'drop-term', apply: (doc) => { delete (at(doc, path) as Record<string, unknown>)[key]; } });
        walk((value as Record<string, unknown>)[key], [...path, key]);
      }
    } else {
      const parent = path.slice(0, -1);
      const key = path[path.length - 1]!;
      const change = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : `${String(value)}-tampered`;
      mutations.push({ path, kind: 'change-value', apply: (doc) => { (at(doc, parent) as Record<string | number, unknown>)[key] = change; } });
    }
  };
  for (const section of ['decision', 'roleBindings', 'trustedSelection', 'credentialBoundary', 'authoritySeparations', 'outboundDataCategories']) walk(policy[section], [section]);
  // A category's Chinese label is display text, pinned by the digest rather than read: changing it is not a tampering the reading owns.
  for (let index = mutations.length - 1; index >= 0; index -= 1) {
    if (mutations[index]!.kind === 'change-value' && mutations[index]!.path[0] === 'outboundDataCategories') mutations.splice(index, 1);
  }
  // The root: no term may be dropped and none added.
  mutations.push({ path: [], kind: 'add-unknown-term', apply: (doc) => { doc.unknownTerm = true; } });
  for (const key of Object.keys(policy)) mutations.push({ path: [key], kind: 'drop-term', apply: (doc) => { delete doc[key]; } });
  for (const term of ['operationalScope', 'lifecycleStatus']) {
    mutations.push({ path: [term], kind: 'change-value', apply: (doc) => { doc[term] = `${String(doc[term])}-tampered`; } });
  }
  return mutations;
}

describe('Provider Processing v23 (ordinary-production, inherited from v19 and v21; Issues #910, #920)', () => {
  it('is the direct successor of v17: same scope, local production, default deny, the same eight rules, and the local tools on every rule', async () => {
    const v19 = await readPolicy(V19_PATH);
    const v17 = await readPolicy(V17_PATH);
    expect(v19.predecessorVersion).toBe('v17');
    expect(v19.predecessorCanonicalPath).toBe(V17_PATH);
    expect(v19.operationalScope).toBe(v17.operationalScope);
    expect(v19.operationalScope).toBe('ordinary-production');
    expect((v19.decision as { default: string }).default).toBe('deny');
    expect(rulesOf(v19).map((rule) => rule.ruleId)).toEqual(PRODUCTION_RULE_ID_ORDER.slice(0, 9));
    expect(v19.outboundDataCategories).toEqual(v17.outboundDataCategories);
    expect(v19.authorityBasis).toEqual([...(v17.authorityBasis as string[]), ADR_0026, ADR_0047]);
    expect(v19.roleBindings).toEqual(v17.roleBindings);
    expect(v19.credentialBoundary).toEqual(v17.credentialBoundary);
    expect(v19.authoritySeparations).toEqual(v17.authoritySeparations);
    expect(v19.trustedSelection).toEqual(v17.trustedSelection);
    expect(v19.outboundDataCategories).toEqual((await readPolicy(V18_PATH)).outboundDataCategories);
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT, BACKGROUND]) {
      expect(rulesOf(v19)[index], String(rulesOf(v17)[index]!.ruleId)).toEqual(withLocalTools(rulesOf(v17)[index]!, index));
    }
    // v17's own bytes are immutable and no longer the reading: no rule states the local tools.
    expect(() => verifyOrdinaryProductionPolicy(structuredClone(v17))).toThrow('LAUNCH_POLICY_INVALID');
  });

  it('states the production terms rule by rule: the editor\'s own sources, no cache, web only on the research rules, no default rule but review quick start', async () => {
    const v17 = await readPolicy(V23_PATH);
    for (const rule of rulesOf(v17)) {
      const id = rule.ruleId as string;
      const background = id === BACKGROUND_RULE_ID;
      expect(rule.policyResult, id).toBe('eligible-only');
      expect(rule.purpose, id).toBe('ordinary-production-model-processing');
      // Only the enrolled background rule runs unattended in idle time; every other rule has the editor at the computer.
      expect(rule.executionMode, id).toEqual({ humanAttended: !background, developerHostOnly: false, ciAllowed: false, hostedAllowed: false, scheduledAllowed: background, backgroundAllowed: background });
      const source = rule.source as Record<string, unknown>;
      expect(source.admittedInputs, id).toBe('user-owned-manuscripts-and-house-knowledge');
      expect(source.privateManuscriptAllowed, id).toBe(true);
      // Series Knowledge is the review rule's alone since v23.
      expect(source.seriesKnowledgeAllowed, id).toBe(id === 'ordinary-production-review');
      expect(source.editorialDeliverablesAllowed, id).toBe(id === 'ordinary-production-review');
      expect(source.materialReferencesAllowed, id).toBe(['ordinary-production-review', 'ordinary-production-writing', 'ordinary-production-evaluation', 'ordinary-production-material-translation'].includes(id));
      const origin = rule.authorityOrigin as Record<string, unknown>;
      // Review alone admits its matching active Default Execution Rule (审阅 快速开始); the Task must still be newly user-initiated.
      expect(origin.matchingActiveDefaultExecutionRuleAllowed, id).toBe(id === 'ordinary-production-review');
      if (background) {
        expect(origin.activeMatchingBackgroundAnalysisEnrollmentRequired).toBe(true);
        expect(origin.newUserInitiatedTaskRequired).toBe(false);
        expect(origin.eachDispatchCreatesExactRun).toBe(true);
        expect(origin.backgroundAnalysisEnrollmentAllowed).toBeUndefined();
      } else {
        expect(origin.backgroundAnalysisEnrollmentAllowed, id).toBe(false);
        expect(origin.idleScheduledImportTriggeredOrCrossRunDispatchAllowed, id).toBe(false);
      }
      const transmissions = rule.transmissions as Record<string, unknown>;
      expect(transmissions.webSearchToolAllowed, id).toBe(PRODUCTION_RESEARCH_IDS.includes(id));
      expect(rule.platformTools === undefined, id).toBe(!PRODUCTION_RESEARCH_IDS.includes(id));
      expect(transmissions.identicalRequestReplaysFromProviderResultCache, id).toBe(false);
      expect(transmissions.repeatedTestItemIdentifierAllowed, id).toBeUndefined();
      expect(rule.capture, id).toEqual({ fixtureEmissionAllowed: false, uploadAllowed: false, providerResultCacheAllowed: false, rawBytesInLogsDiagnosticsOrRepositoryAllowed: false, developmentCredentialCacheAndLedgerConsulted: false });
      expect(rule.providerAccountLimit, id).toMatchObject({ classification: 'quota-exhausted', retryAllowed: false, fallbackAllowed: false, secondModelAllowed: false });
      expect(rule.redaction, id).toEqual({ housePeopleNamesAndRolesStripped: true, remarksAndInternalNotesStripped: true, authorInformationAllowed: true, houseNameAllowed: true });
      expect(rule.allowedOutboundDataCategories as string[], id).toEqual(expect.arrayContaining(['unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content']));
      expect(rule.providerBinding, id).toMatchObject({
        bindingSource: 'user-configured-role-binding',
        allowedRoutes: ['opencode-go', 'deepseek-open-platform'],
        exactProviderBindingRequired: true,
        fallbackAllowed: false,
        secondModelAllowed: false,
      });
      expect((rule.providerBinding as Record<string, unknown>).route).toBeUndefined();
      expect((rule.providerBinding as Record<string, unknown>).model).toBeUndefined();
    }
    // A planned foreground Run may leave its ceiling unset; when applied the default is 30,000 tokens per frozen unit (v6 semantics).
    for (const index of [BASELINE, REVIEW, WRITING, EVALUATION]) {
      expect(rulesOf(v17)[index]!.authorizationPreconditions).toMatchObject({ unsetRunBudgetCeilingAllowed: true, defaultRunBudgetCeilingTokensPerFrozenUnit: 30_000 });
    }
    // The enrolled background Run may not: its ceiling is the enrollment's, mandatory, split equally, within capacity minus one slots.
    expect(rulesOf(v17)[BACKGROUND]!.authorizationPreconditions).toMatchObject({
      unsetRunBudgetCeilingAllowed: false, enrollmentCeilingRequired: true, ceilingSplitAcrossBooks: 'equal-remainder-to-first', backgroundSlotShare: 'capacity-minus-one',
    });
    // 出版政策与风险 is named by no rule; cross-deliverable consistency, 事实核查, 学术道德与引用 and, since v23, 书系一致性 are review kinds.
    const kinds = rulesOf(v17).flatMap((rule) => rule.allowedTaskKinds as string[]);
    expect(kinds).toContain('editorial-review/cross-deliverable-consistency');
    for (const kind of WEB_REVIEW_KINDS) expect(rulesOf(v17)[REVIEW]!.allowedTaskKinds).toContain(kind);
    for (const refused of ['editorial-review/publication-risk', 'fact-check']) {
      expect(kinds).not.toContain(refused);
    }
  });

  it('binds the four roles as the Owner decided: Main Editorial and Fast Interaction configurable among two routes, the rest unbound', async () => {
    const roles = (await readPolicy(V23_PATH)).roleBindings as Record<string, Record<string, unknown>>;
    const allowedBindings = [
      { route: 'opencode-go', endpoint: 'https://opencode.ai/zen/go/v1/chat/completions', model: 'deepseek-v4.1-flash', credentialSlot: 'opencode-go' },
      { route: 'deepseek-open-platform', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', credentialSlot: 'deepseek-api-key' },
    ];
    for (const role of ['Main Editorial Role', 'Fast Interaction Role']) {
      expect(roles[role]).toEqual({
        bindingState: 'user-configurable', userConfigurable: true, defaultBinding: 'opencode-go', allowedBindings,
        userConfiguredBindingAuthorizesTransmission: false, fallbackAllowed: false,
      });
    }
    for (const role of ['Difficult Escalation Role', 'Frontier Model Role']) {
      expect(roles[role]).toEqual({
        bindingState: 'unbound-by-default', userConfigurable: true, namedByAnyAllowRule: false, allowedBindings,
        userConfiguredBindingAuthorizesTransmission: false, fallbackAllowed: false,
      });
    }
  });

  it('reads the exact v23 bytes without a binding: ten rules, the policy\'s two bindings, nothing filled in', async () => {
    const reading = verifyOrdinaryProductionPolicy(await readPolicy(V23_PATH));
    expect(reading.rules.map((rule) => rule.ruleId)).toEqual(PRODUCTION_RULE_ID_ORDER);
    expect(reading.allowedBindings.map((binding) => binding.route)).toEqual(['opencode-go', 'deepseek-open-platform']);
    expect(reading).toMatchObject({ crossUnitReductionAllowed: true, assuranceSamplingAllowed: true, runReportReflectionAllowed: true });
  });

  it('fails closed on any single tampered, missing or unknown term (a changed value, a dropped term, an added term, a shorter list)', async () => {
    const pristine = await readPolicy(V23_PATH);
    const mutations = productionTamperings(pristine);
    expect(mutations.length).toBeGreaterThan(500);
    const survivors: string[] = [];
    for (const mutation of mutations) {
      const tampered = structuredClone(pristine);
      mutation.apply(tampered);
      try {
        verifyOrdinaryProductionPolicy(tampered);
        survivors.push(`${mutation.kind} ${mutation.path.join('.')}`);
      } catch (error) {
        expect((error as Error).message).toBe('LAUNCH_POLICY_INVALID');
      }
    }
    expect(survivors).toEqual([]);
  });

  it('refuses an unknown, repeated or missing rule and a rule that names a role the policy leaves unbound', async () => {
    const unknown = await readPolicy(V23_PATH);
    rulesOf(unknown)[REVIEW]!.ruleId = 'ordinary-production-fact-check';
    expect(() => verifyOrdinaryProductionPolicy(unknown)).toThrow('LAUNCH_POLICY_INVALID');
    const repeated = await readPolicy(V23_PATH);
    rulesOf(repeated).push(structuredClone(rulesOf(repeated)[DIALOGUE]!));
    expect(() => verifyOrdinaryProductionPolicy(repeated)).toThrow('LAUNCH_POLICY_INVALID');
    const missing = await readPolicy(V23_PATH);
    rulesOf(missing).splice(WRITING, 1);
    expect(() => verifyOrdinaryProductionPolicy(missing)).toThrow('LAUNCH_POLICY_INVALID');
    const background = await readPolicy(V23_PATH);
    rulesOf(background).splice(BACKGROUND, 1);
    expect(() => verifyOrdinaryProductionPolicy(background)).toThrow('LAUNCH_POLICY_INVALID');
    const baselineAsBackground = await readPolicy(V23_PATH);
    rulesOf(baselineAsBackground)[BACKGROUND] = { ...structuredClone(rulesOf(baselineAsBackground)[BASELINE]!), ruleId: BACKGROUND_RULE_ID };
    expect(() => verifyOrdinaryProductionPolicy(baselineAsBackground)).toThrow('LAUNCH_POLICY_INVALID');
    for (const modelRole of ['Difficult Escalation Role', 'Frontier Model Role']) {
      const escalated = await readPolicy(V23_PATH);
      const binding = rulesOf(escalated)[DIALOGUE]!.providerBinding as Record<string, unknown>;
      binding.modelRole = modelRole;
      expect(() => verifyOrdinaryProductionPolicy(escalated)).toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('does not read the developer-live document as ordinary production, nor this document as developer-live', async () => {
    expect(() => verifyOrdinaryProductionPolicy(readPolicySync(V22_PATH))).toThrow('LAUNCH_POLICY_INVALID');
    expect(() => verifyDeveloperLivePolicy(readPolicySync(V23_PATH))).toThrow('LAUNCH_POLICY_INVALID');
  });

  it('reports setup-required with no admitted rule while no binding is configured', async () => {
    await placeValidCheckout();
    for (const absent of [undefined, null] as const) {
      const projection = absent === undefined
        ? await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production')
        : await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', absent);
      expect(projection.integrityState).toBe('verified');
      expect(projection.denialReason).toBeNull();
      expect(projection.operationalScope).toBe('ordinary-production');
      expect(projection.activePolicySetVersion).toBe('v15');
      expect(projection.providerProcessing).toEqual({
        version: 'v23',
        decision: 'eligible-only',
        authorizedLiveTransmissionCount: 'bounded-by-run',
        liveTransmissionAllowed: false,
        crossUnitReductionAllowed: true,
        assuranceSamplingAllowed: true,
        runReportReflectionAllowed: true,
        admittedRules: [],
        bindingState: 'setup-required',
        label: '本机生产：需先设置模型服务，当前不会传输',
      });
      expect(projection.externalExport.version).toBe('v2');
      expect(projection.publicReleasePermission.present).toBe(false);
    }
  });

  it.each([
    ['the Go route', GO_PRODUCTION_BINDING],
    ['the official DeepSeek route', DEEPSEEK_PRODUCTION_BINDING],
  ])('fills every admitted rule from the configured binding on %s, for both bound roles', async (_name, binding) => {
    await placeValidCheckout();
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', binding);
    expect(projection.integrityState).toBe('verified');
    expect(projection.operationalScope).toBe('ordinary-production');
    expect(projection.providerProcessing).toEqual({
      version: 'v23',
      decision: 'eligible-only',
      authorizedLiveTransmissionCount: 'bounded-by-run',
      liveTransmissionAllowed: true,
      crossUnitReductionAllowed: true,
      assuranceSamplingAllowed: true,
      runReportReflectionAllowed: true,
      admittedRules: productionAdmittedRules(binding),
      bindingState: 'configured',
      label: '本机生产：实时传输受运行边界约束',
    });
    expect(projection.providerProcessing.admittedRules).toHaveLength(10);
    // The two source flags agree with the categories here too: material in review, writing, evaluation and 来源译文; deliverables in review.
    expect(projection.providerProcessing.admittedRules.filter((rule) => rule.materialReferencesAllowed).map((rule) => rule.ruleId))
      .toEqual(['ordinary-production-review', 'ordinary-production-writing', 'ordinary-production-evaluation', 'ordinary-production-material-translation']);
    expect(projection.providerProcessing.admittedRules.filter((rule) => rule.editorialDeliverablesAllowed).map((rule) => rule.ruleId))
      .toEqual(['ordinary-production-review']);
    for (const rule of projection.providerProcessing.admittedRules) {
      expect(rule.materialReferencesAllowed, rule.ruleId).toBe(rule.outboundDataCategories.includes('frozen-material-reference-excerpt'));
      expect(rule.editorialDeliverablesAllowed, rule.ruleId).toBe(rule.outboundDataCategories.includes('editorial-deliverable-excerpt'));
    }
    // One binding serves the Main Editorial and the Fast Interaction rules alike; the credential reference never enters the projection.
    expect(new Set(projection.providerProcessing.admittedRules.map((rule) => `${rule.route}|${rule.endpoint}|${rule.model}|${rule.credentialSlot}`)).size).toBe(1);
    expect(JSON.stringify(projection)).not.toContain(binding.credentialReference);
    // Production admission must retain every policy category, including all three unpublished classes.
    const policyRules = rulesOf(await readPolicy(V23_PATH));
    for (const rule of projection.providerProcessing.admittedRules) {
      expect(rule.outboundDataCategories, rule.ruleId).toEqual(policyRules.find((candidate) => candidate.ruleId === rule.ruleId)!.allowedOutboundDataCategories);
    }
  });

  it('denies a binding the policy does not allow, a malformed one, or one with another route\'s slot, as binding-not-allowed', async () => {
    await placeValidCheckout();
    const other = [
      { ...GO_PRODUCTION_BINDING, model: 'deepseek-v4-pro' },
      { ...GO_PRODUCTION_BINDING, endpoint: 'https://example.invalid/v1/chat/completions' },
      { ...GO_PRODUCTION_BINDING, route: 'some-other-route' },
      { ...GO_PRODUCTION_BINDING, credentialSlot: 'deepseek-api-key' },
      { ...DEEPSEEK_PRODUCTION_BINDING, credentialSlot: 'opencode-go' },
      { ...GO_PRODUCTION_BINDING, credentialReference: '' },
      { ...GO_PRODUCTION_BINDING, extra: 'term' },
      { route: GO_BINDING.route, endpoint: GO_BINDING.endpoint, model: GO_BINDING.model, credentialSlot: GO_BINDING.credentialSlot },
    ] as unknown as ConfiguredProviderBinding[];
    for (const binding of other) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', binding);
      expect(projection.integrityState, JSON.stringify(binding)).toBe('denied');
      expect(projection.denialReason).toBe('binding-not-allowed');
      expect(projection.operationalScope).toBeNull();
      expectZeroTransmission(projection);
    }
    const reading = verifyOrdinaryProductionPolicy(await readPolicy(V23_PATH));
    expect(bindOrdinaryProductionRules(reading, { ...GO_PRODUCTION_BINDING, model: 'x' })).toBeNull();
    expect(bindOrdinaryProductionRules(reading, GO_PRODUCTION_BINDING)).toEqual(productionAdmittedRules(GO_PRODUCTION_BINDING));
  });

  it('reads a configured binding under ordinary-production only: developer-live and development-ci ignore it', async () => {
    await placeValidCheckout();
    for (const scope of ['development-ci', 'developer-live'] as const) {
      expect(await resolveSourceCheckoutLaunchPolicy(codeRoot, scope, DEEPSEEK_PRODUCTION_BINDING)).toEqual(await resolveSourceCheckoutLaunchPolicy(codeRoot, scope));
    }
  });

  it('denies an ordinary-production launch whose v23 bytes drifted, under any binding, while the other scopes still verify', async () => {
    await placeValidCheckout();
    const target = join(codeRoot, ...V23_PATH.split('/'));
    await writeFile(target, `${await readFile(target, 'utf8')}\n`);
    for (const binding of [null, GO_PRODUCTION_BINDING]) {
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', binding);
      expect(projection.integrityState).toBe('denied');
      expect(projection.denialReason).toBe('launch-policy-integrity-denied');
      expectZeroTransmission(projection);
    }
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).integrityState).toBe('verified');
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live')).integrityState).toBe('verified');
  });

  it('selects ordinary-production only through the launch argument: nothing reaches it by default, and a carrier that does not list it denies', async () => {
    await placeValidCheckout();
    // No argument: the launch form and the resolver both default to development-ci.
    expect(parseTrustedLaunchForm({})?.trustedOperationalScope).toBe('development-ci');
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).operationalScope).toBe('development-ci');
    // The explicit argument is the only selector, and it carries none of the developer-live launch facts.
    expect(parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production' })).toEqual({
      trustedOperationalScope: 'ordinary-production', runBudgetCeiling: null, providerCacheRoot: null, validation: null,
    });
    for (const extra of [{ runBudgetCeiling: '500000' }, { providerCacheRoot: '/tmp/cache' }, { validationCase: 'baseline-analysis/sample1' }, { validationDelta: 'input:edited-chapter-dialogue' }]) {
      expect(parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production', ...extra })).toBeNull();
    }
    // A carrier that stops listing the scope makes it unselectable again (and a carrier whose list differs from the source is unreadable).
    const carrierTarget = join(codeRoot, ...CARRIER_PATH.split('/'));
    const carrier = JSON.parse(await readFile(carrierTarget, 'utf8')) as Record<string, unknown>;
    await writeFile(carrierTarget, JSON.stringify({ ...carrier, launchSelectableScopes: ['development-ci', 'developer-live'] }));
    const unlisted = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', GO_PRODUCTION_BINDING);
    expect(unlisted.integrityState).toBe('denied');
    expectZeroTransmission(unlisted);
  });
});

const CLARIFICATION_ASKS = { modelQuestionAllowed: true, maxQuestionsPerUnit: 1, unitWaitsOthersContinue: true, timeoutHours: 24, timeoutContinuesAs: 'unanswered-with-run-report-disclosure' };
const RUN_BASED = [BASELINE, REVIEW, WRITING, EVALUATION, BACKGROUND, CUSTOM];

describe('Provider Processing v22 and v23: enrolled background analysis and model-initiated clarification (Issue #863)', () => {
  const documents = [
    ['v22 (developer-live)', V22_PATH, (policy: Record<string, unknown>) => verifyDeveloperLivePolicy(policy)],
    ['v23 (ordinary-production)', V23_PATH, (policy: Record<string, unknown>) => verifyOrdinaryProductionPolicy(policy)],
  ] as const;
  const flip = (value: unknown): unknown => (typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : `${String(value)}-tampered`);

  /** Every single-term tampering of one named block of one rule: each value changed, each term dropped, one unknown term added. */
  async function blockTamperings(path: string, index: number, block: string): Promise<Array<{ label: string; policy: Record<string, unknown> }>> {
    const keys = Object.keys(rulesOf(await readPolicy(path))[index]![block] as Record<string, unknown>);
    const out: Array<{ label: string; policy: Record<string, unknown> }> = [];
    for (const key of keys) {
      for (const kind of ['change', 'drop'] as const) {
        const policy = await readPolicy(path);
        const target = rulesOf(policy)[index]![block] as Record<string, unknown>;
        if (kind === 'change') target[key] = flip(target[key]); else delete target[key];
        out.push({ label: `${kind} ${index}.${block}.${key}`, policy });
      }
    }
    const added = await readPolicy(path);
    (rulesOf(added)[index]![block] as Record<string, unknown>).unknownTerm = true;
    out.push({ label: `add ${index}.${block}.unknownTerm`, policy: added });
    return out;
  }

  it.each(documents)('%s names the enrolled background rule: baseline analysis only, an active enrollment, one exact Run per dispatch', async (_name, path) => {
    const rules = rulesOf(await readPolicy(path));
    expect(rules).toHaveLength(10);
    const rule = rules[BACKGROUND]!;
    expect(rule.ruleId).toBe(BACKGROUND_RULE_ID);
    expect(rule.allowedTaskKinds).toEqual(['baseline-manuscript-analysis']);
    expect(rule.authorityOrigin).toEqual({
      activeMatchingBackgroundAnalysisEnrollmentRequired: true,
      newUserInitiatedTaskRequired: false,
      providerSetupCreatesEnrollment: false,
      manuscriptImportCreatesEnrollment: false,
      artifactInstallOrEnablementCreatesEnrollment: false,
      eachDispatchCreatesExactRun: true,
      matchingActiveDefaultExecutionRuleAllowed: false,
      importTriggeredOrUnenrolledCrossRunDispatchAllowed: false,
    });
    expect(rule.scopeLimits).toEqual({
      manuscriptAnalysisOnly: true,
      formalManuscriptMutationAllowed: false,
      externalEffectAllowed: false,
      generalBackgroundLearningAllowed: false,
      backgroundPolicyWorkAllowed: false,
    });
    expect(rule.executionMode).toMatchObject({ scheduledAllowed: true, backgroundAllowed: true, ciAllowed: false, hostedAllowed: false });
  });

  it.each(documents)('%s makes the enrollment ceiling mandatory, split equally with the remainder to the first Book, within capacity minus one slots', async (_name, path) => {
    const rules = rulesOf(await readPolicy(path));
    expect(rules[BACKGROUND]!.authorizationPreconditions).toMatchObject({
      exactRunBudgetCeilingStateRequired: true,
      unsetRunBudgetCeilingAllowed: false,
      enrollmentCeilingRequired: true,
      ceilingSplitAcrossBooks: 'equal-remainder-to-first',
      backgroundSlotShare: 'capacity-minus-one',
      ceilingEvaluatedBeforeEveryDispatch: true,
    });
    // The enrollment's tokens ceiling is the Run's ceiling; the foreground per-unit default does not apply to it.
    expect(rules[BACKGROUND]!.authorizationPreconditions).not.toHaveProperty('defaultRunBudgetCeilingTokensPerFrozenUnit');
    // The baseline analysis rule is untouched by this: it still refuses the background origin, and no other rule is background.
    expect((rules[BASELINE]!.authorityOrigin as Record<string, unknown>).backgroundAnalysisEnrollmentAllowed).toBe(false);
    for (const [index, rule] of rules.entries()) {
      if (index === BACKGROUND) continue;
      expect(rule.executionMode, String(rule.ruleId)).toMatchObject({ scheduledAllowed: false, backgroundAllowed: false });
      expect((rule.authorizationPreconditions as Record<string, unknown>).enrollmentCeilingRequired, String(rule.ruleId)).toBeUndefined();
    }
  });

  it.each(documents)('%s fails closed on any changed, dropped or added term of the background rule\'s origin, limits, mode and ceiling', async (_name, path, verify) => {
    const survivors: string[] = [];
    for (const block of ['authorityOrigin', 'scopeLimits', 'executionMode', 'authorizationPreconditions']) {
      for (const { label, policy } of await blockTamperings(path, BACKGROUND, block)) {
        try {
          verify(policy);
          survivors.push(label);
        } catch (error) {
          expect((error as Error).message).toBe('LAUNCH_POLICY_INVALID');
        }
      }
    }
    expect(survivors).toEqual([]);
    // Naming the ceiling's split or share any other way, or widening the kinds, is equally unreadable.
    for (const overrides of [
      { ceilingSplitAcrossBooks: 'proportional' }, { backgroundSlotShare: 'capacity' }, { backgroundSlotShare: 'capacity-minus-two' },
      { unsetRunBudgetCeilingAllowed: true }, { enrollmentCeilingRequired: false },
    ]) {
      const policy = await readPolicy(path);
      Object.assign(rulesOf(policy)[BACKGROUND]!.authorizationPreconditions as Record<string, unknown>, overrides);
      expect(() => verify(policy), JSON.stringify(overrides)).toThrow('LAUNCH_POLICY_INVALID');
    }
    for (const kinds of [['baseline-manuscript-analysis', 'editorial-review/typos-and-usage'], ['writing'], []]) {
      const policy = await readPolicy(path);
      rulesOf(policy)[BACKGROUND]!.allowedTaskKinds = kinds;
      expect(() => verify(policy), kinds.join()).toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it.each(documents)('%s refuses a foreground rule that gains a background or scheduled origin', async (_name, path, verify) => {
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT]) {
      for (const overrides of [{ backgroundAllowed: true }, { scheduledAllowed: true }]) {
        const policy = await readPolicy(path);
        Object.assign(rulesOf(policy)[index]!.executionMode as Record<string, unknown>, overrides);
        expect(() => verify(policy), `${index} ${JSON.stringify(overrides)}`).toThrow('LAUNCH_POLICY_INVALID');
      }
    }
  });

  it.each(documents)('%s lets the model ask one question per unit on every Run-based rule and none on the foreground rules', async (_name, path) => {
    const rules = rulesOf(await readPolicy(path));
    for (const [index, rule] of rules.entries()) {
      const asks = RUN_BASED.includes(index);
      const transmissions = rule.transmissions as Record<string, unknown>;
      expect(rule.clarification, String(rule.ruleId)).toEqual(asks ? CLARIFICATION_ASKS : { modelQuestionAllowed: false });
      expect(transmissions.plusClarificationAnswerTurns, String(rule.ruleId)).toBe(asks ? true : undefined);
    }
  });

  it.each(documents)('%s fails closed on any tampered clarification term, answer-turn term or question on a foreground rule', async (_name, path, verify) => {
    const survivors: string[] = [];
    const attempt = (label: string, policy: Record<string, unknown>): void => {
      try {
        verify(policy);
        survivors.push(label);
      } catch (error) {
        expect((error as Error).message).toBe('LAUNCH_POLICY_INVALID');
      }
    };
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT, BACKGROUND]) {
      for (const { label, policy } of await blockTamperings(path, index, 'clarification')) attempt(label, policy);
      const dropped = await readPolicy(path);
      delete rulesOf(dropped)[index]!.clarification;
      attempt(`drop ${index}.clarification`, dropped);
      const turn = await readPolicy(path);
      const transmissions = rulesOf(turn)[index]!.transmissions as Record<string, unknown>;
      if (RUN_BASED.includes(index)) delete transmissions.plusClarificationAnswerTurns; else transmissions.plusClarificationAnswerTurns = true;
      attempt(`flip-presence ${index}.plusClarificationAnswerTurns`, turn);
      if (RUN_BASED.includes(index)) {
        const off = await readPolicy(path);
        (rulesOf(off)[index]!.transmissions as Record<string, unknown>).plusClarificationAnswerTurns = false;
        attempt(`false ${index}.plusClarificationAnswerTurns`, off);
      } else {
        // A foreground answer is never interrupted by a model question.
        const asks = await readPolicy(path);
        rulesOf(asks)[index]!.clarification = { ...CLARIFICATION_ASKS };
        attempt(`ask ${index}.clarification`, asks);
      }
    }
    expect(survivors).toEqual([]);
  });

  it('projects the clarification fields and the background origin on every admitted rule of both scopes', async () => {
    await placeValidCheckout();
    const expected = V16_ADMITTED_RULES.map((rule) => [rule.clarificationQuestionAllowed, rule.clarificationTimeoutHours, rule.backgroundOrigin]);
    const developerLive = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live');
    const production = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', GO_PRODUCTION_BINDING);
    for (const [projection, ids] of [[developerLive, V16_ADMITTED_RULES.map((rule) => rule.ruleId)], [production, PRODUCTION_RULE_ID_ORDER]] as const) {
      const rules = projection.providerProcessing.admittedRules;
      expect(rules.map((rule) => rule.ruleId)).toEqual(ids);
      expect(rules.map((rule) => [rule.clarificationQuestionAllowed, rule.clarificationTimeoutHours, rule.backgroundOrigin])).toEqual(expected);
      // The default-execution-rule origin is projected from each rule's own authorityOrigin: review in both scopes, writing in developer-live only.
      expect(rules.filter((rule) => rule.matchingActiveDefaultExecutionRuleAllowed).map((rule) => rule.taskKinds[0]))
        .toEqual(projection === developerLive ? ['editorial-review/typos-and-usage', 'writing'] : ['editorial-review/typos-and-usage']);
      expect(rules.find((rule) => rule.backgroundOrigin)!.matchingActiveDefaultExecutionRuleAllowed).toBe(false);
      // Only the enrolled background rule has the background origin, and it lists its kind truthfully.
      expect(rules.filter((rule) => rule.backgroundOrigin).map((rule) => [rule.ruleId, rule.taskKinds])).toEqual([[BACKGROUND_RULE_ID, ['baseline-manuscript-analysis']]]);
      // The question and its timeout go together: a rule that allows no question carries no timeout.
      for (const rule of rules) expect(rule.clarificationTimeoutHours === null, rule.ruleId).toBe(!rule.clarificationQuestionAllowed);
      expect(rules.filter((rule) => rule.clarificationQuestionAllowed).map((rule) => rule.taskKinds).flat()).toEqual([
        'baseline-manuscript-analysis',
        'editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression', 'editorial-review/cross-deliverable-consistency',
        ...WEB_REVIEW_KINDS, SERIES_REVIEW_KIND,
        'writing', 'evaluation', 'readers-report', 'evaluation-rewrite',
        'baseline-manuscript-analysis',
        'custom-analysis/*',
      ]);
    }
    // Development-ci admits no rule at all, so nothing there can ask or run in the background.
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).providerProcessing.admittedRules).toEqual([]);
  });
});

describe('Provider Processing v22 and v23: platform tools on the research rules (Issue #473, slice 6d)', () => {
  it.each([
    ['developer-live', 'v14', V14_PATH, 'developer-live-public-samplebook-reference-free-review'],
    ['ordinary-production', 'v15', V15_PATH, 'ordinary-production-review'],
  ] as const)('resolves the factual-review executor under %s and refuses its predecessor (%s)', async (scope, version, predecessorPath, ruleId) => {
    await placeValidCheckout();
    const policy = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope, scope === 'ordinary-production' ? GO_PRODUCTION_BINDING : null);
    expect(policy.integrityState).toBe('verified');
    const review = liveKindRule(policy, FACTUAL_REVIEW_KIND, ['public-or-synthetic']);
    expect(review?.ruleId).toBe(ruleId);
    expect(review?.webSearchToolAllowed).toBe(true);
    expect(review?.platformTools).not.toBeNull();
    expect(liveKindRule(policy, 'editorial-review/academic-integrity')?.ruleId).toBe(ruleId);
    expect(liveKindRule(policy, 'editorial-review/publication-risk')).toBeNull();
    expect(liveKindRule(policy, 'publication-risk')).toBeNull();

    // Reconstruct the predecessor's kind/category projection from its immutable bytes, keeping the same binding and origins.
    // Merely changing a version label would not exercise liveKindRule's exact kind lookup.
    const predecessorRules = rulesOf(readPolicySync(predecessorPath));
    const predecessor: LaunchPolicyProjection = { ...policy, providerProcessing: { ...policy.providerProcessing, version,
      admittedRules: policy.providerProcessing.admittedRules.filter((rule) => predecessorRules.some((candidate) => candidate.ruleId === rule.ruleId)).map((rule) => {
        const prior = predecessorRules.find((candidate) => candidate.ruleId === rule.ruleId)!;
        return { ...rule, taskKinds: prior.allowedTaskKinds as string[],
          outboundDataCategories: prior.allowedOutboundDataCategories as AdmittedProviderRule['outboundDataCategories'],
          webSearchToolAllowed: false, platformTools: null };
      }),
    } };
    expect(liveKindRule(predecessor, FACTUAL_REVIEW_KIND, ['public-or-synthetic'])).toBeNull();
    expect(liveKindRule(predecessor, 'editorial-review/factual-review')).toBeNull();
    expect(liveKindRule(predecessor, 'editorial-review/academic-integrity')).toBeNull();
  });

  const documents = [
    ['v22 (developer-live)', V22_PATH, false, (policy: Record<string, unknown>) => verifyDeveloperLivePolicy(policy).admittedRules],
    ['v23 (ordinary-production)', V23_PATH, true, (policy: Record<string, unknown>) => bindOrdinaryProductionRules(verifyOrdinaryProductionPolicy(policy), GO_PRODUCTION_BINDING)],
  ] as const;
  const shipped = SEARCH_BACKENDS.filter((entry) => entry.shipped);

  it('lists exactly the registry\'s shipped backends, in its ranking order, with the hosts and endpoints their documents declare', () => {
    // The recorded evaluation ships all five; TinyFish is the default (rank 1).
    expect(shipped.map((entry) => entry.id)).toEqual(SHIPPED_BACKENDS.map((backend) => backend.id));
    expect(shipped.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5]);
    for (const [, path, production] of documents) {
      for (const [index, rule] of rulesOf(readPolicySync(path)).entries()) {
        const transmissions = rule.transmissions as Record<string, unknown>;
        expect(transmissions.webSearchToolAllowed, `${path} ${index}`).toBe(RESEARCH.includes(index));
        if (!RESEARCH.includes(index)) {
          expect(rule.platformTools, `${path} ${index}`).toBeUndefined();
          continue;
        }
        const block = rule.platformTools as { websearch: Record<string, unknown> & { backends: Array<Record<string, unknown>> } } & Record<string, unknown>;
        expect(block.websearch.selection).toBe('user-configured');
        expect(block.websearch.backends.map((backend) => [backend.id, backend.host, backend.endpoint, backend.credentialSlot, backend.anonymous]))
          .toEqual(shipped.map((entry) => [entry.id, entry.host, entry.endpoint, entry.credentialSlot, false]));
        expect(block.websearch.backends.every((backend) => (backend.developmentCredentialReference === undefined) === production)).toBe(true);
        expect(block.websearch.selectionRequiresCredential).toBe(production ? true : undefined);
        expect(block.websearch.userConfiguredBackendAuthorizesTransmission).toBe(production ? false : undefined);
        expect(block.webfetch).toEqual({ maxBytes: 5_242_880, timeoutSeconds: 30, boundedByCitations: true });
        expect(block.breaker).toEqual({ roundTrips: 128, end: '联网核查未完成' });
        expect(block.oneQueryPerRunUnit).toBe(true);
        expect(block.toolResultCategory).toBe('public-or-synthetic');
        expect(rule.allowedOutboundDataCategories).toEqual(expect.arrayContaining([...WEB_CATEGORIES]));
      }
    }
  });

  it.each(documents)('%s projects the web switch and platform tools on exactly the three research rules', (_name, path, production, read) => {
    const rules = read(readPolicySync(path))!;
    expect(rules.map((rule) => rule.webSearchToolAllowed)).toEqual([false, false, true, true, true, false, false, false, false, false]);
    for (const rule of rules) {
      expect(rule.platformTools, rule.ruleId).toEqual(rule.webSearchToolAllowed ? platformToolsProjection(production) : null);
    }
    // The development Credential References never reach the projection; only id, host and slot do.
    expect(JSON.stringify(rules)).not.toMatch(/developmentCredentialReference|[0-9a-f]{8}-[0-9a-f]{4}-/u);
  });

  it.each(documents)('%s fails closed on any changed, dropped or added term of any research rule\'s platform tools block', (_name, path, _production, read) => {
    const pristine = readPolicySync(path);
    const survivors: string[] = [];
    const at = (root: unknown, keys: readonly (string | number)[]): unknown => keys.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root);
    const attempt = (label: string, mutate: (block: unknown) => void, index: number): void => {
      const policy = structuredClone(pristine);
      mutate(rulesOf(policy)[index]!.platformTools);
      try {
        read(policy);
        survivors.push(`${index} ${label}`);
      } catch (error) {
        expect((error as Error).message).toBe('LAUNCH_POLICY_INVALID');
      }
    };
    let tamperings = 0;
    for (const index of RESEARCH) {
      const walk = (value: unknown, keys: (string | number)[]): void => {
        tamperings += 1;
        if (Array.isArray(value)) {
          attempt(`drop-last ${keys.join('.')}`, (block) => { (at(block, keys) as unknown[]).pop(); }, index);
          attempt(`reverse ${keys.join('.')}`, (block) => { (at(block, keys) as unknown[]).reverse(); }, index);
          value.forEach((item, position) => walk(item, [...keys, position]));
        } else if (value !== null && typeof value === 'object') {
          attempt(`add ${keys.join('.')}`, (block) => { (at(block, keys) as Record<string, unknown>).unknownTerm = true; }, index);
          for (const key of Object.keys(value)) {
            attempt(`drop ${[...keys, key].join('.')}`, (block) => { delete (at(block, keys) as Record<string, unknown>)[key]; }, index);
            walk((value as Record<string, unknown>)[key], [...keys, key]);
          }
        } else {
          const parent = keys.slice(0, -1);
          const key = keys[keys.length - 1]!;
          const changed = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : `${String(value)}x`;
          attempt(`change ${keys.join('.')}`, (block) => { (at(block, parent) as Record<string | number, unknown>)[key] = changed; }, index);
        }
      };
      walk(rulesOf(pristine)[index]!.platformTools, []);
    }
    expect(tamperings).toBeGreaterThan(100);
    expect(survivors).toEqual([]);
  });

  it.each(documents)('%s refuses a backend outside the shipped set, the switch without the block, and a block on a rule that does not research', (_name, path, _production, read) => {
    const refuse = (mutate: (policy: Record<string, unknown>) => void, label: string): void => {
      const policy = structuredClone(readPolicySync(path));
      mutate(policy);
      expect(() => read(policy), label).toThrow('LAUNCH_POLICY_INVALID');
    };
    const backendsOf = (policy: Record<string, unknown>, index: number): Array<Record<string, unknown>> =>
      (rulesOf(policy)[index]!.platformTools as { websearch: { backends: Array<Record<string, unknown>> } }).websearch.backends;
    // A host outside the shipped set, even with a consistent endpoint.
    refuse((policy) => { Object.assign(backendsOf(policy, REVIEW)[4]!, { host: 'search.example.com', endpoint: 'https://search.example.com/v1/web-search' }); }, 'foreign host');
    // A sixth, unshipped backend, or one of the five dropped or reordered.
    refuse((policy) => {
      backendsOf(policy, WRITING).push({ ...backendsOf(policy, WRITING)[0]!, id: 'search-kimi', host: 'api.moonshot.cn', endpoint: 'https://api.moonshot.cn/v1/search', credentialSlot: 'search-kimi' });
    }, 'extra backend');
    refuse((policy) => { backendsOf(policy, EVALUATION).splice(0, 1); }, 'dropped default');
    refuse((policy) => { const list = backendsOf(policy, REVIEW); [list[0], list[1]] = [list[1]!, list[0]!]; }, 'reordered');
    // The switch on without the block, and the block with the switch off.
    refuse((policy) => { delete rulesOf(policy)[REVIEW]!.platformTools; }, 'switch without block');
    refuse((policy) => { (rulesOf(policy)[REVIEW]!.transmissions as Record<string, unknown>).webSearchToolAllowed = false; }, 'block without switch');
    // Dialogue, baseline analysis, 润色, conflict regeneration and the background rule never research, with or without the switch.
    for (const index of [BASELINE, DIALOGUE, POLISH, CONFLICT, BACKGROUND]) {
      refuse((policy) => { rulesOf(policy)[index]!.platformTools = structuredClone(rulesOf(policy)[REVIEW]!.platformTools); }, `block on ${index}`);
      refuse((policy) => {
        rulesOf(policy)[index]!.platformTools = structuredClone(rulesOf(policy)[REVIEW]!.platformTools);
        (rulesOf(policy)[index]!.transmissions as Record<string, unknown>).webSearchToolAllowed = true;
      }, `research on ${index}`);
    }
  });

  it('refuses the other scope\'s block: a developer-live block under production and a production block under developer-live', () => {
    const v16 = readPolicySync(V22_PATH);
    const v17 = readPolicySync(V23_PATH);
    const crossed16 = structuredClone(v16);
    rulesOf(crossed16)[REVIEW]!.platformTools = structuredClone(rulesOf(v17)[REVIEW]!.platformTools);
    expect(() => verifyDeveloperLivePolicy(crossed16)).toThrow('LAUNCH_POLICY_INVALID');
    const crossed17 = structuredClone(v17);
    rulesOf(crossed17)[REVIEW]!.platformTools = structuredClone(rulesOf(v16)[REVIEW]!.platformTools);
    expect(() => verifyOrdinaryProductionPolicy(crossed17)).toThrow('LAUNCH_POLICY_INVALID');
  });

  it.each([
    ['developer-live', V22_PATH],
    ['ordinary-production', V23_PATH],
  ] as const)('denies a %s launch after a one-byte change inside a backend host of its pinned bytes', async (scope, path) => {
    await placeValidCheckout();
    const target = join(codeRoot, ...path.split('/'));
    const bytes = await readFile(target);
    const offset = bytes.indexOf('"api.search.tinyfish.ai"');
    expect(offset).toBeGreaterThan(0);
    bytes[offset + 1] = 'A'.charCodeAt(0);
    await writeFile(target, bytes);
    const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope, scope === 'ordinary-production' ? GO_PRODUCTION_BINDING : null);
    expect(projection.integrityState).toBe('denied');
    expect(projection.denialReason).toBe('launch-policy-integrity-denied');
    expectZeroTransmission(projection);
    expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).integrityState).toBe('verified');
  });
});

describe('Provider Processing v22 and v23: local targeted retrieval on every rule (Issue #891, slice 7d)', () => {
  const documents = [
    ['v22 (developer-live)', V22_PATH, (policy: Record<string, unknown>) => verifyDeveloperLivePolicy(policy).admittedRules],
    ['v23 (ordinary-production)', V23_PATH, (policy: Record<string, unknown>) => bindOrdinaryProductionRules(verifyOrdinaryProductionPolicy(policy), GO_PRODUCTION_BINDING)!],
  ] as const;
  const verifiers = [
    ['v22 (developer-live)', V22_PATH, (policy: Record<string, unknown>) => verifyDeveloperLivePolicy(policy)],
    ['v23 (ordinary-production)', V23_PATH, (policy: Record<string, unknown>) => verifyOrdinaryProductionPolicy(policy)],
  ] as const;
  /** The rules that admit no model-initiated retrieval: enrolled background analysis and the 来源译文 rule. */
  const NO_RETRIEVAL = [BACKGROUND, TRANSLATION, CUSTOM];
  const retrievalOf = (policy: Record<string, unknown>, index: number): Record<string, unknown> =>
    (rulesOf(policy)[index]!.localTools as { targetedRetrieval: Record<string, unknown> }).targetedRetrieval;

  it.each(documents)('%s projects the verified local tools on every admitted rule, retrieval not allowed for background analysis, 来源译文 and custom analysis alone', (_name, path, read) => {
    const rules = read(readPolicySync(path));
    expect(rules).toHaveLength(10);
    rules.forEach((rule, index) => {
      expect(rule.localTools, rule.ruleId).toEqual(localToolsProjection(!NO_RETRIEVAL.includes(index)));
      expect(rule.localTools.targetedRetrieval.allowed, rule.ruleId).toBe(!NO_RETRIEVAL.includes(index));
      expect(rule.sourceTranslationAllowed, rule.ruleId).toBe(index === REVIEW);
    });
    // The projection is a copy: mutating it never reaches the next reading.
    (rules[0]!.localTools.targetedRetrieval as { callsPerUnit: number }).callsPerUnit = 99;
    expect(read(readPolicySync(path))[0]!.localTools.targetedRetrieval.callsPerUnit).toBe(5);
  });

  it.each(verifiers)('%s fails closed on a missing, extra, changed or crossed local tools term, on every rule', (_name, path, verify) => {
    const refuse = (label: string, mutate: (policy: Record<string, unknown>, index: number) => void): void => {
      for (let index = 0; index < 10; index += 1) {
        const policy = readPolicySync(path);
        mutate(policy, index);
        expect(() => verify(policy), `${label} ${index}`).toThrow('LAUNCH_POLICY_INVALID');
      }
    };
    const block = (policy: Record<string, unknown>, index: number): Record<string, Record<string, unknown>> =>
      rulesOf(policy)[index]!.localTools as Record<string, Record<string, unknown>>;
    refuse('drop block', (policy, index) => { delete rulesOf(policy)[index]!.localTools; });
    refuse('null block', (policy, index) => { rulesOf(policy)[index]!.localTools = null; });
    refuse('empty block', (policy, index) => { rulesOf(policy)[index]!.localTools = {}; });
    refuse('extra root term', (policy, index) => { (rulesOf(policy)[index]!.localTools as Record<string, unknown>).unknownTool = true; });
    refuse('drop retrieval', (policy, index) => { delete block(policy, index).targetedRetrieval; });
    refuse('drop breaker', (policy, index) => { delete block(policy, index).breaker; });
    refuse('flip allowed', (policy, index) => { block(policy, index).targetedRetrieval!.allowed = NO_RETRIEVAL.includes(index); });
    refuse('allowed as string', (policy, index) => { block(policy, index).targetedRetrieval!.allowed = String(!NO_RETRIEVAL.includes(index)); });
    for (const key of ['allowed', 'source', 'callsPerUnit', 'candidatesPerCall', 'exactFetchRequiredBeforeCitation', 'scope']) {
      refuse(`drop ${key}`, (policy, index) => { delete block(policy, index).targetedRetrieval![key]; });
    }
    refuse('extra retrieval term', (policy, index) => { block(policy, index).targetedRetrieval!.egressHost = 'example.com'; });
    refuse('source', (policy, index) => { block(policy, index).targetedRetrieval!.source = 'any-source'; });
    refuse('call cap + 1', (policy, index) => { block(policy, index).targetedRetrieval!.callsPerUnit = 6; });
    refuse('call cap as string', (policy, index) => { block(policy, index).targetedRetrieval!.callsPerUnit = '5'; });
    refuse('call cap zero', (policy, index) => { block(policy, index).targetedRetrieval!.callsPerUnit = 0; });
    refuse('candidate cap + 1', (policy, index) => { block(policy, index).targetedRetrieval!.candidatesPerCall = 9; });
    refuse('candidate cap fractional', (policy, index) => { block(policy, index).targetedRetrieval!.candidatesPerCall = 7.5; });
    refuse('exact fetch waived', (policy, index) => { block(policy, index).targetedRetrieval!.exactFetchRequiredBeforeCitation = false; });
    refuse('scope egress', (policy, index) => { block(policy, index).targetedRetrieval!.scope = 'egress'; });
    refuse('breaker round trips', (policy, index) => { block(policy, index).breaker!.roundTrips = 127; });
    refuse('breaker end', (policy, index) => { block(policy, index).breaker!.end = '联网核查未完成'; });
    refuse('breaker extra term', (policy, index) => { block(policy, index).breaker!.unknownTerm = 1; });
    // The block is read whole and never shared: the review rule's block cannot stand in for another rule's, and web tools do not imply it.
    refuse('platform tools without local tools', (policy, index) => { delete rulesOf(policy)[index]!.localTools; rulesOf(policy)[index]!.platformTools ??= null; });
  });

  it.each(verifiers)('%s refuses retrieval allowed for enrolled background analysis and 来源译文, and not allowed for any other rule', (_name, path, verify) => {
    const background = readPolicySync(path);
    retrievalOf(background, BACKGROUND).allowed = true;
    expect(() => verify(background)).toThrow('LAUNCH_POLICY_INVALID');
    const translation = readPolicySync(path);
    retrievalOf(translation, TRANSLATION).allowed = true;
    expect(() => verify(translation)).toThrow('LAUNCH_POLICY_INVALID');
    for (const index of [BASELINE, DIALOGUE, REVIEW, WRITING, EVALUATION, POLISH, CONFLICT]) {
      const policy = readPolicySync(path);
      retrievalOf(policy, index).allowed = false;
      expect(() => verify(policy), String(index)).toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it.each([['developer-live', V22_PATH], ['ordinary-production', V23_PATH]] as const)('denies a %s launch after a one-byte change inside the local tools block of its pinned bytes (%s)', async (scope, path) => {
    for (const [from, to] of [['"callsPerUnit": 5', '"callsPerUnit": 6'], ['"candidatesPerCall": 8', '"candidatesPerCall": 9'], ['"scope": "no-egress"', '"scope": "no-egrexs"'], ['"allowed": false', '"allowed": true']] as const) {
      await placeValidCheckout();
      const target = join(codeRoot, ...path.split('/'));
      const original = await readFile(target, 'utf8');
      expect(original.includes(from), from).toBe(true);
      await writeFile(target, original.replace(from, to));
      const projection = await resolveSourceCheckoutLaunchPolicy(codeRoot, scope, scope === 'ordinary-production' ? GO_PRODUCTION_BINDING : null);
      expect(projection.integrityState, from).toBe('denied');
      expectZeroTransmission(projection);
      // The other scope and development-ci still verify: the pin that drifted is the only one denied.
      expect((await resolveSourceCheckoutLaunchPolicy(codeRoot)).integrityState).toBe('verified');
    }
  });
});

describe('Provider Processing v22 and v23: 来源译文 and the source translation term (Issue #891, revisions 2 and 3)', () => {
  const verifiers = [
    ['v22 (developer-live)', V22_PATH, (policy: Record<string, unknown>) => verifyDeveloperLivePolicy(policy)],
    ['v23 (ordinary-production)', V23_PATH, (policy: Record<string, unknown>) => verifyOrdinaryProductionPolicy(policy)],
  ] as const;
  const refuseEach = (path: string, verify: (policy: Record<string, unknown>) => unknown, label: string, mutate: (policy: Record<string, unknown>, index: number) => void, indexes: readonly number[]): void => {
    for (const index of indexes) {
      const policy = readPolicySync(path);
      mutate(policy, index);
      expect(() => verify(policy), `${label} ${index}`).toThrow('LAUNCH_POLICY_INVALID');
    }
  };

  it.each(verifiers)('%s states sourceTranslationAllowed true on the research review rule alone, and nothing else may carry it', (_name, path, verify) => {
    expect(verify(readPolicySync(path))).toBeDefined();
    refuseEach(path, verify, 'drop on review', (policy) => { delete rulesOf(policy)[REVIEW]!.sourceTranslationAllowed; }, [REVIEW]);
    refuseEach(path, verify, 'false on review', (policy) => { rulesOf(policy)[REVIEW]!.sourceTranslationAllowed = false; }, [REVIEW]);
    refuseEach(path, verify, 'string on review', (policy) => { rulesOf(policy)[REVIEW]!.sourceTranslationAllowed = 'true'; }, [REVIEW]);
    refuseEach(path, verify, 'added elsewhere', (policy, index) => { rulesOf(policy)[index]!.sourceTranslationAllowed = true; },
      [BASELINE, DIALOGUE, WRITING, EVALUATION, POLISH, CONFLICT, BACKGROUND, TRANSLATION]);
    refuseEach(path, verify, 'false elsewhere', (policy, index) => { rulesOf(policy)[index]!.sourceTranslationAllowed = false; },
      [BASELINE, DIALOGUE, WRITING, EVALUATION, POLISH, CONFLICT, BACKGROUND, TRANSLATION]);
  });

  it.each(verifiers)('%s fails closed on any widened or altered term of the 来源译文 rule', (_name, path, verify) => {
    const production = path === V23_PATH;
    const rule = (policy: Record<string, unknown>): Record<string, unknown> => rulesOf(policy)[TRANSLATION]!;
    const block = (policy: Record<string, unknown>, name: string): Record<string, unknown> => rule(policy)[name] as Record<string, unknown>;
    const variants: Array<[string, (policy: Record<string, unknown>) => void]> = [
      ['kind widened', (policy) => { rule(policy).allowedTaskKinds = ['material-translation', 'editorial-dialogue']; }],
      ['other kind', (policy) => { rule(policy).allowedTaskKinds = ['translation']; }],
      ['category widened', (policy) => { rule(policy).allowedOutboundDataCategories = [...(rule(policy).allowedOutboundDataCategories as string[]), 'editor-selected-manuscript-excerpt']; }],
      ['category swapped', (policy) => { rule(policy).allowedOutboundDataCategories = production ? ['public-or-synthetic', 'unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content'] : ['frozen-material-reference-excerpt']; }],
      ['category dropped', (policy) => { rule(policy).allowedOutboundDataCategories = []; }],
      ['main role', (policy) => { block(policy, 'providerBinding').modelRole = 'Main Editorial Role'; }],
      ['web on', (policy) => { block(policy, 'transmissions').webSearchToolAllowed = true; }],
      ['platform tools', (policy) => { rule(policy).platformTools = null; }],
      ['material flag off', (policy) => { block(policy, 'source').materialReferencesAllowed = false; }],
      ['excerpt term dropped', (policy) => { delete block(policy, 'source').frozenMaterialExcerptOnly; }],
      ['series knowledge', (policy) => { block(policy, 'source').seriesKnowledgeAllowed = true; }],
      ['deliverables', (policy) => { block(policy, 'source').editorialDeliverablesAllowed = true; }],
      ['payload term dropped', (policy) => { delete block(policy, 'transmissions').payloadLimitedToFrozenContractAndMaterialExcerpt; }],
      ['synthesis on', (policy) => { block(policy, 'transmissions').crossUnitSynthesisAllowed = true; }],
      ['reflection on', (policy) => { block(policy, 'transmissions').runReportReflectionAllowed = true; }],
      ['resend on', (policy) => { block(policy, 'transmissions').automaticResendInsideStoppedSessionAllowed = true; }],
      ['one payload off', (policy) => { block(policy, 'transmissions').oneBoundedPayloadPerAttempt = false; }],
      ['question allowed', (policy) => { block(policy, 'clarification').modelQuestionAllowed = true; }],
      ['ceiling applies', (policy) => { block(policy, 'authorizationPreconditions').runBudgetCeilingApplies = true; }],
      ['gate waived', (policy) => { block(policy, 'authorizationPreconditions').finalProviderPayloadEgressGateRequired = false; }],
      ['background origin', (policy) => { block(policy, 'authorityOrigin').backgroundAnalysisEnrollmentAllowed = true; }],
      ['default rule origin', (policy) => { block(policy, 'authorityOrigin').matchingActiveDefaultExecutionRuleAllowed = true; }],
      ['scheduled origin', (policy) => { block(policy, 'authorityOrigin').idleScheduledImportTriggeredOrCrossRunDispatchAllowed = true; }],
      ['foreground action dropped', (policy) => { delete block(policy, 'authorityOrigin').foregroundEditorActionRequired; }],
      ['output block', (policy) => { rule(policy).output = { suggestionsOnly: true, appliesManuscriptChange: false }; }],
      ['account limit retry', (policy) => { block(policy, 'providerAccountLimit').retryAllowed = true; }],
      ['extra term', (policy) => { rule(policy).unknownTerm = true; }],
      ['renamed', (policy) => { rule(policy).ruleId = `${String(rule(policy).ruleId)}-2`; }],
    ];
    for (const [label, mutate] of variants) {
      // Developer-live reads each term it needs and leaves an unread extra term to the pinned digest, as for every other rule; production reads the rule's keys whole.
      if (label === 'extra term' && !production) continue;
      const policy = readPolicySync(path);
      mutate(policy);
      expect(() => verify(policy), label).toThrow('LAUNCH_POLICY_INVALID');
    }
    // The rule is required: a policy without it is not the pinned document.
    const without = readPolicySync(path);
    rulesOf(without).splice(TRANSLATION, 1);
    expect(() => verify(without)).toThrow('LAUNCH_POLICY_INVALID');
  });

  it('projects the 来源译文 rule on the Fast Interaction Role under both scopes, selected by its kind alone', () => {
    const live = verifyDeveloperLivePolicy(readPolicySync(V22_PATH)).admittedRules;
    const production = bindOrdinaryProductionRules(verifyOrdinaryProductionPolicy(readPolicySync(V23_PATH)), GO_PRODUCTION_BINDING)!;
    for (const rules of [live, production]) {
      expect(rules.filter((rule) => rule.taskKinds.includes('material-translation'))).toHaveLength(1);
      const rule = rules[TRANSLATION]!;
      expect(rule.taskKinds).toEqual(['material-translation']);
      expect(rule.modelRole).toBe('Fast Interaction Role');
      expect(rule.webSearchToolAllowed).toBe(false);
      expect(rule.platformTools).toBeNull();
      expect(rule.localTools.targetedRetrieval.allowed).toBe(false);
      expect(rule.sourceTranslationAllowed).toBe(false);
      expect(rule.clarificationQuestionAllowed).toBe(false);
      expect(rule.backgroundOrigin).toBe(false);
    }
    expect(live[TRANSLATION]!.outboundDataCategories).toEqual(['public-or-synthetic']);
    expect(production[TRANSLATION]!.outboundDataCategories).toEqual(['frozen-material-reference-excerpt', 'unpublished-metadata', 'unpublished-excerpts', 'unpublished-full-content']);
    // Review is the only rule that projects the source translation term.
    expect(live.filter((rule) => rule.sourceTranslationAllowed).map((rule) => rule.ruleId)).toEqual(['developer-live-public-samplebook-reference-free-review']);
    expect(production.filter((rule) => rule.sourceTranslationAllowed).map((rule) => rule.ruleId)).toEqual(['ordinary-production-review']);
  });
});

describe('Provider Processing v20 and v21: the house review-preference category (Issue #910, slice 6p)', () => {
  const CATEGORY = 'house-review-preference-excerpt';
  const LIVE_REVIEW_ID = 'developer-live-public-samplebook-reference-free-review';
  const PRODUCTION_REVIEW_ID = 'ordinary-production-review';
  const DECLARATION = {
    category: CATEGORY,
    derivedFrom: 'judged-review-decisions-of-the-same-house',
    maxLines: 12,
    maxGraphemesTotal: 200,
    attributedToRecordVersion: true,
    manuscriptTextAllowed: false,
    housePeopleNamesAndRolesStripped: true,
    authorOrEditorNamesAllowed: false,
  };
  const variants = [
    ['v20 (developer-live)', V20_PATH, V18_PATH, 'v18', LIVE_REVIEW_ID, 'admitted-public-or-synthetic-books-only', (policy: Record<string, unknown>) => verifyDeveloperLivePolicy(policy).admittedRules],
    ['v21 (ordinary-production)', V21_PATH, V19_PATH, 'v19', PRODUCTION_REVIEW_ID, 'ordinary-production-sources-only',
      (policy: Record<string, unknown>) => bindOrdinaryProductionRules(verifyOrdinaryProductionPolicy(policy), GO_PRODUCTION_BINDING)!],
  ] as const;
  /** The selected successors, which still carry the category and the declaration unchanged on the review rule. */
  const selectedVariants = [
    ['v22 (developer-live)', V22_PATH, V20_PATH, 'v20', LIVE_REVIEW_ID, 'admitted-public-or-synthetic-books-only', variants[0][6]],
    ['v23 (ordinary-production)', V23_PATH, V21_PATH, 'v21', PRODUCTION_REVIEW_ID, 'ordinary-production-sources-only', variants[1][6]],
  ] as const;

  it.each(variants)('%s directly succeeds %s\'s bytes: only the review rule and the category vocabulary differ', async (_name, path, predecessorPath, predecessor, reviewId) => {
    const now = await readPolicy(path);
    const before = await readPolicy(predecessorPath);
    expect(now.predecessorVersion).toBe(predecessor);
    expect(now.predecessorCanonicalPath).toBe(predecessorPath);
    expect(now.operationalScope).toBe(before.operationalScope);
    expect(now.roleBindings).toEqual(before.roleBindings);
    expect(now.credentialBoundary).toEqual(before.credentialBoundary);
    expect(now.authoritySeparations).toEqual(before.authoritySeparations);
    expect(now.trustedSelection).toEqual(before.trustedSelection);
    expect(Object.keys(now.outboundDataCategories as object)).toEqual([...Object.keys(before.outboundDataCategories as object).slice(0, 11), CATEGORY, ...Object.keys(before.outboundDataCategories as object).slice(11)]);
    expect(rulesOf(now).map((rule) => rule.ruleId)).toEqual(rulesOf(before).map((rule) => rule.ruleId));
    for (const [index, rule] of rulesOf(now).entries()) {
      const prior = rulesOf(before)[index]!;
      if (rule.ruleId !== reviewId) {
        expect(rule, String(rule.ruleId)).toEqual(prior);
        continue;
      }
      const { houseReviewPreference: _declaration, allowedOutboundDataCategories: categories, ...rest } = rule;
      const { allowedOutboundDataCategories: priorCategories, ...priorRest } = prior;
      expect(rest).toEqual(priorRest);
      expect(categories).toEqual((priorCategories as string[]).flatMap((category) => (category === 'editorial-deliverable-excerpt' ? [category, CATEGORY] : [category])));
    }
  });

  it.each(selectedVariants)('%s carries the category and its declaration on the review rule and on no other rule', async (_name, path, _p, _v, reviewId, sourceScope, admittedRules) => {
    const policy = await readPolicy(path);
    for (const rule of rulesOf(policy)) {
      const isReview = rule.ruleId === reviewId;
      expect((rule.allowedOutboundDataCategories as string[]).includes(CATEGORY), String(rule.ruleId)).toBe(isReview);
      expect(Object.hasOwn(rule, 'houseReviewPreference'), String(rule.ruleId)).toBe(isReview);
    }
    const declaration = rulesOf(policy).find((rule) => rule.ruleId === reviewId)!.houseReviewPreference as Record<string, unknown>;
    const { descriptionZh, ...terms } = declaration;
    expect(terms).toEqual({ ...DECLARATION, sourceScope });
    expect(descriptionZh).toContain('至多 12 行');
    expect(descriptionZh).toContain('至多 200 个字素');
    expect(descriptionZh).toContain('绝不含稿件正文');
    const admitted = admittedRules(policy);
    expect(admitted.filter((rule) => rule.outboundDataCategories.includes(CATEGORY)).map((rule) => rule.ruleId)).toEqual([reviewId]);
    expect(admitted.find((rule) => rule.ruleId === reviewId)!.taskKinds).toEqual([
      'editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression',
      'editorial-review/cross-deliverable-consistency', ...WEB_REVIEW_KINDS, SERIES_REVIEW_KIND,
    ]);
  });

  it.each(selectedVariants)('%s is unreadable when the category or its declaration is dropped, moved, widened or altered', async (_name, path, _p, _v, reviewId, _scope, admittedRules) => {
    const cases: Array<[string, (policy: Record<string, unknown>) => void]> = [
      ['category dropped', (policy) => { const rule = rulesOf(policy).find((candidate) => candidate.ruleId === reviewId)!; rule.allowedOutboundDataCategories = (rule.allowedOutboundDataCategories as string[]).filter((category) => category !== CATEGORY); }],
      ['declaration dropped', (policy) => { delete rulesOf(policy).find((candidate) => candidate.ruleId === reviewId)!.houseReviewPreference; }],
      ['lines widened', (policy) => { (rulesOf(policy).find((candidate) => candidate.ruleId === reviewId)!.houseReviewPreference as Record<string, unknown>).maxLines = 13; }],
      ['graphemes widened', (policy) => { (rulesOf(policy).find((candidate) => candidate.ruleId === reviewId)!.houseReviewPreference as Record<string, unknown>).maxGraphemesTotal = 201; }],
      ['names allowed', (policy) => { (rulesOf(policy).find((candidate) => candidate.ruleId === reviewId)!.houseReviewPreference as Record<string, unknown>).authorOrEditorNamesAllowed = true; }],
      ['manuscript text allowed', (policy) => { (rulesOf(policy).find((candidate) => candidate.ruleId === reviewId)!.houseReviewPreference as Record<string, unknown>).manuscriptTextAllowed = true; }],
      ['other source scope', (policy) => { (rulesOf(policy).find((candidate) => candidate.ruleId === reviewId)!.houseReviewPreference as Record<string, unknown>).sourceScope = 'any-source'; }],
      ['category on another rule', (policy) => { const rule = rulesOf(policy).find((candidate) => String(candidate.ruleId).endsWith('-writing'))!; rule.allowedOutboundDataCategories = [...(rule.allowedOutboundDataCategories as string[]), CATEGORY]; }],
      ['declaration on another rule', (policy) => { rulesOf(policy).find((candidate) => String(candidate.ruleId).endsWith('-writing'))!.houseReviewPreference = { ...DECLARATION }; }],
    ];
    for (const [label, mutate] of cases) {
      const policy = readPolicySync(path);
      mutate(policy);
      expect(() => admittedRules(policy), label).toThrow('LAUNCH_POLICY_INVALID');
    }
  });

  it('predecessors v18 and v19 are no longer the pinned reading: the review rule lacks the category', () => {
    expect(() => verifyDeveloperLivePolicy(readPolicySync(V18_PATH))).toThrow('LAUNCH_POLICY_INVALID');
    expect(() => verifyOrdinaryProductionPolicy(readPolicySync(V19_PATH))).toThrow('LAUNCH_POLICY_INVALID');
  });

  it('predecessors v20 and v21 are no longer the pinned reading either: no custom analysis rule and no Series Knowledge on the review rule', () => {
    expect(() => verifyDeveloperLivePolicy(readPolicySync(V20_PATH))).toThrow('LAUNCH_POLICY_INVALID');
    expect(() => verifyOrdinaryProductionPolicy(readPolicySync(V21_PATH))).toThrow('LAUNCH_POLICY_INVALID');
  });
});

describe('Provider Processing v22 and v23: custom analysis dimensions and Series Knowledge excerpts (Issue #920, slice 7p)', () => {
  const TEMPLATE = 'editor-authored-question-template';
  const SERIES = 'series-knowledge-excerpt';
  const LIVE_REVIEW_ID = 'developer-live-public-samplebook-reference-free-review';
  const PRODUCTION_REVIEW_ID = 'ordinary-production-review';
  const TEMPLATE_BLOCK = {
    category: TEMPLATE,
    sourceDocument: 'process-and-rules-document',
    maxGraphemes: 400,
    attributedToDimensionVersion: true,
    manuscriptTextAllowed: false,
    housePeopleNamesAndRolesStripped: true,
    authorOrEditorNamesAllowed: false,
    contractFramingOverrideAllowed: false,
  };
  const SERIES_BLOCK = {
    category: SERIES,
    derivedFrom: 'series-knowledge-item-revisions-pinned-by-the-run-frozen-series-scope',
    maxClauses: 40,
    maxGraphemesPerClause: 300,
    onlyPinnedSeriesItems: true,
    retrievalExclusionsHonoured: true,
    attributedToItemRevisions: true,
  };
  const scopes = [
    { name: 'v22 (developer-live)', path: V22_PATH, before: V20_PATH, version: 'v22', predecessor: 'v20', reviewId: LIVE_REVIEW_ID, customId: CUSTOM_RULE_ID, writingId: 'developer-live-public-samplebook-writing', sourceScope: 'admitted-public-or-synthetic-books-only',
      verify: (policy: Record<string, unknown>) => verifyDeveloperLivePolicy(policy).admittedRules },
    { name: 'v23 (ordinary-production)', path: V23_PATH, before: V21_PATH, version: 'v23', predecessor: 'v21', reviewId: PRODUCTION_REVIEW_ID, customId: 'ordinary-production-custom-analysis', writingId: 'ordinary-production-writing', sourceScope: 'ordinary-production-sources-only',
      verify: (policy: Record<string, unknown>) => bindOrdinaryProductionRules(verifyOrdinaryProductionPolicy(policy), GO_PRODUCTION_BINDING)! },
  ] as const;
  const ruleOf = (policy: Record<string, unknown>, ruleId: string): Record<string, unknown> => rulesOf(policy).find((rule) => rule.ruleId === ruleId)!;

  it.each(scopes)('%s directly succeeds its predecessor: only the review rule, the appended custom analysis rule, the vocabulary and the authority basis differ', async ({ path, before, version, predecessor, reviewId, customId }) => {
    const now = await readPolicy(path);
    const prior = await readPolicy(before);
    expect(now.version).toBe(version);
    expect(now.predecessorVersion).toBe(predecessor);
    expect(now.predecessorCanonicalPath).toBe(before);
    for (const term of ['operationalScope', 'roleBindings', 'credentialBoundary', 'authoritySeparations', 'trustedSelection', 'lifecycleStatus', 'documentType', 'policyId', 'policyType'] as const) {
      expect(now[term], term).toEqual(prior[term]);
    }
    expect(now.authorityBasis).toEqual([...(prior.authorityBasis as string[]),
      'docs/adr/0090-admit-procedure-recommendation-foreign-skill-import-and-custom-analysis-dimensions.md',
      'docs/adr/0002-book-series-cross-project-and-house-learning-scopes.md',
      'docs/adr/0037-enforce-versioned-series-retrieval-exclusions-immediately.md']);
    const priorCategories = Object.keys(prior.outboundDataCategories as object);
    expect(Object.keys(now.outboundDataCategories as object)).toEqual([...priorCategories.slice(0, 12), TEMPLATE, SERIES, ...priorCategories.slice(12)]);
    expect(now.outboundDataCategories).toMatchObject({ [TEMPLATE]: { labelZh: '编辑自拟的单元提问模板' }, [SERIES]: { labelZh: '书系知识摘录' } });
    const nowRules = rulesOf(now);
    const priorRules = rulesOf(prior);
    expect(nowRules).toHaveLength(priorRules.length + 1);
    expect(nowRules.at(-1)!.ruleId).toBe(customId);
    for (const [index, rule] of priorRules.entries()) {
      const next = nowRules[index]!;
      if (rule.ruleId !== reviewId) {
        expect(next, String(rule.ruleId)).toEqual(rule);
        continue;
      }
      const { source, allowedOutboundDataCategories, allowedTaskKinds, seriesKnowledgeExcerpt, ...rest } = next;
      const { source: priorSource, allowedOutboundDataCategories: priorCategoriesOfRule, allowedTaskKinds: priorKinds, ...priorRest } = rule;
      expect(rest).toEqual(priorRest);
      expect(source).toEqual({ ...(priorSource as object), seriesKnowledgeAllowed: true });
      expect(allowedOutboundDataCategories).toEqual((priorCategoriesOfRule as string[]).flatMap((category) => (category === 'house-review-preference-excerpt' ? [category, SERIES] : [category])));
      expect(allowedTaskKinds).toEqual([...(priorKinds as string[]), SERIES_REVIEW_KIND]);
      expect(seriesKnowledgeExcerpt).toBeDefined();
    }
  });

  it.each(scopes)('%s carries the custom analysis rule on the Main Editorial Role: planned like the baseline, template bounded, no tools, no Material Reference, Series or deliverable', async ({ path, customId, verify }) => {
    const policy = await readPolicy(path);
    const rule = ruleOf(policy, customId);
    expect(rule.allowedTaskKinds).toEqual(['custom-analysis/*']);
    expect((rule.allowedOutboundDataCategories as string[]).slice(0, 2)).toEqual(['public-or-synthetic', TEMPLATE]);
    expect((rule.providerBinding as Record<string, unknown>).modelRole).toBe('Main Editorial Role');
    const { descriptionZh, ...terms } = rule.editorAuthoredQuestionTemplate as Record<string, unknown>;
    expect(terms).toEqual(TEMPLATE_BLOCK);
    expect(descriptionZh).toContain('至多 400 个字素');
    expect(descriptionZh).toContain('绝不含稿件正文');
    expect(descriptionZh).toContain('绝不改写或覆盖 AI7 的合同框架');
    expect(rule.authorityOrigin).toMatchObject({ newlyUserInitiatedTaskRequired: true, directRunAuthorizationAllowed: true, matchingActiveDefaultExecutionRuleAllowed: false, backgroundAnalysisEnrollmentAllowed: false });
    expect(rule.authorizationPreconditions).toMatchObject({ planEnvelopeRequired: true, runAuthorizationRequired: true, runSourceScopeRequired: true });
    expect(rule.transmissions).toMatchObject({
      boundedByCoverageManifestUnitCount: true, oneTechnicalSessionPerAnalysisUnit: true, crossUnitReductionAllowed: false, webSearchToolAllowed: false, plusClarificationAnswerTurns: true,
    });
    expect(rule.transmissions as object).not.toHaveProperty('plusOneCrossUnitSynthesisTurn');
    expect(rule.transmissions as object).not.toHaveProperty('plusCrossUnitReductionTopicSections');
    expect(rule.platformTools).toBeUndefined();
    expect(rule.source).toMatchObject({ materialReferencesAllowed: false, seriesKnowledgeAllowed: false, editorialDeliverablesAllowed: false });
    expect(rule.clarification).toEqual(CLARIFICATION_ASKS);
    const projected = verify(readPolicySync(path)).find((candidate) => candidate.ruleId === customId)!;
    expect(projected).toMatchObject({
      taskKinds: ['custom-analysis/*'], modelRole: 'Main Editorial Role', crossUnitSynthesisAllowed: false, materialReferencesAllowed: false, editorialDeliverablesAllowed: false,
      webSearchToolAllowed: false, platformTools: null, clarificationQuestionAllowed: true, backgroundOrigin: false, matchingActiveDefaultExecutionRuleAllowed: false,
    });
    expect(projected.localTools.targetedRetrieval.allowed).toBe(false);
    expect(projected.outboundDataCategories).toEqual(expect.arrayContaining(['public-or-synthetic', TEMPLATE]));
  });

  it.each(scopes)('%s states seriesKnowledgeAllowed true on the review rule alone, with the Series category and its bounded declaration', async ({ path, reviewId, customId, sourceScope, verify }) => {
    const policy = await readPolicy(path);
    for (const rule of rulesOf(policy)) {
      const isReview = rule.ruleId === reviewId;
      expect((rule.source as Record<string, unknown>).seriesKnowledgeAllowed === true, String(rule.ruleId)).toBe(isReview);
      expect((rule.allowedOutboundDataCategories as string[]).includes(SERIES), String(rule.ruleId)).toBe(isReview);
      expect(Object.hasOwn(rule, 'seriesKnowledgeExcerpt'), String(rule.ruleId)).toBe(isReview);
    }
    const { descriptionZh, ...terms } = ruleOf(policy, reviewId).seriesKnowledgeExcerpt as Record<string, unknown>;
    expect(terms).toEqual({ ...SERIES_BLOCK, sourceScope });
    expect(descriptionZh).toContain('至多 40 条');
    expect(descriptionZh).toContain('每条至多 300 个字素');
    expect(descriptionZh).toContain('已生效的书系检索排除一律遵守');
    const admitted = verify(readPolicySync(path));
    expect(admitted.filter((rule) => rule.outboundDataCategories.includes(SERIES)).map((rule) => rule.ruleId)).toEqual([reviewId]);
    expect(admitted.filter((rule) => rule.outboundDataCategories.includes(TEMPLATE)).map((rule) => rule.ruleId)).toEqual([customId]);
    expect(ruleOf(policy, reviewId).allowedTaskKinds).toEqual([
      'editorial-review/typos-and-usage', 'editorial-review/style-and-format', 'editorial-review/literary-expression', 'editorial-review/cross-deliverable-consistency',
      ...WEB_REVIEW_KINDS, SERIES_REVIEW_KIND,
    ]);
  });

  it('lists a kind family entry in the custom analysis rule alone, in every policy document of the repository', () => {
    const families: string[] = [];
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19', 'v20', 'v21', 'v22', 'v23']) {
      const policy = readPolicySync(`docs/policies/provider-processing-policy.${version}.json`);
      for (const rule of rulesOf(policy)) {
        for (const kind of (rule.allowedTaskKinds as string[] | undefined) ?? []) if (kind.includes('*')) families.push(`${version} ${String(rule.ruleId)} ${kind}`);
      }
    }
    expect(families).toEqual([
      `v22 ${CUSTOM_RULE_ID} custom-analysis/*`,
      'v23 ordinary-production-custom-analysis custom-analysis/*',
    ]);
  });

  it.each(scopes)('%s is unreadable when a category, declaration, bound or kind entry is dropped, moved, widened or altered', ({ path, reviewId, customId, writingId, verify }) => {
    const edit = (ruleId: string, mutate: (rule: Record<string, unknown>) => void): Record<string, unknown> => {
      const policy = readPolicySync(path);
      mutate(ruleOf(policy, ruleId));
      return policy;
    };
    const block = (rule: Record<string, unknown>, name: string): Record<string, unknown> => rule[name] as Record<string, unknown>;
    const withCategory = (rule: Record<string, unknown>, category: string): void => { rule.allowedOutboundDataCategories = [...(rule.allowedOutboundDataCategories as string[]), category]; };
    const withoutCategory = (rule: Record<string, unknown>, category: string): void => { rule.allowedOutboundDataCategories = (rule.allowedOutboundDataCategories as string[]).filter((entry) => entry !== category); };
    const cases: Array<[string, Record<string, unknown>]> = [
      ['template category dropped', edit(customId, (rule) => withoutCategory(rule, TEMPLATE))],
      ['template declaration dropped', edit(customId, (rule) => { delete rule.editorAuthoredQuestionTemplate; })],
      ['template bound widened', edit(customId, (rule) => { block(rule, 'editorAuthoredQuestionTemplate').maxGraphemes = 401; })],
      ['template names allowed', edit(customId, (rule) => { block(rule, 'editorAuthoredQuestionTemplate').authorOrEditorNamesAllowed = true; })],
      ['template manuscript text allowed', edit(customId, (rule) => { block(rule, 'editorAuthoredQuestionTemplate').manuscriptTextAllowed = true; })],
      ['template may override the contract framing', edit(customId, (rule) => { block(rule, 'editorAuthoredQuestionTemplate').contractFramingOverrideAllowed = true; })],
      ['template not attributed to the dimension version', edit(customId, (rule) => { block(rule, 'editorAuthoredQuestionTemplate').attributedToDimensionVersion = false; })],
      ['template declaration with an unknown term', edit(customId, (rule) => { block(rule, 'editorAuthoredQuestionTemplate').unknownTerm = true; })],
      ['template category on the review rule', edit(reviewId, (rule) => withCategory(rule, TEMPLATE))],
      ['template category on another rule', edit(writingId, (rule) => withCategory(rule, TEMPLATE))],
      ['template declaration on another rule', edit(writingId, (rule) => { rule.editorAuthoredQuestionTemplate = { ...TEMPLATE_BLOCK }; })],
      ['family entry widened', edit(customId, (rule) => { rule.allowedTaskKinds = ['custom-analysis/*', 'editorial-review/*']; })],
      ['family entry made another prefix', edit(customId, (rule) => { rule.allowedTaskKinds = ['custom-analysis*']; })],
      ['family entry replaced by one kind', edit(customId, (rule) => { rule.allowedTaskKinds = ['custom-analysis/typos']; })],
      ['family entry on the review rule', edit(reviewId, (rule) => { rule.allowedTaskKinds = [...(rule.allowedTaskKinds as string[]), 'custom-analysis/*']; })],
      ['custom retrieval allowed', edit(customId, (rule) => { (block(rule, 'localTools').targetedRetrieval as Record<string, unknown>).allowed = true; })],
      ['custom web allowed', edit(customId, (rule) => { block(rule, 'transmissions').webSearchToolAllowed = true; })],
      ['custom cross-unit reduction allowed', edit(customId, (rule) => { block(rule, 'transmissions').crossUnitReductionAllowed = true; })],
      ['custom Series Knowledge allowed', edit(customId, (rule) => { block(rule, 'source').seriesKnowledgeAllowed = true; })],
      ['custom Material Reference allowed', edit(customId, (rule) => { block(rule, 'source').materialReferencesAllowed = true; })],
      ['custom background origin', edit(customId, (rule) => { block(rule, 'executionMode').backgroundAllowed = true; })],
      ['custom default execution rule', edit(customId, (rule) => { block(rule, 'authorityOrigin').matchingActiveDefaultExecutionRuleAllowed = true; })],
      ['Series category dropped', edit(reviewId, (rule) => withoutCategory(rule, SERIES))],
      ['Series declaration dropped', edit(reviewId, (rule) => { delete rule.seriesKnowledgeExcerpt; })],
      ['Series flag dropped', edit(reviewId, (rule) => { block(rule, 'source').seriesKnowledgeAllowed = false; })],
      ['Series clauses widened', edit(reviewId, (rule) => { block(rule, 'seriesKnowledgeExcerpt').maxClauses = 41; })],
      ['Series clause graphemes widened', edit(reviewId, (rule) => { block(rule, 'seriesKnowledgeExcerpt').maxGraphemesPerClause = 301; })],
      ['Series pinned-items bound dropped', edit(reviewId, (rule) => { block(rule, 'seriesKnowledgeExcerpt').onlyPinnedSeriesItems = false; })],
      ['Series exclusions not honoured', edit(reviewId, (rule) => { block(rule, 'seriesKnowledgeExcerpt').retrievalExclusionsHonoured = false; })],
      ['Series other source scope', edit(reviewId, (rule) => { block(rule, 'seriesKnowledgeExcerpt').sourceScope = 'any-source'; })],
      ['Series kind dropped', edit(reviewId, (rule) => { rule.allowedTaskKinds = (rule.allowedTaskKinds as string[]).filter((kind) => kind !== SERIES_REVIEW_KIND); })],
      ['Series category on another rule', edit(writingId, (rule) => withCategory(rule, SERIES))],
      ['Series declaration on another rule', edit(writingId, (rule) => { rule.seriesKnowledgeExcerpt = { ...SERIES_BLOCK }; })],
      ['Series flag on another rule', edit(writingId, (rule) => { block(rule, 'source').seriesKnowledgeAllowed = true; })],
      ['custom rule removed', (() => { const policy = readPolicySync(path); rulesOf(policy).pop(); return policy; })()],
    ];
    for (const [label, policy] of cases) expect(() => verify(policy), label).toThrow('LAUNCH_POLICY_INVALID');
    // The unchanged bytes are still the reading.
    expect(() => verify(readPolicySync(path))).not.toThrow();
  });

  it('keeps the selection plumbing in step: the build carries v22, v23 and set v15 beside every predecessor', () => {
    const build = readFileSync(join(REPO_ROOT, 'tools', 'build.mjs'), 'utf8');
    for (const path of ['docs/policies/active-policy-set.v15.json', 'docs/policies/provider-processing-policy.v22.json', 'docs/policies/provider-processing-policy.v23.json']) {
      expect(build.split(`'${path}'`).length - 1, path).toBe(3);
    }
  });
});
