import { describe, expect, it } from 'vitest';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { EgressTicketBook, evaluateSearchServiceCall, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { platformToolsFromProjection } from '../../src/service/provider/search-service.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { armHostAllowanceSet, armPerTicketHostAdmission, admitTicketHost, hostAllowanceSet, allowanceAdmitsConnection, installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { searchToolsRuleStub } from '../support/policy-rules.js';

const frozen = SEARCH_BACKENDS.find((entry) => entry.id === 'search-tinyfish')!;
armHostAllowanceSet([{ host: 'opencode.ai', port: 443 }, { host: frozen.host!, port: 443 }]);
armPerTicketHostAdmission();
installNodeNetworkDenial();
const binding: EgressBindingFacts = { bindingDigest: 'a'.repeat(64), route: 'opencode-go', model: 'deepseek-v4.1-flash', systemPrompt: '',
  admittedUserMessages: new Set(), outboundDataCategory: 'public-or-synthetic',
  policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v14', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
  platformTools: platformToolsFromProjection(searchToolsRuleStub()),
  searchBackend: { backendId: frozen.id, host: frozen.host!, endpoint: frozen.endpoint!, credentialSlot: frozen.credentialSlot, credentialReference: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
};
const scope = { currentBindingDigest: () => 'a'.repeat(64), acceptedOutputDigests: new Set<string>(), ceilingState: () => 'within' as const };

describe('frozen backend egress and per-Run tool accounting', () => {
  it('holds exactly the model and frozen backend; another backend and every global fetch stay denied', async () => {
    expect(hostAllowanceSet()).toEqual([{ host: 'opencode.ai', port: 443 }, { host: frozen.host!, port: 443 }]);
    for (const entry of SEARCH_BACKENDS.filter((candidate) => candidate.id !== frozen.id)) {
      expect(allowanceAdmitsConnection([{ host: entry.host, port: 443 }])).toBe(false);
    }
    await expect(globalThis.fetch(`https://${frozen.host}/`)).rejects.toMatchObject({ code: 'AI7_OUTBOUND_NETWORK_DENIED' });
    expect(() => EgressTicketBook.open({ ...binding, policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 } }, scope)).toThrow(/NOT_NAMED/);
    const book = EgressTicketBook.open(binding, scope);
    const alien = { ...binding, searchBackend: { ...binding.searchBackend!, backendId: 'search-brave', host: 'other.example.org' } };
    expect(evaluateSearchServiceCall({ arguments: { tool: 'websearch', query: 'public fact' } }, alien, scope, book).decision).toBe('refuse');
  });

  it('searches a query once across units, binds fetches to citations and records counts, bytes and provenance', async () => {
    let searches = 0; let pages = 0;
    const session = new PlatformToolSession({ binding, scope, broker: new CredentialBroker({ resolve: async () => 'synthetic-key' }),
      purpose: 'provider-free-boundary', admitHost: admitTicketHost,
      fetch: async (url) => {
        if (new URL(url).hostname === frozen.host) { searches += 1; return new Response(JSON.stringify({ results: [{ title: 'Public source', url: 'https://example.org/source', snippet: 'Public fact' }] })); }
        expect(url).toBe('https://example.org/source'); pages += 1;
        return new Response('<html><body><h1>Public source</h1><p>Public fact</p></body></html>', { headers: { 'content-type': 'text/html' } });
      },
    });
    const search = { tool: 'websearch' as const, arguments: { query: 'public fact' }, signal: new AbortController().signal };
    const first = await session.execute({ ...search, callId: 'one' });
    session.admit({ ...first, tool: 'websearch', callId: 'one' });
    expect([...session.egressScope.admittedToolResults!.values()][0]).toMatchObject({ sourceKind: 'tool', backendId: frozen.id, host: frozen.host });
    session.startUnit();
    expect(await session.execute({ ...search, callId: 'two' })).toEqual(first);
    const bad = await session.execute({ callId: 'uncited', tool: 'webfetch', arguments: { url: 'https://example.org/not-cited' }, signal: new AbortController().signal });
    expect(bad.sourceUrl).toBeNull();
    const page = await session.execute({ callId: 'cited', tool: 'webfetch', arguments: { url: 'https://example.org/source' }, signal: new AbortController().signal });
    expect(page.text).toContain('# Public source');
    expect(searches).toBe(1); expect(pages).toBe(1);
    expect(session.usage).toMatchObject({ requests: 2, searchCalls: { 'search-tinyfish': 1 }, fetchCount: 1 });
    expect(session.usage.fetchBytes).toBeGreaterThan(0);
    expect(session.provenance).toHaveLength(2);
    expect(session.provenance.every((entry) => /^[0-9a-f]{64}$/u.test(entry.argumentsDigest) && /^[0-9a-f]{64}$/u.test(entry.responseDigest))).toBe(true);
  });
});
