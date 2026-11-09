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
