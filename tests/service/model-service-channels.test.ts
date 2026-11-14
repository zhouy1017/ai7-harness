import { MODEL_SERVICE_CONNECTION_REVISION_103_SQL, MODEL_SERVICE_ROW_COLUMNS } from '../../src/service/model-service-connections.js';
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
  it('persists independent models on one channel and across channels, and can set both atomically', async () => {
    const roots = await createServiceTestRoots('ai7-role-models-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const claude = store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
    store.saveModelServiceConnection('Synthetic Gemini', null, 'ready', 'google-gemini');
    store.selectMainRoleModel('anthropic-claude', 'account-opus', 'high');
    store.selectFastRoleModel('anthropic-claude', 'account-haiku', 'low');
    const bindings = () => ['main-editorial', 'fast-interaction'].map((role) => store!.getConfiguredModelRoleBinding(role as 'main-editorial' | 'fast-interaction'));
    expect(bindings()).toMatchObject([{ model: 'account-opus', credentialReference: claude.credentialReference }, { model: 'account-haiku', credentialReference: claude.credentialReference }]);
    store.markCleanShutdown(); store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(bindings().map((binding) => binding?.model)).toEqual(['account-opus', 'account-haiku']);
    expect(bindings().map((binding) => binding?.reasoningEffort)).toEqual(['high', 'low']);
    expect(store.getConfiguredModelRoleBinding('main-editorial', { modelConnectionId: claude.connectionId,
      modelId: 'account-future-model', reasoningEffort: 'vendor-future-level' })).toMatchObject({ model: 'account-future-model', reasoningEffort: 'vendor-future-level' });
    expect(bindings().map((binding) => binding?.model)).toEqual(['account-opus', 'account-haiku']);
    store.selectMainRoleModel('google-gemini', 'gemini-custom');
    expect(bindings().map((binding) => [binding?.route, binding?.model])).toEqual([['google-gemini', 'gemini-custom'], ['anthropic-claude', 'account-haiku']]);
    store.selectBothRoleModels('anthropic-claude', 'claude-custom', 'vendor-future-level');
    expect(bindings().map((binding) => [binding?.route, binding?.model])).toEqual([['anthropic-claude', 'claude-custom'], ['anthropic-claude', 'claude-custom']]);
    expect(bindings().map((binding) => binding?.reasoningEffort)).toEqual(['vendor-future-level', 'vendor-future-level']);
    expect(() => store!.selectBothRoleModels('google-gemini', 'invalid model')).toThrow();
    expect(bindings().map((binding) => binding?.model)).toEqual(['claude-custom', 'claude-custom']);
  });

  it('offers all catalogue models on admitted channels with protocol capabilities', () => {
    const channels = modelServiceChannels();
    expect(channels.map((channel) => channel.channelId)).toEqual([...MODEL_SERVICE_CHANNELS]);
    expect(channels.every((channel) => channel.models.some((model) => model.main === 'eligible' && model.fast === 'eligible'))).toBe(true);
    for (const model of channels.flatMap((channel) => channel.models)) {
      expect(model.capabilities).toEqual({ text: 'supported', stream: 'supported', functionTools: 'supported' });
    }
  });

  it('saves and reads a credential reference for each new slot, never a value, and retains the first configured channel', async () => {
    const roots = await createServiceTestRoots('ai7-model-channels-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const saved = (['opencode-zen', 'anthropic-claude', 'google-gemini'] as const).map((route) => {
      const first = store!.saveModelServiceConnection(`Synthetic ${route}`, null, 'needs-attention', route);
      return store!.saveModelServiceConnection(first.connectionName, first.credentialReference, 'ready', route);
    });
    expect(saved.map((connection) => [connection.connectionId, connection.binding.credentialSlot, connection.selected, connection.fastSelected ?? null]))
      .toEqual([['opencode-zen', 'opencode-zen', true, true], ['anthropic-claude', 'anthropic-claude', false, false], ['google-gemini', 'google-gemini', false, false]]);
    expect(saved.every((connection) => /^[0-9a-f-]{36}$/u.test(connection.credentialReference))).toBe(true);
    store.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getModelServiceConnections().map((connection) => connection.credentialReference)).toEqual(saved.map((connection) => connection.credentialReference));
    expect(JSON.stringify(store.getModelServiceConnections())).not.toMatch(/secret|apiKey|Bearer/iu);
    // The configured channel serves both roles without requiring a model-specific test.
    expect(store.getConfiguredModelRoleBinding('main-editorial')?.route).toBe('opencode-zen');
  });

  it('chooses OpenAI with configured credentials without requiring a text connection test', async () => {
    const roots = await createServiceTestRoots('ai7-model-channels-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const first = store.saveModelServiceConnection('Synthetic OpenAI', null, 'needs-attention', 'openai-platform');
    let connection = store.saveModelServiceConnection(first.connectionName, first.credentialReference, 'ready', 'openai-platform');
    expect(() => store!.selectModelServiceRoute('openai-platform')).not.toThrow();
    store.recordModelConnectionTest(connection, passed(connection));
    store.selectModelServiceRoute('openai-platform');
    expect(store.getConfiguredModelRoleBinding('main-editorial')).toEqual({ route: 'openai-platform', model: 'gpt-5.6-luna', credentialSlot: 'openai-platform',
      credentialReference: connection.credentialReference, endpoint: 'https://api.openai.com/v1/responses' });
    // Credential rotation clears diagnostic status and preserves the channel choice.
    connection = store.saveModelServiceConnection(connection.connectionName, connection.credentialReference, 'ready', 'openai-platform');
    expect([connection.selected, store.getConfiguredModelRoleBinding('main-editorial')?.route]).toEqual([true, 'openai-platform']);
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
  it('migrates the model-restricted schema, preserving references and selections, and keeps a dynamic ID through restart', async () => {
    const roots = await createServiceTestRoots('ai7-channel-migration-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const connection = store.saveModelServiceConnection('Synthetic OpenAI', null, 'ready', 'openai-platform');
    store.selectModelServiceRoute('openai-platform');
    const before = store.getModelServiceConnections();
    store.markCleanShutdown(); store.close(); store = undefined;
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      db.exec('BEGIN IMMEDIATE');
      db.exec('CREATE TEMP TABLE old_channel_rows AS SELECT rowid AS original_rowid, * FROM model_service_connections');
      db.exec('DROP TABLE model_service_connections'); db.exec(MODEL_SERVICE_CONNECTION_REVISION_103_SQL);
      db.exec(`INSERT INTO model_service_connections(rowid, ${MODEL_SERVICE_ROW_COLUMNS}, selected, fast_selected, connection_test)
        SELECT original_rowid, ${MODEL_SERVICE_ROW_COLUMNS}, selected, fast_selected, connection_test FROM old_channel_rows`);
      db.exec('DROP TABLE old_channel_rows; PRAGMA user_version = 104'); db.exec('COMMIT');
    } finally { db.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getModelServiceConnections()).toEqual(before);
    store.selectFastRoleModel('openai-platform', 'account/new-model');
    store.markCleanShutdown(); store.close(); store = undefined;
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getConfiguredModelRoleBinding('fast-interaction')).toMatchObject({ model: 'account/new-model', route: 'openai-platform', credentialReference: connection.credentialReference });
    expect(store.getConfiguredModelRoleBinding('main-editorial')?.model).toBe('gpt-5.6-luna');
  });

});

/** A sanitized passed text test of the connection's own model, as the connection-test owner records one; synthetic digest, no answer. */
function passed(connection: ModelServiceConnectionProjection) {
  return { modelId: connection.binding.modelId, credentialUpdatedAt: connection.credentialUpdatedAt, testedAt: new Date().toISOString(), outcome: 'passed' as const,
    code: null, verified: 'buffered-text-only' as const, provenance: { role: 'Fast Interaction Role' as const, route: 'openai-platform', model: connection.binding.modelId,
      endpoint: 'https://api.openai.com/v1/responses', credentialSlot: 'openai-platform', credentialReference: connection.credentialReference, policyVersion: 'v32',
      bindingDigest: 'a'.repeat(64), credentialUpdatedAt: connection.credentialUpdatedAt, usage: null, failureCode: null } };
}
