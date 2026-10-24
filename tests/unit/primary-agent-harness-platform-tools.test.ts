import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallId, GenerateOptions, LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { describeComposition, prepareExecution, type HarnessTurnOutcome } from '../../src/service/harness/primary-agent-harness.js';
import { AI7_FAILURE_CODES, classifyModelFailure, isRetrySafeFailure } from '../../src/service/provider/classification.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, evaluateEgress, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { PLATFORM_TOOL_SCHEMAS, PLATFORM_TOOL_SCHEMA_DIGEST, PlatformToolBreaker, readPlatformToolsRule, type PlatformToolsRule } from '../../src/service/provider/platform-tools.js';
import type { PlatformToolFetch } from '../../src/service/provider/platform-tool-http.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { LOCAL_TOOL_DECLARATION_NAMES, readLocalToolsRule } from '../../src/service/provider/local-tools.js';
import { RetrievalIndex } from '../../src/service/retrieval/index.js';
import { PROVIDER_LEDGER_FILE, ProviderResultCache, isItemLine } from '../../src/service/provider/provider-result-cache.js';
import { ResearchSnapshotCache } from '../../src/service/provider/research-snapshot-cache.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// The platform tools end to end inside the real pinned DSH composition (ADR 0080 §7; Issue #473, S87-f3a): the harness
// registers the two tools only for an owner, the owner decides each call through the Egress Gate and forwards it once
// over a stub transport, and the gate admits the result back into the next model call by call id, URL, digest, and byte
// count. The rule is v7's block, which no active set selects; under the selected v5 the owner cannot be constructed at
// all, and a composition without it registers zero tools with the digest every frozen plan pins.

installNodeNetworkDenial();

const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SYSTEM = '合成系统提示。';
const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
const SEARCH_TEXT = '《狂人日记》1918 年 5 月发表于《新青年》。来源 https://example.org/source';
const ANSWER = '{"schema":"answer"}';
let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai7-platform-tools-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function ruleOf(version: 'v5' | 'v7'): Promise<PlatformToolsRule | null> {
  const document = JSON.parse(await readFile(resolve(REPO_ROOT, `docs/policies/provider-processing-policy.${version}.json`), 'utf8')) as {
    decision: { providerAllowRules: unknown[] };
  };
  return readPlatformToolsRule(document.decision.providerAllowRules[0]) as PlatformToolsRule | null;
}

function bindingOf(rule: PlatformToolsRule | null, digest: string): EgressBindingFacts {
  return {
    bindingDigest: digest,
    route: LOCAL_DETERMINISTIC_ROUTE,
    model: LOCAL_DETERMINISTIC_MODEL,
    systemPrompt: SYSTEM,
    outboundDataCategory: 'public-or-synthetic',
    policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v8', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
    admittedUserMessages: new Set([UNIT]),
    platformTools: rule,
  };
}

/** A stub model: it asks for one search, then answers once the search result is in its history. */
class SearchingModel implements LlmAdapter {
  readonly requests: GenerateOptions[] = [];
  /** Search again after every result instead of answering, each time with a new query. */
  looping = false;
  #calls = 0;

  providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'stub' };
  }

  providerRetryPolicy(): undefined {
    return undefined;
  }

  listModels(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: 'stub', inputModalities: ['text'] });
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const last = options.messages.at(-1)!;
    if (last.source.kind === 'tool' && !this.looping) {
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: ANSWER };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: ANSWER } };
      yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 4 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
      return;
    }
    this.#calls += 1;
    const id = `call_${this.#calls}` as CallId;
    const args = this.looping ? `{"query":"狂人日记 第 ${this.#calls} 次"}` : '{"query":"狂人日记 发表 年份"}';
    yield { type: 'block-start', index: 0, blockType: 'tool-call' };
    yield { type: 'tool-call-delta', index: 0, id, name: 'websearch', argumentsDelta: args };
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'websearch', arguments: args } };
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 3, cacheReadTokens: 2 } };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
}

/** Raw wire arguments deliberately bypass the object-only fixture serializer; 133 is a finite incoming-bug sentinel. */
class RawToolModel extends SearchingModel {
  constructor(readonly calls: (request: number) => Array<{ name: string; arguments: string; id?: string }>) { super(); }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const calls = this.requests.length < 133 ? this.calls(this.requests.length) : [];
    if (calls.length === 0) {
      yield { type: 'block-end', index: 0, block: { type: 'text', text: ANSWER } };
      yield { type: 'finish', reason: { kind: 'stop' } };
      return;
    }
    for (const [index, call] of calls.entries()) {
      const id = (call.id ?? `raw_${this.requests.length}_${index}`) as CallId;
      yield { type: 'block-start', index, blockType: 'tool-call' };
      yield { type: 'tool-call-delta', index, id, name: call.name, argumentsDelta: call.arguments };
      yield { type: 'block-end', index, block: { type: 'tool-call', id, name: call.name, arguments: call.arguments } };
    }
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
}

const LOCAL_RULE = readLocalToolsRule({ localTools: {
  targetedRetrieval: { allowed: true, source: 'authorized-pinned-sources-only', callsPerUnit: 5, candidatesPerCall: 8, exactFetchRequiredBeforeCitation: true, scope: 'no-egress' },
  breaker: { roundTrips: 128, end: '检索未完成' },
} })!;

