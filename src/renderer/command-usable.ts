import { BOOK_SECTION_COMMANDS } from './commands.js';

/**
 * Which commands do something on the screen the editor is on (#1522). The palette lists only these, decided before it paints and
 * not after the editor presses Enter: a command with no handler here, or whose shell entry is not on screen, is left out.
 */
export interface UsableScreen {
  /** A handler stands for the command (the dispatcher's own answer). */
  readonly has: (id: string) => boolean;
  /** The Book the window shows, whose own commands have something to act on, and whose entries come first. */
  readonly currentBookId: () => string | null;
  /** A Book's page is on screen, which is what 查看任务 opens a panel for. */
  readonly bookPage: () => boolean;
}

/** The shell entry a command presses, as its handler finds it: there and not disabled. A hidden sidebar (专注模式) does not take its commands away. */
export function commandEntry(selector: string): HTMLElement | null {
  const entry = document.querySelector<HTMLElement>(selector);
  return entry === null || entry.hasAttribute('disabled') || entry.getAttribute('aria-disabled') === 'true' ? null : entry;
}

const SECTION_OF = new Map<string, string>(BOOK_SECTION_COMMANDS.map(([id, , section]) => [id, section]));

/**
 * 返回 (Alt+←): the screen's own 返回 button when it has one; a settings page has none, so it goes back where the editor came from
 * (a Book, 待我处理, 交付物); anywhere else, to 书库.
 */
export function goBack(env: { readonly screen: ParentNode; readonly press: (selector: string) => void; readonly returnToOrigin: () => void }): void {
  if (env.screen.querySelector('[data-shortcut-command="nav.back"]') !== null) env.press('[data-shortcut-command="nav.back"]');
  else if (env.screen.querySelector('.settings-layout') !== null) env.returnToOrigin();
  else env.press('[data-nav-destination="library"]');
}

export function commandUsable(id: string, screen: UsableScreen): boolean {
  if (!screen.has(id)) return false;
  if (id === 'review.new' || id === 'evaluation.start') return screen.currentBookId() !== null;
  if (id === 'view.openTasks') return screen.bookPage();
  const section = SECTION_OF.get(id);
  if (section !== undefined) return screen.currentBookId() !== null && commandEntry(`[data-nav-book-section="${section}"]`) !== null;
  if (id.startsWith('nav.') && id !== 'nav.back' && id !== 'nav.settings') return commandEntry(`[data-nav-destination="${id.slice(4)}"]`) !== null;
  if (id === 'nav.settings') return commandEntry('[data-nav-settings]') !== null;
  return true;
}
