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
  type DeepSeekTransport,
  type ProviderRouteProfile,
} from '../../src/service/provider/deepseek-adapter.js';
import { OPENCODE_GO_V4_FLASH_PROFILE, type ProviderModelProfile } from '../../src/service/provider/model-profile.js';
import { normalizeModelResponse } from '../../src/service/provider/response-normalization.js';
import { OPENCODE_GO_MODEL, OPENCODE_GO_ROUTE, type TransmitTicket } from '../../src/service/provider/egress-gate.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

/**
 * The `google-generate-content` request shape (Issue #362), driven entirely by test-local profiles.
 * No shipped profile declares this shape or either of its channels — Gemini is on no OpenCode Go
 * path and its own endpoint waits for the credential slot of plan slot 1c.10 — which is the point:
 * the shape must be exercisable without activating anything, so every case here builds the profile it
 * needs, and the only transport is a stub. No socket, no credential, no Provider.
 */

installNodeNetworkDenial();

const codes = { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE };
const SYSTEM = '合成系统提示。';
const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
const PRIOR = '{"synthetic":"prior"}';
const MAX_OUTPUT_TOKENS = 4096;
const SESSION = randomUUID();
const MODEL_ID = 'synthetic-gemini-model';

/**
 * The models collection the shape's REST contract addresses — `POST .../{model=models/*}:generateContent`
 * — which is what a route reaching this shape declares as its endpoint. Both route profiles below are
 * test-local, because no route ships in this unit: the shipped Go route otherwise, since nothing
 * about reaching a model differs between the shapes, with one declaring a cap and one declaring none.
 */
const GENERATIVE_LANGUAGE_MODELS = 'https://generativelanguage.googleapis.com/v1beta/models';
const CAPPED_ROUTE_PROFILE: ProviderRouteProfile = {
  ...OPENCODE_GO_ROUTE_PROFILE,
  endpoint: GENERATIVE_LANGUAGE_MODELS,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
};
const UNCAPPED_ROUTE_PROFILE: ProviderRouteProfile = { ...OPENCODE_GO_ROUTE_PROFILE, endpoint: GENERATIVE_LANGUAGE_MODELS };

/** A model declaring the fourth shape and whatever the case under test needs beside it. */
function geminiModel(capabilities: Partial<ProviderModelProfile['capabilities']> = {}): ProviderModelProfile {
  return {
    ...OPENCODE_GO_V4_FLASH_PROFILE,
    model: MODEL_ID,
    capabilities: {
      ...OPENCODE_GO_V4_FLASH_PROFILE.capabilities,
      requestShape: 'google-generate-content',
      reasoningControl: 'none',
      structuredOutput: 'none',
      answerChannel: 'candidate-parts-text',
      reasoningChannel: 'none',
      ...capabilities,
    },
  };
}

/** One candidate of the shape's `candidates`, carrying whichever parts the case is about. */
function candidate(...parts: ReadonlyArray<unknown>): Record<string, unknown> {
  return { content: { role: 'model', parts }, finishReason: 'STOP' };
}

const thought = (text: string) => ({ text, thought: true });

function payload(messages?: GenerateOptions['messages']): GenerateOptions {
  return {
    provider: OPENCODE_GO_ROUTE,
    model: OPENCODE_GO_MODEL,
    system: SYSTEM,
    messages: messages ?? [{ id: 'm1' as never, role: 'user', content: [{ type: 'text', text: UNIT }], source: { kind: 'user' } }],
  };
}

const context = { attribution: attributionHeaders(), promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, sessionId: SESSION };

