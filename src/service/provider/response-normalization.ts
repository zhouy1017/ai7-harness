import { isRecord } from '../analysis/canonical.js';
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
  | 'output-absent';

/**
 * One response, normalized. `empty-answer` carries whether the declared reasoning channel had
 * content, because that is the difference between a model that thought and said nothing and a model
 * that did neither.
 */
export type CanonicalModelResult =
  | { readonly kind: 'answer'; readonly text: string; readonly reasoningText: string | null; readonly usage: ModelUsage | null }
  | { readonly kind: 'empty-answer'; readonly reasoningPresent: boolean; readonly usage: ModelUsage | null }
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

/** One `content` block or `output` item of the declared type, as far as this module reads it. */
function isBlockOfType(block: unknown, type: string): block is Record<string, unknown> {
  return isRecord(block) && block.type === type;
}

/**
 * The chat-completions reading: one choice, one message, the answer a string on it.
 */
function normalizeMessageContentString(profile: ProviderModelProfile, body: unknown): CanonicalModelResult {
  if (!isRecord(body) || !Array.isArray(body.choices)) return { kind: 'malformed', reason: 'response-not-a-record' };
  const choice: unknown = body.choices[0];
  if (body.choices.length === 0 || !isRecord(choice)) return { kind: 'malformed', reason: 'choice-absent' };
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
 * The Anthropic-compatible reading: the answer is the concatenation of every text block's `text`, in
 * order. A response with no `content` array matched no channel at all and is `content-absent`; a
 * `content` array that yields no text is the empty answer this module exists to distinguish, whether
 * the array carries no text block or a text block that is empty, because both hand the contract layer
 * the same `''` it must never be handed.
 *
 * `stop_reason` is deliberately not carried: a truncated answer is one the contract layer already
 * reads as unparsable, and the canonical result gains no field a single vendor needs. Reasoning is
 * read as presence only, since the declared channel establishes that the model thought and nothing
 * has established what the block's text field is called.
 */
function normalizeContentBlocks(profile: ProviderModelProfile, body: unknown): CanonicalModelResult {
  if (!isRecord(body)) return { kind: 'malformed', reason: 'response-not-a-record' };
  if (!Array.isArray(body.content)) return { kind: 'malformed', reason: 'content-absent' };
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
 * `status`, `incomplete_details`, and `error` are deliberately not carried, for the reason
 * `stop_reason` is not carried above: an incomplete or failed body reads as the empty or unparsable
 * answer the layers above already handle, and the canonical result gains no field one vendor needs.
 * `output_text` is not read either — the SDK synthesizes it client-side and the wire body has none.
 */
function normalizeOutputItems(profile: ProviderModelProfile, body: unknown): CanonicalModelResult {
  if (!isRecord(body)) return { kind: 'malformed', reason: 'response-not-a-record' };
  if (!Array.isArray(body.output)) return { kind: 'malformed', reason: 'output-absent' };
  const text = body.output
    .filter((item): item is Record<string, unknown> => isBlockOfType(item, 'message'))
    .flatMap((item): ReadonlyArray<unknown> => (Array.isArray(item.content) ? item.content : []))
    .filter((part): part is Record<string, unknown> => isBlockOfType(part, 'output_text') && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
  const usage = outputItemUsageOf(body);
  const reasoningPresent = profile.capabilities.reasoningChannel === 'output-reasoning-items' &&
    body.output.some((item) => isBlockOfType(item, 'reasoning'));
  if (text.length === 0) return { kind: 'empty-answer', reasoningPresent, usage };
  return { kind: 'answer', text, reasoningText: null, usage };
}

/**
 * Normalize one response body against the channels its model profile declares. Deliberately callable
 * with a body alone: a cached response can be classified without an adapter, a transport, a
 * credential, or a Run, which is what makes replaying a past failure possible at all.
 *
 * The shape is chosen by the declared answer channel and by nothing else — no route, no model id, no
 * endpoint — which is what keeps a second vendor's response shape a row in the profile table.
 */
export function normalizeModelResponse(profile: ProviderModelProfile, body: unknown): CanonicalModelResult {
  if (profile.capabilities.answerChannel === 'none') return { kind: 'malformed', reason: 'answer-channel-not-declared' };
  if (profile.capabilities.answerChannel === 'content-text-blocks') return normalizeContentBlocks(profile, body);
  if (profile.capabilities.answerChannel === 'output-message-text') return normalizeOutputItems(profile, body);
  return normalizeMessageContentString(profile, body);
}
