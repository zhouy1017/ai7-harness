import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { describe, expect, it, vi } from 'vitest';
import { DeepSeekOpenAiCompatibleAdapter, OPENCODE_GO_ROUTE_PROFILE, type DeepSeekTransport } from '../../src/service/provider/deepseek-adapter.js';
import { AI7_FAILURE_CODES } from '../../src/service/provider/classification.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { OPENCODE_GO_V41_FLASH_PROFILE } from '../../src/service/provider/model-profile.js';
import { DEFAULT_TRANSPORT_SETTINGS, noteRequestActivity } from '../../src/service/provider/request-deadlines.js';
import { buildDialogueMessage, DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST } from '../../src/service/dialogue/contract.js';

// #1599 — a streamed answer is bounded by its first byte and by the gap between bytes, never by its total length.
const model = OPENCODE_GO_V41_FLASH_PROFILE;
const frame = (value: unknown): Uint8Array => new TextEncoder().encode(`data: ${JSON.stringify(value)}\r\n\r\n`);
const text = (content: string): Uint8Array => frame({ model: model.model, choices: [{ index: 0, delta: { content } }] });
const reasoning = frame({ model: model.model, choices: [{ index: 0, delta: { reasoning_content: '思考' } }] });
const stop = frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
const done = new TextEncoder().encode('data: [DONE]\r\n\r\n');

/** A stream the test feeds chunk by chunk, answering as the transport layer does: every byte read is noted for the request. */
function feed(init: Parameters<DeepSeekTransport>[1]): { response: Response; push(chunk: Uint8Array): void; end(): void } {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  init.signal?.addEventListener('abort', () => { try { controller.error(init.signal!.reason); } catch { /* already closed */ } }, { once: true });
  return { response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    push: (chunk) => { controller.enqueue(chunk); noteRequestActivity(init); }, end: () => controller.close() };
}

function dialogue(transport: DeepSeekTransport, settings = DEFAULT_TRANSPORT_SETTINGS): DeepSeekOpenAiCompatibleAdapter {
  return new DeepSeekOpenAiCompatibleAdapter({
    broker: new CredentialBroker({ resolve: async () => 'placeholder' }),
    slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Fast Interaction Role', slot: 'opencode-go', credentialReference: 'a7c0de00-5040-4f27-9e13-6b1f2c8d4a55' },
    tickets: { take: () => ({ decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) }) },
    attribution: () => ({}), promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST, profile: OPENCODE_GO_ROUTE_PROFILE, modelProfile: model,
    sessionId: () => 'synthetic-session', requestShape: 'editorial-dialogue-sse', transportSettings: settings,
    codes: { QUOTA_EXCEEDED_CODE: 'QUOTA', INVALID_CREDENTIAL_CODE: 'AUTH', CONTEXT_WINDOW_EXCEEDED_CODE: 'CONTEXT' },
    transport,
  });
}
const turn = (signal?: AbortSignal): GenerateOptions => ({ provider: model.route, model: model.model, system: DIALOGUE_PROMPT_CONTRACT.systemPrompt,
  ...(signal === undefined ? {} : { signal }),
  messages: [{ id: 'synthetic-message' as never, source: { kind: 'user' }, role: 'user',
    content: [{ type: 'text', text: buildDialogueMessage({ kind: 'ask', selection: '合成选区。', question: '合成问题？', kept: null }) }] }] });
async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('streamed answer deadlines (#1599)', () => {
  it('completes an answer that keeps arriving long past 180 s, through reasoning frames that carry no answer text', async () => {
    vi.useFakeTimers();
    try {
      let live!: ReturnType<typeof feed>;
      let calls = 0;
      const running = dialogue(async (_url, init) => { calls += 1; live = feed(init); return live.response; });
      const completed = collect(running.stream(turn()));
      await vi.advanceTimersByTimeAsync(0);
      // 8 frames 60 s apart: 480 s in total, no gap near the 90 s idle bound, the first four with no answer text at all.
      for (const chunk of [reasoning, reasoning, reasoning, reasoning, text('第一段'), text('第二段'), text('第三段'), stop]) {
        await vi.advanceTimersByTimeAsync(60_000);
        live.push(chunk);
      }
      live.push(done);
      live.end();
      const chunks = await completed;
      expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } });
      expect(running.lastCanonicalResult).toMatchObject({ kind: 'answer', text: '第一段第二段第三段' });
      expect(calls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('ends a connection with no first byte at its bound as an unknown outcome, sent once', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const running = dialogue((_url, init) => { calls += 1; return new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true })); },
        { ...DEFAULT_TRANSPORT_SETTINGS, firstByteSeconds: 30 });
      const completed = collect(running.stream(turn()));
      let settled = false;
      void completed.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(29_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await completed).at(-1)).toMatchObject({ reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.OUTCOME_UNKNOWN } } });
      expect(calls).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('ends an answer that stalls mid-stream at the idle bound, keeps what arrived, and never resends', async () => {
    vi.useFakeTimers();
    try {
      let live!: ReturnType<typeof feed>;
      let calls = 0;
      const running = dialogue(async (_url, init) => { calls += 1; live = feed(init); return live.response; });
      const completed = collect(running.stream(turn()));
      let settled = false;
      void completed.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(60_000);
      live.push(text('已到达的部分'));
      await vi.advanceTimersByTimeAsync(89_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const chunks = await completed;
      expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.OUTCOME_UNKNOWN } } });
      expect(running.lastCanonicalResult).toMatchObject({ text: '已到达的部分', truncated: true });
      expect(calls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('aborts at once on cancel, with no timer left behind', async () => {
    vi.useFakeTimers();
    try {
      let live!: ReturnType<typeof feed>;
      const cancel = new AbortController();
      const running = dialogue(async (_url, init) => { live = feed(init); return live.response; });
      const completed = collect(running.stream(turn(cancel.signal)));
      await vi.advanceTimersByTimeAsync(5_000);
      live.push(text('部分'));
      cancel.abort();
      expect((await completed).at(-1)).toMatchObject({ reason: { kind: 'error' } });
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
