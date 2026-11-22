import { expect, it } from 'vitest';
import { withTaskRelaunch, type TaskRelaunchHost } from '../../src/service/task-relaunch.js';
import { TASK_OVERVIEW_OPERATIONS, WRITING_KIND } from '../../src/shared/protocol.js';
import { taskPlanFixture } from '../support/task-plan-fixture.js';

it.each(['TASK_REPEAT_UNAVAILABLE', 'REVIEW_MANUSCRIPT_ABSENT'])('keeps the plan readable when its launch recipe is unavailable: %s (#1656)', code => {
  const review = code === 'REVIEW_MANUSCRIPT_ABSENT';
  const plan = taskPlanFixture({ kind: review ? 'review-run' : 'writing', state: { key: 'settled', label: '已完成' } });
  const host = {
    authority: { prepare: () => ({ get: () => ({ current: 1, kind: WRITING_KIND, review_run_id: plan.ref, run_record_id: 'run', sha256: 'a'.repeat(64), state: 'completed' }), all: () => [] }) },
    materialIds: () => [], writingTask: () => { throw Object.assign(new Error('原请求不可用'), { code }); },
    reviewFacts: () => ({ categories: [], state: 'settled', canContinue: false }),
    reviewRepeat: () => { throw Object.assign(new Error('原请求不可用'), { code }); },
  } as unknown as TaskRelaunchHost;
  expect(withTaskRelaunch(host, plan)).toEqual({ ...plan, relaunch: null });
  const failure = new Error('unexpected failure');
  host.writingTask = () => { throw failure; }; host.reviewRepeat = () => { throw failure; };
  expect(() => withTaskRelaunch(host, plan)).toThrow(failure);
});


it('routes the between-category review cancellation from the cross-Book overview (#1656)', () => {
  expect(TASK_OVERVIEW_OPERATIONS).toContain('cancelReviewRun');
});
