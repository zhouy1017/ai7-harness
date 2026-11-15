import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { navigation } from '../../src/renderer/navigation-generation.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Execute the private shell loaders, as the existing renderer composition tests do,
// without starting the application or replacing the production navigation code.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../../src/renderer/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['renderGlobalAgent', 'renderResolvedBookWorkbenchRoute', 'renderBookAnalysis', 'leaveThen', 'openTaskNotification', 'replaceScreen', 'openBookSection', 'requestBookWorkbenchRoute', 'leaveCurrentBookWorkbench', 'waitForBookWorkbenchLeave', 'retainBookWorkbenchAfterLeave', 'navigate', 'deferBookNavigation', 'openEditorWindow', 'renderBookManuscript', 'openGlobalAttentionTarget', 'renderBookEvaluation', 'agentWorkspaceReturn'];
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
  Object.defineProperty(screen, 'firstElementChild', {get:()=>screen.children[0]??null});
  const setStatus = vi.fn(), focus = vi.fn();
  const element = (tag: string, className?: string, text?: string) => {
    const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text;
    node.focus = focus; return node;
  };
  let context: ReturnType<typeof createContext>;
  const replaceScreen = (state: string, node = element('section'), intent = true) => {
    if (intent) navigation.begin();
    context['replacement'] = node;
    runInContext(`replaceScreen(${JSON.stringify(state)}, replacement)`, context);
  };
  const shell = { leaveBook: vi.fn(), follow: vi.fn() };
  const renderBookOverview = vi.fn((overview: { book: { bookId: string } }) => replaceScreen(overview.book.bookId, undefined, false));
  const renderBaselineAnalysis = vi.fn((host: HTMLElement) => host.append(element('p', '', '已读取分析')));
  context = createContext({ navigation, window: { ai7: api }, document, screen, shell, setStatus,
    mountGlobalAgent: vi.fn(() => element('section')), renderBookOverview, renderBaselineAnalysis,
    HTMLElement, SETTINGS_HUB_GROUPS: [], overviewDrawerBookId: null, screenReturns: {enter: vi.fn()},
    restoreCurrentScreen: vi.fn(), currentRecoveryReturn: () => undefined, recoveryReturnContexts: new WeakMap(),
    manuscriptOnScreen: null, taskResultWindow: null, authorityInterrupted: false, keyboardSettingsOff: undefined,
    reviewWorkspace: undefined, deliverablesSurface: undefined, derivativesSurface: undefined, proposalWorkspaceSurface: undefined,
    agentWorkspaceSurface: undefined, proposalConflictSurface: undefined, globalAttentionSurface: undefined, taskOverviewSurface: undefined,
    leaveGuard: null, pendingBookWorkbenchLeave: null, taskDrawer: {followScreen: vi.fn()}, globalAttentionReader: {refresh: vi.fn()}, refreshCommandEntries: vi.fn(),
    SHELL_LABELS: {openingBook:'正在打开图书',bookUnavailable:'无法打开图书'},
    renderBookReview: vi.fn(() => replaceScreen('book-review', undefined, false)),
    element, panel: () => element('section'), agentWorkspaceReturns: new WeakMap(), taskSurfaceRefresh: {},
    mountBackgroundAnalysis: vi.fn(), rendererErrorMessage: (_error: unknown, fallback: string) => fallback,
    settleScreen: vi.fn(async () => true),
    AGENT_WORKSPACE_RETURN_SECTIONS: {},
    renderEditorWindow: vi.fn(() => replaceScreen('editor', undefined, false)),
    mountEvaluation: vi.fn((options) => {context['evaluationOptions']=options;return {load:async()=>undefined,refresh:vi.fn()};}),
    technicalDetails: vi.fn(), awaitServiceJob: vi.fn(), openTaskPlan: vi.fn(),
    EVALUATION_STATUS: {loading:'正在读取评估',opened:'评估已打开',unavailable:'无法读取评估'},
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
  page.replaceScreen(destination); const showing=page.screen.firstElementChild; page.setStatus.mockClear();
  answer.resolve(); await pending;
  expect(page.screen.dataset['screen']).toBe(destination);
  expect(page.screen.firstElementChild).toBe(showing);
  expect(page.shell.leaveBook).toHaveBeenCalledOnce();
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
  if (outcome === 'failed') await expect(pending).rejects.toThrow('unavailable'); else await pending;
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
  const context = createContext({ navigation, page: navigation.read(root), formSlot: root, openRun,
    node: (tag: string, text?: string) => { const node = document.createElement(tag); node.textContent = text ?? ''; return node; },
    label: (_title: string, input: HTMLElement) => input, Option: function () { return document.createElement('option'); },
    showError: () => { status.textContent = '无法保存工序，请重试。'; },
    readBooks: async () => [{ bookId: 'book' }],
    api: { procedureLibrary: async (input: unknown) => { await answer.promise; selected = input; } },
  });
  runInContext(selectionProgram, context);
  await runInContext("chooseBook({document:{},executorKind:'review'}, {procedureId:'procedure',version:1,digest:'digest'}, 'book')", context);
  root.querySelector('button')!.click(); await Promise.resolve();
  navigation.begin(); // A newer intent is pending: the original page is still attached.
  if (outcome === 'success') answer.resolve(); else answer.reject(new Error('selection unavailable'));
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  expect(openRun).not.toHaveBeenCalled();
  if (outcome === 'success') expect(selected).toMatchObject({ action: 'select', bookId: 'book', procedure: { procedureId: 'procedure', version: 1 } });
  else { expect(selected).toBeNull(); expect(status.textContent).toBe('无法保存工序，请重试。'); }
});