async function rawHarness(session: PlatformToolSession, binding: EgressBindingFacts, model: RawToolModel, parallel = false) {
  const decisions: string[] = [];
  const receipts: number[] = [];
  const handle = await prepareExecution({
    sessionId: randomUUID(), route: LOCAL_DETERMINISTIC_ROUTE, model: LOCAL_DETERMINISTIC_MODEL,
    systemPrompt: SYSTEM, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, adapterFactory: () => model,
    ...(binding.platformTools == null ? {} : { platformTools: session }),
    ...(binding.localTools == null ? {} : { localTools: session }),
    ...(parallel ? { compositionOptions: { version: 2 as const, localTools: binding.localTools! }, localToolsRule: binding.localTools! } : {}),
    onTransmitTicket: () => { throw new Error('NO_REMOTE_MODEL'); },
    gate: (payload) => {
      const decision = evaluateEgress(payload, binding, session.egressScope);
      decisions.push(decision.decision === 'refuse' ? `refuse:${decision.reason}` : decision.decision);
      receipts.push(session.egressScope.admittedToolResults!.size);
      return decision;
    },
  });
  handle.bindExecution({ harnessSessionId: handle.sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
  return { handle, decisions, receipts };
}

describe('registered raw-wire failures before the DSH body', () => {
  it.each(['{"query":"x","k":-0}', '{"query":"x","k":1e309}'])('counts local pre-body arguments %s before continuation', async (argumentsText) => {
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const read = vi.fn(() => { throw new Error('NO_SOURCE_READ'); });
    const retrieval = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest: 'a'.repeat(64), read }]);
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, retrieval, purpose: 'raw-wire' });
    const body = vi.spyOn(session, 'execute');
    const model = new RawToolModel(() => [{ name: 'retrieve', arguments: argumentsText }]);
    const { handle, decisions, receipts } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(model.requests).toHaveLength(129);
      expect(decisions).toEqual([...Array<string>(129).fill('transmit-local'), 'refuse:circuit-breaker-tripped']);
      expect(receipts.at(-2)).toBe(128);
      expect(receipts.at(-1)).toBe(129);
      expect(body).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(session.usage).toMatchObject({ retrievalCalls: 129, refusedRetrievalCalls: 129 });
      expect(outcome.terminal).toBe('failed');
      expect(outcome.signals.at(-1)).toMatchObject({ kind: 'failed', failure: { code: AI7_FAILURE_CODES.PLATFORM_TOOL_BREAKER_TRIPPED, failureClass: 'platform-tool-breaker-tripped', retrySafe: false } });
      expect(session.unitEnd(outcome)).toEqual({ reason: 'circuit-breaker-tripped', disclosure: '检索未完成', retry: 'never', settles: 'unit-only' });
      session.startUnit();
      expect(session.egressScope.localBreakerState!()).toBe('intact');
      expect(session.unitEnd(outcome)).toBeNull();
    } finally { await handle.finish(); retrieval.dispose(); }
  });

  it.each([
    ['websearch', '{"query":"x","k":-0}'], ['websearch', '{"query":"x","k":1e309}'],
    ['webfetch', '{"url":"https://example.org/source","k":-0}'], ['webfetch', '{"url":"https://example.org/source","k":1e309}'],
  ])('counts %s pre-body arguments %s without transport or host admission', async (name, argumentsText) => {
    const binding = bindingOf((await ruleOf('v7'))!, 'b'.repeat(64));
    const fetch = vi.fn(async () => { throw new Error('NO_TRANSPORT'); });
    const admitHost = vi.fn(() => { throw new Error('NO_HOST_ADMISSION'); });
    const breaker = new PlatformToolBreaker();
    const observations = vi.spyOn(breaker, 'observe');
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, fetch, admitHost, breaker, purpose: 'raw-wire' });
    const body = vi.spyOn(session, 'execute');
    const model = new RawToolModel(() => [{ name, arguments: argumentsText }]);
    const { handle, decisions, receipts } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(model.requests).toHaveLength(129);
      expect(decisions.at(-1)).toBe('refuse:circuit-breaker-tripped');
      expect(receipts.slice(-2)).toEqual([128, 129]);
      expect(observations).toHaveBeenCalledTimes(129);
      expect(body).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(admitHost).not.toHaveBeenCalled();
      expect(session.egressScope.localBreakerState!()).toBe('intact');
      expect(outcome.terminal).toBe('failed');
      expect(session.unitDisclosure).toBe('联网核查未完成');
      expect(session.unitEnd(outcome)).toEqual({ reason: 'circuit-breaker-tripped', disclosure: '联网核查未完成', retry: 'never', settles: 'unit-only' });
    } finally { await handle.finish(); }
  });

  it('charges a pre-body refusal before the remaining local calls in the same response', async () => {
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const retrieval = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest: 'a'.repeat(64),
      read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: 'x' }] }) }]);
    const reads = vi.spyOn(retrieval, 'retrieve');
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, retrieval, purpose: 'raw-wire' });
    const model = new RawToolModel((request) => request === 1 ? [
      { name: 'retrieve', arguments: '{"query":"x","k":-0}' },
      ...Array.from({ length: 6 }, () => ({ name: 'retrieve', arguments: '{"query":"x","k":1}' })),
    ] : []);
    const { handle } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      expect((await handle.submitUnit(UNIT)).terminal).toBe('completed');
      expect(session.usage).toMatchObject({ retrievalCalls: 7, refusedRetrievalCalls: 3 });
      expect(reads).toHaveBeenCalledTimes(4);
      const results = model.requests[1]!.messages.filter((message) => message.source.kind === 'tool');
      expect(results.map((message) => message.source)).toEqual(Array.from({ length: 7 }, (_, index) => ({ kind: 'tool', callId: `raw_1_${index}` })));
      expect(JSON.stringify(results.slice(-2))).toContain('调用次数已用完');
    } finally { await handle.finish(); retrieval.dispose(); }
  });

  it.each(['{', '[]', '{"query":"x","k":1}'])('counts each body/finalizer pair once for %s', async (argumentsText) => {
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const retrieval = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest: 'a'.repeat(64),
      read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: 'x' }] }) }]);
    const reads = vi.spyOn(retrieval, 'retrieve');
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, retrieval, purpose: 'raw-wire' });
    const model = new RawToolModel(() => [{ name: 'retrieve', arguments: argumentsText }]);
    const { handle, decisions } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(model.requests).toHaveLength(129);
      expect(session.usage.retrievalCalls).toBe(129);
      expect(session.usage.refusedRetrievalCalls).toBe(argumentsText === '{"query":"x","k":1}' ? 124 : 129);
      expect(reads).toHaveBeenCalledTimes(argumentsText === '{"query":"x","k":1}' ? 5 : 0);
      expect(decisions.at(-1)).toBe('refuse:circuit-breaker-tripped');
      expect(session.unitEnd(outcome)?.retry).toBe('never');
    } finally { await handle.finish(); retrieval.dispose(); }
  });

  it.each([false, true])('preserves the first five and model ordering in parallel batches (pre-body error: %s)', async (preBody) => {
    const localTools: NonNullable<EgressBindingFacts['localTools']> = { ...LOCAL_RULE, declarations: LOCAL_TOOL_DECLARATION_NAMES.map((name) => ({ name, readOnly: true, concurrencySafe: true })), parallelCallsAllowed: true };
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools };
    const retrieval = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest: 'a'.repeat(64),
      read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: 'x' }] }) }]);
    const retrieve = retrieval.retrieve.bind(retrieval);
    let active = 0; let peak = 0;
    const reads = vi.spyOn(retrieval, 'retrieve').mockImplementation(async (...args) => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>((done) => setImmediate(done));
      try { return await retrieve(...args); } finally { active--; }
    });
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, retrieval, purpose: 'raw-wire' });
    const model = new RawToolModel((request) => request === 1 ? Array.from({ length: 7 }, (_, index) => ({ name: 'retrieve',
      arguments: preBody && index === 1 ? '{"query":"x","k":-0}' : '{"query":"x","k":1}' })) : []);
    const { handle } = await rawHarness(session, binding, model, true);
    try {
      session.startUnit();
      expect((await handle.submitUnit(UNIT)).terminal).toBe('completed');
      expect(handle.composition.agentLoop.maxParallelToolCalls).toBe(5);
      expect(reads).toHaveBeenCalledTimes(preBody ? 4 : 5);
      if (!preBody) expect(peak).toBe(5);
      expect(session.usage.retrievalCalls).toBe(7);
      expect(session.usage.refusedRetrievalCalls).toBe(preBody ? 3 : 2);
      const results = model.requests[1]!.messages.filter((message) => message.source.kind === 'tool');
      expect(results.map((message) => message.source)).toEqual(Array.from({ length: 7 }, (_, index) => ({ kind: 'tool', callId: `raw_1_${index}` })));
      expect(JSON.stringify(results.slice(5))).toContain('调用次数已用完');
    } finally { await handle.finish(); retrieval.dispose(); }
  });

  it.each(['{"query":"x","k":-0}', '{}'])('counts a reused id with %s before result deduplication and leaves its first receipt intact', async (argumentsText) => {
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, purpose: 'raw-wire' });
    const model = new RawToolModel((request) => [{ name: 'retrieve', id: 'reused', arguments: request === 1 ? '{}' : argumentsText }]);
    const { handle, decisions } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(model.requests).toHaveLength(2);
      expect(decisions.at(-1)).toBe('refuse:payload-out-of-scope');
      expect(session.usage).toMatchObject({ retrievalCalls: 2, refusedRetrievalCalls: 2 });
      expect(session.egressScope.admittedToolResults!.size).toBe(1);
      expect(outcome.terminal).toBe('interrupted');
    } finally { await handle.finish(); }
  });

  it('shares the local quota across declared names after a pre-body error', async () => {
    const localTools: NonNullable<EgressBindingFacts['localTools']> = { ...LOCAL_RULE,
      declarations: LOCAL_TOOL_DECLARATION_NAMES.map((name) => ({ name, readOnly: true, concurrencySafe: true })), parallelCallsAllowed: false };
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools };
    const retrieval = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest: 'a'.repeat(64),
      read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: 'x' }] }) }]);
    const blocks = vi.spyOn(retrieval, 'readBlocks');
    const search = vi.spyOn(retrieval, 'searchManuscript');
    const records = vi.spyOn(retrieval, 'pinnedRecords');
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, retrieval, purpose: 'raw-wire' });
    const model = new RawToolModel((request) => request === 1 ? [
      { name: 'retrieve', arguments: '{"query":"x","k":-0}' },
      { name: 'read_blocks', arguments: '{"blockId":"one","radius":0}' },
      { name: 'search_manuscript', arguments: '{"query":"x","mode":"exact"}' },
      { name: 'baseline_facts', arguments: '{"query":"x"}' }, { name: 'term_table', arguments: '{}' },
      { name: 'read_blocks', arguments: '{"blockId":"one","radius":0}' },
      { name: 'search_manuscript', arguments: '{"query":"x","mode":"exact"}' },
    ] : []);
    const { handle } = await rawHarness(session, binding, model, true);
    try {
      session.startUnit();
      expect((await handle.submitUnit(UNIT)).terminal).toBe('completed');
      expect(blocks).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledTimes(1);
      expect(records).toHaveBeenCalledTimes(2);
      expect(session.usage.refusedRetrievalCalls).toBe(3);
      expect(session.usage.localToolCalls).toEqual({ retrieve: 1, read_blocks: 2, search_manuscript: 2, baseline_facts: 1, term_table: 1 });
    } finally { await handle.finish(); retrieval.dispose(); }
  });

  it('refuses an unknown name before a second submission without giving it a counter owner', async () => {
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, purpose: 'raw-wire' });
    const body = vi.spyOn(session, 'execute');
    const model = new RawToolModel(() => [{ name: 'unknown', arguments: '{}' }]);
    const { handle, decisions } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(model.requests).toHaveLength(1);
      expect(decisions).toEqual(['transmit-local', 'refuse:payload-out-of-scope']);
      expect(body).not.toHaveBeenCalled();
      expect(session.egressScope.admittedToolResults!.size).toBe(0);
      expect(session.usage.retrievalCalls).toBe(0);
      expect(session.egressScope.localBreakerState!()).toBe('intact');
      expect(outcome.terminal).toBe('interrupted');
      expect(outcome.signals.at(-1)).toMatchObject({ kind: 'interrupted', failure: { code: AI7_FAILURE_CODES.EGRESS_REFUSED, failureClass: 'egress-refused' } });
      expect(session.unitEnd(outcome)).toBeNull();
    } finally { await handle.finish(); }
  });

  it.each(['retrieve', 'websearch'] as const)('counts %s body throws and invalid output once, including failures before observation', async (name) => {
    for (const failure of ['before', 'after', 'output']) {
      const binding = name === 'retrieve' ? { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE } : bindingOf((await ruleOf('v7'))!, 'b'.repeat(64));
      const retrieval = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest: 'a'.repeat(64),
        read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: 'x' }] }) }]);
      const reads = vi.spyOn(retrieval, 'retrieve');
      const fetch = vi.fn(async () => new Response(JSON.stringify({ result: { content: [{ type: 'text', text: SEARCH_TEXT }] } }), { status: 200, headers: { 'content-type': 'application/json' } }));
      const breaker = new PlatformToolBreaker();
      const observations = vi.spyOn(breaker, 'observe');
      const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set(), ceilingState: () => 'within' },
        retrieval, fetch, admitHost: () => { throw new Error('NO_HOST'); }, breaker, purpose: 'raw-wire' });
      const execute = session.execute.bind(session);
      vi.spyOn(session, 'execute').mockImplementation(async (call) => {
        if (failure === 'before') throw new Error('synthetic pre-observation failure');
        const result = await execute(call);
        if (failure === 'after') throw new Error('synthetic post-observation failure');
        // Make DSH's real output materialization fail after the body observed the dispatch.
        Reflect.set(result, 'text', Number.NaN);
        return result;
      });
      const model = new RawToolModel((request) => request === 1 ? [{ name, arguments: '{"query":"x"}' }] : []);
      const { handle, decisions } = await rawHarness(session, binding, model);
      try {
        session.startUnit();
        expect((await handle.submitUnit(UNIT)).terminal).toBe('completed');
        expect(decisions).toEqual(['transmit-local', 'transmit-local']);
        expect(model.requests).toHaveLength(2);
        expect(JSON.stringify(model.requests[1]!.messages.at(-1))).toContain('工具调用未完成');
        expect(session.egressScope.admittedToolResults!.size).toBe(1);
        if (name === 'retrieve') {
          expect(session.usage.retrievalCalls).toBe(1);
          expect(reads).toHaveBeenCalledTimes(failure === 'before' ? 0 : 1);
          expect(observations).not.toHaveBeenCalled();
        } else {
          expect(observations).toHaveBeenCalledTimes(1);
          expect(fetch).toHaveBeenCalledTimes(failure === 'before' ? 0 : 1);
          expect(session.egressScope.localBreakerState!()).toBe('intact');
        }
      } finally { await handle.finish(); retrieval.dispose(); }
    }
  });

  it('keeps canonical web deduplication at one send and one observation per body/finalizer pair', async () => {
    const binding = bindingOf((await ruleOf('v7'))!, 'b'.repeat(64));
    const fetch = vi.fn(async () => new Response(JSON.stringify({ result: { content: [{ type: 'text', text: SEARCH_TEXT }] } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const breaker = new PlatformToolBreaker();
    const observations = vi.spyOn(breaker, 'observe');
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set(), ceilingState: () => 'within' }, fetch, admitHost: () => { throw new Error('NO_HOST'); }, breaker, purpose: 'raw-wire' });
    const model = new RawToolModel((request) => [{ name: 'websearch', arguments: request % 2 === 0 ? '{"query":" x "}' : '{"query":"x"}' }]);
    const { handle, decisions } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(model.requests).toHaveLength(129);
      expect(observations).toHaveBeenCalledTimes(129);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(decisions.at(-1)).toBe('refuse:circuit-breaker-tripped');
      expect(session.unitEnd(outcome)?.retry).toBe('never');
      expect(JSON.stringify(model.requests[2]!.messages.at(-1))).toContain('不再重复');
    } finally { await handle.finish(); }
  });

  it('keeps the local and web breakers independent when one owner carries both', async () => {
    const binding = { ...bindingOf((await ruleOf('v7'))!, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const fetch = vi.fn(async () => { throw new Error('NO_TRANSPORT'); });
    const breaker = new PlatformToolBreaker();
    const observations = vi.spyOn(breaker, 'observe');
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, fetch,
      admitHost: () => { throw new Error('NO_HOST'); }, breaker, purpose: 'raw-wire' });
    const model = new RawToolModel(() => [
      { name: 'retrieve', arguments: '{"query":"x","k":-0}' }, { name: 'websearch', arguments: '{"query":"x","k":1e309}' },
    ]);
    const { handle, decisions } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(model.requests).toHaveLength(129);
      expect(observations).toHaveBeenCalledTimes(129);
      expect(session.usage.retrievalCalls).toBe(129);
      expect(session.breakerState).toBe('tripped');
      expect(session.egressScope.localBreakerState!()).toBe('tripped');
      expect(fetch).not.toHaveBeenCalled();
      expect(decisions.at(-1)).toBe('refuse:circuit-breaker-tripped');
      expect(outcome.terminal).toBe('failed');
    } finally { await handle.finish(); }
  });

  it('does not charge or admit late finalized results to a successor unit, or accept a missing dispatch', async () => {
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const retrieval = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest: 'a'.repeat(64),
      read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: 'x' }] }) }]);
    const reads = vi.spyOn(retrieval, 'retrieve');
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, retrieval, purpose: 'raw-wire' });
    const controller = new AbortController();
    const dispatch = { token: Symbol(), active: () => !controller.signal.aborted };
    try {
      session.startUnit();
      const first = await session.execute({ callId: 'old', tool: 'retrieve', arguments: {}, signal: controller.signal, dispatch });
      expect(session.usage.retrievalCalls).toBe(1);
      session.startUnit();
      session.admit({ ...first, callId: 'old', tool: 'retrieve', dispatch });
      expect(session.egressScope.admittedToolResults!.size).toBe(0);
      expect(session.usage.retrievalCalls).toBe(1);
      controller.abort();
      // No body observation ever happened for this canceled pre-body dispatch.
      session.admit({ ...first, callId: 'canceled', tool: 'retrieve', dispatch: { ...dispatch, token: Symbol() } });
      expect(session.egressScope.admittedToolResults!.size).toBe(0);
      expect(session.usage.retrievalCalls).toBe(1);
      const missing = { ...first, callId: 'missing', tool: 'retrieve' as const, dispatch };
      Reflect.deleteProperty(missing, 'dispatch');
      expect(() => session.admit(missing)).toThrow();
      expect(session.usage.retrievalCalls).toBe(1);
      for (let index = 0; index < 5; index++) {
        await session.execute({ callId: `new_${index}`, tool: 'retrieve', arguments: { query: 'x', k: 1 }, signal: new AbortController().signal });
      }
      expect(reads).toHaveBeenCalledTimes(5);
      expect(session.usage.retrievalCalls).toBe(6);
      expect(session.egressScope.localBreakerState!()).toBe('intact');
      const sixth = { token: Symbol(), active: () => true };
      const refused = await session.execute({ callId: 'new_6', tool: 'retrieve', arguments: { query: 'x', k: 1 }, signal: new AbortController().signal, dispatch: sixth });
      session.admit({ ...refused, callId: 'new_6', tool: 'retrieve', dispatch: sixth });
      session.admit({ ...refused, callId: 'new_6', tool: 'retrieve', dispatch: sixth });
      expect(refused.text).toContain('调用次数已用完');
      expect(reads).toHaveBeenCalledTimes(5);
      expect(session.usage.retrievalCalls).toBe(7);
      expect(session.egressScope.admittedToolResults!.size).toBe(1);
    } finally { retrieval.dispose(); }
  });

  it.each(['interrupt', 'finish'] as const)('prevents late finalization from sending or charging after %s', async (action) => {
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, purpose: 'raw-wire' });
    let release!: () => void;
    const held = new Promise<void>((resolveHeld) => { release = resolveHeld; });
    let entered!: () => void;
    const started = new Promise<void>((resolveStarted) => { entered = resolveStarted; });
    let late: Parameters<PlatformToolSession['execute']>[0] | undefined;
    vi.spyOn(session, 'execute').mockImplementation(async (call) => {
      late = call; entered(); await held;
      throw new Error('synthetic body failure before observation');
    });
    const model = new RawToolModel(() => [{ name: 'retrieve', arguments: '{}' }]);
    const { handle } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      const submitting = handle.submitUnit(UNIT);
      await started;
      const finishing = action === 'finish' ? handle.finish() : undefined;
      if (action === 'interrupt') handle.interrupt();
      release();
      const outcome = await submitting;
      if (finishing !== undefined) await finishing;
      expect(outcome.terminal).toBe('interrupted');
      expect(model.requests).toHaveLength(1);
      expect(session.usage.retrievalCalls).toBe(0);
      expect(session.egressScope.admittedToolResults!.size).toBe(0);
      session.startUnit();
      session.admit({ callId: late!.callId, tool: late!.tool, sourceUrl: null, text: 'late', dispatch: late!.dispatch! });
      expect(session.usage.retrievalCalls).toBe(0);
      expect(session.egressScope.admittedToolResults!.size).toBe(0);
    } finally { release(); await handle.finish(); }
  });

  it('spends a rejected position exactly as the in-body refusal does when parallel reads finish out of order', async () => {
    // The quota counts every local call in model order: a call DSH rejects before the body spends its position just as one the
    // body refuses ('{'), so both spellings read the same positions however the pending reads settle.
    const localTools: NonNullable<EgressBindingFacts['localTools']> = { ...LOCAL_RULE, declarations: LOCAL_TOOL_DECLARATION_NAMES.map((name) => ({ name, readOnly: true, concurrencySafe: true })), parallelCallsAllowed: true };
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools };
    for (const rejected of ['{', '{"query":"x","k":-0}', '{"query":"x","k":1e309}']) {
      const retrieval = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest: 'a'.repeat(64),
        read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: 'x' }] }) }]);
      const retrieve = retrieval.retrieve.bind(retrieval);
      const started: string[] = []; const settled: string[] = [];
      let active = 0; let peak = 0;
      vi.spyOn(retrieval, 'retrieve').mockImplementation(async (...args) => {
        // A read that starts earlier settles later, so completion runs against model order.
        const delay = (8 - started.push(args[0])) * 4;
        active++; peak = Math.max(peak, active);
        await new Promise<void>((done) => setTimeout(done, delay));
        try { return await retrieve(...args); } finally { active--; settled.push(args[0]); }
      });
      const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, retrieval, purpose: 'raw-wire' });
      const model = new RawToolModel((request) => request === 1 ? Array.from({ length: 8 }, (_, index) => ({ name: 'retrieve',
        arguments: index === 1 || index === 4 ? rejected : `{"query":"q${index}","k":1}` })) : []);
      const { handle } = await rawHarness(session, binding, model, true);
      try {
        session.startUnit();
        expect((await handle.submitUnit(UNIT)).terminal).toBe('completed');
        const results = model.requests[1]!.messages.filter((message) => message.source.kind === 'tool');
        expect(results.map((message) => message.source)).toEqual(Array.from({ length: 8 }, (_, index) => ({ kind: 'tool', callId: `raw_1_${index}` })));
        expect(results.map((message, index) => started.includes(`q${index}`) ? 'read' : JSON.stringify(message).includes('调用次数已用完') ? 'quota' : 'rejected'))
          .toEqual(['read', 'rejected', 'read', 'read', 'rejected', 'quota', 'quota', 'quota']);
        expect(started).toEqual(['q0', 'q2', 'q3']);
        expect(settled).not.toEqual(started);
        expect(peak).toBeLessThanOrEqual(5);
        expect(session.usage).toMatchObject({ retrievalCalls: 8, refusedRetrievalCalls: 5 });
        expect(session.egressScope.admittedToolResults!.size).toBe(8);
      } finally { await handle.finish(); retrieval.dispose(); }
    }
  });

  it('keeps one web breaker when pre-body failures alternate between websearch and webfetch', async () => {
    const binding = bindingOf((await ruleOf('v7'))!, 'b'.repeat(64));
    const fetch = vi.fn(async () => { throw new Error('NO_TRANSPORT'); });
    const breaker = new PlatformToolBreaker();
    const observations = vi.spyOn(breaker, 'observe');
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, fetch,
      admitHost: () => { throw new Error('NO_HOST'); }, breaker, purpose: 'raw-wire' });
    const model = new RawToolModel((request) => [request % 2 === 0
      ? { name: 'webfetch', arguments: '{"url":"https://example.org/source","k":-0}' } : { name: 'websearch', arguments: '{"query":"x","k":1e309}' }]);
    const { handle, decisions } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(model.requests).toHaveLength(129);
      expect(observations).toHaveBeenCalledTimes(129);
      expect(fetch).not.toHaveBeenCalled();
      expect(decisions.at(-1)).toBe('refuse:circuit-breaker-tripped');
      expect(session.unitEnd(outcome)).toEqual({ reason: 'circuit-breaker-tripped', disclosure: '联网核查未完成', retry: 'never', settles: 'unit-only' });
    } finally { await handle.finish(); }
  });

  it('lets the next unit of the same Session proceed after pre-body failures ended the previous one', async () => {
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, purpose: 'raw-wire' });
    const model = new RawToolModel((request) => request <= 129 ? [{ name: 'retrieve', arguments: '{"query":"x","k":-0}' }] : []);
    const { handle, decisions } = await rawHarness(session, binding, model);
    try {
      session.startUnit();
      expect(session.unitEnd(await handle.submitUnit(UNIT))?.retry).toBe('never');
      session.startUnit();
      const next = await handle.submitUnit(UNIT);
      expect(next.terminal).toBe('completed');
      expect(model.requests).toHaveLength(130);
      expect(decisions.slice(-2)).toEqual(['refuse:circuit-breaker-tripped', 'transmit-local']);
      // The ended unit's results stay admitted for the Session's history; the next unit charges nothing new.
      expect(session.egressScope.admittedToolResults!.size).toBe(129);
      expect(session.usage.retrievalCalls).toBe(129);
      expect(session.egressScope.localBreakerState!()).toBe('intact');
    } finally { await handle.finish(); }
  });

  it('binds a dispatch token to its first call, so a replayed token neither reads, charges nor admits another result', async () => {
    const binding = { ...bindingOf(null, 'b'.repeat(64)), localTools: LOCAL_RULE };
    const retrieval = new RetrievalIndex([{ sourceKind: 'manuscript', sourceId: 'synthetic', digest: 'a'.repeat(64),
      read: () => ({ digest: 'a'.repeat(64), segments: [{ blockId: 'one', text: 'x' }] }) }]);
    const reads = vi.spyOn(retrieval, 'retrieve');
    const session = new PlatformToolSession({ binding, scope: { currentBindingDigest: () => binding.bindingDigest, acceptedOutputDigests: new Set() }, retrieval, purpose: 'raw-wire' });
    const read = { tool: 'retrieve' as const, arguments: { query: 'x', k: 1 }, signal: new AbortController().signal };
    const dispatch = { token: Symbol(), active: () => true };
    try {
      session.startUnit();
      const first = await session.execute({ ...read, callId: 'first', dispatch });
      expect(await session.execute({ ...read, callId: 'first', dispatch })).toEqual({ text: '工具调用未完成。', sourceUrl: null });
      await expect(session.execute({ ...read, callId: 'other', dispatch })).rejects.toThrow('PLATFORM_TOOL_DISPATCH_MISMATCH');
      session.admit({ ...first, callId: 'first', tool: 'retrieve', dispatch });
      expect(() => session.admit({ ...first, callId: 'other', tool: 'retrieve', dispatch })).toThrow('PLATFORM_TOOL_DISPATCH_MISMATCH');
      // A token first seen at its finalizer (a pre-body failure) is charged there and never enters a body afterwards.
      const preBody = { token: Symbol(), active: () => true };
      session.admit({ callId: 'pre-body', tool: 'retrieve', sourceUrl: null, text: '工具调用未完成：synthetic', dispatch: preBody });
      expect(await session.execute({ ...read, callId: 'pre-body', dispatch: preBody })).toEqual({ text: '工具调用未完成。', sourceUrl: null });
      expect(reads).toHaveBeenCalledTimes(1);
      expect(session.usage).toMatchObject({ retrievalCalls: 2, refusedRetrievalCalls: 1 });
      expect([...session.egressScope.admittedToolResults!.values()].map((entry) => entry.callId)).toEqual(['first', 'pre-body']);
    } finally { retrieval.dispose(); }
  });
});

