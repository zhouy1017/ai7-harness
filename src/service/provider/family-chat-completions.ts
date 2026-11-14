import { canonicalJson, isRecord } from '../analysis/canonical.js';
import type { DeepSeekTransportResponse, DialogueStreamEvent } from './deepseek-adapter.js';
import { conversationMessages, functionToolOf, systemPromptOf } from './family-payload.js';
import { effectiveModelReasoningEffort, modelReasoningControl, type ProviderModelProfile } from './model-profile.js';
import { assistantToolCalls, familyReplayItems, messageText, toolResultOf, type AssembledModelPayload } from './payload.js';
import { sseFrames, streamFailure } from './stream-frames.js';

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
  const reasoningEffort = effectiveModelReasoningEffort(model, payload.reasoningEffort);
  return canonicalJson({
    model: model.model,
    messages,
    stream: false,
    ...(reasoningEffort !== null
      ? { ...(modelReasoningControl(model) === 'deepseek-thinking' ? { thinking: { type: 'enabled' } } : {}), reasoning_effort: reasoningEffort }
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
    const replay = familyReplayItems(message, 'openai-chat-completions');
    if (replay !== null) { messages.push(...replay); continue; }
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

/** DeepSeek requires reasoning_content on every retained assistant turn when tools are offered. */
export function chatReplayItems(body: unknown, callIds: ReadonlySet<string>): Record<string, unknown>[] | null {
  const choice = isRecord(body) && Array.isArray(body.choices) ? body.choices[0] : null;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : null;
  if (message === null || typeof message.reasoning_content !== 'string') return null;
  const text = typeof message.content === 'string' ? message.content : Array.isArray(message.content)
    ? message.content.filter(isRecord).filter((part) => part.type === 'text' || part.type === 'output_text').map((part) => typeof part.text === 'string' ? part.text : '').join('') : '';
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls.filter(isRecord).filter((call) => typeof call.id === 'string' && callIds.has(call.id))
    .map((call) => ({ id: call.id, type: 'function', function: { name: (call.function as Record<string, unknown>).name, arguments: (call.function as Record<string, unknown>).arguments } })) : [];
  return [{ role: 'assistant', content: calls.length > 0 && text === '' ? null : text, reasoning_content: message.reasoning_content,
    ...(calls.length === 0 ? {} : { tool_calls: calls }) }];
}

/**
 * Read the first choice without exposing reasoning. DONE completes the response; redundant frames and model aliases
 * do not change its meaning. EOF without DONE remains outcome-unknown, preserving text at the adapter.
 */
export async function* dialogueSseEvents(response: DeepSeekTransportResponse, model: string, preserveReasoning = false): AsyncIterable<DialogueStreamEvent> {
  let content = '';
  let reasoningContent: string | null = null;
  let finish: string | null = null;
  let usage: unknown = null;
  const calls = new Map<number, { id: string; type: string; name: string; arguments: string }>();
  let callBytes = 0;
  try {
    for await (const { event, data } of sseFrames(response)) {
      if (event === 'ai7-buffered-response') { yield { kind: 'complete', response: JSON.parse(data) }; return; }
      if (data === '[DONE]') {
        finish ??= calls.size > 0 ? 'tool_calls' : 'stop';
        const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => {
          // Malformed calls are rejected individually at normalization.
          return { id: call.id, type: call.type, function: { name: call.name, arguments: call.arguments } };
        });
        yield { kind: 'complete', response: { model, choices: [{ message: { content: toolCalls.length > 0 && content === '' ? null : content,
          ...(reasoningContent === null || !preserveReasoning && toolCalls.length === 0 ? {} : { reasoning_content: reasoningContent }),
          ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }) }, finish_reason: finish }], usage } };
        return;
      }
      let value: unknown;
      try { value = JSON.parse(data); } catch { continue; }
      if (isRecord(value) && isRecord(value.error)) {
        const code = String(value.error.code ?? value.error.type ?? '');
        const status = Number.isSafeInteger(value.error.status) ? value.error.status as number
          : /rate|quota|balance/iu.test(code) ? 429 : /auth/iu.test(code) ? 401 : /context|invalid_request/iu.test(code) ? 400 : 500;
        yield { kind: 'error', status, body: { error: value.error } };
        return;
      }
      if (!isRecord(value) || !Array.isArray(value.choices)) {
        continue;
      }
      if (value.usage !== undefined && value.usage !== null) usage = value.usage;
      if (value.choices.length === 0) continue;
      if (!isRecord(value.choices[0])) continue;
      const choice = value.choices[0];
      if (finish !== null) continue;
      if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
        if (typeof choice.finish_reason !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
        finish = choice.finish_reason;
      }
      if (!isRecord(choice.delta)) continue;
      if (typeof choice.delta.reasoning_content === 'string') reasoningContent = `${reasoningContent ?? ''}${choice.delta.reasoning_content}`;
      if (choice.delta.tool_calls !== undefined) {
        if (!Array.isArray(choice.delta.tool_calls)) continue;
        for (const delta of choice.delta.tool_calls) {
          if (!isRecord(delta) || typeof delta.index !== 'number' || !Number.isSafeInteger(delta.index) || delta.index < 0 || delta.index >= 128) continue;
          const index = delta.index;
          const call = calls.get(index) ?? { id: '', type: '', name: '', arguments: '' };
          for (const key of ['id', 'type'] as const) {
            if (delta[key] === undefined) continue;
            if (typeof delta[key] !== 'string') continue;
            if (call[key] === delta[key]) continue;
            if (call[key].length > 0) { call.type = 'invalid'; continue; }
            call[key] = delta[key];
            callBytes += delta[key].length;
          }
          if (delta.function !== undefined) {
            if (!isRecord(delta.function)) { call.type = 'invalid'; calls.set(index, call); continue; }
            for (const key of ['name', 'arguments'] as const) {
              const fragment = delta.function[key];
              if (fragment === undefined) continue;
              if (typeof fragment !== 'string') { call.type = 'invalid'; continue; }
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
      if (typeof text !== 'string') continue;
      content += text;
      yield { kind: 'text', text };
    }
  } catch (error) {
    throw streamFailure(error);
  }
  throw new Error('AI7_OUTCOME_UNKNOWN');
}
