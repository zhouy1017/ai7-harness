import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { CONFIGURED_RUNTIME_MODEL_TABLE } from '../../src/shared/provider-configuration.generated.js';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { MODEL_SERVICE_CHANNELS, modelServiceChannelOf, type ModelServiceConnectionProjection } from '../../src/shared/protocol.js';
import { asRevision102 } from '../support/structural-revisions.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

// Issue #1215: the one Settings flow reads its channels from the generated declarations and the runtime model table, and the
// choice it makes persists through the existing route and Fast selections. Synthetic connection names; no credential value.
let store: EditorialStore | undefined;
afterEach(() => { store?.close(); store = undefined; });

describe('the model-service channel catalogue', () => {
  it('lists the six channels and offers for each role exactly the model-table records its policy admits', () => {
    const channels = modelServiceChannels();
    expect(channels.map((channel) => channel.channelId)).toEqual([...MODEL_SERVICE_CHANNELS]);
    // Every channel is a Model Service route with its own credential since Issue #1225.
    expect(channels.map((channel) => channel.route)).toEqual([...MODEL_SERVICE_CHANNELS]);
    for (const role of ['main', 'fast'] as const) {
      const eligible = channels.flatMap((channel) => channel.models.filter((model) => model[role] === 'eligible').map((model) => `${channel.route}/${model.modelId}`));
      expect(eligible.sort()).toEqual(CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction[role].map((binding) => `${modelServiceChannelOf(binding.route)}/${binding.model}`).sort());
    }
  });

  it('names why every other declared model cannot be chosen, and carries no endpoint or credential slot', () => {
    const channels = modelServiceChannels();
    const byId = (channelId: string) => channels.find((channel) => channel.channelId === channelId)!;
    // v32 admits every family (Issue #1221); the official Claude and Gemini models read text on documentation (#1225), the Zen ones do not.
    expect(byId('anthropic-claude').models.every((model) => model.main === 'eligible' && model.fast === 'eligible')).toBe(true);
    expect(byId('google-gemini').models.every((model) => model.family === 'google-generate-content' && model.main === 'eligible')).toBe(true);
    expect(byId('opencode-zen').models.every((model) => model.main === 'untested:text' && model.fast === 'untested:text')).toBe(true);
    const luna = byId('openai-platform').models.find((model) => model.modelId === 'gpt-5.6-luna')!;
    // OpenAI Responses for Main has its runtime record (Issue #1225), so it reads eligible for both roles.
    expect([luna.main, luna.fast]).toEqual(['eligible', 'eligible']);
    expect(byId('opencode-go').models.find((model) => model.modelId === 'deepseek-v4-flash')!.main).toBe('not-in-runtime-model-table');
    expect(byId('opencode-zen').models.length).toBeGreaterThan(0);
    expect(byId('opencode-zen').models.some((model) => model.main === 'eligible' || model.fast === 'eligible')).toBe(false);
    const text = JSON.stringify(channels);
    expect(text).not.toMatch(/https?:\/\/|credentialSlot|credentialReference/u);
  });
});

