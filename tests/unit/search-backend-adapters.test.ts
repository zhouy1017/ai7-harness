import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { searchBackend, searchBackendConfigurationDigest } from '../../src/service/provider/search-backends/index.js';
import { platformToolsFromProjection, authorizeSearchCall, sendSearchCall, probeSearchBackend, SEARCH_BACKEND_PROBE_QUERY } from '../../src/service/provider/search-service.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { EgressTicketBook, evaluateSearchServiceCall, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { toolArgumentsDigest } from '../../src/service/provider/platform-tools.js';
import { searchToolsRuleStub } from '../support/policy-rules.js';

function bodyOf(id: string, hits: Array<{ title: string; url: string }>): string {
  if (id === 'search-bochaai') return JSON.stringify({ data: { webPages: { value: hits.map((hit) => ({ name: hit.title, url: hit.url })) } } });
  if (id === 'search-brave') return JSON.stringify({ type: 'search', web: { results: hits } });
  if (id === 'search-deepseek') return JSON.stringify({ content: [{ type: 'web_search_tool_result', content: hits.map((hit) => ({ ...hit, type: 'web_search_result' })) }] });
  return JSON.stringify({ results: hits });
}

function facts(id = 'search-tinyfish'): EgressBindingFacts {
  const declared = searchBackend(id).declaration;
  return { bindingDigest: 'a'.repeat(64), route: 'opencode-go', model: 'deepseek-v4.1-flash', systemPrompt: '',
    outboundDataCategory: 'public-or-synthetic', admittedUserMessages: new Set(),
    policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v14', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
    platformTools: platformToolsFromProjection(searchToolsRuleStub()),
    searchBackend: { backendId: id, host: declared.host!, endpoint: declared.endpoint!, credentialSlot: declared.credentialSlot, credentialReference: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  };
}
const scope = { currentBindingDigest: () => 'a'.repeat(64), acceptedOutputDigests: new Set<string>(), ceilingState: () => 'within' as const };

describe('the shipped keyed search adapters', () => {
  for (const entry of SEARCH_BACKENDS.filter((backend) => backend.shipped)) {
    it(`${entry.id}: reads the sanitized #883 capture, empty results and authentication refusal`, () => {
      const fixture = JSON.parse(readFileSync(new URL(`../fixtures/search-backends/${entry.id}.json`, import.meta.url), 'utf8')) as { hits: Array<{ title: string; url: string }> };
      const adapter = searchBackend(entry.id);
      expect(adapter.readResults(200, 'application/json', bodyOf(entry.id, fixture.hits))).toEqual(fixture.hits.map((hit) => ({ ...hit, url: new URL(hit.url).href, snippet: '' })));
      expect(adapter.readResults(200, 'application/json', bodyOf(entry.id, []))).toEqual([]);
      expect(adapter.readResults(401, 'application/json', bodyOf(entry.id, fixture.hits))).toBeNull();
      expect(adapter.readResults(200, 'application/json', '{')).toBeNull();
      const request = adapter.request(SEARCH_BACKEND_PROBE_QUERY, { credential: 'synthetic-key', count: 10 });
      expect(new URL(request.url).hostname).toBe(entry.host);
      expect(request.method).toBe(entry.method);
      expect(JSON.stringify(request)).toContain('synthetic-key');
      expect(() => adapter.request('q', { credential: '', count: 10 })).toThrow(/CREDENTIAL_REQUIRED/);
      expect(searchBackendConfigurationDigest(entry.id)).toMatch(/^[0-9a-f]{64}$/u);
    });
  }

  it('refuses unknown and unshipped ids and a transplanted backend host', () => {
    expect(() => searchBackend('search-kimi')).toThrow(/NOT_SHIPPED/);
    expect(() => searchBackendConfigurationDigest('search-kimi')).toThrow(/NOT_SHIPPED/);
    const bad = searchToolsRuleStub();
    bad.platformTools.websearch.backends[0]!.host = 'other.example.org';
    expect(platformToolsFromProjection(bad)).toBeNull();
    expect(platformToolsFromProjection({ ...searchToolsRuleStub(), webSearchToolAllowed: false })).toBeNull();
  });

  it('releases a credential only for the redeemed search ticket and selected slot, and sends once', async () => {
    const binding = facts();
    const book = EgressTicketBook.open(binding, scope);
    const args = { tool: 'websearch' as const, query: SEARCH_BACKEND_PROBE_QUERY };
    const decision = evaluateSearchServiceCall({ arguments: args }, binding, scope, book);
    if (decision.decision !== 'call-search-service') throw new Error('expected search ticket');
    const broker = new CredentialBroker({ resolve: async () => 'synthetic-key' });
    const slot = { bindingDigest: binding.bindingDigest, modelRole: 'Main Editorial Role' as const, slot: 'search-tinyfish' as const, credentialReference: binding.searchBackend!.credentialReference };
    await expect(broker.releaseTo(slot, decision.ticket, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    expect(decision.ticket.argumentsDigest).toBe(toolArgumentsDigest(args));
    const authorized = authorizeSearchCall({ ticket: decision.ticket, book, arguments: args });
    await expect(broker.releaseTo({ ...slot, slot: 'search-brave' }, decision.ticket, async () => 'never')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    let sends = 0; let holds = 0;
    const fetch = async () => { sends += 1; return new Response(bodyOf('search-tinyfish', [{ title: 'Public source', url: 'https://example.org/source' }])); };
    const credentials = { broker, modelRole: 'Main Editorial Role' as const, admitHost: (target: { host: string }) => { expect(target.host).toBe(binding.searchBackend!.host); holds += 1; return () => { holds -= 1; }; } };
    expect((await sendSearchCall(authorized, fetch, undefined, credentials)).text).toContain('example.org/source');
    await expect(sendSearchCall(authorized, fetch, undefined, credentials)).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(sends).toBe(1); expect(holds).toBe(0); expect(broker.releaseCount).toBe(1);
  });

  it('tests only the fixed public query and projects at most three bounded titles and URLs', async () => {
    let sent = '';
    const binding = facts();
    const result = await probeSearchBackend({ binding, broker: new CredentialBroker({ resolve: async () => 'synthetic-key' }), admitHost: () => () => undefined,
      fetch: async (url) => { sent = new URL(url).searchParams.get('query')!; return new Response(bodyOf('search-tinyfish', Array.from({ length: 6 }, (_, i) => ({ title: 'x'.repeat(200), url: `https://example.org/${i}` })))); },
    });
    expect(sent).toBe(SEARCH_BACKEND_PROBE_QUERY); expect(result.resultCount).toBe(6); expect(result.results).toHaveLength(3);
    expect(result.results.every((hit) => hit.title.length === 120)).toBe(true);
  });
});
