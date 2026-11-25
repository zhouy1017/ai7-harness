import * as modelService from '../../src/shared/protocol/model-service.js';
import { writeModelRoleChoice } from '../../src/service/model-service-connections.js';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { testModelServiceConnection } from '../../src/service/fast-role/fast-role-execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { EditorialStore } from '../../src/service/store.js';
import { MODEL_ROUTE_NOT_SERVED_REASON, modelRoleIdOf } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { seedModelEfforts } from '../support/model-effort-catalogue.js';

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

function discoverClaude(): void {
  seedModelEfforts(store, 'anthropic-claude', {
    'claude-opus-5': ['high'], 'claude-haiku-4-5': ['low', 'high'],
    'claude-sonnet-5': ['medium'], 'claude-fable-5-1': ['high', 'xhigh'],
  });
}

// These M1/R5-F1a cases exercise the retained fallback when a channel offers no recommendation.
beforeEach(() => { vi.spyOn(modelService, 'modelServiceRecommendedModels').mockReturnValue(undefined); });
afterEach(() => vi.restoreAllMocks());

it('uses the primary channel recommendation before a different foreground choice and restores it after clearing an explicit underlying choice', async () => {
  vi.restoreAllMocks();
  store.saveModelServiceConnection('Synthetic Go', null, 'ready', 'opencode-go');
  store.saveModelServiceConnection('Synthetic other', null, 'ready', 'openai-platform');
  seedModelEfforts(store, 'opencode-go', { 'deepseek-v4-pro': ['high'] });
  seedModelEfforts(store, 'openai-platform', { 'sample-foreground': ['low'], explicit: ['high'] });
  store.selectMainRoleModel('opencode-go', 'deepseek-v4-pro', 'high');
  store.selectForegroundFlashModel('openai-platform', 'sample-foreground', 'low');
  expect(store.getModelRoles().find(role => role.roleId === 'underlying-flash')).toMatchObject({
    source: 'channel-recommended-flash', binding: { providerId: 'opencode-go', modelId: 'deepseek-v4.1-flash' } });
  expect(store.getConfiguredModelRoleBinding('foreground-flash')?.model).toBe('sample-foreground');
  const pinned = binding('fast-interaction');
  expect(pinned?.reasoningEffort).toBeUndefined();
  store.selectUnderlyingModel({ roleId: 'underlying-flash', route: 'openai-platform', modelId: 'explicit', reasoningEffort: 'high' });
  store.close(); store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  expect(binding('fast-interaction')).toMatchObject({ model: 'explicit', reasoningEffort: 'high' });
  store.selectUnderlyingModel({ roleId: 'underlying-flash', inherit: true });
  expect(binding('fast-interaction')).toEqual(pinned);
  expect(storedRoles()).not.toContain('underlying-flash');
});

