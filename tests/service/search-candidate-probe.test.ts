import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import type { PlatformToolFetch, PlatformToolHttpInit } from '../../src/service/provider/platform-tool-http.js';
import { composeSearchCandidateProbe } from '../../src/service/provider/search-service.js';
import { EditorialStore } from '../../src/service/store.js';
import type { LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

// Issue #1055 into W22-S10a #1181: the candidate connection test composed as the service composes it — the real selected
// launch policy, store connections and Credential Broker — with only the transport and the protected secret store injected.
// No live provider is called: every answer is a local capture.
installNodeNetworkDenial();

const CANDIDATE = { backendId: 'search-deepseek', candidateId: 'deepseek-direct-search-v1' } as const;
type Answer = { status: number; body: string } | Error;

function harness(answer: Answer) {
  const counts = { secretReads: 0, sends: 0, hosts: 0, released: 0 };
  const sent: Array<{ url: string; init: PlatformToolHttpInit }> = [];
  const broker = new CredentialBroker({ resolve: async () => { counts.secretReads += 1; return 'placeholder-search-key'; } }, { developmentReferences: 'refused' });
  const fetch: PlatformToolFetch = async (url, init) => {
    counts.sends += 1; sent.push({ url, init });
    if (answer instanceof Error) throw answer;
    return { status: answer.status, headers: { get: () => 'application/json' }, body: new Blob([answer.body]).stream() };
  };
  const admitHost = () => { counts.hosts += 1; return () => { counts.released += 1; }; };
  return { counts, sent, broker, fetch, admitHost };
}

async function withStore(run: (store: EditorialStore, codeRoot: string, dataRoot: string) => Promise<void>): Promise<void> {
  const roots = await createServiceTestRoots();
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try { await run(store, roots.codeRoot, roots.dataRoot); } finally { store.close(); await roots.dispose(); }
}

function readyKey(store: EditorialStore): string {
  const pending = store.saveSearchBackendCredential('search-deepseek', null, 'needs-attention');
  return store.saveSearchBackendCredential('search-deepseek', pending.credentialReference, 'ready').credentialReference!;
}

async function probe(store: EditorialStore, launchPolicy: LaunchPolicyProjection, scope: string, h: ReturnType<typeof harness>) {
  return composeSearchCandidateProbe({ ...CANDIDATE, operationalScope: scope, launchPolicy, broker: h.broker, fetch: h.fetch, admitHost: h.admitHost,
    connection: (backendId) => store.getSearchBackendConnections().find((entry) => entry.backendId === backendId) });
}

/** The row count of every table, so a probe can be shown to create nothing durable. */
function storeRows(dataRoot: string): string {
  const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all().map((row) => String(row.name));
    return JSON.stringify(tables.map((name) => [name, Number(db.prepare(`SELECT count(*) AS n FROM "${name}"`).get()!.n)]));
  } finally { db.close(); }
}

