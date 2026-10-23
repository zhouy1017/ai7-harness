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
import { OPENCODE_GO_V4_FLASH_PROFILE, PROVIDER_MODEL_PROFILES, type ProviderModelProfile } from '../../src/service/provider/model-profile.js';
import type { AssembledMessage, AssembledModelPayload } from '../../src/service/provider/payload.js';
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

const FUNCTION_TOOLS = [
  { name: 'lookup', description: 'Look up synthetic data', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
  { name: 'summarize', description: 'Summarize synthetic data', parameters: { type: 'object', properties: {} } },
];
const functionModel = (): ProviderModelProfile => messagesModel({ toolCalling: 'function' });
const offered = { toolCallsOffered: true, offeredToolNames: FUNCTION_TOOLS.map((tool) => tool.name) };
const toolUse = (id = 'call_1', name = 'lookup', input: unknown = { query: 'synthetic' }) => ({ type: 'tool_use', id, name, input });
const toolResponse = (content: unknown[] = [toolUse()]) => ({ content, stop_reason: 'tool_use', usage: { input_tokens: 9, output_tokens: 4 } });

function toolPayload(messages: ReadonlyArray<AssembledMessage> = payload().messages): AssembledModelPayload {
  return { ...payload(), model: functionModel().model, messages, tools: FUNCTION_TOOLS };
}

function callMessage(content: AssembledMessage['content'] = [{ type: 'tool-call', id: 'call_1', name: 'lookup', arguments: '{"query":"synthetic"}' }]): AssembledMessage {
  return { role: 'assistant', source: { kind: 'model', provider: OPENCODE_GO_ROUTE, model: functionModel().model }, content };
}

function resultMessage(callId = 'call_1', isError = false): AssembledMessage {
  return { role: 'user', source: { kind: 'tool', callId }, content: [{ type: 'tool-result', toolCallId: callId, isError, content: [{ type: 'text', text: 'synthetic result' }] }] };
}

function stubToolsAdapter(responses: unknown[], model = functionModel()) {
  const bodies: string[] = [];
  const adapter = new DeepSeekOpenAiCompatibleAdapter({
    broker: new CredentialBroker({ resolve: async () => 'placeholder-secret' }),
    slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Main Editorial Role', slot: 'opencode-go', credentialReference: randomUUID() },
    tickets: { take: () => ({ decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) }) },
    attribution: () => attributionHeaders(), promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
    codes, profile: CAPPED_ROUTE_PROFILE, modelProfile: model, sessionId: () => SESSION,
    transport: async (_url, init) => {
      bodies.push(init.body);
      return { status: 200, json: async () => responses[bodies.length - 1] };
    },
  });
  return { adapter, bodies };
}

