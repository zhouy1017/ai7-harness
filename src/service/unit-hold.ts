import { readFileSync } from 'node:fs';
import type { UnitHold } from './analysis/execution.js';

/**
 * J-10's unit hold (`--j10-unit-hold-path`, Issue #422, plan slice S76a): the file the Journey writes names how many
 * units may settle, and a unit whose turn has come back waits, in flight, until one more may. The Journey writes the
 * number before the Run starts, cancels with a unit held, and writes the next number to let that unit finish — which
 * is how it watches 正在取消 hold until the unit in flight is done.
 *
 * Read at each look. A file that is absent or names no count holds nothing, so a launch the Journey never wrote to
 * runs as any other. Every wait is bounded: after `limitMs` the unit settles anyway, so a Journey that stopped writing
 * leaves a Run that ends rather than one that hangs, and an interruption ends the wait at once.
 */
export function controlledUnitHold(path: string, options: { pollMs?: number; limitMs?: number } = {}): UnitHold {
  const pollMs = options.pollMs ?? 100;
  const limitMs = options.limitMs ?? 120_000;
  const allowed = (): number => {
    try {
      const text = readFileSync(path, 'utf8').trim();
      return /^\d{1,4}$/u.test(text) ? Number(text) : Number.POSITIVE_INFINITY;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  return async (unitsSettled, interrupted) => {
    const until = Date.now() + limitMs;
    while (allowed() <= unitsSettled && !interrupted() && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  };
}
