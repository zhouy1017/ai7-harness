import { SEARCH_BACKENDS } from './provider/search-backends.js';
import {
  readSearchBackendConnections,
  readSearchFallback,
  readSearchOverride,
  searchBackendSettingsProjection,
  writeSearchFallback,
} from './provider/search-backend-settings.js';
import { randomUUID } from 'node:crypto';
import { readProxySetting, writeProxySetting } from './provider/proxy-setting.js';
import { allowedProductionBindingOf, type ConfiguredProviderBinding } from './launch-policy.js';
import { DEVELOPMENT_CREDENTIAL_REFERENCES } from '../shared/protected-secret-identity.js';
import {
  MODEL_SERVICE_CONNECTION_IDS,
  MODEL_SERVICE_ROUTE_BINDINGS,
  MODEL_SERVICE_ROUTES,
  modelServiceChannelOf,
  modelServiceModels,
  modelServiceRuntimeBinding,
  validModelServiceModelId,
  type ModelConnectionTestStatus,
  type ModelCredentialOperationState,
  type ModelServiceConnectionProjection,
  type ModelServiceRouteId,
} from '../shared/protocol.js';
import { MODEL_SERVICE_ROW_COLUMNS } from './model-service-connections.js';
import { DatabaseSync } from 'node:sqlite';
import { DIGEST_PATTERN, UUID_PATTERN, asString, requireStore, type SqlRow } from './store-records.js';
import { readModelConnectionTest } from './store-schema.js';
import { resolveRuntimeExecutionConfig, validReasoningEffort, type RuntimeExecutionConfig } from '../shared/runtime-execution-config.js';

export interface ModelSearchSettingsHost {
  assertAvailable: () => void;
  readonly authority: DatabaseSync;
  readonly dataRoot: string;
  transaction: <T>(db: DatabaseSync, operation: () => T) => T;
  getModelServiceConnections: () => ModelServiceConnectionProjection[];
  getModelServiceModels: (route: ModelServiceRouteId) => import('../shared/protocol.js').DiscoveredModel[];
  getModelServiceRouteConnection: (route: ModelServiceRouteId) => ModelServiceConnectionProjection | null;
  getSearchBackendConnections: () => import('../shared/protocol.js').SearchBackendConnectionProjection[];
  modelServiceBinding: (route: ModelServiceRouteId, modelId: string) => import('../shared/protocol.js').ModelServiceBindingProjection;
  selectRoleModel: (route: ModelServiceRouteId, modelId: string, role: 'main' | 'fast' | 'both', reasoningEffort?: string) => void;
}

export function getSearchBackendSettings(host: ModelSearchSettingsHost): import('../shared/protocol.js').SearchBackendSettingsProjection {
  return searchBackendSettingsProjection(host.getSearchBackendConnections(), readSearchFallback(host.authority), readSearchOverride(host.authority));
}

export function getSearchBackendConnections(host: ModelSearchSettingsHost): import('../shared/protocol.js').SearchBackendConnectionProjection[] { return readSearchBackendConnections(host.authority); }

export function selectSearchBackend(host: ModelSearchSettingsHost, backendId: string | null, role?: 'fallback', alwaysUseSelectedBackend?: boolean): void {
  requireStore(role === 'fallback' || SEARCH_BACKENDS.some((entry) => entry.shipped && entry.id === backendId), 'SEARCH_BACKEND_NOT_SHIPPED', '该联网检索后端未提供。');
  const override = alwaysUseSelectedBackend ?? readSearchOverride(host.authority);
  host.authority.exec('BEGIN IMMEDIATE');
  try {
    if (role === 'fallback') writeSearchFallback(host.authority, backendId); else if (readSearchFallback(host.authority)?.backendId === backendId) writeSearchFallback(host.authority, null);
    if (role !== 'fallback') host.authority.prepare('UPDATE search_backend_connections SET selected = NULL WHERE selected = 1').run();
    if (role !== 'fallback') host.authority.prepare('UPDATE search_backend_connections SET selected = 1, selected_at = ?, always_use_selected = ? WHERE backend_id = ?').run(new Date().toISOString(), Number(override), backendId);
    host.authority.exec('COMMIT');
  } catch (error) { host.authority.exec('ROLLBACK'); throw error; }
}

