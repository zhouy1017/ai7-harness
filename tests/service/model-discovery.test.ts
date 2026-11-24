import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import type { ModelServiceRouteId } from '../../src/shared/protocol/model-service.js';
import { refreshModelServiceModels } from '../../src/service/provider/model-discovery.js';
import { listProviderModels, modelRequestNotSent, PROVIDER_ROUTE_PROFILES } from '../../src/service/provider/deepseek-adapter.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

let store: EditorialStore | undefined;
afterEach(() => { store?.close(); store = undefined; });
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const syntheticRuntime = (nativeFetch: typeof fetch) => ({ scope: 'ordinary-production' as const, nativeFetch });
const syntheticResolver = { resolve: async () => 'synthetic' };
const channelModels = (store: EditorialStore, route: ModelServiceRouteId) =>
  modelServiceChannels((channel) => store.getModelServiceModels(channel)).find((channel) => channel.route === route)!.models;

describe('account model discovery', () => {
  it.each([
    ['openai-platform', 'https://api.openai.com/v1/models', 'authorization'],
    ['deepseek-open-platform', 'https://api.deepseek.com/models', 'authorization'],
    ['opencode-go', 'https://opencode.ai/zen/go/v1/models', 'authorization'],
    ['opencode-zen', 'https://opencode.ai/inference/v1/models', 'authorization'],
    ['anthropic-claude', 'https://api.anthropic.com/v1/models', 'x-api-key'],
  ] as const)('lists %s at its configured base using its own authentication', async (route, endpoint, header) => {
    const send = vi.fn<typeof fetch>(async () => response({ data: [{ id: 'account/new-model', display_name: 'Account model' }, { id: 'second' }] }));
    expect(await listProviderModels(PROVIDER_ROUTE_PROFILES[route], send, 'synthetic-test-value')).toEqual([
      { modelId: 'account/new-model', modelLabel: 'Account model' }, { modelId: 'second', modelLabel: 'second' },
    ]);
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe(endpoint);
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', headers: { [header]: header === 'authorization' ? 'Bearer synthetic-test-value' : 'synthetic-test-value' } });
    expect(init?.body).toBeUndefined();
    if (route === 'anthropic-claude') expect(new Headers(init?.headers).get('anthropic-version')).toBe(PROVIDER_ROUTE_PROFILES[route].anthropicVersion);
  });

  it('follows Gemini pages and keeps thinking flags only as hints on generateContent models', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ models: [
      { name: 'models/gemini-account', displayName: 'Account Gemini', supportedGenerationMethods: ['generateContent'], thinking: true },
      { name: 'models/embedding-only', supportedGenerationMethods: ['embedContent'] },
    ], nextPageToken: 'page-two' })).mockResolvedValueOnce(response({ models: [
      { name: 'models/gemini-next', supportedGenerationMethods: ['generateContent'], thinking: 'unsupported' },
    ] }));
    expect(await listProviderModels(PROVIDER_ROUTE_PROFILES['google-gemini'], send, 'synthetic')).toEqual([
      { modelId: 'gemini-account', modelLabel: 'Account Gemini', reasoningEvidence: {
        source: 'provider-model-list', observedAt: expect.any(String), completeness: 'partial', thinking: { supported: true },
      } }, { modelId: 'gemini-next', modelLabel: 'gemini-next' },
    ]);
    expect(send.mock.calls.map(([url]) => url)).toEqual(['https://generativelanguage.googleapis.com/v1beta/models', 'https://generativelanguage.googleapis.com/v1beta/models?pageToken=page-two']);
    expect(new Headers(send.mock.calls[0]![1]?.headers).get('x-goog-api-key')).toBe('synthetic');
  });

  it('follows Claude pagination without hiding models other than the last tested model', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ data: [{ id: 'opus' }], has_more: true, last_id: 'opus' }))
      .mockResolvedValueOnce(response({ data: [{ id: 'haiku', display_name: 'Haiku' }], has_more: false }));
    expect((await listProviderModels(PROVIDER_ROUTE_PROFILES['anthropic-claude'], send, 'synthetic')).map((model) => model.modelId)).toEqual(['opus', 'haiku']);
    expect(send.mock.calls[1]![0]).toBe('https://api.anthropic.com/v1/models?after_id=opus');
  });

  it('keeps CI provider-free and persists live catalogue metadata through restart and offline refresh', async () => {
    const roots = await createServiceTestRoots('ai7-model-discovery-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.saveModelServiceConnection('Synthetic account', null, 'ready', 'anthropic-claude');
    const resolver = { resolve: vi.fn(async () => 'synthetic') };
    expect(await refreshModelServiceModels(store, null, 'anthropic-claude', resolver)).toMatchObject({ status: 'failure', code: 'MODEL_SERVICE_UNREACHABLE' });
    expect(resolver.resolve).not.toHaveBeenCalled();
    const yes = { supported: true }, no = { supported: false };
    const send = vi.fn<typeof fetch>(async () => response({ data: [
      { id: 'account-opus', display_name: 'Account Opus', capabilities: {
        effort: { supported: true, low: yes, medium: no, high: yes, xhigh: no, max: yes },
        thinking: { supported: true, types: { adaptive: yes, between_tools: no, enabled: 'bad', disabled: yes } },
      } },
      { id: 'account-haiku', capabilities: { effort: no } },
      { id: 'account-partial', capabilities: { effort: { low: yes, medium: no, high: { supported: 'yes' } }, thinking: [] } },
      { id: 'account-contradictory', capabilities: { effort: { supported: false, low: yes } } },
    ] }));
    expect(await refreshModelServiceModels(store, syntheticRuntime(send), 'anthropic-claude', resolver)).toEqual({ status: 'success', modelCount: 4 });
    const original = store.getModelServiceModels('anthropic-claude');
    expect(original.find((model) => model.modelId === 'account-opus')?.reasoningEvidence).toEqual({
      source: 'provider-model-list', observedAt: expect.any(String), completeness: 'complete',
      effort: { supported: true, levels: ['low', 'high', 'max'], unsupportedLevels: ['medium', 'xhigh'] },
      thinking: { supported: true, modes: { adaptive: true, between_tools: false, disabled: true } },
    });
    store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    send.mockRejectedValueOnce(new Error('offline'));
    expect(await refreshModelServiceModels(store, { scope: 'ordinary-production', nativeFetch: send }, 'anthropic-claude', resolver)).toMatchObject({ status: 'failure', code: 'MODEL_SERVICE_UNREACHABLE' });
    expect(store.getModelServiceModels('anthropic-claude')).toEqual(original);
    const models = channelModels(store, 'anthropic-claude');
    expect(models.find((model) => model.modelId === 'account-opus')).toMatchObject({
      modelLabel: 'Account Opus', main: 'eligible', fast: 'eligible',
      supportedEfforts: { status: 'supported', levels: ['low', 'high', 'max'], completeness: 'complete', provenance: { kind: 'discovered', observedAt: expect.any(String) } },
    });
    expect(models.find((model) => model.modelId === 'account-haiku')?.supportedEfforts).toMatchObject({
      status: 'unsupported', levels: [], completeness: 'complete', provenance: { kind: 'discovered' },
    });
    expect(models.find((model) => model.modelId === 'account-partial')?.supportedEfforts).toMatchObject({
      status: 'supported', levels: ['low'], completeness: 'partial',
    });
    expect(models.find((model) => model.modelId === 'account-contradictory')).not.toHaveProperty('supportedEfforts');
  });

  it('keeps only known OpenCode Go efforts and isolates malformed models', async () => {
    const route = 'opencode-go';
    const roots = await createServiceTestRoots('ai7-model-discovery-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.saveModelServiceConnection('Synthetic account', null, 'ready', route);
    const row = (id: string, effort: unknown) => ({ id, capabilities: { reasoning: { supported: true, effort } } });
    const send = vi.fn<typeof fetch>(async () => response({ data: [
      row('gemini-4-argon', ['high', 'low', 'medium']),
      row('deepseek-v4.1-flash', ['low', 'high', 'max']),
      row('partial-go', ['high', 'future', 7]),
      row('bad-go', 'high'),
    ] }));
    expect(await refreshModelServiceModels(store, syntheticRuntime(send), route, syntheticResolver)).toEqual({ status: 'success', modelCount: 4 });
    const models = channelModels(store, route);
    const effortOf = (id: string) => models.find((model) => model.modelId === id)?.supportedEfforts;
    expect(effortOf('gemini-4-argon')).toMatchObject({ status: 'supported', levels: ['low', 'medium', 'high'], completeness: 'complete' });
    expect(effortOf('deepseek-v4.1-flash')).toMatchObject({ status: 'supported', levels: ['low', 'high', 'max'], completeness: 'complete' });
    expect(effortOf('partial-go')).toMatchObject({ status: 'supported', levels: ['high'], completeness: 'partial' });
    expect(models.find((model) => model.modelId === 'bad-go')).not.toHaveProperty('supportedEfforts');
  });

  it('publishes Gemini only after the final page and uses exact documented efforts for known models', async () => {
    const route = 'google-gemini';
    const roots = await createServiceTestRoots('ai7-model-discovery-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.saveModelServiceConnection('Synthetic account', null, 'ready', route);
    const page = (id: string, thinking: boolean, nextPageToken?: string) => response({
      models: [{ name: `models/${id}`, supportedGenerationMethods: ['generateContent'], thinking }], nextPageToken,
    });
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(page('gemini-custom', false, 'page-two'))
      .mockResolvedValueOnce(page('gemini-3.8-flash', true));
    expect(await refreshModelServiceModels(store, syntheticRuntime(send), route, syntheticResolver)).toEqual({ status: 'success', modelCount: 2 });
    const models = channelModels(store, route);
    expect(models.find((model) => model.modelId === 'gemini-custom')).not.toHaveProperty('supportedEfforts');
    expect(models.find((model) => model.modelId === 'gemini-3.8-flash')?.supportedEfforts).toMatchObject({
      status: 'supported', levels: ['low', 'medium', 'high'], completeness: 'partial',
      provenance: { kind: 'documented', source: expect.any(String), readOn: expect.any(String) },
    });
    const lastGood = store.getModelServiceModels(route);
    send.mockResolvedValueOnce(page('gemini-uncommitted', true, 'page-two')).mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await refreshModelServiceModels(store, syntheticRuntime(send), route, syntheticResolver)).toMatchObject({ status: 'failure' });
    expect(store.getModelServiceModels(route)).toEqual(lastGood);
  });

  it('reads legacy rows, and OpenAI catalogue fields do not become effort evidence', async () => {
    const route = 'openai-platform';
    const roots = await createServiceTestRoots('ai7-model-discovery-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const connection = store.saveModelServiceConnection('Synthetic account', null, 'ready', route);
    const legacy = { modelId: 'legacy-openai', modelLabel: 'Legacy name' };
    store.cacheModelServiceModels(connection, [legacy]);
    store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getModelServiceModels(route)).toContainEqual(legacy);
    const send = vi.fn<typeof fetch>(async () => response({ data: [
      { id: 'custom-openai', thinking: true, capabilities: { reasoning: { supported: true, effort: ['none', 'high'] } } },
    ] }));
    expect(await refreshModelServiceModels(store, syntheticRuntime(send), route, syntheticResolver)).toEqual({ status: 'success', modelCount: 1 });
    expect(store.getModelServiceModels(route)).toContainEqual({ modelId: 'custom-openai', modelLabel: 'custom-openai' });
    expect(channelModels(store, route).find((model) => model.modelId === 'custom-openai')).not.toHaveProperty('supportedEfforts');
  });

  it('uses DeepSeek documentation only for the declared exact model IDs', () => {
    const route = 'deepseek-open-platform';
    const models = modelServiceChannels((channel) => channel === route
      ? ['deepseek-flash', 'deepseek-v4-pro', 'custom-deepseek'].map((modelId) => ({ modelId, modelLabel: modelId })) : [])
      .find((channel) => channel.route === route)!.models;
    for (const id of ['deepseek-flash', 'deepseek-v4-pro']) {
      expect(models.find((model) => model.modelId === id)?.supportedEfforts).toEqual({
        status: 'supported', levels: ['low', 'high', 'max'], completeness: 'partial',
        provenance: { kind: 'documented', source: 'https://api-docs.deepseek.com/guides/thinking_mode/', readOn: '2026-11-14' },
      });
    }
    expect(models.find((model) => model.modelId === 'custom-deepseek')).not.toHaveProperty('supportedEfforts');
  });

  it.each([
    ['connect timeout', 'MODEL_SERVICE_UNREACHABLE', (init?: RequestInit) => { throw modelRequestNotSent(init!, Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' })); }],
    ['401', 'MODEL_DISCOVERY_CREDENTIAL_REJECTED', async () => new Response('', { status: 401 })],
    ['403', 'MODEL_DISCOVERY_CREDENTIAL_REJECTED', async () => new Response('', { status: 403 })],
    ['HTTP 500', 'MODEL_DISCOVERY_UNAVAILABLE', async () => new Response('', { status: 500 })],
    ['empty data', 'MODEL_DISCOVERY_EMPTY', async () => response({ data: [] })],
    ['invalid JSON', 'MODEL_DISCOVERY_INVALID', async () => new Response('{', { headers: { 'content-type': 'application/json' } })],
  ] as const)('reports %s and retains the last successful catalogue', async (_name, code, fetchResult) => {
    const roots = await createServiceTestRoots('ai7-model-discovery-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const connection = store.saveModelServiceConnection('Synthetic account', null, 'ready', 'anthropic-claude');
    const resolver = { resolve: async () => 'synthetic' };
    const runtime = (nativeFetch: typeof fetch) => ({ scope: 'ordinary-production' as const, nativeFetch });
    const success = vi.fn<typeof fetch>(async () => response({ data: [{ id: 'last-good-model' }] }));
    expect(await refreshModelServiceModels(store!, runtime(success), 'anthropic-claude', resolver)).toEqual({ status: 'success', modelCount: 1 });
    const failingFetch = vi.fn<typeof fetch>((input, init) => Promise.resolve(fetchResult(init)) as Promise<Response>);
    const result = await refreshModelServiceModels(store, runtime(failingFetch), 'anthropic-claude', resolver);
    expect(result).toMatchObject({ status: 'failure', code });
    if (code === 'MODEL_DISCOVERY_UNAVAILABLE') expect(result).toEqual({ status: 'failure', code, reason: '模型服务没有返回模型列表（HTTP 500）' });
    expect(store.getModelServiceModels('anthropic-claude').some((model) => model.modelId === 'last-good-model')).toBe(true);
    expect(store.getModelServiceRouteConnection('anthropic-claude')?.credentialReference).toBe(connection.credentialReference);
  });

  it('classifies a response body interrupted after HTTP 200 as a transport failure', async () => {
    const interrupted = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"data":')); controller.error(new Error('stream interrupted')); },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    const send = vi.fn<typeof fetch>(async () => interrupted);
    await expect(listProviderModels(PROVIDER_ROUTE_PROFILES['anthropic-claude'], send, 'synthetic'))
      .rejects.toMatchObject({ code: 'TRANSPORT_FAILED' });
  });

  it('keeps the last successful catalogue when re-saving the credential precedes failed discovery', async () => {
    const roots = await createServiceTestRoots('ai7-model-discovery-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const connection = store.saveModelServiceConnection('Synthetic account', null, 'ready', 'anthropic-claude');
    const resolver = { resolve: async () => 'synthetic' };
    const runtime = (nativeFetch: typeof fetch) => ({ scope: 'ordinary-production' as const, nativeFetch });
    const success = vi.fn<typeof fetch>(async () => response({ data: [{ id: 'last-good-model', capabilities: { effort: { low: { supported: true } } } }] }));
    await refreshModelServiceModels(store, runtime(success), 'anthropic-claude', resolver);
    expect(store.getModelServiceModels('anthropic-claude').find((model) => model.modelId === 'last-good-model')?.reasoningEvidence).toBeDefined();
    store.saveModelServiceConnection('Synthetic account', connection.credentialReference, 'needs-attention', 'anthropic-claude');
    store.saveModelServiceConnection('Synthetic account', connection.credentialReference, 'ready', 'anthropic-claude');
    const failed = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    expect(await refreshModelServiceModels(store, runtime(failed), 'anthropic-claude', resolver)).toMatchObject({ status: 'failure', code: 'MODEL_DISCOVERY_UNAVAILABLE' });
    expect(store.getModelServiceModels('anthropic-claude')).toContainEqual({ modelId: 'last-good-model', modelLabel: 'last-good-model' });
  });

  it('falls back to defaults when a gateway has no models endpoint', async () => {
    const roots = await createServiceTestRoots('ai7-model-discovery-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.saveModelServiceConnection('Synthetic gateway', null, 'ready', 'opencode-go');
    await refreshModelServiceModels(store, { scope: 'ordinary-production', nativeFetch: vi.fn(async () => new Response('', { status: 404 })) }, 'opencode-go', { resolve: async () => 'synthetic' });
    expect(store.getModelServiceModels('opencode-go').some((model) => model.modelId === 'deepseek-v4.1-flash')).toBe(true);
  });

  it('discards discovery if its credential changed while reading the protected value', async () => {
    const roots = await createServiceTestRoots('ai7-model-discovery-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const connection = store.saveModelServiceConnection('Synthetic account', null, 'ready', 'anthropic-claude');
    const send = vi.fn<typeof fetch>();
    await refreshModelServiceModels(store, { scope: 'ordinary-production', nativeFetch: send }, 'anthropic-claude', { resolve: async () => {
      store!.setModelServiceCredentialState(connection.credentialReference, 'missing'); return 'synthetic';
    } });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['newer refresh', 'new credential'] as const)('discards a late response after a %s', async (change) => {
    const route = 'opencode-go';
    const roots = await createServiceTestRoots('ai7-model-discovery-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const connection = store.saveModelServiceConnection('Synthetic account', null, 'ready', route);
    const pendingResponse = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    const catalogue = (level: string) => response({ data: [
      { id: 'account-model', capabilities: { reasoning: { effort: [level] } } },
    ] });
    const early = vi.fn<typeof fetch>(() => { started.resolve(); return pendingResponse.promise; });
    const late = vi.fn<typeof fetch>(async () => catalogue('high'));
    const pending = refreshModelServiceModels(store, syntheticRuntime(early), route, syntheticResolver);
    await started.promise;
    try {
      if (change === 'newer refresh') {
        expect(await refreshModelServiceModels(store, syntheticRuntime(late), route, syntheticResolver)).toEqual({ status: 'success', modelCount: 1 });
      } else {
        store.saveModelServiceConnection('Synthetic account', connection.credentialReference, 'ready', route);
      }
    } finally {
      pendingResponse.resolve(catalogue('low'));
    }
    expect(await pending).toMatchObject({ status: 'failure', code: 'MODEL_DISCOVERY_UNAVAILABLE' });
    const model = channelModels(store, route).find((candidate) => candidate.modelId === 'account-model');
    if (change === 'newer refresh') expect(model?.supportedEfforts?.levels).toEqual(['high']);
    else expect(model).toBeUndefined();
  });
});
