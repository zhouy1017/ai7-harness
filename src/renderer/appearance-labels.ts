import type { ThemePreference } from '../shared/appearance.js';

/**
 * 设置 › 本机 › 外观's words (Issue #935, wave 11 slice 11b; V2-UX-VIS-004..010): the three Application Theme Preference
 * choices, each with one plain line, and the promise that the choice stays on this computer and changes no manuscript or export.
 */
export const APPEARANCE_TITLE = '外观';
export const APPEARANCE_SECTION = '设置 · 本机';
export const APPEARANCE_LEDE = '选择适合阅读的外观。系统的高对比度等辅助显示设置始终优先。';
export const APPEARANCE_LEGEND = '应用外观';
export const APPEARANCE_SAVED = '外观已保存在本机。';
export const APPEARANCE_SAVE_FAILED = '外观未能保存，请重试。';
export const APPEARANCE_STATUS = '外观只保存在本机，不改变稿件或导出内容。';
export const APPEARANCE_BACK = '返回';

export const APPEARANCE_CHOICES: ReadonlyArray<{ value: ThemePreference; label: string; description: string }> = [
  { value: 'system', label: '跟随系统', description: '随本机的浅色或深色外观自动切换。' },
  { value: 'light', label: '浅色', description: '使用冷灰外壳与微暖的稿件背景。' },
  { value: 'dark', label: '深色', description: '使用低亮度的深灰外壳与中性稿件背景。' },
];
