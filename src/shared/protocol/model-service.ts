import type { ModelServiceRouteId } from '../protocol.js';
import type { CONFIGURED_RUNTIME_MODEL_TABLE } from '../provider-configuration.generated.js';

type ProductionBinding = (typeof CONFIGURED_RUNTIME_MODEL_TABLE)['ordinaryProduction'][keyof (typeof CONFIGURED_RUNTIME_MODEL_TABLE)['ordinaryProduction']][number];
/** A configured route the runtime model table records for a production role: what a Run, a turn or a test may bind (Issue #1225). */
export type OrdinaryProductionRouteId = ProductionBinding['route'];

/**
 * The six channels 设置 › 模型服务's one flow offers (ADR 0094 §1; Issue #1215), in the order it lists them. A channel is a
 * provider document's routes taken together; only a channel that is itself a Model Service route has a credential to save.
 */
export const MODEL_SERVICE_CHANNELS = [
  'opencode-zen', 'opencode-go', 'anthropic-claude', 'google-gemini', 'openai-platform', 'deepseek-open-platform',
] as const;
export type ModelServiceChannelId = (typeof MODEL_SERVICE_CHANNELS)[number];

/** A family's per-model capability, as the generated declarations state it (Issue #1180). */
export type ModelServiceCapabilityDisposition = 'supported' | 'untested' | 'unsupported';

/**
 * Whether a declared model can be chosen for a role, and when not, the named reason: the selected policy does not admit its
 * protocol family, its text answer is not established, or it is a reviewed declaration with no runtime model-table record.
 * `eligible` still needs the channel's ready credential, which the connection says.
 */
export type ModelServiceModelDisposition =
  | 'eligible'
  | 'family-not-admitted-by-selected-policy'
  | 'untested:text'
  | 'unsupported:text'
  | 'not-in-runtime-model-table';

export interface ModelServiceChannelModelProjection {
  modelId: string;
  modelLabel: string;
  /** The protocol family of the route that declares it. */
  family: string;
  capabilities: { text: ModelServiceCapabilityDisposition; stream: ModelServiceCapabilityDisposition; functionTools: ModelServiceCapabilityDisposition };
  main: ModelServiceModelDisposition;
  fast: ModelServiceModelDisposition;
}

export interface ModelServiceChannelProjection {
  channelId: ModelServiceChannelId;
  channelLabel: string;
  /** The Model Service route its credential is saved and tested under; `null` when the channel has none to offer. */
  route: ModelServiceRouteId | null;
  /** Every model its routes declare, in declaration order. */
  models: readonly ModelServiceChannelModelProjection[];
}
