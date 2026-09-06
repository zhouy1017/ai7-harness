import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE, attributionHeaders } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { AI7_FAILURE_CODES, RETRY_SAFE_FAILURE_TABLE, classifyModelFailure, evaluateRunBudgetCeiling, isRetrySafeFailure } from '../../src/service/provider/classification.js';
import { CredentialBroker, type CredentialSlotBinding } from '../../src/service/provider/credential-broker.js';
import {
  DEEPSEEK_ENDPOINT,
  DeepSeekOpenAiCompatibleAdapter,
  assembleDeepSeekRequest,
  classifyTransportError,
  parseDeepSeekResponse,
  type DeepSeekTransport,
} from '../../src/service/provider/deepseek-adapter.js';
import { DEEPSEEK_MODEL, DEEPSEEK_ROUTE, type TransmitTicket } from '../../src/service/provider/egress-gate.js';
import { NETWORK_DENIED_CODE, installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// The remote path is complete but never transmits under v1. Every credential here is a placeholder
// supplied by a fake resolver; no real secret, socket, or Provider is involved.

installNodeNetworkDenial();

const codes = { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE };
const SYSTEM = '合成系统提示。';
const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;

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
});

describe('parseDeepSeekResponse', () => {
  it('parses synthetic success with cache-adjusted usage and reasoning text', () => {
    const parsed = parseDeepSeekResponse(200, {
      choices: [{ message: { content: '{"ok":true}', reasoning_content: '合成推理' } }],
      usage: { prompt_tokens: 120, completion_tokens: 30, prompt_cache_hit_tokens: 20, completion_tokens_details: { reasoning_tokens: 12 } },
    }, codes);
    expect(parsed).toEqual({
      kind: 'success', text: '{"ok":true}', reasoningText: '合成推理',
      usage: { inputTokens: 100, outputTokens: 30, cacheReadTokens: 20, reasoningTokens: 12 },
    });
  });

  it('classifies error, quota-exceeded, credential, context, rate-limit, and malformed shapes into the closed code set', () => {
    expect(parseDeepSeekResponse(402, { error: { message: 'Insufficient Balance', type: 'unknown_error' } }, codes)).toMatchObject({ kind: 'failure', code: QUOTA_EXCEEDED_CODE, status: 402 });
    expect(parseDeepSeekResponse(400, { error: { type: 'insufficient_quota', message: 'quota exceeded' } }, codes)).toMatchObject({ kind: 'failure', code: QUOTA_EXCEEDED_CODE });
    expect(parseDeepSeekResponse(401, { error: { message: 'Authentication Fails' } }, codes)).toMatchObject({ kind: 'failure', code: INVALID_CREDENTIAL_CODE });
    expect(parseDeepSeekResponse(400, { error: { message: "This model's maximum context length is 128000 tokens" } }, codes)).toMatchObject({ kind: 'failure', code: CONTEXT_WINDOW_EXCEEDED_CODE });
    expect(parseDeepSeekResponse(429, { error: { message: 'Rate limit reached' } }, codes)).toMatchObject({ kind: 'failure', code: AI7_FAILURE_CODES.RATE_LIMIT });
    expect(parseDeepSeekResponse(500, { error: { message: 'server' } }, codes)).toMatchObject({ kind: 'failure', code: AI7_FAILURE_CODES.PROVIDER_ERROR });
    expect(parseDeepSeekResponse(200, { choices: [] }, codes)).toMatchObject({ kind: 'failure', code: AI7_FAILURE_CODES.INVALID_RESPONSE });
    expect(parseDeepSeekResponse(200, null, codes)).toMatchObject({ kind: 'failure', code: AI7_FAILURE_CODES.INVALID_RESPONSE });
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
