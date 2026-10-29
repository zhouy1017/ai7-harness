import { afterEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { CONFIGURED_RUNTIME_MODEL_TABLE } from '../../src/shared/provider-configuration.generated.js';
import { MODEL_SERVICE_CHANNELS } from '../../src/shared/protocol.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

// Issue #1215: the one Settings flow reads its channels from the generated declarations and the runtime model table, and the
// choice it makes persists through the existing route and Fast selections. Synthetic connection names; no credential value.
let store: EditorialStore | undefined;
afterEach(() => { store?.close(); store = undefined; });

describe('the model-service channel catalogue', () => {
  it('lists the six channels and offers for each role exactly the model-table records its policy admits', () => {
    const channels = modelServiceChannels();
    expect(channels.map((channel) => channel.channelId)).toEqual([...MODEL_SERVICE_CHANNELS]);
    expect(channels.map((channel) => channel.route)).toEqual([null, 'opencode-go', null, null, 'openai-platform', 'deepseek-open-platform']);
    for (const role of ['main', 'fast'] as const) {
      const eligible = channels.flatMap((channel) => channel.models.filter((model) => model[role] === 'eligible').map((model) => `${channel.route}/${model.modelId}`));
      expect(eligible.sort()).toEqual(CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction[role].map((binding) => `${binding.route}/${binding.model}`).sort());
    }
  });

  it('names why every other declared model cannot be chosen, and carries no endpoint or credential slot', () => {
    const channels = modelServiceChannels();
    const byId = (channelId: string) => channels.find((channel) => channel.channelId === channelId)!;
    expect(byId('anthropic-claude').models.every((model) => model.main === 'family-not-admitted-by-selected-policy' && model.fast === 'family-not-admitted-by-selected-policy')).toBe(true);
    expect(byId('google-gemini').models.every((model) => model.family === 'google-generate-content' && model.main === 'family-not-admitted-by-selected-policy')).toBe(true);
    const luna = byId('openai-platform').models.find((model) => model.modelId === 'gpt-5.6-luna')!;
    expect([luna.main, luna.fast]).toEqual(['family-not-admitted-by-selected-policy', 'eligible']);
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

  it('refuses a Fast-only model for the Main role, so the flow never offers it for both', async () => {
    const roots = await createServiceTestRoots('ai7-model-channels-');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const saved = store.saveModelServiceConnection('Synthetic OpenAI', null, 'needs-attention', 'openai-platform');
    store.saveModelServiceConnection(saved.connectionName, saved.credentialReference, 'ready', 'openai-platform');
    expect(() => store!.selectModelServiceRoute('openai-platform')).toThrow(expect.objectContaining({ code: 'MODEL_SERVICE_CONNECTION_INVALID' }));
    const luna = modelServiceChannels().find((channel) => channel.channelId === 'openai-platform')!.models.find((model) => model.modelId === 'gpt-5.6-luna')!;
    expect(luna.main).not.toBe('eligible');
  });
});
