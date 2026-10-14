import { describe, expect, it } from 'vitest';
import { assembleProviderRequest, DeepSeekOpenAiCompatibleAdapter, dialogueSseEvents, OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { OPENCODE_GO_V41_FLASH_PROFILE } from '../../src/service/provider/model-profile.js';
import { buildDialogueMessage, DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST } from '../../src/service/dialogue/contract.js';
import { canonicalJson } from '../../src/service/analysis/canonical.js';

const model = OPENCODE_GO_V41_FLASH_PROFILE;
const event = (value: unknown): string => `data: ${JSON.stringify(value)}\r\n\r\n`;
const delta = (text: string): string => event({ model: model.model, choices: [{ index: 0, delta: { content: text } }] });
const finish = event({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
const usage = event({ choices: [], usage: { prompt_tokens: 8, completion_tokens: 4 } });
const done = 'data: [DONE]\r\n\r\n';
const response = (wire: string, bytewise = false): Response => {
  const bytes = new TextEncoder().encode(wire);
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    if (bytewise) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    else controller.enqueue(bytes);
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
};
async function read(wire: string, bytewise = false): Promise<unknown[]> {
  const events = [];
  for await (const item of dialogueSseEvents(response(wire, bytewise), model.model)) events.push(item);
  return events;
}

describe('dialogue-only SSE transport (Issue #833)', () => {
  it('finishes an empty SSE answer with one text block and no duplicate block start', async () => {
    const instance = new DeepSeekOpenAiCompatibleAdapter({
      broker: new CredentialBroker({ resolve: async () => 'placeholder' }),
      slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Fast Interaction Role', slot: 'opencode-go', credentialReference: 'a7c0de00-5040-4f27-9e13-6b1f2c8d4a55' },
      tickets: { take: () => ({ decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) }) },
      attribution: () => ({}), promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST,
      profile: OPENCODE_GO_ROUTE_PROFILE, modelProfile: model, sessionId: () => 'synthetic-session', requestShape: 'editorial-dialogue-sse',
      codes: { QUOTA_EXCEEDED_CODE: 'QUOTA', INVALID_CREDENTIAL_CODE: 'AUTH', CONTEXT_WINDOW_EXCEEDED_CODE: 'CONTEXT' },
      transport: async () => response(finish + usage + done),
    });
    const chunks = [];
    for await (const chunk of instance.stream({ provider: model.route, model: model.model, system: DIALOGUE_PROMPT_CONTRACT.systemPrompt, messages: [{ id: 'synthetic-message' as never, source: { kind: 'user' }, role: 'user', content: [{ type: 'text', text: buildDialogueMessage({ kind: 'ask', selection: '合成选区。', question: '合成问题？', kept: null }) }] }] })) chunks.push(chunk);
    expect(chunks.map((chunk) => chunk.type)).toEqual(['block-start', 'text-delta', 'block-end', 'usage', 'finish']);
    expect(instance.lastCanonicalResult?.kind).toBe('empty-answer');
  });
  it('keeps baseline and review JSON bytes identical, even on an SSE-capable model', () => {
    for (const system of ['合成分析契约。', '合成审阅契约。']) {
      const payload = { provider: model.route, model: model.model, system, messages: [{ source: { kind: 'user' as const }, role: 'user' as const, content: [{ type: 'text' as const, text: '合成输入。' }] }] };
      const assembly = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, model, payload, { attribution: {}, promptContractDigest: 'a'.repeat(64), sessionId: 'synthetic-session' });
      expect(assembly.body).toBe(`{"messages":[{"content":${JSON.stringify(system)},"role":"system"},{"content":"合成输入。","role":"user"}],"model":"deepseek-v4.1-flash","stream":false}`);
      expect(assembly.headers.accept).toBe('application/json');
      expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, model, payload, { attribution: {}, promptContractDigest: 'a'.repeat(64), sessionId: 'synthetic-session', requestShape: 'editorial-dialogue-sse' })).toThrow('PROVIDER_DIALOGUE_STREAM_SHAPE_INVALID');
    }
  });
  it('selects SSE only for the exact frozen dialogue shape and observed model capability', () => {
    const payload = { provider: model.route, model: model.model, system: DIALOGUE_PROMPT_CONTRACT.systemPrompt, messages: [{ source: { kind: 'user' as const }, role: 'user' as const, content: [{ type: 'text' as const, text: buildDialogueMessage({ kind: 'ask', selection: '合成选区。', question: '合成问题？', kept: null }) }] }] };
    const context = { attribution: {}, promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST, sessionId: 'synthetic-session', requestShape: 'editorial-dialogue-sse' as const };
    const { requestShape: _shape, ...ordinaryContext } = context;
    const ordinary = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, model, payload, ordinaryContext);
    const streamed = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, model, payload, context);
    expect(streamed.body).toBe(canonicalJson({ ...JSON.parse(ordinary.body), stream: true, stream_options: { include_usage: true } }));
    expect(streamed.headers.accept).toBe('text/event-stream');
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, { ...model, capabilities: { ...model.capabilities, streaming: 'none' } }, payload, context)).toThrow('PROVIDER_DIALOGUE_STREAM_SHAPE_INVALID');
  });
  it('assembles split UTF-8 and CRLF events, ignores reasoning, and yields one JSON-equivalent aggregate', async () => {
    const events = await read(': keepalive\r\n\r\n' + event({ choices: [{ delta: { reasoning_content: '合成内部推理。' } }] }) + delta('第一句。') + delta('第二句。') + finish + usage + done, true);
    expect(events).toEqual([{ kind: 'text', text: '第一句。' }, { kind: 'text', text: '第二句。' }, { kind: 'complete', response: { model: model.model, choices: [{ message: { content: '第一句。第二句。' }, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 4 } } }]);
    expect(JSON.stringify(events)).not.toContain('内部推理');
  });
  it('requires both finish and DONE; malformed, wrong-model, and truncated responses are unknown', async () => {
    for (const wire of [delta('前缀。'), delta('前缀。') + done, delta('前缀。') + finish, 'data: {broken}\n\n', event({ model: 'wrong-model', choices: [] }) + finish + done]) {
      await expect(read(wire)).rejects.toThrow('AI7_OUTCOME_UNKNOWN');
    }
  });
  it('delivers a fragment before the remaining network data arrives and cancels the reader on interruption', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel() { cancelled = true; } });
    const iterator = dialogueSseEvents(new Response(body, { headers: { 'content-type': 'text/event-stream' } }), model.model)[Symbol.asyncIterator]();
    controller.enqueue(new TextEncoder().encode(delta('完整句。')));
    expect(await iterator.next()).toEqual({ done: false, value: { kind: 'text', text: '完整句。' } });
    await iterator.return?.();
    expect(cancelled).toBe(true);
  });
});
