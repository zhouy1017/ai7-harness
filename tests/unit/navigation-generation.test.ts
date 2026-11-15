import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { navigation } from '../../src/renderer/navigation-generation.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Execute the private shell loaders, as the existing renderer composition tests do,
// without starting the application or replacing the production navigation code.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../../src/renderer/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['renderGlobalAgent', 'renderResolvedBookWorkbenchRoute', 'renderBookAnalysis', 'leaveThen', 'openTaskNotification'];
const declarations = source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
const program = ts.transpileModule(declarations.map((node) => node.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const procedureSource = ts.createSourceFile('procedure-library.ts', readFileSync(new URL('../../src/renderer/procedure-library.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const selectionDeclarations: string[] = [];
function visit(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && ['action', 'chooseBook'].includes(node.name.getText(procedureSource))) selectionDeclarations.push(`const ${node.getText(procedureSource)};`);
  ts.forEachChild(node, visit);
}
visit(procedureSource);
const selectionProgram = ts.transpileModule(selectionDeclarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); navigation.commit(); });
afterEach(() => restore());

function harness(api: object = {}) {
  const screen = document.createElement('main'); miniDocument.body.append(screen as unknown as MiniElement);
  const setStatus = vi.fn(), focus = vi.fn();
  const element = (tag: string, className?: string, text?: string) => {
    const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text;
    node.focus = focus; return node;
  };
  const replaceScreen = (state: string, node = element('section')) => { navigation.commit(); screen.dataset['screen'] = state; screen.replaceChildren(node); };
  const shell = { leaveBook: vi.fn() };
  const renderBookOverview = vi.fn((overview: { book: { bookId: string } }) => replaceScreen(overview.book.bookId));
  const renderBaselineAnalysis = vi.fn((host: HTMLElement) => host.append(element('p', '', '已读取分析')));
  const context = createContext({ navigation, window: { ai7: api }, document, screen, shell, setStatus,
    mountGlobalAgent: vi.fn(() => element('section')), replaceScreen, renderBookOverview, renderBaselineAnalysis,
    element, panel: () => element('section'), agentWorkspaceReturns: new WeakMap(), taskSurfaceRefresh: {},
    mountBackgroundAnalysis: vi.fn(), rendererErrorMessage: (_error: unknown, fallback: string) => fallback,
    settleScreen: vi.fn(async () => true), openGlobalAttentionTarget: vi.fn(),
    renderTaskOverview: vi.fn(), openOverviewTask: vi.fn(), openOverviewResult: vi.fn(),
  });
  runInContext(program, context);
  return { screen, setStatus, focus, shell, context, renderBookOverview, renderBaselineAnalysis, replaceScreen,
    run: (expression: string) => runInContext(expression, context) as Promise<void> };
}

it.each(['help', 'global-agent'])('keeps the latest destination when a global entry answers after %s opens', async (destination) => {
  const answer = Promise.withResolvers<void>();
  const page = harness({ leaveBookWorkbench: () => answer.promise });
  const pending = page.run('renderGlobalAgent()');
  page.replaceScreen(destination); page.setStatus.mockClear();
  answer.resolve(); await pending;
  expect(page.screen.dataset['screen']).toBe(destination);
  expect(page.shell.leaveBook).not.toHaveBeenCalled();
  expect(page.setStatus).not.toHaveBeenCalled(); expect(page.focus).not.toHaveBeenCalled();
});

it('ignores a tab loader after switching tabs, even if its old host is reattached', async () => {
  const answer = Promise.withResolvers<{ bookId: string }>();
  const page = harness({ inspectBaselineAnalysis: () => answer.promise });
  await page.run("renderBookAnalysis('book-a', '图书', undefined, {tab:'chapters'})");
  const old = page.screen.children[0]!;
  page.replaceScreen('book-evaluation'); page.screen.append(old); page.setStatus.mockClear();
  answer.resolve({ bookId: 'book-a' }); await Promise.resolve();
  expect(page.renderBaselineAnalysis).not.toHaveBeenCalled();
  expect(page.focus).not.toHaveBeenCalled(); expect(page.setStatus).not.toHaveBeenCalled();
  expect(page.screen.dataset['screen']).toBe('book-evaluation');
});

it('keeps the second Book when the first Book overview arrives last', async () => {
  const answer = Promise.withResolvers<object>();
  const page = harness({ getBookOverview: ({ bookId }: { bookId: string }) => bookId === 'book-a' ? answer.promise : Promise.resolve({ book: { bookId }, manuscriptAnchor: null }) });
  const pending = page.run("renderResolvedBookWorkbenchRoute({kind:'book',bookId:'book-a'})");
  navigation.begin();
  await page.run("renderResolvedBookWorkbenchRoute({kind:'book',bookId:'book-b'})");
  page.renderBookOverview.mockClear(); page.setStatus.mockClear();
  answer.resolve({ book: { bookId: 'book-a' }, manuscriptAnchor: null }); await pending;
  expect(page.screen.dataset['screen']).toBe('book-b');
  expect(page.renderBookOverview).not.toHaveBeenCalled();
  expect(page.focus).not.toHaveBeenCalled(); expect(page.setStatus).not.toHaveBeenCalled();
});

it.each(['refused', 'failed'] as const)('completes the surviving page when navigation is %s', async (outcome) => {
  const read = Promise.withResolvers<{ bookId: string }>(), leave = Promise.withResolvers<void>();
  const page = harness({ inspectBaselineAnalysis: () => read.promise, leaveBookWorkbench: () => leave.promise });
  await page.run("renderBookAnalysis('book-a', '图书')");
  let pending: Promise<void>;
  if (outcome === 'refused') {
    page.context['settleScreen'] = async () => { await leave.promise; return false; };
    pending = page.run('leaveThen(() => renderGlobalAgent())');
  } else pending = page.run('renderGlobalAgent()');
  read.resolve({ bookId: 'book-a' }); await Promise.resolve();
  if (outcome === 'refused') leave.resolve(); else leave.reject(new Error('unavailable'));
  await pending;
  expect(page.screen.dataset['screen']).toBe('book-analysis');
  expect(page.renderBaselineAnalysis).toHaveBeenCalledOnce();
  expect(page.screen.textContent).toContain('已读取分析');
});

it('drops a notification lookup superseded by another navigation intent', async () => {
  const answer = Promise.withResolvers<object>();
  const page = harness({ inspectTaskOverview: () => answer.promise });
  const pending = page.run("openTaskNotification('task', {kind:'analysis'})");
  navigation.begin();
  answer.resolve({ groups: [{ items: [{ itemId: 'task', state: 'running' }] }] }); await pending;
  expect(page.context['renderTaskOverview']).not.toHaveBeenCalled();
  expect(page.context['openOverviewTask']).not.toHaveBeenCalled();
  expect(page.focus).not.toHaveBeenCalled();
});

it('renders the global entry normally when the editor stays', async () => {
  const answer = Promise.withResolvers<void>(); const page = harness({ leaveBookWorkbench: () => answer.promise });
  const pending = page.run('renderGlobalAgent()'); answer.resolve(); await pending;
  expect(page.screen.dataset['screen']).toBe('global-agent'); expect(page.shell.leaveBook).toHaveBeenCalledOnce();
});

it.each(['success', 'failure'])('keeps the late procedure selection %s while suppressing only navigation', async (outcome) => {
  const answer = Promise.withResolvers<void>();
  const root = document.createElement('section'); miniDocument.body.append(root as unknown as MiniElement);
  const status = document.createElement('p'), openRun = vi.fn();
  let selected: unknown = null;
  const context = createContext({ page: navigation.read(root), formSlot: root, openRun,
    node: (tag: string, text?: string) => { const node = document.createElement(tag); node.textContent = text ?? ''; return node; },
    label: (_title: string, input: HTMLElement) => input, Option: function () { return document.createElement('option'); },
    showError: () => { status.textContent = '无法保存工序，请重试。'; },
    readBooks: async () => [{ bookId: 'book' }],
    api: { procedureLibrary: async (input: unknown) => { await answer.promise; selected = input; } },
  });
  runInContext(selectionProgram, context);
  await runInContext("chooseBook({document:{},executorKind:'review'}, {procedureId:'procedure',version:1,digest:'digest'}, 'book')", context);
  root.querySelector('button')!.click(); await Promise.resolve();
  root.remove(); navigation.commit();
  if (outcome === 'success') answer.resolve(); else answer.reject(new Error('selection unavailable'));
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  expect(openRun).not.toHaveBeenCalled();
  if (outcome === 'success') expect(selected).toMatchObject({ action: 'select', bookId: 'book', procedure: { procedureId: 'procedure', version: 1 } });
  else { expect(selected).toBeNull(); expect(status.textContent).toBe('无法保存工序，请重试。'); }
});
