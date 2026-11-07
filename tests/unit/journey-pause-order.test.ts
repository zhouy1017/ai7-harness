import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type Scope = { bookId: string; taskIntentId: string; runRecordId: string; unitsSettled: number; currentUnitOrdinal: number };
type Renderer = { evaluate(expression: string): Promise<unknown> };
type WaitFor = (renderer: Renderer, expression: string, name: string, timeout: number) => Promise<void>;
const controller = await import(new URL('../../e2e/controller.mjs', import.meta.url).href) as {
  releaseHeldBaselineAfterPause(renderer: Renderer, scope: Scope, waitFor: WaitFor, release: () => Promise<void>): Promise<void>;
  journeyCheckFailure(journey: string, name: string): Error;
};
// Use the actual Journey wait loop: pending IPC must resolve to a matching service state before the hold is released.
const runner = readFileSync(new URL('../../e2e/run-j10.mjs', import.meta.url), 'utf8');
const source = /async function waitFor\(renderer,[\s\S]*?(?=\nasync function assertRenderer)/u.exec(runner)?.[0];
if (!source) throw new Error('J10 pause regression wait seam missing');
const waitFor = Function('journeyCheckFailure', `return (${source})`)(controller.journeyCheckFailure) as WaitFor;
const scope: Scope = { bookId: 'book', taskIntentId: 'task', runRecordId: 'run', unitsSettled: 4, currentUnitOrdinal: 5 };
const projection = () => ({ bookId: scope.bookId, taskIntent: { taskIntentId: scope.taskIntentId }, run: {
  runRecordId: scope.runRecordId, state: 'pausing', progress: { unitsSettled: 4, currentUnitOrdinal: 5 },
} });
function renderer(read: () => Promise<ReturnType<typeof projection>>): Renderer {
  return { evaluate: async expression => await Function('window', `return (${expression})`)({ ai7: { inspectBaselineAnalysis: read } }) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('keeps the fifth unit held until the exact pause IPC is recorded, then releases once', async () => {
  const reply = Promise.withResolvers<ReturnType<typeof projection>>();
  const requested = Promise.withResolvers<void>();
  const release = vi.fn(async () => {});
  const pending = controller.releaseHeldBaselineAfterPause(renderer(() => { requested.resolve(); return reply.promise; }), scope, waitFor, release);
  await Promise.resolve();
  expect(release).not.toHaveBeenCalled();
  await requested.promise;
  reply.resolve(projection());
  await pending;
  expect(release).toHaveBeenCalledOnce();
});

it.each(['executing', 'paused', 'completed', 'wrong-book', 'wrong-task', 'old-run', 'wrong-count', 'wrong-unit', 'refused'] as const)('does not release for %s', async (failure) => {
  const answer = projection();
  if (failure === 'executing' || failure === 'paused' || failure === 'completed') answer.run.state = failure;
  if (failure === 'wrong-book') answer.bookId = 'another-book';
  if (failure === 'wrong-task') answer.taskIntent.taskIntentId = 'another-task';
  if (failure === 'old-run') answer.run.runRecordId = 'old-run';
  if (failure === 'wrong-count') answer.run.progress.unitsSettled = 5;
  if (failure === 'wrong-unit') answer.run.progress.currentUnitOrdinal = 6;
  const release = vi.fn(async () => {});
  const read = async () => { if (failure === 'refused') throw new Error('synthetic IPC refusal'); return answer; };
  const outcome = controller.releaseHeldBaselineAfterPause(renderer(read), scope, waitFor, release).then(() => false, () => true);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await outcome).toBe(true);
  expect(release).not.toHaveBeenCalled();
});