const CONTENTS_BYTES = `"contents":[{"parts":[{"text":${JSON.stringify(UNIT)}}],"role":"user"}]`;
const SYSTEM_INSTRUCTION_BYTES = `"systemInstruction":{"parts":[{"text":"${SYSTEM}"}]}`;

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('assembleProviderRequest · google-generate-content', () => {
  it('assembles the documented fields and nothing else', () => {
    const assembly = assembleProviderRequest(UNCAPPED_ROUTE_PROFILE, geminiModel(), payload(), context);
    expect(JSON.parse(assembly.body)).toEqual({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: UNIT }] }],
    });
    // Field by field, and the bytes themselves: canonical JSON, keys sorted, no field the contract
    // does not name. `safetySettings`, `tools`, `temperature`, the structured-output pair, and
    // `thinkingConfig` are all fields this shape has and this request has no authority to send.
    expect(assembly.body).toBe(`{${CONTENTS_BYTES},${SYSTEM_INSTRUCTION_BYTES}}`);
    for (const field of ['safetySettings', 'tools', 'temperature', 'responseMimeType', 'responseSchema', 'thinkingConfig', 'generationConfig', 'maxOutputTokens']) {
      expect(assembly.body, field).not.toContain(field);
    }
    // The id is addressed in the path on this shape, so it is not a field of the body at all.
    expect(assembly.body).not.toContain('"model":');
    expect(assembly.method).toBe('POST');
    expect(assembly.requestDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(assembly.promptContractDigest).toBe(BASELINE_PROMPT_CONTRACT_DIGEST);
    // The route decides the headers whichever shape the model declares, and never the credential.
    // `x-goog-api-key` is this endpoint's own form, recorded for 1c.10 and implemented by no route here.
    expect(assembly.headers[OPENCODE_GO_SESSION_HEADER]).toBe(SESSION);
    expect(assembly.headers).not.toHaveProperty('authorization');
    expect(assembly.headers).not.toHaveProperty('x-goog-api-key');
  });

  it('sends generationConfig only where the route declares something to put in it', () => {
    const capped = assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel(), payload(), context);
    expect(JSON.parse(capped.body)).toEqual({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: UNIT }] }],
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
    });
    expect(capped.body).toBe(
      `{${CONTENTS_BYTES},"generationConfig":{"maxOutputTokens":${MAX_OUTPUT_TOKENS}},${SYSTEM_INSTRUCTION_BYTES}}`,
    );
    expect(JSON.parse(assembleProviderRequest({ ...CAPPED_ROUTE_PROFILE, maxOutputTokens: 32_768 }, geminiModel(), payload(), context).body))
      .toMatchObject({ generationConfig: { maxOutputTokens: 32_768 } });
    // A route declaring none sends no `generationConfig` key at all rather than an empty object, and
    // the whole difference between the two requests is that one key.
    const uncapped = assembleProviderRequest(UNCAPPED_ROUTE_PROFILE, geminiModel(), payload(), context);
    expect(JSON.parse(capped.body))
      .toEqual({ ...JSON.parse(uncapped.body) as Record<string, unknown>, generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS } });
    expect(uncapped.body).not.toContain('generationConfig');
    expect(uncapped.requestDigest).not.toBe(capped.requestDigest);
  });

  it('carries the system prompt as systemInstruction and never as a contents entry', () => {
    const assembly = assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel(), payload(), context);
    const body = JSON.parse(assembly.body) as { systemInstruction: { parts: Array<{ text: string }> }; contents: Array<{ role: string }> };
    expect(body.systemInstruction.parts).toEqual([{ text: SYSTEM }]);
    expect(body.contents.map((entry) => entry.role)).toEqual(['user']);
    expect(body.contents).not.toContainEqual({ role: 'system', parts: [{ text: SYSTEM }] });
    // The fourth spelling of the one thing the payload carries, from one unchanged
    // AssembledModelPayload: chat completions puts the prompt first in its array, and this shape
    // beside it, in one text part, under a name of its own.
    const chat = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, payload(), context);
    expect((JSON.parse(chat.body) as { messages: Array<{ role: string }> }).messages.map((entry) => entry.role))
      .toEqual(['system', 'user']);
    expect(chat.body).not.toContain('"systemInstruction":');
  });

  it('maps the assistant role to model, keeps the turn order, and omits an absent system prompt', () => {
    const turns: GenerateOptions['messages'] = [
      { id: 'm1' as never, role: 'user', content: [{ type: 'text', text: UNIT }], source: { kind: 'user' } },
      { id: 'm2' as never, role: 'assistant', content: [{ type: 'text', text: PRIOR }], source: { kind: 'model', provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL } },
      { id: 'm3' as never, role: 'user', content: [{ type: 'text', text: '合成后续单元。' }], source: { kind: 'user' } },
    ];
    const assembly = assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel(), { ...payload(turns), system: '' }, context);
    const body = JSON.parse(assembly.body) as Record<string, unknown>;
    expect(body).not.toHaveProperty('systemInstruction');
    // `assistant` is `model` here and `user` is untouched: the mapping is this shape's own, so the
    // payload the other three shapes are assembled from says `assistant` exactly as it did before.
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: UNIT }] },
      { role: 'model', parts: [{ text: PRIOR }] },
      { role: 'user', parts: [{ text: '合成后续单元。' }] },
    ]);
    const responses = assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel({ requestShape: 'openai-responses' }), { ...payload(turns), system: '' }, context);
    expect((JSON.parse(responses.body) as { input: Array<{ role: string }> }).input.map((entry) => entry.role))
      .toEqual(['user', 'assistant', 'user']);
  });

  it('addresses the model in the URL, and refuses an id that cannot stand in a path segment', () => {
    const assembly = assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel(), payload(), context);
    expect(assembly.url).toBe(`${GENERATIVE_LANGUAGE_MODELS}/${MODEL_ID}:generateContent`);
    expect(assembly.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/synthetic-gemini-model:generateContent');
    // The endpoint is the collection and the method is appended to the id; nothing else is read from
    // the route, so declaring one costs no new field.
    expect(assembleProviderRequest({ ...CAPPED_ROUTE_PROFILE, endpoint: 'https://example.invalid/v1/models' }, geminiModel(), payload(), context).url)
      .toBe(`https://example.invalid/v1/models/${MODEL_ID}:generateContent`);
    // An id that would have to be escaped to stand in a path is refused rather than escaped: sending
    // an encoded id would be a request for a model nobody declared.
    for (const model of ['models/gemini-x', 'gemini flash', '../gemini', '', 'gemini/1:generateContent?x=1']) {
      expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, { ...geminiModel(), model }, payload(), context), model)
        .toThrowError(/PROVIDER_MODEL_ID_UNADDRESSABLE/u);
    }
    expect(assembleProviderRequest(CAPPED_ROUTE_PROFILE, { ...geminiModel(), model: 'gemini-3.0-flash_001' }, payload(), context).url)
      .toBe(`${GENERATIVE_LANGUAGE_MODELS}/gemini-3.0-flash_001:generateContent`);
  });

  it('refuses the capability spellings that belong to another shape', () => {
    // `json-object` and `deepseek-thinking` are chat-completions fields. This shape has mechanisms of
    // its own for both — `generationConfig.responseMimeType` with `responseSchema`, and
    // `generationConfig.thinkingConfig` — and neither is implemented, so declaring either here
    // refuses rather than sending the endpoint a spelling nobody documented.
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel({ structuredOutput: 'json-object' }), payload(), context))
      .toThrowError(/PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED/u);
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel({ structuredOutput: 'json-schema' }), payload(), context))
      .toThrowError(/PROVIDER_STRUCTURED_OUTPUT_UNSUPPORTED/u);
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel({ reasoningControl: 'deepseek-thinking' }), payload(), context))
      .toThrowError(/PROVIDER_REASONING_CONTROL_UNSUPPORTED/u);
    // A shape no profile in the table declares still refuses: a profile is data, and the union cannot
    // rule one out at runtime.
    expect(() => assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel({ requestShape: 'a-shape-nobody-declared' as ProviderModelProfile['capabilities']['requestShape'] }), payload(), context))
      .toThrowError(/PROVIDER_REQUEST_SHAPE_UNSUPPORTED/u);
    // And the route bound to the model is still checked before anything is assembled or addressed.
    expect(() => assembleProviderRequest(DEEPSEEK_ROUTE_PROFILE, geminiModel(), payload(), context))
      .toThrowError(/PROVIDER_MODEL_ROUTE_MISMATCH/u);
  });

  it('leaves the three shapes before it exactly where they were, url and body', () => {
    const chat = assembleProviderRequest(OPENCODE_GO_ROUTE_PROFILE, OPENCODE_GO_V4_FLASH_PROFILE, payload(), context);
    expect(JSON.parse(chat.body)).toEqual({
      messages: [{ content: SYSTEM, role: 'system' }, { content: UNIT, role: 'user' }],
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      stream: false,
    });
    expect(chat.url).toBe(OPENCODE_GO_ROUTE_PROFILE.endpoint);
    const messages = assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel({ requestShape: 'anthropic-messages', answerChannel: 'content-text-blocks' }), payload(), context);
    expect(JSON.parse(messages.body)).toEqual({
      model: MODEL_ID,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM,
      messages: [{ role: 'user', content: UNIT }],
    });
    const responses = assembleProviderRequest(CAPPED_ROUTE_PROFILE, geminiModel({ requestShape: 'openai-responses', answerChannel: 'output-message-text' }), payload(), context);
    expect(JSON.parse(responses.body)).toEqual({
      model: MODEL_ID,
      instructions: SYSTEM,
      input: [{ role: 'user', content: UNIT }],
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });
    // The URL rule belongs to the one shape that addresses its model in the path: on the other three
    // the request still goes to the route's endpoint, byte for byte, whatever the endpoint is.
    expect(messages.url).toBe(GENERATIVE_LANGUAGE_MODELS);
    expect(responses.url).toBe(GENERATIVE_LANGUAGE_MODELS);
  });
});

