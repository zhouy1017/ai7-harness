import { describe, expect, it } from 'vitest';
import { modelServiceSettingsProjection } from '../../src/main/model-service-settings-projection.js';
import {
  MODEL_ROLE_IDS, MODEL_ROLE_LABELS, MODEL_ROLE_SOURCE_LABELS, MODEL_ROUTE_NOT_SERVED_REASON, MODEL_SERVICE_ROUTE_BINDINGS, modelTierOf,
  type ModelRoleResolutionProjection, type ModelRoleSource, type ModelServiceConnectionProjection, type ModelServiceStoredStateProjection,
  type SearchBackendSettingsProjection,
} from '../../src/shared/protocol.js';

// Issue #1620: main builds 设置 › 模型服务's projection from the service's stored state; the legacy cards keep their shape and the
// Fast card shows what the Flash roles resolve to. Synthetic connection; no credential value.
const pro = { ...MODEL_SERVICE_ROUTE_BINDINGS['anthropic-claude'], modelId: 'claude-opus-5', modelLabel: 'Claude Opus 5', reasoningEffort: 'high' };
const connection: ModelServiceConnectionProjection = {
  connectionId: 'anthropic-claude', roleId: 'main-editorial', connectionName: 'Synthetic Claude', binding: pro, fastBinding: pro,
  credentialReference: '00000000-0000-4000-8000-000000001620', credentialOperationState: 'ready', createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z', credentialUpdatedAt: '2026-11-20T00:00:00.000Z', selected: true, fastSelected: false, connectionTest: null,
};
function role(roleId: (typeof MODEL_ROLE_IDS)[number], source: ModelRoleSource, statusDetail: string | null = null): ModelRoleResolutionProjection {
  return { roleId, ...MODEL_ROLE_LABELS[roleId], tier: modelTierOf(roleId), source, sourceLabel: MODEL_ROLE_SOURCE_LABELS[source], binding: pro,
    status: statusDetail === null ? 'available' : 'needs-attention', statusLabel: statusDetail === null ? '可用' : '需处理', statusDetail };
}
function state(modelRoles: ModelRoleResolutionProjection[]): ModelServiceStoredStateProjection {
  return { proxy: { mode: 'direct' }, connection: null, connections: [connection], channels: [], modelRoles,
    launchPolicy: {} as ModelServiceStoredStateProjection['launchPolicy'] };
}
const following = (detail: string | null = null) => MODEL_ROLE_IDS.map((id) => role(id, modelTierOf(id) === 'pro' ? 'pro-tier' : 'follows-foreground-pro', detail));
const card = (projection: ReturnType<typeof modelServiceSettingsProjection>, id: string) => projection.roles.find((entry) => entry.roleId === id)!;
const backends = {} as SearchBackendSettingsProjection;

describe('the model-service settings projection main builds (Issue #1620)', () => {
  it('passes the four roles through and shows the Flash roles\' model on the legacy Fast card', () => {
    const projection = modelServiceSettingsProjection(state(following()), [connection], backends, true, 'win32');
    expect(projection.modelRoles.map((entry) => [entry.roleId, entry.source])).toEqual([['foreground-pro', 'pro-tier'],
      ['foreground-flash', 'follows-foreground-pro'], ['underlying-pro', 'pro-tier'], ['underlying-flash', 'follows-foreground-pro']]);
    expect(card(projection, 'fast-interaction')).toMatchObject({ status: 'available', statusDetail: '跟随前台 Pro', binding: pro, connection });
    expect(card(projection, 'main-editorial')).toMatchObject({ status: 'available', binding: pro, connection });
    expect(projection.roles.map((entry) => entry.roleId)).toEqual(['fast-interaction', 'main-editorial', 'difficult-escalation', 'frontier']);
  });

  it('says why a ready key cannot be used for a stored model AI7 cannot send (#1582), on both legacy cards', () => {
    const projection = modelServiceSettingsProjection(state(following(MODEL_ROUTE_NOT_SERVED_REASON)), [connection], backends, true, 'win32');
    for (const id of ['main-editorial', 'fast-interaction']) {
      expect(card(projection, id)).toMatchObject({ status: 'needs-attention', statusLabel: '需处理', statusDetail: MODEL_ROUTE_NOT_SERVED_REASON });
    }
  });

  it('marks every role unavailable without the operating system\'s secret store', () => {
    const projection = modelServiceSettingsProjection(state(following()), [connection], backends, false, 'darwin');
    expect(projection.modelRoles.map((entry) => [entry.status, entry.statusLabel])).toEqual(Array(4).fill(['unavailable', '不可用']));
    expect(card(projection, 'main-editorial').status).toBe('unavailable');
    expect(projection.protectedSecretStore).toEqual({ backend: 'macos-keychain', label: 'macOS 钥匙串', availability: 'unavailable' });
  });
});
