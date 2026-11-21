import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { testModelServiceConnection } from '../../src/service/fast-role/fast-role-execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { EditorialStore } from '../../src/service/store.js';
import { MODEL_ROUTE_NOT_SERVED_REASON, modelRoleIdOf } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Issue #1620: the four roles of ADR 0107 §1 resolve on the real store from the two stored column groups — Pro required, Flash
// optional and falling back to 前台 Pro — and a model declared on a route no runtime record serves is refused before sending
// (#1582). Synthetic connection names; no credential value; no provider is called.
let roots: ServiceTestRoots;
let store: EditorialStore;
let requestGovernor: ModelRequestGovernor;
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-model-roles-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  requestGovernor = new ModelRequestGovernor();
});
afterEach(async () => { store.close(); requestGovernor.close(); await requestGovernor.whenIdle(); await roots.dispose(); });

const roles = () => store.getModelRoles().map((role) => [role.roleId, role.binding?.modelId ?? null, role.binding?.reasoningEffort ?? null, role.source]);
const binding = (role: 'main-editorial' | 'fast-interaction') => store.getConfiguredModelRoleBinding(role);

describe('the four Model Roles (Issue #1620)', () => {
  it('runs every role on the Pro model when only a Pro model is chosen, with its 思考强度', () => {
    const connection = store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
    expect(connection.fastSelected).toBe(false);
    store.selectMainRoleModel('anthropic-claude', 'claude-opus-5', 'high');
    expect(roles()).toEqual([
      ['foreground-pro', 'claude-opus-5', 'high', 'pro-tier'],
      ['foreground-flash', 'claude-opus-5', 'high', 'follows-foreground-pro'],
      ['underlying-pro', 'claude-opus-5', 'high', 'pro-tier'],
      ['underlying-flash', 'claude-opus-5', 'high', 'follows-foreground-pro'],
    ]);
    expect(store.getModelRoles().map((role) => [role.roleLabel, role.sourceLabel, role.status])).toEqual([
      ['前台 Pro', '使用所选 Pro 模型', 'available'], ['前台 Flash', '跟随前台 Pro', 'available'],
      ['底层 Pro', '使用所选 Pro 模型', 'available'], ['底层 Flash', '跟随前台 Pro', 'available'],
    ]);
    expect(binding('fast-interaction')).toEqual(binding('main-editorial'));
    expect(binding('main-editorial')).toMatchObject({ route: 'anthropic-claude', model: 'claude-opus-5', reasoningEffort: 'high', credentialReference: connection.credentialReference });
  });

  it('keeps each tier its own model and 思考强度 when both are chosen, and follows Pro again once Flash is cleared', () => {
    store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
    store.selectMainRoleModel('anthropic-claude', 'claude-opus-5', 'high');
    store.selectFastRoleModel('anthropic-claude', 'claude-haiku-4-5', 'low');
    expect(roles()).toEqual([
      ['foreground-pro', 'claude-opus-5', 'high', 'pro-tier'],
      ['foreground-flash', 'claude-haiku-4-5', 'low', 'flash-tier'],
      ['underlying-pro', 'claude-opus-5', 'high', 'pro-tier'],
      ['underlying-flash', 'claude-haiku-4-5', 'low', 'flash-tier'],
    ]);
    expect(binding('fast-interaction')).toMatchObject({ model: 'claude-haiku-4-5', reasoningEffort: 'low' });
    store.clearFlashModel();
    expect(roles().map((role) => role.slice(1))).toEqual([
      ['claude-opus-5', 'high', 'pro-tier'], ['claude-opus-5', 'high', 'follows-foreground-pro'],
      ['claude-opus-5', 'high', 'pro-tier'], ['claude-opus-5', 'high', 'follows-foreground-pro'],
    ]);
    expect(binding('fast-interaction')).toEqual(binding('main-editorial'));
  });

  it('follows Pro while the chosen Flash channel has no usable key, says so, and returns to Flash when the key is back', () => {
    store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
    const gemini = store.saveModelServiceConnection('Synthetic Gemini', null, 'ready', 'google-gemini');
    store.selectMainRoleModel('anthropic-claude', 'claude-opus-5');
    store.selectFastRoleModel('google-gemini', 'gemini-3.8-flash', 'low');
    expect(binding('fast-interaction')).toMatchObject({ route: 'google-gemini', model: 'gemini-3.8-flash' });
    store.setModelServiceCredentialState(gemini.credentialReference, 'missing');
    const following = store.getModelRoles().find((role) => role.roleId === 'foreground-flash')!;
    expect(following).toMatchObject({ source: 'flash-unavailable-follows-foreground-pro', sourceLabel: '已选的 Flash 模型暂时不可用，现在跟随前台 Pro',
      binding: { providerId: 'anthropic-claude', modelId: 'claude-opus-5' }, status: 'available' });
    expect(binding('fast-interaction')).toEqual(binding('main-editorial'));
    // The Flash choice is kept: with the key back the Flash roles take it again.
    expect(store.getModelServiceRouteConnection('google-gemini')?.fastSelected).toBe(true);
    store.setModelServiceCredentialState(gemini.credentialReference, 'ready');
    expect(store.getModelRoles().find((role) => role.roleId === 'underlying-flash')).toMatchObject({ source: 'flash-tier', binding: { modelId: 'gemini-3.8-flash', reasoningEffort: 'low' } });
    expect(binding('fast-interaction')).toMatchObject({ route: 'google-gemini', model: 'gemini-3.8-flash', reasoningEffort: 'low' });
    // Clearing a Flash choice held by another channel than Pro's clears it there.
    store.clearFlashModel();
    expect(store.getModelServiceConnections().map((connection) => connection.fastSelected)).toEqual([false, false]);
    expect(store.getModelRoles().find((role) => role.roleId === 'foreground-flash')).toMatchObject({ source: 'follows-foreground-pro', binding: { providerId: 'anthropic-claude', modelId: 'claude-opus-5' } });
    expect(binding('fast-interaction')).toEqual(binding('main-editorial'));
  });

  it('reads a per-Task choice naming a connection from its Flash model only while that connection holds the Flash choice', () => {
    const claude = store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
    store.selectMainRoleModel('anthropic-claude', 'claude-opus-5', 'high');
    store.selectFastRoleModel('anthropic-claude', 'claude-haiku-4-5', 'low');
    const perTask = () => store.getConfiguredModelRoleBinding('fast-interaction', { modelConnectionId: claude.connectionId });
    expect(perTask()).toMatchObject({ model: 'claude-haiku-4-5', reasoningEffort: 'low' });
    store.clearFlashModel();
    expect(perTask()).toMatchObject({ model: 'claude-opus-5', reasoningEffort: 'high' });
  });

  it.each([['no Flash model is chosen', null], ['the Flash model is another model of the same channel', 'gpt-5.6-luna']] as const)(
    'admits every Flash task kind of the launch policy on the model the Flash roles resolve to when %s', async (_case, flashModel) => {
    store.saveModelServiceConnection('Synthetic OpenAI', null, 'ready', 'openai-platform');
    store.selectMainRoleModel('openai-platform', 'gpt-5.6-sol', 'medium');
    if (flashModel !== null) store.selectFastRoleModel('openai-platform', flashModel);
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', binding('main-editorial'), binding('fast-interaction'));
    const ruleOf = (kind: string) => policy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes(kind));
    for (const kind of ['editorial-dialogue', 'global-agent-dialogue', 'global-agent-scoped-dialogue', 'editorial-polish', 'conflict-regenerate', 'material-translation', 'model-connection-test']) {
      expect(ruleOf(kind), kind).toMatchObject({ modelRole: 'Fast Interaction Role', route: 'openai-platform', endpoint: 'https://api.openai.com/v1/responses', model: flashModel ?? 'gpt-5.6-sol' });
    }
    expect(ruleOf('writing')).toMatchObject({ modelRole: 'Main Editorial Role', model: 'gpt-5.6-sol' });
  });

  it('still reads the legacy ids and names: the stored row role, a stored Flash choice, and the policy names', () => {
    const go = store.saveModelServiceConnection('Synthetic Go', null, 'ready', 'opencode-go');
    store.close();
    // A row 0.7.3 saved: its first key also chose the Flash model, and its role is the legacy `main-editorial`.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.prepare('UPDATE model_service_connections SET fast_selected = 1, fast_model_id = ? WHERE connection_id = ?').run('glm-5.3-flash', go.connectionId);
      expect(database.prepare('SELECT role_id FROM model_service_connections').all()).toEqual([{ role_id: 'main-editorial' }]);
    } finally { database.close(); }
    return EditorialStore.open(roots.dataRoot, roots.codeRoot).then((reopened) => {
      store = reopened;
      const connection = store.getModelServiceRouteConnection('opencode-go')!;
      expect(modelRoleIdOf(connection.roleId)).toBe('foreground-pro');
      expect(store.getModelRoles().find((role) => role.roleId === 'foreground-flash')).toMatchObject({ source: 'flash-tier', binding: { modelId: 'glm-5.3-flash' } });
      expect(binding('fast-interaction')).toMatchObject({ route: 'opencode-go', model: 'glm-5.3-flash' });
      expect(store.getConfiguredModelRoleBinding('underlying-flash')).toEqual(binding('fast-interaction'));
      expect(store.getConfiguredModelRoleBinding('foreground-pro')).toEqual(binding('main-editorial'));
      expect(['Main Editorial Role', 'Fast Interaction Role', 'difficult-escalation', 'frontier', 'unknown'].map(modelRoleIdOf))
        .toEqual(['foreground-pro', 'underlying-flash', 'underlying-pro', 'underlying-pro', null]);
    });
  });
});

