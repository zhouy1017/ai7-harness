/**
 * The single keys that decide a focused card (Issue #1523; the review page #1525 imports this module unchanged): one accepts,
 * one rejects. They are fixed keys of a focused card, never rebindable commands — the command dispatcher refuses a chord without
 * a modifier — and 设置 › 键盘 lists them with the other fixed keys. Each press goes to the card's own button, so a key decides
 * exactly what a click on that button would.
 */

export type TriageAction = 'accept' | 'reject';

/** The key each action answers to, as `KeyboardEvent.key` spells it in lower case. */
export const TRIAGE_KEYS: Readonly<Record<TriageAction, string>> = { accept: 'a', reject: 'r' };

/** What 设置 › 键盘 calls each fixed card key. */
export const TRIAGE_KEY_NAMES: Readonly<Record<TriageAction, string>> = {
  accept: '接受（卡片有焦点时）',
  reject: '拒绝（卡片有焦点时）',
};

/** Where text is being entered: a key pressed there types, and never decides a card. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

interface TriageKeyEvent {
  readonly key: string;
  readonly target: EventTarget | null;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
}

/** Whether focus is in a field, a select or an editable region, where a key belongs to the text. */
export function inTextEntry(target: EventTarget | null): boolean {
  const node = target as { closest?: (selector: string) => unknown } | null;
  return typeof node?.closest === 'function' && node.closest(TEXT_ENTRY) !== null;
}

/**
 * The action a key press names on a focused card, or `null`: none while an input method composes, while a modifier is held
 * (Ctrl+A selects, Alt+R may be a menu) or while the press comes from text entry inside or outside the card.
 */
export function triageKeyAction(event: TriageKeyEvent): TriageAction | null {
  if (event.isComposing === true || event.keyCode === 229) return null;
  if (event.ctrlKey === true || event.altKey === true || event.metaKey === true) return null;
  if (inTextEntry(event.target)) return null;
  const key = event.key.toLowerCase();
  if (key === TRIAGE_KEYS.accept) return 'accept';
  if (key === TRIAGE_KEYS.reject) return 'reject';
  return null;
}

/** The key as 设置 › 键盘 shows it. */
export function triageKeyLabel(action: TriageAction): string {
  return TRIAGE_KEYS[action].toUpperCase();
}
