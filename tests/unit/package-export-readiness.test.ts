import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Renderer {
  evaluate(expression: string): Promise<unknown>;
}

// Journey modules sit outside the typed program. Run the same action used by J-07 against a
// small page whose publication and package projections become available independently.
const readiness = (await import(
  new URL('../../e2e/package-export-readiness.mjs', import.meta.url).href
)) as { openRemainingPackageExport(renderer: Renderer): Promise<void> };
const { openRemainingPackageExport } = readiness;
const { journeyCheckFailure } = (await import(
  new URL('../../e2e/controller.mjs', import.meta.url).href
)) as { journeyCheckFailure(journey: string, label: string): Error };

// Execute the actual statement after the archive relaunch, including its original click helpers.
// Importing the full runner would launch Electron; extracting this boundary also catches a caller
// that bypasses the shared readiness helper while the helper's own tests still pass.
function openArchiveFromJourney(renderer: Renderer): Promise<void> {
  const source = ts.createSourceFile('run-j07.mjs', readFileSync(new URL('../../e2e/run-j07.mjs', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let packageAction: ts.VariableStatement | undefined;
  let action: ts.Statement | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === 'packageAction')) packageAction = node;
    if (ts.isExpressionStatement(node) && ts.isAwaitExpression(node.expression) && ts.isCallExpression(node.expression.expression)) {
      const call = node.expression.expression;
      if (ts.isIdentifier(call.expression) && call.expression.text === 'reopenDeliverables' &&
        call.arguments.some((argument) => ts.isStringLiteral(argument) && argument.text === 'package-archive') && ts.isBlock(node.parent)) {
        action = node.parent.statements[node.parent.statements.indexOf(node) + 1];
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (packageAction === undefined || action === undefined) throw new Error('J07 archive action boundary missing');
  const helpers = source.statements.filter((node) => ts.isFunctionDeclaration(node) &&
    ['requireJourney', 'assertRenderer', 'clickSelector'].includes(node.name?.text ?? '')).map((node) => node.getText(source));
  return runInContext(`(async () => { ${helpers.join('\n')} ${packageAction.getText(source)} ${action.getText(source)} })()`,
    createContext({ renderer, journeyCheckFailure, ...readiness })) as Promise<void>;
}

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

describe.each([
  { route: 'folder', open: openRemainingPackageExport, marker: 'package-export-remaining-open' },
  { route: 'archive (actual J07 action)', open: openArchiveFromJourney, marker: 'package-archive-open' },
])('J-07 $route export after restart (Issues #639, #1044)', ({ open, marker }) => {
  it('waits for the current package even when publication and an older package are already actionable', async () => {
    const { page, renderer, publicationButton, oldPackageButton } = restartedPage();
    const opening = observe(open(renderer));
    await vi.advanceTimersByTimeAsync(150);
    expect(opening.state).toEqual({ result: 'pending' });
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

  it.each(['absent', 'disabled'] as const)('fails at the existing one-minute bound when the current export stays %s', async (state) => {
    const { page, renderer, publicationButton, oldPackageButton } = restartedPage();
    if (state === 'disabled') {
      page.currentPackage = new Button();
      page.currentPackage.disabled = true;
    }
    const opening = observe(open(renderer));
    await vi.advanceTimersByTimeAsync(59_950);
    expect(opening.state.result).toBe('pending');
    await vi.advanceTimersByTimeAsync(50);
    await opening.settled;
    expect(opening.state.error).toEqual(new Error(`J-07/${marker}`));
    expect(publicationButton.clicks + oldPackageButton.clicks).toBe(0);
    expect(page.currentPackage?.clicks ?? 0).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('opens an already available current package exactly once without a timer', async () => {
    const { page, renderer } = restartedPage();
    page.currentPackage = new Button();
    await open(renderer);
    expect(page.currentPackage.clicks).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates a renderer failure without retrying it', async () => {
    const error = new Error('J-07/renderer-cdp-response');
    const evaluate = vi.fn(async () => { throw error; });
    await expect(open({ evaluate })).rejects.toBe(error);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
