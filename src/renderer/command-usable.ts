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

/** A shell entry that is on screen and can be pressed; `null` when it is hidden, disabled or not there. */
export function shownEntry(selector: string): HTMLElement | null {
  const entry = document.querySelector<HTMLElement>(selector);
  if (entry === null || entry.hasAttribute('disabled') || entry.getAttribute('aria-disabled') === 'true') return null;
  return typeof entry.getClientRects !== 'function' || entry.getClientRects().length > 0 ? entry : null;
}

const SECTION_OF = new Map<string, string>(BOOK_SECTION_COMMANDS.map(([id, , section]) => [id, section]));

export function commandUsable(id: string, screen: UsableScreen): boolean {
  if (!screen.has(id)) return false;
  if (id === 'review.new' || id === 'evaluation.start') return screen.currentBookId() !== null;
  if (id === 'view.openTasks') return screen.bookPage();
  const section = SECTION_OF.get(id);
  if (section !== undefined) return shownEntry(`[data-nav-book-section="${section}"]`) !== null;
  if (id.startsWith('nav.') && id !== 'nav.back' && id !== 'nav.settings') return shownEntry(`[data-nav-destination="${id.slice(4)}"]`) !== null;
  if (id === 'nav.settings') return shownEntry('[data-nav-settings]') !== null;
  return true;
}
