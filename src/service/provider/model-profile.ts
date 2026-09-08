import {
  DEEPSEEK_MODEL,
  DEEPSEEK_ROUTE,
  OPENCODE_GO_MESSAGES_ROUTE,
  OPENCODE_GO_MODEL,
  OPENCODE_GO_RESPONSES_ROUTE,
  OPENCODE_GO_ROUTE,
  type RemoteExecutionRoute,
} from './egress-gate.js';

/**
 * What one model can be asked to do, declared rather than inferred (Issue #310).
 *
 * A route profile says how to *reach* a model — endpoint, credential slot, headers, limit reading.
 * This module says how to *speak to* one, and the two are separate because one route serves many
 * models: ADR 0067 records the `opencode-go` gateway carrying DeepSeek, GLM, Kimi, Qwen, MiniMax,
 * GPT, and Grok across three API shapes. A model profile is therefore keyed by `${route}/${model}`,
 * never by route alone.
 *
 * The rule that keeps this table from becoming a wish list: **an unverified capability is declared
 * absent.** Every value records how it was established, and a capability nobody has seen work is
 * `none`. That is exactly what went wrong before this module existed — the unit contract relied on a
 * JSON-object guarantee that was never requested of the gateway, let alone verified, and it failed
 * three of eight units on the first live Run (#307, #306).
 *
 * Adding a model is adding data here. If a new model needs a change in the adapter's control flow,
 * the missing fact belongs in this table instead.
 */

/**
 * How the request body is assembled. ADR 0067 records that the Go gateway serves Qwen and MiniMax
 * over the Anthropic-compatible `/messages` path and GPT and Grok over `/responses`; all three
 * shapes are named here so a profile can state its shape honestly, and all three are assembled as of
 * S54c. What a profile declares is still what it gets: the adapter reads this field and nothing else.
 *
 * `google-generate-content` is the fourth and the first that no route of this gateway serves: Gemini
 * is on no OpenCode Go path, so the shape is assembled and read against test-local profiles until a
 * route with the credential slot its own endpoint needs arrives (plan slot 1c.10).
 */
export type RequestShape =
  | 'openai-chat-completions'
  | 'anthropic-messages'
  | 'openai-responses'
  | 'google-generate-content';

/** What parameters control reasoning. `deepseek-thinking` is the production route's `thinking` plus `reasoning_effort`. */
export type ReasoningControl = 'none' | 'deepseek-thinking';

/**
 * How a JSON answer is *required* of the model, as opposed to merely asked for in the prompt.
 * `json-object` is the chat-completions `response_format` constraint the adapter assembles, and only
 * `opencode-go/deepseek-v4-flash` declares it, on the strength of the one live test item that
 * observed the gateway accept it (Issue #306). Every other profile declares `none`, because an
 * OpenAI-compatible endpoint is not evidence that it accepts a format constraint. `json-schema` and
 * `tool-call` are named so a profile can state its shape honestly and refuse at assembly.
 */
export type StructuredOutput = 'none' | 'json-object' | 'json-schema' | 'tool-call';

/**
 * Where the answer text is read from; `none` means no channel is declared and every response is
 * malformed. `content-text-blocks` is the Anthropic-compatible shape's channel: the answer is the
 * concatenation of the `text` of every `type: 'text'` block, in the order the response lists them.
 * `output-message-text` is the Responses shape's: the answer is the concatenation of the `text` of
 * every `type: 'output_text'` part of every `type: 'message'` item of `output`, in that same order,
 * and a `type: 'refusal'` part is not answer text, so a message carrying only refusals answers empty.
 * `candidate-parts-text` is the generateContent shape's: the answer is the concatenation of the
 * `text` of every part of the *first* candidate whose `thought` is not `true`, in that same order —
 * the first candidate alone, because the request asks for one and a second would be a different
 * answer rather than more of this one.
 */
export type AnswerChannel =
  | 'none'
  | 'message-content-string'
  | 'content-text-blocks'
  | 'output-message-text'
  | 'candidate-parts-text';