describe('the candidate connection test under ordinary-production (selected v32, no Main model configured)', () => {
  it('sends exactly the fixed request once and returns at most three bounded, qualified results', async () => {
    await withStore(async (store, codeRoot, dataRoot) => {
      const reference = readyKey(store);
      const policy = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', null);
      expect(policy.providerProcessing.bindingState).toBe('setup-required');
      const hits = [{ title: `A\u0007${'长'.repeat(200)}`, url: 'https://www.unesco.org/en/days/world-book-and-copyright' }, { title: 'private', url: 'http://10.0.0.1/' },
        { title: 'B', url: 'https://en.wikipedia.org/wiki/World_Book_Day' }, { title: 'C', url: 'https://www.un.org/' }, { title: 'D', url: 'https://example.org/' }];
      const h = harness({ status: 200, body: JSON.stringify({ results: hits.map((hit) => ({ ...hit, snippet: 'kept out', content: '' })) }) });
      const before = storeRows(dataRoot);
      const result = await probe(store, policy, 'ordinary-production', h);
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]!.url).toBe('https://api.deepseek.com/v1/tools/search');
      expect(h.sent[0]!.init).toMatchObject({ method: 'POST', redirect: 'manual', body: '{"count":10,"need_content":false,"query":"UNESCO World Book and Copyright Day April 23"}',
        headers: { authorization: 'Bearer placeholder-search-key', 'content-type': 'application/json', accept: 'application/json' } });
      expect(Object.keys(h.sent[0]!.init.headers).sort()).toEqual(['accept', 'authorization', 'content-type']);
      expect(result.candidate).toMatchObject({ candidateId: 'deepseek-direct-search-v1', endpoint: 'https://api.deepseek.com/v1/tools/search', protocol: 'deepseek-direct-search', outcome: 'succeeded', httpStatus: 200 });
      expect(result.candidate!.configurationDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(result.resultCount).toBe(4);
      expect(result.results.map((hit) => hit.url)).toEqual(['https://www.unesco.org/en/days/world-book-and-copyright', 'https://en.wikipedia.org/wiki/World_Book_Day', 'https://www.un.org/']);
      expect(Array.from(result.results[0]!.title)).toHaveLength(120);
      expect(result.results[0]!.title).not.toMatch(/\u0007/u);
      expect(JSON.stringify(result)).not.toContain('kept out');
      expect(h.counts).toEqual({ secretReads: 1, sends: 1, hosts: 1, released: 1 });
      expect(storeRows(dataRoot)).toBe(before);
      expect(store.getSearchBackendConnections().find((entry) => entry.backendId === 'search-deepseek')!.credentialReference).toBe(reference);
    });
  });

  it.each([
    ['an empty result list as a valid success', { status: 200, body: '{"results":[]}' }, 'succeeded-empty', 200],
    ['a body that is not the documented shape', { status: 200, body: '{"data":[]}' }, 'malformed-response', 200],
    ['an HTTP rejection by status only', { status: 402, body: '{"error":{"message":"Insufficient Balance from the provider"}}' }, 'http-rejected', 402],
    ['a transport that ends unknown', new TypeError('fetch failed'), 'transport-unknown', null],
  ] as const)('distinguishes %s, without the provider body', async (_name, answer, outcome, httpStatus) => {
    await withStore(async (store, codeRoot) => {
      readyKey(store);
      const h = harness(answer);
      const result = await probe(store, await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', null), 'ordinary-production', h);
      expect(result.candidate).toMatchObject({ outcome, httpStatus });
      expect(result.results).toEqual([]);
      expect(JSON.stringify(result)).not.toMatch(/Insufficient|fetch failed/u);
      expect(h.counts).toMatchObject({ sends: 1, hosts: 1, released: 1 });
    });
  });

  it('refuses a missing key and a key removed while its value is read, sending nothing', async () => {
    await withStore(async (store, codeRoot) => {
      const policy = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', null);
      const missing = harness({ status: 200, body: '{"results":[]}' });
      await expect(probe(store, policy, 'ordinary-production', missing)).rejects.toMatchObject({ code: 'SEARCH_CREDENTIAL_MISSING' });
      expect(missing.counts).toEqual({ secretReads: 0, sends: 0, hosts: 0, released: 0 });
      const reference = readyKey(store);
      const raced = harness({ status: 200, body: '{"results":[]}' });
      const broker = new CredentialBroker({ resolve: async () => { raced.counts.secretReads += 1; store.saveSearchBackendCredential('search-deepseek', reference, 'missing'); return 'placeholder'; } },
        { developmentReferences: 'refused' });
      await expect(probe(store, policy, 'ordinary-production', { ...raced, broker })).rejects.toMatchObject({ code: 'CREDENTIAL_BINDING_STALE' });
      expect(raced.counts).toEqual({ secretReads: 1, sends: 0, hosts: 0, released: 0 });
    });
  });

  it('refuses an unknown or mismatched backend and candidate pair before any decision', async () => {
    await withStore(async (store, codeRoot) => {
      readyKey(store);
      const policy = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', null);
      const h = harness({ status: 200, body: '{"results":[]}' });
      for (const pair of [{ backendId: 'search-brave', candidateId: 'deepseek-direct-search-v1' }, { backendId: 'search-deepseek', candidateId: 'deepseek-direct-search-v2' }]) {
        await expect(composeSearchCandidateProbe({ ...pair, operationalScope: 'ordinary-production', launchPolicy: policy, broker: h.broker, fetch: h.fetch, admitHost: h.admitHost,
          connection: () => store.getSearchBackendConnections()[0] })).rejects.toMatchObject({ code: 'SEARCH_CANDIDATE_UNKNOWN' });
      }
      expect(h.counts).toEqual({ secretReads: 0, sends: 0, hosts: 0, released: 0 });
    });
  });
});

describe('the candidate connection test outside ordinary-production', () => {
  it('development-ci, developer-live and fixture-recording read no connection, resolve no secret and send nothing', async () => {
    await withStore(async (store, codeRoot) => {
      readyKey(store);
      const production = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', null);
      const launches: Array<[string, LaunchPolicyProjection]> = [
        ['development-ci', await resolveSourceCheckoutLaunchPolicy(codeRoot, 'development-ci')],
        ['developer-live', await resolveSourceCheckoutLaunchPolicy(codeRoot, 'developer-live')],
        // Even handed the production projection, a non-production scope is refused by the scope check itself.
        ['developer-live', production], ['fixture-recording', production], ['development-ci', production],
      ];
      for (const [scope, launchPolicy] of launches) {
        const h = harness({ status: 200, body: '{"results":[]}' });
        let connectionReads = 0;
        await expect(composeSearchCandidateProbe({ ...CANDIDATE, operationalScope: scope, launchPolicy, broker: h.broker, fetch: h.fetch, admitHost: h.admitHost,
          connection: () => { connectionReads += 1; return undefined; } })).rejects.toMatchObject({ code: 'SEARCH_CANDIDATE_PROBE_SCOPE_REFUSED' });
        expect({ ...h.counts, connectionReads }).toEqual({ secretReads: 0, sends: 0, hosts: 0, released: 0, connectionReads: 0 });
      }
      expect((await resolveSourceCheckoutLaunchPolicy(codeRoot, 'development-ci')).providerProcessing.searchConnectionTest).toBeUndefined();
    });
  });
});
