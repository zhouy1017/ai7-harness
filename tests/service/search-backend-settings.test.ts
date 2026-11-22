import { describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { probeConfiguredSearchBackend } from '../../src/service/provider/search-service.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';

describe('the persisted search settings and schema 74', () => {
  it('tests a configured search key before a Main model exists, using a fixed public query', async () => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', null);
      expect(policy.providerProcessing.admittedRules).toEqual([]);
      const connection = store.saveSearchBackendCredential('search-tinyfish', null, 'ready');
      const sent: string[] = [];
      const result = await probeConfiguredSearchBackend({ backendId: 'search-tinyfish', policy, connection,
        broker: new CredentialBroker({ resolve: async () => 'synthetic-key' }, { developmentReferences: 'refused' }),
        admitHost: () => () => undefined, fetch: async (url) => {
          sent.push(String(url));
          return new Response(JSON.stringify({ results: [{ title: 'Public book day', url: 'https://example.org/day' }] }), { headers: { 'content-type': 'application/json' } });
        } });
      expect(result).toMatchObject({ reachable: true, resultCount: 1 });
      expect(new URL(sent[0]!).searchParams.get('query')).toBe('UNESCO World Book and Copyright Day April 23');
    } finally { store.close(); await roots.dispose(); }
  });
  it('makes the first ready key the default and clears a removed fallback', async () => {
    const roots = await createServiceTestRoots();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(store.getSearchBackendSettings().backends.find((entry) => entry.backendId === 'search-tinyfish')!.reachable).toBe(false);
      store.saveSearchBackendCredential('search-brave', null, 'ready');
      expect(store.getSearchBackendSettings().selectedBackendId).toBe('search-brave');
      store.saveSearchBackendCredential('search-parallel', null, 'ready');
      store.selectSearchBackend('search-parallel', 'fallback');
      store.saveSearchBackendCredential('search-parallel', null, 'missing');
      expect(store.getSearchBackendSettings().fallbackBackendId).toBeNull();
      expect(store.getSearchBackendSettings().selectedBackendId).toBe('search-brave');
    } finally { store.close(); await roots.dispose(); }
  });
  it('keeps selection and opaque per-backend credential references across restart', async () => {
    const roots = await createServiceTestRoots();
    let store: EditorialStore | undefined;
    try {
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const settings = store.getSearchBackendSettings();
      expect(settings.selectedBackendId).toBe('search-tinyfish');
      expect(settings.backends.map((entry) => entry.backendId)).toEqual(['search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai']);
      // Plain price lines; the one price whose vendor source was not retained (#884) carries that caveat, the others none.
      const byId = new Map(settings.backends.map((entry) => [entry.backendId, entry]));
      expect(byId.get('search-tinyfish')!.price).toBe('免费');
      expect(byId.get('search-deepseek')!.price).toMatch(/^按 token 计费，实测约 USD 0\.\d{4} \/ 次$/u);
      expect(byId.get('search-brave')!.price).toBe('USD 5 / 1000 次');
      expect(byId.get('search-bochaai')!.price).toBe('CNY 0.036 / 次');
      expect(settings.backends.filter((entry) => entry.note?.includes('单价来源未经核实')).map((entry) => entry.backendId)).toEqual(['search-bochaai']);
      expect(byId.get('search-tinyfish')!.note).toContain('30 次/分钟');
      expect(byId.get('search-brave')!.note).toContain('间歇性');
      const first = store.saveSearchBackendCredential('search-brave', null, 'needs-attention');
      const saved = store.saveSearchBackendCredential('search-brave', first.credentialReference, 'ready');
      expect(saved.credentialReference).toMatch(/^[0-9a-f-]{36}$/u);
      store.selectSearchBackend('search-brave');
      expect(() => store!.selectSearchBackend('search-kimi')).toThrow(/未提供/u);
      store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getSearchBackendSettings().selectedBackendId).toBe('search-brave');
      expect(store.getSearchBackendConnections().find((row) => row.backendId === 'search-brave')).toEqual({ ...saved, selected: true, selectedAt: store.getSearchBackendConnections().find((row) => row.backendId === 'search-brave')!.selectedAt });
      const removed = store.saveSearchBackendCredential('search-brave', null, 'missing');
      expect(removed.credentialReference).toBe(first.credentialReference);
      expect(removed.credentialOperationState).toBe('missing');
    } finally { store?.close(); await roots.dispose(); }
  });

  it('persists the default-off source override when switching the selected backend and reopening', async () => {
    const roots = await createServiceTestRoots();
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(store.getSearchBackendSettings().alwaysUseSelectedBackend).toBe(false);
      store.selectSearchBackend('search-brave', undefined, true);
      store.selectSearchBackend('search-parallel');
      store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.getSearchBackendSettings()).toMatchObject({ selectedBackendId: 'search-parallel', alwaysUseSelectedBackend: true });
      store.selectSearchBackend('search-parallel', undefined, false);
      expect(store.getSearchBackendSettings().alwaysUseSelectedBackend).toBe(false);
    } finally { store.close(); await roots.dispose(); }
  });

  it('discloses the DeepSeek direct-search candidate as unmeasured and unselectable beside the unchanged ranked backends (Issue #1055)', async () => {
    const roots = await createServiceTestRoots();
    let store: EditorialStore | undefined;
    try {
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      const settings = store.getSearchBackendSettings();
      expect(settings.backends.map((entry) => entry.backendId)).toEqual(['search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai']);
      expect(settings.candidates).toHaveLength(3);
      const [candidate] = settings.candidates;
      expect(candidate).toMatchObject({ backendId: 'search-deepseek', candidateId: 'deepseek-direct-search-v1', revision: 1, measurement: 'not-measured', selectable: false,
        endpoint: 'https://api.deepseek.com/v1/tools/search', protocol: 'deepseek-direct-search', capabilities: { search: true, fetch: true }, price: 'USD 0.75 / 1000 次' });
      const disclosure = candidate!.disclosure.join(' ');
      for (const fact of ['未实测', '不作为独立排名默认后端或备用来源', '/v1/tools/fetch', 'UNESCO World Book and Copyright Day April 23', '2026-10-29', '空结果、失败与超时不计费', '不承诺直连调用免费', '不保存']) {
        expect(disclosure).toContain(fact);
      }
      expect(() => store!.selectSearchBackend('deepseek-direct-search-v1')).toThrow(/未提供/u);
      expect(() => store!.saveSearchBackendCredential('deepseek-direct-search-v1', null, 'ready')).toThrow(/未提供/u);
      expect(store.getSearchBackendSettings().selectedBackendId).toBe('search-tinyfish');
    } finally { store?.close(); await roots.dispose(); }
  });

});
