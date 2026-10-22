import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
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
  type DeepSeekTransport,
  type ProviderRouteProfile,
} from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_V4_FLASH_PROFILE, type ProviderModelProfile } from '../../src/service/provider/model-profile.js';
import { normalizeModelResponse } from '../../src/service/provider/response-normalization.js';
import { OPENCODE_GO_MODEL, OPENCODE_GO_ROUTE, type TransmitTicket } from '../../src/service/provider/egress-gate.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

/**
 * The `openai-responses` request shape (Issue #354), driven entirely by test-local profiles. No
 * shipped profile declares this shape's read-side channels, which is the point: the shape must be
 * exercisable without activating anything, so every case here builds the profile it needs, and the
 * only transport is a stub. No socket, no credential, no Provider.
 */

installNodeNetworkDenial();

const codes = { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE };
const SYSTEM = '合成系统提示。';
const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
const PRIOR = '{"synthetic":"prior"}';
const MAX_OUTPUT_TOKENS = 4096;
const SESSION = randomUUID();

/**
 * The cap is optional on this shape, so the two route profiles below are the whole of what the
 * declaration decides: one route declaring a number, one declaring `null`. Both are the shipped Go
 * route otherwise, because nothing else about reaching a model differs between the shapes.
 */
const CAPPED_ROUTE_PROFILE: ProviderRouteProfile = { ...OPENCODE_GO_ROUTE_PROFILE, maxOutputTokens: MAX_OUTPUT_TOKENS };
const UNCAPPED_ROUTE_PROFILE: ProviderRouteProfile = OPENCODE_GO_ROUTE_PROFILE;

/** A model declaring the third shape and whatever the case under test needs beside it. */
function responsesModel(capabilities: Partial<ProviderModelProfile['capabilities']> = {}): ProviderModelProfile {
  return {
    ...OPENCODE_GO_V4_FLASH_PROFILE,
    model: 'synthetic-responses-model',
    capabilities: {
      ...OPENCODE_GO_V4_FLASH_PROFILE.capabilities,
      requestShape: 'openai-responses',
      reasoningControl: 'none',
      structuredOutput: 'none',
      toolCalling: 'none',
      answerChannel: 'output-message-text',
      reasoningChannel: 'none',
      ...capabilities,
    },
  };
}

/** One `message` item of the shape's `output`, carrying whichever parts the case is about. */
function message(...parts: ReadonlyArray<unknown>): Record<string, unknown> {
  return { type: 'message', status: 'completed', role: 'assistant', content: parts };
}

const outputText = (text: string) => ({ type: 'output_text', text, annotations: [] });
const REASONING_ITEM = { type: 'reasoning', summary: [{ type: 'summary_text', text: '合成推理' }] };
const TOOL = { name: 'synthetic_lookup', description: 'Synthetic lookup', parameters: { type: 'object', properties: { query: { type: 'string' } } } };
const functionCall = (callId = 'call_raw_1', args = '{ "query": "synthetic" }') =>
  ({ type: 'function_call', id: `item_${callId}`, call_id: callId, name: TOOL.name, arguments: args });
const functionModel = () => responsesModel({ toolCalling: 'function' });
const toolPayload = (): GenerateOptions => ({ ...payload(), model: functionModel().model, tools: [TOOL] });

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

