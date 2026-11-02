import { DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../shared/protected-secret-identity.js';
import { MODEL_SERVICE_ROUTE_BINDINGS, type ModelServiceRouteId } from '../../shared/protocol/model-service.js';
import type { EditorialStore } from '../store.js';
import type { OrdinaryProductionRuntime } from '../launch-policy.js';
import { CredentialBroker, type SecretResolver } from './credential-broker.js';
import { listProviderModels, PROVIDER_ROUTE_PROFILES } from './deepseek-adapter.js';

/** Saving a protected key or explicitly refreshing asks for account metadata only. CI never resolves a key or sends. */
export async function refreshModelServiceModels(store: EditorialStore, runtime: OrdinaryProductionRuntime | null,
  route: ModelServiceRouteId, resolver: SecretResolver): Promise<void> {
  if (runtime === null) return;
  const connection = store.getModelServiceRouteConnection(route);
  if (connection?.credentialOperationState !== 'ready' || DEVELOPMENT_CREDENTIAL_REFERENCES.has(connection.credentialReference.toLowerCase())) return;
  const profile = PROVIDER_ROUTE_PROFILES[route];
  if (profile.credentialSlot !== MODEL_SERVICE_ROUTE_BINDINGS[route].credentialSlot) return;
  try {
    const broker = new CredentialBroker(resolver, { developmentReferences: 'refused' });
    const models = await broker.releaseForModelDiscovery({ slot: profile.credentialSlot, credentialReference: connection.credentialReference,
      isCurrent: () => {
        const current = store.getModelServiceRouteConnection(route);
        return current?.credentialOperationState === 'ready' && current.credentialReference === connection.credentialReference && current.credentialUpdatedAt === connection.credentialUpdatedAt;
      },
    }, (secret) => listProviderModels(profile, runtime.nativeFetch, secret));
    store.cacheModelServiceModels(connection, models);
  } catch {
    // Offline/unsupported gateways preserve the last successful catalogue; fresh connections show built-in defaults.
  }
}
