import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_INPUT_MODE, EDIT_METHODS, editMethod, getAutoApplyEditorRevisions, setAutoApplyEditorRevisions } from '../../src/renderer/editor-input-mode.js';
afterEach(() => { vi.unstubAllGlobals(); setAutoApplyEditorRevisions(true); });
it('presents all three choices over the unchanged stored preference and default', () => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  expect(DEFAULT_EDITOR_INPUT_MODE).toBe('reading-revision');
  expect(getAutoApplyEditorRevisions()).toBe(true);
  saved.set('ai7.editor.autoApplyRevisions', 'false');
  expect(editMethod(DEFAULT_EDITOR_INPUT_MODE, getAutoApplyEditorRevisions()).title).toBe('修订 · 待我确认');
  expect(editMethod('direct-edit', false).title).toBe('直接改稿 · 不留痕');
  expect(saved.get('ai7.editor.autoApplyRevisions')).toBe('false');
  expect(EDIT_METHODS.map(({mode, autoApply}) => [mode, autoApply])).toEqual([['reading-revision', true], ['reading-revision', false], ['direct-edit', null]]);
  setAutoApplyEditorRevisions(true);
  expect(saved.get('ai7.editor.autoApplyRevisions')).toBe('true');
  expect(editMethod(DEFAULT_EDITOR_INPUT_MODE, true).title).toBe('修订 · 自动应用');
});
