import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { refreshModelServiceModels } from '../../src/service/provider/model-discovery.js';
import { listProviderModels, modelRequestNotSent, PROVIDER_ROUTE_PROFILES } from '../../src/service/provider/deepseek-adapter.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

let store: EditorialStore | undefined;
afterEach(() => { store?.close(); store = undefined; });
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

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

  it('follows Gemini pages and keeps only generateContent model IDs and display names', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ models: [
      { name: 'models/gemini-account', displayName: 'Account Gemini', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/embedding-only', supportedGenerationMethods: ['embedContent'] },
    ], nextPageToken: 'page-two' })).mockResolvedValueOnce(response({ models: [
      { name: 'models/gemini-next', supportedGenerationMethods: ['generateContent'] },
    ] }));
    expect(await listProviderModels(PROVIDER_ROUTE_PROFILES['google-gemini'], send, 'synthetic')).toEqual([
      { modelId: 'gemini-account', modelLabel: 'Account Gemini' }, { modelId: 'gemini-next', modelLabel: 'gemini-next' },
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
    const send = vi.fn<typeof fetch>(async () => response({ data: [{ id: 'account-opus', display_name: 'Account Opus' }, { id: 'account-haiku' }] }));
    expect(await refreshModelServiceModels(store, { scope: 'ordinary-production', nativeFetch: send }, 'anthropic-claude', resolver)).toEqual({ status: 'success', modelCount: 2 });
    store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    send.mockRejectedValueOnce(new Error('offline'));
    expect(await refreshModelServiceModels(store, { scope: 'ordinary-production', nativeFetch: send }, 'anthropic-claude', resolver)).toMatchObject({ status: 'failure', code: 'MODEL_SERVICE_UNREACHABLE' });
    const models = modelServiceChannels((route) => store!.getModelServiceModels(route)).find((channel) => channel.route === 'anthropic-claude')!.models;
    expect(models).toEqual(expect.arrayContaining([expect.objectContaining({ modelId: 'account-opus', modelLabel: 'Account Opus', main: 'eligible', fast: 'eligible' }), expect.objectContaining({ modelId: 'account-haiku' })]));
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
    const success = vi.fn<typeof fetch>(async () => response({ data: [{ id: 'last-good-model' }] }));
    await refreshModelServiceModels(store, runtime(success), 'anthropic-claude', resolver);
    store.saveModelServiceConnection('Synthetic account', connection.credentialReference, 'needs-attention', 'anthropic-claude');
    store.saveModelServiceConnection('Synthetic account', connection.credentialReference, 'ready', 'anthropic-claude');
    const failed = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    expect(await refreshModelServiceModels(store, runtime(failed), 'anthropic-claude', resolver)).toMatchObject({ status: 'failure', code: 'MODEL_DISCOVERY_UNAVAILABLE' });
    expect(store.getModelServiceModels('anthropic-claude').some((model) => model.modelId === 'last-good-model')).toBe(true);
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
});
