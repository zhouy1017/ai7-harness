import { randomUUID } from 'node:crypto';
import { RetrievalIndex, type RetrievalSource } from '../retrieval/index.js';
import { PlatformToolSession } from '../provider/platform-tool-session.js';
import { DIALOGUE_RETRIEVAL_PROMPT_CONTRACT, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST } from './contract.js';
import { sha256Hex } from '../analysis/canonical.js';
import { DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS } from '../analysis/execution.js';
import { describeComposition, prepareExecution, type HarnessTurnOutcome, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import { isOrdinaryProductionRuntime, type DeveloperLiveRuntime, type LiveRuntime, type OrdinaryProductionRuntime } from '../launch-policy.js';
import {
  MODEL_SERVICE_SETUP_REQUIRED_REASON,
  type DeveloperLiveProviderProcessingVersion,
  type LaunchPolicyProjection,
  type OrdinaryProductionProviderProcessingVersion,
} from '../../shared/protocol.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../shared/protected-secret-identity.js';
import { CredentialBroker, type CredentialSlotBinding, type SecretResolver } from '../provider/credential-broker.js';
import { DeepSeekOpenAiCompatibleAdapter, type DeepSeekTransport } from '../provider/deepseek-adapter.js';
import { Ai7LocalDeterministicAdapter, dialogueRetrievalFixtureRule, type AnswerHold } from '../provider/local-deterministic-adapter.js';
import {
  LOCAL_DETERMINISTIC_MODEL,
  LOCAL_DETERMINISTIC_ROUTE,
  evaluateEgress,
  type EgressBindingFacts,
  type ExecutionRoute,
  type TransmitTicket,
} from '../provider/egress-gate.js';
import { transmitOnce } from '../provider/live-transmission.js';
import type { ResolvedModelFixture } from '../provider/model-fixture.js';
import { ProviderResultCache } from '../provider/provider-result-cache.js';
import { DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST, buildDialogueMessage, type DialogueMessageInput } from './contract.js';
import type { LiveAnswer } from './dialogue-history.js';
import { DialogueError, type DialogueOutcome, type DialogueTurnStart, type StoredDialogueBinding } from './dialogue-ledger.js';
import { DIALOGUE_OUTBOUND_CATEGORY, DIALOGUE_TASK_KIND, admittedDialogueRoute, type AdmittedDialogueRoute } from './dialogue-route.js';

/**
 * The Interactive Editorial Dialogue's execution owner (Issue #52, plan slices S17a and S17c; UI ADR 0014; ADR 0088): one
 * answer in flight at a time, each attempt a fresh PrimaryAgentHarness composition whose Session log persists under the
 * Agent Data Root — the Harness Session Ledger — and whose text deltas stream into memory as they arrive, so the foreground
 * dialogue can show them by complete fragment. Whether anyone is watching changes nothing here (DIALOG-010): the answer runs
 * the same in the foreground and the background, and only `停止回答` or AI7 closing stops it.
 *
 * Two routes. Under development-ci the J-04 deterministic fixture answers (S17a). Under developer-live (S17c) the answer goes
 * to the route the selected Provider Processing policy admits for the dialogue — read from the verified launch projection by
 * `admittedDialogueRoute`, never written here — with the credential the broker releases to the final adapter alone. A launch
 * whose policy admits no dialogue, or a Book that is not an admitted Public SampleBook, refuses before anything is recorded.
 *
 * The live dialogue alone asks for SSE, and only from a model whose profile declares it (Issue #833); any other admitted
 * model keeps the whole-answer request. Text deltas reach the Harness as they arrive, and the existing fragment reading
 * preserves complete sentences after 停止回答 for a new 继续回答 attempt.
 *
 * Every ask, 继续回答 and 重新回答 is a new attempt that sends its own request. Under a launch that names a development
 * validation (ADR 0089, Issue #808), that request goes through the Provider Test Ledger and Result Cache: an identical request
 * replays the captured answer, and nothing is sent twice for the same validation. Outside one — actual business — the request
 * reaches the transport itself every time, and nothing reads or writes the development cache or ledger.
 */
export interface DialogueRecords {
  bindDialogueAttempt(attemptId: string, binding: StoredDialogueBinding): void;
  openDialogueSpan(attemptId: string, harnessSessionId: string, startSeq: number): void;
  settleDialogueAttempt(attemptId: string, outcome: DialogueOutcome, endSeq: number | null, causeCode: string | null): void;
}

/**
 * What a live launch gives the dialogue: its runtime, the broker, and the route its policy admits, if any. Under
 * ordinary-production (Issue #811) the route and the Credential Reference are the editor's configured binding, read at each
 * attempt, so a route switch reaches the next question.
 */
export interface DialogueLiveRoute {
  readonly runtime: LiveRuntime;
  readonly broker: CredentialBroker;
  /** The route the selected policy admits for the dialogue; `null` refuses every dialogue under this launch. */
  readonly route: AdmittedDialogueRoute | null;
  /** The Credential Reference of the development slot, as the provider configuration names it. */
  readonly credentialReference: string;
}

export interface DialogueExecutionDeps {
  readonly retrievalSources?: (dialogueId: string) => readonly RetrievalSource[];
  readonly records: DialogueRecords;
  /** The J-04 adapter's fixture when the launch binds one; `null` binds no local dialogue route. */
  readonly fixture: ResolvedModelFixture | null;
  /** The Harness Session Ledger's directory under the Agent Data Root. */
  readonly sessionLogRoot: string;
  /** The developer-live launch's dialogue route; `null` under every other scope. */
  readonly live: DialogueLiveRoute | null;
  /** J-16's answer hold, when its launch names one. */
  readonly answerHold?: AnswerHold | null;
}

/**
 * The dialogue's route under a developer-live launch: the route the verified projection's policy admits for it — or none —
 * with a broker of its own over the launch's Protected Secret Store and the development slot's Credential Reference.
 */
export function dialogueLiveRoute(runtime: DeveloperLiveRuntime, policy: LaunchPolicyProjection, secretResolver: SecretResolver): DialogueLiveRoute {
  return {
    runtime,
    broker: new CredentialBroker(secretResolver),
    route: admittedDialogueRoute(policy),
    credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE,
  };
}

/**
 * The dialogue's route under an ordinary-production launch (Issue #811): the route the current policy admits on the editor's
 * configured binding, that connection's own Credential Reference, and a broker that never reads a development one.
 */
export function productionDialogueRoute(
  runtime: OrdinaryProductionRuntime,
  policy: () => LaunchPolicyProjection,
  credentialReference: () => string | null,
  secretResolver: SecretResolver,
): DialogueLiveRoute {
  return {
    runtime,
    broker: new CredentialBroker(secretResolver, { developmentReferences: 'refused' }),
    get route() {
      const admitted = admittedDialogueRoute(policy());
      return admitted !== null && credentialReference() !== null ? admitted : null;
    },
    get credentialReference() {
      return credentialReference() ?? '';
    },
  };
}

/** The validation purpose every live dialogue call is filed under in the Provider Test Ledger. */
export const DIALOGUE_TEST_ITEM_PURPOSE = DIALOGUE_TASK_KIND;

/**
 * Why an answer cannot start under this launch, in the editor's words; `null` when it can. Under developer-live the Book's
 * source digest, when read (`undefined` when not), must be an admitted Public SampleBook's; a Book of no source never is.
 */
export function dialogueRouteRefusal(deps: Pick<DialogueExecutionDeps, 'fixture' | 'live'>, sourceDigest?: string | null): string | null {
  if (deps.live !== null) {
    const production = isOrdinaryProductionRuntime(deps.live.runtime);
    if (deps.live.route === null) return production ? MODEL_SERVICE_SETUP_REQUIRED_REASON : '当前选定的模型处理规则没有准许对话使用实时模型；这次没有发送任何内容。';
    // Ordinary production sends the editor's own manuscript (Issue #811); only developer-live is held to the Public SampleBooks.
    if (!production && sourceDigest !== undefined && (sourceDigest === null || !DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS.has(sourceDigest))) {
      return '这本书不在开发者实时可发送的公开样书范围内；这次没有发送任何内容。';
    }
    return null;
  }
  if (deps.fixture === null) return '这次启动没有可用的对话模型；没有发送任何内容。';
  return null;
}

interface ActiveAnswer {
  retrieval?: RetrievalIndex | null;
  readonly attemptId: string;
  readonly message: DialogueMessageInput;
  streamed: string;
  stopRequested: boolean;
  harness: PrimaryAgentHarnessHandle | null;
  readonly done: Promise<void>;
}

/** How long an outcome the store refused waits before it is written again, once. */
const SETTLE_RETRY_MS = 50;

/** The code an interruption's outcome records when AI7 itself closed under the answer. */
export const DIALOGUE_CLOSED_CAUSE = 'AI7_CLOSED';

export class DialogueExecutionOwner {
  readonly #deps: DialogueExecutionDeps;
  #active: ActiveAnswer | null = null;
  readonly #queued: DialogueTurnStart[] = [];
  #disposed = false;

  constructor(deps: DialogueExecutionDeps) {
    this.#deps = deps;
  }

  /**
   * Refuse before anything is recorded when no dialogue route is bound, the Book's source may not be sent on it, or another
   * answer is in flight.
   */
  requireReady(sourceDigest?: string | null): void {
    const refusal = dialogueRouteRefusal(this.#deps, sourceDigest);
    if (refusal !== null) throw new DialogueError('DIALOGUE_ROUTE_UNAVAILABLE', refusal);
    if (this.#disposed) throw new DialogueError('DIALOGUE_ROUTE_UNAVAILABLE', 'AI7 正在关闭；没有发送任何内容。');
  }

  /** What the attempt in flight sent and has streamed so far; `null` for any other attempt. */
  liveText(attemptId: string): LiveAnswer | null {
    const active = this.#active;
    const queued = this.#queued.find((turn) => turn.attemptId === attemptId);
    if (queued !== undefined) return { message: queued.message, streamed: '', queued: true };
    return active !== null && active.attemptId === attemptId ? { message: active.message, streamed: active.streamed,
      exactFetched: active.retrieval?.exactFetchedCandidates() ?? new Map() } : null;
  }

  get answering(): boolean {
    return this.#active !== null;
  }

  /** Start the attempt's turn and return at once; the answer streams into memory and settles its own outcome. */
  begin(turn: DialogueTurnStart): void {
    this.requireReady();
    if (this.#active?.attemptId === turn.attemptId || this.#queued.some((queued) => queued.attemptId === turn.attemptId)) return;
    if (this.#active !== null) {
      this.#queued.push(turn);
      return;
    }
    let settle!: () => void;
    const done = new Promise<void>((resolve) => { settle = resolve; });
    const active: ActiveAnswer = { attemptId: turn.attemptId, message: turn.message, streamed: '', stopRequested: false, harness: null, done };
    this.#active = active;
    void this.#run(active, turn).finally(() => {
      if (this.#active === active) this.#active = null;
      settle();
      this.#beginQueued();
    });
  }

  #beginQueued(): void {
    while (!this.#disposed && this.#active === null) {
      const next = this.#queued.shift();
      if (next === undefined) return;
      try { this.begin(next); }
      catch (error) {
        const code = error instanceof DialogueError ? error.code : 'DIALOGUE_DISPATCH_FAILED';
        this.#deps.records.settleDialogueAttempt(next.attemptId, 'failed', null, code);
      }
    }
  }

  /** 停止回答: interrupt the answer in flight and wait until it has settled as stopped. */
  async stop(attemptId: string): Promise<void> {
    const queued = this.#queued.findIndex((turn) => turn.attemptId === attemptId);
    if (queued !== -1) {
      // A queued attempt has neither a Harness span nor a sent request. Cancellation uses the existing stopped outcome.
      this.#deps.records.settleDialogueAttempt(attemptId, 'stopped', null, null);
      this.#queued.splice(queued, 1);
      return;
    }
    const active = this.#active;
    if (active === null || active.attemptId !== attemptId) return;
    active.stopRequested = true;
    active.harness?.interrupt();
    await active.done;
  }

  /** AI7 is closing: the answer in flight is interrupted and settles 回答中断 before the store closes. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    try {
      for (const queued of this.#queued.splice(0)) this.#deps.records.settleDialogueAttempt(queued.attemptId, 'interrupted', null, DIALOGUE_CLOSED_CAUSE);
    } finally {
      const active = this.#active;
      if (active !== null) { active.harness?.interrupt(); await active.done; }
    }
  }

  async #run(active: ActiveAnswer, turn: DialogueTurnStart): Promise<void> {
    const { records } = this.#deps;
    const live = this.#deps.live;
    const message = buildDialogueMessage(turn.message);
    const sessionId = randomUUID();
    const localRule = live?.route?.localTools ?? (live === null && this.#deps.fixture !== null ? dialogueRetrievalFixtureRule(this.#deps.fixture, turn.message) : null);
    let retrieval: RetrievalIndex | null = null;
    const promptContractDigest = localRule === null ? DIALOGUE_PROMPT_CONTRACT_DIGEST : DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST;
    const systemPrompt = localRule === null ? DIALOGUE_PROMPT_CONTRACT.systemPrompt : DIALOGUE_RETRIEVAL_PROMPT_CONTRACT.systemPrompt;
    let current: string | null = null;
    let spanOpened = false;
    let outcome: HarnessTurnOutcome | null = null;
    let failure: string | null = null;
    try {
      // Inside the attempt: a source that cannot be read settles the attempt as failed rather than leaving it answering.
      retrieval = localRule === null ? null : new RetrievalIndex(this.#deps.retrievalSources?.(turn.dialogueId) ?? []);
      active.retrieval = retrieval;
      const route = live === null ? null : live.route!;
      // Read once: under ordinary-production the configured reference may change while this answer is in flight (Issue #811).
      const credentialReference = live === null ? '' : live.credentialReference;
      const executionRoute: ExecutionRoute = route === null ? LOCAL_DETERMINISTIC_ROUTE : route.profile.route as ExecutionRoute;
      const model = route === null ? LOCAL_DETERMINISTIC_MODEL : route.modelProfile.model;
      const composition = describeComposition(executionRoute, model, promptContractDigest, { sessionLog: true, localTools: localRule !== null });
      const bindingDigest = sha256Hex(`${turn.attemptId}\u0000${sessionId}\u0000${composition.digest}`);
      const slotBinding: CredentialSlotBinding | null = live === null || route === null ? null : {
        bindingDigest, modelRole: route.modelRole, slot: route.profile.credentialSlot, credentialReference,
      };
      const bindingFacts: EgressBindingFacts = {
        bindingDigest,
        route: executionRoute,
        model,
        systemPrompt,
        // The editor's own selected words and question: the local deterministic route, or a remote one whose rule names them.
        outboundDataCategory: DIALOGUE_OUTBOUND_CATEGORY,
        policy: route === null
          ? { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 }
          // The selected version, as the verified projection names it.
          : route.operationalScope === 'ordinary-production'
            ? { operationalScope: 'ordinary-production', providerProcessingVersion: route.providerProcessingVersion as OrdinaryProductionProviderProcessingVersion, liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' }
            : { operationalScope: 'developer-live', providerProcessingVersion: route.providerProcessingVersion as DeveloperLiveProviderProcessingVersion, liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
        // The one message this attempt may send: the selected words and the question, and what a stopped answer kept.
        admittedUserMessages: new Set([message]),
        ...(localRule === null ? {} : { localTools: localRule }),
        ...(route === null ? {} : { ruleOutboundCategories: route.outboundDataCategories }),
      };
      const acceptedOutputDigests = new Set<string>();
      const scope = { currentBindingDigest: () => current, acceptedOutputDigests, ...(route === null ? {} : { ceilingState: () => 'not-applicable' as const }) };
      const toolSession = retrieval === null ? null : new PlatformToolSession({ binding: bindingFacts, scope, retrieval, purpose: DIALOGUE_TEST_ITEM_PURPOSE });
      // Development validation only (ADR 0089, Issue #808): the Provider Test Ledger and Result Cache answer, refuse or record
      // the request. A live launch outside one is business, and the request reaches the transport itself.
      // Ordinary production has no development validation, so no answer ever reaches the developer cache or ledger (Issue #811).
      const validation = live === null || isOrdinaryProductionRuntime(live.runtime) ? null : live.runtime.launch.validation;
      let cache: ProviderResultCache | null = null;
      if (live !== null && validation !== null && !isOrdinaryProductionRuntime(live.runtime)) {
        cache = new ProviderResultCache(live.runtime.launch.providerCacheRoot);
        await cache.open();
      }
      // The single-use ticket the gate issued for the turn in flight; the live adapter takes it or refuses.
      let pendingTicket: TransmitTicket | null = null;
      const harness: PrimaryAgentHarnessHandle = await prepareExecution({
        ...(toolSession === null ? {} : { localTools: toolSession }),
        sessionId,
        route: executionRoute,
        model,
        systemPrompt,
        promptContractDigest,
        sessionLogRoot: this.#deps.sessionLogRoot,
        adapterFactory: (codes) => {
          if (live === null || route === null || slotBinding === null) {
            return new Ai7LocalDeterministicAdapter(this.#deps.fixture!, promptContractDigest, codes, { answerHold: this.#deps.answerHold ?? null });
          }
          const nativeFetch = live.runtime.nativeFetch;
          // A stop during cache/session/credential setup can precede the Harness turn, when interrupt() is still idle.
          // Check again at both transport boundaries so that neither a cache claim nor an actual send starts after it.
          const requireRunning = (signal?: AbortSignal): void => {
            if (active.stopRequested || this.#disposed || signal?.aborted === true) throw new DOMException('Dialogue interrupted.', 'AbortError');
          };
          const send: DeepSeekTransport = async (url, init) => {
            requireRunning(init.signal);
            return nativeFetch(url, init);
          };
          // The streaming capability is a declaration, not an admission: it chooses the transport for a model the policy admitted.
          const streamShape = route.modelProfile.capabilities.streaming === 'chat-completions-sse' ? 'editorial-dialogue-sse' as const : null;
          return new DeepSeekOpenAiCompatibleAdapter({
            broker: live.broker,
            slotBinding,
            tickets: { take: () => { const ticket = pendingTicket; pendingTicket = null; return ticket; } },
            attribution: () => ({}),
            promptContractDigest,
            codes,
            profile: route.profile,
            modelProfile: route.modelProfile,
            ...(streamShape === null ? {} : { requestShape: streamShape }),
            sessionId: () => harness.currentSessionId(),
            transport: async (url, init) => {
              requireRunning(init.signal);
              return cache === null || validation === null
                ? send(url, init)
                // 重新回答 sends the very request the ask sent, so under the same validation the cache replays the captured
                // answer instead of paying for it twice; 继续回答 asks a different question and is its own step.
                // A dialogue turn is its own task: its stage contract and its task contract are the one dialogue contract.
                : transmitOnce(cache, send, { purpose: DIALOGUE_TEST_ITEM_PURPOSE, slice: 'S17c', promptContractDigest, taskPromptContractDigest: promptContractDigest }, {
                  intent: validation,
                  step: `${DIALOGUE_TEST_ITEM_PURPOSE}/${turn.message.kind}`,
                  requestShape: streamShape ?? route.modelProfile.capabilities.requestShape,
                }, route.profile, model, url, init);
            },
          });
        },
        gate: (payload) => evaluateEgress(payload, bindingFacts, toolSession?.egressScope ?? scope),
        onTransmitTicket: (ticket) => {
          if (route === null) throw new DialogueError('DIALOGUE_REMOTE_FORBIDDEN', 'development-ci 下对话不得签发远程传输。');
          pendingTicket = ticket;
        },
      });
      active.harness = harness;
      try {
        // The credential is checked for presence only; its value is released to the final adapter alone, inside the send.
        if (live !== null && slotBinding !== null && await live.broker.checkReadiness(slotBinding) !== 'present') {
          throw new DialogueError('DIALOGUE_CREDENTIAL_ABSENT', isOrdinaryProductionRuntime(live.runtime)
            ? '受保护凭据库中没有你为对话所用模型服务保存的凭据；请在 设置 › 模型服务 重新输入。未发送任何内容。'
            : '受保护凭据库中没有对话所用模型服务的开发凭据；未发送任何内容。');
        }
        records.bindDialogueAttempt(turn.attemptId, route === null
          ? {
            harnessSessionId: sessionId,
            route: LOCAL_DETERMINISTIC_ROUTE,
            model,
            operationalScope: 'development-ci',
            behaviorCompositionSha256: harness.composition.digest,
            promptContractSha256: promptContractDigest,
            fixtureSha256: this.#deps.fixture!.sha256,
            boundAt: new Date().toISOString(),
          }
          : {
            harnessSessionId: sessionId,
            route: route.profile.route as 'opencode-go' | 'deepseek-open-platform',
            model,
            operationalScope: route.operationalScope,
            behaviorCompositionSha256: harness.composition.digest,
            promptContractSha256: promptContractDigest,
            providerProcessingVersion: route.providerProcessingVersion,
            policyRuleId: route.ruleId,
            boundAt: new Date().toISOString(),
          });
        harness.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: harness.composition.digest, promptContractDigest });
        current = bindingDigest;
        // The span is recorded before anything is sent, so an answer AI7 closes under is still found in the ledger.
        records.openDialogueSpan(turn.attemptId, sessionId, harness.nextSpanStart().startSeq);
        spanOpened = true;
        if (active.stopRequested || this.#disposed) harness.interrupt();
        outcome = await harness.submitStreaming(message, (delta) => {
          active.streamed += delta;
          // A stop asked before the turn began found the agent idle, which ignores an interruption: it is asked again now.
          if (active.stopRequested || this.#disposed) harness.interrupt();
        });
      } finally {
        current = null;
        await harness.finish();
        retrieval?.dispose();
      }
    } catch (error) {
      failure = error instanceof Error && 'code' in error && typeof (error as { code: unknown }).code === 'string'
        ? (error as { code: string }).code
        : 'DIALOGUE_EXECUTION_FAILED';
    }
    // The turn's last event in the Session, when the turn reached it at all.
    const endSeq = outcome !== null && spanOpened && outcome.span.endSeq >= outcome.span.startSeq ? outcome.span.endSeq : null;
    let settled: DialogueOutcome;
    let cause: string | null = null;
    if (outcome === null) {
      settled = 'failed';
      cause = failure ?? 'DIALOGUE_EXECUTION_FAILED';
    } else if (outcome.terminal === 'completed') {
      settled = 'completed';
    } else if (outcome.terminal === 'interrupted' && active.stopRequested) {
      settled = 'stopped';
    } else if (outcome.terminal === 'interrupted') {
      settled = 'interrupted';
      const last = outcome.signals.at(-1);
      cause = this.#disposed ? DIALOGUE_CLOSED_CAUSE : last?.kind === 'interrupted' ? last.failure.code : 'INTERRUPTED';
    } else {
      settled = 'failed';
      const last = outcome.signals.at(-1);
      cause = last?.kind === 'failed' ? last.failure.code : 'AMBIGUOUS';
    }
    // A write the store refused once (a moment's lock, a busy disk) is tried once more; one refused twice leaves the attempt
    // unsettled, and the next start's reconciliation settles it 回答中断 from the ledger.
    for (let tries = 0; tries < 2; tries += 1) {
      try {
        records.settleDialogueAttempt(turn.attemptId, settled, endSeq, cause);
        return;
      } catch {
        if (tries === 0) await new Promise((resolve) => setTimeout(resolve, SETTLE_RETRY_MS));
      }
    }
  }
}
