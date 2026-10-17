import type { ManuscriptAlignment, ManuscriptFontFamily, ReadingPreset, WorkspaceDensity } from '../shared/preferences.js';

/**
 * 设置 › 本机 › 外观's density, reading and region words (Issue #951, wave 12 slice 12a; V2-UX-VIEW-001 to VIEW-012), beside
 * 11b's theme. Every choice is local presentation: the page says so, and no line here promises a change to the manuscript,
 * an export or a record.
 */
export const VIEW_SETTINGS_PROMISE = '密度、排版与区域宽度只保存在本机，只改变显示，不改变稿件文字、导出内容、模型所见内容或任何记录。';
export const VIEW_SETTINGS_SAVED = '显示设置已保存在本机。';
export const VIEW_SETTINGS_SAVE_FAILED = '显示设置未能保存，请重试。';

export const DENSITY_LEGEND = '工作区密度';
export const DENSITY_CHOICES: ReadonlyArray<{ value: WorkspaceDensity; label: string; description: string }> = [
  { value: 'standard', label: '标准', description: '默认间距。' },
  { value: 'compact', label: '紧凑', description: '收紧导航、表格、队列、筛选与信息行的间距；稿件排版、焦点框与按钮大小不变。' },
];

export const PRESET_LEGEND = '稿件阅读预设';
export const PRESET_CHOICES: ReadonlyArray<{ value: ReadingPreset; label: string; description: string }> = [
  { value: 'editing', label: '编辑', description: '略密的行距与较宽的版心，便于逐句修改。' },
  { value: 'reading', label: '阅读', description: '更舒展的行距、较窄的版心与两端对齐，便于通读。' },
];
export const PRESET_NOTE = '选用预设会把下面的排版调回该预设的起始值；预设不切换工作方式，也不暂停后台工作。';

export const TYPOGRAPHY_LEGEND = '稿件排版';
export const FONT_FAMILY_LABEL = '字体';
export const FONT_FAMILY_CHOICES: ReadonlyArray<{ value: ManuscriptFontFamily; label: string }> = [
  { value: 'serif', label: '宋体（衬线）' },
  { value: 'kai', label: '楷体' },
  { value: 'fangsong', label: '仿宋' },
  { value: 'sans', label: '黑体（无衬线）' },
];
export const FONT_FALLBACK_NOTE = '本机缺少某个字形时，自动改用同类中文字体显示；稿件中存储的文字与选区不变。';
export const FONT_SIZE_LABEL = '字号';
export const LINE_HEIGHT_LABEL = '行距';
export const COLUMN_WIDTH_LABEL = '每行字数';
export const ALIGNMENT_LABEL = '对齐';
export const ALIGNMENT_CHOICES: ReadonlyArray<{ value: ManuscriptAlignment; label: string }> = [
  { value: 'start', label: '左对齐' },
  { value: 'justify', label: '两端对齐' },
];
export const TYPOGRAPHY_RESET = '恢复默认排版';
export const TYPOGRAPHY_RESET_DONE = '已恢复默认排版。';

export const fontSizeValue = (px: number): string => `${px} 像素`;
export const lineHeightValue = (ratio: number): string => `${ratio.toFixed(2)} 倍`;
export const columnWidthValue = (characters: number): string => `每行约 ${characters} 字`;

export const REGIONS_LEGEND = '区域宽度';
export const REGION_NAMES = { supportingWidth: '导航面板', drawerWidth: '任务面板' } as const;
export const REGIONS_NOTE = '在稿件旁拖动面板边缘的分隔条，或聚焦分隔条后用方向键调整；稿件正文始终保留可用宽度。';
export const RESTORE_DEFAULT_LAYOUT = '恢复默认布局';
export const RESTORED_DEFAULT_LAYOUT = '已恢复默认布局；只改变本机显示，不影响稿件或任何记录。';
export const regionDefault = '跟随窗口（默认）';
export const regionWidthValue = (px: number): string => `${px} 像素`;
export const separatorLabel = (region: keyof typeof REGION_NAMES): string => `调整${REGION_NAMES[region]}宽度`;
export const regionAnnouncement = (region: keyof typeof REGION_NAMES, px: number): string => `${REGION_NAMES[region]}宽度 ${px} 像素。`;
export const OPTIONAL_REGION_NAMES = { 'position-rail': '位置轨' } as const;
