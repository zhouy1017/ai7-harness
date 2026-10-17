import type { ShellBookSection } from '../shared/preferences.js';

// The shell's words (Issue #934, wave 11 slice 11a; editor-surfaces §0.3, §8; IA-006 to IA-013): the two-level sidebar, the
// context header and the 设置 hub. Each row's icon is one character of its own name, drawn by the stylesheet from a data
// attribute, so a row's text is exactly its label and a collapsed row keeps that label as its accessible name.

export type ShellDestination = 'attention' | 'library' | 'series' | 'knowledge' | 'quality';

/** The five global destinations in their fixed order (IA-007): 待我处理 · 书库 · 书系 · 知识库 · 质量与学习. */
export const SHELL_DESTINATIONS: ReadonlyArray<{ readonly key: ShellDestination; readonly label: string; readonly icon: string }> = Object.freeze([
  { key: 'attention', label: '待我处理', icon: '待' },
  { key: 'library', label: '书库', icon: '库' },
  { key: 'series', label: '书系', icon: '系' },
  { key: 'knowledge', label: '知识库', icon: '知' },
  { key: 'quality', label: '质量与学习', icon: '质' },
]);

/** The current Book's three groups (IA-012): 工作 · 处理 · 资料与记录. */
export const SHELL_BOOK_GROUPS: ReadonlyArray<{
  readonly key: 'work' | 'handling' | 'records';
  readonly label: string;
  readonly sections: ReadonlyArray<{ readonly key: ShellBookSection; readonly label: string; readonly icon: string }>;
}> = Object.freeze([
  { key: 'work', label: '工作', sections: [
    { key: 'manuscript', label: '稿件', icon: '稿' },
    { key: 'review', label: '审阅', icon: '审' },
    { key: 'evaluation', label: '评估', icon: '评' },
    { key: 'deliverables', label: '交付物', icon: '交' },
  ] },
  { key: 'handling', label: '处理', sections: [
    { key: 'findings', label: '发现', icon: '发' },
  ] },
  { key: 'records', label: '资料与记录', sections: [
    { key: 'analysis', label: '分析', icon: '析' },
    { key: 'sources', label: '来源与证据', icon: '源' },
    { key: 'overview', label: '工作概览', icon: '概' },
    { key: 'history', label: '历史与恢复', icon: '史' },
  ] },
]);

export const SHELL_SETTINGS = Object.freeze({ label: '设置', icon: '设' });

export const SHELL_LABELS = Object.freeze({
  navigation: '主导航',
  books: '置顶与最近打开',
  pinnedHeading: '置顶',
  recentHeading: '最近打开',
  noBooks: '打开过的图书会列在这里。',
  currentBook: '当前图书',
  application: 'AI7 编辑工作台',
  collapse: '收起侧栏',
  expand: '展开侧栏',
  narrow: '窗口较窄，侧栏只显示图标',
  pin: (title: string) => `置顶《${title}》`,
  unpin: (title: string) => `取消置顶《${title}》`,
  pinned: '已置顶',
  bookRowName: (title: string, state: string) => `《${title}》 · ${state}`,
  global: '全局',
  importing: '导入稿件',
  untitledBook: '未命名图书',
  bookIcon: '书',
  openingBook: '正在打开图书工作台…',
  bookUnavailable: '无法打开精确图书工作台。',
  preferenceWriteFailed: '本机界面设置未能保存，界面仍按原来的设置显示。',
  preferenceReadFailed: '本机界面设置无法读取，已按默认设置显示。',
  library: '书库',
  libraryTitle: '图书与稿件',
  allBooks: '全部图书',
});

export const SETTINGS_PAGE_TITLES: Readonly<Record<string, string>> = Object.freeze({
  'model-service': '服务 · 模型服务',
  'data-storage': '本机 · 数据与存储',
  'evaluation-calibration': '编辑工作 · 评估校准与预测',
  appearance: '本机 · 外观',
});

const SECTION_LABELS: Readonly<Record<ShellBookSection, string>> = Object.freeze(Object.fromEntries(
  SHELL_BOOK_GROUPS.flatMap((group) => group.sections.map((section) => [section.key, section.label])),
) as Record<ShellBookSection, string>);

export function shellSectionLabel(section: ShellBookSection): string {
  return SECTION_LABELS[section];
}

export function shellSectionGroupLabel(section: ShellBookSection): string {
  return SHELL_BOOK_GROUPS.find((group) => group.sections.some((entry) => entry.key === section))!.label;
}

/** A recent Book's one-line state: where it was last seen. */
export function shellRecentStateLine(section: ShellBookSection): string {
  return `上次在「${shellSectionLabel(section)}」`;
}

export function shellDestinationLabel(destination: ShellDestination): string {
  return SHELL_DESTINATIONS.find((entry) => entry.key === destination)!.label;
}

export type SettingsRoute = 'model-service' | 'usage' | 'evaluation-calibration' | 'data-storage' | 'appearance' | 'keyboard' | 'notifications' | 'diagnostics';

/**
 * 设置 (editor-surfaces §8.6; MSET, DSTO, VIEW, KEY, NOTIF): 服务 · 编辑工作 · 本机. A row whose page another slice of wave 11
 * brings is shown, unavailable, with 即将提供 — 11b 外观, 11c 用量 and 键盘与无障碍, 11d 通知, 11e 诊断 replace their own row.
 */
export const SETTINGS_HUB_GROUPS: ReadonlyArray<{
  readonly key: 'service' | 'editorial' | 'local';
  readonly label: string;
  readonly rows: ReadonlyArray<{ readonly route: SettingsRoute; readonly label: string; readonly note: string }>;
}> = Object.freeze([
  { key: 'service', label: '服务', rows: [
    { route: 'model-service', label: '模型服务', note: '连接、四个角色与预算偏好；凭据只能重新输入或移除。' },
    { route: 'usage', label: '用量', note: '按图书、任务与时间汇总的用量。' },
  ] },
  { key: 'editorial', label: '编辑工作', rows: [
    { route: 'evaluation-calibration', label: '评估校准与预测', note: '校准进度、预测开关与定价、首印实际数据。' },
  ] },
  { key: 'local', label: '本机', rows: [
    { route: 'data-storage', label: '数据与存储', note: '数据位置、版本、导出与导入数据库、定期自动备份。' },
    { route: 'appearance', label: '外观', note: '跟随系统、浅色或深色。' },
    { route: 'keyboard', label: '键盘与无障碍', note: '快捷键与键盘操作。' },
    { route: 'notifications', label: '通知', note: '窗口不在前台时的系统通知。' },
    { route: 'diagnostics', label: '诊断', note: '崩溃记录与诊断包。' },
  ] },
]);

export const SETTINGS_HUB_WORDS = Object.freeze({
  section: '设置',
  title: '设置',
  lede: '本机怎样连接模型服务、怎样保存数据、怎样显示。打开一项设置不会更改任何记录。',
  comingSoon: '即将提供',
  opened: '设置已打开',
});

/** The line 数据与存储 states about the shell's own file (Issue #934 brief, Outcome 5). */
export const PREFERENCES_LOCAL_LINE = '界面设置（侧栏收起状态、置顶与最近打开的图书等）只保存在本机，不随稿件、交付包或导出数据库带走。';
