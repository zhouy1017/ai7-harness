import { createContext, runInContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Renderer {
  evaluate(expression: string): Promise<unknown>;
}

// Journey modules sit outside the typed program. Run the same action used by J-07 against a
// small page whose publication and package projections become available independently.
const { openRemainingPackageExport } = (await import(
  new URL('../../e2e/package-export-readiness.mjs', import.meta.url).href
)) as { openRemainingPackageExport(renderer: Renderer): Promise<void> };

const PACKAGE_EXPORT = '[data-screen="book-deliverables"] ol.package-version-list > li[data-package-current="true"] [data-package-action="export"]';

class Button {
  disabled = false;
  clicks = 0;
  click(): void { this.clicks += 1; }
}

function restartedPage() {
  const publicationButton = new Button();
  const oldPackageButton = new Button();
  const page: { currentPackage: Button | null } = { currentPackage: null };
  const context = createContext({
    HTMLButtonElement: Button,
    document: {
      querySelector(selector: string) {
        if (selector === PACKAGE_EXPORT) return page.currentPackage;
        if (selector.includes('data-package-action')) return oldPackageButton;
        return publicationButton;
      },
    },
  });
  const renderer: Renderer = { evaluate: async (expression) => runInContext(expression, context) as unknown };
  return { page, renderer, publicationButton, oldPackageButton };
}

function observe(operation: Promise<void>) {
  const state: { result: 'pending' | 'opened' | 'failed'; error?: unknown } = { result: 'pending' };
  const settled = operation.then(
    () => { state.result = 'opened'; },
    (error: unknown) => { state.result = 'failed'; state.error = error; },
  );
  return { state, settled };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('J-07 package export after restart (Issue #639)', () => {
  it('waits for the current package even when publication and an older package are already actionable', async () => {
    const { page, renderer, publicationButton, oldPackageButton } = restartedPage();
    const opening = observe(openRemainingPackageExport(renderer));
    await vi.advanceTimersByTimeAsync(150);
    expect(opening.state.result).toBe('pending');
    expect(publicationButton.clicks).toBe(0);
    expect(oldPackageButton.clicks).toBe(0);

    const current = new Button();
    current.disabled = true;
    page.currentPackage = current;
    await vi.advanceTimersByTimeAsync(100);
    expect(opening.state.result).toBe('pending');
    expect(current.clicks).toBe(0);

    current.disabled = false;
    await vi.advanceTimersByTimeAsync(50);
    await opening.settled;
    expect(opening.state.result).toBe('opened');
    expect(current.clicks).toBe(1);
    expect(publicationButton.clicks + oldPackageButton.clicks).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails at the existing one-minute bound when the current export never becomes available', async () => {
    const { renderer, publicationButton, oldPackageButton } = restartedPage();
    const opening = observe(openRemainingPackageExport(renderer));
    await vi.advanceTimersByTimeAsync(59_950);
    expect(opening.state.result).toBe('pending');
    await vi.advanceTimersByTimeAsync(50);
    await opening.settled;
    expect(opening.state.error).toEqual(new Error('J-07/package-export-remaining-open'));
    expect(publicationButton.clicks + oldPackageButton.clicks).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('opens an already available current package exactly once without a timer', async () => {
    const { page, renderer } = restartedPage();
    page.currentPackage = new Button();
    await openRemainingPackageExport(renderer);
    expect(page.currentPackage.clicks).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates a renderer failure without retrying it', async () => {
    const error = new Error('J-07/renderer-cdp-response');
    const evaluate = vi.fn(async () => { throw error; });
    await expect(openRemainingPackageExport({ evaluate })).rejects.toBe(error);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
