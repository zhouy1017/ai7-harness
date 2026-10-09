import { describe, expect, it } from 'vitest';
import { announceReasonOnce } from '../../src/renderer/review-workspace.js';

// Unit suite for how the 审阅 surface announces a failure whose reason it shows on an alert line (Issue #691; #705 item 1): the
// 新建审阅 sheet's failed 先看计划, and the convert and ignore forms. The reason is heard once, where the editor stands; the status
// bar only drops its busy line. Pure: no DOM.

describe('a reason announced once, on the alert line', () => {
  it('puts the reason on the line and clears the status bar rather than repeating it', () => {
    const line: { problem: string | null } = { problem: null };
    const statuses: Array<[string, string | undefined]> = [];
    announceReasonOnce(line, '无法准备审阅计划。', (message: string, tone?: string) => statuses.push([message, tone]));
    expect(line.problem).toBe('无法准备审阅计划。');
    // The status bar is cleared once — never set to the reason, and never left with its busy tone.
    expect(statuses).toEqual([['', undefined]]);
  });

  it('replaces an older reason on the same line', () => {
    const line: { problem: string | null } = { problem: '旧的' };
    announceReasonOnce(line, '这条发现未能忽略。', () => undefined);
    expect(line.problem).toBe('这条发现未能忽略。');
  });
});
