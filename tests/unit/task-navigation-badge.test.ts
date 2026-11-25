import { expect, it } from 'vitest';
import { taskNavigationCount, taskNavigationName } from '../../src/renderer/task-navigation-badge.js';
import type { GlobalAttentionStateKey, TaskOverviewProjection } from '../../src/shared/protocol.js';

const overview = (states: GlobalAttentionStateKey[]) => ({
  groups: [{ key: 'running', total: states.length, items: states.map((state) => ({ attention: { state } })) }],
}) as unknown as Pick<TaskOverviewProjection, 'groups'>;

it('counts the tasks in progress — running and queued — and nothing 待我处理 counts (Issue #1680)', () => {
  expect(taskNavigationCount(overview(['analysis-running', 'review-running', 'analysis-cancelling', 'analysis-queued', 'analysis-waiting-capacity', 'analysis-waiting-network']))).toBe(6);
  // A failure, an interruption, a wait for a model connection and a finished task are 待我处理's or the history's, never this number's.
  expect(taskNavigationCount(overview(['analysis-failed', 'analysis-resumable', 'review-continuable', 'analysis-waiting-connection', 'analysis-paused', 'analysis-completed']))).toBe(0);
  expect(taskNavigationName(3)).toBe('任务，3 项任务正在进行');
});
