import { randomUUID } from 'node:crypto';
import { sha256Hex } from '../analysis/canonical.js';
import { DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS } from '../analysis/execution.js';
import { admittedFastRoleRoute, type AdmittedFastRoleRoute } from '../dialogue/dialogue-route.js';
import { describeComposition, prepareExecution, type HarnessTurnOutcome, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import { CONNECTION_TEST_KIND, CONNECTION_TEST_POLICY, ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy, isOrdinaryProductionRuntime, type DeveloperLiveRuntime, type LiveRuntime, type OrdinaryProductionRuntime } from '../launch-policy.js';
import type { EditorialStore } from '../store.js';
import type { ModelTextAttemptProvenance, FastModelSelectionInput, ModelConnectionTestStatus, LaunchPolicyProjection } from '../../shared/protocol.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../shared/protected-secret-identity.js';
import { MODEL_SERVICE_SETUP_REQUIRED_REASON, type DeveloperLiveProviderProcessingVersion, type OrdinaryProductionProviderProcessingVersion } from '../../shared/protocol.js';
import { AI7_FAILURE_CODES } from '../provider/classification.js';
import { CredentialBroker, type CredentialSlotBinding, type SecretResolver } from '../provider/credential-broker.js';
import { DeepSeekOpenAiCompatibleAdapter, type DeepSeekTransport } from '../provider/deepseek-adapter.js';
import { Ai7LocalDeterministicAdapter } from '../provider/local-deterministic-adapter.js';
import {
  LOCAL_DETERMINISTIC_MODEL,
  LOCAL_DETERMINISTIC_ROUTE,
  evaluateEgress,
  type EgressBindingFacts,
  type ExecutionRoute,
  type OutboundDataCategory,
  type TransmitTicket,
} from '../provider/egress-gate.js';
import { transmitOnce } from '../provider/live-transmission.js';
import type { ResolvedModelFixture } from '../provider/model-fixture.js';
import { ProviderResultCache, ProviderResultCacheError, type ProviderTestItemSlice } from '../provider/provider-result-cache.js';
import {
  CONFLICT_REGENERATE_KIND,
  CONFLICT_REGENERATE_PROMPT_CONTRACT,
  CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST,
} from './conflict-regenerate-contract.js';
import { FastRoleError } from './fast-role-error.js';
import { MATERIAL_TRANSLATION_KIND, MATERIAL_TRANSLATION_PROMPT_CONTRACT, MATERIAL_TRANSLATION_PROMPT_CONTRACT_DIGEST } from './material-translation-contract.js';
import { EDITORIAL_POLISH_KIND, EDITORIAL_POLISH_PROMPT_CONTRACT, EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST } from './polish-contract.js';

export { FastRoleError };

/**
 * The Fast Interaction Role's one-request kinds (Issue #842; decisions D7/D18 of the 1.0.0 scope): 润色这段 and 稿件冲突 ›
 * 基于当前稿件重新生成建议. Each invocation is one foreground editor action that sends one bounded message and reads one answer —
 * no Run, no plan, no synthesis, reflection or sample — and what it answers is only ever a Suggestion the editor decides on.
 *
 * Two routes, as the dialogue has (Issue #52, S17a/S17c). Under development-ci the launch's deterministic fixture answers, when
 * the launch binds one. Under developer-live the request goes to the route the selected Provider Processing policy admits for
 * the kind — read from the verified launch projection by `admittedFastRoleRoute`, never written here — with the credential the
 * broker releases to the final adapter alone, and its excerpt category checked by the Egress Gate against that rule. A launch
 * that admits no route for the kind, or a Book that is not an admitted Public SampleBook, refuses before anything is sent.
 *
 * Under a launch that names a development validation (ADR 0089, Issue #808), the request goes through the Provider Test Ledger
 * and Result Cache with the kind's own slice (`S30` polish, `S22` conflict regeneration): an identical request replays the
 * captured answer and nothing is sent twice; a request whose answer may have been billed and never came back whole is
 * outcome-unknown as `transmitOnce` defines it. Outside one — actual business — the request reaches the transport itself.
 */
export type FastRoleKindId = typeof EDITORIAL_POLISH_KIND | typeof CONFLICT_REGENERATE_KIND | typeof MATERIAL_TRANSLATION_KIND | typeof CONNECTION_TEST_KIND;

export interface FastRoleKindDefinition {
  readonly kindId: FastRoleKindId;
  /** The action as the editor names it, which every reason says. */
  readonly label: string;
  readonly category: OutboundDataCategory;
  /**
   * The category its words go out under ordinary production when it differs (生成来源译文, Issue #892: a 资料库 item's words
   * are the house's material there, `frozen-material-reference-excerpt`); `category` otherwise.
   */
  readonly productionCategory?: OutboundDataCategory;
  readonly slice: ProviderTestItemSlice;
  readonly systemPrompt: string;
  readonly promptContractDigest: string;
}

export const FAST_ROLE_KINDS: Readonly<Record<FastRoleKindId, FastRoleKindDefinition>> = {
  [CONNECTION_TEST_KIND]: {
    kindId: CONNECTION_TEST_KIND, label: '测试文本连接', category: 'public-or-synthetic', slice: 'S80',
    systemPrompt: CONNECTION_TEST_POLICY.systemPrompt, promptContractDigest: sha256Hex(JSON.stringify(CONNECTION_TEST_POLICY)),
  },
  [EDITORIAL_POLISH_KIND]: {
    kindId: EDITORIAL_POLISH_KIND,
    label: '润色这段',
    category: 'editor-selected-manuscript-excerpt',
    slice: 'S30',
    systemPrompt: EDITORIAL_POLISH_PROMPT_CONTRACT.systemPrompt,
    promptContractDigest: EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST,
  },
  [CONFLICT_REGENERATE_KIND]: {
    kindId: CONFLICT_REGENERATE_KIND,
    label: '重新生成建议',
    category: 'manuscript-conflict-region-excerpt',
    slice: 'S22',
    systemPrompt: CONFLICT_REGENERATE_PROMPT_CONTRACT.systemPrompt,
    promptContractDigest: CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST,
  },
  // 生成来源译文 (Issue #892): a 资料库 item's paragraphs, a bounded batch per request. Under developer-live only an admitted
  // public original goes (`material-translation-contract.ts`), as public-or-synthetic material.
  [MATERIAL_TRANSLATION_KIND]: {
    kindId: MATERIAL_TRANSLATION_KIND,
    label: '生成来源译文',
    category: 'public-or-synthetic',
    productionCategory: 'frozen-material-reference-excerpt',
    slice: 'S80',
    systemPrompt: MATERIAL_TRANSLATION_PROMPT_CONTRACT.systemPrompt,
    promptContractDigest: MATERIAL_TRANSLATION_PROMPT_CONTRACT_DIGEST,
  },
};

/** The category a kind's words go out under in a live scope. */
function categoryIn(kind: FastRoleKindDefinition, scope: 'developer-live' | 'ordinary-production'): OutboundDataCategory {
  return scope === 'ordinary-production' ? kind.productionCategory ?? kind.category : kind.category;
}

/**
 * What a live launch gives the fast-role kinds: its runtime, the broker, and each kind's admitted route, if any. Under
 * ordinary-production (Issue #811) the routes and the Credential Reference are the editor's configured binding, read at each
 * request, so a route switch reaches the next request.
 */
export interface FastRoleLiveRoutes {
  readonly runtime: LiveRuntime;
  readonly broker: CredentialBroker;
  readonly routes: Readonly<Record<Exclude<FastRoleKindId, typeof CONNECTION_TEST_KIND>, AdmittedFastRoleRoute | null> & Partial<Record<typeof CONNECTION_TEST_KIND, AdmittedFastRoleRoute | null>>>;
  /** The Credential Reference of the development slot, as the provider configuration names it. */
  readonly credentialReference: string;
  readonly current?: (reference: string, route: AdmittedFastRoleRoute) => boolean;
  readonly credentialGeneration?: () => string | null;
}

/** The fast-role routes of a developer-live launch: each kind's route as the verified projection's policy admits it, or none. */
export function fastRoleLiveRoutes(runtime: DeveloperLiveRuntime, policy: LaunchPolicyProjection, secretResolver: SecretResolver): FastRoleLiveRoutes {
  const route = (kind: FastRoleKindDefinition): AdmittedFastRoleRoute | null => admittedFastRoleRoute(policy, kind.kindId, categoryIn(kind, 'developer-live'));
  return {
    runtime,
    broker: new CredentialBroker(secretResolver),
    routes: {
      [CONNECTION_TEST_KIND]: null,
      [EDITORIAL_POLISH_KIND]: route(FAST_ROLE_KINDS[EDITORIAL_POLISH_KIND]),
      [CONFLICT_REGENERATE_KIND]: route(FAST_ROLE_KINDS[CONFLICT_REGENERATE_KIND]),
      [MATERIAL_TRANSLATION_KIND]: route(FAST_ROLE_KINDS[MATERIAL_TRANSLATION_KIND]),
    },
    credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
  };
}

/**
 * The fast-role routes of an ordinary-production launch (Issue #811): each kind's route as the current policy admits it on the
 * editor's configured binding, and that connection's own Credential Reference; a broker that never reads a development one.
 */
export function productionFastRoleRoutes(
  runtime: OrdinaryProductionRuntime,
  policy: () => LaunchPolicyProjection,
  credentialReference: () => string | null,
  secretResolver: SecretResolver,
  current?: (reference: string, route: AdmittedFastRoleRoute) => boolean,
  credentialGeneration?: () => string | null,
): FastRoleLiveRoutes {
  const route = (kind: FastRoleKindDefinition): AdmittedFastRoleRoute | null => {
    const admitted = admittedFastRoleRoute(policy(), kind.kindId, categoryIn(kind, 'ordinary-production'));
    return admitted !== null && credentialReference() !== null ? admitted : null;
  };
  return {
    runtime,
    broker: new CredentialBroker(secretResolver, { developmentReferences: 'refused' }),
    ...(current === undefined ? {} : { current }),
    ...(credentialGeneration === undefined ? {} : { credentialGeneration }),
    get routes() {
      return {
        [CONNECTION_TEST_KIND]: route(FAST_ROLE_KINDS[CONNECTION_TEST_KIND]),
        [EDITORIAL_POLISH_KIND]: route(FAST_ROLE_KINDS[EDITORIAL_POLISH_KIND]),
        [CONFLICT_REGENERATE_KIND]: route(FAST_ROLE_KINDS[CONFLICT_REGENERATE_KIND]),
        [MATERIAL_TRANSLATION_KIND]: route(FAST_ROLE_KINDS[MATERIAL_TRANSLATION_KIND]),
      };
    },
    get credentialReference() {
      return credentialReference() ?? '';
    },
  };
}

export interface FastRoleExecutionDeps {
  /** The J-04 adapter's fixture when the launch binds one; `null` binds no local route. */
  readonly fixture: ResolvedModelFixture | null;
  /** The live launch's routes — developer-live's, or ordinary production's (Issue #811); `null` under development-ci. */
  readonly live: FastRoleLiveRoutes | null;
}

/**
 * Why a kind cannot be asked under this launch, in the editor's words (service-owned, Issue #842); `null` when it can. Under
 * developer-live the Book's source digest, when read (`undefined` when not), must be an admitted Public SampleBook's.
 */
export function fastRoleRouteRefusal(deps: FastRoleExecutionDeps, kindId: FastRoleKindId, sourceDigest?: string | null): string | null {
  const kind = FAST_ROLE_KINDS[kindId];
  if (deps.live !== null) {
    const production = isOrdinaryProductionRuntime(deps.live.runtime);
    if (deps.live.routes[kindId] == null) {
      if (production && deps.live.routes[MATERIAL_TRANSLATION_KIND]?.profile.route === 'openai-platform') return '所选快速交互模型仅支持来源译文的缓冲文本；此操作需要尚未准入的能力。未发送任何内容。';
      return production ? MODEL_SERVICE_SETUP_REQUIRED_REASON : `当前运行范围未允许${kind.label}：选定的模型处理规则没有准许它使用实时模型。`;
    }
    // Ordinary production sends the editor's own manuscript (Issue #811); only developer-live is held to the Public SampleBooks.
    if (!production && sourceDigest !== undefined && (sourceDigest === null || !DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS.has(sourceDigest))) {
      return `当前运行范围未允许${kind.label}：这本书不在开发者实时可发送的公开样书范围内。`;
    }
    return null;
  }
  // The launch's deterministic fixture answers no 来源译文 (Issue #892): development-ci admits none.
  if (deps.fixture === null || kindId === MATERIAL_TRANSLATION_KIND) return `当前运行范围未允许${kind.label}：这次启动没有可用的模型。`;
  return null;
}

/** The route an answered request ran on, as the Suggestion it becomes records it. */
export interface FastRoleBindingFacts {
  readonly kindId: FastRoleKindId;
  readonly promptContractDigest: string;
  readonly route: string;
  readonly model: string;
  readonly operationalScope: 'development-ci' | 'developer-live' | 'ordinary-production';
  /** The selected policy's rule that admitted it, under a live scope; `null` on the local route. */
  readonly policyRuleId: string | null;
  /** The fixture that answered it, on the local route; `null` under developer-live. */
  readonly fixtureSha256: string | null;
  readonly provenance?: FastRoleProvenance | undefined;
}

export type FastRoleProvenance = ModelTextAttemptProvenance;

export type FastRoleAnswer =
  | { readonly kind: 'answered'; readonly text: string; readonly binding: FastRoleBindingFacts }
  /**
   * Nothing usable came back. `outcomeUnknown`: the request may have been sent and billed and its answer never arrived whole
   * (结果待确认); it is never sent again on its own.
   */
  | { readonly kind: 'failed'; readonly code: string; readonly message: string; readonly outcomeUnknown: boolean; readonly provenance?: FastRoleProvenance | undefined };

const OUTCOME_UNKNOWN_CODES: ReadonlySet<string> = new Set([AI7_FAILURE_CODES.OUTCOME_UNKNOWN, 'PROVIDER_VALIDATION_OUTCOME_UNKNOWN']);

export class FastRoleExecutionOwner {
  readonly #deps: FastRoleExecutionDeps;
  #active: PrimaryAgentHarnessHandle | null = null;
  #inFlight = false;
  #disposed = false;

  constructor(deps: FastRoleExecutionDeps) {
    this.#deps = deps;
  }

  /** Whether a request is in flight; a database replacement waits for it as for a dialogue answer. */
  get busy(): boolean {
    return this.#inFlight;
  }

  /** Why a kind cannot be asked now, for the surfaces to show before anything is selected; `null` when it can. */
  refusal(kindId: FastRoleKindId, sourceDigest?: string | null): string | null {
    return fastRoleRouteRefusal(this.#deps, kindId, sourceDigest);
  }

  /** Refuse before anything is recorded or sent when the kind has no route here, or another request is in flight. */
  requireReady(kindId: FastRoleKindId, sourceDigest?: string | null): void {
    const refusal = this.refusal(kindId, sourceDigest);
    if (refusal !== null) throw new FastRoleError('FAST_ROLE_ROUTE_UNAVAILABLE', refusal);
    if (this.#disposed) throw new FastRoleError('FAST_ROLE_ROUTE_UNAVAILABLE', 'AI7 正在关闭；没有发送任何内容。');
    if (this.#inFlight) throw new FastRoleError('FAST_ROLE_BUSY', '另一项润色或重新生成正在进行；请等它完成。');
  }

  /** AI7 is closing: the request in flight is interrupted. */
  dispose(): void {
    this.#disposed = true;
    this.#active?.interrupt();
  }

  /**
   * Send the one message of a kind and read its answer. `step` names the request inside the development validation; the
   * caller has checked the route with `requireReady` and built `message` from verified words only.
   */
  async ask(kindId: FastRoleKindId, message: string, step: string): Promise<FastRoleAnswer> {
    this.requireReady(kindId);
    if (kindId === CONNECTION_TEST_KIND && message !== CONNECTION_TEST_POLICY.message) throw new FastRoleError('MODEL_CONNECTION_TEST_INVALID', '连接测试只接受固定的公开合成消息。');
    this.#inFlight = true;
    try {
      return await this.#run(FAST_ROLE_KINDS[kindId], message, step);
    } finally {
      this.#inFlight = false;
      this.#active = null;
    }
  }

  async #run(kind: FastRoleKindDefinition, message: string, step: string): Promise<FastRoleAnswer> {
    const live = this.#deps.live;
    const route = live === null ? null : live.routes[kind.kindId] ?? null;
    // Read once: under ordinary-production the configured reference may change while this request is in flight (Issue #811).
    const credentialReference = live === null ? '' : live.credentialReference;
    const credentialGeneration = live?.credentialGeneration?.();
    const isCurrent = (): boolean => route === null || live === null ||
      ((live.current?.(credentialReference, route) ?? true) &&
       (live.credentialGeneration === undefined || (credentialGeneration !== null && live.credentialGeneration() === credentialGeneration)));
    const executionRoute: ExecutionRoute = route === null ? LOCAL_DETERMINISTIC_ROUTE : route.profile.route as ExecutionRoute;
    const model = route === null ? LOCAL_DETERMINISTIC_MODEL : route.modelProfile.model;
    const { promptContractDigest, systemPrompt } = kind;
    const sessionId = randomUUID();
    const composition = describeComposition(executionRoute, model, promptContractDigest);
    const bindingDigest = sha256Hex(`${kind.kindId}\u0000${sessionId}\u0000${composition.digest}`);
    const slotBinding: CredentialSlotBinding | null = live === null || route === null ? null : {
      bindingDigest, modelRole: route.modelRole, slot: route.profile.credentialSlot, credentialReference, isCurrent,
    };
    const bindingFacts: EgressBindingFacts = {
      bindingDigest,
      route: executionRoute,
      model,
      systemPrompt,
      // The editor's own manuscript words, under the kind's own category: the local route, or a remote one whose rule names it.
      outboundDataCategory: route === null ? kind.category : categoryIn(kind, route.operationalScope),
      policy: route === null
        ? { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 }
        : route.operationalScope === 'ordinary-production'
          ? { operationalScope: 'ordinary-production', providerProcessingVersion: route.providerProcessingVersion as OrdinaryProductionProviderProcessingVersion, liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' }
          : { operationalScope: 'developer-live', providerProcessingVersion: route.providerProcessingVersion as DeveloperLiveProviderProcessingVersion, liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
      // The one message this request may send.
      admittedUserMessages: new Set([message]),
      // 生成来源译文's production category is not one the route reader carries (Issue #892); its route was admitted only because
      // the rule names exactly that category, so it is the rule's own, carried for this kind alone.
      ...(route === null ? {} : {
        ruleOutboundCategories: kind.kindId === MATERIAL_TRANSLATION_KIND
          ? new Set([...route.outboundDataCategories, categoryIn(kind, route.operationalScope)])
          : route.outboundDataCategories,
      }),
    };
    // Ordinary production has no development validation, so no request ever reaches the developer cache or ledger (Issue #811).
    const validation = live === null || isOrdinaryProductionRuntime(live.runtime) ? null : live.runtime.launch.validation;
    let adapter: DeepSeekOpenAiCompatibleAdapter | null = null;
    const provenance = (failureCode: string | null): FastRoleProvenance | undefined => route === null ? undefined : ({
      role: 'Fast Interaction Role', route: executionRoute, model, credentialSlot: route.profile.credentialSlot, endpoint: route.profile.endpoint, credentialReference,
      policyVersion: route.providerProcessingVersion, bindingDigest,
      ...(credentialGeneration == null ? {} : { credentialUpdatedAt: credentialGeneration }),
      usage: adapter?.lastUsage ?? null, failureCode,
    });
    let current: string | null = null;
    let outcome: HarnessTurnOutcome | null = null;
    let failure: { code: string; message: string } | null = null;
    // The Provider Test Ledger's own refusal, when it held the request back: the adapter reports any transport refusal alike.
    let ledgerRefusal: { code: string; message: string } | null = null;
    try {
      if (!isCurrent()) throw new FastRoleError('FAST_ROLE_BINDING_STALE', '快速交互选择已变化；请重新确认，未发送任何内容。');
      let cache: ProviderResultCache | null = null;
      if (live !== null && validation !== null && !isOrdinaryProductionRuntime(live.runtime)) {
        cache = new ProviderResultCache(live.runtime.launch.providerCacheRoot);
        await cache.open();
      }
      let pendingTicket: TransmitTicket | null = null;
      const harness: PrimaryAgentHarnessHandle = await prepareExecution({
        sessionId,
        route: executionRoute,
        model,
        systemPrompt,
        promptContractDigest,
        adapterFactory: (codes) => {
          if (live === null || route === null || slotBinding === null) return new Ai7LocalDeterministicAdapter(this.#deps.fixture!, promptContractDigest, codes);
          const nativeFetch = live.runtime.nativeFetch;
          // Nothing has left at either boundary, so the adapter reads it as a transport failure, never an unknown result (#1080).
          const requireRunning = (signal?: AbortSignal): void => {
            if (this.#disposed || signal?.aborted === true) {
              throw Object.assign(new DOMException('Fast-role request interrupted.', 'AbortError'), { requestSent: false });
            }
          };
          const send: DeepSeekTransport = async (url, init) => {
            requireRunning(init.signal);
            try { return await nativeFetch(url, init); }
            catch { throw new Error('AI7_OUTCOME_UNKNOWN'); }
          };
          adapter = new DeepSeekOpenAiCompatibleAdapter({
            broker: live.broker,
            slotBinding,
            tickets: { take: () => { const ticket = pendingTicket; pendingTicket = null; return ticket; } },
            attribution: () => ({}),
            promptContractDigest,
            codes,
            profile: kind.kindId === CONNECTION_TEST_KIND ? { ...route.profile, maxOutputTokens: CONNECTION_TEST_POLICY.maxOutputTokens } : route.profile,
            modelProfile: route.modelProfile,
            sessionId: () => harness.currentSessionId(),
            transport: async (url, init) => {
              requireRunning(init.signal);
              // One request is its own task: its stage contract and its task contract are the kind's one contract.
              if (cache === null || validation === null) return send(url, init);
              try {
                return await transmitOnce(cache, send, { purpose: kind.kindId, slice: kind.slice, promptContractDigest, taskPromptContractDigest: promptContractDigest }, {
                  intent: validation,
                  step: `${kind.kindId}/${step}`,
                  requestShape: route.modelProfile.capabilities.requestShape,
                }, route.profile, model, url, init);
              } catch (error) {
                if (error instanceof ProviderResultCacheError) ledgerRefusal = { code: error.code, message: error.message };
                throw error;
              }
            },
          });
          return adapter;
        },
        gate: (payload) => evaluateEgress(payload, bindingFacts, {
          currentBindingDigest: () => isCurrent() ? current : null,
          acceptedOutputDigests: new Set(),
          // No Run, so no per-Run ceiling applies; the single bounded payload is the bound, as the dialogue's is. 生成来源译文's
          // words are no manuscript excerpt, so that waiver is not theirs (Issue #892, brief revision 5): under developer-live each
          // request is within its batch bound (20 paragraphs, 6,000 characters; a job at most 50 requests, each on the live-once
          // ledger), and ordinary production leaves the ceiling to the editor as for a Run without one.
          ...(route === null ? {} : {
            ceilingState: () => kind.kindId === CONNECTION_TEST_KIND ? 'unset' as const : kind.kindId !== MATERIAL_TRANSLATION_KIND ? 'not-applicable' as const
              : route.operationalScope === 'developer-live' ? 'within' as const : 'unset' as const,
          }),
        }),
        onTransmitTicket: (ticket) => {
          if (route === null) throw new FastRoleError('FAST_ROLE_REMOTE_FORBIDDEN', 'development-ci 下不得签发远程传输。');
          pendingTicket = ticket;
        },
      });
      this.#active = harness;
      try {
        // The credential is checked for presence only; its value is released to the final adapter alone, inside the send.
        if (live !== null && slotBinding !== null && await live.broker.checkReadiness(slotBinding) !== 'present') {
          throw new FastRoleError('FAST_ROLE_CREDENTIAL_ABSENT', isOrdinaryProductionRuntime(live.runtime)
            ? '受保护凭据库中没有你为所用模型服务保存的凭据；请在 设置 › 模型服务 重新输入。未发送任何内容。'
            : '受保护凭据库中没有所用模型服务的开发凭据；未发送任何内容。');
        }
        harness.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: harness.composition.digest, promptContractDigest });
        current = bindingDigest;
        if (this.#disposed) harness.interrupt();
        outcome = await harness.submitUnit(message);
      } finally {
        current = null;
        await harness.finish();
      }
    } catch (error) {
      const code = error instanceof Error && 'code' in error && typeof (error as { code: unknown }).code === 'string'
        ? (error as { code: string }).code
        : 'FAST_ROLE_EXECUTION_FAILED';
      failure = { code, message: error instanceof FastRoleError ? error.message : `${kind.label}没有完成；没有生成任何建议。` };
    }
    if (outcome === null) {
      const code = failure?.code ?? 'FAST_ROLE_EXECUTION_FAILED';
      return { kind: 'failed', code, message: failure?.message ?? `${kind.label}没有完成；没有生成任何建议。`, outcomeUnknown: OUTCOME_UNKNOWN_CODES.has(code), provenance: provenance(code) };
    }
    if (outcome.terminal === 'completed') {
      const candidate = outcome.signals.filter((signal) => signal.kind === 'contentCandidate').at(-1);
      if (candidate !== undefined && candidate.kind === 'contentCandidate') {
        return {
          kind: 'answered',
          text: candidate.text,
          binding: {
            kindId: kind.kindId,
            promptContractDigest,
            route: executionRoute,
            model,
            operationalScope: route === null ? 'development-ci' : route.operationalScope,
            policyRuleId: route?.ruleId ?? null,
            fixtureSha256: route === null ? this.#deps.fixture!.sha256 : null,
            ...(route === null ? {} : { provenance: provenance(null) }),
          },
        };
      }
      return { kind: 'failed', code: 'FAST_ROLE_ANSWER_EMPTY', message: `模型没有给出回答；${kind.label}没有生成任何建议。`, outcomeUnknown: false, provenance: provenance('FAST_ROLE_ANSWER_EMPTY') };
    }
    const last = outcome.signals.at(-1);
    if (outcome.terminal === 'ambiguous') {
      const code = last?.kind === 'ambiguous' ? last.failure?.code ?? AI7_FAILURE_CODES.OUTCOME_UNKNOWN : AI7_FAILURE_CODES.OUTCOME_UNKNOWN;
      return { kind: 'failed', code, message: `结果待确认：请求可能已经发出，但没有收到完整回答；${kind.label}没有生成任何建议，也不会自动重发。`, outcomeUnknown: true, provenance: provenance(code) };
    }
    const code = last !== undefined && (last.kind === 'failed' || last.kind === 'interrupted') ? last.failure.code : 'FAST_ROLE_EXECUTION_FAILED';
    if (ledgerRefusal !== null) {
      // Nothing was sent this time; an earlier send of the same request whose answer never came back stays unknown.
      const refused: { code: string; message: string } = ledgerRefusal;
      return { kind: 'failed', code: refused.code, message: `${kind.label}这次没有发送：${refused.message}`, outcomeUnknown: OUTCOME_UNKNOWN_CODES.has(refused.code) };
    }
    if (OUTCOME_UNKNOWN_CODES.has(code)) {
      return { kind: 'failed', code, message: `结果待确认：请求可能已经发出，但没有收到完整回答；${kind.label}没有生成任何建议，也不会自动重发。`, outcomeUnknown: true, provenance: provenance(code) };
    }
    return { kind: 'failed', code, message: `${kind.label}没有完成（${code}）；没有生成任何建议。`, outcomeUnknown: false, provenance: provenance(code) };
  }
}

/** Explicit Settings action only. No caller-supplied words or Book material can enter this path. */
export async function testModelServiceConnection(
  store: EditorialStore, codeRoot: string, runtime: OrdinaryProductionRuntime | null,
  input: FastModelSelectionInput, secretResolver: SecretResolver, signal?: AbortSignal,
): Promise<ModelConnectionTestStatus> {
  const cancelled = (): boolean => signal?.aborted === true;
  if (runtime === null) throw new FastRoleError('MODEL_CONNECTION_TEST_UNAVAILABLE', '当前运行范围不允许实时连接测试；没有发送任何内容。');
  const connection = store.getModelServiceRouteConnection(input.route);
  const allowed = ORDINARY_PRODUCTION_FAST_ALLOWED_BINDINGS.find((binding) => binding.route === input.route && binding.model === input.modelId);
  if (allowed === undefined || connection === null || connection.credentialOperationState !== 'ready') {
    throw new FastRoleError('MODEL_CONNECTION_TEST_UNAVAILABLE', '请先保护凭据并选择已准入的文本模型；没有发送任何内容。');
  }
  if (cancelled()) {
    const cancelledStatus: ModelConnectionTestStatus = { modelId: input.modelId, credentialUpdatedAt: connection.credentialUpdatedAt,
      testedAt: new Date().toISOString(), outcome: 'cancelled', code: AI7_FAILURE_CODES.INTERRUPTED, verified: 'buffered-text-only' };
    store.recordModelConnectionTest(connection, cancelledStatus);
    return cancelledStatus;
  }
  const configured = { ...allowed, credentialReference: connection.credentialReference };
  const policy = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', null, configured);
  const unchanged = (): boolean => {
    const now = store.getModelServiceRouteConnection(input.route);
    return now?.credentialOperationState === 'ready' && now.credentialReference === connection.credentialReference && now.credentialUpdatedAt === connection.credentialUpdatedAt;
  };
  const owner = new FastRoleExecutionOwner({ fixture: null, live: productionFastRoleRoutes(runtime, () => policy,
    () => unchanged() ? connection.credentialReference : null, secretResolver, () => unchanged(),
    () => store.getModelServiceRouteConnection(input.route)?.credentialUpdatedAt ?? null) });
  const stop = (): void => owner.dispose();
  signal?.addEventListener('abort', stop, { once: true });
  if (cancelled()) stop();
  let answer: FastRoleAnswer;
  try { answer = await owner.ask(CONNECTION_TEST_KIND, CONNECTION_TEST_POLICY.message, 'explicit-connection-test'); }
  catch { answer = { kind: 'failed', code: cancelled() ? AI7_FAILURE_CODES.INTERRUPTED : 'MODEL_CONNECTION_TEST_UNAVAILABLE', message: '文本连接测试没有发送。', outcomeUnknown: false }; }
  finally { signal?.removeEventListener('abort', stop); owner.dispose(); }
  const passed = answer.kind === 'answered' && answer.text.trim() === 'AI7_OK';
  const code = passed ? null : answer.kind === 'failed' ? answer.code : 'MODEL_CONNECTION_TEST_RESPONSE_INVALID';
  const facts = answer.kind === 'answered' ? answer.binding.provenance : answer.provenance;
  const status: ModelConnectionTestStatus = {
    modelId: input.modelId, credentialUpdatedAt: connection.credentialUpdatedAt, testedAt: new Date().toISOString(),
    outcome: passed ? 'passed' : answer.kind === 'failed' && answer.outcomeUnknown ? 'outcome-unknown'
      : cancelled() ? 'cancelled' : 'failed',
    code,
    verified: 'buffered-text-only',
    ...(facts === undefined ? {} : { provenance: { ...facts, failureCode: code } }),
  };
  store.recordModelConnectionTest(connection, status);
  return status;
}
