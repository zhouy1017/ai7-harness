import { liveHouseReviewPreferenceContract } from '../house-review-preference.js';
import { CUSTOM_ANALYSIS_KIND_FAMILY, EDITOR_AUTHORED_QUESTION_TEMPLATE_CATEGORY, taskKindListed } from '../launch-policy.js';
import { liveSeriesContract, liveSeriesConsistencyContract } from '../review/series-consistency.js';
import { FACTUAL_REVIEW_KIND } from '../../shared/protocol.js';
import { localToolsFromProjection, type LocalToolsRule } from '../retrieval/local-rule.js';
import { FACTUAL_REVIEW_PROMPT_CONTRACT_DIGEST } from './factual-review-contract.js';
import { platformToolsFromProjection } from '../provider/search-service.js';
import { modelProfileFor } from '../provider/model-profile.js';
import type { RemoteExecutionRoute } from '../provider/egress-gate.js';
import type { AdmittedProviderRule, LaunchPolicyProjection } from '../../shared/protocol.js';
import { EVALUATION_REWRITE_KIND, INITIAL_EVALUATION_KIND, READERS_REPORT_KIND, WRITING_KIND, reviewCategoryKindId } from '../../shared/protocol.js';
import type { OutboundDataCategory } from '../provider/egress-gate.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../review/category-configuration.js';
import { reviewCategoryKindDefinition } from '../review/review-category-kind.js';
import { liveMaterialContract } from '../task-material-references.js';
import { withModelClarification } from '../provider/clarification-contract.js';
import { factualReviewKindDefinition, factualReviewLevelDefinition, withFactualResearch, type AnalysisKindDefinition, type ResearchDeclaration } from './kind-definition.js';

/** The rule facts a live step reads from the one selected rule that admitted its kind. */
export interface LiveKindRule {
  readonly ruleId: string;
  readonly modelRole: string;
  readonly outboundDataCategories: readonly OutboundDataCategory[];
  /** Whether the kind's own book-level synthesis turn may be sent; `false` when the rule does not say so. */
  readonly crossUnitSynthesisAllowed: boolean;
}

/** The launch's live binding facts the rule must name exactly; `LaunchBinding['live']` satisfies it. */
export interface LiveKindBinding {
  readonly route: string;
  readonly endpoint: string;
  readonly model: string;
  readonly credentialSlot: string;
}

/** The parts of an analysis kind definition admission reads. */
export interface LiveKindDefinition {
  readonly kind: string;
  readonly contractVersion?: string;
  readonly promptContractDigest: string;
  readonly livePromptContractDigest?: () => string;
  readonly materialReferences?: unknown;
  readonly systemPrompt?: string;
  /** A factual-review definition's Evidence Assurance Level (Issue #901). */
  readonly evidenceAssuranceLevel?: string;
}

/** What the kind's own owner says its live contract must be. */
export interface LiveKindExpectation {
  /** The prompt-contract digest re-derived from the kind's own frozen inputs or configuration; `null` refuses. */
  readonly promptContractDigest: string | null;
  /** Every outbound category the contract's payload carries; the rule must name each. */
  readonly payloadCategories: readonly OutboundDataCategory[];
}

/**
 * The selected rule that admits `kind` live, or `null` (Issue #429, generalising #809): the verified developer-live or
 * ordinary-production projection, and exactly one of its admitted rules listing the kind and naming every required category. A missing or
 * ambiguous rule fails closed. A rule lists a kind exactly or, for the custom analysis family only, by its `custom-analysis/*` entry (`taskKindListed`). The enrolled-background rule (`backgroundOrigin`, Provider Processing v14 and v15) lists the baseline
 * kind truthfully but is another origin's rule: a `foreground` lookup (the default) skips it and a `background` lookup selects only it.
 */
