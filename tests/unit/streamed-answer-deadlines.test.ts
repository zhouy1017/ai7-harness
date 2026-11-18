import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { describe, expect, it, vi } from 'vitest';
import { DeepSeekOpenAiCompatibleAdapter, OPENCODE_GO_ROUTE_PROFILE, type DeepSeekTransport } from '../../src/service/provider/deepseek-adapter.js';
import { AI7_FAILURE_CODES } from '../../src/service/provider/classification.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { OPENCODE_GO_V41_FLASH_PROFILE } from '../../src/service/provider/model-profile.js';
import { DEFAULT_TRANSPORT_SETTINGS, connectionTestTransport, noteRequestActivity } from '../../src/service/provider/request-deadlines.js';
import { proxyAwareFetch } from '../../src/service/provider/proxy-setting.js';
import { validatedTransportSettings } from '../../src/shared/protocol/transport-settings.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
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

function adapterOver(transport: DeepSeekTransport, settings = DEFAULT_TRANSPORT_SETTINGS,
  requestShape?: 'editorial-dialogue-sse', promptContractDigest = DIALOGUE_PROMPT_CONTRACT_DIGEST): DeepSeekOpenAiCompatibleAdapter {
  return new DeepSeekOpenAiCompatibleAdapter({
    broker: new CredentialBroker({ resolve: async () => 'placeholder' }),
    slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Fast Interaction Role', slot: 'opencode-go', credentialReference: 'a7c0de00-5040-4f27-9e13-6b1f2c8d4a55' },
    tickets: { take: () => ({ decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) }) },
    attribution: () => ({}), promptContractDigest, profile: OPENCODE_GO_ROUTE_PROFILE, modelProfile: model,
    sessionId: () => 'synthetic-session', ...(requestShape === undefined ? {} : { requestShape }), transportSettings: settings,
    codes: { QUOTA_EXCEEDED_CODE: 'QUOTA', INVALID_CREDENTIAL_CODE: 'AUTH', CONTEXT_WINDOW_EXCEEDED_CODE: 'CONTEXT' },
    transport,
  });
}
const dialogue = (transport: DeepSeekTransport, settings = DEFAULT_TRANSPORT_SETTINGS): DeepSeekOpenAiCompatibleAdapter =>
  adapterOver(transport, settings, 'editorial-dialogue-sse');
/** The whole-answer shape every Review, analysis and writing unit uses: not streamed. */
const whole = (transport: DeepSeekTransport): DeepSeekOpenAiCompatibleAdapter => adapterOver(transport, DEFAULT_TRANSPORT_SETTINGS, undefined, BASELINE_PROMPT_CONTRACT_DIGEST);
const wholeTurn = (): GenerateOptions => ({ provider: model.route, model: model.model, system: '合成分析契约。',
  messages: [{ id: 'synthetic-message' as never, source: { kind: 'user' }, role: 'user', content: [{ type: 'text', text: '合成输入。' }] }] });
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

  it('aborts at once on cancel, as the caller\'s abort and never as a timeout, with no timer left behind', async () => {
    vi.useFakeTimers();
    try {
      let live!: ReturnType<typeof feed>;
      let sentSignal: AbortSignal | undefined;
      const cancel = new AbortController();
      const running = dialogue(async (_url, init) => { sentSignal = init.signal; live = feed(init); return live.response; });
      const completed = collect(running.stream(turn(cancel.signal)));
      await vi.advanceTimersByTimeAsync(5_000);
      live.push(text('部分'));
      cancel.abort();
      // No timer advance: the turn ends by the abort alone, and what had arrived stays a partial answer.
      expect((await completed).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.OUTCOME_UNKNOWN } } });
      expect(running.lastCanonicalResult).toMatchObject({ text: '部分', truncated: true });
      expect(sentSignal?.aborted).toBe(true);
      expect((sentSignal?.reason as Error).name).toBe('AbortError');
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});

// The adapter joined to the real `proxyAwareFetch`, which tells the request that bytes arrived: each shape through it.
describe('adapter joined to proxyAwareFetch (#1599)', () => {
  const joined = (native: typeof fetch): DeepSeekTransport => (url, init) => proxyAwareFetch(native, async () => ({ mode: 'direct' }))(url, init) as Promise<Response>;

  it('settles a whole-answer request whose headers come at once and whose body completes at 200 s', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const native: typeof fetch = async () => {
        calls += 1;
        return new Response(new ReadableStream<Uint8Array>({ start(controller) {
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ model: model.model, choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 2 } })));
            controller.close();
          }, 200_000);
        } }), { status: 200, headers: { 'content-type': 'application/json' } });
      };
      const running = whole(joined(native));
      const completed = collect(running.stream(wholeTurn()));
      await vi.advanceTimersByTimeAsync(200_000);
      expect((await completed).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } });
      expect(running.lastCanonicalResult).toMatchObject({ kind: 'answer', text: '{"ok":true}' });
      expect(calls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('keeps a streamed answer alive across reasoning-only bytes past 180 s, and ends a stall at the idle bound', async () => {
    vi.useFakeTimers();
    try {
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      let calls = 0;
      const native: typeof fetch = async (_url, init) => {
        calls += 1;
        init?.signal?.addEventListener('abort', () => { try { controller.error(init.signal!.reason); } catch { /* closed */ } }, { once: true });
        return new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
      };
      const running = dialogue(joined(native));
      const completed = collect(running.stream(turn()));
      await vi.advanceTimersByTimeAsync(0);
      for (let index = 0; index < 4; index += 1) { await vi.advanceTimersByTimeAsync(60_000); controller.enqueue(reasoning); }
      await vi.advanceTimersByTimeAsync(60_000);
      controller.enqueue(text('长答案'));
      let settled = false;
      void completed.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(89_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await completed).at(-1)).toMatchObject({ reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.OUTCOME_UNKNOWN } } });
      expect(running.lastCanonicalResult).toMatchObject({ text: '长答案', truncated: true });
      expect(calls).toBe(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('transport record (#1599)', () => {
  it.each([['firstByteSeconds', 0], ['idleSeconds', -1], ['totalCeilingSeconds', Number.NaN], ['connectionTestSeconds', undefined]] as const)(
    'refuses a record whose %s is %s, where it is read', (key, value) => {
      expect(() => validatedTransportSettings({ ...DEFAULT_TRANSPORT_SETTINGS, [key]: value })).toThrow(`AI7_TRANSPORT_SETTINGS_INVALID: transport.${key}`);
    });
  it('refuses a missing record and a malformed retry term, and returns the shipped record unchanged', () => {
    expect(() => validatedTransportSettings(undefined)).toThrow('AI7_TRANSPORT_SETTINGS_INVALID');
    expect(() => validatedTransportSettings({ ...DEFAULT_TRANSPORT_SETTINGS, rateLimitRetry: { honourRetryAfter: true } })).toThrow('rateLimitRetry');
    expect(validatedTransportSettings(DEFAULT_TRANSPORT_SETTINGS)).toBe(DEFAULT_TRANSPORT_SETTINGS);
  });
  it('gives a connection test its own short bound for the first byte and the whole', () => {
    expect(connectionTestTransport()).toMatchObject({ firstByteSeconds: DEFAULT_TRANSPORT_SETTINGS.connectionTestSeconds, totalCeilingSeconds: DEFAULT_TRANSPORT_SETTINGS.connectionTestSeconds });
    expect(DEFAULT_TRANSPORT_SETTINGS.connectionTestSeconds).toBeLessThan(DEFAULT_TRANSPORT_SETTINGS.firstByteSeconds);
  });
});