describe('the four Model Roles (Issue #1620)', () => {
  it('runs every role on the Pro model when only a Pro model is chosen, with its 思考强度', () => {
    const connection = store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
    expect(connection.fastSelected).toBe(false);
    discoverClaude();
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
    discoverClaude();
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
    discoverClaude();
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
    seedModelEfforts(store, 'openai-platform', { 'gpt-5.6-sol': ['medium'] });
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
      database.prepare('UPDATE model_service_connections SET fast_model_id = ? WHERE connection_id = ?').run('glm-5.3-flash', go.connectionId);
      writeModelRoleChoice(database, 'foreground-flash', { connectionId: go.connectionId, modelId: 'glm-5.3-flash' });
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
    try { database.prepare('UPDATE model_service_connections SET model_id = ? WHERE connection_id = ?').run('gpt-5.6-luna', go.connectionId); writeModelRoleChoice(database, 'foreground-pro', { connectionId: go.connectionId, modelId: 'gpt-5.6-luna' }); } finally { database.close(); }
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
    update("UPDATE model_role_choices SET model_id = ? WHERE role_id = 'foreground-pro' AND connection_id = ?", 'gpt-5.6-luna');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.getModelRoles().map((role) => [role.roleId, role.source, role.status, role.statusDetail])).toEqual([
      ['foreground-pro', 'pro-tier', 'needs-attention', MODEL_ROUTE_NOT_SERVED_REASON],
      ['foreground-flash', 'follows-foreground-pro', 'needs-attention', MODEL_ROUTE_NOT_SERVED_REASON],
      ['underlying-pro', 'pro-tier', 'needs-attention', MODEL_ROUTE_NOT_SERVED_REASON],
      ['underlying-flash', 'follows-foreground-pro', 'needs-attention', MODEL_ROUTE_NOT_SERVED_REASON],
    ]);
    // A Flash choice it cannot send is kept while the Flash roles follow 前台 Pro, which can be sent.
    store.close();
    update("UPDATE model_service_connections SET model_id = 'deepseek-v4.1-flash', fast_model_id = ? WHERE connection_id = ?", 'grok-4.6');
    const choices = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    writeModelRoleChoice(choices, 'foreground-pro', { connectionId: go.connectionId, modelId: 'deepseek-v4.1-flash' });
    writeModelRoleChoice(choices, 'foreground-flash', { connectionId: go.connectionId, modelId: 'grok-4.6' }); choices.close();
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


/** The internal choice seam deliberately stays off the request protocol (#1650). */
function choose(role: import('../../src/shared/protocol.js').ModelRoleId, modelId: string | null, connectionId = 'anthropic-claude', reasoningEffort = 'high'): void {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try { db.exec('PRAGMA foreign_keys = ON'); writeModelRoleChoice(db, role, modelId === null ? null : { connectionId, modelId, reasoningEffort }); }
  finally { db.close(); }
}

it('stores four independent choices and efforts without changing channel defaults (#1650)', () => {
  const saved = store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
  discoverClaude();
  const models = ['claude-opus-5', 'claude-haiku-4-5', 'claude-sonnet-5', 'claude-fable-5-1'];
  const efforts = ['high', 'low', 'medium', 'xhigh'];
  for (const [i, role] of ['foreground-pro', 'foreground-flash', 'underlying-pro', 'underlying-flash'].entries())
    choose(role as import('../../src/shared/protocol.js').ModelRoleId, models[i]!, saved.connectionId, efforts[i]!);
  expect(store.getModelRoles().map(role => [role.binding?.modelId, role.binding?.reasoningEffort])).toEqual(models.map((id, i) => [id, efforts[i]]));
  expect(store.getConfiguredModelRoleBinding('underlying-pro')).toMatchObject({ model: models[2], reasoningEffort: efforts[2] });
  expect(binding('fast-interaction')).toMatchObject({ model: models[3], reasoningEffort: efforts[3] });
  expect(store.getModelServiceRouteConnection('anthropic-claude')?.binding).toEqual(saved.binding);
});

it('moves every following role with Pro, and underlying Flash follows foreground Flash first (#1650)', () => {
  store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
  discoverClaude();
  store.selectMainRoleModel('anthropic-claude', 'claude-opus-5', 'high');
  expect(storedRoles()).toEqual(['foreground-pro']);
  expect(store.getModelRoles().map(role => role.binding?.modelId)).toEqual(Array(4).fill('claude-opus-5'));
  store.selectMainRoleModel('anthropic-claude', 'claude-sonnet-5', 'medium');
  expect(storedRoles()).toEqual(['foreground-pro']);
  expect(store.getModelRoles().map(role => role.binding?.modelId)).toEqual(Array(4).fill('claude-sonnet-5'));
  choose('foreground-flash', 'claude-haiku-4-5');
  expect(binding('fast-interaction')?.model).toBe('claude-haiku-4-5');
  choose('underlying-flash', 'claude-fable-5-1');
  expect(binding('fast-interaction')?.model).toBe('claude-fable-5-1');
  choose('underlying-flash', null);
  expect(binding('fast-interaction')?.model).toBe('claude-haiku-4-5');
});

it('keeps an unavailable underlying Flash choice while following foreground Flash (#1650)', () => {
  store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
  const go = store.saveModelServiceConnection('Synthetic Go', null, 'ready', 'opencode-go');
  store.selectFastRoleModel('anthropic-claude', 'claude-haiku-4-5');
  choose('underlying-flash', 'glm-5.3-flash', go.connectionId);
  store.setModelServiceCredentialState(go.credentialReference, 'missing');
  expect(binding('fast-interaction')?.model).toBe('claude-haiku-4-5');
  store.setModelServiceCredentialState(go.credentialReference, 'ready');
  seedModelEfforts(store, 'opencode-go', { 'glm-5.3-flash': ['high'] });
  expect(binding('fast-interaction')?.model).toBe('glm-5.3-flash');
});

it('keeps the advanced underlying Flash choice across changes to foreground Flash', () => {
  store.saveModelServiceConnection('Synthetic test', null, 'ready', 'opencode-go');
  seedModelEfforts(store, 'opencode-go', { 'glm-5.3-flash': ['low'] });
  store.selectUnderlyingModel({ roleId: 'underlying-flash', route: 'opencode-go', modelId: 'glm-5.3-flash', reasoningEffort: 'low' });
  store.selectForegroundFlashModel('opencode-go', 'deepseek-v4.1-flash');
  store.selectFastRoleModel('opencode-go', 'deepseek-v4.1-flash');
  store.selectBothRoleModels('opencode-go', 'deepseek-v4.1-flash');
  store.clearFlashModel();
  expect(binding('fast-interaction')).toMatchObject({ model: 'glm-5.3-flash', reasoningEffort: 'low' });
  store.selectUnderlyingModel({ roleId: 'underlying-flash', inherit: true });
  expect(binding('fast-interaction')).toEqual(binding('main-editorial'));
});

it('connection deletion cascades its choices and a later save inherits afresh (#1650)', () => {
  store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
  choose('underlying-pro', 'claude-sonnet-5'); choose('foreground-flash', 'claude-haiku-4-5'); choose('underlying-flash', 'claude-fable-5-1');
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try { db.exec('PRAGMA foreign_keys = ON'); db.exec('DELETE FROM model_service_connections'); } finally { db.close(); }
  expect(store.getModelRoles().map(role => role.binding)).toEqual(Array(4).fill(null));
  store.saveModelServiceConnection('Synthetic Claude again', null, 'ready', 'anthropic-claude');
  expect(binding('fast-interaction')).toEqual(binding('main-editorial'));
  expect(store.getConfiguredModelRoleBinding('underlying-pro')).toEqual(binding('main-editorial'));
});

function storedRoles(): string[] {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try { return db.prepare('SELECT role_id FROM model_role_choices ORDER BY role_id').all().map(row => String(row.role_id)); }
  finally { db.close(); }
}

it('every legacy tier request stores only chosen foreground roles, never follower copies (#1650)', () => {
  store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
  expect(storedRoles()).toEqual(['foreground-pro']);
  store.selectMainRoleModel('anthropic-claude', 'claude-opus-5');
  expect(storedRoles()).toEqual(['foreground-pro']);
  store.selectFastRoleModel('anthropic-claude', 'claude-haiku-4-5');
  expect(storedRoles()).toEqual(['foreground-flash', 'foreground-pro']);
  store.selectBothRoleModels('anthropic-claude', 'claude-sonnet-5');
  expect(storedRoles()).toEqual(['foreground-flash', 'foreground-pro']);
  store.clearFlashModel();
  expect(storedRoles()).toEqual(['foreground-pro']);
  store.selectModelServiceRoute('anthropic-claude');
  expect(storedRoles()).toEqual(['foreground-pro']);
});

it('INSERT OR REPLACE deletes old connection choices through the FK cascade (#1650)', () => {
  store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
  store.selectFastRoleModel('anthropic-claude', 'claude-haiku-4-5');
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try { db.exec('PRAGMA foreign_keys = ON'); db.exec('INSERT OR REPLACE INTO model_service_connections SELECT * FROM model_service_connections'); }
  finally { db.close(); }
  expect(storedRoles()).toEqual([]);
  expect(binding('main-editorial')).toBeNull();
  expect(binding('fast-interaction')).toBeNull();
});

it('an internal role choice does not expand the legacy channel model catalogue (#1650)', () => {
  store.saveModelServiceConnection('Synthetic Claude', null, 'ready', 'anthropic-claude');
  const before = store.getModelServiceModels('anthropic-claude');
  choose('underlying-pro', 'synthetic-role-only-model', 'anthropic-claude', 'off');
  expect(store.getModelServiceModels('anthropic-claude')).toEqual(before);
  expect(store.getConfiguredModelRoleBinding('underlying-pro')?.model).toBe('synthetic-role-only-model');
});
