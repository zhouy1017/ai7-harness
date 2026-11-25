import { supportsEditorialMemoryPolicy } from '../../shared/protocol.js';
import { bindEditorialMemory, editorialMemoryDigest } from '../learning/memory-facade.js';
import type { EditorialMemorySnapshot } from '../learning/editorial-memory.js';
import { randomUUID } from 'node:crypto';
import { sha256Hex } from '../analysis/canonical.js';
import { DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS, type ModelRequestGovernor, type ModelRequestProducer } from '../analysis/execution.js';
import { admittedFastRoleRoute, type AdmittedFastRoleRoute } from '../dialogue/dialogue-route.js';
import { describeComposition, prepareExecution, type HarnessTurnOutcome, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import { CONNECTION_TEST_KIND, CONNECTION_TEST_POLICY, developerLiveBindingFor, modelServiceChannels, resolveSourceCheckoutLaunchPolicy, isOrdinaryProductionRuntime, type DeveloperLiveRuntime, type LiveRuntime, type OrdinaryProductionRuntime } from '../launch-policy.js';
import type { EditorialStore } from '../store.js';
import type { ModelTextAttemptProvenance, FastModelSelectionInput, ModelConnectionTestStatus, LaunchPolicyProjection } from '../../shared/protocol.js';
import { MODEL_SERVICE_SETUP_REQUIRED_REASON, modelServiceRouteRefusal, modelServiceRuntimeBinding, type DeveloperLiveProviderProcessingVersion, type OrdinaryProductionProviderProcessingVersion } from '../../shared/protocol.js';
import { AI7_FAILURE_CODES } from '../provider/classification.js';
import { CredentialBroker, type CredentialSlotBinding, type SecretResolver } from '../provider/credential-broker.js';
import { DeepSeekOpenAiCompatibleAdapter, modelRequestNotSent, type DeepSeekTransport } from '../provider/deepseek-adapter.js';
import { Ai7LocalDeterministicAdapter } from '../provider/local-deterministic-adapter.js';
import { effectiveModelReasoningEffort, modelProfileFor } from '../provider/model-profile.js';
import { modelEffortRefusal } from '../provider/model-efforts.js';
import { sentReasoningEffort } from '../../shared/runtime-execution-config.js';
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
import { localFixtureRegisteredProfile, type LocalFixtureExecutionContext, type LocalFixtureRuntimeContext, type ResolvedModelFixture } from '../provider/model-fixture.js';
import { ProviderResultCache, ProviderResultCacheError, type ProviderTestItemSlice } from '../provider/provider-result-cache.js';
import { GUIDELINE_FORMAT_TIMEOUT_MS } from '../../shared/protocol/transport-settings.js';
import { connectionTestTransport } from '../provider/request-deadlines.js';
import {
  CONFLICT_REGENERATE_KIND,
  CONFLICT_REGENERATE_PROMPT_CONTRACT,
  CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST,
} from './conflict-regenerate-contract.js';
import { FastRoleError } from './fast-role-error.js';
import { MATERIAL_TRANSLATION_KIND } from './material-translation-contract.js';
import { EDITORIAL_POLISH_KIND, EDITORIAL_POLISH_PROMPT_CONTRACT, EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST } from './polish-contract.js';

import { FLASH_TASK_REGISTRY, connectionProbe, type ProbeModelEvidence } from './flash-task-registry.js';
import { runStructuredFlashTask, STRUCTURED_FLASH_TASKS, type FlashTaskContract, type FlashTaskResult } from './flash-task-contract.js';
import { isSyntheticRecordingInput, SYNTHETIC_FLASH_RECORDING_KINDS } from './recording-inputs.js';

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
export type FastRoleKindId = keyof typeof FLASH_TASK_REGISTRY | typeof EDITORIAL_POLISH_KIND | typeof CONFLICT_REGENERATE_KIND;

/**
 * Another frozen contract on a kind's own route (Issue #1412): 就选中部分让 AI 修改 sends the editor's selected words under the
 * route and outbound category 润色这段 is admitted for, with its own system prompt and contract digest.
 */
export interface FastRoleContractVariant {
  readonly label: string;
  readonly systemPrompt: string;
  readonly promptContractDigest: string;
}

export interface FastRoleKindDefinition {
  readonly kindId: FastRoleKindId;
  /** The action as the editor names it, which every reason says. */
  readonly label: string;
  readonly budget?: FlashTaskContract<unknown, unknown>['budget'];
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
  ...Object.fromEntries<FastRoleKindDefinition>((Object.keys(FLASH_TASK_REGISTRY) as (keyof typeof FLASH_TASK_REGISTRY)[]).map(kindId =>
    [kindId, { ...FLASH_TASK_REGISTRY[kindId], kindId, category: FLASH_TASK_REGISTRY[kindId].outboundCategory }])) as Record<keyof typeof FLASH_TASK_REGISTRY, FastRoleKindDefinition>,
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
  readonly transportSettings?: LaunchPolicyProjection['providerProcessing']['transport'];
  readonly runtime: LiveRuntime;
  readonly broker: CredentialBroker;
  readonly routes: Readonly<Partial<Record<FastRoleKindId, AdmittedFastRoleRoute | null>>>;
  /** The Credential Reference of the development slot, as the provider configuration names it. */
  readonly credentialReference: string;
  readonly current?: (reference: string, route: AdmittedFastRoleRoute) => boolean;
  readonly credentialGeneration?: () => string | null;
}

/** The fast-role routes of a developer-live launch: each kind's route as the verified projection's policy admits it, or none. */
export function fastRoleLiveRoutes(runtime: DeveloperLiveRuntime, policy: LaunchPolicyProjection, secretResolver: SecretResolver): FastRoleLiveRoutes {
  const route = (kind: FastRoleKindDefinition): AdmittedFastRoleRoute | null => {
    const admitted = admittedFastRoleRoute(policy, kind.kindId, categoryIn(kind, 'developer-live'));
    const { reasoningEffort } = developerLiveBindingFor(runtime.launch, kind.kindId);
    return admitted === null || reasoningEffort === undefined ? admitted : { ...admitted, reasoningEffort };
  };
  return {
    runtime,
    transportSettings: policy.providerProcessing.transport,
    broker: new CredentialBroker(secretResolver),
    routes: Object.fromEntries(Object.values(FAST_ROLE_KINDS).map(kind =>
      [kind.kindId, kind.kindId === CONNECTION_TEST_KIND && runtime.launch.recordingProvider === undefined ? null : route(kind)])),
    credentialReference: developerLiveBindingFor(runtime.launch, CONNECTION_TEST_KIND).credentialReference,
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
  reasoningEffort: () => string | undefined = () => undefined,
): FastRoleLiveRoutes {
  const route = (kind: FastRoleKindDefinition): AdmittedFastRoleRoute | null => {
    const admitted = admittedFastRoleRoute(policy(), kind.kindId, categoryIn(kind, 'ordinary-production'));
    return admitted !== null && credentialReference() !== null ? { ...admitted,
      ...(reasoningEffort() === undefined ? {} : { reasoningEffort: reasoningEffort()! }) } : null;
  };
  return {
    runtime,
    get transportSettings() { return policy().providerProcessing.transport; },
    broker: new CredentialBroker(secretResolver, { developmentReferences: 'refused' }),
    ...(current === undefined ? {} : { current }),
    ...(credentialGeneration === undefined ? {} : { credentialGeneration }),
    get routes() {
      return Object.fromEntries(Object.values(FAST_ROLE_KINDS).map(kind => [kind.kindId, route(kind)]));
    },
    get credentialReference() {
      return credentialReference() ?? '';
    },
  };
}

export interface FastRoleExecutionDeps {
  readonly localFixtureRuntime?: () => LocalFixtureRuntimeContext | null;
  readonly requestGovernor: ModelRequestGovernor;
  /** The service probe keeps this registration through its final publication/write cleanup. */
  readonly producer?: ModelRequestProducer;
  /** The J-04 adapter's fixture when the launch binds one; `null` binds no local route. */
  readonly fixture: ResolvedModelFixture | null;
  /** The live launch's routes — developer-live's, or ordinary production's (Issue #811); `null` under development-ci. */
  readonly live: FastRoleLiveRoutes | null;
}

/**
 * Why a kind cannot be asked under this launch, in the editor's words (service-owned, Issue #842); `null` when it can. Under
 * developer-live the Book's source digest, when read (`undefined` when not), must be an admitted Public SampleBook's.
 */
export function fastRoleRouteRefusal(deps: Pick<FastRoleExecutionDeps, 'fixture' | 'live'>, kindId: FastRoleKindId, sourceDigest?: string | null): string | null {
  const kind = FAST_ROLE_KINDS[kindId];
  if (deps.live !== null) {
    const production = isOrdinaryProductionRuntime(deps.live.runtime);
    if (deps.live.routes[kindId] == null) {
      return production ? MODEL_SERVICE_SETUP_REQUIRED_REASON : `当前运行范围未允许${kind.label}：选定的模型处理规则没有准许它使用实时模型。`;
    }
    // Ordinary production sends the editor's own manuscript (Issue #811); only developer-live is held to the Public SampleBooks.
    if (!production && sourceDigest !== undefined && (sourceDigest === null || !DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS.has(sourceDigest))) {
      return `当前运行范围未允许${kind.label}：这本书不在开发者实时可发送的公开样书范围内。`;
    }
    return null;
  }
  // The launch's deterministic fixture answers no 来源译文 (Issue #892): development-ci admits none.
  if (deps.fixture === null || Object.hasOwn(FLASH_TASK_REGISTRY, kindId)) return `当前运行范围未允许${kind.label}：这次启动没有可用的模型。`;
  return null;
}

/** The route an answered request ran on, as the Suggestion it becomes records it. */
export interface FastRoleBindingFacts {
  readonly kindId: FastRoleKindId;
  readonly promptContractDigest: string;
  readonly route: string;
  readonly model: string;
  readonly reasoningEffort?: string | null;
  readonly operationalScope: 'development-ci' | 'developer-live' | 'ordinary-production';
  /** The selected policy's rule that admitted it, under a live scope; `null` on the local route. */
  readonly policyRuleId: string | null;
  /** The fixture that answered it, on the local route; `null` under developer-live. */
  readonly fixtureSha256: string | null;
  readonly provenance?: FastRoleProvenance | undefined;
}

export type FastRoleProvenance = ModelTextAttemptProvenance;

export type FastRoleAnswer =
  | { readonly kind: 'answered'; readonly text: string; readonly binding: FastRoleBindingFacts; readonly probeModel?: ProbeModelEvidence }
  /**
   * Nothing usable came back. `outcomeUnknown`: the request may have been sent and billed and its answer never arrived whole
   * (结果待确认); it is never sent again on its own.
   */
  | { readonly kind: 'failed'; readonly code: string; readonly message: string; readonly outcomeUnknown: boolean; readonly provenance?: FastRoleProvenance | undefined };

const OUTCOME_UNKNOWN_CODES: ReadonlySet<string> = new Set([AI7_FAILURE_CODES.OUTCOME_UNKNOWN, 'PROVIDER_VALIDATION_OUTCOME_UNKNOWN']);

export type ExecutedFlashTaskResult<Output> = FlashTaskResult<Output> & { readonly formattingParseFailure?: true };

export class UnderlyingFlashService {
  readonly #children = new Set<UnderlyingFlashService>();
  #release: (() => void) | null = null;
  fork(live: FastRoleLiveRoutes | null): UnderlyingFlashService {
    const child = new UnderlyingFlashService({ ...this.#deps, live });
    this.#children.add(child); child.#release = () => this.#children.delete(child); return child;
  }
  readonly #deps: FastRoleExecutionDeps;
  #active: PrimaryAgentHarnessHandle | null = null;
  #tail = Promise.resolve();
  #pending = 0;
  #disposed = false;
  #requestAbort: AbortController | null = null;

  constructor(deps: FastRoleExecutionDeps) {
    this.#deps = deps;
  }

  /** A database replacement waits for active and queued requests as it waits for a dialogue answer. */
  get busy(): boolean {
    return this.#pending > 0 || [...this.#children].some(child => child.busy);
  }

  /** Why a kind cannot be asked now, for the surfaces to show before anything is selected; `null` when it can. */
  refusal(kindId: FastRoleKindId, sourceDigest?: string | null): string | null {
    return fastRoleRouteRefusal(this.#deps, kindId, sourceDigest);
  }

  /** Background work can queue. An interactive request needs an available owner before it is recorded. */
  requireReady(kindId: FastRoleKindId, sourceDigest?: string | null): void {
    const refusal = this.refusal(kindId, sourceDigest);
    if (refusal !== null) throw new FastRoleError('FAST_ROLE_ROUTE_UNAVAILABLE', refusal);
    if (this.#disposed) throw new FastRoleError('FAST_ROLE_ROUTE_UNAVAILABLE', 'AI7 正在关闭；没有发送任何内容。');
    if (this.#pending > 0 && !Object.hasOwn(FLASH_TASK_REGISTRY, kindId)) {
      throw new FastRoleError('FAST_ROLE_BUSY', '这个模型还有其他工作未完成，请稍后重试。');
    }
  }

  /** AI7 is closing: the request in flight is interrupted. */
  dispose(): void {
    for (const child of this.#children) child.dispose();
    this.#release?.();
    this.#disposed = true;
    this.#requestAbort?.abort();
    if (this.#deps.live === null) this.#active?.interrupt();
  }

  /**
   * Send the one message of a kind and read its answer. `step` names the request inside the development validation; the
   * caller has checked the route with `requireReady` and built `message` from verified words only.
   */
  async execute<Input, Output>(contract: FlashTaskContract<Input, Output>, source: Input, step: string): Promise<ExecutedFlashTaskResult<Output>> {
    const kind = contract.kindId as keyof typeof STRUCTURED_FLASH_TASKS;
    if (kind === 'learning-sample-tidying') throw new FastRoleError('FLASH_LEARNING_SCOPE_REQUIRED', '学习样例需要已启用的学习范围。');
    let receivedCompleteAnswer = false;
    const result = await runStructuredFlashTask(contract, source, async message => {
      try {
        const answer = await this.#ask(kind, message, step);
        if (answer.kind === 'failed') return { reason: answer.message, outcomeUnknown: answer.outcomeUnknown };
        const failure = answer.binding.provenance?.failureCode;
        if (failure) return { reason: '模型没有返回完整结果。', outcomeUnknown: OUTCOME_UNKNOWN_CODES.has(failure) };
        receivedCompleteAnswer = true;
        return answer.text;
      } catch (error) {
        if (!(error instanceof FastRoleError)) throw error;
        return { reason: error.message };
      }
    });
    return receivedCompleteAnswer && result.state === 'fallback' ? { ...result, formattingParseFailure: true } : result;
  }

  ask(kindId: Exclude<FastRoleKindId, keyof typeof STRUCTURED_FLASH_TASKS>, message: string, step: string, readMemory?: () => EditorialMemorySnapshot | null, contract?: FastRoleContractVariant): Promise<FastRoleAnswer> {
    return this.#ask(kindId, message, step, readMemory, contract);
  }

  async #ask(kindId: FastRoleKindId, message: string, step: string, readMemory?: () => EditorialMemorySnapshot | null, contract?: FastRoleContractVariant): Promise<FastRoleAnswer> {
    this.requireReady(kindId);
    if (kindId === CONNECTION_TEST_KIND && message !== CONNECTION_TEST_POLICY.message) throw new FastRoleError('MODEL_CONNECTION_TEST_INVALID', '连接测试只接受固定的公开合成消息。');
    const live = this.#deps.live;
    // Pin the admitted binding when the request enters the queue. The send checks that it is still current.
    const route = live?.routes[kindId] ?? null;
    const credentialReference = live?.credentialReference ?? '';
    const credentialGeneration = live?.credentialGeneration?.();
    const previous = this.#tail;
    const { promise, resolve } = Promise.withResolvers<void>();
    this.#tail = promise;
    this.#pending++;
    let operationTimer: ReturnType<typeof setTimeout> | undefined;
    let producer: ModelRequestProducer | null = null;
    try {
      await previous;
      if (this.#disposed) throw new FastRoleError('FAST_ROLE_ROUTE_UNAVAILABLE', 'AI7 正在关闭；没有发送任何内容。');
      const cancellation = new AbortController();
      this.#requestAbort = cancellation;
      if (kindId === 'guideline-clause-formatting') {
        operationTimer = setTimeout(() => cancellation.abort(new DOMException('规范整理超过时限。', 'TimeoutError')), GUIDELINE_FORMAT_TIMEOUT_MS);
      }
      if (this.#deps.live !== null) producer = this.#deps.producer ?? this.#deps.requestGovernor.registerProducer({
        key: `fast-role:${randomUUID()}`, kind: kindId === CONNECTION_TEST_KIND ? 'connection-test' : 'fast-role', lane: 'foreground',
      });
      const kind = FAST_ROLE_KINDS[kindId];
      return await this.#run(contract === undefined ? kind : { ...kind, ...contract }, message, step, producer, cancellation.signal,
        { route, credentialReference, credentialGeneration }, readMemory);
    } finally {
      if (producer !== null && this.#deps.producer === undefined) this.#deps.requestGovernor.unregisterProducer(producer);
      clearTimeout(operationTimer);
      this.#requestAbort = null;
      this.#active = null;
      this.#pending--;
      resolve();
    }
  }

  async #run(kind: FastRoleKindDefinition, message: string, step: string, producer: ModelRequestProducer | null, signal: AbortSignal,
    { route, credentialReference, credentialGeneration }: { route: AdmittedFastRoleRoute | null; credentialReference: string; credentialGeneration: string | null | undefined },
    readMemory?: () => EditorialMemorySnapshot | null): Promise<FastRoleAnswer> {
    const live = this.#deps.live;
    const recording = live !== null && !isOrdinaryProductionRuntime(live.runtime) && live.runtime.launch.recordingProvider !== undefined;
    if (recording && (SYNTHETIC_FLASH_RECORDING_KINDS as readonly string[]).includes(kind.kindId) && !isSyntheticRecordingInput(kind.kindId, message)) {
      throw new FastRoleError('RECORDING_SOURCE_NOT_ADMITTED', '录制任务只接受固定公开测试材料。');
    }
    const memory = supportsEditorialMemoryPolicy(route?.providerProcessingVersion) && kind.kindId !== CONNECTION_TEST_KIND ? readMemory?.() ?? null : null;
    const isCurrent = (): boolean => route === null || live === null ||
      ((live.current?.(credentialReference, route) ?? true) &&
       (memory === null || editorialMemoryDigest(kind.promptContractDigest, readMemory?.()) === editorialMemoryDigest(kind.promptContractDigest, memory)) &&
       (live.credentialGeneration === undefined || (credentialGeneration !== null && live.credentialGeneration() === credentialGeneration)));
    const executionRoute: ExecutionRoute = route === null ? LOCAL_DETERMINISTIC_ROUTE : route.profile.route as ExecutionRoute;
    const model = route === null ? LOCAL_DETERMINISTIC_MODEL : route.modelProfile.model;
    const effortConfig = route?.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort };
    const { promptContractDigest, systemPrompt } = bindEditorialMemory({ systemPrompt: kind.systemPrompt, promptContractDigest: kind.promptContractDigest }, memory);
    const sessionId = randomUUID();
    const composition = describeComposition(executionRoute, model, promptContractDigest);
    const localRuntime = live === null ? this.#deps.localFixtureRuntime?.() : null;
    const localProfile = localRuntime == null ? undefined : localRuntime.catalog.profile(localRuntime.selectedPolicyIdentity,
      this.#deps.fixture!, localFixtureRegisteredProfile(kind.kindId, null));
    const localFixture = localRuntime == null || localProfile === undefined ? undefined : { catalog: localRuntime.catalog,
      execution: { selectedPolicyIdentity: localRuntime.selectedPolicyIdentity, profile: localProfile, kind: kind.kindId, purpose: null,
        contractId: kind.kindId === 'editorial-polish' ? 'ai7.editorial-polish/1' : kind.kindId === 'conflict-regenerate' ? 'ai7.conflict-regenerate/1' : null,
        composition, categories: [kind.category] } satisfies LocalFixtureExecutionContext };
    const bindingDigest = sha256Hex(`${kind.kindId}\u0000${sessionId}\u0000${composition.digest}${route?.reasoningEffort === undefined ? '' : `\u0000${route.reasoningEffort}`}`);
    const slotBinding: CredentialSlotBinding | null = live === null || route === null ? null : {
      bindingDigest, modelRole: route.modelRole, slot: route.profile.credentialSlot, credentialReference, isCurrent,
    };
    const bindingFacts: EgressBindingFacts = {
      ...effortConfig,
      bindingDigest,
      route: executionRoute,
      model,
      systemPrompt,
      // The editor's own manuscript words, under the kind's own category: the local route, or a remote one whose rule names it.
      outboundDataCategory: route === null ? kind.category : categoryIn(kind, route.operationalScope),
      policy: route === null
        ? { operationalScope: 'development-ci', providerProcessingVersion: localRuntime == null ? 'v1' : 'v29', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 }
        : route.operationalScope === 'ordinary-production'
          ? { operationalScope: 'ordinary-production', providerProcessingVersion: route.providerProcessingVersion as OrdinaryProductionProviderProcessingVersion, liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' }
          : { operationalScope: 'developer-live', providerProcessingVersion: route.providerProcessingVersion as DeveloperLiveProviderProcessingVersion, liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
      // The one message this request may send.
      admittedUserMessages: new Set([message]),
      ...((route?.providerProcessingVersion === 'v36' || recording) && Object.hasOwn(FLASH_TASK_REGISTRY, kind.kindId)
        ? { structuredTaskMessageDigest: sha256Hex(message) } : {}),
      ...(memory === null ? {} : { contractCategories: new Set<OutboundDataCategory>(['house-review-preference-excerpt']) }),
      ...(route === null ? {} : { ruleOutboundCategories: route.outboundDataCategories }),
    };
    // Ordinary production has no development validation, so no request ever reaches the developer cache or ledger (Issue #811).
    const validation = live === null || isOrdinaryProductionRuntime(live.runtime) ? null : live.runtime.launch.validation;
    let probeModel: ProbeModelEvidence | undefined;
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
        ...effortConfig,
        ...(producer === null ? {} : { acquireRequest: async (_payload: import('../provider/payload.js').AssembledModelPayload, turnSignal: AbortSignal) => {
          const combined = AbortSignal.any([signal, turnSignal]);
          const permit = await this.#deps.requestGovernor.acquire(producer, combined);
          try {
            combined.throwIfAborted();
            if (this.#disposed || !isCurrent()) throw new FastRoleError('FAST_ROLE_BINDING_STALE', '快速交互绑定已变化；未发送任何内容。');
            return { release: () => { pendingTicket = null; permit.release(); } };
          } catch (error) { permit.release(); throw error; }
        } }),
        sessionId,
        route: executionRoute,
        model,
        systemPrompt,
        promptContractDigest,
        adapterFactory: (codes) => {
          if (live === null || route === null || slotBinding === null) return new Ai7LocalDeterministicAdapter(this.#deps.fixture!, promptContractDigest, codes,
            localFixture === undefined ? {} : { localFixture });
          const nativeFetch = live.runtime.nativeFetch;
          // Before the adapter enters its sender (`beforeSend`) the refusal is an observed no-send. Inside the transport the
          // adapter cannot tell it apart from a sent request's rejection, so it stays unknown unless the wrapper proves no-send.
          const requireRunning = (signal?: AbortSignal): void => {
            if (this.#disposed || !isCurrent() || signal?.aborted === true) {
              throw Object.assign(new DOMException('Fast-role request interrupted.', 'AbortError'), { requestSent: false });
            }
          };
          const send: DeepSeekTransport = async (url, init) => {
            requireRunning(init.signal);
            return nativeFetch(url, init);
          };
          const bounded = route.providerProcessingVersion === 'v36' || recording ? kind.budget : undefined;
          const limit = bounded ? Math.min(bounded.maxOutputTokens, route.profile.maxOutputTokens ?? Infinity) : undefined;
          const profile = limit !== undefined ? { ...route.profile, maxOutputTokens: limit, taskOutputTokenLimit: limit }
            : kind.kindId === CONNECTION_TEST_KIND ? { ...route.profile, maxOutputTokens: CONNECTION_TEST_POLICY.maxOutputTokens } : route.profile;
          const deadlines = live.transportSettings;
          adapter = new DeepSeekOpenAiCompatibleAdapter({
            ...effortConfig,
            broker: live.broker,
            slotBinding,
            tickets: { take: () => { const ticket = pendingTicket; pendingTicket = null; return ticket; } },
            attribution: () => ({}),
            promptContractDigest,
            codes,
            profile,
            modelProfile: route.modelProfile,
            ...(kind.kindId === CONNECTION_TEST_KIND ? { onProbeModel: (model, family) => { probeModel = model === undefined ? undefined : { model, family }; } } : {}),
            signal,
            beforeSend: () => requireRunning(signal),
            ...(kind.kindId === CONNECTION_TEST_KIND ? { transportSettings: connectionTestTransport(live.transportSettings) }
              : deadlines === undefined ? {} : { transportSettings: bounded === undefined ? deadlines : { ...deadlines,
                firstByteSeconds: Math.min(deadlines.firstByteSeconds, bounded.firstByteSeconds), idleSeconds: Math.min(deadlines.idleSeconds, bounded.idleSeconds) } }),
            sessionId: () => harness.currentSessionId(),
            transport: async (url, init) => {
              requireRunning(init.signal);
              // One request is its own task: its stage contract and its task contract are the kind's one contract.
              if (cache === null || validation === null) return send(url, init);
              let nativeEntered = false;
              const observedSend: DeepSeekTransport = (target, request) => { requireRunning(request.signal); nativeEntered = true; return send(target, request); };
              try {
                return await transmitOnce(cache, observedSend, { purpose: kind.kindId, slice: kind.slice, promptContractDigest, taskPromptContractDigest: promptContractDigest }, {
                  intent: validation,
                  step: `${kind.kindId}/${step}`,
                  requestShape: route.modelProfile.capabilities.requestShape,
                }, route.profile, model, url, init);
              } catch (error) {
                if (error instanceof ProviderResultCacheError) ledgerRefusal = { code: error.code, message: error.message };
                if (!nativeEntered) throw modelRequestNotSent(init, error);
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
            ceilingState: () => !Object.hasOwn(FLASH_TASK_REGISTRY, kind.kindId) ? 'not-applicable' as const
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
    const received = (adapter as DeepSeekOpenAiCompatibleAdapter | null)?.lastCanonicalResult;
    const partialText = received?.kind === 'answer' && received.truncated === true ? received.text : null;
    if (outcome.terminal === 'completed' || partialText !== null) {
      const candidate = outcome.signals.filter((signal) => signal.kind === 'contentCandidate').at(-1);
      const text = partialText ?? (candidate?.kind === 'contentCandidate' ? candidate.text : null);
      const terminal = outcome.signals.at(-1);
      const failureCode = outcome.terminal === 'completed' ? null : terminal?.kind === 'failed' || terminal?.kind === 'ambiguous' ? terminal.failure?.code ?? AI7_FAILURE_CODES.OUTCOME_UNKNOWN : AI7_FAILURE_CODES.OUTCOME_UNKNOWN;
      if (text !== null) {
        return {
          kind: 'answered',
          text,
          ...(probeModel === undefined ? {} : { probeModel }),
          binding: {
            kindId: kind.kindId,
            promptContractDigest,
            route: executionRoute,
            model,
            ...(route === null ? {} : { reasoningEffort: effectiveModelReasoningEffort(route.modelProfile, route.reasoningEffort) }),
            operationalScope: route === null ? 'development-ci' : route.operationalScope,
            policyRuleId: route?.ruleId ?? null,
            fixtureSha256: route === null ? this.#deps.fixture!.sha256 : null,
            ...(route === null ? {} : { provenance: provenance(failureCode) }),
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
    if (last !== undefined && (last.kind === 'failed' || last.kind === 'interrupted') &&
        (code === AI7_FAILURE_CODES.MODEL_SERVICE_UNREACHABLE || code === AI7_FAILURE_CODES.PROXY_UNREACHABLE)) {
      return { kind: 'failed', code, message: last.failure.reason, outcomeUnknown: false, provenance: provenance(code) };
    }
    return { kind: 'failed', code, message: `${kind.label}没有完成（${code}）；没有生成任何建议。`, outcomeUnknown: false, provenance: provenance(code) };
  }
}

export { UnderlyingFlashService as FastRoleExecutionOwner };

/** Explicit Settings action only. No caller-supplied words or Book material can enter this path. */
export interface ModelConnectionTestExecution {
  readonly requestGovernor: ModelRequestGovernor;
  readonly producer?: ModelRequestProducer;
  readonly signal?: AbortSignal;
  /** The real service supplies its ordinary effect lane for the conditional final write. */
  readonly settle?: <Result>(operation: () => Result | Promise<Result>) => Promise<Result>;
}

/** One explicit synthetic probe on the recording launch's Underlying Flash binding. */
export async function recordModelConnectionTest(
  runtime: DeveloperLiveRuntime, policy: LaunchPolicyProjection, input: FastModelSelectionInput,
  secretResolver: SecretResolver, execution: ModelConnectionTestExecution,
): Promise<ModelConnectionTestStatus> {
  const selected = developerLiveBindingFor(runtime.launch, CONNECTION_TEST_KIND);
  if (runtime.launch.recordingProvider === undefined || input.route !== selected.route || input.modelId !== selected.model ||
      input.reasoningEffort != null && input.reasoningEffort !== selected.reasoningEffort) {
    throw new FastRoleError('MODEL_CONNECTION_TEST_UNAVAILABLE', '连接测试需要本次录制指定的底层 Flash 模型。');
  }
  const owner = new UnderlyingFlashService({ requestGovernor: execution.requestGovernor,
    ...(execution.producer === undefined ? {} : { producer: execution.producer }),
    fixture: null, live: fastRoleLiveRoutes(runtime, policy, secretResolver) });
  const stop = (): void => owner.dispose();
  execution.signal?.addEventListener('abort', stop, { once: true });
  const testedAt = new Date().toISOString();
  try {
    if (execution.signal?.aborted) stop();
    const answer = await owner.ask(CONNECTION_TEST_KIND, CONNECTION_TEST_POLICY.message, 'explicit-connection-test');
    const passed = answer.kind === 'answered' && connectionProbe.validateAndTrace(answer.text, {
      model: selected.model, reported: answer.probeModel,
    }) !== null;
    return { modelId: selected.model, credentialUpdatedAt: testedAt, testedAt, verified: 'buffered-text-only',
      outcome: passed ? 'passed' : answer.kind === 'failed' && answer.outcomeUnknown ? 'outcome-unknown' : 'failed',
      code: passed ? null : answer.kind === 'failed' ? answer.code : 'MODEL_CONNECTION_TEST_RESPONSE_INVALID' };
  } finally {
    execution.signal?.removeEventListener('abort', stop);
    stop();
  }
}

export async function testModelServiceConnection(
  store: EditorialStore, codeRoot: string, runtime: OrdinaryProductionRuntime | null,
  input: FastModelSelectionInput, secretResolver: SecretResolver, execution: ModelConnectionTestExecution,
): Promise<ModelConnectionTestStatus> {
  const producer = execution.producer ?? execution.requestGovernor.registerProducer({ key: `connection-test:${randomUUID()}`, kind: 'connection-test', lane: 'foreground' });
  const signal = execution.signal;
  const settle = execution.settle ?? (async <Result>(operation: () => Result | Promise<Result>): Promise<Result> => operation());
  try {
  const cancelled = (): boolean => signal?.aborted === true;
  if (runtime === null) throw new FastRoleError('MODEL_CONNECTION_TEST_UNAVAILABLE', '当前运行范围不允许实时连接测试；没有发送任何内容。');
  const connection = store.getModelServiceRouteConnection(input.route);
  // The channel's model takes its reviewed runtime record — a Zen model its own Zen route (Issue #1225); any other declared model
  // is refused by its named disposition (family not admitted, text untested or unsupported, no runtime record) before any ticket.
  const allowed = modelServiceRuntimeBinding(input.route, input.modelId, 'fast');
  const unserved = modelServiceRouteRefusal(input.route, input.modelId, 'fast');
  if (unserved !== null) throw new FastRoleError('MODEL_ROUTE_NOT_SERVED', unserved);
  if (allowed === undefined) {
    const declared = modelServiceChannels().find((channel) => channel.route === input.route)?.models.find((model) => model.modelId === input.modelId);
    throw new FastRoleError('MODEL_CONNECTION_TEST_UNAVAILABLE', `所选模型不能测试文本连接（${declared?.fast ?? 'not-declared'}）；没有发送任何内容。`);
  }
  if (connection === null || connection.credentialOperationState !== 'ready') {
    throw new FastRoleError('MODEL_CONNECTION_TEST_UNAVAILABLE', '请先保护凭据并选择已准入的文本模型；没有发送任何内容。');
  }
  if (sentReasoningEffort(input.reasoningEffort) !== null) {
    const evidence = store.getModelServiceModels(input.route).find(model => model.modelId === input.modelId);
    const refusal = modelEffortRefusal(evidence, modelProfileFor(allowed.route, allowed.model), input.reasoningEffort);
    if (refusal !== null) throw new FastRoleError('MODEL_EFFORT_INVALID', refusal);
  }
  if (cancelled()) {
    const cancelledStatus: ModelConnectionTestStatus = { modelId: input.modelId, credentialUpdatedAt: connection.credentialUpdatedAt,
      testedAt: new Date().toISOString(), outcome: 'cancelled', code: AI7_FAILURE_CODES.INTERRUPTED, verified: 'buffered-text-only' };
    await settle(() => store.recordModelConnectionTest(connection, cancelledStatus));
    return cancelledStatus;
  }
  const configured = { ...allowed, credentialReference: connection.credentialReference };
  const policy = await resolveSourceCheckoutLaunchPolicy(codeRoot, 'ordinary-production', null, configured);
  const unchanged = (): boolean => {
    const now = store.getModelServiceRouteConnection(input.route);
    return now?.credentialOperationState === 'ready' && now.credentialReference === connection.credentialReference && now.credentialUpdatedAt === connection.credentialUpdatedAt;
  };
  const owner = new UnderlyingFlashService({ requestGovernor: execution.requestGovernor, producer, fixture: null, live: productionFastRoleRoutes(runtime, () => policy,
    () => unchanged() ? connection.credentialReference : null, secretResolver, () => unchanged(),
    () => store.getModelServiceRouteConnection(input.route)?.credentialUpdatedAt ?? null, () => input.reasoningEffort) });
  const stop = (): void => owner.dispose();
  signal?.addEventListener('abort', stop, { once: true });
  if (cancelled()) stop();
  let answer: FastRoleAnswer;
  try { answer = await owner.ask(CONNECTION_TEST_KIND, CONNECTION_TEST_POLICY.message, 'explicit-connection-test'); }
  catch { answer = { kind: 'failed', code: cancelled() ? AI7_FAILURE_CODES.INTERRUPTED : 'MODEL_CONNECTION_TEST_UNAVAILABLE', message: '文本连接测试没有发送。', outcomeUnknown: false }; }
  finally { signal?.removeEventListener('abort', stop); owner.dispose(); }
  const facts = answer.kind === 'answered' ? answer.binding.provenance : answer.provenance;
  const passed = answer.kind === 'answered' && facts?.role === 'Fast Interaction Role' && facts.failureCode === null &&
    facts.route === allowed.route && facts.credentialReference === connection.credentialReference &&
    answer.binding.model === input.modelId &&
    connectionProbe.validateAndTrace(answer.text, { model: input.modelId, reported: answer.probeModel }) !== null;
  const code = passed ? null : answer.kind === 'failed' ? answer.code : facts?.failureCode ?? 'MODEL_CONNECTION_TEST_RESPONSE_INVALID';
  const uncertain = answer.kind === 'failed' ? answer.outcomeUnknown : code !== null && OUTCOME_UNKNOWN_CODES.has(code);
  const status: ModelConnectionTestStatus = {
    modelId: input.modelId, credentialUpdatedAt: connection.credentialUpdatedAt, testedAt: new Date().toISOString(),
    outcome: passed ? 'passed' : uncertain ? 'outcome-unknown' : cancelled() ? 'cancelled' : 'failed',
    code,
    verified: 'buffered-text-only',
    ...(answer.kind === 'answered' && code !== 'MODEL_CONNECTION_TEST_RESPONSE_INVALID' ? { responseText: answer.text } : {}),
    ...(facts === undefined ? {} : { provenance: { ...facts, failureCode: code } }),
  };
  await settle(() => store.recordModelConnectionTest(connection, status));
  return status;
  } finally {
    if (execution.producer === undefined) execution.requestGovernor.unregisterProducer(producer);
  }
}