export function saveSearchBackendCredential(host: ModelSearchSettingsHost, backendId: string, reference: string | null, state: import('../shared/protocol.js').ModelCredentialOperationState): import('../shared/protocol.js').SearchBackendConnectionProjection {
  const current = host.getSearchBackendConnections().find((entry) => entry.backendId === backendId);
  requireStore(current !== undefined, 'SEARCH_BACKEND_NOT_SHIPPED', '该联网检索后端未提供。');
  requireStore(reference === null || reference === current.credentialReference, 'SEARCH_CREDENTIAL_REFERENCE_INVALID', '联网检索凭据引用不属于该连接。');
  requireStore(['ready', 'missing', 'needs-attention'].includes(state), 'SEARCH_CREDENTIAL_STATE_INVALID', '联网检索凭据状态无效。');
  const credentialReference = current.credentialReference ?? randomUUID();
  const override = readSearchOverride(host.authority);
  const firstReady = state === 'ready' && !host.getSearchBackendConnections().some((entry) => entry.credentialOperationState === 'ready');
  host.transaction(host.authority, () => {
    host.authority.prepare('UPDATE search_backend_connections SET credential_reference = ?, credential_operation_state = ? WHERE backend_id = ?').run(credentialReference, state, backendId);
    if (state !== 'ready' && readSearchFallback(host.authority)?.backendId === backendId) writeSearchFallback(host.authority, null);
    if (firstReady) {
      host.authority.prepare('UPDATE search_backend_connections SET selected = NULL WHERE selected = 1').run();
      host.authority.prepare('UPDATE search_backend_connections SET selected = 1, selected_at = ?, always_use_selected = ? WHERE backend_id = ?').run(new Date().toISOString(), Number(override), backendId);
    }
  });
  return host.getSearchBackendConnections().find((entry) => entry.backendId === backendId)!;
}

export function getModelServiceProxy(host: ModelSearchSettingsHost): Promise<import('../shared/protocol.js').ModelServiceProxySetting> {
  host.assertAvailable();
  return readProxySetting(host.dataRoot);
}

export function saveModelServiceProxy(host: ModelSearchSettingsHost, input: import('../shared/protocol.js').ModelServiceProxySetting): Promise<import('../shared/protocol.js').ModelServiceProxySetting> {
  host.assertAvailable();
  return writeProxySetting(host.dataRoot, input);
}

export function getModelServiceConnection(host: ModelSearchSettingsHost): ModelServiceConnectionProjection | null {
  return host.getModelServiceRouteConnection('deepseek-open-platform');
}

export function getModelServiceRouteConnection(host: ModelSearchSettingsHost, route: ModelServiceRouteId): ModelServiceConnectionProjection | null {
  host.assertAvailable();
  const target = { connectionId: MODEL_SERVICE_CONNECTION_IDS[route], binding: MODEL_SERVICE_ROUTE_BINDINGS[route] };
  requireStore(target.connectionId !== undefined, 'MODEL_SERVICE_CONNECTION_INVALID', '模型服务路线无效。');
  const row = host.authority.prepare(
      `SELECT ${MODEL_SERVICE_ROW_COLUMNS}, selected, fast_selected, connection_test, fast_model_id, reasoning_effort, fast_reasoning_effort
       FROM model_service_connections
       WHERE connection_id = ?`,
  ).get(target.connectionId) as SqlRow | undefined;
  if (row === undefined) return null;
  const state = asString(row.credential_operation_state);
  requireStore(
    state === 'ready' || state === 'missing' || state === 'needs-attention',
      'STORE_CORRUPT',
      '模型服务凭据状态无效。',
  );
  const credentialReference = asString(row.credential_reference);
  requireStore(
    UUID_PATTERN.test(credentialReference) && !DEVELOPMENT_CREDENTIAL_REFERENCES.has(credentialReference.toLowerCase()),
      'STORE_CORRUPT',
      '模型服务凭据引用无效。',
  );
  return {
    connectionId: target.connectionId,
    roleId: 'main-editorial',
    connectionName: asString(row.connection_name),
    // A connection saved before revision 72 named `deepseek-v4-pro`; the migration moved it to the route's current model.
    binding: { ...host.modelServiceBinding(route, asString(row.model_id)), ...(row.reasoning_effort === null ? {} : { reasoningEffort: asString(row.reasoning_effort) }) },
    fastBinding: { ...host.modelServiceBinding(route, asString(row.fast_model_id) || asString(row.model_id)), ...(row.fast_reasoning_effort === null ? {} : { reasoningEffort: asString(row.fast_reasoning_effort) }) },
    credentialReference,
    credentialOperationState: state,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    credentialUpdatedAt: asString(row.credential_updated_at),
    selected: row.selected === 1,
    fastSelected: row.fast_selected === 1,
    connectionTest: readModelConnectionTest(row),
  };
}

