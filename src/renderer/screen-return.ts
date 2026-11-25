import type { ShellBookSection } from '../shared/preferences.js';

/** 帮助 and every page of 设置, and the global destinations with a 返回: each goes back to the page it was opened from. */
export const RETURN_SCREENS = new Set([
  'model-service', 'usage', 'usage-run', 'evaluation-calibration', 'data-storage', 'appearance', 'keyboard', 'notifications', 'diagnostics', 'help',
  'quality-learning', 'knowledge-base', 'series-list', 'series',
]);

/** The Book tab a Book screen sits on: where 返回 opens the Book again when the screen has no way back of its own. */
export const BOOK_SCREEN_SECTIONS: Readonly<Record<string, ShellBookSection>> = Object.freeze({
  'book-overview': 'overview',
  imported: 'overview',
  'book-analysis': 'analysis',
  'book-review': 'review',
  'book-evaluation': 'evaluation',
  'book-deliverables': 'deliverables',
  'book-derivatives': 'derivatives',
  'book-findings': 'findings',
  'book-sources': 'sources',
});

type Restore = () => void | Promise<void>;
const DETAIL_OF: Readonly<Record<string, string>> = { series: 'series-list', 'usage-run': 'usage' };

/**
 * Redrawing a screen preserves its origin; a nested destination remembers the screen it was opened from. The origins are a
 * trail: a page opened again while it is already on the trail keeps the origin it first had and drops what was opened after
 * it, so two settings pages visited back and forth never trade origins and 返回 always reaches the page the editor came from.
 */
export class ScreenReturnHistory {
  #current = '';
  #trail: Array<{ key: string; restore: Restore }> = [];
  #returning = false;

  #key(screen: string): string { return DETAIL_OF[screen] ?? screen; }

  enter(screen: string, restorePrevious: Restore): void {
    const key = this.#key(screen);
    if (!this.#returning && key !== this.#key(this.#current)) {
      const held = this.#trail.findIndex((entry) => entry.key === key);
      // Any other page starts a new trail: nothing opened before it is a way back any more.
      if (!RETURN_SCREENS.has(screen)) this.#trail = [];
      else if (held >= 0) this.#trail.length = held + 1;
      else this.#trail.push({ key, restore: restorePrevious });
    }
    this.#current = screen;
    this.#returning = false;
  }

  async back(screen: string, fallback: Restore): Promise<void> {
    const held = this.#trail.findIndex((entry) => entry.key === this.#key(screen));
    const restore = held >= 0 ? this.#trail[held]!.restore : fallback;
    if (held >= 0) this.#trail.length = held;
    this.#returning = true;
    await restore();
  }
}
