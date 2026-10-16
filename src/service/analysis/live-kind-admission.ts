import { FACTUAL_REVIEW_KIND } from '../../shared/protocol.js';
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
import { factualReviewKindDefinition, withFactualResearch, type AnalysisKindDefinition } from './kind-definition.js';

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
  readonly promptContractDigest: string;
  readonly livePromptContractDigest?: () => string;
  readonly materialReferences?: unknown;
  readonly systemPrompt?: string;
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
 * ambiguous rule fails closed. The enrolled-background rule (`backgroundOrigin`, Provider Processing v14 and v15) lists the baseline
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
    rule.taskKinds.includes(kind) && (rule.backgroundOrigin === true) === (origin === 'background'));
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

/** Every outbound category a planned kind's payload carries; `undefined` for a kind with no row. */
function plannedPayloadCategories(kind: string): readonly OutboundDataCategory[] | undefined {
  if (kind === reviewCategoryKindId('cross-deliverable-consistency')) return ['public-or-synthetic', 'editorial-deliverable-excerpt'];
  return kind === WRITING_KIND ? WRITING_PAYLOAD_CATEGORIES : EVALUATION_PAYLOAD_CATEGORIES[kind];
}

/**
 * What a kind's live contract must be, by kind. A review category is re-derived from the built-in configuration, exactly as
 * #809 admitted it. An evaluation or writing owner re-derives its contract from the Task's frozen inputs (profile, record,
 * metadata, words and exemplars); a missing owner derivation or a changed declared digest refuses admission. Any other
 * kind has no row and is not admitted.
 */
function liveKindExpectation(definition: LiveKindDefinition): LiveKindExpectation | null {
  if (definition.kind === FACTUAL_REVIEW_KIND) return { promptContractDigest: withFactualResearch(factualReviewKindDefinition()).promptContractDigest, payloadCategories: ['public-or-synthetic'] };
  if (definition.kind === reviewCategoryKindId('cross-deliverable-consistency')) return {
    promptContractDigest: definition.livePromptContractDigest?.() ?? null,
    payloadCategories: plannedPayloadCategories(definition.kind)!,
  };
  const review = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((category) => reviewCategoryKindId(category.categoryId) === definition.kind);
  if (review !== undefined) {
    if (review.executor !== 'review-category-contract' || review.seriesKnowledge !== undefined) return null;
    return {
      promptContractDigest: reviewCategoryKindDefinition(reviewCategoryContractInput(review)).promptContractDigest,
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
  const wrapped = definition as LiveKindDefinition & { clarificationBase?: AnalysisKindDefinition };
  if (wrapped.clarificationBase !== undefined) {
    const expected = withModelClarification(wrapped.clarificationBase);
    const rule = liveKindRule(policy, definition.kind);
    if (rule?.clarificationQuestionAllowed !== true ||
        expected.promptContractDigest !== definition.promptContractDigest || expected.systemPrompt !== definition.systemPrompt) return null;
    return liveKindAdmission(policy, wrapped.clarificationBase, binding);
  }
  const category = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => reviewCategoryKindId(entry.categoryId) === definition.kind ||
    (definition.kind === FACTUAL_REVIEW_KIND && entry.categoryId === 'factual-review'));
  if (category?.categoryId === 'publication-risk') return null;
  if (category !== undefined && category.searchEngine &&
      (platformToolsFromProjection(liveKindRule(policy, definition.kind)) === null || !modelAdmitsPlatformTools(binding.route, binding.model))) return null;
  const expectation = liveKindExpectation(definition);
  return expectation === null ? null : liveKindAdmitted(policy, definition.kind, definition, binding, expectation);
}

/** The categories a kind's payload carries besides the binding's own public or synthetic material. */
export function liveKindContractCategories(kind: string, definition?: LiveKindDefinition): readonly OutboundDataCategory[] {
  return [...(plannedPayloadCategories(kind) ?? []).filter((category) => category !== 'public-or-synthetic'),
    ...(definition === undefined || liveMaterialContract(definition) === null ? [] : ['frozen-material-reference-excerpt'] as const)];
}

/**
 * Whether a Run's model may be handed the platform tools: its profile declares the client function loop on recorded evidence
 * (ADR 0080 §2, §7.7). A rule naming the tools is not enough — a web-bearing category on any other model is not admitted, and
 * writing and evaluation run on it without tools, as they did before the rule named them.
 */
export function modelAdmitsPlatformTools(route: string, model: string): boolean {
  return modelProfileFor(route as RemoteExecutionRoute, model)?.capabilities.toolCalling === 'function';
}

/** Review categories use their current declaration; a policy allowance alone never turns non-web review into research. */
export function taskDeclaresPlatformTools(kind: string): boolean {
  if (kind === FACTUAL_REVIEW_KIND) return true;
  const review = BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => reviewCategoryKindId(entry.categoryId) === kind);
  if (review !== undefined) return review.searchEngine && review.categoryId !== 'publication-risk';
  return [WRITING_KIND, INITIAL_EVALUATION_KIND, EVALUATION_REWRITE_KIND, READERS_REPORT_KIND].some((candidate) => candidate === kind);
}
