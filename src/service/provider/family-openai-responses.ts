import { canonicalJson, isRecord } from '../analysis/canonical.js';
import type { DeepSeekTransportResponse, DialogueStreamEvent, ProviderRouteProfile } from './deepseek-adapter.js';
import { conversationMessages, functionToolOf, systemPromptOf } from './family-payload.js';
import { effectiveModelReasoningEffort, type ProviderModelProfile } from './model-profile.js';
import { assistantToolCalls, familyReplayItems, messageText, toolResultOf, type AssembledModelPayload } from './payload.js';
import { sseFrames, streamFailure } from './stream-frames.js';

/**
 * The OpenAI Responses family: the text/function body, rechecked against the official function-calling guide and Create
 * Response reference on 2026-10-22 (Issue #1038), and its stream (Issue #1180):
 * https://developers.openai.com/api/docs/guides/function-calling
 * https://developers.openai.com/api/reference/resources/responses/methods/create
 * The stream reader reads that reference's streaming event names and nothing else; no route declares it until a live
 * item observes it. Flat functions explicitly retain non-strict schemas; call_id correlates calls and outputs.
 *
 * The system prompt is the top-level `instructions` and never an input item. `max_output_tokens` is optional here, so
 * the route's declaration decides: a number sends the field, `null` sends nothing, and no cap is invented.
 *
 * Selected effort uses `reasoning.effort` (#1453, official reasoning guide read 2026-11-14).
 * Native output items, including encrypted reasoning and message phase, stay in adapter-private replay state.
 * Structured output remains unsupported on this family.
 */
export function openaiResponsesBody(profile: ProviderRouteProfile, model: ProviderModelProfile, payload: AssembledModelPayload): string {
  if (model.capabilities.structuredOutput !== 'none') throw new Error('PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED');
  const effort = effectiveModelReasoningEffort(model, payload.reasoningEffort);
  const tools = payload.tools ?? [];
  const toolCalling = model.capabilities.toolCalling === 'function';
  if (tools.length > 0 && !toolCalling) throw new Error('PROVIDER_TOOL_CALLING_UNSUPPORTED');
  const instructions = systemPromptOf(payload);
  return canonicalJson({
    model: model.model,
    ...(effort === null ? {} : { reasoning: { effort } }),
    ...(profile.route === 'openai-platform' ? { store: false, include: ['reasoning.encrypted_content'] } : {}),
    ...(instructions === null ? {} : { instructions }),
    input: toolCalling ? openaiResponsesConversation(payload) : conversationMessages(payload),
    ...(profile.maxOutputTokens === null ? {} : { max_output_tokens: profile.maxOutputTokens }),
    // Responses defaults can tighten the existing schemas; retain their non-strict semantics explicitly.
    ...(tools.length > 0 ? { tools: tools.map((tool) => ({ type: 'function', ...functionToolOf(tool), strict: false })) } : {}),
  });
}

/** The streamed variant: the same body with `stream` on; the completed response arrives whole in its terminal event. */
export function openaiResponsesStreamBody(body: string): string {
  return canonicalJson({ ...JSON.parse(body), stream: true });
}

/** Native replay precedes canonical text/function fallback; signed state is never invented from text. */
function openaiResponsesConversation(payload: AssembledModelPayload): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  for (const message of payload.messages) {
    const replay = familyReplayItems(message, 'openai-responses');
    if (replay !== null) { items.push(...replay); continue; }
    const calls = assistantToolCalls(message);
    if (calls !== null) {
      if (message.content.some((block) => block.type === 'reasoning')) throw new Error('PROVIDER_REASONING_REPLAY_ABSENT');
      if (calls.text.length > 0) items.push({ role: 'assistant', content: calls.text });
      for (const call of calls.calls) {
        items.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments });
      }
      continue;
    }
    const result = toolResultOf(message);
    if (result !== null) {
      items.push({ type: 'function_call_output', call_id: result.callId, output: result.text });
      continue;
    }
    const text = messageText(message);
    if (text === null) throw new Error('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('DEEPSEEK_REQUEST_ROLE_INVALID');
    items.push({ role: message.role, content: text });
  }
  return items;
}

