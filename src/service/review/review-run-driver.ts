import type { BaselineAnalysisStore } from '../analysis/baseline-analysis-store.js';
import type { ReviewRunDriveStep, ReviewRunHandOff } from './review-runs.js';

/**
 * The drive loop of a Review Run (Issue #417, plan slice S69; B1, B2; V2-UX-REV-008).
 *
 * An approved Run's categories are executed one after another through the one execution owner, each taking
 * a place of its governor (Issue #49, S14): a category's Task is authorized on its own ledger only when its
 * turn comes and a place is free, handed to the owner at once, awaited, and its findings written to the
 * manuscript before the next
 * category starts, so a finished category is actionable while the Run goes on. The leads of 情节逻辑与
 * 前后一致 need no Task and are written at their turn. A failure of one category never stops the
 * others.
 *
 * The loop holds no fact of its own. Every step asks the store what one category needs next and the
 * store answers from the records alone — the category's events and its ledger Run — so a loop lost to
 * a restart is resumed by 继续审阅 exactly where it stopped: a category never started starts, one whose
 * Run finished is settled from that Run's record, one settled and not written is written, and one whose
 * Run the stopped service left executing is recorded interrupted.
 *
 * The service entry constructs it beside the owner. On shutdown it must stop the driver before the
 * owner: `const stopped = driver.dispose(); await owner.dispose(); await stopped;` — the driver then
 * starts no further category, the owner interrupts the one in flight, and the driver records that.
 */
export interface ReviewRunDriveSteps {
  /** Take an approved Run for this lifetime; returns its categories in position order. */
  begin(reviewRunId: string): ReadonlyArray<string>;
  end(reviewRunId: string): void;
  step(reviewRunId: string, categoryId: string): ReviewRunDriveStep;
  /** The category's ledger authorization; `null` when the ledger refused it or it cannot be dispatched, which the store records. */
  start(reviewRunId: string, categoryId: string): ReviewRunHandOff | null;
  recordDispatch(reviewRunId: string, categoryId: string, runRecordId: string): void;
  refuseDispatch(reviewRunId: string, categoryId: string, runRecordId: string, code: string, message: string): void;
  settle(reviewRunId: string, categoryId: string): void;
  write(reviewRunId: string, categoryId: string): void;
  fail(reviewRunId: string, categoryId: string, code: string, message: string): void;
}

/**
 * The part of the one execution owner the loop uses (Issue #49, S14): admission into one of its governor's places, the
 * signal that one is free, and the end of the category Run it handed over.
 */
export interface ReviewRunExecutionOwner {
  admitAndDispatch(runRecordId: string, ledger: BaselineAnalysisStore): void;
  whenPlaceFree(): Promise<void>;
  whenDone(runRecordId: string): Promise<void>;
}

function codeOf(error: unknown): string {
  return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'REVIEW_STEP_FAILED';
}

function messageOf(error: unknown): string {
  // Only a coded refusal's message is one the product wrote for an editor; anything else is not.
  return error instanceof Error && 'code' in error && error.message.length > 0 ? error.message : '审阅步骤意外失败。';
}

export class ReviewRunDriver {
  readonly #steps: ReviewRunDriveSteps;
  readonly #owner: ReviewRunExecutionOwner;
  readonly #loops = new Map<string, Promise<void>>();
  #stopping = false;

  constructor(steps: ReviewRunDriveSteps, owner: ReviewRunExecutionOwner) {
    this.#steps = steps;
    this.#owner = owner;
  }

