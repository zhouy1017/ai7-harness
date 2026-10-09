import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { prepareExecution } from '../../src/service/harness/primary-agent-harness.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { DEEPSEEK_ROUTE_PROFILE, DeepSeekOpenAiCompatibleAdapter } from '../../src/service/provider/deepseek-adapter.js';
import { DEEPSEEK_MODEL, DEEPSEEK_ROUTE, evaluateEgress, type EgressBindingFacts, type EgressCeilingState, type TransmitTicket } from '../../src/service/provider/egress-gate.js';
import { transmitOnce } from '../../src/service/provider/live-transmission.js';
import { DEEPSEEK_V4_PRO_PROFILE } from '../../src/service/provider/model-profile.js';
import { PlatformToolBreaker, readPlatformToolsRule, type PlatformToolsRule } from '../../src/service/provider/platform-tools.js';
import type { PlatformToolFetch } from '../../src/service/provider/platform-tool-http.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { PROVIDER_LEDGER_FILE, ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
import { ResearchSnapshotCache } from '../../src/service/provider/research-snapshot-cache.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// The remote route and the adapter's tool calls in one run (#676; the re-review of #671, P3-11c): the real pinned DSH
// composition, the real chat-completions adapter on a function-calling model, the remote branch of the Egress Gate with
// its transmit tickets and ceiling, and the platform-tool session, over recorded exchanges and no network. The first
// request carries `tools`; its response carries `tool_calls` with the model's `reasoning_content`; the session answers the
// search; the second request carries the tool result and sends the reasoning back. The rule is v7's block, which no active
// set selects, and the model is the production one, whose profile declares function calling — the developer-live model
// still declares none until the live evidence item of ADR 0080 §7.7 runs — so nothing here is reachable from a Run today.

installNodeNetworkDenial();

const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const FIXTURE = resolve(REPO_ROOT, 'tests/fixtures/platform-tools/remote-tool-loop.json');
const SYSTEM = '合成系统提示。';
const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落：《狂人日记》发表于 1918 年。`;
const BINDING_DIGEST = 'b'.repeat(64);

/** One recorded model exchange: the exact request body the adapter must assemble, and the response it was answered with. */
interface RecordedExchange {
  readonly url: string;
  readonly request: unknown;
  readonly response: { readonly status: number; readonly body: unknown };
}

interface RecordedLoop {
  readonly model: ReadonlyArray<RecordedExchange>;
  readonly search: { readonly url: string; readonly request: unknown; readonly response: { readonly status: number; readonly body: unknown } };
}

let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai7-remote-tool-loop-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function v7Rule(): Promise<PlatformToolsRule> {
  const document = JSON.parse(await readFile(resolve(REPO_ROOT, 'docs/policies/provider-processing-policy.v7.json'), 'utf8')) as {
    decision: { providerAllowRules: unknown[] };
  };
  return readPlatformToolsRule(document.decision.providerAllowRules[0])!;
}

/** The real composition on the remote route, its adapter answered only by the recorded exchanges. */
async function compose(recorded: RecordedLoop, options: {
  readonly ceilingState?: () => EgressCeilingState;
  readonly breaker?: PlatformToolBreaker;
  readonly onModelCall?: (index: number) => void;
} = {}) {
  const rule = await v7Rule();
  const binding: EgressBindingFacts = {
    bindingDigest: BINDING_DIGEST,
    route: DEEPSEEK_ROUTE,
    model: DEEPSEEK_MODEL,
    systemPrompt: SYSTEM,
    outboundDataCategory: 'public-or-synthetic',
    policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v8', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
    admittedUserMessages: new Set([UNIT]),
    platformTools: rule,
  };
  const cache = new ProviderResultCache(root);
  await cache.open();
  const snapshots = new ResearchSnapshotCache(root);
  await snapshots.open();

  // The search service, from its recorded exchange: the request must be exactly the one recorded.
  const searches: Array<{ url: string; body: unknown }> = [];
  const searchFetch: PlatformToolFetch = async (url, init) => {
    searches.push({ url, body: JSON.parse(init.body ?? 'null') });
    return new Response(JSON.stringify(recorded.search.response.body), { status: recorded.search.response.status, headers: { 'content-type': 'application/json' } });
  };
  const session = new PlatformToolSession({
    binding,
    scope: { currentBindingDigest: () => BINDING_DIGEST, acceptedOutputDigests: new Set(), ceilingState: options.ceilingState ?? (() => 'within') },
    fetch: searchFetch,
    admitHost: () => { throw new Error('a search opens no ticket host'); },
    cache,
    snapshots,
    purpose: 'factual-review',
    ...(options.breaker === undefined ? {} : { breaker: options.breaker }),
  });

  // The model service, from its recorded exchanges in order, reached only through the once-only live transmission.
  const sent: Array<{ url: string; headers: Record<string, string>; raw: string; body: unknown }> = [];
  let next = 0;
  const modelFetch = async (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }): Promise<{ status: number; json(): Promise<unknown> }> => {
    sent.push({ url, headers: init.headers, raw: init.body, body: JSON.parse(init.body) });
    const exchange = recorded.model[next];
    options.onModelCall?.(next);
    next += 1;
    if (exchange === undefined) throw new Error('no recorded exchange for this request');
    return { status: exchange.response.status, json: async () => exchange.response.body };
  };
  const tickets: TransmitTicket[] = [];
  const decisions: string[] = [];
  let adapter: DeepSeekOpenAiCompatibleAdapter | null = null;
  const sessionId = randomUUID();
  const handle = await prepareExecution({
    sessionId,
    route: DEEPSEEK_ROUTE,
    model: DEEPSEEK_MODEL,
    systemPrompt: SYSTEM,
    promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
    adapterFactory: (codes) => {
      adapter = new DeepSeekOpenAiCompatibleAdapter({
        // A placeholder secret: the broker hands it to the transport, which only a recorded exchange answers.
        broker: new CredentialBroker({ resolve: async () => 'placeholder-not-a-credential' }),
        slotBinding: { bindingDigest: BINDING_DIGEST, modelRole: 'Main Editorial Role', slot: DEEPSEEK_ROUTE_PROFILE.credentialSlot, credentialReference: randomUUID() },
        tickets: { take: () => tickets.shift() ?? null },
        attribution: () => ({}),
        promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
        codes,
        profile: DEEPSEEK_ROUTE_PROFILE,
        modelProfile: DEEPSEEK_V4_PRO_PROFILE,
        transport: (url, init) => transmitOnce(cache, modelFetch, { purpose: 'factual-review', promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST },
          DEEPSEEK_ROUTE_PROFILE, DEEPSEEK_MODEL, url, init),
      });
      return adapter;
    },
    gate: (payload) => {
      const decision = evaluateEgress(payload, binding, session.egressScope);
      decisions.push(decision.decision === 'refuse' ? `refuse:${decision.reason}` : decision.decision);
      return decision;
    },
    onTransmitTicket: (ticket) => { tickets.push(ticket); },
    platformTools: session,
  });
  return { handle, session, sent, searches, decisions, tickets, adapter: () => adapter!, sessionId, cache };
}

describe('the remote route with platform tool calls, over recorded exchanges', () => {
  it('sends tools, reads tool_calls, returns the tool result, and sends the reasoning back', async () => {
    const recorded = JSON.parse(await readFile(FIXTURE, 'utf8')) as RecordedLoop;
    const { handle, session, sent, searches, decisions, tickets, adapter, sessionId } = await compose(recorded);
    try {
      expect(DEEPSEEK_V4_PRO_PROFILE.capabilities.toolCalling).toBe('function');
      handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      const ledger = await ledgerLines();

      // Two remote transmissions, each through the gate's own ticket, and the turn completes with the model's answer.
      expect(decisions).toEqual(['transmit-remote', 'transmit-remote']);
      expect(tickets).toEqual([]);
      expect(adapter().transmissions).toBe(2);
      expect(outcome.terminal).toBe('completed');
      const answer = recorded.model[1]!.response.body as { choices: Array<{ message: { content: string } }> };
      expect(outcome.signals.filter((signal) => signal.kind === 'contentCandidate')).toEqual([expect.objectContaining({ text: answer.choices[0]!.message.content })]);

      // Every request is exactly the recorded one, on the recorded URL.
      expect(sent.map((request) => request.url)).toEqual(recorded.model.map((exchange) => exchange.url));
      expect(sent.map((request) => request.body)).toEqual(recorded.model.map((exchange) => exchange.request));
      // Byte for byte: the adapter writes canonical JSON, which is the recorded request in its recorded key order.
      expect(sent.map((request) => request.raw)).toEqual(recorded.model.map((exchange) => JSON.stringify(exchange.request)));
      expect(searches).toEqual([{ url: recorded.search.url, body: recorded.search.request }]);

      // And what those recorded requests say, spelled out: the first offers the two tools and carries no history; the
      // second carries the assistant's tool call with its reasoning, and the search's text as the tool's result.
      const [first, second] = sent.map((request) => request.body as { tools?: Array<{ type: string; function: { name: string } }>; messages: Array<Record<string, unknown>> });
      expect(first!.tools?.map((tool) => [tool.type, tool.function.name])).toEqual([['function', 'webfetch'], ['function', 'websearch']]);
      expect(first!.messages.map((message) => message.role)).toEqual(['system', 'user']);
      expect(second!.tools).toEqual(first!.tools);
      const call = (recorded.model[0]!.response.body as { choices: Array<{ message: { reasoning_content: string; tool_calls: Array<{ id: string; function: { name: string; arguments: string } }> } }> }).choices[0]!.message;
      expect(second!.messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'tool']);
      expect(second!.messages[2]).toEqual({
        role: 'assistant',
        content: null,
        reasoning_content: call.reasoning_content,
        tool_calls: [{ id: call.tool_calls[0]!.id, type: 'function', function: call.tool_calls[0]!.function }],
      });
      const searchText = (recorded.search.response.body as { result: { content: Array<{ text: string }> } }).result.content[0]!.text;
      expect(second!.messages[3]).toEqual({ role: 'tool', tool_call_id: call.tool_calls[0]!.id, content: searchText });

      // Two S40 model items and one S87 search item, in the order they went out; no content on any line.
      expect(ledger.map((line) => [line.itemId, line.kind ?? 'model', line.outcome])).toEqual([
        ['S40/factual-review/1', 'model', 'transmitted'],
        ['S87/factual-review/1', 'search-call', 'transmitted'],
        ['S40/factual-review/2', 'model', 'transmitted'],
      ]);
      expect(JSON.stringify(ledger)).not.toContain('1918');
    } finally {
      await handle.finish();
    }
  });

  it('holds the ceiling on the remote route: a spent Run neither searches nor asks the model again', async () => {
    const recorded = JSON.parse(await readFile(FIXTURE, 'utf8')) as RecordedLoop;
    let spent = false;
    // The ceiling is reached by the first answer's usage, before the model's search is decided.
    const { handle, session, sent, searches, decisions, adapter, sessionId } = await compose(recorded, {
      ceilingState: () => (spent ? 'reached' : 'within'),
      onModelCall: () => { spent = true; },
    });
    try {
      handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      session.startUnit();
      const outcome = await handle.submitUnit(UNIT);
      expect(decisions).toEqual(['transmit-remote', 'refuse:run-budget-ceiling-reached']);
      expect(adapter().transmissions).toBe(1);
      expect(sent).toHaveLength(1);
      expect(searches).toEqual([]);
      expect(outcome.terminal).toBe('interrupted');
      expect(outcome.signals.at(-1)).toMatchObject({ kind: 'interrupted', failure: { code: 'AI7_EGRESS_REFUSED', failureClass: 'egress-refused' } });
      expect(session.unitEnd(outcome)).toBeNull();
      expect((await ledgerLines()).map((line) => line.itemId)).toEqual(['S40/factual-review/1']);
    } finally {
      await handle.finish();
    }
  });

  it('ends a unit at its breaker on the remote route with 联网核查未完成, never asking the model again', async () => {
    const recorded = JSON.parse(await readFile(FIXTURE, 'utf8')) as RecordedLoop;
    const { handle, session, sent, searches, decisions, adapter, sessionId } = await compose(recorded, { breaker: new PlatformToolBreaker(1) });
    try {
      handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      session.startUnit();
      // The unit's one round trip is spent before the model asks for its search.
      const signal = new AbortController().signal;
      await session.execute({ callId: 'pre-1', tool: 'websearch', arguments: { query: '狂人日记 发表 年份 新青年' }, signal });
      const outcome = await handle.submitUnit(UNIT);
      // The model's call trips the breaker and is answered with a refusal; the next model call carrying it is refused.
      expect(decisions).toEqual(['transmit-remote', 'refuse:circuit-breaker-tripped']);
      expect(adapter().transmissions).toBe(1);
      expect(sent).toHaveLength(1);
      expect(searches).toHaveLength(1);
      expect(outcome.terminal).toBe('failed');
      expect(outcome.signals.at(-1)).toMatchObject({ kind: 'failed', failure: { code: 'AI7_PLATFORM_TOOL_BREAKER_TRIPPED', retrySafe: false } });
      expect(session.unitEnd(outcome)).toEqual({ reason: 'circuit-breaker-tripped', disclosure: '联网核查未完成', retry: 'never', settles: 'unit-only' });
    } finally {
      await handle.finish();
    }
  });
});

async function ledgerLines(): Promise<Array<Record<string, unknown>>> {
  return (await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}
