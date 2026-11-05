import { describe, expect, it } from 'vitest';
import { analysisUpdateBlockedDrawerAction, ANALYSIS_UPDATE_BLOCKED_DRAWER_LABEL } from '../../src/renderer/baseline-analysis-card.js';

describe('analysis update lock copy (Issue #1309)', () => {
  it('offers the task drawer link for a resumable stop-reason lock and no link for other locks', () => {
    expect(analysisUpdateBlockedDrawerAction('有一项运行因代理不可达中断，续行或取消它后才能准备新的更新。')).toBe('task-drawer');
    expect(ANALYSIS_UPDATE_BLOCKED_DRAWER_LABEL).toBe('查看任务抽屉');
    expect(analysisUpdateBlockedDrawerAction('当前已有分析任务在调度或执行中；在其结束前不能准备新的更新。')).toBeNull();
  });
});