  /**
   * Drive an approved Run: every category without a terminal event, in position order. The Run is
   * taken synchronously — a projection read right after this call reads it `running` — and the
   * returned promise settles when the loop ends. Driving a Run already driven returns its loop.
   */
  drive(reviewRunId: string): Promise<void> {
    const existing = this.#loops.get(reviewRunId);
    if (existing !== undefined) return existing;
    if (this.#stopping) return Promise.resolve();
    const categoryIds = this.#steps.begin(reviewRunId);
    const loop = this.#run(reviewRunId, categoryIds).finally(() => {
      this.#loops.delete(reviewRunId);
      try {
        this.#steps.end(reviewRunId);
      } catch {
        // The store is closing or poisoned; nothing is driven once it is.
      }
    });
    this.#loops.set(reviewRunId, loop);
    return loop;
  }

  /**
   * 继续审阅 (B2): drive a Run that stopped with categories never finished — after a restart, or after
   * the loop gave up because the store could record nothing more. It is the same loop; the records
   * already say where each category stands.
   */
  continue(reviewRunId: string): Promise<void> {
    return this.drive(reviewRunId);
  }

  isDriving(reviewRunId: string): boolean {
    return this.#loops.has(reviewRunId);
  }

  /** Whether any Review Run is being driven now. */
  get driving(): boolean {
    return this.#loops.size > 0;
  }

  /** Start no further category or step; resolves once every loop has ended. */
  async dispose(): Promise<void> {
    this.#stopping = true;
    await Promise.allSettled(Array.from(this.#loops.values()));
  }

  async #run(reviewRunId: string, categoryIds: ReadonlyArray<string>): Promise<void> {
    for (const categoryId of categoryIds) {
      if (this.#stopping) return;
      try {
        await this.#category(reviewRunId, categoryId);
      } catch (error) {
        try {
          this.#steps.fail(reviewRunId, categoryId, codeOf(error), messageOf(error));
        } catch {
          // Nothing more can be recorded: stop here, and the Run reads `partial` with 继续审阅.
          return;
        }
      }
    }
  }

  /**
   * One category to its end. Stopping refuses only new work — no category Run is authorized or handed
   * over once the service is stopping — while what a Run already came to is still recorded and written:
   * a Run the owner interrupted is settled as interrupted, and one that completed is put on the
   * manuscript, which is the manuscript's own quick write and loses nothing a restart would redo.
   */
  async #category(reviewRunId: string, categoryId: string): Promise<void> {
    for (;;) {
      const step = this.#steps.step(reviewRunId, categoryId);
      switch (step.kind) {
        case 'done':
          return;
        case 'write':
          this.#steps.write(reviewRunId, categoryId);
          break;
        case 'settle':
          this.#steps.settle(reviewRunId, categoryId);
          break;
        case 'start': {
          if (this.#stopping) return;
          // A place first, then the ledger's authorization: while other Runs hold every place the category waits,
          // and the authorization is written only once it can be handed over at once.
          await this.#owner.whenPlaceFree();
          if (this.#stopping) return;
          const handOff = this.#steps.start(reviewRunId, categoryId);
          if (handOff !== null) await this.#dispatch(reviewRunId, categoryId, handOff);
          break;
        }
        case 'dispatch':
          if (this.#stopping) return;
          await this.#owner.whenPlaceFree();
          if (this.#stopping) return;
          await this.#dispatch(reviewRunId, categoryId, step);
          break;
      }
    }
  }

  async #dispatch(reviewRunId: string, categoryId: string, handOff: ReviewRunHandOff): Promise<void> {
    try {
      this.#owner.admitAndDispatch(handOff.runRecordId, handOff.ledger);
    } catch (error) {
      const code = codeOf(error);
      // The last place was taken between the wait and the hand-off: the next step waits again and dispatches.
      if (code === 'EXECUTION_BUSY') return;
      this.#steps.refuseDispatch(reviewRunId, categoryId, handOff.runRecordId, code, messageOf(error));
      if (code === 'EXECUTION_STOPPING') this.#stopping = true;
      return;
    }
    try {
      this.#steps.recordDispatch(reviewRunId, categoryId, handOff.runRecordId);
    } catch {
      // The Run is executing whether or not its dispatch was recorded; the next step settles it from its
      // own ledger record once it has ended.
    }
    await this.#owner.whenDone(handOff.runRecordId);
  }
}
