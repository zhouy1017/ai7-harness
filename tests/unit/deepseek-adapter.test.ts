import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE, attributionHeaders } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { AI7_FAILURE_CODES, RETRY_SAFE_FAILURE_TABLE, classifyModelFailure, evaluateRunBudgetCeiling, isRetrySafeFailure } from '../../src/service/provider/classification.js';
import { CredentialBroker, type CredentialSlotBinding } from '../../src/service/provider/credential-broker.js';
import {
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_ROUTE_PROFILE,
  DeepSeekOpenAiCompatibleAdapter,
  OPENCODE_GO_ENDPOINT,
  OPENCODE_GO_ROUTE_PROFILE,
  OPENCODE_GO_SESSION_HEADER,
  OPENCODE_GO_USER_AGENT,
  PROVIDER_ROUTE_PROFILES,
  assembleDeepSeekRequest,
  assembleProviderRequest,
  classifyTransportError,
  parseProviderResponse,
  type DeepSeekTransport,
} from '../../src/service/provider/deepseek-adapter.js';
import {
  DEEPSEEK_V4_PRO_PROFILE,
  OPENCODE_GO_V4_FLASH_PROFILE,
  OPENCODE_GO_V4_PRO_PROFILE,
  PROVIDER_MODEL_PROFILES,
  modelProfileFor,
  type ProviderModelProfile,
} from '../../src/service/provider/model-profile.js';
import { normalizeModelResponse } from '../../src/service/provider/response-normalization.js';
import { DEEPSEEK_MODEL, DEEPSEEK_ROUTE, OPENCODE_GO_MODEL, OPENCODE_GO_ROUTE, type TransmitTicket } from '../../src/service/provider/egress-gate.js';
import { NETWORK_DENIED_CODE, installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// The remote path is complete but never transmits under v1. Every credential here is a placeholder
// supplied by a fake resolver; no real secret, socket, or Provider is involved.

installNodeNetworkDenial();

const codes = { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE };
const SYSTEM = '合成系统提示。';
const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;

/**
 * The exact bytes each current profile sends for one fixed payload, captured at `dev@5344aa62` before
 * route and model capability profiles were separated (Issue #310). The promise that separation makes
 * is byte identity: expressing today's two profiles in the new shape may not move one byte of either
 * request. A digest over a fixed payload is the only form of that proof which survives the refactor,
 * so both digests are frozen literals here rather than values derived from the code under test.
 */
const PRODUCTION_REQUEST_BODY = `{"messages":[{"content":"${SYSTEM}","role":"system"},{"content":${JSON.stringify(UNIT)},"role":"user"}],"model":"deepseek-v4-pro","reasoning_effort":"high","stream":false,"thinking":{"type":"enabled"}}`;
const PRODUCTION_REQUEST_DIGEST = '6dbe1241b0d5f43c2905a55bd0a417bc57c51960acd695465012ec851d0635b1';
/**
 * The `opencode-go` pin moved once, deliberately, when test item `S40/reanalyze-range/1` of
 * 2026-09-08 observed the gateway accept a format constraint and the profile came to declare
 * `json-object` (#306). The bytes before that were
 * `…"model":"deepseek-v4-flash","stream":false}` digesting to
 * `bcb7d5c44fe404a2884d65991a737c6e7026790ddfca34845cbc785fbdae933b`; the whole of the difference is
 * the one `response_format` field. The production pin above did not move and may not.
 */
const OPENCODE_GO_REQUEST_BODY = `{"messages":[{"content":"${SYSTEM}","role":"system"},{"content":${JSON.stringify(UNIT)},"role":"user"}],"model":"deepseek-v4-flash","response_format":{"type":"json_object"},"stream":false}`;
const OPENCODE_GO_REQUEST_DIGEST = 'b2ef9b2ab9dc1234df98940c9854218add36594bc818678d75efdf8577688730';

function request(): GenerateOptions {
  return {
    provider: DEEPSEEK_ROUTE,
    model: DEEPSEEK_MODEL,
    system: SYSTEM,
    messages: [{ id: 'm1' as never, role: 'user', content: [{ type: 'text', text: UNIT }], source: { kind: 'user' } }],
  };
}

const slotBinding: CredentialSlotBinding = {
  bindingDigest: 'a'.repeat(64),
  modelRole: 'Main Editorial Role',
  slot: 'deepseek-api-key',
  credentialReference: randomUUID(),
};

function ticketFor(digest = slotBinding.bindingDigest): TransmitTicket {
  return { decision: 'transmit-remote', bindingDigest: digest, payloadDigest: 'b'.repeat(64) };
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

function adapter(options: {
  ticket: TransmitTicket | null;
  secret?: string;
  transport?: DeepSeekTransport;
}): { adapter: DeepSeekOpenAiCompatibleAdapter; broker: CredentialBroker; calls: Array<{ url: string; init: Parameters<DeepSeekTransport>[1] }> } {
  const calls: Array<{ url: string; init: Parameters<DeepSeekTransport>[1] }> = [];
  const broker = new CredentialBroker({ resolve: async () => options.secret ?? null });
  let ticket = options.ticket;
  const instance = new DeepSeekOpenAiCompatibleAdapter({
    broker,
    slotBinding,
    tickets: { take: () => { const current = ticket; ticket = null; return current; } },
    attribution: () => attributionHeaders(),
    promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
    codes,
    ...(options.transport === undefined ? {} : {
      transport: (url, init) => { calls.push({ url, init }); return options.transport!(url, init); },
    }),
  });
  return { adapter: instance, broker, calls };
}

describe('assembleDeepSeekRequest', () => {
  it('assembles a deterministic revision-1 request and digests it without any credential', () => {
    const first = assembleDeepSeekRequest(request(), attributionHeaders(), BASELINE_PROMPT_CONTRACT_DIGEST);
    const second = assembleDeepSeekRequest(request(), attributionHeaders(), BASELINE_PROMPT_CONTRACT_DIGEST);
    expect(first).toEqual(second);
    expect(first.url).toBe(DEEPSEEK_ENDPOINT);
    expect(first.method).toBe('POST');
    expect(first.headers['content-type']).toBe('application/json');
    expect(first.headers['user-agent']).toMatch(/\S/u);
    expect(first.headers).not.toHaveProperty('authorization');
    const body = JSON.parse(first.body) as Record<string, unknown>;
    expect(body).toEqual({
      messages: [{ content: SYSTEM, role: 'system' }, { content: UNIT, role: 'user' }],
      model: 'deepseek-v4-pro',
      reasoning_effort: 'high',
      stream: false,
      thinking: { type: 'enabled' },
    });
    expect(body).not.toHaveProperty('tools');
    expect(first.requestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
  });

  it('sends the exact production bytes frozen before the profile split', () => {
    const assembly = assembleDeepSeekRequest(request(), attributionHeaders(), BASELINE_PROMPT_CONTRACT_DIGEST);
    expect(assembly.body).toBe(PRODUCTION_REQUEST_BODY);
    expect(assembly.requestDigest).toBe(PRODUCTION_REQUEST_DIGEST);
    // A capability another profile declares does not reach this route: the live profile now requires
    // a JSON object and the production request is byte-identical to what it always was.
    expect(assembly.body).not.toContain('response_format');
  });
});

describe('provider route generalization', () => {
  const SESSION = randomUUID();

  function liveRequest(): GenerateOptions {
    return { ...request(), provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL };
  }

  it('keys the two remote routes by how they are reached, and never by a model', () => {
    expect(Object.keys(PROVIDER_ROUTE_PROFILES).sort()).toEqual(['deepseek-open-platform', 'opencode-go']);
    expect(DEEPSEEK_ROUTE_PROFILE).toMatchObject({
      route: DEEPSEEK_ROUTE, endpoint: DEEPSEEK_ENDPOINT,
      credentialSlot: 'deepseek-api-key', dshAttribution: true, sessionHeader: false,
    });
    expect(OPENCODE_GO_ROUTE_PROFILE).toMatchObject({
      route: OPENCODE_GO_ROUTE, endpoint: OPENCODE_GO_ENDPOINT,
      credentialSlot: 'opencode-go', dshAttribution: false, sessionHeader: true,
    });
    // A route knows nothing about a model: the gateway serves seven vendors' through one endpoint.
    for (const profile of Object.values(PROVIDER_ROUTE_PROFILES)) {
      expect(profile).not.toHaveProperty('model');
      expect(profile).not.toHaveProperty('bodyPolicy');
    }
    // The bare Go model id: no provider prefix of any kind.
    expect(OPENCODE_GO_MODEL).toBe('deepseek-v4-flash');
    expect(OPENCODE_GO_ENDPOINT).toBe('https://opencode.ai/zen/go/v1/chat/completions');
  });

  it('assembles the opencode-go body as a standard chat completion with no DeepSeek-specific parameters', () => {
    const assembly = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, liveRequest(), {
      attribution: attributionHeaders(), promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, sessionId: SESSION,
    });
    expect(assembly.url).toBe(OPENCODE_GO_ENDPOINT);
    expect(JSON.parse(assembly.body)).toEqual({
      messages: [{ content: SYSTEM, role: 'system' }, { content: UNIT, role: 'user' }],
      model: 'deepseek-v4-flash',
      // The one constraint this profile declares, on the evidence of `S40/reanalyze-range/1`.
      response_format: { type: 'json_object' },
      stream: false,
    });
    expect(assembly.body).toBe(OPENCODE_GO_REQUEST_BODY);
    expect(assembly.requestDigest).toBe(OPENCODE_GO_REQUEST_DIGEST);
    expect(assembly.body).toContain('"response_format":{"type":"json_object"}');
    expect(assembly.body).not.toContain('thinking');
    expect(assembly.body).not.toContain('reasoning_effort');
    expect(assembly.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      [OPENCODE_GO_SESSION_HEADER]: SESSION,
      'user-agent': OPENCODE_GO_USER_AGENT,
    });
    expect(OPENCODE_GO_USER_AGENT).toMatch(/AI7/u);
    expect(OPENCODE_GO_USER_AGENT).toMatch(/developer-live/u);
    expect(assembly.headers).not.toHaveProperty('authorization');
  });

  it('refuses to assemble the session-bearing route without a Session id', () => {
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, liveRequest(), {
      attribution: attributionHeaders(), promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
    })).toThrowError(/PROVIDER_REQUEST_SESSION_ABSENT/u);
  });

  it('transmits the live route with the bearer, the Session header, and the bound slot only', async () => {
    const calls: Array<{ url: string; init: Parameters<DeepSeekTransport>[1] }> = [];
    const liveBinding = { ...slotBinding, slot: 'opencode-go' as const };
    const broker = new CredentialBroker({ resolve: async () => 'placeholder-secret' });
    let ticket: TransmitTicket | null = ticketFor();
    const instance = new DeepSeekOpenAiCompatibleAdapter({
      broker,
      slotBinding: liveBinding,
      tickets: { take: () => { const current = ticket; ticket = null; return current; } },
      attribution: () => attributionHeaders(),
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      codes,
      profile: OPENCODE_GO_ROUTE_PROFILE,
      modelProfile: OPENCODE_GO_V4_FLASH_PROFILE,
      sessionId: () => SESSION,
      transport: async (url, init) => {
        calls.push({ url, init });
        return { status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }) };
      },
    });
    const chunks = await collect(instance.stream(liveRequest()));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(OPENCODE_GO_ENDPOINT);
    expect(calls[0]!.init.headers.authorization).toBe('Bearer placeholder-secret');
    expect(calls[0]!.init.headers[OPENCODE_GO_SESSION_HEADER]).toBe(SESSION);
    expect(calls[0]!.init.body).not.toContain('placeholder-secret');
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } });
    expect(instance.transmissions).toBe(1);
    // The production route is not this adapter's route: a production request is refused, not retargeted.
    const production = await collect(instance.stream(request()));
    expect(production).toEqual([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '适配器只服务其绑定路由与模型。' } } }]);
  });

  it('refuses a profile whose slot is not the bound slot, and a session route with no Session source', () => {
    const deps = {
      broker: new CredentialBroker({ resolve: async () => null }),
      tickets: { take: () => null },
      attribution: () => attributionHeaders(),
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      codes,
    };
    expect(() => new DeepSeekOpenAiCompatibleAdapter({ ...deps, slotBinding, profile: OPENCODE_GO_ROUTE_PROFILE, sessionId: () => SESSION }))
      .toThrowError(/PROVIDER_ROUTE_SLOT_MISMATCH/u);
    expect(() => new DeepSeekOpenAiCompatibleAdapter({ ...deps, slotBinding: { ...slotBinding, slot: 'opencode-go' }, profile: OPENCODE_GO_ROUTE_PROFILE }))
      .toThrowError(/PROVIDER_ROUTE_SESSION_SOURCE_ABSENT/u);
  });
});

