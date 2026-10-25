import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Renderer {
  evaluate(expression: string): Promise<unknown>;
}

const { journeyCheckFailure, SIDEBAR, sidebarNavigate } = (await import(
  new URL('../../e2e/controller.mjs', import.meta.url).href
)) as {
  journeyCheckFailure(journey: string, label: string): Error;
  SIDEBAR: { destination(key: string): string };
  sidebarNavigate(selector: string): string;
};

// Execute J-15's actual post-restart statements, from the restart window to opening the Word Book, with the
// runner's own wait and click helpers. Importing the runner would launch Electron; extracting this boundary keeps
// the real call site, so a readiness wait that a later edit drops or reorders is caught here (Issue #1156 rev 2).
function reopenWordBookFromJourney(renderer: Renderer, bookId: string): Promise<void> {
  const source = ts.createSourceFile('run-j15.mjs', readFileSync(new URL('../../e2e/run-j15.mjs', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const awaitedCall = (node: ts.Node): ts.CallExpression | undefined => {
    const value = ts.isExpressionStatement(node) ? node.expression : undefined;
    const awaited = value !== undefined && ts.isBinaryExpression(value) ? value.right : value;
    return awaited !== undefined && ts.isAwaitExpression(awaited) && ts.isCallExpression(awaited.expression) ? awaited.expression : undefined;
  };
  const calls = (node: ts.Node, name: string, label: string): boolean => {
    const call = awaitedCall(node);
    return call !== undefined && ts.isIdentifier(call.expression) && call.expression.text === name &&
      call.arguments.some((argument) => ts.isStringLiteral(argument) && argument.text === label);
  };
  let statements: ts.Statement[] | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isBlock(node)) {
      const start = node.statements.findIndex((statement) => calls(statement, 'waitForRenderer', 'word-lineage-restart-window'));
      const end = node.statements.findIndex((statement) => calls(statement, 'clickBook', 'word-lineage-restart-book'));
      if (start >= 0 && end > start) statements = node.statements.slice(start, end + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (statements === undefined) throw new Error('J15 Word restart boundary missing');
  const helpers = source.statements.filter((node) => ts.isFunctionDeclaration(node) &&
    ['requireJourney', 'waitFor', 'waitForRenderer', 'assertRenderer', 'click', 'clickBook'].includes(node.name?.text ?? '')).map((node) => node.getText(source));
  const manager = { list: async () => [renderer] };
  return runInContext(`(async () => { let renderer; ${helpers.join('\n')} ${statements.map((statement) => statement.getText(source)).join('\n')} })()`,
    createContext({
      manager, journeyCheckFailure, SIDEBAR, sidebarNavigate, wordSignal: { source: { bookId } },
      setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay), Date: { now: () => Date.now() },
    })) as Promise<void>;
}

class Element {
  dataset: Record<string, string> = {};
  textContent = '';
  closest(): null { return null; }
  getAttribute(): null { return null; }
}

class Button extends Element {
  disabled = false;
  clicks = 0;
  constructor(text: string, private readonly action: () => void) { super(); this.textContent = text; }
  click(): void { this.clicks += 1; if (!this.disabled) this.action(); }
  querySelector(): { textContent: string } { return { textContent: '书库' }; }
}

class Landing extends Element {
  constructor(readonly books: readonly string[], readonly loadMore: Button | null) { super(); }
}

const PAGE = 20;
const LANDING_ITEMS = '[data-screen="landing"] .book-summary-item';

/**
 * The restarted library: page one is already on screen, 书库 replays startup (three IPC calls) before it renders page
 * one again, and 加载更多图书 renders the appended page after one call. `navigationLast` reproduces the hosted order:
 * the delayed navigation's page one lands right after the appended page, before any poll; otherwise it lands first.
 */
function restartedLibrary({ total, target, navigationLast, pagesHang = false, navigationHangs = false, loadMoreDisabled = false }: {
  total: number; target: number; navigationLast: boolean; pagesHang?: boolean; navigationHangs?: boolean; loadMoreDisabled?: boolean;
}) {
  const books = Array.from({ length: total }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  const screen: { dataset: Record<string, string>; firstElementChild: Landing } = { dataset: { screen: 'landing' }, firstElementChild: new Landing([], null) };
  const opened: string[] = [];
  const unexpected: string[] = [];
  let navigations = 0;
  let pendingNavigation: (() => void) | null = null;
  const render = (shown: readonly string[]): void => {
    const more = shown.length < books.length;
    const loadMore = more ? new Button('加载更多图书', () => {
      loadMore!.disabled = true;
      if (pagesHang) return;
      setTimeout(() => {
        render(books.slice(0, shown.length + PAGE));
        if (navigationLast) pendingNavigation?.();
      }, 10);
    }) : null;
    if (loadMore !== null) loadMore.disabled = loadMoreDisabled;
    screen.firstElementChild = new Landing(shown, loadMore);
  };
  const library = new Button('', () => {
    navigations += 1;
    if (navigationHangs) return;
    const timer = setTimeout(() => pendingNavigation?.(), navigationLast ? 1_000 : 100);
    pendingNavigation = () => { clearTimeout(timer); pendingNavigation = null; render(books.slice(0, PAGE)); };
  });
  library.dataset['navDestination'] = 'library';
  render(books.slice(0, PAGE));
  const document = {
    documentElement: { dataset: { ai7ProductReady: 'true' } },
    querySelector(selector: string) {
      if (selector === '[data-screen="landing"]') return screen.dataset['screen'] === 'landing' ? screen : null;
      if (selector === SIDEBAR.destination('library')) return library;
      const book = /^button\[data-book-id="([^"]+)"\]$/u.exec(selector)?.[1];
      if (book !== undefined) return screen.firstElementChild.books.includes(book) ? new Button('', () => { opened.push(book); }) : null;
      unexpected.push(selector);
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === LANDING_ITEMS) return screen.firstElementChild.books;
      if (selector === 'button') return screen.firstElementChild.loadMore === null ? [] : [screen.firstElementChild.loadMore];
      unexpected.push(selector);
      return [];
    },
  };
  const page = createContext({ document, HTMLElement: Element, HTMLButtonElement: Button });
  const renderer: Renderer = { evaluate: async (expression) => runInContext(expression, page) as unknown };
  return { renderer, bookId: books[target] ?? '00000000-0000-4000-8000-999999999999', opened, unexpected, navigations: () => navigations };
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

describe('J-15 Word lineage reopens its Book after restart (Issue #1156 rev 2)', () => {
  it.each([
    { order: 'navigation replaces the appended page (hosted order)', navigationLast: true },
    { order: 'navigation finishes first', navigationLast: false },
  ])('pages to the exact Book through 书库 when $order', async ({ navigationLast }) => {
    for (const target of [3, 27, 55]) {
      const library = restartedLibrary({ total: 60, target, navigationLast });
      const reopening = observe(reopenWordBookFromJourney(library.renderer, library.bookId));
      await vi.advanceTimersByTimeAsync(70_000);
      await reopening.settled;
      expect({ target, result: reopening.state.result, error: (reopening.state.error as Error | undefined)?.message })
        .toEqual({ target, result: 'opened', error: undefined });
      expect(library.opened).toEqual([library.bookId]);
      expect(library.navigations()).toBe(1);
      expect(library.unexpected).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it.each([
    { refusal: 'no Book is missing from the last page', options: { total: 45, target: 50 }, check: 'word-lineage-restart-more-books' },
    { refusal: '加载更多图书 stays disabled', options: { total: 45, target: 30, loadMoreDisabled: true }, check: 'word-lineage-restart-more-books' },
    { refusal: 'an appended page never grows the list', options: { total: 45, target: 30, pagesHang: true }, check: 'word-lineage-restart-next-books' },
    { refusal: 'the 书库 navigation never renders', options: { total: 45, target: 30, navigationHangs: true }, check: 'word-lineage-restart-ready' },
  ])('refuses when $refusal', async ({ options, check }) => {
    const library = restartedLibrary({ navigationLast: false, ...options });
    const reopening = observe(reopenWordBookFromJourney(library.renderer, library.bookId));
    await vi.advanceTimersByTimeAsync(130_000);
    await reopening.settled;
    expect(reopening.state.error).toEqual(new Error(`J-15/${check}`));
    expect(library.opened).toEqual([]);
    expect(library.unexpected).toEqual([]);
  });
});