/** Stateless Responses replays complete output items, including encrypted reasoning and message phase, in native order. */
export function responsesReplayItems(body: unknown, callIds: ReadonlySet<string>): Record<string, unknown>[] | null {
  if (!isRecord(body) || !Array.isArray(body.output)) return null;
  if (!body.output.some((item) => isRecord(item) && (item.type === 'reasoning' || item.phase !== undefined))) return null;
  return body.output.filter(isRecord).filter((item) => item.type === 'reasoning' || item.type === 'message' && item.role === 'assistant' ||
    item.type === 'function_call' && typeof item.call_id === 'string' && callIds.has(item.call_id));
}

/** The HTTP status a Responses error code stands for, so an in-stream failure classifies as the same refusal would. */
function responsesErrorStatus(code: unknown): number {
  if (code === 'rate_limit_exceeded' || code === 'insufficient_quota') return 429;
  if (code === 'context_length_exceeded') return 400;
  return 500;
}

/**
 * Read the Responses SSE wire. Text arrives as `response.output_text.delta`; the whole response — output items and usage,
 * exactly the buffered body — arrives in `response.completed` (or `response.incomplete`), which alone proves a whole
 * response. Its final text supersedes streamed deltas, with a mismatch recorded. `response.failed` and `error` are the service's
 * refusal after acceptance, read as an error with the status its code stands for. Reasoning deltas are never read.
 */
export async function* responsesSseEvents(response: DeepSeekTransportResponse): AsyncIterable<DialogueStreamEvent> {
  let streamed = '';
  try {
    for await (const { event, data } of sseFrames(response)) {
      if (event === 'ai7-buffered-response') { yield { kind: 'complete', response: JSON.parse(data) }; return; }
      let value: unknown;
      try { value = JSON.parse(data); } catch { continue; }
      if (!isRecord(value) || typeof value.type !== 'string') continue;
      if (value.type === 'response.output_text.delta') {
        if (typeof value.delta !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
        if (value.delta.length === 0) continue;
        streamed += value.delta;
        yield { kind: 'text', text: value.delta };
        continue;
      }
      if (value.type === 'error') {
        yield { kind: 'error', status: responsesErrorStatus(value.code), body: { error: { code: value.code, message: value.message } } };
        return;
      }
      if (value.type === 'response.failed') {
        const error = isRecord(value.response) && isRecord(value.response.error) ? value.response.error : {};
        yield { kind: 'error', status: responsesErrorStatus(error.code), body: { error: { code: error.code, message: error.message } } };
        return;
      }
      if (value.type === 'response.completed' || value.type === 'response.incomplete') {
        if (!isRecord(value.response)) continue;
        if (!Array.isArray(value.response.output) && typeof value.response.output_text !== 'string') value.response = { ...value.response, output_text: streamed };
        const final = value.response as Record<string, unknown>;
        const finalText = typeof final.output_text === 'string' ? final.output_text : (final.output as unknown[]).filter(isRecord)
          .flatMap((item) => Array.isArray(item.content) ? item.content : []).filter(isRecord)
          .filter((part) => part.type === 'output_text' && typeof part.text === 'string').map((part) => part.text).join('');
        if (finalText !== streamed) value.response = { ...final, ai7StreamTextMismatch: true };
        // The completed body is authoritative, even when a gateway revises its deltas.
        yield { kind: 'complete', response: value.response };
        return;
      }
      // Every other event — created, in_progress, item and part boundaries, argument and reasoning deltas — carries
      // nothing the completed response does not carry whole.
    }
  } catch (error) {
    throw streamFailure(error);
  }
  throw new Error('AI7_OUTCOME_UNKNOWN');
}