/**
 * Where reasoning is read from when the model reports it separately from the answer.
 * `content-thinking-blocks` declares presence and nothing more: a `type: 'thinking'` block in the
 * content array means the model reasoned, which is the whole of what an empty answer needs to know.
 * `output-reasoning-items` says the same of a `type: 'reasoning'` item of the Responses shape's
 * `output`: its presence is read, and neither its `summary` nor its `content` is.
 * `candidate-thought-parts` says the same of a part flagged `thought: true` in the first candidate of
 * the generateContent shape: the flag is read, the text beside it is not.
 */
export type ReasoningChannel =
  | 'none'
  | 'message-reasoning-content'
  | 'content-thinking-blocks'
  | 'output-reasoning-items'
  | 'candidate-thought-parts';

/** Whether the reported output tokens include reasoning tokens; `unknown` until something has measured it. */
export type UsageAttribution = 'includes-reasoning' | 'separate' | 'unknown';

export interface ModelCapabilities {
  readonly requestShape: RequestShape;
  readonly reasoningControl: ReasoningControl;
  readonly structuredOutput: StructuredOutput;
  readonly answerChannel: AnswerChannel;
  readonly reasoningChannel: ReasoningChannel;
  readonly usageAttribution: UsageAttribution;
}

/**
 * How one capability value was established. `unverified` is the honest record behind every `none`
 * and every `unknown`; the other three each name something a reader can go and check.
 * `frozen-request-baseline` covers the production route's request-side values, which predate this
 * table, are pinned byte for byte by the adapter suite, and have never been transmitted live.
 */
export type CapabilityEvidence =
  | { readonly kind: 'vendor-documentation'; readonly source: string; readonly readOn: string }
  | { readonly kind: 'live-test-item'; readonly itemIds: ReadonlyArray<string>; readonly observedOn: string }
  | { readonly kind: 'frozen-request-baseline'; readonly since: string }
  | { readonly kind: 'unverified' };

/** One evidence record per capability: the table declares nothing it cannot say the provenance of. */
export type CapabilityEvidenceRecord = { readonly [Capability in keyof ModelCapabilities]: CapabilityEvidence };

/** `${route}/${model}`, because one route serves many models and one model id may serve two routes. */
export type ModelProfileKey = `${RemoteExecutionRoute}/${string}`;

export interface ProviderModelProfile {
  readonly key: ModelProfileKey;
  readonly route: RemoteExecutionRoute;
  readonly model: string;
  readonly displayName: string;
  readonly capabilities: ModelCapabilities;
  readonly evidence: CapabilityEvidenceRecord;
}

export function modelProfileKey(route: RemoteExecutionRoute, model: string): ModelProfileKey {
  return `${route}/${model}`;
}

/**
 * ADR 0067's facts about the Go gateway, read from the OpenCode documentation on the date it records.
 * Exported because a route states the provenance of its credential header form from the same reading.
 */
export const ADR_0067_DOCUMENTATION: CapabilityEvidence = {
  kind: 'vendor-documentation',
  source: 'ADR 0067 · OpenCode Go documentation',
  readOn: '2026-09-06',
};

/** The eight test items of the first live Run, `S40/smoke/1` of 2026-09-07, recorded on #307. */
const FIRST_LIVE_RUN: CapabilityEvidence = {
  kind: 'live-test-item',
  itemIds: ['S40/first-baseline/1', 'S40/first-baseline/2', 'S40/first-baseline/3', 'S40/first-baseline/4',
    'S40/first-baseline/5', 'S40/first-baseline/6', 'S40/first-baseline/7', 'S40/first-baseline/8'],
  observedOn: '2026-09-07',
};

/**
 * The one live test item that put a format constraint on this gateway, `S40/reanalyze-range/1` of
 * 2026-09-08, recorded on #306. One item, one response, one capability: it is evidence that the
 * field is accepted, and evidence of nothing else.
 */
const JSON_OBJECT_LIVE_ITEM: CapabilityEvidence = {
  kind: 'live-test-item',
  itemIds: ['S40/reanalyze-range/1'],
  observedOn: '2026-09-08',
};

/**
 * The documentation pair the OpenCode Go plan's models are declared from, read on 2026-09-08: the Go
 * page for which path the gateway serves each model on, the Zen model table for the exact id it
 * answers to. It is one record rather than two because a model needs both facts to be declarable at
 * all — a path without an id cannot be keyed, and an id without a path cannot be assembled — and one
 * constant rather than a copy per profile because both paths are a single reading of one pair of
 * pages.
 *
 * Where the two pages disagree, the Go page decides and the disagreement is recorded rather than
 * resolved: it is the page that describes this plan, and only a live item can settle which path a
 * model actually answers on.
 */
