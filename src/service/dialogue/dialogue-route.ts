import type { DeveloperLiveProviderProcessingVersion, LaunchPolicyProjection } from '../../shared/protocol.js';
import type { CredentialSlotBinding } from '../provider/credential-broker.js';
import { PROVIDER_ROUTE_PROFILES, type ProviderRouteProfile } from '../provider/deepseek-adapter.js';
import { OPENCODE_GO_ROUTE, type OutboundDataCategory, type RemoteExecutionRoute } from '../provider/egress-gate.js';
import { modelProfileFor, type ProviderModelProfile } from '../provider/model-profile.js';

/**
 * Which live route an Interactive Editorial Dialogue may take (Issue #52, plan slice S17c; ADR 0088; ADR 0089): exactly the
 * one the selected Provider Processing policy admits for it, read from the verified launch projection and nowhere else.
 *
 * The projection lists the policy's allow rules (`providerProcessing.admittedRules`, Issue #831). A dialogue may go live only
 * when exactly one rule names the dialogue kind together with the editor's selected excerpt as its outbound category, and that
 * rule's route, endpoint, credential slot and model are ones the provider documents declare. No version number, route or
 * model is written here: they are what the selected policy says. A projection that lists no such rule — v9's, a denial, or
 * development-ci — admits no live dialogue, and the dialogue refuses before anything is recorded or sent.
 */
export const DIALOGUE_TASK_KIND = 'editorial-dialogue' as const;
export const DIALOGUE_OUTBOUND_CATEGORY = 'editor-selected-manuscript-excerpt' as const;

/** The live route one admitted rule binds, resolved against the declared route and model profiles. */
export interface AdmittedFastRoleRoute {
  readonly ruleId: string;
  readonly providerProcessingVersion: DeveloperLiveProviderProcessingVersion;
  readonly modelRole: CredentialSlotBinding['modelRole'];
  readonly profile: ProviderRouteProfile;
  readonly modelProfile: ProviderModelProfile;
  /** The outbound categories the rule names, as the Egress Gate reads them; the kind's own excerpt category among them. */
  readonly outboundDataCategories: ReadonlySet<OutboundDataCategory>;
}

/** The dialogue's admitted route: the fast-role route its rule binds. */
export type AdmittedDialogueRoute = AdmittedFastRoleRoute;

/** The categories the Egress Gate reads; a rule naming any other carries it to no binding. */
const OUTBOUND_CATEGORIES: ReadonlyArray<OutboundDataCategory> = ['public-or-synthetic', 'editor-selected-manuscript-excerpt', 'manuscript-conflict-region-excerpt'];

/** The roles the Credential Broker binds a slot for; a rule naming any other cannot release a credential. */
const BINDABLE_ROLES: ReadonlyArray<CredentialSlotBinding['modelRole']> = ['Fast Interaction Role', 'Main Editorial Role'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function strings(value: unknown): ReadonlyArray<string> | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value as string[] : null;
}

/** Read the admitted dialogue route from the verified launch projection, or `null` when the selected policy admits none. */
export function admittedDialogueRoute(policy: LaunchPolicyProjection): AdmittedDialogueRoute | null {
  return admittedFastRoleRoute(policy, DIALOGUE_TASK_KIND, DIALOGUE_OUTBOUND_CATEGORY);
}

/**
 * Read the route the selected policy admits for one foreground kind on the Fast Interaction Role — the dialogue, 润色这段 or
 * 基于当前稿件重新生成建议 (Issue #842) — or `null` when it admits none: exactly one rule must name the kind id together with
 * the kind's own outbound category, read as the dialogue's rule is read.
 */
export function admittedFastRoleRoute(policy: LaunchPolicyProjection, kindId: string, category: OutboundDataCategory): AdmittedFastRoleRoute | null {
  const processing = policy.providerProcessing;
  if (policy.integrityState !== 'verified' || policy.operationalScope !== 'developer-live' ||
      processing.decision !== 'eligible-only' || processing.liveTransmissionAllowed !== true ||
      processing.version === null || processing.version === 'v1') return null;
  // The selected policy's allow rules, as the launch verified them; a projection that carries none admits nothing.
  const rules: ReadonlyArray<unknown> = processing.admittedRules ?? [];
  const kindRules = rules.filter((rule) => isRecord(rule) &&
    (strings(rule['taskKinds']) ?? []).includes(kindId) &&
    (strings(rule['outboundDataCategories']) ?? []).includes(category));
  // Two rules for the same kind would leave the binding to an accident of order: neither is taken.
  if (kindRules.length !== 1) return null;
  const rule = kindRules[0] as Record<string, unknown>;
  const { ruleId, modelRole, route, endpoint, model, credentialSlot } = rule;
  if (typeof ruleId !== 'string' || ruleId.length === 0 || ruleId.length > 128 || typeof route !== 'string' ||
      typeof endpoint !== 'string' || typeof model !== 'string' || typeof credentialSlot !== 'string') return null;
  if (!BINDABLE_ROLES.includes(modelRole as CredentialSlotBinding['modelRole'])) return null;
  // The developer-live runtime hands its captured transport to the Go route only, and the dialogue ledger records no other.
  if (route !== OPENCODE_GO_ROUTE) return null;
  const profile = (PROVIDER_ROUTE_PROFILES as Readonly<Record<string, ProviderRouteProfile>>)[route];
  if (profile === undefined || profile.endpoint !== endpoint || profile.credentialSlot !== credentialSlot) return null;
  const modelProfile = modelProfileFor(route as RemoteExecutionRoute, model);
  if (modelProfile === null) return null;
  return {
    ruleId,
    providerProcessingVersion: processing.version,
    modelRole: modelRole as CredentialSlotBinding['modelRole'],
    profile,
    modelProfile,
    outboundDataCategories: new Set(OUTBOUND_CATEGORIES.filter((category) => strings(rule['outboundDataCategories'])!.includes(category))),
  };
}