describe('the platform tools inside the composition', () => {
  it('keeps every composition without an owner at zero tools and its digest unchanged', () => {
    const plain = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, BASELINE_PROMPT_CONTRACT_DIGEST);
    expect(describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, BASELINE_PROMPT_CONTRACT_DIGEST, { platformTools: false })).toEqual(plain);
    expect(plain.tools.registeredTools).toBe(0);
    expect(plain).not.toHaveProperty('platformTools');
    const withTools = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, BASELINE_PROMPT_CONTRACT_DIGEST, { platformTools: true });
    expect(withTools.tools.registeredTools).toBe(2);
    expect(withTools.platformTools).toEqual({ names: ['webfetch', 'websearch'], schemaDigest: PLATFORM_TOOL_SCHEMA_DIGEST });
    expect(withTools.digest).not.toBe(plain.digest);
  });

  it('cannot be given an owner under the selected v5, whose rule names no platform tools', async () => {
    const v5 = bindingOf(await ruleOf('v5'), 'b'.repeat(64));
    const cache = new ProviderResultCache(root);
    expect(() => new PlatformToolSession({
      binding: v5, scope: { currentBindingDigest: () => v5.bindingDigest, acceptedOutputDigests: new Set() },
      fetch: async () => { throw new Error('never'); }, admitHost: () => () => undefined, cache, snapshots: new ResearchSnapshotCache(root), purpose: 'factual-review',
    })).toThrowError('PLATFORM_TOOLS_NOT_NAMED');
    const devCi: EgressBindingFacts = {
      ...bindingOf(await ruleOf('v7'), 'b'.repeat(64)),
      policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 },
    };
    expect(() => new PlatformToolSession({
      binding: devCi, scope: { currentBindingDigest: () => devCi.bindingDigest, acceptedOutputDigests: new Set() },
      fetch: async () => { throw new Error('never'); }, admitHost: () => () => undefined, cache, snapshots: new ResearchSnapshotCache(root), purpose: 'factual-review',
    })).toThrowError('PLATFORM_TOOLS_NOT_NAMED');
  });

  it('completes one websearch round trip through the gate, sends it once, and answers the next unit from the snapshot', async () => {
    const rule = (await ruleOf('v7'))!;
    const bindingDigest = 'b'.repeat(64);
    const binding = bindingOf(rule, bindingDigest);
    const cache = new ProviderResultCache(root);
    await cache.open();
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    const searches: string[] = [];
    // The outputs the execution owner accepted; the next unit's history may carry only these.
    const accepted = new Set<string>();
    const fetch: PlatformToolFetch = async (url, init) => {
      searches.push(`${url} ${init.body}`);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: SEARCH_TEXT }] } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    const session = new PlatformToolSession({
      binding,
      scope: { currentBindingDigest: () => bindingDigest, acceptedOutputDigests: accepted, ceilingState: () => 'within' },
      fetch,
      admitHost: () => { throw new Error('a search opens no ticket host'); },
      cache,
      snapshots,
      purpose: 'factual-review',
    });
    const model = new SearchingModel();
    const decisions: string[] = [];
    const sessionId = randomUUID();
    const handle = await prepareExecution({
      sessionId,
      route: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt: SYSTEM,
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      adapterFactory: () => model,
      gate: (payload) => {
        const decision = evaluateEgress(payload, binding, session.egressScope);
        decisions.push(decision.decision === 'refuse' ? `refuse:${decision.reason}` : decision.decision);
        return decision;
      },
      onTransmitTicket: () => { throw new Error('the local route issues no remote ticket'); },
      platformTools: session,
    });
    try {
      expect(handle.composition.tools.registeredTools).toBe(2);
      handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(outcome.signals.find((signal) => signal.kind === 'usage')).toMatchObject({ usage: { inputTokens: 30, outputTokens: 8, cacheReadTokens: 6 } });
      expect(outcome.terminal).toBe('completed');
      expect(decisions).toEqual(['transmit-local', 'transmit-local']);
      expect(outcome.signals.filter((signal) => signal.kind === 'contentCandidate')).toEqual([expect.objectContaining({ text: ANSWER })]);
      expect(outcome.signals.some((signal) => signal.kind === 'progress')).toBe(true);
      // The model saw exactly the platform tool schemas, and its second request carried the admitted result.
      expect(model.requests).toHaveLength(2);
      expect(model.requests[0]!.tools?.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))).toEqual(
        PLATFORM_TOOL_SCHEMAS.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
      );
      const result = model.requests[1]!.messages.at(-1)!;
      expect(result.source).toEqual({ kind: 'tool', callId: 'call_1' });
      expect(JSON.stringify(result.content)).toContain('1918');
      expect(searches).toHaveLength(1);
      expect(searches[0]).toContain('https://search.parallel.ai/mcp');
      expect(searches[0]).toContain('"name":"web_search"');

      // The next unit asks the same question: the breaker starts intact, and the snapshot answers without sending.
      const candidate = outcome.signals.find((signal) => signal.kind === 'contentCandidate');
      if (candidate?.kind === 'contentCandidate') accepted.add(candidate.digest);
      session.startUnit();
      const again = await handle.submitUnit(UNIT);
      expect(again.terminal).toBe('completed');
      expect(searches).toHaveLength(1);
      const ledger = (await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(ledger.map((line) => [line.itemId, line.kind, line.outcome, line.host])).toEqual([
        ['S87/factual-review/1', 'search-call', 'transmitted', 'search.parallel.ai'],
        ['S87/factual-review/2', 'search-call', 'replayed', 'search.parallel.ai'],
      ]);
      expect(JSON.stringify(ledger)).not.toContain('1918');
    } finally {
      await handle.finish();
    }
  });

  it('ends a looping unit at the breaker with 联网核查未完成, so the model is not asked again', async () => {
    const rule = (await ruleOf('v7'))!;
    const bindingDigest = 'b'.repeat(64);
    const binding = bindingOf(rule, bindingDigest);
    const cache = new ProviderResultCache(root);
    await cache.open();
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    let sent = 0;
    const session = new PlatformToolSession({
      binding,
      scope: { currentBindingDigest: () => bindingDigest, acceptedOutputDigests: new Set(), ceilingState: () => 'within' },
      fetch: async () => {
        sent += 1;
        return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: SEARCH_TEXT }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
      admitHost: () => () => undefined,
      cache,
      snapshots,
      purpose: 'factual-review',
      breaker: new PlatformToolBreaker(1),
    });
    // A model that never stops searching, a new query every time.
    const model = new SearchingModel();
    model.looping = true;
    const decisions: string[] = [];
    const sessionId = randomUUID();
    const handle = await prepareExecution({
      sessionId,
      route: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt: SYSTEM,
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      adapterFactory: () => model,
      gate: (payload) => {
        const decision = evaluateEgress(payload, binding, session.egressScope);
        decisions.push(decision.decision === 'refuse' ? `refuse:${decision.reason}` : decision.decision);
        return decision;
      },
      onTransmitTicket: () => { throw new Error('the local route issues no remote ticket'); },
      platformTools: session,
    });
    try {
      handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      // First call sent; the second trips the breaker and comes back as a refusal; the third model call is refused.
      expect(decisions).toEqual(['transmit-local', 'transmit-local', 'refuse:circuit-breaker-tripped']);
      expect(model.requests).toHaveLength(2);
      expect(sent).toBe(1);
      // The breaker is its own refusal (#676): the turn fails with a distinct code that no retry table names, and the
      // session reads it as the unit ending with 联网核查未完成 — the unit only, never retried.
      expect(outcome.terminal).toBe('failed');
      expect(outcome.signals.at(-1)).toEqual({
        kind: 'failed',
        failure: expect.objectContaining({ code: 'AI7_PLATFORM_TOOL_BREAKER_TRIPPED', failureClass: 'platform-tool-breaker-tripped', retrySafe: false }),
      });
      expect(session.unitDisclosure).toBe('联网核查未完成');
      expect(session.unitEnd(outcome)).toEqual({ reason: 'circuit-breaker-tripped', disclosure: '联网核查未完成', retry: 'never', settles: 'unit-only' });
      session.startUnit();
      expect(session.unitDisclosure).toBeNull();
      // Read after the next unit starts, the same turn is no longer this unit's breaker end.
      expect(session.unitEnd(outcome)).toBeNull();
    } finally {
      await handle.finish();
    }
  });

  it('answers a reused call id with a refusal and never replaces the result its first call was admitted with', async () => {
    const rule = (await ruleOf('v7'))!;
    const bindingDigest = 'b'.repeat(64);
    const cache = new ProviderResultCache(root);
    await cache.open();
    const session = new PlatformToolSession({
      binding: bindingOf(rule, bindingDigest),
      scope: { currentBindingDigest: () => bindingDigest, acceptedOutputDigests: new Set(), ceilingState: () => 'within' },
      fetch: async () => new Response(JSON.stringify({ result: { content: [{ type: 'text', text: SEARCH_TEXT }] } }), { status: 200, headers: { 'content-type': 'application/json' } }),
      admitHost: () => () => undefined,
      cache,
      snapshots: new ResearchSnapshotCache(root),
      purpose: 'factual-review',
    });
    await new ResearchSnapshotCache(root).open();
    const signal = new AbortController().signal;
    session.startUnit();
    const first = { token: Symbol(), active: () => !signal.aborted };
    const second = { token: Symbol(), active: () => !signal.aborted };
    expect(await session.execute({ callId: 'call_0', tool: 'websearch', arguments: { query: '甲' }, signal, dispatch: first })).toMatchObject({ sourceUrl: 'https://search.parallel.ai/mcp' });
    expect(await session.execute({ callId: 'call_0', tool: 'websearch', arguments: { query: '乙' }, signal, dispatch: second })).toEqual({ text: expect.stringContaining('调用标识'), sourceUrl: null });
    session.admit({ callId: 'call_0', tool: 'websearch', sourceUrl: 'https://search.parallel.ai/mcp', text: SEARCH_TEXT, dispatch: first });
    session.admit({ callId: 'call_0', tool: 'websearch', sourceUrl: null, text: '另一个结果', dispatch: second });
    session.admit({ callId: 'call_0', tool: 'webfetch', sourceUrl: null, text: '另一个结果', dispatch: { token: Symbol(), active: () => true } });
    expect([...session.egressScope.admittedToolResults!.values()]).toEqual([
      expect.objectContaining({ callId: 'call_0', tool: 'websearch', sourceUrl: 'https://search.parallel.ai/mcp' }),
    ]);
  });

  it('returns a duplicate call within one unit to the model as a refusal, sending nothing more', async () => {
    const rule = (await ruleOf('v7'))!;
    const bindingDigest = 'b'.repeat(64);
    const binding = bindingOf(rule, bindingDigest);
    const cache = new ProviderResultCache(root);
    await cache.open();
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    const sent: string[] = [];
    const opened: string[] = [];
    let held = 0;
    const session = new PlatformToolSession({
      binding,
      scope: { currentBindingDigest: () => bindingDigest, acceptedOutputDigests: new Set(), ceilingState: () => 'within' },
      fetch: async (url) => {
        sent.push(url);
        return url.startsWith('https://search.parallel.ai/')
          ? new Response(JSON.stringify({ result: { content: [{ type: 'text', text: SEARCH_TEXT }] } }), { status: 200, headers: { 'content-type': 'application/json' } })
          : new Response('<h1>新青年</h1><p>1918 年 5 月号。</p>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      },
      admitHost: ({ host }) => {
        opened.push(host);
        held += 1;
        return () => { held -= 1; };
      },
      cache,
      snapshots,
      purpose: 'factual-review',
    });
    const signal = new AbortController().signal;
    session.startUnit();
    const first = await session.execute({ callId: 'c1', tool: 'websearch', arguments: { query: '狂人日记' }, signal });
    const second = await session.execute({ callId: 'c2', tool: 'websearch', arguments: { query: ' 狂人日记 ' }, signal });
    expect(first).toEqual({ text: SEARCH_TEXT, sourceUrl: 'https://search.parallel.ai/mcp' });
    expect(second).toEqual({ text: expect.stringContaining('不再重复'), sourceUrl: null });
    expect(sent).toHaveLength(1);
    // A URL the attempt never saw is refused before any host opens; one the search returned is fetched under its ticket.
    const uncited = await session.execute({ callId: 'c3', tool: 'webfetch', arguments: { url: 'https://elsewhere.example/' }, signal });
    expect(uncited).toEqual({ text: expect.stringContaining('请改用下一条引用'), sourceUrl: null });
    expect(opened).toEqual([]);
    expect(sent).toHaveLength(1);
    const cited = await session.execute({ callId: 'c4', tool: 'webfetch', arguments: { url: 'https://example.org/source' }, signal });
    expect(cited).toEqual({ text: '# 新青年\n\n1918 年 5 月号。', sourceUrl: 'https://example.org/source' });
    expect(opened).toEqual(['example.org']);
    expect(held).toBe(0);
    expect(sent).toEqual(['https://search.parallel.ai/mcp', 'https://example.org/source']);
    expect(cache.lines.filter(isItemLine).map((line) => [line.itemId, line.kind, line.outcome])).toEqual([
      ['S87/factual-review/1', 'search-call', 'transmitted'],
      ['S87/factual-review/2', 'fetch', 'transmitted'],
    ]);
    // Past the breaker the unit makes no further call, whatever it asks.
    const tight = new PlatformToolSession({
      binding, scope: { currentBindingDigest: () => bindingDigest, acceptedOutputDigests: new Set(), ceilingState: () => 'within' },
      fetch: async () => { throw new Error('never'); }, admitHost: () => () => undefined, cache, snapshots, purpose: 'factual-review',
      breaker: new PlatformToolBreaker(1),
    });
    tight.startUnit();
    await tight.execute({ callId: 'd1', tool: 'websearch', arguments: { query: '狂人日记' }, signal });
    expect(await tight.execute({ callId: 'd2', tool: 'websearch', arguments: { query: '新青年' }, signal })).toEqual({ text: expect.stringContaining('联网核查未完成'), sourceUrl: null });
    expect(tight.breakerState).toBe('tripped');
  });
});

