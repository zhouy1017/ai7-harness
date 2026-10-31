import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST, buildDialogueMessage } from '../../src/service/dialogue/contract.js';
import { modelServiceChannels, productionBindingRefusal } from '../../src/service/launch-policy.js';
import { AI7_FAILURE_CODES } from '../../src/service/provider/classification.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { DeepSeekOpenAiCompatibleAdapter, PROVIDER_ROUTE_PROFILES, assembleProviderRequest, type DeepSeekTransport } from '../../src/service/provider/deepseek-adapter.js';
import { modelDisposition, providerPreflight, type ModelAspect } from '../../src/service/provider/family-dispositions.js';
import { PROVIDER_MODEL_PROFILES, modelProfileFor, type ModelCapabilities, type ProviderModelProfile } from '../../src/service/provider/model-profile.js';
import { GENERATED_FAMILY_DISPOSITIONS, GENERATED_ROUTE_DISPOSITIONS } from '../../src/service/provider/provider-profiles.generated.js';
import { normalizeModelResponse } from '../../src/service/provider/response-normalization.js';
import { CONFIGURED_RUNTIME_MODEL_TABLE, type ConfiguredRouteId } from '../../src/shared/provider-configuration.generated.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

/**
 * Capability dispositions and the named preflight refusal (Issue #1180), cancellation and the stream boundaries each family
 * reader enforces. Provider-free: placeholder credential, stub transports, network denied.
 */

installNodeNetworkDenial();

const FIXTURES = resolve('tests/fixtures/model/provider-families');
/** One shipped official row per family, and the capabilities the family fixtures declare on it test-locally. */
const ROWS = [
  { family: 'openai-responses', route: 'openai-platform', model: 'gpt-5.6-luna', declared: { streaming: 'responses-sse', toolCalling: 'function' } },
  { family: 'anthropic-messages', route: 'anthropic-claude', model: 'claude-opus-5', declared: { answerChannel: 'content-text-blocks', streaming: 'messages-sse', toolCalling: 'function' } },
  { family: 'google-generate-content', route: 'google-gemini', model: 'gemini-3.8-flash', declared: { answerChannel: 'candidate-parts-text', streaming: 'generate-content-sse', toolCalling: 'function' } },
] as const satisfies ReadonlyArray<{ family: string; route: ConfiguredRouteId; model: string; declared: Partial<ModelCapabilities> }>;

const shipped = (route: ConfiguredRouteId, model: string): ProviderModelProfile => modelProfileFor(route, model)!;
const declared = (row: (typeof ROWS)[number]): ProviderModelProfile => {
  const model = shipped(row.route, row.model);
  return { ...model, capabilities: { ...model.capabilities, ...row.declared } };
};
const dialogue = (model: ProviderModelProfile): GenerateOptions => ({ provider: model.route, model: model.model, system: DIALOGUE_PROMPT_CONTRACT.systemPrompt,
  messages: [{ id: 'm1' as never, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: buildDialogueMessage({ kind: 'ask', selection: '合成选区。', question: '合成问题？', kept: null }) }] }] });
const unit = (model: ProviderModelProfile, tools?: GenerateOptions['tools']): GenerateOptions => ({ provider: model.route, model: model.model, system: '合成系统提示。',
  ...(tools === undefined ? {} : { tools }), messages: [{ id: 'm1' as never, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '合成段落。' }] }] });
const TOOL = { name: 'synthetic_lookup', description: '合成查询工具。', parameters: { type: 'object', properties: {} } };

/** An adapter over a stub transport; reports what reached the ticket, broker and transport. */
function harness(model: ProviderModelProfile, transport: DeepSeekTransport, stream: boolean, signal?: AbortSignal) {
  const touched = { ticket: 0, broker: 0, transport: 0 };
  const profile = PROVIDER_ROUTE_PROFILES[model.route];
  const adapter = new DeepSeekOpenAiCompatibleAdapter({
    broker: new CredentialBroker({ resolve: async () => { touched.broker += 1; return 'placeholder-not-a-credential'; } }),
    slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Fast Interaction Role', slot: profile.credentialSlot, credentialReference: 'c8c4e0f8-27dd-45ad-8c60-580a5d58b799' },
    tickets: { take: () => { touched.ticket += 1; return { decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) }; } },
    attribution: () => ({}), promptContractDigest: stream ? DIALOGUE_PROMPT_CONTRACT_DIGEST : BASELINE_PROMPT_CONTRACT_DIGEST, profile, modelProfile: model,
    codes: { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE },
    transport: async (url, init) => { touched.transport += 1; return transport(url, init); },
    ...(profile.sessionHeader ? { sessionId: () => 'synthetic-session' } : {}),
    ...(stream ? { requestShape: 'editorial-dialogue-sse' as const } : {}), ...(signal === undefined ? {} : { signal }),
  });
  return { adapter, touched };
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
const failureOf = (chunks: StreamChunk[]) => {
  const last = chunks.at(-1);
  return last?.type === 'finish' && 'failure' in last.reason ? last.reason.failure : null;
};
const sse = (frames: ReadonlyArray<string>): Response => new Response(frames.join(''), { headers: { 'content-type': 'text/event-stream' } });
const frames = (family: string, name: string): ReadonlyArray<string> =>
  (JSON.parse(readFileSync(resolve(FIXTURES, `${family}.json`), 'utf8')) as { cases: Array<{ name: string; response: { frames: string[] } }> })
    .cases.find((entry) => entry.name === name)!.response.frames;