describe('model capability profiles', () => {
  /** A test-local profile: the live one with some capabilities restated, so a case may declare what no shipped profile does. */
  const shape = (capabilities: Partial<ProviderModelProfile['capabilities']>): ProviderModelProfile => ({
    ...OPENCODE_GO_V4_FLASH_PROFILE,
    capabilities: { ...OPENCODE_GO_V4_FLASH_PROFILE.capabilities, ...capabilities },
  });

  it('keys every model by route and model, so one model id behind two routes is two profiles', () => {
    expect(Object.keys(PROVIDER_MODEL_PROFILES).sort()).toEqual([
      'deepseek-open-platform/deepseek-v4-pro', 'opencode-go/deepseek-v4-flash', 'opencode-go/deepseek-v4-pro',
    ]);
    expect(modelProfileFor(DEEPSEEK_ROUTE, DEEPSEEK_MODEL)).toBe(DEEPSEEK_V4_PRO_PROFILE);
    expect(modelProfileFor(OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL)).toBe(OPENCODE_GO_V4_FLASH_PROFILE);
    expect(modelProfileFor(OPENCODE_GO_ROUTE, 'a-model-nobody-declared')).toBeNull();
    // The same model id, two routes, two different sets of capabilities: the reason the key is composite.
    expect(OPENCODE_GO_V4_PRO_PROFILE.model).toBe(DEEPSEEK_V4_PRO_PROFILE.model);
    expect(OPENCODE_GO_V4_PRO_PROFILE.capabilities).not.toEqual(DEEPSEEK_V4_PRO_PROFILE.capabilities);
  });

  it('declares each active model as one exact combination of the six capabilities', () => {
    expect(DEEPSEEK_V4_PRO_PROFILE.capabilities).toEqual({
      requestShape: 'openai-chat-completions',
      // The production body's `thinking` plus `reasoning_effort`, which is all `bodyPolicy` ever meant.
      reasoningControl: 'deepseek-thinking',
      structuredOutput: 'none',
      answerChannel: 'message-content-string',
      // This route has never transmitted, so nothing about how it answers has been observed.
      reasoningChannel: 'none',
      usageAttribution: 'unknown',
    });
    expect(OPENCODE_GO_V4_FLASH_PROFILE.capabilities).toEqual({
      requestShape: 'openai-chat-completions',
      // No DeepSeek-specific parameter travels to the gateway until one is observed accepted.
      reasoningControl: 'none',
      structuredOutput: 'json-object',
      answerChannel: 'message-content-string',
      reasoningChannel: 'message-reasoning-content',
      usageAttribution: 'includes-reasoning',
    });
  });

  it('declares structured output exactly where one live item observed it accepted, and nowhere else', () => {
    // The live route requires a JSON object because one test item saw the gateway take the field.
    expect(OPENCODE_GO_V4_FLASH_PROFILE.capabilities.structuredOutput).toBe('json-object');
    expect(OPENCODE_GO_V4_FLASH_PROFILE.evidence.structuredOutput).toEqual({
      kind: 'live-test-item', itemIds: ['S40/reanalyze-range/1'], observedOn: '2026-09-08',
    });
    // The production route has never transmitted, so nothing has observed it accept anything.
    expect(DEEPSEEK_V4_PRO_PROFILE.capabilities.structuredOutput).toBe('none');
    expect(DEEPSEEK_V4_PRO_PROFILE.evidence.structuredOutput).toEqual({ kind: 'unverified' });
    // One model id behind the same gateway is not the model that was tested.
    expect(OPENCODE_GO_V4_PRO_PROFILE.capabilities.structuredOutput).toBe('none');
    expect(OPENCODE_GO_V4_PRO_PROFILE.evidence.structuredOutput).toEqual({ kind: 'unverified' });
  });

  it('records how every capability was established, and calls every absent one unverified', () => {
    for (const profile of Object.values(PROVIDER_MODEL_PROFILES)) {
      const capabilities = Object.entries(profile.capabilities) as Array<[keyof typeof profile.capabilities, string]>;
      expect(capabilities).toHaveLength(6);
      for (const [capability, value] of capabilities) {
        const evidence = profile.evidence[capability];
        expect(evidence, `${profile.key} · ${capability}`).toBeDefined();
        // An absent capability is absent because nobody verified it; a present one names a source.
        if (value === 'none' || value === 'unknown') expect(evidence, `${profile.key} · ${capability}`).toEqual({ kind: 'unverified' });
        else expect(evidence.kind, `${profile.key} · ${capability}`).not.toBe('unverified');
      }
    }
    expect(OPENCODE_GO_V4_FLASH_PROFILE.evidence.answerChannel).toMatchObject({ kind: 'live-test-item', observedOn: '2026-09-07' });
    expect(OPENCODE_GO_V4_FLASH_PROFILE.evidence.requestShape).toMatchObject({ kind: 'vendor-documentation', readOn: '2026-09-06' });
    // A capability established later names its own item and date, not the Run that predates it.
    expect(OPENCODE_GO_V4_FLASH_PROFILE.evidence.structuredOutput).toMatchObject({ kind: 'live-test-item', observedOn: '2026-09-08' });
  });

  it('carries an inactive third model of the same gateway with every unverified capability absent', () => {
    expect(OPENCODE_GO_V4_PRO_PROFILE.capabilities).toEqual({
      requestShape: 'openai-chat-completions',
      reasoningControl: 'none',
      structuredOutput: 'none',
      answerChannel: 'none',
      reasoningChannel: 'none',
      usageAttribution: 'unknown',
    });
    // Inactive means inactive: no route profile, no binding, and no policy names it.
    expect(OPENCODE_GO_ROUTE_PROFILE).not.toHaveProperty('model');
    expect(OPENCODE_GO_V4_PRO_PROFILE.key).not.toBe(OPENCODE_GO_V4_FLASH_PROFILE.key);
    // Declaring no answer channel makes it inert rather than accidentally functional.
    expect(normalizeModelResponse(OPENCODE_GO_V4_PRO_PROFILE, { choices: [{ message: { content: '{"ok":true}' } }] }))
      .toEqual({ kind: 'malformed', reason: 'answer-channel-not-declared' });
  });

  it('refuses to assemble a body for a capability no adapter implements', () => {
    const context = { attribution: attributionHeaders(), promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, sessionId: randomUUID() };
    const live = { ...request(), provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL };
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, shape({ requestShape: 'anthropic-messages' }), live, context))
      .toThrowError(/PROVIDER_REQUEST_SHAPE_UNSUPPORTED/u);
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, shape({ requestShape: 'openai-responses' }), live, context))
      .toThrowError(/PROVIDER_REQUEST_SHAPE_UNSUPPORTED/u);
    // Naming a structured-output constraint is not implementing it: only `json-object` is assembled.
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, shape({ structuredOutput: 'json-schema' }), live, context))
      .toThrowError(/PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED/u);
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, shape({ structuredOutput: 'tool-call' }), live, context))
      .toThrowError(/PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED/u);
    expect(() => assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, DEEPSEEK_V4_PRO_PROFILE, live, context))
      .toThrowError(/PROVIDER_MODEL_ROUTE_MISMATCH/u);
  });

  it('requires a JSON object of a profile that declares it, by adding exactly one field to the body', () => {
    const context = { attribution: attributionHeaders(), promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, sessionId: randomUUID() };
    const live = { ...request(), provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL };
    // The shipped live profile against the same profile declaring nothing: the bytes this route sent
    // before test item `S40/reanalyze-range/1` moved its pin, and the bytes it sends now.
    const asked = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, shape({ structuredOutput: 'none' }), live, context);
    const required = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, live, context);
    const askedBody = JSON.parse(asked.body) as Record<string, unknown>;
    // The whole difference, stated as a difference: the `none` body plus `response_format`, nothing else.
    expect(JSON.parse(required.body)).toEqual({ ...askedBody, response_format: { type: 'json_object' } });
    // The chat-completions spelling on the wire, not a paraphrase of it.
    expect(required.body).toContain('"response_format":{"type":"json_object"}');
    expect(required.url).toBe(asked.url);
    expect(required.headers).toEqual(asked.headers);
    // Different bytes are a different request: the declaring profile pays for the constraint in its digest.
    expect(required.requestDigest).not.toBe(asked.requestDigest);
    // A profile that declares nothing sends nothing, which is why the production route is untouched.
    expect(asked.body).not.toContain('response_format');
    expect(assembleDeepSeekRequest(request(), attributionHeaders(), BASELINE_PROMPT_CONTRACT_DIGEST).requestDigest).toBe(PRODUCTION_REQUEST_DIGEST);
  });
});