describe('a model declared on another route of its channel (#1582)', () => {
  it('refuses an OpenCode Go /responses model at selection, at launch and at the connection test, before any transport call', async () => {
    const go = store.saveModelServiceConnection('Synthetic Go', null, 'ready', 'opencode-go');
    for (const select of [() => store.selectMainRoleModel('opencode-go', 'gpt-5.6-luna'), () => store.selectFastRoleModel('opencode-go', 'grok-4.6'),
      () => store.selectBothRoleModels('opencode-go', 'qwen3.7-plus')]) {
      expect(select).toThrow(MODEL_ROUTE_NOT_SERVED_REASON);
    }
    expect(store.getModelServiceRouteConnection('opencode-go')!.binding.modelId).toBe('deepseek-v4.1-flash');
    // A choice stored before 0.7.4 resolves to no binding, so no Task can send it.
    store.close();
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try { database.prepare('UPDATE model_service_connections SET model_id = ? WHERE connection_id = ?').run('gpt-5.6-luna', go.connectionId); } finally { database.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(binding('main-editorial')).toBeNull();
    expect(binding('fast-interaction')).toBeNull();
    const nativeFetch = vi.fn();
    await expect(testModelServiceConnection(store, roots.codeRoot, { scope: 'ordinary-production', nativeFetch: nativeFetch as unknown as typeof fetch },
      { route: 'opencode-go', modelId: 'gpt-5.6-luna' }, { resolve: vi.fn(async () => 'public-placeholder') }, { requestGovernor }))
      .rejects.toMatchObject({ code: 'MODEL_ROUTE_NOT_SERVED', message: MODEL_ROUTE_NOT_SERVED_REASON });
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('shows a stored Pro model it cannot send as 需处理 with its sentence, and runs a stored refused Flash model\'s tasks on Pro', async () => {
    const go = store.saveModelServiceConnection('Synthetic Go', null, 'ready', 'opencode-go');
    store.close();
    const update = (sql: string, ...values: string[]) => {
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try { database.prepare(sql).run(...values, go.connectionId); } finally { database.close(); }
    };
    update('UPDATE model_service_connections SET model_id = ? WHERE connection_id = ?', 'gpt-5.6-luna');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getModelRoles().map((role) => [role.roleId, role.source, role.status, role.statusDetail])).toEqual([
      ['foreground-pro', 'pro-tier', 'needs-attention', MODEL_ROUTE_NOT_SERVED_REASON],
      ['foreground-flash', 'follows-foreground-pro', 'needs-attention', MODEL_ROUTE_NOT_SERVED_REASON],
      ['underlying-pro', 'pro-tier', 'needs-attention', MODEL_ROUTE_NOT_SERVED_REASON],
      ['underlying-flash', 'follows-foreground-pro', 'needs-attention', MODEL_ROUTE_NOT_SERVED_REASON],
    ]);
    // A Flash choice it cannot send is kept while the Flash roles follow 前台 Pro, which can be sent.
    store.close();
    update("UPDATE model_service_connections SET model_id = 'deepseek-v4.1-flash', fast_selected = 1, fast_model_id = ? WHERE connection_id = ?", 'grok-4.6');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getModelRoles().find((role) => role.roleId === 'underlying-flash')).toMatchObject({ source: 'flash-not-served-follows-foreground-pro',
      sourceLabel: '这个渠道暂时还不能使用已选的 Flash 模型，现在跟随前台 Pro', status: 'available', statusDetail: null, binding: { modelId: 'deepseek-v4.1-flash' } });
    expect(binding('fast-interaction')).toEqual(binding('main-editorial'));
    expect(store.getModelServiceRouteConnection('opencode-go')).toMatchObject({ fastSelected: true, fastBinding: { modelId: 'grok-4.6' } });
  });

  it('sends an OpenCode Zen /responses model on its own route, and a custom id on the channel default route', () => {
    const zen = store.saveModelServiceConnection('Synthetic Zen', null, 'ready', 'opencode-zen');
    store.selectMainRoleModel('opencode-zen', 'gpt-6-sol');
    expect(binding('main-editorial')).toEqual({ route: 'opencode-zen-responses', endpoint: 'https://opencode.ai/inference/openai/v1/responses',
      model: 'gpt-6-sol', credentialSlot: 'opencode-zen', credentialReference: zen.credentialReference });
    store.selectMainRoleModel('opencode-zen', 'zen-account-custom-model');
    expect(binding('main-editorial')).toMatchObject({ route: 'opencode-zen', endpoint: 'https://opencode.ai/inference/openai/v1/chat/completions', model: 'zen-account-custom-model' });
  });
});
