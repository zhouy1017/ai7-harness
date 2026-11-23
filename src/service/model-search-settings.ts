import { supportsEditorialMemoryPolicy } from '../shared/protocol.js';
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
  MODEL_ROLE_IDS,
  MODEL_ROLE_LABELS,
  MODEL_ROLE_SOURCE_LABELS,
  modelRoleIdOf,
  modelServiceChannelOf,
  modelServiceModels,
  modelServiceRouteRefusal,
  modelServiceRuntimeBinding,
  modelTierOf,
  validModelServiceModelId,
  type ModelConnectionTestStatus,
  type LegacyModelRoleId,
  type ModelCredentialOperationState,
  type ModelRoleId,
  type ModelRoleResolutionProjection,
  type ModelRoleSource,
  type ModelServiceConnectionProjection,
  type ModelServiceRouteId,
} from '../shared/protocol.js';
import { MODEL_SERVICE_ROW_COLUMNS, readModelRoleChoices, writeModelRoleChoice, type ModelRoleChoiceInput } from './model-service-connections.js';
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
      `SELECT ${MODEL_SERVICE_ROW_COLUMNS}, connection_test, fast_model_id, reasoning_effort, fast_reasoning_effort
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
  const choices = readModelRoleChoices(host.authority);
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
    selected: choices.some(choice => choice.roleId === 'foreground-pro' && choice.connectionId === target.connectionId),
    fastSelected: choices.some(choice => choice.roleId === 'foreground-flash' && choice.connectionId === target.connectionId),
    ...connectionTestsOf(host.authority, target.connectionId, row),
  };
}

/**
 * The newest test result of each model tested on a connection. The lighter model's results live here only (the stored slot
 * stays the one value every build reads, so an older build opens the store), until the service stops.
 */
const HELD_CONNECTION_TESTS = new WeakMap<object, Map<string, Map<string, ModelConnectionTestStatus>>>();
const MAX_HELD_MODELS_PER_CONNECTION = 8;

/** `connectionTest` is the newest of `connectionTests`: every model's newest result, the stored one included, for this credential. */
function connectionTestsOf(authority: object, connectionId: string, row: SqlRow): Pick<ModelServiceConnectionProjection, 'connectionTest' | 'connectionTests'> {
  const stored = readModelConnectionTest(row);
  const results = new Map<string, ModelConnectionTestStatus>();
  for (const result of [...(HELD_CONNECTION_TESTS.get(authority)?.get(connectionId)?.values() ?? []), ...(stored === null ? [] : [stored])]) {
    const known = results.get(result.modelId);
    if (result.credentialUpdatedAt === row.credential_updated_at && (known === undefined || result.testedAt > known.testedAt)) results.set(result.modelId, result);
  }
  const connectionTests = [...results.values()].sort((a, b) => (a.testedAt < b.testedAt ? 1 : a.testedAt > b.testedAt ? -1 : 0));
  return { connectionTest: connectionTests[0] ?? null, connectionTests };
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
      const anySelected = readModelRoleChoices(host.authority).some(choice => choice.roleId === 'foreground-pro');
      // No Flash model is chosen with the first key (Issue #1620): the Flash roles follow 前台 Pro until the editor picks one.
      host.authority.prepare(
          `INSERT INTO model_service_connections(${MODEL_SERVICE_ROW_COLUMNS}, fast_model_id)
           VALUES (?, 'main-editorial', ?, ?, ?, 1, 1, '[]', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(target.connectionId, connectionName, target.binding.providerId, target.binding.modelId, target.binding.credentialSlot,
        credentialReference, credentialOperationState, now, now, now, target.binding.modelId);
      if (!anySelected) writeModelRoleChoice(host.authority, 'foreground-pro', { connectionId: target.connectionId, modelId: target.binding.modelId });
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
    writeModelRoleChoice(host.authority, 'foreground-pro', { connectionId: current.connectionId, modelId: current.binding.modelId,
      ...(current.binding.reasoningEffort === undefined ? {} : { reasoningEffort: current.binding.reasoningEffort }) });
    host.authority.prepare('UPDATE model_service_connections SET updated_at = ? WHERE connection_id = ?')
      .run(new Date().toISOString(), target.connectionId);
  });
  return host.getModelServiceRouteConnection(route)!;
}