export function liveKindRule(
  policy: LaunchPolicyProjection | undefined,
  kind: string,
  requiredCategories: readonly OutboundDataCategory[] = [],
  origin: 'foreground' | 'background' = 'foreground',
): AdmittedProviderRule | null {
  // Developer-live's rules, or ordinary production's filled from the editor's configured binding (Issue #811).
  if (policy === undefined || policy.integrityState !== 'verified' || policy.denialReason !== null ||
      (policy.operationalScope !== 'developer-live' && policy.operationalScope !== 'ordinary-production') ||
      !policy.providerProcessing.liveTransmissionAllowed ||
      policy.providerProcessing.decision !== 'eligible-only' ||
      policy.providerProcessing.authorizedLiveTransmissionCount !== 'bounded-by-run') return null;
  const rules = (policy.providerProcessing.admittedRules ?? []).filter((rule) =>
    taskKindListed(rule.taskKinds, kind) && (rule.backgroundOrigin === true) === (origin === 'background'));
  const rule = rules.length === 1 ? rules[0]! : null;
  return rule !== null && requiredCategories.every((category) => rule.outboundDataCategories.includes(category)) ? rule : null;
}

/** Material eligibility is a term of the kind's one selected rule, never a second rule. */
export function liveMaterialRule(policy: LaunchPolicyProjection | undefined, kind: string): AdmittedProviderRule | null {
  const rule = liveKindRule(policy, kind, ['frozen-material-reference-excerpt']);
  // The successor policy owner projects this flag; absent in predecessor projections means denied.
  return rule !== null && rule.materialReferencesAllowed === true ? rule : null;
}

/**
 * The shared execution owner admits a kind live only under its one rule, on that rule's exact Provider binding, for the
 * exact contract the kind's owner re-derives. Material wrappers additionally prove their base and frozen words.
 */
export function liveKindAdmitted(
  policy: LaunchPolicyProjection | undefined,
  kind: string,
  definition: LiveKindDefinition,
  binding: LiveKindBinding,
  expectation: LiveKindExpectation,
): LiveKindRule | null {
  const material = liveMaterialContract(definition);
  if (definition.kind !== kind || (definition.materialReferences !== undefined && material === null) || expectation.promptContractDigest === null) return null;
  if (material === null ? expectation.promptContractDigest !== definition.promptContractDigest
    : material.promptContractDigest !== definition.promptContractDigest || material.systemPrompt !== definition.systemPrompt ||
      material.basePromptContractDigest !== expectation.promptContractDigest) return null;
  if (material !== null && liveMaterialRule(policy, kind) === null) return null;
  const rule = liveKindRule(policy, kind, [...expectation.payloadCategories, ...(material === null ? [] : ['frozen-material-reference-excerpt'] as const)]);
  if (kind === reviewCategoryKindId('cross-deliverable-consistency') &&
      rule?.editorialDeliverablesAllowed !== true) return null;
  if (rule === null || rule.route !== binding.route || rule.endpoint !== binding.endpoint || rule.model !== binding.model ||
      rule.credentialSlot !== binding.credentialSlot) return null;
  return {
    ruleId: rule.ruleId,
    modelRole: rule.modelRole,
    outboundDataCategories: rule.outboundDataCategories,
    // Provider Processing v11's synthesis term (#841); a rule that does not name it never admits a kind's synthesis.
    crossUnitSynthesisAllowed: rule.crossUnitSynthesisAllowed === true,
  };
}

/** The base evaluation payload categories; the material wrapper adds its category when present. */
export const EVALUATION_PAYLOAD_CATEGORIES: Readonly<Record<string, readonly OutboundDataCategory[]>> = {
  // The house Evaluation Profile and the manuscript.
  [INITIAL_EVALUATION_KIND]: ['public-or-synthetic'],
  // The editor's finalized record, and the house's own 审稿意见 exemplars inside the synthesis.
  [READERS_REPORT_KIND]: ['public-or-synthetic', 'editor-authored-evaluation-text', 'house-exemplar-excerpt'],
  // The editor's saved scores, comments and conclusion.
  [EVALUATION_REWRITE_KIND]: ['public-or-synthetic', 'editor-authored-evaluation-text'],
};

/**
 * The outbound categories the writing contract's payload carries (#810, the v11 writing rule): the manuscript, the Book's frozen
 * metadata and synopsis with the editor's audience, channel and requirements, and the house's 范例 of the type. The material
 * wrapper adds its category when present.
 */
