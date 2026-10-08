import { randomUUID } from 'node:crypto';
import { sha256Hex } from '../analysis/canonical.js';
import { describeComposition, prepareExecution, type HarnessTurnOutcome, type PrimaryAgentHarnessHandle } from '../harness/primary-agent-harness.js';
import { Ai7LocalDeterministicAdapter, type AnswerHold } from '../provider/local-deterministic-adapter.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, evaluateEgress, type EgressBindingFacts } from '../provider/egress-gate.js';
import type { ResolvedModelFixture } from '../provider/model-fixture.js';
import { DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST, buildDialogueMessage, type DialogueMessageInput } from './contract.js';
import type { LiveAnswer } from './dialogue-history.js';
import { DialogueError, type DialogueOutcome, type DialogueTurnStart, type StoredDialogueBinding } from './dialogue-ledger.js';

/**
 * The Interactive Editorial Dialogue's execution owner (Issue #52, plan slice S17a; UI ADR 0014): one answer in flight at a
 * time, each attempt a fresh PrimaryAgentHarness composition whose Session log persists under the Agent Data Root — the
 * Harness Session Ledger — and whose text deltas stream into memory as they arrive, so the foreground dialogue can show
 * them by complete fragment. Whether anyone is watching changes nothing here (DIALOG-010): the answer runs the same in the
 * foreground and the background, and only `停止回答` or AI7 closing stops it.
 *
 * Only `ai7-local-deterministic` is bound (development-ci). The live OpenCode Go route is not wired in this slice: a
 * dialogue turn sends the editor's selected words and question for a purpose no Provider Processing revision admits yet,
 * and that revision is a Policy Document the Owner reviews byte by byte (S17c). The seam is `#route`: it refuses under any
 * launch without the deterministic fixture, before anything is recorded.
 */
export interface DialogueRecords {
  bindDialogueAttempt(attemptId: string, binding: StoredDialogueBinding): void;
  openDialogueSpan(attemptId: string, harnessSessionId: string, startSeq: number): void;
  settleDialogueAttempt(attemptId: string, outcome: DialogueOutcome, endSeq: number | null, causeCode: string | null): void;
}

export interface DialogueExecutionDeps {
  readonly records: DialogueRecords;
  /** The J-04 adapter's fixture when the launch binds one; `null` binds no dialogue route. */
  readonly fixture: ResolvedModelFixture | null;
  /** The Harness Session Ledger's directory under the Agent Data Root. */
  readonly sessionLogRoot: string;
  /** Whether the launch is the human-attended developer-live scope, whose dialogue route is not wired yet (S17c). */
  readonly developerLive: boolean;
  /** J-16's answer hold, when its launch names one. */
  readonly answerHold?: AnswerHold | null;
}

/** Why an answer cannot start under this launch, in the editor's words; `null` when it can. */
export function dialogueRouteRefusal(deps: Pick<DialogueExecutionDeps, 'fixture' | 'developerLive'>): string | null {
  if (deps.developerLive) return '对话还没有接入实时模型：对话用途的模型处理规则需要先经审核（S17c）；这次没有发送任何内容。';
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

/** The code an interruption's outcome records when AI7 itself closed under the answer. */
export const DIALOGUE_CLOSED_CAUSE = 'AI7_CLOSED';

export class DialogueExecutionOwner {
  readonly #deps: DialogueExecutionDeps;
  #active: ActiveAnswer | null = null;
  #disposed = false;

  constructor(deps: DialogueExecutionDeps) {
    this.#deps = deps;
  }

  /** Refuse before anything is recorded when no dialogue route is bound, or another answer is in flight. */
  requireReady(): void {
    const refusal = dialogueRouteRefusal(this.#deps);
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

  /** AI7 is closing: the answer in flight is interrupted and settles 回答已中断 before the store closes. */
  async dispose(): Promise<void> {
    this.#disposed = true;
    const active = this.#active;
    if (active === null) return;
    active.harness?.interrupt();
    await active.done;
  }

  async #run(active: ActiveAnswer, turn: DialogueTurnStart): Promise<void> {
    const { records } = this.#deps;
    const fixture = this.#deps.fixture!;
    const message = buildDialogueMessage(turn.message);
    const sessionId = randomUUID();
    const promptContractDigest = DIALOGUE_PROMPT_CONTRACT_DIGEST;
    const systemPrompt = DIALOGUE_PROMPT_CONTRACT.systemPrompt;
    const composition = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, promptContractDigest, { sessionLog: true });
    const bindingDigest = sha256Hex(`${turn.attemptId}\u0000${sessionId}\u0000${composition.digest}`);
    let current: string | null = null;
    const bindingFacts: EgressBindingFacts = {
      bindingDigest,
      route: LOCAL_DETERMINISTIC_ROUTE,
      model: LOCAL_DETERMINISTIC_MODEL,
      systemPrompt,
      outboundDataCategory: 'public-or-synthetic',
      policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 },
      // The one message this attempt may send: the selected words and the question, and what a stopped answer kept.
      admittedUserMessages: new Set([message]),
    };
    let spanOpened = false;
    let outcome: HarnessTurnOutcome | null = null;
    let failure: string | null = null;
    try {
      const harness = await prepareExecution({
        sessionId,
        route: LOCAL_DETERMINISTIC_ROUTE,
        model: LOCAL_DETERMINISTIC_MODEL,
        systemPrompt,
        promptContractDigest,
        sessionLogRoot: this.#deps.sessionLogRoot,
        adapterFactory: (codes) => new Ai7LocalDeterministicAdapter(fixture, promptContractDigest, codes, { answerHold: this.#deps.answerHold ?? null }),
        gate: (payload) => evaluateEgress(payload, bindingFacts, { currentBindingDigest: () => current, acceptedOutputDigests: new Set() }),
        onTransmitTicket: () => {
          throw new DialogueError('DIALOGUE_REMOTE_FORBIDDEN', 'development-ci 下对话不得签发远程传输。');
        },
      });
      active.harness = harness;
      try {
        records.bindDialogueAttempt(turn.attemptId, {
          harnessSessionId: sessionId,
          route: LOCAL_DETERMINISTIC_ROUTE,
          model: LOCAL_DETERMINISTIC_MODEL,
          operationalScope: 'development-ci',
          behaviorCompositionSha256: harness.composition.digest,
          promptContractSha256: promptContractDigest,
          fixtureSha256: fixture.sha256,
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
    try {
      records.settleDialogueAttempt(turn.attemptId, settled, endSeq, cause);
    } catch {
      // The store refused to record the outcome (it is closing, or the record is damaged): the attempt stays unsettled, and
      // the next start's reconciliation settles it 回答已中断 from the ledger.
    }
  }
}