/** A role's effective model under the cascade of Issue #1620, and where it comes from. */
export interface ResolvedModelRole {
  readonly roleId: ModelRoleId;
  readonly source: ModelRoleSource;
  readonly connection: ModelServiceConnectionProjection | null;
  readonly model: import('../shared/protocol.js').ModelServiceBindingProjection | null;
  readonly binding: ConfiguredProviderBinding | null;
  /** Why the effective model cannot be sent although its key is ready (#1582); `null` otherwise. */
  readonly refusal: string | null;
  /** The actual model/effort used, after cascade and per-Task overrides; internal, never a wire member. */
  readonly usedChoice: ModelRoleChoiceInput | null;
}

/**
 * Resolve explicit role choices and ADR 0107's defaults (#1650). Underlying Flash follows foreground Flash before Pro.
 * Unusable Flash choices are retained while following their defaults; an unusable chosen Pro model does not choose another
 * channel. Per-Task choices retain M1's channel-default semantics, including a usable chosen Flash model on that channel.
 */
export function resolveModelRole(host: ModelSearchSettingsHost, role: ModelRoleId | LegacyModelRoleId, override: RuntimeExecutionConfig = {}): ResolvedModelRole {
  const roleId = modelRoleIdOf(role)!;
  const flash = modelTierOf(roleId) === 'flash';
  const connections = host.getModelServiceConnections();
  const choices = readModelRoleChoices(host.authority);
  const choiceOf = (id: ModelRoleId) => choices.find(choice => choice.roleId === id);
  const selectedPro = choiceOf('foreground-pro');
  const pro = selectedPro === undefined
    ? connections.find(candidate => candidate.binding.providerId === 'opencode-go' && candidate.credentialOperationState === 'ready')
    : connections.find(candidate => candidate.connectionId === selectedPro.connectionId);
  const modelOf = (connection: ModelServiceConnectionProjection | undefined, choice: ModelRoleChoiceInput | undefined) => connection === undefined ? null
    : choice === undefined ? connection.binding : { ...host.modelServiceBinding(connection.binding.providerId, choice.modelId),
      ...(choice.reasoningEffort === undefined ? {} : { reasoningEffort: choice.reasoningEffort }) };
  const proChoice = roleId === 'underlying-pro' ? choiceOf(roleId) ?? selectedPro : selectedPro;
  let effectiveConnection = roleId === 'underlying-pro' && proChoice !== undefined
    ? connections.find(candidate => candidate.connectionId === proChoice.connectionId) : pro;
  let effectiveModel = modelOf(effectiveConnection, proChoice);
  let source: ModelRoleSource = 'pro-tier';
  // Underlying Flash follows foreground Flash before Pro. No inherited model is persisted as a copy.
  const flashChoices = roleId === 'underlying-flash' ? [choiceOf('underlying-flash'), choiceOf('foreground-flash')] : [choiceOf('foreground-flash')];
  if (flash) {
    source = 'follows-foreground-pro';
    for (const choice of flashChoices) {
      if (choice === undefined) continue;
      const candidate = connections.find(entry => entry.connectionId === choice.connectionId);
      if (candidate?.credentialOperationState !== 'ready') { source = 'flash-unavailable-follows-foreground-pro'; continue; }
      if (modelServiceRouteRefusal(candidate.binding.providerId, choice.modelId, 'fast') !== null) { source = 'flash-not-served-follows-foreground-pro'; continue; }
      effectiveConnection = candidate; effectiveModel = modelOf(candidate, choice); source = 'flash-tier'; break;
    }
  }
  const perTask = override.modelConnectionId !== undefined;
  const connection = perTask ? connections.find(candidate => candidate.connectionId === override.modelConnectionId) : effectiveConnection;
  const model = perTask && !(flash && source === 'flash-tier' && connection === effectiveConnection)
    ? connection?.binding ?? null : effectiveModel;
  const resolved = { roleId, source, connection: connection ?? null, model, refusal: null,
    usedChoice: connection === undefined || model === null ? null : { connectionId: connection.connectionId, modelId: override.modelId ?? model.modelId,
      ...((override.reasoningEffort ?? model.reasoningEffort) === undefined ? {} : { reasoningEffort: override.reasoningEffort ?? model.reasoningEffort }) } };
  if (connection === undefined || model === null || connection.credentialOperationState !== 'ready') return { ...resolved, binding: null };
  const execution = resolveRuntimeExecutionConfig({ modelConnectionId: connection.connectionId, modelId: model.modelId,
    ...(model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort }) }, override);
  const record = modelServiceRuntimeBinding(model.providerId, execution.modelId!, flash ? 'fast' : 'main');
  if (record === undefined) return { ...resolved, binding: null, refusal: modelServiceRouteRefusal(model.providerId, execution.modelId!, flash ? 'fast' : 'main') };
  const binding = { route: record.route, model: record.model, credentialSlot: record.credentialSlot, credentialReference: connection.credentialReference, endpoint: record.endpoint,
    ...(execution.reasoningEffort === undefined ? {} : { reasoningEffort: execution.reasoningEffort }) };
  return { ...resolved, binding: (flash ? allowedProductionBindingOf(binding, 'fast-interaction') : allowedProductionBindingOf(binding)) === null ? null : binding };
}

