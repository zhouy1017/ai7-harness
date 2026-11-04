import { describe, expect, it, vi } from 'vitest';
import { enqueueQuickTasks } from '../../src/main/task-overview-quick-start.js';
import type { ServiceClient } from '../../src/main/service-client.js';

describe('task overview cooperative enqueue', () => {
  it('releases the effect lane while preparation is pending, then authorizes the exact prepared plan', async () => {
    let finish!: (value: unknown) => void;
    const polled = new Promise((resolve) => { finish = resolve; });
    const call = vi.fn(async (operation: string) => {
      if (operation === 'startQuickTasks') return { kind: 'baseline-analysis', ruleVersionId: null, job: { jobId: 'job', state: 'queued' } };
      if (operation === 'pollServiceJob') return polled;
      if (operation === 'inspectTaskPlan') return { ref: 'new-task', start: { readiness: 'ready', planEnvelopeDigest: 'exact-envelope' } };
      if (operation === 'inspectTaskOverview') return { groups: [] };
      return {};
    });
    let lane = Promise.resolve();
    const effect = <T>(operation: () => Promise<T>): Promise<T> => { const result = lane.then(operation); lane = result.then(() => {}); return result; };
    const queued = enqueueQuickTasks({ call } as unknown as Pick<ServiceClient, 'call'>, { tasks: [{ bookId: 'book', procedureId: 'baseline-analysis' }] }, effect);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const otherWindowRead = vi.fn(async () => {}); await effect(otherWindowRead);
    expect(otherWindowRead).toHaveBeenCalledOnce(); expect(call).not.toHaveBeenCalledWith('authorizeBaselineAnalysis', expect.anything());
    finish({ jobId: 'job', state: 'completed', result: null }); await queued;
    expect(call).toHaveBeenCalledWith('authorizeBaselineAnalysis', { bookId: 'book', taskIntentId: 'new-task', planEnvelopeDigest: 'exact-envelope' });
  });
});
