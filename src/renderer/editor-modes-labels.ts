/**
 * 专注模式 and the context header's 视图 menu (Issue #951, wave 12 slice 12a; V2-UX-ED-004 to ED-007, VIEW-010 to VIEW-012).
 * Pure words; changing a mode creates no Task, decision, Workflow transition, Effect, receipt or authority change (ED-005).
 */
export const FOCUS_MODE_LABEL = '专注';
export const FOCUS_MODE_NAME = '专注模式';
export const FOCUS_MODE_EXIT = '退出专注（Esc）';
export const FOCUS_MODE_ENTER_TITLE = '只留下稿件与保存状态；按 Esc 退出';
export const FOCUS_MODE_ENTERED = '已进入专注模式：侧栏、辅助面与任务入口已收起，后台工作照常进行；按 Esc 或「退出专注」恢复。';
export const FOCUS_MODE_LEFT = '已退出专注模式。';

export const VIEW_MENU_LABEL = '视图';
export const VIEW_MENU_RESTORE_HEADING = '显示';
export const VIEW_MENU_ITEMS = {
  navigation: '导航面板',
  tasks: '任务面板',
  rail: '位置轨',
  restoreLayout: '恢复默认布局',
} as const;
export const VIEW_MENU_NOTE = '收起或隐藏只改变显示，不会关闭待我处理、处理请求、取消任务或删除任何记录。';
