import { describe, expect, it } from 'vitest';
import { DIALOGUE_RETRIEVAL_PROMPT_CONTRACT, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST, buildDialogueMessage } from '../../src/service/dialogue/contract.js';
import { OPENCODE_GO_ROUTE_PROFILE, assembleProviderRequest, dialogueSseEvents } from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_V41_FLASH_PROFILE } from '../../src/service/provider/model-profile.js';
import type { AssembledModelPayload } from '../../src/service/provider/payload.js';
import { LOCAL_TOOL_SCHEMAS, PLATFORM_TOOL_SCHEMAS } from '../../src/service/provider/platform-tools.js';

const model = OPENCODE_GO_V41_FLASH_PROFILE;
const context = { attribution: {}, promptContractDigest: DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST, sessionId: 'retrieval-sse', requestShape: 'editorial-dialogue-sse' as const };
const first: AssembledModelPayload['messages'][number] = { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: buildDialogueMessage({ kind: 'ask', selection: '合成选区', question: '找到书中哪里有相似的描写？', kept: null }) }] };
const call: AssembledModelPayload['messages'][number] = { role: 'assistant', source: { kind: 'model' }, content: [{ type: 'tool-call', id: 'c1', name: 'retrieve', arguments: '{"query":"合成"}' }] };
const result: AssembledModelPayload['messages'][number] = { role: 'user', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: '[]' }] }] };
const payload = (messages: AssembledModelPayload['messages'] = [first]): AssembledModelPayload => ({ provider: model.route, model: model.model, system: DIALOGUE_RETRIEVAL_PROMPT_CONTRACT.systemPrompt, tools: LOCAL_TOOL_SCHEMAS, messages });

async function decode(deltas: unknown[], finish: string | null, done = true): Promise<unknown[]> {
  const values: unknown[] = deltas.map((delta) => ({ model: model.model, choices: [{ index: 0, delta }] }));
  if (finish !== null) values.push({ model: model.model, choices: [{ index: 0, delta: {}, finish_reason: finish }] });
  const body = values.map((value) => `data: ${JSON.stringify(value)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : '');
  const events: unknown[] = [];
  for await (const event of dialogueSseEvents(new Response(body, { headers: { 'content-type': 'text/event-stream' } }), model.model)) events.push(event);
  return events;
}

describe('the /2 dialogue SSE boundary', () => {
  it('admits only the exact local schema pair and complete correlated history', () => {
    const assemble = (input: AssembledModelPayload): string => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, model, input, context).body;
    expect(JSON.parse(assemble(payload()))).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(JSON.parse(assemble(payload([first, call, result]))).messages).toHaveLength(4);
    for (const input of [payload([first, call]), payload([first, result]), payload([first, call, result, first]),
      { ...payload(), tools: [...LOCAL_TOOL_SCHEMAS, ...PLATFORM_TOOL_SCHEMAS] }]) {
      expect(() => assemble(input)).toThrow();
    }
  });

  it('reconstructs interleaved indexed function fragments without publishing arguments as answer text', async () => {
    const events = await decode([
      { tool_calls: [{ index: 1, id: 'b', type: 'function', function: { name: 'exact_', arguments: '{' } }, { index: 0, id: 'a', type: 'function', function: { name: 're', arguments: '{' } }] },
      { tool_calls: [{ index: 0, function: { name: 'trieve', arguments: '}' } }, { index: 1, function: { name: 'fetch', arguments: '}' } }] },
    ], 'tool_calls');
    expect(events).toEqual([{ kind: 'complete', response: { model: model.model, choices: [{ message: { content: '', tool_calls: [
      { id: 'a', type: 'function', function: { name: 'retrieve', arguments: '{}' } },
      { id: 'b', type: 'function', function: { name: 'exact_fetch', arguments: '{}' } },
    ] }, finish_reason: 'tool_calls' }], usage: null } }]);
  });

  it('keeps incomplete, uncorrelated and unfinished function streams outcome-unknown', async () => {
    const valid = { tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'retrieve', arguments: '{}' } }] };
    for (const [deltas, finish, done] of [
      [[valid], null, true], [[valid], 'tool_calls', false], [[valid], 'stop', true],
      [[{ tool_calls: [{ index: 1, id: 'a', type: 'function', function: { name: 'retrieve', arguments: '{}' } }] }], 'tool_calls', true],
      [[{ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }], 'tool_calls', true],
    ] as const) await expect(decode([...deltas], finish, done)).rejects.toThrow('AI7_OUTCOME_UNKNOWN');
  });
});