/** A family's recorded text stream up to and including its first text delta. */
const head = (family: string): ReadonlyArray<string> => {
  const all = frames(family, 'text-stream');
  return all.slice(0, all.findIndex((frame) => frame.includes('合成')) + 1);
};

describe('capability dispositions per family and per model', () => {
  it('states what each family implements, and that only chat completions carries the DeepSeek-spelled extras', () => {
    for (const family of ['openai-chat-completions', 'openai-responses', 'anthropic-messages', 'google-generate-content'] as const) {
      const table = GENERATED_FAMILY_DISPOSITIONS[family];
      for (const aspect of ['text', 'stream', 'functionTools', 'usage', 'cancellation', 'accountLimit', 'rateLimit'] as const) expect(table[aspect], `${family} ${aspect}`).toBe('supported');
      expect(table.providerTools).toBe('unsupported');
      for (const aspect of ['structuredOutput', 'reasoningControl', 'reasoningContinuation'] as const) {
        expect(table[aspect], `${family} ${aspect}`).toBe(family === 'openai-chat-completions' ? 'supported' : 'unsupported');
      }
    }
  });

  it('derives every shipped model\'s disposition exactly as the generated route table states it', () => {
    for (const model of Object.values(PROVIDER_MODEL_PROFILES)) {
      const route = GENERATED_ROUTE_DISPOSITIONS[model.route];
      expect(route.family, model.key).toBe(model.capabilities.requestShape);
      for (const aspect of ['text', 'stream', 'functionTools'] as const satisfies ReadonlyArray<ModelAspect>) {
        expect(modelDisposition(model, aspect) === 'supported', `${model.key} ${aspect}`).toBe(route.supported[aspect].includes(model.model));
      }
    }
    // Nothing beyond the recorded evidence is supported: no Messages or Gemini row reads a text answer yet.
    for (const route of ['anthropic-claude', 'google-gemini', 'opencode-zen-messages', 'opencode-go-messages', 'opencode-zen-responses'] as const) {
      expect(GENERATED_ROUTE_DISPOSITIONS[route].supported, route).toEqual({ text: [], stream: [], functionTools: [] });
    }
  });

  it('refuses every untested shipped row by name before any ticket, credential or transport', async () => {
    for (const row of ROWS) {
      const model = shipped(row.route, row.model);
      const demand = row.family === 'openai-responses' ? { stream: true, functionTools: false } : { stream: false, functionTools: false };
      const reason = row.family === 'openai-responses' ? 'untested:stream' : 'untested:text';
      expect(providerPreflight(model, demand)).toMatchObject({ code: 'PROVIDER_PREFLIGHT_REFUSED', reason, family: row.family, route: row.route, model: row.model });
      const { adapter, touched } = harness(model, async () => { throw new Error('never reached'); }, demand.stream);
      const chunks = await collect(adapter.stream(demand.stream ? dialogue(model) : unit(model)));
      expect(failureOf(chunks)).toMatchObject({ code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: expect.stringContaining(`${row.family} 不支持本步骤（${reason}）`) });
      expect(touched).toEqual({ ticket: 0, broker: 0, transport: 0 });
      expect(adapter.assembledRequestDigests).toHaveLength(0);
    }
  });

  it('refuses undeclared function tools by name, and declared ones only where the family implements them', () => {
    const luna = shipped('openai-platform', 'gpt-5.6-luna');
    expect(providerPreflight(luna, { stream: false, functionTools: true })?.reason).toBe('untested:functionTools');
    expect(providerPreflight(luna, { stream: false, functionTools: false })).toBeNull();
    for (const row of ROWS) expect(providerPreflight(declared(row), { stream: true, functionTools: true }), row.family).toBeNull();
    // A stream is one family's own: a Messages declaration on a Responses row is not that row's stream.
    expect(modelDisposition({ ...luna, capabilities: { ...luna.capabilities, streaming: 'messages-sse' } }, 'stream')).toBe('untested');
  });

  it('admits all four families for both roles under v32, so a Claude 官方 model reads its own untested:text (Issue #1221)', () => {
    for (const role of ['main', 'fast'] as const) {
      // Chat completions is the reviewed table's own family; the other three are the declared rows above.
      for (const row of ROWS) expect(productionBindingRefusal(declared(row), role), `${role} ${row.family}`).toBeNull();
      expect(productionBindingRefusal(shipped('opencode-go', 'deepseek-v4.1-flash'), role)).toBeNull();
    }
    const channels = modelServiceChannels();
    const models = channels.flatMap((channel) => channel.models);
    expect(models.some((model) => model.main === 'family-not-admitted-by-selected-policy' || model.fast === 'family-not-admitted-by-selected-policy')).toBe(false);
    expect(new Set(models.map((model) => model.family))).toEqual(new Set(['openai-chat-completions', 'openai-responses', 'anthropic-messages', 'google-generate-content']));
    const claude = channels.find((channel) => channel.channelId === 'anthropic-claude')!.models.find((model) => model.modelId === 'claude-fable-5-1')!;
    expect([claude.main, claude.fast]).toEqual(['untested:text', 'untested:text']);
    // OpenAI Responses for Main gained its runtime record (W22b-A2 #1225), so it is chosen for both roles.
    const luna = channels.find((channel) => channel.channelId === 'openai-platform')!.models.find((model) => model.modelId === 'gpt-5.6-luna')!;
    expect([luna.main, luna.fast]).toEqual(['eligible', 'eligible']);
    // Every reviewed model-table row passes, so selection is unchanged.
    for (const role of ['main', 'fast'] as const) {
      for (const binding of CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction[role]) {
        expect(productionBindingRefusal(shipped(binding.route, binding.model), role), `${role} ${binding.route}/${binding.model}`).toBeNull();
      }
    }
  });
});

