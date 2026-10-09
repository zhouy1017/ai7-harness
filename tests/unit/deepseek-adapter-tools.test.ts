import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { AI7_FAILURE_CODES } from '../../src/service/provider/classification.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import {
  DEEPSEEK_ROUTE_PROFILE,
  DeepSeekOpenAiCompatibleAdapter,
  PROVIDER_ROUTE_PROFILES,
  OPENCODE_GO_ROUTE_PROFILE,
  assembleProviderRequest,
  parseProviderResponse,
  type DeepSeekTransport,
} from '../../src/service/provider/deepseek-adapter.js';
import { DEEPSEEK_MODEL, DEEPSEEK_ROUTE, OPENCODE_GO_MODEL, OPENCODE_GO_ROUTE } from '../../src/service/provider/egress-gate.js';
import { DEEPSEEK_V4_PRO_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, PROVIDER_MODEL_PROFILES } from '../../src/service/provider/model-profile.js';
import type { AssembledModelPayload } from '../../src/service/provider/payload.js';
import { PLATFORM_TOOL_SCHEMAS } from '../../src/service/provider/platform-tools.js';
import { normalizeModelResponse } from '../../src/service/provider/response-normalization.js';

// The adapter's tool plumbing (Issue #473, S87-f3a), exercised only by stub transports. The developer-live model,
// `opencode-go/deepseek-v4-flash`, declares `toolCalling: 'none'` until the live evidence item of ADR 0080 §7.7 runs, so it
// refuses to assemble a payload that carries tools; a payload without tools assembles byte for byte as before.

const codes = { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE };
const SYSTEM = '合成系统提示。';
const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
const PRODUCTION_REQUEST_BODY = `{"messages":[{"content":"${SYSTEM}","role":"system"},{"content":${JSON.stringify(UNIT)},"role":"user"}],"model":"deepseek-v4-pro","reasoning_effort":"high","stream":false,"thinking":{"type":"enabled"}}`;
const OPENCODE_GO_REQUEST_BODY = `{"messages":[{"content":"${SYSTEM}","role":"system"},{"content":${JSON.stringify(UNIT)},"role":"user"}],"model":"deepseek-v4-flash","response_format":{"type":"json_object"},"stream":false}`;
const context = { attribution: {}, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, sessionId: randomUUID() };
const tools = (): unknown[] => PLATFORM_TOOL_SCHEMAS.map((tool) => JSON.parse(JSON.stringify(tool)) as unknown);

const LOOP: AssembledModelPayload['messages'] = [
  { role: 'user', content: [{ type: 'text', text: UNIT }], source: { kind: 'user' } },
  { role: 'assistant', content: [{ type: 'tool-call', id: 'call_1', name: 'websearch', arguments: '{"query":"q"}' }], source: { kind: 'model', provider: DEEPSEEK_ROUTE, model: DEEPSEEK_MODEL } },
  { role: 'user', content: [{ type: 'tool-result', toolCallId: 'call_1', content: [{ type: 'text', text: '结果' }] }], source: { kind: 'tool', callId: 'call_1' } },
];

function payload(provider: string, model: string, overrides: Partial<AssembledModelPayload> = {}): AssembledModelPayload {
  return { provider, model, system: SYSTEM, messages: [LOOP[0]!], ...overrides };
}

const TOOL_CALL_RESPONSE = {
  choices: [{ message: { content: null, reasoning_content: '想一想', tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'websearch', arguments: '{"query":"狂人日记"}' } }] } }],
  usage: { prompt_tokens: 10, completion_tokens: 3 },
};

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

function productionAdapter(transport: DeepSeekTransport): DeepSeekOpenAiCompatibleAdapter {
  let ticket: { decision: 'transmit-remote'; bindingDigest: string; payloadDigest: string } | null = { decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) };
  return new DeepSeekOpenAiCompatibleAdapter({
    broker: new CredentialBroker({ resolve: async () => 'placeholder' }),
    slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Main Editorial Role', slot: 'deepseek-api-key', credentialReference: randomUUID() },
    tickets: { take: () => { const current = ticket; ticket = null; return current; } },
    attribution: () => ({}),
    promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
    codes,
    transport,
  });
}

