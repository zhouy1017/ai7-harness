import type { EditorialStore } from '../../src/service/store.js';
import type { DiscoveredEffortLevel, DiscoveredModel, ModelServiceRouteId } from '../../src/shared/protocol/model-service.js';

/** Inject account metadata only. Tests still use a synthetic transport or no transport. */
export function seedModelEfforts(store: EditorialStore, route: ModelServiceRouteId,
  record: Readonly<Record<string, readonly DiscoveredEffortLevel[]>>): void {
  const connection = store.getModelServiceRouteConnection(route);
  if (connection?.credentialOperationState !== 'ready') throw new Error('Expected a ready synthetic connection');
  const catalogue = new Map<string, DiscoveredModel>(store.getModelServiceModels(route).map(model => [model.modelId, model]));
  for (const [modelId, levels] of Object.entries(record)) {
    catalogue.set(modelId, { modelId, modelLabel: catalogue.get(modelId)?.modelLabel ?? modelId,
      reasoningEvidence: { source: 'provider-model-list', observedAt: new Date().toISOString(), completeness: 'complete',
        effort: { supported: levels.length > 0, levels } } });
  }
  store.cacheModelServiceModels(connection, Array.from(catalogue.values()));
}