/** The binding a role's Tasks take; the legacy ids still name the roles they always did (ADR 0107 §1 aliases). */
export function getConfiguredModelRoleBinding(host: ModelSearchSettingsHost, role: ModelRoleId | LegacyModelRoleId, override: RuntimeExecutionConfig = {}): ConfiguredProviderBinding | null {
  return resolveModelRole(host, role, override).binding;
}

/** The four roles as 设置 › 模型服务 lists them (Issue #1620). */
export function getModelRoles(host: ModelSearchSettingsHost): ModelRoleResolutionProjection[] {
  return MODEL_ROLE_IDS.map((roleId) => {
    const role = resolveModelRole(host, roleId);
    const state = role.connection?.credentialOperationState;
    const status = state === 'ready' ? role.refusal === null ? 'available' : 'needs-attention' : state === 'needs-attention' ? 'needs-attention' : 'setup-required';
    return { roleId, ...MODEL_ROLE_LABELS[roleId], tier: modelTierOf(roleId), source: role.source, sourceLabel: MODEL_ROLE_SOURCE_LABELS[role.source],
      binding: role.model, status, statusLabel: status === 'available' ? '可用' : status === 'needs-attention' ? '需处理' : '需设置', statusDetail: role.refusal };
  });
}

/** Restore the foreground Flash default without changing an explicit underlying choice. */
export function clearFlashModel(host: ModelSearchSettingsHost): void {
  host.assertAvailable();
  host.transaction(host.authority, () => {
    host.authority.prepare(`UPDATE model_service_connections SET updated_at = ? WHERE connection_id IN
      (SELECT connection_id FROM model_role_choices WHERE role_id = 'foreground-flash')`).run(new Date().toISOString());
    writeModelRoleChoice(host.authority, 'foreground-flash', null);
  });
}

export function selectUnderlyingModel(host: ModelSearchSettingsHost, input: import('../shared/protocol.js').ServiceOperationMap['selectUnderlyingModel']['input']): void {
  host.assertAvailable();
  if ('inherit' in input) {
    writeModelRoleChoice(host.authority, input.roleId, null);
    return;
  }
  const tier = input.roleId === 'underlying-pro' ? 'main' : 'fast';
  const refusal = modelServiceRouteRefusal(input.route, input.modelId, tier);
  requireStore(refusal === null, 'MODEL_ROUTE_NOT_SERVED', refusal ?? '');
  requireStore(modelServiceRuntimeBinding(input.route, input.modelId, tier) !== undefined, 'MODEL_CAPABILITY_UNSUPPORTED', '模型 ID 无效或渠道未准入。');
  const connection = host.getModelServiceRouteConnection(input.route);
  requireStore(connection?.credentialOperationState === 'ready', 'MODEL_SERVICE_ROUTE_NOT_CONFIGURED', '请先保护并保存凭据。');
  requireStore(input.reasoningEffort === undefined || validReasoningEffort(input.reasoningEffort), 'MODEL_EFFORT_INVALID', '请填写有效的思考强度。');
  writeModelRoleChoice(host.authority, input.roleId, { connectionId: connection.connectionId, modelId: input.modelId,
    ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort }) });
}

