import { canonicalJson, isRecord } from '../analysis/canonical.js';
import type { DeepSeekTransportResponse, DialogueStreamEvent, ProviderRouteProfile } from './deepseek-adapter.js';
import { strictFunctionTools, systemPromptOf } from './family-payload.js';
import type { ProviderModelProfile } from './model-profile.js';
import { assistantToolCalls, messageText, toolResultOf, type AssembledModelPayload } from './payload.js';
import { sseFrames, streamFailure } from './stream-frames.js';

/**
 * The Anthropic Messages family, from the Messages API reference read on 2026-09-08
 * (`https://platform.claude.com/docs/en/api/messages`): `{ model, max_tokens, system?, messages, tools? }`, and its
 * stream (Issue #1180).
 *
 * The system prompt is a top-level field and never a message. `max_tokens` is mandatory, so it is taken from the route's
 * declaration or the request refuses: a cap the assembler invented would be a bound nobody authorized. The reasoning and
 * structured-output spellings this adapter implements are the chat-completions ones, so a profile that declares either
 * on this shape refuses rather than sending a field the endpoint never documented.
 */
export function anthropicMessagesBody(profile: ProviderRouteProfile, model: ProviderModelProfile, payload: AssembledModelPayload): string {
  if (model.capabilities.structuredOutput !== 'none') throw new Error('PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED');
  if (model.capabilities.reasoningControl !== 'none') throw new Error('PROVIDER_REASONING_CONTROL_UNSUPPORTED');
  if (profile.maxOutputTokens === null) throw new Error('PROVIDER_MAX_OUTPUT_TOKENS_ABSENT');
  const toolCalling = model.capabilities.toolCalling === 'function';
  if ((payload.tools ?? []).length > 0 && !toolCalling) throw new Error('PROVIDER_TOOL_CALLING_UNSUPPORTED');
  const tools = strictFunctionTools(payload, 128).map(({ name, description, parameters }) => ({ name, description, input_schema: parameters }));
  const names = tools.map((tool) => tool.name);
  const system = systemPromptOf(payload);
  return canonicalJson({
    model: model.model,
    max_tokens: profile.maxOutputTokens,
    ...(system === null ? {} : { system }),
    messages: anthropicMessagesConversation(payload, names),
    ...(tools.length > 0 ? { tools } : {}),
  });
}

/** The streamed variant: the same body with `stream` on. */
export function anthropicMessagesStreamBody(body: string): string {
  return canonicalJson({ ...JSON.parse(body), stream: true });
}

/**
 * Buffered client functions only (Issue #1056). Keep text before calls, then consume exactly one
 * consecutive result per call into the next user message, retaining the canonical result order.
 * No unresolved batch, opaque reasoning, or intervening message can be repaired by serialization.
 */
