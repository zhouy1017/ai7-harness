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
  return { provider, model, ...(provider === DEEPSEEK_ROUTE ? { reasoningEffort: 'high' } : {}), system: SYSTEM, messages: [LOOP[0]!], ...overrides };
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
  it('refuses a synthetic profile with function capability disabled', () => {
    const profile = { ...OPENCODE_GO_V4_FLASH_PROFILE, capabilities: { ...OPENCODE_GO_V4_FLASH_PROFILE.capabilities, toolCalling: 'none' as const } };
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, profile, payload(OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL, { tools: tools() }), context))
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

  it('reads only offered calls, rejects duplicate ids and preserves adjacent text', () => {
    expect(normalizeModelResponse(DEEPSEEK_V4_PRO_PROFILE, TOOL_CALL_RESPONSE, offered)).toMatchObject({ kind: 'tool-calls', calls: [{ id: 'call_9' }] });
    const call = TOOL_CALL_RESPONSE.choices[0]!.message.tool_calls[0]!;
    const response = { choices: [{ message: { content: 'retained', tool_calls: [call, call, { ...call, id: 'valid' }, { ...call, id: 'bad', function: { name: 'websearch', arguments: '{bad' } }] } }] };
    expect(normalizeModelResponse(DEEPSEEK_V4_PRO_PROFILE, response, offered)).toMatchObject({ kind: 'tool-calls', text: 'retained', calls: [{ id: 'valid' }], salvaged: [{ index: 0 }, { index: 1 }, { index: 3 }] });
    expect(normalizeModelResponse(DEEPSEEK_V4_PRO_PROFILE, response)).toMatchObject({ kind: 'answer', text: 'retained', truncated: true });
  });

  it('streams admitted reasoning and calls and keeps text from unsolicited calls', async () => {
    const respond: DeepSeekTransport = async () => ({ status: 200, json: async () => TOOL_CALL_RESPONSE });
    const chunks = await collect(productionAdapter(respond).stream(payload(DEEPSEEK_ROUTE, DEEPSEEK_MODEL, { tools: tools() }) as unknown as GenerateOptions));
    expect(chunks.filter((chunk) => chunk.type === 'tool-call-delta').map((chunk) => chunk.id)).toEqual(['call_9']);
    const answered: DeepSeekTransport = async () => ({ status: 200, json: async () => ({ choices: [{ message: { content: 'retained', tool_calls: TOOL_CALL_RESPONSE.choices[0]!.message.tool_calls } }] }) });
    const answer = await collect(productionAdapter(answered).stream(payload(DEEPSEEK_ROUTE, DEEPSEEK_MODEL) as unknown as GenerateOptions));
    expect(answer).toContainEqual({ type: 'text-delta', index: 0, text: 'retained' });
    expect(answer.some((chunk) => chunk.type === 'tool-call-delta')).toBe(false);
    expect(answer.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } });
  });
});

