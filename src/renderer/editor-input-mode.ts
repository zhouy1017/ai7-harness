/** Both modes accept ordinary input; revision mode records changes. */
export type EditorInputMode = 'reading-revision' | 'direct-edit';
export const DEFAULT_EDITOR_INPUT_MODE: EditorInputMode = 'reading-revision';
export const INPUT_MODE_LABELS: Readonly<Record<EditorInputMode, string>> = {
  'reading-revision': '修订模式', 'direct-edit': '直接改稿（不留痕）',
};
export const INPUT_MODE_TITLES: Readonly<Record<EditorInputMode, string>> = {
  'reading-revision': '直接在正文中修改，停笔后自动留下编辑修订卡片。点击切换为不留痕改稿。',
  'direct-edit': '直接输入并保存，不生成修订卡片。点击回到修订模式。',
};
export const INPUT_MODE_CHANGED: Readonly<Record<EditorInputMode, string>> = {
  'reading-revision': '已切换为修订模式；直接修改正文即可。',
  'direct-edit': '已切换为直接改稿（不留痕）。',
};
const AUTO_APPLY_KEY = 'ai7.editor.autoApplyRevisions';
let autoApplyPreference = true;
export function getAutoApplyEditorRevisions(): boolean {
  try { const saved = localStorage.getItem(AUTO_APPLY_KEY); if (saved !== null) autoApplyPreference = saved !== 'false'; } catch { /* Use the current session's choice. */ }
  return autoApplyPreference;
}
export function setAutoApplyEditorRevisions(enabled: boolean): void {
  autoApplyPreference = enabled;
  try { localStorage.setItem(AUTO_APPLY_KEY, String(enabled)); } catch { /* Editing remains available without storage. */ }
}

/** Presentation of the existing settings; no new persisted preference. */
export const EDIT_METHODS = [
  { value: 'auto', mode: 'reading-revision', autoApply: true, title: '修订 · 自动应用', description: '改动留痕，停笔后自动写入稿件，可逐条撤销。' },
  { value: 'confirm', mode: 'reading-revision', autoApply: false, title: '修订 · 待我确认', description: '改动留痕为待处理的修订卡，由你逐条应用。' },
  { value: 'direct', mode: 'direct-edit', autoApply: null, title: '直接改稿 · 不留痕', description: '直接改动正文，不生成修订卡。' },
] as const;
export function editMethod(mode: EditorInputMode, autoApply: boolean): typeof EDIT_METHODS[number] {
  return EDIT_METHODS[mode === 'direct-edit' ? 2 : autoApply ? 0 : 1];
}
export const INPUT_MODE_CONFIRM_CHANGED = '已切换为修订 · 待我确认；修改将留下待处理的修订卡。';
