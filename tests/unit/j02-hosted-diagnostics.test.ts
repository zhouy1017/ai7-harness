import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Issue #1400: hosted Full Gate 42453142157 failed J-02 at structure-rapid-queue/structure-burst-durable, and the hosted line
// could not say which of the burst's four conditions was unmet. J-02 runs as it is imported, so its wait and its words are
// read from its source and run here against a renderer that answers as the product would.
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const controller = (await import(new URL('../../e2e/controller.mjs', import.meta.url).href)) as {
  journeyCheckFailure(journey: string, check: string, options?: object): Error;
  journeyCheckLabel(error: unknown): string | null;
  isContentFreeCheckLabel(label: unknown): boolean;
};

const source = readFileSync(resolve(ROOT, 'e2e', 'run-j02.mjs'), 'utf8').replace(/\r\n/gu, '\n');
const start = source.indexOf('async function waitForChecks(');
const end = source.indexOf('\n}\n', source.indexOf('function burstWords(')) + 3;
const helpers = new Function('journeyCheckFailure', `${source.slice(start, end)}\nreturn { waitForChecks, burstWords };`)(
  controller.journeyCheckFailure,
) as {
  waitForChecks(renderer: unknown, expression: string, location: string, timeout?: number, words?: 'none' | 'burst'): Promise<void>;
  burstWords(observed: unknown): string;
};

type Observed = { text: string; delta: number | null; risk: string; bounded: boolean };
/** The burst's answer: its four checks from the observation, as the runner's expression computes them. */
const answer = (observed: Observed) => ({
  whole: observed.text === 'whole', ordered: observed.delta === 8, settled: observed.risk === 'false', bounded: observed.bounded, _observed: observed,
});

async function labelAfter(observed: Observed | null): Promise<string | null> {
  const renderer = { evaluate: async () => (observed === null ? null : answer(observed)) };
  return helpers.waitForChecks(renderer, 'burst', 'structure-burst-durable', 120, 'burst')
    .then(() => null, (error: unknown) => controller.journeyCheckLabel(error));
}

describe('J-02 names which burst condition was unmet when its one budget ran out (#1400)', () => {
  it('waits on the same four conditions, the same 8 keys and one 60 s budget', () => {
    expect(source).toContain("for (const key of ['Enter','Enter','Enter','Enter','Backspace','Backspace','Backspace','Backspace'])");
    expect(source).toContain("'structure-burst-durable', 60_000, 'burst');");
    expect(source).toMatch(/return \{ whole, ordered: p\.journal === window\.__j02BurstSequence \+ 8, settled: p\.closeRisk === 'false', bounded,/u);
  });

  it('returns quietly once every condition holds, the observation never counted as a check', async () => {
    const renderer = { evaluate: async () => answer({ text: 'whole', delta: 8, risk: 'false', bounded: true }) };
    await expect(helpers.waitForChecks(renderer, 'burst', 'structure-burst-durable', 120, 'burst')).resolves.toBeUndefined();
  });

  it('still fails, and says how far the journal got and whether a write was pending', async () => {
    expect(await labelAfter({ text: 'whole', delta: 3, risk: 'true', bounded: true }))
      .toBe('structure-burst-durable-whole-journal-3of8-pending-bounded');
    expect(await labelAfter({ text: 'changed', delta: 0, risk: 'true', bounded: true }))
      .toBe('structure-burst-durable-changed-journal-none-pending-bounded');
    expect(await labelAfter({ text: 'whole', delta: 9, risk: 'false', bounded: false }))
      .toBe('structure-burst-durable-whole-journal-extra-saved-unbounded');
    expect(await labelAfter({ text: 'absent', delta: 8, risk: 'false', bounded: true }))
      .toBe('structure-burst-durable-absent-journal-all-saved-bounded');
  });

  it('keeps every word to a closed set, whatever the page answered, and says when nothing was read', async () => {
    expect(helpers.burstWords({ text: '稿件', delta: 2.5, risk: 'maybe', bounded: 'yes' })).toBe('unread-journal-unread-unread-unread');
    expect(helpers.burstWords({ text: 'whole', delta: -1, risk: 'true', bounded: true })).toBe('whole-journal-behind-pending-bounded');
    expect(helpers.burstWords(null)).toBe('unread');
    expect(await labelAfter(null)).toBe('structure-burst-durable-unread');
  });

  it('leaves every other wait labelled as before', async () => {
    const renderer = { evaluate: async () => ({ shown: false }) };
    const label = await helpers.waitForChecks(renderer, 'other', 'structure-split-shown', 60)
      .then(() => null, (error: unknown) => controller.journeyCheckLabel(error));
    expect(label).toBe('structure-split-shown');
  });

  it('fits the content-free check shape at its longest', () => {
    const words = ['whole', 'changed', 'absent'].flatMap((text) => [0, 1, 7, 8, 9, -1].flatMap((delta) =>
      ['true', 'false'].flatMap((risk) => [true, false].map((bounded) => helpers.burstWords({ text, delta, risk, bounded })))));
    for (const word of words) expect(controller.isContentFreeCheckLabel(`structure-burst-durable-${word}`), word).toBe(true);
  });

  it('distinguishes an undispatched write, an outstanding IPC and an unreflected acknowledgement', () => {
    const state = { text: 'whole', delta: 7, risk: 'true', bounded: true };
    for (const [writes, expected] of [
      [{ invoked: 7, returned: 7, failed: 0 }, 'not-dispatched'],
      [{ invoked: 8, returned: 7, failed: 0 }, 'awaiting-ack'],
      [{ invoked: 8, returned: 8, failed: 0 }, 'ack-received'],
      [{ invoked: 8, returned: 7, failed: 1 }, 'write-error'],
    ]) {
      const label = `structure-burst-durable-${helpers.burstWords({ ...state, writes })}`;
      expect(label).toBe(`structure-burst-durable-whole-journal-7of8-pending-bounded-${expected}`);
      expect(controller.isContentFreeCheckLabel(label)).toBe(true);
    }
  });
});
