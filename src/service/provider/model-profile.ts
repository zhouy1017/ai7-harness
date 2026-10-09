import {
  DEEPSEEK_MODEL,
  DEEPSEEK_ROUTE,
  OPENCODE_GO_MODEL,
  OPENCODE_GO_ROUTE,
  type RemoteExecutionRoute,
} from './egress-gate.js';
import { GENERATED_MODEL_PROFILES } from './provider-profiles.generated.js';

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
 * Adding a model is adding data — since ADR 0073 (Issue #435, S55a) a row of a provider document
 * under `config/providers/`, from which `tools/generate-provider-configuration.mjs` generates
 * `./provider-profiles.generated.ts`; no profile is written here by hand. If a new model needs a
 * change in the adapter's control flow, the missing fact belongs in the document instead.
 */

/**
 * How the request body is assembled. ADR 0067 records that the Go gateway serves Qwen and MiniMax
 * over the Anthropic-compatible `/messages` path and GPT and Grok over `/responses`; all three
 * shapes are named here so a profile can state its shape honestly, and all three are assembled as of
 * S54c. What a profile declares is still what it gets: the adapter reads this field and nothing else.
 *
 * `google-generate-content` is the fourth and the first that no route of this gateway serves: Gemini
 * is on no OpenCode Go path, and the route its own endpoint needs is the `google-gemini` provider
 * document's (Issue #435), declared and inert until the shape review that document records.
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

/**
 * Whether the model, on the request shape its route speaks, accepts function tool definitions and
 * returns calls the client executes: `tools[].type: "function"` / `tool_calls` / `role: "tool"` on
 * OpenAI chat completions; `tools` / `tool_use` / `tool_result` on Anthropic messages; `function_call`
 * / `function_call_output` on Responses; `functionDeclarations` / `functionCall` / `functionResponse`
 * on Gemini (ADR 0080 §2). This is the capability every AI7 platform tool (§7 of that record) rides
 * on; nothing in this slice registers one.
 */
export type ToolCalling = 'none' | 'function';

/**
 * A **server-side** search tool of the model's own provider (Claude's `web_search_*`, OpenAI's
 * `web_search`, Gemini's `google_search`, and their kind — ADR 0080 §2). There is no `platform-tool`
 * value here: AI7's own `websearch` / `webfetch` tools are not a property of any binding — they ride
 * on `toolCalling: 'function'` instead, wherever a policy rule names them (ADR 0080 §7.5) — so a
 * profile only ever states whether its *provider* supplies a search tool of its own.
 */
export type WebSearchTool = 'none' | 'provider-tool';

export interface ModelCapabilities {
  readonly requestShape: RequestShape;
  readonly reasoningControl: ReasoningControl;
  readonly structuredOutput: StructuredOutput;
  readonly answerChannel: AnswerChannel;
  readonly reasoningChannel: ReasoningChannel;
  readonly usageAttribution: UsageAttribution;
  readonly toolCalling: ToolCalling;
  readonly webSearchTool: WebSearchTool;
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
  /**
   * The declared context size (ADR 0080 §2): the tokens the vendor page states for the model — an
   * input limit where the page states one apart from the window — with the page and the day, or
   * `null` where no page read states one. It is a declaration Provider Preflight may compare a plan's
   * largest transmission with; nothing reads it yet, and it moves no request byte.
   */
  readonly context: ModelContext;
}

export interface ModelContext {
  readonly tokens: number | null;
  readonly evidence: CapabilityEvidence;
}

export function modelProfileKey(route: RemoteExecutionRoute, model: string): ModelProfileKey {
  return `${route}/${model}`;
}

/**
 * Every declared profile, from the provider documents. A key appears once: the generator refuses a
 * duplicate model on a route and a duplicate route across documents, so building the table cannot
 * silently drop a row.
 */
export const PROVIDER_MODEL_PROFILES: Readonly<Record<ModelProfileKey, ProviderModelProfile>> = Object.freeze(
  Object.fromEntries(GENERATED_MODEL_PROFILES.map((profile) => [profile.key, profile])),
);

/** The declared profile for one route and model, or `null` when nothing has declared that pair. */
export function modelProfileFor(route: RemoteExecutionRoute, model: string): ProviderModelProfile | null {
  return PROVIDER_MODEL_PROFILES[modelProfileKey(route, model)] ?? null;
}

function declaredProfile(route: RemoteExecutionRoute, model: string): ProviderModelProfile {
  const profile = modelProfileFor(route, model);
  if (profile === null) throw new Error('PROVIDER_MODEL_PROFILE_UNDECLARED');
  return profile;
}

/**
 * The production model, as `config/providers/deepseek-open-platform.json` declares it. Its request
 * side is exactly what adapter revision 1 has always sent; its response side has never been observed.
 * Which route and model production binds is the egress gate's pair (#452's gate share, S87-f3b), not
 * this table's.
 */
export const DEEPSEEK_V4_PRO_PROFILE: ProviderModelProfile = declaredProfile(DEEPSEEK_ROUTE, DEEPSEEK_MODEL);

/** The developer-live model of Provider Processing v5, as `config/providers/opencode-go.json` declares it. */
export const OPENCODE_GO_V4_FLASH_PROFILE: ProviderModelProfile = declaredProfile(OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL);

/**
 * The production model's id behind the developer-live gateway: a different profile with different
 * capabilities, which is why the key is composite. Declared and inert; no binding references it.
 */
export const OPENCODE_GO_V4_PRO_PROFILE: ProviderModelProfile = declaredProfile(OPENCODE_GO_ROUTE, DEEPSEEK_MODEL);

