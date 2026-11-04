import { describe, expect, it, vi } from 'vitest';
import { taskOverviewApi } from '../../src/renderer/task-overview-api.js';
import { composeTaskOverview } from '../../src/service/task-overview.js';
import type { GlobalAttentionItemProjection, GlobalAttentionProjection, RendererApi } from '../../src/shared/protocol.js';

function task(group: GlobalAttentionItemProjection['group'], state: GlobalAttentionItemProjection['state'], id: string): GlobalAttentionItemProjection {
  return { itemId: id, group, state, blocked: false, at: '2026-11-05T01:00:00Z', book: { bookId: 'book', title: '任务总览' },
    object: { kind: 'analysis', mode: 'first-baseline' }, facts: { progress: null, categories: [], revisionOrdinal: null }, nextStep: 'view-run',
    target: { kind: 'analysis', bookId: 'book', taskIntentId: id }, technical: [{ key: 'run-record', label: '运行', value: id }] };
}
describe('task overview', () => {
  it('keeps completed and cancelled tasks in history and sorts the authoritative queue positions', () => {
    const items = [task('active', 'analysis-waiting-capacity', 'second'), task('active', 'analysis-waiting-capacity', 'first'), task('recent', 'analysis-completed', 'done'), task('recent', 'analysis-cancelled', 'cancelled')];
    const attention: GlobalAttentionProjection = { groups: [{ key: 'active', items, total: 4 }], actionableCount: 0, running: true, processing: { state: 'local' } };
    const result = composeTaskOverview(attention, 2, (id) => id === 'first' ? 1 : id === 'second' ? 2 : null);
    expect(result.groups.find((group) => group.key === 'queued')!.items.map((item) => item.itemId)).toEqual(['first', 'second']);
    expect(result.groups.find((group) => group.key === 'recent')!.items.map((item) => item.state)).toEqual(['completed', 'cancelled']);
    expect(result.queuedCount).toBe(2);
  });
  it('scopes existing drawer commands to the selected Book even when the contextBridge API is frozen', async () => {
    const inspectTaskPlan = vi.fn(); const taskOverviewCall = vi.fn().mockResolvedValue({ bookId: 'other' });
    const api = Object.freeze({ inspectTaskPlan, taskOverviewCall }) as unknown as RendererApi;
    let book: string | null = 'other'; const scoped = taskOverviewApi(api, () => book);
    await scoped.inspectTaskPlan({ kind: 'baseline-analysis', ref: 'task' });
    expect(taskOverviewCall).toHaveBeenCalledWith({ bookId: 'other', operation: 'inspectTaskPlan', input: { kind: 'baseline-analysis', ref: 'task' } });
    expect(inspectTaskPlan).not.toHaveBeenCalled();
    book = null; await scoped.inspectTaskPlan({ kind: 'baseline-analysis', ref: 'task' });
    expect(inspectTaskPlan).toHaveBeenCalledOnce();
  });
});
