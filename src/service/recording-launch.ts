import {
  CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES,
  CONFIGURED_RUNTIME_MODEL_TABLE,
} from '../shared/provider-configuration.generated.js';
import { modelRoleOfTaskKind, modelTierOf } from '../shared/protocol/model-roles.js';
import type { DevelopmentValidationIntent } from '../shared/protocol.js';

const RECORDING_FAMILY_PREFIX = 'four-provider-recording-';
const providers = CONFIGURED_RUNTIME_MODEL_TABLE.recordingProviders;
export type RecordingProvider = keyof typeof providers;
export const RECORDING_ROUTES = [...new Set(Object.values(providers).flatMap(pair => [pair.pro.route, pair.flash.route]))];

/** The named validation family selects one configured provider for the entire launch. */
export function recordingProviderFor(validation: DevelopmentValidationIntent, env = process.env): RecordingProvider | null {
  if (!validation.family.startsWith(RECORDING_FAMILY_PREFIX)) return null;
  const provider = validation.family.slice(RECORDING_FAMILY_PREFIX.length);
  if (env.CI !== undefined || env.GITHUB_ACTIONS !== undefined || env.AI7_E2E_JOURNEY !== undefined ||
      !Object.hasOwn(providers, provider)) throw new Error('RECORDING_LAUNCH_NOT_ADMITTED');
  return provider as RecordingProvider;
}

export function recordingBindingFor(provider: RecordingProvider, taskKind: string) {
  const binding = providers[provider][modelTierOf(modelRoleOfTaskKind(taskKind))];
  const reasoningEffort = 'reasoningEffort' in binding ? binding.reasoningEffort : undefined;
  return { route: binding.route, endpoint: binding.endpoint, model: binding.model, credentialSlot: binding.credentialSlot,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }), credentialReference: CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES[binding.credentialSlot] };
}

export function recordingHostAllowances(provider: RecordingProvider) {
  const endpoints = [providers[provider].pro.endpoint, providers[provider].flash.endpoint];
  const targets = endpoints.map(value => {
    const endpoint = new URL(value);
    return { host: endpoint.hostname, port: endpoint.port === '' ? 443 : Number(endpoint.port) };
  });
  return targets.filter((target, index) => targets.findIndex(candidate => candidate.host === target.host && candidate.port === target.port) === index);
}
