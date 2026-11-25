import {
  MODEL_SERVICE_ROUTE_BINDINGS,
  MODEL_SERVICE_ROUTE_EFFECT_LABEL,
  MODEL_SERVICE_ROUTES,
  modelServiceModels,
  type ModelRoleStatus,
  type ModelRoleStatusLabel,
  type ModelServiceConnectionProjection,
  type ModelServiceRouteId,
  type ModelServiceSettingsProjection,
  type ModelServiceStoredStateProjection,
  type ModelServiceUnsupportedProviderProjection,
  type SearchBackendSettingsProjection,
} from '../shared/protocol.js';
import { CONFIGURED_PROVIDER_LABELS, CONFIGURED_ROUTE_IDS } from '../shared/provider-configuration.generated.js';

/** The settings requests that choose a model and answer with the settings projection (Issues #1225, #1620). */
export const MODEL_SELECTION_OPERATIONS = ['selectFastRoleModel', 'selectMainRoleModel', 'selectBothRoleModels', 'selectUnderlyingModel', 'selectProModel', 'selectFlashModel', 'clearFlashModel'] as const;

/**
 * 设置 › 模型服务's projection, from the service's stored state and the connections main has confirmed against the Protected
 * Secret Store: the legacy role cards and route choice (Issue #811), and the four roles of ADR 0107 §1 (Issue #1620).
 */
