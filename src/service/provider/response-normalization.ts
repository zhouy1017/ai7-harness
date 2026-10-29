import { isRecord } from '../analysis/canonical.js';
import { GEMINI_SYNTHETIC_CALL_PREFIX } from './family-gemini.js';
import type { ProviderModelProfile } from './model-profile.js';

/**
 * The one place a Provider response is read (Issue #310). Everything above the adapter sees the
 * canonical result this module produces and nothing else: no module outside `src/service/provider/`
 * branches on a route or a model name, and none of them ever sees a raw vendor body.
 *
 * The result is discriminated rather than a string, because the distinction that matters is one a
 * string cannot carry. On the first live Run three of eight units failed `contract-invalid
 * (not-json)` — the reason `parseUnitResult` gives for an empty string, since `JSON.parse('')`
 * throws. An empty answer is not a malformed answer and neither is a broken contract: the model was
 * reached, it answered in the declared channel, and the channel was empty. That fact is established
 * here, at the normalization boundary, so the contract layer is never handed `''` to parse.
 *
 * Reading is driven entirely by the model profile's declared channels. A profile that declares no
 * answer channel cannot read any response — which is what makes an undeclared model inert instead of
 * accidentally functional.
 */

export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly reasoningTokens?: number;
}

/** Why a response did not match the declared channels; a closed set, so a replay classifies rather than describes. */
export type MalformedReason =
  | 'answer-channel-not-declared'
  | 'response-not-a-record'
  | 'choice-absent'
  | 'answer-channel-absent'
  | 'content-absent'
  | 'output-absent'
  | 'candidate-absent'
  | 'tool-calls-malformed';

/** One function call a tool-calling model asked for (Issue #473): the provider's call id, the name, and the raw JSON arguments. */
export interface CanonicalToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/**
 * One response, normalized. `empty-answer` carries whether the declared reasoning channel had
 * content, because that is the difference between a model that thought and said nothing and a model
 * that did neither.
 */
export type CanonicalModelResult =
  | { readonly kind: 'answer'; readonly text: string; readonly reasoningText: string | null; readonly usage: ModelUsage | null }
  | { readonly kind: 'empty-answer'; readonly reasoningPresent: boolean; readonly usage: ModelUsage | null }
  /**
   * The model asked for tools rather than answering (Issue #473). Read only for a profile that declares
   * `toolCalling: 'function'`; for every other profile a `tool_calls` field is not a channel and is never read.
   */
  | { readonly kind: 'tool-calls'; readonly text: string; readonly calls: ReadonlyArray<CanonicalToolCall>; readonly reasoningText: string | null; readonly usage: ModelUsage | null }
  | { readonly kind: 'malformed'; readonly reason: MalformedReason };

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

/**
 * The usage a response reports, as far as it reports it. The input count is cache-adjusted because
 * the vendor counts a cache hit inside `prompt_tokens`; every other field is passed through
 * untouched. A profile's `usageAttribution` records whether the reported output count already
 * includes reasoning — it is a declared fact about the number, not an instruction to change it, so
 * no profile's arithmetic differs here.
 */
function usageOf(body: Record<string, unknown>): ModelUsage | null {
  if (!isRecord(body.usage)) return null;
  const promptTokens = nonNegativeInteger(body.usage.prompt_tokens);
  const completionTokens = nonNegativeInteger(body.usage.completion_tokens);
  const cacheHit = nonNegativeInteger(body.usage.prompt_cache_hit_tokens) ?? 0;
  const reasoningTokens = isRecord(body.usage.completion_tokens_details)
    ? nonNegativeInteger(body.usage.completion_tokens_details.reasoning_tokens)
    : null;
  if (promptTokens === null || completionTokens === null) return null;
  return {
    inputTokens: Math.max(0, promptTokens - cacheHit),
    outputTokens: completionTokens,
    ...(cacheHit > 0 ? { cacheReadTokens: cacheHit } : {}),
    ...(reasoningTokens === null ? {} : { reasoningTokens }),
  };
}

