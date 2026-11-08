// 阅读与修订模式 (Issue #1411): a manuscript or a derivative document opens with its text guarded against an accidental key,
// paste, cut or drop. The caret, selection, copy, 查找 and every mark stay; the editor's own changes go through a revision card
// that is applied at once (`recordAndApplyEditorRevision`). 自由直接编辑 is the explicit switch back to typing straight into
// the text, which writes the journal exactly as before.

export type EditorInputMode = 'reading-revision' | 'direct-edit';

export const DEFAULT_EDITOR_INPUT_MODE: EditorInputMode = 'reading-revision';

export const INPUT_MODE_LABELS: Readonly<Record<EditorInputMode, string>> = {
  'reading-revision': '模式：阅读与修订（防误触）',
  'direct-edit': '模式：自由直接编辑',
};

export const INPUT_MODE_TITLES: Readonly<Record<EditorInputMode, string>> = {
  'reading-revision': '直接输入已锁定；选中文字后「修改此处」会留下修订卡片并立即应用。点击切换为自由直接编辑。',
  'direct-edit': '可以像普通编辑器一样直接输入。点击切换回阅读与修订模式（防误触）。',
};

export const READING_REVISION_HINT = '当前为阅读与修订模式（防误触）；选中文字可留痕修改，或点击顶部切换为「自由直接编辑」。';

export const INPUT_MODE_CHANGED: Readonly<Record<EditorInputMode, string>> = {
  'reading-revision': '已切换为阅读与修订模式（防误触）。',
  'direct-edit': '已切换为自由直接编辑；直接输入会写入正文，不生成修订卡片。',
};

/** Clipboard commands that change the text, refused with the hint while the text is guarded. */
export const READING_REVISION_CLIPBOARD_REASON = '阅读与修订模式下不能剪切或粘贴到正文';

/**
 * What a key does to the guarded text: `revise` — a character or Enter, which asks for the selection's revision card when words
 * are selected; `block` — a key that would delete or paste; `null` — a key that reads, moves, selects, copies or runs a command.
 */
export function readingRevisionKey(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'shiftKey'>,
  modifier: boolean,
): 'revise' | 'block' | null {
  const key = event.key;
  if (modifier) {
    const lower = key.toLocaleLowerCase('en-US');
    if (!event.altKey && (lower === 'x' || lower === 'v')) return 'block';
    if (key === 'Backspace' || key === 'Delete') return 'block';
    return null;
  }
  if (key === 'Enter') return 'revise';
  if (key === 'Backspace' || key === 'Delete') return 'block';
  // One printed character (a code point or a grapheme the keyboard sends whole); named keys such as ArrowLeft are longer.
  return [...key].length === 1 ? 'revise' : null;
}

/** Whether a `beforeinput` would change the guarded text; the composition's own steps are left to the transaction guard. */
export function readingRevisionBlocksInput(inputType: string): boolean {
  return inputType.length > 0 && !inputType.startsWith('insertComposition') && !inputType.startsWith('history');
}