describe('assembleProviderRequest · openai-responses', () => {
  it('sends flat non-strict functions and preserves tool-free bytes for absent and empty tools', () => {
    const plain = assembleProviderRequest(CAPPED_ROUTE_PROFILE, responsesModel(), payload(), context);
    for (const model of [responsesModel(), functionModel()]) {
      for (const input of [payload(), { ...payload(), tools: [] }]) {
        const assembled = assembleProviderRequest(CAPPED_ROUTE_PROFILE, model, input, context);
        expect(assembled.body).toBe(plain.body);
        expect(assembled.requestDigest).toBe(plain.requestDigest);
      }
    }
    const assembled = assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), toolPayload(), context);
    expect(JSON.parse(assembled.body)).toEqual({ ...JSON.parse(plain.body), tools: [{ type: 'function', ...TOOL, strict: false }] });
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, responsesModel({ toolCalling: 'none' }), toolPayload(), context))
      .toThrowError('PROVIDER_TOOL_CALLING_UNSUPPORTED');
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), { ...toolPayload(), tools: [{ ...TOOL, parameters: null } as never] }, context))
      .toThrowError('PROVIDER_TOOL_SCHEMA_INVALID');
  });

  it('refuses reasoning-bearing call history, even an empty reasoning block', () => {
    for (const text of ['', 'synthetic reasoning']) {
      const history: GenerateOptions['messages'] = [{
        id: 'history' as never, role: 'assistant', source: { kind: 'model', provider: OPENCODE_GO_ROUTE, model: functionModel().model },
        content: [{ type: 'reasoning', text }, { type: 'tool-call', id: 'call_raw_1' as never, name: TOOL.name, arguments: '{}' }],
      }];
      expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, functionModel(), { ...toolPayload(), messages: history }, context))
        .toThrowError('PROVIDER_REASONING_CONTINUATION_UNSUPPORTED');
    }
  });

  it('assembles the three documented fields and nothing else', () => {
    const assembly = assembleProviderRequest(UNCAPPED_ROUTE_PROFILE, responsesModel(), payload(), context);
    const body = JSON.parse(assembly.body) as Record<string, unknown>;
    expect(body).toEqual({
      model: 'synthetic-responses-model',
      instructions: SYSTEM,
      input: [{ role: 'user', content: UNIT }],
    });
    // Field by field, and the bytes themselves: canonical JSON, keys sorted, no field the contract
    // does not name. `store`, `stream`, `text`, and `reasoning` are all fields this shape has and
    // this request has no authority to send, so none of them travels.
    expect(assembly.body).toBe(
      `{"input":[{"content":${JSON.stringify(UNIT)},"role":"user"}],"instructions":"${SYSTEM}",` +
      `"model":"synthetic-responses-model"}`,
    );
    for (const field of ['store', 'stream', 'text', 'reasoning', 'previous_response_id', 'max_output_tokens', 'max_tokens', 'response_format']) {
      expect(assembly.body, field).not.toContain(field);
    }
    expect(assembly.url).toBe(UNCAPPED_ROUTE_PROFILE.endpoint);
    expect(assembly.method).toBe('POST');
    expect(assembly.requestDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(assembly.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
    // The route decides the headers whichever shape the model declares, and never the credential.
    expect(assembly.headers[OPENCODE_GO_SESSION_HEADER]).toBe(SESSION);
    expect(assembly.headers).not.toHaveProperty('authorization');
  });

  it('sends max_output_tokens only where the route declares one', () => {
    const capped = assembleProviderRequest(CAPPED_ROUTE_PROFILE, responsesModel(), payload(), context);
    expect(JSON.parse(capped.body)).toEqual({
      model: 'synthetic-responses-model',
      instructions: SYSTEM,
      input: [{ role: 'user', content: UNIT }],
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });
    expect(capped.body).toBe(
      `{"input":[{"content":${JSON.stringify(UNIT)},"role":"user"}],"instructions":"${SYSTEM}",` +
      `"max_output_tokens":${MAX_OUTPUT_TOKENS},"model":"synthetic-responses-model"}`,
    );
    expect(JSON.parse(assembleProviderRequest({ ...CAPPED_ROUTE_PROFILE, maxOutputTokens: 32_768 }, responsesModel(), payload(), context).body))
      .toMatchObject({ max_output_tokens: 32_768 });
    // The cap is optional on this shape, so a route that declares none assembles rather than
    // refusing the way the shape before it does — and the whole difference is the one field.
    const uncapped = assembleProviderRequest(UNCAPPED_ROUTE_PROFILE, responsesModel(), payload(), context);
    expect(JSON.parse(capped.body)).toEqual({ ...JSON.parse(uncapped.body) as Record<string, unknown>, max_output_tokens: MAX_OUTPUT_TOKENS });
    expect(uncapped.body).not.toContain('max_output_tokens');
    expect(uncapped.requestDigest).not.toBe(capped.requestDigest);
  });

  it('carries the system prompt as instructions and never as an input item', () => {
    const assembly = assembleProviderRequest(CAPPED_ROUTE_PROFILE, responsesModel(), payload(), context);
    const body = JSON.parse(assembly.body) as { instructions: string; input: Array<{ role: string }> };
    expect(body.instructions).toBe(SYSTEM);
    expect(body.input.map((item) => item.role)).toEqual(['user']);
    // The third spelling of the one thing the payload carries, from one unchanged
    // AssembledModelPayload: chat completions puts the prompt first in its array, and this shape
    // beside it under a name of its own.
    const chat = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, payload(), context);
    expect((JSON.parse(chat.body) as { messages: Array<{ role: string }> }).messages.map((item) => item.role))
      .toEqual(['system', 'user']);
    expect(chat.body).not.toContain('"instructions":');
  });

  it('omits instructions for a payload that carries no system prompt, and keeps the turn order', () => {
    const turns: GenerateOptions['messages'] = [
      { id: 'm1' as never, role: 'user', content: [{ type: 'text', text: UNIT }], source: { kind: 'user' } },
      { id: 'm2' as never, role: 'assistant', content: [{ type: 'text', text: PRIOR }], source: { kind: 'model', provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL } },
      { id: 'm3' as never, role: 'user', content: [{ type: 'text', text: '合成后续单元。' }], source: { kind: 'user' } },
    ];
    const assembly = assembleProviderRequest(CAPPED_ROUTE_PROFILE, responsesModel(), { ...payload(turns), system: '' }, context);
    const body = JSON.parse(assembly.body) as Record<string, unknown>;
    expect(body).not.toHaveProperty('instructions');
    expect(body.input).toEqual([
      { role: 'user', content: UNIT },
      { role: 'assistant', content: PRIOR },
      { role: 'user', content: '合成后续单元。' },
    ]);
  });

  it('refuses the capability spellings that belong to another shape', () => {
    // `json-object` and `deepseek-thinking` are chat-completions fields. This shape has mechanisms
    // of its own for both — `text.format` and `reasoning.effort` — and neither is implemented, so
    // declaring either here refuses rather than sending the endpoint a spelling nobody documented.
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, responsesModel({ structuredOutput: 'json-object' }), payload(), context))
      .toThrowError(/PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED/u);
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, responsesModel({ structuredOutput: 'json-schema' }), payload(), context))
      .toThrowError(/PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED/u);
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, responsesModel({ reasoningControl: 'deepseek-thinking' }), payload(), context))
      .toThrowError(/PROVIDER_REASONING_CONTROL_UNSUPPORTED/u);
    // A shape no profile in the table declares still refuses: a profile is data, and the union
    // cannot rule one out at runtime.
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, responsesModel({ requestShape: 'a-shape-nobody-declared' as ProviderModelProfile['capabilities']['requestShape'] }), payload(), context))
      .toThrowError(/PROVIDER_REQUEST_SHAPE_UNSUPPORTED/u);
    // And the route bound to the model is still checked before anything is assembled.
    expect(() => assembleProviderRequest(DEEPSEEK_ROUTE_PROFILE, responsesModel(), payload(), context))
      .toThrowError(/PROVIDER_MODEL_ROUTE_MISMATCH/u);
  });

  it('leaves the two shapes before it exactly where they were', () => {
    const chat = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, payload(), context);
    expect(JSON.parse(chat.body)).toEqual({
      messages: [{ content: SYSTEM, role: 'system' }, { content: UNIT, role: 'user' }],
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      stream: false,
    });
    const messagesModel = responsesModel({ requestShape: 'anthropic-messages', answerChannel: 'content-text-blocks' });
    expect(JSON.parse(assembleProviderRequest(CAPPED_ROUTE_PROFILE, messagesModel, payload(), context).body)).toEqual({
      model: 'synthetic-responses-model',
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM,
      messages: [{ role: 'user', content: UNIT }],
    });
  });
});

