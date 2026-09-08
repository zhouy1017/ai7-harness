import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE, attributionHeaders } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { AI7_FAILURE_CODES } from '../../src/service/provider/classification.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import {
  DEEPSEEK_ROUTE_PROFILE,
  DeepSeekOpenAiCompatibleAdapter,
  OPENCODE_GO_ROUTE_PROFILE,
  OPENCODE_GO_SESSION_HEADER,
  assembleProviderRequest,
  type ProviderRouteProfile,
} from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_V4_FLASH_PROFILE, type ProviderModelProfile } from '../../src/service/provider/model-profile.js';
import { normalizeModelResponse } from '../../src/service/provider/response-normalization.js';
import { OPENCODE_GO_MODEL, OPENCODE_GO_ROUTE, type TransmitTicket } from '../../src/service/provider/egress-gate.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

/**
 * The `anthropic-messages` request shape (Issue #342), driven entirely by test-local profiles. No
 * shipped profile declares this shape's read-side channels, which is the point: the shape must be
 * exercisable without activating anything, so every case here builds the profile it needs, and the
 * only transport is a stub. No socket, no credential, no Provider.
 */

installNodeNetworkDenial();

const codes = { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE };
const SYSTEM = '合成系统提示。';
const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
const PRIOR = '{"synthetic":"prior"}';
const MAX_OUTPUT_TOKENS = 32_768;
const SESSION = randomUUID();

/** A route declaring the cap this shape forces the request to name; the shipped Go route is otherwise unchanged. */
const CAPPED_ROUTE_PROFILE: ProviderRouteProfile = { ...OPENCODE_GO_ROUTE_PROFILE, maxOutputTokens: MAX_OUTPUT_TOKENS };

/** A model on that route, declaring the shape and whatever the case under test needs beside it. */
function messagesModel(capabilities: Partial<ProviderModelProfile['capabilities']> = {}): ProviderModelProfile {
  return {
    ...OPENCODE_GO_V4_FLASH_PROFILE,
    model: 'synthetic-messages-model',
    capabilities: {
      ...OPENCODE_GO_V4_FLASH_PROFILE.capabilities,
      requestShape: 'anthropic-messages',
      reasoningControl: 'none',
      structuredOutput: 'none',
      answerChannel: 'content-text-blocks',
      reasoningChannel: 'none',
      ...capabilities,
    },
  };
}

function payload(messages?: GenerateOptions['messages']): GenerateOptions {
  return {
    provider: OPENCODE_GO_ROUTE,
    model: OPENCODE_GO_MODEL,
    system: SYSTEM,
    messages: messages ?? [{ id: 'm1' as never, role: 'user', content: [{ type: 'text', text: UNIT }], source: { kind: 'user' } }],
  };
}

