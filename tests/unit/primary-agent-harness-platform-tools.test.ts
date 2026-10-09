import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CallId, GenerateOptions, LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { describeComposition, prepareExecution, type HarnessTurnOutcome } from '../../src/service/harness/primary-agent-harness.js';
import { AI7_FAILURE_CODES, classifyModelFailure, isRetrySafeFailure } from '../../src/service/provider/classification.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, evaluateEgress, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { PLATFORM_TOOL_SCHEMAS, PLATFORM_TOOL_SCHEMA_DIGEST, PlatformToolBreaker, readPlatformToolsRule, type PlatformToolsRule } from '../../src/service/provider/platform-tools.js';
import type { PlatformToolFetch } from '../../src/service/provider/platform-tool-http.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { PROVIDER_LEDGER_FILE, ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
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
  return readPlatformToolsRule(document.decision.providerAllowRules[0]);
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
      yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 5 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
      return;
    }
    this.#calls += 1;
    const id = `call_${this.#calls}` as CallId;
    const args = this.looping ? `{"query":"狂人日记 第 ${this.#calls} 次"}` : '{"query":"狂人日记 发表 年份"}';
    yield { type: 'block-start', index: 0, blockType: 'tool-call' };
    yield { type: 'tool-call-delta', index: 0, id, name: 'websearch', argumentsDelta: args };
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'websearch', arguments: args } };
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
}

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
    expect(await session.execute({ callId: 'call_0', tool: 'websearch', arguments: { query: '甲' }, signal })).toMatchObject({ sourceUrl: 'https://search.parallel.ai/mcp' });
    expect(await session.execute({ callId: 'call_0', tool: 'websearch', arguments: { query: '乙' }, signal })).toEqual({ text: expect.stringContaining('调用标识'), sourceUrl: null });
    session.admit({ callId: 'call_0', tool: 'websearch', sourceUrl: 'https://search.parallel.ai/mcp', text: SEARCH_TEXT });
    session.admit({ callId: 'call_0', tool: 'websearch', sourceUrl: null, text: '另一个结果' });
    session.admit({ callId: 'call_0', tool: 'webfetch', sourceUrl: null, text: '另一个结果' });
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
    expect(cache.lines.map((line) => [line.itemId, line.kind, line.outcome])).toEqual([
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
