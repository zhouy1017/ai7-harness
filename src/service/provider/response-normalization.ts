import { canonicalJson, isRecord, sha256Hex } from '../analysis/canonical.js';
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
  | { readonly kind: 'answer'; readonly text: string; readonly reasoningText: string | null; readonly usage: ModelUsage | null; readonly truncated?: boolean; readonly salvaged?: ReadonlyArray<{ section: string; index: number; reason: string }> }
  | { readonly kind: 'empty-answer'; readonly reasoningPresent: boolean; readonly usage: ModelUsage | null }
  /**
   * The model asked for tools rather than answering (Issue #473). Read only for a profile that declares
   * `toolCalling: 'function'`; for every other profile a `tool_calls` field is not a channel and is never read.
   */
  | { readonly kind: 'tool-calls'; readonly text: string; readonly calls: ReadonlyArray<CanonicalToolCall>; readonly reasoningText: string | null; readonly usage: ModelUsage | null; readonly salvaged?: ReadonlyArray<{ section: string; index: number; reason: string }> }
  | { readonly kind: 'malformed'; readonly reason: MalformedReason; readonly usage?: ModelUsage | null };

/** Carry provider recovery details into a successfully parsed business result, without changing its acceptance. */
export function withProviderResponseSalvage<T extends { readonly ok: boolean; readonly result?: unknown }>(parsed: T, response: CanonicalModelResult | null): T {
  if (!parsed.ok || !isRecord(parsed) || !isRecord(parsed.result) || response?.kind !== 'answer' || response.salvaged === undefined) return parsed;
  const salvaged = [...(Array.isArray(parsed.result.salvaged) ? parsed.result.salvaged : []), ...response.salvaged];
  const result = { ...parsed.result, salvaged };
  const json = canonicalJson(result);
  return { ...parsed, result, salvaged, canonicalJson: json, digest: sha256Hex(json) };
}

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

/** Null is an empty channel; arrays contribute only their text parts. */
function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value.filter(isRecord).filter((part) => part.type === 'text' || part.type === 'output_text')
    .map((part) => typeof part.text === 'string' ? part.text : '').join('') : '';
}

/** Only complete, unique calls execute. A rejected call cannot erase its neighbours or text. */
function readableCalls(entries: ReadonlyArray<unknown>, read: (entry: unknown, index: number) => CanonicalToolCall | null,
  options: NormalizeOptions, executable: boolean) {
  const candidates = entries.map(read);
  const ids = entries.map((entry) => !isRecord(entry) ? null : entry.call_id ?? entry.id ?? (isRecord(entry.functionCall) ? entry.functionCall.id : null));
  const salvaged: Array<{ section: string; index: number; reason: string }> = [];
  const calls: CanonicalToolCall[] = [];
  for (const [index, call] of candidates.entries()) {
    let valid = executable && call !== null && call.id.length > 0 && call.name.length > 0;
    if (valid && call !== null) {
      try { valid = isRecord(JSON.parse(call.arguments)); } catch { valid = false; }
      valid &&= candidates.filter((other) => other?.id === call.id).length === 1;
      valid &&= ids.filter((id) => id === call.id).length <= 1;
      if (options.offeredToolNames !== undefined) valid &&= options.offeredToolNames.includes(call.name);
    }
    if (valid && call !== null) calls.push(call);
    else salvaged.push({ section: 'calls', index, reason: 'tool-call-rejected' });
  }
  return { calls, salvaged };
}