const context = { attribution: attributionHeaders(), promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, sessionId: SESSION };

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('assembleProviderRequest · anthropic-messages', () => {
  it('assembles the four documented fields and nothing else', () => {
    const assembly = assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel(), payload(), context);
    const body = JSON.parse(assembly.body) as Record<string, unknown>;
    expect(body).toEqual({
      model: 'synthetic-messages-model',
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM,
      messages: [{ role: 'user', content: UNIT }],
    });
    // Field by field, and the bytes themselves: canonical JSON, keys sorted, no field the reference
    // does not name. `stream` and `response_format` are chat-completions spellings and stay behind.
    expect(assembly.body).toBe(
      `{"max_tokens":${MAX_OUTPUT_TOKENS},"messages":[{"content":${JSON.stringify(UNIT)},"role":"user"}],` +
      `"model":"synthetic-messages-model","system":"${SYSTEM}"}`,
    );
    expect(assembly.body).not.toContain('stream');
    expect(assembly.body).not.toContain('response_format');
    expect(assembly.body).not.toContain('thinking');
    expect(assembly.url).toBe(CAPPED_ROUTE_PROFILE.endpoint);
    expect(assembly.method).toBe('POST');
    expect(assembly.requestDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(assembly.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
    // The route decides the headers whichever shape the model declares: the same Session header and
    // User-Agent as the chat-completions Go route, and never the credential.
    expect(assembly.headers[OPENCODE_GO_SESSION_HEADER]).toBe(SESSION);
    expect(assembly.headers).not.toHaveProperty('authorization');
  });

  it('carries the system prompt at the top level and never as a message', () => {
    const assembly = assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel(), payload(), context);
    const body = JSON.parse(assembly.body) as { system: string; messages: Array<{ role: string }> };
    expect(body.system).toBe(SYSTEM);
    expect(body.messages.map((message) => message.role)).toEqual(['user']);
    // The very difference between the two shapes, from one unchanged AssembledModelPayload: the
    // chat-completions body puts the same prompt first in the array.
    const chat = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, payload(), context);
    expect((JSON.parse(chat.body) as { messages: Array<{ role: string }> }).messages.map((message) => message.role))
      .toEqual(['system', 'user']);
    expect(chat.body).not.toContain('"system":');
  });

  it('omits the system field for a payload that carries no system prompt, and keeps the turn order', () => {
    const turns: GenerateOptions['messages'] = [
      { id: 'm1' as never, role: 'user', content: [{ type: 'text', text: UNIT }], source: { kind: 'user' } },
      { id: 'm2' as never, role: 'assistant', content: [{ type: 'text', text: PRIOR }], source: { kind: 'model', provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL } },
      { id: 'm3' as never, role: 'user', content: [{ type: 'text', text: '合成后续单元。' }], source: { kind: 'user' } },
    ];
    const assembly = assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel(), { ...payload(turns), system: '' }, context);
    const body = JSON.parse(assembly.body) as Record<string, unknown>;
    expect(body).not.toHaveProperty('system');
    expect(body.messages).toEqual([
      { role: 'user', content: UNIT },
      { role: 'assistant', content: PRIOR },
      { role: 'user', content: '合成后续单元。' },
    ]);
  });

  it('takes max_tokens from the route declaration and refuses to invent one', () => {
    const doubled = assembleProviderRequest({ ...CAPPED_ROUTE_PROFILE, maxOutputTokens: 4096 }, messagesModel(), payload(), context);
    expect((JSON.parse(doubled.body) as { max_tokens: number }).max_tokens).toBe(4096);
    // A route that declares no cap cannot serve a shape that requires one: the request refuses rather
    // than naming a per-turn bound nobody authorized.
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, messagesModel(), payload(), context))
      .toThrowError(/PROVIDER_MAX_OUTPUT_TOKENS_ABSENT/u);
  });

  it('refuses the capability spellings that belong to the other shape', () => {
    // `json-object` and `deepseek-thinking` are chat-completions fields; declaring either on this
    // shape would send the endpoint something no documentation names.
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel({ structuredOutput: 'json-object' }), payload(), context))
      .toThrowError(/PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED/u);
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel({ reasoningControl: 'deepseek-thinking' }), payload(), context))
      .toThrowError(/PROVIDER_REASONING_CONTROL_UNSUPPORTED/u);
    // The third shape is still named and still unimplemented.
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel({ requestShape: 'openai-responses' }), payload(), context))
      .toThrowError(/PROVIDER_REQUEST_SHAPE_UNSUPPORTED/u);
    // And the route bound to the model is still checked before anything is assembled.
    expect(() => assembleProviderRequest(DEEPSEEK_ROUTE_PROFILE, messagesModel(), payload(), context))
      .toThrowError(/PROVIDER_MODEL_ROUTE_MISMATCH/u);
  });

  it('leaves the chat-completions body exactly where it was', () => {
    const before = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, payload(), context);
    expect(JSON.parse(before.body)).toEqual({
      messages: [{ content: SYSTEM, role: 'system' }, { content: UNIT, role: 'user' }],
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      stream: false,
    });
  });
});

