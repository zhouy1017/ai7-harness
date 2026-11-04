import { installMiniDom } from '../support/mini-dom.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { taskOverviewCard } from '../../src/renderer/tasks-overview.js';
import { describe, expect, it, vi } from 'vitest';
import { taskOverviewApi } from '../../src/renderer/task-overview-api.js';
import { composeTaskOverview, estimateTaskStarts } from '../../src/service/task-overview.js';
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
  it('estimates a queued start from measured recent unit throughput and omits it without measurements', () => {
    const running = task('active', 'analysis-running', 'running'); running.facts.progress = { stage: 'units', unitsSettled: 4, unitsTotal: 8 };
    const queued = task('active', 'analysis-waiting-capacity', 'queued'); queued.facts.progress = { stage: 'units', unitsSettled: 0, unitsTotal: 8 };
    const completed = task('recent', 'analysis-completed', 'done'); completed.facts.completion = { gaps: 0, total: 8, reason: null };
    const attention: GlobalAttentionProjection = { groups: [{ key: 'active', items: [running, queued, completed], total: 3 }], actionableCount: 0, running: true, processing: { state: 'local' } };
    const projection = composeTaskOverview(attention, 1, (id) => id === 'queued' ? 1 : null, undefined, [], false, (item) => item.itemId === 'done' ? { elapsed: 60000, calls: 8 } : null);
    expect(estimateTaskStarts(projection, Date.parse(completed.at)).groups[1]!.items[0]!.eta).toBe(30000);
    const noUsage = { ...projection, groups: projection.groups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, usage: null })) })) };
    expect(estimateTaskStarts(noUsage).groups[1]!.items[0]!.eta).toBeNull();
  });
  it('renders state-specific shared card actions without exposing record or model identities', () => {
    const uninstall = installMiniDom();
    try {
      const cases = [
        ['active', 'analysis-running', ['pause', 'cancel']], ['active', 'analysis-waiting-capacity', ['up', 'top', 'cancel']],
        ['decisions', 'analysis-clarification', ['answer']], ['active', 'analysis-paused', ['resume', 'redo']],
        ['recent', 'analysis-completed', ['result', 'again']],
      ] as const;
      for (const [group, state, actions] of cases) {
        const item = task(group, state, 'b0000000-0000-4000-8000-000000000001');
        const attention: GlobalAttentionProjection = { groups: [{ key: group, items: [item], total: 1 }], actionableCount: 0, running: true, processing: { state: 'local' } };
        const projected = composeTaskOverview(attention, 2, () => state === 'analysis-waiting-capacity' ? 1 : null).groups.flatMap((group) => group.items)[0]!;
        const act = vi.fn(); const card = taskOverviewCard(projected, act);
        expect(Array.from(card.querySelectorAll<HTMLElement>('[data-task-action]')).filter((button) => !button.closest('details')).map((button) => button.dataset['taskAction'])).toEqual(actions);
        expect(card.querySelectorAll('.task-overview-card-line')).toHaveLength(1);
        expectNoTechnicalText(card);
        card.querySelector<HTMLButtonElement>(`[data-task-action="${actions[0]}"]`)!.click();
        expect(act).toHaveBeenCalledWith(projected, actions[0]);
      }
    } finally { uninstall(); }
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
