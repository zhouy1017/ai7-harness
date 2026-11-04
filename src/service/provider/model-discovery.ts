import { DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../shared/protected-secret-identity.js';
import { MODEL_SERVICE_ROUTE_BINDINGS, type ModelDiscoveryResult, type ModelServiceRouteId } from '../../shared/protocol/model-service.js';
import type { EditorialStore } from '../store.js';
import type { OrdinaryProductionRuntime } from '../launch-policy.js';
import { CredentialBroker, type SecretResolver } from './credential-broker.js';
import { listProviderModels, PROVIDER_ROUTE_PROFILES } from './deepseek-adapter.js';

/** Saving a protected key or explicitly refreshing asks for account metadata only. CI never resolves a key or sends. */
export async function refreshModelServiceModels(store: EditorialStore, runtime: OrdinaryProductionRuntime | null,
  route: ModelServiceRouteId, resolver: SecretResolver): Promise<ModelDiscoveryResult> {
  if (runtime === null) return failure('MODEL_SERVICE_UNREACHABLE', '模型服务不可达，请检查网络或网络代理设置');
  const connection = store.getModelServiceRouteConnection(route);
  if (connection?.credentialOperationState !== 'ready' || DEVELOPMENT_CREDENTIAL_REFERENCES.has(connection.credentialReference.toLowerCase())) {
    return failure('MODEL_DISCOVERY_UNAVAILABLE', '模型列表暂不可用');
  }
  const profile = PROVIDER_ROUTE_PROFILES[route];
  if (profile.credentialSlot !== MODEL_SERVICE_ROUTE_BINDINGS[route].credentialSlot) return failure('MODEL_DISCOVERY_UNAVAILABLE', '模型列表暂不可用');
  try {
    const broker = new CredentialBroker(resolver, { developmentReferences: 'refused' });
    const models = await broker.releaseForModelDiscovery({ slot: profile.credentialSlot, credentialReference: connection.credentialReference,
      isCurrent: () => {
        const current = store.getModelServiceRouteConnection(route);
        return current?.credentialOperationState === 'ready' && current.credentialReference === connection.credentialReference && current.credentialUpdatedAt === connection.credentialUpdatedAt;
      },
    }, (secret) => listProviderModels(profile, runtime.nativeFetch, secret));
    store.cacheModelServiceModels(connection, models);
    return { status: 'success', modelCount: models.length };
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
    if (code === 'MODEL_SERVICE_UNREACHABLE') return failure(code, '模型服务不可达，请检查网络或网络代理设置');
    if (code === 'AI7_PROXY_UNREACHABLE') return failure(code, '代理不可达：请检查网络代理设置');
    if (code === 'MODEL_DISCOVERY_CREDENTIAL_REJECTED') return failure(code, '模型服务拒绝了凭据');
    if (code === 'MODEL_DISCOVERY_EMPTY') return failure(code, '账号没有返回可用模型；可手动输入模型 ID');
    if (code === 'MODEL_DISCOVERY_INVALID') return failure(code, '模型服务返回的列表格式无效；可手动输入模型 ID');
    if (code === 'MODEL_DISCOVERY_UNAVAILABLE') {
      const status = error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 0;
      if (status === 401 || status === 403) return failure('MODEL_DISCOVERY_CREDENTIAL_REJECTED', '模型服务拒绝了凭据');
      return failure(code, `模型服务没有返回模型列表（HTTP ${status}）`);
    }
    return failure('MODEL_SERVICE_UNREACHABLE', '模型服务不可达，请检查网络或网络代理设置');
  }
}

function failure(code: Extract<ModelDiscoveryResult, { status: 'failure' }>['code'], reason: string): ModelDiscoveryResult {
  return { status: 'failure', code, reason };
}