describe('the one choice for both roles', () => {
  it('persists a route and its model for the Main and the Fast role across a reopen', async () => {
    const roots = await createServiceTestRoots('ai7-model-channels-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    for (const route of ['opencode-go', 'deepseek-open-platform'] as const) {
      const saved = store.saveModelServiceConnection(`Synthetic ${route}`, null, 'needs-attention', route);
      store.saveModelServiceConnection(saved.connectionName, saved.credentialReference, 'ready', route);
    }
    store.selectModelServiceRoute('opencode-go');
    store.selectFastRoleModel('opencode-go', 'deepseek-v4.1-flash');
    store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const main = store.getConfiguredModelRoleBinding('main-editorial');
    const fast = store.getConfiguredModelRoleBinding('fast-interaction');
    expect([main?.route, main?.model]).toEqual(['opencode-go', 'deepseek-v4.1-flash']);
    expect(fast).toEqual(main);
  });

  it('saves and reads a credential reference for each new slot, never a value, and chooses none of them on its own (#1225)', async () => {
    const roots = await createServiceTestRoots('ai7-model-channels-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const saved = (['opencode-zen', 'anthropic-claude', 'google-gemini'] as const).map((route) => {
      const first = store!.saveModelServiceConnection(`Synthetic ${route}`, null, 'needs-attention', route);
      return store!.saveModelServiceConnection(first.connectionName, first.credentialReference, 'ready', route);
    });
    expect(saved.map((connection) => [connection.connectionId, connection.binding.credentialSlot, connection.selected, connection.fastSelected ?? null]))
      .toEqual([['opencode-zen', 'opencode-zen', false, false], ['anthropic-claude', 'anthropic-claude', false, false], ['google-gemini', 'google-gemini', false, false]]);
    expect(saved.every((connection) => /^[0-9a-f-]{36}$/u.test(connection.credentialReference))).toBe(true);
    store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getModelServiceConnections().map((connection) => connection.credentialReference)).toEqual(saved.map((connection) => connection.credentialReference));
    expect(JSON.stringify(store.getModelServiceConnections())).not.toMatch(/secret|apiKey|Bearer/iu);
    // An untested documentary model is no binding for either role, and the default Go fallback has no credential here.
    expect([store.getConfiguredModelRoleBinding('main-editorial'), store.getConfiguredModelRoleBinding('fast-interaction')]).toEqual([null, null]);
  });

  it('chooses OpenAI for the Main role only after its passed exact-model test on the current credential (#1225)', async () => {
    const roots = await createServiceTestRoots('ai7-model-channels-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const first = store.saveModelServiceConnection('Synthetic OpenAI', null, 'needs-attention', 'openai-platform');
    let connection = store.saveModelServiceConnection(first.connectionName, first.credentialReference, 'ready', 'openai-platform');
    expect(() => store!.selectModelServiceRoute('openai-platform')).toThrow(expect.objectContaining({ code: 'MODEL_CONNECTION_TEST_REQUIRED' }));
    store.recordModelConnectionTest(connection, passed(connection));
    store.selectModelServiceRoute('openai-platform');
    expect(store.getConfiguredModelRoleBinding('main-editorial')).toEqual({ route: 'openai-platform', model: 'gpt-5.6-luna', credentialSlot: 'openai-platform',
      credentialReference: connection.credentialReference, endpoint: 'https://api.openai.com/v1/responses' });
    // Re-entering the credential clears the test, so the choice stays but binds nothing until it is tested again.
    connection = store.saveModelServiceConnection(connection.connectionName, connection.credentialReference, 'ready', 'openai-platform');
    expect([connection.selected, store.getConfiguredModelRoleBinding('main-editorial')]).toEqual([true, null]);
  });

  it('opens a genuine revision-102 store at 103 with every connection row copied (#1225)', async () => {
    const roots = await createServiceTestRoots('ai7-model-channels-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    for (const route of ['opencode-go', 'openai-platform'] as const) store.saveModelServiceConnection(`Synthetic ${route}`, null, 'ready', route);
    const before = store.getModelServiceConnections();
    store.markCleanShutdown(); store.close(); store = undefined;
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try { asRevision102(db); } finally { db.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getModelServiceConnections()).toEqual(before);
    const anthropic = store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
    expect(anthropic.binding).toMatchObject({ providerId: 'anthropic-claude', modelId: 'claude-opus-5', credentialSlot: 'anthropic-claude' });
  });
});

/** A sanitized passed text test of the connection's own model, as the connection-test owner records one; synthetic digest, no answer. */
function passed(connection: ModelServiceConnectionProjection) {
  return { modelId: connection.binding.modelId, credentialUpdatedAt: connection.credentialUpdatedAt, testedAt: new Date().toISOString(), outcome: 'passed' as const,
    code: null, verified: 'buffered-text-only' as const, provenance: { role: 'Fast Interaction Role' as const, route: 'openai-platform', model: connection.binding.modelId,
      endpoint: 'https://api.openai.com/v1/responses', credentialSlot: 'openai-platform', credentialReference: connection.credentialReference, policyVersion: 'v32',
      bindingDigest: 'a'.repeat(64), credentialUpdatedAt: connection.credentialUpdatedAt, usage: null, failureCode: null } };
}
