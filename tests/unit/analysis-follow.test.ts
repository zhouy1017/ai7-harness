import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisFollower, type AnalysisFollowStep } from '../../src/renderer/analysis-follow.js';

// ②A's follow-up reads (Issue #502; Issue #539), on fake timers: the card is a plain object, and each read answers when the
// case says so. What the card draws is recorded, not rendered.

interface Answer { bookId: string; revision: number }

let follower: AnalysisFollower<object>;

beforeEach(() => {
  vi.useFakeTimers();
  follower = new AnalysisFollower<object>({
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as number,
    clearTimeout: (handle) => clearTimeout(handle),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** A draw of `shown` on `host`: its follow-up step, recording what it reads and draws. */
function drawOf(host: object, shown: Answer, answers: Array<() => Promise<Answer>>, log: { reads: number; drawn: Answer[]; failed: unknown[] }) {
  const generation = follower.drawn(host);
  const step: AnalysisFollowStep<Answer> = {
    belongs: (next) => next === null || next.bookId === shown.bookId,
    read: () => {
      log.reads += 1;
      return (answers.shift() ?? (() => Promise.resolve(shown)))();
    },
    unchanged: (next) => next.revision === shown.revision,
    again: () => 2_000,
    draw: (next) => { log.drawn.push(next); },
    failed: (error) => { log.failed.push(error); },
  };
  return { generation, later: (delayMs: number) => follower.later(host, generation, delayMs, step) };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

describe('②A follows one draw at a time', () => {
  it('reads again after the delay, draws a changed answer, and follows an unchanged one again', async () => {
    const host = {};
    const log = { reads: 0, drawn: [] as Answer[], failed: [] as unknown[] };
    drawOf(host, { bookId: 'b', revision: 4 }, [async () => ({ bookId: 'b', revision: 4 }), async () => ({ bookId: 'b', revision: 5 })], log).later(250);
    await vi.advanceTimersByTimeAsync(249);
    expect(log.reads).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect([log.reads, log.drawn]).toEqual([1, []]);
    // Unchanged: nothing is drawn, and the next read comes at the state's delay.
    await vi.advanceTimersByTimeAsync(2_000);
    expect([log.reads, log.drawn]).toEqual([2, [{ bookId: 'b', revision: 5 }]]);
  });

  it('never sends a follow-up an earlier draw armed once the card is drawn again', async () => {
    const host = {};
    const left = { reads: 0, drawn: [] as Answer[], failed: [] as unknown[] };
    drawOf(host, { bookId: 'b', revision: 5 }, [], left).later(2_000);
    // The editor leaves revision 5 (取消 draws the latest): the new draw arms nothing, as a state that does not move.
    drawOf(host, { bookId: 'b', revision: 7 }, [], { reads: 0, drawn: [], failed: [] });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(left.reads).toBe(0);
  });

  it('draws nothing from a read already out when the card is drawn again, and arms nothing after it', async () => {
    const host = {};
    const out = deferred<Answer>();
    const left = { reads: 0, drawn: [] as Answer[], failed: [] as unknown[] };
    drawOf(host, { bookId: 'b', revision: 5 }, [() => out.promise], left).later(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(left.reads).toBe(1);
    // While that read is out, the editor goes back to the latest revision, whose draw follows the Run itself.
    const latest = { reads: 0, drawn: [] as Answer[], failed: [] as unknown[] };
    drawOf(host, { bookId: 'b', revision: 7 }, [], latest).later(2_000);
    // The old read answers unchanged: it re-arms nothing, so the new draw's follow-up stands alone and runs on time.
    out.resolve({ bookId: 'b', revision: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(left.drawn).toEqual([]);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(latest.reads).toBe(1);
    expect(left.reads).toBe(1);
  });

  it('draws nothing from a changed answer that comes after the card was drawn again', async () => {
    const host = {};
    const out = deferred<Answer>();
    const left = { reads: 0, drawn: [] as Answer[], failed: [] as unknown[] };
    drawOf(host, { bookId: 'b', revision: 5 }, [() => out.promise], left).later(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    drawOf(host, { bookId: 'b', revision: 7 }, [], { reads: 0, drawn: [], failed: [] });
    out.resolve({ bookId: 'b', revision: 6 });
    await vi.advanceTimersByTimeAsync(0);
    expect(left.drawn).toEqual([]);
  });

  it('says a draw that fails, though the draw began the card\'s next draw before it failed (Issue #551)', async () => {
    const host = {};
    const failed: unknown[] = [];
    const generation = follower.drawn(host);
    follower.later(host, generation, 250, {
      belongs: () => true,
      read: async () => ({ bookId: 'b', revision: 6 }),
      unchanged: () => false,
      again: () => 2_000,
      // As ②A's own draw does: it starts the card's next draw, then fails.
      draw: () => {
        follower.drawn(host);
        throw new Error('draw failed');
      },
      failed: (error) => { failed.push(error); },
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(failed).toHaveLength(1);
  });

  it('says a failed read only while its draw is still the card\'s, and follows another Book\'s card by its own draws', async () => {
    const host = {};
    const other = {};
    const failing = deferred<Answer>();
    const log = { reads: 0, drawn: [] as Answer[], failed: [] as unknown[] };
    drawOf(host, { bookId: 'b', revision: 5 }, [async () => { throw new Error('read failed'); }], log).later(250);
    await vi.advanceTimersByTimeAsync(250);
    expect(log.failed).toHaveLength(1);
    const stale = { reads: 0, drawn: [] as Answer[], failed: [] as unknown[] };
    drawOf(host, { bookId: 'b', revision: 5 }, [() => failing.promise.then(() => { throw new Error('late failure'); })], stale).later(250);
    await vi.advanceTimersByTimeAsync(250);
    drawOf(host, { bookId: 'b', revision: 7 }, [], { reads: 0, drawn: [], failed: [] });
    failing.resolve({ bookId: 'b', revision: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(stale.failed).toEqual([]);
    // A draw on another card replaces nothing here.
    const mine = { reads: 0, drawn: [] as Answer[], failed: [] as unknown[] };
    drawOf(host, { bookId: 'b', revision: 7 }, [], mine).later(250);
    drawOf(other, { bookId: 'c', revision: 1 }, [], { reads: 0, drawn: [], failed: [] });
    await vi.advanceTimersByTimeAsync(250);
    expect(mine.reads).toBe(1);
  });
});