describe('normalizeModelResponse · content-text-blocks', () => {
  const model = messagesModel();
  const reasoningModel = messagesModel({ reasoningChannel: 'content-thinking-blocks' });

  it('reads the answer as the text of every text block, in order, with usage', () => {
    expect(normalizeModelResponse(model, {
      content: [{ type: 'text', text: '{"ok":' }, { type: 'text', text: 'true}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 120, output_tokens: 30 },
    })).toEqual({ kind: 'answer', text: '{"ok":true}', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    // A thinking block beside the answer is not answer text, whether or not the channel is declared.
    expect(normalizeModelResponse(reasoningModel, {
      content: [{ type: 'thinking', thinking: '合成推理' }, { type: 'text', text: '答案' }],
    })).toEqual({ kind: 'answer', text: '答案', reasoningText: null, usage: null });
    // Whitespace is an answer, exactly as it is on the other shape: only the contract may judge it.
    expect(normalizeModelResponse(model, { content: [{ type: 'text', text: ' ' }] })).toMatchObject({ kind: 'answer', text: ' ' });
  });

  it('separates an empty answer from an answer and carries whether the model reasoned', () => {
    // A content array with no text block at all.
    expect(normalizeModelResponse(reasoningModel, { content: [{ type: 'thinking', thinking: '合成推理' }], usage: { input_tokens: 11, output_tokens: 7 } }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: true, usage: { inputTokens: 11, outputTokens: 7 } });
    expect(normalizeModelResponse(reasoningModel, { content: [] })).toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // A text block that is empty hands the contract layer the same `''`, so it is the same outcome.
    expect(normalizeModelResponse(reasoningModel, { content: [{ type: 'text', text: '' }] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // Presence is read only where the channel is declared: an undeclared channel reports nothing.
    expect(normalizeModelResponse(model, { content: [{ type: 'thinking', thinking: '合成推理' }] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
  });

  it('names a response that carries no content array', () => {
    expect(normalizeModelResponse(model, { stop_reason: 'end_turn' })).toEqual({ kind: 'malformed', reason: 'content-absent' });
    expect(normalizeModelResponse(model, { content: 'not-an-array' })).toEqual({ kind: 'malformed', reason: 'content-absent' });
    expect(normalizeModelResponse(model, null)).toEqual({ kind: 'malformed', reason: 'response-not-a-record' });
    // The chat-completions body is not this shape's body, and is read as such rather than half-read.
    expect(normalizeModelResponse(model, { choices: [{ message: { content: '{"ok":true}' } }] }))
      .toEqual({ kind: 'malformed', reason: 'content-absent' });
    // Declaring no answer channel still refuses first, whichever shape the model requests.
    expect(normalizeModelResponse(messagesModel({ answerChannel: 'none' }), { content: [{ type: 'text', text: '答案' }] }))
      .toEqual({ kind: 'malformed', reason: 'answer-channel-not-declared' });
  });

  it('reads usage only when both counts are present and sound', () => {
    expect(normalizeModelResponse(model, { content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 5 } }))
      .toMatchObject({ kind: 'answer', usage: null });
    expect(normalizeModelResponse(model, { content: [{ type: 'text', text: 'x' }], usage: { input_tokens: -1, output_tokens: 2 } }))
      .toMatchObject({ kind: 'answer', usage: null });
    expect(normalizeModelResponse(model, { content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 0, output_tokens: 0 } }))
      .toMatchObject({ usage: { inputTokens: 0, outputTokens: 0 } });
  });
});

describe('DeepSeekOpenAiCompatibleAdapter · anthropic-messages', () => {
  it('streams the shape through the unchanged event contract with a stub transport', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    let ticket: TransmitTicket | null = { decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) };
    const model = messagesModel();
    const instance = new DeepSeekOpenAiCompatibleAdapter({
      broker: new CredentialBroker({ resolve: async () => 'placeholder-secret' }),
      slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Main Editorial Role', slot: 'opencode-go', credentialReference: randomUUID() },
      tickets: { take: () => { const current = ticket; ticket = null; return current; } },
      attribution: () => attributionHeaders(),
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      codes,
      profile: CAPPED_ROUTE_PROFILE,
      modelProfile: model,
      sessionId: () => SESSION,
      transport: async (url, init) => {
        calls.push({ url, body: init.body });
        return { status: 200, json: async () => ({ content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 9, output_tokens: 4 } }) };
      },
    });
    const chunks = await collect(instance.stream({ ...payload(), model: model.model }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toContain(`"max_tokens":${MAX_OUTPUT_TOKENS}`);
    expect(calls[0]!.body).not.toContain('placeholder-secret');
    // Nothing above the adapter learns the shape: the same chunks a chat-completions turn yields.
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '{"ok":true}' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '{"ok":true}' } },
      { type: 'usage', usage: { inputTokens: 9, outputTokens: 4 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]);
    expect(instance.lastCanonicalResult).toMatchObject({ kind: 'answer', text: '{"ok":true}' });
  });

  it('fails a response of this shape that matched no declared channel, exactly as the other shape does', async () => {
    let ticket: TransmitTicket | null = { decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) };
    const model = messagesModel();
    const instance = new DeepSeekOpenAiCompatibleAdapter({
      broker: new CredentialBroker({ resolve: async () => 'placeholder-secret' }),
      slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Main Editorial Role', slot: 'opencode-go', credentialReference: randomUUID() },
      tickets: { take: () => { const current = ticket; ticket = null; return current; } },
      attribution: () => attributionHeaders(),
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      codes,
      profile: CAPPED_ROUTE_PROFILE,
      modelProfile: model,
      sessionId: () => SESSION,
      transport: async () => ({ status: 200, json: async () => ({ stop_reason: 'end_turn' }) }),
    });
    const chunks = await collect(instance.stream({ ...payload(), model: model.model }));
    expect(chunks).toEqual([{
      type: 'finish',
      reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务响应不含可用内容。', status: 200 } },
    }]);
    expect(instance.lastCanonicalResult).toMatchObject({ kind: 'malformed', reason: 'content-absent' });
  });
});