describe('normalizeModelResponse · candidate-parts-text', () => {
  const model = geminiModel();
  const reasoningModel = geminiModel({ reasoningChannel: 'candidate-thought-parts' });

  it('reads the answer across every part of the first candidate, in order, with usage', () => {
    expect(normalizeModelResponse(model, {
      candidates: [candidate({ text: '{"ok":' }, { text: 'true}' })],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 },
    })).toEqual({ kind: 'answer', text: '{"ok":true}', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    // A thought part beside the answer is not answer text, whether or not the channel is declared:
    // the flag is what separates them, and the text beside the flag is never read.
    expect(normalizeModelResponse(reasoningModel, { candidates: [candidate(thought('合成推理'), { text: '答案' })] }))
      .toEqual({ kind: 'answer', text: '答案', reasoningText: null, usage: null });
    expect(normalizeModelResponse(model, { candidates: [candidate(thought('合成推理'), { text: '答案' })] }))
      .toMatchObject({ kind: 'answer', text: '答案' });
    // Only the first candidate answers: a second is a different answer, not more of this one.
    expect(normalizeModelResponse(model, { candidates: [candidate({ text: '第一' }), candidate({ text: '第二' })] }))
      .toMatchObject({ kind: 'answer', text: '第一' });
    // Whitespace is an answer, exactly as it is on the three shapes before it: only the contract may judge it.
    expect(normalizeModelResponse(model, { candidates: [candidate({ text: ' ' })] })).toMatchObject({ kind: 'answer', text: ' ' });
  });

  it('separates an empty answer from an answer and carries whether the model reasoned', () => {
    // The model thought and said nothing: thought parts only, and no answer text at all.
    expect(normalizeModelResponse(reasoningModel, {
      candidates: [candidate(thought('合成推理'))],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 0 },
    })).toEqual({ kind: 'empty-answer', reasoningPresent: true, usage: { inputTokens: 11, outputTokens: 0 } });
    // A candidate that carries no parts, an empty part list, or an empty text part hands the contract
    // layer the same `''`, so all three are the one outcome.
    expect(normalizeModelResponse(reasoningModel, { candidates: [candidate()] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    expect(normalizeModelResponse(reasoningModel, { candidates: [{ finishReason: 'SAFETY' }] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    expect(normalizeModelResponse(reasoningModel, { candidates: [{ content: { role: 'model' } }] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    expect(normalizeModelResponse(reasoningModel, { candidates: [candidate({ text: '' })] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // Presence is read only where the channel is declared: an undeclared channel reports nothing.
    expect(normalizeModelResponse(model, { candidates: [candidate(thought('合成推理'))] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
  });

  it('names a response that carries no candidate at all', () => {
    expect(normalizeModelResponse(model, { promptFeedback: { blockReason: 'SAFETY' } }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    // An empty array is where this shape parts company with the one before it: no candidate is not an
    // empty answer, and a blocked prompt is exactly what returns none. `promptFeedback` is not read,
    // so the reason names what the response lacked rather than why the vendor withheld it — the
    // reading the first live item on this shape should confirm.
    expect(normalizeModelResponse(model, { candidates: [], promptFeedback: { blockReason: 'SAFETY' } }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, { candidates: 'not-an-array' })).toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, { candidates: [null] })).toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, null)).toEqual({ kind: 'malformed', reason: 'response-not-a-record' });
    // None of the three shapes before it is this shape, and each of their bodies is read as such.
    expect(normalizeModelResponse(model, { choices: [{ message: { content: '{"ok":true}' } }] }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, { content: [{ type: 'text', text: '{"ok":true}' }] }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    // Declaring no answer channel still refuses first, whichever shape the model requests.
    expect(normalizeModelResponse(geminiModel({ answerChannel: 'none' }), { candidates: [candidate({ text: '答案' })] }))
      .toEqual({ kind: 'malformed', reason: 'answer-channel-not-declared' });
  });

  it('reads usage from usageMetadata, and the reasoning count only when it is one', () => {
    const answered = (usageMetadata: unknown) => normalizeModelResponse(model, { candidates: [candidate({ text: 'x' })], usageMetadata });
    expect(answered({ promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 12, totalTokenCount: 162 }))
      .toMatchObject({ usage: { inputTokens: 120, outputTokens: 30, reasoningTokens: 12 } });
    // Without the count there is nothing to carry, and none is invented: the whole usage, stated
    // exactly, so a reasoning count that appeared from nowhere would fail here.
    expect(answered({ promptTokenCount: 120, candidatesTokenCount: 30 }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    expect(answered({ promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: -1 }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    expect(answered({ promptTokenCount: 5 })).toMatchObject({ kind: 'answer', usage: null });
    expect(answered({ promptTokenCount: -1, candidatesTokenCount: 2 })).toMatchObject({ kind: 'answer', usage: null });
    expect(answered({ promptTokenCount: 0, candidatesTokenCount: 0 })).toMatchObject({ usage: { inputTokens: 0, outputTokens: 0 } });
    expect(normalizeModelResponse(model, { candidates: [candidate({ text: 'x' })] })).toMatchObject({ usage: null });
    // The cache accounting nothing has observed on this vendor is not read, and the total is a sum of
    // counts already carried rather than a count of its own: the input count passes through untouched.
    expect(answered({ promptTokenCount: 120, candidatesTokenCount: 30, cachedContentTokenCount: 100, totalTokenCount: 150 }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
  });
});

describe('DeepSeekOpenAiCompatibleAdapter · google-generate-content', () => {
  function instanceFor(model: ProviderModelProfile, transport: DeepSeekTransport): DeepSeekOpenAiCompatibleAdapter {
    let ticket: TransmitTicket | null = { decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) };
    return new DeepSeekOpenAiCompatibleAdapter({
      broker: new CredentialBroker({ resolve: async () => 'placeholder-secret' }),
      slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Main Editorial Role', slot: 'opencode-go', credentialReference: randomUUID() },
      tickets: { take: () => { const current = ticket; ticket = null; return current; } },
      attribution: () => attributionHeaders(),
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      codes,
      profile: CAPPED_ROUTE_PROFILE,
      modelProfile: model,
      sessionId: () => SESSION,
      transport,
    });
  }

  it('streams the shape through the unchanged event contract with a stub transport', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const model = geminiModel({ reasoningChannel: 'candidate-thought-parts' });
    const instance = instanceFor(model, async (url, init) => {
      calls.push({ url, body: init.body });
      return {
        status: 200,
        json: async () => ({
          candidates: [candidate(thought('合成推理'), { text: '{"ok":true}' })],
          usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4, thoughtsTokenCount: 3, totalTokenCount: 16 },
        }),
      };
    });
    const chunks = await collect(instance.stream({ ...payload(), model: model.model }));
    expect(calls).toHaveLength(1);
    // The transport is handed the derived address, not the collection the route declares.
    expect(calls[0]!.url).toBe(`${GENERATIVE_LANGUAGE_MODELS}/${MODEL_ID}:generateContent`);
    expect(calls[0]!.body).toContain(`"generationConfig":{"maxOutputTokens":${MAX_OUTPUT_TOKENS}}`);
    expect(calls[0]!.body).toContain('"systemInstruction"');
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

  it('fails a response of this shape that carried no candidate, exactly as the other shapes do', async () => {
    const model = geminiModel();
    const instance = instanceFor(model, async () => ({ status: 200, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) }));
    const chunks = await collect(instance.stream({ ...payload(), model: model.model }));
    expect(chunks).toEqual([{
      type: 'finish',
      reason: { kind: 'error', failure: { code: AI7_FAILURE_CODES.INVALID_RESPONSE, message: '模型服务响应不含可用内容。', status: 200 } },
    }]);
    expect(instance.lastCanonicalResult).toMatchObject({ kind: 'malformed', reason: 'candidate-absent' });
  });

  it('streams a candidate that answered nothing as the empty answer the layers above already handle', async () => {
    const model = geminiModel({ reasoningChannel: 'candidate-thought-parts' });
    const instance = instanceFor(model, async () => ({ status: 200, json: async () => ({ candidates: [candidate(thought('合成推理'))] }) }));
    const chunks = await collect(instance.stream({ ...payload(), model: model.model }));
    // The event shape is unchanged and the empty answer travels out of band, where a string cannot
    // lose it: that the model reasoned and answered nothing is a fact the execution owner reads.
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]);
    expect(instance.lastCanonicalResult).toEqual({ kind: 'empty-answer', reasoningPresent: true, usage: null });
  });
});