const OPENCODE_GO_PLAN_DOCUMENTATION: CapabilityEvidence = {
  kind: 'vendor-documentation',
  source: 'OpenCode Go https://opencode.ai/docs/go/ · Zen model table https://opencode.ai/docs/zen/',
  readOn: '2026-09-08',
};

/**
 * The same reading of the same pair, plus the source the third shape's own contract came from. The
 * vendor's platform reference page refuses an unauthenticated fetch, so the shape is read from the
 * published SDK instead, named by the exact commit that was read rather than by a moving branch.
 *
 * A `/responses` row therefore names three sources for the one capability it declares — which path
 * the gateway serves the model on, which id it answers to, and what the shape on that path is —
 * because that is what establishing it took.
 */
const OPENCODE_GO_RESPONSES_DOCUMENTATION: CapabilityEvidence = {
  kind: 'vendor-documentation',
  source: 'OpenCode Go https://opencode.ai/docs/go/ · Zen model table https://opencode.ai/docs/zen/' +
    ' · OpenAI Node SDK src/resources/responses/responses.ts@eecbebe294be7e657c99a34eb104a6a4b507335c',
  readOn: '2026-09-08',
};

export const PRODUCTION_BASELINE: CapabilityEvidence = { kind: 'frozen-request-baseline', since: 'adapter revision 1' };
const UNVERIFIED: CapabilityEvidence = { kind: 'unverified' };

/**
 * The production model. Its request side is exactly what adapter revision 1 has always sent; its
 * response side has never been observed, because no Run has ever transmitted on this route, so every
 * read-side capability is declared absent.
 */
export const DEEPSEEK_V4_PRO_PROFILE: ProviderModelProfile = {
  key: modelProfileKey(DEEPSEEK_ROUTE, DEEPSEEK_MODEL),
  route: DEEPSEEK_ROUTE,
  model: DEEPSEEK_MODEL,
  displayName: 'DeepSeek V4 Pro High',
  capabilities: {
    requestShape: 'openai-chat-completions',
    reasoningControl: 'deepseek-thinking',
    structuredOutput: 'none',
    answerChannel: 'message-content-string',
    reasoningChannel: 'none',
    usageAttribution: 'unknown',
  },
  evidence: {
    requestShape: PRODUCTION_BASELINE,
    reasoningControl: PRODUCTION_BASELINE,
    structuredOutput: UNVERIFIED,
    answerChannel: PRODUCTION_BASELINE,
    reasoningChannel: UNVERIFIED,
    usageAttribution: UNVERIFIED,
  },
};

/**
 * The developer-live model. Its two read-side capabilities beyond the answer channel come from the
 * first live Run's eight test items, whose responses live in the ADR 0067 Provider Result Cache
 * outside every checkout. It sends no DeepSeek-specific parameter: the gateway's acceptance of one
 * is unverified, and this table's rule is to declare that as absence rather than to assume it.
 *
 * It is the one profile that requires a JSON answer, and test item `S40/reanalyze-range/1` of
 * 2026-09-08 is exactly why. That item established two things: the gateway accepted
 * `response_format: {"type":"json_object"}` on this route without error — nothing in the response
 * named the field, or the prompt's JSON-mode precondition — and the very unit that had returned an
 * empty answer channel on the first live Run returned a JSON object the unit contract parsed.
 *
 * It established nothing further. One item is one response, so it does not show that the constraint
 * is honoured on every response: an empty answer and an unparsable answer remain outcomes the
 * execution owner reads and reports, not cases this declaration rules out.
 */
export const OPENCODE_GO_V4_FLASH_PROFILE: ProviderModelProfile = {
  key: modelProfileKey(OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL),
  route: OPENCODE_GO_ROUTE,
  model: OPENCODE_GO_MODEL,
  displayName: 'DeepSeek V4 Flash',
  capabilities: {
    requestShape: 'openai-chat-completions',
    reasoningControl: 'none',
    structuredOutput: 'json-object',
    answerChannel: 'message-content-string',
    reasoningChannel: 'message-reasoning-content',
    usageAttribution: 'includes-reasoning',
  },
  evidence: {
    requestShape: ADR_0067_DOCUMENTATION,
    reasoningControl: UNVERIFIED,
    structuredOutput: JSON_OBJECT_LIVE_ITEM,
    answerChannel: FIRST_LIVE_RUN,
    reasoningChannel: FIRST_LIVE_RUN,
    usageAttribution: FIRST_LIVE_RUN,
  },
};