/**
 * The usage an Anthropic-compatible response reports. Two counts, named for the sides of the request
 * rather than for the prompt, and no cache field: this shape reports cache reads under names nothing
 * has observed, and an unobserved field is not read.
 */
function contentBlockUsageOf(body: Record<string, unknown>): ModelUsage | null {
  if (!isRecord(body.usage)) return null;
  const inputTokens = nonNegativeInteger(body.usage.input_tokens);
  const outputTokens = nonNegativeInteger(body.usage.output_tokens);
  if (inputTokens === null || outputTokens === null) return null;
  return { inputTokens, outputTokens };
}

/**
 * The usage a Responses-shaped response reports. The two counts are named for the sides of the
 * request as the Anthropic-compatible shape names them, and the reasoning count sits one level down
 * in `output_tokens_details`, where it is read into the field the canonical usage already has.
 * `input_tokens_details` is not read: nothing has observed this gateway's cache accounting, and an
 * unobserved field is not a field this module invents a meaning for.
 */
function outputItemUsageOf(body: Record<string, unknown>): ModelUsage | null {
  if (!isRecord(body.usage)) return null;
  const inputTokens = nonNegativeInteger(body.usage.input_tokens);
  const outputTokens = nonNegativeInteger(body.usage.output_tokens);
  const reasoningTokens = isRecord(body.usage.output_tokens_details)
    ? nonNegativeInteger(body.usage.output_tokens_details.reasoning_tokens)
    : null;
  if (inputTokens === null || outputTokens === null) return null;
  return { inputTokens, outputTokens, ...(reasoningTokens === null ? {} : { reasoningTokens }) };
}

/**
 * The usage a generateContent response reports, under names of its own: the counts live in
 * `usageMetadata` rather than `usage`, and the reasoning count is a third count beside them rather
 * than a detail one level down, so it is read into the field the canonical usage already has.
 * `cachedContentTokenCount` is not read, for the reason `input_tokens_details` is not read above —
 * nothing has observed this vendor's cache accounting — and `totalTokenCount` is a sum of counts this
 * module already carries rather than a count of its own.
 */
function candidateUsageOf(body: Record<string, unknown>): ModelUsage | null {
  if (!isRecord(body.usageMetadata)) return null;
  const inputTokens = nonNegativeInteger(body.usageMetadata.promptTokenCount);
  const outputTokens = nonNegativeInteger(body.usageMetadata.candidatesTokenCount);
  const reasoningTokens = nonNegativeInteger(body.usageMetadata.thoughtsTokenCount);
  if (inputTokens === null || outputTokens === null) return null;
  return { inputTokens, outputTokens, ...(reasoningTokens === null ? {} : { reasoningTokens }) };
}

/** One `content` block or `output` item of the declared type, as far as this module reads it. */
function isBlockOfType(block: unknown, type: string): block is Record<string, unknown> {
  return isRecord(block) && block.type === type;
}

/**
 * The chat-completions reading: one choice, one message, the answer a string on it.
 */
function normalizeMessageContentString(profile: ProviderModelProfile, body: unknown, options: NormalizeOptions): CanonicalModelResult {
  if (!isRecord(body) || !Array.isArray(body.choices)) return { kind: 'malformed', reason: 'response-not-a-record' };
  const choice: unknown = body.choices[0];
  if (body.choices.length === 0 || !isRecord(choice)) return { kind: 'malformed', reason: 'choice-absent' };
  // `tool_calls` is a channel only when the request offered tools to a function-calling model: to every other request the
  // response reads exactly as it always has, its `content` an answer and its calls nothing.
  if (options.toolCallsOffered === true && profile.capabilities.toolCalling === 'function' && isRecord(choice.message) &&
      Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0) {
    return toolCallsOf(profile, body, choice.message);
  }
  if (!isRecord(choice.message) || typeof choice.message.content !== 'string') {
    return { kind: 'malformed', reason: 'answer-channel-absent' };
  }
  const usage = usageOf(body);
  const reasoning = profile.capabilities.reasoningChannel === 'message-reasoning-content' &&
    typeof choice.message.reasoning_content === 'string' && choice.message.reasoning_content.length > 0
    ? choice.message.reasoning_content
    : null;
  if (choice.message.content.length === 0) return { kind: 'empty-answer', reasoningPresent: reasoning !== null, usage };
  return { kind: 'answer', text: choice.message.content, reasoningText: reasoning, usage };
}

