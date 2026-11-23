import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

const helpers = await import(new URL('../../e2e/return-arrival.mjs', import.meta.url).href);
const controller = await import(new URL('../../e2e/controller.mjs', import.meta.url).href);
const source = readFileSync(new URL('../../e2e/run-j16.mjs', import.meta.url), 'utf8');
const start = source.indexOf('// The real navigation sets its guard synchronously');
const end = source.indexOf("    await waitForRailMarker(renderer, 'annotation', 'mark-rail-ready');", start);
if (start < 0 || end < start) throw new Error('J16 return action not found');
const run = Function('renderer', 'watchReturnArrival', 'withReturnArrival', 'clickSelector', 'waitFor', 'CHIP', 'blockInView', 'chip', 'at',
  `return(async()=>{${source.slice(start, end)}})()`);

async function scenario(phase: 'click' | 'release' | 'check' | null, cleanupFails: boolean) {
  const primary = phase === 'check' ? controller.journeyCheckFailure('J-16', 'chip-returned') : new Error('return-action-failed');
  const cleanup = new Error('observer-cleanup-failed');
  const events: string[] = [];
  const renderer = { evaluate: vi.fn(async (expression: string) => {
    if (expression.startsWith('globalThis.__j16ReturnArrival = ')) { events.push('armed'); return true; }
    if (expression.includes('__j16ReleaseFrames()')) { events.push('release'); if (phase === 'release') throw primary; return true; }
    if (expression.includes('.disconnect()')) { events.push('cleanup'); if (cleanupFails) throw cleanup; return true; }
    return { present: false, disabled: false, target: true, arrived: false };
  }) };
  const click = async () => { events.push('click'); if (phase === 'click') throw primary; };
  const wait = async () => { events.push('check'); if (phase === 'check') throw primary; };
  let error: unknown;
  try { await run(renderer, helpers.watchReturnArrival, helpers.withReturnArrival, click, wait, 'null', () => 'true', { blockId: 'synthetic-target' }, vi.fn()); }
  catch (caught) { error = caught; }
  return { primary, cleanup, events, error };
}

it.each(['click', 'release'] as const)('disconnects after a %s failure following observer setup', async phase => {
  const result = await scenario(phase, false);
  expect(result.error).toBe(result.primary);
  expect(result.events[0]).toBe('armed');
  expect(result.events.at(-1)).toBe('cleanup');
  expect(result.events.filter(event => event === 'cleanup')).toHaveLength(1);
});

it('preserves the original chip-returned failure when renderer cleanup also rejects', async () => {
  const result = await scenario('check', true);
  expect(result.error).toBe(result.primary);
  expect(controller.journeyCheckLabel(result.error)).toBe('chip-returned');
  expect(result.events.at(-1)).toBe('cleanup');
});

it('keeps cleanup-only failures visible after a successful return check', async () => {
  const result = await scenario(null, true);
  expect(result.error).toBe(result.cleanup);
  expect(result.events).toEqual(['armed', 'click', 'release', 'check', 'cleanup']);
});

it('disconnects exactly once after success', async () => {
  const result = await scenario(null, false);
  expect(result.error).toBeUndefined();
  expect(result.events).toEqual(['armed', 'click', 'release', 'check', 'cleanup']);
});
