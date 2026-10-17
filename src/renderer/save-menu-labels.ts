import { MILESTONE_FORM_WORDS } from './deliverables-labels.js';

/** 已写入修订日志 ▾ (Issue #952; V2-UX-ED-050/052): two separate facts, never one generic 已保存. */
export const SAVE_MENU_WORDS = {
  confirming: '正在确认修订日志',
  written: '已写入修订日志',
  writing: '正在写入修订日志',
  unwritten: '修改尚未写入修订日志',
  unconfirmed: '修订日志写入待确认',
  changedSinceMilestone: (label: string) => `自里程碑版本「${label}」后有修改`,
  milestoneUnavailable: '里程碑版本状态暂不可用',
  milestone: `${MILESTONE_FORM_WORDS.summary}…`,
  exportManuscript: '导出…',
} as const;