/**
 * The chat-completions tool-call reading (Issue #473): every entry of `message.tool_calls` must be a `function` call with a
 * string id, name, and arguments, or the whole response is `tool-calls-malformed` — a partly readable request for tools is
 * not a request AI7 can answer. `content` beside the calls may be a string or `null`.
 */
function toolCallsOf(profile: ProviderModelProfile, body: Record<string, unknown>, message: Record<string, unknown>): CanonicalModelResult {
  const calls: CanonicalToolCall[] = [];
  for (const entry of message.tool_calls as unknown[]) {
    if (!isRecord(entry) || entry.type !== 'function' || typeof entry.id !== 'string' || entry.id.length === 0 || !isRecord(entry.function) ||
        typeof entry.function.name !== 'string' || typeof entry.function.arguments !== 'string') {
      return { kind: 'malformed', reason: 'tool-calls-malformed' };
    }
    // Two calls under one id would let one result answer both.
    if (calls.some((call) => call.id === entry.id)) return { kind: 'malformed', reason: 'tool-calls-malformed' };
    calls.push({ id: entry.id, name: entry.function.name, arguments: entry.function.arguments });
  }
  if (message.content !== null && message.content !== undefined && typeof message.content !== 'string') {
    return { kind: 'malformed', reason: 'tool-calls-malformed' };
  }
  // Whatever reasoning the model wrote beside its calls is kept, declared channel or not: a thinking-mode tool loop hands
  // it back with the calls (the review of #671; the §7.7 live item confirms the gateway's requirement). It is never read
  // as an answer.
  const reasoning = typeof message.reasoning_content === 'string' && message.reasoning_content.length > 0 ? message.reasoning_content : null;
  return { kind: 'tool-calls', text: typeof message.content === 'string' ? message.content : '', calls, reasoningText: reasoning, usage: usageOf(body) };
}

/**
 * The Anthropic-compatible reading: the answer is the concatenation of every text block's `text`, in
 * order. A response with no `content` array matched no channel at all and is `content-absent`; a
 * `content` array that yields no text is the empty answer this module exists to distinguish, whether
 * the array carries no text block or a text block that is empty, because both hand the contract layer
 * the same `''` it must never be handed.
 *
 * Text-only reading retains its legacy stop/reasoning semantics. Client-function turns instead
 * validate every block and the stop reason before exposing anything executable: only leading text
 * followed by contiguous client calls fits the aggregate canonical result (Issue #1056).
 */
