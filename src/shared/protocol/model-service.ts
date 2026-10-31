import { CONFIGURED_RUNTIME_MODEL_LABELS, CONFIGURED_RUNTIME_MODEL_TABLE } from '../provider-configuration.generated.js';

/**
 * The six channels 设置 › 模型服务's one flow offers (ADR 0094 §1; Issue #1215), in the order it lists them. A channel is a
 * provider document's routes taken together, and each is a Model Service route with one credential slot (Issue #1225): the
 * three OpenCode Zen routes share the Zen slot, as the Zen provider document states one credential.
 */
export const MODEL_SERVICE_CHANNELS = [
  'opencode-zen', 'opencode-go', 'anthropic-claude', 'google-gemini', 'openai-platform', 'deepseek-open-platform',
] as const;
export type ModelServiceChannelId = (typeof MODEL_SERVICE_CHANNELS)[number];
/** A production channel the editor saves a credential for and chooses a model on (Issues #811, #1044, #1225). */
export type ModelServiceRouteId = ModelServiceChannelId;
/** One connection row per route; the first two routes keep the identities Issues #712 and #811 gave them. */
export type ModelServiceConnectionId = 'main-editorial-deepseek-v4-pro' | 'main-editorial-opencode-go' | Exclude<ModelServiceRouteId, 'opencode-go' | 'deepseek-open-platform'>;

type RuntimeBinding = (typeof CONFIGURED_RUNTIME_MODEL_TABLE)['policyBaseline']['main'][number];
type ProductionBinding = (typeof CONFIGURED_RUNTIME_MODEL_TABLE)['ordinaryProduction'][keyof (typeof CONFIGURED_RUNTIME_MODEL_TABLE)['ordinaryProduction']][number];
/** A configured route the runtime model table records for a production role: what a Run, a turn or a test may bind. */
export type OrdinaryProductionRouteId = ProductionBinding['route'];

export interface ModelServiceBindingProjection {
  providerId: ModelServiceRouteId;
  providerLabel: string;
  modelId: RuntimeBinding['model'];
  modelLabel: string;
  adapterRevision: 1;
  configurationRevision: 1;
  approvedFallbackChain: readonly [];
  credentialSlot: RuntimeBinding['credentialSlot'];
}

/** The routes in the order 设置 › 模型服务 lists them: the default first (Issue #811), then the channels Issue #1225 adds. */
export const MODEL_SERVICE_ROUTES: ReadonlyArray<ModelServiceRouteId> = ['opencode-go', 'deepseek-open-platform', 'openai-platform', 'opencode-zen', 'anthropic-claude', 'google-gemini'];

/** The channel a configured route belongs to: the route itself, or a document's further route named after it; `null` for any other. */
export function modelServiceChannelOf(route: string): ModelServiceChannelId | null {
  return MODEL_SERVICE_CHANNELS.find((channel) => route === channel || route.startsWith(`${channel}-`)) ?? null;
}

function binding(providerId: ModelServiceRouteId, providerLabel: string, modelId: RuntimeBinding['model'], credentialSlot: RuntimeBinding['credentialSlot']): ModelServiceBindingProjection {
  const row = (CONFIGURED_RUNTIME_MODEL_TABLE.policyBaseline.main as readonly RuntimeBinding[]).find((entry) => entry.model === modelId && modelServiceChannelOf(entry.route) === providerId)!;
  return { providerId, providerLabel, modelId, modelLabel: CONFIGURED_RUNTIME_MODEL_LABELS[`${row.route}/${modelId}`]!,
    adapterRevision: 1, configurationRevision: 1, approvedFallbackChain: [], credentialSlot };
}

/** Each channel's default model: the first binding Provider Processing v32 lists for it. `modelServiceModels` lists its reviewed choices; no fallback chain. */
export const MODEL_SERVICE_ROUTE_BINDINGS: Readonly<Record<ModelServiceRouteId, ModelServiceBindingProjection>> = {
  'opencode-go': binding('opencode-go', 'OpenCode Go', 'deepseek-v4.1-flash', 'opencode-go'),
  'deepseek-open-platform': binding('deepseek-open-platform', 'DeepSeek 开放平台（官方）', 'deepseek-flash', 'deepseek-api-key'),
  'openai-platform': binding('openai-platform', 'OpenAI 官方', 'gpt-5.6-luna', 'openai-platform'),
  'opencode-zen': binding('opencode-zen', 'OpenCode Zen', 'deepseek-v4.1-flash', 'opencode-zen'),
  'anthropic-claude': binding('anthropic-claude', 'Claude 官方', 'claude-opus-5', 'anthropic-claude'),
  'google-gemini': binding('google-gemini', 'Gemini 官方', 'gemini-3.8-flash', 'google-gemini'),
};

/** The connection row each route is saved under. */
export const MODEL_SERVICE_CONNECTION_IDS: Readonly<Record<ModelServiceRouteId, ModelServiceConnectionId>> = {
  'opencode-go': 'main-editorial-opencode-go', 'deepseek-open-platform': 'main-editorial-deepseek-v4-pro', 'openai-platform': 'openai-platform',
  'opencode-zen': 'opencode-zen', 'anthropic-claude': 'anthropic-claude', 'google-gemini': 'google-gemini',
};

/**
 * Whether a model on this route is chosen only after a passed exact-model text connection test on the current credential: every
 * channel whose text answer rests on vendor documentation alone (the v25 precedent, Issue #1044; Issue #1225 revision 3). The Go
 * and DeepSeek 开放平台（官方） routes carry recorded live evidence and stay as they were.
 */
export function modelServiceTestRequired(route: ModelServiceRouteId): boolean {
  return route !== 'opencode-go' && route !== 'deepseek-open-platform';
}

/** The reviewed runtime record a channel's model takes for a role: its configured route, endpoint and slot; `undefined` when none. */
export function modelServiceRuntimeBinding(route: ModelServiceRouteId, modelId: string, role: 'main' | 'fast'): ProductionBinding | undefined {
  return (CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction[role] as readonly ProductionBinding[])
    .find((row) => row.model === modelId && modelServiceChannelOf(row.route) === route);
}

/** Reviewed text choices only: every model the runtime model table records on the channel for either role, the default first. */
export function modelServiceModels(route: ModelServiceRouteId): readonly ModelServiceBindingProjection[] {
  const rows = [...CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction.main, ...CONFIGURED_RUNTIME_MODEL_TABLE.ordinaryProduction.fast] as readonly ProductionBinding[];
  const ids = [...new Set(rows.filter((row) => modelServiceChannelOf(row.route) === route).map((row) => row.model))];
  const first = MODEL_SERVICE_ROUTE_BINDINGS[route];
  return [first, ...ids.filter((id) => id !== first.modelId).map((modelId) => binding(route, first.providerLabel, modelId, first.credentialSlot))]
    .filter((model) => (ids as readonly string[]).includes(model.modelId));
}

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
