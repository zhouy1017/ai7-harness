import { isRecord } from '../../src/service/analysis/canonical.js';

/** Provider-free protocol fixtures, read 2026-11-14. No recording, credential or manuscript.
 * OpenAI: https://developers.openai.com/api/docs/guides/reasoning
 * Anthropic: https://platform.claude.com/docs/en/build-with-claude/thinking-tool-workflows
 * DeepSeek: https://api-docs.deepseek.com/guides/thinking_mode/
 * Gemini: https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures
 */
export function reasoningWireResponse(family: string, turn: number) {
  const calls = turn === 1 ? ['call_1'] : turn === 2 ? ['call_2', 'call_3'] : [];
  const text = turn > 2 ? 'Protocol result.' : '';
  const input = { query: 'protocol' };
  const reasoning = `Synthetic protocol state ${turn}.`;
  const signature = `synthetic-signature-${turn}`;
  const native: Array<Record<string, unknown>> = family === 'openai-chat-completions'
    ? [{ role: 'assistant', content: text || null, reasoning_content: reasoning,
      ...(calls.length === 0 ? {} : { tool_calls: calls.map((id) => ({ id, type: 'function', function: { name: 'retrieve', arguments: JSON.stringify(input) } })) }) }]
    : family === 'openai-responses'
      ? [{ type: 'reasoning', id: `rs_${turn}`, summary: [], encrypted_content: `synthetic-encrypted-${turn}` },
        ...(text ? [{ type: 'message', role: 'assistant', id: `msg_${turn}`, status: 'completed', phase: 'final_answer', content: [{ type: 'output_text', text, annotations: [] }] }] : []),
        ...calls.map((id) => ({ type: 'function_call', id: `fc_${id}`, call_id: id, name: 'retrieve', arguments: JSON.stringify(input), status: 'completed' }))]
      : family === 'anthropic-messages'
        ? [{ type: 'thinking', thinking: turn === 2 ? '' : reasoning, signature }, { type: 'redacted_thinking', data: `synthetic-redacted-${turn}` },
          ...(text ? [{ type: 'text', text }] : []), ...calls.map((id) => ({ type: 'tool_use', id, name: 'retrieve', input }))]
        : [{ text: reasoning, thought: true }, ...(text ? [{ text, thoughtSignature: signature }] : []),
          ...calls.map((id, index) => ({ functionCall: { name: 'retrieve', args: input }, ...(index === 0 ? { thoughtSignature: signature } : {}) }))];
  const body = family === 'openai-chat-completions'
    ? { choices: [{ message: native[0], finish_reason: calls.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }
    : family === 'openai-responses'
      ? { status: 'completed', output: native, usage: { input_tokens: 10, output_tokens: 5 } }
      : family === 'anthropic-messages'
        ? { type: 'message', role: 'assistant', content: native, stop_reason: calls.length ? 'tool_use' : 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }
        : { candidates: [{ content: { role: 'model', parts: native }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };
  const frame = (value: unknown): string => `data: ${JSON.stringify(value)}\n\n`;
  const frames: string[] = [];
  if (family === 'openai-chat-completions') {
    frames.push(frame({ choices: [{ delta: { content: text, reasoning_content: reasoning,
      tool_calls: calls.map((id, index) => ({ index, id, type: 'function', function: { name: 'retrieve', arguments: JSON.stringify(input) } })) }, finish_reason: calls.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), 'data: [DONE]\n\n');
  } else if (family === 'openai-responses') frames.push(frame({ type: 'response.completed', response: body }));
  else if (family === 'anthropic-messages') {
    frames.push(frame({ type: 'message_start', message: { usage: { input_tokens: 10 } } }));
    for (const [index, block] of native.entries()) {
      if (block.type === 'thinking') {
        frames.push(frame({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } }));
        frames.push(frame({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: block.thinking } }));
        frames.push(frame({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: signature.slice(0, 8) } }));
        frames.push(frame({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: signature.slice(8) } }));
      } else frames.push(frame({ type: 'content_block_start', index, content_block: block }));
      frames.push(frame({ type: 'content_block_stop', index }));
    }
    frames.push(frame({ type: 'message_delta', delta: { stop_reason: calls.length ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 5 } }), frame({ type: 'message_stop' }));
  } else frames.push(frame(body));
  return { body, native, sse: frames.join('') };
}

export function reasoningHistory(body: Record<string, unknown>, family: string): unknown[][] {
  const records = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.filter(isRecord) : [];
  if (family === 'openai-responses') {
    const groups: unknown[][] = [];
    for (const item of records(body.input)) {
      if (item.type === 'reasoning') groups.push([item]);
      else if (item.type === 'function_call' || item.type === 'message') groups.at(-1)?.push(item);
    }
    return groups;
  }
  if (family === 'google-generate-content') return records(body.contents).filter((item) => item.role === 'model').map((item) => records(item.parts));
  return records(body.messages).filter((item) => item.role === 'assistant').map((item) => family === 'anthropic-messages' ? records(item.content) : [item]);
}
