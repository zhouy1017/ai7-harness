import {
  DEEPSEEK_MODEL,
  DEEPSEEK_ROUTE,
  OPENCODE_GO_MODEL,
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
 * over the Anthropic-compatible `/messages` path and GPT and Grok over `/responses`; both are named
 * here so a profile can state its shape honestly, and both refuse at assembly until an adapter
 * implements them. Naming a shape is not implementing it.
 */
export type RequestShape = 'openai-chat-completions' | 'anthropic-messages' | 'openai-responses';

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

/** Where the answer text is read from; `none` means no channel is declared and every response is malformed. */
export type AnswerChannel = 'none' | 'message-content-string';

/** Where reasoning is read from when the model reports it separately from the answer. */
export type ReasoningChannel = 'none' | 'message-reasoning-content';

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

/** ADR 0067's facts about the Go gateway, read from the OpenCode documentation on the date it records. */
const ADR_0067_DOCUMENTATION: CapabilityEvidence = {
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

const PRODUCTION_BASELINE: CapabilityEvidence = { kind: 'frozen-request-baseline', since: 'adapter revision 1' };
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

export const PROVIDER_MODEL_PROFILES: Readonly<Record<ModelProfileKey, ProviderModelProfile>> = {
  [DEEPSEEK_V4_PRO_PROFILE.key]: DEEPSEEK_V4_PRO_PROFILE,
  [OPENCODE_GO_V4_FLASH_PROFILE.key]: OPENCODE_GO_V4_FLASH_PROFILE,
  [OPENCODE_GO_V4_PRO_PROFILE.key]: OPENCODE_GO_V4_PRO_PROFILE,
};

/** The declared profile for one route and model, or `null` when nothing has declared that pair. */
export function modelProfileFor(route: RemoteExecutionRoute, model: string): ProviderModelProfile | null {
  return PROVIDER_MODEL_PROFILES[modelProfileKey(route, model)] ?? null;
}