describe('the session reads its decisions from the binding and its breaker end from the turn (#676)', () => {
  const codes = { QUOTA_EXCEEDED_CODE: 'QUOTA', INVALID_CREDENTIAL_CODE: 'CREDENTIAL', CONTEXT_WINDOW_EXCEEDED_CODE: 'CONTEXT' };
  const turn = (terminal: HarnessTurnOutcome['terminal'], code?: string): Pick<HarnessTurnOutcome, 'terminal' | 'signals'> => ({
    terminal,
    signals: code === undefined
      ? [{ kind: 'completed' }]
      : [{ kind: terminal === 'interrupted' ? 'interrupted' : 'failed', failure: classifyModelFailure({ code, message: 'x' }, codes) } as HarnessTurnOutcome['signals'][number]],
  });

  it('refuses both tools for a binding that is not public or synthetic, sending and recording nothing', async () => {
    const rule = (await ruleOf('v7'))!;
    const bindingDigest = 'b'.repeat(64);
    const binding: EgressBindingFacts = { ...bindingOf(rule, bindingDigest), outboundDataCategory: 'editor-selected-manuscript-excerpt' };
    const cache = new ProviderResultCache(root);
    await cache.open();
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    let sent = 0;
    const session = new PlatformToolSession({
      binding,
      scope: { currentBindingDigest: () => bindingDigest, acceptedOutputDigests: new Set(), ceilingState: () => 'within' },
      fetch: async () => { sent += 1; throw new Error('never'); },
      admitHost: () => { throw new Error('never'); },
      cache,
      snapshots,
      purpose: 'factual-review',
    });
    session.cite('https://example.org/source');
    const signal = new AbortController().signal;
    session.startUnit();
    expect(await session.execute({ callId: 'c1', tool: 'websearch', arguments: { query: '狂人日记' }, signal }))
      .toEqual({ text: expect.stringContaining('公开或合成'), sourceUrl: null });
    expect(await session.execute({ callId: 'c2', tool: 'webfetch', arguments: { url: 'https://example.org/source' }, signal }))
      .toEqual({ text: expect.stringContaining('公开或合成'), sourceUrl: null });
    expect(sent).toBe(0);
    expect(cache.lines).toEqual([]);
  });

  it('refuses a search whose binding went stale between the decision and the send, recording nothing', async () => {
    const rule = (await ruleOf('v7'))!;
    const bindingDigest = 'b'.repeat(64);
    const cache = new ProviderResultCache(root);
    await cache.open();
    let current: string | null = bindingDigest;
    let sent = 0;
    // The snapshot lookup is the await between the gate's decision and the ticket's redemption: the binding moves there.
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    const lookup = snapshots.lookup.bind(snapshots);
    snapshots.lookup = async (...args) => {
      current = 'f'.repeat(64);
      return lookup(...args);
    };
    const session = new PlatformToolSession({
      binding: bindingOf(rule, bindingDigest),
      scope: { currentBindingDigest: () => current, acceptedOutputDigests: new Set(), ceilingState: () => 'within' },
      fetch: async () => { sent += 1; throw new Error('never'); },
      admitHost: () => { throw new Error('never'); },
      cache,
      snapshots,
      purpose: 'factual-review',
    });
    session.startUnit();
    expect(await session.execute({ callId: 'c1', tool: 'websearch', arguments: { query: '狂人日记' }, signal: new AbortController().signal }))
      .toEqual({ text: expect.stringContaining('PLATFORM_TOOL_TICKET_REFUSED'), sourceUrl: null });
    expect(sent).toBe(0);
    expect(cache.lines).toEqual([]);
  });

  it('reads a breaker end only from a turn this unit\'s tripped breaker failed, and never as retry-safe', async () => {
    const rule = (await ruleOf('v7'))!;
    const bindingDigest = 'b'.repeat(64);
    const cache = new ProviderResultCache(root);
    await cache.open();
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    const session = new PlatformToolSession({
      binding: bindingOf(rule, bindingDigest),
      scope: { currentBindingDigest: () => bindingDigest, acceptedOutputDigests: new Set(), ceilingState: () => 'within' },
      fetch: async () => new Response(JSON.stringify({ result: { content: [{ type: 'text', text: SEARCH_TEXT }] } }), { status: 200, headers: { 'content-type': 'application/json' } }),
      admitHost: () => () => undefined,
      cache,
      snapshots,
      purpose: 'factual-review',
      breaker: new PlatformToolBreaker(1),
    });
    const breakerTurn = turn('failed', AI7_FAILURE_CODES.PLATFORM_TOOL_BREAKER_TRIPPED);
    session.startUnit();
    // An intact breaker: even the breaker's code is not this unit's end.
    expect(session.unitEnd(breakerTurn)).toBeNull();
    const signal = new AbortController().signal;
    await session.execute({ callId: 'c1', tool: 'websearch', arguments: { query: '甲' }, signal });
    await session.execute({ callId: 'c2', tool: 'websearch', arguments: { query: '乙' }, signal });
    expect(session.breakerState).toBe('tripped');
    expect(session.unitEnd(breakerTurn)).toEqual({ reason: 'circuit-breaker-tripped', disclosure: '联网核查未完成', retry: 'never', settles: 'unit-only' });
    // Every other ending of a tripped unit's turn settles as it would without platform tools.
    expect(session.unitEnd(turn('failed', AI7_FAILURE_CODES.EGRESS_REFUSED))).toBeNull();
    expect(session.unitEnd(turn('interrupted', AI7_FAILURE_CODES.EGRESS_REFUSED))).toBeNull();
    expect(session.unitEnd(turn('interrupted', AI7_FAILURE_CODES.PLATFORM_TOOL_BREAKER_TRIPPED))).toBeNull();
    expect(session.unitEnd(turn('failed', AI7_FAILURE_CODES.RATE_LIMIT))).toBeNull();
    expect(session.unitEnd(turn('completed'))).toBeNull();
    expect(session.unitEnd({ terminal: 'failed', signals: [] })).toBeNull();
    // The failure is distinct from the generic refusal, and no retry path — automatic or ask-first — admits it.
    const classified = classifyModelFailure({ code: AI7_FAILURE_CODES.PLATFORM_TOOL_BREAKER_TRIPPED, message: 'x' }, codes);
    expect(classified).toMatchObject({ signal: 'failed', failureClass: 'platform-tool-breaker-tripped', retrySafe: false });
    expect(classified.reason).toContain('联网核查未完成');
    expect(isRetrySafeFailure({ code: AI7_FAILURE_CODES.PLATFORM_TOOL_BREAKER_TRIPPED, message: 'x', status: 503 })).toBe(false);
    expect(classifyModelFailure({ code: AI7_FAILURE_CODES.EGRESS_REFUSED, message: 'x' }, codes)).toMatchObject({ signal: 'interrupted', failureClass: 'egress-refused' });
  });
});
