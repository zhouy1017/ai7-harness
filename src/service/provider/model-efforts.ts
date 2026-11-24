import { DISCOVERED_EFFORT_LEVELS, type DiscoveredEffortLevel, type DiscoveredModel, type ModelServiceSupportedEfforts } from '../../shared/protocol/model-service.js';
import { sentReasoningEffort } from '../../shared/runtime-execution-config.js';
import type { ProviderModelProfile } from './model-profile.js';

export const MODEL_EFFORT_STALE_REASON = '之前选的强度现在不可用，请重新选择。';

/** Discovery takes priority over exact-model documentation. A route's encoding hints grant no model a level. */
export function supportedEffortsOf(entry: DiscoveredModel, model: ProviderModelProfile): ModelServiceSupportedEfforts | undefined {
  const evidence = entry.reasoningEvidence;
  const family = model.capabilities.requestShape;
  const documented = model.reasoning;
  const budget = documented?.control === 'google-thinking-budget';
  const encodable = (level: DiscoveredEffortLevel): boolean => {
    if (family === 'anthropic-messages') return level !== 'none' && level !== 'minimal';
    if (family === 'google-generate-content') return !budget && level !== 'none' && level !== 'max';
    return true;
  };
  const denied = new Set<string>(evidence?.effort?.unsupportedLevels);
  if (evidence !== undefined) {
    const provenance = { kind: 'discovered', observedAt: evidence.observedAt } as const;
    const effort = evidence.effort;
    const observed = effort?.levels ?? [];
    if (effort?.supported === false && observed.length > 0) return undefined;
    if (evidence.thinking?.supported === false && family === 'google-generate-content' ||
        evidence.completeness === 'complete' && (effort?.supported === false || effort?.levels !== undefined)) {
      const levels = observed.filter(level => encodable(level) && !denied.has(level));
      return levels.length === 0 ? { status: 'unsupported', levels: [], completeness: 'complete', provenance }
        : { status: 'supported', levels, completeness: 'complete', provenance };
    }
    const levels = observed.filter(level => encodable(level) && !denied.has(level));
    if (levels.length > 0) return { status: 'supported', levels, completeness: evidence.completeness, provenance };
    if (effort?.supported === false) return undefined;
  }
  if (documented === undefined) return undefined;
  const levels = budget ? documented.efforts.filter(level => /^\d+$/u.test(level))
    : DISCOVERED_EFFORT_LEVELS.filter(level => encodable(level) && documented.efforts.includes(level) && !denied.has(level));
  return levels.length === 0 ? undefined : { status: 'supported', levels, completeness: 'partial',
    provenance: { kind: 'documented', source: documented.source, readOn: documented.readOn } };
}

export function modelEffortRefusal(entry: DiscoveredModel | undefined, model: ProviderModelProfile | null, choice: string | undefined): string | null {
  const effort = sentReasoningEffort(choice);
  if (effort === null) return null;
  const supported = model === null ? undefined : supportedEffortsOf(entry ?? { modelId: model.model, modelLabel: model.displayName }, model);
  return supported?.status === 'supported' && supported.levels.includes(effort) ? null : MODEL_EFFORT_STALE_REASON;
}