it('a real same-page replaceScreen repaint preserves the pending next navigation', async () => {
  const leave = Promise.withResolvers<void>();
  const page = harness({leaveBookWorkbench: () => leave.promise});
  page.replaceScreen('model-service');
  const pending = page.run('renderGlobalAgent()');
  page.replaceScreen('model-service', undefined, false);
  leave.resolve(); await pending;
  expect(page.screen.dataset['screen']).toBe('global-agent');
});

it.each(['leave-first','book-first'])('keeps the rendered Book usable across a pending leave (%s)', async (order) => {
  const leave = Promise.withResolvers<void>(), routeRead = Promise.withResolvers<object>(), routeStarted=Promise.withResolvers<void>();
  let reads=0; let owned: string | null = 'book-a'; const calls: string[] = [];
  const page = harness({
    leaveBookWorkbench: async () => {calls.push('leave'); await leave.promise; owned=null; calls.push('left');},
    getBookWorkbenchRoute: async () => {calls.push('route'); reads+=1; routeStarted.resolve(); return order==='book-first' && reads===1 ? routeRead.promise : owned ? {kind:'book',bookId:owned,bookTitle:'图书'} : null;},
    openBookWorkbench: async (route: {bookId:string}) => {calls.push('open'); owned=route.bookId; return {target:'requesting-window',route:{...route,bookTitle:'图书'}};},
  });
  page.replaceScreen('book-review');
  let first: Promise<void>, second: Promise<void>;
  if(order==='leave-first') {
    first=page.run('renderGlobalAgent()'); second=page.run("openBookSection({bookId:'book-a',title:'图书'},'review')");
  } else {
    first=page.run("openBookSection({bookId:'book-a',title:'图书'},'review')"); await routeStarted.promise; second=page.run('renderGlobalAgent()');
    routeRead.resolve({kind:'book',bookId:'book-a',bookTitle:'图书'});
  }
  await Promise.resolve(); await Promise.resolve(); leave.resolve(); await Promise.all([first,second]);
  if(order==='leave-first') {expect(page.screen.dataset['screen']).toBe('book-review'); expect(owned).toBe('book-a'); expect(calls).toEqual(['leave','left','route','open']);}
  else {expect(page.screen.dataset['screen']).toBe('global-agent'); expect(owned).toBeNull(); expect(calls).toEqual(['route','leave','left']); await page.run("openBookSection({bookId:'book-a',title:'图书'},'review')");}
  const scopedRead=()=>{if(owned!=='book-a') throw new Error('AI7_EDITOR_ROUTE_INVALID'); return 'usable';};
  expect(page.screen.dataset['screen']).toBe('book-review'); expect(scopedRead()).toBe('usable');
});

it('a late evaluation draft read cannot replace the newer tab', async () => {
  const read=Promise.withResolvers<object>(); const page=harness({getManuscriptWindow:()=>read.promise});
  await page.run("renderBookEvaluation('book-a','图书')");
  const options=page.context['evaluationOptions'] as {openDraft(input:object):Promise<void>};
  const pending=options.openDraft({document:{documentId:'document',branchId:'branch'},typeId:'type',typeLabel:'稿件'});
  await Promise.resolve(); page.replaceScreen('knowledge-base');
  read.resolve({bookId:'book-a'}); await pending;
  expect(page.context['renderEditorWindow']).not.toHaveBeenCalled();
  expect(page.screen.dataset['screen']).toBe('knowledge-base');
});