function normalizeContentBlocks(profile: ProviderModelProfile, body: unknown, options: NormalizeOptions): CanonicalModelResult {
  if (!isRecord(body)) return { kind: 'malformed', reason: 'response-not-a-record' };
  if (!Array.isArray(body.content)) return { kind: 'malformed', reason: 'content-absent' };
  const functionsOffered = options.toolCallsOffered === true && profile.capabilities.toolCalling === 'function';
  if (functionsOffered || body.stop_reason === 'tool_use' || body.content.some((block) => isBlockOfType(block, 'tool_use'))) {
    if (!functionsOffered) return { kind: 'malformed', reason: 'tool-calls-malformed' };
    const calls: CanonicalToolCall[] = [];
    let text = '';
    for (const block of body.content) {
      if (isBlockOfType(block, 'text') && typeof block.text === 'string' && calls.length === 0 &&
          Object.keys(block).every((key) => key === 'type' || key === 'text')) {
        text += block.text;
        continue;
      }
      // Opaque blocks/fields (including thinking, signatures, server tools and toolsets) cannot round-trip.
      if (!isBlockOfType(block, 'tool_use') || Object.keys(block).some((key) => !['type', 'id', 'name', 'input'].includes(key)) ||
          typeof block.id !== 'string' || block.id.length === 0 || typeof block.name !== 'string' ||
          !(options.offeredToolNames ?? []).includes(block.name) || !isRecord(block.input) || calls.some((call) => call.id === block.id)) {
        return { kind: 'malformed', reason: 'tool-calls-malformed' };
      }
      let argumentsJson: string;
      try { argumentsJson = JSON.stringify(block.input); } catch { return { kind: 'malformed', reason: 'tool-calls-malformed' }; }
      calls.push({ id: block.id, name: block.name, arguments: argumentsJson });
    }
    if (calls.length > 0) {
      if (body.stop_reason !== 'tool_use') return { kind: 'malformed', reason: 'tool-calls-malformed' };
      return { kind: 'tool-calls', text, calls, reasoningText: null, usage: contentBlockUsageOf(body) };
    }
    // No tool_use blocks with a tool stop, and no truncated/unfinished final answer masquerading as completion.
    if (body.stop_reason !== 'end_turn' && body.stop_reason !== 'stop_sequence') return { kind: 'malformed', reason: 'tool-calls-malformed' };
    const usage = contentBlockUsageOf(body);
    return text.length === 0 ? { kind: 'empty-answer', reasoningPresent: false, usage } : { kind: 'answer', text, reasoningText: null, usage };
  }
  const text = body.content
    .filter((block): block is Record<string, unknown> => isBlockOfType(block, 'text') && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('');
  const usage = contentBlockUsageOf(body);
  const reasoningPresent = profile.capabilities.reasoningChannel === 'content-thinking-blocks' &&
    body.content.some((block) => isBlockOfType(block, 'thinking'));
  if (text.length === 0) return { kind: 'empty-answer', reasoningPresent, usage };
  return { kind: 'answer', text, reasoningText: null, usage };
}

/**
 * The Responses reading: `output` is a list of items rather than of answer parts, so the answer is
 * one level deeper than the shape before it — the `text` of every `output_text` part of every
 * `message` item, in order. A `refusal` part is not answer text: the model declining to answer is
 * the empty answer this module exists to distinguish, not a string for the contract layer to fail to
 * parse. A response with no `output` array matched no channel at all and is `output-absent`.
 *
 * Text-only reading keeps its existing status semantics. Offered/admitted function calls require a
 * completed response and complete call items; a malformed batch or opaque reasoning refuses the whole
 * batch because this payload cannot preserve the reasoning needed for continuation (Issue #1038).
 * `output_text` is not read either — the SDK synthesizes it client-side and the wire body has none.
 */
function normalizeOutputItems(profile: ProviderModelProfile, body: unknown, options: NormalizeOptions): CanonicalModelResult {
  if (!isRecord(body)) return { kind: 'malformed', reason: 'response-not-a-record' };
  if (!Array.isArray(body.output)) return { kind: 'malformed', reason: 'output-absent' };
  const text = body.output
    .filter((item): item is Record<string, unknown> => isBlockOfType(item, 'message'))
    .flatMap((item): ReadonlyArray<unknown> => (Array.isArray(item.content) ? item.content : []))
    .filter((part): part is Record<string, unknown> => isBlockOfType(part, 'output_text') && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
  const usage = outputItemUsageOf(body);
  if (options.toolCallsOffered === true && profile.capabilities.toolCalling === 'function' &&
      body.output.some((item) => isBlockOfType(item, 'function_call'))) {
    // A partial batch cannot execute. Reasoning requires opaque replay that the current payload cannot preserve.
    if (body.status !== 'completed' || body.output.some((item) => isBlockOfType(item, 'reasoning'))) {
      return { kind: 'malformed', reason: 'tool-calls-malformed' };
    }
    const calls: CanonicalToolCall[] = [];
    for (const item of body.output) {
      if (!isBlockOfType(item, 'function_call')) continue;
      if (typeof item.call_id !== 'string' || item.call_id.length === 0 || typeof item.name !== 'string' || item.name.length === 0 ||
          typeof item.arguments !== 'string' || (item.status !== undefined && item.status !== 'completed') ||
          calls.some((call) => call.id === item.call_id)) {
        return { kind: 'malformed', reason: 'tool-calls-malformed' };
      }
      // The separate item id is never a correlation id; argument JSON/schema validation belongs to the tool boundary.
      calls.push({ id: item.call_id, name: item.name, arguments: item.arguments });
    }
    return { kind: 'tool-calls', text, calls, reasoningText: null, usage };
  }
  const reasoningPresent = profile.capabilities.reasoningChannel === 'output-reasoning-items' &&
    body.output.some((item) => isBlockOfType(item, 'reasoning'));
  if (text.length === 0) return { kind: 'empty-answer', reasoningPresent, usage };
  return { kind: 'answer', text, reasoningText: null, usage };
}

/**
 * The generateContent reading: the answer is the concatenation of the `text` of every part of the
 * first candidate that is not flagged `thought`, in order. A part is not typed the way the two shapes
 * above type their blocks and items — it carries the fields it has — so a thought part is one whose
 * `thought` is exactly `true`, and everything else with a string `text` is answer text.
 *
 * The `candidates` array is where this shape differs from the one before it, and deliberately so: an
 * absent array *and an empty one* are `candidate-absent`, whereas an empty `output` above is the
 * empty answer. An empty `output` is a model that answered with no item; an empty `candidates` is
 * what this shape returns when the prompt was blocked, and no candidate is not an empty answer.
 * `finishReason` and `promptFeedback.blockReason` are not carried, for the reason `stop_reason` and
 * `status` are not carried above — the canonical result gains no field one vendor needs — so a
 * blocked prompt reads as `candidate-absent`, and that reading is the one the first live item on this
 * shape should confirm. A candidate with no `content`, no parts, or no non-thought text is the empty
 * answer this module exists to distinguish, since all three hand the contract layer the same `''`.
 */
function normalizeCandidateParts(profile: ProviderModelProfile, body: unknown, options: NormalizeOptions): CanonicalModelResult {
  if (!isRecord(body)) return { kind: 'malformed', reason: 'response-not-a-record' };
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) return { kind: 'malformed', reason: 'candidate-absent' };
  const candidate: unknown = body.candidates[0];
  // A first entry that is not a record is not a candidate, so the response carries none rather than
  // carrying one that answered emptily.
  if (!isRecord(candidate)) return { kind: 'malformed', reason: 'candidate-absent' };
  const parts: ReadonlyArray<unknown> = isRecord(candidate.content) && Array.isArray(candidate.content.parts)
    ? candidate.content.parts
    : [];
  const functionsOffered = options.toolCallsOffered === true && profile.capabilities.toolCalling === 'function';
  if (functionsOffered || parts.some((part) => isRecord(part) && part.functionCall !== undefined)) {
    if (!functionsOffered) return { kind: 'malformed', reason: 'tool-calls-malformed' };
    return candidateFunctionCallsOf(body, candidate, parts, options);
  }
  const text = parts
    .filter((part): part is Record<string, unknown> => isRecord(part) && part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
  const usage = candidateUsageOf(body);
  const reasoningPresent = profile.capabilities.reasoningChannel === 'candidate-thought-parts' &&
    parts.some((part) => isRecord(part) && part.thought === true);
  if (text.length === 0) return { kind: 'empty-answer', reasoningPresent, usage };
  return { kind: 'answer', text, reasoningText: null, usage };
}

/**
 * The generateContent function-call reading (Issue #1180), for a request that offered functions to a function-calling
 * model: only leading plain text parts, then `functionCall` parts naming an offered function with object `args`, under a
 * `STOP` finish. A thought part, a thought signature, or any other part is opaque reasoning or a server tool this payload
 * cannot carry back, so the whole turn is `tool-calls-malformed`. A call without the optional provider id takes the
 * deterministic `gemini-call-<seed>-<n>` id, and a turn that needs one without a seed refuses rather than inventing it.
 */
function candidateFunctionCallsOf(body: Record<string, unknown>, candidate: Record<string, unknown>, parts: ReadonlyArray<unknown>,
  options: NormalizeOptions): CanonicalModelResult {
  if (candidate.finishReason !== 'STOP') return { kind: 'malformed', reason: 'tool-calls-malformed' };
  const calls: CanonicalToolCall[] = [];
  let text = '';
  for (const part of parts) {
    if (isRecord(part) && Object.keys(part).join(',') === 'text' && typeof part.text === 'string' && calls.length === 0) {
      text += part.text;
      continue;
    }
    const call = isRecord(part) && Object.keys(part).join(',') === 'functionCall' && isRecord(part.functionCall) ? part.functionCall : null;
    if (call === null || Object.keys(call).some((key) => !['name', 'args', 'id'].includes(key)) || typeof call.name !== 'string' ||
        !(options.offeredToolNames ?? []).includes(call.name) || (call.args !== undefined && !isRecord(call.args)) ||
        (call.id !== undefined && (typeof call.id !== 'string' || call.id.length === 0))) {
      return { kind: 'malformed', reason: 'tool-calls-malformed' };
    }
    if (call.id === undefined && options.callIdSeed === undefined) return { kind: 'malformed', reason: 'tool-calls-malformed' };
    const id = typeof call.id === 'string' ? call.id : `${GEMINI_SYNTHETIC_CALL_PREFIX}${options.callIdSeed}-${calls.length + 1}`;
    if (calls.some((existing) => existing.id === id)) return { kind: 'malformed', reason: 'tool-calls-malformed' };
    calls.push({ id, name: call.name, arguments: JSON.stringify(call.args ?? {}) });
  }
  const usage = candidateUsageOf(body);
  if (calls.length > 0) return { kind: 'tool-calls', text, calls, reasoningText: null, usage };
  return text.length === 0 ? { kind: 'empty-answer', reasoningPresent: false, usage } : { kind: 'answer', text, reasoningText: null, usage };
}

/**
 * Normalize one response body against the channels its model profile declares. Deliberately callable
 * with a body alone: a cached response can be classified without an adapter, a transport, a
 * credential, or a Run, which is what makes replaying a past failure possible at all.
 *
 * The shape is chosen by the declared answer channel and by nothing else — no route, no model id, no
 * endpoint — which is what keeps a second vendor's response shape a row in the profile table.
 */
export function normalizeModelResponse(profile: ProviderModelProfile, body: unknown, options: NormalizeOptions = {}): CanonicalModelResult {
  if (profile.capabilities.answerChannel === 'none') return { kind: 'malformed', reason: 'answer-channel-not-declared' };
  if (profile.capabilities.answerChannel === 'content-text-blocks') return normalizeContentBlocks(profile, body, options);
  if (profile.capabilities.answerChannel === 'output-message-text') return normalizeOutputItems(profile, body, options);
  if (profile.capabilities.answerChannel === 'candidate-parts-text') return normalizeCandidateParts(profile, body, options);
  return normalizeMessageContentString(profile, body, options);
}

/** What the request a response answers offered: tools, or not (Issue #473). Absent, as for every replay, it offered none. */
export interface NormalizeOptions {
  readonly toolCallsOffered?: boolean;
  /** Messages and Gemini client calls must name a function actually declared by this request. Other shapes retain their existing reading. */
  readonly offeredToolNames?: ReadonlyArray<string>;
  /** The request-digest prefix a Gemini call without a provider id is named from; absent, such a call refuses. */
  readonly callIdSeed?: string;
}
