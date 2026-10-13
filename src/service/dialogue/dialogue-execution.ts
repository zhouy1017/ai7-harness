import { randomUUID } from 'node:crypto';
import { sha256Hex } from '../analysis/canonical.js';
import { DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS } from '../analysis/execution.js';
import { describeComposition, prepareExecution, type HarnessTurnOutcome, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import type { DeveloperLiveRuntime } from '../launch-policy.js';
import type { LaunchPolicyProjection } from '../../shared/protocol.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../shared/protected-secret-identity.js';
import { CredentialBroker, type CredentialSlotBinding, type SecretResolver } from '../provider/credential-broker.js';
import { DeepSeekOpenAiCompatibleAdapter } from '../provider/deepseek-adapter.js';
import { Ai7LocalDeterministicAdapter, type AnswerHold } from '../provider/local-deterministic-adapter.js';
import {
  LOCAL_DETERMINISTIC_MODEL,
  LOCAL_DETERMINISTIC_ROUTE,
  evaluateEgress,
  type EgressBindingFacts,
  type EgressPolicyPin,
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
 * The live route answers non-streaming: the model's whole answer arrives as one delta after the model has finished, and
 * the fragment reading shows it by complete sentence at once. 停止回答 before it arrives keeps nothing.
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

/** What a developer-live launch gives the dialogue: its runtime, the broker, and the route its policy admits, if any. */
export interface DialogueLiveRoute {
  readonly runtime: DeveloperLiveRuntime;
  readonly broker: CredentialBroker;
  /** The route the selected policy admits for the dialogue; `null` refuses every dialogue under this launch. */
  readonly route: AdmittedDialogueRoute | null;
  /** The Credential Reference of the development slot, as the provider configuration names it. */
  readonly credentialReference: string;
}

export interface DialogueExecutionDeps {
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

/** The validation purpose every live dialogue call is filed under in the Provider Test Ledger. */
export const DIALOGUE_TEST_ITEM_PURPOSE = DIALOGUE_TASK_KIND;

/**
 * Why an answer cannot start under this launch, in the editor's words; `null` when it can. Under developer-live the Book's
 * source digest, when read (`undefined` when not), must be an admitted Public SampleBook's; a Book of no source never is.
 */
export function dialogueRouteRefusal(deps: Pick<DialogueExecutionDeps, 'fixture' | 'live'>, sourceDigest?: string | null): string | null {
  if (deps.live !== null) {
    if (deps.live.route === null) return '当前选定的模型处理规则没有准许对话使用实时模型；这次没有发送任何内容。';
    if (sourceDigest !== undefined && (sourceDigest === null || !DEVELOPER_LIVE_TRANSMITTABLE_SOURCE_DIGESTS.has(sourceDigest))) {
      return '这本书不在开发者实时可发送的公开样书范围内；这次没有发送任何内容。';
    }
    return null;
  }
  if (deps.fixture === null) return '这次启动没有可用的对话模型；没有发送任何内容。';
  return null;
}

interface ActiveAnswer {
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
    if (this.#active !== null) throw new DialogueError('DIALOGUE_BUSY', '另一段对话正在回答；停止它或等它答完再提问。');
  }

  /** What the attempt in flight sent and has streamed so far; `null` for any other attempt. */
  liveText(attemptId: string): LiveAnswer | null {
    const active = this.#active;
    return active !== null && active.attemptId === attemptId ? { message: active.message, streamed: active.streamed } : null;
  }

  get answering(): boolean {
    return this.#active !== null;
  }

  /** Start the attempt's turn and return at once; the answer streams into memory and settles its own outcome. */
  begin(turn: DialogueTurnStart): void {
    this.requireReady();
    let settle!: () => void;
    const done = new Promise<void>((resolve) => { settle = resolve; });
    const active: ActiveAnswer = { attemptId: turn.attemptId, message: turn.message, streamed: '', stopRequested: false, harness: null, done };
    this.#active = active;
    void this.#run(active, turn).finally(() => {
      if (this.#active === active) this.#active = null;
      settle();
    });
  }

  /** 停止回答: interrupt the answer in flight and wait until it has settled as stopped. */
  async stop(attemptId: string): Promise<void> {
    const active = this.#active;
    if (active === null || active.attemptId !== attemptId) return;
    active.stopRequested = true;
    active.harness?.interrupt();
    await active.done;
  }

  /** AI7 is closing: the answer in flight is interrupted and settles 回答中断 before the store closes. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    const active = this.#active;
    if (active === null) return;
    active.harness?.interrupt();
    await active.done;
  }

  async #run(active: ActiveAnswer, turn: DialogueTurnStart): Promise<void> {
    const { records } = this.#deps;
    const live = this.#deps.live;
    const message = buildDialogueMessage(turn.message);
    const sessionId = randomUUID();
    const promptContractDigest = DIALOGUE_PROMPT_CONTRACT_DIGEST;
    const systemPrompt = DIALOGUE_PROMPT_CONTRACT.systemPrompt;
    let current: string | null = null;
    let spanOpened = false;
    let outcome: HarnessTurnOutcome | null = null;
    let failure: string | null = null;
    try {
      const route = live === null ? null : live.route!;
      const executionRoute: ExecutionRoute = route === null ? LOCAL_DETERMINISTIC_ROUTE : route.profile.route as ExecutionRoute;
      const model = route === null ? LOCAL_DETERMINISTIC_MODEL : route.modelProfile.model;
      const composition = describeComposition(executionRoute, model, promptContractDigest, { sessionLog: true });
      const bindingDigest = sha256Hex(`${turn.attemptId}\u0000${sessionId}\u0000${composition.digest}`);
      const slotBinding: CredentialSlotBinding | null = live === null || route === null ? null : {
        bindingDigest, modelRole: route.modelRole, slot: route.profile.credentialSlot, credentialReference: live.credentialReference,
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
          : { operationalScope: 'developer-live', providerProcessingVersion: route.providerProcessingVersion as Extract<EgressPolicyPin, { operationalScope: 'developer-live' }>['providerProcessingVersion'], liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
        // The one message this attempt may send: the selected words and the question, and what a stopped answer kept.
        admittedUserMessages: new Set([message]),
        ...(route === null ? {} : { ruleOutboundCategories: route.outboundDataCategories }),
      };
      // Development validation only (ADR 0089, Issue #808): the Provider Test Ledger and Result Cache answer, refuse or record
      // the request. A live launch outside one is business, and the request reaches the transport itself.
      const validation = live?.runtime.launch.validation ?? null;
      let cache: ProviderResultCache | null = null;
      if (live !== null && validation !== null) {
        cache = new ProviderResultCache(live.runtime.launch.providerCacheRoot);
        await cache.open();
      }
      // The single-use ticket the gate issued for the turn in flight; the live adapter takes it or refuses.
      let pendingTicket: TransmitTicket | null = null;
      const harness: PrimaryAgentHarnessHandle = await prepareExecution({
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
          return new DeepSeekOpenAiCompatibleAdapter({
            broker: live.broker,
            slotBinding,
            tickets: { take: () => { const ticket = pendingTicket; pendingTicket = null; return ticket; } },
            attribution: () => ({}),
            promptContractDigest,
            codes,
            profile: route.profile,
            modelProfile: route.modelProfile,
            sessionId: () => harness.currentSessionId(),
            transport: cache === null || validation === null
              ? (url, init) => nativeFetch(url, init)
              // 重新回答 sends the very request the ask sent, so under the same validation the cache replays the captured
              // answer instead of paying for it twice; 继续回答 asks a different question and is its own step.
              : (url, init) => transmitOnce(cache!, nativeFetch, { purpose: DIALOGUE_TEST_ITEM_PURPOSE, slice: 'S17c', promptContractDigest }, {
                intent: validation,
                step: `${DIALOGUE_TEST_ITEM_PURPOSE}/${turn.message.kind}`,
                requestShape: route.modelProfile.capabilities.requestShape,
              }, route.profile, model, url, init),
          });
        },
        gate: (payload) => evaluateEgress(payload, bindingFacts, {
          currentBindingDigest: () => current,
          acceptedOutputDigests: new Set(),
          // A dialogue has no Run, so no per-Run ceiling applies; its single bounded payload is its bound (ADR 0088 §4).
          ...(route === null ? {} : { ceilingState: () => 'not-applicable' as const }),
        }),
        onTransmitTicket: (ticket) => {
          if (route === null) throw new DialogueError('DIALOGUE_REMOTE_FORBIDDEN', 'development-ci 下对话不得签发远程传输。');
          pendingTicket = ticket;
        },
      });
      active.harness = harness;
      try {
        // The credential is checked for presence only; its value is released to the final adapter alone, inside the send.
        if (live !== null && slotBinding !== null && await live.broker.checkReadiness(slotBinding) !== 'present') {
          throw new DialogueError('DIALOGUE_CREDENTIAL_ABSENT', '受保护凭据库中没有对话所用模型服务的开发凭据；未发送任何内容。');
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
            route: 'opencode-go',
            model,
            operationalScope: 'developer-live',
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
