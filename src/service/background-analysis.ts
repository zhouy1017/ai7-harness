import { BASELINE_ANALYSIS_MODE_GOALS, type LaunchPolicyProjection } from '../shared/protocol.js';
import { BACKGROUND_ANALYSIS_QUIET_MS, BACKGROUND_ANALYSIS_TICK_MS } from './background-analysis-enrollments.js';
import type { BackgroundAnalysisRuntime, EditorialStore } from './store.js';
import type { BaselineAnalysisExecutionOwner } from './analysis/execution.js';

/**
 * The 后台分析登记 dispatcher (Issue #95, plan slice S39; ADR 0048; ADR 0046): the one place AI7 starts an analysis by itself. It
 * looks at every Book's Enrollment in force, one Book after another, every few seconds and whenever something may have changed
 * what an Enrollment would do — an Enrollment made, a Run leaving its place. For each it asks the store what the Enrollment
 * would do now, and only when every condition holds does it prepare the Task exactly as 先看计划 prepares it and start it as
 * 开始任务 would, its Run Authorization naming the enrollment version, through the governor. Nothing waits in a queue of its
 * own: a Book the dispatcher cannot start now is looked at again on the next pass. It never runs under developer-live, never
 * while a replacement of the local data waits, and never without a route this launch can execute.
 */
export interface BackgroundAnalysisDispatcherDependencies {
  readonly store: Pick<EditorialStore,
    'backgroundAnalysisBooks' | 'backgroundAnalysisDecisionFor' | 'createBaselineAnalysisPreparationWork' |
    'advanceBaselineAnalysisPreparationWork' | 'cancelBaselineAnalysisPreparationWork' | 'startEnrolledBaselineAnalysis' | 'replacementFrozen'>;
  readonly execution: Pick<BaselineAnalysisExecutionOwner, 'busy' | 'routeExecutable' | 'admitOrQueue'>;
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

  /** The facts the store weighs beside its own records: this launch's route, the governor's places, and the clock. */
  runtime(): BackgroundAnalysisRuntime {
    return {
      routeExecutable: this.#deps.execution.routeExecutable,
      placeFree: !this.#deps.execution.busy,
      now: (this.#deps.now ?? Date.now)(),
      quietMs: this.#quietMs,
    };
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
          // A Book whose start failed is looked at again on the next pass; its records say what was recorded.
        }
      }
    } while (this.#again && !this.#disposed);
  }

  async #consider(bookId: string): Promise<void> {
    const { decision, enrollmentVersionId } = this.#deps.store.backgroundAnalysisDecisionFor(bookId, this.runtime());
    if (decision.kind !== 'start' || enrollmentVersionId === null) return;
    const mode = decision.mode;
    const store = this.#deps.store;
    let work = store.createBaselineAnalysisPreparationWork(
      bookId,
      BASELINE_ANALYSIS_MODE_GOALS[mode],
      mode === 'first-baseline' ? null : { mode: 'sync-current', selectedRange: null },
      this.#deps.launchPolicy,
    );
    while (!work.done) {
      await (this.#deps.yieldStep ?? yieldToEventLoop)();
      if (this.#disposed || work.workId === null) {
        if (work.workId !== null) store.cancelBaselineAnalysisPreparationWork(work.workId);
        return;
      }
      work = store.advanceBaselineAnalysisPreparationWork(work.workId);
    }
    const prepared = work.projection;
    if (this.#disposed || prepared === null || prepared.taskIntent === null || prepared.planEnvelope === null) return;
    const started = store.startEnrolledBaselineAnalysis(bookId, prepared.taskIntent.taskIntentId, prepared.planEnvelope.digest,
      enrollmentVersionId, mode, this.runtime());
    // Through the governor as 开始任务's start goes: admitted at once while a place is free — it was when the pass began — or
    // waiting for one if the editor took it meanwhile; one this launch cannot admit is blocked before dispatch with the reason.
    if (started.dispatchRunRecordId !== null) this.#deps.execution.admitOrQueue(started.dispatchRunRecordId);
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolveYield) => setImmediate(resolveYield));
}
