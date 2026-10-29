import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import {
  EgressTicketBook, OPENCODE_GO_MODEL, OPENCODE_GO_ROUTE, assistantToolCallDigest, evaluateEgress, evaluateSearchServiceCall, toolResultKey, type EgressBindingFacts,
} from '../../src/service/provider/egress-gate.js';
import type { AssembledContentBlock, AssembledModelPayload } from '../../src/service/provider/payload.js';
import { PLATFORM_TOOL_SCHEMAS } from '../../src/service/provider/platform-tools.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { authorizeSearchCall, platformToolsFromProjection } from '../../src/service/provider/search-service.js';
import { CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../src/shared/provider-configuration.generated.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { armHostAllowanceSet, armPerTicketHostAdmission, admitTicketHost, hostAllowanceSet, allowanceAdmitsConnection, installNodeNetworkDenial, ticketHostHolds } from '../../src/shared/network-denial.js';
import { searchToolsRule } from '../support/search-tools-policy.js';

const frozen = SEARCH_BACKENDS.find((entry) => entry.id === 'search-tinyfish')!;
const shipped = SEARCH_BACKENDS.filter((entry) => entry.shipped);
const MODEL = { host: 'opencode.ai', port: 443 };
// Exactly what `src/service/index.ts` arms under developer-live: the model endpoint's single host, then per-ticket admission,
// then the process-wide denial. No search backend host is armed; the frozen one opens only for a redeemed ticket.
armHostAllowanceSet([MODEL]);
armPerTicketHostAdmission();
installNodeNetworkDenial();
/** The shipped backend hosts a connection may address at this instant. */
const openBackendHosts = (): string[] => shipped.filter((entry) => allowanceAdmitsConnection([{ host: entry.host, port: 443 }])).map((entry) => entry.host!);
const binding: EgressBindingFacts = { bindingDigest: 'a'.repeat(64), route: 'opencode-go', model: 'deepseek-v4.1-flash', systemPrompt: '',
  admittedUserMessages: new Set(), outboundDataCategory: 'public-or-synthetic',
  policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v18', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
  platformTools: platformToolsFromProjection(searchToolsRule()),
  searchBackend: { backendId: frozen.id, host: frozen.host!, endpoint: frozen.endpoint!, credentialSlot: frozen.credentialSlot, credentialReference: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
};
const scope = { currentBindingDigest: () => 'a'.repeat(64), acceptedOutputDigests: new Set<string>(), ceilingState: () => 'within' as const };

describe('frozen backend egress and per-Run tool accounting', () => {
  it('holds exactly the model host at rest; no backend host and no global fetch is admitted', async () => {
    expect(hostAllowanceSet()).toEqual([MODEL]);
    expect(allowanceAdmitsConnection([MODEL])).toBe(true);
    expect(openBackendHosts()).toEqual([]);
    expect(ticketHostHolds()).toBe(0);
    await expect(globalThis.fetch(`https://${frozen.host}/`)).rejects.toMatchObject({ code: 'AI7_OUTBOUND_NETWORK_DENIED' });
    expect(() => EgressTicketBook.open({ ...binding, policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 } }, scope)).toThrow(/NOT_NAMED/);
    const book = EgressTicketBook.open(binding, scope);
    const alien = { ...binding, searchBackend: { ...binding.searchBackend!, backendId: 'search-brave', host: 'other.example.org' } };
    expect(evaluateSearchServiceCall({ arguments: { tool: 'websearch', query: 'public fact' } }, alien, scope, book).decision).toBe('refuse');
  });

  it('searches a query once across units, binds fetches to citations and records counts, bytes and provenance', async () => {
    let searches = 0; let pages = 0;
    // What the process admits at the instant each request leaves: the model host, plus exactly the one host its ticket opened.
    const opened: Array<{ to: string; backends: string[]; page: boolean; model: boolean }> = [];
    const session = new PlatformToolSession({ binding, scope, broker: new CredentialBroker({ resolve: async () => 'synthetic-key' }),
      purpose: 'provider-free-boundary', admitHost: admitTicketHost,
      fetch: async (url) => {
        opened.push({ to: new URL(url).hostname, backends: openBackendHosts(), page: allowanceAdmitsConnection([{ host: 'example.org', port: 443 }]), model: allowanceAdmitsConnection([MODEL]) });
        if (new URL(url).hostname === frozen.host) { searches += 1; return new Response(JSON.stringify({ results: [{ title: 'Public source', url: 'https://example.org/source', snippet: 'Public fact' }] })); }
        expect(url).toBe('https://example.org/source'); pages += 1;
        return new Response('<html><body><h1>Public source</h1><p>Public fact</p></body></html>', { headers: { 'content-type': 'text/html' } });
      },
    });
    const search = { tool: 'websearch' as const, arguments: { query: 'public fact' }, signal: new AbortController().signal };
    const dispatch = { token: Symbol(), active: () => !search.signal.aborted };
    const first = await session.execute({ ...search, callId: 'one', dispatch });
    expect(await session.execute({ ...search, callId: 'repeat', dispatch: { token: Symbol(), active: () => !search.signal.aborted } })).toEqual(first);
    const second = await session.execute({ ...search, callId: 'different', arguments: { query: 'a different public fact' }, dispatch: { token: Symbol(), active: () => !search.signal.aborted } });
    expect(second).toMatchObject({ sourceUrl: null, text: expect.stringContaining('本单元的检索次数已用完') });
    expect(session.breakerState).toBe('intact');
    expect(session.unitDisclosure).toBe('联网核查已完成');
    expect(session.usage.refusedSearchCalls).toBe(1);
    session.admit({ ...first, tool: 'websearch', callId: 'one', dispatch });
    expect([...session.egressScope.admittedToolResults!.values()][0]).toMatchObject({ sourceKind: 'tool', backendId: frozen.id, host: frozen.host });
    session.startUnit();
    expect(await session.execute({ ...search, callId: 'two', dispatch: { token: Symbol(), active: () => !search.signal.aborted } })).toEqual(first);
    const bad = await session.execute({ callId: 'uncited', tool: 'webfetch', arguments: { url: 'https://example.org/not-cited' }, signal: new AbortController().signal, dispatch: { token: Symbol(), active: () => true } });
    expect(bad.sourceUrl).toBeNull();
    const page = await session.execute({ callId: 'cited', tool: 'webfetch', arguments: { url: 'https://example.org/source' }, signal: new AbortController().signal, dispatch: { token: Symbol(), active: () => true } });
    expect(page.text).toContain('# Public source');
    expect(searches).toBe(1); expect(pages).toBe(1);
    expect(opened).toEqual([
      { to: frozen.host, backends: [frozen.host], page: false, model: true },
      { to: 'example.org', backends: [], page: true, model: true },
    ]);
    expect(openBackendHosts()).toEqual([]); expect(ticketHostHolds()).toBe(0);
    expect(session.usage).toMatchObject({ requests: 2, searchCalls: { 'search-tinyfish': 1 }, fetchCount: 1 });
    expect(session.usage.fetchBytes).toBeGreaterThan(0);
    expect(session.provenance).toHaveLength(2);
    expect(session.provenance.every((entry) => /^[0-9a-f]{64}$/u.test(entry.argumentsDigest) && /^[0-9a-f]{64}$/u.test(entry.responseDigest))).toBe(true);
    // A new unit has its own query allowance; the Run still freezes the same backend.
    session.startUnit();
    await session.execute({ ...search, callId: 'new-unit-query', arguments: { query: 'another public fact' }, dispatch: { token: Symbol(), active: () => !search.signal.aborted } });
    expect(searches).toBe(2);
  });

  it('discloses incomplete research when the unit exhausted its query without obtaining a result', async () => {
    let sends = 0;
    const session = new PlatformToolSession({ binding, scope, broker: new CredentialBroker({ resolve: async () => 'synthetic-key' }),
      purpose: 'provider-free-empty', admitHost: admitTicketHost, fetch: async () => { sends += 1; return new Response(JSON.stringify({ results: [] })); },
    });
    const call = { tool: 'websearch' as const, signal: new AbortController().signal };
    await session.execute({ ...call, callId: 'first', arguments: { query: 'public empty fact' }, dispatch: { token: Symbol(), active: () => !call.signal.aborted } });
    const refused = await session.execute({ ...call, callId: 'second', arguments: { query: 'different public fact' }, dispatch: { token: Symbol(), active: () => !call.signal.aborted } });
    expect(refused.text).toContain('联网核查未完成');
    expect(session.unitDisclosure).toBe('联网核查未完成');
    expect(session.breakerState).toBe('intact');
    expect(sends).toBe(1);
    expect(session.usage.refusedSearchCalls).toBe(1);
  });

  it('records each failed submission by its class — rate, quota, auth, server, missing key, transport — and sends once (Issue #1181)', async () => {
    const cases: Array<[string, () => Promise<Response>, string | null]> = [
      ['rate', async () => new Response('{"error":{"message":"provider words"}}', { status: 429 }), 'synthetic-key'],
      ['quota', async () => new Response('{}', { status: 402 }), 'synthetic-key'],
      ['auth', async () => new Response('{}', { status: 401 }), 'synthetic-key'],
      ['server', async () => new Response('{}', { status: 503 }), 'synthetic-key'],
      ['credential-missing', async () => new Response('{"results":[]}'), null],
      ['transport', async () => { throw new TypeError('fetch failed'); }, 'synthetic-key'],
    ];
    for (const [failure, answer, key] of cases) {
      let sends = 0;
      const session = new PlatformToolSession({ binding, scope, broker: new CredentialBroker({ resolve: async () => key }), purpose: `provider-free-${failure}`,
        admitHost: admitTicketHost, fetch: async () => { sends += 1; return answer(); } });
      const call = { tool: 'websearch' as const, signal: new AbortController().signal };
      const result = await session.execute({ ...call, callId: failure, arguments: { query: `public fact ${failure}` }, dispatch: { token: Symbol(), active: () => !call.signal.aborted } });
      expect(result.sourceUrl).toBeNull();
      expect(result.text).not.toContain('provider words');
      expect(session.usage.searchFailures).toEqual({ [failure]: 1 });
      expect(sends).toBe(key === null ? 0 : 1);
    }
  });

  it('still counts cached query round trips toward the unit breaker', async () => {
    let sends = 0;
    const session = new PlatformToolSession({ binding, scope, broker: new CredentialBroker({ resolve: async () => 'synthetic-key' }),
      purpose: 'provider-free-breaker', admitHost: admitTicketHost, fetch: async () => { sends += 1; return new Response(JSON.stringify({ results: [] })); },
    });
    for (let n = 0; n < 128; n += 1) await session.execute({ tool: 'websearch', callId: `call-${n}`, arguments: { query: 'public fact' }, signal: new AbortController().signal, dispatch: { token: Symbol(), active: () => true } });
    expect(session.breakerState).toBe('intact');
    const last = await session.execute({ tool: 'websearch', callId: 'call-128', arguments: { query: 'public fact' }, signal: new AbortController().signal, dispatch: { token: Symbol(), active: () => true } });
    expect(last.text).toContain('联网核查未完成');
    expect(session.breakerState).toBe('tripped');
    expect(sends).toBe(1);
  });

  it('counts every refused call as a round trip, so a model that keeps asking ends at 128 with 联网核查未完成', async () => {
    let sends = 0;
    const session = new PlatformToolSession({ binding, scope, broker: new CredentialBroker({ resolve: async () => 'synthetic-key' }),
      purpose: 'provider-free-refusals', admitHost: admitTicketHost,
      fetch: async () => { sends += 1; return new Response(JSON.stringify({ results: [{ title: 'Public source', url: 'https://example.org/source' }] })); },
    });
    const signal = new AbortController().signal;
    await session.execute({ tool: 'websearch', callId: 'first', arguments: { query: 'public fact' }, signal, dispatch: { token: Symbol(), active: () => !signal.aborted } });
    // 1 fresh search + 126 different queries + 1 malformed call = 128 round trips: refused, counted, not yet tripped.
    for (let n = 0; n < 126; n += 1) {
      expect((await session.execute({ tool: 'websearch', callId: `other-${n}`, arguments: { query: `public fact ${n}` }, signal, dispatch: { token: Symbol(), active: () => !signal.aborted } })).text).toContain('本单元的检索次数已用完');
    }
    expect((await session.execute({ tool: 'websearch', callId: 'malformed', arguments: { q: 'x' }, signal, dispatch: { token: Symbol(), active: () => !signal.aborted } })).text).toContain('参数不是');
    expect(session.breakerState).toBe('intact');
    expect(session.usage.refusedSearchCalls).toBe(126);
    const tripped = await session.execute({ tool: 'websearch', callId: 'other-last', arguments: { query: 'yet another public fact' }, signal, dispatch: { token: Symbol(), active: () => !signal.aborted } });
    expect(tripped.text).toContain('联网核查未完成');
    expect(session.breakerState).toBe('tripped');
    expect(session.unitDisclosure).toBe('联网核查未完成');
    expect(sends).toBe(1);
  });

  it('runs tool calls one at a time', async () => {
    let finish: (() => void) | undefined;
    const session = new PlatformToolSession({ binding, scope, broker: new CredentialBroker({ resolve: async () => 'synthetic-key' }),
      purpose: 'provider-free-sequential', admitHost: admitTicketHost,
      fetch: async () => { await new Promise<void>((resolve) => { finish = resolve; }); return new Response(JSON.stringify({ results: [] })); },
    });
    const signal = new AbortController().signal;
    const first = session.execute({ tool: 'websearch', callId: 'first', arguments: { query: 'public fact' }, signal, dispatch: { token: Symbol(), active: () => !signal.aborted } });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await session.execute({ tool: 'webfetch', callId: 'second', arguments: { url: 'https://example.org/source' }, signal, dispatch: { token: Symbol(), active: () => !signal.aborted } })).text).toContain('顺序');
    finish!();
    await first;
    expect(ticketHostHolds()).toBe(0);
  });

  it('admits a search result only from the frozen backend host', () => {
    const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
    const CALL: AssembledContentBlock[] = [{ type: 'tool-call', id: 'call_1', name: 'websearch', arguments: '{"query":"public fact"}' }];
    const RESULT = '[{"title":"Public source","url":"https://example.org/source"}]';
    const facts: EgressBindingFacts = { ...binding, route: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL, systemPrompt: '合成系统提示。', admittedUserMessages: new Set([UNIT]) };
    const payload: AssembledModelPayload = { provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL, system: '合成系统提示。',
      tools: PLATFORM_TOOL_SCHEMAS.map((tool) => JSON.parse(JSON.stringify(tool)) as unknown),
      messages: [
        { role: 'user', content: [{ type: 'text', text: UNIT }], source: { kind: 'user' } },
        { role: 'assistant', content: CALL, source: { kind: 'model', provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL } },
        { role: 'user', content: [{ type: 'tool-result', toolCallId: 'call_1', content: [{ type: 'text', text: RESULT }] }], source: { kind: 'tool', callId: 'call_1' } },
      ] };
    const from = (sourceUrl: string) => evaluateEgress(payload, facts, { ...scope, acceptedToolCallDigests: new Set([assistantToolCallDigest(CALL)]),
      admittedToolResults: new Map([[toolResultKey('call_1', 'websearch'), { callId: 'call_1', tool: 'websearch', sourceUrl,
        sha256: createHash('sha256').update(RESULT).digest('hex'), byteCount: Buffer.byteLength(RESULT) }]]),
      breakerState: () => 'intact', citationAdmits: () => false });
    expect(from(frozen.endpoint!).decision).toBe('transmit-remote');
    for (const other of [...shipped.filter((entry) => entry.id !== frozen.id).map((entry) => entry.endpoint!), 'https://search.parallel.ai/mcp', `http://${frozen.host}/`]) {
      expect(from(other)).toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
    }
  });

  it('releases a search key only for its own frozen slot and never against transmit-remote', async () => {
    const resolve = { resolve: async () => 'synthetic-key' };
    const args = { tool: 'websearch' as const, query: 'public fact' };
    const redeemed = (reference: string) => {
      const facts = { ...binding, searchBackend: { ...binding.searchBackend!, credentialReference: reference } };
      const book = EgressTicketBook.open(facts, scope);
      const decision = evaluateSearchServiceCall({ arguments: args }, facts, scope, book);
      if (decision.decision !== 'call-search-service') throw new Error('expected a search ticket');
      authorizeSearchCall({ ticket: decision.ticket, book, arguments: args });
      return decision.ticket;
    };
    const slot = (credentialReference: string, slotId: string = frozen.credentialSlot) =>
      ({ bindingDigest: binding.bindingDigest, modelRole: 'Main Editorial Role' as const, slot: slotId as typeof frozen.credentialSlot, credentialReference });
    const broker = new CredentialBroker(resolve);
    // Another slot's development reference (the model's own) is never handed to a search host.
    const modelKey = redeemed(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE);
    await expect(broker.releaseTo(slot(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE), modelKey, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    await expect(broker.releaseTo(slot(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, 'opencode-go'), modelKey, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    const ownReference = CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES[frozen.credentialSlot];
    const own = redeemed(ownReference);
    // A transmit-remote decision for the same binding releases a model slot, never a search slot.
    const transmit = { decision: 'transmit-remote', ticketId: 'ticket', bindingDigest: binding.bindingDigest, payloadDigest: 'b'.repeat(64) } as unknown as Parameters<CredentialBroker['releaseTo']>[1];
    await expect(broker.releaseTo(slot(ownReference), transmit, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    expect(await broker.releaseTo(slot(ownReference), own, async (value) => value.length)).toBe('synthetic-key'.length);
    // Once only, and never under ordinary production for a development reference.
    await expect(broker.releaseTo(slot(ownReference), own, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    await expect(new CredentialBroker(resolve, { developmentReferences: 'refused' }).releaseTo(slot(ownReference), redeemed(ownReference), async () => 'never'))
      .rejects.toMatchObject({ code: 'CREDENTIAL_DEVELOPMENT_REFERENCE_REFUSED' });
    expect(broker.releaseCount).toBe(1);
  });
});