export function modelServiceSettingsProjection(state: ModelServiceStoredStateProjection, connections: readonly ModelServiceConnectionProjection[],
  searchBackends: SearchBackendSettingsProjection, secretStoreAvailable: boolean, platform: NodeJS.Platform): ModelServiceSettingsProjection {
  const connectionOf = (route: ModelServiceRouteId): ModelServiceConnectionProjection | null =>
    connections.find((connection) => connection.binding.providerId === route) ?? null;
  const statusOf = (connection: ModelServiceConnectionProjection | null): ModelRoleStatus => !secretStoreAvailable
    ? 'unavailable'
    : connection === null || connection.credentialOperationState === 'missing'
      ? 'setup-required'
      : connection.credentialOperationState === 'ready' ? 'available' : 'needs-attention';
  const labelOf = (status: ModelRoleStatus): ModelRoleStatusLabel => status === 'available' ? '可用'
    : status === 'setup-required' ? '需设置' : status === 'needs-attention' ? '需处理' : '不可用';
  // The route new Tasks use (Issue #811): the editor's choice, else the default Go route once its credential is ready.
  const selected = connections.find((connection) => connection.selected) ?? null;
  const inUseRoute: ModelServiceRouteId | null = selected?.binding.providerId ??
    (connectionOf('opencode-go')?.credentialOperationState === 'ready' ? 'opencode-go' : null);
  const connection = inUseRoute === null ? null : connectionOf(inUseRoute);
  // A stored model AI7 cannot send (#1582) needs attention although its key is ready; the role says why.
  const refused = (roleId: string): string | null => state.modelRoles.find((role) => role.roleId === roleId)?.statusDetail ?? null;
  const attention = (status: ModelRoleStatus, roleId: string): ModelRoleStatus => status === 'available' && refused(roleId) !== null ? 'needs-attention' : status;
  const mainStatus = attention(statusOf(connection), 'foreground-pro');
  const mainStatusLabel = labelOf(mainStatus);
  const mainBinding = connection?.binding ?? MODEL_SERVICE_ROUTE_BINDINGS[inUseRoute ?? 'opencode-go'];
  // The legacy Fast card shows what the Flash roles resolve to (Issue #1620): the chosen Flash model, or 前台 Pro's.
  const flash = state.modelRoles.find((role) => role.roleId === 'foreground-flash');
  const fastConnection = flash?.binding == null ? null : connectionOf(flash.binding.providerId);
  const fastStatus = attention(statusOf(fastConnection), 'foreground-flash');
  const fastBinding = flash?.binding ?? null;
  const mainStatusDetail = !secretStoreAvailable
    ? '当前操作系统安全凭据库不可用；未启用替代存储。'
    : refused('foreground-pro') ?? (mainStatus === 'available'
      ? '连接名称与凭据已由操作系统安全凭据库保护。'
      : mainStatus === 'needs-attention'
        ? '凭据状态无法确认；请重新输入或移除。'
        : '请输入连接名称与凭据。');
  const unconfigured = (
    roleId: 'fast-interaction' | 'difficult-escalation' | 'frontier',
    roleLabel: '快速交互角色' | '疑难升级角色' | '前沿模型角色',
    purposeLabel: string,
  ) => ({
    roleId,
    roleLabel,
    purposeLabel,
    status: 'setup-required' as const,
    statusLabel: '需设置' as const,
    statusDetail: '当前版本未配置此角色的模型服务绑定。',
    binding: null,
    connection: null,
  });
  // Under ordinary-production the Fast Interaction Role takes the one route the editor chose, as the main role does.
  const fastInteraction = fastConnection !== null
    ? {
        roleId: 'fast-interaction' as const,
        roleLabel: '快速交互角色' as const,
        purposeLabel: '快速交互与低风险候选生成',
        status: fastStatus,
        statusLabel: labelOf(fastStatus),
        statusDetail: refused('foreground-flash') ?? (flash?.source === 'flash-tier' ? '独立保存快速交互模型；主编辑角色的切换不会改变此选择。' : flash!.sourceLabel),
        binding: fastBinding,
        connection: fastConnection,
      }
    : unconfigured('fast-interaction', '快速交互角色', '快速交互与低风险候选生成');
  const supportedLabels = new Set(MODEL_SERVICE_ROUTES.map((route) => CONFIGURED_PROVIDER_LABELS[route]));
  const unsupportedProviders: ModelServiceUnsupportedProviderProjection[] = [];
  for (const route of CONFIGURED_ROUTE_IDS) {
    const providerLabel = CONFIGURED_PROVIDER_LABELS[route];
    if (supportedLabels.has(providerLabel) || unsupportedProviders.some((provider) => provider.providerLabel === providerLabel)) continue;
    unsupportedProviders.push({ providerId: route, providerLabel, statusLabel: '尚未支持' });
  }
  return {
    searchBackends,
    proxy: state.proxy,
    lastProxyProbe: state.lastProxyProbe ?? null,
    roles: [
      fastInteraction,
      {
        roleId: 'main-editorial',
        roleLabel: '主编辑角色',
        purposeLabel: '中文长篇写作、编辑建议与复杂指令处理',
        status: mainStatus,
        statusLabel: mainStatusLabel,
        statusDetail: mainStatusDetail,
        binding: mainBinding,
        connection,
      },
      unconfigured('difficult-escalation', '疑难升级角色', '疑难或高后果工作升级'),
      unconfigured('frontier', '前沿模型角色', '挑战性或明确授权的高后果工作'),
    ],
    routeChoice: {
      routes: MODEL_SERVICE_ROUTES.map((route) => {
        const routeConnection = connectionOf(route);
        const status = statusOf(routeConnection);
        return {
          route,
          binding: routeConnection?.binding ?? MODEL_SERVICE_ROUTE_BINDINGS[route],
          models: state.channels.find((channel) => channel.route === route)?.models.map(({ modelId, modelLabel }) => ({ ...MODEL_SERVICE_ROUTE_BINDINGS[route], modelId, modelLabel })) ?? modelServiceModels(route),
          isDefault: route === 'opencode-go',
          inUse: route === inUseRoute,
          status,
          statusLabel: labelOf(status),
          connection: routeConnection,
        };
      }),
      unsupportedProviders,
      effectLabel: MODEL_SERVICE_ROUTE_EFFECT_LABEL,
    },
    protectedSecretStore: {
      backend: platform === 'win32' ? 'windows-credential-manager' : 'macos-keychain',
      label: platform === 'win32' ? 'Windows 凭据管理器' : 'macOS 钥匙串',
      availability: !secretStoreAvailable ? 'unavailable' : 'available',
    },
    launchPolicy: state.launchPolicy, channels: state.channels,
    modelRoles: state.modelRoles.map((role) => secretStoreAvailable ? role : { ...role, status: 'unavailable' as const, statusLabel: '不可用' as const }),
    authorityStatement: '凭据就绪不授予模型处理、对外导出、运行、受控动作或公开发布权限。',
  };
}
