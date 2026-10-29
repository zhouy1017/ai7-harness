import { canonicalJson, isRecord } from '../analysis/canonical.js';
import type { DeepSeekTransportResponse, DialogueStreamEvent, ProviderRouteProfile } from './deepseek-adapter.js';
import { conversationMessages, functionToolOf, systemPromptOf } from './family-payload.js';
import type { ProviderModelProfile } from './model-profile.js';
import { assistantToolCalls, messageText, toolResultOf, type AssembledModelPayload } from './payload.js';
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
 * This shape has mechanisms of its own for the two capabilities that refuse here — `text.format: { type: 'json_object' }`
 * and `reasoning.effort`. Neither is assembled: a profile declaring either on this shape refuses rather than sending a
 * field on a guess. Opaque reasoning items cannot be replayed through the payload, so a reasoning-bearing call turn
 * refuses (disposition `unsupported` · reasoning continuation).
 */
export function openaiResponsesBody(profile: ProviderRouteProfile, model: ProviderModelProfile, payload: AssembledModelPayload): string {
  if (model.capabilities.structuredOutput !== 'none') throw new Error('PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED');
  if (model.capabilities.reasoningControl !== 'none') throw new Error('PROVIDER_REASONING_CONTROL_UNSUPPORTED');
  const tools = payload.tools ?? [];
  const toolCalling = model.capabilities.toolCalling === 'function';
  if (tools.length > 0 && !toolCalling) throw new Error('PROVIDER_TOOL_CALLING_UNSUPPORTED');
  const instructions = systemPromptOf(payload);
  return canonicalJson({
    model: model.model,
    ...(profile.route === 'openai-platform' ? { store: false } : {}),
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

/** Text and function items only; opaque Responses reasoning cannot round-trip through this payload. */
function openaiResponsesConversation(payload: AssembledModelPayload): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  for (const message of payload.messages) {
    const calls = assistantToolCalls(message);
    if (calls !== null) {
      if (message.content.some((block) => block.type === 'reasoning')) throw new Error('PROVIDER_REASONING_CONTINUATION_UNSUPPORTED');
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

/** The HTTP status a Responses error code stands for, so an in-stream failure classifies as the same refusal would. */
function responsesErrorStatus(code: unknown): number {
  if (code === 'rate_limit_exceeded' || code === 'insufficient_quota') return 429;
  if (code === 'context_length_exceeded') return 400;
  return 500;
}

/**
 * Read the Responses SSE wire. Text arrives as `response.output_text.delta`; the whole response — output items and usage,
 * exactly the buffered body — arrives in `response.completed` (or `response.incomplete`), which alone proves a whole
 * response, and whose text must equal the deltas streamed before it. `response.failed` and `error` are the service's
 * refusal after acceptance, read as an error with the status its code stands for. Reasoning deltas are never read.
 */
export async function* responsesSseEvents(response: DeepSeekTransportResponse): AsyncIterable<DialogueStreamEvent> {
  let streamed = '';
  try {
    for await (const { data } of sseFrames(response)) {
      const value: unknown = JSON.parse(data);
      if (!isRecord(value) || typeof value.type !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
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
        if (!isRecord(value.response) || !Array.isArray(value.response.output)) throw new Error('AI7_OUTCOME_UNKNOWN');
        const text = value.response.output
          .filter((item): item is Record<string, unknown> => isRecord(item) && item.type === 'message' && Array.isArray(item.content))
          .flatMap((item) => item.content as unknown[])
          .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === 'output_text' && typeof part.text === 'string')
          .map((part) => part.text as string).join('');
        if (text !== streamed) throw new Error('AI7_OUTCOME_UNKNOWN');
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