describe('normalizeModelResponse', () => {
  const answered = (content: string, reasoning?: string) => ({
    choices: [{ message: { content, ...(reasoning === undefined ? {} : { reasoning_content: reasoning }) } }],
    usage: { prompt_tokens: 11, completion_tokens: 7 },
  });

  it('separates an empty answer from an answer, and carries whether the model reasoned', () => {
    // The shape the first live Run produced for three of eight units: the channel was there and empty.
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, answered('', '合成推理'))).toEqual({
      kind: 'empty-answer', reasoningPresent: true, usage: { inputTokens: 11, outputTokens: 7 },
    });
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, answered(''))).toEqual({
      kind: 'empty-answer', reasoningPresent: false, usage: { inputTokens: 11, outputTokens: 7 },
    });
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, answered('{"ok":true}'))).toMatchObject({ kind: 'answer', text: '{"ok":true}' });
    // Whitespace is an answer, not an empty one: only the contract may judge whether it parses.
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, answered(' '))).toMatchObject({ kind: 'answer', text: ' ' });
  });

  it('names which declared channel a malformed response failed to match', () => {
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, null)).toEqual({ kind: 'malformed', reason: 'response-not-a-record' });
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, { choices: 'not-an-array' })).toEqual({ kind: 'malformed', reason: 'response-not-a-record' });
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, { choices: [] })).toEqual({ kind: 'malformed', reason: 'choice-absent' });
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, { choices: [{ message: {} }] })).toEqual({ kind: 'malformed', reason: 'answer-channel-absent' });
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, { choices: [{ message: { content: [{ type: 'text' }] } }] }))
      .toEqual({ kind: 'malformed', reason: 'answer-channel-absent' });
  });

  it('is callable with a response body alone, with no adapter, transport, credential, or Run', () => {
    // What makes replaying a past response possible at all: one function, one profile, one body.
    expect(normalizeModelResponse(OPENCODE_GO_V4_FLASH_PROFILE, { choices: [{ message: { content: '' } }] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
  });
});

describe('parseProviderResponse', () => {
  const parse = (status: number, body: unknown, model: ProviderModelProfile = DEEPSEEK_V4_PRO_PROFILE) =>
    parseProviderResponse(status, body, codes, model.route === DEEPSEEK_ROUTE ? DEEPSEEK_ROUTE_PROFILE : OPENCODE_GO_ROUTE_PROFILE, model);

  it('parses synthetic success with cache-adjusted usage', () => {
    const parsed = parse(200, {
      choices: [{ message: { content: '{"ok":true}', reasoning_content: '合成推理' } }],
      usage: { prompt_tokens: 120, completion_tokens: 30, prompt_cache_hit_tokens: 20, completion_tokens_details: { reasoning_tokens: 12 } },
    });
    expect(parsed).toEqual({
      // The production profile declares no reasoning channel, so a field it never verified is not read.
      kind: 'answer', text: '{"ok":true}', reasoningText: null,
      usage: { inputTokens: 100, outputTokens: 30, cacheReadTokens: 20, reasoningTokens: 12 },
    });
  });

  it('reads the reasoning channel only for the profile that declares one', () => {
    const body = { choices: [{ message: { content: '{"ok":true}', reasoning_content: '合成推理' } }] };
    expect(parse(200, body, OPENCODE_GO_V4_FLASH_PROFILE)).toMatchObject({ kind: 'answer', reasoningText: '合成推理' });
    expect(parse(200, body, DEEPSEEK_V4_PRO_PROFILE)).toMatchObject({ kind: 'answer', reasoningText: null });
  });

  it('classifies error, quota-exceeded, credential, context, rate-limit, and malformed shapes into the closed code set', () => {
    expect(parse(402, { error: { message: 'Insufficient Balance', type: 'unknown_error' } })).toMatchObject({ kind: 'failure', code: QUOTA_EXCEEDED_CODE, status: 402 });
    expect(parse(400, { error: { type: 'insufficient_quota', message: 'quota exceeded' } })).toMatchObject({ kind: 'failure', code: QUOTA_EXCEEDED_CODE });
    expect(parse(401, { error: { message: 'Authentication Fails' } })).toMatchObject({ kind: 'failure', code: INVALID_CREDENTIAL_CODE });
    expect(parse(400, { error: { message: "This model's maximum context length is 128000 tokens" } })).toMatchObject({ kind: 'failure', code: CONTEXT_WINDOW_EXCEEDED_CODE });
    expect(parse(429, { error: { message: 'Rate limit reached' } })).toMatchObject({ kind: 'failure', code: AI7_FAILURE_CODES.RATE_LIMIT });
    expect(parse(500, { error: { message: 'server' } })).toMatchObject({ kind: 'failure', code: AI7_FAILURE_CODES.PROVIDER_ERROR });
    expect(parse(200, { choices: [] })).toMatchObject({ kind: 'malformed', reason: 'choice-absent' });
    expect(parse(200, null)).toMatchObject({ kind: 'malformed', reason: 'response-not-a-record' });
  });

  it('classifies interrupted and denied transports', () => {
    expect(classifyTransportError(Object.assign(new Error('abort'), { name: 'AbortError' }))).toEqual({ code: AI7_FAILURE_CODES.INTERRUPTED, message: '请求被中断。' });
    expect(classifyTransportError({ code: NETWORK_DENIED_CODE })).toMatchObject({ code: NETWORK_DENIED_CODE });
    expect(classifyTransportError(new Error('x'))).toMatchObject({ code: AI7_FAILURE_CODES.TRANSPORT_FAILED });
  });
});

describe('DeepSeekOpenAiCompatibleAdapter.stream', () => {
  it('never transmits without a transmit-remote ticket and records the assembled request digest', async () => {
    const calls: unknown[] = [];
    const { adapter: instance, broker } = adapter({ ticket: null, secret: 'placeholder', transport: async (url) => { calls.push(url); return { status: 200, json: async () => ({}) }; } });
    const chunks = await collect(instance.stream(request()));
    expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.TRANSMIT_TICKET_ABSENT, message: '没有本步骤的 transmit-remote 决定；未发送任何内容。' } } }]);
    expect(instance.assembledRequestDigests).toHaveLength(1);
    expect(instance.transmissions).toBe(0);
    expect(broker.releaseCount).toBe(0);
    expect(calls).toEqual([]);
  });

  it('injects the placeholder credential only through the broker callback and parses a synthetic success', async () => {
    const { adapter: instance, broker, calls } = adapter({
      ticket: ticketFor(),
      secret: 'placeholder-secret',
      transport: async () => ({ status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }) }),
    });
    const chunks = await collect(instance.stream(request()));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(DEEPSEEK_ENDPOINT);
    expect(calls[0]!.init.headers.authorization).toBe('Bearer placeholder-secret');
    expect(calls[0]!.init.headers['user-agent']).toMatch(/\S/u);
    expect(calls[0]!.init.headers['content-type']).toBe('application/json');
    expect(calls[0]!.init.body).not.toContain('placeholder-secret');
    expect(instance.transmissions).toBe(1);
    expect(broker.releaseCount).toBe(1);
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } });
    expect(chunks.find((chunk) => chunk.type === 'usage')).toEqual({ type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } });
    expect(chunks.find((chunk) => chunk.type === 'block-end')).toEqual({ type: 'block-end', index: 0, block: { type: 'text', text: '{"ok":true}' } });
  });

  it('turns quota, error, and interrupted transport shapes into terminal failure chunks', async () => {
    const quota = adapter({ ticket: ticketFor(), secret: 'placeholder', transport: async () => ({ status: 402, json: async () => ({ error: { message: 'Insufficient Balance' } }) }) });
    expect((await collect(quota.adapter.stream(request()))).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: QUOTA_EXCEEDED_CODE, status: 402 } } });
    const interrupted = adapter({ ticket: ticketFor(), secret: 'placeholder', transport: async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); } });
    expect((await collect(interrupted.adapter.stream(request()))).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'aborted', failure: { code: AI7_FAILURE_CODES.INTERRUPTED } } });
    const wrongBinding = adapter({ ticket: ticketFor('f'.repeat(64)), secret: 'placeholder', transport: async () => ({ status: 200, json: async () => ({}) }) });
    expect((await collect(wrongBinding.adapter.stream(request()))).at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.TRANSMIT_TICKET_ABSENT } } });
    expect(wrongBinding.calls).toEqual([]);
  });

  it('carries an empty answer out of band while the stream stays exactly what it was', async () => {
    const { adapter: instance } = adapter({
      ticket: ticketFor(),
      secret: 'placeholder',
      transport: async () => ({ status: 200, json: async () => ({ choices: [{ message: { content: '' } }], usage: { prompt_tokens: 9, completion_tokens: 4 } }) }),
    });
    const chunks = await collect(instance.stream(request()));
    // The event shape is unchanged, because the harness composition and every Journey above it read it.
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '' } },
      { type: 'usage', usage: { inputTokens: 9, outputTokens: 4 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]);
    // The distinction a string cannot carry travels beside it.
    expect(instance.lastCanonicalResult).toMatchObject({ kind: 'empty-answer', reasoningPresent: false });
  });

  it('clears the canonical result at the start of every turn, so a failed turn never reports the last one', async () => {
    const { adapter: instance } = adapter({
      ticket: ticketFor(),
      secret: 'placeholder',
      transport: async () => ({ status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) }),
    });
    expect(instance.lastCanonicalResult).toBeNull();
    await collect(instance.stream(request()));
    expect(instance.lastCanonicalResult).toMatchObject({ kind: 'answer' });
    // A turn with no ticket transmits nothing and therefore has no result of its own to report.
    await collect(instance.stream(request()));
    expect(instance.lastCanonicalResult).toBeNull();
  });

  it('fails a response that matches no declared channel exactly as it did before the channels were declared', async () => {
    const { adapter: instance } = adapter({
      ticket: ticketFor(),
      secret: 'placeholder',
      transport: async () => ({ status: 200, json: async () => ({ choices: [{ message: {} }] }) }),
    });
    const chunks = await collect(instance.stream(request()));
    expect(chunks).toEqual([{
      type: 'finish',
      reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务响应不含可用内容。', status: 200 } },
    }]);
    expect(instance.lastCanonicalResult).toMatchObject({ kind: 'malformed', reason: 'answer-channel-absent' });
  });

  it('opens no socket under v1 with network denial installed: the default transport is denied before any connection', async () => {
    const { adapter: instance } = adapter({ ticket: ticketFor(), secret: 'placeholder' });
    const chunks = await collect(instance.stream(request()));
    expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'error', failure: { code: NETWORK_DENIED_CODE, message: '出站网络在当前产品区间内被禁用。' } } }]);
    expect(classifyModelFailure({ code: NETWORK_DENIED_CODE, message: '' }, codes)).toMatchObject({ signal: 'failed', failureClass: 'network-denied' });
  });
});