describe('normalizeModelResponse · output-message-text', () => {
  const model = responsesModel();
  const reasoningModel = responsesModel({ reasoningChannel: 'output-reasoning-items' });

  it('reads multiple calls in order using call_id, retaining text, usage and raw argument strings', () => {
    const calls = [functionCall('raw_2', '{ invalid JSON'), functionCall('raw_1', '  {"query":"one"}  ')];
    expect(normalizeModelResponse(functionModel(), {
      status: 'completed', output: [message(outputText('before')), calls[0], message(outputText('after')), { ...calls[1], status: 'completed' }],
      usage: { input_tokens: 9, output_tokens: 4 },
    }, { toolCallsOffered: true })).toEqual({
      kind: 'tool-calls', text: 'beforeafter', reasoningText: null,
      calls: calls.map((call) => ({ id: call.call_id, name: call.name, arguments: call.arguments })), usage: { inputTokens: 9, outputTokens: 4 },
    });
  });

  it.each([
    { call_id: undefined }, { call_id: '' }, { call_id: 1 }, { name: undefined }, { name: '' }, { name: 1 },
    { arguments: undefined }, { arguments: {} }, { arguments: null },
    { status: 'in_progress' }, { status: 'incomplete' }, { status: 'failed' }, { status: null },
  ])('rejects the whole batch for malformed call fields %j', (fields) => {
    expect(normalizeModelResponse(functionModel(), { status: 'completed', output: [functionCall('valid'), { ...functionCall(), ...fields }] }, { toolCallsOffered: true }))
      .toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
  });

  it('rejects duplicate call IDs regardless of distinct item IDs, and never falls back to item id', () => {
    for (const output of [
      [functionCall(), { ...functionCall(), id: 'different_item' }],
      [{ ...functionCall(), call_id: undefined, id: 'usable_item_id' }],
    ]) {
      expect(normalizeModelResponse(functionModel(), { status: 'completed', output }, { toolCallsOffered: true }))
        .toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    }
  });

  it.each([undefined, null, 'incomplete', 'failed', 'cancelled', 'queued', 'in_progress'])('refuses calls from response status %s', (status) => {
    expect(normalizeModelResponse(functionModel(), { status, output: [functionCall(), message(outputText('partial'))] }, { toolCallsOffered: true }))
      .toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
  });

  it('rejects reasoning beside calls whether or not the reasoning channel was declared', () => {
    for (const model of [functionModel(), responsesModel({ toolCalling: 'function', reasoningChannel: 'output-reasoning-items' })]) {
      expect(normalizeModelResponse(model, { status: 'completed', output: [functionCall(), REASONING_ITEM] }, { toolCallsOffered: true }))
        .toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    }
  });

  it('ignores calls without both offered and admitted tools, preserving text and empty-answer semantics', () => {
    for (const [profile, options] of [
      [functionModel(), {}], [functionModel(), { toolCallsOffered: false }],
      [responsesModel({ toolCalling: 'none' }), { toolCallsOffered: true }],
    ] as const) {
      expect(normalizeModelResponse(profile, { status: 'incomplete', output: [functionCall(), message(outputText('text'))] }, options))
        .toEqual({ kind: 'answer', text: 'text', reasoningText: null, usage: null });
      expect(normalizeModelResponse(profile, { output: [functionCall()] }, options))
        .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    }
  });

  it('reads the answer across every message item of the output, in order, with usage', () => {
    expect(normalizeModelResponse(model, {
      output: [message(outputText('{"ok":')), message(outputText('true}'))],
      status: 'completed',
      usage: { input_tokens: 120, output_tokens: 30 },
    })).toEqual({ kind: 'answer', text: '{"ok":true}', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    // Two parts of one item concatenate exactly as two items do: the answer is the order the
    // response lists, and the item boundary is not a boundary of the answer.
    expect(normalizeModelResponse(model, { output: [message(outputText('{"ok":'), outputText('true}'))] }))
      .toMatchObject({ kind: 'answer', text: '{"ok":true}' });
    // A reasoning item beside the answer is not answer text, whether or not the channel is declared.
    expect(normalizeModelResponse(reasoningModel, { output: [REASONING_ITEM, message(outputText('答案'))] }))
      .toEqual({ kind: 'answer', text: '答案', reasoningText: null, usage: null });
    // Whitespace is an answer, exactly as it is on the other two shapes: only the contract may judge it.
    expect(normalizeModelResponse(model, { output: [message(outputText(' '))] })).toMatchObject({ kind: 'answer', text: ' ' });
  });

  it('reads a refusal as no answer at all rather than as answer text', () => {
    // The model declined: the refusal string is not the answer, so this is the empty answer the
    // contract layer must never be handed as a parsable one.
    expect(normalizeModelResponse(model, { output: [message({ type: 'refusal', refusal: '我不能回答该请求。' })] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // A refusal beside an answer part leaves the answer exactly the answer.
    expect(normalizeModelResponse(model, { output: [message({ type: 'refusal', refusal: '部分拒绝。' }, outputText('答案'))] }))
      .toMatchObject({ kind: 'answer', text: '答案' });
  });

  it('separates an empty answer from an answer and carries whether the model reasoned', () => {
    // An output that carries reasoning and no message at all: the model thought and said nothing.
    expect(normalizeModelResponse(reasoningModel, { output: [REASONING_ITEM], usage: { input_tokens: 11, output_tokens: 7 } }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: true, usage: { inputTokens: 11, outputTokens: 7 } });
    expect(normalizeModelResponse(reasoningModel, { output: [] })).toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // A message whose text part is empty hands the contract layer the same `''`, so it is the same outcome.
    expect(normalizeModelResponse(reasoningModel, { output: [message(outputText(''))] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // Presence is read only where the channel is declared: an undeclared channel reports nothing.
    expect(normalizeModelResponse(model, { output: [REASONING_ITEM] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
  });

  it('names a response that carries no output array', () => {
    expect(normalizeModelResponse(model, { status: 'completed' })).toEqual({ kind: 'malformed', reason: 'output-absent' });
    expect(normalizeModelResponse(model, { output: 'not-an-array' })).toEqual({ kind: 'malformed', reason: 'output-absent' });
    expect(normalizeModelResponse(model, null)).toEqual({ kind: 'malformed', reason: 'response-not-a-record' });
    // Neither of the other two shapes' bodies is this shape's body, and each is read as such rather
    // than half-read: the client-side `output_text` the SDK synthesizes is not on the wire either.
    expect(normalizeModelResponse(model, { choices: [{ message: { content: '{"ok":true}' } }] }))
      .toEqual({ kind: 'malformed', reason: 'output-absent' });
    expect(normalizeModelResponse(model, { content: [{ type: 'text', text: '{"ok":true}' }] }))
      .toEqual({ kind: 'malformed', reason: 'output-absent' });
    expect(normalizeModelResponse(model, { output_text: '{"ok":true}' })).toEqual({ kind: 'malformed', reason: 'output-absent' });
    // Declaring no answer channel still refuses first, whichever shape the model requests.
    expect(normalizeModelResponse(responsesModel({ answerChannel: 'none' }), { output: [message(outputText('答案'))] }))
      .toEqual({ kind: 'malformed', reason: 'answer-channel-not-declared' });
  });

  it('reads usage only when both counts are present and sound, and carries the reasoning count when it is', () => {
    const answered = (usage: unknown) => normalizeModelResponse(model, { output: [message(outputText('x'))], usage });
    expect(answered({ input_tokens: 120, output_tokens: 30, output_tokens_details: { reasoning_tokens: 12 } }))
      .toMatchObject({ usage: { inputTokens: 120, outputTokens: 30, reasoningTokens: 12 } });
    // Without the detail there is no count to carry, and none is invented: the whole usage, stated
    // exactly, so a reasoning count that appeared from nowhere would fail here.
    expect(answered({ input_tokens: 120, output_tokens: 30 }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    // A count that is not a non-negative integer is not a count: the two sound ones still travel.
    expect(answered({ input_tokens: 120, output_tokens: 30, output_tokens_details: { reasoning_tokens: -1 } }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    expect(answered({ input_tokens: 5 })).toMatchObject({ kind: 'answer', usage: null });
    expect(answered({ input_tokens: -1, output_tokens: 2 })).toMatchObject({ kind: 'answer', usage: null });
    expect(answered({ input_tokens: 0, output_tokens: 0 })).toMatchObject({ usage: { inputTokens: 0, outputTokens: 0 } });
    // The cache accounting nothing has observed on this gateway is not read into the canonical
    // usage: the input count is passed through rather than adjusted the way the other shape's is.
    expect(answered({ input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 100 } }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
  });
});

describe('DeepSeekOpenAiCompatibleAdapter · openai-responses', () => {
  function instanceFor(model: ProviderModelProfile, transport: DeepSeekTransport, overrides: {
    tickets?: { take: () => TransmitTicket | null };
    resolve?: () => Promise<string>;
    profile?: ProviderRouteProfile;
  } = {}): DeepSeekOpenAiCompatibleAdapter {
    let ticket: TransmitTicket | null = { decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) };
    return new DeepSeekOpenAiCompatibleAdapter({
      broker: new CredentialBroker({ resolve: overrides.resolve ?? (async () => 'placeholder-secret') }),
      slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Main Editorial Role', slot: 'opencode-go', credentialReference: randomUUID() },
      tickets: overrides.tickets ?? { take: () => { const current = ticket; ticket = null; return current; } },
      attribution: () => attributionHeaders(),
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      codes,
      profile: overrides.profile ?? CAPPED_ROUTE_PROFILE,
      modelProfile: model,
      sessionId: () => SESSION,
      transport,
    });
  }

  it.each([true, false])('round-trips canonical blocks and correlated outputs with tools retained: %s', async (retainTools) => {
    const bodies: Array<Record<string, unknown>> = [];
    const calls = [functionCall('raw_first'), functionCall('raw_second', '{ invalid JSON')];
    const instance = instanceFor(functionModel(), async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return { status: 200, json: async () => bodies.length === 1
        ? { status: 'completed', output: [message(outputText('looking')), ...calls], usage: { input_tokens: 9, output_tokens: 4 } }
        : { status: 'completed', output: [message(outputText('final answer'))], usage: { input_tokens: 20, output_tokens: 3 } } };
    }, { tickets: { take: () => ({ decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) }) } });
    const first = await collect(instance.stream(toolPayload()));
    expect(first).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'looking' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'looking' } },
      ...calls.flatMap((call, i) => [
        { type: 'block-start', index: i + 1, blockType: 'tool-call' },
        { type: 'tool-call-delta', index: i + 1, id: call.call_id, name: call.name, argumentsDelta: call.arguments },
        { type: 'block-end', index: i + 1, block: { type: 'tool-call', id: call.call_id, name: call.name, arguments: call.arguments } },
      ]),
      { type: 'usage', usage: { inputTokens: 9, outputTokens: 4 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]);
    const blocks = first.flatMap((chunk) => chunk.type === 'block-end' ? [chunk.block] : []);
    const history: GenerateOptions['messages'] = [
      ...toolPayload().messages,
      { id: 'assistant' as never, role: 'assistant', content: blocks, source: { kind: 'model', provider: OPENCODE_GO_ROUTE, model: functionModel().model } },
      ...calls.map((call, index) => ({
        id: `result_${index}` as never, role: 'user' as const,
        source: { kind: 'tool' as const, callId: call.call_id as never },
        content: [{ type: 'tool-result' as const, toolCallId: call.call_id as never, content: [{ type: 'text' as const, text: `result_${index}` }], isError: index === 1 }],
      })),
    ];
    const second = await collect(instance.stream({ ...toolPayload(), messages: history, tools: retainTools ? [TOOL] : [] }));
    expect(bodies[1]).toEqual({
      model: functionModel().model, instructions: SYSTEM, max_output_tokens: MAX_OUTPUT_TOKENS,
      ...(retainTools ? { tools: [{ type: 'function', ...TOOL, strict: false }] } : {}),
      input: [
        { role: 'user', content: UNIT }, { role: 'assistant', content: 'looking' },
        ...calls.map((call) => ({ type: 'function_call', call_id: call.call_id, name: call.name, arguments: call.arguments })),
        ...calls.map((call, index) => ({ type: 'function_call_output', call_id: call.call_id, output: `result_${index}` })),
      ],
    });
    expect(second).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'final answer' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'final answer' } },
      { type: 'usage', usage: { inputTokens: 20, outputTokens: 3 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]);
    expect(instance.transmissions).toBe(2);
  });

  it('never emits unsolicited calls when tools are absent or empty, for either profile', async () => {
    for (const model of [responsesModel(), functionModel()]) {
      for (const tools of [undefined, []]) {
        for (const text of ['', 'still an answer']) {
          const instance = instanceFor(model, async () => ({ status: 200, json: async () => ({
            status: 'incomplete', output: [functionCall(), message(outputText(text))],
          }) }));
          const chunks = await collect(instance.stream({ ...payload(), model: model.model, ...(tools === undefined ? {} : { tools }) }));
          expect(chunks).toEqual([
            { type: 'block-start', index: 0, blockType: 'text' },
            { type: 'text-delta', index: 0, text },
            { type: 'block-end', index: 0, block: { type: 'text', text } },
            { type: 'finish', reason: { kind: 'stop' } },
          ]);
          expect(instance.lastCanonicalResult?.kind).toBe(text.length > 0 ? 'answer' : 'empty-answer');
        }
      }
    }
  });

  it('refuses capability-none requests before ticket, credential or transport access', async () => {
    const take = vi.fn(() => null);
    const resolve = vi.fn(async () => 'placeholder-secret');
    const transport = vi.fn<DeepSeekTransport>();
    const instance = instanceFor(responsesModel({ toolCalling: 'none' }), transport, { tickets: { take }, resolve });
    expect(await collect(instance.stream(toolPayload()))).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE } } }]);
    expect(take).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([null, { decision: 'transmit-remote' as const, bindingDigest: 'c'.repeat(64), payloadDigest: 'b'.repeat(64) }])('requires a matching ticket %j', async (ticket) => {
    const resolve = vi.fn(async () => 'placeholder-secret');
    const transport = vi.fn<DeepSeekTransport>();
    const instance = instanceFor(functionModel(), transport, { tickets: { take: () => ticket }, resolve });
    expect(await collect(instance.stream(toolPayload()))).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.TRANSMIT_TICKET_ABSENT } } }]);
    expect(resolve).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'incomplete', output: [functionCall()] },
    { status: 'completed', output: [functionCall(), { ...functionCall('second'), arguments: {} }] },
    { status: 'completed', output: [functionCall(), REASONING_ITEM] },
  ])('emits no partial tool chunks for rejected batches %j', async (body) => {
    const instance = instanceFor(functionModel(), async () => ({ status: 200, json: async () => body }));
    expect(await collect(instance.stream(toolPayload()))).toEqual([{
      type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务响应不含可用内容。', status: 200 } },
    }]);
  });

  it.each([
    [401, INVALID_CREDENTIAL_CODE, 'account-limit-terminal'],
    [403, INVALID_CREDENTIAL_CODE, 'account-limit-terminal'],
    [402, QUOTA_EXCEEDED_CODE, 'account-limit-terminal'],
    [429, QUOTA_EXCEEDED_CODE, 'account-limit-terminal'],
    [429, AI7_FAILURE_CODES.RATE_LIMIT, 'rate-limit-retryable'],
    [500, AI7_FAILURE_CODES.PROVIDER_ERROR, 'account-limit-terminal'],
  ] as const)('preserves HTTP %s classification with offered functions', async (status, code, limitPolicy) => {
    const transport = vi.fn<DeepSeekTransport>(async () => ({ status, json: async () => ({ status: 'completed', output: [functionCall()] }) }));
    const instance = instanceFor(functionModel(), transport, { profile: { ...CAPPED_ROUTE_PROFILE, limitPolicy } });
    expect(await collect(instance.stream(toolPayload()))).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code, status } } }]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(instance.lastCanonicalResult).toBeNull();
  });

  it('preserves abort and unreadable-response boundaries without retry', async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = vi.fn<DeepSeekTransport>(async (_url, init) => {
      expect(init.signal).toBe(controller.signal);
      throw Object.assign(new Error('synthetic abort'), { name: 'AbortError' });
    });
    const abortInstance = instanceFor(functionModel(), aborted);
    expect(await collect(abortInstance.stream({ ...toolPayload(), signal: controller.signal })))
      .toMatchObject([{ type: 'finish', reason: { kind: 'aborted', failure: { code: AI7_FAILURE_CODES.INTERRUPTED } } }]);
    expect(aborted).toHaveBeenCalledTimes(1);
    const unreadable = vi.fn<DeepSeekTransport>(async () => ({ status: 200, json: async () => { throw new Error('synthetic unreadable'); } }));
    const unreadableInstance = instanceFor(functionModel(), unreadable);
    expect(await collect(unreadableInstance.stream(toolPayload())))
      .toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.OUTCOME_UNKNOWN, status: 200 } } }]);
    expect(unreadable).toHaveBeenCalledTimes(1);
  });

  it('streams the shape through the unchanged event contract with a stub transport', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const model = responsesModel({ reasoningChannel: 'output-reasoning-items' });
    const instance = instanceFor(model, async (url, init) => {
      calls.push({ url, body: init.body });
      return {
        status: 200,
        json: async () => ({
          output: [REASONING_ITEM, message(outputText('{"ok":true}'))],
          usage: { input_tokens: 9, output_tokens: 4, output_tokens_details: { reasoning_tokens: 3 } },
        }),
      };
    });
    const chunks = await collect(instance.stream({ ...payload(), model: model.model }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toContain(`"max_output_tokens":${MAX_OUTPUT_TOKENS}`);
    expect(calls[0]!.body).toContain('"instructions"');
    expect(calls[0]!.body).not.toContain('placeholder-secret');
    // Nothing above the adapter learns the shape: the same chunks a chat-completions turn yields.
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '{"ok":true}' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '{"ok":true}' } },
      { type: 'usage', usage: { inputTokens: 9, outputTokens: 4, reasoningTokens: 3 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]);
    expect(instance.lastCanonicalResult).toMatchObject({ kind: 'answer', text: '{"ok":true}' });
  });

  it('fails a response of this shape that matched no declared channel, exactly as the other shapes do', async () => {
    const model = responsesModel();
    const instance = instanceFor(model, async () => ({ status: 200, json: async () => ({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }) }));
    const chunks = await collect(instance.stream({ ...payload(), model: model.model }));
    expect(chunks).toEqual([{
      type: 'finish',
      reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务响应不含可用内容。', status: 200 } },
    }]);
    expect(instance.lastCanonicalResult).toMatchObject({ kind: 'malformed', reason: 'output-absent' });
  });

  it('streams a refusal as the empty answer the layers above already handle', async () => {
    const model = responsesModel();
    const instance = instanceFor(model, async () => ({ status: 200, json: async () => ({ output: [message({ type: 'refusal', refusal: '我不能回答该请求。' })] }) }));
    const chunks = await collect(instance.stream({ ...payload(), model: model.model }));
    // The event shape is unchanged and the empty answer travels out of band, where a string cannot
    // lose it: the refusal text is never handed to the contract layer as an answer.
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]);
    expect(instance.lastCanonicalResult).toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
  });
});
