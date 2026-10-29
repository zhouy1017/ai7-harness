import { canonicalJson, isRecord } from '../analysis/canonical.js';
import type { DeepSeekTransportResponse, DialogueStreamEvent } from './deepseek-adapter.js';
import { conversationMessages, functionToolOf, systemPromptOf } from './family-payload.js';
import type { ProviderModelProfile } from './model-profile.js';
import { assistantToolCalls, messageText, toolResultOf, type AssembledModelPayload } from './payload.js';
import { sseFrames, streamFailure } from './stream-frames.js';

/** The reasoning effort the production route's `deepseek-thinking` control sends. */
export const DEEPSEEK_REASONING_EFFORT = 'high' as const;

/**
 * The OpenAI Chat Completions family (Issue #1180 moved it beside the adapter, byte for byte): the body adapter revision
 * 1 has always assembled, its function tools, and its SSE reader.
 *
 * The system prompt is the first message, and both frozen request digests are over these bytes. Of the
 * structured-output constraints only `json-object` is implemented, as exactly one body field —
 * `response_format: {"type":"json_object"}`, the chat-completions spelling — and `json-schema` and `tool-call` still
 * refuse, because naming a constraint is not implementing it. Implementing one is still not sending it: the field travels
 * only for a model whose profile declares `json-object`, and that declaration needs the live evidence the profile table
 * demands (Issue #306).
 */
export function chatCompletionsBody(model: ProviderModelProfile, payload: AssembledModelPayload): string {
  const structuredOutput = model.capabilities.structuredOutput;
  if (structuredOutput !== 'none' && structuredOutput !== 'json-object') throw new Error('PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED');
  const tools = payload.tools ?? [];
  // Function tools travel only for a model whose profile declares `toolCalling: 'function'` with evidence (ADR 0080 §2);
  // every other model refuses to assemble a payload that carries them, so nothing is sent (Issue #473).
  const toolCalling = model.capabilities.toolCalling === 'function';
  if (tools.length > 0 && !toolCalling) throw new Error('PROVIDER_TOOL_CALLING_UNSUPPORTED');
  const system = systemPromptOf(payload);
  const conversation = toolCalling ? chatCompletionsConversation(payload) : conversationMessages(payload);
  const messages = system === null ? conversation : [{ role: 'system', content: system }, ...conversation];
  return canonicalJson({
    model: model.model,
    messages,
    stream: false,
    ...(model.capabilities.reasoningControl === 'deepseek-thinking'
      ? { thinking: { type: 'enabled' }, reasoning_effort: DEEPSEEK_REASONING_EFFORT }
      : {}),
    // One field, and nothing else moves: a profile that declares `json-object` sends the body it
    // would have sent anyway plus this key, so the constraint can be added to or withdrawn from a
    // model without any other byte of the request changing.
    ...(structuredOutput === 'json-object' ? { response_format: { type: 'json_object' } } : {}),
    // The same rule for tools: a payload without tools sends no `tools` key, so no request that carries none moves a byte.
    ...(tools.length > 0 ? { tools: tools.map((tool) => ({ type: 'function', function: functionToolOf(tool) })) } : {}),
  });
}

/** The streamed variant of a chat-completions body: the same bytes with `stream` on and the usage frame requested. */
export function chatCompletionsStreamBody(body: string): string {
  return canonicalJson({ ...JSON.parse(body), stream: true, stream_options: { include_usage: true } });
}

/**
 * The chat-completions conversation of a tool-calling model (Issue #473): every text message exactly as
 * `conversationMessages` writes it, an assistant tool-call message as `{ role: 'assistant', content, tool_calls }`, and a
 * tool result as `{ role: 'tool', tool_call_id, content }`. Anything else refuses, as it does for every other model.
 */
function chatCompletionsConversation(payload: AssembledModelPayload): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  for (const message of payload.messages) {
    const calls = assistantToolCalls(message);
    if (calls !== null) {
      messages.push({
        role: 'assistant',
        content: calls.text.length > 0 ? calls.text : null,
        ...(calls.reasoning.length > 0 ? { reasoning_content: calls.reasoning } : {}),
        tool_calls: calls.calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })),
      });
      continue;
    }
    const result = toolResultOf(message);
    if (result !== null) {
      messages.push({ role: 'tool', tool_call_id: result.callId, content: result.text });
      continue;
    }
    const text = messageText(message);
    if (text === null) throw new Error('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('DEEPSEEK_REQUEST_ROLE_INVALID');
    messages.push({ role: message.role, content: text });
  }
  return messages;
}