/** Normalize received output without changing requests or replaying opaque reasoning. */
export function normalizeModelResponse(profile: ProviderModelProfile, body: unknown, options: NormalizeOptions = {}): CanonicalModelResult {
  const channel = profile.capabilities.answerChannel;
  if (channel === 'none') return { kind: 'malformed', reason: 'answer-channel-not-declared' };
  if (!isRecord(body)) return { kind: 'malformed', reason: 'response-not-a-record' };
  let text = '';
  let reasoning: string | null = null;
  let reasoningPresent = false;
  let usage: ModelUsage | null = null;
  let truncated = false;
  let entries: ReadonlyArray<unknown> = [];
  let read: (entry: unknown, index: number) => CanonicalToolCall | null = () => null;
  let executable = options.toolCallsOffered === true && profile.capabilities.toolCalling === 'function';
  if (channel === 'content-text-blocks') {
    if (!Array.isArray(body.content)) return { kind: 'malformed', reason: 'content-absent' };
    text = contentText(body.content);
    usage = contentBlockUsageOf(body);
    truncated = body.stop_reason === 'max_tokens';
    entries = body.content.filter((part) => isBlockOfType(part, 'tool_use'));
    reasoningPresent = profile.capabilities.reasoningChannel === 'content-thinking-blocks' && body.content.some((part) => isBlockOfType(part, 'thinking'));
    executable &&= body.stop_reason === 'tool_use';
    read = (part) => isRecord(part) && typeof part.id === 'string' && typeof part.name === 'string' && isRecord(part.input)
      ? { id: part.id, name: part.name, arguments: JSON.stringify(part.input) } : null;
  } else if (channel === 'output-message-text') {
    if (!Array.isArray(body.output) && typeof body.output_text !== 'string') return { kind: 'malformed', reason: 'output-absent' };
    const output: unknown[] = Array.isArray(body.output) ? body.output : [];
    text = typeof body.output_text === 'string' ? body.output_text : output.filter((part) => isBlockOfType(part, 'message')).map((part) => contentText(part.content)).join('');
    usage = outputItemUsageOf(body);
    truncated = body.status !== undefined && body.status !== 'completed';
    entries = output.filter((part) => isBlockOfType(part, 'function_call'));
    reasoningPresent = profile.capabilities.reasoningChannel === 'output-reasoning-items' && output.some((part) => isBlockOfType(part, 'reasoning'));
    executable &&= body.status === 'completed';
    read = (part) => isRecord(part) && typeof part.call_id === 'string' && typeof part.name === 'string' && typeof part.arguments === 'string' && (part.status === undefined || part.status === 'completed')
      ? { id: part.call_id, name: part.name, arguments: part.arguments } : null;
  } else if (channel === 'candidate-parts-text') {
    const candidate: unknown = Array.isArray(body.candidates) ? body.candidates[0] : null;
    if (!isRecord(candidate)) return { kind: 'malformed', reason: 'candidate-absent' };
    const parts: unknown[] = isRecord(candidate.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
    text = parts.filter(isRecord).filter((part) => part.thought !== true && typeof part.text === 'string').map((part) => part.text as string).join('');
    usage = candidateUsageOf(body);
    truncated = candidate.finishReason !== undefined && candidate.finishReason !== 'STOP';
    entries = parts.filter((part) => isRecord(part) && part.functionCall !== undefined);
    reasoningPresent = profile.capabilities.reasoningChannel === 'candidate-thought-parts' && parts.some((part) => isRecord(part) && part.thought === true);
    executable &&= candidate.finishReason === 'STOP';
    read = (part, index) => {
      const call = isRecord(part) && isRecord(part.functionCall) ? part.functionCall : null;
      if (call === null || typeof call.name !== 'string' || (call.args !== undefined && !isRecord(call.args))) return null;
      const id = typeof call.id === 'string' ? call.id : call.id === undefined && options.callIdSeed !== undefined ? `${GEMINI_SYNTHETIC_CALL_PREFIX}${options.callIdSeed}-${index + 1}` : null;
      return id === null ? null : { id, name: call.name, arguments: JSON.stringify(call.args ?? {}) };
    };
  } else {
    if (!Array.isArray(body.choices)) return { kind: 'malformed', reason: 'response-not-a-record' };
    const choice: unknown = body.choices[0];
    if (!isRecord(choice)) return { kind: 'malformed', reason: 'choice-absent' };
    if (!isRecord(choice.message) || !Object.hasOwn(choice.message, 'content') && !Array.isArray(choice.message.tool_calls)) return { kind: 'malformed', reason: 'answer-channel-absent' };
    const message = choice.message;
    if (message.content !== null && message.content !== undefined && typeof message.content !== 'string' && !Array.isArray(message.content)) return { kind: 'malformed', reason: 'answer-channel-absent' };
    text = contentText(message.content);
    usage = usageOf(body);
    reasoning = typeof message.reasoning_content === 'string' && message.reasoning_content.length > 0 ? message.reasoning_content : null;
    truncated = choice.finish_reason === 'length';
    entries = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    executable &&= !truncated;
    read = (part) => isRecord(part) && part.type === 'function' && typeof part.id === 'string' && isRecord(part.function) && typeof part.function.name === 'string' && typeof part.function.arguments === 'string'
      ? { id: part.id, name: part.function.name, arguments: part.function.arguments } : null;
  }
  const { calls, salvaged } = readableCalls(entries, read, options, executable);
  if (channel === 'content-text-blocks' && Array.isArray(body.content)) {
    for (const [index, part] of body.content.entries()) {
      if (!isRecord(part) || !['text', 'tool_use', 'thinking', 'redacted_thinking'].includes(String(part.type))) {
        salvaged.push({ section: 'content', index, reason: 'content-block-rejected' });
      }
    }
  }
  if (truncated) salvaged.push({ section: 'response', index: 0, reason: 'truncated' });
  if (body.ai7StreamTextMismatch === true) salvaged.push({ section: 'text', index: 0, reason: 'completed-text-differs-from-stream' });
  const metadata = salvaged.length === 0 ? {} : { salvaged };
  if (calls.length > 0) return { kind: 'tool-calls', text, calls, reasoningText: reasoning, usage, ...metadata };
  if (channel === 'message-content-string' && profile.capabilities.reasoningChannel !== 'message-reasoning-content') reasoning = null;
  if (text.length === 0) return entries.length > 0 && salvaged.length > 0
    ? { kind: 'malformed', reason: 'tool-calls-malformed', ...(usage === null ? {} : { usage }) }
    : { kind: 'empty-answer', reasoningPresent: reasoningPresent || reasoning !== null, usage };
  return { kind: 'answer', text, reasoningText: reasoning, usage, ...metadata, ...(truncated || salvaged.some((entry) => entry.section === 'calls') ? { truncated: true } : {}) };
}

/** Calls must belong to this exact request's offered functions. */
export interface NormalizeOptions {
  readonly toolCallsOffered?: boolean;
  readonly offeredToolNames?: ReadonlyArray<string>;
  readonly callIdSeed?: string;
}