describe('cancellation per family', () => {
  it('aborts before send without entering the transport, for every family', async () => {
    for (const row of ROWS) {
      const controller = new AbortController();
      controller.abort();
      const { adapter, touched } = harness(declared(row), async () => { throw new Error('never reached'); }, true, controller.signal);
      const chunks = await collect(adapter.stream(dialogue(declared(row))));
      expect(failureOf(chunks)?.code, row.family).toBe(AI7_FAILURE_CODES.TRANSPORT_FAILED);
      expect(touched.transport, row.family).toBe(0);
      expect(adapter.lastRequestNotSent, row.family).toBe(true);
    }
  });

  it('keeps a stream stopped mid-answer outcome-unknown and never resends it, for every family', async () => {
    for (const row of ROWS) {
      const controller = new AbortController();
      const first = head(row.family).join('');
      const transport: DeepSeekTransport = async (_url, init) => new Response(new ReadableStream<Uint8Array>({ start(stream) {
        stream.enqueue(new TextEncoder().encode(first));
        init.signal?.addEventListener('abort', () => stream.error(new DOMException('aborted', 'AbortError')));
      } }), { headers: { 'content-type': 'text/event-stream' } });
      const { adapter, touched } = harness(declared(row), transport, true, controller.signal);
      const chunks: StreamChunk[] = [];
      for await (const chunk of adapter.stream(dialogue(declared(row)))) {
        chunks.push(chunk);
        if (chunk.type === 'text-delta') controller.abort();
      }
      expect(chunks.map((chunk) => chunk.type), row.family).toEqual(['block-start', 'text-delta', 'finish']);
      expect(failureOf(chunks)?.code, row.family).toBe(AI7_FAILURE_CODES.OUTCOME_UNKNOWN);
      expect(touched.transport, row.family).toBe(1);
      expect(adapter.lastRequestNotSent, row.family).toBe(false);
    }
  });
});