/**
 * A third model the same gateway serves, declared and left inactive: no binding references it, and
 * the adapter needed no branch to accommodate it. It exists to demonstrate the property this slice
 * bought — adding a model is adding data — and to show why the key is composite, since the same
 * model id behind the production route is a different profile with different capabilities.
 */
export const OPENCODE_GO_V4_PRO_PROFILE: ProviderModelProfile = {
  key: modelProfileKey(OPENCODE_GO_ROUTE, DEEPSEEK_MODEL),
  route: OPENCODE_GO_ROUTE,
  model: DEEPSEEK_MODEL,
  displayName: 'DeepSeek V4 Pro（OpenCode Go）',
  capabilities: {
    requestShape: 'openai-chat-completions',
    reasoningControl: 'none',
    structuredOutput: 'none',
    answerChannel: 'none',
    reasoningChannel: 'none',
    usageAttribution: 'unknown',
  },
  evidence: {
    requestShape: ADR_0067_DOCUMENTATION,
    reasoningControl: UNVERIFIED,
    structuredOutput: UNVERIFIED,
    answerChannel: UNVERIFIED,
    reasoningChannel: UNVERIFIED,
    usageAttribution: UNVERIFIED,
  },
};

/** One path of the OpenCode Go plan: the route that reaches it and the shape it is spoken to in. */
interface OpenCodeGoPath {
  readonly route: RemoteExecutionRoute;
  readonly requestShape: RequestShape;
  /**
   * What established the shape of this path, carried by the path because it differs between them:
   * two of the three are read from the documentation pair alone, and the third needed the vendor's
   * SDK beside it. A row states the provenance it actually has, not the one its neighbours have.
   */
  readonly documentation: CapabilityEvidence;
}

const GO_CHAT_COMPLETIONS: OpenCodeGoPath = {
  route: OPENCODE_GO_ROUTE,
  requestShape: 'openai-chat-completions',
  documentation: OPENCODE_GO_PLAN_DOCUMENTATION,
};
const GO_MESSAGES: OpenCodeGoPath = {
  route: OPENCODE_GO_MESSAGES_ROUTE,
  requestShape: 'anthropic-messages',
  documentation: OPENCODE_GO_PLAN_DOCUMENTATION,
};
const GO_RESPONSES: OpenCodeGoPath = {
  route: OPENCODE_GO_RESPONSES_ROUTE,
  requestShape: 'openai-responses',
  documentation: OPENCODE_GO_RESPONSES_DOCUMENTATION,
};

/**
 * One more model of the same gateway, declared exactly as the profile above declares its own: the
 * documentation pair establishes which path it is reached on and under which id, and nothing
 * establishes anything else, so every other capability is absent and says why. The shape is a
 * function rather than thirteen more copies of the literal above because they differ only in a path,
 * an id, and a printed name: inert becomes a property of the construction, not of thirteen chances to
 * restate it. `answerChannel: 'none'` is the whole of what makes a row inert — a profile that
 * declares no answer channel cannot read any response — and only a live test item may ever move one
 * of these values, never a declaration.
 *
 * The path is a parameter because that is exactly what a second and a third request shape cost this
 * table: a model on `/messages` or `/responses` is the same row with three of its fields — the
 * route, the shape, and what established the shape — read from somewhere else.
 */
function inertOpenCodeGoModel(path: OpenCodeGoPath, model: string, productName: string): ProviderModelProfile {
  return {
    key: modelProfileKey(path.route, model),
    route: path.route,
    model,
    displayName: `${productName}（OpenCode Go）`,
    capabilities: {
      requestShape: path.requestShape,
      reasoningControl: 'none',
      structuredOutput: 'none',
      answerChannel: 'none',
      reasoningChannel: 'none',
      usageAttribution: 'unknown',
    },
    evidence: {
      requestShape: path.documentation,
      reasoningControl: UNVERIFIED,
      structuredOutput: UNVERIFIED,
      answerChannel: UNVERIFIED,
      reasoningChannel: UNVERIFIED,
      usageAttribution: UNVERIFIED,
    },
  };
}