describe('Messages buffered client functions · synthetic profiles only', () => {
  it('maps canonical function declarations without changing text-only request bytes', () => {
    const body = JSON.parse(assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), toolPayload(), context).body) as Record<string, unknown>;
    expect(body.tools).toEqual(FUNCTION_TOOLS.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })));
    for (const extra of [{}, { tools: [] }]) {
      expect(assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), { ...payload(), ...extra }, context).body)
        .toBe(assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel(), payload(), context).body);
    }
    const shipped = Object.values(PROVIDER_MODEL_PROFILES).filter((profile) => profile.capabilities.requestShape === 'anthropic-messages');
    expect(shipped.length).toBeGreaterThan(0);
    expect(shipped.every((profile) => profile.capabilities.toolCalling === 'none')).toBe(true);
  });

  it.each([
    { name: '' }, { name: 'not.a.client.name' }, { description: undefined }, { parameters: null },
    { type: 'web_search_20250305' }, { toolset_name: 'computer' },
  ])('refuses invalid or native tool declarations %j', (fields) => {
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), {
      ...toolPayload(), tools: [{ ...FUNCTION_TOOLS[0], ...fields }],
    }, context)).toThrow('PROVIDER_TOOL_SCHEMA_INVALID');
  });

  it('refuses duplicate declarations and preserves nested object inputs and prefix text in history', () => {
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), {
      ...toolPayload(), tools: [FUNCTION_TOOLS[0], FUNCTION_TOOLS[0]],
    }, context)).toThrow('PROVIDER_TOOL_SCHEMA_INVALID');
    const input = { nested: { values: [null, true, 0, 'synthetic'] } };
    const response = normalizeModelResponse(functionModel(), toolResponse([toolUse('call_1', 'lookup', input)]), offered);
    expect(response.kind).toBe('tool-calls');
    if (response.kind !== 'tool-calls') throw new Error('Expected synthetic client calls');
    expect(JSON.parse(response.calls[0]!.arguments)).toEqual(input);
    const history = [callMessage([
      { type: 'text', text: 'first' }, { type: 'text', text: 'second' },
      { type: 'tool-call', id: 'call_1', name: 'lookup', arguments: response.calls[0]!.arguments },
    ]), resultMessage()];
    const body = JSON.parse(assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), toolPayload(history), context).body) as { messages: unknown[] };
    expect(body.messages[0]).toEqual({ role: 'assistant', content: [
      { type: 'text', text: 'first' }, { type: 'text', text: 'second' }, toolUse('call_1', 'lookup', input),
    ] });
  });

  it('reads a complete batch in order with object arguments, leading text and usage', () => {
    expect(normalizeModelResponse(functionModel(), toolResponse([
      { type: 'text', text: 'first ' }, { type: 'text', text: 'second' }, toolUse(), toolUse('call_2', 'summarize', {}),
    ]), offered)).toEqual({
      kind: 'tool-calls', text: 'first second', reasoningText: null,
      calls: [{ id: 'call_1', name: 'lookup', arguments: '{"query":"synthetic"}' }, { id: 'call_2', name: 'summarize', arguments: '{}' }],
      usage: { inputTokens: 9, outputTokens: 4 },
    });
  });

  it('serializes correlated results in the immediately following user message', () => {
    const history = [payload().messages[0]!, callMessage(), resultMessage('call_1', true)];
    const body = JSON.parse(assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), toolPayload(history), context).body) as { messages: unknown[] };
    expect(body.messages.slice(1)).toEqual([
      { role: 'assistant', content: [toolUse()] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'synthetic result', is_error: true }] },
    ]);
  });

  it('groups a complete parallel batch and preserves canonical result order and error flags', async () => {
    const { adapter, bodies } = stubToolsAdapter([toolResponse([toolUse(), toolUse('call_2', 'summarize', {})]), {
      content: [{ type: 'text', text: 'finished' }], stop_reason: 'end_turn',
    }]);
    const first = await collect(adapter.stream(toolPayload() as unknown as GenerateOptions));
    expect(first.filter((chunk) => chunk.type === 'tool-call-delta').map((chunk) => chunk.id)).toEqual(['call_1', 'call_2']);
    const blocks = first.flatMap((chunk) => chunk.type === 'block-end' ? [chunk.block] : []);
    const history = [payload().messages[0]!, callMessage(blocks), resultMessage('call_2', true), resultMessage(), payload().messages[0]!];
    expect((await collect(adapter.stream(toolPayload(history) as unknown as GenerateOptions))).at(-1))
      .toEqual({ type: 'finish', reason: { kind: 'stop' } });
    expect((JSON.parse(bodies[1]!) as { messages: unknown[] }).messages.slice(1)).toEqual([
      { role: 'assistant', content: [toolUse(), toolUse('call_2', 'summarize', {})] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'call_2', content: 'synthetic result', is_error: true },
        { type: 'tool_result', tool_use_id: 'call_1', content: 'synthetic result', is_error: false },
      ] },
      { role: 'user', content: UNIT },
    ]);
  });

  it.each([
    { id: '' }, { id: 1 }, { id: undefined }, { name: '' }, { name: 'unoffered' }, { name: undefined },
    { input: null }, { input: [] }, { input: 'not an object' }, { input: '{bad JSON' }, { input: 3 }, { input: undefined },
    { toolset_name: 'computer' }, { caller: { type: 'code_execution_20250825' } },
  ])('refuses an entire batch for malformed or unsupported tool fields %j', async (fields) => {
    const body = toolResponse([{ type: 'text', text: 'prefix' }, toolUse('valid'), { ...toolUse(), ...fields }]);
    expect(normalizeModelResponse(functionModel(), body, offered)).toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    const { adapter } = stubToolsAdapter([body]);
    const chunks = await collect(adapter.stream(toolPayload() as unknown as GenerateOptions));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE } } });
  });

  it.each(['max_tokens', 'end_turn', 'stop_sequence', 'pause_turn', 'refusal', null, undefined])
    ('refuses tool blocks with inconsistent or incomplete stop_reason %j', (stop_reason) => {
      expect(normalizeModelResponse(functionModel(), { ...toolResponse(), stop_reason }, offered))
        .toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    });

  it('refuses opaque content and unfinished final turns while client tools are offered', () => {
    for (const body of [
      { content: [{ type: 'text', text: 'prefix' }, { type: 'thinking', thinking: 'opaque' }], stop_reason: 'end_turn' },
      { content: [{ type: 'text', text: 'prefix' }, { type: 'server_tool_use', id: 'server_1', name: 'web_search', input: {} }], stop_reason: 'pause_turn' },
      { content: [{ type: 'text', text: 'partial' }], stop_reason: 'max_tokens' },
      { content: [{ type: 'text', text: 'partial' }], stop_reason: null },
    ]) {
      expect(normalizeModelResponse(functionModel(), body, offered)).toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    }
  });

  it.each([
    [], [{ type: 'text', text: 'no call' }], [toolUse(), toolUse()],
    [toolUse(), { type: 'text', text: 'after' }], [toolUse(), { type: 'text', text: '' }, toolUse('call_2')],
    [{ type: 'thinking', thinking: 'opaque', signature: 'synthetic' }, toolUse()],
    [{ type: 'redacted_thinking', data: 'opaque' }, toolUse()],
    [{ type: 'server_tool_use', id: 'server_1', name: 'web_search', input: {} }, toolUse()],
    [{ type: 'web_search_tool_result', tool_use_id: 'server_1', content: [] }, toolUse()],
    [{ type: 'text', text: 'prefix', citations: [{ type: 'opaque' }] }, toolUse()],
    [{ type: 'text', text: 1 }, toolUse()], [null, toolUse()],
  ])('refuses unrepresentable, empty or duplicate batches %j', (...content) => {
    expect(normalizeModelResponse(functionModel(), toolResponse(content), offered)).toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
  });

  it('requires both offered tools and explicit function capability for reading and writing calls', async () => {
    for (const [model, options] of [[messagesModel(), offered], [functionModel(), {}], [functionModel(), { toolCallsOffered: true }]] as const) {
      expect(normalizeModelResponse(model, toolResponse([{ type: 'text', text: 'prefix' }, toolUse()]), options))
        .toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    }
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel(), toolPayload(), context)).toThrow('PROVIDER_TOOL_CALLING_UNSUPPORTED');
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), { ...toolPayload([callMessage(), resultMessage()]), tools: [] }, context))
      .toThrow('PROVIDER_TOOL_CALLING_UNSUPPORTED');
    const { adapter, bodies } = stubToolsAdapter([toolResponse()], messagesModel());
    const chunks = await collect(adapter.stream(toolPayload() as unknown as GenerateOptions));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: 'finish', reason: { kind: 'error' } });
    expect(bodies).toHaveLength(0);
  });

  it('refuses missing, duplicate, orphaned and interrupted result correlations before transport', async () => {
    const twoCalls = callMessage([
      ...callMessage().content, { type: 'tool-call', id: 'call_2', name: 'summarize', arguments: '{}' },
    ]);
    const invalid: AssembledMessage[][] = [
      [resultMessage()], [callMessage()], [callMessage(), resultMessage('orphan')],
      [callMessage(), resultMessage(), resultMessage()],
      [twoCalls, resultMessage()], [twoCalls, resultMessage(), resultMessage()],
      [twoCalls, resultMessage(), payload().messages[0]!, resultMessage('call_2')],
      [callMessage(), payload().messages[0]!, resultMessage()],
      [callMessage(), callMessage(), resultMessage()],
      [callMessage(), resultMessage(), callMessage(), resultMessage()],
      [callMessage(), { ...resultMessage(), source: { kind: 'tool', callId: 'wrong' } }],
      [callMessage(), { ...resultMessage(), content: [...resultMessage().content, { type: 'text', text: 'extra' }] }],
      [callMessage(), { ...resultMessage(), content: [{ type: 'tool-result', toolCallId: 'call_1', content: [{ type: 'image' }] }] }],
    ];
    for (const messages of invalid) {
      const { adapter, bodies } = stubToolsAdapter([]);
      const chunks = await collect(adapter.stream(toolPayload(messages) as unknown as GenerateOptions));
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE } } });
      expect(bodies).toHaveLength(0);
    }
  });

  it.each([
    [{ type: 'tool-call', id: 'call_1', name: 'lookup', arguments: 'not JSON' }],
    [{ type: 'tool-call', id: 'call_1', name: 'lookup', arguments: '[]' }],
    [{ type: 'tool-call', id: 'call_1', name: 'lookup', arguments: 'null' }],
    [{ type: 'tool-call', id: 'call_1', name: 'unoffered', arguments: '{}' }],
    [...callMessage().content, ...callMessage().content],
    [...callMessage().content, { type: 'text', text: 'after' }],
    [{ type: 'reasoning', text: '' }, ...callMessage().content],
    [{ type: 'image' }, ...callMessage().content],
  ] satisfies AssembledMessage['content'][])('refuses unrepresentable assistant history %j', (...content) => {
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), toolPayload([callMessage(content), resultMessage()]), context)).toThrow();
  });

  it('completes a buffered call/result/final-answer round trip through DSH events', async () => {
    const { adapter, bodies } = stubToolsAdapter([toolResponse([{ type: 'text', text: 'checking' }, toolUse()]), {
      content: [{ type: 'text', text: 'finished' }], stop_reason: 'end_turn', usage: { input_tokens: 15, output_tokens: 2 },
    }]);
    const first = await collect(adapter.stream(toolPayload() as unknown as GenerateOptions));
    expect(first.filter((chunk) => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'text', text: 'checking' } },
      { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call_1', name: 'lookup', arguments: '{"query":"synthetic"}' } },
    ]);
    expect(first.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } });
    expect(first).toContainEqual({ type: 'usage', usage: { inputTokens: 9, outputTokens: 4 } });
    const blocks = first.flatMap((chunk) => chunk.type === 'block-end' ? [chunk.block] : []);
    const continued = toolPayload([payload().messages[0]!, callMessage(blocks), resultMessage()]);
    const second = await collect(adapter.stream(continued as unknown as GenerateOptions));
    expect(second).toContainEqual({ type: 'text-delta', index: 0, text: 'finished' });
    expect(second.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } });
    expect(adapter.lastUsage).toEqual({ inputTokens: 15, outputTokens: 2 });
    expect(bodies).toHaveLength(2);
    expect((JSON.parse(bodies[1]!) as { messages: unknown[] }).messages.at(-1)).toEqual({
      role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'synthetic result', is_error: false }],
    });
  });
});

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
    // Every named shape is implemented as of S54c, and a shape none of them names still refuses.
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel({ requestShape: 'a-shape-nobody-declared' as ProviderModelProfile['capabilities']['requestShape'] }), payload(), context))
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
