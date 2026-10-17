/**
 * The words of the command registry and its remapping (Issue #936, plan slice 11c; V2-UX-KEY-002, KEY-003, KEY-006): the
 * contexts and groups, and every reason a chord is refused. Pure, so the unit suite pins each line.
 */

export type BindingRefusalReason =
  | 'editable-text'
  | 'os-reserved'
  | 'ime-reserved'
  | 'unsupported-key'
  | 'exact-conflict'
  | 'prefix-conflict'
  | 'unknown-command';

export const COMMAND_CONTEXT_NAMES = {
  application: '整个应用',
  book: '图书工作台',
  manuscript: '稿件编辑',
} as const;

export const COMMAND_GROUP_NAMES = {
  navigation: '导航',
  search: '查找',
  view: '视图',
} as const;

export const COMMAND_NAMES = {
  'nav.attention': '待我处理', 'nav.library': '书库', 'nav.series': '书系', 'nav.knowledge': '知识库', 'nav.quality': '质量与学习',
  'nav.book.manuscript': '稿件', 'nav.book.review': '审阅', 'nav.book.evaluation': '评估', 'nav.book.deliverables': '交付物',
  'nav.book.analysis': '分析', 'nav.book.sources': '来源与证据', 'nav.book.overview': '工作概览',
  'nav.back': '返回', 'search.find': '查找', 'search.next': '下一组查找结果', 'search.previous': '上一组查找结果',
  'view.focusManuscript': '聚焦稿件', 'view.openTasks': '打开任务面板',
  'edit.save': '保存', 'edit.undo': '撤销', 'edit.redo': '重做', 'edit.replace': '替换', 'edit.previousWindow': '上一页', 'edit.nextWindow': '下一页',
} as const;

export const shortcutHintLabel = (label: string): string => `快捷键 ${label}`;

/** Announced when a command key is pressed while an input method's composition is open (KEY-006). */
export const IME_DEFERRED_ANNOUNCEMENT = '输入法组合尚未结束，命令已暂缓。';

/** The sentence that says why a chord was not taken; `detail` is the chord, `with` the other command, `contexts` where it bites. */
export function bindingRefusalLabel(reason: BindingRefusalReason, withName: string | null, contexts: readonly string[], detail?: string): string {
  const key = detail === undefined ? '这个按键' : `「${detail}」`;
  switch (reason) {
    case 'editable-text':
      return `${key}用于输入文字、移动光标或编辑稿件，不能设为快捷键。请加上 Ctrl/Command 或 Alt 组合，或选用功能键。`;
    case 'os-reserved':
      return `${key}由操作系统或窗口保留，不能设为快捷键。`;
    case 'ime-reserved':
      return `${key}由输入法保留，不能设为快捷键。`;
    case 'unsupported-key':
      return '无法识别这个按键，请换一个。';
    case 'exact-conflict':
      return `与「${withName ?? ''}」的快捷键完全相同，在${contexts.join('、')}里会含糊，未设置。`;
    case 'prefix-conflict':
      return `与「${withName ?? ''}」的快捷键前后相接（一个是另一个的开头），在${contexts.join('、')}里会含糊，未设置。`;
    case 'unknown-command':
      return '没有这条命令。';
  }
}