/*
 * Every remaining model the documentation pair admits on `chat/completions`: the Go page places it
 * there **and** the Zen model table states its id verbatim. Both facts or no row, because an id the
 * documentation does not print is a guess, and a guess is the failure this table exists to prevent.
 * None of them is exported: nothing above the provider layer may name one, and a profile no module
 * can import is a profile no binding can reach.
 *
 * Named by the documentation and deliberately absent:
 * - LongCat-2.0, Hy4 preview, Hy3, Omen Alpha, MiMo-V2.5, MiMo-V2.5-Pro — the Go page names the
 *   product, the Zen table states no id for it, so there is nothing to key a row by.
 * - Qwen3.8 Flash — the Go page places it on `/messages`, but the Zen table states no id for it.
 */
const OPENCODE_GO_GLM_5_3_FLASH_PROFILE = inertOpenCodeGoModel(GO_CHAT_COMPLETIONS, 'glm-5.3-flash', 'GLM-5.3-Flash');
const OPENCODE_GO_GLM_5_3_PROFILE = inertOpenCodeGoModel(GO_CHAT_COMPLETIONS, 'glm-5.3', 'GLM-5.3');
const OPENCODE_GO_GLM_5_2_PROFILE = inertOpenCodeGoModel(GO_CHAT_COMPLETIONS, 'glm-5.2', 'GLM-5.2');
const OPENCODE_GO_GLM_5_1_PROFILE = inertOpenCodeGoModel(GO_CHAT_COMPLETIONS, 'glm-5.1', 'GLM-5.1');
const OPENCODE_GO_KIMI_K3_PROFILE = inertOpenCodeGoModel(GO_CHAT_COMPLETIONS, 'kimi-k3', 'Kimi K3');
const OPENCODE_GO_KIMI_K2_7_CODE_PROFILE = inertOpenCodeGoModel(GO_CHAT_COMPLETIONS, 'kimi-k2.7-code', 'Kimi K2.7 Code');
const OPENCODE_GO_KIMI_K2_6_PROFILE = inertOpenCodeGoModel(GO_CHAT_COMPLETIONS, 'kimi-k2.6', 'Kimi K2.6');
const OPENCODE_GO_V4_FLASH_VISION_EXP_PROFILE = inertOpenCodeGoModel(GO_CHAT_COMPLETIONS, 'deepseek-v4-flash-vision-exp', 'DeepSeek V4 Flash Vision Exp');

/*
 * The same admitted-set rule applied to the plan's `/messages` path, which the `anthropic-messages`
 * shape now makes declarable. Every row is inert exactly as the rows above are: the request shape is
 * established, and everything a response would have taught is not.
 *
 * MiniMax is here on a disagreement, not on agreement. The Go page places it on `/messages`; the Zen
 * table places it on `chat/completions`. The Go page decides, because it is the page that describes
 * this plan, and the disagreement is recorded here rather than resolved: the first live item on one
 * of these ids settles it, and until then declaring the wrong path costs nothing, since no profile
 * on this route can read a response at all.
 */
const OPENCODE_GO_QWEN_3_7_PLUS_PROFILE = inertOpenCodeGoModel(GO_MESSAGES, 'qwen3.7-plus', 'Qwen3.7 Plus');
const OPENCODE_GO_QWEN_3_6_PLUS_PROFILE = inertOpenCodeGoModel(GO_MESSAGES, 'qwen3.6-plus', 'Qwen3.6 Plus');
const OPENCODE_GO_MINIMAX_M3_PROFILE = inertOpenCodeGoModel(GO_MESSAGES, 'minimax-m3', 'MiniMax M3');
const OPENCODE_GO_MINIMAX_M2_7_PROFILE = inertOpenCodeGoModel(GO_MESSAGES, 'minimax-m2.7', 'MiniMax M2.7');
const OPENCODE_GO_MINIMAX_M2_5_PROFILE = inertOpenCodeGoModel(GO_MESSAGES, 'minimax-m2.5', 'MiniMax M2.5');

