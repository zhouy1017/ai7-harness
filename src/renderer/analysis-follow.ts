/**
 * ②A's follow-up reads (Issue #502; Issue #539): while a Run moves by itself, the card reads the analysis again after a
 * delay, of the revision the editor is looking at. One follow-up per card at a time. A draw replaces whatever an earlier
 * draw armed: a read not sent yet is never sent, and one already out draws nothing when it answers and arms nothing
 * after. So the card never jumps back to a revision the editor left, even within one read's round trip.
 */

/** One follow-up read of a card, as its draw made it. */
export interface AnalysisFollowStep<T> {
  /** Whether the card is still there to draw on, and — once an answer came — whether that answer is still its Book's. */
  belongs(next: T | null): boolean;
  /** The read, of the revision the draw showed. */
  read(): Promise<T>;
  /** Whether the answer is what the draw already shows: then nothing is drawn, and the card keeps its place and focus. */
  unchanged(next: T): boolean;
  /** How long until the next read when nothing changed, or `null` to stop following. */
  again(): number | null;
  /** Draw the answer; that draw follows the card from there. */
  draw(next: T): void;
  /** The read or its draw failed while this draw was still the card's. */
  failed(error: unknown): void;
}

export interface AnalysisFollowClock {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export class AnalysisFollower<Host extends object> {
  readonly #clock: AnalysisFollowClock;
  readonly #pending = new WeakMap<Host, number>();
  readonly #draws = new WeakMap<Host, number>();

  constructor(clock: AnalysisFollowClock) {
    this.#clock = clock;
  }

  /** A new draw of `host`: whatever an earlier draw armed follows it no more. Returns the draw's generation. */
  drawn(host: Host): number {
    const pending = this.#pending.get(host);
    if (pending !== undefined) {
      this.#clock.clearTimeout(pending);
      this.#pending.delete(host);
    }
    const generation = (this.#draws.get(host) ?? 0) + 1;
    this.#draws.set(host, generation);
    return generation;
  }

  /** Whether `generation` is still `host`'s latest draw. */
  current(host: Host, generation: number): boolean {
    return this.#draws.get(host) === generation;
  }

  /** Read again after `delayMs` for draw `generation` of `host`, unless a newer draw comes first. */
  later<T>(host: Host, generation: number, delayMs: number, step: AnalysisFollowStep<T>): void {
    if (!this.current(host, generation)) return;
    const pending = this.#pending.get(host);
    if (pending !== undefined) this.#clock.clearTimeout(pending);
    this.#pending.set(host, this.#clock.setTimeout(() => {
      this.#pending.delete(host);
      void this.#follow(host, generation, step);
    }, delayMs));
  }

  async #follow<T>(host: Host, generation: number, step: AnalysisFollowStep<T>): Promise<void> {
    if (!this.current(host, generation) || !step.belongs(null)) return;
    try {
      const next = await step.read();
      // A newer draw came while the read was out: that draw follows the card now, and this answer is not drawn.
      if (!this.current(host, generation) || !step.belongs(next)) return;
      if (step.unchanged(next)) {
        const again = step.again();
        if (again !== null) this.later(host, generation, again, step);
        return;
      }
      step.draw(next);
    } catch (error) {
      if (this.current(host, generation) && step.belongs(null)) step.failed(error);
    }
  }
}