export const WRITING_PAYLOAD_CATEGORIES: readonly OutboundDataCategory[] = ['public-or-synthetic', 'book-metadata-and-synopsis', 'house-exemplar-excerpt'];

/** Whether `kind` is a member of the custom analysis kind family (`custom-analysis/<dimension-id>`, Provider Processing v22 and v23). */
function isCustomAnalysisKind(kind: string): boolean {
  return taskKindListed([CUSTOM_ANALYSIS_KIND_FAMILY], kind);
}

/** Every outbound category a planned kind's payload carries; `undefined` for a kind with no row. */
function plannedPayloadCategories(kind: string): readonly OutboundDataCategory[] | undefined {
  // The dimension's manuscript units and its editor-authored per-unit question template.
  if (isCustomAnalysisKind(kind)) return ['public-or-synthetic', EDITOR_AUTHORED_QUESTION_TEMPLATE_CATEGORY];
  if (kind === reviewCategoryKindId('cross-deliverable-consistency')) return ['public-or-synthetic', 'editorial-deliverable-excerpt'];
  return kind === WRITING_KIND ? WRITING_PAYLOAD_CATEGORIES : EVALUATION_PAYLOAD_CATEGORIES[kind];
}

/**
 * What a kind's live contract must be, by kind. A review category is re-derived from the built-in configuration, exactly as
 * #809 admitted it. An evaluation or writing owner re-derives its contract from the Task's frozen inputs (profile, record,
 * metadata, words and exemplars); a missing owner derivation or a changed declared digest refuses admission. Any other
 * kind has no row and is not admitted.
 */
function liveKindExpectation(definition: LiveKindDefinition, policy?: LaunchPolicyProjection): LiveKindExpectation | null {
  if (definition.kind === FACTUAL_REVIEW_KIND) {
    // The research contract (#744) and each Evidence Assurance Level's own (Issue #901): 快速整理 is v1 with no tool declared.
    const admitted = [withFactualResearch(factualReviewKindDefinition()), factualReviewLevelDefinition('standard'), factualReviewLevelDefinition('strict')]
      .map((entry) => entry.promptContractDigest);
    // v1's bytes are admitted only as the 快速整理 level a plan chose, never as v1 on a launch whose rule hands it no tool.
    const quick = definition.evidenceAssuranceLevel === 'quick' && definition.promptContractDigest === factualReviewLevelDefinition('quick').promptContractDigest;
    return { promptContractDigest: admitted.includes(definition.promptContractDigest) || quick ? definition.promptContractDigest : null, payloadCategories: ['public-or-synthetic'] };
  }
  if (definition.kind === reviewCategoryKindId('cross-deliverable-consistency')) return {
    promptContractDigest: definition.livePromptContractDigest?.() ?? null,
    payloadCategories: plannedPayloadCategories(definition.kind)!,
  };
  // A custom analysis dimension (slice 7f owns the kind definition): the definition must re-derive its own live contract digest from the
  // dimension version's frozen template through `livePromptContractDigest`; without it the expectation is null and the kind is refused.
  if (isCustomAnalysisKind(definition.kind)) return { promptContractDigest: definition.livePromptContractDigest?.() ?? null, payloadCategories: plannedPayloadCategories(definition.kind)! };
  const review = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((category) => reviewCategoryKindId(category.categoryId) === definition.kind);
  if (review !== undefined) {
    if (review.executor !== 'review-category-contract' || review.seriesKnowledge !== undefined) return null;
    const input = reviewCategoryContractInput(review);
    const tools = kindLocalTools(policy, definition.kind) ?? undefined;
    const candidates = [reviewCategoryKindDefinition(input, 1), reviewCategoryKindDefinition(input, 2, undefined, 4),
      reviewCategoryKindDefinition(input, 2, tools, 4), reviewCategoryKindDefinition(input, 2, undefined, 2),
      reviewCategoryKindDefinition(input, 2, tools, 3)];
    const expectedBase = liveMaterialContract(definition)?.basePromptContractDigest ?? definition.promptContractDigest;
    return {
      promptContractDigest: candidates.find((entry) => entry.promptContractDigest === expectedBase)?.promptContractDigest ?? null,
      payloadCategories: ['public-or-synthetic'],
    };
  }
  const planned = plannedPayloadCategories(definition.kind);
  // Only 初评 and 审稿意见 have evaluation material wrappers; rewriting an editor's scores has none.
  if (definition.kind === EVALUATION_REWRITE_KIND && liveMaterialContract(definition) !== null) return null;
  if (planned !== undefined) return { promptContractDigest: liveMaterialContract(definition)?.basePromptContractDigest ?? definition.livePromptContractDigest?.() ?? null, payloadCategories: planned };
  return null;
}

