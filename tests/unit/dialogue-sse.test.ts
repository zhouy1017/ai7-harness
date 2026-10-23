import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { describe, expect, it } from 'vitest';
import { assembleProviderRequest, DeepSeekOpenAiCompatibleAdapter, dialogueSseEvents, OPENCODE_GO_ROUTE_PROFILE, type DeepSeekTransport } from '../../src/service/provider/deepseek-adapter.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { OPENCODE_GO_V41_FLASH_PROFILE } from '../../src/service/provider/model-profile.js';
import { buildDialogueMessage, DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST } from '../../src/service/dialogue/contract.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST, buildUnitMessage } from '../../src/service/analysis/contract.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryContractInput } from '../../src/service/review/category-configuration.js';
import { buildReviewCategoryUnitMessage, reviewCategoryContract, reviewCategoryContractDigest } from '../../src/service/review/review-category-contract.js';
import { transmitOnce } from '../../src/service/provider/live-transmission.js';
import { ProviderResultCache, isModelCallLine, providerCacheKey, providerSemanticDigest } from '../../src/service/provider/provider-result-cache.js';
import type { CoverageManifestUnitProjection } from '../../src/shared/protocol.js';

const model = OPENCODE_GO_V41_FLASH_PROFILE;
/** What the adapter at b32fb75b, before #833, sent for the synthetic baseline unit and review unit below. */
const BASELINE_BYTES_SHA256 = '00e2583afeecfb79882410ef5bbdd4eb52602e280b600d0598b16076c3405d89';
const REVIEW_BYTES_SHA256 = 'd7ebae3ad6ca7a71a8f60d77b0cfff9629536c2e9791472d37c12a366e3673d3';
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
/** The Go V4.1 adapter over a stub transport; `requestShape` only as the dialogue owner sets it. */
function adapter(transport: DeepSeekTransport, promptContractDigest: string, requestShape?: 'editorial-dialogue-sse'): DeepSeekOpenAiCompatibleAdapter {
  return new DeepSeekOpenAiCompatibleAdapter({
    broker: new CredentialBroker({ resolve: async () => 'placeholder' }),
    slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Fast Interaction Role', slot: 'opencode-go', credentialReference: 'a7c0de00-5040-4f27-9e13-6b1f2c8d4a55' },
    tickets: { take: () => ({ decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) }) },
    attribution: () => ({}), promptContractDigest, profile: OPENCODE_GO_ROUTE_PROFILE, modelProfile: model, sessionId: () => 'synthetic-session',
    codes: { QUOTA_EXCEEDED_CODE: 'QUOTA', INVALID_CREDENTIAL_CODE: 'AUTH', CONTEXT_WINDOW_EXCEEDED_CODE: 'CONTEXT' },
    transport, ...(requestShape === undefined ? {} : { requestShape }),
  });
}
const turn = (system: string, text: string): GenerateOptions => ({ provider: model.route, model: model.model, system,
  messages: [{ id: 'synthetic-message' as never, source: { kind: 'user' }, role: 'user', content: [{ type: 'text', text }] }] });

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
  it('holds the claim and records the unknown outcome when a stop ends the answer at its first event', async () => {
    // The agent loop ends the adapter's stream at whichever chunk it holds when 停止回答 aborts. The transmission's stream is
    // already reading by then, so the possibly billed request leaves its hold, its incomplete entry and its ledger line.
    const root = await mkdtemp(join(tmpdir(), 'ai7-dialogue-sse-'));
    try {
      const cache = new ProviderResultCache(root);
      await cache.open();
      const sent: Array<{ url: string; body: string }> = [];
      const instance = adapter((url, init) => transmitOnce(cache, async (target, request) => {
        sent.push({ url: target, body: request.body });
        return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(delta('完整句。'))); } }),
          { headers: { 'content-type': 'text/event-stream' } });
      }, { purpose: 'editorial-dialogue', slice: 'S17c', promptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST, taskPromptContractDigest: DIALOGUE_PROMPT_CONTRACT_DIGEST },
      { intent: { family: 'editorial-dialogue-stream', case: 'synthetic-stop', delta: null }, step: 'editorial-dialogue/ask', requestShape: 'editorial-dialogue-sse' },
      OPENCODE_GO_ROUTE_PROFILE, model.model, url, init), DIALOGUE_PROMPT_CONTRACT_DIGEST, 'editorial-dialogue-sse');
      const iterator = instance.stream(turn(DIALOGUE_PROMPT_CONTRACT.systemPrompt, buildDialogueMessage({ kind: 'ask', selection: '合成选区。', question: '合成问题？', kept: null })))[Symbol.asyncIterator]();
      expect((await iterator.next()).value).toMatchObject({ type: 'block-start' });
      await iterator.return?.(undefined);
      expect(sent).toHaveLength(1);
      const namespace = { route: model.route, endpoint: sent[0]!.url, requestShape: 'editorial-dialogue-sse', model: model.model };
      const reopened = new ProviderResultCache(root);
      await reopened.open();
      expect(await reopened.readClaim(providerCacheKey(namespace, providerSemanticDigest(sent[0]!.body)))).toMatchObject({ state: 'outcome-unknown' });
      expect(reopened.lines.filter(isModelCallLine).map((line) => [line.outcome, line.classification, line.usage])).toEqual([['failed', 'outcome-unknown', null]]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('sends baseline analysis and review requests with their pre-#833 bytes and stream:false on the SSE-capable model', async () => {
    // The real frozen contracts and message builders over synthetic blocks, through the adapter itself: an SSE-capable
    // model changes nothing for any request that is not the dialogue's. Digests pinned from the adapter at b32fb75b.
    const block = { blockId: `blk_${'d'.repeat(24)}`, kind: 'paragraph' as const, level: null, text: '合成段落。' };
    const unit = { ordinal: 1, digest: 'e'.repeat(64), blockIds: [block.blockId], overlapBlockIds: [] } as unknown as CoverageManifestUnitProjection;
    const blocks = new Map([[block.blockId, block]]);
    const review = reviewCategoryContract(reviewCategoryContractInput(BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories[0]!), 1);
    const requests = [
      { digest: BASELINE_PROMPT_CONTRACT_DIGEST, options: turn(BASELINE_PROMPT_CONTRACT.systemPrompt, buildUnitMessage(unit, 1, blocks)), pinned: BASELINE_BYTES_SHA256 },
      { digest: reviewCategoryContractDigest(review), options: turn(review.systemPrompt, buildReviewCategoryUnitMessage(review, unit, 1, blocks)), pinned: REVIEW_BYTES_SHA256 },
    ];
    for (const request of requests) {
      const sent: Array<{ headers: Record<string, string>; body: string }> = [];
      const instance = adapter(async (_url, init) => {
        sent.push({ headers: init.headers, body: init.body });
        return { status: 200, json: async () => ({ model: model.model, choices: [{ message: { content: '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 4 } }) };
      }, request.digest);
      const chunks: StreamChunk[] = [];
      for await (const chunk of instance.stream(request.options)) chunks.push(chunk);
      expect(chunks.map((chunk) => chunk.type)).toEqual(['block-start', 'text-delta', 'block-end', 'usage', 'finish']);
      expect(sent).toHaveLength(1);
      expect(sha256Hex(sent[0]!.body)).toBe(request.pinned);
      expect(JSON.parse(sent[0]!.body)).toMatchObject({ stream: false });
      expect(sent[0]!.body).not.toContain('stream_options');
      expect(sent[0]!.headers.accept).toBe('application/json');
    }
  });
});