export function getModelServiceConnections(host: ModelSearchSettingsHost): ModelServiceConnectionProjection[] {
  return MODEL_SERVICE_ROUTES.map((route) => host.getModelServiceRouteConnection(route))
    .filter((connection): connection is ModelServiceConnectionProjection => connection !== null);
}

export function saveModelServiceConnection(host: ModelSearchSettingsHost, connectionNameInput: string, credentialReferenceInput: string | null, credentialOperationState: 'ready' | 'needs-attention', route: ModelServiceRouteId = 'deepseek-open-platform'): ModelServiceConnectionProjection {
  host.assertAvailable();
  const target = { connectionId: MODEL_SERVICE_CONNECTION_IDS[route], binding: MODEL_SERVICE_ROUTE_BINDINGS[route] };
  requireStore(target.connectionId !== undefined, 'MODEL_SERVICE_CONNECTION_INVALID', '模型服务路线无效。');
  const connectionName = connectionNameInput.trim();
  requireStore(
    connectionName.length > 0 && connectionName.length <= 80 && connectionName.isWellFormed(),
      'MODEL_SERVICE_CONNECTION_INVALID',
      '连接名称必须为 1 至 80 个有效字符。',
  );
  // A connection's reference is never one a provider document fixes for development (Issue #811).
  requireStore(credentialReferenceInput === null ||
    (UUID_PATTERN.test(credentialReferenceInput) && !DEVELOPMENT_CREDENTIAL_REFERENCES.has(credentialReferenceInput.toLowerCase())),
    'MODEL_SERVICE_CONNECTION_INVALID', '凭据引用无效。');
  const current = host.getModelServiceRouteConnection(route);
  requireStore(
    current === null || current.credentialReference === credentialReferenceInput,
      'MODEL_SERVICE_CONNECTION_CONFLICT',
      '已存连接的凭据引用不可替换。',
  );
  const now = new Date(Math.max(Date.now(), current === null ? 0 : Date.parse(current.credentialUpdatedAt) + 1)).toISOString();
  host.transaction(host.authority, () => {
    if (current === null) {
      // Minted here when the caller names none — as main always does — so the reference belongs to this data root alone.
      let credentialReference = credentialReferenceInput ?? randomUUID();
      while (DEVELOPMENT_CREDENTIAL_REFERENCES.has(credentialReference)) credentialReference = randomUUID();
      const anySelected = host.authority.prepare('SELECT 1 FROM model_service_connections WHERE selected = 1').get() !== undefined;
      host.authority.prepare(
          `INSERT INTO model_service_connections(${MODEL_SERVICE_ROW_COLUMNS}, selected, fast_model_id)
           VALUES (?, 'main-editorial', ?, ?, ?, 1, 1, '[]', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(target.connectionId, connectionName, target.binding.providerId, target.binding.modelId, target.binding.credentialSlot,
        credentialReference, credentialOperationState, now, now, now, anySelected ? null : 1, target.binding.modelId);
      if (host.authority.prepare('SELECT 1 FROM model_service_connections WHERE fast_selected = 1').get() === undefined) {
        host.authority.prepare('UPDATE model_service_connections SET fast_selected = 1 WHERE connection_id = ?').run(target.connectionId);
      }
    } else {
      requireStore(
        host.authority.prepare(
            `UPDATE model_service_connections
             SET connection_name = ?, credential_operation_state = ?, updated_at = ?, credential_updated_at = ?, connection_test = NULL
             WHERE connection_id = ? AND credential_reference = ?`,
        ).run(connectionName, credentialOperationState, now, now, target.connectionId, current.credentialReference).changes === 1,
          'MODEL_SERVICE_CONNECTION_CONFLICT',
          '模型服务连接状态已变化。',
      );
    }
  });
  return host.getModelServiceRouteConnection(route)!;
}

export function setModelServiceCredentialState(host: ModelSearchSettingsHost, credentialReference: string, credentialOperationState: ModelCredentialOperationState): ModelServiceConnectionProjection {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(credentialReference), 'MODEL_SERVICE_CONNECTION_INVALID', '凭据引用无效。');
  const now = new Date().toISOString();
  let connectionId = '';
  host.transaction(host.authority, () => {
    const row = host.authority.prepare('SELECT connection_id, credential_updated_at FROM model_service_connections WHERE credential_reference = ?')
      .get(credentialReference) as SqlRow | undefined;
    requireStore(row !== undefined, 'MODEL_SERVICE_CONNECTION_CONFLICT', '模型服务连接状态已变化。');
    connectionId = asString(row.connection_id);
    requireStore(
      host.authority.prepare(
          `UPDATE model_service_connections
           SET credential_operation_state = ?, updated_at = ?, credential_updated_at = ?, connection_test = NULL
           WHERE connection_id = ? AND credential_reference = ?`,
      ).run(credentialOperationState, now, new Date(Math.max(Date.parse(now), Date.parse(asString(row.credential_updated_at)) + 1)).toISOString(), connectionId, credentialReference).changes === 1,
        'MODEL_SERVICE_CONNECTION_CONFLICT',
        '模型服务连接状态已变化。',
    );
  });
  return host.getModelServiceRouteConnection(MODEL_SERVICE_ROUTES.find((route) => MODEL_SERVICE_CONNECTION_IDS[route] === connectionId)!)!;
}

export function selectModelServiceRoute(host: ModelSearchSettingsHost, route: ModelServiceRouteId): ModelServiceConnectionProjection {
  host.assertAvailable();
  const target = { connectionId: MODEL_SERVICE_CONNECTION_IDS[route] };
  const current = target.connectionId === undefined ? null : host.getModelServiceRouteConnection(route);
  requireStore(target.connectionId !== undefined, 'MODEL_SERVICE_CONNECTION_INVALID', '模型服务路线无效。');
  requireStore(current !== null, 'MODEL_SERVICE_ROUTE_NOT_CONFIGURED', '这条路线还没有连接；请先保存它的连接名称与凭据。');
  host.transaction(host.authority, () => {
    host.authority.prepare('UPDATE model_service_connections SET selected = NULL WHERE selected = 1 AND connection_id != ?').run(target.connectionId);
    host.authority.prepare('UPDATE model_service_connections SET selected = 1, updated_at = ? WHERE connection_id = ?')
      .run(new Date().toISOString(), target.connectionId);
  });
  return host.getModelServiceRouteConnection(route)!;
}

export function getConfiguredModelRoleBinding(host: ModelSearchSettingsHost, role: 'main-editorial' | 'fast-interaction', override: RuntimeExecutionConfig = {}): ConfiguredProviderBinding | null {
  const connections = host.getModelServiceConnections();
  const chosen = connections.find((connection) => role === 'main-editorial' ? connection.selected : connection.fastSelected);
  const connection = override.modelConnectionId === undefined
    ? chosen ?? connections.find((candidate) => candidate.binding.providerId === 'opencode-go' && candidate.credentialOperationState === 'ready')
    : connections.find((candidate) => candidate.connectionId === override.modelConnectionId);
  if (connection === undefined || connection.credentialOperationState !== 'ready') return null;
  // The channel's model takes its reviewed runtime record: the configured route (a Zen model's own Zen route), endpoint and slot.
  const selectedBinding = role === 'fast-interaction' ? connection.fastBinding ?? connection.binding : connection.binding;
  const execution = resolveRuntimeExecutionConfig({ modelConnectionId: connection.connectionId, modelId: selectedBinding.modelId,
    ...(selectedBinding.reasoningEffort === undefined ? {} : { reasoningEffort: selectedBinding.reasoningEffort }) }, override);
  const record = modelServiceRuntimeBinding(selectedBinding.providerId, execution.modelId!, role === 'fast-interaction' ? 'fast' : 'main');
  if (record === undefined) return null;
  const binding = { route: record.route, model: record.model, credentialSlot: record.credentialSlot, credentialReference: connection.credentialReference, endpoint: record.endpoint,
    ...(execution.reasoningEffort === undefined ? {} : { reasoningEffort: execution.reasoningEffort }) };
  return (role === 'fast-interaction' ? allowedProductionBindingOf(binding, 'fast-interaction') : allowedProductionBindingOf(binding)) === null ? null : binding;
}

export function selectFastRoleModel(host: ModelSearchSettingsHost, route: ModelServiceRouteId, modelId: string, reasoningEffort?: string): void {
  host.selectRoleModel(route, modelId, 'fast', reasoningEffort);
}

export function selectMainRoleModel(host: ModelSearchSettingsHost, route: ModelServiceRouteId, modelId: string, reasoningEffort?: string): void {
  host.selectRoleModel(route, modelId, 'main', reasoningEffort);
}

export function selectBothRoleModels(host: ModelSearchSettingsHost, route: ModelServiceRouteId, modelId: string, reasoningEffort?: string): void {
  host.selectRoleModel(route, modelId, 'both', reasoningEffort);
}

export function selectRoleModel(host: ModelSearchSettingsHost, route: ModelServiceRouteId, modelId: string, role: 'main' | 'fast' | 'both', reasoningEffort?: string): void {
  requireStore(reasoningEffort === undefined || validReasoningEffort(reasoningEffort), 'MODEL_EFFORT_INVALID', '请填写有效的思考强度。');
  const connection = host.getModelServiceRouteConnection(route);
  const roles = role === 'both' ? ['main', 'fast'] as const : [role];
  requireStore(roles.every((item) => modelServiceRuntimeBinding(route, modelId, item) !== undefined), 'MODEL_CAPABILITY_UNSUPPORTED', '模型 ID 无效或渠道未准入。');
  requireStore(connection !== null && connection.credentialOperationState === 'ready', 'MODEL_SERVICE_ROUTE_NOT_CONFIGURED', '请先保护并保存凭据。');
  host.transaction(host.authority, () => {
    for (const item of roles) {
      const selected = item === 'main' ? 'selected' : 'fast_selected';
      const model = item === 'main' ? 'model_id' : 'fast_model_id';
      host.authority.prepare(`UPDATE model_service_connections SET ${selected} = NULL WHERE ${selected} = 1`).run();
      host.authority.prepare(`UPDATE model_service_connections SET ${selected} = 1, ${model} = ?, updated_at = ? WHERE connection_id = ?`)
        .run(modelId, new Date().toISOString(), connection.connectionId);
      if (reasoningEffort !== undefined) {
        const effort = item === 'main' ? 'reasoning_effort' : 'fast_reasoning_effort';
        host.authority.prepare(`UPDATE model_service_connections SET ${effort} = ? WHERE connection_id = ?`).run(reasoningEffort === 'off' ? null : reasoningEffort, connection.connectionId);
      }
    }
  });
}

export function modelServiceBinding(host: ModelSearchSettingsHost, route: ModelServiceRouteId, modelId: string): import('../shared/protocol.js').ModelServiceBindingProjection {
  const label = host.getModelServiceModels(route).find((model) => model.modelId === modelId)?.modelLabel ?? modelId;
  return { ...MODEL_SERVICE_ROUTE_BINDINGS[route], modelId, modelLabel: label, approvedFallbackChain: [] };
}

export function getModelServiceModels(host: ModelSearchSettingsHost, route: ModelServiceRouteId): import('../shared/protocol.js').DiscoveredModel[] {
  const row = host.authority.prepare('SELECT cached_models, model_id, fast_model_id FROM model_service_connections WHERE connection_id = ?').get(MODEL_SERVICE_CONNECTION_IDS[route]) as SqlRow | undefined;
  const cached = row === undefined ? [] : JSON.parse(asString(row.cached_models)) as import('../shared/protocol.js').DiscoveredModel[];
  const models = cached.length > 0 ? cached : modelServiceModels(route).map(({ modelId, modelLabel }) => ({ modelId, modelLabel }));
  if (row !== undefined) for (const modelId of [asString(row.model_id), asString(row.fast_model_id)]) {
    if (modelId && !models.some((model) => model.modelId === modelId)) models.push({ modelId, modelLabel: modelId });
  }
  return models;
}

export function cacheModelServiceModels(host: ModelSearchSettingsHost, connection: ModelServiceConnectionProjection, models: readonly import('../shared/protocol.js').DiscoveredModel[]): void {
  requireStore(models.every((model) => validModelServiceModelId(model.modelId) && typeof model.modelLabel === 'string' && model.modelLabel.length <= 200), 'MODEL_CATALOGUE_INVALID', '模型列表无效。');
  host.authority.prepare('UPDATE model_service_connections SET cached_models = ? WHERE connection_id = ? AND credential_reference = ? AND credential_updated_at = ? AND credential_operation_state = ?')
    .run(JSON.stringify(models.map(({ modelId, modelLabel }) => ({ modelId, modelLabel }))), connection.connectionId, connection.credentialReference, connection.credentialUpdatedAt, 'ready');
}

export function recordModelConnectionTest(host: ModelSearchSettingsHost, connection: ModelServiceConnectionProjection, result: ModelConnectionTestStatus): void {
  requireStore(result.credentialUpdatedAt === connection.credentialUpdatedAt && validModelServiceModelId(result.modelId) &&
    ['passed', 'failed', 'outcome-unknown', 'cancelled'].includes(result.outcome) && result.verified === 'buffered-text-only' &&
    (result.code === null || /^[A-Z0-9_]{1,100}$/u.test(result.code)), 'MODEL_CONNECTION_TEST_INVALID', '连接测试状态无效。');
  const facts = result.provenance;
  const counts = facts?.usage;
  requireStore(Number.isFinite(Date.parse(result.testedAt)) && (result.outcome !== 'passed' || facts !== undefined), 'MODEL_CONNECTION_TEST_INVALID', '连接测试状态无效。');
  if (facts !== undefined) requireStore(facts.role === 'Fast Interaction Role' && facts.model === result.modelId &&
    facts.credentialReference === connection.credentialReference && modelServiceChannelOf(facts.route) === connection.binding.providerId &&
    facts.credentialSlot === connection.binding.credentialSlot && DIGEST_PATTERN.test(facts.bindingDigest) && (facts.policyVersion === 'v25' || facts.policyVersion === 'v26' || facts.policyVersion === 'v27' || facts.policyVersion === 'v30' || facts.policyVersion === 'v31' || (facts.policyVersion === 'v32' || facts.policyVersion === 'v33' || (facts.policyVersion === 'v34' || facts.policyVersion === 'v35'))) &&
    allowedProductionBindingOf({ route: facts.route, endpoint: facts.endpoint, model: facts.model, credentialSlot: facts.credentialSlot, credentialReference: facts.credentialReference }, 'fast-interaction') !== null &&
    (facts.failureCode === null || /^[A-Z0-9_]{1,100}$/u.test(facts.failureCode)) &&
    (counts == null || [counts.inputTokens, counts.outputTokens, ...(counts.reasoningTokens === undefined ? [] : [counts.reasoningTokens]),
      ...(counts.cacheReadTokens === undefined ? [] : [counts.cacheReadTokens])].every((count) => Number.isSafeInteger(count) && count >= 0)),
      'MODEL_CONNECTION_TEST_INVALID', '连接测试来历无效。');
  // Project the closed status explicitly: no unknown property from an adapter/result can become retained material.
  const sanitized: ModelConnectionTestStatus = {
    modelId: result.modelId, credentialUpdatedAt: result.credentialUpdatedAt, testedAt: result.testedAt,
    outcome: result.outcome, code: result.code, verified: 'buffered-text-only',
    ...(typeof result.responseText === 'string' && result.responseText.isWellFormed() ? { responseText: result.responseText.slice(0, 4000).replace(/[\uD800-\uDBFF]$/u, '') } : {}),
    ...(facts === undefined ? {} : { provenance: {
      role: facts.role, route: facts.route, model: facts.model, endpoint: facts.endpoint, credentialSlot: facts.credentialSlot,
      credentialReference: facts.credentialReference, policyVersion: facts.policyVersion, bindingDigest: facts.bindingDigest,
      ...(facts.credentialUpdatedAt === undefined ? {} : { credentialUpdatedAt: facts.credentialUpdatedAt }),
      failureCode: facts.failureCode, usage: counts == null ? null : { inputTokens: counts.inputTokens, outputTokens: counts.outputTokens,
        ...(counts.reasoningTokens === undefined ? {} : { reasoningTokens: counts.reasoningTokens }),
        ...(counts.cacheReadTokens === undefined ? {} : { cacheReadTokens: counts.cacheReadTokens }) },
    } }),
  };
  readModelConnectionTest({ connection_test: JSON.stringify(sanitized), credential_updated_at: connection.credentialUpdatedAt,
    provider_id: connection.binding.providerId, credential_slot: connection.binding.credentialSlot, credential_reference: connection.credentialReference });
  requireStore(host.authority.prepare(`UPDATE model_service_connections SET connection_test = ?
      WHERE connection_id = ? AND credential_reference = ? AND credential_updated_at = ? AND credential_operation_state = 'ready'`)
    .run(JSON.stringify(sanitized), connection.connectionId, connection.credentialReference, connection.credentialUpdatedAt).changes === 1,
      'MODEL_SERVICE_CONNECTION_CONFLICT', '连接已变化；请重新测试。');
}
