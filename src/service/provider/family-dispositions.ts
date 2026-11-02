import type { ConfiguredRouteId } from '../../shared/provider-configuration.generated.js';
import type { ModelCapabilities, ProviderModelProfile, RequestShape } from './model-profile.js';
import { GENERATED_FAMILY_DISPOSITIONS } from './provider-profiles.generated.js';

/** Adapter capabilities belong to the protocol family; historical per-model evidence does not gate execution (#1281). */
export type Disposition = 'supported' | 'unsupported' | 'untested';

/** The aspects a family states. The first three are per model as well; the rest are the family's alone. */
export type FamilyAspect =
  | 'text' | 'stream' | 'functionTools'
  | 'usage' | 'cancellation' | 'accountLimit' | 'rateLimit'
  | 'structuredOutput' | 'reasoningControl' | 'reasoningContinuation' | 'providerTools';
export type ModelAspect = Extract<FamilyAspect, 'text' | 'stream' | 'functionTools'>;
export type FamilyDispositions = Readonly<Record<FamilyAspect, Exclude<Disposition, 'untested'>>>;

/** Catalogue rows on a route inherit the protocol family capabilities. */
export interface RouteDispositions {
  readonly family: RequestShape;
  readonly supported: Readonly<Record<ModelAspect, ReadonlyArray<string>>>;
}

/** The `streaming` value each family's stream reader is declared under. */
export const FAMILY_STREAMING: Readonly<Record<RequestShape, NonNullable<ModelCapabilities['streaming']>>> = {
  'openai-chat-completions': 'chat-completions-sse',
  'openai-responses': 'responses-sse',
  'anthropic-messages': 'messages-sse',
  'google-generate-content': 'generate-content-sse',
};

/** Whether this model declares the stream of its own family (the dialogue owner's one test for choosing SSE). */
export function streamingDeclared(model: ProviderModelProfile): boolean {
  return model.capabilities.streaming === FAMILY_STREAMING[model.capabilities.requestShape];
}

/** One model's disposition for one per-model aspect, by the family rule above. */
export function modelDisposition(model: ProviderModelProfile, aspect: ModelAspect): Disposition {
  return GENERATED_FAMILY_DISPOSITIONS[model.capabilities.requestShape][aspect];
}

/** A named preflight refusal: which family, aspect and disposition kept the request from being attempted. */
export interface ProviderPreflightRefusal {
  readonly code: 'PROVIDER_PREFLIGHT_REFUSED';
  readonly reason: `${Disposition}:${FamilyAspect}` | 'family-not-admitted-by-selected-policy';
  readonly family: RequestShape;
  readonly route: ConfiguredRouteId;
  readonly model: string;
  /** Safe and payload-free, for the failure the adapter reports. */
  readonly message: string;
}

function refusal(model: ProviderModelProfile, reason: ProviderPreflightRefusal['reason']): ProviderPreflightRefusal {
  return {
    code: 'PROVIDER_PREFLIGHT_REFUSED', reason, family: model.capabilities.requestShape, route: model.route, model: model.model,
    message: `模型服务协议 ${model.capabilities.requestShape} 不支持本步骤（${reason}）；未发送任何内容。`,
  };
}

/**
 * Refuse a request whose demand this model is not `supported` for: a text answer always, a stream when the step streams,
 * function tools when it offers any. `null` when every demanded aspect is supported.
 */
export function providerPreflight(model: ProviderModelProfile, demand: { readonly stream: boolean; readonly functionTools: boolean }): ProviderPreflightRefusal | null {
  const aspects: ModelAspect[] = ['text', ...(demand.stream ? ['stream' as const] : []), ...(demand.functionTools ? ['functionTools' as const] : [])];
  for (const aspect of aspects) {
    const disposition = modelDisposition(model, aspect);
    if (disposition !== 'supported') return refusal(model, `${disposition}:${aspect}`);
  }
  return null;
}

/**
 * Refuse a binding whose family the selected policy does not admit for its role (ADR 0095 §6): a model inside an admitted
 * family is configuration, and a new family needs a policy successor. `null` when the family is admitted.
 */
export function familyAdmissionRefusal(model: ProviderModelProfile, admittedFamilies: ReadonlySet<RequestShape>): ProviderPreflightRefusal | null {
  return admittedFamilies.has(model.capabilities.requestShape) ? null : refusal(model, 'family-not-admitted-by-selected-policy');
}