it('a late writing task-plan read cannot open the drawer over a newer destination', async () => {
  const read=Promise.withResolvers<object>(); const page=harness({
    openBookWorkbench:async()=>({target:'requesting-window',route:{kind:'book',bookId:'book-a',bookTitle:'图书'}}),
    getBookOverview:()=>read.promise,
  });
  const pending=page.run("openGlobalAttentionTarget({kind:'task-plan',bookId:'book-a',taskKind:'writing',ref:'task'})");
  for(let i=0;i<6;i+=1) await Promise.resolve();
  page.replaceScreen('knowledge-base'); read.resolve({book:{bookId:'book-a'},manuscriptAnchor:null}); await pending;
  expect(page.context['openTaskPlan']).not.toHaveBeenCalled();
  expect(page.screen.dataset['screen']).toBe('knowledge-base');
});

it('a late Agent workspace return cannot replace Knowledge', async () => {
  const read=Promise.withResolvers<object>(); const started=Promise.withResolvers<void>();
  const page=harness({getManuscriptWindowAt:()=>{started.resolve();return read.promise;}});
  const editor=document.createElement('section'); editor.dataset['bookId']='book-a'; page.replaceScreen('editor',editor);
  page.context['manuscriptOnScreen']={readingPlace:()=>({manuscriptId:'manuscript',branchId:'branch',blockId:'block'})};
  const back=runInContext("agentWorkspaceReturn('book-a','图书')",page.context) as ()=>void;
  page.context['manuscriptOnScreen']=null; back(); await started.promise;
  page.replaceScreen('knowledge-base'); read.resolve({bookId:'book-a'});
  for(let i=0;i<8;i+=1) await Promise.resolve();
  expect(page.context['renderEditorWindow']).not.toHaveBeenCalled();
});

it('a superseded Book read failure does not reject into the next page status handler', async () => {
  const read=Promise.withResolvers<object>(); const started=Promise.withResolvers<void>();
  const page=harness({openBookWorkbench:async()=>({target:'requesting-window',route:{kind:'book',bookId:'book-a'}}),
    getBookOverview:()=>{started.resolve();return read.promise;}});
  const pending=page.run("requestBookWorkbenchRoute({kind:'book',bookId:'book-a'})"); await started.promise;
  page.replaceScreen('knowledge-base'); page.setStatus.mockClear(); read.reject(new Error('late read'));
  await expect(pending).resolves.toBeUndefined(); expect(page.setStatus).not.toHaveBeenCalled();
});

it('a direct manuscript entry supersedes an earlier pending global entry', async () => {
  const leave=Promise.withResolvers<void>(); const page=harness({leaveBookWorkbench:()=>leave.promise,
    openBookWorkbench:async()=>({target:'requesting-window'}), getBookOverview:async()=>({book:{bookId:'book-a'},manuscriptAnchor:null})});
  const earlier=page.run('renderGlobalAgent()');
  const later=page.run("renderResolvedBookWorkbenchRoute({kind:'book',bookId:'book-a'})");
  leave.resolve(); await Promise.all([earlier,later]);
  expect(page.screen.dataset['screen']).toBe('book-a');
});


it('a current writing task-plan still opens its drawer', async () => {
 const page=harness({openBookWorkbench:async()=>({target:'requesting-window',route:{kind:'book',bookId:'book-a',bookTitle:'图书'}}),
 getBookOverview:async()=>({book:{bookId:'book-a'},manuscriptAnchor:null})});
 await page.run("openGlobalAttentionTarget({kind:'task-plan',bookId:'book-a',taskKind:'writing',ref:'task'})");
 expect(page.context['openTaskPlan']).toHaveBeenCalledWith('book-a','writing','task');
});

it('direct openEditorWindow begins a newer intent before waiting for its context', async () => {
 const leave=Promise.withResolvers<void>(); const page=harness({leaveBookWorkbench:()=>leave.promise,openBookWorkbench:async()=>({target:'requesting-window'})});
 const first=page.run('renderGlobalAgent()'); const next=page.run("openEditorWindow({bookId:'book-a',deliverable:'manuscript'},'图书')");
 leave.resolve(); await Promise.all([first,next]); expect(page.screen.dataset['screen']).toBe('editor');
});