/** The one admission the shared execution owner and the analysis ledger ask for a non-baseline kind under developer-live. */
export function liveKindAdmission(
  policy: LaunchPolicyProjection | undefined,
  definition: LiveKindDefinition,
  binding: LiveKindBinding,
): LiveKindRule | null {
  const consistency = liveSeriesConsistencyContract(definition);
  if (consistency !== null) {
    if (definition.kind !== reviewCategoryKindId('series-consistency') || consistency.digest !== definition.promptContractDigest ||
        consistency.system !== definition.systemPrompt || liveKindRule(policy, definition.kind, ['series-knowledge-excerpt'])?.seriesKnowledgeAllowed !== true) return null;
    return liveKindAdmitted(policy, definition.kind, definition, binding, { promptContractDigest: consistency.digest, payloadCategories: ['public-or-synthetic', 'series-knowledge-excerpt'] });
  }
  const series = liveSeriesContract(definition);
  if (series !== null) {
    if (series.digest !== definition.promptContractDigest || series.system !== definition.systemPrompt ||
        liveKindRule(policy, definition.kind, ['series-knowledge-excerpt'])?.seriesKnowledgeAllowed !== true) return null;
    return liveKindAdmission(policy, series.base, binding);
  }
  const wrapped = definition as LiveKindDefinition & { clarificationBase?: AnalysisKindDefinition };
  if (wrapped.clarificationBase !== undefined) {
    const expected = withModelClarification(wrapped.clarificationBase);
    const rule = liveKindRule(policy, definition.kind);
    if (rule?.clarificationQuestionAllowed !== true ||
        expected.promptContractDigest !== definition.promptContractDigest || expected.systemPrompt !== definition.systemPrompt) return null;
    return liveKindAdmission(policy, wrapped.clarificationBase, binding);
  }
  const preference = liveHouseReviewPreferenceContract(definition);
  if (preference !== null) {
    if (preference.promptContractDigest !== definition.promptContractDigest || preference.systemPrompt !== definition.systemPrompt ||
        liveKindRule(policy, definition.kind, ['house-review-preference-excerpt']) === null) return null;
    // Re-enter the unchanged base path, including its own material/deliverable proofs and source categories.
    return liveKindAdmission(policy, preference.base, binding);
  }
  const category = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => reviewCategoryKindId(entry.categoryId) === definition.kind ||
    (definition.kind === FACTUAL_REVIEW_KIND && entry.categoryId === 'factual-review'));
  if (category?.categoryId === 'publication-risk' &&
      (policy?.operationalScope !== 'ordinary-production' ||
        liveKindRule(policy, definition.kind)?.taskKindOverrides?.[definition.kind]?.webSearch !== false)) return null;
  if (category !== undefined && category.searchEngine &&
      (platformToolsFromProjection(liveKindRule(policy, definition.kind)) === null || !modelAdmitsPlatformTools(binding.route, binding.model))) return null;
  const expectation = liveKindExpectation(definition, policy);
  return expectation === null ? null : liveKindAdmitted(policy, definition.kind, definition, binding, expectation);
}