function anthropicMessagesConversation(payload: AssembledModelPayload, offeredNames: ReadonlyArray<string>): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < payload.messages.length; index += 1) {
    const message = payload.messages[index]!;
    // Shared history readers intentionally project a wider canonical shape for Chat/Responses.
    // Messages cannot replay opaque fields, including those on otherwise ordinary text blocks.
    // Results are checked where they are consumed; every other block type keeps its existing refusal below.
    for (const block of message.content) {
      const fields = block.type === 'text' ? ['type', 'text'] : block.type === 'tool-call' ? ['type', 'id', 'name', 'arguments'] : null;
      if (fields !== null && Object.keys(block).some((key) => !fields.includes(key))) throw new Error('PROVIDER_TOOL_CALLS_INVALID');
    }
    const calls = assistantToolCalls(message);
    if (calls !== null) {
      if (offeredNames.length === 0) throw new Error('PROVIDER_TOOL_CALLING_UNSUPPORTED');
      const content: Array<Record<string, unknown>> = [];
      const pending = new Set<string>();
      for (const block of message.content) {
        if (block.type === 'text' && typeof block.text === 'string' && pending.size === 0) {
          // A Messages text block must be non-empty; an empty one carries nothing, as Chat/Responses already omit it.
          if (block.text.length > 0) content.push({ type: 'text', text: block.text });
          continue;
        }
        if (block.type !== 'tool-call' || typeof block.id !== 'string' || block.id.length === 0 ||
            typeof block.name !== 'string' || !offeredNames.includes(block.name) || typeof block.arguments !== 'string' || seenIds.has(block.id)) {
          throw new Error('PROVIDER_TOOL_CALLS_INVALID');
        }
        let input: unknown;
        try { input = JSON.parse(block.arguments) as unknown; } catch { throw new Error('PROVIDER_TOOL_CALLS_INVALID'); }
        if (!isRecord(input)) throw new Error('PROVIDER_TOOL_CALLS_INVALID');
        seenIds.add(block.id);
        pending.add(block.id);
        content.push({ type: 'tool_use', id: block.id, name: block.name, input });
      }
      messages.push({ role: 'assistant', content });
      const results: Array<Record<string, unknown>> = [];
      while (pending.size > 0) {
        index += 1;
        const next = payload.messages[index];
        const result = next === undefined ? null : toolResultOf(next);
        if (result === null || !pending.delete(result.callId)) throw new Error('PROVIDER_TOOL_CORRELATION_INVALID');
        const resultBlock = next!.content[0]!;
        if (Object.keys(resultBlock).some((key) => !['type', 'toolCallId', 'content', 'isError'].includes(key)) ||
            resultBlock.content!.some((block) => Object.keys(block).some((key) => key !== 'type' && key !== 'text'))) {
          throw new Error('PROVIDER_TOOL_CORRELATION_INVALID');
        }
        const isError = resultBlock.isError;
        if (isError !== undefined && typeof isError !== 'boolean') throw new Error('PROVIDER_TOOL_CORRELATION_INVALID');
        results.push({ type: 'tool_result', tool_use_id: result.callId, content: result.text, is_error: result.isError });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }
    // Results outside the immediately following batch are orphans, even if their id appeared before.
    if (message.source.kind === 'tool' || message.content.some((block) => block.type === 'tool-result')) {
      throw new Error('PROVIDER_TOOL_CORRELATION_INVALID');
    }
    const text = messageText(message);
    if (text === null) throw new Error('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('DEEPSEEK_REQUEST_ROLE_INVALID');
    messages.push({ role: message.role, content: text });
  }
  return messages;
}

/** The HTTP status an Anthropic error type stands for, so an in-stream failure classifies as the same refusal would. */
const MESSAGES_ERROR_STATUS: Readonly<Record<string, number>> = {
  rate_limit_error: 429, overloaded_error: 529, api_error: 500, billing_error: 402, invalid_request_error: 400,
  authentication_error: 401, permission_error: 403,
};

/**
 * Read the Messages SSE wire into the buffered body. `message_start` opens the message and its input usage, every
 * `content_block_*` builds one block — text from `text_delta`, a tool call from `input_json_delta` fragments parsed at its
 * stop — `message_delta` carries the stop reason and the output usage, and only `message_stop` proves a whole message. A
 * thinking block is kept as its type alone, so the buffered reading sees that the model reasoned and never what; any
 * other block keeps its type and is refused wherever the buffered reading refuses it. `error` is the service's refusal
 * after acceptance. A tool call's argument fragments are bounded exactly as the chat-completions reader bounds them.
 */
export async function* messagesSseEvents(response: DeepSeekTransportResponse): AsyncIterable<DialogueStreamEvent> {
  let started = false;
  let stopReason: unknown = null;
  let usage: Record<string, unknown> = {};
  let argumentBytes = 0;
  const blocks: Array<Record<string, unknown> & { json?: string }> = [];
  try {
    for await (const { data } of sseFrames(response)) {
      const value: unknown = JSON.parse(data);
      if (!isRecord(value) || typeof value.type !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
      if (value.type === 'ping') continue;
      if (value.type === 'error') {
        const error = isRecord(value.error) ? value.error : {};
        yield { kind: 'error', status: MESSAGES_ERROR_STATUS[String(error.type)] ?? 500, body: { error: { type: error.type, message: error.message } } };
        return;
      }
      if (value.type === 'message_start') {
        if (started || !isRecord(value.message)) throw new Error('AI7_OUTCOME_UNKNOWN');
        started = true;
        usage = isRecord(value.message.usage) ? { ...value.message.usage } : {};
        continue;
      }
      if (!started) throw new Error('AI7_OUTCOME_UNKNOWN');
      if (value.type === 'content_block_start') {
        if (value.index !== blocks.length || !isRecord(value.content_block) || typeof value.content_block.type !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
        const block = value.content_block;
        blocks.push(block.type === 'text' ? { type: 'text', text: '' }
          : block.type === 'tool_use' ? { type: 'tool_use', id: block.id, name: block.name, json: '' } : { type: block.type });
        continue;
      }
      if (value.type === 'content_block_delta') {
        const block = typeof value.index === 'number' ? blocks[value.index] : undefined;
        if (block === undefined || value.index !== blocks.length - 1 || !isRecord(value.delta)) throw new Error('AI7_OUTCOME_UNKNOWN');
        if (value.delta.type === 'text_delta') {
          if (block.type !== 'text' || typeof value.delta.text !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
          block.text = `${block.text as string}${value.delta.text}`;
          if (value.delta.text.length > 0) yield { kind: 'text', text: value.delta.text };
        } else if (value.delta.type === 'input_json_delta') {
          if (block.type !== 'tool_use' || typeof value.delta.partial_json !== 'string') throw new Error('AI7_OUTCOME_UNKNOWN');
          block.json += value.delta.partial_json;
          argumentBytes += value.delta.partial_json.length;
          if (argumentBytes > 1024 * 1024) throw new Error('AI7_OUTCOME_UNKNOWN');
        }
        // Thinking and signature deltas are never read: presence is the block's type.
        continue;
      }
      if (value.type === 'content_block_stop') {
        const block = typeof value.index === 'number' ? blocks[value.index] : undefined;
        if (block === undefined) throw new Error('AI7_OUTCOME_UNKNOWN');
        if (block.type === 'tool_use') {
          const input: unknown = JSON.parse(block.json === '' ? '{}' : block.json!);
          delete block.json;
          block.input = input;
        }
        continue;
      }
      if (value.type === 'message_delta') {
        if (isRecord(value.delta) && value.delta.stop_reason !== undefined) stopReason = value.delta.stop_reason;
        if (isRecord(value.usage)) usage = { ...usage, ...value.usage };
        continue;
      }
      if (value.type === 'message_stop') {
        if (blocks.some((block) => block.json !== undefined)) throw new Error('AI7_OUTCOME_UNKNOWN');
        yield { kind: 'complete', response: { type: 'message', role: 'assistant', content: blocks, stop_reason: stopReason, usage } };
        return;
      }
      // The reference asks readers to pass over event types it may add; none carries a byte of the message.
    }
  } catch (error) {
    throw streamFailure(error);
  }
  throw new Error('AI7_OUTCOME_UNKNOWN');
}