describe('classification', () => {
  it('keys failure classes on the DSH constants and the AI7 codes', () => {
    expect(classifyModelFailure({ code: QUOTA_EXCEEDED_CODE, message: '' }, codes)).toMatchObject({ signal: 'failed', failureClass: 'provider-account-limit' });
    expect(classifyModelFailure({ code: INVALID_CREDENTIAL_CODE, message: '' }, codes)).toMatchObject({ failureClass: 'invalid-credential' });
    expect(classifyModelFailure({ code: CONTEXT_WINDOW_EXCEEDED_CODE, message: '' }, codes)).toMatchObject({ failureClass: 'context-window-exceeded' });
    expect(classifyModelFailure({ code: AI7_FAILURE_CODES.INTERRUPTED, message: '' }, codes)).toMatchObject({ signal: 'interrupted', failureClass: 'interrupted' });
    expect(classifyModelFailure({ code: AI7_FAILURE_CODES.EGRESS_REFUSED, message: '' }, codes)).toMatchObject({ signal: 'interrupted', failureClass: 'egress-refused' });
    expect(classifyModelFailure({ code: 'SOMETHING_ELSE', message: '' }, codes)).toMatchObject({ signal: 'failed', failureClass: 'adapter-failure', code: 'SOMETHING_ELSE' });
    expect(QUOTA_EXCEEDED_CODE).toBe('QUOTA');
  });

  it('admits exactly rate limits, transport failures, and 5xx provider errors to the one safe retry (Issue #48)', () => {
    const verdict = (code: string, status?: number) => classifyModelFailure({ code, message: '', ...(status === undefined ? {} : { status }) }, codes);
    expect(RETRY_SAFE_FAILURE_TABLE).toEqual({ RATE_LIMIT: 'any-status', TRANSPORT_FAILED: 'any-status', PROVIDER_ERROR: 'server-status-only' });
    expect(verdict(AI7_FAILURE_CODES.RATE_LIMIT)).toMatchObject({ failureClass: 'rate-limit', retrySafe: true, status: null });
    expect(verdict(AI7_FAILURE_CODES.RATE_LIMIT, 429)).toMatchObject({ retrySafe: true, status: 429 });
    expect(verdict(AI7_FAILURE_CODES.TRANSPORT_FAILED)).toMatchObject({ failureClass: 'adapter-failure', retrySafe: true });
    expect(verdict(AI7_FAILURE_CODES.PROVIDER_ERROR, 500)).toMatchObject({ failureClass: 'adapter-failure', retrySafe: true, status: 500 });
    expect(verdict(AI7_FAILURE_CODES.PROVIDER_ERROR, 503)).toMatchObject({ retrySafe: true, reason: '适配器失败（PROVIDER_ERROR · 503）。' });
    expect(verdict(AI7_FAILURE_CODES.PROVIDER_ERROR, 599)).toMatchObject({ retrySafe: true });
    // A provider error without a server status is not known to be transient.
    expect(verdict(AI7_FAILURE_CODES.PROVIDER_ERROR)).toMatchObject({ retrySafe: false, status: null });
    expect(verdict(AI7_FAILURE_CODES.PROVIDER_ERROR, 400)).toMatchObject({ retrySafe: false });
    expect(verdict(AI7_FAILURE_CODES.PROVIDER_ERROR, 499)).toMatchObject({ retrySafe: false });
    expect(verdict(AI7_FAILURE_CODES.PROVIDER_ERROR, 600)).toMatchObject({ retrySafe: false });
    // Every other class keeps its first-attempt meaning, whatever status it carries.
    for (const code of [
      QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE,
      AI7_FAILURE_CODES.INTERRUPTED, AI7_FAILURE_CODES.EGRESS_REFUSED, AI7_FAILURE_CODES.NETWORK_DENIED, AI7_FAILURE_CODES.FIXTURE_MISMATCH,
      AI7_FAILURE_CODES.INVALID_RESPONSE, AI7_FAILURE_CODES.TRANSMIT_TICKET_ABSENT, 'SYNTHETIC_ADAPTER_FAILURE', 'MAX_TOKENS', 'UNKNOWN',
    ]) {
      expect(verdict(code, 503).retrySafe).toBe(false);
      expect(verdict(code).retrySafe).toBe(false);
    }
    expect(isRetrySafeFailure({ code: 'constructor', message: '' })).toBe(false);
    expect(isRetrySafeFailure({ code: AI7_FAILURE_CODES.PROVIDER_ERROR, message: '', status: 503.5 })).toBe(false);
  });

  it('evaluates usage against an explicit Run Budget Ceiling and leaves unset unevaluated', () => {
    const usages = [{ inputTokens: 600_000, outputTokens: 100_000 }, { inputTokens: 250_000, outputTokens: 60_000, reasoningTokens: 40_000 }];
    expect(evaluateRunBudgetCeiling(usages, { kind: 'unset' })).toEqual({ state: 'not-evaluated', ceiling: 'unset', totalTokens: 1_050_000 });
    expect(evaluateRunBudgetCeiling(usages, { kind: 'tokens', maxTotalTokens: 1_000_000 })).toEqual({ state: 'reached', ceiling: 1_000_000, totalTokens: 1_050_000, overrunTokens: 50_000 });
    expect(evaluateRunBudgetCeiling(usages.slice(0, 1), { kind: 'tokens', maxTotalTokens: 1_000_000 })).toEqual({ state: 'within', ceiling: 1_000_000, totalTokens: 700_000, remainingTokens: 300_000 });
    expect(() => evaluateRunBudgetCeiling([], { kind: 'tokens', maxTotalTokens: 0 })).toThrowError(/RUN_BUDGET_CEILING_INVALID/u);
  });
});
