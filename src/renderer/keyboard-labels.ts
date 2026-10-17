/**
 * 设置 › 本机 › 键盘与无障碍 › 快捷键's words (Issue #936, plan slice 11c; V2-UX-KEY-002, KEY-003, KEY-011, KEY-013). Pure, so
 * the unit suite pins every line. Accessibility needs no switch here: keyboard operation, visible focus, system zoom and native
 * accessibility appearance are always on (KEY-013).
 */

export const KEYBOARD_TITLE = '键盘与无障碍';
export const KEYBOARD_SECTION_LABEL = '设置 · 本机 · 键盘与无障碍 › 快捷键';
export const KEYBOARD_ALWAYS_ON = '键盘操作、清晰的焦点、系统缩放和系统的无障碍外观始终有效，不需要另行开启。';
export const KEYBOARD_SHORTCUTS_HEADING = '快捷键';
export const KEYBOARD_LEDE = '只有导航、查找和视图命令可以修改。输入文字、移动光标、操作系统和输入法占用的按键不能修改；开始任务、采纳、设为发稿版本、删除等会产生决定的操作没有全局快捷键。快捷键只保存在这台电脑上，不随稿件、交付包或导出带走。';
export const KEYBOARD_COLUMNS = ['命令', '适用范围', '快捷键', '操作'] as const;
export const KEYBOARD_FIXED_HEADING = '编辑命令（不能修改）';
export const KEYBOARD_RESET_ALL = '全部恢复默认';
export const KEYBOARD_RESET_ONE = '恢复默认';
export const KEYBOARD_CHANGE = '修改';
export const KEYBOARD_CUSTOM_MARK = '已修改';
export const KEYBOARD_CAPTURE_PROMPT = '请按下新的快捷键；按 Esc 取消。';
export const KEYBOARD_CAPTURE_ADD_STEP = '再录一步';
export const KEYBOARD_CAPTURE_APPLY = '设为快捷键';
export const KEYBOARD_CAPTURE_CANCEL = '取消';
export const KEYBOARD_CAPTURE_SECOND = '请按第二步';
export const keyboardCaptureName = (name: string): string => `「${name}」的新快捷键`;
export const keyboardChangeName = (name: string): string => `修改「${name}」的快捷键`;
export const keyboardResetName = (name: string): string => `恢复「${name}」的默认快捷键`;
export const KEYBOARD_STATUS_LINES = {
  loading: '正在读取快捷键…',
  loaded: '已读取快捷键。',
  loadFailed: '无法读取快捷键。',
  capturing: '正在等待新的快捷键…',
  cancelled: '已取消修改。',
  saved: '已更新快捷键。',
  savedAll: '已把全部快捷键恢复为默认。',
  savedOne: '已恢复这条命令的默认快捷键。',
  saveFailed: '无法保存快捷键。',
} as const;

export function keyboardCapturedLine(label: string): string {
  return `新的快捷键：${label}`;
}

export function keyboardSavedLine(commandName: string, label: string): string {
  return `已把「${commandName}」的快捷键改为 ${label}。`;
}

export function keyboardResetLine(commandName: string, label: string): string {
  return `已把「${commandName}」恢复为默认快捷键 ${label}。`;
}