/*
 * The same admitted-set rule applied to the plan's `/responses` path, which the `openai-responses`
 * shape now makes declarable. The Go page places four products there; the Zen model table states an
 * id verbatim for two of them, and those two are the rows.
 *
 * Named by the documentation and deliberately absent:
 * - Muse Spark 1.3 / 1.2 — the two pages disagree on the id itself, not on the path: the Go page
 *   prints `muse-spark-1.3-contributor` and `muse-spark-1.2-contributor`, the Zen table prints
 *   `muse-spark-1.3` and `muse-spark-1.2`. No id is stated by both, so there is none to key a row
 *   by, and picking one would be the guess this table exists to prevent.
 * - The Zen table's further `/responses` rows — the GPT 5.x family, Grok 4.5, Grok Build — are Zen
 *   rather than the Go plan, and this table declares the plan the credential slot reaches.
 */
const OPENCODE_GO_GROK_4_6_PROFILE = inertOpenCodeGoModel(GO_RESPONSES, 'grok-4.6', 'Grok 4.6');
const OPENCODE_GO_GPT_5_6_LUNA_PROFILE = inertOpenCodeGoModel(GO_RESPONSES, 'gpt-5.6-luna', 'GPT 5.6 Luna');

export const PROVIDER_MODEL_PROFILES: Readonly<Record<ModelProfileKey, ProviderModelProfile>> = {
  [DEEPSEEK_V4_PRO_PROFILE.key]: DEEPSEEK_V4_PRO_PROFILE,
  [OPENCODE_GO_V4_FLASH_PROFILE.key]: OPENCODE_GO_V4_FLASH_PROFILE,
  [OPENCODE_GO_V4_PRO_PROFILE.key]: OPENCODE_GO_V4_PRO_PROFILE,
  [OPENCODE_GO_GLM_5_3_FLASH_PROFILE.key]: OPENCODE_GO_GLM_5_3_FLASH_PROFILE,
  [OPENCODE_GO_GLM_5_3_PROFILE.key]: OPENCODE_GO_GLM_5_3_PROFILE,
  [OPENCODE_GO_GLM_5_2_PROFILE.key]: OPENCODE_GO_GLM_5_2_PROFILE,
  [OPENCODE_GO_GLM_5_1_PROFILE.key]: OPENCODE_GO_GLM_5_1_PROFILE,
  [OPENCODE_GO_KIMI_K3_PROFILE.key]: OPENCODE_GO_KIMI_K3_PROFILE,
  [OPENCODE_GO_KIMI_K2_7_CODE_PROFILE.key]: OPENCODE_GO_KIMI_K2_7_CODE_PROFILE,
  [OPENCODE_GO_KIMI_K2_6_PROFILE.key]: OPENCODE_GO_KIMI_K2_6_PROFILE,
  [OPENCODE_GO_V4_FLASH_VISION_EXP_PROFILE.key]: OPENCODE_GO_V4_FLASH_VISION_EXP_PROFILE,
  [OPENCODE_GO_QWEN_3_7_PLUS_PROFILE.key]: OPENCODE_GO_QWEN_3_7_PLUS_PROFILE,
  [OPENCODE_GO_QWEN_3_6_PLUS_PROFILE.key]: OPENCODE_GO_QWEN_3_6_PLUS_PROFILE,
  [OPENCODE_GO_MINIMAX_M3_PROFILE.key]: OPENCODE_GO_MINIMAX_M3_PROFILE,
  [OPENCODE_GO_MINIMAX_M2_7_PROFILE.key]: OPENCODE_GO_MINIMAX_M2_7_PROFILE,
  [OPENCODE_GO_MINIMAX_M2_5_PROFILE.key]: OPENCODE_GO_MINIMAX_M2_5_PROFILE,
  [OPENCODE_GO_GROK_4_6_PROFILE.key]: OPENCODE_GO_GROK_4_6_PROFILE,
  [OPENCODE_GO_GPT_5_6_LUNA_PROFILE.key]: OPENCODE_GO_GPT_5_6_LUNA_PROFILE,
};

/** The declared profile for one route and model, or `null` when nothing has declared that pair. */
export function modelProfileFor(route: RemoteExecutionRoute, model: string): ProviderModelProfile | null {
  return PROVIDER_MODEL_PROFILES[modelProfileKey(route, model)] ?? null;
}