describe('request assembly with tools', () => {
  it('refuses tools for every model that does not declare function calling, the developer-live model included', () => {
    expect(OPENCODE_GO_V4_FLASH_PROFILE.capabilities.toolCalling).toBe('none');
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, payload(OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL, { tools: tools() }), context))
      .toThrowError('PROVIDER_TOOL_CALLING_UNSUPPORTED');
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, payload(OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL, { messages: LOOP }), context))
      .toThrowError('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    // A shape other than chat completions spells no function tool, whatever its model declares.
    const messagesModel = Object.values(PROVIDER_MODEL_PROFILES).find((profile) => profile.route === 'opencode-go-messages')!;
    expect(() => assembleProviderRequest(PROVIDER_ROUTE_PROFILES['opencode-go-messages'], messagesModel, payload(messagesModel.route, messagesModel.model, { tools: tools() }), context))
      .toThrowError('PROVIDER_TOOL_CALLING_UNSUPPORTED');
  });

  it('assembles a payload without tools byte for byte as before, an empty tool list included', () => {
    for (const extra of [{}, { tools: [] }]) {
      expect(assembleProviderRequest(DEEPSEEK_ROUTE_PROFILE, DEEPSEEK_V4_PRO_PROFILE, payload(DEEPSEEK_ROUTE, DEEPSEEK_MODEL, extra), context).body).toBe(PRODUCTION_REQUEST_BODY);
      expect(assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, payload(OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL, extra), context).body).toBe(OPENCODE_GO_REQUEST_BODY);
    }
  });

  it('spells tools, tool calls, and tool results the chat-completions way for a function-calling model', () => {
    expect(DEEPSEEK_V4_PRO_PROFILE.capabilities.toolCalling).toBe('function');
    const body = JSON.parse(assembleProviderRequest(DEEPSEEK_ROUTE_PROFILE, DEEPSEEK_V4_PRO_PROFILE, payload(DEEPSEEK_ROUTE, DEEPSEEK_MODEL, { tools: tools(), messages: LOOP }), context).body) as Record<string, unknown>;
    expect(body.tools).toEqual(PLATFORM_TOOL_SCHEMAS.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })));
    expect(body.messages).toEqual([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: UNIT },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'websearch', arguments: '{"query":"q"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: '结果' },
    ]);
    // Reasoning the model wrote beside its calls travels back with them.
    const withReasoning = LOOP.map((message, index) => index === 1 ? { ...message, content: [{ type: 'reasoning', text: '先想' }, ...message.content] } : message);
    const reasoned = JSON.parse(assembleProviderRequest(DEEPSEEK_ROUTE_PROFILE, DEEPSEEK_V4_PRO_PROFILE, payload(DEEPSEEK_ROUTE, DEEPSEEK_MODEL, { tools: tools(), messages: withReasoning }), context).body) as { messages: unknown[] };
    expect(reasoned.messages[2]).toEqual({ role: 'assistant', content: null, reasoning_content: '先想', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'websearch', arguments: '{"query":"q"}' } }] });
  });
});

describe('reading a request for tools', () => {
  const offered = { toolCallsOffered: true };

  it('reads tool_calls only when the request offered tools to a function-calling model', () => {
    expect(normalizeModelResponse(DEEPSEEK_V4_PRO_PROFILE, TOOL_CALL_RESPONSE, offered)).toEqual({
      kind: 'tool-calls', text: '', calls: [{ id: 'call_9', name: 'websearch', arguments: '{"query":"狂人日记"}' }], reasoningText: '想一想',
      usage: { inputTokens: 10, outputTokens: 3 },
    });
    // To a request that offered none, and for every other model, the field is not a channel: the response reads as before.
    expect(normalizeModelResponse(DEEPSEEK_V4_PRO_PROFILE, TOOL_CALL_RESPONSE)).toEqual({ kind: 'malformed', reason: 'answer-channel-absent' });
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, TOOL_CALL_RESPONSE, offered)).toEqual({ kind: 'malformed', reason: 'answer-channel-absent' });
    const answered = { choices: [{ message: { content: '{"ok":true}', tool_calls: TOOL_CALL_RESPONSE.choices[0]!.message.tool_calls } }] };
    expect(normalizeModelResponse(DEEPSEEK_V4_PRO_PROFILE, answered)).toEqual({ kind: 'answer', text: '{"ok":true}', reasoningText: null, usage: null });
    const broken = { choices: [{ message: { content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'websearch' } }] } }] };
    expect(normalizeModelResponse(DEEPSEEK_V4_PRO_PROFILE, broken, offered)).toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    const call = TOOL_CALL_RESPONSE.choices[0]!.message.tool_calls[0]!;
    const twice = { choices: [{ message: { content: null, tool_calls: [call, { ...call, function: { name: 'webfetch', arguments: '{}' } }] } }] };
    expect(normalizeModelResponse(DEEPSEEK_V4_PRO_PROFILE, twice, offered)).toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    expect(parseProviderResponse(200, TOOL_CALL_RESPONSE, codes, DEEPSEEK_ROUTE_PROFILE, DEEPSEEK_V4_PRO_PROFILE, offered)).toMatchObject({ kind: 'tool-calls' });
    expect(parseProviderResponse(200, TOOL_CALL_RESPONSE, codes, DEEPSEEK_ROUTE_PROFILE, DEEPSEEK_V4_PRO_PROFILE)).toMatchObject({ kind: 'malformed' });
  });

  it('streams the reasoning and the calls as assembled blocks only to a request that offered tools', async () => {
    const respond: DeepSeekTransport = async () => ({ status: 200, json: async () => TOOL_CALL_RESPONSE });
    const offeredRequest = payload(DEEPSEEK_ROUTE, DEEPSEEK_MODEL, { tools: tools() }) as unknown as GenerateOptions;
    const chunks = await collect(productionAdapter(respond).stream(offeredRequest));
    expect(chunks.filter((chunk) => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '想一想' } },
      { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call_9', name: 'websearch', arguments: '{"query":"狂人日记"}' } },
    ]);
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } });
    // The same response to a request that offered none reads as it always did: no usable content.
    const plain = await collect(productionAdapter(respond).stream(payload(DEEPSEEK_ROUTE, DEEPSEEK_MODEL) as unknown as GenerateOptions));
    expect(plain).toEqual([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务响应不含可用内容。', status: 200 } } }]);
    // And one carrying an answer beside calls is that answer, exactly as before.
    const answered: DeepSeekTransport = async () => ({ status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}', tool_calls: TOOL_CALL_RESPONSE.choices[0]!.message.tool_calls } }] }) });
    const answer = await collect(productionAdapter(answered).stream(payload(DEEPSEEK_ROUTE, DEEPSEEK_MODEL) as unknown as GenerateOptions));
    expect(answer.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } });
    expect(answer.find((chunk) => chunk.type === 'block-end')).toEqual({ type: 'block-end', index: 0, block: { type: 'text', text: '{"ok":true}' } });
  });
});

