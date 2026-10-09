import type { LaunchPolicyProjection } from '../shared/protocol.js';
import { BACKGROUND_ANALYSIS_QUIET_MS, BACKGROUND_ANALYSIS_TICK_MS, backgroundStepFailureReason } from './background-analysis-enrollments.js';
import type { BackgroundAnalysisRuntime, EditorialStore } from './store.js';
import type { BaselineAnalysisExecutionOwner } from './analysis/execution.js';

/**
 * The 后台分析登记 dispatcher (Issue #95, plan slice S39; ADR 0048; ADR 0046): the one place AI7 starts an analysis by itself. It
 * looks at every enrolled Book, one Book after another, every few seconds and whenever something may have changed what an
 * Enrollment would do. For each it asks the store what the Enrollment would do now, and only when every condition holds does it
 * prepare a Task of its own exactly as 先看计划 prepares one and start it as 开始任务 would, its Run Authorization naming the
 * enrollment version, through the governor.
 *
 * It never steps in beside the editor (the Commander's ruling on #713): it acts only while no preparation of the Book is under
 * way and no job the editor asked for runs; it never takes up a Task Intent but its own; any preparation the editor starts stops
 * its own; and before every step of its preparation it asks again whether it may go on, so the step that freezes the plan and
 * the start that follows it in the same turn are never taken once the Enrollment was revoked, the local data is to be replaced,
 * the manuscript was edited, or no place is left for it. A step that fails cancels its preparation and the checkpoint with it,
 * so a Book is never left holding either. Nothing waits in a queue of its own: a Book it cannot start now is looked at again on
 * the next pass.
 */
export interface BackgroundAnalysisDispatcherDependencies {
  readonly store: Pick<EditorialStore,
    'backgroundAnalysisBooks' | 'backgroundAnalysisDecisionFor' | 'createBackgroundBaselineAnalysisPreparationWork' |
    'advanceBaselineAnalysisPreparationWork' | 'cancelBaselineAnalysisPreparationWork' | 'backgroundMayContinue' |
    'startEnrolledBaselineAnalysis' | 'noteBackgroundNotStarted' | 'replacementFrozen'>;
  readonly execution: Pick<BaselineAnalysisExecutionOwner, 'busy' | 'routeExecutable' | 'admitOrQueue' | 'capacity'>;
  /** Whether a job the editor asked for is queued or under way: the dispatcher never steps in beside one. */
  readonly editorWorkBusy?: () => boolean;
  readonly launchPolicy: LaunchPolicyProjection;
  readonly tickMs?: number;
  readonly quietMs?: number;
  readonly now?: () => number;
  /** Yields to the event loop between two preparation steps, so the editor's requests are served meanwhile. */
  readonly yieldStep?: () => Promise<void>;
}

export class BackgroundAnalysisDispatcher {
  readonly #deps: BackgroundAnalysisDispatcherDependencies;
  readonly #quietMs: number;
  #timer: NodeJS.Timeout | null = null;
  #pass: Promise<void> | null = null;
  #running = false;
  #again = false;
  #disposed = false;

  constructor(deps: BackgroundAnalysisDispatcherDependencies) {
    this.#deps = deps;
    this.#quietMs = deps.quietMs ?? BACKGROUND_ANALYSIS_QUIET_MS;
  }

