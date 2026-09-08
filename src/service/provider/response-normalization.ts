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
  | 'answer-channel-absent';

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
 * Normalize one response body against the channels its model profile declares. Deliberately callable
 * with a body alone: a cached response can be classified without an adapter, a transport, a
 * credential, or a Run, which is what makes replaying a past failure possible at all.
 */
export function normalizeModelResponse(profile: ProviderModelProfile, body: unknown): CanonicalModelResult {
  if (profile.capabilities.answerChannel === 'none') return { kind: 'malformed', reason: 'answer-channel-not-declared' };
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