/** The categories a kind's payload carries besides the binding's own public or synthetic material. */
export function liveKindContractCategories(kind: string, definition?: LiveKindDefinition): readonly OutboundDataCategory[] {
  if (definition !== undefined && liveSeriesConsistencyContract(definition) !== null) return ['series-knowledge-excerpt'];
  const series = definition === undefined ? null : liveSeriesContract(definition);
  if (series !== null) return [...liveKindContractCategories(kind, series.base), 'series-knowledge-excerpt'];
  const preference = definition === undefined ? null : liveHouseReviewPreferenceContract(definition);
  if (preference !== null) return [...liveKindContractCategories(kind, preference.base), 'house-review-preference-excerpt'];
  return [...(plannedPayloadCategories(kind) ?? []).filter((category) => category !== 'public-or-synthetic'),
    ...(definition === undefined || liveMaterialContract(definition) === null ? [] : ['frozen-material-reference-excerpt'] as const)];
}

/**
 * Whether a Run's model may be handed the platform tools: its profile declares the client function loop on recorded evidence
 * (ADR 0080 §2, §7.7). A rule naming the tools is not enough — a web-bearing category on any other model is not admitted, and
 * writing and evaluation run on it without tools, as they did before the rule named them.
 */
export function modelAdmitsPlatformTools(route: string, model: string): boolean {
  const profile = modelProfileFor(route as RemoteExecutionRoute, model);
  return profile?.capabilities.toolCalling === 'function' && profile.evidence.toolCalling.kind === 'live-test-item' &&
    profile.evidence.toolCalling.itemIds.length > 0;
}

/** Local retrieval never changes web declarations. Baseline and enrolled background remain outside targeted retrieval. */
export function kindLocalTools(policy: LaunchPolicyProjection | undefined, kind: string, origin: 'foreground' | 'background' = 'foreground'): LocalToolsRule | null {
  if (kind === 'baseline-manuscript-analysis' || origin === 'background') return null;
  const rule = liveKindRule(policy, kind, [], origin);
  return rule === null || !modelAdmitsPlatformTools(rule.route, rule.model) ? null : localToolsFromProjection(rule);
}

/** ADR 0080 rows 15/17 and the two admitted review categories; row 10 remains excluded this wave. */
export function kindResearchDeclaration(
  policy: LaunchPolicyProjection | undefined,
  kind: string,
  declaration?: ResearchDeclaration,
): ResearchDeclaration {
  const rule = liveKindRule(policy, kind);
  const webSearch = taskDeclaresPlatformTools(kind) && declaration?.webSearch !== false &&
    rule?.taskKindOverrides?.[kind]?.webSearch !== false &&
    rule?.webSearchToolAllowed === true && platformToolsFromProjection(rule) !== null &&
    modelAdmitsPlatformTools(rule.route, rule.model);
  return { webSearch, searchEngine: webSearch ? 'user-selected-backend' : null };
}

/**
 * Review categories use their current declaration; a policy allowance alone never turns non-web review into research.
 * Of the evaluation and writing kinds only 初评 (its market section, row 15) and writing (row 17) are web-bearing: 审稿意见
 * (row 16) and rewriting the editor's scores (row 14) declare no web even where a rule names the tools.
 */
export function taskDeclaresPlatformTools(kind: string): boolean {
  if (kind === FACTUAL_REVIEW_KIND) return true;
  const review = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => reviewCategoryKindId(entry.categoryId) === kind);
  if (review !== undefined) return review.researchDeclaration?.webSearch === true && review.searchEngine && review.categoryId !== 'publication-risk';
  return kind === WRITING_KIND || kind === INITIAL_EVALUATION_KIND;
}

/** Per-kind enrollment permissions; later consumers still require exact dispatch admission. */
export function backgroundEnrollmentKinds(policy: LaunchPolicyProjection | undefined): readonly { kind: string; mandatoryCeiling: true }[] {
  if (policy?.integrityState !== 'verified' || policy.denialReason !== null) return [];
  const baseline = liveKindRule(policy, 'baseline-manuscript-analysis', [], 'background') === null ? [] : [{ kind: 'baseline-analysis', mandatoryCeiling: true as const }];
  return [...baseline, ...(policy.providerProcessing.backgroundProcessingEnrollment?.enrollableKinds ?? [])];
}