  /** The facts the store weighs beside its own records: this launch's route, the governor's places, the editor's jobs, the clock. */
  runtime(): BackgroundAnalysisRuntime {
    return {
      routeExecutable: this.#deps.execution.routeExecutable,
      placeFree: !this.#deps.execution.busy,
      capacity: this.#deps.execution.capacity,
      editorWorkBusy: this.#deps.editorWorkBusy?.() ?? false,
      now: (this.#deps.now ?? Date.now)(),
      quietMs: this.#quietMs,
    };
  }

  /** Whether a pass is under way: a replacement of the local data is not prepared beside one (#713 review, P2-3). */
  get busy(): boolean {
    return this.#running;
  }

  /** Looks now, then every tick while the service runs. */
  start(): void {
    if (this.#disposed || this.#timer !== null) return;
    this.#timer = setInterval(() => this.nudge(), this.#deps.tickMs ?? BACKGROUND_ANALYSIS_TICK_MS);
    this.#timer.unref();
    this.nudge();
  }

  /** One more pass, after the one under way if there is one; never two at once. */
  nudge(): void {
    if (this.#disposed) return;
    // Marked before the pass begins: a nudge made while its first steps run, before it has yielded once, is the next pass's.
    if (this.#running) {
      this.#again = true;
      return;
    }
    this.#running = true;
    this.#pass = this.#run().finally(() => {
      this.#running = false;
      this.#pass = null;
    });
  }

  /** The pass under way, if any — for a caller that must see its effects. */
  async settled(): Promise<void> {
    while (this.#pass !== null) await this.#pass;
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    await this.#pass;
  }

  async #run(): Promise<void> {
    do {
      this.#again = false;
      let books: ReadonlyArray<string>;
      try {
        // Nothing starts while a replacement of the local data waits: what it wrote would be lost with the data.
        if (this.#deps.store.replacementFrozen()) return;
        books = this.#deps.store.backgroundAnalysisBooks();
      } catch {
        return;
      }
      for (const bookId of books) {
        if (this.#disposed) return;
        try {
          await this.#consider(bookId);
        } catch {
          // A Book whose look or start failed is looked at again on the next pass; its records say what was recorded.
        }
      }
    } while (this.#again && !this.#disposed);
  }

  async #consider(bookId: string): Promise<void> {
    const store = this.#deps.store;
    const { decision, enrollmentVersionId } = store.backgroundAnalysisDecisionFor(bookId, this.runtime());
    if (decision.kind !== 'start' || enrollmentVersionId === null) return;
    const mode = decision.mode;
    const before = store.backgroundMayContinue(bookId, enrollmentVersionId, null, this.runtime());
    if (before !== null) {
      store.noteBackgroundNotStarted(bookId, before, this.runtime().now);
      return;
    }
    let work: ReturnType<typeof store.createBackgroundBaselineAnalysisPreparationWork> | null = null;
    try {
      // Nothing durable is written until the plan freezes: a preparation that stops — or never begins, refused here — leaves no
      // Task Intent behind (#713 re-review, P2-1).
      work = store.createBackgroundBaselineAnalysisPreparationWork(bookId, mode, enrollmentVersionId, this.#deps.launchPolicy);
      while (!work.done) {
        await (this.#deps.yieldStep ?? yieldToEventLoop)();
        const workId = work.workId;
        if (workId === null) return;
        const stop = this.#disposed ? '本地业务服务正在停止。' : store.backgroundMayContinue(bookId, enrollmentVersionId, workId, this.runtime());
        if (stop !== null) {
          store.cancelBaselineAnalysisPreparationWork(workId);
          if (!this.#disposed) store.noteBackgroundNotStarted(bookId, stop, this.runtime().now);
          return;
        }
        work = store.advanceBaselineAnalysisPreparationWork(workId);
      }
    } catch (error) {
      // A step that failed — the manuscript moved under the checkpoint, another checkpoint took the branch — leaves nothing
      // behind: the preparation and its checkpoint are cancelled, so neither the editor nor the next pass finds them (P1-1), and
      // ②A says why.
      if (work !== null && work.workId !== null) store.cancelBaselineAnalysisPreparationWork(work.workId);
      if (!this.#disposed) store.noteBackgroundNotStarted(bookId, backgroundStepFailureReason(error), this.runtime().now);
      return;
    }
    const prepared = work.projection;
    if (this.#disposed || prepared === null || prepared.taskIntent === null || prepared.planEnvelope === null) return;
    // In the same turn as the step that froze the plan: nothing the editor does can come between them.
    const started = store.startEnrolledBaselineAnalysis(bookId, prepared.taskIntent.taskIntentId, prepared.planEnvelope.digest,
      enrollmentVersionId, mode, this.runtime());
    // Admitted at once: the place it was asked for before the last step is still free in this turn, so it never queues.
    if (started.dispatchRunRecordId !== null) this.#deps.execution.admitOrQueue(started.dispatchRunRecordId);
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolveYield) => setImmediate(resolveYield));
}