/**
 * Read the chat-completions SSE wire without exposing reasoning. Only [DONE] after a finish marker proves a whole
 * response; EOF, malformed data and an aborted reader remain outcome-unknown (Issue #833).
 */
export async function* dialogueSseEvents(response: DeepSeekTransportResponse, model: string): AsyncIterable<DialogueStreamEvent> {
  let content = '';
  let finish: string | null = null;
  let usage: unknown = null;
  const calls = new Map<number, { id: string; type: string; name: string; arguments: string }>();
  let callBytes = 0;
  try {
    for await (const { data } of sseFrames(response)) {
      if (data === '[DONE]') {
        if (finish === null) throw new Error('AI7_OUTCOME_UNKNOWN');
        const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([index, call], ordinal) => {
          if (index !== ordinal || call.id.length === 0 || call.type !== 'function' || call.name.length === 0) throw new Error('AI7_OUTCOME_UNKNOWN');
          return { id: call.id, type: call.type, function: { name: call.name, arguments: call.arguments } };
        });
        if ((toolCalls.length > 0) !== (finish === 'tool_calls') || new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length) throw new Error('AI7_OUTCOME_UNKNOWN');
        yield { kind: 'complete', response: { model, choices: [{ message: { content, ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }) }, finish_reason: finish }], usage } };
        return;
      }
      const value: unknown = JSON.parse(data);
      if (!isRecord(value) || (value.model !== undefined && value.model !== model) || !Array.isArray(value.choices)) {
        throw new Error('AI7_OUTCOME_UNKNOWN');
      }
      if (value.usage !== undefined && value.usage !== null) usage = value.usage;
      if (value.choices.length === 0) continue;
      if (value.choices.length !== 1 || !isRecord(value.choices[0])) throw new Error('AI7_OUTCOME_UNKNOWN');
      const choice = value.choices[0];
      if (choice.index !== undefined && choice.index !== 0) throw new Error('AI7_OUTCOME_UNKNOWN');
      const alreadyFinished = finish !== null;
      if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
        if (typeof choice.finish_reason !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
        finish = choice.finish_reason;
      }
      if (!isRecord(choice.delta)) throw new Error('AI7_OUTCOME_UNKNOWN');
      if (choice.delta.tool_calls !== undefined) {
        if (alreadyFinished || !Array.isArray(choice.delta.tool_calls)) throw new Error('AI7_OUTCOME_UNKNOWN');
        for (const delta of choice.delta.tool_calls) {
          if (!isRecord(delta) || typeof delta.index !== 'number' || !Number.isSafeInteger(delta.index) || delta.index < 0 || delta.index >= 128) throw new Error('AI7_OUTCOME_UNKNOWN');
          const index = delta.index;
          const call = calls.get(index) ?? { id: '', type: '', name: '', arguments: '' };
          for (const key of ['id', 'type'] as const) {
            if (delta[key] === undefined) continue;
            if (typeof delta[key] !== 'string' || call[key].length > 0) throw new Error('AI7_OUTCOME_UNKNOWN');
            call[key] = delta[key];
            callBytes += delta[key].length;
          }
          if (delta.function !== undefined) {
            if (!isRecord(delta.function)) throw new Error('AI7_OUTCOME_UNKNOWN');
            for (const key of ['name', 'arguments'] as const) {
              const fragment = delta.function[key];
              if (fragment === undefined) continue;
              if (typeof fragment !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
              call[key] += fragment;
              callBytes += fragment.length;
            }
          }
          if (callBytes > 1024 * 1024) throw new Error('AI7_OUTCOME_UNKNOWN');
          calls.set(index, call);
        }
      }
      const text = choice.delta.content;
      if (text === undefined || text === null || text === '') continue;
      if (typeof text !== 'string' || alreadyFinished) throw new Error('AI7_OUTCOME_UNKNOWN');
      content += text;
      yield { kind: 'text', text };
    }
  } catch (error) {
    throw streamFailure(error);
  }
  throw new Error('AI7_OUTCOME_UNKNOWN');
}