describe('stream boundaries per family', () => {
  it('reads a stream without its terminal proof as outcome-unknown, for every family', async () => {
    const truncated: Record<(typeof ROWS)[number]['family'], ReadonlyArray<string>> = {
      'openai-responses': frames('openai-responses', 'text-stream').slice(0, -1),
      'anthropic-messages': frames('anthropic-messages', 'text-stream').slice(0, -1),
      // A last frame that carries no finish reason is not a whole generateContent stream.
      'google-generate-content': frames('google-generate-content', 'text-stream').slice(0, 1),
    };
    for (const row of ROWS) {
      const { adapter } = harness(declared(row), async () => sse(truncated[row.family]), true);
      expect(failureOf(await collect(adapter.stream(dialogue(declared(row)))))?.code, row.family).toBe(AI7_FAILURE_CODES.OUTCOME_UNKNOWN);
      expect(adapter.lastCanonicalResult, row.family).toBeNull();
    }
  });

  it('refuses a Responses stream whose completed text differs from its deltas, and a Messages call whose arguments do not parse', async () => {
    const responses = frames('openai-responses', 'text-stream').map((frame) => frame.replace('"delta":"回答。"', '"delta":"别的。"'));
    const messages = frames('anthropic-messages', 'tool-stream').map((frame) => frame.replace('"partial_json":"\\"合成\\"}"', '"partial_json":"\\"合成"'));
    for (const [row, wire] of [[ROWS[0], responses], [ROWS[1], messages]] as const) {
      const { adapter } = harness(declared(row), async () => sse(wire), true);
      expect(failureOf(await collect(adapter.stream(dialogue(declared(row)))))?.code, row.family).toBe(AI7_FAILURE_CODES.OUTCOME_UNKNOWN);
    }
  });

  it('reads an in-stream account limit as the account limit, after text or before it, on every family that names one', async () => {
    const quota: Record<(typeof ROWS)[number]['family'], string> = {
      'openai-responses': `event: error\ndata: ${JSON.stringify({ type: 'error', code: 'insufficient_quota', message: 'Synthetic quota.' })}\n\n`,
      'anthropic-messages': `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'billing_error', message: 'Synthetic billing.' } })}\n\n`,
      'google-generate-content': `data: ${JSON.stringify({ error: { code: 429, message: 'Synthetic: exceeded your current quota.', status: 'RESOURCE_EXHAUSTED' } })}\n\n`,
    };
    for (const row of ROWS) {
      const { adapter } = harness(declared(row), async () => sse([...head(row.family), quota[row.family]]), true);
      expect(failureOf(await collect(adapter.stream(dialogue(declared(row))))), row.family).toMatchObject({ code: QUOTA_EXCEEDED_CODE });
    }
  });
});

describe('Gemini function calls (Issue #1180)', () => {
  const gemini = declared(ROWS[2]);
  const offered = { toolCallsOffered: true, offeredToolNames: [TOOL.name], callIdSeed: '0123456789abcdef' };
  const body = (parts: unknown[], finishReason = 'STOP') => ({ candidates: [{ content: { role: 'model', parts }, finishReason }] });

  it('refuses opaque reasoning, an unoffered name, a non-object argument and an unfinished turn as malformed', () => {
    for (const parts of [
      [{ functionCall: { name: TOOL.name, args: {} }, thoughtSignature: 'opaque' }],
      [{ text: '合成推理', thought: true }, { functionCall: { name: TOOL.name, args: {} } }],
      [{ functionCall: { name: 'unoffered', args: {} } }],
      [{ functionCall: { name: TOOL.name, args: [] } }],
      [{ functionCall: { name: TOOL.name, args: {} } }, { text: '调用之后的文字' }],
    ]) expect(normalizeModelResponse(gemini, body(parts), offered)).toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    expect(normalizeModelResponse(gemini, body([{ functionCall: { name: TOOL.name } }], 'MAX_TOKENS'), offered)).toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    // A call without the provider's id cannot be named without the request's seed.
    expect(normalizeModelResponse(gemini, body([{ functionCall: { name: TOOL.name } }]), { toolCallsOffered: true, offeredToolNames: [TOOL.name] })).toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
    // And a call nobody offered is never read on a request that offered none.
    expect(normalizeModelResponse(gemini, body([{ functionCall: { name: TOOL.name } }]))).toEqual({ kind: 'malformed', reason: 'tool-calls-malformed' });
  });

  it('names two id-less calls of one turn apart and refuses reasoning carried back with a call', () => {
    expect(normalizeModelResponse(gemini, body([{ functionCall: { name: TOOL.name } }, { functionCall: { name: TOOL.name, args: { q: 1 } } }]), offered)).toMatchObject({
      kind: 'tool-calls', calls: [{ id: 'gemini-call-0123456789abcdef-1', arguments: '{}' }, { id: 'gemini-call-0123456789abcdef-2', arguments: '{"q":1}' }],
    });
    const history = unit(gemini, [TOOL]);
    const withReasoning: GenerateOptions = { ...history, messages: [...history.messages,
      { id: 'm2' as never, role: 'assistant', source: { kind: 'model', provider: gemini.route, model: gemini.model }, content: [{ type: 'reasoning', text: '合成推理' }, { type: 'tool-call', id: 'c1' as never, name: TOOL.name, arguments: '{}' }] },
      { id: 'm3' as never, role: 'user', source: { kind: 'tool', callId: 'c1' as never }, content: [{ type: 'tool-result', toolCallId: 'c1' as never, content: [{ type: 'text', text: '合成' }] }] }] };
    expect(() => assembleProviderRequest(PROVIDER_ROUTE_PROFILES['google-gemini'], gemini, withReasoning, { attribution: {}, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST }))
      .toThrow('PROVIDER_REASONING_CONTINUATION_UNSUPPORTED');
  });
});
