import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { controlledUnitHold } from '../../src/service/unit-hold.js';

// J-10's unit hold (Issue #422, plan slice S76a): the number the Journey writes is how many units may settle; a unit
// whose turn is back waits for the next number, an interruption ends the wait, and every wait is bounded.

let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ai7-unit-hold-'));
  path = join(directory, 'hold.txt');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Whether `wait` is still pending after a few polls. */
async function pending(wait: Promise<void>): Promise<boolean> {
  const marker = Symbol('pending');
  const winner = await Promise.race([wait.then(() => 'settled' as const), new Promise((resolve) => setTimeout(() => resolve(marker), 40))]);
  return winner === marker;
}

describe('controlledUnitHold', () => {
  it('holds nothing while the file is absent or names no count', async () => {
    const hold = controlledUnitHold(path, { pollMs: 5 });
    await expect(hold(5, () => false)).resolves.toBeUndefined();
    writeFileSync(path, 'release');
    await expect(hold(5, () => false)).resolves.toBeUndefined();
  });

  it('lets units settle up to the number, holds the next one in flight, and lets it go once the number moves', async () => {
    writeFileSync(path, '2');
    const hold = controlledUnitHold(path, { pollMs: 5 });
    await expect(hold(0, () => false)).resolves.toBeUndefined();
    await expect(hold(1, () => false)).resolves.toBeUndefined();
    const third = hold(2, () => false);
    expect(await pending(third)).toBe(true);
    writeFileSync(path, '3');
    await expect(third).resolves.toBeUndefined();
  });

  it('never keeps an interrupted Run, and gives up on a Journey that stopped writing', async () => {
    writeFileSync(path, '0');
    let interrupted = false;
    const held = controlledUnitHold(path, { pollMs: 5 })(0, () => interrupted);
    expect(await pending(held)).toBe(true);
    interrupted = true;
    await expect(held).resolves.toBeUndefined();
    const started = Date.now();
    await controlledUnitHold(path, { pollMs: 5, limitMs: 60 })(0, () => false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });
});