export function selectRoleModel(host: ModelSearchSettingsHost, route: ModelServiceRouteId, modelId: string, role: 'main' | 'fast' | 'foreground-flash' | 'both', reasoningEffort?: string, fastReasoningEffort?: string): void {
  requireStore(reasoningEffort === undefined || validReasoningEffort(reasoningEffort), 'MODEL_EFFORT_INVALID', '请填写有效的思考强度。');
  requireStore(fastReasoningEffort === undefined || validReasoningEffort(fastReasoningEffort), 'MODEL_EFFORT_INVALID', '请填写有效的思考强度。');
  const connection = host.getModelServiceRouteConnection(route);
  const roles = role === 'both' ? ['main', 'fast'] as const : [role === 'foreground-flash' ? 'fast' as const : role];
  const refusal = roles.map((item) => modelServiceRouteRefusal(route, modelId, item)).find((reason) => reason !== null) ?? null;
  requireStore(refusal === null, 'MODEL_ROUTE_NOT_SERVED', refusal ?? '');
  requireStore(roles.every((item) => modelServiceRuntimeBinding(route, modelId, item) !== undefined), 'MODEL_CAPABILITY_UNSUPPORTED', '模型 ID 无效或渠道未准入。');
  requireStore(connection !== null && connection.credentialOperationState === 'ready', 'MODEL_SERVICE_ROUTE_NOT_CONFIGURED', '请先保护并保存凭据。');
  host.transaction(host.authority, () => {
    for (const item of roles) {
      const model = item === 'main' ? 'model_id' : 'fast_model_id';
      host.authority.prepare(`UPDATE model_service_connections SET ${model} = ?, updated_at = ? WHERE connection_id = ?`)
        .run(modelId, new Date().toISOString(), connection.connectionId);
      const chosenEffort = item === 'fast' && fastReasoningEffort !== undefined ? fastReasoningEffort : reasoningEffort;
      if (chosenEffort !== undefined) {
        const effort = item === 'main' ? 'reasoning_effort' : 'fast_reasoning_effort';
        host.authority.prepare(`UPDATE model_service_connections SET ${effort} = ? WHERE connection_id = ?`).run(chosenEffort === 'off' ? null : chosenEffort, connection.connectionId);
      }
      const saved = host.getModelServiceRouteConnection(route)!;
      const selectedModel = item === 'main' ? saved.binding : saved.fastBinding!;
      writeModelRoleChoice(host.authority, item === 'main' ? 'foreground-pro' : 'foreground-flash', {
        connectionId: saved.connectionId, modelId, ...(selectedModel.reasoningEffort === undefined ? {} : { reasoningEffort: selectedModel.reasoningEffort }),
      });
      if (item === 'fast' && role !== 'foreground-flash') writeModelRoleChoice(host.authority, 'underlying-flash', null);
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
    facts.credentialSlot === connection.binding.credentialSlot && DIGEST_PATTERN.test(facts.bindingDigest) && (facts.policyVersion === 'v25' || facts.policyVersion === 'v26' || facts.policyVersion === 'v27' || facts.policyVersion === 'v30' || facts.policyVersion === 'v31' || (facts.policyVersion === 'v32' || facts.policyVersion === 'v33' || (facts.policyVersion === 'v34' || supportsEditorialMemoryPolicy(facts.policyVersion)))) &&
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
  // The chosen lighter model's result is held in memory and leaves the stored slot, which keeps the main model's result;
  // any other result — the main model's, or a model tested before it was chosen — is stored as before.
  const lighter = connection.fastBinding !== undefined && connection.fastBinding.modelId === result.modelId && connection.binding.modelId !== result.modelId;
  const where = `connection_id = ? AND credential_reference = ? AND credential_updated_at = ? AND credential_operation_state = 'ready'`;
  const arguments_ = [connection.connectionId, connection.credentialReference, connection.credentialUpdatedAt];
  requireStore(lighter
    ? host.authority.prepare(`SELECT 1 FROM model_service_connections WHERE ${where}`).get(...arguments_) !== undefined
    : host.authority.prepare(`UPDATE model_service_connections SET connection_test = ? WHERE ${where}`).run(JSON.stringify(sanitized), ...arguments_).changes === 1,
  'MODEL_SERVICE_CONNECTION_CONFLICT', '连接已变化；请重新测试。');
  const held = HELD_CONNECTION_TESTS.get(host.authority) ?? new Map<string, Map<string, ModelConnectionTestStatus>>();
  HELD_CONNECTION_TESTS.set(host.authority, held);
  // A held result of an older credential is no longer valid; start the connection's set again.
  const models = new Map([...(held.get(connection.connectionId) ?? [])].filter(([, kept]) => kept.credentialUpdatedAt === connection.credentialUpdatedAt));
  models.delete(sanitized.modelId);
  models.set(sanitized.modelId, sanitized);
  if (models.size > MAX_HELD_MODELS_PER_CONNECTION) models.delete(models.keys().next().value!);
  held.set(connection.connectionId, models);
}
