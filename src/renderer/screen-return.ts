export const RETURN_SCREENS = new Set(['data-storage', 'quality-learning', 'knowledge-base', 'model-service', 'series-list', 'series', 'evaluation-calibration']);

type Restore = () => void | Promise<void>;

/** Redrawing a screen preserves its origin; a nested destination remembers the screen it was opened from. */
export class ScreenReturnHistory {
  #current = '';
  #origins = new Map<string, Restore>();
  #returning = false;

  #key(screen: string): string { return screen === 'series' ? 'series-list' : screen; }

  enter(screen: string, restorePrevious: Restore): void {
    const key = this.#key(screen);
    if (!this.#returning && RETURN_SCREENS.has(screen) && key !== this.#key(this.#current)) this.#origins.set(key, restorePrevious);
    this.#current = screen;
    this.#returning = false;
  }

  async back(screen: string, fallback: Restore): Promise<void> {
    const restore = this.#origins.get(this.#key(screen)) ?? fallback;
    this.#returning = true;
    await restore();
  }
}
