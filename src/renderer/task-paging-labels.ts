export const TASK_PAGE_FAILED = '无法继续读取，请重新打开计划。';
export const TASK_PAGE_NAMES: Readonly<Record<string, string>> = {
  'drift.entries': '计划变化', 'edit.lastEdit.entries': '修改记录', 'resend.units': '再次发送的范围',
  'resend.statement': '再次发送说明', 'unconfirmed.ranges': '未确认的范围',
  'runControl.outcomeUnknown.units': '未确认的范围', 'runControl.continuation.pendingAnswerUnits': '待续行的范围',
  clarifications: '任务说明', 'scopeOptions.chapters.chapters': '章节',
};
export const taskPageMore = (name: string, shown: number, total: number): string => `继续读取${name}（已显示 ${shown} / ${total}）`;
